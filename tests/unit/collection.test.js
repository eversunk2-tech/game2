import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  collectItem,
  collectionChips,
  collectionStatus,
  collectionTotals,
  normalizeCollectionState,
  normalizeCollections,
} from '../../src/shared/core/collection.js';

const DEFS = normalizeCollections([
  { id: 'nets', title: '전개도 도감', items: [{ id: '1-4-1a', name: '1-4-1 가' }, { id: '1-4-1b', name: '1-4-1 나' }, { id: 2, name: '2-3-1' }] },
  { id: 'dice', title: '주사위 도감', items: [{ id: 'd1', name: '주사위 1' }] },
]);

test('도감 정의 검사: id·title·items 필수, 겹침 금지, thumb는 함수', () => {
  assert.deepEqual(normalizeCollections(null), []);
  assert.equal(DEFS[0].items[2].id, '2'); // 칸 id는 글자로
  assert.throws(() => normalizeCollections({}), /배열/);
  assert.throws(() => normalizeCollections([{ id: 'a', title: 'A', items: [] }]), /items/);
  assert.throws(() => normalizeCollections([{ id: 'a', title: 'A', items: [{ id: 1, name: 'x' }] }, { id: 'a', title: 'B', items: [{ id: 1, name: 'y' }] }]), /도감 id가 겹쳐요/);
  assert.throws(() => normalizeCollections([{ id: 'a', title: 'A', items: [{ id: 1, name: 'x' }, { id: '1', name: 'y' }] }]), /칸 id가 겹쳐요/);
  assert.throws(() => normalizeCollections([{ id: 'a', title: 'A', items: [{ id: 1 }] }]), /name/);
  assert.throws(() => normalizeCollections([{ id: 'a', title: 'A', items: [{ id: 1, name: 'x', thumb: '<svg>' }] }]), /thumb/);
});

test('처음 찾은 칸만 새로(isNew) 등록되고, 같은 칸은 다시 세지 않는다', () => {
  let state = normalizeCollectionState(null, DEFS);
  assert.deepEqual(state, { nets: {}, dice: {} });
  const first = collectItem(state, DEFS, 'nets', '1-4-1a', { at: 5, stage: 'cube-free' });
  assert.deepEqual([first.isNew, first.count, first.total, first.known], [true, 1, 3, true]);
  assert.deepEqual(first.state.nets['1-4-1a'], { at: 5, stage: 'cube-free' });
  assert.deepEqual(state.nets, {}); // 원래 상태는 그대로(순수 함수)
  state = first.state;
  const again = collectItem(state, DEFS, 'nets', '1-4-1a', { at: 9 });
  assert.deepEqual([again.isNew, again.count], [false, 1]);
  assert.equal(again.state, state);
  state = collectItem(state, DEFS, 'nets', 2).state; // 숫자 id도 글자로 맞춘다
  assert.deepEqual([...collectionStatus(state, DEFS[0]).found].sort(), ['1-4-1a', '2']);
  assert.deepEqual(collectionTotals(state, DEFS), { count: 2, total: 4 });
});

test('도감에 없는 칸·없는 도감은 등록하지 않는다 (찾은 수가 전체를 넘지 않음)', () => {
  const state = normalizeCollectionState(null, DEFS);
  const r1 = collectItem(state, DEFS, 'nets', '없는-칸');
  assert.deepEqual([r1.isNew, r1.known, r1.count, r1.total], [false, false, 0, 3]);
  const r2 = collectItem(state, DEFS, '없는-도감', 'x');
  assert.deepEqual([r2.isNew, r2.known, r2.total], [false, false, 0]);
  assert.equal(r1.state, state);
});

test('저장된 값 읽기: 모르는 칸·깨진 값은 버린다', () => {
  const raw = { nets: { '1-4-1a': { at: 1, stage: 's' }, ghost: { at: 2 }, '1-4-1b': 'x' }, other: { a: { at: 1 } } };
  assert.deepEqual(normalizeCollectionState(raw, DEFS), { nets: { '1-4-1a': { at: 1, stage: 's' } }, dice: {} });
  assert.deepEqual(normalizeCollectionState('깨짐', DEFS), { nets: {}, dice: {} });
});

test('도감 선택 값: xp는 0~5 정수(등록 점수), label은 짧은 이름 글자', () => {
  const base = { id: 'a', title: 'A', items: [{ id: 1, name: 'x' }] };
  assert.equal(normalizeCollections([{ ...base, xp: 1, label: '노트', icon: 'copy' }])[0].xp, 1);
  assert.equal(normalizeCollections([{ ...base, xp: 0 }])[0].xp, 0);
  assert.equal(normalizeCollections([base])[0].xp, undefined); // 없으면 엔진 기본(+5)
  for (const xp of [6, -1, 1.5, '1', NaN]) assert.throws(() => normalizeCollections([{ ...base, xp }]), /xp는 0~5/, String(xp));
  for (const label of ['', '  ', 3]) assert.throws(() => normalizeCollections([{ ...base, label }]), /label/, String(label));
});

test('도감 칩 숫자: label이 없는 도감은 합쳐 "도감 n / m", label이 있는 도감은 따로 (예: 전개도 도감 n / 11 + 노트 n / 24)', () => {
  const items = (n) => Array.from({ length: n }, (_, i) => ({ id: `i${i}`, name: `칸 ${i}` }));
  const defs = normalizeCollections([
    { id: 'nets', title: '전개도 도감', items: items(11) },
    { id: 'notes', title: '안 되는 모양 노트', label: '노트', icon: 'copy', xp: 1, items: items(24) },
  ]);
  let state = normalizeCollectionState(null, defs);
  assert.deepEqual(collectionChips(state, defs).main, { count: 0, total: 11 });
  for (const id of ['i0', 'i1', 'i2']) state = collectItem(state, defs, 'nets', id).state;
  for (const id of ['i0', 'i5']) state = collectItem(state, defs, 'notes', id).state;
  const chips = collectionChips(state, defs);
  assert.deepEqual(chips.main, { count: 3, total: 11 }); // 노트 24칸은 합치지 않는다 (전에는 5 / 35)
  assert.deepEqual(chips.mainDefs.map((d) => d.id), ['nets']);
  assert.deepEqual(chips.side, [{ id: 'notes', label: '노트', icon: 'copy', count: 2, total: 24 }]);
  assert.deepEqual(collectionTotals(state, defs), { count: 5, total: 35 });
  // label이 없는 도감이 여럿이면 지금처럼 합친다. label 도감만 있으면 main은 없다
  assert.deepEqual(collectionChips(normalizeCollectionState(null, DEFS), DEFS), { main: { count: 0, total: 4 }, mainDefs: DEFS, side: [] });
  assert.equal(collectionChips(state, [defs[1]]).main, null);
  assert.deepEqual(collectionChips(state, []), { main: null, mainDefs: [], side: [] });
});
