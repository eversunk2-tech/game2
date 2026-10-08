# Build 서브에이전트 지침: N1 Review 반영 (N1-1 ~ N1-9)

## 역할

너는 N1을 만든 **Build** 담당이다. [review.md](review.md) 맨 아래 "N1 검토"의 문제를 고친다. 판정(`fold.js` 결과)은 바꾸지 않는다. 검증은 별도 Review 서브에이전트가 다시 한다.

## 고칠 것

| # | 심각도 | 내용 | 방향 |
| --- | --- | --- | --- |
| N1-1 | **반드시 수정** | 자유 배치에서 "왜 안 될까요?" 칩을 고르는 동안 무대에 정답 까닭(2×2 이름표 "네 면이 한 점에…", 면마다 "✗ 겹쳐요")이 이미 보인다(`play-free.js:281` `view.reveal()`) | 까닭을 고르기 **전에는** 무대에 까닭 글자·표시(이름표, "겹쳐요", ●, "비어요" 등)를 보이지 않는다. 고른 뒤(맞든 틀리든) 보인다. 판별 단계와 같은 순서. 24가지 안 되는 모양 모두에서 고르기 전 DOM에 까닭 글자가 없음을 e2e·단위로 검사 |
| N1-2 | 사용자 결정 | 자유 배치 점수가 칭호 기준보다 큼 | [spec.md](spec.md) **16-8 결정** 그대로: 예측 적중·새 전개도·노트 등록·까닭 설명 점수는 **이 기기에서 그 모양(`netName`)을 처음 접을 때만**(판을 넘어 저장), 노트 등록은 **+1점**(전개도 발견 +5 그대로), 별은 그대로. 테스트: 같은 모양을 다른 판에서 다시 접으면 0점, 35가지 전부 탐구 시 총점(한 번만), 별 3개를 피하며 다시 해도 이미 접은 모양은 0점, "일부러 틀려도 이득 없음" 무작위 검사 다시 통과 |
| N1-3 | 고치면 좋음 | 도감 칩이 "n / 35"(전개도 11 + 노트 24) | 칩은 전개도 도감만 "n / 11", 노트는 따로 "노트 n / 24"(필요한 곳만). 엔진을 고쳐야 하면 "차시의 첫 도감만 센다" 같은 일반 규칙으로 |
| N1-4 | 고치면 좋음 | 결과 "오늘의 솜씨" 칸이 4개로 잘려 "까닭 설명" 점수가 빠지고 합이 총점과 다름 | 점수 있는 칸이 잘리지 않게(점수 없는 칸을 빼거나 합치기). 칸 점수 합 + 점수 줄 = 총점을 테스트 |
| N1-5 | 고치면 좋음 | 휴대폰 면 붙이기 [펴고 다시 하기] 뒤 앞 알림이 면 카드를 가림 | `retry()`에서 `ctx.feedback.clear()` |
| N1-6 | 참고 | 표지 `transform` 정규식 지수 시간(빌드가 멈출 수 있음, `scripts/lib/games.mjs:52`) | 겹치는 `\s*`를 없애 선형으로. 긴 입력 단위 테스트(예: 1만 글자도 100ms 안) |
| N1-7 | 참고 | 태블릿 결과 화면 처음 2초 가로 25px 넘침(엔진, D2부터) | 결과 화면 바깥 상자 `overflow-x: clip`(또는 hidden). e2e 가로 스크롤 검사에 결과 연출 중 시점 추가 |
| N1-8 | 참고 | 1366×680 차시 끝 결과 화면 스크롤 검사가 빠짐 | `net-workshop.spec.js` 자유 배치 1366×680 검사 끝에 결과 화면 세로 스크롤 0 검사 추가 |
| N1-9 | 참고 | 떨어진 면 판정이 두 곳(`logic.cellGroups`, `fold.isConnected`) | 한 곳을 쓰게(판정 결과는 같아야 함) |

N1-10(주사위 장인 도장)은 N2에서 해결되므로 이번에는 그대로 둔다.

## 고쳐도 되는 파일

- `src/games/net-workshop/**`, `tests/unit/net-workshop-*.test.js`, `tests/e2e/net-workshop.spec.js`
- 엔진은 필요한 만큼만: `src/shared/ui/app.js`, `src/shared/core/rewards.js`, `src/shared/core/collection.js`, `src/shared/styles/base.css`, `scripts/lib/games.mjs`, 그 테스트(`tests/unit/rewards.test.js`, `collection.test.js`, `games.test.js`, `engine-ui.test.js`, `tests/e2e/engine-*.spec.js`), `docs/engine.md`
- 고치지 않는 것: `CLAUDE.md`, `docs/games/**`(spec.md·review.md 포함), `docs/design/**`, 예시 게임, 템플릿, `tests/e2e/smoke.spec.js`, `tests/e2e/sample-divisor-sort.spec.js`, package 파일, `.github/**`, `.claude/**`

## 지킬 것

- 기존 검사를 약하게 만들지 않는다. `git commit`·`git push` 하지 않는다. 임시 파일은 `/private/tmp/claude-501/-Users-sungchul-Desktop-play2-game2/58f929c4-6580-4755-b852-eaafe6f5e1f2/scratchpad/build-n1c/`에만. Playwright 1.56.1.
- 끝났다의 기준: `npm test`, `npm run test:e2e` 모두 통과, N1-1·N1-3·N1-4·N1-5·N1-7 장면을 스크린샷으로 직접 확인(크롬북 1366×768·1366×680, 태블릿, 휴대폰).

## 로컬에서 이어 하기 (2026-10-08 덧붙임)

- 이 수정 라운드는 클라우드에서 시작 직후 멈췄고, 로컬 컴퓨터(macOS)에서 처음부터 다시 한다. 시작 상태: 커밋 `c517c76`, 작업 트리 깨끗함, 단위 127 통과 · 브라우저 101 통과 · 15 건너뜀.
- review.md에 나오는 클라우드 임시 폴더(`/tmp/claude-0/…/scratchpad/review-n1/`의 검증 스크립트·`shots/`)는 로컬에 없다. 필요한 재현 스크립트는 review.md의 "재현 방법"을 보고 위 임시 폴더에 새로 쓴다. 승인된 시안은 [docs/design/mockups/](../../design/mockups/)에 있다.
- 임시 폴더의 스크립트에서 Playwright를 쓸 때는 저장소의 `node_modules`를 쓴다(예: 저장소를 작업 폴더로 두고 실행하거나 `createRequire`로 저장소 경로에서 불러오기). 임시 폴더나 저장소에서 `npm install`을 다시 하지 않는다.
- 기술 규칙은 [docs/dev-guide.md](../../dev-guide.md), 엔진 사용법은 [docs/engine.md](../../engine.md).

## 최종 보고 (12줄 이하)

항목별 한 줄(무엇을 어떻게, 확인 방법), 테스트 결과(통과·실패·건너뜀), 고친 기존 테스트와 이유, 바꾼 파일.
