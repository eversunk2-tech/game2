/**
 * 접은 입체 돌려 보기·크게 작게의 계산 (orbit.js, 순수 함수). spec 17-11 단위 표
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRng } from '../../src/shared/core/random.js';
import { foldNet, fromCells, missingSlots, transformCells } from '../../src/games/net-workshop/fold.js';
import { applyDir, dot, normalize } from '../../src/games/net-workshop/geometry.js';
import { CUBE_NETS, FACE_COUNT_NETS, INVALID_HEXOMINOES } from '../../src/games/net-workshop/nets-data.js';
import {
  BLEND_AT,
  DRAG_DEG,
  DRAG_START,
  HOME_WORD,
  LIGHT,
  SPIN,
  TILT,
  TILT_WORDS,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEPS,
  dragView,
  eyeOf,
  facesViewer,
  homeView,
  isBackFacing,
  isHome,
  pinchView,
  sceneAt,
  shadeOf,
  stepTilt,
  stepZoom,
  tiltOf,
  tiltWord,
  tiltZone,
  turnBy,
  uprightTurn,
  viewDir,
  viewLimits,
  wheelView,
  zoomWord,
} from '../../src/games/net-workshop/orbit.js';
import { displayNet, stuckTOf, viewDirection } from '../../src/games/net-workshop/view3d.js';

const HOME = { tilt: TILT, turn: 0 };
// 처음 보기 후보: 보통(56°, 돌림 0·90·180·270)과 2×2 덩어리 장면의 기울기·돌림
const BASES = [HOME, { tilt: 56, turn: 90 }, { tilt: 56, turn: 270 }, { tilt: 48, turn: 15 }, { tilt: 40, turn: 105 }, { tilt: 34, turn: 240 }, { tilt: 28, turn: 330 }, { tilt: 22, turn: 195 }];
const AUTOS = [1, 1.19, 1.335, 1.7];
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const rad = (deg) => (deg * Math.PI) / 180;

/** 버튼·키·끌기·벌리기·휠을 무작위로 섞어 n번 */
function randomOps(rng, base, n, check = () => {}) {
  let view = homeView();
  for (let i = 0; i < n; i += 1) {
    const pick = rng.int(0, 7);
    if (pick === 0) view = dragView(view, base, (rng.next() - 0.5) * 900, (rng.next() - 0.5) * 900);
    else if (pick === 1) view = stepTilt(view, base, rng.next() < 0.5 ? -1 : 1);
    else if (pick === 2) view = stepZoom(view, rng.next() < 0.5 ? -1 : 1);
    else if (pick === 3) view = pinchView(view, view.zoom, 40 + rng.next() * 200, 10 + rng.next() * 600);
    else if (pick === 4) view = wheelView(view, (rng.next() - 0.5) * 3000, { ctrl: rng.next() < 0.3, lines: rng.next() < 0.2 });
    else if (pick === 5) view = turnBy(view, rng.next() < 0.5 ? -30 : 15);
    else if (pick === 6) view = dragView(view, base, 0, rng.next() < 0.5 ? -4000 : 4000); // 끝까지 끌기
    else if (rng.next() < 0.15) view = homeView();
    check(view, i);
  }
  return view;
}

test('펼친 상태(t = 0): 어떤 학생 보기·처음 보기(2×2 포함)에서도 기울기 0, 배율 1, 돌림은 내가 돌린 각도', () => {
  const rng = createRng('view-flat');
  let seen = 0;
  for (const base of BASES) {
    for (const auto of AUTOS) {
      randomOps(rng, base, 120, (view) => {
        const s = sceneAt(0, base, auto, view);
        assert.equal(s.tilt, 0);
        assert.equal(s.scale, 1);
        assert.equal(s.turn, view.spin);
        seen += 1;
      });
    }
  }
  assert.equal(seen, BASES.length * AUTOS.length * 120);
  // 답하기 전(가로 돌림만 됨): 무대 변환이 scale3d(1, 1, 1) rotateX(0deg) rotateZ(돌린 각도)
  assert.deepEqual(sceneAt(0, HOME, 1.19, turnBy(homeView(), 45)), { tilt: 0, turn: 45, scale: 1 });
});

test('처음 보기(회귀): 학생 보기가 처음 값이면 모든 t에서 지금 식과 같다 — baseTilt × t, (−28 + baseTurn) × t, 1 + (zoom − 1) × t', () => {
  for (const base of BASES) {
    for (const auto of AUTOS) {
      for (let i = 0; i <= 200; i += 1) {
        const t = i / 200;
        const s = sceneAt(t, base, auto, homeView());
        assert.equal(s.tilt, base.tilt * t);
        assert.equal(s.turn, 0 + (SPIN + base.turn) * t);
        assert.equal(s.scale, 1 + (auto - 1) * t);
        // 가로 돌림만 한 것도 지금 식(spin + …)과 같다
        assert.equal(sceneAt(t, base, auto, turnBy(homeView(), 30)).turn, 30 + (SPIN + base.turn) * t);
      }
    }
  }
  assert.equal(SPIN, -28);
  assert.equal(TILT, 56);
});

test('한계: 끌기·버튼·키·벌리기·휠을 1,000번 섞어도 기울기 0~180°, 배율 0.5~2배. 한계에 닿으면 "더 못 감"이 참', () => {
  const rng = createRng('view-limits');
  const hit = { atTop: 0, atBottom: 0, zoomMax: 0, zoomMin: 0 };
  for (const base of BASES) {
    randomOps(rng, base, 1000, (view) => {
      const tilt = tiltOf(base, view);
      assert.ok(tilt >= 0 && tilt <= 180, `기울기 ${tilt}`);
      assert.ok(near(tilt, base.tilt + view.lift), '기울기는 자르기 전에도 범위 안');
      assert.ok(view.zoom >= ZOOM_MIN && view.zoom <= ZOOM_MAX, `배율 ${view.zoom}`);
      assert.ok(Number.isFinite(view.spin));
      const lim = viewLimits(view, base);
      assert.equal(lim.atTop, tilt <= 1e-6);
      assert.equal(lim.atBottom, tilt >= 180 - 1e-6);
      assert.equal(lim.zoomMax, view.zoom >= 2 - 1e-6);
      assert.equal(lim.zoomMin, view.zoom <= 0.5 + 1e-6);
      assert.equal(lim.home, isHome(view));
      for (const key of Object.keys(hit)) if (lim[key]) hit[key] += 1;
      // 한계에서는 그쪽으로 더 가지 않는다
      if (lim.atTop) assert.equal(tiltOf(base, stepTilt(view, base, -1)), 0);
      if (lim.atBottom) assert.equal(tiltOf(base, stepTilt(view, base, 1)), 180);
      if (lim.zoomMax) assert.equal(stepZoom(view, 1).zoom, 2);
      if (lim.zoomMin) assert.equal(stepZoom(view, -1).zoom, 0.5);
      // 접는 도중의 무대 값도 범위 안
      for (const t of [0, 0.1, 0.25, 0.5, 1]) {
        const s = sceneAt(t, base, 1.7, view);
        assert.ok(s.tilt >= 0 && s.tilt <= 180);
        assert.ok(s.scale >= 0.5 - 1e-9 && s.scale <= 3.4 + 1e-9);
      }
    });
  }
  for (const [key, count] of Object.entries(hit)) assert.ok(count > 20, `${key} 한계에 닿은 횟수 ${count}`);
  // 이상한 입력은 보기를 바꾸지 않는다
  const view = { spin: 10, lift: 20, zoom: 1.3 };
  assert.deepEqual(wheelView(view, NaN), view);
  assert.deepEqual(wheelView(view, 0), view);
  assert.deepEqual(pinchView(view, 1.3, 0, 100), view);
  assert.deepEqual(pinchView(view, 1.3, 100, 0), view);
});

test('한 단계: 위·아래는 15° 눈금(0·90·180에 딱 닿음), 배율은 0.5 · 0.64 · 0.8 · 1 · 1.25 · 1.6 · 2', () => {
  const walk = (start, step, n) => {
    const out = [];
    let view = start;
    for (let i = 0; i < n; i += 1) {
      view = step(view);
      out.push(view);
    }
    return out;
  };
  const tilts = (base, dir, n) => walk(homeView(), (v) => stepTilt(v, base, dir), n).map((v) => tiltOf(base, v));
  assert.deepEqual(tilts(HOME, -1, 5), [45, 30, 15, 0, 0]);
  assert.deepEqual(tilts(HOME, 1, 10), [60, 75, 90, 105, 120, 135, 150, 165, 180, 180]);
  // 2×2 장면의 처음 기울기에서도 눈금으로 간다
  assert.deepEqual(tilts({ tilt: 48, turn: 0 }, -1, 4), [45, 30, 15, 0]);
  assert.deepEqual(tilts({ tilt: 22, turn: 0 }, 1, 3), [30, 45, 60]);
  assert.deepEqual(tilts({ tilt: 22, turn: 0 }, -1, 3), [15, 0, 0]);
  // 끌어서 눈금 사이에 있을 때: 가까운 다음 눈금으로
  const dragged = dragView(homeView(), HOME, 0, -10); // 56 + 5 = 61°
  assert.equal(tiltOf(HOME, dragged), 61);
  assert.equal(tiltOf(HOME, stepTilt(dragged, HOME, 1)), 75);
  assert.equal(tiltOf(HOME, stepTilt(dragged, HOME, -1)), 60);
  // 가로 돌림·배율은 건드리지 않는다
  assert.deepEqual(stepTilt({ spin: 33, lift: 0, zoom: 1.6 }, HOME, 1), { spin: 33, lift: 4, zoom: 1.6 });

  const zooms = (dir, n) => walk(homeView(), (v) => stepZoom(v, dir), n).map((v) => v.zoom);
  assert.deepEqual(zooms(1, 4), [1.25, 1.6, 2, 2]);
  assert.deepEqual(zooms(-1, 4), [0.8, 0.64, 0.5, 0.5]);
  assert.deepEqual(ZOOM_STEPS, [0.5, 0.64, 0.8, 1, 1.25, 1.6, 2]);
  // 벌리기·휠로 만든 사이 값에서는 가까운 다음 단계로
  assert.equal(stepZoom({ spin: 0, lift: 0, zoom: 1.37 }, 1).zoom, 1.6);
  assert.equal(stepZoom({ spin: 0, lift: 0, zoom: 1.37 }, -1).zoom, 1.25);
  assert.equal(stepZoom({ spin: 0, lift: 0, zoom: 0.55 }, -1).zoom, 0.5);
  assert.deepEqual(stepZoom({ spin: 12, lift: -5, zoom: 1 }, 1), { spin: 12, lift: -5, zoom: 1.25 });
  // 가로: 버튼 ±30°, 키 ±15° (지금과 같음), 한계 없음
  assert.equal(turnBy(turnBy(homeView(), 30), 15).spin, 45);
  assert.equal(walk(homeView(), (v) => turnBy(v, 30), 13).at(-1).spin, 390);
});

test('끌기 값: 1px = 0.5°, 문턱 8px. 벌리기는 손가락 사이 비율, 휠은 위로 굴리면 크게(Ctrl+휠·줄 단위 포함)', () => {
  assert.equal(DRAG_DEG, 0.5);
  assert.equal(DRAG_START, 8);
  // (100, 40) 끌기 → 돌림 −50°, 기울기 −20°
  assert.deepEqual(dragView(homeView(), HOME, 100, 40), { spin: -50, lift: -20, zoom: 1 });
  // 여러 번 나눠 끌어도 같다
  let view = homeView();
  for (let i = 0; i < 10; i += 1) view = dragView(view, HOME, 10, 4);
  assert.ok(near(view.spin, -50) && near(view.lift, -20));
  // 벌리기: 40px → 160px = 4배 → 2배에서 멈춤, 오므리기 160 → 30 → 0.5배에서 멈춤, 사이 값도 된다
  assert.equal(pinchView(homeView(), 1, 40, 160).zoom, 2);
  assert.equal(pinchView(homeView(), 2, 160, 30).zoom, 0.5);
  assert.ok(near(pinchView(homeView(), 1, 100, 137).zoom, 1.37));
  assert.ok(near(pinchView({ spin: 5, lift: 7, zoom: 9 }, 1.25, 100, 120).zoom, 1.5));
  // 휠
  const up = wheelView(homeView(), -100).zoom;
  const down = wheelView(homeView(), 100).zoom;
  assert.ok(up > 1.1 && up < 1.25, `${up}`);
  assert.ok(near(up * down, 1));
  assert.equal(wheelView(homeView(), -100000).zoom, 2);
  assert.equal(wheelView(homeView(), 100000).zoom, 0.5);
  assert.ok(wheelView(homeView(), -10, { ctrl: true }).zoom > wheelView(homeView(), -10).zoom); // 터치패드 벌리기는 값이 작게 온다
  assert.ok(near(wheelView(homeView(), -3, { lines: true }).zoom, wheelView(homeView(), -99).zoom));
  // 끌기·휠은 서로의 값을 건드리지 않는다
  assert.deepEqual(wheelView({ spin: 7, lift: 9, zoom: 1 }, -100), { spin: 7, lift: 9, zoom: up });
  assert.equal(dragView({ spin: 0, lift: 0, zoom: 1.6 }, HOME, 30, 30).zoom, 1.6);
});

test('방향: 오른쪽으로 끌면 앞면이 오른쪽으로, 아래로 끌면(·위쪽 버튼) 윗면이 보는 쪽을 더 향한다 — 기울기 0~180° 어디서나 같다', () => {
  const TOP = [0, 0, 1]; // 접은 입체의 윗면 법선 (root 면)
  for (const base of BASES) {
    for (let lift = -base.tilt; lift <= 180 - base.tilt; lift += 7) {
      for (const spin of [0, 40, 135, 250, -75]) {
        const view = { spin, lift, zoom: 1 };
        const now = sceneAt(1, base, 1, view);
        // 지금 화면 가운데에서 보는 사람 쪽을 향한 옆 방향(앞면 가운데): 화면 x = 0
        const b = rad(now.turn);
        const front = [Math.sin(b), Math.cos(b), 0];
        assert.ok(near(viewDir(front, now.tilt, now.turn)[0], 0, 1e-9));
        for (const dx of [10, 60, 200]) {
          const after = sceneAt(1, base, 1, dragView(view, base, dx, 0));
          assert.ok(viewDir(front, after.tilt, after.turn)[0] > 0, `오른쪽 끌기 ${dx}px, 기울기 ${now.tilt}`);
          assert.equal(after.tilt, now.tilt); // 옆으로만 끌면 기울기는 그대로
          const left = sceneAt(1, base, 1, dragView(view, base, -dx, 0));
          assert.ok(viewDir(front, left.tilt, left.turn)[0] < 0);
        }
        // 아래로 끌기 · [위쪽으로 돌려 보기]: 윗면이 보는 쪽을 더 향한다 (바로 위에서는 그대로)
        const topNow = viewDir(TOP, now.tilt, now.turn)[2];
        for (const moved of [dragView(view, base, 0, 30), stepTilt(view, base, -1)]) {
          const after = sceneAt(1, base, 1, moved);
          const topAfter = viewDir(TOP, after.tilt, after.turn)[2];
          if (now.tilt > 1e-6) assert.ok(topAfter > topNow, `윗면 ${topNow} → ${topAfter} (기울기 ${now.tilt})`);
          else assert.ok(near(topAfter, topNow));
          assert.equal(after.turn, now.turn);
        }
        // 위로 끌기 · [아래쪽으로 돌려 보기]: 아랫면 쪽으로
        for (const moved of [dragView(view, base, 0, -30), stepTilt(view, base, 1)]) {
          const after = sceneAt(1, base, 1, moved);
          if (now.tilt < 180 - 1e-6) assert.ok(viewDir(TOP, after.tilt, after.turn)[2] < topNow);
        }
        // [오른쪽으로 돌려 보기]·→: 오른쪽 면이 앞으로 (지금과 같은 방향)
        const right = [Math.cos(b), -Math.sin(b), 0]; // 지금 화면 오른쪽을 향한 옆 방향
        const turned = sceneAt(1, base, 1, turnBy(view, 30));
        if (now.tilt > 1 && now.tilt < 179) assert.ok(viewDir(right, turned.tilt, turned.turn)[2] > viewDir(right, now.tilt, now.turn)[2]);
      }
    }
  }
});

test('잇기: 접는 정도 0 → 1에서 기울기·배율이 끊기지 않고, 4분의 1 넘게 접히면 학생 보기가 다 적용된다', () => {
  const rng = createRng('view-blend');
  assert.equal(BLEND_AT, 0.25);
  for (const base of BASES) {
    for (let n = 0; n < 40; n += 1) {
      const view = randomOps(rng, base, 12);
      const auto = AUTOS[n % AUTOS.length];
      let prev = sceneAt(0, base, auto, view);
      for (let i = 1; i <= 1000; i += 1) {
        const t = i / 1000;
        const s = sceneAt(t, base, auto, view);
        // 한 칸(1/1000)에 기울기는 1° 안쪽, 배율은 0.01 안쪽으로만 바뀐다 (튀지 않는다)
        assert.ok(Math.abs(s.tilt - prev.tilt) < 1, `기울기 ${prev.tilt} → ${s.tilt} (t = ${t})`);
        assert.ok(Math.abs(s.scale - prev.scale) < 0.01, `배율 ${prev.scale} → ${s.scale} (t = ${t})`);
        if (t >= BLEND_AT) {
          assert.ok(near(s.tilt, Math.max(0, Math.min(180, base.tilt * t + view.lift))));
          assert.ok(near(s.scale, (1 + (auto - 1) * t) * view.zoom));
        }
        prev = s;
      }
      // 다 접으면 내가 보던 방향·크기 그대로
      const end = sceneAt(1, base, auto, view);
      assert.ok(near(end.tilt, tiltOf(base, view)));
      assert.ok(near(end.turn, view.spin + SPIN + base.turn));
      assert.ok(near(end.scale, auto * view.zoom));
    }
  }
});

test('빛: 밝기 값 0~0.34, 빛을 향한 면이 가장 밝다. 처음 보기의 정육면체 값은 지금과 같고, 아래에서 보면 바닥 면은 계산대로', () => {
  const rng = createRng('view-light');
  // 지금 식(view3d.js에 있던 것)을 그대로 옮겨 견준다
  const oldDir = (n, tiltDeg, spinDeg) => {
    const b = rad(spinDeg);
    const a = rad(tiltDeg);
    const z1 = [n[0] * Math.cos(b) - n[1] * Math.sin(b), n[0] * Math.sin(b) + n[1] * Math.cos(b), n[2]];
    return [z1[0], z1[1] * Math.cos(a) - z1[2] * Math.sin(a), z1[1] * Math.sin(a) + z1[2] * Math.cos(a)];
  };
  const oldShade = (n, tilt, turn) => 0.34 * (1 - Math.max(0, Math.min(1, dot(normalize(oldDir(n, tilt, turn)), normalize([-0.45, -0.55, 1])))));
  const NORMALS = [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]];
  for (let i = 0; i < 2000; i += 1) {
    const tilt = rng.next() * 180;
    const turn = (rng.next() - 0.5) * 720;
    for (const n of NORMALS) {
      const s = shadeOf(n, tilt, turn);
      assert.ok(s >= 0 && s <= 0.34 + 1e-12, `${s}`);
      assert.equal(s, oldShade(n, tilt, turn));
      assert.deepEqual(viewDir(n, tilt, turn), oldDir(n, tilt, turn));
    }
  }
  // 처음 보기(기울기 56°, 돌림 −28° + 0·90·180·270)에서 접는 도중·다 접은 뒤의 값이 지금 식과 같다
  for (const base of BASES) {
    for (const t of [0, 0.3, 0.5, 1]) {
      const s = sceneAt(t, base, 1.19, homeView());
      for (const n of NORMALS) assert.equal(shadeOf(n, s.tilt, s.turn).toFixed(3), oldShade(n, base.tilt * t, (SPIN + base.turn) * t).toFixed(3));
    }
  }
  // 펼친 전개도(위에서 봄)의 면은 모두 같은 밝기 — 문항과 무관
  assert.equal(shadeOf([0, 0, 1], 0, 0).toFixed(3), '0.063');
  assert.equal(shadeOf([0, 0, 1], 0, 45).toFixed(3), '0.063');
  // 처음 보기의 세 면: 윗면이 가장 밝고, 앞(+y)·왼쪽(−x) 면은 빛을 덜 받는다
  const [top, front, left] = [[0, 0, 1], [0, 1, 0], [-1, 0, 0]].map((n) => shadeOf(n, TILT, SPIN));
  assert.ok(top < left && left < front, `${top} ${left} ${front}`);
  // 빛을 똑바로 향한 면이 가장 밝다(0): 화면에 고정된 빛 방향을 모델로 되돌려 넣는다
  for (const [tilt, turn] of [[56, -28], [0, 0], [120, 200], [180, 45]]) {
    const a = rad(-tilt);
    const b = rad(-turn);
    const y1 = LIGHT[1] * Math.cos(a) - LIGHT[2] * Math.sin(a);
    const z1 = LIGHT[1] * Math.sin(a) + LIGHT[2] * Math.cos(a);
    const toLight = [LIGHT[0] * Math.cos(b) - y1 * Math.sin(b), LIGHT[0] * Math.sin(b) + y1 * Math.cos(b), z1];
    assert.ok(shadeOf(toLight, tilt, turn) < 1e-9);
    for (const n of NORMALS) assert.ok(shadeOf(n, tilt, turn) >= shadeOf(toLight, tilt, turn));
  }
  // 아래에서 본 바닥 면(법선 −z): 바로 아래(180°)에서는 보는 사람을 똑바로 향해 윗면을 위에서 볼 때와 같은 밝기,
  // 비스듬히 아래(135°)에서는 화면 아래쪽을 향해 빛(왼쪽 위 앞)을 덜 받는다
  assert.equal(shadeOf([0, 0, -1], 180, SPIN).toFixed(3), '0.063');
  const lightUnit = Math.hypot(0.45, 0.55, 1);
  const expected = 0.34 * (1 - (Math.SQRT1_2 * -0.55 + Math.SQRT1_2 * 1) / lightUnit);
  assert.ok(near(shadeOf([0, 0, -1], 135, SPIN), expected, 1e-12), `${shadeOf([0, 0, -1], 135, SPIN)} ≠ ${expected}`);
  assert.ok(shadeOf([0, 0, -1], 135, SPIN) > shadeOf([0, 0, -1], 180, SPIN));
  // 보이지 않는 쪽(빛 반대쪽)은 가장 어둡다
  assert.equal(shadeOf([0, 0, -1], 0, 0), 0.34);
});

// ── 뒷면(종이 안쪽) 판정과 글자 ───────────────────
const STAGE_H = 400;
const EYE = eyeOf(STAGE_H);
/** CSS perspective와 같은 원근 투영: 무대 가운데 기준 px 좌표(모델 방향) → 화면 [x, y] */
function project(point, tilt, turn) {
  const q = viewDir(point, tilt, turn);
  const k = EYE[2] / (EYE[2] - q[2]);
  return [EYE[0] + (q[0] - EYE[0]) * k, EYE[1] + (q[1] - EYE[1]) * k];
}
/** 화면에서 다각형이 도는 방향: 양수면 펼친 종이(앞면)와 같은 방향 */
function winding(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum;
}
/** 접은 전개도의 면들을 무대 가운데(입체를 감싸는 상자의 가운데) 기준 px로 */
function sceneFaces(net, px, tOf = null) {
  const folded = foldNet(net, 1, { tOf });
  const all = folded.faces.flatMap((f) => f.points);
  const center = [0, 1, 2].map((k) => (Math.min(...all.map((p) => p[k])) + Math.max(...all.map((p) => p[k]))) / 2);
  const toPx = (p) => p.map((v, k) => (v - center[k]) * px);
  return folded.faces.map((f) => ({
    id: f.id,
    normal: f.normal,
    mid: toPx(f.center),
    corners: f.points.map(toPx),
    right: applyDir(f.matrix, [1, 0, 0]),
    down: applyDir(f.matrix, [0, 1, 0]),
  }));
}
/**
 * 글자를 바로 세우는 변환(CSS: rotate(θ), 뒷면이면 rotate(θ) scaleX(-1))을 한 뒤 글자의 '오른쪽'·'아래' 방향.
 * right3·down3: 모델 좌표의 방향, right·down: 원근으로 화면에 옮긴 방향
 */
function textAxes(face, tilt, turn, back, px) {
  const th = rad(uprightTurn(face.right, face.down, tilt, turn));
  const mix = (a, b) => [0, 1, 2].map((k) => a * face.right[k] + b * face.down[k]);
  const down3 = mix(-Math.sin(th), Math.cos(th)); // rotate(θ)(0, 1) — 좌우로 뒤집어도 그대로
  const right3 = back ? mix(-Math.cos(th), -Math.sin(th)) : mix(Math.cos(th), Math.sin(th)); // rotate(θ) · scaleX(−1)(1, 0)
  const at = (dir) => project(face.mid.map((v, k) => v + 0.01 * px * dir[k]), tilt, turn);
  const origin = project(face.mid, tilt, turn);
  const from = (p) => [p[0] - origin[0], p[1] - origin[1]];
  return { right3, down3, right: from(at(right3)), down: from(at(down3)) };
}

test('뒷면 판정(원근): 닫힌 정육면체는 무작위 보기 2,000개에서 눈 쪽 면만 앞면(1~3개, 마주 보는 두 면이 함께 앞면인 일은 없다)', () => {
  const rng = createRng('view-back');
  const counts = { 1: 0, 2: 0, 3: 0 };
  for (let i = 0; i < 2000; i += 1) {
    const net = fromCells(transformCells(CUBE_NETS[i % CUBE_NETS.length].cells, i % 8));
    const px = 60 + rng.next() * 260; // 칸 한 변(px) × 배율
    const tilt = rng.next() * 180;
    const turn = (rng.next() - 0.5) * 720;
    const faces = sceneFaces(net, px);
    const eyeDistance = (f) => {
      const q = viewDir(f.mid, tilt, turn);
      return Math.hypot(q[0] - EYE[0], q[1] - EYE[1], q[2] - EYE[2]);
    };
    const front = [];
    for (const f of faces) {
      const back = isBackFacing(f.normal, f.mid, tilt, turn, EYE);
      // 독립 확인: 꼭짓점을 원근으로 화면에 옮겨 도는 방향을 본다(앞면은 펼친 종이와 같은 방향)
      const area = winding(f.corners.map((p) => project(p, tilt, turn)));
      if (Math.abs(area) > 1e-6 * px * px) assert.equal(back, area < 0, `보기 ${i} ${f.id}: 넓이 ${area}`);
      if (!back) front.push(f);
    }
    assert.ok(front.length >= 1 && front.length <= 3, `앞면 ${front.length}개`);
    counts[front.length] += 1;
    for (const f of front) {
      const opposite = faces.find((g) => dot(g.normal, f.normal) < -0.99);
      assert.ok(isBackFacing(opposite.normal, opposite.mid, tilt, turn, EYE), '마주 보는 면은 뒷면');
      assert.ok(eyeDistance(f) < eyeDistance(opposite), '앞면은 마주 보는 면보다 눈에 가깝다');
    }
  }
  assert.ok(counts[3] > 1000, `세 면이 보이는 보기 ${counts[3]}개`);
  // 펼친 전개도(위에서 봄)는 모든 면이 앞면 — 답하기 전에는 뒤집히는 글자가 없다
  for (const n of CUBE_NETS) {
    const net = fromCells(n.cells);
    const flat = foldNet(net, 0);
    for (const f of flat.faces) {
      for (const turn of [0, 15, 90, 200]) assert.equal(isBackFacing(f.normal, [(f.center[0] - 2) * 90, (f.center[1] - 2) * 90, 0], 0, turn, EYE), false);
    }
  }
});

test('뒷면 판정: 면이 하나 빈 상자는 구멍으로 보이는 맞은편 면이 뒷면(종이 안쪽), 아래에서 본 2×2 장면은 모든 면이 뒷면', () => {
  let boxes = 0;
  for (const n of FACE_COUNT_NETS.filter((x) => x.faces === 5)) {
    const { net } = displayNet(fromCells(n.cells));
    const [hole] = missingSlots(net);
    const faces = sceneFaces(net, 110);
    const opposite = faces.find((f) => dot(f.normal, hole.normal) < -0.99);
    assert.ok(opposite, n.name);
    // 구멍이 보는 사람을 똑바로 향하게 돌린다: 옆면 구멍은 옆에서(기울기 90°), 그 법선이 화면 앞(+z)으로 오게
    assert.ok(Math.abs(hole.normal[2]) < 0.01, '빈 자리는 옆면에 둔다');
    const turn = (Math.atan2(hole.normal[0], hole.normal[1]) * 180) / Math.PI;
    assert.ok(viewDir(hole.normal, 90, turn)[2] > 0.999);
    assert.equal(isBackFacing(opposite.normal, opposite.mid, 90, turn, EYE), true);
    // 구멍 둘레의 네 면도 안쪽이 보인다(눈이 상자 너비 안에 있다)
    for (const f of faces) assert.equal(isBackFacing(f.normal, f.mid, 90, turn, EYE), true, `${n.name} ${f.id}`);
    // 반대쪽에서 보면 맞은편 면은 앞면(바깥)
    assert.equal(isBackFacing(opposite.normal, opposite.mid, 90, turn + 180, EYE), false);
    boxes += 1;
  }
  assert.ok(boxes >= 3);
  let scenes = 0;
  for (const n of INVALID_HEXOMINOES.filter((x) => x.shape === 'block')) {
    const { net, turn, tilt } = displayNet(fromCells(n.cells));
    const faces = sceneFaces(net, 100, stuckTOf(net));
    // 처음 보기에서는 모두 앞면, 바로 아래(180°)에서는 모두 뒷면
    for (const f of faces) {
      assert.equal(isBackFacing(f.normal, f.mid, tilt, SPIN + turn, EYE), false, `${n.name} ${f.id} 처음 보기`);
      assert.equal(isBackFacing(f.normal, f.mid, 180, SPIN + turn, EYE), true, `${n.name} ${f.id} 아래에서`);
    }
    scenes += 1;
  }
  assert.equal(scenes, 8);
});

test('글자 바로 세우기: 돌리고 뒤집은 뒤 좌우가 거울상이 아니고(앞면·뒷면 모두), 글자의 아래가 화면 아래를 향한다(면 위에서 ±45° 안)', () => {
  const rng = createRng('view-upright');
  const nets = [
    ...CUBE_NETS.map((n) => ({ net: fromCells(n.cells), tOf: null })),
    ...INVALID_HEXOMINOES.map((n) => {
      const { net } = displayNet(fromCells(n.cells));
      return { net, tOf: stuckTOf(net) };
    }),
  ];
  const seen = { front: 0, back: 0, facing: 0 };
  let worstFacing = 0;
  let worstInPlane = 0;
  for (let i = 0; i < 4000; i += 1) {
    const { net, tOf } = nets[i % nets.length];
    const px = 60 + rng.next() * 260;
    const tilt = rng.next() * 180;
    const turn = (rng.next() - 0.5) * 720;
    for (const f of sceneFaces(net, px, tOf)) {
      const back = isBackFacing(f.normal, f.mid, tilt, turn, EYE);
      assert.ok([0, 90, 180, 270].includes(uprightTurn(f.right, f.down, tilt, turn)));
      const facing = Math.abs(viewDir(f.normal, tilt, turn)[2]); // 1이면 똑바로 마주 봄, 0이면 옆에서 봐서 선으로 보임
      if (facing < 0.05) continue;
      const { right, down, down3 } = textAxes(f, tilt, turn, back, px);
      // 거울상이 아니다: 화면에서 글자의 오른쪽 → 아래가 시계 방향(보통 글자와 같은 방향)
      assert.ok(right[0] * down[1] - right[1] * down[0] > 0, `보기 ${i} ${f.id} ${back ? '뒷면' : '앞면'}: 거울상`);
      seen[back ? 'back' : 'front'] += 1;
      // 면 위에서 재면: 글자의 '아래'와 "화면 아래를 면 위로 내린 방향" 사이가 45° 안 (90° 단위로 고를 수 있는 가장 좋은 것)
      const downOnScreen = viewDir(down3, tilt, turn); // 원근 없이 화면으로
      assert.ok(downOnScreen[1] > 0, `보기 ${i} ${f.id}: 글자가 거꾸로`);
      const n = viewDir(f.normal, tilt, turn);
      const onFace = normalize([0 - n[1] * n[0], 1 - n[1] * n[1], 0 - n[1] * n[2]]); // 화면 아래 (0, 1, 0)에서 법선 성분을 뺀 것
      const inPlane = (Math.acos(Math.max(-1, Math.min(1, dot(normalize(downOnScreen), onFace)))) * 180) / Math.PI;
      assert.ok(inPlane <= 45 + 1e-6, `보기 ${i} ${f.id}: 면 위에서 ${inPlane.toFixed(1)}°`);
      worstInPlane = Math.max(worstInPlane, inPlane);
      // 화면에서 잰 각도(원근 넣어): 거의 똑바로 마주 보는 면은 ±45°에서 원근만큼(몇 도)만 더 벗어난다
      if (facing >= 0.9) {
        const off = Math.abs((Math.atan2(down[0], down[1]) * 180) / Math.PI);
        seen.facing += 1;
        worstFacing = Math.max(worstFacing, off);
      }
    }
  }
  assert.ok(seen.front > 5000 && seen.back > 5000, JSON.stringify(seen));
  assert.ok(seen.facing > 500);
  assert.ok(worstInPlane > 44, `${worstInPlane}`); // 재는 방법이 너무 느슨하지 않은지
  assert.ok(worstFacing < 52, `마주 보는 면에서 가장 벗어난 각도 ${worstFacing.toFixed(1)}°`);
  // 똑바로 마주 보는 면(위에서, 원근 없이): 화면에서도 딱 ±45° 안이고, 경계(45°)가 아니면 전에 쓰던 식(면 '아래'의 화면 각도를 90° 단위로)과 같다
  for (let deg = 0; deg < 360; deg += 1) {
    const down = [Math.cos(rad(deg)), Math.sin(rad(deg)), 0]; // 화면에서 면의 '아래'가 향한 각도
    const right = [Math.sin(rad(deg)), -Math.cos(rad(deg)), 0]; // 앞면: 오른쪽 = 아래 × 법선(0, 0, 1)
    const turnDeg = uprightTurn(right, down, 0, 0);
    const off = (((deg + turnDeg - 90) % 360) + 540) % 360 - 180;
    assert.ok(Math.abs(off) <= 45 + 1e-9, `${deg}° → ${turnDeg}°`);
    if (deg % 90 !== 45) assert.equal(turnDeg, ((Math.round((90 - deg) / 90) * 90) % 360 + 360) % 360);
  }
  // 정육면체의 옆면: 기울기 45°~135°(비스듬히 위·옆·비스듬히 아래)에서는 어느 쪽으로 돌려도, 종이가 어느 방향으로 붙었어도
  // 글자의 아래가 입체의 아래쪽(−z)이다. 윗면은 네 변 가운데 화면 아래를 가장 향한 변이 글자의 아래
  for (let tilt = 5; tilt < 180; tilt += 10) {
    for (let turn = 0; turn < 360; turn += 7) {
      if (tilt > 45 && tilt < 135) {
        for (const [right, down] of [[[1, 0, 0], [0, 0, -1]], [[0, 0, -1], [-1, 0, 0]], [[-1, 0, 0], [0, 0, 1]], [[0, 0, 1], [1, 0, 0]]]) {
          const th = rad(uprightTurn(right, down, tilt, turn));
          const textDown = [0, 1, 2].map((k) => -Math.sin(th) * right[k] + Math.cos(th) * down[k]);
          assert.deepEqual(textDown.map((v) => Math.round(v) + 0), [0, 0, -1], `옆면 기울기 ${tilt} 돌림 ${turn}`);
        }
      }
      const th = rad(uprightTurn([1, 0, 0], [0, 1, 0], tilt, turn));
      const topDown = [-Math.sin(th), Math.cos(th), 0];
      const best = Math.max(...[[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]].map((v) => viewDir(v, tilt, turn)[1]));
      assert.ok(near(viewDir(topDown, tilt, turn)[1], best, 1e-9), `윗면 기울기 ${tilt} 돌림 ${turn}`);
    }
  }
});

test('빈 자리 안내: 처음 보기에서 안 보이는 빈 자리가 돌리거나 기울이면 "보임"으로 계산된다 — 아래쪽 빈 자리는 아래에서 보면 보인다', () => {
  // 아래쪽(법선 −z) 자리: 위에서는 어떻게 돌려도 안 보이고, 아래에서 보면 보인다
  for (const spin of [0, 90, 180, 270]) {
    assert.equal(facesViewer([0, 0, -1], TILT, SPIN + spin), false);
    assert.equal(facesViewer([0, 0, -1], 90, SPIN + spin), false); // 옆에서 보면 선으로만
    assert.equal(facesViewer([0, 0, -1], 120, SPIN + spin), true);
    assert.equal(facesViewer([0, 0, -1], 180, SPIN + spin), true);
  }
  // 옆면 자리: 지금 식(viewDirection(…)[2] < 0.05이면 숨음)과 같은 판정
  let hidden = 0;
  let shown = 0;
  for (const n of INVALID_HEXOMINOES.filter((x) => x.shape !== 'block')) {
    const { net, turn, tilt } = displayNet(fromCells(n.cells));
    for (const slot of missingSlots(net)) {
      const now = facesViewer(slot.normal, tilt, SPIN + turn);
      assert.equal(now, !(viewDirection(slot.normal, turn, tilt)[2] < 0.05));
      if (now) {
        shown += 1;
        continue;
      }
      hidden += 1;
      // 숨은 빈 자리: 가로로 한 바퀴 돌리는 동안(30°씩) 어디선가 보인다. 바로 위·아래로만 기울여서는 옆면 뒤쪽이 보이지 않는다
      const spins = Array.from({ length: 12 }, (_, i) => i * 30);
      assert.ok(spins.some((spin) => facesViewer(slot.normal, tilt, SPIN + turn + spin)), n.name);
      assert.equal(facesViewer(slot.normal, 0, SPIN + turn), false);
    }
  }
  assert.ok(hidden > 0 && shown > 0, `${hidden} ${shown}`);
});

test('보는 방향·크기 말: 구간 경계 0·20·70·110·160·180, 배율, 처음 보기 — 면 이름·빈 자리·겹침은 말하지 않는다', () => {
  assert.deepEqual([0, 19.9, 20, 45, 69.9, 70, 90, 110, 110.1, 135, 160, 160.1, 180].map(tiltZone), [0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4]);
  assert.equal(tiltWord(0), '위에서 본 모습이에요.');
  assert.equal(tiltWord(15), '위에서 본 모습이에요.');
  assert.equal(tiltWord(56), '비스듬히 위에서 본 모습이에요.');
  assert.equal(tiltWord(90), '옆에서 본 모습이에요.');
  assert.equal(tiltWord(135), '비스듬히 아래에서 본 모습이에요.');
  assert.equal(tiltWord(165), '아래에서 본 모습이에요.');
  assert.equal(tiltWord(180), '아래에서 본 모습이에요.');
  // 15° 눈금으로 한 바퀴: 위 2 · 비스듬히 위 3 · 옆 3 · 비스듬히 아래 3 · 아래 2
  const zones = Array.from({ length: 13 }, (_, i) => tiltZone(i * 15));
  assert.deepEqual([0, 1, 2, 3, 4].map((z) => zones.filter((x) => x === z).length), [2, 3, 3, 3, 2]);
  assert.equal(zoomWord(1), '처음 크기예요.');
  assert.equal(zoomWord(1.6), '1.6배로 크게 보여요.');
  assert.equal(zoomWord(2), '2배로 크게 보여요.');
  assert.equal(zoomWord(1.25), '1.25배로 크게 보여요.');
  assert.equal(zoomWord(0.8), '0.8배로 작게 보여요.');
  assert.equal(zoomWord(0.5), '0.5배로 작게 보여요.');
  assert.equal(zoomWord(1.3712), '1.37배로 크게 보여요.');
  assert.equal(HOME_WORD, '처음 보기로 돌아왔어요.');
  // 까닭을 고르는 동안에도 읽히는 문장이라 까닭 낱말이 들어가면 안 된다 (e2e expectNoReasonShown과 같은 낱말)
  for (const text of [...TILT_WORDS, HOME_WORD, ...ZOOM_STEPS.map(zoomWord)]) {
    assert.doesNotMatch(text, /겹|네 면|한 점|모여|모이|비어|꼭짓점|●|가 면|나 면/);
    assert.match(text, /요\.$/); // 해요체 한 문장
  }
});
