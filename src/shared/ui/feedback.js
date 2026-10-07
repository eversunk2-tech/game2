/**
 * 정답·오답 피드백: 화면 아래 알림(토스트), 요소 흔들기/튀기기, 화면 읽기 프로그램 안내.
 * 색만으로 구분하지 않도록 ✓ / ✗ 표시를 함께 보여 준다.
 */
import { h } from './dom.js';

const ICONS = { correct: '✓', wrong: '✗', info: 'ℹ' };

export function createFeedback(root) {
  const live = h('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
  const toastHost = h('div', { class: 'toast-host', 'aria-hidden': 'true' });
  root.append(live, toastHost);
  let hideTimer = null;
  let announceTimer = null;

  function say(message, type) {
    // 같은 문장을 연달아 말해도 다시 읽도록 비웠다가 넣는다.
    live.textContent = '';
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => {
      live.textContent = message;
    }, 30);

    const toast = h('div', { class: `toast toast-${type}` }, h('span', { class: 'toast-icon' }, ICONS[type]), h('span', null, message));
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
    /** 화면을 바꿀 때 앞 화면의 알림을 지운다. */
    clear() {
      clearTimeout(hideTimer);
      toastHost.replaceChildren();
    },
    mark,
  };
}
