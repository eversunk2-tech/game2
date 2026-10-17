# 개발 가이드

초등 5~6학년(2022 개정 교육과정) 웹 학습게임 저장소의 기술 기준. 작업 순서는 [CLAUDE.md](../CLAUDE.md)의 작업 사이클(Plan → Build → Review → Embed)을 따르고, 이 문서는 Plan·Build·Review 서브에이전트가 지킬 기술 규칙이다.
게임 후보·선정 기준은 [proposal.md](proposal.md), 엔진 사용법은 [engine.md](engine.md).

## 명령

```bash
npm install          # 클라우드 세션은 .claude/hooks/session-start.sh가 자동 실행
npm run dev          # http://localhost:5173 (src/를 그대로 보여 줌, 빌드 불필요. 제목 글꼴은 전체 파일을 /__fonts/에서 줌). 주소는 사이트와 같은 뜻: / → 입체도형 공방(인트로), …/teacher.html → 선생님용 안내, /__games/ → 개발용 게임 모음(템플릿·예시까지)
npm test             # 단위 테스트 (node --test, tests/unit/**/*.test.js)
npm run build        # dist/<id>.html(HTML 한 장) + dist/assets/(해시 이름의 JS·CSS·제목 글꼴 하나·큰 그림) + dist/index.html(사이트 맨 위 = 입체도형 공방과 같은 HTML) + dist/teacher.html(선생님용 안내). 처음 받는 크기를 로그에
npm run preview      # 빌드 결과를 사이트와 같은 조건으로 보기: http://127.0.0.1:4173/game2/ (scripts/serve.mjs — 하위 경로·gzip. --port로 바꿈)
npm run test:e2e     # 빌드 후 Playwright: 같은 서버를 띄워 연다(포트 E2E_PORT, 기본 4173 — 이미 쓰이고 있으면 실패). 크롬북 1366×768, 태블릿 820×1180 터치
E2E_WIDE_TEXT=font npm run test:e2e   # 글꼴 흉내 모드: 본문을 한글 폭이 넓은 글꼴로 바꿔 리눅스 CI의 줄 넘김을 미리 본다(engine.md 11절). 이것도 실패 0이어야 한다
npm run new -- <id> "<이름>"   # src/games/_template 복사 + docs/games/<id>/spec.md 기획서
```

`@playwright/test`는 1.56.1로 고정했다. 이 환경에 미리 설치된 Chromium(/opt/pw-browsers, chromium-1194)과 맞추기 위해서다. 올리려면 브라우저 경로 문제부터 확인한다.

## 게임별 문서와 파일

```
docs/games/<id>/
  spec.md          Plan 결과 (기획서 템플릿 docs/game-design-template.md 항목 + 파일 구조). 사용자 승인 후 Build
  review.md        Review 결과
  *-brief.md       서브에이전트 지침 파일 (plan-brief, build-brief, review-brief)
src/games/<id>/    npm run new -- <id> "<이름>" 으로 만든다 (spec.md가 있으면 덮어쓰지 않음)
tests/unit/<id>.test.js, tests/e2e/<id>.spec.js
```

- 규칙·채점·문제 생성은 `logic.js`(순수 함수)에 쓰고 단위 테스트로 검사한다. 화면은 `main.js`.
- 공통 검사(tests/e2e/smoke.spec.js)는 모든 게임에 자동 적용된다.
- 완료 기준: `npm test && npm run test:e2e` 통과 + 크롬북·태블릿·휴대폰 크기 스크린샷을 직접 보고 확인.

## 지켜야 할 것

- **결정(2026-10-09, 사용자): "게임은 빌드 후 HTML 파일 하나"와 "게임 파일 하나는 400 KB 이하" 규칙은 없앴다.** 사용자의 말: "단일 html로 하지 않아도 돼. 처음에 설정을 잘못 했던거 같아. js 환경으로 자유로운 용량으로 만들어줘". 여러 파일로 내보내기와 npm 라이브러리(묶어서 함께 내보냄)를 써도 된다. 바깥 CDN·웹 글꼴 주소를 쓰지 않는 것과 개인정보·바깥 요청 없음은 그대로 둔다. 학생들은 사이트 주소(GitHub Pages, 하위 경로 `/game2/`)로 접속해서 쓴다(같은 날 사용자 결정) — 파일을 내려받아 `file://`로 여는 쓰임은 지원하지 않는다(ES 모듈이라 열리지도 않는다). 빌드 구조는 6학년 영역 계획([spec-grade6.md](games/net-workshop/spec-grade6.md) 7-3절 안 B·7-4절)의 B0b에서 여러 파일로 바꿨다(2026-10-17).
- **게임은 빌드 후 HTML 한 장 + `dist/assets/`의 파일들(여러 파일).** esbuild가 모든 게임을 한 번에 묶는다(`format: 'esm'`, `splitting: true`): 게임 들머리 `<id>-해시.js`, 게임끼리 같이 쓰는 묶음 `chunk-해시.js`(엔진 등 — 한 번 받으면 캐시), 늦게 받는 묶음(`import()`), CSS는 `<link>`마다 `이름-해시.css`(엔진 `base-해시.css`는 모든 게임·선생님용 안내가 같은 파일). 이름에 내용 해시가 있어 새 버전을 올리면 새 이름이 된다(옛 JS와 새 CSS가 섞이지 않는다).
  - `index.html`에는 `<link rel="stylesheet">`와 `<script type="module" src="./main.js">`만 쓴다(빌드가 그 주소만 해시 이름으로 바꾸고 `modulepreload`·글꼴 `preload`를 넣는다). 외부 CDN·웹 글꼴·`<img src>` 금지.
  - **주소는 모두 상대 주소**(`./assets/…`, CSS 안에서는 같은 폴더의 `./이름`, JS 사이는 `./이름`). `/`로 시작하는 주소 금지 — 사이트가 `/game2/` 하위 경로에 있다.
  - 그림은 CSS `url()`(게임 CSS 안에서) — 빌드가 SVG·16 KB 미만의 래스터 그림은 `data:`로 넣고, 16 KB 이상의 래스터 그림(png·jpg·gif·webp)은 `file` 로더로 `dist/assets/<이름>-<해시>.<확장자>`에 바이트 그대로 내보낸다(B0c2 — 캔바 AI 그림의 출처 정보가 남는다, engine.md 7절). JS에서 CSS·그림 파일을 import하지 않는다.
  - 영역마다의 플레이처럼 처음 화면에 필요 없는 코드는 그 영역에 들어갈 때 받는다(`lazyModule(() => import('./…'))` — engine.md 2절 "늦게 불러오기"). 처음 화면이 그려진 뒤 한가할 때 미리 받아 둔다.
  - 빌드 검사(어기면 실패): 결과물 전체에 바깥 주소(`http(s)://`·`//` — SVG 이름공간만 허용) 없음, 가리키는 파일이 모두 있음, `/`로 시작하는 주소 없음. 크기에는 상한이 없다 — 게임마다 "처음 화면이 받는 크기(gzip)"와 늦게 받는 묶음을 로그에 찍고, 300 KB를 넘으면 알림만.
  - 빌드 결과는 `npm run preview`(사이트와 같은 하위 경로·gzip 서버)로 확인한다. `dist/`를 더블클릭해 열면 안 열린다.
- **사이트 맨 위 주소는 게임 인트로, 게임 모음은 선생님용 안내 페이지**(2026-10-17 사용자 요청 — spec-grade6 15-13): 빌드가 `FRONT_GAME`(입체도형 공방)의 게임 HTML을 `dist/index.html`로도 내보낸다(같은 폴더라 `./assets/` 주소가 그대로 맞고, 넘겨 주기가 없어 다른 화면이 번쩍 보이지 않는다. 같은 출처라 저장 열쇠·기록이 `net-workshop.html`과 같다). 전의 게임 모음은 `dist/teacher.html`(`GUIDE_PAGE`, `scripts/lib/hub.mjs`의 `renderTeacherGuide`)로 바뀌었다: 맨 위 [← 학년 고르기], 게임 카드(인트로를 건너뛰는 `?intro=0` 주소), 선생님용 주소 옵션, 기록 안내(학생 기록은 사이트 주소마다 따로), 맨 아래 저작권 글. 목록에 보이지 않을 게임(예시 게임)은 `game.json`에 `"listed": false` — 파일은 그대로 만들어 주소로만 연다. 학년 고르기 화면의 [선생님용 안내]는 게임이 엔진에 주는 `teacherGuide`(engine.md 2절 "맨 아래 줄"). 개발 서버(`scripts/dev.mjs`)도 사이트와 같은 뜻이다(사용자 결정 2026-10-18 — 15-13 끝): `/` → `/games/<FRONT_GAME>/`(쿼리 그대로), `…/teacher.html` → 같은 선생님용 안내(`scripts/lib/site.mjs`의 `teacherGuideHtml`을 빌드와 같이 쓴다 — 게임 링크만 개발 서버 주소), 전의 개발용 게임 모음(`renderHub` — 템플릿·예시까지)은 `/__games/`
  - 두 사이트에 같은 `dist/`가 올라간다: GitHub Pages(하위 경로 `/game2/`)·Cloudflare Pages(맨 위 경로, `/teacher.html` → `/teacher`처럼 `.html`을 뺀 주소로 308 — 쿼리 그대로). 게임 안의 주소가 모두 상대 주소(`./assets/…`, `./teacher.html`, `net-workshop.html?intro=0`)라 두 곳에서 같게 열린다
- **글꼴**: 외부 글꼴 주소(Google Fonts 등)·게임·엔진 CSS의 글꼴 파일 `url()` 금지. 본문은 기기 글꼴(`var(--font)`), 제목·버튼·숫자는 `var(--font-display)` + `font-weight: 700`. 제목 글꼴(Do Hyeon, SIL OFL 1.1, npm `@expo-google-fonts/do-hyeon`)은 **빌드가 사이트 전체(선생님용 안내 + 모든 게임의 JS·CSS·HTML)에 쓰인 글자만 잘라 `dist/assets/display-해시.woff2` 하나로 내보낸다**(`scripts/lib/font.mjs`, 라이선스 `src/shared/fonts/OFL.txt` — 글꼴 안의 이름 정보와 HTML의 `@font-face` 앞 알림에 남는다). 다른 글꼴이 필요하면 엔진에서 같은 방법으로 넣고 라이선스를 먼저 확인한다. 제목·버튼 자리에는 Do Hyeon에 없는 기호(가운뎃점 `·`, `…`, 이모지 등)를 쓰지 않는다(가운뎃점은 `ㆍ`). 빌드 로그의 "알림: 제목 글꼴에 없는 기호"를 확인한다. 화면에 쓰는 한글 음절이 Do Hyeon에 없으면 본문 글자라도 `tests/unit/build.test.js`가 실패한다(드문 글자는 다른 낱말로).
- **디자인**: 공통 디자인 "종이 공방"([docs/design/spec.md](design/spec.md))을 따른다. 색·간격·그림자는 `base.css` 토큰을 쓰고 새 색을 만들지 않는다(대비 4.5:1). 이모지 대신 `ui/icons.js`의 아이콘. 잉크 테두리 + 단단한 그림자는 누를 수 있는 것에만. 게임 색은 `game.json`의 `color`, 게임 카드 표지는 게임 폴더 `cover.svg`.
- **보상은 학습 행동에만.** 솜씨 점수·칭호·도장·도감은 엔진(`core/rewards.js`, `core/collection.js`)이 준다. 게임은 `ctx.log.answer`(문항마다 같은 `itemId`)·`ctx.reward.event`·`ctx.collect`로 행동을 알리기만 하고 점수를 직접 만들지 않는다. 빠르기 점수·순위표·친구 비교·목숨(틀리면 쫓겨남)·뽑기는 만들지 않는다. 일부러 틀려서 이득을 보는 규칙이 없는지 단위 테스트로 확인한다([engine.md 10절](engine.md)).
- **엔진을 먼저 쓴다.** 화면 흐름·별·잠금·기록·피드백·끌어다 놓기는 `src/shared`에 있다. 여러 게임에 필요한 기능은 게임 폴더가 아니라 엔진에 추가하고 `docs/engine.md`도 고친다.
- **성취기준 코드·원문을 추측하지 않는다.** 출처 자료(경기도교육청 예시자료 등)에서 확인한 것만 `game.json`의 `standards`와 기획서에 쓴다. 확인 못 하면 `[]`와 "확인 필요".
- **학생 개인정보를 저장·전송하지 않는다.** 서버·분석 도구·외부 요청 없음. 기록은 `createStorage`(localStorage)만.
- **오답에는 이유를 보여 준다.** `ctx.log.answer`의 `tag`는 기획서 오개념 표의 말과 같게 쓴다.
- **화면 문장**: 초등 5~6학년 눈높이, 해요체, 짧은 문장. 숫자 뒤 조사는 `josa()`로 고른다.
- **교실 기기**: 1366×768(실제 보이는 높이 약 680)에서 스크롤 없이 플레이(결과 화면 포함), 터치 대상 48px 이상, 마우스·터치·키보드 모두 가능, 색만으로 정답·오답 구분 금지. 움직임은 `transform`·`opacity`만, `prefers-reduced-motion`이나 `?fx=low`면 끝 상태로(색종이 없음).
- **DOM은 `h()`로 만든다.** `innerHTML` 금지.
- 코드 주석·문서는 한국어. 파일·변수·id는 영어.

## 구조

```
src/shared/core/     storage, progress, learning-log, random, korean, title-mark, canvas, rewards, collection, areas, intro-fit, reload  ← Node에서 테스트 가능한 순수 로직
src/shared/ui/       app(createGameApp), dom(h), icons, drag-drop, feedback, audio, celebrate, rewards-view
src/shared/styles/   base.css(토큰·부품·엔진 화면), hub.css
src/shared/fonts/    제목 글꼴 라이선스(OFL.txt). 글꼴 파일은 npm 패키지에서 빌드가 잘라 넣음
src/games/<id>/      game.json, index.html, main.js, logic.js, style.css
src/games/_template/ 새 게임 템플릿 (밑줄 폴더는 빌드에서 빠짐)
scripts/             build.mjs(esbuild 여러 파일 묶기 + 글꼴 자르기 + 결과물 검사), serve.mjs(빌드 결과를 하위 경로로 — preview·e2e), dev.mjs, new-game.mjs, lib/(games, hub, font)
docs/games/<id>/      spec.md, review.md, 서브에이전트 지침(*-brief.md)
```

배포: `main`에 push하면 `.github/workflows/pages.yml`이 GitHub Pages로 배포(저장소 설정에서 Pages Source를 GitHub Actions로 켜야 함). CI는 모든 push에서 단위·브라우저 테스트.
