/**
 * 쌓기나무 무대와 멈춘 그림 (직접 투영 SVG). 기획서: spec-grade6.md 3절·6-1절
 *
 * 그리기: 원근 없는 투영(평행 투영). 쌓기나무의 면을 <polygon>으로, 눈에서 먼 것부터 차례로 그린다(blocks.js paintOrder) —
 *   브라우저의 3D 정렬에 기대지 않아 깊이 순서가 늘 맞고, 면이 2D 다각형이라 누른 곳의 판정이 정확하다.
 *   [위] [앞] [옆]으로 돌리면 화면의 쌓기나무가 2D 그림과 똑같은 네모들로 보인다.
 *   자유 쌓기 판만 원근이 있다(persp — 사용자 결정 15-27·15-28 "A 약하게": 눈이 판 가운데에서 판의 긴 변 × 3칸 떨어져 있다. 넓은 판의 먼 쪽이
 *   작아 보여 정사각형 판이 평행사변형으로 보이지 않는다). 면·차례는 눈의 자리에서 정하고(blocks.js visibleFacesFrom), 누른 곳은 지금처럼
 *   그 자리의 <polygon>이라 원근에서도 누른 칸 = 쌓이는 칸이다. 바로 위·앞·옆 가까이에서는 원근이 줄어 그 자세에서는 2D 그림과 같은 네모다.
 * 보기 값: 돌림판식(turn-view.js — spec-grade6 15-19, 알지오매스와 같은 방식) { yaw(판 돌림), pitch(내려다보는 높이), zoom }.
 *   가로로 끌면 판이 제 세로축 둘레로 돌고, 세로로 끌면 내려다보는 높이만 바뀐다(수평 ~ 바로 위). 판은 화면에서 기울지 않는다.
 *   끌기 1px = 0.4°(turn-view.js — 전개도 입체의 0.5°보다 약 20% 느리게, 15-27). 문턱 8px·관성 없음과 크게·작게(벌리기·휠·단계)는
 *   전개도 무대와 같은 orbit.js의 값·함수를 그대로 쓴다.
 *   처음 보기는 교과서 입체 그림의 방향(앞이 왼쪽 아래, 옆이 오른쪽 아래)이다.
 * 좌표: 모델은 x 오른쪽(칸), y 뒤쪽(줄), z 위쪽(층). 화면은 x 오른쪽, y 아래, z 보는 사람 쪽(orbit.js와 같다).
 *
 * 누르기와 끌기 (3-3절): 누른 곳에서 8px(DRAG_START) 넘게 움직이면 돌리기, 그 전에 떼면 누르기(쌓기·빼기).
 *   돌리기가 시작되면 점선 쌓기나무는 사라지고 아무것도 놓이지 않는다. 끄는 동안의 touchmove는 "썼다"고 알려(preventDefault)
 *   브라우저가 관성 스크롤을 시작하지 않게 한다(끈 직후의 첫 탭이 먹히게 — docs/engine.md 4절).
 * still(멈춘 그림): 조작이 없고, 교과서 방향에서 한 조각이라도 보이는 면만 그린다(숨겨진 쌓기나무는 DOM에도 없다).
 */
import { josa } from '../../../shared/core/korean.js';
import { icon } from '../../../shared/ui/icons.js';
import { DRAG_START, HOME_WORD, MIX_MS, clamp, mixStep, pinchView, stepZoom, wheelView, zoomWord } from '../orbit.js';
import {
  PITCH_STEP,
  POSES,
  SNAP,
  YAW_BUTTON,
  YAW_KEY,
  dragTurn,
  homeTurn,
  isHomeTurn,
  perspWeight,
  poseOf,
  sameTurn,
  snapTurn,
  stepTurn,
  turnLimits,
  turnToward,
} from './turn-view.js';
import { COLS, FACE_NORMALS, MAX_H, ROWS, count, picturedFaces, targetOf, visibleFaces, visibleFacesFrom } from './blocks.js';

const NS = 'http://www.w3.org/2000/svg';

export function svgEl(tag, attrs = {}, ...children) {
  const el = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    el.setAttribute(key, String(value));
  }
  for (const child of children.flat()) if (child) el.append(child);
  return el;
}

export const prefersReducedMotion = () => Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

// ── 자세 (순수) ───────────────────────────
/**
 * 모델 방향 → 화면 방향 3×3 행렬(행 우선): 1행 = 화면 오른쪽, 2행 = 화면 아래, 3행 = 보는 사람 쪽.
 * 정해진 자세(POSES — home·top·front·side·back·left·behind)와 돌림판 보기 값 → 자세(poseOf)는 turn-view.js에 있다.
 */
export { POSES };

/** 보는 사람 쪽 방향(모델 좌표) */
export const toViewerOf = (pose) => [pose[6], pose[7], pose[8]];

// ── 도형 (순수) ───────────────────────────
const FACE_CORNERS = {
  top: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
  bottom: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]],
  front: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
  back: [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]],
  left: [[0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1]],
  right: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]],
};
/** 층별로 벌려 놓을 때 층 사이의 틈(쌓기나무 한 변 = 1)과, 그때 무대에 들어오게 줄이는 배율 */
export const APART_GAP = 0.7;
const APART_FIT = 0.86;
/** 두 손가락 사이가 이만큼(비율) 바뀌면 벌리기 — 판 옮기기가 켜져 있을 때 함께 끌기와 가른다 */
const PINCH_START = 0.12;
/** Shift+방향키 → 그쪽을 보기 [x, y] (판 옮기기) */
const PAN_KEYS = Object.freeze({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] });
/** 층별 개수 글자 사이의 가장 좁은 세로 간격(px — 칩 높이 26 + 틈 2) */
const CHIP_STEP = 28;
/** 무대 위 글자 칩의 너비(px) — 글자 수로 어림한다 */
const chipWidth = (text) => Math.max(30, [...text].length * 15 + 14);
/** 벌려 놓은 z층이 뜨는 높이:가운데 층(mid — 차시는 3층 판의 2층, 자유 쌓기는 쌓은 층들의 가운데)은 그대로, 아래층은 내려가고 위층은 올라간다 */
const liftOf = (z, apart, mid = (MAX_H - 1) / 2) => (apart ? (z - mid) * APART_GAP : 0);

/**
 * 그릴 것들(그리는 순서대로): 판의 자리(tile)와 쌓기나무의 면(face). 점은 모델 좌표.
 * 위에서 보면 판을 먼저(쌓기나무 밑에), 아래에서 보면 판을 맨 나중에(쌓기나무를 가린다 — 무대는 반투명하게 그린다).
 * still이면 교과서 방향의 그림에 보이는 면만. eye(모델 좌표의 점)를 주면 원근 — 그 점에서 보이는 면을 그 점에서 먼 것부터(자유 쌓기).
 * → [{ kind: 'tile', x, y, pts } | { kind: 'face', x, y, z, face, pts }]
 */
export function sceneShapes(map, pose, { apart = false, board = true, still = false, mid, eye = null } = {}) {
  const d = toViewerOf(pose);
  const tiles = [];
  if (board) {
    // 판의 칸 수 = 높이 지도의 크기(차시 3×3, 자유 쌓기 14×14·6×6)
    const rows = map.length;
    const cols = map[0]?.length ?? 0;
    for (let y = 0; y < rows; y += 1) for (let x = 0; x < cols; x += 1) tiles.push({ kind: 'tile', x, y, pts: FACE_CORNERS.bottom.map(([dx, dy]) => [x + dx, y + dy, liftOf(0, apart, mid)]) });
  }
  let faces = eye ? visibleFacesFrom(map, eye, { apart, zAt: (z) => z + liftOf(z, apart, mid) }) : visibleFaces(map, d, { apart });
  if (still) {
    const pictured = new Set(picturedFaces(map).map((f) => `${f.x},${f.y},${f.z},${f.face}`));
    faces = faces.filter((f) => pictured.has(`${f.x},${f.y},${f.z},${f.face}`));
  }
  const shapes = faces.map((f) => {
    const lift = liftOf(f.z, apart, mid);
    return { kind: 'face', ...f, pts: FACE_CORNERS[f.face].map(([dx, dy, dz]) => [f.x + dx, f.y + dy, f.z + dz + lift]) };
  });
  // 판은 쌓기나무 밑에(위에서 볼 때 먼저). 원근이면 눈이 판보다 위에 있는가로 — 자유 쌓기는 늘 위(높이 0°~90°, 돌기의 중심이 판보다 위)
  return (eye ? eye[2] >= liftOf(0, apart, mid) : d[2] >= 0) ? [...tiles, ...shapes] : [...shapes, ...tiles];
}

/** 판 전체(3×3×3)의 가운데 */
const CENTER = [COLS / 2, ROWS / 2, MAX_H / 2];
/**
 * 모델 점 → 화면 점 [x, y] (k = 쌓기나무 한 변의 화면 길이, 가운데 = [cx, cy], 돌기의 중심 = center — 차시는 판 3×3×3의 가운데).
 * eye > 0이면 원근: 눈이 돌기의 중심에서 보는 사람 쪽으로 eye칸 떨어져 있다. 중심과 같은 깊이의 점은 원근 없을 때와 같은 자리,
 * 깊이 z(보는 사람 쪽 +)인 점은 eye ÷ (eye − z)배 — 가까우면 크게, 멀면 작게. eye가 0이면 원근 없음(차시 — 지금 그대로)
 */
export const projectPoint = (pose, k, cx, cy, p, center = CENTER, eye = 0) => {
  const x = p[0] - center[0];
  const y = p[1] - center[1];
  const z = p[2] - center[2];
  if (!(eye > 0)) return [cx + k * (pose[0] * x + pose[1] * y + pose[2] * z), cy + k * (pose[3] * x + pose[4] * y + pose[5] * z)];
  const f = eye / (eye - (pose[6] * x + pose[7] * y + pose[8] * z));
  return [cx + k * f * (pose[0] * x + pose[1] * y + pose[2] * z), cy + k * f * (pose[3] * x + pose[4] * y + pose[5] * z)];
};
/** 모델 점의 깊이(클수록 눈에 가깝다) */
export const depthOf = (pose, p, center = CENTER) => pose[6] * (p[0] - center[0]) + pose[7] * (p[1] - center[1]) + pose[8] * (p[2] - center[2]);

/**
 * 쌓기나무 한 변의 화면 길이(px): 어느 방향으로 돌려도 잘리지 않게, 판 전체(3×3×3, 대각선 = 한 변의 5.2배)를 감싸는 공이
 * 무대 높이에 들어오고(글자 자리까지 넣어 5.6), 가로로는 양옆의 조작 칸(side px씩)을 뺀 자리에 들어오는 크기
 */
export const unitFor = (width, height, side = 0) => Math.max(18, Math.floor(Math.min(height / 5.6, (width - 2 * side) / 5.2)));
/**
 * 조작 칸(방향 버튼·위에서 본 판 / 조작판·그림)이 무대 양옆에 겹쳐 놓이는 배치(휴대폰이 아닌 모든 폭)에서 한쪽에 비워 둘 폭:
 * 여백 14px + 칸 너비 190px 안팎. 무대 폭과 상관없이 늘 빼고 크기를 정한다(좁은 매트에서 쌓기나무가 조작 칸 밑으로 들어가지 않게)
 */
export const SIDE_ROOM = 210;

/**
 * 자유 쌓기의 맞춤(처음 보기 맞춤 — spec-grade6 15-19 결정 4 "판이 꽉 차게"): 교과서 방향의 처음 보기에서 판(cols×rows)과 fitH층 높이가
 * 무대에 꽉 차는 쌓기나무 한 변(px). 다른 방향(바로 위 등)에서는 판 가장자리가 무대 밖으로 조금 잘릴 수 있다 — [작게 보기]로 전체가 보인다.
 * 처음 보기에서 판의 화면 높이 = (cols + rows) × 0.408(1/√6), fitH층의 높이 = fitH × 0.816(2/√6), 판의 화면 너비 = (cols + rows) × 0.707(1/√2)
 */
export const HOME_MARGIN = Object.freeze({ h: 0.8, w: 0.6 });
export function homeUnitFor(width, height, { cols, rows, fitH = 3 }) {
  const R6 = 1 / Math.sqrt(6);
  const tall = (cols + rows) * R6 + fitH * 2 * R6 + HOME_MARGIN.h;
  const wide = (cols + rows) * Math.SQRT1_2 + HOME_MARGIN.w;
  return Math.max(8, Math.floor(Math.min(height / tall, width / wide)));
}
/**
 * 원근 판(자유 쌓기)의 눈의 거리(칸): 판의 긴 변 × persp. 다만 판 전체(maxH층을 층별로 벌려 놓은 높이까지)를 감싸는 공보다 2칸 넘게 바깥이다
 * (눈이 쌓기나무 안에 들어가지 않게 — persp 3.0이면 14×14·10층 42칸 · 6×6·6층 18칸으로 이 한도에 걸리지 않는다). persp가 0이면 0(원근 없음)
 */
export function eyeDistance({ cols, rows, maxH, fitH = 3, persp }) {
  if (!(persp > 0)) return 0;
  const tall = maxH + (maxH - 1) * APART_GAP;
  const reach = Math.hypot(cols / 2, rows / 2, Math.max(fitH / 2, tall - fitH / 2, tall / 2));
  return Math.max(persp * Math.max(cols, rows), reach + 2);
}
/** 원근에서 판 돌림 45°·높이 pitch로 본 판과 fitH층 상자(꼭짓점 여덟)의 화면 범위(쌓기나무 한 변 = 1, 돌기의 중심 = 0) */
function perspBox(pitch, { cols, rows, fitH, eye }) {
  const pose = poseOf({ yaw: 45, pitch });
  const center = [cols / 2, rows / 2, fitH / 2];
  const pts = [];
  for (const x of [0, cols]) for (const y of [0, rows]) for (const z of [0, fitH]) pts.push(projectPoint(pose, 1, 0, 0, [x, y, z], center, eye));
  const ys = pts.map((p) => p[1]);
  return { top: Math.min(...ys), bottom: Math.max(...ys), side: Math.max(...pts.map((p) => Math.abs(p[0]))) };
}
/**
 * 원근 판의 처음 보기 맞춤(결정 4 "판이 꽉 차게"를 원근에서): 처음 보기에서 판과 fitH층 상자가 무대에 꽉 차는 쌓기나무 한 변(px — 돌기의 중심과 같은 깊이).
 * 원근에서는 가까운 쪽(화면 아래)이 크고 먼 쪽이 작아 상자가 돌기의 중심보다 아래로 치우치므로, 상자의 위아래 범위로 맞추고 그만큼 판을 올린다(perspRise).
 * → { unit, wide, tall } (wide·tall = 여백을 넣은 상자의 너비·높이, 한 변 = 1 — 휴대폰은 무대의 가로세로 비로 쓴다)
 */
export function homeFitPersp(width, height, { cols, rows, fitH = 3, eye }) {
  const { top, bottom, side } = perspBox(SNAP.home.pitch, { cols, rows, fitH, eye });
  const wide = 2 * side + HOME_MARGIN.w;
  const tall = bottom - top + HOME_MARGIN.h;
  return { unit: Math.max(8, Math.floor(Math.min(height / tall, width / wide))), wide, tall };
}
/**
 * 원근에서 판(과 fitH층 상자)이 돌기의 중심보다 아래로 치우친 정도(한 변 = 1): 내려다보는 높이마다 판 돌림 45°의 상자로 잰다 — 판 돌림과 무관해
 * 가로로 돌릴 때는 판이 움직이지 않는다. 옆에서(0°)·바로 위(90°)에서는 0, 비스듬히 내려다볼 때 가장 크다. 무대는 돌기의 중심을 이만큼 올려 그린다
 * (판이 무대 가운데에 — 돌기의 중심은 그대로 판 가운데). eye가 0이면 0
 */
export function perspRise(pitch, { cols, rows, fitH = 3, eye }) {
  if (!(eye > 0)) return 0;
  const { top, bottom } = perspBox(pitch, { cols, rows, fitH, eye });
  return (top + bottom) / 2;
}
/**
 * 자유 쌓기에서 층별로 벌렸을 때 줄이는 배율: 쌓은 층(n개)을 벌린 높이가 처음 보기 맞춤의 높이(fitH층)에 들어오게. 1보다 크게는 키우지 않는다
 */
export function homeApartFit({ cols, rows, fitH = 3 }, n) {
  const R6 = 1 / Math.sqrt(6);
  const base = (cols + rows) * R6 + HOME_MARGIN.h;
  return Math.min(1, (base + fitH * 2 * R6) / (base + (n + (n - 1) * APART_GAP) * 2 * R6));
}

// ── 색 ───────────────────────────────────
/** 면의 방향에 따른 그늘(0 = 그대로): 윗면 밝게 · 앞면 가운데 · 옆면 어둡게. 방향마다 한 가지라 [앞]에서 보면 모든 면이 같은 색이다 */
export const FACE_SHADE = Object.freeze({ top: 0, front: 0.12, back: 0.18, right: 0.26, left: 0.3, bottom: 0.36 });
const SHADE_INK = [15, 20, 40]; // 전개도 무대의 그늘과 같은 색
const DEFAULT_TOKEN = '--face-1';

function parseColor(text) {
  const hex = String(text).trim().match(/^#([0-9a-f]{6})$/i);
  if (!hex) return null;
  const n = parseInt(hex[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const shaded = (rgb, shade) => `rgb(${rgb.map((v, i) => Math.round(v + (SHADE_INK[i] - v) * shade)).join(' ')})`;

/** 토큰(--face-n, :root에 있다) 값을 읽어 방향별 색을 만든다. 읽지 못하면 토큰 그대로(그늘 없이) */
const tokenCache = new Map();
function palette(token, face) {
  if (!tokenCache.has(token)) tokenCache.set(token, parseColor(getComputedStyle(document.documentElement).getPropertyValue(token)));
  const rgb = tokenCache.get(token);
  return rgb ? shaded(rgb, FACE_SHADE[face] ?? 0) : `var(${token})`;
}

/** 층별 색(1층부터): 노랑 · 파랑 · 초록 — 면에 층 숫자도 쓴다(색만으로 구분하지 않는다) */
export const LAYER_TOKENS = Object.freeze(['--face-1', '--face-2', '--face-3']);

const points = (pts) => pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
/** 화면에 그린 다각형의 넓이(px²) */
const areaOf = (pts) => Math.abs(pts.reduce((sum, p, i) => {
  const q = pts[(i + 1) % pts.length];
  return sum + p[0] * q[1] - q[0] * p[1];
}, 0)) / 2;
/**
 * 층 숫자를 쓸 면: 쌓기나무마다 화면에 가장 넓게 보이는 면 하나(그 넓이가 한 변의 0.3배 네모보다 클 때만 — 거의 옆으로 선 면에는 쓰지 않는다).
 * at: 모델 점 → 화면 점 · k: 한 변의 화면 길이 → 면 열쇠의 Set
 */
function numberFaces(shapes, at, k) {
  const best = new Map();
  for (const s of shapes) {
    if (s.kind !== 'face') continue;
    const area = areaOf(s.pts.map(at));
    const cube = `${s.x},${s.y},${s.z}`;
    if (area > 0.3 * k * k && (!best.has(cube) || area > best.get(cube).area)) best.set(cube, { area, key: `f${s.x},${s.y},${s.z},${s.face}` });
  }
  return new Set([...best.values()].map((b) => b.key));
}
const mid = (a, b, t = 0.5) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const centerOf = (pts) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];

/**
 * 조형물의 무늬(색만으로 구분하지 않는다): slash = 빗금 두 줄, dot = 가운데 마름모. 화면 점 넷(면의 꼭짓점: 아래 왼쪽부터 시계 반대 방향) → path d
 * (가로줄·세로줄은 쓰지 않는다 — 면을 가로지르는 줄은 쌓기나무의 층·칸 경계처럼 보인다)
 */
export function markPath(mark, pts) {
  if (mark === 'slash') {
    // 면 안의 자리 (u, v): u는 아래 변을 따라, v는 왼쪽 변을 따라 0~1
    const at = (u, v) => [pts[0][0] + u * (pts[1][0] - pts[0][0]) + v * (pts[3][0] - pts[0][0]), pts[0][1] + u * (pts[1][1] - pts[0][1]) + v * (pts[3][1] - pts[0][1])];
    return [[0.26, 0.5], [0.5, 0.74]].map(([from, to]) => {
      const a = at(from, 0.26);
      const b = at(to, 0.74);
      return `M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
    }).join('');
  }
  if (mark === 'dot') {
    const c = centerOf(pts);
    const tips = [mid(pts[0], pts[1]), mid(pts[1], pts[2]), mid(pts[2], pts[3]), mid(pts[3], pts[0])].map((p) => mid(c, p, 0.45));
    return `M${tips.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('L')}Z`;
  }
  return '';
}

/** 칸 하나에 빗금 세 줄(화면 점 넷: 아래 왼쪽부터 시계 반대 방향) → path d */
export function hatchPath(pts) {
  const at = (u, v) => [pts[0][0] + u * (pts[1][0] - pts[0][0]) + v * (pts[3][0] - pts[0][0]), pts[0][1] + u * (pts[1][1] - pts[0][1]) + v * (pts[3][1] - pts[0][1])];
  return [[0, 0.5, 0.5, 0], [0, 1, 1, 0], [0.5, 1, 1, 0.5]].map(([u0, v0, u1, v1]) => {
    const a = at(u0 + 0.06, v0 - 0.06);
    const b = at(u1 - 0.06, v1 + 0.06);
    return `M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
  }).join('');
}

// ── 보는 방향을 말로 ───────────────────────
export const SIDE_NAMES = Object.freeze({ top: '위', front: '앞', side: '옆', back: '뒤', left: '왼쪽' });
const seenFrom = (name) => `${name}에서 본 모습이에요.`;

/** 지금 자세를 말로. names: 방향 이름({ front, side, back, left }) */
export function poseWord(pose, names = SIDE_NAMES) {
  const elevation = (Math.acos(clamp(pose[8], -1, 1)) * 180) / Math.PI;
  if (elevation < 20) return seenFrom('위');
  if (elevation < 70) return seenFrom('비스듬히 위');
  if (elevation <= 110) {
    if (Math.abs(pose[6]) > Math.abs(pose[7])) return seenFrom(pose[6] > 0 ? names.side : names.left);
    return seenFrom(pose[7] < 0 ? names.front : names.back);
  }
  return seenFrom(elevation <= 160 ? '비스듬히 아래' : '아래');
}

// ── 무대 ─────────────────────────────────
/**
 * 쌓기나무 무대.
 * - still: 멈춘 그림(조작 없음, 그림에 보이는 면만)
 * - board: 판(3×3칸)을 그린다
 * - edge: 판 가장자리 글자 [{ text, at: 'front' | 'right' | 'back' | 'left' }] (기본: 앞·옆)
 * - names: 화면 읽기 알림에 쓰는 방향 이름
 */
export function createBlockView({ h, still = false, board = true, edge = DEFAULT_EDGE, names = SIDE_NAMES, cols = COLS, rows = ROWS, maxH = MAX_H, fit = 'all', fitH = 3, persp = 0 }) {
  // 판 크기: 차시는 3×3칸·3층(기본값 — 지금 그대로). 자유 쌓기는 14×14칸·10층, 휴대폰 6×6칸·6층에 처음 보기 맞춤(fit 'home')
  const freeFit = fit === 'home';
  // 원근(자유 쌓기 — 15-27·15-28): 눈의 거리(칸). 0이면 원근 없음(차시 — 지금 그대로)
  const eyeBase = freeFit ? eyeDistance({ cols, rows, maxH, fitH, persp }) : 0;
  /** 그 보기에서 눈의 거리(0 = 원근 없음): 바로 위·앞·옆 가까이에서는 원근이 줄어든다(perspWeight — 그 자세에서는 0) */
  const eyeOf = (v) => {
    if (!(eyeBase > 0)) return 0;
    const w = perspWeight(v);
    return w > 1e-6 ? eyeBase / w : 0;
  };
  /** 판을 무대 가운데에 두려고 돌기의 중심을 올리는 거리(px) — 원근에서만 */
  const riseOf = (v, eye, k) => (eye > 0 ? perspRise(v.pitch, { cols, rows, fitH, eye }) * k : 0);
  const gBack = svgEl('g', { class: 'blk-marks blk-marks-back' }); // 쌓기나무 뒤쪽에 있는 판 가장자리 글자(쌓기나무에 가려진다)
  const gShapes = svgEl('g', { class: 'blk-shapes' });
  const gGhost = svgEl('g', { class: 'blk-ghost' });
  const gMarks = svgEl('g', { class: 'blk-marks' });
  const svg = svgEl('svg', { class: 'blk-svg', 'aria-hidden': 'true', focusable: 'false' }, gBack, gShapes, gGhost, gMarks);
  const el = h('div', { class: `blk-stage${still ? ' is-still' : ''}`, tabindex: still ? null : '0', role: 'group', 'aria-label': STAGE_LABEL }, svg);
  let label = null; // 단계가 준 이름(없으면 기본 이름)

  let map = Array.from({ length: rows }, () => new Array(cols).fill(0));
  let colors = null; // [줄][칸] = { token, mark } (조형물) 또는 null
  let cubeColors = null; // [줄][칸] = 층마다 색 토큰 [z] (자유 쌓기 — 쌓기나무마다 색)
  let view = homeTurn(); // 학생 보기 { yaw, pitch, zoom } (turn-view.js)
  let shown = { ...view }; // 지금 화면의 모습 (돌아가는 움직임 도중에는 view와 다르다)
  let frozen = still; // 멈춘 그림처럼 그리는 중(답하기 전)
  let bare = false; // 돌려 볼 수는 있지만 면에 자리 값(data-*)을 싣지 않는다 — 보고 세는 것이 과제인 문항의 답하기 전(수 쓰기)
  let withBoard = board;
  let frozenEdges = false; // 멈춘 그림(판 없음)에도 판 가장자리 글자와 화살표를 그린다 — 교과서 입체 그림의 "앞"·"옆" 표시 (S2)
  let editable = false;
  let viewOn = false;
  let mode = 'add';
  let apart = false;
  let hover = null; // 마우스가 올라가 있거나 손가락이 누르고 있는 곳(hit)
  let marks = { hidden: [], diff: [], goal: null, layers: false, hiddenText: null, counted: [], tally: [] };
  let overlay = []; // 내가 그린 2D 그림을 그 방향의 무대 위에 겹친다 [{ dir: 'top' | 'front' | 'side', cells: [{ r, c, state }] }]
  let layerLook = false; // 층별 색과 층 숫자(5차시 — 답한 뒤에만): 1층 노랑 · 2층 파랑 · 3층 초록 + 쌓기나무마다 층 숫자(색만으로 구분하지 않는다)
  let layerOverlay = []; // 내가 칠한 층 모양을 층별로 벌린 무대의 그 층 위에 겹친다 [{ z(0 = 1층), cells: [{ r(줄), c(칸), state }] }]
  let size = { w: 0, h: 0, unit: 40 };
  // 판을 화면에서 옮긴 거리(px) — 자유 쌓기에서 "위에서 본 판"을 펼치면 남는 자리 쪽으로 비킨다(돌기의 중심은 그대로 판 가운데).
  // 가로 배치는 옆으로(shiftX), 세로 배치(태블릿 세로)는 위로(shiftY)
  let shiftX = 0;
  let shiftY = 0;
  let raf = 0;
  let mixing = null; // { t0, p }
  let destroyed = false;
  let orderSig = '';
  const shapeEls = new Map(); // 열쇠 → <polygon>
  const markEls = new Map(); // 열쇠 → <path> (조형물 무늬)
  const numEls = new Map(); // 열쇠 → <text> (층 숫자)
  const listeners = { tap: new Set(), view: new Set(), say: new Set(), facing: new Set() };
  let edgeList = edge;
  const emit = (name, ...args) => {
    for (const fn of listeners[name]) fn(...args);
  };
  const say = (text) => emit('say', text);
  const instant = () => destroyed || prefersReducedMotion() || Boolean(el.closest('.fx-low'));
  const canView = () => viewOn && !frozen;

  function measure() {
    const box = el.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) return;
    // 휴대폰 배치(blocks.css)에서는 조작 칸이 무대 아래로 내려가고 무대는 흐름 안에 놓인다(position: relative)
    const overlaid = getComputedStyle(el).position === 'absolute';
    let unit;
    if (freeFit && eyeBase > 0) unit = homeFitPersp(box.width, box.height, { cols, rows, fitH, eye: eyeBase }).unit;
    else unit = freeFit ? homeUnitFor(box.width, box.height, { cols, rows, fitH }) : unitFor(box.width, box.height, overlaid ? SIDE_ROOM : 0);
    size = { w: box.width, h: box.height, unit };
    svg.setAttribute('viewBox', `0 0 ${box.width.toFixed(1)} ${box.height.toFixed(1)}`);
    el.style.setProperty('--blk-unit', `${size.unit}px`);
  }

  /** 벌려 볼 층 수: 차시는 판의 층 수(3) 그대로, 자유 쌓기는 쌓은 층까지(10층 판에 3층만 쌓았으면 3층만 벌려 크게 보인다) */
  const apartLayers = () => (freeFit ? Math.max(1, ...map.map((row) => Math.max(0, ...row))) : maxH);
  const apartMid = () => (apartLayers() - 1) / 2;
  const scaleNow = () => size.unit * shown.zoom * (apart ? (freeFit ? homeApartFit({ cols, rows, fitH }, apartLayers()) : APART_FIT) : 1);
  /** 돌기의 중심: 판 가운데(사용자 결정 15-19의 1). 높이는 차시 1.5층, 자유 쌓기는 맞춤 높이의 절반(1.5층), 벌려 볼 때는 벌린 층들의 가운데 */
  const centerNow = () => (!freeFit ? CENTER : [cols / 2, rows / 2, apart ? apartLayers() / 2 : fitH / 2]);
  const tokenAt = (x, y, z) => (layerLook ? LAYER_TOKENS[z] ?? DEFAULT_TOKEN : cubeColors?.[y]?.[x]?.[z] ?? colors?.[y]?.[x]?.token ?? DEFAULT_TOKEN);

  /** 층별 개수 글자 [{ z, text }] (벌렸을 때 — 쌓기나무가 있는 층만) */
  const layerChips = () => {
    const out = [];
    for (let z = 0; z < maxH; z += 1) {
      const n = map.reduce((sum, row) => sum + row.filter((v) => v > z).length, 0);
      if (n > 0) out.push({ z, text: `${z + 1}층 ${n}개` });
    }
    return out;
  };
  const BOARD_CORNERS = [[0, 0], [1, 0], [0, 1], [1, 1]];

  function render() {
    if (destroyed) return;
    const pose = poseOf(shown);
    const d = toViewerOf(pose);
    const k = scaleNow();
    const eyeDist = eyeOf(shown);
    let cx = size.w / 2 + shiftX;
    const cy = size.h / 2 + shiftY - riseOf(shown, eyeDist, k);
    const center = centerNow();
    const mid = freeFit ? apartMid() : undefined;
    if (freeFit && apart && marks.layers && Math.abs(d[2]) < 0.92) {
      // 자유 쌓기에서 층별로 벌려 층마다 개수를 쓸 때: 글자(판 왼쪽)가 판을 가리지 않게, 판 왼쪽 자리가 모자라면 판을 오른쪽으로 비킨다(오른쪽에 남는 만큼만 — 휴대폰)
      const xs = BOARD_CORNERS.map(([a, b]) => projectPoint(pose, k, cx, cy, [a * cols, b * rows, 0], center, eyeDist)[0]);
      const room = 16 + Math.max(0, ...layerChips().map((c) => chipWidth(c.text)));
      const need = room - Math.min(...xs);
      if (need > 0) cx += Math.max(0, Math.min(need, size.w - 6 - Math.max(...xs)));
    }
    const at = (p) => projectPoint(pose, k, cx, cy, p, center, eyeDist);
    // 원근이면 눈의 자리(모델 좌표): 돌기의 중심에서 보는 사람 쪽으로 eyeDist칸
    const eye = eyeDist > 0 ? [center[0] + eyeDist * d[0], center[1] + eyeDist * d[1], center[2] + eyeDist * d[2]] : null;
    const shapes = sceneShapes(map, pose, { apart, board: withBoard, still: frozen, mid, eye });
    const used = new Set();
    const usedMarks = new Set();
    const order = [];
    const hiddenSet = new Set(marks.hidden.map((c) => c.join(',')));
    const diffSet = new Set(marks.diff.map((f) => `${f.x},${f.y},${f.z},${f.face}`));
    const countedSet = new Set(marks.counted.map((c) => c.join(',')));
    // 층 숫자: 쌓기나무마다 화면에 가장 넓게 보이는 면 하나에 (층별 색을 켰을 때)
    const numberFace = layerLook ? numberFaces(shapes, at, k) : null;
    const usedNums = new Set();
    for (const s of shapes) {
      const key = s.kind === 'tile' ? `t${s.x},${s.y}` : `f${s.x},${s.y},${s.z},${s.face}`;
      let node = shapeEls.get(key);
      if (!node) {
        // 자리 값(data-*)과 색은 만들 때 한 번만 싣는다. 멈춘 그림에는 자리 값을 싣지 않는다
        // (보이는 면이 어느 깊이의 쌓기나무인지는 그림이 알려 주지 않는 것이다)
        node = svgEl('polygon', frozen || bare ? {} : { 'data-kind': s.kind, 'data-x': s.x, 'data-y': s.y, 'data-z': s.z, 'data-face': s.face });
        if (s.kind === 'face') node.style.fill = palette(tokenAt(s.x, s.y, s.z), s.face);
        shapeEls.set(key, node);
      } else if (cubeColors && s.kind === 'face') {
        // 쌓기나무마다 색(자유 쌓기): 같은 자리에 다른 색 쌓기나무가 놓이면(되돌리기·모두 치우기 뒤) 색을 고친다
        const fill = palette(tokenAt(s.x, s.y, s.z), s.face);
        if (node.style.fill !== fill) node.style.fill = fill;
      }
      const pts = s.pts.map(at);
      node.setAttribute('points', points(pts));
      let cls;
      if (s.kind === 'tile') {
        const goal = marks.goal && marks.goal[0] === s.x && marks.goal[1] === s.y;
        cls = `blk-tile${(s.x + s.y) % 2 ? ' is-odd' : ''}${d[2] < 0 ? ' is-under' : ''}${goal ? ' is-goal' : ''}`;
      } else {
        const cell = `${s.x},${s.y},${s.z}`;
        cls = `blk-face blk-${s.face}${hiddenSet.has(cell) ? ' is-hidden-cube' : ''}${diffSet.has(`${cell},${s.face}`) ? ' is-diff' : ''}${countedSet.has(cell) ? ' is-counted' : ''}`;
      }
      if (node.getAttribute('class') !== cls) node.setAttribute('class', cls);
      used.add(key);
      order.push(node);
      if (numberFace?.has(key)) {
        let num = numEls.get(key);
        if (!num) {
          num = svgEl('text', { class: 'blk-face-num' }, document.createTextNode(String(s.z + 1)));
          numEls.set(key, num);
        }
        const c = centerOf(pts);
        num.setAttribute('x', c[0].toFixed(1));
        num.setAttribute('y', c[1].toFixed(1));
        num.style.fontSize = `${Math.max(11, Math.round(k * 0.34))}px`;
        usedNums.add(key);
        order.push(num);
      }
      const mark = s.kind === 'face' ? colors?.[s.y]?.[s.x]?.mark : null;
      if (mark && mark !== 'plain') {
        let path = markEls.get(key);
        if (!path) {
          path = svgEl('path', { class: `blk-mark blk-mark-${mark}` });
          markEls.set(key, path);
        }
        path.setAttribute('d', markPath(mark, pts));
        usedMarks.add(key);
        order.push(path);
      }
    }
    for (const [key, node] of shapeEls) {
      if (!used.has(key)) {
        node.remove();
        shapeEls.delete(key);
      }
    }
    for (const [key, node] of markEls) {
      if (!usedMarks.has(key)) {
        node.remove();
        markEls.delete(key);
      }
    }
    for (const [key, node] of numEls) {
      if (!usedNums.has(key)) {
        node.remove();
        numEls.delete(key);
      }
    }
    // 그리는 순서가 바뀌었을 때만 DOM 순서를 다시 맞춘다 (층 숫자가 붙는 면이 바뀌어도)
    const sig = shapes.map((s) => (s.kind === 'tile' ? `t${s.x}${s.y}` : `${s.x}${s.y}${s.z}${s.face[0]}${s.face[1]}`)).join('|') + (numberFace ? `#${[...numberFace].join('|')}` : '');
    if (sig !== orderSig) {
      orderSig = sig;
      // 자리가 바뀐 것만 옮긴다: 원근(자유 쌓기)에서는 눈이 판 위를 지날 때마다 이웃 칸끼리 차례가 바뀌어, 모두 다시 넣으면(쌓기나무 980개면 면 2,000개)
      // 끄는 동안 느려진다. 다 옮기고 나면 무대의 차례는 order와 똑같다(쓰지 않는 것은 위에서 이미 뺐다)
      let at = gShapes.firstChild;
      for (const node of order) {
        if (node === at) at = at.nextSibling;
        else gShapes.insertBefore(node, at);
      }
      while (at) {
        const next = at.nextSibling;
        at.remove();
        at = next;
      }
    }
    renderGhost(pose, d, at, eye);
    renderMarks(pose, d, at, k);
    // 내가 쌓은 개수(검사용). 멈춘 그림·자리 값을 싣지 않는 무대에는 싣지 않는다
    if (frozen || bare) delete el.dataset.count;
    else el.dataset.count = String(count(map));
  }

  /** 면·판의 요소를 모두 버린다(다음에 그릴 때 새로 만든다): 멈춘 그림 ↔ 입체, 조형물 색이 바뀔 때 */
  function resetNodes() {
    shapeEls.clear();
    markEls.clear();
    numEls.clear();
    gShapes.replaceChildren();
    orderSig = '';
  }

  /** 놓일 자리(점선 쌓기나무) · 빠질 쌓기나무. eye: 원근이면 눈의 자리(그 점에서 보이는 면만) */
  function renderGhost(pose, d, at, eye) {
    const target = editable && hover ? targetOf(map, hover, mode, maxH) : null;
    if (!target || target.error) {
      gGhost.replaceChildren();
      for (const name of ['x', 'y', 'z']) delete gGhost.dataset[name];
      return;
    }
    const nodes = [];
    for (const [face, corners] of Object.entries(FACE_CORNERS)) {
      const n = FACE_NORMALS[face];
      if (eye) {
        // 원근: 면이 놓인 평면의 눈 쪽에 눈이 있는 면만(면의 한 꼭짓점에서 눈으로 가는 방향 · 법선 > 0)
        const c = corners[0];
        const toEye = [eye[0] - (target.x + c[0]), eye[1] - (target.y + c[1]), eye[2] - (target.z + c[2])];
        if (n[0] * toEye[0] + n[1] * toEye[1] + n[2] * toEye[2] <= 1e-9) continue;
      } else if (n[0] * d[0] + n[1] * d[1] + n[2] * d[2] <= 1e-6) continue;
      nodes.push(svgEl('polygon', {
        class: `blk-ghost-face is-${mode}`,
        points: points(corners.map(([dx, dy, dz]) => at([target.x + dx, target.y + dy, target.z + dz]))),
      }));
    }
    gGhost.replaceChildren(...nodes);
    gGhost.dataset.x = target.x;
    gGhost.dataset.y = target.y;
    gGhost.dataset.z = target.z;
  }

  function chip(text, [x, y], cls = '') {
    const width = chipWidth(text);
    return svgEl('g', { class: `blk-chip ${cls}`.trim(), transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})` },
      svgEl('rect', { x: -width / 2, y: -13, width, height: 26, rx: 13 }),
      svgEl('text', { x: 0, y: 0 }, document.createTextNode(text)));
  };

  /**
   * 내가 그린 2D 그림을 무대에 겹친다(그 방향에서 보고 있을 때만 — 돌아가는 도중·끌어 돌린 뒤에는 그리지 않는다).
   * 칸 하나 = 그 방향의 판 바깥 면(앞: 판의 앞 가장자리, 옆: 오른쪽 가장자리, 위: 3층 위) 위의 네모. 원근 없는 그리기라 쌓기나무의 네모와 겹친다.
   * state: ok(내가 칠했고 맞음 — 반투명 테두리) · extra(내가 칠했는데 없음 — 빗금 + ✗) · missing(있는데 안 칠함 — 점선 + ✗)
   */
  function overlayNodes(pose, at, k) {
    const facing = el.dataset.facing;
    const layer = overlay.find((o) => o.dir === facing);
    if (!layer) return [];
    const out = [];
    const corners = (r, c) => {
      if (facing === 'front') return [[c, -0.02, r], [c + 1, -0.02, r], [c + 1, -0.02, r + 1], [c, -0.02, r + 1]];
      if (facing === 'side') return [[cols + 0.02, c, r], [cols + 0.02, c + 1, r], [cols + 0.02, c + 1, r + 1], [cols + 0.02, c, r + 1]];
      return [[c, r, maxH + 0.02], [c + 1, r, maxH + 0.02], [c + 1, r + 1, maxH + 0.02], [c, r + 1, maxH + 0.02]];
    };
    let first = null;
    for (const cell of layer.cells) {
      const pts = corners(cell.r, cell.c).map(at);
      out.push(svgEl('polygon', { class: `blk-over is-${cell.state}`, points: points(pts) }));
      if (cell.state === 'extra') out.push(svgEl('path', { class: 'blk-over-hatch', d: hatchPath(pts) }));
      if (cell.state !== 'ok') {
        const c = centerOf(pts);
        out.push(svgEl('text', { class: 'blk-x', x: c[0].toFixed(1), y: c[1].toFixed(1) }, document.createTextNode('✗')));
        if (!first || c[1] < first[1]) first = c;
      }
    }
    if (first) out.push(chip('여기가 달라요', [clamp(first[0], 70, size.w - 70), Math.max(16, first[1] - k * 0.75)], 'blk-hid blk-over-chip'));
    return out;
  }

  /**
   * 내가 칠한 층 모양을 층별로 벌린 무대의 그 층에 겹친다(돌려도 따라 돈다): 칸 하나 = 그 층 쌓기나무의 윗면 높이의 네모.
   * state: ok(반투명 테두리) · extra(칠했는데 없음 — 빗금 + ✗) · missing(있는데 안 칠함 — 점선 + ✗). 다른 칸이 있으면 가장 위의 ✗ 옆에 "여기가 달라요"
   */
  function layerOverlayNodes(at, k) {
    const out = [];
    let first = null;
    for (const layer of layerOverlay) {
      const h = layer.z + 1 + liftOf(layer.z, true, freeFit ? apartMid() : undefined) + 0.02;
      for (const cell of layer.cells) {
        const pts = [[cell.c, cell.r, h], [cell.c + 1, cell.r, h], [cell.c + 1, cell.r + 1, h], [cell.c, cell.r + 1, h]].map(at);
        out.push(svgEl('polygon', { class: `blk-over is-${cell.state}`, points: points(pts) }));
        if (cell.state === 'extra') out.push(svgEl('path', { class: 'blk-over-hatch', d: hatchPath(pts) }));
        if (cell.state !== 'ok') {
          const c = centerOf(pts);
          out.push(svgEl('text', { class: 'blk-x', x: c[0].toFixed(1), y: c[1].toFixed(1) }, document.createTextNode('✗')));
          if (!first || c[1] < first[1]) first = c;
        }
      }
    }
    if (first) out.push(chip('여기가 달라요', [clamp(first[0], 70, size.w - 70), Math.max(16, first[1] - k * 0.75)], 'blk-hid blk-over-chip'));
    return out;
  }

  /** 판 가장자리 글자(앞·옆, 가~라)와 화살표, 층별 개수, "숨어 있었어요", 다른 곳 ✗ */
  function renderMarks(pose, d, at, k) {
    const nodes = [];
    const backNodes = [];
    const mid = freeFit ? apartMid() : undefined;
    if (withBoard || frozenEdges) {
      // 판을 거의 옆에서 볼 때(판이 선으로 보일 때)는 가까운 쪽 글자를 바닥 선 아래로 내리고, 먼 쪽 글자는 그리지 않는다(쌓기나무 뒤다)
      const flat = clamp(1 - Math.abs(d[2]) / 0.3, 0, 1);
      const drop = flat * 22;
      const base = liftOf(0, apart, mid);
      for (const item of edgeList) {
        const [ox, oy] = EDGE_OUT[item.at];
        const out = item.out ?? EDGE_NEAR;
        const edgeMid = [cols / 2 + ox * (cols / 2), rows / 2 + oy * (rows / 2), base];
        const far = ox * d[0] + oy * d[1] < -0.2; // 그 가장자리가 보는 사람의 반대쪽에 있다
        if (far && flat > 0.5) continue;
        const into = far ? backNodes : nodes;
        const tipAt = out - 0.74;
        const backAt = out - 0.4;
        const wing = 0.26;
        const tri = [
          [edgeMid[0] + ox * tipAt, edgeMid[1] + oy * tipAt, base],
          [edgeMid[0] + ox * backAt - oy * wing, edgeMid[1] + oy * backAt + ox * wing, base],
          [edgeMid[0] + ox * backAt + oy * wing, edgeMid[1] + oy * backAt - ox * wing, base],
        ].map(at).map(([x, y]) => [x, y + drop * 0.4]);
        // 판이 선으로 보일 때는 화살표(판 위에 누운 세모)가 선이 되므로 그리지 않는다
        if (Math.abs(d[2]) > 0.15) into.push(svgEl('polygon', { class: 'blk-arrow', points: points(tri) }));
        const spot = at([edgeMid[0] + ox * out, edgeMid[1] + oy * out, base]);
        // 글자는 무대 밖으로 나가지 않게 가장자리 안쪽에 붙든다(좁은 무대·크게 본 때)
        into.push(chip(item.text, [clamp(spot[0], 20, size.w - 20), clamp(spot[1] + drop, 16, size.h - 16)], `blk-edge blk-edge-${item.at}`));
      }
    }
    gBack.replaceChildren(...backNodes);
    if (marks.layers && apart && Math.abs(d[2]) < 0.92) {
      const list = layerChips();
      const widest = Math.max(0, ...list.map((c) => chipWidth(c.text)));
      let below = Infinity; // 바로 아래층 글자의 세로 자리
      for (const { z, text } of list) {
        const lift = z + 0.5 + liftOf(z, apart, mid);
        let [, y] = at([cols / 2, rows / 2, lift]);
        // 원근(자유 쌓기)에서는 아래층(눈에서 먼 쪽)이 작아 보여 층 사이가 좁아진다 — 글자(높이 26px)끼리 겹치지 않게 위층 글자를 조금 올린다
        if (eyeOf(shown) > 0) y = Math.min(y, below - CHIP_STEP);
        below = y;
        // 층별 개수 글자: 차시는 3×3 판의 왼쪽, 자유 쌓기는 판 모서리 가운데 가장 왼쪽 점에서 8px 왼쪽에 가장 긴 글자의 오른쪽 끝이 오게(넓은 판을 가리지 않게)
        const left = freeFit ? Math.min(...BOARD_CORNERS.map(([a, b]) => at([a * cols, b * rows, lift])[0])) - 8 - widest / 2 : size.w / 2 - k * 2.9;
        nodes.push(chip(text, [Math.max(freeFit ? 4 + widest / 2 : 52, left), y], 'blk-layer'));
      }
    }
    if (marks.hidden.length && !frozen) {
      const [x, y, z] = marks.hidden[0];
      const spot = at([x + 0.5, y + 0.5, z + 0.5 + liftOf(z, apart, mid)]);
      nodes.push(chip(marks.hiddenText ?? '숨어 있었어요', [spot[0], spot[1] - k * 0.75], 'blk-hid'));
    }
    // 자리마다 센 수(수 쓰기를 맞힌 뒤): 그 자리의 맨 위 쌓기나무의 윗면 가운데에
    for (const t of marks.tally) {
      const spot = at([t.x + 0.5, t.y + 0.5, t.z + 1 + liftOf(t.z, apart, mid)]);
      nodes.push(chip(String(t.n), spot, 'blk-tally'));
    }
    if (!frozen && !mixing && overlay.length) nodes.push(...overlayNodes(pose, at, k));
    if (!frozen && apart && layerOverlay.length) nodes.push(...layerOverlayNodes(at, k));
    for (const f of marks.diff) {
      const lift = liftOf(f.z, apart, mid);
      const c = centerOf(FACE_CORNERS[f.face].map(([dx, dy, dz]) => at([f.x + dx, f.y + dy, f.z + dz + lift])));
      nodes.push(svgEl('text', { class: 'blk-x', x: c[0].toFixed(1), y: c[1].toFixed(1) }, document.createTextNode('✗')));
    }
    gMarks.replaceChildren(...nodes);
  }

  function schedule() {
    if (raf || destroyed) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (mixing) stepMix(performance.now());
      render();
      if (mixing) schedule();
    });
  }

  const emitView = () => emit('view', { can: canView(), ...turnLimits(view) });

  /** 지금 화면의 모습에서 view로 짧은 움직임(0.2초)으로 간다. 움직임 줄이기·?fx=low면 바로 */
  function easeToView() {
    if (instant() || sameTurn(shown, view)) {
      mixing = null;
      shown = { ...view };
      el.classList.remove('is-easing');
      render();
      return;
    }
    mixing = { t0: performance.now(), p: 0 };
    el.classList.add('is-easing');
    schedule();
  }
  function stepMix(now) {
    const p = clamp((now - mixing.t0) / MIX_MS, 0, 1);
    shown = turnToward(shown, view, mixStep(mixing.p, p));
    mixing.p = p;
    if (p >= 1) {
      mixing = null;
      shown = { ...view };
      el.classList.remove('is-easing');
    }
  }
  /** 끌기·휠처럼 손을 바로 따라가는 조작: 움직임 없이 그 모습으로 */
  function follow() {
    mixing = null;
    delete el.dataset.facing;
    el.classList.remove('is-easing');
    shown = { ...view };
    schedule();
    emitView();
  }
  function moveTo(next) {
    view = next;
    delete el.dataset.facing;
    emitView();
    easeToView();
  }

  // ── 누르기 · 끌기 · 벌리기 · 휠 ──────────────
  const pointers = new Map(); // pointerId → 마지막 자리
  let gesture = null; // { mode: 'wait' | 'turn' | 'pinch', x, y, hit, right, word }
  const TOUCH_MOVE = { passive: false };
  let swallowClick = false;
  let swallowTimer = 0;
  let wheelTimer = 0;
  let lastMouse = null;
  // 판 옮기기(자유 쌓기 — 위에서 본 판을 펼쳐 판이 비킨 동안, spec-grade6 15-19 결정 9): 두 손가락으로 함께 끌기 · Shift+방향키.
  // panner({ move: [dx, dy] }) — 두 손가락이 움직인 거리(px), panner({ look: [lx, ly] }) — Shift+방향키(→ 이면 [1, 0] "오른쪽 보기").
  // 없으면(차시 단계) 두 손가락은 지금처럼 벌리기·오므리기만, Shift+방향키는 방향키와 같다
  let panner = null;

  const hitOf = (target) => {
    const node = target?.closest?.('[data-kind]');
    if (!node || !gShapes.contains(node)) return null;
    const { kind, x, y, z, face } = node.dataset;
    return kind === 'tile' ? { kind, x: Number(x), y: Number(y) } : { kind, x: Number(x), y: Number(y), z: Number(z), face };
  };

  function setHover(hit) {
    const same = JSON.stringify(hit) === JSON.stringify(hover);
    hover = hit;
    if (!same) schedule();
  }

  function capture(pointerId) {
    try {
      el.setPointerCapture?.(pointerId);
    } catch {
      // 이미 떨어진 포인터면 붙잡지 않는다
    }
  }

  /** 끌기·벌리기가 시작됐다: 점선 쌓기나무를 지우고(아무것도 놓이지 않는다), 무대가 포인터를 붙잡고, 따라오는 click을 삼킬 준비를 한다 */
  function startMoving() {
    for (const id of pointers.keys()) capture(id);
    el.classList.add('is-turning');
    setHover(null);
    clearTimeout(swallowTimer);
    swallowTimer = 0;
    swallowClick = true;
  }

  function endGesture(told = false) {
    const g = gesture;
    gesture = null;
    pointers.clear();
    globalThis.removeEventListener?.('pointermove', onPointerMove);
    globalThis.removeEventListener?.('pointerup', onPointerUp);
    globalThis.removeEventListener?.('pointercancel', onPointerCancel);
    globalThis.removeEventListener?.('touchmove', onTouchMove, TOUCH_MOVE);
    el.classList.remove('is-turning');
    if (!g || g.mode === 'wait') return;
    // click은 pointerup과 같은 차례에 오므로, 그 차례가 지나면 삼키기를 푼다 (click이 오지 않는 터치 끌기에서 남지 않게)
    clearTimeout(swallowTimer);
    swallowTimer = setTimeout(() => {
      swallowTimer = 0;
      swallowClick = false;
    }, 0);
    if (!told) return;
    const word = poseWord(poseOf(view), names);
    if (word !== g.word) say(word);
    else if (Math.abs(view.zoom - g.zoom) > 0.005) say(zoomWord(view.zoom));
  }

  function onPointerDown(event) {
    // 새로 눌렀다: 앞선 끌기의 "따라오는 click 삼키기"가 남아 있어도 이 누르기의 click은 삼키지 않는다
    if (swallowClick && !gesture) {
      clearTimeout(swallowTimer);
      swallowTimer = 0;
      swallowClick = false;
    }
    if (frozen || (!editable && !viewOn)) return;
    const right = event.pointerType === 'mouse' && event.button === 2;
    if (event.pointerType === 'mouse' && event.button !== 0 && !right) return;
    if (event.isPrimary && gesture) endGesture(); // 뗀 것을 못 받은 포인터가 남아 있으면 버린다
    if (pointers.size >= 2) return; // 셋째 손가락은 쓰지 않는다
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      const hit = hitOf(event.target);
      gesture = { mode: 'wait', x: event.clientX, y: event.clientY, hit, right, word: poseWord(poseOf(view), names), zoom: view.zoom };
      // 터치: 누르는 동안 놓일 곳이 점선 쌓기나무로 보인다(떼면 놓인다. 끌면 돌리기로 바뀌어 사라진다)
      if (editable && !right && event.pointerType !== 'mouse') setHover(hit);
      globalThis.addEventListener('pointermove', onPointerMove);
      globalThis.addEventListener('pointerup', onPointerUp);
      globalThis.addEventListener('pointercancel', onPointerCancel);
      globalThis.addEventListener('touchmove', onTouchMove, TOUCH_MOVE);
      return;
    }
    // 두 번째 손가락: 벌리기·오므리기 (누르기는 없던 일로). 판 옮기기가 켜져 있으면 처음 움직임으로 벌리기인지 함께 끌기인지 가른다
    if (!canView()) return;
    const [a, b] = [...pointers.values()];
    gesture = { ...gesture, mode: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom0: view.zoom, mid: [(a.x + b.x) / 2, (a.y + b.y) / 2], two: panner ? null : 'zoom' };
    startMoving();
  }

  function onPointerMove(event) {
    const p = pointers.get(event.pointerId);
    if (!p || !gesture) return;
    if (gesture.mode === 'pinch') {
      p.x = event.clientX;
      p.y = event.clientY;
      if (pointers.size < 2) return;
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = [(a.x + b.x) / 2, (a.y + b.y) / 2];
      if (!gesture.two) {
        // 두 손가락 사이가 12% 넘게 바뀌면 벌리기(크게·작게), 그 전에 가운데가 문턱(8px)을 넘게 움직이면 함께 끌기(판 옮기기)
        if (Math.abs(dist / gesture.dist - 1) > PINCH_START) gesture.two = 'zoom';
        else if (Math.hypot(mid[0] - gesture.mid[0], mid[1] - gesture.mid[1]) > DRAG_START) gesture.two = 'pan';
        else return;
      }
      if (gesture.two === 'pan') {
        if (panner) panner({ move: [mid[0] - gesture.mid[0], mid[1] - gesture.mid[1]] });
        gesture.mid = mid;
        return;
      }
      view = pinchView(view, gesture.zoom0, gesture.dist, dist);
      follow();
      return;
    }
    if (gesture.mode === 'wait') {
      if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) <= DRAG_START) return;
      // 문턱을 넘었다: 누르기가 아니라 끌기다. 돌릴 수 없는 때(보기 조작이 꺼짐)면 그냥 누르기만 없던 일로 한다
      gesture.mode = 'turn';
      startMoving();
    }
    const dx = event.clientX - p.x;
    const dy = event.clientY - p.y;
    p.x = event.clientX;
    p.y = event.clientY;
    if (!canView() || gesture.right) return;
    // 가로 몫 = 판 돌리기(끝없이), 세로 몫 = 내려다보는 높이(수평 ~ 바로 위에서 멈춘다). 한도에 걸려 그대로면 [위]·[앞]의 모습을 지우지 않는다
    const next = dragTurn(view, dx, dy);
    if (next.yaw === view.yaw && next.pitch === view.pitch) return;
    view = next;
    follow();
  }

  function onPointerUp(event) {
    if (!pointers.delete(event.pointerId)) return;
    if (pointers.size === 1 && gesture?.mode === 'pinch') {
      gesture.mode = 'turn';
      return;
    }
    if (pointers.size > 0) return;
    const g = gesture;
    const tapped = g?.mode === 'wait';
    endGesture(true);
    if (!tapped) return;
    // 문턱 안에서 뗐다 = 누르기. 누른 순간 그 자리에 있던 면(또는 판의 자리)에 대해 알린다
    if (event.pointerType !== 'mouse') setHover(null);
    if (g.hit) emit('tap', g.hit, { right: g.right });
    if (event.pointerType === 'mouse') refreshHover();
  }

  function onPointerCancel(event) {
    if (!pointers.has(event.pointerId)) return;
    endGesture();
    setHover(null);
  }

  /** 손가락으로 누르거나 끄는 동안의 touchmove는 "우리가 썼다"고 알린다 (관성 스크롤이 시작되면 끈 직후의 첫 탭이 먹히지 않는다) */
  function onTouchMove(event) {
    if (gesture && event.cancelable) event.preventDefault();
  }

  function onClickCapture(event) {
    if (!swallowClick) return;
    swallowClick = false;
    event.stopPropagation();
    event.preventDefault();
  }

  /** 마우스가 올라가 있는 곳에 놓일 자리를 미리 보인다 (누르지 않은 채 움직일 때) */
  function onHoverMove(event) {
    if (event.pointerType !== 'mouse') return;
    lastMouse = { x: event.clientX, y: event.clientY };
    if (gesture || !editable || event.buttons !== 0) return;
    setHover(hitOf(event.target));
  }
  function onHoverLeave(event) {
    if (event.pointerType !== 'mouse') return;
    lastMouse = null;
    if (!gesture) setHover(null);
  }
  /** 쌓거나 뺀 뒤: 마우스 밑의 면이 바뀌었으니 미리 보기를 다시 고른다 (그린 뒤에 본다) */
  function refreshHover() {
    if (!lastMouse || !editable) return;
    requestAnimationFrame(() => {
      if (destroyed || gesture || !lastMouse || !editable) return;
      render();
      setHover(hitOf(document.elementFromPoint(lastMouse.x, lastMouse.y)));
    });
  }

  function onContextMenu(event) {
    if (editable) event.preventDefault(); // 오른쪽 누르기 = 빼기
  }

  function onWheel(event) {
    if (!canView()) return;
    event.preventDefault();
    const before = view.zoom;
    view = wheelView(view, event.deltaY, { ctrl: event.ctrlKey, lines: event.deltaMode === 1 });
    if (view.zoom === before) return;
    follow();
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => {
      wheelTimer = 0;
      say(zoomWord(view.zoom));
    }, 300);
  }

  function onGestureStart(event) {
    if (canView()) event.preventDefault(); // 사파리의 두 손가락 벌리기(화면 전체 확대)
  }

  /**
   * 한 단계 돌린다(조작판 버튼·방향키 — 눈금에 멈춘다). 보는 방향의 말("위에서 본 모습" 등)이 바뀌면 알린다 — 전개도 무대와 같다.
   * 높이가 한도(수평·바로 위)에 닿아 있으면 아무 일도 없다(그 버튼은 꺼져 있다)
   */
  function turnStep(dir, degrees) {
    const next = stepTurn(view, dir, degrees);
    if (sameTurn(next, view)) return;
    const before = poseWord(poseOf(view), names);
    moveTo(next);
    const after = poseWord(poseOf(view), names);
    if (after !== before) say(after);
  }
  function step(dir) {
    if (!canView()) return false;
    turnStep(dir, dir === 'left' || dir === 'right' ? YAW_BUTTON : PITCH_STEP);
    return true;
  }
  function zoomStep(dir) {
    if (!canView()) return false;
    const before = view.zoom;
    moveTo(stepZoom(view, dir));
    if (view.zoom !== before) say(zoomWord(view.zoom));
    return true;
  }
  function resetView() {
    if (!canView()) return false;
    if (isHomeTurn(view)) return true;
    moveTo(homeTurn());
    say(HOME_WORD);
    return true;
  }
  /** 그 방향에서 본 모습으로 돌린다: 'top' · 'front' · 'side' · 'back' · 'left' · 'home'. force면 보기 조작이 꺼져 있어도(단계가 보여 줄 때) */
  function snapTo(name, { force = false, quiet = false } = {}) {
    if (!SNAP[name] || (!force && !canView())) return false;
    moveTo(snapTurn(view, name));
    el.dataset.facing = name;
    if (overlay.length) render(); // 움직임 없이 바로 돈 때(움직임 줄이기): 그 방향의 겹친 그림을 바로 그린다
    emit('facing', name);
    if (!quiet) say(name === 'home' ? HOME_WORD : seenFrom(names[name] ?? SIDE_NAMES[name]));
    return true;
  }

  function onKey(event) {
    if (frozen || event.ctrlKey || event.metaKey || event.altKey) return;
    if (!canView()) return;
    const { key } = event;
    if (panner && event.shiftKey && PAN_KEYS[key]) {
      // Shift+방향키 = 판 옮기기(그쪽을 보기) — 판이 비켜 가려진 동안만(자유 쌓기)
      panner({ look: PAN_KEYS[key] });
      event.preventDefault();
      return;
    }
    if (key === 'ArrowLeft') turnStep('left', YAW_KEY);
    else if (key === 'ArrowRight') turnStep('right', YAW_KEY);
    else if (key === 'ArrowUp') step('up');
    else if (key === 'ArrowDown') step('down');
    else if (key === '+' || key === '=') zoomStep(1);
    else if (key === '-' || key === '_') zoomStep(-1);
    else if (key === '0' || key === 'Home') resetView();
    else if (key === '1') snapTo('top');
    else if (key === '2') snapTo('front');
    else if (key === '3') snapTo('side');
    else return;
    event.preventDefault();
  }

  if (!still) {
    el.addEventListener('keydown', onKey);
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onHoverMove);
    el.addEventListener('pointerleave', onHoverLeave);
    el.addEventListener('click', onClickCapture, true);
    el.addEventListener('contextmenu', onContextMenu);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('gesturestart', onGestureStart);
  }

  const resizer = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => {
      measure();
      render();
    })
    : null;
  resizer?.observe(el);

  const syncClasses = () => {
    // 멈춘 그림은 초점이 머물 까닭이 없고(누를 것이 없다) 이름도 그림이라고 알린다
    el.setAttribute('aria-label', label ?? (frozen ? `${PICTURE_LABEL}${frozenEdges ? ` ${edgeWords(edgeList)}` : ''}` : STAGE_LABEL));
    if (!still) el.setAttribute('tabindex', frozen ? '-1' : '0');
    el.classList.toggle('can-edit', editable && !frozen);
    el.classList.toggle('can-view', canView());
    el.classList.toggle('is-frozen', frozen);
    el.classList.toggle('is-remove', editable && mode === 'remove');
  };

  return {
    el,
    /** 높이 지도(와 조형물 색 [줄][칸] = { token, mark })를 바꿔 그린다 */
    setMap(next, { colors: nextColors, cubes } = {}) {
      map = next.map((row) => [...row]);
      if (nextColors !== undefined) {
        colors = nextColors;
        resetNodes();
      }
      // 쌓기나무마다 색 [줄][칸][층] = 토큰 (자유 쌓기). 바뀐 면만 render에서 색을 고친다
      if (cubes !== undefined) cubeColors = cubes;
      if (size.w === 0) measure();
      render();
    },
    getMap: () => map.map((row) => [...row]),
    /** 누르면 쌓기·빼기가 되는가 (단계가 onTap에서 실제로 바꾼다) */
    setEditable(value) {
      editable = Boolean(value);
      if (!editable) hover = null;
      syncClasses();
      render();
    },
    setMode(next) {
      mode = next === 'remove' ? 'remove' : 'add';
      syncClasses();
      render();
    },
    /** 끌기·방향키·휠·벌리기로 돌리고 키우는 조작을 켜고 끈다 */
    setViewEnabled(value) {
      viewOn = Boolean(value);
      if (!viewOn && gesture && gesture.mode !== 'wait') endGesture();
      syncClasses();
      emitView();
    },
    /**
     * 멈춘 그림 ↔ 입체: 답한 뒤 false로 바꾸면 숨겨졌던 쌓기나무와 판이 나타난다.
     * edges: 판을 그리지 않는 멈춘 그림에도 판 가장자리 글자와 화살표(앞은 왼쪽 아래, 옆은 오른쪽 아래)를 그린다.
     *   판 3×3의 가장자리에 붙어 있어 쌓은 모양과 무관하게 늘 같은 자리다(답을 알려 주지 않는다)
     */
    setFrozen(value, { board: showBoard, edges = false } = {}) {
      frozen = Boolean(value);
      frozenEdges = frozen && Boolean(edges);
      if (showBoard !== undefined) withBoard = showBoard;
      resetNodes();
      syncClasses();
      emitView();
      render();
    },
    /**
     * 자리 값을 싣지 않는 무대 ↔ 보통 무대: 돌려 보며 세는 것이 과제인 문항(수 쓰기)은 답하기 전에 면의 자리 값(data-x·y·z)과 개수(data-count)가
     * DOM에 없게 한다(높이가 곧 답이다). 그동안은 면을 눌러도 아무 일이 없다
     */
    setBare(value) {
      bare = Boolean(value);
      resetNodes();
      render();
    },
    /** 무대의 이름(화면 읽기)을 단계의 말로 바꾼다. null이면 기본 이름으로 */
    setLabel(text) {
      label = text || null;
      syncClasses();
    },
    /** 판 가장자리 글자를 바꾼다 [{ text, at }] */
    setEdge(list) {
      edgeList = list;
      render();
    },
    /** 층별로 벌려 보기 */
    setApart(value) {
      apart = Boolean(value);
      el.classList.toggle('is-apart', apart);
      orderSig = '';
      render();
    },
    isApart: () => apart,
    /** 판을 화면에서 옮긴다(px — 오른쪽 dx, 아래 dy, 0 = 가운데) — 자유 쌓기에서 펼친 "위에서 본 판"을 피해 남는 자리 쪽으로. 돌기의 중심은 그대로 판 가운데다 */
    setShift(dx, dy = 0) {
      const nx = Number(dx) || 0;
      const ny = Number(dy) || 0;
      if (nx === shiftX && ny === shiftY) return;
      shiftX = nx;
      shiftY = ny;
      render();
    },
    /** 판 옮기기(두 손가락 함께 끌기 · Shift+방향키)를 받을 함수 — null이면 끈다(자유 쌓기: 위에서 본 판을 펼쳐 판이 비킨 동안만) */
    setPanner(fn) {
      panner = typeof fn === 'function' ? fn : null;
    },
    /** 모델 점들이 (옮기지 않은) 무대에서 차지하는 상자 { x0, x1, y0, y1 }(무대 기준 px) — 지금 보기(돌아가는 중이면 가는 곳)로 잰다 */
    boxOf(pts) {
      const pose = poseOf(view);
      const k = size.unit * view.zoom * (apart ? (freeFit ? homeApartFit({ cols, rows, fitH }, apartLayers()) : APART_FIT) : 1);
      const eyeDist = eyeOf(view);
      const xy = pts.map((p) => projectPoint(pose, k, size.w / 2, size.h / 2 - riseOf(view, eyeDist, k), p, centerNow(), eyeDist));
      const xs = xy.map((p) => p[0]);
      const ys = xy.map((p) => p[1]);
      return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    },
    /** 지금 쌓기나무 한 변의 화면 길이(px, 배율 1) · 무대 크기 — 배치를 정하는 쪽(자유 쌓기)이 쓴다 */
    getSize: () => ({ ...size }),
    /**
     * 표시: hidden(숨어 있던 쌓기나무 [x, y, z]들 — 첫 쌓기나무에 hiddenText 글자, 없으면 "숨어 있었어요") · diff(다른 면들) · goal(놓을 자리 [x, y])
     * · layers(벌렸을 때 층별 개수) · counted(센 쌓기나무 [x, y, z]들 — 굵은 테두리) · tally(자리마다 센 수 [{ x, y, z(맨 위 층), n }])
     */
    setMarks(next = {}) {
      marks = { hidden: [], diff: [], goal: null, layers: false, hiddenText: null, counted: [], tally: [], ...next };
      render();
    },
    /** 내가 그린 2D 그림을 그 방향의 무대 위에 겹친다: [{ dir, cells: [{ r, c, state }] }] (빈 목록이면 지운다) */
    setOverlay(list = []) {
      overlay = list;
      render();
    },
    /** 층별 색과 층 숫자(답한 뒤 — 5차시)를 켜고 끈다 */
    setLayerLook(value) {
      const next = Boolean(value);
      if (next === layerLook) return;
      layerLook = next;
      el.classList.toggle('is-layered', layerLook);
      resetNodes();
      render();
    },
    /** 내가 칠한 층 모양을 층별로 벌린 무대의 그 층 위에 겹친다: [{ z, cells: [{ r, c, state }] }] (벌렸을 때만 보인다. 빈 목록이면 지운다) */
    setLayerOverlay(list = []) {
      layerOverlay = list;
      render();
    },
    step,
    zoomStep,
    resetView,
    snapTo,
    /** 보기를 처음으로(움직임 없이). 문제가 바뀔 때 */
    home() {
      view = homeTurn();
      mixing = null;
      el.classList.remove('is-easing');
      shown = { ...view };
      delete el.dataset.facing;
      emitView();
      render();
    },
    /** 지금 보기 값(검사용): { yaw, pitch, zoom } */
    getView: () => ({ ...view }),
    on(name, fn) {
      listeners[name].add(fn);
      return () => listeners[name].delete(fn);
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      raf = 0;
      mixing = null;
      resizer?.disconnect();
      endGesture();
      clearTimeout(swallowTimer);
      clearTimeout(wheelTimer);
      el.removeEventListener('keydown', onKey);
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onHoverMove);
      el.removeEventListener('pointerleave', onHoverLeave);
      el.removeEventListener('click', onClickCapture, true);
      el.removeEventListener('contextmenu', onContextMenu);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('gesturestart', onGestureStart);
      for (const set of Object.values(listeners)) set.clear();
    },
  };
}

const STAGE_LABEL = '쌓기나무 무대. 옆으로 끌거나 왼쪽·오른쪽 방향키를 누르면 판이 돌고, 위아래로 끌거나 위·아래 방향키를 누르면 내려다보는 높이가 바뀌어요. + 와 - 로 크게 작게 봐요. 1은 위, 2는 앞, 3은 옆에서 보기예요.';
const PICTURE_LABEL = '쌓기나무로 만든 모양 그림이에요. 답한 뒤에 돌려 볼 수 있어요.';
/** 처음 보기(교과서 방향)에서 판 가장자리 글자가 놓이는 쪽 */
const EDGE_SPOT = { front: '왼쪽 아래', right: '오른쪽 아래', back: '오른쪽 위', left: '왼쪽 위' };
/** 멈춘 그림의 가장자리 글자를 말로: "그림의 왼쪽 아래가 앞, 오른쪽 아래가 옆이에요." */
const edgeWords = (list) => `그림의 ${list.map((item, i) => `${EDGE_SPOT[item.at]}가 ${i === list.length - 1 ? josa(item.text, '이에요/예요') : item.text}`).join(', ')}.`;

/** 판 가장자리에서 바깥쪽 방향 [dx, dy] */
const EDGE_OUT = { front: [0, -1], right: [1, 0], back: [0, 1], left: [-1, 0] };
/** 글자가 판 가장자리에서 떨어진 거리(쌓기나무 한 변 = 1): 보통 / 뒤·왼쪽 글자(처음 보기에서 높은 쌓기나무에 가리지 않게 더 멀리) */
const EDGE_NEAR = 0.86;
export const EDGE_FAR = 2.1;
/** 기본 글자: 앞(판의 앞쪽 가장자리) · 옆(오른쪽 가장자리) — 교과서 입체 그림의 표기 */
export const DEFAULT_EDGE = Object.freeze([{ text: '앞', at: 'front' }, { text: '옆', at: 'right' }]);

// ── 조작판 ───────────────────────────────
/**
 * 보는 방향과 크기 조작판(전개도 무대와 같은 자리·이름 — .view-pad)과 그 방향에서 보기 버튼들(.blk-dirs).
 * dirs: [{ id: 'top' | 'front' | 'side' | 'back' | 'left', text, label }]
 * → { pad, dirs, lock(잠그면 둘 다 숨긴다 — 답하기 전), destroy }
 */
export function createViewControls({ ctx, view, dirs = DEFAULT_DIRS }) {
  const { h } = ctx;
  const padButton = (label, cls, name, onclick) => h('button', {
    type: 'button',
    class: `btn btn-icon ${cls}`,
    'aria-label': label,
    title: label,
    onclick: () => {
      ctx.sfx.play('click');
      onclick();
    },
  }, icon(name));
  const turnLeft = padButton('왼쪽으로 돌려 보기', 'view-left', 'rotl', () => view.step('left'));
  const turnRight = padButton('오른쪽으로 돌려 보기', 'view-right', 'rotr', () => view.step('right'));
  const tiltUp = padButton('위쪽으로 돌려 보기', 'view-up', 'up', () => view.step('up'));
  const tiltDown = padButton('아래쪽으로 돌려 보기', 'view-down', 'down', () => view.step('down'));
  const zoomOut = padButton('작게 보기', 'view-out', 'zoomout', () => view.zoomStep(-1));
  const zoomIn = padButton('크게 보기', 'view-in', 'zoomin', () => view.zoomStep(1));
  const home = padButton('처음 보기로', 'view-home', 'cube', () => view.resetView());
  const pad = h('div', { class: 'view-pad blk-viewpad is-locked', role: 'group', 'aria-label': '보는 방향과 크기' },
    turnLeft, turnRight, tiltUp, tiltDown, zoomOut, zoomIn, home);
  const dirButtons = dirs.map((d) => h('button', {
    type: 'button',
    class: 'btn btn-small blk-dir',
    dataset: { dir: d.id },
    'aria-label': d.label,
    title: d.label,
    onclick: () => {
      ctx.sfx.play('click');
      view.snapTo(d.id);
    },
  }, d.icon ? icon(d.icon) : null, h('span', null, d.text)));
  const dirBox = h('div', { class: 'blk-dirs is-locked', role: 'group', 'aria-label': '그 방향에서 보기' }, dirButtons);

  /** 한계에 닿아 꺼지는 버튼에 초점이 있었으면 무대로 옮긴다 (전개도 무대와 같은 처리) */
  function setOff(button, off) {
    if (button.disabled === off) return;
    const focused = off && document.activeElement === button;
    button.disabled = off;
    if (focused) view.el.focus({ preventScroll: true });
  }
  const offView = view.on('view', (s) => {
    for (const b of [turnLeft, turnRight, ...dirButtons]) setOff(b, !s.can);
    // 높이는 수평 ~ 바로 위까지라, 한도에 닿으면 그쪽 버튼이 꺼진다(점선). 판 돌리기는 끝없이
    setOff(tiltUp, !s.can || s.up);
    setOff(tiltDown, !s.can || s.down);
    setOff(zoomIn, !s.can || s.zoomMax);
    setOff(zoomOut, !s.can || s.zoomMin);
    setOff(home, !s.can || s.home);
  });
  const offSay = view.on('say', (text) => ctx.feedback.announce(text));

  return {
    pad,
    dirs: dirBox,
    /** 답하기 전에는 조작판과 방향 버튼을 보이지 않는다 */
    lock(value) {
      const active = document.activeElement;
      pad.classList.toggle('is-locked', value);
      dirBox.classList.toggle('is-locked', value);
      if (value && active && (pad.contains(active) || dirBox.contains(active))) view.el.focus({ preventScroll: true });
    },
    destroy() {
      offView();
      offSay();
    },
  };
}

export const DEFAULT_DIRS = Object.freeze([
  { id: 'top', text: '위', label: '위에서 보기', icon: 'viewtop' },
  { id: 'front', text: '앞', label: '앞에서 보기', icon: 'viewfront' },
  { id: 'side', text: '옆', label: '옆에서 보기', icon: 'viewside' },
]);

// ── 멈춘 그림 한 장 ────────────────────────
/**
 * 교과서 방향의 멈춘 입체 그림(SVG). 그림에 보이는 면만 들어 있고, 판은 그리지 않는다.
 * 크기는 문항과 무관하게 한 가지(쌓기나무 한 변 = unit px, 판 전체가 들어가는 틀)이고, 모양은 틀의 가운데에 놓는다.
 * colors: [줄][칸] = { token, mark } (조형물) · diff: 다르다고 표시할 면들 [{ x, y, z, face }]
 * edges: 교과서처럼 "앞"(왼쪽 아래)·"옆"(오른쪽 아래) 글자와 화살표를 붙인다 — 틀의 아래 두 모서리, 모양과 무관하게 늘 같은 자리
 */
export function createBlockPicture({ map, colors = null, unit = 26, label = '쌓기나무로 만든 모양 그림', diff = [], edges = false, added = [] }) {
  const pose = POSES.home;
  const shapes = sceneShapes(map, pose, { board: false, still: true });
  // 틀: 판 전체(3×3×3)를 그 방향에서 본 크기 (+ 글자를 붙이면 아래에 띠)
  const frame = { w: Math.ceil(unit * 4.4), h: Math.ceil(unit * 5.1) };
  const band = edges ? Math.ceil(unit * PICTURE_BAND) : 0;
  const raw = shapes.map((s) => s.pts.map((p) => projectPoint(pose, unit, 0, 0, p)));
  const all = raw.flat();
  const box = all.length
    ? { x0: Math.min(...all.map((p) => p[0])), x1: Math.max(...all.map((p) => p[0])), y0: Math.min(...all.map((p) => p[1])), y1: Math.max(...all.map((p) => p[1])) }
    : { x0: 0, x1: 0, y0: 0, y1: 0 };
  const dx = frame.w / 2 - (box.x0 + box.x1) / 2;
  const dy = frame.h / 2 - (box.y0 + box.y1) / 2;
  const svg = svgEl('svg', { class: `blk-picture${edges ? ' has-edges' : ''}`, viewBox: `0 0 ${frame.w} ${frame.h + band}`, role: 'img', 'aria-label': label, focusable: 'false' });
  const diffSet = new Set(diff.map((f) => `${f.x},${f.y},${f.z},${f.face}`));
  // added: 더 붙인 쌓기나무 [x, y, z] — 파랑 굵은 점선 테두리(도전 "더 붙여서 만들기"에서 답한 뒤)
  const addedSet = new Set(added.map((c) => c.join(',')));
  shapes.forEach((s, i) => {
    const pts = raw[i].map(([x, y]) => [x + dx, y + dy]);
    const token = colors?.[s.y]?.[s.x]?.token ?? DEFAULT_TOKEN;
    const isDiff = diffSet.has(`${s.x},${s.y},${s.z},${s.face}`);
    const isAdded = addedSet.has(`${s.x},${s.y},${s.z}`);
    const node = svgEl('polygon', { class: `blk-face blk-${s.face}${isDiff ? ' is-diff' : ''}${isAdded ? ' is-added' : ''}`, points: points(pts) });
    node.style.fill = palette(token, s.face);
    svg.append(node);
    const mark = colors?.[s.y]?.[s.x]?.mark;
    if (mark && mark !== 'plain') svg.append(svgEl('path', { class: `blk-mark blk-mark-${mark}`, d: markPath(mark, pts) }));
    if (isDiff) {
      const c = centerOf(pts);
      svg.append(svgEl('text', { class: 'blk-x', x: c[0].toFixed(1), y: c[1].toFixed(1) }, document.createTextNode('✗')));
    }
  });
  if (edges) svg.append(...pictureEdges(frame.w, frame.h + band, unit));
  return svg;
}

/** 그림 아래 띠의 높이(쌓기나무 한 변 = 1) */
const PICTURE_BAND = 0.5;
/**
 * 그림의 "앞"·"옆" 표시: 틀의 왼쪽 아래(앞)·오른쪽 아래(옆)에 글자 칩과, 그 쪽에서 판 안쪽으로 가리키는 화살표(바닥에 누운 세모).
 * 무대의 판 가장자리 화살표와 같은 모습이다 — 앞: 판의 뒤쪽(오른쪽 위로 30°)을 가리키고 날개는 판의 가로 방향, 옆: 판의 왼쪽(왼쪽 위로 30°)
 */
function pictureEdges(w, h, unit) {
  const r = unit * 0.46; // 칩 높이의 절반
  const c30 = Math.cos(Math.PI / 6);
  const out = [];
  for (const [text, at, cx, inward, across] of [
    ['앞', 'front', r + 2, [c30, -0.5], [c30, 0.5]],
    ['옆', 'right', w - r - 2, [-c30, -0.5], [c30, -0.5]],
  ]) {
    const cy = h - r - 2;
    const pt = (d, s = 0) => [cx + inward[0] * d + across[0] * s, cy + inward[1] * d + across[1] * s];
    out.push(svgEl('polygon', { class: 'blk-arrow', points: points([pt(r * 2.5), pt(r * 1.3, r * 0.6), pt(r * 1.3, -r * 0.6)]) }));
    out.push(svgEl('g', { class: `blk-chip blk-edge blk-edge-${at}`, transform: `translate(${cx.toFixed(1)} ${cy.toFixed(1)})` },
      svgEl('rect', { x: (-r).toFixed(1), y: (-r).toFixed(1), width: (2 * r).toFixed(1), height: (2 * r).toFixed(1), rx: r.toFixed(1) }),
      svgEl('text', { x: 0, y: 0 }, document.createTextNode(text))));
  }
  return out;
}
