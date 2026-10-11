/**
 * 직육면체의 전개도 차시의 규칙 (순수 함수). 화면은 cuboid-play.js · cuboid-free.js.
 * 문항은 rng(ctx.rng)로 만든다 — 같은 시드면 같은 문항. 판정은 fold.js의 checkNet(접어서 판정)을 그대로 쓴다.
 * 검사: tests/unit/net-workshop-cuboid*.test.js
 *
 * 전개도는 입체를 펼쳐 만든다: unfold(cuboid(a, b, c), 신장 트리). 세 모서리가 서로 다르면 서로 다른 전개도는 54가지다.
 * 틀린 전개도는 되는 전개도의 끝 면 하나를 고쳐 만들고(옮기기 · 돌려 붙이기 · 크기 바꾸기), 만들 때마다 checkNet으로 의도한 까닭이 나오는지 확인한다.
 */
import { josa } from '../../shared/core/korean.js';
import { CUBOID_TAGS as TAGS } from './cuboid-stages.js';
import {
  LABELS,
  SYMMETRY_COUNT,
  checkNet,
  cuboid,
  faceRect,
  findHinges,
  fromRects,
  isConnected,
  matchingEdge,
  netKey,
  netSize,
  oppositeFace,
  outline,
  spanningTrees,
  transformNet,
  unfold,
} from './fold.js';

// ── 전개도 54가지 ─────────────────────────────
const catalogs = new Map();

/**
 * 그 직육면체의 서로 다른 전개도 모두(돌리거나 뒤집어 겹치면 같은 것). 세 모서리가 서로 다르면 54가지.
 * → [{ id('234-07'), key(netKey), net(펼친 전개도), size: [긴 쪽, 짧은 쪽] }] 열쇠 순서 — id는 저장되는 값이라 순서를 바꾸지 않는다
 */
export function cuboidNets(dims) {
  const name = dims.join('');
  if (!catalogs.has(name)) {
    const solid = cuboid(...dims);
    const byKey = new Map();
    for (const tree of spanningTrees(solid)) {
      const net = unfold(solid, tree);
      const key = netKey(net);
      if (!byKey.has(key)) byKey.set(key, net);
    }
    catalogs.set(name, [...byKey.keys()].sort().map((key, i) => {
      const [w, h] = netSize(byKey.get(key));
      return { id: `${name}-${String(i + 1).padStart(2, '0')}`, key, net: byKey.get(key), size: [Math.max(w, h), Math.min(w, h)] };
    }));
  }
  return catalogs.get(name);
}

/** 문항에 쓰는 직육면체(cm). 무대에 넉넉히 들어가는 것만 고른다 */
export const QUESTION_BOXES = Object.freeze([[2, 3, 4], [2, 3, 5], [2, 4, 5]]);
/**
 * 문항의 전개도가 들어가는 가장 큰 가로·세로(cm). 무대는 늘 이 크기에 맞춰 그린다 —
 * 문항마다(되는 전개도든 아니든) 1 cm의 화면 크기가 같아, 크기로 답을 짐작할 수 없다(common-rules 2절)
 */
export const NET_FIT = Object.freeze([14, 10]);
/** 빈 자리 표시의 깊이(cm): 빠진 면의 크기와 무관하게 늘 같다 (자리의 크기로 답이 드러나지 않게) */
export const SLOT_DEPTH = 2;

const fits = ([w, h], [fw, fh] = NET_FIT) => w <= fw + 1e-9 && h <= fh + 1e-9;
const withLabels = (net, labels) => ({ ...net, faces: net.faces.map((f, i) => ({ ...f, label: labels[i] })) });
const labelOf = (net, id) => net.faces.find((f) => f.id === id)?.label ?? '?';
const byLabelOrder = (a, b) => LABELS.indexOf(a) - LABELS.indexOf(b);
const cm = (value) => `${Math.round(value * 100) / 100} cm`;
const sizeText = (w, h) => `${Math.min(w, h)}×${Math.max(w, h)} cm`;

/** 가로가 세로보다 길거나 같고 무대에 들어가는 돌리기·뒤집기 가운데 하나 */
function orientNet(net, rng, fit = NET_FIT) {
  const wide = [];
  for (let k = 0; k < SYMMETRY_COUNT; k += 1) {
    const moved = transformNet(net, k);
    const [w, h] = netSize(moved);
    if (w >= h && fits([w, h], fit)) wide.push(moved);
  }
  return wide.length > 0 ? rng.pick(wide) : null;
}

/** 무대에 들어가는 전개도 하나: 직육면체 고르기 → 54가지 가운데 하나 → 돌리기·뒤집기 → 면 이름 섞기. used에 있는 것은 다시 고르지 않는다 */
function pickNet(rng, used = new Set()) {
  for (let guard = 0; guard < 200; guard += 1) {
    const dims = rng.pick(QUESTION_BOXES);
    const pool = cuboidNets(dims).filter((n) => fits(n.size) && !used.has(n.id));
    if (pool.length === 0) continue;
    const item = rng.pick(pool);
    const net = orientNet(item.net, rng);
    if (!net) continue;
    used.add(item.id);
    return { id: item.id, dims, net: withLabels(net, rng.shuffle(LABELS.slice(0, 6))) };
  }
  throw new Error('무대에 들어가는 직육면체 전개도를 찾지 못했어요.');
}

// ── 직사각형 계산 (고친 전개도를 만들 때) ───────────────
const overlapsFlat = (p, q) =>
  Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x) > 1e-9 && Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y) > 1e-9;

/** 두 직사각형이 변으로 맞닿은 길이 (0이면 떨어졌거나 꼭짓점만 닿음) */
function contactLength(p, q) {
  const ox = Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x);
  const oy = Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y);
  if (Math.abs(ox) < 1e-9 && oy > 1e-9) return oy;
  if (Math.abs(oy) < 1e-9 && ox > 1e-9) return ox;
  return 0;
}

/** 직사각형 g의 네 변: 바깥쪽으로 면을 붙일 때 쓰는 값 { side, length } */
const SIDES = ['top', 'right', 'bottom', 'left'];
const sideLength = (g, side) => (side === 'top' || side === 'bottom' ? g.w : g.h);

/**
 * g의 side 변 바깥에, 그 변을 따라 along(cm)만큼·바깥으로 out(cm)만큼인 직사각형을 붙인다.
 * at: 'start'(변의 왼쪽·위 끝에 맞춤) | 'end'(오른쪽·아래 끝에 맞춤)
 */
function attachRect(g, side, along, out, at = 'start') {
  const shift = at === 'end' ? sideLength(g, side) - along : 0;
  if (side === 'top') return { x: g.x + shift, y: g.y - out, w: along, h: out };
  if (side === 'bottom') return { x: g.x + shift, y: g.y + g.h, w: along, h: out };
  if (side === 'left') return { x: g.x - out, y: g.y + shift, w: out, h: along };
  return { x: g.x + g.w, y: g.y + shift, w: out, h: along };
}

/** 면 f가 g의 어느 변에 붙어 있나 (맞닿은 변) */
function sideOf(g, f) {
  if (Math.abs(f.y + f.h - g.y) < 1e-9) return 'top';
  if (Math.abs(f.y - (g.y + g.h)) < 1e-9) return 'bottom';
  if (Math.abs(f.x + f.w - g.x) < 1e-9) return 'left';
  return 'right';
}

/** 전개도의 끝 면(이웃이 하나뿐인 면)과 그 면이 붙은 면: [{ index, parent, side(붙은 면의 어느 변), along(맞닿은 변), out(나머지 변) }] */
function leavesOf(net) {
  const hinges = findHinges(net);
  const rects = net.faces.map(faceRect);
  const out = [];
  net.faces.forEach((f, index) => {
    const mine = hinges.filter((hg) => hg.a === f.id || hg.b === f.id);
    if (mine.length !== 1) return;
    const parent = net.faces.findIndex((g) => g.id === (mine[0].a === f.id ? mine[0].b : mine[0].a));
    const side = sideOf(rects[parent], rects[index]);
    const along = side === 'top' || side === 'bottom' ? rects[index].w : rects[index].h;
    out.push({ index, parent, side, along, out: side === 'top' || side === 'bottom' ? rects[index].h : rects[index].w });
  });
  return out;
}

/** index번째 면을 rect로 바꾼 전개도. 다른 면과 겹치거나, 붙일 면(parent) 말고 다른 면과 맞닿으면 null */
function replaceFace(net, index, rect, parent) {
  const rects = net.faces.map(faceRect);
  for (let i = 0; i < rects.length; i += 1) {
    if (i === index) continue;
    if (overlapsFlat(rects[i], rect)) return null;
    if (i !== parent && contactLength(rects[i], rect) > 0) return null;
  }
  rects[index] = rect;
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const moved = rects.map((r) => ({ ...r, x: r.x - minX, y: r.y - minY }));
  return fromRects(moved, { labels: net.faces.map((f) => f.label), dims: net.dims });
}

const typesOf = (problems) => new Set(problems.map((p) => p.type));
const onlyTypes = (problems, allowed) => problems.every((p) => allowed.includes(p.type));
const hingeLength = (problems) => problems.find((p) => p.type === 'edge-length' && p.hinge) ?? null;

// ── 까닭 ─────────────────────────────────
/** 까닭을 하나만 말할 때 먼저 고르는 순서 (이어 붙인 두 변의 길이가 다른 것을 접어서 만나는 선분보다 먼저) */
const PROBLEM_ORDER = ['face-count', 'vertex-full', 'overlap', 'face-pair', 'edge-length', 'gap', 'disconnected'];

export function primaryCuboidProblem(problems) {
  for (const type of PROBLEM_ORDER) {
    const found = (type === 'edge-length' ? hingeLength(problems) : null) ?? problems.find((p) => p.type === type);
    if (found) return found;
  }
  return problems[0] ?? null;
}

/** problem → 오개념 tag (기획서 3절) */
export const CUBOID_TAG_OF_PROBLEM = Object.freeze({
  'vertex-full': TAGS.vertex,
  overlap: TAGS.overlap,
  'face-pair': TAGS.oppositeCongruent,
  'edge-length': TAGS.edgeLength,
  gap: TAGS.edgeLength, // 면 6장이 겹치지 않는데 틈이 생기면 맞닿아야 할 모서리가 어긋난 것이다
});

/** 까닭 문장. opposite: 크기를 바꾼 면과 마주 보는 면의 이름(문항이 알 때) */
export function explainCuboidProblem(net, problem, { opposite = null } = {}) {
  if (!problem) return '';
  const names = (problem.faces ?? []).map((id) => labelOf(net, id));
  if (problem.type === 'vertex-full') return '면이 한 점을 빈틈없이 둘러싸면 접을 수 없어요. 직육면체의 한 꼭짓점에는 면이 3개만 모여요.';
  if (problem.type === 'overlap') {
    const [a, b] = names.sort(byLabelOrder);
    return `${a} 면과 ${b} 면이 같은 자리에 겹쳐요. 그래서 다른 한쪽이 비어요.`;
  }
  if (problem.type === 'face-pair') {
    const tail = '직육면체에서 마주 보는 면은 모양과 크기가 같아요.';
    return opposite ? `${names[0]} 면은 마주 보는 ${opposite} 면과 크기가 달라요. ${tail}` : `${names[0]} 면과 크기가 같은 면이 없어요. ${tail}`;
  }
  if (problem.type === 'edge-length') {
    const [a, b] = names;
    if (problem.shifted) return `${a} 면과 ${b} 면이 어긋나게 붙어 있어요. 맞닿는 모서리는 끝과 끝이 꼭 맞아야 해요.`;
    const [x, y] = problem.lengths.map(cm);
    const head = problem.hinge ? `${a} 면과 ${b} 면이 붙은 두 변의 길이가` : `접으면 ${a} 면과 ${b} 면이 만나는 두 선분의 길이가`;
    return `${head} ${josa(x, '과/와')} ${y}로 달라요. 맞닿는 모서리는 길이가 같아야 해요.`;
  }
  if (problem.type === 'face-count') return `직육면체는 면이 6개예요. 이 전개도는 면이 ${problem.count}개예요.`;
  return '접으면 모서리끼리 맞닿지 않는 곳이 있어요. 직육면체가 되려면 모든 모서리가 맞닿아야 해요.';
}

/**
 * "왜 안 될까요?" 칩. 판별(길이까지 살펴요)은 겹침 · 붙은 변의 길이 · 마주 보는 면의 크기 — 문항을 만들 때 셋 가운데 하나만 참이 되게 한다.
 * 직접 만드는 단계는 면 카드가 늘 알맞은 여섯 장이라 크기 대신 "한 점을 둘러쌈"이 들어간다(만나는 선분의 길이가 다른 것과 틈은 한 칩).
 */
export const CUBOID_JUDGE_REASONS = Object.freeze([
  { id: 'overlap', text: '면이 겹쳐요' },
  { id: 'length', text: '붙은 두 변의 길이가 달라요' },
  { id: 'pair', text: '마주 보는 면의 크기가 달라요' },
]);
export const CUBOID_FREE_REASONS = Object.freeze([
  { id: 'overlap', text: '면이 겹쳐요' },
  { id: 'length', text: '만나는 모서리가 꼭 맞지 않아요' },
  { id: 'vertex', text: '면이 한 점을 둘러싸요' },
]);

/** 그 전개도에서 참인 까닭 칩 id 모두. mode: 'judge'(붙은 변만 길이로 센다) | 'free' */
export function cuboidReasons(problems, mode = 'judge') {
  const types = typesOf(problems);
  const out = [];
  if (types.has('overlap')) out.push('overlap');
  if (mode === 'judge') {
    if (hingeLength(problems)) out.push('length');
    if (types.has('face-pair')) out.push('pair');
    return out;
  }
  if (types.has('vertex-full')) out.push('vertex');
  if (types.has('edge-length') || (types.has('gap') && out.length === 0)) out.push('length');
  return out;
}

/** 까닭을 하나만 말할 때의 칩 id (primaryCuboidProblem과 같은 까닭) */
export function cuboidReasonOf(problems, mode = 'judge') {
  const p = primaryCuboidProblem(problems);
  if (!p) return null;
  if (p.type === 'overlap') return 'overlap';
  if (p.type === 'vertex-full') return mode === 'free' ? 'vertex' : null;
  if (p.type === 'face-pair') return mode === 'judge' ? 'pair' : null;
  return 'length';
}

/** 고른 까닭 채점 → { correct, answer(쪽지에 말할 까닭의 칩 id), answerText }. 참인 까닭이 둘이면(직접 만든 모양) 어느 쪽을 골라도 맞다 */
export function judgeCuboidReason(problems, choice, mode = 'judge') {
  const list = mode === 'free' ? CUBOID_FREE_REASONS : CUBOID_JUDGE_REASONS;
  const truths = cuboidReasons(problems, mode);
  const correct = truths.includes(choice);
  const answer = correct ? choice : (cuboidReasonOf(problems, mode) ?? truths[0] ?? null);
  return { correct, answer, answerText: list.find((r) => r.id === answer)?.text ?? '' };
}

// ── 1단계: 만나는 선분 (cuboid-edge) ─────────────────────
/** 테두리 선분마다 접었을 때 만나는 선분의 번호 (짝이 없으면 -1) */
export function meetingPairs(net, segments) {
  return segments.map((s) => {
    if (s.edge == null) return -1;
    const m = matchingEdge(net, s.face, s.edge);
    return m ? segments.findIndex((t) => t.face === m.face && t.edge === m.edge) : -1;
  });
}

const cyclicNear = (i, j, n) => (i - j + n) % n === 1 || (j - i + n) % n === 1;

function makeEdgeQuestions(stage, rng) {
  const used = new Set();
  const questions = [];
  while (questions.length < stage.count) {
    const { id, dims, net } = pickNet(rng, used);
    const { vertices, segments } = outline(net);
    const pairs = meetingPairs(net, segments);
    const n = segments.length;
    // 바로 옆(꼭짓점을 함께 쓰는) 선분과 만나는 선분은 묻지 않는다: "가까이 있는 선분끼리 만난다"로는 맞힐 수 없게
    const far = segments.map((_, i) => i).filter((i) => pairs[i] >= 0 && !cyclicNear(i, pairs[i], n));
    if (far.length === 0) continue;
    const target = rng.pick(far);
    const answer = pairs[target];
    const others = segments.map((_, i) => i).filter((i) => i !== target && i !== answer);
    const near = others.filter((i) => cyclicNear(i, target, n));
    const same = others.filter((i) => !near.includes(i) && Math.abs(segments[i].length - segments[target].length) < 1e-9);
    // 오답 보기 3개: 바로 옆 선분 하나는 꼭 넣고(오개념 "가까이 있는 선분끼리 만난다"), 길이가 같은 선분, 나머지는 아무 선분
    const picked = [rng.pick(near)];
    if (same.length > 0) picked.push(rng.pick(same));
    const rest = rng.shuffle(others.filter((i) => !picked.includes(i)));
    while (picked.length < 3) picked.push(rest.shift());
    const kindOf = (i) => (i === answer ? 'answer' : near.includes(i) ? 'near' : same.includes(i) ? 'same' : 'other');
    questions.push({
      kind: 'edge',
      number: questions.length + 1,
      itemId: `${stage.id}:${questions.length + 1}:${id}`,
      name: id,
      dims,
      net,
      vertices,
      segments,
      pairs,
      target,
      answer,
      // 보기는 테두리를 도는 순서(ㄱ → ㅎ)로 늘어놓는다
      options: [answer, ...picked].sort((a, b) => a - b).map((index) => ({ index, name: segments[index].name, kind: kindOf(index) })),
    });
  }
  return questions;
}

/** 꼭짓점 이름은 모두 받침으로 끝난다(기역 · 니은 … 히읗): 선분 ㄱㄴ"과" · "은" · "이" */
const seg = (name, particle = '') => `선분 ${name}${particle}`;

/** 만나는 선분: index는 고른 선분(테두리 선분 번호) */
export function judgeEdge(question, index) {
  const { segments, pairs, target, answer } = question;
  const option = question.options.find((o) => o.index === index);
  if (!option) throw new Error(`없는 보기: ${index}`);
  const expected = seg(segments[answer].name);
  const T = segments[target].name;
  const P = segments[index].name;
  if (index === answer) {
    return { correct: true, expected, tag: null, message: `맞아요! 접으면 ${seg(T, '과')} ${seg(P, '이')} 만나 한 모서리가 돼요.` };
  }
  const mate = pairs[index] >= 0 ? seg(segments[pairs[index]].name, '과') : null;
  let message;
  if (option.kind === 'near') message = `${seg(P, '은')} ${seg(T)} 바로 옆에 있지만, 접으면 ${mate} 만나요. 가까이 있다고 만나는 것은 아니에요.`;
  else if (option.kind === 'same') message = `${seg(P, '은')} 길이가 같지만, 접으면 ${mate} 만나요. ${seg(T, '과')}는 만나지 않아요.`;
  else message = `접으면 ${seg(P, '은')} ${mate} 만나요. ${seg(T, '과')}는 만나지 않아요.`;
  return { correct: false, expected, tag: TAGS.meetingEdge, message };
}

// ── 2단계: 알맞은 면 고르기 (cuboid-face) ────────────────────
/** 카드를 빈 자리에 붙인 직사각형: 변의 길이와 같은 변이 있으면 그 변을, 없으면 가까운 변을 변의 시작 끝에 맞춰 붙인다 */
function placeCard(parentRect, side, card) {
  const edge = sideLength(parentRect, side);
  const fitsW = Math.abs(card.w - edge) <= Math.abs(card.h - edge);
  const [along, out] = fitsW ? [card.w, card.h] : [card.h, card.w];
  return attachRect(parentRect, side, along, out, 'start');
}

function makeFaceQuestions(stage, rng) {
  const used = new Set();
  const questions = [];
  for (let guard = 0; questions.length < stage.count && guard < 400; guard += 1) {
    const tried = new Set(used);
    const { id, dims, net } = pickNet(rng, tried);
    const rects = net.faces.map(faceRect);
    const classes = [[dims[0], dims[1]], [dims[1], dims[2]], [dims[0], dims[2]]];
    const isClass = (w, h) => classes.some(([p, q]) => (p === w && q === h) || (p === h && q === w));
    let made = null;
    for (const leaf of rng.shuffle(leavesOf(net))) {
      const L = leaf.along;
      const M = leaf.out;
      // 길이 하나만 다른 카드: 맞닿는 변은 같고 나머지 변이 1 cm 다르다(그 직육면체의 어떤 면과도 크기가 다르게)
      const offs = rng.shuffle([M - 1, M + 1]).filter((v) => v >= 1 && v !== L && !isClass(L, v));
      // 크기가 다른 면: 그 직육면체의 다른 면(이웃한 면과 같은 크기). 빈 자리의 변과 같은 변이 있는 것을 먼저
      const otherClass = classes.filter(([p, q]) => !((p === L && q === M) || (p === M && q === L)))
        .sort((p, q) => Number(q.includes(L)) - Number(p.includes(L)));
      if (offs.length === 0 || otherClass.length === 0) continue;
      const parentRect = rects[leaf.parent];
      const cards = [
        { kind: 'answer', w: L, h: M },
        { kind: 'length', w: L, h: offs[0] },
        { kind: 'pair', w: otherClass[0][0], h: otherClass[0][1] },
      ].map((card) => {
        const rect = placeCard(parentRect, leaf.side, card);
        const placed = replaceFace(net, leaf.index, rect, leaf.parent);
        return { ...card, rect, placed };
      });
      if (cards.some((card) => !card.placed || !fits(netSize(card.placed)))) continue;
      const [right, ...wrong] = cards.map((card) => checkNet(card.placed));
      if (!right.ok || wrong.some((r) => r.ok)) continue;
      made = { leaf, cards };
      break;
    }
    if (!made) continue;
    used.add(id);
    const { leaf, cards } = made;
    const face = net.faces[leaf.index];
    const base = fromRects(rects.filter((_, i) => i !== leaf.index), { labels: net.faces.filter((_, i) => i !== leaf.index).map((f) => f.label), dims });
    const number = questions.length + 1;
    questions.push({
      kind: 'face',
      number,
      itemId: `${stage.id}:${number}:${id}`,
      name: id,
      dims,
      fullNet: net,
      net: base,
      rects: rects.filter((_, i) => i !== leaf.index),
      missingLabel: face.label,
      oppositeLabel: labelOf(net, oppositeFace(net, face.id)),
      // 빈 자리: 붙일 변 바깥의 띠. 깊이는 빠진 면의 크기와 무관하게 늘 SLOT_DEPTH
      slot: { key: 'slot', rect: attachRect(rects[leaf.parent], leaf.side, leaf.along, SLOT_DEPTH, 'start'), parentLabel: net.faces[leaf.parent].label, side: leaf.side },
      cards: rng.shuffle(cards).map((card, i) => ({ id: `c${i}`, kind: card.kind, w: Math.max(card.w, card.h), h: Math.min(card.w, card.h), rect: card.rect })),
    });
  }
  if (questions.length < stage.count) throw new Error('알맞은 면 고르기 문항을 만들지 못했어요.');
  return questions;
}

/** 카드를 빈 자리에 붙인 전개도 (붙인 면은 마지막 면, 이름은 빠진 면의 이름) */
export function cardNet(question, cardId) {
  const card = question.cards.find((c) => c.id === cardId);
  if (!card) throw new Error(`없는 카드: ${cardId}`);
  return fromRects([...question.rects, card.rect], { labels: [...question.net.faces.map((f) => f.label), question.missingLabel], dims: question.dims });
}

/** 알맞은 면 고르기: cardId는 붙인 카드 */
export function judgeCard(question, cardId) {
  const card = question.cards.find((c) => c.id === cardId);
  if (!card) throw new Error(`없는 카드: ${cardId}`);
  const right = question.cards.find((c) => c.kind === 'answer');
  const expected = sizeText(right.w, right.h);
  const opp = question.oppositeLabel;
  const rule = `빠진 면은 ${opp} 면과 마주 봐요. 마주 보는 면은 모양과 크기가 같아요.`;
  if (card.kind === 'answer') return { correct: true, expected, tag: null, message: `맞아요! ${rule}` };
  const net = cardNet(question, cardId);
  const { problems } = checkNet(net);
  if (card.kind === 'pair') return { correct: false, expected, tag: TAGS.oppositeCongruent, message: `${rule} 이 카드는 ${opp} 면과 크기가 달라요.`, problems };
  // 길이 하나만 다른 카드: 접으면 만나는 두 선분의 길이가 다르다
  const mismatch = problems.find((p) => p.type === 'edge-length');
  const message = mismatch
    ? `이 카드를 붙이면 접었을 때 만나는 두 선분이 ${josa(cm(mismatch.lengths[0]), '과/와')} ${cm(mismatch.lengths[1])}로 달라요. 맞닿는 모서리는 길이가 같아야 해요.`
    : '이 카드를 붙이면 접었을 때 맞닿는 모서리의 길이가 달라요. 맞닿는 모서리는 길이가 같아야 해요.';
  return { correct: false, expected, tag: TAGS.edgeLength, message, problems };
}

// ── 3단계: 길이까지 살펴요 (cuboid-judge) ─────────────────────
/** 되는 전개도의 끝 면 하나를 고쳐 만든 안 되는 전개도 후보. kind: 'overlap'(옮기기) | 'length'(돌려 붙이기) | 'pair'(크기 바꾸기) */
function mutations(net, kind) {
  const rects = net.faces.map(faceRect);
  const out = [];
  for (const leaf of leavesOf(net)) {
    const mine = rects[leaf.index];
    const add = (rect, parent, extra = {}) => {
      const made = replaceFace(net, leaf.index, rect, parent);
      if (!made || !fits(netSize(made)) || !isConnected(made)) return;
      const { ok, problems } = checkNet(made);
      if (ok) return;
      const types = typesOf(problems);
      // 의도한 까닭 하나만 참이 되게: 겹침형은 겹침(과 그 때문에 생긴 틈)뿐, 길이형은 붙은 두 변의 길이, 크기형은 짝 없는 면(붙은 변은 꼭 맞음)
      if (kind === 'overlap' && !(types.has('overlap') && onlyTypes(problems, ['overlap', 'gap']))) return;
      if (kind === 'length' && !(hingeLength(problems) && !types.has('overlap') && !types.has('face-pair') && !types.has('vertex-full'))) return;
      if (kind === 'pair' && !(types.has('face-pair') && !hingeLength(problems) && !types.has('overlap') && !types.has('vertex-full'))) return;
      out.push({ net: made, problems, face: net.faces[leaf.index].id, gap: Math.abs(leaf.along - leaf.out), ...extra });
    };
    if (kind === 'overlap') {
      // 끝 면을 다른 변으로 옮긴다(맞닿는 변의 길이는 꼭 맞게)
      rects.forEach((g, gi) => {
        if (gi === leaf.index) return;
        for (const side of SIDES) {
          const edge = sideLength(g, side);
          for (const [along, depth] of [[mine.w, mine.h], [mine.h, mine.w]]) {
            if (Math.abs(along - edge) > 1e-9) continue;
            const rect = attachRect(g, side, along, depth);
            if (Math.abs(rect.x - mine.x) < 1e-9 && Math.abs(rect.y - mine.y) < 1e-9 && Math.abs(rect.w - mine.w) < 1e-9) continue;
            add(rect, gi);
          }
        }
      });
    } else if (kind === 'length') {
      // 끝 면을 90° 돌려 붙인다: 붙은 두 변의 길이가 다르다
      for (const at of ['start', 'end']) add(attachRect(rects[leaf.parent], leaf.side, leaf.out, leaf.along, at), leaf.parent);
    } else {
      // 끝 면의 한 변(붙은 변이 아닌 쪽)을 1 cm 늘이거나 줄인다: 마주 보는 면과 크기가 달라진다
      const opposite = labelOf(net, oppositeFace(net, net.faces[leaf.index].id));
      for (const depth of [leaf.out - 1, leaf.out + 1]) {
        if (depth >= 1) add(attachRect(rects[leaf.parent], leaf.side, leaf.along, depth), leaf.parent, { opposite });
      }
    }
  }
  return out;
}

/** 그 직육면체의 되는 전개도(가로로 길게 놓은 것)에서 나오는 테두리 크기 '가로×세로' */
const usualSizes = new Map();
function isUsualSize(dims, net) {
  const name = dims.join('');
  if (!usualSizes.has(name)) usualSizes.set(name, new Set(cuboidNets(dims).filter((n) => fits(n.size)).map((n) => n.size.join('×'))));
  const [w, h] = netSize(net);
  return w >= h && usualSizes.get(name).has(`${w}×${h}`);
}

function makeCJudgeQuestions(stage, rng) {
  const used = new Set();
  // 유효 2 · 무효 3(겹침 · 붙은 변의 길이 · 마주 보는 면의 크기)
  const plan = rng.shuffle([null, null, 'overlap', 'length', 'pair']);
  return plan.map((intended, i) => {
    for (let guard = 0; guard < 200; guard += 1) {
      const { id, dims, net } = pickNet(rng, new Set(used));
      let item = { net, problems: [], opposite: null };
      if (intended) {
        // 고친 전개도의 테두리 크기가 되는 전개도에서도 나오는 크기인 것만 쓴다 — 전개도의 가로·세로 크기로 답을 짐작하기 어렵게
        let options = mutations(net, intended).filter((o) => isUsualSize(dims, o.net));
        // 돌려 붙인 면: 두 변의 길이가 1 cm만 다른 것을 먼저 쓴다("크기가 비슷하면 붙는다"는 생각을 만나게)
        if (intended === 'length') options = options.filter((o) => o.gap === Math.min(...options.map((x) => x.gap)));
        if (options.length === 0) continue;
        item = rng.pick(options);
      }
      used.add(id);
      const valid = !intended;
      return {
        kind: 'cjudge',
        number: i + 1,
        itemId: `${stage.id}:${i + 1}:${id}${intended ? `-${intended}` : ''}`,
        name: id,
        dims,
        net: item.net,
        valid,
        problems: item.problems,
        intended,
        opposite: item.opposite ?? null,
        expected: valid ? 'yes' : 'no',
      };
    }
    throw new Error('길이까지 살펴요 문항을 만들지 못했어요.');
  });
}

/** 판별: answer는 'yes'(돼요) | 'no'(안 돼요) */
export function judgeCuboidAnswer(question, answer) {
  const { expected, net } = question;
  const correct = answer === expected;
  if (question.valid) {
    if (correct) return { correct, expected, tag: null, message: '맞아요! 접으면 직육면체가 돼요. 만나는 선분의 길이가 모두 같아요.' };
    return { correct, expected, tag: TAGS.variety, message: '이 전개도는 접으면 직육면체가 돼요. 만나는 선분의 길이가 모두 같고, 마주 보는 면의 크기도 같아요.' };
  }
  const problem = primaryCuboidProblem(question.problems);
  const why = explainCuboidProblem(net, problem, { opposite: question.opposite });
  if (correct) return { correct, expected, tag: null, message: `맞아요! ${why}` };
  return { correct, expected, tag: CUBOID_TAG_OF_PROBLEM[problem.type] ?? TAGS.edgeLength, message: why };
}

/** 살펴볼 거리(틀렸을 때 쪽지 아래 한 줄) */
export function cuboidJudgeTip(question) {
  if (question.intended === 'overlap') return '빗금 친 면과 점선(비어요)을 찾아보고, 돌려 보기로 빈 자리를 확인해요.';
  if (question.intended === 'length') return '같은 무늬로 표시한 두 변에 적힌 길이를 견줘 봐요.';
  if (question.intended === 'pair') return '마주 보는 두 면에 적힌 길이를 견줘 봐요.';
  return '';
}

export const CUBOID_MAKERS = {
  edge: makeEdgeQuestions,
  face: makeFaceQuestions,
  cjudge: makeCJudgeQuestions,
  cfree: () => [], // 직접 만드는 단계는 문항이 없다
};

// ── 4단계: 내 맘대로 직육면체 전개도 (cuboid-free, spec 16-2 · 예상 없이 접는다 16-12) ──────────
/** 만드는 직육면체(cm)와 면 카드 여섯 장: 크기가 같은 면이 두 장씩. 1 cm 격자 판에 54가지가 모두 들어가는 크기 */
export const FREE_BOX = Object.freeze([1, 2, 3]);
export const FREE_CARDS = Object.freeze([
  { label: '가', w: 3, h: 2 }, { label: '나', w: 3, h: 2 },
  { label: '다', w: 3, h: 1 }, { label: '라', w: 3, h: 1 },
  { label: '마', w: 2, h: 1 }, { label: '바', w: 2, h: 1 },
]);
/** 놓는 판(1 cm 칸): 보통 12칸 × 8줄(54가지가 모두 들어간다), 휴대폰(560px 이하) 10칸 × 9줄 */
export const CUBOID_BOARDS = Object.freeze({ wide: { cols: 12, rows: 8 }, phone: { cols: 10, rows: 9 } });
/** 이번 판에서 끝낼 수 있는 가지 수 · 별 3개를 받는 가지 수 */
export const CUBOID_FREE_GOAL = 2;
export const CUBOID_FREE_FULL = 3;
/** 찾은 전개도를 이 기기에 적어 두는 모음(main.js collections, 화면에는 보이지 않는 quiet 모음)의 id */
export const CUBOID_NETS_ID = 'cuboid-nets';
export const CUBOID_FREE_EXPECTED = '전개도';
export const CUBOID_HINT_AFTER_INVALID = 2;
export const CUBOID_HINT_TEXT = '길이가 3 cm인 변끼리 이어 네 장을 한 줄로 놓고, 남은 작은 면 두 장을 위와 아래에 붙여 봐요.';
export const CUBOID_FREE_REPLAY_NOTE = '처음 찾은 전개도는 점수를 받아요. 찾아본 전개도는 다시 만들어도 점수가 없어요.';
export const CUBOID_NOTE_BEFORE_PICK = '접어 보니 직육면체가 안 돼요. 왜 그런지 골라 볼까요?';
/** 놓는 판 아래 안내 (접기 전). 까닭 낱말을 쓰지 않는다 — 까닭을 고르는 동안에도 문서에 남는 글이다 */
export const CUBOID_FOLD_NOTES = Object.freeze({
  count: '면 6장을 모두 놓으면 접어 볼 수 있어요.',
  apart: '떨어진 면이 있어요. 전개도는 한 장으로 이어져 있어야 접을 수 있어요.',
  ready: '놓은 그대로 접혀요. 서로 다른 전개도를 찾아봐요.',
});

/** 내 맘대로 직육면체 전개도에서 찾을 수 있는 전개도 54가지 (모음의 칸) */
export const freeNets = () => cuboidNets(FREE_BOX);
/**
 * 모음의 칸 수와 칸 id. 게임을 열 때마다 54가지를 펼쳐 보지 않고도 모음을 만들 수 있게 따로 적는다
 * (freeNets()의 id와 같은지는 단위 테스트가 본다)
 */
export const FREE_NET_COUNT = 54;
export const freeNetIdAt = (i) => `${FREE_BOX.join('')}-${String(i + 1).padStart(2, '0')}`;
/** 놓은 모양의 전개도 번호(54가지 가운데). 전개도가 아니면 null */
export function freeNetId(net) {
  const key = netKey(net);
  return freeNets().find((n) => n.key === key)?.id ?? null;
}

const rectNet = (rects) => fromRects(rects, { labels: rects.map((r, i) => r.label ?? LABELS[i]), dims: FREE_BOX });

/** 놓은 면들을 변으로 이어진 덩어리로 나눈다 → 면 번호 묶음, 큰 것부터 (fold.js의 경첩으로 — 접기 판정과 같은 계산) */
function rectGroups(net) {
  const indexOf = new Map(net.faces.map((f, i) => [f.id, i]));
  const links = net.faces.map(() => []);
  for (const hg of findHinges(net)) {
    links[indexOf.get(hg.a)].push(indexOf.get(hg.b));
    links[indexOf.get(hg.b)].push(indexOf.get(hg.a));
  }
  const seen = new Set();
  const groups = [];
  net.faces.forEach((_, start) => {
    if (seen.has(start)) return;
    const group = [];
    const queue = [start];
    seen.add(start);
    while (queue.length > 0) {
      const i = queue.shift();
      group.push(i);
      for (const j of links[i]) {
        if (!seen.has(j)) {
          seen.add(j);
          queue.push(j);
        }
      }
    }
    groups.push(group.sort((a, b) => a - b));
  });
  return groups.sort((a, b) => b.length - a.length || a[0] - b[0]);
}

/** 놓은 면이 접을 수 있는 상태인가 → { ready, reason: 'count' | 'apart' | null, detached: 떨어진 면 번호 } */
export function rectReadiness(rects, total = FREE_CARDS.length) {
  if (rects.length < total) return { ready: false, reason: 'count', detached: [] };
  const net = rectNet(rects);
  if (isConnected(net)) return { ready: true, reason: null, detached: [] };
  return { ready: false, reason: 'apart', detached: rectGroups(net).slice(1).flat().sort((a, b) => a - b) };
}

/**
 * 놓은 대로 접은 한 번의 판정. 판정은 판별 단계와 같은 checkNet.
 * seen: 이번 판에서 접어 본 모양의 열쇠, found: 이 기기에서 찾은 전개도 번호
 * → { net, key, id(전개도 번호), valid, problems, correct, tag, kind: 'new' | 'known' | 'repeat' | 'invalid', log, title, message, given }
 */
export function judgeCuboidFree({ rects, seen = new Set(), found = new Set() }) {
  const net = rectNet(rects);
  const { ok, problems } = checkNet(net);
  const key = netKey(net);
  const id = ok ? freeNets().find((n) => n.key === key)?.id ?? null : null;
  const repeat = seen.has(key);
  const problem = ok ? null : primaryCuboidProblem(problems);
  const tag = ok ? null : (CUBOID_TAG_OF_PROBLEM[problem?.type] ?? TAGS.edgeLength);
  let kind = 'invalid';
  if (repeat) kind = 'repeat';
  else if (ok) kind = found.has(id) ? 'known' : 'new';
  let title;
  let message;
  if (kind === 'repeat') {
    title = '이미 접어 본 모양';
    message = '이번에 이미 접어 본 모양이에요. 돌리거나 뒤집어도 같은 모양이라 다시 세지 않아요. 다른 모양을 만들어 봐요.';
  } else if (kind === 'new') {
    title = '새 전개도 발견';
    message = '처음 찾은 전개도예요. 접으면 맞닿는 모서리의 길이가 모두 같아요.';
  } else if (kind === 'known') {
    title = '직육면체가 돼요';
    message = '전에 찾은 전개도와 같은 모양이에요. 돌리거나 뒤집으면 똑같아요.';
  } else {
    title = '직육면체가 안 돼요';
    message = explainCuboidProblem(net, problem);
  }
  const given = ok ? `전개도 ${id ?? ''}`.trim() : `안 됨: ${tag}`;
  return { net, key, id, valid: ok, problems, correct: ok, tag, kind, log: !repeat, title, message, given };
}

/**
 * 한 판의 흐름 (순수 상태). 화면(cuboid-free.js)과 점수 테스트가 같은 규칙을 쓴다.
 * fold(rects) → judgeCuboidFree 결과 + { itemId(기록할 때), collect: { id, item, isNew }(되는 전개도를 처음 찾았을 때 모음에 넣을 칸),
 *   first(이 기기에서 처음 찾은 전개도 — 점수는 이때만), explainable(안 되는 모양: 까닭 고르기), fixed(안 된 뒤 바로 전개도를 만듦),
 *   found(이번 판에 찾은 가지 수), total(이 기기에서 찾은 가지 수), done(끝낼 수 있음), full(별 3개만큼 찾음) }
 * 안 되는 모양은 끝없이 많아 "모양마다 한 번"을 적어 둘 수 없다 → 안 되는 모양에는 점수가 없다(기록·까닭 고르기·표시는 그대로).
 */
export function createCuboidFreeSession({ stageId = 'cuboid-free', goal = CUBOID_FREE_GOAL, found = [] } = {}) {
  const seen = new Set(); // 이번 판에서 접어 본 모양(열쇠)
  const foundNow = new Set(); // 이번 판에서 찾은 전개도
  const device = new Set(found);
  const history = [];
  let seq = 0;
  let invalidRun = 0;
  return {
    fold(rects) {
      const r = judgeCuboidFree({ rects, seen, found: device });
      const prev = history.at(-1);
      let itemId = null;
      let collect = null;
      if (r.log) {
        seq += 1;
        itemId = `${stageId}:${seq}:${r.valid ? r.id : 'x'}`;
        seen.add(r.key);
      }
      if (r.valid) {
        foundNow.add(r.id);
        if (r.kind === 'new') collect = { id: CUBOID_NETS_ID, item: r.id, isNew: !device.has(r.id) };
        device.add(r.id);
        invalidRun = 0;
      } else invalidRun += 1;
      const step = {
        ...r,
        itemId,
        collect,
        first: Boolean(collect?.isNew),
        explainable: r.kind === 'invalid',
        fixed: r.valid && r.kind !== 'repeat' && Boolean(prev && !prev.valid),
        found: foundNow.size,
        total: device.size,
        done: foundNow.size >= goal,
        full: foundNow.size >= CUBOID_FREE_FULL,
        invalidRun,
      };
      history.push(step);
      return step;
    },
    found: () => new Set(foundNow),
    device: () => new Set(device),
    done: () => foundNow.size >= goal,
    invalidRun: () => invalidRun,
    history: () => history.slice(),
    goal,
  };
}

/** 접은 뒤 보일 글과 무대 표시. 안 되는 모양은 까닭 고르기가 먼저다 — 고르기 전에는 까닭 문장도 무대의 까닭 표시도 없다 */
export function cuboidFreeFeedback(step, { picked = false } = {}) {
  const waiting = Boolean(step.explainable) && !picked;
  let toast;
  if (step.kind === 'repeat') toast = '이번에 이미 접어 본 모양이에요.';
  else if (step.kind === 'new') toast = '처음 찾은 전개도예요!';
  else if (step.kind === 'known') toast = '전에 찾은 전개도와 같은 모양이에요.';
  else toast = '직육면체가 안 돼요. 왜 그런지 골라 볼까요?';
  let tone = 'info';
  if (step.kind === 'new' || step.kind === 'known') tone = 'correct';
  else if (step.kind === 'invalid' && !waiting) tone = 'wrong';
  return {
    toast,
    title: step.kind === 'invalid' && !waiting ? '까닭' : step.title,
    note: waiting ? CUBOID_NOTE_BEFORE_PICK : step.message,
    marks: !waiting,
    tone,
  };
}

/** 별: 이번 판에 찾은 서로 다른 전개도 수 (1 · 2 · 3가지 → 별 1 · 2 · 3개, spec 16-12). 안 되는 모양은 별과 무관하다 */
export const cuboidFreeStars = (found) => Math.max(0, Math.min(3, Math.floor(Number(found) || 0)));
/** 결과 화면의 별 기준 안내 (별 3개가 안 될 때) */
export const cuboidFreeStarNote = (stars) => (stars >= 3 ? null : '서로 다른 전개도 3가지를 찾으면 별 3개!');

export function cuboidFreeSummary(history) {
  const logged = history.filter((s) => s.log);
  return {
    shapes: logged.length,
    found: logged.filter((s) => s.valid).length,
    newNets: history.filter((s) => s.collect?.isNew).length,
    fixes: history.filter((s) => s.fixed).length,
  };
}

/** 결과 화면의 기록 칸: 정답률 대신 "찾은 전개도 n가지 · 접어 본 모양 n가지" */
export const cuboidFreeStats = (sum) => [
  { label: '찾은 전개도', value: `${sum.found}가지` },
  { label: '접어 본 모양', value: `${sum.shapes}가지` },
];

/** 결과 "오늘의 솜씨" 칸 (보여 주기만. 점수는 엔진이 계산): earned { answer(만들기 성공·연속), nets(새 전개도 등록) } — 칸 점수의 합 = 이번 판 점수 */
export function cuboidFreeHighlights(sum, { earned, total }) {
  return [
    { icon: 'book', label: '새 전개도 발견', value: `${sum.newNets}가지`, xp: earned.answer + earned.nets },
    { icon: 'grid', label: '지금까지 찾은 전개도', value: `${total}가지` },
    { icon: 'undo', label: '고쳐서 다시 도전', value: `${sum.fixes}번` },
  ];
}

/** 힌트 그림자: 아직 못 찾은 전개도 가운데 판에 들어가는 가장 작은 것 */
export function cuboidHintNet(foundIds = new Set(), board = CUBOID_BOARDS.wide) {
  const left = freeNets().filter((n) => !foundIds.has(n.id) && centerOnBoard(n.net, board));
  return left.sort((p, q) => p.size[0] * p.size[1] - q.size[0] * q.size[1] || (p.id < q.id ? -1 : 1))[0] ?? null;
}

/** 전개도를 판(cols × rows) 가운데에 놓은 직사각형들. 들어가지 않으면 돌려서 놓고, 그래도 안 되면 null */
export function centerOnBoard(net, { cols, rows }) {
  for (let k = 0; k < SYMMETRY_COUNT; k += 1) {
    const moved = transformNet(net, k);
    const [w, h] = netSize(moved);
    if (w <= cols && h <= rows) {
      const dx = Math.floor((cols - w) / 2);
      const dy = Math.floor((rows - h) / 2);
      return moved.faces.map((f) => {
        const r = faceRect(f);
        return { ...r, x: r.x + dx, y: r.y + dy };
      });
    }
  }
  return null;
}
