/**
 * 단계 진행 상황: 단계별 최고 별 개수, 단계 잠금 해제.
 * 앞 단계를 별 1개 이상으로 마치면 다음 단계가 열린다.
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

export function createProgress({ stageIds, storage = null, unlockAll = false }) {
  const loaded = storage?.get('stars', {});
  let stars = loaded && typeof loaded === 'object' ? { ...loaded } : {};

  const save = () => storage?.set('stars', stars);
  const getStars = (id) => stars[id] ?? 0;
  const isCleared = (id) => getStars(id) > 0;

  function isUnlocked(id) {
    const index = stageIds.indexOf(id);
    if (index < 0) return false;
    if (unlockAll || index === 0) return true;
    return isCleared(stageIds[index - 1]);
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

  function nextStageId(id) {
    const index = stageIds.indexOf(id);
    return index >= 0 && index + 1 < stageIds.length ? stageIds[index + 1] : null;
  }

  function totalStars() {
    return stageIds.reduce((sum, id) => sum + getStars(id), 0);
  }

  function reset() {
    stars = {};
    save();
  }

  return {
    getStars,
    isCleared,
    isUnlocked,
    record,
    nextStageId,
    totalStars,
    maxStars: stageIds.length * MAX_STARS,
    reset,
  };
}
