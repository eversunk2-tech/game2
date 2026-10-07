# Review 서브에이전트 지침: 1차 수정 확인 (재검토)

## 역할과 범위

- 너는 1차를 검토한 **Review** 담당이다. Build가 [build-fix-brief-m1.md](build-fix-brief-m1.md)에 따라 고친 결과를 **독립적으로** 다시 확인한다.
- [review.md](review.md) **한 파일만** 고친다: 맨 아래에 `## 재검토 (수정 확인)` 절을 덧붙이고, 맨 위 "판정" 줄을 재검토 결과로 고친다. 앞의 1차 검토 내용은 지우지 않는다.
- 코드·테스트·다른 문서를 고치지 않는다. 작업 트리를 바꾸는 git 명령(commit, push, stash, checkout, reset)을 쓰지 않는다.
- 검증용 파일은 `/tmp/claude-0/-home-user-game2/51527575-3484-5179-b863-3acfe59f4ca9/scratchpad/review-m1-fix/`에만 둔다. 1차 때 만든 `scratchpad/review-m1/`의 스크립트(`indep.mjs`, `guess.mjs`, `bottom.mjs`, `shortscreen.mjs`, `targets.mjs`, `oppview.mjs`, `checks.mjs`, `play.mjs`, `engine-compare.mjs`)를 다시 써도 된다.

## 확인할 것

1. `npm test`, `npm run test:e2e`를 직접 돌린 결과 (통과·실패·건너뜀, 건너뜀이 정당한지).
2. review.md의 1~12번 각각: 고쳐졌는지 **1차 때와 같은 방법으로 다시 재현·측정**해서 확인 (예: 찍어서 맞힐 확률, 빈 자리가 바닥에 오는 비율, 1366×680 스크롤, 휴대폰 빈 자리 크기, 다시 누른 오답 기록 횟수).
3. 회귀: 판정·수학이 그대로인가 (`indep.mjs` 독립 계산으로 다시 비교: 헥소미노 11/35, `oppositeFace`, `completionSlots`, 여러 seed 문항의 정답·까닭). 화면 문장의 면 이름이 화면과 맞는가.
4. 범위: 이번 수정이 build-fix-brief의 "고쳐도 되는 파일"(`src/games/net-workshop/**`, `tests/unit/net-workshop-*.test.js`, `tests/e2e/net-workshop.spec.js`) 안에서만 이루어졌는가. 엔진(`src/shared/**`)·문서·다른 게임이 1차 검토 때와 같은가 (예시 게임 엔진 전후 비교 다시 실행).
5. 세 기기(+1366×680)에서 차시를 처음부터 끝까지 다시 플레이하고 주요 장면 스크린샷을 직접 본다. 새로 생긴 문제(겹침, 가려짐, 콘솔 오류, 정답 노출)가 없는가.
6. Build가 보고한 한계: "겹친 자리와 빈 자리가 서로 마주 보면 한 시점에 둘 다 보일 수 없어, 겹친 면을 보이게 두고 '비어요'는 돌려야 보인다" — 이 경우가 얼마나 자주 나오는지 재고, 받아들일 만한지 의견.

## 형식

`## 재검토 (수정 확인)` 아래에: 테스트 결과 표, 항목별 표(# / 결과: 고쳐짐·일부·안 됨 / 확인 방법과 수치), 새로 발견한 문제(심각도 기준은 1차와 같음), 확인 못 한 것.

## 끝나면

최종 답변 **10줄 이하**: 재검토 판정(통과 / 수정 필요), 항목별 결과 요약, 새 문제와 심각도.
