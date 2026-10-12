/**
 * 쌓기나무의 규칙 (순수 함수, 화면과 무관). 기획서: docs/games/net-workshop/spec-grade6.md 6-2·6-3절
 *
 * 높이 지도 h[줄][칸] = 그 자리에 쌓인 쌓기나무의 개수 (뜬 쌓기나무는 없다 — 15절 3번).
 *   줄 0 = 앞줄, 칸 0 = 왼쪽(앞에서 볼 때). 판은 3×3칸, 3층까지.
 * 쌓기나무 하나는 칸 [x, y, z]: x = 칸(오른쪽으로), y = 줄(뒤로), z = 층(0부터 위로).
 * "옆"은 오른쪽이다: 오른쪽에서 보면 왼쪽부터 앞줄 → 뒷줄이 보인다.
 * 검사: tests/unit/net-workshop-blocks.test.js (3×3칸·3층의 높이 지도 262,144개 전부를 독립 계산과 견준다)
 */
export const COLS = 3;
export const ROWS = 3;
export const MAX_H = 3;

export const emptyMap = () => Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
export const cloneMap = (h) => h.map((row) => [...row]);
export const mapKey = (h) => h.map((row) => row.join('')).join('/');
export const sameMap = (a, b) => mapKey(a) === mapKey(b);

/** 쌓기나무의 개수 */
export const count = (h) => h.reduce((sum, row) => sum + row.reduce((s, v) => s + v, 0), 0);

/** 칸 목록 [x, y, z] */
export function cellsOf(h) {
  const cells = [];
  for (let y = 0; y < h.length; y += 1) for (let x = 0; x < h[y].length; x += 1) for (let z = 0; z < h[y][x]; z += 1) cells.push([x, y, z]);
  return cells;
}

// ── 위·앞·옆에서 본 모양 ───────────────────
/** 위에서 본 모양: 쌓인 자리(바닥에 닿은 면의 모양). [줄][칸] = 1 또는 0, 줄 0 = 앞줄 */
export const topView = (h) => h.map((row) => row.map((v) => (v > 0 ? 1 : 0)));
/** 앞에서 본 모양: 세로줄(왼쪽 → 오른쪽)마다 가장 높은 층 */
export const frontView = (h) => h[0].map((_, x) => Math.max(...h.map((row) => row[x])));
/** 옆(오른쪽)에서 본 모양: 줄(앞 → 뒤)마다 가장 높은 층 */
export const sideView = (h) => h.map((row) => Math.max(...row));
/** 좌우로 뒤집기 */
export const flipLR = (view) => [...view].reverse();
/** 뒤에서 본 모양 = 앞에서 본 모양을 좌우로 뒤집은 것 */
export const backView = (h) => flipLR(frontView(h));
/** 왼쪽에서 본 모양 = 옆에서 본 모양을 좌우로 뒤집은 것 */
export const leftView = (h) => flipLR(sideView(h));

/** k층 모양(k = 1부터): 높이가 k 이상인 자리 */
export const layerOf = (h, k) => h.map((row) => row.map((v) => (v >= k ? 1 : 0)));

/** 층별 모양들(1층부터) → 높이 지도. 아래층에 없는 자리에 위층이 있으면 오류 */
export function fromLayers(layers) {
  const h = layers[0].map((row) => row.map(() => 0));
  layers.forEach((layer, k) => layer.forEach((row, y) => row.forEach((on, x) => {
    if (!on) return;
    if (h[y][x] !== k) throw new Error(`fromLayers: ${y + 1}줄 ${x + 1}칸은 아래층이 비어 있어 ${k + 1}층에 놓을 수 없어요.`);
    h[y][x] = k + 1;
  })));
  return h;
}

/** 세 그림에 맞는가 */
export function fitsViews(h, { top, front, side }) {
  return (!top || mapKey(topView(h)) === mapKey(top))
    && (!front || frontView(h).join() === front.join())
    && (!side || sideView(h).join() === side.join());
}

/** 세 그림에 맞는 가장 많은 쌓기: 쌓인 자리마다 min(앞, 옆) */
export const maxFill = ({ top, front, side }) => top.map((row, y) => row.map((on, x) => (on ? Math.min(front[x], side[y]) : 0)));

/** 세 그림에 맞는 쌓기 전부 (없으면 빈 목록). 쌓인 자리마다 1 ~ min(앞, 옆)을 차례로 넣어 본다 */
export function fillsOf(views) {
  const most = maxFill(views);
  const spots = [];
  most.forEach((row, y) => row.forEach((v, x) => {
    if (views.top[y][x]) spots.push([x, y, v]);
  }));
  if (spots.some(([, , v]) => v < 1)) return [];
  const out = [];
  const h = most.map((row) => row.map(() => 0));
  const walk = (i) => {
    if (i === spots.length) {
      if (fitsViews(h, views)) out.push(cloneMap(h));
      return;
    }
    const [x, y, v] = spots[i];
    for (let k = 1; k <= v; k += 1) {
      h[y][x] = k;
      walk(i + 1);
    }
    h[y][x] = 0;
  };
  walk(0);
  return out;
}

/** 세 그림에 맞는 가장 적은 개수 (맞는 쌓기가 없으면 null) */
export function minCount(views) {
  const fills = fillsOf(views);
  return fills.length ? Math.min(...fills.map(count)) : null;
}

// ── 둘레 네 방향에서 본 모습 (1차시) ───────────
export const AROUND = Object.freeze(['front', 'right', 'back', 'left']);
export const OPPOSITE = Object.freeze({ front: 'back', back: 'front', right: 'left', left: 'right' });

/** 그 방향에서 볼 때 왼쪽부터 i번째 세로줄의 자리들(가까운 것부터) */
export function lineFrom(dir, i) {
  const far = [0, 1, 2];
  if (dir === 'front') return far.map((y) => [i, y]);
  if (dir === 'right') return far.map((k) => [COLS - 1 - k, i]);
  if (dir === 'back') return far.map((k) => [COLS - 1 - i, ROWS - 1 - k]);
  return far.map((x) => [x, ROWS - 1 - i]); // left
}

/**
 * 조형물이 놓인 판을 둘레 네 방향에서 본 모습: [층(0 = 1층)][왼쪽부터 세로줄] = 가장 가까운 것의 색(없으면 null).
 * color[줄][칸] = 그 자리 조형물의 색 이름
 */
export function sceneFrom(h, color, dir) {
  return Array.from({ length: MAX_H }, (_, z) => Array.from({ length: COLS }, (_, i) => {
    const hit = lineFrom(dir, i).find(([x, y]) => h[y][x] > z);
    return hit ? color[hit[1]][hit[0]] : null;
  }));
}
export const sceneKey = (scene) => scene.map((row) => row.map((c) => c ?? '-').join(',')).join('/');

// ── 그림(교과서 방향의 멈춘 입체 그림)에서 보이는 것 ──────────
// 그림은 원근 없이, 앞·오른쪽·위가 같은 비율로 보이는 방향(눈이 앞·오른쪽·위에 있다: 보는 사람 쪽 = (1, −1, 1))에서 그린다.
// 그 방향에서는 점 (x, y, z)가 모눈 (a, b) = (x + y, z − x)에 놓이고, 보이는 세 면(위·앞·오른쪽)은 저마다 삼각 조각 둘로 나뉜다.
// 조각 하나는 다 보이거나 다 가려지거나 둘 중 하나라서, 그림은 "조각의 자리 + 면 방향" 목록으로 정확히 적힌다.
// 조각의 자리 = 세 꼭짓점의 (a, b) 합(= 무게중심 × 3, 정수), 깊이 = 세 꼭짓점의 (x − y + z) 합(클수록 눈에 가깝다)
const TRIANGLES = [
  ['t', [[0, 0, 1], [1, 0, 1], [0, 1, 1]]], ['t', [[1, 0, 1], [1, 1, 1], [0, 1, 1]]],
  ['f', [[0, 0, 0], [1, 0, 0], [1, 0, 1]]], ['f', [[0, 0, 0], [1, 0, 1], [0, 0, 1]]],
  ['r', [[1, 0, 0], [1, 1, 0], [1, 0, 1]]], ['r', [[1, 1, 0], [1, 1, 1], [1, 0, 1]]],
];
const FACE_CODE = { t: 1, f: 2, r: 3 };
const FACE_NAME = ['', 'top', 'front', 'right'];
const PIECES = TRIANGLES.map(([face, pts]) => ({
  face: FACE_CODE[face],
  a: pts.reduce((s, [x, y]) => s + x + y, 0),
  b: pts.reduce((s, [x, , z]) => s + z - x, 0),
  d: pts.reduce((s, [x, y, z]) => s + x - y + z, 0),
}));
// 3×3칸·3층: 조각의 a 합은 1~17, b 합은 −8~8
const A_SPAN = 18;
const B_MIN = -8;
const B_SPAN = 17;
const SLOTS = A_SPAN * B_SPAN;

/** 모눈 조각마다 가장 가까운 면: { face(0 없음 · 1 위 · 2 앞 · 3 오른쪽), owner(쌓기나무 번호 x + 3y + 9z, 없으면 −1) } */
function pieceTable(h) {
  const depth = new Int16Array(SLOTS).fill(-999);
  const face = new Uint8Array(SLOTS);
  const owner = new Int8Array(SLOTS).fill(-1);
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      for (let z = 0; z < h[y][x]; z += 1) {
        const a0 = 3 * (x + y);
        const b0 = 3 * (z - x) - B_MIN;
        const d0 = 3 * (x - y + z);
        for (const p of PIECES) {
          const slot = (a0 + p.a) * B_SPAN + b0 + p.b;
          if (d0 + p.d > depth[slot]) {
            depth[slot] = d0 + p.d;
            face[slot] = p.face;
            owner[slot] = x + 3 * y + 9 * z;
          }
        }
      }
    }
  }
  return { face, owner };
}

const CODE_BUFFER = new Uint8Array(SLOTS);
const faceString = (face) => {
  for (let i = 0; i < SLOTS; i += 1) CODE_BUFFER[i] = 48 + face[i];
  return String.fromCharCode.apply(null, CODE_BUFFER);
};

/** 그림의 열쇠: 판 위의 자리까지 같은 두 쌓기만 열쇠가 같다 */
export const pictureKey = (h) => faceString(pieceTable(h).face);

/** 그림의 열쇠(자리는 빼고 모양만): 판 위에서 통째로 옮긴 쌓기는 열쇠가 같다 */
export function lookKey(h) {
  const { face } = pieceTable(h);
  let minA = Infinity;
  let minB = Infinity;
  for (let i = 0; i < SLOTS; i += 1) {
    if (!face[i]) continue;
    minA = Math.min(minA, Math.floor(i / B_SPAN));
    minB = Math.min(minB, i % B_SPAN);
  }
  if (minA === Infinity) return '';
  // 판 위에서 한 칸 옮기면 조각의 자리는 3의 배수만큼 옮겨진다
  const shiftA = 3 * Math.floor(minA / 3);
  const shiftB = 3 * Math.floor(minB / 3);
  const moved = new Uint8Array(SLOTS);
  for (let i = 0; i < SLOTS; i += 1) {
    if (face[i]) moved[(Math.floor(i / B_SPAN) - shiftA) * B_SPAN + (i % B_SPAN) - shiftB] = face[i];
  }
  return faceString(moved);
}

/** 두 쌓기가 그림에서 같아 보이는가 (판 위에서 통째로 옮긴 것은 같다고 본다) */
export const sameLook = (a, b) => lookKey(a) === lookKey(b);

/**
 * 두 쌓기의 그림에서 서로 다른 곳 (어디가 다른지 보여 줄 때).
 * 그림을 통째로 옮겨 가장 많이 겹치는 자리에 맞춘 뒤 견준다.
 * → { extra: mine의 면 가운데 target의 그림에 없는 것, missing: target의 면 가운데 mine의 그림에 없는 것 } (면 = { x, y, z, face })
 */
export function lookDiff(mine, target) {
  const a = pieceTable(mine);
  const b = pieceTable(target);
  let best = null;
  for (let sa = -5; sa <= 5; sa += 1) {
    for (let sb = -5; sb <= 5; sb += 1) {
      let matched = 0;
      for (let i = 0; i < SLOTS; i += 1) {
        if (!a.face[i]) continue;
        const ia = Math.floor(i / B_SPAN) - 3 * sa;
        const ib = (i % B_SPAN) - 3 * sb;
        if (ia >= 0 && ia < A_SPAN && ib >= 0 && ib < B_SPAN && b.face[ia * B_SPAN + ib] === a.face[i]) matched += 1;
      }
      const far = Math.abs(sa) + Math.abs(sb);
      if (!best || matched > best.matched || (matched === best.matched && far < best.far)) best = { sa, sb, matched, far };
    }
  }
  const faceOf = (table, i) => {
    const cube = table.owner[i];
    return { x: cube % 3, y: Math.floor(cube / 3) % 3, z: Math.floor(cube / 9), face: FACE_NAME[table.face[i]] };
  };
  const pick = (from, to, sign) => {
    const out = new Map();
    for (let i = 0; i < SLOTS; i += 1) {
      if (!from.face[i]) continue;
      const ia = Math.floor(i / B_SPAN) - sign * 3 * best.sa;
      const ib = (i % B_SPAN) - sign * 3 * best.sb;
      const same = ia >= 0 && ia < A_SPAN && ib >= 0 && ib < B_SPAN && to.face[ia * B_SPAN + ib] === from.face[i];
      if (!same) {
        const f = faceOf(from, i);
        out.set(`${f.x},${f.y},${f.z},${f.face}`, f);
      }
    }
    return [...out.values()];
  };
  return { extra: pick(a, b, 1), missing: pick(b, a, -1) };
}

/** 그림에서 한 조각이라도 보이는 면들: [{ x, y, z, face: 'top' | 'front' | 'right' }] (멈춘 그림에는 이 면들만 그린다) */
export function picturedFaces(h) {
  const { face, owner } = pieceTable(h);
  const seen = new Set();
  for (let i = 0; i < SLOTS; i += 1) if (face[i]) seen.add(owner[i] * 4 + face[i]);
  return [...seen].sort((p, q) => p - q).map((code) => {
    const cube = Math.floor(code / 4);
    return { x: cube % 3, y: Math.floor(cube / 3) % 3, z: Math.floor(cube / 9), face: FACE_NAME[code % 4] };
  });
}

/** 그림에서 한 면도 보이지 않는 쌓기나무 [x, y, z] */
export function hiddenCells(h) {
  const { owner } = pieceTable(h);
  const seen = new Set(owner);
  return cellsOf(h).filter(([x, y, z]) => !seen.has(x + 3 * y + 9 * z));
}

/** 자리마다 맨 위 쌓기나무의 윗면이 그림에 조금이라도 보이는가 (모든 자리가 보이는 쌓기) */
export function allTopsPictured(h) {
  const tops = new Set(picturedFaces(h).filter((f) => f.face === 'top').map((f) => `${f.x},${f.y},${f.z}`));
  return h.every((row, y) => row.every((v, x) => v === 0 || tops.has(`${x},${y},${v - 1}`)));
}

/**
 * 그림이 같은 쌓기 전부(판 위의 자리까지 같은 것). top을 주면 위에서 본 모양도 같은 것만.
 * top이 없으면 쌓인 자리가 달라도 되므로 모든 높이 지도를 살핀다(느리다 — 검사·문제 만들기의 작은 표본에만 쓴다).
 */
export function lookAlikes(h, { top = null } = {}) {
  const key = pictureKey(h);
  const spots = [];
  for (let y = 0; y < ROWS; y += 1) for (let x = 0; x < COLS; x += 1) if (!top || top[y][x]) spots.push([x, y]);
  const low = top ? 1 : 0;
  const out = [];
  const g = emptyMap();
  const walk = (i) => {
    if (i === spots.length) {
      if (pictureKey(g) === key) out.push(cloneMap(g));
      return;
    }
    const [x, y] = spots[i];
    for (let v = low; v <= MAX_H; v += 1) {
      g[y][x] = v;
      walk(i + 1);
    }
    g[y][x] = 0;
  };
  walk(0);
  return out;
}

/** 쌓기나무를 한 자리에만 더 올려서(새 자리 포함) 그림이 그대로인 쌓기들 — 그림만으로는 개수가 정해지지 않는다는 증거 */
export function hiddenAdds(h, { top = null } = {}) {
  const key = pictureKey(h);
  const out = [];
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (top && !top[y][x]) continue;
      for (let v = h[y][x] + 1; v <= MAX_H; v += 1) {
        const g = cloneMap(h);
        g[y][x] = v;
        if (pictureKey(g) === key) out.push(g);
      }
    }
  }
  return out;
}

// ── 판 위에서 옮기기 ─────────────────────
/** 쌓인 자리가 판의 왼쪽 앞 구석에 닿게 통째로 옮긴 높이 지도 */
export function toCorner(h) {
  let minX = COLS;
  let minY = ROWS;
  h.forEach((row, y) => row.forEach((v, x) => {
    if (v > 0) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
    }
  }));
  if (minX === COLS) return emptyMap();
  const out = emptyMap();
  h.forEach((row, y) => row.forEach((v, x) => {
    if (v > 0) out[y - minY][x - minX] = v;
  }));
  return out;
}

/** 쌓인 자리가 서로 이어져 있는가(변끼리) */
export function isConnectedTop(h) {
  const spots = [];
  h.forEach((row, y) => row.forEach((v, x) => {
    if (v > 0) spots.push([x, y]);
  }));
  if (spots.length === 0) return false;
  const seen = new Set([`${spots[0][0]},${spots[0][1]}`]);
  const queue = [spots[0]];
  while (queue.length) {
    const [x, y] = queue.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (h[ny]?.[nx] > 0 && !seen.has(`${nx},${ny}`)) {
        seen.add(`${nx},${ny}`);
        queue.push([nx, ny]);
      }
    }
  }
  return seen.size === spots.length;
}

// ── 놓기·빼기 ────────────────────────────
/** 면의 바깥쪽 방향 [dx, dy] (옆면만) */
const SIDE_STEP = { front: [0, -1], back: [0, 1], left: [-1, 0], right: [1, 0] };
const inBoard = (h, x, y) => y >= 0 && y < h.length && x >= 0 && x < h[y].length;

/**
 * 누른 곳 → 바뀌는 자리.
 * hit: { kind: 'tile', x, y }(판의 자리) 또는 { kind: 'face', x, y, z, face: 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right' }
 * mode: 'add'(쌓기) · 'remove'(빼기)
 * → { x, y, z }(놓일 칸 또는 빠질 칸) 또는 { error: 'full'(3층이 참) | 'outside'(판 밖) | 'empty'(뺄 것이 없음), x, y }
 *   쌓기: 판의 자리·윗면·아랫면은 그 자리의 맨 위에, 옆면은 그 면 쪽 이웃 자리의 맨 위에(아래로 내려앉는다)
 *   빼기: 어느 면을 누르든 그 자리의 맨 위 쌓기나무
 */
export function targetOf(h, hit, mode = 'add') {
  let { x, y } = hit;
  if (mode === 'remove') {
    if (!inBoard(h, x, y) || h[y][x] === 0) return { error: 'empty', x, y };
    return { x, y, z: h[y][x] - 1 };
  }
  const step = hit.kind === 'face' ? SIDE_STEP[hit.face] : null;
  if (step) {
    x += step[0];
    y += step[1];
  }
  if (!inBoard(h, x, y)) return { error: 'outside', x, y };
  if (h[y][x] >= MAX_H) return { error: 'full', x, y };
  return { x, y, z: h[y][x] };
}

/** 그 자리의 맨 위에 하나 놓은 새 높이 지도 (못 놓으면 null) */
export function place(h, { x, y }) {
  if (!inBoard(h, x, y) || h[y][x] >= MAX_H) return null;
  const out = cloneMap(h);
  out[y][x] += 1;
  return out;
}

/** 그 자리의 맨 위 하나를 뺀 새 높이 지도 (뺄 것이 없으면 null) */
export function remove(h, { x, y }) {
  if (!inBoard(h, x, y) || h[y][x] <= 0) return null;
  const out = cloneMap(h);
  out[y][x] -= 1;
  return out;
}

/** 그 자리를 그 높이로 맞춘 새 높이 지도 (숫자 키 0~3) */
export function setHeight(h, { x, y }, value) {
  if (!inBoard(h, x, y) || !Number.isInteger(value) || value < 0 || value > MAX_H) return null;
  const out = cloneMap(h);
  out[y][x] = value;
  return out;
}

// ── 그리는 순서 · 보이는 면 (block-view.js가 쓴다) ──────────
export const FACE_NORMALS = Object.freeze({
  top: [0, 0, 1], bottom: [0, 0, -1], front: [0, -1, 0], back: [0, 1, 0], left: [-1, 0, 0], right: [1, 0, 0],
});
const FACE_NAMES = Object.keys(FACE_NORMALS);

/**
 * 그리는 순서: 눈에서 먼 칸부터. toViewer = 보는 사람 쪽 방향(모델 좌표, 원근 없음).
 * 축마다 눈에서 먼 쪽부터 차례로 그리면(층 → 줄 → 칸) 뒤에 그린 것이 앞에 그린 것에 가려지는 일이 없다.
 * 층별로 벌려 놓아도(층 사이가 뜬다) 층을 맨 바깥 차례로 두었으므로 그대로 맞다.
 */
export function paintOrder(cells, toViewer) {
  const s = toViewer.map((v) => (v < 0 ? -1 : 1));
  return [...cells].sort((p, q) => s[2] * (p[2] - q[2]) || s[1] * (p[1] - q[1]) || s[0] * (p[0] - q[0]));
}

/**
 * 그릴 면: 보는 사람 쪽을 향하고(법선 · toViewer > 0), 이웃 쌓기나무에 맞닿아 있지 않은 면. 그리는 순서대로 돌려준다.
 * apart(층별로 벌려 놓음)이면 윗면·아랫면은 늘 드러나 있다.
 * → [{ x, y, z, face }]
 */
export function visibleFaces(h, toViewer, { apart = false } = {}) {
  const filled = (x, y, z) => inBoard(h, x, y) && z >= 0 && z < h[y][x];
  const facing = FACE_NAMES.filter((name) => {
    const n = FACE_NORMALS[name];
    return n[0] * toViewer[0] + n[1] * toViewer[1] + n[2] * toViewer[2] > 1e-6;
  });
  const out = [];
  for (const [x, y, z] of paintOrder(cellsOf(h), toViewer)) {
    for (const face of facing) {
      const n = FACE_NORMALS[face];
      if (apart && n[2] !== 0) out.push({ x, y, z, face });
      else if (!filled(x + n[0], y + n[1], z + n[2])) out.push({ x, y, z, face });
    }
  }
  return out;
}
