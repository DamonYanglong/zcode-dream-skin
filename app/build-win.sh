#!/bin/bash
#
# zcode-dream-skin/app/build-win.sh
# 组装 Windows 分发 zip：engine（scripts+themes）+ 托盘脚本 + 说明。
# 产物：dist/ZCodeDreamSkin-win-v<ver>.zip（在 WSL/Linux/macOS 上即可打包）
#
set -Eeuo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd -P)"
VERSION="${ZDS_APP_VERSION:-1.1.0}"
BUILD="$REPO/build"
DIST="$REPO/dist"
STAGE="$BUILD/win-root/ZCodeDreamSkin"

rm -rf "$BUILD/win-root"
mkdir -p "$STAGE/engine" "$DIST"

# engine 取「已跟踪文件的工作树版本」（与 build-app.sh 同一套防呆：避免打进旧脚本）
ARCHIVE="$BUILD/win-archive"
rm -rf "$ARCHIVE" && mkdir -p "$ARCHIVE"
cd "$REPO" && git ls-files -z | rsync -a --from0 --files-from=- -- . "$ARCHIVE/" && cd "$REPO"
mv "$ARCHIVE/scripts" "$STAGE/engine/scripts"
mv "$ARCHIVE/themes" "$STAGE/engine/themes"
rm -rf "$ARCHIVE"

cp "$REPO/app/win/tray.ps1" "$REPO/app/win/launch-tray.vbs" "$STAGE/"
cp "$REPO/app/win/install.ps1" "$REPO/app/win/install.cmd" "$STAGE/"
cp "$REPO/app/win/restore-official.ps1" "$REPO/app/win/restore-official.vbs" "$STAGE/"
cp "$REPO/app/win/uninstall.ps1" "$REPO/app/win/kill-tray.ps1" "$STAGE/"
cp "$REPO/app/win/README-win.txt" "$STAGE/"
cp "$REPO/LICENSE" "$REPO/NOTICE.md" "$STAGE/"

# 安装器资产：应用图标（纯 python 生成多尺寸 ICO，免提交二进制进仓库）+ 简体中文语言包（vendored）
ZDS_STAGE="$STAGE" python3 - <<'PYICO'
import os, struct

def make_entry(size):
    w = h = size
    rect1, rect2, bg = bytes((255, 92, 124, 255)), bytes((80, 176, 255, 255)), bytes(4)
    x1, y1, rw1 = 0, round(h*0.1875), round(w*0.5)
    x2, y2, rw2 = round(w*0.375), round(h*0.1875), round(w*0.625)
    rh = round(h*0.625)
    xor = b"".join(
        b"".join(rect2 if x2 <= x < x2+rw2 and y2 <= y < y2+rh
                 else rect1 if x1 <= x < x1+rw1 and y1 <= y < y1+rh
                 else bg for x in range(w))
        for y in range(h-1, -1, -1))  # 自底向上
    and_mask = b"\x00" * (((w + 31)//32)*4) * h
    bih = struct.pack("<IiiHHIIiiII", 40, w, h*2, 1, 32, 0, len(xor)+len(and_mask), 0, 0, 0, 0)
    return bih + xor + and_mask

images = [(s, make_entry(s)) for s in (16, 32, 48)]
count = len(images)
offset = 6 + 16*count
entries, data = b"", b""
for s, blob in images:
    entries += struct.pack("<BBBBHHII", s, s, 0, 0, 1, 32, len(blob), offset)
    data += blob
    offset += len(blob)
open(os.path.join(os.environ["ZDS_STAGE"], "app.ico"), "wb").write(struct.pack("<HHH", 0, 1, count) + entries + data)
PYICO
mkdir -p "$STAGE/languages"
cp "$REPO/app/win/installer/languages/"* "$STAGE/languages/"

# ---------- 捆绑 node 运行时（对齐 Codex Dream Skin：安装包自带运行时，用户免装 node） ----------
# ZDS_NO_BUNDLED_NODE=1 跳过（此时安装器会在装时下载便携版兜底）
if [ "${ZDS_NO_BUNDLED_NODE:-0}" != "1" ]; then
  NODE_VER="${ZDS_NODE_VERSION:-22.23.2}"
  NODE_ARCH="${ZDS_NODE_ARCH:-x64}"
  CACHE="$REPO/build/node-cache/node-v$NODE_VER-win-$NODE_ARCH.zip"
  mkdir -p "$(dirname "$CACHE")"
  if [ ! -f "$CACHE" ]; then
    echo "[zds] 下载 node v$NODE_VER win-$NODE_ARCH（约 30MB，缓存于 build/node-cache/）..."
    curl -fL --retry 3 -o "$CACHE" "https://nodejs.org/dist/v$NODE_VER/node-v$NODE_VER-win-$NODE_ARCH.zip"
  fi
  mkdir -p "$STAGE/runtime"
  # 只取 node.exe：跑 .mjs 不需要 npm/其余发行内容
  unzip -o -j "$CACHE" "node-v$NODE_VER-win-$NODE_ARCH/node.exe" -d "$STAGE/runtime" >/dev/null
  test -f "$STAGE/runtime/node.exe" || { echo "[zds] node.exe 解包失败" >&2; exit 1; }
fi
# 引擎脚本需要可执行位以外的无特殊要求；zip 不保留权限，Windows 上由 node 直接执行

OUT="$DIST/ZCodeDreamSkin-win-v$VERSION.zip"
# WSL 里未必有 zip 命令，python3 的 zipfile 最稳
python3 - "$STAGE" "$OUT" <<'PY'
import os, sys, zipfile
stage, out = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk(stage):
        for f in files:
            full = os.path.join(root, f)
            z.write(full, os.path.relpath(full, stage))
PY

# ---------- Inno Setup 编译单文件 Setup.exe（需 Windows 侧 ISCC，经 WSL interop 调用） ----------
ISCC_WIN=""
for c in \
  "/mnt/c/Users/$USER/AppData/Local/Programs/Inno Setup 6/ISCC.exe" \
  "/mnt/c/Program Files (x86)/Inno Setup 6/ISCC.exe" \
  "/mnt/c/Program Files/Inno Setup 6/ISCC.exe"; do
  [ -f "$c" ] && ISCC_WIN=$(wslpath -w "$c") && break
done
if [ -n "$ISCC_WIN" ] && command -v powershell.exe >/dev/null 2>&1; then
  WIN_TMP_WIN=$(powershell.exe -NoProfile -Command '$env:TEMP' | tr -d '\r')
  WIN_TMP=$(wslpath -u "$WIN_TMP_WIN")
  SETUP_STAGE="$WIN_TMP/zds-iss-stage"
  rm -rf "$SETUP_STAGE"
  mkdir -p "$SETUP_STAGE"
  cp -r "$STAGE/." "$SETUP_STAGE/"
  cp "$REPO/app/win/installer/zds.iss" "$SETUP_STAGE/../zds.iss"
  ISS_WIN=$(wslpath -w "$WIN_TMP/zds.iss")
  STAGE_WIN=$(wslpath -w "$SETUP_STAGE")
  OUTEXE_WIN="$WIN_TMP_WIN\\ZCodeDreamSkin-Setup-v$VERSION.exe"
  echo "[zds] ISCC 编译 Setup.exe ..."
  powershell.exe -NoProfile -Command "& '$ISCC_WIN' '/DAppVersion=$VERSION' '/DStageRoot=$STAGE_WIN' '/DOutputDir=$WIN_TMP_WIN' '$ISS_WIN'" | tr -d '\r' | grep -E "Successful|Error|Exception" || true
  if [ -f "$WIN_TMP/ZCodeDreamSkin-Setup-v$VERSION.exe" ]; then
    cp "$WIN_TMP/ZCodeDreamSkin-Setup-v$VERSION.exe" "$DIST/"
    rm -rf "$SETUP_STAGE" "$WIN_TMP/zds.iss" "$WIN_TMP/ZCodeDreamSkin-Setup-v$VERSION.exe"
    echo "[zds] Setup.exe 已生成：dist/ZCodeDreamSkin-Setup-v$VERSION.exe"
  else
    echo "[zds] ⚠ ISCC 编译未产出 Setup.exe（跳过；zip 仍可用）" >&2
  fi
else
  echo "[zds] ⚠ 未找到 ISCC.exe 或无 interop，跳过 Setup.exe（只出 zip）"
fi

echo "[zds] Windows 包已生成："
echo "  $OUT"
unzip -l "$OUT" 2>/dev/null || python3 -c "import zipfile,sys; [print(f'{i.file_size:>9}  {i.filename}') for i in zipfile.ZipFile(sys.argv[1]).infolist()]" "$OUT"
