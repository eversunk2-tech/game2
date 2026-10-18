/**
 * 각기둥의 전개도 차시(prism)의 단계·문항·채점·별·점수 (grade6/prism-stages.js · prism-logic.js). 기획서: spec-grade6.md 2-2 · 4 · 5 · 6-4 · 8절, common-rules 1·3절.
 * 판정과 맞닿는 선분은 독립 계산(net-workshop-prism-indep.js — 저장소의 fold.js를 쓰지 않는다)과, 점수는 기획서 문장으로 짠 계산과 견준다.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRng } from '../../src/shared/core/random.js';
import { createPlayReward, stageXp } from '../../src/shared/core/rewards.js';
import { starsFromAccuracy } from '../../src/shared/core/progress.js';
import { checkNet, foldNet } from '../../src/games/net-workshop/fold.js';
import { LESSONS, STAGES } from '../../src/games/net-workshop/logic.js';
import { BLOCK_LESSONS, BLOCK_STAGES } from '../../src/games/net-workshop/blocks/blocks-stages.js';
import { BASES, REGULAR_KINDS, netBox } from '../../src/games/net-workshop/solids.js';
import { SPIN, TILT, viewDir } from '../../src/games/net-workshop/orbit.js';
import { PRISM_HOW_TO, PRISM_LESSONS, PRISM_STAGES, PRISM_TAGS } from '../../src/games/net-workshop/grade6/prism-stages.js';
import { PRISM_STAGES as STAGE_CARDS } from '../../src/games/net-workshop/grade6/index.js';
import {
  PRISM_FIT,
  PRISM_JUDGE_REASONS,
  judgeParts,
  judgePrismAnswer,
  judgePrismEdge,
  judgePrismReason,
  makePrismQuestions,
  prismReasonOf,
  prismReasons,
} from '../../src/games/net-workshop/grade6/prism-logic.js';
import { E, edgesOfPoly, fold3d, rotate, v, verdict } from './net-workshop-prism-indep.js';

const stage = (id) => PRISM_STAGES.find((s) => s.id === id);
const questionsOf = (id, seed) => makePrismQuestions(stage(id), createRng(`${seed}:${id}`));
const SEEDS = Array.from({ length: 200 }, (_, i) => i);
const baseOf = (q) => BASES.find((b) => b.id === q.base);
// 기획서 4절 오개념 표의 각기둥 줄 (글자까지 같아야 학습 기록이 기획서와 맞는다)
const SPEC_TAGS = ['밑면은 바닥 면', '옆면 수 = 밑면 변 수', '옆면은 직사각형', '두 밑면의 위치', '두 밑면은 합동', '맞닿는 모서리 길이', '만나는 선분', '여러 가지 전개도'];
const TAG_VALUES = new Set(Object.values(PRISM_TAGS));

/** 채점 결과의 공통 조건: tag는 오개념 표 안, 문장은 비어 있지 않고 조사가 맞음 */
function checkResult(result, label) {
  assert.equal(typeof result.message, 'string', label);
  assert.ok(result.message.length > 5, label);
  assert.doesNotMatch(result.message, /undefined|NaN|null|\?|\[object/, label);
  assert.doesNotMatch(result.message, /면(와|가|는|를)[\s.,]/, `${label}: ${result.message}`);
  assert.doesNotMatch(result.message, /기둥(가|는|를|예요)[\s.,]/, `${label}: ${result.message}`);
  if (result.correct) {
    assert.equal(result.tag, null, label);
    assert.match(result.message, /^맞아요!/, label);
  } else assert.ok(TAG_VALUES.has(result.tag), `${label}: ${result.tag}`);
}

test('단계: 각기둥 차시는 3단계(밑면과 옆면 3 · 각기둥이 될까? 5 · 맞닿는 선분 3), 모두 영역 prism, id가 게임 전체에서 겹치지 않는다. tag는 기획서 4절 그대로', () => {
  assert.deepEqual(PRISM_LESSONS.map((l) => [l.id, l.title, l.note]), [['prism', '각기둥의 전개도', '6학년 1학기 · 각기둥과 각뿔']]);
  assert.ok(PRISM_LESSONS[0].minutes >= 4 && PRISM_LESSONS[0].minutes <= 10);
  assert.deepEqual(PRISM_STAGES.map((s) => [s.id, s.kind, s.count, s.order, s.area, s.lesson]), [
    ['prism-parts', 'parts', 3, '살펴보기 주문', 'prism', 'prism'],
    ['prism-judge', 'pjudge', 5, '검사 주문', 'prism', 'prism'],
    ['prism-edge', 'pedge', 3, '짝 찾기 주문', 'prism', 'prism'],
  ]);
  assert.deepEqual(PRISM_STAGES.map((s) => s.title), ['밑면과 옆면', '각기둥이 될까?', '맞닿는 선분']);
  assert.ok(PRISM_STAGES.every((s) => !s.challenge && s.goal.length <= 30), '목표 문장은 짧게(태블릿에서 한 줄)');
  const all = [...STAGES, ...BLOCK_STAGES, ...PRISM_STAGES].map((s) => s.id);
  assert.equal(new Set(all).size, all.length);
  const lessons = [...LESSONS, ...BLOCK_LESSONS, ...PRISM_LESSONS].map((l) => l.id);
  assert.equal(new Set(lessons).size, lessons.length);
  // 단계 카드 그림은 바탕 묶음(index.js)이 붙인다
  assert.deepEqual(STAGE_CARDS.map((s) => typeof s.thumb), ['function', 'function', 'function']);
  assert.deepEqual(new Set(Object.values(PRISM_TAGS)), new Set(SPEC_TAGS));
  assert.ok(PRISM_HOW_TO.length >= 3 && PRISM_HOW_TO.every((line) => line.length > 10));
});

test('같은 시드면 같은 문항, 다른 시드면 대체로 다른 문항 · 문항 만들기는 빠르다', () => {
  for (const s of PRISM_STAGES) {
    const summary = (qs) => JSON.stringify(qs.map((q) => [q.itemId, q.net.faces.map((f) => [f.id, f.label, f.role, f.poly])]));
    assert.equal(summary(questionsOf(s.id, 'x')), summary(questionsOf(s.id, 'x')), s.id);
    const many = new Set(SEEDS.slice(0, 40).map((seed) => summary(questionsOf(s.id, seed))));
    assert.ok(many.size > 35, s.id);
    const t = Date.now();
    for (const seed of SEEDS.slice(0, 50)) questionsOf(s.id, seed);
    assert.ok(Date.now() - t < 3000, `${s.id} ${Date.now() - t}ms`); // 한 판에 수십 ms 안 (느린 기기 여유)
  }
});

test('판별 200판(1,000문항): 되는 것 2(띠 꼴 1 + 낯선 꼴 1) · 안 되는 것 3(옆면의 수 · 두 밑면이 같은 쪽 · 길이 또는 직사각형이 아닌 옆면). checkNet = 독립 판정, 의도한 까닭이 독립 계산에서도 참', () => {
  const kinds = { strip: 0, lone: 0, count: 0, same: 0, length: 0, shape: 0 };
  for (const seed of SEEDS) {
    const qs = questionsOf('prism-judge', seed);
    assert.equal(qs.length, 5);
    const types = qs.map((q) => (q.valid ? q.form : q.intended)).sort();
    assert.equal(types.filter((t) => t === 'strip').length, 1, String(seed));
    assert.equal(types.filter((t) => t === 'lone').length, 1);
    assert.equal(types.filter((t) => t === 'count').length, 1);
    assert.equal(types.filter((t) => t === 'same').length, 1);
    assert.equal(types.filter((t) => t === 'length' || t === 'shape').length, 1);
    for (const q of qs) {
      const label = `${seed} ${q.itemId}`;
      kinds[q.valid ? q.form : q.intended] += 1;
      const base = baseOf(q);
      const indep = verdict(q.net, base.poly);
      assert.equal(checkNet(q.net).ok, indep.ok, label);
      assert.equal(q.valid, indep.ok, label);
      assert.deepEqual(q.problems, checkNet(q.net).problems, label);
      assert.equal(q.expected, q.valid ? 'yes' : 'no');
      // 무대에 들어가는 크기(1 cm의 화면 크기는 문항마다 같다)
      const [w, h] = netBox(q.net);
      assert.ok(w <= PRISM_FIT[0] + 1e-6 && h <= PRISM_FIT[1] + 1e-6, label);
      if (!q.valid) {
        if (q.intended === 'count') assert.ok(indep.count && !indep.shape && !indep.length, label);
        if (q.intended === 'same') assert.ok(indep.overlap && indep.gap && !indep.count && !indep.shape && !indep.length, label);
        if (q.intended === 'length') assert.ok(indep.length && !indep.count && !indep.shape && !indep.overlap, label);
        if (q.intended === 'shape') assert.ok(indep.shape && !indep.count && !indep.length && !indep.overlap, label);
        if (q.intended === 'length') assert.ok(REGULAR_KINDS.includes(base.kind), label); // 다른 옆면과 견줘 보이게
        if (q.intended === 'count') {
          const sides = q.net.faces.filter((f) => f.role === 'side').length;
          assert.equal(Math.abs(sides - base.n), 1, label);
          if (base.n === 3) assert.equal(sides, 4); // "옆면은 늘 4개다"를 만나게
          if (base.n >= 5) assert.equal(sides, base.n - 1);
        }
      }
      // 채점: 맞힘 · 틀림 모두 문장과 tag
      for (const answer of ['yes', 'no']) checkResult(judgePrismAnswer(q, answer), `${label} ${answer}`);
      if (!q.valid) {
        const tag = judgePrismAnswer(q, 'yes').tag;
        assert.equal(tag, { count: '옆면 수 = 밑면 변 수', same: '두 밑면의 위치', length: '맞닿는 모서리 길이', shape: '옆면은 직사각형' }[q.intended], label);
      } else assert.equal(judgePrismAnswer(q, 'no').tag, '여러 가지 전개도');
      // 면의 id · 이름 · 차례는 섞여 있다: 이름은 차례대로 가, 나, 다 …, id는 f0 …
      assert.deepEqual(q.net.faces.map((f) => f.id), q.net.faces.map((_, i) => `f${i}`));
      assert.deepEqual(q.net.faces.map((f) => f.label), ['가', '나', '다', '라', '마', '바', '사', '아'].slice(0, q.net.faces.length));
    }
  }
  for (const [k, n] of Object.entries(kinds)) assert.ok(n > 60, `${k} ${n}`);
});

test('판별의 화면이 답을 알려 주지 않는다: 밑면·고친 면이 놓이는 차례(DOM 차례 = 면 이름)가 한쪽으로 치우치지 않는다', () => {
  const basePos = new Map();
  const oddPos = new Map();
  for (const seed of SEEDS) {
    for (const q of questionsOf('prism-judge', seed)) {
      q.net.faces.forEach((f, i) => {
        if (f.role === 'base') basePos.set(i, (basePos.get(i) ?? 0) + 1);
        if (f.exact === false) oddPos.set(i, (oddPos.get(i) ?? 0) + 1);
      });
    }
  }
  // 밑면은 어느 차례에나 온다(처음 두 자리에 몰리지 않는다)
  for (let i = 0; i < 7; i += 1) assert.ok((basePos.get(i) ?? 0) > 60, `밑면 ${i}: ${basePos.get(i)}`);
  assert.ok([...oddPos.keys()].length >= 5, JSON.stringify([...oddPos]));
});

test('까닭 고르기(칩 넷 — 교과서 정리의 말): 의도한 까닭의 칩이 맞고, 옆면을 더한 것은 면의 수와 겹침 둘 다 맞다. 그 밖의 칩은 틀리고 바른 까닭을 알려 준다', () => {
  assert.deepEqual(PRISM_JUDGE_REASONS.map((r) => r.text), ['면의 수가 달라요', '옆면이 직사각형이 아니에요', '면이 겹쳐요', '맞닿는 선분의 길이가 달라요']);
  const want = { count: 'count', same: 'overlap', length: 'length', shape: 'shape' };
  for (const seed of SEEDS.slice(0, 80)) {
    for (const q of questionsOf('prism-judge', seed).filter((x) => !x.valid)) {
      const truths = prismReasons(q.problems);
      assert.ok(truths.includes(want[q.intended]), `${q.itemId} ${truths}`);
      assert.equal(prismReasonOf(q.problems), want[q.intended]);
      const extra = truths.filter((t) => t !== want[q.intended]);
      if (q.intended === 'count' && q.net.faces.filter((f) => f.role === 'side').length > baseOf(q).n) assert.deepEqual(extra, ['overlap']);
      else assert.deepEqual(extra, [], q.itemId);
      for (const r of PRISM_JUDGE_REASONS) {
        const res = judgePrismReason(q.problems, r.id);
        assert.equal(res.correct, truths.includes(r.id));
        if (!res.correct) assert.equal(res.answerText, PRISM_JUDGE_REASONS.find((x) => x.id === want[q.intended]).text);
      }
    }
  }
});

test('밑면과 옆면 200판: 밑면 종류가 서로 다른 3문항, 눕힌 각기둥은 늘 1개, 사각기둥은 사다리꼴 밑면만. 놓인 자세에서 바닥 면이 아래를 향한다(독립 계산)', () => {
  const at = new Map();
  for (const seed of SEEDS) {
    const qs = questionsOf('prism-parts', seed);
    assert.equal(qs.length, 3);
    assert.equal(new Set(qs.map((q) => baseOf(q).kind)).size, 3);
    assert.equal(qs.filter((q) => q.lying).length, 1, String(seed));
    for (const q of qs) {
      const base = baseOf(q);
      assert.notEqual(base.kind, 'rect', q.itemId);
      assert.ok(checkNet(q.net).ok && verdict(q.net, base.poly).ok, q.itemId);
      assert.equal(q.bases.length, 2);
      assert.ok(q.bases.every((id) => q.net.faces.find((f) => f.id === id).role === 'base'));
      const ground = q.net.faces.find((f) => f.id === q.ground);
      assert.equal(ground.role, q.lying ? 'side' : 'base', q.itemId);
      // 놓는 자세(돌림 차례)를 독립으로 적용하면 바닥 면의 바깥 법선이 아래(−z)를 향한다
      const n0 = foldNet(q.net, 1).faces.find((f) => f.id === q.ground).normal;
      const n = q.pose.reduce((p, r) => rotate(p, [0, 0, 0], r.axis, r.angle), n0);
      assert.ok(v.len(v.sub(n, [0, 0, -1])) < 1e-6, `${q.itemId} ${n}`);
      // 처음 보기(기울기 56° · 돌림 −28°)에서 밑면 하나는 보는 쪽을 향한다(눕힌 각기둥도 한쪽 끝이 비스듬히 보인다)
      const facing = foldNet(q.net, 1).faces.filter((f) => q.bases.includes(f.id))
        .map((f) => viewDir(q.pose.reduce((p, r) => rotate(p, [0, 0, 0], r.axis, r.angle), f.normal), TILT, SPIN)[2]);
      assert.ok(Math.max(...facing) >= 0.3 - 1e-9, `${q.itemId} ${facing}`);
      q.net.faces.forEach((f, i) => { if (f.role === 'base') at.set(i, (at.get(i) ?? 0) + 1); });
    }
  }
  // 밑면이 놓이는 DOM 차례(= 화면 읽기의 "n번 면")가 치우치지 않는다
  for (let i = 0; i < 5; i += 1) assert.ok((at.get(i) ?? 0) > 50, `${i}: ${at.get(i)}`);
});

test('밑면과 옆면 채점: 두 밑면만 맞고(순서 상관없음), 그 밖의 모든 두 면은 틀리며 tag "밑면은 바닥 면". 눕힌 각기둥의 바닥 면을 고르면 그 말을 먼저 한다', () => {
  for (const seed of SEEDS.slice(0, 60)) {
    for (const q of questionsOf('prism-parts', seed)) {
      const ids = q.net.faces.map((f) => f.id);
      checkResult(judgeParts(q, [q.bases[1], q.bases[0]]), q.itemId);
      assert.equal(judgeParts(q, q.bases).correct, true);
      for (let i = 0; i < ids.length; i += 1) {
        for (let j = i + 1; j < ids.length; j += 1) {
          const pair = [ids[i], ids[j]];
          if (pair.sort().join() === [...q.bases].sort().join()) continue;
          const r = judgeParts(q, pair);
          checkResult(r, `${q.itemId} ${pair}`);
          assert.equal(r.correct, false);
          assert.equal(r.tag, '밑면은 바닥 면');
          assert.equal(r.message.startsWith('바닥에 닿은 면이라고'), q.lying && pair.includes(q.ground), `${q.itemId} ${pair}`);
        }
      }
    }
  }
  // 정답 문장: 이름과 옆면의 수
  const q = questionsOf('prism-parts', 3).find((x) => baseOf(x).kind === 'pent') ?? questionsOf('prism-parts', 3)[0];
  assert.match(judgeParts(q, q.bases).message, new RegExp(`${q.name}이에요\\. 옆면은 ${q.sides}개예요\\.$`));
});

test('맞닿는 선분 200판: 보기 4개(정답 · 바로 옆 선분 · 길이가 같은 선분 · 아무 선분), 정답은 독립으로 접은 입체에서 물음의 선분과 만나는 선분이고 바로 옆이 아니다. 정답 번호가 1~4에 고르게', () => {
  const answerAt = [0, 0, 0, 0];
  for (const seed of SEEDS) {
    for (const q of questionsOf('prism-edge', seed)) {
      const label = `${seed} ${q.itemId}`;
      assert.ok(checkNet(q.net).ok, label);
      assert.equal(q.options.length, 4);
      assert.deepEqual(q.options.map((o) => o.number), [1, 2, 3, 4]);
      assert.equal(new Set(q.options.map((o) => o.index)).size, 4);
      assert.ok(q.options.some((o) => o.index === q.answer));
      assert.ok(!q.options.some((o) => o.index === q.target));
      answerAt[q.options.findIndex((o) => o.index === q.answer)] += 1;
      // 독립: 펼친 그림의 테두리 선분 둘이 바로 옆(꼭짓점을 함께 씀)인가, 접은 입체에서 같은 자리에서 만나는가
      const folded = fold3d(q.net, baseOf(q).poly);
      const flatSeg = (s) => edgesOfPoly(q.net.faces.find((f) => f.id === s.face).poly)[s.edge];
      const foldSeg = (s) => edgesOfPoly(folded[q.net.faces.findIndex((f) => f.id === s.face)])[s.edge];
      const touch = (a, b) => a.some((p) => b.some((r) => v.len(v.sub(p, r)) < E));
      const meet = (a, b) => (v.len(v.sub(a[0], b[0])) < E && v.len(v.sub(a[1], b[1])) < E) || (v.len(v.sub(a[0], b[1])) < E && v.len(v.sub(a[1], b[0])) < E);
      const T = q.segments[q.target];
      for (const o of q.options) {
        const S = q.segments[o.index];
        assert.equal(meet(foldSeg(T), foldSeg(S)), o.index === q.answer, `${label} ${o.number}`);
        if (o.kind === 'near') assert.ok(touch(flatSeg(T), flatSeg(S)), label);
        if (o.kind === 'same') assert.ok(Math.abs(S.length - T.length) < 1e-6, label);
      }
      assert.ok(!touch(flatSeg(T), flatSeg(q.segments[q.answer])), `${label}: 정답이 물음 바로 옆`);
      assert.ok(q.options.some((o) => o.kind === 'near'), label); // 오개념 "가까이 있는 선분끼리 맞닿는다"
      for (const o of q.options) {
        const r = judgePrismEdge(q, o.index);
        checkResult(r, `${label} ${o.number}`);
        assert.equal(r.correct, o.index === q.answer);
        if (!r.correct) assert.equal(r.tag, '만나는 선분');
      }
    }
  }
  for (const n of answerAt) assert.ok(n > 600 * 0.2 && n < 600 * 0.3, `정답 번호 ${answerAt}`);
});

// ── 별 · 점수 (엔진 규칙 — 게임은 점수를 만들지 않는다) ─────────────
/** 한 판의 솜씨 점수(독립 계산 — spec 16-3 · common-rules 3절의 규칙 문장으로): 처음 시도에 맞힘 +2, 연달아 셋마다 +1, 틀린 뒤 다음 문항을 처음에 맞히면 +1, 틀린 문항을 다시 맞히면 +1, 설명 맞힘 +2(문항마다 한 번) */
function indepScore(steps) {
  const tried = new Map();
  const explained = new Set();
  let xp = 0;
  let streak = 0;
  let fell = false;
  for (const s of steps) {
    if (s.explain) {
      if (!explained.has(s.itemId)) xp += 2;
      explained.add(s.itemId);
      continue;
    }
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
function enginePlay(steps, startStars = 0) {
  const play = createPlayReward({ startStars });
  for (const s of steps) {
    if (s.explain) play.event('explain', { correct: true, itemId: s.itemId });
    else play.answer({ itemId: s.itemId, correct: s.correct });
  }
  return play;
}
/** 한 판의 답 순서: 밑면과 옆면 · 맞닿는 선분은 문항마다 맞힐 때까지(wrongs[i]번 틀린 뒤), 판별은 문항마다 한 번(맞힘 여부) + 안 되는 것을 맞히면 설명 */
function playOf(id, pattern) {
  const steps = [];
  if (id === 'prism-judge') {
    pattern.answers.forEach((correct, i) => {
      steps.push({ itemId: `${id}:${i + 1}`, correct });
      if (correct && pattern.explain[i]) steps.push({ itemId: `${id}:${i + 1}`, explain: true });
    });
  } else {
    pattern.forEach((wrong, i) => {
      for (let k = 0; k < wrong; k += 1) steps.push({ itemId: `${id}:${i + 1}`, correct: false });
      steps.push({ itemId: `${id}:${i + 1}`, correct: true });
    });
  }
  return steps;
}
const accuracyStars = (steps) => {
  const answers = steps.filter((s) => !s.explain);
  return starsFromAccuracy(answers.filter((s) => s.correct).length / answers.length);
};

test('별(세 단계 모두 엔진 기본 — 정답률): 모든 답 순서를 나열하면 ★3·★2·★1이 모두 나온다. 맞힐 때까지 하는 3문항 단계는 틀린 횟수로 정하는 것(0번 ★3 · 1번 ★2 · 2번 이상 ★1)과 같다', () => {
  for (const id of ['prism-parts', 'prism-edge']) {
    const seen = new Set();
    for (let a = 0; a <= 3; a += 1) {
      for (let b = 0; b <= 3; b += 1) {
        for (let c = 0; c <= 3; c += 1) {
          const steps = playOf(id, [a, b, c]);
          const stars = accuracyStars(steps);
          const wrong = a + b + c;
          assert.equal(stars, wrong === 0 ? 3 : wrong === 1 ? 2 : 1, `${id} ${a}${b}${c}`);
          seen.add(stars);
        }
      }
    }
    assert.deepEqual([...seen].sort(), [1, 2, 3], id);
  }
  const seen = new Set();
  for (let mask = 0; mask < 32; mask += 1) {
    const answers = [0, 1, 2, 3, 4].map((i) => Boolean(mask & (1 << i)));
    const stars = accuracyStars(playOf('prism-judge', { answers, explain: answers }));
    const wrong = answers.filter((x) => !x).length;
    assert.equal(stars, wrong === 0 ? 3 : wrong === 1 ? 2 : 1); // 5문항: 1개 틀리면 80%(★2), 2개면 60%(★1)
    seen.add(stars);
  }
  assert.deepEqual([...seen].sort(), [1, 2, 3]);
});

test('점수: 세 단계의 답 순서 6,000판에서 엔진의 점수 = 독립 계산, 일부러 틀려서 이득 보는 길 0, 별 3개 단계를 다시 하면 0', () => {
  const rng = createRng('prism-score');
  for (let n = 0; n < 6000; n += 1) {
    const id = ['prism-parts', 'prism-judge', 'prism-edge'][n % 3];
    let steps;
    let best;
    if (id === 'prism-judge') {
      const answers = [0, 1, 2, 3, 4].map(() => rng.next() < 0.7);
      const explain = [0, 1, 2, 3, 4].map((i) => i >= 2 && rng.next() < 0.5); // 설명은 안 되는 전개도(3개)에만
      steps = playOf(id, { answers, explain });
      best = indepScore(playOf(id, { answers: [true, true, true, true, true], explain: [false, false, true, true, true] }));
    } else {
      steps = playOf(id, [0, 1, 2].map(() => (rng.next() < 0.6 ? 0 : rng.int(1, 3))));
      best = indepScore(playOf(id, [0, 0, 0]));
    }
    const play = enginePlay(steps);
    assert.equal(play.xp(), indepScore(steps), `${id} ${JSON.stringify(steps)}`);
    assert.ok(play.xp() <= best, `${id} ${play.xp()} > ${best}`);
    // 판의 점수(답 + 단계 완료 + 별)도 모두 맞힌 판보다 크지 않다
    const total = play.xp() + stageXp({ prevStars: 0, stars: accuracyStars(steps), cleared: true }).total;
    assert.ok(total <= best + stageXp({ prevStars: 0, stars: 3, cleared: true }).total);
    assert.equal(enginePlay(steps, 3).xp(), 0);
  }
});

test('차시 점수: 모두 처음에 맞히는 학생(설명도 모두 맞힘)이 받는 점수 — 칭호 기준 0·40·100·180·300과 견줄 값', () => {
  const stageTotal = (id, steps) => indepScore(steps) + stageXp({ prevStars: 0, stars: accuracyStars(steps), cleared: true }).total;
  const parts = stageTotal('prism-parts', playOf('prism-parts', [0, 0, 0]));
  // 판별의 설명은 안 되는 전개도 3개에만 있다
  const judge = stageTotal('prism-judge', playOf('prism-judge', { answers: [true, true, true, true, true], explain: [false, false, true, true, true] }));
  const edge = stageTotal('prism-edge', playOf('prism-edge', [0, 0, 0]));
  // 밑면과 옆면: 3 × 2 + 연속 1 + 단계 5 + 별 6 = 18 · 판별: 5 × 2 + 연속 1 + 설명(안 되는 것 3) 6 + 11 = 28 · 맞닿는 선분 18 → 64
  assert.deepEqual([parts, judge, edge], [18, 28, 18]);
  assert.equal(parts + judge + edge, 64); // 첫 차시만 해도 칭호가 한 번 오른다(40) — G2에서 4단계가 더해진다
});
