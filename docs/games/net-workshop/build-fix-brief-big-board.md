# Build 수정 지침: 자유 쌓기 "더 큰 판" — 전체 화면 안내 글 (트랙 "blocks" 작업 폴더)

## 역할과 범위

- 너는 큰 판을 만든 **Build** 담당이다. 큰 판은 Review를 통과해 `main`에 올라갔다(`571cddc`). 이번에는 사용자 결정 **15-41 B-5** 하나만 반영한다.
  - 결정: [spec-grade6.md](spec-grade6.md) 15-41
  - 검토: [review-blocks-big.md](review-blocks-big.md) B-5
- **고칠 수 있는 파일**:
  - `src/games/net-workshop/blocks/free-big.js`
  - `src/games/net-workshop/blocks/play-free-build.js` — 주석만 고친다. 동작은 바꾸지 않는다.
  - `tests/unit/net-workshop-blocks-big.test.js`
  - `tests/e2e/net-workshop-blocks-big.spec.js`
- 그 밖의 파일은 건드리지 않는다.
- 사용자 결정으로 **고치지 않기로 한 것**: B-1(좁은 창 가림 — "다음 기회에"), B-4(알림이 펼친 판 18칸 — "그대로 두기"). 이번에 손대지 않는다.

## 고칠 것

1. 큰 판에 들어갈 때 처음 한 번 뜨는 전체 화면 안내 글을 바꾼다.
   - 지금: `free-big.js:33` `FULL_ESC = '전체 화면을 나가려면 Esc를 눌러요.'`
   - 바꿀 글(사용자가 고른 글 그대로): **`전체 화면을 나가려면 [전체 화면]을 다시 눌러요.`**
   - 이 글이 쓰이는 곳은 모두 같은 글이 되게 한다. 쓰이는 곳:
     - 들어갈 때 알림의 화면 글과 화면 읽기 알림(`play-free-build.js:683` · `:714`)
     - 주석(`play-free-build.js:639`)
     - 검사: `net-workshop-blocks-big.test.js:127`, `net-workshop-blocks-big.spec.js:20`
   - 상수 · 함수 이름(`FULL_ESC` · `tellEsc` · `escTold`)은 그대로 둬도 된다. 바꾸려면 저 파일들 안에서만 바꾼다.
2. 글이 길어지므로 알림 줄 수와 자리를 다시 잰다(`BIG_HELLO` + 새 글).
   - 잴 곳: 큰 판의 모든 크기(8가지 + 1366×653 · 633 · 683×680), 보통 · 글꼴 흉내.
   - 볼 것: 알림이 띠 · 조작 버튼을 가리지 않는지(0), 화면 밖 · 잘림 0.
   - 683×680에서 알림이 펼친 판 칸을 가리는 수: 이것은 B-4로 "그대로 두기"다. 다만 지금(18칸 · 글꼴 흉내 20칸)보다 늘어나면 그 수를 보고한다.
3. [전체 화면]을 끄고 켤 때 안내 글이 "처음 한 번"인 동작은 그대로 둔다.
   - 기기가 전체 화면을 못 하면 [전체 화면] 버튼이 없다. 이때는 이 글이 뜨지 않아야 한다 — 지금 동작을 확인만 한다.
   - 지금 검사에 이 경우가 없으면 하나 더한다.

## 검사 · 끝나면

- 시작 전:
  - 작업 폴더 `.worktrees/blocks`는 코디네이터가 `main`(이 지침이 들어간 커밋)에 맞춰 둔다.
  - `git -C .worktrees/blocks log --oneline -1`로 확인한다.
- 테스트 셋을 **처음부터** 실패 0으로 돌린다. 보통과 글꼴 흉내는 하나씩 차례로 돌린다.
  - `npm test`
  - `E2E_PORT=5352 npm run test:e2e -- --workers=4`
  - `E2E_PORT=5352 E2E_WIDE_TEXT=font npm run test:e2e -- --workers=4`
- 고친 검사(`net-workshop-blocks-big.spec.js`)를 CPU 4 · 8 · 12배로 돌린다(포트 5353).
- 작업 조건은 이전과 같다.
  - 작업 폴더 `.worktrees/blocks`, 브랜치 `track/blocks`
  - 포트 5302 · e2e 5352~5353
  - scratchpad `build-big/`(그림 `shots-fix/`)
- 그 밖의 조건:
  - 커밋은 `track/blocks`에 한다. 푸시 · 합치기는 하지 않는다.
  - 띄운 서버는 네 PID만 내리고, 끝나면 모두 내린다.
  - `npm install` · `npm ci` · 내려받기는 하지 않는다.
- 보고(10줄 이하):
  - 바꾼 곳과 커밋
  - 알림 줄 수 · 가림 잰 값(크기마다)
  - 683×680 칸 수
  - 테스트 수치
  - 확인 못 한 것
  - 큰 판 알림 그림 두 장의 경로: 크롬북 1366×768 · 세로 태블릿 820×1180
