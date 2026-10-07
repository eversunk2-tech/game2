# Review: 전개도 접기 공방 1차 (정육면체 차시)

판정: 통과 (반드시 수정 0건 · 고치면 좋음 6건 · 참고 7건)
검토일: 2026-10-07

- 기준: [spec.md](spec.md)(14절 1차, 결정 표), [build-brief-m1.md](build-brief-m1.md), [review-brief-m1.md](review-brief-m1.md), docs/dev-guide.md, docs/engine.md
- 대상: 커밋 `6a2971e` 위의 작업 트리 변경 전부 (수정 7개 파일 + 새 파일 `src/games/net-workshop/` 12개, 테스트 3개)
- Review가 직접 쓴 검증 스크립트·스크린샷: `/tmp/claude-0/-home-user-game2/51527575-3484-5179-b863-3acfe59f4ca9/scratchpad/review-m1/` (`indep.mjs` 수학 독립 검증, `play.mjs` 세 기기 끝까지 플레이, `checks.mjs` 키보드·정답 노출·움직임 줄이기·주소 옵션·정리, `engine-compare.mjs` 예시 게임 엔진 전후 비교, `labels.mjs` 까닭 문장 ↔ 화면 면 이름, `shots/` 스크린샷 62장)
- 아래 내용은 모두 이 Review가 직접 실행·계산한 결과다. 확인하지 못한 것은 맨 끝에 따로 적었다.

## 테스트 결과

| 명령 | 결과 |
| --- | --- |
| `npm test` | 64개 통과 / 실패 0 / 건너뜀 0 (그중 `net-workshop-fold` 14 + `net-workshop-logic` 7 = 21개, `progress` openIds 2개 추가) |
| `npm run build` | `dist/net-workshop.html` 63.3 KB (기획서 예상 60~90 KB), `dist/sample-divisor-sort.html` 33.4 KB |
| `npm run test:e2e` | 46개 중 42개 통과 / 실패 0 / 건너뜀 4 |

건너뜀 4개는 모두 정당하다.
- `net-workshop.spec.js` 2개: 키보드 검사는 `chromebook`에서만, 터치 끌기 검사는 `tablet`에서만 돌도록 `test.skip`으로 나눴다 (두 기기에서 각각 한 번씩은 돈다).
- `sample-divisor-sort.spec.js` 2개: 태블릿에서 마우스 끌기·키보드를 건너뛰는 기존 검사다. 이 파일은 이번에 바뀌지 않았다.

## 발견한 문제

| # | 심각도 | 위치 (파일:줄) | 문제 | 재현 방법 | 고칠 방향 |
| --- | --- | --- | --- | --- | --- |
| 1 | 고치면 좋음 | `src/games/net-workshop/logic.js:202-204` | `cube-complete`에서 보이는 오답 자리가 **늘 2곳**이고 정답 자리는 2~4곳이다. 뺀 면이 갈 수 있는 정답 후보는 늘 4곳(8000문항 모두)이라 `nWrong = max(2, total - right.length)`가 항상 2가 된다. 아무 데나 놓아도 첫 시도가 맞을 확률이 평균 **58.8%**라 찍어서 풀 수 있다. 기획서 문구("정답 1개 이상·오답 2개 이상, 4~6곳")는 지키지만 학습 효과가 약하다. | `scratchpad/review-m1/guess.mjs` (시드 2000개 × 4문항: 보이는 오답은 모두 2곳, 정답 2·3·4곳). 화면: `?unlock=all&seed=7&stage=cube-complete` 1번은 정답 4곳 + 오답 2곳 | 정답 자리를 1~2곳으로 줄이고 나머지를 오답으로 채운다(예: `nRight = rng.int(1, 2)`, `nWrong = total - nRight`; 오답 후보는 늘 4~7곳이라 충분). 테스트에 "오답 수 ≥ 정답 수"를 넣는다. |
| 2 | 고치면 좋음 | `src/games/net-workshop/play-pick.js:48`, `:55`, `src/games/net-workshop/play-place.js:98` (원인: `src/shared/styles/base.css:200-201`, `:218-225`) | 틀린 면을 누르면 엔진의 흔들기(`fx-wrong`, `transform: translateX`)·튀기기(`fx-correct`, `transform: scale`) 애니메이션이 면 버튼의 `matrix3d()`를 덮어써서, 0.35~0.4초 동안 그 면이 **무대 가운데(다른 면 위)로 옮겨져** 흔들린다. 맞힌 면도 접기 시작할 때 같은 일이 생긴다(측정함). 면 붙이기에서 붙인 면도 같은 코드라 같은 일이 생긴다. | `?unlock=all&seed=7&sound=off&stage=cube-opposite` 1번에서 `라` 면을 누름 → 애니메이션 중 computed transform이 `matrix(1, 0, 0, 1, 0, 0)`, 면 위치 (621,469) → (505,406) → (621,464). 스크린샷 `shots/chromebook-08-opp-wrong.png`, `shots/tablet-08-opp-wrong.png` (라 면이 ★·바 면 위에 겹쳐 보임) | 3D 면에는 `feedback.wrong/correct`에 요소를 넘기지 않거나(문제 판의 까닭 칸을 넘김), 면 안쪽 `.face-inner`를 넘겨 흔든다. |
| 3 | 고치면 좋음 | `src/games/net-workshop/view3d.js:70-95` (`displayNet`) | 다 접었을 때 빈 자리가 **바닥 면**이면 "비어요" 점선 표시가 입체 뒤에 가려 보이지 않는다. [↺][↻]는 세로축으로만 돌려서 돌려도 안 보인다. 기획서 6절 "비는 자리는 굵은 점선 + 비어요"가 이 경우 장면으로 안 나온다(까닭 글은 나옴). 빈도: 판별 겹침 문항 94/300(31%), 판별 5면 문항 19/196(10%), 면 붙이기 틀린 자리(겹침) 261/1491(18%). | `?unlock=all&seed=4&sound=off&stage=cube-judge` 3번(same-side-a)에서 [돼요] → "마 면과 바 면이 같은 자리에 겹쳐요. 그래서 다른 한쪽이 비어요." 그러나 "비어요" 없음, ↻ 6번 눌러도 없음. `shots/bottom-empty-default.png`, `shots/bottom-empty-rotated180.png`. 빈도 계산 `bottom.mjs` | `displayNet`의 점수에서 빈 자리가 바닥(법선 −z)이면 크게 감점하거나, 겹친 면 대신 빈 자리를 위(+z)·앞에 오게 바닥 면을 고른다. 또는 그때만 기울기를 반대로(아래에서 올려다보기) 한다. |
| 4 | 고치면 좋음 | `src/games/net-workshop/play-pick.js:33-50`, `src/games/net-workshop/play-place.js:69-90` | 이미 "✗ 이웃"으로 표시된 틀린 면을 다시 누르면 매번 새 오답으로 기록된다(같은 면을 3번 누르면 3번 기록). 면 붙이기에서도 ✗ 표시된 자리에 다시 놓을 수 있고 또 기록된다. 정답률·별이 실제보다 낮아지고 학습 기록의 tag 횟수가 부풀려진다. | `?unlock=all&seed=7&stage=cube-opposite` 1번에서 같은 틀린 면을 3번 누르고 5문항을 끝냄 → "8번 중 5번 맞힘, 63%", "마주 보는 면 (3번)" | 이미 틀린 면(`is-wrong`)·자리(`is-tried`)는 다시 눌러도 기록하지 않고 안내만 하거나, 버튼을 비활성으로 둔다. |
| 5 | 고치면 좋음 | 엔진 토스트 `src/shared/styles/base.css:185-189` (게임 쪽 덮어쓰기는 `src/games/net-workshop/style.css`) | 휴대폰(390×844)에서 토스트(높이 약 103px, 글자 수에 따라 최대 약 6.5초)가 화면 아래의 접기 버튼·[↺][↻]·막대·[반만 접어 보기]·까닭 칸을 가린다. `pointer-events: none`이라 누르기는 되지만 보이지 않는다. 1366×768·820×1180에서는 조작 버튼을 가리지 않는다(까닭 칸 아래쪽 일부만: 크롬북 89×49px, 태블릿 600×15px, 같은 문장이라 정보 손실 없음). | `play.mjs phone`: 면 붙이기 틀린 뒤 [펴고 다시 하기] 화면에서 토스트가 접기 버튼 212×48, ↺·↻ 48×48, 막대 324×32와 겹침. `shots/phone-14-complete-retry.png`, `shots/phone-05-judge-wrong-vertex-full.png` | 좁은 화면(`max-width: 560px`)에서 이 게임의 토스트를 화면 위쪽으로 옮기거나, 까닭 칸에 같은 문장이 있으니 좁은 화면에서는 토스트를 짧게 한다. |
| 6 | 고치면 좋음 | `tests/e2e/net-workshop.spec.js:41-42`, `tests/unit/net-workshop-fold.test.js:107-125`, `:195`, `tests/unit/net-workshop-logic.test.js:148` | 테스트가 스스로를 검사하는 곳이 있다. (a) e2e "화면 전개도 = 같은 시드 문항"은 면 이름을 정렬해 비교해서 6면 전개도면 늘 `가~바`로 같다(모양·위치를 검사하지 않음). (b) `oppositeFace`는 십자 전개도 하나만 검사한다. (c) `completionSlots`·`judgeSlot`의 "판정이 맞다"는 `checkNet` 결과를 `checkNet`과 비교한다. 이번 Review의 독립 계산으로는 모두 맞았지만, 나중에 `fold.js`를 넓힐 때(2차 직육면체) 회귀를 못 잡을 수 있다. | 코드 읽기 | (a) `data-face`별 `transform` 또는 칸 좌표를 비교한다. (b)(c) 격자에서 "정육면체 굴리기(감싸기)"로 면마다 법선을 매기는 작은 함수를 테스트에 두고 11개 × 8방향 × 모든 바닥 면에서 `oppositeFace`, 모든 펜토미노 빈 자리에서 `completionSlots`를 그것과 비교한다(`indep.mjs`의 `wrap()` 참고). 1번에 맞춰 "오답 ≥ 정답" 검사도 추가. |
| 7 | 참고 | `src/games/net-workshop/style.css:14-15` | 1366×768에서는 스크롤이 없지만, 실제 크롬북처럼 보이는 높이가 680px이면 `cube-complete`의 [펴고 다시 하기] 화면(카드+접기 도구+힌트+까닭)이 739px로 59px 넘쳐 세로 스크롤이 생긴다. 다른 상태는 680·650px에서도 스크롤 없음. | `shortscreen.mjs` (1366×680, 1366×650) | 그 상태에서 카드 칸·까닭 칸 여백을 줄이거나 무대 높이 식을 기획서 값 쪽으로 조정. |
| 8 | 참고 | `src/games/net-workshop/view3d.js:164-175` | 휴대폰에서 `cube-complete` 빈 자리 버튼이 47px인 경우가 있다(시드 1~40 첫 문항 중 4개). 기준 48px에 1px 모자람. 크롬북·태블릿은 77px 이상. | `targets.mjs` | 휴대폰에서 무대 높이를 조금 키우거나 `MIN_UNIT`을 48로. |
| 9 | 참고 | `src/games/net-workshop/view3d.js:56-61` | 마주 보는 면 단계에서 맞힌 뒤 다 접으면 기본 시점(위·앞·왼쪽)에서 ★ 면과 정답 면이 동시에 보이지 않는다(마주 보므로). 정답 면이 바닥이면(744/5000, 15%) 돌려도 "✓ 마주 봐요"가 안 보인다. 틀린 것은 아니고 장면이 덜 친절하다. | `oppview.mjs` | 정답일 때 ★ 면·정답 면이 옆면(앞·뒤 또는 왼·오른쪽)에 오도록 바닥 면을 고른다. |
| 10 | 참고 | `src/games/net-workshop/view3d.js:31`, `:368-370` | 2×2 덩어리 전개도는 덩어리 경첩을 0°, 나머지를 45°까지만 접어 멈춘다. 이때 한 면이 거의 모서리로만 보인다(`shots/chromebook-05-judge-wrong-vertex-full.png` 오른쪽 가는 띠). ● 표시와 문장은 맞다. | 판별에서 2×2 문항에 [돼요] | 멈추는 각도를 60~70°로 하거나 시점을 조금 돌린다. |
| 11 | 참고 | `src/games/net-workshop/view3d.js:545`, `play-place.js` | 키보드: 면 카드(문제 판)를 고른 뒤 빈 자리(무대)로 가려면 문제 판 나머지 → 위쪽 머리 → 무대 순으로 Tab을 여러 번 눌러야 한다(차시 전체 Tab 88번). 진행은 된다. | `checks.mjs` 1번 | 카드를 고르면 첫 빈 자리로 초점을 옮긴다. |
| 12 | 참고 | `src/games/net-workshop/geometry.js:22`, `src/games/net-workshop/view3d.js:34` | 죽은 코드·중복: `almostEqual`은 어디서도 쓰지 않는다. `LABEL_ORDER`는 `fold.js`의 `LABELS`와 같다. | `grep` | 지우거나 `LABELS`를 import. |
| 13 | 참고 | `src/games/net-workshop/logic.js:290`, `play-place.js:74` | 면 붙이기의 학습 기록 `given`/`expected`가 칸 좌표(`"2,0"`, `"2,0 / 3,1"`)다. 기획서 7절에 이 단계 값이 정해져 있지 않아 틀린 것은 아니지만 선생님이 읽기 어렵다. 지금 학습 기록 화면·결과 복사에는 나오지 않는다. | 코드 읽기 | 필요하면 "가 면 오른쪽" 같은 `describeSlot` 문장으로 남긴다. |

## 확인한 것 (문제없음)

**범위**
- 바뀐 파일은 모두 build-brief의 "고쳐도 되는 파일" 안이다: `README.md`, `docs/engine.md`, `scripts/lib/hub.mjs`(바닥글 `<li>` 한 줄만), `src/shared/core/progress.js`, `src/shared/styles/base.css`(`.lesson-group`, `.lesson-title`만), `src/shared/ui/app.js`, `tests/unit/progress.test.js`, 새 파일 `src/games/net-workshop/**`, `tests/unit/net-workshop-{fold,logic}.test.js`, `tests/e2e/net-workshop.spec.js`. 금지 파일·`package.json` 변경 없음, 의존성 추가 없음.
- `LESSONS`는 `cube` 하나뿐이고 화면에도 정육면체 차시 3단계만 나온다. `cylinder.js` 등 1차에 필요 없는 파일 없음.

**계획과 일치**
- 단계 id·제목·문항 수·끝나는 조건: `cube-judge` "접힐까, 안 접힐까?" 6문항(한 번 답하면 다음), `cube-opposite` "마주 보는 면" 5문항(맞힐 때까지), `cube-complete` "한 면을 붙여요" 4문항(맞힐 때까지), 빈 자리 4~6곳.
- `TAGS` 14개를 spec.md 3절 표에서 직접 읽어 비교: 글자까지 같다(14 = 14).
- 판별 구성(시드 701개): 늘 유효 3(1-4-1 하나 + 1-4-1 아닌 꼴 둘) · 무효 3(한 줄 5칸/같은 쪽 날개 겹침 1, 2×2 1, 면 개수 1).
- 피드백: 겹친 면 빗금 + "✗ 겹쳐요" + 살짝 띄움, 빈 자리 굵은 점선 + "비어요"(바닥일 때 제외, 3번), 2×2는 ● + 멈추는 장면, 까닭 칸 유지, 판별 단계 힌트 없음, 한 번 틀리면 [반만 접어 보기] 1회.
- 학습 기록: `itemId = cube-judge:3:2-3-1` 꼴, 판별 `yes/no`, 마주 보는 면 면 이름, 유효 전개도를 "안 돼요"면 `여러 가지 전개도`, 무효를 "돼요"면 그 이유 tag.
- `game.json`: `mode: "개인"`, `standards: []`, `grades: [5, 6]`, `playMinutes: 10`, `status: "개발 중"`, 단원 표기 spec 1절과 같음.

**수학적 정확성** (`indep.mjs`: `fold.js`의 행렬·경첩 계산을 쓰지 않는 "정육면체 감싸기" 방법 — 칸에서 이웃 칸으로 갈 때마다 그쪽 면으로 넘어가며 법선을 매기고, 6칸이 서로 다른 6면을 덮으면 전개도)
- 자유 폴리오미노 수 1~7: 1, 1, 2, 5, 12, 35, 108 (내 나열 함수, 알려진 값과 같음).
- 헥소미노 35개 중 정육면체 전개도 11개, `CUBE_NETS`와 같은 집합. `checkNet`의 판정이 35개 모두 일치. `INVALID_HEXOMINOES` 24개 = 나머지 24개, 이유(2×2 8개 = `vertex-full`, 나머지 `overlap`)·`line5` 분류·`family` 분류 모두 맞음. `FACE_COUNT_NETS` 5개는 면 수가 맞고 2×2 없음.
- `oppositeFace`: 11개 × 돌리기·뒤집기 8 × 바닥 면 6 × 면 6 = 3168번 비교, 불일치 0.
- `completionSlots`: 펜토미노 12개 × 8방향의 빈 이웃 자리 952곳, 불일치 0.
- 시드 701개(`"0"`~`"499"`, `"seed0"`~`"seed199"`, 현재 시각)로 만든 판별 4206 · 마주 보는 면 3505 · 면 붙이기 2804 문항: 정답·`expected`·채점이 독립 판정과 모두 일치, 무효 문항의 `primaryProblem`·`intended`가 독립 분류(면 수 → 2×2 → 겹침)와 일치, 면 붙이기 정답 ≥1·오답 ≥2·4~6곳, 이미 있는 칸에 빈 자리 없음.
- 문장 내용: "X 면과 Y 면이 같은 자리에 겹쳐요"의 두 면은 감싸기에서 실제로 같은 자리(판별·면 붙이기 모두). "한 줄로 이어진 세 면의 양 끝이라 마주 봐요"는 늘 일직선 2칸 거리이고 실제로 마주 봄. "모서리로 붙어 있어 이웃한 면"은 늘 변으로 붙은 칸. "대각선 자리라서 … 이웃한 면이 돼요"는 늘 대각선 칸이고 실제로 마주 보지 않음(대각선 칸이 마주 보는 경우는 한 번도 없음). 면 개수·2×2 문장도 사실과 맞음. "정육면체의 전개도는 모두 11가지예요" 맞음.
- 화면과 문장의 면 이름: 시드 40개, 겹침 문장 87개에서 문장의 두 면이 모두 화면의 `.is-overlap` 면(`data-label`)이었다. 면 붙이기에서 붙인 면이 늘 겹친 면 안에 있었다. 5면은 "비어요" 1곳, 7면은 겹친 면 표시, 2×2는 ● 표시, 배지 ✓/✗가 판정과 맞음.
- 조사: 실제로 나오는 문장 틀 11가지를 모두 뽑아 읽음 — "면과/면이/면은/면을", "6개예요", "5개라서" 모두 맞음.

**엔진 변경**
- 예시 게임을 HEAD의 `app.js`·`progress.js`·`base.css`와 지금 파일로 각각 띄워 같은 조작 뒤 `#app` DOM을 비교: 처음 화면·단계 선택·플레이·결과·다시 단계 선택·마지막 단계·학습 기록·`?stage=` 직접 시작·`?lesson=abc`(무시됨) 9화면 모두 글자 하나까지 같다(`engine-compare.mjs`).
- `net-workshop` 주소 조합: `?lesson=cube` → 윗줄 "정육면체의 전개도", 첫 단계만 열림, "모은 별 0 / 9". `?lesson=zzz`·`?lesson=`·`?lesson=CUBE`(대소문자 구분) → 모든 차시 + 기본 윗줄. `?stage=cube-opposite`(잠김) → 처음 화면, `&unlock=all`이면 바로 시작. `?lesson=cube&stage=cube-complete&unlock=all&seed=3` 바로 시작. `?unlock=all` 모두 열림. 같은 `?seed=`면 새로 고쳐도 같은 문항.
- 차시 둘인 시험 페이지(`lessonpage.mjs`): 차시마다 첫 단계 열림, "다음 단계"는 같은 차시 안에서만, 차시 끝은 "이 차시를 마쳤어요!" + "학습 기록 보기", `?lesson=b&stage=a1`(다른 차시 단계) → 처음 화면, 단계 없는 차시는 안 보임, `lesson` 없는 단계는 분명한 오류 문장. `docs/engine.md` 설명과 동작이 같다.
- 학습 기록 화면: 세 단계 기록과 "자주 틀린 개념"(한 꼭짓점에 세 면, 마주 보는 면)이 맞게 나옴.

**브라우저에서 직접 플레이** (`play.mjs`, `?lesson=cube&seed=7`, 세 기기에서 처음 화면 → 세 단계 → 차시 끝 → 학습 기록. 스크린샷 62장 중 기기·단계별 주요 장면 32장을 직접 열어 봤고, 스크롤·토스트 겹침은 모든 장면에서 숫자로 쟀다)
- 가로 스크롤: 세 기기 모든 상태에서 없음. 세로 스크롤: 1366×768·820×1180의 모든 측정 상태(단계 선택, 문제, 정답·오답 장면, 다시 하기, 차시 끝)에서 없음. 휴대폰은 세로 스크롤(기획서 허용).
- 끌어 놓기: 크롬북 마우스 끌기, 태블릿·휴대폰 터치 끌기(CDP 터치 이벤트)로 틀린 자리·맞는 자리 모두 동작.
- 키보드만으로 처음 화면부터 차시 끝까지(틀린 자리 놓기·다시 하기 포함) 진행됨, 콘솔 오류 없음.
- 움직임 줄이기: `data-fold` 순서 `half → done`, 펴기는 바로 `flat`, 힌트는 `half → flat`, `requestAnimationFrame` 0번.
- 색만으로 구분하지 않음: 배지·까닭·토스트에 ✓/✗, 틀린 면 점선 + "✗ 이웃", 맞은 면 "✓ 마주 봐요", 시도한 자리 "✗", 겹침 빗금 + 글자.
- 콘솔 오류: 모든 실행에서 0 (`play.mjs`·`checks.mjs`는 경고도 0).

**정답 노출**: 시드 1~5에서 답하기 전 DOM을 비교 — 마주 보는 면 단계의 면 버튼들, 면 붙이기의 빈 자리 버튼들은 위치·이름 외 속성·클래스·글자가 모두 같고, 판별 단계는 배지 `hidden`·표시 글자 없음·`.is-overlap`/`.net-ghost`/`.net-dot` 없음. 숨긴 글자(`[hidden]`, `.sr-only`)에도 정답 없음. 답하기 전에는 접기 버튼·막대가 잠김.

**코드 품질**: 화면은 모두 `h()`, `innerHTML`·외부 주소·CDN 없음(dist에서도 확인). 접는 중에 [← 단계 선택]으로 6번 나갔다 들어와도 나간 뒤 `requestAnimationFrame` 0번, 창 크기를 바꿔도 지난 무대의 `ResizeObserver` 0번(정리됨). `cube-complete` 다시 하기 3번 정상. 빌드 63.3 KB.

## Build의 "계획과 다른 점"에 대한 의견

Build의 최종 보고는 이 Review에 전달되지 않았다. 그래서 코드와 spec을 비교해 Review가 찾은 차이를 적고 판단한다.

| 차이 | 의견 |
| --- | --- |
| 잘못된 `?lesson=` 값이면 모든 차시와 기본 윗줄을 보인다 (spec에 정해진 바 없음) | 타당. `docs/engine.md`에 적혀 있다. |
| `lessons`를 쓰면 모든 단계에 `lessons` 안의 `lesson`이 있어야 하고, 없으면 오류 | 타당. 실수를 빨리 드러낸다. |
| 무대 높이 `clamp(300px, 100dvh - 250px, 560px)` (spec 예시는 `clamp(320px, 100dvh - 230px, 560px)`) | 1366×768에서는 문제없음. 실제 크롬북 높이에서 한 상태가 넘침(7번 참고). |
| 문항 전개도를 가로 ≥ 세로인 방향으로만 돌리기·뒤집기 (spec은 8가지) | 타당. 무대에 크게 보이게 하는 선택이고 판정과 무관. |
| 무대 끌어 돌리기 없음, [↺][↻]와 방향키만 | 타당. spec 4절이 "또는"으로 적었다. |
| 2×2 덩어리 장면: 덩어리 경첩은 접지 않고 나머지는 45°에서 멈춤 | 수용 가능. 한 면이 거의 안 보이는 점만 다듬으면 좋음(10번). |
| `checkNet`의 `gap`을 tag `면이 겹침`으로 바꿈 | 타당. 6면 정육면체에서 빈 곳이 생기면 반드시 다른 곳이 겹친다(감싸기로 확인). |
| 화면 바닥 면(root)을 다시 골라 겹친 면이 위로 오게 함(`displayNet`) | 판정과 무관하고 좋은 선택. 다만 빈 자리가 바닥으로 가는 경우를 피하지 못함(3번). |
| 틀린 자리는 그 자리로 접어 보여 준 뒤 [◀ 펴고 다시 하기]로 돌아옴 | 타당. spec 6절의 "왜를 장면으로"에 맞다. |
| 면 붙이기 기록값을 칸 좌표로 남김 | spec 7절에 없는 부분이라 수용 가능(13번 참고). |
| 처음 화면 윗줄을 `game.json` 단원 대신 "5·6학년 수학 · 입체도형의 전개도"로 | 타당. 1차에 없는 6학년 단원 이름이 처음 화면에 나오지 않는다. |
| `meetingVertices`, `unfold`, `cylinder.js` 없음 | 타당. 2차 이후 범위. |

## 확인하지 못한 것

- Build의 최종 보고("계획과 다른 점" 원문): 전달받지 못해 위 표는 Review가 직접 찾은 차이만 다룬다.
- 실제 기기: 크롬북·태블릿 실물, 실제 터치 화면, 브라우저 주소창이 있는 실제 보이는 높이(1366×680·650은 창 크기로만 흉내 냄), 저사양 크롬북에서의 CSS 3D 속도. 모두 Playwright Chromium(1.56.1) 흉내로만 확인했다.
- Chromium 외 브라우저(Safari·iPad 등), 화면 읽기 프로그램으로 실제로 읽히는지.
- 소리(효과음은 확인하지 않았다).
- 학생이 실제로 10분 안팎에 차시를 끝내는지(spec 10절 확인 목록). 자동 플레이는 단계마다 11~13초였다.
- 성취기준(`standards: []`)과 교육과정 문구: 원문 자료가 없어 이번 검토 범위에서 제외.
