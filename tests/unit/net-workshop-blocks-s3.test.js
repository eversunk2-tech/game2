/**
 * 쌓기나무 5차시(층별로 나타내기)·도전(더 붙여서 만들기)·쌓기나무 도장 셋(S3) 검사, 그리고 3차시 "앞과 뒤"의 오개념 보기(사용자 결정 15-8).
 * 판정은 저장소의 함수를 쓰지 않고 기획서(spec-grade6.md 2-4·4·6-3·6-4·8절)의 문장만 보고 짠 독립 계산(쌓기나무 칸의 집합, 한 개씩 붙여 보기,
 * 돌리기·뒤집기 행렬)과 3×3칸·3층의 높이 지도 262,144개 전부 또는 시드 수백~2,000개로 견준다.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRng } from '../../src/shared/core/random.js';
import { createPlayReward, stageXp } from '../../src/shared/core/rewards.js';
import { starsFromAccuracy } from '../../src/shared/core/progress.js';
import { addOne, count, fromLayers, isConnectedTop, lookKey, madeFrom, mapKey, toCorner } from '../../src/games/net-workshop/blocks/blocks.js';
import {
  ADD_PLAN,
  BLOCK_BADGES,
  BLOCK_STAGES,
  BLOCK_TAGS,
  addBuildHint,
  addVerdict,
  addedCells,
  addNumberQuestion,
  describeLayer,
  drawHint,
  grownShapes,
  hiddenCountWins,
  judgeAddBuild,
  judgeAddGuess,
  judgeDrawing,
  judgeLayerBuild,
  judgeLayerCount,
  judgeLayerDrawing,
  judgeNumbers,
  judgeView,
  layerBuildHint,
  layerBuildWins,
  layerDrawHint,
  layersOf,
  madeFromAnyTurn,
  makeBlockQuestions,
  mirrorMap,
  starsByWrong,
  swapMap,
  threeLayered,
  threeViewWins,
  viewCells,
} from '../../src/games/net-workshop/blocks/blocks-logic.js';

const stage = (id) => BLOCK_STAGES.find((s) => s.id === id);
const questions = (id, seed) => makeBlockQuestions(stage(id), createRng(`${seed}:${id}`));
const SEEDS = Array.from({ length: 300 }, (_, i) => i + 1);

// ── 독립 계산 ─────────────────────────────
const R = [0, 1, 2];
/** 높이 지도 → 쌓기나무 칸 목록 [x, y, z] (뜬 것 없음: 그 자리의 높이까지 찬다) */
const cubesOf = (h) => {
  const out = [];
  R.forEach((y) => R.forEach((x) => {
    for (let z = 0; z < h[y][x]; z += 1) out.push([x, y, z]);
  }));
  return out;
};
const cubeKey = (c) => c.join(',');
/** 칸 목록을 가장 작은 자리가 0이 되게 옮긴 열쇠(통째로 옮긴 것은 같은 열쇠) */
function shapeKey(cubes) {
  if (cubes.length === 0) return '';
  const lo = [0, 1, 2].map((i) => Math.min(...cubes.map((c) => c[i])));
  return cubes.map((c) => c.map((v, i) => v - lo[i])).map(cubeKey).sort().join('|');
}
/** 칸 목록 → 높이 지도 (판 안·뜬 것 없음이어야 한다 — 아니면 null) */
function mapOf(cubes) {
  const h = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const set = new Set(cubes.map(cubeKey));
  for (const [x, y, z] of cubes) {
    if (x < 0 || x > 2 || y < 0 || y > 2 || z < 0 || z > 2) return null;
    if (z > 0 && !set.has(cubeKey([x, y, z - 1]))) return null;
    h[y][x] = Math.max(h[y][x], z + 1);
  }
  return h;
}
const SIX = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
/** 칸이 면으로 이어져 있는가 */
function connected(cubes) {
  if (cubes.length === 0) return false;
  const set = new Set(cubes.map(cubeKey));
  const seen = new Set([cubeKey(cubes[0])]);
  const stack = [cubes[0]];
  while (stack.length) {
    const [x, y, z] = stack.pop();
    for (const [dx, dy, dz] of SIX) {
      const k = cubeKey([x + dx, y + dy, z + dz]);
      if (set.has(k) && !seen.has(k)) {
        seen.add(k);
        stack.push([x + dx, y + dy, z + dz]);
      }
    }
  }
  return seen.size === cubes.length;
}
/** 판 위 어디든 통째로 옮긴 칸 목록들(판 안에 남는 것) */
function placements(cubes) {
  const out = [];
  for (let dx = -2; dx <= 2; dx += 1) {
    for (let dy = -2; dy <= 2; dy += 1) {
      const moved = cubes.map(([x, y, z]) => [x + dx, y + dy, z]);
      if (moved.every(([x, y]) => x >= 0 && x <= 2 && y >= 0 && y <= 2)) out.push(moved);
    }
  }
  return out;
}
/**
 * 한 개씩 붙여 만든 모양 전부(기획서 2-4절 "쌓기나무 1개를 더 붙여"): 판 위 어디에 둔 처음 모양에서 시작해, 쌓기나무 하나를
 * 판 안(3층까지)의 빈 칸 가운데 이미 놓인 쌓기나무와 면이 맞닿고 아래가 비어 있지 않은(바닥이거나 아래에 쌓기나무) 칸에 놓는다 — n번
 * → 통째로 옮긴 것은 같은 것으로 본 열쇠의 Set
 */
function indepGrown(base, n) {
  let level = new Map(placements(cubesOf(base)).map((c) => [c.map(cubeKey).sort().join('|'), c]));
  for (let step = 0; step < n; step += 1) {
    const next = new Map();
    for (const cubes of level.values()) {
      const set = new Set(cubes.map(cubeKey));
      for (let x = 0; x < 3; x += 1) {
        for (let y = 0; y < 3; y += 1) {
          for (let z = 0; z < 3; z += 1) {
            if (set.has(cubeKey([x, y, z]))) continue;
            if (z > 0 && !set.has(cubeKey([x, y, z - 1]))) continue;
            if (!SIX.some(([dx, dy, dz]) => set.has(cubeKey([x + dx, y + dy, z + dz])))) continue;
            const grown = [...cubes, [x, y, z]];
            next.set(grown.map(cubeKey).sort().join('|'), grown);
          }
        }
      }
    }
    level = next;
  }
  return new Set([...level.values()].map(shapeKey));
}
/** 돌리기·뒤집기 48가지를 축 둘레 90° 돌리기 셋과 거울 하나를 거듭 곱해 만든다(저장소의 TURNS와 따로) */
const MATRICES = (() => {
  const mul = (a, b) => a.map((row) => [0, 1, 2].map((j) => row.reduce((s, v, k) => s + v * b[k][j], 0)));
  const gens = [
    [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
    [[0, 0, 1], [0, 1, 0], [-1, 0, 0]],
    [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
    [[-1, 0, 0], [0, 1, 0], [0, 0, 1]],
  ];
  const out = new Map([['1,0,0,0,1,0,0,0,1', [[1, 0, 0], [0, 1, 0], [0, 0, 1]]]]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const m of [...out.values()]) {
      for (const g of gens) {
        const p = mul(g, m);
        const k = p.flat().join(',');
        if (!out.has(k)) {
          out.set(k, p);
          grew = true;
        }
      }
    }
  }
  return [...out.values()];
})();
/** shape가 base를 어느 쪽으로 돌리거나 뒤집어(그대로 포함) n개를 더 붙인 모양인가 — 칸 집합으로, 붙인 것까지 이어져 있어야 */
function indepAnyTurn(base, shape, n) {
  const s = cubesOf(shape);
  const b = cubesOf(base);
  if (s.length - b.length !== n || !connected(s)) return false;
  const set = new Set(s.map(cubeKey));
  for (const m of MATRICES) {
    const turned = b.map((c) => [0, 1, 2].map((i) => m[i][0] * c[0] + m[i][1] * c[1] + m[i][2] * c[2]));
    const lo = [0, 1, 2].map((i) => Math.min(...turned.map((c) => c[i])));
    for (let ox = 0; ox < 3; ox += 1) {
      for (let oy = 0; oy < 3; oy += 1) {
        for (let oz = 0; oz < 3; oz += 1) {
          if (turned.every((c) => set.has(cubeKey([c[0] - lo[0] + ox, c[1] - lo[1] + oy, c[2] - lo[2] + oz])))) return true;
        }
      }
    }
  }
  return false;
}
/** 층별 모양(독립): k층 = k번째 층에 쌓기나무가 있는 자리 */
const indepLayers = (h) => [0, 1, 2].map((z) => R.map((y) => R.map((x) => (cubesOf(h).some((c) => c[0] === x && c[1] === y && c[2] === z) ? 1 : 0))));
/** 교과서 방향 그림에서 한 조각도 보이지 않는 쌓기나무(광선) — net-workshop-blocks-s2.test.js와 같은 방법 */
const TRI = [
  [[0, 0, 1], [1, 0, 1], [0, 1, 1]], [[1, 0, 1], [1, 1, 1], [0, 1, 1]],
  [[0, 0, 0], [1, 0, 0], [1, 0, 1]], [[0, 0, 0], [1, 0, 1], [0, 0, 1]],
  [[1, 0, 0], [1, 1, 0], [1, 0, 1]], [[1, 1, 0], [1, 1, 1], [1, 0, 1]],
];
function indepHidden(h) {
  const set = new Set(cubesOf(h).map(cubeKey));
  return cubesOf(h).filter(([x, y, z]) => !TRI.some((tri) => {
    const cx = x + (tri[0][0] + tri[1][0] + tri[2][0]) / 3;
    const cy = y + (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
    const cz = z + (tri[0][2] + tri[1][2] + tri[2][2]) / 3;
    for (let k = 0; k < 10; k += 1) {
      const t = 1 / 6 + k / 3;
      if (set.has(cubeKey([Math.floor(cx + t), Math.floor(cy - t), Math.floor(cz + t)]))) return false;
    }
    return true;
  }));
}
/** 두 높이 지도가 통째로 옮겨 겹치는가 */
const indepSameShifted = (a, b) => shapeKey(cubesOf(a)) === shapeKey(cubesOf(b));
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
const GRIDS = Array.from({ length: 512 }, (_, n) => R.map((r) => R.map((c) => (n >> (r * 3 + c)) & 1)));

// ── 15-8: 앞과 뒤의 오개념 보기 ─────────────────
test('15-8 앞과 뒤 (시드 2,000개 · 6,000문항): 판마다 "주어진 그림 그대로" 보기를 한 번 이상 만나고, 보기의 꼴만 보는 규칙은 찍기(1/3)에서 ±10%p 안, "뒤도 앞과 같다"는 학생은 찍기에서 6%p 안', () => {
  const N = 2000;
  const reverse = (v) => [...v].reverse();
  const key = (v) => v.join();
  const rules = {};
  const add = (k, v) => {
    rules[k] = (rules[k] ?? 0) + v;
  };
  let n = 0;
  let withSame = 0;
  let boardsWithout = 0;
  let student = 0;
  const pos = [0, 0, 0];
  for (let seed = 1; seed <= N; seed += 1) {
    const qs = questions('blocks-flip', seed);
    if (!qs.some((q) => q.options.some((o) => key(o.heights) === key(q.view) && o.role === 'same'))) boardsWithout += 1;
    for (const q of qs) {
      n += 1;
      const o = q.options.map((x) => x.heights);
      const ans = q.expected - 1;
      pos[ans] += 1;
      const chance = (picked) => {
        const list = picked.length ? picked : [0, 1, 2];
        return list.includes(ans) ? 1 / list.length : 0;
      };
      const all = [0, 1, 2];
      const paired = all.filter((i) => all.some((j) => j !== i && key(o[j]) === key(reverse(o[i]))));
      const pals = all.filter((i) => key(o[i]) === key(reverse(o[i])));
      const same = all.filter((i) => key(o[i]) === key(q.view));
      const mids = o.map((v) => v[1]);
      add('sameAsGiven', chance(same));
      add('notSameAsGiven', chance(all.filter((i) => !same.includes(i))));
      add('mirrorPair', chance(paired));
      add('notInPair', chance(all.filter((i) => !paired.includes(i))));
      add('palindrome', chance(pals));
      add('notPalindrome', chance(all.filter((i) => !pals.includes(i))));
      add('oddMiddle', chance(all.filter((i) => mids.filter((m) => m === mids[i]).length === 1)));
      add('shareMiddle', chance(all.filter((i) => mids.filter((m) => m === mids[i]).length > 1)));
      add('tallMiddle', chance(all.filter((i) => o[i][1] > o[i][0] && o[i][1] > o[i][2])));
      add('palElsePair', chance(pals.length ? pals : paired));
      add('notGivenNotPal', chance(all.filter((i) => !same.includes(i) && !pals.includes(i))));
      add('palAndGiven', chance(all.filter((i) => pals.includes(i) && same.includes(i))));
      add('pairNotPal', chance(all.filter((i) => paired.includes(i) && !pals.includes(i))));
      add('apartNotPal', chance(all.filter((i) => !paired.includes(i) && !pals.includes(i))));
      // "뒤에서 본 모양도 앞과 같다"는 학생: 그대로를 고르고, 없으면 같은 자리 높이가 가장 많이 같은 보기 (review-blocks-s2 S2b-1의 방법)
      const sim = o.map((v) => v.filter((x, j) => x === q.view[j]).length);
      student += chance(same.length ? same : all.filter((i) => sim[i] === Math.max(...sim)));
      if (q.options.some((x) => x.role === 'same')) withSame += 1;
    }
  }
  assert.equal(n, 3 * N);
  assert.equal(boardsWithout, 0, '"그대로" 보기를 한 번도 못 만나는 판');
  for (const p of pos) assert.ok(p / n > 0.28 && p / n < 0.39, `정답 자리 ${pos}`);
  for (const [name, v] of Object.entries(rules)) assert.ok(v / n > 0.2333 && v / n < 0.4333, `${name} ${(v / n).toFixed(3)}`);
  assert.ok(withSame / n > 0.36 && withSame / n < 0.45, `그대로 보기가 든 문항 ${(withSame / n).toFixed(3)}`);
  assert.ok(student / n < 0.40, `"뒤도 앞과 같다" 학생이 맞히는 비율 ${(student / n).toFixed(3)} (지난 0.448)`);
});

// ── 5차시: 층별 모양 ────────────────────────
test('층별 모양 ↔ 쌓기 (높이 지도 262,144개 전부): 층별 모양이 칸의 집합으로 따로 센 층과 같고, 층별 모양에서 다시 쌓으면 처음 쌓기, 층별 모양을 보고 쌓기의 판정은 통째로 옮긴 같은 쌓기만 맞다', () => {
  let layered = 0;
  for (const h of ALL) {
    const layers = layersOf(h);
    assert.deepEqual(layers, indepLayers(h), mapKey(h));
    assert.deepEqual(fromLayers(layers), h);
    // 세 층이 있고 층마다 칸 수가 줄어드는 모양(문항으로 쓰는 모양)
    const c = indepLayers(h).map((g) => g.flat().filter(Boolean).length);
    assert.equal(threeLayered(h), c[2] > 0 && c[0] > c[1] && c[1] > c[2]);
    if (threeLayered(h)) layered += 1;
    if (count(h) === 0) continue;
    // 판정: 같은 쌓기·통째로 옮긴 쌓기는 맞음, 한 자리만 다른 쌓기는 틀림 (독립: 칸 집합을 옮겨 겹치기)
    const q = { target: h, layers: indepLayers(h), expected: mapKey(h) };
    assert.equal(judgeLayerBuild(q, h).correct, true);
    assert.equal(judgeLayerBuild(q, toCorner(h)).correct, true);
    const g = h.map((row) => [...row]);
    const spot = [0, 1, 2, 3, 4, 5, 6, 7, 8].find((i) => g[Math.floor(i / 3)][i % 3] < 3) ?? 0;
    g[Math.floor(spot / 3)][spot % 3] += g[Math.floor(spot / 3)][spot % 3] < 3 ? 1 : -1;
    assert.equal(judgeLayerBuild(q, g).correct, indepSameShifted(g, h));
  }
  assert.ok(layered > 1000, `${layered}`);
});

test('blocks-layer-draw 문제 만들기 (시드 300개): 세 층이 있고 층마다 모양이 다르며, 1번은 숨겨진 쌓기나무가 없고 2·3번은 있다(돌려 봐야 안다)', () => {
  for (const seed of SEEDS) {
    const qs = questions('blocks-layer-draw', seed);
    assert.equal(qs.length, 3);
    assert.equal(new Set(qs.map((q) => mapKey(q.target))).size, 3);
    qs.forEach((q, i) => {
      assert.deepEqual(q.kinds, [2, 3]);
      assert.deepEqual(q.layers, indepLayers(q.target));
      const c = q.layers.map((g) => g.flat().filter(Boolean).length);
      assert.ok(c[2] > 0 && c[0] > c[1] && c[1] > c[2], `${seed} ${c}`);
      assert.ok(isConnectedTop(q.target) && q.total === count(q.target) && q.total >= 6 && q.total <= 11);
      assert.equal(indepHidden(q.target).length > 0, i > 0, `${seed} ${i + 1}`);
    });
  }
});

/** 층별 모양 그리기 판정(독립): 2층·3층이 목표와 칸마다 같으면 맞음 · 아래층이 빈 자리에 칠한 칸이 있으면 "위층은 아래층 위에" */
function indepLayerJudge(q, d) {
  const L = indepLayers(q.target);
  const same = (a, b) => R.every((y) => R.every((x) => Boolean(a[y][x]) === Boolean(b[y][x])));
  const correct = same(d[2], L[1]) && same(d[3], L[2]);
  const floating = R.some((y) => R.some((x) => (d[2][y][x] && !L[0][y][x]) || (d[3][y][x] && !d[2][y][x])));
  return { correct, tag: correct ? null : floating ? BLOCK_TAGS.above : BLOCK_TAGS.layer };
}

test('blocks-layer-draw 채점: 무작위로 칠한 층 모양 6,000쌍이 독립 계산과 같고(맞음·tag·다른 칸), 다른 칸을 고치면 맞는다. 바뀐 층·빈 모눈·힌트', () => {
  const rng = createRng('layer-draw-judge');
  let floating = 0;
  for (const seed of SEEDS.slice(0, 100)) {
    for (const q of questions('blocks-layer-draw', seed)) {
      assert.equal(judgeLayerDrawing(q, { 2: q.layers[1], 3: q.layers[2] }).correct, true);
      for (let k = 0; k < 20; k += 1) {
        const d = { 2: rng.pick(GRIDS.slice(1)), 3: rng.pick(GRIDS.slice(1)) };
        const r = judgeLayerDrawing(q, d);
        const want = indepLayerJudge(q, d);
        assert.equal(r.correct, want.correct);
        assert.equal(r.tag, want.tag, `${mapKey(q.target)} ${JSON.stringify(d)}`);
        if (r.tag === BLOCK_TAGS.above) floating += 1;
        // 다른 칸(판 위 자리 그대로)을 고치면 목표와 같아진다
        for (const kk of [2, 3]) {
          const fixed = d[kk].map((row) => [...row]);
          for (const x of r.diff[kk]) fixed[x.r][x.c] = x.state === 'missing' ? 1 : 0;
          assert.deepEqual(fixed, q.layers[kk - 1]);
        }
        if (!r.correct) {
          assert.ok(r.message.length > 10);
          const hint = layerDrawHint(q, d);
          assert.match(hint.text, /^\d줄 \d칸 자리에는 쌓기나무가 (\d개 있어요|없어요)\.$/);
        }
      }
      // 2층·3층을 바꿔 칠함 → "층별 모양" + 바뀌었다는 까닭 / 2층에 1층을 칠함(더 칠함) → 그 층까지 쌓인 자리만
      const swapped = judgeLayerDrawing(q, { 2: q.layers[2], 3: q.layers[1] });
      if (!indepLayerJudge(q, { 2: q.layers[2], 3: q.layers[1] }).tag || swapped.tag === BLOCK_TAGS.layer) assert.match(swapped.message, /바뀌었어요|위층에 놓을 수 없어요/);
      const over = judgeLayerDrawing(q, { 2: q.layers[0], 3: q.layers[2] });
      assert.equal(over.tag, BLOCK_TAGS.layer);
      assert.match(over.message, /2층 모양에는 2층까지 쌓인 자리만 칠해요\./);
      // 빈 모눈: 기록하지 않는 안내
      assert.equal(judgeLayerDrawing(q, { 2: GRIDS[0], 3: q.layers[2] }).empty, true);
      assert.equal(judgeLayerDrawing(q, { 2: q.layers[1], 3: GRIDS[0] }).message, '3층 모양을 먼저 칠해요.');
    }
  }
  assert.ok(floating > 200, `${floating}`);
});

test('blocks-layer-build 문제 만들기·채점 (시드 300개): 좌우로 뒤집거나 앞과 옆을 바꾼 쌓기는 틀린 답(tag 좌우 뒤집힘 · 앞과 옆), 1층이 다르면 바닥에 닿은 면, 그 밖은 층별 모양. 다른 칸 ✗는 고치면 맞는다', () => {
  const rng = createRng('layer-build');
  for (const seed of SEEDS) {
    const qs = questions('blocks-layer-build', seed);
    assert.equal(new Set(qs.map((q) => shapeKey(cubesOf(q.target)))).size, 3);
    for (const q of qs) {
      assert.deepEqual(q.layers, indepLayers(q.target));
      assert.ok(threeLayered(q.target) && q.total >= 6 && q.total <= 11);
      assert.ok(!indepSameShifted(q.target, mirrorMap(q.target)) && !indepSameShifted(q.target, swapMap(q.target)));
      assert.equal(judgeLayerBuild(q, mirrorMap(q.target)).tag, BLOCK_TAGS.mirror);
      assert.equal(judgeLayerBuild(q, swapMap(q.target)).tag, BLOCK_TAGS.frontSide);
      assert.equal(judgeLayerBuild(q, [[0, 0, 0], [0, 0, 0], [0, 0, 0]]).empty, true);
      if (seed <= 60) {
        for (let k = 0; k < 20; k += 1) {
          const mine = rng.pick(ALL);
          const r = judgeLayerBuild(q, mine);
          if (count(mine) === 0) continue;
          assert.equal(r.correct, indepSameShifted(mine, q.target));
          if (r.correct) continue;
          const sameFloor = indepSameShifted(mine.map((row) => row.map((v) => (v ? 1 : 0))), q.target.map((row) => row.map((v) => (v ? 1 : 0))));
          const want = indepSameShifted(mine, mirrorMap(q.target)) ? BLOCK_TAGS.mirror : indepSameShifted(mine, swapMap(q.target)) ? BLOCK_TAGS.frontSide : sameFloor ? BLOCK_TAGS.layer : BLOCK_TAGS.floor;
          assert.equal(r.tag, want);
          // 힌트: 내 쌓기와 다른 자리의 높이(목표 그대로)
          const hint = layerBuildHint(q, mine);
          assert.equal(hint.value, q.target[hint.y][hint.x]);
          assert.ok(hint.value > 0);
        }
      }
      // ✗ 칸: 판 위 자리 그대로 내 쌓기를 목표 자리로 옮겨 층마다 견준 것 — 1층·2층·3층 모두 다르지 않으면 맞음
      const near = q.target.map((row) => [...row]);
      const spot = [0, 1, 2, 3, 4, 5, 6, 7, 8].find((i) => near[Math.floor(i / 3)][i % 3] > 1);
      near[Math.floor(spot / 3)][spot % 3] -= 1;
      const r = judgeLayerBuild(q, near);
      assert.equal(r.tag, BLOCK_TAGS.layer);
      assert.equal([1, 2, 3].reduce((s, k) => s + r.diff[k].length, 0), 1);
    }
  }
});

test('blocks-layer-views (시드 1,000개): 개수 고르기 · 앞 칠하기 · 옆 칠하기. 개수 보기의 자리·값 규칙은 찍기(25%)에서 ±10%p 안, 함정 값(1층만 · 3층을 빠뜨림)의 까닭', () => {
  const pos = [0, 0, 0, 0];
  const rules = { largest: 0, smallest: 0, secondLargest: 0, median: 0, run: 0, afterPair: 0, beforePair: 0, beforeGap: 0, maxMinus3: 0, even: 0 };
  let traps = 0;
  for (let seed = 1; seed <= 1000; seed += 1) {
    const [cnt, front, side] = questions('blocks-layer-views', seed);
    assert.deepEqual([cnt.kind, front.kind, front.kinds, side.kind, side.kinds], ['count', 'paint', ['front'], 'paint', ['side']]);
    for (const q of [cnt, front, side]) {
      assert.deepEqual(q.layers, indepLayers(q.target));
      assert.ok(threeLayered(q.target) && q.total >= 6 && q.total <= 11);
    }
    // 개수: 보기 넷은 서로 다르고 작은 수부터, 정답은 전체 개수(독립: 칸 수)
    assert.equal(cnt.expected, cubesOf(cnt.target).length);
    assert.equal(new Set(cnt.options).size, 4);
    assert.deepEqual([...cnt.options].sort((a, b) => a - b), cnt.options);
    const at = cnt.options.indexOf(cnt.expected);
    pos[at] += 1;
    const share = (sel) => (sel.includes(at) ? 1 / sel.length : 0);
    rules.largest += share([3]);
    rules.smallest += share([0]);
    rules.secondLargest += share([2]);
    rules.median += share([1, 2]);
    let i = 3;
    while (i > 0 && cnt.options[i] - cnt.options[i - 1] === 1) i -= 1;
    rules.run += share([i]);
    const o = cnt.options;
    const idx = [0, 1, 2, 3];
    rules.afterPair += share(idx.filter((k) => k > 0 && o[k] - o[k - 1] === 1)); // 바로 아래(−1) 수가 있는 보기 — 맨 위층을 빠뜨린 함정이 자주 −1이다
    rules.beforePair += share(idx.filter((k) => k < 3 && o[k + 1] - o[k] === 1));
    const gaps = [o[1] - o[0], o[2] - o[1], o[3] - o[2]];
    rules.beforeGap += share([gaps.indexOf(Math.max(...gaps))]);
    rules.maxMinus3 += share(idx.filter((k) => o[k] >= o[3] - 3).slice(0, 1));
    rules.even += share(idx.filter((k) => o[k] % 2 === 0));
    const [c1, , c3] = cnt.layers.map((g) => g.flat().filter(Boolean).length);
    if (cnt.options.includes(c1) || cnt.options.includes(cnt.total - c3)) traps += 1;
    for (const v of cnt.options) {
      const r = judgeLayerCount(cnt, v);
      assert.equal(r.correct, v === cnt.expected);
      if (v === cnt.expected) assert.equal(r.tag, null);
      else if (v > cnt.expected) assert.equal(r.tag, null);
      else if (v === c1) assert.equal(r.tag, BLOCK_TAGS.floor);
      else assert.equal(r.tag, BLOCK_TAGS.layer);
      assert.match(r.message, /모두 \d+개예요\.$/);
    }
    // 칠하기: 층별 모양만 보고 칠하는 까닭(from 'layers') — 좌우를 뒤집어 칠하면 "좌우 뒤집힘", 앞과 옆을 바꾸면 "앞과 옆"
    for (const q of [front, side]) {
      const [kind] = q.kinds;
      const other = kind === 'front' ? 'side' : 'front';
      assert.deepEqual(q.views[kind], viewCells(q.target, kind));
      const flip = q.views[kind].map((row) => [...row].reverse());
      assert.equal(judgeView(q, kind, flip, { from: 'layers' }).tag, BLOCK_TAGS.mirror);
      const swapped = judgeDrawing(q, { [kind]: q.views[other] }, { from: 'layers' });
      assert.equal(swapped.tag, BLOCK_TAGS.frontSide);
      assert.match(swapped.message, /층별 모양의 (아래쪽이 앞이에요|오른쪽에서 봐요)\.$/);
      const under = judgeDrawing(q, { [kind]: [[1, 1, 1], [0, 0, 0], [0, 0, 0]] }, { from: 'layers' });
      if (under.tag === BLOCK_TAGS.tallest) assert.match(under.message, /가장 높은 층/);
      assert.match(drawHint(q, { [kind]: [[1, 0, 0], [0, 0, 0], [0, 0, 0]] }, { from: 'layers' }), /^층별 모양에서 .*가장 높은 층은 \d층이에요\. (앞|옆)에서 본 모양에서는 그만큼 보여요\.$/);
    }
  }
  for (const p of pos) assert.ok(p / 1000 > 0.2 && p / 1000 < 0.3, `정답 자리 ${pos}`);
  // 보기의 값만 보고 고르는 규칙은 찍기(25%)보다 10%p 넘게 높지 않다(낮은 규칙은 그것을 피해도 남은 셋 가운데 찍기라 33%를 넘지 않는다)
  for (const [name, v] of Object.entries(rules)) assert.ok(v / 1000 < 0.35, `${name} ${v}`);
  assert.ok(traps / 1000 > 0.6, `함정 값이 든 문항 ${traps}`);
});

// ── 도전: 더 붙여서 만들기 ───────────────────
test('더 붙인 모양 (1·2개, 처음 모양 = 이어진 1~5개 모양 전부): 한 개씩 붙여 본 독립 계산과 붙인 모양의 묶음이 같고, madeFrom은 그 묶음에서만 참이다(붙인 것이 떨어진 모양·처음 모양을 옮긴 모양은 거짓)', () => {
  const bases = new Map();
  for (const h of ALL) {
    const n = count(h);
    if (n >= 1 && n <= 5 && isConnectedTop(h)) bases.set(mapKey(toCorner(h)), toCorner(h));
  }
  let pairs = 0;
  for (const base of bases.values()) {
    for (const n of [1, 2]) {
      const want = indepGrown(base, n);
      const got = new Set(grownShapes(base, n).map((g) => shapeKey(cubesOf(g))));
      assert.deepEqual([...got].sort(), [...want].sort(), `${mapKey(base)} +${n}`);
      // 후보(판 위 어디에 둔 처음 모양 + 아무 자리에 n개 — 떨어진 것도)마다 madeFrom = 독립 묶음에 있는가
      for (const placed of placements(cubesOf(base)).map(mapOf)) {
        const spots = [0, 1, 2, 3, 4, 5, 6, 7, 8];
        const tries = n === 1 ? spots.map((a) => [a]) : spots.flatMap((a) => spots.filter((b) => b >= a).map((b) => [a, b]));
        for (const add of tries) {
          const g = placed.map((row) => [...row]);
          for (const s of add) g[Math.floor(s / 3)][s % 3] += 1;
          if (g.flat().some((v) => v > 3)) continue;
          pairs += 1;
          assert.equal(madeFrom(base, g, n), want.has(shapeKey(cubesOf(g))) && connected(cubesOf(g)), `${mapKey(base)} → ${mapKey(g)}`);
        }
      }
    }
  }
  assert.ok(bases.size === 201 && pairs > 25000, `${bases.size} ${pairs}`); // 1~5개의 이어진 모양 201가지(통째로 옮긴 것은 하나)
  // addOne: 맨 위 또는 쌓인 자리와 변으로 이웃한 빈 자리의 바닥만 (뜬 것·떨어진 것 없음)
  assert.deepEqual(addOne([[1, 0, 0], [0, 0, 0], [0, 0, 0]]).map(mapKey).sort(), ['100/100/000', '110/000/000', '200/000/000'].sort());
  assert.equal(addOne([[3, 3, 3], [3, 3, 3], [3, 3, 3]]).length, 0);
});

test('돌리거나 뒤집어 만든 모양(madeFromAnyTurn): 48가지 행렬을 따로 만들어 견준다 — 문항의 보기 전부와 무작위 짝 20,000개', () => {
  assert.equal(MATRICES.length, 48);
  const rng = createRng('any-turn');
  const bases = ALL.filter((h) => count(h) >= 2 && count(h) <= 5 && isConnectedTop(h));
  for (let k = 0; k < 20000; k += 1) {
    const base = rng.pick(bases);
    const n = rng.int(0, 2);
    const shape = rng.pick(ALL);
    assert.equal(madeFromAnyTurn(base, shape, n), indepAnyTurn(base, shape, n), `${mapKey(base)} ${mapKey(shape)} ${n}`);
  }
  for (const seed of SEEDS.slice(0, 100)) {
    for (const q of questions('blocks-add', seed)) {
      const base = q.base;
      for (const o of q.options) {
        assert.equal(madeFromAnyTurn(base, o.map, q.n), indepAnyTurn(base, o.map, q.n));
        // 처음 모양 자체를 돌린 것(n = 0)은 늘 참
        assert.ok(madeFromAnyTurn(base, toCorner(base.map((row) => [...row].reverse())), 0));
      }
    }
  }
});

test('blocks-add 문제 만들기 (시드 1,000개 · 3,000문항): 보기 넷의 그림이 모두 다르고(처음 모양과도), 만들 수 있는 보기는 놓인 방향 그대로 붙여 만든 것, 만들 수 없는 보기는 돌리거나 뒤집어도 못 만든다. 정답 수·자리가 고르다', () => {
  const kinds = { 1: 0, 2: 0, 3: 0 };
  const pos = [0, 0, 0, 0];
  const roles = { answer: 0, more: 0, move: 0 };
  const rules = { sameCount: 0, notMore: 0, two: 0, mostCubes: 0 };
  let n = 0;
  let maxMs = 0;
  for (let seed = 1; seed <= 1000; seed += 1) {
    const t0 = performance.now();
    const qs = questions('blocks-add', seed);
    maxMs = Math.max(maxMs, performance.now() - t0);
    assert.deepEqual(qs.map((q) => q.n), [...ADD_PLAN]);
    assert.equal(new Set(qs.map((q) => shapeKey(cubesOf(q.base)))).size, 3);
    for (const q of qs) {
      n += 1;
      const b = count(q.base);
      assert.ok(b >= 3 && b <= 5 && isConnectedTop(q.base));
      assert.equal(q.options.length, 4);
      // 그림: 숨겨진 쌓기나무가 없다(광선) · 처음 모양과 보기 넷의 그림이 서로 다르다
      for (const h of [q.base, ...q.options.map((o) => o.map)]) assert.deepEqual(indepHidden(h), [], `${seed} ${mapKey(h)}`);
      assert.equal(new Set([q.base, ...q.options.map((o) => o.map)].map(lookKey)).size, 5);
      const right = q.options.map((o, i) => (o.role === 'answer' ? i + 1 : 0)).filter(Boolean);
      assert.deepEqual(q.answers, right);
      assert.equal(q.expected, right.join(','));
      kinds[right.length] += 1;
      for (const [i, o] of q.options.entries()) {
        roles[o.role] += 1;
        const key = shapeKey(cubesOf(o.map));
        if (o.role === 'answer') {
          pos[i] += 1;
          assert.ok(indepGrown(q.base, q.n).has(key), `${seed} 보기 ${i + 1}`);
          // 판에 놓인 처음 모양(q.base) 그 자리에서 붙이기만 해서 만들 수 있다
          assert.ok(placements(cubesOf(o.map)).some((p) => cubesOf(q.base).every((c) => p.some((d) => cubeKey(d) === cubeKey(c)))), `${seed} 자리`);
        } else {
          assert.ok(!indepAnyTurn(q.base, o.map, q.n), `${seed} 보기 ${i + 1} 돌려서 만들 수 있다`);
          assert.equal(count(o.map), b + q.n + (o.role === 'more' ? 1 : 0));
          if (o.role === 'more') assert.ok(indepGrown(q.base, q.n + 1).has(key));
        }
        // 붙인 쌓기나무 표시: 만들 수 있는 보기와 하나 더 붙여야 하는 보기는 붙인 칸이 n(n + 1)개, 옮겨야 하는 보기는 없음
        assert.equal(o.added.length, o.role === 'answer' ? q.n : o.role === 'more' ? q.n + 1 : 0);
      }
      assert.ok(q.options.some((o) => o.role === 'move'), '개수가 같은 "옮겨야 하는 모양"이 늘 하나 이상');
      // 보기의 꼴만 보는 규칙(모두 맞게 골라야 맞음): 개수가 처음 + n인 보기 모두 · 하나 더 붙인 것만 빼고 모두 · 늘 둘 · 쌓기나무가 가장 많은 것
      const pick = (sel) => (sel.join(',') === q.expected ? 1 : 0);
      const all = [1, 2, 3, 4];
      const counts = q.options.map((o) => count(o.map));
      rules.sameCount += pick(all.filter((i) => counts[i - 1] === b + q.n));
      rules.notMore += pick(all.filter((i) => counts[i - 1] <= b + q.n));
      rules.two += 1 / 6 * (q.answers.length === 2 ? 1 : 0);
      rules.mostCubes += pick(all.filter((i) => counts[i - 1] === Math.max(...counts)));
    }
  }
  assert.equal(n, 3000);
  // 만들 수 있는 보기의 수: 1 · 2 · 3이 1 : 2 : 1 안팎
  assert.ok(kinds[1] / n > 0.2 && kinds[1] / n < 0.3 && kinds[2] / n > 0.45 && kinds[2] / n < 0.55 && kinds[3] / n > 0.2 && kinds[3] / n < 0.3, JSON.stringify(kinds));
  // 자리마다 만들 수 있는 보기가 놓이는 비율이 고르다(넷 모두 45~55%)
  for (const p of pos) assert.ok(p / n > 0.45 && p / n < 0.55, `${pos}`);
  assert.equal(rules.sameCount, 0, '개수만 세어서는 한 문항도 맞히지 못한다');
  assert.equal(rules.notMore, 0);
  assert.ok(rules.two / n < 0.1 && rules.mostCubes / n < 0.15, JSON.stringify(rules));
  assert.ok(maxMs < 400, `가장 느린 판 ${maxMs.toFixed(0)}ms`);
});

test('blocks-add 채점: 예상(모두 고르기) · 내 판에서 붙여 만들기(기록하지 않는 경우 셋) · 만든 모양에 수 쓰기 · 힌트', () => {
  for (const seed of SEEDS.slice(0, 200)) {
    for (const q of questions('blocks-add', seed)) {
      // 예상: 고른 것이 만들 수 있는 보기와 꼭 같아야 맞음. 차례·겹침은 상관없다
      assert.equal(judgeAddGuess(q, [...q.answers].reverse()).correct, true);
      assert.equal(judgeAddGuess(q, [...q.answers, q.answers[0]]).correct, true);
      assert.equal(judgeAddGuess(q, []).empty, true);
      for (let mask = 1; mask < 16; mask += 1) {
        const chosen = [1, 2, 3, 4].filter((i) => mask & (1 << (i - 1)));
        const r = judgeAddGuess(q, chosen);
        assert.equal(r.correct, chosen.join(',') === q.expected);
        assert.equal(r.tag, r.correct ? null : BLOCK_TAGS.added);
        assert.equal(r.given, chosen.join(','));
        if (!r.correct) assert.match(r.message, /^만들 수 있는 모양은 [\d번, ]+이에요\. \d번(은|도) /);
      }
      for (let i = 1; i <= 4; i += 1) {
        const v = addVerdict(q, i);
        assert.equal(v.short, q.options[i - 1].role === 'answer' ? '돼요' : '안 돼요');
        assert.ok(v.long.length > 3);
      }
      // 만들기: 처음 모양 그대로 · 비움 · 보기에 없는 n개 붙인 모양은 기록하지 않는다
      assert.equal(judgeAddBuild(q, q.base).status, 'unchanged');
      assert.equal(judgeAddBuild(q, [[0, 0, 0], [0, 0, 0], [0, 0, 0]]).status, 'empty');
      for (const [i, o] of q.options.entries()) {
        const built = placements(cubesOf(o.map)).map(mapOf).find((g) => cubesOf(q.base).every(([x, y, z]) => g[y][x] > z)) ?? o.map;
        const r = judgeAddBuild(q, built);
        if (o.role === 'answer') {
          assert.equal(r.status, 'ok');
          assert.equal(r.option, i + 1);
          // 만든 모양에 수 쓰기: 자리마다 쌓인 개수면 맞음(자리마다 몇 개?와 같은 채점)
          const nq = addNumberQuestion(q, built);
          assert.equal(judgeNumbers(nq, built).correct, true);
          assert.equal(judgeNumbers(nq, built.map((row) => row.map((v) => (v ? 1 : 0)))).correct, built.flat().every((v) => v <= 1));
        } else {
          assert.equal(r.status, 'wrong');
          assert.equal(r.tag, BLOCK_TAGS.added);
        }
      }
      const others = grownShapes(q.base, q.n).filter((g) => !q.options.some((o) => shapeKey(cubesOf(o.map)) === shapeKey(cubesOf(g))));
      for (const g of others.slice(0, 3)) {
        const placed = placements(cubesOf(g)).map(mapOf).find((p) => cubesOf(q.base).every(([x, y, z]) => p[y][x] > z));
        if (placed) assert.equal(judgeAddBuild(q, placed).status, 'notOption');
      }
      // 떨어진 쌓기나무 · 하나 더 붙임 · 처음 모양의 쌓기나무를 뺌
      const far = q.base.map((row) => [...row]);
      const empty = [0, 1, 2, 3, 4, 5, 6, 7, 8].find((s) => far[Math.floor(s / 3)][s % 3] === 0 && ![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => (far[Math.floor(s / 3) + dy]?.[(s % 3) + dx] ?? 0) > 0));
      if (empty !== undefined && q.n === 1) {
        far[Math.floor(empty / 3)][empty % 3] = 1;
        assert.match(judgeAddBuild(q, far).message, /떨어진 쌓기나무가 있어요/);
      }
      // 힌트: 만들 수 있는 첫 보기를 처음 모양 자리에 맞춰 붙일 첫 칸 — 그 칸이 처음 모양 바로 위·옆이다(붙일 수 있는 자리)
      const hint = addBuildHint(q);
      assert.equal(hint.option, q.answers[0]);
      assert.equal(hint.z, q.base[hint.y][hint.x], `${seed} 힌트 층`);
      const grownOne = q.base.map((row) => [...row]);
      grownOne[hint.y][hint.x] += 1;
      assert.ok(madeFrom(q.base, grownOne, 1));
      assert.match(hint.text, /^\d번 모양은 \d줄 \d칸 자리의 \d층에/);
      for (const o of q.options) if (o.role !== 'move') assert.equal(addedCells(q.base, o.map).length, o.added.length);
    }
  }
});

// ── 도장 셋 ───────────────────────────────
test('쌓기나무 도장 셋: 학습 기록으로만 판정한다(숨은 도장 없음) — 숨겨진 쌓기나무 찾기는 "모두 몇 개일까?" 판마다 처음에 맞힌 수 − 2, 세 방향의 눈·층층이 쌓기는 문항마다 첫 [확인하기]', () => {
  assert.deepEqual(BLOCK_BADGES.map((b) => [b.id, b.title]), [
    ['blocks-hidden-finder', '숨겨진 쌓기나무 찾기'],
    ['blocks-three-eyes', '세 방향의 눈'],
    ['blocks-layer-builder', '층층이 쌓기'],
  ]);
  for (const b of BLOCK_BADGES) assert.ok(b.desc.endsWith('요') && b.icon && typeof b.test === 'function');
  const rec = (stageId, answers) => ({ stageId, cleared: true, stars: 3, answers: answers.map(([itemId, correct]) => ({ itemId, correct, given: null, expected: null, tag: null })) });
  const countPlay = (rights) => rec('blocks-count', [1, 2, 3, 4].map((i) => [`blocks-count:${i}`, rights.includes(i)]));
  // 숨겨진 문항은 한 판에 늘 둘(4문항의 절반) — 4문항 모두 맞히면 둘, 셋이면 하나 이상
  assert.equal(hiddenCountWins([countPlay([1, 2, 3, 4])]), 2);
  assert.equal(hiddenCountWins([countPlay([1, 2, 3])]), 1);
  assert.equal(hiddenCountWins([countPlay([1, 2])]), 0);
  assert.equal(hiddenCountWins([countPlay([1, 2, 3, 4]), countPlay([2, 3, 4])]), 3);
  const state = (records) => ({ records });
  const [hidden, three, layer] = BLOCK_BADGES;
  assert.equal(hidden.test(state([countPlay([1, 2, 3, 4])])), false);
  assert.equal(hidden.test(state([countPlay([1, 2, 3, 4]), countPlay([1, 2, 4])])), true);
  // 세 방향의 눈: 쌓기(":build")의 첫 [확인하기]만 — 예상·다른 개수로 쌓기는 세지 않고, 틀린 뒤 맞힌 것도 세지 않는다
  const buildPlay = (firsts) => rec('blocks-build', [1, 2, 3].flatMap((i) => [
    ...(firsts.includes(i) ? [] : [[`blocks-build:${i}:build`, false]]),
    [`blocks-build:${i}:build`, true],
    [`blocks-build:${i}:guess`, true],
    [`blocks-build:${i}:other`, true],
  ]));
  assert.equal(threeViewWins([buildPlay([1, 2, 3])]), 3);
  assert.equal(threeViewWins([buildPlay([1])]), 1);
  assert.equal(three.test(state([buildPlay([1, 2]), buildPlay([3])])), true);
  assert.equal(three.test(state([buildPlay([1, 2])])), false);
  // 층층이 쌓기
  const layerPlay = (firsts) => rec('blocks-layer-build', [1, 2, 3].flatMap((i) => [...(firsts.includes(i) ? [] : [[`blocks-layer-build:${i}`, false]]), [`blocks-layer-build:${i}`, true]]));
  assert.equal(layerBuildWins([layerPlay([1, 2, 3])]), 3);
  assert.equal(layer.test(state([layerPlay([1, 3])])), false);
  assert.equal(layer.test(state([layerPlay([1, 3]), layerPlay([2])])), true);
  // 다른 단계의 기록은 세지 않는다
  assert.equal(layerBuildWins([rec('blocks-fromnum', [['blocks-fromnum:1', true]])]), 0);
  assert.equal(hiddenCountWins([]), 0);
});

// ── 별과 점수 ──────────────────────────
/** 독립 계산(docs/engine.md 10절의 점수 표만 보고): 처음 시도에 맞힘 +2 · 틀린 뒤 다시 맞힘 +1 · 다시 일어서기 +1 · 연속 3의 배수마다 +1 */
function indepScore(steps) {
  const tried = new Map();
  let xp = 0;
  let streak = 0;
  let fell = false;
  for (const s of steps) {
    const isNew = !tried.has(s.itemId);
    if (!s.correct) {
      streak = 0;
      if (isNew) {
        fell = true;
        tried.set(s.itemId, false);
      }
      continue;
    }
    if (isNew) {
      xp += 2;
      streak += 1;
      if (streak % 3 === 0) xp += 1;
      if (fell) xp += 1;
      fell = false;
    } else if (tried.get(s.itemId) === false) xp += 1;
    tried.set(s.itemId, true);
  }
  return xp;
}
const enginePlay = (steps, startStars = 0) => {
  const play = createPlayReward({ startStars });
  for (const s of steps) play.answer({ itemId: s.itemId, correct: s.correct });
  return play;
};
/** S3 단계 한 판의 답 계획: [itemId, 'once' | 'retry'] */
const PLANS = {
  'blocks-layer-draw': [1, 2, 3].map((i) => [`blocks-layer-draw:${i}`, 'retry']),
  'blocks-layer-build': [1, 2, 3].map((i) => [`blocks-layer-build:${i}`, 'retry']),
  'blocks-layer-views': [['blocks-layer-views:1', 'once'], ['blocks-layer-views:2', 'retry'], ['blocks-layer-views:3', 'retry']],
  'blocks-add': [1, 2, 3].flatMap((i) => [[`blocks-add:${i}:guess`, 'once'], [`blocks-add:${i}:build`, 'retry'], [`blocks-add:${i}:write`, 'retry']]),
};
function randomPlay(id, rng, p) {
  const steps = [];
  for (const [itemId, kind] of PLANS[id]) {
    for (;;) {
      const correct = rng.next() < p;
      steps.push({ itemId, correct });
      if (correct || kind === 'once') break;
    }
  }
  return steps;
}

test('점수(S3): 답 순서 6,000판에서 엔진의 점수 = 독립 계산, 모두 맞힌 판보다 많이 받는 길 0, 별 3개 단계를 다시 하면 0', () => {
  const rng = createRng('s3-score');
  const ids = Object.keys(PLANS);
  for (let n = 0; n < 6000; n += 1) {
    const id = ids[n % ids.length];
    const steps = randomPlay(id, rng, [0.3, 0.6, 0.85, 1][n % 4]);
    const play = enginePlay(steps);
    assert.equal(play.xp(), indepScore(steps), `${id} ${JSON.stringify(steps)}`);
    assert.ok(play.xp() <= indepScore(randomPlay(id, createRng(`perfect:${n}`), 1)));
    assert.equal(enginePlay(steps, 3).xp(), 0);
  }
});

test('별(S3): 층별 모양만 보고 알아내기는 틀린 횟수로(개수 고르기를 한 번 틀리면 정답률 67%) — 모든 답 순서를 나열하면 네 단계 모두 ★1·★2·★3이 나오고, 틀려서 더 받는 길이 없다', () => {
  const enumerate = (plan) => {
    let out = [[]];
    plan.forEach(([itemId, kind]) => {
      const ways = kind === 'once'
        ? [[{ itemId, correct: true }], [{ itemId, correct: false }]]
        : [0, 1, 2, 3].map((w) => [...Array.from({ length: w }, () => ({ itemId, correct: false })), { itemId, correct: true }]);
      out = out.flatMap((prefix) => ways.map((w) => [...prefix, ...w]));
    });
    return out;
  };
  for (const [id, plan] of Object.entries(PLANS)) {
    const s = stage(id);
    const byWrong = s.starsBy === 'wrong';
    assert.equal(byWrong, id === 'blocks-layer-views', id);
    const results = enumerate(plan).map((steps) => {
      const wrong = steps.filter((x) => !x.correct).length;
      const stars = byWrong ? starsByWrong(wrong) : starsFromAccuracy(steps.filter((x) => x.correct).length / steps.length);
      const sx = stageXp({ prevStars: 0, stars, cleared: true, challenge: Boolean(s.challenge) }).total;
      return { wrong, stars, total: indepScore(steps) + sx, engine: enginePlay(steps).xp() + sx };
    });
    assert.deepEqual([...new Set(results.map((r) => r.stars))].sort(), [1, 2, 3], id);
    for (const r of results) {
      assert.equal(r.engine, r.total, id);
      if (r.wrong === 0) assert.equal(r.stars, 3);
      // 문항이 셋뿐인 단계는 한 번 틀리면 ★2(정답률이든 틀린 횟수든). 도전(답 9개 이상)은 다시 하는 답을 한 번 틀리면 9/10 = 90%라 ★3,
      // 한 번만 답하는 예상을 틀리면 8/9라 ★2
      if (r.wrong === 1) assert.ok(id === 'blocks-add' ? [2, 3].includes(r.stars) : r.stars === 2, `${id} 한 번 틀림`);
    }
    const best = Math.max(...results.filter((r) => r.wrong === 0).map((r) => r.total));
    for (const r of results) if (r.wrong > 0) assert.ok(r.total < best, `${id} ${JSON.stringify(r)}`);
  }
  assert.equal(starsFromAccuracy(2 / 3), 1);
  assert.equal(starsFromAccuracy(3 / 4), 2);
});

test('차시 점수(S3): 모두 처음에 맞히는 학생이 5차시에서 받는 점수와 도전 주문서 점수(칭호 기준 0·40·100·180·300과 견줄 값)', () => {
  const xpOf = (id) => {
    const s = stage(id);
    return indepScore(randomPlay(id, createRng('all'), 1)) + stageXp({ prevStars: 0, stars: 3, cleared: true, challenge: Boolean(s.challenge) }).total;
  };
  // 그리기 3문항(6 + 연속 1 + 11) + 쌓기 3문항(18) + 층별 모양만 보고 3문항(18) = 54 · 도전: 답 9개(18 + 연속 3) + 도전 성공 10 + 별 6 = 37
  assert.deepEqual(['blocks-layer-draw', 'blocks-layer-build', 'blocks-layer-views'].map(xpOf), [18, 18, 18]);
  assert.equal(xpOf('blocks-add'), 37);
});

test('화면 문장(S3): 비지 않고, 조사가 맞고, "만든 모양"을 쓰며 교과서 용어("층별 모양", "1층·2층·3층")를 쓴다', () => {
  const texts = BLOCK_STAGES.filter((s) => s.lesson === 'blocks-layer').flatMap((s) => [s.title, s.goal, s.order]);
  for (const seed of SEEDS.slice(0, 60)) {
    for (const q of questions('blocks-layer-draw', seed)) {
      texts.push(judgeLayerDrawing(q, { 2: q.layers[1], 3: q.layers[2] }).message, judgeLayerDrawing(q, { 2: q.layers[0], 3: q.layers[1] }).message);
      texts.push(judgeLayerDrawing(q, { 2: GRIDS[511], 3: GRIDS[1] }).message, layerDrawHint(q, { 2: GRIDS[1], 3: GRIDS[1] }).text);
      texts.push(...q.layers.map((g, i) => describeLayer(g, i + 1)));
    }
    for (const q of questions('blocks-layer-build', seed)) {
      texts.push(judgeLayerBuild(q, q.target).message, judgeLayerBuild(q, mirrorMap(q.target)).message, judgeLayerBuild(q, [[1, 0, 0], [0, 0, 0], [0, 0, 0]]).message, layerBuildHint(q, [[1, 0, 0], [0, 0, 0], [0, 0, 0]]).text);
    }
    for (const q of questions('blocks-layer-views', seed)) {
      if (q.kind === 'count') for (const v of q.options) texts.push(judgeLayerCount(q, v).message);
      else texts.push(judgeDrawing(q, { [q.kinds[0]]: GRIDS[7] }, { from: 'layers' }).message);
    }
    for (const q of questions('blocks-add', seed)) {
      for (let mask = 1; mask < 16; mask += 1) texts.push(judgeAddGuess(q, [1, 2, 3, 4].filter((i) => mask & (1 << (i - 1)))).message);
      texts.push(judgeAddBuild(q, q.base).message, judgeAddBuild(q, q.options[0].map).message, addBuildHint(q).text);
      for (let i = 1; i <= 4; i += 1) texts.push(addVerdict(q, i).long);
    }
  }
  for (const t of texts) {
    assert.ok(typeof t === 'string' && t.trim().length > 0);
    assert.doesNotMatch(t, /쌓은 모양|undefined|null|NaN|\[object/, t);
    assert.doesNotMatch(t, /칸를|칸는 |층를|줄를|1라고|2이라고|3라고|1예요|2이에요|3예요|개를 더 붙여야 해요\.\d|번는/, t);
  }
  assert.ok(texts.some((t) => /층별 모양/.test(t)) && texts.some((t) => /1층에 \d+개, 2층에 \d+개, 3층에 \d+개, 모두 \d+개예요\./.test(t)));
});
