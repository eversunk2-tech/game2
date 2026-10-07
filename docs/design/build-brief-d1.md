# Build 서브에이전트 지침: D1 디자인 바탕 ("종이 공방")

## 역할

너는 **Build** 담당이다. 승인된 [docs/design/spec.md](spec.md)의 **7절 D1 마일스톤**을 구현한다. 검증은 별도 Review 서브에이전트가 한다.
맨 끝 "결정" 표가 최종이다: **제목 글꼴은 Do Hyeon**(Jua 아님), 보상 요소는 D2에서 만든다.

## 먼저 볼 것

1. [spec.md](spec.md) 전체 — 1~6절(방향·토큰·부품·API·성능·접근성), 7절 D1, 8절, 맨 끝 "결정"
2. 시안 HTML·스크린샷: `/tmp/claude-0/-home-user-game2/51527575-3484-5179-b863-3acfe59f4ca9/scratchpad/plan-design/` (`mock/`, `shots/`). 시안의 모습을 실제 엔진으로 옮기는 것이 목표다. 시안은 본문 글꼴 대역으로 Noto Sans KR을 썼지만, 실제 본문은 **기기 글꼴**이다.
3. [docs/dev-guide.md](../dev-guide.md), [docs/engine.md](../engine.md), `src/shared/**`, `scripts/build.mjs`, `scripts/lib/hub.mjs`, 기존 테스트

## D1 범위

- `base.css` 새 토큰·부품 (옛 변수·클래스 이름 유지, 5-2·5-3을 지킨다)
- `app.js` 새 화면 구조: 머리(로고·소리), 처음 화면 히어로(`heroArt` 선택 인자, 없으면 기본 무늬), 단계 지도(`.stage-path`, 차시 묶음), 플레이 머리, 결과 화면 틀, 학습 기록 화면. **점수·칭호·도장·도감·색종이 등 보상 요소는 D2 범위라 이번에는 만들지 않는다**(자리만 비워 두거나 숨김).
- `ui/icons.js`(인라인 SVG 아이콘), `feedback.anchor(el)`
- 허브(`scripts/lib/hub.mjs`, `hub.css`) 새 모습, `game.json` 선택 필드 `color`, 게임 폴더 `cover.svg`(있으면 인라인)
- **제목 글꼴 Do Hyeon 잘라 넣기**: `scripts/build.mjs`가 게임마다 묶은 JS·CSS·HTML에서 쓰인 글자를 모아 Do Hyeon을 잘라 woff2 data:로 `@font-face`에 넣는다. 개발 서버(`npm run dev`)에서도 제목 글꼴이 보이게 하는 방법을 정한다(예: 개발 서버가 전체 글꼴 파일을 제공). 글꼴은 OFL이다: `src/shared/fonts/OFL.txt`(저작권자 표기 포함)를 저장소에 넣는다.
  - 글꼴 원본: npm `@expo-google-fonts/do-hyeon`(정확한 버전 고정, devDependency) 또는 TTF를 `src/shared/fonts/`에 넣기 중 하나. 저장소에 큰 바이너리를 넣지 않는 앞쪽을 우선하되, 고른 이유를 보고한다. 자르기는 `subset-font`(정확한 버전 고정, devDependency).
  - 빌드 테스트: 글꼴이 들어갔는지, 게임 파일 크기 상한 400 KB 검사, 외부 참조 없음.
- 예시 게임 `style.css`를 새 토큰으로 조금 다듬기(선택). 템플릿은 그대로.
- 문서: `docs/engine.md`(새 인자·`feedback.anchor`·`color`·`cover.svg`), `docs/dev-guide.md`(글꼴 규칙: "외부 글꼴 주소 금지, 제목 글꼴은 빌드가 잘라 넣음"), `README.md`(필요한 만큼)

## 고쳐도 되는 파일 (이 밖은 고치지 않는다)

- `src/shared/**` (새 파일 포함), `scripts/build.mjs`, `scripts/dev.mjs`(글꼴 제공), `scripts/lib/**`
- `package.json`, `package-lock.json` — devDependency는 `subset-font`와 글꼴 패키지만, 정확한 버전으로
- `src/games/sample-divisor-sort/style.css`, `src/games/*/game.json`(`color`만 추가), `src/games/*/cover.svg`(새로)
- 테스트: `tests/unit/build.test.js`, `tests/unit/games.test.js`, 새 `tests/unit/*.test.js`(엔진용), `tests/e2e/smoke.spec.js`, `tests/e2e/sample-divisor-sort.spec.js` — 5-3에 따라 바뀐 화면 때문에 꼭 필요한 만큼만
- `src/games/net-workshop/style.css`, `src/games/net-workshop/view3d.js` — **새 엔진 화면과 어긋나 깨지는 곳을 맞추는 최소한만**(게임 고유 디자인·자유 배치는 N1 범위). `tests/e2e/net-workshop.spec.js`도 같은 이유로 꼭 필요한 만큼만
- 문서: `docs/engine.md`, `docs/dev-guide.md`, `README.md`
- **고치지 않는 것**: `CLAUDE.md`, `docs/design/spec.md`, `docs/games/**`, `src/games/_template/**`(game.json 제외 아님 — 템플릿은 손대지 않음), `src/games/net-workshop/`의 나머지 파일(`fold.js`, `logic.js` 등), `.github/**`, `.claude/**`
- 위 밖을 고쳐야만 하면 고치지 말고 보고에 적는다.

## 지킬 것

- spec 5-2(바뀌지 않는 것)·5-3(테스트가 기대하는 글자·선택자)을 지킨다. 기존 테스트를 고칠 때는 이유를 보고한다. 테스트를 건너뛰게 만들어 통과시키지 않는다.
- 대비 4.5:1, 48px, `prefers-reduced-motion`, 키보드, 1366×680 세로 스크롤 없음(예시 게임·전개도 게임 플레이 화면).
- `git commit`, `git push` 하지 않는다. 임시 파일·스크린샷은 `/tmp/claude-0/-home-user-game2/51527575-3484-5179-b863-3acfe59f4ca9/scratchpad/build-d1/`에만.
- 저장소의 Playwright(1.56.1) 사용, 브라우저 설치 금지. `npm install`로 devDependency를 추가하는 것은 된다(위 두 패키지만).

## 끝났다의 기준

- `npm test`, `npm run test:e2e` 모두 통과
- 예시 게임·전개도 게임·게임 모음을 1366×768·1366×680·820×1180·390×844로 찍어 **시안과 나란히 비교**하며 직접 확인
- 대비 검사 스크립트 통과(시안 때 `contrast.mjs` 참고), 게임 파일 크기 보고

## 최종 보고 (20줄 이하)

바꾼·만든 파일, 글꼴 처리 방법과 이유·크기, 테스트 결과(통과·실패·건너뜀), 고친 기존 테스트와 이유, 시안과 다른 점, 남은 문제, 스크린샷 경로.
