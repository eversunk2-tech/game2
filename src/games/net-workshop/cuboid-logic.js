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
  shapeKey,
  spanningTrees,
  transformNet,
  unfold,
} from './fold.js';
import { CUBE_NETS } from './nets-data.js';

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

/**
 * 무대에 들어가는 전개도 하나: 직육면체 고르기 → 54가지 가운데 하나 → 돌리기·뒤집기 → 면 이름 섞기. used에 있는 것은 다시 고르지 않는다.
 * boxes: 고를 직육면체(주지 않으면 문항에 쓰는 것 모두)
 */
function pickNet(rng, used = new Set(), boxes = QUESTION_BOXES) {
  for (let guard = 0; guard < 200; guard += 1) {
    const dims = rng.pick(boxes);
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

/**
 * 까닭 문장. changed · opposite: 크기를 바꾼 면과 그 면이 마주 보는 면의 이름(문항이 알 때 — 길이까지 살펴요의 크기형).
 * 크기형은 problem.faces(짝이 남은 면)로 말하지 않는다: 바꾼 크기가 그 상자의 다른 면 크기와 같아지면 같은 크기가 세 장이 되어
 * "짝이 남은 면"이 바꾼 면이 아닐 수 있다(그 면은 문장의 맞은편 면과 마주 보지도 않는다).
 */
export function explainCuboidProblem(net, problem, { changed = null, opposite = null } = {}) {
  if (!problem) return '';
  const names = (problem.faces ?? []).map((id) => labelOf(net, id));
  if (problem.type === 'vertex-full') return '면이 한 점을 빈틈없이 둘러싸면 접을 수 없어요. 직육면체의 한 꼭짓점에는 면이 3개만 모여요.';
  if (problem.type === 'overlap') {
    const [a, b] = names.sort(byLabelOrder);
    return `${a} 면과 ${b} 면이 같은 자리에 겹쳐요. 그래서 다른 한쪽이 비어요.`;
  }
  if (problem.type === 'face-pair') {
    const tail = '직육면체에서 마주 보는 면은 모양과 크기가 같아요.';
    return changed && opposite ? `${changed} 면은 마주 보는 ${opposite} 면과 크기가 달라요. ${tail}` : `크기가 같은 면이 두 장씩 짝을 이루지 않아요. ${tail}`;
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
    const othersOf = (t) => segments.map((_, i) => i).filter((i) => i !== t && i !== pairs[t]);
    const nearOf = (t) => othersOf(t).filter((i) => cyclicNear(i, t, n));
    const sameOf = (t) => othersOf(t).filter((i) => !cyclicNear(i, t, n) && Math.abs(segments[i].length - segments[t].length) < 1e-9);
    // 길이가 같은 다른 선분(바로 옆이 아닌 것)이 있는 물음을 먼저 고른다: "길이가 같은 선분"만 찾아서는 맞힐 수 없게
    const tricky = far.filter((t) => sameOf(t).length > 0);
    // 정답 보기가 놓일 자리(보기는 테두리 순서로 늘어놓는다)를 먼저 정한다: 네 자리에 고르게 나와야 "끝 보기"처럼 자리로 찍어서 맞힐 수 없다
    const want = rng.int(0, 3);
    let chosen = null;
    let spare = null;
    for (const t of rng.shuffle(tricky.length > 0 ? tricky : far)) {
      // 오답 보기 3개: 바로 옆 선분 하나는 꼭 넣고(오개념 "가까이 있는 선분끼리 만난다"), 길이가 같은 선분, 나머지는 아무 선분
      const sets = [];
      for (const a of nearOf(t)) {
        for (const b of (sameOf(t).length > 0 ? sameOf(t) : [null])) {
          const base = [a, b].filter((v) => v != null);
          const free = othersOf(t).filter((i) => !base.includes(i));
          if (base.length === 2) for (const c of free) sets.push([...base, c]);
          else for (let i = 0; i < free.length; i += 1) for (let j = i + 1; j < free.length; j += 1) sets.push([...base, free[i], free[j]]);
        }
      }
      const fit = sets.filter((set) => set.filter((i) => i < pairs[t]).length === want);
      spare ??= { target: t, picked: rng.pick(sets) }; // 그 자리가 되는 물음이 없을 때 쓴다
      if (fit.length === 0) continue;
      chosen = { target: t, picked: rng.pick(fit) };
      break;
    }
    const { target, picked } = chosen ?? spare;
    const answer = pairs[target];
    const near = nearOf(target);
    const same = sameOf(target);
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
  // 알맞은 카드가 세 장 가운데 몇 번째로 큰 카드일지 문항마다 먼저 정한다(0 가장 큼 · 1 가운데 · 2 가장 작음):
  // 고르게 나와야 "가운데 크기 카드"처럼 크기 순서로 찍어서 맞힐 수 없다. 그 순위가 되는 전개도를 찾을 때까지 전개도를 바꿔 가며 찾는다
  // (전개도마다 순위를 다시 정하면, 만들기 어려운 순위 — 가장 작은 카드 — 가 덜 나온다).
  // 직육면체도 문항마다 먼저 정한다: 상자마다 순위가 고르게 나와야 "이 상자는 가장 작은 카드"처럼 찍을 수 없다
  let rank = rng.int(0, 2);
  let box = rng.pick(QUESTION_BOXES);
  let misses = 0;
  for (let guard = 0; questions.length < stage.count && guard < 8000; guard += 1) {
    const tried = new Set(used);
    const { id, dims, net } = pickNet(rng, tried, misses < 400 ? [box] : QUESTION_BOXES);
    const rects = net.faces.map(faceRect);
    const classes = [[dims[0], dims[1]], [dims[1], dims[2]], [dims[0], dims[2]]];
    const isClass = (w, h) => classes.some(([p, q]) => (p === w && q === h) || (p === h && q === w));
    let made = null;
    for (const leaf of rng.shuffle(leavesOf(net))) {
      const L = leaf.along;
      const M = leaf.out;
      // 길이 하나만 다른 카드: 맞닿는 변은 같고 나머지 변이 1 cm 다르다(그 직육면체의 어떤 면과도 크기가 다르게)
      const offs = [M - 1, M + 1].filter((v) => v >= 1 && v !== L && !isClass(L, v));
      // 크기가 다른 면: 그 직육면체의 다른 면(이웃한 면과 같은 크기)
      const otherClass = classes.filter(([p, q]) => !((p === L && q === M) || (p === M && q === L)));
      const parentRect = rects[leaf.parent];
      const combos = [];
      for (const off of offs) for (const other of otherClass) combos.push([off, other]);
      for (const [off, other] of rng.shuffle(combos)) {
        const bigger = Number(L * off > L * M) + Number(other[0] * other[1] > L * M);
        if (misses < 800 && bigger !== rank) continue; // 아주 오래 못 찾으면 상자를, 그래도 못 찾으면 순서를 따지지 않는다
        const cards = [
          { kind: 'answer', w: L, h: M },
          { kind: 'length', w: L, h: off },
          { kind: 'pair', w: other[0], h: other[1] },
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
      if (made) break;
    }
    if (!made) {
      misses += 1;
      continue;
    }
    used.add(id);
    rank = rng.int(0, 2);
    box = rng.pick(QUESTION_BOXES);
    misses = 0;
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
      // 크기형: 까닭 문장이 말할 두 면(바꾼 면 · 그 맞은편)이 고친 전개도를 접었을 때도 마주 보고, 크기가 정말 다른 것만 쓴다
      if (kind === 'pair' && !facesOpposite(made, extra.changed, extra.opposite)) return;
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
      const changed = net.faces[leaf.index].label;
      const opposite = labelOf(net, oppositeFace(net, net.faces[leaf.index].id));
      for (const depth of [leaf.out - 1, leaf.out + 1]) {
        if (depth >= 1) add(attachRect(rects[leaf.parent], leaf.side, leaf.along, depth), leaf.parent, { changed, opposite });
      }
    }
  }
  return out;
}

/** 이름이 a · b인 두 면이 접었을 때 마주 보고(법선이 반대) 크기가 다른가 */
function facesOpposite(net, a, b) {
  const fa = net.faces.find((f) => f.label === a);
  const fb = net.faces.find((f) => f.label === b);
  if (!fa || !fb || oppositeFace(net, fa.id) !== fb.id) return false;
  const size = (f) => {
    const r = faceRect(f);
    return [Math.min(r.w, r.h), Math.max(r.w, r.h)].join('×');
  };
  return size(fa) !== size(fb);
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
      let item = { net, problems: [], changed: null, opposite: null };
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
        // 크기형: 크기를 바꾼 면과 그 면이 마주 보는 면의 이름 (까닭 문장이 이 두 면을 말한다)
        changed: item.changed ?? null,
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
  const why = explainCuboidProblem(net, problem, { changed: question.changed, opposite: question.opposite });
  if (correct) return { correct, expected, tag: null, message: `맞아요! ${why}` };
  return { correct, expected, tag: CUBOID_TAG_OF_PROBLEM[problem.type] ?? TAGS.edgeLength, message: why };
}

/** 살펴볼 거리(틀렸을 때 쪽지 아래 한 줄) */
export function cuboidJudgeTip(question) {
  if (question.intended === 'overlap') return '빗금 친 면과 점선(비어요)을 찾아보고, 돌려 보기로 빈 자리를 확인해요.';
  if (question.intended === 'length') return '같은 무늬로 표시한 두 변에 적힌 길이를 견줘 봐요.';
  if (question.intended === 'pair') return '펴서 마주 보는 두 면에 적힌 길이를 견줘 봐요.'; // 접은 채로는 길이 글자가 뒤집히고 맞은편 면이 뒤에 있다 (spec 16-15)
  return '';
}

export const CUBOID_MAKERS = {
  edge: makeEdgeQuestions,
  face: makeFaceQuestions,
  cjudge: makeCJudgeQuestions,
  cfree: () => [], // 직접 만드는 단계는 문항이 없다
  cdex: () => [], // 도전 주문서(직육면체 도감 주문)도 학생이 직접 만든다
};

// ── 4단계: 내 맘대로 직육면체 전개도 (cuboid-free, spec 16-2 · 예상 없이 접는다 16-12 · 상자 크기 정하기 16-16) ──────────
/** 처음 상자의 세 모서리(cm)와 그 면 카드 여섯 장: 크기가 같은 면이 두 장씩. 1 cm 격자 판에 54가지가 모두 들어가는 크기 */
export const FREE_BOX = Object.freeze([1, 2, 3]);
export const FREE_CARDS = Object.freeze([
  { label: '가', w: 3, h: 2 }, { label: '나', w: 3, h: 2 },
  { label: '다', w: 3, h: 1 }, { label: '라', w: 3, h: 1 },
  { label: '마', w: 2, h: 1 }, { label: '바', w: 2, h: 1 },
]);
/** 놓는 판(1 cm 칸): 처음 상자는 보통 12칸 × 8줄(54가지가 모두 들어간다), 휴대폰(560px 이하) 10칸 × 9줄. 다른 상자는 boxBoard */
export const CUBOID_BOARDS = Object.freeze({ wide: { cols: 12, rows: 8 }, phone: { cols: 10, rows: 9 } });
/** 이번 판에서 끝낼 수 있는 가지 수 · 별 3개를 받는 가지 수 */
export const CUBOID_FREE_GOAL = 2;
export const CUBOID_FREE_FULL = 3;
/** 찾은 전개도를 이 기기에 적어 두는 모음(main.js collections, 화면에는 보이지 않는 quiet 모음)의 id: 세 길이가 모두 다른 상자 54가지 */
export const CUBOID_NETS_ID = 'cuboid-nets';
/** 두 길이가 같은 상자의 전개도 29가지 모음(조용한 모음) · 정육면체 상자는 1차시의 정육면체 전개도 도감(11칸)에 넣는다 */
export const CUBOID_PAIR_NETS_ID = 'cuboid-pair-nets';
export const CUBE_NETS_ID = 'cube-nets';
/**
 * 점수 상한 (사용자 결정 2026-10-11 · 2026-10-16): 이 기기에서 처음 찾는 직육면체 전개도(세 길이가 다른 것 + 두 길이가 같은 것을 합쳐서)
 * CUBOID_FULL_SCORE_NETS가지까지는 만들기 성공(엔진 규칙: +2 · 연속) + 등록 +5, 그 뒤로는 새로 찾을 때마다 모두 합쳐 CUBOID_LATER_XP점
 * (만들기 성공 점수도 따로 없다). 54 + 29 = 83가지를 다 찾아도 10 × 7 + 73 × 1 = 143점(+ 연속 · 단계 점수) — 어떤 순서로, 몇 판에 나눠 찾아도 같다.
 * 몇 번째인지는 두 모음에 든 가지 수를 합쳐 센다(엔진 모음의 xpAfter.with와 같은 값). 정육면체 상자로 찾은 것은 정육면체 도감의 규칙(상한 없음)
 */
export const CUBOID_FULL_SCORE_NETS = 10;
export const CUBOID_LATER_XP = 1;
/** 이 기기에서 count번째로 찾은 직육면체 전개도가 상한 뒤의 것인가 (점수는 등록 CUBOID_LATER_XP뿐) */
export const isLaterNet = (count) => count > CUBOID_FULL_SCORE_NETS;
export const CUBOID_FREE_EXPECTED = '전개도';
export const CUBOID_HINT_AFTER_INVALID = 2;
export const CUBOID_FREE_REPLAY_NOTE = '처음 찾은 전개도는 점수를 받아요. 찾아본 전개도는 다시 만들어도 점수가 없어요.';
/** 보너스 쪽지에 덧붙이는 말: 상한 뒤(11번째부터)의 새 전개도는 1점씩이다 */
export const CUBOID_LATER_NOTE = `${CUBOID_FULL_SCORE_NETS}가지를 넘으면 새 전개도마다 ${CUBOID_LATER_XP}점이에요.`;
export const CUBOID_NOTE_BEFORE_PICK = '접어 보니 직육면체가 안 돼요. 왜 그런지 골라 볼까요?';
/** 놓는 판 아래 안내 (접기 전). 까닭 낱말을 쓰지 않는다 — 까닭을 고르는 동안에도 문서에 남는 글이다 */
export const CUBOID_FOLD_NOTES = Object.freeze({
  count: '면 6장을 모두 놓으면 접어 볼 수 있어요.',
  apart: '떨어진 면이 있어요. 전개도는 한 장으로 이어져 있어야 접을 수 있어요.',
  ready: '놓은 그대로 접혀요. 서로 다른 전개도를 찾아봐요.',
});

// ── 상자 크기 (spec 16-16): 가로 · 세로 · 높이를 1~4 cm에서 고르면 그 상자의 면 6장이 카드로 나온다 ─────────────
export const BOX_MIN = 1;
export const BOX_MAX = 4;
export const BOX_AXES = Object.freeze(['가로', '세로', '높이']);
/** 처음 상자 [가로, 세로, 높이](cm): 면 카드가 FREE_CARDS와 같다(1 · 2 · 3 cm 직육면체 — 가 나 3×2, 다 라 3×1, 마 바 2×1) */
export const DEFAULT_BOX = Object.freeze([3, 2, 1]);
export const sameBox = (p, q) => p.length === 3 && q.length === 3 && p.every((v, i) => v === q[i]);
/** 상자 종류: 세 길이가 모두 다름 · 두 길이가 같음 · 셋이 같음(정육면체) */
export function boxKind(dims) {
  const n = new Set(dims).size;
  if (n === 3) return 'distinct';
  return n === 2 ? 'pair' : 'cube';
}
/**
 * 상자 종류마다: 서로 다른 전개도 수, 표준 모양(길이 순서로 맞춘 상자 — 전개도 이름은 이 상자에서 정한다), 넣는 모음.
 * 같은 종류 안에서는 실제 길이가 달라도 짧은 · 가운데 · 긴 모서리(두 길이가 같으면 같은 길이 · 다른 길이)의 자리가 같은 전개도가 같은 전개도다
 */
export const BOX_KINDS = Object.freeze({
  distinct: Object.freeze({ count: 54, canon: Object.freeze([1, 2, 3]), collection: CUBOID_NETS_ID }),
  pair: Object.freeze({ count: 29, canon: Object.freeze([1, 1, 2]), collection: CUBOID_PAIR_NETS_ID }),
  cube: Object.freeze({ count: 11, canon: Object.freeze([1, 1, 1]), collection: CUBE_NETS_ID }),
});

/** 표준 모양과 견주게 세 길이를 늘어놓는다: 세 길이가 다르면 짧은 것부터, 두 길이가 같으면 [같은 길이, 같은 길이, 다른 길이] */
export function boxArrangement(dims) {
  const kind = boxKind(dims);
  if (kind === 'distinct') return [...dims].sort((a, b) => a - b);
  if (kind === 'cube') return [dims[0], dims[0], dims[0]];
  const p = dims.find((v) => dims.filter((w) => w === v).length === 2);
  return [p, p, dims.find((v) => v !== p)];
}

/** 면 카드 여섯 장 [{ label, w, h }](w ≥ h): 가 나 = 가로×세로(윗면·아랫면), 다 라 = 가로×높이(앞면·뒷면), 마 바 = 세로×높이(옆면 둘) */
export function boxCards(dims) {
  const [a, b, c] = dims;
  const card = (label, p, q) => ({ label, w: Math.max(p, q), h: Math.min(p, q) });
  return [card('가', a, b), card('나', a, b), card('다', a, c), card('라', a, c), card('마', b, c), card('바', b, c)];
}

/** 화면에 적는 상자 크기: "가로 3 cm · 세로 2 cm · 높이 1 cm" */
export const boxText = (dims) => dims.map((v, i) => `${BOX_AXES[i]} ${v} cm`).join(' · ');
/** 학습 기록에 덧붙이는 상자 크기(처음 상자가 아닐 때만): " (상자 3×2×1 cm)" */
const boxNote = (dims) => (sameBox(dims, DEFAULT_BOX) ? '' : ` (상자 ${dims.join('×')} cm)`);
/** 면 카드 안내: "3×2 cm 두 장 · 3×1 cm 두 장 · 2×1 cm 두 장" (크기가 같은 쌍은 합친다: "2×2 cm 여섯 장") */
export function boxCardsText(dims) {
  const counts = new Map();
  for (const c of boxCards(dims)) counts.set(`${c.w}×${c.h} cm`, (counts.get(`${c.w}×${c.h} cm`) ?? 0) + 1);
  const word = { 2: '두 장', 4: '네 장', 6: '여섯 장' };
  return [...counts].map(([size, n]) => `${size} ${word[n]}`).join(' · ');
}
/**
 * 상자 크기를 고를 때의 안내: 세 길이가 같으면 정육면체(그대로 만들 수 있다). 도감 주문은 세 길이가 모두 달라야 한다 → { text, block }
 */
export function boxNotice(dims, { dex = false } = {}) {
  const kind = boxKind(dims);
  if (dex && kind !== 'distinct') return { text: '도감 주문은 세 모서리의 길이가 모두 달라야 해요.', block: true };
  if (kind === 'cube') return { text: '세 모서리의 길이가 모두 같으면 정육면체예요. 정육면체도 직육면체라 그대로 만들 수 있어요.', block: false };
  return null;
}
/**
 * 판이 좁을 때(휴대폰 — 교실 기기가 아니다)의 안내: 그 상자의 전개도 가운데 판에 들어가는 것이 하나도 없으면 고를 수 없고(block),
 * 일부만 들어가면 몇 가지인지 알린다 → { text, block } | null
 */
export function boxBoardNotice(dims, board) {
  const list = boxCatalog(dims).list;
  const fit = list.filter((n) => centerOnBoard(n.net, board)).length;
  if (fit === list.length) return null;
  if (fit === 0) return { text: '이 화면의 판에는 이 상자의 전개도가 들어가지 않아요. 더 작은 상자를 골라요.', block: true };
  return { text: `이 화면의 판에는 이 상자의 전개도 ${list.length}가지 가운데 ${fit}가지만 들어가요.`, block: false };
}

/** 힌트 글: 가장 긴 모서리끼리 이어 네 장을 한 줄로 → 남은 두 장을 위와 아래에 (처음 상자는 지금까지의 글과 같다) */
export function boxHintText(dims) {
  if (boxKind(dims) === 'cube') return '면 네 장을 한 줄로 이어 놓고, 남은 두 장을 그 줄의 위와 아래에 하나씩 붙여 봐요.';
  return `길이가 ${Math.max(...dims)} cm인 변끼리 이어 네 장을 한 줄로 놓고, 남은 작은 면 두 장을 위와 아래에 붙여 봐요.`;
}
export const CUBOID_HINT_TEXT = boxHintText(DEFAULT_BOX);

// 펼치는 방법(신장 트리)은 상자의 길이와 상관없이 같다: 면 6개 · 모서리 12개의 짜임이 같기 때문이다 — 그래서 트리로 크기가 다른 상자의 전개도를 잇는다
let trees = null;
const boxTrees = () => (trees ??= spanningTrees(cuboid(1, 2, 3)));
const unfoldCache = new Map();
/** 세 길이를 늘어놓은 상자(arr)를 트리마다 펼친 전개도와 그 열쇠 [{ key, net }] (트리 순서) */
function unfoldings(arr) {
  const name = arr.join('x');
  if (!unfoldCache.has(name)) {
    const solid = cuboid(...arr);
    unfoldCache.set(name, boxTrees().map((tree) => {
      const net = unfold(solid, tree);
      return { key: netKey(net), net };
    }));
  }
  return unfoldCache.get(name);
}

/** 정육면체 도감의 이름(1-4-1a …): 한 변이 1인 정육면체 전개도의 칸 모양으로 찾는다 */
const CUBE_NAME_BY_SHAPE = new Map(CUBE_NETS.map((n) => [shapeKey(n.cells), n.name]));
const cubeNameOf = (net) => CUBE_NAME_BY_SHAPE.get(shapeKey(net.faces.map((f) => {
  const r = faceRect(f);
  return [r.x, r.y];
}))) ?? null;

const canonCache = new Map();
/** 표준 모양에서 트리마다의 전개도 이름: 세 길이가 다르면 '123-01'…, 두 길이가 같으면 '112-01'…, 정육면체는 정육면체 도감의 이름 */
function canonIds(kind) {
  if (!canonCache.has(kind)) {
    const canon = BOX_KINDS[kind].canon;
    const byKey = kind === 'cube' ? null : new Map(cuboidNets(canon).map((n) => [n.key, n.id]));
    canonCache.set(kind, unfoldings(canon).map(({ key, net }) => (byKey ? byKey.get(key) : cubeNameOf(net)) ?? null));
  }
  return canonCache.get(kind);
}

const catalogCache = new Map();
/**
 * 그 상자의 서로 다른 전개도 모두: { kind, byKey(그 상자에서 놓은 모양의 열쇠 → 표준 이름), list: [{ id, key, net, size }] }.
 * list는 표준 이름 순서(이름마다 하나 — 그 상자의 크기로 펼친 모습). 크기를 바꿔도 같은 모양이면 같은 이름이다
 */
export function boxCatalog(dims) {
  const arr = boxArrangement(dims);
  const name = arr.join('x');
  if (!catalogCache.has(name)) {
    const kind = boxKind(arr);
    const ids = canonIds(kind);
    const byKey = new Map();
    const byId = new Map();
    unfoldings(arr).forEach(({ key, net }, i) => {
      const id = ids[i];
      if (byKey.has(key) && byKey.get(key) !== id) throw new Error(`${name} 상자: 같은 모양에 이름이 둘이에요 (${byKey.get(key)}, ${id}).`);
      byKey.set(key, id);
      if (!byId.has(id)) {
        const [w, h] = netSize(net);
        byId.set(id, { id, key, net, size: [Math.max(w, h), Math.min(w, h)] });
      }
    });
    const list = [...byId.values()].sort((p, q) => (p.id < q.id ? -1 : p.id > q.id ? 1 : 0));
    catalogCache.set(name, { kind, byKey, list });
  }
  return catalogCache.get(name);
}

/**
 * 놓는 판의 크기(1 cm 칸): 그 상자의 전개도가 모두 들어가는 가장 작은 판(가장 긴 전개도의 길이 × 가장 넓은 폭), 7칸 × 5줄보다 작게는 하지 않는다.
 * 처음 상자(1 · 2 · 3 cm)는 지금까지와 같은 12칸 × 8줄. 휴대폰(phone)은 처음 상자만 10칸 × 9줄, 다른 상자는 12칸을 넘지 않게(들어가지 않는 전개도가 있다)
 */
export function boxBoard(dims, { phone = false } = {}) {
  const same = boxArrangement(dims).join() === boxArrangement(DEFAULT_BOX).join();
  if (same) return phone ? CUBOID_BOARDS.phone : CUBOID_BOARDS.wide;
  const { list } = boxCatalog(dims);
  const long = Math.max(...list.map((n) => n.size[0]));
  const short = Math.max(...list.map((n) => n.size[1]));
  const wide = { cols: Math.max(long, 7), rows: Math.max(short, 5) };
  return phone ? { cols: Math.min(wide.cols, 12), rows: Math.min(Math.max(wide.rows, 9), 12) } : wide;
}

/** 놓은 모양의 전개도 이름(그 상자의 종류에서). 전개도가 아니면 null */
export function boxNetId(net, dims) {
  return boxCatalog(dims).byKey.get(netKey(net)) ?? null;
}

/** 내 맘대로 직육면체 전개도에서 찾을 수 있는 전개도 54가지 (세 길이가 다른 상자의 모음 칸) */
export const freeNets = () => cuboidNets(FREE_BOX);
/**
 * 모음의 칸 수와 칸 id. 게임을 열 때마다 전개도를 펼쳐 보지 않고도 모음을 만들 수 있게 따로 적는다
 * (freeNets() · boxCatalog의 이름과 같은지는 단위 테스트가 본다)
 */
export const FREE_NET_COUNT = 54;
export const freeNetIdAt = (i) => `${FREE_BOX.join('')}-${String(i + 1).padStart(2, '0')}`;
export const PAIR_NET_COUNT = 29;
export const pairNetIdAt = (i) => `${BOX_KINDS.pair.canon.join('')}-${String(i + 1).padStart(2, '0')}`;
/** 놓은 모양의 전개도 번호(처음 상자 54가지 가운데). 전개도가 아니면 null */
export function freeNetId(net) {
  const key = netKey(net);
  return freeNets().find((n) => n.key === key)?.id ?? null;
}

const rectNet = (rects, dims = DEFAULT_BOX) => fromRects(rects, { labels: rects.map((r, i) => r.label ?? LABELS[i]), dims });

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

/** 이 기기에서 찾은 전개도: 배열·Set(세 길이가 다른 상자의 것)이나 { distinct, pair, cube } */
function foundSets(found) {
  if (found instanceof Set || Array.isArray(found)) return { distinct: new Set(found), pair: new Set(), cube: new Set() };
  return { distinct: new Set(found?.distinct ?? []), pair: new Set(found?.pair ?? []), cube: new Set(found?.cube ?? []) };
}

/**
 * 놓은 대로 접은 한 번의 판정. 판정은 판별 단계와 같은 checkNet. dims: 만든 상자 [가로, 세로, 높이](처음 상자가 기본)
 * seen: 이번 판에서 접어 본 모양(shape), found: 이 기기에서 찾은 전개도 이름(foundSets)
 * → { net, key, shape(이번 판의 같은 모양 열쇠 — 되는 전개도는 상자 종류 안의 이름, 크기만 바꿔 다시 접어도 같다), id(전개도 이름), box(상자 종류),
 *     valid, problems, correct, tag, kind: 'new' | 'known' | 'repeat' | 'invalid', log, title, message, given }
 */
export function judgeCuboidFree({ rects, dims = DEFAULT_BOX, seen = new Set(), found = new Set() }) {
  const box = boxKind(dims);
  const known = foundSets(found)[box];
  const net = rectNet(rects, dims);
  const { ok, problems } = checkNet(net);
  const key = netKey(net);
  const id = ok ? boxNetId(net, dims) : null;
  const shape = id ?? `x:${boxArrangement(dims).join('x')}:${key}`;
  const repeat = seen.has(shape);
  const problem = ok ? null : primaryCuboidProblem(problems);
  const tag = ok ? null : (CUBOID_TAG_OF_PROBLEM[problem?.type] ?? TAGS.edgeLength);
  let kind = 'invalid';
  if (repeat) kind = 'repeat';
  else if (ok) kind = known.has(id) ? 'known' : 'new';
  let title;
  let message;
  if (kind === 'repeat') {
    title = '이미 접어 본 모양';
    message = '이번에 이미 접어 본 모양이에요. 돌리거나 뒤집어도, 크기만 바꿔도 같은 모양이라 다시 세지 않아요. 다른 모양을 만들어 봐요.';
  } else if (kind === 'new') {
    title = '새 전개도 발견';
    message = box === 'cube'
      ? '처음 찾은 정육면체 전개도예요. 1차시의 전개도 도감에 넣었어요.'
      : '처음 찾은 전개도예요. 접으면 맞닿는 모서리의 길이가 모두 같아요.';
  } else if (kind === 'known') {
    title = box === 'cube' ? '정육면체가 돼요' : '직육면체가 돼요';
    message = '전에 찾은 전개도와 같은 모양이에요. 돌리거나 뒤집으면 똑같아요.';
  } else {
    title = '직육면체가 안 돼요';
    message = explainCuboidProblem(net, problem);
  }
  const given = `${ok ? `전개도 ${id ?? ''}`.trim() : `안 됨: ${tag}`}${boxNote(dims)}`;
  return { net, key, shape, id, box, valid: ok, problems, correct: ok, tag, kind, log: !repeat, title, message, given };
}

/**
 * 한 판의 흐름 (순수 상태). 화면(cuboid-free.js)과 점수 테스트가 같은 규칙을 쓴다.
 * found · foundPair · foundCube: 이 기기에서 찾은 전개도(세 길이가 다른 상자 · 두 길이가 같은 상자 · 정육면체 도감), box: 처음 상자,
 * dex: 도감 주문(세 길이가 다른 상자의 54칸을 모두 채우면 끝)
 * setBox(dims) → 상자를 바꾼다(이번 판에 찾은 것·접어 본 모양은 그대로 — 같은 모양을 크기만 바꿔 다시 접으면 다시 세지 않는다)
 * fold(rects) → judgeCuboidFree 결과 + { itemId(기록할 때), collect: { id(모음), item, isNew }(되는 전개도를 처음 찾았을 때 모음에 넣을 칸),
 *   first(이 기기에서 처음 찾은 전개도 — 점수는 이때만), later(처음 찾았지만 직육면체 상한 뒤의 것 — 등록 1점뿐이고 만들기 성공 점수는 없다),
 *   explainable(안 되는 모양: 까닭 고르기), fixed(안 된 뒤 바로 전개도를 만듦), found(이번 판에 찾은 가지 수),
 *   total(이 기기에서 찾은 직육면체 전개도 — 세 길이가 다른 것과 두 길이가 같은 것을 합친 수, 상한을 세는 수), kindCount(그 상자 종류의 모음에 든 수),
 *   dexCount(세 길이가 다른 상자의 54칸에 든 수), done(끝낼 수 있음), full(별 3개만큼 찾음) }
 * 안 되는 모양은 끝없이 많아 "모양마다 한 번"을 적어 둘 수 없다 → 안 되는 모양에는 점수가 없다(기록·까닭 고르기·표시는 그대로).
 */
export function createCuboidFreeSession({
  stageId = 'cuboid-free', goal = CUBOID_FREE_GOAL, found = [], foundPair = [], foundCube = [], box = DEFAULT_BOX, dex = false,
} = {}) {
  const seen = new Set(); // 이번 판에서 접어 본 모양
  const foundNow = new Set(); // 이번 판에서 찾은 전개도 (이름은 상자 종류마다 겹치지 않는다: 123-… · 112-… · 1-4-1a …)
  const device = { distinct: new Set(found), pair: new Set(foundPair), cube: new Set(foundCube) };
  const history = [];
  let dims = [...box];
  let seq = 0;
  let invalidRun = 0;
  const cuboidCount = () => device.distinct.size + device.pair.size;
  const isDone = () => (dex ? device.distinct.size >= FREE_NET_COUNT : foundNow.size >= goal);
  return {
    setBox(next) {
      dims = [...next];
    },
    box: () => [...dims],
    fold(rects) {
      const r = judgeCuboidFree({ rects, dims, seen, found: device });
      const prev = history.at(-1);
      let itemId = null;
      let collect = null;
      if (r.log) {
        seq += 1;
        itemId = `${stageId}:${seq}:${r.valid ? r.id : 'x'}`;
        seen.add(r.shape);
      }
      if (r.valid) {
        foundNow.add(r.id);
        if (r.kind === 'new') collect = { id: BOX_KINDS[r.box].collection, item: r.id, isNew: !device[r.box].has(r.id) };
        device[r.box].add(r.id);
        invalidRun = 0;
      } else invalidRun += 1;
      const first = Boolean(collect?.isNew);
      const step = {
        ...r,
        dims: [...dims],
        itemId,
        collect,
        first,
        later: first && r.box !== 'cube' && isLaterNet(cuboidCount()),
        explainable: r.kind === 'invalid',
        fixed: r.valid && r.kind !== 'repeat' && Boolean(prev && !prev.valid),
        found: foundNow.size,
        total: cuboidCount(),
        kindCount: device[r.box].size,
        dexCount: device.distinct.size,
        done: isDone(),
        full: foundNow.size >= CUBOID_FREE_FULL,
        invalidRun,
      };
      history.push(step);
      return step;
    },
    found: () => new Set(foundNow),
    /** 이 기기에서 찾은 전개도: 상자 종류(kind)마다. 주지 않으면 세 길이가 다른 상자의 것 */
    device: (kind = 'distinct') => new Set(device[kind]),
    done: isDone,
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

// ── 도전 주문서 "직육면체 도감 주문" (cuboid-dex, spec 16-16): 세 길이가 다른 상자의 전개도 54칸을 여러 번에 나눠 채운다 ──────────
export const CUBOID_DEX_COUNT = FREE_NET_COUNT;
/** 도감에 찾은 가지 수 → 별: 10가지 ★1, 20가지 ★2, 30가지 ★3 (사용자 결정 2026-10-16) */
export const CUBOID_DEX_STAR_AT = Object.freeze([10, 20, 30]);
export const cuboidDexStars = (count) => CUBOID_DEX_STAR_AT.filter((n) => count >= n).length;
/** 다음 별을 받는 가지 수 (별 3개면 null) */
export const cuboidDexNextStar = (count) => CUBOID_DEX_STAR_AT.find((n) => count < n) ?? null;
/** 결과 화면의 별 기준 안내 (별 3개가 안 될 때): 다음 별까지 몇 가지 + 기준 */
export function cuboidDexStarNote(count) {
  const next = cuboidDexNextStar(count);
  if (next == null) return null;
  return `도감 ${next}가지를 채우면 별 ${cuboidDexStars(count) + 1}개예요(10가지 별 1개 · 20가지 별 2개 · 30가지 별 3개). 찾은 전개도는 다음에도 이어져요.`;
}
/** 새 전개도로 별이 하나 늘었을 때 쪽지에 덧붙이는 말 (10 · 20가지. 30가지는 별 3개, 54가지는 완성 문장이 따로 있다) */
export function cuboidDexMilestone(before, after) {
  const stars = cuboidDexStars(after);
  if (stars <= cuboidDexStars(before)) return '';
  if (stars >= CUBOID_DEX_STAR_AT.length) return `도감 ${after}가지! 이제 끝내도 별 3개를 받아요.`;
  return `도감 ${after}가지! 지금 끝내도 별 ${stars}개를 받아요.`;
}
/** 도감 주문 결과의 기록 칸 */
export const cuboidDexStats = (sum) => [
  { label: '새로 찾은 전개도', value: `${sum.newNets}가지` },
  { label: '접어 본 모양', value: `${sum.shapes}가지` },
];
/** 도감 주문 결과 "오늘의 솜씨" 칸: 첫 칸은 도감 수(별의 기준) + 이번 판에 새로 찾은 전개도의 점수 */
export function cuboidDexHighlights(sum, { earned, dexCount }) {
  const next = cuboidDexNextStar(dexCount);
  return [
    { icon: 'book', label: '직육면체 전개도 도감', value: `${dexCount} / ${CUBOID_DEX_COUNT}`, xp: earned.answer + earned.nets },
    next != null ? { icon: 'star', label: '다음 별까지', value: `${next - dexCount}가지` } : { icon: 'star', label: '도감을 다 채우기까지', value: `${CUBOID_DEX_COUNT - dexCount}가지` },
    { icon: 'undo', label: '고쳐서 다시 도전', value: `${sum.fixes}번` },
  ];
}

/**
 * 힌트 그림자: 이번 판에 아직 못 찾은 전개도 가운데 판에 들어가는 가장 작은 것(그 상자의 크기로).
 * 이 기기에서 아직 찾지 않은 것(deviceIds에 없는 것 — 점수를 받는 새 전개도)을 먼저 고른다 (정육면체의 hintNet과 같은 순서)
 */
export function cuboidHintNet(foundIds = new Set(), board = CUBOID_BOARDS.wide, deviceIds = new Set(), dims = DEFAULT_BOX) {
  const left = boxCatalog(dims).list.filter((n) => !foundIds.has(n.id) && centerOnBoard(n.net, board));
  const fresh = left.filter((n) => !deviceIds.has(n.id));
  return (fresh.length > 0 ? fresh : left).sort((p, q) => p.size[0] * p.size[1] - q.size[0] * q.size[1] || (p.id < q.id ? -1 : 1))[0] ?? null;
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

const solidNetCache = new Map();
/**
 * 상자를 접은 모습(상자 보기)에 쓰는 전개도: 그 상자를 펼친 것 가운데 가장 옹골찬 것(펼친 크기가 작을수록 접은 상자가 크게 보인다).
 * 면 id와 이름은 입체의 면 순서다 — f0 윗면(가) · f1 아랫면(나) · f2 앞면(다) · f3 뒷면(라) · f4 왼쪽 옆면(마) · f5 오른쪽 옆면(바), 카드와 같다
 */
export function boxSolidNet(dims) {
  const name = dims.join('x');
  if (!solidNetCache.has(name)) {
    const solid = cuboid(...dims);
    let best = null;
    for (const tree of boxTrees()) {
      const net = unfold(solid, tree);
      const [w, h] = netSize(net);
      const spread = Math.max(Math.max(w, h) / 1.9, Math.min(w, h));
      if (!best || spread < best.spread - 1e-9) best = { net, spread };
    }
    solidNetCache.set(name, { ...best.net, root: 'f1' }); // 아랫면을 바닥에: 윗면이 위, 높이가 세로로 선다
  }
  return solidNetCache.get(name);
}
