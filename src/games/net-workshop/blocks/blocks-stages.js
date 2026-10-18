/**
 * 쌓기나무 영역의 차시·단계 목록 (순수 데이터 + 별 기준). 단계 지도·학년·영역 화면이 처음부터 쓰므로 바탕 묶음에 들어간다.
 * 문제 만들기·판정·화면은 단계에 들어갈 때 받는 묶음(blocks-play.js — spec-grade6.md 7-4절 "영역을 들어갈 때 불러오기")에 있다.
 * B0b에서 blocks-logic.js의 이 부분을 내용 그대로 옮겼다(blocks-logic.js가 같은 이름으로 다시 내보낸다).
 */
/** 차시 묶음 (교과서 6-2 3단원의 차시와 하나씩 짝 — S1은 1·2차시) */
export const BLOCK_UNIT = '6학년 2학기 · 공간과 입체';
/**
 * chip: 단계 지도의 차시 칩(영역 고르는 화면이 생기기 전까지 정육면체 차시 뒤에 이어 보이므로 "쌓기나무 n차시"라고 적는다 — 교과서의 차시 번호)
 * minutes: 이 차시의 어림 시간(문항 수로 어림: 5~7분 · 7~10분) · note: 단원
 */
export const BLOCK_LESSONS = [
  { id: 'blocks-look', title: '어느 방향에서 보았을까', chip: '쌓기나무 1차시', minutes: 6, note: BLOCK_UNIT },
  { id: 'blocks-top', title: '만든 모양과 위에서 본 모양', chip: '쌓기나무 2차시', minutes: 8, note: BLOCK_UNIT },
  // S2: 교과서 3·4차시 (60~65쪽). 시간은 문항마다 어림(고르기 25~35초 · 칠하기·수 쓰기 35~55초 · 쌓기 45~80초, 위·앞·옆 세 장 칠하기는 그 두 배쯤)으로: 3차시 8~12분 · 4차시 6~9분
  { id: 'blocks-three', title: '위, 앞, 옆에서 본 모양', chip: '쌓기나무 3차시', minutes: 10, note: BLOCK_UNIT },
  { id: 'blocks-number', title: '위에서 본 모양에 수 쓰기', chip: '쌓기나무 4차시', minutes: 7, note: BLOCK_UNIT },
  // S3: 교과서 5차시 (66~67쪽) + 생각을 더하다(68~69쪽)는 도전 주문서. 시간은 직접 해 보고 잰 것과 문항마다 어림(칠하기 35~55초 · 쌓기 45~80초 · 고르기 25~35초)으로: 8~10분
  { id: 'blocks-layer', title: '층별로 나타내기', chip: '쌓기나무 5차시', minutes: 9, note: BLOCK_UNIT },
];

/**
 * 놀이 방법에 덧붙이는 쌓기나무 줄 (main.js의 howTo 끝에): 3·4차시의 모눈 칠하기·수 쓰기 둘(review-blocks-s2 S2-12) + 쌓기·돌려 보기 둘.
 * (쌓기·돌려 보기 두 줄이 맨 끝이다 — 처음 화면의 놀이 방법 검사가 그 두 줄을 끝에서 찾는다)
 */
export const BLOCK_HOW_TO = [
  '위, 앞, 옆에서 본 모양은 모눈의 칸을 눌러 칠하고, 한 번 더 누르면 지워요.',
  '위에서 본 모양에 수를 쓸 때는 칸을 누를 때마다 1, 2, 3으로 바뀌어요. [내리기] [올리기]로도 고쳐요.',
  // S3: 5차시와 도전 주문서
  '층별 모양은 층마다 위에서 본 모양처럼 칸을 칠해 나타내요. [확인하기]를 누르면 층별로 벌어져 견줘 봐요.',
  '5차시의 세 단계를 마치면 도전 주문서(더 붙여서 만들기)가 열려요. 하고 싶은 사람만 해요. 시간은 [시간 재기]를 켠 사람에게만 보여요.',
  '쌓기나무 차시에서는 판을 짧게 누르면 쌓이고, [빼기]를 누른 다음 누르면 빠져요. "위에서 본 판"의 칸을 눌러도 돼요.',
  '쌓기나무는 끌어서 여러 방향으로 돌려 보고, [위] [앞] [옆]을 누르면 그 방향에서 본 모양이 돼요.',
];

/** 별을 틀린 답의 수로 정하는 단계(starsBy: 'wrong'): 0번 ★3 · 1번 ★2 · 2번 이상 ★1 (주사위 주문 spec 16-13과 같은 기준) */
export function starsByWrong(wrong) {
  const n = Math.max(0, Math.floor(Number(wrong) || 0));
  return n === 0 ? 3 : n === 1 ? 2 : 1;
}

/** 결과 화면의 별 기준 안내 (별 3개가 안 될 때. 별 3개면 엔진의 "별 3개를 모두 받았어요!") */
export function starNoteByWrong(stars) {
  if (stars >= 3) return null;
  return stars === 2 ? '한 번도 틀리지 않으면 별 3개!' : '한 번만 틀리면 별 2개, 한 번도 틀리지 않으면 별 3개!';
}

/**
 * kind: play(쌓기 놀이터 — 채점 없음) · where(어느 쪽에서 본 모습인지 고르기) · scene(그쪽에서 본 모습 고르기)
 *       · copy(그림을 보고 똑같이 쌓기) · count(개수 고르기) · hidden(쌓기 → 다른 개수로도? → 한 번 더 쌓기)
 *       · flip(반대쪽에서 본 모양 고르기) · draw(위·앞·옆에서 본 모양을 모눈에 칠하기) · build(위·앞·옆을 보고 쌓기 → 다른 개수로도?)
 *       · write(자리마다 수 쓰기) · fromnum(수를 보고 쌓기) · numviews(수만 보고 앞·옆 칠하기, 모양 고르기)
 * area: 'blocks' — main.js가 이 표시로 쌓기나무 화면(blocks/blocks-play.js — 단계에 들어갈 때 받는 묶음)에 넘긴다
 * starsBy: 'wrong' — 별을 틀린 답의 수로 정한다(0번 ★3 · 1번 ★2 · 2번 이상 ★1, starsByWrong). 문항이 2~3개뿐이라
 *   엔진의 정답률 기준(90%·70%)으로는 한 번만 틀려도 ★1이 되고 ★2가 나올 수 없는 단계에 쓴다(사용자 결정 2026-10-11).
 *   S2에서는 blocks-flip(3문항을 한 번씩 답함), blocks-fromnum(2문항을 맞힐 때까지), blocks-numviews(칠하기 2 + 고르기 1 — 고르기를 한 번
 *   틀리면 2/3 = 67%)가 그렇다. blocks-draw·blocks-write(3문항을 맞힐 때까지: 한 번 틀리면 75% ★2)와 blocks-build(답 7개 이상)는 정답률 그대로
 */
export const BLOCK_STAGES = [
  {
    id: 'blocks-play', lesson: 'blocks-look', area: 'blocks', kind: 'play', count: 3, order: '연습 주문',
    title: '쌓기 놀이터',
    goal: '쌓기나무를 쌓고, 빼고, 돌려 보며 쓰는 법을 익혀요.',
  },
  {
    id: 'blocks-where', lesson: 'blocks-look', area: 'blocks', kind: 'where', count: 4, order: '관찰 주문',
    title: '어느 방향에서 보았을까?',
    goal: '그림을 보고 어느 쪽에서 본 모습인지 골라요.',
  },
  {
    id: 'blocks-scene', lesson: 'blocks-look', area: 'blocks', kind: 'scene', count: 3, order: '관찰 주문', starsBy: 'wrong',
    title: '이쪽에서 보면?',
    goal: '위에서 본 그림을 보고, 화살표 쪽에서 본 모습을 골라요.',
  },
  {
    id: 'blocks-copy', lesson: 'blocks-top', area: 'blocks', kind: 'copy', count: 2, order: '따라 쌓기 주문', starsBy: 'wrong',
    title: '똑같이 만들기',
    goal: '그림을 보고 똑같은 모양으로 쌓아요.',
  },
  {
    id: 'blocks-count', lesson: 'blocks-top', area: 'blocks', kind: 'count', count: 4, order: '셈 주문',
    title: '모두 몇 개일까?',
    goal: '그림과 위에서 본 모양을 보고 쌓기나무의 개수를 구해요.',
  },
  {
    id: 'blocks-hidden', lesson: 'blocks-top', area: 'blocks', kind: 'hidden', count: 2, order: '탐정 주문',
    title: '숨겨진 쌓기나무',
    goal: '그림과 위에서 본 모양에 맞게 쌓고, 다른 개수로도 되는지 알아봐요.',
  },
  // ── 3차시 (60~63쪽) ──
  {
    id: 'blocks-flip', lesson: 'blocks-three', area: 'blocks', kind: 'flip', count: 3, order: '관찰 주문', starsBy: 'wrong',
    title: '앞과 뒤, 오른쪽과 왼쪽',
    goal: '한쪽에서 본 모양을 보고, 반대쪽에서 본 모양을 골라요.',
  },
  {
    id: 'blocks-draw', lesson: 'blocks-three', area: 'blocks', kind: 'draw', count: 3, order: '기록 주문',
    title: '위, 앞, 옆에서 본 모양 그리기',
    goal: '만든 모양을 보고 위, 앞, 옆에서 본 모양을 칠해요.',
  },
  {
    id: 'blocks-build', lesson: 'blocks-three', area: 'blocks', kind: 'build', count: 3, order: '설계 주문',
    title: '위, 앞, 옆을 보고 쌓기',
    goal: '위, 앞, 옆에서 본 모양에 맞게 쌓고, 다른 개수로도 되는지 알아봐요.',
  },
  // ── 4차시 (64~65쪽) ──
  {
    id: 'blocks-write', lesson: 'blocks-number', area: 'blocks', kind: 'write', count: 3, order: '기록 주문',
    title: '자리마다 몇 개?',
    goal: '만든 모양을 돌려 보며 위에서 본 모양의 자리마다 쌓기나무의 수를 써요.',
  },
  {
    id: 'blocks-fromnum', lesson: 'blocks-number', area: 'blocks', kind: 'fromnum', count: 2, order: '설계 주문', starsBy: 'wrong',
    title: '수를 보고 쌓기',
    goal: '위에서 본 모양에 쓴 수를 보고 똑같은 모양으로 쌓아요.',
  },
  {
    id: 'blocks-numviews', lesson: 'blocks-number', area: 'blocks', kind: 'numviews', count: 3, order: '추리 주문', starsBy: 'wrong',
    title: '수만 보고 알아내기',
    goal: '위에서 본 모양에 쓴 수만 보고 앞, 옆에서 본 모양과 만든 모양을 알아내요.',
  },
  // ── 5차시 (66~67쪽) ── S3. 별: 그리기·쌓기는 맞힐 때까지 3문항(한 번 틀리면 75% ★2 — 정답률 그대로),
  //   층별 모양만 보고는 개수 고르기를 한 번만 답해 한 번 틀리면 2/3 = 67%(★1)이 되므로 틀린 횟수로(수만 보고 알아내기와 같다)
  {
    id: 'blocks-layer-draw', lesson: 'blocks-layer', area: 'blocks', kind: 'layerdraw', count: 3, order: '기록 주문',
    title: '층별 모양 그리기',
    goal: '만든 모양과 1층 모양을 보고 2층, 3층 모양을 칠해요.',
  },
  {
    id: 'blocks-layer-build', lesson: 'blocks-layer', area: 'blocks', kind: 'layerbuild', count: 3, order: '설계 주문',
    title: '층별 모양을 보고 쌓기',
    goal: '1층, 2층, 3층 모양을 보고 똑같은 모양으로 쌓아요.',
  },
  {
    id: 'blocks-layer-views', lesson: 'blocks-layer', area: 'blocks', kind: 'layerviews', count: 3, order: '추리 주문', starsBy: 'wrong',
    title: '층별 모양만 보고 알아내기',
    goal: '층별 모양만 보고 쌓기나무의 개수와 앞, 옆에서 본 모양을 알아내요.',
  },
  // 도전 주문서(생각을 더하다 68~69쪽): 5차시의 세 단계를 마치면 열리고 별 합계에 넣지 않는다. 시간 재기는 켠 학생만(정육면체 주사위 주문과 같다)
  {
    id: 'blocks-add', lesson: 'blocks-layer', area: 'blocks', kind: 'add', challenge: true, timer: 'optional', count: 3, order: '증축 주문',
    title: '더 붙여서 만들기',
    goal: '더 붙여서 만들 수 있는 모양을 모두 찾아요.',
  },
];

// ── 쌓기나무 도장 셋 (spec-grade6.md 8절 — 도장판 13 → 16칸) ──────────
// 판정은 모두 학습 기록(state.records — 방금 마친 판 포함)으로 하는 순수 함수. 숨은 도장은 없다(도장판에 받는 방법이 보인다).
// 단계를 마칠 때 엔진이 판정하므로, 지난 기록으로 이미 조건을 채운 학생은 다음에 어느 단계든 마칠 때 한 번 받는다.

/** 그 단계의 기록에서 문항(itemId)마다 첫 답이 맞은 수를 판마다 → [{ items, first }] (keep: 셀 문항 itemId) */
function firstTries(records, stageId, keep = () => true) {
  return records.filter((r) => r.stageId === stageId).map((r) => {
    const seen = new Set();
    let first = 0;
    for (const a of r.answers) {
      if (!a.itemId || !keep(a.itemId) || seen.has(a.itemId)) continue;
      seen.add(a.itemId);
      if (a.correct) first += 1;
    }
    return { items: seen.size, first };
  });
}

/**
 * "숨겨진 쌓기나무가 있는 개수 문항"(모두 몇 개일까? blocks-count — 한 판 4문항 가운데 늘 2문항)을 처음 시도에 맞힌 수의 아래쪽 어림.
 * 학습 기록에는 어느 문항에 숨겨진 쌓기나무가 있었는지가 남지 않는다(이미 사이트에 있는 2차시의 기록을 바꾸지 않았다) —
 * 그래서 판마다 "처음에 맞힌 수 − 숨겨진 것이 없는 문항 수(2)"만큼은 틀림없이 숨겨진 문항을 맞힌 것으로 센다(4문항 모두 맞힌 판 = 2번).
 */
export function hiddenCountWins(records) {
  return firstTries(records, 'blocks-count').reduce((sum, r) => sum + Math.max(0, r.first - (r.items - Math.floor(r.items / 2))), 0);
}
/** 위, 앞, 옆을 보고 쌓기(blocks-build)의 문항마다 쌓기를 첫 [확인하기]에 맞힌 수 (예상·다른 개수로 한 번 더는 세지 않는다) */
export const threeViewWins = (records) => firstTries(records, 'blocks-build', (id) => id.endsWith(':build')).reduce((sum, r) => sum + r.first, 0);
/** 층별 모양을 보고 쌓기(blocks-layer-build)의 문항마다 첫 [확인하기]에 맞힌 수 */
export const layerBuildWins = (records) => firstTries(records, 'blocks-layer-build').reduce((sum, r) => sum + r.first, 0);

export const BLOCK_BADGES = [
  {
    id: 'blocks-hidden-finder',
    title: '숨겨진 쌓기나무 찾기',
    desc: '숨겨진 쌓기나무가 있는 개수 문제를 처음에 3번 맞혀요',
    icon: 'search',
    test: (s) => hiddenCountWins(s.records) >= 3,
  },
  {
    id: 'blocks-three-eyes',
    title: '세 방향의 눈',
    desc: '위, 앞, 옆을 보고 쌓기를 첫 [확인하기]에 3번 맞혀요',
    icon: 'viewfront',
    test: (s) => threeViewWins(s.records) >= 3,
  },
  {
    id: 'blocks-layer-builder',
    title: '층층이 쌓기',
    desc: '층별 모양을 보고 쌓기를 첫 [확인하기]에 3번 맞혀요',
    icon: 'layers',
    test: (s) => layerBuildWins(s.records) >= 3,
  },
];
