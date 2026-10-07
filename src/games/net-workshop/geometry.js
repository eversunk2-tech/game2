/**
 * 전개도 접기에 쓰는 기하 도구 (순수 함수, 화면과 무관).
 * - 벡터: [x, y, z] 배열
 * - 4×4 행렬: 행 우선 길이 16 배열. 점은 열벡터로 곱한다 (p' = M · p)
 * - 볼록 다각형: [[x, y], ...] (꼭짓점 순서는 시계·반시계 어느 쪽이든)
 */

export const EPS = 1e-6;

// ── 벡터 ─────────────────────────────────
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const length = (a) => Math.hypot(a[0], a[1], a[2]);
export function normalize(a) {
  const n = length(a);
  return n < EPS ? [0, 0, 0] : scale(a, 1 / n);
}
export const to3 = (p) => [p[0], p[1], p[2] ?? 0];
export const samePoint = (a, b, eps = EPS) => length(sub(to3(a), to3(b))) <= eps;

/** 좌표를 소수 넷째 자리로 반올림한 문자열 키 (-0은 0으로) */
export function pointKey(p) {
  return to3(p).map((v) => {
    const r = Math.round(v * 1e4) / 1e4;
    return Object.is(r, -0) ? 0 : r;
  }).join(',');
}

// ── 4×4 행렬 ─────────────────────────────
export const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export function multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let r = 0; r < 4; r += 1) {
    for (let c = 0; c < 4; c += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += a[r * 4 + k] * b[k * 4 + c];
      out[r * 4 + c] = sum;
    }
  }
  return out;
}

export const translation = ([x, y, z = 0]) => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1];
export const scaling = (k) => [k, 0, 0, 0, 0, k, 0, 0, 0, 0, k, 0, 0, 0, 0, 1];

/** 점 origin을 지나고 방향이 axis인 직선을 축으로 angle(라디안)만큼 돌리는 행렬 (로드리게스 공식) */
export function rotationAbout(origin, axis, angle) {
  const [x, y, z] = normalize(axis);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;
  const r = [
    t * x * x + c, t * x * y - s * z, t * x * z + s * y, 0,
    t * x * y + s * z, t * y * y + c, t * y * z - s * x, 0,
    t * x * z - s * y, t * y * z + s * x, t * z * z + c, 0,
    0, 0, 0, 1,
  ];
  const o = to3(origin);
  return multiply(translation(o), multiply(r, translation(scale(o, -1))));
}

export function applyPoint(m, p) {
  const [x, y, z] = to3(p);
  return [
    m[0] * x + m[1] * y + m[2] * z + m[3],
    m[4] * x + m[5] * y + m[6] * z + m[7],
    m[8] * x + m[9] * y + m[10] * z + m[11],
  ];
}

/** 방향(평행이동 없이 회전만) */
export function applyDir(m, v) {
  const [x, y, z] = to3(v);
  return [m[0] * x + m[1] * y + m[2] * z, m[4] * x + m[5] * y + m[6] * z, m[8] * x + m[9] * y + m[10] * z];
}

/** CSS matrix3d()는 열 우선이라 순서를 바꿔 쓴다. */
export function toCssMatrix(m) {
  const cols = [];
  for (let c = 0; c < 4; c += 1) for (let r = 0; r < 4; r += 1) cols.push(+m[r * 4 + c].toFixed(6));
  return `matrix3d(${cols.join(',')})`;
}

// ── 다각형 ───────────────────────────────
export function signedArea(poly) {
  let sum = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

export const area = (poly) => Math.abs(signedArea(poly));

export function centroid(points) {
  const sum = points.reduce((acc, p) => add(acc, to3(p)), [0, 0, 0]);
  return scale(sum, 1 / points.length);
}

export function bounds(points) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const p of points) {
    const q = to3(p);
    for (let i = 0; i < 3; i += 1) {
      min[i] = Math.min(min[i], q[i]);
      max[i] = Math.max(max[i], q[i]);
    }
  }
  return { min, max };
}

const ccw = (poly) => (signedArea(poly) < 0 ? poly.slice().reverse() : poly);

/** 볼록 다각형 두 개의 겹친 넓이 (서덜랜드-호지먼 자르기) */
export function convexIntersectionArea(polyA, polyB) {
  let output = ccw(polyA);
  const clip = ccw(polyB);
  for (let i = 0; i < clip.length && output.length > 0; i += 1) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    const side = (p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    const input = output;
    output = [];
    for (let j = 0; j < input.length; j += 1) {
      const p = input[j];
      const q = input[(j + 1) % input.length];
      const sp = side(p);
      const sq = side(q);
      if (sp >= -EPS) output.push(p);
      if ((sp >= -EPS) !== (sq >= -EPS)) {
        const k = sp / (sp - sq);
        output.push([p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k]);
      }
    }
  }
  return output.length < 3 ? 0 : area(output);
}

/** 꼭짓점 i에서의 내각(라디안) */
export function interiorAngle(poly, i) {
  const n = poly.length;
  const p = to3(poly[i]);
  const u = sub(to3(poly[(i + n - 1) % n]), p);
  const v = sub(to3(poly[(i + 1) % n]), p);
  return Math.acos(Math.max(-1, Math.min(1, dot(normalize(u), normalize(v)))));
}

/**
 * 같은 직선 위에 있는 두 선분이 겹친 부분. 겹치지 않거나 같은 직선이 아니면 null.
 * 돌려주는 값: { from, to, length } (from·to는 겹친 구간의 양 끝)
 */
export function collinearOverlap(a1, a2, b1, b2, eps = EPS) {
  const p = to3(a1);
  const d = sub(to3(a2), p);
  const len = length(d);
  if (len < eps) return null;
  const u = scale(d, 1 / len);
  const off = (q) => length(cross(sub(to3(q), p), u));
  if (off(b1) > eps || off(b2) > eps) return null;
  const tb1 = dot(sub(to3(b1), p), u);
  const tb2 = dot(sub(to3(b2), p), u);
  const lo = Math.max(0, Math.min(tb1, tb2));
  const hi = Math.min(len, Math.max(tb1, tb2));
  if (hi - lo <= eps) return null;
  return { from: add(p, scale(u, lo)), to: add(p, scale(u, hi)), length: hi - lo };
}
