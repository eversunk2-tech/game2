/**
 * 직육면체 차시의 마지막 단계 "내 맘대로 직육면체 전개도"(cuboid-free)의 규칙과 점수.
 * 점수는 엔진(createPlayReward · stageXp)으로 계산한 값을, 기획서 문장만 보고 짠 독립 계산과 무작위 여러 기기·여러 판으로 견준다.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRng } from '../../src/shared/core/random.js';
import { collectionXp, normalizeCollections } from '../../src/shared/core/collection.js';
import { XP, createPlayReward, discoverXp, stageXp } from '../../src/shared/core/rewards.js';
import { checkNet, faceRect, fromRects, netSize, transformNet } from '../../src/games/net-workshop/fold.js';
import {
  CUBOID_BOARDS,
  CUBOID_FOLD_NOTES,
  CUBOID_FREE_FULL,
  CUBOID_FREE_GOAL,
  CUBOID_FREE_REASONS,
  CUBOID_FULL_SCORE_NETS,
  CUBOID_HINT_TEXT,
  CUBOID_LATER_NOTE,
  CUBOID_LATER_XP,
  CUBOID_NETS_ID,
  CUBOID_NOTE_BEFORE_PICK,
  FREE_BOX,
  FREE_CARDS,
  FREE_NET_COUNT,
  centerOnBoard,
  createCuboidFreeSession,
  cuboidFreeFeedback,
  cuboidFreeHighlights,
  cuboidFreeStarNote,
  cuboidFreeStars,
  cuboidFreeStats,
  cuboidFreeSummary,
  cuboidHintNet,
  cuboidReasons,
  freeNetId,
  freeNetIdAt,
  freeNets,
  isLaterNet,
  judgeCuboidFree,
  judgeCuboidReason,
  rectReadiness,
} from '../../src/games/net-workshop/cuboid-logic.js';
import { CUBOID_COLLECTIONS } from '../../src/games/net-workshop/cuboid-main.js';
import { STAGES } from '../../src/games/net-workshop/logic.js';

const STAGE = STAGES.find((s) => s.id === 'cuboid-free');
const rectsOf = (net) => net.faces.map(faceRect);
const shift = (rects, dx, dy) => rects.map((r) => ({ ...r, x: r.x + dx, y: r.y + dy }));
const overlap = (p, q) => Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x) > 1e-9 && Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y) > 1e-9;
/** 전개도 번호 → 판 위에 놓은 직사각형(k번째 돌리기·뒤집기, 옮긴 자리) */
const placed = (id, k = 0, dx = 0, dy = 0) => shift(rectsOf(transformNet(freeNets().find((n) => n.id === id).net, k)), dx, dy);

// 안 되는 배치 몇 가지 (1 × 2 × 3 cm 상자의 면 카드 여섯 장: 3×2 두 장, 3×1 두 장, 2×1 두 장)
const STRIP = [{ x: 0, y: 2, w: 2, h: 3 }, { x: 2, y: 2, w: 1, h: 3 }, { x: 3, y: 2, w: 2, h: 3 }, { x: 5, y: 2, w: 1, h: 3 }]; // 옆면 네 장(가 나 다 라)을 한 줄로
const TOP = { x: 0, y: 1, w: 2, h: 1 }; // 작은 면 하나(마)를 가 면 위에
const INVALID = {
  overlap: [...STRIP, TOP, { x: 3, y: 1, w: 2, h: 1 }], // 작은 면 두 장을 같은 쪽에
  length: [...STRIP, TOP, { x: 3, y: 5, w: 1, h: 2 }], // 작은 면(바)을 돌려 붙임: 1 cm인 변이 다 면의 2 cm인 변에 붙는다
  vertex: [{ x: 0, y: 0, w: 3, h: 2 }, { x: 3, y: 0, w: 3, h: 2 }, { x: 0, y: 2, w: 3, h: 1 }, { x: 3, y: 2, w: 3, h: 1 }, { x: 6, y: 0, w: 1, h: 2 }, { x: 6, y: 2, w: 2, h: 1 }], // 네 면이 한 점에
  tee: [{ x: 0, y: 0, w: 3, h: 2 }, { x: 0, y: 2, w: 2, h: 1 }, { x: 2, y: 2, w: 1, h: 3 }, { x: 3, y: 0, w: 3, h: 2 }, { x: 3, y: 2, w: 3, h: 1 }, { x: 6, y: 0, w: 2, h: 1 }], // 한 변 한가운데에 꼭짓점
};
const APART = [...STRIP, TOP, { x: 8, y: 6, w: 2, h: 1 }];

test('면 카드: 1 × 2 × 3 cm 직육면체의 면 여섯 장(크기가 같은 면 두 장씩), 전개도 54가지가 12칸 × 8줄 판에 모두 들어간다', () => {
  assert.deepEqual([...FREE_BOX], [1, 2, 3]);
  assert.deepEqual(FREE_CARDS.map((c) => c.label), ['가', '나', '다', '라', '마', '바']);
  const sizes = FREE_CARDS.map((c) => [Math.min(c.w, c.h), Math.max(c.w, c.h)].join('×')).sort();
  assert.deepEqual(sizes, ['1×2', '1×2', '1×3', '1×3', '2×3', '2×3']);
  assert.equal(freeNets().length, FREE_NET_COUNT);
  assert.deepEqual(freeNets().map((n) => n.id), Array.from({ length: FREE_NET_COUNT }, (_, i) => freeNetIdAt(i))); // 모음의 칸 id = 전개도 번호
  assert.equal(freeNetIdAt(0), '123-01');
  assert.equal(freeNetIdAt(53), '123-54');
  assert.deepEqual(CUBOID_BOARDS.wide, { cols: 12, rows: 8 });
  let phone = 0;
  for (const n of freeNets()) {
    const rects = centerOnBoard(n.net, CUBOID_BOARDS.wide);
    assert.ok(rects, n.id);
    for (const r of rects) assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= 12 && r.y + r.h <= 8, n.id);
    assert.equal(freeNetId(fromRects(rects, { dims: FREE_BOX })), n.id);
    if (centerOnBoard(n.net, CUBOID_BOARDS.phone)) phone += 1;
  }
  assert.equal(phone, 53); // 휴대폰 판(10칸 × 9줄)에는 가장 긴 전개도(12 × 3) 하나만 안 들어간다
  assert.equal(CUBOID_NETS_ID, 'cuboid-nets');
  assert.deepEqual([STAGE.count, CUBOID_FREE_GOAL, CUBOID_FREE_FULL], [2, 2, 3]);
});

test('놓은 면 상태: 6장이 아니면 count, 떨어진 면이 있으면 apart(떨어진 면 번호), 아니면 접을 수 있음 — 꼭짓점만 닿은 면은 이어진 것이 아니다', () => {
  assert.deepEqual(rectReadiness([]), { ready: false, reason: 'count', detached: [] });
  assert.deepEqual(rectReadiness(STRIP), { ready: false, reason: 'count', detached: [] });
  assert.deepEqual(rectReadiness(APART), { ready: false, reason: 'apart', detached: [5] });
  assert.deepEqual(rectReadiness([...STRIP, TOP, { x: 6, y: 5, w: 2, h: 1 }]), { ready: false, reason: 'apart', detached: [5] }); // 꼭짓점 (6, 5)만 닿음
  for (const rects of [...Object.values(INVALID), placed('123-01', 0, 2, 1)]) assert.deepEqual(rectReadiness(rects), { ready: true, reason: null, detached: [] });
  // 무작위 배치: 이웃 칸으로 센 덩어리와 같다 (독립 계산)
  const rng = createRng('cuboid-apart');
  let apart = 0;
  for (let trial = 0; trial < 1500; trial += 1) {
    const rects = [];
    for (const card of FREE_CARDS) {
      for (let guard = 0; guard < 60 && rects.length < FREE_CARDS.indexOf(card) + 1; guard += 1) {
        const [w, h] = rng.next() < 0.5 ? [card.w, card.h] : [card.h, card.w];
        const r = { x: rng.int(0, 8 - w), y: rng.int(0, 6 - h), w, h };
        if (!rects.some((q) => overlap(q, r))) rects.push(r);
      }
    }
    if (rects.length < 6) continue;
    const cells = new Map();
    rects.forEach((r, i) => {
      for (let x = r.x; x < r.x + r.w; x += 1) for (let y = r.y; y < r.y + r.h; y += 1) cells.set(`${x},${y}`, i);
    });
    const group = rects.map((_, i) => i);
    const find = (i) => (group[i] === i ? i : find(group[i]));
    for (const [key, i] of cells) {
      const [x, y] = key.split(',').map(Number);
      for (const other of [`${x + 1},${y}`, `${x},${y + 1}`]) if (cells.has(other)) group[find(i)] = find(cells.get(other));
    }
    const joined = new Set(rects.map((_, i) => find(i))).size === 1;
    const got = rectReadiness(rects);
    assert.equal(got.ready, joined, JSON.stringify(rects));
    if (!joined) {
      apart += 1;
      assert.ok(got.detached.length >= 1 && got.detached.length <= 5);
    }
  }
  assert.ok(apart > 300, String(apart));
});

test('judgeCuboidFree: 예상 없이 놓고 접는다 — 직육면체가 되면 맞음, 안 되면 그 까닭의 tag (겹침 · 맞닿는 모서리 길이 · 한 꼭짓점에 세 면)', () => {
  const ok = judgeCuboidFree({ rects: placed('123-07', 3, 2, 1) });
  assert.deepEqual([ok.valid, ok.correct, ok.tag, ok.kind, ok.log, ok.id, ok.given], [true, true, null, 'new', true, '123-07', '전개도 123-07']);
  assert.equal(ok.title, '새 전개도 발견');
  assert.equal(judgeCuboidFree({ rects: placed('123-07'), found: new Set(['123-07']) }).kind, 'known');
  const want = { overlap: '면이 겹침', length: '맞닿는 모서리 길이', vertex: '한 꼭짓점에 세 면', tee: '한 꼭짓점에 세 면' };
  for (const [name, rects] of Object.entries(INVALID)) {
    const r = judgeCuboidFree({ rects });
    assert.deepEqual([r.valid, r.correct, r.kind, r.id, r.tag], [false, false, 'invalid', null, want[name]], name);
    assert.equal(r.title, '직육면체가 안 돼요');
    assert.equal(r.given, `안 됨: ${want[name]}`);
    assert.doesNotMatch(r.message, /undefined|NaN|null|\?/);
    assert.deepEqual(r.problems, checkNet(r.net).problems);
    // 까닭 칩: 참인 까닭은 하나 이상이고 그 가운데 무엇을 골라도 맞다
    const truths = cuboidReasons(r.problems, 'free');
    assert.ok(truths.length >= 1 && truths.includes({ overlap: 'overlap', length: 'length', vertex: 'vertex', tee: 'vertex' }[name]), name);
    for (const reason of CUBOID_FREE_REASONS) assert.equal(judgeCuboidReason(r.problems, reason.id, 'free').correct, truths.includes(reason.id));
    assert.ok(CUBOID_FREE_REASONS.some((x) => x.id === judgeCuboidReason(r.problems, 'zzz', 'free').answer));
  }
  assert.match(judgeCuboidFree({ rects: INVALID.overlap }).message, /^마 면과 바 면이 같은 자리에 겹쳐요/);
  assert.match(judgeCuboidFree({ rects: INVALID.length }).message, /^다 면과 바 면이 붙은 두 변의 길이가 2 cm와 1 cm로 달라요/);
  assert.match(judgeCuboidFree({ rects: INVALID.vertex }).message, /^면이 한 점을 빈틈없이 둘러싸면 접을 수 없어요/);
});

test('한 판의 흐름: 같은 모양(돌리거나 뒤집어도 · 옮겨도)을 다시 접으면 기록 없음, 2가지를 찾으면 끝낼 수 있고 3가지면 별 3개, 안 되는 모양은 별과 무관', () => {
  const session = createCuboidFreeSession({ stageId: 'cuboid-free' });
  const a = session.fold(placed('123-10', 0, 1, 1));
  assert.deepEqual([a.kind, a.itemId, a.first, a.found, a.total, a.done, a.full, a.explainable], ['new', 'cuboid-free:1:123-10', true, 1, 1, false, false, false]);
  assert.deepEqual(a.collect, { id: 'cuboid-nets', item: '123-10', isNew: true });
  for (let k = 0; k < 8; k += 1) {
    const again = session.fold(placed('123-10', k, 2, 0));
    assert.deepEqual([again.kind, again.log, again.itemId, again.collect, again.first, again.found], ['repeat', false, null, null, false, 1], `돌리기 ${k}`);
  }
  const bad = session.fold(INVALID.overlap);
  assert.deepEqual([bad.kind, bad.itemId, bad.collect, bad.first, bad.explainable, bad.found, bad.invalidRun], ['invalid', 'cuboid-free:2:x', null, false, true, 1, 1]);
  assert.deepEqual([session.fold(INVALID.overlap).kind, session.fold(shift(INVALID.overlap, 3, 2)).log], ['repeat', false]); // 안 되는 모양도 이번 판에 다시 접으면 기록 없음
  const b = session.fold(placed('123-20', 5));
  assert.deepEqual([b.kind, b.found, b.total, b.done, b.full, b.fixed], ['new', 2, 2, true, false, true]);
  const c = session.fold(placed('123-33'));
  assert.deepEqual([c.found, c.done, c.full], [3, true, true]);
  assert.deepEqual(cuboidFreeSummary(session.history()), { shapes: 4, found: 3, newNets: 3, fixes: 1 });
  // 이 기기에서 전에 찾은 전개도: 이번 판 가지 수에는 세고(known) 점수는 없다(first 아님)
  const later = createCuboidFreeSession({ found: ['123-10', '123-20'] });
  const k = later.fold(placed('123-20', 2));
  assert.deepEqual([k.kind, k.log, k.first, k.collect, k.found, k.total], ['known', true, false, null, 1, 2]);
  assert.deepEqual([0, 1, 2, 3, 4, 54, -1, NaN].map(cuboidFreeStars), [0, 1, 2, 3, 3, 3, 0, 0]);
  assert.deepEqual([1, 2, 3].map(cuboidFreeStarNote), ['서로 다른 전개도 3가지를 찾으면 별 3개!', '서로 다른 전개도 3가지를 찾으면 별 3개!', null]);
  assert.deepEqual(cuboidFreeStats({ found: 2, shapes: 5 }), [{ label: '찾은 전개도', value: '2가지' }, { label: '접어 본 모양', value: '5가지' }]);
});

test('접은 뒤의 글: 안 되는 모양은 까닭을 고르기 전에는 까닭 문장·무대 표시가 없고, 고른 뒤에 나온다. 접기 전 안내에도 까닭 낱말이 없다', () => {
  const WORDS = /겹|둘러|길이|달라|어긋|비어|꼭짓점|모서리|한 점/;
  for (const note of Object.values(CUBOID_FOLD_NOTES)) assert.doesNotMatch(note, WORDS, note);
  assert.doesNotMatch(CUBOID_NOTE_BEFORE_PICK, WORDS);
  assert.match(CUBOID_HINT_TEXT, /3 cm/);
  for (const rects of Object.values(INVALID)) {
    const step = createCuboidFreeSession().fold(rects);
    const before = cuboidFreeFeedback(step);
    assert.deepEqual([before.marks, before.tone, before.note, before.title], [false, 'info', CUBOID_NOTE_BEFORE_PICK, '직육면체가 안 돼요']);
    assert.doesNotMatch(before.toast, WORDS);
    const after = cuboidFreeFeedback(step, { picked: true });
    assert.deepEqual([after.marks, after.tone, after.note, after.title], [true, 'wrong', step.message, '까닭']);
    assert.match(after.note, WORDS);
  }
  const good = cuboidFreeFeedback(createCuboidFreeSession().fold(placed('123-01')));
  assert.deepEqual([good.marks, good.tone, good.title], [true, 'correct', '새 전개도 발견']);
  // "틀렸다"는 느낌의 말을 쓰지 않는다
  for (const rects of [...Object.values(INVALID), placed('123-01')]) {
    const step = createCuboidFreeSession().fold(rects);
    for (const f of [cuboidFreeFeedback(step), cuboidFreeFeedback(step, { picked: true })]) assert.doesNotMatch(`${f.toast} ${f.title} ${f.note}`, /틀렸|정답률|예상|예측/);
  }
});

test('힌트 그림자: 이 기기에서 아직 찾지 않은 전개도를 먼저 고른다(점수를 받는 새 전개도). 모두 찾아본 기기에서는 이번 판에 못 찾은 것', () => {
  const board = CUBOID_BOARDS.wide;
  const first = cuboidHintNet(new Set(), board);
  // 이 기기에서 이미 찾은 것은 건너뛴다(이번 판에는 아직 못 찾았어도)
  const second = cuboidHintNet(new Set(), board, new Set([first.id]));
  assert.notEqual(second.id, first.id);
  assert.equal(cuboidHintNet(new Set(), board, new Set([first.id, second.id])).id, cuboidHintNet(new Set([first.id, second.id]), board).id);
  // 무작위: 이 기기에서 찾은 것 · 이번 판에 찾은 것이 무엇이든, 힌트는 이번 판에 없는 것이고 기기에 없는 것이 남아 있으면 그 가운데 하나
  const rng = createRng('cuboid-hint');
  const ids = freeNets().map((n) => n.id);
  for (let trial = 0; trial < 300; trial += 1) {
    const device = new Set(rng.sample(ids, rng.int(0, 54)));
    const now = new Set(rng.sample([...device], rng.int(0, Math.min(3, device.size))));
    const hint = cuboidHintNet(now, board, device);
    if (now.size === 54) {
      assert.equal(hint, null);
      continue;
    }
    assert.ok(hint && !now.has(hint.id));
    if (device.size < 54) assert.ok(!device.has(hint.id), `기기에서 찾은 ${device.size}가지`);
  }
  // 54가지를 모두 찾아본 기기: 이번 판에 아직 못 찾은 것(점수는 없지만 별을 채울 수 있다)
  const all = new Set(ids);
  assert.ok(!new Set([ids[0]]).has(cuboidHintNet(new Set([ids[0]]), board, all).id));
});

test('힌트 그림자: 이번 판에서 아직 못 찾은 전개도이고 판 가운데에 들어간다', () => {
  for (const board of Object.values(CUBOID_BOARDS)) {
    const found = new Set();
    for (let i = 0; i < 5; i += 1) {
      const hint = cuboidHintNet(found, board);
      assert.ok(hint && !found.has(hint.id));
      const rects = centerOnBoard(hint.net, board);
      for (const r of rects) assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= board.cols && r.y + r.h <= board.rows);
      assert.ok(checkNet(fromRects(rects, { dims: FREE_BOX })).ok);
      const [w, h] = netSize(fromRects(rects));
      assert.ok(Math.abs((board.cols - w) / 2 - Math.min(...rects.map((r) => r.x))) <= 0.5 && Math.abs((board.rows - h) / 2 - Math.min(...rects.map((r) => r.y))) <= 0.5);
      found.add(hint.id);
    }
  }
});

// ── 점수: 학습 행동에만, 전개도마다 이 기기에서 한 번만 (common-rules 3절, spec 16-8 · 16-9 · 16-12) ─────────────────
const NET_XP = XP.first + XP.discover; // 처음 찾은 전개도 하나(이 기기에서 10가지까지): 만들기 성공 2 + 등록 5
const stageGain = (prev, stars) => stageXp({ prevStars: prev, stars, cleared: true }).total;
/** 게임이 엔진에 주는 모음 정의(main.js collections에 들어가는 그대로): 등록 점수는 엔진처럼 이 정의로 계산한다 */
const [NETS_DEF] = normalizeCollections(CUBOID_COLLECTIONS);

/**
 * 한 판을 엔진 점수 규칙으로 계산한다. 화면(cuboid-free.js)과 같은 순서: 등록(ctx.collect — 엔진이 모음 정의의 xp · xpAfter로 점수를 준다)
 * → 접기 기록(이 기기에서 10가지까지 처음 찾은 전개도는 scored: 'once', 11번째부터의 새 전개도 · 찾아본 전개도 · 안 되는 모양은 scored: false)
 * → 까닭 설명(안 되는 모양: 점수 없는 문항이라 0점).
 * folds: [{ rects, explain: 'right' | 'wrong' | 'skip' }], found: 이 기기에서 찾은 전개도, finished: false면 중간에 나간 판
 */
function playXp(folds, { found = [], startStars = 0, finished = true } = {}) {
  const session = createCuboidFreeSession({ found });
  const play = createPlayReward({ startStars });
  const earned = { answer: 0, nets: 0 };
  let explain = 0;
  let scored = 0; // 만들기 성공 점수를 받은 접기 수
  for (const fold of folds) {
    const step = session.fold(fold.rects);
    let before = play.xp();
    // 엔진의 ctx.collect와 같은 계산: 방금 등록한 뒤의 가지 수(step.total)로 몇 번째인지 센다
    if (step.collect?.isNew) play.discovered(discoverXp(collectionXp(NETS_DEF, step.total)));
    earned.nets += play.xp() - before;
    before = play.xp();
    const later = step.first && isLaterNet(step.total);
    assert.equal(step.later, later);
    if (step.log) play.answer({ itemId: step.itemId, correct: step.valid, scored: step.first && !later ? 'once' : false });
    if (step.first && !later) scored += 1;
    earned.answer += play.xp() - before;
    if (step.explainable && (fold.explain ?? 'right') !== 'skip') explain += play.event('explain', { correct: (fold.explain ?? 'right') === 'right', itemId: step.itemId });
    assert.equal(play.instant(), play.xp()); // 이 단계의 점수는 모두 그 자리에서 저장되는 몫이다
  }
  const count = session.found().size;
  const done = finished && count >= CUBOID_FREE_GOAL;
  const stars = cuboidFreeStars(count);
  const stage = done ? stageGain(startStars, Math.max(startStars, stars)) : 0;
  return { xp: play.xp() + stage, play: play.xp(), stage, stars: done ? stars : 0, finished: done, earned, explain, scored, session, entries: play.summary().answers.attempts };
}

function createDevice() {
  let found = [];
  let stars = 0;
  let total = 0;
  let base = 0; // 등록 점수 + 만들기 성공 2점씩 (연속 · 단계 점수를 뺀 것)
  let extra = 0; // 연속 점수
  let stage = 0;
  return {
    play(folds, options = {}) {
      const r = playXp(folds, { found, startStars: stars, ...options });
      found = [...r.session.device()];
      if (r.finished) stars = Math.max(stars, r.stars);
      total += r.xp;
      base += r.earned.nets + r.scored * XP.first;
      extra += r.earned.answer - r.scored * XP.first;
      stage += r.stage;
      return r;
    },
    total: () => total,
    base: () => base,
    extra: () => extra,
    stage: () => stage,
    stars: () => stars,
    found: () => found.slice(),
  };
}

/**
 * 독립 계산 (rewards.js · cuboid-logic.js의 판 흐름을 쓰지 않는다): 기획서 문장만 보고 짠 한 기기의 점수. 모양은 이름으로만 본다.
 *   - 이번 판에 이미 접은 모양: 아무 일도 없다
 *   - 이 기기에서 처음 찾은 전개도, 10가지까지: 등록 +5, 만들기 성공 +2, 그런 전개도를 연달아 3번마다 +1
 *   - 이 기기에서 처음 찾은 전개도, 11번째부터: 모두 합쳐 +1 (만들기 성공 점수가 없고 연속에도 넣지 않는다) — 사용자 결정 2026-10-11
 *   - 찾아본 전개도: 0점 · 안 되는 모양: 0점(까닭을 맞혀도 0점)이고 연속이 끊긴다
 *   - 마치면(이번 판에 2가지 이상): 별 = 찾은 가지 수(3까지). 처음 마칠 때 +5, 별이 늘어난 만큼 +2씩
 */
function createModelDevice() {
  const seen = new Set();
  let stars = 0;
  let total = 0;
  return {
    play(names, { finished = true } = {}) {
      const inPlay = new Set();
      const foundNow = new Set();
      let run = 0;
      let xp = 0;
      for (const name of names) {
        if (inPlay.has(name)) continue;
        inPlay.add(name);
        if (name.startsWith('x')) {
          run = 0;
          continue;
        }
        foundNow.add(name);
        if (seen.has(name)) continue;
        seen.add(name);
        if (seen.size > 10) {
          xp += 1;
          continue;
        }
        xp += 5 + 2;
        run += 1;
        if (run % 3 === 0) xp += 1;
      }
      let stage = 0;
      if (finished && foundNow.size >= 2) {
        const now = Math.min(3, foundNow.size);
        if (now > stars) {
          stage = (stars === 0 ? 5 : 0) + (now - stars) * 2;
          stars = now;
        }
      }
      total += xp + stage;
      return { xp: xp + stage, play: xp, stage };
    },
    total: () => total,
    stars: () => stars,
  };
}

const BAD = Object.entries(INVALID).map(([name, rects]) => ({ name: `x-${name}`, rects }));
/** 무작위 접기: 전개도(아무 방향 · 아무 자리)나 안 되는 모양 */
function randomFold(rng, pool) {
  const pick = rng.pick(pool);
  if (pick.name) return { name: pick.name, rects: shift(pick.rects, rng.int(0, 2), rng.int(0, 2)), explain: rng.pick(['right', 'wrong', 'skip']) };
  return { name: pick.id, rects: placed(pick.id, rng.int(0, 7), rng.int(0, 2), rng.int(0, 1)) };
}

test('점수 표: 처음 찾은 전개도는 만들기 성공 +2 · 등록 +5, 찾아본 전개도와 안 되는 모양은 0점(까닭을 맞혀도) — 3가지를 찾아 마치면 33점', () => {
  assert.deepEqual([XP.first, XP.discover, XP.stageClear, XP.perStar], [2, 5, 5, 2]);
  const one = playXp([{ rects: placed('123-05') }]);
  assert.deepEqual([one.earned, one.play, one.xp, one.finished], [{ answer: 2, nets: 5 }, NET_XP, NET_XP, false]); // 한 가지로는 끝낼 수 없다
  for (const bad of BAD) for (const explain of ['right', 'wrong', 'skip']) assert.deepEqual([playXp([{ rects: bad.rects, explain }]).xp, playXp([{ rects: bad.rects, explain }]).explain], [0, 0], bad.name);
  const two = playXp(['123-05', '123-06'].map((id) => ({ rects: placed(id) })));
  assert.deepEqual([two.play, two.stage, two.xp, two.stars], [14, 5 + 4, 23, 2]);
  const three = playXp(['123-05', '123-06', '123-07'].map((id) => ({ rects: placed(id) })));
  assert.deepEqual([three.earned, three.play, three.stage, three.xp, three.stars], [{ answer: 7, nets: 15 }, 22, 11, 33, 3]);
  // 안 되는 모양이 끼면 연속만 끊긴다(다시 일어서기도 없다): 같은 세 전개도를 찾아도 1점 적다 — 일부러 틀려 얻는 것이 없다
  const mixed = playXp([{ rects: placed('123-05') }, BAD[0], { rects: placed('123-06') }, { rects: placed('123-07') }]);
  assert.deepEqual([mixed.play, mixed.xp], [21, 32]);
  // 찾아본 전개도: 가지 수와 별에는 세고 점수는 없다
  const known = playXp(['123-05', '123-06', '123-07'].map((id) => ({ rects: placed(id, 3) })), { found: ['123-05', '123-06', '123-07'], startStars: 3 });
  assert.deepEqual([known.play, known.stage, known.xp, known.stars, known.entries], [0, 0, 0, 3, 3]);
});

test('직육면체 차시 전체(만나는 선분 5 · 알맞은 면 4 · 길이까지 살펴요 5 · 전개도 3가지)를 모두 맞히면 103점: 정육면체 차시(99점)에 이어 하면 202점으로 설계 장인(180점↑)', () => {
  const perfect = (n, explains = 0) => {
    const play = createPlayReward();
    for (let i = 0; i < n; i += 1) play.answer({ itemId: i, correct: true });
    for (let i = 0; i < explains; i += 1) play.event('explain', { correct: true, itemId: i });
    return play.xp() + stageXp({ prevStars: 0, stars: 3 }).total;
  };
  const free = playXp(['123-01', '123-02', '123-03'].map((id) => ({ rects: placed(id) }))).xp;
  assert.deepEqual([perfect(5), perfect(4), perfect(5, 3), free], [22, 20, 28, 33]);
  assert.equal(perfect(5) + perfect(4) + perfect(5, 3) + free, 103);
  // 전개도를 2가지만 찾고 끝내면(별 2개) 93점
  assert.equal(perfect(5) + perfect(4) + perfect(5, 3) + playXp(['123-01', '123-02'].map((id) => ({ rects: placed(id) }))).xp, 93);
  // 54가지를 모두 찾으면(한 판): 처음 10가지 10 × 7 + 연속 3 + 11번째부터 44 × 1 + 단계 11 = 128점 — 전개도마다 한 번뿐이라 그 뒤로는 0점
  // (상한을 두기 전에는 54 × 7 + 18 + 11 = 407점이었다 — 칭호 최고 기준 300점을 이 단계 하나로 넘었다)
  const all = createDevice();
  const first = all.play(freeNets().map((n) => ({ rects: placed(n.id) })));
  assert.deepEqual([first.play, first.xp], [10 * NET_XP + 3 + 44 * CUBOID_LATER_XP, 128]);
  assert.equal(all.play(freeNets().map((n) => ({ rects: placed(n.id, 2) }))).xp, 0);
});

test('점수 상한(사용자 결정 2026-10-11): 이 기기에서 처음 찾는 10가지까지는 등록 +5 · 만들기 성공 +2(연속은 엔진 규칙), 11번째부터는 새로 찾을 때마다 모두 합쳐 +1', () => {
  assert.deepEqual([CUBOID_FULL_SCORE_NETS, CUBOID_LATER_XP], [10, 1]);
  // 엔진 모음 정의가 같은 값을 쓴다. 몇 번째인지는 두 길이가 같은 상자의 모음까지 합쳐 센다(사용자 결정 2026-10-16 — 처음 값 상자만 하면 지금과 같다)
  assert.deepEqual(NETS_DEF.xpAfter, { count: 10, xp: 1, with: ['cuboid-pair-nets'] });
  assert.equal(NETS_DEF.xp, undefined); // 10가지까지는 엔진 기본 +5
  assert.deepEqual([1, 9, 10, 11, 12, 54].map((n) => discoverXp(collectionXp(NETS_DEF, n))), [5, 5, 5, 1, 1, 1]);
  assert.deepEqual([1, 10, 11, 54].map(isLaterNet), [false, false, true, true]);
  assert.match(CUBOID_LATER_NOTE, /10가지를 넘으면 새 전개도마다 1점/);
  const ids = freeNets().map((n) => n.id);
  // 9가지를 찾은 기기: 10번째 +7, 11 · 12번째 +1씩 (연속은 10번째가 이번 판의 첫 번째라 없다)
  const nine = playXp(ids.slice(9, 12).map((id) => ({ rects: placed(id) })), { found: ids.slice(0, 9), finished: false });
  assert.deepEqual([nine.earned, nine.play, nine.scored], [{ answer: 2, nets: 5 + 1 + 1 }, 9, 1]);
  assert.deepEqual(nine.session.history().map((st) => [st.first, st.later, st.total]), [[true, false, 10], [true, true, 11], [true, true, 12]]);
  // 10가지를 찾은 기기: 새 전개도 세 가지가 +1씩(연속 점수도 없다), 3가지라 마치면 별 3개
  const ten = playXp(ids.slice(10, 13).map((id) => ({ rects: placed(id) })), { found: ids.slice(0, 10) });
  assert.deepEqual([ten.earned, ten.play, ten.stage, ten.stars], [{ answer: 0, nets: 3 }, 3, 11, 3]);
  // 경계의 한 판: 8가지를 찾은 기기에서 4가지 더 — 9 · 10번째는 +7씩, 11 · 12번째는 +1씩. 연속은 점수 받는 두 번뿐이라 없다
  const edge = playXp(ids.slice(8, 12).map((id) => ({ rects: placed(id) })), { found: ids.slice(0, 8), startStars: 3 });
  assert.deepEqual([edge.earned, edge.play, edge.xp], [{ answer: 4, nets: 12 }, 16, 16]);
  // 찾아본 전개도와 안 되는 모양은 상한과 무관하게 0점이고, 가지 수를 늘리지 않는다
  const mixed = playXp([{ rects: placed(ids[0]) }, BAD[0], { rects: placed(ids[9]) }, { rects: placed(ids[10]) }], { found: ids.slice(0, 9), finished: false });
  assert.deepEqual(mixed.session.history().map((st) => [st.kind, st.first, st.later, st.total]), [['known', false, false, 9], ['invalid', false, false, 9], ['new', true, false, 10], ['new', true, true, 11]]);
  assert.deepEqual([mixed.earned, mixed.play], [{ answer: 2, nets: 6 }, 8]);
});

test('54가지의 등록·만들기 점수 합은 어떤 순서로, 몇 판에 나눠 찾아도 10 × 7 + 44 × 1 = 114점 (무작위 400기기: 순서 · 판 나눔 · 나가기 · 다시 만들기 · 안 되는 모양을 섞음) — 총점도 독립 계산과 같다', () => {
  const rng = createRng('cuboid-free-cap');
  const totals = new Set();
  let plays = 0;
  let exits = 0;
  for (let trial = 0; trial < 400; trial += 1) {
    const device = createDevice();
    const model = createModelDevice();
    const order = rng.shuffle(freeNets().map((n) => n.id));
    let at = 0;
    let guard = 0;
    while (device.found().length < FREE_NET_COUNT && guard < 400) {
      guard += 1;
      // 한 판: 새 전개도 몇 가지 + (때때로) 찾아본 전개도 다시 만들기 · 안 되는 모양
      const take = rng.int(1, rng.pick([2, 3, 5, 9, 20, 54]));
      const folds = [];
      for (const id of order.slice(at, at + take)) {
        if (rng.next() < 0.2) folds.push({ name: BAD[rng.int(0, BAD.length - 1)].name, rects: BAD[rng.int(0, BAD.length - 1)].rects });
        if (at > 0 && rng.next() < 0.2) folds.push({ name: order[rng.int(0, at - 1)], rects: null });
        folds.push({ name: id, rects: null });
      }
      for (const f of folds) {
        if (f.name.startsWith('x-')) f.rects = BAD.find((b) => b.name === f.name).rects;
        else f.rects = placed(f.name, rng.int(0, 7), rng.int(0, 2), rng.int(0, 1));
      }
      const finished = rng.next() >= 0.3;
      const got = device.play(folds, { finished });
      const want = model.play(folds.map((f) => f.name), { finished });
      assert.deepEqual([got.xp, got.play, got.stage], [want.xp, want.play, want.stage], `기기 ${trial} 판 ${plays}`);
      at += take;
      plays += 1;
      if (!finished) exits += 1;
    }
    assert.equal(device.found().length, FREE_NET_COUNT);
    // 등록 + 만들기 성공 점수의 합은 늘 114점
    assert.equal(device.base(), CUBOID_FULL_SCORE_NETS * NET_XP + (FREE_NET_COUNT - CUBOID_FULL_SCORE_NETS) * CUBOID_LATER_XP, `기기 ${trial}`);
    assert.equal(device.base(), 114);
    // 나머지는 엔진의 연속 점수(처음 10가지를 연달아 찾은 만큼: 0~3점)와 단계 점수(마친 판의 별: 0 · 9 · 11점)뿐이다
    assert.ok(device.extra() >= 0 && device.extra() <= 3, `기기 ${trial}: 연속 ${device.extra()}`);
    assert.ok([0, 9, 11].includes(device.stage()), `기기 ${trial}: 단계 ${device.stage()}`);
    assert.equal(device.total(), 114 + device.extra() + device.stage());
    assert.equal(device.total(), model.total(), `기기 ${trial}`);
    assert.ok(device.total() <= 128);
    totals.add(device.total());
    // 더 할 것이 없다: 54가지를 다시 만들어도 0점(별이 3개가 아니던 기기만 별 점수)
    const before = device.total();
    const starsBefore = device.stars();
    const again = device.play(order.slice(0, 5).map((id) => ({ name: id, rects: placed(id, 3) })));
    assert.equal(again.play, 0);
    assert.equal(device.total() - before, starsBefore === 3 ? 0 : stageGain(starsBefore, 3));
  }
  assert.ok(plays > 1500 && exits > 300, `${plays}판 · 나감 ${exits}`);
  assert.ok(totals.size >= 4, [...totals].sort().join()); // 연속 · 단계 점수에 따라 총점은 몇 가지로 갈리지만 등록·만들기 합은 늘 같다
});

test('무작위 2,500기기: 여러 판에 걸쳐 접은 점수(판마다, 쌓인 점수, 별)가 독립 계산과 같다 — 나갔다 들어오기 · 돌리거나 뒤집어 다시 만들기 · 안 되는 모양을 섞어도', () => {
  const rng = createRng('cuboid-free-model');
  let plays = 0;
  let exits = 0;
  let later = 0; // 10가지를 넘겨 찾은 기기
  for (let trial = 0; trial < 2500; trial += 1) {
    const device = createDevice();
    const model = createModelDevice();
    // 전개도 2~12가지를 도는 기기가 많고, 다섯에 하나는 13~30가지를 도는 기기(상한을 넘긴다)
    const pool = [...rng.sample(freeNets(), rng.next() < 0.2 ? rng.int(13, 30) : rng.int(2, 12)), ...rng.sample(BAD, rng.int(0, BAD.length))];
    for (let n = rng.int(1, 6); n > 0; n -= 1) {
      const folds = Array.from({ length: rng.int(1, pool.length > 16 ? 14 : 8) }, () => randomFold(rng, pool));
      const finished = rng.next() >= 0.25;
      const got = device.play(folds, { finished });
      const want = model.play(folds.map((f) => f.name), { finished });
      assert.deepEqual([got.xp, got.play, got.stage], [want.xp, want.play, want.stage], `기기 ${trial} 판 ${plays}`);
      assert.equal(got.earned.answer + got.earned.nets, got.play); // 결과 칸의 합 = 이번 판 점수 (화면 = 저장)
      plays += 1;
      if (!finished) exits += 1;
    }
    assert.equal(device.total(), model.total(), `기기 ${trial}`);
    assert.equal(device.stars(), model.stars());
    // 위쪽 끝: 처음 10가지는 7점씩 + 연속(3개마다 1), 그 뒤는 1점씩, 단계 11
    const nets = device.found().length;
    const full = Math.min(nets, CUBOID_FULL_SCORE_NETS);
    assert.ok(device.total() <= full * NET_XP + Math.floor(full / 3) + (nets - full) * CUBOID_LATER_XP + 11, `기기 ${trial}`);
    if (nets > CUBOID_FULL_SCORE_NETS) later += 1;
  }
  assert.ok(plays > 7000 && exits > 1500, `${plays}판 · 나감 ${exits}`);
  assert.ok(later > 150, `10가지를 넘긴 기기 ${later}`);
});

test('일부러 틀려 얻는 것이 없고 되풀이해도 쌓이지 않는다: 같은 순서에서 안 되는 모양을 빼면 늘 더 받거나 같고, 같은 접기를 다시 하면 0점 (무작위 1,500기기)', () => {
  const rng = createRng('cuboid-free-fair');
  let cases = 0;
  for (let trial = 0; trial < 1500; trial += 1) {
    const pool = [...rng.sample(freeNets(), rng.int(2, 9)), ...BAD];
    const plays = Array.from({ length: rng.int(1, 5) }, () => Array.from({ length: rng.int(2, 9) }, () => randomFold(rng, pool)));
    const messy = createDevice();
    const clean = createDevice();
    for (const folds of plays) {
      messy.play(folds);
      clean.play(folds.filter((f) => !f.name.startsWith('x')));
    }
    assert.ok(clean.total() >= messy.total(), `기기 ${trial}: 모두 맞힌 쪽 ${clean.total()} < 일부러 틀린 쪽 ${messy.total()}`);
    // 더 할 것이 없다: 같은 판들을 처음부터 다시 해도(돌리고 옮겨서) 0점 — 별이 늘 수 있는 판만 별 점수
    const before = messy.total();
    const starsBefore = messy.stars();
    for (const folds of plays) messy.play(folds.map((f) => ({ ...f, rects: shift(f.rects, 1, 1) })));
    assert.equal(messy.total() - before, messy.stars() === starsBefore ? 0 : stageGain(starsBefore, messy.stars()) - (starsBefore === 0 ? 0 : 0), `기기 ${trial}`);
    cases += 1;
  }
  assert.equal(cases, 1500);
});

test('결과 "오늘의 솜씨": 칸 점수의 합 = 이번 판 점수, 기록 칸은 찾은 전개도 · 접어 본 모양', () => {
  const r = playXp([{ rects: placed('123-11') }, BAD[1], { rects: placed('123-12') }, { rects: placed('123-11', 4) }]);
  const sum = cuboidFreeSummary(r.session.history());
  assert.deepEqual(sum, { shapes: 3, found: 2, newNets: 2, fixes: 1 });
  const tiles = cuboidFreeHighlights(sum, { earned: r.earned, total: 2 });
  assert.equal(tiles.reduce((total, t) => total + (t.xp ?? 0), 0), r.play);
  assert.deepEqual(tiles.map((t) => [t.label, t.value]), [['새 전개도 발견', '2가지'], ['지금까지 찾은 전개도', '2가지'], ['고쳐서 다시 도전', '1번']]);
  assert.ok(tiles.length <= 4);
});
