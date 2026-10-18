/**
 * 쌓기나무 판을 보는 방향: 돌림판식 (순수 함수, 화면과 무관). 기획서: spec-grade6.md 15-18·15-19, plan-rotate-free.md 4절
 *
 * 알지오매스와 같은 방식이다(사용자 결정 15-19). 판은 돌림판 위에 놓인 것처럼만 돈다:
 *   가로 끌기 = 판이 제 세로축 둘레로 제자리에서 끝없이 돈다(yaw), 세로 끌기 = 내려다보는 높이만 바뀐다(pitch, 수평 0° ~ 바로 위 90°).
 *   화면의 오른쪽 방향은 늘 판과 나란하다(높이 성분 0) — 쌓기나무의 세로 모서리가 화면에서 늘 곧게 서고, 판이 옆으로 기울지 않는다.
 *   돌기의 중심은 늘 판 가운데다(누른 곳과 무관 — 결정 1). 판 아래로는 가지 않는다(결정 2).
 * 전개도 입체(5학년 정육면체·직육면체, 6학년 각기둥)는 이 모듈을 쓰지 않는다 — 그쪽은 orbit.js의 화면 기준 돌리기 그대로다(15-18).
 * 끌기 1px = 0.5°(DRAG_DEG), 크게·작게 단계는 orbit.js의 값을 그대로 쓴다(common-rules 4절).
 *
 * 보기 값(view): { yaw(판을 돌린 각도, 도, 0 이상 360 미만), pitch(내려다보는 높이, 도, 0~90), zoom(배율, 처음 1) }
 *   yaw 0 = 앞에서, 90 = 옆(오른쪽)에서, 180 = 뒤에서, 270 = 왼쪽에서 본다. pitch 0 = 옆에서(수평), 90 = 바로 위에서.
 * 자세(pose): 모델 방향 → 화면 방향 3×3 행렬(행 우선). 1행 = 화면 오른쪽, 2행 = 화면 아래, 3행 = 보는 사람 쪽(block-view.js와 같다).
 *   모델은 x 오른쪽(칸), y 뒤쪽(줄), z 위쪽(층).
 *   화면 오른쪽 = [cos yaw, sin yaw, 0] · 보는 사람 쪽 = [sin yaw · cos pitch, −cos yaw · cos pitch, sin pitch] · 화면 아래 = 오른쪽 × 보는 사람 쪽
 */
import { DRAG_DEG, ZOOM_MAX, ZOOM_MIN, clamp } from '../orbit.js';

export const PITCH_MIN = 0; // 옆에서(수평) — 판 아래로는 가지 않는다
export const PITCH_MAX = 90; // 바로 위에서
export const YAW_BUTTON = 45; // 조작판 [왼쪽으로][오른쪽으로] 한 번: 앞·비스듬히·옆·… 여덟 방향 눈금에 멈춘다
export const YAW_KEY = 15; // ← → 키 한 번(눈금)
export const PITCH_STEP = 15; // 조작판 [위쪽으로][아래쪽으로]와 ↑ ↓ 키 한 번(눈금)

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

/** 처음 보기의 높이: 앞·오른쪽·위가 같은 비율로 보이는 교과서 입체 그림의 방향(35.26°) */
const HOME_PITCH = deg(Math.asin(1 / Math.sqrt(3)));

/** yaw를 0 이상 360 미만으로 */
export function normYaw(yaw) {
  let y = yaw % 360; // 0~360 안의 값은 그대로(소수 끝자리도 바뀌지 않는다)
  if (y < 0) y += 360;
  return y >= 360 ? 0 : y + 0; // + 0: −0을 0으로
}

// ── 정해진 자세 ───────────────────────────
const R2 = Math.SQRT1_2;
const R3 = 1 / Math.sqrt(3);
const R6 = 1 / Math.sqrt(6);
/**
 * 정해진 자세의 행렬(교과서 그림·2D 그림과 같은 모습 — 값을 정해 둔다).
 * home: 교과서 입체 그림의 방향(앞이 왼쪽 아래, 옆이 오른쪽 아래 — 눈이 앞·오른쪽·위에 있다)
 * top: 위에서(앞이 아래, 옆이 오른쪽) · front: 앞에서 · side: 옆(오른쪽)에서 · back: 뒤에서 · left: 왼쪽에서
 * behind: 처음 보기의 맞은편(뒤·왼쪽·위)에서 비스듬히 — 그림에서 가려져 있던 쪽이 보인다
 */
export const POSES = Object.freeze({
  home: [R2, R2, 0, R6, -R6, -2 * R6, R3, -R3, R3],
  top: [1, 0, 0, 0, -1, 0, 0, 0, 1],
  front: [1, 0, 0, 0, 0, -1, 0, -1, 0],
  side: [0, 1, 0, 0, 0, -1, 1, 0, 0],
  back: [-1, 0, 0, 0, 0, -1, 0, 1, 0],
  left: [0, -1, 0, 0, 0, -1, -1, 0, 0],
  behind: [-R2, -R2, 0, -R6, R6, -2 * R6, -R3, R3, R3],
});

/** 정해진 자세를 돌림판 각도로: 모두 돌림판으로 갈 수 있는 자세다(판이 기울지 않고, 0~90° 안) */
export const SNAP = Object.freeze({
  home: Object.freeze({ yaw: 45, pitch: HOME_PITCH }),
  top: Object.freeze({ yaw: 0, pitch: 90 }),
  front: Object.freeze({ yaw: 0, pitch: 0 }),
  side: Object.freeze({ yaw: 90, pitch: 0 }),
  back: Object.freeze({ yaw: 180, pitch: 0 }),
  left: Object.freeze({ yaw: 270, pitch: 0 }),
  behind: Object.freeze({ yaw: 225, pitch: HOME_PITCH }),
});

// ── 자세 ─────────────────────────────────
/** (yaw, pitch) → 자세 행렬 (계산) */
export function poseAt(yaw, pitch) {
  const cy = Math.cos(rad(yaw));
  const sy = Math.sin(rad(yaw));
  const cp = Math.cos(rad(pitch));
  const sp = Math.sin(rad(pitch));
  const right = [cy, sy, 0];
  const v = [sy * cp, -cy * cp, sp];
  const down = [right[1] * v[2] - right[2] * v[1], right[2] * v[0] - right[0] * v[2], right[0] * v[1] - right[1] * v[0]];
  return [...right, ...down, ...v];
}

const NEAR = 1e-9;
const yawGap = (a, b) => Math.abs(((b - a + 540) % 360) - 180);
/** 보기 값 → 자세 행렬. 정해진 자세(처음 보기·[위][앞][옆] …)에 있으면 정해 둔 행렬 그대로(계산과 1e-12 안에서 같다 — 검사로 고정) */
export function poseOf(turn) {
  for (const [name, at] of Object.entries(SNAP)) {
    if (yawGap(turn.yaw, at.yaw) < NEAR && Math.abs(turn.pitch - at.pitch) < NEAR) return [...POSES[name]];
  }
  return poseAt(turn.yaw, turn.pitch);
}

// ── 보기 값 ──────────────────────────────
export const homeTurn = () => ({ yaw: SNAP.home.yaw, pitch: SNAP.home.pitch, zoom: 1 });
/** 그 방향의 자세로(배율은 그대로) */
export const snapTurn = (view, name) => ({ ...view, yaw: SNAP[name].yaw, pitch: SNAP[name].pitch });
export const isHomeTurn = (view) => yawGap(view.yaw, SNAP.home.yaw) < 1e-6 && Math.abs(view.pitch - SNAP.home.pitch) < 1e-6 && Math.abs(view.zoom - 1) < 1e-6;

/** 두 보기가 같은가(각도 0.001° · 배율 0.0001 안) */
export const sameTurn = (a, b) => yawGap(a.yaw, b.yaw) < 1e-3 && Math.abs(a.pitch - b.pitch) < 1e-3 && Math.abs(a.zoom - b.zoom) < 1e-4;

/** 더 못 가는 쪽: { up(바로 위), down(수평), zoomMax, zoomMin, home(처음 보기 그대로) }. 판 돌리기(yaw)에는 한계가 없다 */
export function turnLimits(view) {
  return {
    up: view.pitch >= PITCH_MAX - 1e-6,
    down: view.pitch <= PITCH_MIN + 1e-6,
    zoomMax: view.zoom >= ZOOM_MAX - 1e-6,
    zoomMin: view.zoom <= ZOOM_MIN + 1e-6,
    home: isHomeTurn(view),
  };
}

// ── 돌리기 (끌기·버튼·키보드) ─────────────────
/**
 * 화면에서 (dx, dy)px 끌었을 때: 가로 몫은 판 돌리기 — 오른쪽으로 끌면 판의 앞쪽이 오른쪽으로 간다(끝없이),
 * 세로 몫은 내려다보는 높이 — 아래로 끌면 위가 더 보인다(수평 ~ 바로 위에서 멈춘다). 비스듬히 끌어도 두 몫을 따로 적용해 판은 늘 수평이다
 */
export function dragTurn(view, dx, dy) {
  return {
    ...view,
    yaw: normYaw(view.yaw - (Number(dx) || 0) * DRAG_DEG),
    pitch: clamp(view.pitch + (Number(dy) || 0) * DRAG_DEG, PITCH_MIN, PITCH_MAX),
  };
}

/** step의 배수 가운데 value보다 한 칸 큰(sign > 0)·작은(sign < 0) 눈금. 끌다 만 각도에서는 그쪽의 다음 눈금으로 */
function nextMark(value, step, sign) {
  return sign > 0 ? (Math.floor(value / step + 1e-6) + 1) * step : (Math.ceil(value / step - 1e-6) - 1) * step;
}

/**
 * 버튼·방향키 한 단계(눈금에 멈춘다). 'right'는 판의 오른쪽 면이 앞으로(오른쪽에서 보는 쪽으로), 'left'는 왼쪽 면이 앞으로,
 * 'up'은 위가 더 보이게(바로 위까지), 'down'은 옆에서 보는 쪽으로(수평까지). 한도에 닿아 있으면 그대로
 */
export function stepTurn(view, dir, step = dir === 'left' || dir === 'right' ? YAW_BUTTON : PITCH_STEP) {
  if (dir === 'right') return { ...view, yaw: normYaw(nextMark(view.yaw, step, 1)) };
  if (dir === 'left') return { ...view, yaw: normYaw(nextMark(view.yaw, step, -1)) };
  if (dir === 'up') return { ...view, pitch: clamp(nextMark(view.pitch, step, 1), PITCH_MIN, PITCH_MAX) };
  if (dir === 'down') return { ...view, pitch: clamp(nextMark(view.pitch, step, -1), PITCH_MIN, PITCH_MAX) };
  return view;
}

/**
 * 모습 a에서 b 쪽으로 f(0~1)만큼 다가간 모습: 판 돌리기는 가까운 쪽으로, 높이는 곧게, 배율은 같은 비율로.
 * 도는 도중에도 판이 기울지 않는다(예: [앞] → [뒤]는 판이 제자리에서 반 바퀴). f = 1이면 딱 b
 */
export function turnToward(a, b, f) {
  if (!(f > 0)) return { yaw: a.yaw, pitch: a.pitch, zoom: a.zoom };
  if (f >= 1) return { yaw: b.yaw, pitch: b.pitch, zoom: b.zoom };
  const gap = ((b.yaw - a.yaw + 540) % 360) - 180; // −180 ~ 180: 가까운 쪽
  return {
    yaw: normYaw(a.yaw + gap * f),
    pitch: a.pitch + (b.pitch - a.pitch) * f,
    zoom: a.zoom * (b.zoom / a.zoom) ** f,
  };
}
