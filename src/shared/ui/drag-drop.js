/**
 * 끌어다 놓기 + "눌러서 고르고, 놓을 곳 누르기"를 한 번에 지원한다.
 * - 마우스·터치·펜: 포인터 이벤트로 끌기
 * - 끌기가 어려운 학생·작은 태블릿: 카드를 누르고(선택) 상자를 누르기
 * - 키보드: item과 target을 <button>으로 만들면 Tab + Enter로 같은 동작
 *
 * item에는 class="dnd-item", target에는 class="dnd-target"을 붙인다.
 * onDrop(itemEl, targetEl)에서 정답 판정과 요소 이동을 게임이 직접 한다.
 * onDrop이 끝나면 끌던 위치는 원래대로 돌아간다(옮기려면 onDrop에서 appendChild).
 */
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

  function onPointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const item = itemOf(event.target);
    if (!item || drag) return;
    drag = { el: item, id: event.pointerId, x0: event.clientX, y0: event.clientY, active: false, over: null };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
  }

  function onPointerMove(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x0;
    const dy = event.clientY - drag.y0;
    if (!drag.active) {
      if (Math.hypot(dx, dy) < threshold) return;
      drag.active = true;
      select(null);
      drag.el.classList.add('is-dragging');
      root.classList.add('is-dragging-any');
    }
    event.preventDefault();
    drag.el.style.transform = `translate(${dx}px, ${dy}px)`;
    // is-dragging은 pointer-events: none이라 아래에 있는 상자가 잡힌다.
    const over = targetOf(document.elementFromPoint(event.clientX, event.clientY));
    if (over !== drag.over) {
      drag.over?.classList.remove('is-over');
      over?.classList.add('is-over');
      drag.over = over;
    }
  }

  function finishDrag(event, commit) {
    if (!drag || event.pointerId !== drag.id) return;
    const { el, active, over } = drag;
    drag = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
    if (!active) return; // 그냥 누른 것: click에서 선택 처리

    // 끌기 직후 따라오는 click이 "선택"으로 처리되지 않게 한 번 막는다.
    suppressClick = true;
    setTimeout(() => {
      suppressClick = false;
    }, 0);
    el.classList.remove('is-dragging');
    root.classList.remove('is-dragging-any');
    over?.classList.remove('is-over');
    el.style.transform = '';
    if (commit && over) onDrop(el, over);
  }

  const onPointerUp = (event) => finishDrag(event, true);
  const onPointerCancel = (event) => finishDrag(event, false);

  root.addEventListener('click', onClick);
  root.addEventListener('pointerdown', onPointerDown);

  return {
    clearSelection: () => select(null),
    destroy() {
      root.removeEventListener('click', onClick);
      root.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      select(null);
      drag = null;
    },
  };
}
