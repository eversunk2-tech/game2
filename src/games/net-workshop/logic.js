/**
 * 전개도 접기 공방의 규칙 (순수 함수). 화면은 main.js와 play-*.js.
 * 문항은 ctx.rng로 만든다. 같은 시드면 같은 문항이 나와서 e2e 테스트도 정답을 안다.
 * 검사: tests/unit/net-workshop-logic.test.js
 */
import { SYMMETRY_COUNT, LABELS, cellKey, checkNet, completionSlots, fromCells, oppositeFace, transformCells } from './fold.js';
import { CUBE_NETS, FACE_COUNT_NETS, INVALID_HEXOMINOES } from './nets-data.js';

/** 차시 묶음. 아직 만들지 않은 차시(직육면체·각기둥·원기둥)는 넣지 않는다. */
export const LESSONS = [
  { id: 'cube', title: '정육면체의 전개도' },
];

/** kind: judge(판별) · opposite(마주 보는 면 누르기) · complete(면 붙이기) */
export const STAGES = [
  {
    id: 'cube-judge',
    lesson: 'cube',
    kind: 'judge',
    count: 6,
    title: '접힐까, 안 접힐까?',
    goal: '전개도를 접으면 정육면체가 될지 골라요.',
  },
  {
    id: 'cube-opposite',
    lesson: 'cube',
    kind: 'opposite',
    count: 5,
    title: '마주 보는 면',
    goal: '접었을 때 ★ 면과 마주 보는 면을 찾아 눌러요.',
  },
  {
    id: 'cube-complete',
    lesson: 'cube',
    kind: 'complete',
    count: 4,
    title: '한 면을 붙여요',
    goal: '남은 한 면을 알맞은 자리에 붙여 정육면체 전개도를 완성해요.',
  },
];

/** 오개념 tag (기획서 3절 표와 글자까지 같게) */
export const TAGS = Object.freeze({
  overlap: '면이 겹침',
  vertex: '한 꼭짓점에 세 면',
  faceCount: '면의 개수',
  variety: '여러 가지 전개도',
  opposite: '마주 보는 면',
  meetingEdge: '만나는 선분',
  edgeLength: '맞닿는 모서리 길이',
  oppositeCongruent: '마주 보는 면은 합동',
  sideCount: '옆면 수 = 밑면 변 수',
  basePosition: '두 밑면의 위치',
  baseCongruent: '두 밑면은 합동',
  sideWidthEdge: '옆면 가로 = 밑면 변',
  sideHeight: '옆면 세로 = 높이',
  sideWidthCircumference: '옆면 가로 = 밑면 둘레',
});

/** checkNet의 problem type → 오개념 tag */
export const TAG_OF_PROBLEM = Object.freeze({
  'face-count': TAGS.faceCount,
  'vertex-full': TAGS.vertex,
  overlap: TAGS.overlap,
  // 정육면체에서 면이 6개인데 빈 곳이 생기면 다른 곳에서 면이 겹친 것이다.
  gap: TAGS.overlap,
  'edge-length': TAGS.edgeLength,
});

/** 까닭을 하나만 말할 때 먼저 고르는 순서 */
const PROBLEM_ORDER = ['face-count', 'vertex-full', 'overlap', 'edge-length', 'gap', 'disconnected'];

export function primaryProblem(problems) {
  for (const type of PROBLEM_ORDER) {
    const found = problems.find((p) => p.type === type);
    if (found) return found;
  }
  return problems[0] ?? null;
}

const labelOf = (net, id) => net.faces.find((f) => f.id === id)?.label ?? '?';
const byLabelOrder = (a, b) => LABELS.indexOf(a) - LABELS.indexOf(b);

/** 까닭 문장 (판별 단계) */
export function explainProblem(net, problem) {
  if (!problem) return '';
  if (problem.type === 'face-count') {
    const more = problem.count > problem.expected;
    return `정육면체는 면이 ${problem.expected}개예요. 이 전개도는 면이 ${problem.count}개라서 ${more ? '접으면 면이 겹쳐요' : '한 곳이 비어요'}.`;
  }
  if (problem.type === 'vertex-full') {
    return '정육면체의 한 꼭짓점에는 면이 3개만 모여요. 네 면이 한 점에 모이면 접을 수 없어요.';
  }
  if (problem.type === 'overlap') {
    const [a, b] = problem.faces.map((id) => labelOf(net, id)).sort(byLabelOrder);
    return `${a} 면과 ${b} 면이 같은 자리에 겹쳐요. 그래서 다른 한쪽이 비어요.`;
  }
  return '접으면 한 곳이 비어요. 정육면체가 되려면 모든 모서리가 맞닿아야 해요.';
}

// ── 문항 만들기 ─────────────────────────────
/** 무작위로 돌리거나 뒤집되, 가로가 세로보다 길거나 같게 놓는다 */
export function orientCells(cells, rng) {
  const wide = [];
  for (let k = 0; k < SYMMETRY_COUNT; k += 1) {
    const moved = transformCells(cells, k);
    const w = Math.max(...moved.map((c) => c[0])) + 1;
    const hgt = Math.max(...moved.map((c) => c[1])) + 1;
    if (w >= hgt) wide.push(moved);
  }
  return rng.pick(wide);
}

const labelsFor = (count, rng) => rng.shuffle(LABELS.slice(0, count));
const itemId = (stage, number, name) => `${stage.id}:${number}:${name}`;

function makeJudgeQuestions(stage, rng) {
  const cross141 = CUBE_NETS.filter((n) => n.family === '1-4-1');
  const others = CUBE_NETS.filter((n) => n.family !== '1-4-1');
  const overlapPool = INVALID_HEXOMINOES.filter((n) => n.shape === 'line5' || n.shape === 'same-side');
  const blockPool = INVALID_HEXOMINOES.filter((n) => n.shape === 'block');
  // 유효 3 (1-4-1 하나 + 1-4-1이 아닌 꼴 둘), 무효 3 (겹침 · 2×2 덩어리 · 면 개수)
  const items = rng.shuffle([
    { ...rng.pick(cross141), intended: null },
    ...rng.sample(others, 2).map((n) => ({ ...n, intended: null })),
    { ...rng.pick(overlapPool), intended: 'overlap' },
    { ...rng.pick(blockPool), intended: 'vertex-full' },
    { ...rng.pick(FACE_COUNT_NETS), intended: 'face-count' },
  ]);
  return items.map((item, i) => {
    const cells = orientCells(item.cells, rng);
    const net = fromCells(cells, { labels: labelsFor(cells.length, rng) });
    const { ok, problems } = checkNet(net);
    return {
      kind: 'judge',
      number: i + 1,
      itemId: itemId(stage, i + 1, item.name),
      name: item.name,
      family: item.family ?? null,
      intended: item.intended,
      net,
      valid: ok,
      problems,
      expected: ok ? 'yes' : 'no',
    };
  });
}

const isNeighbor = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;
const isDiagonal = (a, b) => Math.abs(a[0] - b[0]) === 1 && Math.abs(a[1] - b[1]) === 1;

/** 두 칸 사이에 한 칸을 두고 한 줄로 이어졌나 (한 줄 세 면의 양 끝) */
function inLineOfThree(net, a, b) {
  const [x1, y1] = a.cell;
  const [x2, y2] = b.cell;
  const straight = (x1 === x2 && Math.abs(y1 - y2) === 2) || (y1 === y2 && Math.abs(x1 - x2) === 2);
  if (!straight) return false;
  const mid = cellKey([(x1 + x2) / 2, (y1 + y2) / 2]);
  return net.faces.some((f) => cellKey(f.cell) === mid);
}

function makeOppositeQuestions(stage, rng) {
  return rng.sample(CUBE_NETS, stage.count).map((item, i) => {
    const cells = orientCells(item.cells, rng);
    const net = fromCells(cells, { labels: labelsFor(6, rng) });
    // ★ 면: 전개도에서 바로 붙은 면과 대각선 자리 면이 모두 있는 면 (헷갈리는 보기가 늘 있게)
    const candidates = net.faces.filter((f) =>
      net.faces.some((g) => isNeighbor(f.cell, g.cell)) && net.faces.some((g) => isDiagonal(f.cell, g.cell)));
    const star = rng.pick(candidates);
    const answer = oppositeFace(net, star.id);
    return {
      kind: 'opposite',
      number: i + 1,
      itemId: itemId(stage, i + 1, item.name),
      name: item.name,
      net,
      star: star.id,
      answer,
      answerLabel: labelOf(net, answer),
    };
  });
}

const degree = (cells, cell) => cells.filter((c) => isNeighbor(c, cell)).length;

function makeCompleteQuestions(stage, rng) {
  return rng.sample(CUBE_NETS, stage.count).map((item, i) => {
    const cells = orientCells(item.cells, rng);
    const labels = labelsFor(6, rng);
    // 끝(잎) 면 하나를 뺀다. 이웃이 하나뿐이라 빼도 나머지가 이어져 있다.
    const leaves = cells.map((c, idx) => idx).filter((idx) => degree(cells, cells[idx]) === 1);
    const removed = rng.pick(leaves);
    const rest = cells.filter((_, j) => j !== removed);
    const restLabels = labels.filter((_, j) => j !== removed);
    const missingLabel = labels[removed];
    const all = completionSlots(rest, { labels: [...restLabels, missingLabel] });

    // 보이는 자리 4~6곳: 정답은 1~2곳(뺀 자리는 늘 포함), 나머지는 오답 — 아무 데나 놓아 맞히기 어렵게
    const removedKey = cellKey(cells[removed]);
    const right = all.filter((s) => s.ok);
    const wrong = all.filter((s) => !s.ok);
    const total = Math.min(all.length, rng.int(4, 6));
    let nRight = Math.min(right.length, rng.int(1, 2));
    const nWrong = Math.min(wrong.length, total - nRight);
    nRight = Math.min(right.length, Math.max(nRight, total - nWrong)); // 오답 후보가 모자라면 정답으로 채움
    const shownRight = [
      right.find((s) => s.key === removedKey),
      ...rng.sample(right.filter((s) => s.key !== removedKey), nRight - 1),
    ];
    const shown = [...shownRight, ...rng.sample(wrong, nWrong)]
      .sort((a, b) => a.cell[1] - b.cell[1] || a.cell[0] - b.cell[0]);

    return {
      kind: 'complete',
      number: i + 1,
      itemId: itemId(stage, i + 1, item.name),
      name: item.name,
      cells: rest,
      labels: restLabels,
      missingLabel,
      net: fromCells(rest, { labels: restLabels }),
      slots: shown.map(({ cell, key, ok, problems }) => ({ cell, key, ok, problems })),
    };
  });
}

const MAKERS = { judge: makeJudgeQuestions, opposite: makeOppositeQuestions, complete: makeCompleteQuestions };

/** 단계의 문항 목록. playStage에서 ctx.rng로 가장 먼저 부른다(같은 시드 = 같은 문항). */
export function makeQuestions(stage, rng) {
  const make = MAKERS[stage.kind];
  if (!make) throw new Error(`알 수 없는 단계 종류: ${stage.kind}`);
  return make(stage, rng);
}

/** 빈 자리에 마지막 면을 붙인 전개도 (틀린 자리를 접어 보여 줄 때) */
export function placedNet(question, cell) {
  return fromCells([...question.cells, cell], { labels: [...question.labels, question.missingLabel] });
}

// ── 채점 ─────────────────────────────────
/** 판별: answer는 'yes'(돼요) | 'no'(안 돼요) */
export function judgeNetAnswer(question, answer) {
  const { expected, net } = question;
  const correct = answer === expected;
  if (question.valid) {
    if (correct) {
      const extra = question.family !== '1-4-1' ? ' 십자 모양이 아니어도 정육면체의 전개도가 될 수 있어요.' : '';
      return { correct, expected, tag: null, message: `맞아요! 접으면 정육면체가 돼요.${extra}` };
    }
    return {
      correct,
      expected,
      tag: TAGS.variety,
      message: '이 모양도 접으면 정육면체가 돼요. 정육면체의 전개도는 모두 11가지예요.',
    };
  }
  const problem = primaryProblem(question.problems);
  const why = explainProblem(net, problem);
  if (correct) return { correct, expected, tag: null, message: `맞아요! ${why}` };
  return { correct, expected, tag: TAG_OF_PROBLEM[problem.type] ?? TAGS.overlap, message: why };
}

/** 마주 보는 면: faceId는 학생이 누른 면 */
export function judgeOpposite(question, faceId) {
  const { net, star, answer } = question;
  const expected = question.answerLabel;
  const picked = net.faces.find((f) => f.id === faceId);
  const starFace = net.faces.find((f) => f.id === star);
  if (faceId === answer) {
    const message = inLineOfThree(net, starFace, picked)
      ? '맞아요! 한 줄로 이어진 세 면의 양 끝이라 마주 봐요.'
      : `맞아요! 접으면 ${picked.label} 면이 ★ 면의 반대쪽에 와요.`;
    return { correct: true, expected, tag: null, message };
  }
  let message;
  if (isNeighbor(picked.cell, starFace.cell)) {
    message = `${picked.label} 면은 ★ 면과 모서리로 붙어 있어 이웃한 면이에요. 한 줄로 이어진 세 면에서는 양 끝 면이 마주 봐요.`;
  } else if (isDiagonal(picked.cell, starFace.cell)) {
    message = `${picked.label} 면은 ★ 면과 대각선 자리라서 접으면 모서리가 맞닿는 이웃한 면이 돼요. 마주 보는 면은 서로 닿지 않아요.`;
  } else {
    message = `${picked.label} 면은 접으면 ★ 면과 모서리로 만나는 이웃한 면이에요. 마주 보는 면은 서로 닿지 않아요.`;
  }
  return { correct: false, expected, tag: TAGS.opposite, message };
}

/** 면 붙이기: key는 고른 자리 'x,y' */
export function judgeSlot(question, key) {
  const slot = question.slots.find((s) => s.key === key);
  if (!slot) throw new Error(`없는 자리: ${key}`);
  const expected = question.slots.filter((s) => s.ok).map((s) => s.key).join(' / ');
  if (slot.ok) return { correct: true, expected, tag: null, message: '맞아요! 그 자리에 붙이면 정육면체가 돼요.' };
  const problem = primaryProblem(slot.problems);
  const message = problem.type === 'vertex-full'
    ? '그 자리에 붙이면 네 면이 한 꼭짓점에 모여 접을 수 없어요. 정육면체의 한 꼭짓점에는 면이 3개만 모여요.'
    : `그 자리에 붙이면 ${explainProblem(placedNet(question, slot.cell), problem)}`;
  return { correct: false, expected, tag: TAG_OF_PROBLEM[problem.type] ?? TAGS.overlap, message };
}
