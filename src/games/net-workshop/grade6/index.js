/**
 * 6학년 전개도 영역(각기둥 — 원기둥도 나중에 여기에)의 들머리(바탕 묶음). main.js는 여기서 차시·단계 목록(단계 카드 그림 포함)만 가져간다.
 * 플레이(문제 만들기·판정·화면)는 단계에 들어갈 때 받는 묶음 prism-play.js에 있다(spec-grade6.md 7-4절 "영역을 들어갈 때 불러오기" — B0b의 쌓기나무와 같은 방법).
 */
import { PRISM_HOW_TO, PRISM_LESSONS, PRISM_STAGES as STAGE_LIST } from './prism-stages.js';

const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}, children = []) => {
  const el = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) if (value != null) el.setAttribute(key, String(value));
  for (const child of children) if (child) el.append(child);
  return el;
};
/** 칠하기·선 (style로 줘야 var()가 된다) */
const paint = (fill, extra = '') => `fill:${fill};stroke:var(--ink);stroke-width:2;stroke-linejoin:round;${extra}`;
const face = (n) => `var(--face-${n})`;
const poly = (points, fill, extra) => svgEl('polygon', { points, style: paint(fill, extra) });

// 단계 카드 그림 (76×57, viewBox 80×60)
const THUMBS = {
  /** 밑면과 옆면: 선 삼각기둥 — 두 밑면에 ○ */
  parts: () => [
    poly('22,14 46,14 58,22 34,22', face(1)),
    poly('22,14 34,22 34,52 22,44', face(2)),
    poly('34,22 58,22 58,52 34,52', face(3)),
    svgEl('circle', { cx: 40, cy: 18, r: 3.2, style: 'fill:none;stroke:var(--ink);stroke-width:1.8' }),
    svgEl('circle', { cx: 68, cy: 46, r: 9, style: paint('var(--paper)') }),
    svgEl('path', { d: 'M63.5 46l3.5 3.5 6-7', style: 'fill:none;stroke:var(--correct);stroke-width:3;stroke-linecap:round;stroke-linejoin:round' }),
  ],
  /** 각기둥이 될까?: 삼각기둥 전개도 + ✓ 도장 */
  pjudge: () => [
    poly('6,22 22,22 22,44 6,44', face(2)), poly('22,22 38,22 38,44 22,44', face(3)), poly('38,22 54,22 54,44 38,44', face(4)),
    poly('22,22 38,22 30,8', face(1)), poly('22,44 38,44 30,58', face(1)),
    svgEl('circle', { cx: 68, cy: 46, r: 9, style: paint('var(--paper)') }),
    svgEl('path', { d: 'M63.5 46l3.5 3.5 6-7', style: 'fill:none;stroke:var(--correct);stroke-width:3;stroke-linecap:round;stroke-linejoin:round' }),
  ],
  /** 맞닿는 선분: 같은 무늬로 표시한 두 선분 */
  pedge: () => [
    poly('6,22 22,22 22,44 6,44', face(2)), poly('22,22 38,22 38,44 22,44', face(3)), poly('38,22 54,22 54,44 38,44', face(4)),
    poly('22,22 38,22 30,8', face(1)), poly('38,44 54,44 46,58', face(1)),
    svgEl('path', { d: 'M6 22v22M54 22v22', style: 'fill:none;stroke:var(--primary);stroke-width:4.5' }),
  ],
};

function thumbOf(kind) {
  const make = THUMBS[kind];
  return make ? () => svgEl('svg', { viewBox: '0 0 80 60', class: `stage-art stage-art-${kind}`, 'aria-hidden': 'true', focusable: 'false' }, make()) : undefined;
}

export { PRISM_HOW_TO, PRISM_LESSONS };
export const PRISM_STAGES = STAGE_LIST.map((stage) => ({ ...stage, thumb: thumbOf(stage.kind) }));
