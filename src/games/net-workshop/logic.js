/**
 * 전개도 접기 공방의 규칙 (순수 함수). 화면은 main.js와 play-*.js.
 * 문항은 ctx.rng로 만든다. 같은 시드면 같은 문항이 나와서 e2e 테스트도 정답을 안다.
 * 검사: tests/unit/net-workshop-logic.test.js
 */
import {
  SYMMETRY_COUNT,
  LABELS,
  cellKey,
  checkNet,
  completionSlots,
  fromCells,
  oppositeFace,
  shapeKey,
  transformCells,
} from './fold.js';
import { CUBE_NETS, FACE_COUNT_NETS, INVALID_HEXOMINOES } from './nets-data.js';

/** 차시 묶음. 아직 만들지 않은 차시(직육면체·각기둥·원기둥)는 넣지 않는다. */
export const LESSONS = [
  { id: 'cube', title: '정육면체의 전개도' },
];

/**
 * kind: judge(판별) · opposite(마주 보는 면 누르기) · complete(면 붙이기) · free(내 맘대로 전개도)
 * order: 오른쪽 작업 지시서의 주문 이름(공방 세계관, spec 16-3). 머리 칩은 시안대로 "n단계"를 쓴다.
 * 차시 시간(spec 16-4): 판별 5 · 마주 보는 면 4 · 면 붙이기 3 · 자유 배치(서로 다른 전개도 3가지) ≈ 10분
 */
export const STAGES = [
  {
    id: 'cube-judge',
    lesson: 'cube',
    kind: 'judge',
    count: 5,
    order: '검사 주문',
    title: '접힐까, 안 접힐까?',
    goal: '전개도를 접으면 정육면체가 될지 골라요.',
  },
  {
    id: 'cube-opposite',
    lesson: 'cube',
    kind: 'opposite',
    count: 4,
    order: '짝 찾기 주문',
    title: '마주 보는 면',
    goal: '접었을 때 ★ 면과 마주 보는 면을 찾아 눌러요.',
  },
  {
    id: 'cube-complete',
    lesson: 'cube',
    kind: 'complete',
    count: 3,
    order: '수선 주문',
    title: '한 면을 붙여요',
    goal: '남은 한 면을 알맞은 자리에 붙여 정육면체 전개도를 완성해요.',
  },
  {
    id: 'cube-free',
    lesson: 'cube',
    kind: 'free',
    count: 3, // 이번 판에서 찾을 서로 다른 전개도 수
    order: '설계 주문',
    title: '내 맘대로 전개도',
    goal: '면 6장을 마음대로 놓고 접어 봐요. 서로 다른 전개도 3가지를 찾아요.',
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
  // 유효 2 (1-4-1 하나 + 1-4-1이 아닌 꼴 하나), 무효 3 (겹침 · 2×2 덩어리 · 면 개수)
  // 1-4-1이 아닌 꼴은 4단계(내 맘대로 전개도)에서 직접 만들어 본다 (spec 16-4)
  const items = rng.shuffle([
    { ...rng.pick(cross141), intended: null },
    { ...rng.pick(others), intended: null },
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

const MAKERS = {
  judge: makeJudgeQuestions,
  opposite: makeOppositeQuestions,
  complete: makeCompleteQuestions,
  free: () => [], // 자유 배치는 문항이 없다 (학생이 직접 만든다)
};

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

// ── 까닭 고르기 (판별·자유 배치, spec 16-3) ────────────
/** "왜 안 될까요?" 칩 3개. 정답은 primaryProblem의 까닭. 점수는 ctx.reward.event('explain'), 정답률·별에는 넣지 않는다 */
export const REASONS = Object.freeze([
  { id: 'overlap', text: '면이 겹쳐요' },
  { id: 'vertex', text: '네 면이 한 점에 모여요' },
  { id: 'count', text: '면이 6개가 아니에요' },
]);

/** 무효 전개도의 까닭 칩 id (primaryProblem과 같은 까닭) */
export function reasonOf(problems) {
  const p = primaryProblem(problems);
  if (!p) return null;
  if (p.type === 'face-count') return 'count';
  if (p.type === 'vertex-full') return 'vertex';
  return 'overlap';
}

/** 고른 까닭 채점 → { correct, answer(바른 칩 id), answerText } */
export function judgeReason(problems, choice) {
  const answer = reasonOf(problems);
  return { correct: choice === answer, answer, answerText: REASONS.find((r) => r.id === answer)?.text ?? '' };
}

// ── 자유 배치 "내 맘대로 전개도" (spec 16-1) ──────────
/** 이번 판 목표: 서로 다른 전개도 수 */
export const FREE_GOAL = 3;
/** 놓는 판 크기: 보통 7칸 × 5줄, 휴대폰(560px 이하) 6칸 × 6줄 (한 줄 6칸 모양도 놓을 수 있게) */
export const BOARD_SIZES = Object.freeze({ wide: { cols: 7, rows: 5 }, phone: { cols: 6, rows: 6 } });
/** 힌트가 켜지는 조건: 안 되는 모양을 연달아 이만큼 접었거나, 이 시간(ms) 동안 새 전개도를 못 찾음 */
export const HINT_AFTER_INVALID = 2;
export const HINT_AFTER_MS = 90_000;
export const HINT_TEXT = '한 줄에 4칸을 놓고, 그 위와 아래에 한 칸씩 붙여 봐요.';

/**
 * 헥소미노 35개 모두의 모양 키 → 이름. 돌리거나 뒤집어도 같은 키(shapeKey)라 같은 이름이 나온다.
 * 값: { name, valid, family?(전개도), index?(도감 번호 1~11), shape?·reason?(무효) }
 */
export const NET_BY_KEY = new Map([
  ...CUBE_NETS.map((n, i) => [shapeKey(n.cells), { name: n.name, valid: true, family: n.family, index: i + 1 }]),
  ...INVALID_HEXOMINOES.map((n) => [shapeKey(n.cells), { name: n.name, valid: false, shape: n.shape, reason: n.reason }]),
]);

/** 칸 목록의 모양 이름 (헥소미노가 아니면 null) */
export const netName = (cells) => NET_BY_KEY.get(shapeKey(cells))?.name ?? null;
export const netInfo = (cells) => NET_BY_KEY.get(shapeKey(cells)) ?? null;

/** 도감 칸 이름: "1-4-1 꼴 2" (같은 줄 모양 안에서 번호) */
export function dexItemName(net) {
  const same = CUBE_NETS.filter((n) => n.family === net.family);
  return same.length > 1 ? `${net.family} 꼴 ${same.indexOf(net) + 1}` : `${net.family} 꼴`;
}

/** 안 되는 모양 노트 칸 이름: 까닭별 번호 ("겹치는 모양 3", "네 면이 모이는 모양 2") */
export function noteItemName(item) {
  const same = INVALID_HEXOMINOES.filter((n) => n.reason === item.reason);
  return `${item.reason === 'vertex-full' ? '네 면이 모이는 모양' : '겹치는 모양'} ${same.indexOf(item) + 1}`;
}

/** 안 되는 모양 노트 순서: 까닭별로 모음 (겹침 16 · 네 면이 한 점에 8) */
export const NOTE_ITEMS = [
  ...INVALID_HEXOMINOES.filter((n) => n.reason !== 'vertex-full'),
  ...INVALID_HEXOMINOES.filter((n) => n.reason === 'vertex-full'),
];

const NEIGHBOR = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** 칸들을 변으로 이어진 덩어리로 나눈다(꼭짓점만 닿으면 다른 덩어리). → 칸 번호 묶음, 큰 것부터(같으면 먼저 놓은 칸이 있는 것) */
export function cellGroups(cells) {
  const index = new Map(cells.map((c, i) => [cellKey(c), i]));
  const seen = new Set();
  const groups = [];
  cells.forEach((_, start) => {
    if (seen.has(start)) return;
    const group = [];
    const queue = [start];
    seen.add(start);
    while (queue.length > 0) {
      const i = queue.shift();
      group.push(i);
      for (const [dx, dy] of NEIGHBOR) {
        const j = index.get(cellKey([cells[i][0] + dx, cells[i][1] + dy]));
        if (j !== undefined && !seen.has(j)) {
          seen.add(j);
          queue.push(j);
        }
      }
    }
    groups.push(group.sort((a, b) => a - b));
  });
  return groups.sort((a, b) => b.length - a.length || a[0] - b[0]);
}

/**
 * 놓은 면이 접을 수 있는 상태인가.
 * → { ready, reason: 'count'(6장이 아님) | 'apart'(떨어진 면) | null, detached: 떨어진 칸 번호 }
 */
export function boardReadiness(cells, total = 6) {
  if (cells.length < total) return { ready: false, reason: 'count', detached: [] };
  const groups = cellGroups(cells);
  if (groups.length > 1) return { ready: false, reason: 'apart', detached: groups.slice(1).flat().sort((a, b) => a - b) };
  return { ready: true, reason: null, detached: [] };
}

/**
 * 자유 배치 한 번 접기의 판정 (예상 → 접기). 판정은 판별 단계와 같은 fromCells + checkNet.
 * - prediction: 'yes'(될 거예요) | 'no'(안 될 거예요)
 * - seen: 이번 판에서 이미 접어 본 모양 이름 → 다시 접으면 기록·점수 없음(kind 'repeat')
 * - dex: 전개도 도감에 이미 있는 이름 → 'known'(이번 판 목표에는 센다)
 * → { net, name, info, valid, problems, expected, correct, tag, kind: 'new'|'known'|'repeat'|'invalid', log, title, message }
 */
export function judgeFree({ cells, labels = LABELS, prediction, seen = new Set(), dex = new Set() }) {
  const net = fromCells(cells, { labels });
  const { ok, problems } = checkNet(net);
  const info = netInfo(cells);
  const name = info?.name ?? null;
  const expected = ok ? 'yes' : 'no';
  const correct = prediction === expected;
  const repeat = name != null && seen.has(name);
  const tag = correct ? null : ok ? TAGS.variety : (TAG_OF_PROBLEM[primaryProblem(problems)?.type] ?? TAGS.overlap);
  let kind = 'invalid';
  if (repeat) kind = 'repeat';
  else if (ok) kind = dex.has(name) ? 'known' : 'new';

  const lead = correct ? '예측 적중!' : '예상과 달랐어요.';
  let title = correct ? '예측 적중' : '예상과 달랐어요';
  let message;
  if (kind === 'repeat') {
    title = '이미 접어 본 모양';
    message = '이번에 이미 접어 본 모양이에요. 돌리거나 뒤집어도 같은 모양이라 다시 세지 않아요. 다른 모양을 만들어 봐요.';
  } else if (kind === 'new') {
    message = `${lead} 처음 찾은 전개도예요. ${info.family} 모양도 정육면체의 전개도예요.`;
  } else if (kind === 'known') {
    message = `${lead} 도감 ${info.index}번과 같은 모양이에요. 돌리거나 뒤집으면 똑같아요.`;
  } else {
    message = `${lead} ${explainProblem(net, primaryProblem(problems))}`;
  }
  return { net, name, info, valid: ok, problems, expected, correct, tag, kind, log: !repeat, title, message };
}

/** 이번 판에서 아직 못 찾은 전개도 하나(힌트 그림자). 1-4-1이 아니고 도감에도 없는 것을 먼저 고른다 */
export function hintNet(found = new Set(), dex = new Set()) {
  const left = CUBE_NETS.filter((n) => !found.has(n.name));
  return left.find((n) => n.family !== '1-4-1' && !dex.has(n.name))
    ?? left.find((n) => !dex.has(n.name))
    ?? left.find((n) => n.family !== '1-4-1')
    ?? left[0]
    ?? null;
}

/** 칸 모양을 판(cols × rows) 가운데에 놓는다. 들어가지 않으면 돌려서 놓고, 그래도 안 되면 null */
export function centerOnBoard(cells, { cols, rows }) {
  for (let k = 0; k < SYMMETRY_COUNT; k += 1) {
    const moved = transformCells(cells, k);
    const w = Math.max(...moved.map((c) => c[0])) + 1;
    const hgt = Math.max(...moved.map((c) => c[1])) + 1;
    if (w <= cols && hgt <= rows) {
      const dx = Math.floor((cols - w) / 2);
      const dy = Math.floor((rows - hgt) / 2);
      return moved.map(([x, y]) => [x + dx, y + dy]);
    }
  }
  return null;
}

/**
 * 자유 배치 한 판의 흐름 (순수 상태). 화면(play-free.js)과 점수 테스트가 같은 규칙을 쓴다.
 * fold(cells, labels, prediction) → judgeFree 결과 + { itemId(기록할 때), collect: { id, item }(도감·노트에 넣을 칸),
 *   explainable(까닭 고르기를 보일지), fixed(안 된 뒤 바로 전개도를 만듦), found(이번 판에 찾은 전개도 수), done(목표 달성) }
 */
export function createFreeSession({ stageId = 'cube-free', goal = FREE_GOAL, dex = [], note = [] } = {}) {
  const seen = new Set(); // 이번 판에서 접어 본 모양
  const found = new Set(); // 이번 판에서 찾은 전개도
  const dexFound = new Set(dex);
  const noteFound = new Set(note);
  const history = [];
  let seq = 0;
  let invalidRun = 0;

  return {
    fold(cells, labels, prediction) {
      const r = judgeFree({ cells, labels, prediction, seen, dex: dexFound });
      const prev = history.at(-1);
      let itemId = null;
      let collect = null;
      if (r.log) {
        seq += 1;
        itemId = `${stageId}:${seq}:${r.name}`;
        seen.add(r.name);
      }
      if (r.valid) {
        found.add(r.name);
        if (r.kind === 'new') collect = { id: 'cube-nets', item: r.name, isNew: !dexFound.has(r.name) };
        dexFound.add(r.name);
        invalidRun = 0;
      } else {
        if (r.kind === 'invalid') collect = { id: 'cube-non-nets', item: r.name, isNew: !noteFound.has(r.name) };
        noteFound.add(r.name);
        invalidRun += 1;
      }
      const step = {
        ...r,
        itemId,
        collect,
        explainable: r.kind === 'invalid' && r.correct,
        fixed: r.valid && r.kind !== 'repeat' && Boolean(prev && !prev.valid),
        found: found.size,
        done: found.size >= goal,
        invalidRun,
      };
      history.push(step);
      return step;
    },
    found: () => new Set(found),
    seen: () => new Set(seen),
    dex: () => new Set(dexFound),
    note: () => new Set(noteFound),
    invalidRun: () => invalidRun,
    history: () => history.slice(),
    goal,
  };
}

/** 결과 "오늘의 솜씨"에 쓸 숫자: 기록한 예상 수·맞힌 수, 새로 찾은 전개도·노트, 고쳐서 다시 도전 */
export function freeSummary(history) {
  const logged = history.filter((s) => s.log);
  return {
    predictions: logged.length,
    hits: logged.filter((s) => s.correct).length,
    newNets: history.filter((s) => s.collect?.id === 'cube-nets' && s.collect.isNew).length,
    newNotes: history.filter((s) => s.collect?.id === 'cube-non-nets' && s.collect.isNew).length,
    fixes: history.filter((s) => s.fixed).length,
  };
}
