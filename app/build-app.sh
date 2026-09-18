#!/bin/bash
#
# zcode-dream-skin/app/build-app.sh
# 编译菜单栏程序、组装 .app bundle（内含 engine）、打 DMG。
# 产物：build/ZCode Dream Skin.app 与 dist/ZCodeDreamSkin-v<ver>.dmg
#
set -Eeuo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd -P)"
APP_NAME="ZCode Dream Skin"
EXEC_NAME="ZCodeDreamSkinMenuBar"
BUNDLE_ID="dev.damon.zcode-dream-skin"
VERSION="${ZDS_APP_VERSION:-1.0.0}"
BUILD="$REPO/build"
DIST="$REPO/dist"
APP="$BUILD/$APP_NAME.app"

rm -rf "$APP" "$DIST"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources" "$DIST"

echo "[1/4] 编译 Swift 菜单栏程序 ..."
/usr/bin/swiftc -O -swift-version 5 -o "$APP/Contents/MacOS/$EXEC_NAME" "$REPO/app/main.swift"

echo "[2/4] 组装 app bundle ..."
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key><string>zh_CN</string>
  <key>CFBundleDisplayName</key><string>$APP_NAME</string>
  <key>CFBundleExecutable</key><string>$EXEC_NAME</string>
  <key>CFBundleIdentifier</key><string>$BUNDLE_ID</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>CFBundleName</key><string>$APP_NAME</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleVersion</key><string>$VERSION</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>LSMultipleInstancesProhibited</key><true/>
  <key>LSUIElement</key><true/>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST

# engine 只取已提交内容（git archive 天然排除 .gitignore 的受限素材）：
# 结构 Resources/engine/{scripts,themes}，README/LICENSE/NOTICE 放 Resources 根
ARCHIVE="$BUILD/archive"
mkdir -p "$ARCHIVE"
git -C "$REPO" archive HEAD | tar -x -C "$ARCHIVE"
mkdir -p "$APP/Contents/Resources/engine"
mv "$ARCHIVE/scripts" "$APP/Contents/Resources/engine/scripts"
mv "$ARCHIVE/themes" "$APP/Contents/Resources/engine/themes"
cp "$ARCHIVE/README.md" "$ARCHIVE/LICENSE" "$ARCHIVE/NOTICE.md" "$APP/Contents/Resources/"
rm -rf "$ARCHIVE"

# ad-hoc 签名（无开发者证书的本地可运行；分发需用户右键打开绕 Gatekeeper）
/usr/bin/codesign --force --sign - "$APP"

echo "[3/4] 打 DMG ..."
STAGING="$BUILD/dmg-root"
mkdir -p "$STAGING"
cp -R "$APP" "$STAGING/"
ln -s /Applications "$STAGING/Applications"
/usr/bin/hdiutil create -volname "$APP_NAME" -srcfolder "$STAGING" -ov -format UDZO \
  "$DIST/ZCodeDreamSkin-v$VERSION.dmg" -quiet

echo "[4/4] 完成："
echo "  $APP"
echo "  $DIST/ZCodeDreamSkin-v$VERSION.dmg"
