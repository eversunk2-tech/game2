/**
 * 각기둥 입체와 그 전개도 (순수 함수, 화면과 무관). 기획서: docs/games/net-workshop/spec-grade6.md 6-2절(데이터 모델) · 6-3절(판정) · 2-2절(나오는 각기둥).
 *
 * 입체: prismSolid({ base, height }) — 밑면 볼록 다각형(cm, 반시계 방향 [[x, y], …]) + 높이 → 면과 접는 각도.
 *   면 id: 'b0'(아래 밑면) · 'b1'(위 밑면) · 's0' … (옆면 i = 밑면의 변 i — 꼭짓점 i → i+1 위에 선 직사각형). 면의 꼭짓점은 바깥에서 볼 때 반시계 방향.
 *   folds['면|면']: 두 면이 맞닿는 모서리의 접는 각도 = 180° − 이면각. 밑면-옆면 90°, 옆면-옆면 = 밑면의 그 꼭짓점의 바깥각(정다각형이면 360° ÷ 변의 수)
 * 전개도: prismNet(solid, tree) — 신장 트리(입체의 모서리 묶음)를 따라 펼친 것(fold.js unfold) + 각기둥 정보
 *   { kind: 'prism', sides(한 밑면의 변의 수), name('오각기둥'), folds, solidFaces(입체의 면 — 비어요 자리), faces: [{ id, role, label, solid, poly }] }
 *   면의 solid는 입체의 어느 면인지(접는 각도를 그 이면각에서 읽는다 — fold.js hingeAngle). exact: false는 고친 면(크기·모양을 바꾼 면)
 * 꼴: 'strip'(띠 꼴 — 옆면이 모두 한 줄로 이어짐) · 'lone'(낯선 꼴 — 옆면 하나가 밑면에만 붙음, spec-grade6 6-4절) · 'other'
 */
import { LABELS, findHinges, solidEdges, spanningTrees, unfold } from './fold.js';
import { bounds, centroid, convexIntersectionArea, interiorAngle } from './geometry.js';

/** 밑면의 변의 수 → 각기둥 이름 · 밑면 이름 (교과서 용어, spec-grade6 1-4절) */
export const PRISM_NAMES = Object.freeze({ 3: '삼각기둥', 4: '사각기둥', 5: '오각기둥', 6: '육각기둥' });
export const BASE_NAMES = Object.freeze({ 3: '삼각형', 4: '사각형', 5: '오각형', 6: '육각형' });

const tidy = (v) => {
  const r = Math.round(v * 1e9) / 1e9;
  return Object.is(r, -0) ? 0 : r;
};

// ── 밑면 (길이는 모두 새로 정했다 — 교과서의 수치를 쓰지 않는다) ─────────────
/** 한 변이 side인 정n각형: (0, 0)에서 x축을 따라 시작해 반시계 방향 */
export function regularPolygon(n, side) {
  const out = [[0, 0]];
  let angle = 0;
  for (let i = 1; i < n; i += 1) {
    const [x, y] = out[i - 1];
    out.push([x + side * Math.cos(angle), y + side * Math.sin(angle)]);
    angle += (2 * Math.PI) / n;
  }
  return out.map(([x, y]) => [tidy(x), tidy(y)]);
}

/** 세 변의 길이 [p, q, r](꼭짓점 0→1, 1→2, 2→0)인 삼각형, 반시계 방향 */
export function triangleBySides([p, q, r]) {
  const x = (p * p + r * r - q * q) / (2 * p);
  return [[0, 0], [p, 0], [tidy(x), tidy(Math.sqrt(r * r - x * x))]];
}

/** 아랫변 bottom · 윗변 top · 두 다리 leg인 등변사다리꼴, 반시계 방향 */
export function isoTrapezoid(bottom, top, leg) {
  const off = (bottom - top) / 2;
  const hgt = Math.sqrt(leg * leg - off * off);
  return [[0, 0], [bottom, 0], [tidy(bottom - off), tidy(hgt)], [tidy(off), tidy(hgt)]];
}

/**
 * 나오는 밑면 (spec-grade6 2-2절): 삼각형(정삼각형 · 세 변의 길이가 모두 다른 삼각형) · 사각형(사다리꼴 · 직사각형 — 직사각형은 전개도 단계에서만) ·
 * 정오각형 · 정육각형. kind별로 크기가 다른 몇 가지(cm). lengths: 변 i의 길이(꼭짓점 i → i+1)
 */
export const BASES = Object.freeze([
  { id: 'tri-eq-2', kind: 'tri-eq', poly: regularPolygon(3, 2) },
  { id: 'tri-eq-3', kind: 'tri-eq', poly: regularPolygon(3, 3) },
  // 세 변의 길이가 모두 다른 예각삼각형(둔각이면 밑면이 납작해 접은 각기둥이 얇은 판처럼 보인다)
  { id: 'tri-sc-3-35-4', kind: 'tri-sc', poly: triangleBySides([4, 3, 3.5]) },
  { id: 'tri-sc-25-3-35', kind: 'tri-sc', poly: triangleBySides([3.5, 2.5, 3]) },
  { id: 'trap-4222', kind: 'trap', poly: isoTrapezoid(4, 2, 2) },
  { id: 'trap-5232', kind: 'trap', poly: isoTrapezoid(5, 3, 2) },
  { id: 'rect-23', kind: 'rect', poly: [[0, 0], [3, 0], [3, 2], [0, 2]] },
  { id: 'rect-34', kind: 'rect', poly: [[0, 0], [4, 0], [4, 3], [0, 3]] },
  { id: 'pent-2', kind: 'pent', poly: regularPolygon(5, 2) },
  { id: 'hex-15', kind: 'hex', poly: regularPolygon(6, 1.5) },
  { id: 'hex-2', kind: 'hex', poly: regularPolygon(6, 2) },
].map((b) => Object.freeze({ ...b, n: b.poly.length, lengths: b.poly.map((p, i) => Math.round(Math.hypot(b.poly[(i + 1) % b.poly.length][0] - p[0], b.poly[(i + 1) % b.poly.length][1] - p[1]) * 1e6) / 1e6) })));
/** 밑면 종류: 모든 변의 길이가 같은 정다각형인가(옆면의 가로가 모두 같다) */
export const REGULAR_KINDS = Object.freeze(['tri-eq', 'pent', 'hex']);
export const baseById = (id) => BASES.find((b) => b.id === id) ?? null;

// ── 입체 ─────────────────────────────────
const key = (a, b) => [a, b].sort().join('|');

/** 각기둥 입체. base: 밑면 볼록 다각형(반시계 방향), height: 높이(cm) */
export function prismSolid({ base, height }) {
  const n = base.length;
  if (n < 3) throw new Error('각기둥의 밑면은 다각형이어야 해요.');
  const at = (p, z) => [p[0], p[1], z];
  const ring = (i) => base[((i % n) + n) % n];
  const faces = [
    // 아래 밑면: 바깥(아래)에서 볼 때 반시계 방향 = 위에서 볼 때 시계 방향
    { id: 'b0', role: 'base', points: [base[0], ...base.slice(1).reverse()].map((p) => at(p, 0)) },
    { id: 'b1', role: 'base', points: base.map((p) => at(p, height)) },
    ...base.map((p, i) => ({ id: `s${i}`, role: 'side', points: [at(p, 0), at(ring(i + 1), 0), at(ring(i + 1), height), at(p, height)] })),
  ];
  const folds = {};
  for (let i = 0; i < n; i += 1) {
    folds[key('b0', `s${i}`)] = Math.PI / 2;
    folds[key('b1', `s${i}`)] = Math.PI / 2;
    // 옆면 i와 옆면 i+1은 밑면의 꼭짓점 i+1에서 만난다: 접는 각도 = 그 꼭짓점의 바깥각
    folds[key(`s${i}`, `s${(i + 1) % n}`)] = Math.PI - interiorAngle(base, (i + 1) % n);
  }
  return { kind: 'prism', sides: n, height, base: base.map((p) => [...p]), name: PRISM_NAMES[n] ?? `${n}각기둥`, faces, folds };
}

/** 입체의 면을 잇는 모서리 하나 (두 면 id로) */
export function edgeBetween(solid, a, b, edges = solidEdges(solid)) {
  return edges.find((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a)) ?? null;
}

/** 각기둥 정보를 붙인 전개도 (트리의 모서리를 따라 편다). 면 이름은 입체의 면 차례 — 문항은 prism-logic.js가 섞는다 */
export function prismNet(solid, tree, { labels = LABELS } = {}) {
  const net = unfold(solid, tree, { labels });
  return {
    ...net,
    kind: 'prism',
    sides: solid.sides,
    name: solid.name,
    height: solid.height,
    folds: { ...solid.folds },
    solidFaces: solid.faces.map((f) => ({ id: f.id, role: f.role, points: f.points.map((p) => [...p]) })),
  };
}

/** 트리의 꼴: 옆면끼리 이은 모서리 수와 홀로 떨어진 옆면 → 'strip' | 'lone' | 'other' */
export function treeForm(solid, tree) {
  const n = solid.sides;
  const sideLinks = tree.filter((e) => e.a.startsWith('s') && e.b.startsWith('s'));
  if (sideLinks.length === n - 1) return 'strip';
  const linked = new Set(sideLinks.flatMap((e) => [e.a, e.b]));
  const lone = solid.faces.filter((f) => f.role === 'side' && !linked.has(f.id)).length;
  return sideLinks.length === n - 2 && lone === 1 ? 'lone' : 'other';
}

/**
 * 띠 꼴 트리: 옆면을 꼭짓점 cut의 모서리에서 잘라 한 줄로(옆면 cut, cut+1, …), 위 밑면은 옆면 top, 아래 밑면은 옆면 bottom에 붙인다
 */
export function stripTree(solid, { cut = 0, top = 0, bottom = 0 } = {}) {
  const n = solid.sides;
  const edges = solidEdges(solid);
  const tree = [];
  for (let i = 0; i < n; i += 1) if (i !== (cut + n - 1) % n) tree.push(edgeBetween(solid, `s${i}`, `s${(i + 1) % n}`, edges));
  tree.push(edgeBetween(solid, 'b1', `s${top}`, edges), edgeBetween(solid, 'b0', `s${bottom}`, edges));
  return tree;
}

/**
 * 낯선 꼴 트리(옆면 하나가 밑면에만 붙은 꼴): 옆면 lone은 밑면 via에만 붙고(그 변), via는 옆면 link에, 다른 밑면은 옆면 other에 붙는다.
 * 나머지 옆면은 lone 자리에서 끊긴 한 줄. other가 lone이면 lone이 두 밑면을 모두 단다
 */
export function loneTree(solid, { lone = 0, via = 'b0', link = 1, other = 1 } = {}) {
  const n = solid.sides;
  const edges = solidEdges(solid);
  const tree = [];
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    if (i !== lone && j !== lone) tree.push(edgeBetween(solid, `s${i}`, `s${j}`, edges));
  }
  const rest = via === 'b0' ? 'b1' : 'b0';
  tree.push(edgeBetween(solid, via, `s${lone}`, edges), edgeBetween(solid, via, `s${link}`, edges), edgeBetween(solid, rest, `s${other}`, edges));
  return tree.every(Boolean) && link !== lone ? tree : null;
}

// ── 펼친 전개도의 검사 · 놓기 ─────────────────────
/** 펼친 그림에서 면끼리 겹치지 않고(넓이), 트리로 이은 곳 말고는 변이 맞닿지 않는다(그래야 그린 대로 접힌다) */
export function flatOk(net) {
  const { faces } = net;
  for (let i = 0; i < faces.length; i += 1) {
    for (let j = i + 1; j < faces.length; j += 1) if (convexIntersectionArea(faces[i].poly, faces[j].poly) > 1e-6) return false;
  }
  return findHinges(net).length === faces.length - 1;
}

/** 전개도를 왼쪽 위가 (0, 0)이 되게 옮기고, 각도 turn(라디안)만큼 돌린다 (면 id·이름·차례는 그대로) */
export function turnNet(net, turn = 0) {
  const [c, s] = [Math.cos(turn), Math.sin(turn)];
  const moved = net.faces.map((f) => ({ ...f, poly: f.poly.map(([x, y]) => [x * c - y * s, x * s + y * c]) }));
  const { min } = bounds(moved.flatMap((f) => f.poly));
  return { ...net, faces: moved.map((f) => ({ ...f, poly: f.poly.map(([x, y]) => [tidy(x - min[0]), tidy(y - min[1])]) })) };
}

/** 전개도의 가로 · 세로 크기 */
export function netBox(net) {
  const { min, max } = bounds(net.faces.flatMap((f) => f.poly));
  return [tidy(max[0] - min[0]), tidy(max[1] - min[1])];
}

/**
 * 띠(옆면이 가장 많이 이어진 줄)를 가로로 눕힌 두 놓기(0° · 180°): 옆면이 모두 가로·세로 변의 직사각형이 된다(낯선 꼴의 홀로 붙은 옆면은 비스듬할 수 있다).
 * 뒤집기는 하지 않는다 — 뒤집은 전개도는 거울에 비친 입체가 되어 비어요 자리가 어긋난다
 */
export function stripOrientations(net) {
  const sides = net.faces.filter((f) => f.role === 'side');
  const hinges = findHinges(net);
  const degree = (f) => hinges.filter((hg) => (hg.a === f.id || hg.b === f.id) && [hg.a, hg.b].every((id) => net.faces.find((x) => x.id === id)?.role === 'side')).length;
  const main = sides.reduce((best, f) => (degree(f) > degree(best) ? f : best), sides[0]);
  const [p, q] = main.poly;
  const angle = -Math.atan2(q[1] - p[1], q[0] - p[0]);
  return [turnNet(net, angle), turnNet(net, angle + Math.PI)];
}

// ── 전개도 모양의 열쇠 (돌리기·뒤집기로 겹치면 같은 열쇠) ─────────────
const round = (v, digits) => {
  const r = Math.round(v * 10 ** digits) / 10 ** digits;
  return Object.is(r, -0) ? 0 : r;
};

/** 다각형 하나의 글자열: 꼭짓점을 반올림해 가장 작은 꼭짓점부터, 두 도는 방향 가운데 작은 쪽 */
function polygonText(points, digits) {
  const txt = points.map(([x, y]) => `${round(x, digits)},${round(y, digits)}`);
  const n = txt.length;
  let best = null;
  for (const seq of [txt, [...txt].reverse()]) {
    for (let k = 0; k < n; k += 1) {
      const s = [...seq.slice(k), ...seq.slice(0, k)].join(' ');
      if (best == null || s < best) best = s;
    }
  }
  return best;
}

/**
 * 다각형 면 전개도의 모양 열쇠: 면의 변 하나를 x축에 맞춰 놓은(앞·뒤 두 가지) 모든 놓기 가운데 가장 작은 글자열 (spec 16-2의 각기둥 netKey).
 * 면의 종류(밑면·옆면)는 넣고(roles: false면 넣지 않는다 — 직육면체처럼 크기가 같은 면은 서로 바꿔도 같은 모양), 면의 이름은 넣지 않는다
 */
export function polyNetKey(net, { digits = 4, roles = true } = {}) {
  let best = null;
  // 기준으로 삼을 변: 면의 종류를 넣으면 밑면의 변만으로 충분하다(돌리기·뒤집기는 밑면을 밑면으로 옮긴다) — 빠르다
  const anchors = roles && net.faces.some((f) => f.role === 'base') ? net.faces.filter((f) => f.role === 'base') : net.faces;
  for (const anchor of anchors) {
    anchor.poly.forEach((a, i) => {
      const b = anchor.poly[(i + 1) % anchor.poly.length];
      // 변의 두 방향 × 앞·뒤: 뒤집힌 전개도는 면의 꼭짓점이 거꾸로 돈다
      for (const [p, q, mirror] of [[a, b, 1], [a, b, -1], [b, a, 1], [b, a, -1]]) {
        const angle = Math.atan2(q[1] - p[1], q[0] - p[0]);
        const [c, s] = [Math.cos(-angle), Math.sin(-angle)];
        const move = ([x, y]) => {
          const [dx, dy] = [x - p[0], y - p[1]];
          return [dx * c - dy * s, mirror * (dx * s + dy * c)];
        };
        const txt = net.faces.map((f) => `${roles ? (f.role === 'base' ? 'B' : 'S') : ''}${polygonText(f.poly.map(move), digits)}`).sort().join(';');
        if (best == null || txt < best) best = txt;
      }
    });
  }
  return best;
}

/**
 * 그 각기둥의 서로 다른 전개도 모두 (돌리기·뒤집기로 겹치면 같은 것, 펼친 그림에서 면이 겹치는 것은 뺀다): [{ key, net, form, tree }].
 * 신장 트리를 모두 펼쳐 센다(정삼각기둥은 9가지 — 검사 tests/unit/net-workshop-prism.test.js)
 */
export function prismNetCatalog(solid) {
  const byKey = new Map();
  for (const tree of spanningTrees(solid)) {
    const net = prismNet(solid, tree);
    if (!flatOk(net)) continue;
    const k = polyNetKey(net);
    if (!byKey.has(k)) byKey.set(k, { key: k, net, form: treeForm(solid, tree), tree });
  }
  return [...byKey.keys()].sort().map((k) => byKey.get(k));
}

/** 면의 가운데(무게중심, 꼭짓점의 평균) [x, y] */
export const faceMid = (face) => {
  const [x, y] = centroid(face.poly);
  return [x, y];
};
