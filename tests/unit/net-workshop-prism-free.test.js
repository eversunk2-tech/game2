/**
 * 전개도 완성하기 (prism-free — Build G2): 각기둥 · 카드 · 붙이기 · 판정 · 같은 모양의 열쇠 · 모음 칸 · 한 판의 점수 · 붙일 자리.
 * 판정과 가짓수는 독립 계산(net-workshop-prism-free-indep.js — 저장소의 판정 코드를 쓰지 않고 기획서 문장만으로 짬)과 견준다.
 * 기획서: spec-grade6.md 2-2 · 4 · 5 · 6-4 · 8 · 15-2 · 15-25 · 15-26절, spec.md 16-2 · 16-8 · 16-9 · 16-12 · 16-14, common-rules 1 · 2 · 3절.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../src/shared/core/random.js';
import { interiorAngle } from '../../src/games/net-workshop/geometry.js';
import { polyNetKey, prismNet, prismNetCatalog } from '../../src/games/net-workshop/solids.js';
import { spanningTrees } from '../../src/games/net-workshop/fold.js';
import * as L from '../../src/games/net-workshop/grade6/prism-free-logic.js';
import { FREE_NET_CODES } from '../../src/games/net-workshop/grade6/prism-free-data.js';
import {
  PRISM_BADGES, PRISM_COLLECTIONS, PRISM_FREE_COLLECTION, PRISM_FREE_FULL_SCORE, PRISM_FREE_SOLIDS, PRISM_STAGES, PRISM_TAGS, prismDesigns, prismFreeItemId,
} from '../../src/games/net-workshop/grade6/prism-stages.js';
import { countNets, foldsToPrism } from './net-workshop-prism-free-indep.js';
import { collectItem, collectionXp, normalizeCollectionState, normalizeCollections } from '../../src/shared/core/collection.js';
import { discoverXp } from '../../src/shared/core/rewards.js';

const STAGE = PRISM_STAGES.find((s) => s.id === 'prism-free');
const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6;
const samePoly = (p, q) => p.length === q.length && p.every((a) => q.some((b) => near(a, b)));

/** 무작위로 카드를 붙여 판을 채운다(학생처럼 — guided면 길이가 맞는 자리를 먼저 고른다). → 놓인 면들 (다 못 채우면 null) */
function randomBuild(play, k, rng, guided) {
  const fs = L.freeSolid(play.solidId);
  const cards = L.freeCards(fs);
  const placed = L.givenFaces(play, k).map((f) => ({ ...f }));
  for (let guard = 0; guard < 400 && placed.length < cards.length; guard += 1) {
    const left = cards.filter((c) => !placed.some((p) => p.id === c.id));
    const card = rng.pick(left);
    const edge = rng.pick(L.attachEdges(card));
    const free = L.freeEdges(placed);
    let target = rng.pick(free);
    if (guided) {
      const len = L.edgeLengthOf(card.poly, edge);
      const fit = free.filter((f) => Math.abs(Math.hypot(f.q[0] - f.p[0], f.q[1] - f.p[1]) - len) < 1e-6);
      if (fit.length > 0) target = rng.pick(fit);
    }
    const poly = L.attachPoly(card.poly, edge, [target.p, target.q]);
    if (L.overlapsPlaced(poly, placed)) continue;
    placed.push({ id: card.id, role: card.role, label: card.label, poly });
  }
  return placed.length === cards.length ? placed : null;
}

/** 전개도(prismNet)를 카드로 다시 만든다: 밑면 b0에서 경첩을 따라 카드를 붙여(붙일 수 있는 변만 써서) — 같은 모양이 되는지 */
function rebuild(fs, net) {
  const cards = L.freeCards(fs);
  const b0 = net.faces.find((f) => f.solid === 'b0');
  const placed = [{ id: cards.find((c) => c.solid === 'b0').id, role: 'base', label: '가', poly: b0.poly.map((p) => [...p]), solid: 'b0' }];
  const want = net.faces.filter((f) => f.solid !== 'b0');
  for (let guard = 0; guard < 60 && want.length > 0; guard += 1) {
    for (const f of [...want]) {
      const parent = placed.find((p) => p.poly.some((a, i) => {
        const b = p.poly[(i + 1) % p.poly.length];
        return f.poly.some((c, j) => near(c, b) && near(f.poly[(j + 1) % f.poly.length], a));
      }));
      if (!parent) continue;
      const e = parent.poly.findIndex((a, i) => {
        const b = parent.poly[(i + 1) % parent.poly.length];
        return f.poly.some((c, j) => near(c, b) && near(f.poly[(j + 1) % f.poly.length], a));
      });
      const card = cards.find((c) => c.role === f.role && !placed.some((p) => p.id === c.id)
        && L.attachEdges(c).some((k) => samePoly(L.attachPoly(c.poly, k, [parent.poly[e], parent.poly[(e + 1) % parent.poly.length]]), f.poly)));
      if (!card) return null;
      const k = L.attachEdges(card).find((kk) => samePoly(L.attachPoly(card.poly, kk, [parent.poly[e], parent.poly[(e + 1) % parent.poly.length]]), f.poly));
      placed.push({ id: card.id, role: card.role, label: card.label, poly: L.attachPoly(card.poly, k, [parent.poly[e], parent.poly[(e + 1) % parent.poly.length]]) });
      want.splice(want.indexOf(f), 1);
    }
  }
  return want.length === 0 ? placed : null;
}

test('각기둥 여섯: 밑면이 정삼각형이 아닌 이등변삼각형 · 직사각형이 아닌 등변사다리꼴 · 정육각형(좌우가 같은 모양이라 카드를 뒤집지 않아도 된다), 높이는 어느 변과도 다르다(정사각형 카드 없음)', () => {
  const ids = Object.keys(L.FREE_SHAPES);
  assert.deepEqual(ids, PRISM_FREE_SOLIDS.map((s) => s.id));
  for (const id of ids) {
    const fs = L.freeSolid(id);
    const shape = L.FREE_SHAPES[id];
    const angles = shape.base.map((_, i) => (interiorAngle(shape.base, i) * 180) / Math.PI);
    if (fs.kind === 'tri') {
      assert.equal(fs.n, 3);
      assert.ok(new Set(fs.lengths).size === 2, `${id} 이등변(정삼각형 아님)`);
    } else if (fs.kind === 'trap') {
      assert.equal(fs.n, 4);
      assert.ok(angles.every((a) => Math.abs(a - 90) > 5), `${id} 직사각형이 아님`);
    } else {
      assert.equal(fs.n, 6);
      assert.equal(new Set(fs.lengths).size, 1);
    }
    assert.ok(fs.lengths.every((len) => Math.abs(len - fs.height) > 0.4), `${id} 높이 ≠ 변`);
    // 좌우가 같은 모양: 꼭짓점 차례를 거꾸로 한 다각형이 돌리기만으로 겹친다
    const n = shape.base.length;
    const L0 = fs.lengths;
    assert.ok(Array.from({ length: n }, (_, k) => k).some((k) => L0.every((_, i) => Math.abs(L0[i] - L0[(((k - i - 1) % n) + n) % n]) < 1e-9)), `${id} 좌우 대칭`);
  }
});

test('면 카드: 한 벌(밑면 2 + 옆면 = 변의 수), 옆면은 가로(밑면의 변) × 세로(높이) 직사각형, 같은 크기는 한 묶음. 붙일 변은 놓이는 모양이 다른 것만(직사각형 2 · 정육각형 1 · 이등변삼각형 3 · 사다리꼴 4)', () => {
  for (const id of Object.keys(L.FREE_SHAPES)) {
    const fs = L.freeSolid(id);
    const cards = L.freeCards(fs);
    assert.equal(cards.length, fs.n + 2);
    assert.equal(cards.filter((c) => c.role === 'base').length, 2);
    for (const c of cards.filter((x) => x.role === 'side')) {
      assert.equal(c.h, fs.height);
      assert.ok(fs.lengths.includes(c.w));
      assert.equal(c.group, `s:${c.w}`);
      assert.deepEqual(L.attachEdges(c), [1, 0]);
    }
    const base = cards.find((c) => c.role === 'base');
    assert.equal(L.attachEdges(base).length, { tri: 3, trap: 4, hex: 1 }[fs.kind], id);
    for (const c of cards) assert.ok(L.signedArea(c.poly) > 0, '모든 카드는 같은 돌림 방향');
  }
});

test('가짓수: 각기둥마다 서로 다른 전개도 수 = 적어 둔 열쇠 목록(FREE_NET_CODES) = 신장 트리를 모두 펼친 모양 열쇠(polyNetKey) 가짓수 = 독립 계산 (이등변삼각기둥 23 · 사다리꼴기둥 104 · 정육각기둥 354)', () => {
  const expected = { 'tri-a': 23, 'tri-b': 23, 'trap-a': 104, 'trap-b': 104, 'hex-a': 354, 'hex-b': 354 };
  for (const s of PRISM_FREE_SOLIDS) {
    const fs = L.freeSolid(s.id);
    const codes = L.freeNetCodes(fs);
    assert.deepEqual(codes, [...FREE_NET_CODES[s.id]], `${s.id} 적어 둔 열쇠`);
    assert.equal(s.count, codes.length);
    assert.equal(codes.length, expected[s.id]);
    assert.equal(prismNetCatalog(fs.solid).length, codes.length, `${s.id} 모양 열쇠`);
    assert.equal(countNets(L.FREE_SHAPES[s.id].base, L.FREE_SHAPES[s.id].height), codes.length, `${s.id} 독립`);
  }
});

test('같은 모양의 열쇠: 신장 트리의 대칭 묶음(canonicalCode)과 펼친 그림의 모양 열쇠(polyNetKey)가 하나씩 맞선다 — 합동인 전개도는 같은 칸, 다른 전개도는 다른 칸', () => {
  for (const id of ['tri-a', 'trap-a', 'hex-a']) {
    const fs = L.freeSolid(id);
    const byCode = new Map();
    const byKey = new Map();
    for (const tree of spanningTrees(fs.solid)) {
      const net = prismNet(fs.solid, tree);
      const code = L.canonicalCode(fs.solid, tree.map((e) => [e.a, e.b]));
      if (!FREE_NET_CODES[id].includes(code)) continue;
      const key = polyNetKey(net);
      if (byCode.has(code)) assert.equal(byCode.get(code), key, `${id} 열쇠 하나에 모양 둘`);
      else byCode.set(code, key);
      if (byKey.has(key)) assert.equal(byKey.get(key), code, `${id} 모양 하나에 열쇠 둘`);
      else byKey.set(key, code);
    }
    assert.equal(byCode.size, FREE_NET_CODES[id].length);
  }
});

test('카드로 다시 만든 모든 전개도(각기둥마다 서로 다른 것 전부)는 각기둥이 되고, 칸 id가 그 열쇠의 차례 — 돌리거나 뒤집어 놓아도 같은 칸', () => {
  for (const s of PRISM_FREE_SOLIDS) {
    const fs = L.freeSolid(s.id);
    const ids = new Set();
    for (const entry of prismNetCatalog(fs.solid)) {
      const placed = rebuild(fs, entry.net);
      assert.ok(placed, `${s.id} 카드로 만들 수 있어야`);
      const r = L.judgeFreeNet(fs, placed, placed[0].id);
      assert.ok(r.valid, `${s.id} ${r.problems.map((p) => p.type)}`);
      assert.ok(r.id, '칸 id');
      assert.ok(foldsToPrism(placed.map((p) => p.poly), L.FREE_SHAPES[s.id].base, L.FREE_SHAPES[s.id].height).ok, '독립 판정');
      ids.add(r.id);
      // 통째로 돌리고 뒤집은(꼭짓점 차례를 거꾸로 해 돌림 방향을 지킨) 같은 전개도
      const flip = placed.map((f) => ({ ...f, poly: [...f.poly].reverse().map(([x, y]) => [-x, y]) }));
      const turned = placed.map((f) => ({ ...f, poly: f.poly.map(([x, y]) => [x * Math.cos(1.1) - y * Math.sin(1.1) + 5, x * Math.sin(1.1) + y * Math.cos(1.1) - 2]) }));
      // 뒤집은 것은 처음부터 놓인 밑면이 뒤집혀 놓이므로(밑면이 좌우 대칭이라 같은 모양) 열쇠만 견준다
      const flipR = L.judgeFreeNet(fs, flip, flip[0].id);
      const turnR = L.judgeFreeNet(fs, turned, turned[0].id);
      assert.ok(flipR.valid && turnR.valid, '뒤집거나 돌려도 각기둥');
      assert.equal(flipR.id, r.id);
      assert.equal(turnR.id, r.id);
    }
    assert.equal(ids.size, s.count, `${s.id} 칸이 모두 다르다`);
    assert.deepEqual([...ids].sort(), Array.from({ length: s.count }, (_, i) => prismFreeItemId(s.id, i)).sort());
  }
});

test('판정 = 독립 계산: 학생처럼 무작위로 붙인 판 2,400개(길이를 맞춰 붙인 판과 아무렇게나 붙인 판) — 되는지 어긋남 0, 되는 것은 늘 칸 id가 있다', () => {
  let valid = 0;
  let count = 0;
  for (let seed = 0; seed < 1200; seed += 1) {
    const rng = createRng(`indep-${seed}`);
    const play = L.makeFreePlay(STAGE, rng);
    for (const k of [1, 2]) {
      const placed = randomBuild(play, k, rng, seed % 3 !== 0);
      if (!placed) continue;
      count += 1;
      const r = L.judgeFreeNet(L.freeSolid(play.solidId), placed, placed[0].id);
      const ind = foldsToPrism(placed.map((p) => p.poly), L.FREE_SHAPES[play.solidId].base, L.FREE_SHAPES[play.solidId].height);
      assert.equal(r.valid, ind.ok, `시드 ${seed} 주문 ${k}: 앱 ${r.problems.map((p) => p.type)} · 독립 ${ind.why}`);
      if (r.valid) {
        valid += 1;
        assert.ok(r.id);
      } else {
        assert.ok(L.freeReasons(r.problems).length >= 1, '참인 까닭 칩이 하나 이상');
        assert.ok(L.explainFreeProblem(r.net, r.problems).length > 10);
      }
    }
  }
  assert.ok(count > 2000 && valid > 100, `${count} · ${valid}`);
});

test('붙이기: 카드는 그 모서리의 바깥쪽에 붙고(놓인 면과 넓이가 겹치지 않음) 두 변의 가운데가 맞는다. 놓인 면과 겹치는 자리는 붙지 않는다', () => {
  const rng = createRng('attach');
  for (let i = 0; i < 300; i += 1) {
    const play = L.makeFreePlay(STAGE, rng);
    const fs = L.freeSolid(play.solidId);
    const cards = L.freeCards(fs);
    const placed = L.givenFaces(play, 1);
    const free = L.freeEdges(placed);
    const e = rng.pick(free);
    const card = rng.pick(cards.filter((c) => !placed.some((p) => p.id === c.id)));
    const k = rng.pick(L.attachEdges(card));
    const poly = L.attachPoly(card.poly, k, [e.p, e.q]);
    const parent = placed.find((p) => p.id === e.face);
    const midP = [(e.p[0] + e.q[0]) / 2, (e.p[1] + e.q[1]) / 2];
    const c0 = poly[k];
    const c1 = poly[(k + 1) % poly.length];
    assert.ok(near([(c0[0] + c1[0]) / 2, (c0[1] + c1[1]) / 2], midP), '가운데 맞춤');
    assert.ok(!L.overlapsPlaced(poly, [parent]), '바깥쪽');
    assert.ok(L.signedArea(poly) > 0, '돌림 방향 그대로');
  }
});

test('주문: 같은 시드면 같은 주문, 세 종류가 고르게, 주문 ①은 밑면 + 그 밑면이 붙은 옆면(+ 그 옆 옆면) — 이어져 있고, 남은 카드로 완성하는 서로 다른 전개도가 2가지 이상(6-4절)', () => {
  const kinds = { tri: 0, trap: 0, hex: 0 };
  const treesOf = new Map(PRISM_FREE_SOLIDS.map((x) => {
    const fs = L.freeSolid(x.id);
    return [x.id, spanningTrees(fs.solid).map((tree) => ({ pairs: tree.map((e) => [e.a, e.b].sort().join('|')), code: L.canonicalCode(fs.solid, tree.map((e) => [e.a, e.b])) }))];
  }));
  for (let seed = 0; seed < 300; seed += 1) {
    const a = L.makeFreePlay(STAGE, createRng(`order-${seed}`));
    const b = L.makeFreePlay(STAGE, createRng(`order-${seed}`));
    assert.deepEqual(a, b);
    const portrait = L.makeFreePlay(STAGE, createRng(`order-${seed}`), { portrait: true });
    assert.equal(portrait.solidId, a.solidId);
    assert.deepEqual(portrait.given1, a.given1);
    kinds[L.freeSolid(a.solidId).kind] += 1;
    assert.equal(a.given1[0], 'b0');
    assert.ok(a.given1.length >= 2 && a.given1.length <= 3);
    const given = L.givenFaces(a, 1);
    assert.equal(L.freeEdges(given).length, given.reduce((s, f) => s + f.poly.length, 0) - 2 * (given.length - 1), '이어져 있다');
    // 완성 가짓수: 주어진 면의 경첩을 모두 품은 서로 다른 전개도(열쇠) — 2가지 이상
    const fs = L.freeSolid(a.solidId);
    const links = [];
    for (let i = 1; i < a.given1.length; i += 1) {
      const sid = a.given1[i];
      const partner = i === 1 ? 'b0' : a.given1[1];
      links.push([partner, sid].sort().join('|'));
    }
    const codes = new Set();
    for (const { pairs, code } of treesOf.get(a.solidId)) {
      if (!links.every((l) => pairs.includes(l))) continue;
      if (FREE_NET_CODES[a.solidId].includes(code)) codes.add(code);
    }
    void fs;
    assert.ok(codes.size >= 2, `시드 ${seed}: ${codes.size}`);
    // 주문 ② 이후: 밑면 하나
    assert.deepEqual(L.givenFaces(a, 2).map((f) => f.solid), ['b0']);
  }
  for (const v of Object.values(kinds)) assert.ok(v > 60, JSON.stringify(kinds));
});

test('한 판의 점수(common-rules 3절 · spec 16-8 · 16-9 · 16-14): 처음 만든 전개도만 모음에 넣고 점수(once), 전에 찾은 것은 점수 없음, 이번 판에 접어 본 모양은 기록도 없음, 10가지 뒤는 등록 1점뿐(later), 안 되는 모양은 점수 없음', () => {
  const play = L.makeFreePlay(STAGE, createRng('score-1'));
  const fs = L.freeSolid(play.solidId);
  const catalog = prismNetCatalog(fs.solid);
  const first = rebuild(fs, catalog[0].net);
  const second = rebuild(fs, catalog[1].net);
  const s = L.createFreeSession({ solidId: play.solidId });
  const a = s.fold(first, first[0].id);
  assert.equal(a.kind, 'new');
  assert.ok(a.first && a.log && a.collect && a.collect.id === PRISM_FREE_COLLECTION);
  assert.equal(a.later, false);
  const again = s.fold(first, first[0].id);
  assert.equal(again.kind, 'repeat');
  assert.equal(again.log, false);
  assert.equal(again.collect, null);
  const known = L.createFreeSession({ solidId: play.solidId, deviceFound: [a.id] }).fold(first, first[0].id);
  assert.equal(known.kind, 'known');
  assert.equal(known.first, false);
  assert.equal(known.found, 1, '전에 찾은 것도 이번 판의 가지 수에는 센다');
  const b = s.fold(second, second[0].id);
  assert.equal(b.found, 2);
  assert.equal(b.done, true);
  assert.equal(b.full, false);
  // 이 기기에서 이미 10가지를 찾았으면 새 전개도는 later
  const many = Array.from({ length: PRISM_FREE_FULL_SCORE }, (_, i) => prismFreeItemId('hex-a', i));
  const late = L.createFreeSession({ solidId: play.solidId, deviceFound: many }).fold(first, first[0].id);
  assert.equal(late.kind, 'new');
  assert.equal(late.later, true);
  // 안 되는 모양
  const bad = randomBuild(play, 1, createRng('bad'), false);
  const r = L.createFreeSession({ solidId: play.solidId }).fold(bad, bad[0].id);
  if (!r.valid) {
    assert.equal(r.kind, 'invalid');
    assert.equal(r.collect, null);
    assert.ok(Object.values(PRISM_TAGS).includes(r.tag), r.tag);
  }
  // 별: 찾은 가지 수
  assert.deepEqual([0, 1, 2, 3, 4].map(L.freeStars), [0, 1, 2, 3, 3]);
  assert.equal(L.freeStarNote(2), '서로 다른 전개도 3가지를 찾으면 별 3개!');
  assert.equal(L.freeStarNote(3), null);
});

test('점수 상한(사용자 결정 15-29): 이 기기에서 처음 10가지는 제 점수, 11~30번째는 하나에 +1, 31번째부터 0점 — 962칸을 어떤 순서로 찾아도 등록 점수의 합 70, 이 단계 최대 104점(독립 계산). 찾은 가지 수는 계속 오른다', () => {
  // 독립: 기획서 문장 그대로 — 처음 10가지 × (등록 5 + 만들기 성공 2) + 연속(처음 시도 3번마다 +1) 3 + 11~30번째 20가지 × 1 + 단계 완료 5 + 별 3개 6
  const indepMax = 10 * (5 + 2) + Math.floor(10 / 3) + 20 * 1 + 5 + 6;
  assert.equal(indepMax, 104);
  // 엔진의 모음 점수(xpAfter): 962칸을 무작위 순서 3가지로 모두 찾을 때 등록 점수의 합
  const [def] = normalizeCollections(PRISM_COLLECTIONS);
  assert.equal(def.items.length, 962);
  for (const seed of ['a', 'b', 'c']) {
    let state = normalizeCollectionState(null, [def]);
    let sum = 0;
    let found = 0;
    for (const item of createRng(`cap-${seed}`).shuffle(def.items)) {
      const r = collectItem(state, [def], def.id, item.id);
      state = r.state;
      found = r.count;
      sum += discoverXp(collectionXp(def, r.count));
    }
    assert.equal(sum, 10 * 5 + 20 * 1);
    assert.equal(found, 962, '찾은 가지 수는 끝까지 오른다');
  }
  // 한 판의 흐름: 기기에 n가지가 있을 때 새 전개도는 — 10가지 안 · 11~30번째 later · 31번째부터 over (만들기 성공 점수는 처음 10가지만)
  const play = L.makeFreePlay(STAGE, createRng('cap-play'));
  const fs = L.freeSolid(play.solidId);
  const faces = rebuild(fs, prismNetCatalog(fs.solid)[0].net);
  const other = (k) => Array.from({ length: k }, (_, i) => prismFreeItemId(play.solidId === 'hex-a' ? 'hex-b' : 'hex-a', i));
  const flags = [0, 9, 10, 29, 30, 200].map((k) => {
    const step = L.createFreeSession({ solidId: play.solidId, deviceFound: other(k) }).fold(faces, faces[0].id);
    return [k + 1, step.kind, step.later, step.over, step.deviceCount];
  });
  assert.deepEqual(flags, [[1, 'new', false, false, 1], [10, 'new', false, false, 10], [11, 'new', true, false, 11], [30, 'new', true, false, 30], [31, 'new', true, true, 31], [201, 'new', true, true, 201]]);
  assert.match(L.FREE_OVER_NOTE, /30가지/);
});

test('점수 독립 계산: 무작위 접기 순서 300판 — 안 되는 모양을 일부러 끼워도 점수 받는 답(once)은 처음 만든 전개도 수와 같고, 같은 모양을 두 번 접어 점수를 두 번 받는 길이 없다', () => {
  const nets = new Map(); // 각기둥마다 다시 만든 전개도 몇 개(앞의 여섯 — 같은 판에서 되풀이해 접는다)
  for (const s of PRISM_FREE_SOLIDS) {
    const fs = L.freeSolid(s.id);
    nets.set(s.id, prismNetCatalog(fs.solid).slice(0, 6).map((entry) => rebuild(fs, entry.net)));
  }
  for (let seed = 0; seed < 300; seed += 1) {
    const rng = createRng(`order-score-${seed}`);
    const play = L.makeFreePlay(STAGE, rng);
    const device = new Set();
    let paid = 0;
    let firstCount = 0;
    for (let round = 0; round < 3; round += 1) {
      const s = L.createFreeSession({ solidId: play.solidId, deviceFound: [...device] });
      for (let t = 0; t < 6; t += 1) {
        const pick = rng.int(0, 3);
        const faces = pick === 0 ? randomBuild(play, 1, rng, false) : rng.pick(nets.get(play.solidId));
        if (!faces) continue;
        const step = s.fold(faces, faces[0].id);
        if (step.first) {
          firstCount += 1;
          assert.ok(!device.has(step.id), '한 모양은 한 번만 처음');
          device.add(step.id);
          if (!step.later) paid += 1;
        }
        if (!step.valid) assert.equal(step.first, false);
      }
    }
    assert.equal(firstCount, device.size);
    assert.ok(paid <= PRISM_FREE_FULL_SCORE);
  }
});

test('붙일 자리(px): 크롬북 · 태블릿 · 휴대폰 판 크기에서 무작위로 붙여 가는 판 600개 — 단추끼리(48px + 2) · 단추와 면이 겹치지 않고 판 안이다(겹침 0). 붙일 자리는 남은 카드가 하나라도 펼친 그림에 붙는 빈 모서리마다', () => {
  const areas = {
    chromebook: { left: 0, top: 30, width: 520, height: 430 },
    tablet: { left: 0, top: 30, width: 500, height: 440 },
    phone: { left: 0, top: 30, width: 330, height: 400 },
  };
  let total = 0;
  let overlaps = 0;
  for (const [name, area] of Object.entries(areas)) {
    for (let seed = 0; seed < 200; seed += 1) {
      const rng = createRng(`slots-${name}-${seed}`);
      const play = L.makeFreePlay(STAGE, rng, { portrait: name === 'phone' });
      const fs = L.freeSolid(play.solidId);
      const cards = L.freeCards(fs);
      const placed = L.givenFaces(play, rng.int(1, 2));
      let view = null;
      for (let step = 0; step < cards.length; step += 1) {
        view = L.nextBoardView(view, placed.map((f) => f.poly), area, play.plan.map((f) => f.poly));
        const px = ([x, y]) => [view.origin[0] + x * view.unit, view.origin[1] + y * view.unit];
        const free = L.freeEdges(placed);
        const open = L.openEdges(placed, cards.filter((c) => !placed.some((p) => p.id === c.id)));
        const spots = L.placeSlots(placed.map((f) => ({ id: f.id, poly: f.poly.map(px) })), open.map((e) => ({ key: `${e.face}:${e.edge}`, face: e.face, p: px(e.p), q: px(e.q) })), area);
        // 붙일 자리가 없는 빈 모서리는 남은 카드 어느 것도 붙지 않는 변뿐이다
        for (const e of free.filter((x) => !open.some((o) => o.face === x.face && o.edge === x.edge))) {
          const left = cards.filter((c) => !placed.some((p) => p.id === c.id));
          assert.ok(left.every((c) => L.attachEdges(c).every((k) => L.overlapsPlaced(L.attachPoly(c.poly, k, [e.p, e.q]), placed))));
        }
        total += spots.length;
        overlaps += spots.filter((s) => s.overlap).length;
        // 다음 카드: 길이가 맞는 자리에(학생이 대개 그렇게 한다)
        const left = cards.filter((c) => !placed.some((p) => p.id === c.id));
        if (left.length === 0) break;
        const card = rng.pick(left);
        const k = rng.pick(L.attachEdges(card));
        const fit = free.filter((f) => Math.abs(Math.hypot(f.q[0] - f.p[0], f.q[1] - f.p[1]) - L.edgeLengthOf(card.poly, k)) < 1e-6);
        const target = rng.pick(fit.length > 0 ? fit : free);
        const poly = L.attachPoly(card.poly, k, [target.p, target.q]);
        if (!L.overlapsPlaced(poly, placed)) placed.push({ id: card.id, role: card.role, label: card.label, poly });
      }
    }
  }
  assert.ok(total > 5000);
  assert.equal(overlaps, 0, `${overlaps} / ${total}`);
});

test('판의 글(px): 무작위로 붙여 가는 판 450개 × 1 cm 14 · 22 · 34px — 길이 글 · 면 이름이 서로 겹치지 않고 제 면 안에 든다(독립 계산: 돌린 직사각형의 꼭짓점 · 나눔축). 1 cm 34px(크롬북)에서는 빈 모서리의 95% 넘게 길이 · 면마다 이름, 22px에서는 80% 넘게', () => {
  // 독립: 직사각형 네 꼭짓점, 두 볼록 다각형이 겹치나(나눔축), 점이 다각형 안인가(반직선)
  const corners = (b) => {
    const a = (b.deg * Math.PI) / 180;
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => [b.x + (sx * b.w) / 2 * Math.cos(a) - (sy * b.h) / 2 * Math.sin(a), b.y + (sx * b.w) / 2 * Math.sin(a) + (sy * b.h) / 2 * Math.cos(a)]);
  };
  const overlap = (P, Q) => {
    for (const poly of [P, Q]) {
      for (let i = 0; i < poly.length; i += 1) {
        const [a, b] = [poly[i], poly[(i + 1) % poly.length]];
        const n = [b[1] - a[1], a[0] - b[0]];
        const len = Math.hypot(...n);
        const proj = (pts) => pts.map(([x, y]) => (x * n[0] + y * n[1]) / len);
        const [u, v] = [proj(P), proj(Q)];
        if (Math.min(Math.max(...u), Math.max(...v)) - Math.max(Math.min(...u), Math.min(...v)) <= 0) return false;
      }
    }
    return true;
  };
  const inside = ([x, y], poly) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
      if ((poly[i][1] > y) !== (poly[j][1] > y) && x < ((poly[j][0] - poly[i][0]) * (y - poly[i][1])) / (poly[j][1] - poly[i][1]) + poly[i][0]) c = !c;
    }
    return c;
  };
  const textW = (t) => t.length * 7.2 + 6;
  const stats = {};
  for (const unit of [14, 22, 34]) {
    stats[unit] = { edges: 0, lens: 0, faces: 0, names: 0 };
    for (let seed = 0; seed < 150; seed += 1) {
      const rng = createRng(`labels-${unit}-${seed}`);
      const play = L.makeFreePlay(STAGE, rng, { portrait: seed % 3 === 0 });
      const fs = L.freeSolid(play.solidId);
      const cards = L.freeCards(fs);
      const placed = L.givenFaces(play, rng.int(1, 2)).map((f) => ({ ...f, given: true }));
      for (let step = 0; step < cards.length; step += 1) {
        const px = ([x, y]) => [300 + x * unit, 300 + y * unit];
        const free = L.freeEdges(placed);
        const open = L.openEdges(placed, cards.filter((c) => !placed.some((p) => p.id === c.id)));
        const input = placed.map((f) => ({
          id: f.id,
          poly: f.poly.map(px),
          lens: free.filter((e) => e.face === f.id).map((e) => {
            const v = Math.round(L.edgeLengthOf(f.poly, e.edge) * 100) / 100;
            return { key: `${e.face}:${e.edge}`, p: px(e.p), q: px(e.q), open: open.some((o) => o.face === e.face && o.edge === e.edge), texts: [`${v} cm`, `${v}`].map((text) => ({ text, w: textW(text), h: 14 })) };
          }),
          names: [...(f.given ? [{ variant: 'lock', w: 40, h: 22 }, { variant: 'lock-small', w: 32, h: 17 }] : []), { variant: 'name', w: 20, h: 22 }, { variant: 'name-small', w: 15, h: 17 }],
        }));
        const out = L.placeBoardLabels(input);
        const boxes = [];
        for (const f of input) {
          for (const e of f.lens) {
            const at = out.lens.get(e.key);
            stats[unit].edges += 1;
            if (!at) continue;
            stats[unit].lens += 1;
            const t = e.texts.find((x) => x.text === at.text);
            boxes.push({ face: f, pts: corners({ ...at, w: t.w, h: t.h }) });
          }
          const nm = out.names.get(f.id);
          stats[unit].faces += 1;
          if (nm) {
            stats[unit].names += 1;
            const v = f.names.find((x) => x.variant === nm.variant);
            boxes.push({ face: f, pts: corners({ ...nm, deg: 0, w: v.w, h: v.h }) });
          }
        }
        for (const b of boxes) assert.ok(b.pts.every((pt) => inside(pt, b.face.poly)), `${unit} ${seed} 면 밖`);
        for (let i = 0; i < boxes.length; i += 1) for (let j = i + 1; j < boxes.length; j += 1) assert.ok(!overlap(boxes[i].pts, boxes[j].pts), `${unit} ${seed} 글끼리 겹침`);
        const left = cards.filter((c) => !placed.some((p) => p.id === c.id));
        if (left.length === 0) break;
        const card = rng.pick(left);
        const k = rng.pick(L.attachEdges(card));
        const fit = free.filter((f) => Math.abs(Math.hypot(f.q[0] - f.p[0], f.q[1] - f.p[1]) - L.edgeLengthOf(card.poly, k)) < 1e-6);
        const target = rng.pick(fit.length > 0 ? fit : free);
        const poly = L.attachPoly(card.poly, k, [target.p, target.q]);
        if (!L.overlapsPlaced(poly, placed)) placed.push({ id: card.id, role: card.role, label: card.label, poly });
      }
    }
  }
  assert.ok(stats[34].lens / stats[34].edges > 0.95, JSON.stringify(stats));
  assert.equal(stats[34].names, stats[34].faces, JSON.stringify(stats));
  assert.ok(stats[22].lens / stats[22].edges > 0.8, JSON.stringify(stats));
});

test('도장 "기둥 설계사"(spec-grade6 8절): 전개도 완성하기에서 서로 다른 전개도를 2가지 맞게 만든 학습 기록이 있으면 — 같은 모양 · 안 되는 모양 · 다른 단계는 세지 않는다. 모음은 보이지 않는 모음(칸 962)', () => {
  const badge = PRISM_BADGES.find((b) => b.id === 'prism-designer');
  assert.equal(badge.title, '기둥 설계사');
  const rec = (stageId, answers) => ({ stageId, answers });
  assert.equal(prismDesigns([rec('prism-free', [{ itemId: 'prism-free:1:tri-a-001', correct: true }, { itemId: 'prism-free:2:x', correct: false }])]), 1);
  assert.equal(badge.test({ records: [rec('prism-free', [{ itemId: 'prism-free:1:tri-a-001', correct: true }, { itemId: 'prism-free:2:tri-a-001', correct: true }])] }), false);
  assert.equal(badge.test({ records: [rec('prism-free', [{ itemId: 'prism-free:1:tri-a-001', correct: true }]), rec('prism-free', [{ itemId: 'prism-free:1:tri-a-007', correct: true }])] }), true);
  assert.equal(badge.test({ records: [rec('cuboid-free', [{ itemId: 'cuboid-free:1:123-01', correct: true }, { itemId: 'cuboid-free:2:123-02', correct: true }])] }), false);
  const col = PRISM_COLLECTIONS.find((c) => c.id === PRISM_FREE_COLLECTION);
  assert.equal(col.quiet, true);
  assert.equal(col.items.length, PRISM_FREE_SOLIDS.reduce((s, x) => s + x.count, 0));
  assert.equal(col.items.length, 962);
  assert.deepEqual(col.xpAfter, { count: 10, xp: 1, until: 30 }); // 처음 10가지 제 점수, 11~30번째 +1, 31번째부터 0(15-29)
});

test('고른 까닭 먼저(review-prism-g2 G2-5): 까닭이 둘 다 참인 판(겹침 · 길이)에서 "길이"를 고르면 쪽지와 표시가 길이를, "겹침"을 고르면 겹침을 말한다. 틀리게 골랐거나 넘어가면 지금처럼(겹침 먼저)', () => {
  let both = 0;
  for (let seed = 0; seed < 400 && both < 30; seed += 1) {
    const rng = createRng(`reason-${seed}`);
    const play = L.makeFreePlay(STAGE, rng);
    const faces = randomBuild(play, 1, rng, false);
    if (!faces) continue;
    const r = L.createFreeSession({ solidId: play.solidId }).fold(faces, faces[0].id);
    if (r.valid) continue;
    const truths = L.freeReasons(r.problems);
    if (!(truths.includes('overlap') && truths.includes('length'))) continue;
    if (!r.problems.some((p) => p.type === 'edge-length')) continue;
    both += 1;
    assert.equal(L.primaryFreeProblem(r.problems, 'length').type, 'edge-length');
    assert.match(L.explainFreeProblem(r.net, r.problems, 'length'), /길이가 .+로 달라요/);
    assert.equal(L.freeFeedback(r, { picked: true, chosen: 'length' }).note, L.explainFreeProblem(r.net, r.problems, 'length'));
    const plain = L.explainFreeProblem(r.net, r.problems);
    assert.equal(L.explainFreeProblem(r.net, r.problems, 'overlap'), plain); // 겹침이 먼저인 지금 규칙과 같다
    assert.equal(L.explainFreeProblem(r.net, r.problems, null), plain);
    assert.equal(L.explainFreeProblem(r.net, r.problems, 'nope'), plain);
  }
  assert.ok(both >= 10, `까닭이 둘인 판 ${both}개`);
});

test('화면 글: 접기 전 안내 · 까닭 고르기 전의 글에는 까닭 낱말(겹쳐 · 길이 · 비어)이 없다, 주문 글 · 별 기준', () => {
  for (const [placed, total] of [[2, 6], [6, 6]]) {
    const r = L.foldReadiness(placed, total);
    assert.ok(!/겹|길이|비어/.test(r.text), r.text);
  }
  assert.ok(!/겹|길이|비어/.test(L.FREE_NOTE_BEFORE_PICK));
  assert.equal(L.orderText(1).head, '주문 ①');
  assert.match(L.orderText(2).text, /다른 모양/);
  assert.equal(STAGE.count, 2);
  assert.equal(STAGE.title, '전개도 완성하기');
  assert.ok(STAGE.goal.length <= 30);
});
