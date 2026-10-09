import assert from 'node:assert/strict';
import { test } from 'node:test';
import { starsFromAccuracy } from '../../src/shared/core/progress.js';
import { createRng } from '../../src/shared/core/random.js';
import { XP, createPlayReward, stageXp } from '../../src/shared/core/rewards.js';
import { SYMMETRY_COUNT, fromCells, transformCells } from '../../src/games/net-workshop/fold.js';
import {
  DICE_EXPECTED,
  DICE_GOAL,
  DICE_HINT_TEXT,
  DICE_PIPS,
  STAGES,
  TAGS,
  createDiceSession,
  diceCheck,
  diceFoldNote,
  diceHighlights,
  diceHintNet,
  diceLayoutKey,
  diceOrdinal,
  dicePairs,
  diceSummary,
  judgeDice,
  pipName,
} from '../../src/games/net-workshop/logic.js';
import { CUBE_NETS, INVALID_HEXOMINOES } from '../../src/games/net-workshop/nets-data.js';

// 도전 주문서 "주사위 주문"(cube-dice, spec 16-3): 눈 카드 1~6을 놓아 접었을 때 마주 보는 두 눈의 합이 모두 7인 전개도 2개(서로 다른 모양)

const byName = (name) => [...CUBE_NETS, ...INVALID_HEXOMINOES].find((n) => n.name === name);

/**
 * 정육면체 감싸기 — fold.js를 쓰지 않는 독립 계산 (net-workshop-logic.test.js와 같은 방법).
 * 칸마다 놓인 면의 바깥 법선 'x,y,z'. 법선이 서로 반대인 두 칸이 마주 보는 면이다.
 */
function wrap(cells) {
  const key = ([x, y]) => `${x},${y}`;
  const index = new Map(cells.map((c, i) => [key(c), i]));
  const neg = (v) => v.map((a) => -a);
  const frames = new Array(cells.length);
  frames[0] = { n: [0, 0, 1], x: [1, 0, 0], y: [0, 1, 0] };
  const queue = [0];
  while (queue.length > 0) {
    const i = queue.shift();
    const { n, x, y } = frames[i];
    const moves = [
      [[1, 0], { n: x, x: neg(n), y }],
      [[-1, 0], { n: neg(x), x: n, y }],
      [[0, 1], { n: y, x, y: neg(n) }],
      [[0, -1], { n: neg(y), x, y: n }],
    ];
    for (const [[dx, dy], frame] of moves) {
      const j = index.get(key([cells[i][0] + dx, cells[i][1] + dy]));
      if (j === undefined || frames[j]) continue;
      frames[j] = frame;
      queue.push(j);
    }
  }
  return frames.map((f) => f.n.map((v) => v + 0).join(','));
}

/** 독립 계산: 칸 번호로 본 마주 보는 세 쌍 [[i, j], …] (정육면체가 되는 전개도만) */
function oppositeCells(cells) {
  const normals = wrap(cells);
  const opposite = (text) => text.split(',').map((v) => -Number(v) + 0).join(',');
  const pairs = [];
  normals.forEach((n, i) => {
    const j = normals.indexOf(opposite(n));
    if (j > i) pairs.push([i, j]);
  });
  return pairs;
}

/** 독립 계산: 눈을 놓은 전개도에서 마주 보는 눈 쌍 [[작은 눈, 큰 눈], …] 작은 눈 순 */
const independentPairs = (cells, labels) => oppositeCells(cells)
  .map(([i, j]) => [Number(labels[i]), Number(labels[j])].sort((a, b) => a - b))
  .sort((a, b) => a[0] - b[0]);

function permutations(list) {
  if (list.length <= 1) return [list];
  return list.flatMap((x, i) => permutations([...list.slice(0, i), ...list.slice(i + 1)]).map((rest) => [x, ...rest]));
}
const ALL_PIPS = permutations([...DICE_PIPS]);

/** 그 전개도에 마주 보는 눈의 합이 모두 7이 되게(right) 또는 한 쌍 이상 어긋나게 놓은 눈 */
function pipsFor(cells, rng, right = true) {
  const pairs = rng.shuffle(oppositeCells(cells));
  const sums = rng.shuffle([['1', '6'], ['2', '5'], ['3', '4']]);
  const labels = new Array(6);
  pairs.forEach(([i, j], k) => {
    const [a, b] = rng.shuffle(sums[k]);
    labels[i] = a;
    labels[j] = b;
  });
  if (!right) {
    // 서로 다른 두 쌍에서 눈 하나씩을 맞바꾼다 → 두 쌍의 합이 7이 아니다
    const [p, q] = [pairs[0][0], pairs[1][0]];
    [labels[p], labels[q]] = [labels[q], labels[p]];
  }
  return labels;
}

test('주사위 주문 단계: 도전 주문서(차시 밖 선택 활동), 시간 재기는 고를 수 있고, 눈 카드는 1~6', () => {
  const stage = STAGES.find((s) => s.id === 'cube-dice');
  assert.deepEqual([stage.kind, stage.challenge, stage.timer, stage.count, stage.order, stage.title, stage.lesson], ['dice', true, 'optional', 2, '주사위 주문', '주사위 주문', 'cube']);
  assert.equal(DICE_GOAL, 2);
  assert.deepEqual([...DICE_PIPS], ['1', '2', '3', '4', '5', '6']);
  assert.equal(pipName('3'), '주사위 눈 3');
  assert.deepEqual([1, 2, 3].map(diceOrdinal), ['첫 번째', '두 번째', '세 번째']);
});

test('주사위 판정: 전개도 11가지 × 눈을 놓는 방법 720가지 = 7,920가지가 독립 계산과 같고, 합이 모두 7인 놓기는 전개도마다 48가지', () => {
  let total = 0;
  let right = 0;
  for (const net of CUBE_NETS) {
    assert.equal(oppositeCells(net.cells).length, 3, net.name);
    let count = 0;
    for (const labels of ALL_PIPS) {
      const want = independentPairs(net.cells, labels);
      const r = judgeDice({ cells: net.cells, labels });
      assert.equal(r.valid, true, net.name);
      assert.deepEqual(r.pairs.map((p) => [Number(p.a), Number(p.b)]), want, `${net.name} ${labels.join('')}`);
      const ok = want.every(([a, b]) => a + b === 7);
      assert.equal(r.correct, ok, `${net.name} ${labels.join('')}`);
      assert.equal(r.kind, ok ? 'made' : 'sum');
      assert.equal(r.tag, ok ? null : TAGS.opposite);
      assert.equal(r.given, want.map(([a, b]) => `${a}-${b}`).join(' '));
      assert.equal(r.expected, DICE_EXPECTED);
      for (const p of r.pairs) assert.deepEqual([p.sum, p.ok], [Number(p.a) + Number(p.b), Number(p.a) + Number(p.b) === 7]);
      if (ok) {
        assert.equal(r.given, DICE_EXPECTED);
        assert.equal(r.message, '마주 보는 두 눈의 합이 모두 7이에요. 1과 6, 2와 5, 3과 4.');
        count += 1;
      } else {
        // 문장은 실제로 마주 보는 눈 가운데 합이 7이 아닌 첫 쌍(작은 눈 순)을 짚는다
        const [a, b] = want.find(([x, y]) => x + y !== 7);
        assert.match(r.message, new RegExp(`^${a}[과와] ${b}[이가] 마주 봐요\\. 마주 보는 두 눈의 합은 7이에요\\.$`), `${net.name} ${labels.join('')}`);
      }
      total += 1;
    }
    // 마주 보는 세 쌍에 (1,6)·(2,5)·(3,4)를 나눠 주는 3! × 쌍마다 앞뒤 2³ = 48가지
    assert.equal(count, 48, net.name);
    right += count;
  }
  assert.deepEqual([total, right], [7920, 528]);
});

test('주사위 판정은 전개도를 돌리거나 뒤집어도, 판 위 어디에 놓아도 같다 (무작위 600개 × 8가지)', () => {
  const rng = createRng('dice-symmetry');
  for (let trial = 0; trial < 600; trial += 1) {
    const net = rng.pick(CUBE_NETS);
    const labels = rng.next() < 0.5 ? pipsFor(net.cells, rng, true) : rng.shuffle([...DICE_PIPS]);
    const base = judgeDice({ cells: net.cells, labels });
    for (let k = 0; k < SYMMETRY_COUNT; k += 1) {
      const [dx, dy] = [rng.int(0, 2), rng.int(0, 2)];
      const cells = transformCells(net.cells, k).map(([x, y]) => [x + dx, y + dy]); // 칸 순서는 그대로라 눈이 칸을 따라간다
      const r = judgeDice({ cells, labels });
      assert.deepEqual([r.correct, r.given, r.name], [base.correct, base.given, net.name], `${net.name} k=${k}`);
      assert.equal(independentPairs(cells, labels).map(([a, b]) => `${a}-${b}`).join(' '), r.given);
      assert.equal(diceLayoutKey(cells, labels), diceLayoutKey(net.cells, labels), `${net.name} k=${k}`); // 같은 놓기는 같은 열쇠
    }
  }
  // 눈의 자리가 다르면 열쇠도 다르다
  const cross = byName('1-4-1e').cells;
  assert.notEqual(diceLayoutKey(cross, ['1', '2', '3', '4', '5', '6']), diceLayoutKey(cross, ['1', '2', '3', '5', '4', '6']));
});

test('기획서의 예: 1-4-1 전개도에 1·6 / 2·5 / 3·4가 마주 보게 놓으면 통과, 눈 하나를 바꾸면 "1과 5가 마주 봐요. 마주 보는 두 눈의 합은 7이에요."', () => {
  // 십자(.#.. / #### / .#..): 위 날개 1 · 아래 날개 6, 가운데 줄 2 3 5 4 (한 줄 네 면에서는 한 칸 건너가 마주 본다)
  const cross = byName('1-4-1e').cells; // [1,0] [0,1] [1,1] [2,1] [3,1] [1,2]
  const good = judgeDice({ cells: cross, labels: ['1', '2', '3', '5', '4', '6'] });
  assert.deepEqual([good.correct, good.kind, good.tag, good.given], [true, 'made', null, '1-6 2-5 3-4']);
  assert.deepEqual(diceCheck(fromCells(cross, { labels: ['1', '2', '3', '5', '4', '6'] })).wrong, []);
  // 아래 날개의 6과 가운데 줄의 5를 맞바꾼다 → 1과 5, 2와 6이 마주 본다
  const bad = judgeDice({ cells: cross, labels: ['1', '2', '3', '6', '4', '5'] });
  assert.deepEqual([bad.correct, bad.kind, bad.tag, bad.given], [false, 'sum', '마주 보는 면', '1-5 2-6 3-4']);
  assert.equal(bad.message, '1과 5가 마주 봐요. 마주 보는 두 눈의 합은 7이에요.');
  assert.equal(bad.title, '합이 7이 아닌 짝이 있어요');
  assert.deepEqual(diceCheck(bad.net).wrong.map((p) => [p.a, p.b, p.sum]), [['1', '5', 6], ['2', '6', 8]]);
  // 짝마다 면 id가 실제 그 눈의 면이다
  for (const p of dicePairs(bad.net)) assert.deepEqual(p.faces.map((id) => bad.net.faces.find((f) => f.id === id).label), [p.a, p.b]);
});

test('정육면체가 안 되는 모양 24가지: 눈을 어떻게 놓아도 틀린 접기이고, 까닭의 tag는 오개념 표의 말 (겹침 16 · 네 면이 한 점에 8)', () => {
  const rng = createRng('dice-invalid');
  for (const n of INVALID_HEXOMINOES) {
    for (let i = 0; i < 6; i += 1) {
      const labels = rng.shuffle([...DICE_PIPS]);
      const r = judgeDice({ cells: n.cells, labels });
      assert.deepEqual([r.valid, r.correct, r.kind, r.pairs, r.name], [false, false, 'invalid', null, n.name]);
      assert.equal(r.tag, n.reason === 'vertex-full' ? TAGS.vertex : TAGS.overlap, n.name);
      assert.equal(r.title, '정육면체가 안 돼요');
      assert.equal(r.given, '정육면체가 안 됨');
      if (n.reason === 'vertex-full') assert.equal(r.message, '네 면이 한 점에 모이면 접을 수 없어요. 정육면체의 한 꼭짓점에는 면이 3개만 모여요.');
      else assert.match(r.message, /^눈 [1-6] 면과 눈 [1-6] 면이 같은 자리에 겹쳐요\. 그래서 다른 한쪽이 비어요\.$/, n.name);
      assert.equal(diceCheck(r.net).ok, false);
    }
  }
});

test('한 판의 흐름: 문항은 "n번째 주사위"(itemId에 모양 이름이 없다), 접은 것은 모두 기록, 서로 다른 모양 2개면 끝', () => {
  const rng = createRng('dice-flow');
  const s = createDiceSession();
  const cross = byName('1-4-1e').cells;
  assert.deepEqual(s.readiness(cross.slice(0, 5), DICE_PIPS.slice(0, 5)), { ready: false, reason: 'count', detached: [] });
  assert.equal(s.readiness([[0, 0], [1, 0], [2, 0], [3, 0], [5, 1], [5, 2]], DICE_PIPS).reason, 'apart');
  // 1) 합이 틀린 놓기 → 틀림(첫 번째 주사위의 첫 접기)
  const wrongPips = pipsFor(cross, rng, false);
  const a = s.fold(cross, wrongPips);
  assert.deepEqual([a.itemId, a.number, a.firstTry, a.correct, a.kind, a.made, a.done, a.wrongRun], ['cube-dice:1', 1, true, false, 'sum', 0, false, 1]);
  // 같은 놓기는(돌리거나 뒤집어도) 다시 접지 못한다 — 이미 본 결과라 기록하지 않는다
  for (let k = 0; k < SYMMETRY_COUNT; k += 1) {
    const again = transformCells(cross, k);
    assert.equal(s.readiness(again, wrongPips).reason, 'tried', `k=${k}`);
    assert.equal(s.fold(again, wrongPips), null);
  }
  // 2) 정육면체가 안 되는 모양 → 틀림, 그 모양은 눈을 바꿔도 다시 접지 못한다
  const b = s.fold(byName('line5-b').cells, DICE_PIPS);
  assert.deepEqual([b.itemId, b.firstTry, b.kind, b.wrongRun], ['cube-dice:1', false, 'invalid', 2]);
  assert.equal(s.readiness(transformCells(byName('line5-b').cells, 3), rng.shuffle([...DICE_PIPS])).reason, 'tried-shape');
  // 3) 고쳐서 맞힘 → 첫 번째 주사위
  const c = s.fold(cross, pipsFor(cross, rng, true));
  assert.deepEqual([c.itemId, c.number, c.firstTry, c.correct, c.made, c.done, c.wrongRun], ['cube-dice:1', 1, false, true, 1, false, 0]);
  // 두 번째는 다른 모양이어야 한다: 같은 모양은(눈을 어떻게 놓든, 돌려도) 접기 전에 막는다
  for (let k = 0; k < SYMMETRY_COUNT; k += 1) {
    const r = s.readiness(transformCells(cross, k), rng.shuffle([...DICE_PIPS]));
    assert.deepEqual([r.ready, r.reason, r.same], [false, 'same', 1], `k=${k}`);
  }
  assert.match(diceFoldNote(s.readiness(cross, DICE_PIPS)), /^첫 번째 주사위와 같은 모양이에요\./);
  // 4) 다른 모양으로 한 번에 맞힘 → 끝
  const other = byName('2-3-1a').cells;
  const d = s.fold(other, pipsFor(other, rng, true));
  assert.deepEqual([d.itemId, d.number, d.firstTry, d.correct, d.made, d.done], ['cube-dice:2', 2, true, true, 2, true]);
  assert.equal(s.done(), true);
  assert.equal(s.readiness(byName('3-3').cells, DICE_PIPS).reason, 'done');
  assert.deepEqual(s.made().map((m) => m.name), ['1-4-1e', '2-3-1a']);
  assert.deepEqual(diceSummary(s.history()), { folds: 4, made: 2, firstTry: 1, fixes: 1, bounces: 1 });
  for (const step of s.history()) assert.match(step.itemId, /^cube-dice:[12]$/);
});

test('접기 전 정답 노출 0: 접어 보기 전의 안내·막힘은 놓은 모양과 이미 접어 본 결과로만 정해진다 — 눈을 어떻게 놓았는지와 무관하다 (35가지 × 720가지)', () => {
  const rng = createRng('dice-leak');
  for (const n of [...CUBE_NETS, ...INVALID_HEXOMINOES]) {
    // 새 판: 어떤 모양이든, 눈을 어떻게 놓든 한 가지 상태(접을 수 있음)
    const fresh = createDiceSession();
    const states = new Set(ALL_PIPS.map((labels) => JSON.stringify([fresh.readiness(n.cells, labels), diceFoldNote(fresh.readiness(n.cells, labels))])));
    assert.equal(states.size, 1, n.name);
    assert.deepEqual(fresh.readiness(n.cells, DICE_PIPS), { ready: true, reason: null, detached: [] });
  }
  // 첫 번째 주사위를 만든 뒤: 정육면체가 되는 다른 모양은 눈을 어떻게 놓든(맞든 틀리든) 같은 상태
  const made = createDiceSession();
  const cross = byName('1-4-1e').cells;
  made.fold(cross, pipsFor(cross, rng, true));
  for (const n of CUBE_NETS.filter((x) => x.name !== '1-4-1e')) {
    const states = new Set(ALL_PIPS.map((labels) => JSON.stringify(made.readiness(n.cells, labels))));
    assert.equal(states.size, 1, n.name);
  }
  // 안내 문장에는 눈의 수·합이 맞는지에 대한 말이 없다 (목표 "합이 7"만)
  for (const reason of ['count', 'apart', 'same', 'tried-shape', 'tried', 'done', null]) {
    const text = diceFoldNote({ reason, same: 1 });
    assert.doesNotMatch(text, /[1-6][과와]|마주 봐요|맞아요|아니에요|틀/, text);
  }
  assert.doesNotMatch(DICE_HINT_TEXT, /[1-6][과와] [1-6]/); // 힌트 글은 방법만 알려 준다(어느 눈끼리인지는 목표의 "합이 7"에서 찾는다)
  // 힌트 그림자는 모양만: 아직 주사위로 만들지 않은 전개도
  assert.equal(diceHintNet(new Set()).name, '1-4-1a');
  assert.equal(diceHintNet(new Set(['1-4-1a'])).name, '1-4-1b');
  assert.equal(diceHintNet(new Set(CUBE_NETS.map((x) => x.name))), null);
});

// ── 점수: 엔진의 지금 규칙 그대로 (처음에 맞힘 +2 · 고쳐서 맞힘 +1 · 다시 일어서기 +1 · 도전 처음 성공 +10 · 별 +2씩) ──────────

/** 무작위로 한 판을 끝까지: 주사위마다 틀린 접기(합이 틀림·정육면체가 안 됨)를 0번 이상 한 뒤 맞힌다 → 접기 목록 [{ cells, labels }] */
function randomFolds(rng, { wrongRate = 0.5, maxWrong = 4 } = {}) {
  const shapes = rng.shuffle([...CUBE_NETS]);
  const invalid = rng.shuffle([...INVALID_HEXOMINOES]);
  const folds = [];
  for (let dice = 0; dice < DICE_GOAL; dice += 1) {
    for (let w = 0; w < maxWrong && rng.next() < wrongRate; w += 1) {
      if (rng.next() < 0.4) folds.push({ cells: invalid.pop().cells, labels: rng.shuffle([...DICE_PIPS]) });
      else folds.push({ cells: transformCells(shapes[dice].cells, rng.int(0, 7)), labels: null, wrongOn: shapes[dice] });
    }
    folds.push({ cells: shapes[dice].cells, labels: pipsFor(shapes[dice].cells, rng, true) });
  }
  return folds.map((f) => (f.wrongOn ? { cells: f.cells, labels: pipsFor(f.cells, rng, false) } : f));
}

/** 엔진 점수 규칙으로 한 판 (화면 play-dice.js와 같은 순서). 같은 놓기를 다시 접으려는 것은 화면처럼 막힌다(기록 없음) */
function dicePlayXp(folds, { startStars = 0, finished = true } = {}) {
  const session = createDiceSession();
  const play = createPlayReward({ startStars });
  const earned = { first: 0, again: 0 };
  let attempts = 0;
  let correct = 0;
  for (const fold of folds) {
    const step = session.fold(fold.cells, fold.labels);
    if (!step) continue; // 접기 전에 막힘: 기록·점수 없음
    const before = play.xp();
    play.answer({ itemId: step.itemId, correct: step.correct });
    const gain = play.xp() - before;
    const firstPart = step.correct && step.firstTry ? Math.min(gain, XP.first) : 0;
    earned.first += firstPart;
    earned.again += gain - firstPart;
    attempts += 1;
    if (step.correct) correct += 1;
    assert.equal(play.instant(), 0); // 표시 없는 답: 판을 마칠 때 저장한다(중간에 나가면 남지 않는다)
  }
  const done = finished && session.done();
  const stars = done ? starsFromAccuracy(correct / attempts) : 0;
  const stage = done ? stageXp({ prevStars: startStars, stars, cleared: true, challenge: true }).total : 0;
  return { xp: done ? play.xp() + stage : 0, play: play.xp(), stage, stars, attempts, correct, earned, session, done };
}

/**
 * 독립 계산 (엔진의 rewards.js를 쓰지 않는다): engine.md 점수 표만 보고 짠 주사위 주문 한 판.
 * tries: 주사위마다 맞히기까지의 틀린 접기 수 [w1, w2]. 문항이 둘뿐이라 연속 보너스(3번마다)는 없다.
 */
function modelDice(tries, { startStars = 0 } = {}) {
  let xp = 0;
  let armed = false;
  for (const wrong of tries) {
    if (wrong === 0) {
      xp += 2; // 처음에 맞힘
      if (armed) {
        armed = false;
        xp += 1; // 다시 일어서기: 앞 주사위를 틀린 뒤 다음 주사위를 한 번에
      }
    } else {
      xp += 1; // 고쳐서 맞힘
      armed = true;
    }
  }
  if (startStars >= 3) xp = 0; // 별 3개를 받은 단계를 다시 하면 연습 점수 없음
  const attempts = tries.reduce((sum, w) => sum + w + 1, 0);
  const accuracy = tries.length / attempts;
  const stars = accuracy >= 0.9 ? 3 : accuracy >= 0.7 ? 2 : 1;
  const stage = (startStars === 0 ? 10 : 0) + Math.max(0, stars - startStars) * 2;
  return { play: xp, stage, xp: xp + stage, stars };
}

test('주사위 주문 점수: 두 개를 모두 한 번에 맞히면 4 + 도전 성공 10 + 별 3개 6 = 20점, 한 번 틀리면 정답률 67%라 별 1개 16점', () => {
  const rng = createRng('dice-score');
  const [x, y] = [byName('1-4-1e').cells, byName('3-3').cells];
  const right = (cells) => ({ cells, labels: pipsFor(cells, rng, true) });
  const wrong = (cells) => ({ cells, labels: pipsFor(cells, rng, false) });
  const perfect = dicePlayXp([right(x), right(y)]);
  assert.deepEqual([perfect.play, perfect.stage, perfect.xp, perfect.stars], [4, 16, 20, 3]);
  assert.deepEqual(perfect.earned, { first: 4, again: 0 });
  // 첫 주사위를 한 번 틀림: 고쳐서 +1, 다음 주사위 한 번에 +2, 다시 일어서기 +1 = 4 (모두 맞힌 것과 같고, 별이 적다)
  const slip = dicePlayXp([wrong(x), right(x), right(y)]);
  assert.deepEqual([slip.play, slip.stars, slip.stage, slip.xp], [4, 1, 12, 16]);
  assert.deepEqual(slip.earned, { first: 2, again: 2 });
  // 둘째 주사위를 틀림: 2 + 1 = 3
  assert.deepEqual([dicePlayXp([right(x), wrong(y), right(y)]).play, dicePlayXp([wrong(x), right(x), wrong(y), right(y)]).play], [3, 2]);
  // 문항 id에 모양을 넣었다면: 틀린 접기와 고친 접기가 다른 문항이 되어 +2 +1(다시 일어서기) = 3 > 한 번에 맞힘 2 — 그래서 넣지 않는다
  const byShape = createPlayReward();
  byShape.answer({ itemId: 'cube-dice:1:1-4-1e', correct: false });
  byShape.answer({ itemId: 'cube-dice:1:3-3', correct: true });
  assert.equal(byShape.xp(), 3);
  const byNumber = createPlayReward();
  byNumber.answer({ itemId: 'cube-dice:1', correct: false });
  byNumber.answer({ itemId: 'cube-dice:1', correct: true });
  assert.equal(byNumber.xp(), 1);
  // 끝까지 하지 않고 나가면 남는 점수가 없다(도감·노트에도 넣지 않는다)
  assert.deepEqual([dicePlayXp([right(x)], { finished: true }).xp, dicePlayXp([right(x), right(y)], { finished: false }).xp], [0, 0]);
});

test('무작위 4,000판: 어떻게 틀려도(일부러 틀려도) 모두 한 번에 맞힌 판보다 점수가 크지 않고, 엔진 점수 = 독립 계산, 칸 점수의 합 = 이번 판 점수', () => {
  const rng = createRng('dice-random');
  let lower = 0;
  let blocked = 0;
  for (let trial = 0; trial < 4000; trial += 1) {
    const startStars = rng.int(0, 3);
    const folds = randomFolds(rng, { wrongRate: rng.pick([0, 0.3, 0.6, 0.9]) });
    // 가끔 방금 접은 틀린 놓기를 그대로(돌려서) 한 번 더 접으려 한다 → 접기 전에 막혀 기록·점수가 없다
    const noisy = folds.flatMap((f) => (rng.next() < 0.15 ? [f, { cells: transformCells(f.cells, rng.int(0, 7)), labels: f.labels }] : [f]));
    const got = dicePlayXp(noisy, { startStars });
    assert.equal(got.done, true, `판 ${trial}`);
    const tries = [1, 2].map((n) => got.session.history().filter((s) => s.number === n && !s.correct).length);
    const want = modelDice(tries, { startStars });
    assert.deepEqual([got.play, got.stage, got.xp, got.stars], [want.play, want.stage, want.xp, want.stars], `판 ${trial}: 틀린 접기 ${tries}`);
    assert.equal(got.attempts, tries[0] + tries[1] + 2);
    if (got.attempts < noisy.length) blocked += 1;
    // 같은 시작 별에서 모두 한 번에 맞힌 판
    const best = modelDice([0, 0], { startStars });
    assert.ok(got.xp <= best.xp, `판 ${trial}: ${got.xp} > ${best.xp}`);
    assert.ok(got.play <= 2 * XP.first);
    if (got.xp < best.xp) lower += 1;
    // 결과 "오늘의 솜씨": 칸 점수의 합 = 이번 판 점수
    const sum = diceSummary(got.session.history());
    const tiles = diceHighlights(sum, { earned: got.earned });
    assert.deepEqual(tiles.map((t) => t.label), ['만든 주사위', '한 번에 맞힘', '다시 일어서기']);
    assert.equal(tiles.reduce((total, t) => total + (t.xp ?? 0), 0), got.play, `판 ${trial}`);
    assert.deepEqual([sum.made, sum.firstTry + sum.fixes, sum.folds], [2, 2, got.attempts]);
    if (startStars < 3) assert.equal(got.play, sum.firstTry * XP.first + (sum.fixes + sum.bounces) * 1, `판 ${trial}`);
  }
  assert.ok(lower > 1500, '틀린 접기가 섞이면 대개 점수가 낮다');
  assert.ok(blocked > 200);
});

test('되풀이: 별 3개를 받은 뒤에는 몇 번을 다시 해도 0점. 별 3개 전에 다시 하면 엔진 공통 규칙대로 연습 점수(판마다 4점까지)를 받는다', () => {
  const rng = createRng('dice-replay');
  const device = () => {
    let stars = 0;
    let total = 0;
    return {
      play(folds) {
        const r = dicePlayXp(folds, { startStars: stars });
        stars = Math.max(stars, r.stars);
        total += r.xp;
        return r;
      },
      total: () => total,
      stars: () => stars,
    };
  };
  const perfectFolds = () => randomFolds(rng, { wrongRate: 0 });
  const slipFolds = () => {
    const folds = perfectFolds();
    return [{ cells: folds[0].cells, labels: pipsFor(folds[0].cells, rng, false) }, ...folds];
  };
  // 처음부터 모두 맞힘: 20점, 그 뒤로는 0점
  const honest = device();
  assert.equal(honest.play(perfectFolds()).xp, 20);
  for (let i = 0; i < 5; i += 1) assert.equal(honest.play(rng.next() < 0.5 ? perfectFolds() : slipFolds()).xp, 0);
  assert.equal(honest.total(), 20);
  // 한 번 틀린 뒤(16점, 별 1개) 다시 해서 모두 맞힘: 연습 4 + 별 2개 4 = 8 → 그 뒤 0점
  const second = device();
  assert.deepEqual([second.play(slipFolds()).xp, second.play(perfectFolds()).xp, second.play(perfectFolds()).xp], [16, 8, 0]);
  // 별 3개가 되기 전에는 다시 할 때마다 연습 점수를 받는다(엔진 공통: 별 3개가 안 된 단계의 복습은 보상한다 — 일반 단계와 같다).
  // 주사위 주문은 문항이 둘뿐이라 판마다 4점까지다
  const repeater = device();
  repeater.play(slipFolds());
  for (let i = 0; i < 6; i += 1) {
    const r = repeater.play(slipFolds());
    assert.deepEqual([r.xp, r.stars], [4, 1]);
  }
  assert.equal(repeater.stars(), 1);
  // 무작위 300기기: 별 3개가 된 다음 판부터는 늘 0점, 그 전의 판은 단계 점수(도전 성공 10 + 별 6)를 빼면 판마다 4점 이하
  for (let trial = 0; trial < 300; trial += 1) {
    const d = device();
    let stage = 0;
    for (let p = 0; p < rng.int(2, 8); p += 1) {
      const before = d.stars();
      const r = d.play(randomFolds(rng, { wrongRate: rng.pick([0, 0.2, 0.7]) }));
      stage += r.stage;
      if (before >= 3) assert.equal(r.xp, 0, `기기 ${trial}`);
      assert.ok(r.play <= 4 && r.xp - r.stage <= 4, `기기 ${trial}`);
    }
    assert.ok(stage <= XP.challenge + 3 * XP.perStar);
  }
});
