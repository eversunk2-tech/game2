/**
 * 직육면체의 전개도 차시(cuboid)의 단계 목록 (자료만). logic.js가 LESSONS·STAGES에 넣는다.
 * 기획서: docs/games/net-workshop/spec.md 5절(단계 표)·16-2(내 맘대로 전개도)·16-12(직접 만드는 단계에는 예상이 없다)
 *
 * kind: edge(만나는 선분 고르기) · face(알맞은 면 카드 붙이기) · cjudge(길이가 적힌 전개도 판별) · cfree(직육면체 전개도 직접 만들기)
 *       · cdex(도전 주문서: 직육면체 도감 주문 — spec 16-16)
 * 차시 시간: 만나는 선분 5 · 알맞은 면 4 · 판별 5 · 직접 만들기(서로 다른 전개도 2가지부터 끝낼 수 있다) ≈ 10분
 * 목표 문장(goal)은 짧게 쓴다: 태블릿 세로에서 글자가 넓은 기기에도 한 줄에 들어가야 머리가 높아지지 않는다
 */
export const CUBOID_LESSON = { id: 'cuboid', title: '직육면체의 전개도' };

export const CUBOID_STAGES = [
  {
    id: 'cuboid-edge',
    lesson: 'cuboid',
    kind: 'edge',
    count: 5,
    order: '짝 찾기 주문',
    title: '만나는 선분',
    goal: '접었을 때 표시한 선분과 만나는 선분을 골라요.',
  },
  {
    id: 'cuboid-face',
    lesson: 'cuboid',
    kind: 'face',
    count: 4,
    order: '수선 주문',
    title: '알맞은 면 고르기',
    goal: '빈 자리에 알맞은 크기의 면 카드를 붙여요.',
  },
  {
    id: 'cuboid-judge',
    lesson: 'cuboid',
    kind: 'cjudge',
    count: 5,
    order: '검사 주문',
    title: '길이까지 살펴요',
    goal: '길이를 보고 직육면체가 될지 골라요.',
  },
  {
    id: 'cuboid-free',
    lesson: 'cuboid',
    kind: 'cfree',
    count: 2, // 이번 판에서 이만큼 찾으면 끝낼 수 있다 (별은 찾은 가지 수: 2가지 별 2개, 3가지 별 3개)
    order: '설계 주문',
    // 정육면체 차시의 "내 맘대로 전개도"와 글자가 겹치지 않는 제목: 학습 기록 표에서 두 단계가 구별되고,
    // 단계 지도에서 제목 글자로 카드를 찾을 때 두 장이 함께 걸리지 않는다
    title: '내 맘대로 직육면체 전개도',
    goal: '면 6장을 놓아 직육면체의 전개도를 만들어요. 서로 다른 전개도를 3가지까지 찾아봐요.',
  },
  {
    // 도전 주문서(spec 16-16): 일반 4단계를 마치면 열리고, 차시 별 합계에 넣지 않는다. 시간 재기는 켠 학생만
    id: 'cuboid-dex',
    lesson: 'cuboid',
    kind: 'cdex',
    challenge: true,
    timer: 'optional',
    count: 54, // 직육면체 전개도 도감 칸 수(세 모서리의 길이가 모두 다른 상자)
    order: '도감 주문',
    title: '직육면체 도감 주문',
    goal: '직육면체 전개도 54가지로 도감을 채워요. 10가지 별 1개, 20가지 별 2개, 30가지 별 3개.',
  },
];

/**
 * 이 차시가 쓰는 오개념 tag (기획서 3절 표와 글자까지 같다 — logic.js의 TAGS와 같은 값인지 단위 테스트가 본다).
 * 차시 파일이 logic.js를 들여오지 않게(서로 들여오면 읽는 순서에 따라 깨진다) 여기에 따로 적는다.
 */
export const CUBOID_TAGS = Object.freeze({
  overlap: '면이 겹침',
  vertex: '한 꼭짓점에 세 면',
  variety: '여러 가지 전개도',
  meetingEdge: '만나는 선분',
  edgeLength: '맞닿는 모서리 길이',
  oppositeCongruent: '마주 보는 면은 합동',
});
