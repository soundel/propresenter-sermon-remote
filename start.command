#!/bin/bash
# 설교 리모컨 실행 — 이 파일을 더블클릭하세요.
cd "$(dirname "$0")"
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "Node.js가 설치되어 있지 않습니다."
  echo "https://nodejs.org 에서 'LTS' 버전을 내려받아 설치한 뒤, 이 파일을 다시 더블클릭하세요."
  echo ""
  open "https://nodejs.org" 2>/dev/null
  read -n 1 -s -r -p "아무 키나 누르면 창이 닫힙니다."
  exit 1
fi
MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$MAJOR" -lt 18 ]; then
  echo ""
  echo "Node.js $(node -v)는 너무 오래된 버전입니다. 18 이상이 필요합니다."
  echo "https://nodejs.org 에서 'LTS' 버전을 새로 설치해 주세요."
  echo ""
  read -n 1 -s -r -p "아무 키나 누르면 창이 닫힙니다."
  exit 1
fi
node server.js
echo ""
read -n 1 -s -r -p "서버가 꺼졌습니다. 아무 키나 누르면 창이 닫힙니다."
