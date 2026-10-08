import assert from 'node:assert/strict';
import { test } from 'node:test';
import { starsFromAccuracy } from '../../src/shared/core/progress.js';
import { createRng } from '../../src/shared/core/random.js';
import { createPlayReward, stageXp } from '../../src/shared/core/rewards.js';
import { SYMMETRY_COUNT, LABELS, checkNet, fromCells, isConnected, polyominoes, transformCells } from '../../src/games/net-workshop/fold.js';
import {
  BOARD_SIZES,
  FREE_GOAL,
  NET_BY_KEY,
  NOTE_ITEMS,
  REASONS,
  STAGES,
  TAGS,
  boardReadiness,
  cellGroups,
  centerOnBoard,
  createFreeSession,
  dexItemName,
  freeSummary,
  hintNet,
  judgeFree,
  judgeReason,
  makeQuestions,
  netName,
  noteItemName,
  primaryProblem,
  reasonOf,
} from '../../src/games/net-workshop/logic.js';
import { CUBE_NETS, INVALID_HEXOMINOES } from '../../src/games/net-workshop/nets-data.js';

const L6 = LABELS.slice(0, 6);
const byName = (name) => [...CUBE_NETS, ...INVALID_HEXOMINOES].find((n) => n.name === name);
const shift = (cells, dx, dy) => cells.map(([x, y]) => [x + dx, y + dy]);

test('모양 이름: 전개도 11개 · 무효 24개 = 헥소미노 35개, 돌리기·뒤집기 8가지 모두 같은 이름이고 35개 이름이 모두 다르다', () => {
  assert.equal(NET_BY_KEY.size, 35);
  const names = new Set([...NET_BY_KEY.values()].map((v) => v.name));
  assert.equal(names.size, 35);
  for (const n of [...CUBE_NETS, ...INVALID_HEXOMINOES]) {
    for (let k = 0; k < SYMMETRY_COUNT; k += 1) {
      const moved = shift(transformCells(n.cells, k), 2, 1); // 판 위 어디에 놓아도
      assert.equal(netName(moved), n.name, `${n.name} k=${k}`);
    }
  }
  // 헥소미노 나열과 이름 표가 빠짐없이 같다
  for (const cells of polyominoes(6)) assert.ok(netName(cells), JSON.stringify(cells));
  // 유효 표시는 checkNet과 같다
  for (const v of NET_BY_KEY.values()) assert.equal(checkNet(fromCells(byName(v.name).cells)).ok, v.valid, v.name);
  assert.equal(netName([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]), null); // 5칸은 이름 없음
});

test('도감 칸 이름과 노트 순서: 전개도 11칸은 줄 모양별 번호, 노트 24칸은 겹침 16 · 네 면 8', () => {
  assert.deepEqual(CUBE_NETS.map(dexItemName), [
    '1-4-1 꼴 1', '1-4-1 꼴 2', '1-4-1 꼴 3', '1-4-1 꼴 4', '1-4-1 꼴 5', '1-4-1 꼴 6',
    '2-3-1 꼴 1', '2-3-1 꼴 2', '2-3-1 꼴 3', '2-2-2 꼴', '3-3 꼴',
  ]);
  assert.equal(NOTE_ITEMS.length, 24);
  assert.equal(NOTE_ITEMS.filter((n) => n.reason === 'overlap').length, 16);
  assert.equal(NOTE_ITEMS.filter((n) => n.reason === 'vertex-full').length, 8);
  assert.equal(new Set(NOTE_ITEMS.map(noteItemName)).size, 24);
  assert.equal(noteItemName(NOTE_ITEMS[0]), '겹치는 모양 1');
  assert.equal(noteItemName(NOTE_ITEMS[16]), '네 면이 모이는 모양 1');
});

test('isConnected: 떨어진 칸, 꼭짓점(대각선)만 닿은 칸은 이어지지 않았다', () => {
  assert.equal(isConnected(fromCells(byName('1-4-1e').cells)), true);
  assert.equal(isConnected(fromCells([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [6, 0]])), false); // 떨어진 칸
  assert.equal(isConnected(fromCells([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 1]])), false); // 대각선만
  assert.equal(isConnected(fromCells([[0, 0], [1, 1]])), false);
  assert.equal(isConnected(fromCells([])), false);
  // checkNet의 disconnected와 같은 계산
  for (const cells of [[[0, 0], [1, 1], [2, 2], [3, 3], [4, 4], [5, 5]], [[0, 0], [1, 0], [3, 0], [4, 0], [5, 0], [6, 0]]]) {
    const net = fromCells(cells);
    assert.equal(isConnected(net), !checkNet(net).problems.some((p) => p.type === 'disconnected'));
  }
});

test('놓은 면 상태: 6장이 아니면 count, 떨어진 면이 있으면 apart(떨어진 칸 번호), 아니면 접을 수 있음', () => {
  assert.deepEqual(boardReadiness([[0, 0], [1, 0]]), { ready: false, reason: 'count', detached: [] });
  assert.deepEqual(boardReadiness([[0, 0], [1, 0], [2, 0], [3, 0], [5, 1], [5, 2]]), { ready: false, reason: 'apart', detached: [4, 5] });
  assert.deepEqual(boardReadiness([[0, 0], [1, 1], [1, 2], [1, 3], [2, 2], [3, 2]]).detached, [0]); // 대각선만 닿은 칸
  assert.deepEqual(boardReadiness(byName('3-3').cells), { ready: true, reason: null, detached: [] });
  assert.deepEqual(cellGroups([[0, 0], [5, 5], [1, 0]]), [[0, 2], [1]]);
});

test('judgeFree: 예상·실제 4가지 조합의 correct·tag (전개도를 "안 될 거예요" → 여러 가지 전개도, 겹침 → 면이 겹침, 2×2 → 한 꼭짓점에 세 면)', () => {
  const valid = shift(byName('2-3-1b').cells, 1, 1);
  const line = byName('line5-d').cells;
  const block = byName('block-a').cells;
  const yesValid = judgeFree({ cells: valid, labels: L6, prediction: 'yes' });
  assert.deepEqual([yesValid.correct, yesValid.tag, yesValid.kind, yesValid.expected, yesValid.name], [true, null, 'new', 'yes', '2-3-1b']);
  assert.match(yesValid.message, /^예측 적중! 처음 찾은 전개도예요\. 2-3-1 모양도 정육면체의 전개도예요\.$/);
  const noValid = judgeFree({ cells: valid, labels: L6, prediction: 'no' });
  assert.deepEqual([noValid.correct, noValid.tag], [false, TAGS.variety]);
  assert.match(noValid.message, /^예상과 달랐어요\./);
  const yesLine = judgeFree({ cells: line, labels: L6, prediction: 'yes' });
  assert.deepEqual([yesLine.correct, yesLine.tag, yesLine.kind, yesLine.expected], [false, TAGS.overlap, 'invalid', 'no']);
  assert.match(yesLine.message, /[가-바] 면과 [가-바] 면이 같은 자리에 겹쳐요/);
  const noLine = judgeFree({ cells: line, labels: L6, prediction: 'no' });
  assert.deepEqual([noLine.correct, noLine.tag], [true, null]);
  assert.equal(judgeFree({ cells: block, labels: L6, prediction: 'yes' }).tag, TAGS.vertex);
  assert.equal(judgeFree({ cells: block, labels: L6, prediction: 'no' }).tag, null);
  // 도감에 이미 있으면 known: "도감 n번과 같은 모양"
  const known = judgeFree({ cells: valid, labels: L6, prediction: 'yes', dex: new Set(['2-3-1b']) });
  assert.equal(known.kind, 'known');
  assert.match(known.message, /도감 8번과 같은 모양이에요\. 돌리거나 뒤집으면 똑같아요\./);
  // 판정은 판별 단계와 같은 checkNet
  for (const n of [...CUBE_NETS, ...INVALID_HEXOMINOES]) {
    const r = judgeFree({ cells: n.cells, labels: L6, prediction: 'yes' });
    assert.equal(r.valid, checkNet(fromCells(n.cells, { labels: L6 })).ok, n.name);
    assert.equal(r.name, n.name);
  }
});

test('같은 판에서 같은 모양(돌리거나 뒤집어도)을 다시 접으면 기록하지 않는다(log: false, itemId 없음)', () => {
  const s = createFreeSession();
  const cross = byName('1-4-1e').cells;
  const first = s.fold(shift(cross, 1, 1), L6, 'yes');
  assert.equal(first.log, true);
  assert.equal(first.itemId, 'cube-free:1:1-4-1e');
  for (let k = 1; k < SYMMETRY_COUNT; k += 1) {
    const again = s.fold(transformCells(cross, k), L6, k % 2 ? 'no' : 'yes');
    assert.deepEqual([again.log, again.itemId, again.kind, again.collect], [false, null, 'repeat', null], `k=${k}`);
    assert.match(again.message, /이미 접어 본 모양/);
  }
  const next = s.fold(byName('line5-a').cells.map(([x, y]) => [x, y + 2]), L6, 'no');
  assert.equal(next.itemId, 'cube-free:2:line5-a'); // 순번은 기록한 것만 센다
  assert.equal(freeSummary(s.history()).predictions, 2);
});

test('목표: 서로 다른 전개도 3가지 (도감에 이미 있던 것도 센다), 안 되는 모양은 노트에', () => {
  const s = createFreeSession({ dex: ['1-4-1e', '3-3'] });
  const r1 = s.fold(byName('1-4-1e').cells, L6, 'yes');
  assert.deepEqual([r1.kind, r1.collect, r1.found, r1.done], ['known', null, 1, false]);
  const r2 = s.fold(byName('same-side-a').cells, L6, 'no');
  assert.deepEqual([r2.kind, r2.collect, r2.found, r2.explainable], ['invalid', { id: 'cube-non-nets', item: 'same-side-a', isNew: true }, 1, true]);
  const r3 = s.fold(byName('3-3').cells, L6, 'yes');
  assert.deepEqual([r3.kind, r3.found, r3.fixed], ['known', 2, true]); // 안 된 뒤 바로 전개도: 고쳐서 다시 도전
  const r4 = s.fold(byName('2-2-2').cells, L6, 'no');
  assert.deepEqual([r4.kind, r4.collect, r4.found, r4.done, r4.correct], ['new', { id: 'cube-nets', item: '2-2-2', isNew: true }, 3, true, false]);
  assert.equal(FREE_GOAL, 3);
  assert.deepEqual(freeSummary(s.history()), { predictions: 4, hits: 3, newNets: 1, newNotes: 1, fixes: 1 });
  // 예상이 틀린 안 되는 모양에는 까닭 고르기가 없다
  assert.equal(s.fold(byName('line5-b').cells, L6, 'yes').explainable, false);
});

test('힌트 그림자: 늘 이번 판에서 아직 못 찾은 유효 전개도이고, 판(7×5, 6×6) 가운데에 들어간다', () => {
  const rng = createRng('hint');
  for (let trial = 0; trial < 300; trial += 1) {
    const found = new Set(rng.sample(CUBE_NETS.map((n) => n.name), rng.int(0, 10)));
    const dex = new Set(rng.sample(CUBE_NETS.map((n) => n.name), rng.int(0, 11)));
    const net = hintNet(found, dex);
    assert.ok(net, `trial ${trial}`);
    assert.ok(!found.has(net.name), net.name);
    assert.equal(checkNet(fromCells(net.cells)).ok, true);
    if ([...dex].length < 11 && CUBE_NETS.some((n) => !found.has(n.name) && !dex.has(n.name))) assert.ok(!dex.has(net.name));
    for (const size of Object.values(BOARD_SIZES)) {
      const placed = centerOnBoard(net.cells, size);
      assert.ok(placed, `${net.name} ${size.cols}×${size.rows}`);
      assert.ok(placed.every(([x, y]) => x >= 0 && y >= 0 && x < size.cols && y < size.rows));
      assert.equal(netName(placed), net.name);
    }
  }
  assert.equal(hintNet(new Set(CUBE_NETS.map((n) => n.name))), null);
  // 모든 헥소미노가 두 판에 들어간다 (한 줄 6칸은 휴대폰 6×6에서만)
  for (const n of [...CUBE_NETS, ...INVALID_HEXOMINOES]) {
    assert.ok(centerOnBoard(n.cells, BOARD_SIZES.phone), n.name);
    if (n.name !== 'line5-a') assert.ok(centerOnBoard(n.cells, BOARD_SIZES.wide), n.name);
  }
});

test('까닭 고르기: 정답 칩은 primaryProblem의 까닭 (겹침 · 네 면이 한 점 · 면 개수)', () => {
  assert.deepEqual(REASONS.map((r) => r.text), ['면이 겹쳐요', '네 면이 한 점에 모여요', '면이 6개가 아니에요']);
  const want = { overlap: 'overlap', gap: 'overlap', 'vertex-full': 'vertex', 'face-count': 'count' };
  for (const n of INVALID_HEXOMINOES) {
    const { problems } = checkNet(fromCells(n.cells));
    assert.equal(reasonOf(problems), want[primaryProblem(problems).type], n.name);
    assert.equal(reasonOf(problems), n.reason === 'vertex-full' ? 'vertex' : 'overlap', n.name);
  }
  // 판별 문항의 무효 3가지 (시드 여러 개)
  for (let seed = 0; seed < 30; seed += 1) {
    for (const q of makeQuestions(STAGES[0], createRng(seed)).filter((x) => !x.valid)) {
      const answer = { overlap: 'overlap', 'vertex-full': 'vertex', 'face-count': 'count' }[q.intended];
      assert.equal(reasonOf(q.problems), answer, q.itemId);
      assert.deepEqual(judgeReason(q.problems, answer), { correct: true, answer, answerText: REASONS.find((r) => r.id === answer).text });
      for (const other of REASONS.filter((r) => r.id !== answer)) assert.equal(judgeReason(q.problems, other.id).correct, false);
    }
  }
});

// ── 점수: 학습 행동에만 (자유 배치) ─────────────────

/** 자유 배치 한 판을 엔진 점수 규칙(createPlayReward)으로 계산: 예상 기록 + 새로 찾음 + 까닭 설명 + 단계 완료·별 */
function freePlayXp(folds, { dex = [], note = [], explain = 'right' } = {}) {
  const session = createFreeSession({ dex, note });
  const play = createPlayReward();
  for (const { cells, prediction } of folds) {
    const step = session.fold(cells, L6, prediction);
    if (step.log) play.answer({ itemId: step.itemId, correct: step.correct });
    if (step.collect?.isNew) play.discovered();
    if (step.explainable && explain !== 'skip') {
      play.event('explain', { correct: explain === 'right', itemId: step.itemId });
    }
  }
  const t = play.summary().answers;
  const stars = starsFromAccuracy(t.attempts ? t.correct / t.attempts : null);
  return { xp: play.xp() + stageXp({ prevStars: 0, stars, cleared: true }).total, entries: t.attempts, session };
}

/** 헥소미노 하나를 판 위 아무 데나 아무 방향으로 */
function randomFold(rng, pool) {
  const n = rng.pick(pool);
  const cells = transformCells(n.cells, rng.int(0, SYMMETRY_COUNT - 1));
  return { cells: shift(cells, rng.int(0, 1), rng.int(0, 2)), valid: CUBE_NETS.includes(n) };
}

test('자유 배치 무작위 2,000판: 일부러 틀리거나 같은 모양을 반복해도, 같은 모양들을 모두 바르게 예상한 것보다 점수가 크지 않다', () => {
  const rng = createRng('free-no-gain');
  const pool = [...CUBE_NETS, ...INVALID_HEXOMINOES];
  let lower = 0;
  for (let trial = 0; trial < 2000; trial += 1) {
    const folds = Array.from({ length: rng.int(3, 14) }, () => randomFold(rng, pool));
    const dex = rng.sample(CUBE_NETS.map((n) => n.name), rng.int(0, 5));
    const note = rng.sample(INVALID_HEXOMINOES.map((n) => n.name), rng.int(0, 5));
    const honest = folds.map((f) => ({ ...f, prediction: f.valid ? 'yes' : 'no' }));
    const tricky = folds.map((f) => ({ ...f, prediction: rng.next() < 0.5 ? 'yes' : 'no' }));
    const best = freePlayXp(honest, { dex, note }).xp;
    const got = freePlayXp(tricky, { dex, note, explain: rng.pick(['right', 'wrong', 'skip']) }).xp;
    assert.ok(got <= best, `판 ${trial}: ${got} > ${best}`);
    if (got < best) lower += 1;
  }
  assert.ok(lower > 1000, '틀린 예상이 섞이면 대개 점수가 낮다');
});

test('자유 배치: 같은 모양을 돌리거나 뒤집어 다시 놓아도 점수·기록이 늘지 않는다', () => {
  const rng = createRng('free-repeat');
  for (const n of [...CUBE_NETS, ...INVALID_HEXOMINOES]) {
    const prediction = CUBE_NETS.includes(n) ? 'yes' : 'no';
    const once = freePlayXp([{ cells: n.cells, prediction }]);
    const many = freePlayXp(Array.from({ length: 8 }, (_, k) => ({ cells: shift(transformCells(n.cells, k), rng.int(0, 1), rng.int(0, 2)), prediction })));
    assert.equal(many.xp, once.xp, n.name);
    assert.equal(many.entries, 1, n.name);
  }
});

test('자유 배치: 일부러 틀리는 전략(하나 걸러 틀리기, 모두 틀리기, 틀린 뒤 바로 맞히기)은 모두 바르게 예상한 것보다 작다', () => {
  const folds = ['1-4-1e', 'line5-a', '2-3-1a', 'block-b', '3-3', 'same-side-b'].map((name) => ({ cells: byName(name).cells, valid: CUBE_NETS.includes(byName(name)) }));
  const right = (f) => (f.valid ? 'yes' : 'no');
  const wrong = (f) => (f.valid ? 'no' : 'yes');
  const best = freePlayXp(folds.map((f) => ({ ...f, prediction: right(f) }))).xp;
  for (const pick of [(f, i) => (i % 2 ? wrong(f) : right(f)), (f) => wrong(f), (f, i) => (i === 0 ? wrong(f) : right(f))]) {
    assert.ok(freePlayXp(folds.map((f, i) => ({ ...f, prediction: pick(f, i) }))).xp < best);
  }
  // 정육면체 차시 전체(판별 5 · 마주 보는 면 4 · 면 붙이기 3 · 자유 배치)를 모두 맞히면 칭호가 한 번 오른다 (견습생 → 솜씨꾼, 40점↑)
  const perfect = (n) => {
    const play = createPlayReward();
    for (let i = 0; i < n; i += 1) play.answer({ itemId: i, correct: true });
    return play.xp() + stageXp({ prevStars: 0, stars: 3 }).total;
  };
  const lesson = perfect(5) + perfect(4) + perfect(3) + freePlayXp(folds.slice(0, 5).map((f) => ({ ...f, prediction: right(f) }))).xp;
  assert.ok(lesson >= 40 && lesson < 180, `${lesson}점`);
});
