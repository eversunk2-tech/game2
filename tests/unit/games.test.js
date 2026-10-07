import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGames, prepareCover, validateGameMeta } from '../../scripts/lib/games.mjs';

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
  // color는 선택 필드: 있으면 #rrggbb
  assert.deepEqual(validateGameMeta({ ...ok, color: '#2f6f5e' }, 'fraction-factory'), []);
  assert.equal(validateGameMeta({ ...ok, color: 'green' }, 'fraction-factory').length, 1);
  assert.equal(validateGameMeta({ ...ok, color: '#2f6f5e; background:url(x)' }, 'fraction-factory').length, 1);
});

test('표지 cover.svg: 게임 모음에 그대로 넣을 수 있는 그림만 받는다', async () => {
  const ok = prepareCover('<?xml version="1.0"?>\n<!-- 설명 -->\n<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="#ffd86b"/></svg>\n');
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.svg, '<svg aria-hidden="true" focusable="false" viewBox="0 0 10 10"><rect width="10" height="10" fill="#ffd86b"/></svg>');
  for (const bad of [
    '<svg><script>alert(1)</script></svg>',
    '<svg><image href="https://example.com/a.png"/></svg>',
    '<svg><rect onclick="x()"/></svg>',
    '<svg><rect style="fill:url(#g)"/></svg>',
    '<svg><linearGradient id="g"/></svg>',
    '<div>그림 아님</div>',
  ]) assert.ok(prepareCover(bad).errors.length > 0, bad);

  // 지금 게임의 표지는 모두 통과하고 loadGames가 읽어 둔다
  const games = await loadGames(GAMES_DIR);
  for (const game of games.filter((g) => g.cover)) assert.match(game.cover, /^<svg aria-hidden="true"/, game.dirName);
  assert.ok(games.some((g) => g.cover), '표지가 있는 게임이 하나 이상');
});
