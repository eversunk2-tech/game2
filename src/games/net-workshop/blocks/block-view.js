/**
 * 쌓기나무 무대와 멈춘 그림 (직접 투영 SVG). 기획서: spec-grade6.md 3절·6-1절
 *
 * 그리기: 원근 없는 투영(평행 투영). 쌓기나무의 면을 <polygon>으로, 눈에서 먼 것부터 차례로 그린다(blocks.js paintOrder) —
 *   브라우저의 3D 정렬에 기대지 않아 깊이 순서가 늘 맞고, 면이 2D 다각형이라 누른 곳의 판정이 정확하다.
 *   [위] [앞] [옆]으로 돌리면 화면의 쌓기나무가 2D 그림과 똑같은 네모들로 보인다.
 * 보기 값: 전개도 무대와 같은 orbit.js의 값({ roll(쌓인 회전), zoom })과 함수(끌기·한 단계·벌리기·휠)를 그대로 쓴다.
 *   처음 보기는 교과서 입체 그림의 방향(앞이 왼쪽 아래, 옆이 오른쪽 아래)이다.
 * 좌표: 모델은 x 오른쪽(칸), y 뒤쪽(줄), z 위쪽(층). 화면은 x 오른쪽, y 아래, z 보는 사람 쪽(orbit.js와 같다).
 *
 * 누르기와 끌기 (3-3절): 누른 곳에서 8px(DRAG_START) 넘게 움직이면 돌리기, 그 전에 떼면 누르기(쌓기·빼기).
 *   돌리기가 시작되면 점선 쌓기나무는 사라지고 아무것도 놓이지 않는다. 끄는 동안의 touchmove는 "썼다"고 알려(preventDefault)
 *   브라우저가 관성 스크롤을 시작하지 않게 한다(끈 직후의 첫 탭이 먹히게 — docs/engine.md 4절).
 * still(멈춘 그림): 조작이 없고, 교과서 방향에서 한 조각이라도 보이는 면만 그린다(숨겨진 쌓기나무는 DOM에도 없다).
 */
import { icon } from '../../../shared/ui/icons.js';
import {
  DRAG_START,
  HOME_WORD,
  MIX_MS,
  TILT_STEP,
  TURN_BUTTON,
  TURN_KEY,
  clamp,
  dragView,
  homeView,
  isHome,
  lookToward,
  mixStep,
  pinchView,
  rollOf,
  rotationMatrix,
  sameLook,
  stepView,
  stepZoom,
  viewLimits,
  wheelView,
  zoomWord,
} from '../orbit.js';
import { COLS, FACE_NORMALS, MAX_H, ROWS, count, picturedFaces, targetOf, visibleFaces } from './blocks.js';

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
const R2 = Math.SQRT1_2;
const R3 = 1 / Math.sqrt(3);
const R6 = 1 / Math.sqrt(6);
/**
 * 모델 방향 → 화면 방향 3×3 행렬(행 우선): 1행 = 화면 오른쪽, 2행 = 화면 아래, 3행 = 보는 사람 쪽.
 * home: 교과서 입체 그림의 방향 — 앞·오른쪽·위가 같은 비율로 보인다(눈이 앞·오른쪽·위에 있다)
 * top: 위에서(앞이 아래, 옆이 오른쪽) · front: 앞에서 · side: 옆(오른쪽)에서 · back: 뒤에서 · left: 왼쪽에서
 */
export const POSES = Object.freeze({
  home: [R2, R2, 0, R6, -R6, -2 * R6, R3, -R3, R3],
  top: [1, 0, 0, 0, -1, 0, 0, 0, 1],
  front: [1, 0, 0, 0, 0, -1, 0, -1, 0],
  side: [0, 1, 0, 0, 0, -1, 1, 0, 0],
  back: [-1, 0, 0, 0, 0, -1, 0, 1, 0],
  left: [0, -1, 0, 0, 0, -1, -1, 0, 0],
  // 처음 보기의 맞은편(뒤·왼쪽·위)에서 비스듬히: 그림에서 가려져 있던 쪽이 보인다
  behind: [-R2, -R2, 0, -R6, R6, -2 * R6, -R3, R3, R3],
});

const mul3 = (a, b) => {
  const out = new Array(9).fill(0);
  for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) for (let k = 0; k < 3; k += 1) out[r * 3 + c] += a[r * 3 + k] * b[k * 3 + c];
  return out;
};
const transpose3 = (m) => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];

/** 회전 행렬 → 사원수 [x, y, z, w] (orbit.js의 roll과 같은 꼴) */
function quatOf(m) {
  const trace = m[0] + m[4] + m[8];
  let q;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    q = [(m[7] - m[5]) / s, (m[2] - m[6]) / s, (m[3] - m[1]) / s, s / 4];
  } else if (m[0] > m[4] && m[0] > m[8]) {
    const s = Math.sqrt(1 + m[0] - m[4] - m[8]) * 2;
    q = [s / 4, (m[1] + m[3]) / s, (m[2] + m[6]) / s, (m[7] - m[5]) / s];
  } else if (m[4] > m[8]) {
    const s = Math.sqrt(1 + m[4] - m[0] - m[8]) * 2;
    q = [(m[1] + m[3]) / s, s / 4, (m[5] + m[7]) / s, (m[2] - m[6]) / s];
  } else {
    const s = Math.sqrt(1 + m[8] - m[0] - m[4]) * 2;
    q = [(m[2] + m[6]) / s, (m[5] + m[7]) / s, s / 4, (m[3] - m[1]) / s];
  }
  return q[3] < 0 ? q.map((v) => -v) : q;
}

/** 처음 보기에서 그 방향 보기로 가는 회전(roll) */
export const rollTo = (name) => (name === 'home' ? [0, 0, 0, 1] : quatOf(mul3(POSES[name], transpose3(POSES.home))));

/** 보기 값의 roll → 자세 행렬 */
export function poseOfRoll(roll) {
  const { axis, angle } = rollOf(roll);
  return Math.abs(angle) < 1e-9 ? [...POSES.home] : mul3(rotationMatrix(axis, angle), POSES.home);
}

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
const liftOf = (z, apart) => (apart ? (z - (MAX_H - 1) / 2) * APART_GAP : 0);

/**
 * 그릴 것들(그리는 순서대로): 판의 자리(tile)와 쌓기나무의 면(face). 점은 모델 좌표.
 * 위에서 보면 판을 먼저(쌓기나무 밑에), 아래에서 보면 판을 맨 나중에(쌓기나무를 가린다 — 무대는 반투명하게 그린다).
 * still이면 교과서 방향의 그림에 보이는 면만.
 * → [{ kind: 'tile', x, y, pts } | { kind: 'face', x, y, z, face, pts }]
 */
export function sceneShapes(map, pose, { apart = false, board = true, still = false } = {}) {
  const d = toViewerOf(pose);
  const tiles = [];
  if (board) {
    for (let y = 0; y < ROWS; y += 1) for (let x = 0; x < COLS; x += 1) tiles.push({ kind: 'tile', x, y, pts: FACE_CORNERS.bottom.map(([dx, dy]) => [x + dx, y + dy, liftOf(0, apart)]) });
  }
  let faces = visibleFaces(map, d, { apart });
  if (still) {
    const pictured = new Set(picturedFaces(map).map((f) => `${f.x},${f.y},${f.z},${f.face}`));
    faces = faces.filter((f) => pictured.has(`${f.x},${f.y},${f.z},${f.face}`));
  }
  const shapes = faces.map((f) => {
    const lift = liftOf(f.z, apart);
    return { kind: 'face', ...f, pts: FACE_CORNERS[f.face].map(([dx, dy, dz]) => [f.x + dx, f.y + dy, f.z + dz + lift]) };
  });
  return d[2] >= 0 ? [...tiles, ...shapes] : [...shapes, ...tiles];
}

/** 판 전체(3×3×3)의 가운데 */
const CENTER = [COLS / 2, ROWS / 2, MAX_H / 2];
/** 모델 점 → 화면 점 [x, y] (k = 쌓기나무 한 변의 화면 길이, 가운데 = [cx, cy]) */
export const projectPoint = (pose, k, cx, cy, p) => {
  const x = p[0] - CENTER[0];
  const y = p[1] - CENTER[1];
  const z = p[2] - CENTER[2];
  return [cx + k * (pose[0] * x + pose[1] * y + pose[2] * z), cy + k * (pose[3] * x + pose[4] * y + pose[5] * z)];
};
/** 모델 점의 깊이(클수록 눈에 가깝다) */
export const depthOf = (pose, p) => pose[6] * (p[0] - CENTER[0]) + pose[7] * (p[1] - CENTER[1]) + pose[8] * (p[2] - CENTER[2]);

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

const points = (pts) => pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
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
export function createBlockView({ h, still = false, board = true, edge = DEFAULT_EDGE, names = SIDE_NAMES }) {
  const gBack = svgEl('g', { class: 'blk-marks blk-marks-back' }); // 쌓기나무 뒤쪽에 있는 판 가장자리 글자(쌓기나무에 가려진다)
  const gShapes = svgEl('g', { class: 'blk-shapes' });
  const gGhost = svgEl('g', { class: 'blk-ghost' });
  const gMarks = svgEl('g', { class: 'blk-marks' });
  const svg = svgEl('svg', { class: 'blk-svg', 'aria-hidden': 'true', focusable: 'false' }, gBack, gShapes, gGhost, gMarks);
  const el = h('div', { class: `blk-stage${still ? ' is-still' : ''}`, tabindex: still ? null : '0', role: 'group', 'aria-label': STAGE_LABEL }, svg);
  let label = null; // 단계가 준 이름(없으면 기본 이름)

  let map = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
  let colors = null; // [줄][칸] = { token, mark } (조형물) 또는 null
  let view = homeView(); // 학생 보기 { spin(쓰지 않음), roll, zoom }
  let shown = { roll: [...view.roll], zoom: view.zoom }; // 지금 화면의 모습 (돌아가는 움직임 도중에는 view와 다르다)
  let frozen = still; // 멈춘 그림처럼 그리는 중(답하기 전)
  let withBoard = board;
  let editable = false;
  let viewOn = false;
  let mode = 'add';
  let apart = false;
  let hover = null; // 마우스가 올라가 있거나 손가락이 누르고 있는 곳(hit)
  let marks = { hidden: [], diff: [], goal: null, layers: false, hiddenText: null, counted: [], tally: [] };
  let overlay = []; // 내가 그린 2D 그림을 그 방향의 무대 위에 겹친다 [{ dir: 'top' | 'front' | 'side', cells: [{ r, c, state }] }]
  let size = { w: 0, h: 0, unit: 40 };
  let raf = 0;
  let mixing = null; // { t0, p }
  let destroyed = false;
  let orderSig = '';
  const shapeEls = new Map(); // 열쇠 → <polygon>
  const markEls = new Map(); // 열쇠 → <path> (조형물 무늬)
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
    size = { w: box.width, h: box.height, unit: unitFor(box.width, box.height, overlaid ? SIDE_ROOM : 0) };
    svg.setAttribute('viewBox', `0 0 ${box.width.toFixed(1)} ${box.height.toFixed(1)}`);
    el.style.setProperty('--blk-unit', `${size.unit}px`);
  }

  const scaleNow = () => size.unit * shown.zoom * (apart ? APART_FIT : 1);
  const tokenAt = (x, y) => colors?.[y]?.[x]?.token ?? DEFAULT_TOKEN;

  function render() {
    if (destroyed) return;
    const pose = poseOfRoll(shown.roll);
    const d = toViewerOf(pose);
    const k = scaleNow();
    const cx = size.w / 2;
    const cy = size.h / 2;
    const at = (p) => projectPoint(pose, k, cx, cy, p);
    const shapes = sceneShapes(map, pose, { apart, board: withBoard, still: frozen });
    const used = new Set();
    const usedMarks = new Set();
    const order = [];
    const hiddenSet = new Set(marks.hidden.map((c) => c.join(',')));
    const diffSet = new Set(marks.diff.map((f) => `${f.x},${f.y},${f.z},${f.face}`));
    const countedSet = new Set(marks.counted.map((c) => c.join(',')));
    for (const s of shapes) {
      const key = s.kind === 'tile' ? `t${s.x},${s.y}` : `f${s.x},${s.y},${s.z},${s.face}`;
      let node = shapeEls.get(key);
      if (!node) {
        // 자리 값(data-*)과 색은 만들 때 한 번만 싣는다. 멈춘 그림에는 자리 값을 싣지 않는다
        // (보이는 면이 어느 깊이의 쌓기나무인지는 그림이 알려 주지 않는 것이다)
        node = svgEl('polygon', frozen ? {} : { 'data-kind': s.kind, 'data-x': s.x, 'data-y': s.y, 'data-z': s.z, 'data-face': s.face });
        if (s.kind === 'face') node.style.fill = palette(tokenAt(s.x, s.y), s.face);
        shapeEls.set(key, node);
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
    // 그리는 순서가 바뀌었을 때만 DOM 순서를 다시 맞춘다
    const sig = shapes.map((s) => (s.kind === 'tile' ? `t${s.x}${s.y}` : `${s.x}${s.y}${s.z}${s.face[0]}${s.face[1]}`)).join('|');
    if (sig !== orderSig) {
      orderSig = sig;
      gShapes.replaceChildren(...order);
    }
    renderGhost(pose, d, at);
    renderMarks(pose, d, at, k);
    // 내가 쌓은 개수(검사용). 멈춘 그림에는 싣지 않는다
    if (frozen) delete el.dataset.count;
    else el.dataset.count = String(count(map));
  }

  /** 면·판의 요소를 모두 버린다(다음에 그릴 때 새로 만든다): 멈춘 그림 ↔ 입체, 조형물 색이 바뀔 때 */
  function resetNodes() {
    shapeEls.clear();
    markEls.clear();
    gShapes.replaceChildren();
    orderSig = '';
  }

  /** 놓일 자리(점선 쌓기나무) · 빠질 쌓기나무 */
  function renderGhost(pose, d, at) {
    const target = editable && hover ? targetOf(map, hover, mode) : null;
    if (!target || target.error) {
      gGhost.replaceChildren();
      for (const name of ['x', 'y', 'z']) delete gGhost.dataset[name];
      return;
    }
    const nodes = [];
    for (const [face, corners] of Object.entries(FACE_CORNERS)) {
      const n = FACE_NORMALS[face];
      if (n[0] * d[0] + n[1] * d[1] + n[2] * d[2] <= 1e-6) continue;
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

  const chip = (text, [x, y], cls = '') => {
    const width = Math.max(30, [...text].length * 15 + 14);
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
      if (facing === 'side') return [[COLS + 0.02, c, r], [COLS + 0.02, c + 1, r], [COLS + 0.02, c + 1, r + 1], [COLS + 0.02, c, r + 1]];
      return [[c, r, MAX_H + 0.02], [c + 1, r, MAX_H + 0.02], [c + 1, r + 1, MAX_H + 0.02], [c, r + 1, MAX_H + 0.02]];
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

  /** 판 가장자리 글자(앞·옆, 가~라)와 화살표, 층별 개수, "숨어 있었어요", 다른 곳 ✗ */
  function renderMarks(pose, d, at, k) {
    const nodes = [];
    const backNodes = [];
    if (withBoard) {
      // 판을 거의 옆에서 볼 때(판이 선으로 보일 때)는 가까운 쪽 글자를 바닥 선 아래로 내리고, 먼 쪽 글자는 그리지 않는다(쌓기나무 뒤다)
      const flat = clamp(1 - Math.abs(d[2]) / 0.3, 0, 1);
      const drop = flat * 22;
      const base = liftOf(0, apart);
      for (const item of edgeList) {
        const [ox, oy] = EDGE_OUT[item.at];
        const out = item.out ?? EDGE_NEAR;
        const edgeMid = [COLS / 2 + ox * (COLS / 2), ROWS / 2 + oy * (ROWS / 2), base];
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
      for (let z = 0; z < MAX_H; z += 1) {
        const n = map.reduce((sum, row) => sum + row.filter((v) => v > z).length, 0);
        if (n === 0) continue;
        const [, y] = at([CENTER[0], CENTER[1], z + 0.5 + liftOf(z, apart)]);
        nodes.push(chip(`${z + 1}층 ${n}개`, [Math.max(52, size.w / 2 - k * 2.9), y], 'blk-layer'));
      }
    }
    if (marks.hidden.length && !frozen) {
      const [x, y, z] = marks.hidden[0];
      const spot = at([x + 0.5, y + 0.5, z + 0.5 + liftOf(z, apart)]);
      nodes.push(chip(marks.hiddenText ?? '숨어 있었어요', [spot[0], spot[1] - k * 0.75], 'blk-hid'));
    }
    // 자리마다 센 수(수 쓰기를 맞힌 뒤): 그 자리의 맨 위 쌓기나무의 윗면 가운데에
    for (const t of marks.tally) {
      const spot = at([t.x + 0.5, t.y + 0.5, t.z + 1 + liftOf(t.z, apart)]);
      nodes.push(chip(String(t.n), spot, 'blk-tally'));
    }
    if (!frozen && !mixing && overlay.length) nodes.push(...overlayNodes(pose, at, k));
    for (const f of marks.diff) {
      const lift = liftOf(f.z, apart);
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

  const emitView = () => emit('view', { can: canView(), ...viewLimits(view) });

  /** 지금 화면의 모습에서 view로 짧은 움직임(0.2초)으로 간다. 움직임 줄이기·?fx=low면 바로 */
  function easeToView() {
    const target = { roll: view.roll, zoom: view.zoom };
    if (instant() || sameLook(shown, target)) {
      mixing = null;
      shown = { roll: [...view.roll], zoom: view.zoom };
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
    shown = lookToward(shown, { roll: view.roll, zoom: view.zoom }, mixStep(mixing.p, p));
    mixing.p = p;
    if (p >= 1) {
      mixing = null;
      shown = { roll: [...view.roll], zoom: view.zoom };
      el.classList.remove('is-easing');
    }
  }
  /** 끌기·휠처럼 손을 바로 따라가는 조작: 움직임 없이 그 모습으로 */
  function follow() {
    mixing = null;
    delete el.dataset.facing;
    el.classList.remove('is-easing');
    shown = { roll: [...view.roll], zoom: view.zoom };
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
    const word = poseWord(poseOfRoll(view.roll), names);
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
      gesture = { mode: 'wait', x: event.clientX, y: event.clientY, hit, right, word: poseWord(poseOfRoll(view.roll), names), zoom: view.zoom };
      // 터치: 누르는 동안 놓일 곳이 점선 쌓기나무로 보인다(떼면 놓인다. 끌면 돌리기로 바뀌어 사라진다)
      if (editable && !right && event.pointerType !== 'mouse') setHover(hit);
      globalThis.addEventListener('pointermove', onPointerMove);
      globalThis.addEventListener('pointerup', onPointerUp);
      globalThis.addEventListener('pointercancel', onPointerCancel);
      globalThis.addEventListener('touchmove', onTouchMove, TOUCH_MOVE);
      return;
    }
    // 두 번째 손가락: 벌리기·오므리기 (누르기는 없던 일로)
    if (!canView()) return;
    const [a, b] = [...pointers.values()];
    gesture = { ...gesture, mode: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom0: view.zoom };
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
      view = pinchView(view, gesture.zoom0, gesture.dist, Math.hypot(a.x - b.x, a.y - b.y));
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
    view = dragView(view, dx, dy); // 끈 방향으로 구른다(화면 기준, 한계 없음)
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

  /** 한 단계 돌린다(조작판 버튼·방향키). 보는 방향의 말("위에서 본 모습" 등)이 바뀌면 알린다 — 전개도 무대와 같다 */
  function turnStep(dir, degrees) {
    const before = poseWord(poseOfRoll(view.roll), names);
    moveTo(stepView(view, dir, degrees));
    const after = poseWord(poseOfRoll(view.roll), names);
    if (after !== before) say(after);
  }
  function step(dir) {
    if (!canView()) return false;
    turnStep(dir, dir === 'left' || dir === 'right' ? TURN_BUTTON : TILT_STEP);
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
    if (isHome(view)) return true;
    moveTo(homeView());
    say(HOME_WORD);
    return true;
  }
  /** 그 방향에서 본 모습으로 돌린다: 'top' · 'front' · 'side' · 'back' · 'left' · 'home'. force면 보기 조작이 꺼져 있어도(단계가 보여 줄 때) */
  function snapTo(name, { force = false, quiet = false } = {}) {
    if (!POSES[name] || (!force && !canView())) return false;
    moveTo({ ...view, roll: rollTo(name) });
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
    if (key === 'ArrowLeft') turnStep('left', TURN_KEY);
    else if (key === 'ArrowRight') turnStep('right', TURN_KEY);
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
    el.setAttribute('aria-label', label ?? (frozen ? PICTURE_LABEL : STAGE_LABEL));
    if (!still) el.setAttribute('tabindex', frozen ? '-1' : '0');
    el.classList.toggle('can-edit', editable && !frozen);
    el.classList.toggle('can-view', canView());
    el.classList.toggle('is-frozen', frozen);
    el.classList.toggle('is-remove', editable && mode === 'remove');
  };

  return {
    el,
    /** 높이 지도(와 조형물 색 [줄][칸] = { token, mark })를 바꿔 그린다 */
    setMap(next, { colors: nextColors } = {}) {
      map = next.map((row) => [...row]);
      if (nextColors !== undefined) {
        colors = nextColors;
        resetNodes();
      }
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
    /** 멈춘 그림 ↔ 입체: 답한 뒤 false로 바꾸면 숨겨졌던 쌓기나무와 판이 나타난다 */
    setFrozen(value, { board: showBoard } = {}) {
      frozen = Boolean(value);
      if (showBoard !== undefined) withBoard = showBoard;
      resetNodes();
      syncClasses();
      emitView();
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
    step,
    zoomStep,
    resetView,
    snapTo,
    /** 보기를 처음으로(움직임 없이). 문제가 바뀔 때 */
    home() {
      view = homeView();
      mixing = null;
      el.classList.remove('is-easing');
      shown = { roll: [...view.roll], zoom: view.zoom };
      delete el.dataset.facing;
      emitView();
      render();
    },
    /** 지금 보기 값(검사용): { roll, zoom } */
    getView: () => ({ roll: [...view.roll], zoom: view.zoom }),
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

const STAGE_LABEL = '쌓기나무 무대. 끌거나 방향키로 돌려 보고, + 와 - 로 크게 작게 봐요. 1은 위, 2는 앞, 3은 옆에서 보기예요.';
const PICTURE_LABEL = '쌓기나무로 만든 모양 그림이에요. 답한 뒤에 돌려 볼 수 있어요.';

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
    for (const b of [turnLeft, turnRight, tiltUp, tiltDown, ...dirButtons]) setOff(b, !s.can);
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
 */
export function createBlockPicture({ map, colors = null, unit = 26, label = '쌓기나무로 만든 모양 그림', diff = [] }) {
  const pose = POSES.home;
  const shapes = sceneShapes(map, pose, { board: false, still: true });
  // 틀: 판 전체(3×3×3)를 그 방향에서 본 크기
  const frame = { w: Math.ceil(unit * 4.4), h: Math.ceil(unit * 5.1) };
  const raw = shapes.map((s) => s.pts.map((p) => projectPoint(pose, unit, 0, 0, p)));
  const all = raw.flat();
  const box = all.length
    ? { x0: Math.min(...all.map((p) => p[0])), x1: Math.max(...all.map((p) => p[0])), y0: Math.min(...all.map((p) => p[1])), y1: Math.max(...all.map((p) => p[1])) }
    : { x0: 0, x1: 0, y0: 0, y1: 0 };
  const dx = frame.w / 2 - (box.x0 + box.x1) / 2;
  const dy = frame.h / 2 - (box.y0 + box.y1) / 2;
  const svg = svgEl('svg', { class: 'blk-picture', viewBox: `0 0 ${frame.w} ${frame.h}`, role: 'img', 'aria-label': label, focusable: 'false' });
  const diffSet = new Set(diff.map((f) => `${f.x},${f.y},${f.z},${f.face}`));
  shapes.forEach((s, i) => {
    const pts = raw[i].map(([x, y]) => [x + dx, y + dy]);
    const token = colors?.[s.y]?.[s.x]?.token ?? DEFAULT_TOKEN;
    const isDiff = diffSet.has(`${s.x},${s.y},${s.z},${s.face}`);
    const node = svgEl('polygon', { class: `blk-face blk-${s.face}${isDiff ? ' is-diff' : ''}`, points: points(pts) });
    node.style.fill = palette(token, s.face);
    svg.append(node);
    const mark = colors?.[s.y]?.[s.x]?.mark;
    if (mark && mark !== 'plain') svg.append(svgEl('path', { class: `blk-mark blk-mark-${mark}`, d: markPath(mark, pts) }));
    if (isDiff) {
      const c = centerOf(pts);
      svg.append(svgEl('text', { class: 'blk-x', x: c[0].toFixed(1), y: c[1].toFixed(1) }, document.createTextNode('✗')));
    }
  });
  return svg;
}
