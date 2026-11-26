#!/bin/bash
# 다음 버튼 연타 시험 (개발자용) — 가짜 ProPresenter로 버튼을 1.5초 / 0.15초 / 0.03초 간격으로 눌러
# 마지막에 켜진 자막("active")이 []이면 통과. 실제 ProPresenter에는 아무것도 보내지 않습니다.
#   bash scripts/tests/run.sh      (필요: Node 18+, Google Chrome, 포트 8091·51998)
set -euo pipefail
cd "$(dirname "$0")/../.."
T="$(mktemp -d)"; trap 'kill $MP $SP 2>/dev/null; rm -rf "$T"' EXIT
echo '{"host":"127.0.0.1","port":51998}' > "$T/config.json"
node scripts/tests/mock-pp-log.js & MP=$!
SR_DATA_DIR="$T" PORT=8091 node server.js >/dev/null 2>&1 & SP=$!
sleep 1.2
fail=0
for gap in 1500 150 30; do
  out="$(node scripts/tests/rapid-press.js "$T/c$gap" $gap)"; echo "$out"
  echo "$out" | grep -q '"active":\[\]' || fail=1
done
[ $fail = 0 ] && echo "✔ 통과" || { echo "✘ 자막이 남았습니다"; exit 1; }
