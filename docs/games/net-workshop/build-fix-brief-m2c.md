# Build 서브에이전트 지침: 직육면체 차시 — 검사 파일 손질 (트랙 "cuboid", M2c)

## 역할

너는 직육면체 차시를 만든 **Build** 담당이다. 재검토는 "통과(반드시 수정 0건)"였고 `15cf985`는 코디네이터가 `main`에 합쳤다(아직 올리기 전). 재검토가 "고치면 좋음"으로 남긴 **검사 파일의 약한 곳**(작업 폴더의 `docs/games/net-workshop/review-cuboid.md` "재검토 (M2b 수정 확인)" 절의 M2b-1·2·3·8)을 고친다. GitHub CI에서 드물게 흔들릴 수 있는 종류다. **앱 코드는 고치지 않는다.** 검증은 별도 Review 서브에이전트가 한다.

## 할 일

| # | 어디 (`15cf985` 기준 실제 줄) | 무엇 | 방향 |
| --- | --- | --- | --- |
| M2b-1 | `tests/e2e/net-workshop-cuboid.spec.js:1385` | 움직임 줄이기에서 550ms 동안만 보이는 `data-fold="half"`를 바로 단언한다(누르기가 돌아오는 데 550ms를 넘기면 "done"을 받고 실패 — 컴퓨터가 아주 바쁠 때 혼자 4배 3/12, 8배 1/12) | 정육면체의 같은 검사(`tests/e2e/net-workshop.spec.js`의 "움직임 줄이기 › 접기 애니메이션 대신 펼침 → 반 접힘 → 다 접힘 …")처럼 `MutationObserver`로 `data-fold`가 지나간 값을 적어 두고 "half가 들어 있고 folding이 없다"를 본다. 같은 종류(잠깐만 보이는 상태를 바로 단언)가 이 트랙의 검사 파일에 더 있는지 훑는다 |
| M2b-2 | `tests/e2e/net-workshop-cuboid.spec.js:197`·`:270`·`:359`·`:482`·`:521`·`:1380`·`:1575`·`:1785`, `tests/e2e/net-workshop-free-finish.spec.js:60`·`:127`·`:160` | 시간 예산(`test.setTimeout`)이 없어 기본 30초인데 혼자 3~13.6초, CPU 4배에서 7~24.8초 | 이 11개에 예산을 적는다(이 파일의 다른 긴 검사와 같은 방식, 보통 90초 — CPU 4배에서 걸린 시간의 3배 이상) |
| M2b-3 | `tests/e2e/net-workshop-cuboid.spec.js:405`·`:676`·`:745`·`:836`·`:997`·`:1074`·`:1161`·`:1234`·`:1505`·`:1594`·`:1654`, 그리고 `tests/e2e/net-workshop.spec.js`의 "자유 배치: 모든 장면에서 오른쪽 판 안쪽이 넘치지 않는다 …"(예산 420초, CPU 4배에서 335.6초 — 이 트랙이 장면 하나를 더했다) | 예산이 CPU 4배 시간의 3배에 못 미친다 | 4배 시간의 3배쯤으로 올린다. "자유 배치: 모든 장면…"은 900초로 올린다(장면을 줄이거나 검사를 나누지 않는다). **`tests/e2e/net-workshop.spec.js`에서는 그 한 줄만 고친다** — 그 파일의 다른 검사(`:2883` 포함)는 다른 트랙(c2)이 같은 때에 고치고 있다 |
| M2b-8 | `tests/e2e/net-workshop-cuboid.spec.js:721` | 학습 기록의 도감 버튼 단언이 `toContainText('0 / ')`로 풀려 "찾은 직육면체 전개도가 도감 수에 들어가지 않는다"를 더 고정하지 못한다 | `toContainText('도감 0 / ')`로(Review가 쌓기나무와 합친 나무에서도 글이 그대로임을 확인했다) |

- 기다림·관찰은 `waitForFunction`·`MutationObserver`·`expect.poll`로. 정해 둔 시간(`waitForTimeout`)으로 덮지 않는다. 기대값·재는 항목·장면 수를 줄이거나 느슨하게 하지 않는다. `retries`를 넣지 않는다.
- 예산을 적거나 올린 검사는 표로 보고한다(검사, 혼자 돌린 시간 보통·CPU 4배, 적은 예산).

## 직접 확인할 것

- scratchpad에 푼 복사본의 검사 파일 맨 위에 CPU 느리게 하기(`Emulation.setCPUThrottlingRate`)를 넣어 — 고치기 전(`15cf985`) M2b-1의 실패가 재현되는지(다른 실행과 겹쳐 컴퓨터가 바쁠 때 4·8배 `--repeat-each=12`; 재현이 안 되면 누르기 뒤에 600ms 늦추기를 복사본에 넣어 "done을 받는다"를 보인다), 고친 뒤 4·8·12배 × `--repeat-each=12`에서 실패 0인지. 이 트랙의 검사 파일 둘을 4·8·12배로 한 번씩 돌려 값이 어긋나는 실패 0인지(시간 제한만 넘긴 것은 따로 표시). 저장소에는 재현용 코드를 남기지 않는다.
- 고친 M2b-1 검사가 여전히 회귀를 잡는지: 복사본의 앱에서 움직임 줄이기의 "반 접힘" 장면을 건너뛰게 망가뜨리면 실패하는지.
- `npm test`, `npm run test:e2e -- --workers=4`, `E2E_WIDE_TEXT=font npm run test:e2e -- --workers=4` 모두 실패 0(마지막 커밋에서 처음부터). `tests/e2e/engine-features.spec.js`의 "플레이 머리 높이 …"가 실패하면(이 가지에는 그 수정이 아직 없다) 보고만 한다.
- 빌드 결과물 `dist/net-workshop.html`의 해시가 `15cf985`와 같다(검사 파일만 바뀐다).

## 고쳐도 되는 파일

- `tests/e2e/net-workshop-cuboid.spec.js`, `tests/e2e/net-workshop-free-finish.spec.js`, `tests/e2e/net-workshop.spec.js`(위에 적은 예산 한 줄만)
- 고치지 않는 것: `src/**`, 다른 테스트 파일, `tests/e2e/helpers.js`·`playwright.config.js`, `docs/**`(`review-cuboid.md` 포함), `scripts/**`, package 파일, `.github/**`, `.claude/**`, `CLAUDE.md`

## 지킬 것

- 작업 폴더·브랜치·scratchpad·포트는 지난번과 같다(코디네이터가 프롬프트로 다시 알려 준다). `track/cuboid`의 HEAD는 `4126bfc`(코디네이터가 재검토 결과를 커밋했다)다. 커밋은 `track/cuboid`에만, 푸시·합치기는 하지 않는다. `npm install`·내려받기 금지. 띄운 실행·서버는 모두 내리고 끝낸다.

## 최종 보고 (8줄 이하)

M2b-1(원인 재확인, 고친 방식, 고치기 전·후 배수별 실패 수, 회귀를 잡는지, 같은 종류로 더 찾은 곳), M2b-2·3 표(검사·보통/4배 시간·예산), M2b-8, 두 파일 4·8·12배 실행 결과, 빌드 해시, 테스트 결과(단위·보통·글꼴 흉내), 못 한 것, 마지막 커밋 해시. 직접 실행해 확인한 것과 추정을 구분한다.
