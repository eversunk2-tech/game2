/**
 * F2 자유 쌓기 판의 원근 — 브라우저 검사. 기획서: spec-grade6.md 15-27·15-28(사용자 결정), build-brief-f2.md
 * 독립 모형(저장소 코드를 쓰지 않고 기획서 문장만 보고 짬):
 *   - 끌기: 가로 1px = 판 0.4°(오른쪽으로 끌면 판 돌림이 줄어든다), 세로 1px = 높이 0.4°(아래로 끌면 커진다, 0°~90°에서 멈춤), 8px 문턱.
 *   - 눈: 돌기의 중심(판 가운데, 높이 1.5층)에서 보는 사람 쪽으로 판의 긴 변 × 3칸(14×14면 42칸). 바로 위·앞·옆·뒤·왼쪽 자세에서 15° 안으로 들어가면
 *     원근이 서서히 줄어(부드러운 0 → 1) 딱 그 자세에서는 원근 없음.
 *   - 화면 점 = 무대 가운데 + 한 변 × (눈의 거리 ÷ (눈의 거리 − 깊이)) × (화면 오른쪽·아래 성분). 한 변은 처음 보기에서 판과 3층 상자가 꽉 차게(여백 0.8·0.6칸),
 *     무대 가운데는 그 높이(판 돌림 45°)의 상자가 가운데에 오게 올린 자리.
 *   - 그릴 면 = 눈에서 보이고 이웃이 없는 면. 누른 곳에 보이는 면 = 눈에서 그 점으로 쏜 반직선이 처음 닿는 면(가림 순서).
 *   - 누른 곳에 놓이는 자리(3-2절): 판 칸 → 그 자리 바닥, 윗면 → 그 위, 옆면 → 그 쪽 이웃 자리(비었으면 바닥, 있으면 맨 위).
 * 시간 예산(CPU 4·8·12배 흉내에서 잼): 아래 각 검사 머리말.
 */
import { expect, test } from '@playwright/test';
import { collectErrors, fileUrl } from './helpers.js';

const FILE = 'net-workshop.html';
const KEY14 = 'edu:net-workshop:free-14x14';
const N = 14;
const isTouch = (testInfo) => testInfo.project.name === 'tablet';
const stageSel = '.blk-free .blk-stage';
const frames = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const settled = async (page) => {
  await expect(page.locator(stageSel)).not.toHaveClass(/is-easing/);
  await page.waitForFunction(() => document.getAnimations({ subtree: true }).every((a) => a.playState !== 'running'));
  await frames(page);
};

// ── 장면: 사용자 그림의 노란 쌓기나무 셋 + 구석 탑·10층 탑·여기저기 ──
const COLUMNS = [[7, 5, 1], [8, 5, 1], [7, 6, 1], [0, 0, 4], [13, 13, 4], [11, 3, 10], [4, 9, 2], [5, 9, 1], [9, 10, 3], [2, 6, 5], [12, 8, 2], [6, 12, 6]];
const sceneMap = () => {
  const h = Array.from({ length: N }, () => new Array(N).fill(0));
  for (const [x, y, k] of COLUMNS) h[y][x] = k;
  return h;
};
const saved = (h) => ({ v: 1, h, c: h.map((row) => row.map((k) => '2'.repeat(k))) });

// ── 독립 모형 ─────────────────────────────
const rad = (d) => (d * Math.PI) / 180;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const HOME = { yaw: 45, pitch: (Math.asin(1 / Math.sqrt(3)) * 180) / Math.PI };
function camera(yaw, pitch) {
  const v = [Math.sin(rad(yaw)) * Math.cos(rad(pitch)), -Math.cos(rad(yaw)) * Math.cos(rad(pitch)), Math.sin(rad(pitch))];
  const right = [Math.cos(rad(yaw)), Math.sin(rad(yaw)), 0];
  const down = [right[1] * v[2] - right[2] * v[1], right[2] * v[0] - right[0] * v[2], right[0] * v[1] - right[1] * v[0]];
  return { right, down, v };
}
function eyeDist(yaw, pitch) {
  const y = ((yaw % 90) + 90) % 90;
  const t = Math.min(1, Math.max(0, Math.min(90 - pitch, Math.hypot(pitch, Math.min(y, 90 - y))) / 15));
  const w = t * t * (3 - 2 * t);
  return w > 1e-6 ? (3 * N) / w : 0;
}
const ORIGIN = [N / 2, N / 2, 1.5];
const proj = (cam, D, p) => {
  const q = [p[0] - ORIGIN[0], p[1] - ORIGIN[1], p[2] - ORIGIN[2]];
  const f = D > 0 ? D / (D - dot(cam.v, q)) : 1;
  return [f * dot(cam.right, q), f * dot(cam.down, q)];
};
function boxRange(pitch, D) {
  const cam = camera(45, pitch);
  const pts = [];
  for (const x of [0, N]) for (const y of [0, N]) for (const z of [0, 3]) pts.push(proj(cam, D, [x, y, z]));
  const ys = pts.map((p) => p[1]);
  return { top: Math.min(...ys), bottom: Math.max(...ys), side: Math.max(...pts.map((p) => Math.abs(p[0]))) };
}
const fitUnit = (w, h) => {
  const r = boxRange(HOME.pitch, 3 * N);
  return Math.floor(Math.min(h / (r.bottom - r.top + 0.8), w / (2 * r.side + 0.6)));
};
const FACES = {
  top: { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  front: { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  back: { n: [0, 1, 0], c: [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]] },
  left: { n: [-1, 0, 0], c: [[0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1]] },
  right: { n: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
};
const TILE = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]];
/** 그 보기에서 무대에 그려질 것: 열쇠 → { pts(화면 점), quad(모델 점 넷), n(법선) }, 그리고 눈·투영 */
function model(h, view, stage) {
  const cam = camera(view.yaw, view.pitch);
  const D = eyeDist(view.yaw, view.pitch);
  const k = fitUnit(stage.w, stage.h) * view.zoom;
  const c = [stage.w / 2, stage.h / 2 - ((boxRange(view.pitch, D).top + boxRange(view.pitch, D).bottom) / 2) * k];
  const at = (p) => {
    const s = proj(cam, D, p);
    return [c[0] + k * s[0], c[1] + k * s[1]];
  };
  const eye = D > 0 ? [ORIGIN[0] + D * cam.v[0], ORIGIN[1] + D * cam.v[1], ORIGIN[2] + D * cam.v[2]] : null;
  const filled = (x, y, z) => y >= 0 && y < N && x >= 0 && x < N && z >= 0 && z < h[y][x];
  const shapes = new Map();
  for (let y = 0; y < N; y += 1) for (let x = 0; x < N; x += 1) {
    const quad = TILE.map(([a, b]) => [x + a, y + b, 0]);
    shapes.set(`t${x},${y}`, { quad, n: [0, 0, 1], pts: quad.map(at), kind: 'tile', x, y });
    for (let z = 0; z < h[y][x]; z += 1) {
      for (const [name, f] of Object.entries(FACES)) {
        const quad2 = f.c.map(([a, b, cc]) => [x + a, y + b, z + cc]);
        const toEye = eye ? [eye[0] - quad2[0][0], eye[1] - quad2[0][1], eye[2] - quad2[0][2]] : cam.v;
        if (dot(f.n, toEye) <= 1e-6) continue;
        if (filled(x + f.n[0], y + f.n[1], z + f.n[2])) continue;
        shapes.set(`f${x},${y},${z},${name}`, { quad: quad2, n: f.n, pts: quad2.map(at), kind: 'face', x, y, z, face: name });
      }
    }
  }
  /** 화면 점 → 눈에서 쏜 반직선이 처음 닿는 것의 열쇠(없으면 null) */
  const ray = (sx, sy) => {
    const s = (sx - c[0]) / k;
    const t = (sy - c[1]) / k;
    let from;
    let dir;
    if (D > 0) {
      from = eye;
      dir = [0, 1, 2].map((i) => (s / D) * cam.right[i] + (t / D) * cam.down[i] - cam.v[i]);
    } else {
      from = [0, 1, 2].map((i) => ORIGIN[i] + s * cam.right[i] + t * cam.down[i] + 100 * cam.v[i]);
      dir = cam.v.map((v) => -v);
    }
    let best = null;
    for (const [key, sh] of shapes) {
      const axis = sh.n.findIndex((v) => v !== 0);
      const plane = sh.quad[0][axis];
      if (Math.abs(dir[axis]) < 1e-12) continue;
      const lam = (plane - from[axis]) / dir[axis];
      if (!(lam > 0)) continue;
      const lo = [0, 1, 2].map((i) => Math.min(...sh.quad.map((p) => p[i])));
      const hi = [0, 1, 2].map((i) => Math.max(...sh.quad.map((p) => p[i])));
      let inside = true;
      for (let i = 0; i < 3; i += 1) {
        if (i === axis) continue;
        const v = from[i] + lam * dir[i];
        if (v < lo[i] || v > hi[i]) inside = false;
      }
      // 판 칸과 쌓기나무 바닥이 같은 평면 — 쌓기나무의 면이 먼저(같은 깊이면 면)
      if (inside && (!best || lam < best.lam - 1e-9 || (Math.abs(lam - best.lam) <= 1e-9 && sh.kind === 'face'))) best = { key, lam };
    }
    return best?.key ?? null;
  };
  return { shapes, ray, k };
}
/** 눌렀을 때 놓이는 자리(3-2절) → 새 높이 지도(판 밖·10층이면 null) */
function placeAt(h, key) {
  const m = key.match(/^t(\d+),(\d+)$/) ?? key.match(/^f(\d+),(\d+),(\d+),(\w+)$/);
  let x = Number(m[1]);
  let y = Number(m[2]);
  if (key.startsWith('f') && m[4] !== 'top') {
    const n = FACES[m[4]].n;
    x += n[0];
    y += n[1];
    if (x < 0 || y < 0 || x >= N || y >= N) return null;
  }
  if (h[y][x] >= 10) return null;
  const out = h.map((row) => [...row]);
  out[y][x] += 1;
  return out;
}

/** 무대에서 읽은 것: 무대 상자, 한 변, 다각형마다 열쇠·점 */
const readStage = (page) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  const box = el.getBoundingClientRect();
  const parse = (p) => p.getAttribute('points').trim().split(/\s+/).map((s) => s.split(',').map(Number));
  return {
    w: box.width,
    h: box.height,
    x: box.left,
    y: box.top,
    unit: parseFloat(el.style.getPropertyValue('--blk-unit')),
    shapes: [...el.querySelectorAll('.blk-shapes polygon[data-kind]')].map((p) => ({ key: p.dataset.kind === 'tile' ? `t${p.dataset.x},${p.dataset.y}` : `f${p.dataset.x},${p.dataset.y},${p.dataset.z},${p.dataset.face}`, pts: parse(p) })),
  };
}, stageSel);
/** 화면의 다각형 = 독립 모형 → 가장 큰 차이(px)와 짝이 없는 것 */
function compare(read, want) {
  let gap = 0;
  const odd = [];
  const left = new Map(want.shapes);
  for (const s of read.shapes) {
    const w = left.get(s.key);
    if (!w) {
      odd.push(`그리지 않을 것 ${s.key}`);
      continue;
    }
    left.delete(s.key);
    s.pts.forEach((p, i) => {
      gap = Math.max(gap, Math.abs(p[0] - w.pts[i][0]), Math.abs(p[1] - w.pts[i][1]));
    });
  }
  for (const key of left.keys()) odd.push(`빠진 것 ${key}`);
  return { gap: Math.round(gap * 1000) / 1000, odd };
}
/** 무대 위 점들에서 맨 위의 판·쌓기나무 다각형(글자·버튼 밑이어도) → 열쇠, 그리고 그 점의 맨 위 요소가 그 다각형인가(누를 수 있는가) */
const topShapes = (page, points) => page.evaluate(([sel, pts]) => {
  const shapesG = document.querySelector(`${sel} .blk-shapes`);
  return pts.map(([x, y]) => {
    const list = document.elementsFromPoint(x, y);
    const poly = list.find((el) => el.matches?.('polygon[data-kind]') && shapesG.contains(el));
    const key = poly ? (poly.dataset.kind === 'tile' ? `t${poly.dataset.x},${poly.dataset.y}` : `f${poly.dataset.x},${poly.dataset.y},${poly.dataset.z},${poly.dataset.face}`) : null;
    return { key, free: Boolean(poly) && list[0] === poly };
  });
}, [stageSel, points]);

/** 무대의 격자 점마다 맨 위 다각형 = 반직선이 처음 닿는 것 (경계 1.5px 안은 빼고) → { 본 점, 다른 점 목록, 깨끗한 점(누를 수 있는) } */
async function occlusion(page, read, want, step = 17) {
  const pts = [];
  for (let y = 8; y < read.h - 8; y += step) for (let x = 8; x < read.w - 8; x += step) pts.push([x, y]);
  const clean = [];
  const samples = [];
  for (const [x, y] of pts) {
    const k = want.ray(x, y);
    const around = [[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]].map(([dx, dy]) => want.ray(x + dx, y + dy));
    if (around.some((a) => a !== k)) continue;
    samples.push({ x, y, key: k });
  }
  const got = await topShapes(page, samples.map((s) => [read.x + s.x, read.y + s.y]));
  const wrong = [];
  samples.forEach((s, i) => {
    if (got[i].key !== s.key) wrong.push(`(${s.x},${s.y}) 화면 ${got[i].key} · 반직선 ${s.key}`);
    else if (s.key && got[i].free) clean.push(s);
  });
  return { seen: samples.length, hit: samples.filter((s) => s.key).length, wrong, clean };
}

async function openScene(page, h = sceneMap()) {
  await page.addInitScript(([key, value]) => {
    if (!sessionStorage.getItem('f2-scene')) {
      localStorage.setItem(key, value);
      sessionStorage.setItem('f2-scene', '1');
    }
  }, [KEY14, JSON.stringify(saved(h))]);
  await page.goto(fileUrl(FILE, '?sound=off&stage=blocks-free'));
  await page.locator(`${stageSel}[data-count]`).waitFor();
  await settled(page);
  await page.mouse.move(1, 1);
}
/** 끌기 경로(정수 화면 자리, 4px 안팎씩) → 독립 모형으로 따라 센 보기 */
async function drag(page, read, from, vertices, view) {
  const start = [Math.round(read.x + from[0]), Math.round(read.y + from[1])];
  const pts = [start];
  for (let i = 1; i < vertices.length; i += 1) {
    const [x0, y0] = vertices[i - 1];
    const [x1, y1] = vertices[i];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4));
    for (let k = 1; k <= n; k += 1) pts.push([Math.round(start[0] + x0 + ((x1 - x0) * k) / n), Math.round(start[1] + y0 + ((y1 - y0) * k) / n)]);
  }
  await page.mouse.move(...pts[0]);
  await page.mouse.down();
  for (const p of pts.slice(1)) await page.mouse.move(...p);
  await page.mouse.up();
  await page.mouse.move(1, 1);
  let next = { ...view };
  let last = null;
  for (const [x, y] of pts.slice(1)) {
    if (!last) {
      if (Math.hypot(x - pts[0][0], y - pts[0][1]) <= 8) continue;
      last = pts[0];
    }
    next = { ...next, yaw: (((next.yaw - (x - last[0]) * 0.4) % 360) + 360) % 360, pitch: Math.min(90, Math.max(0, next.pitch + (y - last[1]) * 0.4)) };
    last = [x, y];
  }
  return next;
}

test('원근 판의 화면 = 독립 원근 투영(처음 보기·끌기·바로 위 가까이·[위][앞][옆]·판 돌리기·크게): 한 변은 처음 보기 꽉 차게, [위][앞][옆]은 원근 없는 네모, 판 가운데가 돌기의 중심', async ({ page }, testInfo) => {
  test.skip(isTouch(testInfo), '크롬북에서(터치는 아래 누르기 검사)');
  test.setTimeout(120_000); // CPU 12배 느리게 한 실행에서 10.6초
  const errors = collectErrors(page);
  await openScene(page);
  const h = sceneMap();
  let read = await readStage(page);
  expect(read.unit).toBe(fitUnit(read.w, read.h)); // 1366×768: 39px
  let view = { ...HOME, zoom: 1 };
  const check = async (label) => {
    await settled(page);
    read = await readStage(page);
    const res = compare(read, model(h, view, read));
    expect(res.odd, label).toEqual([]);
    expect(res.gap, label).toBeLessThanOrEqual(0.051); // 화면의 점은 0.1px 단위로 적는다
    return res;
  };
  await check('처음 보기');
  // 처음 보기: 판 네 모서리가 무대 안, 판의 먼 쪽(뒤) 변이 가까운 쪽(앞) 변보다 짧다(0.90)
  const corners = (r) => {
    const get = (key, i) => r.shapes.find((s) => s.key === key).pts[i];
    return { c00: get('t0,0', 0), c10: get('t13,0', 1), c11: get('t13,13', 2), c01: get('t0,13', 3) };
  };
  const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  let c = corners(read);
  for (const p of Object.values(c)) expect(p[0] > 0 && p[0] < read.w && p[1] > 0 && p[1] < read.h).toBe(true);
  expect(len(c.c01, c.c11) / len(c.c00, c.c10)).toBeCloseTo(0.9, 2);
  // 사용자 그림의 자세 쪽으로: 왼쪽 72px·위로 19px → 판 돌림 73.8°, 높이 27.66°. 먼 쪽 변 ÷ 가까운 쪽 변 약 0.77
  view = await drag(page, read, [read.w / 2, 60], [[0, 0], [-72, -19]], view);
  await check('사용자 그림의 자세');
  c = corners(read);
  expect(Math.min(len(c.c00, c.c01), len(c.c10, c.c11)) / Math.max(len(c.c00, c.c01), len(c.c10, c.c11))).toBeLessThan(0.8);
  // 판 돌리기(가로 300px — 판 돌림 120°): 판 가운데(바닥의 중심)의 화면 자리가 그대로 = 돌기의 중심
  const centerOf = (r) => {
    const q = corners(r);
    // 원근에서 바닥 네모의 가운데 = 두 대각선이 만나는 점
    const [a, b, cc, d] = [q.c00, q.c10, q.c11, q.c01];
    const den = (a[0] - cc[0]) * (b[1] - d[1]) - (a[1] - cc[1]) * (b[0] - d[0]);
    const t = ((a[0] - b[0]) * (b[1] - d[1]) - (a[1] - b[1]) * (b[0] - d[0])) / den;
    return [a[0] + t * (cc[0] - a[0]), a[1] + t * (cc[1] - a[1])];
  };
  const before = centerOf(read);
  view = await drag(page, read, [read.w / 2, 60], [[0, 0], [300, 0]], view);
  await check('판 돌리기 300px');
  const after = centerOf(read);
  expect(Math.abs(after[0] - before[0])).toBeLessThan(0.15);
  expect(Math.abs(after[1] - before[1])).toBeLessThan(0.15);
  // 바로 위 가까이(아래로 끌어 높이 80° 안팎 — 원근이 줄어드는 15° 안)
  view = await drag(page, read, [read.w / 2, 40], [[0, 0], [0, 130]], view);
  expect(view.pitch).toBeGreaterThan(75);
  expect(view.pitch).toBeLessThan(90);
  await check('바로 위 가까이');
  // [위][앞][옆]: 원근 없음 — 쌓기나무의 면이 모두 축에 나란한 네모(위·앞·옆에서 본 모양 그림과 같은 모양)
  for (const [dir, pose] of [['top', { yaw: 0, pitch: 90 }], ['front', { yaw: 0, pitch: 0 }], ['side', { yaw: 90, pitch: 0 }]]) {
    await page.locator(`.blk-free .blk-dir[data-dir="${dir}"]`).click();
    await page.mouse.move(1, 1);
    view = { ...view, ...pose };
    await check(dir);
    const faces = read.shapes.filter((s) => s.key.startsWith('f') && s.key.endsWith(dir === 'top' ? ',top' : dir === 'front' ? ',front' : ',right'));
    expect(faces.length).toBeGreaterThan(0);
    for (const f of faces) {
      const xs = new Set(f.pts.map((p) => p[0]));
      const ys = new Set(f.pts.map((p) => p[1]));
      expect([xs.size, ys.size], `${dir} ${f.key}`).toEqual([2, 2]);
    }
    // 보이는 면은 그 방향의 면뿐(옆면이 보이지 않는다)
    const other = read.shapes.filter((s) => s.key.startsWith('f') && !s.key.endsWith(dir === 'top' ? ',top' : dir === 'front' ? ',front' : ',right'));
    expect(other.map((s) => s.key), dir).toEqual([]);
  }
  // 처음 보기로 → 크게(1.25배 — 크게·작게 단계): 판 가운데를 기준으로 같은 원근이 커진다
  await page.locator(stageSel).focus();
  await page.keyboard.press('0');
  view = { ...HOME, zoom: 1 };
  await check('처음 보기로');
  await page.locator('.blk-free .view-in').click();
  await page.mouse.move(1, 1);
  view = { ...view, zoom: 1.25 };
  await check('크게');
  expect(errors).toEqual([]);
});

test('가림 순서와 누른 칸: 원근 판의 무대 곳곳에서 맨 위에 그려진 것 = 눈에서 쏜 반직선이 처음 닿는 것, 그 점을 누르면 3-2절대로 놓인다(판 칸·윗면·옆면)', async ({ page }, testInfo) => {
  test.setTimeout(180_000); // CPU 12배 느리게 한 실행에서 크롬북 25.2초·태블릿 24.4초
  const errors = collectErrors(page);
  await openScene(page);
  let h = sceneMap();
  let read = await readStage(page);
  let view = { ...HOME, zoom: 1 };
  const poses = [['처음 보기', null], ['사용자 그림의 자세', [[0, 0], [-72, -19]]], ['바로 위 가까이', [[0, 0], [60, 110]]], ['낮게 옆에서', [[0, 0], [-160, -80]]]];
  let seen = 0;
  for (const [label, path] of poses) {
    // 자세는 마우스 끌기로 맞춘다(터치 기기도 — 한 손가락 돌리기는 net-workshop-blocks-turn.spec.js). 누르기는 그 기기의 손으로
    if (path) view = await drag(page, read, [read.w / 2, 40], path, view);
    await settled(page);
    read = await readStage(page);
    const want = model(h, view, read);
    const res = compare(read, want);
    expect(res.odd, label).toEqual([]);
    expect(res.gap, label).toBeLessThanOrEqual(0.051);
    const occ = await occlusion(page, read, want, 17);
    expect(occ.wrong, label).toEqual([]);
    expect(occ.hit, label).toBeGreaterThan(250);
    seen += occ.seen;
    // 누르기: 판 칸·윗면·옆면(여러 쪽) 가운데 몇 곳 — 누른 뒤 저장된 높이 지도 = 3-2절, [되돌리기]로 다시 그 장면
    const kinds = new Map();
    for (const s of occ.clean) {
      const kind = s.key.startsWith('t') ? 'tile' : s.key.split(',')[3];
      if (!kinds.has(kind) && placeAt(h, s.key)) kinds.set(kind, s);
    }
    expect(kinds.size, label).toBeGreaterThanOrEqual(3);
    for (const [kind, s] of kinds) {
      const next = placeAt(h, s.key);
      const at = [read.x + s.x, read.y + s.y];
      if (isTouch(testInfo)) await page.touchscreen.tap(...at);
      else await page.mouse.click(...at);
      await expect.poll(() => page.evaluate((k) => JSON.parse(localStorage.getItem(k)).h, KEY14), `${label} ${kind} ${s.key}`).toEqual(next);
      await page.locator('.blk-free-strip .blk-undo').click();
      await expect.poll(() => page.evaluate((k) => JSON.parse(localStorage.getItem(k)).h, KEY14)).toEqual(h);
      await page.mouse.move(1, 1);
    }
  }
  expect(seen).toBeGreaterThan(2000);
  // 바둑판 10층(가장 나쁜 꼴)도 가림 순서가 맞다
  h = Array.from({ length: N }, (_, y) => Array.from({ length: N }, (_, x) => ((x + y) % 2 === 0 ? 10 : 0)));
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY14, JSON.stringify(saved(h))]);
  await page.reload();
  await page.locator(`${stageSel}[data-count="980"]`).waitFor();
  await settled(page);
  view = { ...HOME, zoom: 1 };
  read = await readStage(page);
  view = await drag(page, read, [read.w / 2, 40], [[0, 0], [-40, 60]], view);
  await settled(page);
  read = await readStage(page);
  const want = model(h, view, read);
  expect(compare(read, want).odd).toEqual([]);
  const occ = await occlusion(page, read, want, 29);
  expect(occ.wrong).toEqual([]);
  expect(occ.hit).toBeGreaterThan(200);
  expect(errors).toEqual([]);
});

test('층별로 벌려 보기(원근): 층마다 개수 글자가 서로 겹치지 않고 위층일수록 위에 있다 — 아래층(먼 쪽)이 작아 보여도. 크롬북·세로 태블릿·휴대폰', async ({ browser }, testInfo) => {
  test.skip(isTouch(testInfo), '한 번만(크롬북 묶음에서 크기마다 연다)');
  test.setTimeout(90_000); // CPU 12배 느리게 한 실행에서 3.5초
  for (const [w, hh] of [[1366, 768], [820, 1180], [390, 844]]) {
    const phone = w < 600;
    const context = await browser.newContext({ viewport: { width: w, height: hh }, hasTouch: phone, isMobile: phone });
    const page = await context.newPage();
    const errors = collectErrors(page);
    const n = phone ? 6 : N;
    const h = Array.from({ length: n }, () => new Array(n).fill(0));
    // 10층(휴대폰 6층)까지 한 탑 + 층마다 개수가 다르게
    h[1][1] = phone ? 6 : 10;
    h[2][3] = 3;
    h[3][2] = 2;
    h[0][n - 1] = 1;
    await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [`edu:net-workshop:free-${n}x${n}`, JSON.stringify(saved(h))]);
    await page.goto(fileUrl(FILE, '?sound=off&stage=blocks-free'));
    await page.locator(`${stageSel}[data-count]`).waitFor();
    await page.locator('.blk-free-strip .blk-free-apart').click();
    await settled(page);
    const chips = await page.locator(`${stageSel} .blk-layer`).evaluateAll((els) => els.map((el) => {
      const r = el.getBoundingClientRect();
      return { text: el.textContent, top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    }));
    const label = `${w}×${hh}`;
    expect(chips.map((c) => c.text), label).toEqual(Array.from({ length: phone ? 6 : 10 }, (_, z) => z).map((z) => `${z + 1}층 ${z === 0 ? 4 : z < 2 ? 3 : z < 3 ? 2 : 1}개`));
    for (let i = 1; i < chips.length; i += 1) {
      expect(chips[i].bottom, `${label} ${chips[i].text}는 ${chips[i - 1].text} 위에, 겹치지 않게`).toBeLessThanOrEqual(chips[i - 1].top + 0.5);
    }
    expect(errors).toEqual([]);
    await context.close();
  }
});
