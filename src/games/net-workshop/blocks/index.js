/**
 * 쌓기나무 영역의 들머리. main.js는 여기서 차시·단계 목록과 화면 함수만 가져간다
 * (나중에 영역을 들어갈 때 불러오는 묶음으로 나누기 쉽게 — spec-grade6.md 7-4절).
 */
import { BLOCK_HOW_TO, BLOCK_LESSONS, BLOCK_STAGES as STAGE_LIST, makeBlockQuestions } from './blocks-logic.js';
import { createBlockPicture } from './block-view.js';
import { playBlocks } from './play-blocks.js';
import { VIEW_STAGE_KINDS, playViews } from './play-views.js'; // 3·4차시 화면

// 단계 카드 그림: 작은 멈춘 그림 (조형물은 색·무늬)
const SCENE_LOOK = { yellow: { token: '--face-1', mark: 'plain' }, blue: { token: '--face-2', mark: 'slash' }, pink: { token: '--face-4', mark: 'dot' } };
const sceneColors = (rows) => rows.map((row) => row.map((id) => (id ? SCENE_LOOK[id] : null)));
const THUMBS = {
  play: { map: [[1, 2, 0], [0, 1, 0], [0, 0, 0]] },
  where: { map: [[1, 0, 0], [0, 0, 2], [3, 0, 0]], colors: sceneColors([['pink', null, null], [null, null, 'blue'], ['yellow', null, null]]) },
  scene: { map: [[0, 2, 0], [3, 0, 0], [0, 0, 1]], colors: sceneColors([[null, 'blue', null], ['yellow', null, null], [null, null, 'pink']]) },
  copy: { map: [[2, 1, 0], [1, 0, 0], [0, 0, 0]] },
  count: { map: [[1, 2, 1], [0, 3, 0], [0, 0, 0]] },
  hidden: { map: [[0, 3, 1], [0, 1, 0], [0, 0, 0]] },
  // 3·4차시
  flip: { map: [[1, 3, 2], [0, 1, 0], [0, 0, 0]] },
  draw: { map: [[1, 2, 0], [0, 3, 1], [0, 0, 0]] },
  build: { map: [[2, 1, 1], [1, 0, 0], [0, 0, 0]] },
  write: { map: [[1, 2, 0], [2, 3, 1], [0, 1, 0]] },
  fromnum: { map: [[3, 1, 0], [2, 1, 0], [1, 0, 0]] },
  numviews: { map: [[2, 0, 0], [1, 3, 1], [0, 1, 0]] },
};
function thumbOf(kind) {
  const spec = THUMBS[kind];
  return spec ? () => {
    const svg = createBlockPicture({ map: spec.map, colors: spec.colors ?? null, unit: 12, label: '' });
    svg.setAttribute('class', 'blk-picture blk-thumb');
    svg.removeAttribute('role');
    svg.removeAttribute('aria-label');
    svg.setAttribute('aria-hidden', 'true');
    return svg;
  } : null;
}

export { BLOCK_HOW_TO, BLOCK_LESSONS };
export const BLOCK_STAGES = STAGE_LIST.map((stage) => ({ ...stage, thumb: thumbOf(stage.kind) }));

/** 쌓기나무 단계 하나를 플레이한다 → 정리 함수 */
export function playBlockStage(stage, ctx) {
  // 문항을 가장 먼저 만든다: 같은 ?seed=면 같은 문항 (e2e 테스트도 이것으로 정답을 안다)
  const questions = makeBlockQuestions(stage, ctx.rng);
  return VIEW_STAGE_KINDS.includes(stage.kind) ? playViews(stage, ctx, questions) : playBlocks(stage, ctx, questions);
}
