/**
 * 쌓기나무 영역의 들머리(바탕 묶음). main.js는 여기서 차시·단계 목록(단계 카드 그림 포함)만 가져간다.
 * 플레이(문제 만들기·판정·화면)는 단계에 들어갈 때 받는 묶음 blocks-play.js에 있다(spec-grade6.md 7-4절 "영역을 들어갈 때 불러오기" — B0b).
 */
import { BLOCK_BADGES, BLOCK_FREE_STAGES as FREE_LIST, BLOCK_HOW_TO, BLOCK_LESSONS, BLOCK_STAGES as STAGE_LIST } from './blocks-stages.js';
import { createBlockPicture } from './block-view.js';

// 단계 카드 그림: 작은 멈춘 그림 (조형물은 색·무늬)
const SCENE_LOOK = { yellow: { token: '--face-1', mark: 'plain' }, blue: { token: '--face-2', mark: 'slash' }, pink: { token: '--face-4', mark: 'dot' } };
const sceneColors = (rows) => rows.map((row) => row.map((id) => (id ? SCENE_LOOK[id] : null)));
const FREE_LOOK = { yellow: { token: '--face-1', mark: 'plain' }, blue: { token: '--face-2', mark: 'plain' }, green: { token: '--face-3', mark: 'plain' }, pink: { token: '--face-4', mark: 'plain' } };
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
  // 5차시 · 도전
  layerdraw: { map: [[1, 2, 3], [1, 2, 0], [0, 1, 0]] },
  layerbuild: { map: [[3, 2, 1], [2, 1, 0], [1, 0, 0]] },
  layerviews: { map: [[1, 3, 1], [0, 2, 0], [0, 1, 0]] },
  add: { map: [[1, 1, 0], [2, 1, 0], [0, 0, 0]] },
  // 자유 쌓기(F1) 카드: 여러 색 쌓기나무를 쌓은 판
  free: {
    map: [[2, 1, 0], [1, 3, 1], [0, 1, 2]],
    colors: [[FREE_LOOK.yellow, FREE_LOOK.yellow, null], [FREE_LOOK.blue, FREE_LOOK.pink, FREE_LOOK.green], [null, FREE_LOOK.green, FREE_LOOK.blue]],
  },
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

export { BLOCK_BADGES, BLOCK_HOW_TO, BLOCK_LESSONS };
export const BLOCK_STAGES = STAGE_LIST.map((stage) => ({ ...stage, thumb: thumbOf(stage.kind) }));
/** 자유 쌓기(F1): 엔진의 자유 단계 — 영역 단계 지도 맨 위의 넓은 카드 */
export const BLOCK_FREE_STAGES = FREE_LIST.map((stage) => ({ ...stage, thumb: thumbOf(stage.kind) }));
