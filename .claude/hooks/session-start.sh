#!/bin/bash
# Claude Code 클라우드 세션이 시작될 때 의존성(esbuild, Playwright)을 설치한다.
# 로컬 컴퓨터에서는 아무것도 하지 않는다.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

# npm ci 대신 npm install: 컨테이너 캐시에 남은 node_modules를 재사용한다.
npm install --no-audit --no-fund
