/**
 * 전개도 완성하기 (prism-free — G2, 자석 판 G2r): 각기둥 · 카드 · 자석(붙기 · 맞춤 · 거절) · 판정 · 같은 모양의 열쇠 · 모음 칸 · 한 판의 점수 · 판의 글.
 * 판정과 가짓수는 독립 계산(net-workshop-prism-free-indep.js — 저장소의 판정 코드를 쓰지 않고 기획서 문장만으로 짬)과 견준다. 자석이 붙는 자리도
 * 저장소의 붙이기 코드를 쓰지 않고 이 파일에서 따로 셈한다(모서리마다 · 카드의 변마다 · 길이가 다르면 가운데 · 양 끝 — 15-31 덧붙임).
 * 학생처럼 놓은 판은 net-workshop-prism-free-plan.js(화면과 같은 놓기 함수로 놓아 본다 — 판정은 하지 않는다).
 * 기획서: spec-grade6.md 2-2 · 4 · 5 · 6-4 · 8 · 15-2 · 15-25 · 15-26 · 15-29 · 15-30 · 15-31절, spec.md 16-2 · 16-8 · 16-9 · 16-12 · 16-14, common-rules 1 · 2 · 3절.
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
import { contacts, countNets, foldsToPrism } from './net-workshop-prism-free-indep.js';
import { catalogNets, fitOnBoard, planBoard, planCatalog, randomBoard, samePlace } from './net-workshop-prism-free-plan.js';
import { collectItem, collectionXp, normalizeCollectionState, normalizeCollections } from '../../src/shared/core/collection.js';
import { discoverXp } from '../../src/shared/core/rewards.js';

const STAGE = PRISM_STAGES.find((s) => s.id === 'prism-free');
const shapeOf = (id) => L.FREE_SHAPES[id];
const indep = (solidId, faces) => foldsToPrism(faces.map((f) => f.poly), shapeOf(solidId).base, shapeOf(solidId).height);
const rootOf = (solidId) => L.rootCardId(L.freeCards(L.freeSolid(solidId)));

// ── 독립 계산: 자석이 붙는 자리 (저장소의 attachPoly · freeEdges · overlapsPlaced를 쓰지 않는다) ─────────────
const d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const ang = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]);
const rot = ([x, y], r) => [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
/** 두 선분이 한 직선 위에서 길이 > 0만큼 겹치나 */
function overlapOnLine(p1, p2, q1, q2) {
  const len = d2(p1, p2);
  const u = [(p2[0] - p1[0]) / len, (p2[1] - p1[1]) / len];
  const off = (q) => Math.abs((q[0] - p1[0]) * u[1] - (q[1] - p1[1]) * u[0]);
  if (off(q1) > 1e-6 || off(q2) > 1e-6) return 0;
  const t = (q) => (q[0] - p1[0]) * u[0] + (q[1] - p1[1]) * u[1];
  return Math.max(0, Math.min(len, Math.max(t(q1), t(q2))) - Math.max(0, Math.min(t(q1), t(q2))));
}
/** 놓인 면들의 빈 모서리(다른 면의 변과 조금도 맞닿지 않은 변) */
function indepFreeEdges(placed) {
  const out = [];
  for (const f of placed) {
    f.poly.forEach((p, i) => {
      const q = f.poly[(i + 1) % f.poly.length];
      const touched = placed.some((g) => g !== f && g.poly.some((r, j) => overlapOnLine(p, q, r, g.poly[(j + 1) % g.poly.length]) > 1e-6));
      if (!touched) out.push({ face: f.id, edge: i, p, q });
    });
  }
  return out;
}
/** 볼록 다각형 둘이 넓이로 겹치나(나눔축 — 변이나 꼭짓점만 닿는 것은 아님) */
function convexOverlap(P, Q) {
  for (const poly of [P, Q]) {
    for (let i = 0; i < poly.length; i += 1) {
      const [a, b] = [poly[i], poly[(i + 1) % poly.length]];
      const n = [b[1] - a[1], a[0] - b[0]];
      const len = Math.hypot(...n);
      const proj = (pts) => pts.map(([x, y]) => (x * n[0] + y * n[1]) / len);
      const [u, v] = [proj(P), proj(Q)];
      if (Math.min(Math.max(...u), Math.max(...v)) - Math.max(Math.min(...u), Math.min(...v)) <= 1e-6) return false;
    }
  }
  return true;
}
/** 카드(card.poly)의 변 k를 빈 모서리 p → q에 거꾸로 맞대어 붙인 모양(맞춤: 가운데 · 카드 변의 끝을 p에 · 카드 변의 처음을 q에) */
function indepAttach(cardPoly, k, p, q, align) {
  const n = cardPoly.length;
  const r = ang(q, p) - ang(cardPoly[k], cardPoly[(k + 1) % n]);
  const turned = cardPoly.map((v) => rot(v, r));
  const [c0, c1] = [turned[k], turned[(k + 1) % n]];
  const from = align === 'mid' ? [(c0[0] + c1[0]) / 2, (c0[1] + c1[1]) / 2] : align === 'p' ? c1 : c0;
  const to = align === 'mid' ? [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] : align === 'p' ? p : q;
  return turned.map(([x, y]) => [x - from[0] + to[0], y - from[1] + to[1]]);
}
/** 붙을 수 있는 자리 모두(독립): 빈 모서리 × 카드의 변 × 맞춤, 판 안이고 놓인 면과 넓이가 겹치지 않는 것(같은 자리는 하나로) */
function indepSpots(card, placed, size) {
  const out = [];
  for (const t of indepFreeEdges(placed)) {
    for (let k = 0; k < card.poly.length; k += 1) {
      for (const align of ['mid', 'p', 'q']) {
        const poly = indepAttach(card.poly, k, t.p, t.q, align);
        if (!poly.every(([x, y]) => x >= -1e-6 && y >= -1e-6 && x <= size.w + 1e-6 && y <= size.h + 1e-6)) continue;
        if (placed.some((g) => convexOverlap(poly, g.poly))) continue;
        if (out.some((o) => samePlace(o.poly, poly))) continue;
        const equal = Math.abs(d2(card.poly[k], card.poly[(k + 1) % card.poly.length]) - d2(t.p, t.q)) < 1e-6;
        out.push({ poly, face: t.face, equal });
      }
    }
  }
  return out;
}
/** 독립: 놓인 면들이 한 장으로 이어져 있나(맞닿은 곳 — 길이가 달라 일부만 맞닿아도) */
function indepConnected(faces) {
  const touch = contacts(faces.map((f) => f.poly));
  const seen = new Set([0]);
  const queue = [0];
  while (queue.length) {
    const i = queue.shift();
    for (const t of touch) {
      const j = t.i === i ? t.j : t.j === i ? t.i : -1;
      if (j >= 0 && !seen.has(j)) {
        seen.add(j);
        queue.push(j);
      }
    }
  }
  return seen.size === faces.length;
}

/**
 * 학생처럼 놓은 판(여러 갈래): ① 목록의 전개도 그대로 ② 목록의 전개도를 앞쪽만 놓고 나머지는 자석 자리 아무 데나(같은 길이 먼저일 때도) ③ 처음부터 자석 자리
 * 아무 데나(길이가 다르게 붙인 곳이 흔하다) ④ 그중 몇 장은 빈 곳에 그대로(떨어진 면). → { placed, unequal, mode } | null
 */
function studentBoard(play, rng, mode) {
  if (mode === 'exact') {
    const plan = planCatalog(play, rng.int(0, 999), { pick: rng.int(0, 11) });
    return plan && { placed: plan.placed, unequal: 0, mode };
  }
  if (mode === 'prefix') {
    const plan = planCatalog(play, rng.int(0, 999), { pick: rng.int(0, 11) });
    if (!plan) return null;
    const keep = rng.int(1, plan.placed.length - 1);
    const placed = plan.placed.slice(0, keep);
    const cards = L.freeCards(L.freeSolid(play.solidId));
    let unequal = 0;
    for (const card of rng.shuffle(cards.filter((c) => !placed.some((p) => p.id === c.id)))) {
      const spots = L.magnetSpots(card, placed, play.board);
      if (spots.length === 0) return null;
      const same = spots.filter((s) => Math.abs(L.edgeLengthOf(card.poly, s.cardEdge) - L.edgeLengthOf(placed.find((p) => p.id === s.face).poly, s.edge)) < 1e-6);
      const s = rng.pick(same.length > 0 && rng.next() < 0.7 ? same : spots);
      if (!same.includes(s)) unequal += 1;
      placed.push({ id: card.id, role: card.role, label: card.label, poly: s.poly });
    }
    return { placed, unequal, mode };
  }
  const b = randomBoard(play, rng, { free: mode === 'free' ? 0.2 : 0 });
  return b && { ...b, mode };
}

// ── 각기둥 · 카드 ─────────────────────────────
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
    const n = shape.base.length;
    const L0 = fs.lengths;
    assert.ok(Array.from({ length: n }, (_, k) => k).some((k) => L0.every((_, i) => Math.abs(L0[i] - L0[(((k - i - 1) % n) + n) % n]) < 1e-9)), `${id} 좌우 대칭`);
  }
});

test('면 카드: 한 벌(밑면 2 + 옆면 = 변의 수), 옆면은 가로(밑면의 변) × 세로(높이) 직사각형, 같은 크기는 한 묶음. 카드 모양의 가운데가 (0, 0)이라 놓은 자리 = 끈 자리, 돌림 방향이 모두 같다', () => {
  for (const id of Object.keys(L.FREE_SHAPES)) {
    const fs = L.freeSolid(id);
    const cards = L.freeCards(fs);
    assert.equal(cards.length, fs.n + 2);
    assert.equal(cards.filter((c) => c.role === 'base').length, 2);
    for (const c of cards.filter((x) => x.role === 'side')) {
      assert.equal(c.h, fs.height);
      assert.ok(fs.lengths.includes(c.w));
      assert.equal(c.group, `s:${c.w}`);
    }
    assert.equal(L.rootCardId(cards), cards.find((c) => c.solid === 'b0').id);
    for (const c of cards) {
      assert.ok(L.signedArea(c.poly) > 0, '모든 카드는 같은 돌림 방향');
      const at = [3.5, 2.25];
      const posed = L.posePoly(c, 0, at);
      posed.forEach((p, i) => assert.ok(d2(p, [c.poly[i][0] + at[0], c.poly[i][1] + at[1]]) < 1e-9));
      // 30°씩 열두 번 돌리면 제자리
      assert.ok(samePlace(L.posePoly(c, 360, at), posed));
    }
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

// ── 자석 판 ─────────────────────────────────
test('판: 칸 없는 빈 판(미리 놓인 면 없음 — 15-30), 각기둥마다 크기(cm)가 정해져 있고 휴대폰은 세로로 길게. 같은 시드면 같은 각기둥, 세 종류가 고르게', () => {
  const kinds = { tri: 0, trap: 0, hex: 0 };
  for (let seed = 0; seed < 300; seed += 1) {
    const a = L.makeFreePlay(STAGE, createRng(`order-${seed}`));
    assert.deepEqual(a, L.makeFreePlay(STAGE, createRng(`order-${seed}`)));
    const portrait = L.makeFreePlay(STAGE, createRng(`order-${seed}`), { portrait: true });
    assert.equal(portrait.solidId, a.solidId);
    assert.deepEqual(portrait.board, { w: a.board.h, h: a.board.w });
    assert.ok(a.board.w > a.board.h);
    assert.deepEqual(Object.keys(a).sort(), ['board', 'solidId', 'stageId'], '주문 · 미리 놓인 면이 없다');
    kinds[L.freeSolid(a.solidId).kind] += 1;
  }
  for (const v of Object.values(kinds)) assert.ok(v > 60, JSON.stringify(kinds));
  assert.deepEqual(PRISM_FREE_SOLIDS.map((s) => [s.id, L.boardSize(s.id).w, L.boardSize(s.id).h]),
    [['tri-a', 16, 11], ['tri-b', 17, 11], ['trap-a', 17, 12], ['trap-b', 17, 12], ['hex-a', 19, 13], ['hex-b', 22, 15]]);
});

test('962가지를 모두 자석 판에서 만들 수 있다: 각기둥마다 서로 다른 전개도 전부 × 판의 두 방향(가로 · 세로)이 판에 들고, 끌어 놓기(화면과 같은 settlePoly — 30°씩 돌린 카드를 놓으면 모서리 방향으로 맞춰 붙음)로도 키보드 자석 자리(magnetSpots)로도 그 모양 그대로 놓인다. 만든 판은 각기둥이 되고(독립 판정도) 칸 id가 그 차례 — 돌리거나 뒤집어도 같은 칸', () => {
  let made = 0;
  for (const s of PRISM_FREE_SOLIDS) {
    const ids = new Set();
    const list = catalogNets(s.id);
    for (const portrait of [false, true]) {
      const play = { solidId: s.id, board: L.boardSize(s.id, { portrait }) };
      list.forEach((entry, i) => {
        const fit = fitOnBoard(play, entry.faces);
        assert.ok(fit, `${s.id} ${i} 판에 든다`);
        const { steps, placed } = planBoard(play, fit); // 끌어 놓은 자리가 목표 자리가 아니면 오류
        assert.ok(steps.slice(1).every((x) => x.spot >= 0), `${s.id} ${i} 키보드 자석 자리`);
        assert.ok(steps.slice(1).every((x) => x.turn >= 0 && x.turn < 12));
        made += 1;
        if (portrait) return;
        const fs = L.freeSolid(s.id);
        const r = L.judgeFreeNet(fs, placed, rootOf(s.id));
        assert.ok(r.valid, `${s.id} ${i} ${r.problems.map((p) => p.type)}`);
        assert.ok(indep(s.id, placed).ok, '독립 판정');
        ids.add(r.id);
        // 통째로 돌리고 뒤집은(꼭짓점 차례를 거꾸로 해 돌림 방향을 지킨) 같은 전개도
        const flip = placed.map((f) => ({ ...f, poly: [...f.poly].reverse().map(([x, y]) => [-x, y]) }));
        const turned = placed.map((f) => ({ ...f, poly: f.poly.map(([x, y]) => [x * Math.cos(1.1) - y * Math.sin(1.1) + 5, x * Math.sin(1.1) + y * Math.cos(1.1) - 2]) }));
        assert.equal(L.judgeFreeNet(fs, flip, rootOf(s.id)).id, r.id);
        assert.equal(L.judgeFreeNet(fs, turned, rootOf(s.id)).id, r.id);
      });
    }
    assert.equal(ids.size, s.count, `${s.id} 칸이 모두 다르다`);
    assert.deepEqual([...ids].sort(), Array.from({ length: s.count }, (_, i) => prismFreeItemId(s.id, i)).sort());
  }
  assert.equal(made, 962 * 2);
});

test('자석이 붙는 자리 = 독립 계산: 무작위로 놓아 가는 판 900개 — 빈 모서리마다 · 카드의 변마다(길이가 같든 다르든, 맞는 모서리든 틀린 모서리든) 붙는 자리가 있고(길이가 다르면 가운데 · 양 끝 셋), 놓인 면과 겹치거나 판 밖인 자리만 빠진다', () => {
  let spots = 0;
  let unequal = 0;
  let equal = 0;
  for (let seed = 0; seed < 900; seed += 1) {
    const rng = createRng(`spots-${seed}`);
    const play = L.makeFreePlay(STAGE, rng, { portrait: seed % 3 === 0 });
    const b = randomBoard(play, rng);
    if (!b) continue;
    const k = rng.int(1, b.placed.length - 1);
    const placed = b.placed.slice(0, k);
    const cards = L.freeCards(L.freeSolid(play.solidId));
    const card = rng.pick(cards.filter((c) => !placed.some((p) => p.id === c.id)));
    const mine = indepSpots(card, placed, play.board);
    const app = L.magnetSpots(card, placed, play.board);
    assert.equal(app.length, mine.length, `시드 ${seed}`);
    for (const s of app) assert.ok(mine.some((m) => samePlace(m.poly, s.poly)), `시드 ${seed} 앱의 자리가 독립 계산에 있다`);
    spots += app.length;
    unequal += mine.filter((m) => !m.equal).length;
    equal += mine.filter((m) => m.equal).length;
  }
  assert.ok(spots > 10_000 && unequal > 3_000 && equal > 3_000, `${spots} · 같은 길이 ${equal} · 다른 길이 ${unequal}`);
});

test('끌어 놓기 자석(15-31 · 덧붙임): 방향이 15° 안 · 변의 가운데가 1 cm 안이면 붙고(넘으면 놓은 그대로), 길이가 다르면 가운데 · 양 끝 맞춤 가운데 덜 움직이는 쪽(독립 계산), 겹치거나 판 밖이면 놓이지 않는다', () => {
  const rng = createRng('magnet');
  let checked = 0;
  let unequal = 0;
  for (let i = 0; i < 600; i += 1) {
    const play = L.makeFreePlay(STAGE, rng);
    const size = play.board;
    const cards = L.freeCards(L.freeSolid(play.solidId));
    const [a, b] = rng.sample(cards, 2);
    // 놓인 면 하나: 판 가운데, 아무 각도(30°씩)
    const base = L.posePoly(a, rng.int(0, 11) * 30, [size.w / 2, size.h / 2]);
    const placed = [{ id: a.id, poly: base }];
    const e = rng.int(0, base.length - 1);
    const [p, q] = [base[e], base[(e + 1) % base.length]];
    const k = rng.int(0, b.poly.length - 1);
    const same = Math.abs(d2(b.poly[k], b.poly[(k + 1) % b.poly.length]) - d2(p, q)) < 1e-6;
    const align = same ? 'mid' : rng.pick(['mid', 'p', 'q']);
    const target = indepAttach(b.poly, k, p, q, align);
    if (placed.some((g) => convexOverlap(target, g.poly))) continue;
    // 목표 자리에서 조금 돌리고(±dθ) 옮겨(변을 따라 · 바깥쪽으로) 놓는다
    const c = target.reduce((s, v) => [s[0] + v[0] / target.length, s[1] + v[1] / target.length], [0, 0]);
    const dTurn = rng.pick([0, 5, -9, 14, -14, 16, -20]);
    const u = [(q[0] - p[0]) / d2(p, q), (q[1] - p[1]) / d2(p, q)];
    const along = rng.pick([0, 0.1, -0.2, 0.3]);
    const out = rng.pick([0, 0.4, 0.8, 1.3]);
    const nrm = [u[1], -u[0]]; // 놓인 면 바깥쪽(돌림 방향이 양이라 변의 오른쪽)
    const moved = target.map((v) => {
      const r = rot([v[0] - c[0], v[1] - c[1]], (dTurn * Math.PI) / 180);
      return [r[0] + c[0] + u[0] * along + nrm[0] * out, r[1] + c[1] + u[1] * along + nrm[1] * out];
    });
    if (!moved.every(([x, y]) => x >= 0 && y >= 0 && x <= size.w && y <= size.h)) continue;
    const got = L.settlePoly(b, moved, placed, size);
    // 독립: 움직인 변 k의 가운데에서 가장 가까운 맞춤(같은 모서리) — 1 cm 안이고 방향이 15° 안이면 그 자리
    const mid = (poly) => [(poly[k][0] + poly[(k + 1) % poly.length][0]) / 2, (poly[k][1] + poly[(k + 1) % poly.length][1]) / 2];
    const options = (same ? ['mid'] : ['mid', 'p', 'q']).map((al) => ({ al, poly: indepAttach(b.poly, k, p, q, al) }))
      .filter((o) => !placed.some((g) => convexOverlap(o.poly, g.poly)) && o.poly.every(([x, y]) => x >= -1e-6 && y >= -1e-6 && x <= size.w + 1e-6 && y <= size.h + 1e-6))
      .map((o) => ({ ...o, dist: d2(mid(o.poly), mid(moved)) }))
      .sort((x, y) => x.dist - y.dist);
    const snaps = Math.abs(dTurn) <= 15 && options.length > 0 && options[0].dist <= 1 + 1e-9;
    // 다른 변(k가 아닌 변)이 더 가까이 맞는 경우는 빼고 견준다 — 이 검사는 한 변을 본다
    if (got?.snap && got.snap.cardEdge !== k) continue;
    if (snaps) {
      assert.ok(got?.snap, `${i}: 붙어야 (${dTurn}° · ${out} cm)`);
      assert.ok(samePlace(got.poly, options[0].poly, 1e-6), `${i}: 가장 덜 움직이는 맞춤 ${options[0].al} (${got.snap.align})`);
      if (!same) unequal += 1;
    } else if (got?.snap) {
      assert.fail(`${i}: 붙지 않아야 (${dTurn}° · ${out} cm · ${options[0]?.dist})`);
    } else if (got) {
      assert.ok(samePlace(got.poly, moved, 1e-6), '놓은 그대로');
    } else assert.ok(placed.some((g) => convexOverlap(moved, g.poly)), '놓이지 않는 것은 겹칠 때뿐');
    checked += 1;
  }
  assert.ok(checked > 300 && unequal > 50, `${checked} · ${unequal}`);
  // 겹침 · 판 밖
  const play = { solidId: 'hex-a', board: L.boardSize('hex-a') };
  const cards = L.freeCards(L.freeSolid('hex-a'));
  const base = L.posePoly(cards[0], 0, [9, 6]);
  assert.equal(L.settlePoly(cards[1], L.posePoly(cards[1], 0, [9.3, 6.2]), [{ id: 'f0', poly: base }], play.board), null, '겹침');
  assert.equal(L.settlePoly(cards[2], L.posePoly(cards[2], 0, [0.2, 6]), [], play.board), null, '판 밖');
  assert.ok(L.settlePoly(cards[2], L.posePoly(cards[2], 0, [15, 6]), [{ id: 'f0', poly: base }], play.board), '빈 곳');
});

test('정답 노출 0(자석): 붙는 자리 · 붙은 모양은 길이가 맞는지 · 맞는 자리인지와 상관없다 — 같은 판에서 맞는 모서리와 틀린 모서리, 같은 길이와 다른 길이 모두 같은 규칙(같은 거리 · 같은 각)으로 붙고, 붙었을 때 돌려주는 값의 모양(속성 이름)이 같다', () => {
  let right = 0;
  let wrong = 0;
  for (let seed = 0; seed < 120; seed += 1) {
    const rng = createRng(`expose-${seed}`);
    const play = L.makeFreePlay(STAGE, rng);
    const plan = planCatalog(play, rng.int(0, 999));
    const keep = rng.int(1, plan.placed.length - 2);
    const placed = plan.placed.slice(0, keep);
    const next = plan.steps[keep];
    const card = L.freeCards(L.freeSolid(play.solidId)).find((c) => c.id === next.card);
    const all = L.magnetSpots(card, placed, play.board);
    for (const s of all) {
      // 그 자리를 놓인 면에서 0.3 cm 떨어뜨리고 붙는 변의 가운데를 축으로 8° 돌려 놓아도 그 자리에 붙는다(맞는 자리 · 틀린 자리 · 길이가 다른 자리 같게)
      const parent = placed.find((f) => f.id === s.face).poly;
      const [p, q] = [parent[s.edge], parent[(s.edge + 1) % parent.length]];
      const out = [(q[1] - p[1]) / d2(p, q), -(q[0] - p[0]) / d2(p, q)];
      const n = s.poly.length;
      const m = [(s.poly[s.cardEdge][0] + s.poly[(s.cardEdge + 1) % n][0]) / 2 + out[0] * 0.3, (s.poly[s.cardEdge][1] + s.poly[(s.cardEdge + 1) % n][1]) / 2 + out[1] * 0.3];
      const raw = L.turnPoly(s.poly.map(([x, y]) => [x + out[0] * 0.3, y + out[1] * 0.3]), 8, m);
      if (!raw.every(([x, y]) => x >= 0 && y >= 0 && x <= play.board.w && y <= play.board.h)) continue;
      const got = L.settlePoly(card, raw, placed, play.board);
      assert.ok(got?.snap, '자리마다 붙는다');
      if (got.snap.face === s.face && got.snap.edge === s.edge && got.snap.cardEdge === s.cardEdge) assert.ok(samePlace(got.poly, s.poly, 1e-6), '그 자리에');
      assert.deepEqual(Object.keys(got.snap).sort(), ['align', 'cardEdge', 'dist', 'edge', 'face', 'poly', 'turn']);
      if (samePlace(s.poly, next.poly)) right += 1;
      else wrong += 1;
    }
  }
  assert.ok(right >= 100 && wrong > 1000, `맞는 자리 ${right} · 다른 자리 ${wrong}`);
});

// ── 판정 ────────────────────────────────────
test('판정 = 독립 계산: 학생처럼 놓은 판 3,600개(목록의 전개도 그대로 · 앞쪽만 맞게 놓고 나머지는 아무 데나 · 처음부터 아무 데나 · 떨어진 면이 있는 판) — 떨어진 판인지(접기 꺼짐), 되는지 어긋남 0. 되는 것은 늘 칸 id, 길이가 다르게 붙인 판은 늘 안 되고 "길이" 까닭이 참이다', () => {
  const tally = { boards: 0, valid: 0, unequal: 0, apart: 0, byMode: {} };
  const modes = ['exact', 'prefix', 'random', 'free'];
  for (let seed = 0; seed < 3600; seed += 1) {
    const rng = createRng(`judge-${seed}`);
    const play = L.makeFreePlay(STAGE, rng, { portrait: seed % 4 === 0 });
    const mode = modes[seed % modes.length];
    const b = studentBoard(play, rng, mode);
    if (!b) continue;
    tally.boards += 1;
    tally.byMode[mode] = (tally.byMode[mode] ?? 0) + 1;
    const cards = L.freeCards(L.freeSolid(play.solidId));
    const ready = L.foldReadiness(b.placed, cards.length);
    assert.equal(ready.reason === 'apart', !indepConnected(b.placed), `시드 ${seed} 떨어진 판`);
    if (!ready.ready) {
      tally.apart += 1;
      assert.ok(ready.detached.length >= 1 && ready.detached.length < cards.length);
      continue;
    }
    const r = L.judgeFreeNet(L.freeSolid(play.solidId), b.placed, rootOf(play.solidId));
    const ind = indep(play.solidId, b.placed);
    assert.equal(r.valid, ind.ok, `시드 ${seed} (${mode}): 앱 ${r.problems.map((p) => p.type)} · 독립 ${ind.why}`);
    if (mode === 'exact') assert.ok(r.valid, '목록의 전개도 그대로는 된다');
    if (r.valid) {
      tally.valid += 1;
      assert.ok(r.id);
    } else {
      assert.ok(L.freeReasons(r.problems).length >= 1, '참인 까닭 칩이 하나 이상');
      assert.ok(L.explainFreeProblem(r.net, r.problems).length > 10);
    }
    if (b.unequal > 0) {
      tally.unequal += 1;
      assert.equal(r.valid, false, '길이가 다르게 붙이면 안 된다');
      assert.equal(ind.ok, false);
      assert.ok(L.freeReasons(r.problems).includes('length'), `시드 ${seed} 길이 까닭`);
    }
  }
  assert.ok(tally.boards > 3000 && tally.valid > 800 && tally.unequal > 1000 && tally.apart > 50, JSON.stringify(tally));
});

test('길이가 다르게 붙인 판(15-31 덧붙임): 접으면 "맞닿는 선분의 길이가 달라요"가 참이고, 그 까닭을 고르면 쪽지는 그 두 면 · 두 길이(독립: 붙인 두 변의 길이)를 말하고 표시할 두 선분 · 두 길이가 있다', () => {
  let n = 0;
  for (let seed = 0; seed < 400 && n < 60; seed += 1) {
    const rng = createRng(`uneq-${seed}`);
    const play = L.makeFreePlay(STAGE, rng);
    const plan = planCatalog(play, rng.int(0, 999));
    const cards = L.freeCards(L.freeSolid(play.solidId));
    const pre = plan.placed.slice(0, -1);
    const last = cards.find((c) => c.id === plan.placed.at(-1).id);
    const spot = rng.shuffle(L.magnetSpots(last, pre, play.board)).find((s) => {
      const lc = L.edgeLengthOf(last.poly, s.cardEdge);
      const lt = L.edgeLengthOf(pre.find((p) => p.id === s.face).poly, s.edge);
      return Math.abs(lc - lt) > 1e-6 && L.foldReadiness([...pre, { id: last.id, poly: s.poly }], cards.length).ready;
    });
    if (!spot) continue;
    const faces = [...pre, { id: last.id, role: last.role, label: last.label, poly: spot.poly }];
    const step = L.createFreeSession({ solidId: play.solidId }).fold(faces, rootOf(play.solidId));
    assert.equal(step.valid, false);
    assert.equal(step.kind, 'invalid');
    assert.ok(L.freeReasons(step.problems).includes('length'));
    const p = L.primaryFreeProblem(step.problems, 'length');
    assert.equal(p.type, 'edge-length');
    assert.equal(p.edges.length, 2);
    assert.equal(p.lengths.length, 2);
    assert.ok(Math.abs(p.lengths[0] - p.lengths[1]) > 1e-6);
    const note = L.freeFeedback(step, { picked: true, chosen: 'length' }).note;
    assert.match(note, /길이가 .+ cm와 .+ cm로 달라요/);
    // 붙인 두 변의 길이(독립) 가운데 하나가 쪽지에 나온다면, 다른 하나도 나온다
    const lc = Math.round(d2(last.poly[spot.cardEdge], last.poly[(spot.cardEdge + 1) % last.poly.length]) * 100) / 100;
    const parent = pre.find((f) => f.id === spot.face).poly;
    const lt = Math.round(d2(parent[spot.edge], parent[(spot.edge + 1) % parent.length]) * 100) / 100;
    if (p.edges.some((e) => e.face === last.id)) {
      assert.ok(note.includes(`${lc} cm`) && note.includes(`${lt} cm`), `${note} · ${lc} · ${lt}`);
      assert.ok(note.includes(`${last.label} 면`));
    }
    n += 1;
  }
  assert.ok(n >= 40, `${n}판`);
});

test('떨어진 면(직육면체 자유 배치와 같게): 다 놓았는데 한 장으로 이어지지 않으면 접기가 꺼지고 떨어진 면(가장 큰 덩어리 밖)을 알린다. 꼭짓점만 닿은 것은 떨어진 것, 길이가 달라 일부만 맞닿은 것은 이어진 것', () => {
  const cards = L.freeCards(L.freeSolid('hex-a'));
  const hex = L.posePoly(cards[0], 0, [6, 6]);
  const side = cards.find((c) => c.role === 'side');
  // 꼭짓점만: 육각형의 가장 오른쪽(그 가운데 가장 위) 꼭짓점에 직사각형의 왼쪽 아래 꼭짓점(직사각형은 그 오른쪽 위로)
  const right = Math.max(...hex.map((p) => p[0]));
  const v = hex.filter((p) => Math.abs(p[0] - right) < 1e-6).sort((a, b) => a[1] - b[1])[0];
  const corner = L.posePoly(side, 0, [v[0] + side.w / 2, v[1] - side.h / 2]);
  const r1 = L.foldReadiness([{ id: 'f0', poly: hex }, { id: side.id, poly: corner }], 2);
  assert.equal(r1.reason, 'apart');
  assert.deepEqual(r1.detached, [side.id]);
  assert.match(r1.text, /떨어진 면/);
  // 일부만 맞닿음(3 cm 변을 2 cm 변에)
  const spot = L.magnetSpots(side, [{ id: 'f0', poly: hex }], L.boardSize('hex-a')).find((s) => s.cardEdge === 1);
  const r2 = L.foldReadiness([{ id: 'f0', poly: hex }, { id: side.id, poly: spot.poly }], 2);
  assert.equal(r2.ready, true);
  // 아직 다 놓지 않았으면 떨어져 있어도 "모두 놓으면"
  assert.equal(L.foldReadiness([{ id: 'f0', poly: hex }, { id: side.id, poly: corner }], 8).reason, 'count');
  // 덩어리: 큰 것부터
  assert.deepEqual(L.faceGroups([{ id: 'a', poly: corner }, { id: 'b', poly: hex }, { id: 'c', poly: spot.poly }]), [['b', 'c'], ['a']]);
});

// ── 점수 ────────────────────────────────────
test('한 판의 점수(common-rules 3절 · spec 16-8 · 16-9 · 16-14): 처음 만든 전개도만 모음에 넣고 점수(once), 전에 찾은 것은 점수 없음, 이번 판에 접어 본 모양은 기록도 없음, 10가지 뒤는 등록 1점뿐(later), 안 되는 모양은 점수 없음', () => {
  const play = L.makeFreePlay(STAGE, createRng('score-1'));
  const root = rootOf(play.solidId);
  const first = planCatalog(play, 0).placed;
  const second = planCatalog(play, 1).placed;
  const s = L.createFreeSession({ solidId: play.solidId });
  const a = s.fold(first, root);
  assert.equal(a.kind, 'new');
  assert.ok(a.first && a.log && a.collect && a.collect.id === PRISM_FREE_COLLECTION);
  assert.equal(a.later, false);
  const again = s.fold(first, root);
  assert.equal(again.kind, 'repeat');
  assert.equal(again.log, false);
  assert.equal(again.collect, null);
  // 같은 전개도를 판의 다른 곳 · 다른 방향으로 놓아도 같은 모양(이번 판에 접어 본 모양)
  const moved = planBoard(play, fitOnBoard(play, catalogNets(play.solidId)[0].faces, { pick: 3 })).placed;
  assert.equal(s.fold(moved, root).kind, 'repeat');
  const known = L.createFreeSession({ solidId: play.solidId, deviceFound: [a.id] }).fold(first, root);
  assert.equal(known.kind, 'known');
  assert.equal(known.first, false);
  assert.equal(known.found, 1, '전에 찾은 것도 이번 판의 가지 수에는 센다');
  const b = s.fold(second, root);
  assert.equal(b.found, 2);
  assert.equal(b.done, true);
  assert.equal(b.full, false);
  const many = Array.from({ length: PRISM_FREE_FULL_SCORE }, (_, i) => prismFreeItemId('hex-a', i));
  const late = L.createFreeSession({ solidId: play.solidId, deviceFound: many }).fold(first, root);
  assert.equal(late.kind, 'new');
  assert.equal(late.later, true);
  // 안 되는 모양(길이가 다르게 붙인 판 포함)
  let bads = 0;
  for (let seed = 0; seed < 40; seed += 1) {
    const bad = randomBoard(play, createRng(`bad-${seed}`));
    if (!bad || !L.foldReadiness(bad.placed, bad.placed.length).ready) continue;
    const r = L.createFreeSession({ solidId: play.solidId }).fold(bad.placed, root);
    if (r.valid) continue;
    bads += 1;
    assert.equal(r.kind, 'invalid');
    assert.equal(r.collect, null);
    assert.equal(r.first, false);
    assert.ok(Object.values(PRISM_TAGS).includes(r.tag), r.tag);
  }
  assert.ok(bads > 10);
  assert.deepEqual([0, 1, 2, 3, 4].map(L.freeStars), [0, 1, 2, 3, 3]);
  assert.equal(L.freeStarNote(2), '서로 다른 전개도 3가지를 찾으면 별 3개!');
  assert.equal(L.freeStarNote(3), null);
});

test('점수 상한(사용자 결정 15-29): 이 기기에서 처음 10가지는 제 점수, 11~30번째는 하나에 +1, 31번째부터 0점 — 962칸을 어떤 순서로 찾아도 등록 점수의 합 70, 이 단계 최대 104점(독립 계산). 찾은 가지 수는 계속 오른다', () => {
  const indepMax = 10 * (5 + 2) + Math.floor(10 / 3) + 20 * 1 + 5 + 6;
  assert.equal(indepMax, 104);
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
  const play = L.makeFreePlay(STAGE, createRng('cap-play'));
  const faces = planCatalog(play, 0).placed;
  const other = (k) => Array.from({ length: k }, (_, i) => prismFreeItemId(play.solidId === 'hex-a' ? 'hex-b' : 'hex-a', i));
  const flags = [0, 9, 10, 29, 30, 200].map((k) => {
    const step = L.createFreeSession({ solidId: play.solidId, deviceFound: other(k) }).fold(faces, rootOf(play.solidId));
    return [k + 1, step.kind, step.later, step.over, step.deviceCount];
  });
  assert.deepEqual(flags, [[1, 'new', false, false, 1], [10, 'new', false, false, 10], [11, 'new', true, false, 11], [30, 'new', true, false, 30], [31, 'new', true, true, 31], [201, 'new', true, true, 201]]);
  assert.match(L.FREE_OVER_NOTE, /30가지/);
});

test('점수 독립 계산: 무작위 접기 순서 300판 — 안 되는 모양(길이가 다르게 붙인 판 포함)을 일부러 끼워도 점수 받는 답(once)은 처음 만든 전개도 수와 같고, 같은 모양을 두 번 접어 점수를 두 번 받는 길이 없다', () => {
  const nets = new Map();
  for (const s of PRISM_FREE_SOLIDS) {
    const play = { solidId: s.id, board: L.boardSize(s.id) };
    nets.set(s.id, Array.from({ length: 6 }, (_, i) => planCatalog(play, i * 3, { pick: i }).placed));
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
        const faces = pick === 0 ? randomBoard(play, rng)?.placed : rng.pick(nets.get(play.solidId));
        if (!faces || !L.foldReadiness(faces, faces.length).ready) continue;
        const step = s.fold(faces, rootOf(play.solidId));
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

// ── 판의 글 ──────────────────────────────────
test('판의 글(px): 학생처럼 놓아 가는 판 450개 × 1 cm 14 · 22 · 34px — 빈 모서리의 길이 글 · 면 이름(떨어진 면은 "떨어짐"과 함께)이 서로 겹치지 않고 제 면 안에 든다(독립 계산: 돌린 직사각형의 꼭짓점 · 나눔축). 1 cm 34px(크롬북)에서는 빈 모서리의 95% 넘게 길이 · 면마다 이름, 22px에서는 80% 넘게', () => {
  const corners = (b) => {
    const a = (b.deg * Math.PI) / 180;
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => [b.x + (sx * b.w) / 2 * Math.cos(a) - (sy * b.h) / 2 * Math.sin(a), b.y + (sx * b.w) / 2 * Math.sin(a) + (sy * b.h) / 2 * Math.cos(a)]);
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
      const b = studentBoard(play, rng, ['exact', 'prefix', 'free'][seed % 3]);
      if (!b) continue;
      const detached = new Set(L.foldReadiness(b.placed, b.placed.length).detached);
      for (let k = 1; k <= b.placed.length; k += 1) {
        const placed = b.placed.slice(0, k);
        const px = ([x, y]) => [300 + x * unit, 300 + y * unit];
        const free = L.freeEdges(placed);
        const input = placed.map((f) => ({
          id: f.id,
          poly: f.poly.map(px),
          lens: free.filter((e) => e.face === f.id).map((e) => {
            const v = Math.round(L.edgeLengthOf(f.poly, e.edge) * 100) / 100;
            return { key: `${e.face}:${e.edge}`, p: px(e.p), q: px(e.q), open: true, texts: [`${v} cm`, `${v}`].map((text) => ({ text, w: textW(text), h: 14 })) };
          }),
          names: [...(k === b.placed.length && detached.has(f.id) ? [{ variant: 'apart', w: 66, h: 22 }, { variant: 'apart-small', w: 58, h: 17 }] : []), { variant: 'name', w: 20, h: 22 }, { variant: 'name-small', w: 15, h: 17 }],
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
        for (const bx of boxes) assert.ok(bx.pts.every((pt) => inside(pt, bx.face.poly)), `${unit} ${seed} 면 밖`);
        for (let i = 0; i < boxes.length; i += 1) for (let j = i + 1; j < boxes.length; j += 1) assert.ok(!convexOverlap(boxes[i].pts, boxes[j].pts), `${unit} ${seed} 글끼리 겹침`);
      }
    }
  }
  assert.ok(stats[34].lens / stats[34].edges > 0.95, JSON.stringify(stats));
  assert.equal(stats[34].names, stats[34].faces, JSON.stringify(stats));
  assert.ok(stats[22].lens / stats[22].edges > 0.8, JSON.stringify(stats));
});

// ── 도장 · 까닭 · 글 ───────────────────────────
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
  assert.deepEqual(col.xpAfter, { count: 10, xp: 1, until: 30 });
});

test('고른 까닭 먼저(review-prism-g2 G2-5): 까닭이 둘 다 참인 판(겹침 · 길이)에서 "길이"를 고르면 쪽지와 표시가 길이를, "겹침"을 고르면 겹침을 말한다. 틀리게 골랐거나 넘어가면 지금처럼(겹침 먼저)', () => {
  let both = 0;
  for (let seed = 0; seed < 400 && both < 30; seed += 1) {
    const rng = createRng(`reason-${seed}`);
    const play = L.makeFreePlay(STAGE, rng);
    const b = studentBoard(play, rng, 'prefix');
    if (!b || !L.foldReadiness(b.placed, b.placed.length).ready) continue;
    const r = L.createFreeSession({ solidId: play.solidId }).fold(b.placed, rootOf(play.solidId));
    if (r.valid) continue;
    const truths = L.freeReasons(r.problems);
    if (!(truths.includes('overlap') && truths.includes('length'))) continue;
    if (!r.problems.some((p) => p.type === 'edge-length')) continue;
    both += 1;
    assert.equal(L.primaryFreeProblem(r.problems, 'length').type, 'edge-length');
    assert.match(L.explainFreeProblem(r.net, r.problems, 'length'), /길이가 .+로 달라요/);
    assert.equal(L.freeFeedback(r, { picked: true, chosen: 'length' }).note, L.explainFreeProblem(r.net, r.problems, 'length'));
    const plain = L.explainFreeProblem(r.net, r.problems);
    assert.equal(L.explainFreeProblem(r.net, r.problems, 'overlap'), plain);
    assert.equal(L.explainFreeProblem(r.net, r.problems, null), plain);
    assert.equal(L.explainFreeProblem(r.net, r.problems, 'nope'), plain);
  }
  assert.ok(both >= 10, `까닭이 둘인 판 ${both}개`);
});

test('화면 글: 접기 전 안내 · 까닭 고르기 전의 글에는 까닭 낱말(겹쳐 · 길이 · 비어)이 없다, 단계 글 · 별 기준', () => {
  const play = { solidId: 'tri-a', board: L.boardSize('tri-a') };
  const plan = planCatalog(play, 0);
  for (const faces of [plan.placed.slice(0, 2), plan.placed]) {
    const r = L.foldReadiness(faces, plan.placed.length);
    assert.ok(!/겹|길이|비어/.test(r.text), r.text);
  }
  assert.match(L.foldReadiness(plan.placed.slice(0, 2), 5).text, /5장을 모두 놓으면.*\(2 \/ 5\)/);
  assert.ok(!/겹|길이|비어/.test(L.FREE_NOTE_BEFORE_PICK));
  assert.ok(!/겹|길이|비어/.test(L.FREE_FOLD_APART));
  assert.equal(STAGE.count, 2);
  assert.equal(STAGE.title, '전개도 완성하기');
  assert.ok(STAGE.goal.length <= 30);
  assert.ok(!/붙일 자리|주문 ①/.test(STAGE.goal));
});
