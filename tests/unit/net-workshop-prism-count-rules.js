/**
 * 도전 "모서리와 꼭짓점" 셈 문항: 보기만 보고(각기둥은 안 보고) 고르는 규칙 — 검사용 독립 코드(저장소의 문제 만들기 코드를 쓰지 않는다).
 * 판정 기준 목록(review-prism-g2 재검토 3의 규칙 목록 표 R3-5 + G2d-1의 셋 — 코디네이터가 굳힘): 자리 P1~P13 · 가장 가까운 두 수 · 평균 · 짝홀 Q1~Q9 ·
 * 보이는 특징 7가지의 하나 · 둘 묶음 T1(n의 배수 차례 "첫째 · 가운데"는 뺌) · N1~N15(N9 · N11은 배울 내용). 규칙 코드는 Review 도구
 * (pcount2 · pcount3 · pcount4 · minimax2 · exact.mjs)의 것을 그대로 옮겼다. 화면에 보이는 주어진 수 n도 특징(nval)에 더했다(기준보다 엄격하게).
 * 꼴마다 판에서 한 자리(K2) · "모서리 셋째 · 꼭짓점 첫째"(K4) 등 꼴 규칙과 지워 가며(K1)는 검사 파일에서 센다.
 * 배울 내용(LEARN — 정답이 늘 n × 3 · n × 2라 생김): n보다 큰 n의 배수 차례 L1 · L2(큰 쪽 0.6 아래) · L3, 3의 배수(N9), 다른 보기의 두 배(N11) — 넉넉한 상한으로 따로.
 */
export const ALL = [0, 1, 2, 3];
const uni = (idx, ai) => (idx.length ? idx.filter((i) => i === ai).length / idx.length : 0.25);
const gapsOf = (v) => [v[1] - v[0], v[2] - v[1], v[3] - v[2]];
const argmax = (a) => a.indexOf(Math.max(...a)); // 같으면 앞의 것
const argmin = (a) => a.indexOf(Math.min(...a));
/** pcount3의 보이는 특징 7가지 */
export function features(v, n, i) {
  const g = gapsOf(v);
  const big = argmax(g);
  const small = argmin(g);
  const mults = ALL.filter((k) => v[k] % n === 0 && v[k] !== n);
  const multKind = v[i] === n ? 'n' : v[i] % n !== 0 ? 'non' : mults.at(-1) === i ? 'mLargest' : mults[0] === i ? 'mFirst' : 'mMid';
  const gapRel = big === i ? 'belowBig' : big + 1 === i ? 'aboveBig' : 'farBig';
  const sgapRel = small === i ? 'belowSmall' : small + 1 === i ? 'aboveSmall' : 'farSmall';
  const mean = v.reduce((a, b) => a + b, 0) / 4;
  const nearMean = argmin(v.map((x) => Math.abs(x - mean))) === i ? 'nearMean' : 'notMean';
  const isos = ALL.map((k) => (k === 0 ? g[0] : k === 3 ? g[2] : Math.min(g[k - 1], g[k])));
  const isoRel = argmax(isos) === i ? 'loneliest' : argmin(isos) === i ? 'crowded' : 'midIso';
  return { pos: `p${i + 1}`, multKind, gapRel, sgapRel, parity: v[i] % 2 === 0 ? 'even' : 'odd', nearMean, isoRel, nval: `n${n}` };
}
// nval(주어진 수 n — 화면의 "한 밑면의 변이 n개")은 Review 목록에 없지만 화면에 보이므로 더한다: "n이 3이면 가장 큰 수" 같은 규칙도 막으려고
export const FEATS = ['pos', 'multKind', 'gapRel', 'sgapRel', 'parity', 'nearMean', 'isoRel', 'nval'];
export const COMBOS = [];
for (let a = 0; a < FEATS.length; a += 1) {
  COMBOS.push([FEATS[a]]);
  for (let b = a + 1; b < FEATS.length; b += 1) COMBOS.push([FEATS[a], FEATS[b]]);
}
const minG = (v) => argmin(gapsOf(v));
const maxG = (v) => argmax(gapsOf(v));
const meanD = (v) => { const m = v.reduce((a, b) => a + b, 0) / 4; return v.map((x) => Math.abs(x - m)); };
const above = (v, n) => ALL.filter((i) => v[i] % n === 0 && v[i] > n);
/** 이름 붙인 규칙 (pcount2 · pcount4 · minimax2) */
export const NAMED = {
  '가장 작은 것 빼고': (v, ai) => uni([1, 2, 3], ai),
  '가장 큰 것 빼고': (v, ai) => uni([0, 1, 2], ai),
  '가운데 둘': (v, ai) => uni([1, 2], ai),
  'n 빼고': (v, ai, n) => uni(ALL.filter((i) => v[i] !== n), ai),
  'n이 보이면 가장 큰 것': (v, ai, n) => (v.includes(n) ? Number(ai === 3) : 0.25),
  '가장 큰 n의 배수': (v, ai, n) => { const m = ALL.filter((i) => v[i] % n === 0); return m.length ? Number(m.at(-1) === ai) : 0.25; },
  '가장 가까운 두 수의 큰 쪽': (v, ai) => Number(minG(v) + 1 === ai),
  '가장 가까운 두 수의 작은 쪽': (v, ai) => Number(minG(v) === ai),
  '가장 가까운 두 수 가운데': (v, ai) => uni([minG(v), minG(v) + 1], ai),
  '이웃과 1~2 차이인 수': (v, ai) => uni(ALL.filter((i) => (i > 0 && v[i] - v[i - 1] <= 2) || (i < 3 && v[i + 1] - v[i] <= 2)), ai),
  '가장 가까운 두 수 빼고': (v, ai) => uni(ALL.filter((i) => i !== minG(v) && i !== minG(v) + 1), ai),
  '가장 큰 간격의 위': (v, ai) => Number(maxG(v) + 1 === ai),
  '가장 큰 간격의 아래': (v, ai) => Number(maxG(v) === ai),
  '가장 큰 간격 옆 빼고': (v, ai) => uni(ALL.filter((i) => i !== maxG(v) && i !== maxG(v) + 1), ai),
  '짝수 가운데': (v, ai) => uni(ALL.filter((i) => v[i] % 2 === 0), ai),
  '홀수 가운데': (v, ai) => uni(ALL.filter((i) => v[i] % 2 === 1), ai),
  '평균에 가장 가까운 수': (v, ai) => { const d = meanD(v); return Number(d.indexOf(Math.min(...d)) === ai); },
  '평균에서 가장 먼 수': (v, ai) => { const d = meanD(v); return Number(d.indexOf(Math.max(...d)) === ai); },
  // 재검토 3의 N 규칙(N9 · N11은 배울 내용 — 아래 LEARN)
  'N1 가장 큰 수와 가장 작은 수의 한가운데에 가장 가까운 수': (v, ai) => { const m = (v[0] + v[3]) / 2; const d = v.map((x) => Math.abs(x - m)); return Number(argmin(d) === ai); },
  'N2 가운데 둘 가운데 평균에 가까운 쪽': (v, ai) => { const d = meanD(v); return Number((d[1] <= d[2] ? 1 : 2) === ai); },
  'N3 1 차이 나는 두 수의 큰 쪽': (v, ai) => { const i = [1, 2, 3].find((k) => v[k] - v[k - 1] === 1); return i == null ? 0.25 : Number(i === ai); },
  'N4 1 차이 나는 두 수의 작은 쪽': (v, ai) => { const i = [0, 1, 2].find((k) => v[k + 1] - v[k] === 1); return i == null ? 0.25 : Number(i === ai); },
  'N5 이웃과 3 넘게 떨어진 수 가운데': (v, ai) => uni(ALL.filter((i) => (i === 0 || v[i] - v[i - 1] > 3) && (i === 3 || v[i + 1] - v[i] > 3)), ai),
  'N6 가장 큰 짝수': (v, ai) => { const e = ALL.filter((i) => v[i] % 2 === 0); return e.length ? Number(e.at(-1) === ai) : 0.25; },
  'N7 가장 작은 짝수': (v, ai) => { const e = ALL.filter((i) => v[i] % 2 === 0); return e.length ? Number(e[0] === ai) : 0.25; },
  'N8 가장 작은 홀수': (v, ai) => { const e = ALL.filter((i) => v[i] % 2 === 1); return e.length ? Number(e[0] === ai) : 0.25; },
  'N10 다른 두 보기의 합인 수': (v, ai) => uni(ALL.filter((i) => ALL.some((a) => ALL.some((b) => a < b && a !== i && b !== i && v[a] + v[b] === v[i]))), ai),
  'N12 다른 보기의 절반인 수': (v, ai) => uni(ALL.filter((i) => ALL.some((a) => a !== i && v[a] === 2 * v[i])), ai),
  'N13 일의 자리가 같은 짝이 있는 수': (v, ai) => uni(ALL.filter((i) => ALL.some((a) => a !== i && v[a] % 10 === v[i] % 10)), ai),
  'N14 다른 보기들과 차이의 합이 가장 작은 수': (v, ai) => { const s = v.map((x) => v.reduce((t, y) => t + Math.abs(x - y), 0)); return Number(argmin(s) === ai); },
  'N15 두 자리 수 가운데 가장 작은 것': (v, ai) => { const t = ALL.filter((i) => v[i] >= 10); return t.length ? Number(t[0] === ai) : 0.25; },
};
/** 배울 내용(n의 배수 차례 — 0.6 아래로 따로): n보다 큰 첫째 · 둘째 배수 */
export const LEARN = {
  'n보다 큰 첫째 배수': (v, ai, n) => { const m = above(v, n); return m.length ? Number(m[0] === ai) : 0.25; },
  'n보다 큰 둘째 배수': (v, ai, n) => { const m = above(v, n); return m.length > 1 ? Number(m[1] === ai) : 0.25; },
  'L3 n보다 큰 n의 배수 가운데': (v, ai, n) => uni(above(v, n), ai),
  'N9 3의 배수 가운데': (v, ai) => uni(ALL.filter((i) => v[i] % 3 === 0), ai),
  'N11 다른 보기의 두 배인 수': (v, ai) => uni(ALL.filter((i) => ALL.some((a) => a !== i && 2 * v[a] === v[i])), ai),
};
/** 특징 묶음 규칙(pcount3): "그 특징 값인 보기 가운데 아무거나" — 그런 보기가 없으면 0.25. n의 배수 차례(mFirst · mMid)가 든 것은 배울 내용이라 뺀다 */
export function tupleRules(v, ai, n) {
  const fs = ALL.map((i) => features(v, n, i));
  const out = {};
  for (const combo of COMBOS) {
    const keys = fs.map((f) => combo.map((k) => f[k]).join('|'));
    for (const val of new Set(keys)) {
      if (combo.includes('multKind') && /mFirst|mMid/.test(val)) continue;
      const idx = ALL.filter((i) => keys[i] === val);
      out[`${combo.join('+')}=${val}`] = idx.includes(ai) ? 1 / idx.length : 0;
    }
  }
  return out;
}
/** 한 문항의 규칙별 맞힐 확률: 이름 규칙 + 특징 묶음 규칙(없는 값은 0.25로 — 부르는 쪽이 채움) */
export function ruleHits(v, ai, n) {
  const out = {};
  for (const [k, f] of Object.entries(NAMED)) out[k] = f(v, ai, n);
  Object.assign(out, tupleRules(v, ai, n));
  return out;
}
