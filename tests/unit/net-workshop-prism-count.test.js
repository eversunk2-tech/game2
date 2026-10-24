/**
 * 도전 주문서 "모서리와 꼭짓점"(prism-count — Build G2, 사용자 결정 15-25 · 15-26): 문항 · 보기 · 채점 · 규칙.
 * 모서리 · 꼭짓점 · 면의 수는 독립 계산(각기둥의 면 꼭짓점에서 직접 센 수 — 저장소의 셈 함수를 쓰지 않는다)과 견준다.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../src/shared/core/random.js';
import { prismSolid, BASES } from '../../src/games/net-workshop/solids.js';
import * as C from '../../src/games/net-workshop/grade6/prism-count-logic.js';
import { PRISM_COUNT_TAGS, PRISM_STAGES } from '../../src/games/net-workshop/grade6/prism-stages.js';
import { LEARN, ruleHits } from './net-workshop-prism-count-rules.js';

const STAGE = PRISM_STAGES.find((s) => s.id === 'prism-count');
const make = (seed) => C.makeCountQuestions(STAGE, createRng(`${seed}:prism-count`));

/** 독립: 각기둥의 꼭짓점 · 모서리 · 면을 겉면의 꼭짓점에서 직접 센다 */
function indepCounts(solid) {
  const key = (p) => p.map((v) => Math.round(v * 1e6)).join(',');
  const vertices = new Set(solid.faces.flatMap((f) => f.points.map(key)));
  const edges = new Set();
  for (const f of solid.faces) f.points.forEach((p, i) => edges.add([key(p), key(f.points[(i + 1) % f.points.length])].sort().join('~')));
  return { vertices: vertices.size, edges: edges.size, faces: solid.faces.length };
}

test('도전 주문서 단계: 각기둥 차시의 도전(challenge) · 시간 재기는 켠 학생만 · 5문항 · 셈 주문', () => {
  assert.equal(STAGE.challenge, true);
  assert.equal(STAGE.timer, 'optional');
  assert.equal(STAGE.count, 5);
  assert.equal(STAGE.order, '셈 주문');
  assert.equal(STAGE.title, '모서리와 꼭짓점');
  assert.equal(STAGE.lesson, 'prism');
});

test('셈 = 독립 계산: 나오는 모든 밑면의 각기둥에서 모서리 3n · 꼭짓점 2n · 면 n + 2', () => {
  for (const b of BASES) {
    for (const height of C.COUNT_HEIGHTS) {
      const solid = prismSolid({ base: b.poly, height });
      const ind = indepCounts(solid);
      const n = b.poly.length;
      assert.deepEqual(C.countsOf(n), ind, b.id);
    }
  }
});

test('문항(시드 400판): 같은 시드면 같은 문항. 셈 3(변의 수가 서로 다른 각기둥 — 모서리 둘 · 꼭짓점 하나) + 규칙 2(모서리 → 꼭짓점). 보기는 서로 다른 넷, 정답 하나. 흔한 실수 "한 밑면의 변의 수 n"은 판마다 셈 문항 하나에만(15-29), n이 없는 모서리 문항에는 2n(두 밑면의 모서리만 — R7 · G2b-1)', () => {
  for (let seed = 0; seed < 400; seed += 1) {
    const qs = make(seed);
    assert.deepEqual(qs.map((q) => q.itemId), make(seed).map((q) => q.itemId));
    assert.equal(qs.length, 5);
    const counts = qs.slice(0, 3);
    assert.ok(counts.every((q) => q.kind === 'count'));
    assert.equal(new Set(counts.map((q) => q.n)).size, 3);
    assert.deepEqual(counts.map((q) => q.what).sort(), ['edges', 'edges', 'vertices']);
    // 판마다 한 번은 반드시 만나고, 한 번만
    assert.equal(counts.filter((q) => q.choices.some((c) => c.value === q.n)).length, 1, `시드 ${seed}: 흔한 실수 n은 한 문항에만`);
    for (const q of counts) {
      const values = q.choices.map((c) => c.value);
      assert.equal(values.length, 4);
      assert.equal(new Set(values).size, 4);
      assert.deepEqual(values, [...values].sort((a, b) => a - b), '작은 수부터');
      assert.equal(values.filter((v) => v === q.answer).length, 1);
      assert.equal(q.answer, q.what === 'edges' ? 3 * q.n : 2 * q.n);
      assert.equal(indepCounts(q.solid)[q.what], q.answer);
      assert.ok(values.every((v) => v > 0));
      if (q.what === 'edges' && !values.includes(q.n)) assert.ok(values.includes(2 * q.n), 'n이 없는 모서리 문항에는 두 밑면의 모서리 2n(G2b-1)');
    }
    assert.deepEqual(qs.slice(3).map((q) => [q.kind, q.what, q.answer]), [['rule', 'edges', 'x3'], ['rule', 'vertices', 'x2']]);
    for (const q of qs.slice(3)) assert.deepEqual(q.choices.map((c) => c.id).sort(), ['p2', 'x2', 'x2p2', 'x3']);
  }
});

// 보기만 보고 고르는 규칙의 맞힐 확률: 한 꼴의 문항 묶음(값 v · 정답 자리 ai · n · 확률 p) → { 규칙: 확률 } (특징 묶음 규칙은 그 값의 보기가 없는 문항에서 0.25)
function ruleRates(items) {
  const sum = {};
  const seen = {};
  let mass = 0;
  for (const { v, ai, n, p } of items) {
    mass += p;
    for (const [k, x] of Object.entries(ruleHits(v, ai, n))) {
      sum[k] = (sum[k] ?? 0) + p * x;
      seen[k] = (seen[k] ?? 0) + p;
    }
    for (const [k, f] of Object.entries(LEARN)) sum[k] = (sum[k] ?? 0) + p * f(v, ai, n);
  }
  const out = {};
  for (const [k, x] of Object.entries(sum)) out[k] = (x + (k in LEARN ? 0 : 0.25 * (mass - seen[k]))) / mass;
  return out;
}
const KINDS = ['edges', 'edges+n', 'vertices', 'vertices+n'];
const SHARE = { edges: 4 / 9, 'edges+n': 2 / 9, vertices: 2 / 9, 'vertices+n': 1 / 9 }; // 셈 문항 셋 = 모서리 둘 · 꼭짓점 하나, n이 보이는 문항은 셋에 하나
const worst = (rates) => Object.entries(rates).filter(([k]) => !(k in LEARN)).sort((x, y) => y[1] - x[1])[0];

test('보기 묶음 표(CHOICE_TABLE — 정확히, 뽑기 없이): 판정 기준 목록(재검토 3 R3-5 + N 규칙 — 자리 · 간격 · 가까운 두 수 · 평균 · 짝홀 · 특징 하나 · 둘 묶음, 주어진 수 n 포함)이 꼴(모서리 · 꼭짓점 × n 보임)마다 모두 0.36 아래, 판 전체 자리 하나 0.35 아래, 꼴 규칙 K2~K5 0.36 아래. n의 배수 차례(배울 내용)는 판 전체 0.6 아래, 3의 배수 · 두 배인 수는 넉넉한 상한. 표의 값은 모두 보기 후보이고 꼭 넣을 보기를 지킨다 (G2c-1 · G2d-1)', () => {
  const all = {};
  for (const kind of KINDS) {
    const what = kind.startsWith('edges') ? 'edges' : 'vertices';
    const must = kind.endsWith('+n');
    const items = [];
    for (const n of [3, 4, 5, 6]) {
      const rows = C.CHOICE_TABLE[kind][n];
      const total = rows.reduce((a, r) => a + r[3], 0);
      const answer = what === 'edges' ? 3 * n : 2 * n;
      const pool = C.countPool(what, n).map((c) => c.value);
      for (const row of rows) {
        const picks = row.slice(0, 3);
        assert.equal(new Set([answer, ...picks]).size, 4, `${kind} ${n} ${row}`);
        assert.ok(picks.every((x) => pool.includes(x) && x !== answer && x > 0));
        assert.equal(picks.includes(n), must, `${kind} ${n}: n은 n이 보이는 문항에만`);
        if (what === 'edges' && !must) assert.ok(picks.includes(2 * n), `${kind} ${n}: 2n`);
        const v = [answer, ...picks].sort((x, y) => x - y);
        items.push({ v, ai: v.indexOf(answer), n, p: row[3] / total / 4 }); // 꼴 안에서 n은 넷이 고르게
      }
    }
    const rates = ruleRates(items);
    all[kind] = rates;
    const [k, x] = worst(rates);
    assert.ok(x < 0.36, `${kind}: 가장 센 규칙 ${k} ${x.toFixed(3)}`);
  }
  // 판 전체: 꼴의 몫으로 섞은 값
  const mix = (k) => KINDS.reduce((a, kind) => a + SHARE[kind] * all[kind][k], 0);
  for (const k of ['pos=p1', 'pos=p2', 'pos=p3', 'pos=p4']) assert.ok(mix(k) < 0.35, `${k} ${mix(k)}`);
  assert.ok(Math.max(mix('n보다 큰 첫째 배수'), mix('n보다 큰 둘째 배수')) < 0.6, `n의 배수 차례 ${mix('n보다 큰 첫째 배수')} · ${mix('n보다 큰 둘째 배수')}`);
  // 꼴 규칙(정확히): K2 꼴마다 가장 자주 맞는 자리 하나 · K3 모서리 · 꼭짓점마다 한 자리 · K4 모서리면 셋째, 꼭짓점이면 첫째 · K5 꼭짓점이고 n이 없으면 가장 작은 수
  const posOf = (kind, i) => all[kind][`pos=p${i + 1}`];
  const k2 = KINDS.reduce((a, kind) => a + SHARE[kind] * Math.max(...[0, 1, 2, 3].map((i) => posOf(kind, i))), 0);
  const k3 = ['edges', 'vertices'].reduce((a, w) => a + Math.max(...[0, 1, 2, 3].map((i) => KINDS.filter((k) => k.startsWith(w)).reduce((t, k) => t + SHARE[k] * posOf(k, i), 0))), 0);
  const k4 = KINDS.reduce((a, kind) => a + SHARE[kind] * posOf(kind, kind.startsWith('edges') ? 2 : 0), 0);
  const k5 = SHARE.vertices * posOf('vertices', 0) + (1 - SHARE.vertices) * 0.25;
  for (const [name, x] of [['K2 꼴마다 한 자리', k2], ['K3 모서리 · 꼭짓점마다 한 자리', k3], ['K4 모서리 셋째 · 꼭짓점 첫째', k4], ['K5 꼭짓점 · n 없으면 가장 작은 수', k5]]) assert.ok(x < 0.36, `${name} ${x}`);
  // 배울 내용(정답이 늘 n × 3 · n × 2라 생김 — 기준 밖, 넉넉한 상한으로 크게 달라지지 않는지만): 이 표에서 꼴마다 가장 큰 값 3의 배수 55.9% · 다른 보기의 두 배 71.8%(꼭짓점과 n — 보이는 n의 두 배가 정답) · n보다 큰 배수 가운데 65.3%
  for (const kind of KINDS) for (const k of ['N9 3의 배수 가운데', 'N11 다른 보기의 두 배인 수', 'L3 n보다 큰 n의 배수 가운데']) assert.ok(all[kind][k] < 0.8, `${kind} · ${k} ${all[kind][k]}`);
});

test('자리 · 값 · 꼴만 보고 고르기(시드 20,000판 — 문제 만들기가 표대로 뽑는다): 꼴마다 규칙 전부 0.37 아래(뽑기의 흔들림 — 정확한 값은 앞 검사), 꼴마다 한 자리 · "모서리 셋째 · 꼭짓점 첫째" · 지워 가며 0.36 아래, 규칙 문항의 정답 자리도 고르다 (G2-1 · G2b-1 · G2c-1)', () => {
  const byKind = Object.fromEntries(KINDS.map((k) => [k, []]));
  const pos = Object.fromEntries(KINDS.map((k) => [k, [0, 0, 0, 0]]));
  let count = 0;
  let elim = 0;
  let edges3vert1 = 0;
  const rulePos = [0, 0, 0, 0];
  const SEEDS = 20000;
  for (let seed = 0; seed < SEEDS; seed += 1) {
    const qs = make(`v${seed}`);
    const prev = [];
    for (const q of qs.slice(0, 3)) {
      const v = q.choices.map((c) => c.value);
      const ai = v.indexOf(q.answer);
      const kind = `${q.what}${v.includes(q.n) ? '+n' : ''}`;
      byKind[kind].push({ v, ai, n: q.n, p: 1 });
      pos[kind][ai] += 1;
      count += 1;
      const left = [1, 2, 3].filter((i) => !prev.includes(i));
      const pickFrom = left.length > 0 ? left : [1, 2, 3];
      elim += pickFrom.includes(ai) ? 1 / pickFrom.length : 0;
      edges3vert1 += Number(ai === (q.what === 'edges' ? 2 : 0));
      prev.push(ai); // 답하면 화면이 정답을 보여 준다
    }
    for (const q of qs.slice(3)) rulePos[q.choices.findIndex((c) => c.id === q.answer)] += 1;
  }
  for (const kind of KINDS) {
    assert.ok(byKind[kind].length > 6000, `${kind} 문항 수 ${byKind[kind].length}`);
    const [k, x] = worst(ruleRates(byKind[kind]));
    assert.ok(x < 0.37, `${kind}: 가장 센 규칙 ${k} ${x.toFixed(3)}`);
  }
  const bestPerKind = KINDS.reduce((a, kind) => a + Math.max(...pos[kind]), 0) / count;
  assert.ok(bestPerKind < 0.36, `꼴마다 한 자리 ${bestPerKind}`);
  assert.ok(edges3vert1 / count < 0.36, `모서리 셋째 · 꼭짓점 첫째 ${edges3vert1 / count}`);
  assert.ok(elim / count < 0.36, `지워 가며 ${elim / count}`);
  for (const p of rulePos) assert.ok(p / (2 * SEEDS) > 0.2 && p / (2 * SEEDS) < 0.3, `규칙 자리 ${rulePos}`);
});

test('채점: 정답은 맞음(tag 없음), 틀린 보기는 그 실수의 까닭 문장과 tag — 옆으로 선 모서리만 · 한 밑면만 · 모서리 · 면의 수 · 두 번 셈. 규칙 문항은 표의 한 줄로 짚는다', () => {
  for (let seed = 0; seed < 200; seed += 1) {
    const qs = make(`j${seed}`);
    for (const q of qs.slice(0, 3)) {
      for (const c of q.choices) {
        const r = C.judgeCount(q, c.value);
        assert.equal(r.correct, c.value === q.answer);
        assert.equal(r.expected, `${q.answer}개`);
        if (r.correct) assert.equal(r.tag, null);
        else assert.equal(r.tag, q.what === 'edges' ? PRISM_COUNT_TAGS.edges : PRISM_COUNT_TAGS.vertices);
        if (c.why === 'side') assert.match(r.message, /옆으로 선 모서리만/);
        if (c.why === 'base2') assert.match(r.message, /두 밑면의 모서리만/);
        if (c.why === 'one') assert.match(r.message, /한 밑면의 꼭짓점만/);
        assert.match(r.message, new RegExp(`${q.answer}개`));
      }
    }
    const rows = qs.slice(0, 3).map((q) => ({ name: q.name, n: q.n }));
    for (const q of qs.slice(3)) {
      for (const c of q.choices) {
        const r = C.judgeRule(q, c.id, rows);
        assert.equal(r.correct, c.id === q.answer);
        assert.equal(r.tag, r.correct ? null : PRISM_COUNT_TAGS.rule);
        assert.ok(r.message.includes(rows[0].name));
      }
    }
  }
});

test('별(엔진 기본 — 5문항을 한 번씩): 모두 맞힘 100% ★3 · 한 번 틀림 80% ★2 · 두 번 60% ★1 — 셋 모두 나온다', () => {
  const stars = (wrong) => {
    const acc = (5 - wrong) / 5;
    return acc >= 0.9 ? 3 : acc >= 0.7 ? 2 : 1;
  };
  assert.deepEqual([0, 1, 2, 3].map(stars), [3, 2, 1, 1]);
});

test('물음 글', () => {
  const qs = make(1);
  for (const q of qs) assert.ok(C.countPrompt(q).length > 5);
  assert.equal(C.countPrompt({ kind: 'count', what: 'edges' }), '모서리는 모두 몇 개일까요?');
  assert.equal(C.countPrompt({ kind: 'count', what: 'vertices' }), '꼭짓점은 모두 몇 개일까요?');
});
