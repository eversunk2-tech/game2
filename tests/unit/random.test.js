import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRng } from '../../src/shared/core/random.js';

test('같은 시드는 같은 순서를 만든다', () => {
  const a = createRng('수업-1');
  const b = createRng('수업-1');
  const listA = Array.from({ length: 5 }, () => a.next());
  const listB = Array.from({ length: 5 }, () => b.next());
  assert.deepEqual(listA, listB);
  assert.notDeepEqual(listA, Array.from({ length: 5 }, createRng('수업-2').next));
});

test('next()는 0 이상 1 미만, int()는 양 끝 포함', () => {
  const rng = createRng(42);
  const seen = new Set();
  for (let i = 0; i < 2000; i += 1) {
    const x = rng.next();
    assert.ok(x >= 0 && x < 1);
    seen.add(rng.int(1, 6));
  }
  assert.deepEqual([...seen].sort(), [1, 2, 3, 4, 5, 6]);
});

test('shuffle은 원본을 바꾸지 않고 같은 원소를 섞는다', () => {
  const rng = createRng(7);
  const list = [1, 2, 3, 4, 5, 6, 7, 8];
  const shuffled = rng.shuffle(list);
  assert.deepEqual(list, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual([...shuffled].sort((x, y) => x - y), list);
});

test('sample은 겹치지 않게 n개를 뽑는다', () => {
  const rng = createRng(3);
  const picked = rng.sample([1, 2, 3, 4, 5], 3);
  assert.equal(picked.length, 3);
  assert.equal(new Set(picked).size, 3);
});
