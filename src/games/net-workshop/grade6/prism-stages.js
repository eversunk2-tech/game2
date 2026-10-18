/**
 * 각기둥의 전개도 차시(prism)의 차시·단계 목록 (순수 데이터). 단계 지도·학년·영역 화면이 처음부터 쓰므로 바탕 묶음에 들어간다.
 * 문제 만들기·판정·화면은 단계에 들어갈 때 받는 묶음(prism-play.js — spec-grade6.md 7-4절 "영역을 들어갈 때 불러오기")에 있다.
 * 기획서: docs/games/net-workshop/spec-grade6.md 2-2절(단계 표) · 4절(오개념) · 5절(정답 노출). G1은 1~3단계, 4단계(전개도 완성하기)는 G2에서 더한다.
 *
 * kind: parts(밑면과 옆면 — 입체에서 밑면 두 개 고르기) · pjudge(각기둥이 될까? — 예상 → 접어 확인 → 까닭) · pedge(맞닿는 선분 — 짝 찾기)
 * area: 'prism' — main.js가 이 표시로 각기둥 화면(grade6/prism-play.js)에 넘긴다
 * 별: 세 단계 모두 엔진 기본(정답률 90% ★3 · 70% ★2). 밑면과 옆면 · 맞닿는 선분은 3문항을 맞힐 때까지 다시 해 한 번 틀리면 3 / 4 = 75%(★2),
 *   두 번이면 3 / 5 = 60%(★1)이라 틀린 횟수로 정하는 것(common-rules 1절)과 별이 같다. 판별은 5문항을 한 번씩 답한다(한 번 틀리면 80% ★2)
 */
/**
 * 차시 (교과서 6-1 2단원 「각기둥과 각뿔」 1~3차시 32~43쪽) — minutes: 문항마다의 어림(밑면 고르기 30~45초 · 판별 25~35초 + 까닭 · 맞닿는 선분 25~35초 + 단계 사이)과
 * 자동으로 해 본 시간으로 정한 어림 약 7분(Build G1 보고 — 학생이 직접 한 시간은 재지 못했다). G2에서 4단계(전개도 완성하기)가 더해지면 늘어난다
 */
export const PRISM_UNIT = '6학년 1학기 · 각기둥과 각뿔';
export const PRISM_LESSONS = [
  { id: 'prism', title: '각기둥의 전개도', minutes: 7, note: PRISM_UNIT },
];

/** 이 차시가 쓰는 오개념 tag (spec-grade6 4절 표와 글자까지 같다 — 5학년 차시와 같은 개념은 그 말을 이어 쓴다) */
export const PRISM_TAGS = Object.freeze({
  baseIsBottom: '밑면은 바닥 면',
  sideCount: '옆면 수 = 밑면 변 수',
  sideRect: '옆면은 직사각형',
  basePosition: '두 밑면의 위치',
  baseCongruent: '두 밑면은 합동',
  edgeLength: '맞닿는 모서리 길이',
  meetingEdge: '만나는 선분',
  variety: '여러 가지 전개도',
});

/** 각기둥 영역의 놀이 방법 (영역의 단계 지도·?lesson=prism에서) */
export const PRISM_HOW_TO = [
  '각기둥은 끌어서 여러 방향으로 돌려 볼 수 있어요. 밑면 두 개를 눌러 고른 다음 [확인]을 눌러요.',
  '전개도를 보고, 접으면 각기둥이 될지 먼저 머릿속으로 생각해요. 답한 뒤에 [접어 보기]나 막대로 접어서 확인해요.',
  '틀리면 겹치는 면(빗금, ✗ 겹쳐요)과 비는 곳(점선, 비어요), 길이가 다른 선분을 보여 줘요. 오른쪽 까닭 쪽지를 읽어 보세요.',
  '맞닿는 선분은 전개도의 번호를 누르거나 오른쪽 번호 버튼을 눌러 골라요.',
  '키보드는 Tab과 Enter, 방향키를 써요. 각기둥을 돌릴 때는 방향키, 크게·작게는 더하기·빼기 키예요.',
];

export const PRISM_STAGES = [
  {
    id: 'prism-parts', lesson: 'prism', area: 'prism', kind: 'parts', count: 3, order: '살펴보기 주문',
    title: '밑면과 옆면',
    goal: '각기둥을 돌려 보며 밑면 두 개를 찾아 눌러요.',
  },
  {
    id: 'prism-judge', lesson: 'prism', area: 'prism', kind: 'pjudge', count: 5, order: '검사 주문',
    title: '각기둥이 될까?',
    goal: '전개도를 접으면 각기둥이 될지 골라요.',
  },
  {
    id: 'prism-edge', lesson: 'prism', area: 'prism', kind: 'pedge', count: 3, order: '짝 찾기 주문',
    title: '맞닿는 선분',
    goal: '접었을 때 표시한 선분과 맞닿는 선분을 골라요.',
  },
];
