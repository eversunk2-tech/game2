/**
 * R1 쌓기나무 판의 돌림판식 돌리기(turn-view.js) 검사. 기획서: spec-grade6.md 15-18·15-19, plan-rotate-free.md 4절·6절(R1 검사 ①②③).
 * 규칙은 저장소 코드를 쓰지 않고 기획서 문장만 보고 짠 독립 계산(아래 "독립 모형")과 견준다:
 *   가로 끌기 1px = 0.4°(오른쪽으로 끌면 판의 앞쪽이 오른쪽으로), 세로 끌기 1px = 0.4°(아래로 끌면 위가 더 보임, 0°~90°에서 멈춤) —
 *   15-27 "약간만 더 느리게"(전개도 입체의 0.5°보다 약 20% 느리게, 모든 쌓기나무 판. R1의 0.5°에서 바뀜),
 *   버튼 판 45°·높이 15° 눈금, 방향키 판 15°·높이 15° 눈금, 처음 보기 = 교과서 그림 방향.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRng } from '../../src/shared/core/random.js';
import { POSES as VIEW_POSES, poseWord, projectPoint } from '../../src/games/net-workshop/blocks/block-view.js';
import { DRAG_DEG as ORBIT_DRAG_DEG, mixStep } from '../../src/games/net-workshop/orbit.js';
import {
  DRAG_DEG,
  PITCH_MAX,
  PITCH_MIN,
  PITCH_STEP,
  POSES,
  SNAP,
  YAW_BUTTON,
  YAW_KEY,
  dragTurn,
  homeTurn,
  isHomeTurn,
  normYaw,
  poseAt,
  poseOf,
  sameTurn,
  snapTurn,
  stepTurn,
  turnLimits,
  turnToward,
} from '../../src/games/net-workshop/blocks/turn-view.js';

const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const rows = (m) => [[m[0], m[1], m[2]], [m[3], m[4], m[5]], [m[6], m[7], m[8]]];
const maxGap = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
const yawGap = (a, b) => Math.abs((((b - a) % 360) + 540) % 360 - 180);

// ── 독립 모형: 기획서 문장만 보고 만든 자세 ─────────────
/** 눈이 있는 쪽(모델 좌표 방향) → 자세 행렬. 화면 오른쪽은 늘 판과 나란하다(높이 0): 눈이 바로 위면 rightAtTop을 쓴다 */
function poseFromEye(eye, rightAtTop) {
  const n = Math.hypot(...eye);
  const v = eye.map((x) => x / n);
  let right = cross([0, 0, 1], v); // 판의 세로축 × 보는 쪽 = 화면 오른쪽(수평)
  if (Math.hypot(...right) < 1e-12) right = rightAtTop;
  const rn = Math.hypot(...right);
  right = right.map((x) => x / rn);
  const down = cross(right, v);
  return [...right, ...down, ...v];
}
/** 판을 yaw만큼 돌리고(0 = 앞에서, 90 = 옆(오른쪽)에서), pitch만큼 위에서 볼 때의 눈 방향 */
const eyeOf = (yaw, pitch) => {
  const a = (yaw * Math.PI) / 180;
  const b = (pitch * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(b), -Math.cos(a) * Math.cos(b), Math.sin(b)];
};
const modelPose = (yaw, pitch) => poseFromEye(eyeOf(yaw, pitch), [Math.cos((yaw * Math.PI) / 180), Math.sin((yaw * Math.PI) / 180), 0]);
const HOME_PITCH = (Math.asin(1 / Math.sqrt(3)) * 180) / Math.PI;

test('정해진 자세: 처음 보기·[위][앞][옆]·뒤·왼쪽·behind가 지금(POSES) 그대로다 — 돌림판 각도로 계산한 자세와 1e-12 안, 무대는 정해 둔 행렬 그대로 쓴다', () => {
  // 지금 무대가 쓰는 행렬(block-view.js가 다시 내보낸 것)은 turn-view.js의 것과 같다
  assert.equal(VIEW_POSES, POSES);
  // 기획서의 말로 만든 자세: 처음 보기는 앞·오른쪽·위가 같은 비율로 보이고(눈 = (1, −1, 1) 방향), 위는 앞이 아래, 옆은 오른쪽에서
  const expected = {
    home: poseFromEye([1, -1, 1]),
    top: poseFromEye([0, 0, 1], [1, 0, 0]),
    front: poseFromEye([0, -1, 0]),
    side: poseFromEye([1, 0, 0]),
    back: poseFromEye([0, 1, 0]),
    left: poseFromEye([-1, 0, 0]),
    behind: poseFromEye([-1, 1, 1]),
  };
  assert.deepEqual(Object.keys(SNAP).sort(), Object.keys(POSES).sort());
  for (const [name, pose] of Object.entries(POSES)) {
    assert.ok(maxGap(pose, expected[name]) < 1e-12, `${name}: 기획서의 자세`);
    const [r, d, v] = rows(pose);
    assert.ok(Math.abs(dot3(cross(r, d), v) + 1) < 1e-12, `${name}: 거울상이 아니다`);
    assert.ok(maxGap(poseAt(SNAP[name].yaw, SNAP[name].pitch), pose) < 1e-12, `${name}: 돌림판 각도로 계산`);
    assert.deepEqual(poseOf(SNAP[name]), [...pose], `${name}: 무대는 정해 둔 행렬 그대로`);
    // 그 자세로 돌린 보기는 배율을 그대로 둔다
    assert.deepEqual(snapTurn({ yaw: 10, pitch: 20, zoom: 1.6 }, name), { yaw: SNAP[name].yaw, pitch: SNAP[name].pitch, zoom: 1.6 });
    // 모든 정해진 자세가 돌림판으로 갈 수 있는 자세다: 0°~90°, 판이 기울지 않음
    assert.ok(SNAP[name].pitch >= PITCH_MIN && SNAP[name].pitch <= PITCH_MAX, name);
    assert.equal(pose[2], 0, `${name}: 화면 오른쪽의 높이 성분`);
  }
  assert.deepEqual(homeTurn(), { yaw: 45, pitch: HOME_PITCH, zoom: 1 });
  assert.deepEqual(poseOf(homeTurn()), [...POSES.home]);
  assert.ok(Math.abs(SNAP.home.pitch - 35.26438968275465) < 1e-12);
  // 말도 그대로
  assert.equal(poseWord(poseOf(homeTurn())), '비스듬히 위에서 본 모습이에요.');
  assert.equal(poseWord(poseOf(SNAP.top)), '위에서 본 모습이에요.');
  // 정해진 자세에 아주 가까운 각도에서도 계산과 1e-12 안이라, 정해 둔 행렬로 바꿔 그려도 튀지 않는다
  for (const [name, at] of Object.entries(SNAP)) {
    for (const d of [-2e-10, 2e-10]) assert.ok(maxGap(poseOf({ yaw: normYaw(at.yaw + d), pitch: Math.min(90, at.pitch + Math.abs(d)) }), POSES[name]) < 1e-12, name);
  }
});

test('자세: 어느 각도에서나 직교 행렬이고, 화면 오른쪽은 판과 나란하며(높이 성분 0), 판의 세로축은 화면 위를 향한다 — 독립 모형과 1e-12 안', () => {
  const rng = createRng('turn-pose');
  for (let i = 0; i < 5000; i += 1) {
    const yaw = rng.next() * 360;
    const pitch = i % 50 === 0 ? (i % 100 === 0 ? 0 : 90) : rng.next() * 90;
    const pose = poseAt(yaw, pitch);
    const [r, d, v] = rows(pose);
    for (const a of [r, d, v]) assert.ok(Math.abs(dot3(a, a) - 1) < 1e-12);
    assert.ok(Math.abs(dot3(r, d)) < 1e-12 && Math.abs(dot3(r, v)) < 1e-12 && Math.abs(dot3(d, v)) < 1e-12);
    // 거울상이 아니다: 정해진 자세와 같은 손(화면 좌표는 x 오른쪽·y 아래·z 보는 사람 쪽이라 행렬식이 −1)
    assert.ok(Math.abs(dot3(cross(r, d), v) + 1) < 1e-12, '거울상이 아니다');
    assert.equal(pose[2], 0);
    assert.ok(pose[5] <= 1e-12, '판의 위쪽(모델 z)이 화면 아래를 향하지 않는다');
    assert.ok(pose[8] >= -1e-12, '판 밑에서 보지 않는다');
    assert.ok(maxGap(pose, modelPose(yaw, pitch)) < 1e-12, `${yaw} ${pitch}`);
  }
});

test('끌기: 가로 1px = 판 0.4°(오른쪽으로 끌면 판의 앞쪽이 오른쪽으로, 끝없이), 세로 1px = 높이 0.4°(아래로 끌면 위가 더 보이고 수평~바로 위에서 멈춤)', () => {
  const home = homeTurn();
  // 쌓기나무 판의 끌기(0.4°)는 전개도 입체의 끌기(orbit.js 0.5° — 5·6학년 전개도)와 따로다
  assert.equal(DRAG_DEG, 0.4);
  assert.equal(ORBIT_DRAG_DEG, 0.5);
  // 오른쪽 120px: 판만 48° 돈다(전에는 60°). 내려다보는 높이·배율 그대로
  const r120 = dragTurn(home, 120, 0);
  assert.ok(Math.abs(r120.yaw - 357) < 1e-9);
  assert.equal(r120.pitch, home.pitch);
  assert.equal(r120.zoom, 1);
  // 판의 앞쪽 가운데(모델 [1.5, 0, 0])가 화면 오른쪽으로 간다 · 오른쪽 가운데는 앞으로 오지 않는다(멀어진다)
  const at = (view, p) => projectPoint(poseOf(view), 10, 0, 0, p);
  for (const dx of [2, 20, 60]) {
    const next = dragTurn(home, dx, 0);
    assert.ok(at(next, [1.5, 0, 0])[0] > at(home, [1.5, 0, 0])[0], `앞쪽이 오른쪽으로 ${dx}`);
    assert.ok(dot3(eyeOf(next.yaw, next.pitch), [1, 0, 0]) < dot3(eyeOf(home.yaw, home.pitch), [1, 0, 0]));
  }
  // 끝없이: 900px = 한 바퀴(360°)면 제자리
  assert.ok(sameTurn(dragTurn(home, 900, 0), home));
  assert.ok(sameTurn(dragTurn(home, -1800, 0), home));
  assert.ok(!sameTurn(dragTurn(home, 720, 0), home)); // 전의 한 바퀴(720px)는 이제 288°
  // 아래로 끌면 위가 더 보인다(윗면이 보는 사람을 더 향함). 137px 넘게 끌면 바로 위(90°)에서 멈춘다
  const down = dragTurn(home, 0, 40);
  assert.ok(Math.abs(down.pitch - (home.pitch + 16)) < 1e-12);
  assert.ok(dragTurn(home, 0, 136).pitch < 90);
  assert.equal(dragTurn(home, 0, 137).pitch, 90);
  assert.ok(poseOf(down)[8] > poseOf(home)[8]);
  assert.equal(dragTurn(home, 0, 400).pitch, 90);
  assert.equal(dragTurn(home, 0, -400).pitch, 0);
  assert.equal(dragTurn(dragTurn(home, 0, -400), 0, -50).pitch, 0);
  // 비스듬히 끌어도 두 몫을 따로: 판은 기울지 않는다
  const slant = dragTurn(home, 160, 100);
  assert.ok(Math.abs(slant.yaw - 341) < 1e-9);
  assert.ok(Math.abs(slant.pitch - (HOME_PITCH + 40)) < 1e-9);
  assert.equal(poseOf(slant)[2], 0);
  // 한도에 걸리지 않으면 4px씩 나눠 끌어도 한 번에 끈 것과 같다(문턱으로 잃는 몫이 없다 — 무대가 문턱을 넘은 첫 움직임에 처음 자리부터 잰다)
  let pieces = home;
  for (let i = 0; i < 30; i += 1) pieces = dragTurn(pieces, 4, 1);
  const once = dragTurn(home, 120, 30);
  assert.ok(sameTurn(pieces, once));
  assert.ok(Math.abs(pieces.pitch - once.pitch) < 1e-9 && yawGap(pieces.yaw, once.yaw) < 1e-9);
  // 숫자가 아닌 값은 0으로
  assert.deepEqual(dragTurn(home, NaN, undefined), home);
});

test('무작위 조작 10,000번(끌기·버튼·방향키·[위][앞][옆]·도중의 움직임) 뒤에도 판이 기울지 않는다: 화면 오른쪽의 높이 성분 0, 높이 0°~90° — 독립 모형과 같다', () => {
  const rng = createRng('turn-random');
  let view = homeTurn();
  // 독립 모형: 각도를 기획서의 규칙대로 따로 센다
  let model = { yaw: 45, pitch: HOME_PITCH };
  const mark = (value, step, sign) => {
    // value보다 한 칸 큰·작은 step의 배수 (이미 눈금 위면 다음 눈금)
    const k = value / step;
    const near = Math.round(k);
    const base = Math.abs(k - near) < 1e-6 ? near : sign > 0 ? Math.floor(k) : Math.ceil(k);
    return (base + sign) * step;
  };
  const wrap = (y) => ((y % 360) + 360) % 360;
  let shown = { ...view };
  const counts = { drag: 0, button: 0, key: 0, snap: 0, mix: 0, top: 0, flat: 0 };
  for (let i = 0; i < 10_000; i += 1) {
    const r = rng.next();
    if (r < 0.55) {
      // 끌기: 짧게 여러 번 또는 크게 한 번, 가로 위주·아무 방향 섞어서
      const dx = rng.int(-300, 300);
      const dy = rng.next() < 0.5 ? rng.int(-40, 40) : rng.int(-300, 300);
      view = dragTurn(view, dx, dy);
      model = { yaw: wrap(model.yaw - dx * 0.4), pitch: Math.max(0, Math.min(90, model.pitch + dy * 0.4)) };
      counts.drag += 1;
    } else if (r < 0.75) {
      const dir = rng.pick(['left', 'right', 'up', 'down']);
      view = stepTurn(view, dir);
      if (dir === 'right' || dir === 'left') model = { ...model, yaw: wrap(mark(model.yaw, 45, dir === 'right' ? 1 : -1)) };
      else model = { ...model, pitch: Math.max(0, Math.min(90, mark(model.pitch, 15, dir === 'up' ? 1 : -1))) };
      counts.button += 1;
    } else if (r < 0.9) {
      const dir = rng.pick(['left', 'right', 'up', 'down']);
      view = stepTurn(view, dir, dir === 'left' || dir === 'right' ? YAW_KEY : PITCH_STEP);
      if (dir === 'right' || dir === 'left') model = { ...model, yaw: wrap(mark(model.yaw, 15, dir === 'right' ? 1 : -1)) };
      else model = { ...model, pitch: Math.max(0, Math.min(90, mark(model.pitch, 15, dir === 'up' ? 1 : -1))) };
      counts.key += 1;
    } else {
      const name = rng.pick(Object.keys(SNAP));
      view = snapTurn(view, name);
      model = { ...SNAP[name] };
      counts.snap += 1;
    }
    assert.ok(yawGap(view.yaw, model.yaw) < 1e-6 && Math.abs(view.pitch - model.pitch) < 1e-6, `${i}: ${JSON.stringify(view)} / ${JSON.stringify(model)}`);
    assert.ok(view.yaw >= 0 && view.yaw < 360, `${i} yaw ${view.yaw}`);
    assert.ok(view.pitch >= PITCH_MIN && view.pitch <= PITCH_MAX, `${i} pitch ${view.pitch}`);
    if (view.pitch === 90) counts.top += 1;
    if (view.pitch === 0) counts.flat += 1;
    // 지금 보기 · 화면이 그 보기로 가는 도중의 모습(움직임 0.2초를 프레임 몇 개로)
    const frames = [poseOf(view)];
    let p = 0;
    while (p < 1) {
      const next = Math.min(1, p + 0.05 + rng.next() * 0.4);
      shown = turnToward(shown, view, mixStep(p, next));
      p = next;
      frames.push(poseOf(shown));
      counts.mix += 1;
    }
    assert.ok(sameTurn(shown, view), `${i}: 움직임이 끝나면 딱 그 보기`);
    for (const pose of frames) {
      assert.equal(pose[2], 0, `${i}: 화면 오른쪽의 높이 성분`);
      assert.ok(pose[5] <= 1e-12 && pose[8] >= -1e-12, `${i}: 판의 위쪽이 화면 위 · 판 위에서 봄`);
    }
  }
  assert.ok(counts.top > 100 && counts.flat > 100, JSON.stringify(counts)); // 한도에 여러 번 닿았다
});

test('버튼·방향키는 눈금에 멈춘다: 버튼은 판 45°(여덟 방향)·높이 15°, 방향키는 판 15°·높이 15°. 높이가 한도에 닿으면 그쪽은 그대로이고 꺼진다', () => {
  const home = homeTurn();
  assert.equal(YAW_BUTTON, 45);
  assert.equal(YAW_KEY, 15);
  assert.equal(PITCH_STEP, 15);
  // 판: 오른쪽 = 오른쪽 면이 앞으로(오른쪽에서 보는 쪽으로)
  const yaws = [];
  let v = home;
  for (let i = 0; i < 8; i += 1) {
    v = stepTurn(v, 'right');
    yaws.push(v.yaw);
  }
  assert.deepEqual(yaws, [90, 135, 180, 225, 270, 315, 0, 45]);
  assert.ok(sameTurn(v, home));
  assert.ok(dot3(eyeOf(stepTurn(home, 'right').yaw, home.pitch), [1, 0, 0]) > dot3(eyeOf(45, home.pitch), [1, 0, 0]));
  assert.equal(stepTurn(home, 'left').yaw, 0);
  assert.equal(stepTurn(stepTurn(home, 'left'), 'left').yaw, 315);
  // 끌다 만 각도에서는 그쪽의 다음 눈금으로
  assert.equal(stepTurn({ ...home, yaw: 100 }, 'right').yaw, 135);
  assert.equal(stepTurn({ ...home, yaw: 100 }, 'left').yaw, 90);
  assert.equal(stepTurn({ ...home, yaw: 100 }, 'right', 15).yaw, 105);
  assert.equal(stepTurn({ ...home, yaw: 359.5 }, 'right').yaw, 0);
  // 높이: 처음(35.26°)에서 위로 45 → 60 → 75 → 90, 아래로 30 → 15 → 0
  const ups = [];
  v = home;
  for (let i = 0; i < 5; i += 1) {
    v = stepTurn(v, 'up');
    ups.push(v.pitch);
  }
  assert.deepEqual(ups, [45, 60, 75, 90, 90]);
  assert.equal(turnLimits(v).up, true);
  assert.equal(turnLimits(v).down, false);
  const downs = [];
  v = home;
  for (let i = 0; i < 4; i += 1) {
    v = stepTurn(v, 'down');
    downs.push(v.pitch);
  }
  assert.deepEqual(downs, [30, 15, 0, 0]);
  assert.equal(turnLimits(v).down, true);
  assert.equal(turnLimits(v).up, false);
  assert.deepEqual(turnLimits(home), { up: false, down: false, zoomMax: false, zoomMin: false, home: true });
  // 판 돌리기·처음 보기·배율
  assert.equal(isHomeTurn(home), true);
  assert.equal(isHomeTurn(dragTurn(home, 900, 0)), true); // 한 바퀴 = 900px(0.4°)
  assert.equal(isHomeTurn(dragTurn(home, 1, 0)), false);
  assert.equal(isHomeTurn({ ...home, zoom: 1.25 }), false);
  assert.equal(turnLimits({ ...home, zoom: 2 }).zoomMax, true);
  assert.equal(turnLimits({ ...home, zoom: 0.5 }).zoomMin, true);
  // 모르는 방향은 그대로
  assert.deepEqual(stepTurn(home, 'spin'), home);
});

test('움직임으로 잇기: 판은 가까운 쪽으로 돌고 높이는 곧게 — 도중에도 기울지 않고, [앞] → [뒤]는 제자리에서 반 바퀴, 끝은 딱 목표', () => {
  const front = { ...SNAP.front, zoom: 1 };
  const back = { ...SNAP.back, zoom: 1 };
  for (let k = 1; k < 10; k += 1) {
    const mid = turnToward(front, back, k / 10);
    assert.equal(mid.pitch, 0);
    assert.ok(Math.abs(yawGap(mid.yaw, 0) - 18 * k) < 1e-9, `${k}`);
  }
  assert.deepEqual(turnToward(front, back, 1), back);
  assert.deepEqual(turnToward(front, back, 0), front);
  // 가까운 쪽: 350° → 10°는 20°만 돈다
  const a = { yaw: 350, pitch: 30, zoom: 1 };
  const b = { yaw: 10, pitch: 60, zoom: 2 };
  const half = turnToward(a, b, 0.5);
  assert.ok(Math.abs(half.yaw) < 1e-9 || Math.abs(half.yaw - 360) < 1e-9);
  assert.ok(Math.abs(half.pitch - 45) < 1e-12);
  assert.ok(Math.abs(half.zoom - Math.SQRT2) < 1e-12);
  // 처음 보기 → [위]: 도는 내내 판이 기울지 않고, 높이는 처음 → 90°로 곧게
  let shown = homeTurn();
  const target = snapTurn(shown, 'top');
  let p = 0;
  let last = shown.pitch;
  for (const next of [0.1, 0.25, 0.5, 0.8, 1]) {
    shown = turnToward(shown, target, mixStep(p, next));
    p = next;
    assert.equal(poseOf(shown)[2], 0);
    assert.ok(shown.pitch >= last);
    last = shown.pitch;
  }
  assert.deepEqual(poseOf(shown), [...POSES.top]);
});

test('계획 3절의 끌기 여덟 가지: 새 돌리기에서는 판의 기울기가 모두 0°, 판 밑에서 보지 않는다', () => {
  /** 끌기 경로(점들) → 4px씩 나눠 pointermove처럼 적용 */
  const run = (path) => {
    let view = homeTurn();
    for (let i = 1; i < path.length; i += 1) {
      const [x0, y0] = path[i - 1];
      const [x1, y1] = path[i];
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4));
      for (let k = 0; k < n; k += 1) view = dragTurn(view, (x1 - x0) / n, (y1 - y0) / n);
    }
    return view;
  };
  const paths = [
    [[0, 0], [120, 0]],
    [[0, 0], [240, 0]],
    [[0, 0], [360, 0]],
    [[0, 0], [0, 60], [200, 60]],
    [[0, 0], [160, 100]],
    Array.from({ length: 9 }, (_, i) => [i * 40, i % 2 ? 40 : 0]).concat([[320, 0]]),
    Array.from({ length: 37 }, (_, i) => [80 * Math.sin((i / 36) * 2 * Math.PI), 80 - 80 * Math.cos((i / 36) * 2 * Math.PI)]),
    [[0, 0], [0, -100], [200, -100]],
  ];
  for (const path of paths) {
    const view = run(path);
    const pose = poseOf(view);
    // 판의 세로축(쌓기나무의 세로 모서리)이 화면 위쪽에서 기운 각도
    const tilt = Math.hypot(pose[2], pose[5]) < 1e-9 ? 0 : (Math.atan2(pose[2], -pose[5]) * 180) / Math.PI;
    assert.equal(tilt, 0, JSON.stringify(path.slice(0, 3)));
    assert.ok(view.pitch >= 0 && view.pitch <= 90);
  }
  // 오른쪽 120px: 높이는 처음 그대로(35.26°) — 지금까지는 16.8° 위로 내려가며 31.5° 기울었다(plan-rotate-free 3절)
  assert.equal(run(paths[0]).pitch, HOME_PITCH);
  // 위로 100px → 오른쪽 200px: 옆에서(수평) 본다
  assert.equal(run(paths[7]).pitch, 0);
});
