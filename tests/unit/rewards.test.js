import assert from 'node:assert/strict';
import { test } from 'node:test';
import { starsFromAccuracy } from '../../src/shared/core/progress.js';
import { createRng } from '../../src/shared/core/random.js';
import {
  DEFAULT_BADGES,
  DEFAULT_RANKS,
  DEFAULT_THRESHOLDS,
  XP,
  badgeState,
  createAnswerTracker,
  createPlayReward,
  createRewardStore,
  discoverXp,
  evaluateBadges,
  MASTERED_STARS,
  normalizeBadges,
  practiceAllowed,
  normalizeRanks,
  normalizeRewardState,
  rankOf,
  scoreAnswers,
  stageXp,
} from '../../src/shared/core/rewards.js';
import { createMemoryBackend, createStorage } from '../../src/shared/core/storage.js';

const ok = (itemId) => ({ itemId, correct: true });
const no = (itemId) => ({ itemId, correct: false });

test('점수 표: 처음에 맞힘 +2, 틀림 0, 다시 도전해 맞힘 +1, 이미 맞힌 문항 0, 빠르기 0', () => {
  assert.deepEqual(XP, {
    first: 2, retry: 1, bounce: 1, streakEvery: 3, streakBonus: 1, stageClear: 5, perStar: 2, challenge: 10, discover: 5, explain: 2,
  });
  const t = createAnswerTracker();
  assert.deepEqual(t.answer(ok('a')), { kind: 'first', xp: 2, bounce: false, streak: 1, streakBonus: false });
  assert.deepEqual(t.answer(no('b')), { kind: 'wrong', xp: 0, bounce: false, streak: 0, streakBonus: false });
  assert.equal(t.answer(no('b')).xp, 0); // 같은 문항을 또 틀려도 벌점 없음
  assert.deepEqual(t.answer(ok('b')), { kind: 'retry', xp: 1, bounce: false, streak: 0, streakBonus: false });
  assert.equal(t.answer(ok('b')).kind, 'repeat'); // 이미 맞힌 문항을 또 답하면 0
  assert.equal(t.answer(ok('a')).xp, 0);
  // 답에 시간(atMs 등)이 있어도 점수는 같다
  assert.equal(scoreAnswers([{ itemId: 1, correct: true, atMs: 100 }]).xp, scoreAnswers([{ itemId: 1, correct: true, atMs: 99_999 }]).xp);
});

test('다시 일어서기: 틀린 뒤 다음 새 문항을 처음에 맞히면 +1 (틀린 문항 하나마다 한 번)', () => {
  // 틀림 → 같은 문항 다시 도전 맞힘(+1) → 다음 문항 처음 맞힘(+2 +1)
  const s1 = scoreAnswers([no('a'), ok('a'), ok('b')]);
  assert.equal(s1.retryFix, 1);
  assert.equal(s1.bounce, 1);
  assert.equal(s1.xp, 4); // = 두 문항 모두 처음에 맞힌 것(4)과 같고 크지 않다
  assert.equal(scoreAnswers([ok('a'), ok('b')]).xp, 4);
  // 틀린 문항을 다시 틀려도 다시 일어서기 기회는 한 번뿐
  const s2 = scoreAnswers([no('a'), ok('b'), no('a'), ok('c'), no('a'), ok('d'), ok('a')]);
  assert.equal(s2.bounce, 1);
  // 두 문항을 연달아 틀린 뒤 맞히면 한 번
  assert.equal(scoreAnswers([no('a'), no('b'), ok('c')]).bounce, 1);
  // 처음 문항을 맞힌 것은 다시 일어서기가 아니다
  assert.equal(scoreAnswers([ok('a'), ok('b')]).bounce, 0);
  const t = createAnswerTracker();
  t.answer(no('x'));
  assert.equal(t.bounceReady(), true);
  t.answer(ok('y'));
  assert.equal(t.bounceReady(), false);
});

test('연속: 처음 시도에 연달아 맞힌 수, 3번마다 +1, 틀리면 0', () => {
  const t = createAnswerTracker();
  const steps = [1, 2, 3, 4, 5, 6].map((i) => t.answer(ok(i)));
  assert.deepEqual(steps.map((s) => s.streak), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(steps.map((s) => s.streakBonus), [false, false, true, false, false, true]);
  assert.equal(t.totals().xp, 6 * 2 + 2);
  t.answer(no(7));
  assert.equal(t.streak(), 0);
  assert.equal(t.totals().bestStreak, 6);
  // 다시 도전해 맞힌 것은 연속에 넣지 않는다
  t.answer(ok(7));
  assert.equal(t.streak(), 0);
});

test('itemId가 없으면 "틀린 바로 뒤 답"을 같은 문항의 다시 도전으로 본다 (점수를 더 주는 쪽으로 읽지 않음)', () => {
  const s = scoreAnswers([{ correct: false }, { correct: true }, { correct: true }]);
  assert.equal(s.items, 2);
  assert.equal(s.retryFix, 1);
  assert.equal(s.xp, 1 + 2 + 1); // 다시 도전 +1, 다음 문항 +2, 다시 일어서기 +1
  assert.equal(scoreAnswers([{ correct: true }, { correct: true }]).xp, 4);
});

test('단계 완료·별 점수는 그 단계 별이 늘어날 때만 (같은 단계 반복으로 쌓지 못함)', () => {
  assert.deepEqual(stageXp({ prevStars: 0, stars: 3 }), { firstClear: true, newStars: 3, clearXp: 5, starXp: 6, total: 11 });
  assert.equal(stageXp({ prevStars: 3, stars: 3 }).total, 0); // 같은 단계 반복
  assert.equal(stageXp({ prevStars: 3, stars: 1 }).total, 0);
  assert.deepEqual(stageXp({ prevStars: 1, stars: 3 }), { firstClear: false, newStars: 2, clearXp: 0, starXp: 4, total: 4 });
  assert.equal(stageXp({ prevStars: 0, stars: 0, cleared: false }).total, 0); // 실패
  assert.equal(stageXp({ prevStars: 0, stars: 2, cleared: false }).total, 0);
  // 도전 주문서는 처음 성공에만 +10 (단계 완료 +5 대신)
  assert.equal(stageXp({ prevStars: 0, stars: 2, challenge: true }).clearXp, 10);
  assert.equal(stageXp({ prevStars: 2, stars: 2, challenge: true }).total, 0);
});

// ── "어떤 답 순서도 모두 처음에 맞힌 것보다 점수가 크지 않다" ─────────────

/** 한 판 점수(답 + 설명 + 단계 완료·별). 별은 정답률로(엔진과 같게), 이전 별은 0 */
function playTotal(answers, explains = []) {
  const play = createPlayReward();
  for (const a of answers) play.answer(a);
  for (const e of explains) play.event('explain', e);
  const t = play.summary().answers;
  const stars = starsFromAccuracy(t.attempts ? t.correct / t.attempts : null);
  return play.xp() + stageXp({ prevStars: 0, stars, cleared: true }).total;
}

const perfectTotal = (n, { explain = false } = {}) => playTotal(
  Array.from({ length: n }, (_, i) => ok(`q${i}`)),
  explain ? Array.from({ length: n }, (_, i) => ({ correct: true, itemId: `q${i}` })) : [],
);

/** 문항 n개의 무작위 답 순서: 문항마다 틀림 0~4번 → (대개) 맞힘 → 가끔 이미 맞힌 문항을 또 답함. 문항끼리는 아무렇게나 섞는다 */
function randomAnswers(rng, n) {
  const perItem = Array.from({ length: n }, (_, i) => {
    const id = `q${i}`;
    const list = [];
    const wrongs = rng.pick([0, 0, 1, 1, 2, 3, 4]);
    for (let k = 0; k < wrongs; k += 1) list.push(no(id));
    if (rng.next() < 0.9) {
      list.push(ok(id));
      const repeats = rng.pick([0, 0, 0, 1, 2]);
      for (let k = 0; k < repeats; k += 1) list.push(rng.next() < 0.5 ? ok(id) : no(id));
    }
    return list;
  });
  const out = [];
  while (perItem.some((l) => l.length > 0)) {
    const live = perItem.filter((l) => l.length > 0);
    out.push(rng.pick(live).shift()); // 문항 안의 순서는 지키고, 문항끼리는 무작위로 섞는다
  }
  return out;
}

test('무작위 답 순서 3,000개: 어떤 순서도 모두 처음에 맞힌 것보다 점수가 크지 않다 (일부러 틀려도 이득 없음)', () => {
  const rng = createRng('rewards-no-gain');
  let equal = 0;
  for (let trial = 0; trial < 3000; trial += 1) {
    const n = rng.int(1, 14);
    const answers = randomAnswers(rng, n);
    const got = playTotal(answers);
    const best = perfectTotal(n);
    assert.ok(got <= best, `문항 ${n}개, 점수 ${got} > 모두 처음에 맞힘 ${best}: ${JSON.stringify(answers)}`);
    if (got === best) equal += 1;
  }
  assert.ok(equal > 0, '모두 처음에 맞힌 경우도 섞여 있어야 한다');
});

test('무작위 1,500개: 설명 이벤트(맞음·틀림·같은 문항 반복)를 섞어도 모두 처음에 맞히고 한 번씩 설명한 것보다 크지 않다', () => {
  const rng = createRng('rewards-explain');
  for (let trial = 0; trial < 1500; trial += 1) {
    const n = rng.int(1, 12);
    const answers = randomAnswers(rng, n);
    const explains = Array.from({ length: rng.int(0, n * 3) }, () => ({ correct: rng.next() < 0.6, itemId: `q${rng.int(0, n - 1)}` }));
    const got = playTotal(answers, explains);
    const best = perfectTotal(n, { explain: true });
    assert.ok(got <= best, `문항 ${n}개: ${got} > ${best}`);
  }
});

test('무작위 1,500개: itemId 없이 기록하는 게임(틀리면 다시 풀거나 그냥 넘어감)도 이득이 없다', () => {
  const rng = createRng('rewards-null-id');
  for (let trial = 0; trial < 1500; trial += 1) {
    const n = rng.int(1, 12);
    const answers = [];
    for (let q = 0; q < n; q += 1) {
      const wrongs = rng.pick([0, 0, 1, 2, 3]);
      for (let k = 0; k < wrongs; k += 1) answers.push({ correct: false });
      if (wrongs === 0 || rng.next() < 0.7) answers.push({ correct: true }); // 아니면 틀린 채로 다음 문항
    }
    const got = playTotal(answers);
    const best = playTotal(Array.from({ length: n }, () => ({ correct: true })));
    assert.equal(best, perfectTotal(n));
    assert.ok(got <= best, `문항 ${n}개: ${got} > ${best}`);
  }
});

test('일부러 틀리는 전략들: 하나 걸러 틀리기, 모두 한 번씩 틀리고 고치기, 찍기 반복', () => {
  for (const n of [3, 5, 6, 9, 12]) {
    const best = perfectTotal(n);
    const ids = Array.from({ length: n }, (_, i) => `q${i}`);
    const alternate = ids.flatMap((id, i) => (i % 2 ? [no(id), ok(id)] : [ok(id)]));
    const allFix = ids.flatMap((id) => [no(id), ok(id)]);
    const guess = ids.flatMap((id) => [no(id), no(id), no(id), ok(id)]);
    const bounceFarm = ids.flatMap((id, i) => (i % 2 ? [ok(id)] : [no(id)])).concat(ids.filter((_, i) => i % 2 === 0).map(ok));
    for (const seq of [alternate, allFix, guess, bounceFarm]) assert.ok(playTotal(seq) < best, `n=${n}`);
  }
});

// ── 다시 하기 점수 (사용자 결정): 판을 시작할 때 별 3개인 단계는 연습 점수 없음 ─────────────

/** 한 판 점수: startStars(판을 시작할 때 별)에서 시작해 답·설명·새로 찾음을 받고 단계 완료·별까지 */
function replayTotal(answers, { startStars = 0, explains = [], discoveries = 0 } = {}) {
  const play = createPlayReward({ startStars });
  for (const a of answers) play.answer(a);
  for (const e of explains) play.event('explain', e);
  for (let i = 0; i < discoveries; i += 1) play.discovered();
  const t = play.summary().answers;
  const stars = starsFromAccuracy(t.attempts ? t.correct / t.attempts : null);
  return play.xp() + stageXp({ prevStars: startStars, stars, cleared: true }).total;
}

test('다시 하기 점수: 별 3개 단계를 다시 하면 연습 점수(처음 맞힘·다시 도전·다시 일어서기·연속·설명) 0, 새로 찾음 +5는 그대로', () => {
  assert.equal(MASTERED_STARS, 3);
  assert.deepEqual([0, 1, 2, 3].map(practiceAllowed), [true, true, true, false]);
  const play = createPlayReward({ startStars: 3 });
  assert.equal(play.practice(), false);
  const steps = [ok('a'), ok('b'), ok('c'), no('d'), ok('d'), ok('e')].map((x) => play.answer(x));
  assert.ok(steps.every((st) => st.xp === 0));
  assert.equal(steps[2].streakBonus, true); // 연속 표시·소리는 그대로 (점수만 0)
  assert.equal(play.streak(), 1);
  assert.equal(play.event('explain', { correct: true, itemId: 'a' }), 0);
  assert.equal(play.xp(), 0);
  assert.equal(play.discovered(), 5); // 도감에 처음 찾은 것은 별과 상관없이
  assert.equal(play.xp(), 5);
  const sum = play.summary();
  assert.equal(sum.practice, false);
  assert.equal(sum.answers.xp, 0);
  assert.equal(sum.answers.firstTry, 4); // 기록(횟수)은 그대로 남는다
  // 단계 완료·별 점수도 별이 늘지 않아 0 → 이 판 전체 = 새로 찾음뿐
  assert.equal(replayTotal([ok(1), ok(2), ok(3)], { startStars: 3, discoveries: 1 }), 5);
  assert.equal(replayTotal([ok(1), ok(2), ok(3)], { startStars: 3 }), 0);
});

test('다시 하기 점수: 별 2개 이하 단계는 지금처럼 주고, 이번 판에서 처음 별 3개를 받아도 이번 판 점수는 준다', () => {
  for (const startStars of [0, 1, 2]) {
    const play = createPlayReward({ startStars });
    assert.equal(play.practice(), true);
    for (const x of [ok('a'), ok('b'), ok('c')]) play.answer(x);
    assert.equal(play.event('explain', { correct: true, itemId: 'a' }), 2);
    assert.equal(play.xp(), 2 * 3 + 1 + 2, `별 ${startStars}개`);
  }
  // 별 2개였던 단계를 모두 맞혀 처음 별 3개: 답 점수 + 별 1개 늘어난 점수
  assert.equal(replayTotal([ok(1), ok(2), ok(3), ok(4)], { startStars: 2 }), 8 + 1 + 2);
  // 처음 하는 단계는 그대로 (별 3개를 받아도)
  assert.equal(replayTotal([ok(1), ok(2), ok(3), ok(4)]), 8 + 1 + 5 + 6);
});

test('다시 하기 점수 규칙에서도 무작위 1,500개: 어떤 답 순서도 모두 처음에 맞힌 것보다 점수가 크지 않다 (일부러 틀려도 이득 없음)', () => {
  const rng = createRng('rewards-replay');
  for (let trial = 0; trial < 1500; trial += 1) {
    const n = rng.int(1, 12);
    const startStars = rng.int(0, 3);
    const answers = randomAnswers(rng, n);
    const explains = Array.from({ length: rng.int(0, n * 2) }, () => ({ correct: rng.next() < 0.6, itemId: `q${rng.int(0, n - 1)}` }));
    const discoveries = rng.int(0, 2);
    const got = replayTotal(answers, { startStars, explains, discoveries });
    const best = replayTotal(Array.from({ length: n }, (_, i) => ok(`q${i}`)), {
      startStars, explains: Array.from({ length: n }, (_, i) => ({ correct: true, itemId: `q${i}` })), discoveries,
    });
    assert.ok(got <= best, `별 ${startStars}개, 문항 ${n}개: ${got} > ${best}`);
    if (startStars === 3) assert.equal(got, discoveries * XP.discover);
  }
});

// ── 점수 없는 답(scored: false): 이미 점수를 받은 것을 다시 답함 (예: 지난 판에 이미 찾은 모양) ─────────────

test('scored: false인 답은 점수가 없고 연속·다시 일어서기 계산에 넣지 않는다 (틀리면 연속만 끊긴다). 횟수에는 센다', () => {
  const again = (itemId, correct) => ({ itemId, correct, scored: false });
  const t = createAnswerTracker();
  assert.deepEqual(t.answer(again('old1', true)), { kind: 'repeat', xp: 0, bounce: false, streak: 0, streakBonus: false });
  t.answer(ok('a'));
  t.answer(ok('b'));
  assert.equal(t.answer(again('old2', true)).streak, 2); // 맞혀도 연속은 그대로
  assert.deepEqual(t.answer(ok('c')), { kind: 'first', xp: 2 + 1, bounce: false, streak: 3, streakBonus: true });
  assert.equal(t.answer(again('old3', false)).streak, 0); // 틀리면 연속만 끊긴다
  assert.equal(t.bounceReady(), false); // 다시 일어서기 기회는 생기지 않는다
  assert.deepEqual(t.answer(ok('d')), { kind: 'first', xp: 2, bounce: false, streak: 1, streakBonus: false });
  // 점수 있는 답을 틀려 생긴 다시 일어서기 기회는 점수 없는 답이 쓰지 않는다
  t.answer(no('e'));
  assert.equal(t.answer(again('old4', true)).bounce, false);
  assert.equal(t.bounceReady(), true);
  assert.equal(t.answer(ok('f')).bounce, true);
  const totals = t.totals();
  assert.deepEqual([totals.attempts, totals.correct, totals.wrong, totals.unscored, totals.items, totals.firstTry], [10, 8, 2, 4, 6, 5]);
  assert.equal(totals.xp, 5 * 2 + 1 + 1); // 점수 있는 답만: 처음 맞힘 5, 연속 1, 다시 일어서기 1
  // 같은 itemId라도 scored: false면 점수가 없다 (몇 번을 답해도)
  assert.equal(scoreAnswers(Array.from({ length: 20 }, (_, i) => again(`x${i % 3}`, true))).xp, 0);
});

test('한 판 점수: scored: false인 문항은 설명 점수도 없다(횟수만), 도감 등록 점수는 도감마다 0~5로 줄일 수 있다', () => {
  const play = createPlayReward();
  assert.equal(play.answer({ itemId: 'old', correct: true, scored: false }).xp, 0);
  assert.equal(play.event('explain', { correct: true, itemId: 'old' }), 0);
  assert.equal(play.answer(ok('new')).xp, 2);
  assert.equal(play.event('explain', { correct: true, itemId: 'new' }), 2);
  assert.deepEqual(play.summary().explain, { count: 2, xp: 2 });
  assert.equal(play.discovered(1), 1); // 예: 안 되는 모양 노트 +1
  assert.equal(play.discovered(), 5);
  assert.equal(play.xp(), 2 + 2 + 1 + 5);
  assert.deepEqual(play.summary().discover, { count: 2, xp: 6 });
  // 등록 점수는 기본(+5)보다 클 수 없고 음수가 될 수 없다
  assert.deepEqual([undefined, null, 5, 1, 0, 9, -3, 2.7, 'x'].map((v) => discoverXp(v)), [5, 5, 5, 1, 0, 5, 0, 2, 5]);
  assert.equal(createPlayReward().discovered(99), 5);
});

test('무작위 2,000개: 점수 없는 답(scored: false)을 아무 데나 섞어도 점수 있는 답만 모두 처음에 맞힌 것보다 크지 않다', () => {
  const rng = createRng('rewards-unscored');
  let lower = 0;
  for (let trial = 0; trial < 2000; trial += 1) {
    const n = rng.int(1, 12);
    const startStars = rng.int(0, 3);
    const answers = randomAnswers(rng, n);
    // 점수 없는 답(맞음·틀림)을 사이사이에 넣는다. 설명도 아무 문항에나
    const mixed = answers.flatMap((a) => [
      ...Array.from({ length: rng.pick([0, 0, 1, 2]) }, () => ({ itemId: `old${rng.int(0, 4)}`, correct: rng.next() < 0.5, scored: false })),
      a,
    ]);
    // 설명은 답한 문항에만 한다 (점수 있는 문항 q…, 점수 없이 기록만 한 문항 old…)
    const olds = [...new Set(mixed.filter((a) => a.scored === false).map((a) => a.itemId))];
    const explains = Array.from({ length: rng.int(0, n * 2) }, () => ({
      correct: rng.next() < 0.7,
      itemId: olds.length > 0 && rng.next() < 0.5 ? rng.pick(olds) : `q${rng.int(0, n - 1)}`,
    }));
    const got = replayTotal(mixed, { startStars, explains });
    const best = replayTotal(Array.from({ length: n }, (_, i) => ok(`q${i}`)), { startStars, explains: Array.from({ length: n }, (_, i) => ({ correct: true, itemId: `q${i}` })) });
    assert.ok(got <= best, `별 ${startStars}개, 문항 ${n}개: ${got} > ${best}`);
    if (got < best) lower += 1;
  }
  assert.ok(lower > 500);
});

test('칭호: 기본 5단계 기준 0·40·100·180·300점, 다음 칭호까지 남은 점수와 비율', () => {
  assert.deepEqual([...DEFAULT_RANKS], ['새싹', '탐험가', '해결사', '척척박사', '으뜸 박사']);
  assert.deepEqual([...DEFAULT_THRESHOLDS], [0, 40, 100, 180, 300]);
  assert.equal(rankOf(0).name, '새싹');
  assert.equal(rankOf(39).name, '새싹');
  assert.equal(rankOf(40).name, '탐험가');
  assert.equal(rankOf(99).name, '탐험가');
  assert.equal(rankOf(100).name, '해결사');
  assert.equal(rankOf(180).name, '척척박사');
  assert.equal(rankOf(300).name, '으뜸 박사');
  assert.equal(rankOf(9999).index, 4);
  assert.equal(rankOf(9999).next, null);
  assert.equal(rankOf(9999).progress, 1);
  const r = rankOf(70);
  assert.deepEqual({ index: r.index, toNext: r.toNext, progress: r.progress, next: r.next }, { index: 1, toNext: 30, progress: 0.5, next: { name: '해결사', at: 100 } });
  assert.equal(rankOf(-5).xp, 0);
  // 게임이 이름을 바꾼다
  const nw = normalizeRanks({ ranks: ['견습생', '솜씨꾼', '접기 장인', '설계 장인', '공방 명장'] });
  assert.equal(rankOf(60, nw).name, '솜씨꾼');
  assert.throws(() => normalizeRanks({ ranks: ['a', 'b'] }), /같은 개수/);
  assert.throws(() => normalizeRanks({ ranks: ['a', 'b'], thresholds: [0, 0] }), /커지는/);
  assert.throws(() => normalizeRanks({ ranks: ['a', 'b'], thresholds: [5, 10] }), /0부터/);
});

test('칭호: 차시 하나(정육면체 3단계, 15문항)를 모두 처음에 맞히면 한 번은 오른다', () => {
  const xp = [6, 5, 4].reduce((sum, n) => sum + perfectTotal(n), 0);
  assert.ok(xp >= DEFAULT_THRESHOLDS[1], `${xp}점`);
  assert.ok(xp < DEFAULT_THRESHOLDS[2], `${xp}점`);
});

test('도장 6개: 조건(학습 행동)을 채울 때만 받는다', () => {
  assert.deepEqual(DEFAULT_BADGES.map((b) => b.id), ['first-step', 'sharp-eye', 'try-again', 'bounce-back', 'lesson-done', 'all-stars']);
  const lessons = [{ id: 'a', ids: ['a1', 'a2'] }, { id: 'b', ids: ['b1'] }];
  const ids = (state) => evaluateBadges(DEFAULT_BADGES, badgeState({ lessons, ...state })).map((b) => b.id);
  assert.deepEqual(ids({}), []);
  assert.deepEqual(ids({ stars: { a1: 1 } }), ['first-step']);
  // 꼼꼼한 눈: 한 판에서 4번 이상, 틀림 없이, 마침
  const play = (p) => ({ stageId: 'a1', attempts: 4, correct: 4, wrong: 0, firstTry: 4, cleared: true, stars: 3, ...p });
  assert.ok(ids({ play: play() }).includes('sharp-eye'));
  assert.ok(!ids({ play: play({ attempts: 3, correct: 3, firstTry: 3 }) }).includes('sharp-eye'));
  assert.ok(!ids({ play: play({ attempts: 5, wrong: 1 }) }).includes('sharp-eye'));
  assert.ok(!ids({ play: play({ cleared: false }) }).includes('sharp-eye'));
  // 끝까지 다시: 다시 도전해 맞힘 3번 누적, 다시 일어서기: 5번 누적
  assert.ok(!ids({ counters: { retryFix: 2 } }).includes('try-again'));
  assert.ok(ids({ counters: { retryFix: 3 } }).includes('try-again'));
  assert.ok(!ids({ counters: { bounce: 4 } }).includes('bounce-back'));
  assert.ok(ids({ counters: { bounce: 5 } }).includes('bounce-back'));
  // 차시 완주·별 부자: 한 차시의 (일반) 단계를 모두
  assert.ok(!ids({ stars: { a1: 3 } }).includes('lesson-done'));
  assert.ok(ids({ stars: { b1: 1 } }).includes('lesson-done'));
  assert.ok(!ids({ stars: { a1: 3, a2: 2 } }).includes('all-stars'));
  assert.ok(ids({ stars: { a1: 3, a2: 3 } }).includes('all-stars'));
  // 이미 받은 도장은 다시 주지 않는다
  assert.deepEqual(evaluateBadges(DEFAULT_BADGES, badgeState({ lessons, stars: { a1: 1 } }), { 'first-step': { at: 1 } }).map((b) => b.id), []);
});

test('게임 도장: 정의 검사, test가 오류를 내면 받지 않음', () => {
  const extra = { id: 'finder', title: '모양 탐정', desc: '모양 2가지를 찾아요', test: (s) => s.collections.shapes.count >= 2 };
  const defs = normalizeBadges([extra]);
  assert.equal(defs.length, 7);
  assert.equal(defs.at(-1).icon, 'stamp');
  assert.throws(() => normalizeBadges([{ id: 'x', title: 't' }]), /test/);
  assert.throws(() => normalizeBadges([{ ...extra, id: 'first-step' }]), /겹쳐요/);
  const state = badgeState({ collections: { shapes: { count: 2, total: 3 } } });
  assert.deepEqual(evaluateBadges(defs, state).map((b) => b.id), ['finder']);
  const errors = [];
  const broken = normalizeBadges([{ ...extra, test: () => { throw new Error('고장'); } }]);
  assert.deepEqual(evaluateBadges(broken, state, {}, { onError: (e) => errors.push(e.message) }).map((b) => b.id), []);
  assert.deepEqual(errors, ['고장']);
});

test('한 판 점수: 설명은 문항마다 한 번(맞을 때만) +2, 살펴봄은 횟수만, 새로 찾음 +5', () => {
  const play = createPlayReward();
  assert.equal(play.event('explain', { correct: true, itemId: 1 }), 2);
  assert.equal(play.event('explain', { correct: true, itemId: 1 }), 0);
  assert.equal(play.event('explain', { correct: false, itemId: 2 }), 0);
  assert.equal(play.event('inspect'), 0);
  assert.equal(play.discovered(), 5);
  play.answer(ok('a'));
  assert.equal(play.xp(), 2 + 5 + 2);
  const s = play.summary();
  assert.deepEqual([s.explain, s.discover, s.inspect], [{ count: 1, xp: 2 }, { count: 1, xp: 5 }, 1]);
});

test('설명(explain)은 itemId가 있어야 점수: 없으면 몇 번을 불러도 0 (D2 Review 고치면 좋음 2)', () => {
  const play = createPlayReward();
  for (let i = 0; i < 10; i += 1) assert.equal(play.event('explain', { correct: true }), 0);
  assert.equal(play.event('explain', { correct: true, itemId: null }), 0);
  assert.deepEqual(play.summary().explain, { count: 0, xp: 0 });
  assert.equal(play.xp(), 0);
  // itemId가 있으면 문항마다 한 번 +2 (0도 itemId로 본다)
  assert.equal(play.event('explain', { correct: true, itemId: 0 }), 2);
  assert.equal(play.event('explain', { correct: true, itemId: 0 }), 0);
  assert.equal(play.event('explain', { correct: true, itemId: 'q1' }), 2);
  assert.equal(play.xp(), 4);
});

test('도장 상태: 학습 기록(records)과 도감에서 찾은 칸(found)도 받는다 (게임 도장이 기록·도감으로 판정)', () => {
  const state = badgeState({
    collections: { nets: { count: 2, total: 11, found: ['a', 'b'] }, old: { count: 1, total: 3 } },
    records: [{ stageId: 's1', cleared: true, stars: 3, startedAt: 5, answers: [{ itemId: 's1:1', correct: true, given: 'no', expected: 'no', tag: null, atMs: 10 }] }],
  });
  assert.deepEqual(state.collections.nets, { count: 2, total: 11, found: ['a', 'b'] });
  assert.deepEqual(state.collections.old.found, []);
  assert.deepEqual(state.records, [{ stageId: 's1', cleared: true, stars: 3, answers: [{ itemId: 's1:1', correct: true, given: 'no', expected: 'no', tag: null }] }]);
  assert.deepEqual(badgeState({}).records, []);
  const detective = { id: 'd', title: '탐정', desc: '안 되는 것을 2번 맞혀요', test: (s) => s.records.flatMap((r) => r.answers).filter((x) => x.expected === 'no' && x.correct).length >= 2 };
  assert.deepEqual(evaluateBadges(normalizeBadges([detective]), state).map((b) => b.id), []);
  const more = badgeState({ records: [...state.records, { stageId: 's1', answers: [{ correct: true, expected: 'no' }] }] });
  assert.ok(evaluateBadges(normalizeBadges([detective]), more).some((b) => b.id === 'd'));
});

test('저장: 점수·도장·횟수·시간 기록이 남고, 지우면 모두 0. 깨진 값은 비운다', () => {
  const backend = createMemoryBackend();
  const store = createRewardStore({ storage: createStorage('g', backend), now: () => 1000 });
  store.addXp(42);
  store.addCounters({ bounce: 2, retryFix: 1, nonsense: 9 });
  store.earn(['first-step']);
  assert.deepEqual(store.recordTime('ch', 130_000), { ms: 130_000, prevMs: null });
  assert.deepEqual(store.recordTime('ch', 140_000), { ms: 140_000, prevMs: 130_000 }); // 더 느리면 바꾸지 않음
  assert.deepEqual(store.recordTime('ch', 118_000), { ms: 118_000, prevMs: 130_000 });

  const again = createRewardStore({ storage: createStorage('g', backend) });
  assert.equal(again.xp(), 42);
  assert.equal(again.rank().name, '탐험가');
  assert.deepEqual(again.counters(), { bounce: 2, retryFix: 1, explain: 0, inspect: 0, discover: 0 });
  assert.deepEqual(again.badges(), { 'first-step': { at: 1000 } });
  assert.equal(again.best('ch'), 118_000);
  // 게임 모음 "이어 하기"용으로 칭호 이름도 저장한다
  assert.equal(createStorage('g', backend).get('rewards').rank, '탐험가');

  again.reset();
  const cleared = createRewardStore({ storage: createStorage('g', backend) });
  assert.equal(cleared.xp(), 0);
  assert.deepEqual(cleared.badges(), {});
  assert.equal(cleared.best('ch'), null);

  assert.deepEqual(normalizeRewardState({ xp: '-3', badges: [1], counters: { bounce: 'x' }, best: { a: { ms: -1 } } }),
    { v: 1, xp: 0, badges: {}, counters: { bounce: 0, retryFix: 0, explain: 0, inspect: 0, discover: 0 }, best: {} });
  assert.equal(normalizeRewardState('깨짐').xp, 0);
});
