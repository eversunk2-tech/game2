/**
 * 접은 입체 돌려 보기·크게 작게의 계산 (orbit.js, 순수 함수). spec 17-11 단위 표 + 17-17(어느 방향으로든 끝없이 돌린다) + 17-18(접는 도중에도 같은 정도로)
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRng } from '../../src/shared/core/random.js';
import { foldNet, fromCells, missingSlots, transformCells } from '../../src/games/net-workshop/fold.js';
import { applyDir, dot, normalize } from '../../src/games/net-workshop/geometry.js';
import { CUBE_NETS, FACE_COUNT_NETS, INVALID_HEXOMINOES } from '../../src/games/net-workshop/nets-data.js';
import {
  DRAG_DEG,
  DRAG_START,
  HOME_WORD,
  LIGHT,
  MIX_MS,
  SPIN,
  TILT,
  TILT_STEP,
  TILT_WORDS,
  TURN_BUTTON,
  TURN_KEY,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEPS,
  dragView,
  elevationOf,
  eyeOf,
  facesViewer,
  foldedPose,
  homeView,
  isBackFacing,
  isHome,
  lookFor,
  lookToward,
  mixStep,
  pinchView,
  poseOf,
  rollBy,
  rollGap,
  rollOf,
  rotationMatrix,
  sameLook,
  sceneAt,
  shadeOf,
  stepView,
  stepZoom,
  tiltWord,
  tiltZone,
  turnBy,
  turnVector,
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
const DIRS = ['left', 'right', 'up', 'down'];
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const rad = (deg) => (deg * Math.PI) / 180;
const deg = (radians) => (radians * 180) / Math.PI;
const transpose = (m) => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
const multiply3 = (a, b) => {
  const out = new Array(9).fill(0);
  for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) for (let k = 0; k < 3; k += 1) out[r * 3 + c] += a[r * 3 + k] * b[k * 3 + c];
  return out;
};
const det3 = (m) => m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
/** 두 자세 사이의 각도(도): 0이면 같은 자세 */
const angleBetween = (a, b) => {
  const r = multiply3(a, transpose(b));
  return deg(Math.acos(Math.max(-1, Math.min(1, (r[0] + r[4] + r[8] - 1) / 2))));
};
const samePose = (a, b, eps = 1e-9) => a.every((v, i) => near(v, b[i], eps));
/** 찌그러지지 않은 회전인가: 세 축이 서로 직각이고 길이 1, 뒤집히지 않음 */
function distortion(m) {
  const mt = multiply3(m, transpose(m));
  const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  return Math.max(...mt.map((v, i) => Math.abs(v - identity[i])), Math.abs(det3(m) - 1));
}

/**
 * 접는 정도 t에서 화면에 넣는 무대 값: 학생 보기 가운데 넣을 것은 lookFor가 정한다
 * (on = 보기 조작이 켜짐(답한 뒤). 조금이라도 접혀 있으면 그대로, 다 편 전개도·답하기 전에는 처음 모습)
 */
const shownAt = (t, base, auto, view, on = true) => sceneAt(t, base, auto, { spin: view.spin, ...lookFor(t, on, view) });
const FOLDS = [0.01, 0.05, 0.1, 0.2, 0.24, 0.25, 0.3, 0.6, 1]; // 접는 정도 1 · 5 · 10 · 20 · 24 · 25 · 30 · 60 · 100%

/** 버튼·키·끌기·벌리기·휠을 무작위로 섞어 n번 */
function randomOps(rng, n, check = () => {}) {
  let view = homeView();
  for (let i = 0; i < n; i += 1) {
    const pick = rng.int(0, 8);
    if (pick === 0) view = dragView(view, (rng.next() - 0.5) * 900, (rng.next() - 0.5) * 900);
    else if (pick === 1) view = stepView(view, DIRS[rng.int(0, 3)]);
    else if (pick === 2) view = stepZoom(view, rng.next() < 0.5 ? -1 : 1);
    else if (pick === 3) view = pinchView(view, view.zoom, 40 + rng.next() * 200, 10 + rng.next() * 600);
    else if (pick === 4) view = wheelView(view, (rng.next() - 0.5) * 3000, { ctrl: rng.next() < 0.3, lines: rng.next() < 0.2 });
    else if (pick === 5) view = turnBy(view, rng.next() < 0.5 ? -30 : 15); // 펼친 채 평면에서 돌린 것
    else if (pick === 6) view = dragView(view, 0, rng.next() < 0.5 ? -4000 : 4000); // 한쪽으로 아주 길게 끌기(여러 바퀴)
    else if (pick === 7) view = stepView(view, DIRS[rng.int(0, 1)], TURN_KEY); // ← → 키
    else if (rng.next() < 0.1) view = homeView();
    check(view, i);
  }
  return view;
}

test('펼친 상태(t = 0): 어떤 학생 보기·처음 보기(2×2 포함)에서도 기울기 0, 더 돌린 것 0, 배율 1, 돌림은 평면에서 돌린 각도. 답하기 전에는 접혀 있어도(힌트) 처음 모습', () => {
  const rng = createRng('view-flat');
  let seen = 0;
  for (const base of BASES) {
    for (const auto of AUTOS) {
      randomOps(rng, 120, (view) => {
        // 다 편 전개도: 보기 조작이 켜져 있든(답한 뒤) 아니든 처음 모습
        for (const on of [true, false]) {
          assert.deepEqual(lookFor(0, on, view), { roll: [0, 0, 0, 1], zoom: 1 });
          const s = shownAt(0, base, auto, view, on);
          assert.equal(s.tilt, 0);
          assert.equal(s.scale, 1);
          assert.equal(s.turn, view.spin);
          assert.equal(s.roll.angle, 0);
          // 펼친 전개도의 자세: 종이 앞면이 보는 사람을 똑바로 향한다(평면에서만 돈다)
          assert.ok(near(turnVector(poseOf(s), [0, 0, 1])[2], 1));
        }
        // 답하기 전(보기 조작이 꺼짐): 반만 접어 보는 힌트 동안에도 학생 보기는 들어가지 않는다 — 처음 보기의 기울기·돌림·자동 맞춤뿐
        for (const t of [0.3, 0.5, 1]) {
          const locked = shownAt(t, base, auto, view, false);
          assert.deepEqual(locked, { tilt: base.tilt * t, turn: view.spin + (SPIN + base.turn) * t, scale: 1 + (auto - 1) * t, roll: { axis: [0, 0, 1], angle: 0 } });
        }
        seen += 1;
      });
    }
  }
  assert.equal(seen, BASES.length * AUTOS.length * 120);
  // 답하기 전(평면 돌림만 됨): 무대 변환이 scale3d(1, 1, 1) rotateX(0deg) rotateZ(돌린 각도)
  assert.deepEqual(shownAt(0, HOME, 1.19, turnBy(homeView(), 45), false), { tilt: 0, turn: 45, scale: 1, roll: { axis: [0, 0, 1], angle: 0 } });
  assert.deepEqual(shownAt(0, HOME, 1.19, stepZoom(rollBy(turnBy(homeView(), 45), [1, 1, 0], 100), 1)), { tilt: 0, turn: 45, scale: 1, roll: { axis: [0, 0, 1], angle: 0 } });
});

test('처음 보기(회귀): 학생 보기가 처음 값이면 모든 t에서 지금 식과 같다 — baseTilt × t, (−28 + baseTurn) × t, 1 + (zoom − 1) × t, 더 돌린 것 없음', () => {
  for (const base of BASES) {
    for (const auto of AUTOS) {
      for (let i = 0; i <= 200; i += 1) {
        const t = i / 200;
        const s = sceneAt(t, base, auto, homeView());
        assert.equal(s.tilt, base.tilt * t);
        assert.equal(s.turn, 0 + (SPIN + base.turn) * t);
        assert.equal(s.scale, 1 + (auto - 1) * t);
        assert.equal(s.roll.angle, 0);
        // 펼친 채 평면에서 돌린 것도 지금 식(spin + …)과 같다
        assert.equal(sceneAt(t, base, auto, turnBy(homeView(), 30)).turn, 30 + (SPIN + base.turn) * t);
        // 자세 행렬은 지금 식 rotateX(tilt) rotateZ(turn)과 같은 방향을 준다
        if (i % 20 === 0) {
          const pose = poseOf(s);
          for (const v of [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0.3, -0.4, 0.5]]) {
            const [a, b] = [turnVector(pose, v), viewDir(v, s.tilt, s.turn)];
            assert.ok(a.every((x, k) => near(x, b[k], 1e-12)));
          }
        }
      }
    }
  }
  assert.equal(SPIN, -28);
  assert.equal(TILT, 56);
  assert.ok(isHome(homeView()));
});

test('한계는 배율에만 있다(0.5~2배): 끌기·버튼·키·벌리기·휠을 3,000번 섞어도 회전은 찌그러지지 않고, 어떤 자세에서도 네 방향으로 더 돌 수 있다', () => {
  const rng = createRng('view-limits');
  const hit = { zoomMax: 0, zoomMin: 0 };
  let worst = 0;
  for (const base of BASES) {
    randomOps(rng, 3000, (view, i) => {
      // 쌓인 회전(사원수)의 길이가 1 그대로 — 누적 오차로 입체가 찌그러지지 않는다
      const length = Math.hypot(...view.roll);
      assert.ok(near(length, 1, 1e-12), `사원수 길이 ${length}`);
      assert.ok(view.roll[3] >= 0);
      assert.ok(Number.isFinite(view.spin));
      assert.ok(view.zoom >= ZOOM_MIN && view.zoom <= ZOOM_MAX, `배율 ${view.zoom}`);
      const lim = viewLimits(view);
      assert.deepEqual(Object.keys(lim), ['zoomMax', 'zoomMin', 'home']); // 회전 때문에 "더 못 감"은 없다
      assert.equal(lim.zoomMax, view.zoom >= 2 - 1e-6);
      assert.equal(lim.zoomMin, view.zoom <= 0.5 + 1e-6);
      assert.equal(lim.home, isHome(view));
      for (const key of Object.keys(hit)) if (lim[key]) hit[key] += 1;
      if (lim.zoomMax) assert.equal(stepZoom(view, 1).zoom, 2);
      if (lim.zoomMin) assert.equal(stepZoom(view, -1).zoom, 0.5);
      if (i % 10 !== 0) return;
      const pose = foldedPose(base, view);
      worst = Math.max(worst, distortion(pose));
      // 어떤 자세에서도 네 방향 버튼은 딱 한 단계만큼 더 돌린다(멈추는 곳이 없다)
      for (const dir of DIRS) {
        const step = angleBetween(foldedPose(base, stepView(view, dir)), pose);
        assert.ok(near(step, dir === 'left' || dir === 'right' ? TURN_BUTTON : TILT_STEP, 1e-6), `${dir} ${step}`);
      }
      // 접는 도중의 무대 값
      for (const t of [0, 0.01, 0.1, 0.25, 0.5, 1]) {
        const s = shownAt(t, base, 1.7, view);
        assert.ok(s.scale >= 0.5 - 1e-9 && s.scale <= 3.4 + 1e-9);
        assert.ok(s.roll.angle >= 0 && s.roll.angle <= 180 + 1e-9); // 같은 자세 가운데 덜 돌린 쪽으로 적는다
        assert.ok(near(Math.hypot(...s.roll.axis), 1, 1e-9));
        assert.ok(distortion(poseOf(s)) < 1e-9);
      }
    });
  }
  assert.ok(worst < 1e-9, `자세 행렬이 찌그러진 정도 ${worst}`);
  for (const [key, count] of Object.entries(hit)) assert.ok(count > 20, `${key} 한계에 닿은 횟수 ${count}`);
  // 이상한 입력은 보기를 바꾸지 않는다
  const view = rollBy({ spin: 10, roll: [0, 0, 0, 1], zoom: 1.3 }, [1, 2, 3], 40);
  assert.deepEqual(wheelView(view, NaN), view);
  assert.deepEqual(wheelView(view, 0), view);
  assert.deepEqual(pinchView(view, 1.3, 0, 100), view);
  assert.deepEqual(pinchView(view, 1.3, 100, 0), view);
  assert.equal(dragView(view, 0, 0), view);
  assert.equal(stepView(view, 'nowhere'), view);
});

test('한 단계: 위·아래 15°, 왼쪽·오른쪽 30°(키 15°)씩 화면 기준으로 끝없이 — 한 바퀴만큼 누르면 제자리. 배율은 0.5 · 0.64 · 0.8 · 1 · 1.25 · 1.6 · 2', () => {
  const walk = (start, step, n) => {
    const out = [];
    let view = start;
    for (let i = 0; i < n; i += 1) {
      view = step(view);
      out.push(view);
    }
    return out;
  };
  assert.deepEqual([TILT_STEP, TURN_BUTTON, TURN_KEY], [15, 30, 15]);
  for (const base of BASES) {
    const home = foldedPose(base, homeView());
    // 위쪽: 15°씩, 바로 위(0°)를 지나 뒤로 넘어가며 계속 돈다. 24번 = 360° → 제자리
    const ups = walk(homeView(), (v) => stepView(v, 'up'), 24);
    ups.forEach((v, i) => {
      const height = elevationOf(foldedPose(base, v));
      assert.ok(near(height, deg(Math.acos(Math.cos(rad(base.tilt - 15 * (i + 1))))), 1e-6), `위쪽 ${i + 1}번: ${height}`);
      assert.equal(isHome(v), i === 23);
    });
    assert.ok(samePose(foldedPose(base, ups[23]), home));
    assert.deepEqual(ups[23], homeView());
    // 아래쪽: 바로 아래(180°)에서 멈추지 않는다
    const downs = walk(homeView(), (v) => stepView(v, 'down'), 24);
    const heights = downs.map((v) => Math.round(elevationOf(foldedPose(base, v)) * 1000) / 1000);
    assert.equal(new Set(heights.slice(0, 23)).size >= 12, true);
    assert.ok(Math.max(...heights) > 165); // 아래쪽까지 간다
    assert.deepEqual(downs[23], homeView());
    assert.ok(angleBetween(foldedPose(base, downs[11]), home) > 179.999); // 12번 = 180°: 뒤집힌 자세
    // 왼쪽·오른쪽: 30° × 12 = 360°, 키 15° × 24
    for (const dir of ['left', 'right']) {
      const turns = walk(homeView(), (v) => stepView(v, dir), 12);
      turns.forEach((v, i) => assert.ok(near(angleBetween(foldedPose(base, v), home), Math.min(30 * (i + 1), 360 - 30 * (i + 1)), 1e-6)));
      assert.deepEqual(turns[11], homeView());
      assert.deepEqual(walk(homeView(), (v) => stepView(v, dir, TURN_KEY), 24)[23], homeView());
    }
    // 위쪽 한 번은 아래쪽 한 번으로, 오른쪽은 왼쪽으로 되돌아온다. 섞은 순서를 거꾸로 밟으면 제자리
    let v = homeView();
    for (const dir of ['right', 'up', 'up', 'left', 'down', 'right']) v = stepView(v, dir);
    for (const dir of ['left', 'up', 'right', 'down', 'down', 'left']) v = stepView(v, dir);
    assert.ok(isHome(v));
    // 순서가 다르면 자세가 다르다(화면 기준으로 차례로 굴린다)
    assert.ok(angleBetween(foldedPose(base, stepView(stepView(homeView(), 'right'), 'up')), foldedPose(base, stepView(stepView(homeView(), 'up'), 'right'))) > 1);
  }
  // 버튼은 배율·평면 돌림을 건드리지 않는다
  const moved = stepView({ spin: 33, roll: [0, 0, 0, 1], zoom: 1.6 }, 'down');
  assert.deepEqual([moved.spin, moved.zoom], [33, 1.6]);
  assert.deepEqual(rollOf(moved.roll), { axis: [1, 0, 0], angle: 15.000000000000002 });
  // 펼친 채 평면 돌림(답하기 전의 좌우 돌리기): 버튼 ±30°, 키 ±15°, 한계 없음
  assert.equal(turnBy(turnBy(homeView(), 30), 15).spin, 45);
  assert.equal(walk(homeView(), (x) => turnBy(x, 30), 13).at(-1).spin, 390);

  const zooms = (dir, n) => walk(homeView(), (x) => stepZoom(x, dir), n).map((x) => x.zoom);
  assert.deepEqual(zooms(1, 4), [1.25, 1.6, 2, 2]);
  assert.deepEqual(zooms(-1, 4), [0.8, 0.64, 0.5, 0.5]);
  assert.deepEqual(ZOOM_STEPS, [0.5, 0.64, 0.8, 1, 1.25, 1.6, 2]);
  // 벌리기·휠로 만든 사이 값에서는 가까운 다음 단계로
  assert.equal(stepZoom({ ...homeView(), zoom: 1.37 }, 1).zoom, 1.6);
  assert.equal(stepZoom({ ...homeView(), zoom: 1.37 }, -1).zoom, 1.25);
  assert.equal(stepZoom({ ...homeView(), zoom: 0.55 }, -1).zoom, 0.5);
  const zoomed = stepZoom(stepView(turnBy(homeView(), 12), 'up'), 1);
  assert.deepEqual([zoomed.spin, zoomed.zoom, zoomed.roll], [12, 1.25, stepView(homeView(), 'up').roll]);
});

test('끌기 값: 1px = 0.5°, 문턱 8px, 끈 방향과 직각인 화면 위의 축 둘레로. 벌리기는 손가락 사이 비율, 휠은 위로 굴리면 크게(Ctrl+휠·줄 단위 포함)', () => {
  assert.equal(DRAG_DEG, 0.5);
  assert.equal(DRAG_START, 8);
  const rolled = (dx, dy) => {
    const { axis, angle } = rollOf(dragView(homeView(), dx, dy).roll);
    return [...axis.map((v) => Math.round(v * 1e6) / 1e6 + 0), Math.round(angle * 1e6) / 1e6];
  };
  assert.deepEqual(rolled(100, 0), [0, 1, 0, 50]); // 오른쪽으로 100px: 세로축 둘레 50°
  assert.deepEqual(rolled(0, 40), [-1, 0, 0, 20]); // 아래로 40px: 가로축 둘레 20°
  assert.deepEqual(rolled(0, -40), [1, 0, 0, 20]);
  assert.deepEqual(rolled(30, 40), [-0.8, 0.6, 0, 25]); // 대각선: 끈 방향 (0.6, 0.8)과 직각인 축, 길이 50px × 0.5°
  assert.deepEqual(rolled(-30, -40), [0.8, -0.6, 0, 25]);
  // 한 방향으로 나눠 끌어도 한 번에 끈 것과 같다
  for (const [dx, dy] of [[100, 0], [0, -70], [36, 48], [-90, 20]]) {
    let view = homeView();
    for (let i = 0; i < 10; i += 1) view = dragView(view, dx / 10, dy / 10);
    assert.ok(samePose(foldedPose(HOME, view), foldedPose(HOME, dragView(homeView(), dx, dy)), 1e-12));
  }
  // 끌기는 배율·평면 돌림을, 휠·벌리기는 회전을 건드리지 않는다
  const dragged = dragView({ spin: 7, roll: [0, 0, 0, 1], zoom: 1.6 }, 30, 30);
  assert.deepEqual([dragged.spin, dragged.zoom], [7, 1.6]);
  // 벌리기: 40px → 160px = 4배 → 2배에서 멈춤, 오므리기 160 → 30 → 0.5배에서 멈춤, 사이 값도 된다
  assert.equal(pinchView(homeView(), 1, 40, 160).zoom, 2);
  assert.equal(pinchView(homeView(), 2, 160, 30).zoom, 0.5);
  assert.ok(near(pinchView(homeView(), 1, 100, 137).zoom, 1.37));
  assert.ok(near(pinchView({ ...dragged, zoom: 9 }, 1.25, 100, 120).zoom, 1.5));
  assert.deepEqual(pinchView(dragged, 1.25, 100, 120).roll, dragged.roll);
  // 휠
  const up = wheelView(homeView(), -100).zoom;
  const down = wheelView(homeView(), 100).zoom;
  assert.ok(up > 1.1 && up < 1.25, `${up}`);
  assert.ok(near(up * down, 1));
  assert.equal(wheelView(homeView(), -100000).zoom, 2);
  assert.equal(wheelView(homeView(), 100000).zoom, 0.5);
  assert.ok(wheelView(homeView(), -10, { ctrl: true }).zoom > wheelView(homeView(), -10).zoom); // 터치패드 벌리기는 값이 작게 온다
  assert.ok(near(wheelView(homeView(), -3, { lines: true }).zoom, wheelView(homeView(), -99).zoom));
  assert.deepEqual(wheelView(dragged, -100), { ...dragged, zoom: 1.6 * up });
});

test('방향: 어떤 자세에서도(뒤집힌 자세 포함) 끄는 방향 = 지금 보이는 앞면이 화면에서 움직이는 방향. 버튼은 누른 쪽 면이 앞으로 온다', () => {
  const rng = createRng('view-direction');
  const DRAGS = [[20, 0], [-20, 0], [0, 20], [0, -20], [12, 16], [-30, 40], [48, -14], [-9, -40]];
  const check = (base, view, label) => {
    const pose = foldedPose(base, view);
    const inverse = transpose(pose);
    const front = turnVector(inverse, [0, 0, 1]); // 지금 화면 가운데에서 보는 사람을 똑바로 향한 방향(모델 좌표)
    for (const [dx, dy] of DRAGS) {
      const after = turnVector(foldedPose(base, dragView(view, dx, dy)), front);
      const length = Math.hypot(dx, dy);
      // 앞면 가운데가 끈 방향으로 딱 그만큼(sin(끈 길이 × 0.5°)) 움직인다 — 옆으로 새지 않는다
      assert.ok(near((after[0] * dx + after[1] * dy) / length, Math.sin(rad(length * DRAG_DEG)), 1e-9), `${label} 끌기 (${dx}, ${dy})`);
      assert.ok(near(after[0] * dy - after[1] * dx, 0, 1e-9), `${label} 끌기 (${dx}, ${dy}) 옆으로 샘`);
    }
    // 버튼·방향키: 지금 화면의 오른쪽·왼쪽·위·아래를 향한 면이 보는 사람 쪽으로 온다
    const toward = { right: [1, 0, 0], left: [-1, 0, 0], up: [0, -1, 0], down: [0, 1, 0] };
    for (const dir of DIRS) {
      const side = turnVector(inverse, toward[dir]);
      const after = turnVector(foldedPose(base, stepView(view, dir)), side);
      assert.ok(near(after[2], Math.sin(rad(dir === 'left' || dir === 'right' ? 30 : 15)), 1e-9), `${label} 버튼 ${dir}`);
    }
  };
  let poses = 0;
  for (const base of BASES) {
    check(base, homeView(), '처음 보기');
    // 뒤집힌 자세: 위쪽으로 12번(180°), 아래쪽으로 9번(135°), 옆으로 눕힌 자세
    for (const [dir, n] of [['up', 12], ['down', 9], ['up', 6], ['right', 6]]) {
      let view = homeView();
      for (let i = 0; i < n; i += 1) view = stepView(view, dir);
      check(base, view, `${dir} × ${n}`);
    }
    check(base, rollBy(homeView(), [0, 0, 1], 90), '화면에서 90° 누운 자세');
    randomOps(rng, 400, (view, i) => {
      if (i % 4 !== 0) return;
      check(base, view, `무작위 ${i}`);
      poses += 1;
    });
  }
  assert.equal(poses, BASES.length * 100);
  // 뒤집힌 자세(입체의 위쪽이 화면 아래를 향함)에서 오른쪽으로 끌면: 처음 방식(가로 돌림 + 기울기)으로는 앞면이 왼쪽으로 갔을 자세
  const flipped = rollBy(homeView(), [1, 0, 0], 180);
  assert.ok(elevationOf(foldedPose(HOME, flipped)) > 90);
  const frontOf = (view) => turnVector(transpose(foldedPose(HOME, view)), [0, 0, 1]);
  assert.ok(turnVector(foldedPose(HOME, dragView(flipped, 40, 0)), frontOf(flipped))[0] > 0.3);
});

test('끝없이 돈다: 한 방향으로 750° 끌어도 계속 돌고 360°마다 같은 모습, 180°에서는 뒤쪽이 보인다(가로·세로·대각선)', () => {
  for (const base of BASES) {
    for (const [dx, dy] of [[10, 0], [-10, 0], [0, 10], [0, -10], [6, 8], [-8, 6]]) {
      const start = foldedPose(base, homeView());
      const poses = [];
      let view = homeView();
      for (let i = 1; i <= 150; i += 1) {
        view = dragView(view, dx, dy); // 10px = 5°
        const pose = foldedPose(base, view);
        // 멈추는 곳 없이 늘 5°씩 더 돈다
        assert.ok(near(angleBetween(pose, poses.at(-1) ?? start), 5, 1e-6), `${i}번째 끌기`);
        poses.push(pose);
      }
      assert.ok(samePose(poses[71], start, 1e-9)); // 360°
      assert.ok(samePose(poses[143], start, 1e-9)); // 720°
      assert.ok(samePose(poses[144], poses[0], 1e-9)); // 725° = 5°
      assert.ok(near(angleBetween(poses[35], start), 180, 1e-4)); // 180°: 처음에 앞을 보던 쪽이 뒤로 (acos는 180° 근처에서 무뎌 여유를 둔다)
      const front = turnVector(transpose(start), [0, 0, 1]);
      assert.ok(near(turnVector(poses[35], front)[2], -1, 1e-9));
      assert.ok(near(angleBetween(poses[17], start), 90, 1e-6));
      assert.ok(near(angleBetween(poses[53], start), 90, 1e-6)); // 270°는 반대쪽으로 90°
      assert.ok(!samePose(poses[17], poses[53], 1e-3));
    }
  }
  // 한 바퀴 돌아 제자리면 보기 값도 딱 처음 값이다([처음 보기로]가 꺼지고, 무대 변환이 처음과 같은 글자)
  let view = homeView();
  for (let i = 0; i < 72; i += 1) view = dragView(view, 0, -10);
  assert.deepEqual(view, homeView());
  // 길게 한 번에 끌어도(4000px = 2000°) 같은 자리: 2000° = 200°
  assert.ok(samePose(foldedPose(HOME, dragView(homeView(), 4000, 0)), foldedPose(HOME, dragView(homeView(), 400, 0)), 1e-9));
});

test('잇기(17-18): 조금이라도 접히면(t > 0) 학생 보기가 그대로 들어간다 — 접는 정도를 움직여도 더 돌린 것·배율은 그대로이고 자세는 끊기지 않는다. 다 접으면 내가 보던 방향·크기', () => {
  const rng = createRng('view-blend');
  for (const base of BASES) {
    for (let n = 0; n < 30; n += 1) {
      const view = randomOps(rng, 12);
      const auto = AUTOS[n % AUTOS.length];
      const full = rollOf(view.roll);
      let prev = shownAt(0.001, base, auto, view);
      for (let i = 1; i <= 1000; i += 1) {
        const t = i / 1000;
        const s = shownAt(t, base, auto, view);
        // 더 돌린 것: 접는 정도에 따라 줄지 않는다(1%만 접혀도 전부)
        assert.deepEqual(s.roll, full);
        // 배율: 자동 맞춤(접는 정도에 비례) × 학생 배율 전부
        assert.ok(near(s.scale, (1 + (auto - 1) * t) * view.zoom), `배율 ${s.scale} (t = ${t})`);
        // 접는 정도 한 칸(1/1000)에 자세는 처음 보기가 기울고 도는 만큼(기울기 56° + 돌림 302° 이하 → 0.4° 안쪽)만 바뀐다 — 튀지 않는다
        const moved = angleBetween(poseOf(s), poseOf(prev));
        assert.ok(moved < 0.4, `자세가 ${moved}° 튐 (t = ${t})`);
        assert.ok(Math.abs(s.scale - prev.scale) < 0.002 * view.zoom);
        prev = s;
      }
      // 다 접으면 내가 보던 방향·크기 그대로: 더 돌린 것 × 처음 보기(기울기 · 돌림 + 평면에서 돌린 것)
      const end = shownAt(1, base, auto, view);
      assert.ok(near(end.scale, auto * view.zoom));
      const expected = multiply3(rotationMatrix(full.axis, full.angle), multiply3(rotationMatrix([1, 0, 0], base.tilt), rotationMatrix([0, 0, 1], view.spin + SPIN + base.turn)));
      assert.ok(samePose(poseOf(end), expected, 1e-12));
      assert.ok(samePose(foldedPose(base, view), expected, 1e-12));
      // 접는 도중의 자세 = 더 돌린 것 × (그 접는 정도의 처음 보기): 접는 정도와 더 돌린 것이 서로 섞이지 않는다
      for (const t of FOLDS) {
        const mid = multiply3(rotationMatrix(full.axis, full.angle), multiply3(rotationMatrix([1, 0, 0], base.tilt * t), rotationMatrix([0, 0, 1], view.spin + (SPIN + base.turn) * t)));
        assert.ok(samePose(poseOf(shownAt(t, base, auto, view)), mid, 1e-12));
      }
    }
  }
});

test('접는 도중에도 같은 정도로 돈다(17-18): 접는 정도 1 · 5 · 10 · 20 · 24 · 25 · 30 · 60 · 100%에서 한 방향으로 750° 끌어도 걸음마다 같은 각도(1px = 0.5°)·튀는 걸음 0, 360°마다 같은 모습, 여덟 방향', () => {
  const EIGHT = [[10, 0], [-10, 0], [0, 10], [0, -10], [6, 8], [-6, 8], [8, -6], [-8, -6]];
  let steps = 0;
  for (const t of FOLDS) {
    for (const base of [HOME, BASES[3], BASES[5]]) {
      for (const [dx, dy] of EIGHT) {
        const start = poseOf(shownAt(t, base, 1.19, homeView()));
        const front = turnVector(transpose(start), [0, 0, 1]);
        const poses = [];
        let view = homeView();
        let far = 0;
        for (let i = 1; i <= 150; i += 1) {
          view = dragView(view, dx, dy); // 10px = 5°
          const pose = poseOf(shownAt(t, base, 1.19, view));
          // 걸음마다 딱 5°: 덜 돌지도(25% 미만에서 줄지 않는다), 튀지도(180°를 넘는 순간 뒤집히지 않는다) 않는다
          const step = angleBetween(pose, poses.at(-1) ?? start);
          assert.ok(near(step, 5, 1e-6), `접는 정도 ${t} 끌기 (${dx}, ${dy}) ${i}번째 걸음 ${step}°`);
          far = Math.max(far, angleBetween(pose, start));
          poses.push(pose);
          steps += 1;
        }
        assert.ok(far > 179.9, `처음에서 가장 멀리 ${far}° — 뒤쪽까지 간다`);
        assert.ok(samePose(poses[71], start, 1e-9)); // 360°
        assert.ok(samePose(poses[143], start, 1e-9)); // 720°
        assert.ok(samePose(poses[144], poses[0], 1e-9)); // 725° = 5°
        assert.ok(near(turnVector(poses[35], front)[2], -1, 1e-9)); // 180°: 처음에 앞을 보던 쪽이 뒤로
        // 뒤집힌 자세(180°)에서도 끄는 방향 = 지금 보이는 앞면이 움직이는 방향
        let flipped = homeView();
        for (let i = 0; i < 36; i += 1) flipped = dragView(flipped, 0, -10);
        const from = poseOf(shownAt(t, base, 1.19, flipped));
        const facing = turnVector(transpose(from), [0, 0, 1]);
        const after = turnVector(poseOf(shownAt(t, base, 1.19, dragView(flipped, dx * 2, dy * 2))), facing);
        assert.ok(near((after[0] * dx + after[1] * dy) / 10, Math.sin(rad(10)), 1e-9), `접는 정도 ${t} 뒤집힌 자세에서 (${dx}, ${dy})`);
        assert.ok(near(after[0] * dy - after[1] * dx, 0, 1e-9));
      }
    }
  }
  assert.equal(steps, FOLDS.length * 3 * 8 * 150);
});

test('접는 도중 버튼·방향키 한 번 = 한 단계(17-18): 어느 접는 정도에서나 좌우 30°(키 15°)·위아래 15°, 좌우 12번·위아래 24번·방향키 24번이면 제자리. t > 0이면 배율 단계도 그대로(0.5~2배)', () => {
  for (const t of FOLDS) {
    for (const base of BASES) {
      const start = poseOf(shownAt(t, base, 1.19, homeView()));
      const walk = (dir, degrees, n) => {
        let view = homeView();
        let prev = start;
        for (let i = 1; i <= n; i += 1) {
          view = stepView(view, dir, degrees);
          const pose = poseOf(shownAt(t, base, 1.19, view));
          assert.ok(near(angleBetween(pose, prev), degrees, 1e-6), `접는 정도 ${t} ${dir} ${i}번째: ${angleBetween(pose, prev)}°`);
          prev = pose;
        }
        assert.ok(samePose(prev, start, 1e-9), `접는 정도 ${t} ${dir} × ${n}: 제자리`);
        assert.ok(isHome(view));
      };
      for (const dir of ['left', 'right']) {
        walk(dir, TURN_BUTTON, 12);
        walk(dir, TURN_KEY, 24);
      }
      for (const dir of ['up', 'down']) walk(dir, TILT_STEP, 24);
      // 뒤집힌 자세·아무 자세에서 눌러도 한 단계
      const rng = createRng(`view-fold-step:${t}`);
      randomOps(rng, 40, (view) => {
        const pose = poseOf(shownAt(t, base, 1.19, view));
        for (const dir of DIRS) {
          const step = angleBetween(poseOf(shownAt(t, base, 1.19, stepView(view, dir))), pose);
          assert.ok(near(step, dir === 'left' || dir === 'right' ? TURN_BUTTON : TILT_STEP, 1e-6), `접는 정도 ${t} ${dir} ${step}`);
        }
      });
    }
    // 배율: 접는 정도에 따라 줄지 않는다 — 자동 맞춤 × 학생 배율 전부. 단계마다 같은 비율, 2배·0.5배에서 멈춤
    for (const auto of AUTOS) {
      const scaleAt = (view) => shownAt(t, HOME, auto, view).scale / shownAt(t, HOME, auto, homeView()).scale;
      let view = homeView();
      const up = [];
      for (let i = 0; i < 4; i += 1) {
        view = stepZoom(view, 1);
        up.push(Math.round(scaleAt(view) * 1e6) / 1e6);
      }
      assert.deepEqual(up, [1.25, 1.6, 2, 2], `접는 정도 ${t}`);
      const down = [];
      for (let i = 0; i < 7; i += 1) {
        view = stepZoom(view, -1);
        down.push(Math.round(scaleAt(view) * 1e6) / 1e6);
      }
      assert.deepEqual(down, [1.6, 1.25, 1, 0.8, 0.64, 0.5, 0.5], `접는 정도 ${t}`);
      assert.ok(near(scaleAt(pinchView(homeView(), 1, 100, 137)), 1.37));
      assert.ok(near(shownAt(t, HOME, auto, { ...homeView(), zoom: 2 }).scale, (1 + (auto - 1) * t) * 2));
    }
  }
});

test('처음 모습 ↔ 내 자세를 잇는 움직임(17-18): 0.2초 동안 프레임마다 같은 각도로 다가가 딱 닿는다. 잇는 도중에 더 돌려도(180°를 넘어도) 한 프레임에 남은 거리의 몫보다 더 가지 않고 끝 상태가 맞다', () => {
  const rng = createRng('view-mix');
  const HOME_LOOK = { roll: [0, 0, 0, 1], zoom: 1 };
  assert.equal(MIX_MS, 200);
  // 몫: 지난 시간에 비례. 남은 거리 가운데 이번에 갈 비율이라 끝(p = 1)에서는 1
  assert.equal(mixStep(0, 0.25), 0.25);
  assert.ok(near(mixStep(0.25, 0.5), 1 / 3));
  assert.ok(near(mixStep(0.5, 0.75), 0.5));
  assert.equal(mixStep(0.75, 1), 1);
  assert.equal(mixStep(0.2, 1.7), 1);
  assert.equal(mixStep(0.4, 0.4), 0);
  assert.equal(mixStep(0.6, 0.5), 0); // 시간이 거꾸로 가도 뒤로 가지 않는다
  // 같은 모습인지
  assert.ok(sameLook(HOME_LOOK, lookFor(0.5, true, homeView())));
  assert.ok(sameLook({ roll: [0, 0, 0, 1], zoom: 1 }, { roll: [0, 0, 0, -1], zoom: 1 })); // 같은 자세를 나타내는 두 사원수
  assert.ok(!sameLook(HOME_LOOK, { roll: [0, 0, 0, 1], zoom: 1.25 }));
  assert.ok(!sameLook(HOME_LOOK, lookFor(0.5, true, stepView(homeView(), 'up'))));
  assert.ok(near(rollGap(homeView().roll, stepView(homeView(), 'right').roll), 30, 1e-9));
  assert.ok(near(rollGap(homeView().roll, rollBy(homeView(), [1, 0, 0], 180).roll), 180, 1e-6));
  // 끝 값
  const far = lookFor(1, true, stepZoom(rollBy(homeView(), [1, 2, 0], 170), 1));
  assert.deepEqual(lookToward(HOME_LOOK, far, 1), far);
  assert.deepEqual(lookToward(HOME_LOOK, far, 0), HOME_LOOK);
  assert.deepEqual(lookToward(HOME_LOOK, far, 7), far);
  assert.deepEqual(lookToward(far, HOME_LOOK, 1), HOME_LOOK);
  assert.notEqual(lookToward(HOME_LOOK, far, 1).roll, far.roll); // 복사본을 준다

  /** 프레임 시간(ms)들로 잇는 움직임을 돌린다. goalAt(i): 그 프레임의 목표. 프레임마다 움직인 각도·배율 비를 돌려준다 */
  const run = (from, goalAt, frames) => {
    let shown = from;
    let at = 0;
    let elapsed = 0;
    const moved = [];
    for (const [i, dt] of frames.entries()) {
      elapsed += dt;
      const p = Math.min(1, elapsed / MIX_MS);
      const goal = goalAt(i);
      const before = shown;
      const f = mixStep(at, p);
      shown = lookToward(shown, goal, f);
      at = p;
      const length = Math.hypot(...shown.roll);
      assert.ok(near(length, 1, 1e-12), `사원수 길이 ${length}`);
      moved.push({ deg: rollGap(before.roll, shown.roll), left: rollGap(before.roll, goal.roll), f, zoom: shown.zoom / before.zoom, done: p >= 1 });
      if (p >= 1) break;
    }
    return { shown, moved };
  };
  const FRAMES = new Array(11).fill(20); // 20ms 프레임: 10프레임 = 200ms (+1)
  let runs = 0;
  for (let n = 0; n < 300; n += 1) {
    const mine = lookFor(0.3, true, randomOps(rng, 15));
    const total = rollGap(HOME_LOOK.roll, mine.roll);
    for (const [from, to] of [[HOME_LOOK, mine], [mine, HOME_LOOK]]) {
      // 1) 목표가 그대로: 프레임마다 같은 각도(처음 거리 ÷ 10), 배율은 같은 비율로, 10프레임째(200ms)에 딱 목표
      const { shown, moved } = run(from, () => to, FRAMES);
      assert.deepEqual(shown, to);
      assert.equal(moved.length, 10);
      for (const m of moved) {
        assert.ok(near(m.deg, total / 10, 1e-6), `프레임마다 ${m.deg}° (처음 거리 ${total}°)`);
        assert.ok(m.deg <= 18 + 1e-9); // 가장 먼 자세(180°)도 한 프레임(20ms)에 18° — 60fps면 15°
        assert.ok(near(m.zoom, (to.zoom / from.zoom) ** (1 / 10), 1e-9));
      }
      // 2) 프레임 간격이 고르지 않아도(느린 기기) 간 거리는 지난 시간에 비례하고 끝에서 딱 닿는다
      const uneven = [];
      let sum = 0;
      while (sum < MIX_MS) {
        const dt = 4 + rng.next() * 60;
        uneven.push(dt);
        sum += dt;
      }
      const slow = run(from, () => to, uneven);
      assert.deepEqual(slow.shown, to);
      slow.moved.forEach((m, i) => {
        if (!m.done) assert.ok(near(m.deg, (total * uneven[i]) / MIX_MS, 1e-6));
      });
      assert.ok(near(slow.moved.reduce((a, m) => a + m.deg, 0), total, 1e-6));
      runs += 1;
    }
    // 3) 잇는 도중에 학생이 계속 돌린다(프레임마다 버튼 한 번·긴 끌기 — 목표가 처음 모습에서 180° 넘게 지나가기도 한다):
    //    한 프레임에 가는 각도는 그때 남은 거리의 몫을 넘지 않고(튀지 않는다), 끝나면 그때의 목표와 같다
    let view = randomOps(rng, 6);
    const goals = FRAMES.map(() => {
      const pick = rng.int(0, 3);
      view = pick === 0 ? stepView(view, DIRS[rng.int(0, 3)]) : pick === 1 ? dragView(view, (rng.next() - 0.5) * 200, (rng.next() - 0.5) * 200) : pick === 2 ? stepZoom(view, rng.next() < 0.5 ? -1 : 1) : view;
      return lookFor(0.5, true, view);
    });
    const chased = run(HOME_LOOK, (i) => goals[i], FRAMES);
    assert.deepEqual(chased.shown, goals[9]);
    for (const m of chased.moved) assert.ok(m.deg <= m.left * m.f + 1e-6, `한 프레임에 ${m.deg}° (남은 거리 ${m.left}° 가운데 ${m.f})`);
    // 4) 목표가 지금 모습의 정반대(180°)를 지나가도 그 프레임에 튀지 않는다: 반대쪽으로 넘어간 직후에도 남은 거리의 몫만 간다
    const axis = normalize([rng.next() - 0.5, rng.next() - 0.5, rng.next() - 0.5]);
    const before = lookToward(HOME_LOOK, { roll: rollBy(homeView(), axis, 179).roll, zoom: 1 }, 0.5); // 89.5° 와 있다
    const after = lookToward(before, { roll: rollBy(homeView(), axis, -179).roll, zoom: 1 }, 1 / 6); // 목표가 181°(= −179°)로 넘어갔다
    assert.ok(near(rollGap(before.roll, HOME_LOOK.roll), 89.5, 1e-6));
    assert.ok(rollGap(before.roll, after.roll) <= 180 / 6 + 1e-6, `정반대를 지난 프레임에 ${rollGap(before.roll, after.roll)}°`);
  }
  assert.equal(runs, 600);
  // 처음 모습 ↔ 내 자세의 무대 값: 잇는 동안에도 찌그러지지 않은 회전이고, 접는 정도 0에서는 처음 모습에서 출발해 처음 모습으로 끝난다
  const mine = lookFor(1, true, stepZoom(rollBy(homeView(), [3, -1, 2], 150), 1));
  let shown = mine;
  for (let i = 1; i <= 12; i += 1) {
    shown = lookToward(shown, HOME_LOOK, mixStep((i - 1) / 12, i / 12));
    const scene = sceneAt(0, HOME, 1.19, { spin: 0, ...shown });
    assert.ok(distortion(poseOf(scene)) < 1e-9);
    assert.ok(near(scene.roll.angle, 150 * (1 - i / 12), 1e-6));
    assert.ok(near(scene.scale, 1.25 ** (1 - i / 12), 1e-9));
  }
  assert.deepEqual(sceneAt(0, HOME, 1.19, { spin: 0, ...shown }), { tilt: 0, turn: 0, scale: 1, roll: { axis: [0, 0, 1], angle: 0 } });
});

test('빛: 밝기 값 0~0.34, 빛을 향한 면이 가장 밝다. 처음 보기의 값은 지금과 같고, 어느 자세에서도 조금 돌리면 조금만 바뀐다(튀지 않는다)', () => {
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
  const flatPose = (tilt, turn) => poseOf({ tilt, turn });
  for (let i = 0; i < 2000; i += 1) {
    const tilt = rng.next() * 180;
    const turn = (rng.next() - 0.5) * 720;
    for (const n of NORMALS) {
      const s = shadeOf(n, flatPose(tilt, turn));
      assert.ok(s >= 0 && s <= 0.34 + 1e-12, `${s}`);
      assert.ok(near(s, oldShade(n, tilt, turn), 1e-12));
      assert.deepEqual(viewDir(n, tilt, turn), oldDir(n, tilt, turn));
    }
  }
  // 처음 보기(기울기 56°, 돌림 −28° + 0·90·180·270)에서 접는 도중·다 접은 뒤의 값이 지금 식과 같다
  for (const base of BASES) {
    for (const t of [0, 0.3, 0.5, 1]) {
      const pose = poseOf(sceneAt(t, base, 1.19, homeView()));
      for (const n of NORMALS) assert.equal(shadeOf(n, pose).toFixed(3), oldShade(n, base.tilt * t, (SPIN + base.turn) * t).toFixed(3));
    }
  }
  // 펼친 전개도(위에서 봄)의 면은 모두 같은 밝기 — 문항과 무관
  assert.equal(shadeOf([0, 0, 1], flatPose(0, 0)).toFixed(3), '0.063');
  assert.equal(shadeOf([0, 0, 1], flatPose(0, 45)).toFixed(3), '0.063');
  // 처음 보기의 세 면: 윗면이 가장 밝고, 앞(+y)·왼쪽(−x) 면은 빛을 덜 받는다
  const [top, front, left] = [[0, 0, 1], [0, 1, 0], [-1, 0, 0]].map((n) => shadeOf(n, flatPose(TILT, SPIN)));
  assert.ok(top < left && left < front, `${top} ${left} ${front}`);
  // 어느 자세에서나: 값은 범위 안, 빛(화면에 고정)을 똑바로 향한 면이 가장 밝고(0), 1° 더 돌리면 밝기는 1°만큼만 바뀐다
  let poses = 0;
  for (const base of BASES) {
    randomOps(rng, 300, (view, i) => {
      if (i % 3 !== 0) return;
      const pose = foldedPose(base, view);
      const toLight = turnVector(transpose(pose), LIGHT);
      assert.ok(shadeOf(toLight, pose) < 1e-9);
      for (const n of NORMALS) {
        const s = shadeOf(n, pose);
        assert.ok(s >= -1e-12 && s <= 0.34 + 1e-12);
        for (const [dx, dy] of [[2, 0], [0, 2], [1.4, -1.4]]) {
          const next = shadeOf(n, foldedPose(base, dragView(view, dx, dy))); // 2px = 1°
          assert.ok(Math.abs(next - s) <= 0.34 * rad(1) * 1.001, `밝기가 튐 ${s} → ${next}`);
        }
      }
      poses += 1;
    });
  }
  assert.equal(poses, BASES.length * 100);
  // 아래에서 본 바닥 면(법선 −z): 바로 아래(180° 굴림)에서는 보는 사람을 똑바로 향해 윗면을 위에서 볼 때와 같은 밝기,
  // 비스듬히 아래(135°)에서는 화면 아래쪽을 향해 빛(왼쪽 위 앞)을 덜 받는다
  assert.equal(shadeOf([0, 0, -1], flatPose(180, SPIN)).toFixed(3), '0.063');
  const lightUnit = Math.hypot(0.45, 0.55, 1);
  const expected = 0.34 * (1 - (Math.SQRT1_2 * -0.55 + Math.SQRT1_2 * 1) / lightUnit);
  assert.ok(near(shadeOf([0, 0, -1], flatPose(135, SPIN)), expected, 1e-12));
  // 버튼으로 간 자세도 같다: 처음 보기(56°)에서 아래쪽으로 79° 더 = 135°
  assert.ok(near(shadeOf([0, 0, -1], foldedPose(HOME, rollBy(homeView(), [1, 0, 0], 79))), expected, 1e-12));
  // 보이지 않는 쪽(빛 반대쪽)은 가장 어둡다
  assert.equal(shadeOf([0, 0, -1], flatPose(0, 0)), 0.34);
});

// ── 뒷면(종이 안쪽) 판정과 글자 ───────────────────
const STAGE_H = 400;
const EYE = eyeOf(STAGE_H);
/** CSS perspective와 같은 원근 투영: 무대 가운데 기준 px 좌표(모델 방향) → 화면 [x, y] */
function project(point, pose) {
  const q = turnVector(pose, point);
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
function textAxes(face, pose, back, px) {
  const th = rad(uprightTurn(face.right, face.down, pose));
  const mix = (a, b) => [0, 1, 2].map((k) => a * face.right[k] + b * face.down[k]);
  const down3 = mix(-Math.sin(th), Math.cos(th)); // rotate(θ)(0, 1) — 좌우로 뒤집어도 그대로
  const right3 = back ? mix(-Math.cos(th), -Math.sin(th)) : mix(Math.cos(th), Math.sin(th)); // rotate(θ) · scaleX(−1)(1, 0)
  const at = (dir) => project(face.mid.map((v, k) => v + 0.01 * px * dir[k]), pose);
  const origin = project(face.mid, pose);
  const from = (p) => [p[0] - origin[0], p[1] - origin[1]];
  return { right3, down3, right: from(at(right3)), down: from(at(down3)) };
}
/** 무작위 자세: 처음 보기에서 아무 방향으로 여러 번 굴린 것(뒤집힌 자세·누운 자세 포함) */
function randomPose(rng) {
  let view = turnBy(homeView(), (rng.next() - 0.5) * 360);
  for (let i = 0; i < 4; i += 1) view = dragView(view, (rng.next() - 0.5) * 1400, (rng.next() - 0.5) * 1400);
  if (rng.next() < 0.3) view = rollBy(view, [0, 0, 1], rng.next() * 360);
  return foldedPose(BASES[rng.int(0, BASES.length - 1)], view);
}

test('뒷면 판정(원근): 닫힌 정육면체는 무작위 자세 2,000개에서 눈 쪽 면만 앞면(1~3개, 마주 보는 두 면이 함께 앞면인 일은 없다)', () => {
  const rng = createRng('view-back');
  const counts = { 1: 0, 2: 0, 3: 0 };
  let flippedPoses = 0;
  for (let i = 0; i < 2000; i += 1) {
    const net = fromCells(transformCells(CUBE_NETS[i % CUBE_NETS.length].cells, i % 8));
    const px = 60 + rng.next() * 260; // 칸 한 변(px) × 배율
    const pose = randomPose(rng);
    if (elevationOf(pose) > 90) flippedPoses += 1;
    const faces = sceneFaces(net, px);
    const eyeDistance = (f) => {
      const q = turnVector(pose, f.mid);
      return Math.hypot(q[0] - EYE[0], q[1] - EYE[1], q[2] - EYE[2]);
    };
    const front = [];
    for (const f of faces) {
      const back = isBackFacing(f.normal, f.mid, pose, EYE);
      // 독립 확인: 꼭짓점을 원근으로 화면에 옮겨 도는 방향을 본다(앞면은 펼친 종이와 같은 방향)
      const area = winding(f.corners.map((p) => project(p, pose)));
      if (Math.abs(area) > 1e-6 * px * px) assert.equal(back, area < 0, `자세 ${i} ${f.id}: 넓이 ${area}`);
      if (!back) front.push(f);
    }
    assert.ok(front.length >= 1 && front.length <= 3, `앞면 ${front.length}개`);
    counts[front.length] += 1;
    for (const f of front) {
      const opposite = faces.find((g) => dot(g.normal, f.normal) < -0.99);
      assert.ok(isBackFacing(opposite.normal, opposite.mid, pose, EYE), '마주 보는 면은 뒷면');
      assert.ok(eyeDistance(f) < eyeDistance(opposite), '앞면은 마주 보는 면보다 눈에 가깝다');
    }
  }
  assert.ok(counts[3] > 1000, `세 면이 보이는 자세 ${counts[3]}개`);
  assert.ok(flippedPoses > 600, `아래쪽에서 보는(뒤집힌) 자세 ${flippedPoses}개`);
  // 펼친 전개도(위에서 봄)는 모든 면이 앞면 — 답하기 전에는 뒤집히는 글자가 없다
  for (const n of CUBE_NETS) {
    const net = fromCells(n.cells);
    const flat = foldNet(net, 0);
    for (const f of flat.faces) {
      for (const turn of [0, 15, 90, 200]) assert.equal(isBackFacing(f.normal, [(f.center[0] - 2) * 90, (f.center[1] - 2) * 90, 0], poseOf({ tilt: 0, turn }), EYE), false);
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
    const facing = poseOf({ tilt: 90, turn });
    assert.ok(turnVector(facing, hole.normal)[2] > 0.999);
    assert.equal(isBackFacing(opposite.normal, opposite.mid, facing, EYE), true);
    // 구멍 둘레의 네 면도 안쪽이 보인다(눈이 상자 너비 안에 있다)
    for (const f of faces) assert.equal(isBackFacing(f.normal, f.mid, facing, EYE), true, `${n.name} ${f.id}`);
    // 반대쪽에서 보면 맞은편 면은 앞면(바깥): 세로축 둘레로 반 바퀴, 가로축 둘레로 반 바퀴(뒤집어서) 어느 쪽으로 가도
    assert.equal(isBackFacing(opposite.normal, opposite.mid, poseOf({ tilt: 90, turn: turn + 180 }), EYE), false);
    assert.equal(isBackFacing(opposite.normal, opposite.mid, multiply3(rotationMatrix([1, 0, 0], 180), facing), EYE), false);
    assert.equal(isBackFacing(opposite.normal, opposite.mid, multiply3(rotationMatrix([0, 1, 0], 180), facing), EYE), false);
    boxes += 1;
  }
  assert.ok(boxes >= 3);
  let scenes = 0;
  for (const n of INVALID_HEXOMINOES.filter((x) => x.shape === 'block')) {
    const { net, turn, tilt } = displayNet(fromCells(n.cells));
    const faces = sceneFaces(net, 100, stuckTOf(net));
    const base = { tilt, turn };
    // 처음 보기에서는 모두 앞면, 뒤집으면(위쪽으로든 옆으로든 반 바퀴) 모두 뒷면
    for (const f of faces) {
      assert.equal(isBackFacing(f.normal, f.mid, foldedPose(base, homeView()), EYE), false, `${n.name} ${f.id} 처음 보기`);
      assert.equal(isBackFacing(f.normal, f.mid, poseOf({ tilt: 180, turn: SPIN + turn }), EYE), true, `${n.name} ${f.id} 아래에서`);
      assert.equal(isBackFacing(f.normal, f.mid, foldedPose(base, rollBy(homeView(), [0, 1, 0], 180)), EYE), true, `${n.name} ${f.id} 옆으로 뒤집어서`);
    }
    scenes += 1;
  }
  assert.equal(scenes, 8);
});

test('글자 바로 세우기: 무작위 자세 4,000개에서 돌리고 뒤집은 뒤 좌우가 거울상이 아니고(앞면·뒷면 모두), 글자의 아래가 화면 아래를 향한다(면 위에서 ±45° 안)', () => {
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
    const pose = randomPose(rng);
    for (const f of sceneFaces(net, px, tOf)) {
      const back = isBackFacing(f.normal, f.mid, pose, EYE);
      assert.ok([0, 90, 180, 270].includes(uprightTurn(f.right, f.down, pose)));
      const facing = Math.abs(turnVector(pose, f.normal)[2]); // 1이면 똑바로 마주 봄, 0이면 옆에서 봐서 선으로 보임
      if (facing < 0.05) continue;
      const { right, down, down3 } = textAxes(f, pose, back, px);
      // 거울상이 아니다: 화면에서 글자의 오른쪽 → 아래가 시계 방향(보통 글자와 같은 방향)
      assert.ok(right[0] * down[1] - right[1] * down[0] > 0, `자세 ${i} ${f.id} ${back ? '뒷면' : '앞면'}: 거울상`);
      seen[back ? 'back' : 'front'] += 1;
      // 면 위에서 재면: 글자의 '아래'와 "화면 아래를 면 위로 내린 방향" 사이가 45° 안 (90° 단위로 고를 수 있는 가장 좋은 것)
      const downOnScreen = turnVector(pose, down3); // 원근 없이 화면으로
      assert.ok(downOnScreen[1] > 0, `자세 ${i} ${f.id}: 글자가 거꾸로`);
      const n = turnVector(pose, f.normal);
      const onFace = normalize([0 - n[1] * n[0], 1 - n[1] * n[1], 0 - n[1] * n[2]]); // 화면 아래 (0, 1, 0)에서 법선 성분을 뺀 것
      const inPlane = (Math.acos(Math.max(-1, Math.min(1, dot(normalize(downOnScreen), onFace)))) * 180) / Math.PI;
      assert.ok(inPlane <= 45 + 1e-6, `자세 ${i} ${f.id}: 면 위에서 ${inPlane.toFixed(1)}°`);
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
  const top = poseOf({ tilt: 0, turn: 0 });
  for (let angle = 0; angle < 360; angle += 1) {
    const down = [Math.cos(rad(angle)), Math.sin(rad(angle)), 0]; // 화면에서 면의 '아래'가 향한 각도
    const right = [Math.sin(rad(angle)), -Math.cos(rad(angle)), 0]; // 앞면: 오른쪽 = 아래 × 법선(0, 0, 1)
    const turnDeg = uprightTurn(right, down, top);
    const off = (((angle + turnDeg - 90) % 360) + 540) % 360 - 180;
    assert.ok(Math.abs(off) <= 45 + 1e-9, `${angle}° → ${turnDeg}°`);
    if (angle % 90 !== 45) assert.equal(turnDeg, ((Math.round((90 - angle) / 90) * 90) % 360 + 360) % 360);
  }
  // 정육면체의 옆면: 기울기 45°~135°(비스듬히 위·옆·비스듬히 아래)에서는 어느 쪽으로 돌려도, 종이가 어느 방향으로 붙었어도
  // 글자의 아래가 입체의 아래쪽(−z)이다. 윗면은 네 변 가운데 화면 아래를 가장 향한 변이 글자의 아래
  for (let tilt = 5; tilt < 180; tilt += 10) {
    for (let turn = 0; turn < 360; turn += 7) {
      const pose = poseOf({ tilt, turn });
      if (tilt > 45 && tilt < 135) {
        for (const [right, down] of [[[1, 0, 0], [0, 0, -1]], [[0, 0, -1], [-1, 0, 0]], [[-1, 0, 0], [0, 0, 1]], [[0, 0, 1], [1, 0, 0]]]) {
          const th = rad(uprightTurn(right, down, pose));
          const textDown = [0, 1, 2].map((k) => -Math.sin(th) * right[k] + Math.cos(th) * down[k]);
          assert.deepEqual(textDown.map((v) => Math.round(v) + 0), [0, 0, -1], `옆면 기울기 ${tilt} 돌림 ${turn}`);
        }
      }
      const th = rad(uprightTurn([1, 0, 0], [0, 1, 0], pose));
      const topDown = [-Math.sin(th), Math.cos(th), 0];
      const best = Math.max(...[[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]].map((v) => turnVector(pose, v)[1]));
      assert.ok(near(turnVector(pose, topDown)[1], best, 1e-9), `윗면 기울기 ${tilt} 돌림 ${turn}`);
    }
  }
});

test('빈 자리 안내: 처음 보기에서 안 보이는 빈 자리는 굴리면 "보임"으로 계산된다 — 아래쪽 빈 자리는 아래에서 보면 보인다', () => {
  // 아래쪽(법선 −z) 자리: 위에서는 세로축 둘레로 어떻게 돌려도 안 보이고, 아래쪽으로 굴리면 보인다
  for (const turn of [0, 90, 180, 270]) {
    const base = { tilt: TILT, turn };
    assert.equal(facesViewer([0, 0, -1], foldedPose(base, homeView())), false);
    assert.equal(facesViewer([0, 0, -1], foldedPose(base, turnBy(homeView(), 137))), false);
    assert.equal(facesViewer([0, 0, -1], poseOf({ tilt: 90, turn: SPIN + turn })), false); // 옆에서 보면 선으로만
    let view = homeView();
    const seen = [];
    for (let i = 0; i < 24; i += 1) {
      view = stepView(view, 'down');
      seen.push(facesViewer([0, 0, -1], foldedPose(base, view)));
    }
    // 56° + 15° × n: 90°를 넘는 3번째부터 보이고, 270°를 넘으면(15번째부터) 다시 위쪽이 보여 안 보인다
    assert.deepEqual(seen.map((v) => (v ? 1 : 0)).join(''), '001111111111110000000000');
  }
  // 옆면 자리: 처음 보기에서는 지금 식(viewDirection(…)[2] < 0.05이면 숨음)과 같은 판정
  let hidden = 0;
  let shown = 0;
  for (const n of INVALID_HEXOMINOES.filter((x) => x.shape !== 'block')) {
    const { net, turn, tilt } = displayNet(fromCells(n.cells));
    const base = { tilt, turn };
    for (const slot of missingSlots(net)) {
      const now = facesViewer(slot.normal, foldedPose(base, homeView()));
      assert.equal(now, !(viewDirection(slot.normal, turn, tilt)[2] < 0.05));
      if (now) {
        shown += 1;
        continue;
      }
      hidden += 1;
      // 숨은 빈 자리: 오른쪽·왼쪽 버튼으로 한 바퀴 도는 동안(30°씩) 어디선가 보이고, 끌어서 뒤쪽을 봐도 보인다
      for (const dir of ['right', 'left']) {
        let view = homeView();
        const seen = [];
        for (let i = 0; i < 12; i += 1) {
          view = stepView(view, dir);
          seen.push(facesViewer(slot.normal, foldedPose(base, view)));
        }
        assert.ok(seen.includes(true), `${n.name} ${dir}`);
      }
      assert.equal(facesViewer(slot.normal, foldedPose(base, dragView(homeView(), 360, 0))), !now); // 반 바퀴 돌린 뒤쪽
    }
  }
  assert.ok(hidden > 0 && shown > 0, `${hidden} ${shown}`);
});

test('보는 방향·크기 말: 구간 경계 0·20·70·110·160·180, 어느 쪽으로 굴렸든 입체의 위쪽이 눈을 향한 정도로 말한다 — 면 이름·빈 자리·겹침은 말하지 않는다', () => {
  assert.deepEqual([0, 19.9, 20, 45, 69.9, 70, 90, 110, 110.1, 135, 160, 160.1, 180].map(tiltZone), [0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4]);
  assert.equal(tiltWord(0), '위에서 본 모습이에요.');
  assert.equal(tiltWord(15), '위에서 본 모습이에요.');
  assert.equal(tiltWord(56), '비스듬히 위에서 본 모습이에요.');
  assert.equal(tiltWord(90), '옆에서 본 모습이에요.');
  assert.equal(tiltWord(135), '비스듬히 아래에서 본 모습이에요.');
  assert.equal(tiltWord(165), '아래에서 본 모습이에요.');
  assert.equal(tiltWord(180), '아래에서 본 모습이에요.');
  // 세로로만 기울인 자세에서는 높이 = 기울기(전과 같은 말)
  for (let tilt = 0; tilt <= 180; tilt += 3) {
    for (const turn of [0, -28, 75, 200]) assert.ok(near(elevationOf(poseOf({ tilt, turn })), tilt, 1e-6));
  }
  assert.ok(near(elevationOf(foldedPose(HOME, homeView())), 56, 1e-9));
  assert.equal(tiltWord(elevationOf(foldedPose(HOME, homeView()))), '비스듬히 위에서 본 모습이에요.');
  // 아무렇게나 굴린 자세: 입체의 위쪽 면(법선 +z)이 눈을 향한 각도 그대로이고, 화면 안에서 눕히는 것(보는 방향 둘레로 돌림)으로는 말이 바뀌지 않는다
  const rng = createRng('view-words');
  for (let i = 0; i < 500; i += 1) {
    const pose = randomPose(rng);
    const height = elevationOf(pose);
    assert.ok(height >= 0 && height <= 180);
    assert.ok(near(Math.cos(rad(height)), turnVector(pose, [0, 0, 1])[2], 1e-9));
    assert.ok(near(elevationOf(multiply3(rotationMatrix([0, 0, 1], rng.next() * 360), pose)), height, 1e-6));
    // "위에서"라고 말할 때는 정말 윗면이 눈을 향하고, "아래에서"라고 말할 때는 바닥 쪽이 눈을 향한다
    if (tiltZone(height) === 0) assert.ok(facesViewer([0, 0, 1], pose, 0.9));
    if (tiltZone(height) === 4) assert.ok(facesViewer([0, 0, -1], pose, 0.9));
    if (tiltZone(height) === 2) assert.ok(Math.abs(turnVector(pose, [0, 0, 1])[2]) < 0.35);
  }
  // 15° 버튼으로 한 바퀴: 구간이 위 → … → 아래 → … → 위로 돌아온다
  let view = homeView();
  const zones = [];
  for (let i = 0; i < 24; i += 1) {
    view = stepView(view, 'down');
    zones.push(tiltZone(elevationOf(foldedPose(HOME, view))));
  }
  assert.equal(zones.join(''), '222333444333222111000111'); // 71° 86° 101° | 116° 131° 146° | 161° 176° 169° | 154° … | 19° 4° 11° | 26° 41° 56°
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
