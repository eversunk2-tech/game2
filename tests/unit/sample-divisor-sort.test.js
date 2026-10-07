import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRng } from '../../src/shared/core/random.js';
import { STAGES, binsFor, isYes, judge, makeCards } from '../../src/games/sample-divisor-sort/logic.js';

const stage = (id) => STAGES.find((s) => s.id === id);

test('단계마다 정해진 수만큼, 겹치지 않게, 꼭 넣을 카드를 포함해 만든다', () => {
  for (const s of STAGES) {
    for (let seed = 0; seed < 30; seed += 1) {
      const cards = makeCards(s, createRng(seed));
      const values = cards.map((c) => c.value);
      assert.equal(new Set(values).size, values.length, `${s.id} 중복`);
      assert.equal(cards.filter((c) => c.answer === 'yes').length, s.yesCount, `${s.id} yes 개수`);
      assert.equal(cards.filter((c) => c.answer === 'no').length, s.noCount, `${s.id} no 개수`);
      for (const m of s.must) assert.ok(values.includes(m), `${s.id}에 ${m}이 없음`);
      for (const c of cards) assert.equal(c.answer, isYes(s, c.value) ? 'yes' : 'no');
    }
  }
});

test('같은 시드면 같은 카드', () => {
  const s = STAGES[0];
  assert.deepEqual(makeCards(s, createRng('a')), makeCards(s, createRng('a')));
});

test('약수·배수·공약수 판정', () => {
  assert.equal(isYes(stage('divisors-of-12'), 6), true);
  assert.equal(isYes(stage('divisors-of-12'), 5), false);
  assert.equal(isYes(stage('multiples-of-4'), 4), true);
  assert.equal(isYes(stage('multiples-of-4'), 2), false);
  assert.equal(isYes(stage('common-divisors-12-18'), 6), true);
  assert.equal(isYes(stage('common-divisors-12-18'), 4), false);
});

test('상자 이름', () => {
  assert.deepEqual(binsFor(stage('divisors-of-12')).map((b) => b.label), ['12의 약수', '12의 약수가 아닌 수']);
  assert.deepEqual(binsFor(stage('common-divisors-12-18')).map((b) => b.label), ['12와 18의 공약수', '12와 18의 공약수가 아닌 수']);
});

test('틀리면 오개념 tag와 이유를 알려 준다', () => {
  const d = stage('divisors-of-12');
  assert.deepEqual(
    judge(d, 1, 'no'),
    { correct: false, expected: 'yes', tag: '1과 자기 자신도 약수', message: '12 ÷ 1 = 12, 나누어떨어지니까 1은 12의 약수예요. 1은 모든 수의 약수예요.' },
  );
  assert.equal(judge(d, 5, 'yes').message, '12 ÷ 5 = 2 … 2, 나머지가 있으니까 5는 12의 약수가 아니에요.');
  assert.equal(judge(d, 13, 'yes').tag, '약수는 그 수보다 클 수 없음');

  const m = stage('multiples-of-4');
  assert.equal(judge(m, 2, 'yes').tag, '약수와 배수 혼동');
  assert.equal(judge(m, 4, 'no').tag, '자기 자신도 배수');
  assert.equal(judge(m, 12, 'no').message, '4 × 3 = 12, 12는 4의 배수예요.');

  const c = stage('common-divisors-12-18');
  assert.equal(judge(c, 4, 'yes').tag, '한 수의 약수만 확인');
  assert.equal(judge(c, 9, 'yes').message, '9는 18의 약수이지만 12의 약수는 아니에요.');
});

test('맞히면 tag가 없고, 모든 카드에 피드백 문장이 있다', () => {
  for (const s of STAGES) {
    for (const x of s.pool) {
      for (const bin of ['yes', 'no']) {
        const r = judge(s, x, bin);
        assert.equal(r.correct, bin === (isYes(s, x) ? 'yes' : 'no'));
        if (r.correct) {
          assert.equal(r.tag, null);
          assert.match(r.message, /^맞아요!/);
        } else {
          assert.ok(r.tag, `${s.id} ${x} ${bin}: tag 없음`);
        }
        assert.doesNotMatch(r.message, /undefined|NaN/);
      }
    }
  }
});
