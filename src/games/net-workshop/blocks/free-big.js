/**
 * 자유 쌓기의 "더 큰 판" (spec-grade6.md 15-37 사용자 요청 · 15-39 사용자 결정, plan-big-board.md).
 *
 * - 판: 20칸 × 20칸 · 10층(결정 1). 원근 · 돌리기 · 처음 크기(판이 꽉 차게)는 보통 판과 같다.
 * - 띄우는 방법(결정 2): 새 창이 아니라 같은 화면이 "큰 판 화면"으로 바뀐다 — <html>에 표시(blk-big-on)를 달면 게임 CSS(blocks.css 끝 "큰 판" 절)가
 *   앱 틀의 폭 상한 · 맨 위 띠 · 머리(제목 · [← 단계 선택])를 감추고 작업대를 화면 높이에 맞춘다. 되는 기기에서는 누른 순간 화면 전체를 요청한다
 *   (막히거나 없어도 큰 판 화면은 열린다). 엔진은 고치지 않는다(plan 3-4).
 * - 두 판은 따로(결정 3): 큰 판은 저장 열쇠가 따로(free-big-20x20)라 보통 판의 작품은 그대로다.
 * - 메뉴 자리(결정 4): 오른쪽 도구 띠 맨 아래(1000px 이하는 띠 줄 끝). 큰 판 화면에서는 같은 자리가 [← 보통 판으로].
 * - 휴대폰(결정 5 · Plan이 고른 기준 — 창의 짧은 변 600px 미만, 누르는 순간의 창 크기로): 작은 안내 카드 + [알겠어요].
 */
import { icon } from '../../../shared/ui/icons.js';
import { svgEl } from './block-view.js';

/** 큰 판(결정 1 — 20×20칸 · 10층). 위에서 본 판의 칸 18px(지금 14×14 펼친 판과 거의 같은 크기), 저장 열쇠는 보통 판과 따로 */
export const BIG_BOARD = Object.freeze({ cols: 20, rows: 20, maxH: 10, compact: true, big: true, cell: 18, key: 'free-big-20x20' });
/** 휴대폰 판정: 창의 짧은 변이 600px 미만(지금 6×6 판을 쓰는 화면과 같다 — 15-19 4) */
export const PHONE_SHORT = 600;
export const isPhoneSize = (width, height) => Math.min(width, height) < PHONE_SHORT;
/** 큰 판 화면 동안 <html>에 다는 표시 */
export const BIG_ON = 'blk-big-on';
/** 선생님이 바로 여는 주소: ?stage=blocks-free&board=big */
export const wantsBig = (search = '') => new URLSearchParams(search).get('board') === 'big';

export const BIG_NAME = '더 큰 판';
/** 큰 판 띠 맨 위의 판 이름 아래 글(제목 글꼴에 없는 기호 ×를 쓰지 않는다) */
export const BIG_SIZE = '20칸 20줄';
/** 메뉴 버튼의 화면 읽기 이름(휴대폰에서는 쓸 수 있는 곳까지) · 돌아가기 */
export const BIG_LABEL = '더 큰 판에서 쌓기';
export const BIG_LABEL_PHONE = '더 큰 판에서 쌓기, 태블릿과 컴퓨터에서 쓸 수 있어요';
export const BACK_LABEL = '보통 판으로 돌아가기';
export const BIG_HELLO = '더 큰 판이에요. 20칸 20줄이고 10층까지 쌓을 수 있어요.';
export const FULL_ESC = '전체 화면을 나가려면 Esc를 눌러요.';
export const PHONE_TEXT = '더 큰 판은 태블릿이나 컴퓨터에서 쓸 수 있어요.';

// ── 그림(엔진 아이콘과 같은 24×24 · 선 · currentColor — 엔진에 없는 두 가지만 여기에) ──
const glyph = (name, parts) => svgEl('svg', { class: `icon icon-${name}`, viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' },
  ...parts.map(([tag, attrs]) => svgEl(tag, attrs)));
/** 크게 열기: 작은 판(채움) → 큰 판(테두리), 바깥으로 나가는 화살표 */
export const bigIcon = () => glyph('bigboard', [
  ['rect', { x: 3.5, y: 12.5, width: 8, height: 8, rx: 1.5, fill: 'currentColor', stroke: 'none' }],
  ['path', { d: 'M3.5 9V5a1.5 1.5 0 0 1 1.5-1.5h14A1.5 1.5 0 0 1 20.5 5v14a1.5 1.5 0 0 1-1.5 1.5h-4' }],
  ['path', { d: 'M13 11l4.5-4.5M13.5 6.5h4v4' }],
]);
/** 전체 화면 켜기(네 귀 밖으로) · 끄기(네 귀 안으로) */
export const fullIcon = (on) => glyph(on ? 'fullexit' : 'fullscreen', [
  ['path', { d: on ? 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5' : 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5' }],
]);

// ── 전체 화면 (되는 기기에서만 — 표준과 옛 webkit 이름) ──
const doc = () => globalThis.document;
export const canFullscreen = () => Boolean(doc()?.fullscreenEnabled || doc()?.webkitFullscreenEnabled);
export const isFullscreen = () => Boolean(doc()?.fullscreenElement || doc()?.webkitFullscreenElement);
/**
 * 누른 순간에 부른다(브라우저는 누르는 동작 없이 부르면 막는다). → Promise<boolean>: 화면 전체가 되었으면 true.
 * 막히거나(거절) 없거나 결과를 알 수 없으면(옛 webkit — 돌려주는 것이 없다) false — 큰 판 화면은 그대로 열린다. 오류를 밖으로 내지 않는다
 */
export function requestFullscreen() {
  const root = doc()?.documentElement;
  const ask = root?.requestFullscreen ?? root?.webkitRequestFullscreen;
  if (!ask || !canFullscreen()) return Promise.resolve(false);
  try {
    const result = ask.call(root);
    return typeof result?.then === 'function' ? result.then(() => true, () => false) : Promise.resolve(false);
  } catch {
    return Promise.resolve(false);
  }
}
export function exitFullscreen() {
  if (!isFullscreen()) return;
  const leave = doc().exitFullscreen ?? doc().webkitExitFullscreen;
  try {
    leave?.call(doc())?.catch?.(() => {});
  } catch {
    // 이미 나갔다
  }
}
/** 전체 화면이 바뀔 때(Esc로 나간 것 포함) — 지켜보기를 그만두는 함수를 돌려준다 */
export function onFullscreenChange(fn) {
  const d = doc();
  if (!d) return () => {};
  d.addEventListener('fullscreenchange', fn);
  d.addEventListener('webkitfullscreenchange', fn);
  return () => {
    d.removeEventListener('fullscreenchange', fn);
    d.removeEventListener('webkitfullscreenchange', fn);
  };
}

/** 큰 판 화면 표시 켜고 끄기 */
export function setBigScreen(on) {
  doc()?.documentElement.classList.toggle(BIG_ON, Boolean(on));
}

/**
 * 휴대폰 안내 카드(결정 5): 대화 상자 이름 "안내", 글 + [알겠어요]. 닫기는 [알겠어요] · Esc · 카드 밖 누르기.
 * 열면 초점이 [알겠어요]로, 닫으면 back(메뉴 버튼)으로 돌아간다. → { el, close }
 */
export function createPhoneNotice({ h, sfx, back, onClose }) {
  const text = h('p', { class: 'blk-free-notice-text', id: 'blk-free-notice-text' }, PHONE_TEXT);
  const ok = h('button', { type: 'button', class: 'btn btn-primary blk-free-notice-ok', onclick: () => close(true) }, '알겠어요');
  const card = h('div', {
    class: 'blk-free-notice-card',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': '안내',
    'aria-describedby': 'blk-free-notice-text',
  }, h('span', { class: 'blk-free-notice-ico', 'aria-hidden': 'true' }, icon('info')), text, ok);
  const el = h('div', {
    class: 'blk-free-notice',
    onclick: (event) => {
      if (event.target === el) close(true);
    },
    onkeydown: (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(true);
      } else if (event.key === 'Tab') {
        // 버튼이 하나뿐이라 초점은 [알겠어요]에 머문다
        event.preventDefault();
        ok.focus({ preventScroll: true });
      }
    },
  }, card);
  let closed = false;
  function close(user = false) {
    if (closed) return;
    closed = true;
    if (user) sfx?.play?.('click');
    el.remove();
    if (user) back?.focus?.({ preventScroll: true });
    onClose?.();
  }
  return { el, ok, close };
}
