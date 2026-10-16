/**
 * 쌓기나무 차시의 단계 목록·문제 만들기·채점·까닭 문장 (순수 함수). 기획서: spec-grade6.md 2-4·4·5·6-4절
 * 문항은 ctx.rng로 만든다 — 같은 시드면 같은 문항이라 e2e 테스트도 정답을 안다(DOM에 정답을 숨겨 두지 않는다).
 * 교과서의 그림·문제 수치는 쓰지 않는다. 모양은 모두 여기서 새로 뽑는다.
 * 검사: tests/unit/net-workshop-blocks-logic.test.js
 */
import { josa } from '../../../shared/core/korean.js';
import {
  AROUND,
  COLS,
  MAX_H,
  OPPOSITE,
  ROWS,
  allTopsPictured,
  backView,
  cloneMap,
  count,
  emptyMap,
  fillsOf,
  fitsViews,
  flipLR,
  frontView,
  hiddenAdds,
  hiddenCells,
  layerOf,
  leftView,
  lookAlikes,
  lookKey,
  mapKey,
  pictureKey,
  sameLook,
  sameMap,
  sceneFrom,
  sceneKey,
  sideView,
  toCorner,
  topView,
} from './blocks.js';

/** 차시 묶음 (교과서 6-2 3단원의 차시와 하나씩 짝 — S1은 1·2차시) */
export const BLOCK_UNIT = '6학년 2학기 · 공간과 입체';
/**
 * chip: 단계 지도의 차시 칩(영역 고르는 화면이 생기기 전까지 정육면체 차시 뒤에 이어 보이므로 "쌓기나무 n차시"라고 적는다 — 교과서의 차시 번호)
 * minutes: 이 차시의 어림 시간(문항 수로 어림: 5~7분 · 7~10분) · note: 단원
 */
export const BLOCK_LESSONS = [
  { id: 'blocks-look', title: '어느 방향에서 보았을까', chip: '쌓기나무 1차시', minutes: 6, note: BLOCK_UNIT },
  { id: 'blocks-top', title: '만든 모양과 위에서 본 모양', chip: '쌓기나무 2차시', minutes: 8, note: BLOCK_UNIT },
  // S2: 교과서 3·4차시 (60~65쪽). 시간은 문항마다 어림(고르기 25~35초 · 칠하기·수 쓰기 35~55초 · 쌓기 45~80초, 위·앞·옆 세 장 칠하기는 그 두 배쯤)으로: 3차시 8~12분 · 4차시 6~9분
  { id: 'blocks-three', title: '위, 앞, 옆에서 본 모양', chip: '쌓기나무 3차시', minutes: 10, note: BLOCK_UNIT },
  { id: 'blocks-number', title: '위에서 본 모양에 수 쓰기', chip: '쌓기나무 4차시', minutes: 7, note: BLOCK_UNIT },
];

/**
 * 놀이 방법에 덧붙이는 쌓기나무 줄 (main.js의 howTo 끝에): 3·4차시의 모눈 칠하기·수 쓰기 둘(review-blocks-s2 S2-12) + 쌓기·돌려 보기 둘.
 * (쌓기·돌려 보기 두 줄이 맨 끝이다 — 처음 화면의 놀이 방법 검사가 그 두 줄을 끝에서 찾는다)
 */
export const BLOCK_HOW_TO = [
  '위, 앞, 옆에서 본 모양은 모눈의 칸을 눌러 칠하고, 한 번 더 누르면 지워요.',
  '위에서 본 모양에 수를 쓸 때는 칸을 누를 때마다 1, 2, 3으로 바뀌어요. [내리기] [올리기]로도 고쳐요.',
  '쌓기나무 차시에서는 판을 짧게 누르면 쌓이고, [빼기]를 누른 다음 누르면 빠져요. "위에서 본 판"의 칸을 눌러도 돼요.',
  '쌓기나무는 끌어서 여러 방향으로 돌려 보고, [위] [앞] [옆]을 누르면 그 방향에서 본 모양이 돼요.',
];

/** 별을 틀린 답의 수로 정하는 단계(starsBy: 'wrong'): 0번 ★3 · 1번 ★2 · 2번 이상 ★1 (주사위 주문 spec 16-13과 같은 기준) */
export function starsByWrong(wrong) {
  const n = Math.max(0, Math.floor(Number(wrong) || 0));
  return n === 0 ? 3 : n === 1 ? 2 : 1;
}

/** 결과 화면의 별 기준 안내 (별 3개가 안 될 때. 별 3개면 엔진의 "별 3개를 모두 받았어요!") */
export function starNoteByWrong(stars) {
  if (stars >= 3) return null;
  return stars === 2 ? '한 번도 틀리지 않으면 별 3개!' : '한 번만 틀리면 별 2개, 한 번도 틀리지 않으면 별 3개!';
}

/**
 * kind: play(쌓기 놀이터 — 채점 없음) · where(어느 쪽에서 본 모습인지 고르기) · scene(그쪽에서 본 모습 고르기)
 *       · copy(그림을 보고 똑같이 쌓기) · count(개수 고르기) · hidden(쌓기 → 다른 개수로도? → 한 번 더 쌓기)
 *       · flip(반대쪽에서 본 모양 고르기) · draw(위·앞·옆에서 본 모양을 모눈에 칠하기) · build(위·앞·옆을 보고 쌓기 → 다른 개수로도?)
 *       · write(자리마다 수 쓰기) · fromnum(수를 보고 쌓기) · numviews(수만 보고 앞·옆 칠하기, 모양 고르기)
 * area: 'blocks' — main.js가 이 표시로 쌓기나무 화면(blocks/index.js)에 넘긴다
 * starsBy: 'wrong' — 별을 틀린 답의 수로 정한다(0번 ★3 · 1번 ★2 · 2번 이상 ★1, starsByWrong). 문항이 2~3개뿐이라
 *   엔진의 정답률 기준(90%·70%)으로는 한 번만 틀려도 ★1이 되고 ★2가 나올 수 없는 단계에 쓴다(사용자 결정 2026-10-11).
 *   S2에서는 blocks-flip(3문항을 한 번씩 답함), blocks-fromnum(2문항을 맞힐 때까지), blocks-numviews(칠하기 2 + 고르기 1 — 고르기를 한 번
 *   틀리면 2/3 = 67%)가 그렇다. blocks-draw·blocks-write(3문항을 맞힐 때까지: 한 번 틀리면 75% ★2)와 blocks-build(답 7개 이상)는 정답률 그대로
 */
export const BLOCK_STAGES = [
  {
    id: 'blocks-play', lesson: 'blocks-look', area: 'blocks', kind: 'play', count: 3, order: '연습 주문',
    title: '쌓기 놀이터',
    goal: '쌓기나무를 쌓고, 빼고, 돌려 보며 쓰는 법을 익혀요.',
  },
  {
    id: 'blocks-where', lesson: 'blocks-look', area: 'blocks', kind: 'where', count: 4, order: '관찰 주문',
    title: '어느 방향에서 보았을까?',
    goal: '그림을 보고 어느 쪽에서 본 모습인지 골라요.',
  },
  {
    id: 'blocks-scene', lesson: 'blocks-look', area: 'blocks', kind: 'scene', count: 3, order: '관찰 주문', starsBy: 'wrong',
    title: '이쪽에서 보면?',
    goal: '위에서 본 그림을 보고, 화살표 쪽에서 본 모습을 골라요.',
  },
  {
    id: 'blocks-copy', lesson: 'blocks-top', area: 'blocks', kind: 'copy', count: 2, order: '따라 쌓기 주문', starsBy: 'wrong',
    title: '똑같이 만들기',
    goal: '그림을 보고 똑같은 모양으로 쌓아요.',
  },
  {
    id: 'blocks-count', lesson: 'blocks-top', area: 'blocks', kind: 'count', count: 4, order: '셈 주문',
    title: '모두 몇 개일까?',
    goal: '그림과 위에서 본 모양을 보고 쌓기나무의 개수를 구해요.',
  },
  {
    id: 'blocks-hidden', lesson: 'blocks-top', area: 'blocks', kind: 'hidden', count: 2, order: '탐정 주문',
    title: '숨겨진 쌓기나무',
    goal: '그림과 위에서 본 모양에 맞게 쌓고, 다른 개수로도 되는지 알아봐요.',
  },
  // ── 3차시 (60~63쪽) ──
  {
    id: 'blocks-flip', lesson: 'blocks-three', area: 'blocks', kind: 'flip', count: 3, order: '관찰 주문', starsBy: 'wrong',
    title: '앞과 뒤, 오른쪽과 왼쪽',
    goal: '한쪽에서 본 모양을 보고, 반대쪽에서 본 모양을 골라요.',
  },
  {
    id: 'blocks-draw', lesson: 'blocks-three', area: 'blocks', kind: 'draw', count: 3, order: '기록 주문',
    title: '위, 앞, 옆에서 본 모양 그리기',
    goal: '만든 모양을 보고 위, 앞, 옆에서 본 모양을 칠해요.',
  },
  {
    id: 'blocks-build', lesson: 'blocks-three', area: 'blocks', kind: 'build', count: 3, order: '설계 주문',
    title: '위, 앞, 옆을 보고 쌓기',
    goal: '위, 앞, 옆에서 본 모양에 맞게 쌓고, 다른 개수로도 되는지 알아봐요.',
  },
  // ── 4차시 (64~65쪽) ──
  {
    id: 'blocks-write', lesson: 'blocks-number', area: 'blocks', kind: 'write', count: 3, order: '기록 주문',
    title: '자리마다 몇 개?',
    goal: '만든 모양을 돌려 보며 위에서 본 모양의 자리마다 쌓기나무의 수를 써요.',
  },
  {
    id: 'blocks-fromnum', lesson: 'blocks-number', area: 'blocks', kind: 'fromnum', count: 2, order: '설계 주문', starsBy: 'wrong',
    title: '수를 보고 쌓기',
    goal: '위에서 본 모양에 쓴 수를 보고 똑같은 모양으로 쌓아요.',
  },
  {
    id: 'blocks-numviews', lesson: 'blocks-number', area: 'blocks', kind: 'numviews', count: 3, order: '추리 주문', starsBy: 'wrong',
    title: '수만 보고 알아내기',
    goal: '위에서 본 모양에 쓴 수만 보고 앞, 옆에서 본 모양과 만든 모양을 알아내요.',
  },
];

/** 오개념 tag (기획서 4절 표와 글자까지 같게) */
export const BLOCK_TAGS = Object.freeze({
  direction: '보는 방향',
  unseen: '보이지 않는 쌓기나무',
  floor: '바닥에 닿은 면',
  manyCounts: '개수가 여러 가지',
  frontSide: '앞과 옆',
  mirror: '좌우 뒤집힘',
  tallest: '가장 높은 층',
  numberMeaning: '수의 뜻',
});

// ── 말 ───────────────────────────────────
/** 자리 이름: "2줄 3칸" (줄은 앞줄부터, 칸은 왼쪽부터) */
export const spotName = (x, y) => `${y + 1}줄 ${x + 1}칸`;
export const countWord = (n) => `${n}개`;
const COLUMN_WORDS = ['왼쪽', '가운데', '오른쪽'];

// ── 1차시: 조형물이 놓인 판 ─────────────────
/** 조형물 셋: 색 + 무늬 + 높이 + 이름이 모두 다르다 (색만으로 구분하지 않는다) */
export const SCULPTURES = Object.freeze([
  { id: 'yellow', name: '노란 탑', height: 3, face: 1, mark: 'plain' },
  { id: 'blue', name: '파란 기둥', height: 2, face: 2, mark: 'slash' }, // 빗금 두 줄(가로줄은 층 경계처럼 보여 쓰지 않는다)
  { id: 'pink', name: '분홍 상자', height: 1, face: 4, mark: 'dot' },
]);
export const sculptureOf = (id) => SCULPTURES.find((s) => s.id === id) ?? null;

/** 판 둘레의 네 방향과 화살표 이름: 가(앞) · 나(오른쪽) · 다(뒤) · 라(왼쪽) */
export const DIR_LETTERS = Object.freeze({ front: '가', right: '나', back: '다', left: '라' });
/** 위에서 내려다본 배치 그림에서 그 방향이 놓이는 쪽 */
export const MAP_SIDES = Object.freeze({ front: '아래쪽', right: '오른쪽', back: '위쪽', left: '왼쪽' });

/** 배치 하나: 조형물 셋의 자리. 네 방향의 모습이 모두 다르고, 처음 보기(그림)에서 가려진 쌓기나무가 없고, 어느 쪽에서는 가려지는 것이 있다 */
export function makeScene(rng) {
  const spots = [];
  for (let y = 0; y < ROWS; y += 1) for (let x = 0; x < COLS; x += 1) spots.push([x, y]);
  for (let tries = 0; tries < 400; tries += 1) {
    const picked = rng.sample(spots, SCULPTURES.length);
    const h = emptyMap();
    const color = h.map((row) => row.map(() => null));
    picked.forEach(([x, y], i) => {
      h[y][x] = SCULPTURES[i].height;
      color[y][x] = SCULPTURES[i].id;
    });
    const views = Object.fromEntries(AROUND.map((dir) => [dir, sceneFrom(h, color, dir)]));
    if (new Set(AROUND.map((dir) => sceneKey(views[dir]))).size < AROUND.length) continue;
    if (hiddenCells(h).length > 0) continue;
    // 같은 줄이나 같은 칸에 둘이 있어야 어느 쪽에서는 앞의 것이 뒤의 것을 가린다
    const lined = picked.some(([x, y], i) => picked.some(([x2, y2], j) => i < j && (x === x2 || y === y2)));
    if (!lined) continue;
    return { h, color, views };
  }
  // 조건에 맞는 배치는 흔해서 여기까지 오지 않는다 — 그래도 늘 같은 배치로 끝낸다
  const h = [[3, 0, 0], [0, 0, 2], [1, 0, 0]];
  const color = [['yellow', null, null], [null, null, 'blue'], ['pink', null, null]];
  return { h, color, views: Object.fromEntries(AROUND.map((dir) => [dir, sceneFrom(h, color, dir)])) };
}

/** 그 모습에서 보이는 조형물과 자리: [{ id, column(0 왼쪽 ~ 2 오른쪽) }] 왼쪽부터 */
export function seenIn(scene) {
  const out = [];
  for (let i = 0; i < COLS; i += 1) {
    for (let z = 0; z < MAX_H; z += 1) {
      const id = scene[z][i];
      if (id && !out.some((s) => s.id === id)) out.push({ id, column: i });
    }
  }
  return out;
}

/** 이름들을 잇는다: ["파란 기둥", "분홍 상자"] → "파란 기둥과 분홍 상자" */
const joinNames = (names) => names.map((name, i) => (i < names.length - 1 ? josa(name, '과/와') : name)).join(' ');

/**
 * 그 모습을 말로: "왼쪽에 파란 기둥, 오른쪽에 노란 탑이 보여요."
 * 같은 세로줄에 둘이 겹쳐 보이면 앞의 것부터 "가운데에 분홍 상자와 그 뒤의 노란 탑", 가려진 것은 "파란 기둥과 분홍 상자는 가려서 안 보여요."
 */
export function describeScene(scene) {
  const seen = seenIn(scene);
  const groups = [];
  for (const s of seen) {
    const group = groups.find((g) => g.column === s.column);
    if (group) group.names.push(sculptureOf(s.id).name);
    else groups.push({ column: s.column, names: [sculptureOf(s.id).name] });
  }
  // 한 세로줄 안에서는 아래층에 먼저 보이는 것이 앞에 있는 것이다: "분홍 상자와 그 뒤의 노란 탑"
  const stacked = ([front, ...behind]) => (behind.length ? `${josa(front, '과/와')} ${behind.map((name) => `그 뒤의 ${name}`).join(', ')}` : front);
  const shown = groups.map((g) => `${COLUMN_WORDS[g.column]}에 ${stacked(g.names)}`).join(', ');
  const last = sculptureOf(seen[seen.length - 1].id).name;
  return `${shown}${josa(last, '이/가').slice(last.length)} 보여요.${hiddenNote(scene)}`;
}

const columnOf = (scene, id) => {
  const seen = seenIn(scene).find((s) => s.id === id);
  return seen ? COLUMN_WORDS[seen.column] : null;
};

/** 그 모습에서 가려서 안 보이는 조형물: " 파란 기둥과 분홍 상자는 가려서 안 보여요." (없으면 빈 글) */
function hiddenNote(scene) {
  const hidden = SCULPTURES.filter((s) => !columnOf(scene, s.id)).map((s) => s.name);
  return hidden.length ? ` ${josa(joinNames(hidden), '은/는')} 가려서 안 보여요.` : '';
}

/** 그 모습의 한 줄: "노란 탑이 왼쪽에 보여요." (노란 탑은 가장 높아 어느 쪽에서도 보인다) + 가려진 것 */
export function towerLine(scene) {
  const tower = SCULPTURES[0];
  return `${josa(tower.name, '이/가')} ${columnOf(scene, tower.id)}에 보여요.${hiddenNote(scene)}`;
}

/**
 * 두 모습을 가르는 한 마디(scene에서는 이렇다): 자리가 다른 조형물(노란 탑부터) → 한쪽에서만 보이는 조형물 → 겹친 모습.
 * 예: "노란 탑이 왼쪽에 있어요"
 */
export function tellApart(scene, other) {
  for (const s of SCULPTURES) {
    const here = columnOf(scene, s.id);
    const there = columnOf(other, s.id);
    if (here && there && here !== there) return `${josa(s.name, '이/가')} ${here}에 있어요`;
  }
  for (const s of SCULPTURES) {
    const here = columnOf(scene, s.id);
    const there = columnOf(other, s.id);
    if (!here && there) return `${josa(s.name, '은/는')} 가려서 안 보여요`;
    if (here && !there) return `${josa(s.name, '이/가')} ${here}에 보여요`;
  }
  return '앞뒤로 겹친 모습이 달라요';
}

/** 한 판에서 같은 방향이 정답인 문항은 이만큼까지 */
export const WHERE_REPEAT_MAX = 2;

/**
 * blocks-where의 정답 방향들: 문항마다 따로 뽑는다(넷이 한 번씩 나오게 하면 지워 가며 맞힐 수 있다 — 끝 문항은 그림을 보지 않고도 정해진다).
 * 한 방향만 거듭 나오지는 않게 같은 방향은 한 판에 두 번까지.
 */
export function drawDirections(rng, n) {
  for (;;) {
    const dirs = Array.from({ length: n }, () => rng.pick(AROUND));
    if (AROUND.every((d) => dirs.filter((x) => x === d).length <= WHERE_REPEAT_MAX)) return dirs;
  }
}

function makeWhereQuestions(stage, rng) {
  const dirs = drawDirections(rng, stage.count);
  return Array.from({ length: stage.count }, (_, i) => {
    const scene = makeScene(rng);
    const dir = dirs[i];
    return { itemId: `${stage.id}:${i + 1}`, ...scene, dir, expected: DIR_LETTERS[dir], picture: scene.views[dir] };
  });
}

/** blocks-where 채점: 고른 방향 → { correct, tag, expected, message } */
export function judgeDirection(q, dir) {
  const correct = dir === q.dir;
  const mine = DIR_LETTERS[dir];
  const answer = DIR_LETTERS[q.dir];
  if (correct) return { correct, tag: null, expected: answer, message: `맞아요! ${answer} 쪽에서 보면 ${towerLine(q.picture)}` };
  const across = OPPOSITE[q.dir] === dir ? '맞은편인 ' : '';
  return {
    correct,
    tag: BLOCK_TAGS.direction,
    expected: answer,
    message: `${mine} 쪽에서 보면 ${tellApart(q.views[dir], q.picture)}. 이 그림은 ${across}${answer} 쪽에서 본 모습이에요.`,
  };
}

function makeSceneQuestions(stage, rng) {
  const dirs = rng.shuffle(AROUND);
  return Array.from({ length: stage.count }, (_, i) => {
    const scene = makeScene(rng);
    const dir = dirs[i % dirs.length];
    const options = rng.shuffle(AROUND).map((d) => ({ dir: d, picture: scene.views[d] }));
    return { itemId: `${stage.id}:${i + 1}`, ...scene, dir, options, expected: options.findIndex((o) => o.dir === dir) + 1 };
  });
}

/** blocks-scene 채점: 고른 보기 번호(1부터) → { correct, tag, expected, chosenDir, message } */
export function judgeScene(q, choice) {
  const option = q.options[choice - 1];
  const correct = Boolean(option) && option.dir === q.dir;
  if (correct) return { correct, tag: null, expected: q.expected, chosenDir: q.dir, message: `맞아요! 화살표 쪽에서 보면 ${towerLine(q.views[q.dir])}` };
  const side = MAP_SIDES[option?.dir] ?? '다른 쪽';
  const from = option && OPPOSITE[q.dir] === option.dir ? `맞은편(${side})` : side;
  return {
    correct,
    tag: BLOCK_TAGS.direction,
    expected: q.expected,
    chosenDir: option?.dir ?? null,
    message: `고른 그림은 ${from}에서 본 모습이에요. 화살표 쪽에서 보면 ${option ? tellApart(q.views[q.dir], option.picture) : towerLine(q.views[q.dir])}.`,
  };
}

// ── 2차시: 모양 뽑기 ─────────────────────
/** 이어진 바닥 모양(cells자리)에 자리마다 높이 1~maxH를 준 높이 지도 */
export function randomShape(rng, { cells, maxH = MAX_H }) {
  const start = [rng.int(0, COLS - 1), rng.int(0, ROWS - 1)];
  const spots = [start];
  const has = (x, y) => spots.some((s) => s[0] === x && s[1] === y);
  while (spots.length < cells) {
    const next = [];
    for (const [x, y] of spots) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS && !has(nx, ny) && !next.some((s) => s[0] === nx && s[1] === ny)) next.push([nx, ny]);
      }
    }
    if (next.length === 0) break;
    spots.push(rng.pick(next));
  }
  const h = emptyMap();
  for (const [x, y] of spots) h[y][x] = rng.int(1, maxH);
  return h;
}

/** 조건(test)에 맞는 모양을 뽑는다. tries번 안에 없으면 fallback(늘 같은 모양) */
function drawShape(rng, { cells, counts, test, fallback, tries = 600 }) {
  for (let i = 0; i < tries; i += 1) {
    const h = randomShape(rng, { cells: rng.int(cells[0], cells[1]) });
    const n = count(h);
    if (n < counts[0] || n > counts[1]) continue;
    if (test(h)) return h;
  }
  return cloneMap(fallback);
}

/** 판 위에서 통째로 옮긴 모든 자리의 높이 지도 */
export function shiftsOf(h) {
  const corner = toCorner(h);
  let wide = 0;
  let deep = 0;
  corner.forEach((row, y) => row.forEach((v, x) => {
    if (v > 0) {
      wide = Math.max(wide, x + 1);
      deep = Math.max(deep, y + 1);
    }
  }));
  const out = [];
  for (let dy = 0; dy + deep <= ROWS; dy += 1) {
    for (let dx = 0; dx + wide <= COLS; dx += 1) {
      const g = emptyMap();
      corner.forEach((row, y) => row.forEach((v, x) => {
        if (v > 0) g[y + dy][x + dx] = v;
      }));
      out.push(g);
    }
  }
  return out;
}

/** 한 자리의 높이만 바꿔서(0~3) 그림이 그대로인 쌓기가 있는가 */
function oneSpotAlike(h) {
  const key = pictureKey(h);
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      for (let v = 0; v <= MAX_H; v += 1) {
        if (v === h[y][x]) continue;
        const g = cloneMap(h);
        g[y][x] = v;
        if (pictureKey(g) === key) return true;
      }
    }
  }
  return false;
}

/**
 * 그림만으로 개수가 정해지는가(판 위에서 통째로 옮긴 것은 같은 쌓기로 본다 — sameLook).
 * 판 위의 어느 자리로 옮겨 놓아도 "한 자리만 바꿔서 그림이 그대로인 쌓기"가 없으면 정해진다.
 * (3×3칸·3층에서 바닥이 이어진 4~12개 모양 56,616개 전부를 나열한 값과 같다 — 단위 테스트)
 */
export const countFixedByPicture = (h) => shiftsOf(h).every((g) => !oneSpotAlike(g));

const tallest = (h) => Math.max(...h.flat());

function makeCopyQuestions(stage, rng) {
  // 1번: 그림만으로 개수가 정해지는 모양(쉬운 것) — 숨겨진 쌓기나무가 없고 2층 이상이 있다
  const first = drawShape(rng, {
    cells: [3, 5],
    counts: [4, 6],
    test: (h) => tallest(h) >= 2 && hiddenCells(h).length === 0 && countFixedByPicture(h),
    fallback: [[2, 1, 0], [1, 0, 0], [0, 0, 0]],
  });
  // 2번: 그림만으로는 개수가 정해지지 않는 모양 — 보이는 대로 쌓은 것(숨겨진 것 없음)에 하나를 더 숨길 수 있다
  const second = drawShape(rng, {
    cells: [3, 5],
    counts: [5, 8],
    test: (h) => hiddenCells(h).length === 0 && hiddenAdds(h).length > 0 && !sameLook(h, first),
    fallback: [[0, 3, 1], [0, 0, 0], [0, 0, 0]],
  });
  const targets = [first, second].slice(0, stage.count);
  return targets.map((target, i) => {
    const adds = hiddenAdds(target);
    return {
      itemId: `${stage.id}:${i + 1}`,
      target,
      fixed: adds.length === 0,
      // 같은 그림인데 개수가 더 많은 쌓기(가장 적게 더한 것). 없으면 null
      alt: adds.length ? adds.reduce((best, g) => (count(g) < count(best) ? g : best)) : null,
      expected: mapKey(target),
    };
  });
}

/** 좌우를 뒤집은 높이 지도 / 앞과 옆을 바꾼 높이 지도 */
export const mirrorMap = (h) => h.map((row) => flipLR(row));
export const swapMap = (h) => h[0].map((_, x) => h.map((row) => row[x]));

/** 쌓은 것이 목표와 어떻게 다른가 → tag (자리가 다르면 바닥에 닿은 면, 높이만 다르면 가장 높은 층) */
function buildTag(mine, target) {
  if (sameMap(toCorner(mine), toCorner(mirrorMap(target)))) return BLOCK_TAGS.mirror;
  if (sameMap(toCorner(mine), toCorner(swapMap(target)))) return BLOCK_TAGS.frontSide;
  return sameMap(toCorner(topView(mine)), toCorner(topView(target))) ? BLOCK_TAGS.tallest : BLOCK_TAGS.floor;
}

const BUILD_NOTES = {
  [BLOCK_TAGS.mirror]: '왼쪽과 오른쪽이 뒤집혔어요. 그림과 같은 쪽에서 보고 견줘 봐요.',
  [BLOCK_TAGS.frontSide]: '앞과 옆이 서로 바뀌었어요. 판의 "앞" 글자 쪽이 그림의 왼쪽 아래예요.',
  [BLOCK_TAGS.tallest]: '쌓은 자리는 맞아요. 높이가 다른 자리가 있어요.',
  [BLOCK_TAGS.floor]: '쌓은 자리가 달라요. 바닥에 닿은 자리부터 맞춰 봐요.',
};

/** blocks-copy 채점: 내 쌓기를 그림과 같은 쪽에서 본 모습이 그림과 같으면 맞음 */
export function judgeLook(q, mine) {
  if (count(mine) === 0) return { correct: false, empty: true, tag: null, expected: q.expected, message: '쌓기나무를 먼저 쌓아요.' };
  const correct = sameLook(mine, q.target);
  if (correct) return { correct, tag: null, expected: q.expected, message: `맞아요! 그림과 같은 쪽에서 보면 똑같아요. 쌓기나무 ${countWord(count(mine))}로 만들었어요.` };
  const tag = buildTag(mine, q.target);
  return { correct, tag, expected: q.expected, message: `그림과 같은 쪽에서 보면 달라요. ${BUILD_NOTES[tag]}` };
}

/** blocks-copy에서 맞힌 뒤: 그림은 같아 보이는데 개수가 다른 쌓기 (내 개수와 다른 쪽을 고른다). 없으면 null */
export function otherLook(q, mine) {
  if (!q.alt) return null;
  return count(mine) === count(q.alt) ? cloneMap(q.target) : cloneMap(q.alt);
}

/** "무엇을 더 알면 똑같이 만들 수 있을까요?" 보기 (맞는 것은 위에서 본 모양 — 다음 단계로 잇는다) */
export const MORE_CLUES = Object.freeze([
  { id: 'top', text: '위에서 본 모양' },
  { id: 'color', text: '쌓기나무의 색' },
  { id: 'size', text: '그림의 크기' },
]);
export const MORE_CLUE_ANSWER = 'top';

/**
 * 정답보다 큰 쪽에 놓는 "함정처럼 떨어진 수"의 거리 쌍 [숨은 수, 칸 수 거리]와 그 무게.
 * 함정 값은 늘 정답보다 작고 정답에서 떨어진 거리가 문항마다 다르다(보이는 것만 센 수: 숨은 쌓기나무의 수만큼 · 위에서 본 칸 수: 2층 이상의 수만큼).
 * 큰 쪽 보기를 늘 정답 + 1~3으로 두면 "가장 큰 수 − 3보다 작은 보기는 오답" 같은 규칙으로 풀린다(review-blocks S1b-1, 60.3%).
 * 그래서 큰 쪽에도 함정 값과 같은 꼴로 떨어진 수를 둔다: 쌓기 문항 8,000개에서 잰 함정 거리의 분포를 어림한 표.
 * (숨은 수가 0이면 함정이 하나뿐인 문항과 같은 꼴 — 칸 수 거리만 쓴다)
 */
const MIRROR_TRAPS = [[0, 1, 2], [0, 2, 12], [0, 3, 11], [0, 4, 9], [0, 5, 4], [0, 6, 2], [1, 2, 5], [1, 3, 8], [1, 4, 8], [1, 5, 5], [1, 6, 1], [2, 3, 1], [2, 4, 4], [2, 5, 3], [2, 6, 2], [3, 5, 1]]
  .flatMap(([hid, far, weight]) => Array.from({ length: weight }, () => [hid, far]));
/** 함정 값·떨어진 수로 모자란 보기를 채우는 거리(위·아래 같은 분포) */
const FILL_GAPS = [1, 2, 2, 3, 3, 4, 4, 5, 6];

/**
 * blocks-count의 보기 넷(작은 수부터).
 * 정답이 크기 순으로 몇째인지(= 놓이는 자리)를 먼저 뽑는다 — 함정 값(보이는 것만 센 수, 위에서 본 모양의 칸 수)은 늘 정답보다 작아서,
 * 함정을 늘 넣고 남는 칸을 큰 수로 채우면 정답이 늘 "끝에서 둘째"가 된다(자리가 답을 알려 준다).
 * 정답보다 작은 보기 rank개: 함정 값부터(숨겨진 것이 있으면 보이는 것만 센 수 먼저) 넣는다.
 * 정답보다 큰 보기 3 − rank개: 함정 값과 같은 꼴로 떨어진 수(MIRROR_TRAPS)부터 넣는다 — 보기의 값과 간격만 보고는 위아래가 갈리지 않게.
 * 모자라면 위·아래 모두 같은 거리 분포(FILL_GAPS)에서 채운다. 작은 수가 모자라면(정답이 아주 작을 때) 큰 수로 채운다.
 * 검사: 시드 1,000개에서 정답 자리마다 15~35%, 값만 보는 규칙(가장 큰/작은/가운데, 이어진 수 묶음, 큰 간격의 앞뒤, 가장 큰 수 − 3 …)이 25 ± 10%
 */
export function countOptions(rng, { total, seen, spots }) {
  const rank = rng.int(0, 3);
  const used = new Set([total]);
  const below = [];
  const above = [];
  const add = (list, value) => {
    if (value <= 0 || used.has(value)) return;
    list.push(value);
    used.add(value);
  };
  for (const trap of [seen, spots]) if (below.length < rank && trap < total) add(below, trap);
  for (const far of rng.pick(MIRROR_TRAPS)) if (above.length < 3 - rank && far > 0) add(above, total + far);
  for (let guard = 0; below.length < rank && guard < 60; guard += 1) add(below, total - rng.pick(FILL_GAPS));
  for (let guard = 0; below.length + above.length < 3 && guard < 60; guard += 1) add(above, total + rng.pick(FILL_GAPS));
  return [...below, total, ...above].sort((a, b) => a - b);
}

function makeCountQuestions(stage, rng) {
  const fixed = (h) => lookAlikes(h, { top: topView(h) }).length === 1;
  const used = new Set();
  const draw = (wantHidden, fallback) => {
    const h = drawShape(rng, {
      cells: [3, 6],
      counts: [5, 10],
      test: (g) => tallest(g) >= 2 && (hiddenCells(g).length > 0) === wantHidden && !used.has(mapKey(g)) && fixed(g),
      fallback,
    });
    used.add(mapKey(h));
    return h;
  };
  // 문항의 절반은 숨겨진 쌓기나무가 있는 모양
  const half = Math.floor(stage.count / 2);
  const hiddenFallbacks = [[[0, 2, 0], [1, 3, 0], [0, 1, 0]], [[1, 2, 0], [0, 2, 0], [0, 3, 0]]];
  const openFallbacks = [[[2, 1, 0], [1, 1, 0], [0, 1, 0]], [[1, 1, 2], [0, 0, 1], [0, 0, 1]]];
  const targets = rng.shuffle([
    ...Array.from({ length: half }, (_, i) => draw(true, hiddenFallbacks[i % 2])),
    ...Array.from({ length: stage.count - half }, (_, i) => draw(false, openFallbacks[i % 2])),
  ]);
  return targets.map((target, i) => {
    const total = count(target);
    const hidden = hiddenCells(target);
    const spots = count(topView(target));
    return {
      itemId: `${stage.id}:${i + 1}`,
      target,
      top: topView(target),
      hidden,
      spots,
      seen: total - hidden.length,
      options: countOptions(rng, { total, seen: total - hidden.length, spots }),
      expected: total,
    };
  });
}

/** 층마다 몇 개인지: "1층에 5개, 2층에 2개, 모두 7개예요." */
export function layerSentence(h) {
  const parts = [];
  for (let k = 1; k <= MAX_H; k += 1) {
    const n = count(layerOf(h, k));
    if (n > 0) parts.push(`${k}층에 ${n}개`);
  }
  return `${parts.join(', ')}, 모두 ${count(h)}개예요.`;
}

/**
 * blocks-count 채점: 고른 개수 → { correct, tag, expected, message }
 * 정답보다 큰 수를 골랐으면 숨은 것을 놓친 것이 아니다(더 많이 셌다) — tag 없이 층마다 세어 보게 한다(review-blocks S1b-8)
 */
export function judgeCount(q, value) {
  const correct = value === q.expected;
  const layers = layerSentence(q.target);
  const hid = q.hidden.length > 0 ? ` 그림에 보이지 않는 쌓기나무가 ${q.hidden.length}개 숨어 있었어요.` : '';
  if (correct) return { correct, tag: null, expected: q.expected, message: `맞아요! ${layers}${hid}` };
  if (value > q.expected) return { correct, tag: null, expected: q.expected, message: `층마다 세어 봐요. ${layers}` };
  if (value === q.spots) {
    return {
      correct,
      tag: BLOCK_TAGS.floor,
      expected: q.expected,
      message: `위에서 본 모양은 바닥에 닿은 면의 모양이에요. 자리는 ${q.spots}곳이지만 2층, 3층에도 쌓여 있어요. ${layers}`,
    };
  }
  return {
    correct,
    tag: BLOCK_TAGS.unseen,
    expected: q.expected,
    message: q.hidden.length > 0
      ? `그림에 보이지 않는 쌓기나무가 ${q.hidden.length}개 숨어 있었어요. ${layers}`
      : `층마다 세어 봐요. ${layers}`,
  };
}

function makeHiddenQuestions(stage, rng) {
  // 여러 가지: 그림과 위에서 본 모양이 같은 쌓기가 2~3가지이고, 가려진 한 자리의 높이만 다르다
  let many = null;
  for (let i = 0; i < 600 && !many; i += 1) {
    const h = randomShape(rng, { cells: rng.int(4, 6) });
    const n = count(h);
    if (n < 5 || n > 10) continue;
    const alikes = lookAlikes(h, { top: topView(h) });
    if (alikes.length < 2 || alikes.length > 3) continue;
    const low = alikes.reduce((best, g) => (count(g) < count(best) ? g : best));
    const spots = [];
    for (let y = 0; y < ROWS; y += 1) for (let x = 0; x < COLS; x += 1) if (alikes.some((g) => g[y][x] !== low[y][x])) spots.push([x, y]);
    if (spots.length === 1) many = { alikes, low, spot: spots[0] };
  }
  if (!many) {
    const low = [[0, 3, 1], [0, 1, 0], [0, 0, 0]];
    many = { alikes: lookAlikes(low, { top: topView(low) }), low, spot: [1, 1] };
  }
  // 하나뿐: 자리마다 맨 위 쌓기나무가 그림에 보인다
  const one = drawShape(rng, {
    cells: [4, 6],
    counts: [5, 9],
    test: (h) => tallest(h) >= 2 && allTopsPictured(h) && lookAlikes(h, { top: topView(h) }).length === 1 && !sameMap(h, many.low),
    fallback: [[2, 1, 0], [1, 1, 0], [0, 1, 0]],
  });
  const heights = many.alikes.map((g) => g[many.spot[1]][many.spot[0]]).sort((a, b) => a - b);
  const list = rng.shuffle([
    { many: true, target: many.low, alikes: many.alikes, spot: many.spot, heights },
    { many: false, target: one, alikes: [one], spot: null, heights: [] },
  ]).slice(0, stage.count);
  return list.map((q, i) => ({
    itemId: `${stage.id}:${i + 1}`,
    ...q,
    top: topView(q.target),
    counts: [...new Set(q.alikes.map(count))].sort((a, b) => a - b),
    expected: q.many ? 'yes' : 'no',
  }));
}

/** 내 쌓기가 그림과 위에서 본 모양에 맞는가 (판 위에서 통째로 옮긴 것은 같다고 본다) */
export const fitsGiven = (q, mine) => q.alikes.some((g) => sameMap(toCorner(g), toCorner(mine)));

/** blocks-hidden ①: 그림과 위에서 본 모양에 맞게 쌓았는가 → { correct, tag, topOk, message } */
export function judgeBuild(q, mine) {
  if (count(mine) === 0) return { correct: false, empty: true, tag: null, topOk: false, message: '쌓기나무를 먼저 쌓아요.' };
  const topOk = sameMap(toCorner(topView(mine)), toCorner(q.top));
  if (fitsGiven(q, mine)) return { correct: true, tag: null, topOk, message: `맞아요! 그림과 위에서 본 모양에 맞아요. 쌓기나무 ${countWord(count(mine))}로 만들었어요.` };
  return topOk
    ? { correct: false, tag: BLOCK_TAGS.tallest, topOk, message: '그림과 같은 쪽에서 보면 높이가 다른 자리가 있어요. 위에서 본 모양은 맞아요.' }
    : { correct: false, tag: BLOCK_TAGS.floor, topOk, message: '위에서 본 모양이 달라요. 위에서 본 모양은 바닥에 닿은 면의 모양이에요. 쌓인 자리부터 맞춰 봐요.' };
}

/** blocks-hidden ②: "다른 개수로도 똑같아 보이게 만들 수 있을까요?" 예상 → { correct, tag, expected, message } */
export function judgeGuess(q, answer) {
  const correct = answer === q.expected;
  const tag = correct ? null : BLOCK_TAGS.manyCounts;
  if (q.many) {
    const [x, y] = q.spot;
    const range = `${q.heights[0]}층이어도 ${q.heights[q.heights.length - 1]}층이어도`;
    return {
      correct,
      tag,
      expected: q.expected,
      message: `${correct ? '맞아요! ' : '만들 수 있어요. '}${spotName(x, y)} 자리는 다른 쌓기나무에 가려서 ${range} 똑같아 보여요.`,
    };
  }
  return {
    correct,
    tag,
    expected: q.expected,
    message: `${correct ? '맞아요! ' : '이 모양은 다른 개수로는 만들 수 없어요. '}자리마다 맨 위 쌓기나무가 그림에 보여서 개수가 하나로 정해져요.`,
  };
}

/**
 * blocks-hidden ③: 다른 개수로 한 번 더 쌓기. first = 처음에 맞힌 내 쌓기
 * → { status: 'ok' | 'same'(이미 한 쌓기 — 기록하지 않는다) | 'wrong', correct, tag, message }
 */
export function judgeOther(q, mine, first) {
  if (sameMap(toCorner(mine), toCorner(first))) return { status: 'same', correct: false, tag: null, message: '이미 한 쌓기예요. 가려진 자리의 높이를 바꿔 봐요.' };
  const built = judgeBuild(q, mine);
  if (!built.correct) return { status: 'wrong', ...built };
  return {
    status: 'ok',
    correct: true,
    tag: null,
    message: `맞아요! 쌓기나무 ${countWord(count(first))}로 만든 것도, ${countWord(count(mine))}로 만든 것도 그림과 위에서 본 모양이 같아요.`,
  };
}

/**
 * 쌓는 문항의 힌트(같은 문항을 두 번 틀린 뒤).
 * 위에서 본 모양이 주어진 문항: 내 쌓기와 다른 한 자리의 높이를 알려 준다 → { x, y, value, text } (x, y는 주어진 위에서 본 모양의 자리)
 * 그림만 주어진 문항(blocks-copy): 보이는 개수와 가장 높은 층을 말로 → { text }
 */
export function buildHint(q, mine) {
  if (!q.top) return { text: `그림에 보이는 쌓기나무만 세면 ${countWord(count(q.target))}예요. 가장 높은 곳은 ${tallest(q.target)}층이에요.` };
  const target = toCorner(q.target);
  const me = toCorner(mine);
  // 주어진 위에서 본 모양이 판의 구석에서 얼마나 떨어져 있는가
  let offX = COLS;
  let offY = ROWS;
  q.top.forEach((row, y) => row.forEach((on, x) => {
    if (on) {
      offX = Math.min(offX, x);
      offY = Math.min(offY, y);
    }
  }));
  const spots = [];
  for (let y = 0; y < ROWS; y += 1) for (let x = 0; x < COLS; x += 1) if (target[y][x] > 0) spots.push([x, y]);
  const fixedSpots = spots.filter(([x, y]) => !(q.spot && q.spot[0] === x + offX && q.spot[1] === y + offY));
  const [cx, cy] = fixedSpots.find(([x, y]) => me[y][x] !== target[y][x]) ?? fixedSpots[0] ?? spots[0];
  const value = target[cy][cx];
  return { x: cx + offX, y: cy + offY, value, text: `위에서 본 모양에서 ${spotName(cx + offX, cy + offY)} 자리는 ${value}층이에요.` };
}

// ── 3·4차시: 위·앞·옆에서 본 모양 (2D 그림) ─────────
/*
 * 2D 그림의 칸(0 · 1): 위 = [줄][칸](줄 0 = 앞줄, 칸 0 = 왼쪽) · 앞·옆·뒤·왼쪽 = [층][세로줄](층 0 = 1층, 세로줄은 그쪽에서 볼 때 왼쪽부터 —
 * 앞에서는 칸 0~2, 옆(오른쪽)에서는 줄 0~2 = 앞줄이 왼쪽). 뒤·왼쪽에서 본 모양은 앞·옆을 좌우로 뒤집은 것이다(교과서 60쪽).
 * 학생이 칠한 그림은 판 위의 자리와 상관없이 모양만 견준다: 앞·옆은 왼쪽으로, 위는 왼쪽·앞쪽으로 붙여서(normalizeView).
 * 앞·옆은 아래로 옮기지 않는다 — 바닥(1층)부터 그려야 한다.
 */
export const VIEW_NAMES = Object.freeze({ top: '위', front: '앞', side: '옆', back: '뒤', left: '왼쪽' });
/** 그림 이름: "앞에서 본 모양" */
export const viewTitle = (kind) => `${VIEW_NAMES[kind]}에서 본 모양`;

/** 세로줄마다 높이(왼쪽부터) → 그림 칸 [층][세로줄] */
export const columnsToCells = (heights) => Array.from({ length: MAX_H }, (_, z) => heights.map((v) => (v > z ? 1 : 0)));

/** 그쪽에서 본 모양의 세로줄마다 높이(왼쪽부터) */
export function viewHeights(h, kind) {
  if (kind === 'front') return frontView(h);
  if (kind === 'side') return sideView(h);
  if (kind === 'back') return backView(h);
  if (kind === 'left') return leftView(h);
  throw new Error(`세로줄 높이가 없는 그림: ${kind}`);
}

/** 쌓기 → 그쪽에서 본 모양의 그림 칸 */
export const viewCells = (h, kind) => (kind === 'top' ? topView(h) : columnsToCells(viewHeights(h, kind)));

const cellsOfGrid = (g) => {
  const out = [];
  g.forEach((row, r) => row.forEach((v, c) => {
    if (v) out.push([r, c]);
  }));
  return out;
};
/** 칠한 칸이 하나도 없는가 */
export const blankCells = (g) => cellsOfGrid(g).length === 0;
/** 그림 칸을 옮긴다(판 밖으로 나가는 칸은 버린다) */
export function shiftCells(g, dc, dr = 0) {
  const out = g.map((row) => row.map(() => 0));
  cellsOfGrid(g).forEach(([r, c]) => {
    if (out[r + dr]?.[c + dc] !== undefined) out[r + dr][c + dc] = 1;
  });
  return out;
}
/** 칠한 칸의 왼쪽 끝 · 아래(앞) 끝 · 오른쪽 끝 · 위(뒤) 끝 */
function cellsBox(g) {
  const cells = cellsOfGrid(g);
  if (cells.length === 0) return null;
  return { c0: Math.min(...cells.map(([, c]) => c)), r0: Math.min(...cells.map(([r]) => r)), c1: Math.max(...cells.map(([, c]) => c)), r1: Math.max(...cells.map(([r]) => r)) };
}
/** 판 위의 자리와 상관없이 견주게 붙인다: 앞·옆은 왼쪽으로, 위는 왼쪽·앞쪽으로 */
export function normalizeView(g, kind) {
  const box = cellsBox(g);
  return box ? shiftCells(g, -box.c0, kind === 'top' ? -box.r0 : 0) : g.map((row) => [...row]);
}
export const viewKey = (g, kind) => mapKey(normalizeView(g, kind));
export const sameView = (a, b, kind) => viewKey(a, kind) === viewKey(b, kind);
/** 좌우로 뒤집은 그림 */
export const mirrorCells = (g) => g.map((row) => [...row].reverse());

/** g를 to의 자리로 옮긴다(판 안에 들어가는 가장 가까운 자리). 둘 중 하나가 비었으면 그대로 */
export function alignCells(g, to, kind) {
  const a = cellsBox(g);
  const b = cellsBox(to);
  if (!a || !b) return g.map((row) => [...row]);
  const dc = clamp(b.c0 - a.c0, -a.c0, COLS - 1 - a.c1);
  const dr = kind === 'top' ? clamp(b.r0 - a.r0, -a.r0, ROWS - 1 - a.r1) : 0;
  return shiftCells(g, dc, dr);
}
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * 내 그림에서 목표와 다른 칸(목표를 내 그림의 자리로 옮겨 견준다): [{ r, c, state: 'extra'(더 칠함) | 'missing'(덜 칠함) }]
 * 내 그림이 비었으면 목표의 칸이 모두 missing(목표의 자리 그대로)
 */
export function viewDiff(mine, target, kind) {
  const t = alignCells(target, mine, kind);
  const out = [];
  mine.forEach((row, r) => row.forEach((v, c) => {
    if (v !== t[r][c]) out.push({ r, c, state: v ? 'extra' : 'missing' });
  }));
  return out;
}

/** 그 그림의 글 이름(화면 읽기): "앞에서 본 모양: 왼쪽부터 2층, 3층, 1층" · "위에서 본 모양: 쌓인 자리는 1줄 1칸, 1줄 2칸" */
export function describeView(g, kind) {
  if (kind === 'top') {
    const spots = cellsOfGrid(g).sort((p, q) => p[0] - q[0] || p[1] - q[1]).map(([y, x]) => spotName(x, y));
    return `${viewTitle(kind)}: ${spots.length ? `쌓인 자리는 ${spots.join(', ')}` : '쌓인 자리가 없어요'}`;
  }
  const heights = g[0].map((_, c) => g.reduce((top, row, z) => (row[c] ? z + 1 : top), 0));
  return `${viewTitle(kind)}: 왼쪽부터 ${heights.map((n) => (n ? `${n}층` : '빈 줄')).join(', ')}`;
}

// ── 3차시 ① 앞과 뒤, 오른쪽과 왼쪽 (blocks-flip) ──────
/** 반대쪽: 앞 → 뒤, 옆(오른쪽) → 왼쪽 */
export const FLIP_ASK = Object.freeze({ front: 'back', side: 'left' });
/** blocks-flip의 화면 이름: 이 단계에서는 "옆" 대신 "오른쪽"이라고 부른다(교과서 60쪽 — 다섯 방향을 먼저 본 뒤 "옆은 오른쪽"으로 약속한다) */
export const FLIP_NAMES = Object.freeze({ top: '위', front: '앞', side: '오른쪽', back: '뒤', left: '왼쪽' });
const isPalindrome = (v) => v.join() === flipLR(v).join();
/** 세로줄 높이의 줄 세움(같은 높이 묶음, 서로 다른 것만) */
export function arrangementsOf(v) {
  const out = new Map();
  const walk = (rest, prefix) => {
    if (rest.length === 0) {
      out.set(prefix.join(), prefix);
      return;
    }
    rest.forEach((n, i) => walk([...rest.slice(0, i), ...rest.slice(i + 1)], [...prefix, n]));
  };
  walk(v, []);
  return [...out.values()];
}
/** 주어진 그림의 꼴: pal(좌우가 같다 — 반대쪽에서 봐도 같다) · rep(같은 높이가 둘) · dist(높이가 모두 다르다) */
export function flipKindOf(v) {
  if (isPalindrome(v)) return 'pal';
  return new Set(v).size < v.length ? 'rep' : 'dist';
}
/**
 * 문항마다 [주어진 그림의 꼴, 보기 묶음]을 뽑는 주머니(24개). 보기 셋은 늘 주어진 그림과 같은 높이들을 줄 세운 것이라
 * 왼쪽·오른쪽 차례로만 갈린다(앞과 뒤가 좌우로 뒤집힌 사이인 것을 생각해야 고를 수 있다).
 *   pal(좌우가 같다 — 반대쪽에서 봐도 같다) 3: 정답 = 주어진 그림과 똑같은 보기 + 나머지 둘(늘 서로 좌우로 뒤집은 짝)
 *   rep(같은 높이가 둘) 2: 정답 + 주어진 그림 그대로(오개념) + 좌우가 같은 줄 세움 — 셋뿐이라 정해진다
 *   dist(높이가 모두 다르다) 19: 정답 + 다른 둘 — same 5(주어진 그림 그대로 + 다른 줄 세움) · pair 3(서로 뒤집은 짝) · apart 11(짝이 아닌 둘)
 * 이렇게 섞어야 그림을 견주지 않고 보기의 꼴만 보는 규칙(주어진 것과 같은 보기 피하기, 서로 뒤집힌 짝 고르기, 좌우가 같은 보기 고르기,
 * "좌우가 같은 보기, 없으면 짝" · "주어진 그림과 다르고 좌우가 같지 않은 보기" …)이 모두 찍기(1/3)에서 ±10%p 안이다 — 단위 검사가 시드 1,000개로 잰다.
 * (꼴만 보는 두 규칙은 pal·rep 문항에서 반드시 맞고 반드시 틀리는 짝이라, 주어진 그림 그대로가 없는 dist 문항(pair·apart)을 섞어 둘 다 낮춘다 — review-blocks-s2 S2-2)
 */
const FLIP_BAG = [
  ...Array(3).fill(['pal', 'pal']),
  ...Array(2).fill(['rep', 'same']),
  ...Array(5).fill(['dist', 'same']),
  ...Array(3).fill(['dist', 'pair']),
  ...Array(11).fill(['dist', 'apart']),
];
/** 조건에 맞는 모양이 뽑히지 않을 때의 모양(숨겨진 쌓기나무 없음) — [주어진 쪽][꼴] */
const FLIP_FALLBACKS = {
  front: { pal: [[1, 2, 1], [0, 0, 0], [0, 0, 0]], rep: [[1, 1, 2], [0, 0, 0], [0, 0, 0]], dist: [[1, 2, 3], [0, 0, 0], [0, 0, 0]] },
  side: { pal: [[1, 0, 0], [2, 0, 0], [1, 0, 0]], rep: [[1, 0, 0], [1, 0, 0], [2, 0, 0]], dist: [[1, 0, 0], [2, 0, 0], [3, 0, 0]] },
};

/**
 * 보기 셋: [{ heights(왼쪽부터 세로줄 높이), role: 'answer' | 'same'(주어진 그림 그대로) | 'other' }] (차례는 섞는다)
 * set: pal(좌우가 같은 그림) · same(정답 + 그대로 + 다른 줄 세움) · pair(정답 + 서로 뒤집은 짝) · apart(정답 + 짝이 아닌 다른 줄 세움 둘)
 */
function flipOptions(rng, view, set) {
  const answer = flipLR(view);
  const others = arrangementsOf(view).filter((a) => a.join() !== view.join() && a.join() !== answer.join());
  const other = (heights) => ({ heights, role: 'other' });
  let rest;
  if (isPalindrome(view)) rest = rng.shuffle(others).slice(0, 2).map(other);
  else if (set === 'same') rest = [{ heights: [...view], role: 'same' }, other(rng.pick(others))];
  else {
    const first = rng.pick(others);
    const mirror = flipLR(first).join();
    const second = set === 'pair' ? flipLR(first) : rng.pick(others.filter((a) => a.join() !== first.join() && a.join() !== mirror));
    rest = [other(first), other(second)];
  }
  return rng.shuffle([{ heights: answer, role: 'answer' }, ...rest]);
}

function makeFlipQuestions(stage, rng) {
  // 앞 → 뒤 · 옆 → 왼쪽이 한 판에 모두 나오게(셋째 문항은 둘 가운데 하나), 차례는 섞는다
  const givens = rng.shuffle(['front', 'side', rng.pick(['front', 'side'])]);
  const used = new Set();
  return givens.slice(0, stage.count).map((given, i) => {
    const [want, set] = rng.pick(FLIP_BAG);
    const target = drawShape(rng, {
      cells: [3, 6],
      counts: [4, 9],
      test: (h) => {
        if (used.has(mapKey(h)) || tallest(h) < 2 || hiddenCells(h).length > 0) return false;
        const v = viewHeights(h, given);
        // 세 세로줄이 모두 차 있고 높이가 한 가지가 아니다(높이가 모두 같으면 줄 세움이 하나뿐이라 보기를 만들 수 없다)
        return v.every((n) => n > 0) && new Set(v).size > 1 && flipKindOf(v) === want;
      },
      fallback: FLIP_FALLBACKS[given][want],
    });
    used.add(mapKey(target));
    const view = viewHeights(target, given);
    const options = flipOptions(rng, view, set);
    return {
      itemId: `${stage.id}:${i + 1}`,
      target,
      given,
      ask: FLIP_ASK[given],
      view,
      kind: want,
      set,
      options,
      expected: options.findIndex((o) => o.role === 'answer') + 1,
    };
  });
}

/** blocks-flip 채점: 고른 보기 번호(1부터) → { correct, tag, expected, message } */
export function judgeFlip(q, choice) {
  const option = q.options[choice - 1];
  const correct = option?.role === 'answer';
  const from = FLIP_NAMES[q.given];
  const to = FLIP_NAMES[q.ask];
  const rule = `${to}에서 보면 ${from}에서 본 모양이 좌우로 뒤집혀요.`;
  const same = q.kind === 'pal' ? ' 이 모양은 좌우로 뒤집어도 같아요.' : '';
  const promise = '앞과 옆만 알면 돼요. 옆은 오른쪽이에요.';
  if (correct) return { correct, tag: null, expected: q.expected, message: `맞아요! ${rule}${same} ${promise}` };
  const why = option?.role === 'same' ? `고른 그림은 ${from}에서 본 모양 그대로예요. ` : '';
  return { correct, tag: BLOCK_TAGS.mirror, expected: q.expected, message: `${why}${rule}${same} ${promise}` };
}

// ── 3차시 ② 위, 앞, 옆에서 본 모양 그리기 (blocks-draw) ─────
/** 그쪽에서 볼 때 세로줄마다 가장 가까운 쌓기나무가 그 세로줄의 가장 높은 층보다 낮은 곳이 있는가("가장 높은 층" 오개념을 만나는 모양) */
export function nearIsLower(h, kind) {
  const lines = kind === 'front'
    ? [0, 1, 2].map((x) => [0, 1, 2].map((y) => h[y][x])) // 앞에서: 세로줄 x, 가까운 것(앞줄)부터
    : [0, 1, 2].map((y) => [2, 1, 0].map((x) => h[y][x])); // 옆에서: 줄 y, 가까운 것(오른쪽)부터
  return lines.some((line) => {
    const near = line.find((v) => v > 0);
    return near !== undefined && near < Math.max(...line);
  });
}
/** 그 그림이 좌우로 뒤집어도 같은가(판 위 자리와 상관없이) */
export const symmetricView = (g, kind) => sameView(g, mirrorCells(g), kind);
/**
 * 앞(옆)에서 본 모양을 좌우로 뒤집은 것이 마침 옆(앞)에서 본 모양과 같은가 — 그러면 뒤집어 그린 그림이 "앞과 옆을 바꿔 그린 것"으로 채점되어
 * 좌우가 뒤집힌 까닭을 만날 수 없다. 그리는 문항은 이런 모양을 내지 않는다 (review-blocks-s2 S2-4)
 */
export const mirrorIsOther = (h, kind) => sameView(mirrorCells(viewCells(h, kind)), viewCells(h, kind === 'front' ? 'side' : 'front'), 'front');
/** 그리는 문항: 앞 1 · 옆 1 · 위·앞·옆 모두 1 */
const DRAW_PLAN = [['front'], ['side'], ['top', 'front', 'side']];
const DRAW_FALLBACKS = [[[1, 1, 0], [1, 2, 3], [0, 0, 0]], [[2, 1, 0], [3, 0, 0], [1, 0, 0]], [[1, 1, 1], [2, 0, 0], [0, 0, 0]]];

/** 그 모양을 그리는 문항으로 쓸 수 있는가: 숨겨진 쌓기나무가 없고(그림만 보고 그릴 수 있다), 앞과 옆의 그림이 다르다 */
function drawable(h, kinds) {
  if (tallest(h) < 2 || hiddenCells(h).length > 0) return false;
  const front = viewCells(h, 'front');
  const side = viewCells(h, 'side');
  if (sameView(front, side, 'front')) return false; // 앞과 옆을 바꿔 그려도 맞으면 그 오개념을 만날 수 없다
  if (kinds.length === 1) {
    const [kind] = kinds;
    // 좌우로 뒤집어 그린 것이 틀린 답(까닭: 좌우 뒤집힘)이 되고, 가까운 쌓기나무보다 뒤의 쌓기나무가 높은 세로줄이 있다
    return !symmetricView(kind === 'front' ? front : side, kind) && !mirrorIsOther(h, kind) && nearIsLower(h, kind);
  }
  return !symmetricView(viewCells(h, 'top'), 'top');
}

function makeDrawQuestions(stage, rng) {
  const used = new Set();
  return DRAW_PLAN.slice(0, stage.count).map((kinds, i) => {
    const target = drawShape(rng, {
      cells: [3, 6],
      counts: [5, 9],
      test: (h) => !used.has(mapKey(h)) && drawable(h, kinds),
      fallback: DRAW_FALLBACKS[i],
    });
    used.add(mapKey(target));
    const views = Object.fromEntries(['top', 'front', 'side'].map((kind) => [kind, viewCells(target, kind)]));
    return { itemId: `${stage.id}:${i + 1}`, target, kinds, total: count(target), views, expected: kinds.map((k) => viewKey(views[k], k)).join('|') };
  });
}

/**
 * "가장 높은 층" 까닭(입체 그림을 보고 그린 앞·옆): 덜 칠했으면(under — 가까운 쌓기나무만 그림) 뒤의 높은 쌓기나무도 보인다고,
 * 더 칠했으면(over) 가장 높은 층까지만 칠한다고, 둘 다면(mixed) 규칙만 (review-blocks-s2 S2-5)
 */
const TALLEST_NOTE = {
  front: {
    under: '앞에서 보면 세로줄마다 가장 높은 층까지 보여요. 뒤에 있는 높은 쌓기나무도 보여요.',
    over: '앞에서 본 모양은 세로줄마다 가장 높은 층까지만 칠해요.',
    mixed: '앞에서 보면 세로줄마다 가장 높은 층까지 보여요.',
  },
  side: {
    under: '옆에서 보면 세로줄마다 가장 높은 층까지 보여요. 안쪽에 있는 높은 쌓기나무도 보여요.',
    over: '옆에서 본 모양은 세로줄마다 가장 높은 층까지만 칠해요.',
    mixed: '옆에서 보면 세로줄마다 가장 높은 층까지 보여요.',
  },
};
/** 다른 칸들이 덜 칠한 것뿐인가(under), 더 칠한 것뿐인가(over), 섞였나(mixed) */
const moreOf = (diff) => {
  const extra = diff.some((d) => d.state === 'extra');
  const missing = diff.some((d) => d.state === 'missing');
  return extra && !missing ? 'over' : missing && !extra ? 'under' : 'mixed';
};

/** 그린 그림 하나가 틀린 까닭 (from: 'picture' 입체 그림을 보고 · 'numbers' 수를 쓴 그림을 보고 · more: 덜/더 칠함) */
const VIEW_NOTES = {
  top: {
    [BLOCK_TAGS.floor]: () => '위에서 본 모양은 바닥에 닿은 면의 모양이에요. 쌓인 자리를 모두 칠해요.',
    [BLOCK_TAGS.mirror]: () => '위에서 본 모양의 왼쪽과 오른쪽이 뒤집혔어요.',
  },
  front: {
    [BLOCK_TAGS.frontSide]: (from) => (from === 'numbers' ? '그린 것은 옆에서 본 모양이에요. 수를 쓴 그림의 아래쪽이 앞이에요.' : '그린 것은 옆에서 본 모양이에요. 판의 "앞" 글자 쪽에서 봐야 해요.'),
    [BLOCK_TAGS.mirror]: () => '왼쪽과 오른쪽이 뒤집혔어요. 앞에서 볼 때 왼쪽에 있는 세로줄부터 그려요.',
    [BLOCK_TAGS.tallest]: (from, more) => (from === 'numbers'
      ? `앞에서 보면 세로줄마다 가장 큰 수만큼${more === 'over' ? '만' : ''} 보여요.`
      : TALLEST_NOTE.front[more]),
  },
  side: {
    [BLOCK_TAGS.frontSide]: (from) => (from === 'numbers' ? '그린 것은 앞에서 본 모양이에요. 옆은 오른쪽이에요. 수를 쓴 그림의 오른쪽에서 봐요.' : '그린 것은 앞에서 본 모양이에요. 옆은 오른쪽이에요. 판의 "옆" 글자 쪽에서 봐야 해요.'),
    [BLOCK_TAGS.mirror]: () => '왼쪽과 오른쪽이 뒤집혔어요. 옆(오른쪽)에서 보면 앞줄이 왼쪽에 보여요.',
    [BLOCK_TAGS.tallest]: (from, more) => (from === 'numbers'
      ? `옆에서 보면 줄마다 가장 큰 수만큼${more === 'over' ? '만' : ''} 보여요. 앞줄이 왼쪽이에요.`
      : TALLEST_NOTE.side[more]),
  },
};

/**
 * 그린 그림 하나 채점: mine = 내가 칠한 칸 → { correct, empty, tag, diff(viewDiff), note }
 * q.views에 목표 그림(위·앞·옆)이 있다
 */
export function judgeView(q, kind, mine, { from = 'picture' } = {}) {
  const target = q.views[kind];
  if (!mine || blankCells(mine)) return { correct: false, empty: true, tag: null, diff: [], note: `${viewTitle(kind)}을 먼저 칠해요.` };
  if (sameView(mine, target, kind)) return { correct: true, tag: null, diff: [], note: '' };
  let tag;
  if (kind === 'top') tag = sameView(mine, mirrorCells(target), kind) ? BLOCK_TAGS.mirror : BLOCK_TAGS.floor;
  else {
    const other = q.views[kind === 'front' ? 'side' : 'front'];
    if (other && !sameView(other, target, kind) && sameView(mine, other, kind)) tag = BLOCK_TAGS.frontSide;
    else if (!symmetricView(target, kind) && sameView(mine, mirrorCells(target), kind)) tag = BLOCK_TAGS.mirror;
    else tag = BLOCK_TAGS.tallest;
  }
  const diff = viewDiff(mine, target, kind);
  return { correct: false, tag, diff, note: VIEW_NOTES[kind][tag](from, moreOf(diff)) };
}

/**
 * 그리는 문항 채점(blocks-draw · blocks-numviews의 칠하기): drawings = { top?, front?, side? } (q.kinds의 것)
 * → { correct, empty, tag, diff: { [kind]: viewDiff }, wrongKinds, expected, message }
 * tag는 앞·옆을 서로 바꿔 그렸으면 "앞과 옆", 아니면 먼저 어긋난 그림(위 → 앞 → 옆)의 것
 */
export function judgeDrawing(q, drawings, { from = 'picture' } = {}) {
  const parts = q.kinds.map((kind) => ({ kind, ...judgeView(q, kind, drawings[kind], { from }) }));
  const empty = parts.find((p) => p.empty);
  if (empty) return { correct: false, empty: true, tag: null, diff: {}, wrongKinds: [], expected: q.expected, message: empty.note };
  const wrong = parts.filter((p) => !p.correct);
  const diff = Object.fromEntries(parts.map((p) => [p.kind, p.diff]));
  if (wrong.length === 0) {
    const message = q.kinds.length > 1
      ? '맞아요! 위, 앞, 옆에서 본 모양을 모두 바르게 그렸어요.'
      : `맞아요! ${VIEW_DONE[q.kinds[0]](from)}`;
    return { correct: true, tag: null, diff, wrongKinds: [], expected: q.expected, message };
  }
  const lead = wrong.find((p) => p.tag === BLOCK_TAGS.frontSide) ?? wrong[0];
  // 그림이 여럿이면 어느 그림이 다른지부터(한 장이면 그 그림의 ✗가 알려 준다)
  const where = q.kinds.length > 1 ? `${wrong.map((p) => VIEW_NAMES[p.kind]).join(', ')}에서 본 모양에 다른 칸이 있어요. ` : '';
  return { correct: false, tag: lead.tag, diff, wrongKinds: wrong.map((p) => p.kind), expected: q.expected, message: `${where}${lead.note}` };
}
/**
 * 그리는 문항의 힌트(같은 문항을 두 번 틀린 뒤): 처음으로 다른 그림의 한 곳을 말로.
 * 앞·옆은 왼쪽부터 처음으로 다른 세로줄의 높이, 위는 쌓인 자리의 수(자리 하나를 알려 주면 위에서 본 모양 전체가 거의 드러나 수만 알려 준다)
 */
export function drawHint(q, drawings, { from = 'picture' } = {}) {
  for (const kind of q.kinds) {
    const mine = drawings[kind];
    const target = q.views[kind];
    if (mine && sameView(mine, target, kind)) continue;
    if (kind === 'top') return `위에서 본 모양에는 쌓인 자리가 ${count(target)}곳이에요.`;
    // 세로줄마다 높이: 목표는 판 위 자리 그대로, 내 그림은 목표의 자리로 옮겨서
    const heightsOf = (g) => g[0].map((_, c) => g.reduce((top, row, z) => (row[c] ? z + 1 : top), 0));
    const want = heightsOf(target);
    const have = heightsOf(mine ? alignCells(mine, target, kind) : target.map((row) => row.map(() => 0)));
    const c = want.findIndex((v, i) => v !== have[i]);
    const col = c < 0 ? want.findIndex((v) => v > 0) : c;
    if (from === 'numbers') {
      const where = kind === 'front' ? `왼쪽부터 ${col + 1}번째 세로줄` : `${col + 1}줄(앞줄부터)`;
      return `수를 쓴 그림에서 ${where}의 가장 큰 수는 ${josa(want[col], '이에요/예요')}. ${viewTitle(kind)}에서는 그만큼 보여요.`;
    }
    const first = want.findIndex((v) => v > 0);
    return `${viewTitle(kind)}에서 왼쪽 끝부터 ${col - first + 1}번째 세로줄은 ${want[col]}층까지 보여요.`;
  }
  return '위, 앞, 옆에서 본 모양을 다시 살펴봐요.';
}

const VIEW_DONE = {
  top: () => '위에서 본 모양은 바닥에 닿은 면의 모양이에요.',
  front: (from) => (from === 'numbers' ? '앞에서 보면 세로줄마다 가장 큰 수만큼 보여요.' : '앞에서 보면 세로줄마다 가장 높은 층까지 보여요.'),
  side: (from) => (from === 'numbers' ? '옆에서 보면 줄마다 가장 큰 수만큼 보이고, 앞줄이 왼쪽이에요.' : '옆(오른쪽)에서 보면 앞줄이 왼쪽에 보여요.'),
};

// ── 3차시 ③ 위, 앞, 옆을 보고 쌓기 (blocks-build) ──────
/** 세 그림(위 = 칸, 앞·옆 = 세로줄 높이) */
export const threeViews = (h) => ({ top: topView(h), front: frontView(h), side: sideView(h) });
/** 세 그림에 맞는가(판 위에서 통째로 옮긴 것은 같다고 본다) */
export const fitsThree = (q, mine) => count(mine) > 0 && fitsViews(toCorner(mine), threeViews(toCorner(q.target)));

/** 2문항은 세 그림으로 쌓기가 하나로 정해지는 모양, 1문항은 여러 가지(개수도 여러 가지 — 2~3가지)인 모양. 차례는 섞는다 */
const VIEW_BUILD_FALLBACKS = {
  one: [[[2, 1, 0], [1, 0, 0], [3, 0, 0]], [[1, 2, 1], [0, 1, 0], [0, 1, 0]]],
  many: [[2, 2, 0], [2, 1, 0], [0, 0, 0]],
};
function makeViewBuildQuestions(stage, rng) {
  const used = new Set();
  const kinds = rng.shuffle([false, false, true]);
  let one = 0;
  return kinds.slice(0, stage.count).map((many, i) => {
    const target = drawShape(rng, {
      cells: [3, 6],
      counts: [5, 10],
      test: (h) => {
        if (used.has(mapKey(toCorner(h))) || tallest(h) < 2) return false;
        const fills = fillsOf(threeViews(h));
        if (!many) return fills.length === 1;
        const counts = new Set(fills.map(count));
        return fills.length >= 2 && fills.length <= 4 && counts.size <= 3;
      },
      fallback: many ? VIEW_BUILD_FALLBACKS.many : VIEW_BUILD_FALLBACKS.one[(one += 1) % 2],
    });
    used.add(mapKey(toCorner(target)));
    const fills = fillsOf(threeViews(target));
    return {
      itemId: `${stage.id}:${i + 1}`,
      target,
      views: threeViews(target),
      many,
      fills,
      counts: [...new Set(fills.map(count))].sort((a, b) => a - b),
      expected: many ? 'yes' : 'no',
    };
  });
}

const THREE_NOTES = {
  [BLOCK_TAGS.mirror]: '왼쪽과 오른쪽이 뒤집혔어요. 앞에서 본 모양과 견줘 봐요.',
  [BLOCK_TAGS.frontSide]: '앞과 옆이 서로 바뀌었어요. 판의 "앞" 글자 쪽에서 본 모양이 앞에서 본 모양이에요.',
  [BLOCK_TAGS.floor]: '위에서 본 모양이 달라요. 위에서 본 모양은 바닥에 닿은 면의 모양이에요.',
  [BLOCK_TAGS.tallest]: '위에서 본 모양은 맞아요. 앞이나 옆에서 볼 때 세로줄마다 가장 높은 층을 맞춰 봐요.',
};

/**
 * 내 쌓기의 세 그림 가운데 주어진 그림과 다른 칸(주어진 그림의 자리로): { top: viewDiff, front, side }
 * — [확인하기] 뒤에 주어진 그림에 ✗를 그린다
 */
export function threeDiff(q, mine) {
  const out = {};
  for (const kind of ['top', 'front', 'side']) {
    const given = viewCells(q.target, kind);
    const me = alignCells(viewCells(mine, kind), given, kind);
    out[kind] = viewDiff(given, me, kind).map((d) => ({ ...d, state: d.state === 'extra' ? 'missing' : 'extra' }));
  }
  return out;
}

/** blocks-build ①: 세 그림에 맞게 쌓았는가 → { correct, empty, tag, diff, message } */
export function judgeThree(q, mine) {
  if (count(mine) === 0) return { correct: false, empty: true, tag: null, diff: null, message: '쌓기나무를 먼저 쌓아요.' };
  if (fitsThree(q, mine)) return { correct: true, tag: null, diff: null, message: `맞아요! 위, 앞, 옆에서 본 모양이 모두 같아요. 쌓기나무 ${countWord(count(mine))}로 만들었어요.` };
  const corner = toCorner(mine);
  const like = (g) => fitsViews(corner, threeViews(toCorner(g))) && !fitsViews(toCorner(q.target), threeViews(toCorner(g)));
  let tag;
  if (like(mirrorMap(q.target))) tag = BLOCK_TAGS.mirror;
  else if (like(swapMap(q.target))) tag = BLOCK_TAGS.frontSide;
  else tag = sameMap(toCorner(topView(mine)), toCorner(topView(q.target))) ? BLOCK_TAGS.tallest : BLOCK_TAGS.floor;
  return { correct: false, tag, diff: threeDiff(q, mine), message: `세 그림과 견줘 보면 달라요. ${THREE_NOTES[tag]}` };
}

/** blocks-build ②: "다른 개수로도 만들 수 있을까요?" 예상 */
export function judgeThreeGuess(q, answer) {
  const correct = answer === q.expected;
  const tag = correct ? null : BLOCK_TAGS.manyCounts;
  if (q.many) {
    return {
      correct,
      tag,
      expected: q.expected,
      message: `${correct ? '맞아요! ' : '만들 수 있어요. '}위, 앞, 옆에서 본 모양이 같아도 쌓기나무의 개수가 다른 쌓기가 있어요.`,
    };
  }
  return {
    correct,
    tag,
    expected: q.expected,
    message: `${correct ? '맞아요! ' : '이 모양은 다른 개수로는 만들 수 없어요. '}세 그림에 맞게 쌓는 방법이 하나뿐이라 개수도 하나로 정해져요.`,
  };
}

/**
 * blocks-build ③: 다른 개수로 한 번 더 쌓기. first = 처음에 맞힌 내 쌓기
 * → { status: 'ok' | 'same'(이미 한 쌓기) | 'sameCount'(세 그림에는 맞지만 개수가 같다) | 'wrong', … } — same·sameCount는 기록하지 않는다
 */
export function judgeThreeOther(q, mine, first) {
  if (sameMap(toCorner(mine), toCorner(first))) return { status: 'same', correct: false, tag: null, message: '이미 한 쌓기예요. 쌓기나무의 개수를 바꿔 봐요.' };
  const built = judgeThree(q, mine);
  if (!built.correct) return { status: built.empty ? 'empty' : 'wrong', ...built };
  if (count(mine) === count(first)) return { status: 'sameCount', correct: false, tag: null, message: `세 그림에는 맞지만 개수가 ${josa(countWord(count(mine)), '으로/로')} 같아요. 쌓기나무의 개수를 바꿔 봐요.` };
  return {
    status: 'ok',
    correct: true,
    tag: null,
    message: `맞아요! 쌓기나무 ${countWord(count(first))}로 만든 것도, ${countWord(count(mine))}로 만든 것도 위, 앞, 옆에서 본 모양이 같아요.`,
  };
}

/** 쌓인 자리가 판의 왼쪽 앞 구석에서 얼마나 떨어져 있는가 [칸, 줄] */
export function offsetOf(h) {
  let offX = COLS;
  let offY = ROWS;
  h.forEach((row, y) => row.forEach((v, x) => {
    if (v > 0) {
      offX = Math.min(offX, x);
      offY = Math.min(offY, y);
    }
  }));
  return offX === COLS ? [0, 0] : [offX, offY];
}
/** 내 쌓기를 목표의 자리로 옮긴 높이 지도(판 밖으로 나가는 것은 버린다) */
export function alignMap(mine, target) {
  const [mx, my] = offsetOf(mine);
  const [tx, ty] = offsetOf(target);
  const out = emptyMap();
  mine.forEach((row, y) => row.forEach((v, x) => {
    const nx = x - mx + tx;
    const ny = y - my + ty;
    if (v > 0 && out[ny]?.[nx] !== undefined) out[ny][nx] = v;
  }));
  return out;
}

/**
 * blocks-build의 힌트(같은 문항을 두 번 틀린 뒤): 주어진 위에서 본 모양의 자리 하나와 그 높이.
 * 세 그림에 맞는 쌓기가 여럿이면 모든 쌓기에서 높이가 같은 자리만 알려 준다 → { x, y, value, text }
 */
export function threeHint(q, mine) {
  const me = alignMap(mine, q.target);
  const spots = [];
  for (let y = 0; y < ROWS; y += 1) for (let x = 0; x < COLS; x += 1) if (q.views.top[y][x] && q.fills.every((g) => g[y][x] === q.fills[0][y][x])) spots.push([x, y]);
  const [x, y] = spots.find(([sx, sy]) => me[sy][sx] !== q.fills[0][sy][sx]) ?? spots[0];
  const value = q.fills[0][y][x];
  return { x, y, value, text: `위에서 본 모양에서 ${spotName(x, y)} 자리는 ${value}층이에요.` };
}

// ── 4차시 ① 자리마다 몇 개? (blocks-write) ──────────
const WRITE_FALLBACKS = [[[2, 1, 0], [1, 3, 0], [0, 1, 0]], [[1, 1, 0], [2, 3, 0], [0, 2, 0]], [[1, 2, 1], [0, 3, 0], [0, 2, 0]]];
function makeWriteQuestions(stage, rng) {
  const used = new Set();
  // 1번은 처음 보기에서 모든 쌓기나무가 보이는 모양, 2·3번은 숨겨진 쌓기나무가 있는 모양(돌려 봐야 셀 수 있다)
  return Array.from({ length: stage.count }, (_, i) => {
    const target = drawShape(rng, {
      cells: [4, 6],
      counts: [6, 10],
      test: (h) => !used.has(mapKey(h)) && tallest(h) >= (i === 0 ? 2 : 3) && (hiddenCells(h).length > 0) === (i > 0),
      fallback: WRITE_FALLBACKS[i % WRITE_FALLBACKS.length],
    });
    used.add(mapKey(target));
    return { itemId: `${stage.id}:${i + 1}`, target, top: topView(target), total: count(target), expected: mapKey(target) };
  });
}

/** 자리마다 쓴 수를 더하는 문장: "1 + 3 + 2 + 3 = 9, 모두 9개예요." (앞줄부터, 왼쪽부터) */
export function sumSentence(h) {
  const parts = [];
  for (let y = 0; y < ROWS; y += 1) for (let x = 0; x < COLS; x += 1) if (h[y][x] > 0) parts.push(h[y][x]);
  return `${parts.join(' + ')} = ${count(h)}, 모두 ${count(h)}개예요.`;
}

/**
 * blocks-write 채점: numbers[줄][칸] = 쓴 수(안 쓴 자리는 0) → { correct, empty, tag, wrong: [[x, y]], expected, message }
 * 쌓인 자리(위에서 본 모양)에만 쓴다
 */
export function judgeNumbers(q, numbers) {
  const spots = [];
  q.top.forEach((row, y) => row.forEach((on, x) => {
    if (on) spots.push([x, y]);
  }));
  if (spots.some(([x, y]) => !(numbers[y]?.[x] > 0))) return { correct: false, empty: true, tag: null, wrong: [], expected: q.expected, message: '모든 자리에 수를 써요.' };
  const wrong = spots.filter(([x, y]) => numbers[y][x] !== q.target[y][x]);
  if (wrong.length === 0) return { correct: true, tag: null, wrong, expected: q.expected, message: `맞아요! ${sumSentence(q.target)}` };
  const fewer = wrong.every(([x, y]) => numbers[y][x] < q.target[y][x]);
  const more = wrong.every(([x, y]) => numbers[y][x] > q.target[y][x]);
  const tip = fewer ? ' 가려진 쌓기나무도 돌려 보며 세어요.' : more ? ' 그 자리에 쌓인 것만 세어요.' : '';
  return {
    correct: false,
    tag: BLOCK_TAGS.numberMeaning,
    wrong,
    expected: q.expected,
    message: `✗ 표시한 자리의 수가 달라요. 이 수는 그 자리에 쌓인 쌓기나무의 개수예요.${tip}`,
  };
}

// ── 4차시 ② 수를 보고 쌓기 (blocks-fromnum) ─────────
const FROMNUM_FALLBACKS = [[[2, 1, 0], [1, 0, 0], [3, 0, 0]], [[1, 3, 2], [0, 2, 1], [0, 1, 0]]];
function makeFromNumQuestions(stage, rng) {
  const used = new Set();
  const plan = [{ cells: [3, 5], counts: [5, 8], top: 2 }, { cells: [4, 6], counts: [7, 11], top: 3 }];
  return plan.slice(0, stage.count).map((p, i) => {
    const target = drawShape(rng, {
      cells: p.cells,
      counts: p.counts,
      test: (h) => !used.has(mapKey(toCorner(h))) && tallest(h) >= p.top && !sameMap(toCorner(h), toCorner(mirrorMap(h))) && !sameMap(toCorner(h), toCorner(swapMap(h))),
      fallback: FROMNUM_FALLBACKS[i],
    });
    used.add(mapKey(toCorner(target)));
    return { itemId: `${stage.id}:${i + 1}`, target, total: count(target), expected: mapKey(target) };
  });
}

const NUMBER_BUILD_NOTES = {
  [BLOCK_TAGS.mirror]: '왼쪽과 오른쪽이 뒤집혔어요. 수를 쓴 그림의 아래쪽이 판의 앞이에요.',
  [BLOCK_TAGS.frontSide]: '앞과 옆이 서로 바뀌었어요. 수를 쓴 그림의 아래쪽이 앞, 오른쪽이 옆이에요.',
  [BLOCK_TAGS.floor]: '쌓은 자리가 달라요. 수가 쓰인 자리에만 쌓아요.',
  [BLOCK_TAGS.numberMeaning]: '✗ 표시한 자리의 높이가 달라요. 수는 그 자리에 쌓인 쌓기나무의 개수예요.',
};

/** 내 쌓기와 목표가 다른 자리(목표의 자리로 옮겨 견줌): [[x, y]] */
export function mapDiff(mine, target) {
  const me = alignMap(mine, target);
  const out = [];
  target.forEach((row, y) => row.forEach((v, x) => {
    if (v !== me[y][x]) out.push([x, y]);
  }));
  return out;
}

/** blocks-fromnum 채점: 수만큼 쌓았는가(판 위에서 통째로 옮긴 것은 같다고 본다) → { correct, empty, tag, wrong, expected, message } */
export function judgeNumberBuild(q, mine) {
  if (count(mine) === 0) return { correct: false, empty: true, tag: null, wrong: [], expected: q.expected, message: '쌓기나무를 먼저 쌓아요.' };
  const corner = toCorner(mine);
  if (sameMap(corner, toCorner(q.target))) return { correct: true, tag: null, wrong: [], expected: q.expected, message: `맞아요! 자리마다 쓴 수만큼 쌓았어요. ${sumSentence(q.target)}` };
  let tag;
  if (sameMap(corner, toCorner(mirrorMap(q.target)))) tag = BLOCK_TAGS.mirror;
  else if (sameMap(corner, toCorner(swapMap(q.target)))) tag = BLOCK_TAGS.frontSide;
  else tag = sameMap(toCorner(topView(mine)), toCorner(topView(q.target))) ? BLOCK_TAGS.numberMeaning : BLOCK_TAGS.floor;
  return { correct: false, tag, wrong: mapDiff(mine, q.target), expected: q.expected, message: `수를 쓴 그림과 견줘 보면 달라요. ${NUMBER_BUILD_NOTES[tag]}` };
}

/** blocks-fromnum의 힌트: 내 쌓기와 다른 첫 자리 → { x, y, value, text } */
export function numberBuildHint(q, mine) {
  const me = alignMap(mine, q.target);
  const spots = [];
  for (let y = 0; y < ROWS; y += 1) for (let x = 0; x < COLS; x += 1) if (q.target[y][x] > 0) spots.push([x, y]);
  const [x, y] = spots.find(([sx, sy]) => me[sy][sx] !== q.target[sy][sx]) ?? spots[0];
  const value = q.target[y][x];
  return { x, y, value, text: `${spotName(x, y)} 자리의 수는 ${josa(value, '이에요/예요')}. 그 자리에 쌓기나무를 ${countWord(value)} 쌓아요.` };
}

// ── 4차시 ③ 수만 보고 알아내기 (blocks-numviews) ─────
/**
 * 그림에서 좌우를 뒤집은 쌓기: 판을 대각선(앞 왼쪽 ↔ 뒤 오른쪽 방향)으로 뒤집는다 — 교과서 방향의 그림이 좌우로 거울처럼 바뀐다.
 * 수를 쓴 그림에서는 앞줄과 오른쪽 세로줄이 서로 바뀐다(앞과 옆을 바꿔 읽은 모양). h'[y][x] = h[2 − x][2 − y]
 */
export const turnMap = (h) => h.map((row, y) => row.map((_, x) => h[COLS - 1 - x][ROWS - 1 - y]));

/**
 * 고르기 문항의 보기 넷: 정답 T, T를 그림에서 좌우로 뒤집은 것, T의 한 자리를 하나 더하거나 뺀 것 D, D를 뒤집은 것.
 * 넷이 "뒤집힌 짝" 둘로 나뉘어 보기의 꼴만으로는 정답을 가릴 수 없다(짝 안의 둘은 개수가 같고, 짝끼리는 개수가 하나 다르며 어느 쪽이 많은지는 반반).
 * 넷 모두 그림이 서로 달라야 한다(lookKey) — 숨은 자리만 바꾼 D는 그림이 같아 쓰지 않는다.
 */
function numPickOptions(rng, target) {
  const turned = turnMap(target);
  const changes = [];
  target.forEach((row, y) => row.forEach((v, x) => {
    if (v > 0 && v < MAX_H) changes.push([x, y, 1]);
    if (v > 1) changes.push([x, y, -1]);
  }));
  for (const [x, y, d] of rng.shuffle(changes)) {
    const other = cloneMap(target);
    other[y][x] += d;
    const set = [target, turned, other, turnMap(other)];
    if (new Set(set.map(lookKey)).size === 4) {
      return rng.shuffle([
        { map: target, role: 'answer' },
        { map: turned, role: 'turn' },
        { map: other, role: 'other', spot: [x, y], delta: d },
        { map: turnMap(other), role: 'turn-other', spot: [x, y], delta: d },
      ]);
    }
  }
  return null;
}

const NUMVIEW_FALLBACKS = [[[1, 1, 0], [1, 2, 3], [0, 0, 0]], [[2, 1, 0], [3, 0, 0], [1, 0, 0]], [[2, 1, 0], [1, 3, 0], [0, 1, 0]]];
function makeNumViewQuestions(stage, rng) {
  const used = new Set();
  const plan = ['front', 'side', 'pick'];
  return plan.slice(0, stage.count).map((kind, i) => {
    let options = null;
    const target = drawShape(rng, {
      cells: [3, 6],
      counts: [5, 10],
      test: (h) => {
        if (used.has(mapKey(h)) || tallest(h) < 2) return false;
        if (kind === 'pick') return !sameMap(toCorner(h), toCorner(turnMap(h))) && lookKey(h) !== lookKey(turnMap(h));
        const front = viewCells(h, 'front');
        const side = viewCells(h, 'side');
        return !sameView(front, side, 'front') && !symmetricView(kind === 'front' ? front : side, kind) && !mirrorIsOther(h, kind) && nearIsLower(h, kind);
      },
      fallback: NUMVIEW_FALLBACKS[i],
    });
    used.add(mapKey(target));
    const base = { itemId: `${stage.id}:${i + 1}`, target, total: count(target) };
    if (kind !== 'pick') {
      const views = Object.fromEntries(['top', 'front', 'side'].map((k) => [k, viewCells(target, k)]));
      return { ...base, kind: 'paint', kinds: [kind], views, expected: viewKey(views[kind], kind) };
    }
    options = numPickOptions(rng, target);
    return { ...base, kind: 'pick', options, expected: options.findIndex((o) => o.role === 'answer') + 1 };
  });
}

/** blocks-numviews 고르기 채점: 고른 보기 번호(1부터) → { correct, tag, expected, message } */
export function judgeNumPick(q, choice) {
  const option = q.options[choice - 1];
  const correct = option?.role === 'answer';
  if (correct) return { correct, tag: null, expected: q.expected, message: `맞아요! 자리마다 쓴 수만큼 쌓아 만든 모양이에요. ${sumSentence(q.target)}` };
  if (option?.role === 'other') {
    const [x, y] = option.spot;
    return {
      correct,
      tag: BLOCK_TAGS.numberMeaning,
      expected: q.expected,
      message: `고른 그림은 ${spotName(x, y)} 자리에 쌓기나무가 ${countWord(q.target[y][x] + option.delta)}예요. 수를 쓴 그림에는 ${josa(q.target[y][x], '이라고/라고')} 쓰여 있어요.`,
    };
  }
  // 앞과 옆이 바뀐 것(turn) · 앞과 옆이 바뀌고 한 자리의 수도 다른 것(turn-other — 그 자리를 말한다)
  const also = option?.role === 'turn-other' ? `바뀌었고, ${spotName(option.spot[0], option.spot[1])} 자리의 수도 달라요.` : '바뀐 모양이에요.';
  return {
    correct,
    tag: BLOCK_TAGS.frontSide,
    expected: q.expected,
    message: `고른 그림은 앞과 옆이 ${also} 수를 쓴 그림의 아래쪽이 앞, 오른쪽이 옆이에요.`,
  };
}

// ── 쌓기 놀이터 ──────────────────────────
function makePlayQuestions(stage, rng) {
  return [{ itemId: `${stage.id}:1`, spot: [rng.int(0, COLS - 1), rng.int(0, ROWS - 1)], height: 2 }];
}

const MAKERS = {
  play: makePlayQuestions,
  where: makeWhereQuestions,
  scene: makeSceneQuestions,
  copy: makeCopyQuestions,
  count: makeCountQuestions,
  hidden: makeHiddenQuestions,
  flip: makeFlipQuestions,
  draw: makeDrawQuestions,
  build: makeViewBuildQuestions,
  write: makeWriteQuestions,
  fromnum: makeFromNumQuestions,
  numviews: makeNumViewQuestions,
};

/** 단계의 문항 목록. playStage에서 ctx.rng로 가장 먼저 부른다(같은 시드 = 같은 문항) */
export function makeBlockQuestions(stage, rng) {
  const make = MAKERS[stage.kind];
  if (!make) throw new Error(`알 수 없는 쌓기나무 단계 종류: ${stage.kind}`);
  return make(stage, rng);
}
