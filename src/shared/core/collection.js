/**
 * 도감 틀: 여러 가지를 새로 찾으면 칸이 하나씩 찬다. 화면과 상관없는 순수 로직.
 * 게임이 createGameApp({ collections })로 도감(칸 목록)을 주고, 플레이 중 ctx.collect(id, itemId)로 등록한다.
 * 저장 모양 (createStorage(game.id)의 'collections'): { 도감 id: { 칸 id: { at, stage } } }
 *
 * 도감 정의의 선택 값
 *   xp: 처음 등록할 때 주는 솜씨 점수 (0~5 정수, 기본 5)
 *   label: 짧은 이름(예: '노트'). 있으면 "도감 n / m" 칩에 합치지 않고 따로 "노트 n / m"으로 보인다
 *   icon: label 칩에 쓸 아이콘 이름(없으면 책)
 *   quiet: true면 화면에 보이지 않는 모음 — 칩·도감 화면·결과 복사에 나오지 않고 "새로 찾았어요" 안내도 없다.
 *     저장과 점수는 다른 도감과 같다(ctx.collect · ctx.collection, 도장 판정의 collections). 칸이 너무 많아 도감으로 보여 주지 않지만
 *     "이 기기에서 한 번만 점수"를 지키려고 찾은 것을 적어 둬야 할 때 쓴다(예: 직육면체 전개도 54가지) — 가지 수는 게임이 보여 준다
 *   xpAfter: { count, xp } — 칸이 count개 찬 뒤에(count + 1번째 칸부터) 처음 등록하는 칸은 xp 대신 이 점수를 준다(0~xp 사이 정수).
 *     칸이 아주 많은 모음에서 점수가 끝없이 쌓이지 않게 할 때 쓴다(예: 54가지 가운데 처음 10가지만 +5, 그 뒤는 +1).
 *     몇 번째인지는 등록하는 순간 그 모음에 든 칸 수로 센다 — 어떤 칸을 먼저 찾든, 몇 판에 나눠 찾든 점수의 합이 같다
 *     xpAfter.with: [다른 모음 id] — 몇 번째인지를 그 모음들에 든 칸까지 합쳐 센다(한 묶음으로 "처음 count가지"를 셀 때.
 *     예: 직육면체 전개도 54가지 + 두 길이가 같은 직육면체 전개도 29가지를 합쳐 처음 10가지). 묶음의 모음끼리 서로 적어 두면 어느 쪽에 먼저 넣든 같다
 *   report: true면 보이지 않는 모음(quiet)이라도 결과 복사 문장에 "제목 n/m"을 한 칸 넣는다(찾은 칸이 있을 때만)
 */
import { XP } from './rewards.js';

/** 도감 정의 검사 → 그대로 쓸 수 있는 목록. 잘못되면 오류 */
export function normalizeCollections(defs) {
  if (defs == null) return [];
  if (!Array.isArray(defs)) throw new Error('collections는 배열이에요.');
  const ids = new Set();
  const out = defs.map((def) => {
    if (!def?.id || !def?.title || !Array.isArray(def.items) || def.items.length === 0) {
      throw new Error('collections: 도감마다 id, title, items(칸 목록)가 필요해요.');
    }
    if (ids.has(def.id)) throw new Error(`collections: 도감 id가 겹쳐요 (${def.id}).`);
    ids.add(def.id);
    if (def.xp != null && !(Number.isInteger(def.xp) && def.xp >= 0 && def.xp <= XP.discover)) {
      throw new Error(`collections(${def.id}): xp는 0~${XP.discover} 사이 정수예요.`);
    }
    if (def.label != null && !(typeof def.label === 'string' && def.label.trim())) {
      throw new Error(`collections(${def.id}): label은 짧은 이름 글자예요 (예: '노트').`);
    }
    if (def.quiet != null && typeof def.quiet !== 'boolean') throw new Error(`collections(${def.id}): quiet는 true나 false예요.`);
    if (def.xpAfter != null) {
      const { count, xp } = def.xpAfter ?? {};
      const top = def.xp ?? XP.discover;
      if (!(Number.isInteger(count) && count >= 1 && Number.isInteger(xp) && xp >= 0 && xp <= top)) {
        throw new Error(`collections(${def.id}): xpAfter는 { count: 1 이상 정수, xp: 0~${top} 사이 정수 }예요.`);
      }
      const group = def.xpAfter.with;
      if (group != null && !(Array.isArray(group) && group.every((id) => typeof id === 'string' && id && id !== def.id))) {
        throw new Error(`collections(${def.id}): xpAfter.with는 함께 셀 다른 모음 id의 배열이에요.`);
      }
    }
    if (def.report != null && typeof def.report !== 'boolean') throw new Error(`collections(${def.id}): report는 true나 false예요.`);
    const itemIds = new Set();
    const items = def.items.map((item) => {
      if (item?.id == null || !item?.name) throw new Error(`collections(${def.id}): 칸마다 id와 name이 필요해요.`);
      const id = String(item.id);
      if (itemIds.has(id)) throw new Error(`collections(${def.id}): 칸 id가 겹쳐요 (${id}).`);
      itemIds.add(id);
      if (item.thumb != null && typeof item.thumb !== 'function') throw new Error(`collections(${def.id}): thumb는 (h) => 요소 함수예요.`);
      return { ...item, id };
    });
    return { ...def, items };
  });
  for (const def of out) {
    for (const id of def.xpAfter?.with ?? []) {
      if (!ids.has(id)) throw new Error(`collections(${def.id}): xpAfter.with에 없는 모음이 있어요 (${id}).`);
    }
  }
  return out;
}

/** 저장된 값을 안전한 모양으로. 도감에 없는 칸은 버린다. */
export function normalizeCollectionState(raw, defs) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const out = {};
  for (const def of defs) {
    const saved = src[def.id] && typeof src[def.id] === 'object' ? src[def.id] : {};
    const known = new Set(def.items.map((i) => i.id));
    out[def.id] = {};
    for (const [itemId, v] of Object.entries(saved)) {
      if (known.has(itemId) && v && typeof v === 'object') out[def.id][itemId] = { at: Number(v.at) || 0, stage: v.stage ?? null };
    }
  }
  return out;
}

/** 도감 하나의 상태 → { found: Set(칸 id), count, total } */
export function collectionStatus(state, def) {
  const found = new Set(Object.keys(state?.[def.id] ?? {}));
  return { found, count: found.size, total: def.items.length };
}

/** 모든 도감을 합친 찾은 칸 수 → { count, total } */
export function collectionTotals(state, defs) {
  return defs.reduce((sum, def) => {
    const s = collectionStatus(state, def);
    return { count: sum.count + s.count, total: sum.total + s.total };
  }, { count: 0, total: 0 });
}

/**
 * 도감 칩에 보일 숫자. label이 없는 도감은 합쳐 "도감 n / m"(main), label이 있는 도감은 하나씩 따로(side).
 * 화면에 보이지 않는 모음(quiet)은 어느 쪽에도 넣지 않는다.
 * → { main: { count, total } | null, mainDefs, side: [{ id, label, icon, count, total }] }
 */
export function collectionChips(state, allDefs) {
  const defs = allDefs.filter((def) => !def.quiet);
  const mainDefs = defs.filter((def) => !def.label);
  return {
    main: mainDefs.length > 0 ? collectionTotals(state, mainDefs) : null,
    mainDefs,
    side: defs.filter((def) => def.label).map((def) => {
      const s = collectionStatus(state, def);
      return { id: def.id, label: def.label, icon: def.icon ?? null, count: s.count, total: s.total };
    }),
  };
}

/**
 * 칸 하나를 등록한다(상태를 바꾸지 않고 새 상태를 돌려준다).
 * → { state, isNew, count, total, item, known } · 도감·칸이 없으면 known: false (등록하지 않음)
 */
export function collectItem(state, defs, collectionId, itemId, { at = Date.now(), stage = null } = {}) {
  const def = defs.find((d) => d.id === collectionId);
  const id = itemId == null ? null : String(itemId);
  const item = def?.items.find((i) => i.id === id) ?? null;
  if (!def || !item) {
    const s = def ? collectionStatus(state, def) : { count: 0, total: 0 };
    return { state, isNew: false, count: s.count, total: s.total, item: null, known: false };
  }
  const current = state?.[def.id] ?? {};
  if (current[id]) {
    const s = collectionStatus(state, def);
    return { state, isNew: false, count: s.count, total: s.total, item, known: true };
  }
  const next = { ...state, [def.id]: { ...current, [id]: { at, stage } } };
  const s = collectionStatus(next, def);
  return { state: next, isNew: true, count: s.count, total: s.total, item, known: true };
}

/**
 * 점수 상한(xpAfter)을 셀 때의 칸 수: 그 모음에 든 칸 수 + xpAfter.with에 적은 모음들에 든 칸 수.
 * ctx.collect가 등록한 바로 뒤의 상태로 부르면 "이 칸이 묶음에서 몇 번째인가"가 된다
 */
export function xpAfterCount(state, defs, def) {
  if (!def) return 0;
  const group = [def, ...(def.xpAfter?.with ?? []).map((id) => defs.find((d) => d.id === id)).filter(Boolean)];
  return group.reduce((sum, d) => sum + collectionStatus(state, d).count, 0);
}

/**
 * 결과 복사 문장에 넣을 보이지 않는 모음(quiet + report)의 칸: [{ id, title, count, total }] — 찾은 칸이 있는 것만
 */
export function reportedQuiet(state, defs) {
  return defs.filter((def) => def.quiet && def.report).map((def) => {
    const s = collectionStatus(state, def);
    return { id: def.id, title: def.title, count: s.count, total: s.total };
  }).filter((c) => c.count > 0);
}

/**
 * 그 도감에 count번째로 등록한 칸이 받는 솜씨 점수: 도감 정의의 xp(없으면 undefined → 엔진 기본 +5),
 * xpAfter가 있고 count가 xpAfter.count를 넘으면 xpAfter.xp
 */
export function collectionXp(def, count) {
  const after = def?.xpAfter;
  return after && count > after.count ? after.xp : def?.xp;
}
