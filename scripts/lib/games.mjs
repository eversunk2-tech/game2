import { readdir, readFile, access } from 'node:fs/promises';
import path from 'node:path';

export const STATUSES = ['기획', '개발 중', '시범 운영', '완료', '예시'];
export const MODES = ['개인', '모둠', '개인·모둠'];
export const REQUIRED_FILES = ['game.json', 'index.html', 'main.js'];
const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
/** 게임 폴더의 표지 그림(선택). 게임 모음 카드에 그대로 넣는다. */
export const COVER_FILE = 'cover.svg';

export function isValidId(id) {
  return typeof id === 'string' && ID_PATTERN.test(id);
}

/** game.json 검사. 문제가 없으면 빈 배열. */
export function validateGameMeta(meta, dirName) {
  const errors = [];
  const nonEmptyString = (v) => typeof v === 'string' && v.trim() !== '';
  const stringArray = (v) => Array.isArray(v) && v.every(nonEmptyString);

  if (!isValidId(meta.id)) errors.push(`id는 영어 소문자·숫자·하이픈만 써요 (예: fraction-factory): ${meta.id}`);
  else if (meta.id !== dirName) errors.push(`id(${meta.id})와 폴더 이름(${dirName})이 같아야 해요.`);
  if (!nonEmptyString(meta.title)) errors.push('title이 비어 있어요.');
  if (!nonEmptyString(meta.summary)) errors.push('summary가 비어 있어요.');
  if (!nonEmptyString(meta.subject)) errors.push('subject(교과)가 비어 있어요.');
  if (!Array.isArray(meta.grades) || meta.grades.length === 0 || !meta.grades.every((g) => g === 5 || g === 6)) {
    errors.push('grades는 [5], [6], [5, 6] 중 하나예요.');
  }
  if (!stringArray(meta.units) || meta.units.length === 0) errors.push('units(단원)를 하나 이상 써요.');
  if (!stringArray(meta.standards)) errors.push('standards는 성취기준 문자열 배열이에요 (확인 전이면 []).');
  if (!(typeof meta.playMinutes === 'number' && meta.playMinutes > 0)) errors.push('playMinutes는 0보다 큰 숫자예요.');
  if (!MODES.includes(meta.mode)) errors.push(`mode는 ${MODES.join(', ')} 중 하나예요.`);
  if (!STATUSES.includes(meta.status)) errors.push(`status는 ${STATUSES.join(', ')} 중 하나예요.`);
  if (meta.color !== undefined && !(typeof meta.color === 'string' && COLOR_PATTERN.test(meta.color))) {
    errors.push(`color는 "#2f6f5e"처럼 # 뒤 16진수 6자리예요 (선택 필드): ${meta.color}`);
  }
  return errors;
}

// ── 표지 cover.svg: 허용 목록으로 읽어 다시 쓴다 ────────────────
// 막을 것을 하나하나 찾는 대신(우회 길이 계속 생긴다), 기본 도형·글자 요소와 모양·색 속성만 받고
// 받은 것만으로 SVG를 새로 쓴다. 그래서 스크립트·링크·바깥 요청·애니메이션·style은 원천적으로 들어갈 수 없다.

/** 받는 요소 */
export const COVER_ELEMENTS = new Set(['svg', 'g', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path', 'text', 'tspan', 'title', 'desc']);
/** 글자를 담을 수 있는 요소 (나머지 요소 사이에는 빈칸만) */
const TEXT_ELEMENTS = new Set(['text', 'tspan', 'title', 'desc']);
const NUMBER = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?(?:px|%)?$/i;
const NUMBERS = /^[-+\d.eE,\s%]*$/;
const COLOR = /^(?:#[0-9a-f]{3,8}|none|currentColor|transparent|[a-z]{3,20})$/i;
const TRANSFORM = /^(?:\s*(?:matrix|translate|scale|rotate|skewX|skewY)\(\s*[-+\d.eE,\s]*\)\s*,?)*\s*$/;
/** 받는 속성과 값 모양 (값이 맞지 않으면 거부) */
export const COVER_ATTRIBUTES = {
  viewBox: NUMBERS, width: NUMBER, height: NUMBER, x: NUMBERS, y: NUMBERS, dx: NUMBERS, dy: NUMBERS,
  x1: NUMBER, y1: NUMBER, x2: NUMBER, y2: NUMBER, cx: NUMBER, cy: NUMBER, r: NUMBER, rx: NUMBER, ry: NUMBER,
  points: NUMBERS, d: /^[MmLlHhVvCcSsQqTtAaZz\d.,\s+eE-]*$/,
  fill: COLOR, stroke: COLOR, opacity: NUMBER, 'fill-opacity': NUMBER, 'stroke-opacity': NUMBER, 'fill-rule': /^(?:nonzero|evenodd)$/,
  'stroke-width': NUMBER, 'stroke-linejoin': /^(?:miter|round|bevel)$/, 'stroke-linecap': /^(?:butt|round|square)$/,
  'stroke-dasharray': NUMBERS, transform: TRANSFORM,
  'font-family': /^[\w\s'",-]+$/, 'font-size': NUMBER, 'font-weight': /^(?:normal|bold|[1-9]00)$/,
  'text-anchor': /^(?:start|middle|end)$/, 'dominant-baseline': /^[a-z-]+$/, 'letter-spacing': NUMBER,
  preserveAspectRatio: /^[a-zA-Z\s]+$/,
};
/** 뿌리 svg에만 받는 속성 */
const ROOT_ATTRIBUTES = {
  xmlns: /^http:\/\/www\.w3\.org\/2000\/svg$/,
  'aria-hidden': /^true$/,
  focusable: /^false$/,
};

const escapeAttr = (v) => String(v).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const escapeText = (v) => String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/** 태그 안의 속성 글을 읽는다. 따옴표 없는 값·같은 속성 두 번은 받지 않는다. → { attrs: [[이름, 값]], error } */
function readAttributes(text) {
  const attrs = [];
  const re = /\s+([^\s=/>"']+)\s*=\s*(?:"([^"]*)"|'([^']*)')/y;
  let at = 0;
  const rest = text.replace(/\s*\/?\s*$/, '');
  while (at < rest.length) {
    re.lastIndex = at;
    const m = re.exec(rest);
    if (!m) return { attrs, error: `속성을 읽지 못했어요: ${rest.slice(at, at + 30).trim()}` };
    if (attrs.some(([name]) => name === m[1])) return { attrs, error: `같은 속성이 두 번 있어요: ${m[1]}` };
    attrs.push([m[1], m[2] ?? m[3]]);
    at = re.lastIndex;
  }
  return { attrs, error: null };
}

/**
 * cover.svg를 게임 모음에 그대로 넣을 수 있게 다듬는다 (허용 목록).
 * 받는 것: COVER_ELEMENTS 요소, COVER_ATTRIBUTES 속성(값 모양까지), 글자 요소 안의 글자. 그 밖은 모두 오류.
 * 통과하면 받은 요소·속성만으로 새로 쓰고, 그림이므로 aria-hidden을 붙인다. → { svg, errors }
 */
export function prepareCover(text) {
  const source = String(text)
    .replace(/^\uFEFF/, '')
    .replace(/^\s*<\?xml\s[^?>]*\?>/, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();
  const errors = [];
  const fail = (message) => {
    if (!errors.includes(message)) errors.push(message);
  };
  if (/<!DOCTYPE|<!ENTITY|<!\[CDATA\[|<\?/i.test(source)) fail(`${COVER_FILE}에 DOCTYPE·ENTITY·CDATA·처리 명령은 쓸 수 없어요.`);
  // 바깥 주소·@import·url()은 글자 안에 있어도 받지 않는다 (SVG 이름공간 xmlns만 예외)
  const withoutNs = source.replace(/\sxmlns\s*=\s*"http:\/\/www\.w3\.org\/2000\/svg"/g, '');
  if (/(?:https?:)?\/\/[a-z0-9]|@import|url\s*\(|javascript:|&#/i.test(withoutNs)) {
    fail(`${COVER_FILE}에 바깥 주소(http, //)·@import·url()·javascript:·숫자 문자 참조(&#)는 쓸 수 없어요.`);
  }

  const out = [];
  const stack = [];
  const token = /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[^\s=/>"']+\s*=\s*(?:"[^"]*"|'[^']*'))*\s*\/?)>|([^<]+)|(<)/g;
  let rootSeen = false;
  let rootClosed = false;
  for (const m of source.matchAll(token)) {
    const [, slash, name, attrText, textPart, stray] = m;
    if (stray) {
      fail(`${COVER_FILE}: 읽을 수 없는 태그가 있어요 (${source.slice(m.index, m.index + 24)}…).`);
      break;
    }
    if (textPart != null) {
      const inText = stack.length > 0 && TEXT_ELEMENTS.has(stack.at(-1));
      if (!inText && textPart.trim()) fail(`${COVER_FILE}: 글자는 text·tspan·title·desc 안에만 쓸 수 있어요.`);
      if (/&(?!(?:amp|lt|gt|quot|apos);)/.test(textPart)) fail(`${COVER_FILE}: 글자 안의 &는 &amp;로 써요.`);
      if (stack.length > 0) out.push(inText ? escapeText(textPart.replace(/&(amp|lt|gt|quot|apos);/g, (_, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e]))) : textPart.replace(/\S/g, ''));
      continue;
    }
    if (!COVER_ELEMENTS.has(name)) {
      fail(`${COVER_FILE}에 <${name}>는 쓸 수 없어요(받는 요소: ${[...COVER_ELEMENTS].join(' ')}).`);
      continue;
    }
    if (slash) {
      if (stack.at(-1) !== name) {
        fail(`${COVER_FILE}: </${name}>의 짝이 맞지 않아요.`);
        break;
      }
      stack.pop();
      out.push(`</${name}>`);
      if (stack.length === 0) rootClosed = true;
      continue;
    }
    if (rootClosed || (!rootSeen && name !== 'svg')) {
      fail(`${COVER_FILE}는 <svg>…</svg> 하나여야 해요.`);
      break;
    }
    const isRoot = !rootSeen;
    rootSeen = true;
    const { attrs, error } = readAttributes(attrText);
    if (error) fail(`${COVER_FILE}: ${error}`);
    const kept = [];
    for (const [attr, value] of attrs) {
      const rule = (isRoot ? ROOT_ATTRIBUTES[attr] : null) ?? COVER_ATTRIBUTES[attr];
      if (!rule) {
        fail(`${COVER_FILE}에 ${attr} 속성은 쓸 수 없어요(style·href·id·on…·class 등은 받지 않아요. 색은 fill="#ffd86b"처럼).`);
        continue;
      }
      if (/[&<>]/.test(value) || !rule.test(value)) {
        fail(`${COVER_FILE}: ${attr}="${value.slice(0, 40)}" 값은 쓸 수 없어요.`);
        continue;
      }
      kept.push(`${attr}="${escapeAttr(value)}"`);
    }
    if (isRoot && !attrs.some(([a]) => a === 'aria-hidden')) kept.unshift('aria-hidden="true"', 'focusable="false"');
    const selfClosing = /\/\s*$/.test(attrText);
    out.push(`<${name}${kept.length ? ` ${kept.join(' ')}` : ''}${selfClosing ? '/' : ''}>`);
    if (!selfClosing) stack.push(name);
    else if (isRoot) rootClosed = true;
  }
  if (!rootSeen || stack.length > 0 || !rootClosed) fail(`${COVER_FILE}는 <svg>…</svg> 하나여야 해요.`);
  return { svg: errors.length ? null : out.join(''), errors };
}

const exists = (file) => access(file).then(() => true, () => false);

/**
 * src/games 아래 게임 폴더를 읽는다. 밑줄(_)로 시작하는 폴더는 템플릿이라
 * includeTemplates가 아니면 건너뛴다.
 */
export async function loadGames(gamesDir, { includeTemplates = false } = {}) {
  const entries = await readdir(gamesDir, { withFileTypes: true });
  const games = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const isTemplate = entry.name.startsWith('_');
    if (isTemplate && !includeTemplates) continue;
    const dir = path.join(gamesDir, entry.name);
    const missing = [];
    for (const file of REQUIRED_FILES) {
      if (!(await exists(path.join(dir, file)))) missing.push(file);
    }
    let meta = {};
    let parseError = null;
    if (!missing.includes('game.json')) {
      try {
        meta = JSON.parse(await readFile(path.join(dir, 'game.json'), 'utf8'));
      } catch (error) {
        parseError = `game.json을 읽지 못했어요: ${error.message}`;
      }
    }
    let cover = null;
    const coverErrors = [];
    if (await exists(path.join(dir, COVER_FILE))) {
      const prepared = prepareCover(await readFile(path.join(dir, COVER_FILE), 'utf8'));
      cover = prepared.svg;
      coverErrors.push(...prepared.errors);
    }
    const errors = [
      ...missing.map((f) => `${f} 파일이 없어요.`),
      ...(parseError ? [parseError] : []),
      ...(isTemplate || parseError || missing.includes('game.json') ? [] : validateGameMeta(meta, entry.name)),
      ...coverErrors,
    ];
    games.push({ dir, dirName: entry.name, isTemplate, meta, cover, errors });
  }
  return games.sort(compareGames);
}

// 게임 모음에 보이는 순서: 완성된 게임 먼저, 예시·템플릿은 뒤로
const STATUS_ORDER = ['완료', '시범 운영', '개발 중', '기획', '예시'];

function compareGames(a, b) {
  const rank = (g) => {
    if (g.isTemplate) return STATUS_ORDER.length + 1;
    const i = STATUS_ORDER.indexOf(g.meta.status);
    return i < 0 ? STATUS_ORDER.length : i;
  };
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  const grade = (g) => Math.min(...(g.meta.grades ?? [9]));
  if (grade(a) !== grade(b)) return grade(a) - grade(b);
  return String(a.meta.title).localeCompare(String(b.meta.title), 'ko');
}
