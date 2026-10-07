/**
 * 인라인 SVG 아이콘. 이모지(🔊🔒⭕❌)는 기기마다 모양이 달라 아이콘으로 그린다.
 * 24×24, 선 2.2px, 둥근 끝, 색은 글자색(currentColor)을 따른다.
 * 그림일 뿐이라 늘 aria-hidden="true"다. 뜻은 버튼·옆 글자로 전한다.
 *
 *   icon('sound')                  → <svg class="icon icon-sound">
 *   icon('check', { class: 'big' }) → 클래스 더하기
 *   starIcon(true)                 → 찬 별 (빈 별은 false)
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

// 이름 → 그릴 요소 목록 [태그, 속성]. 채우는 모양은 fill: 'currentColor'.
const FILLED = { fill: 'currentColor', stroke: 'none' };
export const ICONS = {
  back: [['path', { d: 'M14.5 5.5 8 12l6.5 6.5' }]],
  sound: [['path', { d: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4z' }], ['path', { d: 'M15.5 9a4 4 0 0 1 0 6' }], ['path', { d: 'M18 6.5a7.5 7.5 0 0 1 0 11' }]],
  mute: [['path', { d: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4z' }], ['path', { d: 'M15.5 9.5l5 5M20.5 9.5l-5 5' }]],
  lock: [['rect', { x: 5, y: 10.5, width: 14, height: 10, rx: 2.5 }], ['path', { d: 'M8 10.5V8a4 4 0 0 1 8 0v2.5' }]],
  check: [['path', { d: 'M5 12.5l4.5 4.5L19 7.5' }]],
  cross: [['path', { d: 'M6.5 6.5l11 11M17.5 6.5l-11 11' }]],
  info: [['circle', { cx: 12, cy: 12, r: 8.5 }], ['path', { d: 'M12 11v5.5' }], ['circle', { cx: 12, cy: 7.8, r: 1.2, ...FILLED }]],
  rotl: [['path', { d: 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3' }], ['path', { d: 'M4.5 4.5v4.2h4.2' }]],
  rotr: [['path', { d: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3' }], ['path', { d: 'M19.5 4.5v4.2h-4.2' }]],
  play: [['path', { d: 'M8 5.5v13l10-6.5z', ...FILLED }]],
  unfold: [['path', { d: 'M16 5.5v13L6 12z', ...FILLED }]],
  bulb: [['path', { d: 'M9 18h6M10 21h4' }], ['path', { d: 'M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2v.1h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z' }]],
  book: [['path', { d: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z' }], ['path', { d: 'M5 17a3 3 0 0 1 3-3h11' }]],
  stamp: [['path', { d: 'M9.5 3h5v4.5l-1 3.5h-3l-1-3.5z' }], ['path', { d: 'M5 14h14v4H5z' }], ['path', { d: 'M4 21h16' }]],
  spark: [['path', { d: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z' }], ['path', { d: 'M19 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z' }]],
  clock: [['circle', { cx: 12, cy: 12, r: 8.5 }], ['path', { d: 'M12 7.5V12l3 2' }]],
  user: [['circle', { cx: 12, cy: 8, r: 3.5 }], ['path', { d: 'M5 20a7 7 0 0 1 14 0' }]],
  target: [['circle', { cx: 12, cy: 12, r: 8.5 }], ['circle', { cx: 12, cy: 12, r: 4.5 }], ['circle', { cx: 12, cy: 12, r: 0.8, ...FILLED }]],
  search: [['circle', { cx: 10.5, cy: 10.5, r: 6 }], ['path', { d: 'M15 15l5 5' }]],
  cube: [['path', { d: 'M12 3l8 4.5v9L12 21l-8-4.5v-9z' }], ['path', { d: 'M4 7.5l8 4.5 8-4.5M12 12v9' }]],
  trash: [['path', { d: 'M5 7h14M9.5 7V4.5h5V7M7 7l1 13h8l1-13' }]],
  undo: [['path', { d: 'M9 7H5V3' }], ['path', { d: 'M5 7a8 8 0 1 1-1 7' }]],
  hand: [['path', { d: 'M8 12V6.5a1.5 1.5 0 0 1 3 0V11m0-1V4.5a1.5 1.5 0 0 1 3 0V11m0-4.5a1.5 1.5 0 0 1 3 0V13a7 7 0 0 1-7 7h-.5A5.5 5.5 0 0 1 5 15.5l-1.4-3a1.5 1.5 0 0 1 2.6-1.5L8 13' }]],
  shield: [['path', { d: 'M12 3l7 3v5.5c0 4.5-3 8-7 9.5-4-1.5-7-5-7-9.5V6z' }], ['path', { d: 'M9 12l2 2 4-4' }]],
  grid: [['rect', { x: 4, y: 4, width: 16, height: 16, rx: 2 }], ['path', { d: 'M4 9.3h16M4 14.6h16M9.3 4v16M14.6 4v16' }]],
  flag: [['path', { d: 'M5 21V4' }], ['path', { d: 'M5 4h11l-2 4 2 4H5' }]],
  arrow: [['path', { d: 'M5 12h13M13 6.5l5.5 5.5-5.5 5.5' }]],
  copy: [['rect', { x: 8, y: 8, width: 12, height: 12, rx: 2 }], ['path', { d: 'M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3' }]],
  home: [['path', { d: 'M4 11l8-7 8 7v9h-5v-6h-6v6H4z' }]],
};

export const STAR_PATH = 'M12 2.6l2.85 5.9 6.45.85-4.75 4.45 1.2 6.4L12 17.1l-5.75 3.1 1.2-6.4L2.7 9.35l6.45-.85z';

function svg(className, parts) {
  const el = document.createElementNS(SVG_NS, 'svg');
  el.setAttribute('class', className);
  el.setAttribute('viewBox', '0 0 24 24');
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('focusable', 'false');
  for (const [tag, attrs] of parts) {
    const child = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) child.setAttribute(key, String(value));
    el.append(child);
  }
  return el;
}

/** 이름으로 아이콘 SVG 요소를 만든다. 없는 이름이면 오류(오타를 바로 알기 위해). */
export function icon(name, { class: extra = '' } = {}) {
  const parts = ICONS[name];
  if (!parts) throw new Error(`icon: "${name}" 아이콘이 없어요. (${Object.keys(ICONS).join(', ')})`);
  return svg(`icon icon-${name} ${extra}`.trim(), parts);
}

/** 별 하나. on이면 찬 별(노랑 + 잉크 테두리), 아니면 빈 별(갈색 테두리). */
export function starIcon(on, { class: extra = '' } = {}) {
  return svg(`star ${on ? 'on' : 'off'} ${extra}`.trim(), [['path', { d: STAR_PATH }]]);
}
