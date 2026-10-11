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
  cloneMap,
  count,
  emptyMap,
  flipLR,
  hiddenAdds,
  hiddenCells,
  layerOf,
  lookAlikes,
  mapKey,
  pictureKey,
  sameLook,
  sameMap,
  sceneFrom,
  sceneKey,
  toCorner,
  topView,
} from './blocks.js';

/** 차시 묶음 (교과서 6-2 3단원의 차시와 하나씩 짝 — S1은 1·2차시) */
export const BLOCK_LESSONS = [
  { id: 'blocks-look', title: '어느 방향에서 보았을까' },
  { id: 'blocks-top', title: '만든 모양과 위에서 본 모양' },
];

/**
 * kind: play(쌓기 놀이터 — 채점 없음) · where(어느 쪽에서 본 모습인지 고르기) · scene(그쪽에서 본 모습 고르기)
 *       · copy(그림을 보고 똑같이 쌓기) · count(개수 고르기) · hidden(쌓기 → 다른 개수로도? → 한 번 더 쌓기)
 * area: 'blocks' — main.js가 이 표시로 쌓기나무 화면(blocks/index.js)에 넘긴다
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
    id: 'blocks-scene', lesson: 'blocks-look', area: 'blocks', kind: 'scene', count: 3, order: '관찰 주문',
    title: '이쪽에서 보면?',
    goal: '위에서 본 그림을 보고, 화살표 쪽에서 본 모습을 골라요.',
  },
  {
    id: 'blocks-copy', lesson: 'blocks-top', area: 'blocks', kind: 'copy', count: 2, order: '따라 쌓기 주문',
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
  { id: 'blue', name: '파란 기둥', height: 2, face: 2, mark: 'stripe' },
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

/** 그 모습을 말로: "왼쪽에 파란 기둥, 오른쪽에 노란 탑이 보여요." (가려진 것은 "분홍 상자는 가려서 안 보여요.") */
export function describeScene(scene) {
  const seen = seenIn(scene);
  const shown = seen.map((s) => `${COLUMN_WORDS[s.column]}에 ${sculptureOf(s.id).name}`).join(', ');
  const hidden = SCULPTURES.filter((s) => !seen.some((x) => x.id === s.id)).map((s) => s.name);
  const last = sculptureOf(seen[seen.length - 1].id).name;
  return `${shown}${josa(last, '이/가').slice(last.length)} 보여요.${hidden.length ? ` ${hidden.map((n) => josa(n, '은/는')).join(', ')} 가려서 안 보여요.` : ''}`;
}

const columnOf = (scene, id) => {
  const seen = seenIn(scene).find((s) => s.id === id);
  return seen ? COLUMN_WORDS[seen.column] : null;
};

/** 그 모습에서 가려서 안 보이는 조형물: " 분홍 상자는 가려서 안 보여요." (없으면 빈 글) */
function hiddenNote(scene) {
  const hidden = SCULPTURES.filter((s) => !columnOf(scene, s.id)).map((s) => josa(s.name, '은/는'));
  return hidden.length ? ` ${hidden.join(', ')} 가려서 안 보여요.` : '';
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

function makeWhereQuestions(stage, rng) {
  // 네 방향이 고루 나오게: 넷을 섞어 앞에서부터 쓴다(문항 수가 넷보다 많으면 되풀이)
  const dirs = rng.shuffle(AROUND);
  return Array.from({ length: stage.count }, (_, i) => {
    const scene = makeScene(rng);
    const dir = dirs[i % dirs.length];
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
    // 보기: 정답 · 보이는 것만 센 수 · 위에서 본 모양의 칸 수 · 가까운 수 (넷, 작은 수부터)
    const options = new Set([total, total - hidden.length, spots]);
    for (const d of [1, -1, 2, -2, 3]) {
      if (options.size >= 4) break;
      if (total + d > 0) options.add(total + d);
    }
    return {
      itemId: `${stage.id}:${i + 1}`,
      target,
      top: topView(target),
      hidden,
      spots,
      seen: total - hidden.length,
      options: [...options].sort((a, b) => a - b),
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

/** blocks-count 채점: 고른 개수 → { correct, tag, expected, message } */
export function judgeCount(q, value) {
  const correct = value === q.expected;
  const layers = layerSentence(q.target);
  const hid = q.hidden.length > 0 ? ` 그림에 보이지 않는 쌓기나무가 ${q.hidden.length}개 숨어 있었어요.` : '';
  if (correct) return { correct, tag: null, expected: q.expected, message: `맞아요! ${layers}${hid}` };
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
};

/** 단계의 문항 목록. playStage에서 ctx.rng로 가장 먼저 부른다(같은 시드 = 같은 문항) */
export function makeBlockQuestions(stage, rng) {
  const make = MAKERS[stage.kind];
  if (!make) throw new Error(`알 수 없는 쌓기나무 단계 종류: ${stage.kind}`);
  return make(stage, rng);
}
