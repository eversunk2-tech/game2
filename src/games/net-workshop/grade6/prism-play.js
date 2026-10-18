/**
 * 각기둥의 전개도 차시의 플레이 들머리 — 단계에 들어갈 때 받는 묶음(spec-grade6.md 7-4절 "영역을 들어갈 때 불러오기").
 * main.js가 import()로 이 파일을 받아 playPrismStage를 부른다. 문제 만들기·판정(prism-logic.js)과 화면(play-parts.js · play-pjudge.js · play-pedge.js)이
 * 이 묶음에 들어간다. 단계 목록·단계 카드 그림은 바탕 묶음(index.js). 입체의 계산(solids.js)도 이 묶음에만 있다.
 */
import { makePrismQuestions } from './prism-logic.js';
import { playParts } from './play-parts.js';
import { playPrismEdge } from './play-pedge.js';
import { playPrismJudge } from './play-pjudge.js';

const SCREENS = { parts: playParts, pjudge: playPrismJudge, pedge: playPrismEdge };

/** 각기둥 단계 하나를 플레이한다 → 정리 함수 */
export function playPrismStage(stage, ctx) {
  // 문항을 가장 먼저 만든다: 같은 ?seed=면 같은 문항 (e2e 테스트도 이것으로 정답을 안다)
  const questions = makePrismQuestions(stage, ctx.rng);
  return SCREENS[stage.kind](stage, ctx, questions);
}
