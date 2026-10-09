/**
 * 전개도 접기 공방의 규칙 (순수 함수). 화면은 main.js와 play-*.js.
 * 문항은 ctx.rng로 만든다. 같은 시드면 같은 문항이 나와서 e2e 테스트도 정답을 안다.
 * 검사: tests/unit/net-workshop-logic.test.js
 */
import { josa } from '../../shared/core/korean.js';
import {
  SYMMETRY_COUNT,
  LABELS,
  cellKey,
  checkNet,
  completionSlots,
  findHinges,
  fromCells,
  isConnected,
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
 *       · dice(도전: 주사위 주문) · dex(도전: 도감 주문)
 * order: 오른쪽 작업 지시서의 주문 이름(공방 세계관, spec 16-3). 머리 칩은 시안대로 "n단계"(도전은 엔진의 "도전 주문서")를 쓴다.
 * 차시 시간(spec 16-4): 판별 5 · 마주 보는 면 4 · 면 붙이기 3 · 자유 배치(서로 다른 전개도 3가지) ≈ 10분
 * challenge: 도전 주문서 — 차시의 일반 단계 4개를 모두 마치면 열리는 선택 활동(다음 단계를 막지 않고 차시 별 합계에 넣지 않는다)
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
  {
    id: 'cube-dice',
    lesson: 'cube',
    kind: 'dice',
    challenge: true,
    timer: 'optional', // 시간 재기: 켠 학생만 시간이 보인다 (점수 없음)
    count: 2, // 만들 주사위 수 (서로 다른 모양)
    order: '주사위 주문',
    title: '주사위 주문',
    goal: '마주 보는 두 눈의 합이 7인 주사위 전개도를 서로 다른 모양으로 2개 만들어요.',
  },
  {
    id: 'cube-dex',
    lesson: 'cube',
    kind: 'dex',
    challenge: true,
    count: 11, // 전개도 도감 칸 수
    order: '도감 주문',
    title: '도감 주문',
    goal: '전개도 11가지를 찾아 도감을 채워요. 6칸 별 1개, 9칸 별 2개, 11칸 별 3개.',
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
  dice: () => [], // 도전 주문서도 학생이 직접 만든다
  dex: () => [],
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

// ── 자유 배치 "내 맘대로 전개도" (spec 16-1, 예상 없이 접는다 — 16-12) ──────────
/** 이번 판 목표: 서로 다른 전개도 수 */
export const FREE_GOAL = 3;
/** 놓는 판 크기: 보통 7칸 × 5줄, 휴대폰(560px 이하) 6칸 × 6줄 (한 줄 6칸 모양도 놓을 수 있게) */
export const BOARD_SIZES = Object.freeze({ wide: { cols: 7, rows: 5 }, phone: { cols: 6, rows: 6 } });
/** 힌트가 켜지는 조건: 안 되는 모양을 연달아 이만큼 접었거나, 이 시간(ms) 동안 새 전개도를 못 찾음 */
export const HINT_AFTER_INVALID = 2;
export const HINT_AFTER_MS = 90_000;
export const HINT_TEXT = '한 줄에 4칸을 놓고, 그 위와 아래에 한 칸씩 붙여 봐요.';
/** 안 되는 모양 노트에 처음 적을 때의 솜씨 점수 (전개도 도감은 엔진 기본 +5). spec 16-8 */
export const NOTE_XP = 1;
/** 학습 기록의 expected: 직접 만드는 단계는 "정육면체의 전개도"를 만드는 것이 목표다 (given은 접은 모양의 이름) */
export const FREE_EXPECTED = '전개도';

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

/**
 * 칸들을 변으로 이어진 덩어리로 나눈다(꼭짓점만 닿으면 다른 덩어리). → 칸 번호 묶음, 큰 것부터(같으면 먼저 놓은 칸이 있는 것)
 * "이어졌다"는 fold.js의 경첩(findHinges: 두 면의 변이 길이 > 0만큼 맞닿음)으로만 정한다 — 접기 판정(isConnected·checkNet)과 같은 계산.
 */
export function cellGroups(cells, net = fromCells(cells)) {
  const indexOf = new Map(net.faces.map((f, i) => [f.id, i]));
  const links = cells.map(() => []);
  for (const hinge of findHinges(net)) {
    const a = indexOf.get(hinge.a);
    const b = indexOf.get(hinge.b);
    links[a].push(b);
    links[b].push(a);
  }
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
      for (const j of links[i]) {
        if (seen.has(j)) continue;
        seen.add(j);
        queue.push(j);
      }
    }
    groups.push(group.sort((a, b) => a - b));
  });
  return groups.sort((a, b) => b.length - a.length || a[0] - b[0]);
}

/**
 * 놓은 면이 접을 수 있는 상태인가. 떨어진 면이 있는지는 fold.js의 isConnected로 정한다(checkNet의 'disconnected'와 같은 계산).
 * → { ready, reason: 'count'(6장이 아님) | 'apart'(떨어진 면) | null, detached: 떨어진 칸 번호(가장 큰 덩어리 밖의 칸) }
 */
export function boardReadiness(cells, total = 6) {
  if (cells.length < total) return { ready: false, reason: 'count', detached: [] };
  const net = fromCells(cells);
  if (isConnected(net)) return { ready: true, reason: null, detached: [] };
  return { ready: false, reason: 'apart', detached: cellGroups(cells, net).slice(1).flat().sort((a, b) => a - b) };
}

/**
 * 자유 배치 한 번 접기의 판정. 예상 없이 놓고 접는다(spec 16-12). 판정은 판별 단계와 같은 fromCells + checkNet.
 * - seen: 이번 판에서 이미 접어 본 모양 이름 → 다시 접으면 기록·점수 없음(kind 'repeat')
 * - dex: 전개도 도감에 이미 있는 이름 → 'known'(이번 판 목표에는 센다)
 * → { net, name, info, valid, problems, correct(= valid: 정육면체가 되면 맞음), tag(안 되면 그 까닭의 오개념 tag),
 *     kind: 'new'|'known'|'repeat'|'invalid', log, title, message }
 * 문장에는 "틀렸다"는 느낌의 말을 쓰지 않는다: 되면 찾은 전개도, 안 되면 까닭.
 */
export function judgeFree({ cells, labels = LABELS, seen = new Set(), dex = new Set() }) {
  const net = fromCells(cells, { labels });
  const { ok, problems } = checkNet(net);
  const info = netInfo(cells);
  const name = info?.name ?? null;
  const repeat = name != null && seen.has(name);
  const tag = ok ? null : (TAG_OF_PROBLEM[primaryProblem(problems)?.type] ?? TAGS.overlap);
  let kind = 'invalid';
  if (repeat) kind = 'repeat';
  else if (ok) kind = dex.has(name) ? 'known' : 'new';

  let title;
  let message;
  if (kind === 'repeat') {
    title = '이미 접어 본 모양';
    message = '이번에 이미 접어 본 모양이에요. 돌리거나 뒤집어도 같은 모양이라 다시 세지 않아요. 다른 모양을 만들어 봐요.';
  } else if (kind === 'new') {
    title = '새 전개도 발견';
    message = `처음 찾은 전개도예요. ${info.family} 모양도 정육면체의 전개도예요.`;
  } else if (kind === 'known') {
    title = '정육면체가 돼요';
    message = `도감 ${info.index}번과 같은 모양이에요. 돌리거나 뒤집으면 똑같아요.`;
  } else {
    title = '정육면체가 안 돼요';
    message = explainProblem(net, primaryProblem(problems));
  }
  return { net, name, info, valid: ok, problems, correct: ok, tag, kind, log: !repeat, title, message };
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
 * 자유 배치 한 판의 흐름 (순수 상태). 화면(play-free.js)과 점수 테스트가 같은 규칙을 쓴다. "내 맘대로 전개도"와 도감 주문이 함께 쓴다.
 * fold(cells, labels) → judgeFree 결과 + { itemId(기록할 때), collect: { id, item }(도감·노트에 넣을 칸),
 *   first(이 기기에서 처음 접는 모양 — 도감·노트에 아직 없음. 점수는 이때만, spec 16-8. 별 3개 뒤에도 받는다, 16-9),
 *   explainable(까닭 고르기를 보일지: 안 되는 모양을 접었을 때), fixed(안 된 뒤 바로 전개도를 만듦),
 *   found(이번 판에 찾은 전개도 수), dexCount(이 기기의 도감 수), done(목표 달성) }
 * dex·note는 이 기기에 저장된 도감·노트(판을 넘어, 단계를 넘어 이어진다). 접어 본 모양은 도감이나 노트에 들어가므로
 * "처음 접는 모양" = 도감·노트에 새로 들어가는 모양이다 — 어느 단계에서 접었든 한 모양의 점수는 한 번뿐이다.
 * dexGoal: 도감 주문의 목표(도감 칸 수). 주면 done은 "이 기기의 도감이 그만큼 찼다"이고, 없으면 "이번 판에 goal가지를 찾았다"
 */
export function createFreeSession({ stageId = 'cube-free', goal = FREE_GOAL, dex = [], note = [], dexGoal = null } = {}) {
  const seen = new Set(); // 이번 판에서 접어 본 모양
  const found = new Set(); // 이번 판에서 찾은 전개도
  const dexFound = new Set(dex);
  const noteFound = new Set(note);
  const history = [];
  let seq = 0;
  let invalidRun = 0;
  const isDone = () => (dexGoal != null ? dexFound.size >= dexGoal : found.size >= goal);

  return {
    fold(cells, labels) {
      const r = judgeFree({ cells, labels, seen, dex: dexFound });
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
        first: Boolean(collect?.isNew),
        explainable: r.kind === 'invalid',
        fixed: r.valid && r.kind !== 'repeat' && Boolean(prev && !prev.valid),
        found: found.size,
        dexCount: dexFound.size,
        done: isDone(),
        invalidRun,
      };
      history.push(step);
      return step;
    },
    found: () => new Set(found),
    seen: () => new Set(seen),
    dex: () => new Set(dexFound),
    note: () => new Set(noteFound),
    done: isDone,
    invalidRun: () => invalidRun,
    history: () => history.slice(),
    goal,
  };
}

/**
 * 별 3개를 받은 뒤 다시 한 판의 결과 화면 안내 (spec 16-9). 자유 배치는 처음 접는 모양이면 별과 상관없이 점수를 받고,
 * 접어 본 모양은 16-8대로 점수가 없다 — 엔진 기본 문장("별 3개를 받은 단계라 연습 점수는 없어요")은 이 단계에서 사실과 다르다.
 */
export const FREE_REPLAY_NOTE = '처음 접는 모양은 점수를 받아요. 접어 본 모양은 다시 접어도 점수가 없어요.';

/** 까닭 고르기 전에 쪽지에 보이는 문장: 왜 안 되는지(겹침·네 면이 한 점)는 말하지 않는다 */
export const FREE_NOTE_BEFORE_PICK = '접어 보니 정육면체가 안 돼요. 왜 그런지 골라 볼까요?';

/** 놓는 판 아래 안내 (접기 전) */
export const FREE_FOLD_NOTES = Object.freeze({
  count: '면 6장을 모두 놓으면 접어 볼 수 있어요.',
  apart: '떨어진 면이 있어요. 전개도는 한 장으로 이어져 있어야 접을 수 있어요.',
  ready: '놓은 그대로 접혀요. 새 전개도를 찾으면 도감에 들어가요.', // 까닭 낱말(겹·모여·비어 …)을 쓰지 않는다: 까닭을 고르는 동안에도 문서에 남는 글이다
});

/**
 * 접은 뒤 보일 글과 무대 표시. 안 되는 모양을 접으면(step.explainable) 까닭 고르기가 먼저라,
 * 고르기(또는 넘어가기) 전(picked: false)에는 까닭 문장도, 무대의 까닭 표시(이름표·겹쳐요·비어요·●)도 보이지 않는다.
 * → { toast(짧은 알림), title·note(쪽지 제목·문장), marks(무대에 까닭 표시를 보여도 되는지),
 *     tone(쪽지·알림의 모습: 'correct' 초록 ✓ | 'info' | 'wrong' 벽돌색 까닭 쪽지) }
 */
export function freeFeedback(step, { picked = false } = {}) {
  const waiting = Boolean(step.explainable) && !picked;
  let toast;
  if (step.kind === 'repeat') toast = '이번에 이미 접어 본 모양이에요.';
  else if (step.kind === 'new') toast = '처음 찾은 전개도예요!';
  else if (step.kind === 'known') toast = `도감 ${step.info.index}번과 같은 모양이에요.`;
  else toast = '정육면체가 안 돼요. 왜 그런지 골라 볼까요?';
  let tone = 'info';
  if (step.kind === 'new' || step.kind === 'known') tone = 'correct';
  else if (step.kind === 'invalid' && !waiting) tone = 'wrong';
  return {
    toast,
    title: step.kind === 'invalid' && !waiting ? '까닭' : step.title,
    note: waiting ? FREE_NOTE_BEFORE_PICK : step.message,
    marks: !waiting,
    tone,
  };
}

/** 결과 "오늘의 솜씨" 칸 수: 1366px 폭에서 한 줄에 들어가는 4칸까지 */
export const FREE_TILE_MAX = 4;

/** 결과 "오늘의 솜씨"·기록 칸에 쓸 숫자: 접어 본 모양(기록한 접기), 찾은 전개도, 새로 찾은 전개도·노트, 고쳐서 다시 도전 */
export function freeSummary(history) {
  const logged = history.filter((s) => s.log);
  return {
    shapes: logged.length,
    found: logged.filter((s) => s.valid).length,
    newNets: history.filter((s) => s.collect?.id === 'cube-nets' && s.collect.isNew).length,
    newNotes: history.filter((s) => s.collect?.id === 'cube-non-nets' && s.collect.isNew).length,
    fixes: history.filter((s) => s.fixed).length,
  };
}

/** "내 맘대로 전개도"의 별: 이번 판에 찾은 서로 다른 전개도 수 (1 · 2 · 3가지 → 별 1 · 2 · 3개, spec 16-12). 안 되는 모양은 별에 영향이 없다 */
export const freeStars = (found) => Math.max(0, Math.min(3, Math.floor(Number(found) || 0)));

/**
 * 결과 화면의 기록 칸: 정답률·맞힘/시도 대신 "찾은 전개도 n가지 · 접어 본 모양 n가지" (spec 16-12 — 직접 만드는 단계는
 * 안 되는 모양을 접어 보는 것도 탐구라, 화면에 "틀렸다"는 느낌의 숫자를 보이지 않는다)
 */
export function freeStats(sum) {
  return [
    { label: '찾은 전개도', value: `${sum.found}가지` },
    { label: '접어 본 모양', value: `${sum.shapes}가지` },
  ];
}

/** 점수를 받는 칸 뒤에, 자리가 남으면 점수 없는 칸(fillers)을 차례로 넣는다 */
function withFillers(tiles, fillers) {
  for (const tile of fillers) if (tile && tiles.length < FREE_TILE_MAX) tiles.push(tile);
  return tiles;
}

/**
 * 결과 "오늘의 솜씨" 칸 (보여 주기만 한다. 점수는 엔진이 계산).
 * sum: freeSummary 결과, earned: 이번 판에 엔진이 준 점수를 갈래별로 모은 것
 *   { answer(만들기 성공: 처음 접는 전개도 +2 · 연속 · 다시 일어서기), nets(도감 등록), notes(노트 등록), explain(까닭 설명) }
 * 칸 점수의 합 = earned의 합 = 이번 판 점수(단계 완료·별 점수는 엔진이 따로 한 줄로 보인다).
 * 점수를 받는 칸은 빼지 않는다. 자리가 남을 때만 점수 없는 "고쳐서 다시 도전"을 넣는다.
 */
export function freeHighlights(sum, { earned, explainCount = 0 }) {
  const tiles = [{ icon: 'book', label: '새 전개도 발견', value: `${sum.newNets}가지`, xp: earned.answer + earned.nets }];
  if (sum.newNotes > 0 || earned.notes > 0) tiles.push({ icon: 'copy', label: '노트에 적은 모양', value: `${sum.newNotes}가지`, xp: earned.notes });
  if (explainCount > 0 || earned.explain > 0) tiles.push({ icon: 'bulb', label: '까닭 설명', value: `${explainCount}번`, xp: earned.explain });
  return withFillers(tiles, [{ icon: 'undo', label: '고쳐서 다시 도전', value: `${sum.fixes}번` }]);
}

// ── 도전 주문서 ② 도감 주문 (cube-dex, spec 16-3) ──────────
/** 도감 칸 수 → 별: 6칸 ★1, 9칸 ★2, 11칸 ★3. [오늘은 여기까지]는 6칸부터 */
export const DEX_STAR_AT = Object.freeze([6, 9, 11]);
export const DEX_STOP_MIN = DEX_STAR_AT[0];
export const dexStars = (count) => DEX_STAR_AT.filter((n) => count >= n).length;
/** 다음 별을 받는 칸 수 (별 3개면 null) */
export const dexNextStar = (count) => DEX_STAR_AT.find((n) => count < n) ?? null;

/** 새 전개도를 찾아 별이 하나 늘었을 때 쪽지에 덧붙이는 말 (6칸·9칸. 11칸은 달성 문장이 따로 있다) */
export function dexMilestone(before, after) {
  const stars = dexStars(after);
  if (stars <= dexStars(before) || stars >= DEX_STAR_AT.length) return '';
  return `도감 ${after}칸! 지금 끝내도 별 ${stars}개를 받아요.`;
}

/** 도감 주문 결과의 기록 칸 */
export function dexStats(sum) {
  return [
    { label: '새로 찾은 전개도', value: `${sum.newNets}가지` },
    { label: '접어 본 모양', value: `${sum.shapes}가지` },
  ];
}

/** 도감 주문 결과 "오늘의 솜씨" 칸: 첫 칸은 도감 수(별의 기준) + 이번 판에 새로 찾은 전개도의 점수. 나머지는 자유 배치와 같다 */
export function dexHighlights(sum, { earned, explainCount = 0, dexCount, dexTotal }) {
  const tiles = [{ icon: 'book', label: '전개도 도감', value: `${dexCount} / ${dexTotal}`, xp: earned.answer + earned.nets }];
  if (sum.newNotes > 0 || earned.notes > 0) tiles.push({ icon: 'copy', label: '노트에 적은 모양', value: `${sum.newNotes}가지`, xp: earned.notes });
  if (explainCount > 0 || earned.explain > 0) tiles.push({ icon: 'bulb', label: '까닭 설명', value: `${explainCount}번`, xp: earned.explain });
  const next = dexNextStar(dexCount);
  return withFillers(tiles, [
    next != null && { icon: 'star', label: '다음 별까지', value: `${next - dexCount}칸` },
    { icon: 'undo', label: '고쳐서 다시 도전', value: `${sum.fixes}번` },
  ]);
}

// ── 도전 주문서 ① 주사위 주문 (cube-dice, spec 16-3) ──────────
/** 만들 주사위 수(서로 다른 모양) · 눈 카드 · 마주 보는 두 눈의 합 */
export const DICE_GOAL = 2;
export const DICE_PIPS = Object.freeze(['1', '2', '3', '4', '5', '6']);
export const DICE_SUM = 7;
/** 학습 기록의 expected: 마주 보는 눈 세 쌍 */
export const DICE_EXPECTED = '1-6 2-5 3-4';
/** 힌트가 켜지는 조건: 틀린 접기를 연달아 이만큼 했거나, HINT_AFTER_MS 동안 주사위를 못 만듦 */
export const DICE_HINT_AFTER_WRONG = 2;
export const DICE_HINT_TEXT = '한 줄로 이어진 세 면은 양 끝이 마주 봐요. 합이 7인 두 눈을 양 끝에 놓아요.';
/** 눈 카드·면의 이름 (화면 읽기, 칸 이름) */
export const pipName = (label) => `주사위 눈 ${label}`;
const ORDINAL = ['첫 번째', '두 번째', '세 번째'];
export const diceOrdinal = (number) => ORDINAL[number - 1] ?? `${number}번째`;

/**
 * 접었을 때 마주 보는 눈 세 쌍. 판정은 마주 보는 면 단계와 같은 oppositeFace(접은 뒤 법선이 반대인 면).
 * → [{ a, b(눈, a < b), sum, ok(합이 7), faces: [면 id, 면 id] }] 작은 눈 순. 정육면체가 안 되는 전개도면 null
 */
export function dicePairs(net) {
  const byId = new Map(net.faces.map((f) => [f.id, f]));
  const used = new Set();
  const pairs = [];
  for (const face of net.faces) {
    if (used.has(face.id)) continue;
    const other = byId.get(oppositeFace(net, face.id));
    if (!other || used.has(other.id)) return null;
    used.add(face.id);
    used.add(other.id);
    const [low, high] = [face, other].sort((p, q) => Number(p.label) - Number(q.label));
    const sum = Number(low.label) + Number(high.label);
    pairs.push({ a: low.label, b: high.label, sum, ok: sum === DICE_SUM, faces: [low.id, high.id] });
  }
  return pairs.sort((p, q) => Number(p.a) - Number(q.a));
}

/** 주사위 판정: 정육면체가 되는 전개도에서 마주 보는 세 쌍의 합이 모두 7인가 → { ok, pairs, wrong(합이 7이 아닌 쌍) } */
export function diceCheck(net) {
  const pairs = dicePairs(net);
  if (!pairs) return { ok: false, pairs: null, wrong: [] };
  const wrong = pairs.filter((p) => !p.ok);
  return { ok: pairs.length === 3 && wrong.length === 0, pairs, wrong };
}

/** 정육면체가 안 되는 모양의 까닭 문장 (눈 카드 말로) */
function explainDiceProblem(net, problem) {
  if (problem?.type === 'vertex-full') return '네 면이 한 점에 모이면 접을 수 없어요. 정육면체의 한 꼭짓점에는 면이 3개만 모여요.';
  if (problem?.type === 'overlap') {
    const [a, b] = problem.faces.map((id) => Number(labelOf(net, id))).sort((p, q) => p - q);
    return `눈 ${a} 면과 눈 ${b} 면이 같은 자리에 겹쳐요. 그래서 다른 한쪽이 비어요.`;
  }
  return '접으면 한 곳이 비어요. 정육면체가 되려면 모든 모서리가 맞닿아야 해요.';
}

/**
 * 눈 카드 6장을 놓고 접은 한 번의 판정 (예상 없이 놓고 접는다).
 * → { net, name, info, valid(정육면체가 됨), problems, pairs, correct, kind: 'made'(주사위 완성) | 'sum'(합이 7이 아닌 짝) | 'invalid'(정육면체가 안 됨),
 *     tag, title, message, given, expected }
 * tag: 합이 7이 아니면 '마주 보는 면', 정육면체가 안 되면 그 까닭(면이 겹침 · 한 꼭짓점에 세 면) — 새 tag는 없다
 */
export function judgeDice({ cells, labels = DICE_PIPS }) {
  const net = fromCells(cells, { labels });
  const { ok: valid, problems } = checkNet(net);
  const info = netInfo(cells);
  const base = { net, name: info?.name ?? null, info, valid, problems, expected: DICE_EXPECTED };
  if (!valid) {
    const problem = primaryProblem(problems);
    return {
      ...base,
      pairs: null,
      correct: false,
      kind: 'invalid',
      tag: TAG_OF_PROBLEM[problem?.type] ?? TAGS.overlap,
      title: '정육면체가 안 돼요',
      message: explainDiceProblem(net, problem),
      given: '정육면체가 안 됨',
    };
  }
  const { ok, pairs, wrong } = diceCheck(net);
  const given = pairs.map((p) => `${p.a}-${p.b}`).join(' ');
  if (ok) {
    return {
      ...base,
      pairs,
      correct: true,
      kind: 'made',
      tag: null,
      title: '주사위 완성',
      message: `마주 보는 두 눈의 합이 모두 ${DICE_SUM}이에요. ${pairs.map((p) => `${josa(p.a, '과/와')} ${p.b}`).join(', ')}.`,
      given,
    };
  }
  const [first] = wrong;
  return {
    ...base,
    pairs,
    correct: false,
    kind: 'sum',
    tag: TAGS.opposite,
    title: '합이 7이 아닌 짝이 있어요',
    message: `${josa(first.a, '과/와')} ${josa(first.b, '이/가')} 마주 봐요. 마주 보는 두 눈의 합은 ${DICE_SUM}이에요.`,
    given,
  };
}

/** 눈을 놓은 모습의 열쇠: 돌리거나 뒤집어 같은 놓기는 같은 열쇠 (칸 자리와 그 칸의 눈) */
export function diceLayoutKey(cells, labels) {
  let best = null;
  for (let k = 0; k < SYMMETRY_COUNT; k += 1) {
    const key = transformCells(cells, k)
      .map(([x, y], i) => [y, x, labels[i]])
      .sort((p, q) => p[0] - q[0] || p[1] - q[1])
      .map((v) => v.join(','))
      .join(';');
    if (best == null || key < best) best = key;
  }
  return best;
}

/**
 * 주사위 주문 한 판의 흐름 (순수 상태). 화면(play-dice.js)과 점수 테스트가 같은 규칙을 쓴다.
 * - 문항은 "n번째 주사위"다: itemId = <단계 id>:<n>. 모양 이름을 넣지 않는다 — 넣으면 틀린 접기와 고쳐서 맞힌 접기가 다른 문항이 되어
 *   "틀린 뒤 고쳐 맞힘(+1)"이 "새 문항을 처음에 맞힘(+2) + 다시 일어서기(+1)"로 계산돼 일부러 틀린 쪽이 더 받는다
 * - 접은 것은 모두 기록한다(맞힘·틀림). 접기 전에 막는 것(기록 없음): 6장이 아님, 떨어진 면, 이미 만든 주사위와 같은 모양,
 *   접어 봤더니 정육면체가 안 된 모양, 접어 봤더니 합이 7이 아니었던 같은 놓기(돌리거나 뒤집어도 같음). 모두 이미 본 결과라 답을 알려 주지 않는다
 * readiness(cells, labels) → { ready, reason: 'count' | 'apart' | 'done' | 'same' | 'tried-shape' | 'tried' | null, detached, same?(같은 모양인 주사위 번호) }
 * fold(cells, labels) → judgeDice 결과 + { itemId, number(몇 번째 주사위), firstTry(그 주사위의 첫 접기), made(만든 수), done, wrongRun } (접을 수 없으면 null)
 */
export function createDiceSession({ stageId = 'cube-dice', goal = DICE_GOAL } = {}) {
  const made = []; // 만든 주사위 { name, family, cells, labels }
  const triedShapes = new Set(); // 접어 봤더니 정육면체가 안 된 모양
  const triedLayouts = new Set(); // 접어 봤더니 합이 7이 아니었던 놓기
  const history = [];
  let wrongRun = 0;

  function readiness(cells, labels) {
    const base = boardReadiness(cells, DICE_PIPS.length);
    if (!base.ready) return base;
    const blocked = (reason) => ({ ready: false, reason, detached: [] });
    if (made.length >= goal) return blocked('done');
    const name = netName(cells);
    const same = made.findIndex((d) => d.name === name);
    if (same >= 0) return { ...blocked('same'), same: same + 1 };
    if (triedShapes.has(name)) return blocked('tried-shape');
    if (triedLayouts.has(diceLayoutKey(cells, labels))) return blocked('tried');
    return base;
  }

  return {
    readiness,
    fold(cells, labels) {
      if (!readiness(cells, labels).ready) return null;
      const r = judgeDice({ cells, labels });
      const number = made.length + 1;
      const firstTry = !history.some((s) => s.number === number);
      if (r.correct) {
        made.push({ name: r.name, family: r.info.family, cells: cells.map((c) => [...c]), labels: [...labels] });
        wrongRun = 0;
      } else {
        wrongRun += 1;
        if (r.kind === 'invalid') triedShapes.add(r.name);
        else triedLayouts.add(diceLayoutKey(cells, labels));
      }
      const step = { ...r, itemId: `${stageId}:${number}`, number, firstTry, made: made.length, done: made.length >= goal, wrongRun };
      history.push(step);
      return step;
    },
    made: () => made.map((d) => ({ ...d })),
    done: () => made.length >= goal,
    wrongRun: () => wrongRun,
    history: () => history.slice(),
    goal,
  };
}

/**
 * 놓는 판 아래 안내 (접기 전). 접어 보기 전의 화면이라 어느 눈끼리 마주 보는지·합이 맞는지는 말하지 않는다 —
 * 막는 까닭은 모두 놓은 모양이나 이미 접어 본 결과에서만 나온다
 */
export function diceFoldNote(readiness) {
  switch (readiness.reason) {
    case 'count': return '눈 카드 6장을 모두 놓으면 접어 볼 수 있어요.';
    case 'apart': return FREE_FOLD_NOTES.apart;
    case 'same': return `${diceOrdinal(readiness.same)} 주사위와 같은 모양이에요. 돌리거나 뒤집어도 같은 모양이니, 면을 옮겨 다른 모양을 만들어요.`;
    case 'tried-shape': return '접어 봤더니 정육면체가 안 된 모양이에요. 면을 옮겨 모양을 바꿔요.';
    case 'tried': return '이미 접어 본 놓기예요. 눈 카드의 자리를 바꿔 봐요.';
    case 'done': return '주사위를 모두 만들었어요.';
    default: return '놓은 그대로 접혀요. 마주 보는 두 눈의 합이 7인지 살펴봐요.';
  }
}

/** 힌트 그림자: 아직 주사위로 만들지 않은 전개도 하나 (도감 순서 — 한 줄 4칸 꼴부터) */
export function diceHintNet(madeNames = new Set()) {
  return CUBE_NETS.find((n) => !madeNames.has(n.name)) ?? null;
}

/** 결과 "오늘의 솜씨"에 쓸 숫자: 접은 횟수, 만든 주사위, 한 번에 맞힌 주사위, 다시 일어서기(고쳐서 맞힘 + 틀린 다음 주사위를 한 번에 맞힘) */
export function diceSummary(history) {
  const done = history.filter((s) => s.correct);
  const fixes = done.filter((s) => !s.firstTry).length;
  // 다시 일어서기: 앞 주사위를 처음에 틀린 뒤, 다음 주사위를 한 번에 맞힘 (엔진 점수 표와 같은 뜻. 틀린 문항 하나마다 한 번)
  let armed = 0;
  let bounces = 0;
  for (const s of history) {
    if (!s.correct && s.firstTry) armed += 1;
    else if (s.correct && s.firstTry && armed > 0) {
      armed = 0;
      bounces += 1;
    }
  }
  return { folds: history.length, made: done.length, firstTry: done.length - fixes, fixes, bounces };
}

/**
 * 결과 "오늘의 솜씨" 칸 (보여 주기만 한다. 점수는 엔진이 계산).
 * earned: 이번 판에 엔진이 준 점수 { first(한 번에 맞힘), again(고쳐서 맞힘 · 다시 일어서기) } — 칸 점수의 합 = 이번 판 점수
 */
export function diceHighlights(sum, { earned, goal = DICE_GOAL }) {
  return [
    { icon: 'cube', label: '만든 주사위', value: `${sum.made} / ${goal}` },
    { icon: 'target', label: '한 번에 맞힘', value: `${sum.firstTry}개`, xp: earned.first },
    { icon: 'rise', label: '다시 일어서기', value: `${sum.fixes + sum.bounces}번`, xp: earned.again },
  ];
}
