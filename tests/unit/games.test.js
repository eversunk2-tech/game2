import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGames, validateGameMeta } from '../../scripts/lib/games.mjs';

const GAMES_DIR = fileURLToPath(new URL('../../src/games', import.meta.url));

test('모든 게임 폴더의 game.json과 필수 파일이 올바르다', async () => {
  const games = await loadGames(GAMES_DIR);
  assert.ok(games.length > 0);
  for (const game of games) assert.deepEqual(game.errors, [], `${game.dirName}: ${game.errors.join(' / ')}`);
});

test('템플릿은 기본으로 건너뛰고, includeTemplates면 맨 뒤에 온다', async () => {
  const plain = await loadGames(GAMES_DIR);
  assert.ok(plain.every((g) => !g.isTemplate));
  const all = await loadGames(GAMES_DIR, { includeTemplates: true });
  assert.equal(all.at(-1).dirName, '_template');
  assert.equal(path.basename(all.at(-1).dir), '_template');
});

test('game.json 검사가 흔한 실수를 잡는다', () => {
  const ok = {
    id: 'fraction-factory',
    title: '분수 공장',
    summary: '설명',
    subject: '수학',
    grades: [5],
    units: ['5-1 약분과 통분'],
    standards: [],
    playMinutes: 10,
    mode: '개인',
    status: '기획',
  };
  assert.deepEqual(validateGameMeta(ok, 'fraction-factory'), []);
  assert.equal(validateGameMeta(ok, 'other-dir').length, 1);
  assert.equal(validateGameMeta({ ...ok, id: 'Fraction_Factory' }, 'Fraction_Factory').length, 1);
  assert.equal(validateGameMeta({ ...ok, grades: [4] }, 'fraction-factory').length, 1);
  assert.equal(validateGameMeta({ ...ok, mode: '팀' }, 'fraction-factory').length, 1);
  assert.equal(validateGameMeta({ ...ok, status: 'done' }, 'fraction-factory').length, 1);
  assert.equal(validateGameMeta({ ...ok, units: [] }, 'fraction-factory').length, 1);
});
