/**
 * 4단계 "내 맘대로 전개도"(cube-free) 화면. spec 16-1
 *
 * 면 카드 6장(가~바)을 놓는 판에 마음대로 놓고 → 될지 예상(예상 버튼이 곧 접기) → 놓은 그대로 접힌다.
 * 판정·표시는 판별 단계와 같은 fromCells + checkNet + view.reveal(). 서로 다른 전개도 3가지를 찾으면 [결과 보기].
 * - 같은 모양(돌리기·뒤집기 포함)을 이번 판에서 다시 접으면 기록·점수 없음, 떨어진 배치는 접지 않음
 * - 새 전개도는 도감(cube-nets), 안 되는 모양은 노트(cube-non-nets)에 (ctx.collect)
 * - 별은 예상 정확도(엔진 기본). 시간·접은 횟수는 별에 쓰지 않는다
 * - 힌트: 안 되는 모양을 연달아 2번 접었거나 90초 동안 새 전개도를 못 찾으면 [힌트]. 1번째 글, 2번째 그림자(누를 때만)
 */
import { XP, scoreAnswers } from '../../shared/core/rewards.js';
import { icon } from '../../shared/ui/icons.js';
import { LABELS } from './fold.js';
import { createFreeBoard, gridAdapter } from './free-board.js';
import {
  BOARD_SIZES,
  FREE_GOAL,
  HINT_AFTER_INVALID,
  HINT_AFTER_MS,
  HINT_TEXT,
  boardReadiness,
  centerOnBoard,
  createFreeSession,
  dexItemName,
  freeSummary,
  hintNet,
} from './logic.js';
import { CUBE_NETS } from './nets-data.js';
import { createReasonPick } from './play-judge.js';
import { miniNet } from './thumbs.js';
import { MAT_TOOLS_LIFT, createFoldTools, createNetView } from './view3d.js';

const PHONE = '(max-width: 560px)';

export function playFree(stage, ctx) {
  const { h } = ctx;
  const phone = Boolean(globalThis.matchMedia?.(PHONE).matches);
  const size = phone ? BOARD_SIZES.phone : BOARD_SIZES.wide;
  const labels = LABELS.slice(0, 6);
  const goal = stage.count ?? FREE_GOAL;
  const noteTotal = ctx.collection('cube-non-nets').total;
  const session = createFreeSession({
    stageId: stage.id,
    goal,
    dex: [...ctx.collection('cube-nets').found],
    note: [...ctx.collection('cube-non-nets').found],
  });
  const newThisPlay = new Set(); // 이번 판에 도감에 처음 넣은 전개도 ("새로!")
  let explain = { count: 0, xp: 0 };
  let mode = 'edit';
  let goalReached = false;

  // ── 매트: 놓는 판 ↔ 3D 무대 ─────────────────
  const view = createNetView({ h, sfx: ctx.sfx });
  const tools = createFoldTools({ ctx, view });
  const host = h('div', { class: 'free-host' });
  const legend = h('p', { class: 'board-legend' }, icon('hand'), '칸 누르기: 놓기 · 면 누르기: 들어 올리기');
  const sticky = h('p', { class: 'hint-sticky', hidden: true }, icon('bulb'), h('span', null, HINT_TEXT));
  const stamp = h('div', { class: 'stamp found-stamp', hidden: true, 'aria-hidden': 'true' });
  const tool = (cls, iconName, text, onclick) => h('button', { type: 'button', class: `btn ${cls}`, onclick }, icon(iconName), h('span', null, text));
  const clearBtn = tool('tool-clear', 'trash', '모두 빼기', () => board.clearAll());
  const undoBtn = tool('tool-undo', 'undo', '되돌리기', () => board.undo());
  const hintBtn = tool('tool-hint', 'bulb', '힌트', () => useHint());
  hintBtn.hidden = true;
  const finishTool = h('button', { type: 'button', class: 'btn btn-primary tool-finish', hidden: true, onclick: () => finish() }, '결과 보기', icon('play'));
  const statusCount = h('b', null, '0 / 6');
  const statusExtra = h('span', { class: 'status-extra' });
  const status = h('p', { class: 'mat-status', 'aria-hidden': 'true' }, icon('grid'), h('span', null, '놓은 면'), statusCount, statusExtra);
  const editTools = h('div', { class: 'mat-tools edit-tools' }, clearBtn, undoBtn, hintBtn, finishTool, status);
  const mat = h('div', { class: 'mat free-mat' }, legend, sticky, host, stamp, editTools, tools.el);

  // ── 작업 지시서: 설계 주문 ────────────────────
  const order = ctx.ui.order({ kind: stage.order ?? '설계 주문', label: '설계 판' });
  order.counter.classList.add('q-counter');
  const predictButton = (value, iconName, text) => h('button', {
    type: 'button',
    class: 'btn answer-btn predict-btn',
    dataset: { answer: value },
    disabled: true,
    onclick: () => predict(value),
  }, h('span', { class: `answer-sym sym-${value}` }, icon(iconName)), h('span', null, text));
  const predictYes = predictButton('yes', 'ring', '될 거예요');
  const predictNo = predictButton('no', 'cross', '안 될 거예요');
  const predictNote = h('p', { class: 'predict-note' });
  const traySlot = h('div', { class: 'tray' });
  const editSection = h('div', { class: 'free-edit' },
    traySlot,
    h('div', { class: 'predict' },
      h('p', { class: 'predict-q' }, '접기 전에 예상해요'),
      h('div', { class: 'answer-row' }, predictYes, predictNo),
      predictNote,
    ),
  );
  const noteSlot = h('div', { class: 'reason-slot' });
  const pickSlot = h('div', { class: 'pick-slot' });
  const bonusSlot = h('div', { class: 'bonus-slot' });
  const buttonsSlot = h('div', { class: 'free-buttons' });
  const resultSection = h('div', { class: 'free-result', hidden: true }, noteSlot, pickSlot, bonusSlot);

  // 도감 띠: 전개도 11칸 + 안 되는 모양 노트
  const dexSlots = new Map(CUBE_NETS.map((n) => [n.name, h('li', { class: 'dex-slot', dataset: { net: n.name } })]));
  const noteCount = h('b', null, '0');
  const noteSlotEl = h('li', { class: 'dex-slot dex-note' }, h('span', { class: 'dex-note-text' }, icon('cross'), '노트'), noteCount);
  const dexCount = h('span', { class: 'dex-count' });
  const dexEl = h('section', { class: 'dex', 'aria-label': '전개도 도감' },
    h('div', { class: 'dex-head' }, h('b', null, icon('book'), '전개도 도감'), dexCount),
    h('ul', { class: 'dex-grid' }, [...dexSlots.values()], noteSlotEl),
  );
  order.el.classList.add('net-panel', 'free-panel');
  order.el.append(editSection, resultSection, dexEl, buttonsSlot);

  const bench = h('div', { class: 'workbench free-play' }, mat, order.el);
  ctx.el.append(bench);
  // 알림: 넓은 화면은 매트 아래쪽(조작 띠 위), 좁은 화면(태블릿 세로·휴대폰)은 매트 바로 밑 — 놓는 판·무대를 가리지 않게
  ctx.feedback.anchor?.(mat, { lift: MAT_TOOLS_LIFT, narrow: 'below' });

  const board = createFreeBoard({ ctx, adapter: gridAdapter({ ...size, labels }), root: bench, onChange: (_, message) => update(message) });
  traySlot.append(
    h('div', { class: 'tray-head' }, h('b', null, '면 카드'), h('span', { class: 'tray-tip' }, '끌어서 놓거나 칸을 눌러요')),
    board.trayEl,
  );
  host.append(board.el, view.el);
  view.el.hidden = true;
  tools.el.hidden = true;

  const resizer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => board.fit(host)) : null;
  resizer?.observe(host);
  board.fit(host);

  // ── 놓는 판 상태 ────────────────────────────
  let lastReason = 'count';
  function update(message = null) {
    if (mode !== 'edit') return;
    const st = board.state();
    const r = boardReadiness(st.cells, labels.length);
    // 화면 읽기: 판의 안내 + (상태가 바뀌었으면) 접을 수 있는지 한 번에
    let extra = '';
    if (r.reason !== lastReason) {
      if (r.ready) extra = ' 이제 될지 예상하고 접어 볼 수 있어요.';
      else if (r.reason === 'apart') extra = ' 떨어진 면이 있어요. 한 장으로 이어 놓아야 접을 수 있어요.';
    }
    lastReason = r.reason;
    if (message || extra) ctx.feedback.announce(`${message ?? ''}${extra}`.trim());
    board.markDetached(r.reason === 'apart' ? r.detached.map((i) => st.labels[i]) : []);
    predictYes.disabled = !r.ready;
    predictNo.disabled = !r.ready;
    predictNote.classList.toggle('is-wrong', r.reason === 'apart');
    if (r.reason === 'count') predictNote.textContent = '면 6장을 모두 놓으면 예상하고 접을 수 있어요.';
    else if (r.reason === 'apart') predictNote.textContent = '떨어진 면이 있어요. 전개도는 한 장으로 이어져 있어야 접을 수 있어요.';
    else predictNote.textContent = practiceOn() ? '고르면 바로 접혀요. 예상이 맞으면 +2' : '고르면 바로 접혀요.';
    statusCount.textContent = `${st.count} / ${st.total}`;
    statusExtra.textContent = r.reason === 'apart' ? ' · 떨어진 면이 있어요' : '';
    undoBtn.disabled = !board.canUndo();
    clearBtn.disabled = st.count === 0;
  }

  function setProgress() {
    const found = session.found().size;
    order.setCounter(`찾은 전개도 ${Math.min(found, goal)} / ${goal}`);
    ctx.setProgress?.(Math.min(found, goal), goal, { label: '찾은 전개도', done: found, check: true });
  }

  /** 도감 띠: 찾은 칸은 작은 그림, 못 찾은 칸은 ?, 이번 판에 처음 찾은 칸은 "새로!", 방금 접은 모양과 같은 칸은 파랑 테두리 */
  function renderDex({ same = null } = {}) {
    const { found, total } = ctx.collection('cube-nets');
    dexCount.textContent = `${found.size} / ${total}`;
    CUBE_NETS.forEach((n, i) => {
      const slot = dexSlots.get(n.name);
      const got = found.has(n.name);
      slot.className = `dex-slot${got ? ' is-found' : ' is-empty'}${newThisPlay.has(n.name) ? ' is-new' : ''}${same === n.name ? ' is-same' : ''}`;
      slot.setAttribute('aria-label', got ? `도감 ${i + 1}번 ${dexItemName(n)}${same === n.name ? ', 방금 접은 모양' : ''}` : `도감 ${i + 1}번, 아직 못 찾음`);
      slot.replaceChildren(got ? miniNet(n.cells) : h('span', { 'aria-hidden': 'true' }, '?'));
    });
    const note = ctx.collection('cube-non-nets');
    noteCount.textContent = String(note.found.size);
    noteSlotEl.setAttribute('aria-label', `안 되는 모양 노트 ${note.found.size} / ${note.total}`);
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
    const show = value && !goalReached;
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
      legend.hidden = true; // 힌트 글이 설명 칩 자리에 붙는다
      hintText.textContent = '그림자 힌트';
      ctx.feedback.announce(HINT_TEXT);
      return;
    }
    if (board.hasShadow()) {
      board.clearShadow();
      hintText.textContent = '그림자 힌트';
      return;
    }
    const net = hintNet(session.found(), ctx.collection('cube-nets').found);
    const cells = net ? centerOnBoard(net.cells, size) : null;
    if (!cells) return;
    hintLevel = 2;
    board.showShadow(cells);
    hintText.textContent = '그림자 끄기';
    ctx.feedback.announce('판에 점선 칸이 생겼어요. 그 자리에 면을 놓아 보세요. 아직 못 찾은 전개도예요.');
  }

  // ── 모드 ────────────────────────────────────
  function enterEdit({ keep = true } = {}) {
    order.el.classList.remove('is-picking');
    if (mode === 'fold') {
      view.setT(0); // 접는 장면을 멈춘다
      ctx.feedback.clear?.(); // 앞 결과의 알림이 놓는 판을 가리지 않게
    }
    mode = 'edit';
    view.el.hidden = true;
    tools.el.hidden = true;
    stamp.hidden = true;
    resultSection.hidden = true;
    buttonsSlot.replaceChildren();
    board.el.hidden = false;
    editTools.hidden = false;
    editSection.hidden = false;
    sticky.hidden = hintLevel === 0;
    legend.hidden = !sticky.hidden;
    finishTool.hidden = !goalReached;
    board.setEnabled(true);
    if (!keep) board.clearAll();
    renderDex();
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
    resultSection.hidden = false;
  }

  // ── 예상하고 접기 ─────────────────────────────
  function predict(value) {
    if (mode !== 'edit') return;
    const st = board.state();
    if (!boardReadiness(st.cells, labels.length).ready) return;
    const layout = board.layout(); // 판을 숨기기 전에 칸 크기·자리를 잰다
    const before = ctx.reward.peek?.().xp ?? 0;
    const step = session.fold(st.cells, st.labels, value);
    if (step.log) ctx.log.answer({ itemId: step.itemId, correct: step.correct, tag: step.tag, given: value, expected: step.expected });
    const collected = step.collect ? ctx.collect(step.collect.id, step.collect.item) : null;
    const gained = (ctx.reward.peek?.().xp ?? 0) - before;
    if (step.kind === 'new' && collected?.isNew) newThisPlay.add(step.name);

    enterFold();
    // 좁은 화면(휴대폰)에서 예상 버튼을 누르느라 내려가 있으면, 접히는 매트가 보이게 올린다
    if (!globalThis.matchMedia?.('(min-width: 901px)').matches) mat.scrollIntoView?.({ block: 'nearest' });
    view.setNet(step.net, { layout });
    view.reveal();
    tools.reset();
    tools.lock(false);
    view.animateTo(1);

    // 알림 · 소리 (알림은 짧게, 긴 문장은 작업 지시서의 쪽지에)
    const reasonFirst = step.explainable; // 까닭 고르기를 할 때는 까닭 문장을 먼저 보이지 않는다
    const toast = toastText(step);
    if (step.kind === 'repeat') {
      ctx.sfx.play('click');
      ctx.feedback.info(toast);
    } else if (step.correct) {
      ctx.sfx.play('correct');
      ctx.feedback.correct(toast);
    } else {
      ctx.sfx.play('wrong');
      ctx.feedback.wrong(toast);
    }

    // 무대 도장: 새 전개도 발견
    if (step.kind === 'new' && collected?.isNew) {
      stamp.replaceChildren(h('span', { class: 'stamp-inner' }, h('small', null, '새 전개도'), h('b', null, '발견!'), h('small', null, `도감 ${collected.count} / ${collected.total}`)));
      stamp.hidden = false;
      ctx.feedback.celebrate?.({ kind: 'found', at: stamp });
    }

    showNote(step, collected, { withReason: !reasonFirst });
    showBonus(step, collected, gained);
    renderDex({ same: step.valid && step.kind !== 'new' ? step.name : null });
    setProgress();

    // 힌트 조건
    if (step.valid && step.kind !== 'repeat') resetHint();
    else if (session.invalidRun() >= HINT_AFTER_INVALID) setHintReady(true);

    // 버튼
    const justReached = step.done && !goalReached;
    if (step.done) goalReached = true;
    if (goalReached) setHintReady(false);
    showButtons({ justReached });

    // 까닭 고르기 (안 되는 모양을 "안 될 거예요"로 맞혔을 때, 선택)
    pickSlot.replaceChildren();
    if (reasonFirst) {
      const pick = createReasonPick({
        ctx,
        itemId: step.itemId,
        problems: step.problems,
        onDone: ({ xp }) => {
          if (xp) explain = { count: explain.count + 1, xp: explain.xp + xp };
          order.el.classList.remove('is-picking');
          showNote(step, collected, { withReason: true });
          showBonus(step, collected, gained, xp);
          buttonsSlot.querySelector('button')?.focus({ preventScroll: true });
        },
      });
      pickSlot.append(pick.el);
      // 고르는 동안에는 다음 버튼·도감 띠를 접어 둔다 (고르거나 넘어가면 다시 보인다)
      order.el.classList.add('is-picking');
      pick.focus();
    }
  }

  function toastText(step) {
    const lead = step.correct ? '예측 적중!' : '예상과 달랐어요.';
    if (step.kind === 'repeat') return '이번에 이미 접어 본 모양이에요.';
    if (step.kind === 'new') return `${lead} 처음 찾은 전개도예요.`;
    if (step.kind === 'known') return `${lead} 도감 ${step.info.index}번과 같은 모양이에요.`;
    if (step.explainable) return '예측 적중! 왜 안 되는지 골라 볼까요?';
    return step.valid ? `${lead} 정육면체가 돼요.` : `${lead} 정육면체가 안 돼요.`;
  }

  function showNote(step, collected, { withReason }) {
    let text = step.message;
    if (!withReason && step.explainable) text = '안 될 거라고 예상했고, 접어 보니 정육면체가 안 돼요.';
    const lines = [text];
    if (step.kind === 'invalid' && collected) {
      lines.push(collected.isNew ? `노트에 적었어요 (${collected.count} / ${collected.total}).` : `노트에 이미 있는 모양이에요 (${collected.count} / ${collected.total}).`);
    }
    const type = step.kind === 'repeat' ? 'info' : step.correct ? 'correct' : 'wrong';
    const note = ctx.ui.note({ type, title: step.title, text: lines.join(' ') });
    note.classList.add('reason', type === 'correct' ? 'is-correct' : type === 'wrong' ? 'is-wrong' : 'is-info');
    note.setAttribute('role', 'status');
    noteSlot.replaceChildren(note);
  }

  function showBonus(step, collected, gained, explainXp = 0) {
    const peek = ctx.reward.peek?.();
    bonusSlot.replaceChildren();
    if (!peek?.on) return;
    if (step.kind === 'repeat') {
      bonusSlot.replaceChildren(ctx.ui.bonus('같은 모양은 돌리거나 뒤집어도 다시 세지 않아요. ', h('b', null, '새 모양'), '을 만들어 봐요.'));
      return;
    }
    // 별 3개를 받은 단계를 다시 하는 판: 연습 점수는 없고, 처음 찾은 모양(+5)만 받는다
    if (peek.practice === false) {
      if (collected?.isNew) bonusSlot.replaceChildren(ctx.ui.bonus(h('b', null, `${step.valid ? '새 발견' : '노트에 새 모양'} +${XP.discover}`)));
      return;
    }
    if (!step.correct) {
      bonusSlot.replaceChildren(ctx.ui.bonus(h('b', null, '다시 일어서기'), ' · 다음 예상을 맞히면 +1'));
      return;
    }
    const parts = [];
    let rest = gained;
    if (collected?.isNew) {
      parts.push(`${step.valid ? '새 발견' : '노트에 새 모양'} +${XP.discover}`);
      rest -= XP.discover;
    }
    parts.push(`예측 적중 +${XP.first}`);
    rest -= XP.first;
    if (rest > 0) parts.push(`다시 일어서기·연속 +${rest}`);
    if (explainXp > 0) parts.push(`까닭 설명 +${explainXp}`);
    const streak = ctx.streak?.() ?? 0;
    if (streak >= 2) parts.push(`연속 ${streak}번`);
    bonusSlot.replaceChildren(ctx.ui.bonus(h('b', null, parts.join(' · '))));
  }

  /** 이 판에서 연습 점수를 주는지 (보상이 켜져 있고, 시작할 때 별 3개가 아니었음) */
  function practiceOn() {
    const peek = ctx.reward.peek?.();
    return Boolean(peek?.on) && peek.practice !== false;
  }

  function showButtons({ justReached }) {
    const fix = h('button', { type: 'button', class: 'btn btn-primary free-fix', onclick: () => {
      ctx.sfx.play('click');
      enterEdit({ keep: true });
      board.focus();
    } }, icon('unfold'), '펴서 고치기');
    const fresh = h('button', { type: 'button', class: 'btn free-new', onclick: () => {
      ctx.sfx.play('click');
      enterEdit({ keep: false });
      board.focus();
    } }, icon('trash'), '새로 만들기');
    const result = h('button', { type: 'button', class: 'btn btn-primary free-finish', onclick: () => finish() }, '결과 보기', icon('play'));
    if (justReached) {
      const more = h('button', { type: 'button', class: 'btn free-more', onclick: () => {
        ctx.sfx.play('click');
        enterEdit({ keep: false });
        board.focus();
      } }, '더 찾아보기');
      buttonsSlot.replaceChildren(h('p', { class: 'goal-done' }, icon('check'), `서로 다른 전개도 ${goal}가지를 모두 찾았어요!`), h('div', { class: 'btn-pair' }, result, more));
      result.focus({ preventScroll: true });
      return;
    }
    fix.classList.toggle('btn-primary', !goalReached);
    buttonsSlot.replaceChildren(...(goalReached ? [result, h('div', { class: 'btn-pair' }, fix, fresh)] : [h('div', { class: 'btn-pair' }, fix, fresh)]));
    (goalReached ? result : fix).focus({ preventScroll: true });
  }

  // ── 끝내기: 결과 "오늘의 솜씨" ─────────────────
  function finish() {
    const history = session.history();
    const sum = freeSummary(history);
    const score = scoreAnswers(history.filter((s) => s.log).map((s) => ({ itemId: s.itemId, correct: s.correct })));
    // 칸의 점수는 보여 주기만 한다. 별 3개 단계를 다시 하는 판이면 엔진처럼 연습 점수(예측·설명)는 0
    const practice = practiceOn() ? 1 : 0;
    const highlights = [
      { icon: 'target', label: '예측 적중', value: `${sum.hits} / ${sum.predictions}`, xp: practice * score.xp },
      { icon: 'book', label: '새 전개도 발견', value: `${sum.newNets}가지`, xp: sum.newNets * XP.discover },
      sum.newNotes > 0 && { icon: 'copy', label: '노트에 적은 모양', value: `${sum.newNotes}가지`, xp: sum.newNotes * XP.discover },
      { icon: 'undo', label: '고쳐서 다시 도전', value: `${sum.fixes}번` },
      explain.count > 0 && { icon: 'bulb', label: '까닭 설명', value: `${explain.count}번`, xp: explain.xp },
    ].filter(Boolean).slice(0, 4);
    ctx.finish({ highlights });
  }

  // Ctrl+Z: 되돌리기 (놓는 중일 때. 누른 버튼이 꺼져 초점이 문서로 가도 되게 문서에서 받는다)
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
