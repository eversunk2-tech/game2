/**
 * 직접 만드는 전개도 화면: 4단계 "내 맘대로 전개도"(cube-free, spec 16-1)와 도전 주문서 "도감 주문"(cube-dex, spec 16-3).
 *
 * 면 카드 6장(가~바)을 놓는 판에 마음대로 놓고 → [접어 보기] → 놓은 그대로 접힌다. 접기 전에 될지 예상을 묻지 않는다(spec 16-12).
 * 판정·표시는 판별 단계와 같은 fromCells + checkNet + view.reveal().
 * - 내 맘대로 전개도: 서로 다른 전개도 3가지를 찾으면 [결과 보기]. 별은 이번 판에 찾은 서로 다른 전개도 수(안 되는 모양은 별과 무관)
 * - 도감 주문: 같은 판으로 전개도 도감 11칸을 채운다. 도감은 판을 넘어 이어진다. 6칸부터 [오늘은 여기까지]로 끝낼 수 있고
 *   별은 도감 수(6칸 ★1 · 9칸 ★2 · 11칸 ★3), 11칸을 채우면 [결과 보기]만 남는다
 * - 같은 모양(돌리기·뒤집기 포함)을 이번 판에서 다시 접으면 기록·점수 없음, 떨어진 배치는 접지 않음
 * - 새 전개도는 도감(cube-nets), 안 되는 모양은 노트(cube-non-nets)에 (ctx.collect). 두 단계가 같은 도감·노트를 쓴다
 * - 점수는 이 기기에서 그 모양을 처음 접을 때만 (spec 16-8): 되는 모양 = 만들기 성공 +2(연속·다시 일어서기는 엔진 규칙) + 도감 +5,
 *   안 되는 모양 = 노트 +1 + 까닭을 맞히면 +2. 이미 접어 본 모양(도감·노트에 있음)은 기록에는 넣고 점수는 없다(scored: false)
 * - 처음 접는 모양의 점수는 "이 기기에서 한 번만 받는 점수"다(scored: 'once', spec 16-9): 판을 시작할 때 별이 3개여도 받고,
 *   도감·노트 등록 점수처럼 접은 그 자리에서 바로 저장된다(판 중간에 나가도 남는다). 모양은 접는 순간 "접어 본 모양"이 되므로
 *   어느 단계에서 접었든, 나갔다 왔든 한 모양의 점수는 한 번뿐이다
 * - 안 되는 모양을 접으면 까닭 고르기가 먼저다: 고르기(넘어가기) 전에는 까닭 문장도, 무대의 까닭 표시
 *   (이름표·겹쳐요·비어요·●)도 보이지 않는다 (판별 단계와 같은 순서)
 * - 기록: 접은 것 하나가 학습 기록 하나(정육면체가 되면 맞음, 안 되면 오개념 tag). 화면에는 "틀렸다"는 느낌의 말을 쓰지 않는다
 * - 힌트: 안 되는 모양을 연달아 2번 접었거나 90초 동안 새 전개도를 못 찾으면 [힌트]. 1번째 글, 2번째 그림자(누를 때만)
 */
import { XP } from '../../shared/core/rewards.js';
import { icon } from '../../shared/ui/icons.js';
import { LABELS } from './fold.js';
import { createFreeBoard, gridAdapter } from './free-board.js';
import {
  BOARD_SIZES,
  DEX_STOP_MIN,
  FREE_EXPECTED,
  FREE_FOLD_NOTES,
  FREE_GOAL,
  FREE_REPLAY_NOTE,
  HINT_AFTER_INVALID,
  HINT_AFTER_MS,
  HINT_TEXT,
  boardReadiness,
  centerOnBoard,
  createFreeSession,
  dexHighlights,
  dexItemName,
  dexMilestone,
  dexNextStar,
  dexStars,
  dexStats,
  freeFeedback,
  freeHighlights,
  freeStars,
  freeStats,
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
  const dexMode = stage.kind === 'dex'; // 도감 주문: 목표가 이번 판 3가지 대신 이 기기의 도감 11칸
  const phone = Boolean(globalThis.matchMedia?.(PHONE).matches);
  const size = phone ? BOARD_SIZES.phone : BOARD_SIZES.wide;
  const labels = LABELS.slice(0, 6);
  const dexTotal = ctx.collection('cube-nets').total;
  const goal = dexMode ? dexTotal : (stage.count ?? FREE_GOAL);
  const dexCount = () => ctx.collection('cube-nets').found.size;
  const session = createFreeSession({
    stageId: stage.id,
    goal,
    dexGoal: dexMode ? dexTotal : null,
    dex: [...ctx.collection('cube-nets').found],
    note: [...ctx.collection('cube-non-nets').found],
  });
  const newThisPlay = new Set(); // 이번 판에 도감에 처음 넣은 전개도 ("새로!")
  // 이번 판에 엔진이 준 점수를 갈래별로 모은다(결과 "오늘의 솜씨" 칸). 점수는 엔진이 계산하고, 여기서는 오른 만큼만 읽는다
  const earned = { answer: 0, nets: 0, notes: 0, explain: 0 };
  let explainCount = 0;
  const playXp = () => ctx.reward.peek?.().xp ?? 0;
  let mode = 'edit';
  let goalReached = session.done(); // 도감 주문에 이미 11칸인 학생이 들어오면 처음부터 채운 상태다

  // ── 매트: 놓는 판 ↔ 3D 무대(+ 접기 조작 띠, 보는 방향·크기 조작판) ─────────────────
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
  // 목표를 채운 뒤 놓는 판에서 끝내기: 내 맘대로 전개도는 매트 띠의 [결과 보기]. 도감 주문은 작업 지시서 아래쪽 버튼을 쓴다(showStop)
  const finishTool = h('button', { type: 'button', class: 'btn btn-primary tool-finish', hidden: true, onclick: () => finish() }, '결과 보기', icon('play'));
  const statusCount = h('b', null, '0 / 6');
  const statusExtra = h('span', { class: 'status-extra' });
  const status = h('p', { class: 'mat-status', 'aria-hidden': 'true' }, icon('grid'), h('span', null, '놓은 면'), statusCount, statusExtra);
  const editTools = h('div', { class: 'mat-tools edit-tools' }, clearBtn, undoBtn, hintBtn, finishTool, status);
  const mat = h('div', { class: 'mat free-mat' }, legend, sticky, host, stamp, editTools, tools.el, tools.pad);

  // ── 작업 지시서: 설계 주문 · 도감 주문 ────────────────────
  const order = ctx.ui.order({ kind: stage.order ?? '설계 주문', label: '설계 판' });
  order.counter.classList.add('q-counter');
  // 접기 전에 될지 묻지 않는다: 6장을 이어 놓으면 [접어 보기] 하나로 접는다 (spec 16-12)
  const foldBtn = h('button', { type: 'button', class: 'btn btn-primary free-fold', disabled: true, onclick: () => foldNow() }, icon('play'), h('span', null, '접어 보기'));
  const foldNote = h('p', { class: 'free-note' });
  const traySlot = h('div', { class: 'tray' });
  const editSection = h('div', { class: 'free-edit' }, traySlot, h('div', { class: 'free-go' }, foldBtn, foldNote));
  const noteSlot = h('div', { class: 'reason-slot' });
  const pickSlot = h('div', { class: 'pick-slot' });
  const bonusSlot = h('div', { class: 'bonus-slot' });
  const buttonsSlot = h('div', { class: 'free-buttons' });
  const resultSection = h('div', { class: 'free-result', hidden: true }, noteSlot, pickSlot, bonusSlot);

  // 도감 띠: 전개도 11칸 + 안 되는 모양 노트
  const dexSlots = new Map(CUBE_NETS.map((n) => [n.name, h('li', { class: 'dex-slot', dataset: { net: n.name } })]));
  const noteCount = h('b', null, '0');
  const noteSlotEl = h('li', { class: 'dex-slot dex-note' }, h('span', { class: 'dex-note-text' }, icon('cross'), '노트'), noteCount);
  const dexCountEl = h('span', { class: 'dex-count' });
  // 도감 칸을 그대로 두면 오른쪽 판 안쪽이 넘치는 낮은 화면에서만 칸을 접고 머리 한 줄("전개도 도감 3 / 11 · 노트 5 / 24")만 보인다
  // — 까닭 쪽지·버튼이 판 안에 다 들어오게 (fitDex, spec 16-10)
  const dexNoteLine = h('span', { class: 'dex-note-line', hidden: true });
  const dexGrid = h('ul', { class: 'dex-grid' }, [...dexSlots.values()], noteSlotEl);
  const dexEl = h('section', { class: 'dex', 'aria-label': '전개도 도감' },
    h('div', { class: 'dex-head' }, h('b', null, icon('book'), '전개도 도감'), h('span', { class: 'dex-counts' }, dexCountEl, dexNoteLine)),
    dexGrid,
  );
  function foldDex(folded) {
    dexEl.classList.toggle('is-folded', folded);
    dexGrid.hidden = folded;
    dexNoteLine.hidden = !folded;
  }
  /**
   * 접은 장면의 도감 칸: 펼쳐 놓고 재서, 넘칠 때만 접는다 (spec 16-10). 자리가 남는 화면에서는 칸을 그대로 보여 준다
   * (방금 접은 모양과 같은 칸의 테두리, 노트 칸의 수).
   * - 오른쪽 판의 높이가 정해진 넓은 화면: 판 안쪽이 넘치면 접는다(맨 아래 버튼이 잘리지 않게)
   * - 판이 매트 아래에 놓이는 화면(태블릿 세로): 펴 두면 화면이 세로로 넘치고, 접으면 한 화면에 들어올 때만 접는다.
   *   휴대폰처럼 접어도 내려 봐야 하는 화면에서는 접지 않는다
   * 판의 글·버튼이 바뀌거나 화면 크기가 바뀔 때마다 다시 잰다 — 재고 접는 것이 한 차례 안에서 끝나 깜빡이지 않는다
   */
  function fitDex() {
    foldDex(false);
    if (mode !== 'fold') return;
    if (order.el.scrollHeight > order.el.clientHeight) {
      foldDex(true);
      return;
    }
    const pageOver = () => document.documentElement.scrollHeight > globalThis.innerHeight;
    if (!pageOver()) return;
    foldDex(true);
    if (pageOver()) foldDex(false);
  }
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
  tools.pad.hidden = true; // 보는 방향·크기 조작판은 접힌 뒤(무대가 보일 때)에만

  const resizer = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => {
      board.fit(host);
      if (mode === 'fold') fitDex(); // 판 높이가 바뀌면 도감 칸이 들어가는지 다시 잰다
    })
    : null;
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
      if (r.ready) extra = ' 이제 접어 볼 수 있어요.';
      else if (r.reason === 'apart') extra = ' 떨어진 면이 있어요. 한 장으로 이어 놓아야 접을 수 있어요.';
    }
    lastReason = r.reason;
    if (message || extra) ctx.feedback.announce(`${message ?? ''}${extra}`.trim());
    board.markDetached(r.reason === 'apart' ? r.detached.map((i) => st.labels[i]) : []);
    foldBtn.disabled = !r.ready;
    foldNote.classList.toggle('is-wrong', r.reason === 'apart');
    foldNote.textContent = FREE_FOLD_NOTES[r.reason ?? 'ready'];
    statusCount.textContent = `${st.count} / ${st.total}`;
    statusExtra.textContent = r.reason === 'apart' ? ' · 떨어진 면이 있어요' : '';
    undoBtn.disabled = !board.canUndo();
    clearBtn.disabled = st.count === 0;
  }

  function setProgress() {
    if (dexMode) {
      const count = dexCount();
      order.setCounter(`전개도 도감 ${count} / ${dexTotal}`);
      ctx.setProgress?.(count, dexTotal, { label: '도감', done: count });
      return;
    }
    const found = session.found().size;
    order.setCounter(`찾은 전개도 ${Math.min(found, goal)} / ${goal}`);
    ctx.setProgress?.(Math.min(found, goal), goal, { label: '찾은 전개도', done: found, check: true });
  }

  /** 도감 띠: 찾은 칸은 작은 그림, 못 찾은 칸은 ?, 이번 판에 처음 찾은 칸은 "새로!", 방금 접은 모양과 같은 칸은 파랑 테두리 */
  function renderDex({ same = null } = {}) {
    const { found, total } = ctx.collection('cube-nets');
    dexCountEl.textContent = `${found.size} / ${total}`;
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
    dexNoteLine.textContent = ` · 노트 ${note.found.size} / ${note.total}`;
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
    // 그림자: 아직 못 찾은 전개도 하나. 도감 주문은 도감에 없는 것(이번 판이 아니라 이 기기에서 못 찾은 것)
    const dexFound = ctx.collection('cube-nets').found;
    const net = hintNet(dexMode ? dexFound : session.found(), dexFound);
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
    tools.pad.hidden = true;
    stamp.hidden = true;
    resultSection.hidden = true;
    showStop();
    foldDex(false);
    board.el.hidden = false;
    editTools.hidden = false;
    editSection.hidden = false;
    sticky.hidden = hintLevel === 0;
    legend.hidden = !sticky.hidden;
    finishTool.hidden = dexMode || !goalReached;
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
    tools.pad.hidden = false;
    resultSection.hidden = false;
  }

  // ── 접어 보기 ─────────────────────────────
  function foldNow() {
    if (mode !== 'edit') return;
    const st = board.state();
    if (!boardReadiness(st.cells, labels.length).ready) return;
    const layout = board.layout(); // 판을 숨기기 전에 칸 크기·자리를 잰다
    const dexBefore = dexCount();
    const step = session.fold(st.cells, st.labels);
    // 도감·노트 등록이 먼저다: 모양은 접는 순간 "접어 본 모양"이 되고(등록 점수와 함께 바로 저장), 만들기 성공 점수는 그때 실제로
    // 새로 들어간 모양에만 준다. 처음 접는 모양의 기록은 "이 기기에서 한 번만 점수"(scored: 'once' — 별 3개 뒤에도 받고 바로 저장),
    // 이미 접어 본 모양은 기록에는 넣고 점수는 없다(scored: false). 점수는 엔진이 계산하고 여기서는 오른 만큼만 읽는다
    const before = playXp();
    const collected = step.collect ? ctx.collect(step.collect.id, step.collect.item) : null;
    const afterCollect = playXp();
    const first = step.first && Boolean(collected?.isNew);
    // 기록: 접은 것 하나가 학습 기록 하나 — 정육면체가 되면 맞음, 안 되면 그 까닭의 오개념 tag
    if (step.log) ctx.log.answer({ itemId: step.itemId, correct: step.valid, tag: step.tag, given: step.name, expected: FREE_EXPECTED, scored: first ? 'once' : false });
    const gain = { discover: afterCollect - before, answer: playXp() - afterCollect };
    earned.answer += gain.answer;
    earned[step.valid ? 'nets' : 'notes'] += gain.discover;
    if (step.kind === 'new' && collected?.isNew) newThisPlay.add(step.name);

    enterFold();
    // 좁은 화면(휴대폰)에서 [접어 보기]를 누르느라 내려가 있으면, 접히는 매트가 보이게 올린다
    if (!globalThis.matchMedia?.('(min-width: 901px)').matches) mat.scrollIntoView?.({ block: 'nearest' });
    view.setNet(step.net, { layout });
    // 안 되는 모양은 까닭 고르기가 먼저다: 고르기(넘어가기) 전까지 무대의 까닭 표시(이름표·겹쳐요·비어요·●)를 보이지 않는다
    const feedback = freeFeedback(step);
    const reasonFirst = !feedback.marks;
    if (feedback.marks) view.reveal();
    tools.reset();
    tools.lock(false);
    view.animateTo(1);

    // 알림 · 소리 (알림은 짧게, 긴 문장은 작업 지시서의 쪽지에). 안 되는 모양은 틀린 것이 아니라 탐구라 안내 알림으로만 알린다
    if (step.kind === 'repeat') ctx.sfx.play('click');
    if (feedback.tone === 'correct') {
      ctx.sfx.play('correct');
      ctx.feedback.correct(feedback.toast);
    } else {
      ctx.feedback.info(feedback.toast);
    }

    // 무대 도장: 새 전개도 발견
    if (step.kind === 'new' && collected?.isNew) {
      stamp.replaceChildren(h('span', { class: 'stamp-inner' }, h('small', null, '새 전개도'), h('b', null, '발견!'), h('small', null, `도감 ${collected.count} / ${collected.total}`)));
      stamp.hidden = false;
      ctx.feedback.celebrate?.({ kind: 'found', at: stamp });
    }

    // 도감 주문: 새 전개도로 별이 하나 늘었으면(6칸·9칸) 쪽지에 알린다
    const milestone = dexMode && step.kind === 'new' && collected?.isNew ? dexMilestone(dexBefore, dexCount()) : '';
    showNote(step, collected, feedback, milestone);
    showBonus(step, first, gain);
    renderDex({ same: step.valid && step.kind !== 'new' ? step.name : null });
    setProgress();

    // 힌트 조건: 새 전개도를 찾으면(도감 주문은 도감에 새로 들어가면) 처음부터 다시 센다
    const progressed = dexMode ? step.kind === 'new' : step.valid && step.kind !== 'repeat';
    if (progressed) resetHint();
    else if (session.invalidRun() >= HINT_AFTER_INVALID) setHintReady(true);

    // 버튼
    const justReached = step.done && !goalReached;
    if (step.done) goalReached = true;
    if (goalReached) setHintReady(false);
    showButtons({ justReached });

    // 까닭 고르기 (안 되는 모양을 접었을 때, 선택)
    pickSlot.replaceChildren();
    if (reasonFirst) {
      const pick = createReasonPick({
        ctx,
        itemId: step.itemId,
        problems: step.problems,
        onDone: ({ correct, xp }) => {
          if (correct) explainCount += 1;
          earned.explain += xp;
          order.el.classList.remove('is-picking');
          // 고른 뒤(맞든 틀리든, 넘어가도) 까닭 문장과 무대의 까닭 표시를 보인다
          view.reveal();
          showNote(step, collected, freeFeedback(step, { picked: true }), milestone);
          showBonus(step, first, gain, xp);
          fitDex(); // 까닭 문장이 들어가 글이 길어졌다
          buttonsSlot.querySelector('button')?.focus({ preventScroll: true });
        },
      });
      pickSlot.append(pick.el);
      // 고르는 동안에는 다음 버튼·도감 띠를 접어 둔다 (고르거나 넘어가면 다시 보인다)
      order.el.classList.add('is-picking');
      pick.focus();
    }
    fitDex(); // 쪽지·버튼이 다 놓인 뒤에 잰다
  }

  /** 쪽지: 되면 초록 ✓, 안 되는 모양은 까닭을 고른 뒤에 벽돌색 까닭 쪽지(그 전에는 안내 쪽지) */
  function showNote(step, collected, feedback, extra = '') {
    const lines = [feedback.note];
    if (step.kind === 'invalid' && collected) {
      lines.push(collected.isNew ? `노트에 적었어요 (${collected.count} / ${collected.total}).` : `노트에 이미 있는 모양이에요 (${collected.count} / ${collected.total}).`);
    }
    if (extra) lines.push(extra);
    const type = feedback.tone;
    const note = ctx.ui.note({ type, title: feedback.title, text: lines.join(' ') });
    note.classList.add('reason', type === 'correct' ? 'is-correct' : type === 'wrong' ? 'is-wrong' : 'is-info');
    note.setAttribute('role', 'status');
    noteSlot.replaceChildren(note);
  }

  /**
   * 보너스 쪽지: 이번 접기로 엔진이 준 점수(gain: 만들기 성공 answer · 도감·노트 등록 discover, explainXp: 까닭 설명)를 글로 보인다.
   * 점수는 이 기기에서 처음 접는 모양(first)에만 있다 — 별 3개를 받은 뒤 다시 하는 판에서도 같다. 이미 접어 본 모양은 까닭을 알려 준다.
   */
  function showBonus(step, first, gain, explainXp = 0) {
    const peek = ctx.reward.peek?.();
    bonusSlot.replaceChildren();
    if (!peek?.on) return;
    if (step.kind === 'repeat') {
      bonusSlot.replaceChildren(ctx.ui.bonus('같은 모양은 돌리거나 뒤집어도 다시 세지 않아요. ', h('b', null, '새 모양'), '을 만들어 봐요.'));
      return;
    }
    if (!first) {
      // 전에(다른 판·다른 단계에서) 접어 본 모양: 점수가 없는 까닭을 한 줄로
      bonusSlot.replaceChildren(ctx.ui.bonus(h('b', null, '전에 접어 본 모양'), '이라 점수는 없어요.'));
      return;
    }
    const parts = [];
    if (gain.discover > 0) parts.push(`${step.valid ? '새 발견' : '노트에 새 모양'} +${gain.discover}`);
    if (gain.answer > 0) {
      parts.push(`만들기 성공 +${Math.min(gain.answer, XP.first)}`);
      if (gain.answer > XP.first) parts.push(`다시 일어서기·연속 +${gain.answer - XP.first}`);
    }
    if (explainXp > 0) parts.push(`까닭 설명 +${explainXp}`);
    const streak = ctx.streak?.() ?? 0;
    if (step.valid && gain.answer > 0 && streak >= 2) parts.push(`연속 ${streak}번`);
    // 안 되는 모양을 처음 접은 뒤: 다음에 새 전개도를 만들면 다시 일어서기 +1
    const bounce = !step.valid && peek.bounceReady;
    if (parts.length === 0 && !bounce) return;
    bonusSlot.replaceChildren(ctx.ui.bonus(
      parts.length > 0 && h('b', null, parts.join(' · ')),
      bounce && [parts.length > 0 ? ' · ' : null, h('b', null, '다시 일어서기'), ` · 다음에 새 전개도를 만들면 +${XP.bounce}`],
    ));
  }

  const actionButton = (cls, iconName, text, onclick, { after = false } = {}) => h('button', { type: 'button', class: `btn ${cls}`, onclick },
    after ? [h('span', null, text), icon(iconName)] : [icon(iconName), h('span', null, text)]);
  const backToBoard = (keep) => () => {
    ctx.sfx.play('click');
    enterEdit({ keep });
    board.focus();
  };

  /** 도감 주문의 [오늘은 여기까지]: 6칸부터. 지금 끝내면 받는 별과 다음 별까지를 함께 적는다(좁은 세 버튼 줄에서는 이름만) */
  function stopButton() {
    const count = dexCount();
    const stars = dexStars(count);
    const next = dexNextStar(count);
    return h('button', { type: 'button', class: 'btn free-stop', onclick: () => finish() },
      h('span', { class: 'stop-main' }, icon('flag'), h('span', null, '오늘은 여기까지')),
      h('small', { class: 'stop-sub' }, `지금 끝내면 별 ${stars}개${next ? ` · ${next}칸이면 별 ${stars + 1}개` : ''}`),
    );
  }

  /** 놓는 중의 아래쪽 줄 (도감 주문만): 11칸이면 [결과 보기], 6칸부터 [오늘은 여기까지], 그 전에는 별을 받는 칸 수 안내 */
  function showStop() {
    if (!dexMode) {
      buttonsSlot.replaceChildren();
      return;
    }
    const count = dexCount();
    if (count >= dexTotal) {
      buttonsSlot.replaceChildren(
        h('p', { class: 'goal-done' }, icon('check'), `전개도 ${dexTotal}가지를 모두 찾았어요!`),
        actionButton('btn-primary free-finish', 'play', '결과 보기', () => finish(), { after: true }),
      );
    } else if (count >= DEX_STOP_MIN) buttonsSlot.replaceChildren(stopButton());
    else buttonsSlot.replaceChildren(h('p', { class: 'dex-rule' }, icon('star'), `도감 ${DEX_STOP_MIN}칸을 채우면 별 1개를 받고 끝낼 수 있어요.`));
  }

  function showButtons({ justReached }) {
    const fix = actionButton('btn-primary free-fix', 'unfold', '펴서 고치기', backToBoard(true));
    const fresh = actionButton('free-new', 'trash', '새로 만들기', backToBoard(false));
    const result = actionButton('btn-primary free-finish', 'play', '결과 보기', () => finish(), { after: true });
    if (justReached) {
      const done = h('p', { class: 'goal-done' }, icon('check'),
        dexMode ? `전개도 ${dexTotal}가지를 모두 찾았어요! 도감을 다 채웠어요.` : `서로 다른 전개도 ${goal}가지를 모두 찾았어요!`);
      // 도감 주문은 11칸을 채우면 끝이다: [결과 보기]만 남긴다. 내 맘대로 전개도는 더 찾아볼 수 있다
      const more = dexMode ? null : h('button', { type: 'button', class: 'btn free-more', onclick: backToBoard(false) }, '더 찾아보기');
      buttonsSlot.replaceChildren(done, more ? h('div', { class: 'btn-pair' }, result, more) : result);
      result.focus({ preventScroll: true });
      return;
    }
    if (goalReached) {
      // 목표를 채운 뒤에는 세 버튼을 한 줄에 놓는다(두 줄이면 낮은 화면에서 판이 넘쳐 아래 버튼이 잘린다)
      fix.classList.remove('btn-primary');
      buttonsSlot.replaceChildren(h('div', { class: 'btn-trio' }, result, fix, fresh));
      result.focus({ preventScroll: true });
      return;
    }
    if (dexMode && dexCount() >= DEX_STOP_MIN) {
      // 도감 주문: 6칸부터는 접은 장면에서도 [오늘은 여기까지]로 끝낼 수 있다 (세 버튼 한 줄)
      buttonsSlot.replaceChildren(h('div', { class: 'btn-trio has-stop' }, stopButton(), fix, fresh));
    } else buttonsSlot.replaceChildren(h('div', { class: 'btn-pair' }, fix, fresh));
    fix.focus({ preventScroll: true });
  }

  // ── 끝내기: 결과 "오늘의 솜씨" ─────────────────
  function finish() {
    const sum = freeSummary(session.history());
    // 결과의 기록 칸은 정답률 대신 "찾은 전개도 · 접어 본 모양"으로 보인다(stats). 별 3개를 받은 뒤 다시 한 판의 안내도 이 단계의 말로
    if (dexMode) {
      const count = dexCount();
      if (count < DEX_STOP_MIN) return;
      ctx.finish({
        stars: dexStars(count),
        highlights: dexHighlights(sum, { earned, explainCount, dexCount: count, dexTotal }),
        stats: dexStats(sum),
        practiceNote: FREE_REPLAY_NOTE,
      });
      return;
    }
    ctx.finish({ stars: freeStars(sum.found), highlights: freeHighlights(sum, { earned, explainCount }), stats: freeStats(sum), practiceNote: FREE_REPLAY_NOTE });
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
