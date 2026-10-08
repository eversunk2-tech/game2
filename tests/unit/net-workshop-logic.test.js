import assert from 'node:assert/strict';
import { test } from 'node:test';
import { josa } from '../../src/shared/core/korean.js';
import { createRng } from '../../src/shared/core/random.js';
import { checkNet, fromCells } from '../../src/games/net-workshop/fold.js';
import {
  LESSONS,
  STAGES,
  TAGS,
  TAG_OF_PROBLEM,
  judgeNetAnswer,
  judgeOpposite,
  judgeSlot,
  makeQuestions,
  placedNet,
  primaryProblem,
} from '../../src/games/net-workshop/logic.js';

const stage = (id) => STAGES.find((s) => s.id === id);

/**
 * 정육면체 감싸기 — fold.js를 쓰지 않는 독립 계산 (net-workshop-fold.test.js와 같은 방법).
 * 칸마다 놓인 면의 바깥 법선 'x,y,z'. 6칸이 서로 다른 6면을 덮으면 전개도다.
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
const wrapsCube = (cells) => cells.length === 6 && new Set(wrap(cells)).size === 6;
const cellsOf = (net) => net.faces.map((f) => f.cell);
const SEEDS = Array.from({ length: 40 }, (_, i) => i);
const TAG_VALUES = new Set(Object.values(TAGS));

// 기획서 3절 오개념 표의 tag (글자까지 같아야 학습 기록이 기획서와 맞는다)
const SPEC_TAGS = [
  '면이 겹침', '한 꼭짓점에 세 면', '면의 개수', '여러 가지 전개도', '마주 보는 면', '만나는 선분',
  '맞닿는 모서리 길이', '마주 보는 면은 합동', '옆면 수 = 밑면 변 수', '두 밑면의 위치', '두 밑면은 합동',
  '옆면 가로 = 밑면 변', '옆면 세로 = 높이', '옆면 가로 = 밑면 둘레',
];

/** 채점 결과의 공통 조건: tag는 오개념 표 안, 문장은 비어 있지 않고 조사가 맞음 */
function checkResult(result, label) {
  assert.equal(typeof result.message, 'string', label);
  assert.ok(result.message.length > 5, label);
  assert.doesNotMatch(result.message, /undefined|NaN|null|\?/, label);
  // "면" 뒤에는 받침이 있는 조사(과·이·은·을)가 와야 한다
  assert.doesNotMatch(result.message, /면(와|가|는|를)[\s.,]/, `${label}: ${result.message}`);
  if (result.correct) {
    assert.equal(result.tag, null, label);
    assert.match(result.message, /^맞아요!/, label);
  } else {
    assert.ok(TAG_VALUES.has(result.tag), `${label}: ${result.tag}`);
  }
}

test('TAGS는 기획서 오개념 표와 같고, problem → tag 표도 그 안에 있다', () => {
  assert.deepEqual(new Set(Object.values(TAGS)), new Set(SPEC_TAGS));
  for (const tag of Object.values(TAG_OF_PROBLEM)) assert.ok(TAG_VALUES.has(tag), tag);
  assert.equal(josa('면', '과/와'), '면과'); // 문장에 쓰는 조사
});

test('단계: id가 겹치지 않고, 모두 차시가 있고, 정육면체 차시는 4단계(판별 5 · 마주 보는 면 4 · 면 붙이기 3 · 내 맘대로 전개도 3가지)', () => {
  const ids = STAGES.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(LESSONS.map((l) => l.id), ['cube']);
  for (const s of STAGES) assert.ok(LESSONS.some((l) => l.id === s.lesson), s.id);
  for (const l of LESSONS) assert.equal(STAGES.filter((s) => s.lesson === l.id && !s.challenge).length, 4, l.id);
  assert.deepEqual(STAGES.map((s) => [s.id, s.kind, s.count]), [
    ['cube-judge', 'judge', 5], ['cube-opposite', 'opposite', 4], ['cube-complete', 'complete', 3], ['cube-free', 'free', 3],
  ]);
  // 도전 주문서(cube-dice, cube-dex)는 N2에서 만든다
  assert.equal(STAGES.filter((s) => s.challenge).length, 0);
  // 작업 지시서의 주문 이름 (spec 16-3)
  assert.deepEqual(STAGES.map((s) => s.order), ['검사 주문', '짝 찾기 주문', '수선 주문', '설계 주문']);
});

test('같은 시드면 같은 문항, 다른 시드면 대체로 다른 문항', () => {
  const summary = (qs) => JSON.stringify(qs.map((q) => [q.itemId, q.net.faces.map((f) => [f.label, f.cell])]));
  assert.deepEqual(makeQuestions(stage('cube-free'), createRng('1:x')), []); // 자유 배치는 학생이 직접 만든다
  for (const s of STAGES.filter((x) => x.kind !== 'free')) {
    assert.equal(summary(makeQuestions(s, createRng('1:x'))), summary(makeQuestions(s, createRng('1:x'))), s.id);
    const many = new Set(SEEDS.map((seed) => summary(makeQuestions(s, createRng(seed)))));
    assert.ok(many.size > SEEDS.length / 2, s.id);
  }
});

test('판별 5문항: 유효 2(1-4-1 하나 + 1-4-1 아닌 꼴 하나) · 무효 3(겹침 · 2×2 · 면 개수), 의도한 까닭이 나온다', () => {
  for (const seed of SEEDS) {
    const qs = makeQuestions(stage('cube-judge'), createRng(seed));
    assert.equal(qs.length, 5);
    const valid = qs.filter((q) => q.valid);
    assert.equal(valid.length, 2);
    assert.equal(valid.filter((q) => q.family !== '1-4-1').length, 1);
    assert.equal(valid.filter((q) => q.family === '1-4-1').length, 1);
    for (const q of qs) {
      assert.equal(q.valid, wrapsCube(cellsOf(q.net)), q.itemId); // 독립 계산과 비교
      assert.equal(q.expected, q.valid ? 'yes' : 'no');
      assert.match(q.itemId, /^cube-judge:[1-5]:[\w-]+$/);
      if (!q.valid) assert.equal(primaryProblem(q.problems).type, q.intended, q.itemId);
    }
    assert.deepEqual(qs.filter((q) => !q.valid).map((q) => q.intended).sort(), ['face-count', 'overlap', 'vertex-full']);
    // 겹침 문항은 늘 한 줄 5칸이나 같은 쪽 날개 꼴
    assert.match(qs.find((q) => q.intended === 'overlap').name, /^(line5|same-side)-/);
  }
});

test('판별 채점: 오답이면 까닭 tag, 유효 전개도를 "안 돼요"면 여러 가지 전개도', () => {
  for (const seed of SEEDS.slice(0, 10)) {
    for (const q of makeQuestions(stage('cube-judge'), createRng(seed))) {
      for (const answer of ['yes', 'no']) {
        const r = judgeNetAnswer(q, answer);
        assert.equal(r.correct, answer === q.expected);
        checkResult(r, `${q.itemId} ${answer}`);
        if (!r.correct && q.valid) assert.equal(r.tag, TAGS.variety);
        if (!r.correct && !q.valid) {
          const want = { overlap: TAGS.overlap, 'vertex-full': TAGS.vertex, 'face-count': TAGS.faceCount }[q.intended];
          assert.equal(r.tag, want, q.itemId);
        }
      }
    }
  }
  // 기획서의 예시 문장
  const net = fromCells([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [2, 1]], { labels: ['가', '나', '다', '라', '마', '바'] });
  const q = { valid: false, expected: 'no', net, problems: checkNet(net).problems };
  assert.match(judgeNetAnswer(q, 'yes').message, /^[가-바] 면과 [가-바] 면이 같은 자리에 겹쳐요\. 그래서 다른 한쪽이 비어요\.$/);
});

test('마주 보는 면 4문항: 정답은 접었을 때 법선이 반대인 면, ★ 면 곁에 이웃·대각선 면이 있다', () => {
  for (const seed of SEEDS) {
    const qs = makeQuestions(stage('cube-opposite'), createRng(seed));
    assert.equal(qs.length, 4);
    assert.equal(new Set(qs.map((q) => q.name)).size, 4);
    for (const q of qs) {
      // 독립 계산: 감싸기에서 ★ 면과 법선이 반대인 면이 정답
      const normals = wrap(cellsOf(q.net));
      assert.equal(new Set(normals).size, 6, q.itemId);
      const starIndex = q.net.faces.findIndex((f) => f.id === q.star);
      const opposite = normals[starIndex].split(',').map((v) => -Number(v) + 0).join(',');
      assert.equal(q.answer, q.net.faces[normals.indexOf(opposite)].id, q.itemId);
      const star = q.net.faces.find((f) => f.id === q.star);
      const near = (f, kind) => (kind === 'edge'
        ? Math.abs(f.cell[0] - star.cell[0]) + Math.abs(f.cell[1] - star.cell[1]) === 1
        : Math.abs(f.cell[0] - star.cell[0]) === 1 && Math.abs(f.cell[1] - star.cell[1]) === 1);
      assert.ok(q.net.faces.some((f) => near(f, 'edge')) && q.net.faces.some((f) => near(f, 'diagonal')), q.itemId);
      for (const f of q.net.faces) {
        if (f.id === q.star) continue;
        const r = judgeOpposite(q, f.id);
        assert.equal(r.correct, f.id === q.answer);
        assert.equal(r.expected, q.answerLabel);
        checkResult(r, `${q.itemId} ${f.label}`);
        if (!r.correct) assert.equal(r.tag, TAGS.opposite);
      }
    }
  }
});

test('면 붙이기 3문항: 보이는 자리 4~6곳, 정답 1~2곳 · 오답이 정답보다 적지 않음, 판정이 맞다', () => {
  for (const seed of SEEDS) {
    const qs = makeQuestions(stage('cube-complete'), createRng(seed));
    assert.equal(qs.length, 3);
    for (const q of qs) {
      assert.equal(q.cells.length, 5);
      assert.ok(q.slots.length >= 4 && q.slots.length <= 6, `${q.itemId}: ${q.slots.length}`);
      const nRight = q.slots.filter((s) => s.ok).length;
      const nWrong = q.slots.length - nRight;
      assert.ok(nRight >= 1 && nRight <= 2, `${q.itemId}: 정답 ${nRight}`);
      assert.ok(nWrong >= 2 && nWrong >= nRight, `${q.itemId}: 오답 ${nWrong} < 정답 ${nRight}`);
      assert.equal(new Set(q.slots.map((s) => s.key)).size, q.slots.length);
      const taken = new Set(q.cells.map(([x, y]) => `${x},${y}`));
      for (const s of q.slots) {
        assert.ok(!taken.has(s.key), `${q.itemId}: 이미 있는 칸 ${s.key}`);
        assert.equal(s.ok, wrapsCube([...q.cells, s.cell]), `${q.itemId} ${s.key}`); // 독립 계산과 비교
        const r = judgeSlot(q, s.key);
        assert.equal(r.correct, s.ok);
        checkResult(r, `${q.itemId} ${s.key}`);
        if (!r.correct) assert.ok([TAGS.overlap, TAGS.vertex].includes(r.tag), r.tag);
      }
      // 마지막 면 이름이 붙인 전개도의 새 면 이름
      assert.equal(placedNet(q, q.slots[0].cell).faces.at(-1).label, q.missingLabel);
    }
  }
});
