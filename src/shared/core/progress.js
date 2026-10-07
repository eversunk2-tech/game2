/**
 * 단계 진행 상황: 단계별 최고 별 개수, 단계 잠금 해제.
 * 앞 단계를 별 1개 이상으로 마치면 다음 단계가 열린다.
 * openIds의 단계(차시 묶음마다 첫 단계)는 처음부터 열려 있다.
 *
 * optionalIds(도전 주문서 단계)는 선택 활동이다.
 * - 다음 단계를 막지 않는다(일반 단계의 "앞 단계"는 앞에 있는 일반 단계).
 * - 같은 묶음(차시)의 일반 단계를 모두 마치면 열린다. 묶음은 stageIds 순서에서 openIds마다 새로 시작한다.
 * - 모은 별 합계(totalStars)와 최대 별(maxStars)에 넣지 않는다.
 */

export const MAX_STARS = 3;

/** 정답률(0~1)로 별 개수를 정한다. 마친 단계는 최소 1개. */
export function starsFromAccuracy(accuracy, { three = 0.9, two = 0.7 } = {}) {
  if (accuracy == null || Number.isNaN(accuracy)) return 1;
  if (accuracy >= three) return 3;
  if (accuracy >= two) return 2;
  return 1;
}

export function clampStars(stars) {
  const n = Math.round(Number(stars));
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_STARS, Math.max(0, n));
}

export function createProgress({ stageIds, storage = null, unlockAll = false, openIds = [], optionalIds = [] }) {
  const open = new Set(openIds);
  const optional = new Set(optionalIds);
  const regularIds = stageIds.filter((id) => !optional.has(id));
  const loaded = storage?.get('stars', {});
  let stars = loaded && typeof loaded === 'object' ? { ...loaded } : {};

  const save = () => storage?.set('stars', stars);
  const getStars = (id) => stars[id] ?? 0;
  const isCleared = (id) => getStars(id) > 0;
  const isOptional = (id) => optional.has(id);

  /** 그 단계가 속한 묶음(첫 단계 또는 openIds에서 시작해 다음 openIds 앞까지)의 단계 id */
  function groupOf(index) {
    let start = index;
    while (start > 0 && !open.has(stageIds[start])) start -= 1;
    let end = index + 1;
    while (end < stageIds.length && !open.has(stageIds[end])) end += 1;
    return stageIds.slice(start, end);
  }

  function isUnlocked(id) {
    const index = stageIds.indexOf(id);
    if (index < 0) return false;
    if (unlockAll) return true;
    if (optional.has(id)) return groupOf(index).filter((x) => !optional.has(x)).every(isCleared);
    if (index === 0 || open.has(id)) return true;
    // 앞에 있는 일반 단계 (도전 단계는 건너뛴다)
    for (let i = index - 1; i >= 0; i -= 1) {
      if (!optional.has(stageIds[i])) return isCleared(stageIds[i]);
      if (open.has(stageIds[i])) break;
    }
    return true;
  }

  /** 이번 결과를 기록한다. 이전보다 좋을 때만 바꾼다. */
  function record(id, value) {
    const next = clampStars(value);
    if (next > getStars(id)) {
      stars[id] = next;
      save();
    }
    return getStars(id);
  }

  /** 다음 일반 단계 (도전 단계는 건너뛴다. 도전 단계 다음은 없음) */
  function nextStageId(id) {
    const index = stageIds.indexOf(id);
    if (index < 0 || optional.has(id)) return null;
    for (let i = index + 1; i < stageIds.length; i += 1) if (!optional.has(stageIds[i])) return stageIds[i];
    return null;
  }

  function totalStars() {
    return regularIds.reduce((sum, id) => sum + getStars(id), 0);
  }

  function reset() {
    stars = {};
    save();
  }

  return {
    getStars,
    isCleared,
    isUnlocked,
    isOptional,
    record,
    nextStageId,
    totalStars,
    maxStars: regularIds.length * MAX_STARS,
    /** 모든 단계의 별 (도장 판정용) */
    allStars: () => ({ ...stars }),
    reset,
  };
}
