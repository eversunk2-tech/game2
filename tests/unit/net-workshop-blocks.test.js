/**
 * 쌓기나무 규칙(blocks.js)과 그리기 도형(block-view.js의 순수 부분) 검사.
 * 판정은 저장소의 함수를 쓰지 않고 기획서(spec-grade6.md 6-3·6-4절)의 문장만 보고 짠 독립 계산과
 * 3×3칸·3층의 높이 지도 262,144개 전부에서 견준다(위·앞·옆·층·개수, 그림에서 보이는 조각, 같아 보이는 쌓기, 하나로 정해지는가).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRng } from '../../src/shared/core/random.js';
import {
  AROUND,
  FACE_NORMALS,
  MAX_H,
  OPPOSITE,
  allTopsPictured,
  backView,
  cellsOf,
  cloneMap,
  count,
  emptyMap,
  fillsOf,
  fitsViews,
  flipLR,
  fromLayers,
  frontView,
  hiddenAdds,
  hiddenCells,
  isConnectedTop,
  layerOf,
  leftView,
  lookAlikes,
  lookDiff,
  lookKey,
  mapKey,
  maxFill,
  minCount,
  paintOrder,
  pictureKey,
  picturedFaces,
  place,
  remove,
  sameLook,
  sameMap,
  sceneFrom,
  sceneKey,
  setHeight,
  sideView,
  targetOf,
  toCorner,
  topView,
  visibleFaces,
} from '../../src/games/net-workshop/blocks/blocks.js';
import {
  APART_GAP,
  POSES,
  depthOf,
  poseOfRoll,
  poseWord,
  projectPoint,
  rollTo,
  sceneShapes,
  toViewerOf,
  unitFor,
} from '../../src/games/net-workshop/blocks/block-view.js';
import { dragView, homeView, stepView } from '../../src/games/net-workshop/orbit.js';

// ── 모든 높이 지도 (4^9 = 262,144) ────────────────
const ALL = [];
for (let n = 0; n < 4 ** 9; n += 1) {
  const h = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  let v = n;
  for (let i = 0; i < 9; i += 1) {
    h[Math.floor(i / 3)][i % 3] = v & 3;
    v >>= 2;
  }
  ALL.push(h);
}
const indexOf = (h) => {
  let n = 0;
  for (let i = 8; i >= 0; i -= 1) n = (n << 2) | h[Math.floor(i / 3)][i % 3];
  return n;
};

// ── 독립 계산: 칸의 집합에서 ──────────────────
/** 높이 지도 → 칸의 집합(쌓기나무가 있는 [x][y][z]) */
function voxels(h) {
  const v = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => [false, false, false]));
  for (let y = 0; y < 3; y += 1) for (let x = 0; x < 3; x += 1) for (let z = 0; z < h[y][x]; z += 1) v[x][y][z] = true;
  return v;
}
const range = [0, 1, 2];
const indepTop = (v) => range.map((y) => range.map((x) => (range.some((z) => v[x][y][z]) ? 1 : 0)));
/** 앞에서: 세로줄 x마다, 어느 줄에든 쌓기나무가 있는 가장 높은 층 */
const indepFront = (v) => range.map((x) => Math.max(0, ...range.flatMap((y) => range.filter((z) => v[x][y][z]).map((z) => z + 1))));
/** 옆(오른쪽)에서: 왼쪽부터 앞줄 → 뒷줄 */
const indepSide = (v) => range.map((y) => Math.max(0, ...range.flatMap((x) => range.filter((z) => v[x][y][z]).map((z) => z + 1))));
const indepCount = (v) => v.flat(2).filter(Boolean).length;

/**
 * 독립 계산(그림): 교과서 방향(눈이 앞·오른쪽·위 = (1, −1, 1) 쪽)에서, 면 조각(삼각형)마다 무게중심에서 눈 쪽으로 광선을 쏘아
 * 다른 쌓기나무에 막히는지 본다. → { key(보이는 조각의 화면 자리와 면 방향), hidden(한 조각도 안 보이는 쌓기나무), faces(보이는 면) }
 */
const TRI = {
  top: [[[0, 0, 1], [1, 0, 1], [0, 1, 1]], [[1, 0, 1], [1, 1, 1], [0, 1, 1]]],
  front: [[[0, 0, 0], [1, 0, 0], [1, 0, 1]], [[0, 0, 0], [1, 0, 1], [0, 0, 1]]],
  right: [[[1, 0, 0], [1, 1, 0], [1, 0, 1]], [[1, 1, 0], [1, 1, 1], [1, 0, 1]]],
};
function rayPicture(h, { list = false } = {}) {
  const pieces = [];
  const hidden = [];
  const faces = [];
  for (let y = 0; y < 3; y += 1) {
    for (let x = 0; x < 3; x += 1) {
      for (let z = 0; z < h[y][x]; z += 1) {
        let any = false;
        for (const face of ['top', 'front', 'right']) {
          let seen = false;
          for (const tri of TRI[face]) {
            const cx = x + (tri[0][0] + tri[1][0] + tri[2][0]) / 3;
            const cy = y + (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
            const cz = z + (tri[0][2] + tri[1][2] + tri[2][2]) / 3;
            let blocked = false;
            // 광선은 칸의 경계를 t가 1/3의 배수일 때만 지난다 → 그 사이(1/6 + k/3)에서 어느 칸 안에 있는지 본다
            for (let k = 0; k < 10 && !blocked; k += 1) {
              const t = 1 / 6 + k / 3;
              const px = Math.floor(cx + t);
              const py = Math.floor(cy - t);
              const pz = Math.floor(cz + t);
              if (px >= 0 && px <= 2 && py >= 0 && py <= 2 && pz >= 0 && pz <= 2 && pz < h[py][px]) blocked = true;
            }
            if (!blocked) {
              seen = true;
              // 화면 자리: 눈 방향으로 눌러 보면 (x, y, z) → (x + y, z − x). 무게중심의 3배를 적는다
              pieces.push(`${Math.round(3 * (cx + cy))},${Math.round(3 * (cz - cx))}${face[0]}`);
            }
          }
          if (seen) {
            any = true;
            if (list) faces.push(`${x},${y},${z},${face}`);
          }
        }
        if (!any) hidden.push([x, y, z]);
      }
    }
  }
  return { key: pieces.sort().join(' '), pieces, hidden, faces };
}

/** 독립 계산(자리는 빼고 모양만): 조각의 자리를 가장 왼쪽·아래가 0~2가 되게 3칸씩 옮긴다 */
function rayLook(pieces) {
  if (pieces.length === 0) return '';
  const parsed = pieces.map((p) => {
    const m = p.match(/^(-?\d+),(-?\d+)(\w)$/);
    return [Number(m[1]), Number(m[2]), m[3]];
  });
  const minA = 3 * Math.floor(Math.min(...parsed.map((p) => p[0])) / 3);
  const minB = 3 * Math.floor(Math.min(...parsed.map((p) => p[1])) / 3);
  return parsed.map(([a, b, f]) => `${a - minA},${b - minB}${f}`).sort().join(' ');
}

// 한 번 계산해 여러 검사가 함께 쓴다
const COUNT = ALL.map(count);
const PIC = ALL.map(pictureKey);
const RAY = ALL.map((h) => rayPicture(h));
const groupBy = (keys) => {
  const groups = new Map();
  keys.forEach((k, i) => {
    const list = groups.get(k);
    if (list) list.push(i);
    else groups.set(k, [i]);
  });
  return groups;
};
const TOP_KEY = ALL.map((h) => mapKey(topView(h)));
const BY_PIC = groupBy(PIC);
const BY_PIC_TOP = groupBy(PIC.map((k, i) => `${k}|${TOP_KEY[i]}`));
const BY_VIEWS = groupBy(ALL.map((h, i) => `${TOP_KEY[i]}|${frontView(h).join('')}|${sideView(h).join('')}`));

test('위·앞·옆·뒤·왼쪽·층·개수: 높이 지도 262,144개 전부에서 칸의 집합으로 따로 계산한 값과 같다', () => {
  for (const h of ALL) {
    const v = voxels(h);
    assert.equal(count(h), indepCount(v));
    assert.deepEqual(topView(h), indepTop(v));
    const front = indepFront(v);
    const side = indepSide(v);
    assert.deepEqual(frontView(h), front);
    assert.deepEqual(sideView(h), side);
    // 뒤 = 앞을 좌우로 뒤집은 것, 왼쪽 = 옆을 좌우로 뒤집은 것
    assert.deepEqual(backView(h), [front[2], front[1], front[0]]);
    assert.deepEqual(leftView(h), [side[2], side[1], side[0]]);
  }
  // 칸 목록과 층 모양 (표본)
  for (let i = 0; i < ALL.length; i += 37) {
    const h = ALL[i];
    const v = voxels(h);
    const cells = cellsOf(h);
    assert.equal(cells.length, COUNT[i]);
    for (const [x, y, z] of cells) assert.ok(v[x][y][z]);
    for (let k = 1; k <= MAX_H; k += 1) assert.deepEqual(layerOf(h, k), range.map((y) => range.map((x) => (v[x][y][k - 1] ? 1 : 0))));
    assert.deepEqual(fromLayers([1, 2, 3].map((k) => layerOf(h, k))), h);
  }
  assert.deepEqual(flipLR([1, 2, 3]), [3, 2, 1]);
});

test('층별 모양: 아래층이 빈 자리에 위층이 있으면 오류', () => {
  const one = [[1, 1, 0], [0, 0, 0], [0, 0, 0]];
  assert.deepEqual(fromLayers([one, [[1, 0, 0], [0, 0, 0], [0, 0, 0]], [[0, 0, 0], [0, 0, 0], [0, 0, 0]]]), [[2, 1, 0], [0, 0, 0], [0, 0, 0]]);
  assert.throws(() => fromLayers([one, [[0, 0, 1], [0, 0, 0], [0, 0, 0]], emptyMap()]), /아래층/);
  assert.throws(() => fromLayers([one, emptyMap(), [[1, 0, 0], [0, 0, 0], [0, 0, 0]]]), /아래층/);
});

test('그림(교과서 방향): 보이는 조각·숨겨진 쌓기나무·그림에 그릴 면이 광선으로 따로 계산한 값과 전부 같다', () => {
  // 그림 열쇠가 같은 묶음 = 광선 계산의 보이는 조각 목록이 같은 묶음 (양쪽으로 1:1)
  const toRay = new Map();
  const toPic = new Map();
  for (let i = 0; i < ALL.length; i += 1) {
    const ray = RAY[i].key;
    const pic = PIC[i];
    if (!toRay.has(pic)) toRay.set(pic, ray);
    if (!toPic.has(ray)) toPic.set(ray, pic);
    assert.equal(toRay.get(pic), ray, mapKey(ALL[i]));
    assert.equal(toPic.get(ray), pic, mapKey(ALL[i]));
    assert.deepEqual(hiddenCells(ALL[i]), RAY[i].hidden, mapKey(ALL[i]));
  }
  assert.equal(toRay.size, 85752); // 서로 다른 그림의 수
  // 그림에 그릴 면(한 조각이라도 보이는 면) — 표본 2,000개
  for (let i = 0; i < ALL.length; i += 131) {
    const faces = picturedFaces(ALL[i]).map((f) => `${f.x},${f.y},${f.z},${f.face}`).sort();
    assert.deepEqual(faces, rayPicture(ALL[i], { list: true }).faces.sort(), mapKey(ALL[i]));
  }
});

test('같아 보이는가(sameLook): 판 위에서 통째로 옮긴 것은 같고, 묶음이 따로 계산한 값과 전부 같다', () => {
  const toRay = new Map();
  const toLook = new Map();
  for (let i = 0; i < ALL.length; i += 1) {
    const look = lookKey(ALL[i]);
    const ray = rayLook(RAY[i].pieces);
    if (!toRay.has(look)) toRay.set(look, ray);
    if (!toLook.has(ray)) toLook.set(ray, look);
    assert.equal(toRay.get(look), ray, mapKey(ALL[i]));
    assert.equal(toLook.get(ray), look, mapKey(ALL[i]));
  }
  // 통째로 옮기기: 구석에 붙인 것과 같아 보인다 (표본)
  for (let i = 1; i < ALL.length; i += 53) {
    assert.ok(sameLook(ALL[i], toCorner(ALL[i])), mapKey(ALL[i]));
    assert.equal(count(toCorner(ALL[i])), COUNT[i]);
  }
  assert.ok(sameLook([[0, 2, 1], [0, 0, 0], [0, 0, 0]], [[0, 0, 0], [2, 1, 0], [0, 0, 0]]));
  assert.ok(!sameLook([[2, 1, 0], [0, 0, 0], [0, 0, 0]], [[1, 2, 0], [0, 0, 0], [0, 0, 0]]));
  // 뒤에 숨긴 쌓기나무는 그림을 바꾸지 않는다: 3층 탑(1, 0)의 왼쪽 뒤(0, 1)에 1층
  assert.ok(sameLook([[0, 3, 1], [0, 0, 0], [0, 0, 0]], [[0, 3, 1], [1, 0, 0], [0, 0, 0]]));
  assert.equal(lookKey(emptyMap()), '');
});

test('문제 후보의 수: 바닥이 이어지고 5~12개인 모양 56,478개 — 기획서 6-4절 표의 값과 같다', () => {
  let total = 0;
  let noHidden = 0;
  let pictureOpen = 0;
  let fixed = 0;
  let many = 0;
  const kinds = { 2: 0, 3: 0, more: 0 };
  let viewsFixed = 0;
  let viewsMany = 0;
  ALL.forEach((h, i) => {
    if (COUNT[i] < 5 || COUNT[i] > 12 || !isConnectedTop(h)) return;
    total += 1;
    if (RAY[i].hidden.length === 0) noHidden += 1;
    if (new Set(BY_PIC.get(PIC[i]).map((j) => COUNT[j])).size > 1) pictureOpen += 1;
    const alike = BY_PIC_TOP.get(`${PIC[i]}|${TOP_KEY[i]}`);
    const counts = new Set(alike.map((j) => COUNT[j])).size;
    if (alike.length === 1) fixed += 1;
    else many += 1;
    // 쌓기가 여럿이면 개수도 여럿이다(같은 그림의 두 쌓기를 자리마다 큰 쪽으로 합쳐도 같은 그림이라 더 많은 쌓기가 있다)
    assert.equal(alike.length > 1, counts > 1, mapKey(h));
    if (counts === 2) kinds[2] += 1;
    else if (counts === 3) kinds[3] += 1;
    else if (counts > 3) kinds.more += 1;
    const views = BY_VIEWS.get(`${TOP_KEY[i]}|${frontView(h).join('')}|${sideView(h).join('')}`);
    if (views.length === 1) viewsFixed += 1;
    else viewsMany += 1;
  });
  assert.deepEqual(
    { total, noHidden, pictureOpen, fixed, many, kinds, viewsFixed, viewsMany },
    { total: 56478, noHidden: 4774, pictureOpen: 46283, fixed: 39041, many: 17437, kinds: { 2: 14662, 3: 2337, more: 438 }, viewsFixed: 12636, viewsMany: 43842 },
  );
});

test('lookAlikes·hiddenAdds·allTopsPictured: 전부 나열한 묶음과 같다 (표본 600개)', () => {
  const rng = createRng('alikes');
  for (let n = 0; n < 600; n += 1) {
    const i = rng.int(1, ALL.length - 1);
    const h = ALL[i];
    const expected = BY_PIC_TOP.get(`${PIC[i]}|${TOP_KEY[i]}`).map((j) => mapKey(ALL[j])).sort();
    assert.deepEqual(lookAlikes(h, { top: topView(h) }).map(mapKey).sort(), expected, mapKey(h));
    // 한 자리만 올린 것: 그림이 같은 묶음 가운데 한 자리만 더 높은 것들
    const oneUp = BY_PIC.get(PIC[i]).filter((j) => {
      const g = ALL[j];
      let diff = 0;
      let up = true;
      for (let y = 0; y < 3; y += 1) for (let x = 0; x < 3; x += 1) if (g[y][x] !== h[y][x]) {
        diff += 1;
        if (g[y][x] < h[y][x]) up = false;
      }
      return diff === 1 && up;
    }).map((j) => mapKey(ALL[j])).sort();
    assert.deepEqual(hiddenAdds(h).map(mapKey).sort(), oneUp, mapKey(h));
    // 자리마다 맨 위 쌓기나무의 윗면이 보이는가
    const tops = new Set(rayPicture(h, { list: true }).faces.filter((f) => f.endsWith('top')));
    const all = h.every((row, y) => row.every((v, x) => v === 0 || tops.has(`${x},${y},${v - 1},top`)));
    assert.equal(allTopsPictured(h), all, mapKey(h));
  }
  // 위에서 본 모양 없이(그림만): 작은 예 — 3층 탑 옆에 1층, 뒤에 숨길 수 있다
  const tower = [[0, 3, 1], [0, 0, 0], [0, 0, 0]];
  assert.deepEqual(lookAlikes(tower).map(mapKey).sort(), BY_PIC.get(pictureKey(tower)).map((j) => mapKey(ALL[j])).sort());
});

test('위·앞·옆에 맞는 쌓기: maxFill = 자리마다 min(앞, 옆), minCount·fillsOf가 전부 나열한 값과 같다 (세 그림이 같은 52,612묶음 모두)', () => {
  // 높이 지도 262,144개는 세 그림(위·앞·옆)이 같은 것끼리 52,612묶음으로 나뉜다. 문제 후보(바닥이 이어지고 5~12개)가 들어 있는 묶음은 24,812개.
  // (기획서 6-4절의 "24,552묶음"은 시제품이 없어져 어떤 범위였는지 다시 내지 못했다 — 여기서는 더 넓은 전체 묶음에서 확인한다)
  const withCandidate = new Set();
  ALL.forEach((h, i) => {
    if (COUNT[i] >= 5 && COUNT[i] <= 12 && isConnectedTop(h)) withCandidate.add(`${TOP_KEY[i]}|${frontView(h).join('')}|${sideView(h).join('')}`);
  });
  assert.deepEqual([BY_VIEWS.size, withCandidate.size], [52612, 24812]);
  let checked = 0;
  for (const [, list] of BY_VIEWS) {
    const h = ALL[list[0]];
    const views = { top: topView(h), front: frontView(h), side: sideView(h) };
    // 세 그림에 맞는 가장 많은 쌓기 = 묶음에서 개수가 가장 많은 것 (모든 묶음)
    const most = list.reduce((best, j) => (COUNT[j] > COUNT[best] ? j : best), list[0]);
    assert.deepEqual(maxFill(views), ALL[most]);
    for (const j of list) assert.ok(fitsViews(ALL[j], views));
    // 가장 적은 개수와 맞는 쌓기 전부 (묶음 4개마다 하나)
    checked += 1;
    if (checked % 4 !== 0) continue;
    assert.equal(minCount(views), Math.min(...list.map((j) => COUNT[j])));
    assert.deepEqual(fillsOf(views).map(mapKey).sort(), list.map((j) => mapKey(ALL[j])).sort());
  }
  // 맞는 쌓기가 없는 그림
  assert.equal(minCount({ top: [[1, 0, 0], [0, 0, 0], [0, 0, 0]], front: [0, 2, 0], side: [1, 0, 0] }), null);
  assert.ok(!fitsViews([[1, 0, 0], [0, 0, 0], [0, 0, 0]], { top: [[1, 0, 0], [0, 0, 0], [0, 0, 0]], front: [2, 0, 0], side: [1, 0, 0] }));
});

test('둘레 네 방향에서 본 모습: 가까운 것이 먼 것을 가리고, 맞은편끼리는 좌우로 뒤집힌 사이다(가린 것만 다르다)', () => {
  const rng = createRng('scene');
  const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
  for (let n = 0; n < 400; n += 1) {
    const h = ALL[rng.int(1, ALL.length - 1)];
    const color = h.map((row, y) => row.map((v, x) => (v > 0 ? names[y * 3 + x] : null)));
    const v = voxels(h);
    for (const dir of AROUND) {
      const scene = sceneFrom(h, color, dir);
      for (let z = 0; z < 3; z += 1) {
        for (let i = 0; i < 3; i += 1) {
          // 독립 계산: 그 방향의 세로줄 i를 가까운 쪽부터 훑어 층 z에 쌓기나무가 있는 첫 자리
          let hit = null;
          for (let k = 0; k < 3 && !hit; k += 1) {
            const [x, y] = dir === 'front' ? [i, k] : dir === 'back' ? [2 - i, 2 - k] : dir === 'right' ? [2 - k, i] : [k, 2 - i];
            if (v[x][y][z]) hit = names[y * 3 + x];
          }
          assert.equal(scene[z][i], hit, `${mapKey(h)} ${dir} ${z} ${i}`);
        }
      }
      // 맞은편: 보이는 칸(있다·없다)은 좌우로 뒤집은 것과 같다
      const across = sceneFrom(h, color, OPPOSITE[dir]);
      assert.deepEqual(scene.map((row) => row.map(Boolean)), across.map((row) => flipLR(row).map(Boolean)));
    }
    // 실루엣은 앞·옆에서 본 모양과 같다
    const heights = (scene) => range.map((i) => range.filter((z) => scene[z][i]).length);
    assert.deepEqual(heights(sceneFrom(h, color, 'front')), frontView(h));
    assert.deepEqual(heights(sceneFrom(h, color, 'right')), sideView(h));
    assert.deepEqual(heights(sceneFrom(h, color, 'back')), backView(h));
    assert.deepEqual(heights(sceneFrom(h, color, 'left')), leftView(h));
  }
  assert.equal(sceneKey([[null, 'a', null], [null, null, null], [null, null, null]]), '-,a,-/-,-,-/-,-,-');
});

test('놓기·빼기: 윗면·옆면·아랫면·판의 자리·판 밖·3층, 뜬 쌓기나무는 없고(아래로 내려앉는다) 되돌리면 처음과 같다', () => {
  const h = [[2, 0, 0], [3, 1, 0], [0, 0, 0]];
  // 판의 빈 자리 → 바닥, 쌓인 자리(아래에서 본 판) → 맨 위
  assert.deepEqual(targetOf(h, { kind: 'tile', x: 1, y: 0 }), { x: 1, y: 0, z: 0 });
  assert.deepEqual(targetOf(h, { kind: 'tile', x: 0, y: 0 }), { x: 0, y: 0, z: 2 });
  // 윗면 → 그 쌓기나무 위, 3층이 찼으면 full
  assert.deepEqual(targetOf(h, { kind: 'face', x: 0, y: 0, z: 1, face: 'top' }), { x: 0, y: 0, z: 2 });
  assert.deepEqual(targetOf(h, { kind: 'face', x: 0, y: 1, z: 2, face: 'top' }), { error: 'full', x: 0, y: 1 });
  // 옆면 → 그 면 쪽 이웃 자리의 맨 위: 비어 있으면 바닥(높은 곳의 옆면을 눌러도 내려앉는다), 쌓여 있으면 그 위
  assert.deepEqual(targetOf(h, { kind: 'face', x: 0, y: 0, z: 1, face: 'right' }), { x: 1, y: 0, z: 0 });
  assert.deepEqual(targetOf(h, { kind: 'face', x: 0, y: 0, z: 0, face: 'back' }), { error: 'full', x: 0, y: 1 });
  assert.deepEqual(targetOf(h, { kind: 'face', x: 0, y: 1, z: 2, face: 'right' }), { x: 1, y: 1, z: 1 });
  assert.deepEqual(targetOf(h, { kind: 'face', x: 1, y: 1, z: 0, face: 'left' }), { error: 'full', x: 0, y: 1 });
  // 판 밖
  assert.deepEqual(targetOf(h, { kind: 'face', x: 0, y: 0, z: 0, face: 'front' }), { error: 'outside', x: 0, y: -1 });
  assert.deepEqual(targetOf(h, { kind: 'face', x: 0, y: 0, z: 0, face: 'left' }), { error: 'outside', x: -1, y: 0 });
  // 아랫면(아래에서 볼 때) → 그 자리의 맨 위
  assert.deepEqual(targetOf(h, { kind: 'face', x: 1, y: 1, z: 0, face: 'bottom' }), { x: 1, y: 1, z: 1 });
  // 빼기: 어느 면을 누르든 그 자리의 맨 위
  assert.deepEqual(targetOf(h, { kind: 'face', x: 0, y: 1, z: 0, face: 'front' }, 'remove'), { x: 0, y: 1, z: 2 });
  assert.deepEqual(targetOf(h, { kind: 'tile', x: 2, y: 2 }, 'remove'), { error: 'empty', x: 2, y: 2 });

  // 모든 높이 지도 표본 × 모든 면: 놓이는 칸은 늘 그 자리의 맨 위(뜨지 않는다), 놓고 빼면 처음과 같다
  const rng = createRng('place');
  for (let n = 0; n < 3000; n += 1) {
    const map = ALL[rng.int(0, ALL.length - 1)];
    const cells = cellsOf(map);
    const hit = cells.length && rng.next() < 0.8
      ? { kind: 'face', ...Object.fromEntries(['x', 'y', 'z'].map((k, i) => [k, rng.pick(cells)[i]])), face: rng.pick(Object.keys(FACE_NORMALS)) }
      : { kind: 'tile', x: rng.int(0, 2), y: rng.int(0, 2) };
    const target = targetOf(map, hit, 'add');
    if (target.error) {
      const out = target.x < 0 || target.x > 2 || target.y < 0 || target.y > 2;
      assert.equal(target.error, out ? 'outside' : 'full');
      if (!out) assert.equal(map[target.y][target.x], 3);
      assert.equal(place(map, target), null);
      continue;
    }
    assert.equal(target.z, map[target.y][target.x]);
    const next = place(map, target);
    assert.equal(count(next), count(map) + 1);
    assert.equal(next[target.y][target.x], target.z + 1);
    assert.deepEqual(remove(next, target), map);
    assert.deepEqual(targetOf(next, { kind: 'tile', x: target.x, y: target.y }, 'remove'), target);
  }
  assert.equal(remove(emptyMap(), { x: 0, y: 0 }), null);
  assert.deepEqual(setHeight(h, { x: 2, y: 2 }, 3)[2], [0, 0, 3]);
  assert.equal(setHeight(h, { x: 2, y: 2 }, 4), null);
  assert.ok(sameMap(cloneMap(h), h));
});

test('그림에서 다른 곳(lookDiff): 같아 보이면 없고, 통째로 옮긴 것은 맞춰서 견준다', () => {
  const rng = createRng('diff');
  for (let n = 0; n < 300; n += 1) {
    const a = ALL[rng.int(1, ALL.length - 1)];
    const b = ALL[rng.int(1, ALL.length - 1)];
    const d = lookDiff(a, b);
    assert.equal(d.extra.length === 0 && d.missing.length === 0, sameLook(a, b), `${mapKey(a)} ${mapKey(b)}`);
    // 다른 면은 저마다 자기 쌓기의 그림에 보이는 면이다
    const mine = new Set(picturedFaces(a).map((f) => `${f.x},${f.y},${f.z},${f.face}`));
    for (const f of d.extra) assert.ok(mine.has(`${f.x},${f.y},${f.z},${f.face}`));
    const theirs = new Set(picturedFaces(b).map((f) => `${f.x},${f.y},${f.z},${f.face}`));
    for (const f of d.missing) assert.ok(theirs.has(`${f.x},${f.y},${f.z},${f.face}`));
  }
  assert.deepEqual(lookDiff([[0, 2, 1], [0, 0, 0], [0, 0, 0]], [[0, 0, 0], [2, 1, 0], [0, 0, 0]]), { extra: [], missing: [] });
});

// ── 그리기: 자세·그리는 순서 ─────────────────
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const rows = (m) => [[m[0], m[1], m[2]], [m[3], m[4], m[5]], [m[6], m[7], m[8]]];

test('자세: 직교 행렬이고, 처음 보기는 교과서 방향(앞이 왼쪽 아래·옆이 오른쪽 아래), [위][앞][옆]은 2D 그림과 같은 모눈이 된다', () => {
  for (const [name, pose] of Object.entries(POSES)) {
    const [r, d, v] = rows(pose);
    for (const a of [r, d, v]) assert.ok(Math.abs(dot3(a, a) - 1) < 1e-12, name);
    assert.ok(Math.abs(dot3(r, d)) < 1e-12 && Math.abs(dot3(r, v)) < 1e-12 && Math.abs(dot3(d, v)) < 1e-12, name);
    // 처음 보기에서 그 방향 보기로 가는 회전을 넣으면 그 자세가 된다
    poseOfRoll(rollTo(name)).forEach((value, i) => assert.ok(Math.abs(value - pose[i]) < 1e-9, `${name} ${i}`));
  }
  // 처음 보기: 앞·오른쪽·위가 같은 비율로 보인다. 판의 앞쪽 가운데는 왼쪽 아래, 옆(오른쪽) 가운데는 오른쪽 아래
  const home = POSES.home;
  const eye = toViewerOf(home);
  for (const n of [FACE_NORMALS.front, FACE_NORMALS.right, FACE_NORMALS.top]) assert.ok(Math.abs(dot3(n, eye) - 1 / Math.sqrt(3)) < 1e-12);
  const center = projectPoint(home, 10, 0, 0, [1.5, 1.5, 0]);
  const front = projectPoint(home, 10, 0, 0, [1.5, -0.86, 0]);
  const side = projectPoint(home, 10, 0, 0, [3.86, 1.5, 0]);
  assert.ok(front[0] < center[0] - 5 && front[1] > center[1] + 5);
  assert.ok(side[0] > center[0] + 5 && side[1] > center[1] + 5);
  // [앞]: 칸 (x, y, z)의 앞면은 가로 x, 세로 z 모눈의 네모 — 화면 왼쪽부터 칸 0·1·2, 아래부터 1·2·3층
  const at = (pose, p) => projectPoint(pose, 10, 0, 0, p).map((v) => Math.round(v * 1e6) / 1e6);
  assert.deepEqual(at(POSES.front, [0, 2, 0]), at(POSES.front, [0, 0, 0])); // 깊이는 화면 자리를 바꾸지 않는다(원근 없음)
  assert.deepEqual(at(POSES.front, [1, 0, 2]), [at(POSES.front, [0, 0, 0])[0] + 10, at(POSES.front, [0, 0, 0])[1] - 20]);
  // [옆]은 오른쪽에서 본 모습: 화면 왼쪽부터 앞줄 → 뒷줄
  assert.deepEqual(at(POSES.side, [0, 1, 2]), [at(POSES.side, [2, 0, 0])[0] + 10, at(POSES.side, [2, 0, 0])[1] - 20]);
  assert.ok(dot3(toViewerOf(POSES.side), [1, 0, 0]) > 0.999);
  // [위]: 앞줄이 아래, 오른쪽이 오른쪽
  assert.deepEqual(at(POSES.top, [1, 2, 1]), [at(POSES.top, [0, 0, 0])[0] + 10, at(POSES.top, [0, 0, 0])[1] - 20]);
  // 뒤·왼쪽: 앞·옆을 좌우로 뒤집은 모눈
  assert.deepEqual(at(POSES.back, [1, 0, 0])[0], at(POSES.back, [0, 0, 0])[0] - 10);
  assert.deepEqual(at(POSES.left, [0, 1, 0])[0], at(POSES.left, [0, 0, 0])[0] - 10);
});

/** 화면 점 p가 볼록 사각형(화면 점 넷) 안에 있는가 — 가장자리에서 margin 넘게 안쪽일 때만 */
function inside(quad, p, margin) {
  let sign = 0;
  for (let i = 0; i < 4; i += 1) {
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-9) return false;
    const cross = ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) / len;
    if (Math.abs(cross) < margin) return false;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
}
const near = (quad, p, margin) => quad.some((a, i) => {
  const b = quad[(i + 1) % 4];
  const len2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / len2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * (b[0] - a[0])), p[1] - (a[1] + t * (b[1] - a[1]))) < margin;
});

/** 광선 계산: 화면 점 p를 덮는 도형마다 그 점에서의 깊이(평행사변형이라 깊이는 그 안에서 한 평면이다) → [{ index, depth }] */
function depthsAt(shapes, pose, p) {
  const out = [];
  shapes.forEach((s, index) => {
    const quad = s.pts.map((q) => projectPoint(pose, 1, 0, 0, q));
    if (!inside(quad, p, 1e-3)) return;
    // p = quad[0] + a(quad[1] − quad[0]) + b(quad[3] − quad[0]) 를 풀어 깊이를 구한다
    const e1 = [quad[1][0] - quad[0][0], quad[1][1] - quad[0][1]];
    const e2 = [quad[3][0] - quad[0][0], quad[3][1] - quad[0][1]];
    const det = e1[0] * e2[1] - e1[1] * e2[0];
    const dx = p[0] - quad[0][0];
    const dy = p[1] - quad[0][1];
    const a = (dx * e2[1] - dy * e2[0]) / det;
    const b = (e1[0] * dy - e1[1] * dx) / det;
    const d0 = depthOf(pose, s.pts[0]);
    out.push({ index, depth: d0 + a * (depthOf(pose, s.pts[1]) - d0) + b * (depthOf(pose, s.pts[3]) - d0) });
  });
  return out;
}

test('그리는 순서: 뒤에 그린 것이 앞에 그린 것에 가려지는 일이 없다 — 광선 계산과 견줌 (자세 60가지 × 쌓기 × 화면 점, 벌려 놓은 것 포함)', () => {
  const rng = createRng('paint');
  const poses = [...Object.values(POSES)];
  let view = homeView();
  for (let i = 0; i < 54; i += 1) {
    view = i % 3 === 0 ? stepView(view, rng.pick(['left', 'right', 'up', 'down'])) : dragView(view, rng.int(-200, 200), rng.int(-200, 200));
    poses.push(poseOfRoll(view.roll));
  }
  let samples = 0;
  let wrong = 0;
  for (const pose of poses) {
    for (let n = 0; n < 6; n += 1) {
      const map = n === 0 ? [[3, 3, 3], [3, 3, 3], [3, 3, 3]] : ALL[rng.int(1, ALL.length - 1)];
      const apart = n % 3 === 2;
      const shapes = sceneShapes(map, pose, { apart });
      const quads = shapes.map((s) => s.pts.map((q) => projectPoint(pose, 1, 0, 0, q)));
      for (let k = 0; k < 320; k += 1) {
        const p = [(rng.next() - 0.5) * 6.4, (rng.next() - 0.5) * 6.4];
        // 가장자리 가까이는 건너뛴다(두 면의 경계에서는 어느 쪽이든 맞다)
        if (quads.some((q) => near(q, p, 0.02))) continue;
        // 화면에 보이는 것 = 그 점을 덮는 도형 가운데 맨 나중에 그린 것. 그것이 광선 계산으로 가장 가까운 것이어야 한다
        // (같은 평면에 겹쳐 놓인 것 — 아래에서 볼 때 판과 1층 쌓기나무의 아랫면 — 은 깊이가 같아 어느 쪽이든 맞다)
        const hits = depthsAt(shapes, pose, p);
        if (hits.length === 0) continue;
        const top = hits[hits.length - 1];
        samples += 1;
        if (hits.some((hit) => hit.depth > top.depth + 1e-6)) wrong += 1;
      }
    }
  }
  assert.ok(samples > 20000, `표본 ${samples}`);
  assert.equal(wrong, 0);
});

test('그릴 면: 보는 쪽을 향하고 이웃에 맞닿지 않은 면만, 눈에서 먼 칸부터. 멈춘 그림은 그림에 보이는 면만', () => {
  const map = [[2, 1, 0], [1, 0, 0], [0, 0, 0]];
  const eye = toViewerOf(POSES.home);
  const faces = visibleFaces(map, eye);
  // 처음 보기에서는 위·앞·오른쪽 면만
  assert.deepEqual([...new Set(faces.map((f) => f.face))].sort(), ['front', 'right', 'top']);
  // 맞닿은 면은 없다: (0,0,0)의 윗면은 (0,0,1)에, 오른쪽 면은 (1,0,0)에 가려진다
  assert.ok(!faces.some((f) => f.x === 0 && f.y === 0 && f.z === 0 && (f.face === 'top' || f.face === 'right')));
  // 층별로 벌려 놓으면 윗면이 드러난다
  assert.ok(visibleFaces(map, eye, { apart: true }).some((f) => f.x === 0 && f.y === 0 && f.z === 0 && f.face === 'top'));
  // 순서: 층 → 줄 → 칸으로 눈에서 먼 쪽부터
  assert.deepEqual(paintOrder([[2, 0, 0], [0, 2, 0], [0, 0, 1], [0, 0, 0]], eye), [[0, 2, 0], [0, 0, 0], [2, 0, 0], [0, 0, 1]]);
  assert.deepEqual(paintOrder([[0, 0, 0], [0, 0, 1]], [0, 0, -1]), [[0, 0, 1], [0, 0, 0]]);
  // 판: 위에서 보면 먼저(밑에), 아래에서 보면 나중에
  assert.equal(sceneShapes(map, POSES.home)[0].kind, 'tile');
  const below = POSES.top.map((v, i) => (i >= 3 ? -v : v));
  assert.equal(sceneShapes(map, below).at(-1).kind, 'tile');
  assert.equal(sceneShapes(map, POSES.home, { board: false }).filter((s) => s.kind === 'tile').length, 0);
  // 멈춘 그림: 숨겨진 쌓기나무의 면은 없다. 면의 수 = 그림에 보이는 면의 수 (표본)
  const rng = createRng('still');
  for (let n = 0; n < 300; n += 1) {
    const h = ALL[rng.int(1, ALL.length - 1)];
    const still = sceneShapes(h, POSES.home, { board: false, still: true });
    assert.equal(still.length, picturedFaces(h).length, mapKey(h));
    const hidden = new Set(hiddenCells(h).map((c) => c.join(',')));
    assert.ok(!still.some((s) => hidden.has(`${s.x},${s.y},${s.z}`)), mapKey(h));
  }
  // 벌려 놓는 틈: 층마다 같은 간격
  const apartShapes = sceneShapes([[3, 0, 0], [0, 0, 0], [0, 0, 0]], POSES.home, { apart: true, board: false });
  const zs = [...new Set(apartShapes.filter((s) => s.face === 'top').map((s) => s.pts[0][2]))].sort((a, b) => a - b);
  assert.ok(Math.abs(zs[1] - zs[0] - (1 + APART_GAP)) < 1e-9 && Math.abs(zs[2] - zs[1] - (1 + APART_GAP)) < 1e-9);
});

test('쌓기나무의 화면 크기와 보는 방향 말', () => {
  // 한 변: 무대 높이 ÷ 5.6, 넓은 무대는 양옆 조작 칸(210px씩)을 뺀 폭 ÷ 5.2 가운데 작은 쪽
  assert.equal(unitFor(808, 382, 210), 68); // 1366×680
  assert.equal(unitFor(808, 444, 210), 74); // 1366×768
  assert.equal(unitFor(776, 406, 210), 68); // 태블릿 820×1180
  assert.equal(unitFor(334, 260, 0), 46); // 휴대폰
  // 꽉 찬 3×3×3의 가장 먼 꼭짓점(가운데에서 한 변의 2.6배)도 양옆 조작 칸 밖으로 나가지 않는다
  for (const [w, h] of [[808, 382], [808, 444], [776, 406]]) assert.ok(unitFor(w, h, 210) * Math.sqrt(27) / 2 <= w / 2 - 210, `${w}×${h}`);
  assert.equal(poseWord(POSES.top), '위에서 본 모습이에요.');
  assert.equal(poseWord(POSES.home), '비스듬히 위에서 본 모습이에요.');
  assert.equal(poseWord(POSES.front), '앞에서 본 모습이에요.');
  assert.equal(poseWord(POSES.side), '옆에서 본 모습이에요.');
  assert.equal(poseWord(POSES.back), '뒤에서 본 모습이에요.');
  assert.equal(poseWord(POSES.left), '왼쪽에서 본 모습이에요.');
  assert.equal(poseWord(POSES.front, { front: '가 쪽', side: '나 쪽', back: '다 쪽', left: '라 쪽' }), '가 쪽에서 본 모습이에요.');
  assert.equal(poseWord(POSES.top.map((v, i) => (i >= 3 ? -v : v))), '아래에서 본 모습이에요.');
});
