/**
 * 접은 입체를 보는 방향과 크기 (순수 함수, 화면과 무관). spec 17절
 *
 * 무대 변환은 CSS `scale3d(s) rotateX(tilt) rotateZ(turn)`이다. 화면 좌표는 x 오른쪽, y 아래, z 보는 사람 쪽.
 *   tilt  0° 바로 위에서 · 90° 옆에서 · 180° 바로 아래에서 (그 너머로 넘어가지 않아 위아래가 뒤집히지 않는다)
 *   turn  세로축 둘레로 돌린 각도 (한계 없음)
 * 학생이 바꾸는 보기 값(view): { spin(가로로 더 돌린 각도), lift(처음 기울기에서 더 기울인 각도), zoom(배율, 처음 1) }
 * 처음 보기(base): displayNet이 고른 { tilt, turn }. 자동 맞춤 배율(auto)은 무대 크기로 정한다.
 * 펼친 전개도(t = 0)에서는 lift·zoom이 0으로 곱해져 늘 위에서 본 처음 크기다 — 답하기 전 화면이 문항·조작과 무관하게 같다.
 */
import { dot, normalize } from './geometry.js';

export const TILT = 56; // 다 접었을 때 처음 기울기(도): 위쪽이 멀어져 비스듬히 내려다본다
export const SPIN = -28; // 다 접었을 때 처음 돌린 각도(도): 옆면 두 개가 보이게
export const TILT_MIN = 0; // 바로 위에서
export const TILT_MAX = 180; // 바로 아래에서 (밑면까지 본다)
export const TILT_STEP = 15; // 위·아래 버튼과 ↑↓ 키의 눈금(도)
export const TURN_KEY = 15; // ← → 키 한 번(도)
export const TURN_BUTTON = 30; // 왼쪽·오른쪽 버튼 한 번(도)
export const ZOOM_STEPS = [0.5, 0.64, 0.8, 1, 1.25, 1.6, 2]; // 크게·작게 버튼과 + − 키의 단계
export const ZOOM_MIN = ZOOM_STEPS[0];
export const ZOOM_MAX = ZOOM_STEPS[ZOOM_STEPS.length - 1];
export const BLEND_AT = 0.25; // 이만큼 접히면 학생 보기(lift·zoom)가 다 적용된다
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
export const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));

// ── 보기 값 ──────────────────────────────
export const homeView = () => ({ spin: 0, lift: 0, zoom: 1 });
export const isHome = (view) => Math.abs(view.spin) < 1e-6 && Math.abs(view.lift) < 1e-6 && Math.abs(view.zoom - 1) < 1e-6;

/** 다 접었을 때의 기울기(도) */
export const tiltOf = (base, view) => clamp(base.tilt + view.lift, TILT_MIN, TILT_MAX);

/**
 * 접는 정도 t(0~1)일 때 무대에 넣을 값 { tilt, turn, scale }.
 * 학생 보기(lift·zoom)는 펼친 상태에서 0, BLEND_AT만큼 접히면 다 적용된다 — [펴기]를 누르면 위에서 본 전개도로 매끄럽게 돌아가고,
 * 다시 접으면 보던 방향으로 돌아온다. 가로 돌림(spin)은 지금처럼 펼친 전개도도 평면에서 돌린다.
 */
export function sceneAt(t, base, auto, view) {
  const k = Math.min(1, t / BLEND_AT);
  return {
    tilt: clamp(base.tilt * t + view.lift * k, TILT_MIN, TILT_MAX),
    turn: view.spin + (SPIN + base.turn) * t,
    scale: (1 + (auto - 1) * t) * (1 + (view.zoom - 1) * k),
  };
}

/** 더 못 가는 쪽: { atTop(바로 위), atBottom(바로 아래), zoomMax, zoomMin, home(처음 보기 그대로) } */
export function viewLimits(view, base) {
  const tilt = tiltOf(base, view);
  return {
    atTop: tilt <= TILT_MIN + 1e-6,
    atBottom: tilt >= TILT_MAX - 1e-6,
    zoomMax: view.zoom >= ZOOM_MAX - 1e-6,
    zoomMin: view.zoom <= ZOOM_MIN + 1e-6,
    home: isHome(view),
  };
}

// ── 한 단계 (버튼·키보드) ─────────────────────
/** 가로로 deg만큼 (양수: 오른쪽 면이 앞으로) */
export const turnBy = (view, deg) => ({ ...view, spin: view.spin + deg });

/** 위쪽(dir < 0: 윗면이 더 보이게)·아래쪽(dir > 0: 아랫면 쪽으로)으로 15° 눈금까지. 0·90·180에 딱 닿는다 */
export function stepTilt(view, base, dir) {
  const now = tiltOf(base, view);
  const next = dir < 0
    ? Math.ceil(now / TILT_STEP - 1e-6) * TILT_STEP - TILT_STEP
    : Math.floor(now / TILT_STEP + 1e-6) * TILT_STEP + TILT_STEP;
  return { ...view, lift: clamp(next, TILT_MIN, TILT_MAX) - base.tilt };
}

/** 크게(dir > 0)·작게(dir < 0) 다음 단계로. 벌리기·휠로 만든 사이 값에서는 가까운 다음 단계로 간다 */
export function stepZoom(view, dir) {
  const next = dir > 0
    ? ZOOM_STEPS.find((s) => s > view.zoom + 1e-6) ?? ZOOM_MAX
    : [...ZOOM_STEPS].reverse().find((s) => s < view.zoom - 1e-6) ?? ZOOM_MIN;
  return { ...view, zoom: next };
}

// ── 끌기 · 벌리기 · 휠 ───────────────────────
/**
 * 화면에서 (dx, dy)px 끌었을 때. 잡은 면이 손을 따라온다: 오른쪽으로 끌면 앞면이 오른쪽으로, 아래로 끌면 윗면이 더 보인다.
 * 기울기는 0~180°에서 멈춘다(그 안에서는 좌우 끌기 방향이 늘 같다).
 */
export function dragView(view, base, dx, dy) {
  return {
    ...view,
    spin: view.spin - dx * DRAG_DEG,
    lift: clamp(base.tilt + view.lift - dy * DRAG_DEG, TILT_MIN, TILT_MAX) - base.tilt,
  };
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
/** CSS의 rotateX(tilt) rotateZ(turn)을 벡터에 적용한다 (z > 0이면 보는 사람 쪽) */
export function viewDir(v, tiltDeg, turnDeg) {
  const b = rad(turnDeg);
  const a = rad(tiltDeg);
  const z1 = [v[0] * Math.cos(b) - v[1] * Math.sin(b), v[0] * Math.sin(b) + v[1] * Math.cos(b), v[2]];
  return [z1[0], z1[1] * Math.cos(a) - z1[2] * Math.sin(a), z1[1] * Math.sin(a) + z1[2] * Math.cos(a)];
}

/** 면의 그늘 0(밝음)~0.34(어두움): 면의 바깥 법선을 지금 보기로 돌려 화면에 고정된 빛과 견준다 */
export function shadeOf(normal, tilt, turn) {
  return SHADE_MAX * (1 - clamp(dot(normalize(viewDir(normal, tilt, turn)), LIGHT), 0, 1));
}

/** 그 방향(법선)을 향한 자리가 지금 보기에서 보는 사람 쪽을 향하나 ("돌려 보면 빈 자리가 보여요" 조건) */
export const facesViewer = (normal, tilt, turn, min = 0.05) => viewDir(normal, tilt, turn)[2] >= min;

// ── 뒷면(종이 안쪽) · 글자 바로 세우기 ─────────────
/** 눈 위치(px, 무대 가운데 기준): CSS perspective·perspective-origin과 같은 자리 */
export const eyeOf = (stageHeight) => [0, -EYE_RISE * stageHeight, PERSPECTIVE];

/**
 * 종이 안쪽(뒷면)이 보이는 면인가. 원근(눈 위치)을 넣어 판정한다.
 * normal: 면의 바깥 법선(모델 좌표), point: 면 가운데(무대 가운데 기준 px — 배율을 곱한 모델 좌표), eye: eyeOf()
 */
export function isBackFacing(normal, point, tilt, turn, eye) {
  const n = viewDir(normal, tilt, turn);
  const p = viewDir(point, tilt, turn);
  return dot(n, [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]]) > 1e-9;
}

/**
 * 면 안의 글자를 지금 보기에서 바로 읽히게 돌릴 각도(90° 단위, CSS rotate).
 * right·down: 면의 '오른쪽'·'아래' 방향(모델 좌표). 글자를 θ만큼 돌리면 글자의 '아래'는 면 위에서 (−sin θ) × right + (cos θ) × down을 향한다.
 * 네 방향 가운데 화면 아래를 가장 향하는 것을 고른다 — 면 위에서 재면 늘 ±45° 안이고, 비스듬히 보이는 면에서도 거꾸로 서지 않는다.
 * 종이 안쪽이 보이는 면은 글자를 좌우로 뒤집지만(scaleX(-1)) 글자의 '아래'는 그대로라 같은 각도를 쓴다.
 */
export function uprightTurn(right, down, tilt, turn) {
  const r = viewDir(right, tilt, turn)[1]; // 화면 아래쪽(+y)으로 향한 정도
  const d = viewDir(down, tilt, turn)[1];
  let best = 0;
  let score = d;
  for (const [deg, value] of [[90, -r], [180, -d], [270, r]]) {
    if (value > score + 1e-9) {
      best = deg;
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

/** 기울기 구간 0~4: 0~20 위 · 20~70 비스듬히 위 · 70~110 옆 · 110~160 비스듬히 아래 · 160~180 아래 */
export function tiltZone(tilt) {
  if (tilt < 20) return 0;
  if (tilt < 70) return 1;
  if (tilt <= 110) return 2;
  if (tilt <= 160) return 3;
  return 4;
}
export const tiltWord = (tilt) => TILT_WORDS[tiltZone(tilt)];

export function zoomWord(zoom) {
  if (Math.abs(zoom - 1) < 0.005) return '처음 크기예요.';
  const n = String(Math.round(zoom * 100) / 100);
  return zoom > 1 ? `${n}배로 크게 보여요.` : `${n}배로 작게 보여요.`;
}
export const HOME_WORD = '처음 보기로 돌아왔어요.';
