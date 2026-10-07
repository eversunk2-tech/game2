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

/**
 * cover.svg를 게임 모음에 그대로 넣을 수 있게 다듬는다.
 * 파일 하나 규칙(바깥 참조 없음)과 안전(스크립트 없음)을 검사하고, 그림이므로 aria-hidden을 붙인다.
 * → { svg, errors }
 */
export function prepareCover(text) {
  const svg = String(text)
    .replace(/<\?xml[\s\S]*?\?>/g, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();
  const errors = [];
  if (!/^<svg\b[\s\S]*<\/svg>$/i.test(svg)) errors.push(`${COVER_FILE}는 <svg>…</svg> 하나여야 해요.`);
  if (/<(script|foreignObject|image|iframe|use)\b/i.test(svg)) errors.push(`${COVER_FILE}에 script·image·use·foreignObject는 쓸 수 없어요.`);
  // <style>은 게임 모음 페이지 전체에 적용되고 @import로 바깥 파일을 부를 수 있다 → 쓰지 않는다(색은 속성으로 직접)
  if (/<style\b/i.test(svg) || /@import\b/i.test(svg)) errors.push(`${COVER_FILE}에 <style>·@import는 쓸 수 없어요(색은 fill="#ffd86b"처럼 속성으로).`);
  if (/\b(?:https?:)?\/\/[a-z0-9]/i.test(svg.replace(/\bxmlns(?::\w+)?\s*=\s*["'][^"']*["']/gi, ''))) {
    errors.push(`${COVER_FILE}에 바깥 주소(http)는 쓸 수 없어요.`);
  }
  if (/\son[a-z]+\s*=/i.test(svg)) errors.push(`${COVER_FILE}에 on… 이벤트 속성은 쓸 수 없어요.`);
  if (/\b(?:xlink:)?href\s*=|url\(|\bid\s*=/i.test(svg)) {
    errors.push(`${COVER_FILE}에 href·url()·id는 쓸 수 없어요(바깥 참조·다른 그림과 id 충돌 방지).`);
  }
  const ready = /^<svg\b[^>]*\baria-hidden\s*=/i.test(svg) ? svg : svg.replace(/^<svg\b/i, '<svg aria-hidden="true" focusable="false"');
  return { svg: errors.length ? null : ready, errors };
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
