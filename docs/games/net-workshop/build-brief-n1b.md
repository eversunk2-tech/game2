# Build 서브에이전트 지침: N1 추가 — 다시 하기 점수 규칙

## 역할

너는 N1을 만든 **Build** 담당이다. N1 작업(아직 커밋 전, 작업 트리에 있음)에 이어서, 사용자가 새로 정한 규칙 하나를 엔진에 넣는다. 검증은 N1 전체와 함께 별도 Review 서브에이전트가 한다.

## 사용자 결정 (docs/design/spec.md "결정" 표 "다시 하기 점수")

- **별 3개를 받은 단계를 다시 하면 연습 점수(처음 맞힘·다시 도전·다시 일어서기·연속·설명)를 주지 않는다.**
- 별이 3개가 안 된 단계는 지금처럼 준다(어려워하는 학생의 복습은 계속 보상).
- 도감에 새로 찾은 것(+5)·도전 첫 성공(+10)은 원래 처음 한 번뿐이라 그대로 준다. 이미 받은 것은 지금처럼 다시 주지 않는다.
- 결과 화면(오늘의 솜씨 칸 근처)에 까닭을 짧게 보인다. 예: "별 3개를 받은 단계라 연습 점수는 없어요. 새로 찾으면 점수를 받아요."
- 판단 기준은 **그 판을 시작할 때** 이미 별 3개였는지다(이번 판에서 처음 별 3개를 받으면 이번 판 점수는 준다).

## 할 일

1. `src/shared/core/rewards.js`(순수 함수)에 규칙을 넣고, 엔진(`src/shared/ui/app.js`)이 판을 시작할 때의 별 수를 넘기게 한다.
2. 플레이 중 머리의 점수·연속 표시와 결과 화면이 규칙과 맞게(별 3개 단계 다시 하기에서 연습 점수가 올라가 보이지 않게) 한다. 연속 소리·"연속 n" 글자는 보여도 되지만 점수는 0.
3. 테스트: `tests/unit/rewards.test.js`에 — 별 3개 단계 다시 하기 연습 점수 0, 별 2개 이하 단계는 점수 있음, 이번 판에 처음 별 3개면 점수 있음, 새로 찾음은 별 3개 단계에서도 +5(처음 한 번), "일부러 틀려도 이득 없음" 무작위 검사가 이 규칙에서도 통과. e2e(`tests/e2e/engine-features.spec.js` 또는 예시 게임 검사)로 별 3개 단계를 다시 해도 칭호 칩 점수가 그대로인지.
4. `docs/engine.md` 보상 절에 규칙을 적는다.

## 고쳐도 되는 파일

- `src/shared/core/rewards.js`, `src/shared/ui/app.js`, `src/shared/ui/rewards-view.js`, `src/shared/styles/base.css`(필요한 만큼)
- `tests/unit/rewards.test.js`, `tests/e2e/engine-features.spec.js`, `tests/e2e/net-workshop.spec.js`(N1 검사가 이 규칙 때문에 바뀌면)
- (추가 허용, 코디네이터 확인 후) `tests/e2e/sample-divisor-sort.spec.js` — "별 3개 단계 다시 하기" 부분(옛 규칙 +21·탐험가 53점을 기대하던 줄)만 새 규칙(+0·안내 문장·새싹 32점 그대로)으로. 제안한 `build-n1/sample-proposal/sample-divisor-sort.spec.patch` 그대로이며, 다른 검사는 건드리지 않는다
- `docs/engine.md`
- 그 밖은 N1 지침([build-brief-n1.md](build-brief-n1.md))의 범위 그대로. `docs/design/**`, `docs/games/**`, `CLAUDE.md`, 예시 게임, 템플릿, package 파일은 고치지 않는다.

## 지킬 것

- 기존 검사를 약하게 만들지 않는다. `git commit`·`git push` 하지 않는다. 임시 파일은 `/tmp/claude-0/-home-user-game2/51527575-3484-5179-b863-3acfe59f4ca9/scratchpad/build-n1/`에만.
- 끝났다의 기준: `npm test`, `npm run test:e2e` 모두 통과, 결과 화면(별 3개 단계 다시 하기) 스크린샷 1366×768·390×844 직접 확인.

## 최종 보고 (8줄 이하)

규칙 구현 방법, 바꾼 파일, 테스트 결과(통과·실패·건너뜀), 화면 확인.
