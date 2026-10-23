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

test('문항(시드 400판): 같은 시드면 같은 문항. 셈 3(변의 수가 서로 다른 각기둥 — 모서리 · 꼭짓점이 한 번 이상씩) + 규칙 2(모서리 → 꼭짓점). 보기는 서로 다른 넷, 정답 하나, 흔한 실수(옆으로 선 모서리만 · 한 밑면만)는 늘', () => {
  for (let seed = 0; seed < 400; seed += 1) {
    const qs = make(seed);
    assert.deepEqual(qs.map((q) => q.itemId), make(seed).map((q) => q.itemId));
    assert.equal(qs.length, 5);
    const counts = qs.slice(0, 3);
    assert.ok(counts.every((q) => q.kind === 'count'));
    assert.equal(new Set(counts.map((q) => q.n)).size, 3);
    assert.ok(counts.some((q) => q.what === 'edges') && counts.some((q) => q.what === 'vertices'));
    for (const q of counts) {
      const values = q.choices.map((c) => c.value);
      assert.equal(values.length, 4);
      assert.equal(new Set(values).size, 4);
      assert.equal(values.filter((v) => v === q.answer).length, 1);
      assert.equal(q.answer, q.what === 'edges' ? 3 * q.n : 2 * q.n);
      assert.ok(values.includes(q.n), '흔한 실수 n');
      assert.equal(indepCounts(q.solid)[q.what], q.answer);
      assert.ok(values.every((v) => v > 0));
    }
    assert.deepEqual(qs.slice(3).map((q) => [q.kind, q.what, q.answer]), [['rule', 'edges', 'x3'], ['rule', 'vertices', 'x2']]);
    for (const q of qs.slice(3)) assert.deepEqual(q.choices.map((c) => c.id).sort(), ['p2', 'x2', 'x2p2', 'x3']);
  }
});

test('값만 보고 고르기(시드 2,000판): 크기 차례로 고르는 길(가장 큰 · 둘째 · 셋째 · 가장 작은)이 찍기(25%)보다 크게 높지 않고(35% 아래), 판마다 정답의 자리가 겹치지 않는다. 규칙 문항의 정답 자리도 고르다', () => {
  const byRank = [0, 0, 0, 0];
  let total = 0;
  const rulePos = [0, 0, 0, 0];
  for (let seed = 0; seed < 2000; seed += 1) {
    const qs = make(`v${seed}`);
    const ranks = [];
    for (const q of qs.slice(0, 3)) {
      const sorted = q.choices.map((c) => c.value).sort((a, b) => a - b);
      const r = sorted.indexOf(q.answer);
      byRank[r] += 1;
      ranks.push(r);
      total += 1;
    }
    assert.equal(new Set(ranks).size, 3, '판 안에서 정답의 크기 차례가 겹치지 않는다');
    for (const q of qs.slice(3)) rulePos[q.choices.findIndex((c) => c.id === q.answer)] += 1;
  }
  for (const r of byRank) assert.ok(r / total < 0.35, `크기 차례 ${byRank.map((x) => (x / total).toFixed(3))}`);
  for (const p of rulePos) assert.ok(p / 4000 > 0.2 && p / 4000 < 0.3, `규칙 자리 ${rulePos}`);
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
