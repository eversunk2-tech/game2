/**
 * 직육면체의 전개도 차시: 접기 판정(fold.js)과 문항(cuboid-logic.js).
 * 판정은 fold.js를 쓰지 않는 독립 계산 두 가지와 견준다:
 *   - 굴려 찍기: 상자를 평면 위에서 굴려 바닥에 닿은 면을 찍어 전개도를 모두 만든다(서로 다른 것 54가지)
 *   - 감싸기: 놓인 직사각형을 맞닿은 변에서 직각으로 꺾어 상자에 붙여 보고, 여섯 면을 꼭 맞게 한 번씩 덮는지 본다
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRng } from '../../src/shared/core/random.js';
import {
  VERTEX_NAMES,
  checkNet,
  cuboid,
  faceRect,
  findHinges,
  foldNet,
  fromRects,
  fullVertices,
  isConnected,
  isFullHinge,
  matchingEdge,
  missingSlots,
  netKey,
  netSize,
  oppositeFace,
  outline,
  shapeKey,
  solidEdges,
  solidStats,
  spanningTrees,
  transformNet,
  unfold,
  unpairedFaces,
} from '../../src/games/net-workshop/fold.js';
import {
  CUBOID_JUDGE_REASONS,
  CUBOID_TAG_OF_PROBLEM,
  NET_FIT,
  QUESTION_BOXES,
  SLOT_DEPTH,
  cardNet,
  cuboidNets,
  cuboidReasonOf,
  cuboidReasons,
  explainCuboidProblem,
  judgeCard,
  judgeCuboidAnswer,
  judgeCuboidReason,
  judgeEdge,
  meetingPairs,
  primaryCuboidProblem,
} from '../../src/games/net-workshop/cuboid-logic.js';
import { CUBOID_LESSON, CUBOID_STAGES, CUBOID_TAGS } from '../../src/games/net-workshop/cuboid-stages.js';
import { LESSONS, STAGES, TAGS, makeQuestions } from '../../src/games/net-workshop/logic.js';
import { CUBE_NETS } from '../../src/games/net-workshop/nets-data.js';

const stage = (id) => STAGES.find((s) => s.id === id);
const SEEDS = Array.from({ length: 200 }, (_, i) => i);
const BOXES = [[1, 2, 3], [2, 3, 4], [2, 3, 5], [2, 4, 5]];

// ── 독립 계산 ① 굴려 찍기 ─────────────────────────────
const overlap = (p, q) => Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x) > 1e-9 && Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y) > 1e-9;

/** 직사각형 묶음의 모양 열쇠(돌리기·뒤집기 8가지 가운데 가장 작은 글자열) — fold.js의 netKey와 따로 짠 것 */
function rectsKey(rects) {
  const moves = [
    (r) => r, (r) => ({ x: -r.x - r.w, y: r.y, w: r.w, h: r.h }), (r) => ({ x: r.x, y: -r.y - r.h, w: r.w, h: r.h }), (r) => ({ x: -r.x - r.w, y: -r.y - r.h, w: r.w, h: r.h }),
    (r) => ({ x: r.y, y: r.x, w: r.h, h: r.w }), (r) => ({ x: -r.y - r.h, y: r.x, w: r.h, h: r.w }), (r) => ({ x: r.y, y: -r.x - r.w, w: r.h, h: r.w }), (r) => ({ x: -r.y - r.h, y: -r.x - r.w, w: r.h, h: r.w }),
  ];
  let best = null;
  for (const move of moves) {
    const moved = rects.map(move);
    const mx = Math.min(...moved.map((r) => r.x));
    const my = Math.min(...moved.map((r) => r.y));
    const text = moved.map((r) => [r.x - mx, r.y - my, r.w, r.h].join(',')).sort().join(';');
    if (best == null || text < best) best = text;
  }
  return best;
}

/**
 * 상자 [a, b, c]를 평면 위에서 굴려 만든 전개도 모두(면 여섯 개를 한 번씩 찍은 것). 자세는 세계 축 x · y · z가 상자의 어느 축(±)인지로 적는다.
 * → 모양 열쇠(rectsKey) → 직사각형 묶음
 */
function rolledNets(dims) {
  const start = { wx: [0, 1], wy: [1, 1], wz: [2, 1], x: 0, y: 0 };
  const sizeOf = (pose) => ({ w: dims[pose.wx[0]], h: dims[pose.wy[0]], d: dims[pose.wz[0]] });
  const rectOf = (pose) => ({ x: pose.x, y: pose.y, w: sizeOf(pose).w, h: sizeOf(pose).h });
  const bottomOf = (pose) => `${pose.wz[0]}${pose.wz[1] > 0 ? '-' : '+'}`; // 세계 −z를 보는 상자의 면
  const neg = ([axis, sign]) => [axis, -sign];
  const rolls = (pose) => {
    const { w, h, d } = sizeOf(pose);
    return [
      { ...pose, wx: pose.wz, wz: neg(pose.wx), x: pose.x + w }, // 동쪽으로: 위를 보던 쪽이 동쪽을 본다
      { ...pose, wx: neg(pose.wz), wz: pose.wx, x: pose.x - d },
      { ...pose, wy: pose.wz, wz: neg(pose.wy), y: pose.y + h },
      { ...pose, wy: neg(pose.wz), wz: pose.wy, y: pose.y - d },
    ];
  };
  const done = new Map();
  const seen = new Set();
  const walk = (stamps) => {
    const key = [...stamps.values()].map((s) => `${bottomOf(s)}@${s.x},${s.y}`).sort().join('|');
    if (seen.has(key)) return;
    seen.add(key);
    if (stamps.size === 6) {
      const rects = [...stamps.values()].map(rectOf);
      done.set(rectsKey(rects), rects);
      return;
    }
    for (const pose of [...stamps.values()]) {
      for (const next of rolls(pose)) {
        const face = bottomOf(next);
        if (stamps.has(face)) continue;
        assert.ok(![...stamps.values()].some((s) => overlap(rectOf(s), rectOf(next))), '찍은 면끼리 겹치지 않는다');
        walk(new Map([...stamps, [face, next]]));
      }
    }
  };
  walk(new Map([[bottomOf(start), start]]));
  return done;
}

// ── 독립 계산 ② 감싸기 ─────────────────────────────
const add3 = (a, b) => a.map((v, i) => v + b[i]);
const mul3 = (a, k) => a.map((v) => v * k);
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const tidy3 = (p) => p.map((v) => Math.round(v * 1e6) / 1e6 + 0).join(',');

/**
 * 놓인 직사각형들이 상자 dims의 전개도인가 (fold.js를 쓰지 않는다).
 * 첫 면을 상자의 윗면에 올리고, 변으로 맞닿은 면을 그 변에서 직각으로 꺾어 3D 자리를 정한다(면은 휘지 않는다).
 * 여섯 면이 상자의 여섯 면과 꼭짓점까지 꼭 맞게 하나씩이면 전개도다.
 */
function wrapsBox(rects, dims) {
  if (rects.length !== 6) return false;
  const [first] = rects;
  const rest = [...dims];
  for (const side of [first.w, first.h]) {
    const i = rest.indexOf(side);
    if (i < 0) return false;
    rest.splice(i, 1);
  }
  const depth = rest[0];
  // 면의 틀: 왼쪽 위 꼭짓점의 3D 자리 o, 면의 +x · +y 방향 ux · uy (바깥 법선 = ux × uy)
  const frames = new Array(rects.length).fill(null);
  frames[0] = { o: [0, 0, 0], ux: [1, 0, 0], uy: [0, 1, 0] };
  const queue = [0];
  while (queue.length > 0) {
    const i = queue.shift();
    const a = rects[i];
    const { o, ux, uy } = frames[i];
    const n = cross3(ux, uy);
    rects.forEach((b, j) => {
      if (frames[j]) return;
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      let frame = null;
      if (b.x === a.x + a.w && oy > 0) frame = { o: add3(add3(o, mul3(ux, a.w)), mul3(uy, b.y - a.y)), ux: mul3(n, -1), uy }; // 오른쪽 이웃: 아래로 꺾인다
      else if (b.x + b.w === a.x && oy > 0) frame = { o: add3(add3(o, mul3(uy, b.y - a.y)), mul3(n, -b.w)), ux: n, uy };
      else if (b.y === a.y + a.h && ox > 0) frame = { o: add3(add3(o, mul3(uy, a.h)), mul3(ux, b.x - a.x)), ux, uy: mul3(n, -1) };
      else if (b.y + b.h === a.y && ox > 0) frame = { o: add3(add3(o, mul3(ux, b.x - a.x)), mul3(n, -b.h)), ux, uy: n };
      if (!frame) return;
      frames[j] = frame;
      queue.push(j);
    });
  }
  if (frames.some((f) => !f)) return false; // 떨어진 면
  const corners = (r, f) => [[0, 0], [r.w, 0], [r.w, r.h], [0, r.h]].map(([x, y]) => tidy3(add3(add3(f.o, mul3(f.ux, x)), mul3(f.uy, y)))).sort().join(' ');
  // 상자: 첫 면이 윗면(z = 0), 아래로 depth
  const [w, h] = [first.w, first.h];
  const box = [
    [[0, 0, 0], [w, 0, 0], [w, h, 0], [0, h, 0]],
    [[0, 0, -depth], [w, 0, -depth], [w, h, -depth], [0, h, -depth]],
    [[0, 0, 0], [w, 0, 0], [w, 0, -depth], [0, 0, -depth]],
    [[0, h, 0], [w, h, 0], [w, h, -depth], [0, h, -depth]],
    [[0, 0, 0], [0, h, 0], [0, h, -depth], [0, 0, -depth]],
    [[w, 0, 0], [w, h, 0], [w, h, -depth], [w, 0, -depth]],
  ].map((face) => face.map(tidy3).sort().join(' '));
  const got = rects.map((r, i) => corners(r, frames[i]));
  return new Set(got).size === 6 && got.every((c) => box.includes(c));
}

const rectsOf = (net) => net.faces.map(faceRect);
const judge = (rects, dims) => checkNet(fromRects(rects, { dims })).ok;

// ── 입체를 펼친 전개도 ─────────────────────────────
test('직육면체의 서로 다른 전개도: 세 모서리가 다르면 54가지, 두 모서리가 같으면 29가지, 정육면체는 11가지 (384가지 신장 트리를 모두 펼침)', () => {
  for (const [dims, count] of [[[1, 2, 3], 54], [[2, 3, 4], 54], [[2, 3, 5], 54], [[2, 4, 5], 54], [[3, 4, 5], 54], [[1, 1, 2], 29], [[1, 2, 2], 29], [[1, 1, 1], 11]]) {
    const solid = cuboid(...dims);
    assert.equal(solidEdges(solid).length, 12);
    const trees = spanningTrees(solid);
    assert.equal(trees.length, 384);
    assert.equal(cuboidNets(dims).length, count, dims.join('×'));
    assert.equal(new Set(cuboidNets(dims).map((n) => n.id)).size, count);
  }
  // 정육면체를 펼친 11가지 = CUBE_NETS(격자 칸 자료)의 11가지
  const cells = (net) => rectsOf(net).map((r) => [r.x, r.y]);
  assert.deepEqual(new Set(cuboidNets([1, 1, 1]).map((n) => shapeKey(cells(n.net)))), new Set(CUBE_NETS.map((n) => shapeKey(n.cells))));
});

test('펼친 전개도 384 × 4가지 상자: 모두 접히고(checkNet), 면끼리 겹치지 않고, 맞닿은 곳은 꼭 맞는 경첩 5개뿐이며, 접으면 V − E + F = 2', () => {
  let checked = 0;
  for (const dims of BOXES) {
    const solid = cuboid(...dims);
    for (const tree of spanningTrees(solid)) {
      const net = unfold(solid, tree);
      const rects = rectsOf(net);
      for (let i = 0; i < 6; i += 1) for (let j = i + 1; j < 6; j += 1) assert.ok(!overlap(rects[i], rects[j]));
      const hinges = findHinges(net);
      assert.equal(hinges.length, 5); // 되는 전개도에는 우연히 맞닿은 곳이 없다(맞닿은 곳 = 접는 선)
      assert.ok(hinges.every((hg) => isFullHinge(net, hg)));
      assert.deepEqual(checkNet(net), { ok: true, problems: [] });
      assert.deepEqual(fullVertices(net), []);
      assert.deepEqual(unpairedFaces(net), []);
      assert.deepEqual(missingSlots(net), []);
      const folded = foldNet(net, 1);
      assert.deepEqual(solidStats(folded), { V: 8, E: 12, F: 6 });
      // 마주 보는 면은 합동이고 세 쌍이다
      for (const f of net.faces) {
        const other = net.faces.find((g) => g.id === oppositeFace(net, f.id));
        assert.ok(other && other.id !== f.id);
        assert.deepEqual([faceRect(f).w, faceRect(f).h].sort(), [faceRect(other).w, faceRect(other).h].sort());
      }
      checked += 1;
    }
  }
  assert.equal(checked, 384 * BOXES.length);
});

test('독립 계산(굴려 찍기)과 같다: 상자를 굴려 찍은 전개도도 54가지이고, 펼친 54가지와 모양이 하나하나 같다', () => {
  for (const dims of BOXES) {
    const rolled = rolledNets(dims);
    assert.equal(rolled.size, 54, dims.join('×'));
    const unfolded = new Set(cuboidNets(dims).map((n) => rectsKey(rectsOf(n.net))));
    assert.deepEqual(new Set(rolled.keys()), unfolded, dims.join('×'));
    // netKey(fold.js)와 rectsKey(테스트)가 같은 묶음으로 나눈다
    assert.equal(new Set(cuboidNets(dims).map((n) => n.key)).size, 54);
    for (const rects of rolled.values()) assert.ok(judge(rects, dims) && wrapsBox(rects, dims));
  }
  assert.equal(rolledNets([1, 1, 2]).size, 29);
  assert.equal(rolledNets([1, 1, 1]).size, 11);
});

test('전개도 54가지 × 돌리기·뒤집기 8가지: 판정이 같고(모두 전개도) 열쇠가 같다', () => {
  for (const dims of [[1, 2, 3], [2, 3, 5]]) {
    for (const item of cuboidNets(dims)) {
      for (let k = 0; k < 8; k += 1) {
        const moved = transformNet(item.net, k);
        assert.equal(netKey(moved), item.key);
        assert.ok(checkNet(moved).ok);
        assert.ok(wrapsBox(rectsOf(moved), dims));
      }
    }
  }
});

/** 전개도의 한 면을 다른 자리로 옮기거나 돌리거나 크기를 바꾼 모든 배치 (격자 위, 다른 면과 겹치지 않게) */
function* oneFaceMoves(net) {
  const rects = rectsOf(net);
  const [w, h] = netSize(net);
  for (let i = 0; i < rects.length; i += 1) {
    const sizes = [[rects[i].w, rects[i].h], [rects[i].h, rects[i].w], [rects[i].w + 1, rects[i].h], [rects[i].w, rects[i].h + 1]];
    for (const [rw, rh] of sizes) {
      for (let x = -rw; x <= w; x += 1) {
        for (let y = -rh; y <= h; y += 1) {
          const moved = { x, y, w: rw, h: rh };
          if (rects.some((r, j) => j !== i && overlap(r, moved))) continue;
          yield rects.map((r, j) => (j === i ? moved : r));
        }
      }
    }
  }
}

test('독립 계산(감싸기)과 checkNet이 같은 판정: 54가지의 한 면을 옮기고 · 돌리고 · 늘인 모든 배치와 무작위 배치 (불일치 0)', () => {
  let total = 0;
  let valid = 0;
  const types = new Map();
  const dims = [1, 2, 3];
  for (const item of cuboidNets(dims)) {
    for (const rects of oneFaceMoves(item.net)) {
      const { ok, problems } = checkNet(fromRects(rects, { dims }));
      assert.equal(ok, wrapsBox(rects, dims), JSON.stringify(rects));
      total += 1;
      if (ok) valid += 1;
      else for (const type of new Set(problems.map((p) => p.type))) types.set(type, (types.get(type) ?? 0) + 1);
    }
  }
  // 다른 상자는 표본으로
  const rng = createRng('cuboid-wrap');
  for (const box of [[2, 3, 4], [2, 3, 5]]) {
    for (const item of rng.sample(cuboidNets(box), 12)) {
      for (const rects of oneFaceMoves(item.net)) {
        assert.equal(judge(rects, box), wrapsBox(rects, box), JSON.stringify(rects));
        total += 1;
      }
    }
  }
  // 무작위: 면 카드 6장을 12 × 8 판에 아무렇게나(겹치지 않게)
  for (let trial = 0; trial < 4000; trial += 1) {
    const rects = [];
    for (const [cw, ch] of [[3, 2], [3, 2], [3, 1], [3, 1], [2, 1], [2, 1]]) {
      for (let guard = 0; guard < 50; guard += 1) {
        const [rw, rh] = rng.next() < 0.5 ? [cw, ch] : [ch, cw];
        const r = { x: rng.int(0, 7 - rw), y: rng.int(0, 6 - rh), w: rw, h: rh };
        if (rects.some((q) => overlap(q, r))) continue;
        rects.push(r);
        break;
      }
    }
    if (rects.length < 6) continue;
    assert.equal(judge(rects, dims), wrapsBox(rects, dims), JSON.stringify(rects));
    total += 1;
  }
  assert.ok(total > 60000 && valid > 200, `견준 배치 ${total}개 · 그 가운데 전개도 ${valid}개`);
  // 안 되는 배치에서 나온 까닭의 종류가 모두 있다
  for (const type of ['disconnected', 'vertex-full', 'overlap', 'face-pair', 'edge-length', 'gap']) assert.ok(types.get(type) > 0, type);
});

test('부분 겹침 경첩: 붙은 두 변의 길이가 다르면 edge-length(hinge) — 두 변과 길이를 짚고, 어긋나게 붙으면 shifted. 한 면의 크기를 바꾸면 face-pair', () => {
  const dims = [2, 3, 4];
  // 옆면 네 장(높이 4, 가로 2·3·2·3)을 한 줄로, 위·아래 면(2 × 3)을 첫 옆면의 위와 아래에
  const base = [{ x: 0, y: 3, w: 2, h: 4 }, { x: 2, y: 3, w: 3, h: 4 }, { x: 5, y: 3, w: 2, h: 4 }, { x: 7, y: 3, w: 3, h: 4 }, { x: 0, y: 0, w: 2, h: 3 }, { x: 0, y: 7, w: 2, h: 3 }];
  assert.ok(judge(base, dims));
  // 윗면을 90° 돌려 붙임: 3 cm인 변이 2 cm인 변에 붙는다(왼쪽으로 1 cm 튀어나온다)
  const turned = base.map((r, i) => (i === 4 ? { x: -1, y: 1, w: 3, h: 2 } : r));
  const net = fromRects(turned, { dims });
  const { ok, problems } = checkNet(net);
  assert.equal(ok, false);
  const hinge = problems.find((p) => p.type === 'edge-length' && p.hinge);
  assert.deepEqual([...hinge.lengths].sort(), [2, 3]);
  assert.equal(hinge.shifted, false);
  assert.deepEqual(hinge.faces.slice().sort(), ['f0', 'f4']);
  for (const e of hinge.edges) {
    const face = net.faces.find((f) => f.id === e.face);
    const [p, q] = [face.poly[e.edge], face.poly[(e.edge + 1) % 4]];
    assert.equal(Math.hypot(q[0] - p[0], q[1] - p[1]), hinge.lengths[hinge.edges.indexOf(e)]);
  }
  assert.equal(problems.some((p) => p.type === 'face-pair' || p.type === 'overlap'), false);
  assert.equal(primaryCuboidProblem(problems), hinge);
  assert.equal(explainCuboidProblem(net, hinge), '가 면과 마 면이 붙은 두 변의 길이가 2 cm와 3 cm로 달라요. 맞닿는 모서리는 길이가 같아야 해요.');
  // 길이는 같은데 1 cm 어긋나게 붙임
  const shifted = checkNet(fromRects(base.map((r, i) => (i === 4 ? { ...r, x: -1 } : r)), { dims })).problems.find((p) => p.type === 'edge-length' && p.hinge);
  assert.equal(shifted.shifted, true);
  // 윗면을 1 cm 늘임: 짝 없는 면 + 접어서 만나는 선분의 길이가 다름(붙은 변은 꼭 맞는다)
  const longer = checkNet(fromRects(base.map((r, i) => (i === 4 ? { x: 0, y: -1, w: 2, h: 4 } : r)), { dims })).problems;
  assert.deepEqual(longer.find((p) => p.type === 'face-pair').faces, ['f4']);
  assert.ok(longer.some((p) => p.type === 'edge-length' && !p.hinge));
  assert.equal(longer.some((p) => p.type === 'edge-length' && p.hinge), false);
  assert.equal(primaryCuboidProblem(longer).type, 'face-pair');
  // 위·아래 면을 같은 쪽에: 겹침 + 빈 자리 하나
  const same = fromRects(base.map((r, i) => (i === 5 ? { x: 5, y: 0, w: 2, h: 3 } : r)), { dims });
  assert.deepEqual(checkNet(same).problems.map((p) => p.type).sort(), ['gap', 'overlap']);
  assert.equal(missingSlots({ ...same, root: 'f1' }).length, 1);
  // 다른 면의 변 한가운데에 꼭짓점이 놓여 한 점을 빈틈없이 둘러쌈(ㅜ 꼴): 접을 수 없다
  const tee = fromRects([{ x: 0, y: 0, w: 4, h: 2 }, { x: 0, y: 2, w: 2, h: 3 }, { x: 2, y: 2, w: 2, h: 3 }, { x: 4, y: 0, w: 3, h: 4 }, { x: 7, y: 0, w: 3, h: 4 }, { x: 0, y: 5, w: 2, h: 4 }], { dims });
  assert.ok(checkNet(tee).problems.some((p) => p.type === 'vertex-full'));
  assert.equal(fullVertices(tee).some((v) => v.point[0] === 2 && v.point[1] === 2 && v.faces.length === 3), true);
});

// ── 테두리와 만나는 선분 ─────────────────────────────
test('테두리: 전개도 54가지 모두 꼭짓점 14개에 ㄱ~ㅎ, 맨 위 줄 가장 왼쪽에서 시작해 화면에서 시계 반대 방향, 선분 14개는 저마다 한 면의 한 변', () => {
  assert.deepEqual(VERTEX_NAMES.join(''), 'ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ');
  for (const dims of [[1, 2, 3], [2, 3, 4]]) {
    for (const { net, id } of cuboidNets(dims)) {
      for (let k = 0; k < 8; k += 1) {
        const moved = transformNet(net, k);
        const { vertices, segments } = outline(moved);
        assert.deepEqual(vertices.map((v) => v.name), VERTEX_NAMES, id);
        assert.equal(segments.length, 14);
        // 시작: 맨 위 줄(y가 가장 작은 줄)의 가장 왼쪽
        const top = Math.min(...vertices.map((v) => v.point[1]));
        assert.equal(vertices[0].point[1], top);
        assert.equal(vertices[0].point[0], Math.min(...vertices.filter((v) => v.point[1] === top).map((v) => v.point[0])));
        // 화면(y가 아래로)에서 시계 반대 방향 = 신발끈 넓이가 음수
        let area = 0;
        vertices.forEach((v, i) => {
          const next = vertices[(i + 1) % 14].point;
          area += v.point[0] * next[1] - next[0] * v.point[1];
        });
        assert.ok(area < 0, id);
        assert.equal(Math.abs(area) / 2, 2 * (dims[0] * dims[1] + dims[1] * dims[2] + dims[0] * dims[2])); // 테두리 안 넓이 = 겉넓이
        // 바깥 방향: 꼭짓점에서 그쪽으로 조금 가면 어느 면 안도 아니다
        const rects = rectsOf(moved);
        for (const v of vertices) {
          const probe = [v.point[0] + v.out[0] * 0.01, v.point[1] + v.out[1] * 0.01];
          assert.ok(!rects.some((r) => probe[0] > r.x && probe[0] < r.x + r.w && probe[1] > r.y && probe[1] < r.y + r.h), `${id} ${v.name}`);
          assert.ok(Math.abs(Math.hypot(...v.out) - 1) < 1e-6);
        }
        for (const [i, s] of segments.entries()) {
          const face = moved.faces.find((f) => f.id === s.face);
          const ends = [face.poly[s.edge], face.poly[(s.edge + 1) % 4]].map((p) => p.join(',')).sort();
          assert.deepEqual([vertices[s.from].point, vertices[s.to].point].map((p) => p.join(',')).sort(), ends);
          const [a, b] = [VERTEX_NAMES[i], VERTEX_NAMES[(i + 1) % 14]];
          assert.equal(s.name, i === 13 ? `${b}${a}` : `${a}${b}`); // 앞선 글자부터 (마지막 선분은 ㄱㅎ)
        }
      }
    }
  }
});

test('만나는 선분: 테두리 선분 14개는 7쌍이고 서로 짝이며 길이가 같다. 입체에서 자른 모서리(독립 계산)와 같은 짝이다 — 384가지 × 3가지 상자', () => {
  for (const dims of [[1, 2, 3], [2, 3, 4], [2, 4, 5]]) {
    const solid = cuboid(...dims);
    const edges = solidEdges(solid);
    for (const tree of spanningTrees(solid, edges)) {
      const net = unfold(solid, tree);
      const { segments } = outline(net);
      const pairs = meetingPairs(net, segments);
      const idOf = new Map(net.faces.map((f) => [f.solid, f.id]));
      const at = (face, edge) => segments.findIndex((s) => s.face === face && s.edge === edge);
      // 독립 계산: 펼칠 때 자른 모서리(트리에 없는 모서리)의 양쪽 변이 접으면 다시 만난다
      const cuts = edges.filter((e) => !tree.includes(e));
      assert.equal(cuts.length, 7);
      for (const cut of cuts) {
        const [i, j] = [at(idOf.get(cut.a), cut.ea), at(idOf.get(cut.b), cut.eb)];
        assert.ok(i >= 0 && j >= 0);
        assert.equal(pairs[i], j);
        assert.equal(pairs[j], i);
        assert.equal(segments[i].length, segments[j].length);
        assert.deepEqual(matchingEdge(net, segments[i].face, segments[i].edge), { face: segments[j].face, edge: segments[j].edge });
      }
      assert.equal(new Set(pairs).size, 14);
    }
  }
});

// ── 단계와 문항 ─────────────────────────────
test('직육면체 차시: 정육면체 차시 다음에 오고, 일반 4단계(만나는 선분 5 · 알맞은 면 4 · 길이까지 살펴요 5 · 내 맘대로 전개도), tag는 기획서 오개념 표의 말', () => {
  assert.deepEqual(LESSONS.map((l) => l.id).slice(0, 2), ['cube', 'cuboid']);
  assert.deepEqual(LESSONS[1], CUBOID_LESSON);
  const mine = STAGES.filter((s) => s.lesson === 'cuboid');
  assert.deepEqual(mine, CUBOID_STAGES);
  assert.deepEqual(mine.map((s) => [s.id, s.kind, s.count, Boolean(s.challenge)]), [
    ['cuboid-edge', 'edge', 5, false], ['cuboid-face', 'face', 4, false], ['cuboid-judge', 'cjudge', 5, false], ['cuboid-free', 'cfree', 2, false],
  ]);
  assert.deepEqual(mine.map((s) => s.order), ['짝 찾기 주문', '수선 주문', '검사 주문', '설계 주문']);
  assert.equal(new Set(STAGES.map((s) => s.id)).size, STAGES.length);
  // 직접 만드는 단계의 목표 문장에는 "예상"이 없다 (spec 16-12)
  assert.doesNotMatch(mine[3].goal, /예상|예측/);
  // 차시 파일이 따로 적어 둔 tag가 logic.js의 TAGS와 글자까지 같다
  for (const [key, value] of Object.entries(CUBOID_TAGS)) assert.equal(TAGS[key], value, key);
  for (const tag of Object.values(CUBOID_TAG_OF_PROBLEM)) assert.ok(Object.values(TAGS).includes(tag), tag);
});

test('같은 시드면 같은 문항, 다른 시드면 대체로 다른 문항 (직육면체 차시)', () => {
  const summary = (qs) => JSON.stringify(qs.map((q) => [q.itemId, q.net.faces.map((f) => [f.label, f.poly])]));
  assert.deepEqual(makeQuestions(stage('cuboid-free'), createRng('1:x')), []);
  for (const id of ['cuboid-edge', 'cuboid-face', 'cuboid-judge']) {
    assert.equal(summary(makeQuestions(stage(id), createRng('1:x'))), summary(makeQuestions(stage(id), createRng('1:x'))), id);
    const many = new Set(SEEDS.slice(0, 40).map((seed) => summary(makeQuestions(stage(id), createRng(seed)))));
    assert.ok(many.size > 35, id);
  }
});

const noBadWords = (text, label) => assert.doesNotMatch(text, /undefined|NaN|null|\?/, `${label}: ${text}`);

test('만나는 선분 5문항: 짝이 바로 옆 선분이 아니고, 보기 4개에 정답 하나 · 바로 옆 선분 · 길이가 같은 선분이 꼭 있다. 채점·까닭 문장·tag', () => {
  const kinds = new Map();
  const answerAt = [0, 0, 0, 0];
  for (const seed of SEEDS) {
    const qs = makeQuestions(stage('cuboid-edge'), createRng(seed));
    assert.equal(qs.length, 5);
    assert.equal(new Set(qs.map((q) => q.name)).size, 5); // 전개도가 모두 다르다
    for (const q of qs) {
      assert.ok(QUESTION_BOXES.some((b) => b.join() === q.dims.join()));
      const [w, h] = netSize(q.net);
      assert.ok(w >= h && w <= NET_FIT[0] && h <= NET_FIT[1], q.itemId);
      assert.ok(checkNet(q.net).ok && wrapsBox(rectsOf(q.net), q.dims));
      assert.equal(q.pairs[q.target], q.answer);
      // 짝은 테두리에서 떨어져 있다(꼭짓점을 함께 쓰지 않는다)
      const gap = Math.abs(q.target - q.answer);
      assert.ok(gap > 1 && gap < 13, q.itemId);
      assert.equal(q.options.length, 4);
      assert.equal(new Set(q.options.map((o) => o.index)).size, 4);
      assert.deepEqual(q.options.map((o) => o.index), q.options.map((o) => o.index).slice().sort((a, b) => a - b)); // 테두리 순서
      assert.equal(q.options.filter((o) => o.kind === 'answer').length, 1);
      assert.ok(q.options.some((o) => o.kind === 'near'), q.itemId);
      // 길이가 같은 오답 보기가 늘 있다: "길이가 같은 선분"만 찾아서는 맞힐 수 없다
      assert.ok(q.options.some((o) => o.kind === 'same'), q.itemId);
      answerAt[q.options.findIndex((o) => o.kind === 'answer')] += 1;
      assert.ok(!q.options.some((o) => o.index === q.target));
      const T = q.segments[q.target].name;
      for (const o of q.options) {
        kinds.set(o.kind, (kinds.get(o.kind) ?? 0) + 1);
        assert.equal(o.name, q.segments[o.index].name);
        const r = judgeEdge(q, o.index);
        noBadWords(r.message, q.itemId);
        assert.equal(r.correct, o.index === q.answer);
        assert.equal(r.expected, `선분 ${q.segments[q.answer].name}`);
        assert.equal(r.tag, r.correct ? null : '만나는 선분');
        assert.ok(r.message.includes(`선분 ${T}`));
        if (r.correct) assert.equal(r.message, `맞아요! 접으면 선분 ${T}과 선분 ${o.name}이 만나 한 모서리가 돼요.`);
        else {
          assert.ok(r.message.includes(`선분 ${q.segments[q.pairs[o.index]].name}과 만나요`), r.message); // 고른 선분의 진짜 짝을 알려 준다
          assert.ok(!r.message.includes(`선분 ${q.segments[q.answer].name}`), r.message); // 정답은 말하지 않는다
        }
        if (o.kind === 'near') assert.match(r.message, /바로 옆에 있지만/);
        if (o.kind === 'same') assert.equal(q.segments[o.index].length, q.segments[q.target].length);
      }
      assert.throws(() => judgeEdge(q, q.target), /없는 보기/);
    }
  }
  assert.ok(kinds.get('same') >= 1000 && kinds.get('other') > 300, JSON.stringify([...kinds]));
  // 정답 보기의 자리(보기는 테두리 순서로 늘어놓는다)가 한쪽으로 쏠리지 않는다: 어느 자리도 20~30% 안 (더 많은 시드로는 아래 찍기 통계 검사)
  for (const count of answerAt) assert.ok(count / 1000 > 0.2 && count / 1000 < 0.3, JSON.stringify(answerAt));
});

test('알맞은 면 4문항: 카드 3장(알맞은 면 · 길이 하나만 다른 면 · 크기가 다른 면)은 크기가 모두 다르고, 빈 자리 표시는 빠진 면의 크기와 무관하게 같은 깊이. 알맞은 카드의 자리·크기 순서가 쏠리지 않는다', () => {
  const at = [0, 0, 0]; // 알맞은 카드의 자리
  const rank = [0, 0, 0]; // 알맞은 카드가 넓이 순서로 몇 번째인가(큰 것부터)
  for (const seed of SEEDS) {
    const qs = makeQuestions(stage('cuboid-face'), createRng(seed));
    assert.equal(qs.length, 4);
    assert.equal(new Set(qs.map((q) => q.name)).size, 4);
    for (const q of qs) {
      assert.equal(q.net.faces.length, 5);
      assert.ok(isConnected(q.net));
      assert.ok(checkNet(q.fullNet).ok);
      const missing = q.fullNet.faces.find((f) => f.label === q.missingLabel);
      const mine = faceRect(missing);
      // 빈 자리: 빠진 면이 붙는 변 전체 × 깊이 2 cm (빠진 면의 깊이와 무관)
      const { rect } = q.slot;
      assert.equal(Math.min(rect.w, rect.h) <= SLOT_DEPTH && [rect.w, rect.h].includes(SLOT_DEPTH), true, q.itemId);
      const along = rect.w === SLOT_DEPTH && rect.h !== SLOT_DEPTH ? rect.h : rect.h === SLOT_DEPTH && rect.w !== SLOT_DEPTH ? rect.w : SLOT_DEPTH;
      assert.ok([mine.w, mine.h].includes(along), q.itemId);
      assert.ok(rect.x >= mine.x && rect.y >= mine.y && rect.x + rect.w <= mine.x + mine.w + (SLOT_DEPTH - Math.min(mine.w, mine.h) > 0 ? SLOT_DEPTH : 0) + 1e-9, q.itemId);
      assert.ok(!rectsOf(q.net).some((r) => overlap(r, rect)));
      assert.equal(q.oppositeLabel, q.fullNet.faces.find((f) => f.id === oppositeFace(q.fullNet, missing.id)).label);
      // 카드
      assert.deepEqual(q.cards.map((c) => c.kind).sort(), ['answer', 'length', 'pair']);
      assert.equal(new Set(q.cards.map((c) => `${c.w}×${c.h}`)).size, 3);
      for (const c of q.cards) assert.ok(c.w >= c.h && c.h >= 1);
      const right = q.cards.find((c) => c.kind === 'answer');
      assert.deepEqual([right.w, right.h], [Math.max(mine.w, mine.h), Math.min(mine.w, mine.h)]);
      at[q.cards.indexOf(right)] += 1;
      rank[q.cards.slice().sort((a, b) => b.w * b.h - a.w * a.h).indexOf(right)] += 1;
      const faces = [[q.dims[0], q.dims[1]], [q.dims[1], q.dims[2]], [q.dims[0], q.dims[2]]].map(([a, b]) => `${Math.max(a, b)}×${Math.min(a, b)}`);
      const lengthCard = q.cards.find((c) => c.kind === 'length');
      const pairCard = q.cards.find((c) => c.kind === 'pair');
      assert.ok(!faces.includes(`${lengthCard.w}×${lengthCard.h}`)); // 길이 하나만 다른 면: 그 직육면체의 어떤 면도 아니다
      assert.equal([lengthCard.w, lengthCard.h].filter((v) => [right.w, right.h].includes(v)).length >= 1, true);
      assert.equal(Math.abs(lengthCard.w * 1 + lengthCard.h - right.w - right.h), 1); // 한 변이 1 cm 다르다
      assert.ok(faces.includes(`${pairCard.w}×${pairCard.h}`)); // 크기가 다른 면: 그 직육면체의 다른 면
      for (const c of q.cards) {
        const placed = cardNet(q, c.id);
        assert.equal(placed.faces.length, 6);
        assert.equal(placed.faces[5].label, q.missingLabel);
        const rects = rectsOf(placed);
        for (let i = 0; i < 5; i += 1) assert.ok(!overlap(rects[i], rects[5]), q.itemId);
        const [w, h] = netSize(placed);
        assert.ok(w <= NET_FIT[0] && h <= NET_FIT[1], q.itemId);
        const r = judgeCard(q, c.id);
        noBadWords(r.message, q.itemId);
        assert.equal(r.correct, c.kind === 'answer');
        assert.equal(r.correct, checkNet(placed).ok);
        assert.equal(r.correct, wrapsBox(rects, q.dims));
        assert.equal(r.expected, `${right.h}×${right.w} cm`);
        assert.equal(r.tag, { answer: null, length: '맞닿는 모서리 길이', pair: '마주 보는 면은 합동' }[c.kind]);
        assert.ok(r.message.includes(c.kind === 'length' ? '맞닿는 모서리는 길이가 같아야 해요' : `빠진 면은 ${q.oppositeLabel} 면과 마주 봐요`), r.message);
        if (c.kind === 'length') assert.match(r.message, /만나는 두 선분이 \d cm와 \d cm로 달라요/);
      }
      assert.throws(() => judgeCard(q, 'c9'), /없는 카드/);
    }
  }
  // 찍어서 맞히기 어렵게: 알맞은 카드의 자리도, "가장 큰 · 가운데 · 가장 작은 카드"도 한쪽으로 쏠리지 않는다(어느 쪽도 28~38% 안)
  for (const count of [...at, ...rank]) assert.ok(count / 800 > 0.28 && count / 800 < 0.38, JSON.stringify({ at, rank }));
});

test('길이까지 살펴요 5문항: 유효 2 · 무효 3(겹침 · 붙은 변의 길이 · 마주 보는 면의 크기), 무효마다 참인 까닭 칩이 의도한 하나뿐이고 독립 계산과 같은 판정', () => {
  const firsts = new Map();
  for (const seed of SEEDS) {
    const qs = makeQuestions(stage('cuboid-judge'), createRng(seed));
    assert.equal(qs.length, 5);
    assert.deepEqual(qs.map((q) => q.intended ?? 'valid').sort(), ['length', 'overlap', 'pair', 'valid', 'valid']);
    assert.equal(new Set(qs.map((q) => q.name)).size, 5);
    firsts.set(qs[0].intended ?? 'valid', (firsts.get(qs[0].intended ?? 'valid') ?? 0) + 1);
    for (const q of qs) {
      const rects = rectsOf(q.net);
      const { ok, problems } = checkNet(q.net);
      assert.equal(ok, q.valid);
      assert.equal(ok, wrapsBox(rects, q.dims), q.itemId);
      assert.deepEqual(problems, q.problems);
      assert.equal(q.net.faces.length, 6);
      assert.equal(findHinges(q.net).length, 5); // 되든 안 되든 면 6장이 다섯 군데에서 이어진 한 장이다
      assert.deepEqual(q.net.faces.map((f) => f.label).sort(), ['가', '나', '다', '라', '마', '바']);
      for (let i = 0; i < 6; i += 1) for (let j = i + 1; j < 6; j += 1) assert.ok(!overlap(rects[i], rects[j]));
      const [w, h] = netSize(q.net);
      assert.ok(w <= NET_FIT[0] && h <= NET_FIT[1], q.itemId);
      assert.equal(q.expected, q.valid ? 'yes' : 'no');
      for (const answer of ['yes', 'no']) {
        const r = judgeCuboidAnswer(q, answer);
        noBadWords(r.message, q.itemId);
        assert.equal(r.correct, answer === q.expected);
        if (r.correct) assert.match(r.message, /^맞아요!/);
        else assert.equal(r.tag, { valid: '여러 가지 전개도', overlap: '면이 겹침', length: '맞닿는 모서리 길이', pair: '마주 보는 면은 합동' }[q.intended ?? 'valid']);
      }
      if (q.valid) {
        assert.deepEqual(cuboidReasons(problems), []);
        continue;
      }
      // 참인 까닭 칩은 의도한 하나뿐이다 → 까닭 고르기가 헷갈리지 않는다
      assert.deepEqual(cuboidReasons(problems), [q.intended], q.itemId);
      assert.equal(cuboidReasonOf(problems), q.intended);
      for (const reason of CUBOID_JUDGE_REASONS) {
        const r = judgeCuboidReason(problems, reason.id);
        assert.equal(r.correct, reason.id === q.intended);
        assert.equal(r.answer, q.intended);
        assert.equal(r.answerText, CUBOID_JUDGE_REASONS.find((x) => x.id === q.intended).text);
      }
      const primary = primaryCuboidProblem(problems);
      assert.equal(primary.type, { overlap: 'overlap', length: 'edge-length', pair: 'face-pair' }[q.intended]);
      if (q.intended === 'length') assert.ok(primary.hinge && !primary.shifted);
      if (q.intended === 'pair') {
        assert.equal(judgeCuboidAnswer(q, 'no').message, `맞아요! ${q.changed} 면은 마주 보는 ${q.opposite} 면과 크기가 달라요. 직육면체에서 마주 보는 면은 모양과 크기가 같아요.`);
        assert.equal(judgeCuboidAnswer(q, 'yes').message, `${q.changed} 면은 마주 보는 ${q.opposite} 면과 크기가 달라요. 직육면체에서 마주 보는 면은 모양과 크기가 같아요.`);
        assert.ok(problems.some((p) => p.type === 'edge-length' && !p.hinge)); // 접으면 만나는 두 선분의 길이가 달라 무대에서 짚을 곳이 있다
      }
      if (q.intended === 'overlap') assert.ok(problems.every((p) => ['overlap', 'gap'].includes(p.type)));
    }
  }
  // 문항 순서는 섞인다(첫 문항이 늘 같은 종류가 아니다)
  assert.ok(firsts.size === 4 && Math.min(...firsts.values()) > 15, JSON.stringify([...firsts]));
});

test('답하기 전 화면에 드러나는 것: 되는 전개도와 안 되는 전개도가 면 수 · 이름 · 길이 이름표 규칙 · 그리는 크기에서 같다 (무대는 늘 14 × 10 cm에 맞춘다)', () => {
  // 그리는 크기는 화면이 정한다(NET_FIT): 문항의 전개도는 모두 그 안에 들어가므로 1 cm의 크기가 문항과 무관하다.
  // 여기서는 전개도의 테두리 크기가 답을 얼마나 알려 주는지 잰다: "가로가 가장 긴 문항은 안 돼요"처럼 찍어서 맞힐 수 있는 정도
  const bySize = new Map();
  let total = 0;
  let invalid = 0;
  for (let seed = 0; seed < 600; seed += 1) {
    for (const q of makeQuestions(stage('cuboid-judge'), createRng(`leak-${seed}`))) {
      const key = netSize(q.net).join('×');
      const entry = bySize.get(key) ?? { n: 0, bad: 0 };
      entry.n += 1;
      if (!q.valid) entry.bad += 1;
      bySize.set(key, entry);
      total += 1;
      if (!q.valid) invalid += 1;
    }
  }
  assert.equal(invalid / total, 0.6);
  // 테두리 크기만 보고 찍었을 때의 정답률(크기마다 더 흔한 답을 고름)이 늘 "안 돼요"만 고를 때(60%)보다 조금만 높다
  let right = 0;
  for (const { n, bad } of bySize.values()) right += Math.max(bad, n - bad);
  assert.ok(right / total < 0.7, `테두리 크기로 찍은 정답률 ${(right / total * 100).toFixed(1)}%`);
});

// ── 까닭 문장이 짚는 면 — 독립 계산과 견줌 (review-cuboid M2-1) ─────────────────────────────
/**
 * 독립 계산 ③ 접어 보기 (fold.js를 쓰지 않는다): 첫 면을 바닥에 두고, 변으로 맞닿은 면을 그 변에서 직각으로 꺾어 면마다 3D 틀을 정한다.
 * 맞닿은 길이가 변의 일부여도(길이가 다른 변끼리 붙음) 그 변에서 꺾는다. → 면마다 { n(바깥 법선), d(평면의 자리), corners(꼭짓점 네 개) }
 */
function foldFlat(rects) {
  const frames = new Array(rects.length).fill(null);
  frames[0] = { o: [0, 0, 0], ux: [1, 0, 0], uy: [0, 1, 0] };
  const queue = [0];
  while (queue.length > 0) {
    const i = queue.shift();
    const a = rects[i];
    const { o, ux, uy } = frames[i];
    const n = cross3(ux, uy);
    rects.forEach((b, j) => {
      if (frames[j]) return;
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      let frame = null;
      if (b.x === a.x + a.w && oy > 0) frame = { o: add3(add3(o, mul3(ux, a.w)), mul3(uy, b.y - a.y)), ux: mul3(n, -1), uy };
      else if (b.x + b.w === a.x && oy > 0) frame = { o: add3(add3(o, mul3(uy, b.y - a.y)), mul3(n, -b.w)), ux: n, uy };
      else if (b.y === a.y + a.h && ox > 0) frame = { o: add3(add3(o, mul3(uy, a.h)), mul3(ux, b.x - a.x)), ux, uy: mul3(n, -1) };
      else if (b.y + b.h === a.y && ox > 0) frame = { o: add3(add3(o, mul3(ux, b.x - a.x)), mul3(n, -b.h)), ux, uy: n };
      if (!frame) return;
      frames[j] = frame;
      queue.push(j);
    });
  }
  const dot3 = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  return rects.map((r, i) => {
    const f = frames[i];
    const n = cross3(f.ux, f.uy).map((v) => Math.round(v));
    const corners = [[0, 0], [r.w, 0], [r.w, r.h], [0, r.h]].map(([x, y]) => add3(add3(f.o, mul3(f.ux, x)), mul3(f.uy, y)).map((v) => Math.round(v * 1e6) / 1e6));
    return { n, d: Math.round(dot3(n, f.o) * 1e6) / 1e6, corners };
  });
}
const sizeKey = (r) => [Math.min(r.w, r.h), Math.max(r.w, r.h)].join('×');
/** 같은 평면에 놓인 두 면(직사각형)이 넓이로 겹치나: 평면 안의 두 축으로 꼭짓점을 펴서 견준다 */
function sharesArea(p, q) {
  const axes = [0, 1, 2].filter((k) => p.n[k] === 0);
  const span = (f, k) => [Math.min(...f.corners.map((c) => c[k])), Math.max(...f.corners.map((c) => c[k]))];
  return axes.every((k) => Math.min(span(p, k)[1], span(q, k)[1]) - Math.max(span(p, k)[0], span(q, k)[0]) > 1e-9);
}

test('길이까지 살펴요의 까닭 문장이 짚는 면 — 시드 3,000개(안 되는 9,000문항)를 독립 계산과 견줌: 크기형은 "바뀐 면"과 "접었을 때 그 맞은편 면"(어긋남 0), 겹침형은 같은 자리에 놓인 두 면, 길이형은 붙은 두 변과 그 길이', () => {
  const count = { pair: 0, overlap: 0, length: 0 };
  let third = 0; // 바꾼 크기가 그 상자의 다른 면 크기와 같아 같은 크기가 세 장인 크기형 문항 (M2-1이 틀렸던 경우)
  for (let seed = 1; seed <= 3000; seed += 1) {
    for (const q of makeQuestions(stage('cuboid-judge'), createRng(seed))) {
      if (q.valid) continue;
      count[q.intended] += 1;
      const rects = rectsOf(q.net);
      const names = q.net.faces.map((f) => f.label);
      const folded = foldFlat(rects);
      const right = judgeCuboidAnswer(q, 'no').message;
      const wrong = judgeCuboidAnswer(q, 'yes').message;
      assert.equal(right, `맞아요! ${wrong}`, q.itemId); // 맞혔을 때와 틀렸을 때 같은 까닭 문장
      if (q.intended === 'pair') {
        const said = wrong.match(/^(.) 면은 마주 보는 (.) 면과 크기가 달라요\. 직육면체에서 마주 보는 면은 모양과 크기가 같아요\.$/);
        assert.ok(said, wrong);
        // 독립 계산: 여섯 면의 법선은 모두 다르다 → 법선이 반대인 것끼리 세 쌍. 크기가 다른 쌍은 하나뿐이고,
        // 그 쌍에서 "나머지 두 쌍이 아닌 크기"(그 자리에 와야 할 크기)가 아닌 쪽이 바뀐 면, 다른 쪽이 그 맞은편이다
        const key = (f) => f.n.join(',');
        assert.equal(new Set(folded.map(key)).size, 6, q.itemId);
        const pairs = [];
        folded.forEach((f, i) => {
          const j = folded.findIndex((g) => key(g) === f.n.map((v) => -v + 0).join(','));
          if (i < j) pairs.push([i, j]);
        });
        assert.equal(pairs.length, 3, q.itemId);
        const odd = pairs.filter(([i, j]) => sizeKey(rects[i]) !== sizeKey(rects[j]));
        assert.equal(odd.length, 1, q.itemId);
        const classes = [[q.dims[0], q.dims[1]], [q.dims[1], q.dims[2]], [q.dims[0], q.dims[2]]].map(([a, b]) => [Math.min(a, b), Math.max(a, b)].join('×'));
        const taken = pairs.filter((p) => p !== odd[0]).map(([i]) => sizeKey(rects[i]));
        const due = classes.filter((c) => !taken.includes(c));
        assert.equal(due.length, 1, q.itemId);
        const [i, j] = odd[0];
        assert.ok((sizeKey(rects[i]) === due[0]) !== (sizeKey(rects[j]) === due[0]), q.itemId); // 한쪽만 제 크기다
        const [changed, opposite] = sizeKey(rects[i]) === due[0] ? [j, i] : [i, j];
        assert.deepEqual([said[1], said[2]], [names[changed], names[opposite]], `${q.itemId}: ${wrong}`);
        assert.deepEqual([q.changed, q.opposite], [names[changed], names[opposite]]);
        if (rects.filter((r) => sizeKey(r) === sizeKey(rects[changed])).length === 3) third += 1;
        // 무대가 짚는 두 변(접으면 만나는 두 선분)의 길이도 정말 다르다
        const marked = q.problems.find((p) => p.type === 'edge-length');
        assert.ok(marked && Math.abs(marked.lengths[0] - marked.lengths[1]) > 1e-9, q.itemId);
      } else if (q.intended === 'overlap') {
        const said = wrong.match(/^(.) 면과 (.) 면이 같은 자리에 겹쳐요\. 그래서 다른 한쪽이 비어요\.$/);
        assert.ok(said, wrong);
        // 독립 계산: 접었을 때 같은 평면에서 넓이가 겹치는 두 면은 한 쌍뿐이다
        const same = [];
        for (let i = 0; i < 6; i += 1) {
          for (let j = i + 1; j < 6; j += 1) {
            const [p, r] = [folded[i], folded[j]];
            const parallel = p.n.every((v, k) => v === r.n[k]) ? 1 : p.n.every((v, k) => v === -r.n[k]) ? -1 : 0;
            if (parallel !== 0 && Math.abs(p.d - parallel * r.d) < 1e-9 && sharesArea(p, r)) same.push([names[i], names[j]].sort().join());
          }
        }
        assert.deepEqual(same, [[said[1], said[2]].sort().join()], `${q.itemId}: ${wrong}`);
      } else {
        const said = wrong.match(/^(.) 면과 (.) 면이 붙은 두 변의 길이가 (\d) cm[과와] (\d) cm로 달라요\. 맞닿는 모서리는 길이가 같아야 해요\.$/);
        assert.ok(said, wrong);
        // 독립 계산: 펼친 그림에서 변으로 맞닿은 두 면 가운데 맞닿은 두 변의 길이가 다른 쌍은 하나뿐이다
        const off = [];
        for (let i = 0; i < 6; i += 1) {
          for (let j = 0; j < 6; j += 1) {
            if (i === j) continue;
            const [a, b] = [rects[i], rects[j]];
            const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
            const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
            const sides = (b.x === a.x + a.w || b.x + b.w === a.x) && oy > 0 ? [a.h, b.h] : (b.y === a.y + a.h || b.y + b.h === a.y) && ox > 0 ? [a.w, b.w] : null;
            if (sides && sides[0] !== sides[1]) off.push(`${names[i]} ${names[j]} ${sides[0]} ${sides[1]}`);
          }
        }
        assert.equal(off.length, 2, q.itemId); // 한 쌍(두 방향)
        assert.ok(off.includes(`${said[1]} ${said[2]} ${said[3]} ${said[4]}`), `${q.itemId}: ${wrong} ↔ ${off}`);
      }
    }
  }
  assert.deepEqual(count, { pair: 3000, overlap: 3000, length: 3000 });
  assert.ok(third > 200, `같은 크기가 세 장인 크기형 문항 ${third}`); // 틀렸던 경우가 검사에 충분히 들어 있다
});

test('까닭 문장(크기형): 문항이 바꾼 면을 알려 주지 않으면 엉뚱한 면을 "마주 보는 면"이라고 말하지 않는다', () => {
  const q = makeQuestions(stage('cuboid-judge'), createRng(1)).find((x) => x.intended === 'pair');
  const problem = primaryCuboidProblem(q.problems);
  assert.equal(problem.type, 'face-pair');
  const plain = explainCuboidProblem(q.net, problem);
  assert.doesNotMatch(plain, /마주 보는 . 면과|undefined|null/);
  assert.match(plain, /^크기가 같은 면이 두 장씩 짝을 이루지 않아요\./);
  assert.equal(explainCuboidProblem(q.net, problem, { changed: '가', opposite: '나' }), '가 면은 마주 보는 나 면과 크기가 달라요. 직육면체에서 마주 보는 면은 모양과 크기가 같아요.');
});

// ── 찍기 통계 (review-cuboid M2-7) ─────────────────────────────
test('찍어서 맞히기 어렵다(시드 3,000개): 만나는 선분의 정답 보기 자리는 네 자리 모두 20~30%, 알맞은 카드의 자리와 크기 순위(큰 것부터)는 모두 28~38% — 상자마다 따로 봐도 그렇다', () => {
  const at = [0, 0, 0, 0];
  for (let seed = 1; seed <= 3000; seed += 1) {
    for (const q of makeQuestions(stage('cuboid-edge'), createRng(seed))) at[q.options.findIndex((o) => o.kind === 'answer')] += 1;
  }
  for (const n of at) assert.ok(n / 15000 > 0.2 && n / 15000 < 0.3, `만나는 선분 정답 자리 ${at}`);
  const place = [0, 0, 0];
  const rank = [0, 0, 0];
  const byBox = new Map();
  for (let seed = 1; seed <= 3000; seed += 1) {
    for (const q of makeQuestions(stage('cuboid-face'), createRng(seed))) {
      const right = q.cards.find((c) => c.kind === 'answer');
      const r = q.cards.slice().sort((a, b) => b.w * b.h - a.w * a.h).indexOf(right);
      place[q.cards.indexOf(right)] += 1;
      rank[r] += 1;
      const box = byBox.get(q.dims.join('')) ?? [0, 0, 0];
      box[r] += 1;
      byBox.set(q.dims.join(''), box);
    }
  }
  for (const n of [...place, ...rank]) assert.ok(n / 12000 > 0.28 && n / 12000 < 0.38, JSON.stringify({ place, rank }));
  assert.equal(byBox.size, QUESTION_BOXES.length);
  for (const [box, counts] of byBox) {
    const total = counts.reduce((a, b) => a + b, 0);
    assert.ok(total / 12000 > 0.28 && total / 12000 < 0.38, `상자 ${box}: ${total}`); // 세 상자가 고르게 나온다
    for (const n of counts) assert.ok(n / total > 0.28 && n / total < 0.38, `상자 ${box}의 크기 순위 ${counts}`);
  }
});
