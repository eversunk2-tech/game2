# 개발 가이드

초등 5~6학년(2022 개정 교육과정) 웹 학습게임 저장소의 기술 기준. 작업 순서는 [CLAUDE.md](../CLAUDE.md)의 작업 사이클(Plan → Build → Review → Embed)을 따르고, 이 문서는 Plan·Build·Review 서브에이전트가 지킬 기술 규칙이다.
게임 후보·선정 기준은 [proposal.md](proposal.md), 엔진 사용법은 [engine.md](engine.md).

## 명령

```bash
npm install          # 클라우드 세션은 .claude/hooks/session-start.sh가 자동 실행
npm run dev          # http://localhost:5173 (src/를 그대로 보여 줌, 빌드 불필요. 제목 글꼴은 전체 파일을 /__fonts/에서 줌)
npm test             # 단위 테스트 (node --test, tests/unit/**/*.test.js)
npm run build        # dist/<id>.html (게임마다 파일 하나, 제목 글꼴을 쓰인 글자만 잘라 넣음) + dist/index.html (게임 모음)
npm run test:e2e     # 빌드 후 Playwright (크롬북 1366×768, 태블릿 820×1180 터치)
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

- **게임은 빌드 후 HTML 파일 하나.** `index.html`에는 `<link rel="stylesheet">`와 `<script type="module" src="./main.js">`만 쓴다. 외부 CDN·웹 글꼴·`<img src>` 금지. 그림은 CSS `url()`로(빌드가 data:로 넣음). JS에서 CSS·그림 파일을 import하지 않는다. 게임 파일 하나는 400 KB 이하(빌드가 검사).
- **글꼴**: 외부 글꼴 주소(Google Fonts 등)·글꼴 파일 `url()` 금지. 본문은 기기 글꼴(`var(--font)`), 제목·버튼·숫자는 `var(--font-display)` + `font-weight: 700`. 제목 글꼴(Do Hyeon, SIL OFL 1.1, npm `@expo-google-fonts/do-hyeon`)은 **빌드가 게임에 쓰인 글자만 잘라 넣는다**(`scripts/lib/font.mjs`, 라이선스 `src/shared/fonts/OFL.txt`). 다른 글꼴이 필요하면 엔진에서 같은 방법으로 넣고 라이선스를 먼저 확인한다.
- **디자인**: 공통 디자인 "종이 공방"([docs/design/spec.md](design/spec.md))을 따른다. 색·간격·그림자는 `base.css` 토큰을 쓰고 새 색을 만들지 않는다(대비 4.5:1). 이모지 대신 `ui/icons.js`의 아이콘. 잉크 테두리 + 단단한 그림자는 누를 수 있는 것에만. 게임 색은 `game.json`의 `color`, 게임 모음 표지는 게임 폴더 `cover.svg`.
- **엔진을 먼저 쓴다.** 화면 흐름·별·잠금·기록·피드백·끌어다 놓기는 `src/shared`에 있다. 여러 게임에 필요한 기능은 게임 폴더가 아니라 엔진에 추가하고 `docs/engine.md`도 고친다.
- **성취기준 코드·원문을 추측하지 않는다.** 출처 자료(경기도교육청 예시자료 등)에서 확인한 것만 `game.json`의 `standards`와 기획서에 쓴다. 확인 못 하면 `[]`와 "확인 필요".
- **학생 개인정보를 저장·전송하지 않는다.** 서버·분석 도구·외부 요청 없음. 기록은 `createStorage`(localStorage)만.
- **오답에는 이유를 보여 준다.** `ctx.log.answer`의 `tag`는 기획서 오개념 표의 말과 같게 쓴다.
- **화면 문장**: 초등 5~6학년 눈높이, 해요체, 짧은 문장. 숫자 뒤 조사는 `josa()`로 고른다.
- **교실 기기**: 1366×768(실제 보이는 높이 약 680)에서 스크롤 없이 플레이, 터치 대상 48px 이상, 마우스·터치·키보드 모두 가능, 색만으로 정답·오답 구분 금지. 움직임은 `transform`·`opacity`만, `prefers-reduced-motion`이면 끝 상태로.
- **DOM은 `h()`로 만든다.** `innerHTML` 금지.
- 코드 주석·문서는 한국어. 파일·변수·id는 영어.

## 구조

```
src/shared/core/     storage, progress, learning-log, random, korean, title-mark, canvas  ← Node에서 테스트 가능한 순수 로직
src/shared/ui/       app(createGameApp), dom(h), icons, drag-drop, feedback, audio
src/shared/styles/   base.css(토큰·부품·엔진 화면), hub.css
src/shared/fonts/    제목 글꼴 라이선스(OFL.txt). 글꼴 파일은 npm 패키지에서 빌드가 잘라 넣음
src/games/<id>/      game.json, index.html, main.js, logic.js, style.css
src/games/_template/ 새 게임 템플릿 (밑줄 폴더는 빌드에서 빠짐)
scripts/             build.mjs(esbuild로 인라인 + 글꼴 잘라 넣기 + 크기 검사), dev.mjs, new-game.mjs, lib/(games, hub, font)
docs/games/<id>/      spec.md, review.md, 서브에이전트 지침(*-brief.md)
```

배포: `main`에 push하면 `.github/workflows/pages.yml`이 GitHub Pages로 배포(저장소 설정에서 Pages Source를 GitHub Actions로 켜야 함). CI는 모든 push에서 단위·브라우저 테스트.
