/**
 * 각기둥의 전개도 차시(prism)의 규칙 (순수 함수 — 단계에 들어갈 때 받는 묶음). 화면은 grade6/play-parts.js · play-pjudge.js · play-pedge.js.
 * 기획서: docs/games/net-workshop/spec-grade6.md 2-2절(단계) · 4절(오개념) · 5절(정답 노출) · 6-4절(문제 만들기) · 8절(까닭 고르기).
 * 문항은 rng(ctx.rng)로 만든다 — 같은 시드면 같은 문항(e2e도 같은 시드로 정답을 안다). 판정은 fold.js의 checkNet(접어서 판정)을 그대로 쓴다.
 * 검사: tests/unit/net-workshop-prism*.test.js
 *
 * 전개도는 입체를 펼쳐 만든다(solids.js): 띠 꼴(옆면이 한 줄) · 낯선 꼴(옆면 하나가 밑면에만 붙은 꼴). 안 되는 전개도는 띠 꼴의 끝 옆면이나
 * 밑면 하나를 고쳐 만들고(빼기 · 더하기 · 같은 쪽으로 옮기기 · 가로 바꾸기 · 기울이기), 만들 때마다 checkNet으로 의도한 까닭만 나오는지 확인한다.
 * 면의 차례 · id · 이름은 섞는다 — 화면(DOM 차례 · data-face · 면 이름 · 색)이 어느 면이 밑면인지, 어느 면을 고쳤는지 알려 주지 않게.
 */
import { hasFinalSound, josa } from '../../../shared/core/korean.js';
import { LABELS, checkNet, findHinges, foldNet, matchingEdge, outline } from '../fold.js';
import { bounds, centroid, cross, dot, normalize, sub } from '../geometry.js';
import { BASES, BASE_NAMES, REGULAR_KINDS, flatOk, loneTree, netBox, prismNet, prismSolid, stripOrientations, stripTree } from '../solids.js';
import { SPIN, TILT, viewDir } from '../orbit.js';
import { PRISM_TAGS as TAGS } from './prism-stages.js';

/**
 * 무대는 늘 이 크기(cm)에 맞춰 그린다 — 문항마다(되는 전개도든 아니든) 1 cm의 화면 크기가 같아 크기로 답을 짐작할 수 없다(common-rules 2절).
 * 직육면체 차시의 NET_FIT과 같다
 */
export const PRISM_FIT = Object.freeze([14, 10]);
/** 높이(cm) — 무대에 들어가는 것만 쓴다 */
export const PRISM_HEIGHTS = Object.freeze([3, 4]);
const fits = ([w, h], [fw, fh] = PRISM_FIT) => w <= fw + 1e-9 && h <= fh + 1e-9;
const cm = (v) => `${Math.round(v * 100) / 100} cm`;
const KIND_ORDER = ['tri-eq', 'tri-sc', 'trap', 'rect', 'pent', 'hex'];
/** 테두리 선분의 이름(차례): 각기둥 전개도의 테두리에는 선분이 22개까지 있다 */
const SEGMENT_NAMES = Array.from({ length: 40 }, (_, i) => String(i + 1));

const facesOf = (net, role) => net.faces.filter((f) => f.role === role);
const labelOf = (net, id) => net.faces.find((f) => f.id === id)?.label ?? '?';
const byLabel = (a, b) => LABELS.indexOf(a) - LABELS.indexOf(b);


// ── 전개도 손질 ───────────────────────────────
/** 이웃(경첩)이 가장 많은 면(같으면 가운데에 가까운 면)을 바닥 면으로 */
function pickRoot(net) {
  const hinges = findHinges(net);
  const { min, max } = bounds(net.faces.flatMap((f) => f.poly));
  const mid = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, 0];
  const score = (f) => hinges.filter((hg) => hg.a === f.id || hg.b === f.id).length * 1000 - Math.hypot(...sub(centroid(f.poly), mid));
  return net.faces.reduce((best, f) => (score(f) > score(best) + 1e-9 ? f : best), net.faces[0]).id;
}

/** 면의 차례 · id · 이름을 섞는다(바닥 면은 같은 면). 이름은 새 차례대로 가, 나, 다 … */
function relabel(net, rng) {
  const order = rng.shuffle(net.faces.map((_, i) => i));
  const idOf = new Map();
  const faces = order.map((from, k) => {
    const f = net.faces[from];
    idOf.set(f.id, `f${k}`);
    return { ...f, id: `f${k}`, label: LABELS[k] ?? String(k + 1) };
  });
  return { ...net, faces, root: idOf.get(net.root) ?? faces[0].id };
}

const along = (p, d, k) => [p[0] + d[0] * k, p[1] + d[1] * k];
const dir2 = (p, q) => {
  const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
  return [(q[0] - p[0]) / l, (q[1] - p[1]) / l];
};

/**
 * 고칠 수 있는 끝 옆면: 이웃(경첩)이 하나뿐이고 그 경첩이 세로 변(옆면의 변 1 · 3)인 옆면 — 띠 꼴의 두 끝, 낯선 꼴의 줄 끝(밑면이 붙은 옆면은 뺀다).
 * → [{ face, end: 'left' | 'right'(자유로운 세로 변이 어느 쪽), next: 그 너머에 올 입체의 옆면, nextIndex }]
 * 옆면 i의 꼭짓점은 [P_i 아래, P_i+1 아래, P_i+1 위, P_i 위] 차례라 변 1은 꼭짓점 i+1의 세로 변, 변 3은 꼭짓점 i의 세로 변이다
 */
function sideLeaves(net) {
  const n = net.sides;
  const hinges = findHinges(net);
  const out = [];
  for (const f of net.faces.filter((x) => x.role === 'side' && x.exact !== false)) {
    const mine = hinges.filter((hg) => hg.a === f.id || hg.b === f.id);
    if (mine.length !== 1) continue;
    const edge = mine[0].a === f.id ? mine[0].ea : mine[0].eb;
    const i = Number(f.solid.slice(1));
    if (edge === 3) out.push({ face: f, end: 'right', next: `s${(i + 1) % n}`, nextIndex: (i + 1) % n });
    else if (edge === 1) out.push({ face: f, end: 'left', next: `s${(i + n - 1) % n}`, nextIndex: (i + n - 1) % n });
  }
  return out;
}

const withFaces = (net, faces) => {
  const made = { ...net, faces };
  return { ...made, root: faces.some((f) => f.id === net.root) ? net.root : pickRoot(made) };
};

/** 고친 전개도 후보: 펼친 그림에서 면이 겹치지 않고, 이은 곳 말고는 맞닿지 않아야 한다(그린 대로 접힌다) */
const clean = (net) => (flatOk(net) ? { ...net, root: pickRoot(net) } : null);

/** 옆면 하나 빼기(띠의 끝 옆면) */
function dropSide(net, end) {
  return clean(withFaces(net, net.faces.filter((f) => f.id !== end.face.id)));
}

/** 옆면 하나 더하기: 띠의 끝 너머에 입체에서 그다음에 올 옆면(이미 반대쪽 끝에 있는 면)을 하나 더 붙인다 */
function addSide(net, end, base) {
  const f = end.face;
  const d = dir2(f.poly[0], f.poly[1]); // 밑변 방향(꼭짓점 i → i+1)
  const L = base.lengths[end.nextIndex];
  const poly = end.end === 'right'
    ? [f.poly[1], along(f.poly[1], d, L), along(f.poly[2], d, L), f.poly[2]] // 옆면 c: [P_c 아래, P_c+1 아래, P_c+1 위, P_c 위]
    : [along(f.poly[0], d, -L), f.poly[0], f.poly[3], along(f.poly[3], d, -L)]; // 옆면 c−1
  const extra = { id: `f${net.faces.length}`, role: 'side', label: LABELS[net.faces.length] ?? '?', solid: end.next, poly, exact: true };
  return clean(withFaces(net, [...net.faces, extra]));
}

/**
 * 두 밑면을 같은 쪽으로: 이웃이 하나뿐인 밑면 하나를 떼고, 남는 밑면(keep)과 같은 면을 옆면 m의 같은 쪽 변(keep이 위 밑면이면 위쪽 변, 아래 밑면이면 아래쪽 변)에 붙인다.
 * 위 밑면 b1의 꼭짓점 k는 P_k, 아래 밑면 b0의 꼭짓점 k는 P_(n−k)(바깥에서 보아 반시계라 거꾸로 돈다)
 */
function sameSideBases(net, keepId, m) {
  const n = net.sides;
  const keep = net.faces.find((f) => f.solid === keepId);
  const drop = net.faces.find((f) => f.role === 'base' && f.solid !== keepId);
  const side = net.faces.find((f) => f.solid === `s${m}`);
  if (!keep || !side || !drop) return null;
  if (findHinges(net).filter((hg) => hg.a === drop.id || hg.b === drop.id).length !== 1) return null; // 떼어도 다른 면이 떨어지지 않게
  const at = (k) => (keepId === 'b1' ? k % n : (((n - k) % n) + n) % n);
  const [a, b] = [keep.poly[at(m)], keep.poly[at(m + 1)]];
  const [a2, b2] = keepId === 'b1' ? [side.poly[3], side.poly[2]] : [side.poly[0], side.poly[1]];
  const turn = Math.atan2(b2[1] - a2[1], b2[0] - a2[0]) - Math.atan2(b[1] - a[1], b[0] - a[0]);
  const [c, s] = [Math.cos(turn), Math.sin(turn)];
  const poly = keep.poly.map(([x, y]) => [a2[0] + (x - a[0]) * c - (y - a[1]) * s, a2[1] + (x - a[0]) * s + (y - a[1]) * c]);
  const moved = { ...drop, solid: keepId, poly, exact: true };
  return clean(withFaces(net, net.faces.map((f) => (f.id === drop.id ? moved : f))));
}

/** 끝 옆면의 가로를 delta(cm)만큼 바꾼다(직사각형 그대로, 이웃과 이은 변은 그대로) */
function resizeSide(net, end, delta) {
  const f = end.face;
  const d = dir2(f.poly[0], f.poly[1]);
  const width = Math.hypot(f.poly[1][0] - f.poly[0][0], f.poly[1][1] - f.poly[0][1]) + delta;
  if (width < 1 - 1e-9) return null;
  const poly = end.end === 'right'
    ? [f.poly[0], along(f.poly[0], d, width), along(f.poly[3], d, width), f.poly[3]]
    : [along(f.poly[1], d, -width), f.poly[1], f.poly[2], along(f.poly[2], d, -width)];
  return clean(withFaces(net, net.faces.map((x) => (x.id === f.id ? { ...f, poly, exact: false } : x))));
}

/** 기울인 옆면: 끝 옆면을 세로 변은 그대로 두고 위·아래 변을 각도 tilt만큼 기울인 평행사변형으로(변의 길이는 모두 그대로) */
function leanSide(net, end, sign, tilt = Math.PI / 6) {
  const f = end.face;
  const d = dir2(f.poly[0], f.poly[1]);
  const up = dir2(f.poly[0], f.poly[3]);
  const L = Math.hypot(f.poly[1][0] - f.poly[0][0], f.poly[1][1] - f.poly[0][1]);
  const step = [d[0] * Math.cos(tilt) * L + up[0] * Math.sin(tilt) * L * sign, d[1] * Math.cos(tilt) * L + up[1] * Math.sin(tilt) * L * sign];
  const plus = (p, k) => [p[0] + step[0] * k, p[1] + step[1] * k];
  const poly = end.end === 'right'
    ? [f.poly[0], plus(f.poly[0], 1), plus(f.poly[3], 1), f.poly[3]]
    : [plus(f.poly[1], -1), f.poly[1], f.poly[2], plus(f.poly[2], -1)];
  return clean(withFaces(net, net.faces.map((x) => (x.id === f.id ? { ...f, poly, exact: false } : x))));
}

// ── 판정 ─────────────────────────────────
const typesOf = (problems) => new Set(problems.map((p) => p.type));
/** 까닭을 하나만 말할 때 먼저 고르는 순서 */
const PROBLEM_ORDER = ['face-count', 'side-shape', 'base-mismatch', 'wrong-hinge', 'vertex-full', 'overlap', 'edge-length', 'gap', 'disconnected'];
export function primaryPrismProblem(problems) {
  for (const type of PROBLEM_ORDER) {
    const found = (type === 'edge-length' ? problems.find((p) => p.type === type && p.hinge) : null) ?? problems.find((p) => p.type === type);
    if (found) return found;
  }
  return problems[0] ?? null;
}

/**
 * 고친 전개도가 의도한 까닭만 내나 (만들 때 스스로 검사 — spec-grade6 6-4절).
 * count: 옆면의 수(빼면 비어요, 더하면 겹쳐요) · same: 두 밑면이 같은 쪽(겹쳐요 + 비어요) · length: 맞닿는 선분의 길이 · shape: 직사각형이 아닌 옆면
 */
export function matchesIntent(problems, intended) {
  const t = typesOf(problems);
  const none = (...types) => types.every((x) => !t.has(x));
  if (intended === 'count') return t.has('face-count') && none('side-shape', 'base-mismatch', 'wrong-hinge', 'vertex-full', 'disconnected', 'edge-length');
  if (intended === 'same') return t.has('overlap') && none('face-count', 'side-shape', 'base-mismatch', 'wrong-hinge', 'vertex-full', 'disconnected', 'edge-length');
  if (intended === 'length') return t.has('edge-length') && none('face-count', 'side-shape', 'base-mismatch', 'wrong-hinge', 'vertex-full', 'disconnected', 'overlap');
  if (intended === 'shape') return t.has('side-shape') && none('face-count', 'base-mismatch', 'wrong-hinge', 'vertex-full', 'disconnected', 'overlap', 'edge-length');
  return problems.length === 0;
}

/** problem → 오개념 tag (spec-grade6 4절) */
export const PRISM_TAG_OF_PROBLEM = Object.freeze({
  'face-count': TAGS.sideCount,
  'side-shape': TAGS.sideRect,
  'base-mismatch': TAGS.baseCongruent,
  'wrong-hinge': TAGS.basePosition,
  overlap: TAGS.basePosition,
  'edge-length': TAGS.edgeLength,
  gap: TAGS.edgeLength,
});
/** 의도한 까닭 → tag (안 되는 전개도를 "돼요"로 고른 학생의 생각) */
const TAG_OF_INTENT = { count: TAGS.sideCount, same: TAGS.basePosition, length: TAGS.edgeLength, shape: TAGS.sideRect };

/** "왜 안 될까요?" 칩 (교과서 정리 ①~④의 말 — spec-grade6 8절). 고르기 전에는 무대에 까닭 글자·표시가 없다 */
export const PRISM_JUDGE_REASONS = Object.freeze([
  { id: 'count', text: '면의 수가 달라요' },
  { id: 'shape', text: '옆면이 직사각형이 아니에요' },
  { id: 'overlap', text: '면이 겹쳐요' },
  { id: 'length', text: '맞닿는 선분의 길이가 달라요' },
]);

/** 그 전개도에서 참인 까닭 칩 id 모두. 옆면을 더한 것은 면의 수도 다르고 면도 겹친다(어느 쪽을 골라도 맞다) */
export function prismReasons(problems) {
  const t = typesOf(problems);
  const out = [];
  if (t.has('face-count')) out.push('count');
  if (t.has('side-shape')) out.push('shape');
  if (t.has('overlap') && !t.has('side-shape')) out.push('overlap');
  if (t.has('edge-length') && !t.has('face-count') && !t.has('side-shape')) out.push('length');
  return out;
}

/** 까닭을 하나만 말할 때의 칩 (primaryPrismProblem과 같은 까닭) */
export function prismReasonOf(problems) {
  const p = primaryPrismProblem(problems);
  if (!p) return null;
  if (p.type === 'face-count') return 'count';
  if (p.type === 'side-shape') return 'shape';
  if (p.type === 'overlap' || p.type === 'wrong-hinge') return 'overlap';
  return 'length';
}

/** 고른 까닭 채점 → { correct, answer(쪽지에 말할 칩 id), answerText } */
export function judgePrismReason(problems, choice) {
  const truths = prismReasons(problems);
  const correct = truths.includes(choice);
  const answer = correct ? choice : (prismReasonOf(problems) ?? truths[0] ?? null);
  return { correct, answer, answerText: PRISM_JUDGE_REASONS.find((r) => r.id === answer)?.text ?? '' };
}

/** 까닭 문장 (판별 단계) */
export function explainPrismProblem(question) {
  const { net, problems } = question;
  const p = primaryPrismProblem(problems);
  if (!p) return '';
  const base = BASE_NAMES[net.sides];
  if (p.type === 'face-count') {
    const sides = facesOf(net, 'side').length;
    return `밑면이 ${base}${hasFinalSound(base) ? '이면' : '면'} 변이 ${net.sides}개라서 옆면도 ${net.sides}개여야 해요. 이 전개도는 옆면이 ${sides}개예요.`;
  }
  if (p.type === 'side-shape') return '옆면 하나가 직사각형이 아니에요. 각기둥의 옆면은 모두 직사각형이에요.';
  if (p.type === 'overlap') {
    const bases = facesOf(net, 'base').map((f) => f.label).sort(byLabel);
    if (problems.some((x) => x.type === 'overlap' && x.faces.every((id) => net.faces.find((f) => f.id === id)?.role === 'base'))) {
      return `두 밑면(${bases[0]} 면과 ${bases[1]} 면)이 옆면의 같은 쪽에 붙어 있어요. 접으면 같은 자리에 겹치고, 반대쪽은 비어요.`;
    }
    const [a, b] = p.faces.map((id) => labelOf(net, id)).sort(byLabel);
    return `${a} 면과 ${b} 면이 같은 자리에 겹쳐요.`;
  }
  if (p.type === 'edge-length') {
    const [x, y] = p.lengths.map(cm);
    const [a, b] = p.faces.map((id) => labelOf(net, id));
    return `접으면 ${a} 면과 ${b} 면이 맞닿는 두 선분의 길이가 ${josa(x, '과/와')} ${y}로 달라요. 맞닿는 선분은 길이가 같아야 해요.`;
  }
  return '접으면 맞닿지 않는 선분이 있어요. 각기둥이 되려면 맞닿는 선분끼리 길이가 같아야 해요.';
}

/** 판별: answer는 'yes'(돼요) | 'no'(안 돼요) */
export function judgePrismAnswer(question, answer) {
  const { expected, net } = question;
  const correct = answer === expected;
  if (question.valid) {
    const lone = question.form === 'lone' ? ' 옆면이 한 줄로 이어지지 않아도 각기둥의 전개도가 될 수 있어요.' : '';
    if (correct) return { correct, expected, tag: null, message: `맞아요! 접으면 ${josa(net.name, '이/가')} 돼요.${lone}` };
    return {
      correct, expected, tag: TAGS.variety,
      message: `이 전개도도 접으면 ${josa(net.name, '이/가')} 돼요. 두 밑면이 옆면의 위와 아래에 하나씩 있고, 맞닿는 선분의 길이가 모두 같아요.`,
    };
  }
  const why = explainPrismProblem(question);
  if (correct) return { correct, expected, tag: null, message: `맞아요! ${why}` };
  return { correct, expected, tag: TAG_OF_INTENT[question.intended] ?? PRISM_TAG_OF_PROBLEM[primaryPrismProblem(question.problems)?.type] ?? TAGS.variety, message: why };
}

/** 살펴볼 거리(틀렸을 때 쪽지 아래 한 줄) */
export function prismJudgeTip(question) {
  if (question.valid) return '';
  if (question.intended === 'count') return '밑면의 변의 수와 옆면의 수를 세어 견줘 봐요.';
  if (question.intended === 'same') return '빗금 친 두 밑면과 점선(비어요)을 찾아보고, 돌려 보기로 빈 자리를 확인해요.';
  if (question.intended === 'length') return '같은 무늬로 표시한 두 선분의 길이를 견줘 봐요.';
  return '직사각형이 아닌 옆면을 찾아봐요.';
}

/** 맞닿는 두 선분의 길이가 다른 곳(길이형 · 접었을 때) — 같은 무늬 띠와 길이 이름표로 짚는다 */
export function prismMismatch(question) {
  if (question.valid || question.intended !== 'length') return null;
  return question.problems.find((p) => p.type === 'edge-length') ?? null;
}

// ── 문항 만들기 ─────────────────────────────
/** kind에서 밑면 하나 (그 kind의 크기 가운데 하나) */
const pickBase = (rng, kind) => rng.pick(BASES.filter((b) => b.kind === kind));

/** 무대에 들어가는 놓기 하나(가로로 눕힌 두 놓기 가운데) → 면을 섞은 전개도 */
function settle(net, rng) {
  const options = stripOrientations(net).filter((o) => fits(netBox(o)));
  if (options.length === 0) return null;
  return relabel(rng.pick(options), rng);
}

/** 띠 꼴 트리의 아무 갈래 */
const stripParams = (rng, n) => ({ cut: rng.int(0, n - 1), top: rng.int(0, n - 1), bottom: rng.int(0, n - 1) });

/**
 * 판별 문항 하나: intended — null(되는 전개도) · 'count' · 'same' · 'length' · 'shape'. form — 바탕 꼴 'strip'(띠 꼴) · 'lone'(낯선 꼴).
 * 안 되는 전개도도 낯선 꼴에서 만들 수 있다(사용자 결정 15-20 G1-4 — 꼴만 보고 답하지 못하게)
 */
function makeJudgeNet(rng, intended, kind, form = 'strip') {
  for (let guard = 0; guard < 400; guard += 1) {
    const base = pickBase(rng, kind);
    const height = rng.pick(PRISM_HEIGHTS);
    const solid = prismSolid({ base: base.poly, height });
    const n = solid.sides;
    let net = null;
    if (form === 'lone') {
      const tree = loneTree(solid, { lone: rng.int(0, n - 1), via: rng.pick(['b0', 'b1']), link: rng.int(0, n - 1), other: rng.int(0, n - 1) });
      if (tree) net = prismNet(solid, tree);
    } else net = prismNet(solid, stripTree(solid, stripParams(rng, n)));
    if (!net || !flatOk(net)) continue;
    const ends = sideLeaves(net);
    const end = ends.length > 0 ? rng.pick(ends) : null;
    let made = null;
    if (!intended) made = net;
    else if (intended === 'count') {
      // 옆면은 늘 4개라는 생각을 만나게: 삼각기둥은 하나 더(4개), 오각기둥·육각기둥은 하나 빼기, 사각기둥은 둘 중 하나
      const add = n === 3 || (n === 4 && rng.int(0, 1) === 0);
      if (end) made = add ? addSide(net, end, base) : dropSide(net, end);
    } else if (intended === 'same') made = sameSideBases(net, rng.pick(['b0', 'b1']), rng.int(0, n - 1));
    else if (intended === 'length') made = end ? resizeSide(net, end, rng.pick([-1, 1])) : null;
    else if (intended === 'shape') made = end ? leanSide(net, end, rng.pick([-1, 1])) : null;
    if (!made) continue;
    const settled = settle(made, rng);
    if (!settled) continue;
    const { problems } = checkNet(settled);
    if (!matchesIntent(problems, intended)) continue;
    return { base, height, net: settled, problems };
  }
  throw new Error(`각기둥 판별 문항(${intended ?? 'valid'} · ${form})을 만들지 못했어요.`);
}

/** 판에서 안 되는 전개도 하나를 낯선 꼴에서 만들 확률(사용자 결정 15-20 G1-4 "가끔" — 검토가 권한 "판의 절반쯤") */
export const LONE_INVALID_SHARE = 0.5;

/**
 * 판별(prism-judge) 5문항: 되는 것 2(띠 꼴 1 + 낯선 꼴 1) · 안 되는 것 3(옆면의 수 · 두 밑면이 같은 쪽 · 길이가 다른 선분 또는 직사각형이 아닌 옆면).
 * 밑면 종류는 문항마다 되도록 다르게. 길이형은 모든 변이 같은 밑면(정삼각형 · 정오각형 · 정육각형)에서만 — 다른 옆면과 견줘 보이게
 */
function makeJudgeQuestions(stage, rng) {
  const plan = rng.shuffle(['strip', 'lone', 'count', 'same', rng.pick(['length', 'shape'])]);
  // 판의 절반쯤은 안 되는 셋 가운데 하나를 낯선 꼴에서 만든다(G1-4)
  const loneBad = rng.next() < LONE_INVALID_SHARE ? rng.pick(plan.filter((t) => t !== 'strip' && t !== 'lone')) : null;
  const used = new Set();
  return plan.map((type, i) => {
    const valid = type === 'strip' || type === 'lone';
    const form = type === 'lone' || type === loneBad ? 'lone' : 'strip';
    const pool = type === 'length' ? [...REGULAR_KINDS] : KIND_ORDER.filter((k) => k !== 'rect' || form !== 'lone');
    const fresh = pool.filter((k) => !used.has(k));
    const kind = rng.pick(fresh.length > 0 ? fresh : pool);
    used.add(kind);
    const made = makeJudgeNet(rng, valid ? null : type, kind, form);
    return {
      kind: 'pjudge',
      number: i + 1,
      itemId: `${stage.id}:${i + 1}:${made.base.id}-h${made.height}-${type}${!valid && form === 'lone' ? '-lone' : ''}`,
      base: made.base.id,
      height: made.height,
      net: made.net,
      form,
      valid,
      intended: valid ? null : type,
      problems: made.problems,
      expected: valid ? 'yes' : 'no',
    };
  });
}

// ── 밑면과 옆면 (prism-parts) ───────────────────────
/**
 * 입체를 놓는 자세: 바닥에 닿을 면(ground)의 바깥 법선이 아래(−z)를 향하게 눕히는 돌림 + 세로축 둘레로 spin(도).
 * 접은 전개도(바닥 면 root가 위, 입체는 그 아래)에서 잰다. → [{ axis, angle(라디안) }, …] 차례로 적용 (무대가 접는 정도에 맞춰 줄인다)
 */
export function groundPose(net, groundId, spinDeg = 0) {
  const folded = foldNet(net, 1);
  const g = folded.faces.find((f) => f.id === groundId).normal;
  const down = [0, 0, -1];
  const c = Math.max(-1, Math.min(1, dot(g, down)));
  const turns = [];
  if (c < 1 - 1e-9) {
    let axis = cross(g, down);
    if (Math.hypot(...axis) < 1e-9) axis = [1, 0, 0]; // 위를 향한 면: 가로축 둘레로 뒤집는다
    turns.push({ axis: normalize(axis), angle: Math.acos(c) });
  }
  if (Math.abs(spinDeg) > 1e-9) turns.push({ axis: [0, 0, 1], angle: (spinDeg * Math.PI) / 180 });
  return turns;
}

/** 벡터 v를 원점을 지나는 단위 축 둘레로 angle(라디안)만큼 (로드리게스) */
function rotateVector(v, axis, angle) {
  const [c, s] = [Math.cos(angle), Math.sin(angle)];
  const k = normalize(axis);
  const kv = cross(k, v);
  const kd = dot(k, v) * (1 - c);
  return [0, 1, 2].map((i) => v[i] * c + kv[i] * s + k[i] * kd);
}

/** 놓인 자세에서 면이 바라보는 쪽(바깥 법선) — 판정 문장(평행한가)에 쓴다 */
function foldedNormals(net) {
  return new Map(foldNet(net, 1).faces.map((f) => [f.id, f.normal]));
}

/**
 * 밑면과 옆면 3문항: 밑면 종류가 서로 다르고(사각기둥은 사다리꼴만 — 직육면체는 마주 보는 어느 두 면도 밑면이 될 수 있어 답이 여럿), 눕힌 각기둥이 늘 1개.
 * 펼쳐 보일 전개도는 띠 꼴(옆면 한 줄 + 위아래 밑면). 바닥 면은 선 것이 아래 밑면, 눕힌 것은 옆면 하나
 */
function makePartsQuestions(stage, rng) {
  const kinds = rng.shuffle(['tri-eq', 'tri-sc', 'trap', 'pent', 'hex']).slice(0, stage.count);
  const lyingAt = rng.int(0, stage.count - 1);
  return kinds.map((kind, i) => {
    for (let guard = 0; guard < 200; guard += 1) {
      const base = pickBase(rng, kind);
      const height = rng.pick(PRISM_HEIGHTS);
      const solid = prismSolid({ base: base.poly, height });
      const n = solid.sides;
      const j = rng.int(0, n - 1);
      const net0 = prismNet(solid, stripTree(solid, { cut: rng.int(0, n - 1), top: j, bottom: j }));
      if (!flatOk(net0)) continue;
      const net = settle(net0, rng);
      if (!net) continue;
      const lying = i === lyingAt;
      const groundSolid = lying ? `s${rng.int(0, n - 1)}` : 'b0';
      const ground = net.faces.find((f) => f.solid === groundSolid).id;
      const bases = facesOf(net, 'base').map((f) => f.id).sort();
      // 처음 보기에서 밑면 하나는 보이게(선 각기둥은 늘 위 밑면이 보인다): 눕힌 각기둥은 세로축 둘레로 돌려 한쪽 끝의 밑면이 비스듬히 보이는 자세만
      const spins = [-20, -10, 0, 10, 20].concat(lying ? [-60, -50, -40, -30, 30, 40, 50, 60] : []);
      const fine = spins.filter((spin) => {
        const pose = groundPose(net, ground, spin);
        const facing = foldNet(net, 1).faces.filter((f) => bases.includes(f.id))
          .map((f) => viewDir(pose.reduce((v, r) => rotateVector(v, r.axis, r.angle), f.normal), TILT, SPIN)[2]);
        return Math.max(...facing) >= 0.3;
      });
      const spin = rng.pick(fine.length > 0 ? fine : spins);
      return {
        kind: 'parts',
        number: i + 1,
        itemId: `${stage.id}:${i + 1}:${base.id}-h${height}${lying ? '-lie' : ''}`,
        base: base.id,
        height,
        net,
        name: net.name,
        sides: n,
        baseName: BASE_NAMES[n],
        bases,
        lying,
        ground,
        pose: groundPose(net, ground, spin),
      };
    }
    throw new Error('밑면과 옆면 문항을 만들지 못했어요.');
  });
}

/** 고른 두 면이 밑면인가: picked = [면 id, 면 id] */
export function judgeParts(question, picked) {
  const { net, bases, name, sides, baseName } = question;
  const set = [...new Set(picked)].sort();
  const expected = bases.map((id) => labelOf(net, id)).join(', ');
  if (set.length === 2 && set[0] === bases[0] && set[1] === bases[1]) {
    return {
      correct: true, expected, tag: null,
      message: `맞아요! 두 밑면은 서로 평행하고 모양과 크기가 같아요. 밑면이 ${josa(baseName, '이라/라')}서 ${josa(name, '이에요/예요')}. 옆면은 ${sides}개예요.`,
    };
  }
  const normals = foldedNormals(net);
  const [a, b] = set.map((id) => net.faces.find((f) => f.id === id));
  const parallel = a && b && Math.abs(Math.abs(dot(normals.get(a.id), normals.get(b.id))) - 1) < 1e-6;
  const lyingGround = question.lying && set.includes(question.ground);
  const head = lyingGround ? '바닥에 닿은 면이라고 밑면인 것은 아니에요. ' : '';
  let body;
  if (parallel && a.role === 'side' && b.role === 'side') {
    body = '고른 두 면은 서로 평행하지만, 이 두 면을 밑면으로 하면 나머지 면 가운데 직사각형이 아닌 면이 있어요. 각기둥의 옆면은 모두 직사각형이에요.';
  } else body = '고른 두 면은 서로 평행하지 않아요. 밑면은 서로 평행하고 모양과 크기가 같은 두 면이에요. 놓인 방향과는 상관없어요.';
  return { correct: false, expected, tag: TAGS.baseIsBottom, message: `${head}${body}` };
}

// ── 맞닿는 선분 (prism-edge) ─────────────────────────
/** 테두리 선분마다 접었을 때 맞닿는 선분의 번호 (짝이 없으면 −1) */
export function prismMeetingPairs(net, segments) {
  return segments.map((s) => {
    if (s.edge == null) return -1;
    const m = matchingEdge(net, s.face, s.edge);
    return m ? segments.findIndex((t) => t.face === m.face && t.edge === m.edge) : -1;
  });
}
const cyclicNear = (i, j, n) => (i - j + n) % n === 1 || (j - i + n) % n === 1;

/**
 * 맞닿는 선분 3문항: 되는 전개도(띠 꼴 · 낯선 꼴)에서 경첩이 아닌 선분 하나를 물음으로, 보기 4개(정답 · 바로 옆 선분 · 길이가 같은 다른 선분 · 아무 선분).
 * 판마다 한 문항만 바로 옆 선분이 정답이고(그때도 다른 바로 옆 선분은 오답 보기), 나머지는 정답이 바로 옆이 아니다 — 가까이 있다는 것만으로는
 * 맞히지도 지우지도 못하게(사용자 결정 15-20 G1-5). 보기 번호는 테두리를 도는 차례이고,
 * 정답이 놓일 번호는 먼저 고르게 뽑는다(번호로 찍어 맞힐 수 없게)
 */
function makeEdgeQuestions(stage, rng) {
  const kinds = rng.shuffle(KIND_ORDER).slice(0, stage.count);
  // 판마다 한 문항(자리는 무작위)은 바로 옆 선분이 정답(사용자 결정 15-20 G1-5 — 바로 옆 선분도 맞닿을 수 있다. 접어 봐야 안다).
  // 그 문항에도 바로 옆의 다른 선분(맞닿지 않는 쪽)은 보기에 남아 4절 "만나는 선분" 오개념을 만난다
  const nearAt = rng.int(0, stage.count - 1);
  return kinds.map((kind, i) => {
    const nearAnswer = i === nearAt;
    for (let guard = 0; guard < 200; guard += 1) {
      const form = rng.pick(['strip', 'strip', 'lone']);
      const made = makeJudgeNet(rng, null, kind, form);
      const { net } = made;
      const ring = outline(net, SEGMENT_NAMES);
      if (!ring) continue;
      const { segments } = ring;
      const pairs = prismMeetingPairs(net, segments);
      const n = segments.length;
      const othersOf = (t) => segments.map((_, k) => k).filter((k) => k !== t && k !== pairs[t]);
      const nearOf = (t) => othersOf(t).filter((k) => cyclicNear(k, t, n));
      // 물음이 될 선분: 보통은 맞닿는 선분이 바로 옆이 아닌 것, 바로 옆 문항은 맞닿는 선분이 바로 옆이고 다른 바로 옆 선분(오답 보기)이 있는 것
      const far = segments.map((_, t) => t).filter((t) => pairs[t] >= 0 && cyclicNear(t, pairs[t], n) === nearAnswer && nearOf(t).length > 0);
      if (far.length === 0) continue;
      const sameOf = (t) => othersOf(t).filter((k) => !cyclicNear(k, t, n) && Math.abs(segments[k].length - segments[t].length) < 1e-6);
      const want = rng.int(0, 3);
      let chosen = null;
      for (const t of rng.shuffle(far)) {
        const sets = [];
        for (const a of nearOf(t)) {
          for (const b of (sameOf(t).length > 0 ? sameOf(t) : [null])) {
            const base = [a, b].filter((v) => v != null);
            const free = othersOf(t).filter((k) => !base.includes(k));
            if (base.length === 2) for (const c of free) sets.push([...base, c]);
            else for (let x = 0; x < free.length; x += 1) for (let y = x + 1; y < free.length; y += 1) sets.push([...base, free[x], free[y]]);
          }
        }
        const fit = sets.filter((set) => set.filter((k) => k < pairs[t]).length === want);
        if (fit.length === 0) continue;
        chosen = { target: t, picked: rng.pick(fit) };
        break;
      }
      if (!chosen) continue;
      const { target, picked } = chosen;
      const answer = pairs[target];
      const near = nearOf(target);
      const same = sameOf(target);
      const kindOf = (k) => (k === answer ? 'answer' : near.includes(k) ? 'near' : same.includes(k) ? 'same' : 'other');
      const options = [answer, ...picked].sort((x, y) => x - y).map((index, k) => ({ index, number: k + 1, kind: kindOf(index) }));
      return {
        kind: 'pedge',
        number: i + 1,
        itemId: `${stage.id}:${i + 1}:${made.base.id}-h${made.height}-${form}`,
        base: made.base.id,
        height: made.height,
        net,
        form,
        segments,
        pairs,
        target,
        answer,
        nearAnswer,
        options,
      };
    }
    throw new Error('맞닿는 선분 문항을 만들지 못했어요.');
  });
}

/** 맞닿는 선분: index는 고른 선분(테두리 선분 번호) */
export function judgePrismEdge(question, index) {
  const option = question.options.find((o) => o.index === index);
  if (!option) throw new Error(`없는 보기: ${index}`);
  const answer = question.options.find((o) => o.index === question.answer);
  const expected = `${answer.number}번`;
  if (index === question.answer) {
    const close = question.nearAnswer ? ' 바로 옆에 있는 선분도 접으면 맞닿을 수 있어요.' : '';
    return { correct: true, expected, tag: null, message: `맞아요! 접으면 표시한 선분과 ${answer.number}번 선분이 맞닿아 한 모서리가 돼요. 맞닿는 두 선분은 길이가 같아요.${close}` };
  }
  let message;
  if (option.kind === 'near') message = `${option.number}번 선분은 표시한 선분 바로 옆에 있지만, 접으면 맞닿지 않아요. 가까이 있다고 맞닿는 것은 아니에요.`;
  else if (option.kind === 'same') message = `${option.number}번 선분은 길이가 같지만, 접으면 표시한 선분과 맞닿지 않아요.`;
  else message = `접으면 ${option.number}번 선분은 표시한 선분과 맞닿지 않아요. 어느 면이 어디로 접히는지 따라가 봐요.`;
  return { correct: false, expected, tag: TAGS.meetingEdge, message };
}

/**
 * 알림(토스트)에 쓰는 짧은 글: 까닭 문장의 첫 마디. 까닭 전체는 작업 지시서의 쪽지에 있다 —
 * 휴대폰은 알림이 매트 바로 밑에 뜨므로 길면 판의 답 버튼·조작 띠를 가린다(글자가 넓은 기기에서 세 줄)
 */
export function toastText(message) {
  const at = message.indexOf('. ');
  return at < 0 ? message : message.slice(0, at + 1);
}

/** 단계의 문항 목록. playStage에서 ctx.rng로 가장 먼저 부른다(같은 시드 = 같은 문항) */
export const PRISM_MAKERS = Object.freeze({ parts: makePartsQuestions, pjudge: makeJudgeQuestions, pedge: makeEdgeQuestions });
export function makePrismQuestions(stage, rng) {
  const make = PRISM_MAKERS[stage.kind];
  if (!make) throw new Error(`알 수 없는 각기둥 단계 종류: ${stage.kind}`);
  return make(stage, rng);
}

/** 펼친 전개도의 1 cm 화면 크기를 정하는 크기 (모든 문항이 같다) */
export const prismFitBox = () => [...PRISM_FIT];

