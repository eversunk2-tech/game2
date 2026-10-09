/**
 * 도전 주문서 "주사위 주문"(cube-dice) 화면. spec 16-3
 *
 * 면 카드가 주사위 눈 1~6이다. 눈 카드 6장을 놓는 판에 놓고 → [접어 보기] → 놓은 그대로 접힌다(접기 전에 될지 묻지 않는다).
 * 마주 보는 두 눈의 합이 7이 되는 전개도를 서로 다른 모양으로 2개 만들면 [결과 보기].
 * - 판정: 정육면체가 되는지는 판별 단계와 같은 checkNet, 마주 보는 눈은 마주 보는 면 단계와 같은 oppositeFace (logic.judgeDice)
 * - 접은 것은 모두 기록한다. 문항은 "n번째 주사위"(itemId = cube-dice:n) — 처음에 맞히면 +2, 고쳐서 맞히면 +1 (엔진 점수 표 그대로).
 *   별은 접은 시도의 정확도(엔진 기본: 90% 이상 ★3, 70% 이상 ★2). 도감·노트에는 넣지 않는다(직접 만드는 단계의 "접어 본 모양"과 섞지 않는다)
 * - 다 접으면 마주 보는 두 면에 같은 무늬와 "합 7"을 보인다. 틀리면 "1과 5가 마주 봐요. 마주 보는 두 눈의 합은 7이에요."(tag 마주 보는 면),
 *   정육면체가 안 되는 모양이면 판별 단계와 같은 표시(겹쳐요·비어요·●)와 그 까닭의 tag
 * - 접기 전 화면에는 어느 눈끼리 마주 보는지·합이 맞는지가 글자·무늬·색·클래스·속성·화면 읽기 알림 어디에도 없다:
 *   짝은 [접어 보기]를 누른 뒤에만 계산하고, 접기 전에 막는 까닭(같은 모양·이미 접어 본 놓기)은 이미 본 결과에서만 나온다
 * - 시간 재기는 엔진이 한다(timer: 'optional' — 켠 학생만 시간이 보인다)
 * - 힌트: 틀린 접기를 연달아 2번 했거나 90초 동안 주사위를 못 만들면 [힌트]. 1번째 글, 2번째 그림자(전개도 모양만, 누를 때만)
 */
import { josa } from '../../shared/core/korean.js';
import { starsFromAccuracy } from '../../shared/core/progress.js';
import { XP } from '../../shared/core/rewards.js';
import { icon } from '../../shared/ui/icons.js';
import { createFreeBoard, gridAdapter } from './free-board.js';
import {
  BOARD_SIZES,
  DICE_GOAL,
  DICE_HINT_AFTER_WRONG,
  DICE_HINT_TEXT,
  DICE_PIPS,
  HINT_AFTER_MS,
  centerOnBoard,
  createDiceSession,
  dexItemName,
  diceFoldNote,
  diceHighlights,
  diceHintNet,
  diceOrdinal,
  diceSummary,
  pipName,
} from './logic.js';
import { CUBE_NETS } from './nets-data.js';
import { miniDice, pipFace } from './thumbs.js';
import { MAT_TOOLS_LIFT, createFoldTools, createNetView } from './view3d.js';

const PHONE = '(max-width: 560px)';
/** 눈 카드의 겉모습: 이름 "주사위 눈 3", 점 무늬, 모두 같은 종이색(색으로 구분하지 않는다) */
const PIP_SKIN = Object.freeze({ name: pipName, mark: (_h, label) => pipFace(label), color: () => 'var(--paper)' });

export function playDice(stage, ctx) {
  const { h } = ctx;
  const phone = Boolean(globalThis.matchMedia?.(PHONE).matches);
  const size = phone ? BOARD_SIZES.phone : BOARD_SIZES.wide;
  const goal = stage.count ?? DICE_GOAL;
  const session = createDiceSession({ stageId: stage.id, goal });
  // 이번 판에 엔진이 준 점수를 갈래별로 모은다(결과 "오늘의 솜씨" 칸). 점수는 엔진이 계산하고, 여기서는 오른 만큼만 읽는다
  const earned = { first: 0, again: 0 };
  const playXp = () => ctx.reward.peek?.().xp ?? 0;
  let mode = 'edit';
  let pendingPairs = null; // 다 접히면 면에 그릴 마주 보는 짝 (접어 보기를 누른 뒤에만 생긴다)
  let markedFaces = []; // 짝 무늬를 그린 면 (놓는 판으로 돌아갈 때 지운다)

  // ── 매트: 놓는 판 ↔ 3D 무대(+ 접기 조작 띠, 보는 방향·크기 조작판) ─────────────────
  const view = createNetView({ h, sfx: ctx.sfx, skin: PIP_SKIN });
  const tools = createFoldTools({ ctx, view });
  const host = h('div', { class: 'free-host' });
  const legend = h('p', { class: 'board-legend' }, icon('hand'), '칸 누르기: 놓기 · 면 누르기: 들어 올리기');
  const sticky = h('p', { class: 'hint-sticky', hidden: true }, icon('bulb'), h('span', null, DICE_HINT_TEXT));
  const stamp = h('div', { class: 'stamp found-stamp dice-stamp', hidden: true, 'aria-hidden': 'true' });
  const tool = (cls, iconName, text, onclick) => h('button', { type: 'button', class: `btn ${cls}`, onclick }, icon(iconName), h('span', null, text));
  const clearBtn = tool('tool-clear', 'trash', '모두 빼기', () => board.clearAll());
  const undoBtn = tool('tool-undo', 'undo', '되돌리기', () => board.undo());
  const hintBtn = tool('tool-hint', 'bulb', '힌트', () => useHint());
  hintBtn.hidden = true;
  const statusCount = h('b', null, '0 / 6');
  const statusExtra = h('span', { class: 'status-extra' });
  const status = h('p', { class: 'mat-status', 'aria-hidden': 'true' }, icon('grid'), h('span', null, '놓은 면'), statusCount, statusExtra);
  const editTools = h('div', { class: 'mat-tools edit-tools' }, clearBtn, undoBtn, hintBtn, status);
  const mat = h('div', { class: 'mat free-mat' }, legend, sticky, host, stamp, editTools, tools.el, tools.pad);

  // ── 작업 지시서: 주사위 주문 ────────────────────
  const order = ctx.ui.order({ kind: stage.order ?? '주사위 주문', label: '주사위 판' });
  order.counter.classList.add('q-counter');
  const foldBtn = h('button', { type: 'button', class: 'btn btn-primary free-fold', disabled: true, onclick: () => foldNow() }, icon('play'), h('span', null, '접어 보기'));
  const foldNote = h('p', { class: 'free-note' });
  const traySlot = h('div', { class: 'tray' });
  const editSection = h('div', { class: 'free-edit' }, traySlot, h('div', { class: 'free-go' }, foldBtn, foldNote));
  const noteSlot = h('div', { class: 'reason-slot' });
  const pairSlot = h('div', { class: 'pick-slot' });
  const bonusSlot = h('div', { class: 'bonus-slot' });
  const buttonsSlot = h('div', { class: 'free-buttons' });
  const resultSection = h('div', { class: 'free-result', hidden: true }, noteSlot, pairSlot, bonusSlot);

  // 만든 주사위 (goal칸)
  const madeSlots = Array.from({ length: goal }, () => h('li', { class: 'made-slot is-empty' }));
  const madeCount = h('span', { class: 'made-count' });
  const madeEl = h('section', { class: 'made', 'aria-label': '만든 주사위' },
    h('div', { class: 'made-head' }, h('b', null, icon('cube'), '만든 주사위'), madeCount),
    h('ul', { class: 'made-grid' }, madeSlots),
  );
  order.el.classList.add('net-panel', 'free-panel', 'dice-panel');
  order.el.append(editSection, resultSection, madeEl, buttonsSlot);

  const bench = h('div', { class: 'workbench free-play dice-play' }, mat, order.el);
  ctx.el.append(bench);
  // 알림: 넓은 화면은 매트 아래쪽(조작 띠 위), 좁은 화면(태블릿 세로·휴대폰)은 매트 바로 밑 — 놓는 판·무대를 가리지 않게
  ctx.feedback.anchor?.(mat, { lift: MAT_TOOLS_LIFT, narrow: 'below' });

  const board = createFreeBoard({
    ctx,
    adapter: gridAdapter({ ...size, labels: DICE_PIPS, skin: PIP_SKIN }),
    root: bench,
    onChange: (_, message) => update(message),
  });
  traySlot.append(
    h('div', { class: 'tray-head' }, h('b', null, '눈 카드'), h('span', { class: 'tray-tip' }, '끌어서 놓거나 칸을 눌러요')),
    board.trayEl,
  );
  host.append(board.el, view.el);
  view.el.hidden = true;
  tools.el.hidden = true;
  tools.pad.hidden = true; // 보는 방향·크기 조작판은 접힌 뒤(무대가 보일 때)에만

  const resizer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => board.fit(host)) : null;
  resizer?.observe(host);
  board.fit(host);

  // ── 놓는 판 상태 ────────────────────────────
  let lastReason = 'count';
  function update(message = null) {
    if (mode !== 'edit') return;
    const st = board.state();
    const r = session.readiness(st.cells, st.labels);
    const note = diceFoldNote(r);
    // 화면 읽기: 판의 안내 + (상태가 바뀌었으면) 접을 수 있는지 한 번에
    let extra = '';
    if (r.reason !== lastReason) {
      if (r.ready) extra = ' 이제 접어 볼 수 있어요.';
      else if (r.reason !== 'count') extra = ` ${note}`;
    }
    lastReason = r.reason;
    if (message || extra) ctx.feedback.announce(`${message ?? ''}${extra}`.trim());
    board.markDetached(r.reason === 'apart' ? r.detached.map((i) => st.labels[i]) : []);
    foldBtn.disabled = !r.ready;
    foldNote.classList.toggle('is-wrong', !r.ready && r.reason !== 'count');
    foldNote.textContent = note;
    statusCount.textContent = `${st.count} / ${st.total}`;
    statusExtra.textContent = r.reason === 'apart' ? ' · 떨어진 면이 있어요' : '';
    undoBtn.disabled = !board.canUndo();
    clearBtn.disabled = st.count === 0;
  }

  function setProgress() {
    const made = session.made().length;
    order.setCounter(`만든 주사위 ${made} / ${goal}`);
    ctx.setProgress?.(made, goal, { label: '만든 주사위', done: made, check: true });
  }

  /** 만든 주사위 칸: 만든 것은 전개도 모양에 눈의 수를 적은 작은 그림, 아직이면 "?" */
  function renderMade({ fresh = null } = {}) {
    const made = session.made();
    madeCount.textContent = `${made.length} / ${goal}`;
    madeSlots.forEach((slot, i) => {
      const dice = made[i];
      const shape = dice ? dexItemName(CUBE_NETS.find((n) => n.name === dice.name)) : null;
      slot.className = `made-slot${dice ? ' is-found' : ' is-empty'}${fresh === i ? ' is-new' : ''}`;
      slot.setAttribute('aria-label', dice ? `${diceOrdinal(i + 1)} 주사위, ${shape}` : `${diceOrdinal(i + 1)} 주사위, 아직 안 만듦`);
      slot.replaceChildren(...(dice
        ? [miniDice(dice.cells, dice.labels), h('span', null, h('b', null, diceOrdinal(i + 1)), shape)]
        : [h('span', { 'aria-hidden': 'true' }, `${diceOrdinal(i + 1)} 주사위`)]));
    });
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
    const show = value && !session.done();
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
      ctx.feedback.announce(DICE_HINT_TEXT);
      return;
    }
    if (board.hasShadow()) {
      board.clearShadow();
      hintText.textContent = '그림자 힌트';
      return;
    }
    // 그림자는 정육면체가 되는 모양만 알려 준다(아직 주사위로 만들지 않은 전개도). 눈을 어디에 놓을지는 알려 주지 않는다
    const net = diceHintNet(new Set(session.made().map((d) => d.name)));
    const cells = net ? centerOnBoard(net.cells, size) : null;
    if (!cells) return;
    hintLevel = 2;
    board.showShadow(cells);
    hintText.textContent = '그림자 끄기';
    ctx.feedback.announce('판에 점선 칸이 생겼어요. 그 자리에 눈 카드를 놓아 보세요. 정육면체가 되는 모양이에요.');
  }

  // ── 모드 ────────────────────────────────────
  function enterEdit({ keep = true } = {}) {
    if (mode === 'fold') {
      view.setT(0); // 접는 장면을 멈춘다
      ctx.feedback.clear?.(); // 앞 결과의 알림이 놓는 판을 가리지 않게
    }
    mode = 'edit';
    // 앞에 접은 결과(쪽지·짝 목록·면의 짝 무늬)는 놓는 판으로 돌아올 때 지운다 — 접기 전 화면에는 숨은 글자·클래스로도 짝이 남지 않는다
    pendingPairs = null;
    clearPairMarks();
    noteSlot.replaceChildren();
    pairSlot.replaceChildren();
    bonusSlot.replaceChildren();
    view.el.hidden = true;
    tools.el.hidden = true;
    tools.pad.hidden = true;
    stamp.hidden = true;
    resultSection.hidden = true;
    buttonsSlot.replaceChildren();
    board.el.hidden = false;
    editTools.hidden = false;
    editSection.hidden = false;
    sticky.hidden = hintLevel === 0;
    legend.hidden = !sticky.hidden;
    board.setEnabled(true);
    if (!keep) board.clearAll();
    renderMade();
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
    if (!session.readiness(st.cells, st.labels).ready) return;
    const layout = board.layout(); // 판을 숨기기 전에 칸 크기·자리를 잰다
    const before = playXp();
    const step = session.fold(st.cells, st.labels);
    if (!step) return;
    // 기록: 접은 것 하나가 답 하나. 문항은 "n번째 주사위"라 틀린 뒤 고쳐 맞히면 같은 문항의 다시 도전이다
    ctx.log.answer({ itemId: step.itemId, correct: step.correct, tag: step.tag, given: step.given, expected: step.expected });
    const gain = playXp() - before;
    const firstPart = step.correct && step.firstTry ? Math.min(gain, XP.first) : 0;
    earned.first += firstPart;
    earned.again += gain - firstPart;

    enterFold();
    // 좁은 화면(휴대폰)에서 [접어 보기]를 누르느라 내려가 있으면, 접히는 매트가 보이게 올린다
    if (!globalThis.matchMedia?.('(min-width: 901px)').matches) mat.scrollIntoView?.({ block: 'nearest' });
    view.setNet(step.net, { layout });
    // 정육면체가 되는 모양은 이름표를 주사위 결과로 바꾼다. 안 되는 모양은 판별 단계와 같은 표시(겹쳐요·비어요·●)
    view.reveal(step.valid ? { ok: step.correct, text: step.correct ? '주사위가 됐어요' : '합이 7이 아닌 짝이 있어요' } : null);
    pendingPairs = step.pairs; // 다 접히면 마주 보는 면끼리 같은 무늬 (onFolded)
    tools.reset();
    tools.lock(false);
    view.animateTo(1);

    if (step.correct) {
      ctx.sfx.play('correct');
      ctx.feedback.correct(`${diceOrdinal(step.number)} 주사위 완성!`);
      stamp.replaceChildren(h('span', { class: 'stamp-inner' }, h('small', null, '주사위'), h('b', null, '완성!'), h('small', null, `${step.made} / ${goal}`)));
      stamp.hidden = false;
      ctx.feedback.celebrate?.({ kind: 'stamp', at: stamp });
    } else {
      ctx.sfx.play('wrong');
      ctx.feedback.wrong(step.kind === 'sum' ? '합이 7이 아닌 짝이 있어요.' : '정육면체가 안 돼요.');
    }

    showNote(step);
    showPairs(step);
    showBonus(step, gain);
    renderMade({ fresh: step.correct ? step.number - 1 : null });
    setProgress();

    // 힌트 조건
    if (step.correct) resetHint();
    else if (session.wrongRun() >= DICE_HINT_AFTER_WRONG) setHintReady(true);

    showButtons(step);
  }

  /** 다 접혔을 때: 마주 보는 두 면에 같은 무늬와 "합 n" 이름표 (정육면체가 되는 모양만). 펴도 남아 전개도에서 짝의 자리를 볼 수 있다 */
  function onFolded(t) {
    if (!pendingPairs || t < 1 - 1e-6 || mode !== 'fold') return;
    const pairs = pendingPairs;
    pendingPairs = null;
    pairs.forEach((pair, i) => {
      pair.faces.forEach((id, k) => {
        const faceEl = view.faceEl(id);
        if (!faceEl) return;
        const [mine, other] = k === 0 ? [pair.a, pair.b] : [pair.b, pair.a];
        markedFaces.push({ faceEl, name: pipName(mine) });
        faceEl.classList.add('is-pair', `pair-${i + 1}`);
        faceEl.classList.toggle('is-miss', !pair.ok);
        faceEl.querySelector('.face-mark').textContent = `${pair.ok ? '✓' : '✗'} 합 ${pair.sum}`;
        faceEl.setAttribute('aria-label', `${pipName(mine)}, 주사위 눈 ${josa(other, '과/와')} 마주 봐요. 합 ${pair.sum}`);
      });
    });
  }
  view.onChange(onFolded);

  function clearPairMarks() {
    for (const { faceEl, name } of markedFaces) {
      faceEl.classList.remove('is-pair', 'is-miss', 'pair-1', 'pair-2', 'pair-3');
      faceEl.querySelector('.face-mark').textContent = '';
      faceEl.setAttribute('aria-label', name);
    }
    markedFaces = [];
  }

  function showNote(step) {
    const title = step.correct ? `${diceOrdinal(step.number)} 주사위 완성` : step.title;
    // 마지막 주사위까지 만들었으면 쪽지에 함께 알린다(따로 한 줄을 더 두지 않는다 — 낮은 화면·태블릿 세로에서 판이 넘치지 않게)
    const text = step.done ? `${step.message} 서로 다른 모양의 주사위 ${goal}개를 모두 만들었어요!` : step.message;
    const note = ctx.ui.note({ type: step.correct ? 'correct' : 'wrong', title, text });
    note.classList.add('reason', step.correct ? 'is-correct' : 'is-wrong');
    note.setAttribute('role', 'status');
    noteSlot.replaceChildren(note);
  }

  /** 작업 지시서의 마주 보는 눈 세 쌍: 무대의 면과 같은 무늬 + "합 n" + ✓✗ (정육면체가 되는 모양만) */
  function showPairs(step) {
    if (!step.pairs) {
      pairSlot.replaceChildren();
      return;
    }
    pairSlot.replaceChildren(h('ul', { class: 'pair-list', 'aria-label': '마주 보는 눈' }, step.pairs.map((pair, i) =>
      h('li', { class: `pair-item pair-${i + 1}${pair.ok ? '' : ' is-miss'}` },
        h('b', null, `${josa(pair.a, '과/와')} ${pair.b}`),
        h('span', { class: 'pair-sum' }, icon(pair.ok ? 'check' : 'cross'), `합 ${pair.sum}`),
      ))));
  }

  /** 보너스 쪽지: 이번 접기로 엔진이 준 점수를 글로 보인다. 별 3개를 받은 뒤 다시 하는 판(연습 점수 없음)에는 보이지 않는다 */
  function showBonus(step, gain) {
    const peek = ctx.reward.peek?.();
    bonusSlot.replaceChildren();
    if (!peek?.on || peek.practice === false) return;
    if (!step.correct) {
      bonusSlot.replaceChildren(ctx.ui.bonus(h('b', null, '다시 도전'), ` · 고쳐서 다시 접어 맞히면 +${XP.retry}`));
      return;
    }
    if (gain <= 0) return;
    const parts = [];
    if (step.firstTry) {
      parts.push(`한 번에 맞힘 +${Math.min(gain, XP.first)}`);
      if (gain > XP.first) parts.push(`다시 일어서기 +${gain - XP.first}`);
    } else parts.push(`고쳐서 맞힘 +${gain}`);
    bonusSlot.replaceChildren(ctx.ui.bonus(h('b', null, parts.join(' · '))));
  }

  const actionButton = (cls, iconName, text, onclick, { after = false } = {}) => h('button', { type: 'button', class: `btn ${cls}`, onclick },
    after ? [h('span', null, text), icon(iconName)] : [icon(iconName), h('span', null, text)]);
  const backToBoard = (keep) => () => {
    ctx.sfx.play('click');
    enterEdit({ keep });
    board.focus();
  };

  function showButtons(step) {
    if (step.done) {
      const result = actionButton('btn-primary free-finish', 'play', '결과 보기', () => finish(), { after: true });
      buttonsSlot.replaceChildren(result);
      result.focus({ preventScroll: true });
      return;
    }
    if (step.correct) {
      // 다음 주사위는 다른 모양으로: 판을 비우고 시작한다
      const next = actionButton('btn-primary dice-next', 'play', `${diceOrdinal(step.number + 1)} 주사위 만들기`, backToBoard(false), { after: true });
      buttonsSlot.replaceChildren(next);
      next.focus({ preventScroll: true });
      return;
    }
    const fix = actionButton('btn-primary free-fix', 'unfold', '펴서 고치기', backToBoard(true));
    const fresh = actionButton('free-new', 'trash', '새로 만들기', backToBoard(false));
    buttonsSlot.replaceChildren(h('div', { class: 'btn-pair' }, fix, fresh));
    fix.focus({ preventScroll: true });
  }

  // ── 끝내기: 결과 "오늘의 솜씨" ─────────────────
  function finish() {
    if (!session.done()) return;
    // 별은 접은 시도의 정확도(엔진 기본 기준). 직접 넘겨서, 주사위가 2개뿐인 이 단계에 맞지 않는 "한 번만 더 맞히면" 안내가 나오지 않게 한다
    ctx.finish({
      stars: starsFromAccuracy(ctx.log.stats().accuracy),
      highlights: diceHighlights(diceSummary(session.history()), { earned, goal }),
    });
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
