# 프로젝트 개요
초등학교 학습용 게임 제작

**세션을 새로 시작하면 가장 먼저 [docs/STATUS.md](docs/STATUS.md)를 읽는다** — 지금 어디까지 했고 다음에 무엇을 할지가 적혀 있다.

# 작업 사이클

* 사용자가 주제를 요청하면 다음 순서로 진행한다.
* Plan — 서브에이전트를 만들어 계획을 작성한다. 어떤 앱을 만들지, 파일 구조는 어떻게 할지 정리한다. 작성한 계획은 spec.md로 저장하며, 사용자 승인을 받는다.
* Build — 서브에이전트를 만들어 구현한다.
* Review — 별도 서브에이전트를 만들어 검증한다. 정상 동작하는지, 코드에 문제가 없는지 확인하고 review.md를 작성한다. 문제가 있으면 수정한다.
* Embed — 깃 커밋한다.

## 사이클을 돌리며 정한 것

* Review 판정이 "통과(반드시 수정 0건)"일 때만 Embed한다. "수정 필요"가 나오면 커밋·배포하지 않고 Build로 고친 뒤 다시 Review한다.
* Embed = **`main`에 바로 커밋·푸시**한다(2026-10-09 사용자 결정). `main`에 올라가면 GitHub Pages(`https://eversunk2-tech.github.io/game2/`)에 자동 배포된다. 매번 다시 묻지 않는다.
* 올린 뒤에는 GitHub Actions의 배포와 CI 결과를 확인한다. 이 맥에서 통과한 테스트가 CI(리눅스)에서 실패한 적이 여러 번 있다.
* 사용자가 정한 것은 날짜와 함께 기획서의 "결정" 절에 적는다. 사용자가 정한 것과 코디네이터가 고른 것을 구분해 적는다.
* 수정 요청·새 기능 요청도 같은 사이클이다. 사용자가 무엇을 바꿀지 분명히 말했으면 그 말이 승인이고, 갈림길이 있으면 선택지와 추천을 붙여 묻는다.

# 서브에이전트 규칙

* 서브에이전트에게 작업을 넘길 때 전용 지침 파일(.md)을 만들어 전달한다.
* Build 서브에이전트와 Review 서브에이전트는 반드시 분리한다.
* 서브에이전트는 지침 파일에 명시된 범위만 수정한다.

## 서브에이전트를 쓰며 정한 것

* 지침 파일은 `docs/games/<게임>/`에 둔다: `plan-brief-*.md`, `build-brief-*.md`, `review-brief-*.md`, 수정 라운드는 `build-fix-brief-*.md`·`review-fix-brief-*.md`.
* **Build의 보고는 확인 대상이지 근거가 아니다.** Review는 직접 재현·측정하고 스크린샷을 직접 열어 본 것만으로 판정한다. Review는 검토 결과 파일만 고친다.
* 판정·점수는 저장소 코드를 쓰지 않고 기획서 문장만 보고 짠 **독립 계산**과 견준다.
* Build가 "사용자 결정 필요"로 올린 것은 코디네이터가 추측으로 정하지 않는다. Review의 측정값과 함께 선택지·추천을 붙여 사용자에게 묻는다.
* 모든 서브에이전트는 [docs/games/net-workshop/common-rules.md](docs/games/net-workshop/common-rules.md)(정육면체 차시를 만들며 정한 공통 규칙)를 먼저 읽고 같은 조건으로 만든다.
* **여러 영역을 동시에 만들 때**(2026-10-10 사용자 요청): 트랙마다 작업 폴더 `.worktrees/<트랙>`과 브랜치 `track/<트랙>`을 따로 준다. 새 영역은 새 파일에 만들고, 같이 쓰는 파일은 덧붙이기만 한다. Review도 트랙마다 따로(`review-<트랙>.md`) 한다. 합치기·푸시는 코디네이터만 한다.

# 규칙

* 승인 없이 구현을 시작하지 않는다.
* 막히면 사용자에게 알린다.

## 일하며 정한 것

* 사용자가 **"일시정지"**라고 하면 돌고 있는 서브에이전트를 모두 멈추고, 무엇이 커밋됐고 무엇이 도중인지 알린다. **"이어서"**라고 하면 멈춘 곳부터 이어 간다(도중에 끊긴 작업은 지금 파일 내용을 다시 읽고 시작하게 한다).
* 내려받기(테스트용 브라우저, 패키지 등)는 사용자에게 먼저 확인한다.
* 이 저장소는 **공개 저장소**다. 교과서 등 저작물의 문장·그림·문제 수치를 옮기지 않는다(배우는 순서와 용어만 맞춘다). 교과서 PDF는 저장소에 넣지 않는다.
* 테스트는 셋 다 실패 0이어야 한다: `npm test`, `npm run test:e2e`, `E2E_WIDE_TEXT=font npm run test:e2e`(리눅스 CI의 글자 폭을 미리 보는 글꼴 흉내). Playwright는 1.56.1로 고정.
* 사용자(초등 교사)에게는 한국어로, 기술 용어 없이 알린다. 직접 확인한 것과 추정을 구분하고, 확인하지 못한 것(실물 기기, Safari 등)은 못 했다고 말한다.

# 문서 지도

| 문서 | 내용 |
| --- | --- |
| [docs/STATUS.md](docs/STATUS.md) | 지금 상태, 진행 중인 일, 다음 할 일, 이 컴퓨터의 환경 |
| [docs/games/net-workshop/common-rules.md](docs/games/net-workshop/common-rules.md) | 모든 차시·영역에 똑같이 적용하는 규칙(정답 노출, 점수, 조작, 화면 배치, 테스트) |
| [docs/games/net-workshop/spec.md](docs/games/net-workshop/spec.md) · [spec-grade6.md](docs/games/net-workshop/spec-grade6.md) | 기획서와 사용자 결정(5학년 전개도 · 6학년 전개도와 쌓기나무) |
| [docs/games/net-workshop/review.md](docs/games/net-workshop/review.md) | 지금까지의 검토 결과 |
| [docs/dev-guide.md](docs/dev-guide.md) · [docs/engine.md](docs/engine.md) | 기술 규칙, 공통 엔진 사용법 |
