# Build 서브에이전트 지침: D2 공통 게임 요소 (+ D1 Review 반영)

## 역할

너는 **Build** 담당이다. 승인된 [spec.md](spec.md)의 **7절 D2 마일스톤**을 구현하고, [review.md](review.md)(D1 Review)의 "고치면 좋음" 1~3번을 함께 고친다. 검증은 별도 Review 서브에이전트가 한다.
결정 표: 보상 요소 **전부**, 도전 주문서 **넣기**, 제목 글꼴 Do Hyeon.

## 먼저 볼 것

1. [spec.md](spec.md) — 4절(공통 게임 요소: 점수 표·칭호·연속·다시 일어서기·도장판·도감 틀·도전 주문서 틀·축하 연출·효과음), 5절(API 추가), 6절(성능·접근성), 7절 D2, 8절(하지 않을 것), 맨 끝 "결정"
2. [review.md](review.md) — D1 Review 결과(특히 고치면 좋음 1~3, 참고 항목)
3. 시안: `/tmp/claude-0/-home-user-game2/51527575-3484-5179-b863-3acfe59f4ca9/scratchpad/plan-design/` (`shots/01-title.png`의 내 공방 카드, `06-result.png` 결과 축하, `08-record.png` 도장판, `02-stages.png` 도전 주문서 칸)
4. 지금 엔진: `src/shared/**`, [docs/engine.md](../engine.md)

## D2 범위

- `core/rewards.js`(점수·칭호·도장 판정·연속, 순수 함수), `core/collection.js`(순수), `ui/celebrate.js`, 새 효과음
- `createProgress({ optionalIds })` 도전 단계(다음 단계를 막지 않고 별 합계에서 빠짐, 차시의 일반 단계를 모두 마치면 열림)
- 결과 화면 연출(별 → 도장 → 점수 막대 → 칭호·새 도장 카드, 2초 이내, 누르면 건너뜀), 처음 화면 "내 공방" 카드, 머리 칭호 칩, 도장판, 도감 화면, 결과 복사에 한 줄 추가
- `ctx` 추가 API(spec 5-1): `ctx.reward.event`, `ctx.collect`/`ctx.collection`, `ctx.streak`, `ctx.feedback.celebrate`, `ctx.finish({ highlights })`, `?fx=low`, `createGameApp({ rewards, collections })`
- "기록·별 모두 지우기"가 점수·도장·도감까지 지우게
- **예시 게임은 코드를 고치지 않아도** 점수·도장이 저절로 붙어야 한다(spec 5-2)
- 문서: `docs/engine.md`(새 API와 보상 원칙: "학습 행동에만 보상, 빠르기 점수·순위 없음"), 필요하면 `docs/dev-guide.md`·`README.md`
- **전개도 게임 고유 보상(칭호 이름, 게임 도장, 도감 2개, 자유 배치, 도전 주문서 내용)은 N1·N2 범위라 만들지 않는다.** 엔진 틀만.

## D1 Review 반영 (함께 고친다)

| D1 review # | 문제 | 고칠 방향 |
| --- | --- | --- |
| 1 | 전개도 면 키보드 초점 색(`--focus`)이 면 색과 대비 1.05~1.25:1 | 초점 표시가 어떤 바탕에서도 3:1 이상 보이게(예: 잉크색 두 겹 테두리). 엔진 `--focus`를 바꾸거나 net-workshop `style.css`의 면 초점 규칙만 고친다 |
| 2 | 제목 글꼴 자리의 가운뎃점 `·`이 Do Hyeon에 없어 기기 글꼴로 섞여 그려짐 | 글꼴에 없는 글자가 제목 글꼴 자리에 나오지 않게 하거나(예: 제목 글꼴 자리에서는 다른 구분 기호), 빌드가 "제목 글꼴 자리에 글꼴에 없는 글자"를 찾아 알려 주게. 화면 글자를 바꾸면 5-3(테스트가 기대하는 글자)을 지킨다 |
| 3 | `cover.svg`에 `<style>@import "https://…"`가 있어도 검사를 통과 | `prepareCover`가 `<style>` 안의 `@import`·`url(`·`http`를 거부(또는 `<style>` 자체 금지), `findExternalRefs`도 SVG·`<style>` 안 `@import`를 잡게. 단위 테스트 추가 |

D1 Build가 남긴 "heroArt·thumb·chip·anchor e2e 없음"도 이번에 엔진 e2e(새 파일)로 보완한다.

## 고쳐도 되는 파일 (이 밖은 고치지 않는다)

- `src/shared/**`(새 파일 포함), `scripts/lib/games.mjs`, `scripts/lib/font.mjs`, `scripts/build.mjs`(3번·2번 검사에 필요한 만큼), `scripts/lib/hub.mjs`(게임 모음 이어 하기에 점수·칭호가 필요하면)
- `src/games/net-workshop/style.css` — D1 review 1번(면 초점)만
- 테스트: `tests/unit/*.test.js`(새 `rewards.test.js`, `collection.test.js` 등, `progress.test.js`), `tests/e2e/smoke.spec.js`, `tests/e2e/sample-divisor-sort.spec.js`, 새 `tests/e2e/engine-*.spec.js` — 기존 검사를 약하게 만들지 않는다
- 문서: `docs/engine.md`, `docs/dev-guide.md`, `README.md`
- **고치지 않는 것**: `CLAUDE.md`, `docs/design/spec.md`, `docs/design/review.md`, `docs/games/**`, `src/games/sample-divisor-sort/**`(예시 게임은 엔진만으로 보상이 붙어야 함), `src/games/_template/**`, `src/games/net-workshop/`의 `style.css` 밖 파일, `tests/e2e/net-workshop.spec.js`, `package.json`, `package-lock.json`(새 의존성 없음), `.github/**`, `.claude/**`
- 위 밖을 고쳐야만 하면 고치지 말고 보고에 적는다.

## 지킬 것

- spec 4절 점수 표 그대로. **"어떤 답 순서도 모두 처음에 맞힌 것보다 점수가 크지 않다"**(일부러 틀려서 이득 없음)를 무작위 1,000개 이상으로 검사한다.
- 8절(하지 않을 것): 순위표, 빠르기 점수, 목숨, 뽑기 없음. 기록은 그 기기에만(`createStorage`), 이름 저장 없음.
- 접근성: 축하 연출은 `prefers-reduced-motion`·`?fx=low`에서 색종이 0개, 화면 읽기 안내(`aria-live`), 키보드로 건너뛰기, 대비 4.5:1, 1366×680 세로 스크롤 없음(결과 화면 포함).
- 저사양: 색종이는 transform·opacity만, 2초 안에 정리, 요소 수 제한.
- 하위 호환: spec 5-2·5-3. 기존 e2e는 고치지 않고 통과하는 것이 원칙(고치면 이유 보고).
- `git commit`, `git push` 하지 않는다. 임시 파일·스크린샷은 `/tmp/claude-0/-home-user-game2/51527575-3484-5179-b863-3acfe59f4ca9/scratchpad/build-d2/`에만. Playwright 1.56.1, 브라우저 설치 금지.

## 끝났다의 기준 (spec 7절 D2 + 위 반영)

- `rewards.test.js`(점수 표, 무작위 1,000개 이상 "일부러 틀려도 이득 없음", 같은 단계 반복 시 완료·별 점수 없음, 칭호 기준, 도장 6개 조건), `collection.test.js`, `progress.test.js`(도전 단계)
- e2e: 예시 게임에서 점수·도장이 저절로 보임, 움직임 줄이기·`?fx=low`에서 색종이 0개, 지우기 후 점수·도장·도감 0, 엔진 새 기능(heroArt·thumb·chip·anchor)
- D1 review 1~3 고침(각각 테스트나 측정으로 확인)
- `npm test`, `npm run test:e2e` 모두 통과, 네 크기(1366×768·1366×680·820×1180·390×844) 스크린샷을 시안과 나란히 직접 확인

## 최종 보고 (20줄 이하)

바꾼·만든 파일, 점수·칭호·도장 요약, "일부러 틀려도 이득 없음" 검사 결과, D1 review 1~3 처리, 테스트 결과(통과·실패·건너뜀), 고친 기존 테스트와 이유, 시안과 다른 점, 남은 문제, 스크린샷 경로.
