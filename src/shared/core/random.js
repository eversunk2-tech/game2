/**
 * 시드 고정 난수. 같은 시드면 같은 문제가 나오므로
 * 테스트와 "?seed=" 주소 옵션(모두 같은 문제로 수업하기)에 쓴다.
 */

function toSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
  // 문자열 시드는 FNV-1a 해시로 숫자로 바꾼다.
  const text = String(seed);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createRng(seed = Date.now()) {
  let state = toSeed(seed);

  // mulberry32
  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function int(min, max) {
    return min + Math.floor(next() * (max - min + 1));
  }

  function pick(list) {
    return list[Math.floor(next() * list.length)];
  }

  function shuffle(list) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  function sample(list, count) {
    return shuffle(list).slice(0, count);
  }

  return { seed, next, int, pick, shuffle, sample };
}
