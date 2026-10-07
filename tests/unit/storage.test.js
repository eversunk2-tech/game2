import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMemoryBackend, createStorage } from '../../src/shared/core/storage.js';

test('JSON으로 저장하고 게임마다 이름 공간을 나눈다', () => {
  const backend = createMemoryBackend();
  const a = createStorage('game-a', backend);
  const b = createStorage('game-b', backend);
  a.set('stars', { s1: 2 });
  assert.deepEqual(a.get('stars'), { s1: 2 });
  assert.equal(b.get('stars', 'none'), 'none');
  assert.equal(backend.getItem('edu:game-a:stars'), '{"s1":2}');
  a.remove('stars');
  assert.equal(a.get('stars'), null);
});

test('깨진 값은 기본값으로 읽는다', () => {
  const backend = createMemoryBackend();
  backend.setItem('edu:g:x', '{깨진');
  assert.equal(createStorage('g', backend).get('x', 7), 7);
});

test('저장이 막히면 메모리로 바꿔서 계속 동작한다', () => {
  const blocked = {
    getItem: () => null,
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
    removeItem: () => {
      throw new Error('blocked');
    },
  };
  const s = createStorage('g', blocked);
  s.set('muted', true);
  assert.equal(s.get('muted'), true);
  s.remove('muted');
  assert.equal(s.get('muted'), null);
});
