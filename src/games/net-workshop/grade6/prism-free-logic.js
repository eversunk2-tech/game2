/**
 * 전개도 완성하기 (prism-free, 설계 주문)의 규칙 (순수 함수 — 단계에 들어갈 때 받는 묶음). 화면은 grade6/play-pfree.js · edge-board.js.
 * 기획서: docs/games/net-workshop/spec-grade6.md 2-2절(prism-free 줄과 "전개도 그리기를 화면에서") · 4절 · 5절 · 6-4절 · 8절 · 15-2 · 15-25 · 15-26,
 * spec.md 16-2(모서리에 붙이기) · 16-8 · 16-9 · 16-12 · 16-14 · 16-15.
 *
 * 한 판: 시드가 각기둥 하나(삼각기둥 — 밑면이 정삼각형이 아닌 이등변삼각형 · 사각기둥 — 밑면이 직사각형이 아닌 등변사다리꼴 · 육각기둥)를 고른다.
 *   주문 ①: 밑면 하나 + 옆면 1~2장이 놓인 전개도에 남은 면 카드를 모서리에 붙여 완성 → [접어 보기]
 *   주문 ②: 다른 모양으로 한 번 더(밑면 하나만 놓여 있음) · 그 뒤로도 한 가지씩 더(별 3개까지 — 더 찾아도 된다)
 * 면 카드는 그 각기둥의 면 한 벌(모자라거나 남지 않는다). 카드는 돌리기만 하고 뒤집지 않는다 — 밑면을 좌우가 같은 모양(이등변삼각형 · 등변사다리꼴 ·
 *   정육각형)으로 골라 뒤집지 않아도 모든 전개도를 만들 수 있다(세 변이 다른 삼각형이면 두 밑면이 서로 뒤집힌 모양이라 뒤집기가 꼭 있어야 한다).
 * 붙이기: 카드의 "붙일 변"(돌리기로 고름)을 빈 모서리에 바깥쪽으로, 두 변의 가운데를 맞춰 붙인다(길이가 달라도 붙는다 — 접으면 "5 cm ≠ 3 cm").
 *   놓인 면과 펼친 그림에서 겹치는 자리에는 붙지 않는다(종이 위에 종이를 겹쳐 놓을 수 없다).
 * 판정: 놓인 대로 접는다(fold.js checkNet). 경첩마다 접는 각도는 입체에서 온다 — 처음부터 놓인 밑면을 입체의 아래 밑면으로 두고,
 *   경첩을 따라 이웃 면에게 "입체에서 그 모서리 건너편 면"을 차례로 준다(labelNet). 카드가 그 자리의 면과 종류가 달라도(밑면 자리에 옆면 등)
 *   그 자리로 접는다 — 접은 모습에서 겹침 · 빈 곳 · 길이가 다른 선분으로 보인다.
 * 같은 모양: 접어서 각기둥이 되는 전개도는 입체의 신장 트리 하나다. 입체의 대칭(밑면을 돌리기·뒤집기, 위아래 바꾸기)으로 묶은 가장 작은 트리 번호
 *   (canonicalCode)가 모양의 열쇠 — 돌리거나 뒤집어 겹치는 전개도는 같은 열쇠다(검사: 신장 트리를 모두 펼친 polyNetKey의 가짓수와 같다).
 *   그 열쇠들의 차례(prism-free-data.js — 검사가 다시 셈)가 이 기기의 "찾은 전개도" 모음 칸 번호다.
 */
import { hasFinalSound, josa } from '../../../shared/core/korean.js';
import { LABELS, checkNet, findHinges, solidEdges, spanningTree, spanningTrees } from '../fold.js';
import { bounds, centroid, convexIntersectionArea, cross, dot, interiorAngle, normalize, signedArea, sub } from '../geometry.js';
import { BASE_NAMES, PRISM_NAMES, flatOk, isoTrapezoid, polyNetKey, prismNet, prismSolid, regularPolygon, stripTree, triangleBySides } from '../solids.js';
import { PRISM_FREE_COLLECTION, PRISM_FREE_FULL, PRISM_FREE_FULL_SCORE, PRISM_FREE_GOAL, PRISM_FREE_LATER_UNTIL, PRISM_FREE_LATER_XP, PRISM_FREE_SOLIDS, PRISM_TAGS as TAGS, prismFreeItemId } from './prism-stages.js';
import { FREE_NET_CODES } from './prism-free-data.js';

const EPS = 1e-6;
const cm = (v) => `${Math.round(v * 100) / 100} cm`;
const tidy = (v) => {
  const r = Math.round(v * 1e9) / 1e9;
  return Object.is(r, -0) ? 0 : r;
};

// ── 각기둥 (길이는 모두 새로 정했다 — 교과서의 수치를 쓰지 않는다) ─────────────
/**
 * 나오는 각기둥: 종류마다 두 크기. 옆면 카드의 가로는 밑면의 변 길이, 세로는 높이 — 높이는 어느 변 길이와도 다르게(정사각형 카드가 없게).
 * id · 칸 수(count)는 바탕 묶음의 PRISM_FREE_SOLIDS와 같다(검사)
 */
const SHAPES = Object.freeze({
  'tri-a': { kind: 'tri', base: triangleBySides([4, 3, 3]), height: 3.5 },
  'tri-b': { kind: 'tri', base: triangleBySides([2, 3.5, 3.5]), height: 4 },
  'trap-a': { kind: 'trap', base: isoTrapezoid(4, 2, 2.5), height: 3 },
  'trap-b': { kind: 'trap', base: isoTrapezoid(4, 2.5, 2), height: 3 },
  'hex-a': { kind: 'hex', base: regularPolygon(6, 2), height: 3 },
  'hex-b': { kind: 'hex', base: regularPolygon(6, 2), height: 4 },
});
export const FREE_KINDS = Object.freeze(['tri', 'trap', 'hex']);
export const FREE_SHAPES = SHAPES;

/** id의 각기둥 → { id, kind, solid, n, lengths, height, name, baseName } */
export function freeSolid(id) {
  const shape = SHAPES[id];
  if (!shape) throw new Error(`없는 각기둥: ${id}`);
  const solid = prismSolid({ base: shape.base, height: shape.height });
  const n = solid.sides;
  const lengths = shape.base.map((p, i) => tidy(Math.hypot(shape.base[(i + 1) % n][0] - p[0], shape.base[(i + 1) % n][1] - p[1])));
  return { id, kind: shape.kind, solid, n, lengths, height: shape.height, name: PRISM_NAMES[n], baseName: BASE_NAMES[n] };
}

/** 각기둥 주문 글: "밑면의 세 변 4 cm · 3 cm · 3 cm, 높이 3.5 cm" (주문 그림 · 화면 읽기) */
export function solidText(fs) {
  const uniq = [...new Set(fs.lengths)];
  if (uniq.length === 1) return `밑면의 한 변 ${cm(uniq[0])}, 높이 ${cm(fs.height)}`;
  const count = { 3: '세', 4: '네', 5: '다섯', 6: '여섯' }[fs.n];
  return `밑면의 ${count} 변 ${fs.lengths.map(cm).join(' · ')}, 높이 ${cm(fs.height)}`;
}

// ── 면 카드 ─────────────────────────────────
/** 입체의 면 하나를 바깥에서 본 평면 그림(꼭짓점 차례 그대로) — 펼친 전개도의 면과 같은 돌림 방향 */
function faceFrame(face) {
  const [p0, p1, p2] = face.points;
  const u = normalize(sub(p1, p0));
  const nrm = normalize(cross(sub(p1, p0), sub(p2, p0)));
  const v = cross(nrm, u);
  return face.points.map((p) => [tidy(dot(sub(p, p0), u)), tidy(dot(sub(p, p0), v))]);
}

/**
 * 그 각기둥의 면 카드 한 벌: [{ id(f0 …), solid(입체의 면), role, label(가 …), poly(카드 모양 — 가운데가 (0, 0)), w, h, group }]
 * 옆면 카드: 가로(밑면의 변) × 세로(높이). group: 같은 크기의 옆면 카드끼리 같은 값(카드 칸에서 한 묶음 "×n")
 */
export function freeCards(fs) {
  return fs.solid.faces.map((face, i) => {
    const flat = faceFrame(face);
    const [cx, cy] = centroid(flat);
    const poly = flat.map(([x, y]) => [tidy(x - cx), tidy(y - cy)]);
    const side = face.role === 'side';
    const w = side ? tidy(Math.hypot(flat[1][0] - flat[0][0], flat[1][1] - flat[0][1])) : null;
    return { id: `f${i}`, solid: face.id, role: face.role, label: LABELS[i], poly, w, h: side ? fs.height : null, group: side ? `s:${w}` : `b:${face.id}` };
  });
}

/** 다각형 p가 q를 돌리거나 옮겨(뒤집지 않고) 겹치는가 — 붙일 변을 바꿔도 같은 모양이 되는 변을 거른다 */
function sameTurn(p, q) {
  const n = p.length;
  if (n !== q.length) return false;
  const shape = (poly) => poly.map((_, i) => [Math.hypot(poly[(i + 1) % n][0] - poly[i][0], poly[(i + 1) % n][1] - poly[i][1]), interiorAngle(poly, i)]);
  const a = shape(p);
  const b = shape(q);
  return a.every((x, i) => Math.abs(x[0] - b[i][0]) < EPS && Math.abs(x[1] - b[i][1]) < EPS);
}

/**
 * 붙일 변으로 고를 수 있는 변들: 그 변으로 붙였을 때 놓이는 모양이 서로 다른 것만(직사각형은 세로 변 · 가로 변 둘, 정육각형은 하나,
 * 이등변삼각형은 밑변 · 두 빗변 — 두 빗변은 서로 뒤집힌 모습으로 놓인다). 처음 고른 변: 옆면은 세로 변(높이), 밑면은 0번 변
 */
export function attachEdges(card) {
  const n = card.poly.length;
  const out = [];
  const rotated = (k) => card.poly.map((_, i) => card.poly[(i + k) % n]);
  for (let k = 0; k < n; k += 1) if (!out.some((j) => sameTurn(rotated(j), rotated(k)))) out.push(k);
  if (card.role === 'side') {
    // 옆면 카드의 꼭짓점: [아래 왼쪽, 아래 오른쪽, 위 오른쪽, 위 왼쪽] — 1번 변이 세로(높이) 변. 세로 변을 먼저
    return out.includes(1) ? [1, ...out.filter((k) => k !== 1)] : out;
  }
  return out;
}

// ── 놓기 ─────────────────────────────────
/**
 * 카드를 놓인 면의 변에 붙인 자리(cm): 카드의 edge번 변이 놓인 면의 그 변(p → q)과 반대 방향으로, 두 변의 가운데가 맞게(길이가 다르면 가운데 맞춤).
 * 놓인 면과 같은 돌림 방향이라 바깥쪽(놓인 면의 반대편)에 붙는다
 */
export function attachPoly(cardPoly, edge, [p, q]) {
  const n = cardPoly.length;
  const c0 = cardPoly[edge];
  const c1 = cardPoly[(edge + 1) % n];
  const turn = Math.atan2(p[1] - q[1], p[0] - q[0]) - Math.atan2(c1[1] - c0[1], c1[0] - c0[0]);
  const [c, s] = [Math.cos(turn), Math.sin(turn)];
  const mc = [(c0[0] + c1[0]) / 2, (c0[1] + c1[1]) / 2];
  const mt = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  return cardPoly.map(([x, y]) => {
    const [dx, dy] = [x - mc[0], y - mc[1]];
    return [tidy(mt[0] + dx * c - dy * s), tidy(mt[1] + dx * s + dy * c)];
  });
}

/** 두 선분이 한 직선 위에서 길이 > 0만큼 겹치나 */
function segmentsTouch(a1, a2, b1, b2) {
  const d = [a2[0] - a1[0], a2[1] - a1[1]];
  const L = Math.hypot(...d);
  if (L < EPS) return false;
  const u = [d[0] / L, d[1] / L];
  const off = (p) => Math.abs((p[0] - a1[0]) * u[1] - (p[1] - a1[1]) * u[0]);
  if (off(b1) > EPS || off(b2) > EPS) return false;
  const t1 = (b1[0] - a1[0]) * u[0] + (b1[1] - a1[1]) * u[1];
  const t2 = (b2[0] - a1[0]) * u[0] + (b2[1] - a1[1]) * u[1];
  return Math.min(L, Math.max(t1, t2)) - Math.max(0, Math.min(t1, t2)) > EPS;
}

/** 놓인 면들의 빈 모서리(다른 면의 변과 조금도 맞닿지 않은 변): [{ face, edge, p, q }] — 붙일 자리 */
export function freeEdges(placed) {
  const out = [];
  for (const f of placed) {
    f.poly.forEach((p, i) => {
      const q = f.poly[(i + 1) % f.poly.length];
      const used = placed.some((g) => g !== f && g.poly.some((r, j) => segmentsTouch(p, q, r, g.poly[(j + 1) % g.poly.length])));
      if (!used) out.push({ face: f.id, edge: i, p, q });
    });
  }
  return out;
}

/**
 * 붙일 수 있는 빈 모서리: 빈 모서리 가운데, 남은 카드(left) 가운데 어느 하나라도 어느 붙일 변으로든 펼친 그림에서 놓인 면과 겹치지 않게 붙는 것.
 * 다른 면 사이의 좁은 틈을 향한 변처럼 어떤 카드도 붙지 않는 변에는 붙일 자리를 두지 않는다 — 남은 카드 모두를 보고 정하므로
 * 고른 카드와 무관하고, 접어서 각기둥이 되는지와도 무관한 펼친 그림의 사정이다(어느 자리가 맞는지 알려 주지 않는다)
 */
export function openEdges(placed, left) {
  const kinds = [];
  for (const c of left) if (!kinds.some((k) => k.group === c.group)) kinds.push(c);
  return freeEdges(placed).filter((e) => kinds.some((card) => attachEdges(card).some((k) => !overlapsPlaced(attachPoly(card.poly, k, [e.p, e.q]), placed))));
}

/** 새 면이 놓인 면과 펼친 그림에서 겹치나 (넓이가 겹침 — 변이나 꼭짓점만 닿는 것은 괜찮다) */
export function overlapsPlaced(poly, placed) {
  return placed.some((g) => convexIntersectionArea(poly, g.poly) > 1e-6);
}

// ── 주문 만들기 (시드 ctx.rng로 재현) ───────────────────
/** 펼친 그림을 각도 turn만큼 돌린다(면의 차례·id는 그대로) */
function turnFaces(faces, turn) {
  const [c, s] = [Math.cos(turn), Math.sin(turn)];
  return faces.map((f) => ({ ...f, poly: f.poly.map(([x, y]) => [tidy(x * c - y * s), tidy(x * s + y * c)]) }));
}

/**
 * 띠 꼴 전개도(옆면 한 줄 + 위아래 밑면)를 주문의 바탕 그림(plan)으로: 띠가 가로(portrait면 세로)로 놓이게 돌린다.
 * 첫 주문에 놓아 둘 면은 이 그림의 아래 밑면 + 그 밑면이 붙은 옆면(+ 그 옆의 옆면 하나)
 */
function planNet(fs, rng) {
  for (let guard = 0; guard < 200; guard += 1) {
    const n = fs.n;
    const j = rng.int(0, n - 1);
    const tree = stripTree(fs.solid, { cut: rng.int(0, n - 1), top: rng.int(0, n - 1), bottom: j });
    const net = prismNet(fs.solid, tree);
    if (!flatOk(net)) continue;
    // 아래 밑면이 붙은 옆면의 밑변(0 → 1)이 가로가 되게
    const side = net.faces.find((f) => f.solid === `s${j}`);
    const angle = -Math.atan2(side.poly[1][1] - side.poly[0][1], side.poly[1][0] - side.poly[0][0]) + (rng.int(0, 1) === 0 ? 0 : Math.PI);
    return { faces: turnFaces(net.faces, angle), bottomSide: `s${j}` };
  }
  throw new Error('전개도 완성하기의 바탕 그림을 만들지 못했어요.');
}

/**
 * 한 판의 주문: { solidId, plan: [{ solid, poly }](다 놓은 띠 꼴 — 판의 크기를 정하는 데), given1: [입체의 면 id](주문 ①에 놓인 면), givenBase }.
 * portrait: 판이 세로로 긴 화면(휴대폰)이면 바탕 그림을 90° 돌린다 — 띠가 판의 긴 쪽으로 놓이게(시드가 같으면 문항은 같다)
 */
export function makeFreePlay(stage, rng, { portrait = false } = {}) {
  const kind = rng.pick(FREE_KINDS);
  const solidId = rng.pick(Object.keys(SHAPES).filter((id) => SHAPES[id].kind === kind));
  const fs = freeSolid(solidId);
  const plan = planNet(fs, rng);
  const n = fs.n;
  const j = Number(plan.bottomSide.slice(1));
  const extra = rng.int(0, 1) === 1 ? `s${(j + (rng.int(0, 1) === 0 ? 1 : n - 1)) % n}` : null;
  // 덧붙일 옆면은 띠에서 실제로 그 옆에 붙어 있을 때만(띠를 자른 자리면 붙어 있지 않다)
  const hinges = findHinges({ faces: plan.faces });
  const byId = new Map(plan.faces.map((f) => [f.solid, f.id]));
  const linked = extra && hinges.some((hg) => [hg.a, hg.b].includes(byId.get(extra)) && [hg.a, hg.b].includes(byId.get(plan.bottomSide)));
  const given1 = ['b0', plan.bottomSide, ...(linked ? [extra] : [])];
  let faces = plan.faces.map((f) => ({ solid: f.solid, poly: f.poly }));
  if (portrait) faces = turnFaces(faces, Math.PI / 2).map((f) => ({ solid: f.solid, poly: f.poly }));
  return { stageId: stage.id, solidId, plan: faces, given1, givenBase: 'b0' };
}

/** 주문 k(1부터)에 처음부터 놓여 있는 면 [{ id, solid, role, label, poly, given: true }] — 주문 ①은 밑면 + 옆면, 그 뒤는 밑면 하나 */
export function givenFaces(play, k) {
  const fs = freeSolid(play.solidId);
  const cards = freeCards(fs);
  const ids = k === 1 ? play.given1 : [play.givenBase];
  return ids.map((solidId) => {
    const card = cards.find((c) => c.solid === solidId);
    return { id: card.id, solid: solidId, role: card.role, label: card.label, poly: play.plan.find((f) => f.solid === solidId).poly, given: true };
  });
}

// ── 놓은 대로 접기: 면마다 입체의 어느 면 자리로 가는지 ─────────────────
/** 입체의 면 id → 꼭짓점 수, 그 면의 변 → 건너편 면과 그 면의 변 */
function solidLinks(solid) {
  const links = new Map(solid.faces.map((f) => [f.id, new Map()]));
  for (const e of solidEdges(solid)) {
    links.get(e.a).set(e.ea, { face: e.b, edge: e.eb });
    links.get(e.b).set(e.eb, { face: e.a, edge: e.ea });
  }
  return links;
}

/**
 * 놓은 면(faces: [{ id, role, label, poly, given? }])을 접을 전개도로: 처음부터 놓인 밑면(root — 입체의 아래 밑면, 꼭짓점 차례 그대로)에서
 * 경첩(fold.js spanningTree — 접기와 같은 트리)을 따라 이웃 면에 "입체에서 그 모서리 건너편 면"을 준다(face.solid).
 * 카드가 그 자리의 면과 종류(밑면·옆면)가 다르면 그 자리로 접되, 그 카드에 다시 붙은 면은 어느 자리인지 정할 수 없어(꼭짓점 수가 다르다)
 * 입체에 없는 면 id('x:면 id')를 준다 — 접을 수 없는 경첩(wrong-hinge)으로 펼친 채 남는다.
 * → { kind: 'prism', sides, name, height, folds, solidFaces, faces, root }
 */
export function labelNet(fs, faces, rootId) {
  const base = {
    kind: 'prism',
    sides: fs.n,
    name: fs.name,
    height: fs.height,
    folds: { ...fs.solid.folds },
    solidFaces: fs.solid.faces.map((f) => ({ id: f.id, role: f.role, points: f.points.map((p) => [...p]) })),
    faces: faces.map((f) => ({ id: f.id, role: f.role, label: f.label, poly: f.poly.map((p) => [...p]) })),
    root: rootId,
  };
  const { order, parent } = spanningTree(base);
  const links = solidLinks(fs.solid);
  const solidById = new Map(fs.solid.faces.map((f) => [f.id, f]));
  const info = new Map(); // 면 id → { solid, off(놓인 꼭짓점 i ↔입체 면의 꼭짓점 i + off), known(꼭짓점 차례를 믿을 수 있나) }
  info.set(rootId, { solid: 'b0', off: 0, known: true });
  for (const id of order.slice(1)) {
    const hg = parent.get(id);
    const pid = hg.a === id ? hg.b : hg.a;
    const pEdge = hg.a === id ? hg.eb : hg.ea;
    const cEdge = hg.a === id ? hg.ea : hg.eb;
    const p = info.get(pid);
    const face = base.faces.find((f) => f.id === id);
    if (!p.known) {
      info.set(id, { solid: `x:${id}`, off: 0, known: false });
      continue;
    }
    const pn = solidById.get(p.solid).points.length;
    const across = links.get(p.solid).get((((pEdge + p.off) % pn) + pn) % pn);
    const target = solidById.get(across.face);
    const fits = target.role === face.role && target.points.length === face.poly.length;
    const cn = face.poly.length;
    info.set(id, { solid: across.face, off: fits ? (((across.edge - cEdge) % cn) + cn) % cn : 0, known: fits });
  }
  // 자리를 아는 면은 꼭짓점 차례를 입체의 그 면과 같게 돌려 둔다(꼭짓점 i ↔ 입체 면의 꼭짓점 i — 빈 자리 · 겹침 표시가 입체의 면 틀로 자리를 잰다).
  // 자리의 면과 종류가 다른 카드 · 자리를 모르는 면은 exact: false(그 면을 기준으로 빈 자리를 재지 않는다). 떨어진 면(트리에 없음)은 입체에 없는 면으로
  return {
    ...base,
    faces: base.faces.map((f) => {
      const it = info.get(f.id);
      if (!it) return { ...f, solid: `x:${f.id}`, exact: false };
      if (!it.known) return { ...f, solid: it.solid, exact: false };
      const n = f.poly.length;
      return { ...f, solid: it.solid, poly: f.poly.map((_, j) => f.poly[(((j - it.off) % n) + n) % n]) };
    }),
  };
}

// ── 같은 모양의 열쇠 ─────────────────────────────
/** 밑면 다각형의 대칭(꼭짓점 차례를 옮기는 돌리기 · 뒤집기 가운데 모양이 그대로인 것): [i → σ(i)] 함수들 */
function baseSymmetries(base) {
  const n = base.length;
  const L = base.map((p, i) => Math.hypot(base[(i + 1) % n][0] - p[0], base[(i + 1) % n][1] - p[1]));
  const A = base.map((_, i) => interiorAngle(base, i));
  const out = [];
  const near = (x, y) => Math.abs(x - y) < EPS;
  for (let k = 0; k < n; k += 1) {
    if (L.every((_, i) => near(L[i], L[(i + k) % n]) && near(A[i], A[(i + k) % n]))) out.push({ v: (i) => (i + k) % n, s: (i) => (i + k) % n });
    // 뒤집기: 꼭짓점 i → k − i, 변 i(꼭짓점 i → i+1) → 변 k − i − 1
    if (L.every((_, i) => near(L[i], L[(((k - i - 1) % n) + n) % n]) && near(A[i], A[(((k - i) % n) + n) % n]))) {
      out.push({ v: (i) => (((k - i) % n) + n) % n, s: (i) => (((k - i - 1) % n) + n) % n });
    }
  }
  return out;
}

/** 입체의 모서리(이웃한 두 면) 번호와 입체의 대칭(면의 자리 바꾸기)들 */
function edgeIndex(solid) {
  const edges = solidEdges(solid);
  const index = new Map(edges.map((e, i) => [[e.a, e.b].sort().join('|'), i]));
  const n = solid.sides;
  const perms = [];
  for (const sym of baseSymmetries(solid.base)) {
    for (const flip of [false, true]) {
      perms.push((id) => {
        if (id === 'b0' || id === 'b1') return flip ? (id === 'b0' ? 'b1' : 'b0') : id;
        return `s${sym.s(Number(id.slice(1)) % n)}`;
      });
    }
  }
  return { edges, index, perms };
}
const indexCache = new WeakMap();
function edgeIndexOf(solid) {
  if (!indexCache.has(solid)) indexCache.set(solid, edgeIndex(solid));
  return indexCache.get(solid);
}

/** 신장 트리(이웃한 두 면의 쌍 [[a, b], …])의 모양 열쇠: 입체의 대칭으로 옮긴 트리 번호(모서리 번호의 비트) 가운데 가장 작은 것 */
export function canonicalCode(solid, pairs) {
  const { index, perms } = edgeIndexOf(solid);
  let best = Infinity;
  for (const perm of perms) {
    let mask = 0;
    for (const [a, b] of pairs) {
      const i = index.get([perm(a), perm(b)].sort().join('|'));
      if (i == null) return null;
      mask += 2 ** i;
    }
    best = Math.min(best, mask);
  }
  return best;
}

/**
 * 그 각기둥의 서로 다른 전개도의 열쇠 모두(차례대로): 신장 트리를 모두 나열해 대칭으로 묶고, 펼친 그림에서 면이 겹치지 않는 것만.
 * (같은 묶음은 합동이라 겹침도 같다 — 묶음마다 하나만 펼쳐 본다.) 이 차례가 모음의 칸 번호다 — prism-free-data.js에 적어 두고 검사가 다시 센다
 */
export function freeNetCodes(fs) {
  const codes = new Map();
  for (const tree of spanningTrees(fs.solid)) {
    const code = canonicalCode(fs.solid, tree.map((e) => [e.a, e.b]));
    if (!codes.has(code)) codes.set(code, tree);
  }
  return [...codes].filter(([, tree]) => flatOk(prismNet(fs.solid, tree))).map(([code]) => code).sort((a, b) => a - b);
}

/** 접어서 각기둥이 되는 전개도(labelNet)의 열쇠 — 접는 트리의 경첩을 입체의 두 면 쌍으로 */
export function netCode(fs, net) {
  const { treeHinges } = spanningTree(net);
  const solidOf = new Map(net.faces.map((f) => [f.id, f.solid]));
  return canonicalCode(fs.solid, treeHinges.map((hg) => [solidOf.get(hg.a), solidOf.get(hg.b)]));
}

/** 열쇠 → 모음 칸 id (그 각기둥의 열쇠 차례). 목록에 없으면 null */
export function netItemId(solidId, code) {
  const i = (FREE_NET_CODES[solidId] ?? []).indexOf(code);
  return i < 0 ? null : prismFreeItemId(solidId, i);
}

// ── 판정 ─────────────────────────────────
const PROBLEM_ORDER = ['overlap', 'wrong-hinge', 'vertex-full', 'edge-length', 'gap', 'disconnected', 'face-count'];
/** 고른 까닭(PRISM_JUDGE_REASONS의 id)에 드는 문제의 꼴 */
const REASON_TYPES = Object.freeze({ overlap: ['overlap', 'wrong-hinge', 'vertex-full'], length: ['edge-length', 'gap'] });
/**
 * 까닭을 하나만 말할 때 먼저 고르는 것: 겹침 → 접을 수 없는 경첩 → 한 점을 둘러쌈 → 길이(이어 붙인 곳 먼저) → 빈 곳.
 * chosen: 학생이 고른 까닭이 참이면 그 까닭의 문제를 먼저(쪽지 · 무대 표시가 학생이 찾은 까닭을 보이게 — review-prism-g2 G2-5)
 */
export function primaryFreeProblem(problems, chosen = null) {
  const prefer = chosen && freeReasons(problems).includes(chosen) ? REASON_TYPES[chosen] ?? [] : [];
  for (const type of [...PROBLEM_ORDER.filter((t) => prefer.includes(t)), ...PROBLEM_ORDER.filter((t) => !prefer.includes(t))]) {
    const found = (type === 'edge-length' ? problems.find((p) => p.type === type && p.hinge) : null) ?? problems.find((p) => p.type === type);
    if (found) return found;
  }
  return problems[0] ?? null;
}

/** problem → 오개념 tag (spec-grade6 4절 — 각기둥 줄) */
const TAG_OF = Object.freeze({
  overlap: TAGS.basePosition,
  'wrong-hinge': TAGS.basePosition,
  'vertex-full': TAGS.basePosition,
  'edge-length': TAGS.edgeLength,
  gap: TAGS.edgeLength,
  disconnected: TAGS.edgeLength,
  'face-count': TAGS.sideCount,
});

/**
 * "왜 안 될까요?" 칩: 판별 단계와 같은 교과서 정리의 말 넷(면의 수 · 직사각형 · 겹침 · 길이). 이 단계의 카드는 늘 한 벌이고 옆면은 늘 직사각형이라
 * 앞의 둘은 늘 틀린 까닭이다(그것도 살피는 것이 공부다). 참인 칩: 겹침·접을 수 없는 경첩·한 점을 둘러쌈 → "면이 겹쳐요",
 * 길이가 다른 선분·빈 곳 → "맞닿는 선분의 길이가 달라요" (접을 수 없는 경첩만 있는 드문 모양은 둘 다 참)
 */
export function freeReasons(problems) {
  const t = new Set(problems.map((p) => p.type));
  const out = [];
  if (t.has('overlap') || t.has('vertex-full')) out.push('overlap');
  if (t.has('edge-length') || t.has('gap')) out.push('length');
  if (out.length === 0 && t.has('wrong-hinge')) out.push('overlap', 'length');
  if (out.length === 0) out.push('length');
  return out;
}

export function judgeFreeReason(problems, choice, reasons) {
  const truths = freeReasons(problems);
  const correct = truths.includes(choice);
  const p = primaryFreeProblem(problems);
  const preferred = p && ['overlap', 'wrong-hinge', 'vertex-full'].includes(p.type) ? 'overlap' : 'length';
  const answer = correct ? choice : (truths.includes(preferred) ? preferred : truths[0]);
  return { correct, answer, answerText: reasons.find((r) => r.id === answer)?.text ?? '' };
}

const labelOf = (net, id) => net.faces.find((f) => f.id === id)?.label ?? '?';
const byLabel = (a, b) => LABELS.indexOf(a) - LABELS.indexOf(b);

/** 까닭 문장 (까닭을 고른 뒤 · 넘어간 뒤) — chosen: 학생이 고른 까닭(참이면 그 까닭을 말한다) */
export function explainFreeProblem(net, problems, chosen = null) {
  const p = primaryFreeProblem(problems, chosen);
  if (!p) return '';
  if (p.type === 'overlap') {
    const bases = net.faces.filter((f) => f.role === 'base');
    const both = bases.length === 2 && bases.every((b) => net.faces.find((f) => f.id === b.id)?.solid === bases[0].solid);
    if (both) {
      const [a, b] = bases.map((f) => f.label).sort(byLabel);
      return `두 밑면(${a} 면과 ${b} 면)이 옆면의 같은 쪽으로 접혀요. 같은 자리에 겹치고, 반대쪽은 비어요. 두 밑면은 옆면의 위와 아래에 하나씩 붙여요.`;
    }
    const [a, b] = p.faces.map((id) => labelOf(net, id)).sort(byLabel);
    return `접으면 ${a} 면과 ${b} 면이 같은 자리에 겹쳐요. 한 자리에는 면이 하나만 와야 해요.`;
  }
  if (p.type === 'wrong-hinge') {
    const [a, b] = p.faces.map((id) => labelOf(net, id)).sort(byLabel);
    return `${a} 면과 ${b} 면을 이은 곳은 그대로는 접을 수 없어요. 밑면은 옆면의 위·아래 변에, 옆면은 옆면의 세로 변에 이어 붙여요.`;
  }
  if (p.type === 'vertex-full') return '한 꼭짓점에 면이 빈틈없이 둘러 모여 있어 접을 수 없어요.';
  if (p.type === 'edge-length') {
    const [x, y] = p.lengths.map(cm);
    const [a, b] = p.faces.map((id) => labelOf(net, id));
    return `접으면 ${a} 면과 ${b} 면이 맞닿는 두 선분의 길이가 ${josa(x, '과/와')} ${y}로 달라요. 맞닿는 선분은 길이가 같아야 해요.`;
  }
  return '접으면 맞닿지 않는 선분이 있어요. 각기둥이 되려면 맞닿는 선분끼리 길이가 같아야 해요.';
}

/**
 * 놓은 대로 접은 한 번의 판정: 판별 단계와 같은 checkNet. → { net(접을 전개도), valid, problems, code, id(모음 칸), shape(이번 판의 같은 모양 열쇠) }
 * 각기둥이 되면 shape = 칸 id, 안 되면 펼친 그림의 모양 열쇠(polyNetKey — 돌리거나 뒤집은 것은 같다)
 */
export function judgeFreeNet(fs, faces, rootId) {
  const net = labelNet(fs, faces, rootId);
  const { problems } = checkNet(net);
  // 펼친 그림에서 경첩이 아닌 곳이 맞닿아 고리를 이루면(종이가 이어져 있어) 그대로는 접을 수 없다 — checkNet은 남는 경첩을 잘라 접으므로 따로 본다
  const extra = findHinges(net).length > net.faces.length - 1;
  if (extra && !problems.some((p) => p.type === 'vertex-full')) {
    const { treeHinges } = spanningTree(net);
    const loose = findHinges(net).find((hg) => !treeHinges.some((t) => t.a === hg.a && t.b === hg.b && t.ea === hg.ea && t.eb === hg.eb));
    problems.push({ type: 'vertex-full', faces: loose ? [loose.a, loose.b] : [], vertex: null });
  }
  const valid = problems.length === 0;
  const code = valid ? netCode(fs, net) : null;
  const id = valid ? netItemId(fs.id, code) : null;
  const shape = valid ? id ?? `c:${code}` : `x:${polyNetKey(net)}`;
  return { net, valid, problems, code, id, shape };
}

// ── 한 판의 흐름 (순수 상태 — 화면 play-pfree.js와 점수 검사가 같은 규칙을 쓴다) ─────────────
export const FREE_EXPECTED = '전개도';
export const FREE_REPLAY_NOTE = '처음 만든 전개도는 점수를 받아요. 만들어 본 전개도는 다시 만들어도 점수가 없어요.';
export const FREE_LATER_NOTE = `${PRISM_FREE_FULL_SCORE}가지를 넘으면 새 전개도마다 ${PRISM_FREE_LATER_XP}점이에요(${PRISM_FREE_LATER_UNTIL}가지까지).`;
export const FREE_OVER_NOTE = `${PRISM_FREE_LATER_UNTIL}가지를 넘은 전개도는 점수 없이 찾은 가지 수에만 더해져요.`;
export const FREE_NOTE_BEFORE_PICK = '접어 보니 각기둥이 안 돼요. 왜 그런지 골라 볼까요?';
export const isLaterFree = (count) => count > PRISM_FREE_FULL_SCORE;
/** 이 기기에서 찾은 가지 수가 이만큼을 넘으면(31번째부터) 등록 점수도 없다(15-29) */
export const isOverFree = (count) => count > PRISM_FREE_LATER_UNTIL;
/** 별: 이번 판에 찾은 서로 다른 전개도 수(1 · 2 · 3가지 → 별 1 · 2 · 3개). 2가지부터 끝낼 수 있다(spec 16-14) */
export const freeStars = (found) => Math.max(0, Math.min(3, Math.floor(Number(found) || 0)));
export const freeStarNote = (stars) => (stars >= 3 ? null : '서로 다른 전개도 3가지를 찾으면 별 3개!');

/**
 * 한 판: deviceFound — 이 기기에서 찾은 각기둥 전개도(모음 칸 id, 모든 각기둥을 합쳐 — 점수 상한을 세는 수).
 * fold(faces) → judgeFreeNet 결과 + { kind: 'new' | 'known' | 'repeat' | 'invalid', log, itemId, collect, first, later, over, tag, given, found, done, full, fixed }
 *   repeat: 이번 판에 이미 접어 본 모양(되는 것은 열쇠, 안 되는 것은 펼친 그림의 모양) — 기록하지 않는다.
 *   new: 이 기기에서 처음 — 모음에 넣고(collect) 만들기 성공은 처음 PRISM_FREE_FULL_SCORE가지까지만 점수(scored: 'once'), 그 뒤는 등록 1점뿐(later),
 *     PRISM_FREE_LATER_UNTIL가지를 넘으면 등록 점수도 없다(over — 15-29). 등록 점수는 엔진이 모음의 xpAfter로 준다.
 *   안 되는 모양은 끝없이 많아 "모양마다 한 번"을 적어 둘 수 없다 → 점수 없음(기록 · 까닭 고르기는 있다)
 */
export function createFreeSession({ stageId = 'prism-free', solidId, deviceFound = [], goal = PRISM_FREE_GOAL } = {}) {
  const fs = freeSolid(solidId);
  const seen = new Set();
  const foundNow = [];
  const device = new Set(deviceFound);
  const history = [];
  let seq = 0;
  return {
    fs,
    fold(faces, rootId) {
      const r = judgeFreeNet(fs, faces, rootId);
      const repeat = seen.has(r.shape);
      let kind = 'invalid';
      if (repeat) kind = 'repeat';
      else if (r.valid) kind = r.id && device.has(r.id) ? 'known' : 'new';
      let itemId = null;
      let collect = null;
      if (!repeat) {
        seq += 1;
        itemId = `${stageId}:${seq}:${r.valid ? r.id ?? 'c' : 'x'}`;
        seen.add(r.shape);
      }
      if (r.valid && !repeat) {
        foundNow.push(r.shape);
        if (kind === 'new' && r.id) collect = { id: PRISM_FREE_COLLECTION, item: r.id, isNew: true };
        if (r.id) device.add(r.id);
      }
      const problem = r.valid ? null : primaryFreeProblem(r.problems);
      const tag = r.valid ? null : (TAG_OF[problem?.type] ?? TAGS.edgeLength);
      const prev = history.at(-1);
      const first = Boolean(collect);
      const step = {
        ...r,
        kind,
        log: !repeat,
        itemId,
        collect,
        first,
        later: first && isLaterFree(device.size),
        over: first && isOverFree(device.size),
        tag,
        given: r.valid ? `전개도 ${r.id ?? ''}`.trim() : `안 됨: ${tag}`,
        expected: FREE_EXPECTED,
        found: foundNow.length,
        done: foundNow.length >= goal,
        full: foundNow.length >= PRISM_FREE_FULL,
        fixed: r.valid && !repeat && Boolean(prev && !prev.valid),
        deviceCount: device.size,
      };
      history.push(step);
      return step;
    },
    found: () => foundNow.length,
    done: () => foundNow.length >= goal,
    history: () => history.slice(),
    deviceCount: () => device.size,
  };
}

/** 접은 뒤 보일 글. 안 되는 모양은 까닭 고르기가 먼저 — 고르기 전에는 까닭 문장도 무대의 까닭 표시도 없다 */
export function freeFeedback(step, { picked = false, order = 1, chosen = null } = {}) {
  const waiting = step.kind === 'invalid' && !picked;
  let toast;
  let title;
  let note;
  if (step.kind === 'repeat') {
    toast = '이번에 이미 접어 본 모양이에요.';
    title = '이미 접어 본 모양';
    note = step.valid
      ? '앞에서 만든 전개도와 같은 모양이에요. 돌리거나 뒤집으면 똑같아요. 다른 모양으로 만들어 봐요.'
      : '이번에 이미 접어 본 모양이에요. 다른 곳에 붙여 봐요.';
  } else if (step.kind === 'new') {
    toast = '처음 찾은 전개도예요!';
    title = '새 전개도 발견';
    note = `접으면 ${josa(step.net.name, '이/가')} 돼요. 맞닿는 선분의 길이가 모두 같아요.`;
  } else if (step.kind === 'known') {
    toast = `${josa(step.net.name, '이/가')} 됐어요!`;
    title = `${josa(step.net.name, '이/가')} 돼요`;
    note = '전에 찾은 전개도와 같은 모양이에요. 돌리거나 뒤집으면 똑같아요.';
  } else {
    toast = '각기둥이 안 돼요. 왜 그런지 골라 볼까요?';
    title = waiting ? '각기둥이 안 돼요' : '까닭';
    note = waiting ? FREE_NOTE_BEFORE_PICK : explainFreeProblem(step.net, step.problems, chosen);
  }
  let tone = 'info';
  if (step.kind === 'new' || step.kind === 'known') tone = 'correct';
  else if (step.kind === 'invalid' && !waiting) tone = 'wrong';
  return { toast, title, note, tone, marks: !waiting, order };
}

export function freeSummary(history) {
  const logged = history.filter((s) => s.log);
  return {
    shapes: logged.length,
    found: logged.filter((s) => s.valid).length,
    newNets: history.filter((s) => s.first).length,
    fixes: history.filter((s) => s.fixed).length,
  };
}
export const freeStats = (sum) => [
  { label: '찾은 전개도', value: `${sum.found}가지` },
  { label: '접어 본 모양', value: `${sum.shapes}가지` },
];
/** 결과 "오늘의 솜씨" 칸 (보여 주기만 — 점수는 엔진이 계산). earned { answer, nets } — 칸 점수의 합 = 이번 판 점수(단계·별 점수 빼고) */
export function freeHighlights(sum, { earned, total }) {
  return [
    { icon: 'book', label: '새 전개도 발견', value: `${sum.newNets}가지`, xp: earned.answer + earned.nets },
    { icon: 'grid', label: '지금까지 찾은 각기둥 전개도', value: `${total}가지` },
    { icon: 'undo', label: '고쳐서 다시 도전', value: `${sum.fixes}번` },
  ];
}

/** 놓는 판 아래 안내 (접기 전) — 까닭 낱말을 쓰지 않는다 */
export function foldReadiness(placedCount, total) {
  if (placedCount < total) return { ready: false, text: `면을 모두 붙이면 접어 볼 수 있어요. (${placedCount} / ${total})` };
  return { ready: true, text: '놓은 그대로 접혀요. 접어서 확인해 봐요.' };
}

/** 주문 글: 매트의 주문 띠 · 화면 읽기 */
export function orderText(k) {
  if (k === 1) return { head: '주문 ①', text: '놓여 있는 면에 이어 붙여 전개도를 완성해요.' };
  if (k === 2) return { head: '주문 ②', text: '다른 모양으로 한 번 더! 밑면 하나만 놓여 있어요.' };
  return { head: `주문 ${'③④⑤⑥⑦⑧⑨'[Math.min(k - 3, 6)]}`, text: '또 다른 모양으로! 밑면 하나만 놓여 있어요.' };
}

// ── 판의 크기와 붙일 자리 (화면 px — 순수 계산이라 검사가 크기마다 직접 잰다) ─────────────
/** 붙일 자리 단추의 지름(px)과 단추 사이 · 단추와 면 사이 최소 거리 */
export const SLOT_SIZE = 48;
export const SLOT_GAP = 2;
/** 1 cm의 화면 크기 상한(px) — 작은 전개도가 지나치게 크게 그려지지 않게 */
export const UNIT_CAP = 46;
/** 면 둘레에 붙일 자리가 들어갈 여백(px): 면에서 단추 가운데까지 최대 거리 + 반지름 */
export const SLOT_REACH = 60;

/** cm 상자를 판(area px)에 여백을 두고 맞춘 1 cm 크기와 (0, 0) cm의 자리 */
export function fitBoard(box, area, { cap = UNIT_CAP, margin = SLOT_REACH } = {}) {
  const w = Math.max(box.maxX - box.minX, 1e-3);
  const h = Math.max(box.maxY - box.minY, 1e-3);
  const unit = Math.max(4, Math.min(cap, (area.width - 2 * margin) / w, (area.height - 2 * margin) / h));
  const origin = [area.left + (area.width - w * unit) / 2 - box.minX * unit, area.top + (area.height - h * unit) / 2 - box.minY * unit];
  return { unit, origin };
}

export const boxOf = (polys) => {
  const { min, max } = bounds(polys.flat());
  return { minX: min[0], minY: min[1], maxX: max[0], maxY: max[1] };
};

/** 지금 보기(view)에서 상자가 여백까지 판 안에 드나 */
export function boardHolds(view, box, area, margin = SLOT_REACH) {
  const x0 = view.origin[0] + box.minX * view.unit;
  const x1 = view.origin[0] + box.maxX * view.unit;
  const y0 = view.origin[1] + box.minY * view.unit;
  const y1 = view.origin[1] + box.maxY * view.unit;
  return x0 - margin >= area.left - 0.5 && x1 + margin <= area.left + area.width + 0.5 && y0 - margin >= area.top - 0.5 && y1 + margin <= area.top + area.height + 0.5;
}

/**
 * 판의 보기: 주문을 시작할 때는 바탕 그림(다 놓은 띠 꼴)이 들어가는 크기로, 놓은 면이 판 밖으로 나가려 하면 그때만 작게 · 가운데로 다시 맞춘다
 * (주문 동안 1 cm의 크기는 커지지 않는다 — 붙일 때마다 그림이 튀지 않게)
 */
export function nextBoardView(prev, placedPolys, area, plan) {
  const box = boxOf(placedPolys);
  if (!prev) {
    const start = fitBoard(boxOf(plan), area);
    // 바탕 그림에 맞춘 자리에서 놓인 면이 판 밖이면(돌린 그림) 놓인 면 쪽으로
    return boardHolds(start, box, area) ? start : fitBoard(box, area, { cap: start.unit });
  }
  if (boardHolds(prev, box, area)) return prev;
  return fitBoard(box, area, { cap: prev.unit });
}

/** 점과 선분 사이 거리 */
function segDist(pt, a, b) {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const t = Math.max(0, Math.min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(pt[0] - a[0] - t * dx, pt[1] - a[1] - t * dy);
}
function insidePoly(pt, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/**
 * 붙일 자리 단추의 자리(px): 빈 모서리마다 하나. 변의 바깥쪽 — 변 위의 점(가운데부터 양 끝 쪽으로)에서 바깥 방향(곧게, 비스듬히 25° · 50°)으로
 * 조금씩 멀리 놓아 보며, 다른 단추와 SLOT_SIZE + SLOT_GAP · 면과 반지름 + SLOT_GAP 넘게 떨어지고 판 안인 자리 가운데 가까운 곳.
 * 자리를 고르기 어려운 변(맞는 자리가 적은 변 — 좁은 틈을 향한 변 · 짧은 변)부터 정한다. 변에서 멀리 놓인 단추는 화면이 변까지 점선으로 잇는다.
 * 맞는 자리가 하나도 없으면 가장 덜 겹치는 자리(overlap: true — 검사가 0인지 본다).
 * facesPx: [{ id, poly(px) }], edges: [{ key, p, q(px), face }], area: 판(px) → [{ key, x, y, ax, ay(변 위의 이은 점), overlap }]
 */
const SLOT_TS = [0.5, 0.36, 0.64, 0.22, 0.78, 0.1, 0.9];
const SLOT_TURNS = [0, 25, -25, 50, -50].map((d) => (d * Math.PI) / 180);
const SLOT_PUSHES = [30, 36, 44, 54, 66, 80, 96, 114, 134];
export function placeSlots(facesPx, edges, area) {
  const r = SLOT_SIZE / 2;
  const faceGap = (pt) => {
    let best = Infinity;
    for (const f of facesPx) {
      if (insidePoly(pt, f.poly)) return -1;
      for (let i = 0; i < f.poly.length; i += 1) best = Math.min(best, segDist(pt, f.poly[i], f.poly[(i + 1) % f.poly.length]));
    }
    return best;
  };
  const inArea = (pt) => pt[0] - r >= area.left - 0.5 && pt[0] + r <= area.left + area.width + 0.5 && pt[1] - r >= area.top - 0.5 && pt[1] + r <= area.top + area.height + 0.5;
  // 변마다 면 · 판만 보고 맞는 자리 후보(가까운 차례)
  const lists = edges.map((e) => {
    const len = Math.hypot(e.q[0] - e.p[0], e.q[1] - e.p[1]) || 1;
    const face = facesPx.find((f) => f.id === e.face);
    const [cx, cy] = centroid(face.poly);
    let nx = -(e.q[1] - e.p[1]) / len;
    let ny = (e.q[0] - e.p[0]) / len;
    const mid = [(e.p[0] + e.q[0]) / 2, (e.p[1] + e.q[1]) / 2];
    if ((mid[0] - cx) * nx + (mid[1] - cy) * ny < 0) [nx, ny] = [-nx, -ny];
    const [ux, uy] = [(e.q[0] - e.p[0]) / len, (e.q[1] - e.p[1]) / len];
    const all = [];
    for (const push of SLOT_PUSHES) {
      for (const turn of SLOT_TURNS) {
        for (const t of SLOT_TS) {
          const a = [e.p[0] + (e.q[0] - e.p[0]) * t, e.p[1] + (e.q[1] - e.p[1]) * t];
          // 비스듬한 방향은 변의 가운데 쪽으로 기울인다(양 끝에서 바깥으로 벌어지게)
          const lean = turn * (t < 0.5 ? -1 : t > 0.5 ? 1 : 1);
          const [dx, dy] = [nx * Math.cos(lean) + ux * Math.sin(lean), ny * Math.cos(lean) + uy * Math.sin(lean)];
          const c = [a[0] + dx * push, a[1] + dy * push];
          const cost = push + Math.abs(t - 0.5) * 40 + Math.abs(turn) * 18;
          all.push({ c, a, cost, ok: inArea(c) && faceGap(c) >= r + SLOT_GAP });
        }
      }
    }
    all.sort((x, y) => x.cost - y.cost);
    return { e, ok: all.filter((x) => x.ok), all };
  });
  const order = lists.map((l, i) => ({ l, i })).sort((x, y) => x.l.ok.length - y.l.ok.length || x.i - y.i);
  const placed = [];
  const chosen = new Map(); // 변 번호 → 고른 후보 (자리를 바꿔 줄 때)
  const result = new Array(edges.length);
  const apart = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) >= SLOT_SIZE + SLOT_GAP;
  for (const { l, i } of order) {
    const far = (c) => placed.every((q) => apart(q, c));
    let pick = l.ok.find((x) => far(x.c)) ?? null;
    if (!pick) {
      // 고쳐 놓기: 막는 단추 하나를 그 변의 다른 맞는 자리로 옮기면 이 변의 자리가 생기나
      for (const x of l.ok) {
        const blockers = [...chosen].filter(([, y]) => !apart(y.c, x.c));
        if (blockers.length !== 1) continue;
        const [j, old] = blockers[0];
        const others = [...chosen].filter(([k]) => k !== j).map(([, y]) => y.c);
        const move = lists[j].ok.find((y) => y !== old && apart(y.c, x.c) && others.every((q) => apart(q, y.c)));
        if (!move) continue;
        chosen.set(j, move);
        placed.splice(placed.indexOf(old.c), 1, move.c);
        result[j] = { ...result[j], x: tidy(move.c[0]), y: tidy(move.c[1]), ax: tidy(move.a[0]), ay: tidy(move.a[1]) };
        pick = x;
        break;
      }
    }
    if (!pick) {
      // 가장 덜 겹치는 자리
      let best = null;
      for (const x of l.all) {
        const near = Math.min(Infinity, ...placed.map((q) => Math.hypot(q[0] - x.c[0], q[1] - x.c[1])));
        const score = Math.min(near - (SLOT_SIZE + SLOT_GAP), faceGap(x.c) - (r + SLOT_GAP), inArea(x.c) ? 0 : -999);
        if (!best || score > best.score) best = { ...x, score };
      }
      pick = { ...best, overlap: true, none: l.ok.length === 0 };
    }
    placed.push(pick.c);
    chosen.set(i, pick);
    result[i] = { key: l.e.key, x: tidy(pick.c[0]), y: tidy(pick.c[1]), ax: tidy(pick.a[0]), ay: tidy(pick.a[1]), overlap: Boolean(pick.overlap), none: Boolean(pick.none) };
  }
  return result;
}

/** 가운데 (cx, cy) · 폭 w · 높이 h · 돌림 deg인 직사각형 → { pts(네 꼭짓점), axes(두 방향) } */
export function labelBox(cx, cy, w, h, deg = 0) {
  const a = (deg * Math.PI) / 180;
  const [c, s] = [Math.cos(a), Math.sin(a)];
  const pts = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
  return { pts, axes: [[c, s], [-s, c]] };
}
/** 두 직사각형이 pad(px) 넘게 떨어져 있나 (나눔축 검사) */
export function boxesApart(p, q, pad = 1) {
  return [...p.axes, ...q.axes].some(([ax, ay]) => {
    const u = p.pts.map(([x, y]) => x * ax + y * ay);
    const v = q.pts.map(([x, y]) => x * ax + y * ay);
    return Math.min(Math.max(...u), Math.max(...v)) - Math.max(Math.min(...u), Math.min(...v)) <= -pad;
  });
}
/** 볼록 다각형 안에 점들이 모두 들고, 변에서 margin(px) 넘게 떨어져 있나 */
function insideWith(pts, poly, margin) {
  return pts.every((pt) => insidePoly(pt, poly) && poly.every((a, i) => segDist(pt, a, poly[(i + 1) % poly.length]) >= margin));
}
const LABEL_STEP = 3;
/**
 * 판의 글 자리(px): 면마다 빈 모서리의 길이 글(변의 가운데에서 안쪽으로, 변을 따라 돌림)과 면 이름이 서로 겹치지 않고 면 안에 들게.
 * 좁은 화면 · 작은 면(사다리꼴 밑면 · 육각기둥의 밑면)에서: 길이 글은 "2 cm" → "2"(수만)로, 그래도 안 되면 조금 더 안쪽으로, 그래도 안 되면 그 글을 뺀다
 * (붙일 자리가 있는 변 → 긴 변 차례로 놓는다). 면 이름은 가운데에서 가장 가까운 빈 곳에 — 주는 차례(자물쇠와 함께 → 작게 → 이름만 …)로, 안 되면 뺀다.
 * faces: [{ id, poly(px), lens: [{ key, p, q, open, texts: [{ text, w, h }] (긴 글 → 짧은 글) }], names: [{ variant, w, h }] }]
 * → { lens: Map(key → { x, y, deg, text } | null), names: Map(id → { x, y, variant } | null) }
 */
export function placeBoardLabels(faces, { pad = 1, step = LABEL_STEP } = {}) {
  const lens = new Map();
  const names = new Map();
  for (const f of faces) {
    const [cx, cy] = centroid(f.poly);
    const kept = [];
    const edgeLen = (e) => Math.hypot(e.q[0] - e.p[0], e.q[1] - e.p[1]);
    // 붙일 자리가 있는 변(open)부터, 그 안에서는 긴 변부터
    for (const e of [...f.lens].sort((a, b) => Number(Boolean(b.open)) - Number(Boolean(a.open)) || edgeLen(b) - edgeLen(a))) {
      const len = edgeLen(e) || 1;
      const mid = [(e.p[0] + e.q[0]) / 2, (e.p[1] + e.q[1]) / 2];
      let [nx, ny] = [-(e.q[1] - e.p[1]) / len, (e.q[0] - e.p[0]) / len];
      if ((mid[0] - cx) * nx + (mid[1] - cy) * ny > 0) [nx, ny] = [-nx, -ny]; // 안쪽
      let deg = (Math.atan2(e.q[1] - e.p[1], e.q[0] - e.p[0]) * 180) / Math.PI;
      if (deg > 90) deg -= 180;
      if (deg <= -90) deg += 180;
      let placed = null;
      for (const [k, t] of e.texts.entries()) {
        // 긴 글("2 cm")은 변이 글 폭의 1.5배 넘을 때만 — 짧은 글("2")은 변 안에 들면
        if (k < e.texts.length - 1 ? len < t.w * 1.5 : len < t.w + 4) continue;
        for (const inset of [t.h / 2 + 3, t.h / 2 + 7]) {
          const x = mid[0] + nx * inset;
          const y = mid[1] + ny * inset;
          const box = labelBox(x, y, t.w, t.h, deg);
          if (!insideWith(box.pts, f.poly, 0.5) || kept.some((b) => !boxesApart(b, box, pad))) continue;
          placed = { x: tidy(x), y: tidy(y), deg: tidy(deg), text: t.text, box };
          break;
        }
        if (placed) break;
      }
      lens.set(e.key, placed && { x: placed.x, y: placed.y, deg: placed.deg, text: placed.text });
      if (placed) kept.push(placed.box);
    }
    // 면 이름: 가운데(무게중심)부터 가까운 차례로 빈 곳을 찾는다
    const { min, max } = bounds(f.poly);
    let name = null;
    for (const v of f.names) {
      const spots = [[cx, cy]];
      for (let x = min[0] + v.w / 2; x <= max[0] - v.w / 2 + 1e-9; x += step) {
        for (let y = min[1] + v.h / 2; y <= max[1] - v.h / 2 + 1e-9; y += step) spots.push([x, y]);
      }
      const near = spots.map(([x, y], i) => ({ x, y, d: i === 0 ? -1 : Math.hypot(x - cx, y - cy) })).sort((a, b) => a.d - b.d);
      const spot = near.find(({ x, y }) => {
        const box = labelBox(x, y, v.w, v.h);
        return insideWith(box.pts, f.poly, 1) && kept.every((b) => boxesApart(b, box, pad));
      });
      if (spot) {
        name = { x: tidy(spot.x), y: tidy(spot.y), variant: v.variant };
        break;
      }
    }
    names.set(f.id, name);
  }
  return { lens, names };
}

/** 시험·화면 읽기용: 놓은 면 · 남은 카드의 수 */
export function boardCounts(placed, cards) {
  return { placed: placed.length, total: cards.length };
}

/** 이 단계의 별 기준 · 끝내기 (spec 16-14 · 16-15) */
export const FREE_GOAL = PRISM_FREE_GOAL;
export const FREE_FULL = PRISM_FREE_FULL;
export { PRISM_FREE_SOLIDS };

/** 화면 읽기의 면 이름: "다 면, 옆면, 가로 4 cm 세로 3.5 cm" (spec-grade6 9절) */
export function cardName(card) {
  if (card.role === 'side') return `${card.label} 면 카드, 옆면, 가로 ${cm(card.w)} 세로 ${cm(card.h)}`;
  const base = BASE_NAMES[card.poly.length];
  return `${card.label} 면 카드, 밑면, ${base}`;
}

/** 붙일 변의 길이 (화면 읽기 · 카드 글) */
export const edgeLengthOf = (poly, k) => tidy(Math.hypot(poly[(k + 1) % poly.length][0] - poly[k][0], poly[(k + 1) % poly.length][1] - poly[k][1]));

export { signedArea, hasFinalSound };
