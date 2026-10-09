/**
 * 끌어다 놓기 + "눌러서 고르고, 놓을 곳 누르기"를 한 번에 지원한다.
 * - 마우스·터치·펜: 포인터 이벤트로 끌기
 * - 끌기가 어려운 학생·작은 태블릿: 카드를 누르고(선택) 상자를 누르기
 * - 키보드: item과 target을 <button>으로 만들면 Tab + Enter로 같은 동작
 *
 * item에는 class="dnd-item", target에는 class="dnd-target"을 붙인다.
 * onDrop(itemEl, targetEl)에서 정답 판정과 요소 이동을 게임이 직접 한다.
 *
 * 끄는 동안 보이는 것은 item의 복제(.dnd-ghost)다. <body>에 고정 위치로 붙여 포인터를 따라 옮기므로, item이 스크롤 상자·
 * overflow: hidden 상자 안에 있어도 잘리지 않고 늘 맨 위에 보인다. 원래 item은 제자리에서 흐려진다(.is-dragging).
 * 놓으면 복제는 사라지고 onDrop이 불린다. 놓을 곳이 아닌 데서 떼거나(취소 포함) onDrop 뒤에도 item이 제자리에 그대로면
 * 복제가 제자리로 돌아간 뒤 사라진다.
 */

export const RETURN_MS = 150; // 복제가 제자리로 돌아가는 시간
const GHOST_Z = 1000; // 알림(100)·색종이(90)보다 위
// 복제에 옮겨 적지 않는 속성: 다시 시작되면 안 되는 움직임, 그리고 pointer-events(복제 전체가 none을 물려받아 아래 상자가 잡히게)
const SKIP_LOOK = /^(transition|animation|pointer-events)/;
// 복제에서 떼는 상태 클래스 (끌 수 있는 것·고른 것·끄는 중 표시는 원래 item의 것)
const GHOST_STATE = ['dnd-item', 'is-selected', 'is-dragging', 'is-returning'];

/** 두 상자(getBoundingClientRect)가 같은 자리·같은 크기인가 (slack px까지 같다고 본다) */
export function sameSpot(a, b, slack = 2) {
  if (!a || !b) return false;
  return ['left', 'top', 'width', 'height'].every((k) => Math.abs(a[k] - b[k]) <= slack) && a.width > 0 && a.height > 0;
}

/** 끄는 복제의 transform: 처음 자리에서 (dx, dy)만큼. 조상이 확대·축소돼 있으면 그 비율(scale)을 곱한다 */
export function ghostTransform(dx, dy, scale = [1, 1]) {
  const move = `translate(${dx}px, ${dy}px)`;
  return scale[0] === 1 && scale[1] === 1 ? move : `${move} scale(${scale[0]}, ${scale[1]})`;
}

/** 화면에 보이는 모습 그대로(계산된 스타일)를 복제에 옮겨 적는다 — 조상 선택자·CSS 변수에 기대던 모양도 <body> 아래에서 같게 보인다 */
function copyLook(from, to) {
  const style = getComputedStyle(from);
  for (let i = 0; i < style.length; i += 1) {
    const name = style[i];
    if (!SKIP_LOOK.test(name)) to.style.setProperty(name, style.getPropertyValue(name));
  }
  const kids = from.children;
  for (let i = 0; i < kids.length; i += 1) if (to.children[i]) copyLook(kids[i], to.children[i]);
}

const prefersReducedMotion = () => Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

export function enableDragDrop({
  root,
  onDrop,
  itemSelector = '.dnd-item',
  targetSelector = '.dnd-target',
  threshold = 8,
}) {
  let selected = null;
  let drag = null;
  let suppressClick = false;
  let suppressTimer = 0;
  const returning = new Set(); // 제자리로 돌아가는 중인 복제: { ghost, el, timer }

  const owns = (el) => el && root.contains(el);
  const itemOf = (node) => {
    const el = node instanceof Element ? node.closest(itemSelector) : null;
    return owns(el) ? el : null;
  };
  const targetOf = (node) => {
    const el = node instanceof Element ? node.closest(targetSelector) : null;
    return owns(el) ? el : null;
  };

  function select(el) {
    if (selected) {
      selected.classList.remove('is-selected');
      selected.setAttribute('aria-pressed', 'false');
    }
    selected = el;
    if (el) {
      el.classList.add('is-selected');
      el.setAttribute('aria-pressed', 'true');
    }
    root.classList.toggle('has-selection', Boolean(el));
  }

  function drop(item, target) {
    select(null);
    onDrop(item, target);
  }

  function onClick(event) {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    const item = itemOf(event.target);
    if (item) {
      select(selected === item ? null : item);
      return;
    }
    const target = targetOf(event.target);
    if (target && selected && owns(selected)) drop(selected, target);
  }

  // ── 끄는 동안 보이는 복제 ─────────────────────
  /** item을 복제해 <body>에 고정 위치로 붙인다. 지금 화면에 보이는 자리·크기·모양 그대로 */
  function makeGhost(el) {
    const rect = el.getBoundingClientRect();
    const ghost = el.cloneNode(true);
    copyLook(el, ghost);
    for (const node of [ghost, ...ghost.querySelectorAll('[id]')]) node.removeAttribute('id');
    ghost.classList.remove(...GHOST_STATE);
    ghost.classList.add('dnd-ghost');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.setAttribute('tabindex', '-1');
    ghost.inert = true;
    // 조상이 확대·축소돼 있으면(보이는 크기 ≠ 놓인 크기) 놓인 크기로 만들고 그 비율만큼 늘린다
    const [w, h] = [el.offsetWidth, el.offsetHeight];
    const scaled = w > 0 && h > 0 && (Math.abs(rect.width / w - 1) > 0.02 || Math.abs(rect.height / h - 1) > 0.02);
    const scale = scaled ? [rect.width / w, rect.height / h] : [1, 1];
    // 자리·움직임은 복제가 정한다 (게임 CSS가 덮지 못하게 important로 적는다)
    const must = {
      position: 'fixed',
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      right: 'auto',
      bottom: 'auto',
      width: `${scaled ? w : rect.width}px`,
      height: `${scaled ? h : rect.height}px`,
      margin: '0',
      'box-sizing': 'border-box',
      'z-index': String(GHOST_Z),
      'pointer-events': 'none',
      'transform-origin': '0 0',
      transform: ghostTransform(0, 0, scale),
      transition: 'none',
      animation: 'none',
    };
    for (const [name, value] of Object.entries(must)) ghost.style.setProperty(name, value, 'important');
    document.body.append(ghost);
    return { ghost, scale, left: rect.left, top: rect.top };
  }

  const moveGhost = (g, dx, dy) => g.ghost.style.setProperty('transform', ghostTransform(dx, dy, g.scale), 'important');

  /** 돌아가는 복제를 바로 지운다 */
  function endReturn(entry) {
    if (!returning.delete(entry)) return;
    clearTimeout(entry.timer);
    entry.ghost.remove();
    entry.el.classList.remove('is-returning');
  }

  /** 복제를 item의 지금 자리로 돌려보낸 뒤 지운다(움직임 줄이기면 바로). 그동안 item은 흐린 채로 둔다 */
  function returnGhost(g, el) {
    if (!el.isConnected || prefersReducedMotion()) {
      g.ghost.remove();
      return;
    }
    const home = el.getBoundingClientRect();
    const entry = { ghost: g.ghost, el, timer: 0 };
    returning.add(entry);
    el.classList.add('is-returning');
    g.ghost.classList.add('is-returning');
    g.ghost.style.setProperty('transition', `transform ${RETURN_MS}ms ease-out`, 'important');
    void g.ghost.offsetWidth; // 지금 자리에서 출발하게 한 번 그린다
    moveGhost(g, home.left - g.left, home.top - g.top);
    entry.timer = setTimeout(() => endReturn(entry), RETURN_MS + 50);
    g.ghost.addEventListener('transitionend', (event) => {
      if (event.target === g.ghost) endReturn(entry);
    });
  }

  // ── 끌기 ────────────────────────────
  function listen(on) {
    const act = on ? 'addEventListener' : 'removeEventListener';
    window[act]('pointermove', onPointerMove);
    window[act]('pointerup', onPointerUp);
    window[act]('pointercancel', onPointerCancel);
    window[act]('keydown', onKeyDown, true);
    window[act]('blur', onBlur);
  }

  function onPointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const item = itemOf(event.target);
    if (!item || drag) return;
    drag = { el: item, id: event.pointerId, x0: event.clientX, y0: event.clientY, active: false, over: null, ghost: null, home: null };
    listen(true);
  }

  function onPointerMove(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x0;
    const dy = event.clientY - drag.y0;
    if (!drag.active) {
      if (Math.hypot(dx, dy) < threshold) return;
      drag.active = true;
      select(null);
      for (const entry of [...returning]) if (entry.el === drag.el) endReturn(entry); // 돌아오던 것을 다시 집었다
      drag.home = drag.el.getBoundingClientRect();
      drag.ghost = makeGhost(drag.el); // 흐리게 하기 전의 모습을 복제한다
      drag.el.classList.add('is-dragging');
      root.classList.add('is-dragging-any');
    }
    event.preventDefault();
    moveGhost(drag.ghost, dx, dy);
    // 복제와 is-dragging은 pointer-events: none이라 아래에 있는 상자가 잡힌다.
    const over = targetOf(document.elementFromPoint(event.clientX, event.clientY));
    if (over !== drag.over) {
      drag.over?.classList.remove('is-over');
      over?.classList.add('is-over');
      drag.over = over;
    }
  }

  /**
   * 끌기를 끝낸다. commit이면 놓인 상자에 onDrop을 부른다.
   * 복제: 놓여서 item이 옮겨졌거나 없어졌으면(또는 onDrop이 true를 돌려주면) 그 자리에서 사라지고,
   * 놓을 곳이 아니었거나 item이 제자리에 그대로면(또는 onDrop이 false를 돌려주면) 제자리로 돌아간다.
   */
  function finishDrag(commit) {
    const { el, active, over, ghost, home } = drag;
    drag = null;
    listen(false);
    if (!active) return false; // 그냥 누른 것: click에서 선택 처리

    el.classList.remove('is-dragging');
    root.classList.remove('is-dragging-any');
    over?.classList.remove('is-over');
    let moved = true; // onDrop이 실패해도 복제는 남기지 않는다
    try {
      if (commit && over) {
        const result = onDrop(el, over);
        moved = result === true || (result !== false && !(el.isConnected && el.matches(itemSelector) && sameSpot(home, el.getBoundingClientRect())));
      } else moved = false;
    } finally {
      if (moved) ghost.ghost.remove();
      else returnGhost(ghost, el);
    }
    return true;
  }

  /** 끌기 직후 따라오는 click이 "선택"으로 처리되지 않게 한 번 막는다 */
  function swallowNextClick() {
    suppressClick = true;
    clearTimeout(suppressTimer);
    suppressTimer = setTimeout(() => {
      suppressClick = false;
    }, 0);
  }

  function onPointerUp(event) {
    if (!drag || event.pointerId !== drag.id) return;
    if (finishDrag(true)) swallowNextClick();
  }

  function onPointerCancel(event) {
    if (!drag || event.pointerId !== drag.id) return;
    if (finishDrag(false)) swallowNextClick();
  }

  let pendingRelease = null; // 그만둔 끌기의 포인터가 떼어지기를 기다리는 리스너

  function clearRelease() {
    if (!pendingRelease) return;
    window.removeEventListener('pointerup', pendingRelease, true);
    window.removeEventListener('pointercancel', pendingRelease, true);
    pendingRelease = null;
  }

  /**
   * 포인터를 누른 채 끌기를 그만둔다(Esc·창이 가려짐): 복제는 제자리로 돌아가고 놓기는 일어나지 않는다.
   * waitRelease: 포인터가 아직 눌려 있으니(Esc) 떼어질 때 따라오는 click까지 막는다
   */
  function abortDrag({ waitRelease = false } = {}) {
    if (!drag?.active) return false;
    finishDrag(false);
    clearRelease();
    if (!waitRelease) {
      swallowNextClick();
      return true;
    }
    suppressClick = true;
    clearTimeout(suppressTimer);
    pendingRelease = () => {
      clearRelease();
      swallowNextClick();
    };
    window.addEventListener('pointerup', pendingRelease, true);
    window.addEventListener('pointercancel', pendingRelease, true);
    return true;
  }

  function onKeyDown(event) {
    if (event.key !== 'Escape') return;
    if (abortDrag({ waitRelease: true })) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function onBlur() {
    if (!abortDrag() && drag) {
      // 끌기 전(누르기만 한 상태)에 창이 가려졌다: 기다리던 것을 버린다
      drag = null;
      listen(false);
    }
  }

  root.addEventListener('click', onClick);
  root.addEventListener('pointerdown', onPointerDown);

  return {
    clearSelection: () => select(null),
    destroy() {
      root.removeEventListener('click', onClick);
      root.removeEventListener('pointerdown', onPointerDown);
      listen(false);
      clearRelease();
      clearTimeout(suppressTimer);
      if (drag?.active) {
        drag.ghost.ghost.remove();
        drag.el.classList.remove('is-dragging');
        drag.over?.classList.remove('is-over');
        root.classList.remove('is-dragging-any');
      }
      for (const entry of [...returning]) endReturn(entry);
      select(null);
      drag = null;
    },
  };
}
