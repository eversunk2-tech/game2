/**
 * 한국어 조사 고르기. 문제·피드백 문장을 코드로 만들 때
 * "12을" 같은 어색한 문장이 나오지 않게 한다.
 *
 *   josa('사과', '을/를')  → '사과를'
 *   josa(6, '은/는')       → '6은'   (육)
 *   josa('3/4', '이/가')   → '3/4이' (사분의 삼)
 *   josa('서울', '으로/로') → '서울로'
 */

const JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

// 영 일 이 삼 사 오 육 칠 팔 구
const DIGIT_FINAL = ['ㅇ', 'ㄹ', '', 'ㅁ', '', '', 'ㄱ', 'ㄹ', 'ㄹ', ''];

// 숫자 뒤에 붙는 단위를 읽는 소리 (긴 것부터 검사)
const UNIT_FINAL = [
  ['cm²', ''], ['cm³', ''], ['m²', ''], ['m³', ''],
  ['mm', ''], ['cm', ''], ['km', ''], ['kg', 'ㅁ'], ['mL', ''],
  ['m', ''], ['g', 'ㅁ'], ['L', ''], ['°C', ''], ['℃', ''], ['%', ''],
];

const BATCHIM_FORMS = new Set(['은', '이', '을', '과', '으로', '아', '이에요', '이랑', '이나', '이라', '이라고', '이며', '이다']);

function integerFinal(digits) {
  const n = digits.replace(/^0+(?=\d)/, '');
  if (/^0+$/.test(n)) return 'ㅇ';
  const zeros = n.length - n.replace(/0+$/, '').length;
  if (zeros === 0) return DIGIT_FINAL[Number(n[n.length - 1])];
  // 끝이 0이면 마지막으로 읽는 자릿값: 십 백 천 / 만 억 조
  if (zeros >= 4) return ['', 'ㄴ', 'ㄱ', ''][Math.min(Math.floor(zeros / 4), 3)];
  return ['', 'ㅂ', 'ㄱ', 'ㄴ'][zeros];
}

function numberFinal(text) {
  // 분수 a/b는 "b분의 a"로 읽으므로 분자가 마지막 소리
  const fraction = text.match(/(\d+)\s*\/\s*\d+$/);
  if (fraction) return integerFinal(fraction[1]);
  // 소수점 아래는 한 자리씩 읽는다 (0.25 → 영 점 이 오)
  if (/\.\d+$/.test(text)) return DIGIT_FINAL[Number(text[text.length - 1])];
  return integerFinal(text.match(/(\d+)$/)[1]);
}

/** 낱말의 마지막 받침(없으면 '')을 돌려준다. */
export function finalSound(word) {
  const text = String(word).replace(/[\s)\]}'"”’]+$/u, '');
  if (!text) return '';

  for (const [unit, final] of UNIT_FINAL) {
    if (text.endsWith(unit) && /[\d\s]$/.test(text.slice(0, -unit.length))) return final;
  }

  const last = text[text.length - 1];
  const code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return JONG[(code - 0xac00) % 28];
  if (/\d/.test(last)) return numberFinal(text);

  // 영문자는 읽는 소리로 대략 판단 (엘·알 → ㄹ, 엠 → ㅁ, 엔 → ㄴ)
  const lower = last.toLowerCase();
  if (lower === 'l' || lower === 'r') return 'ㄹ';
  if (lower === 'm') return 'ㅁ';
  if (lower === 'n') return 'ㄴ';
  return '';
}

export function hasFinalSound(word) {
  return finalSound(word) !== '';
}

/** word 뒤에 알맞은 조사를 붙여 돌려준다. pair 예: '은/는', '이/가', '을/를', '과/와', '으로/로', '이에요/예요' */
export function josa(word, pair) {
  const [a, b] = pair.split('/');
  if (b === undefined) throw new Error(`josa: '은/는'처럼 두 형태를 / 로 나눠 주세요. (받은 값: ${pair})`);
  const withFinal = BATCHIM_FORMS.has(a) ? a : b;
  const withoutFinal = withFinal === a ? b : a;
  const final = finalSound(word);
  let particle;
  if (withFinal === '으로' && final === 'ㄹ') particle = withoutFinal;
  else particle = final ? withFinal : withoutFinal;
  return `${word}${particle}`;
}
