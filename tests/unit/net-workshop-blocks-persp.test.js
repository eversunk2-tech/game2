/**
 * F2 자유 쌓기 판의 원근 — 검사. 기획서: spec-grade6.md 15-27·15-28(사용자 결정), build-brief-f2.md.
 * 규칙은 저장소 코드를 쓰지 않고 기획서 문장만 보고 짠 독립 계산(아래 "독립 모형")과 견준다:
 *   - 눈은 돌기의 중심(판 가운데, 높이 1.5층)에서 보는 사람 쪽으로 "판의 긴 변 × 3.0"칸(A 약하게 — 14×14면 42칸, 6×6이면 18칸) 떨어져 있다.
 *   - 화면 점 = 무대 가운데 + 한 변 × (눈의 거리 ÷ (눈의 거리 − 깊이)) × (화면 오른쪽·아래 성분). 중심과 같은 깊이의 점은 원근 없을 때와 같다.
 *   - 바로 위·앞·옆(·뒤·왼쪽) 자세에서 15° 안으로 들어가면 원근이 서서히 줄어 딱 그 자세에서는 원근 없음(15-28 "그 자세에서는 원근 줄이기").
 *   - 처음 보기 맞춤: 처음 보기에서 판과 3층 상자가 무대에 꽉 차게(여백 높이 0.8·너비 0.6칸 — 원근 없을 때와 같은 여백), 그 상자가 무대 가운데에 오게
 *     내려다보는 높이마다 판을 올린다(판 돌림 45°의 상자로 — 가로로 돌릴 때는 움직이지 않는다).
 *   - 그릴 면·차례: 눈에서 보이는 면만, 앞의 것이 뒤의 것보다 나중에 그려진다(눈에서 쏜 반직선이 먼저 닿는 면이 나중).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRng } from '../../src/shared/core/random.js';
import { visibleFacesFrom } from '../../src/games/net-workshop/blocks/blocks.js';
import { eyeDistance, homeFitPersp, homeUnitFor, perspRise, projectPoint, sceneShapes } from '../../src/games/net-workshop/blocks/block-view.js';
import { FREE_BOARDS, FREE_PERSP } from '../../src/games/net-workshop/blocks/play-free-build.js';
import { PERSP_BAND, SNAP, perspWeight, poseOf } from '../../src/games/net-workshop/blocks/turn-view.js';

// ── 독립 모형 ─────────────────────────────
const rad = (d) => (d * Math.PI) / 180;
/** 판 돌림 yaw·높이 pitch에서 화면 오른쪽(판과 나란), 보는 사람 쪽, 화면 아래 */
function camera(yaw, pitch) {
  const v = [Math.sin(rad(yaw)) * Math.cos(rad(pitch)), -Math.cos(rad(yaw)) * Math.cos(rad(pitch)), Math.sin(rad(pitch))];
  const right = [Math.cos(rad(yaw)), Math.sin(rad(yaw)), 0];
  const down = [right[1] * v[2] - right[2] * v[1], right[2] * v[0] - right[0] * v[2], right[0] * v[1] - right[1] * v[0]];
  return { right, down, v };
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** 모델 점 → 화면 점(한 변 k, 무대 가운데 c, 돌기의 중심 o, 눈의 거리 D — 0이면 원근 없음) */
function screenOf(cam, k, c, o, D, p) {
  const q = [p[0] - o[0], p[1] - o[1], p[2] - o[2]];
  const f = D > 0 ? D / (D - dot(cam.v, q)) : 1;
  return [c[0] + k * f * dot(cam.right, q), c[1] + k * f * dot(cam.down, q)];
}
/** 원근을 줄이는 비율: 가장 가까운 "바로 위·옆에서 본 자세"까지의 각도가 15°보다 작으면 서서히(부드럽게 0 → 1) */
function weightOf(yaw, pitch) {
  const toTop = 90 - pitch;
  const y = ((yaw % 90) + 90) % 90;
  const toSide = Math.sqrt(pitch * pitch + Math.min(y, 90 - y) ** 2);
  const t = Math.min(1, Math.max(0, Math.min(toTop, toSide) / 15));
  return t * t * (3 - 2 * t);
}
const HOME = { yaw: 45, pitch: (Math.asin(1 / Math.sqrt(3)) * 180) / Math.PI };
/** 판 n×n과 3층 상자의 꼭짓점 여덟이 그 높이(판 돌림 45°)에서 차지하는 범위(한 변 = 1, 중심 = 0) */
function boxRange(n, pitch, D) {
  const cam = camera(45, pitch);
  const pts = [];
  for (const x of [0, n]) for (const y of [0, n]) for (const z of [0, 3]) pts.push(screenOf(cam, 1, [0, 0], [n / 2, n / 2, 1.5], D, [x, y, z]));
  const ys = pts.map((p) => p[1]);
  return { top: Math.min(...ys), bottom: Math.max(...ys), side: Math.max(...pts.map((p) => Math.abs(p[0]))) };
}
const FACES = {
  top: { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  bottom: { n: [0, 0, -1], c: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]] },
  front: { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  back: { n: [0, 1, 0], c: [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]] },
  left: { n: [-1, 0, 0], c: [[0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1]] },
  right: { n: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
};

test('원근의 세기(15-28 "A 약하게"): 눈의 거리 = 판의 긴 변 × 3.0 — 14×14 판 42칸, 휴대폰 6×6 판 18칸. 차시(원근 없음)는 0', () => {
  assert.equal(FREE_PERSP, 3.0);
  assert.equal(eyeDistance({ ...FREE_BOARDS.wide, fitH: 3, persp: FREE_PERSP }), 42);
  assert.equal(eyeDistance({ ...FREE_BOARDS.phone, fitH: 3, persp: FREE_PERSP }), 18);
  assert.equal(eyeDistance({ cols: 3, rows: 3, maxH: 3, persp: 0 }), 0);
  // 눈은 판 전체(10층을 층별로 벌려 놓은 높이까지)보다 바깥에 있다 — 세기를 아주 세게 줘도 쌓기나무 안에 들어가지 않는다
  for (const board of Object.values(FREE_BOARDS)) {
    const D = eyeDistance({ ...board, fitH: 3, persp: 0.01 });
    const far = Math.hypot(board.cols / 2, board.rows / 2, board.maxH + (board.maxH - 1) * 0.7);
    assert.ok(D > far, `${board.cols}칸 ${D} > ${far}`);
  }
});

test('원근 투영 = 독립 모형: 무작위 자세·점 3,000개, 돌기의 중심과 같은 깊이의 점은 원근 없을 때와 같다. 사용자 그림의 자세에서 판의 먼 쪽 변 ÷ 가까운 쪽 변 0.77(전 1.00)', () => {
  const rng = createRng('persp-project');
  for (let i = 0; i < 3000; i += 1) {
    const view = { yaw: rng.next() * 360, pitch: rng.next() * 90 };
    const pose = poseOf(view);
    const cam = camera(view.yaw, view.pitch);
    const o = [7, 7, 1.5];
    const p = [rng.next() * 14, rng.next() * 14, rng.next() * 10];
    const k = 10 + rng.next() * 50;
    const c = [rng.next() * 900, rng.next() * 600];
    const want = screenOf(cam, k, c, o, 42, p);
    const got = projectPoint(pose, k, c[0], c[1], p, o, 42);
    assert.ok(Math.abs(want[0] - got[0]) < 1e-9 && Math.abs(want[1] - got[1]) < 1e-9, `${i}`);
    // 원근 없음(0)은 지금 그대로
    const flat = projectPoint(pose, k, c[0], c[1], p, o);
    const flatWant = screenOf(cam, k, c, o, 0, p);
    assert.ok(Math.abs(flat[0] - flatWant[0]) < 1e-9 && Math.abs(flat[1] - flatWant[1]) < 1e-9);
    assert.deepEqual(projectPoint(pose, k, c[0], c[1], p, o, 0), flat);
    // 중심과 같은 깊이: 원근이 있어도 같은 자리
    const q = [p[0] - o[0], p[1] - o[1], p[2] - o[2]];
    const s = dot(cam.v, q);
    const same = [p[0] - s * cam.v[0], p[1] - s * cam.v[1], p[2] - s * cam.v[2]];
    const a = projectPoint(pose, k, c[0], c[1], same, o, 42);
    const b = projectPoint(pose, k, c[0], c[1], same, o);
    assert.ok(Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9);
  }
  // 사용자가 보낸 그림의 자세(판 돌림 73.7°, 높이 27.5°)와 처음 보기: 판의 마주 보는 두 변 가운데 먼 쪽 ÷ 가까운 쪽
  const edgeRatio = (yaw, pitch, D) => {
    const cam = camera(yaw, pitch);
    const at = (x, y) => screenOf(cam, 1, [0, 0], [7, 7, 1.5], D, [x, y, 0]);
    const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const pairs = [[len(at(0, 0), at(14, 0)), len(at(0, 14), at(14, 14))], [len(at(0, 0), at(0, 14)), len(at(14, 0), at(14, 14))]];
    return pairs.map(([p, q]) => Math.min(p, q) / Math.max(p, q));
  };
  assert.deepEqual(edgeRatio(73.7, 27.46, 0).map((r) => r.toFixed(2)), ['1.00', '1.00']);
  assert.equal(Math.min(...edgeRatio(73.7, 27.46, 42)).toFixed(2), '0.77');
  assert.equal(Math.min(...edgeRatio(HOME.yaw, HOME.pitch, 42)).toFixed(2), '0.90');
});

test('원근 줄이기(15-28): 바로 위·앞·옆·뒤·왼쪽에서는 0(원근 없음), 15° 밖에서는 1 — 사이는 끊김 없이 서서히. 독립 모형과 같다', () => {
  for (const name of ['top', 'front', 'side', 'back', 'left']) assert.equal(perspWeight({ ...SNAP[name], zoom: 1 }), 0, name);
  assert.equal(PERSP_BAND, 15);
  assert.equal(perspWeight({ ...SNAP.home, zoom: 1 }), 1);
  assert.equal(perspWeight({ ...SNAP.behind, zoom: 1 }), 1);
  assert.equal(perspWeight({ yaw: 73.7, pitch: 27.46, zoom: 1 }), 1); // 사용자 그림의 자세는 원근 그대로
  assert.equal(perspWeight({ yaw: 33, pitch: 75, zoom: 1 }), 1); // 바로 위에서 15°
  assert.equal(perspWeight({ yaw: 15, pitch: 0, zoom: 1 }), 1); // 앞에서 판을 15° 돌림
  const rng = createRng('persp-weight');
  for (let i = 0; i < 20_000; i += 1) {
    const yaw = rng.next() * 360;
    const pitch = rng.next() * 90;
    const w = perspWeight({ yaw, pitch, zoom: 1 });
    assert.ok(Math.abs(w - weightOf(yaw, pitch)) < 1e-12, `${yaw} ${pitch}`);
    // 끊김 없이: 0.1° 움직일 때 비율은 조금만 바뀐다
    const w2 = perspWeight({ yaw: yaw + 0.1, pitch: Math.min(90, pitch + 0.1), zoom: 1 });
    assert.ok(Math.abs(w2 - w) < 0.02, `${yaw} ${pitch}`);
  }
  // 처음 보기에서 바로 위로 올라가는 길: 75°까지 1, 그 뒤 줄어 90°에서 0
  let last = 1;
  for (let p = HOME.pitch; p <= 90; p += 0.5) {
    const w = perspWeight({ yaw: 45, pitch: p, zoom: 1 });
    assert.ok(w <= last + 1e-12);
    if (p <= 75) assert.equal(w, 1);
    last = w;
  }
  assert.equal(perspWeight({ yaw: 45, pitch: 90, zoom: 1 }), 0);
});

test('처음 보기 맞춤(원근): 판과 3층 상자가 무대에 꽉 차는 한 변 = 독립 계산. 그 상자가 무대 가운데에 오게 올리는 거리는 옆(0°)·바로 위(90°)에서 0, 판 돌림과 무관', () => {
  for (const [w, h] of [[1048, 594], [1048, 536], [832, 594], [776, 877], [916, 465], [334, 300], [334, 290]]) {
    for (const n of [6, 14]) {
      const D = n * 3;
      const r = boxRange(n, HOME.pitch, D);
      const want = Math.max(8, Math.floor(Math.min(h / (r.bottom - r.top + 0.8), w / (2 * r.side + 0.6))));
      const got = homeFitPersp(w, h, { cols: n, rows: n, fitH: 3, eye: D });
      assert.equal(got.unit, want, `${w}×${h} ${n}칸`);
      assert.ok(Math.abs(got.tall - (r.bottom - r.top + 0.8)) < 1e-9 && Math.abs(got.wide - (2 * r.side + 0.6)) < 1e-9);
      // 원근이 없을 때보다 한 변이 크지 않다(가까운 쪽이 커져서)
      assert.ok(got.unit <= homeUnitFor(w, h, { cols: n, rows: n, fitH: 3 }));
    }
  }
  // 화면의 다섯 크기에서 잰 무대(크롬북 1366×768·1366×680, 가로 태블릿, 세로 태블릿): 한 변 39·35·39·37px (원근 없을 때 40·36·40·38px)
  assert.deepEqual([[1048, 594], [1048, 536], [832, 594], [776, 877]].map(([w, h]) => homeFitPersp(w, h, { cols: 14, rows: 14, fitH: 3, eye: 42 }).unit), [39, 35, 39, 37]);
  // 올리는 거리
  for (let p = 0; p <= 90; p += 2.5) {
    const r = boxRange(14, p, 42);
    assert.ok(Math.abs(perspRise(p, { cols: 14, rows: 14, fitH: 3, eye: 42 }) - (r.top + r.bottom) / 2) < 1e-9, `${p}`);
  }
  assert.ok(Math.abs(perspRise(0, { cols: 14, rows: 14, fitH: 3, eye: 42 })) < 1e-9);
  assert.ok(Math.abs(perspRise(90, { cols: 14, rows: 14, fitH: 3, eye: 42 })) < 1e-9);
  assert.ok(perspRise(HOME.pitch, { cols: 14, rows: 14, fitH: 3, eye: 42 }) > 0.5); // 처음 보기: 판이 중심보다 아래로 치우쳐 올린다
  assert.equal(perspRise(HOME.pitch, { cols: 14, rows: 14, fitH: 3, eye: 0 }), 0); // 원근 없음(차시): 0
});

/** 독립: 눈에서 보이는 면(이웃이 없고, 눈이 면의 바깥쪽에 있음) */
function exposedFaces(map, eye, apart, zAt) {
  const filled = (x, y, z) => y >= 0 && y < map.length && x >= 0 && x < map[0].length && z >= 0 && z < map[y][x];
  const out = [];
  for (let y = 0; y < map.length; y += 1) for (let x = 0; x < map[0].length; x += 1) for (let z = 0; z < map[y][x]; z += 1) {
    for (const [name, f] of Object.entries(FACES)) {
      const p0 = [x + f.c[0][0], y + f.c[0][1], zAt(z) + f.c[0][2]];
      if (dot(f.n, [eye[0] - p0[0], eye[1] - p0[1], eye[2] - p0[2]]) <= 1e-9) continue;
      if (!(apart && f.n[2] !== 0) && filled(x + f.n[0], y + f.n[1], z + f.n[2])) continue;
      out.push(`${x},${y},${z},${name}`);
    }
  }
  return out.sort();
}
/** 독립: 눈에서 점 p로 가는 선분이 면 g(축에 나란한 단위 네모)를 p보다 앞에서 지나는가 */
function blocks(eye, p, g, zAt) {
  const f = FACES[g.face];
  const axis = f.n.findIndex((v) => v !== 0);
  const base = [g.x, g.y, zAt(g.z)];
  const plane = base[axis] + (f.n[axis] > 0 ? 1 : 0);
  const d = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]];
  if (Math.abs(d[axis]) < 1e-12) return false;
  const t = (plane - eye[axis]) / d[axis];
  if (!(t > 1e-9 && t < 1 - 1e-6)) return false;
  for (let i = 0; i < 3; i += 1) {
    if (i === axis) continue;
    const v = eye[i] + t * d[i];
    if (v < base[i] + 1e-7 || v > base[i] + 1 - 1e-7) return false;
  }
  return true;
}

test('원근의 그릴 면·차례 = 독립 계산: 무작위 판 300개(높은 탑·바둑판·층별로 벌림) × 눈의 자리 — 보이는 면이 같고, 앞의 면이 늘 뒤의 면보다 나중에 그려진다(눈에서 쏜 반직선)', () => {
  const rng = createRng('persp-order');
  let checkedPairs = 0;
  for (let i = 0; i < 300; i += 1) {
    const n = rng.pick([4, 5, 6, 14]);
    const maxH = n === 14 ? 10 : 6;
    const map = Array.from({ length: n }, () => new Array(n).fill(0));
    const kind = rng.pick(['sparse', 'dense', 'checker']);
    for (let y = 0; y < n; y += 1) for (let x = 0; x < n; x += 1) {
      if (kind === 'checker') map[y][x] = (x + y) % 2 ? 0 : rng.int(1, maxH);
      else if (kind === 'dense' || rng.next() < 0.15) map[y][x] = rng.int(0, maxH);
    }
    const apart = n < 14 && rng.next() < 0.3;
    const layers = Math.max(1, ...map.flat());
    const mid = (layers - 1) / 2;
    const zAt = (z) => z + (apart ? (z - mid) * 0.7 : 0);
    // 눈: 판 가운데 위쪽에서 보는 사람 쪽으로 판 긴 변 × 1~6칸(높이 0°~90°, 아무 판 돌림) — 판 위를 지나는 자리도 섞는다
    const yaw = rng.next() * 360;
    const pitch = rng.next() * 90;
    const D = n * (1.2 + rng.next() * 5);
    const cam = camera(yaw, pitch);
    const o = [n / 2, n / 2, apart ? layers / 2 : 1.5];
    const eye = [o[0] + D * cam.v[0], o[1] + D * cam.v[1], o[2] + D * cam.v[2]];
    const faces = visibleFacesFrom(map, eye, { apart, zAt });
    assert.deepEqual(faces.map((f) => `${f.x},${f.y},${f.z},${f.face}`).sort(), exposedFaces(map, eye, apart, zAt), `${i}`);
    // 차례: 면 F의 안쪽 점 몇 개로 눈에서 반직선을 쏘아, 그 앞에서 지나는 면 G는 모두 F보다 나중에 그려져야 한다
    const index = new Map(faces.map((f, k) => [f, k]));
    const sample = faces.length > 400 ? faces.filter(() => rng.next() < 400 / faces.length) : faces;
    for (const F of sample) {
      const c = FACES[F.face].c;
      for (let s = 0; s < 2; s += 1) {
        const u = 0.05 + rng.next() * 0.9;
        const v = 0.05 + rng.next() * 0.9;
        const at = (k) => c[0][k] + u * (c[1][k] - c[0][k]) + v * (c[3][k] - c[0][k]);
        const p = [F.x + at(0), F.y + at(1), zAt(F.z) + at(2)];
        for (const G of faces) {
          if (G === F || !blocks(eye, p, G, zAt)) continue;
          checkedPairs += 1;
          assert.ok(index.get(G) > index.get(F), `${i}: ${JSON.stringify(G)}가 ${JSON.stringify(F)}를 가리는데 먼저 그려짐`);
        }
      }
    }
  }
  assert.ok(checkedPairs > 5000, `${checkedPairs}`); // 가리는 짝을 충분히 만났다
});

test('sceneShapes(원근): 판 칸 196개가 먼저(눈이 판 위), 그다음 눈에서 본 면 차례. 원근을 주지 않으면 지금과 같다', () => {
  const map = Array.from({ length: 14 }, (_, y) => Array.from({ length: 14 }, (_, x) => ((x * 7 + y * 3) % 5 === 0 ? (x + y) % 10 + 1 : 0)));
  const view = { yaw: 73.7, pitch: 27.46 };
  const pose = poseOf(view);
  const cam = camera(view.yaw, view.pitch);
  const eye = [7 + 42 * cam.v[0], 7 + 42 * cam.v[1], 1.5 + 42 * cam.v[2]];
  const shapes = sceneShapes(map, pose, { eye, mid: 4.5 });
  const tiles = shapes.filter((s) => s.kind === 'tile');
  assert.equal(tiles.length, 196);
  assert.ok(shapes.slice(0, 196).every((s) => s.kind === 'tile'));
  assert.deepEqual(shapes.slice(196).map((s) => `${s.x},${s.y},${s.z},${s.face}`), visibleFacesFrom(map, eye).map((f) => `${f.x},${f.y},${f.z},${f.face}`));
  const flat = sceneShapes(map, pose, {});
  assert.ok(flat.every((s, i) => s.kind === 'tile' || i >= 196));
});
