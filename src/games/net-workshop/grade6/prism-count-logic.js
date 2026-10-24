/**
 * 도전 주문서 "모서리와 꼭짓점"(prism-count, 셈 주문)의 규칙 (순수 함수 — 단계에 들어갈 때 받는 묶음). 화면은 grade6/play-pcount.js.
 * 기획서: spec-grade6.md 1-1절("생각을 더하다" — 표 → 규칙 → 식) · 2-2절 · 8절(도전 주문서) · 15-25 · 15-26, common-rules 1 · 2절.
 *
 * 5문항: 셈 3(각기둥을 돌려 보며 모서리 또는 꼭짓점의 수 — 모서리 · 꼭짓점이 한 번 이상씩) → 규칙 2(모서리 · 꼭짓점의 수를 구하는 식을 보기에서).
 *   셈 문항의 각기둥은 서로 다른 밑면(삼각형 · 사각형 · 오각형 · 육각형 가운데 셋). 답한 뒤에는 그 각기둥의 모서리와 꼭짓점을 함께 세어 보이고
 *   "알아낸 것" 표에 한 줄(각기둥 · 한 밑면의 변 · 모서리 · 꼭짓점)이 더해진다 — 규칙 문항은 그 표를 보고 고른다.
 * 보기(셈): 정답 + 흔한 실수 셋. 셈 문항은 모서리 둘 · 꼭짓점 하나(차례는 섞음). 흔한 실수 "한 밑면의 변의 수 n"(옆으로 선 모서리만 · 한 밑면만)은
 *   판마다 셈 문항 하나에만 꼭 넣고(사용자 결정 15-29), n이 없는 모서리 문항에는 "두 밑면의 모서리만 2n"을 꼭 넣는다(review-prism-g2 R7 · G2b-1).
 *   정답의 자리는 문항마다 따로 뽑고(G2-1), 자리 · 값 · 꼴만 보고 고르는 규칙이 모두 0.36 아래(단위 검사 — 독립 계산).
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
 * twice: 면마다 세어 같은 것을 여러 번 셈(모서리 4n · 6n, 꼭짓점 4n · 6n) · plus: 더 세었거나 빠뜨림
 */
export function countPool(what, n) {
  if (what === 'edges') {
    return [
      { value: n, why: 'side' }, { value: 2 * n, why: 'base2' }, { value: n + 2, why: 'faces' },
      { value: 4 * n, why: 'twice' }, { value: 6 * n, why: 'twice' }, { value: 3 * n + 2, why: 'plus' }, { value: 3 * n - 1, why: 'plus' },
    ];
  }
  return [
    { value: n, why: 'one' }, { value: 3 * n, why: 'edges' }, { value: n + 2, why: 'faces' },
    { value: 4 * n, why: 'twice' }, { value: 6 * n, why: 'twice' }, { value: 2 * n + 2, why: 'plus' }, { value: 2 * n - 2, why: 'plus' }, { value: 2 * n - 1, why: 'plus' }, { value: n + 1, why: 'plus' },
  ];
}
/** 흔한 실수: 모서리 — 옆으로 선 모서리만(n), 꼭짓점 — 한 밑면만(n). 판마다 셈 문항 하나에만 꼭 넣는다(사용자 결정 15-29) */
const MUST = Object.freeze({ edges: 'side', vertices: 'one' });

/**
 * 정답의 자리(크기 차례 1~4): 문항의 꼴(모서리 · 꼭짓점 × 흔한 실수 n이 보이는지 — 모두 화면에 보인다)마다 될 수 있는 자리끼리 같은 무게로 뽑는다
 * (review-prism-g2 G2b-1 — 판 전체만 고르게 맞추면 꼴마다 한 자리로 치우친다). 될 수 없는 자리: 정답보다 작은 실수가 모자라거나 남을 때.
 * 자리 · 값 · 꼴만 보고 고르는 규칙(자리 하나 · 꼴마다 한 자리 · 가장 작은 것 빼기 · 지워 가며 · n 빼기 …)은 모두 0.36 아래(단위 검사).
 * "n보다 큰 n의 배수 가운데 첫째 · 둘째"는 정답이 늘 2n · 3n이라 둘 가운데 큰 쪽이 50% 아래로 내려갈 수 없다 — 배울 내용(변의 수 × 2 · × 3)으로 보고 따로 잰다
 */
/**
 * 같은 자리에서 짝을 고르는 무게(값만 보고 고르는 규칙이 꼴마다도 맞히기 어렵게 — 단위 검사):
 * n의 배수 보기가 많은 짝을 조금 더 자주(4n · 6n · 3n …), 정답이 "가장 큰 n의 배수"인 짝 · "가장 큰 간격 바로 아래 · 바로 위"인 짝은 덜 자주
 * (그 자리에서 피할 수 없으면 그대로 — 예: 정답이 가장 큰 보기인 자리)
 */
const SET_WEIGHT = Object.freeze({ multiplePull: 1, largestMultiple: 0.03, gapBelow: 0.2, gapAbove: 0.5 });
/** 가장 큰 간격(작은 수부터 늘어놓은 이웃 둘의 차)의 아래쪽 자리 — 같으면 앞의 것 */
const largestGapAt = (v) => {
  let best = 0;
  for (let i = 1; i < v.length - 1; i += 1) if (v[i + 1] - v[i] > v[best + 1] - v[best]) best = i;
  return best;
};
const setWeight = (set, answer, n) => {
  const v = [answer, ...set.map((c) => c.value)].sort((a, b) => a - b);
  const at = v.indexOf(answer);
  const gap = largestGapAt(v);
  let w = (1 + set.filter((c) => c.value % n === 0).length) ** SET_WEIGHT.multiplePull;
  if (v.filter((x) => x % n === 0).at(-1) === answer) w *= SET_WEIGHT.largestMultiple;
  if (gap === at) w *= SET_WEIGHT.gapBelow;
  if (gap + 1 === at) w *= SET_WEIGHT.gapAbove;
  return w;
};
const pickWeighted = (rng, items, weights) => {
  let x = rng.next() * weights.reduce((a, b) => a + b, 0);
  for (const [i, item] of items.entries()) {
    x -= weights[i];
    if (x < 0) return item;
  }
  return items.at(-1);
};

/**
 * 정답 · 실수 셋으로 보기 넷(작은 수부터): 꼭 넣을 보기(흔한 실수 n — 판에서 한 문항 · 15-29, n이 없는 모서리 문항의 두 밑면 모서리 2n — review-prism-g2 R7)를 넣은
 * 세 실수의 모든 짝 가운데, 정답의 자리를 될 수 있는 자리끼리 같은 무게로 먼저 뽑고(문항마다 따로 — G2-1 · G2b-1) 그 자리가 되는 짝 하나를 뽑는다.
 * 흔한 실수를 넣지 않는 문항에는 n을 넣지 않는다(정답이 가장 작은 보기일 수도 있게 — 15-29).
 */
function countChoices(rng, what, n, { must = false } = {}) {
  const answer = what === 'edges' ? 3 * n : 2 * n;
  const uniq = [];
  for (const c of countPool(what, n)) if (c.value !== answer && c.value > 0 && !uniq.some((u) => u.value === c.value)) uniq.push(c);
  // 모서리 문항의 2n(두 밑면의 모서리만 — R7)은 n을 넣지 않는 문항에만 꼭: n이 보이는 모서리 문항도 정답 자리가 셋(둘째~넷째)이 되게(G2b-1)
  const forced = uniq.filter((c) => (must && c.why === MUST[what]) || (what === 'edges' && !must && c.why === 'base2'));
  const free = uniq.filter((c) => !forced.includes(c) && c.why !== MUST[what]);
  const sets = [];
  const need = 3 - forced.length;
  const walk = (from, picked) => {
    if (picked.length === need) {
      sets.push([...forced, ...picked]);
      return;
    }
    for (let i = from; i < free.length; i += 1) walk(i + 1, [...picked, free[i]]);
  };
  walk(0, []);
  const rankOf = (set) => set.filter((c) => c.value < answer).length + 1;
  const ranks = [1, 2, 3, 4].filter((r) => sets.some((set) => rankOf(set) === r));
  const rank = rng.pick(ranks);
  const same = sets.filter((set) => rankOf(set) === rank);
  const picked = pickWeighted(rng, same, same.map((set) => setWeight(set, answer, n)));
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
