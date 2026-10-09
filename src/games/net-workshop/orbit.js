/**
 * 접은 입체를 보는 방향과 크기 (순수 함수, 화면과 무관). spec 17절 (17-17: 어느 방향으로든 끝없이 돌린다, 17-18: 접는 도중에도 같은 정도로)
 *
 * 무대 변환은 CSS `scale3d(s) rotate3d(축, 각도) rotateX(tilt) rotateZ(turn)`이다. 화면 좌표는 x 오른쪽, y 아래, z 보는 사람 쪽.
 *   rotateX(tilt) rotateZ(turn)  처음 보기: displayNet이 고른 기울기·돌림(접는 정도에 비례) + 펼친 전개도를 평면에서 돌린 각도(spin)
 *   rotate3d(축, 각도)            학생이 더 돌린 것. 화면 기준 축 둘레의 회전을 차례로 쌓은 것(사원수)이라 한계가 없고,
 *                                입체가 어떤 자세에 있어도(뒤집힌 자세 포함) 끄는 방향 = 지금 보이는 앞면이 움직이는 방향이다
 * 학생이 바꾸는 보기 값(view): { spin(펼친 채 평면에서 돌린 각도), roll(쌓인 회전, 사원수 [x, y, z, w]), zoom(배율, 처음 1) }
 * 처음 보기(base): displayNet이 고른 { tilt, turn }. 자동 맞춤 배율(auto)은 무대 크기로 정한다.
 *
 * 화면에 넣는 모습(look = { roll, zoom }, spec 17-18): 보기 조작이 켜져 있고 조금이라도 접혀 있으면 학생 보기 그대로 —
 * 접는 정도와 상관없이 똑같이 돈다(1px = 0.5°, 버튼 한 번 = 한 단계, 배율도 그대로). 다 편 전개도(t = 0)와 답하기 전에는
 * 처음 모습(더 돌린 것 없음, 배율 1)이라 답하기 전 화면이 문항·조작과 무관하게 같다(lookFor).
 * 둘 사이는 접는 정도에 비례해 줄이지 않고 짧은 움직임(MIX_MS)으로 잇는다 — 무대(view3d.js)가 프레임마다 lookToward로 다가간다.
 */
import { dot, normalize } from './geometry.js';

export const TILT = 56; // 다 접었을 때 처음 기울기(도): 위쪽이 멀어져 비스듬히 내려다본다
export const SPIN = -28; // 다 접었을 때 처음 돌린 각도(도): 옆면 두 개가 보이게
export const TILT_STEP = 15; // 위·아래 버튼과 ↑↓ 키 한 번(도)
export const TURN_KEY = 15; // ← → 키 한 번(도)
export const TURN_BUTTON = 30; // 왼쪽·오른쪽 버튼 한 번(도)
export const ZOOM_STEPS = [0.5, 0.64, 0.8, 1, 1.25, 1.6, 2]; // 크게·작게 버튼과 + − 키의 단계
export const ZOOM_MIN = ZOOM_STEPS[0];
export const ZOOM_MAX = ZOOM_STEPS[ZOOM_STEPS.length - 1];
export const MIX_MS = 200; // 처음 모습(다 편 전개도)과 내 자세를 잇는 움직임의 길이(ms)
export const DRAG_DEG = 0.5; // 1px 끌 때 도는 각도(도)
export const DRAG_START = 8; // 이만큼(px) 넘게 움직여야 끌기, 그 전에 떼면 누르기 (엔진 끌어다 놓기와 같은 값)
export const PERSPECTIVE = 1100; // .fold-stage의 perspective(px)
export const EYE_RISE = 0.08; // perspective-origin 50% 42%: 눈이 무대 가운데보다 무대 높이의 8%만큼 위에 있다
export const LIGHT = normalize([-0.45, -0.55, 1]); // 빛은 화면에 고정: 왼쪽 위 앞
const SHADE_MAX = 0.34;
const WHEEL_ZOOM = 0.0015; // 휠 1px에 배율이 바뀌는 정도 (한 칸 100px ≈ 14%)
const PINCH_WHEEL_ZOOM = 0.01; // 터치패드 벌리기(Ctrl+휠)는 값이 작게 온다
const WHEEL_LINE = 33; // 줄 단위로 오는 휠(deltaMode 1) 한 줄 ≈ 33px

const rad = (deg) => (deg * Math.PI) / 180;
const deg = (radians) => (radians * 180) / Math.PI;
export const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));

// ── 회전: 사원수 [x, y, z, w] · 3×3 행렬(행 우선 길이 9) ─────────────
const NO_ROLL = Object.freeze([0, 0, 0, 1]);

/** 축(axis) 둘레로 degrees만큼 도는 회전. CSS rotate3d(축, 각도)와 같은 방향 */
function quatAbout(axis, degrees) {
  const [x, y, z] = normalize(axis);
  const half = rad(degrees) / 2;
  const s = Math.sin(half);
  return [x * s, y * s, z * s, Math.cos(half)];
}

/** a ∘ b: b를 먼저, 그다음 a (둘 다 화면 기준 축) */
function quatMul(a, b) {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

/**
 * 길이를 1로 맞추고(쌓인 오차로 찌그러지지 않게), w ≥ 0인 쪽으로 고른다(같은 자세를 나타내는 둘 가운데 돌린 각도가 180° 안쪽인 것).
 * 처음 자세에 아주 가까우면(한 바퀴 돌아 제자리) 딱 처음 자세로 한다.
 */
function quatTidy(q) {
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  const sign = q[3] < 0 ? -1 : 1;
  const out = q.map((v) => (v * sign) / n);
  return Math.hypot(out[0], out[1], out[2]) < 1e-9 ? [...NO_ROLL] : out;
}

/** 사원수 → { axis, angle(도, 0~180) } */
export function rollOf(q) {
  const s = Math.hypot(q[0], q[1], q[2]);
  if (s < 1e-9) return { axis: [0, 0, 1], angle: 0 };
  return { axis: [q[0] / s, q[1] / s, q[2] / s], angle: deg(2 * Math.atan2(s, Math.abs(q[3]))) * (q[3] < 0 ? -1 : 1) };
}

const multiply3 = (a, b) => {
  const out = new Array(9).fill(0);
  for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) for (let k = 0; k < 3; k += 1) out[r * 3 + c] += a[r * 3 + k] * b[k * 3 + c];
  return out;
};

/** 축 둘레로 degrees만큼 도는 3×3 행렬 (로드리게스 공식, CSS rotate3d와 같은 방향) */
export function rotationMatrix(axis, degrees) {
  const [x, y, z] = normalize(axis);
  const c = Math.cos(rad(degrees));
  const s = Math.sin(rad(degrees));
  const t = 1 - c;
  return [
    t * x * x + c, t * x * y - s * z, t * x * z + s * y,
    t * x * y + s * z, t * y * y + c, t * y * z - s * x,
    t * x * z - s * y, t * y * z + s * x, t * z * z + c,
  ];
}

/** 3×3 행렬을 벡터에 적용한다 */
export const turnVector = (m, v) => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];

// ── 보기 값 ──────────────────────────────
export const homeView = () => ({ spin: 0, roll: [...NO_ROLL], zoom: 1 });
export const isHome = (view) => Math.abs(view.spin) < 1e-6 && Math.abs(rollOf(view.roll).angle) < 1e-6 && Math.abs(view.zoom - 1) < 1e-6;

/**
 * 접는 정도 t(0~1)일 때 무대에 넣을 값 { tilt, turn, scale, roll: { axis, angle } }.
 * look: 화면에 넣을 보기 { spin, roll, zoom } — 더 돌린 것(roll)과 배율(zoom)은 접는 정도와 상관없이 그대로 넣는다(spec 17-18).
 * 처음 보기의 기울기·돌림과 자동 맞춤 배율만 접는 정도에 비례한다. 평면 돌림(spin)은 지금처럼 펼친 전개도도 돌린다.
 * 다 편 전개도를 처음 모습으로 두는 것은 lookFor가 한다(넣을 roll·zoom을 처음 값으로 준다).
 */
export function sceneAt(t, base, auto, look) {
  return {
    tilt: base.tilt * t,
    turn: look.spin + (SPIN + base.turn) * t,
    scale: (1 + (auto - 1) * t) * look.zoom,
    roll: rollOf(look.roll),
  };
}

// ── 화면에 넣는 모습: 내 자세 ↔ 처음 모습 (spec 17-18) ─────────
/**
 * 지금 화면에 넣을 모습 { roll, zoom }.
 * on(보기 조작이 켜짐: 답한 뒤)이고 조금이라도 접혀 있으면(t > 0) 학생 보기 그대로 — 접는 정도에 따라 줄이지 않는다.
 * 답하기 전이거나 다 편 전개도(t = 0)면 처음 모습(더 돌린 것 없음, 배율 1).
 */
export function lookFor(t, on, view) {
  return on && t > 1e-6 ? { roll: [...view.roll], zoom: view.zoom } : { roll: [...NO_ROLL], zoom: 1 };
}

/** 두 회전 사이의 각도(도, 0~180) */
export function rollGap(a, b) {
  const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return deg(2 * Math.acos(clamp(d, 0, 1)));
}

/** 두 모습이 같은가(회전 0.001° · 배율 0.0001 안) */
export const sameLook = (a, b) => rollGap(a.roll, b.roll) < 1e-3 && Math.abs(a.zoom - b.zoom) < 1e-4;

/**
 * 모습 a에서 b 쪽으로 f(0~1)만큼 다가간 모습. 회전은 둘 사이의 가까운 길을 따라 같은 빠르기로(구면 보간), 배율은 같은 비율로.
 * 잇는 움직임은 프레임마다 "지금 화면의 모습"에서 "지금의 목표"로 다가간다 — 움직이는 도중에 학생이 더 돌려 목표가 바뀌어도
 * 한 프레임에 가는 거리는 남은 거리의 f를 넘지 않아 튀지 않고, f = 1이면 딱 목표가 된다.
 */
export function lookToward(a, b, f) {
  if (!(f > 0)) return { roll: [...a.roll], zoom: a.zoom };
  if (f >= 1) return { roll: [...b.roll], zoom: b.zoom };
  let d = a.roll[0] * b.roll[0] + a.roll[1] * b.roll[1] + a.roll[2] * b.roll[2] + a.roll[3] * b.roll[3];
  const sign = d < 0 ? -1 : 1; // 같은 자세를 나타내는 둘 가운데 가까운 쪽으로
  d = Math.min(1, Math.abs(d));
  const theta = Math.acos(d);
  const s = Math.sin(theta);
  const [wa, wb] = s < 1e-6 ? [1 - f, f] : [Math.sin((1 - f) * theta) / s, Math.sin(f * theta) / s];
  return {
    roll: quatTidy(a.roll.map((v, i) => wa * v + wb * sign * b.roll[i])),
    zoom: a.zoom * (b.zoom / a.zoom) ** f,
  };
}

/**
 * 잇는 움직임이 p0에서 p1(지난 시간 ÷ MIX_MS, 0~1)로 갔을 때, 남은 거리 가운데 이번 프레임에 갈 비율.
 * 목표가 그대로면 같은 빠르기로 움직여(프레임마다 처음 거리 × (p1 − p0)) p = 1에서 딱 닿는다.
 */
export const mixStep = (p0, p1) => (p1 >= 1 ? 1 : clamp((p1 - p0) / (1 - p0), 0, 1));

/** 무대 값(sceneAt) → 모델 방향을 화면 방향으로 옮기는 3×3 행렬: rotate3d(roll) · rotateX(tilt) · rotateZ(turn) */
export function poseOf(scene) {
  const base = multiply3(rotationMatrix([1, 0, 0], scene.tilt), rotationMatrix([0, 0, 1], scene.turn));
  const roll = scene.roll;
  return roll && Math.abs(roll.angle) > 1e-9 ? multiply3(rotationMatrix(roll.axis, roll.angle), base) : base;
}

/** 다 접었을 때의 자세 */
export const foldedPose = (base, view) => poseOf(sceneAt(1, base, 1, view));

/** 더 못 가는 쪽(배율뿐 — 회전에는 한계가 없다): { zoomMax, zoomMin, home(처음 보기 그대로) } */
export function viewLimits(view) {
  return {
    zoomMax: view.zoom >= ZOOM_MAX - 1e-6,
    zoomMin: view.zoom <= ZOOM_MIN + 1e-6,
    home: isHome(view),
  };
}

// ── 돌리기 (버튼·키보드·끌기) ─────────────────────
/** 펼친 전개도를 평면에서 degrees만큼 돌린다 (답하기 전·다 편 상태의 좌우 돌리기: 지금처럼 세로축 둘레) */
export const turnBy = (view, degrees) => ({ ...view, spin: view.spin + degrees });

/** 화면 기준 축(x 오른쪽, y 아래, z 보는 사람 쪽) 둘레로 degrees만큼 더 돌린다. 한계 없이 쌓인다 */
export function rollBy(view, axis, degrees) {
  return { ...view, roll: quatTidy(quatMul(quatAbout(axis, degrees), view.roll)) };
}

/**
 * 버튼·방향키 한 단계: 누른 쪽 면을 더 보여 준다(화면 기준).
 * 'right'는 오른쪽 면이 앞으로, 'left'는 왼쪽 면이 앞으로(세로축 둘레 degrees), 'up'은 위쪽 면이 더 보이게, 'down'은 아래쪽 면이
 * 더 보이게(가로축 둘레 TILT_STEP). 같은 쪽으로 한 바퀴만큼 누르면 제자리로 온다
 */
export function stepView(view, dir, degrees = dir === 'left' || dir === 'right' ? TURN_BUTTON : TILT_STEP) {
  if (dir === 'right') return rollBy(view, [0, 1, 0], -degrees);
  if (dir === 'left') return rollBy(view, [0, 1, 0], degrees);
  if (dir === 'up') return rollBy(view, [1, 0, 0], -degrees);
  if (dir === 'down') return rollBy(view, [1, 0, 0], degrees);
  return view;
}

/** 크게(dir > 0)·작게(dir < 0) 다음 단계로. 벌리기·휠로 만든 사이 값에서는 가까운 다음 단계로 간다 */
export function stepZoom(view, dir) {
  const next = dir > 0
    ? ZOOM_STEPS.find((s) => s > view.zoom + 1e-6) ?? ZOOM_MAX
    : [...ZOOM_STEPS].reverse().find((s) => s < view.zoom - 1e-6) ?? ZOOM_MIN;
  return { ...view, zoom: next };
}

/**
 * 화면에서 (dx, dy)px 끌었을 때: 입체가 손을 따라 그 방향으로 구른다(공을 굴리듯). 끈 방향과 직각인 화면 위의 축 둘레로
 * 끈 길이 × DRAG_DEG만큼 — 가로·세로·대각선 어느 쪽이든, 한 바퀴를 넘어서도 계속 돈다.
 */
export function dragView(view, dx, dy) {
  const length = Math.hypot(dx, dy);
  if (!(length > 0)) return view;
  return rollBy(view, [-dy, dx, 0], length * DRAG_DEG);
}

/** 두 손가락 벌리기: 처음 배율 zoom0, 처음 손가락 사이 dist0 → 지금 dist */
export function pinchView(view, zoom0, dist0, dist) {
  if (!(dist0 > 0) || !(dist > 0)) return view;
  return { ...view, zoom: clamp(zoom0 * (dist / dist0), ZOOM_MIN, ZOOM_MAX) };
}

/** 휠: 위로 굴리면(deltaY < 0) 크게. ctrl: 터치패드 벌리기(Ctrl+휠), lines: 줄 단위 휠(deltaMode 1) */
export function wheelView(view, deltaY, { ctrl = false, lines = false } = {}) {
  if (!Number.isFinite(deltaY) || deltaY === 0) return view;
  const px = lines ? deltaY * WHEEL_LINE : deltaY;
  return { ...view, zoom: clamp(view.zoom * Math.exp(-px * (ctrl ? PINCH_WHEEL_ZOOM : WHEEL_ZOOM)), ZOOM_MIN, ZOOM_MAX) };
}

// ── 보는 방향으로 돌린 벡터 · 빛 ─────────────────
/** CSS의 rotateX(tilt) rotateZ(turn)을 벡터에 적용한다 (z > 0이면 보는 사람 쪽). 처음 보기를 고를 때(displayNet) 쓴다 */
export function viewDir(v, tiltDeg, turnDeg) {
  const b = rad(turnDeg);
  const a = rad(tiltDeg);
  const z1 = [v[0] * Math.cos(b) - v[1] * Math.sin(b), v[0] * Math.sin(b) + v[1] * Math.cos(b), v[2]];
  return [z1[0], z1[1] * Math.cos(a) - z1[2] * Math.sin(a), z1[1] * Math.sin(a) + z1[2] * Math.cos(a)];
}

/** 면의 그늘 0(밝음)~0.34(어두움): 면의 바깥 법선을 지금 자세(pose)로 돌려 화면에 고정된 빛과 견준다 */
export function shadeOf(normal, pose) {
  return SHADE_MAX * (1 - clamp(dot(normalize(turnVector(pose, normal)), LIGHT), 0, 1));
}

/** 그 방향(법선)을 향한 자리가 지금 자세에서 보는 사람 쪽을 향하나 ("돌려 보면 빈 자리가 보여요" 조건) */
export const facesViewer = (normal, pose, min = 0.05) => turnVector(pose, normal)[2] >= min;

// ── 뒷면(종이 안쪽) · 글자 바로 세우기 ─────────────
/** 눈 위치(px, 무대 가운데 기준): CSS perspective·perspective-origin과 같은 자리 */
export const eyeOf = (stageHeight) => [0, -EYE_RISE * stageHeight, PERSPECTIVE];

/**
 * 종이 안쪽(뒷면)이 보이는 면인가. 원근(눈 위치)을 넣어 판정한다.
 * normal: 면의 바깥 법선(모델 좌표), point: 면 가운데(무대 가운데 기준 px — 배율을 곱한 모델 좌표), eye: eyeOf()
 */
export function isBackFacing(normal, point, pose, eye) {
  const n = turnVector(pose, normal);
  const p = turnVector(pose, point);
  return dot(n, [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]]) > 1e-9;
}

/**
 * 면 안의 글자를 지금 자세에서 바로 읽히게 돌릴 각도(90° 단위, CSS rotate).
 * right·down: 면의 '오른쪽'·'아래' 방향(모델 좌표). 글자를 θ만큼 돌리면 글자의 '아래'는 면 위에서 (−sin θ) × right + (cos θ) × down을 향한다.
 * 네 방향 가운데 화면 아래를 가장 향하는 것을 고른다 — 면 위에서 재면 늘 ±45° 안이고, 비스듬히 보이는 면에서도 거꾸로 서지 않는다.
 * 종이 안쪽이 보이는 면은 글자를 좌우로 뒤집지만(scaleX(-1)) 글자의 '아래'는 그대로라 같은 각도를 쓴다.
 */
export function uprightTurn(right, down, pose) {
  const r = turnVector(pose, right)[1]; // 화면 아래쪽(+y)으로 향한 정도
  const d = turnVector(pose, down)[1];
  let best = 0;
  let score = d;
  for (const [degrees, value] of [[90, -r], [180, -d], [270, r]]) {
    if (value > score + 1e-9) {
      best = degrees;
      score = value;
    }
  }
  return best;
}

// ── 보는 방향·크기를 말로 (화면 읽기 알림) ─────────
export const TILT_WORDS = [
  '위에서 본 모습이에요.',
  '비스듬히 위에서 본 모습이에요.',
  '옆에서 본 모습이에요.',
  '비스듬히 아래에서 본 모습이에요.',
  '아래에서 본 모습이에요.',
];

/**
 * 접은 입체를 어느 높이에서 보고 있나(도): 입체의 위쪽(모델 +z, 바닥 면의 반대쪽)이 보는 사람을 똑바로 향하면 0(위에서),
 * 옆을 향하면 90(옆에서), 반대쪽을 향하면 180(아래에서). 입체가 화면에서 어느 쪽으로 누워 있든(굴린 자세) 맞는 말이 되게,
 * 화면에서의 기울기가 아니라 입체의 위쪽이 눈을 향한 정도로 잰다.
 */
export const elevationOf = (pose) => deg(Math.acos(clamp(turnVector(pose, [0, 0, 1])[2], -1, 1)));

/** 높이 구간 0~4: 0~20 위 · 20~70 비스듬히 위 · 70~110 옆 · 110~160 비스듬히 아래 · 160~180 아래 */
export function tiltZone(elevation) {
  if (elevation < 20) return 0;
  if (elevation < 70) return 1;
  if (elevation <= 110) return 2;
  if (elevation <= 160) return 3;
  return 4;
}
export const tiltWord = (elevation) => TILT_WORDS[tiltZone(elevation)];

export function zoomWord(zoom) {
  if (Math.abs(zoom - 1) < 0.005) return '처음 크기예요.';
  const n = String(Math.round(zoom * 100) / 100);
  return zoom > 1 ? `${n}배로 크게 보여요.` : `${n}배로 작게 보여요.`;
}
export const HOME_WORD = '처음 보기로 돌아왔어요.';
