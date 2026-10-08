import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { createRng } from '../../src/shared/core/random.js';
import { missingSlots } from '../../src/games/net-workshop/fold.js';
import { BOARD_SIZES, FREE_REPLAY_NOTE, STAGES, centerOnBoard, judgeNetAnswer, judgeSlot, makeQuestions, reasonOf } from '../../src/games/net-workshop/logic.js';
import { CUBE_NETS, INVALID_HEXOMINOES } from '../../src/games/net-workshop/nets-data.js';
import { displayNet, viewDirection } from '../../src/games/net-workshop/view3d.js';
import { collectErrors, fileUrl, hasHorizontalScroll } from './helpers.js';

const FILE = 'net-workshop.html';

/** 게임과 같은 시드 문자열(<seed>:<단계 id>)로 같은 문항을 만들어 정답을 안다 */
const questionsFor = (stageId, seed = '1') => makeQuestions(STAGES.find((s) => s.id === stageId), createRng(`${seed}:${stageId}`));
const foldStage = (page) => page.locator('.fold-stage');

/**
 * 화면의 펼친 전개도가 문항과 같은지: 면마다 이름(data-label)과, matrix3d()의 평행이동으로 읽은 칸 위치를 비교한다.
 * (펼친 상태에서 면 버튼의 평행이동 = --unit × (칸 좌표 − 무대 가운데))
 */
async function expectSameNet(page, net) {
  const dom = await page.locator('.net-face').evaluateAll((els) => {
    const unit = parseFloat(getComputedStyle(document.querySelector('.net-scene')).getPropertyValue('--unit'));
    return els.map((el) => {
      const m = el.style.transform.match(/matrix3d\(([^)]+)\)/)[1].split(',').map(Number);
      return { id: el.dataset.face, label: el.dataset.label, x: m[12] / unit, y: m[13] / unit };
    });
  });
  expect(dom.length).toBe(net.faces.length);
  const first = dom.find((d) => d.id === net.faces[0].id);
  for (const f of net.faces) {
    const d = dom.find((x) => x.id === f.id);
    expect(d.label).toBe(f.label);
    expect(Math.round(d.x - first.x)).toBe(f.cell[0] - net.faces[0].cell[0]);
    expect(Math.round(d.y - first.y)).toBe(f.cell[1] - net.faces[0].cell[1]);
  }
}

/**
 * 판별 문항에 바르게 답한다. 안 되는 전개도를 "안 돼요"로 맞히면 접기 전에 "왜 안 될까요?"가 나오므로
 * 바른 까닭 칩을 고른다(까닭 고르기도 함께 확인).
 */
async function answerJudge(page, q) {
  await page.locator(`.answer-btn[data-answer="${q.expected}"]`).click();
  if (!q.valid) {
    await expect(page.locator('.reason-pick')).toBeVisible();
    await expect(page.locator('.reason')).toHaveCount(0); // 까닭은 고른 뒤에 보인다
    await page.locator(`.reason-chip[data-reason="${reasonOf(q.problems)}"]`).click();
  }
  await expect(page.locator('.reason')).toContainText('맞아요!');
}

/** 지금 보이는 알림(토스트)이 조작 버튼(머리의 소리·단계 선택, 답 버튼, 접기 도구, 보기 조작판, 다음 버튼, 면 카드, 놓는 판의 칸)과 겹치지 않는다 */
async function expectToastClear(page) {
  await expect(page.locator('.toast')).toBeVisible();
  const hits = await page.evaluate(() => {
    const t = document.querySelector('.toast').getBoundingClientRect();
    const controls = '.topbar button, .play-header button, .answer-btn, .fold-toggle, .btn-icon, .fold-range, .hint-btn, .next-btn, .face-card, '
      + '.cell, .tray-card, .predict-btn, .reason-chip, .reason-skip, .mat-tools button, .view-pad button, .free-buttons button, .net-slot';
    const out = [];
    for (const el of document.querySelectorAll(controls)) {
      const b = el.getBoundingClientRect();
      if (b.width === 0 || el.closest('[hidden]')) continue;
      const w = Math.min(t.right, b.right) - Math.max(t.left, b.left);
      const h = Math.min(t.bottom, b.bottom) - Math.max(t.top, b.top);
      if (w > 0 && h > 0) out.push(`${el.className} ${Math.round(w)}×${Math.round(h)}`);
    }
    return out;
  });
  expect(hits).toEqual([]);
}

/**
 * N1-1: 까닭을 고르는 동안 정답 까닭이 화면·DOM 어디에도 없다.
 * 무대: 이름표 숨김(글자도 없음), 겹친 면 빗금·"겹쳐요"·"비어요"·● 없음, 표시 클래스 없음.
 * 문서 전체(숨은 글자·화면 읽기 알림 포함, 까닭 칩 자신은 빼고): 까닭 낱말이 글자·aria-label·title·data-* 어디에도 없다.
 */
async function expectNoReasonShown(page) {
  await expect(page.locator('.reason-pick')).toBeVisible();
  await expect(page.locator('.reason-chip')).toHaveCount(3);
  await page.waitForTimeout(60); // 화면 읽기 알림은 30ms 뒤에 들어간다
  const found = await page.evaluate(() => {
    const words = /겹|네 면|한 점|모여|모이|비어|꼭짓점|●/;
    const pick = document.querySelector('.reason-pick');
    const stage = document.querySelector('.fold-stage');
    const badge = stage.querySelector('.stage-badge');
    const out = [];
    if (!badge.hidden || badge.textContent !== '') out.push(`이름표: ${badge.textContent}`);
    for (const el of stage.querySelectorAll('.is-overlap, .net-ghost, .net-dot')) out.push(`표시: ${el.className}`);
    for (const el of stage.querySelectorAll('.face-mark')) if (el.textContent !== '') out.push(`면 글자: ${el.textContent}`);
    if (/marks-/.test(stage.className)) out.push(`무대 클래스: ${stage.className}`);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (pick.contains(node) || node.parentElement.closest('script, style')) continue;
      if (words.test(node.textContent)) out.push(`글자(${node.parentElement.className}): ${node.textContent.trim().slice(0, 40)}`);
    }
    for (const el of document.body.querySelectorAll('*')) {
      if (pick.contains(el)) continue;
      for (const attr of el.attributes) {
        const checked = attr.name === 'aria-label' || attr.name === 'title' || attr.name === 'class' || attr.name.startsWith('data-');
        if (checked && /겹|네 면|한 점|모여|모이|비어|꼭짓점|●|overlap|vertex|blocked|ghost/.test(attr.value)) out.push(`속성(${el.className}): ${attr.name}=${attr.value.slice(0, 40)}`);
      }
    }
    return out;
  });
  expect(found).toEqual([]);
}

/** 결과 화면: "오늘의 솜씨" 칸 점수 합, 단계 완료·별 점수 줄의 합, "이번에 모은 솜씨 점수" (N1-4: 칸 합 + 줄 = 모은 점수) */
async function resultXpSum(page) {
  return page.evaluate(() => {
    const sum = (texts) => texts.flatMap((t) => t.match(/\+\d+/g) ?? []).reduce((total, x) => total + Number(x), 0);
    return {
      tiles: sum([...document.querySelectorAll('.behavior .b-xp')].map((el) => el.textContent)),
      line: sum([document.querySelector('.xp-line').textContent]),
      gained: Number(document.querySelector('.rank-card .xp-gain').textContent.replace(/\D/g, '')),
    };
  });
}

/**
 * N1c-2·N1c-4: 자유 배치 오른쪽 판(작업 지시서) 안쪽이 넘치지 않는다 — 판의 scrollHeight − clientHeight = 0.
 * 판 안의 보이는 버튼(면 카드·예상·까닭 칩·넘어가기·결과 보기·펴서 고치기·새로 만들기 …)은 판 밖으로 잘리지 않고 48px 이상이다.
 * (페이지 스크롤은 0인데 판 안쪽만 넘쳐 맨 아래 버튼이 잘리던 것은 noScroll로는 잡히지 않는다)
 */
async function expectPanelFits(page, label = '') {
  const m = await page.evaluate(() => {
    const panel = document.querySelector('.free-panel');
    const box = panel.getBoundingClientRect();
    const style = getComputedStyle(panel);
    const top = box.top + parseFloat(style.borderTopWidth);
    const bottom = box.bottom - parseFloat(style.borderBottomWidth);
    const buttons = [...panel.querySelectorAll('button')].filter((b) => b.getClientRects().length > 0).map((b) => {
      const r = b.getBoundingClientRect();
      return { text: b.textContent.trim().slice(0, 12), height: Math.round(r.height), cut: Math.round(Math.max(0, r.bottom - bottom, top - r.top)) };
    });
    return {
      over: panel.scrollHeight - panel.clientHeight,
      small: buttons.filter((b) => b.height < 48).map((b) => `${b.text} ${b.height}px`),
      cut: buttons.filter((b) => b.cut > 0).map((b) => `${b.text} ${b.cut}px`),
      buttons: buttons.length,
    };
  });
  expect({ over: m.over, small: m.small, cut: m.cut }, label).toEqual({ over: 0, small: [], cut: [] });
  expect(m.buttons, label).toBeGreaterThan(0);
}

async function noScroll(page) {
  const { scrollHeight, innerHeight } = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
  }));
  expect(scrollHeight).toBeLessThanOrEqual(innerHeight);
  expect(await hasHorizontalScroll(page)).toBe(false);
}

test('?lesson=cube: 그 차시 4단계만 보이고 첫 단계만 열림, 판별 5문항을 끝까지 하면 다음 단계가 열린다', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(fileUrl(FILE, '?lesson=cube&seed=1&sound=off'));
  await expect(page.locator('.eyebrow')).toHaveText('정육면체의 전개도');
  await page.getByRole('button', { name: '시작하기' }).click();
  await expect(page.getByRole('heading', { name: '단계를 골라요' })).toBeVisible();
  await expect(page.locator('.lesson-group h3')).toHaveText(['정육면체의 전개도']);
  const cards = page.locator('.stage-path .stage-card');
  await expect(cards).toHaveCount(4);
  await expect(page.locator('.stage-card')).toHaveCount(4); // 도전 주문서(N2)는 아직 없다
  await expect(cards.nth(0)).toBeEnabled();
  await expect(cards.nth(1)).toBeDisabled();
  await expect(cards.nth(2)).toBeDisabled();
  await expect(cards.nth(3)).toBeDisabled();
  await expect(cards.nth(3)).toContainText('내 맘대로 전개도');
  // 단계 카드 그림(thumb)
  await expect(page.locator('.stage-path .stage-thumb svg')).toHaveCount(4);

  await cards.first().click();
  await expect(page.locator('.order-kind')).toHaveText('검사 주문');
  const questions = questionsFor('cube-judge');
  for (const [i, q] of questions.entries()) {
    await expect(page.locator('.q-counter')).toHaveText(`문제 ${i + 1} / 5`);
    await expect(page.locator('.meta-progress')).toContainText(`문제 ${i + 1} / 5`);
    // 화면의 전개도(면 이름·칸 위치)가 같은 시드로 만든 문항과 같다
    await expectSameNet(page, q.net);
    await answerJudge(page, q);
    await page.locator('.next-btn').click();
  }

  await expect(page.getByRole('heading', { name: '단계 성공!' })).toBeVisible();
  await expect(page.getByText('5번 중 5번 맞힘')).toBeVisible();
  await expect(page.getByRole('button', { name: '다음 단계' })).toBeVisible();
  // 까닭 고르기를 맞힌 것(설명)도 오늘의 솜씨에 나온다
  await expect(page.locator('.behavior', { hasText: '설명 맞힘' })).toContainText('3번');
  await page.getByRole('button', { name: '단계 선택' }).click();
  await expect(cards.nth(1)).toBeEnabled();
  await expect(cards.nth(2)).toBeDisabled();
  expect(errors).toEqual([]);
});

test('판별 까닭 고르기: 틀린 까닭을 고르면 바른 까닭을 보여 주고 점수가 없으며, 넘어가도 접어서 까닭을 보인다', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(fileUrl(FILE, '?unlock=all&seed=1&sound=off&stage=cube-judge'));
  const questions = questionsFor('cube-judge');
  let picked = 0;
  for (const q of questions) {
    await page.locator(`.answer-btn[data-answer="${q.expected}"]`).click();
    if (!q.valid) {
      // 접기 전에 까닭을 고른다 (접기 막대는 아직 잠김, 다음 버튼 없음)
      await expect(page.locator('.fold-range')).toBeDisabled();
      await expect(page.locator('.next-btn')).toBeHidden();
      const xpBefore = await page.locator('.meta-xp b').textContent();
      if (picked === 0) {
        const wrong = ['overlap', 'vertex', 'count'].find((r) => r !== reasonOf(q.problems));
        await page.locator(`.reason-chip[data-reason="${wrong}"]`).click();
        await expect(page.locator('.reason-pick-result')).toContainText('바른 까닭은');
        await expect(page.locator('.meta-xp b')).toHaveText(xpBefore); // 틀린 까닭은 점수 없음
      } else {
        await page.locator('.reason-skip').click();
        await expect(page.locator('.reason-pick')).toBeHidden();
      }
      picked += 1;
      await expect(foldStage(page)).toHaveAttribute('data-fold', 'done');
      await expect(page.locator('.reason')).toContainText(judgeNetAnswer(q, q.expected).message);
    }
    await page.locator('.next-btn').click();
  }
  await expect(page.getByRole('heading', { name: '단계 성공!' })).toBeVisible();
  await expect(page.locator('.behavior', { hasText: '설명 맞힘' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('판별에서 겹치는 전개도에 "돼요"를 고르면 까닭과 겹친 면·빈 자리를 보여 주고, 학습 기록에 tag가 남는다', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(fileUrl(FILE, '?lesson=cube&seed=1&sound=off&stage=cube-judge'));
  for (const q of questionsFor('cube-judge')) {
    if (q.intended === 'overlap') {
      const why = judgeNetAnswer(q, 'yes');
      await page.locator('.answer-btn[data-answer="yes"]').click();
      await expect(page.locator('.toast-wrong')).toContainText(why.message);
      await expect(page.locator('.reason')).toContainText(why.message);
      await expect(foldStage(page)).toHaveAttribute('data-fold', 'done');
      const overlap = page.locator('.net-face.is-overlap');
      expect(await overlap.count()).toBeGreaterThanOrEqual(2);
      await expect(overlap.first()).toContainText('겹쳐요');
      await expect(page.locator('.net-ghost').first()).toContainText('비어요');
      await expect(page.locator('.stage-badge')).toHaveClass(/is-wrong/);
      await expect(page.locator('.stage-badge')).toContainText(/^정육면체가 안 돼요/);
      // 다시 일어서기 쪽지
      await expect(page.locator('.bonus-note')).toContainText('다음 문제를 맞히면 +1');
    } else {
      await answerJudge(page, q);
    }
    await page.locator('.next-btn').click();
  }
  await expect(page.getByText('면이 겹침 (1번)')).toBeVisible();

  await page.getByRole('button', { name: '단계 선택' }).click();
  await page.getByRole('button', { name: '처음 화면' }).click();
  await page.getByRole('button', { name: '학습 기록' }).click();
  await expect(page.getByRole('heading', { name: '자주 틀린 개념' })).toBeVisible();
  await expect(page.getByText('면이 겹침 (1번)')).toBeVisible();
  expect(errors).toEqual([]);
});

test('답하기 전에는 접기가 잠기고, 답한 뒤 [접어 보기]·[펴기]·막대로 접는다', async ({ page }) => {
  await page.goto(fileUrl(FILE, '?seed=1&sound=off&stage=cube-judge'));
  const q = questionsFor('cube-judge')[0];
  const toggle = page.locator('.fold-toggle');
  const range = page.locator('.fold-range');
  await expect(foldStage(page)).toHaveAttribute('data-fold', 'flat');
  await expect(toggle).toBeDisabled();
  await expect(range).toBeDisabled();

  expect(q.valid).toBe(true); // 시드 1의 첫 문항은 바로 접히는 유효 전개도
  await page.locator(`.answer-btn[data-answer="${q.expected}"]`).click();
  await expect(foldStage(page)).toHaveAttribute('data-fold', 'done');
  await expect(page.locator('.stage-badge')).toHaveText('정육면체가 됐어요');
  await expect(page.locator('.stage-badge')).not.toHaveClass(/is-wrong/);
  await expect(toggle).toHaveText('펴기');
  await toggle.click();
  await expect(foldStage(page)).toHaveAttribute('data-fold', 'flat');
  await expect(toggle).toHaveText('접어 보기');
  await toggle.click();
  await expect(foldStage(page)).toHaveAttribute('data-fold', 'done');

  await range.fill('50');
  await expect(foldStage(page)).toHaveAttribute('data-fold', 'half');
  await expect(page.locator('.stage-badge')).toBeHidden();
});

test.describe('움직임 줄이기', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('접기 애니메이션 대신 펼침 → 반 접힘 → 다 접힘 장면으로 바로 끝난다', async ({ page }) => {
    await page.goto(fileUrl(FILE, '?seed=1&sound=off&stage=cube-judge'));
    await page.evaluate(() => {
      const el = document.querySelector('.fold-stage');
      window.foldStates = [];
      new MutationObserver(() => window.foldStates.push(el.dataset.fold)).observe(el, { attributes: true, attributeFilter: ['data-fold'] });
    });
    const q = questionsFor('cube-judge')[0];
    await page.locator(`.answer-btn[data-answer="${q.expected}"]`).click();
    await expect(foldStage(page)).toHaveAttribute('data-fold', 'done', { timeout: 1500 });
    const states = await page.evaluate(() => window.foldStates);
    expect(states).toContain('half');
    expect(states).not.toContain('folding');
  });
});

test('키보드만으로 마주 보는 면 한 문항을 푼다 (Tab → Enter)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromebook', '키보드는 크롬북 화면에서 확인');
  const errors = collectErrors(page);
  await page.goto(fileUrl(FILE, '?unlock=all&seed=1&sound=off&stage=cube-opposite'));
  const q = questionsFor('cube-opposite')[0];
  await expect(page.locator(`.net-face[data-face="${q.star}"]`)).toHaveAttribute('aria-label', '★ 면');

  for (let i = 0; i < 20; i += 1) {
    await page.keyboard.press('Tab');
    if (await page.evaluate((id) => document.activeElement?.dataset?.face === id, q.answer)) break;
  }
  const answer = page.locator(`.net-face[data-face="${q.answer}"]`);
  await expect(answer).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.toast-correct')).toBeVisible();
  await expect(answer).toHaveClass(/is-correct/);
  await expect(foldStage(page)).toHaveAttribute('data-fold', 'done');
  await expect(page.locator('.next-btn')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.q-counter')).toHaveText('문제 2 / 4');
  expect(errors).toEqual([]);
});

test('마주 보는 면: 틀린 면은 제자리에서 흔들리고, 다시 눌러도 다시 기록하지 않는다', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(fileUrl(FILE, '?unlock=all&seed=1&sound=off&stage=cube-opposite'));
  const questions = questionsFor('cube-opposite');
  const q = questions[0];
  await expectSameNet(page, q.net);
  const wrong = page.locator(`.net-face[data-face="${q.net.faces.find((f) => f.id !== q.star && f.id !== q.answer).id}"]`);
  const before = await wrong.boundingBox();
  await wrong.click();
  for (let i = 0; i < 4; i += 1) {
    // 흔들기 애니메이션이 면의 matrix3d()를 덮으면 면이 무대 가운데로 튄다
    const box = await wrong.boundingBox();
    expect(Math.abs(box.x - before.x)).toBeLessThan(6);
    expect(Math.abs(box.y - before.y)).toBeLessThan(6);
    await page.waitForTimeout(80);
  }
  await wrong.click();
  await expect(page.locator('.toast-info')).toContainText('이미 골라 본 면');
  for (const [i, each] of questions.entries()) {
    await expect(page.locator('.q-counter')).toHaveText(`문제 ${i + 1} / 4`);
    await page.locator(`.net-face[data-face="${each.answer}"]`).click();
    await expect(page.locator(`.net-face[data-face="${each.answer}"]`)).toHaveClass(/is-correct/);
    await page.locator('.next-btn').click();
  }
  await expect(page.getByText('5번 중 4번 맞힘')).toBeVisible(); // 같은 면을 두 번 눌렀지만 오답은 1번
  await expect(page.getByText('마주 보는 면 (1번)')).toBeVisible();
  expect(errors).toEqual([]);
});

test('마주 보는 면: 틀리면 이웃한 면이라는 까닭과 [반만 접어 보기] 힌트', async ({ page }) => {
  await page.goto(fileUrl(FILE, '?unlock=all&seed=1&sound=off&stage=cube-opposite'));
  const q = questionsFor('cube-opposite')[0];
  const wrong = q.net.faces.find((f) => f.id !== q.star && f.id !== q.answer);
  await expect(page.locator('.hint-btn')).toBeHidden();
  await page.locator(`.net-face[data-face="${wrong.id}"]`).click();
  await expect(page.locator('.reason')).toContainText('이웃한 면');
  await expect(page.locator(`.net-face[data-face="${wrong.id}"]`)).toContainText('✗');
  await expect(foldStage(page)).toHaveAttribute('data-fold', 'flat');
  await page.locator('.hint-btn').click();
  await expect(page.locator('.hint-btn')).toBeDisabled();
  await expect(foldStage(page)).not.toHaveAttribute('data-fold', 'flat');
  await expect(foldStage(page)).toHaveAttribute('data-fold', 'flat', { timeout: 8000 }); // 반만 접었다가 다시 편다
});

test('태블릿에서 면 카드를 터치로 끌어 알맞은 자리에 놓으면 접혀 정육면체가 된다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'tablet', '터치 끌기는 태블릿 화면에서 확인');
  const errors = collectErrors(page);
  await page.goto(fileUrl(FILE, '?unlock=all&seed=1&sound=off&stage=cube-complete'));
  const q = questionsFor('cube-complete')[0];
  const right = q.slots.find((s) => s.ok);
  const from = await page.locator('.face-card').boundingBox();
  const to = await page.locator(`.net-slot[data-cell="${right.key}"]`).boundingBox();
  const [fx, fy] = [from.x + from.width / 2, from.y + from.height / 2];
  const [tx, ty] = [to.x + to.width / 2, to.y + to.height / 2];

  const cdp = await page.context().newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  await touch('touchStart', fx, fy);
  for (let i = 1; i <= 12; i += 1) await touch('touchMove', fx + ((tx - fx) * i) / 12, fy + ((ty - fy) * i) / 12);
  await touch('touchEnd');

  await expect(page.locator('.reason')).toContainText('맞아요!');
  await expect(foldStage(page)).toHaveAttribute('data-fold', 'done');
  await expect(page.locator('.stage-badge')).toHaveText('정육면체가 됐어요');
  expect(errors).toEqual([]);
});

test('면 붙이기: 틀린 자리는 접어서 겹침을 보여 주고 다시 하게 하며, 다 하면 4단계 "내 맘대로 전개도"로 이어진다', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(fileUrl(FILE, '?lesson=cube&unlock=all&seed=1&sound=off&stage=cube-complete'));
  const questions = questionsFor('cube-complete');

  // 1번: 틀린 자리 → 접어서 보여 줌 → 펴고 다시 → 맞는 자리
  const first = questions[0];
  const wrong = first.slots.find((s) => !s.ok);
  await page.locator('.face-card').click();
  await page.locator(`.net-slot[data-cell="${wrong.key}"]`).click();
  await expect(page.locator('.reason')).toContainText(judgeSlot(first, wrong.key).message);
  await expect(foldStage(page)).toHaveAttribute('data-fold', 'done');
  await expect(page.locator('.stage-badge')).toHaveClass(/is-wrong/);
  await page.getByRole('button', { name: '펴고 다시 하기' }).click();
  await expect(page.locator(`.net-slot[data-cell="${wrong.key}"]`)).toHaveClass(/is-tried/);
  await expect(page.locator('.hint-btn')).toBeVisible();
  // 이미 놓아 본 자리에 다시 놓으면 기록하지 않고 안내만
  await page.locator('.face-card').click();
  await page.locator(`.net-slot[data-cell="${wrong.key}"]`).click();
  await expect(page.locator('.toast-info')).toContainText('이미 놓아 본 자리');
  await expect(foldStage(page)).toHaveAttribute('data-fold', 'flat');
  await expect(page.locator('.face-card')).toBeVisible();

  for (const [i, q] of questions.entries()) {
    await expect(page.locator('.q-counter')).toHaveText(`문제 ${i + 1} / 3`);
    await page.locator('.face-card').click();
    await page.locator(`.net-slot[data-cell="${q.slots.find((s) => s.ok).key}"]`).click();
    await expect(page.locator('.stage-badge')).toHaveText('정육면체가 됐어요');
    await page.locator('.next-btn').click();
  }
  await expect(page.getByRole('heading', { name: '단계 성공!' })).toBeVisible();
  await expect(page.getByText('4번 중 3번 맞힘')).toBeVisible(); // 틀린 자리에 두 번 놓았지만 오답은 1번
  await page.getByRole('button', { name: '다음 단계' }).click();
  await expect(page.getByRole('heading', { name: '내 맘대로 전개도' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('키보드로 면 카드를 고르면 첫 빈 자리로 초점이 가고, Tab으로 자리를 골라 Enter', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromebook', '키보드는 크롬북 화면에서 확인');
  await page.goto(fileUrl(FILE, '?unlock=all&seed=1&sound=off&stage=cube-complete'));
  const q = questionsFor('cube-complete')[0];
  await page.locator('.face-card').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.face-card')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.net-slot').first()).toBeFocused();
  const right = q.slots.find((s) => s.ok).key;
  for (let i = 0; i < q.slots.length; i += 1) {
    if (await page.evaluate((key) => document.activeElement?.dataset?.cell === key, right)) break;
    await page.keyboard.press('Tab');
  }
  await expect(page.locator(`.net-slot[data-cell="${right}"]`)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.stage-badge')).toHaveText('정육면체가 됐어요');
});

test('실제 크롬북 보이는 높이(1366×680)에서도 세 단계 주요 장면에 세로 스크롤이 없다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromebook', '크롬북 화면 크기에서 확인');
  await page.setViewportSize({ width: 1366, height: 680 });
  const url = (stageId) => fileUrl(FILE, `?lesson=cube&unlock=all&seed=1&sound=off&stage=${stageId}`);

  await page.goto(url('cube-judge'));
  await noScroll(page);
  const jq = questionsFor('cube-judge')[0];
  await page.locator(`.answer-btn[data-answer="${jq.expected === 'yes' ? 'no' : 'yes'}"]`).click();
  await expect(foldStage(page)).toHaveAttribute('data-fold', 'done');
  await noScroll(page);

  await page.goto(url('cube-opposite'));
  await noScroll(page);
  const oq = questionsFor('cube-opposite')[0];
  await page.locator(`.net-face[data-face="${oq.net.faces.find((f) => f.id !== oq.star && f.id !== oq.answer).id}"]`).click();
  await expect(page.locator('.hint-btn')).toBeVisible();
  await noScroll(page);
  await page.locator(`.net-face[data-face="${oq.answer}"]`).click();
  await expect(foldStage(page)).toHaveAttribute('data-fold', 'done');
  await noScroll(page);

  await page.goto(url('cube-complete'));
  await noScroll(page);
  const cq = questionsFor('cube-complete')[0];
  await page.locator('.face-card').click();
  await page.locator(`.net-slot[data-cell="${cq.slots.find((s) => !s.ok).key}"]`).click();
  await expect(foldStage(page)).toHaveAttribute('data-fold', 'done');
  await noScroll(page);
  await page.getByRole('button', { name: '펴고 다시 하기' }).click();
  await expect(page.locator('.hint-btn')).toBeVisible();
  await noScroll(page);
  await page.locator('.face-card').click();
  await page.locator(`.net-slot[data-cell="${cq.slots.find((s) => s.ok).key}"]`).click();
  await expect(page.locator('.stage-badge')).toHaveText('정육면체가 됐어요');
  await noScroll(page);
});

test('휴대폰(390×844): 빈 자리 버튼은 48px 이상, 알림은 매트(무대의 면·빈 자리·접기 도구) 밖 바로 밑에 뜬다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'tablet', '터치 기기 설정(태블릿 프로젝트)에서 휴대폰 크기로 확인');
  test.setTimeout(90_000); // 시드 여러 개를 차례로 본다
  await page.setViewportSize({ width: 390, height: 844 });
  for (let seed = 1; seed <= 12; seed += 1) {
    await page.goto(fileUrl(FILE, `?unlock=all&seed=${seed}&sound=off&stage=cube-complete`));
    const sizes = await page.locator('.net-slot').evaluateAll((els) => els.map((el) => {
      const r = el.getBoundingClientRect();
      return Math.min(r.width, r.height);
    }));
    expect(sizes.length).toBe(questionsFor('cube-complete', seed)[0].slots.length);
    expect(Math.min(...sizes), `seed ${seed}`).toBeGreaterThanOrEqual(48);
  }
  const q = questionsFor('cube-complete', 12)[0];
  await page.locator('.face-card').click();
  await page.locator(`.net-slot[data-cell="${q.slots.find((s) => !s.ok).key}"]`).click();
  const toast = await page.locator('.toast').boundingBox();
  const mat = await page.locator('.mat').boundingBox();
  expect(toast.y).toBeGreaterThanOrEqual(mat.y + mat.height); // 재검토 2 R1: 무대 안의 면을 가리지 않는다
  expect(toast.y - (mat.y + mat.height)).toBeLessThan(24);
  // 마주 보는 면 단계에서 틀린 면을 눌러도 알림이 면을 가리지 않는다 (시드 1~6 첫 문항)
  for (let seed = 1; seed <= 6; seed += 1) {
    await page.goto(fileUrl(FILE, `?unlock=all&seed=${seed}&sound=off&stage=cube-opposite`));
    const oq = questionsFor('cube-opposite', seed)[0];
    await page.locator(`.net-face[data-face="${oq.net.faces.find((f) => f.id !== oq.star && f.id !== oq.answer).id}"]`).click();
    await expect(page.locator('.toast-wrong')).toBeVisible();
    const covered = await page.evaluate(() => {
      const t = document.querySelector('.toast').getBoundingClientRect();
      return [...document.querySelectorAll('.net-face')].filter((f) => {
        const b = f.getBoundingClientRect();
        return Math.min(t.right, b.right) > Math.max(t.left, b.left) && Math.min(t.bottom, b.bottom) > Math.max(t.top, b.top);
      }).length;
    });
    expect(covered, `seed ${seed}`).toBe(0);
  }
  // 재검토 2 R2: 결과 이름표가 "✗ 겹쳐요" 이름표·접힌 면과 겹치지 않는다 (판별 겹침 장면, 시드 1~8)
  for (let seed = 1; seed <= 8; seed += 1) {
    await page.goto(fileUrl(FILE, `?unlock=all&seed=${seed}&sound=off&stage=cube-judge`));
    for (const q of questionsFor('cube-judge', seed)) {
      await page.locator('.answer-btn[data-answer="yes"]').click(); // 안 되는 전개도에 "돼요" → 바로 접힌다
      if (q.intended !== 'overlap') {
        await page.locator('.next-btn').click();
        continue;
      }
      await expect(foldStage(page)).toHaveAttribute('data-fold', 'done');
      const hits = await page.evaluate(() => {
        const b = document.querySelector('.stage-badge').getBoundingClientRect();
        const ov = (r) => Math.min(b.right, r.right) > Math.max(b.left, r.left) && Math.min(b.bottom, r.bottom) > Math.max(b.top, r.top);
        return [...document.querySelectorAll('.net-face')].filter((f) => ov(f.getBoundingClientRect())).length;
      });
      expect(hits, `seed ${seed}`).toBe(0);
      break;
    }
  }
});

for (const stageId of ['cube-judge', 'cube-opposite', 'cube-complete']) {
  test(`${stageId}: 플레이 화면에 가로·세로 스크롤이 없다`, async ({ page }) => {
    await page.goto(fileUrl(FILE, `?lesson=cube&unlock=all&seed=1&sound=off&stage=${stageId}`));
    await expect(page.locator('.net-face').first()).toBeVisible();
    await noScroll(page);
    if (stageId === 'cube-judge') {
      // 오답 장면(접힘 + 까닭 + 다음 버튼)도 한 화면에
      const q = questionsFor(stageId)[0];
      await page.locator(`.answer-btn[data-answer="${q.expected === 'yes' ? 'no' : 'yes'}"]`).click();
      await expect(foldStage(page)).toHaveAttribute('data-fold', 'done');
      await noScroll(page);
    }
    if (stageId === 'cube-complete') {
      // 틀린 자리 장면과 [펴고 다시 하기] 뒤(힌트 버튼·까닭이 보임)도 한 화면에
      const wrong = questionsFor(stageId)[0].slots.find((s) => !s.ok);
      await page.locator('.face-card').click();
      await page.locator(`.net-slot[data-cell="${wrong.key}"]`).click();
      await expect(foldStage(page)).toHaveAttribute('data-fold', 'done');
      await noScroll(page);
      await page.getByRole('button', { name: '펴고 다시 하기' }).click();
      await expect(page.locator('.hint-btn')).toBeVisible();
      await noScroll(page);
    }
  });
}

test('빈 자리가 지금 시점에서 안 보이면 이름표에 "↻ 돌려 보면 빈 자리가 보여요"와 [↻] 강조', async ({ page }) => {
  // 시드 4: 3번(같은 쪽 날개)은 빈 자리가 겹친 자리의 정반대라 처음 시점에서 안 보인다
  await page.goto(fileUrl(FILE, '?unlock=all&seed=4&sound=off&stage=cube-judge'));
  let hiddenCount = 0;
  for (const q of questionsFor('cube-judge', '4')) {
    const { net, turn, tilt } = displayNet(q.net);
    const blocked = q.problems.some((p) => p.type === 'vertex-full');
    const hidden = !q.valid && !blocked && missingSlots(net).some((s) => viewDirection(s.normal, turn, tilt)[2] < 0.05);
    if (hidden) hiddenCount += 1;
    await page.locator('.answer-btn[data-answer="yes"]').click();
    await expect(foldStage(page)).toHaveAttribute('data-fold', 'done');
    const badge = page.locator('.stage-badge');
    const turnRight = page.getByRole('button', { name: '오른쪽으로 돌려 보기' });
    if (hidden) {
      await expect(badge).toContainText('돌려 보면 빈 자리가 보여요');
      await expect(turnRight).toHaveClass(/is-hint/);
      // spec 17-5: 보기를 바꿔 빈 자리가 보이게 되면 안내와 강조를 끄고, 다시 가려져도 다시 켜지 않는다
      const slot = missingSlots(net).find((s) => viewDirection(s.normal, turn, tilt)[2] < 0.05);
      const turnsToSee = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].find((n) => viewDirection(slot.normal, turn + n * 30, tilt)[2] >= 0.05);
      for (let n = 1; n < turnsToSee; n += 1) {
        await turnRight.click();
        await expect(badge).toContainText('돌려 보면 빈 자리가 보여요'); // 아직 안 보인다
      }
      await turnRight.click();
      await expect(badge).not.toContainText('돌려 보면');
      await expect(badge).toContainText(/^정육면체가 안 돼요$/);
      await expect(turnRight).not.toHaveClass(/is-hint/);
      for (let n = 0; n < turnsToSee; n += 1) await page.getByRole('button', { name: '왼쪽으로 돌려 보기' }).click();
      await expect(badge).not.toContainText('돌려 보면');
      // 펴고 다시 접어도 다시 켜지 않는다
      await page.locator('.fold-range').fill('40');
      await page.locator('.fold-range').fill('100');
      await expect(badge).toBeVisible();
      await expect(badge).not.toContainText('돌려 보면');
      await expect(turnRight).not.toHaveClass(/is-hint/);
    } else {
      await expect(badge).not.toContainText('돌려 보면');
      await expect(turnRight).not.toHaveClass(/is-hint/);
    }
    await page.locator('.next-btn').click();
  }
  expect(hiddenCount).toBeGreaterThan(0);
});

test('알림(토스트)이 조작 버튼을 가리지 않는다 (크롬북 1366×768·1366×680, 태블릿, 휴대폰)', async ({ page }, testInfo) => {
  const sizes = testInfo.project.name === 'chromebook'
    ? [{ width: 1366, height: 768 }, { width: 1366, height: 680 }]
    : [{ width: 820, height: 1180 }, { width: 390, height: 844 }];
  for (const size of sizes) {
    await page.setViewportSize(size);
    // 판별 오답(긴 문장)
    await page.goto(fileUrl(FILE, '?unlock=all&seed=1&sound=off&stage=cube-judge'));
    const jq = questionsFor('cube-judge')[0];
    await page.locator(`.answer-btn[data-answer="${jq.expected === 'yes' ? 'no' : 'yes'}"]`).click();
    await expectToastClear(page);
    // 마주 보는 면 오답 (힌트 버튼이 보임)
    await page.goto(fileUrl(FILE, '?unlock=all&seed=1&sound=off&stage=cube-opposite'));
    const oq = questionsFor('cube-opposite')[0];
    await page.locator(`.net-face[data-face="${oq.net.faces.find((f) => f.id !== oq.star && f.id !== oq.answer).id}"]`).click();
    await expectToastClear(page);
    // 면 붙이기 오답 → 펴고 다시 하기 → 같은 자리에 다시 놓기(안내 알림)
    await page.goto(fileUrl(FILE, '?unlock=all&seed=1&sound=off&stage=cube-complete'));
    const wrong = questionsFor('cube-complete')[0].slots.find((s) => !s.ok);
    await page.locator('.face-card').click();
    await page.locator(`.net-slot[data-cell="${wrong.key}"]`).click();
    await expect(foldStage(page)).toHaveAttribute('data-fold', 'done');
    await expectToastClear(page);
    await page.getByRole('button', { name: '펴고 다시 하기' }).click();
    // N1-5: 펴고 다시 하면 앞 알림을 지운다 (휴대폰에서 다시 끌 면 카드·[반만 접어 보기]를 가리지 않게). 까닭은 쪽지에 남는다
    await expect(page.locator('.toast')).toHaveCount(0);
    await expect(page.locator('.face-card')).toBeVisible();
    await expect(page.locator('.hint-btn')).toBeVisible();
    await expect(page.locator('.reason')).toContainText(judgeSlot(questionsFor('cube-complete')[0], wrong.key).message);
    await page.locator('.face-card').click();
    await page.locator(`.net-slot[data-cell="${wrong.key}"]`).click();
    await expect(page.locator('.toast-info')).toBeVisible();
    await expectToastClear(page);
  }
});

// ── 엔진 "차시 묶음" (lessons) ──────────────────
// 차시가 둘인 작은 시험 페이지를 src/ 그대로(빌드 없이) 띄운다.
const LESSON_PAGE = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<link rel="stylesheet" href="/src/shared/styles/base.css"></head><body><div id="app"></div>
<script type="module">
import { createGameApp } from '/src/shared/ui/app.js';
createGameApp({
  root: document.getElementById('app'),
  game: { id: 'lesson-test', title: '차시 시험' },
  lessons: [{ id: 'a', title: '첫째 차시' }, { id: 'b', title: '둘째 차시' }],
  stages: [
    { id: 'a1', lesson: 'a', title: 'A1' }, { id: 'a2', lesson: 'a', title: 'A2' },
    { id: 'b1', lesson: 'b', title: 'B1' }, { id: 'b2', lesson: 'b', title: 'B2' },
  ],
  playStage(stage, ctx) {
    ctx.el.append(ctx.h('button', { type: 'button', class: 'btn', onclick: () => ctx.finish({ stars: 3 }) }, '끝내기'));
  },
}).start();
</script></body></html>`;

test.describe('엔진 차시 묶음', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('http://lesson.test/**', async (route) => {
      const { pathname } = new URL(route.request().url());
      if (pathname === '/lesson.html') return route.fulfill({ contentType: 'text/html', body: LESSON_PAGE });
      const file = path.resolve(`.${pathname}`);
      const contentType = file.endsWith('.css') ? 'text/css' : 'text/javascript';
      return route.fulfill({ contentType, body: await readFile(file, 'utf8') });
    });
  });

  test('차시마다 묶어 보이고 첫 단계가 열리며, "다음 단계"는 같은 차시 안에서만', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('http://lesson.test/lesson.html');
    await page.getByRole('button', { name: '시작하기' }).click();
    await expect(page.locator('.lesson-group h3')).toHaveText(['첫째 차시', '둘째 차시']);
    const cards = page.locator('.stage-card');
    await expect(cards).toHaveCount(4);
    await expect(cards.nth(0)).toBeEnabled();
    await expect(cards.nth(1)).toBeDisabled();
    await expect(cards.nth(2)).toBeEnabled(); // 둘째 차시의 첫 단계도 처음부터 열림
    await expect(cards.nth(3)).toBeDisabled();

    await cards.nth(2).click();
    await page.getByRole('button', { name: '끝내기' }).click();
    await expect(page.getByRole('heading', { name: '단계 성공!' })).toBeVisible();
    await page.getByRole('button', { name: '다음 단계' }).click();
    await expect(page.getByRole('heading', { name: 'B2' })).toBeVisible();
    await page.getByRole('button', { name: '끝내기' }).click();
    await expect(page.getByRole('heading', { name: '이 차시를 마쳤어요!' })).toBeVisible();
    await expect(page.getByRole('button', { name: '학습 기록 보기' })).toBeVisible();
    await expect(page.getByRole('button', { name: '다음 단계' })).toHaveCount(0);

    // 첫째 차시 끝 단계(a2)를 마쳐도 둘째 차시로 넘어가지 않는다
    await page.getByRole('button', { name: '단계 선택' }).click();
    await expect(cards.nth(1)).toBeDisabled();
    await cards.nth(0).click();
    await page.getByRole('button', { name: '끝내기' }).click();
    await page.getByRole('button', { name: '다음 단계' }).click();
    await page.getByRole('button', { name: '끝내기' }).click();
    await expect(page.getByRole('heading', { name: '이 차시를 마쳤어요!' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('?lesson=b 이면 그 차시만 보이고 처음 화면 윗줄에 차시 제목', async ({ page }) => {
    await page.goto('http://lesson.test/lesson.html?lesson=b');
    await expect(page.locator('.eyebrow')).toHaveText('둘째 차시');
    await page.getByRole('button', { name: '시작하기' }).click();
    await expect(page.locator('.lesson-group h3')).toHaveText(['둘째 차시']);
    await expect(page.locator('.stage-title')).toHaveText(['B1', 'B2']);
    await expect(page.getByText('모은 별 0 / 6')).toBeVisible();
    await expect(page.locator('.stage-card').nth(0)).toBeEnabled();
    await expect(page.locator('.stage-card').nth(1)).toBeDisabled();
  });

  test('없는 차시 id면 모든 차시를 보인다', async ({ page }) => {
    await page.goto('http://lesson.test/lesson.html?lesson=zzz');
    await page.getByRole('button', { name: '시작하기' }).click();
    await expect(page.locator('.lesson-group h3')).toHaveText(['첫째 차시', '둘째 차시']);
  });
});

// ── 4단계 "내 맘대로 전개도" (cube-free, spec 16-1) ─────────────
const FREE = (extra = '') => fileUrl(FILE, `?unlock=all&seed=1&sound=off&stage=cube-free${extra}`);
const shiftCells = (cells, dx, dy) => cells.map(([x, y]) => [x + dx, y + dy]);
const SHAPES = {
  cross: [[1, 0], [0, 1], [1, 1], [2, 1], [3, 1], [1, 2]], // 1-4-1e (십자)
  crossTurned: [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2], [1, 3]], // 같은 십자를 돌린 것
  line5: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [2, 1]], // 한 줄 5칸 (안 됨: 겹침)
  n231: [[0, 0], [1, 0], [1, 1], [2, 1], [3, 1], [1, 2]], // 2-3-1a
  n33: [[0, 0], [1, 0], [2, 0], [2, 1], [3, 1], [4, 1]], // 3-3
  block: [[0, 0], [1, 0], [0, 1], [1, 1], [2, 1], [3, 1]], // 2×2 덩어리 (안 됨)
  sameSide: [[0, 0], [1, 0], [2, 0], [3, 0], [0, 1], [2, 1]], // 같은 쪽 날개 (안 됨)
};
const cellOf = (page, [x, y]) => page.locator(`.free-board .cell[data-cell="${x},${y}"]`);
/** 빈 칸 누르기 = 남은 카드 중 앞의 것(가, 나, …)을 놓는다 */
async function placeShape(page, cells) {
  for (const c of cells) await cellOf(page, c).click();
  await expect(page.locator('.free-board .tile-face')).toHaveCount(cells.length);
}
async function foldAs(page, prediction) {
  await page.locator(`.predict-btn[data-answer="${prediction}"]`).click();
  await expect(foldStage(page)).toHaveAttribute('data-fold', 'done');
}
/** 새로 만들기: 접은 뒤에는 [새로 만들기](목표를 막 채운 장면은 [더 찾아보기]), 놓는 중에는 [모두 빼기] */
async function fresh(page) {
  if (await page.locator('.free-new').isVisible()) await page.locator('.free-new').click();
  else if (await page.locator('.free-more').isVisible()) await page.locator('.free-more').click();
  else if (await page.locator('.free-board .tile-face').count() > 0) await page.locator('.tool-clear').click();
  await expect(page.locator('.free-board .tile-face')).toHaveCount(0);
}

test('자유 배치: 칸을 눌러 십자 → "될 거예요" → 접혀 도감에, 같은 십자를 돌려 놓으면 기록 없음, 한 줄 5칸 → 겹침, 서로 다른 전개도 3가지 → 결과', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(FREE());
  await expect(page.locator('.order-kind')).toHaveText('설계 주문');
  await expect(page.locator('.q-counter')).toHaveText('찾은 전개도 0 / 3');
  await expect(page.locator('.predict-btn[data-answer="yes"]')).toBeDisabled();
  await expect(page.locator('.predict-note')).toHaveText('면 6장을 모두 놓으면 예상하고 접을 수 있어요.');

  // 1) 십자 + 될 거예요 → 처음 찾은 전개도
  await placeShape(page, shiftCells(SHAPES.cross, 1, 1));
  await expect(page.locator('.tray-card.is-used')).toHaveCount(6);
  await expect(page.locator('.mat-status')).toContainText('6 / 6');
  await foldAs(page, 'yes');
  await expect(page.locator('.stage-badge')).toHaveText('정육면체가 됐어요');
  await expect(page.locator('.reason')).toContainText('예측 적중! 처음 찾은 전개도예요.');
  await expect(page.locator('.found-stamp')).toContainText('도감 1 / 11');
  await expect(page.locator('.dex-count')).toHaveText('1 / 11');
  await expect(page.locator('.dex-slot[data-net="1-4-1e"]')).toHaveClass(/is-new/);
  await expect(page.locator('.q-counter')).toHaveText('찾은 전개도 1 / 3');
  await expect(page.locator('.meta-xp b')).toHaveText('+7'); // 예측 적중 +2, 새 발견 +5
  await expect(page.locator('.bonus-note')).toHaveText('새 발견 +5 · 예측 적중 +2');
  const xpAfterFirst = await page.locator('.meta-xp b').textContent();

  // 2) 펴서 고치기 → 놓은 그대로 판으로 → 새로 만들어 같은 십자를 돌려 놓고 접기 → 기록·점수 없음
  await page.locator('.free-fix').click();
  await expect(page.locator('.free-board .tile-face')).toHaveCount(6);
  await fresh(page);
  await placeShape(page, shiftCells(SHAPES.crossTurned, 2, 0));
  await foldAs(page, 'no');
  await expect(page.locator('.reason')).toContainText('이번에 이미 접어 본 모양이에요');
  await expect(page.locator('.meta-xp b')).toHaveText(xpAfterFirst);
  await expect(page.locator('.dex-slot[data-net="1-4-1e"]')).toHaveClass(/is-same/);

  // 3) 한 줄 5칸 + 안 될 거예요 → 예측 적중, 겹친 면 빗금, 노트에 적음, 까닭 고르기
  await fresh(page);
  await placeShape(page, shiftCells(SHAPES.line5, 1, 2));
  await foldAs(page, 'no');
  await expect(page.locator('.reason')).toContainText('예측 적중');
  await expect(page.locator('.reason')).toContainText('노트에 적었어요 (1 / 24)');
  await expect(page.locator('.dex-note b')).toHaveText('1');
  await expect(page.locator('.free-buttons')).toBeHidden(); // 까닭을 고르는 동안
  // N1-1: 까닭을 고르기 전에는 무대에 까닭 표시(이름표·겹친 면 빗금·비어요)가 없다
  await expectNoReasonShown(page);
  await expect(page.locator('.meta-xp b')).toHaveText('+10'); // 노트에 새 모양 +1, 예측 적중 +2
  await expect(page.locator('.bonus-note')).toHaveText('노트에 새 모양 +1 · 예측 적중 +2 · 연속 2번');
  await page.locator('.reason-chip[data-reason="overlap"]').click();
  await expect(page.locator('.reason-pick-result')).toContainText('맞아요');
  // 고른 뒤에 까닭 문장과 겹친 면 빗금·이름표가 나온다
  await expect(page.locator('.reason')).toContainText('같은 자리에 겹쳐요');
  expect(await page.locator('.net-face.is-overlap').count()).toBeGreaterThanOrEqual(2);
  await expect(page.locator('.net-face.is-overlap').first()).toContainText('겹쳐요');
  await expect(page.locator('.stage-badge')).toContainText(/^정육면체가 안 돼요/);
  await expect(page.locator('.meta-xp b')).toHaveText('+12'); // 까닭 설명 +2

  // 4)·5) 1-4-1이 아닌 전개도 2개 더 → 목표 달성
  await fresh(page);
  await placeShape(page, shiftCells(SHAPES.n231, 1, 1));
  await foldAs(page, 'yes');
  await expect(page.locator('.q-counter')).toHaveText('찾은 전개도 2 / 3');
  await fresh(page);
  await placeShape(page, shiftCells(SHAPES.n33, 1, 1));
  await foldAs(page, 'yes');
  await expect(page.locator('.goal-done')).toContainText('서로 다른 전개도 3가지를 모두 찾았어요!');
  await expect(page.locator('.free-more')).toBeVisible();
  await page.locator('.free-finish').click();

  await expect(page.getByRole('heading', { name: '이 차시를 마쳤어요!' })).toBeVisible();
  await expect(page.getByText('4번 중 4번 맞힘')).toBeVisible(); // 같은 십자를 다시 접은 것은 기록하지 않았다
  await expect(page.locator('.screen-result .stars-big')).toHaveAttribute('aria-label', '별 3개 중 3개');
  await expect(page.locator('.behavior').first()).toContainText('예측 적중');
  await expect(page.locator('.behavior', { hasText: '새 전개도 발견' })).toContainText('3가지');
  await expect(page.locator('.new-badge')).toContainText('십자 너머');
  // N1-4: 점수를 받은 칸이 모두 보이고(까닭 설명 포함), 칸 점수 합 + 단계 완료·별 = 이번에 모은 솜씨 점수
  await expect(page.locator('.behavior').first().locator('.b-xp')).toHaveText('+9'); // 처음 접는 모양 4번 × 2 + 연속 3번 +1
  await expect(page.locator('.behavior', { hasText: '새 전개도 발견' }).locator('.b-xp')).toHaveText('+15');
  await expect(page.locator('.behavior', { hasText: '노트에 적은 모양' })).toContainText('1가지');
  await expect(page.locator('.behavior', { hasText: '노트에 적은 모양' }).locator('.b-xp')).toHaveText('+1'); // 노트 등록은 +1 (spec 16-8)
  await expect(page.locator('.behavior', { hasText: '까닭 설명' })).toContainText('1번');
  await expect(page.locator('.behavior', { hasText: '까닭 설명' }).locator('.b-xp')).toHaveText('+2');
  await expect(page.locator('.xp-line')).toContainText('단계 완료 +5 · 별 3개 +6');
  await expect(page.locator('.rank-card .xp-gain')).toHaveText('+38');
  expect(await resultXpSum(page)).toEqual({ tiles: 27, line: 11, gained: 38 });
  expect(errors).toEqual([]);
});

test('자유 배치: 떨어진 면이 있으면 예상 버튼이 꺼지고 "떨어진 면이 있어요", 접지 않고 기록하지 않는다', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(FREE());
  await placeShape(page, [[1, 1], [2, 1], [3, 1], [4, 1], [1, 2], [6, 4]]);
  await expect(page.locator('.predict-btn[data-answer="yes"]')).toBeDisabled();
  await expect(page.locator('.predict-btn[data-answer="no"]')).toBeDisabled();
  await expect(page.locator('.predict-note')).toHaveText('떨어진 면이 있어요. 전개도는 한 장으로 이어져 있어야 접을 수 있어요.');
  await expect(page.locator('.tile-face.is-apart')).toHaveCount(1);
  await expect(cellOf(page, [6, 4])).toHaveAttribute('aria-label', /떨어진 면/);
  // 대각선(꼭짓점)만 닿아도 떨어진 것
  await page.locator('.tool-undo').click();
  await cellOf(page, [5, 2]).click();
  await expect(page.locator('.tile-face.is-apart')).toHaveCount(1);
  await expect(page.locator('.predict-btn[data-answer="yes"]')).toBeDisabled();
  await page.locator('.predict-btn[data-answer="yes"]').click({ force: true });
  await expect(foldStage(page)).toBeHidden();
  await expect(page.locator('.meta-xp b')).toHaveText('+0');
  // 이어 붙이면 접을 수 있다
  await page.locator('.tool-undo').click();
  await cellOf(page, [2, 0]).click();
  await expect(page.locator('.tile-face.is-apart')).toHaveCount(0);
  await expect(page.locator('.predict-btn[data-answer="yes"]')).toBeEnabled();
  expect(errors).toEqual([]);
});

test('자유 배치: 되돌리기·모두 빼기, 카드 누르고 칸 누르기, 놓인 면 들어 올려 옮기기·카드 칸으로 빼기', async ({ page }) => {
  await page.goto(FREE());
  await cellOf(page, [2, 2]).click(); // 가
  await page.locator('.tray-card[data-label="다"]').click(); // 카드 고르고
  await cellOf(page, [3, 2]).click(); // 칸 누르기
  await expect(cellOf(page, [3, 2]).locator('.tile-face')).toHaveAttribute('data-label', '다');
  // 놓인 면 들어 올려 옮기기
  await cellOf(page, [3, 2]).click();
  await expect(cellOf(page, [3, 2]).locator('.tile-face')).toHaveClass(/is-held/);
  await cellOf(page, [4, 3]).click();
  await expect(cellOf(page, [4, 3]).locator('.tile-face')).toHaveAttribute('data-label', '다');
  await expect(cellOf(page, [3, 2]).locator('.tile-face')).toHaveCount(0);
  // 들어 올린 뒤 카드 칸 누르기 = 빼기
  await cellOf(page, [4, 3]).click();
  await page.locator('.tray-cards').click({ position: { x: 4, y: 4 } });
  await expect(page.locator('.free-board .tile-face')).toHaveCount(1);
  await expect(page.locator('.tray-card[data-label="다"]')).not.toHaveClass(/is-used/);
  // 되돌리기 (빼기 → 옮기기 순서로)
  await page.locator('.tool-undo').click();
  await expect(cellOf(page, [4, 3]).locator('.tile-face')).toHaveAttribute('data-label', '다');
  await page.locator('.tool-undo').click();
  await expect(cellOf(page, [3, 2]).locator('.tile-face')).toHaveAttribute('data-label', '다');
  await page.locator('.tool-clear').click();
  await expect(page.locator('.free-board .tile-face')).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(page.locator('.free-board .tile-face')).toHaveCount(2);
});

test('자유 배치 키보드만: Tab으로 판에 들어가 방향키·Enter로 6장 놓기, 들어 옮기기, Delete, 예상하고 접기, 결과까지', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromebook', '키보드는 크롬북 화면에서 확인');
  const errors = collectErrors(page);
  await page.goto(FREE());
  // Tab으로 판의 칸 하나에 들어간다 (판 안에서는 칸 하나만 Tab에 걸린다)
  for (let i = 0; i < 30; i += 1) {
    await page.keyboard.press('Tab');
    if (await page.evaluate(() => document.activeElement?.classList.contains('cell'))) break;
  }
  expect(await page.locator('.free-board .cell[tabindex="0"]').count()).toBe(1);
  const focusedCell = () => page.evaluate(() => document.activeElement?.dataset?.cell);
  const goTo = async ([x, y]) => {
    for (let i = 0; i < 12; i += 1) {
      const [cx, cy] = (await focusedCell()).split(',').map(Number);
      if (cx === x && cy === y) return;
      await page.keyboard.press(cx < x ? 'ArrowRight' : cx > x ? 'ArrowLeft' : cy < y ? 'ArrowDown' : 'ArrowUp');
    }
  };
  // 십자 아닌 2-3-1: 6장 놓기
  for (const c of shiftCells(SHAPES.n231, 2, 1)) {
    await goTo(c);
    await page.keyboard.press('Enter');
  }
  await expect(page.locator('.free-board .tile-face')).toHaveCount(6);
  // 바(마지막) 면을 들어 한 칸 옮겼다가 제자리로: Enter → 방향키 → Enter
  const last = shiftCells(SHAPES.n231, 2, 1)[5];
  await goTo(last);
  await page.keyboard.press('Enter');
  await expect(cellOf(page, last).locator('.tile-face')).toHaveClass(/is-held/);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await expect(cellOf(page, [last[0] - 1, last[1]]).locator('.tile-face')).toHaveAttribute('data-label', '바');
  await expect(page.locator('.predict-note')).toContainText('떨어진 면이 있어요'); // 옮긴 자리는 떨어졌다
  await page.keyboard.press('Delete');
  await expect(page.locator('.free-board .tile-face')).toHaveCount(5);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter'); // 남은 바 카드를 원래 자리에
  await expect(page.locator('.free-board .tile-face')).toHaveCount(6);
  await expect(page.locator('.predict-btn[data-answer="yes"]')).toBeEnabled();
  /** Tab으로 그 요소까지 간다 (Enter는 누르지 않음) */
  const focusByTab = async (selector) => {
    for (let i = 0; i < 40; i += 1) {
      if (await page.evaluate((sel) => document.activeElement?.matches(sel), selector)) break;
      await page.keyboard.press('Tab');
    }
    await expect(page.locator(selector)).toBeFocused();
  };
  /** Tab으로 그 요소까지 가서 Enter */
  const tabTo = async (selector) => {
    await focusByTab(selector);
    await page.keyboard.press('Enter');
  };
  await tabTo('.predict-btn[data-answer="yes"]');
  await expect(foldStage(page)).toHaveAttribute('data-fold', 'done');
  await expect(page.locator('.free-fix')).toBeFocused();
  // 펴서 고치기: 놓은 그대로 판으로, 초점은 판의 칸
  await page.keyboard.press('Enter');
  await expect(page.locator('.free-board .tile-face')).toHaveCount(6);
  expect(await page.evaluate(() => document.activeElement?.classList.contains('cell'))).toBe(true);
  // [모두 빼기]로 비우고, 십자와 3-3을 더 만들어 결과까지 (모두 키보드)
  await tabTo('.tool-clear');
  await expect(page.locator('.free-board .tile-face')).toHaveCount(0);
  for (const shape of [SHAPES.cross, SHAPES.n33]) {
    await focusByTab('.free-board .cell[tabindex="0"]'); // 판으로 (새로 만들기 뒤에는 이미 판에 초점이 있다)
    for (const c of shiftCells(shape, 1, 1)) {
      await goTo(c);
      await page.keyboard.press('Enter');
    }
    await tabTo('.predict-btn[data-answer="yes"]');
    await expect(foldStage(page)).toHaveAttribute('data-fold', 'done');
    if (shape === SHAPES.cross) await tabTo('.free-new');
  }
  await expect(page.locator('.free-finish')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '이 차시를 마쳤어요!' })).toBeVisible();
  await expect(page.getByText('3번 중 3번 맞힘')).toBeVisible();
  expect(errors).toEqual([]);
});

test('자유 배치 터치(태블릿): 카드를 칸으로 끌기, 놓인 면을 다른 칸으로 끌기, 카드 칸으로 끌어 빼기', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'tablet', '터치 끌기는 태블릿 화면에서 확인');
  const errors = collectErrors(page);
  await page.goto(FREE());
  const cdp = await page.context().newCDPSession(page);
  const center = async (locator) => {
    const b = await locator.boundingBox();
    return [b.x + b.width / 2, b.y + b.height / 2];
  };
  const drag = async (from, to) => {
    const [fx, fy] = await center(from);
    const [tx, ty] = await center(to);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    await touch('touchStart', fx, fy);
    for (let i = 1; i <= 12; i += 1) await touch('touchMove', fx + ((tx - fx) * i) / 12, fy + ((ty - fy) * i) / 12);
    await touch('touchEnd');
  };
  await drag(page.locator('.tray-card[data-label="라"]'), cellOf(page, [3, 2]));
  await expect(cellOf(page, [3, 2]).locator('.tile-face')).toHaveAttribute('data-label', '라');
  await expect(page.locator('.tray-card[data-label="라"]')).toHaveClass(/is-used/);
  await drag(cellOf(page, [3, 2]).locator('.tile-face'), cellOf(page, [5, 3]));
  await expect(cellOf(page, [5, 3]).locator('.tile-face')).toHaveAttribute('data-label', '라');
  await expect(cellOf(page, [3, 2]).locator('.tile-face')).toHaveCount(0);
  await drag(cellOf(page, [5, 3]).locator('.tile-face'), page.locator('.tray-card[data-label="가"]'));
  await expect(page.locator('.free-board .tile-face')).toHaveCount(0);
  await expect(page.locator('.tray-card[data-label="라"]')).not.toHaveClass(/is-used/);
  // 탭(누르기)으로 놓기도 된다
  await placeShape(page, shiftCells(SHAPES.cross, 1, 1));
  await foldAs(page, 'yes');
  await expect(page.locator('.stage-badge')).toHaveText('정육면체가 됐어요');
  expect(errors).toEqual([]);
});

test('자유 배치 힌트: 안 되는 모양을 연달아 2번 접으면 [힌트] → 글 → 그림자(아직 못 찾은 전개도, 누를 때만)', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(FREE());
  await expect(page.locator('.tool-hint')).toBeHidden();
  await expect(page.locator('.shadow-cell')).toHaveCount(0); // 누르기 전에는 그림자 없음
  await placeShape(page, shiftCells(SHAPES.line5, 1, 2));
  await foldAs(page, 'yes');
  await fresh(page);
  await expect(page.locator('.tool-hint')).toBeHidden();
  await placeShape(page, shiftCells(SHAPES.block, 1, 1));
  await foldAs(page, 'yes');
  await expect(page.locator('.net-dot').first()).toBeVisible(); // 네 면이 모인 꼭짓점
  await fresh(page);
  await expect(page.locator('.tool-hint')).toBeVisible();
  await page.locator('.tool-hint').click();
  await expect(page.locator('.hint-sticky')).toContainText('한 줄에 4칸을 놓고');
  await page.locator('.tool-hint').click();
  await expect(page.locator('.shadow-cell')).toHaveCount(6);
  // 그림자 칸에 그대로 놓으면 전개도가 된다 (아직 못 찾은 것)
  const shadow = await page.locator('.shadow-cell').evaluateAll((els) => {
    const unit = els[0].getBoundingClientRect().width;
    const box = els[0].parentElement.getBoundingClientRect();
    return els.map((el) => {
      const r = el.getBoundingClientRect();
      return [Math.round((r.left - box.left) / unit), Math.round((r.top - box.top) / unit)];
    });
  });
  await placeShape(page, shadow);
  await foldAs(page, 'yes');
  await expect(page.locator('.stage-badge')).toHaveText('정육면체가 됐어요');
  await expect(page.locator('.reason')).toContainText('처음 찾은 전개도');
  expect(errors).toEqual([]);
});

test('자유 배치: 세로·가로 스크롤 없음 (놓기·떨어짐·접힌 뒤·까닭 고르기·힌트·목표 달성)', async ({ page }, testInfo) => {
  test.setTimeout(90_000); // 두 크기를 이어서 본다(크롬북에서 약 28초 — 기본 30초에 닿는다)
  const sizes = testInfo.project.name === 'chromebook'
    ? [{ width: 1366, height: 768 }, { width: 1366, height: 680 }]
    : [{ width: 820, height: 1180 }];
  for (const size of sizes) {
    await page.setViewportSize(size);
    await page.goto(FREE());
    await page.evaluate(() => localStorage.clear()); // 크기마다 처음 하는 기기로 (접어 본 모양·별이 이어지지 않게)
    await page.goto(FREE());
    await noScroll(page);
    await expectPanelFits(page, '빈 판');
    await placeShape(page, [[1, 1], [2, 1], [3, 1], [4, 1], [1, 2], [6, 4]]);
    await noScroll(page);
    await expectPanelFits(page, '떨어진 면');
    await page.locator('.tool-undo').click();
    await cellOf(page, [2, 0]).click(); // 1-4-1 (십자와 다른 꼴)
    await foldAs(page, 'yes');
    await noScroll(page);
    await expectPanelFits(page, '새 전개도');
    await fresh(page);
    await placeShape(page, shiftCells(SHAPES.sameSide, 1, 1));
    await foldAs(page, 'no');
    await expect(page.locator('.reason-pick')).toBeVisible();
    await noScroll(page);
    await expectPanelFits(page, '까닭 고르는 중');
    await page.locator('.reason-chip').first().click();
    await noScroll(page);
    await expectPanelFits(page, '까닭 고른 뒤');
    await fresh(page);
    await placeShape(page, shiftCells(SHAPES.block, 1, 1));
    await foldAs(page, 'no');
    await page.locator('.reason-skip').click();
    await expectPanelFits(page, '넘어가기');
    await fresh(page);
    await page.locator('.tool-hint').click();
    await page.locator('.tool-hint').click();
    await expect(page.locator('.shadow-cell')).toHaveCount(6);
    await noScroll(page);
    await expectPanelFits(page, '힌트');
    for (const shape of [SHAPES.cross, SHAPES.n33]) {
      await fresh(page);
      await placeShape(page, shiftCells(shape, 1, 1));
      await foldAs(page, 'yes');
    }
    await expect(page.locator('.free-finish')).toBeVisible();
    await noScroll(page);
    await expectPanelFits(page, '목표 달성');
    // N1-8·N1-7: 차시 끝 결과 화면(칭호 오름 + 새 도장 3개 + 솜씨 칸 4개)도 세로·가로 스크롤이 없다 — 연출 중(도장이 커졌다 줄어드는 2초)에도, 끝난 뒤에도
    await page.locator('.free-finish').click();
    await expect(page.getByRole('heading', { name: '이 차시를 마쳤어요!' })).toBeVisible();
    await expect(page.locator('.rank-card')).toContainText('칭호가 올랐어요');
    await expect(page.locator('.new-badge-list li')).toHaveCount(3);
    await expect(page.locator('.behavior')).toHaveCount(4);
    for (const wait of [0, 250, 400, 500]) {
      await page.waitForTimeout(wait);
      await noScroll(page);
    }
    await page.waitForTimeout(1100); // 연출이 끝난 뒤에도 (모두 2.25초 뒤)
    await expect(page.locator('.is-celebrating')).toHaveCount(0);
    await noScroll(page);
    expect(await resultXpSum(page)).toEqual({ tiles: 30, line: 11, gained: 41 });
  }
});

test('자유 배치: 알림이 조작(칸·카드·예상 버튼·접기 도구·다음 버튼)을 가리지 않는다', async ({ page }, testInfo) => {
  const sizes = testInfo.project.name === 'chromebook'
    ? [{ width: 1366, height: 768 }, { width: 1366, height: 680 }]
    : [{ width: 820, height: 1180 }, { width: 390, height: 844 }];
  for (const size of sizes) {
    await page.setViewportSize(size);
    await page.goto(FREE());
    // 놓는 판이 매트의 판 자리 안에 들어가고(설명 칩·조작 띠와 겹치지 않음), 칸은 48px 이상
    const fits = await page.evaluate(() => {
      const b = document.querySelector('.free-board').getBoundingClientRect();
      const host = document.querySelector('.free-host').getBoundingClientRect();
      const cell = document.querySelector('.free-board .cell').getBoundingClientRect();
      return { inside: b.top >= host.top - 1 && b.bottom <= host.bottom + 1 && b.left >= host.left - 1 && b.right <= host.right + 1, cell: cell.width };
    });
    expect(fits.inside, `${size.width}×${size.height}`).toBe(true);
    expect(fits.cell).toBeGreaterThanOrEqual(48);
    await placeShape(page, shiftCells(SHAPES.cross, 1, 1));
    await foldAs(page, 'no'); // 예상과 달랐어요
    await expectToastClear(page);
    await page.locator('.free-fix').click();
    await expect(page.locator('.toast')).toHaveCount(0); // 판으로 돌아가면 앞 알림을 지운다
  }
});

// ── N1-1: 까닭을 고르기 전에는 정답 까닭이 보이지 않는다 ─────────────
test('자유 배치 까닭 고르기: 안 되는 모양 24가지 모두, 고르기 전에는 무대·글자·속성 어디에도 까닭이 없고 고른 뒤(맞든 틀리든·넘어가도) 보인다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromebook', '24가지 전수는 크롬북 화면에서 한 번 (다른 크기는 아래 검사)');
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  await page.goto(FREE());
  let dots = 0;
  let overlaps = 0;
  for (const [i, n] of INVALID_HEXOMINOES.entries()) {
    if (i > 0) await fresh(page);
    await placeShape(page, centerOnBoard(n.cells, BOARD_SIZES.wide));
    await foldAs(page, 'no');
    await expect(page.locator('.toast-correct')).toHaveText('예측 적중! 왜 안 되는지 골라 볼까요?');
    await expect(page.locator('.reason')).toContainText('안 될 거라고 예상했고, 접어 보니 정육면체가 안 돼요.');
    await expectNoReasonShown(page);
    // 접어 본 모습을 돌려 보거나 다시 펴도 까닭 표시는 나오지 않는다
    if (i % 6 === 0) {
      await page.getByRole('button', { name: '오른쪽으로 돌려 보기' }).click();
      await page.locator('.fold-range').fill('40');
      await page.locator('.fold-range').fill('100');
      await expect(foldStage(page)).toHaveAttribute('data-fold', 'done');
      await expectNoReasonShown(page);
    }
    // spec 17-4: 새 조작(위·아래에서 보기, 크게 보기, 끌기, 휠)으로 접힌 모습을 살펴봐도 까닭 표시·글자는 나오지 않는다
    if (i % 4 === 0) {
      await expect(foldStage(page)).toHaveClass(/can-view/); // 예상 버튼이 곧 접기라 고르는 동안에도 볼 수 있다
      await pressPad(page, '아래쪽으로 돌려 보기', i % 8 === 0 ? 3 : 8); // 옆에서 · 바로 아래에서
      await pressPad(page, '오른쪽으로 돌려 보기', 3);
      await pressPad(page, '크게 보기', 2);
      await expectNoReasonShown(page);
      await dragStage(page, 90, -70);
      await page.mouse.wheel(0, -300);
      await pressPad(page, '위쪽으로 돌려 보기', 12); // 바로 위에서
      await expect.poll(async () => (await viewOf(page)).tilt).toBe(0);
      await expectNoReasonShown(page);
      await foldStage(page).focus();
      await page.keyboard.press('0');
      await expectNoReasonShown(page);
    }
    // 고르기: 바른 까닭 · 틀린 까닭 · 넘어가기를 번갈아
    const answer = n.reason === 'vertex-full' ? 'vertex' : 'overlap';
    if (i % 3 === 0) await page.locator(`.reason-chip[data-reason="${answer}"]`).click();
    else if (i % 3 === 1) await page.locator(`.reason-chip[data-reason="${answer === 'overlap' ? 'vertex' : 'overlap'}"]`).click();
    else await page.locator('.reason-skip').click();
    // 고른 뒤: 이름표와 까닭 표시(겹친 면 빗금·● 등), 까닭 문장
    await expect(page.locator('.stage-badge')).toBeVisible();
    await expect(page.locator('.stage-badge')).toHaveClass(/is-wrong/);
    if (answer === 'vertex') {
      await expect(page.locator('.stage-badge')).toHaveText('네 면이 한 점에 모여 접을 수 없어요');
      await expect(page.locator('.net-dot').first()).toBeVisible();
      await expect(page.locator('.reason')).toContainText('네 면이 한 점에 모이면 접을 수 없어요');
      dots += 1;
    } else {
      await expect(page.locator('.stage-badge')).toContainText(/^정육면체가 안 돼요/);
      expect(await page.locator('.net-face.is-overlap').count()).toBeGreaterThanOrEqual(2);
      await expect(page.locator('.net-face.is-overlap .face-mark').first()).toHaveText('✗ 겹쳐요');
      await expect(page.locator('.reason')).toContainText('같은 자리에 겹쳐요');
      overlaps += 1;
    }
    if (i % 3 === 1) await expect(page.locator('.reason-pick-result')).toContainText('바른 까닭은');
    await expect(page.locator('.free-buttons')).toBeVisible();
    await expectPanelFits(page, n.name); // N1c-2: 안 되는 모양 24가지 모두, 고른 뒤 판 안쪽 넘침 0
  }
  expect([overlaps, dots]).toEqual([16, 8]);
  await expect(page.locator('.dex-note b')).toHaveText('24');
  // 예상을 틀리면("될 거예요") 까닭 고르기 없이 바로 까닭을 보여 준다 (오답에는 이유)
  await page.evaluate(() => localStorage.clear());
  await page.goto(FREE());
  await placeShape(page, shiftCells(SHAPES.block, 1, 1));
  await foldAs(page, 'yes');
  await expect(page.locator('.reason-pick')).toHaveCount(0);
  await expect(page.locator('.stage-badge')).toHaveText('네 면이 한 점에 모여 접을 수 없어요');
  await expect(page.locator('.net-dot').first()).toBeVisible();
  await expect(page.locator('.reason')).toContainText('예상과 달랐어요. 정육면체의 한 꼭짓점에는 면이 3개만 모여요.');
  expect(errors).toEqual([]);
});

for (const mode of ['보통', '움직임 줄이기', 'fx=low']) {
  test.describe(`자유 배치 까닭 고르기 (${mode})`, () => {
    if (mode === '움직임 줄이기') test.use({ contextOptions: { reducedMotion: 'reduce' } });

    test('크롬북·태블릿·휴대폰 크기에서 겹치는 모양과 2×2 모양: 고르기 전에는 까닭이 없고, 스크롤·알림 가림도 없다', async ({ page }, testInfo) => {
      const sizes = testInfo.project.name === 'chromebook'
        ? [{ width: 1366, height: 768 }, { width: 1366, height: 680 }]
        : [{ width: 820, height: 1180 }, { width: 390, height: 844 }];
      for (const size of sizes) {
        await page.setViewportSize(size);
        await page.goto(FREE(mode === 'fx=low' ? '&fx=low' : ''));
        await page.evaluate(() => localStorage.clear());
        await page.goto(FREE(mode === 'fx=low' ? '&fx=low' : ''));
        const phone = size.width <= 560;
        for (const [i, name] of ['other-j', 'block-g', 'same-side-b'].entries()) {
          if (i > 0) await fresh(page);
          const n = INVALID_HEXOMINOES.find((x) => x.name === name);
          await placeShape(page, centerOnBoard(n.cells, phone ? BOARD_SIZES.phone : BOARD_SIZES.wide));
          await foldAs(page, 'no');
          await expectNoReasonShown(page);
          await expectToastClear(page);
          if (!phone) await noScroll(page);
          await expectPanelFits(page, `${size.width}×${size.height} ${name} 고르는 중`);
          // spec 17-4: 고르는 동안 아래에서 보고 키워도(움직임 줄이기·fx=low에서도 버튼은 바로 반응) 까닭 표시는 없다
          await pressPad(page, '아래쪽으로 돌려 보기', 6);
          await pressPad(page, '크게 보기', 3);
          await pressPad(page, '왼쪽으로 돌려 보기', 2);
          expect((await viewOf(page)).tilt).toBe(135);
          await expectNoReasonShown(page);
          if (!phone) await noScroll(page);
          await page.locator('.reason-chip').nth(i).click(); // 겹쳐요 · 네 면이 한 점에 · 6개가 아니에요 (바른 것 둘, 틀린 것 하나)
          await expect(page.locator('.stage-badge')).toBeVisible();
          await expect(page.locator(name === 'block-g' ? '.net-dot' : '.net-face.is-overlap').first()).toBeVisible();
          if (!phone) await noScroll(page);
          await expectPanelFits(page, `${size.width}×${size.height} ${name} 고른 뒤`); // 휴대폰은 판이 길어져도 되지만 버튼은 48px 이상
        }
      }
    });
  });
}

// ── N1-2: 점수는 이 기기에서 그 모양을 처음 접을 때만 (spec 16-8) ─────────────
test('자유 배치 점수: 처음 접는 모양만 점수(노트 +1, 전개도 +5), 다른 판에서 다시 접으면 0점 — 별 3개를 피하며 다시 해도, 새로 고쳐도', async ({ page }) => {
  test.setTimeout(120_000); // 세 판을 이어서 한다
  const errors = collectErrors(page);
  await page.goto(FREE());
  const xp = page.locator('.meta-xp b');
  const chip = page.locator('.rank-chip small');
  const SAME_SHAPE_NOTE = '전에 접어 본 모양이라 점수는 없어요.';
  await expect(page.locator('.predict-note')).toHaveText('면 6장을 모두 놓으면 예상하고 접을 수 있어요.');
  /** 한 판: 십자·2-3-1·3-3(맞힘) + 한 줄 5칸(일부러 "될 거예요"로 틀림 → 4번 중 3번 = 별 2개) */
  const playOnce = async ({ turned = false } = {}) => {
    const shapes = turned
      ? [shiftCells(SHAPES.crossTurned, 2, 0), shiftCells(SHAPES.n231, 2, 1), shiftCells(SHAPES.n33, 1, 2), shiftCells(SHAPES.line5, 0, 1)]
      : [shiftCells(SHAPES.cross, 1, 1), shiftCells(SHAPES.n231, 1, 1), shiftCells(SHAPES.n33, 1, 1), shiftCells(SHAPES.line5, 1, 2)];
    for (const [i, cells] of shapes.entries()) {
      await fresh(page);
      await placeShape(page, cells);
      if (i === 0) await expect(page.locator('.predict-note')).toHaveText('고르면 바로 접혀요. 처음 접는 모양은 예상이 맞으면 +2');
      await foldAs(page, 'yes');
      if (i === 2) await page.locator('.free-more').click(); // 목표를 채운 뒤 하나 더
    }
  };

  // 1판: 처음 접는 모양 4가지 — 전개도 3 × (2 + 5) + 연속 3번 +1, 한 줄 5칸은 틀려서 노트 +1만
  await playOnce();
  await expect(xp).toHaveText('+23');
  await expect(page.locator('.bonus-note')).toHaveText('노트에 새 모양 +1 · 다시 일어서기 · 다음 새 모양 예상을 맞히면 +1');
  await expect(chip).toHaveText('23점'); // 처음 접는 모양의 점수(예측·연속·등록)는 접은 그 자리에서 저장된다 (N1c-3. 전에는 등록 점수 16점만)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('edu:net-workshop:rewards')).xp)).toBe(23);
  await page.locator('.free-finish').click();
  await expect(page.getByRole('heading', { name: '이 차시를 마쳤어요!' })).toBeVisible();
  await expect(page.locator('.screen-result .stars-big')).toHaveAttribute('aria-label', '별 3개 중 2개');
  await expect(page.locator('.behavior', { hasText: '노트에 적은 모양' }).locator('.b-xp')).toHaveText('+1');
  expect(await resultXpSum(page)).toEqual({ tiles: 23, line: 9, gained: 32 });
  await expect(chip).toHaveText('32점');

  // 2판(별 2개라 다시 하기 규칙은 걸리지 않는다): 같은 모양을 돌려서 다시 접어도 0점. 예상·기록·문장은 그대로
  await page.getByRole('button', { name: '다시 하기' }).click();
  await playOnce({ turned: true });
  await expect(xp).toHaveText('+0');
  await expect(page.locator('.bonus-note')).toHaveText(SAME_SHAPE_NOTE);
  await expect(page.locator('.reason')).toContainText('노트에 이미 있는 모양이에요 (1 / 24)');
  await page.locator('.free-new').click();
  // 같은 판에서 처음 접는 모양을 더하면 그 모양만 점수: 2×2 모양을 "안 될 거예요"로 맞히고 까닭도 맞힘 = 2 + 1 + 2
  await placeShape(page, shiftCells(SHAPES.block, 1, 1));
  await foldAs(page, 'no');
  await expect(xp).toHaveText('+3');
  await page.locator('.reason-chip[data-reason="vertex"]').click();
  await expect(page.locator('.reason-pick-result')).toHaveText('내 까닭 "네 면이 한 점에 모여요" 맞아요! 설명 +2');
  await expect(xp).toHaveText('+5');
  await expect(page.locator('.bonus-note')).toHaveText('노트에 새 모양 +1 · 예측 적중 +2 · 까닭 설명 +2');
  await page.locator('.free-finish').click();
  await expect(page.getByText('5번 중 4번 맞힘')).toBeVisible(); // 이미 접어 본 모양의 예상도 기록·별에는 들어간다
  await expect(page.locator('.screen-result .stars-big')).toHaveAttribute('aria-label', '별 3개 중 2개');
  await expect(page.locator('.behavior').first()).toContainText('4 / 5');
  await expect(page.locator('.behavior').first().locator('.b-xp')).toHaveText('+2');
  await expect(page.locator('.behavior', { hasText: '새 전개도 발견' })).toContainText('0가지');
  expect(await resultXpSum(page)).toEqual({ tiles: 5, line: 0, gained: 5 });
  await expect(chip).toHaveText('37점');

  // 3판: 새로 고친 뒤에도 "접어 본 모양"은 이어진다 → 이미 접은 5가지는 0점, 까닭을 맞혀도 설명 점수 없음
  await page.goto(FREE());
  await expect(chip).toHaveText('37점');
  await placeShape(page, shiftCells(SHAPES.block, 1, 1));
  await foldAs(page, 'no');
  await page.locator('.reason-chip[data-reason="vertex"]').click();
  await expect(page.locator('.reason-pick-result')).toHaveText('내 까닭 "네 면이 한 점에 모여요" 맞아요!');
  await expect(xp).toHaveText('+0');
  await expect(page.locator('.bonus-note')).toHaveText(SAME_SHAPE_NOTE);
  await playOnce();
  await expect(xp).toHaveText('+0');
  await page.locator('.free-finish').click();
  await expect(page.locator('.rank-card .xp-gain')).toHaveText('+0');
  await expect(page.locator('.behavior', { hasText: '까닭 설명' }).locator('.b-xp')).toHaveText('+0');
  expect(await resultXpSum(page)).toEqual({ tiles: 0, line: 0, gained: 0 });
  await expect(chip).toHaveText('37점');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('edu:net-workshop:rewards')).xp)).toBe(37);

  // "기록 모두 지우기" 뒤에는 처음 상태: 같은 십자가 다시 처음 접는 모양이다
  await page.getByRole('button', { name: '학습 기록 보기' }).click();
  await page.getByRole('button', { name: '기록 모두 지우기' }).click();
  await page.getByRole('button', { name: '한 번 더 누르면 지워져요' }).click();
  await page.goto(FREE());
  await placeShape(page, shiftCells(SHAPES.cross, 1, 1));
  await foldAs(page, 'yes');
  await expect(xp).toHaveText('+7');
  expect(errors).toEqual([]);
});

// ── N1c-1 (spec 16-9): 처음 접는 모양의 점수는 별과 상관없이 ─────────────
test('자유 배치 점수와 별 3개 다시 하기: 별 3개를 받은 단계를 다시 하는 판에서도 처음 접는 모양은 예측·연속·까닭 설명 점수를 받고, 접어 본 모양은 0점', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(FREE());
  await page.evaluate(() => localStorage.setItem('edu:net-workshop:stars', JSON.stringify({ 'cube-free': 3 })));
  await page.goto(FREE());
  const xp = page.locator('.meta-xp b');
  const chip = page.locator('.rank-chip small');
  const storedXp = () => page.evaluate(() => JSON.parse(localStorage.getItem('edu:net-workshop:rewards'))?.xp ?? 0);
  await placeShape(page, shiftCells(SHAPES.cross, 1, 1));
  await expect(page.locator('.predict-note')).toHaveText('고르면 바로 접혀요. 처음 접는 모양은 예상이 맞으면 +2'); // 별 3개 판에서도 사실이다
  await foldAs(page, 'yes');
  await expect(xp).toHaveText('+7');
  await expect(page.locator('.bonus-note')).toHaveText('새 발견 +5 · 예측 적중 +2');
  await expect(chip).toHaveText('7점'); // 그 자리에서 저장
  await fresh(page);
  await placeShape(page, shiftCells(SHAPES.line5, 1, 2));
  await foldAs(page, 'no');
  await expectNoReasonShown(page);
  await expect(xp).toHaveText('+10');
  await page.locator('.reason-chip[data-reason="overlap"]').click();
  await expect(page.locator('.reason-pick-result')).toHaveText('내 까닭 "면이 겹쳐요" 맞아요! 설명 +2');
  await expect(xp).toHaveText('+12');
  await expect(page.locator('.bonus-note')).toHaveText('노트에 새 모양 +1 · 예측 적중 +2 · 까닭 설명 +2 · 연속 2번');
  expect(await storedXp()).toBe(12);
  // 같은 판에서 이미 접은 십자를 돌려 다시 접으면 기록·점수 없음(전과 같음)
  await fresh(page);
  await placeShape(page, shiftCells(SHAPES.crossTurned, 2, 0));
  await foldAs(page, 'yes');
  await expect(page.locator('.bonus-note')).toContainText('같은 모양은 돌리거나 뒤집어도 다시 세지 않아요.');
  await expect(xp).toHaveText('+12');
  // 새 모양을 틀리면 등록 점수만 + 다시 일어서기 안내, 다음 새 모양을 맞히면 +1
  await fresh(page);
  await placeShape(page, shiftCells(SHAPES.block, 1, 1));
  await foldAs(page, 'yes');
  await expect(xp).toHaveText('+13');
  await expect(page.locator('.bonus-note')).toHaveText('노트에 새 모양 +1 · 다시 일어서기 · 다음 새 모양 예상을 맞히면 +1');
  await fresh(page);
  await placeShape(page, shiftCells(SHAPES.n231, 1, 1));
  await foldAs(page, 'yes');
  await expect(xp).toHaveText('+21'); // 발견 5 + 예측 2 + 다시 일어서기 1
  await expect(page.locator('.bonus-note')).toHaveText('새 발견 +5 · 예측 적중 +2 · 다시 일어서기·연속 +1');
  await fresh(page);
  await placeShape(page, shiftCells(SHAPES.n33, 1, 1));
  await foldAs(page, 'yes');
  await expect(xp).toHaveText('+28');
  await expect(chip).toHaveText('28점');
  await page.locator('.free-finish').click();
  // 결과: 엔진 기본 문장("연습 점수는 없어요") 대신 이 단계의 규칙. 칸 합 = 모은 점수 = 저장된 점수 차
  await expect(page.locator('.practice-note')).toHaveText(FREE_REPLAY_NOTE);
  await expect(page.locator('.practice-note')).toHaveText('처음 접는 모양은 점수를 받아요. 접어 본 모양은 다시 접어도 점수가 없어요.');
  await expect(page.locator('[role="status"]')).toContainText(FREE_REPLAY_NOTE);
  await expect(page.locator('.screen-result')).not.toContainText('연습 점수는 없어요');
  await expect(page.locator('.behavior').first()).toContainText('4 / 5');
  await expect(page.locator('.behavior').first().locator('.b-xp')).toHaveText('+9'); // 예측 2 × 4 + 다시 일어서기 1
  await expect(page.locator('.behavior', { hasText: '새 전개도 발견' }).locator('.b-xp')).toHaveText('+15');
  await expect(page.locator('.behavior', { hasText: '노트에 적은 모양' }).locator('.b-xp')).toHaveText('+2');
  await expect(page.locator('.behavior', { hasText: '까닭 설명' }).locator('.b-xp')).toHaveText('+2');
  expect(await resultXpSum(page)).toEqual({ tiles: 28, line: 0, gained: 28 }); // 별이 늘지 않아 단계 완료·별 점수는 없다
  await expect(chip).toHaveText('28점');
  expect(await storedXp()).toBe(28);
  await noScroll(page);
  // 다시 하는 판에서 전에 접어 본 모양은 0점이고, 까닭을 알려 준다 (별 3개 판에서도)
  await page.getByRole('button', { name: '다시 하기' }).click();
  await placeShape(page, shiftCells(SHAPES.n33, 1, 2));
  await foldAs(page, 'yes');
  await expect(xp).toHaveText('+0');
  await expect(page.locator('.bonus-note')).toHaveText('전에 접어 본 모양이라 점수는 없어요.');
  await expect(page.locator('.reason')).toContainText('도감 11번과 같은 모양이에요');
  await fresh(page);
  await placeShape(page, shiftCells(SHAPES.line5, 1, 2));
  await foldAs(page, 'no');
  await page.locator('.reason-chip[data-reason="overlap"]').click();
  await expect(page.locator('.reason-pick-result')).toHaveText('내 까닭 "면이 겹쳐요" 맞아요!'); // 접어 본 모양은 설명 점수도 없다
  await expect(xp).toHaveText('+0');
  expect(await storedXp()).toBe(28);
  expect(errors).toEqual([]);
});

// ── N1c-3: 처음 접는 모양의 점수는 접은 그 자리에서 저장된다 ─────────────
test('자유 배치 점수: 판 중간에 [← 단계 선택]·새로 고침으로 나가도 처음 접은 모양의 예측·설명 점수가 남고, 다시 와서 같은 모양을 접으면 0점 — 틀린 예상도 지워지지 않는다', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await page.goto(FREE());
  const xp = page.locator('.meta-xp b');
  const chip = page.locator('.rank-chip small');
  const storedXp = () => page.evaluate(() => JSON.parse(localStorage.getItem('edu:net-workshop:rewards'))?.xp ?? 0);
  const SAME_SHAPE_NOTE = '전에 접어 본 모양이라 점수는 없어요.';
  // 십자(맞힘 +7) → 한 줄 5칸(맞힘 +3, 까닭도 맞힘 +2): 머리 점수 = 칭호 칩 = 저장된 점수
  await placeShape(page, shiftCells(SHAPES.cross, 1, 1));
  await foldAs(page, 'yes');
  await expect(chip).toHaveText('7점');
  expect(await storedXp()).toBe(7);
  await fresh(page);
  await placeShape(page, shiftCells(SHAPES.line5, 1, 2));
  await foldAs(page, 'no');
  await expect(xp).toHaveText('+10');
  expect(await storedXp()).toBe(10); // 까닭을 고르기 전에도 예측·등록 점수는 저장돼 있다
  await page.locator('.reason-chip[data-reason="overlap"]').click();
  await expect(xp).toHaveText('+12');
  await expect(chip).toHaveText('12점');
  expect(await storedXp()).toBe(12);
  // [← 단계 선택]으로 나감: 점수가 남는다
  await page.getByRole('button', { name: '← 단계 선택' }).click();
  await expect(page.getByRole('heading', { name: '단계를 골라요' })).toBeVisible();
  await expect(chip).toHaveText('12점');
  expect(await storedXp()).toBe(12);
  // 다시 들어와 같은 두 모양(돌려서): 0점, 까닭을 맞혀도 설명 점수 없음
  await page.locator('.stage-card', { hasText: '내 맘대로 전개도' }).click();
  await placeShape(page, shiftCells(SHAPES.crossTurned, 2, 0));
  await foldAs(page, 'yes');
  await expect(xp).toHaveText('+0');
  await expect(page.locator('.bonus-note')).toHaveText(SAME_SHAPE_NOTE);
  await fresh(page);
  await placeShape(page, shiftCells(SHAPES.line5, 0, 1));
  await foldAs(page, 'no');
  await page.locator('.reason-chip[data-reason="overlap"]').click();
  await expect(page.locator('.reason-pick-result')).toHaveText('내 까닭 "면이 겹쳐요" 맞아요!');
  await expect(xp).toHaveText('+0');
  // 새 모양을 틀림(2×2를 "될 거예요": 노트 +1) → 새로 고침으로 나가도 틀린 예상은 지워지지 않는다
  await fresh(page);
  await placeShape(page, shiftCells(SHAPES.block, 1, 1));
  await foldAs(page, 'yes');
  await expect(xp).toHaveText('+1');
  await expect(page.locator('.bonus-note')).toContainText('다시 일어서기');
  expect(await storedXp()).toBe(13);
  await page.goto(FREE());
  await expect(chip).toHaveText('13점');
  await placeShape(page, shiftCells(SHAPES.block, 1, 1));
  await foldAs(page, 'no'); // 이번에는 맞혀도
  await page.locator('.reason-chip[data-reason="vertex"]').click();
  await expect(xp).toHaveText('+0');
  await expect(page.locator('.bonus-note')).toHaveText(SAME_SHAPE_NOTE);
  // 나갔다 와서 다시 일어서기도 이어지지 않는다: 새 전개도를 맞혀도 +7뿐
  await fresh(page);
  await placeShape(page, shiftCells(SHAPES.n231, 1, 1));
  await foldAs(page, 'yes');
  await expect(xp).toHaveText('+7');
  await expect(page.locator('.bonus-note')).toHaveText('새 발견 +5 · 예측 적중 +2');
  expect(await storedXp()).toBe(20);
  // 남는 한계: 안 되는 모양을 맞힌 뒤 까닭을 고르기 전에 나가면 그 모양의 까닭 설명 +2는 다시 받을 수 없다
  await fresh(page);
  await placeShape(page, shiftCells(SHAPES.sameSide, 1, 1));
  await foldAs(page, 'no');
  await expect(page.locator('.reason-pick')).toBeVisible();
  expect(await storedXp()).toBe(23);
  await page.goto(FREE());
  await placeShape(page, shiftCells(SHAPES.sameSide, 1, 1));
  await foldAs(page, 'no');
  await page.locator('.reason-chip[data-reason="overlap"]').click();
  await expect(page.locator('.reason-pick-result')).toHaveText('내 까닭 "면이 겹쳐요" 맞아요!');
  await expect(xp).toHaveText('+0');
  expect(await storedXp()).toBe(23);
  // 끝까지 마치면 판을 마칠 때 더해지는 것은 단계 완료·별 점수뿐 (같은 점수를 다시 더하지 않는다)
  for (const cells of [shiftCells(SHAPES.cross, 1, 1), shiftCells(SHAPES.n231, 1, 1), shiftCells(SHAPES.n33, 1, 1)]) {
    await fresh(page);
    await placeShape(page, cells);
    await foldAs(page, 'yes');
  }
  await expect(xp).toHaveText('+7'); // 3-3만 처음 접는 모양
  expect(await storedXp()).toBe(30);
  await page.locator('.free-finish').click();
  await expect(page.locator('.screen-result .stars-big')).toHaveAttribute('aria-label', '별 3개 중 3개');
  expect(await resultXpSum(page)).toEqual({ tiles: 7, line: 11, gained: 18 });
  await expect(chip).toHaveText('41점');
  expect(await storedXp()).toBe(41); // = 십자 7 + 한 줄 5칸 5 + 2×2 1 + 2-3-1 7 + 같은 쪽 날개 3 + 3-3 7 + 단계 11
  expect(errors).toEqual([]);
});

test('자유 배치 점수: 탭 두 개를 섞어 써도 저장되는 것은 늘 한 탭의 점수와 도감 한 쌍이라, 한 모양의 점수를 두 번 받지 못한다', async ({ page, context }) => {
  const errors = collectErrors(page);
  const storedXp = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('edu:net-workshop:rewards'))?.xp ?? 0);
  const storedShapes = (p) => p.evaluate(() => {
    const c = JSON.parse(localStorage.getItem('edu:net-workshop:collections')) ?? {};
    return [...Object.keys(c['cube-nets'] ?? {}), ...Object.keys(c['cube-non-nets'] ?? {})].sort();
  });
  /**
   * 예상 버튼을 누른다. 점수·등록·저장은 누르는 순간 정해지므로 접는 장면이 끝나기를 기다리지 않는다
   * (탭이 여러 개면 뒤에 있는 탭은 브라우저가 장면 그리기를 멈춘다. 탭을 바꿀 때는 앞으로 가져온다)
   */
  const foldNow = async (p, prediction) => {
    await p.bringToFront();
    await p.locator(`.predict-btn[data-answer="${prediction}"]`).click();
    await expect(p.locator('.free-result')).toBeVisible();
  };
  const tabA = page;
  const tabB = await context.newPage();
  await tabA.goto(FREE());
  await tabB.goto(FREE()); // 두 탭 모두 빈 기록에서 시작
  // 같은 십자를 두 탭에서: 둘 다 +7로 보이지만 저장은 7점
  await placeShape(tabA, shiftCells(SHAPES.cross, 1, 1));
  await foldNow(tabA, 'yes');
  await placeShape(tabB, shiftCells(SHAPES.cross, 1, 1));
  await foldNow(tabB, 'yes');
  await expect(tabB.locator('.meta-xp b')).toHaveText('+7');
  expect(await storedXp(tabA)).toBe(7);
  // A: 한 줄 5칸을 맞힘(까닭은 아직) → B: 2-3-1을 맞힘 → A: 까닭을 맞힘(+2, 점수만 저장되는 순간)
  await fresh(tabA);
  await placeShape(tabA, shiftCells(SHAPES.line5, 1, 2));
  await foldNow(tabA, 'no');
  expect(await storedXp(tabA)).toBe(10);
  await fresh(tabB);
  await placeShape(tabB, shiftCells(SHAPES.n231, 1, 1));
  await foldNow(tabB, 'yes');
  expect(await storedXp(tabB)).toBe(14);
  expect(await storedShapes(tabB)).toEqual(['1-4-1e', '2-3-1a']);
  await tabA.locator('.reason-chip[data-reason="overlap"]').click();
  await expect(tabA.locator('.meta-xp b')).toHaveText('+12');
  // 저장된 점수(12 = 십자 7 + 한 줄 5칸 5)와 도감(십자, 한 줄 5칸)은 같은 탭의 한 쌍이다 — 점수만 A, 도감만 B로 엇갈리지 않는다
  expect(await storedXp(tabA)).toBe(12);
  expect(await storedShapes(tabA)).toEqual(['1-4-1e', 'line5-d']);
  // 새 탭: 저장된 도감에 있는 모양은 0점, 없는 모양(2-3-1)만 점수 → 세 모양 모두 한 번씩만 받는다
  const tabC = await context.newPage();
  await tabC.goto(FREE());
  await expect(tabC.locator('.rank-chip small')).toHaveText('12점');
  await placeShape(tabC, shiftCells(SHAPES.line5, 1, 2));
  await foldNow(tabC, 'no');
  await tabC.locator('.reason-chip[data-reason="overlap"]').click();
  await expect(tabC.locator('.meta-xp b')).toHaveText('+0');
  await fresh(tabC);
  await placeShape(tabC, shiftCells(SHAPES.cross, 1, 1));
  await foldNow(tabC, 'yes');
  await expect(tabC.locator('.meta-xp b')).toHaveText('+0');
  await fresh(tabC);
  await placeShape(tabC, shiftCells(SHAPES.n231, 1, 1));
  await foldNow(tabC, 'yes');
  await expect(tabC.locator('.meta-xp b')).toHaveText('+7');
  expect(await storedXp(tabC)).toBe(19); // 십자 7 + 한 줄 5칸 5 + 2-3-1 7
  expect(await storedShapes(tabC)).toEqual(['1-4-1e', '2-3-1a', 'line5-d']);

  // 판을 마칠 때 점수가 0점이어도(저장할 점수가 없어도) 한 쌍이 엇갈리지 않는다
  await tabC.close();
  await tabA.evaluate(() => localStorage.clear());
  await tabA.goto(FREE());
  await tabB.goto(FREE());
  await tabA.bringToFront();
  for (const [i, shape] of [SHAPES.cross, SHAPES.n231, SHAPES.n33].entries()) {
    if (i > 0) await fresh(tabA);
    await placeShape(tabA, shiftCells(shape, 1, 1));
    await foldNow(tabA, 'yes');
  }
  await tabA.locator('.free-finish').click();
  await expect(tabA.locator('.rank-card .xp-gain')).toHaveText('+33');
  expect(await storedXp(tabA)).toBe(33);
  // B(빈 기록으로 열어 둔 탭)가 한 줄 5칸을 틀림(노트 +1): 저장값이 B의 것(1점, 한 줄 5칸)으로 바뀐다
  await tabB.bringToFront();
  await placeShape(tabB, shiftCells(SHAPES.line5, 1, 2));
  await foldNow(tabB, 'yes');
  expect(await storedXp(tabB)).toBe(1);
  expect(await storedShapes(tabB)).toEqual(['line5-d']);
  // A가 접어 본 모양만으로 한 판을 더 마침(+0): 도감을 A의 것으로 맞출 때 점수도 A의 것으로 함께 쓴다
  await tabA.bringToFront();
  await tabA.getByRole('button', { name: '다시 하기' }).click();
  for (const [i, shape] of [SHAPES.cross, SHAPES.n231, SHAPES.n33].entries()) {
    if (i > 0) await fresh(tabA);
    await placeShape(tabA, shiftCells(shape, 1, 1));
    await foldNow(tabA, 'yes');
  }
  await tabA.locator('.free-finish').click();
  await expect(tabA.locator('.rank-card .xp-gain')).toHaveText('+0');
  expect(await storedXp(tabA)).toBe(33);
  expect(await storedShapes(tabA)).toEqual(['1-4-1e', '2-3-1a', '3-3']);
  // 새 탭: 한 줄 5칸은 저장된 도감에 없고 그 점수도 저장값에 없다 → 한 번만 받는다 (등록 +1을 두 번 받지 않는다)
  const tabD = await context.newPage();
  await tabD.goto(FREE());
  await expect(tabD.locator('.rank-chip small')).toHaveText('33점');
  await placeShape(tabD, shiftCells(SHAPES.line5, 1, 2));
  await foldNow(tabD, 'no');
  await tabD.locator('.reason-chip[data-reason="overlap"]').click();
  await expect(tabD.locator('.meta-xp b')).toHaveText('+5');
  expect(await storedXp(tabD)).toBe(38);
  expect(await storedShapes(tabD)).toEqual(['1-4-1e', '2-3-1a', '3-3', 'line5-d']);
  expect(errors).toEqual([]);
});

// ── N1c-2 · N1c-4: 오른쪽 판 안쪽 넘침 0 ─────────────
test('자유 배치: 모든 장면에서 오른쪽 판 안쪽이 넘치지 않고 버튼이 잘리지 않는다 (목표 전·후 × 겹침·2×2 × 예상 맞힘·틀림 × 까닭 맞힘·틀림·넘어가기, 접어 본 모양, 별 3개 다시 하기)', async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const errors = collectErrors(page);
  const sizes = testInfo.project.name === 'chromebook'
    ? [{ width: 1366, height: 680 }, { width: 1366, height: 768 }]
    : [{ width: 820, height: 1180 }];
  const OVERLAP = INVALID_HEXOMINOES.filter((n) => n.reason === 'overlap');
  const VERTEX = INVALID_HEXOMINOES.filter((n) => n.reason === 'vertex-full');
  for (const size of sizes) {
    await page.setViewportSize(size);
    await page.goto(FREE());
    await page.evaluate(() => localStorage.clear());
    await page.goto(FREE());
    const at = `${size.width}×${size.height}`;
    let count = 0;
    const check = async (label) => {
      await expectPanelFits(page, `${at} ${label}`);
      await noScroll(page);
      count += 1;
    };
    /**
     * 모양 하나를 놓고 예상한 뒤, 까닭 고르기가 나오면 pick대로: 'right' | 'wrong'(다른 까닭) | 'count'(면이 6개가 아니에요) | 'skip'.
     * 판의 글·버튼은 예상 버튼을 누르는 순간 정해지므로 접는 장면이 끝나기를 기다리지 않고 잰다(장면이 많아 시간을 줄인다)
     */
    const fold = async (label, n, prediction, pick = 'skip') => {
      await fresh(page);
      await placeShape(page, centerOnBoard(n.cells, BOARD_SIZES.wide));
      await page.locator(`.predict-btn[data-answer="${prediction}"]`).click();
      await expect(page.locator('.free-result')).toBeVisible();
      if (await page.locator('.reason-chip').first().isVisible()) {
        await check(`${label} · 고르는 중`);
        const answer = n.reason === 'vertex-full' ? 'vertex' : 'overlap';
        const id = { right: answer, wrong: answer === 'vertex' ? 'overlap' : 'vertex', count: 'count' }[pick];
        if (id) await page.locator(`.reason-chip[data-reason="${id}"]`).click();
        else await page.locator('.reason-skip').click();
        label = `${label} · 까닭 ${pick}`;
      }
      await expect(page.locator('.free-buttons button').first()).toBeVisible();
      await check(label);
    };
    const ov = [...OVERLAP];
    const vx = [...VERTEX];
    const scenes = async (tag) => {
      await fold(`${tag} · 겹침 · 예상 맞힘`, ov.shift(), 'no', 'right');
      await fold(`${tag} · 겹침 · 예상 맞힘`, ov.shift(), 'no', 'wrong');
      await fold(`${tag} · 겹침 · 예상 맞힘`, ov.shift(), 'no', 'count');
      await fold(`${tag} · 겹침 · 예상 맞힘`, ov.shift(), 'no', 'skip');
      await fold(`${tag} · 겹침 · 예상 틀림`, ov.shift(), 'yes');
      await fold(`${tag} · 2×2 · 예상 맞힘`, vx.shift(), 'no', 'right');
      await fold(`${tag} · 2×2 · 예상 맞힘`, vx.shift(), 'no', 'wrong');
      await fold(`${tag} · 2×2 · 예상 맞힘`, vx.shift(), 'no', vx.length > 4 ? 'count' : 'skip'); // 목표 전: 6개가 아니에요, 목표 뒤: 넘어가기
      await fold(`${tag} · 2×2 · 예상 틀림`, vx.shift(), 'yes');
    };
    // 목표 전
    await check('빈 판');
    await scenes('목표 전');
    await fold('목표 전 · 새 전개도 · 예상 맞힘', CUBE_NETS[0], 'yes');
    await fold('목표 전 · 같은 판에 다시 접음', CUBE_NETS[0], 'yes');
    await fold('목표 전 · 새 전개도 · 예상 틀림', CUBE_NETS[1], 'no');
    await expect(page.locator('.btn-pair .btn')).toHaveCount(2);
    await fold('목표 달성 순간 · 예상 틀림', CUBE_NETS[2], 'no'); // 쪽지("예상과 달랐어요 …")와 점수 쪽지가 가장 긴 달성 장면
    await expect(page.locator('.goal-done')).toBeVisible();
    await expect(page.locator('.btn-pair .btn')).toHaveText(['결과 보기', '더 찾아보기']);
    // 목표 뒤: 세 버튼이 한 줄로 온전히 보인다
    await scenes('목표 뒤');
    await expect(page.locator('.btn-trio .btn')).toHaveCount(3);
    for (const sel of ['.free-finish', '.free-fix', '.free-new']) await expect(page.locator(sel)).toBeInViewport({ ratio: 1 });
    expect(await page.locator('.btn-trio .btn').evaluateAll((els) => new Set(els.map((el) => Math.round(el.getBoundingClientRect().top))).size)).toBe(1);
    await fold('목표 뒤 · 새 전개도 · 예상 맞힘', CUBE_NETS[3], 'yes');
    await fold('목표 뒤 · 새 전개도 · 예상 틀림', CUBE_NETS[4], 'no');
    await fold('목표 뒤 · 같은 판에 다시 접은 전개도', CUBE_NETS[0], 'no');
    await fold('목표 뒤 · 같은 판에 다시 접은 안 되는 모양', OVERLAP[0], 'no');
    await page.locator('.free-fix').click();
    await check('목표 뒤 · 펴서 고치기(놓는 판)');
    // 다음 판: 접어 본 모양 — "노트에 이미 있는 모양이에요" + "전에 접어 본 모양이라 점수는 없어요"로 글이 가장 길다 (전에 75px 넘쳤다)
    await page.locator('.tool-finish').click();
    await expect(page.locator('.screen-result')).toBeVisible();
    await page.getByRole('button', { name: '다시 하기' }).click();
    for (const n of CUBE_NETS.slice(0, 3)) await fold('2판 · 접어 본 전개도(셋째는 목표 달성 순간)', n, 'yes');
    await expect(page.locator('.goal-done')).toBeVisible();
    await fold('2판 목표 뒤 · 접어 본 겹침 · 예상 맞힘', OVERLAP[1], 'no', 'right');
    await fold('2판 목표 뒤 · 접어 본 겹침 · 예상 맞힘', OVERLAP[2], 'no', 'count');
    await fold('2판 목표 뒤 · 접어 본 겹침 · 예상 틀림', OVERLAP[3], 'yes');
    await fold('2판 목표 뒤 · 접어 본 2×2 · 예상 맞힘', VERTEX[0], 'no', 'right');
    await fold('2판 목표 뒤 · 접어 본 2×2 · 예상 맞힘', VERTEX[1], 'no', 'wrong');
    await fold('2판 목표 뒤 · 접어 본 2×2 · 예상 맞힘', VERTEX[2], 'no', 'count');
    await fold('2판 목표 뒤 · 접어 본 2×2 · 예상 맞힘', VERTEX[3], 'no', 'skip');
    await fold('2판 목표 뒤 · 접어 본 2×2 · 예상 틀림', VERTEX[4], 'yes');
    // 별 3개를 받은 뒤 다시 하는 판: 새 모양(점수 쪽지가 붙는다)과 접어 본 모양
    await page.evaluate(() => localStorage.setItem('edu:net-workshop:stars', JSON.stringify({ 'cube-free': 3 })));
    await page.goto(FREE());
    await fold('별 3개 판 · 새 겹침 · 예상 틀림', OVERLAP[10], 'yes');
    await expect(page.locator('.bonus-note')).toContainText('다음 새 모양 예상을 맞히면 +1');
    await fold('별 3개 판 · 새 겹침 · 예상 맞힘', OVERLAP[11], 'no', 'count');
    await fold('별 3개 판 · 접어 본 2×2 · 예상 맞힘', VERTEX[5], 'no', 'wrong');
    for (const n of CUBE_NETS.slice(5, 8)) await fold('별 3개 판 · 새 전개도(셋째는 목표 달성 순간, 연속)', n, 'yes');
    await expect(page.locator('.goal-done')).toBeVisible();
    await expect(page.locator('.bonus-note')).toContainText('새 발견 +5 · 예측 적중 +2');
    expect(count).toBeGreaterThanOrEqual(60); // 잰 장면 수
  }
  expect(errors).toEqual([]);
});

test.describe('자유 배치 움직임 줄이기', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('접기는 3장면(펼침 → 반 접힘 → 다 접힘), 새 전개도를 찾아도 색종이 0개', async ({ page }) => {
    await page.goto(FREE());
    await placeShape(page, shiftCells(SHAPES.cross, 1, 1));
    await page.evaluate(() => {
      const el = document.querySelector('.fold-stage');
      window.foldStates = [];
      new MutationObserver(() => window.foldStates.push(el.dataset.fold)).observe(el, { attributes: true, attributeFilter: ['data-fold'] });
    });
    await page.locator('.predict-btn[data-answer="yes"]').click();
    await expect(foldStage(page)).toHaveAttribute('data-fold', 'done', { timeout: 1500 });
    const states = await page.evaluate(() => window.foldStates);
    expect(states).toContain('half');
    expect(states).not.toContain('folding');
    await expect(page.locator('.found-stamp')).toBeVisible();
    await expect(page.locator('.confetti-piece')).toHaveCount(0);
  });
});

test('자유 배치 ?fx=low: 새 전개도를 찾아도 색종이 0개', async ({ page }) => {
  await page.goto(FREE('&fx=low'));
  await placeShape(page, shiftCells(SHAPES.cross, 1, 1));
  await foldAs(page, 'yes');
  await expect(page.locator('.found-stamp')).toBeVisible();
  await expect(page.locator('.confetti-piece')).toHaveCount(0);
});

test('보상: 자유 배치를 마친 뒤 새로 고쳐도 칭호 점수·도감이 남고, "기록 모두 지우기"면 점수·도장·도감이 0', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(FREE());
  await expect(page.locator('.rank-chip')).toContainText('견습생');
  for (const [i, shape] of [SHAPES.cross, SHAPES.n231, SHAPES.n33].entries()) {
    if (i > 0) await fresh(page);
    await placeShape(page, shiftCells(shape, 1, 1));
    await foldAs(page, 'yes');
  }
  await page.locator('.free-finish').click();
  await expect(page.getByRole('heading', { name: '이 차시를 마쳤어요!' })).toBeVisible();
  const points = Number((await page.locator('.rank-chip small').textContent()).replace(/\D/g, ''));
  expect(points).toBeGreaterThan(20);

  await page.goto(fileUrl(FILE, '?unlock=all&seed=1&sound=off')); // 다시 열기 (처음 화면)
  await expect(page.locator('.rank-chip small')).toHaveText(`${points}점`);
  // N1-3: 도감 칩은 전개도 도감만 "n / 11". 안 되는 모양 노트(24칸)는 합치지 않고 따로 "노트 n / 24"
  await expect(page.locator('.workshop-card')).toContainText('도감 3 / 11');
  await expect(page.locator('.workshop-card')).not.toContainText('/ 35');
  await page.getByRole('button', { name: '시작하기' }).click();
  await expect(page.locator('.lesson-chips .collection-chip')).toHaveText(['도감 3 / 11', '노트 0 / 24']);
  await page.getByRole('button', { name: '처음 화면' }).click();
  await page.getByRole('button', { name: '학습 기록' }).click();
  await expect(page.locator('.btn-collection')).toHaveText('전개도 도감 3 / 11 ㆍ 노트 0 / 24');
  // 결과 복사 문장에도 "도감 3/11 · 노트 0/24"
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => { window.copied = text; } } });
  });
  await page.getByRole('button', { name: '결과 복사' }).click();
  await expect(page.locator('.toast-info')).toContainText('결과를 복사했어요');
  expect(await page.evaluate(() => window.copied.split('\n').at(-1))).toBe(`칭호: 견습생(${points}점) · 도장 2개 · 도감 3/11 · 노트 0/24`); // 도장: 첫 발걸음, 십자 너머
  await page.getByRole('button', { name: /전개도 도감 3 \/ 11/ }).click();
  await expect(page.locator('[data-collection="cube-nets"] .collect-cell.is-found')).toHaveCount(3);
  await expect(page.locator('[data-collection="cube-nets"] .collect-cell.is-found svg')).toHaveCount(3);
  await expect(page.locator('[data-collection="cube-non-nets"] .collect-cell.is-missing')).toHaveCount(24);
  await page.getByRole('button', { name: '학습 기록' }).click();
  await expect(page.locator('.badge-item')).toHaveCount(12); // 엔진 6 + 게임 6
  await expect(page.locator('.badge-item[data-badge="beyond-cross"]')).toHaveClass(/is-earned/);
  await page.getByRole('button', { name: '기록 모두 지우기' }).click();
  await page.getByRole('button', { name: '한 번 더 누르면 지워져요' }).click();
  await expect(page.locator('.tile', { hasText: '칭호·솜씨 점수' })).toContainText('견습생 0점');
  await expect(page.locator('.badge-item.is-earned')).toHaveCount(0);
  await expect(page.locator('.btn-collection')).toHaveText('전개도 도감 0 / 11 ㆍ 노트 0 / 24');
  expect(errors).toEqual([]);
});

// ── 17절: 접은 입체를 여러 방향으로 돌려 보기·크게 작게 보기 ─────────────
// 보기 값은 무대 변환(.net-scene의 scale3d rotateX rotateZ)에서 읽는다. 보이는 배율 = scale3d × --k(크게 볼 때 선명하게 그리는 배수)
const PAD_NAMES = ['왼쪽으로 돌려 보기', '오른쪽으로 돌려 보기', '위쪽으로 돌려 보기', '아래쪽으로 돌려 보기', '작게 보기', '크게 보기', '처음 보기로'];
const FLAT_SCENE = 'scale3d(1, 1, 1) rotateX(0deg) rotateZ(0deg)';
/** 답하기 전 조작판: 가로 돌리기 둘만 켜짐(지금과 같음), 새 버튼 다섯은 꺼짐 */
const LOCKED_PAD = [false, false, true, true, true, true, true];
const padButton = (page, name) => page.getByRole('button', { name, exact: true });
const padDisabled = (page) => page.locator('.view-pad button').evaluateAll((els) => els.map((b) => b.disabled));
const sceneStyle = (page) => page.locator('.fold-stage .net-scene').evaluate((el) => el.style.transform);
const liveText = (page) => page.locator('.sr-only[aria-live]').first().textContent();

/** 조작판 버튼을 times번 누른다. 한계에 닿아 꺼지면 멈춘다 */
async function pressPad(page, name, times = 1) {
  const button = padButton(page, name);
  for (let i = 0; i < times; i += 1) {
    if (await button.isDisabled()) break;
    await button.click();
  }
}

async function viewOf(page) {
  return page.locator('.fold-stage .net-scene').evaluate((scene) => {
    const m = scene.style.transform.match(/^scale3d\(([\d.]+), [\d.]+, [\d.]+\) rotateX\((-?[\d.]+)deg\) rotateZ\((-?[\d.]+)deg\)$/);
    const k = Number(scene.style.getPropertyValue('--k') || 1);
    return { tilt: Number(m[2]), turn: Number(m[3]), scale: Number(m[1]) * k };
  });
}

/** 무대 안의 한 점(왼쪽 위에서 fx·fy 비율 — 기본은 면·조작판이 없는 왼쪽 아래 구석) */
async function stagePoint(page, fx = 0.03, fy = 0.94) {
  const box = await foldStage(page).boundingBox();
  return { x: box.x + box.width * fx, y: box.y + box.height * fy, box };
}

/** 마우스로 무대를 (dx, dy)만큼 끈다 */
async function dragStage(page, dx, dy, from = null) {
  const start = from ?? await stagePoint(page);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + dx, start.y + dy, { steps: 6 });
  await page.mouse.up();
}

/** CDP 터치: touch('touchStart' | 'touchMove' | 'touchEnd', [[x, y], …]) */
async function touchPad(page) {
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
  const swipe = async ([x0, y0], [x1, y1], steps = 10) => {
    await touch('touchStart', [[x0, y0]]);
    for (let i = 1; i <= steps; i += 1) {
      await touch('touchMove', [[x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps]]);
      await page.waitForTimeout(16);
    }
    await touch('touchEnd', []);
    await page.waitForTimeout(120);
  };
  /** 두 손가락 사이를 from px에서 to px로 (가운데 [cx, cy]) */
  const pinch = async ([cx, cy], from, to, steps = 10) => {
    await touch('touchStart', [[cx - from / 2, cy]]);
    await touch('touchStart', [[cx - from / 2, cy], [cx + from / 2, cy]]);
    for (let i = 1; i <= steps; i += 1) {
      const d = from + ((to - from) * i) / steps;
      await touch('touchMove', [[cx - d / 2, cy], [cx + d / 2, cy]]);
      await page.waitForTimeout(16);
    }
    await touch('touchEnd', []);
    await page.waitForTimeout(120);
  };
  return { touch, swipe, pinch };
}

/** 답하기 전 무대의 모습 가운데 문항과 무관해야 하는 것: 무대 변환·면 회전·그늘·뒷면 수·조작판 상태·터치 동작·이름표 */
const flatLook = (page) => page.evaluate(() => {
  const stage = document.querySelector('.fold-stage');
  const scene = stage.querySelector('.net-scene');
  const faces = [...stage.querySelectorAll('.net-face')];
  const rotation = (el) => el.style.transform.match(/matrix3d\(([^)]+)\)/)[1].split(',').slice(0, 11).map(Number).join(' ');
  return {
    scene: scene.style.transform,
    k: scene.style.getPropertyValue('--k'),
    classes: [...stage.classList].sort().join(' '),
    rotations: [...new Set([...faces, ...stage.querySelectorAll('.net-slot')].map(rotation))],
    shades: [...new Set(faces.map((f) => f.style.getPropertyValue('--shade')))],
    back: stage.querySelectorAll('.is-back').length,
    pad: [...document.querySelectorAll('.view-pad button')].map((b) => b.disabled),
    touchAction: getComputedStyle(stage).touchAction,
    badgeHidden: stage.querySelector('.stage-badge').hidden,
  };
});
const FLAT_LOOK = {
  scene: FLAT_SCENE,
  k: '',
  classes: 'fold-stage is-flat',
  rotations: ['1 0 0 0 0 1 0 0 0 0 1'],
  shades: ['0.063'],
  back: 0,
  pad: LOCKED_PAD,
  touchAction: 'manipulation',
  badgeHidden: true,
};

/** 답하기 전에 새 조작을 모두 해 본다: 끌기·휠·Ctrl+휠(마우스) · ↑↓ + = − 0 Home · 꺼진 버튼 다섯 누르기 */
async function tryLockedView(page, { mouse }) {
  if (mouse) {
    await dragStage(page, 90, -40);
    await page.mouse.wheel(0, -240);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -40);
    await page.keyboard.up('Control');
  }
  await foldStage(page).focus();
  for (const key of ['ArrowUp', 'ArrowDown', '+', '=', '-', '0', 'Home']) await page.keyboard.press(key);
  for (const name of PAD_NAMES.slice(2)) {
    await expect(padButton(page, name)).toBeDisabled();
    await padButton(page, name).click({ force: true });
  }
}

/** 판별 첫 문항을 바르게 답하고(까닭 고르기는 넘어가기) 다 접힐 때까지 기다린다 */
async function answerAndFold(page, q) {
  await page.locator(`.answer-btn[data-answer="${q.expected}"]`).click();
  if (!q.valid) await page.locator('.reason-skip').click();
  await expect(foldStage(page)).toHaveAttribute('data-fold', 'done');
}

test('보기 조작판: 버튼 일곱 개의 이름(aria-label = title), 답하기 전에는 새 버튼이 꺼져 있고, 답한 뒤 접힌 입체에서 켜지며 한계(바로 위·바로 아래·2배·0.5배)에서 꺼진다', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(fileUrl(FILE, '?unlock=all&seed=1&sound=off&stage=cube-judge'));
  const q = questionsFor('cube-judge')[0];
  const group = page.getByRole('group', { name: '보는 방향과 크기' });
  await expect(group.getByRole('button')).toHaveCount(7);
  expect(await group.locator('button').evaluateAll((els) => els.map((b) => [b.getAttribute('aria-label'), b.title, b.type]))).toEqual(PAD_NAMES.map((name) => [name, name, 'button']));
  await expect(foldStage(page)).toHaveAttribute('aria-label', '전개도 무대. 접은 뒤에는 끌거나 방향키로 돌려 보고, 더하기·빼기 키로 크게·작게 볼 수 있어요. 0 키는 처음 보기예요.');
  expect(await padDisabled(page)).toEqual(LOCKED_PAD);
  await expect(page.locator('.view-tip')).toBeHidden();
  // 답하기 전: 가로 돌리기는 지금처럼 된다(평면에서 돈다) — 30°씩
  await pressPad(page, '오른쪽으로 돌려 보기');
  expect(await sceneStyle(page)).toBe('scale3d(1, 1, 1) rotateX(0deg) rotateZ(30deg)');
  await pressPad(page, '왼쪽으로 돌려 보기');
  expect(await sceneStyle(page)).toBe(FLAT_SCENE);
  expect(await padDisabled(page)).toEqual(LOCKED_PAD); // 돌려도 [처음 보기로]는 접힌 뒤에만 켜진다

  await answerAndFold(page, q);
  const home = await viewOf(page);
  expect([home.tilt, home.turn]).toEqual([56, -28 + displayNet(q.net).turn]);
  expect(await padDisabled(page)).toEqual([false, false, false, false, false, false, true]); // 처음 보기 그대로라 [처음 보기로]만 꺼짐
  await expect(foldStage(page)).toHaveClass(/can-view/);
  // 끌기 안내 칩(넓은 화면): 보기 조작이 처음 켜질 때 한 번
  // (휴대폰은 자리가 없어 놀이 방법 문장으로만 알린다). 눌리지 않고, 접은 입체·이름표·조작 띠를 가리지 않는다
  const phone = page.viewportSize().width <= 560;
  if (phone) await expect(page.locator('.view-tip')).toBeHidden();
  else {
    await expect(page.locator('.view-tip')).toHaveText('끌어서 돌려 봐요');
    const tip = await page.evaluate(() => {
      const rect = (sel) => document.querySelector(sel).getBoundingClientRect();
      const hit = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0;
      const [chip, mat, badge, tools] = ['.view-tip', '.mat', '.stage-badge', '.fold-tools'].map(rect);
      return {
        onSolid: [...document.querySelectorAll('.net-face')].some((f) => hit(chip, f.getBoundingClientRect())),
        onBadge: hit(chip, badge),
        onTools: hit(chip, tools),
        onButtons: [...document.querySelectorAll('.view-pad button')].some((b) => hit(chip, b.getBoundingClientRect())),
        inMat: chip.left >= mat.left && chip.right <= mat.right && chip.bottom <= mat.bottom,
        pointerEvents: getComputedStyle(document.querySelector('.view-tip')).pointerEvents,
      };
    });
    expect(tip).toEqual({ onSolid: false, onBadge: false, onTools: false, onButtons: false, inMat: true, pointerEvents: 'none' });
  }

  // 위쪽: 56 → 45 → 30 → 15 → 0, 바로 위에서 [위쪽…]이 꺼진다. 화면 읽기 알림은 구간이 바뀔 때만
  const tilts = [];
  for (let i = 0; i < 4; i += 1) {
    await pressPad(page, '위쪽으로 돌려 보기');
    tilts.push((await viewOf(page)).tilt);
  }
  expect(tilts).toEqual([45, 30, 15, 0]);
  await expect(page.locator('.sr-only[aria-live]').first()).toHaveText('위에서 본 모습이에요.');
  expect(await padDisabled(page)).toEqual([false, false, true, false, false, false, false]);
  // 아래쪽: 15 → … → 180, 바로 아래에서 [아래쪽…]이 꺼진다
  const downs = [];
  for (let i = 0; i < 12; i += 1) {
    await pressPad(page, '아래쪽으로 돌려 보기');
    downs.push((await viewOf(page)).tilt);
    if (i === 5) await expect(page.locator('.sr-only[aria-live]').first()).toHaveText('옆에서 본 모습이에요.'); // 90°
  }
  expect(downs).toEqual([15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180]);
  await expect(page.locator('.sr-only[aria-live]').first()).toHaveText('아래에서 본 모습이에요.');
  expect(await padDisabled(page)).toEqual([false, false, false, true, false, false, false]);
  // 처음 보기로
  await pressPad(page, '처음 보기로');
  expect(await viewOf(page)).toEqual(home);
  await expect(page.locator('.sr-only[aria-live]').first()).toHaveText('처음 보기로 돌아왔어요.');
  await expect(padButton(page, '처음 보기로')).toBeDisabled();
  // 크게: 1.25 · 1.6 · 2배에서 꺼짐, 작게: … 0.5배에서 꺼짐 (가운데를 중심으로, 방향은 그대로)
  const ratio = async () => Math.round(((await viewOf(page)).scale / home.scale) * 100) / 100;
  const zooms = [];
  for (let i = 0; i < 3; i += 1) {
    await pressPad(page, '크게 보기');
    zooms.push(await ratio());
  }
  expect(zooms).toEqual([1.25, 1.6, 2]);
  await expect(page.locator('.sr-only[aria-live]').first()).toHaveText('2배로 크게 보여요.');
  expect(await padDisabled(page)).toEqual([false, false, false, false, false, true, false]);
  for (let i = 0; i < 6; i += 1) {
    await pressPad(page, '작게 보기');
    zooms.push(await ratio());
    if (i === 2) await expect(page.locator('.sr-only[aria-live]').first()).toHaveText('처음 크기예요.');
  }
  expect(zooms.slice(3)).toEqual([1.6, 1.25, 1, 0.8, 0.64, 0.5]);
  await expect(page.locator('.sr-only[aria-live]').first()).toHaveText('0.5배로 작게 보여요.');
  expect(await padDisabled(page)).toEqual([false, false, false, false, true, false, false]);
  expect([(await viewOf(page)).tilt, (await viewOf(page)).turn]).toEqual([home.tilt, home.turn]);
  // 가로: 30°씩, 한계 없음
  await pressPad(page, '처음 보기로');
  await pressPad(page, '오른쪽으로 돌려 보기', 13);
  expect((await viewOf(page)).turn).toBe(home.turn + 390);
  await pressPad(page, '왼쪽으로 돌려 보기', 2);
  expect((await viewOf(page)).turn).toBe(home.turn + 330);
  // 점수·살펴보기 횟수 없음: 돌려 보고 키워도 솜씨 점수는 답한 점수 그대로
  await expect(page.locator('.meta-xp b')).toHaveText('+2');
  expect(errors).toEqual([]);
});

test('보기: 펴면 늘 위에서 본 처음 크기로 돌아가고 다시 접으면 내가 보던 방향·크기 그대로, 다음 문제는 처음 보기에서 시작한다', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(fileUrl(FILE, '?unlock=all&seed=1&sound=off&stage=cube-judge'));
  const questions = questionsFor('cube-judge');
  await answerAndFold(page, questions[0]);
  const home = await viewOf(page);
  await pressPad(page, '아래쪽으로 돌려 보기', 4); // 105°
  await pressPad(page, '크게 보기', 2); // 1.6배
  await pressPad(page, '오른쪽으로 돌려 보기'); // +30°
  const mine = await viewOf(page);
  expect([mine.tilt, mine.turn - home.turn, Math.round((mine.scale / home.scale) * 100) / 100]).toEqual([105, 30, 1.6]);
  // 막대 0: 펼친 전개도는 위에서 본 처음 크기(가로로 돌린 30°만 남는다), 새 버튼은 꺼진다
  const range = page.locator('.fold-range');
  await range.fill('0');
  await expect(foldStage(page)).toHaveAttribute('data-fold', 'flat');
  expect(await sceneStyle(page)).toBe('scale3d(1, 1, 1) rotateX(0deg) rotateZ(30deg)');
  expect(await padDisabled(page)).toEqual(LOCKED_PAD);
  await expect(foldStage(page)).not.toHaveClass(/can-view/);
  expect(await page.locator('.fold-stage .net-scene').evaluate((el) => el.style.getPropertyValue('--k'))).toBe('');
  // 펼친 동안 새 조작은 되지 않는다(가로 돌리기만)
  await foldStage(page).focus();
  for (const key of ['ArrowUp', '+', '0']) await page.keyboard.press(key);
  expect(await sceneStyle(page)).toBe('scale3d(1, 1, 1) rotateX(0deg) rotateZ(30deg)');
  // 조금 접으면(4분의 1) 내 보기가 다 적용되고, 다 접으면 보던 그대로
  await range.fill('25');
  const quarter = await viewOf(page);
  expect(quarter.tilt).toBe(56 * 0.25 + (105 - 56));
  await range.fill('100');
  await expect(foldStage(page)).toHaveAttribute('data-fold', 'done');
  expect(await viewOf(page)).toEqual(mine);
  // [펴기] → [접어 보기]로도 같다
  await page.locator('.fold-toggle').click();
  await expect(foldStage(page)).toHaveAttribute('data-fold', 'flat');
  expect(await sceneStyle(page)).toBe('scale3d(1, 1, 1) rotateX(0deg) rotateZ(30deg)');
  await page.locator('.fold-toggle').click();
  await expect(foldStage(page)).toHaveAttribute('data-fold', 'done');
  expect(await viewOf(page)).toEqual(mine);
  // 다음 문제: 처음 보기(펼친 전개도, 잠김), 답하면 처음 방향·크기로 접힌다
  await page.locator('.next-btn').click();
  expect(await flatLook(page)).toEqual(FLAT_LOOK);
  await answerAndFold(page, questions[1]);
  const next = await viewOf(page);
  expect([next.tilt, next.turn]).toEqual([displayNet(questions[1].net).tilt, -28 + displayNet(questions[1].net).turn]);
  await expect(padButton(page, '처음 보기로')).toBeDisabled();
  await expect(page.locator('.view-tip')).toBeHidden(); // 끌기 안내는 처음 한 번만
  expect(errors).toEqual([]);
});

test('답하기 전 정답 노출 0: 판별·마주 보는 면·면 붙이기에서 끌기·휠·↑↓ + − 0·꺼진 버튼 누르기를 해도 무대 변환·면 그늘·조작판이 문항과 무관하게 한 가지 모습이고 기록이 생기지 않는다', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  const mouse = testInfo.project.name === 'chromebook';
  const sizes = mouse ? [{ width: 1366, height: 768 }, { width: 1366, height: 680 }] : [{ width: 820, height: 1180 }, { width: 390, height: 844 }];
  let screens = 0;
  for (const size of sizes) {
    await page.setViewportSize(size);
    for (const stageId of ['cube-judge', 'cube-opposite', 'cube-complete']) {
      for (let seed = 1; seed <= 6; seed += 1) {
        await page.goto(fileUrl(FILE, `?unlock=all&seed=${seed}&sound=off&stage=${stageId}`));
        await expect(page.locator('.net-face').first()).toBeVisible();
        const at = `${size.width}×${size.height} ${stageId} 시드 ${seed}`;
        expect(await flatLook(page), at).toEqual(FLAT_LOOK);
        await tryLockedView(page, { mouse });
        expect(await flatLook(page), `${at} 조작 뒤`).toEqual(FLAT_LOOK);
        // 기록 없음: 까닭 쪽지·알림·다음 버튼이 없고 점수는 그대로
        await expect(page.locator('.reason')).toHaveCount(0);
        await expect(page.locator('.toast')).toHaveCount(0);
        await expect(page.locator('.next-btn')).toBeHidden();
        await expect(page.locator('.meta-xp b')).toHaveText('+0');
        await expect(page.locator('.fold-range')).toBeDisabled();
        screens += 1;
      }
    }
  }
  expect(screens).toBe(36);
  // 판별에서 안 되는 전개도를 맞힌 뒤 "왜 안 될까요?"를 고르는 동안(접기 전, 잠김)에도 같다
  await page.setViewportSize(sizes[0]);
  await page.goto(fileUrl(FILE, '?unlock=all&seed=1&sound=off&stage=cube-judge'));
  for (const q of questionsFor('cube-judge')) {
    await page.locator(`.answer-btn[data-answer="${q.expected}"]`).click();
    if (!q.valid) {
      await expect(page.locator('.reason-pick')).toBeVisible();
      await tryLockedView(page, { mouse });
      expect(await flatLook(page)).toEqual(FLAT_LOOK);
      break;
    }
    await page.locator('.next-btn').click();
  }
  expect(errors).toEqual([]);
});

test('답하기 전 힌트(반만 접어 보기) 동안에도 새 조작은 잠겨 있고, 면 붙이기에서 [펴고 다시 하기] 뒤에도 다시 잠긴다', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  const mouse = testInfo.project.name === 'chromebook';
  await page.goto(fileUrl(FILE, '?unlock=all&seed=1&sound=off&stage=cube-opposite'));
  const q = questionsFor('cube-opposite')[0];
  const wrong = q.net.faces.find((f) => f.id !== q.star && f.id !== q.answer);
  await page.locator(`.net-face[data-face="${wrong.id}"]`).click();
  await page.locator('.hint-btn').click();
  await expect(foldStage(page)).toHaveAttribute('data-fold', 'half');
  const half = await sceneStyle(page);
  // 반만 접힌 모습은 지금과 같은 방향·크기(기울기 56° × 0.5, 선명하게 그리는 배수 없음)
  expect(half).toMatch(/^scale3d\(1\.\d+, 1\.\d+, 1\.\d+\) rotateX\(28deg\) rotateZ\(-?[\d.]+deg\)$/);
  expect((await viewOf(page)).turn).toBe((-28 + displayNet(q.net, { focus: [q.star, q.answer] }).turn) * 0.5);
  await tryLockedView(page, { mouse });
  expect(await sceneStyle(page)).toBe(half);
  expect(await padDisabled(page)).toEqual(LOCKED_PAD);
  await expect(foldStage(page)).not.toHaveClass(/can-view/);
  expect(await page.locator('.fold-stage .net-scene').evaluate((el) => el.style.getPropertyValue('--k'))).toBe('');
  expect(await foldStage(page).evaluate((el) => getComputedStyle(el).touchAction)).toBe('manipulation');
  await expect(foldStage(page)).toHaveAttribute('data-fold', 'flat', { timeout: 8000 });
  expect(await sceneStyle(page)).toBe(FLAT_SCENE);

  // 면 붙이기: 틀린 자리로 접은 장면은 볼 수 있고, [펴고 다시 하기] 뒤에는 다시 잠긴다
  await page.goto(fileUrl(FILE, '?unlock=all&seed=1&sound=off&stage=cube-complete'));
  const cq = questionsFor('cube-complete')[0];
  await page.locator('.face-card').click();
  await page.locator(`.net-slot[data-cell="${cq.slots.find((s) => !s.ok).key}"]`).click();
  await expect(foldStage(page)).toHaveAttribute('data-fold', 'done');
  await expect(foldStage(page)).toHaveClass(/can-view/);
  await pressPad(page, '아래쪽으로 돌려 보기', 2);
  await pressPad(page, '크게 보기');
  expect((await viewOf(page)).tilt).toBe(75);
  if (page.viewportSize().width > 560) await expect(page.locator('.view-tip')).toBeVisible(); // 버튼만 쓰면 끌기 안내는 남아 있다
  await page.getByRole('button', { name: '펴고 다시 하기' }).click();
  expect(await flatLook(page)).toEqual(FLAT_LOOK);
  await expect(page.locator('.view-tip')).toBeHidden(); // 다시 잠기면 끌기 안내도 지운다
  await tryLockedView(page, { mouse });
  expect(await flatLook(page)).toEqual(FLAT_LOOK);
  // 빈 자리 누르기는 그대로: 카드를 누르고 맞는 자리를 누르면 접힌다(처음 보기에서)
  await page.locator('.face-card').click();
  await page.locator(`.net-slot[data-cell="${cq.slots.find((s) => s.ok).key}"]`).click();
  await expect(page.locator('.stage-badge')).toHaveText('정육면체가 됐어요');
  await expect(foldStage(page)).toHaveAttribute('data-fold', 'done');
  expect((await viewOf(page)).tilt).toBe(56);
  expect(errors).toEqual([]);
});

test('조작판은 답하기 전 펼친 전개도의 면·빈 자리를 가리지 않는다 (세 단계 × 시드 1~12, 네 크기) — 누르는 곳이 그대로다', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const sizes = testInfo.project.name === 'chromebook'
    ? [{ width: 1366, height: 768 }, { width: 1366, height: 680 }]
    : [{ width: 820, height: 1180 }, { width: 390, height: 844 }];
  for (const size of sizes) {
    await page.setViewportSize(size);
    let shrunk = 0;
    for (const stageId of ['cube-judge', 'cube-opposite', 'cube-complete']) {
      for (let seed = 1; seed <= 12; seed += 1) {
        await page.goto(fileUrl(FILE, `?unlock=all&seed=${seed}&sound=off&stage=${stageId}`));
        await expect(page.locator('.net-face').first()).toBeVisible();
        const m = await page.evaluate(() => {
          const out = { hits: [], covered: [], small: [], unit: parseFloat(document.querySelector('.net-scene').style.getPropertyValue('--unit')) };
          const targets = [...document.querySelectorAll('.fold-stage .net-face, .fold-stage .net-slot')];
          for (const el of targets) {
            const r = el.getBoundingClientRect();
            if (Math.min(r.width, r.height) < 48) out.small.push(`${el.className} ${Math.round(r.width)}×${Math.round(r.height)}`);
            for (const btn of document.querySelectorAll('.view-pad button')) {
              const b = btn.getBoundingClientRect();
              const w = Math.min(b.right, r.right) - Math.max(b.left, r.left);
              const h = Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top);
              if (w > 0 && h > 0) out.hits.push(`${btn.getAttribute('aria-label')} × ${el.dataset.label ?? el.dataset.cell} ${Math.round(w)}×${Math.round(h)}`);
            }
            // 네 귀퉁이 안쪽과 가운데를 눌렀을 때 그 면·빈 자리가 눌린다(다른 것이 덮고 있지 않다)
            for (const [fx, fy] of [[0.5, 0.5], [0.06, 0.06], [0.94, 0.06], [0.06, 0.94], [0.94, 0.94]]) {
              const top = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy);
              if (!top || !el.contains(top)) out.covered.push(`${el.dataset.label ?? el.dataset.cell} (${fx}, ${fy}) ← ${top?.className}`);
            }
          }
          return out;
        });
        const at = `${size.width}×${size.height} ${stageId} 시드 ${seed}`;
        expect({ hits: m.hits, covered: m.covered, small: m.small }, at).toEqual({ hits: [], covered: [], small: [] });
        if (m.unit < 110 && size.width > 560 && stageId !== 'cube-complete') shrunk += 1;
      }
    }
    // 넓은 화면·태블릿: 오른쪽 위에 면이 오는 넓은 전개도는 조작판만큼 작게 놓인다(휴대폰은 조작판이 아래 띠라 그대로)
    if (size.width > 560) expect(shrunk, `${size.width}×${size.height}`).toBeGreaterThan(0);
  }
});

test('마우스: 누르기와 끌기를 가른다 — 맞히기 전에는 끌어도 그대로고 면 누르기가 되며, 맞힌 뒤 면 위에서 100px 끌면 50° 돌고 click은 삼킨다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromebook', '마우스는 크롬북 화면에서 확인');
  const errors = collectErrors(page);
  await page.goto(fileUrl(FILE, '?unlock=all&seed=1&sound=off&stage=cube-opposite'));
  const q = questionsFor('cube-opposite')[0];
  // 문서까지 올라온(삼켜지지 않은) click을 센다
  await page.evaluate(() => {
    window.clicks = 0;
    document.addEventListener('click', () => { window.clicks += 1; });
  });
  const clicks = () => page.evaluate(() => window.clicks);
  // 맞히기 전: 끌기·휠 → 보기 그대로, 기록 없음. 그 뒤 면 누르기는 지금과 같다
  await dragStage(page, 120, -60);
  await page.mouse.wheel(0, -300);
  expect(await sceneStyle(page)).toBe(FLAT_SCENE);
  await expect(page.locator('.reason')).toHaveCount(0);
  await expect(foldStage(page)).not.toHaveClass(/is-turning/);
  expect(await foldStage(page).evaluate((el) => getComputedStyle(el).cursor)).toBe('auto');
  const wrong = q.net.faces.find((f) => f.id !== q.star && f.id !== q.answer);
  await page.locator(`.net-face[data-face="${wrong.id}"]`).click();
  await expect(page.locator('.reason')).toContainText('이웃한 면');
  await page.locator(`.net-face[data-face="${q.answer}"]`).click();
  await expect(foldStage(page)).toHaveAttribute('data-fold', 'done');
  await expect(page.locator('.net-face.is-correct .face-mark')).toHaveText('✓ 마주 봐요');
  await expect(page.locator('.view-tip')).toBeVisible();
  expect(await foldStage(page).evaluate((el) => getComputedStyle(el).cursor)).toBe('grab');

  // 맞힌 뒤: 면 위에서 눌러 (100, 40) 끌기 → 돌림 −50°(앞면이 오른쪽으로), 기울기 −20°(윗면이 더 보임), 뒤따르는 click 0번
  const before = await viewOf(page);
  const clicks0 = await clicks();
  const face = await page.locator(`.net-face[data-face="${q.answer}"]`).boundingBox();
  const start = { x: face.x + face.width / 2, y: face.y + face.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 50, start.y + 20, { steps: 5 });
  await expect(foldStage(page)).toHaveClass(/is-turning/);
  expect(await foldStage(page).evaluate((el) => getComputedStyle(el).cursor)).toBe('grabbing');
  await expect(page.locator('.view-tip')).toBeHidden(); // 처음 끌면 안내 칩을 지운다
  await page.mouse.move(start.x + 100, start.y + 40, { steps: 5 });
  await page.mouse.up();
  const after = await viewOf(page);
  expect([after.turn - before.turn, after.tilt - before.tilt, after.scale]).toEqual([-50, -20, before.scale]);
  await expect(foldStage(page)).not.toHaveClass(/is-turning/);
  expect(await clicks()).toBe(clicks0);
  await expect(page.locator('.sr-only[aria-live]').first()).not.toHaveText(/본 모습이에요/); // 56° → 36°: 같은 구간이라 알리지 않는다
  // 떼면 그 자리에 멈춘다(관성 없음)
  await page.waitForTimeout(150);
  expect(await viewOf(page)).toEqual(after);
  // 3px 움직이고 떼기 = 누르기: 보기 그대로, click 1번. 8px까지는 누르기, 9px부터 끌기(1px = 0.5°)
  const spot = await stagePoint(page);
  await dragStage(page, 3, 2, spot);
  expect(await viewOf(page)).toEqual(after);
  expect(await clicks()).toBe(clicks0 + 1);
  await dragStage(page, 8, 0, spot);
  expect(await viewOf(page)).toEqual(after);
  await dragStage(page, 9, 0, spot);
  expect((await viewOf(page)).turn).toBe(after.turn - 4.5);
  // 위로 끌어 기울기가 구간을 넘으면(36° → 76°) 뗄 때 한 번 알린다. 끝까지 끌어도 바로 아래(180°)에서 멈춘다
  await dragStage(page, 0, -80, spot);
  expect((await viewOf(page)).tilt).toBe(76);
  await expect(page.locator('.sr-only[aria-live]').first()).toHaveText('옆에서 본 모습이에요.');
  await dragStage(page, 0, -400, { x: spot.x, y: spot.y });
  expect((await viewOf(page)).tilt).toBe(180);
  await expect(padButton(page, '아래쪽으로 돌려 보기')).toBeDisabled();
  await dragStage(page, 0, 100, { x: spot.x, y: spot.box.y + 40 });
  expect((await viewOf(page)).tilt).toBe(130); // 한계에서 되돌리면 바로 따라온다
  // 무대에서 끌어 [다음 문제] 위에서 떼도 문제가 넘어가지 않고, 그 뒤 버튼 누르기는 그대로 된다
  const next = await page.locator('.next-btn').boundingBox();
  await page.mouse.move(spot.x, spot.y);
  await page.mouse.down();
  await page.mouse.move(spot.x + 200, spot.y - 50, { steps: 5 });
  await page.mouse.move(next.x + next.width / 2, next.y + next.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('.q-counter')).toHaveText('문제 1 / 4');
  await expect(foldStage(page)).not.toHaveClass(/is-turning/);
  await pressPad(page, '처음 보기로');
  expect([(await viewOf(page)).tilt, (await viewOf(page)).turn]).toEqual([56, before.turn]);
  await page.locator('.next-btn').click();
  await expect(page.locator('.q-counter')).toHaveText('문제 2 / 4');
  expect(await sceneStyle(page)).toBe(FLAT_SCENE);
  // 오른쪽 버튼으로는 끌리지 않는다
  await page.locator(`.net-face[data-face="${questionsFor('cube-opposite')[1].answer}"]`).click();
  await expect(foldStage(page)).toHaveAttribute('data-fold', 'done');
  const v2 = await viewOf(page);
  await page.mouse.move(spot.x, spot.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(spot.x + 80, spot.y - 30, { steps: 4 });
  await page.mouse.up({ button: 'right' });
  expect(await viewOf(page)).toEqual(v2);
  expect(errors).toEqual([]);
});

test('마우스 휠: 답한 뒤 접은 입체 위에서는 크게·작게(페이지 스크롤 0, Ctrl+휠 포함), 답하기 전·무대 밖에서는 페이지 스크롤 그대로', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromebook', '마우스 휠은 크롬북(마우스) 설정에서 확인');
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 390, height: 600 }); // 세로 스크롤이 생기는 작은 창
  await page.goto(fileUrl(FILE, '?unlock=all&seed=1&sound=off&stage=cube-judge'));
  const q = questionsFor('cube-judge')[0];
  const scrollY = () => page.evaluate(() => Math.round(window.scrollY));
  const overStage = async () => {
    const box = await foldStage(page).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  };
  // 답하기 전: 무대 위에서 휠 → 페이지가 내려가고 보기는 그대로
  await overStage();
  await page.mouse.wheel(0, 120);
  await expect.poll(scrollY).toBeGreaterThan(60);
  expect(await sceneStyle(page)).toBe(FLAT_SCENE);
  await page.evaluate(() => window.scrollTo(0, 0));
  await answerAndFold(page, q);
  await page.evaluate(() => window.scrollTo(0, 0));
  const home = await viewOf(page);
  const ratio = async () => Math.round(((await viewOf(page)).scale / home.scale) * 1000) / 1000;
  // 답한 뒤 무대 위: 위로 굴리면 커지고(100px ≈ 16%) 페이지는 그대로
  await overStage();
  await page.mouse.wheel(0, -100);
  await expect.poll(ratio).toBeCloseTo(Math.exp(0.15), 2);
  await page.mouse.wheel(0, 200);
  await expect.poll(ratio).toBeCloseTo(Math.exp(-0.15), 2);
  expect(await scrollY()).toBe(0);
  // 휠이 멈추면 배율을 화면 읽기로 한 번 알린다
  await expect(page.locator('.sr-only[aria-live]').first()).toHaveText('0.86배로 작게 보여요.');
  // 끝까지 굴려도 2배·0.5배에서 멈추고, 한계에서도 페이지가 스크롤되지 않는다
  await page.mouse.wheel(0, -6000);
  await expect.poll(ratio).toBeCloseTo(2, 2);
  await expect(padButton(page, '크게 보기')).toBeDisabled();
  await page.mouse.wheel(0, -600);
  await page.mouse.wheel(0, 20000);
  await expect.poll(ratio).toBeCloseTo(0.5, 2);
  await page.mouse.wheel(0, 600);
  await expect(padButton(page, '작게 보기')).toBeDisabled();
  expect(await scrollY()).toBe(0);
  // Ctrl+휠(크롬북 터치패드 벌리기): 입체 배율만 바뀐다
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -30);
  await page.keyboard.up('Control');
  await expect.poll(ratio).toBeCloseTo(0.5 * Math.exp(0.3), 2);
  expect(await page.evaluate(() => [window.devicePixelRatio, window.visualViewport.scale])).toEqual([1, 1]);
  expect(await scrollY()).toBe(0);
  // 무대 밖(문제 판) 위에서는 페이지 스크롤 그대로
  const before = await ratio();
  const panel = await page.locator('.net-panel').boundingBox();
  await page.mouse.move(panel.x + 100, Math.min(590, panel.y + 30));
  await page.mouse.wheel(0, 120);
  await expect.poll(scrollY).toBeGreaterThan(60);
  expect(await ratio()).toBe(before);
  // 다 펴면(펼친 전개도) 무대 위 휠은 다시 페이지 스크롤
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('.fold-range').fill('0');
  await overStage();
  await page.mouse.wheel(0, 120);
  await expect.poll(scrollY).toBeGreaterThan(60);
  expect(errors).toEqual([]);
});

test('키보드만: Tab으로 무대에 가서 ←→↑↓ + − 0·Home으로 모든 방향·배율에 가고 한계에서 멈춘다. 접기 막대에 초점이면 방향키는 막대만, 무대 밖이면 키가 보기를 바꾸지 않는다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromebook', '키보드는 크롬북 화면에서 확인');
  const errors = collectErrors(page);
  await page.goto(fileUrl(FILE, '?unlock=all&seed=1&sound=off&stage=cube-judge'));
  const q = questionsFor('cube-judge')[0];
  const tabTo = async (matches, { back = false } = {}) => {
    for (let i = 0; i < 40; i += 1) {
      if (await page.evaluate(matches)) return;
      await page.keyboard.press(back ? 'Shift+Tab' : 'Tab');
    }
    expect(await page.evaluate(matches)).toBe(true);
  };
  const focusName = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.trim());
  // 답하기 전: 무대에 초점 — ←→는 지금처럼 15°씩 평면에서 돌고, ↑↓ + − 0은 아무것도 바꾸지 않는다
  await tabTo(() => document.activeElement?.classList.contains('fold-stage'));
  await page.keyboard.press('ArrowRight');
  expect(await sceneStyle(page)).toBe('scale3d(1, 1, 1) rotateX(0deg) rotateZ(15deg)');
  for (const key of ['ArrowUp', 'ArrowDown', '+', '-', '0', 'Home']) await page.keyboard.press(key);
  expect(await sceneStyle(page)).toBe('scale3d(1, 1, 1) rotateX(0deg) rotateZ(15deg)');
  await page.keyboard.press('ArrowLeft');
  expect(await sceneStyle(page)).toBe(FLAT_SCENE);
  // 키보드로 답한다
  await tabTo(() => document.activeElement?.classList.contains('answer-btn'));
  await page.keyboard.press(q.expected === 'yes' ? 'Enter' : 'Tab');
  if (q.expected !== 'yes') await page.keyboard.press('Enter');
  await expect(foldStage(page)).toHaveAttribute('data-fold', 'done');
  // Tab 순서: 무대 → [펴기] → 접는 정도 → 조작판(왼쪽·오른쪽·위쪽·아래쪽·작게·크게) → 문제 판. [처음 보기로]는 처음 보기라 꺼져 있다
  await tabTo(() => document.activeElement?.classList.contains('fold-stage'), { back: true });
  const order = [];
  for (let i = 0; i < 9; i += 1) {
    await page.keyboard.press('Tab');
    order.push(await focusName());
  }
  expect(order).toEqual(['펴기', '접는 정도', ...PAD_NAMES.slice(0, 6), '다음 문제']);
  await tabTo(() => document.activeElement?.classList.contains('fold-stage'), { back: true });
  const home = await viewOf(page);
  const ratio = async () => Math.round(((await viewOf(page)).scale / home.scale) * 100) / 100;
  const walk = async (key, times, read) => {
    const out = [];
    for (let i = 0; i < times; i += 1) {
      await page.keyboard.press(key);
      out.push(await read());
    }
    return out;
  };
  const tilt = async () => (await viewOf(page)).tilt;
  expect(await walk('ArrowUp', 5, tilt)).toEqual([45, 30, 15, 0, 0]);
  await expect(page.locator('.sr-only[aria-live]').first()).toHaveText('위에서 본 모습이에요.');
  expect(await walk('ArrowDown', 13, tilt)).toEqual([15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 180]);
  await expect(page.locator('.sr-only[aria-live]').first()).toHaveText('아래에서 본 모습이에요.');
  await page.keyboard.press('0');
  expect(await viewOf(page)).toEqual(home);
  await expect(page.locator('.sr-only[aria-live]').first()).toHaveText('처음 보기로 돌아왔어요.');
  expect(await walk('+', 4, ratio)).toEqual([1.25, 1.6, 2, 2]);
  expect(await walk('-', 7, ratio)).toEqual([1.6, 1.25, 1, 0.8, 0.64, 0.5, 0.5]);
  await page.keyboard.press('Home');
  expect(await viewOf(page)).toEqual(home);
  expect(await walk('=', 1, ratio)).toEqual([1.25]); // Shift 없이 누른 + 자리
  await page.keyboard.press('0');
  expect(await walk('ArrowRight', 3, async () => (await viewOf(page)).turn - home.turn)).toEqual([15, 30, 45]);
  expect(await walk('ArrowLeft', 5, async () => (await viewOf(page)).turn - home.turn)).toEqual([30, 15, 0, -15, -30]);
  await page.keyboard.press('0');
  // Ctrl·Alt와 함께 누른 키(브라우저 확대·뒤로 가기)는 건드리지 않는다
  for (const key of ['Control+=', 'Control+-', 'Control+0', 'Alt+ArrowLeft', 'Control+ArrowUp']) await page.keyboard.press(key);
  expect(await viewOf(page)).toEqual(home);
  await expect(page.locator('.q-counter')).toHaveText('문제 1 / 5');
  // 초점이 무대 밖([다음 문제])이면 키가 보기를 바꾸지 않는다
  await page.locator('.next-btn').focus();
  for (const key of ['ArrowUp', 'ArrowLeft', '+', '-', '0']) await page.keyboard.press(key);
  expect(await viewOf(page)).toEqual(home);
  // 접기 막대에 초점이면 방향키는 막대만 움직인다(보기는 접는 정도만큼만 바뀐다)
  await page.locator('.fold-range').focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.fold-range')).toHaveValue('98');
  expect((await viewOf(page)).tilt).toBeCloseTo(56 * 0.98, 5);
  await page.keyboard.press('End');
  await expect(foldStage(page)).toHaveAttribute('data-fold', 'done');
  expect(await viewOf(page)).toEqual(home);
  // 조작판을 키보드로: Enter·Space로 누르고, 한계에 닿아 버튼이 꺼지면 초점이 무대로 간다(사라지지 않는다) → 방향키로 이어서 본다
  await tabTo(() => document.activeElement?.getAttribute('aria-label') === '위쪽으로 돌려 보기');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  expect(await tilt()).toBe(30);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  expect(await tilt()).toBe(0);
  await expect(foldStage(page)).toBeFocused();
  await page.keyboard.press('Enter'); // 무대에서는 Enter가 아무것도 하지 않는다
  await page.keyboard.press('ArrowDown');
  expect(await tilt()).toBe(15);
  await tabTo(() => document.activeElement?.getAttribute('aria-label') === '처음 보기로');
  await page.keyboard.press('Enter');
  expect(await viewOf(page)).toEqual(home);
  await expect(foldStage(page)).toBeFocused();
  expect(errors).toEqual([]);
});

test('터치(CDP): 답한 뒤 한 손가락 끌기는 돌리기(페이지 스크롤 0), 두 손가락 벌리기·오므리기는 2배·0.5배에서 멈추고 브라우저 확대는 그대로 1, 답하기 전 무대 쓸기는 페이지 스크롤', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'tablet', '터치는 태블릿 설정(태블릿·휴대폰 크기)에서 확인');
  const errors = collectErrors(page);
  for (const size of [{ width: 820, height: 1180 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size);
    await page.goto(fileUrl(FILE, '?unlock=all&seed=1&sound=off&stage=cube-judge'));
    const phone = size.width <= 560;
    const q = questionsFor('cube-judge')[0];
    const { touch, swipe, pinch } = await touchPad(page);
    const scrollY = () => page.evaluate(() => Math.round(window.scrollY));
    const center = async () => {
      const box = await foldStage(page).boundingBox();
      return [box.x + box.width / 2, box.y + box.height / 2];
    };
    // 답하기 전: 무대를 위로 쓸면 보기는 그대로, 휴대폰은 페이지가 내려간다(지금과 같음)
    expect(await foldStage(page).evaluate((el) => getComputedStyle(el).touchAction)).toBe('manipulation');
    let [cx, cy] = await center();
    await swipe([cx, cy + 80], [cx, cy - 80]);
    expect(await sceneStyle(page)).toBe(FLAT_SCENE);
    if (phone) expect(await scrollY()).toBeGreaterThan(0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator(`.answer-btn[data-answer="${q.expected}"]`).tap();
    await expect(foldStage(page)).toHaveAttribute('data-fold', 'done');
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(await foldStage(page).evaluate((el) => getComputedStyle(el).touchAction)).toBe('none');
    const home = await viewOf(page);
    const ratio = async () => Math.round(((await viewOf(page)).scale / home.scale) * 100) / 100;
    // 한 손가락으로 (80, −100) 끌기: 돌림 −40°, 기울기 +50°(56° → 106°, 옆에서), 페이지는 그대로
    [cx, cy] = await center();
    await swipe([cx - 40, cy + 50], [cx + 40, cy - 50]);
    const dragged = await viewOf(page);
    expect([dragged.turn - home.turn, dragged.tilt - home.tilt, dragged.scale]).toEqual([-40, 50, home.scale]);
    expect(await scrollY()).toBe(0);
    await expect(page.locator('.sr-only[aria-live]').first()).toHaveText('옆에서 본 모습이에요.');
    // 8px 안쪽으로 움직인 터치는 끌기가 아니다
    await swipe([cx, cy], [cx + 6, cy + 3], 3);
    expect(await viewOf(page)).toEqual(dragged);
    // 벌리기 40 → 200px: 2배에서 멈춤(방향은 그대로), 오므리기 200 → 30px: 0.5배에서 멈춤. 브라우저 확대·스크롤은 그대로
    await pinch([cx, cy], 40, 200);
    expect(await ratio()).toBe(2);
    expect([(await viewOf(page)).tilt, (await viewOf(page)).turn]).toEqual([dragged.tilt, dragged.turn]);
    await expect(padButton(page, '크게 보기')).toBeDisabled();
    await expect(page.locator('.sr-only[aria-live]').first()).toHaveText('2배로 크게 보여요.');
    await pinch([cx, cy], 200, 30);
    expect(await ratio()).toBe(0.5);
    await expect(padButton(page, '작게 보기')).toBeDisabled();
    await pinch([cx, cy], 60, 96); // 사이 값: 0.5 × 1.6 = 0.8배
    expect(await ratio()).toBe(0.8);
    expect(await page.evaluate(() => window.visualViewport.scale)).toBe(1);
    expect(await scrollY()).toBe(0);
    await expect(foldStage(page)).not.toHaveClass(/is-turning/);
    // 버튼 탭은 그대로
    await padButton(page, '처음 보기로').tap();
    expect(await viewOf(page)).toEqual(home);
    await padButton(page, '아래쪽으로 돌려 보기').tap();
    expect((await viewOf(page)).tilt).toBe(60);
    // 휴대폰: 매트의 무대 밖(조작 띠 옆 모서리)을 쓸면 페이지는 그대로 내려간다
    if (phone) {
      const mat = await page.locator('.mat').boundingBox();
      await swipe([mat.x + 5, mat.y + mat.height - 5], [mat.x + 5, mat.y + mat.height - 165]);
      expect(await scrollY()).toBeGreaterThan(100);
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    // 한 손가락으로 끄는 도중 다른 손가락이 닿으면 벌리기로 바뀐다(튀지 않는다)
    await padButton(page, '처음 보기로').tap();
    [cx, cy] = await center();
    await touch('touchStart', [[cx - 50, cy]]);
    await touch('touchMove', [[cx - 30, cy]]);
    const turned = await viewOf(page);
    expect(turned.turn - home.turn).toBe(-10);
    await touch('touchStart', [[cx - 30, cy], [cx + 30, cy]]);
    expect(await viewOf(page)).toEqual(turned);
    await touch('touchMove', [[cx - 45, cy], [cx + 45, cy]]);
    expect([(await viewOf(page)).turn, await ratio()]).toEqual([turned.turn, 1.5]);
    await touch('touchEnd', []);
    await expect(foldStage(page)).not.toHaveClass(/is-turning/);
  }
  expect(errors).toEqual([]);
});

test('두 손가락에서 한 손가락이 되면 남은 손가락으로 튀지 않고 이어 돌리고, 셋째 손가락·문턱 전에 무대 밖에서 뗀 포인터는 남지 않는다 (포인터 이벤트)', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(fileUrl(FILE, '?unlock=all&seed=1&sound=off&stage=cube-judge'));
  await answerAndFold(page, questionsFor('cube-judge')[0]);
  // CDP 터치는 손가락 하나만 떼는 것을 흉내 내지 못해, 무대(누르기)·문서(움직이기·떼기)에 포인터 이벤트를 직접 보낸다. 자리는 무대 가운데 기준
  const fire = (type, id, x, y, primary = false) => page.evaluate(([t, i, dx, dy, p]) => {
    const stage = document.querySelector('.fold-stage');
    const box = stage.getBoundingClientRect();
    const event = new PointerEvent(t, { pointerId: i, pointerType: 'touch', isPrimary: p, button: 0, clientX: box.left + box.width / 2 + dx, clientY: box.top + box.height / 2 + dy, bubbles: true, cancelable: true });
    (t === 'pointerdown' ? stage : document.body).dispatchEvent(event);
  }, [type, id, x, y, primary]);
  const home = await viewOf(page);
  await fire('pointerdown', 11, -40, 0, true);
  await fire('pointerdown', 12, 40, 0);
  await fire('pointermove', 11, -50, 0);
  await fire('pointermove', 12, 50, 0);
  const pinched = await viewOf(page);
  expect([pinched.tilt, pinched.turn, Math.round((pinched.scale / home.scale) * 100) / 100]).toEqual([home.tilt, home.turn, 1.25]); // 80 → 100px
  // 셋째 손가락은 쓰지 않는다
  await fire('pointerdown', 13, 0, 80);
  await fire('pointermove', 13, 0, 200);
  expect(await viewOf(page)).toEqual(pinched);
  // 한 손가락을 뗀다: 그 순간 보기는 그대로, 남은 손가락을 40px 옮기면 20° 돈다
  await fire('pointerup', 12, 50, 0);
  expect(await viewOf(page)).toEqual(pinched);
  for (let i = 1; i <= 5; i += 1) await fire('pointermove', 11, -50 + i * 8, 0);
  const turned = await viewOf(page);
  expect([turned.turn - pinched.turn, turned.tilt, turned.scale]).toEqual([-20, pinched.tilt, pinched.scale]);
  await expect(foldStage(page)).toHaveClass(/is-turning/);
  await fire('pointerup', 11, -10, 0);
  await fire('pointerup', 13, 0, 200);
  await expect(foldStage(page)).not.toHaveClass(/is-turning/);
  // 문턱(8px) 전에 무대 밖에서 떼면 누르기로 끝난다: 그 뒤의 움직임은 보기를 바꾸지 않는다
  await fire('pointerdown', 21, 0, 0, true);
  await fire('pointerup', 21, 3, 0);
  await fire('pointermove', 21, 120, 0);
  expect(await viewOf(page)).toEqual(turned);
  // 끄는 도중 취소(pointercancel)되면 그 자리에서 멈춘다
  await fire('pointerdown', 22, 0, 0, true);
  await fire('pointermove', 22, 20, 0);
  await fire('pointercancel', 22, 20, 0);
  await fire('pointermove', 22, 200, 0);
  expect((await viewOf(page)).turn - turned.turn).toBe(-10);
  await expect(foldStage(page)).not.toHaveClass(/is-turning/);
  // 끄는 도중 다 펴면(접기 막대 0) 끌기가 멈추고 펼친 전개도는 처음 모습
  await fire('pointerdown', 23, 0, 0, true);
  await fire('pointermove', 23, 30, 0);
  await page.locator('.fold-range').fill('0');
  await expect(foldStage(page)).not.toHaveClass(/is-turning/);
  const flat = await sceneStyle(page);
  expect(flat).toMatch(/^scale3d\(1, 1, 1\) rotateX\(0deg\) rotateZ\(-?[\d.]+deg\)$/);
  await fire('pointermove', 23, 200, 0);
  expect(await sceneStyle(page)).toBe(flat);
  await fire('pointerup', 23, 200, 0);
  expect(errors).toEqual([]);
});

test('배치(네 크기): 조작판·접기 도구는 48px 이상이고 이름표·도구 띠·처음 보기의 입체와 겹치지 않으며, 2배로 키워도 버튼·막대·이름표가 가려지지 않고 스크롤이 생기지 않는다', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  const sizes = testInfo.project.name === 'chromebook'
    ? [{ width: 1366, height: 768 }, { width: 1366, height: 680 }]
    : [{ width: 820, height: 1180 }, { width: 390, height: 844 }];
  for (const size of sizes) {
    await page.setViewportSize(size);
    const phone = size.width <= 560;
    const at = `${size.width}×${size.height}`;
    // 시드 4에서 빈 자리가 처음 보기에서 안 보이는 문항: 안 되는 전개도에 "돼요" → 이름표가 두 줄("돌려 보면 빈 자리가 보여요")로 가장 큰 장면
    await page.goto(fileUrl(FILE, '?unlock=all&seed=4&sound=off&stage=cube-judge'));
    const hiddenAt = questionsFor('cube-judge', '4').findIndex((q) => {
      const shown = displayNet(q.net);
      return !q.valid && !q.problems.some((x) => x.type === 'vertex-full') && missingSlots(shown.net).some((slot) => viewDirection(slot.normal, shown.turn, shown.tilt)[2] < 0.05);
    });
    expect(hiddenAt).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < hiddenAt; i += 1) {
      await page.locator('.answer-btn[data-answer="yes"]').click();
      await expect(page.locator('.next-btn')).toBeVisible();
      await page.locator('.next-btn').click();
    }
    await page.locator('.answer-btn[data-answer="yes"]').click();
    await expect(foldStage(page)).toHaveAttribute('data-fold', 'done');
    await expect(page.locator('.stage-badge')).toContainText('돌려 보면 빈 자리가 보여요');
    const measure = () => page.evaluate(() => {
      const rect = (el) => el.getBoundingClientRect();
      const hit = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
      const padEl = document.querySelector('.view-pad');
      const pad = rect(padEl);
      const buttons = [...padEl.querySelectorAll('button')];
      const tools = [...document.querySelectorAll('.fold-tools .fold-toggle, .fold-tools .fold-slider')];
      const badge = rect(document.querySelector('.stage-badge'));
      const stage = rect(document.querySelector('.fold-stage'));
      const mat = rect(document.querySelector('.mat'));
      const faces = [...document.querySelectorAll('.net-face')].map(rect);
      const solid = { left: Math.min(...faces.map((f) => f.left)), top: Math.min(...faces.map((f) => f.top)), right: Math.max(...faces.map((f) => f.right)), bottom: Math.max(...faces.map((f) => f.bottom)) };
      // 가운데 점을 눌렀을 때 그 요소가 눌리나(다른 것이 덮고 있지 않나). 화면 밖에 있는 것은 뺀다(휴대폰의 세로 스크롤)
      const covered = [...buttons, ...tools, document.querySelector('.fold-range'), document.querySelector('.stage-badge')].filter((el) => {
        const r = rect(el);
        const [x, y] = [r.left + r.width / 2, r.top + r.height / 2];
        if (y < 0 || y > window.innerHeight) return false;
        const top = document.elementFromPoint(x, y);
        return !top || !(el.contains(top) || top.contains(el));
      }).map((el) => el.getAttribute('aria-label') ?? el.className);
      return {
        pad: [Math.round(pad.width), Math.round(pad.height)],
        small: [...buttons, ...tools].map(rect).filter((r) => r.width < 48 || r.height < 48).length,
        padInMat: pad.left >= mat.left && pad.right <= mat.right && pad.top >= mat.top && pad.bottom <= mat.bottom,
        buttonsOverlap: buttons.some((a, i) => buttons.some((b, j) => i < j && hit(rect(a), rect(b)))),
        padOnBadge: hit(pad, badge),
        padOnTools: tools.some((t) => hit(pad, rect(t))),
        padOnSolid: buttons.some((b) => hit(rect(b), solid)),
        badgeOnSolid: hit(badge, solid),
        solidInStage: solid.left >= stage.left && solid.right <= stage.right && solid.top >= stage.top && solid.bottom <= stage.bottom,
        covered,
        scrollX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        scrollY: document.documentElement.scrollHeight - window.innerHeight,
      };
    });
    // 처음 보기
    const m = await measure();
    expect(m.pad, at).toEqual(phone ? [198, 100] : [152, 152]); // 십자 48px × 3칸(사이 4px) · 휴대폰은 아래 띠 4칸 × 2줄
    expect({ small: m.small, padInMat: m.padInMat, buttonsOverlap: m.buttonsOverlap, padOnBadge: m.padOnBadge, padOnTools: m.padOnTools, padOnSolid: m.padOnSolid, badgeOnSolid: m.badgeOnSolid, solidInStage: m.solidInStage, covered: m.covered, scrollX: m.scrollX }, at)
      .toEqual({ small: 0, padInMat: true, buttonsOverlap: false, padOnBadge: false, padOnTools: false, padOnSolid: false, badgeOnSolid: false, solidInStage: true, covered: [], scrollX: 0 });
    if (!phone) expect(m.scrollY, at).toBeLessThanOrEqual(0); // 휴대폰은 지금처럼 세로 스크롤(허용)
    await expectToastClear(page);
    // 휴대폰: 매트가 조작 띠 한 줄(48px)만큼 높아지고 무대 크기는 그대로(354 × 260)
    if (phone) {
      const box = await page.evaluate(() => {
        const r = (sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; };
        return { mat: r('.mat'), stage: r('.fold-stage') };
      });
      expect(box).toEqual({ mat: [358, 438], stage: [354, 260] });
    }
    // 2배 · 옆에서 · 아래에서 · 돌려서: 버튼·막대·이름표가 가려지지 않고 스크롤이 생기지 않는다
    for (const step of [['크게 보기', 3], ['아래쪽으로 돌려 보기', 3], ['오른쪽으로 돌려 보기', 2], ['아래쪽으로 돌려 보기', 6], ['왼쪽으로 돌려 보기', 5]]) {
      await pressPad(page, ...step);
      const z = await measure();
      expect({ covered: z.covered, scrollX: z.scrollX, padOnBadge: z.padOnBadge, padOnTools: z.padOnTools, small: z.small }, `${at} ${step.join(' ×')}`)
        .toEqual({ covered: [], scrollX: 0, padOnBadge: false, padOnTools: false, small: 0 });
      if (!phone) expect(z.scrollY, `${at} ${step.join(' ×')}`).toBeLessThanOrEqual(0);
      // 크게 본 입체는 무대 밖(문제 판·조작 띠·매트 밖)에 그려지지 않는다: 무대 바로 밖의 점을 눌렀을 때 면이 눌리지 않는다
      const leak = await page.evaluate(() => {
        const s = document.querySelector('.fold-stage').getBoundingClientRect();
        const points = [[s.left - 3, s.top + s.height / 2], [s.right + 3, s.top + s.height / 2], [s.left + s.width / 2, s.bottom + 3], [s.left + 40, s.bottom + 3], [s.right - 40, s.bottom + 3]];
        return points.filter(([x, y]) => y < window.innerHeight && document.elementFromPoint(x, y)?.closest('.net-face, .net-ghost')).length;
      });
      expect(leak, `${at} ${step.join(' ×')}`).toBe(0);
    }
    expect(Math.round(((await viewOf(page)).scale) * 100) / 100).toBeGreaterThanOrEqual(2); // 자동 맞춤(1배 이상) × 2배
    // 조작판 버튼은 2배에서도 눌린다
    await pressPad(page, '처음 보기로');
    expect((await viewOf(page)).tilt).toBe(56);
  }
  expect(errors).toEqual([]);
});

test('글자: 아래에서 본 2×2 장면과 구멍으로 본 안쪽 면에서도 면 글자·"겹쳐요"·"비어요"가 거울상이 아니다 (종이 안쪽이 보이는 면은 좌우로 뒤집는다)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromebook', '계산된 변환은 크롬북 화면에서 확인');
  const errors = collectErrors(page);
  /**
   * 화면에서 글자가 거울상인 요소. 브라우저가 계산한 변환(원근 · 무대 · 면 · 글자)으로 글자의 오른쪽·아래 방향을 화면에 옮겨
   * 도는 방향을 본다(보통 글자는 오른쪽 → 아래가 시계 방향). 옆에서 봐 선으로 보이는 면(넓이 2% 미만)은 뺀다
   */
  const mirrored = () => page.evaluate(() => {
    const stage = document.querySelector('.fold-stage');
    const scene = stage.querySelector('.net-scene');
    const sceneMatrix = new DOMMatrix(getComputedStyle(scene).transform);
    const d = parseFloat(getComputedStyle(stage).perspective);
    const eyeY = (parseFloat(getComputedStyle(stage).perspectiveOrigin.split(' ')[1]) - stage.clientHeight / 2);
    const out = { checked: 0, back: 0, mirrored: [], upsideDown: [] };
    for (const el of scene.querySelectorAll('.net-face, .net-ghost')) {
      const inner = el.querySelector('.face-inner, span');
      const local = new DOMMatrix(getComputedStyle(inner).transform === 'none' ? undefined : getComputedStyle(inner).transform);
      const m = sceneMatrix.multiply(new DOMMatrix(el.style.transform));
      const [w, h] = [el.offsetWidth, el.offsetHeight];
      const screen = (x, y) => {
        const p = m.transformPoint(new DOMPoint(x, y, 0));
        const k = d / (d - p.z);
        return [p.x * k, eyeY + (p.y - eyeY) * k];
      };
      const origin = screen(w / 2, h / 2);
      const right = screen(w / 2 + local.a * 10, h / 2 + local.b * 10); // 글자의 오른쪽(글자 변환 뒤)
      const down = screen(w / 2 + local.c * 10, h / 2 + local.d * 10); // 글자의 아래
      const [rx, ry, dx, dy] = [right[0] - origin[0], right[1] - origin[1], down[0] - origin[0], down[1] - origin[1]];
      const cross = rx * dy - ry * dx; // 100이면 똑바로 마주 본 것
      if (Math.abs(cross) < 2) continue; // 옆에서 봐 거의 선으로 보이는 면
      out.checked += 1;
      if (el.classList.contains('is-back')) out.back += 1;
      const name = `${el.dataset.label ?? '비어요'}${el.classList.contains('is-back') ? '(안쪽)' : ''}`;
      if (cross < 0) out.mirrored.push(name);
      // 바로 세우는 글자(겹쳐요·비어요·2×2 장면)는 거꾸로 서지 않는다. 납작하게 눌려 읽을 수 없는 면(넓이 15% 미만)은 뺀다
      const upright = el.matches('.net-ghost, .is-overlap') || stage.classList.contains('marks-blocked');
      if (upright && Math.abs(cross) >= 15 && dy <= 0) out.upsideDown.push(name);
    }
    return out;
  });
  const sweep = async (label, { backSeen }) => {
    let back = 0;
    let checked = 0;
    for (const step of [['처음 보기로', 1], ['아래쪽으로 돌려 보기', 3], ['아래쪽으로 돌려 보기', 3], ['아래쪽으로 돌려 보기', 3], ['오른쪽으로 돌려 보기', 3], ['위쪽으로 돌려 보기', 4], ['오른쪽으로 돌려 보기', 4], ['위쪽으로 돌려 보기', 8], ['왼쪽으로 돌려 보기', 2], ['크게 보기', 3]]) {
      await pressPad(page, ...step);
      const m = await mirrored();
      expect({ mirrored: m.mirrored, upsideDown: m.upsideDown }, `${label} ${step.join(' ×')} (기울기 ${(await viewOf(page)).tilt}°)`).toEqual({ mirrored: [], upsideDown: [] });
      back += m.back;
      checked += m.checked;
    }
    expect(checked, label).toBeGreaterThan(20);
    if (backSeen) expect(back, `${label}: 안쪽이 보인 면`).toBeGreaterThan(0);
  };
  // 1) 자유 배치의 2×2 덩어리 장면(접다 멈춤): 아래에서 보면 모든 면의 안쪽이 보인다
  await page.goto(FREE());
  await placeShape(page, shiftCells(SHAPES.block, 1, 1));
  await foldAs(page, 'yes');
  await expect(foldStage(page)).toHaveClass(/marks-blocked/);
  expect((await mirrored()).back).toBe(0); // 처음 보기에서는 모두 앞면
  await sweep('2×2 장면', { backSeen: true });
  await pressPad(page, '처음 보기로');
  await pressPad(page, '아래쪽으로 돌려 보기', 9);
  expect((await viewOf(page)).tilt).toBe(180);
  expect(await page.locator('.net-face.is-back').count()).toBe(6); // 바로 아래에서: 여섯 면 모두 종이 안쪽
  expect((await mirrored()).mirrored).toEqual([]);
  // 2) 겹치는 모양(한 줄 5칸): 겹친 면 "겹쳐요"와 빈 자리 "비어요", 구멍으로 보이는 안쪽 면
  await fresh(page);
  await placeShape(page, shiftCells(SHAPES.line5, 1, 2));
  await foldAs(page, 'yes');
  await expect(page.locator('.net-ghost').first()).toBeVisible();
  await sweep('겹침 장면', { backSeen: true });
  // 3) 닫힌 정육면체: 어디서 보든 눈 쪽 세 면만 앞면이고, 뒤집히는 것은 가려진 뒤쪽 세 면뿐이다
  await fresh(page);
  await placeShape(page, shiftCells(SHAPES.cross, 1, 1));
  expect(await page.locator('.is-back').count()).toBe(0); // 놓는 판·펼친 전개도에는 뒤집힌 면이 없다
  await foldAs(page, 'yes');
  expect(await page.locator('.net-face.is-back').count()).toBe(3);
  await sweep('정육면체', { backSeen: true });
  await pressPad(page, '처음 보기로');
  for (const step of [['아래쪽으로 돌려 보기', 2], ['오른쪽으로 돌려 보기', 2], ['아래쪽으로 돌려 보기', 3], ['왼쪽으로 돌려 보기', 5]]) {
    await pressPad(page, ...step);
    expect(await page.locator('.net-face.is-back').count()).toBe(3);
  }
  expect(errors).toEqual([]);
});

test('자유 배치: 판 → 무대 이어 접기 어긋남 0px (네 크기) — 접힌 뒤 돌리고 키운 다음 [펴서 고치기]로 다시 접어도 0px, 조작판은 접힌 뒤에만 보이고 도장·이름표와 겹치지 않는다', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  const sizes = testInfo.project.name === 'chromebook'
    ? [{ width: 1366, height: 768 }, { width: 1366, height: 680 }]
    : [{ width: 820, height: 1180 }, { width: 390, height: 844 }];
  /** 예상 버튼을 누른 같은 차례에: 판의 칸 가운데와 무대 면 가운데의 가장 큰 어긋남(px), 무대 변환 */
  const foldDrift = () => page.evaluate(() => {
    // 문서 좌표(스크롤을 더한 자리): 좁은 화면은 예상 버튼을 누를 때 매트가 보이게 페이지를 올린다
    const center = (el) => {
      const b = el.getBoundingClientRect();
      return [b.left + b.width / 2 + window.scrollX, b.top + b.height / 2 + window.scrollY];
    };
    const cells = [...document.querySelectorAll('.free-board .cell.is-filled')].map((c) => ({ label: c.querySelector('.tile-face').dataset.label, at: center(c) }));
    document.querySelector('.predict-btn[data-answer="yes"]').click();
    const faces = [...document.querySelectorAll('.fold-stage .net-face')].map((f) => ({ label: f.dataset.label, at: center(f) }));
    const drift = Math.max(...cells.map((c) => {
      const f = faces.find((x) => x.label === c.label);
      return Math.hypot(f.at[0] - c.at[0], f.at[1] - c.at[1]);
    }));
    return { drift: Math.round(drift * 100) / 100, count: cells.length, scene: document.querySelector('.fold-stage .net-scene').style.transform };
  });
  for (const size of sizes) {
    await page.setViewportSize(size);
    await page.goto(FREE());
    await page.evaluate(() => localStorage.clear());
    await page.goto(FREE());
    const phone = size.width <= 560;
    const at = `${size.width}×${size.height}`;
    // 놓는 중에는 조작판이 없다
    await expect(page.locator('.view-pad')).toBeHidden();
    await placeShape(page, phone ? SHAPES.cross : shiftCells(SHAPES.cross, 1, 1));
    expect(await foldDrift(), at).toEqual({ drift: 0, count: 6, scene: FLAT_SCENE });
    await expect(foldStage(page)).toHaveAttribute('data-fold', 'done');
    await expect(page.locator('.view-pad')).toBeVisible();
    await expect(page.locator('.found-stamp')).toBeVisible();
    // 조작판·도장·이름표·조작 띠가 서로 겹치지 않고, 오른쪽 판 안쪽은 넘치지 않는다
    const overlaps = await page.evaluate(() => {
      const rect = (sel) => document.querySelector(sel).getBoundingClientRect();
      const hit = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
      const [pad, stamp, badge, tools] = ['.view-pad', '.found-stamp', '.stage-badge', '.fold-tools'].map(rect);
      const small = [...document.querySelectorAll('.view-pad button, .fold-tools .fold-toggle')].filter((b) => { const r = b.getBoundingClientRect(); return r.width < 48 || r.height < 48; }).length;
      return { padOnStamp: hit(pad, stamp), padOnBadge: hit(pad, badge), padOnTools: hit(pad, tools), stampOnTools: hit(stamp, tools), small };
    });
    expect(overlaps, at).toEqual({ padOnStamp: false, padOnBadge: false, padOnTools: false, stampOnTools: false, small: 0 });
    await expectPanelFits(page, `${at} 새 전개도`);
    if (!phone) await noScroll(page);
    // 접힌 뒤 보기를 바꾼다(아래에서 · 2배 · 돌려서) → 판 안쪽 넘침 0 그대로
    await pressPad(page, '아래쪽으로 돌려 보기', 5);
    await pressPad(page, '크게 보기', 3);
    await pressPad(page, '오른쪽으로 돌려 보기', 2);
    expect((await viewOf(page)).tilt).toBe(120);
    await expectPanelFits(page, `${at} 돌리고 키운 뒤`);
    if (!phone) await noScroll(page);
    // [펴서 고치기] → 놓은 그대로 판으로(조작판 숨김) → 다시 접어도 어긋남 0px, 처음 보기에서 시작한다
    await page.locator('.free-fix').click();
    await expect(page.locator('.free-board .tile-face')).toHaveCount(6);
    await expect(page.locator('.view-pad')).toBeHidden();
    expect(await foldDrift(), `${at} 다시 접기`).toEqual({ drift: 0, count: 6, scene: FLAT_SCENE });
    await expect(foldStage(page)).toHaveAttribute('data-fold', 'done');
    expect((await viewOf(page)).tilt).toBe(56);
    await expect(padButton(page, '처음 보기로')).toBeDisabled();
    // 다 펴면(접기 막대 0) 놓았던 칸 자리 그대로 돌아온다 — 보기를 바꾼 뒤에도
    await pressPad(page, '위쪽으로 돌려 보기', 2);
    await pressPad(page, '작게 보기', 2);
    await page.locator('.fold-range').fill('0');
    expect(await sceneStyle(page)).toBe(FLAT_SCENE);
  }
  expect(errors).toEqual([]);
});

for (const mode of ['움직임 줄이기', 'fx=low']) {
  test.describe(`보기 조작 (${mode})`, () => {
    if (mode === '움직임 줄이기') test.use({ contextOptions: { reducedMotion: 'reduce' } });

    test('끌기·버튼·휠은 바로 반응하고, 접기는 지금처럼(움직임 줄이기면 3장면, 그동안 requestAnimationFrame 0번), 나간 뒤 남는 프레임 요청·포인터 리스너가 없다', async ({ page }, testInfo) => {
      const errors = collectErrors(page);
      const mouse = testInfo.project.name === 'chromebook';
      // 프레임 요청 횟수와, 창에 남아 있는 포인터 리스너(움직임·취소) 수를 센다. pointerup은 Playwright도 누를 때마다 창에 붙였다 떼므로 세지 않는다
      await page.addInitScript(() => {
        window.frames_ = 0;
        const raf = window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame = (fn) => {
          window.frames_ += 1;
          return raf(fn);
        };
        const active = new Map(); // 함수 → 창에 붙어 있는 포인터 이벤트 종류
        const add = window.addEventListener.bind(window);
        const remove = window.removeEventListener.bind(window);
        window.addEventListener = (type, fn, ...rest) => {
          if (/^pointer(move|cancel)$/.test(type)) active.set(fn, (active.get(fn) ?? new Set()).add(type));
          return add(type, fn, ...rest);
        };
        window.removeEventListener = (type, fn, ...rest) => {
          active.get(fn)?.delete(type);
          return remove(type, fn, ...rest);
        };
        window.pointerListeners = () => [...active.values()].reduce((sum, types) => sum + types.size, 0);
      });
      await page.goto(fileUrl(FILE, `?unlock=all&seed=1&sound=off&stage=cube-judge${mode === 'fx=low' ? '&fx=low' : ''}`));
      const q = questionsFor('cube-judge')[0];
      await page.evaluate(() => {
        const el = document.querySelector('.fold-stage');
        window.foldStates = [];
        new MutationObserver(() => window.foldStates.push(el.dataset.fold)).observe(el, { attributes: true, attributeFilter: ['data-fold'] });
        window.frames_ = 0;
      });
      const listeners0 = await page.evaluate(() => window.pointerListeners());
      await page.locator(`.answer-btn[data-answer="${q.expected}"]`).click();
      await expect(foldStage(page)).toHaveAttribute('data-fold', 'done');
      const states = await page.evaluate(() => window.foldStates);
      if (mode === '움직임 줄이기') {
        expect(states).toContain('half');
        expect(states).not.toContain('folding');
        expect(await page.evaluate(() => window.frames_)).toBe(0); // 접는 동안 프레임 요청 0번
      } else {
        expect(states).toContain('folding'); // fx=low는 접기 애니메이션을 줄이지 않는다(지금과 같음)
      }
      // 버튼: 누른 그 차례에 바뀐다(움직임 없이 한 번에)
      const home = await viewOf(page);
      const afterClick = await page.evaluate(() => {
        document.querySelector('.view-down').click();
        document.querySelector('.view-in').click();
        return document.querySelector('.fold-stage .net-scene').style.transform;
      });
      expect(afterClick).toBe(await sceneStyle(page));
      expect([(await viewOf(page)).tilt, Math.round(((await viewOf(page)).scale / home.scale) * 100) / 100]).toEqual([60, 1.25]);
      await page.evaluate(() => { window.frames_ = 0; });
      if (mouse) {
        // 끌기: 움직인 만큼 바로(끄는 도중에도) 따라온다. 휠도 바로
        const spot = await stagePoint(page);
        await page.mouse.move(spot.x, spot.y);
        await page.mouse.down();
        await page.mouse.move(spot.x + 40, spot.y, { steps: 2 });
        expect((await viewOf(page)).turn).toBe(home.turn - 20);
        await page.mouse.move(spot.x + 60, spot.y - 20, { steps: 2 });
        expect([(await viewOf(page)).turn, (await viewOf(page)).tilt]).toEqual([home.turn - 30, 70]);
        await page.mouse.up();
        await page.mouse.wheel(0, -100);
        await expect.poll(async () => (await viewOf(page)).scale / home.scale).toBeGreaterThan(1.4);
        // 끌기·휠·버튼에는 프레임 요청을 쓰지 않는다(보기 조작에 새 자동 움직임이 없다)
        expect(await page.evaluate(() => window.frames_)).toBe(0);
        // 끄는 도중(포인터를 누른 채) 단계 밖으로 나간다
        await page.mouse.move(spot.x, spot.y);
        await page.mouse.down();
        await page.mouse.move(spot.x + 50, spot.y, { steps: 2 });
        await expect(foldStage(page)).toHaveClass(/is-turning/);
        expect(await page.evaluate(() => window.pointerListeners())).toBe(listeners0 + 2); // 끄는 동안만 창에서 움직임·취소(와 떼기)를 듣는다
      } else {
        await foldStage(page).focus();
        await page.keyboard.press('ArrowUp');
        expect((await viewOf(page)).tilt).toBe(45);
        expect(await page.evaluate(() => window.frames_)).toBe(0);
      }
      await page.getByRole('button', { name: '← 단계 선택' }).dispatchEvent('click');
      await expect(page.getByRole('heading', { name: '단계를 골라요' })).toBeVisible();
      if (mouse) await page.mouse.up();
      // 나간 뒤: 창의 포인터 리스너가 처음 수로 돌아오고, 프레임 요청이 더 생기지 않는다
      expect(await page.evaluate(() => window.pointerListeners())).toBe(listeners0);
      await page.waitForTimeout(700); // 휠 뒤 알림 타이머(0.3초)·click 삼키기 타이머가 남아 있었다면 여기서 돈다
      await page.evaluate(() => { window.frames_ = 0; });
      await page.mouse.move(300, 300);
      await page.mouse.wheel(0, -100);
      await page.waitForTimeout(400);
      expect(await page.evaluate(() => window.frames_)).toBe(0);
      expect(errors).toEqual([]);
    });
  });
}

test('처음 화면 그림(정지 무대)은 변환·그늘이 지금과 같고 끌기·휠·키에 반응하지 않으며, 놀이 방법에 돌려 보기·크게 작게 보기를 알린다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromebook', '처음 화면 그림의 값은 크롬북 화면에서 확인');
  const errors = collectErrors(page);
  await page.goto(fileUrl(FILE, '?sound=off'));
  const hero = page.locator('.hero-net .fold-stage');
  const read = () => page.evaluate(() => ({
    scene: document.querySelector('.hero-net .net-scene').style.transform,
    k: document.querySelector('.hero-net .net-scene').style.getPropertyValue('--k'),
    shades: [...document.querySelectorAll('.hero-net .net-face')].map((f) => `${f.dataset.label} ${f.style.getPropertyValue('--shade')}`),
  }));
  // bf86e8c에서 읽은 값: 십자 전개도를 0.42만큼 접고 −30° 돌린 정지 장면 (기울기 56 × 0.42, 돌림 −30 − 28 × 0.42)
  const HERO = {
    scene: 'scale3d(1.1364, 1.1364, 1.1364) rotateX(23.52deg) rotateZ(-41.76deg)',
    k: '',
    shades: ['가 0.027', '나 0.046', '다 0.025', '라 0.136', '마 0.333', '바 0.155'],
  };
  expect(await read()).toEqual(HERO);
  await expect(hero).toHaveAttribute('aria-hidden', 'true');
  await expect(hero).not.toHaveClass(/can-view/);
  await expect(page.locator('.view-pad')).toHaveCount(0);
  const box = await hero.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 40, { steps: 4 });
  await page.mouse.up();
  await page.mouse.wheel(0, -200);
  expect(await read()).toEqual(HERO);
  expect(await hero.evaluate((el) => getComputedStyle(el).touchAction)).toBe('manipulation');
  await page.getByRole('button', { name: '놀이 방법' }).click();
  await expect(page.getByText('답한 뒤에 [접어 보기]나 막대로 직접 접어서 확인해요. 접은 입체는 끌어서 여러 방향으로 돌려 보고, 크게도 작게도 볼 수 있어요.')).toBeVisible();
  expect(errors).toEqual([]);
});
