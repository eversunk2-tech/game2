/**
 * 공통 게임 요소: 솜씨 점수·칭호·연속·다시 일어서기·도장(업적). 화면과 상관없는 순수 로직.
 * 기획: docs/design/spec.md 4절 · 사용법: docs/engine.md "솜씨 점수와 도장"
 *
 * 원칙
 * - 학습 행동에만 점수를 준다: 처음에 맞히기, 틀린 뒤 다시 도전해 맞히기, 새로 찾기, 설명하기.
 * - 어떤 보너스도 처음부터 맞힌 것보다 크지 않다. 일부러 틀리거나 찍어서 이득을 볼 수 없다
 *   (tests/unit/rewards.test.js가 무작위 답 순서로 검사한다).
 * - 시간(빠르기)은 점수에 쓰지 않는다. 순위·비교·목숨·뽑기가 없다.
 */

/** 솜씨 점수 표 (spec 4절) */
export const XP = Object.freeze({
  first: 2, //        그 문항을 처음 시도에 맞힘
  retry: 1, //        같은 문항을 틀린 뒤 다시 도전해 맞힘 (처음에 맞힌 것보다 작다)
  bounce: 1, //       틀린 문항 바로 다음 문항을 처음 시도에 맞힘 (다시 일어서기)
  streakEvery: 3, //  처음 시도에 연달아 맞힌 수가 이만큼 될 때마다
  streakBonus: 1, //  … 작은 보너스
  stageClear: 5, //   단계 완료: 그 단계 별이 처음 생겼을 때만
  perStar: 2, //      별이 늘어난 만큼만
  challenge: 10, //   도전 주문서 처음 성공 (단계 완료 +5 대신)
  discover: 5, //     도감에 처음 등록
  explain: 2, //      설명 맞힘 (문항마다 한 번)
});

/** 엔진 기본 칭호와 기준 점수. 게임이 rewards.ranks·thresholds로 바꾼다. */
export const DEFAULT_RANKS = Object.freeze(['새싹', '탐험가', '해결사', '척척박사', '으뜸 박사']);
export const DEFAULT_THRESHOLDS = Object.freeze([0, 40, 100, 180, 300]);

/** 엔진 기본 도장 6개. 모두 처음부터 "어떻게 받는지" 보인다(숨은 도장 없음). */
export const DEFAULT_BADGES = Object.freeze([
  {
    id: 'first-step',
    title: '첫 발걸음',
    desc: '첫 단계를 마쳐요',
    icon: 'flag',
    test: (s) => s.clearedCount >= 1,
  },
  {
    id: 'sharp-eye',
    title: '꼼꼼한 눈',
    desc: '한 단계에서 4번 이상 답하고 모두 처음에 맞혀요',
    icon: 'search',
    test: (s) => Boolean(s.play?.cleared) && s.play.attempts >= 4 && s.play.wrong === 0,
  },
  {
    id: 'try-again',
    title: '끝까지 다시',
    desc: '틀린 문제를 다시 도전해 3번 맞혀요',
    icon: 'undo',
    test: (s) => s.counters.retryFix >= 3,
  },
  {
    id: 'bounce-back',
    title: '다시 일어서기',
    desc: '틀린 바로 다음 문제를 5번 맞혀요',
    icon: 'rise',
    test: (s) => s.counters.bounce >= 5,
  },
  {
    id: 'lesson-done',
    title: '차시 완주',
    desc: '한 차시의 단계를 모두 마쳐요',
    icon: 'book',
    test: (s) => s.lessons.some((l) => l.ids.length > 0 && l.ids.every((id) => (s.stars[id] ?? 0) > 0)),
  },
  {
    id: 'all-stars',
    title: '별 부자',
    desc: '한 차시의 단계를 모두 별 3개로 마쳐요',
    icon: 'star',
    test: (s) => s.lessons.some((l) => l.ids.length > 0 && l.ids.every((id) => (s.stars[id] ?? 0) >= 3)),
  },
]);

export const COUNTER_NAMES = Object.freeze(['bounce', 'retryFix', 'explain', 'inspect', 'discover']);

// ── 답 하나하나: 맞힘·다시 도전·다시 일어서기·연속 ─────────────

/**
 * 한 판의 답을 차례로 받아 솜씨 점수를 계산한다.
 *
 * - 문항은 itemId로 구분한다. itemId가 없으면 "바로 앞 답이 틀린 답(이것도 itemId 없음)이면 같은 문항을 다시 푼 것",
 *   아니면 새 문항으로 본다(점수를 더 주는 쪽으로 잘못 읽지 않게).
 * - 처음 시도에 맞힘 +2 · 틀림 0 · 같은 문항을 다시 도전해 맞힘 +1 · 이미 맞힌 문항을 또 답함 0
 * - 다시 일어서기 +1: 어떤 문항을 처음 시도에 틀린 뒤, 다음 새 문항을 처음 시도에 맞혔을 때(틀린 문항 하나마다 한 번까지)
 * - 연속: 처음 시도에 연달아 맞힌 수. 3번마다 +1. 틀리면 조용히 0. 다시 도전해 맞힌 것은 연속에 넣지 않는다.
 */
export function createAnswerTracker() {
  const items = new Map();
  let synthetic = 0;
  let lastWasNullWrong = false;
  let lastKey = null;
  let streak = 0;
  let armed = false;
  const totals = { attempts: 0, correct: 0, wrong: 0, items: 0, firstTry: 0, retryFix: 0, bounce: 0, streakBonus: 0, bestStreak: 0, xp: 0 };

  function keyFor(itemId) {
    if (itemId != null) return `id:${String(itemId)}`;
    if (lastWasNullWrong && lastKey) return lastKey;
    synthetic += 1;
    return `#${synthetic}`;
  }

  /** 답 하나 → 이번에 생긴 일 { kind: 'first'|'retry'|'wrong'|'repeat', xp, bounce, streak, streakBonus } */
  function answer({ itemId = null, correct } = {}) {
    const ok = Boolean(correct);
    const key = keyFor(itemId);
    lastKey = key;
    lastWasNullWrong = itemId == null && !ok;
    totals.attempts += 1;
    if (ok) totals.correct += 1;
    else totals.wrong += 1;

    const step = { kind: 'repeat', xp: 0, bounce: false, streak: 0, streakBonus: false };
    const item = items.get(key);
    if (!item) {
      totals.items += 1;
      if (ok) {
        items.set(key, { solved: true });
        step.kind = 'first';
        step.xp += XP.first;
        totals.firstTry += 1;
        streak += 1;
        totals.bestStreak = Math.max(totals.bestStreak, streak);
        if (streak % XP.streakEvery === 0) {
          step.streakBonus = true;
          step.xp += XP.streakBonus;
          totals.streakBonus += 1;
        }
        if (armed) {
          armed = false;
          step.bounce = true;
          step.xp += XP.bounce;
          totals.bounce += 1;
        }
      } else {
        items.set(key, { solved: false });
        step.kind = 'wrong';
        streak = 0;
        armed = true;
      }
    } else if (item.solved) {
      // 이미 맞힌 문항을 또 답함: 점수 없음. 틀리면 연속만 끊긴다.
      if (!ok) streak = 0;
    } else if (ok) {
      item.solved = true;
      step.kind = 'retry';
      step.xp += XP.retry;
      totals.retryFix += 1;
    } else {
      step.kind = 'wrong';
      streak = 0;
    }
    step.streak = streak;
    totals.xp += step.xp;
    return step;
  }

  return {
    answer,
    streak: () => streak,
    /** 다음 새 문항을 처음에 맞히면 다시 일어서기 +1을 받을 수 있는지 */
    bounceReady: () => armed,
    totals: () => ({ ...totals, streak }),
  };
}

/** 답 목록 전체의 솜씨 점수(테스트·기록용). createAnswerTracker와 같은 규칙. */
export function scoreAnswers(answers) {
  const tracker = createAnswerTracker();
  for (const a of answers) tracker.answer(a);
  return tracker.totals();
}

// ── 한 판 전체: 답 + 학습 행동 이벤트 ───────────────────────

/** 다시 하기 점수 규칙: 판을 시작할 때 그 단계 별이 이만큼이면 연습 점수가 없다 (docs/design/spec.md "결정" 다시 하기 점수) */
export const MASTERED_STARS = 3;

/** 판을 시작할 때의 별 수로 연습 점수(처음 맞힘·다시 도전·다시 일어서기·연속·설명)를 줄지 정한다 */
export const practiceAllowed = (startStars = 0) => (Number(startStars) || 0) < MASTERED_STARS;

/**
 * 한 판(단계 하나를 플레이하는 동안)의 솜씨 점수.
 * answer(): 답, event('explain'|'inspect', data): 학습 행동, discovered(): 도감에 새로 등록(+5는 바로 저장된다)
 * startStars: 판을 시작할 때 그 단계의 별. 이미 별 3개인 단계를 다시 하면 연습 점수(답·연속·다시 일어서기·설명)는 0이다.
 *   별이 3개가 안 된 단계는 그대로 준다(복습 보상). 이번 판에서 처음 별 3개를 받아도 이번 판 점수는 준다(시작할 때 기준).
 *   새로 찾음(+5)은 원래 처음 한 번뿐이라 별과 상관없이 준다.
 */
export function createPlayReward({ startStars = 0 } = {}) {
  const practice = practiceAllowed(startStars);
  const tracker = createAnswerTracker();
  const explained = new Set();
  const explain = { count: 0, xp: 0 };
  const discover = { count: 0, xp: 0 };
  let inspect = 0;

  return {
    /** 답 하나 → 이번에 생긴 일. 연습 점수가 없는 판이면 xp는 0 (연속 수·종류는 그대로) */
    answer: (entry) => {
      const step = tracker.answer(entry);
      return practice ? step : { ...step, xp: 0 };
    },
    streak: () => tracker.streak(),
    bounceReady: () => tracker.bounceReady(),
    /** 이 판에서 연습 점수를 주는지 (시작할 때 별 3개였으면 false) */
    practice: () => practice,
    /**
     * 학습 행동 알림. 점수를 주는 것은 'explain'(맞혔을 때, 문항마다 한 번)뿐이다. → 이번에 받은 점수
     * explain은 itemId가 꼭 있어야 한다. 없으면 어느 문항의 설명인지 몰라 반복으로 쌓일 수 있으므로 점수·횟수 모두 없다.
     */
    event(name, data = {}) {
      if (name === 'explain') {
        if (!data?.correct || data.itemId == null) return 0;
        const key = String(data.itemId);
        if (explained.has(key)) return 0;
        explained.add(key);
        const xp = practice ? XP.explain : 0;
        explain.count += 1;
        explain.xp += xp;
        return xp;
      }
      if (name === 'inspect') inspect += 1;
      return 0;
    },
    discovered() {
      discover.count += 1;
      discover.xp += XP.discover;
      return XP.discover;
    },
    /** 지금까지 이 판에서 받은 점수 (단계 완료·별 점수는 아직 없음) */
    xp: () => (practice ? tracker.totals().xp : 0) + explain.xp + discover.xp,
    /** answers.xp는 이 판에서 실제로 받은 답 점수(연습 점수가 없는 판이면 0). practice: 연습 점수를 주는 판인지 */
    summary: () => {
      const answers = tracker.totals();
      return { answers: practice ? answers : { ...answers, xp: 0 }, explain: { ...explain }, discover: { ...discover }, inspect, practice };
    },
  };
}

/**
 * 단계를 마칠 때의 점수: 단계 완료 +5(도전 주문서는 +10)와 별 +2개씩.
 * 같은 단계를 다시 해서 쌓지 못하게, 그 단계의 별이 늘어났을 때만 준다(단계 완료는 별이 처음 생겼을 때만).
 */
export function stageXp({ prevStars = 0, stars = 0, cleared = true, challenge = false }) {
  const before = Math.max(0, Number(prevStars) || 0);
  const after = cleared ? Math.max(0, Number(stars) || 0) : 0;
  const firstClear = cleared && before === 0 && after > 0;
  const gained = Math.max(0, after - before);
  const clearXp = firstClear ? (challenge ? XP.challenge : XP.stageClear) : 0;
  return { firstClear, newStars: gained, clearXp, starXp: gained * XP.perStar, total: clearXp + gained * XP.perStar };
}

// ── 칭호 ─────────────────────────────────────────

/** ranks·thresholds 검사. 문제가 없으면 { ranks, thresholds }, 있으면 오류 */
export function normalizeRanks({ ranks = DEFAULT_RANKS, thresholds = DEFAULT_THRESHOLDS } = {}) {
  if (!Array.isArray(ranks) || ranks.length === 0 || !ranks.every((r) => typeof r === 'string' && r.trim())) {
    throw new Error('rewards.ranks는 칭호 이름 배열이에요.');
  }
  if (!Array.isArray(thresholds) || thresholds.length !== ranks.length) {
    throw new Error('rewards.thresholds는 칭호와 같은 개수의 기준 점수예요.');
  }
  if (thresholds[0] !== 0 || thresholds.some((t, i) => !Number.isFinite(t) || (i > 0 && t <= thresholds[i - 1]))) {
    throw new Error('rewards.thresholds는 0부터 커지는 순서예요.');
  }
  return { ranks: [...ranks], thresholds: [...thresholds] };
}

/** 솜씨 점수 → 칭호. progress는 지금 칭호에서 다음 칭호까지 채운 비율(0~1) */
export function rankOf(xp, { ranks = DEFAULT_RANKS, thresholds = DEFAULT_THRESHOLDS } = {}) {
  const points = Math.max(0, Math.floor(Number(xp) || 0));
  let index = 0;
  for (let i = 0; i < thresholds.length; i += 1) if (points >= thresholds[i]) index = i;
  const floor = thresholds[index];
  const nextAt = thresholds[index + 1];
  const next = nextAt == null ? null : { name: ranks[index + 1], at: nextAt };
  return {
    index,
    name: ranks[index],
    count: ranks.length,
    xp: points,
    next,
    toNext: next ? next.at - points : 0,
    progress: next ? (points - floor) / (next.at - floor) : 1,
  };
}

// ── 도장(업적) ───────────────────────────────────

/** 게임 도장 정의 검사 + 엔진 기본 도장과 합치기 */
export function normalizeBadges(extra = []) {
  if (!Array.isArray(extra)) throw new Error('rewards.badges는 배열이에요.');
  const all = [...DEFAULT_BADGES];
  for (const b of extra) {
    if (!b?.id || !b?.title || !b?.desc || typeof b.test !== 'function') {
      throw new Error('rewards.badges: 도장마다 id, title, desc, test(state)가 필요해요.');
    }
    if (all.some((x) => x.id === b.id)) throw new Error(`rewards.badges: 도장 id가 겹쳐요 (${b.id}).`);
    all.push({ icon: 'stamp', ...b });
  }
  return all;
}

/**
 * 도장 test(state)에 주는 상태 (design/spec.md 4절: 기록·이벤트 횟수·도감).
 *   stars: { 단계 id: 별 }, clearedCount: 별이 있는 단계 수, lessons: [{ id, ids(일반 단계 id) }],
 *   counters: { bounce, retryFix, explain, inspect, discover }, collections: { id: { count, total, found: [칸 id] } },
 *   records: 학습 기록(방금 마친 판 포함) [{ stageId, cleared, stars, answers: [{ itemId, correct, given, expected, tag }] }],
 *   xp, play: 방금 마친 판 { stageId, attempts, correct, wrong, firstTry, cleared, stars, challenge } 또는 null
 */
export function badgeState({ stars = {}, lessons = [], counters = {}, collections = {}, records = [], xp = 0, play = null }) {
  const counts = Object.fromEntries(COUNTER_NAMES.map((n) => [n, Number(counters[n]) || 0]));
  const list = (v) => (Array.isArray(v) ? v : []);
  return {
    stars: { ...stars },
    clearedCount: Object.values(stars).filter((n) => n > 0).length,
    lessons: lessons.map((l) => ({ id: l.id, ids: [...l.ids] })),
    counters: counts,
    collections: Object.fromEntries(Object.entries(collections).map(([id, c]) => [id, { count: 0, total: 0, ...c, found: [...list(c?.found)] }])),
    records: list(records).map((r) => ({
      stageId: r?.stageId ?? null,
      cleared: Boolean(r?.cleared),
      stars: Number(r?.stars) || 0,
      answers: list(r?.answers).map((a) => ({
        itemId: a?.itemId ?? null, correct: Boolean(a?.correct), given: a?.given ?? null, expected: a?.expected ?? null, tag: a?.tag ?? null,
      })),
    })),
    xp,
    play: play ? { ...play } : null,
  };
}

/**
 * 아직 받지 않은 도장 중 조건을 채운 것. test가 오류를 내면 받지 않은 것으로 본다(onError로 알림).
 * → 새로 받은 도장 정의 목록
 */
export function evaluateBadges(defs, state, earned = {}, { onError = null } = {}) {
  const fresh = [];
  for (const def of defs) {
    if (earned[def.id]) continue;
    let ok = false;
    try {
      ok = Boolean(def.test(state));
    } catch (error) {
      onError?.(error, def);
    }
    if (ok) fresh.push(def);
  }
  return fresh;
}

// ── 저장 (createStorage(game.id)의 'rewards') ─────────────

/** 저장된 값을 안전한 모양으로. 깨진 값은 비운다. */
export function normalizeRewardState(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const counters = {};
  for (const name of COUNTER_NAMES) counters[name] = Math.max(0, Math.floor(Number(obj(r.counters)[name]) || 0));
  const badges = {};
  for (const [id, v] of Object.entries(obj(r.badges))) if (v && typeof v === 'object') badges[id] = { at: Number(v.at) || 0 };
  const best = {};
  for (const [id, v] of Object.entries(obj(r.best))) if (Number(v?.ms) > 0) best[id] = { ms: Math.round(Number(v.ms)) };
  return { v: 1, xp: Math.max(0, Math.floor(Number(r.xp) || 0)), badges, counters, best };
}

/**
 * 게임 하나의 솜씨 점수·도장·연속 기록 저장소.
 * rank 이름도 함께 저장한다(게임 모음 "이어 하기"에 보이기 위해. 점수로 다시 계산할 수 있는 값).
 */
export function createRewardStore({ storage = null, ranks = DEFAULT_RANKS, thresholds = DEFAULT_THRESHOLDS, now = () => Date.now() } = {}) {
  let state = normalizeRewardState(storage?.get('rewards', null));
  const rankConfig = { ranks, thresholds };
  const save = () => storage?.set('rewards', { ...state, rank: rankOf(state.xp, rankConfig).name });

  return {
    xp: () => state.xp,
    rank: (xp = state.xp) => rankOf(xp, rankConfig),
    counters: () => ({ ...state.counters }),
    badges: () => ({ ...state.badges }),
    best: (stageId) => state.best[stageId]?.ms ?? null,
    addXp(n) {
      const add = Math.max(0, Math.floor(Number(n) || 0));
      if (add === 0) return state.xp;
      state.xp += add;
      save();
      return state.xp;
    },
    addCounters(counts = {}) {
      let changed = false;
      for (const name of COUNTER_NAMES) {
        const add = Math.max(0, Math.floor(Number(counts[name]) || 0));
        if (add > 0) {
          state.counters[name] += add;
          changed = true;
        }
      }
      if (changed) save();
    },
    earn(ids) {
      const at = now();
      for (const id of ids) state.badges[id] = { at };
      if (ids.length) save();
    },
    /** 시간 재기 기록(점수 없음). → { ms, prevMs(지난 최고 기록 또는 null) } */
    recordTime(stageId, ms) {
      const prevMs = state.best[stageId]?.ms ?? null;
      const value = Math.max(0, Math.round(Number(ms) || 0));
      if (value > 0 && (prevMs == null || value < prevMs)) {
        state.best[stageId] = { ms: value };
        save();
      }
      return { ms: value, prevMs };
    },
    reset() {
      state = normalizeRewardState(null);
      save();
    },
  };
}
