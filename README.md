# 초등 5~6학년 학습게임

> **이어 하기**: 클라우드 개발은 2026-10-08에 멈췄어요. 로컬에서 이어 하는 방법과 지금 상태는 [docs/HANDOFF.md](docs/HANDOFF.md)에 있어요.

2022 개정 교육과정(2026학년도부터 초등 5·6학년 적용)에 맞춘 **웹 학습게임**을 만드는 저장소입니다.
게임마다 HTML 한 장과 함께 쓰는 파일들(JS·CSS·글꼴·그림 — `dist/assets/`, 이름에 내용 해시)로 빌드되고, 학생은 **사이트 주소**로 엽니다(파일을 내려받아 여는 쓰임은 지원하지 않습니다).

## 지금 있는 것

| | 내용 |
| --- | --- |
| 기획 제안 | [docs/proposal.md](docs/proposal.md): 교과·주제·게임 형태 후보 16개와 추천 |
| 공통 엔진 | 화면 흐름, 단계·별점·잠금, 학습 기록(오개념 집계, 결과 복사), 끌어다 놓기, 효과음 ([사용법](docs/engine.md)) |
| 공통 게임 요소 | 솜씨 점수·칭호·연속·다시 일어서기·도장판·도감·도전 주문서·축하 연출. 학습 행동에만 점수를 주고 빠르기 점수·순위표가 없음 ([engine.md 10절](docs/engine.md)) |
| 공통 디자인 | "종이 공방": 종이 바탕·잉크 테두리·색종이 ([기획](docs/design/spec.md)). 엔진에 들어 있어 모든 게임이 같은 모습 |
| 예시 게임 | 약수·배수 분류 (5-1 약수와 배수): 엔진이 실제로 돌아가는 모습 |
| 템플릿 | 새 게임 폴더 + 기획서 템플릿([docs/game-design-template.md](docs/game-design-template.md)) |
| 검사 | 단위 테스트(Node), 브라우저 테스트(Playwright: 크롬북·태블릿 화면) |
| 배포 | GitHub Actions: 검사(CI), GitHub Pages 배포 |

**다음 단계**: [제안서](docs/proposal.md)에서 게임 1~3개와 학년을 고르고, 한 판 길이(10분 / 차시 전체)와 개인·모둠을 정하면 기획서를 쓰고 구현합니다.

## 빠른 시작

Node.js 22 이상이 필요합니다.

```bash
npm install        # 처음 한 번
npm run dev        # 개발 서버 http://localhost:5173 (저장 후 새로고침)
npm test           # 단위 테스트
npm run build      # dist/에 게임 파일 만들기
npm run preview    # 빌드 결과를 사이트와 같은 조건(하위 경로)으로 보기 http://127.0.0.1:4173/game2/
npm run test:e2e   # 빌드 + 브라우저 테스트 (같은 조건의 테스트 서버를 띄운다. 포트는 E2E_PORT, 기본 4173)
```

## 새 게임 만들기

```bash
npm run new -- fraction-factory "분수 공장"
```

1. `docs/games/fraction-factory/spec.md` 기획서를 채우고 승인을 받습니다 (작업 순서는 [CLAUDE.md](CLAUDE.md)).
2. `src/games/fraction-factory/game.json`에 교과·학년·단원을 씁니다.
3. `main.js`와 `logic.js`를 기획서대로 구현합니다. ([엔진 사용법](docs/engine.md))
4. `npm test && npm run test:e2e`가 통과하면 끝.

## 폴더 구조

```
docs/
  proposal.md               기획 제안 (인수인계 문서)
  game-design-template.md   게임 기획서 템플릿
  engine.md                 공통 엔진 사용법
  games/<id>/               게임별 spec.md(기획), review.md(검증)
  dev-guide.md              기술 규칙 (서브에이전트용)
src/
  shared/                   공통 엔진 (core: 로직, ui: 화면, styles: CSS)
  games/<id>/               게임 하나 = 폴더 하나
  games/_template/          새 게임 템플릿 (빌드에서 빠짐)
scripts/                    build, dev 서버, new-game
tests/unit/                 단위 테스트 (node --test)
tests/e2e/                  브라우저 테스트 (Playwright)
```

## 학생에게 나눠 주기

사이트 주소(GitHub Pages)를 나눠 줍니다.

1. 저장소 Settings → Pages → Source를 **GitHub Actions**로 바꿉니다.
2. `main` 브랜치에 올리면 자동으로 배포됩니다.
3. 게임 모음: `https://<계정>.github.io/<저장소>/`, 게임: `…/<게임-id>.html` (이 저장소: `https://eversunk2-tech.github.io/game2/`)

- **수업 시간에는 새 버전을 올리지 않습니다.** 올린 직후 몇 분 동안은 학생 브라우저가 옛 화면이 찾는 파일을 못 받을 수 있습니다(게임이 한 번 저절로 새로 고치거나 "새 버전이 올라왔어요" 화면에서 [새로 고침]을 누르면 됩니다 — 모은 별과 기록은 그대로).
- `dist/`의 파일을 더블클릭해 열면 게임이 열리지 않습니다(브라우저가 파일 주소에서 모듈 스크립트를 막습니다). 빌드 결과는 `npm run preview`로 봅니다.

비공개 저장소의 Pages는 GitHub 유료 요금제가 필요할 수 있습니다.

### 선생님용 주소 옵션

게임 주소 뒤에 붙입니다. 여러 개는 `&`로 잇습니다. (예: `game.html?unlock=all&sound=off`)

| 옵션 | 동작 |
| --- | --- |
| `?unlock=all` | 모든 단계 열기 |
| `?stage=<단계 id>` | 그 단계로 바로 시작 |
| `?sound=off` | 소리 끄고 시작 |
| `?seed=1` | 모두 같은 문제 순서 |
| `?lesson=<차시 id>` | 그 차시의 단계만 보이기 (차시 묶음이 있는 게임. 예: `net-workshop.html?lesson=cube`) |
| `?grade=<학년>` | 그 학년 화면으로 바로 (학년이 있는 게임. 예: 입체도형 공방 `net-workshop.html?grade=6`) |
| `?area=<영역 id>` | 그 영역의 단계 지도로 바로 (영역이 있는 게임. 예: 입체도형 공방 `net-workshop.html?area=blocks` — 영역 `cube` 정육면체의 전개도 · `cuboid` 직육면체의 전개도 · `blocks` 쌓기나무). 차례는 `?lesson=` > `?area=` > `?grade=` |
| `?fx=low` | 효과 줄이기 (느린 기기: 색종이·화면 움직임 끔. CPU 코어 2개 이하 기기는 저절로) |

## 설계 원칙

- **개인정보를 모으지 않습니다.** 기록은 그 기기 브라우저에만 남고, 이름은 저장하지 않습니다. 결과는 학생이 "결과 복사"로 직접 제출합니다.
- **학습 행동에만 보상합니다.** 솜씨 점수는 정확히 맞히기·틀린 뒤 다시 도전하기·새로 찾기·설명하기에만 주고, 일부러 틀려도 이득이 없습니다(단위 테스트로 검사). 빠르기 점수·순위표·친구 비교·목숨·뽑기는 없습니다.
- **바깥 파일에 기대지 않습니다.** CDN·웹 글꼴 주소 없이 같은 사이트의 파일(상대 주소 `./assets/…`)로만 열립니다(학교망 차단 대비). 제목 글꼴(배민 도현체 Do Hyeon, SIL OFL 1.1)은 사이트에 쓰인 글자만 잘라 파일 하나로 둡니다. 영역마다의 플레이 코드는 그 영역에 들어갈 때 받아(처음 화면이 그려진 뒤 미리 받아 둠) 영역이 늘어도 처음 화면이 무거워지지 않습니다. 빌드가 바깥 주소·없는 파일·`/`로 시작하는 주소를 검사합니다(파일 크기에는 상한이 없고, 처음 받는 크기를 로그에 찍습니다).
- **교실 기기 기준**: 크롬북 1366×768, 태블릿 터치, 키보드 조작, 누르는 곳 48px 이상.
- **놀이 행동 = 학습 행동**: 퀴즈를 게임으로 감싸기보다 개념을 직접 조작하게 합니다(제안서 2. 선정 기준).
- **틀렸을 때 이유를 알려 줍니다.** 오답은 오개념 tag로 기록되어 결과 화면과 학습 기록에 모입니다.
