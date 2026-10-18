/**
 * 각기둥 판정의 독립 계산 (검사 전용 — 저장소의 fold.js · geometry.js · solids.js를 쓰지 않는다). 기획서 문장만 보고 짰다(spec-grade6 2-2 · 4 · 6-2절):
 *   접는 각도: 옆면-옆면 = 밑면의 그 꼭짓점의 바깥각, 밑면-옆면 = 90° · 모든 경첩은 종이 뒤쪽으로 접는다 ·
 *   각기둥이 되는 조건: 밑면 2 · 옆면 = 한 밑면의 변의 수 · 옆면은 모두 직사각형 · 접었을 때 겹치는 면이 없고 모든 변이 다른 한 변과 꼭 맞게 맞닿는다
 * 전개도에서 쓰는 것은 면의 꼭짓점(poly)·종류(role)·입체의 어느 면인지(solid — 접는 각도를 고르는 데만)뿐이다.
 */
export const v = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], (a[2] ?? 0) - (b[2] ?? 0)],
  add: (a, b) => [a[0] + b[0], a[1] + b[1], (a[2] ?? 0) + (b[2] ?? 0)],
  mul: (a, k) => [a[0] * k, a[1] * k, (a[2] ?? 0) * k],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + (a[2] ?? 0) * (b[2] ?? 0),
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2] ?? 0),
};
v.unit = (a) => v.mul(a, 1 / v.len(a));
export const to3 = (p) => [p[0], p[1], p[2] ?? 0];
export const E = 1e-6;
/** 점 p를 o를 지나는 단위 축 k 둘레로 각 t만큼 (로드리게스) */
export function rotate(p, o, k, t) {
  const r = v.sub(p, o);
  const c = Math.cos(t);
  const s = Math.sin(t);
  return v.add(o, v.add(v.add(v.mul(r, c), v.mul(v.cross(k, r), s)), v.mul(k, v.dot(k, r) * (1 - c))));
}
/** 볼록 다각형의 꼭짓점 i의 내각 */
export function angleAt(poly, i) {
  const n = poly.length;
  const a = v.unit(v.sub(to3(poly[(i + n - 1) % n]), to3(poly[i])));
  const b = v.unit(v.sub(to3(poly[(i + 1) % n]), to3(poly[i])));
  return Math.acos(Math.max(-1, Math.min(1, v.dot(a, b))));
}
/** 두 선분이 한 직선 위에서 길이 > 0만큼 겹치나 → 겹친 길이 (아니면 0) */
export function overlapLength(p1, p2, q1, q2) {
  const d = v.sub(p2, p1);
  const L = v.len(d);
  const u = v.mul(d, 1 / L);
  const off = (q) => v.len(v.cross(v.sub(q, p1), u));
  if (off(q1) > E || off(q2) > E) return 0;
  const a = v.dot(v.sub(q1, p1), u);
  const b = v.dot(v.sub(q2, p1), u);
  return Math.max(0, Math.min(L, Math.max(a, b)) - Math.max(0, Math.min(a, b)));
}
export const edgesOfPoly = (poly) => poly.map((p, i) => [to3(p), to3(poly[(i + 1) % poly.length])]);

/** 각기둥의 접는 각도(기획서 문장 그대로): 옆면 i · i+1은 밑면의 꼭짓점 i+1의 바깥각, 밑면-옆면은 90° */
export function foldAngle(base, a, b) {
  const n = base.length;
  if (a.startsWith('b') || b.startsWith('b')) return a.startsWith('b') && b.startsWith('b') ? null : Math.PI / 2;
  const [i, j] = [Number(a.slice(1)), Number(b.slice(1))];
  const vertex = (i + 1) % n === j ? j : (j + 1) % n === i ? i : null;
  return vertex == null ? null : Math.PI - angleAt(base, vertex);
}

/** 펼친 전개도를 접는다(독립): 면 0에서 시작해 맞닿은 변(경첩)을 따라 너비 우선, 자식 면은 부모 면의 뒤쪽으로 접는다 → 면마다 3D 꼭짓점 */
export function fold3d(net, base) {
  const faces = net.faces;
  const placed = new Map([[0, faces[0].poly.map(to3)]]);
  const queue = [0];
  while (queue.length > 0) {
    const i = queue.shift();
    for (let j = 0; j < faces.length; j += 1) {
      if (placed.has(j)) continue;
      let hinge = null;
      for (const [p1, p2] of edgesOfPoly(faces[i].poly)) {
        for (const [q1, q2] of edgesOfPoly(faces[j].poly)) {
          const len = overlapLength(p1, p2, q1, q2);
          if (len > E) hinge = [p1, p2];
        }
      }
      if (!hinge) continue;
      // 부모 면이 놓인 3D 틀: 펼친 좌표의 (0,0)·x축·y축이 어디로 갔나 (꼭짓점 셋으로)
      const flatP = faces[i].poly.map(to3);
      const world = placed.get(i);
      const toWorld = mapper(flatP, world);
      const parentNormal = v.unit(v.cross(v.sub(world[1], world[0]), v.sub(world[2], world[0])));
      const orient = Math.sign(v.cross(v.sub(flatP[1], flatP[0]), v.sub(flatP[2], flatP[0]))[2]); // 펼친 그림에서 면이 도는 방향(앞면 = +z)
      const front = v.mul(parentNormal, orient);
      const [h1, h2] = hinge.map(toWorld);
      const axis = v.unit(v.sub(h2, h1));
      const angle = foldAngle(base, faces[i].solid, faces[j].solid);
      if (angle == null) return null;
      const child = faces[j].poly.map((p) => toWorld(to3(p)));
      const tryAngle = (t) => child.map((p) => rotate(p, h1, axis, t));
      const midOf = (pts) => pts.reduce((s, p) => v.add(s, p), [0, 0, 0]).map((x) => x / pts.length);
      const plus = tryAngle(angle);
      const minus = tryAngle(-angle);
      // 종이 뒤쪽(앞면의 반대)으로: 접은 자식 면의 가운데가 부모 면의 앞쪽 법선 반대편에 온다
      const back = (pts) => v.dot(v.sub(midOf(pts), h1), front);
      placed.set(j, back(plus) < back(minus) ? plus : minus);
      queue.push(j);
    }
  }
  return placed.size === faces.length ? faces.map((_, k) => placed.get(k)) : null;
}

/** 펼친 좌표의 점 → 3D (면 하나의 꼭짓점 셋으로 정한 닮음 없는 옮김) */
function mapper(flat, world) {
  const o = flat[0];
  const fx = v.unit(v.sub(flat[1], o));
  const fz = [0, 0, Math.sign(v.cross(v.sub(flat[1], o), v.sub(flat[2], o))[2]) || 1];
  const fy = v.cross(fz, fx);
  const wo = world[0];
  const wx = v.unit(v.sub(world[1], wo));
  const wz = v.mul(v.unit(v.cross(v.sub(world[1], wo), v.sub(world[2], wo))), 1);
  const wy = v.cross(wz, wx);
  return (p) => {
    const d = v.sub(p, o);
    const [a, b, c] = [v.dot(d, fx), v.dot(d, fy), v.dot(d, fz)];
    return v.add(wo, v.add(v.add(v.mul(wx, a), v.mul(wy, b)), v.mul(wz, c)));
  };
}

/** 같은 평면에서 넓이가 겹치나(독립 — 한 면의 안쪽 점들이 다른 면 안에 있나) */
function overlapping(A, B) {
  const nA = v.unit(v.cross(v.sub(A[1], A[0]), v.sub(A[2], A[0])));
  const nB = v.unit(v.cross(v.sub(B[1], B[0]), v.sub(B[2], B[0])));
  if (Math.abs(Math.abs(v.dot(nA, nB)) - 1) > E || Math.abs(v.dot(nA, v.sub(B[0], A[0]))) > E) return false;
  const inside = (P, poly) => {
    let sign = 0;
    return poly.every((p, i) => {
      const s = v.dot(nA, v.cross(v.sub(poly[(i + 1) % poly.length], p), v.sub(P, p)));
      if (Math.abs(s) < 1e-9) return false;
      if (sign === 0) sign = Math.sign(s);
      return Math.sign(s) === sign;
    });
  };
  const mid = (pts) => pts.reduce((s, p) => v.add(s, p), [0, 0, 0]).map((x) => x / pts.length);
  const probes = (pts) => [mid(pts), ...pts.map((p) => v.add(v.mul(p, 0.2), v.mul(mid(pts), 0.8)))];
  return probes(A).some((P) => inside(P, B)) || probes(B).some((P) => inside(P, A));
}

/**
 * 독립 판정: { ok, count, shape, overlap, length, gap } — 기획서의 네 가지(면의 수 · 옆면 직사각형 · 겹침 · 맞닿는 선분의 길이)와 틈
 * net.sides(한 밑면의 변의 수)·면의 role·solid(입체의 어느 면)만 쓴다
 */
export function verdict(net, base) {
  const out = { count: false, shape: false, overlap: false, length: false, gap: false };
  const bases = net.faces.filter((f) => f.role === 'base').length;
  const sides = net.faces.filter((f) => f.role === 'side');
  out.count = bases !== 2 || sides.length !== base.length;
  out.shape = sides.some((f) => {
    if (f.poly.length !== 4) return true;
    return f.poly.some((p, i) => {
      const a = v.sub(to3(f.poly[(i + 1) % 4]), to3(p));
      const b = v.sub(to3(f.poly[(i + 2) % 4]), to3(f.poly[(i + 1) % 4]));
      return Math.abs(v.dot(v.unit(a), v.unit(b))) > 1e-6;
    });
  });
  const folded = fold3d(net, base);
  if (!folded) return { ...out, ok: false, broken: true };
  for (let i = 0; i < folded.length; i += 1) for (let j = i + 1; j < folded.length; j += 1) if (overlapping(folded[i], folded[j])) out.overlap = true;
  // 변마다: 다른 면의 변과 끝과 끝이 꼭 맞으면 맞닿음, 한 직선 위에서 일부만 겹치면 길이가 다름, 아무것도 없으면 틈
  folded.forEach((pts, i) => {
    edgesOfPoly(pts).forEach(([p, q]) => {
      let exact = 0;
      let partial = 0;
      folded.forEach((other, j) => {
        if (j === i) return;
        for (const [r, s] of edgesOfPoly(other)) {
          const same = (v.len(v.sub(p, r)) < E && v.len(v.sub(q, s)) < E) || (v.len(v.sub(p, s)) < E && v.len(v.sub(q, r)) < E);
          if (same) exact += 1;
          else if (overlapLength(p, q, r, s) > E) partial += 1;
        }
      });
      if (partial > 0) out.length = true;
      if (exact === 0 && partial === 0) out.gap = true;
    });
  });
  out.ok = !out.count && !out.shape && !out.overlap && !out.length && !out.gap;
  return out;
}

