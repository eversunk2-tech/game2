import assert from 'node:assert/strict';
import { test } from 'node:test';
import { starsFromAccuracy } from '../../src/shared/core/progress.js';
import { createRng } from '../../src/shared/core/random.js';
import { XP, createPlayReward, stageXp } from '../../src/shared/core/rewards.js';
import { SYMMETRY_COUNT, LABELS, checkNet, fromCells, isConnected, polyominoes, transformCells } from '../../src/games/net-workshop/fold.js';
import {
  BOARD_SIZES,
  FREE_GOAL,
  FREE_NOTE_BEFORE_PICK,
  FREE_REPLAY_NOTE,
  FREE_TILE_MAX,
  NET_BY_KEY,
  NOTE_ITEMS,
  NOTE_XP,
  REASONS,
  STAGES,
  TAGS,
  boardReadiness,
  cellGroups,
  centerOnBoard,
  createFreeSession,
  dexItemName,
  explainProblem,
  freeFeedback,
  freeHighlights,
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

// ── 점수: 학습 행동에만, 모양마다 한 번만 (자유 배치, spec 16-8·16-9) ─────────────────

/** 도감·노트에 처음 등록할 때의 점수 (main.js의 collections: 전개도 도감은 엔진 기본 +5, 노트는 NOTE_XP) */
const collectXp = (id) => (id === 'cube-non-nets' ? NOTE_XP : XP.discover);

/**
 * 자유 배치 한 판을 엔진 점수 규칙(createPlayReward + stageXp)으로 계산한다. 화면(play-free.js)과 같은 순서:
 * 도감·노트 등록 → 예상 기록(처음 접는 모양은 scored: 'once', 이미 접어 본 모양은 scored: false) → 까닭 설명.
 *   dex·note: 이 기기에 저장된 도감·노트, startStars: 판을 시작할 때 이 단계의 별,
 *   explain: 까닭 고르기 'right' | 'wrong' | 'skip' (접기마다 fold.explain으로 따로 줄 수도 있다),
 *   finished: false면 중간에 나간 판(← 단계 선택·새로 고침). 그 자리에서 저장된 몫(play.instant(): 등록 + 처음 접는 모양의
 *     예측·설명 점수)은 남고, 단계 완료·별 점수는 없다 (spec 16-9, N1c-3)
 * → { xp(이 판으로 저장되는 점수), play(단계 완료·별 점수를 뺀 이번 판 점수), stage, stars, entries, earned(갈래별), explainCount, session }
 */
function freePlayXp(folds, { dex = [], note = [], explain = 'right', startStars = 0, finished = true } = {}) {
  const session = createFreeSession({ dex, note });
  const play = createPlayReward({ startStars });
  const earned = { answer: 0, nets: 0, notes: 0, explain: 0 };
  let explainCount = 0;
  for (const fold of folds) {
    const step = session.fold(fold.cells, L6, fold.prediction);
    let before = play.xp();
    if (step.collect?.isNew) play.discovered(collectXp(step.collect.id));
    earned[step.valid ? 'nets' : 'notes'] += play.xp() - before;
    before = play.xp();
    if (step.log) play.answer({ itemId: step.itemId, correct: step.correct, scored: step.first ? 'once' : false });
    earned.answer += play.xp() - before;
    const pick = fold.explain ?? explain;
    if (step.explainable && pick !== 'skip') {
      earned.explain += play.event('explain', { correct: pick === 'right', itemId: step.itemId });
      if (pick === 'right') explainCount += 1;
    }
    // 자유 배치의 점수는 모두 그 자리에서 저장되는 몫이다(처음 접는 모양의 답·설명 + 등록). 판을 마칠 때 더 저장할 답 점수가 없다
    assert.equal(play.instant(), play.xp());
  }
  const t = play.summary().answers;
  const stars = starsFromAccuracy(t.attempts ? t.correct / t.attempts : null);
  const stage = finished ? stageXp({ prevStars: startStars, stars, cleared: true }).total : 0;
  const saved = finished ? play.xp() : play.instant();
  return { xp: saved + stage, play: play.xp(), stage, stars, finished, entries: t.attempts, earned, explainCount, session };
}

/** 한 기기에서 여러 판: 도감·노트·별이 판을 넘어 이어진다 (엔진의 저장과 같게) */
function createDevice() {
  let dex = [];
  let note = [];
  let stars = 0;
  let total = 0;
  let shapeXp = 0;
  return {
    play(folds, options = {}) {
      const r = freePlayXp(folds, { dex, note, startStars: stars, ...options });
      dex = [...r.session.dex()];
      note = [...r.session.note()];
      if (r.finished) stars = Math.max(stars, r.stars);
      total += r.xp;
      shapeXp += r.xp - r.stage;
      return r;
    },
    total: () => total,
    /** 모양으로 받은 점수(예측·연속·다시 일어서기·까닭 설명·등록)만: 단계 완료·별 점수를 뺀 것 */
    shapeXp: () => shapeXp,
    stars: () => stars,
    shapes: () => [...dex, ...note],
  };
}

const ALL_SHAPES = [...CUBE_NETS, ...INVALID_HEXOMINOES];
const isNet = (n) => CUBE_NETS.includes(n);
const rightOf = (n) => (isNet(n) ? 'yes' : 'no');
const wrongOf = (n) => (isNet(n) ? 'no' : 'yes');
const honest = (list) => list.map((n) => ({ cells: n.cells, prediction: rightOf(n) }));

/**
 * 모양들을 한 판에 모두 바르게 예상하고(안 되는 모양은 까닭도 맞힘) 처음 마쳤을 때의 점수 = 그 모양들로 받을 수 있는 가장 큰 점수.
 * 모양 하나: 전개도 예측 2 + 발견 5 = 7, 안 되는 모양 예측 2 + 노트 1 + 까닭 설명 2 = 5. 연속 3번마다 +1. 단계 완료 5 + 별 3개 6.
 */
function bestXp(names) {
  const list = [...new Set(names)].map(byName);
  const nets = list.filter(isNet).length;
  const invalid = list.length - nets;
  return nets * (XP.first + XP.discover) + invalid * (XP.first + NOTE_XP + XP.explain)
    + Math.floor(list.length / XP.streakEvery) * XP.streakBonus + (list.length > 0 ? XP.stageClear + 3 * XP.perStar : 0);
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
    const startStars = rng.int(0, 3);
    const allRight = folds.map((f) => ({ ...f, prediction: f.valid ? 'yes' : 'no' }));
    const tricky = folds.map((f) => ({ ...f, prediction: rng.next() < 0.5 ? 'yes' : 'no' }));
    const best = freePlayXp(allRight, { dex, note, startStars }).xp;
    const got = freePlayXp(tricky, { dex, note, startStars, explain: rng.pick(['right', 'wrong', 'skip']) }).xp;
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

// ── 모양마다 한 번만 (spec 16-8, N1-2) ─────────────────

test('모양마다 한 번만: 같은 모양(돌리거나 뒤집어도)을 다른 판에서 다시 접으면 예측·등록·까닭 설명 점수가 모두 0점', () => {
  const rng = createRng('free-once');
  for (const n of ALL_SHAPES) {
    const device = createDevice();
    const first = device.play(honest([n]));
    // 처음 접을 때: 전개도 = 예측 2 + 발견 5, 안 되는 모양 = 예측 2 + 노트 1 + 까닭 설명 2
    assert.equal(first.play, isNet(n) ? 7 : 5, n.name);
    assert.deepEqual(first.earned, isNet(n) ? { answer: 2, nets: 5, notes: 0, explain: 0 } : { answer: 2, nets: 0, notes: 1, explain: 2 }, n.name);
    for (let k = 0; k < SYMMETRY_COUNT; k += 1) {
      const cells = shift(transformCells(n.cells, k), rng.int(0, 1), rng.int(0, 1));
      const step = createFreeSession({ dex: device.shapes(), note: device.shapes() }).fold(cells, L6, rightOf(n));
      assert.deepEqual([step.first, step.log, step.name], [false, true, n.name], `${n.name} k=${k}`); // 기록·별에는 넣는다
      const again = device.play([{ cells, prediction: rightOf(n) }]);
      assert.equal(again.play, 0, `${n.name} k=${k}`);
      assert.equal(again.xp, 0, `${n.name} k=${k}`); // 별도 그대로(3개)라 단계 점수도 없다
      assert.equal(again.entries, 1);
    }
  }
});

test('처음 접을 때 예상을 틀린 모양은 나중에 맞혀도 점수가 없다. 판 중간에 나가도 처음 접은 모양의 점수는 남고(N1c-3), 같은 모양으로 두 번 받지 못한다', () => {
  for (const n of ALL_SHAPES) {
    const full = createDevice().play(honest([n])).xp; // 나가지 않고 끝까지: 전개도 7 + 11, 안 되는 모양 5 + 11
    assert.equal(full, (isNet(n) ? 7 : 5) + 11, n.name);
    // 처음에 틀림: 등록 점수만(전개도 +5, 노트 +1) → 다른 판에서 맞혀도 예측·설명 0
    const device = createDevice();
    const first = device.play([{ cells: n.cells, prediction: wrongOf(n) }]);
    assert.equal(first.play, isNet(n) ? XP.discover : NOTE_XP, n.name);
    assert.equal(device.play(honest([n])).play, 0, n.name);
    // 처음에 틀리고 판 중간에 나감: 틀린 예상은 지워지지 않는다(모양은 접는 순간 "접어 본 모양") → 다시 와서 맞혀도 0
    const eraser = createDevice();
    assert.equal(eraser.play([{ cells: n.cells, prediction: wrongOf(n) }], { finished: false }).xp, isNet(n) ? XP.discover : NOTE_XP, n.name);
    assert.equal(eraser.play(honest([n])).play, 0, n.name);
    assert.ok(eraser.total() < full, n.name);
    // 맞히고 판 중간에 나감(← 단계 선택·새로 고침): 예측·설명·등록 점수가 그 자리에서 저장돼 남는다 (전에는 등록 점수만 남았다)
    const quitter = createDevice();
    assert.equal(quitter.play(honest([n]), { finished: false }).xp, isNet(n) ? XP.first + XP.discover : XP.first + NOTE_XP + XP.explain, n.name);
    // … 다시 와서 같은 모양을 접어도 0점. 나갔다 온 쪽이 끝까지 한 쪽보다 더 받지도, 덜 받지도 않는다
    assert.equal(quitter.play(honest([n])).play, 0, n.name);
    assert.equal(quitter.total(), full, n.name);
    // 나가기를 몇 번 되풀이해도 그대로
    const looper = createDevice();
    for (let i = 0; i < 4; i += 1) looper.play(honest([n]), { finished: false });
    assert.equal(looper.total(), full - 11, n.name);
    assert.equal(looper.play(honest([n])).xp, 11, n.name); // 마치면 단계 완료·별 점수만
    assert.equal(looper.total(), full, n.name);
  }
  // 남는 한계: 안 되는 모양을 맞힌 뒤 까닭을 고르기 전에 나가면, 그 모양의 까닭 설명 +2는 다시 받을 수 없다(모양은 이미 접어 본 모양)
  for (const n of INVALID_HEXOMINOES) {
    const device = createDevice();
    assert.equal(device.play([{ cells: n.cells, prediction: 'no' }], { finished: false, explain: 'skip' }).xp, XP.first + NOTE_XP, n.name);
    const back = device.play(honest([n]));
    assert.deepEqual(back.earned, { answer: 0, nets: 0, notes: 0, explain: 0 }, n.name);
    assert.equal(device.total(), XP.first + NOTE_XP + 11, n.name);
  }
});

test('35가지를 모두 탐구하면 한 번씩만 보상: 한 판에 모두 맞히면 219점, 다시 하면 0점, 모두 틀리면 등록 점수 79점뿐', () => {
  assert.equal(NOTE_XP, 1);
  assert.equal(XP.discover, 5);
  // 모두 맞힘: 전개도 11 × (2 + 5) + 안 되는 모양 24 × (2 + 1 + 2) + 연속 11번(35 ÷ 3) + 단계 완료 5 + 별 3개 6
  const device = createDevice();
  const all = device.play(honest(ALL_SHAPES));
  assert.deepEqual(all.earned, { answer: 35 * 2 + 11, nets: 55, notes: 24, explain: 48 });
  assert.equal(all.play, 77 + 120 + 11);
  assert.equal(all.xp, 219);
  assert.equal(all.xp, bestXp(ALL_SHAPES.map((n) => n.name)));
  // 같은 35가지를 다시(돌려서) 접어도, 몇 판을 더 해도 0점
  for (let round = 1; round <= 3; round += 1) {
    const again = device.play(ALL_SHAPES.map((n) => ({ cells: transformCells(n.cells, round), prediction: rightOf(n) })));
    assert.equal(again.xp, 0, `${round}번째 다시 하기`);
    assert.equal(again.entries, 35);
  }
  assert.equal(device.total(), 219);
  // 예상을 모두 틀림: 등록 점수만 (전에는 35 × 5 = 175점 + 단계 7 = 182점)
  const wrong = createDevice();
  const first = wrong.play(ALL_SHAPES.map((n) => ({ cells: n.cells, prediction: wrongOf(n) })));
  assert.equal(first.play, 11 * 5 + 24 * 1);
  assert.equal(first.xp, 79 + 5 + 2); // 단계 완료 5 + 별 1개 2
  // 그 뒤 모두 맞혀도 이미 접어 본 모양이라 0점. 별이 3개로 늘어난 만큼(+4)만 받는다
  const fixed = wrong.play(honest(ALL_SHAPES));
  assert.deepEqual([fixed.play, fixed.xp], [0, 4]);
  assert.equal(wrong.total(), 90);
  // 여러 판에 나눠 탐구해도 한 판에 모두 맞힌 것(219점)을 넘지 못한다
  const split = createDevice();
  for (let i = 0; i < ALL_SHAPES.length; i += 5) split.play(honest(ALL_SHAPES.slice(i, i + 5)));
  assert.ok(split.total() <= 219, `${split.total()}점`);
  assert.equal(split.shapes().length, 35);
  // 5가지씩 7판에 나눠 모두 맞힘: 첫 판에 별 3개가 되어도 처음 접는 모양의 점수는 그대로(spec 16-9) → 215점 (연속이 판마다 끊겨 219보다 4점 적다)
  assert.equal(split.stars(), 3);
  assert.equal(split.total(), 77 + 120 + 7 + 11);
});

// ── 처음 접는 모양의 점수는 별과 상관없이 (spec 16-9, N1c-1) ─────────────────

/** 모양 목록을 sizes대로 여러 판에 나눈다 */
function inPlays(list, sizes) {
  const plays = [];
  let at = 0;
  for (const size of sizes) {
    if (at >= list.length) break;
    plays.push(list.slice(at, at + size));
    at += size;
  }
  if (at < list.length) plays.push(list.slice(at));
  return plays;
}

test('35가지를 여러 판에 나눠 탐구: 5가지씩 7판 모두 맞힘 215점 ≥ 판마다 하나씩 일부러 틀림 189~198점, 첫 판 전개도 3가지 뒤 4가지씩 217점', () => {
  // 판마다 하나씩 일부러 틀려 별 2개를 지키는 쪽 (틀리는 자리 0~4)
  const tricky = [0, 1, 2, 3, 4].map((pos) => {
    const device = createDevice();
    for (const group of inPlays(ALL_SHAPES, Array(7).fill(5))) {
      device.play(group.map((n, i) => ({ cells: n.cells, prediction: i === pos ? wrongOf(n) : rightOf(n) })));
    }
    assert.equal(device.stars(), 2);
    return device.total();
  });
  assert.deepEqual(tricky, [198, 196, 189, 196, 189]);
  const honestDevice = createDevice();
  for (const group of inPlays(ALL_SHAPES, Array(7).fill(5))) honestDevice.play(honest(group));
  assert.equal(honestDevice.total(), 215);
  assert.ok(tricky.every((xp) => xp < 215));
  // 흔한 흐름: 첫 판에 전개도 3가지를 모두 맞혀 바로 별 3개(33점) → 나머지 32가지를 4가지씩 모두 맞힘
  const flow = createDevice();
  assert.equal(flow.play(honest(CUBE_NETS.slice(0, 3))).xp, 33);
  assert.equal(flow.stars(), 3);
  const rest = ALL_SHAPES.filter((n) => !CUBE_NETS.slice(0, 3).includes(n));
  for (const group of inPlays(rest, Array(8).fill(4))) {
    const r = flow.play(honest(group));
    // 별 3개를 받은 뒤의 판에서도 처음 접는 모양 4가지의 예측(2씩) + 연속 3번(+1) + 등록 + 까닭 설명을 모두 받는다
    assert.equal(r.earned.answer, 4 * XP.first + 1);
    assert.equal(r.earned.explain, group.filter((n) => !isNet(n)).length * XP.explain);
    assert.equal(r.stage, 0);
  }
  assert.equal(flow.total(), 217);
  assert.equal(flow.total(), 33 + (8 * 7 + 24 * 5) + 8); // 전개도 8 × 7 + 안 되는 모양 24 × 5 + 연속 8번
});

test('무작위 1,200기기: 같은 모양·같은 순서·같은 판 나눔·같은 나가기에서 모두 맞힌 쪽이 일부러 틀린 쪽보다 늘 더 받거나 같다 (판을 넘어서도 일부러 틀려 이득 없음)', () => {
  const rng = createRng('free-honest-first');
  let lower = 0;
  let split = 0;
  for (let trial = 0; trial < 1200; trial += 1) {
    const pool = rng.sample(ALL_SHAPES, rng.int(3, 35));
    // 같은 모양을 다시 접는 것도 섞는다(돌리거나 뒤집어서)
    const seq = Array.from({ length: rng.int(3, 45) }, () => {
      const n = rng.pick(pool);
      return { n, cells: shift(transformCells(n.cells, rng.int(0, SYMMETRY_COUNT - 1)), rng.int(0, 1), rng.int(0, 1)) };
    });
    const sizes = [];
    for (let left = seq.length; left > 0;) {
      const size = Math.min(left, rng.int(1, 9));
      sizes.push(size);
      left -= size;
    }
    const plays = inPlays(seq, sizes);
    const exits = plays.map(() => rng.next() < 0.2); // 중간에 나가는 판
    const wrongRate = rng.pick([0.1, 0.3, 0.6, 1]);
    const good = createDevice();
    const tricky = createDevice();
    plays.forEach((group, i) => {
      const finished = !exits[i];
      good.play(group.map((f) => ({ cells: f.cells, prediction: rightOf(f.n) })), { finished });
      tricky.play(
        group.map((f) => ({ cells: f.cells, prediction: rng.next() < wrongRate ? wrongOf(f.n) : rightOf(f.n), explain: rng.pick(['right', 'right', 'wrong', 'skip']) })),
        { finished },
      );
      // 판마다, 그때까지 받은 점수도 늘 모두 맞힌 쪽이 크거나 같다 (어느 판에서 그만둬도 손해 없음)
      assert.ok(good.total() >= tricky.total(), `기기 ${trial} 판 ${i}: 모두 맞힘 ${good.total()} < 일부러 틀림 ${tricky.total()}`);
      assert.ok(good.shapeXp() >= tricky.shapeXp(), `기기 ${trial} 판 ${i}`);
    });
    assert.deepEqual(good.shapes().sort(), tricky.shapes().sort()); // 접어 본 모양은 같다
    assert.ok(good.total() <= bestXp(good.shapes()));
    // 모두 맞힌 쪽의 모양 점수는 판 나눔·나가기와 상관없이 모양마다 한 번씩(예측 2 + 등록 + 설명 2) + 연속
    const names = [...new Set(seq.map((f) => f.n.name))].map(byName);
    const base = names.reduce((sum, n) => sum + (isNet(n) ? XP.first + XP.discover : XP.first + NOTE_XP + XP.explain), 0);
    assert.ok(good.shapeXp() >= base && good.shapeXp() <= base + Math.floor(names.length / XP.streakEvery), `기기 ${trial}`);
    if (tricky.total() < good.total()) lower += 1;
    if (plays.length > 1) split += 1;
  }
  assert.ok(lower > 800, '틀린 예상이 섞이면 대개 점수가 낮다');
  assert.ok(split > 800);
});

test('무작위 800기기: 판 중간에 나갔다 들어오기를 섞어도 같은 순서로 나가지 않은 쪽보다 더 받지 못한다', () => {
  const rng = createRng('free-exit');
  let fewer = 0;
  for (let trial = 0; trial < 800; trial += 1) {
    const pool = rng.sample(ALL_SHAPES, rng.int(3, 35));
    const seq = Array.from({ length: rng.int(3, 40) }, () => {
      const n = rng.pick(pool);
      return { cells: transformCells(n.cells, rng.int(0, SYMMETRY_COUNT - 1)), prediction: rng.next() < 0.75 ? rightOf(n) : wrongOf(n), explain: rng.pick(['right', 'right', 'wrong', 'skip']) };
    });
    const sizes = [];
    for (let left = seq.length; left > 0;) {
      const size = Math.min(left, rng.int(1, 9));
      sizes.push(size);
      left -= size;
    }
    const plays = inPlays(seq, sizes);
    const exits = plays.map((_, i) => i < plays.length - 1 && rng.next() < 0.4);
    // 나간 쪽: 표시한 판을 마치지 않고 나간다
    const leaver = createDevice();
    plays.forEach((group, i) => leaver.play(group, { finished: !exits[i] }));
    // (가) 같은 판 나눔으로 모든 판을 마친 쪽
    const finisher = createDevice();
    plays.forEach((group) => finisher.play(group));
    // (나) 나가지 않고 그 판을 다음 판까지 이어서 한 쪽
    const stayer = createDevice();
    let carry = [];
    plays.forEach((group, i) => {
      carry = carry.concat(group);
      if (!exits[i]) {
        stayer.play(carry);
        carry = [];
      }
    });
    assert.ok(leaver.total() <= finisher.total(), `기기 ${trial}: 나감 ${leaver.total()} > 모두 마침 ${finisher.total()}`);
    assert.equal(leaver.shapeXp(), finisher.shapeXp(), `기기 ${trial}`); // 모양 점수는 그 자리에서 저장되므로 같다
    // 이어서 한 쪽은 연속·다시 일어서기가 끊기지 않아 모양 점수가 같거나 더 크다
    assert.ok(leaver.shapeXp() <= stayer.shapeXp(), `기기 ${trial}: 나감 ${leaver.shapeXp()} > 이어 함 ${stayer.shapeXp()}`);
    // 단계 완료·별 점수(모두 11점)는 마친 판의 정답률로 정해지는 엔진 공통 규칙이라 따로 견준다:
    // 둘 다 접어 본 모양으로 한 판을 더 해 별 3개를 채우면(모양 점수 0) 총점도 나간 쪽이 더 크지 않다
    const top = (device) => {
      const r = device.play(honest(device.shapes().slice(0, 3).map(byName)));
      assert.equal(r.play, 0);
      assert.equal(device.stars(), 3);
      return device.total();
    };
    const [a, b] = [top(leaver), top(stayer)];
    assert.ok(a <= b, `기기 ${trial}: 나감 ${a} > 이어 함 ${b}`);
    assert.equal(a, leaver.shapeXp() + 11);
    assert.ok(a <= bestXp(leaver.shapes()));
    if (leaver.shapeXp() < stayer.shapeXp()) fewer += 1;
  }
  assert.ok(fewer > 100, '나가면 연속·다시 일어서기가 끊겨 덜 받는 경우가 섞여 있어야 한다');
});

test('별 3개를 일부러 피하며 다시 해도 이미 접은 모양은 0점 (전에는 판마다 +116점 · +7점)', () => {
  // 35가지 중 4번만 틀려 별 2개(정답률 31/35 = 89%)를 지키는 판을 되풀이한다
  const device = createDevice();
  const keepTwoStars = () => ALL_SHAPES.map((n, i) => ({ cells: n.cells, prediction: i < 4 ? wrongOf(n) : rightOf(n) }));
  const first = device.play(keepTwoStars());
  assert.equal(first.stars, 2);
  assert.ok(first.xp > 0);
  for (let round = 0; round < 5; round += 1) {
    const again = device.play(keepTwoStars());
    assert.equal(device.stars(), 2); // 별 3개가 아니라 다시 하기 규칙(연습 점수 0)은 걸리지 않지만
    assert.equal(again.xp, 0, `${round + 2}번째 판`); // 이미 접어 본 모양이라 0점
  }
  assert.equal(device.total(), first.xp);
  // 전개도 3가지 + 일부러 1번 틀리는 짧은 판도 같다
  const short = createDevice();
  const folds = ['1-4-1e', '2-3-1a', '3-3', 'line5-a'].map(byName);
  const play = () => folds.map((n, i) => ({ cells: n.cells, prediction: i === 3 ? wrongOf(n) : rightOf(n) }));
  const one = short.play(play());
  assert.equal(one.stars, 2);
  assert.deepEqual([short.play(play()).xp, short.play(play()).xp], [0, 0]);
  assert.equal(short.total(), one.xp);
});

test('별 3개를 받은 단계를 다시 하는 판: 처음 접는 모양은 예측·연속·다시 일어서기·까닭 설명 점수를 모두 받고(spec 16-9), 접어 본 모양은 0점', () => {
  const device = createDevice();
  device.play(honest(['1-4-1e', '2-3-1a', '3-3'].map(byName)));
  assert.equal(device.stars(), 3);
  // 새 전개도 1 + 새 안 되는 모양 2 + 접어 본 십자: 예측 2 × 3 + 연속 3번 +1, 발견 5, 노트 1 × 2, 까닭 설명 2 × 2
  const replay = device.play(honest(['2-2-2', 'line5-a', 'block-a', '1-4-1e'].map(byName)));
  assert.deepEqual(replay.earned, { answer: 7, nets: 5, notes: 2, explain: 4 });
  assert.equal(replay.xp, 18); // 별이 늘지 않아 단계 완료·별 점수는 없다
  // 같은 판을 별 0개에서 시작했을 때와 모양 점수가 같다 (별은 처음 접는 모양의 점수에 영향이 없다)
  const fresh = freePlayXp(honest(['2-2-2', 'line5-a', 'block-a', '1-4-1e'].map(byName)), { dex: ['1-4-1e', '2-3-1a', '3-3'] });
  assert.deepEqual(fresh.earned, replay.earned);
  // 다시 일어서기도: 새 모양을 틀린 뒤 다음 새 모양을 맞히면 +1
  const bounce = device.play([{ cells: byName('line5-b').cells, prediction: 'yes' }, { cells: byName('1-4-1a').cells, prediction: 'yes' }]);
  assert.deepEqual(bounce.earned, { answer: XP.first + XP.bounce, nets: 5, notes: 1, explain: 0 });
  // 접어 본 모양만 다시 접는 판은 0점 (몇 번을 해도)
  for (let i = 0; i < 3; i += 1) {
    const again = device.play(honest(['2-2-2', 'line5-a', 'block-a', '1-4-1e', 'line5-b', '1-4-1a'].map(byName)));
    assert.deepEqual([again.play, again.xp], [0, 0]);
  }
  assert.match(FREE_REPLAY_NOTE, /^처음 접는 모양은 점수를 받아요\. 접어 본 모양은 다시 접어도 점수가 없어요\.$/);
});

test('무작위 400기기 × 여러 판: 일부러 틀리거나, 같은 모양을 되풀이하거나, 중간에 나가거나, 별 3개를 피해도 접어 본 모양들을 한 판에 모두 맞힌 점수를 넘지 못한다', () => {
  const rng = createRng('free-device');
  let reachedBest = 0;
  for (let trial = 0; trial < 400; trial += 1) {
    const device = createDevice();
    const pool = rng.sample(ALL_SHAPES, rng.int(3, 35));
    const accuracy = rng.pick([0.3, 0.6, 0.85, 1]); // 1이면 늘 바르게 예상
    const plays = rng.int(1, 8);
    for (let p = 0; p < plays; p += 1) {
      const folds = Array.from({ length: rng.int(1, 12) }, () => {
        const n = rng.pick(pool);
        const cells = shift(transformCells(n.cells, rng.int(0, SYMMETRY_COUNT - 1)), rng.int(0, 1), rng.int(0, 1));
        return { cells, prediction: rng.next() < accuracy ? rightOf(n) : wrongOf(n) };
      });
      const before = device.total();
      const r = device.play(folds, { explain: rng.pick(['right', 'right', 'wrong', 'skip']), finished: rng.next() < 0.85 });
      assert.ok(r.xp >= 0);
      assert.equal(device.total(), before + r.xp);
    }
    const best = bestXp(device.shapes());
    assert.ok(device.total() <= best, `기기 ${trial}: ${device.total()} > ${best}`);
    assert.ok(device.total() <= 219);
    if (device.total() === best) reachedBest += 1;
    // 더 할 것이 없을 때까지 한 뒤에는 무엇을 접어도(접어 본 모양이면) 0점
    device.play(honest(device.shapes().map(byName))); // 별을 3개로
    const more = device.play(device.shapes().map((name) => ({ cells: byName(name).cells, prediction: rng.next() < 0.5 ? 'yes' : 'no' })));
    assert.equal(more.xp, 0, `기기 ${trial}`);
  }
  assert.ok(reachedBest > 0, '한 판에 모두 맞힌 경우도 섞여 있어야 한다');
});

// ── 결과 "오늘의 솜씨" 칸 (N1-4) ─────────────────

test('결과 "오늘의 솜씨": 칸 점수의 합 = 이번 판 점수(칸 합 + 단계 완료·별 = 모은 솜씨 점수), 점수 있는 칸은 빠지지 않고 4칸까지', () => {
  // Review가 잰 경우: 전개도 3가지 + 안 되는 모양 2가지(까닭 1번 맞힘 포함) → 까닭 설명 칸이 빠져 합이 총점과 달랐다
  const folds = honest(['1-4-1e', 'line5-a', '2-3-1a', 'block-b', '3-3'].map(byName));
  const r = freePlayXp(folds);
  const tiles = freeHighlights(freeSummary(r.session.history()), r);
  assert.deepEqual(tiles.map((t) => [t.label, t.value, t.xp]), [
    ['예측 적중', '5 / 5', 11], // 2 × 5 + 연속 3번 +1
    ['새 전개도 발견', '3가지', 15],
    ['노트에 적은 모양', '2가지', 2],
    ['까닭 설명', '2번', 4],
  ]);
  assert.equal(tiles.reduce((sum, t) => sum + (t.xp ?? 0), 0) + r.stage, r.xp);
  assert.equal(r.xp, 32 + 11);
  // 자리가 남으면 점수 없는 "고쳐서 다시 도전"도 보인다
  const nets = freePlayXp(honest(['1-4-1e', '2-3-1a', '3-3'].map(byName)));
  assert.deepEqual(freeHighlights(freeSummary(nets.session.history()), nets).map((t) => [t.label, t.xp]),
    [['예측 적중', 7], ['새 전개도 발견', 15], ['고쳐서 다시 도전', undefined]]);
  // 무작위 600판 (처음 하는 판·다시 하는 판·별 3개 판·이미 접어 본 모양이 섞인 판)
  const rng = createRng('free-tiles');
  let withExplain = 0;
  for (let trial = 0; trial < 600; trial += 1) {
    const list = Array.from({ length: rng.int(1, 14) }, () => rng.pick(ALL_SHAPES));
    const play = freePlayXp(
      list.map((n) => ({ cells: n.cells, prediction: rng.next() < 0.75 ? rightOf(n) : wrongOf(n) })),
      {
        dex: rng.sample(CUBE_NETS.map((n) => n.name), rng.int(0, 6)),
        note: rng.sample(INVALID_HEXOMINOES.map((n) => n.name), rng.int(0, 10)),
        startStars: rng.int(0, 3),
        explain: rng.pick(['right', 'right', 'wrong', 'skip']),
      },
    );
    const sum = freeSummary(play.session.history());
    const list4 = freeHighlights(sum, play);
    assert.ok(list4.length <= FREE_TILE_MAX, `판 ${trial}: ${list4.length}칸`);
    assert.equal(list4[0].label, '예측 적중');
    assert.equal(list4.reduce((total, t) => total + (t.xp ?? 0), 0), play.play, `판 ${trial}`);
    assert.equal(list4.reduce((total, t) => total + (t.xp ?? 0), 0) + play.stage, play.xp, `판 ${trial}`);
    // 점수를 받은 갈래는 모두 칸에 있다
    const labelOf = { answer: '예측 적중', nets: '새 전개도 발견', notes: '노트에 적은 모양', explain: '까닭 설명' };
    for (const [key, xp] of Object.entries(play.earned)) {
      if (xp > 0) assert.equal(list4.find((t) => t.label === labelOf[key])?.xp, xp, `판 ${trial}: ${key}`);
    }
    if (play.earned.explain > 0) withExplain += 1;
    assert.equal(sum.predictions, play.entries);
  }
  assert.ok(withExplain > 50);
});

// ── 까닭 고르기 전에는 까닭을 보이지 않는다 (N1-1) ─────────────────

test('안 되는 모양 24가지 × 돌리기·뒤집기 8가지: "안 될 거예요"로 맞히면 까닭을 고르기 전에는 까닭 문장·무대 표시가 없고, 고른 뒤에 나온다', () => {
  const REASON_WORDS = /겹|네 면|한 점|모여|모이|비어|꼭짓점|3개만/;
  let count = 0;
  for (const n of INVALID_HEXOMINOES) {
    for (let k = 0; k < SYMMETRY_COUNT; k += 1) {
      const step = createFreeSession().fold(transformCells(n.cells, k), L6, 'no');
      assert.equal(step.explainable, true, n.name);
      // 고르기 전: 무대에 까닭 표시(이름표·겹쳐요·비어요·●)를 보이지 않고, 쪽지·알림에 까닭 낱말이 없다
      const before = freeFeedback(step);
      assert.equal(before.marks, false, n.name);
      assert.equal(before.note, FREE_NOTE_BEFORE_PICK);
      assert.equal(before.toast, '예측 적중! 왜 안 되는지 골라 볼까요?');
      for (const text of [before.note, before.toast, step.title]) assert.doesNotMatch(text, REASON_WORDS, `${n.name}: ${text}`);
      // 고른 뒤(맞든 틀리든, 넘어가도): 까닭 문장과 무대 표시가 나온다
      const after = freeFeedback(step, { picked: true });
      assert.equal(after.marks, true);
      assert.equal(after.note, step.message);
      assert.ok(after.note.includes(explainProblem(step.net, primaryProblem(step.problems))), n.name);
      assert.match(after.note, REASON_WORDS);
      count += 1;
    }
  }
  assert.equal(count, 24 * 8);
  // 까닭 문장 자체는 까닭 낱말로 가려낼 수 있다 (검사에 쓰는 낱말이 실제 까닭 문장을 모두 잡는다)
  for (const n of INVALID_HEXOMINOES) assert.match(judgeFree({ cells: n.cells, labels: L6, prediction: 'yes' }).message, REASON_WORDS, n.name);
});

test('까닭 고르기가 없는 경우(예상이 틀림, 전개도, 이번 판에 다시 접음)는 접은 바로 뒤에 까닭 문장·무대 표시를 보인다', () => {
  for (const n of ALL_SHAPES) {
    // 안 되는 모양을 "될 거예요"로 틀림 → 까닭을 바로 보여 준다(오답에는 이유)
    const wrong = createFreeSession().fold(n.cells, L6, wrongOf(n));
    assert.equal(wrong.explainable, false, n.name);
    assert.deepEqual([freeFeedback(wrong).marks, freeFeedback(wrong).note], [true, wrong.message], n.name);
    assert.match(freeFeedback(wrong).toast, /^예상과 달랐어요\./);
    // 전개도를 맞힘
    if (isNet(n)) {
      const right = createFreeSession().fold(n.cells, L6, 'yes');
      assert.deepEqual([right.explainable, freeFeedback(right).marks, freeFeedback(right).toast], [false, true, '예측 적중! 처음 찾은 전개도예요.']);
      const known = createFreeSession({ dex: [n.name] }).fold(n.cells, L6, 'yes');
      assert.match(freeFeedback(known).toast, /^예측 적중! 도감 \d+번과 같은 모양이에요\.$/);
    }
    // 이번 판에 이미 접어 본 모양
    const session = createFreeSession();
    session.fold(n.cells, L6, rightOf(n));
    const repeat = session.fold(n.cells, L6, rightOf(n));
    assert.deepEqual([repeat.explainable, freeFeedback(repeat).marks, freeFeedback(repeat).toast], [false, true, '이번에 이미 접어 본 모양이에요.']);
  }
  // 노트에 이미 있는 안 되는 모양도 "안 될 거예요"로 맞히면 까닭 고르기가 먼저다 (점수는 없다)
  const known = createFreeSession({ note: ['block-a'] }).fold(byName('block-a').cells, L6, 'no');
  assert.deepEqual([known.explainable, known.first, freeFeedback(known).marks], [true, false, false]);
});

// ── 떨어진 면 판정은 fold.js 한 곳에서 (N1-9) ─────────────────

/** 견줄 기준: fold.js를 쓰지 않고 칸의 위·아래·왼쪽·오른쪽 이웃으로만 덩어리를 나눈다 */
function referenceGroups(cells) {
  const key = ([x, y]) => `${x},${y}`;
  const index = new Map(cells.map((c, i) => [key(c), i]));
  const seen = new Set();
  const groups = [];
  cells.forEach((_, start) => {
    if (seen.has(start)) return;
    const group = [];
    const stack = [start];
    seen.add(start);
    while (stack.length > 0) {
      const i = stack.pop();
      group.push(i);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = index.get(key([cells[i][0] + dx, cells[i][1] + dy]));
        if (j !== undefined && !seen.has(j)) {
          seen.add(j);
          stack.push(j);
        }
      }
    }
    groups.push(group.sort((a, b) => a - b));
  });
  return groups.sort((a, b) => b.length - a.length || a[0] - b[0]);
}

test('떨어진 면 판정: boardReadiness는 fold.js의 isConnected로 정하고, 5칸 × 4줄에서 6칸을 고르는 38,760가지 모두 이웃 칸으로 센 결과와 같다', () => {
  const grid = [];
  for (let y = 0; y < 4; y += 1) for (let x = 0; x < 5; x += 1) grid.push([x, y]);
  let total = 0;
  let apart = 0;
  const pick = [];
  const walk = (from) => {
    if (pick.length === 6) {
      const cells = pick.map((i) => grid[i]);
      const groups = referenceGroups(cells);
      const r = boardReadiness(cells);
      total += 1;
      assert.equal(r.ready, groups.length === 1);
      assert.equal(r.ready, isConnected(fromCells(cells))); // 접기 판정과 같은 한 가지 계산
      if (!r.ready) {
        apart += 1;
        assert.equal(r.reason, 'apart');
        assert.deepEqual(r.detached, groups.slice(1).flat().sort((a, b) => a - b)); // 가장 큰 덩어리 밖의 칸
        assert.deepEqual(cellGroups(cells), groups);
      }
      return;
    }
    for (let i = from; i < grid.length; i += 1) {
      pick.push(i);
      walk(i + 1);
      pick.pop();
    }
  };
  walk(0);
  assert.equal(total, 38760);
  assert.ok(apart > 30000 && apart < total);
  // 놓는 순서(칸 번호)가 달라도, 7 × 5·6 × 6 판의 아무 6칸도 같다 (무작위 3,000개)
  const rng = createRng('free-apart');
  for (let trial = 0; trial < 3000; trial += 1) {
    const { cols, rows } = rng.pick(Object.values(BOARD_SIZES));
    const all = [];
    for (let y = 0; y < rows; y += 1) for (let x = 0; x < cols; x += 1) all.push([x, y]);
    const cells = rng.sample(all, 6);
    const groups = referenceGroups(cells);
    const r = boardReadiness(cells);
    assert.equal(r.ready, groups.length === 1);
    assert.deepEqual(r.detached, groups.length === 1 ? [] : groups.slice(1).flat().sort((a, b) => a - b));
    assert.deepEqual(cellGroups(cells), groups);
  }
});
