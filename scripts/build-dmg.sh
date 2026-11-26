#!/bin/bash
# 설교 리모컨.app과 dmg 만들기 — 맥에서 실행합니다. (깃허브 자동 빌드도 이 파일을 씁니다)
#   bash scripts/build-dmg.sh
# 결과: dist/propresenter-sermon-remote-<버전>.dmg
# Node.js(애플 실리콘용·인텔용)를 nodejs.org에서 내려받아 앱 안에 넣습니다. 인터넷이 필요합니다.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
[ "$(uname)" = "Darwin" ] || { echo "dmg는 맥에서만 만들 수 있습니다."; exit 1; }

VERSION="$(sed -n "s/^const VERSION = '\(.*\)';/\1/p" server.js)"
NODE_LINE="${NODE_LINE:-22}"          # Node 22는 macOS 11 이상에서 돌아갑니다
APPNAME="설교 리모컨"
OUT="$ROOT/dist"; WORK="$OUT/work"; STAGE="$WORK/stage"; APP="$STAGE/$APPNAME.app"
DMG="$OUT/propresenter-sermon-remote-$VERSION.dmg"
rm -rf "$OUT"; mkdir -p "$WORK" "$STAGE"
echo "▶ 설교 리모컨 v$VERSION 만들기 (Node $NODE_LINE)"

# 1) Node.js 내려받기 + 확인(SHA-256)
BASE="https://nodejs.org/dist/latest-v$NODE_LINE.x"
curl -fsSL "$BASE/SHASUMS256.txt" -o "$WORK/SHASUMS256.txt"
for arch in arm64 x64; do
  f="$(grep -o "node-v[0-9.]*-darwin-$arch\.tar\.gz" "$WORK/SHASUMS256.txt" | head -1)"
  echo "  · $f"
  curl -fsSL "$BASE/$f" -o "$WORK/$f"
  (cd "$WORK" && grep "  $f\$" SHASUMS256.txt | shasum -a 256 -c - >/dev/null)
  mkdir -p "$WORK/$arch" && tar -xzf "$WORK/$f" -C "$WORK/$arch" --strip-components=1
done

# 2) 앱 묶음
C="$APP/Contents"
mkdir -p "$C/MacOS" "$C/Resources/app"
sed "s/__VERSION__/$VERSION/g" mac/Info.plist > "$C/Info.plist"
cp mac/launcher "$C/MacOS/launcher"; chmod +x "$C/MacOS/launcher"
cp "$WORK/arm64/bin/node" "$C/Resources/node-arm64"
cp "$WORK/x64/bin/node"   "$C/Resources/node-x64"
cp "$WORK/arm64/LICENSE"  "$C/Resources/node-LICENSE"
cp -R server.js public docs LICENSE README.md CHANGELOG.md "$C/Resources/app/"
rm -f "$C/Resources/app/public/fonts/.gitkeep"

# 아이콘
ICONSET="$WORK/AppIcon.iconset"; mkdir -p "$ICONSET"
for s in 16 32 128 256 512; do
  sips -z $s $s mac/icon.png --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  sips -z $((s*2)) $((s*2)) mac/icon.png --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$C/Resources/AppIcon.icns"

# 3) dmg (앱 + 응용 프로그램 바로 가기 + 안내문)
ln -s /Applications "$STAGE/Applications"
cp "mac/처음-열-때-읽어-주세요.txt" "$STAGE/"
xattr -cr "$APP" 2>/dev/null || true
hdiutil create -volname "$APPNAME" -srcfolder "$STAGE" -fs HFS+ -format UDZO -ov "$DMG" >/dev/null
rm -rf "$WORK"
echo "✔ 완성: $DMG ($(du -h "$DMG" | cut -f1))"
