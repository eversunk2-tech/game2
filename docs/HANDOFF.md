# 로컬로 이어 하기 (인수인계)

> 작성: 2026-10-08. 클라우드 세션의 무료 크레딧을 넘기지 않도록 클라우드 개발을 여기서 멈추고, 로컬 컴퓨터에서 이어 한다.
> 로컬의 Claude Code에게는 "docs/HANDOFF.md를 읽고 이어서 해 줘"라고 말하면 된다.

## 1. 지금 상태 한눈에

| 구분 | 상태 |
| --- | --- |
| 작업 브랜치 | `claude/laughing-brahmagupta-gb15je` (모든 작업이 여기 있다) |
| `main` (GitHub Pages 배포) | 1차 버전(정육면체 3단계 + N1~N4 수정, 커밋 `125a5b0`). 새 디자인은 아직 배포 안 됨 |
| 작업 규칙 | [CLAUDE.md](../CLAUDE.md): Plan → Build → Review → Embed, 서브에이전트마다 지침 파일, 승인 없이 구현 금지 |
| 기술 규칙 | [docs/dev-guide.md](dev-guide.md), 엔진 사용법 [docs/engine.md](engine.md) |

### 끝난 것 (Review 통과 후 커밋)

1. 기초: 공통 엔진, 예시 게임(약수·배수 분류), 템플릿, 빌드(HTML 한 파일), 테스트, CI·Pages
2. 전개도 접기 공방 1차: 정육면체 차시 3단계 + 엔진 "차시 묶음" (`318690e`), 재검토 수정 (`125a5b0`)
3. D1 디자인 바탕 "종이 공방" + 제목 글꼴 Do Hyeon (`40bdf8b`)
4. D2 공통 게임 요소: 솜씨 점수·칭호·도장판·도감·도전 주문서 틀·축하 연출 (`4b8a1e0`)

### 진행 중: N1 "내 맘대로 전개도" + 전개도 게임 고유 게임 요소

- **구현은 끝났고 Review에서 "수정 필요"**(반드시 수정 1건)가 나왔다. 코드는 마지막 커밋에 **`[검토 중·WIP]`** 표시로 들어 있다. **Review를 다시 통과하기 전에는 `main`에 합치지 않는다.**
- 이 상태에서 테스트는 모두 통과한다: 단위 127개, 브라우저 101개 통과 · 0 실패 · 15 건너뜀(기기별 분리).
- 남은 일: [docs/games/net-workshop/build-fix-brief-n1c.md](games/net-workshop/build-fix-brief-n1c.md)의 N1-1~N1-9를 고친다. 이 수정 라운드는 시작 직후 멈췄고, **아직 하나도 반영되지 않았다**(확인함).
  - **N1-1 (반드시 수정)**: 자유 배치에서 "왜 안 될까요?"를 고르기 전에 무대에 정답 까닭 글자가 보인다(`play-free.js`에서 `view.reveal()`을 먼저 부름).
  - **N1-2 (사용자 결정 완료)**: 자유 배치 점수는 그 모양을 이 기기에서 처음 접을 때만, 노트 등록은 +1. [spec.md 16-8](games/net-workshop/spec.md)
  - N1-3~N1-9: 도감 칩 "n / 11", 결과 점수 칸 잘림, 휴대폰 다시 하기 알림, 표지 정규식 속도, 태블릿 결과 가로 넘침, 1366×680 결과 검사, 떨어진 면 판정 한 곳으로
- 그다음: 별도 Review로 재검토(지침 예: `review-brief-n1.md`를 바탕으로 수정 확인용 지침을 새로 만든다) → 통과하면 커밋(Embed).

### 그다음 할 일 (승인된 계획 순서)

1. **N2 도전 주문서**: 주사위 주문(`cube-dice`), 도감 11가지 주문(`cube-dex`), 선택 시간 재기 — [spec.md 16-5](games/net-workshop/spec.md) N2 행. "주사위 장인" 도장(N1-10)이 이때 받을 수 있게 된다.
2. 새 디자인을 사이트에 올리기: 작업 브랜치를 `main`에 합치는 PR(사용자 확인 후).
3. **2차 직육면체 차시**: spec 14절 2차 + `cuboid-free`(16-2).
4. 성취기준: 사용자가 학교에서 경기도교육청 자료를 받아 오면 `game.json`의 `standards`와 spec 1절을 채운다(지금은 `[]`, "확인 필요").

### 사용자가 내린 결정 (모두 문서에 기록됨)

- 게임: 수학 4번 전개도 접기 공방, 5~6학년, 차시별 10분 안팎, 개인(+교실 TV 시범·같은 seed 짝 활동, 서버 없음)
- 4차시(정육면체·직육면체·각기둥·원기둥), 각뿔·원뿔 제외, CSS 3D, 엔진 차시 묶음
- 디자인 "종이 공방", 제목 글꼴 Do Hyeon, 보상 요소 전부, 도전 주문서 넣기, 정육면체 차시 5·4·3 + 4단계 자유 배치
- 별 3개 단계를 다시 하면 연습 점수 없음([design/spec.md](design/spec.md) 결정 표)
- 자유 배치 점수는 모양마다 한 번만, 노트 +1 (spec 16-8)

## 2. 로컬 준비

1. **Node.js 22 이상**을 설치한다(nodejs.org LTS).
2. 저장소를 받는다.
   ```bash
   git clone https://github.com/eversunk2-tech/game2.git
   cd game2
   git checkout claude/laughing-brahmagupta-gb15je
   npm install
   ```
3. 브라우저 테스트용 Chromium을 한 번 설치한다. Playwright는 **1.56.1로 고정**되어 있다(클라우드의 미리 깔린 브라우저와 맞추려고). 로컬에서는 그대로 두고 이 명령으로 맞는 브라우저를 받는다.
   ```bash
   npx playwright install chromium
   ```
4. 확인:
   ```bash
   npm test           # 단위 127개 통과가 정상
   npm run test:e2e   # 빌드 + 브라우저 101개 통과, 15개 건너뜀이 정상
   npm run dev        # http://localhost:5173 에서 게임 모음
   ```
5. **Claude Code**를 로컬에 설치하고 저장소 폴더에서 실행한다. `CLAUDE.md`는 자동으로 읽힌다. `.claude/hooks/session-start.sh`는 클라우드에서만 동작하도록 되어 있어 로컬에서는 아무것도 하지 않는다(로컬에서는 위 2번의 `npm install`을 직접 한 번 한다).

## 3. 클라우드 전용 경로 바꿔 읽기

지침 파일(`*-brief.md`)에 나오는 `/tmp/claude-0/-home-user-game2/…/scratchpad/` 경로는 클라우드 컨테이너 안의 임시 폴더라 로컬에는 없다.

| 지침에 적힌 경로 | 로컬에서 |
| --- | --- |
| `…/scratchpad/plan-design/shots/` (승인된 시안 스크린샷) | **[docs/design/mockups/](design/mockups/)** 로 옮겨 두었다 (13장) |
| `…/scratchpad/build-*/`, `review-*/` (스크린샷·검증 스크립트) | 없어진다. 새 작업은 저장소 밖 임시 폴더(예: 운영체제 임시 폴더)를 쓰도록 지침에 적는다 |

검토용 독립 계산(정육면체 감싸기)은 이미 단위 테스트(`tests/unit/net-workshop-fold.test.js` 등)에 들어 있다.

## 4. 사이트(GitHub Pages)

- `main`에 올라오면 자동 배포된다(`.github/workflows/pages.yml`). 배포 환경 `github-pages`는 `main`에서 배포하도록 설정되어 있다.
- 새 버전 올리기: 작업 브랜치 → `main` PR을 만들어 합친다. **Review를 통과하지 않은 WIP 커밋이 있는 동안은 합치지 않는다.**
- 주소: `https://eversunk2-tech.github.io/game2/` · 정육면체 차시 `…/net-workshop.html?lesson=cube`
