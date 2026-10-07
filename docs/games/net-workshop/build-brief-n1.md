# Build 서브에이전트 지침: N1 "내 맘대로 전개도" + 전개도 게임 고유 게임 요소

## 역할

너는 **Build** 담당이다. 승인된 [spec.md](spec.md) **16절**(16-1~16-5, 16-7 결정)의 **N1 마일스톤**을 구현한다. 검증은 별도 Review 서브에이전트가 한다.
결정: 보상 요소 전부, 정육면체 차시 = 판별 5·마주 보는 면 4·면 붙이기 3 + 마지막 4단계 `cube-free`, 제목 글꼴 Do Hyeon. 도전 주문서 내용(`cube-dice`, `cube-dex`)은 **N2**라 이번에는 만들지 않는다.

## 먼저 볼 것

1. [spec.md](spec.md) 16절 전체 (자유 배치 규칙·조작·판정·tag·별, 다른 도형 확장 방향, 게임 고유 요소, 새 단계 구성, 파일 구조·테스트·Build 순서)
2. 공통 엔진: [docs/engine.md](../../engine.md)(특히 10절 보상 API), [docs/design/spec.md](../../design/spec.md) 3~5절, `src/shared/**`
3. 시안: `/tmp/claude-0/-home-user-game2/51527575-3484-5179-b863-3acfe59f4ca9/scratchpad/plan-design/shots/` — `01-title.png`(히어로), `02-stages.png`(단계 그림·도전 칸), `03-judge-wrong.png`(무대·작업 지시서·까닭 쪽지·다시 일어서기 쪽지), `04-free-edit.png`·`04t-free-edit-tablet.png`(놓는 판), `05-free-found.png`(새 전개도 발견·도감), `06-result.png`
4. 지난 검토: [review.md](review.md)(1차·재검토 1·2), [docs/design/review.md](../../design/review.md)(D1·D2)

## N1 범위 (spec 16-5 N1 행)

- `cube-free` "내 맘대로 전개도": `free-board.js`(놓는 판: 놓기·빼기·옮기기·되돌리기, 끌기·눌러 놓기·키보드), `play-free.js`(예상하고 접기, 결과 문장, 힌트), 서로 다른 전개도 3가지 찾으면 끝, 별은 예상 정확도, 같은 모양 반복은 기록하지 않음, 떨어진 배치는 접지 않음
- 문항 수 5·4·3, 판별의 까닭 고르기 칩, 도감 2개(정육면체 전개도 11칸, 안 되는 모양 노트), 칭호 이름(견습생 → 솜씨꾼 → 접기 장인 → 설계 장인 → 공방 명장), 게임 도장 6개, 히어로 그림, 단계 카드 그림(`thumbs.js`), 표지
- `view3d.js` 매트 무대·색종이 면 색(토큰)·`setNet(…, { layout })`, 접기 소리
- 모든 판정은 `fold.js`를 그대로 쓴다(판정 결과는 바꾸지 않는다. `isConnected`를 밖으로 내는 정도는 된다)

## 함께 고칠 것

| 출처 | 내용 | 방향 |
| --- | --- | --- |
| net-workshop 재검토 2 R1 | 휴대폰에서 마주 보는 면 단계 오답 뒤 토스트가 면 하나를 가림 | 엔진 `feedback.anchor` 등으로 무대 밖에 띄우기 |
| 재검토 2 R2 | 휴대폰 결과 이름표가 "✗ 겹쳐요"와 겹침 | 겹치지 않게 배치 |
| 재검토 2 R3 | 2×2 장면에서 덩어리 양쪽 면이 비스듬해 좁게 보임 | 시점 조정 |
| D2 review 고치면 좋음 1 | `cover.svg` 검사를 피하는 길(`//주소`, 엔티티로 숨긴 url, `<a>`+`<animate href=javascript:>`) | 막기 목록 대신 **근본 방법**: 게임 모음에서 표지를 `<img src="data:image/svg+xml,…" alt="">`로 넣어 스크립트·바깥 요청이 원천적으로 안 되게 하거나, 허용 목록(기본 도형·채우기 속성만) 방식으로. 악성 예시 18가지를 단위 테스트로 |
| D2 review 고치면 좋음 2 | `ctx.reward.event('explain')`을 `itemId` 없이 부르면 부를 때마다 +2 | `itemId` 없으면 점수 없음(또는 단계당 한 번), 테스트 추가 |
| D2 review 참고 6·11 | 플레이 머리 "문제 n/N" 점 막대 없음, 작업 지시서 부품 없음 | 엔진에 작은 API(예: `ctx.setProgress(current, total)`)와 필요하면 작업 지시서 도우미. 문서에 적기 |
| D2 review 참고 7 | 쓰지 않는 코드 `EMPTY_REWARDS`, `snapshot` | 지우거나 씀 |
| 1차 Build 남은 점 | 이모지 ⭕❌↺↻ | 엔진 아이콘(SVG)으로 |

## 고쳐도 되는 파일 (이 밖은 고치지 않는다)

- `src/games/net-workshop/**`(새 파일 포함, `game.json`은 `color` 외 `status`는 "개발 중" 그대로)
- `tests/unit/net-workshop-*.test.js`, `tests/e2e/net-workshop.spec.js` — 문항 수가 바뀐 만큼은 고치고, 그 밖의 기존 검사는 약하게 만들지 않는다
- 엔진은 위 "함께 고칠 것"에 필요한 만큼만: `src/shared/ui/app.js`, `src/shared/ui/icons.js`, `src/shared/ui/feedback.js`, `src/shared/core/rewards.js`, `src/shared/styles/base.css`, `scripts/lib/games.mjs`, `scripts/lib/hub.mjs`, `scripts/build.mjs`, 그 테스트(`tests/unit/rewards.test.js`, `games.test.js`, `build.test.js`, `engine-ui.test.js`, `tests/e2e/engine-*.spec.js`), `docs/engine.md`
- **고치지 않는 것**: `CLAUDE.md`, `docs/games/**`(spec.md·review.md 포함), `docs/design/**`, `docs/dev-guide.md`, `src/games/sample-divisor-sort/**`, `src/games/_template/**`, `tests/e2e/smoke.spec.js`, `tests/e2e/sample-divisor-sort.spec.js`, `package.json`, `package-lock.json`(새 의존성 없음), `.github/**`, `.claude/**`
- 위 밖을 고쳐야만 하면 고치지 말고 보고에 적는다.

## 지킬 것

- 점수는 학습 행동에만(engine.md 10절). 자유 배치에서 같은 모양을 돌리거나 뒤집어 다시 놓아도 점수·기록이 늘지 않는다. "일부러 틀려도 이득 없음"을 자유 배치에도 테스트로.
- 교실 기기: 1366×768·1366×680·820×1180에서 세로 스크롤 없음(놓기·접힌 뒤·힌트 상태 포함), 가로 스크롤 없음(네 크기), 48px, 대비 4.5:1, 키보드만으로 자유 배치 끝까지, 터치 끌기, `prefers-reduced-motion`·`?fx=low`.
- 정답 노출 금지(자유 배치의 힌트 그림자는 학생이 누를 때만).
- `git commit`, `git push` 하지 않는다. 임시 파일·스크린샷은 `/tmp/claude-0/-home-user-game2/51527575-3484-5179-b863-3acfe59f4ca9/scratchpad/build-n1/`에만. Playwright 1.56.1, 브라우저 설치 금지.

## 끝났다의 기준

- spec 16-5의 단위·브라우저 테스트(N1 해당분) 통과 + 위 "함께 고칠 것" 각각을 테스트나 측정으로 확인
- `npm test`, `npm run test:e2e` 모두 통과
- 네 크기 스크린샷을 시안과 나란히 직접 확인
- 정육면체 차시 전체(1~4단계)를 자동으로 사람 속도에 가깝게(문항마다 생각 시간을 넣어) 플레이해 걸린 시간을 재고, 10분 안팎인지 근거와 함께 보고(실제 사람 플레이가 아님을 밝힌다)

## 최종 보고 (20줄 이하)

바꾼·만든 파일, 자유 배치 동작 요약, 게임 요소(칭호·도장·도감), "함께 고칠 것" 처리, 테스트 결과(통과·실패·건너뜀), 고친 기존 테스트와 이유, 시안과 다른 점, 차시 시간 추정, 남은 문제, 스크린샷 경로.
