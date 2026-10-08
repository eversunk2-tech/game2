import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { createRng } from '../../src/shared/core/random.js';
import { missingSlots } from '../../src/games/net-workshop/fold.js';
import { BOARD_SIZES, STAGES, centerOnBoard, judgeNetAnswer, judgeSlot, makeQuestions, reasonOf } from '../../src/games/net-workshop/logic.js';
import { INVALID_HEXOMINOES } from '../../src/games/net-workshop/nets-data.js';
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

/** 지금 보이는 알림(토스트)이 조작 버튼(머리의 소리·단계 선택, 답 버튼, 접기 도구, 다음 버튼, 면 카드, 놓는 판의 칸)과 겹치지 않는다 */
async function expectToastClear(page) {
  await expect(page.locator('.toast')).toBeVisible();
  const hits = await page.evaluate(() => {
    const t = document.querySelector('.toast').getBoundingClientRect();
    const controls = '.topbar button, .play-header button, .answer-btn, .fold-toggle, .btn-icon, .fold-range, .hint-btn, .next-btn, .face-card, '
      + '.cell, .tray-card, .predict-btn, .reason-chip, .reason-skip, .mat-tools button, .free-buttons button, .net-slot';
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
/** 새로 만들기: 접은 뒤에는 [새로 만들기], 놓는 중에는 [모두 빼기] */
async function fresh(page) {
  if (await page.locator('.free-new').isVisible()) await page.locator('.free-new').click();
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
  const sizes = testInfo.project.name === 'chromebook'
    ? [{ width: 1366, height: 768 }, { width: 1366, height: 680 }]
    : [{ width: 820, height: 1180 }];
  for (const size of sizes) {
    await page.setViewportSize(size);
    await page.goto(FREE());
    await page.evaluate(() => localStorage.clear()); // 크기마다 처음 하는 기기로 (접어 본 모양·별이 이어지지 않게)
    await page.goto(FREE());
    await noScroll(page);
    await placeShape(page, [[1, 1], [2, 1], [3, 1], [4, 1], [1, 2], [6, 4]]);
    await noScroll(page);
    await page.locator('.tool-undo').click();
    await cellOf(page, [2, 0]).click(); // 1-4-1 (십자와 다른 꼴)
    await foldAs(page, 'yes');
    await noScroll(page);
    await fresh(page);
    await placeShape(page, shiftCells(SHAPES.sameSide, 1, 1));
    await foldAs(page, 'no');
    await expect(page.locator('.reason-pick')).toBeVisible();
    await noScroll(page);
    await page.locator('.reason-chip').first().click();
    await noScroll(page);
    await fresh(page);
    await placeShape(page, shiftCells(SHAPES.block, 1, 1));
    await foldAs(page, 'no');
    await page.locator('.reason-skip').click();
    await fresh(page);
    await page.locator('.tool-hint').click();
    await page.locator('.tool-hint').click();
    await expect(page.locator('.shadow-cell')).toHaveCount(6);
    await noScroll(page);
    for (const shape of [SHAPES.cross, SHAPES.n33]) {
      await fresh(page);
      await placeShape(page, shiftCells(shape, 1, 1));
      await foldAs(page, 'yes');
    }
    await expect(page.locator('.free-finish')).toBeVisible();
    await noScroll(page);
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
          await page.locator('.reason-chip').nth(i).click(); // 겹쳐요 · 네 면이 한 점에 · 6개가 아니에요 (바른 것 둘, 틀린 것 하나)
          await expect(page.locator('.stage-badge')).toBeVisible();
          await expect(page.locator(name === 'block-g' ? '.net-dot' : '.net-face.is-overlap').first()).toBeVisible();
          if (!phone) await noScroll(page);
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
  await expect(chip).toHaveText('16점'); // 등록 점수(5 × 3 + 1)는 바로 저장된다
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

test('자유 배치 점수와 다시 하기 규칙: 별 3개를 받은 단계를 다시 하는 판은 처음 접는 모양도 등록 점수(전개도 +5, 노트 +1)만 받는다', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(FREE());
  await page.evaluate(() => localStorage.setItem('edu:net-workshop:stars', JSON.stringify({ 'cube-free': 3 })));
  await page.goto(FREE());
  const xp = page.locator('.meta-xp b');
  await placeShape(page, shiftCells(SHAPES.cross, 1, 1));
  await expect(page.locator('.predict-note')).toHaveText('고르면 바로 접혀요.'); // 연습 점수가 없는 판이라 "+2" 안내를 숨긴다
  await foldAs(page, 'yes');
  await expect(xp).toHaveText('+5');
  await expect(page.locator('.bonus-note')).toHaveText('새 발견 +5');
  await fresh(page);
  await placeShape(page, shiftCells(SHAPES.line5, 1, 2));
  await foldAs(page, 'no');
  await expectNoReasonShown(page);
  await expect(xp).toHaveText('+6');
  await page.locator('.reason-chip[data-reason="overlap"]').click();
  await expect(page.locator('.reason-pick-result')).toHaveText('내 까닭 "면이 겹쳐요" 맞아요!'); // 설명 점수 없음
  await expect(xp).toHaveText('+6');
  await expect(page.locator('.bonus-note')).toHaveText('노트에 새 모양 +1');
  // 같은 판에서 이미 접은 십자를 돌려 다시 접으면 기록·점수 없음(전과 같음)
  await fresh(page);
  await placeShape(page, shiftCells(SHAPES.crossTurned, 2, 0));
  await foldAs(page, 'yes');
  await expect(page.locator('.bonus-note')).toContainText('같은 모양은 돌리거나 뒤집어도 다시 세지 않아요.');
  for (const shape of [SHAPES.n231, SHAPES.n33]) {
    await fresh(page);
    await placeShape(page, shiftCells(shape, 1, 1));
    await foldAs(page, 'yes');
  }
  await expect(xp).toHaveText('+16');
  await page.locator('.free-finish').click();
  await expect(page.locator('.practice-note')).toHaveText('별 3개를 받은 단계라 연습 점수는 없어요. 새로 찾으면 점수를 받아요.');
  await expect(page.locator('.behavior').first()).toContainText('4 / 4');
  await expect(page.locator('.behavior').first().locator('.b-xp')).toHaveText('+0');
  await expect(page.locator('.behavior', { hasText: '까닭 설명' }).locator('.b-xp')).toHaveText('+0');
  expect(await resultXpSum(page)).toEqual({ tiles: 16, line: 0, gained: 16 });
  // 다시 하는 판에서 전에 접어 본 모양은 0점 (보너스 쪽지 없음)
  await page.getByRole('button', { name: '다시 하기' }).click();
  await placeShape(page, shiftCells(SHAPES.n33, 1, 2));
  await foldAs(page, 'yes');
  await expect(xp).toHaveText('+0');
  await expect(page.locator('.bonus-note')).toHaveCount(0);
  await expect(page.locator('.reason')).toContainText('도감 11번과 같은 모양이에요');
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
