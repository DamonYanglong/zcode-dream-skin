#!/bin/bash
#
# zcode-dream-skin/scripts/start-themed.sh
# 以回环调试端口启动 ZCode 并注入当前主题。
# 用法: ./start-themed.sh [--theme <id>] [--port <1024-65535>]
#
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
ZCODE_APP="ZCode"
PORT="${ZDS_PORT:-9342}"
THEME="${ZDS_THEME:-gothic-void-crusade}"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --port) PORT="${2:?}"; shift 2 ;;
    --theme) THEME="${2:?}"; shift 2 ;;
    *) echo "未知参数: $1" >&2; exit 1 ;;
  esac
done

cdp_alive() {
  curl -fsS --max-time 2 "http://127.0.0.1:${PORT}/json/version" >/dev/null 2>&1
}

wait_cdp() {
  for _ in $(seq 1 60); do
    cdp_alive && return 0
    sleep 0.5
  done
  return 1
}

if cdp_alive; then
  echo "[zds] 调试端口 ${PORT} 已就绪，直接注入主题。"
elif pgrep -x "ZCode" >/dev/null; then
  echo "[zds] ZCode 正在运行但没有调试端口。" >&2
  echo "[zds] 注入需要以 --remote-debugging-port 重启 ZCode；请先手动退出 ZCode 再运行本脚本。" >&2
  exit 2
else
  echo "[zds] 以调试端口 ${PORT} 启动 ZCode ..."
  /usr/bin/open -a "$ZCODE_APP" --args --remote-debugging-port="$PORT"
  if ! wait_cdp; then
    echo "[zds] 等待 CDP 端口超时（30s）。ZCode 可能不透传该开关，请提 issue。" >&2
    exit 3
  fi
  echo "[zds] CDP 端口就绪。"
fi

exec node "$SCRIPT_DIR/apply.mjs" --port "$PORT" --theme "$THEME"
