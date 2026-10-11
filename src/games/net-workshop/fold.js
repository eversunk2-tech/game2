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
export const FACE_COUNT = { cube: 6, cuboid: 6 };

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

const edgeLength = (face, i) => length(sub(to3(face.poly[(i + 1) % face.poly.length]), to3(face.poly[i])));

/** 경첩이 두 변에 꼭 맞나 (두 변의 길이가 같고 끝과 끝이 맞음). 아니면 일부만 맞닿은 경첩 */
export function isFullHinge(net, hinge) {
  const a = net.faces.find((f) => f.id === hinge.a);
  const b = net.faces.find((f) => f.id === hinge.b);
  return Math.abs(edgeLength(a, hinge.ea) - hinge.length) < 1e-6 && Math.abs(edgeLength(b, hinge.eb) - hinge.length) < 1e-6;
}

/**
 * 맞닿은 곳이 고리를 이룰 때(면 수 − 1보다 경첩이 많을 때) 접는 경첩을 바닥 면(root)과 무관하게 고른다:
 * 꼭 맞는 경첩 먼저, 길게 맞닿은 것 먼저. 정육면체(격자 칸)는 지금까지처럼 root에서 너비 우선으로 고른다 — 판정이 달라지지 않게.
 */
function pickHinges(net, hinges) {
  if (net.kind === 'cube' || hinges.length < net.faces.length) return hinges;
  const group = new Map(net.faces.map((f) => [f.id, f.id]));
  const find = (id) => (group.get(id) === id ? id : find(group.get(id)));
  const ranked = hinges
    .map((hinge, i) => ({ hinge, i, full: isFullHinge(net, hinge) }))
    .sort((p, q) => Number(q.full) - Number(p.full) || q.hinge.length - p.hinge.length || p.i - q.i);
  const kept = new Set();
  for (const { hinge } of ranked) {
    const [ga, gb] = [find(hinge.a), find(hinge.b)];
    if (ga === gb) continue;
    group.set(ga, gb);
    kept.add(hinge);
  }
  return hinges.filter((hinge) => kept.has(hinge));
}

/** root에서 너비 우선으로 신장 트리를 고른다. 고리의 남는 경첩은 접을 때 떨어진다. */
export function spanningTree(net, allHinges = findHinges(net)) {
  const hinges = net.tree ? allHinges.filter((hg) => net.tree.some(([a, b]) => (hg.a === a && hg.b === b) || (hg.a === b && hg.b === a))) : pickHinges(net, allHinges);
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
  // 다른 면의 변 한가운데에 놓인 꼭짓점: 그 면이 반 바퀴(180°)를 막는다. 한 변이 1인 격자 칸(정육면체)에서는 생기지 않는다
  for (const entry of byKey.values()) {
    for (const f of net.faces) {
      if (entry.faces.includes(f.id)) continue;
      const onEdge = edgesOf(f.poly).some(([p, q]) => {
        const d = sub(to3(q), to3(p));
        const len = length(d);
        const w = sub(to3(entry.point), to3(p));
        const along = dot(w, d) / len;
        return along > 1e-6 && along < len - 1e-6 && length(cross(w, d)) / len < 1e-6;
      });
      if (!onEdge) continue;
      entry.angle += Math.PI;
      entry.faces.push(f.id);
    }
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
 * 모든 면이 경첩(변이 길이 > 0만큼 맞닿음)으로 이어져 한 장인가. 꼭짓점만 닿은 면은 이어진 것이 아니다.
 * checkNet의 'disconnected' 검사와 같은 계산이다.
 */
export function isConnected(net) {
  if (net.faces.length === 0) return false;
  return structureOf(net).tree.order.length === net.faces.length;
}

/** 면의 크기 [짧은 변, 긴 변] (직사각형 면) */
export function faceSize(face) {
  const { min, max } = bounds(face.poly);
  const w = Math.round((max[0] - min[0]) * 1e6) / 1e6;
  const h = Math.round((max[1] - min[1]) * 1e6) / 1e6;
  return w <= h ? [w, h] : [h, w];
}

/**
 * 직육면체: 크기가 같은 면이 두 장씩 세 쌍이어야 한다(마주 보는 면은 합동). 짝이 없는 면의 id를 돌려준다.
 * dims(세 모서리의 길이)를 알면 그 직육면체의 면(a×b · b×c · a×c 두 장씩)과 견주고, 모르면 같은 크기끼리 둘씩 짝만 짓는다.
 */
export function unpairedFaces(net) {
  if (net.kind !== 'cuboid') return [];
  const keyOf = (size) => size.join('x');
  const left = new Map();
  if (net.dims) {
    const [a, b, c] = net.dims;
    for (const size of [[a, b], [b, c], [a, c]]) {
      const key = keyOf(size[0] <= size[1] ? size : [size[1], size[0]]);
      left.set(key, (left.get(key) ?? 0) + 2);
    }
  }
  const out = [];
  const waiting = new Map(); // dims를 모를 때: 짝을 기다리는 면
  for (const f of net.faces) {
    const key = keyOf(faceSize(f));
    if (net.dims) {
      if ((left.get(key) ?? 0) > 0) left.set(key, left.get(key) - 1);
      else out.push(f.id);
    } else if (waiting.has(key)) waiting.delete(key);
    else waiting.set(key, f.id);
  }
  return [...out, ...waiting.values()];
}

/**
 * 전개도가 입체로 접히는지 검사한다.
 * 돌려주는 값: { ok, problems: [{ type, faces?, edges?, lengths?, vertex?, count? }] }
 * type: 'face-count' | 'disconnected' | 'vertex-full' | 'overlap' | 'face-pair' | 'gap' | 'edge-length'
 *   edge-length: 맞닿는 두 변의 길이가 다르다 — edges: [{ face, edge }, { face, edge }] 그 두 변, lengths: 두 변의 길이,
 *     hinge: 펼친 전개도에서 이어 붙인 두 변(경첩)이면 true, shifted: 길이는 같은데 어긋나게 붙었으면 true
 *   face-pair: 직육면체인데 크기가 같은 면이 두 장씩이 아니다 — faces: 짝이 없는 면
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

  const unpaired = unpairedFaces(net);
  if (unpaired.length > 0) problems.push({ type: 'face-pair', faces: unpaired });

  const all = boundaryEdges(net, folded);
  const hinges = hingeSegments(net, folded);
  const gaps = [];
  const seenLength = new Set();
  // 이어 붙인 두 변(경첩)이 꼭 맞지 않는다: 길이가 다르거나(lengths가 다름) 어긋나게 붙었다(shifted). 한 변이 1인 격자 칸에서는 생기지 않는다
  for (const hg of tree.treeHinges) {
    if (isFullHinge(net, hg)) continue;
    const lengths = [edgeLength(net.faces.find((f) => f.id === hg.a), hg.ea), edgeLength(net.faces.find((f) => f.id === hg.b), hg.eb)];
    seenLength.add([hg.a, hg.b].sort().join('|'));
    problems.push({
      type: 'edge-length', faces: [hg.a, hg.b], lengths, hinge: true, shifted: Math.abs(lengths[0] - lengths[1]) < 1e-6,
      edges: [{ face: hg.a, edge: hg.ea }, { face: hg.b, edge: hg.eb }],
    });
  }
  let edgeOverlap = null;
  for (const e of all) {
    const { exact, partial } = edgeContacts(e, all, hinges);
    if (exact.length === 0 && partial.length === 0) gaps.push(e);
    for (const g of partial) {
      const key = [e.face, g.face].sort().join('|');
      if (seenLength.has(key)) continue;
      seenLength.add(key);
      problems.push({
        type: 'edge-length', faces: [e.face, g.face], lengths: [length(sub(e.to, e.from)), length(sub(g.to, g.from))],
        edges: [{ face: e.face, edge: e.edge }, { face: g.face, edge: g.edge }],
      });
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

/**
 * 직육면체가 될 6자리. root 면이 윗면이고 입체는 그 아래(-z)에 있다. 자리마다 cubeSlots와 같은 값 + size: [u 쪽 길이, v 쪽 길이].
 * root 면의 두 변이 세 모서리 길이(net.dims) 가운데 둘이 아니면(크기를 바꾼 면) 자리를 정할 수 없어 빈 목록.
 */
export function cuboidSlots(net) {
  const root = net.faces.find((f) => f.id === net.root);
  if (!root || !Array.isArray(net.dims)) return [];
  const { min, max } = bounds(root.poly);
  const [x, y] = min;
  const w = max[0] - min[0];
  const h = max[1] - min[1];
  const rest = [...net.dims];
  for (const side of [w, h]) {
    const i = rest.findIndex((v) => Math.abs(v - side) < 1e-6);
    if (i < 0) return [];
    rest.splice(i, 1);
  }
  const d = rest[0];
  const slot = (name, center, normal, v, size) => ({ name, center, normal, u: cross(v, normal), v, size });
  const down = [0, 0, -1];
  return [
    slot('top', [x + w / 2, y + h / 2, 0], [0, 0, 1], [0, 1, 0], [w, h]),
    slot('bottom', [x + w / 2, y + h / 2, -d], [0, 0, -1], [0, 1, 0], [w, h]),
    slot('left', [x, y + h / 2, -d / 2], [-1, 0, 0], down, [h, d]),
    slot('right', [x + w, y + h / 2, -d / 2], [1, 0, 0], down, [h, d]),
    slot('back', [x + w / 2, y, -d / 2], [0, -1, 0], down, [w, d]),
    slot('front', [x + w / 2, y + h, -d / 2], [0, 1, 0], down, [w, d]),
  ];
}

/** 다 접었을 때 아무 면도 오지 않은 자리 (정육면체 · 직육면체) */
export function missingSlots(net, folded = foldNet(net, 1)) {
  if (net.kind === 'cuboid') {
    // 그 자리의 평면에 놓여 자리의 4분의 1 넘게 덮은 면이 있으면 찬 자리 (크기가 조금 다른 면이 와도 찬 것으로 본다 — 길이는 따로 짚는다)
    return cuboidSlots(net).filter((s) => {
      const corner = sub(sub(s.center, scale(s.u, s.size[0] / 2)), scale(s.v, s.size[1] / 2));
      const area = [[0, 0], [s.size[0], 0], [s.size[0], s.size[1]], [0, s.size[1]]];
      return !folded.faces.some((f) => {
        if (Math.abs(Math.abs(dot(f.normal, s.normal)) - 1) > 1e-6 || Math.abs(dot(s.normal, sub(f.points[0], s.center))) > 1e-6) return false;
        const poly = f.points.map((p) => [dot(sub(p, corner), s.u), dot(sub(p, corner), s.v)]);
        return convexIntersectionArea(area, poly) > 0.25 * s.size[0] * s.size[1];
      });
    });
  }
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

// ── 입체를 펼쳐 전개도 만들기 (직육면체. 각기둥도 같은 함수로 펼친다) ─────────────────
/**
 * 직육면체 [0, a] × [0, b] × [0, c]. 입체: { kind, dims, faces: [{ id, role, points: [[x, y, z], ...] }] }
 * 면의 꼭짓점은 바깥에서 볼 때 반시계 방향이다(바깥 법선 = (p1 − p0) × (p2 − p0)).
 */
export function cuboid(a, b, c) {
  const faces = [
    ['top', [[0, 0, c], [a, 0, c], [a, b, c], [0, b, c]]],
    ['bottom', [[0, 0, 0], [0, b, 0], [a, b, 0], [a, 0, 0]]],
    ['front', [[0, 0, 0], [a, 0, 0], [a, 0, c], [0, 0, c]]],
    ['back', [[a, b, 0], [0, b, 0], [0, b, c], [a, b, c]]],
    ['left', [[0, b, 0], [0, 0, 0], [0, 0, c], [0, b, c]]],
    ['right', [[a, 0, 0], [a, b, 0], [a, b, c], [a, 0, c]]],
  ];
  return { kind: 'cuboid', dims: [a, b, c], faces: faces.map(([id, points]) => ({ id, role: 'face', points })) };
}

/** 입체의 모서리: 두 면이 함께 쓰는 변 [{ a, b(면 id), ea, eb(그 면에서 몇 번째 변) }] */
export function solidEdges(solid) {
  const out = [];
  const { faces } = solid;
  for (let i = 0; i < faces.length; i += 1) {
    for (let j = i + 1; j < faces.length; j += 1) {
      faces[i].points.forEach((p, ea) => {
        const q = faces[i].points[(ea + 1) % faces[i].points.length];
        faces[j].points.forEach((r, eb) => {
          const t = faces[j].points[(eb + 1) % faces[j].points.length];
          if ((samePoint(p, t) && samePoint(q, r)) || (samePoint(p, r) && samePoint(q, t))) out.push({ a: faces[i].id, b: faces[j].id, ea, eb });
        });
      });
    }
  }
  return out;
}

/** 입체의 면을 잇는 신장 트리를 모두 나열한다(모서리 묶음의 배열). 직육면체는 384가지 */
export function spanningTrees(solid, edges = solidEdges(solid)) {
  const ids = solid.faces.map((f) => f.id);
  const need = ids.length - 1;
  const out = [];
  const walk = (start, picked, group) => {
    if (picked.length === need) {
      out.push(picked.slice());
      return;
    }
    for (let i = start; i <= edges.length - (need - picked.length); i += 1) {
      const ga = group.get(edges[i].a);
      const gb = group.get(edges[i].b);
      if (ga === gb) continue;
      const next = new Map(group);
      for (const [id, g] of group) if (g === gb) next.set(id, ga);
      picked.push(edges[i]);
      walk(i + 1, picked, next);
      picked.pop();
    }
  };
  walk(0, [], new Map(ids.map((id) => [id, id])));
  return out;
}

const tidy = (v) => {
  const r = Math.round(v * 1e9) / 1e9;
  return Object.is(r, -0) ? 0 : r;
};

/** 전개도를 왼쪽 위가 (0, 0)이 되게 옮긴다 (면의 순서·이름은 그대로) */
function settleNet(net) {
  const { min } = bounds(net.faces.flatMap((f) => f.poly));
  return { ...net, faces: net.faces.map((f) => ({ ...f, poly: f.poly.map(([x, y]) => [tidy(x - min[0]), tidy(y - min[1])]) })) };
}

/** 이웃이 가장 많은 면(같으면 가운데에 가까운 면)을 바닥 면으로 */
function centralFace(net) {
  const hinges = findHinges(net);
  const { min, max } = bounds(net.faces.flatMap((f) => f.poly));
  const mid = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, 0];
  const score = (f) => hinges.filter((hg) => hg.a === f.id || hg.b === f.id).length * 1000 - length(sub(centroid(f.poly), mid));
  let best = net.faces[0] ?? null;
  for (const f of net.faces) if (score(f) > score(best) + EPS) best = f;
  return best?.id ?? null;
}

/**
 * 입체를 신장 트리(tree: solidEdges의 모서리 묶음)를 따라 펼친 전개도. 트리에 없는 모서리는 잘라 편다.
 * 면 id는 입체의 면 순서대로 f0, f1, …(면마다 solid: 입체의 면 id), 이름은 labels 순서. 바깥쪽이 앞면(+z)이라 다시 접으면 입체가 된다.
 */
export function unfold(solid, tree, { labels = LABELS } = {}) {
  const frames = new Map(solid.faces.map((f) => {
    const o = f.points[0];
    const u = normalize(sub(f.points[1], o));
    const n = normalize(cross(sub(f.points[1], o), sub(f.points[2], o)));
    const v = cross(n, u);
    return [f.id, (p) => [dot(sub(p, o), u), dot(sub(p, o), v)]];
  }));
  const byId = new Map(solid.faces.map((f) => [f.id, f]));
  const degree = (id) => tree.filter((e) => e.a === id || e.b === id).length;
  const start = solid.faces.reduce((best, f) => (degree(f.id) > degree(best.id) ? f : best), solid.faces[0]);
  const placed = new Map([[start.id, start.points.map(frames.get(start.id))]]);
  const queue = [start.id];
  while (queue.length > 0) {
    const id = queue.shift();
    for (const e of tree) {
      const other = e.a === id ? e.b : e.b === id ? e.a : null;
      if (other == null || placed.has(other)) continue;
      const at = e.a === id ? e.ea : e.eb; // 놓인 면에서 함께 쓰는 변
      const face = byId.get(id);
      const P = face.points[at];
      const Q = face.points[(at + 1) % face.points.length];
      const [p, q] = [placed.get(id)[at], placed.get(id)[(at + 1) % face.points.length]];
      // 새 면을 제 평면의 2D 좌표로 놓고, 함께 쓰는 변이 놓인 면의 그 변에 오게 돌려 옮긴다(뒤집지 않는다 — 바깥쪽이 그대로 앞면)
      const local = frames.get(other);
      const [lp, lq] = [local(P), local(Q)];
      const turn = Math.atan2(q[1] - p[1], q[0] - p[0]) - Math.atan2(lq[1] - lp[1], lq[0] - lp[0]);
      const [cos, sin] = [Math.cos(turn), Math.sin(turn)];
      placed.set(other, byId.get(other).points.map((point) => {
        const [x, y] = local(point);
        return [p[0] + (x - lp[0]) * cos - (y - lp[1]) * sin, p[1] + (x - lp[0]) * sin + (y - lp[1]) * cos];
      }));
      queue.push(other);
    }
  }
  const net = settleNet({
    kind: solid.kind,
    ...(solid.dims ? { dims: [...solid.dims] } : {}),
    faces: solid.faces.map((f, i) => ({ id: `f${i}`, role: f.role, label: labels[i] ?? String(i + 1), solid: f.id, poly: placed.get(f.id) ?? [] })),
    root: null,
  });
  return { ...net, root: centralFace(net) };
}

/**
 * 직사각형 묶음 [{ x, y, w, h, label? }](cm, 1 cm 격자에 놓은 면 카드)으로 전개도를 만든다. 놓은 자리 그대로다(옮기지 않는다).
 * dims: 만들려는 직육면체의 세 모서리 길이(알면 면의 크기를 그것과 견준다 — checkNet의 'face-pair')
 */
export function fromRects(rects, { labels = LABELS, kind = 'cuboid', dims = null } = {}) {
  const faces = rects.map(({ x, y, w, h, label }, i) => ({
    id: `f${i}`,
    role: 'face',
    label: label ?? labels[i] ?? String(i + 1),
    poly: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]],
  }));
  const net = { kind, ...(dims ? { dims: [...dims] } : {}), faces, root: null };
  return { ...net, root: centralFace(net) };
}

/** 면이 차지한 직사각형 { x, y, w, h } (직사각형 면) */
export function faceRect(face) {
  const { min, max } = bounds(face.poly);
  return { x: tidy(min[0]), y: tidy(min[1]), w: tidy(max[0] - min[0]), h: tidy(max[1] - min[1]) };
}

/** k번째 돌리기·뒤집기를 한 전개도 (0 ≤ k < 8). 면의 순서·id·이름은 그대로, 왼쪽 위가 (0, 0) */
export function transformNet(net, k) {
  const moved = settleNet({ ...net, faces: net.faces.map((f) => ({ ...f, poly: f.poly.map(SYMMETRIES[k]) })) });
  return { ...moved, root: net.root };
}

/** 전개도의 가로·세로 크기 [w, h] */
export function netSize(net) {
  const { min, max } = bounds(net.faces.flatMap((f) => f.poly));
  return [tidy(max[0] - min[0]), tidy(max[1] - min[1])];
}

/**
 * 전개도 모양의 열쇠: 돌리거나 뒤집어 겹치면 같은 열쇠. 면마다 차지한 직사각형(자리와 크기)을 적어 8가지 가운데 가장 작은 글자열을 고른다.
 * 면의 이름은 넣지 않는다(크기가 같은 면은 서로 바꿔도 같은 모양). 직사각형 면 전개도(정육면체·직육면체)에 쓴다.
 */
export function netKey(net) {
  let best = null;
  for (let k = 0; k < SYMMETRIES.length; k += 1) {
    const key = transformNet(net, k).faces.map(faceRect)
      .sort((p, q) => p.y - q.y || p.x - q.x || p.w - q.w || p.h - q.h)
      .map((r) => `${r.x},${r.y},${r.w},${r.h}`)
      .join(';');
    if (best == null || key < best) best = key;
  }
  return best;
}

// ── 전개도의 테두리: 꼭짓점 이름(ㄱㄴㄷ…)과 선분 ─────────────────
/** 꼭짓점 이름: 직육면체 전개도의 테두리에는 꼭짓점이 14개 있다 */
export const VERTEX_NAMES = ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

const inFace = (face, point) => {
  // 볼록 다각형 안(변 위는 밖으로 본다)
  let sign = 0;
  return edgesOf(face.poly).every(([p, q]) => {
    const side = (q[0] - p[0]) * (point[1] - p[1]) - (q[1] - p[1]) * (point[0] - p[0]);
    if (Math.abs(side) < 1e-9) return false;
    if (sign === 0) sign = Math.sign(side);
    return Math.sign(side) === sign;
  });
};

/**
 * 한 장으로 이어진 전개도의 테두리를 한 바퀴 돈다. 맨 위 줄의 가장 왼쪽 꼭짓점에서 시작해 화면에서 시계 반대 방향
 * (왼쪽 변을 따라 아래로)으로 돌며 ㄱ, ㄴ, ㄷ … 이름을 붙인다. 면의 꼭짓점이 놓인 곳은 곧게 이어진 곳도 꼭짓점이다.
 * → { vertices: [{ name, point: [x, y], out: [dx, dy](전개도 바깥쪽을 향하는 방향) }],
 *     segments: [{ name('ㄱㄴ'), from, to(꼭짓점 번호), face, edge(그 면의 몇 번째 변), length }] }
 * 테두리가 한 줄이 아니거나(구멍, 꼭짓점만 닿은 면) 꼭짓점이 이름보다 많으면 null
 */
export function outline(net, names = VERTEX_NAMES) {
  const points = new Map();
  for (const f of net.faces) for (const p of f.poly) points.set(pointKey(p), [p[0], p[1]]);
  // 면의 변을 그 위에 놓인 다른 꼭짓점에서 나눈다 → 한 번만 나오는 조각이 테두리
  const pieces = new Map();
  net.faces.forEach((f) => {
    edgesOf(f.poly).forEach(([p, q], edge) => {
      const d = sub(to3(q), to3(p));
      const len = length(d);
      const cuts = [...points.values()]
        .map((point) => ({ point, w: sub(to3(point), to3(p)) }))
        .filter(({ w }) => length(cross(w, d)) / len < 1e-6 && dot(w, d) / len > -1e-6 && dot(w, d) / len < len + 1e-6)
        .sort((m, n) => dot(m.w, d) - dot(n.w, d))
        .map((m) => m.point);
      for (let i = 0; i + 1 < cuts.length; i += 1) {
        const key = [pointKey(cuts[i]), pointKey(cuts[i + 1])].sort().join('|');
        const entry = pieces.get(key) ?? { count: 0 };
        pieces.set(key, { count: entry.count + 1, from: cuts[i], to: cuts[i + 1], face: f.id, edge, whole: cuts.length === 2 });
      }
    });
  });
  const border = [...pieces.values()].filter((piece) => piece.count === 1);
  if (border.length < 3 || border.length > names.length) return null;
  const next = new Map();
  for (const piece of border) {
    for (const [a, b] of [[piece.from, piece.to], [piece.to, piece.from]]) {
      const list = next.get(pointKey(a)) ?? [];
      list.push({ to: b, piece });
      next.set(pointKey(a), list);
    }
  }
  if ([...next.values()].some((list) => list.length !== 2)) return null; // 꼭짓점만 닿은 면·구멍이 있으면 한 줄로 돌 수 없다
  const start = border.flatMap((piece) => [piece.from, piece.to]).reduce((best, p) => (p[1] < best[1] - 1e-9 || (Math.abs(p[1] - best[1]) < 1e-9 && p[0] < best[0]) ? p : best));
  // 시작 꼭짓점에서 아래쪽(y가 커지는 쪽)으로 먼저 간다: 화면에서 시계 반대 방향
  const firstStep = next.get(pointKey(start)).slice().sort((m, n) => n.to[1] - m.to[1])[0];
  const loop = [];
  let at = start;
  let step = firstStep;
  for (let guard = 0; guard <= border.length; guard += 1) {
    loop.push({ point: at, piece: step.piece });
    const cameBy = step.piece;
    at = step.to;
    if (pointKey(at) === pointKey(start)) break;
    step = next.get(pointKey(at)).find((option) => option.piece !== cameBy);
  }
  if (loop.length !== border.length) return null;
  const vertices = loop.map(({ point }, i) => {
    const prev = loop[(i + loop.length - 1) % loop.length].point;
    const after = loop[(i + 1) % loop.length].point;
    const u = normalize(sub(to3(prev), to3(point)));
    const v = normalize(sub(to3(after), to3(point)));
    let out = normalize([u[0] + v[0], u[1] + v[1], 0]);
    if (length(out) < 1e-6) out = [-v[1], v[0], 0]; // 곧게 이어진 곳: 변에 수직인 쪽
    const probe = [point[0] + out[0] * 1e-3, point[1] + out[1] * 1e-3];
    if (net.faces.some((f) => inFace(f, probe))) out = scale(out, -1);
    return { name: names[i], point: [point[0], point[1]], out: [tidy(out[0]), tidy(out[1])] };
  });
  const segments = loop.map(({ piece }, i) => {
    const to = (i + 1) % loop.length;
    return {
      // 선분의 이름은 앞선 글자부터: 마지막 선분은 ㅎㄱ이 아니라 ㄱㅎ
      name: `${names[Math.min(i, to)]}${names[Math.max(i, to)]}`, from: i, to, face: piece.face, edge: piece.whole ? piece.edge : null,
      length: tidy(length(sub(to3(piece.to), to3(piece.from)))),
    };
  });
  return { vertices, segments };
}
