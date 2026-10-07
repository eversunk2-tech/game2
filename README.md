# 초등 5~6학년 학습게임

2022 개정 교육과정(2026학년도부터 초등 5·6학년 적용)에 맞춘 **웹 학습게임**을 만드는 저장소입니다.
게임 하나는 **HTML 파일 하나**로 빌드되어, 링크 하나로 나눠 주거나 파일을 내려받아 인터넷 없이도 열 수 있습니다.

## 지금 있는 것

| | 내용 |
| --- | --- |
| 기획 제안 | [docs/proposal.md](docs/proposal.md): 교과·주제·게임 형태 후보 16개와 추천 |
| 공통 엔진 | 화면 흐름, 단계·별점·잠금, 학습 기록(오개념 집계, 결과 복사), 끌어다 놓기, 효과음 ([사용법](docs/engine.md)) |
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
npm run test:e2e   # 빌드 + 브라우저 테스트
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

**방법 1. GitHub Pages 링크** (추천)

1. 저장소 Settings → Pages → Source를 **GitHub Actions**로 바꿉니다.
2. `main` 브랜치에 올리면 자동으로 배포됩니다.
3. 게임 모음: `https://<계정>.github.io/<저장소>/`, 게임: `…/<게임-id>.html`

비공개 저장소의 Pages는 GitHub 유료 요금제가 필요할 수 있습니다.

**방법 2. 파일로 나눠 주기**: `npm run build` 후 `dist/<게임-id>.html` 파일 하나를 학급 드라이브·클래스룸에 올립니다. 내려받아 브라우저로 열면 됩니다.

### 선생님용 주소 옵션

게임 주소 뒤에 붙입니다. 여러 개는 `&`로 잇습니다. (예: `game.html?unlock=all&sound=off`)

| 옵션 | 동작 |
| --- | --- |
| `?unlock=all` | 모든 단계 열기 |
| `?stage=<단계 id>` | 그 단계로 바로 시작 |
| `?sound=off` | 소리 끄고 시작 |
| `?seed=1` | 모두 같은 문제 순서 |
| `?lesson=<차시 id>` | 그 차시의 단계만 보이기 (차시 묶음이 있는 게임. 예: `net-workshop.html?lesson=cube`) |

## 설계 원칙

- **개인정보를 모으지 않습니다.** 기록은 그 기기 브라우저에만 남고, 이름은 저장하지 않습니다. 결과는 학생이 "결과 복사"로 직접 제출합니다.
- **바깥 파일에 기대지 않습니다.** CDN·웹 글꼴 주소 없이 HTML 하나로 열립니다(학교망 차단·오프라인 대비). 제목 글꼴(배민 도현체 Do Hyeon, SIL OFL 1.1)은 게임에 쓰인 글자만 잘라 파일 안에 넣습니다. 빌드가 바깥 참조와 파일 크기(400 KB 이하)를 검사합니다.
- **교실 기기 기준**: 크롬북 1366×768, 태블릿 터치, 키보드 조작, 누르는 곳 48px 이상.
- **놀이 행동 = 학습 행동**: 퀴즈를 게임으로 감싸기보다 개념을 직접 조작하게 합니다(제안서 2. 선정 기준).
- **틀렸을 때 이유를 알려 줍니다.** 오답은 오개념 tag로 기록되어 결과 화면과 학습 기록에 모입니다.
