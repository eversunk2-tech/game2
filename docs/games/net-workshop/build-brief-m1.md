# Build 서브에이전트 지침: 전개도 접기 공방 1차 (정육면체 차시)

## 역할

너는 **Build** 단계 담당이다. 승인된 계획서 [spec.md](spec.md)의 **14절 1차 마일스톤**을 구현한다.
검증은 별도의 Review 서브에이전트가 하므로, 너는 구현과 네 테스트까지 책임진다.

## 먼저 읽을 것

1. [spec.md](spec.md) 전체 — 특히 3·4·5·6·7·8절, 11·12·13·14절, 맨 끝 "결정" 표
2. [docs/dev-guide.md](../../dev-guide.md) — 기술 규칙 (반드시 지킨다)
3. [docs/engine.md](../../engine.md) — 공통 엔진 API
4. `src/shared/ui/app.js`, `src/shared/core/progress.js`, `src/games/sample-divisor-sort/` (완성 예시), `tests/e2e/` (기존 검사 방식)

## 이번에 만드는 것 (1차 범위)

1. **엔진 "차시 묶음"** (spec 5-1 안 B)
   - `readUrlOptions()`에 `lesson` 추가
   - `createGameApp({ lessons })` 선택 인자, 단계마다 `lesson` 필드. `?lesson=<id>`가 맞으면 그 차시 단계만 쓰고 처음 화면 윗줄에 차시 제목
   - `createProgress({ ..., openIds = [] })`: `openIds`의 단계는 처음부터 열림. 기본값이면 지금과 똑같이 동작
   - 단계 선택 화면: `lessons`가 있으면 차시 제목별로 묶어 보여 준다 (`h2 단계를 골라요`, `.stage-card` 클래스·순서는 유지)
   - 결과 화면: "다음 단계"는 같은 차시 안에서만. 차시 끝이면 "이 차시를 마쳤어요!" + 학습 기록 보기
   - `lessons`를 안 쓰는 게임(예시 게임)은 동작·화면이 바뀌지 않아야 한다
2. **게임 `net-workshop`** — `npm run new -- net-workshop "전개도 접기 공방"`으로 만든다 (spec.md는 이미 있어 덮어쓰지 않는다)
   - `game.json`: `status: "개발 중"`, `mode: "개인"`, `grades: [5, 6]`, `standards: []`, `playMinutes: 10`, 단원은 spec 1절 표기
   - 이번 차시: **`cube` 정육면체의 전개도** 3단계 `cube-judge` → `cube-opposite` → `cube-complete` (spec 5절 표의 문항 수·끝나는 조건 그대로)
   - `LESSONS`에는 이번에 만든 `cube`만 넣는다 (아직 없는 차시를 화면에 보이지 않는다)
   - 파일 구성은 spec 12절을 따른다. 1차에 필요 없는 파일(`cylinder.js` 등)은 만들지 않는다. `fold.js`·`geometry.js`는 2차 이후(직육면체·각기둥)에 넓힐 수 있게 다각형 면 기준으로 설계한다
   - 3D: CSS 3D transform, 면은 `<button>`, `foldNet`의 행렬을 `matrix3d()`로 적용 (spec 11-1)
   - 오개념 tag는 spec 3절 표의 글자 그대로 `TAGS` 상수로
   - 피드백: spec 6절 (겹친 면 빗금 + ✗ + "겹쳐요", 빈 자리 점선 + "비어요", 까닭 칸, reduced-motion 3장면)
3. **테스트** (spec 13절 중 정육면체 부분)
   - `tests/unit/net-workshop-fold.test.js`, `tests/unit/net-workshop-logic.test.js`
   - `tests/unit/progress.test.js`에 `openIds` 테스트 추가
   - 엔진 차시 묶음 동작 테스트(단위로 어려우면 e2e로)
   - `tests/e2e/net-workshop.spec.js`: `?lesson=cube&seed=1`로 판별 6문항 끝까지, 오답 시 까닭·`.is-overlap`·학습 기록 tag, 키보드로 `cube-opposite` 한 문항, 태블릿 터치로 `cube-complete` 끌어 놓기, 접기 완료 `data-fold="done"`, reduced-motion, 1366×768·820×1180에서 스크롤 없음
4. **문서**: `docs/engine.md`(lessons·`?lesson=`·openIds), `README.md`와 `scripts/lib/hub.mjs` 바닥글의 주소 옵션 표에 `?lesson=` 추가

## 고쳐도 되는 파일 (이 밖은 고치지 않는다)

- 새로 만들기·고치기: `src/games/net-workshop/**`, `tests/unit/net-workshop-*.test.js`, `tests/e2e/net-workshop.spec.js`
- 고치기: `src/shared/ui/app.js`, `src/shared/core/progress.js`, `src/shared/styles/base.css`(차시 묶음 제목 등 엔진 화면에 필요한 만큼), `tests/unit/progress.test.js`, `docs/engine.md`, `README.md`, `scripts/lib/hub.mjs`(바닥글 주소 옵션만)
- **고치지 않는 것**: `CLAUDE.md`, `docs/dev-guide.md`, `docs/games/**`의 문서(spec.md 포함), `src/games/sample-divisor-sort/**`, `src/games/_template/**`, `tests/e2e/smoke.spec.js`, `tests/e2e/sample-divisor-sort.spec.js`, `scripts/build.mjs`, `scripts/dev.mjs`, `scripts/new-game.mjs`, `package.json`, `package-lock.json`, `.github/**`, `.claude/**`
- npm 의존성을 추가하지 않는다.
- 위 목록 밖의 파일을 고쳐야만 할 것 같으면 고치지 말고 최종 보고에 이유와 함께 적는다.

## 지킬 것

- 계획서와 다르게 해야 할 이유가 생기면 더 단순한 쪽으로 하고 최종 보고에 "계획과 다른 점"으로 적는다. 범위를 넓히지 않는다.
- `git commit`, `git push`를 하지 않는다 (Embed는 메인 세션이 한다).
- 스크린샷·임시 파일은 저장소 밖 `/tmp/claude-0/-home-user-game2/51527575-3484-5179-b863-3acfe59f4ca9/scratchpad/build-m1/`에만 둔다.
- Playwright는 저장소의 `node_modules`(1.56.1)를 쓴다. 브라우저를 새로 설치하지 않는다.

## 끝났다의 기준

- `npm test`와 `npm run test:e2e` 모두 통과 (기존 테스트 포함, 실패·건너뜀을 숨기지 않는다)
- 크롬북(1366×768)·태블릿(820×1180)·휴대폰(390×844) 크기에서 세 단계의 플레이 화면과 오답 화면을 스크린샷으로 찍어 직접 확인했다
- 엔진 변경 후에도 예시 게임 화면이 그대로다

## 최종 보고 (20줄 이하)

1. 만든·고친 파일 목록 (한 줄 설명)
2. 테스트 결과: 단위 n개 / e2e n개 통과·실패·건너뜀
3. 계획과 다른 점
4. 아직 남은 문제·확인 못 한 것
5. 스크린샷 경로
