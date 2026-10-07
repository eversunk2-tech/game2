/**
 * 정답·오답 피드백: 말풍선 쪽지(토스트), 요소 흔들기/튀기기, 화면 읽기 프로그램 안내.
 * 색만으로 구분하지 않도록 ✓ / ✗ / ℹ 아이콘을 함께 보여 준다.
 *
 * 토스트는 기본으로 화면 아래 가운데에 뜬다. 넓은 화면(901px 이상)에서 anchor(el)를 주면
 * 그 요소(예: 게임 무대)의 아래쪽 가운데에 띄워, 옆 판의 버튼을 가리지 않게 한다.
 */
import { h } from './dom.js';
import { icon } from './icons.js';

const ICONS = { correct: 'check', wrong: 'cross', info: 'info' };
export const ANCHOR_MEDIA = '(min-width: 901px)';

/**
 * 기준 요소 아래쪽 가운데에 토스트를 놓을 자리(화면 기준 px). 순수 계산.
 * rect: 기준 요소의 getBoundingClientRect(), viewport: { width, height }
 * 돌려주는 값: { left(가운데 x), bottom(화면 아래에서 띄울 거리), width(최대 너비) }
 */
export function anchorPlacement(rect, viewport, { gap = 16, maxWidth = 600, minWidth = 240 } = {}) {
  const width = Math.max(minWidth, Math.min(maxWidth, rect.width - gap * 2, viewport.width - gap * 2));
  const half = width / 2;
  const center = Math.min(Math.max(rect.left + rect.width / 2, gap + half), viewport.width - gap - half);
  // 요소 아래쪽이 화면 밖이면 화면 아래에, 화면 위쪽으로는 너무 올라가지 않게
  const bottom = Math.min(Math.max(viewport.height - rect.bottom + gap, gap), Math.max(gap, viewport.height - 120));
  return { left: Math.round(center), bottom: Math.round(bottom), width: Math.round(width) };
}

export function createFeedback(root) {
  const live = h('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
  const toastHost = h('div', { class: 'toast-host', 'aria-hidden': 'true' });
  root.append(live, toastHost);
  let hideTimer = null;
  let announceTimer = null;
  let anchorEl = null;

  function place() {
    const wide = Boolean(globalThis.matchMedia?.(ANCHOR_MEDIA).matches);
    if (!anchorEl || !anchorEl.isConnected || !wide) {
      toastHost.classList.remove('is-anchored');
      toastHost.style.left = '';
      toastHost.style.bottom = '';
      toastHost.style.width = '';
      return;
    }
    const spot = anchorPlacement(anchorEl.getBoundingClientRect(), { width: globalThis.innerWidth, height: globalThis.innerHeight });
    toastHost.classList.add('is-anchored');
    toastHost.style.left = `${spot.left}px`;
    toastHost.style.bottom = `${spot.bottom}px`;
    toastHost.style.width = `${spot.width}px`;
  }
  globalThis.addEventListener?.('resize', () => {
    if (toastHost.firstChild) place();
  });

  function say(message, type) {
    // 같은 문장을 연달아 말해도 다시 읽도록 비웠다가 넣는다.
    live.textContent = '';
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => {
      live.textContent = message;
    }, 30);

    const toast = h('div', { class: `toast toast-${type}` },
      h('span', { class: 'toast-icon' }, icon(ICONS[type])),
      h('span', { class: 'toast-text' }, message),
    );
    place();
    toastHost.replaceChildren(toast);
    clearTimeout(hideTimer);
    // 초등학생이 읽을 시간: 기본 1.5초 + 글자당 0.08초
    hideTimer = setTimeout(() => toast.remove(), 1500 + message.length * 80);
  }

  function mark(el, type) {
    if (!el) return;
    const cls = `fx-${type}`;
    el.classList.remove('fx-correct', 'fx-wrong');
    void el.offsetWidth; // 애니메이션을 처음부터 다시 시작
    el.classList.add(cls);
    el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
  }

  return {
    correct(message, el) {
      mark(el, 'correct');
      if (message) say(message, 'correct');
    },
    wrong(message, el) {
      mark(el, 'wrong');
      if (message) say(message, 'wrong');
    },
    info(message) {
      say(message, 'info');
    },
    /**
     * 넓은 화면에서 토스트를 el의 아래쪽 가운데에 띄운다(예: 게임 무대). null이면 기본 자리.
     * 화면이 바뀌면 엔진이 null로 되돌린다.
     */
    anchor(el) {
      anchorEl = el ?? null;
      place();
    },
    /** 화면을 바꿀 때 앞 화면의 알림을 지운다. */
    clear() {
      clearTimeout(hideTimer);
      toastHost.replaceChildren();
    },
    mark,
  };
}
