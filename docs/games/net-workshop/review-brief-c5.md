# Review 서브에이전트 지침: c5 "주사위 장인" 도장 설명에 한 마디

- 너는 **Review** 담당이다. Build가 [build-brief-c5.md](build-brief-c5.md)에 따라 고친 것을 **독립적으로** 확인한다. 결과는 새 파일 `docs/games/net-workshop/review-c5.md`(작업 폴더 안) 하나, 맨 위 판정 줄. 커밋하지 않는다. 코드·테스트·다른 문서 수정 금지, 작업 트리를 바꾸는 git 명령 금지. `npm install`·`npm ci`·내려받기 금지. 서버·실행은 네 PID만.
- 확인할 것: ① `git diff <기준>..HEAD` 전체가 그 한 줄과 검사 줄뿐인지 ② 새 설명이 [spec.md](spec.md) 16-18 끝의 사용자 말 그대로 덧붙었는지, 이름·id 그대로 ③ 도장판·새 도장 알림·학습 기록에서 다섯 크기(1366×768·1366×680·1024×768·820×1180·390×844) × 보통·글꼴 흉내로 넘침·잘림 0(직접 연다) ④ 테스트 셋(`E2E_PORT` 꼭) 실패 0, 약해진 검사 0 ⑤ `git merge-tree --write-tree`로 `main`·`track/blocks`·`track/cuboid`와 충돌.
- 최종 답변 **5줄 이하**.
