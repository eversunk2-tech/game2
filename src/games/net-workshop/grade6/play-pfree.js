/**
 * 전개도 완성하기 (prism-free, 설계 주문 — 각기둥 차시 4단계). 규칙은 prism-free-logic.js, 놓는 판은 edge-board.js.
 * 배치(사용자 결정 15-26 — 시안 B "판 위에 크게"): 만들 각기둥(돌려 볼 수 있는 입체 + 길이 이름표)을 매트 오른쪽 위 창에 크게, 판은 그 왼쪽(또는 아래),
 *   주문서에는 면 카드 · [접어 보기] · 찾은 전개도. 휴대폰은 매트가 좁아 그 창을 주문서 맨 위에 둔다(시안 A처럼).
 * 흐름: 주문 ① 밑면 + 옆면이 놓인 전개도를 완성 → [접어 보기](예상 없이 — 15-2) → 주문 ② 다른 모양으로(밑면 하나만 놓임) → 2가지면 [결과 보기]
 *   (보통 버튼 — 16-15), 한 가지 더 찾으면 별 3개. 안 되면 "왜 안 될까요?"(넘어가기 가능) → 고른 뒤 까닭 문장과 무대 표시 → [펴서 고치기] · [처음부터].
 * 점수는 이 기기에서 처음 만든 전개도만(scored: 'once') — 모음(보이지 않는 모음)에 넣고, 처음 10가지까지 만들기 성공 +2 · 등록 +5, 그 뒤는 등록 +1.
 * 접은 무대는 판과 같은 자리 · 같은 1 cm 크기에서 시작한다(어긋남 0px). 접는 동안 만들 각기둥 창은 숨긴다(오른쪽 위 보기 조작판 자리).
 */
import { XP } from '../../../shared/core/rewards.js';
import { icon } from '../../../shared/ui/icons.js';
import { createReasonPick } from '../play-judge.js';
import { TILT } from '../orbit.js';
import { MAT_TOOLS_LIFT, createFoldTools, createNetView } from '../view3d.js';
import { createEdgeBoard, faceFill } from './edge-board.js';
import {
  FREE_LATER_NOTE,
  FREE_OVER_NOTE,
  FREE_REPLAY_NOTE,
  createFreeSession,
  fitBoard,
  boxOf,
  foldReadiness,
  freeCards,
  freeFeedback,
  freeHighlights,
  freeSolid,
  freeStarNote,
  freeStars,
  freeStats,
  freeSummary,
  givenFaces,
  isLaterFree,
  isOverFree,
  judgeFreeReason,
  orderText,
  primaryFreeProblem,
  solidText,
} from './prism-free-logic.js';
import { groundPose, PRISM_JUDGE_REASONS } from './prism-logic.js';
import { PRISM_FREE_COLLECTION, PRISM_FREE_FULL, PRISM_FREE_GOAL } from './prism-stages.js';
import { prismNet, stripTree } from '../solids.js';

const PHONE = '(max-width: 560px)';
const cm = (value) => `${Math.round(value * 100) / 100} cm`;
const NS = 'http://www.w3.org/2000/svg';

/** 찾은 전개도 칸의 작은 그림: 면 다각형들(cm) */
function miniPolys(faces) {
  const pts = faces.flatMap((f) => f.poly);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [x0, y0] = [Math.min(...xs), Math.min(...ys)];
  const size = Math.max(Math.max(...xs) - x0, Math.max(...ys) - y0);
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'mini-net');
  svg.setAttribute('viewBox', `-0.3 -0.3 ${(size + 0.6).toFixed(2)} ${(size + 0.6).toFixed(2)}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const ox = (size - (Math.max(...xs) - x0)) / 2;
  const oy = (size - (Math.max(...ys) - y0)) / 2;
  for (const f of faces) {
    const poly = document.createElementNS(NS, 'polygon');
    poly.setAttribute('points', f.poly.map(([x, y]) => `${(x - x0 + ox).toFixed(3)},${(y - y0 + oy).toFixed(3)}`).join(' '));
    poly.setAttribute('style', `fill:${faceFill(f.label)};stroke:var(--ink);stroke-width:${(size / 40).toFixed(3)};stroke-linejoin:round`);
    svg.append(poly);
  }
  return svg;
}

/**
 * 만들 각기둥 그림: 접힌 입체(돌려 볼 수 있음) + 화면 크기 길이 이름표(밑면의 변 · 높이 — 그 모서리 바깥에, 돌리면 따라간다).
 * 주문을 보는 동안에만 만든다(접는 무대 .fold-stage가 한 번에 하나만 보이게)
 */
function createOrderPicture({ h, fs, inPanel }) {
  const title = h('p', { class: 'pf-pic-title' }, h('b', null, icon('cube'), '만들 각기둥'), h('span', null, fs.name));
  const stage = h('div', { class: 'pf-pic-stage' });
  const tags = h('div', { class: 'pf-tags', 'aria-hidden': 'true' });
  const caption = h('p', { class: 'pf-pic-caption' }, solidText(fs));
  const el = h('section', { class: `pf-pic ${inPanel ? 'is-panel' : 'is-mat'}`, 'aria-label': '만들 각기둥' }, title, stage, caption);
  stage.append(tags);
  let view = null;
  let raf = 0;
  const regular = new Set(fs.lengths).size === 1;
  const texts = [...fs.lengths.map((v) => (regular ? `한 변 ${cm(v)}` : cm(v))), `높이 ${cm(fs.height)}`];
  let tagEls = [];

  function place() {
    if (!view) return;
    const box = stage.getBoundingClientRect();
    const bands = [...stage.querySelectorAll('.edge-band')];
    const faces = [...stage.querySelectorAll('.net-face')].map((f) => f.getBoundingClientRect());
    if (faces.length === 0 || box.width === 0) return;
    const cx = (Math.min(...faces.map((b) => b.left)) + Math.max(...faces.map((b) => b.right))) / 2;
    const cy = (Math.min(...faces.map((b) => b.top)) + Math.max(...faces.map((b) => b.bottom))) / 2;
    const placed = [];
    tagEls.forEach((tag, i) => {
      const band = bands[i];
      const hidden = !band || band.closest('.net-face').classList.contains('is-back') || (regular && i > 0 && i < bands.length - 1);
      tag.hidden = hidden;
      if (hidden) return;
      const b = band.getBoundingClientRect();
      const [mx, my] = [b.left + b.width / 2, b.top + b.height / 2];
      const fr = band.closest('.net-face').getBoundingClientRect();
      let [dx, dy] = [mx - (fr.left + fr.width / 2), my - (fr.top + fr.height / 2)];
      if (Math.hypot(dx, dy) < 2) [dx, dy] = [mx - cx, my - cy];
      const len = Math.hypot(dx, dy) || 1;
      [dx, dy] = [dx / len, dy / len];
      const [w, hh] = [tag.offsetWidth, tag.offsetHeight];
      let push = Math.max(w * Math.abs(dx), hh * Math.abs(dy)) / 2 + 6;
      let at = null;
      for (let step = 0; step < 30; step += 1) {
        const left = Math.max(2, Math.min(box.width - w - 2, mx + dx * push - w / 2 - box.left));
        const top = Math.max(2, Math.min(box.height - hh - 2, my + dy * push - hh / 2 - box.top));
        at = { left, top, right: left + w, bottom: top + hh };
        if (!placed.some((q) => at.left < q.right + 3 && q.left < at.right + 3 && at.top < q.bottom + 3 && q.top < at.bottom + 3)) break;
        push += 5;
      }
      placed.push(at);
      tag.style.transform = `translate(${at.left.toFixed(1)}px, ${at.top.toFixed(1)}px)`;
    });
  }
  function follow() {
    place();
    raf = requestAnimationFrame(follow);
  }

  return {
    el,
    start() {
      if (view) return;
      view = createNetView({ h });
      stage.prepend(view.el);
      const net = prismNet(fs.solid, stripTree(fs.solid));
      const ground = net.faces.find((f) => f.solid === 'b0').id;
      // 선 각기둥을 비스듬히 내려다본 자세(밑면의 모양과 옆면 둘이 보이게) — 화면이 이 크기를 쓰도록 문서에 붙인 뒤
      view.setNet(net, { model: groundPose(net, ground, 20), view: { turn: 0, tilt: 40 }, grow: 1.6 });
      view.setT(1);
      view.setViewEnabled(true);
      const top = net.faces.find((f) => f.solid === 'b1');
      const side = net.faces.find((f) => f.solid === 's1');
      view.setEdgeMarks([...top.poly.map((_, e) => ({ face: top.id, edge: e, tone: 'a' })), { face: side.id, edge: 1, tone: 'a' }]);
      // 그림의 면은 누르는 것이 아니다: 무대 하나만 초점을 받고(방향키로 돌리기), 끌기는 무대가 받는다
      for (const f of view.el.querySelectorAll('.net-face')) f.inert = true;
      view.el.setAttribute('aria-label', `만들 각기둥: ${fs.name}, ${solidText(fs)}. 끌거나 방향키로 돌려 볼 수 있어요.`);
      tagEls = texts.map((t) => h('span', { class: 'box-tag' }, t));
      tags.replaceChildren(...tagEls);
      if (!raf) follow();
    },
    stop() {
      cancelAnimationFrame(raf);
      raf = 0;
      if (!view) return;
      view.destroy();
      view.el.remove();
      view = null;
    },
    tilt: TILT,
  };
}

export function playPrismFree(stage, ctx, play) {
  const { h } = ctx;
  const phone = Boolean(globalThis.matchMedia?.(PHONE).matches);
  const fs = freeSolid(play.solidId);
  const cards = freeCards(fs);
  const goal = stage.count ?? PRISM_FREE_GOAL;
  const deviceFound = () => ctx.collection(PRISM_FREE_COLLECTION).found;
  const session = createFreeSession({ stageId: stage.id, solidId: play.solidId, deviceFound: [...deviceFound()], goal });
  const foundNets = []; // 이번 판에 찾은 전개도 { faces, isNew }
  const earned = { answer: 0, nets: 0 };
  const playXp = () => ctx.reward.peek?.().xp ?? 0;
  let order = 1;
  let mode = 'edit';
  let reached = false;

  // ── 매트 ─────────────────────────────
  const view = createNetView({ h, sfx: ctx.sfx });
  const tools = createFoldTools({ ctx, view });
  const host = h('div', { class: 'free-host' });
  const legend = h('p', { class: 'board-legend' }, icon('hand'), phone ? '카드 고르기 → + 누르기' : '카드를 고른 다음 붙일 자리(+)를 눌러요 · 카드를 모서리로 끌어도 돼요');
  const stepHead = h('b');
  const stepText = h('span');
  const stepPill = h('p', { class: 'board-legend pf-step', role: 'status' }, stepHead, stepText);
  // 안내 띠 둘은 위아래로 쌓는다: 좁은 화면에서 첫 띠가 두 줄이 되어도 주문 띠가 그 아래로 내려간다(겹치지 않게)
  const legends = h('div', { class: 'pf-legends' }, legend, stepPill);
  const stamp = h('div', { class: 'stamp found-stamp', hidden: true, 'aria-hidden': 'true' });
  const tool = (cls, iconName, text, onclick) => h('button', { type: 'button', class: `btn ${cls}`, 'aria-label': text, title: text, onclick }, icon(iconName), h('span', null, text));
  const resetBtn = tool('tool-clear', 'trash', '처음으로', () => board.reset());
  const undoBtn = tool('tool-undo', 'undo', '되돌리기', () => board.undo());
  const turnBtn = tool('tool-turn', 'rotr', '붙일 변 바꾸기', () => board.rotate());
  const statusCount = h('b');
  const status = h('p', { class: 'mat-status', 'aria-hidden': 'true' }, icon('grid'), h('span', null, '붙인 면'), statusCount);
  const editTools = h('div', { class: 'mat-tools edit-tools' }, resetBtn, undoBtn, turnBtn, status);
  const picture = createOrderPicture({ h, fs, inPanel: phone });
  const mat = h('div', { class: 'mat free-mat pf-mat' }, legends, host, phone ? null : picture.el, stamp, editTools, tools.el, tools.pad);
  host.append(view.el);

  // ── 작업 지시서 ───────────────────────
  const orderSheet = ctx.ui.order({ kind: stage.order ?? '설계 주문', label: '설계 판' });
  orderSheet.counter.classList.add('q-counter');
  const foldBtn = h('button', { type: 'button', class: 'btn btn-primary free-fold', disabled: true, onclick: () => foldNow() }, icon('play'), h('span', null, '접어 보기'));
  const foldNote = h('p', { class: 'free-note' });
  const leftTip = h('span', { class: 'tray-tip' });
  const traySlot = h('div', { class: 'tray' }, h('div', { class: 'tray-head' }, h('b', null, '면 카드'), leftTip));
  const editSection = h('div', { class: 'free-edit' }, traySlot, h('div', { class: 'free-go' }, foldBtn, foldNote));
  const noteSlot = h('div', { class: 'reason-slot' });
  const pickSlot = h('div', { class: 'pick-slot' });
  const bonusSlot = h('div', { class: 'bonus-slot' });
  const buttonsSlot = h('div', { class: 'free-buttons' });
  const resultSection = h('div', { class: 'free-result', hidden: true }, noteSlot, pickSlot, bonusSlot);
  const foundSlots = Array.from({ length: PRISM_FREE_FULL }, () => h('li', { class: 'found-slot is-empty' }));
  const foundCount = h('span', { class: 'found-count' });
  const shelfBody = h('ul', { class: 'found-grid' }, foundSlots);
  const shelf = h('section', { class: 'found-nets', 'aria-label': '찾은 전개도' }, h('div', { class: 'found-head' }, h('b', null, icon('book'), '찾은 전개도'), foundCount), shelfBody);
  orderSheet.el.classList.add('net-panel', 'free-panel', 'pf-panel');
  orderSheet.el.append(...[phone ? picture.el : null, editSection, resultSection, shelf, buttonsSlot].filter(Boolean));

  const bench = h('div', { class: 'workbench free-play prism-free' }, mat, orderSheet.el);
  ctx.el.append(bench);
  ctx.feedback.anchor?.(mat, { lift: MAT_TOOLS_LIFT, narrow: 'below' });

  /** 판으로 쓸 곳(host 기준 px): 안내 띠 아래, 만들 각기둥 창(매트 오른쪽 위)을 피해 — 창의 왼쪽(높이 그대로)과 아래(폭 그대로) 가운데 1 cm가 큰 쪽 */
  function boardArea() {
    const hr = host.getBoundingClientRect();
    const top = Math.max(0, stepPill.getBoundingClientRect().bottom - hr.top + 4);
    const whole = { left: 0, top, width: hr.width, height: Math.max(40, hr.height - top) };
    if (phone || picture.el.hidden || !picture.el.isConnected) return whole;
    const pr = picture.el.getBoundingClientRect();
    const left = { left: 0, top, width: Math.max(40, pr.left - hr.left - 6), height: whole.height };
    const belowTop = Math.max(top, pr.bottom - hr.top + 6);
    const below = { left: 0, top: belowTop, width: hr.width, height: Math.max(40, hr.height - belowTop) };
    const plan = boxOf(play.plan.map((f) => f.poly));
    return fitBoard(plan, left).unit >= fitBoard(plan, below).unit ? left : below;
  }

  const board = createEdgeBoard({ ctx, root: bench, host, cards, area: boardArea, onChange: (message) => update(message), onRefuse: (text) => refuse(text) });
  traySlot.append(board.trayEl);

  // ── 놓는 판 상태 ─────────────────────
  let lastReady = false;
  function update(message = null) {
    if (mode !== 'edit') return;
    const c = board.count();
    const r = foldReadiness(c.placed, c.total);
    if (message || (r.ready && !lastReady)) ctx.feedback.announce(`${message ?? ''}${r.ready && !lastReady ? ' 이제 접어 볼 수 있어요.' : ''}`.trim());
    lastReady = r.ready;
    foldBtn.disabled = !r.ready;
    foldNote.textContent = r.text;
    foldNote.classList.remove('is-wrong');
    foldNote.removeAttribute('role');
    statusCount.textContent = `${c.attached} / ${c.toAttach}`;
    undoBtn.disabled = !board.canUndo();
    resetBtn.disabled = !board.canUndo();
    turnBtn.disabled = !board.canRotate();
    const left = c.total - c.placed;
    leftTip.textContent = left > 0 ? `남은 카드 ${left}장` : '모두 붙였어요';
  }
  /** 붙지 않는 자리(펼친 그림에서 놓인 면과 겹침): 접어 보기 아래 안내 줄에 벽돌색으로 — 다음에 붙이면 지운다 */
  function refuse(text) {
    foldNote.textContent = text;
    foldNote.classList.add('is-wrong');
    foldNote.setAttribute('role', 'alert');
    ctx.feedback.announce(text);
  }
  // 카드를 고르고 놓을 때마다 [붙일 변 바꾸기]의 켜짐을 맞춘다(끌어다 놓기가 고르기를 정한 뒤에)
  const syncTurn = () => setTimeout(() => {
    if (mode === 'edit') turnBtn.disabled = !board.canRotate();
  }, 0);
  bench.addEventListener('click', syncTurn);
  bench.addEventListener('keyup', syncTurn);

  function setProgress() {
    const found = session.found();
    orderSheet.setCounter(order <= 2 ? `주문 ${order} / 2` : `주문 ${order}`);
    ctx.setProgress?.(Math.min(found, PRISM_FREE_FULL), PRISM_FREE_FULL, { label: '찾은 전개도', done: found, check: true });
  }

  function renderShelf() {
    foundSlots.forEach((slot, i) => {
      const item = foundNets[i];
      slot.className = `found-slot${item ? ' is-found' : ' is-empty'}${item?.isNew ? ' is-new' : ''}`;
      slot.setAttribute('aria-label', item ? `${i + 1}번째로 찾은 전개도${item.isNew ? ', 처음 찾음' : ''}` : `${i + 1}번째 칸, 아직 못 찾음`);
      slot.replaceChildren(item ? miniPolys(item.faces) : h('small', null, i + 1 >= PRISM_FREE_FULL ? '별 3개' : i + 1 === goal ? '별 2개' : '별 1개'));
    });
    foundCount.textContent = `각기둥 전개도 ${deviceFound().size}가지`;
  }
  /** 판 안쪽이 넘칠 때만 찾은 전개도 띠를 머리 한 줄로 (spec 16-10과 같은 규칙) */
  function fitShelf() {
    shelf.classList.remove('is-folded');
    shelf.hidden = false;
    shelfBody.hidden = false;
    // 넓은 화면: 주문서 안쪽이 넘치면 · 태블릿 세로(주문서가 매트 아래): 화면이 세로로 넘치면 — 휴대폰은 세로 스크롤을 허용한다(도전의 fitFound와 같은 조건, review-prism-g2 G2-2)
    // 넘치면 찾은 전개도 칸을 머리 한 줄로 접고, 그래도 넘치면 숨긴다(찾은 가지 수는 머리의 "찾은 전개도 n / 3" 칩에도 있다)
    const over = () => orderSheet.el.scrollHeight > orderSheet.el.clientHeight
      || (globalThis.matchMedia?.('(min-width: 561px) and (max-width: 900px)').matches && document.documentElement.scrollHeight > globalThis.innerHeight);
    if (over()) {
      shelf.classList.add('is-folded');
      shelfBody.hidden = true;
    }
    if (over()) shelf.hidden = true;
  }

  // ── 주문 ─────────────────────────────
  function startOrder(k) {
    order = k;
    const t = orderText(k);
    stepHead.textContent = t.head;
    stepText.textContent = ` ${t.text}`;
    board.setOrder(givenFaces(play, k), play.plan.map((f) => f.poly));
    setProgress();
    ctx.feedback.announce(`${t.head}. ${t.text}`);
  }

  // ── 모드 ─────────────────────────────
  function enterEdit({ keep = true } = {}) {
    orderSheet.el.classList.remove('is-picking');
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
    board.el.hidden = false;
    legends.hidden = false;
    editTools.hidden = false;
    editSection.hidden = false;
    picture.el.hidden = false;
    picture.start();
    board.setEnabled(true);
    if (!keep) board.reset();
    board.refit();
    renderShelf();
    update();
    fitShelf();
  }

  function enterFold() {
    mode = 'fold';
    board.setEnabled(false);
    board.el.hidden = true;
    legends.hidden = true;
    editTools.hidden = true;
    editSection.hidden = true;
    // 만들 각기둥 그림은 접는 동안 숨긴다(휴대폰의 주문서 그림도 — 접은 입체가 무대에 있고, 그림의 입체는 내려 둔다)
    picture.stop();
    picture.el.hidden = true;
    view.el.hidden = false;
    tools.el.hidden = false;
    tools.pad.hidden = false;
    resultSection.hidden = false;
  }

  /** 까닭 표시: 길이가 다른 두 선분에 같은 무늬 띠와 길이 이름표 (까닭을 고른 뒤에만) */
  function showMarks(step, chosen = null) {
    view.reveal();
    if (step.valid) return;
    const problem = primaryFreeProblem(step.problems, chosen);
    const mismatch = problem?.type === 'edge-length' ? problem : null;
    view.setEdgeMarks((mismatch?.edges ?? []).map((e, i) => ({ face: e.face, edge: e.edge, tone: 'a', text: cm(mismatch.lengths[i]) })));
  }

  // ── 접어 보기 ─────────────────────────
  function foldNow() {
    if (mode !== 'edit') return;
    const c = board.count();
    if (c.placed < c.total) return;
    const faces = board.faces();
    const layout = board.layout(); // 판을 숨기기 전에 1 cm의 크기 · 자리를 잰다
    const before = playXp();
    const step = session.fold(faces, board.rootId());
    // 등록이 먼저다: 전개도는 접는 순간 "만들어 본 전개도"가 되고(등록 점수와 함께 바로 저장), 만들기 성공 점수는 그때 실제로 새로 들어간 전개도에만
    const collected = step.collect ? ctx.collect(step.collect.id, step.collect.item) : null;
    const afterCollect = playXp();
    const first = step.first && Boolean(collected?.isNew);
    const later = first && isLaterFree(deviceFound().size);
    const over = first && isOverFree(deviceFound().size);
    if (step.log) ctx.log.answer({ itemId: step.itemId, correct: step.valid, tag: step.tag, given: step.given, expected: step.expected, scored: first && !later ? 'once' : false });
    const gain = { discover: afterCollect - before, answer: playXp() - afterCollect };
    earned.answer += gain.answer;
    earned.nets += gain.discover;
    const progressed = step.valid && step.kind !== 'repeat';
    if (progressed) foundNets.push({ faces, isNew: first });

    enterFold();
    if (!globalThis.matchMedia?.('(min-width: 901px)').matches) mat.scrollIntoView?.({ block: 'nearest' });
    const problem = step.valid ? null : primaryFreeProblem(step.problems);
    view.setNet(step.net, { layout, show: problem?.type === 'edge-length' ? problem.faces : [] });
    const feedback = freeFeedback(step, { order });
    if (feedback.marks) showMarks(step);
    tools.reset();
    tools.lock(false);
    view.animateTo(1);
    if (feedback.tone === 'correct') {
      ctx.sfx.play('correct');
      ctx.feedback.correct(feedback.toast);
    } else ctx.feedback.info(feedback.toast);
    if (first) showStamp();
    showNote(feedback);
    showBonus(step, first, gain, later, over);
    renderShelf();
    setProgress();
    const was = reached;
    if (step.done) reached = true;
    showButtons({ justReached: reached && !was, step });
    pickSlot.replaceChildren();
    if (step.kind === 'invalid') {
      const pick = createReasonPick({
        ctx,
        itemId: step.itemId,
        problems: step.problems,
        reasons: PRISM_JUDGE_REASONS,
        judge: (problems, choice) => judgeFreeReason(problems, choice, PRISM_JUDGE_REASONS),
        onDone: ({ chosen }) => {
          orderSheet.el.classList.remove('is-picking');
          // 고른 까닭이 참이면 그 까닭의 문장 · 표시를 먼저(review-prism-g2 G2-5)
          showMarks(step, chosen);
          showNote(freeFeedback(step, { picked: true, order, chosen }));
          fitShelf();
          buttonsSlot.querySelector('button')?.focus({ preventScroll: true });
        },
      });
      pickSlot.append(pick.el);
      orderSheet.el.classList.add('is-picking');
      pick.focus();
    }
    fitShelf();
  }

  function showStamp() {
    const total = deviceFound().size;
    stamp.replaceChildren(h('span', { class: 'stamp-inner' }, h('small', null, '새 전개도'), h('b', null, '발견!'), h('small', null, `${total}가지째`)));
    stamp.hidden = false;
    ctx.feedback.celebrate?.({ kind: 'found', at: stamp });
  }

  function showNote(feedback) {
    const note = ctx.ui.note({ type: feedback.tone, title: feedback.title, text: feedback.note });
    note.classList.add('reason', feedback.tone === 'correct' ? 'is-correct' : feedback.tone === 'wrong' ? 'is-wrong' : 'is-info');
    note.setAttribute('role', 'status');
    noteSlot.replaceChildren(note);
  }

  /** 보너스 쪽지: 이번 접기로 엔진이 준 점수를 글로 보인다. 점수는 이 기기에서 처음 만든 전개도에만 있다 */
  function showBonus(step, first, gain, later, over = false) {
    const peek = ctx.reward.peek?.();
    bonusSlot.replaceChildren();
    if (!peek?.on || !step.valid || step.kind === 'repeat') return;
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
    if (parts.length > 0) bonusSlot.replaceChildren(ctx.ui.bonus(h('b', null, parts.join(' · ')), later ? ` · ${FREE_LATER_NOTE}` : null));
    // 31번째부터: 점수는 없고 찾은 가지 수만 오른다(15-29)
    else if (over) bonusSlot.replaceChildren(ctx.ui.bonus(h('b', null, '새 전개도'), ` · ${FREE_OVER_NOTE}`));
  }

  const actionButton = (cls, iconName, text, onclick, { after = false } = {}) => h('button', { type: 'button', class: `btn ${cls}`, onclick },
    after ? [h('span', null, text), icon(iconName)] : [icon(iconName), h('span', null, text)]);
  const backToBoard = (keep) => () => {
    ctx.sfx.play('click');
    enterEdit({ keep });
    board.focusCards();
  };
  const nextOrder = () => {
    ctx.sfx.play('click');
    startOrder(order + 1);
    enterEdit({ keep: true });
    board.focusCards();
  };

  function showButtons({ justReached, step }) {
    const progressed = step.valid && step.kind !== 'repeat';
    const found = session.found();
    const full = found >= PRISM_FREE_FULL;
    if (!progressed) {
      const fix = actionButton('btn-primary free-fix', 'unfold', '펴서 고치기', backToBoard(true));
      const fresh = actionButton('free-new', 'trash', '처음부터', backToBoard(false));
      buttonsSlot.replaceChildren(h('div', { class: 'btn-pair' }, fix, fresh));
      fix.focus({ preventScroll: true });
      return;
    }
    const more = actionButton('btn-primary free-next', 'play', order === 1 ? '다른 모양으로 한 번 더' : '한 가지 더 찾기', nextOrder, { after: true });
    if (!reached) {
      buttonsSlot.replaceChildren(more);
      more.focus({ preventScroll: true });
      return;
    }
    // 끝낼 수 있다: 2가지면 [결과 보기]는 보통 버튼 · "한 가지 더"가 주 버튼(16-15), 3가지부터 [결과 보기]가 주 버튼
    const result = actionButton('free-finish', 'play', '결과 보기', () => finish(), { after: true });
    const done = justReached || full ? h('p', { class: 'goal-done' }, icon('check'),
      full ? `서로 다른 전개도 ${found}가지를 찾았어요! 별 3개예요.` : `전개도 ${found}가지를 찾았어요! 한 가지 더 찾으면 별 3개예요.`) : null;
    if (full) more.classList.remove('btn-primary');
    result.classList.toggle('btn-primary', full);
    buttonsSlot.replaceChildren(...[done, h('div', { class: 'btn-pair' }, full ? [result, more] : [more, result])].filter(Boolean));
    (full ? result : more).focus({ preventScroll: true });
  }

  function finish() {
    const found = session.found();
    if (found < goal) return;
    const stars = freeStars(found);
    ctx.finish({
      stars,
      starNote: freeStarNote(stars),
      highlights: freeHighlights(freeSummary(session.history()), { earned, total: deviceFound().size }),
      stats: freeStats(freeSummary(session.history())),
      practiceNote: FREE_REPLAY_NOTE,
    });
  }

  // Ctrl+Z: 되돌리기 (놓는 중)
  function onKey(event) {
    if (mode !== 'edit' || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;
    event.preventDefault();
    board.undo();
  }
  document.addEventListener('keydown', onKey);

  startOrder(1);
  enterEdit({ keep: true });

  return () => {
    document.removeEventListener('keydown', onKey);
    bench.removeEventListener('click', syncTurn);
    bench.removeEventListener('keyup', syncTurn);
    picture.stop();
    board.destroy();
    tools.destroy();
    view.destroy();
  };
}
