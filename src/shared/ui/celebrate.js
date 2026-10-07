/**
 * 축하 연출: 색종이 조각과 결과 화면의 짧은 연출(별 → 도장 → 점수 막대 → 칭호·새 도장 카드).
 *
 * - 색종이는 한 번에 12개 이하, transform·opacity만 움직이고 1.4초 뒤 DOM에서 지운다.
 * - 결과 연출은 모두 2초 안에 끝나고, 아무 키·누르기로 끝 상태로 건너뛴다.
 * - 움직임 줄이기(prefers-reduced-motion) 또는 ?fx=low(코어 2개 이하 기기는 자동)면 색종이를 만들지 않고
 *   처음부터 끝 상태를 보인다. 소리·글자 안내는 그대로라 축하는 늘 글자로도 전해진다.
 */
import { h } from './dom.js';

export const CONFETTI_MAX = 12;
export const CONFETTI_MS = 1400;
/** 결과 연출 전체 길이(ms). 이 안에 모든 움직임이 끝난다. */
export const RESULT_MS = 2000;

/** 저사양 모드: ?fx=low, 또는 CPU 코어가 2개 이하인 기기 */
export function isLowFx({ fx = null, hardwareConcurrency = globalThis.navigator?.hardwareConcurrency } = {}) {
  if (fx === 'low') return true;
  return Number.isFinite(hardwareConcurrency) && hardwareConcurrency > 0 && hardwareConcurrency <= 2;
}

export const prefersReducedMotion = () => Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

/**
 * 색종이 조각의 모양(순수). width를 주면 그 너비 위쪽에서 흩날리고(결과 화면), 없으면 한 점에서 퍼진다.
 * → [{ x(시작 위치, 기준점에서 px), dx, up(위로 튀는 높이), dy(떨어지는 거리), rot(도), delay(ms), color(1~8) }]
 */
export function confettiSpecs(count, { width = 0, random = Math.random } = {}) {
  const n = Math.max(0, Math.min(CONFETTI_MAX, Math.floor(Number(count) || 0)));
  return Array.from({ length: n }, (_, i) => {
    const side = i % 2 === 0 ? -1 : 1;
    const spread = width > 0;
    return {
      x: spread ? Math.round(((i + 0.5) / n - 0.5) * width + (random() - 0.5) * 24) : 0,
      dx: Math.round(spread ? (random() - 0.5) * 90 : side * (30 + random() * 90)),
      up: Math.round(spread ? 10 + random() * 30 : 50 + random() * 70),
      dy: Math.round(110 + random() * 150),
      rot: Math.round((random() - 0.5) * 540),
      delay: Math.round(random() * 200),
      color: (i % 8) + 1,
    };
  });
}

/** at(요소 또는 { x, y })의 기준점: 요소면 위쪽 가운데 */
function originOf(at) {
  if (at && typeof at.getBoundingClientRect === 'function') {
    const r = at.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + Math.min(24, r.height / 2), width: r.width };
  }
  if (at && Number.isFinite(at.x) && Number.isFinite(at.y)) return { x: at.x, y: at.y, width: 0 };
  return { x: (globalThis.innerWidth ?? 800) / 2, y: (globalThis.innerHeight ?? 600) / 3, width: 0 };
}

/**
 * 색종이 층. quiet()가 true면(움직임 줄이기·저사양) 아무것도 만들지 않는다.
 * burst({ at, count, spread }) → 만든 조각 수
 */
export function createConfetti({ host, quiet = () => false }) {
  const layer = h('div', { class: 'confetti-layer', 'aria-hidden': 'true' });
  host.append(layer);
  let timer = null;

  function clear() {
    clearTimeout(timer);
    layer.replaceChildren();
  }

  function burst({ at = null, count = 10, spread = false } = {}) {
    if (quiet()) return 0;
    clear(); // 한 번에 12개 이하
    const o = originOf(at);
    const specs = confettiSpecs(count, { width: spread ? o.width : 0 });
    for (const s of specs) {
      layer.append(h('i', {
        class: `confetti-piece c${s.color}`,
        style: {
          left: `${Math.round(o.x + s.x)}px`,
          top: `${Math.round(o.y)}px`,
          animationDelay: `${s.delay}ms`,
        },
      }));
      const piece = layer.lastChild;
      piece.style.setProperty('--dx', `${s.dx}px`);
      piece.style.setProperty('--up', `${-s.up}px`);
      piece.style.setProperty('--dy', `${s.dy}px`);
      piece.style.setProperty('--rot', `${s.rot}deg`);
    }
    timer = setTimeout(clear, CONFETTI_MS);
    return specs.length;
  }

  return { burst, clear, layer };
}

/**
 * 결과 화면 연출 순서. el에 is-celebrating 클래스를 붙여 CSS 애니메이션(지연 포함)을 돌리고,
 * steps[{ at(ms), run() }]를 그 시각에 부른다(소리·색종이). 아무 키·누르기면 남은 것을 건너뛰고 끝 상태.
 * animate가 false면(움직임 줄이기·저사양) 클래스 없이 끝 상태로 두고 steps 중 always인 것만 바로 부른다.
 * → { skip(), stop(), done: () => boolean }
 */
export function runCelebration({ el, steps = [], animate = true, total = RESULT_MS, onEnd = null, doc = globalThis.document }) {
  const timers = [];
  let finished = false;

  function end() {
    if (finished) return;
    finished = true;
    timers.forEach(clearTimeout);
    el.classList.remove('is-celebrating');
    doc?.removeEventListener('keydown', skip, true);
    doc?.removeEventListener('pointerdown', skip, true);
    onEnd?.();
  }
  function skip() {
    end();
  }

  if (!animate) {
    for (const step of steps) if (step.always) step.run();
    finished = true;
    onEnd?.();
    return { skip() {}, stop() {}, done: () => true };
  }

  el.classList.add('is-celebrating');
  for (const step of steps) timers.push(setTimeout(() => step.run(), Math.max(0, Math.min(step.at, total))));
  timers.push(setTimeout(end, total));
  doc?.addEventListener('keydown', skip, true);
  doc?.addEventListener('pointerdown', skip, true);
  return { skip, stop: end, done: () => finished };
}
