/**
 * 도전 주문서 "모서리와 꼭짓점"(prism-count, 셈 주문)의 규칙 (순수 함수 — 단계에 들어갈 때 받는 묶음). 화면은 grade6/play-pcount.js.
 * 기획서: spec-grade6.md 1-1절("생각을 더하다" — 표 → 규칙 → 식) · 2-2절 · 8절(도전 주문서) · 15-25 · 15-26, common-rules 1 · 2절.
 *
 * 5문항: 셈 3(각기둥을 돌려 보며 모서리 또는 꼭짓점의 수 — 모서리 · 꼭짓점이 한 번 이상씩) → 규칙 2(모서리 · 꼭짓점의 수를 구하는 식을 보기에서).
 *   셈 문항의 각기둥은 서로 다른 밑면(삼각형 · 사각형 · 오각형 · 육각형 가운데 셋). 답한 뒤에는 그 각기둥의 모서리와 꼭짓점을 함께 세어 보이고
 *   "알아낸 것" 표에 한 줄(각기둥 · 한 밑면의 변 · 모서리 · 꼭짓점)이 더해진다 — 규칙 문항은 그 표를 보고 고른다.
 * 보기(셈): 정답 + 흔한 실수 셋. 셈 문항은 모서리 둘 · 꼭짓점 하나(차례는 섞음). 흔한 실수 "한 밑면의 변의 수 n"(옆으로 선 모서리만 · 한 밑면만)은
 *   판마다 셈 문항 하나에만 꼭 넣고(사용자 결정 15-29), n이 없는 모서리 문항에는 "두 밑면의 모서리만 2n"을 꼭 넣는다(review-prism-g2 R7 · G2b-1).
 *   보기 묶음은 문항의 꼴 · n마다 셈으로 정한 표(CHOICE_TABLE)에서 뽑는다 — 자리 · 값 · 꼴만 보고 고르는 규칙이 꼴마다 모두 0.36 아래(G2-1 · G2b-1 · G2c-1, 단위 검사).
 * 별: 엔진 기본(5문항을 한 번씩 답함 — 한 번 틀리면 80% ★2). 답하기 전 무대에는 수 · 표시가 없다(정답 노출 0).
 */
import { josa } from '../../../shared/core/korean.js';
import { BASES, BASE_NAMES, PRISM_NAMES, prismSolid } from '../solids.js';
import { PRISM_COUNT_TAGS as TAGS } from './prism-stages.js';

/** 셈 문항의 각기둥: 변의 수 → 고를 수 있는 밑면 (G1의 밑면 — 정다각형 · 세 변이 다른 삼각형 · 사다리꼴) */
const BASE_OF = Object.freeze({ 3: ['tri-eq', 'tri-sc'], 4: ['trap'], 5: ['pent'], 6: ['hex'] });
export const COUNT_HEIGHTS = Object.freeze([3, 4]);

/** 수 n개 → "n개" */
const pieces = (v) => `${v}개`;

/**
 * 셈 문항의 보기 후보(값 → 까닭 id): 모서리(정답 3n) · 꼭짓점(정답 2n).
 * side: 옆으로 선 모서리만 · one: 한 밑면만 · base2: 두 밑면의 모서리만(= 꼭짓점 수) · edges: 모서리의 수 · faces: 면의 수 ·
 * twice: 면마다 세어 같은 것을 여러 번 셈(모서리 4n · 5n · 6n, 꼭짓점 4n · 6n) · plus: 더 세었거나 빠뜨림(정답에서 1~3 차이 — 한 끗 차이 보기)
 * 한 끗 차이 보기는 빼지 않고 늘렸다: 빼면 후보가 모자라 보기만 보고 고르는 규칙이 50~61%까지 오른다(review-prism-g2 재검토 2 · G2c-1 — 아래 CHOICE_TABLE)
 */
export function countPool(what, n) {
  if (what === 'edges') {
    return [
      { value: n, why: 'side' }, { value: 2 * n, why: 'base2' }, { value: n + 2, why: 'faces' },
      { value: 4 * n, why: 'twice' }, { value: 5 * n, why: 'twice' }, { value: 6 * n, why: 'twice' },
      { value: 3 * n + 1, why: 'plus' }, { value: 3 * n + 2, why: 'plus' }, { value: 3 * n + 3, why: 'plus' },
      { value: 3 * n - 1, why: 'plus' }, { value: 3 * n - 2, why: 'plus' }, { value: 3 * n - 3, why: 'plus' },
    ];
  }
  return [
    { value: n, why: 'one' }, { value: 3 * n, why: 'edges' }, { value: n + 2, why: 'faces' },
    { value: 4 * n, why: 'twice' }, { value: 6 * n, why: 'twice' },
    { value: 2 * n + 1, why: 'plus' }, { value: 2 * n + 2, why: 'plus' }, { value: 2 * n - 2, why: 'plus' }, { value: 2 * n - 1, why: 'plus' }, { value: n + 1, why: 'plus' },
  ];
}
/**
 * 보기 묶음 표 — 문항의 꼴(모서리 · 꼭짓점 × 흔한 실수 n이 보이는지)과 n마다 [실수 셋(작은 수부터)…, 무게(천분율)].
 * 꼭 넣을 보기: n이 보이는 문항(판마다 하나 — 사용자 결정 15-29)은 n, n이 없는 모서리 문항은 2n(두 밑면의 모서리만 — R7 · G2b-1), 그 밖에는 n을 넣지 않는다.
 * 무게는 손으로 맞추지 않고 셈으로 정했다(review-prism-g2 재검토 2 · G2c-1): 보기만 보고 고르는 규칙 전부(자리 · 가장 가까운 두 수 · 가장 큰 간격 ·
 * 평균에 가까운 수 · 짝홀 · 이웃과의 거리 · n의 배수 종류 · 주어진 수 n — 하나와 둘씩 묶은 것)의 꼴마다 맞힐 확률 가운데 가장 큰 것을 가장 작게 하는
 * 묶음 분포(곱셈 무게 되풀이)를 구해 천분율로 반올림했다. 꼴마다 가장 센 규칙: 모서리 33.8% · 모서리와 n 33.4% · 꼭짓점 30.0% · 꼭짓점과 n 35.3%(정확한 값 —
 * 단위 검사가 이 표로 다시 셈한다). "n보다 큰 n의 배수 가운데 첫째 · 둘째"는 배울 내용이라 따로(판 전체 49.9% · 53.0%, 0.6 아래).
 * 만든 셈: scratchpad build-g2/g2d/solve.mjs(규칙 rules.mjs — Review 도구 pcount2 · 3 · 4의 규칙을 옮김)
 */
export const CHOICE_TABLE = Object.freeze({
  'edges': {
    3: [[5, 6, 18, 50], [5, 6, 7, 599], [5, 6, 15, 120], [6, 12, 18, 51], [6, 7, 12, 45], [6, 11, 18, 5], [6, 11, 15, 30], [6, 8, 15, 16], [6, 7, 15, 74], [6, 10, 15, 10]],
    4: [[6, 8, 24, 169], [6, 8, 9, 494], [8, 16, 24, 86], [8, 11, 16, 109], [8, 9, 16, 24], [8, 14, 24, 12], [8, 15, 24, 1], [8, 9, 10, 105]],
    5: [[7, 10, 20, 1], [7, 10, 30, 43], [7, 10, 17, 10], [7, 10, 14, 37], [7, 10, 25, 168], [7, 10, 12, 4], [10, 20, 30, 311], [10, 17, 20, 24], [10, 14, 20, 1], [10, 13, 20, 38], [10, 17, 30, 67], [10, 17, 25, 170], [10, 13, 14, 14], [10, 14, 25, 5], [10, 13, 16, 2], [10, 13, 25, 92], [10, 12, 13, 9], [10, 18, 25, 6]],
    6: [[8, 12, 36, 180], [8, 12, 20, 6], [8, 12, 17, 37], [8, 12, 19, 1], [8, 12, 15, 11], [8, 12, 21, 1], [12, 24, 36, 416], [12, 20, 24, 24], [12, 17, 24, 120], [12, 19, 24, 1], [12, 15, 24, 46], [12, 21, 24, 1], [12, 20, 36, 94], [12, 19, 36, 41], [12, 15, 17, 10], [12, 16, 19, 1], [12, 15, 16, 10]],
  },
  'edges+n': {
    3: [[3, 5, 6, 113], [3, 6, 12, 1], [3, 6, 7, 221], [3, 5, 12, 3], [3, 12, 18, 2], [3, 11, 12, 3], [3, 8, 12, 229], [3, 7, 12, 30], [3, 12, 15, 254], [3, 11, 18, 50], [3, 11, 15, 25], [3, 8, 15, 70]],
    4: [[4, 6, 8, 7], [4, 8, 16, 3], [4, 8, 11, 5], [4, 8, 10, 89], [4, 8, 9, 179], [4, 6, 16, 23], [4, 16, 24, 224], [4, 11, 16, 285], [4, 13, 16, 1], [4, 9, 16, 22], [4, 15, 16, 23], [4, 14, 24, 39], [4, 13, 24, 14], [4, 20, 24, 8], [4, 15, 24, 22], [4, 9, 11, 10], [4, 9, 10, 44], [4, 15, 20, 2]],
    5: [[5, 7, 10, 5], [5, 10, 20, 1], [5, 10, 14, 10], [5, 10, 12, 106], [5, 7, 20, 12], [5, 20, 30, 2], [5, 14, 20, 228], [5, 13, 20, 41], [5, 20, 25, 270], [5, 18, 20, 3], [5, 17, 30, 12], [5, 25, 30, 1], [5, 17, 25, 46], [5, 13, 14, 39], [5, 14, 25, 42], [5, 12, 14, 2], [5, 12, 13, 165], [5, 12, 25, 11], [5, 18, 25, 3]],
    6: [[6, 8, 12, 7], [6, 12, 24, 3], [6, 12, 17, 4], [6, 12, 16, 5], [6, 12, 15, 258], [6, 8, 24, 23], [6, 24, 36, 224], [6, 17, 24, 285], [6, 19, 24, 1], [6, 15, 24, 22], [6, 21, 24, 3], [6, 20, 36, 39], [6, 19, 36, 14], [6, 30, 36, 30], [6, 21, 36, 22], [6, 15, 17, 7], [6, 15, 16, 53]],
  },
  'vertices': {
    3: [[4, 5, 9, 64], [4, 8, 9, 1], [7, 8, 9, 53], [4, 5, 12, 43], [8, 12, 18, 393], [4, 12, 18, 82], [4, 8, 12, 364]],
    4: [[6, 12, 16, 59], [6, 10, 12, 84], [12, 16, 24, 423], [10, 12, 16, 1], [6, 10, 16, 227], [5, 6, 10, 198], [5, 6, 7, 7]],
    5: [[8, 12, 15, 68], [6, 8, 15, 236], [6, 7, 8, 448], [12, 20, 30, 1], [6, 20, 30, 28], [8, 12, 20, 36], [6, 8, 20, 183]],
    6: [[8, 18, 24, 72], [8, 18, 36, 24], [8, 10, 18, 170], [7, 8, 18, 206], [18, 24, 36, 145], [8, 10, 14, 66], [7, 8, 10, 199], [7, 8, 11, 118]],
  },
  'vertices+n': {
    3: [[3, 8, 12, 503], [3, 4, 12, 496]],
    4: [[4, 6, 12, 276], [4, 12, 24, 307], [4, 5, 6, 416]],
    5: [[5, 6, 7, 470], [5, 12, 20, 212], [5, 8, 20, 243], [5, 6, 20, 4], [5, 6, 8, 71]],
    6: [[6, 8, 18, 1], [6, 18, 36, 271], [6, 10, 18, 273], [6, 8, 10, 399], [6, 8, 11, 1], [6, 7, 8, 54]],
  },
});

/** 정답 · 실수 셋으로 보기 넷(작은 수부터): 표에서 무게대로 한 묶음을 뽑고, 값마다 보기 후보의 까닭을 붙인다 */
function countChoices(rng, what, n, { must = false } = {}) {
  const answer = what === 'edges' ? 3 * n : 2 * n;
  const rows = CHOICE_TABLE[`${what}${must ? '+n' : ''}`][n];
  let x = rng.next() * rows.reduce((sum, row) => sum + row[3], 0);
  let row = rows.at(-1);
  for (const r of rows) {
    x -= r[3];
    if (x < 0) {
      row = r;
      break;
    }
  }
  const pool = countPool(what, n);
  const picked = row.slice(0, 3).map((value) => pool.find((c) => c.value === value));
  return [{ value: answer, why: 'answer' }, ...picked].sort((a, b) => a.value - b.value);
}

/** 규칙 문항의 보기 (식) — 모서리 · 꼭짓점 문항이 같은 넷을 쓰고 자리는 섞는다 */
/** 식 보기: 단추에는 짧게(□ = 한 밑면의 변의 수 — 주문서에 한 줄로 적는다), 문장에는 풀어서 */
export const RULE_BOX = '□';
export const RULES = Object.freeze([
  { id: 'x3', label: '□ × 3', text: '(한 밑면의 변의 수) × 3', of: (n) => 3 * n },
  { id: 'x2', label: '□ × 2', text: '(한 밑면의 변의 수) × 2', of: (n) => 2 * n },
  { id: 'p2', label: '□ + 2', text: '(한 밑면의 변의 수) + 2', of: (n) => n + 2 },
  { id: 'x2p2', label: '□ × 2 + 2', text: '(한 밑면의 변의 수) × 2 + 2', of: (n) => 2 * n + 2 },
]);
const RULE_OF = Object.freeze({ edges: 'x3', vertices: 'x2' });
export const WHAT_NAMES = Object.freeze({ edges: '모서리', vertices: '꼭짓점' });

/** 각기둥 하나 (선 것 — 아래 밑면이 바닥, 세로축 둘레로 조금 돌린 자세는 화면이 정한다) */
function countSolid(rng, n) {
  const base = rng.pick(BASES.filter((b) => BASE_OF[n].includes(b.kind)));
  const height = rng.pick(COUNT_HEIGHTS);
  return { base, height, solid: prismSolid({ base: base.poly, height }) };
}

/**
 * 문항 만들기: [{ kind: 'count', what, n, name, solid, base, height, choices: [{ value, why }], answer, itemId } × 3,
 *   { kind: 'rule', what, choices: [{ id, text }], answer, itemId } × 2]
 * 셈 셋: 변의 수가 서로 다른 각기둥, 묻는 것은 모서리 · 꼭짓점이 한 번 이상씩. 정답의 크기 차례는 판 안에서 겹치지 않게(지우기만으로 맞히지 못하게)
 */
export function makeCountQuestions(stage, rng) {
  const ns = rng.shuffle([3, 4, 5, 6]).slice(0, 3);
  // 모서리 둘 · 꼭짓점 하나(차례는 섞음) — 꼭짓점 문항은 "n의 배수 가운데 n 다음 수"가 곧 정답(2n)이라 그 몫을 셋에 하나로(review-prism-g2 R7)
  const whats = rng.shuffle(['edges', 'edges', 'vertices']);
  const mustAt = rng.int(0, 2); // 흔한 실수 n을 넣는 문항(판마다 한 번 — 15-29)
  const out = ns.map((n, i) => {
    const what = whats[i];
    const choices = countChoices(rng, what, n, { must: i === mustAt });
    const { base, height, solid } = countSolid(rng, n);
    const answer = what === 'edges' ? 3 * n : 2 * n;
    return {
      kind: 'count', number: i + 1, what, n, name: PRISM_NAMES[n], baseName: BASE_NAMES[n], base: base.id, height, solid, choices, answer,
      itemId: `${stage.id}:${i + 1}:${base.id}-h${height}-${what}`,
    };
  });
  for (const [k, what] of ['edges', 'vertices'].entries()) {
    const order = rng.shuffle(RULES.map((r) => r.id));
    out.push({ kind: 'rule', number: 4 + k, what, choices: order.map((id) => ({ id, label: RULES.find((r) => r.id === id).label, text: RULES.find((r) => r.id === id).text })), answer: RULE_OF[what], itemId: `${stage.id}:${4 + k}:rule-${what}` });
  }
  return out;
}

/** 한 각기둥의 모서리 · 꼭짓점 (표의 한 줄 · 답한 뒤 세어 보이는 글) */
export const countsOf = (n) => ({ edges: 3 * n, vertices: 2 * n, faces: n + 2 });

/** 답한 뒤 세어 보이는 글: "위 밑면 6개 + 아래 밑면 6개 + 옆 6개 = 18개" (무대의 무늬 띠와 같은 차례) */
export function countBreakdown(what, n) {
  if (what === 'edges') return `위 밑면 ${n}개 + 아래 밑면 ${n}개 + 옆 ${n}개 = ${3 * n}개`;
  return `위 밑면 ${n}개 + 아래 밑면 ${n}개 = ${2 * n}개`;
}

/** 틀린 보기의 까닭 (짧게 — 바른 수는 뒤에 이어 적는다) */
const WHY_TEXT = {
  side: () => '옆으로 선 모서리만 셌어요.',
  one: () => '한 밑면의 꼭짓점만 셌어요.',
  base2: () => '두 밑면의 모서리만 셌어요.',
  edges: () => '그 수는 모서리의 수예요.',
  faces: () => '그 수는 면의 수예요.',
  twice: () => '면마다 세어 같은 것을 여러 번 센 것 같아요.',
  plus: () => '더 세었거나 빠뜨린 것 같아요.',
};

/** 셈 문항 채점: value = 고른 수 */
export function judgeCount(q, value) {
  const choice = q.choices.find((c) => c.value === value);
  if (!choice) throw new Error(`없는 보기: ${value}`);
  const name = WHAT_NAMES[q.what];
  const sum = `${name}${q.what === 'edges' ? '는' : '은'} ${countBreakdown(q.what, q.n)}예요.`;
  if (value === q.answer) return { correct: true, expected: pieces(q.answer), tag: null, message: `맞아요! ${q.name}의 ${sum}` };
  return { correct: false, expected: pieces(q.answer), tag: q.what === 'edges' ? TAGS.edges : TAGS.vertices, message: `${WHY_TEXT[choice.why](q)} ${sum}` };
}

/** 규칙 문항 채점: id = 고른 식 — rows: 알아낸 것 표의 줄 [{ name, n }] (표의 첫 줄로 짚는다) */
export function judgeRule(q, id, rows = []) {
  const rule = RULES.find((r) => r.id === id);
  if (!rule) throw new Error(`없는 보기: ${id}`);
  const right = RULES.find((r) => r.id === q.answer);
  const name = WHAT_NAMES[q.what];
  const row = rows[0];
  const real = row ? countsOf(row.n)[q.what] : null;
  const expr = (r) => r.label.replace(RULE_BOX, String(row.n));
  const head = `${name}의 수는 ${josa(right.text, '이에요/예요')}.`;
  if (id === q.answer) {
    return { correct: true, expected: right.text, tag: null, message: `맞아요! ${head}${row ? ` ${josa(row.name, '은/는')} ${expr(right)} = ${real}개예요.` : ''}` };
  }
  const check = row ? ` ${josa(row.name, '은/는')} ${name}${q.what === 'edges' ? '가' : '이'} ${real}개인데, 고른 식으로는 ${expr(rule)} = ${josa(rule.of(row.n), '이에요/예요')}.` : '';
  return { correct: false, expected: right.text, tag: TAGS.rule, message: `${head}${check}` };
}

/** 문항의 물음 글 */
export function countPrompt(q) {
  if (q.kind === 'rule') return `${WHAT_NAMES[q.what]}의 수를 구하는 식을 골라요.`;
  return `${WHAT_NAMES[q.what]}${q.what === 'edges' ? '는' : '은'} 모두 몇 개일까요?`;
}

export { pieces };
