/**
 * 직접 만드는 전개도 화면: 직육면체 차시의 마지막 단계 "내 맘대로 직육면체 전개도"(cuboid-free, spec 16-2)와
 * 도전 주문서 "직육면체 도감 주문"(cuboid-dex, spec 16-16).
 *
 * 상자의 가로·세로·높이(1~4 cm)를 정하면 그 상자의 면 카드 6장(크기가 같은 면이 두 장씩)이 나오고, 1 cm 칸 판에 마음대로 놓고 → [접어 보기] →
 * 놓은 그대로 접힌다. 정육면체 차시의 "내 맘대로 전개도"(play-free.js)와 같은 조건이다(common-rules 1~3절):
 * - 상자 크기 정하기(spec 16-16): [크기 바꾸기] → 오른쪽 판의 ± 버튼으로 고르면 매트에 그 직육면체가 나타난다(끌어서 돌려 볼 수 있고, 가로·세로·높이 이름표).
 *   [이 크기로 만들기]로 면 카드와 놓는 판이 그 상자에 맞게 바뀐다(판에 놓인 면이 있으면 한 번 묻고 모두 거둔다). 처음 상자는 지금까지와 같은 1·2·3 cm
 * - 같은 전개도는 상자 종류(세 길이가 다름 · 두 길이가 같음 · 정육면체)마다 길이 순서로 맞춘 이름으로 센다 — 크기만 바꿔 다시 접으면 새로 세지 않는다
 * - 접기 전에 될지 묻지 않는다. 확인 버튼은 [접어 보기] 하나
 * - 판정·표시는 판별 단계와 같은 checkNet + view.reveal(). 안 되면 "왜 안 될까요?"가 먼저 — 고르기(넘어가기) 전에는 까닭 문장도 무대의 까닭 표시도 없다
 * - 내 맘대로: 별은 이번 판에 찾은 서로 다른 전개도 수(2가지부터 끝낼 수 있고 3가지면 별 3개). 안 되는 모양을 접어도 별이 깎이지 않는다
 * - 도감 주문: 세 길이가 모두 다른 상자만. 찾은 전개도가 54칸 도감에 쌓이고 판을 넘어 이어진다. 별은 도감 수(10가지 ★1 · 20가지 ★2 · 30가지 ★3),
 *   [오늘은 여기까지]로 끝낸다(이번 판에 접어 본 모양이 있으면 언제든). 54칸을 다 채우면 [결과 보기]만 남는다
 * - 점수는 전개도마다 이 기기에서 한 번만: 처음 찾은 전개도 = 만들기 성공(scored: 'once') + 등록 점수, 그 자리에서 바로 저장.
 *   찾아본 전개도는 기록에는 넣고 점수는 없다(scored: false). 같은 모양(돌리기·뒤집기·크기만 바꾼 것 포함)을 이번 판에 다시 접으면 기록도 없다
 * - 점수 상한(사용자 결정 2026-10-11 · 2026-10-16): 이 기기에서 처음 찾는 직육면체 전개도(세 길이가 다른 것과 두 길이가 같은 것을 합쳐서) 10가지까지만
 *   위와 같고, 11번째부터는 새로 찾을 때마다 등록 +1점뿐이다(만들기 성공 점수 없음 — scored: false). 정육면체 상자로 찾은 것은 정육면체 도감의 규칙
 * - 안 되는 모양은 끝없이 많아 "모양마다 한 번"을 적어 둘 수 없다 → 기록(오개념 tag)과 까닭 고르기는 있지만 점수는 없다
 */
import { XP } from '../../shared/core/rewards.js';
import { icon } from '../../shared/ui/icons.js';
import {
  BOX_AXES,
  BOX_KINDS,
  BOX_MAX,
  BOX_MIN,
  CUBOID_DEX_COUNT,
  CUBOID_FOLD_NOTES,
  CUBOID_FREE_EXPECTED,
  CUBOID_FREE_FULL,
  CUBOID_FREE_GOAL,
  CUBOID_FREE_REASONS,
  CUBOID_FREE_REPLAY_NOTE,
  CUBOID_HINT_AFTER_INVALID,
  CUBOID_LATER_NOTE,
  DEFAULT_BOX,
  boxBoard,
  boxCards,
  boxCardsText,
  boxHintText,
  boxKind,
  boxNotice,
  boxSolidNet,
  boxText,
  centerOnBoard,
  createCuboidFreeSession,
  cuboidDexHighlights,
  cuboidDexMilestone,
  cuboidDexNextStar,
  cuboidDexStarNote,
  cuboidDexStars,
  cuboidDexStats,
  cuboidFreeFeedback,
  cuboidFreeHighlights,
  cuboidFreeStarNote,
  cuboidFreeStars,
  cuboidFreeStats,
  cuboidFreeSummary,
  cuboidHintNet,
  freeNets,
  isLaterNet,
  judgeCuboidReason,
  primaryCuboidProblem,
  rectReadiness,
  sameBox,
} from './cuboid-logic.js';
import { faceRect } from './fold.js';
import { createRectBoard, rectAdapter } from './free-board.js';
import { HINT_AFTER_MS } from './logic.js';
import { createReasonPick } from './play-judge.js';
import { miniRects } from './thumbs.js';
import { MAT_TOOLS_LIFT, createFoldTools, createNetView } from './view3d.js';

const PHONE = '(max-width: 560px)';
/** 무대 도장을 크게 찍는 가지 수(이 기기에서 찾은 직육면체 전개도) */
const MILESTONES = [5, 10, 20, 30, 40, 54];
const cm = (value) => `${Math.round(value * 100) / 100} cm`;
const FACE_COUNT = 6;

export function playCuboidFree(stage, ctx) {
  const { h } = ctx;
  const dexMode = stage.kind === 'cdex'; // 직육면체 도감 주문: 목표가 이번 판 3가지 대신 이 기기의 도감 54칸
  const phone = Boolean(globalThis.matchMedia?.(PHONE).matches);
  let box = [...DEFAULT_BOX];
  let size = boxBoard(box, { phone });
  const goal = dexMode ? CUBOID_DEX_COUNT : (stage.count ?? CUBOID_FREE_GOAL);
  const foundOf = (kind) => ctx.collection(BOX_KINDS[kind].collection).found;
  /** 이 기기에서 찾은 직육면체 전개도 수(세 길이가 다른 것 + 두 길이가 같은 것 — 점수 상한을 세는 수) */
  const cuboidCount = () => foundOf('distinct').size + foundOf('pair').size;
  const dexCount = () => foundOf('distinct').size;
  const session = createCuboidFreeSession({
    stageId: stage.id, goal, box, dex: dexMode, found: [...foundOf('distinct')], foundPair: [...foundOf('pair')], foundCube: [...foundOf('cube')],
  });
  freeNets(); // 전개도 54가지를 미리 펼쳐 둔다(처음 접는 순간이 늦어지지 않게)
  const foundRects = []; // 이번 판에 찾은 전개도의 그림(놓은 모습) { id, rects, isNew }
  const newThisPlay = new Set(); // 도감 주문: 이번 판에 도감에 처음 넣은 칸 ("새로!")
  const earned = { answer: 0, nets: 0 };
  const playXp = () => ctx.reward.peek?.().xp ?? 0;
  let mode = 'edit'; // edit(놓기) · fold(접은 장면) · choose(상자 크기 정하기)
  let reached = session.done(); // 끝낼 수 있는 가지 수를 채웠다(도감 주문은 54칸을 다 채웠다)
  let lastSame = null; // 도감 주문: 방금 접은, 도감에 이미 있던 칸

  // ── 매트: 놓는 판 ↔ 3D 무대 (+ 상자 보기 · 도감 보기) ─────────────────
  const view = createNetView({ h, sfx: ctx.sfx });
  const tools = createFoldTools({ ctx, view });
  const host = h('div', { class: 'free-host' });
  const legend = h('p', { class: 'board-legend' }, icon('hand'), '칸 누르기: 놓기 · 면 끌기: 옮기기 · 면 두 번 누르기: 돌리기');
  const hintTextEl = h('span', null, boxHintText(box));
  const sticky = h('p', { class: 'hint-sticky', hidden: true }, icon('bulb'), hintTextEl);
  const stamp = h('div', { class: 'stamp found-stamp', hidden: true, 'aria-hidden': 'true' });
  // 이름은 aria-label로도 준다: 휴대폰에서는 자리가 좁아 [모두 빼기]·[되돌리기]의 글자를 숨기고 그림만 보인다
  const tool = (cls, iconName, text, onclick) => h('button', { type: 'button', class: `btn ${cls}`, 'aria-label': text, title: text, onclick }, icon(iconName), h('span', null, text));
  const clearBtn = tool('tool-clear', 'trash', '모두 빼기', () => board.clearAll());
  const undoBtn = tool('tool-undo', 'undo', '되돌리기', () => board.undo());
  const turnBtn = tool('tool-turn', 'rotr', '돌리기', () => board.rotate());
  const hintBtn = tool('tool-hint', 'bulb', '힌트', () => useHint());
  hintBtn.hidden = true;
  const finishTool = h('button', { type: 'button', class: 'btn btn-primary tool-finish', hidden: true, onclick: () => finish() }, '결과 보기', icon('play'));
  const statusCount = h('b', null, `0 / ${FACE_COUNT}`);
  const statusExtra = h('span', { class: 'status-extra' });
  const status = h('p', { class: 'mat-status', 'aria-hidden': 'true' }, icon('grid'), h('span', null, '놓은 면'), statusCount, statusExtra);
  const editTools = h('div', { class: 'mat-tools edit-tools' }, clearBtn, undoBtn, turnBtn, hintBtn, finishTool, status);

  // 상자 보기: 크기를 고르는 동안 매트에 그 직육면체(끌어서 돌려 본다 — 답을 알려 주는 것이 아니라 언제든 돌려도 된다)
  const boxView = createNetView({ h });
  boxView.el.setAttribute('aria-label', '고른 상자. 끌거나 방향키로 돌려 보고, 더하기·빼기 키로 크게·작게 볼 수 있어요.');
  const boxCaption = h('p', { class: 'box-caption', 'aria-hidden': 'true' });
  const boxStage = h('div', { class: 'box-stage', hidden: true }, boxView.el, boxCaption);

  // 도감 보기(도감 주문): 매트 위에 54칸
  const dexBoardCount = h('span', { class: 'dex-board-count' });
  const dexBoardClose = h('button', { type: 'button', class: 'btn dex-board-close', onclick: () => showDexBoard(false) }, icon('grid'), h('span', null, '판으로 돌아가기'));
  const dexBoardGrid = h('ul', { class: 'dex-board-grid' });
  const dexBoard = h('section', { class: 'dex-board', hidden: true, 'aria-label': '직육면체 전개도 도감' },
    h('div', { class: 'dex-board-head' }, h('b', null, icon('book'), '직육면체 전개도 도감'), dexBoardCount, dexBoardClose),
    dexBoardGrid,
  );
  const mat = h('div', { class: 'mat free-mat' }, legend, sticky, host, boxStage, dexBoard, stamp, editTools, tools.el, tools.pad);

  // ── 작업 지시서: 설계 주문 · 도감 주문 ────────────────────
  const order = ctx.ui.order({ kind: stage.order ?? '설계 주문', label: '설계 판' });
  order.counter.classList.add('q-counter');
  const foldBtn = h('button', { type: 'button', class: 'btn btn-primary free-fold', disabled: true, onclick: () => foldNow() }, icon('play'), h('span', null, '접어 보기'));
  const foldNote = h('p', { class: 'free-note' });
  const boxTip = h('span', { class: 'tray-tip box-tip' });
  const boxBtn = h('button', { type: 'button', class: 'btn box-change', onclick: () => enterChoose() }, icon('cube'), h('span', null, '크기 바꾸기'));
  const traySlot = h('div', { class: 'tray' }, h('div', { class: 'tray-head box-head' }, h('b', null, '면 카드'), boxTip, boxBtn));
  const editSection = h('div', { class: 'free-edit' }, traySlot, h('div', { class: 'free-go' }, foldBtn, foldNote));
  const noteSlot = h('div', { class: 'reason-slot' });
  const pickSlot = h('div', { class: 'pick-slot' });
  const bonusSlot = h('div', { class: 'bonus-slot' });
  const buttonsSlot = h('div', { class: 'free-buttons' });
  const resultSection = h('div', { class: 'free-result', hidden: true }, noteSlot, pickSlot, bonusSlot);

  // 상자 크기 정하기: 가로·세로·높이를 1~4 cm에서 (± 버튼 48px, 화면 읽기 "가로 2 cm")
  let pending = [...box];
  const steppers = BOX_AXES.map((axis, i) => {
    const value = h('b', { class: 'box-value' });
    const less = h('button', { type: 'button', class: 'btn box-step box-less', 'aria-label': `${axis} 줄이기`, onclick: () => stepBox(i, -1) }, '-');
    const more = h('button', { type: 'button', class: 'btn box-step box-more', 'aria-label': `${axis} 늘리기`, onclick: () => stepBox(i, 1) }, '+');
    const group = h('div', { class: 'box-stepper', role: 'group', dataset: { axis: String(i) } }, h('span', { class: 'box-axis' }, axis), less, value, more);
    return { group, value, less, more };
  });
  const chooseCards = h('p', { class: 'box-cards' });
  const chooseNotice = h('p', { class: 'box-notice', role: 'status' });
  const chooseApply = h('button', { type: 'button', class: 'btn btn-primary box-apply', onclick: () => applyBox() }, '이 크기로 만들기');
  const chooseCancel = h('button', { type: 'button', class: 'btn box-cancel', onclick: () => leaveChoose() }, '그대로 두기');
  const chooseButtons = h('div', { class: 'btn-pair box-buttons' }, chooseApply, chooseCancel);
  const chooseConfirm = h('div', { class: 'box-confirm', hidden: true });
  const chooseSection = h('section', { class: 'box-chooser', hidden: true, 'aria-label': '상자 크기 정하기' },
    h('p', { class: 'box-chooser-head' }, h('b', null, icon('cube'), '상자 크기 정하기'), h('span', { class: 'box-range' }, `${BOX_MIN}~${BOX_MAX} cm`)),
    h('div', { class: 'box-steppers' }, steppers.map((s) => s.group)),
    chooseCards, chooseNotice, chooseButtons, chooseConfirm,
  );

  // 찾은 전개도 띠(내 맘대로): 이번 판에 찾은 것 3칸(2칸째부터 끝낼 수 있고 3칸째가 별 3개) + 이 기기에서 찾은 가지 수
  const foundSlots = Array.from({ length: CUBOID_FREE_FULL }, () => h('li', { class: 'found-slot is-empty' }));
  const foundCount = h('span', { class: 'found-count' });
  const foundGrid = h('ul', { class: 'found-grid' }, foundSlots);
  const foundEl = h('section', { class: 'found-nets', 'aria-label': '찾은 전개도' },
    h('div', { class: 'found-head' }, h('b', null, icon('book'), '찾은 전개도'), foundCount),
    foundGrid,
  );
  // 도감 띠(도감 주문): 도감 수 + 별 기준 막대 + [도감 보기]
  const dexMeter = h('span', { class: 'dex-meter-fill' });
  const dexMarks = [10, 20, 30].map((n) => h('span', { class: 'dex-meter-mark', style: { left: `${(n / CUBOID_DEX_COUNT) * 100}%` } }, h('small', null, `${n}`)));
  const dexOpen = h('button', { type: 'button', class: 'btn dex-open', onclick: () => showDexBoard(true) }, icon('book'), h('span', null, '도감 보기'));
  const dexStripCount = h('span', { class: 'found-count dex-strip-count' });
  const dexStripRow = h('div', { class: 'dex-strip-row' }, h('span', { class: 'dex-meter', 'aria-hidden': 'true' }, dexMeter, dexMarks), dexOpen);
  const dexStrip = h('section', { class: 'found-nets dex-strip', 'aria-label': '직육면체 전개도 도감' },
    h('div', { class: 'found-head' }, h('b', null, icon('book'), '직육면체 도감'), dexStripCount),
    dexStripRow,
  );
  const shelf = dexMode ? dexStrip : foundEl;
  const shelfBody = dexMode ? dexStripRow : foundGrid;
  /** 판 안쪽이 넘칠 때만 띠를 접고 머리 한 줄만 남긴다 (도감 칸과 같은 규칙, spec 16-10) */
  function fitShelf() {
    const fold = (value) => {
      shelf.classList.toggle('is-folded', value);
      shelfBody.hidden = value;
    };
    fold(false);
    if (mode === 'choose') return;
    if (order.el.scrollHeight > order.el.clientHeight) {
      fold(true);
      return;
    }
    if (mode !== 'fold') return;
    const pageOver = () => document.documentElement.scrollHeight > globalThis.innerHeight;
    if (!pageOver()) return;
    fold(true);
    if (pageOver()) fold(false);
  }
  order.el.classList.add('net-panel', 'free-panel');
  order.el.append(editSection, chooseSection, resultSection, shelf, buttonsSlot);

  const bench = h('div', { class: `workbench free-play cuboid-free${dexMode ? ' cuboid-dex' : ''}` }, mat, order.el);
  ctx.el.append(bench);
  ctx.feedback.anchor?.(mat, { lift: MAT_TOOLS_LIFT, narrow: 'below' });

  // ── 놓는 판: 상자가 바뀌면 카드·판을 새로 만든다 ─────────────────
  let board = null;
  function buildBoard() {
    if (board) {
      board.destroy();
      board.el.remove();
      board.trayEl.remove();
    }
    size = boxBoard(box, { phone });
    board = createRectBoard({ ctx, adapter: rectAdapter({ ...size, cards: boxCards(box) }), root: bench, onChange: (_, message) => update(message) });
    traySlot.append(board.trayEl);
    host.prepend(board.el);
    boxTip.textContent = boxText(box);
    hintTextEl.textContent = boxHintText(box);
    board.fit(host);
  }
  host.append(view.el);
  buildBoard();
  view.el.hidden = true;
  tools.el.hidden = true;
  tools.pad.hidden = true;

  const resizer = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => {
      board.fit(host);
      fitShelf();
    })
    : null;
  resizer?.observe(host);
  resizer?.observe(order.el);

  // ── 놓는 판 상태 ────────────────────────────
  let lastReason = 'count';
  function update(message = null) {
    if (mode !== 'edit') return;
    const st = board.state();
    const r = rectReadiness(st.rects, FACE_COUNT);
    let extra = '';
    if (r.reason !== lastReason) {
      if (r.ready) extra = ' 이제 접어 볼 수 있어요.';
      else if (r.reason === 'apart') extra = ' 떨어진 면이 있어요. 한 장으로 이어 놓아야 접을 수 있어요.';
    }
    lastReason = r.reason;
    if (message || extra) ctx.feedback.announce(`${message ?? ''}${extra}`.trim());
    board.markDetached(r.reason === 'apart' ? r.detached.map((i) => st.labels[i]) : []);
    foldBtn.disabled = !r.ready;
    foldNote.classList.toggle('is-wrong', r.reason === 'apart');
    foldNote.textContent = CUBOID_FOLD_NOTES[r.reason ?? 'ready'];
    statusCount.textContent = `${st.count} / ${st.total}`;
    statusExtra.textContent = r.reason === 'apart' ? ' · 떨어진 면이 있어요' : '';
    undoBtn.disabled = !board.canUndo();
    clearBtn.disabled = st.count === 0;
    turnBtn.disabled = !board.canRotate();
  }

  function setProgress() {
    if (dexMode) {
      // 머리의 막대는 별(10 · 20 · 30가지) 세 칸: 54칸을 점으로 늘어놓으면 머리가 넘친다. 도감 수는 작업 지시서와 도감 띠에
      const count = dexCount();
      const stars = cuboidDexStars(count);
      order.setCounter(`직육면체 도감 ${count} / ${CUBOID_DEX_COUNT}`);
      ctx.setProgress?.(stars, 3, { label: '별', done: stars, check: true });
      return;
    }
    const found = session.found().size;
    order.setCounter(`찾은 전개도 ${found}가지`);
    ctx.setProgress?.(Math.min(found, CUBOID_FREE_FULL), CUBOID_FREE_FULL, { label: '찾은 전개도', done: found, check: true });
  }

  /** 찾은 전개도 띠: 이번 판에 찾은 것의 작은 그림. 이번에 처음 찾은 칸은 "새로!" — 도감 주문은 도감 수와 별 기준 막대 */
  function renderShelf() {
    if (dexMode) {
      const count = dexCount();
      dexStripCount.textContent = `${count} / ${CUBOID_DEX_COUNT}`;
      dexMeter.style.width = `${(count / CUBOID_DEX_COUNT) * 100}%`;
      dexMarks.forEach((mark, i) => mark.classList.toggle('is-reached', count >= [10, 20, 30][i]));
      dexOpen.setAttribute('aria-label', `도감 보기, 직육면체 전개도 ${count} / ${CUBOID_DEX_COUNT}`);
      if (!dexBoard.hidden) renderDexBoard();
      return;
    }
    foundSlots.forEach((slot, i) => {
      const item = foundRects[i];
      slot.className = `found-slot${item ? ' is-found' : ' is-empty'}${item?.isNew ? ' is-new' : ''}`;
      slot.setAttribute('aria-label', item ? `${i + 1}번째로 찾은 전개도${item.isNew ? ', 처음 찾음' : ''}` : `${i + 1}번째 칸, 아직 못 찾음`);
      slot.replaceChildren(item ? miniRects(item.rects) : h('small', null, i + 1 === CUBOID_FREE_FULL ? '별 3개' : i + 1 === goal ? '별 2개' : '별 1개'));
    });
    foundCount.textContent = `지금까지 ${cuboidCount()}가지`;
  }

  // ── 도감 보기 (도감 주문): 54칸 — 찾은 칸은 그 전개도의 작은 그림, 못 찾은 칸은 "?" ─────
  const dexThumbs = new Map();
  function dexThumb(id) {
    if (!dexThumbs.has(id)) dexThumbs.set(id, freeNets().find((n) => n.id === id)?.net.faces.map(faceRect) ?? []);
    return miniRects(dexThumbs.get(id));
  }
  function renderDexBoard() {
    const found = foundOf('distinct');
    dexBoardCount.textContent = `${found.size} / ${CUBOID_DEX_COUNT}`;
    dexBoardGrid.replaceChildren(...freeNets().map((n, i) => {
      const got = found.has(n.id);
      // 못 찾은 칸에는 전개도를 알 수 있는 것(그림·이름·속성)을 두지 않는다
      const cls = `dex-cell${got ? ' is-found' : ' is-empty'}${got && newThisPlay.has(n.id) ? ' is-new' : ''}${got && lastSame === n.id ? ' is-same' : ''}`;
      return h('li', { class: cls, 'aria-label': got ? `도감 ${i + 1}번 직육면체 전개도${newThisPlay.has(n.id) ? ', 이번에 찾음' : ''}${lastSame === n.id ? ', 방금 접은 모양' : ''}` : `도감 ${i + 1}번, 아직 못 찾음` },
        got ? dexThumb(n.id) : h('span', { 'aria-hidden': 'true' }, '?'));
    }));
  }
  let dexReturn = null;
  function showDexBoard(open) {
    if (open) {
      renderDexBoard();
      dexReturn = document.activeElement;
      dexBoard.hidden = false;
      dexBoardClose.focus({ preventScroll: true });
      ctx.feedback.announce(`직육면체 전개도 도감 ${dexCount()} / ${CUBOID_DEX_COUNT}`);
      return;
    }
    dexBoard.hidden = true;
    (dexReturn?.isConnected && !dexReturn.closest('[hidden]') ? dexReturn : dexOpen).focus({ preventScroll: true });
  }
  dexBoard.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      showDexBoard(false);
    }
  });

  // ── 힌트 (느린 학생) ──────────────────────────
  let hintTimer = null;
  let hintLevel = 0;
  const hintText = hintBtn.querySelector('span');
  function armHintTimer() {
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => setHintReady(true), HINT_AFTER_MS);
  }
  function setHintReady(value) {
    const show = value && !reached;
    if (show && hintBtn.hidden) ctx.feedback.announce('막히면 힌트 버튼을 눌러 보세요.');
    hintBtn.hidden = !show;
  }
  function resetHint() {
    hintLevel = 0;
    hintText.textContent = '힌트';
    sticky.hidden = true;
    legend.hidden = mode !== 'edit';
    board.clearShadow();
    setHintReady(false);
    armHintTimer();
  }
  function useHint() {
    ctx.sfx.play('click');
    if (hintLevel === 0) {
      hintLevel = 1;
      sticky.hidden = false;
      legend.hidden = true;
      hintText.textContent = '그림자 힌트';
      ctx.feedback.announce(boxHintText(box));
      return;
    }
    if (board.hasShadow()) {
      board.clearShadow();
      hintText.textContent = '그림자 힌트';
      return;
    }
    // 그림자: 아직 못 찾은 전개도 하나 — 이 기기에서 아직 찾지 않은 것을 먼저. 도감 주문은 도감에 없는 것
    const kindFound = foundOf(boxKind(box));
    const net = cuboidHintNet(dexMode ? kindFound : session.found(), size, kindFound, box);
    const rects = net ? centerOnBoard(net.net, size) : null;
    if (!rects) return;
    hintLevel = 2;
    board.showShadow(rects);
    hintText.textContent = '그림자 끄기';
    ctx.feedback.announce('판에 점선 자리가 생겼어요. 그 자리에 크기가 맞는 면을 놓아 보세요.');
  }

  // ── 모드 ────────────────────────────────────
  function enterEdit({ keep = true } = {}) {
    order.el.classList.remove('is-picking', 'is-choosing');
    if (mode === 'fold') {
      view.setT(0);
      ctx.feedback.clear?.();
    }
    mode = 'edit';
    view.el.hidden = true;
    tools.el.hidden = true;
    tools.pad.hidden = true;
    stamp.hidden = true;
    boxStage.hidden = true;
    resultSection.hidden = true;
    chooseSection.hidden = true;
    showStop();
    board.el.hidden = false;
    editTools.hidden = false;
    editSection.hidden = false;
    sticky.hidden = hintLevel === 0;
    legend.hidden = !sticky.hidden;
    finishTool.hidden = dexMode || !reached;
    if (!finishTool.hidden) finishTool.classList.toggle('btn-primary', session.found().size >= CUBOID_FREE_FULL); // 2가지면 보통 버튼, 3가지부터 주 버튼 (spec 16-15)
    board.setEnabled(true);
    if (!keep) board.clearAll();
    renderShelf();
    update();
    board.fit(host);
    fitShelf();
  }

  function enterFold() {
    mode = 'fold';
    board.setEnabled(false);
    board.el.hidden = true;
    legend.hidden = true;
    sticky.hidden = true;
    editTools.hidden = true;
    editSection.hidden = true;
    view.el.hidden = false;
    tools.el.hidden = false;
    tools.pad.hidden = false;
    resultSection.hidden = false;
  }

  // ── 상자 크기 정하기 ─────────────────────────────
  /** 매트의 상자: 그 크기로 접은 직육면체 + 가로·세로·높이 이름표 */
  function showBox(dims) {
    // 윗면 · 앞면 · 오른쪽 옆면이 처음 시점에서 보이게: 세 이름표가 그 세 면이 만나는 꼭짓점에 모인다
    boxView.setNet(boxSolidNet(dims), { show: ['f0', 'f2', 'f5'] });
    boxView.setT(1);
    boxView.setViewEnabled(true);
    // 이름표: 윗면(가)의 가로·세로 모서리, 앞면(다)의 높이 모서리 — 면 id는 펼친 순서(윗면 f0 · 아랫면 f1 · 앞면 f2 …), 변은 입체의 꼭짓점 순서
    boxView.setEdgeMarks([
      { face: 'f0', edge: 0, tone: 'a', text: `가로 ${dims[0]} cm` },
      { face: 'f0', edge: 1, tone: 'a', text: `세로 ${dims[1]} cm` },
      { face: 'f2', edge: 1, tone: 'a', text: `높이 ${dims[2]} cm` },
    ]);
    boxCaption.textContent = boxKind(dims) === 'cube' ? `정육면체 · ${boxText(dims)}` : `직육면체 · ${boxText(dims)}`;
    boxView.el.setAttribute('aria-label', `고른 상자: ${boxCaption.textContent}. 끌거나 방향키로 돌려 볼 수 있어요.`);
  }

  function renderChooser() {
    steppers.forEach((s, i) => {
      s.value.textContent = cm(pending[i]);
      s.group.setAttribute('aria-label', `${BOX_AXES[i]} ${pending[i]} cm`);
      s.less.disabled = pending[i] <= BOX_MIN;
      s.more.disabled = pending[i] >= BOX_MAX;
    });
    chooseCards.textContent = `면 6장: ${boxCardsText(pending)}`;
    const notice = boxNotice(pending, { dex: dexMode });
    chooseNotice.textContent = notice?.text ?? '';
    chooseNotice.hidden = !notice;
    chooseNotice.classList.toggle('is-wrong', Boolean(notice?.block));
    chooseApply.disabled = Boolean(notice?.block);
    chooseConfirm.hidden = true;
    chooseButtons.hidden = false;
  }

  function stepBox(i, by) {
    const next = Math.max(BOX_MIN, Math.min(BOX_MAX, pending[i] + by));
    if (next === pending[i]) return;
    pending[i] = next;
    ctx.sfx.play('click');
    renderChooser();
    showBox(pending);
    const notice = boxNotice(pending, { dex: dexMode });
    ctx.feedback.announce(`${BOX_AXES[i]} ${next} cm${notice ? `. ${notice.text}` : ''}`);
  }

  function enterChoose() {
    if (mode !== 'edit') return;
    ctx.sfx.play('click');
    mode = 'choose';
    pending = [...box];
    board.setEnabled(false);
    board.el.hidden = true;
    legend.hidden = true;
    sticky.hidden = true;
    editTools.hidden = true;
    editSection.hidden = true;
    buttonsSlot.replaceChildren();
    dexBoard.hidden = true;
    order.el.classList.add('is-choosing');
    chooseSection.hidden = false;
    boxStage.hidden = false;
    renderChooser();
    showBox(pending);
    fitShelf();
    steppers[0].more.disabled ? steppers[0].less.focus({ preventScroll: true }) : steppers[0].more.focus({ preventScroll: true });
    ctx.feedback.announce(`상자 크기를 정해요. 지금 ${boxText(box)}.`);
  }

  function leaveChoose() {
    ctx.sfx.play('click');
    enterEdit({ keep: true });
    boxBtn.focus({ preventScroll: true });
  }

  function applyBox({ confirmed = false } = {}) {
    if (mode !== 'choose' || boxNotice(pending, { dex: dexMode })?.block) return;
    if (sameBox(pending, box)) {
      leaveChoose();
      return;
    }
    const count = board.state().count;
    if (count > 0 && !confirmed) {
      // 놓인 면이 있을 때만 한 번 묻는다: 크기를 바꾸면 판의 면을 모두 거둔다
      const yes = h('button', { type: 'button', class: 'btn btn-primary box-confirm-yes', onclick: () => applyBox({ confirmed: true }) }, '바꾸기');
      const no = h('button', { type: 'button', class: 'btn box-confirm-no', onclick: () => renderChooser() }, '취소');
      chooseConfirm.replaceChildren(h('p', { class: 'box-confirm-text' }, `판에 놓은 면 ${count}장을 모두 거두고 새 크기의 면 카드로 바꿀까요?`), h('div', { class: 'btn-pair' }, yes, no));
      chooseButtons.hidden = true;
      chooseConfirm.hidden = false;
      yes.focus({ preventScroll: true });
      ctx.feedback.announce(`판에 놓은 면 ${count}장을 모두 거두고 새 크기의 면 카드로 바꿀까요?`);
      return;
    }
    box = [...pending];
    session.setBox(box);
    board.clearShadow();
    buildBoard();
    hintTextEl.textContent = boxHintText(box);
    ctx.sfx.play('click');
    enterEdit({ keep: true });
    ctx.feedback.announce(`상자를 바꿨어요. ${boxText(box)}. 면 카드 6장: ${boxCardsText(box)}.`);
    board.trayEl.querySelector('.rect-card')?.focus({ preventScroll: true });
  }

  /** 까닭 표시: 길이가 다른 두 변에 같은 무늬 띠와 길이 이름표 (까닭을 고른 뒤에만) */
  function showMarks(step) {
    view.reveal(step.valid && step.box === 'cube' ? { ok: true, text: '정육면체가 됐어요' } : null);
    if (step.valid) return;
    const problem = primaryCuboidProblem(step.problems);
    const mismatch = problem?.type === 'edge-length' ? problem : null;
    view.setEdgeMarks((mismatch?.edges ?? []).map((e, i) => ({ face: e.face, edge: e.edge, tone: 'a', text: cm(mismatch.lengths[i]) })));
  }

  // ── 접어 보기 ─────────────────────────────
  function foldNow() {
    if (mode !== 'edit') return;
    const st = board.state();
    if (!rectReadiness(st.rects, FACE_COUNT).ready) return;
    dexBoard.hidden = true;
    const layout = board.layout(); // 판을 숨기기 전에 칸 크기·자리를 잰다
    const dexBefore = dexCount();
    const before = playXp();
    const step = session.fold(st.rects);
    // 등록이 먼저다: 전개도는 접는 순간 "찾아본 전개도"가 되고(등록 점수와 함께 바로 저장), 만들기 성공 점수는 그때 실제로 새로 들어간 전개도에만 준다
    const collected = step.collect ? ctx.collect(step.collect.id, step.collect.item) : null;
    const afterCollect = playXp();
    const first = step.first && Boolean(collected?.isNew);
    // 점수 상한: 이 기기에서 11번째부터 찾은 직육면체 전개도는 등록 +1점뿐이다(엔진이 xpAfter로 준다) — 만들기 성공 점수는 주지 않는다.
    // 몇 번째인지는 엔진이 등록한 뒤의 두 모음(세 길이가 다른 것 + 두 길이가 같은 것)의 가지 수로 센다(엔진의 xpAfter.with와 같은 값)
    const later = first && step.box !== 'cube' && isLaterNet(cuboidCount());
    // 기록: 접은 것 하나가 학습 기록 하나 — 직육면체가 되면 맞음, 안 되면 그 까닭의 오개념 tag (안 되는 모양은 점수 없음)
    if (step.log) ctx.log.answer({ itemId: step.itemId, correct: step.valid, tag: step.tag, given: step.given, expected: CUBOID_FREE_EXPECTED, scored: first && !later ? 'once' : false });
    const gain = { discover: afterCollect - before, answer: playXp() - afterCollect };
    earned.answer += gain.answer;
    earned.nets += gain.discover;
    if (step.valid && step.kind !== 'repeat' && !foundRects.some((f) => f.id === step.id)) foundRects.push({ id: step.id, rects: st.rects.map((r) => ({ ...r })), isNew: first });
    if (first && step.box === 'distinct') newThisPlay.add(step.id);
    lastSame = step.valid && step.kind !== 'new' && step.box === 'distinct' ? step.id : null;

    enterFold();
    if (!globalThis.matchMedia?.('(min-width: 901px)').matches) mat.scrollIntoView?.({ block: 'nearest' });
    const problem = step.valid ? null : primaryCuboidProblem(step.problems);
    view.setNet(step.net, { layout, show: problem?.type === 'edge-length' ? problem.faces : [] });
    const feedback = cuboidFreeFeedback(step);
    const reasonFirst = !feedback.marks;
    if (feedback.marks) showMarks(step);
    tools.reset();
    tools.lock(false);
    view.animateTo(1);

    if (step.kind === 'repeat') ctx.sfx.play('click');
    if (feedback.tone === 'correct') {
      ctx.sfx.play('correct');
      ctx.feedback.correct(feedback.toast);
    } else ctx.feedback.info(feedback.toast);

    if (first) showStamp(step);
    const milestone = dexMode && first && step.box === 'distinct' ? cuboidDexMilestone(dexBefore, dexCount()) : '';
    showNote(step, feedback, milestone);
    showBonus(step, first, gain, later);
    renderShelf();
    setProgress();

    const progressed = dexMode ? first && step.box === 'distinct' : step.valid && step.kind !== 'repeat';
    if (progressed) resetHint();
    else if (session.invalidRun() >= CUBOID_HINT_AFTER_INVALID) setHintReady(true);

    const before2 = reached;
    if (step.done) reached = true;
    if (reached) setHintReady(false);
    showButtons({ justReached: reached && !before2, step });

    pickSlot.replaceChildren();
    if (reasonFirst) {
      const pick = createReasonPick({
        ctx,
        itemId: step.itemId,
        problems: step.problems,
        reasons: CUBOID_FREE_REASONS,
        judge: (problems, choice) => judgeCuboidReason(problems, choice, 'free'),
        onDone: () => {
          order.el.classList.remove('is-picking');
          showMarks(step);
          showNote(step, cuboidFreeFeedback(step, { picked: true }), milestone);
          fitShelf();
          buttonsSlot.querySelector('button')?.focus({ preventScroll: true });
        },
      });
      pickSlot.append(pick.el);
      order.el.classList.add('is-picking');
      pick.focus();
    }
    fitShelf();
  }

  /** 무대 도장: 새 전개도 발견. 정육면체 상자는 정육면체 도감의 칸 수, 도감 주문은 별을 받는 가지 수(10 · 20 · 30)와 완성(54) */
  function showStamp(step) {
    let parts;
    if (step.box === 'cube') {
      const { found, total } = ctx.collection(BOX_KINDS.cube.collection);
      parts = ['새 전개도', '발견!', `도감 ${found.size} / ${total}`];
    } else if (dexMode && step.box === 'distinct') {
      const count = dexCount();
      if (count >= CUBOID_DEX_COUNT) parts = ['도감', '완성!', `${count}가지`];
      else if ([10, 20, 30].includes(count)) parts = ['도감', `${count}가지!`, `별 ${cuboidDexStars(count)}개`];
      else parts = ['새 전개도', '발견!', `도감 ${count} / ${CUBOID_DEX_COUNT}`];
    } else {
      const total = cuboidCount();
      const big = MILESTONES.includes(total);
      parts = big ? ['전개도', `${total}가지!`, '찾았어요'] : ['새 전개도', '발견!', `${total}가지째`];
    }
    stamp.replaceChildren(h('span', { class: 'stamp-inner' }, h('small', null, parts[0]), h('b', null, parts[1]), h('small', null, parts[2])));
    stamp.hidden = false;
    ctx.feedback.celebrate?.({ kind: 'found', at: stamp });
  }

  function showNote(step, feedback, extra = '') {
    const type = feedback.tone;
    const text = [feedback.note, extra].filter(Boolean).join(' ');
    const note = ctx.ui.note({ type, title: feedback.title, text });
    note.classList.add('reason', type === 'correct' ? 'is-correct' : type === 'wrong' ? 'is-wrong' : 'is-info');
    note.setAttribute('role', 'status');
    noteSlot.replaceChildren(note);
  }

  /** 보너스 쪽지: 이번 접기로 엔진이 준 점수를 글로 보인다. 점수는 이 기기에서 처음 찾은 전개도에만 있다(11번째부터는 +1점씩 — later) */
  function showBonus(step, first, gain, later = false) {
    const peek = ctx.reward.peek?.();
    bonusSlot.replaceChildren();
    if (!peek?.on || !step.valid) return;
    if (step.kind === 'repeat') {
      bonusSlot.replaceChildren(ctx.ui.bonus('같은 모양은 돌리거나 뒤집어도, 크기만 바꿔도 다시 세지 않아요. ', h('b', null, '새 모양'), '을 만들어 봐요.'));
      return;
    }
    if (!first) {
      bonusSlot.replaceChildren(ctx.ui.bonus(h('b', null, '전에 찾은 전개도'), '라 점수는 없어요.'));
      return;
    }
    const parts = [];
    if (gain.discover > 0) parts.push(`새 발견 +${gain.discover}`);
    if (gain.answer > 0) {
      parts.push(`만들기 성공 +${Math.min(gain.answer, XP.first)}`);
      if (gain.answer > XP.first) parts.push(`연속 +${gain.answer - XP.first}`);
    }
    if (parts.length > 0) bonusSlot.replaceChildren(ctx.ui.bonus(h('b', null, parts.join(' · ')), later ? ` · ${CUBOID_LATER_NOTE}` : null));
  }

  const actionButton = (cls, iconName, text, onclick, { after = false } = {}) => h('button', { type: 'button', class: `btn ${cls}`, onclick },
    after ? [h('span', null, text), icon(iconName)] : [icon(iconName), h('span', null, text)]);
  const backToBoard = (keep) => () => {
    ctx.sfx.play('click');
    enterEdit({ keep });
    board.focus();
  };

  /** 도감 주문의 [오늘은 여기까지]: 이번 판에 접어 본 모양이 있으면 언제든. 지금 끝내면 받는 별과 다음 별까지를 함께 적는다 */
  function stopButton() {
    const count = dexCount();
    const stars = cuboidDexStars(count);
    const next = cuboidDexNextStar(count);
    return h('button', { type: 'button', class: 'btn free-stop', onclick: () => finish() },
      h('span', { class: 'stop-main' }, icon('flag'), h('span', null, '오늘은 여기까지')),
      h('small', { class: 'stop-sub' }, `지금 끝내면 별 ${stars}개${next ? ` · ${next}가지면 별 ${stars + 1}개` : ''}`),
    );
  }
  const canStop = () => session.history().some((s) => s.log);

  /** 놓는 중의 아래쪽 줄 (도감 주문만): 54칸이면 [결과 보기], 접어 본 모양이 있으면 [오늘은 여기까지], 그 전에는 별 기준 안내 */
  function showStop() {
    if (!dexMode) {
      buttonsSlot.replaceChildren();
      return;
    }
    const count = dexCount();
    if (count >= CUBOID_DEX_COUNT) {
      buttonsSlot.replaceChildren(
        h('p', { class: 'goal-done' }, icon('check'), `직육면체 전개도 ${CUBOID_DEX_COUNT}가지를 모두 찾았어요!`),
        actionButton('btn-primary free-finish', 'play', '결과 보기', () => finish(), { after: true }),
      );
    } else if (canStop()) buttonsSlot.replaceChildren(stopButton());
    else buttonsSlot.replaceChildren(h('p', { class: 'dex-rule' }, icon('star'), '10가지 별 1개 · 20가지 별 2개 · 30가지 별 3개. 찾은 전개도는 다음에도 이어져요.'));
  }

  function showButtons({ justReached, step }) {
    const fix = actionButton('btn-primary free-fix', 'unfold', '펴서 고치기', backToBoard(true));
    const fresh = actionButton('free-new', 'trash', '새로 만들기', backToBoard(false));
    const result = actionButton('free-finish', 'play', '결과 보기', () => finish(), { after: true });
    if (dexMode) {
      if (reached) {
        // 54칸을 다 채웠다: [결과 보기]가 주 버튼 (마지막 전개도를 돌려 볼 시간을 준다 — 저절로 끝내지 않는다)
        result.classList.add('btn-primary');
        fix.classList.remove('btn-primary');
        const done = justReached ? h('p', { class: 'goal-done' }, icon('check'), `직육면체 전개도 ${CUBOID_DEX_COUNT}가지를 모두 찾았어요! 도감을 다 채웠어요.`) : null;
        buttonsSlot.replaceChildren(...[done, h('div', { class: 'btn-trio' }, result, fix, fresh)].filter(Boolean));
        result.focus({ preventScroll: true });
        return;
      }
      buttonsSlot.replaceChildren(h('div', { class: 'btn-trio has-stop' }, stopButton(), fix, fresh));
      fix.focus({ preventScroll: true });
      return;
    }
    const found = session.found().size;
    const full = found >= CUBOID_FREE_FULL;
    if (!reached) {
      buttonsSlot.replaceChildren(h('div', { class: 'btn-pair' }, fix, fresh));
      fix.focus({ preventScroll: true });
      return;
    }
    // 끝낼 수 있다: 2가지면 "한 가지 더"를 권하고(펴서 고치기가 주 버튼), 3가지면 [결과 보기]가 주 버튼
    const progressed = step.valid && step.kind !== 'repeat';
    const done = (justReached || (full && progressed)) ? h('p', { class: 'goal-done' }, icon('check'),
      full ? `서로 다른 전개도 ${found}가지를 찾았어요! 별 3개예요.` : `전개도 ${found}가지를 찾았어요! 한 가지 더 찾으면 별 3개예요.`) : null;
    if (full) fix.classList.remove('btn-primary');
    result.classList.toggle('btn-primary', full);
    buttonsSlot.replaceChildren(...[done, h('div', { class: 'btn-trio' }, full ? [result, fix, fresh] : [fix, fresh, result])].filter(Boolean));
    (full ? result : fix).focus({ preventScroll: true });
  }

  // ── 끝내기 ─────────────────
  function finish() {
    const sum = cuboidFreeSummary(session.history());
    if (dexMode) {
      if (!canStop() && dexCount() < CUBOID_DEX_COUNT) return;
      const count = dexCount();
      const stars = cuboidDexStars(count);
      ctx.finish({
        stars,
        starNote: cuboidDexStarNote(count),
        highlights: cuboidDexHighlights(sum, { earned, dexCount: count }),
        stats: cuboidDexStats(sum),
        practiceNote: CUBOID_FREE_REPLAY_NOTE,
      });
      return;
    }
    const found = session.found().size;
    if (found < goal) return;
    const stars = cuboidFreeStars(found);
    ctx.finish({
      stars,
      starNote: cuboidFreeStarNote(stars),
      highlights: cuboidFreeHighlights(sum, { earned, total: cuboidCount() }),
      stats: cuboidFreeStats(sum),
      practiceNote: CUBOID_FREE_REPLAY_NOTE,
    });
  }

  // Ctrl+Z: 되돌리기 (놓는 중일 때)
  function onKey(event) {
    if (mode !== 'edit' || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    event.preventDefault();
    board.undo();
  }
  document.addEventListener('keydown', onKey);

  setProgress();
  enterEdit({ keep: true });
  armHintTimer();

  return () => {
    clearTimeout(hintTimer);
    document.removeEventListener('keydown', onKey);
    resizer?.disconnect();
    board.destroy();
    tools.destroy();
    view.destroy();
    boxView.destroy();
  };
}
