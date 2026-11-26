#!/bin/bash
# 안내서 화면 사진 다시 찍기 (개발자용) — 가짜 ProPresenter와 예시 원고만 써서 개인 정보가 찍히지 않습니다.
#   bash scripts/screenshots/run.sh   → docs/images/*.png
# 필요: Node 18+, Google Chrome. 8090·51999번 포트를 잠깐 씁니다.
set -euo pipefail
cd "$(dirname "$0")/../.."
T="$(mktemp -d)"; trap 'kill $MP $SP 2>/dev/null; rm -rf "$T"' EXIT
mkdir -p "$T/data" docs/images
echo '{"host":"127.0.0.1","port":51999}' > "$T/data/config.json"
node scripts/screenshots/mock-pp.js 51999 >/dev/null 2>&1 & MP=$!
SR_DATA_DIR="$T/data" PORT=8090 node server.js >/dev/null 2>&1 & SP=$!
sleep 1.5
node scripts/screenshots/shoot.js http://127.0.0.1:8090/ docs/images "$T/chrome"
rm -f docs/images/준비-2-목록.png
echo "✔ docs/images/ 에 저장했습니다."
