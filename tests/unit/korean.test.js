import assert from 'node:assert/strict';
import { test } from 'node:test';
import { finalSound, josa } from '../../src/shared/core/korean.js';

test('한글 낱말의 받침에 맞춰 조사를 고른다', () => {
  assert.equal(josa('사과', '을/를'), '사과를');
  assert.equal(josa('수박', '을/를'), '수박을');
  assert.equal(josa('약수', '이/가'), '약수가');
  assert.equal(josa('분수', '은/는'), '분수는');
  assert.equal(josa('배', '과/와'), '배와');
  assert.equal(josa('사람', '이에요/예요'), '사람이에요');
});

test('으로/로: ㄹ 받침은 "로"를 쓴다', () => {
  assert.equal(josa('서울', '으로/로'), '서울로');
  assert.equal(josa('부산', '으로/로'), '부산으로');
  assert.equal(josa('바다', '으로/로'), '바다로');
});

test('두 형태의 순서를 바꿔 써도 같은 결과', () => {
  assert.equal(josa('책', '를/을'), '책을');
  assert.equal(josa('나무', '가/이'), '나무가');
});

test('숫자는 읽는 소리로 받침을 정한다', () => {
  assert.equal(josa(1, '은/는'), '1은'); // 일
  assert.equal(josa(2, '은/는'), '2는'); // 이
  assert.equal(josa(3, '을/를'), '3을'); // 삼
  assert.equal(josa(6, '은/는'), '6은'); // 육
  assert.equal(josa(12, '을/를'), '12를'); // 십이
  assert.equal(josa(18, '은/는'), '18은'); // 십팔
  assert.equal(josa(10, '은/는'), '10은'); // 십
  assert.equal(josa(100, '이/가'), '100이'); // 백
  assert.equal(josa(1000, '이/가'), '1000이'); // 천
  assert.equal(josa(20000, '이/가'), '20000이'); // 이만
  assert.equal(josa(0, '은/는'), '0은'); // 영
  assert.equal(josa(4, '으로/로'), '4로');
  assert.equal(josa(7, '으로/로'), '7로'); // 칠 (ㄹ)
  assert.equal(josa(3, '으로/로'), '3으로');
});

test('분수·소수·단위', () => {
  assert.equal(josa('3/4', '이/가'), '3/4이'); // 사분의 삼
  assert.equal(josa('1/2', '은/는'), '1/2은'); // 이분의 일
  assert.equal(josa('2/5', '은/는'), '2/5는'); // 오분의 이
  assert.equal(josa('0.5', '은/는'), '0.5는'); // 영 점 오
  assert.equal(josa('1.6', '은/는'), '1.6은'); // 일 점 육
  assert.equal(josa('3 cm', '이/가'), '3 cm가'); // 센티미터
  assert.equal(josa('5kg', '이/가'), '5kg이'); // 킬로그램
  assert.equal(josa('50%', '은/는'), '50%는'); // 퍼센트
  assert.equal(josa('2L', '은/는'), '2L는'); // 리터
});

test('finalSound: 괄호·따옴표 뒤도 무시하고 판단', () => {
  assert.equal(finalSound('물(H₂O)'), '');
  assert.equal(finalSound('"독도"'), '');
  assert.equal(finalSound('강'), 'ㅇ');
  assert.equal(finalSound(''), '');
});

test('잘못된 형태는 바로 알려 준다', () => {
  assert.throws(() => josa('사과', '을'), /두 형태/);
});
