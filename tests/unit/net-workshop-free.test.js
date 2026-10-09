import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRng } from '../../src/shared/core/random.js';
import { XP, createPlayReward, stageXp } from '../../src/shared/core/rewards.js';
import { SYMMETRY_COUNT, LABELS, checkNet, fromCells, isConnected, polyominoes, transformCells } from '../../src/games/net-workshop/fold.js';
import {
  BOARD_SIZES,
  DEX_STAR_AT,
  DEX_STOP_MIN,
  FREE_EXPECTED,
  FREE_FOLD_NOTES,
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
  dexHighlights,
  dexItemName,
  dexMilestone,
  dexNextStar,
  dexStars,
  dexStats,
  explainProblem,
  freeFeedback,
  freeHighlights,
  freeStars,
  freeStats,
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

test('judgeFree: 예상 없이 놓고 접는다 — 정육면체가 되면 맞음, 안 되면 그 까닭의 tag (겹침 → 면이 겹침, 2×2 → 한 꼭짓점에 세 면)', () => {
  const valid = shift(byName('2-3-1b').cells, 1, 1);
  const line = byName('line5-d').cells;
  const block = byName('block-a').cells;
  const made = judgeFree({ cells: valid, labels: L6 });
  assert.deepEqual([made.correct, made.valid, made.tag, made.kind, made.name], [true, true, null, 'new', '2-3-1b']);
  assert.equal(made.title, '새 전개도 발견');
  assert.equal(made.message, '처음 찾은 전개도예요. 2-3-1 모양도 정육면체의 전개도예요.');
  const overlap = judgeFree({ cells: line, labels: L6 });
  assert.deepEqual([overlap.correct, overlap.valid, overlap.tag, overlap.kind], [false, false, TAGS.overlap, 'invalid']);
  assert.equal(overlap.title, '정육면체가 안 돼요');
  assert.match(overlap.message, /^[가-바] 면과 [가-바] 면이 같은 자리에 겹쳐요\. 그래서 다른 한쪽이 비어요\.$/);
  assert.equal(judgeFree({ cells: block, labels: L6 }).tag, TAGS.vertex);
  // 도감에 이미 있으면 known: "도감 n번과 같은 모양"
  const known = judgeFree({ cells: valid, labels: L6, dex: new Set(['2-3-1b']) });
  assert.deepEqual([known.kind, known.correct, known.title], ['known', true, '정육면체가 돼요']);
  assert.equal(known.message, '도감 8번과 같은 모양이에요. 돌리거나 뒤집으면 똑같아요.');
  // 판정은 판별 단계와 같은 checkNet. 35가지 모두: 맞음 = 정육면체가 됨, tag는 안 되는 모양에만(오개념 표의 말)
  for (const n of [...CUBE_NETS, ...INVALID_HEXOMINOES]) {
    const r = judgeFree({ cells: n.cells, labels: L6 });
    assert.equal(r.valid, checkNet(fromCells(n.cells, { labels: L6 })).ok, n.name);
    assert.equal(r.correct, r.valid, n.name);
    assert.equal(r.name, n.name);
    assert.equal(r.tag, r.valid ? null : n.reason === 'vertex-full' ? TAGS.vertex : TAGS.overlap, n.name);
    // spec 16-12: 예상하기가 없다 — 문장에 예상·예측·"틀렸다"는 말이 없다
    for (const text of [r.title, r.message]) assert.doesNotMatch(text, /예상|예측|틀렸|틀림|오답|정답/, `${n.name}: ${text}`);
  }
  assert.equal(FREE_EXPECTED, '전개도');
  // 놓는 판 아래 안내는 접은 뒤에도 문서에 (숨겨져) 남는다: 예상도, 까닭 낱말(까닭을 고르는 동안 드러나면 안 되는 말)도 쓰지 않는다
  for (const text of Object.values(FREE_FOLD_NOTES)) assert.doesNotMatch(text, /예상|예측|겹|네 면|한 점|모여|모이|비어|꼭짓점/, text);
});

test('같은 판에서 같은 모양(돌리거나 뒤집어도)을 다시 접으면 기록하지 않는다(log: false, itemId 없음)', () => {
  const s = createFreeSession();
  const cross = byName('1-4-1e').cells;
  const first = s.fold(shift(cross, 1, 1), L6);
  assert.equal(first.log, true);
  assert.equal(first.itemId, 'cube-free:1:1-4-1e');
  for (let k = 1; k < SYMMETRY_COUNT; k += 1) {
    const again = s.fold(transformCells(cross, k), L6);
    assert.deepEqual([again.log, again.itemId, again.kind, again.collect], [false, null, 'repeat', null], `k=${k}`);
    assert.match(again.message, /이미 접어 본 모양/);
  }
  const next = s.fold(byName('line5-a').cells.map(([x, y]) => [x, y + 2]), L6);
  assert.equal(next.itemId, 'cube-free:2:line5-a'); // 순번은 기록한 것만 센다
  // 안 되는 모양도 같은 판에서 다시 접으면 기록하지 않고, 까닭 고르기도 다시 묻지 않는다
  const invalidAgain = s.fold(transformCells(byName('line5-a').cells, 1), L6);
  assert.deepEqual([invalidAgain.log, invalidAgain.kind, invalidAgain.explainable, invalidAgain.collect], [false, 'repeat', false, null]);
  assert.deepEqual(freeSummary(s.history()), { shapes: 2, found: 1, newNets: 1, newNotes: 1, fixes: 0 });
});

test('목표: 서로 다른 전개도 3가지 (도감에 이미 있던 것도 센다), 안 되는 모양은 노트에. 별은 이번 판에 찾은 전개도 수(안 되는 모양과 무관)', () => {
  const s = createFreeSession({ dex: ['1-4-1e', '3-3'] });
  const r1 = s.fold(byName('1-4-1e').cells, L6);
  assert.deepEqual([r1.kind, r1.collect, r1.found, r1.done], ['known', null, 1, false]);
  const r2 = s.fold(byName('same-side-a').cells, L6);
  assert.deepEqual([r2.kind, r2.collect, r2.found, r2.explainable], ['invalid', { id: 'cube-non-nets', item: 'same-side-a', isNew: true }, 1, true]);
  const r3 = s.fold(byName('3-3').cells, L6);
  assert.deepEqual([r3.kind, r3.found, r3.fixed], ['known', 2, true]); // 안 된 뒤 바로 전개도: 고쳐서 다시 도전
  const r4 = s.fold(byName('2-2-2').cells, L6);
  assert.deepEqual([r4.kind, r4.collect, r4.found, r4.done, r4.correct], ['new', { id: 'cube-nets', item: '2-2-2', isNew: true }, 3, true, true]);
  assert.equal(FREE_GOAL, 3);
  assert.equal(s.done(), true);
  assert.deepEqual(freeSummary(s.history()), { shapes: 4, found: 3, newNets: 1, newNotes: 1, fixes: 1 });
  // 안 되는 모양을 접으면 늘 까닭 고르기가 나온다(예상이 없으므로 "맞혔을 때만"이 아니다)
  assert.equal(s.fold(byName('line5-b').cells, L6).explainable, true);
  // 별: 찾은 전개도 1 · 2 · 3가지 → 별 1 · 2 · 3개. 안 되는 모양을 아무리 접어도 깎이지 않는다 (spec 16-12)
  assert.deepEqual([0, 1, 2, 3, 4, 11].map(freeStars), [0, 1, 2, 3, 3, 3]);
  assert.equal(freeStars(freeSummary(s.history()).found), 3);
  // 결과의 기록 칸: 정답률 대신 찾은 전개도 · 접어 본 모양
  assert.deepEqual(freeStats(freeSummary(s.history())), [{ label: '찾은 전개도', value: '3가지' }, { label: '접어 본 모양', value: '5가지' }]);
});

test('힌트 그림자: 늘 이번 판에서 아직 못 찾은 유효 전개도이고, 판(7×5, 6×6) 가운데에 들어간다. 도감 주문은 도감에 없는 전개도', () => {
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
    // 도감 주문(화면은 hintNet(도감, 도감)을 쓴다): 도감에 없는 전개도만, 도감이 가득 차면 없음
    const forDex = hintNet(dex, dex);
    if (dex.size < 11) assert.ok(forDex && !dex.has(forDex.name), `trial ${trial}`);
    else assert.equal(forDex, null);
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

// ── 점수: 학습 행동에만, 모양마다 한 번만 (직접 만드는 단계: 내 맘대로 전개도·도감 주문. spec 16-8·16-9·16-12) ─────────────────

/** 도감·노트에 처음 등록할 때의 점수 (main.js의 collections: 전개도 도감은 엔진 기본 +5, 노트는 NOTE_XP) */
const collectXp = (id) => (id === 'cube-non-nets' ? NOTE_XP : XP.discover);
const DEX_TOTAL = CUBE_NETS.length;
const FREE = 'cube-free';
const DEX = 'cube-dex';

/**
 * 직접 만드는 단계 한 판을 엔진 점수 규칙(createPlayReward + stageXp)으로 계산한다. 화면(play-free.js)과 같은 순서:
 * 도감·노트 등록 → 접기 기록(정육면체가 되면 맞음. 처음 접는 모양은 scored: 'once', 이미 접어 본 모양은 scored: false) → 까닭 설명.
 *   stage: 'cube-free'(내 맘대로 전개도) | 'cube-dex'(도감 주문), dex·note: 이 기기에 저장된 도감·노트(두 단계가 함께 쓴다),
 *   startStars: 판을 시작할 때 이 단계의 별, explain: 까닭 고르기 'right' | 'wrong' | 'skip' (접기마다 fold.explain으로 따로 줄 수도 있다),
 *   finished: false면 중간에 나간 판(← 단계 선택·새로 고침). 그 자리에서 저장된 몫(play.instant(): 등록 + 처음 접는 모양의
 *     만들기 성공·설명 점수)은 남고, 단계 완료·별 점수는 없다 (spec 16-9, N1c-3)
 * 끝낼 수 있는 조건(화면과 같다): 내 맘대로 전개도는 이번 판에 전개도 3가지, 도감 주문은 도감 6칸 — 못 채웠으면 마친 것으로 치지 않는다.
 * 별: 내 맘대로 전개도 = 이번 판에 찾은 전개도 수(3가지 = 별 3개), 도감 주문 = 도감 수(6·9·11칸)
 * → { xp(이 판으로 저장되는 점수), play(단계 완료·별 점수를 뺀 이번 판 점수), stage, stars, finished, entries, earned(갈래별), explainCount, session }
 */
function freePlayXp(folds, { stage = FREE, dex = [], note = [], explain = 'right', startStars = 0, finished = true } = {}) {
  const dexMode = stage === DEX;
  const session = createFreeSession({ stageId: stage, dex, note, dexGoal: dexMode ? DEX_TOTAL : null });
  const play = createPlayReward({ startStars });
  const earned = { answer: 0, nets: 0, notes: 0, explain: 0 };
  let explainCount = 0;
  for (const fold of folds) {
    const step = session.fold(fold.cells, L6);
    let before = play.xp();
    if (step.collect?.isNew) play.discovered(collectXp(step.collect.id));
    earned[step.valid ? 'nets' : 'notes'] += play.xp() - before;
    before = play.xp();
    if (step.log) play.answer({ itemId: step.itemId, correct: step.valid, scored: step.first ? 'once' : false });
    earned.answer += play.xp() - before;
    const pick = fold.explain ?? explain;
    if (step.explainable && pick !== 'skip') {
      earned.explain += play.event('explain', { correct: pick === 'right', itemId: step.itemId });
      if (pick === 'right') explainCount += 1;
    }
    // 직접 만드는 단계의 점수는 모두 그 자리에서 저장되는 몫이다(처음 접는 모양의 기록·설명 + 등록). 판을 마칠 때 더 저장할 답 점수가 없다
    assert.equal(play.instant(), play.xp());
  }
  const dexCount = session.dex().size;
  const canFinish = dexMode ? dexCount >= DEX_STOP_MIN : session.found().size >= FREE_GOAL;
  const done = finished && canFinish;
  const stars = dexMode ? dexStars(dexCount) : freeStars(session.found().size);
  const stageGain = done ? stageXp({ prevStars: startStars, stars, cleared: true, challenge: dexMode }).total : 0;
  return {
    xp: play.xp() + stageGain, play: play.xp(), stage: stageGain, stars: done ? stars : 0, finished: done,
    entries: play.summary().answers.attempts, earned, explainCount, session,
  };
}

/** 한 기기에서 여러 판: 도감·노트는 판과 단계를 넘어 이어지고, 별은 단계마다 따로다 (엔진의 저장과 같게) */
function createDevice() {
  let dex = [];
  let note = [];
  const stars = { [FREE]: 0, [DEX]: 0 };
  let total = 0;
  let shapeXp = 0;
  return {
    play(folds, options = {}) {
      const stage = options.stage ?? FREE;
      const r = freePlayXp(folds, { dex, note, startStars: stars[stage], ...options, stage });
      dex = [...r.session.dex()];
      note = [...r.session.note()];
      if (r.finished) stars[stage] = Math.max(stars[stage], r.stars);
      total += r.xp;
      shapeXp += r.play;
      return r;
    },
    total: () => total,
    /** 모양으로 받은 점수(만들기 성공·연속·다시 일어서기·까닭 설명·등록)만: 단계 완료·별 점수를 뺀 것 */
    shapeXp: () => shapeXp,
    stars: (stage = FREE) => stars[stage],
    shapes: () => [...dex, ...note],
    dexCount: () => dex.length,
  };
}

const ALL_SHAPES = [...CUBE_NETS, ...INVALID_HEXOMINOES];
const isNet = (n) => CUBE_NETS.includes(n);
/** 모양들을 그대로 접는다. 안 되는 모양의 까닭 고르기는 explain대로(기본: 맞힘) */
const foldsOf = (list, explain = undefined) => list.map((n) => ({ cells: n.cells, ...(explain ? { explain } : {}) }));
const FREE_STAGE_XP = XP.stageClear + 3 * XP.perStar; // 내 맘대로 전개도를 처음 마침: 단계 완료 5 + 별 3개 6
const NET_XP = XP.first + XP.discover; // 되는 전개도 하나: 만들기 성공 2 + 도감 5
const NON_NET_XP = NOTE_XP + XP.explain; // 안 되는 모양 하나: 노트 1 + 까닭 설명 2

/**
 * 독립 계산 (엔진의 rewards.js·logic.js의 판 흐름을 쓰지 않는다): spec 16-8·16-9·16-12와 engine.md 점수 표만 보고 짠 한 기기의 점수.
 * 모양은 이름으로만 본다(되는 전개도인지는 자료 표로). 한 판:
 *   - 이번 판에 이미 접은 모양: 아무 일도 없다(기록도 없다)
 *   - 이 기기에서 처음 접는 모양(어느 단계에서든): 되는 전개도 = 도감 +5, 만들기 성공 +2, 처음 접는 전개도를 연달아 3번마다 +1,
 *     앞에서 처음 접은 안 되는 모양이 있었으면 다시 일어서기 +1(한 번) / 안 되는 모양 = 노트 +1, 까닭을 맞히면 +2, 연속은 끊기고 다시 일어서기 기회가 생긴다
 *   - 접어 본 모양: 0점. 안 되는 모양이면 연속만 끊긴다
 *   - 마치면: 내 맘대로 전개도(이번 판에 전개도 3가지)는 별 3개 — 처음 마칠 때 5 + 6. 도감 주문(도감 6칸부터)은 처음 +10, 별(6·9·11칸)이 늘어난 만큼 +2씩
 */
function createModelDevice() {
  const seen = new Set();
  const dex = new Set();
  const stars = { [FREE]: 0, [DEX]: 0 };
  let total = 0;
  let shapeXp = 0;
  return {
    play(names, { stage = FREE, explain = 'right', finished = true, explains = null } = {}) {
      const inPlay = new Set();
      const foundNow = new Set();
      let run = 0;
      let armed = false;
      let xp = 0;
      names.forEach((name, i) => {
        if (inPlay.has(name)) return;
        inPlay.add(name);
        const valid = CUBE_NETS.some((n) => n.name === name);
        const first = !seen.has(name);
        seen.add(name);
        if (valid) {
          foundNow.add(name);
          dex.add(name);
          if (!first) return;
          xp += 5 + 2;
          run += 1;
          if (run % 3 === 0) xp += 1;
          if (armed) {
            armed = false;
            xp += 1;
          }
          return;
        }
        run = 0;
        if (!first) return;
        xp += 1;
        armed = true;
        if ((explains?.[i] ?? explain) === 'right') xp += 2;
      });
      shapeXp += xp;
      total += xp;
      let stageGain = 0;
      if (finished) {
        if (stage === FREE && foundNow.size >= 3) {
          stageGain = (stars[FREE] === 0 ? 5 : 0) + (3 - stars[FREE]) * 2;
          stars[FREE] = 3;
        }
        if (stage === DEX && dex.size >= 6) {
          const now = dex.size >= 11 ? 3 : dex.size >= 9 ? 2 : 1;
          if (now > stars[DEX]) {
            stageGain = (stars[DEX] === 0 ? 10 : 0) + (now - stars[DEX]) * 2;
            stars[DEX] = now;
          }
        }
      }
      total += stageGain;
      return { xp: xp + stageGain, play: xp, stage: stageGain };
    },
    total: () => total,
    shapeXp: () => shapeXp,
    stars: (stage = FREE) => stars[stage],
  };
}

/** 모양 묶음으로 받을 수 있는 모양 점수의 위쪽 끝: 모양마다 한 번(전개도 7, 안 되는 모양 3) + 연속(전개도 3개마다 1) + 다시 일어서기(안 되는 모양 하나에 한 번) */
function shapeXpBound(names) {
  const list = [...new Set(names)].map(byName);
  const nets = list.filter(isNet).length;
  const others = list.length - nets;
  return nets * NET_XP + others * NON_NET_XP + Math.floor(nets / XP.streakEvery) * XP.streakBonus + Math.min(nets, others) * XP.bounce;
}

/** 헥소미노 하나를 판 위 아무 데나 아무 방향으로 */
function randomFold(rng, pool) {
  const n = rng.pick(pool);
  const cells = transformCells(n.cells, rng.int(0, SYMMETRY_COUNT - 1));
  return { n, cells: shift(cells, rng.int(0, 1), rng.int(0, 2)), explain: rng.pick(['right', 'right', 'wrong', 'skip']) };
}

/** 무작위 판 묶음: 모양 순서, 판 나눔, 단계(내 맘대로 전개도·도감 주문), 나가기 */
function randomPlays(rng, { stages = [FREE, DEX], exitRate = 0.2 } = {}) {
  const pool = rng.sample(ALL_SHAPES, rng.int(3, 35));
  const plays = [];
  for (let left = rng.int(3, 45); left > 0;) {
    const size = Math.min(left, rng.int(1, 9));
    plays.push({ folds: Array.from({ length: size }, () => randomFold(rng, pool)), stage: rng.pick(stages), finished: rng.next() >= exitRate });
    left -= size;
  }
  return plays;
}

test('점수 표(spec 16-12): 되는 전개도를 처음 접으면 만들기 성공 +2 · 도감 +5, 안 되는 모양은 노트 +1 · 까닭을 맞히면 +2 — 되는 전개도 하나가 늘 더 크다', () => {
  assert.deepEqual([NOTE_XP, XP.discover, XP.first, XP.explain], [1, 5, 2, 2]);
  for (const n of ALL_SHAPES) {
    const one = freePlayXp(foldsOf([n]));
    assert.deepEqual(one.earned, isNet(n) ? { answer: 2, nets: 5, notes: 0, explain: 0 } : { answer: 0, nets: 0, notes: 1, explain: 2 }, n.name);
    assert.equal(one.play, isNet(n) ? NET_XP : NON_NET_XP, n.name);
    // 까닭을 틀리거나 넘어가면 노트 +1뿐
    if (!isNet(n)) for (const pick of ['wrong', 'skip']) assert.equal(freePlayXp(foldsOf([n], pick)).play, NOTE_XP, n.name);
  }
  assert.ok(NET_XP > NON_NET_XP + XP.bounce); // 안 되는 모양이 열어 주는 다시 일어서기 +1을 더해도 전개도 하나보다 작다
  // 연속·다시 일어서기는 엔진 규칙대로: 처음 접는 전개도를 연달아 3번 → +1, 처음 접은 안 되는 모양 뒤의 새 전개도 → +1
  const three = freePlayXp(foldsOf(['1-4-1e', '2-3-1a', '3-3'].map(byName)));
  assert.deepEqual([three.earned.answer, three.play, three.xp, three.stars], [3 * 2 + 1, 22, 22 + FREE_STAGE_XP, 3]);
  const bounce = freePlayXp(foldsOf(['line5-a', '1-4-1e'].map(byName)));
  assert.deepEqual(bounce.earned, { answer: 2 + 1, nets: 5, notes: 1, explain: 2 });
  // 접어 본 안 되는 모양은 다시 일어서기를 열지 않는다(연속만 끊는다)
  const known = freePlayXp(foldsOf(['line5-a', '1-4-1e'].map(byName)), { note: ['line5-a'] });
  assert.deepEqual(known.earned, { answer: 2, nets: 5, notes: 0, explain: 0 });
});

test('무작위 3,000기기: 내 맘대로 전개도와 도감 주문을 오가며 접은 점수(판마다, 쌓인 점수)가 독립 계산과 같다', () => {
  const rng = createRng('free-model');
  let plays = 0;
  let dexPlays = 0;
  let exits = 0;
  for (let trial = 0; trial < 3000; trial += 1) {
    const device = createDevice();
    const model = createModelDevice();
    for (const p of randomPlays(rng)) {
      const got = device.play(p.folds.map((f) => ({ cells: f.cells, explain: f.explain })), { stage: p.stage, finished: p.finished });
      const want = model.play(p.folds.map((f) => f.n.name), { stage: p.stage, finished: p.finished, explains: p.folds.map((f) => f.explain) });
      assert.deepEqual([got.xp, got.play, got.stage], [want.xp, want.play, want.stage], `기기 ${trial} 판 ${plays}`);
      plays += 1;
      if (p.stage === DEX) dexPlays += 1;
      if (!p.finished) exits += 1;
    }
    assert.equal(device.total(), model.total(), `기기 ${trial}`);
    assert.deepEqual([device.stars(FREE), device.stars(DEX)], [model.stars(FREE), model.stars(DEX)], `기기 ${trial}`);
    assert.ok(device.shapeXp() <= shapeXpBound(device.shapes()), `기기 ${trial}`);
  }
  assert.ok(plays > 10000 && dexPlays > 4000 && exits > 1500, `${plays}판 · 도감 주문 ${dexPlays} · 나감 ${exits}`);
});

test('자유 배치: 같은 모양을 돌리거나 뒤집어 다시 놓아도 점수·기록이 늘지 않는다', () => {
  const rng = createRng('free-repeat');
  for (const n of ALL_SHAPES) {
    const once = freePlayXp([{ cells: n.cells }]);
    const many = freePlayXp(Array.from({ length: 8 }, (_, k) => ({ cells: shift(transformCells(n.cells, k), rng.int(0, 1), rng.int(0, 2)) })));
    assert.equal(many.xp, once.xp, n.name);
    assert.equal(many.entries, 1, n.name);
  }
});

test('정육면체 차시 전체(판별 5 · 마주 보는 면 4 · 면 붙이기 3 · 내 맘대로 전개도)를 모두 맞히면 99점: 칭호가 한 번 오른다 (견습생 → 솜씨꾼, 40점↑ 100점 미만)', () => {
  const perfect = (n, explains = 0) => {
    const play = createPlayReward();
    for (let i = 0; i < n; i += 1) play.answer({ itemId: i, correct: true });
    for (let i = 0; i < explains; i += 1) play.event('explain', { correct: true, itemId: i });
    return play.xp() + stageXp({ prevStars: 0, stars: 3 }).total;
  };
  const free = freePlayXp(foldsOf(['1-4-1e', '2-3-1a', '3-3'].map(byName))).xp;
  assert.deepEqual([perfect(5, 3), perfect(4), perfect(3), free], [28, 20, 18, 33]);
  assert.equal(perfect(5, 3) + perfect(4) + perfect(3) + free, 99);
  // 내 맘대로 전개도에서 안 되는 모양 2가지를 더 접어 까닭까지 맞히면 +6(+ 다시 일어서기 0~2)
  const more = ['line5-a', '1-4-1e', 'block-b', '2-3-1a', '3-3'].map(byName);
  assert.equal(freePlayXp(foldsOf(more)).xp, 3 * NET_XP + 2 * NON_NET_XP + 2 * XP.bounce + FREE_STAGE_XP); // 21 + 6 + 2 + 11 = 40 (연속은 끊긴다)
  assert.equal(freePlayXp(foldsOf(['1-4-1e', '2-3-1a', '3-3', 'line5-a', 'block-b'].map(byName))).xp, 33 + 6);
});

// ── 모양마다 한 번만 (spec 16-8, N1-2) ─────────────────

test('모양마다 한 번만: 같은 모양(돌리거나 뒤집어도)을 다른 판·다른 단계에서 다시 접으면 만들기 성공·등록·까닭 설명 점수가 모두 0점', () => {
  const rng = createRng('free-once');
  for (const n of ALL_SHAPES) {
    for (const [firstStage, againStage] of [[FREE, FREE], [FREE, DEX], [DEX, FREE], [DEX, DEX]]) {
      const device = createDevice();
      const first = device.play(foldsOf([n]), { stage: firstStage });
      // 처음 접을 때: 전개도 = 만들기 성공 2 + 발견 5, 안 되는 모양 = 노트 1 + 까닭 설명 2
      assert.equal(first.play, isNet(n) ? 7 : 3, n.name);
      for (let k = 0; k < SYMMETRY_COUNT; k += 1) {
        const cells = shift(transformCells(n.cells, k), rng.int(0, 1), rng.int(0, 1));
        const step = createFreeSession({ stageId: againStage, dex: device.shapes(), note: device.shapes() }).fold(cells, L6);
        assert.deepEqual([step.first, step.log, step.name], [false, true, n.name], `${n.name} k=${k}`); // 기록에는 넣는다
        const again = device.play([{ cells }], { stage: againStage });
        assert.equal(again.play, 0, `${n.name} ${firstStage} → ${againStage} k=${k}`);
        assert.equal(again.xp, 0, `${n.name} ${firstStage} → ${againStage} k=${k}`); // 한 모양으로는 판을 마칠 수도 없다
        assert.equal(again.entries, 1);
      }
      assert.equal(device.total(), isNet(n) ? 7 : 3, n.name);
    }
  }
});

test('판 중간에 나가도 처음 접은 모양의 점수는 남고(N1c-3), 같은 모양으로 두 번 받지 못한다. 까닭을 틀린 모양은 나중에 맞혀도 0점', () => {
  const nets3 = ['1-4-1e', '2-3-1a', '3-3'].map(byName);
  for (const n of ALL_SHAPES) {
    const group = [n, ...nets3.filter((x) => x !== n)].slice(0, isNet(n) ? 3 : 4); // 이 모양 + 전개도 3가지(판을 마칠 수 있게)
    const full = createDevice().play(foldsOf(group)).xp; // 나가지 않고 끝까지
    // 판 중간에 나감(← 단계 선택·새로 고침): 만들기 성공·설명·등록 점수가 그 자리에서 저장돼 남는다
    const quitter = createDevice();
    assert.equal(quitter.play(foldsOf(group), { finished: false }).xp, full - FREE_STAGE_XP, n.name);
    // … 다시 와서 같은 모양을 접으면 0점, 마치면 단계 완료·별 점수만. 나갔다 온 쪽이 끝까지 한 쪽보다 더 받지도, 덜 받지도 않는다
    assert.deepEqual([quitter.play(foldsOf(group)).play, quitter.total()], [0, full], n.name);
    // 나가기를 몇 번 되풀이해도 그대로
    const looper = createDevice();
    for (let i = 0; i < 4; i += 1) looper.play(foldsOf(group), { finished: false });
    assert.equal(looper.total(), full - FREE_STAGE_XP, n.name);
    assert.equal(looper.play(foldsOf(group)).xp, FREE_STAGE_XP, n.name);
    assert.equal(looper.total(), full, n.name);
  }
  for (const n of INVALID_HEXOMINOES) {
    // 까닭을 틀리게 골랐거나 넘어간 모양: 노트 +1뿐 → 다른 판에서 까닭을 맞혀도 0점 (모양은 이미 접어 본 모양)
    for (const pick of ['wrong', 'skip']) {
      const device = createDevice();
      assert.equal(device.play(foldsOf([n], pick), { finished: false }).xp, NOTE_XP, n.name);
      assert.deepEqual(device.play(foldsOf([n])).earned, { answer: 0, nets: 0, notes: 0, explain: 0 }, n.name);
      assert.equal(device.total(), NOTE_XP, n.name);
    }
  }
});

test('35가지를 모두 탐구하면 한 번씩만 보상: 한 판에 전개도 먼저 163점 · 번갈아 171점(가장 큼), 다시 하면 0점, 까닭을 고르지 않으면 115점', () => {
  // 전개도 11가지를 먼저(도감 순서): 11 × (2 + 5) + 연속 3번(11 ÷ 3) + 안 되는 모양 24 × (1 + 2) + 단계 완료 5 + 별 3개 6
  const device = createDevice();
  const all = device.play(foldsOf(ALL_SHAPES));
  assert.deepEqual(all.earned, { answer: 11 * 2 + 3, nets: 55, notes: 24, explain: 48 });
  assert.equal(all.play, 77 + 3 + 72);
  assert.equal(all.xp, 163);
  // 같은 35가지를 다시(돌려서) 접어도, 몇 판을 더 해도, 도감 주문으로 가도 모양 점수는 0점
  for (let round = 1; round <= 3; round += 1) {
    const again = device.play(ALL_SHAPES.map((n) => ({ cells: transformCells(n.cells, round) })));
    assert.equal(again.xp, 0, `${round}번째 다시 하기`);
    assert.equal(again.entries, 35);
  }
  assert.equal(device.total(), 163);
  const inDex = device.play(foldsOf(ALL_SHAPES), { stage: DEX });
  assert.deepEqual([inDex.play, inDex.xp], [0, XP.challenge + 3 * XP.perStar]); // 도감 주문을 처음 마친 점수(도감 11칸 = 별 3개)만
  assert.equal(device.play(foldsOf(ALL_SHAPES), { stage: DEX }).xp, 0);
  // 가장 많이 받는 순서: 안 되는 모양과 전개도를 번갈아(전개도마다 다시 일어서기 +1) → 77 + 72 + 11 + 11 = 171
  const mixed = [];
  CUBE_NETS.forEach((n, i) => mixed.push(INVALID_HEXOMINOES[i], n));
  mixed.push(...INVALID_HEXOMINOES.slice(CUBE_NETS.length));
  const best = createDevice().play(foldsOf(mixed));
  assert.equal(best.xp, 171);
  assert.equal(best.play, shapeXpBound(ALL_SHAPES.map((n) => n.name)) - 3); // 연속과 다시 일어서기를 함께 다 받을 수는 없다
  // 까닭을 하나도 고르지 않으면(넘어가기): 163 − 48
  assert.equal(createDevice().play(foldsOf(ALL_SHAPES, 'skip')).xp, 115);
  // 여러 판에 나눠 탐구해도(5가지씩 7판) 한 판에 한 것보다 많지 않다: 연속이 판마다 끊긴다
  const split = createDevice();
  for (let i = 0; i < ALL_SHAPES.length; i += 5) split.play(foldsOf(ALL_SHAPES.slice(i, i + 5)));
  assert.equal(split.shapes().length, 35);
  assert.equal(split.total(), 77 + 72 + 2 + FREE_STAGE_XP); // 162: 판 1·2에 전개도 5가지씩(연속 +1씩), 판 3의 11번째 전개도는 연속이 새로 시작된다
  assert.ok(split.total() < 163);
  const model = createModelDevice();
  for (let i = 0; i < ALL_SHAPES.length; i += 5) model.play(ALL_SHAPES.slice(i, i + 5).map((n) => n.name));
  assert.equal(split.total(), model.total());
});

test('별 3개를 받은 뒤에도 처음 접는 모양은 점수를 그대로 받고(spec 16-9), 접어 본 모양은 0점 — 판을 나눠 탐구해도 손해가 없다', () => {
  const device = createDevice();
  assert.equal(device.play(foldsOf(CUBE_NETS.slice(0, 3))).xp, 33);
  assert.equal(device.stars(), 3);
  // 별 3개를 받은 뒤의 판: 새 전개도 1 + 새 안 되는 모양 2 + 접어 본 십자. 전개도가 3가지가 안 돼 판을 마치지 못해도 모양 점수는 남는다
  const replay = device.play(foldsOf(['2-2-2', 'line5-a', 'block-a', '1-4-1a'].map(byName)));
  assert.deepEqual(replay.earned, { answer: 2, nets: 5, notes: 2, explain: 4 });
  assert.deepEqual([replay.xp, replay.stage], [13, 0]);
  // 같은 판을 별 0개에서 시작했을 때와 모양 점수가 같다 (별은 처음 접는 모양의 점수에 영향이 없다)
  const fresh = freePlayXp(foldsOf(['2-2-2', 'line5-a', 'block-a', '1-4-1a'].map(byName)), { dex: CUBE_NETS.slice(0, 3).map((n) => n.name) });
  assert.deepEqual(fresh.earned, replay.earned);
  // 다시 일어서기도: 새 안 되는 모양 뒤에 새 전개도를 만들면 +1
  const bounce = device.play(foldsOf(['line5-b', '1-4-1d'].map(byName)));
  assert.deepEqual(bounce.earned, { answer: XP.first + XP.bounce, nets: 5, notes: 1, explain: 2 });
  // 접어 본 모양만 다시 접는 판은 0점 (몇 번을 해도)
  for (let i = 0; i < 3; i += 1) {
    const again = device.play(foldsOf(['2-2-2', 'line5-a', 'block-a', '1-4-1a', 'line5-b', '1-4-1d'].map(byName)));
    assert.deepEqual([again.play, again.xp], [0, 0]);
  }
  assert.match(FREE_REPLAY_NOTE, /^처음 접는 모양은 점수를 받아요\. 접어 본 모양은 다시 접어도 점수가 없어요\.$/);
  // 첫 판에 전개도 3가지(33점, 별 3개) → 나머지 32가지를 4가지씩: 전개도 8 × 7 + 안 되는 모양 24 × 3 + 그 판들의 연속·다시 일어서기
  const flow = createDevice();
  flow.play(foldsOf(CUBE_NETS.slice(0, 3)));
  const rest = ALL_SHAPES.filter((n) => !CUBE_NETS.slice(0, 3).includes(n));
  for (let i = 0; i < rest.length; i += 4) assert.equal(flow.play(foldsOf(rest.slice(i, i + 4))).stage, 0);
  assert.equal(flow.total(), 33 + 8 * 7 + 24 * 3 + 2); // 전개도 4가지씩 두 판에서 연속 +1씩
});

test('무작위 800기기: 판 중간에 나갔다 들어오기를 섞어도 같은 순서로 나가지 않은 쪽보다 더 받지 못한다', () => {
  const rng = createRng('free-exit');
  let fewer = 0;
  for (let trial = 0; trial < 800; trial += 1) {
    const plays = randomPlays(rng, { stages: [FREE], exitRate: 0 });
    const exits = plays.map((_, i) => i < plays.length - 1 && rng.next() < 0.4);
    const run = (p) => p.folds.map((f) => ({ cells: f.cells, explain: f.explain }));
    // 나간 쪽: 표시한 판을 마치지 않고 나간다
    const leaver = createDevice();
    plays.forEach((p, i) => leaver.play(run(p), { finished: !exits[i] }));
    // (가) 같은 판 나눔으로 모든 판을 마친 쪽
    const finisher = createDevice();
    plays.forEach((p) => finisher.play(run(p)));
    // (나) 나가지 않고 그 판을 다음 판까지 이어서 한 쪽
    const stayer = createDevice();
    let carry = [];
    plays.forEach((p, i) => {
      carry = carry.concat(run(p));
      if (!exits[i]) {
        stayer.play(carry);
        carry = [];
      }
    });
    assert.ok(leaver.total() <= finisher.total(), `기기 ${trial}: 나감 ${leaver.total()} > 모두 마침 ${finisher.total()}`);
    assert.equal(leaver.shapeXp(), finisher.shapeXp(), `기기 ${trial}`); // 모양 점수는 그 자리에서 저장되므로 같다
    // 이어서 한 쪽은 연속·다시 일어서기가 끊기지 않아 모양 점수가 같거나 더 크다
    assert.ok(leaver.shapeXp() <= stayer.shapeXp(), `기기 ${trial}: 나감 ${leaver.shapeXp()} > 이어 함 ${stayer.shapeXp()}`);
    // 단계 완료·별 점수(모두 11점)는 판을 마쳐야 받는다: 둘 다 접어 본 전개도 3가지로 한 판을 더 마치면 총점도 나간 쪽이 더 크지 않다
    const top = (device) => {
      const nets = device.shapes().map(byName).filter(isNet);
      const three = [...nets, ...CUBE_NETS.filter((n) => !nets.includes(n))].slice(0, 3);
      device.play(foldsOf(three));
      assert.equal(device.stars(), 3);
      return device.total();
    };
    const [a, b] = [top(leaver), top(stayer)];
    assert.ok(a <= b, `기기 ${trial}: 나감 ${a} > 이어 함 ${b}`);
    assert.ok(a <= shapeXpBound(leaver.shapes()) + FREE_STAGE_XP);
    if (leaver.shapeXp() < stayer.shapeXp()) fewer += 1;
  }
  assert.ok(fewer > 50, '나가면 연속·다시 일어서기가 끊겨 덜 받는 경우가 섞여 있어야 한다');
});

test('무작위 600기기 × 두 단계: 같은 접기를 까닭까지 모두 맞힌 쪽이 까닭을 틀리거나 넘어간 쪽보다 늘 더 받거나 같고, 더 할 것이 없으면 무엇을 접어도 0점', () => {
  const rng = createRng('free-device');
  let lower = 0;
  for (let trial = 0; trial < 600; trial += 1) {
    const plays = randomPlays(rng);
    const good = createDevice();
    const tricky = createDevice();
    plays.forEach((p, i) => {
      good.play(p.folds.map((f) => ({ cells: f.cells })), { stage: p.stage, finished: p.finished });
      tricky.play(p.folds.map((f) => ({ cells: f.cells, explain: f.explain })), { stage: p.stage, finished: p.finished });
      // 판마다, 그때까지 받은 점수도 늘 모두 맞힌 쪽이 크거나 같다 (어느 판에서 그만둬도 손해 없음)
      assert.ok(good.total() >= tricky.total(), `기기 ${trial} 판 ${i}: 모두 맞힘 ${good.total()} < ${tricky.total()}`);
    });
    assert.deepEqual(good.shapes().sort(), tricky.shapes().sort()); // 접어 본 모양은 같다
    assert.ok(good.shapeXp() <= shapeXpBound(good.shapes()), `기기 ${trial}`);
    assert.ok(good.total() <= 160 + FREE_STAGE_XP + XP.challenge + 3 * XP.perStar);
    if (tricky.total() < good.total()) lower += 1;
    // 더 할 것이 없을 때까지 한 뒤: 접어 본 모양은 어느 단계에서 다시 접어도 0점
    for (const stage of [FREE, DEX]) good.play(foldsOf(good.shapes().map(byName)), { stage });
    const before = good.total();
    for (const stage of [FREE, DEX]) assert.equal(good.play(good.shapes().map((name) => ({ cells: transformCells(byName(name).cells, rng.int(0, 7)) })), { stage }).xp, 0, `기기 ${trial}`);
    assert.equal(good.total(), before);
  }
  assert.ok(lower > 300, '까닭을 틀리거나 넘어가면 대개 점수가 낮다');
});

// ── 도전 주문서 "도감 주문" (cube-dex, spec 16-3) ─────────────────

test('도감 주문: 별은 도감 수(6칸 ★1 · 9칸 ★2 · 11칸 ★3), 6칸부터 끝낼 수 있고, 11칸이면 달성. 도감은 판과 단계를 넘어 이어진다', () => {
  assert.deepEqual(DEX_STAR_AT, [6, 9, 11]);
  assert.equal(DEX_STOP_MIN, 6);
  assert.deepEqual(Array.from({ length: 12 }, (_, n) => dexStars(n)), [0, 0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 3]);
  assert.deepEqual([0, 5, 6, 8, 9, 10, 11].map(dexNextStar), [6, 6, 9, 9, 11, 11, null]);
  // 별이 하나 늘어나는 칸에서만 알림(6칸·9칸). 11칸은 달성 문장이 따로 있다
  assert.equal(dexMilestone(5, 6), '도감 6칸! 지금 끝내도 별 1개를 받아요.');
  assert.equal(dexMilestone(8, 9), '도감 9칸! 지금 끝내도 별 2개를 받아요.');
  assert.deepEqual([dexMilestone(6, 7), dexMilestone(4, 5), dexMilestone(10, 11)], ['', '', '']);
  // 내 맘대로 전개도에서 찾은 3가지가 도감 주문에 이어진다: 3가지를 더 찾으면 6칸
  const session = createFreeSession({ stageId: DEX, dex: CUBE_NETS.slice(0, 3).map((n) => n.name), dexGoal: DEX_TOTAL });
  assert.equal(session.done(), false);
  const known = session.fold(CUBE_NETS[0].cells, L6);
  assert.deepEqual([known.kind, known.first, known.dexCount, known.done, known.itemId], ['known', false, 3, false, 'cube-dex:1:1-4-1a']);
  let step = null;
  for (const n of CUBE_NETS.slice(3)) {
    step = session.fold(n.cells, L6);
    assert.deepEqual([step.kind, step.first, step.done], ['new', true, step.dexCount >= DEX_TOTAL], n.name);
  }
  assert.deepEqual([step.dexCount, step.done, session.done()], [11, true, true]);
  // 이미 11칸인 학생이 들어오면 처음부터 달성한 상태다
  assert.equal(createFreeSession({ stageId: DEX, dex: CUBE_NETS.map((n) => n.name), dexGoal: DEX_TOTAL }).done(), true);
  // 6칸이 안 되면 마칠 수 없다(점수는 모양 점수만), 6칸부터 마치면 처음 한 번 도전 성공 +10 + 별
  const device = createDevice();
  assert.deepEqual([device.play(foldsOf(CUBE_NETS.slice(0, 5)), { stage: DEX }).stage, device.stars(DEX)], [0, 0]);
  const six = device.play(foldsOf(CUBE_NETS.slice(5, 6)), { stage: DEX });
  assert.deepEqual([six.play, six.stage, device.stars(DEX)], [7, XP.challenge + XP.perStar, 1]);
  // 다시 들어와 더 채우면 별이 오른 만큼만(+2씩). 채우지 않고 다시 끝내면 0점
  assert.equal(device.play([], { stage: DEX }).xp, 0);
  assert.deepEqual([device.play(foldsOf(CUBE_NETS.slice(6, 9)), { stage: DEX }).stage, device.stars(DEX)], [XP.perStar, 2]);
  assert.deepEqual([device.play(foldsOf(CUBE_NETS.slice(9)), { stage: DEX }).stage, device.stars(DEX)], [XP.perStar, 3]);
  assert.equal(device.play(foldsOf(ALL_SHAPES.slice(0, 11)), { stage: DEX }).xp, 0);
  // 내 맘대로 전개도에서 이미 11칸을 모은 학생: 도감 주문에 들어와 바로 끝내도 도전 성공 +10 + 별 3개 +6은 처음 한 번뿐
  const collector = createDevice();
  collector.play(foldsOf(CUBE_NETS));
  assert.deepEqual([collector.play([], { stage: DEX }).xp, collector.play([], { stage: DEX }).xp], [16, 0]);
});

test('도감 주문 결과 칸: 첫 칸은 도감 수와 새 전개도 점수, 칸 점수의 합 = 이번 판 점수, 4칸까지', () => {
  const r = freePlayXp(foldsOf(['1-4-1e', 'line5-a', '2-3-1a', 'block-b', '3-3', '2-2-2', '1-4-1a', '1-4-1b'].map(byName)), { stage: DEX });
  const sum = freeSummary(r.session.history());
  const tiles = dexHighlights(sum, { earned: r.earned, explainCount: r.explainCount, dexCount: 6, dexTotal: 11 });
  assert.deepEqual(tiles.map((t) => [t.label, t.value, t.xp]), [
    ['전개도 도감', '6 / 11', 6 * 7 + 1 + 2], // 전개도 6 × (2 + 5) + 연속 1번 + 다시 일어서기 2번
    ['노트에 적은 모양', '2가지', 2],
    ['까닭 설명', '2번', 4],
    ['다음 별까지', '3칸', undefined],
  ]);
  assert.equal(tiles.reduce((total, t) => total + (t.xp ?? 0), 0), r.play);
  assert.deepEqual(dexStats(sum), [{ label: '새로 찾은 전개도', value: '6가지' }, { label: '접어 본 모양', value: '8가지' }]);
  // 11칸이면 "다음 별까지" 대신 "고쳐서 다시 도전"
  const full = dexHighlights({ ...sum, newNotes: 0 }, { earned: { answer: 0, nets: 0, notes: 0, explain: 0 }, dexCount: 11, dexTotal: 11 });
  assert.deepEqual(full.map((t) => t.label), ['전개도 도감', '고쳐서 다시 도전']);
});

// ── 결과 "오늘의 솜씨" 칸 (N1-4) ─────────────────

test('결과 "오늘의 솜씨": 칸 점수의 합 = 이번 판 점수(칸 합 + 단계 완료·별 = 모은 솜씨 점수), 점수 있는 칸은 빠지지 않고 4칸까지', () => {
  const folds = foldsOf(['1-4-1e', 'line5-a', '2-3-1a', 'block-b', '3-3'].map(byName));
  const r = freePlayXp(folds);
  const tiles = freeHighlights(freeSummary(r.session.history()), r);
  assert.deepEqual(tiles.map((t) => [t.label, t.value, t.xp]), [
    ['새 전개도 발견', '3가지', 3 * 7 + 2], // 만들기 성공 2 × 3 + 도감 5 × 3 + 다시 일어서기 2번
    ['노트에 적은 모양', '2가지', 2],
    ['까닭 설명', '2번', 4],
    ['고쳐서 다시 도전', '2번', undefined],
  ]);
  assert.equal(tiles.reduce((sum, t) => sum + (t.xp ?? 0), 0) + r.stage, r.xp);
  assert.equal(r.xp, 29 + 11);
  // 전개도만 찾은 판
  const nets = freePlayXp(foldsOf(['1-4-1e', '2-3-1a', '3-3'].map(byName)));
  assert.deepEqual(freeHighlights(freeSummary(nets.session.history()), nets).map((t) => [t.label, t.xp]),
    [['새 전개도 발견', 22], ['고쳐서 다시 도전', undefined]]);
  // 칸의 말에 예상·정답률이 없다 (spec 16-12)
  for (const t of tiles) assert.doesNotMatch(`${t.label} ${t.value}`, /예상|예측|정답|틀/);
  // 무작위 600판 (처음 하는 판·다시 하는 판·별 3개 판·이미 접어 본 모양이 섞인 판, 두 단계)
  const rng = createRng('free-tiles');
  let withExplain = 0;
  for (let trial = 0; trial < 600; trial += 1) {
    const list = Array.from({ length: rng.int(1, 14) }, () => rng.pick(ALL_SHAPES));
    const stage = rng.pick([FREE, DEX]);
    const play = freePlayXp(
      list.map((n) => ({ cells: n.cells })),
      {
        stage,
        dex: rng.sample(CUBE_NETS.map((n) => n.name), rng.int(0, 6)),
        note: rng.sample(INVALID_HEXOMINOES.map((n) => n.name), rng.int(0, 10)),
        startStars: rng.int(0, 3),
        explain: rng.pick(['right', 'right', 'wrong', 'skip']),
      },
    );
    const sum = freeSummary(play.session.history());
    const list4 = stage === DEX
      ? dexHighlights(sum, { earned: play.earned, explainCount: play.explainCount, dexCount: play.session.dex().size, dexTotal: DEX_TOTAL })
      : freeHighlights(sum, play);
    assert.ok(list4.length <= FREE_TILE_MAX, `판 ${trial}: ${list4.length}칸`);
    assert.equal(list4.reduce((total, t) => total + (t.xp ?? 0), 0), play.play, `판 ${trial}`);
    // 점수를 받은 갈래는 모두 칸에 있다
    assert.equal(list4[0].xp, play.earned.answer + play.earned.nets, `판 ${trial}`);
    if (play.earned.notes > 0) assert.equal(list4.find((t) => t.label === '노트에 적은 모양')?.xp, play.earned.notes, `판 ${trial}`);
    if (play.earned.explain > 0) assert.equal(list4.find((t) => t.label === '까닭 설명')?.xp, play.earned.explain, `판 ${trial}`);
    if (play.earned.explain > 0) withExplain += 1;
    assert.equal(sum.shapes, play.entries);
  }
  assert.ok(withExplain > 50);
});

// ── 까닭 고르기 전에는 까닭을 보이지 않는다 (N1-1) ─────────────────

test('안 되는 모양 24가지 × 돌리기·뒤집기 8가지: 접으면 까닭을 고르기 전에는 까닭 문장·무대 표시가 없고, 고른 뒤에 나온다', () => {
  const REASON_WORDS = /겹|네 면|한 점|모여|모이|비어|꼭짓점|3개만/;
  let count = 0;
  for (const n of INVALID_HEXOMINOES) {
    for (let k = 0; k < SYMMETRY_COUNT; k += 1) {
      const step = createFreeSession().fold(transformCells(n.cells, k), L6);
      assert.equal(step.explainable, true, n.name);
      // 고르기 전: 무대에 까닭 표시(이름표·겹쳐요·비어요·●)를 보이지 않고, 쪽지·알림에 까닭 낱말이 없다. 안내 쪽지(벽돌색 까닭 쪽지가 아니다)
      const before = freeFeedback(step);
      assert.deepEqual([before.marks, before.tone, before.title], [false, 'info', '정육면체가 안 돼요'], n.name);
      assert.equal(before.note, FREE_NOTE_BEFORE_PICK);
      assert.equal(before.toast, '정육면체가 안 돼요. 왜 그런지 골라 볼까요?');
      for (const text of [before.note, before.toast, before.title]) assert.doesNotMatch(text, REASON_WORDS, `${n.name}: ${text}`);
      // 고른 뒤(맞든 틀리든, 넘어가도): 까닭 문장과 무대 표시가 나온다 (벽돌색 까닭 쪽지)
      const after = freeFeedback(step, { picked: true });
      assert.deepEqual([after.marks, after.tone, after.title], [true, 'wrong', '까닭']);
      assert.equal(after.note, step.message);
      assert.equal(after.note, explainProblem(step.net, primaryProblem(step.problems)), n.name);
      assert.match(after.note, REASON_WORDS);
      count += 1;
    }
  }
  assert.equal(count, 24 * 8);
  // 까닭 문장 자체는 까닭 낱말로 가려낼 수 있다 (검사에 쓰는 낱말이 실제 까닭 문장을 모두 잡는다)
  for (const n of INVALID_HEXOMINOES) assert.match(judgeFree({ cells: n.cells, labels: L6 }).message, REASON_WORDS, n.name);
});

test('까닭 고르기가 없는 경우(전개도, 이번 판에 다시 접음)는 접은 바로 뒤에 문장·무대 표시를 보인다. 노트에 이미 있는 안 되는 모양도 까닭 고르기가 먼저다', () => {
  for (const n of ALL_SHAPES) {
    if (isNet(n)) {
      const made = createFreeSession().fold(n.cells, L6);
      assert.deepEqual([made.explainable, freeFeedback(made).marks, freeFeedback(made).tone, freeFeedback(made).toast], [false, true, 'correct', '처음 찾은 전개도예요!']);
      const known = createFreeSession({ dex: [n.name] }).fold(n.cells, L6);
      assert.match(freeFeedback(known).toast, /^도감 \d+번과 같은 모양이에요\.$/);
      assert.equal(freeFeedback(known).tone, 'correct');
    }
    // 이번 판에 이미 접어 본 모양 (안 되는 모양이어도 다시 묻지 않고 표시를 보인다)
    const session = createFreeSession();
    session.fold(n.cells, L6);
    const repeat = session.fold(n.cells, L6);
    assert.deepEqual([repeat.explainable, freeFeedback(repeat).marks, freeFeedback(repeat).tone, freeFeedback(repeat).toast], [false, true, 'info', '이번에 이미 접어 본 모양이에요.']);
  }
  // 노트에 이미 있는 안 되는 모양(다른 판에서 접어 봄)도 까닭 고르기가 먼저다 (점수는 없다)
  const known = createFreeSession({ note: ['block-a'] }).fold(byName('block-a').cells, L6);
  assert.deepEqual([known.explainable, known.first, freeFeedback(known).marks], [true, false, false]);
  // 알림·쪽지의 말에 예상·"틀렸다"가 없다 (spec 16-12)
  for (const n of ALL_SHAPES) {
    const step = createFreeSession().fold(n.cells, L6);
    for (const picked of [false, true]) {
      const f = freeFeedback(step, { picked });
      for (const text of [f.toast, f.title, f.note]) assert.doesNotMatch(text, /예상|예측|틀렸|틀림|오답/, `${n.name}: ${text}`);
    }
  }
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
