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

test('자리 · 값 · 꼴만 보고 고르기(시드 20,000판 — 독립 계산): 판 전체로도, 문항의 꼴(모서리 · 꼭짓점 × 흔한 실수 n이 보이는지 — 모두 화면에 보임)마다도 정답 자리 하나 · 가장 작은 것 빼기 · 가장 큰 것 빼기 · 가운데 둘 · n과 같은 수 빼기 · 가장 큰 n의 배수 · 가장 큰 간격 바로 아래 · 바로 위 · 간격 옆 빼기가 모두 0.36 아래(자리 하나는 판 전체 0.35 아래). 꼴마다 한 자리 · "모서리면 셋째, 꼭짓점이면 첫째" · 지워 가며도 0.36 아래 (G2-1 · G2-4 · R7 · G2b-1)', () => {
  // 보기만 보고(각기둥은 안 보고) 고르는 규칙 — 맞힐 확률(아무렇게나 고르는 규칙은 고르는 보기 수로 나눔). v: 작은 수부터의 보기, ai: 정답 자리, n: 주어진 수
  const uni = (idx, ai) => (idx.length > 0 ? idx.filter((i) => i === ai).length / idx.length : 0.25);
  const ALL = [0, 1, 2, 3];
  const gapAt = (v) => {
    let best = 0;
    for (let i = 1; i < 3; i += 1) if (v[i + 1] - v[i] > v[best + 1] - v[best]) best = i;
    return best;
  };
  const multiples = (v, n) => ALL.filter((i) => v[i] % n === 0);
  const RULES = {
    '자리 1': (v, ai) => Number(ai === 0),
    '자리 2': (v, ai) => Number(ai === 1),
    '자리 3': (v, ai) => Number(ai === 2),
    '자리 4': (v, ai) => Number(ai === 3),
    '가장 작은 것 빼고': (v, ai) => uni([1, 2, 3], ai),
    '가장 큰 것 빼고': (v, ai) => uni([0, 1, 2], ai),
    '가운데 둘': (v, ai) => uni([1, 2], ai),
    'n과 같은 수 빼고': (v, ai, n) => uni(ALL.filter((i) => v[i] !== n), ai),
    'n이 있으면 가장 큰 것': (v, ai, n) => (v.includes(n) ? Number(ai === 3) : 0.25),
    '가장 큰 n의 배수': (v, ai, n) => Number(multiples(v, n).at(-1) === ai),
    '가장 큰 간격 바로 아래': (v, ai) => Number(gapAt(v) === ai),
    '가장 큰 간격 바로 위': (v, ai) => Number(gapAt(v) + 1 === ai),
    '가장 큰 간격 옆 둘 빼고': (v, ai) => uni(ALL.filter((i) => i !== gapAt(v) && i !== gapAt(v) + 1), ai),
  };
  // "n보다 큰 n의 배수 가운데 첫째 · 둘째": 정답이 늘 2n(꼭짓점) · 3n(모서리)이고 n과 3n 사이의 배수는 2n뿐이라 둘 가운데 큰 쪽은 50% 아래로 갈 수 없다 —
  // 배울 내용(변의 수 × 2 · × 3)으로 보고 0.36 기준에서 빼고 "큰 쪽 0.6 아래"로 따로 잰다(review-prism-g2 재검토)
  const MULT = {
    'n보다 큰 첫째 배수': (v, ai, n) => Number(multiples(v, n).filter((i) => v[i] > n)[0] === ai),
    'n보다 큰 둘째 배수': (v, ai, n) => Number(multiples(v, n).filter((i) => v[i] > n)[1] === ai),
  };
  const kinds = ['모서리', '모서리 · n', '꼭짓점', '꼭짓점 · n'];
  const blank = () => ({ count: 0, pos: [0, 0, 0, 0], ...Object.fromEntries([...Object.keys(RULES), ...Object.keys(MULT)].map((k) => [k, 0])) });
  const all = blank();
  const byKind = Object.fromEntries(kinds.map((k) => [k, blank()]));
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
      const kind = `${q.what === 'edges' ? '모서리' : '꼭짓점'}${v.includes(q.n) ? ' · n' : ''}`;
      for (const box of [all, byKind[kind]]) {
        box.count += 1;
        box.pos[ai] += 1;
        for (const [k, f] of Object.entries({ ...RULES, ...MULT })) box[k] += f(v, ai, q.n);
      }
      const left = [1, 2, 3].filter((i) => !prev.includes(i));
      elim += uni(left.length > 0 ? left : [1, 2, 3], ai);
      edges3vert1 += Number(ai === (q.what === 'edges' ? 2 : 0));
      prev.push(ai); // 답하면 화면이 정답을 보여 준다
    }
    for (const q of qs.slice(3)) rulePos[q.choices.findIndex((c) => c.id === q.answer)] += 1;
  }
  const rate = (box, k) => box[k] / box.count;
  const text = (box) => JSON.stringify(Object.fromEntries(Object.keys(RULES).map((k) => [k, rate(box, k).toFixed(3)])));
  // 판 전체
  for (const k of ['자리 1', '자리 2', '자리 3', '자리 4']) assert.ok(rate(all, k) < 0.35, `${k} ${text(all)}`);
  for (const k of Object.keys(RULES)) assert.ok(rate(all, k) < 0.36, `${k} ${text(all)}`);
  assert.ok(elim / all.count < 0.36, `지워 가며 ${elim / all.count}`);
  // 꼴마다: 같은 규칙이 꼴 하나에서도 0.36 아래
  for (const kind of kinds) {
    assert.ok(byKind[kind].count > 6000, `${kind} 문항 수 ${byKind[kind].count}`);
    for (const k of Object.keys(RULES)) assert.ok(rate(byKind[kind], k) < 0.36, `${kind} · ${k} ${text(byKind[kind])}`);
  }
  // 꼴을 보고 고르기: 꼴마다 가장 자주 맞는 자리 하나 · "모서리면 셋째, 꼭짓점이면 첫째"
  const bestPerKind = kinds.reduce((sum, kind) => sum + Math.max(...byKind[kind].pos), 0) / all.count;
  assert.ok(bestPerKind < 0.36, `꼴마다 한 자리 ${bestPerKind}`);
  assert.ok(edges3vert1 / all.count < 0.36, `모서리 셋째 · 꼭짓점 첫째 ${edges3vert1 / all.count}`);
  // n의 배수 차례(배울 내용 — 따로): 큰 쪽 0.6 아래
  assert.ok(Math.max(rate(all, 'n보다 큰 첫째 배수'), rate(all, 'n보다 큰 둘째 배수')) < 0.6, `${rate(all, 'n보다 큰 첫째 배수')} · ${rate(all, 'n보다 큰 둘째 배수')}`);
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
