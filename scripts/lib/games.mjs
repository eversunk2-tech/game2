import { readdir, readFile, access } from 'node:fs/promises';
import path from 'node:path';

export const STATUSES = ['기획', '개발 중', '시범 운영', '완료', '예시'];
export const MODES = ['개인', '모둠', '개인·모둠'];
export const REQUIRED_FILES = ['game.json', 'index.html', 'main.js'];
const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

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
  return errors;
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
    const errors = [
      ...missing.map((f) => `${f} 파일이 없어요.`),
      ...(parseError ? [parseError] : []),
      ...(isTemplate || parseError || missing.includes('game.json') ? [] : validateGameMeta(meta, entry.name)),
    ];
    games.push({ dir, dirName: entry.name, isTemplate, meta, errors });
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
