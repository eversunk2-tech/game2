/**
 * 전개도 완성하기(prism-free)의 독립 계산 (검사 전용 — 저장소의 fold.js · geometry.js · solids.js · prism-free-logic.js를 쓰지 않는다).
 * 기획서 문장만 보고 짰다(spec-grade6 1-1절 정리 ①~④ · 2-2절 · 6-2절):
 *   "각기둥의 전개도" = 각기둥의 겉면을 잘라 평평하게 편 그림. 그래서 놓인 면이 각기둥이 되는지는 "면을 하나씩 각기둥의 겉면 자리에 옮겨 놓을 수 있나"로 본다:
 *   첫 면(처음부터 놓인 밑면)을 각기둥의 같은 모양 면에 겹치고, 펼친 그림에서 맞닿은 변을 따라 이웃 면을 그 모서리 건너편 겉면에 겹쳐 간다.
 *   맞닿은 변이 각기둥의 모서리 하나와 꼭 같고(정리 ④ 길이), 옮긴 면이 그 자리 면과 꼭 겹치며(정리 ② · 모양), 자리마다 면이 하나씩(정리 ① · ③ 겹침)이면 된다.
 *   펼친 그림에서 맞닿은 곳이 고리를 이루거나(종이가 이어져 접을 수 없다) 떨어진 면이 있으면 안 된다.
 * 각기둥은 밑면 다각형(반시계 방향 [x, y])과 높이만으로 직접 세운다.
 */
const E = 1e-6;
const d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** 각기둥의 겉면: [{ id, pts: [[x, y, z], …] }] (차례는 둘레를 도는 차례, 방향은 상관없다) */
export function prismFaces(base, height) {
  const n = base.length;
  const faces = [
    { id: 'bottom', role: 'base', pts: base.map(([x, y]) => [x, y, 0]) },
    { id: 'top', role: 'base', pts: base.map(([x, y]) => [x, y, height]) },
  ];
  for (let i = 0; i < n; i += 1) {
    const [p, q] = [base[i], base[(i + 1) % n]];
    faces.push({ id: `side${i}`, role: 'side', pts: [[p[0], p[1], 0], [q[0], q[1], 0], [q[0], q[1], height], [p[0], p[1], height]] });
  }
  return faces;
}

/** 두 선분이 한 직선 위에서 길이 > 0만큼 겹치면 겹친 구간 [a, b], 아니면 null */
function sharedSegment(p1, p2, q1, q2) {
  const L = d2(p1, p2);
  const u = [(p2[0] - p1[0]) / L, (p2[1] - p1[1]) / L];
  const off = (q) => Math.abs((q[0] - p1[0]) * u[1] - (q[1] - p1[1]) * u[0]);
  if (off(q1) > E || off(q2) > E) return null;
  const t = (q) => (q[0] - p1[0]) * u[0] + (q[1] - p1[1]) * u[1];
  const lo = Math.max(0, Math.min(t(q1), t(q2)));
  const hi = Math.min(L, Math.max(t(q1), t(q2)));
  if (hi - lo <= E) return null;
  return [[p1[0] + u[0] * lo, p1[1] + u[1] * lo], [p1[0] + u[0] * hi, p1[1] + u[1] * hi]];
}

/** 펼친 그림의 맞닿은 곳: [{ i, j, seg, ei, ej }] (i < j, ei · ej는 두 면의 변 번호) */
export function contacts(polys) {
  const out = [];
  for (let i = 0; i < polys.length; i += 1) {
    for (let j = i + 1; j < polys.length; j += 1) {
      polys[i].forEach((p, a) => {
        polys[j].forEach((q, b) => {
          const seg = sharedSegment(p, polys[i][(a + 1) % polys[i].length], q, polys[j][(b + 1) % polys[j].length]);
          if (seg) out.push({ i, j, seg, ei: a, ej: b });
        });
      });
    }
  }
  return out;
}

/**
 * 2D 다각형(poly)을 3D 겉면(face)에 겹치는 꼭짓점 짝: poly의 꼭짓점 a↔face의 A, b↔face의 B가 정해지면 나머지는 둘레 차례(두 방향 가운데
 * a→b와 A→B가 같은 쪽으로 이어지는 방향). 모든 꼭짓점 사이 거리가 같으면 겹친다 → 짝 배열(poly 꼭짓점 k → face 꼭짓점), 아니면 null
 */
function overlay(poly, face, a, b, A, B) {
  const m = poly.length;
  if (face.pts.length !== m) return null;
  for (const dir of [1, -1]) {
    if ((A + dir + m) % m !== B) continue;
    const step = (b - a + m) % m === 1 ? 1 : (a - b + m) % m === 1 ? -1 : 0;
    if (step === 0) return null;
    const map = [];
    for (let k = 0; k < m; k += 1) map[(a + step * k + m * m) % m] = (A + dir * k + m * m) % m;
    let ok = true;
    for (let x = 0; x < m && ok; x += 1) for (let y = x + 1; y < m && ok; y += 1) if (Math.abs(d2(poly[x], poly[y]) - d3(face.pts[map[x]], face.pts[map[y]])) > 1e-5) ok = false;
    if (ok) return map;
  }
  return null;
}

/**
 * 독립 판정: polys[0](처음부터 놓인 밑면)부터 각기둥 겉면에 옮겨 놓아 본다 → { ok, why }
 * why: 'loop'(맞닿은 곳이 고리) · 'apart'(떨어진 면) · 'edge'(맞닿은 변이 모서리와 다름 — 길이) · 'shape'(그 자리 면과 모양이 다름) · 'twice'(한 자리에 두 면) · 'root'
 */
export function foldsToPrism(polys, base, height) {
  const faces = prismFaces(base, height);
  const touch = contacts(polys);
  if (touch.length > polys.length - 1) return { ok: false, why: 'loop' };
  // 첫 면: 같은 꼭짓점 수의 겉면 가운데 겹칠 수 있는 것(밑면 둘 · 차례 · 방향을 모두 해 본다)
  let first = null;
  for (const start of faces) {
    for (let A = 0; A < start.pts.length; A += 1) {
      for (const B of [(A + 1) % start.pts.length, (A + start.pts.length - 1) % start.pts.length]) {
        const map0 = overlay(polys[0], start, 0, 1, A, B);
        if (!map0) continue;
        const result = spread(polys, faces, touch, start, map0);
        if (result.ok) return result;
        first ??= result;
      }
    }
  }
  return first ?? { ok: false, why: 'root' };
}

function spread(polys, faces, touch, start, map0) {
  const at = new Map([[0, { face: start, map: map0 }]]);
  const queue = [0];
  while (queue.length > 0) {
    const i = queue.shift();
    const { face, map } = at.get(i);
    for (const t of touch) {
      if (t.i !== i && t.j !== i) continue;
      const j = t.i === i ? t.j : t.i;
      const ei = t.i === i ? t.ei : t.ej;
      const ej = t.i === i ? t.ej : t.ei;
      const pi = polys[i];
      const pj = polys[j];
      // 맞닿은 곳이 두 면의 변 전체여야 한다(길이가 같고 끝과 끝이 맞음)
      const full = (poly, e) => Math.abs(d2(poly[e], poly[(e + 1) % poly.length]) - d2(t.seg[0], t.seg[1])) < 1e-5;
      if (!full(pi, ei) || !full(pj, ej)) return { ok: false, why: 'edge' };
      const A = map[ei];
      const B = map[(ei + 1) % pi.length];
      const n = face.pts.length;
      if ((A + 1) % n !== B && (B + 1) % n !== A) return { ok: false, why: 'edge' };
      const [PA, PB] = [face.pts[A], face.pts[B]];
      const other = faces.find((f) => f !== face && f.pts.some((q) => d3(q, PA) < E) && f.pts.some((q) => d3(q, PB) < E));
      // 펼친 그림에서 j의 그 변의 두 끝이 pi의 어느 끝과 같은가 → 그 끝이 가는 겉면의 꼭짓점
      const sameAsA = d2(pj[ej], pi[ei]) < 1e-5;
      const ia = other.pts.findIndex((q) => d3(q, sameAsA ? PA : PB) < E);
      const ib = other.pts.findIndex((q) => d3(q, sameAsA ? PB : PA) < E);
      const mapJ = overlay(pj, other, ej, (ej + 1) % pj.length, ia, ib);
      if (!mapJ) return { ok: false, why: 'shape' };
      if (at.has(j)) {
        if (at.get(j).face !== other) return { ok: false, why: 'loop' };
        continue;
      }
      if ([...at.values()].some((x) => x.face === other)) return { ok: false, why: 'twice' };
      at.set(j, { face: other, map: mapJ });
      queue.push(j);
    }
  }
  if (at.size < polys.length) return { ok: false, why: 'apart' };
  return at.size === faces.length ? { ok: true, why: null } : { ok: false, why: 'twice' };
}

// ── 서로 다른 전개도의 가짓수 (독립: 신장 트리를 직접 나열 · 직접 펼침 · 합동으로 묶음) ─────────────
/** 겉면의 이웃(모서리를 함께 쓰는 두 면): [[i, j], …] */
function adjacency(faces) {
  const out = [];
  for (let i = 0; i < faces.length; i += 1) {
    for (let j = i + 1; j < faces.length; j += 1) {
      const shared = faces[i].pts.filter((p) => faces[j].pts.some((q) => d3(p, q) < E));
      if (shared.length === 2) out.push([i, j]);
    }
  }
  return out;
}

/** 면 수 − 1개의 이웃으로 모든 면을 잇는 묶음(신장 트리) 모두 */
function trees(count, edges) {
  const out = [];
  const pick = [];
  const walk = (start) => {
    if (pick.length === count - 1) {
      const parent = Array.from({ length: count }, (_, i) => i);
      const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
      for (const k of pick) {
        const [a, b] = edges[k];
        const [ra, rb] = [find(a), find(b)];
        if (ra === rb) return;
        parent[ra] = rb;
      }
      out.push(pick.map((k) => edges[k]));
      return;
    }
    for (let k = start; k < edges.length; k += 1) {
      pick.push(k);
      walk(k + 1);
      pick.pop();
    }
  };
  walk(0);
  return out;
}

/** 겉면 3D 꼭짓점을 그 면의 평면 2D로 (첫 꼭짓점이 원점, 첫 변이 x축) */
function flatten(pts) {
  const o = pts[0];
  const ex = pts[1].map((v, k) => v - o[k]);
  const lx = Math.hypot(...ex);
  const ux = ex.map((v) => v / lx);
  const e2 = pts[2].map((v, k) => v - o[k]);
  const dx = e2.reduce((s, v, k) => s + v * ux[k], 0);
  const vy = e2.map((v, k) => v - dx * ux[k]);
  const ly = Math.hypot(...vy);
  const uy = vy.map((v) => v / ly);
  return pts.map((p) => {
    const r = p.map((v, k) => v - o[k]);
    return [r.reduce((s, v, k) => s + v * ux[k], 0), r.reduce((s, v, k) => s + v * uy[k], 0)];
  });
}

/** 트리를 따라 편다: 첫 면을 평면에 두고, 이웃 면을 공유 모서리에 맞춰 바깥쪽에 둔다 → 면마다 2D 꼭짓점 (겉면 차례 그대로) */
function unfoldTree(faces, tree) {
  const placed = new Map([[0, flatten(faces[0].pts)]]);
  const queue = [0];
  while (queue.length > 0) {
    const i = queue.shift();
    for (const [a, b] of tree) {
      if (a !== i && b !== i) continue;
      const j = a === i ? b : a;
      if (placed.has(j)) continue;
      const pi = placed.get(i);
      const shared = faces[i].pts.map((p, k) => [p, k]).filter(([p]) => faces[j].pts.some((q) => d3(p, q) < E)).map(([, k]) => k);
      const [k1, k2] = shared;
      const P1 = pi[k1];
      const P2 = pi[k2];
      const fj = flatten(faces[j].pts);
      const m1 = faces[j].pts.findIndex((q) => d3(q, faces[i].pts[k1]) < E);
      const m2 = faces[j].pts.findIndex((q) => d3(q, faces[i].pts[k2]) < E);
      // fj의 m1 → P1, m2 → P2로 옮기는 두 가지(그대로 · 뒤집어) 가운데 i 면과 겹치지 않는 쪽(모서리 건너편)
      const cands = [false, true].map((mirror) => {
        const src = fj.map(([x, y]) => [x, mirror ? -y : y]);
        const ang = Math.atan2(P2[1] - P1[1], P2[0] - P1[0]) - Math.atan2(src[m2][1] - src[m1][1], src[m2][0] - src[m1][0]);
        const [c, s] = [Math.cos(ang), Math.sin(ang)];
        return src.map(([x, y]) => {
          const [dx, dy] = [x - src[m1][0], y - src[m1][1]];
          return [P1[0] + dx * c - dy * s, P1[1] + dx * s + dy * c];
        });
      });
      const side = (poly) => {
        const c = poly.reduce((s, p) => [s[0] + p[0] / poly.length, s[1] + p[1] / poly.length], [0, 0]);
        return Math.sign((P2[0] - P1[0]) * (c[1] - P1[1]) - (P2[1] - P1[1]) * (c[0] - P1[0]));
      };
      placed.set(j, cands.find((poly) => side(poly) !== side(pi)));
      queue.push(j);
    }
  }
  return faces.map((_, i) => placed.get(i));
}

/** 볼록 다각형 둘이 넓이로 겹치나 (나누는 축 검사) */
function polysOverlap(a, b) {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i += 1) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const axis = [-(q[1] - p[1]), q[0] - p[0]];
      const proj = (pts) => pts.map((r) => r[0] * axis[0] + r[1] * axis[1]);
      const pa = proj(a);
      const pb = proj(b);
      const L = Math.hypot(...axis);
      if (Math.max(...pa) <= Math.min(...pb) + E * L || Math.max(...pb) <= Math.min(...pa) + E * L) return false;
    }
  }
  return true;
}

/** 두 전개도(면마다 2D 꼭짓점과 종류)가 돌리기 · 뒤집기 · 옮기기로 겹치나 */
export function congruentNets(A, B) {
  const pa = A.flatMap((f) => f.poly);
  const pb = B.flatMap((f) => f.poly);
  if (pa.length !== pb.length) return false;
  const same = (map) => A.every((f) => B.some((g) => g.role === f.role && g.poly.length === f.poly.length
    && f.poly.every((p) => g.poly.some((q) => d2(map(p), q) < 1e-4))));
  const f0 = A[0];
  for (const g of B.filter((x) => x.role === f0.role && x.poly.length === f0.poly.length)) {
    for (let k = 0; k < g.poly.length; k += 1) {
      for (const [mirror, flipEdge] of [[false, false], [false, true], [true, false], [true, true]]) {
        const [a0, a1] = [f0.poly[0], f0.poly[1]];
        const [b0, b1] = flipEdge ? [g.poly[(k + 1) % g.poly.length], g.poly[k]] : [g.poly[k], g.poly[(k + 1) % g.poly.length]];
        if (Math.abs(d2(a0, a1) - d2(b0, b1)) > 1e-5) continue;
        const angA = Math.atan2(a1[1] - a0[1], a1[0] - a0[0]);
        const angB = Math.atan2(b1[1] - b0[1], b1[0] - b0[0]);
        const map = (p) => {
          let [x, y] = [p[0] - a0[0], p[1] - a0[1]];
          let r = Math.atan2(y, x) - angA;
          const len = Math.hypot(x, y);
          if (mirror) r = -r;
          [x, y] = [len * Math.cos(angB + r), len * Math.sin(angB + r)];
          return [b0[0] + x, b0[1] + y];
        };
        if (same(map)) return true;
      }
    }
  }
  return false;
}

/** 서로 다른 전개도의 가짓수(독립): 신장 트리 → 펴기 → 펼친 그림에서 겹치지 않고 고리가 없는 것 → 합동끼리 묶음 */
export function countNets(base, height) {
  const faces = prismFaces(base, height);
  const nets = [];
  const finger = (net) => net.flatMap((f) => f.poly).flatMap((p, i, all) => all.slice(i + 1).map((q) => Math.round(d2(p, q) * 1e4))).sort((x, y) => x - y).join(',');
  const buckets = new Map();
  for (const tree of trees(faces.length, adjacency(faces))) {
    const polys = unfoldTree(faces, tree);
    let bad = false;
    for (let i = 0; i < polys.length && !bad; i += 1) for (let j = i + 1; j < polys.length && !bad; j += 1) if (polysOverlap(polys[i], polys[j])) bad = true;
    if (bad || contacts(polys).length !== polys.length - 1) continue;
    const net = polys.map((poly, i) => ({ poly, role: faces[i].role }));
    const key = finger(net);
    const list = buckets.get(key) ?? [];
    if (list.some((other) => congruentNets(net, other))) continue;
    list.push(net);
    buckets.set(key, list);
    nets.push(net);
  }
  return nets.length;
}
