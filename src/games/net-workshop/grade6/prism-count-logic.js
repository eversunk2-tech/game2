/**
 * 도전 주문서 "모서리와 꼭짓점"(prism-count, 셈 주문)의 규칙 (순수 함수 — 단계에 들어갈 때 받는 묶음). 화면은 grade6/play-pcount.js.
 * 기획서: spec-grade6.md 1-1절("생각을 더하다" — 표 → 규칙 → 식) · 2-2절 · 8절(도전 주문서) · 15-25 · 15-26, common-rules 1 · 2절.
 *
 * 5문항: 셈 3(각기둥을 돌려 보며 모서리 또는 꼭짓점의 수 — 모서리 · 꼭짓점이 한 번 이상씩) → 규칙 2(모서리 · 꼭짓점의 수를 구하는 식을 보기에서).
 *   셈 문항의 각기둥은 서로 다른 밑면(삼각형 · 사각형 · 오각형 · 육각형 가운데 셋). 답한 뒤에는 그 각기둥의 모서리와 꼭짓점을 함께 세어 보이고
 *   "알아낸 것" 표에 한 줄(각기둥 · 한 밑면의 변 · 모서리 · 꼭짓점)이 더해진다 — 규칙 문항은 그 표를 보고 고른다.
 * 보기(셈): 정답 + 흔한 실수 셋. 모서리를 옆으로 선 모서리만 셈(n) · 꼭짓점을 한 밑면만 셈(n)은 판마다 늘 나온다(사용자 결정 15-25의 지침).
 *   정답의 자리(크기 차례)는 고르게 — 값만 보고 고르는 길(가장 큰 수 · 가장 작은 수 · n의 몇 배인 수 …)이 찍기(25%)보다 크게 높지 않게(검사).
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
 * twice: 면마다 세어 같은 것을 두 번 셈 · plus: 한 줄 더 셈
 */
export function countPool(what, n) {
  if (what === 'edges') {
    return [
      { value: n, why: 'side' }, { value: 2 * n, why: 'base2' }, { value: n + 2, why: 'faces' },
      { value: 4 * n, why: 'plus' }, { value: 6 * n, why: 'twice' }, { value: 3 * n + 2, why: 'plus' },
    ];
  }
  return [
    { value: n, why: 'one' }, { value: 3 * n, why: 'edges' }, { value: n + 2, why: 'faces' },
    { value: 4 * n, why: 'twice' }, { value: 2 * n + 2, why: 'plus' }, { value: 2 * n - 2, why: 'plus' }, { value: n + 1, why: 'plus' },
  ];
}
/** 판마다 늘 넣는 흔한 실수 (모서리 — 옆으로 선 모서리만, 꼭짓점 — 한 밑면만) */
const MUST = Object.freeze({ edges: 'side', vertices: 'one' });

/** 정답 · 실수 셋으로 보기 넷: 정답보다 작은 보기의 수(below)가 rank가 되게 — 흔한 실수(MUST)는 늘 넣는다 */
function countChoices(rng, what, n, rank) {
  const answer = what === 'edges' ? 3 * n : 2 * n;
  const pool = countPool(what, n).filter((c) => c.value !== answer && c.value > 0);
  const uniq = [];
  for (const c of pool) if (!uniq.some((u) => u.value === c.value)) uniq.push(c);
  const must = uniq.find((c) => c.why === MUST[what]);
  const below = uniq.filter((c) => c.value < answer && c !== must);
  const above = uniq.filter((c) => c.value > answer);
  // must(n)은 늘 정답보다 작다 → 정답 아래에 rank − 1개를 더, 위에 3 − rank개
  const needBelow = Math.max(0, rank - 1);
  const needAbove = 3 - 1 - needBelow;
  if (below.length < needBelow || above.length < needAbove) return null;
  const picked = [must, ...rng.shuffle(below).slice(0, needBelow), ...rng.shuffle(above).slice(0, needAbove)];
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
  const whats = rng.shuffle(['edges', 'vertices', rng.pick(['edges', 'vertices'])]);
  const ranks = rng.shuffle([1, 2, 3]); // 정답보다 작은 보기의 수(1~3) — 흔한 실수 n이 늘 정답보다 작아 0은 없다
  const out = ns.map((n, i) => {
    const what = whats[i];
    let choices = null;
    for (let r = 0; r < 4 && !choices; r += 1) choices = countChoices(rng, what, n, ((ranks[i] - 1 + r) % 3) + 1);
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
  twice: () => '같은 것을 두 번 센 것 같아요.',
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
