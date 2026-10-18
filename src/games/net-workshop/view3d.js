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
 * 돌리기는 화면 기준이고 한계가 없다(17-17): 어느 방향으로 끌든 입체가 손을 따라 구르고, 한 바퀴를 넘어서도 계속 돈다.
 * 조금이라도 접혀 있으면 접는 정도와 상관없이 똑같이 돌고 배율도 그대로다(17-18).
 * 다 편 전개도는 늘 위에서 본 처음 크기라 답하기 전 화면은 문항·조작과 무관하게 같다(가로 돌림만 지금처럼 된다).
 * 다 편 모습(처음 모습)과 내 자세 사이는 짧은 움직임(0.2초, transform만)으로 잇는다 — 움직임 줄이기·?fx=low면 바로 바뀐다.
 * 답하기 전에는 조작판을 보이지 않는다(spec 17-16): 무대 위에 겹쳐 놓이는 조작판이 펼친 전개도의 면·빈 자리를 가리지 않게,
 * 그리고 전개도 크기가 조작판 때문에 달라지지 않게 — 그동안은 좌우 돌리기 두 개만 아래 조작 띠에 있다.
 */
import { josa } from '../../shared/core/korean.js';
import { icon } from '../../shared/ui/icons.js';
import { LABELS, checkNet, findHinges, foldNet, fullVertices, missingSlots, overlappingPairs, pickFace } from './fold.js';
import {
  add,
  applyDir,
  applyPoint,
  bounds,
  centroid,
  dot,
  identity,
  multiply,
  normalize,
  rotationAbout,
  scale as scaleVec,
  scaling,
  sub,
  toCssMatrix,
  translation,
} from './geometry.js';
import {
  DRAG_START,
  HOME_WORD,
  MIX_MS,
  SPIN,
  TILT,
  TURN_BUTTON,
  TURN_KEY,
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
  sameLook,
  sceneAt,
  shadeOf,
  stepView,
  stepZoom,
  tiltWord,
  tiltZone,
  turnBy,
  turnVector,
  uprightAngle,
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
// 정육면체가 아닌 입체(직육면체 …)의 자동 맞춤: 접은 입체를 감싸는 공(가장 긴 대각선)이 무대에 들어오게 — 어느 쪽으로 돌려도 처음 배율에서 잘리지 않는다.
// 정육면체의 지금 값(짧은 쪽 ÷ (3.3 × 칸), 대각선 √3)과 같은 비율이다 (spec 17-9)
const SPAN_PER_DIAGONAL = 3.3 / Math.sqrt(3);
const MIN_ZOOM = 0.6;
const MIN_UNIT_CM = 12; // 길이 단위(cm)로 만든 전개도의 1 cm 최소 크기(px). 정육면체는 칸 하나가 면 하나라 MIN_UNIT
/** 결과 이름표에 쓰는 입체 이름 */
const SOLID_NAMES = { cube: '정육면체', cuboid: '직육면체' };
/** 빈 자리가 차지하는 직사각형: 정육면체는 칸 하나, 그 밖에는 자리가 준 rect { x, y, w, h } */
const slotBox = (s) => s.rect ?? { x: s.cell[0], y: s.cell[1], w: 1, h: 1 };
const RASTER_MAX = 4; // 선명하게 그리는 배수의 위쪽 끝 (자동 맞춤 1.7 × 학생 배율 2 = 3.4배까지 본다)
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
const seenScoreOf = (normal) => {
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
export function displayNet(net, { focus = [], show = [] } = {}) {
  // 돌려주는 값: { net(바닥 면을 고른 전개도), turn(더 돌릴 각도), tilt(다 접었을 때 기울기) }
  const blocked = fullVertices(net);
  if (blocked.length > 0) return displayBlocked(net, blocked);
  let best = null;
  const roots = [net.root, ...net.faces.map((f) => f.id).filter((id) => id !== net.root)];
  // 각기둥(면의 방향이 축과 나란하지 않다): 보이는 정도를 처음 시점에서 면이 보는 쪽을 향한 만큼으로 재고, 15° 단위로 돌려 본다
  const prism = net.kind === 'prism';
  const seenScore = prism ? (normal) => 3 * Math.max(0, viewDirection(normal, 0)[2]) : seenScoreOf;
  for (const root of roots) {
    const candidate = root === net.root ? net : { ...net, root };
    const folded = foldNet(candidate, 1);
    const normalOf = (id) => folded.faces.find((f) => f.id === id).normal;
    const pairs = overlappingPairs(folded);
    const missing = missingSlots(candidate, folded);
    for (const turn of prism ? FINE_TURNS : TURNS) {
      let s = 0;
      for (const [a] of pairs) s += 10 * seenScore(turnNormal(normalOf(a), turn));
      for (const slot of missing) s += isBottom(slot.normal) ? -100 : seenScore(turnNormal(slot.normal, turn));
      for (const id of focus) if (isTopOrBottom(normalOf(id))) s -= 20;
      if (focus.length > 0) s += seenScore(turnNormal(normalOf(focus[focus.length - 1]), turn));
      // show: 처음 시점에서 함께 보여야 할 면들(만나는 두 선분이 놓인 면, 길이가 다른 두 변이 놓인 면)
      for (const id of show) s += 4 * seenScore(turnNormal(normalOf(id), turn));
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
 * @param {object} [p.skin]            면의 겉모습을 바꿀 때(주사위 주문의 눈 카드): { name(label) 화면 읽기 이름, mark(h, label) 면 안의 그림,
 *   color(label) 면 색 }. 없으면 지금처럼 "가 면" · 글자 · 색종이 색
 * @param {(faceId: string) => void} [p.onPick] 입체 상태의 면을 눌러 고르는 단계(각기둥의 밑면 고르기): 무대를 누르면 브라우저의 누르기 판정 대신
 *   직접 계산한 맨 앞 면(fold.js pickFace — 거의 옆으로 선 면은 누를 수 없다)을 알린다. 8px 넘게 끌면 돌리기(누르기가 아니다). 키보드(Enter)는 초점 받은 면
 */
export function createNetView({ h, interactive = false, onFaceClick = null, onPick = null, sfx = null, still = false, skin = null }) {
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
  let view = homeView(); // 학생이 바꾼 보기 { spin, roll, zoom } (orbit.js). 새 전개도가 놓이면 처음으로
  let viewOn = false; // 보기 조작(끌기·위아래·크게 작게)을 켰나 — 접기 막대가 풀릴 때(답한 뒤) 함께 켠다
  // 화면에 넣은 모습(spec 17-18): 조금이라도 접힌 동안은 내 자세(view의 roll·zoom) 그대로, 다 편 전개도·답하기 전에는 처음 모습.
  // 둘이 바뀔 때는 shown이 목표로 0.2초 동안 다가간다(mixTick) — 그 밖에는 늘 목표와 같다
  let shown = lookFor(0, false, view); // 지금 화면에 넣은 { roll, zoom }
  let shownMine = false; // shown의 목표가 내 자세인가(아니면 처음 모습)
  let closing = false; // [펴기] 움직임의 끝(마지막 0.2초): 다 펴지기 전에 처음 모습으로 잇기 시작해 한 움직임으로 끝나게 한다
  let mixRaf = 0; // 잇는 움직임의 프레임 요청
  let mixStart = 0;
  let mixAt = 0; // 잇는 움직임이 지난 정도(0~1)
  let unit = 60;
  let zoom = 1; // 자동 맞춤 배율: 다 접은 입체를 무대에 맞게
  // 선명하게 그리는 배수(1~4): 브라우저는 3D 면을 놓인 크기(1배)로 그려 두고 늘리므로, 크게 볼 때는 면을 이만큼 크게 놓고
  // (--unit × raster, 테두리·빗금은 --k) 무대 변환을 그만큼 줄인다. 보이는 크기·자리는 같고 글자·빗금만 또렷해진다.
  // 멈춰 있을 때만 바꾼다(settle) — 끌기·접는 움직임 동안에는 transform만 바뀐다. 답하기 전·펼친 상태·처음 화면 그림은 늘 1
  let raster = 1;
  let baseTurn = 0;
  let baseTilt = TILT;
  let revealed = false;
  let verdict = null; // 정육면체가 되는 전개도의 결과 이름표를 단계가 정할 때 { ok, text } (주사위 주문: 눈의 합까지 맞아야 통과)
  let tOf = null;
  let blocked = []; // 한 꼭짓점에 네 면이 모인 곳
  let layout = null; // { unit, origin: [x, y] } 펼친 상태를 놓는 판의 칸과 같은 자리·크기로 (자유 배치)
  let layoutBox = null; // layout을 맞춘 때의 무대 크기
  let fitBox = null; // [가로, 세로](전개도 단위): 전개도가 이보다 작아도 이 크기에 맞춰 그린다 — 문항마다 1 cm의 화면 크기가 같게
  let pad = 0; // 무대 가장자리에 비워 둘 자리(px, 양쪽 합): 테두리 밖에 적는 꼭짓점 이름의 자리
  let showLengths = false; // 면마다 가로·세로 길이(cm)를 적는다
  let solidDiagonal = Math.sqrt(3); // 다 접은 입체를 감싸는 상자의 대각선(전개도 단위)
  let nameEls = []; // 꼭짓점 이름 { el, point } (펼친 전개도에서만 보인다)
  let faceEls = new Map();
  let slotEls = new Map();
  let markEls = [];
  let tagEls = []; // 띠 이름표(setEdgeMarks): 그릴 때마다 화면에서 바로 서게 돌리고(placeTag), 돌린 방향이 바뀌면 자리를 다시 잡는다
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
  // 각기둥 차시: 접은 입체를 놓는 자세(눕히기 · 세로축 둘레 돌림 — [{ axis, angle }] 차례로), 접는 정도에 맞춰 줄여 다 편 전개도는 늘 처음 모습
  let model = [];
  let lastScene = null; // 마지막으로 그린 장면 { folded, center, pose, px } — 면 누르기(pickAt)가 같은 계산을 쓴다

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
    closing = false;
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
    for (const s of slots) {
      const b = slotBox(s);
      pts.push([b.x, b.y], [b.x + b.w, b.y + b.h]);
    }
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
    const spanX = Math.max(max[0] - min[0], fitBox?.[0] ?? 0);
    const spanY = Math.max(max[1] - min[1], fitBox?.[1] ?? 0);
    const fit = (margin) => Math.floor(Math.min((width - pad) / (spanX + margin), (height - pad) / (spanY + margin)));
    let size = fit(0.9);
    // 빈 자리 버튼이 있으면 가장자리 여백을 줄여서라도 48px 이상으로 (좁은 휴대폰). 빈 자리의 짧은 변이 48px이 되는 크기까지
    const slotSide = slots.reduce((least, s) => Math.min(least, slotBox(s).w, slotBox(s).h), Infinity);
    if (slots.length > 0 && size * slotSide < TAP) size = Math.max(size, Math.min(Math.ceil(TAP / slotSide), fit(0.1)));
    const cube = net.kind === 'cube';
    unit = layout ? layout.unit : Math.max(cube ? MIN_UNIT : MIN_UNIT_CM, Math.min(MAX_UNIT, size));
    if (blocked.length > 0) zoom = 1;
    else if (cube) zoom = Math.max(1, Math.min(MAX_ZOOM, Math.min(width, height) / (3.3 * unit)));
    else zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(width, height) / (SPAN_PER_DIAGONAL * solidDiagonal * unit)));
    applyRaster();
  }

  /** 면을 놓는 크기(칸 한 변 px)와 테두리·빗금 굵기 배수를 무대에 준다 */
  function applyRaster() {
    scene.style.setProperty('--unit', `${unit * raster}px`);
    if (raster === 1) scene.style.removeProperty('--k');
    else scene.style.setProperty('--k', String(raster));
  }

  /** 멈춰 있을 때 부른다: 지금 보이는 배율에 맞춰 선명하게 그리는 배수를 고르고, 바뀌었으면 다시 그린다 */
  function settle() {
    if (!net || destroyed || mixRaf) return; // 잇는 움직임 동안에는 transform만 바꾼다 — 끝나면 다시 부른다
    const look = lookFor(t, viewOn && !still, view);
    const { scale } = sceneAt(t, { tilt: baseTilt, turn: baseTurn }, zoom, { spin: view.spin, ...look });
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

  /** 접는 정도 tt의 모습: 입체를 놓는 자세(model)가 있으면 그만큼 돌린다(tt에 비례 — 다 편 전개도는 돌리지 않는다) */
  function foldedAt(tt) {
    const folded = foldNet(net, tt, { tOf });
    if (model.length === 0) return folded;
    const M = model.reduce((m, r) => multiply(rotationAbout([0, 0, 0], r.axis, r.angle * tt), m), identity());
    return {
      ...folded,
      faces: folded.faces.map((f) => ({
        ...f,
        matrix: multiply(M, f.matrix),
        points: f.points.map((p) => applyPoint(M, p)),
        normal: normalize(applyDir(M, f.normal)),
        center: applyPoint(M, f.center),
      })),
    };
  }

  function render() {
    if (!net || destroyed) return;
    const folded = foldedAt(t);
    const pts = folded.faces.flatMap((f) => f.points);
    if (t <= 1e-6) {
      for (const s of slots) {
        const b = slotBox(s);
        pts.push([b.x, b.y, 0], [b.x + b.w, b.y + b.h, 0]);
      }
    }
    const { min, max } = bounds(pts);
    let center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    // 놓는 판에서 이어 접을 때: 펼친 상태는 판의 칸 자리 그대로, 접을수록 무대 가운데로 (면이 튀지 않게)
    if (layout) center = add(scaleVec(layoutCenter(), 1 - t), scaleVec(center, t));
    // 학생이 더 돌린 것·배율(shown)은 조금이라도 접힌 동안 그대로 넣고, 다 편 전개도·답하기 전에는 처음 모습이다(syncLook).
    // 더 돌린 것이 없으면 rotate3d를 쓰지 않는다 — 답하기 전·처음 보기의 변환이 전과 같은 글자다
    syncLook();
    const now = sceneAt(t, { tilt: baseTilt, turn: baseTurn }, zoom, { spin: view.spin, roll: shown.roll, zoom: shown.zoom });
    const { tilt, turn, scale, roll } = now;
    const z = (scale / raster).toFixed(4);
    const rolled = Math.abs(roll.angle) > 1e-4 ? ` rotate3d(${roll.axis.map((v) => +v.toFixed(5)).join(', ')}, ${roll.angle.toFixed(3)}deg)` : '';
    scene.style.transform = `scale3d(${z}, ${z}, ${z})${rolled} rotateX(${tilt.toFixed(3)}deg) rotateZ(${turn.toFixed(3)}deg)`;
    const pose = poseOf(now); // 모델 방향 → 화면 방향 (빛·뒷면·글자 바로 세우기에 쓴다)
    const look = { pose, px: unit * scale, eye: eyeOf(boxSize.height) };

    const lifts = marksShown ? overlapLifts(folded) : new Map();
    for (const f of folded.faces) {
      const faceEl = faceEls.get(f.id);
      const src = net.faces.find((x) => x.id === f.id);
      const { min: bmin } = bounds(src.poly);
      const lift = liftVector(f, lifts.get(f.id) ?? 0);
      faceEl.style.transform = toCssMatrix(placeMatrix(f.matrix, [bmin[0], bmin[1], 0], center, lift));
      faceEl.style.setProperty('--shade', shadeOf(f.normal, pose).toFixed(3));
      // 종이 안쪽이 보이는 면(구멍으로 보이는 안쪽 면, 아래에서 본 2×2 장면 등): 글자가 거울상이 되지 않게 뒤집는다(.is-back)
      const back = isBack(f.normal, f.center, center, look);
      faceEl.classList.toggle('is-back', back);
      if (marksShown) faceEl.style.setProperty('--mark-turn', `${uprightTurn(applyDir(f.matrix, [1, 0, 0]), applyDir(f.matrix, [0, 1, 0]), pose)}deg`);
      if (net.kind !== 'cube' && net.kind !== 'prism') settleInner(faceEl, f, back, pose);
    }
    for (const s of slots) {
      const slotEl = slotEls.get(s.key);
      slotEl.style.transform = toCssMatrix(placeMatrix(identity(), [slotBox(s).x, slotBox(s).y, 0], center));
    }
    // 꼭짓점 이름: 펼친 전개도의 테두리 밖에 적는다(접히기 시작하면 CSS가 숨긴다). 전개도를 평면에서 돌려도 글자는 바로 선다
    if (nameEls.length > 0 && t <= 1e-6) {
      scene.style.setProperty('--name-turn', `${(-turn).toFixed(3)}deg`);
      for (const n of nameEls) n.el.style.transform = toCssMatrix(placeMatrix(identity(), [n.point[0], n.point[1], 0], center));
    }
    // 띠 이름표(선분 이름 · 길이)는 읽어야 하는 표시라 "겹쳐요" · "비어요"와 같은 규칙으로 화면에서 바로 세운다 (common-rules 4절):
    // 펼친 전개도에서도, 접는 동안에도, 돌려 본 자세에서도. 띠는 면과 함께 그대로 접히고 이름표만 돈다
    for (const tag of tagEls) {
      const f = folded.faces.find((x) => x.id === tag.face);
      if (!f) continue;
      const turned = uprightTurn(applyDir(f.matrix, [1, 0, 0]), applyDir(f.matrix, [0, 1, 0]), pose);
      if (turned !== tag.turn) placeTag(tag, turned);
      // 각기둥: 이름표("5 cm")는 90° 단위가 아니라 끊김 없이 돌려 글줄을 늘 화면 가로로 — 돌려 본 자세에서도 눕지 않는다(자리는 위의 90° 단위 그대로)
      if (net.kind === 'prism') {
        const exact = uprightAngle(applyDir(f.matrix, [1, 0, 0]), applyDir(f.matrix, [0, 1, 0]), pose, faceEls.get(f.id)?.classList.contains('is-back'));
        tag.el.style.setProperty('--tag-turn', `${(exact ?? turned).toFixed(2)}deg`);
      }
    }
    el.classList.toggle('is-flat', t <= 1e-6);
    lastScene = { folded, center, pose, px: look.px };
    for (const m of markEls) m.place(center, folded, look);
    // 애니메이션 중에는 animateTo가 상태를 정한다
    if (!raf && timers.size === 0) el.dataset.fold = foldState();
    checkHint();
    emitView();
  }

  /** 종이 안쪽이 보이나: 면 가운데 mid(모델 좌표)를 무대 가운데 기준 px로 바꿔 눈 위치와 견준다 */
  function isBack(normal, mid, center, look) {
    return isBackFacing(normal, scaleVec(sub(mid, center), look.px), look.pose, look.eye);
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
    // 다각형 자리(각기둥의 밑면): 자리 모양대로 칠하고 변마다 점선 — 감싸는 직사각형이 아니라
    if (slot.clip) {
      markEl.classList.add('is-poly');
      markEl.prepend(h('i', { class: 'ghost-fill', style: { clipPath: clipOf(slot.clip) } }), ...polyLines(slot.clip, slot.clip.map(() => 'ghost')));
    }
    const { u, v, normal, center: c } = slot;
    const [gw, gh] = slot.size ?? [1, 1]; // 자리의 크기(정육면체는 한 칸)
    const origin = sub(sub(c, scaleVec(u, gw / 2)), scaleVec(v, gh / 2));
    const model = [
      u[0], v[0], normal[0], origin[0],
      u[1], v[1], normal[1], origin[1],
      u[2], v[2], normal[2], origin[2],
      0, 0, 0, 1,
    ];
    addMark(markEl, (center, folded, look) => {
      markEl.style.width = `${unit * raster * gw}px`;
      markEl.style.height = `${unit * raster * gh}px`;
      markEl.style.transform = toCssMatrix(placeMatrix(model, [0, 0, 0], center, scaleVec(normal, 0.01)));
      // "비어요" 글자도 면 글자와 같은 규칙으로 바로 세운다 (아래에서 봐도 거꾸로 서지 않게, 안쪽에서 보면 뒤집어서)
      markEl.classList.toggle('is-back', isBack(normal, c, center, look));
      markEl.style.setProperty('--mark-turn', `${uprightTurn(u, v, look.pose)}deg`);
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
    const folded = foldedAt(1);
    const pairs = overlappingPairs(folded);
    const missing = blocked.length > 0 ? [] : missingSlots(net, folded);
    for (const id of new Set(pairs.flat())) {
      const faceEl = faceEls.get(id);
      faceEl.classList.add('is-overlap');
      faceEl.querySelector('.face-mark').textContent = '✗ 겹쳐요';
    }
    for (const s of missing) ghostMark(s);
    // 정육면체는 겹침·빈 자리·막힌 꼭짓점으로, 그 밖의 입체(직육면체: 길이까지 맞아야 한다)는 판정과 같은 checkNet으로 정한다
    const ok = net.kind === 'cube'
      ? pairs.length === 0 && missing.length === 0 && blocked.length === 0 && net.faces.length === 6
      : checkNet(net).ok;
    // 이름표: 정육면체가 되는 전개도는 단계가 준 결과(verdict)가 있으면 그것을 쓴다. 안 되는 전개도의 까닭은 늘 여기서 정한다
    const shownOk = ok && verdict ? Boolean(verdict.ok) : ok;
    badge.hidden = false;
    badge.classList.toggle('is-wrong', !shownOk);
    const solid = SOLID_NAMES[net.kind] ?? SOLID_NAMES.cube;
    const stuck = blocked.every((v) => v.faces.length >= 4) ? '네 면이 한 점에 모여 접을 수 없어요' : '면이 한 점을 둘러싸 접을 수 없어요';
    // 각기둥: 되는 전개도는 그 이름("오각기둥이 됐어요"), 안 되는 전개도는 "각기둥이 안 돼요"
    const made = net.kind === 'prism' ? `${josa(net.name ?? '각기둥', '이/가')} 됐어요` : `${solid}가 됐어요`;
    const text = ok ? (verdict?.text ?? made) : blocked.length > 0 ? stuck : net.kind === 'prism' ? '각기둥이 안 돼요' : `${solid}가 안 돼요`;
    badge.replaceChildren(h('span', { class: 'badge-main' }, icon(shownOk ? 'check' : 'cross'), text));
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

  /** 다 접은 입체의 그 빈 자리가 지금 보기(어느 쪽으로 굴렸든)에서 보는 사람 쪽을 향하지 않나 */
  function slotHidden(slot) {
    return !facesViewer(slot.normal, foldedPose({ tilt: baseTilt, turn: baseTurn }, view));
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
  const clipOf = (points) => `polygon(${points.map(([x, y]) => `calc(var(--unit) * ${x.toFixed(4)}) calc(var(--unit) * ${y.toFixed(4)})`).join(', ')})`;
  /** 다각형의 변마다 선(.poly-line): 변 위에 가운데를 맞춘 얇은 띠. kinds[i]: 'cut'(자른 곳 — 실선) · 'fold'(접는 곳 — 점선) · 'ghost' · null(선 없음) */
  function polyLines(points, kinds = []) {
    return points.map((p, i) => {
      if (kinds[i] === null) return null;
      const q = points[(i + 1) % points.length];
      const line = h('i', { class: `poly-line${kinds[i] ? ` is-${kinds[i]}` : ''}`, 'aria-hidden': 'true' });
      line.style.left = `calc(var(--unit) * ${p[0].toFixed(4)})`;
      line.style.top = `calc(var(--unit) * ${p[1].toFixed(4)})`;
      line.style.width = `calc(var(--unit) * ${Math.hypot(q[0] - p[0], q[1] - p[1]).toFixed(4)})`;
      line.style.transform = `rotate(${Math.atan2(q[1] - p[1], q[0] - p[0]).toFixed(5)}rad) translateY(-50%)`;
      return line;
    }).filter(Boolean);
  }
  let foldEdges = new Map(); // 각기둥: 면 id → 접는 선인 변 번호들(경첩을 이룬 두 변 가운데 한 면에만 점선을 그린다 — 겹친 두 점선이 어긋나 보이지 않게)

  /**
   * 각기둥의 면(.is-poly): 버튼은 투명한 틀이고, 다각형 종이(.face-paper — clip-path, 누르기 판정도 이 모양)와 변의 선(.poly-line)을 안에 둔다.
   * 버튼에 clip-path를 주면 그 안의 띠 이름표·초점 표시까지 잘리므로 종이에만 준다. 이름(.face-inner)은 다각형의 가운데(무게중심)에
   */
  function buildPolyFace(faceEl, f, min) {
    const pts = f.poly.map(([x, y]) => [x - min[0], y - min[1]]);
    faceEl.classList.add('is-poly');
    const folds = foldEdges.get(f.id) ?? new Set();
    const hinged = hingedEdges.get(f.id) ?? new Set();
    const kinds = pts.map((_, i) => (folds.has(i) ? 'fold' : hinged.has(i) ? null : 'cut'));
    faceEl.prepend(h('span', { class: 'face-paper', 'aria-hidden': 'true', style: { clipPath: clipOf(pts) } }), ...polyLines(pts, kinds));
    const [cx, cy] = centroid(pts);
    // 이름 상자: 가운데에서 가장 가까운 변까지의 거리로 — 좁은 삼각형에서도 상자가 면 안에 든다
    const room = Math.min(...pts.map((p, i) => {
      const q = pts[(i + 1) % pts.length];
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      return Math.abs((q[0] - p[0]) * (cy - p[1]) - (q[1] - p[1]) * (cx - p[0])) / len;
    }));
    const side = Math.max(0.6, 1.6 * room);
    const inner = faceEl.querySelector('.face-inner');
    inner.style.left = `calc(var(--unit) * ${(cx - side / 2).toFixed(4)})`;
    inner.style.top = `calc(var(--unit) * ${(cy - side / 2).toFixed(4)})`;
    inner.style.width = `calc(var(--unit) * ${side.toFixed(4)})`;
    inner.style.height = `calc(var(--unit) * ${side.toFixed(4)})`;
  }
  let hingedEdges = new Map(); // 각기둥: 면 id → 경첩을 이룬 변 번호들(그 가운데 점선을 그리지 않는 쪽은 선 없이 — 이웃 면이 그린다)

  function buildFace(f) {
    const { min, max } = bounds(f.poly);
    const faceEl = h('button', {
      type: 'button',
      class: 'net-face',
      tabindex: interactive && !still ? null : '-1',
      'aria-label': skin?.name ? skin.name(f.label) : `${f.label} 면`,
      dataset: { face: f.id, label: f.label },
      style: { width: `calc(var(--unit) * ${max[0] - min[0]})`, height: `calc(var(--unit) * ${max[1] - min[1]})` },
      onclick: () => onFaceClick?.(f.id),
    },
      h('span', { class: 'face-inner' },
        h('span', { class: 'face-label' }, skin?.mark ? skin.mark(h, f.label) : f.label),
        h('span', { class: 'face-mark', 'aria-hidden': 'true' }),
      ),
    );
    faceEl.style.setProperty('--face-color', skin?.color ? skin.color(f.label) : faceColor(f.label));
    if (net.kind === 'prism') {
      buildPolyFace(faceEl, f, min);
      return faceEl;
    }
    if (net.kind !== 'cube') {
      faceEl.classList.add('is-rect'); // 직사각형 면: 이름 자리(--lx · --ly)와 안쪽 상자(.is-quarter)를 view3d.js가 맞춘다 (cuboid.css)
      // 면의 가로·세로(칸): 글자를 바로 세우느라 면 안쪽을 90° 돌릴 때 안쪽 상자의 가로·세로를 바꾸는 데 쓴다(.is-quarter)
      faceEl.style.setProperty('--fw', String(Math.round((max[0] - min[0]) * 1e4) / 1e4));
      faceEl.style.setProperty('--fh', String(Math.round((max[1] - min[1]) * 1e4) / 1e4));
    }
    if (showLengths) {
      // 길이 이름표: 면마다 위쪽 변에 가로, 왼쪽 변에 세로 길이를 적는다 — 어떤 전개도든(되든 안 되든) 같은 규칙
      const [w, hgt] = [max[0] - min[0], max[1] - min[1]].map((v) => `${Math.round(v * 100) / 100} cm`);
      faceEl.setAttribute('aria-label', `${f.label} 면, 가로 ${w}, 세로 ${hgt}`);
      faceEl.classList.add('has-len');
      faceEl.append(
        h('span', { class: 'face-len is-w', 'aria-hidden': 'true' }, w),
        h('span', { class: 'face-len is-h', 'aria-hidden': 'true' }, hgt),
      );
    }
    if (!isAxisRect(f.poly)) {
      const pts = f.poly.map(([x, y]) => `calc(var(--unit) * ${x - min[0]}) calc(var(--unit) * ${y - min[1]})`);
      faceEl.style.clipPath = `polygon(${pts.join(', ')})`;
    }
    return faceEl;
  }

  function buildSlot(s) {
    const slotEl = h('button', {
      type: 'button',
      class: 'net-slot dnd-target',
      'aria-label': s.label ?? '빈 자리',
      dataset: { cell: s.key },
    }, h('span', { class: 'slot-plus', 'aria-hidden': 'true' }, '+'));
    if (s.rect) {
      slotEl.style.width = `calc(var(--unit) * ${s.rect.w})`;
      slotEl.style.height = `calc(var(--unit) * ${s.rect.h})`;
    }
    return slotEl;
  }

  /** 꼭짓점 이름(ㄱㄴㄷ…): 테두리 꼭짓점의 바깥쪽에 적는다. names: [{ name, point: [x, y], out: [dx, dy] }] */
  function buildName(n) {
    const nameEl = h('div', { class: 'net-vname', 'aria-hidden': 'true' }, h('span', null, n.name));
    nameEl.style.setProperty('--ox', String(n.out[0]));
    nameEl.style.setProperty('--oy', String(n.out[1]));
    return { el: nameEl, point: n.point };
  }

  // ── 정육면체가 아닌 입체(면이 직사각형)의 글자 자리 ─────────────────
  const SPUN_FACES = ['is-overlap', 'is-correct', 'is-placed']; // 다 접힌 뒤 글자를 바로 세우는 면 (style.css .marks-on …)
  /**
   * 길이 글자가 있는 면의 이름(가~바)을 가운데에서 옮기는 만큼(칸): 오른쪽 아래 — 왼쪽 가운데의 세로 길이 글자와 위쪽의 가로 길이 글자를 피한다.
   * 폭이 좁은 면(크기를 바꾼 면의 1 cm 폭)은 옆에 자리가 없어 세로 길이 글자 아래로 내리고, 높이가 낮은 면은 가로 길이 글자의 오른쪽으로 보낸다
   */
  const labelShift = (width, height) => (width < 1.5 ? [0, 0.44] : height < 1.5 ? [0.62, 0.08] : [0.34, 0.14]);
  /** "✗ 겹쳐요"가 켜진 면: 이름을 안쪽 상자의 위로 조금 올려 아래쪽의 "✗ 겹쳐요" 띠와 떨어뜨린다(안쪽 좌표 — 띠와 함께 돈다) */
  const OVERLAP_SHIFT = [0, -0.14];
  /**
   * 정육면체가 아닌 면의 뒷정리 — 정육면체의 면에는 손대지 않는다.
   * · 글자를 바로 세우느라 면 안쪽(.face-inner)을 90° · 270° 돌리는 면은 안쪽 상자의 가로·세로도 바꾼다(.is-quarter, cuboid.css):
   *   "✗ 겹쳐요" 띠가 긴 면의 밖으로 나가지 않는다
   * · 면의 이름을 옮긴다(--lx · --ly, 안쪽 좌표): 길이 글자가 있는 면은 면을 어떻게 돌려 세우든, 종이 안쪽이 보여 뒤집든 늘 같은 자리
   *   (labelShift)에 있게 면 안쪽의 돌림·뒤집기를 거꾸로 계산해 준다 — 길이 글자와 포개지지 않는다. "✗ 겹쳐요"가 켜진 면은 띠 위로
   */
  function settleInner(faceEl, f, back, pose) {
    const spun = marksShown && (blocked.length > 0 || SPUN_FACES.some((c) => faceEl.classList.contains(c)));
    const turned = spun ? uprightTurn(applyDir(f.matrix, [1, 0, 0]), applyDir(f.matrix, [0, 1, 0]), pose) : 0;
    faceEl.classList.toggle('is-quarter', turned % 180 !== 0);
    let lx = 0;
    let ly = 0;
    if (marksShown && faceEl.classList.contains('is-overlap')) [lx, ly] = OVERLAP_SHIFT;
    else if (showLengths) {
      const [sx, sy] = labelShift(Number(faceEl.style.getPropertyValue('--fw')) || 1, Number(faceEl.style.getPropertyValue('--fh')) || 1);
      const a = rad(-turned);
      lx = (sx * Math.cos(a) - sy * Math.sin(a)) * (back ? -1 : 1);
      ly = sx * Math.sin(a) + sy * Math.cos(a);
    }
    const key = `${lx.toFixed(3)},${ly.toFixed(3)}`;
    if (faceEl.dataset.shift === key) return;
    faceEl.dataset.shift = key;
    faceEl.style.setProperty('--lx', lx.toFixed(3));
    faceEl.style.setProperty('--ly', ly.toFixed(3));
  }

  const boxOverlap = (p, q) => Math.max(0, Math.min(p[2], q[2]) - Math.max(p[0], q[0])) * Math.max(0, Math.min(p[3], q[3]) - Math.max(p[1], q[1]));

  /**
   * 띠 이름표 하나의 자리를 잡는다(면 안 좌표, 칸 단위). turned: 화면에서 바로 서게 돌린 각도(90° 단위).
   * 변 가운데에서 면 안쪽으로 들어간 자리가 기본이고, 면 이름이나 다른 이름표와 포개지면 변을 따라 옆으로 옮긴다.
   * 그래도 남은 길이 글자와 포개지면 그 길이 글자를 숨긴다(.is-covered) — 이름표가 그 변의 길이를 말한다.
   */
  function placeTag(tag, turned) {
    tag.turn = turned;
    const across = Math.abs(Math.sin(rad(turned) - tag.angle)) > 0.7; // 이름표의 긴 쪽이 변을 가로지른다
    const [major, minor] = tag.size; // 이름표의 긴 쪽 · 짧은 쪽
    const [w, hgt] = turned % 180 === 0 ? [major, minor] : [minor, major]; // 면 안 좌표에서 차지하는 가로 · 세로
    const px = 1 / unit; // 화면 1px(배율 1)의 칸 단위
    const half = (across ? major : minor) / 2; // 이름표가 변에서 안쪽으로 차지하는 깊이의 절반
    // 변에서 안쪽으로: 이름표가 그 변 밖으로 나가지 않을 만큼 들어가되, 얕은 면에서는 맞은편 변도 넘지 않게(면보다 길면 가운데에)
    const depth = Math.min(Math.max(17 * px, 0.42, half + 2 * px), Math.max(tag.deep - half, tag.deep / 2));
    const room = Math.max(0, (tag.len - (across ? minor : major)) / 2); // 변을 따라 옮길 수 있는 만큼(이름표가 변의 끝을 넘지 않게)
    const others = tagEls.filter((x) => x !== tag && x.face === tag.face && x.rect).map((x) => x.rect);
    // 옮겨 볼 자리: 변 가운데가 먼저, 그다음 가까운 곳부터(면 이름을 옮긴 쪽의 반대인 왼쪽·위쪽 먼저) 변의 끝까지
    const toward = (Math.abs(tag.along[0]) > 0.7 ? tag.along[0] : tag.along[1]) > 0 ? -1 : 1;
    const shifts = [0];
    for (const step of [0.75, 1.25, 1.75, room]) {
      const move = Math.min(step, room);
      if (move > 1e-9 && !shifts.some((v) => Math.abs(Math.abs(v) - move) < 1e-9)) shifts.push(toward * move, -toward * move);
    }
    let best = null;
    for (const move of shifts) {
      const cx = tag.mid[0] + tag.inward[0] * depth + tag.along[0] * move;
      const cy = tag.mid[1] + tag.inward[1] * depth + tag.along[1] * move;
      const rect = [cx - w / 2, cy - hgt / 2, cx + w / 2, cy + hgt / 2];
      const hard = [tag.label, ...others].filter(Boolean).reduce((sum, box) => sum + boxOverlap(rect, box), 0);
      const soft = tag.lens.reduce((sum, len) => sum + boxOverlap(rect, len.box), 0);
      if (!best || hard < best.hard - 1e-9 || (Math.abs(hard - best.hard) <= 1e-9 && soft < best.soft - 1e-9)) best = { cx, cy, rect, hard, soft };
      if (hard + soft <= 1e-9) break;
    }
    tag.rect = best.rect;
    tag.el.style.left = `calc(var(--unit) * ${best.cx.toFixed(4)})`;
    tag.el.style.top = `calc(var(--unit) * ${best.cy.toFixed(4)})`;
    tag.el.style.setProperty('--tag-turn', `${turned}deg`);
    // 그 면의 남은 길이 글자: 어느 이름표와든 포개지면 숨긴다
    const mine = tagEls.filter((x) => x.face === tag.face && x.rect);
    for (const len of tag.lens) len.el.classList.toggle('is-covered', mine.some((x) => boxOverlap(x.rect, len.box) > 1e-9));
  }

  /**
   * 면의 변에 띠 무늬와 이름표를 붙인다(만나는 선분 · 길이가 다른 두 변). 새 전개도가 놓일 때까지 남는다.
   * marks: [{ face(면 id), edge(몇 번째 변), tone('q' 물음 · 'a' · 'b' 같은 무늬끼리 짝), text(이름표 글자, 없어도 됨), key(띠의 data-mark, 없어도 됨) }]
   * 띠는 변을 따라 면 안쪽에 놓이고(면과 함께 접힌다), 이름표는 그 변 안쪽에서 화면 기준으로 바로 선다(render → placeTag).
   * 길이 이름표(lengths)가 있는 면: 이름표가 붙은 변과 같은 쪽 길이 글자(위·아래 변이면 가로, 왼쪽·오른쪽 변이면 세로)는 숨긴다 —
   *   띠 이름표가 그 길이를 말하고, 두 글자가 포개지지 않는다 (.has-tag-w · .has-tag-h, cuboid.css)
   */
  function setEdgeMarks(marks = []) {
    tagEls = [];
    for (const faceEl of faceEls.values()) {
      for (const old of faceEl.querySelectorAll('.edge-band, .edge-tag')) old.remove();
      faceEl.classList.remove('has-tag-w', 'has-tag-h');
      for (const len of faceEl.querySelectorAll('.face-len.is-covered')) len.classList.remove('is-covered');
    }
    const px = unit * raster; // 지금 면을 놓은 크기(칸 한 변 px)
    for (const mark of marks) {
      const face = net?.faces.find((f) => f.id === mark.face);
      const faceEl = faceEls.get(mark.face);
      if (!face || !faceEl) continue;
      const { min, max } = bounds(face.poly);
      const size = [max[0] - min[0], max[1] - min[1]]; // 면의 가로 · 세로(칸)
      let p = face.poly[mark.edge];
      let q = face.poly[(mark.edge + 1) % face.poly.length];
      const mid = centroid(face.poly);
      // 띠의 두께 쪽(변을 따라가는 방향에서 시계 방향 90°)이 면 안쪽을 향하게 변의 방향을 고른다
      const inward = (a, b) => -(b[1] - a[1]) * (mid[0] - a[0]) + (b[0] - a[0]) * (mid[1] - a[1]);
      if (inward(p, q) < 0) [p, q] = [q, p];
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const angle = Math.atan2(q[1] - p[1], q[0] - p[0]);
      const band = h('span', { class: `edge-band is-${mark.tone ?? 'a'}`, 'aria-hidden': 'true' });
      if (mark.key != null) band.dataset.mark = String(mark.key); // 띠를 눌러 고르는 단계(각기둥의 맞닿는 선분): 어느 보기의 띠인지
      band.style.left = `calc(var(--unit) * ${p[0] - min[0]})`;
      band.style.top = `calc(var(--unit) * ${p[1] - min[1]})`;
      band.style.width = `calc(var(--unit) * ${len})`;
      band.style.transform = `rotate(${angle.toFixed(5)}rad)`;
      faceEl.append(band);
      if (!mark.text) continue;
      const tag = h('span', { class: `edge-tag is-${mark.tone ?? 'a'}`, 'aria-hidden': 'true' }, h('span', null, mark.text));
      if (mark.key != null) tag.dataset.mark = String(mark.key);
      faceEl.append(tag);
      const wide = Math.abs(Math.cos(angle)) > 0.7; // 위·아래 변
      faceEl.classList.add(wide ? 'has-tag-w' : 'has-tag-h');
      // 피할 것: 면 이름(늘 같은 자리 — settleInner)과, 같은 쪽이 아니라 남아 있는 길이 글자. 놓인 크기는 한 번만 잰다(칸 단위)
      const labelEl = faceEl.querySelector('.face-label');
      let label = null;
      if (labelEl && labelEl.textContent.trim()) {
        const side = Math.max(labelEl.offsetWidth, labelEl.offsetHeight) / px || 0.45; // 돌려 세워도 들어가는 정사각형
        const [sx, sy] = showLengths ? labelShift(size[0], size[1]) : [0, 0];
        const cx = mid[0] - min[0] + sx;
        const cy = mid[1] - min[1] + sy;
        label = [cx - side / 2, cy - side / 2, cx + side / 2, cy + side / 2];
      }
      const lens = [...faceEl.querySelectorAll(`.face-len.${wide ? 'is-h' : 'is-w'}`)].map((lenEl) => {
        const [lw, lh] = [lenEl.offsetWidth / px, lenEl.offsetHeight / px];
        const [lx, ly] = [lenEl.offsetLeft / px, lenEl.offsetTop / px];
        // 가로 길이 글자는 가로 가운데 맞춤(translateX(-50%)), 세로 길이 글자는 세로 가운데 맞춤
        return { el: lenEl, box: wide ? [lx, ly - lh / 2, lx + lw, ly + lh / 2] : [lx - lw / 2, ly, lx + lw / 2, ly + lh] };
      });
      tagEls.push({
        el: tag,
        face: mark.face,
        angle,
        len,
        // 그 변에서 맞은편 변까지(면의 깊이). 각기둥의 다각형 면은 그 변에서 가장 먼 꼭짓점까지
        deep: net.kind === 'prism' ? Math.max(...face.poly.map(([x, y]) => Math.abs(-(q[1] - p[1]) * (x - p[0]) + (q[0] - p[0]) * (y - p[1])) / (len || 1))) : wide ? size[1] : size[0],
        mid: [(p[0] + q[0]) / 2 - min[0], (p[1] + q[1]) / 2 - min[1]], // 변 가운데
        along: [Math.cos(angle), Math.sin(angle)],
        inward: [-Math.sin(angle), Math.cos(angle)],
        size: [tag.offsetWidth / px || 1, tag.offsetHeight / px || 0.45], // 이름표의 긴 쪽 · 짧은 쪽
        label,
        lens,
        turn: null,
        rect: null,
      });
    }
    if (net && tagEls.length > 0) render(); // 이름표를 지금 자세에 맞게 바로 세워 자리를 잡는다
  }

  /**
   * 새 전개도를 펼친 상태로 보인다. slots: [{ key, cell, label }] 면을 붙일 빈 자리.
   * focus: 다 접었을 때 잘 보여야 할 면 id ([★ 면, 정답 면]) — displayNet 참고
   * layout: { unit(칸 한 변 px), origin([x, y] 무대 안에서 칸 (0, 0)의 왼쪽 위 px) } — 놓는 판의 칸 크기·자리를 그대로 써서
   *   판에서 무대로 바뀔 때 면이 튀지 않는다(자유 배치). 무대 크기가 바뀌면 보통 크기로 돌아간다.
   * 길이가 있는 전개도(직육면체 …)에 쓰는 선택 값 — 주지 않으면 지금까지와 같다:
   *   slots의 rect: { x, y, w, h } 빈 자리가 칸 하나가 아닐 때 · show: 처음 시점에서 함께 보여야 할 면 id
   *   fitBox: [가로, 세로] 전개도가 작아도 이 크기에 맞춰 그린다(문항마다 1 cm의 화면 크기가 같게 — 크기로 답이 드러나지 않게)
   *   pad: 무대 가장자리에 비워 둘 px(양쪽 합) · lengths: 면마다 가로·세로 길이(cm) 이름표 · names: 꼭짓점 이름 [{ name, point, out }]
   */
  function setNet(nextNet, {
    slots: nextSlots = [], focus = [], show = [], layout: nextLayout = null, fitBox: nextFit = null, pad: nextPad = 0, lengths = false, names = [],
    model: nextModel = [], view: fixedView = null,
  } = {}) {
    stopAnimation();
    clearMarks();
    marksKey = '';
    layout = nextLayout && nextLayout.unit > 0 && Array.isArray(nextLayout.origin) ? { unit: nextLayout.unit, origin: [...nextLayout.origin] } : null;
    fitBox = Array.isArray(nextFit) ? [...nextFit] : null;
    pad = Math.max(0, Number(nextPad) || 0);
    showLengths = Boolean(lengths);
    // view: 처음 보기를 정해 줄 때({ turn, tilt } — 각기둥의 밑면 고르기: 입체의 자세는 model이 정한다). 없으면 지금처럼 displayNet이 고른다
    model = Array.isArray(nextModel) ? nextModel.map((r) => ({ axis: [...r.axis], angle: r.angle })) : [];
    ({ net, turn: baseTurn, tilt: baseTilt } = fixedView
      ? { net: nextNet, turn: fixedView.turn ?? 0, tilt: fixedView.tilt ?? TILT }
      : displayNet(nextNet, { focus, show }));
    lastScene = null;
    // 각기둥: 경첩(접는 곳)마다 한 면에만 점선, 다른 면은 그 변에 선을 그리지 않는다. 나머지 변은 자른 곳(실선) — spec-grade6 1-1절 정리
    foldEdges = new Map();
    hingedEdges = new Map();
    if (net.kind === 'prism') {
      const put = (map, id, i) => map.set(id, (map.get(id) ?? new Set()).add(i));
      for (const hg of findHinges(net)) {
        const [first, second] = hg.a < hg.b ? [[hg.a, hg.ea], [hg.b, hg.eb]] : [[hg.b, hg.eb], [hg.a, hg.ea]];
        put(foldEdges, ...first);
        put(hingedEdges, ...second);
      }
    }
    slots = nextSlots;
    revealed = false;
    verdict = null;
    t = 0;
    endGesture();
    view = homeView(); // 새 전개도는 늘 처음 보기에서 시작한다 (판 → 무대 이어 접기도 여기서 시작)
    stopMix(); // 잇던 움직임 없이 바로 처음 모습에서
    shown = lookFor(0, false, view);
    shownMine = false;
    raster = 1;
    hintDone = false;
    blocked = fullVertices(net);
    tOf = stuckTOf(net, blocked); // 2×2 덩어리면 접다가 멈추는 장면
    faceEls = new Map(net.faces.map((f) => [f.id, buildFace(f)]));
    slotEls = new Map(slots.map((s) => [s.key, buildSlot(s)]));
    nameEls = names.map(buildName);
    scene.replaceChildren(...faceEls.values(), ...slotEls.values(), ...nameEls.map((n) => n.el));
    if (net.kind !== 'cube') {
      // 자동 맞춤에 쓰는 크기: 다 접은 모습을 감싸는 상자의 대각선
      const { min, max } = bounds(foldedAt(1).faces.flatMap((f) => f.points));
      solidDiagonal = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
    }
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
        closing = false;
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
        // 첫 프레임의 시각(프레임이 시작된 때)은 누른 처리 안에서 잰 start보다 앞설 수 있다: 0 아래로 내려가면 접는 정도가 0 근처에서 오르내린다
        const p = Math.max(0, Math.min(1, (now - start) / ms));
        raf = p < 1 ? requestAnimationFrame(step) : 0;
        // 다 펴는 움직임: 끝나기 0.2초 전부터 처음 모습으로 잇기 시작해, 펴지는 것과 처음 모습으로 돌아가는 것이 함께 끝난다
        // (움직임 없이 바로 바꾸는 저사양에서는 미리 하지 않는다 — 다 펴진 때 바뀐다)
        if (target <= 1e-6 && ms - (now - start) <= MIX_MS && !instantMix()) closing = true;
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

  // 내 자세 ↔ 처음 모습 잇기 (spec 17-18)
  /** 화면에 내 자세를 넣을 때인가: 보기 조작이 되는 동안. 다 펴는 움직임의 마지막 0.2초는 미리 처음 모습 쪽으로 */
  const wantMine = () => canView() && !closing;
  const lookGoal = () => (shownMine ? { roll: [...view.roll], zoom: view.zoom } : lookFor(0, false, view));
  /** 잇는 움직임 없이 바로 바꿀 때: 움직임 줄이기·저사양(?fx=low)·정지 무대 */
  const instantMix = () => still || destroyed || prefersReducedMotion() || Boolean(el.closest('.fx-low'));

  function stopMix() {
    cancelAnimationFrame(mixRaf);
    mixRaf = 0;
    el.classList.remove('is-easing');
  }

  /**
   * 화면에 넣을 모습(shown)을 정한다 — render()가 그리기 전에 부른다.
   * 목표(내 자세 ↔ 처음 모습)가 바뀌면 0.2초 동안 다가가는 움직임을 시작하고, 움직이는 중이 아니면 늘 목표와 같다.
   */
  function syncLook() {
    const mine = wantMine();
    if (mine !== shownMine) {
      shownMine = mine;
      stopMix();
      if (!instantMix() && !sameLook(shown, lookGoal())) {
        mixStart = performance.now();
        mixAt = 0;
        mixRaf = requestAnimationFrame(mixTick);
        el.classList.add('is-easing');
        return; // shown은 지금 모습 그대로 — 다음 프레임부터 목표로 다가간다
      }
    }
    if (!mixRaf) shown = lookGoal();
  }

  /** 잇는 움직임의 한 프레임: 지금 화면의 모습에서 지금의 목표로, 남은 시간에 맞춰 같은 빠르기로 다가간다 */
  function mixTick(now) {
    mixRaf = 0;
    if (destroyed || !net) return;
    const p = Math.max(mixAt, Math.min(1, (now - mixStart) / MIX_MS));
    shown = lookToward(shown, lookGoal(), mixStep(mixAt, p));
    mixAt = p;
    if (p < 1) mixRaf = requestAnimationFrame(mixTick);
    else el.classList.remove('is-easing');
    render();
    // 다 왔으면 멈춘 것: 선명하게 다시 그린다(접는 움직임·끌기가 이어지는 중이면 그쪽이 끝날 때 한다)
    if (p >= 1 && !raf && timers.size === 0 && !gesture) settle();
  }
  const say = (text) => {
    if (destroyed) return;
    for (const fn of sayListeners) fn(text);
  };

  /** 접은 입체를 어느 높이에서 보고 있나(도, 0 위에서 · 90 옆에서 · 180 아래에서) — 화면 읽기 알림의 구간을 정한다 */
  const elevation = () => elevationOf(foldedPose(baseView(), view));

  /** 조작판에 지금 상태를 알린다(바뀌었을 때만): { can, zoomMax, zoomMin, home }. 회전에는 한계가 없다 */
  function emitView() {
    const can = canView();
    el.classList.toggle('can-view', can);
    if (!can && gesture) endGesture(); // 잠기거나 다 펴면 하던 끌기를 멈춘다
    const state = { can, ...viewLimits(view) };
    const key = Object.values(state).join();
    if (key === viewKey) return;
    viewKey = key;
    for (const fn of viewListeners) fn(state);
  }

  /** 보기를 바꾸고 다시 그린 뒤, 보는 높이 구간이 바뀌었으면 화면 읽기로 알린다 */
  function turnTo(next) {
    const before = tiltZone(elevation());
    view = next;
    render();
    const after = elevation();
    if (tiltZone(after) !== before) say(tiltWord(after));
  }

  /**
   * 좌우로 돌리기(deg > 0: 오른쪽 면이 앞으로). 접힌 입체는 화면 기준 세로축 둘레로 끝없이 돈다.
   * 펼친 전개도(답하기 전·다 편 상태)는 지금처럼 평면에서 돈다
   */
  function rotate(deg) {
    if (canView()) turnTo(stepView(view, deg > 0 ? 'right' : 'left', Math.abs(deg)));
    else {
      view = turnBy(view, deg);
      render();
    }
  }

  /** 위쪽(dir < 0: 위쪽 면이 더 보이게)·아래쪽(dir > 0)으로 한 단계. 화면 기준 가로축 둘레로 끝없이 돈다 */
  function tiltStep(dir) {
    if (!canView()) return false;
    turnTo(stepView(view, dir < 0 ? 'up' : 'down'));
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
  const TOUCH_MOVE = { passive: false }; // touchmove를 preventDefault 하려면 passive가 아니어야 한다 (돌리는 동안에만 듣는다)
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
    globalThis.removeEventListener?.('touchmove', onTouchMove, TOUCH_MOVE);
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
    const height = elevation();
    if (tiltZone(height) !== g.zone) say(tiltWord(height));
    else if (Math.abs(view.zoom - g.zoom) > 0.005) say(zoomWord(view.zoom));
  }

  function onPointerDown(event) {
    // 새로 눌렀다: 앞선 끌기의 "따라오는 click 삼키기"가 (기기가 느려 타이머가 밀려) 남아 있어도 이 누르기의 click은 삼키지 않는다
    if (swallowClick && !gesture) {
      clearTimeout(swallowTimer);
      swallowTimer = 0;
      swallowClick = false;
    }
    if (!canView() || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (event.isPrimary && gesture) endGesture(); // 뗀 것을 못 받은 포인터가 남아 있으면 버린다
    if (pointers.size >= 2) return; // 셋째 손가락은 쓰지 않는다
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      gesture = { mode: 'wait', x: event.clientX, y: event.clientY, zone: tiltZone(elevation()), zoom: view.zoom };
      // 끌기 전(문턱 전)에는 포인터를 붙잡지 않으므로, 무대 밖에서 움직이거나 떼어도 받도록 창에서 듣는다
      globalThis.addEventListener('pointermove', onPointerMove);
      globalThis.addEventListener('pointerup', onPointerUp);
      globalThis.addEventListener('pointercancel', onPointerUp);
      globalThis.addEventListener('touchmove', onTouchMove, TOUCH_MOVE);
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
    view = dragView(view, dx, dy); // 끈 방향으로 구른다(화면 기준, 한계 없음)
    render();
  }

  function onPointerUp(event) {
    if (!pointers.delete(event.pointerId)) return;
    // 두 손가락에서 한 손가락이 되면: 남은 손가락의 마지막 자리부터 이어 돌린다(튀지 않는다)
    if (pointers.size === 1 && gesture?.mode === 'pinch') gesture.mode = 'turn';
    else if (pointers.size === 0) endGesture(true);
  }

  /**
   * 손가락으로 돌리는(벌리는) 동안의 touchmove는 "우리가 썼다"고 알린다(preventDefault).
   * 보기 조작이 켜진 무대는 touch-action: none이라 화면이 스크롤되지는 않지만, 알리지 않으면 브라우저는 이 움직임을 화면 쓸기로도 세어
   * 손을 떼는 순간 보이지 않는 관성 스크롤(fling)을 시작한다. 크롬(크롬북·안드로이드·리눅스)은 그 관성이 도는 동안의 첫 탭을
   * "관성 멈추기"로 여겨 click을 만들지 않는다 — 입체를 휙 돌린 바로 뒤에 누른 버튼이 먹히지 않는다.
   */
  function onTouchMove(event) {
    if (gesture && event.cancelable) event.preventDefault();
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

  /**
   * 화면의 점(clientX, clientY)에서 맨 앞에 보이는 면 id (없으면 null). 마지막으로 그린 장면을 무대와 같은 계산(자세 · 배율 · 원근)으로 화면 좌표에 놓고
   * fold.js pickFace로 고른다 — 브라우저의 누르기 판정은 거의 옆으로 선 3D 면에서 어긋날 수 있다(spec-grade6 6-1절)
   */
  function pickAt(clientX, clientY) {
    if (!net || !lastScene) return null;
    const box = el.getBoundingClientRect();
    const point = [clientX - (box.left + box.width / 2), clientY - (box.top + box.height / 2)];
    const { folded, center, pose, px } = lastScene;
    const faces = folded.faces.map((f) => ({ id: f.id, points: f.points.map((p) => turnVector(pose, scaleVec(sub(p, center), px))) }));
    return pickFace(faces, point, { eye: eyeOf(box.height) });
  }

  /** 면 고르기 단계(onPick): 무대를 누르면 계산한 맨 앞 면을 알린다. 끌기 뒤 따라오는 click은 onClickCapture가 먼저 삼킨다. 키보드(Enter·Space)는 초점 받은 면 */
  function onPickClick(event) {
    if (!onPick || event.defaultPrevented) return;
    const faceEl = event.target instanceof Element ? event.target.closest('.net-face') : null;
    const id = event.detail === 0 ? faceEl?.dataset.face ?? null : pickAt(event.clientX, event.clientY);
    event.preventDefault();
    event.stopPropagation();
    if (id != null) onPick(id);
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
    if (onPick) el.addEventListener('click', onPickClick, true);
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
    /** 조작판 상태 알림: fn({ can, zoomMax, zoomMin, home }) */
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
    /**
     * 답한 뒤의 표시(겹침·빈 자리·●·결과 이름표)를 보인다. result: { ok, text } — 정육면체가 되는 전개도의 이름표를 단계가 정할 때
     * (예: 주사위 주문 "합이 7이 아닌 짝이 있어요"). 없으면 "정육면체가 됐어요". 안 되는 전개도의 이름표는 바뀌지 않는다
     */
    reveal(result = null) {
      verdict = result && typeof result.text === 'string' ? { ok: Boolean(result.ok), text: result.text } : null;
      revealed = true;
      updateMarks();
      render();
    },
    faceEl: (id) => faceEls.get(id),
    slotEl: (key) => slotEls.get(key),
    pickAt,
    setEdgeMarks,
    /** 지금 1칸(1 cm)의 화면 크기(px) */
    unit: () => unit,
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
      stopMix();
      resizer?.disconnect();
      endGesture();
      clearTimeout(swallowTimer);
      clearTimeout(wheelTimer);
      el.removeEventListener('keydown', onKey);
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('click', onClickCapture, true);
      el.removeEventListener('click', onPickClick, true);
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
 * - el: 재단 매트 아래쪽 띠 [접어 보기 / 펴기] [접는 정도 막대] + 답하기 전의 [왼쪽으로 돌려 보기] [오른쪽으로 돌려 보기]
 * - pad: 보는 방향과 크기 조작판(.view-pad) — 무대 오른쪽 위 십자(휴대폰은 아래 띠 두 줄). 매트에 el 다음으로 붙인다.
 *   끌기·휠·키보드와 같은 일을 한다(view의 같은 함수). 돌리기에는 한계가 없고, 배율 한계(2배·0.5배)에 닿은 버튼은 disabled.
 * 답하기 전(잠긴 동안, spec 17-16): 조작판을 보이지 않고 좌우 돌리기 두 개만 아래 띠에 둔다 — V1 이전과 같은 자리·같은 막대 길이.
 *   답해서 잠금이 풀리면 조작판이 나타나고, 좌우 돌리기는 조작판의 것을 쓴다(아래 띠의 둘은 숨긴다 — 같은 이름의 버튼이 두 번 보이지 않게).
 *   휴대폰은 조작판이 아래 띠에 있어 무대를 가리지 않으므로 띠 두 줄을 늘 두고(답하는 순간 화면이 밀리지 않게), 답하기 전에는
 *   조작판의 좌우 돌리기 두 개만 보인다. 어느 쪽이 보일지는 style.css가 .is-locked로 정한다(화면 폭이 바뀌어도 따라온다).
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
  // 답한 뒤에만 보이는 다섯 개(.view-new)
  const tiltUp = padButton('위쪽으로 돌려 보기', 'view-new view-up', 'up', () => view.tiltStep(-1));
  const tiltDown = padButton('아래쪽으로 돌려 보기', 'view-new view-down', 'down', () => view.tiltStep(1));
  const zoomOut = padButton('작게 보기', 'view-new view-out', 'zoomout', () => view.zoomStep(-1));
  const zoomIn = padButton('크게 보기', 'view-new view-in', 'zoomin', () => view.zoomStep(1));
  const home = padButton('처음 보기로', 'view-new view-home', 'cube', () => view.resetView());
  // 답하기 전 아래 띠의 좌우 돌리기 (넓은 화면·태블릿). 조작판의 같은 버튼과 하는 일이 같다
  const bandLeft = padButton('왼쪽으로 돌려 보기', 'band-turn', 'rotl', () => view.rotate(-TURN_BUTTON));
  const bandRight = padButton('오른쪽으로 돌려 보기', 'band-turn', 'rotr', () => view.rotate(TURN_BUTTON));
  // 끌기 안내: 보기 조작이 처음 켜질 때 한 번 보이고, 처음 끌거나 문제가 바뀌면 지운다 (눌리지 않는 칩. 휴대폰은 자리가 없어 숨긴다)
  const tip = h('p', { class: 'view-tip', hidden: true, 'aria-hidden': 'true' }, icon('hand'), '끌어서 돌려 봐요');
  // Tab 순서: 왼쪽 · 오른쪽 · 위쪽 · 아래쪽 · 작게 · 크게 · 처음 보기로 (자리는 CSS grid-area가 정한다)
  const pad = h('div', { class: 'view-pad is-locked', role: 'group', 'aria-label': '보는 방향과 크기' },
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
    setOff(tiltUp, !s.can); // 회전에는 한계가 없어, 접힌 입체를 볼 수 있는 동안 네 방향 버튼은 늘 켜져 있다
    setOff(tiltDown, !s.can);
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
  const el = h('div', { class: 'mat-tools fold-tools is-locked' },
    foldButton,
    h('label', { class: 'fold-slider' }, h('span', { class: 'fold-slider-label' }, '접는 정도'), slider),
    bandLeft,
    bandRight,
  );

  /**
   * 잠금이 바뀌면 좌우 돌리기 버튼이 아래 띠 ↔ 조작판으로 자리를 바꾼다(휴대폰은 그대로). 사라지는 버튼에 초점이 있었으면
   * 새로 보이는 같은 이름의 버튼으로, 사라지는 조작판의 다른 버튼에 있었으면 무대로 옮긴다 — 초점을 잃지 않게
   */
  function setLocked(value) {
    const active = document.activeElement;
    const twins = [[bandLeft, turnLeft], [bandRight, turnRight]];
    el.classList.toggle('is-locked', value);
    pad.classList.toggle('is-locked', value);
    if (!active || !(el.contains(active) || pad.contains(active)) || active.getClientRects().length > 0) return;
    const pair = twins.find((x) => x.includes(active));
    const next = pair?.find((x) => x !== active && x.getClientRects().length > 0) ?? view.el;
    next.focus({ preventScroll: true });
  }

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
    /**
     * 접기(버튼·막대)와 보기 조작(끌기·위아래·크게 작게)을 함께 잠그고 푼다. 답이 기록된 뒤에만 푼다.
     * view: 보기 조작만 따로 정할 때(각기둥의 밑면 고르기 — 답하기 전에도 입체를 돌려 본다, spec-grade6 5절). 주지 않으면 접기와 같이
     */
    lock(value, { view: allowView = !value } = {}) {
      foldButton.disabled = value;
      slider.disabled = value;
      setLocked(!allowView);
      view.setViewEnabled(allowView);
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
export function createWorkbench({ ctx, view, total, hint = false, lockText = '답한 뒤에 접어 볼 수 있어요.' }) {
  const { h } = ctx;
  const tools = createFoldTools({ ctx, view });
  const order = ctx.ui.order({ kind: ctx.stage.order ?? '', label: '문제 판' });
  order.counter.classList.add('q-counter');
  const prompt = h('p', { class: 'q-prompt' });
  const answerBox = h('div', { class: 'q-answer' });

  const halfButton = hint
    ? h('button', { type: 'button', class: 'btn btn-small hint-btn', hidden: true, onclick: () => useHint() }, icon('bulb'), '반만 접어 보기')
    : null;
  const lockNote = h('p', { class: 'fold-note' }, icon('lock'), lockText);
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

  function lockFold(value, options) {
    locked = value;
    tools.lock(locked, options);
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
