/**
 * 전개도 모델과 접기 판정 (순수 함수). 화면(view3d.js)과 판정이 같은 계산을 쓴다.
 *
 * 전개도: { kind: 'cube', faces: [{ id, role, label, poly: [[x, y], ...], cell? }], root }
 * - 면은 다각형이라 직육면체·각기둥으로 넓힐 수 있다. 정육면체는 격자 칸(fromCells)으로 만든다.
 * - 펼친 전개도는 z = 0 평면에 있고, 앞면(글자가 있는 쪽)은 +z를 본다.
 * - 경첩은 저장하지 않고 2D에서 찾는다: 두 면의 변이 같은 직선 위에서 길이 > 0만큼 겹치면 경첩.
 * - 모든 경첩은 같은 쪽(종이 뒤, -z)으로 접는다. 그래서 앞면이 입체의 바깥을 본다.
 */
import {
  EPS,
  applyDir,
  applyPoint,
  bounds,
  centroid,
  collinearOverlap,
  convexIntersectionArea,
  cross,
  dot,
  identity,
  interiorAngle,
  length,
  multiply,
  normalize,
  pointKey,
  rotationAbout,
  samePoint,
  scale,
  sub,
  to3,
} from './geometry.js';

export const LABELS = ['가', '나', '다', '라', '마', '바', '사', '아'];

/** 입체마다 있어야 할 면의 수 */
export const FACE_COUNT = { cube: 6 };

// ── 격자 칸 (정육면체 전개도) ────────────────
export const cellKey = ([x, y]) => `${x},${y}`;

/** 가장 왼쪽 위 칸이 (0, 0) 근처가 되게 옮기고, 위→아래, 왼쪽→오른쪽 순으로 정렬 */
export function normalizeCells(cells) {
  const minX = Math.min(...cells.map((c) => c[0]));
  const minY = Math.min(...cells.map((c) => c[1]));
  return cells
    .map(([x, y]) => [x - minX, y - minY])
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

// 돌리기 4가지 × 뒤집기 2가지
const SYMMETRIES = [
  ([x, y]) => [x, y],
  ([x, y]) => [-y, x],
  ([x, y]) => [-x, -y],
  ([x, y]) => [y, -x],
  ([x, y]) => [-x, y],
  ([x, y]) => [y, x],
  ([x, y]) => [x, -y],
  ([x, y]) => [-y, -x],
];
export const SYMMETRY_COUNT = SYMMETRIES.length;

/** k번째 돌리기·뒤집기를 한 칸 목록 (0 ≤ k < 8). 칸 순서는 그대로 둔다. */
export function transformCells(cells, k) {
  const moved = cells.map(SYMMETRIES[k]);
  const minX = Math.min(...moved.map((c) => c[0]));
  const minY = Math.min(...moved.map((c) => c[1]));
  return moved.map(([x, y]) => [x - minX, y - minY]);
}

const keyOfCells = (cells) => normalizeCells(cells).map(cellKey).join(';');

/** 돌리거나 뒤집어도 같은 모양이면 같은 키 */
export function shapeKey(cells) {
  return SYMMETRIES.map((_, k) => keyOfCells(transformCells(cells, k))).sort()[0];
}

const NEIGHBOR_STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** 칸 목록 바로 옆(변으로 붙은)의 빈 칸 */
export function emptyNeighbors(cells) {
  const taken = new Set(cells.map(cellKey));
  const out = new Map();
  for (const [x, y] of cells) {
    for (const [dx, dy] of NEIGHBOR_STEPS) {
      const c = [x + dx, y + dy];
      if (!taken.has(cellKey(c))) out.set(cellKey(c), c);
    }
  }
  return [...out.values()].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

/** 크기 n인 자유 폴리오미노(돌리기·뒤집기로 같은 것은 하나)를 모두 나열한다 */
export function polyominoes(n) {
  let level = new Map([[keyOfCells([[0, 0]]), [[0, 0]]]]);
  for (let size = 2; size <= n; size += 1) {
    const next = new Map();
    for (const cells of level.values()) {
      for (const c of emptyNeighbors(cells)) {
        const grown = [...cells, c];
        const key = shapeKey(grown);
        if (!next.has(key)) next.set(key, normalizeCells(grown));
      }
    }
    level = next;
  }
  return n < 1 ? [] : [...level.values()];
}

/** 네 칸이 2×2로 모인 덩어리가 있나 */
export function hasBlock2x2(cells) {
  const taken = new Set(cells.map(cellKey));
  return cells.some(([x, y]) => [[x + 1, y], [x, y + 1], [x + 1, y + 1]].every((c) => taken.has(cellKey(c))));
}

/**
 * 격자 칸으로 정육면체 전개도를 만든다. 칸 하나 = 한 변이 1인 정사각형 면.
 * 바닥에 남는 면(root)은 이웃이 가장 많은 면(같으면 가운데에 가까운 면).
 */
export function fromCells(cells, { labels = LABELS, kind = 'cube' } = {}) {
  const faces = cells.map(([x, y], i) => ({
    id: `f${i}`,
    role: 'face',
    label: labels[i] ?? String(i + 1),
    cell: [x, y],
    poly: [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]],
  }));
  const taken = new Set(cells.map(cellKey));
  const { min, max } = bounds(cells.map(([x, y]) => [x + 0.5, y + 0.5]));
  const mid = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2];
  const score = ([x, y]) => {
    const degree = NEIGHBOR_STEPS.filter(([dx, dy]) => taken.has(cellKey([x + dx, y + dy]))).length;
    return degree * 100 - Math.hypot(x + 0.5 - mid[0], y + 0.5 - mid[1]);
  };
  let best = 0;
  cells.forEach((c, i) => {
    if (score(c) > score(cells[best]) + EPS) best = i;
  });
  return { kind, faces, root: faces[best]?.id ?? null };
}

// ── 경첩과 신장 트리 ─────────────────────────
const edgesOf = (poly) => poly.map((p, i) => [p, poly[(i + 1) % poly.length]]);

/** 펼친 전개도에서 경첩(변이 같은 직선 위에서 겹치는 두 면)을 찾는다 */
export function findHinges(net) {
  const hinges = [];
  const { faces } = net;
  for (let i = 0; i < faces.length; i += 1) {
    for (let j = i + 1; j < faces.length; j += 1) {
      edgesOf(faces[i].poly).forEach(([p1, p2], ea) => {
        edgesOf(faces[j].poly).forEach(([q1, q2], eb) => {
          const overlap = collinearOverlap(p1, p2, q1, q2);
          if (overlap) {
            hinges.push({ a: faces[i].id, b: faces[j].id, ea, eb, from: overlap.from, to: overlap.to, length: overlap.length });
          }
        });
      });
    }
  }
  return hinges;
}

/** root에서 너비 우선으로 신장 트리를 고른다. 고리의 남는 경첩은 접을 때 떨어진다. */
export function spanningTree(net, hinges = findHinges(net)) {
  const parent = new Map();
  const order = net.root ? [net.root] : [];
  const seen = new Set(order);
  for (let i = 0; i < order.length; i += 1) {
    const id = order[i];
    for (const hinge of hinges) {
      const other = hinge.a === id ? hinge.b : hinge.b === id ? hinge.a : null;
      if (other == null || seen.has(other)) continue;
      seen.add(other);
      parent.set(other, hinge);
      order.push(other);
    }
  }
  return { parent, order, treeHinges: [...parent.values()] };
}

/** 경첩을 접는 각도(라디안). 정육면체는 모두 90°. */
export function hingeAngle(/* net, hinge */) {
  return Math.PI / 2;
}

const structureCache = new WeakMap();
function structureOf(net) {
  let s = structureCache.get(net);
  if (!s) {
    const hinges = findHinges(net);
    s = { hinges, tree: spanningTree(net, hinges) };
    structureCache.set(net, s);
  }
  return s;
}

/**
 * 전개도를 t만큼 접는다 (0 = 펼침, 1 = 다 접음). tOf(hinge, t)로 경첩마다 다르게 접을 수 있다.
 * 돌려주는 값: faces[{ id, matrix, points, normal, center }] — matrix는 펼친 좌표 → 3D
 */
export function foldNet(net, t = 1, { tOf = null } = {}) {
  const { hinges, tree } = structureOf(net);
  const byId = new Map(net.faces.map((f) => [f.id, f]));
  const matrices = new Map();
  if (net.root) matrices.set(net.root, identity());
  for (const id of tree.order.slice(1)) {
    const hinge = tree.parent.get(id);
    const parentId = hinge.a === id ? hinge.b : hinge.a;
    const p = to3(hinge.from);
    const d = normalize(sub(to3(hinge.to), p));
    // 경첩에서 자식 면 쪽을 향하는 방향 w. 회전 뒤 w가 -z(종이 뒤)로 가도록 방향을 고른다.
    const w = sub(centroid(byId.get(id).poly), p);
    const wPerp = sub(w, scale(d, dot(w, d)));
    const side = Math.sign(cross(d, wPerp)[2]) || 1;
    const amount = tOf ? tOf(hinge, t) : t;
    const angle = -side * hingeAngle(net, hinge) * amount;
    matrices.set(id, multiply(matrices.get(parentId), rotationAbout(p, d, angle)));
  }
  const faces = net.faces.map((f) => {
    const matrix = matrices.get(f.id) ?? identity(); // 떨어진 면은 펼친 자리에 그대로
    const points = f.poly.map((q) => applyPoint(matrix, q));
    return { id: f.id, matrix, points, normal: normalize(applyDir(matrix, [0, 0, 1])), center: centroid(points) };
  });
  return { faces, hinges, tree };
}

// ── 판정 ─────────────────────────────────
/** 펼친 상태에서 면이 360°를 둘러싼 꼭짓점 (2×2 덩어리의 가운데) */
export function fullVertices(net) {
  const byKey = new Map();
  for (const f of net.faces) {
    f.poly.forEach((p, i) => {
      const key = pointKey(p);
      const entry = byKey.get(key) ?? { point: [p[0], p[1]], angle: 0, faces: [] };
      entry.angle += interiorAngle(f.poly, i);
      entry.faces.push(f.id);
      byKey.set(key, entry);
    });
  }
  return [...byKey.values()].filter((v) => v.angle >= 2 * Math.PI - 1e-6);
}

/** 3D 면 하나를 그 평면의 2D 좌표로 */
function planeCoords(face, basisFace) {
  const o = basisFace.points[0];
  const u = normalize(sub(basisFace.points[1], o));
  const v = cross(basisFace.normal, u);
  return face.points.map((p) => [dot(sub(p, o), u), dot(sub(p, o), v)]);
}

/** 다 접은 뒤 같은 평면에서 넓이가 겹치는 면 쌍 */
export function overlappingPairs(folded) {
  const pairs = [];
  const { faces } = folded;
  for (let i = 0; i < faces.length; i += 1) {
    for (let j = i + 1; j < faces.length; j += 1) {
      const a = faces[i];
      const b = faces[j];
      if (Math.abs(Math.abs(dot(a.normal, b.normal)) - 1) > 1e-6) continue;
      if (Math.abs(dot(a.normal, sub(b.points[0], a.points[0]))) > 1e-6) continue;
      if (convexIntersectionArea(planeCoords(a, a), planeCoords(b, a)) > 1e-6) pairs.push([a.id, b.id]);
    }
  }
  return pairs;
}

const isTreeEdge = (tree, faceId, edge) =>
  tree.treeHinges.some((hg) => (hg.a === faceId && hg.ea === edge) || (hg.b === faceId && hg.eb === edge));

/** 접은 뒤 경첩(트리)이 아닌 변들 — 다른 면의 변과 맞닿아야 입체가 닫힌다 */
export function boundaryEdges(net, folded = foldNet(net, 1)) {
  const { tree } = structureOf(net);
  const out = [];
  for (const f of folded.faces) {
    f.points.forEach((p, i) => {
      if (isTreeEdge(tree, f.id, i)) return;
      out.push({ face: f.id, edge: i, from: p, to: f.points[(i + 1) % f.points.length] });
    });
  }
  return out;
}

const sameSegment = (e, g) =>
  (samePoint(e.from, g.from, 1e-6) && samePoint(e.to, g.to, 1e-6))
  || (samePoint(e.from, g.to, 1e-6) && samePoint(e.to, g.from, 1e-6));

/** 접은 뒤 경첩(트리) 선분. 경계 변이 여기에 닿으면 한 모서리에 세 면이 모인 것 */
function hingeSegments(net, folded) {
  const { tree } = structureOf(net);
  const byId = new Map(folded.faces.map((f) => [f.id, f]));
  return tree.treeHinges.map((hg) => {
    const pts = byId.get(hg.a).points;
    return { face: hg.a, faces: [hg.a, hg.b], edge: hg.ea, from: pts[hg.ea], to: pts[(hg.ea + 1) % pts.length], hinge: true };
  });
}

/** 경계 변 하나와 맞닿는 다른 면의 변: 꼭 맞는 것(exact)과 일부만 겹치는 것(partial) */
function edgeContacts(edge, all, hinges = []) {
  const exact = [];
  const partial = [];
  for (const g of all) {
    if (g.face === edge.face) continue;
    if (!collinearOverlap(edge.from, edge.to, g.from, g.to)) continue;
    if (sameSegment(edge, g)) exact.push(g);
    else partial.push(g);
  }
  for (const g of hinges) {
    if (g.faces.includes(edge.face) || !collinearOverlap(edge.from, edge.to, g.from, g.to)) continue;
    if (sameSegment(edge, g)) exact.push(g);
  }
  return { exact, partial };
}

/**
 * 접었을 때 맞닿는 변. 경첩 변이면 경첩 건너편 변, 아니면 접은 뒤 정확히 겹치는 다른 면의 변.
 * 짝이 없거나 둘 이상이면 null.
 */
export function matchingEdge(net, faceId, edgeIndex) {
  const { tree } = structureOf(net);
  const hinge = tree.treeHinges.find((hg) => (hg.a === faceId && hg.ea === edgeIndex) || (hg.b === faceId && hg.eb === edgeIndex));
  if (hinge) return hinge.a === faceId ? { face: hinge.b, edge: hinge.eb } : { face: hinge.a, edge: hinge.ea };
  const folded = foldNet(net, 1);
  const all = boundaryEdges(net, folded);
  const edge = all.find((e) => e.face === faceId && e.edge === edgeIndex);
  if (!edge) return null;
  const { exact, partial } = edgeContacts(edge, all, hingeSegments(net, folded));
  return exact.length === 1 && partial.length === 0 && !exact[0].hinge ? { face: exact[0].face, edge: exact[0].edge } : null;
}

/**
 * 전개도가 입체로 접히는지 검사한다.
 * 돌려주는 값: { ok, problems: [{ type, faces?, edges?, lengths?, vertex?, count? }] }
 * type: 'face-count' | 'disconnected' | 'vertex-full' | 'overlap' | 'gap' | 'edge-length'
 */
export function checkNet(net) {
  const problems = [];
  const expected = FACE_COUNT[net.kind];
  if (expected && net.faces.length !== expected) {
    problems.push({ type: 'face-count', count: net.faces.length, expected });
  }

  const { tree } = structureOf(net);
  if (tree.order.length < net.faces.length) {
    problems.push({ type: 'disconnected', faces: net.faces.map((f) => f.id).filter((id) => !tree.order.includes(id)) });
  }

  for (const v of fullVertices(net)) problems.push({ type: 'vertex-full', vertex: v.point, faces: v.faces });

  const folded = foldNet(net, 1);
  const pairs = overlappingPairs(folded);
  for (const faces of pairs) problems.push({ type: 'overlap', faces });

  const all = boundaryEdges(net, folded);
  const hinges = hingeSegments(net, folded);
  const gaps = [];
  const seenLength = new Set();
  let edgeOverlap = null;
  for (const e of all) {
    const { exact, partial } = edgeContacts(e, all, hinges);
    if (exact.length === 0 && partial.length === 0) gaps.push(e);
    for (const g of partial) {
      const key = [e.face, g.face].sort().join('|');
      if (seenLength.has(key)) continue;
      seenLength.add(key);
      problems.push({ type: 'edge-length', faces: [e.face, g.face], lengths: [length(sub(e.to, e.from)), length(sub(g.to, g.from))] });
    }
    if (exact.length >= 2 && !edgeOverlap) edgeOverlap = [...new Set([e.face, ...exact.flatMap((g) => g.faces ?? [g.face])])];
  }
  // 한 변에 셋 이상이 모이면 겹침. 면끼리 겹친 것을 이미 찾았으면 따로 적지 않는다.
  if (edgeOverlap && pairs.length === 0) problems.push({ type: 'overlap', faces: edgeOverlap });
  if (gaps.length > 0) {
    problems.push({ type: 'gap', faces: [...new Set(gaps.map((e) => e.face))], edges: gaps.map((e) => ({ face: e.face, edge: e.edge })) });
  }
  return { ok: problems.length === 0, problems };
}

/** 접은 뒤 그 면과 법선이 반대인 면(마주 보는 면) */
export function oppositeFace(net, id) {
  const { faces } = foldNet(net, 1);
  const face = faces.find((f) => f.id === id);
  if (!face) return null;
  return faces.find((f) => f.id !== id && dot(f.normal, face.normal) < -1 + 1e-6)?.id ?? null;
}

/** 접은 입체의 꼭짓점·모서리·면 수 (V − E + F = 2 검사용) */
export function solidStats(folded) {
  const vertices = new Set();
  const edges = new Set();
  for (const f of folded.faces) {
    const keys = f.points.map(pointKey);
    keys.forEach((k, i) => {
      vertices.add(k);
      edges.add([k, keys[(i + 1) % keys.length]].sort().join('|'));
    });
  }
  return { V: vertices.size, E: edges.size, F: folded.faces.length };
}

/**
 * 정육면체가 될 6자리. root 면(한 변 1)이 윗면이고 입체는 그 아래(-z)에 있다.
 * 자리마다 { name, center, normal, u, v } — u·v는 그 자리 정사각형의 두 변 방향.
 * v는 글자의 아래쪽(옆면은 입체의 아래 -z), u = v × normal 이라 바깥에서 글자가 바로 보인다.
 */
export function cubeSlots(net) {
  const root = net.faces.find((f) => f.id === net.root);
  if (!root) return [];
  const { min } = bounds(root.poly);
  const [x, y] = min;
  const slot = (name, center, normal, v) => ({ name, center, normal, u: cross(v, normal), v });
  const down = [0, 0, -1];
  return [
    slot('top', [x + 0.5, y + 0.5, 0], [0, 0, 1], [0, 1, 0]),
    slot('bottom', [x + 0.5, y + 0.5, -1], [0, 0, -1], [0, 1, 0]),
    slot('left', [x, y + 0.5, -0.5], [-1, 0, 0], down),
    slot('right', [x + 1, y + 0.5, -0.5], [1, 0, 0], down),
    slot('back', [x + 0.5, y, -0.5], [0, -1, 0], down),
    slot('front', [x + 0.5, y + 1, -0.5], [0, 1, 0], down),
  ];
}

/** 다 접었을 때 아무 면도 오지 않은 자리 (정육면체만) */
export function missingSlots(net, folded = foldNet(net, 1)) {
  if (net.kind !== 'cube') return [];
  return cubeSlots(net).filter((s) => !folded.faces.some((f) => samePoint(f.center, s.center, 1e-4)));
}

/**
 * 5면 전개도에 한 면을 더 붙일 수 있는 자리마다 판정한다.
 * 돌려주는 값: [{ cell, key, ok, problems }]
 */
export function completionSlots(cells, options = {}) {
  return emptyNeighbors(cells).map((cell) => {
    const result = checkNet(fromCells([...cells, cell], options));
    return { cell, key: cellKey(cell), ...result };
  });
}
