/**
 * 새 게임 폴더와 기획서를 만든다.
 *   npm run new -- fraction-factory "분수 공장"
 *
 *   src/games/_template/        →  src/games/fraction-factory/
 *   docs/game-design-template.md →  docs/games/fraction-factory.md
 */
import { access, cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isValidId } from './lib/games.mjs';
import { escapeHtml } from './lib/hub.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const exists = (file) => access(file).then(() => true, () => false);

function fill(text, ext, { id, title }) {
  const safeTitle = {
    '.json': JSON.stringify(title).slice(1, -1),
    '.html': escapeHtml(title),
  }[ext] ?? title;
  return text.replaceAll('__GAME_ID__', id).replaceAll('__GAME_TITLE__', safeTitle);
}

async function fillDir(dir, values) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await fillDir(file, values);
    } else if (/\.(json|html|js|css|md)$/.test(entry.name)) {
      const text = await readFile(file, 'utf8');
      await writeFile(file, fill(text, path.extname(entry.name), values));
    }
  }
}

export async function createGame({ rootDir = ROOT, id, title = id }) {
  if (!isValidId(id)) {
    throw new Error(`게임 id는 영어 소문자·숫자·하이픈만 써요 (예: fraction-factory). 받은 값: ${id}`);
  }
  const gamesDir = path.join(rootDir, 'src/games');
  const dir = path.join(gamesDir, id);
  if (await exists(dir)) throw new Error(`이미 있는 게임이에요: src/games/${id}`);

  await cp(path.join(gamesDir, '_template'), dir, { recursive: true });
  await fillDir(dir, { id, title });

  const doc = path.join(rootDir, 'docs/games', `${id}.md`);
  if (!(await exists(doc))) {
    const template = await readFile(path.join(rootDir, 'docs/game-design-template.md'), 'utf8');
    await mkdir(path.dirname(doc), { recursive: true });
    await writeFile(doc, fill(template, '.md', { id, title }));
  }
  return { dir, doc };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [id, title] = process.argv.slice(2);
  if (!id) {
    console.error('사용법: npm run new -- <게임-id> "<게임 이름>"\n예:     npm run new -- fraction-factory "분수 공장"');
    process.exit(1);
  }
  createGame({ id, title: title ?? id }).then(
    ({ dir, doc }) => {
      console.log(`새 게임을 만들었어요.\n  게임 폴더: ${path.relative(ROOT, dir)}\n  기획서:   ${path.relative(ROOT, doc)}`);
      console.log('\n다음 순서: 기획서 채우기 → game.json 고치기 → main.js 구현 → npm test && npm run test:e2e');
    },
    (error) => {
      console.error(error.message);
      process.exit(1);
    },
  );
}
