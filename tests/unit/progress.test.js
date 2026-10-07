import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createProgress, starsFromAccuracy } from '../../src/shared/core/progress.js';
import { createMemoryBackend, createStorage } from '../../src/shared/core/storage.js';

const ids = ['s1', 's2', 's3'];

test('정답률로 별 개수 정하기', () => {
  assert.equal(starsFromAccuracy(1), 3);
  assert.equal(starsFromAccuracy(0.9), 3);
  assert.equal(starsFromAccuracy(0.89), 2);
  assert.equal(starsFromAccuracy(0.7), 2);
  assert.equal(starsFromAccuracy(0.2), 1);
  assert.equal(starsFromAccuracy(null), 1);
  assert.equal(starsFromAccuracy(0.6, { two: 0.5 }), 2);
});

test('첫 단계만 열려 있고, 앞 단계를 마치면 다음이 열린다', () => {
  const p = createProgress({ stageIds: ids });
  assert.equal(p.isUnlocked('s1'), true);
  assert.equal(p.isUnlocked('s2'), false);
  p.record('s1', 1);
  assert.equal(p.isUnlocked('s2'), true);
  assert.equal(p.isUnlocked('s3'), false);
  assert.equal(p.isUnlocked('없는-단계'), false);
});

test('openIds의 단계는 처음부터 열리고, 그다음 단계는 앞 단계를 마쳐야 열린다', () => {
  const lessonIds = ['a1', 'a2', 'b1', 'b2'];
  const p = createProgress({ stageIds: lessonIds, openIds: ['a1', 'b1'] });
  assert.equal(p.isUnlocked('a1'), true);
  assert.equal(p.isUnlocked('a2'), false);
  assert.equal(p.isUnlocked('b1'), true);
  assert.equal(p.isUnlocked('b2'), false);
  p.record('b1', 1);
  assert.equal(p.isUnlocked('b2'), true);
  assert.equal(p.isUnlocked('a2'), false);
  assert.equal(p.isUnlocked('없는-단계'), false);
});

test('openIds를 주지 않으면(기본값) 예전과 똑같이 동작한다', () => {
  const plain = createProgress({ stageIds: ids });
  const empty = createProgress({ stageIds: ids, openIds: [] });
  for (const p of [plain, empty]) {
    assert.deepEqual(ids.map((id) => p.isUnlocked(id)), [true, false, false]);
    p.record('s1', 2);
    assert.deepEqual(ids.map((id) => p.isUnlocked(id)), [true, true, false]);
  }
});

test('unlockAll이면 모두 열린다', () => {
  const p = createProgress({ stageIds: ids, unlockAll: true });
  assert.ok(ids.every((id) => p.isUnlocked(id)));
});

test('별은 최고 기록만 남고 0~3으로 자른다', () => {
  const p = createProgress({ stageIds: ids });
  p.record('s1', 2);
  p.record('s1', 1);
  assert.equal(p.getStars('s1'), 2);
  p.record('s1', 9);
  assert.equal(p.getStars('s1'), 3);
  p.record('s2', 0);
  assert.equal(p.isCleared('s2'), false);
  assert.equal(p.totalStars(), 3);
  assert.equal(p.maxStars, 9);
  assert.equal(p.nextStageId('s1'), 's2');
  assert.equal(p.nextStageId('s3'), null);
});

test('저장소에 남아 다시 열어도 이어진다', () => {
  const backend = createMemoryBackend();
  createProgress({ stageIds: ids, storage: createStorage('g', backend) }).record('s1', 3);
  const again = createProgress({ stageIds: ids, storage: createStorage('g', backend) });
  assert.equal(again.getStars('s1'), 3);
  again.reset();
  assert.equal(createProgress({ stageIds: ids, storage: createStorage('g', backend) }).getStars('s1'), 0);
});
