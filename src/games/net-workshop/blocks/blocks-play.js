/**
 * 쌓기나무 영역의 플레이 들머리 — 단계에 들어갈 때 받는 묶음(spec-grade6.md 7-4절 "영역을 들어갈 때 불러오기").
 * main.js가 import()로 이 파일을 받아 playBlockStage를 부른다. 문제 만들기·판정(blocks-logic.js)과 화면(play-blocks.js·play-views.js·play-layers.js·
 * block-view.js·block-pad.js·grid-draw.js)이 이 묶음에 들어간다. 단계 목록·단계 카드 그림은 바탕 묶음(index.js).
 * B0b에서 index.js의 playBlockStage를 내용 그대로 옮겼다.
 */
import { makeBlockQuestions } from './blocks-logic.js';
import { playBlocks } from './play-blocks.js';
import { VIEW_STAGE_KINDS, playViews } from './play-views.js'; // 3·4차시 화면
import { LAYER_STAGE_KINDS, playLayers } from './play-layers.js'; // 5차시·도전 화면 (S3)

/** 쌓기나무 단계 하나를 플레이한다 → 정리 함수 */
export function playBlockStage(stage, ctx) {
  // 문항을 가장 먼저 만든다: 같은 ?seed=면 같은 문항 (e2e 테스트도 이것으로 정답을 안다)
  const questions = makeBlockQuestions(stage, ctx.rng);
  if (LAYER_STAGE_KINDS.includes(stage.kind)) return playLayers(stage, ctx, questions);
  return VIEW_STAGE_KINDS.includes(stage.kind) ? playViews(stage, ctx, questions) : playBlocks(stage, ctx, questions);
}
