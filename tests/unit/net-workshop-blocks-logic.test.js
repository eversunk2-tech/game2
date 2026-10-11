/**
 * 쌓기나무 차시의 단계 목록·문제 만들기·채점 검사 (blocks-logic.js). 기획서: spec-grade6.md 2-4·4·6-4·8절
 * 문제 조건은 blocks.js의 묶음 함수가 아니라 여기서 전부 나열한 값(높이 지도 262,144개)과 견준다.
 * 점수는 엔진(core/rewards.js)과 기획서의 점수 표만 보고 짠 독립 계산을 무작위 판으로 견준다.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRng } from '../../src/shared/core/random.js';
import { XP, createPlayReward, stageXp } from '../../src/shared/core/rewards.js';
import { starsFromAccuracy } from '../../src/shared/core/progress.js';
import { LESSONS, STAGES } from '../../src/games/net-workshop/logic.js';
import {
  AROUND,
  count,
  emptyMap,
  hiddenCells,
  isConnectedTop,
  lookKey,
  mapKey,
  pictureKey,
  sceneFrom,
  sceneKey,
  toCorner,
  topView,
} from '../../src/games/net-workshop/blocks/blocks.js';
import {
  BLOCK_LESSONS,
  BLOCK_STAGES,
  BLOCK_TAGS,
  DIR_LETTERS,
  MORE_CLUES,
  MORE_CLUE_ANSWER,
  SCULPTURES,
  buildHint,
  countFixedByPicture,
  describeScene,
  fitsGiven,
  judgeBuild,
  judgeCount,
  judgeDirection,
  judgeGuess,
  judgeLook,
  judgeOther,
  judgeScene,
  layerSentence,
  makeBlockQuestions,
  mirrorMap,
  otherLook,
  shiftsOf,
  spotName,
  swapMap,
  tellApart,
  towerLine,
} from '../../src/games/net-workshop/blocks/blocks-logic.js';

const stage = (id) => BLOCK_STAGES.find((s) => s.id === id);
const questions = (id, seed) => makeBlockQuestions(stage(id), createRng(`${seed}:${id}`));
const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);

// ── 전부 나열한 묶음 (독립 계산의 바탕) ─────────────
const ALL = [];
for (let n = 0; n < 4 ** 9; n += 1) {
  const h = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  let v = n;
  for (let i = 0; i < 9; i += 1) {
    h[Math.floor(i / 3)][i % 3] = v & 3;
    v >>= 2;
  }
  ALL.push(h);
}
const COUNT = ALL.map(count);
const group = (keys) => {
  const groups = new Map();
  keys.forEach((k, i) => {
    const list = groups.get(k);
    if (list) list.push(i);
    else groups.set(k, [i]);
  });
  return groups;
};
// 그림 열쇠(pictureKey·lookKey)는 net-workshop-blocks.test.js가 광선 계산과 전부 견준 것이다 — 여기서는 묶음을 만드는 데만 쓴다
const PIC = ALL.map(pictureKey);
const LOOK = ALL.map(lookKey);
const BY_LOOK = group(LOOK);
const BY_PIC_TOP = group(PIC.map((k, i) => `${k}|${mapKey(topView(ALL[i]))}`));
const indexOf = (h) => {
  let n = 0;
  for (let i = 8; i >= 0; i -= 1) n = (n << 2) | h[Math.floor(i / 3)][i % 3];
  return n;
};
/** 그림만으로 개수가 정해지는가(통째로 옮긴 것은 같은 쌓기): 같아 보이는 쌓기들의 개수가 한 가지 */
const fixedByLook = (h) => new Set(BY_LOOK.get(LOOK[indexOf(h)]).map((j) => COUNT[j])).size === 1;
/** 그림과 위에서 본 모양이 같은 쌓기 전부 */
const alikesOf = (h) => BY_PIC_TOP.get(`${PIC[indexOf(h)]}|${mapKey(topView(h))}`).map((j) => ALL[j]);

test('단계 목록: 교과서 1·2차시와 짝지은 두 차시 × 세 단계, id가 전개도 단계와 겹치지 않는다', () => {
  assert.deepEqual(BLOCK_LESSONS.map((l) => [l.id, l.title]), [
    ['blocks-look', '어느 방향에서 보았을까'],
    ['blocks-top', '만든 모양과 위에서 본 모양'],
  ]);
  assert.deepEqual(BLOCK_STAGES.map((s) => [s.id, s.lesson, s.kind, s.count]), [
    ['blocks-play', 'blocks-look', 'play', 3],
    ['blocks-where', 'blocks-look', 'where', 4],
    ['blocks-scene', 'blocks-look', 'scene', 3],
    ['blocks-copy', 'blocks-top', 'copy', 2],
    ['blocks-count', 'blocks-top', 'count', 4],
    ['blocks-hidden', 'blocks-top', 'hidden', 2],
  ]);
  assert.deepEqual(BLOCK_STAGES.map((s) => s.title), ['쌓기 놀이터', '어느 방향에서 보았을까?', '이쪽에서 보면?', '똑같이 만들기', '모두 몇 개일까?', '숨겨진 쌓기나무']);
  assert.deepEqual(BLOCK_STAGES.map((s) => s.order), ['연습 주문', '관찰 주문', '관찰 주문', '따라 쌓기 주문', '셈 주문', '탐정 주문']);
  for (const s of BLOCK_STAGES) {
    assert.equal(s.area, 'blocks', s.id);
    assert.ok(!s.challenge, s.id);
    assert.ok(s.goal.length > 8 && s.goal.endsWith('요.'), s.id);
  }
  // 전개도 차시·단계와 id가 겹치지 않는다 (main.js가 둘을 이어 붙인다)
  const ids = [...STAGES, ...BLOCK_STAGES].map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  const lessons = [...LESSONS, ...BLOCK_LESSONS].map((l) => l.id);
  assert.equal(new Set(lessons).size, lessons.length);
  for (const s of BLOCK_STAGES) assert.ok(BLOCK_LESSONS.some((l) => l.id === s.lesson), s.id);
  for (const l of BLOCK_LESSONS) assert.equal(BLOCK_STAGES.filter((s) => s.lesson === l.id).length, 3, l.id);
});

test('같은 시드면 같은 문항, 문항마다 itemId가 다르다', () => {
  for (const s of BLOCK_STAGES) {
    const a = makeBlockQuestions(s, createRng(`7:${s.id}`));
    const b = makeBlockQuestions(s, createRng(`7:${s.id}`));
    assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), s.id);
    assert.equal(a.length, s.kind === 'play' ? 1 : s.count, s.id);
    assert.equal(new Set(a.map((q) => q.itemId)).size, a.length, s.id);
    for (const q of a) assert.ok(q.itemId.startsWith(`${s.id}:`), s.id);
  }
  assert.throws(() => makeBlockQuestions({ kind: 'nope' }, createRng(1)), /알 수 없는/);
  // 시드가 다르면 문항도 달라진다 (200개 가운데 서로 다른 문항 묶음이 150가지 이상)
  for (const id of ['blocks-where', 'blocks-copy', 'blocks-count', 'blocks-hidden']) {
    assert.ok(new Set(SEEDS.map((seed) => JSON.stringify(questions(id, seed)))).size > 150, id);
  }
});

test('1차시: 조형물 셋은 색·무늬·높이·이름이 모두 다르고, 배치는 네 방향의 모습이 모두 다르며 그림에서 가려진 것이 없다 (시드 200개)', () => {
  for (const key of ['id', 'name', 'height', 'face', 'mark']) assert.equal(new Set(SCULPTURES.map((s) => s[key])).size, SCULPTURES.length, key);
  assert.deepEqual(Object.values(DIR_LETTERS), ['가', '나', '다', '라']);
  let lined = 0;
  for (const seed of SEEDS) {
    for (const id of ['blocks-where', 'blocks-scene']) {
      const qs = questions(id, seed);
      // 네 방향이 고루: 문항의 방향이 서로 다르다
      assert.equal(new Set(qs.map((q) => q.dir)).size, qs.length, `${id} ${seed}`);
      for (const q of qs) {
        assert.equal(count(q.h), 6); // 3 + 2 + 1
        const views = AROUND.map((dir) => sceneKey(sceneFrom(q.h, q.color, dir)));
        assert.equal(new Set(views).size, 4, `${id} ${seed}`);
        assert.deepEqual(hiddenCells(q.h), []);
        for (const dir of AROUND) assert.equal(sceneKey(q.views[dir]), sceneKey(sceneFrom(q.h, q.color, dir)));
        // 어느 쪽에서는 가려지는 것이 있게 같은 줄이나 같은 칸에 둘이 있다
        const spots = [];
        q.color.forEach((row, y) => row.forEach((c, x) => {
          if (c) spots.push([x, y]);
        }));
        assert.equal(spots.length, 3);
        if (spots.some(([x, y], i) => spots.some(([x2, y2], j) => i < j && (x === x2 || y === y2)))) lined += 1;
      }
    }
  }
  assert.equal(lined, 200 * 7);
});

test('blocks-where 채점: 그 방향만 맞고, 틀리면 tag "보는 방향"과 두 모습을 가르는 까닭', () => {
  for (const seed of SEEDS.slice(0, 60)) {
    for (const q of questions('blocks-where', seed)) {
      assert.equal(sceneKey(q.picture), sceneKey(q.views[q.dir]));
      assert.equal(q.expected, DIR_LETTERS[q.dir]);
      for (const dir of AROUND) {
        const r = judgeDirection(q, dir);
        assert.equal(r.correct, dir === q.dir);
        assert.equal(r.tag, dir === q.dir ? null : BLOCK_TAGS.direction);
        assert.equal(r.expected, DIR_LETTERS[q.dir]);
        assert.ok(r.message.includes(`${DIR_LETTERS[dir]} 쪽에서 보면`), r.message);
        if (dir !== q.dir) assert.ok(r.message.endsWith(`${DIR_LETTERS[q.dir]} 쪽에서 본 모습이에요.`), r.message);
      }
    }
  }
  const [q] = questions('blocks-where', 1);
  assert.match(judgeDirection(q, q.dir).message, /^맞아요! . 쪽에서 보면 노란 탑이 (왼쪽|가운데|오른쪽)에 보여요\./);
});

test('blocks-scene 채점: 보기 넷은 네 방향의 모습, 화살표 쪽 그림만 맞다', () => {
  for (const seed of SEEDS.slice(0, 60)) {
    for (const q of questions('blocks-scene', seed)) {
      assert.deepEqual(q.options.map((o) => o.dir).sort(), [...AROUND].sort());
      assert.equal(q.options[q.expected - 1].dir, q.dir);
      for (let choice = 1; choice <= 4; choice += 1) {
        const r = judgeScene(q, choice);
        assert.equal(r.correct, choice === q.expected);
        assert.equal(r.tag, r.correct ? null : BLOCK_TAGS.direction);
        assert.equal(r.chosenDir, q.options[choice - 1].dir);
        assert.ok(r.message.length > 10);
      }
      assert.equal(judgeScene(q, 9).correct, false);
    }
  }
});

test('모습을 말로: 왼쪽부터 보이는 것, 가려진 것, 두 모습을 가르는 한 마디', () => {
  const h = [[1, 0, 0], [3, 0, 0], [0, 0, 2]];
  const color = [['pink', null, null], ['yellow', null, null], [null, null, 'blue']];
  const front = sceneFrom(h, color, 'front');
  const back = sceneFrom(h, color, 'back');
  const left = sceneFrom(h, color, 'left');
  assert.equal(describeScene(front), '왼쪽에 분홍 상자, 왼쪽에 노란 탑, 오른쪽에 파란 기둥이 보여요.');
  assert.equal(towerLine(front), '노란 탑이 왼쪽에 보여요.');
  assert.equal(towerLine(back), '노란 탑이 오른쪽에 보여요. 분홍 상자는 가려서 안 보여요.');
  assert.equal(tellApart(back, front), '노란 탑이 오른쪽에 있어요');
  // 노란 탑의 자리가 같으면(둘 다 가운데) 자리가 다른 다음 조형물로 가른다
  assert.equal(tellApart(left, sceneFrom(h, color, 'right')), '파란 기둥이 왼쪽에 있어요');
  // 자리가 모두 같으면 한쪽에서만 보이는 것으로
  const hide = [[2, 0, 0], [3, 0, 0], [0, 0, 0]];
  const hideColor = [['blue', null, null], ['yellow', null, null], [null, null, null]];
  assert.equal(tellApart(sceneFrom(hide, hideColor, 'back'), sceneFrom([[0, 0, 2], [0, 0, 3], [0, 0, 0]], [[null, null, 'blue'], [null, null, 'yellow'], [null, null, null]], 'front')), '파란 기둥은 가려서 안 보여요');
  assert.equal(spotName(2, 0), '1줄 3칸');
});

test('blocks-copy: 1번은 그림만으로 개수가 정해지는 모양, 2번은 숨길 자리가 있는 모양 (시드 200개, 전부 나열한 묶음과 견줌)', () => {
  for (const seed of SEEDS) {
    const [first, second] = questions('blocks-copy', seed);
    for (const q of [first, second]) {
      assert.ok(isConnectedTop(q.target), `${seed}`);
      assert.deepEqual(hiddenCells(q.target), []); // 보이는 대로 쌓은 것이 정답 모양이다
      assert.equal(q.expected, mapKey(q.target));
    }
    assert.ok(count(first.target) >= 4 && count(first.target) <= 6, `${seed}`);
    assert.ok(Math.max(...first.target.flat()) >= 2);
    assert.equal(first.fixed, true);
    assert.equal(first.alt, null);
    assert.ok(fixedByLook(first.target), `${seed} ${mapKey(first.target)}`);
    assert.ok(count(second.target) >= 5 && count(second.target) <= 8, `${seed}`);
    assert.equal(second.fixed, false);
    assert.ok(!fixedByLook(second.target), `${seed} ${mapKey(second.target)}`);
    // 같은 그림인데 개수가 다른 쌓기
    assert.equal(lookKey(second.alt), lookKey(second.target));
    assert.equal(count(second.alt), count(second.target) + 1);
    assert.notEqual(lookKey(first.target), lookKey(second.target));
  }
});

test('그림만으로 개수가 정해지는가(countFixedByPicture): 바닥이 이어진 4~12개 모양 전부에서 나열한 값과 같다', () => {
  let checked = 0;
  let fixed = 0;
  ALL.forEach((h, i) => {
    if (COUNT[i] < 4 || COUNT[i] > 12 || !isConnectedTop(h)) return;
    // 정해지는 모양은 모두, 나머지는 일곱 가운데 하나를 본다(시간)
    const expected = fixedByLook(h);
    if (!expected && i % 7 !== 0) return;
    checked += 1;
    if (expected) fixed += 1;
    assert.equal(countFixedByPicture(h), expected, mapKey(h));
  });
  assert.equal(fixed, 8576);
  assert.ok(checked > 15000);
  assert.equal(shiftsOf([[0, 0, 0], [0, 2, 0], [0, 0, 0]]).length, 9);
  assert.equal(shiftsOf([[1, 1, 1], [0, 0, 0], [0, 0, 0]]).length, 3);
});

test('blocks-copy 채점: 같은 쪽에서 본 모습이 같으면 맞음(통째로 옮긴 것·숨긴 것 포함), 다르면 어디가 다른지', () => {
  for (const seed of SEEDS.slice(0, 80)) {
    for (const q of questions('blocks-copy', seed)) {
      assert.equal(judgeLook(q, q.target).correct, true);
      for (const moved of shiftsOf(q.target)) assert.equal(judgeLook(q, moved).correct, true);
      if (q.alt) {
        assert.equal(judgeLook(q, q.alt).correct, true);
        // 내 개수와 다른 쪽을 보여 준다
        assert.equal(mapKey(otherLook(q, q.target)), mapKey(q.alt));
        assert.equal(mapKey(otherLook(q, q.alt)), mapKey(q.target));
      } else assert.equal(otherLook(q, q.target), null);
      // 모든 채점은 전부 나열한 묶음과 같다: 무작위 쌓기 30개
      const rng = createRng(`look:${seed}`);
      for (let n = 0; n < 30; n += 1) {
        const mine = ALL[rng.int(1, ALL.length - 1)];
        const r = judgeLook(q, mine);
        assert.equal(r.correct, LOOK[indexOf(mine)] === LOOK[indexOf(q.target)]);
        if (!r.correct) assert.ok(Object.values(BLOCK_TAGS).includes(r.tag), r.tag);
      }
      const empty = judgeLook(q, emptyMap());
      assert.deepEqual([empty.correct, empty.empty], [false, true]);
    }
  }
  // tag: 좌우로 뒤집음 · 앞과 옆을 바꿈 · 자리가 다름 · 높이만 다름
  const q = { target: [[2, 1, 0], [0, 1, 0], [0, 0, 0]], expected: 'x' };
  assert.equal(judgeLook(q, mirrorMap(q.target)).tag, BLOCK_TAGS.mirror);
  assert.equal(judgeLook(q, swapMap(q.target)).tag, BLOCK_TAGS.frontSide);
  assert.equal(judgeLook(q, [[1, 1, 0], [0, 2, 0], [0, 0, 0]]).tag, BLOCK_TAGS.tallest);
  assert.equal(judgeLook(q, [[2, 1, 1], [0, 0, 0], [0, 0, 0]]).tag, BLOCK_TAGS.floor);
  assert.deepEqual(MORE_CLUES.map((c) => c.id), ['top', 'color', 'size']);
  assert.equal(MORE_CLUE_ANSWER, 'top');
});

test('blocks-count: 네 문항 모두 그림과 위에서 본 모양으로 쌓기가 하나로 정해지고, 둘은 숨겨진 쌓기나무가 있다 (시드 200개)', () => {
  for (const seed of SEEDS) {
    const qs = questions('blocks-count', seed);
    assert.equal(qs.filter((q) => q.hidden.length > 0).length, 2, `${seed}`);
    assert.equal(new Set(qs.map((q) => mapKey(q.target))).size, 4, `${seed}`);
    for (const q of qs) {
      assert.ok(isConnectedTop(q.target));
      assert.ok(q.expected >= 5 && q.expected <= 10, `${seed} ${q.expected}`);
      assert.equal(q.expected, count(q.target));
      assert.equal(alikesOf(q.target).length, 1, `${seed} ${mapKey(q.target)}`);
      assert.deepEqual(q.top, topView(q.target));
      assert.equal(q.seen, q.expected - q.hidden.length);
      assert.equal(q.spots, count(q.top));
      // 보기 넷: 서로 다른 자연수, 작은 수부터, 정답·보이는 것만 센 수·위에서 본 모양의 칸 수가 들어 있다
      assert.equal(q.options.length, 4);
      assert.deepEqual(q.options, [...new Set(q.options)].sort((a, b) => a - b));
      assert.ok(q.options.every((n) => Number.isInteger(n) && n > 0));
      for (const n of [q.expected, q.seen, q.spots]) assert.ok(q.options.includes(n), `${seed} ${n}`);
      for (const n of q.options) {
        const r = judgeCount(q, n);
        assert.equal(r.correct, n === q.expected);
        assert.equal(r.tag, n === q.expected ? null : n === q.spots ? BLOCK_TAGS.floor : BLOCK_TAGS.unseen);
        assert.ok(r.message.includes(`모두 ${q.expected}개예요.`), r.message);
      }
    }
  }
  assert.equal(layerSentence([[3, 1, 0], [1, 0, 0], [0, 0, 0]]), '1층에 3개, 2층에 1개, 3층에 1개, 모두 5개예요.');
});

test('blocks-hidden: 한 문항은 여러 가지(가려진 한 자리의 높이만 다름), 한 문항은 하나뿐(자리마다 맨 위가 보임) (시드 200개)', () => {
  for (const seed of SEEDS) {
    const qs = questions('blocks-hidden', seed);
    assert.deepEqual(qs.map((q) => q.many).sort(), [false, true], `${seed}`);
    for (const q of qs) {
      const alikes = alikesOf(q.target);
      assert.deepEqual(q.alikes.map(mapKey).sort(), alikes.map(mapKey).sort(), `${seed}`);
      assert.deepEqual(q.top, topView(q.target));
      assert.deepEqual(q.counts, [...new Set(alikes.map(count))].sort((a, b) => a - b));
      assert.equal(q.expected, q.many ? 'yes' : 'no');
      if (q.many) {
        assert.ok(alikes.length >= 2 && alikes.length <= 3);
        assert.equal(count(q.target), Math.min(...alikes.map(count)));
        const [x, y] = q.spot;
        // 다른 자리는 모두 같고 그 자리만 다르다
        for (const g of alikes) g.forEach((row, gy) => row.forEach((v, gx) => assert.ok((gx === x && gy === y) || v === q.target[gy][gx])));
        assert.deepEqual(q.heights, alikes.map((g) => g[y][x]).sort((a, b) => a - b));
      } else {
        assert.equal(alikes.length, 1);
        assert.equal(q.spot, null);
      }
    }
  }
});

test('blocks-hidden 채점: 맞게 쌓기 → 예상 → 다른 개수로 한 번 더. 같은 쌓기를 또 내면 기록하지 않는다', () => {
  for (const seed of SEEDS.slice(0, 80)) {
    for (const q of questions('blocks-hidden', seed)) {
      for (const g of q.alikes) {
        assert.equal(judgeBuild(q, g).correct, true);
        assert.equal(judgeBuild(q, toCorner(g)).correct, true); // 판 위에서 통째로 옮겨도 맞다
      }
      // 무작위 쌓기: 맞음 = 그림과 위에서 본 모양이 같은 쌓기 가운데 하나(통째로 옮긴 것 포함)
      const rng = createRng(`build:${seed}`);
      const corners = new Set(q.alikes.map((g) => mapKey(toCorner(g))));
      for (let n = 0; n < 30; n += 1) {
        const mine = n < 10 ? rng.pick(shiftsOf(rng.pick(q.alikes))) : ALL[rng.int(1, ALL.length - 1)];
        const r = judgeBuild(q, mine);
        assert.equal(r.correct, corners.has(mapKey(toCorner(mine))));
        assert.equal(fitsGiven(q, mine), r.correct);
        if (!r.correct) {
          const topOk = mapKey(toCorner(topView(mine))) === mapKey(toCorner(q.top));
          assert.equal(r.tag, topOk ? BLOCK_TAGS.tallest : BLOCK_TAGS.floor);
          assert.equal(r.topOk, topOk);
        }
      }
      assert.equal(judgeBuild(q, emptyMap()).empty, true);
      // 예상
      for (const answer of ['yes', 'no']) {
        const r = judgeGuess(q, answer);
        assert.equal(r.correct, answer === q.expected);
        assert.equal(r.tag, r.correct ? null : BLOCK_TAGS.manyCounts);
        assert.ok(r.message.length > 20);
      }
      if (!q.many) continue;
      // 다른 개수로 한 번 더
      const [first, second] = q.alikes;
      assert.deepEqual(judgeOther(q, first, first).status, 'same');
      assert.deepEqual(judgeOther(q, toCorner(first), first).status, 'same');
      const ok = judgeOther(q, second, first);
      assert.deepEqual([ok.status, ok.correct], ['ok', true]);
      assert.ok(ok.message.includes(`${count(first)}개`) && ok.message.includes(`${count(second)}개`));
      const bad = judgeOther(q, mirrorMap(swapMap(first)).map((row) => row.map((v) => (v ? 1 : 0))), first);
      assert.ok(bad.status === 'wrong' || bad.status === 'ok');
      assert.equal(judgeOther(q, [[3, 3, 3], [3, 3, 3], [3, 3, 3]], first).status, 'wrong');
      // 힌트: 주어진 위에서 본 모양의 자리 하나와 그 높이 (가려진 자리는 알려 주지 않는다)
      const hint = buildHint(q, emptyMap());
      assert.equal(q.target[hint.y][hint.x], hint.value);
      assert.ok(!(hint.x === q.spot[0] && hint.y === q.spot[1]));
      assert.ok(hint.text.includes(spotName(hint.x, hint.y)));
    }
  }
  // 그림만 주어진 문항(blocks-copy)의 힌트는 글만
  const [copy] = questions('blocks-copy', 1);
  assert.match(buildHint(copy, emptyMap()).text, /보이는 쌓기나무만 세면 \d+개예요\. 가장 높은 곳은 \d층이에요\./);
});

test('채점 tag는 모두 기획서 4절 표의 말이고, 화면 문장은 교과서 말("만든 모양")을 쓴다', () => {
  assert.deepEqual(Object.values(BLOCK_TAGS).sort(), ['가장 높은 층', '개수가 여러 가지', '바닥에 닿은 면', '보는 방향', '보이지 않는 쌓기나무', '앞과 옆', '좌우 뒤집힘'].sort());
  const texts = BLOCK_STAGES.flatMap((s) => [s.title, s.goal, s.order]);
  for (const seed of SEEDS.slice(0, 40)) {
    for (const q of questions('blocks-where', seed)) for (const dir of AROUND) texts.push(judgeDirection(q, dir).message);
    for (const q of questions('blocks-scene', seed)) for (const c of [1, 2, 3, 4]) texts.push(judgeScene(q, c).message, describeScene(q.options[c - 1].picture));
    for (const q of questions('blocks-count', seed)) for (const n of q.options) texts.push(judgeCount(q, n).message);
    for (const q of questions('blocks-copy', seed)) texts.push(judgeLook(q, q.target).message, judgeLook(q, mirrorMap(q.target)).message, buildHint(q, emptyMap()).text);
    for (const q of questions('blocks-hidden', seed)) {
      texts.push(judgeBuild(q, q.target).message, judgeBuild(q, [[1, 0, 0], [0, 0, 0], [0, 0, 0]]).message, judgeGuess(q, 'yes').message, judgeGuess(q, 'no').message);
      if (q.many) texts.push(judgeOther(q, q.alikes[1], q.alikes[0]).message, judgeOther(q, q.alikes[0], q.alikes[0]).message);
    }
  }
  for (const t of texts) {
    assert.ok(typeof t === 'string' && t.trim().length > 0);
    assert.doesNotMatch(t, /쌓은 모양|undefined|null|NaN/, t);
    // 조사: 받침에 맞지 않는 꼴이 없다 (예: "탑가", "상자이", "기둥는", "개로"는 맞고 "칸를"은 틀림)
    assert.doesNotMatch(t, /탑가|탑는|상자이 |상자은|기둥가|기둥는|칸를|칸는 /, t);
  }
});

// ── 점수: 엔진과 독립 계산을 견준다 ────────────────
/**
 * 독립 계산(docs/engine.md 10절의 점수 표만 보고):
 *   그 문항을 처음 시도에 맞힘 +2 · 같은 문항을 틀린 뒤 다시 맞힘 +1 · 틀림 0
 *   다시 일어서기 +1: 어떤 문항을 처음에 틀린 뒤, 다음 새 문항을 처음 시도에 맞혔을 때(연달아 여러 문항을 틀려도 한 번)
 *   연속: 처음 시도에 연달아 맞힌 수가 3의 배수가 될 때마다 +1 (틀리면 0부터 다시)
 *   설명 맞힘 +2 (문항마다 한 번)
 */
function indepScore(steps) {
  const tried = new Map(); // itemId → 맞혔는가
  const explained = new Set();
  let xp = 0;
  let streak = 0;
  let fell = false; // 틀린 뒤 아직 다시 일어서지 않았다
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

/** 쌓기나무 단계 한 판의 답 순서를 무작위로 만든다: p = 한 번의 시도가 맞을 확률 */
function randomPlay(stageId, rng, p) {
  const s = stage(stageId);
  const steps = [];
  const tryUntil = (itemId) => {
    for (;;) {
      const correct = rng.next() < p;
      steps.push({ itemId, correct });
      if (correct) return;
    }
  };
  if (s.kind === 'where' || s.kind === 'scene' || s.kind === 'count') {
    for (let i = 1; i <= s.count; i += 1) steps.push({ itemId: `${s.id}:${i}`, correct: rng.next() < p });
  } else if (s.kind === 'copy') {
    for (let i = 1; i <= s.count; i += 1) {
      tryUntil(`${s.id}:${i}`);
      if (i === 2 && rng.next() < p) steps.push({ itemId: `${s.id}:${i}`, explain: true });
    }
  } else if (s.kind === 'hidden') {
    for (let i = 1; i <= s.count; i += 1) {
      tryUntil(`${s.id}:${i}:build`);
      steps.push({ itemId: `${s.id}:${i}:guess`, correct: rng.next() < p });
      if (i === 1) tryUntil(`${s.id}:${i}:other`);
    }
  }
  return steps;
}

function enginePlay(steps, startStars = 0) {
  const play = createPlayReward({ startStars });
  for (const s of steps) {
    if (s.explain) play.event('explain', { correct: true, itemId: s.itemId });
    else play.answer({ itemId: s.itemId, correct: s.correct });
  }
  return play;
}

test('점수: 쌓기나무 단계의 답 순서 6,000판에서 엔진의 점수 = 독립 계산, 일부러 틀려서 이득 보는 길 0', () => {
  const rng = createRng('blocks-score');
  const ids = ['blocks-where', 'blocks-scene', 'blocks-copy', 'blocks-count', 'blocks-hidden'];
  let plays = 0;
  for (let n = 0; n < 6000; n += 1) {
    const id = ids[n % ids.length];
    const steps = randomPlay(id, rng, [0.3, 0.6, 0.85, 1][n % 4]);
    const play = enginePlay(steps);
    assert.equal(play.xp(), indepScore(steps), `${id} ${JSON.stringify(steps)}`);
    // 모두 처음에 맞힌 판보다 많이 받을 수 없다
    const best = indepScore(randomPlay(id, createRng(`perfect:${n}`), 1));
    assert.ok(play.xp() <= best, `${id} ${play.xp()} > ${best}`);
    // 별 3개 단계를 다시 하면 연습 점수가 없다(되풀이로 쌓이지 않는다)
    assert.equal(enginePlay(steps, 3).xp(), 0);
    plays += 1;
  }
  assert.equal(plays, 6000);
  // 놀이터는 채점하지 않는다: 답이 없으니 연습 점수 0, 단계 완료 +5와 별 3개 +6은 처음 한 번만
  assert.equal(createPlayReward().xp(), 0);
  assert.equal(stageXp({ prevStars: 0, stars: 3, cleared: true }).total, XP.stageClear + 3 * XP.perStar);
  assert.equal(stageXp({ prevStars: 3, stars: 3, cleared: true }).total, 0);
});

test('차시 점수: 모두 처음에 맞히는 학생이 받는 점수(칭호 기준 0·40·100·180·300과 견줄 값)', () => {
  const lessonXp = (lessonId) => BLOCK_STAGES.filter((s) => s.lesson === lessonId).reduce((sum, s) => {
    const steps = s.kind === 'play' ? [] : randomPlay(s.id, createRng('all-correct'), 1);
    const answers = steps.filter((x) => !x.explain);
    const stars = s.kind === 'play' ? 3 : starsFromAccuracy(answers.filter((x) => x.correct).length / answers.length);
    return sum + indepScore(steps) + stageXp({ prevStars: 0, stars, cleared: true }).total;
  }, 0);
  // 1차시: 놀이터 11 + 방향 4문항(8 + 연속 1 + 11) + 장면 3문항(6 + 연속 1 + 11) = 49
  // 2차시: 따라 쌓기 2문항(4 + 설명 2 + 11) + 개수 4문항(8 + 1 + 11) + 숨겨진 쌓기나무 5답(10 + 1 + 11) = 59
  assert.deepEqual([lessonXp('blocks-look'), lessonXp('blocks-top')], [49, 59]);
});
