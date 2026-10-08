/**
 * CSS 3D 무대 (브라우저). 면은 <button>을 형제로 나란히 두고, foldNet이 준 4×4 행렬을 matrix3d()로 넣는다.
 * 경첩마다 DOM을 겹쳐 넣지 않아서 clip-path·opacity가 3D를 평평하게 만드는 문제가 없다.
 * 모습: 재단 매트(.mat, 게임 색) 위의 색종이 면(var(--face-n), 잉크 테두리). 접기 조작은 매트 아래쪽 띠(.mat-tools).
 *
 * 무대 상태: .fold-stage[data-fold] = flat(펼침) · folding(접는 중) · half(반 접힘) · partial · done(다 접음)
 * 움직임 줄이기(prefers-reduced-motion)면 애니메이션 대신 펼침 → 반 접힘 → 다 접힘 3장면.
 *
 * 돌려 보기·크게 작게 (spec 17절): 답한 뒤(접기 막대가 풀린 뒤) 접힌 입체에서만 된다 — .fold-stage.can-view.
 * 끌기(마우스·한 손가락)·두 손가락 벌리기·휠·방향키와 + − 0·조작판 버튼(.view-pad)이 모두 같은 보기 값(orbit.js)을 바꾼다.
 * 펼친 전개도는 늘 위에서 본 처음 크기라 답하기 전 화면은 문항·조작과 무관하게 같다(가로 돌림만 지금처럼 된다).
 */
import { icon } from '../../shared/ui/icons.js';
import { LABELS, foldNet, fullVertices, missingSlots, overlappingPairs } from './fold.js';
import {
  add,
  applyDir,
  bounds,
  dot,
  identity,
  multiply,
  scale as scaleVec,
  scaling,
  sub,
  toCssMatrix,
  translation,
} from './geometry.js';
import {
  DRAG_START,
  HOME_WORD,
  SPIN,
  TILT,
  TURN_BUTTON,
  TURN_KEY,
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
} from './orbit.js';

const DURATION = 1300; // 끝까지 접는 데 걸리는 시간(ms)
const SCENE_GAP = 550; // 움직임 줄이기에서 장면 사이 시간(ms)
const MAX_UNIT = 116;
const MIN_UNIT = 30;
const TAP = 48; // 누르는 곳(빈 자리 버튼) 최소 크기(px)
const MAX_ZOOM = 1.7; // 다 접은 입체를 이만큼까지 크게 본다
const RASTER_MAX = 4; // 선명하게 그리는 배수의 위쪽 끝 (자동 맞춤 1.7 × 학생 배율 2 = 3.4배까지 본다)
const PAD_GAP = 8; // 펼친 전개도의 면·빈 자리와 보기 조작판 사이에 두는 틈(px)
// 한 꼭짓점에 네 면이 모인 전개도는 덩어리에 붙은 경첩만 약 56°까지 접히고 멈춘다.
// (65°에서는 덩어리 양쪽에 접힌 면이 비스듬해 좁게 보였다 — net-workshop 재검토 2 R3)
const STUCK_AT = 0.62;
/** 색종이 면 색: 디자인 토큰 --face-1 ~ --face-8 (가 노랑, 나 하늘, 다 연두, 라 분홍, 마 보라, 바 귤색 …) */
export const faceColor = (label) => `var(--face-${(Math.max(0, LABELS.indexOf(label)) % 8) + 1})`;

export const prefersReducedMotion = () => Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

const rad = (deg) => (deg * Math.PI) / 180;

/** 처음 시점(tilt, SPIN)에서 turn만큼 더 돌렸을 때 방향 벡터가 화면에서 어디를 향하나 (z > 0이면 보는 쪽) */
export const viewDirection = (v, turn = 0, tilt = TILT) => viewDir(v, tilt, SPIN + turn);

/**
 * 한 꼭짓점에 네 면이 모인(2×2 덩어리) 전개도의 "멈추는 장면" 접기 규칙. 없으면 null.
 * 덩어리 안 경첩은 접히지 않고, 덩어리에 붙은 경첩만 약 65°에서 멈춘다.
 * 덩어리에서 떨어진 면끼리의 경첩은 접지 않아(한 장처럼 붙어) 덩어리 밑으로 말려 들어가 가려지지 않는다.
 */
export function stuckTOf(net, blocked = fullVertices(net)) {
  if (blocked.length === 0) return null;
  const blockFaces = new Set(blocked.flatMap((v) => v.faces));
  return (hinge, value) => (blockFaces.has(hinge.a) !== blockFaces.has(hinge.b) ? value * STUCK_AT : 0);
}

const isAxisRect = (poly) =>
  poly.length === 4 && poly.every((p, i) => {
    const q = poly[(i + 1) % 4];
    return Math.abs(p[0] - q[0]) < 1e-9 || Math.abs(p[1] - q[1]) < 1e-9;
  });

const ease = (p) => (p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) ** 2) / 2);

// 기본 시점(TILT, SPIN)에서 잘 보이는 면의 법선: 위 > 앞 > 왼쪽
const SEEN_NORMALS = [[0, 0, 1], [0, 1, 0], [-1, 0, 0]];
const seenScore = (normal) => {
  const i = SEEN_NORMALS.findIndex((v) => dot(v, normal) > 0.99);
  return i < 0 ? 0 : SEEN_NORMALS.length - i;
};

// 다 접을 때 더 돌려 볼 수 있는 각도 (세로축 둘레, CSS rotateZ와 같은 방향)
const TURNS = [0, 90, 180, 270];
const FINE_TURNS = Array.from({ length: 24 }, (_, i) => i * 15);

// 2×2 장면의 기울기 후보(큰 것부터). 접힌 면이 덩어리 양쪽에 있으면 조금 덜 기울여 내려다봐야 둘 다 잘 보인다.
const BLOCK_TILTS = [TILT, 48, 40, 34, 28, 22];
const WELL_SEEN = 0.5; // 면의 법선이 보는 쪽을 이만큼 이상 향하면 "잘 보인다" (≈ 펼친 넓이의 절반 이상이 보임)

/** 덩어리(바닥) 면의 글자가 화면에서 바로 서 있는 정도: 1이면 똑바로, -1이면 거꾸로 */
const uprightness = (turn, tilt) => {
  const down = viewDirection([0, 1, 0], turn, tilt);
  return down[1] / (Math.hypot(down[0], down[1]) || 1);
};

/**
 * 2×2 덩어리 전개도: 덩어리 면을 바닥에 두고(펼친 채), 접히다 멈춘 면들이 모두 보는 쪽을 향하게 돌린다.
 * 가장 덜 보이는 면이 가장 잘 보이는 각도(turn)를 고르고, 그래도 잘 안 보이면 기울기(tilt)를 줄인다.
 * 거의 같게(0.02 안) 잘 보이는 각도가 여럿이면 덩어리 글자가 바로 서는 각도를 고른다 (재검토 2 R3).
 */
function displayBlocked(net, blocked) {
  const blockFaces = new Set(blocked.flatMap((v) => v.faces));
  const root = blockFaces.has(net.root) ? net.root : net.faces.find((f) => blockFaces.has(f.id)).id;
  const candidate = root === net.root ? net : { ...net, root };
  const folded = foldNet(candidate, 1, { tOf: stuckTOf(candidate, blocked) });
  let best = null;
  for (const tilt of BLOCK_TILTS) {
    const scored = FINE_TURNS.map((turn) => {
      const zs = folded.faces.map((f) => viewDirection(f.normal, turn, tilt)[2]);
      return { turn, tilt, worst: Math.min(...zs), sum: zs.reduce((a, b) => a + b, 0), upright: uprightness(turn, tilt) };
    });
    const top = Math.max(...scored.map((x) => x.worst));
    best = scored
      .filter((x) => x.worst >= top - 0.02)
      .reduce((a, b) => (b.upright > a.upright + 1e-9 || (Math.abs(b.upright - a.upright) <= 1e-9 && b.sum > a.sum + 1e-9) ? b : a));
    if (best.worst >= WELL_SEEN) break;
  }
  return { net: candidate, turn: best.turn, tilt: best.tilt };
}
const turnNormal = (n, deg) => {
  const b = rad(deg);
  return [n[0] * Math.cos(b) - n[1] * Math.sin(b), n[0] * Math.sin(b) + n[1] * Math.cos(b), n[2]];
};
const isBottom = (normal) => normal[2] < -0.99;
const isTopOrBottom = (normal) => Math.abs(normal[2]) > 0.99;

/**
 * 화면에 놓을 바닥 면(root)과 다 접었을 때 더 돌릴 각도(turn)를 고른다. 판정은 root와 상관없고 보이는 모습만 달라진다.
 * - 틀린 전개도: 겹친 면이 위·앞·왼쪽(처음 시점에서 보이는 쪽)에 오게 한다.
 *   빈 자리("비어요")는 바닥에 두지 않는다 — 바닥은 [↺][↻]로 돌려도 안 보인다.
 * - focus: 옆면에 둘 면 id들. 마지막 면은 처음 시점에서 보이게 한다.
 *   마주 보는 면 단계는 [★ 면, 정답 면] — 마주 보는 두 면은 한 시점에서 함께 보일 수 없으므로 ★ 면은 [↺][↻]로 돌려 본다.
 *   면 붙이기에서 맞힌 경우는 [붙인 면].
 */
export function displayNet(net, { focus = [] } = {}) {
  // 돌려주는 값: { net(바닥 면을 고른 전개도), turn(더 돌릴 각도), tilt(다 접었을 때 기울기) }
  const blocked = fullVertices(net);
  if (blocked.length > 0) return displayBlocked(net, blocked);
  let best = null;
  const roots = [net.root, ...net.faces.map((f) => f.id).filter((id) => id !== net.root)];
  for (const root of roots) {
    const candidate = root === net.root ? net : { ...net, root };
    const folded = foldNet(candidate, 1);
    const normalOf = (id) => folded.faces.find((f) => f.id === id).normal;
    const pairs = overlappingPairs(folded);
    const missing = missingSlots(candidate, folded);
    for (const turn of TURNS) {
      let s = 0;
      for (const [a] of pairs) s += 10 * seenScore(turnNormal(normalOf(a), turn));
      for (const slot of missing) s += isBottom(slot.normal) ? -100 : seenScore(turnNormal(slot.normal, turn));
      for (const id of focus) if (isTopOrBottom(normalOf(id))) s -= 20;
      if (focus.length > 0) s += seenScore(turnNormal(normalOf(focus[focus.length - 1]), turn));
      if (!best || s > best.score) best = { net: candidate, turn, score: s };
    }
  }
  return { net: best.net, turn: best.turn, tilt: TILT };
}

/**
 * 전개도 무대를 만든다.
 * @param {object} p
 * @param {Function} p.h               요소 만들기 도우미
 * @param {boolean} [p.interactive]    면을 눌러 답하는 단계면 true (Tab으로 면에 갈 수 있다)
 * @param {(faceId: string) => void} [p.onFaceClick]
 * @param {{ play: Function }} [p.sfx] 주면 접기 시작할 때 'fold' 소리 (ctx.sfx)
 * @param {boolean} [p.still]          그림으로만 쓰는 무대(처음 화면): 초점·키보드·화면 읽기에서 빠진다
 */
export function createNetView({ h, interactive = false, onFaceClick = null, sfx = null, still = false }) {
  const scene = h('div', { class: 'net-scene' });
  const badge = h('p', { class: 'stage-badge', hidden: true });
  const el = h('div', {
    class: `fold-stage${still ? ' is-still' : ''}`,
    tabindex: still ? null : '0',
    role: still ? null : 'group',
    'aria-label': still ? null : '전개도 무대. 접은 뒤에는 끌거나 방향키로 돌려 보고, 더하기·빼기 키로 크게·작게 볼 수 있어요. 0 키는 처음 보기예요.',
    'aria-hidden': still ? 'true' : null,
    inert: still,
    dataset: { fold: 'flat' },
  }, scene, badge);

  let net = null;
  let slots = [];
  let t = 0;
  let view = homeView(); // 학생이 바꾼 보기 { spin, lift, zoom } (orbit.js). 새 전개도가 놓이면 처음으로
  let viewOn = false; // 보기 조작(끌기·위아래·크게 작게)을 켰나 — 접기 막대가 풀릴 때(답한 뒤) 함께 켠다
  let unit = 60;
  let zoom = 1; // 자동 맞춤 배율: 다 접은 입체를 무대에 맞게
  // 선명하게 그리는 배수(1~4): 브라우저는 3D 면을 놓인 크기(1배)로 그려 두고 늘리므로, 크게 볼 때는 면을 이만큼 크게 놓고
  // (--unit × raster, 테두리·빗금은 --k) 무대 변환을 그만큼 줄인다. 보이는 크기·자리는 같고 글자·빗금만 또렷해진다.
  // 멈춰 있을 때만 바꾼다(settle) — 끌기·접는 움직임 동안에는 transform만 바뀐다. 답하기 전·펼친 상태·처음 화면 그림은 늘 1
  let raster = 1;
  let baseTurn = 0;
  let baseTilt = TILT;
  let revealed = false;
  let tOf = null;
  let blocked = []; // 한 꼭짓점에 네 면이 모인 곳
  let layout = null; // { unit, origin: [x, y] } 펼친 상태를 놓는 판의 칸과 같은 자리·크기로 (자유 배치)
  let layoutBox = null; // layout을 맞춘 때의 무대 크기
  let padEl = null; // 무대 오른쪽 위에 겹쳐 놓인 보기 조작판 — 펼친 전개도가 그 밑에 들어가지 않게 한다 (keepClear)
  let faceEls = new Map();
  let slotEls = new Map();
  let markEls = [];
  let marksShown = false; // 다 접힌 뒤의 표시(겹침·빈 자리·이름표)가 보이는 중
  let marksKey = '';
  let marksOk = false;
  let hintEl = null; // 이름표의 "돌려 보면 빈 자리가 보여요"
  let unseenSlots = []; // 아직 한 번도 보이지 않은 빈 자리 (모두 보이면 안내를 끄고 다시 켜지 않는다)
  let hintDone = false;
  let raf = 0;
  const timers = new Set();
  const listeners = new Set();
  const markListeners = new Set();
  const viewListeners = new Set();
  const dragListeners = new Set();
  const sayListeners = new Set();
  let viewKey = '';
  let destroyed = false;

  const later = (fn, ms) => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  };

  function stopAnimation() {
    cancelAnimationFrame(raf);
    raf = 0;
    for (const id of timers) clearTimeout(id);
    timers.clear();
  }

  function foldState() {
    if (t <= 1e-6) return 'flat';
    if (t >= 1 - 1e-6) return 'done';
    if (Math.abs(t - 0.5) < 1e-6) return 'half';
    return 'partial';
  }

  // ── 크기 ─────────────────────────────
  function flatPoints() {
    const pts = net ? net.faces.flatMap((f) => f.poly) : [];
    for (const s of slots) pts.push(s.cell, [s.cell[0] + 1, s.cell[1] + 1]);
    return pts;
  }

  let boxSize = { width: 600, height: 400 };
  function measure() {
    if (!net) return;
    const { min, max } = bounds(flatPoints());
    const box = el.getBoundingClientRect();
    const width = box.width || 600;
    const height = box.height || 400;
    boxSize = { width, height };
    const fit = (margin) => Math.floor(Math.min(width / (max[0] - min[0] + margin), height / (max[1] - min[1] + margin)));
    let size = fit(0.9);
    // 보기 조작판 밑에 면·빈 자리가 들어가는 모양만 줄인다(조작판과 틈 8px). 안 겹치는 모양은 지금 크기 그대로
    if (Math.min(MAX_UNIT, size) > padLimit(box, min, max, 0)) size = Math.min(size, Math.floor(padLimit(box, min, max, PAD_GAP)));
    // 빈 자리 버튼이 있으면 가장자리 여백을 줄여서라도 48px 이상으로 (좁은 휴대폰)
    if (slots.length > 0 && size < TAP) size = Math.max(size, Math.min(TAP, fit(0.1)));
    unit = layout ? layout.unit : Math.max(MIN_UNIT, Math.min(MAX_UNIT, size));
    zoom = blocked.length > 0 ? 1 : Math.max(1, Math.min(MAX_ZOOM, Math.min(width, height) / (3.3 * unit)));
    applyRaster();
  }

  /**
   * 보기 조작판(무대 오른쪽 위 모서리)의 버튼이 펼친 전개도의 면·빈 자리를 가리지 않는(틈 gap px) 가장 큰 칸 크기(px). 가릴 일이 없으면 Infinity.
   * 전개도는 무대 가운데에 놓이므로, 오른쪽 위 칸이 버튼의 왼쪽 변보다 왼쪽에 있거나 아래쪽 변보다 아래에 있으면 된다
   * (십자 모양이라 버튼이 없는 아래 두 모서리 칸에는 면이 들어가도 된다).
   * 조작판이 무대 밖에 있을 때(휴대폰의 아래 띠)·숨겨졌을 때·판 자리를 맞출 때(자유 배치 layout)는 줄이지 않는다.
   */
  function padLimit(box, min, max, gap) {
    if (!padEl || layout) return Infinity;
    const mid = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2];
    const rects = net.faces.map((f) => bounds(f.poly)).concat(slots.map((s) => ({ min: s.cell, max: [s.cell[0] + 1, s.cell[1] + 1] })));
    let limit = Infinity;
    for (const button of padEl.querySelectorAll('button')) {
      const b = button.getBoundingClientRect();
      if (b.width === 0 || b.left >= box.right || b.right <= box.left || b.top >= box.bottom || b.bottom <= box.top) continue;
      const roomX = b.left - box.left - gap - box.width / 2; // 무대 가운데에서 버튼 왼쪽 변까지
      const roomY = box.height / 2 - (b.bottom - box.top) - gap; // 버튼 아래쪽 변에서 무대 가운데까지
      for (const r of rects) {
        const right = r.max[0] - mid[0]; // 칸의 오른쪽 변이 가운데에서 떨어진 정도(칸)
        const up = mid[1] - r.min[1]; // 칸의 위쪽 변이 가운데보다 위에 있는 정도(칸)
        if (right <= 0) continue;
        const byWidth = roomX / right;
        const byHeight = up > 0 ? roomY / up : roomY >= 0 ? Infinity : 0;
        limit = Math.min(limit, Math.max(byWidth, byHeight));
      }
    }
    return limit;
  }

  /** 면을 놓는 크기(칸 한 변 px)와 테두리·빗금 굵기 배수를 무대에 준다 */
  function applyRaster() {
    scene.style.setProperty('--unit', `${unit * raster}px`);
    if (raster === 1) scene.style.removeProperty('--k');
    else scene.style.setProperty('--k', String(raster));
  }

  /** 멈춰 있을 때 부른다: 지금 보이는 배율에 맞춰 선명하게 그리는 배수를 고르고, 바뀌었으면 다시 그린다 */
  function settle() {
    if (!net || destroyed) return;
    const { scale } = sceneAt(t, { tilt: baseTilt, turn: baseTurn }, zoom, view);
    const next = viewOn && !still ? Math.max(1, Math.min(RASTER_MAX, Math.ceil(scale - 1e-3))) : 1;
    if (next === raster) return;
    raster = next;
    applyRaster();
    render();
  }

  /** layout이 있으면 펼친 상태(t = 0)에서 판의 칸 (x, y)가 화면의 같은 자리에 오도록 하는 가운데 점 */
  function layoutCenter() {
    return [(boxSize.width / 2 - layout.origin[0]) / unit, (boxSize.height / 2 - layout.origin[1]) / unit, 0];
  }

  // ── 그리기 ───────────────────────────
  /** 펼친 좌표의 사각형(local px) → 화면 행렬 */
  function placeMatrix(modelMatrix, origin, center, lift = [0, 0, 0]) {
    const px = unit * raster;
    return multiply(
      scaling(px),
      multiply(translation(add(scaleVec(center, -1), lift)), multiply(modelMatrix, multiply(translation(origin), scaling(1 / px)))),
    );
  }

  function render() {
    if (!net || destroyed) return;
    const folded = foldNet(net, t, { tOf });
    const pts = folded.faces.flatMap((f) => f.points);
    if (t <= 1e-6) for (const s of slots) pts.push([...s.cell, 0], [s.cell[0] + 1, s.cell[1] + 1, 0]);
    const { min, max } = bounds(pts);
    let center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    // 놓는 판에서 이어 접을 때: 펼친 상태는 판의 칸 자리 그대로, 접을수록 무대 가운데로 (면이 튀지 않게)
    if (layout) center = add(scaleVec(layoutCenter(), 1 - t), scaleVec(center, t));
    // 학생이 바꾼 기울기·배율은 펼친 상태에서 0으로 곱해진다(orbit.js sceneAt): 펼친 전개도는 늘 위에서 본 처음 크기
    const { tilt, turn, scale } = sceneAt(t, { tilt: baseTilt, turn: baseTurn }, zoom, view);
    const z = (scale / raster).toFixed(4);
    scene.style.transform = `scale3d(${z}, ${z}, ${z}) rotateX(${tilt.toFixed(3)}deg) rotateZ(${turn.toFixed(3)}deg)`;
    const look = { tilt, turn, px: unit * scale, eye: eyeOf(boxSize.height) };

    const lifts = marksShown ? overlapLifts(folded) : new Map();
    for (const f of folded.faces) {
      const faceEl = faceEls.get(f.id);
      const src = net.faces.find((x) => x.id === f.id);
      const { min: bmin } = bounds(src.poly);
      const lift = liftVector(f, lifts.get(f.id) ?? 0);
      faceEl.style.transform = toCssMatrix(placeMatrix(f.matrix, [bmin[0], bmin[1], 0], center, lift));
      faceEl.style.setProperty('--shade', shadeOf(f.normal, tilt, turn).toFixed(3));
      // 종이 안쪽이 보이는 면(구멍으로 보이는 안쪽 면, 아래에서 본 2×2 장면 등): 글자가 거울상이 되지 않게 뒤집는다(.is-back)
      const back = isBack(f.normal, f.center, center, look);
      faceEl.classList.toggle('is-back', back);
      if (marksShown) faceEl.style.setProperty('--mark-turn', `${uprightTurn(applyDir(f.matrix, [1, 0, 0]), applyDir(f.matrix, [0, 1, 0]), tilt, turn)}deg`);
    }
    for (const s of slots) {
      const slotEl = slotEls.get(s.key);
      slotEl.style.transform = toCssMatrix(placeMatrix(identity(), [s.cell[0], s.cell[1], 0], center));
    }
    el.classList.toggle('is-flat', t <= 1e-6);
    for (const m of markEls) m.place(center, folded, look);
    // 애니메이션 중에는 animateTo가 상태를 정한다
    if (!raf && timers.size === 0) el.dataset.fold = foldState();
    checkHint();
    emitView();
  }

  /** 종이 안쪽이 보이나: 면 가운데 mid(모델 좌표)를 무대 가운데 기준 px로 바꿔 눈 위치와 견준다 */
  function isBack(normal, mid, center, look) {
    return isBackFacing(normal, scaleVec(sub(mid, center), look.px), look.tilt, look.turn, look.eye);
  }

  /** 겹친 면마다 몇 번째로 띄울지 (0, 1, 2, …) */
  function overlapLifts(folded) {
    const lifts = new Map();
    for (const [a, b] of overlappingPairs(folded)) {
      if (!lifts.has(a)) lifts.set(a, 0);
      lifts.set(b, Math.max(lifts.get(b) ?? 0, lifts.get(a) + 1));
    }
    return lifts;
  }

  /** 겹친 면을 바깥으로 살짝 띄우고 비스듬히 밀어, 카드를 포갠 것처럼 둘 다 보이게 */
  function liftVector(face, rank) {
    if (!rank) return [0, 0, 0];
    const along = add(applyDir(face.matrix, [1, 0, 0]), applyDir(face.matrix, [0, 1, 0]));
    return add(scaleVec(face.normal, 0.05 * rank), scaleVec(along, 0.16 * rank));
  }

  // ── 표시 (답한 뒤에만) ─────────────────
  function clearMarks() {
    for (const m of markEls) m.el.remove();
    markEls = [];
    for (const faceEl of faceEls.values()) {
      if (!faceEl.classList.contains('is-overlap')) continue;
      faceEl.classList.remove('is-overlap');
      faceEl.querySelector('.face-mark').textContent = '';
    }
    badge.hidden = true;
    badge.replaceChildren(); // 숨긴 이름표에 앞 장면의 까닭 글자가 남지 않게
    hintEl = null;
    unseenSlots = [];
    marksShown = false;
    el.classList.remove('marks-on', 'marks-blocked');
  }

  function addMark(markEl, place) {
    scene.append(markEl);
    markEls.push({ el: markEl, place });
  }

  function dotMark(vertex) {
    const r = 0.17;
    const markEl = h('div', { class: 'net-dot', 'aria-hidden': 'true' }, h('span', null, '●'));
    addMark(markEl, (center, folded) => {
      const face = folded.faces.find((f) => vertex.faces.includes(f.id));
      markEl.style.width = `${2 * r * unit * raster}px`;
      markEl.style.height = `${2 * r * unit * raster}px`;
      markEl.style.transform = toCssMatrix(placeMatrix(face.matrix, [vertex.point[0] - r, vertex.point[1] - r, 0], center, scaleVec(face.normal, 0.02)));
    });
  }

  function ghostMark(slot) {
    const markEl = h('div', { class: 'net-ghost', 'aria-hidden': 'true' }, h('span', null, '비어요'));
    const { u, v, normal, center: c } = slot;
    const origin = sub(sub(c, scaleVec(u, 0.5)), scaleVec(v, 0.5));
    const model = [
      u[0], v[0], normal[0], origin[0],
      u[1], v[1], normal[1], origin[1],
      u[2], v[2], normal[2], origin[2],
      0, 0, 0, 1,
    ];
    addMark(markEl, (center, folded, look) => {
      markEl.style.width = `${unit * raster}px`;
      markEl.style.height = `${unit * raster}px`;
      markEl.style.transform = toCssMatrix(placeMatrix(model, [0, 0, 0], center, scaleVec(normal, 0.01)));
      // "비어요" 글자도 면 글자와 같은 규칙으로 바로 세운다 (아래에서 봐도 거꾸로 서지 않게, 안쪽에서 보면 뒤집어서)
      markEl.classList.toggle('is-back', isBack(normal, c, center, look));
      markEl.style.setProperty('--mark-turn', `${uprightTurn(u, v, look.tilt, look.turn)}deg`);
    });
  }

  /** 답한 뒤: 막힌 꼭짓점에 ●. 다 접히면 겹친 면·빈 자리·결과 이름표도 보인다 */
  function updateMarks() {
    const full = revealed && t >= 1 - 1e-6;
    const key = `${revealed}:${full}`;
    if (key === marksKey) return;
    marksKey = key;
    clearMarks();
    if (revealed) for (const v of blocked) dotMark(v);
    if (!full) return;
    marksShown = true;
    el.classList.add('marks-on');
    // 2×2 덩어리 장면: 면 글자가 비스듬하거나 거꾸로 보이지 않게 모든 면의 글자를 보는 쪽으로 바로 세운다 (재검토 2 R3)
    el.classList.toggle('marks-blocked', blocked.length > 0);
    const folded = foldNet(net, 1, { tOf });
    const pairs = overlappingPairs(folded);
    const missing = blocked.length > 0 ? [] : missingSlots(net, folded);
    for (const id of new Set(pairs.flat())) {
      const faceEl = faceEls.get(id);
      faceEl.classList.add('is-overlap');
      faceEl.querySelector('.face-mark').textContent = '✗ 겹쳐요';
    }
    for (const s of missing) ghostMark(s);
    const ok = pairs.length === 0 && missing.length === 0 && blocked.length === 0 && net.faces.length === 6;
    badge.hidden = false;
    badge.classList.toggle('is-wrong', !ok);
    const text = ok ? '정육면체가 됐어요' : blocked.length > 0 ? '네 면이 한 점에 모여 접을 수 없어요' : '정육면체가 안 돼요';
    badge.replaceChildren(h('span', { class: 'badge-main' }, icon(ok ? 'check' : 'cross'), text));
    // 빈 자리가 겹친 자리의 정반대라 지금 보기(내가 돌리고 기울인 것까지)에서 안 보이면 돌려 보라고 알려 준다
    unseenSlots = hintDone ? [] : missing.filter(slotHidden);
    const hiddenMissing = unseenSlots.length > 0;
    if (hiddenMissing) {
      hintEl = h('span', { class: 'badge-hint' }, icon('rotr'), '돌려 보면 빈 자리가 보여요');
      badge.append(hintEl);
    }
    marksOk = ok;
    for (const fn of markListeners) fn({ ok, hiddenMissing });
  }

  /** 다 접은 입체의 그 빈 자리가 지금 보기에서 보는 사람 쪽을 향하지 않나 */
  function slotHidden(slot) {
    return !facesViewer(slot.normal, tiltOf({ tilt: baseTilt }, view), SPIN + baseTurn + view.spin);
  }

  /** 보기를 바꿔 숨어 있던 빈 자리가 모두 한 번씩 보였으면 "돌려 보면…" 안내와 [↻] 강조를 끈다 (다시 켜지 않는다) */
  function checkHint() {
    if (!hintEl) return;
    unseenSlots = unseenSlots.filter(slotHidden);
    if (unseenSlots.length > 0) return;
    hintEl.remove();
    hintEl = null;
    hintDone = true;
    for (const fn of markListeners) fn({ ok: marksOk, hiddenMissing: false });
  }

  function setT(value) {
    t = Math.max(0, Math.min(1, value));
    updateMarks();
    render();
    for (const fn of listeners) fn(t);
  }

  // ── 면 만들기 ─────────────────────────
  function buildFace(f) {
    const { min, max } = bounds(f.poly);
    const faceEl = h('button', {
      type: 'button',
      class: 'net-face',
      tabindex: interactive && !still ? null : '-1',
      'aria-label': `${f.label} 면`,
      dataset: { face: f.id, label: f.label },
      style: { width: `calc(var(--unit) * ${max[0] - min[0]})`, height: `calc(var(--unit) * ${max[1] - min[1]})` },
      onclick: () => onFaceClick?.(f.id),
    },
      h('span', { class: 'face-inner' },
        h('span', { class: 'face-label' }, f.label),
        h('span', { class: 'face-mark', 'aria-hidden': 'true' }),
      ),
    );
    faceEl.style.setProperty('--face-color', faceColor(f.label));
    if (!isAxisRect(f.poly)) {
      const pts = f.poly.map(([x, y]) => `calc(var(--unit) * ${x - min[0]}) calc(var(--unit) * ${y - min[1]})`);
      faceEl.style.clipPath = `polygon(${pts.join(', ')})`;
    }
    return faceEl;
  }

  function buildSlot(s) {
    return h('button', {
      type: 'button',
      class: 'net-slot dnd-target',
      'aria-label': s.label ?? '빈 자리',
      dataset: { cell: s.key },
    }, h('span', { class: 'slot-plus', 'aria-hidden': 'true' }, '+'));
  }

  /**
   * 새 전개도를 펼친 상태로 보인다. slots: [{ key, cell, label }] 면을 붙일 빈 자리.
   * focus: 다 접었을 때 잘 보여야 할 면 id ([★ 면, 정답 면]) — displayNet 참고
   * layout: { unit(칸 한 변 px), origin([x, y] 무대 안에서 칸 (0, 0)의 왼쪽 위 px) } — 놓는 판의 칸 크기·자리를 그대로 써서
   *   판에서 무대로 바뀔 때 면이 튀지 않는다(자유 배치). 무대 크기가 바뀌면 보통 크기로 돌아간다.
   */
  function setNet(nextNet, { slots: nextSlots = [], focus = [], layout: nextLayout = null } = {}) {
    stopAnimation();
    clearMarks();
    marksKey = '';
    layout = nextLayout && nextLayout.unit > 0 && Array.isArray(nextLayout.origin) ? { unit: nextLayout.unit, origin: [...nextLayout.origin] } : null;
    ({ net, turn: baseTurn, tilt: baseTilt } = displayNet(nextNet, { focus }));
    slots = nextSlots;
    revealed = false;
    t = 0;
    endGesture();
    view = homeView(); // 새 전개도는 늘 처음 보기에서 시작한다 (판 → 무대 이어 접기도 여기서 시작)
    raster = 1;
    hintDone = false;
    blocked = fullVertices(net);
    tOf = stuckTOf(net, blocked); // 2×2 덩어리면 접다가 멈추는 장면
    faceEls = new Map(net.faces.map((f) => [f.id, buildFace(f)]));
    slotEls = new Map(slots.map((s) => [s.key, buildSlot(s)]));
    scene.replaceChildren(...faceEls.values(), ...slotEls.values());
    el.dataset.fold = 'flat';
    measure();
    layoutBox = layout ? { ...boxSize } : null;
    setT(0);
  }

  function finishState() {
    el.dataset.fold = foldState();
    settle();
  }

  /** target(0~1)까지 접는다. 끝나면 풀리는 Promise (다른 접기·새 전개도로 멈추면 풀리지 않는다) */
  function animateTo(target) {
    stopAnimation();
    return new Promise((resolve) => {
      const done = () => {
        finishState();
        resolve(true);
      };
      if (Math.abs(target - t) < 1e-6) {
        setT(target);
        done();
        return;
      }
      if (prefersReducedMotion()) {
        // 펼침 → 반 접힘 → 다 접힘 (장면으로 바꾸기)
        if (target <= t || target <= 0.5) {
          setT(target);
          done();
          return;
        }
        sfx?.play('fold');
        if (t < 0.5) {
          setT(0.5); // data-fold = half, 다음 장면까지 그대로
          later(() => {
            setT(target);
            done();
          }, SCENE_GAP);
          return;
        }
        setT(target);
        done();
        return;
      }
      const from = t;
      if (target > from) sfx?.play('fold');
      const ms = DURATION * Math.abs(target - from);
      const start = performance.now();
      el.dataset.fold = 'folding';
      const step = (now) => {
        const p = Math.min(1, (now - start) / ms);
        raf = p < 1 ? requestAnimationFrame(step) : 0;
        setT(from + (target - from) * ease(p));
        if (p < 1) el.dataset.fold = 'folding';
        else done();
      };
      raf = requestAnimationFrame(step);
    });
  }

  /** 반만 접어 보고 다시 편다 (힌트) */
  async function peek(amount = 0.5) {
    await animateTo(amount);
    await new Promise((resolve) => later(resolve, 1400));
    return animateTo(0);
  }

  // ── 보기: 돌려 보기 · 크게 작게 (spec 17절) ─────────────
  const baseView = () => ({ tilt: baseTilt, turn: baseTurn });
  /** 새 조작(끌기·위아래·크게 작게·처음 보기로)이 되는 때: 접기 막대가 풀려 있고(답한 뒤) 조금이라도 접힌 상태 */
  const canView = () => viewOn && !still && t > 1e-6;
  const say = (text) => {
    if (destroyed) return;
    for (const fn of sayListeners) fn(text);
  };

  /** 조작판에 지금 상태를 알린다(바뀌었을 때만): { can, atTop, atBottom, zoomMax, zoomMin, home } */
  function emitView() {
    const can = canView();
    el.classList.toggle('can-view', can);
    if (!can && gesture) endGesture(); // 잠기거나 다 펴면 하던 끌기를 멈춘다
    const state = { can, ...viewLimits(view, baseView()) };
    const key = Object.values(state).join();
    if (key === viewKey) return;
    viewKey = key;
    for (const fn of viewListeners) fn(state);
  }

  /** 가로로 돌리기: 지금처럼 펼친 전개도(답하기 전)도 평면에서 돈다 */
  function rotate(deg) {
    view = turnBy(view, deg);
    render();
  }

  /** 위쪽(dir < 0)·아래쪽(dir > 0)으로 15° 눈금까지. 보는 방향 구간이 바뀌면 화면 읽기 알림 */
  function tiltStep(dir) {
    if (!canView()) return false;
    const before = tiltZone(tiltOf(baseView(), view));
    view = stepTilt(view, baseView(), dir);
    render();
    const tilt = tiltOf(baseView(), view);
    if (tiltZone(tilt) !== before) say(tiltWord(tilt));
    return true;
  }

  /** 크게(dir > 0)·작게(dir < 0) 다음 단계로 */
  function zoomStep(dir) {
    if (!canView()) return false;
    const before = view.zoom;
    view = stepZoom(view, dir);
    render();
    settle();
    if (view.zoom !== before) say(zoomWord(view.zoom));
    return true;
  }

  /** 가로 돌림·기울기·배율을 한 번에 처음으로 */
  function resetView() {
    if (!canView()) return false;
    if (isHome(view)) return true;
    view = homeView();
    render();
    settle();
    say(HOME_WORD);
    return true;
  }

  // 끌어서 돌리기(마우스·한 손가락) · 두 손가락 벌리기 · 휠
  const pointers = new Map(); // pointerId → 마지막 자리 { x, y }
  let gesture = null; // { mode: 'wait'(문턱 전) | 'turn' | 'pinch', x, y, zone, zoom, … }
  let swallowClick = false; // 끌기 뒤 따라오는 click 한 번을 삼킨다
  let swallowTimer = 0;
  let wheelTimer = 0;

  function capture(pointerId) {
    try {
      el.setPointerCapture?.(pointerId);
    } catch {
      // 이미 떨어진 포인터면 붙잡지 않는다
    }
  }

  /** 끌기·벌리기가 시작됐다: 무대가 포인터를 붙잡고, 뒤따르는 click을 삼킬 준비를 한다 */
  function startMoving() {
    for (const id of pointers.keys()) capture(id);
    el.classList.add('is-turning');
    clearTimeout(swallowTimer);
    swallowTimer = 0;
    swallowClick = true;
    for (const fn of dragListeners) fn();
  }

  /** 끌기·벌리기를 끝낸다. told: 손을 떼어 끝났을 때만 true — 보는 방향 구간·배율이 바뀌었으면 한 번 알린다 */
  function endGesture(told = false) {
    const g = gesture;
    gesture = null;
    pointers.clear();
    globalThis.removeEventListener?.('pointermove', onPointerMove);
    globalThis.removeEventListener?.('pointerup', onPointerUp);
    globalThis.removeEventListener?.('pointercancel', onPointerUp);
    el.classList.remove('is-turning');
    if (!g || g.mode === 'wait') return;
    settle();
    // click은 pointerup과 같은 차례에 오므로, 그 차례가 지나면 삼키기를 푼다 (click이 오지 않는 터치 끌기에서 남지 않게)
    clearTimeout(swallowTimer);
    swallowTimer = setTimeout(() => {
      swallowTimer = 0;
      swallowClick = false;
    }, 0);
    if (!told) return;
    const tilt = tiltOf(baseView(), view);
    if (tiltZone(tilt) !== g.zone) say(tiltWord(tilt));
    else if (Math.abs(view.zoom - g.zoom) > 0.005) say(zoomWord(view.zoom));
  }

  function onPointerDown(event) {
    if (!canView() || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (event.isPrimary && gesture) endGesture(); // 뗀 것을 못 받은 포인터가 남아 있으면 버린다
    if (pointers.size >= 2) return; // 셋째 손가락은 쓰지 않는다
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      gesture = { mode: 'wait', x: event.clientX, y: event.clientY, zone: tiltZone(tiltOf(baseView(), view)), zoom: view.zoom };
      // 끌기 전(문턱 전)에는 포인터를 붙잡지 않으므로, 무대 밖에서 움직이거나 떼어도 받도록 창에서 듣는다
      globalThis.addEventListener('pointermove', onPointerMove);
      globalThis.addEventListener('pointerup', onPointerUp);
      globalThis.addEventListener('pointercancel', onPointerUp);
      return;
    }
    // 두 번째 손가락: 벌리기·오므리기
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
      render();
      return;
    }
    if (gesture.mode === 'wait') {
      if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) <= DRAG_START) return;
      gesture.mode = 'turn';
      startMoving();
    }
    const dx = event.clientX - p.x;
    const dy = event.clientY - p.y;
    p.x = event.clientX;
    p.y = event.clientY;
    view = dragView(view, baseView(), dx, dy);
    render();
  }

  function onPointerUp(event) {
    if (!pointers.delete(event.pointerId)) return;
    // 두 손가락에서 한 손가락이 되면: 남은 손가락의 마지막 자리부터 이어 돌린다(튀지 않는다)
    if (pointers.size === 1 && gesture?.mode === 'pinch') gesture.mode = 'turn';
    else if (pointers.size === 0) endGesture(true);
  }

  function onClickCapture(event) {
    if (!swallowClick) return;
    swallowClick = false;
    event.stopPropagation();
    event.preventDefault();
  }

  /** 접은 입체 위에서 휠(터치패드 두 손가락 쓸기)·Ctrl+휠(터치패드 벌리기): 크게·작게. 그 밖에서는 페이지 스크롤 그대로 */
  function onWheel(event) {
    if (!canView()) return;
    event.preventDefault();
    const before = view.zoom;
    view = wheelView(view, event.deltaY, { ctrl: event.ctrlKey, lines: event.deltaMode === 1 });
    if (view.zoom === before) return;
    render();
    // 휠이 멈추면 한 번: 선명하게 다시 그리고, 배율을 화면 읽기로 알린다
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => {
      wheelTimer = 0;
      settle();
      say(zoomWord(view.zoom));
    }, 300);
  }

  /** 사파리의 두 손가락 벌리기(화면 전체 확대)를 접은 입체 위에서는 막는다 */
  function onGestureStart(event) {
    if (canView()) event.preventDefault();
  }

  function onKey(event) {
    if (still || event.target instanceof HTMLInputElement) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return; // 브라우저 확대(Ctrl + − 0)·뒤로 가기는 건드리지 않는다
    const { key } = event;
    if (key === 'ArrowLeft') rotate(-TURN_KEY);
    else if (key === 'ArrowRight') rotate(TURN_KEY);
    else if (!canView()) return; // 잠겨 있으면 ↑↓는 페이지 스크롤 그대로
    else if (key === 'ArrowUp') tiltStep(-1);
    else if (key === 'ArrowDown') tiltStep(1);
    else if (key === '+' || key === '=') zoomStep(1);
    else if (key === '-' || key === '_') zoomStep(-1);
    else if (key === '0' || key === 'Home') resetView();
    else return;
    event.preventDefault();
  }
  el.addEventListener('keydown', onKey);
  if (!still) {
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('click', onClickCapture, true);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('gesturestart', onGestureStart);
  }

  const resizer = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => {
      const box = el.getBoundingClientRect();
      // 판 자리를 맞춘 뒤 무대 크기가 바뀌었으면 판 자리 맞추기(layout)를 그만두고 보통 크기로
      if (layout && layoutBox && (Math.abs(box.width - layoutBox.width) > 1 || Math.abs(box.height - layoutBox.height) > 1)) layout = null;
      measure();
      render();
      if (!raf && timers.size === 0 && !gesture) settle();
    })
    : null;
  resizer?.observe(el);

  return {
    el,
    setNet,
    setT: (value) => {
      stopAnimation();
      setT(value);
      finishState();
    },
    getT: () => t,
    animateTo,
    peek,
    rotate,
    tiltStep,
    zoomStep,
    resetView,
    /** 보기 조작(끌기·위아래·크게 작게)을 켜고 끈다. 접기 막대의 잠금과 함께 쓴다 (createFoldTools.lock) */
    setViewEnabled(value) {
      viewOn = Boolean(value);
      if (!viewOn) endGesture();
      render();
      emitView();
      if (!raf && timers.size === 0) settle();
    },
    /** 무대 오른쪽 위에 겹쳐 놓는 조작판을 알려 준다: 펼친 전개도의 면·빈 자리가 그 밑에 들어가지 않게 칸 크기를 맞춘다 */
    keepClear(element) {
      padEl = element ?? null;
      measure();
      render();
    },
    /** 조작판 상태 알림: fn({ can, atTop, atBottom, zoomMax, zoomMin, home }) */
    onView(fn) {
      viewListeners.add(fn);
      return () => viewListeners.delete(fn);
    },
    /** 끌기·벌리기가 시작될 때 알림 */
    onDrag(fn) {
      dragListeners.add(fn);
      return () => dragListeners.delete(fn);
    },
    /** 화면 읽기 알림 문장(보는 방향·크기): fn(text) */
    onSay(fn) {
      sayListeners.add(fn);
      return () => sayListeners.delete(fn);
    },
    reveal() {
      revealed = true;
      updateMarks();
      render();
    },
    faceEl: (id) => faceEls.get(id),
    slotEl: (key) => slotEls.get(key),
    /** 다 접혀 결과 표시가 나올 때 알림: fn({ ok, hiddenMissing }) */
    onMarks(fn) {
      markListeners.add(fn);
      return () => markListeners.delete(fn);
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    destroy() {
      destroyed = true;
      stopAnimation();
      resizer?.disconnect();
      endGesture();
      clearTimeout(swallowTimer);
      clearTimeout(wheelTimer);
      el.removeEventListener('keydown', onKey);
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('click', onClickCapture, true);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('gesturestart', onGestureStart);
      listeners.clear();
      markListeners.clear();
      viewListeners.clear();
      dragListeners.clear();
      sayListeners.clear();
    },
  };
}

/** 매트 아래쪽 접기 조작 띠의 높이만큼 알림을 띄운다(넓은 화면에서 알림이 조작 띠를 가리지 않게) */
export const MAT_TOOLS_LIFT = 64;

/**
 * 접기 조작과 보기 조작.
 * - el: 재단 매트 아래쪽 띠 [접어 보기 / 펴기] [접는 정도 막대]
 * - pad: 보는 방향과 크기 조작판(.view-pad) — 무대 오른쪽 위 십자(휴대폰은 아래 띠 두 줄). 매트에 el 다음으로 붙인다.
 *   [왼쪽·오른쪽으로 돌려 보기]는 지금처럼 늘 되고, [위쪽·아래쪽으로 돌려 보기] [크게·작게 보기] [처음 보기로]는
 *   답한 뒤 접힌 입체에서만 켜진다(잠김·한계에 닿으면 disabled). 끌기·휠·키보드와 같은 일을 한다(view의 같은 함수).
 * → { el, pad, turnRight, lock(잠금: 접기와 보기 조작을 함께), reset, destroy }
 */
export function createFoldTools({ ctx, view }) {
  const { h } = ctx;
  const toggleIcon = h('span', { class: 'btn-ico', 'aria-hidden': 'true' }, icon('play'));
  const toggleText = h('span', null, '접어 보기');
  const foldButton = h('button', { type: 'button', class: 'btn fold-toggle', onclick: () => toggleFold() }, toggleIcon, toggleText);
  const slider = h('input', {
    type: 'range',
    class: 'fold-range',
    min: '0',
    max: '100',
    step: '1',
    value: '0',
    'aria-label': '접는 정도',
    oninput: () => view.setT(Number(slider.value) / 100),
  });
  const padButton = (label, cls, name, onclick) => h('button', {
    type: 'button',
    class: `btn btn-icon ${cls}`,
    'aria-label': label,
    title: label,
    onclick,
  }, icon(name));
  const turnLeft = padButton('왼쪽으로 돌려 보기', 'view-left', 'rotl', () => view.rotate(-TURN_BUTTON));
  const turnRight = padButton('오른쪽으로 돌려 보기', 'view-right', 'rotr', () => view.rotate(TURN_BUTTON));
  const tiltUp = padButton('위쪽으로 돌려 보기', 'view-up', 'up', () => view.tiltStep(-1));
  const tiltDown = padButton('아래쪽으로 돌려 보기', 'view-down', 'down', () => view.tiltStep(1));
  const zoomOut = padButton('작게 보기', 'view-out', 'zoomout', () => view.zoomStep(-1));
  const zoomIn = padButton('크게 보기', 'view-in', 'zoomin', () => view.zoomStep(1));
  const home = padButton('처음 보기로', 'view-home', 'cube', () => view.resetView());
  // 끌기 안내: 보기 조작이 처음 켜질 때 한 번 보이고, 처음 끌거나 문제가 바뀌면 지운다 (눌리지 않는 칩. 휴대폰은 자리가 없어 숨긴다)
  const tip = h('p', { class: 'view-tip', hidden: true, 'aria-hidden': 'true' }, icon('hand'), '끌어서 돌려 봐요');
  // Tab 순서: 왼쪽 · 오른쪽 · 위쪽 · 아래쪽 · 작게 · 크게 · 처음 보기로 (자리는 CSS grid-area가 정한다)
  const pad = h('div', { class: 'view-pad', role: 'group', 'aria-label': '보는 방향과 크기' },
    turnLeft, turnRight, tiltUp, tiltDown, zoomOut, zoomIn, home, tip);

  /**
   * 한계에 닿아 꺼지는 버튼에 초점이 있었으면 무대로 옮긴다 — 키보드로 누르던 초점이 사라지지 않고,
   * 무대에서는 방향키와 + − 0으로 이어서 볼 수 있다(반대쪽 버튼으로 옮기면 Enter를 한 번 더 눌렀을 때 되돌아간다)
   */
  function setOff(button, off) {
    if (button.disabled === off) return;
    const focused = off && document.activeElement === button;
    button.disabled = off;
    if (focused) view.el.focus({ preventScroll: true });
  }
  let tipUsed = false;
  view.onView((s) => {
    setOff(tiltUp, !s.can || s.atTop);
    setOff(tiltDown, !s.can || s.atBottom);
    setOff(zoomIn, !s.can || s.zoomMax);
    setOff(zoomOut, !s.can || s.zoomMin);
    setOff(home, !s.can || s.home);
    // 끌기 안내 칩: 처음 켜질 때 한 번. 다시 잠기거나 다 펴면(끌 수 없을 때) 지운다
    if (!s.can) tip.hidden = true;
    else if (!tipUsed) {
      tipUsed = true;
      tip.hidden = false;
    }
  });
  view.onDrag(() => {
    tip.hidden = true;
  });
  view.keepClear(pad);
  // 지금 보는 방향·크기는 화면 읽기 알림으로만 알린다(무대를 가리지 않게). 면 이름·빈 자리·겹침은 말하지 않는다
  view.onSay((text) => ctx.feedback.announce(text));
  for (const button of [tiltUp, tiltDown, zoomOut, zoomIn, home]) button.disabled = true;

  // 빈 자리가 안 보이는 쪽에 있으면 [↻]를 잠깐 강조한다 (이름표에도 "돌려 보면 빈 자리가 보여요"). 돌려서 보이면 바로 끈다
  let hintTimer = null;
  view.onMarks(({ hiddenMissing }) => {
    clearTimeout(hintTimer);
    turnRight.classList.toggle('is-hint', hiddenMissing);
    if (hiddenMissing) hintTimer = setTimeout(() => turnRight.classList.remove('is-hint'), 4000);
  });
  const el = h('div', { class: 'mat-tools fold-tools' },
    foldButton,
    h('label', { class: 'fold-slider' }, h('span', { class: 'fold-slider-label' }, '접는 정도'), slider),
  );

  const sync = (value) => {
    slider.value = String(Math.round(value * 100));
    const done = value >= 1 - 1e-6;
    toggleText.textContent = done ? '펴기' : '접어 보기';
    toggleIcon.replaceChildren(icon(done ? 'unfold' : 'play'));
  };
  view.onChange(sync);

  function toggleFold() {
    ctx.sfx.play('click');
    view.animateTo(view.getT() >= 1 - 1e-6 ? 0 : 1);
  }

  return {
    el,
    pad,
    turnRight,
    /** 접기(버튼·막대)와 보기 조작(끌기·위아래·크게 작게)을 함께 잠그고 푼다. 답이 기록된 뒤에만 푼다 */
    lock(value) {
      foldButton.disabled = value;
      slider.disabled = value;
      view.setViewEnabled(!value);
    },
    reset() {
      sync(0);
      clearTimeout(hintTimer);
      turnRight.classList.remove('is-hint');
      tip.hidden = true;
    },
    destroy() {
      clearTimeout(hintTimer);
    },
  };
}

/**
 * 판별·마주 보는 면·면 붙이기 화면의 틀: 왼쪽 재단 매트(3D 무대 + 접기 조작 띠 + 보기 조작판), 오른쪽 작업 지시서(엔진 ctx.ui.order).
 * 작업 지시서: 주문 도장 + 문제 번호, 물음, 답 칸(단계가 채움), 까닭 쪽지, 보너스 쪽지, 다음 버튼.
 * 답하기 전에는 접기 막대와 보기 조작(끌기·위아래·크게 작게)이 잠긴다. hint면 틀린 뒤 [반만 접어 보기]가 열린다.
 */
export function createWorkbench({ ctx, view, total, hint = false }) {
  const { h } = ctx;
  const tools = createFoldTools({ ctx, view });
  const order = ctx.ui.order({ kind: ctx.stage.order ?? '', label: '문제 판' });
  order.counter.classList.add('q-counter');
  const prompt = h('p', { class: 'q-prompt' });
  const answerBox = h('div', { class: 'q-answer' });

  const halfButton = hint
    ? h('button', { type: 'button', class: 'btn btn-small hint-btn', hidden: true, onclick: () => useHint() }, icon('bulb'), '반만 접어 보기')
    : null;
  const lockNote = h('p', { class: 'fold-note' }, icon('lock'), '답한 뒤에 접어 볼 수 있어요.');
  const reasonSlot = h('div', { class: 'reason-slot' });
  const bonusSlot = h('div', { class: 'bonus-slot' });
  const nextLabel = h('span', null, '');
  const nextButton = h('button', { type: 'button', class: 'btn btn-primary btn-lg next-btn', hidden: true }, nextLabel);
  let onNext = null;
  nextButton.addEventListener('click', () => {
    ctx.sfx.play('click');
    onNext?.();
  });

  const mat = h('div', { class: 'mat' }, view.el, tools.el, tools.pad);
  order.el.classList.add('net-panel');
  order.el.append(...[prompt, answerBox, lockNote, halfButton, reasonSlot, bonusSlot, nextButton].filter(Boolean));
  ctx.el.append(h('div', { class: 'workbench' }, mat, order.el));
  // 알림(토스트): 넓은 화면은 매트 아래쪽(조작 띠 위) 가운데, 좁은 화면(태블릿 세로·휴대폰)은 매트 바로 밑 — 무대의 면·조작을 가리지 않게
  ctx.feedback.anchor?.(mat, { lift: MAT_TOOLS_LIFT, narrow: 'below' });

  let hintUsed = false;
  let locked = true;
  // "답한 뒤에 접어 볼 수 있어요"는 잠겼을 때만, 힌트 버튼이 보이면 그 자리를 비켜 준다
  const updateNote = () => {
    lockNote.hidden = !locked || Boolean(halfButton && !halfButton.hidden);
  };

  function useHint() {
    if (hintUsed) return;
    hintUsed = true;
    halfButton.disabled = true;
    ctx.sfx.play('click');
    ctx.reward.event('inspect');
    view.peek(0.5);
  }

  function lockFold(value) {
    locked = value;
    tools.lock(locked);
    updateNote();
  }

  /** 까닭 쪽지 (.reason): 맞으면 초록 ✓, 틀리면 벽돌색 ✗ + 살펴볼 거리 */
  function showReason(text, correct, { title = correct ? '맞아요' : '까닭', tip = '' } = {}) {
    const note = ctx.ui.note({ type: correct ? 'correct' : 'wrong', title, text, tip });
    note.classList.add('reason', correct ? 'is-correct' : 'is-wrong');
    note.setAttribute('role', 'status');
    reasonSlot.replaceChildren(note);
  }

  /** 보너스 쪽지: 틀린 뒤 "다시 일어서기" 기회를 글로 보인다 (점수는 엔진이 행동으로 계산) */
  function showBounce({ retry = false } = {}) {
    const peek = ctx.reward.peek?.();
    // 보상이 꺼졌거나, 별 3개 단계를 다시 하는 판(연습 점수 없음)이면 점수 쪽지를 보이지 않는다
    if (!peek?.on || peek.practice === false) return;
    const toBadge = Math.min(5, peek.counters.bounce ?? 0);
    const badgeText = toBadge < 5 ? `, 도장까지 ${toBadge} / 5` : '';
    bonusSlot.replaceChildren(retry
      ? ctx.ui.bonus(h('b', null, '다시 도전'), ' · 까닭을 보고 다시 맞히면 +1, 다음 문제도 맞히면 다시 일어서기 +1')
      : ctx.ui.bonus(h('b', null, '다시 일어서기'), ` · 다음 문제를 맞히면 +1${badgeText}`));
  }

  return {
    panel: order.el,
    mat,
    tools,
    answerBox,
    setQuestion(number, text) {
      order.setCounter(`문제 ${number} / ${total}`);
      ctx.setProgress?.(number, total);
      prompt.textContent = text;
      reasonSlot.replaceChildren();
      bonusSlot.replaceChildren();
      nextButton.hidden = true;
      onNext = null;
      hintUsed = false;
      if (halfButton) {
        halfButton.hidden = true;
        halfButton.disabled = false;
      }
      lockFold(true);
      tools.reset();
    },
    showReason,
    showBounce,
    clearBonus() {
      bonusSlot.replaceChildren();
    },
    lockFold,
    /** 틀린 뒤 [반만 접어 보기]를 연다 (문항마다 1번) */
    offerHint() {
      if (halfButton && !hintUsed) halfButton.hidden = false;
      updateNote();
    },
    hideHint() {
      if (halfButton) halfButton.hidden = true;
      updateNote();
    },
    showNext(label, fn, { primary = true, iconName = null } = {}) {
      nextLabel.textContent = label;
      nextButton.replaceChildren(...(iconName === 'unfold' ? [icon('unfold'), nextLabel] : [nextLabel, iconName ? icon(iconName) : null].filter(Boolean)));
      nextButton.classList.toggle('btn-primary', primary);
      nextButton.hidden = false;
      onNext = fn;
    },
    hideNext() {
      nextButton.hidden = true;
      onNext = null;
    },
    focusNext() {
      nextButton.focus({ preventScroll: true });
    },
    destroy() {
      tools.destroy();
    },
  };
}
