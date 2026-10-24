/**
 * 각기둥의 전개도 차시(prism)의 차시·단계 목록 (순수 데이터). 단계 지도·학년·영역 화면이 처음부터 쓰므로 바탕 묶음에 들어간다.
 * 문제 만들기·판정·화면은 단계에 들어갈 때 받는 묶음(prism-play.js — spec-grade6.md 7-4절 "영역을 들어갈 때 불러오기")에 있다.
 * 기획서: docs/games/net-workshop/spec-grade6.md 2-2절(단계 표) · 4절(오개념) · 5절(정답 노출). G1은 1~3단계, G2는 4단계(전개도 완성하기)와 도전 주문서(모서리와 꼭짓점 — 15-25).
 *
 * kind: parts(밑면과 옆면 — 입체에서 밑면 두 개 고르기) · pjudge(각기둥이 될까? — 예상 → 접어 확인 → 까닭) · pedge(맞닿는 선분 — 짝 찾기)
 *   · pfree(전개도 완성하기 — 빈 판에 면 카드를 끌어 놓고 돌려 직접 배치, 모서리 가까이 놓으면 자석처럼 붙음(15-30 · 15-31), 예상 없이 [접어 보기], 별은 찾은 가지 수) · pcount(도전: 모서리와 꼭짓점 — 셈 3 + 규칙 2)
 * area: 'prism' — main.js가 이 표시로 각기둥 화면(grade6/prism-play.js)에 넘긴다
 * 별: 세 단계 모두 엔진 기본(정답률 90% ★3 · 70% ★2). 밑면과 옆면 · 맞닿는 선분은 3문항을 맞힐 때까지 다시 해 한 번 틀리면 3 / 4 = 75%(★2),
 *   두 번이면 3 / 5 = 60%(★1)이라 틀린 횟수로 정하는 것(common-rules 1절)과 별이 같다. 판별은 5문항을 한 번씩 답한다(한 번 틀리면 80% ★2)
 */
/**
 * 차시 (교과서 6-1 2단원 「각기둥과 각뿔」 1~3차시 32~43쪽) — minutes: 문항마다의 어림(밑면 고르기 30~45초 · 판별 25~35초 + 까닭 · 맞닿는 선분 25~35초 + 단계 사이)과
 * 자동으로 해 본 시간으로 정한 어림 약 7분(Build G1 보고 — 학생이 직접 한 시간은 재지 못했다). G2에서 4단계(전개도 완성하기 — 전개도 2가지, 한 가지에
 * 면 카드 5~8장 놓기와 접어 보기로 1분 30초 안팎 — G2r에서 미리 놓인 면 없이 모두 놓는다)가 더해져 약 10분(도전 주문서는 차시 시간에 넣지 않는다)
 */
export const PRISM_UNIT = '6학년 1학기 · 각기둥과 각뿔';
export const PRISM_LESSONS = [
  { id: 'prism', title: '각기둥의 전개도', minutes: 10, note: PRISM_UNIT },
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
/** 도전 주문서 "모서리와 꼭짓점"의 tag (4절 표에 없는 새 말 — 교과서 6-1 37 · 48쪽의 말) */
export const PRISM_COUNT_TAGS = Object.freeze({
  edges: '모서리의 수',
  vertices: '꼭짓점의 수',
  rule: '수의 규칙',
});

/** 각기둥 영역의 놀이 방법 (영역의 단계 지도·?lesson=prism에서) */
export const PRISM_HOW_TO = [
  '각기둥은 끌어서 여러 방향으로 돌려 볼 수 있어요. 밑면 두 개를 눌러 고른 다음 [확인]을 눌러요.',
  '전개도를 보고, 접으면 각기둥이 될지 먼저 머릿속으로 생각해요. 답한 뒤에 [접어 보기]나 막대로 접어서 확인해요.',
  '틀리면 겹치는 면(빗금, ✗ 겹쳐요)과 비는 곳(점선, 비어요), 길이가 다른 선분을 보여 줘요. 오른쪽 까닭 쪽지를 읽어 보세요.',
  '맞닿는 선분은 전개도의 번호를 누르거나 오른쪽 번호 버튼을 눌러 골라요.',
  '키보드는 Tab과 Enter, 방향키를 써요. 각기둥을 돌릴 때는 방향키, 크게·작게는 더하기·빼기 키예요.',
  '전개도 완성하기에서는 면 카드를 판으로 끌어 놓아요. 놓인 면의 모서리 가까이 놓으면 자석처럼 붙어요. 면을 누르면 나오는 ↻나 [돌리기], R 키로 30°씩 돌려요.',
  '면을 모두 놓으면 [접어 보기]로 확인해요. 서로 다른 전개도를 3가지까지 찾아봐요.',
  '네 단계를 모두 마치면 도전 주문서(모서리와 꼭짓점)가 열려요. 하고 싶은 사람만 해요. 시간은 [시간 재기]를 켠 사람에게만 보여요.',
];

/**
 * 전개도 완성하기(prism-free — Build G2)에서 찾은 각기둥 전개도를 이 기기에 적어 두는 모음(엔진의 보이지 않는 모음 — 점수는 전개도마다 한 번, common-rules 3절).
 * 각기둥마다 서로 다른 전개도의 가짓수(count — 신장 트리를 모두 나열해 셈, 검사 tests/unit/net-workshop-prism-free.test.js)와 칸 id(그 차례).
 * 문제 만들기·판정은 늦게 받는 묶음(prism-free-logic.js)에 있고, 처음 묶음에는 이 가짓수만 둔다(모음의 칸 목록을 만드는 데)
 */
export const PRISM_FREE_COLLECTION = 'prism-nets';
export const PRISM_FREE_SOLIDS = Object.freeze([
  { id: 'tri-a', count: 23 },
  { id: 'tri-b', count: 23 },
  { id: 'trap-a', count: 104 },
  { id: 'trap-b', count: 104 },
  { id: 'hex-a', count: 354 },
  { id: 'hex-b', count: 354 },
]);
export const prismFreeItemId = (solidId, index) => `${solidId}-${String(index + 1).padStart(3, '0')}`;
/** 끝낼 수 있는 가지 수 · 별 3개의 가지 수 (spec 16-14 · 15-2) */
export const PRISM_FREE_GOAL = 2;
export const PRISM_FREE_FULL = 3;
/**
 * 점수 상한(common-rules 3절 — 모을 것이 아주 많은 탐구): 이 기기에서 처음 찾는 각기둥 전개도(모든 각기둥을 합쳐) 10가지까지는 만들기 성공(+2 · 연속)과
 * 등록 +5, 11~30번째는 새로 찾을 때마다 등록 +1뿐, 31번째부터는 0점(사용자 결정 15-29 — 962가지라 이 단계 최대 104점). "찾은 가지 수"는 계속 오른다
 */
export const PRISM_FREE_FULL_SCORE = 10;
export const PRISM_FREE_LATER_XP = 1;
export const PRISM_FREE_LATER_UNTIL = 30;

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
  {
    // 별은 이번 판에 찾은 서로 다른 전개도 수(2가지부터 끝낼 수 있고 3가지면 별 3개 — spec 16-14 · 15-2). count = 끝낼 수 있는 가지 수
    id: 'prism-free', lesson: 'prism', area: 'prism', kind: 'pfree', count: PRISM_FREE_GOAL, order: '설계 주문',
    title: '전개도 완성하기',
    goal: '면 카드를 판에 놓아 각기둥의 전개도를 만들어요.',
  },
  {
    // 도전 주문서(15-25): 차시의 네 단계를 마치면 열리고 별 합계에 넣지 않는다. 시간 재기는 켠 학생만
    id: 'prism-count', lesson: 'prism', area: 'prism', kind: 'pcount', challenge: true, timer: 'optional', count: 5, order: '셈 주문',
    title: '모서리와 꼭짓점',
    goal: '한 밑면의 변의 수로 모서리와 꼭짓점의 수를 알아봐요.',
  },
];

/**
 * 각기둥 도장(spec-grade6 8절): 기둥 설계사 — 각기둥 전개도를 서로 다른 모양으로 2가지 완성. 학습 기록(전개도 완성하기의 맞은 답 — 문항 id 끝이
 * 찾은 전개도의 칸 id)으로 판정하는 순수 함수. 도장판 16 → 17칸
 */
export function prismDesigns(records = []) {
  const ids = new Set();
  for (const r of records) {
    if (r.stageId !== 'prism-free') continue;
    for (const a of r.answers ?? []) {
      const id = String(a.itemId ?? '').split(':')[2];
      if (a.correct && id && id !== 'x' && id !== 'c') ids.add(id);
    }
  }
  return ids.size;
}
export const PRISM_BADGES = [
  {
    id: 'prism-designer',
    title: '기둥 설계사',
    desc: '각기둥의 전개도를 서로 다른 모양으로 2가지 완성해요',
    icon: 'cube',
    test: (s) => prismDesigns(s.records) >= 2,
  },
];

/** 찾은 각기둥 전개도 모음(보이지 않는 모음 — 엔진 docs/engine.md 10절): 칸은 각기둥마다 그 가짓수만큼 */
export const PRISM_COLLECTIONS = [
  {
    id: PRISM_FREE_COLLECTION,
    title: '각기둥 전개도',
    lesson: 'prism',
    quiet: true,
    xpAfter: { count: PRISM_FREE_FULL_SCORE, xp: PRISM_FREE_LATER_XP, until: PRISM_FREE_LATER_UNTIL },
    items: PRISM_FREE_SOLIDS.flatMap((s) => Array.from({ length: s.count }, (_, i) => ({ id: prismFreeItemId(s.id, i), name: `각기둥 전개도 ${prismFreeItemId(s.id, i)}` }))),
  },
];
