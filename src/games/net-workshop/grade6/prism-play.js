/**
 * 각기둥의 전개도 차시의 플레이 들머리 — 단계에 들어갈 때 받는 묶음(spec-grade6.md 7-4절 "영역을 들어갈 때 불러오기").
 * main.js가 import()로 이 파일을 받아 playPrismStage를 부른다. 문제 만들기·판정(prism-logic.js)과 화면(play-parts.js · play-pjudge.js · play-pedge.js)이
 * 이 묶음에 들어간다. 단계 목록·단계 카드 그림은 바탕 묶음(index.js). 입체의 계산(solids.js)도 이 묶음에만 있다.
 */
import { makePrismQuestions } from './prism-logic.js';
import { makeFreePlay } from './prism-free-logic.js';
import { makeCountQuestions } from './prism-count-logic.js';
import { playParts } from './play-parts.js';
import { playPrismEdge } from './play-pedge.js';
import { playPrismJudge } from './play-pjudge.js';
import { playPrismFree } from './play-pfree.js';
import { playPrismCount } from './play-pcount.js';

const SCREENS = { parts: playParts, pjudge: playPrismJudge, pedge: playPrismEdge, pfree: playPrismFree, pcount: playPrismCount };

/**
 * 단계의 문항: 전개도 완성하기는 한 판의 주문(각기둥 · 처음부터 놓인 면 — 휴대폰처럼 판이 세로로 긴 화면은 바탕 그림을 90° 돌린다, 문항은 같다),
 * 모서리와 꼭짓점은 5문항. 나머지는 prism-logic.js
 */
export function prismQuestions(stage, rng, { portrait = false } = {}) {
  if (stage.kind === 'pfree') return makeFreePlay(stage, rng, { portrait });
  if (stage.kind === 'pcount') return makeCountQuestions(stage, rng);
  return makePrismQuestions(stage, rng);
}

/** 각기둥 단계 하나를 플레이한다 → 정리 함수 */
export function playPrismStage(stage, ctx) {
  // 문항을 가장 먼저 만든다: 같은 ?seed=면 같은 문항 (e2e 테스트도 이것으로 정답을 안다)
  const portrait = Boolean(globalThis.matchMedia?.('(max-width: 560px)').matches);
  const questions = prismQuestions(stage, ctx.rng, { portrait });
  return SCREENS[stage.kind](stage, ctx, questions);
}
