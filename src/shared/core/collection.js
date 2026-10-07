/**
 * 도감 틀: 여러 가지를 새로 찾으면 칸이 하나씩 찬다. 화면과 상관없는 순수 로직.
 * 게임이 createGameApp({ collections })로 도감(칸 목록)을 주고, 플레이 중 ctx.collect(id, itemId)로 등록한다.
 * 저장 모양 (createStorage(game.id)의 'collections'): { 도감 id: { 칸 id: { at, stage } } }
 */

/** 도감 정의 검사 → 그대로 쓸 수 있는 목록. 잘못되면 오류 */
export function normalizeCollections(defs) {
  if (defs == null) return [];
  if (!Array.isArray(defs)) throw new Error('collections는 배열이에요.');
  const ids = new Set();
  return defs.map((def) => {
    if (!def?.id || !def?.title || !Array.isArray(def.items) || def.items.length === 0) {
      throw new Error('collections: 도감마다 id, title, items(칸 목록)가 필요해요.');
    }
    if (ids.has(def.id)) throw new Error(`collections: 도감 id가 겹쳐요 (${def.id}).`);
    ids.add(def.id);
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
