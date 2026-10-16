/**
 * 직접 만드는 전개도 화면: 직육면체 차시의 마지막 단계 "내 맘대로 직육면체 전개도" (cuboid-free, spec 16-2).
 *
 * 면 카드 6장(크기가 같은 면이 두 장씩)을 1 cm 칸 판에 마음대로 놓고 → [접어 보기] → 놓은 그대로 접힌다.
 * 정육면체 차시의 "내 맘대로 전개도"(play-free.js)와 같은 조건이다(common-rules 1~3절):
 * - 접기 전에 될지 묻지 않는다. 확인 버튼은 [접어 보기] 하나
 * - 판정·표시는 판별 단계와 같은 checkNet + view.reveal(). 안 되면 "왜 안 될까요?"가 먼저 — 고르기(넘어가기) 전에는 까닭 문장도 무대의 까닭 표시도 없다
 * - 별은 이번 판에 찾은 서로 다른 전개도 수(2가지부터 끝낼 수 있고 3가지면 별 3개). 안 되는 모양을 접어도 별이 깎이지 않는다
 * - 점수는 전개도마다 이 기기에서 한 번만: 처음 찾은 전개도 = 만들기 성공(scored: 'once') + 등록 점수, 그 자리에서 바로 저장.
 *   찾아본 전개도는 기록에는 넣고 점수는 없다(scored: false). 같은 모양(돌리기·뒤집기 포함)을 이번 판에 다시 접으면 기록도 없다
 * - 점수 상한(사용자 결정 2026-10-11): 이 기기에서 처음 찾는 10가지까지만 위와 같고, 11번째부터는 새로 찾을 때마다 등록 +1점뿐이다
 *   (만들기 성공 점수 없음 — scored: false). 몇 번째인지는 엔진이 등록한 뒤의 가지 수(ctx.collect의 count)로 센다
 * - 안 되는 모양은 끝없이 많아 "모양마다 한 번"을 적어 둘 수 없다 → 기록(오개념 tag)과 까닭 고르기는 있지만 점수는 없다
 * - 54가지는 도감 칸으로 보이지 않는다(spec 16-2): 이번 판에 찾은 것 3칸과 "지금까지 n가지"만 보인다. 5가지 · 10가지째에는 무대 도장
 */
import { XP } from '../../shared/core/rewards.js';
import { icon } from '../../shared/ui/icons.js';
import {
  CUBOID_BOARDS,
  CUBOID_FOLD_NOTES,
  CUBOID_FREE_EXPECTED,
  CUBOID_FREE_FULL,
  CUBOID_FREE_GOAL,
  CUBOID_FREE_REASONS,
  CUBOID_FREE_REPLAY_NOTE,
  CUBOID_HINT_AFTER_INVALID,
  CUBOID_HINT_TEXT,
  CUBOID_LATER_NOTE,
  CUBOID_NETS_ID,
  FREE_BOX,
  FREE_CARDS,
  centerOnBoard,
  createCuboidFreeSession,
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
} from './cuboid-logic.js';
import { createRectBoard, rectAdapter } from './free-board.js';
import { HINT_AFTER_MS } from './logic.js';
import { createReasonPick } from './play-judge.js';
import { miniRects } from './thumbs.js';
import { MAT_TOOLS_LIFT, createFoldTools, createNetView } from './view3d.js';

const PHONE = '(max-width: 560px)';
/** 무대 도장을 찍는 가지 수(이 기기에서 찾은 전개도) */
const MILESTONES = [5, 10, 20, 30, 40, 54];
const cm = (value) => `${Math.round(value * 100) / 100} cm`;

export function playCuboidFree(stage, ctx) {
  const { h } = ctx;
  const phone = Boolean(globalThis.matchMedia?.(PHONE).matches);
  const size = phone ? CUBOID_BOARDS.phone : CUBOID_BOARDS.wide;
  const goal = stage.count ?? CUBOID_FREE_GOAL;
  const deviceFound = () => ctx.collection(CUBOID_NETS_ID).found;
  const session = createCuboidFreeSession({ stageId: stage.id, goal, found: [...deviceFound()] });
  freeNets(); // 전개도 54가지를 미리 펼쳐 둔다(처음 접는 순간이 늦어지지 않게)
  const foundRects = []; // 이번 판에 찾은 전개도의 그림(놓은 모습) { id, rects, isNew }
  const earned = { answer: 0, nets: 0 };
  const playXp = () => ctx.reward.peek?.().xp ?? 0;
  let mode = 'edit';
  let reached = false; // 끝낼 수 있는 가지 수를 채웠다

  // ── 매트: 놓는 판 ↔ 3D 무대 ─────────────────
  const view = createNetView({ h, sfx: ctx.sfx });
  const tools = createFoldTools({ ctx, view });
  const host = h('div', { class: 'free-host' });
  const legend = h('p', { class: 'board-legend' }, icon('hand'), '칸 누르기: 놓기 · 면 끌기: 옮기기 · 면 두 번 누르기: 돌리기');
  const sticky = h('p', { class: 'hint-sticky', hidden: true }, icon('bulb'), h('span', null, CUBOID_HINT_TEXT));
  const stamp = h('div', { class: 'stamp found-stamp', hidden: true, 'aria-hidden': 'true' });
  // 이름은 aria-label로도 준다: 휴대폰에서는 자리가 좁아 [모두 빼기]·[되돌리기]의 글자를 숨기고 그림만 보인다
  const tool = (cls, iconName, text, onclick) => h('button', { type: 'button', class: `btn ${cls}`, 'aria-label': text, title: text, onclick }, icon(iconName), h('span', null, text));
  const clearBtn = tool('tool-clear', 'trash', '모두 빼기', () => board.clearAll());
  const undoBtn = tool('tool-undo', 'undo', '되돌리기', () => board.undo());
  const turnBtn = tool('tool-turn', 'rotr', '돌리기', () => board.rotate());
  const hintBtn = tool('tool-hint', 'bulb', '힌트', () => useHint());
  hintBtn.hidden = true;
  const finishTool = h('button', { type: 'button', class: 'btn btn-primary tool-finish', hidden: true, onclick: () => finish() }, '결과 보기', icon('play'));
  const statusCount = h('b', null, `0 / ${FREE_CARDS.length}`);
  const statusExtra = h('span', { class: 'status-extra' });
  const status = h('p', { class: 'mat-status', 'aria-hidden': 'true' }, icon('grid'), h('span', null, '놓은 면'), statusCount, statusExtra);
  const editTools = h('div', { class: 'mat-tools edit-tools' }, clearBtn, undoBtn, turnBtn, hintBtn, finishTool, status);
  const mat = h('div', { class: 'mat free-mat' }, legend, sticky, host, stamp, editTools, tools.el, tools.pad);

  // ── 작업 지시서: 설계 주문 ────────────────────
  const order = ctx.ui.order({ kind: stage.order ?? '설계 주문', label: '설계 판' });
  order.counter.classList.add('q-counter');
  const foldBtn = h('button', { type: 'button', class: 'btn btn-primary free-fold', disabled: true, onclick: () => foldNow() }, icon('play'), h('span', null, '접어 보기'));
  const foldNote = h('p', { class: 'free-note' });
  const traySlot = h('div', { class: 'tray' });
  const editSection = h('div', { class: 'free-edit' }, traySlot, h('div', { class: 'free-go' }, foldBtn, foldNote));
  const noteSlot = h('div', { class: 'reason-slot' });
  const pickSlot = h('div', { class: 'pick-slot' });
  const bonusSlot = h('div', { class: 'bonus-slot' });
  const buttonsSlot = h('div', { class: 'free-buttons' });
  const resultSection = h('div', { class: 'free-result', hidden: true }, noteSlot, pickSlot, bonusSlot);

  // 찾은 전개도 띠: 이번 판에 찾은 것 3칸(2칸째부터 끝낼 수 있고 3칸째가 별 3개) + 이 기기에서 찾은 가지 수
  const foundSlots = Array.from({ length: CUBOID_FREE_FULL }, () => h('li', { class: 'found-slot is-empty' }));
  const foundCount = h('span', { class: 'found-count' });
  const foundGrid = h('ul', { class: 'found-grid' }, foundSlots);
  const foundEl = h('section', { class: 'found-nets', 'aria-label': '찾은 전개도' },
    h('div', { class: 'found-head' }, h('b', null, icon('book'), '찾은 전개도'), foundCount),
    foundGrid,
  );
  /** 접은 장면에서 판 안쪽이 넘칠 때만 칸을 접고 머리 한 줄만 남긴다 (도감 칸과 같은 규칙, spec 16-10) */
  function fitFound() {
    const fold = (value) => {
      foundEl.classList.toggle('is-folded', value);
      foundGrid.hidden = value;
    };
    fold(false);
    if (mode !== 'fold') return;
    if (order.el.scrollHeight > order.el.clientHeight) {
      fold(true);
      return;
    }
    const pageOver = () => document.documentElement.scrollHeight > globalThis.innerHeight;
    if (!pageOver()) return;
    fold(true);
    if (pageOver()) fold(false);
  }
  order.el.classList.add('net-panel', 'free-panel');
  order.el.append(editSection, resultSection, foundEl, buttonsSlot);

  const bench = h('div', { class: 'workbench free-play cuboid-free' }, mat, order.el);
  ctx.el.append(bench);
  ctx.feedback.anchor?.(mat, { lift: MAT_TOOLS_LIFT, narrow: 'below' });

  const board = createRectBoard({ ctx, adapter: rectAdapter({ ...size, cards: FREE_CARDS }), root: bench, onChange: (_, message) => update(message) });
  traySlot.append(
    h('div', { class: 'tray-head' }, h('b', null, '면 카드'), h('span', { class: 'tray-tip' }, `${FREE_BOX.map((v) => `${v} cm`).join(' · ')}인 직육면체`)),
    board.trayEl,
  );
  host.append(board.el, view.el);
  view.el.hidden = true;
  tools.el.hidden = true;
  tools.pad.hidden = true;

  const resizer = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => {
      board.fit(host);
      if (mode === 'fold') fitFound();
    })
    : null;
  resizer?.observe(host);
  board.fit(host);

  // ── 놓는 판 상태 ────────────────────────────
  let lastReason = 'count';
  function update(message = null) {
    if (mode !== 'edit') return;
    const st = board.state();
    const r = rectReadiness(st.rects, FREE_CARDS.length);
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
    const found = session.found().size;
    order.setCounter(`찾은 전개도 ${found}가지`);
    ctx.setProgress?.(Math.min(found, CUBOID_FREE_FULL), CUBOID_FREE_FULL, { label: '찾은 전개도', done: found, check: true });
  }

  /** 찾은 전개도 띠: 이번 판에 찾은 것의 작은 그림. 이번에 처음 찾은 칸은 "새로!" */
  function renderFound() {
    foundSlots.forEach((slot, i) => {
      const item = foundRects[i];
      slot.className = `found-slot${item ? ' is-found' : ' is-empty'}${item?.isNew ? ' is-new' : ''}`;
      slot.setAttribute('aria-label', item ? `${i + 1}번째로 찾은 전개도${item.isNew ? ', 처음 찾음' : ''}` : `${i + 1}번째 칸, 아직 못 찾음`);
      slot.replaceChildren(item ? miniRects(item.rects) : h('small', null, i + 1 === CUBOID_FREE_FULL ? '별 3개' : i + 1 === goal ? '별 2개' : '별 1개'));
    });
    foundCount.textContent = `지금까지 ${deviceFound().size}가지`;
  }

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
      ctx.feedback.announce(CUBOID_HINT_TEXT);
      return;
    }
    if (board.hasShadow()) {
      board.clearShadow();
      hintText.textContent = '그림자 힌트';
      return;
    }
    // 그림자: 이번 판에서 아직 못 찾은 전개도 하나 — 이 기기에서 아직 찾지 않은 것을 먼저
    const net = cuboidHintNet(session.found(), size, deviceFound());
    const rects = net ? centerOnBoard(net.net, size) : null;
    if (!rects) return;
    hintLevel = 2;
    board.showShadow(rects);
    hintText.textContent = '그림자 끄기';
    ctx.feedback.announce('판에 점선 자리가 생겼어요. 그 자리에 크기가 맞는 면을 놓아 보세요.');
  }

  // ── 모드 ────────────────────────────────────
  function enterEdit({ keep = true } = {}) {
    order.el.classList.remove('is-picking');
    if (mode === 'fold') {
      view.setT(0);
      ctx.feedback.clear?.();
    }
    mode = 'edit';
    view.el.hidden = true;
    tools.el.hidden = true;
    tools.pad.hidden = true;
    stamp.hidden = true;
    resultSection.hidden = true;
    buttonsSlot.replaceChildren();
    foundEl.classList.remove('is-folded');
    foundGrid.hidden = false;
    board.el.hidden = false;
    editTools.hidden = false;
    editSection.hidden = false;
    sticky.hidden = hintLevel === 0;
    legend.hidden = !sticky.hidden;
    finishTool.hidden = !reached;
    if (reached) finishTool.classList.toggle('btn-primary', session.found().size >= CUBOID_FREE_FULL); // 2가지면 보통 버튼, 3가지부터 주 버튼 (spec 16-15)
    board.setEnabled(true);
    if (!keep) board.clearAll();
    renderFound();
    update();
    board.fit(host);
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

  /** 까닭 표시: 길이가 다른 두 변에 같은 무늬 띠와 길이 이름표 (까닭을 고른 뒤에만) */
  function showMarks(step) {
    view.reveal();
    if (step.valid) return;
    const problem = primaryCuboidProblem(step.problems);
    const mismatch = problem?.type === 'edge-length' ? problem : null;
    view.setEdgeMarks((mismatch?.edges ?? []).map((e, i) => ({ face: e.face, edge: e.edge, tone: 'a', text: cm(mismatch.lengths[i]) })));
  }

  // ── 접어 보기 ─────────────────────────────
  function foldNow() {
    if (mode !== 'edit') return;
    const st = board.state();
    if (!rectReadiness(st.rects, FREE_CARDS.length).ready) return;
    const layout = board.layout(); // 판을 숨기기 전에 칸 크기·자리를 잰다
    const before = playXp();
    const step = session.fold(st.rects);
    // 등록이 먼저다: 전개도는 접는 순간 "찾아본 전개도"가 되고(등록 점수와 함께 바로 저장), 만들기 성공 점수는 그때 실제로 새로 들어간 전개도에만 준다
    const collected = step.collect ? ctx.collect(step.collect.id, step.collect.item) : null;
    const afterCollect = playXp();
    const first = step.first && Boolean(collected?.isNew);
    // 점수 상한: 이 기기에서 11번째부터 찾은 전개도는 등록 +1점뿐이다(엔진이 xpAfter로 준다) — 만들기 성공 점수는 주지 않는다
    const later = first && isLaterNet(collected.count);
    // 기록: 접은 것 하나가 학습 기록 하나 — 직육면체가 되면 맞음, 안 되면 그 까닭의 오개념 tag (안 되는 모양은 점수 없음)
    if (step.log) ctx.log.answer({ itemId: step.itemId, correct: step.valid, tag: step.tag, given: step.given, expected: CUBOID_FREE_EXPECTED, scored: first && !later ? 'once' : false });
    const gain = { discover: afterCollect - before, answer: playXp() - afterCollect };
    earned.answer += gain.answer;
    earned.nets += gain.discover;
    if (step.valid && step.kind !== 'repeat' && !foundRects.some((f) => f.id === step.id)) foundRects.push({ id: step.id, rects: st.rects.map((r) => ({ ...r })), isNew: first });

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

    // 무대 도장: 새 전개도 발견 (5가지 · 10가지째에는 그 수를 크게)
    if (first) {
      const total = deviceFound().size;
      const big = MILESTONES.includes(total);
      stamp.replaceChildren(h('span', { class: 'stamp-inner' },
        h('small', null, big ? '전개도' : '새 전개도'), h('b', null, big ? `${total}가지!` : '발견!'), h('small', null, big ? '찾았어요' : `${total}가지째`)));
      stamp.hidden = false;
      ctx.feedback.celebrate?.({ kind: 'found', at: stamp });
    }

    showNote(step, feedback);
    showBonus(step, first, gain, later);
    renderFound();
    setProgress();

    const progressed = step.valid && step.kind !== 'repeat';
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
          showNote(step, cuboidFreeFeedback(step, { picked: true }));
          fitFound();
          buttonsSlot.querySelector('button')?.focus({ preventScroll: true });
        },
      });
      pickSlot.append(pick.el);
      order.el.classList.add('is-picking');
      pick.focus();
    }
    fitFound();
  }

  function showNote(step, feedback) {
    const type = feedback.tone;
    const note = ctx.ui.note({ type, title: feedback.title, text: feedback.note });
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
      bonusSlot.replaceChildren(ctx.ui.bonus('같은 모양은 돌리거나 뒤집어도 다시 세지 않아요. ', h('b', null, '새 모양'), '을 만들어 봐요.'));
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

  function showButtons({ justReached, step }) {
    const found = session.found().size;
    const full = found >= CUBOID_FREE_FULL;
    const fix = actionButton('btn-primary free-fix', 'unfold', '펴서 고치기', backToBoard(true));
    const fresh = actionButton('free-new', 'trash', '새로 만들기', backToBoard(false));
    const result = actionButton('free-finish', 'play', '결과 보기', () => finish(), { after: true });
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
    const found = session.found().size;
    if (found < goal) return;
    const sum = cuboidFreeSummary(session.history());
    const stars = cuboidFreeStars(found);
    ctx.finish({
      stars,
      starNote: cuboidFreeStarNote(stars),
      highlights: cuboidFreeHighlights(sum, { earned, total: deviceFound().size }),
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
  };
}
