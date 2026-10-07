/**
 * 예시 게임의 규칙(화면과 분리된 순수 함수). tests/unit/sample-divisor-sort.test.js 에서 검사한다.
 * 화면 코드(main.js)는 이 파일의 STAGES, binsFor, makeCards, judge만 쓴다.
 */
import { josa } from '../../shared/core/korean.js';

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/**
 * kind: 'divisor'(n의 약수) | 'multiple'(n의 배수) | 'common-divisor'(a와 b의 공약수)
 * must: 자주 틀리는 수라서 꼭 나오게 할 카드
 */
export const STAGES = [
  {
    id: 'divisors-of-12',
    title: '12의 약수',
    goal: '12를 나누어떨어지게 하는 수를 찾아 넣어요.',
    kind: 'divisor',
    n: 12,
    pool: range(1, 15),
    must: [1, 12],
    yesCount: 5,
    noCount: 4,
  },
  {
    id: 'multiples-of-4',
    title: '4의 배수',
    goal: '4를 1배, 2배, 3배, … 한 수를 찾아 넣어요.',
    kind: 'multiple',
    n: 4,
    pool: range(1, 40),
    must: [4, 2],
    yesCount: 4,
    noCount: 4,
  },
  {
    id: 'common-divisors-12-18',
    title: '12와 18의 공약수',
    goal: '12와 18을 모두 나누어떨어지게 하는 수를 찾아 넣어요.',
    kind: 'common-divisor',
    a: 12,
    b: 18,
    pool: range(1, 18),
    must: [4, 9],
    yesCount: 4,
    noCount: 4,
  },
];

export function stageName(stage) {
  if (stage.kind === 'divisor') return `${stage.n}의 약수`;
  if (stage.kind === 'multiple') return `${stage.n}의 배수`;
  return `${josa(stage.a, '과/와')} ${stage.b}의 공약수`;
}

export function isYes(stage, x) {
  if (stage.kind === 'divisor') return stage.n % x === 0;
  if (stage.kind === 'multiple') return x % stage.n === 0;
  return stage.a % x === 0 && stage.b % x === 0;
}

export function binsFor(stage) {
  const name = stageName(stage);
  return [
    { id: 'yes', label: name },
    { id: 'no', label: `${josa(name, '이/가')} 아닌 수` },
  ];
}

/** 이번 판에 쓸 수 카드. must에 있는 수를 먼저 넣고 나머지는 무작위로 채운다. */
export function makeCards(stage, rng) {
  const must = stage.must ?? [];
  const pickFrom = (list, count) => {
    const forced = must.filter((x) => list.includes(x));
    const rest = rng.shuffle(list.filter((x) => !forced.includes(x)));
    return [...forced, ...rest].slice(0, count);
  };
  const yes = stage.pool.filter((x) => isYes(stage, x));
  const no = stage.pool.filter((x) => !isYes(stage, x));
  const chosen = [...pickFrom(yes, stage.yesCount), ...pickFrom(no, stage.noCount)];
  return rng.shuffle(chosen).map((value) => ({ value, answer: isYes(stage, value) ? 'yes' : 'no' }));
}

const div = (a, b) => `${a} ÷ ${b} = ${Math.floor(a / b)}`;
const divRem = (a, b) => `${a} ÷ ${b} = ${Math.floor(a / b)} … ${a % b}`;

function judgeDivisor({ n }, x, yes, correct) {
  if (yes) {
    if (correct) return { message: `맞아요! ${div(n, x)}, 나누어떨어져요.` };
    let message = `${div(n, x)}, 나누어떨어지니까 ${josa(x, '은/는')} ${n}의 약수예요.`;
    if (x === 1) message += ' 1은 모든 수의 약수예요.';
    if (x === n) message += ' 어떤 수든 자기 자신의 약수예요.';
    return { message, tag: x === 1 || x === n ? '1과 자기 자신도 약수' : '약수를 놓침' };
  }
  if (x > n) {
    if (correct) return { message: `맞아요! ${josa(x, '은/는')} ${n}보다 커서 ${n}의 약수가 될 수 없어요.` };
    return { message: `${josa(x, '은/는')} ${n}보다 커요. 어떤 수의 약수는 그 수보다 클 수 없어요.`, tag: '약수는 그 수보다 클 수 없음' };
  }
  if (correct) return { message: `맞아요! ${divRem(n, x)}, 나머지가 있어요.` };
  return {
    message: `${divRem(n, x)}, 나머지가 있으니까 ${josa(x, '은/는')} ${n}의 약수가 아니에요.`,
    tag: '나누어떨어지지 않는 수를 약수로 고름',
  };
}

function judgeMultiple({ n }, x, yes, correct) {
  if (yes) {
    const k = x / n;
    if (correct) return { message: `맞아요! ${n} × ${k} = ${x}` };
    let message = `${n} × ${k} = ${x}, ${josa(x, '은/는')} ${n}의 배수예요.`;
    if (x === n) message += ' 자기 자신(1배)도 배수예요.';
    return { message, tag: x === n ? '자기 자신도 배수' : '배수를 놓침' };
  }
  if (x < n && n % x === 0) {
    const explain = `${josa(x, '은/는')} ${n}의 약수예요. ${n}의 배수는 ${n}, ${n * 2}, ${n * 3}, …처럼 ${josa(n, '을/를')} 1배, 2배, 3배 한 수예요.`;
    if (correct) return { message: `맞아요! ${explain}` };
    return { message: explain, tag: '약수와 배수 혼동' };
  }
  if (x < n) {
    if (correct) return { message: `맞아요! ${josa(x, '은/는')} ${n}보다 작아서 ${n}의 배수가 될 수 없어요.` };
    return { message: `${josa(x, '은/는')} ${n}보다 작아요. ${n}의 배수는 ${n}부터 시작해요.`, tag: '배수가 아닌 수를 배수로 고름' };
  }
  if (correct) return { message: `맞아요! ${divRem(x, n)}, 나누어떨어지지 않아요.` };
  return {
    message: `${divRem(x, n)}, 나누어떨어지지 않으니까 ${josa(x, '은/는')} ${n}의 배수가 아니에요.`,
    tag: '배수가 아닌 수를 배수로 고름',
  };
}

function judgeCommonDivisor({ a, b }, x, yes, correct) {
  if (yes) {
    if (correct) return { message: `맞아요! ${div(a, x)}, ${div(b, x)}` };
    let message = `${div(a, x)}, ${div(b, x)}, 둘 다 나누어떨어지니까 ${josa(x, '은/는')} 공약수예요.`;
    if (x === 1) message += ' 1은 모든 수의 공약수예요.';
    return { message, tag: x === 1 ? '1은 모든 수의 공약수' : '공약수를 놓침' };
  }
  const divA = a % x === 0;
  const divB = b % x === 0;
  let explain;
  if (divA) explain = `${josa(x, '은/는')} ${a}의 약수이지만 ${b}의 약수는 아니에요.`;
  else if (divB) explain = `${josa(x, '은/는')} ${b}의 약수이지만 ${a}의 약수는 아니에요.`;
  else explain = `${josa(x, '은/는')} ${a}의 약수도, ${b}의 약수도 아니에요.`;
  if (correct) return { message: `맞아요! ${explain}` };
  return { message: explain, tag: divA || divB ? '한 수의 약수만 확인' : '공약수가 아닌 수를 공약수로 고름' };
}

const JUDGES = { divisor: judgeDivisor, multiple: judgeMultiple, 'common-divisor': judgeCommonDivisor };

/** 카드(value)를 상자(binId)에 넣었을 때의 판정과 피드백 문장 */
export function judge(stage, value, binId) {
  const yes = isYes(stage, value);
  const expected = yes ? 'yes' : 'no';
  const correct = binId === expected;
  const { message, tag = null } = JUDGES[stage.kind](stage, value, yes, correct);
  return { correct, expected, tag: correct ? null : tag, message };
}
