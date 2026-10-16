/**
 * 상자 크기 정하기 · 상자 종류와 표준 이름 · 직육면체 도감 주문 (spec 16-16).
 * 판정·가짓수·"같은 전개도"는 저장소의 fold.js를 쓰지 않는 독립 계산(상자를 굴려 찍기)과 견준다:
 *   - 판정: 크기 64가지 × 무작위 배치에서 되는/안 되는 판정이 같다
 *   - 가짓수: 상자 종류마다 54 · 29 · 11가지
 *   - 표준 이름: 크기를 바꿔도 같은 모양(상자의 대칭으로 겹치는 펼치기)이면 같은 이름, 다른 모양이면 다른 이름
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRng } from '../../src/shared/core/random.js';
import { collectItem, collectionXp, normalizeCollectionState, normalizeCollections, xpAfterCount } from '../../src/shared/core/collection.js';
import { createPlayReward, discoverXp, stageXp } from '../../src/shared/core/rewards.js';
import { CUBOID_COLLECTIONS } from '../../src/games/net-workshop/cuboid-main.js';
import { checkNet, fromRects } from '../../src/games/net-workshop/fold.js';
import {
  BOX_KINDS,
  BOX_MAX,
  BOX_MIN,
  CUBOID_BOARDS,
  CUBOID_DEX_COUNT,
  CUBOID_DEX_STAR_AT,
  CUBOID_HINT_TEXT,
  CUBOID_NETS_ID,
  CUBOID_PAIR_NETS_ID,
  DEFAULT_BOX,
  FREE_CARDS,
  PAIR_NET_COUNT,
  boxArrangement,
  boxBoard,
  boxBoardNotice,
  boxCards,
  boxCardsText,
  boxCatalog,
  boxHintText,
  boxKind,
  boxNetId,
  boxNotice,
  boxSolidNet,
  boxText,
  centerOnBoard,
  createCuboidFreeSession,
  cuboidDexHighlights,
  cuboidDexMilestone,
  cuboidDexNextStar,
  cuboidDexStarNote,
  cuboidDexStars,
  cuboidHintNet,
  freeNets,
  judgeCuboidFree,
  pairNetIdAt,
} from '../../src/games/net-workshop/cuboid-logic.js';
import { CUBE_NETS } from '../../src/games/net-workshop/nets-data.js';

// ── 독립 계산: 상자를 굴려 찍는다 (fold.js · cuboid-logic.js를 쓰지 않는다) ──────────────────────
const ALL_DIMS = [];
for (let a = BOX_MIN; a <= BOX_MAX; a += 1) for (let b = BOX_MIN; b <= BOX_MAX; b += 1) for (let c = BOX_MIN; c <= BOX_MAX; c += 1) ALL_DIMS.push([a, b, c]);
const add = (p, q) => p.map((v, i) => v + q[i]);
const neg = (p) => p.map((v) => -v);
const same = (p, q) => p.every((v, i) => v === q[i]);
const axisOf = (n) => n.findIndex((v) => v !== 0);

/**
 * 상자 겉면의 1 cm 칸 하나를 "틀"로 나타낸다: P(칸 가운데 × 2 — 정수), U(종이의 오른쪽), V(종이의 아래쪽), N(바깥 방향).
 * 종이 위에서 d 방향으로 한 칸 가면: 같은 면 안이면 P + 2d, 면을 넘으면 모서리를 따라 굴러 다음 면으로 (종이는 뒤쪽으로 접힌다)
 */
function step(frame, dir, dims) {
  const { P, U, V, N } = frame;
  const D = { '+x': U, '-x': neg(U), '+y': V, '-y': neg(V) }[dir];
  const next = add(P, D.map((v) => v * 2));
  const k = axisOf(D);
  if (next[k] > 0 && next[k] < 2 * dims[k]) return { inside: true, frame: { P: next, U, V, N } };
  // 굴리기: 가던 방향이 새 면에서는 안쪽(-N)이 되고, 새 면의 바깥 방향은 가던 방향이다
  const P2 = add(add(P, D), neg(N));
  if (dir === '+x') return { inside: false, frame: { P: P2, U: neg(N), V, N: D } };
  if (dir === '-x') return { inside: false, frame: { P: P2, U: N, V, N: D } };
  if (dir === '+y') return { inside: false, frame: { P: P2, U, V: neg(N), N: D } };
  return { inside: false, frame: { P: P2, U, V: N, N: D } };
}
const DIRS = [['+x', 1, 0], ['-x', -1, 0], ['+y', 0, 1], ['-y', 0, -1]];
const frameKey = (f) => [f.P, f.U, f.V, f.N].map((v) => v.join(',')).join('|');

/** 독립 판정: 직사각형들(1 cm 칸)이 이 상자를 빈틈·겹침 없이 감싸는가 (면 하나가 상자의 면 하나, 맞닿은 칸은 모두 접어서 맞닿는다) */
function wrapsBox(rects, dims) {
  const owner = new Map();
  for (const [i, r] of rects.entries()) {
    for (let x = r.x; x < r.x + r.w; x += 1) {
      for (let y = r.y; y < r.y + r.h; y += 1) {
        if (owner.has(`${x},${y}`)) return false;
        owner.set(`${x},${y}`, i);
      }
    }
  }
  const area = 2 * (dims[0] * dims[1] + dims[1] * dims[2] + dims[0] * dims[2]);
  if (owner.size !== area) return false;
  const r0 = rects[0];
  // 첫 면의 왼쪽 위 칸은 상자의 어느 면의 한 모서리 칸이다: 면 6 × 모서리 4 × 종이의 방향 2(앞뒤)
  for (let k = 0; k < 3; k += 1) {
    for (const s of [-1, 1]) {
      const N = [0, 0, 0];
      N[k] = s;
      const [i, j] = [0, 1, 2].filter((x) => x !== k);
      for (const [si, sj] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        for (const swap of [false, true]) {
          const e1 = [0, 0, 0];
          const e2 = [0, 0, 0];
          e1[i] = si;
          e2[j] = sj;
          const [U, V] = swap ? [e2, e1] : [e1, e2];
          const P = [0, 0, 0];
          P[k] = s > 0 ? 2 * dims[k] : 0;
          P[i] = si > 0 ? 1 : 2 * dims[i] - 1;
          P[j] = sj > 0 ? 1 : 2 * dims[j] - 1;
          if (roll(owner, `${r0.x},${r0.y}`, { P, U, V, N }, dims)) return true;
        }
      }
    }
  }
  return false;
}
function roll(owner, start, frame, dims) {
  const placed = new Map([[start, frame]]);
  const queue = [start];
  while (queue.length > 0) {
    const key = queue.shift();
    const [x, y] = key.split(',').map(Number);
    const here = placed.get(key);
    for (const [dir, dx, dy] of DIRS) {
      const next = `${x + dx},${y + dy}`;
      if (!owner.has(next)) continue;
      const { inside, frame: there } = step(here, dir, dims);
      const sameFace = owner.get(next) === owner.get(key);
      if (inside !== sameFace) return false; // 면 안에서 다른 면으로 넘어가거나(한 상자 면에 두 장), 한 장이 모서리에서 꺾인다
      if (placed.has(next)) {
        if (frameKey(placed.get(next)) !== frameKey(there)) return false;
        continue;
      }
      placed.set(next, there);
      queue.push(next);
    }
  }
  if (placed.size !== owner.size) return false;
  return new Set([...placed.values()].map((f) => f.P.join(','))).size === owner.size;
}

/** 상자의 면 (축 k, 방향 s)과 모서리(서로 다른 축의 두 면) — 펼치는 방법 = 모서리 5개로 면 6개를 잇는 나무 */
const FACES = [0, 1, 2].flatMap((k) => [-1, 1].map((s) => ({ k, s })));
const EDGES = [];
for (let p = 0; p < 6; p += 1) for (let q = p + 1; q < 6; q += 1) if (FACES[p].k !== FACES[q].k) EDGES.push([p, q]);
const TREES = (() => {
  const out = [];
  const pick = (from, chosen) => {
    if (chosen.length === 5) {
      const group = FACES.map((_, i) => i);
      const find = (i) => (group[i] === i ? i : (group[i] = find(group[i])));
      for (const [p, q] of chosen) group[find(p)] = find(q);
      if (new Set(FACES.map((_, i) => find(i))).size === 1) out.push(chosen.slice());
      return;
    }
    for (let i = from; i < EDGES.length; i += 1) pick(i + 1, [...chosen, EDGES[i]]);
  };
  pick(0, []);
  return out;
})();
const faceIndex = (N) => FACES.findIndex((f) => N[f.k] === f.s);

/** 독립 펼치기: 나무의 모서리로만 넘어가며 상자 겉면의 칸을 굴려 종이 위 자리를 정한다 → 면마다 직사각형 */
function unfoldTree(tree, dims) {
  const allowed = new Set(tree.map(([p, q]) => `${Math.min(p, q)}-${Math.max(p, q)}`));
  const start = { P: [1, 1, 0], U: [1, 0, 0], V: [0, 1, 0], N: [0, 0, -1] }; // 아랫면의 모서리 칸
  const seen = new Map([[start.P.join(','), [0, 0]]]);
  const cells = [{ at: [0, 0], frame: start }];
  const queue = [cells[0]];
  while (queue.length > 0) {
    const { at, frame } = queue.shift();
    for (const [dir, dx, dy] of DIRS) {
      const { inside, frame: there } = step(frame, dir, dims);
      if (!inside) {
        const p = faceIndex(frame.N);
        const q = faceIndex(there.N);
        if (!allowed.has(`${Math.min(p, q)}-${Math.max(p, q)}`)) continue;
      }
      const key = there.P.join(',');
      if (seen.has(key)) continue;
      const cell = { at: [at[0] + dx, at[1] + dy], frame: there };
      seen.set(key, cell.at);
      cells.push(cell);
      queue.push(cell);
    }
  }
  const byFace = new Map();
  for (const c of cells) {
    const f = faceIndex(c.frame.N);
    if (!byFace.has(f)) byFace.set(f, []);
    byFace.get(f).push(c.at);
  }
  const rects = [...byFace.values()].map((pts) => {
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs) + 1, h: Math.max(...ys) - Math.min(...ys) + 1 };
  });
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  return rects.map((r) => ({ ...r, x: r.x - minX, y: r.y - minY }));
}

/** 독립 모양 열쇠: 돌리기 4 × 뒤집기 2 가운데 가장 작은 글자열 (자리는 왼쪽 위를 0으로) */
const SYM = [(x, y) => [x, y], (x, y) => [-y, x], (x, y) => [-x, -y], (x, y) => [y, -x], (x, y) => [-x, y], (x, y) => [y, x], (x, y) => [x, -y], (x, y) => [-y, -x]];
function shapeOf(rects) {
  let best = null;
  for (const f of SYM) {
    const moved = rects.map((r) => {
      const [x1, y1] = f(r.x, r.y);
      const [x2, y2] = f(r.x + r.w, r.y + r.h);
      return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
    });
    const mx = Math.min(...moved.map((r) => r.x));
    const my = Math.min(...moved.map((r) => r.y));
    const key = moved.map((r) => `${r.x - mx},${r.y - my},${r.w},${r.h}`).sort().join(';');
    if (best == null || key < best) best = key;
  }
  return best;
}

/**
 * 독립 "같은 전개도" 표: 상자 종류 안에서 길이 순서로 맞춘 축(세 길이가 다르면 짧은 · 가운데 · 긴, 두 길이가 같으면 같은 둘 · 다른 하나)으로 나무를 적고,
 * 그 상자의 대칭(축 방향 뒤집기, 같은 길이의 축끼리 바꾸기)으로 겹치는 나무는 같은 것으로 본다
 */
function treeSignature(tree, dims) {
  const kind = new Set(dims).size === 3 ? 'distinct' : new Set(dims).size === 2 ? 'pair' : 'cube';
  const order = [0, 1, 2].sort((p, q) => {
    if (kind === 'pair') {
      const twice = (k) => dims.filter((v) => v === dims[k]).length === 2;
      if (twice(p) !== twice(q)) return twice(p) ? -1 : 1;
    }
    return dims[p] - dims[q] || p - q;
  });
  const rank = order.map((_, k) => order.indexOf(k)); // 실제 축 k → 표준 축
  const perms = kind === 'cube' ? [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]] : kind === 'pair' ? [[0, 1, 2], [1, 0, 2]] : [[0, 1, 2]];
  let best = null;
  for (const perm of perms) {
    for (let flips = 0; flips < 8; flips += 1) {
      const face = (i) => {
        const k = perm[rank[FACES[i].k]];
        const s = FACES[i].s * ((flips >> k) & 1 ? -1 : 1);
        return `${k}${s > 0 ? '+' : '-'}`;
      };
      const key = tree.map(([p, q]) => [face(p), face(q)].sort().join('')).sort().join(' ');
      if (best == null || key < best) best = key;
    }
  }
  return `${kind}:${best}`;
}

const placeAt = (rects, dx, dy) => rects.map((r) => ({ ...r, x: r.x + dx, y: r.y + dy }));
const transformRects = (rects, k) => {
  const f = SYM[k];
  const moved = rects.map((r) => {
    const [x1, y1] = f(r.x, r.y);
    const [x2, y2] = f(r.x + r.w, r.y + r.h);
    return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
  });
  const mx = Math.min(...moved.map((r) => r.x));
  const my = Math.min(...moved.map((r) => r.y));
  return moved.map((r) => ({ ...r, x: r.x - mx, y: r.y - my }));
};
const appOk = (rects, dims) => checkNet(fromRects(rects, { dims })).ok;

// 64가지 크기마다 독립 펼치기 결과 (나무 384개)
const UNFOLDED = new Map(ALL_DIMS.map((dims) => [dims.join(','), TREES.map((tree) => ({ tree, rects: unfoldTree(tree, dims) }))]));

test('독립 계산 준비: 상자의 펼치는 나무는 384가지, 독립 펼치기는 늘 상자를 감싸고(독립 판정) 앱 판정도 된다고 한다', () => {
  assert.equal(TREES.length, 384);
  for (const dims of [[3, 2, 1], [1, 1, 1], [4, 4, 1], [2, 3, 4]]) {
    for (const { rects } of UNFOLDED.get(dims.join(','))) {
      assert.equal(rects.length, 6);
      assert.ok(wrapsBox(rects, dims), `${dims} ${JSON.stringify(rects)}`);
      assert.ok(appOk(rects, dims), `${dims} ${JSON.stringify(rects)}`);
    }
  }
});

test('가짓수(독립 계산과 같다): 크기 64가지 모두 — 세 길이가 다르면 54가지, 두 길이가 같으면 29가지, 셋이 같으면 11가지. 앱의 상자 표도 같은 수', () => {
  const kinds = { distinct: 0, pair: 0, cube: 0 };
  for (const dims of ALL_DIMS) {
    const shapes = new Set(UNFOLDED.get(dims.join(',')).map((u) => shapeOf(u.rects)));
    const kind = boxKind(dims);
    kinds[kind] += 1;
    assert.equal(shapes.size, BOX_KINDS[kind].count, `${dims} (${kind})`);
    assert.equal(boxCatalog(dims).list.length, BOX_KINDS[kind].count, `${dims}`);
    assert.equal(boxCatalog(dims).kind, kind);
  }
  assert.deepEqual(kinds, { distinct: 24, pair: 36, cube: 4 });
  assert.deepEqual(Object.fromEntries(Object.entries(BOX_KINDS).map(([k, v]) => [k, [v.count, v.canon.join(''), v.collection]])), {
    distinct: [54, '123', CUBOID_NETS_ID], pair: [29, '112', CUBOID_PAIR_NETS_ID], cube: [11, '111', 'cube-nets'],
  });
});

test('표준 이름(독립 계산과 같다): 크기를 바꿔도 같은 모양(상자의 대칭으로 겹치는 펼치기)이면 같은 이름, 다른 모양이면 다른 이름 — 64가지 크기 × 나무 384가지', () => {
  const nameOf = new Map(); // 독립 표 → 앱의 이름
  const signOf = new Map(); // 앱의 이름 → 독립 표
  const perKind = { distinct: new Set(), pair: new Set(), cube: new Set() };
  for (const dims of ALL_DIMS) {
    for (const { tree, rects } of UNFOLDED.get(dims.join(','))) {
      const sign = treeSignature(tree, dims);
      const net = fromRects(transformRects(rects, (tree[0][0] + tree[1][1]) % 8), { dims });
      const id = boxNetId(net, dims);
      assert.ok(id, `${dims} ${sign}`);
      if (nameOf.has(sign)) assert.equal(id, nameOf.get(sign), `${dims}: ${sign}`);
      else nameOf.set(sign, id);
      if (signOf.has(id)) assert.equal(signOf.get(id), sign, `${dims}: ${id}`);
      else signOf.set(id, sign);
      perKind[boxKind(dims)].add(id);
      // 판정도 같다: 앱의 접기 판정 · 판에서 쓰는 이름 · 처음 상자의 이름표(freeNets)와
      assert.equal(judgeCuboidFree({ rects, dims }).id, id);
    }
  }
  assert.deepEqual(Object.fromEntries(Object.entries(perKind).map(([k, v]) => [k, v.size])), { distinct: 54, pair: 29, cube: 11 });
  // 이름: 세 길이가 다른 것은 지금까지 저장해 온 '123-01'~'123-54'(바꾸지 않는다), 두 길이가 같은 것은 '112-01'~'112-29', 정육면체는 정육면체 도감의 이름
  assert.deepEqual([...perKind.distinct].sort(), freeNets().map((n) => n.id));
  assert.deepEqual([...perKind.pair].sort(), Array.from({ length: PAIR_NET_COUNT }, (_, i) => pairNetIdAt(i)));
  assert.deepEqual([...perKind.cube].sort(), CUBE_NETS.map((n) => n.name).sort());
  // 십자 모양 정육면체 전개도는 크기가 1 cm든 4 cm든 '1-4-1e'
  for (const s of [1, 2, 3, 4]) {
    const cross = [[1, 0], [0, 1], [1, 1], [2, 1], [3, 1], [1, 2]].map(([x, y]) => ({ x: x * s, y: y * s, w: s, h: s }));
    assert.equal(judgeCuboidFree({ rects: cross, dims: [s, s, s] }).id, '1-4-1e');
  }
});

test('판정(독립 계산과 같다): 크기 64가지 × 무작위 배치 — 되는 전개도를 돌리거나 옮긴 것, 면 하나를 다른 자리·다른 방향으로 옮긴 것, 아무렇게나 이어 붙인 것', () => {
  const rng = createRng('cuboid-box-judge');
  let valid = 0;
  let invalid = 0;
  for (const dims of ALL_DIMS) {
    const unfolded = UNFOLDED.get(dims.join(','));
    const cards = boxCards(dims);
    for (let trial = 0; trial < 70; trial += 1) {
      let rects;
      const mode = rng.int(0, 2);
      if (mode === 0) {
        rects = placeAt(transformRects(rng.pick(unfolded).rects, rng.int(0, 7)), rng.int(0, 2), rng.int(0, 2));
      } else if (mode === 1) {
        // 면 하나를 다른 면의 한 변에 아무 자리로(돌려서도) 붙여 본다
        rects = transformRects(rng.pick(unfolded).rects, rng.int(0, 7)).map((r) => ({ ...r }));
        const i = rng.int(0, 5);
        const moved = rects.splice(i, 1)[0];
        const [w, h] = rng.next() < 0.5 ? [moved.w, moved.h] : [moved.h, moved.w];
        const to = rng.pick(rects);
        const side = rng.int(0, 3);
        const along = side < 2 ? rng.int(to.x - w + 1, to.x + to.w - 1) : rng.int(to.y - h + 1, to.y + to.h - 1);
        const spot = [
          { x: along, y: to.y - h }, { x: along, y: to.y + to.h }, { x: to.x - w, y: along }, { x: to.x + to.w, y: along },
        ][side];
        rects.splice(i, 0, { ...spot, w, h });
        const mx = Math.min(...rects.map((r) => r.x));
        const my = Math.min(...rects.map((r) => r.y));
        rects = rects.map((r) => ({ ...r, x: r.x - mx, y: r.y - my }));
      } else {
        // 면 카드 여섯 장을 아무렇게나 서로 이어 붙인다
        rects = [];
        for (const c of rng.shuffle(cards.map((x) => ({ ...x })))) {
          const [w, h] = rng.next() < 0.5 ? [c.w, c.h] : [c.h, c.w];
          if (rects.length === 0) {
            rects.push({ x: 20, y: 20, w, h });
            continue;
          }
          for (let guard = 0; guard < 40; guard += 1) {
            const to = rng.pick(rects);
            const side = rng.int(0, 3);
            const along = side < 2 ? rng.int(to.x - w + 1, to.x + to.w - 1) : rng.int(to.y - h + 1, to.y + to.h - 1);
            const spot = [{ x: along, y: to.y - h }, { x: along, y: to.y + to.h }, { x: to.x - w, y: along }, { x: to.x + to.w, y: along }][side];
            const r = { ...spot, w, h };
            if (rects.some((q) => q.x < r.x + r.w && r.x < q.x + q.w && q.y < r.y + r.h && r.y < q.y + q.h)) continue;
            rects.push(r);
            break;
          }
        }
        if (rects.length < 6) continue;
      }
      const overlapping = rects.some((p, a) => rects.some((q, b) => a < b && p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h));
      if (overlapping) continue; // 판은 겹쳐 놓을 수 없다
      const want = wrapsBox(rects, dims);
      const got = judgeCuboidFree({ rects, dims });
      assert.equal(got.valid, want, `${dims} ${JSON.stringify(rects)}`);
      if (want) {
        valid += 1;
        assert.ok(got.id);
      } else invalid += 1;
    }
  }
  assert.ok(valid > 1500 && invalid > 1500, `되는 ${valid} · 안 되는 ${invalid}`);
});

test('면 카드와 놓는 판: 크기 64가지 — 카드는 크기가 같은 면이 두 장씩(가로×세로 · 가로×높이 · 세로×높이), 판에는 그 상자의 전개도가 모두 들어간다. 처음 상자는 지금과 같다', () => {
  assert.deepEqual([...DEFAULT_BOX], [3, 2, 1]);
  assert.deepEqual(boxCards(DEFAULT_BOX), FREE_CARDS.map((c) => ({ ...c })));
  assert.deepEqual(boxBoard(DEFAULT_BOX), CUBOID_BOARDS.wide);
  assert.deepEqual(boxBoard(DEFAULT_BOX, { phone: true }), CUBOID_BOARDS.phone);
  assert.equal(boxHintText(DEFAULT_BOX), CUBOID_HINT_TEXT);
  assert.equal(CUBOID_HINT_TEXT, '길이가 3 cm인 변끼리 이어 네 장을 한 줄로 놓고, 남은 작은 면 두 장을 위와 아래에 붙여 봐요.');
  let largest = { cols: 0, rows: 0 };
  for (const dims of ALL_DIMS) {
    const [a, b, c] = dims;
    const sizes = boxCards(dims).map((x) => `${x.w}x${x.h}`);
    const want = [[a, b], [a, b], [a, c], [a, c], [b, c], [b, c]].map(([p, q]) => `${Math.max(p, q)}x${Math.min(p, q)}`);
    assert.deepEqual(sizes, want, `${dims}`);
    assert.deepEqual(boxCards(dims).map((x) => x.label), ['가', '나', '다', '라', '마', '바']);
    const board = boxBoard(dims);
    assert.ok(board.cols >= board.rows && board.cols >= 7 && board.rows >= 5, `${dims}`);
    for (const n of boxCatalog(dims).list) assert.ok(centerOnBoard(n.net, board), `${dims} ${n.id}`);
    // 더 작은 판에는 다 들어가지 않는다(가장 작은 판)
    if (board.cols > 7) assert.ok(boxCatalog(dims).list.some((n) => !centerOnBoard(n.net, { cols: board.cols - 1, rows: board.rows })), `${dims} 가로`);
    if (board.rows > 5) assert.ok(boxCatalog(dims).list.some((n) => !centerOnBoard(n.net, { cols: board.cols, rows: board.rows - 1 })), `${dims} 세로`);
    if (board.cols * board.rows > largest.cols * largest.rows) largest = board;
    // 판정할 때의 상자 크기(면의 짝)는 카드와 같다: 그 상자의 전개도는 모두 된다
    assert.ok(appOk(centerOnBoard(boxCatalog(dims).list[0].net, board), dims));
  }
  assert.deepEqual(largest, { cols: 20, rows: 12 }); // 4 × 4 × 4 cm
  assert.equal(boxText([3, 2, 1]), '가로 3 cm · 세로 2 cm · 높이 1 cm');
  assert.equal(boxCardsText([3, 2, 1]), '3×2 cm 두 장 · 3×1 cm 두 장 · 2×1 cm 두 장');
  assert.equal(boxCardsText([2, 2, 2]), '2×2 cm 여섯 장');
  assert.equal(boxCardsText([2, 2, 1]), '2×2 cm 두 장 · 2×1 cm 네 장');
  assert.deepEqual([boxArrangement([3, 2, 1]), boxArrangement([1, 3, 1]), boxArrangement([2, 2, 4]), boxArrangement([3, 3, 3])], [[1, 2, 3], [1, 1, 3], [2, 2, 4], [3, 3, 3]]);
});

test('상자 크기 안내: 세 길이가 같으면 정육면체(그대로 만들 수 있다), 도감 주문은 세 길이가 모두 달라야 한다. 힌트 글은 그 상자의 가장 긴 모서리', () => {
  assert.equal(boxNotice([3, 2, 1]), null);
  assert.equal(boxNotice([2, 2, 1]), null);
  assert.deepEqual(boxNotice([2, 2, 2]), { text: '세 모서리의 길이가 모두 같으면 정육면체예요. 정육면체도 직육면체라 그대로 만들 수 있어요.', block: false });
  for (const dims of [[2, 2, 2], [2, 2, 1], [4, 1, 4]]) assert.deepEqual(boxNotice(dims, { dex: true }), { text: '도감 주문은 세 모서리의 길이가 모두 달라야 해요.', block: true });
  assert.equal(boxNotice([4, 1, 3], { dex: true }), null);
  assert.match(boxHintText([2, 4, 1]), /길이가 4 cm인 변끼리/);
  assert.doesNotMatch(boxHintText([3, 3, 3]), /cm/);
  // 접기 전 안내 · 힌트 글에 까닭 낱말이 없다
  for (const dims of ALL_DIMS) assert.doesNotMatch(boxHintText(dims), /겹|둘러|달라|어긋|비어|꼭짓점|한 점/);
});

test('한 판의 흐름(크기를 섞어서): 같은 모양을 크기만 바꿔 다시 접으면 다시 세지 않는다. 상자 종류가 다르면 다른 전개도이고, 정육면체 상자는 정육면체 도감에 넣는다', () => {
  const session = createCuboidFreeSession();
  const at = (dims, k = 0) => {
    const u = UNFOLDED.get(dims.join(','));
    return placeAt(transformRects(u[k].rects, 0), 1, 1);
  };
  const a = session.fold(at([3, 2, 1]));
  assert.deepEqual([a.kind, a.box, a.collect.id, a.total, a.kindCount, a.dexCount], ['new', 'distinct', CUBOID_NETS_ID, 1, 1, 1]);
  assert.equal(a.given, `전개도 ${a.id}`); // 처음 상자의 기록은 지금과 같은 글
  // 같은 모양(긴 · 가운데 · 짧은 모서리의 자리가 같은 펼치기)을 4 × 3 × 2 cm 상자로: 같은 이름, 이번 판에 이미 접은 모양
  session.setBox([4, 3, 2]);
  const again = session.fold(at([4, 3, 2]));
  assert.deepEqual([again.kind, again.id, again.log, again.found], ['repeat', a.id, false, 1]);
  // 축의 이름이 달라도(2 × 3 × 4 cm — 가로가 가장 짧다) 길이 순서로 같은 자리면 같은 이름: 독립 표가 같은 나무를 찾아 접는다
  session.setBox([2, 3, 4]);
  const twin = UNFOLDED.get('2,3,4').find((u) => treeSignature(u.tree, [2, 3, 4]) === treeSignature(UNFOLDED.get('3,2,1')[0].tree, [3, 2, 1]));
  assert.equal(session.fold(twin.rects).kind, 'repeat');
  // 두 길이가 같은 상자: 다른 모음, 이름이 112-…
  session.setBox([2, 2, 1]);
  const pair = session.fold(at([2, 2, 1]));
  assert.deepEqual([pair.kind, pair.box, pair.collect.id, pair.found, pair.total, pair.kindCount], ['new', 'pair', CUBOID_PAIR_NETS_ID, 2, 2, 1]);
  assert.match(pair.id, /^112-\d\d$/);
  assert.equal(pair.given, `전개도 ${pair.id} (상자 2×2×1 cm)`);
  // 정육면체 상자: 정육면체 도감의 이름, 점수 상한을 세는 수(total)에는 들지 않는다
  session.setBox([3, 3, 3]);
  const cube = session.fold(at([3, 3, 3]));
  assert.deepEqual([cube.kind, cube.box, cube.collect.id, cube.found, cube.total, cube.kindCount, cube.later], ['new', 'cube', 'cube-nets', 3, 2, 1, false]);
  assert.ok(CUBE_NETS.some((n) => n.name === cube.id));
  assert.ok(cube.done && cube.full);
  // 안 되는 모양: 이번 판에 다시 접으면(옮겨도) 기록 없음. 크기가 다른 상자의 안 되는 모양은 다른 모양이다
  const bad = [{ x: 0, y: 0, w: 3, h: 3 }, { x: 3, y: 0, w: 3, h: 3 }, { x: 6, y: 0, w: 3, h: 3 }, { x: 9, y: 0, w: 3, h: 3 }, { x: 12, y: 0, w: 3, h: 3 }, { x: 0, y: 3, w: 3, h: 3 }];
  const x1 = session.fold(bad);
  assert.deepEqual([x1.kind, x1.log, x1.collect], ['invalid', true, null]);
  assert.equal(session.fold(placeAt(bad, 2, 1)).kind, 'repeat');
  session.setBox([2, 2, 2]);
  assert.equal(session.fold(bad.map((r) => ({ x: (r.x / 3) * 2, y: (r.y / 3) * 2, w: 2, h: 2 }))).kind, 'invalid');
  // 이 기기에서 이미 찾은 것: 종류마다 따로 안다
  // (같은 나무를 같은 길이 순서의 상자로 접는다: 1 cm 정육면체, 1 × 1 × 4 cm, 4 × 2 × 1 cm)
  const later = createCuboidFreeSession({ found: [a.id], foundPair: [pair.id], foundCube: [cube.id], box: [1, 1, 1] });
  assert.equal(later.fold(at([1, 1, 1])).kind, 'known');
  later.setBox([1, 1, 4]);
  assert.equal(later.fold(at([1, 1, 4])).kind, 'known');
  later.setBox([4, 2, 1]);
  assert.equal(later.fold(at([4, 2, 1])).kind, 'known');
  assert.deepEqual(later.device('pair'), new Set([pair.id]));
});

test('직육면체 도감 주문: 별 = 도감에 찾은 가지 수(10가지 ★1 · 20가지 ★2 · 30가지 ★3), 다음 별까지, 별 기준 안내, 별이 늘 때의 말, 54칸을 채우면 끝', () => {
  assert.deepEqual([...CUBOID_DEX_STAR_AT], [10, 20, 30]);
  assert.equal(CUBOID_DEX_COUNT, 54);
  const counts = [0, 1, 9, 10, 11, 19, 20, 29, 30, 31, 53, 54];
  assert.deepEqual(counts.map(cuboidDexStars), [0, 0, 0, 1, 1, 1, 2, 2, 3, 3, 3, 3]);
  assert.deepEqual(counts.map(cuboidDexNextStar), [10, 10, 10, 20, 20, 20, 30, 30, null, null, null, null]);
  // 모든 가지 수에서 별 0 · 1 · 2 · 3이 모두 나온다(별 기준이 닿을 수 있다)
  assert.deepEqual([...new Set(Array.from({ length: 55 }, (_, n) => cuboidDexStars(n)))], [0, 1, 2, 3]);
  assert.match(cuboidDexStarNote(4), /^도감 10가지를 채우면 별 1개예요\(10가지 별 1개 · 20가지 별 2개 · 30가지 별 3개\)/);
  assert.match(cuboidDexStarNote(25), /^도감 30가지를 채우면 별 3개예요/);
  assert.equal(cuboidDexStarNote(30), null);
  assert.deepEqual([cuboidDexMilestone(9, 10), cuboidDexMilestone(10, 11), cuboidDexMilestone(19, 20), cuboidDexMilestone(29, 30)],
    ['도감 10가지! 지금 끝내도 별 1개를 받아요.', '', '도감 20가지! 지금 끝내도 별 2개를 받아요.', '도감 30가지! 이제 끝내도 별 3개를 받아요.']);
  const tiles = cuboidDexHighlights({ fixes: 2, newNets: 3, shapes: 5 }, { earned: { answer: 6, nets: 15 }, dexCount: 12 });
  assert.deepEqual(tiles.map((t) => [t.label, t.value, t.xp ?? null]), [['직육면체 전개도 도감', '12 / 54', 21], ['다음 별까지', '8가지', null], ['고쳐서 다시 도전', '2번', null]]);
  assert.equal(cuboidDexHighlights({ fixes: 0 }, { earned: { answer: 0, nets: 0 }, dexCount: 40 })[1].value, '14가지');
  // 판: 54칸을 다 채우면 끝(done). 이미 다 채운 기기는 처음부터 끝난 상태
  const ids = freeNets().map((n) => n.id);
  const near = createCuboidFreeSession({ stageId: 'cuboid-dex', dex: true, found: ids.slice(0, 53) });
  assert.equal(near.done(), false);
  const last = freeNets().find((n) => n.id === ids[53]);
  const step = near.fold(centerOnBoard(last.net, CUBOID_BOARDS.wide));
  assert.deepEqual([step.kind, step.dexCount, step.done, step.itemId], ['new', 54, true, `cuboid-dex:1:${ids[53]}`]);
  assert.equal(createCuboidFreeSession({ dex: true, found: ids }).done(), true);
});

test('힌트 그림자(크기를 바꾼 상자): 그 상자의 크기로 그린 아직 못 찾은 전개도이고 판 가운데에 들어간다. 이 기기에서 찾지 않은 것을 먼저', () => {
  const rng = createRng('cuboid-box-hint');
  for (const dims of ALL_DIMS) {
    const board = boxBoard(dims);
    const list = boxCatalog(dims).list;
    const device = new Set(rng.sample(list.map((n) => n.id), rng.int(0, list.length - 1)));
    const now = new Set(rng.sample(list.map((n) => n.id), rng.int(0, 2)));
    const hint = cuboidHintNet(now, board, device, dims);
    assert.ok(hint && !now.has(hint.id), `${dims}`);
    if ([...list].some((n) => !device.has(n.id) && !now.has(n.id))) assert.ok(!device.has(hint.id), `${dims}`);
    const rects = centerOnBoard(hint.net, board);
    assert.ok(rects.every((r) => r.x >= 0 && r.y >= 0 && r.x + r.w <= board.cols && r.y + r.h <= board.rows));
    assert.ok(wrapsBox(rects, dims), `${dims} 그림자는 그 상자의 전개도`);
    assert.equal(judgeCuboidFree({ rects, dims }).id, hint.id);
  }
});

test('상자 보기: 그 크기로 접히는 전개도이고 면 이름은 카드와 같다(가 나 = 가로×세로 …), 아랫면을 바닥에 둔다', () => {
  for (const dims of ALL_DIMS) {
    const net = boxSolidNet(dims);
    assert.equal(net.root, 'f1');
    assert.ok(checkNet(net).ok, `${dims}`);
    assert.deepEqual(net.faces.map((f) => f.label), ['가', '나', '다', '라', '마', '바']);
    const cards = boxCards(dims);
    for (const [i, f] of net.faces.entries()) {
      const xs = f.poly.map((p) => p[0]);
      const ys = f.poly.map((p) => p[1]);
      const [w, h] = [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)].map((v) => Math.round(v * 1e6) / 1e6);
      assert.deepEqual([Math.max(w, h), Math.min(w, h)], [cards[i].w, cards[i].h], `${dims} ${f.label}`);
    }
  }
});

// ── 점수(크기를 섞어서): 엔진 계산 ↔ 기획서 문장만 보고 짠 독립 계산 ─────────────────────────────
// (rewards.js · collection.js의 엔진 계산은 화면(cuboid-free.js)과 같은 차례로 부른다: 등록 → 접기 기록 → 까닭 설명)
const DEFS = normalizeCollections([
  { id: 'cube-nets', title: '전개도 도감', lesson: 'cube', items: CUBE_NETS.map((n) => ({ id: n.name, name: n.name })) }, // main.js의 정육면체 도감과 같은 칸
  ...CUBOID_COLLECTIONS,
]);
const countIn = (state, id) => Object.keys(state[id] ?? {}).length;

/** 한 기기(엔진): 판을 여러 번 한다. 모음 상태는 엔진의 collectItem, 점수는 createPlayReward · stageXp */
function createEngineDevice() {
  let state = normalizeCollectionState(null, DEFS);
  let stars = 0;
  let total = 0;
  return {
    play(folds, { finished = true } = {}) {
      const session = createCuboidFreeSession({
        found: Object.keys(state[CUBOID_NETS_ID]), foundPair: Object.keys(state[CUBOID_PAIR_NETS_ID]), foundCube: Object.keys(state['cube-nets']),
      });
      const play = createPlayReward({ startStars: stars });
      const earned = { answer: 0, nets: 0 };
      for (const f of folds) {
        session.setBox(f.dims);
        const step = session.fold(f.rects);
        let before = play.xp();
        let first = false;
        if (step.collect) {
          const r = collectItem(state, DEFS, step.collect.id, step.collect.item);
          if (r.isNew) {
            state = r.state;
            first = true;
            const def = DEFS.find((d) => d.id === step.collect.id);
            play.discovered(discoverXp(collectionXp(def, xpAfterCount(state, DEFS, def))));
          }
        }
        earned.nets += play.xp() - before;
        before = play.xp();
        const later = first && step.box !== 'cube' && countIn(state, CUBOID_NETS_ID) + countIn(state, CUBOID_PAIR_NETS_ID) > 10;
        assert.equal(first, step.first);
        assert.equal(later, step.later);
        if (step.log) play.answer({ itemId: step.itemId, correct: step.valid, scored: first && !later ? 'once' : false });
        earned.answer += play.xp() - before;
        if (step.explainable && f.explain !== 'skip') play.event('explain', { correct: f.explain === 'right', itemId: step.itemId });
        assert.equal(play.instant(), play.xp()); // 모두 그 자리에서 저장되는 몫
      }
      const found = session.found().size;
      const done = finished && found >= 2;
      let stage = 0;
      if (done) {
        const now = Math.max(stars, Math.min(3, found));
        stage = stageXp({ prevStars: stars, stars: now, cleared: true }).total;
        stars = now;
      }
      total += play.xp() + stage;
      return { xp: play.xp() + stage, play: play.xp(), stage, earned };
    },
    total: () => total,
    state: () => state,
  };
}

/**
 * 독립 계산 (기획서 문장만 보고): 이름은 독립 표(상자 종류 + 대칭으로 맞춘 나무), 안 되는 모양은 상자의 길이 묶음 + 모양 열쇠.
 *   - 이번 판에 이미 접은 모양: 아무 일도 없다
 *   - 이 기기에서 처음 찾은 직육면체 전개도(세 길이가 다른 것 + 두 길이가 같은 것을 합쳐 센다) 10가지까지: 등록 +5, 만들기 성공 +2, 그런 것을 연달아 3번마다 +1
 *   - 11번째부터: 모두 합쳐 +1 (연속에 넣지 않는다)
 *   - 정육면체 상자로 처음 찾은 전개도(정육면체 도감): 등록 +5, 만들기 성공 +2, 연속에 넣는다 (상한 없음 — 11가지뿐)
 *   - 찾아본 전개도 0점 · 안 되는 모양 0점(연속이 끊긴다)
 *   - 마치면(이번 판에 서로 다른 전개도 2가지 이상): 별 = 그 수(3까지). 처음 마칠 때 +5, 별이 는 만큼 +2씩
 */
function createModelDevice() {
  const seen = new Set();
  let cuboid = 0;
  let stars = 0;
  let total = 0;
  return {
    play(names, { finished = true } = {}) {
      const inPlay = new Set();
      const foundNow = new Set();
      let run = 0;
      let xp = 0;
      for (const name of names) {
        if (inPlay.has(name)) continue;
        inPlay.add(name);
        if (name.startsWith('x:')) {
          run = 0;
          continue;
        }
        foundNow.add(name);
        if (seen.has(name)) continue;
        seen.add(name);
        if (!name.startsWith('cube:')) {
          cuboid += 1;
          if (cuboid > 10) {
            xp += 1;
            continue;
          }
        }
        xp += 5 + 2;
        run += 1;
        if (run % 3 === 0) xp += 1;
      }
      let stage = 0;
      if (finished && foundNow.size >= 2) {
        const now = Math.min(3, foundNow.size);
        if (now > stars) {
          stage = (stars === 0 ? 5 : 0) + (now - stars) * 2;
          stars = now;
        }
      }
      total += xp + stage;
      return { xp: xp + stage, play: xp, stage };
    },
    total: () => total,
    found: () => seen.size,
  };
}

/** 무작위 접기 하나: 아무 크기의 상자에서 되는 전개도(아무 방향 · 아무 자리)나 안 되는 모양 → { dims, rects, name(독립 이름) } */
function randomFold(rng, { dims = rng.pick(ALL_DIMS), bad = 0.2 } = {}) {
  const unfolded = UNFOLDED.get(dims.join(','));
  const pick = rng.pick(unfolded);
  if (rng.next() >= bad) {
    return { dims, rects: placeAt(transformRects(pick.rects, rng.int(0, 7)), rng.int(0, 2), rng.int(0, 2)), name: treeSignature(pick.tree, dims) };
  }
  for (let guard = 0; guard < 50; guard += 1) {
    const rects = transformRects(pick.rects, rng.int(0, 7)).map((r) => ({ ...r }));
    const i = rng.int(0, 5);
    const moved = rects.splice(i, 1)[0];
    const [w, h] = rng.next() < 0.5 ? [moved.w, moved.h] : [moved.h, moved.w];
    const to = rng.pick(rects);
    const along = rng.int(to.x - w + 1, to.x + to.w - 1);
    rects.splice(i, 0, { x: along, y: to.y + to.h, w, h });
    const mx = Math.min(...rects.map((r) => r.x));
    const my = Math.min(...rects.map((r) => r.y));
    const shifted = rects.map((r) => ({ ...r, x: r.x - mx, y: r.y - my }));
    const clash = shifted.some((p, a) => shifted.some((q, b) => a < b && p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h));
    if (clash || wrapsBox(shifted, dims)) continue;
    const sorted = [...dims].sort((p, q) => p - q).join('x');
    return { dims, rects: shifted, name: `x:${sorted}:${shapeOf(shifted)}`, explain: rng.pick(['right', 'wrong', 'skip']) };
  }
  return randomFold(rng, { dims, bad: 0 });
}

test('점수(크기를 섞어서) — 무작위 1,500기기: 여러 판에 걸쳐 크기를 바꿔 가며 접은 점수(판마다, 쌓인 점수)가 독립 계산과 같다. 결과 칸의 합 = 판 점수', () => {
  const rng = createRng('cuboid-box-score');
  let plays = 0;
  let over10 = 0;
  let cubes = 0;
  for (let trial = 0; trial < 1500; trial += 1) {
    const engine = createEngineDevice();
    const model = createModelDevice();
    // 기기마다 쓰는 상자 몇 개(같은 상자를 다시 쓰면 같은 전개도가 자주 나온다)
    const boxes = rng.sample(ALL_DIMS, rng.int(1, 6));
    for (let n = rng.int(1, 6); n > 0; n -= 1) {
      const folds = Array.from({ length: rng.int(1, 12) }, () => randomFold(rng, { dims: rng.pick(boxes) }));
      const finished = rng.next() >= 0.25;
      const got = engine.play(folds, { finished });
      const want = model.play(folds.map((f) => f.name), { finished });
      assert.deepEqual([got.xp, got.play, got.stage], [want.xp, want.play, want.stage], `기기 ${trial} 판 ${plays}`);
      assert.equal(got.earned.answer + got.earned.nets, got.play);
      plays += 1;
    }
    assert.equal(engine.total(), model.total(), `기기 ${trial}`);
    const s = engine.state();
    if (countIn(s, CUBOID_NETS_ID) + countIn(s, CUBOID_PAIR_NETS_ID) > 10) over10 += 1;
    if (countIn(s, 'cube-nets') > 0) cubes += 1;
  }
  assert.ok(plays > 4000, String(plays));
  assert.ok(over10 > 300 && cubes > 150, `10가지를 넘긴 기기 ${over10} · 정육면체 상자를 접은 기기 ${cubes}`);
});

test('점수 상한의 경계(크기를 섞어서): 세 길이가 다른 것과 두 길이가 같은 것을 합쳐 10번째까지 +7, 11번째부터 +1 — 어떤 순서 · 어떤 판 나눔에서도 83가지 + 정육면체 11가지의 합은 늘 220점', () => {
  const rng = createRng('cuboid-box-cap');
  // 종류마다 전개도 하나씩을 그리는 나무(독립 표의 이름마다 첫 나무)
  const reps = new Map();
  for (const dims of [[3, 2, 1], [2, 2, 3], [4, 4, 4]]) {
    for (const u of UNFOLDED.get(dims.join(','))) {
      const name = treeSignature(u.tree, dims);
      if (!reps.has(name)) reps.set(name, { dims, rects: u.rects, name });
    }
  }
  assert.equal(reps.size, 54 + 29 + 11);
  const all = [...reps.values()];
  const totals = new Set();
  for (let trial = 0; trial < 200; trial += 1) {
    const engine = createEngineDevice();
    const model = createModelDevice();
    const order = rng.shuffle(all.slice());
    let base = 0;
    for (let at = 0; at < order.length;) {
      const take = rng.int(1, rng.pick([2, 5, 12, 40, 94]));
      const slice = order.slice(at, at + take).map((f) => ({ ...f, rects: placeAt(transformRects(f.rects, rng.int(0, 7)), rng.int(0, 1), rng.int(0, 1)) }));
      const finished = rng.next() < 0.6;
      const got = engine.play(slice, { finished });
      const want = model.play(slice.map((f) => f.name), { finished });
      assert.deepEqual([got.xp, got.play], [want.xp, want.play], `기기 ${trial}`);
      base += got.earned.nets;
      at += take;
    }
    // 등록 점수의 합: 처음 10가지 × 5 + 73가지 × 1 + 정육면체 11가지 × 5 = 178, 만들기 성공은 (10 + 11) × 2 = 42 → 220
    assert.equal(base, 10 * 5 + 73 * 1 + 11 * 5, `기기 ${trial}`);
    assert.equal(engine.total(), model.total());
    totals.add(engine.total());
    // 다 찾은 기기는 같은 것을 다시 접어도(크기를 바꿔도) 0점
    const again = engine.play(rng.sample(all, 5).map((f) => ({ ...f })), { finished: false });
    assert.equal(again.play, 0);
  }
  assert.ok(totals.size >= 3, [...totals].join());
});

test('일부러 틀려 얻는 것이 없고 되풀이해도 쌓이지 않는다(크기를 섞어서): 안 되는 모양을 빼면 늘 더 받거나 같고, 같은 판들을 다시 하면 0점 (무작위 1,000기기)', () => {
  const rng = createRng('cuboid-box-fair');
  for (let trial = 0; trial < 1000; trial += 1) {
    const boxes = rng.sample(ALL_DIMS, rng.int(1, 4));
    const plays = Array.from({ length: rng.int(1, 4) }, () => Array.from({ length: rng.int(2, 9) }, () => randomFold(rng, { dims: rng.pick(boxes), bad: 0.35 })));
    const messy = createEngineDevice();
    const clean = createEngineDevice();
    for (const folds of plays) {
      messy.play(folds, { finished: false });
      clean.play(folds.filter((f) => !f.name.startsWith('x:')), { finished: false });
    }
    assert.ok(clean.total() >= messy.total(), `기기 ${trial}: ${clean.total()} < ${messy.total()}`);
    const before = messy.total();
    for (const folds of plays) messy.play(folds.map((f) => ({ ...f, rects: placeAt(f.rects, 1, 1) })), { finished: false });
    assert.equal(messy.total(), before, `기기 ${trial}`);
  }
});

test('옛 저장 값: 지금까지 사이트에서 쌓은 직육면체 전개도 모음(cuboid-nets, 123-01 …)은 저장 열쇠·칸 id가 그대로라 새 모음 정의로 읽어도 그대로 남는다', () => {
  const old = { 'cube-nets': { '1-4-1a': { at: 1, stage: 'cube-free' } }, 'cuboid-nets': Object.fromEntries(freeNets().slice(0, 12).map((n) => [n.id, { at: 2, stage: 'cuboid-free' }])) };
  const state = normalizeCollectionState(old, DEFS);
  assert.equal(countIn(state, CUBOID_NETS_ID), 12);
  assert.equal(countIn(state, CUBOID_PAIR_NETS_ID), 0);
  assert.deepEqual(state['cube-nets'], old['cube-nets']);
  // 12가지를 찾아 둔 기기: 두 길이가 같은 상자의 첫 전개도는 13번째라 +1
  const def = DEFS.find((d) => d.id === CUBOID_PAIR_NETS_ID);
  const r = collectItem(state, DEFS, CUBOID_PAIR_NETS_ID, pairNetIdAt(0));
  assert.equal(xpAfterCount(r.state, DEFS, def), 13);
  assert.equal(discoverXp(collectionXp(def, xpAfterCount(r.state, DEFS, def))), 1);
  assert.deepEqual(DEFS.find((d) => d.id === CUBOID_NETS_ID).items.map((i) => i.id), freeNets().map((n) => n.id));
  assert.equal(DEFS.find((d) => d.id === CUBOID_NETS_ID).report, true); // 결과 복사 문장에 "직육면체 전개도 n/54"
});

test('판이 좁을 때의 안내(M3-5): 보통 판은 64가지 모두 안내가 없고, 휴대폰 판은 들어가는 전개도가 없으면 고를 수 없다(4 × 4 × 4 · 3 × 4 × 4 꼴), 일부만 들어가면 그 가짓수 — 독립 계산(직사각형이 판에 들어가는지)과 같다', () => {
  let blocked = 0;
  let partial = 0;
  for (const dims of ALL_DIMS) {
    assert.equal(boxBoardNotice(dims, boxBoard(dims)), null, `${dims}`);
    const board = boxBoard(dims, { phone: true });
    const shapes = UNFOLDED.get(dims.join(','));
    // 독립 계산: 그 상자의 서로 다른 모양마다, 8가지로 돌리거나 뒤집어 판(cols × rows)에 들어가는 것이 있나
    const byShape = new Map(shapes.map((u) => [shapeOf(u.rects), u.rects]));
    const fit = [...byShape.values()].filter((rects) => Array.from({ length: 8 }, (_, k) => transformRects(rects, k)).some((r) => Math.max(...r.map((q) => q.x + q.w)) <= board.cols && Math.max(...r.map((q) => q.y + q.h)) <= board.rows)).length;
    const notice = boxBoardNotice(dims, board);
    if (fit === byShape.size) assert.equal(notice, null, `${dims}`);
    else if (fit === 0) {
      blocked += 1;
      assert.deepEqual(notice, { text: '이 화면의 판에는 이 상자의 전개도가 들어가지 않아요. 더 작은 상자를 골라요.', block: true }, `${dims}`);
    } else {
      partial += 1;
      assert.deepEqual(notice, { text: `이 화면의 판에는 이 상자의 전개도 ${byShape.size}가지 가운데 ${fit}가지만 들어가요.`, block: false }, `${dims}`);
    }
  }
  assert.equal(boxBoardNotice([4, 4, 4], boxBoard([4, 4, 4], { phone: true })).block, true);
  assert.equal(boxBoardNotice([3, 4, 4], boxBoard([3, 4, 4], { phone: true })).block, true);
  assert.ok(blocked > 0 && partial > 0, `${blocked} · ${partial}`);
});
