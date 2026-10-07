/**
 * localStorage를 감싼 게임별 저장소.
 * 사생활 보호 모드·차단된 저장소·용량 초과에서도 게임이 멈추지 않도록
 * 모든 읽기/쓰기를 try/catch로 감싸고, 실패하면 메모리에만 보관한다.
 * 저장소에는 학생 개인정보(이름 등)를 넣지 않는다.
 */

export function createMemoryBackend() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(key, String(value));
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

function detectBackend() {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return createMemoryBackend();
    const probe = '__edu_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return createMemoryBackend();
  }
}

export function createStorage(namespace, backend = detectBackend()) {
  const prefix = `edu:${namespace}:`;
  let store = backend;

  return {
    get(key, defaultValue = null) {
      try {
        const raw = store.getItem(prefix + key);
        return raw === null ? defaultValue : JSON.parse(raw);
      } catch {
        return defaultValue;
      }
    },
    set(key, value) {
      const raw = JSON.stringify(value);
      try {
        store.setItem(prefix + key, raw);
      } catch {
        // 용량 초과·차단: 이번 접속 동안만 메모리에 보관한다.
        store = createMemoryBackend();
        store.setItem(prefix + key, raw);
      }
    },
    remove(key) {
      try {
        store.removeItem(prefix + key);
      } catch {
        // 지우기 실패는 무시해도 게임 진행에 지장이 없다.
      }
    },
  };
}
