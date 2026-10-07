import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { createRng } from '../../src/shared/core/random.js';
import { missingSlots } from '../../src/games/net-workshop/fold.js';
import { STAGES, judgeNetAnswer, judgeSlot, makeQuestions } from '../../src/games/net-workshop/logic.js';
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

/** 지금 보이는 알림(토스트)이 조작 버튼(머리의 소리·단계 선택, 답 버튼, 접기 도구, 다음 버튼, 면 카드)과 겹치지 않는다 */
async function expectToastClear(page) {
  await expect(page.locator('.toast')).toBeVisible();
  const hits = await page.evaluate(() => {
    const t = document.querySelector('.toast').getBoundingClientRect();
    const controls = '.topbar button, .play-header button, .answer-btn, .fold-toggle, .btn-icon, .fold-range, .hint-btn, .next-btn, .face-card';
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

async function noScroll(page) {
  const { scrollHeight, innerHeight } = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
  }));
  expect(scrollHeight).toBeLessThanOrEqual(innerHeight);
  expect(await hasHorizontalScroll(page)).toBe(false);
}

test('?lesson=cube: 그 차시 3단계만 보이고 첫 단계만 열림, 판별 6문항을 끝까지 하면 다음 단계가 열린다', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(fileUrl(FILE, '?lesson=cube&seed=1&sound=off'));
  await expect(page.locator('.eyebrow')).toHaveText('정육면체의 전개도');
  await page.getByRole('button', { name: '시작하기' }).click();
  await expect(page.getByRole('heading', { name: '단계를 골라요' })).toBeVisible();
  await expect(page.locator('.lesson-group h3')).toHaveText(['정육면체의 전개도']);
  const cards = page.locator('.stage-card');
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toBeEnabled();
  await expect(cards.nth(1)).toBeDisabled();
  await expect(cards.nth(2)).toBeDisabled();

  await cards.first().click();
  const questions = questionsFor('cube-judge');
  for (const [i, q] of questions.entries()) {
    await expect(page.locator('.q-counter')).toHaveText(`문제 ${i + 1} / 6`);
    // 화면의 전개도(면 이름·칸 위치)가 같은 시드로 만든 문항과 같다
    await expectSameNet(page, q.net);
    await page.locator(`.answer-btn[data-answer="${q.expected}"]`).click();
    await expect(page.locator('.reason')).toContainText('맞아요!');
    await page.locator('.next-btn').click();
  }

  await expect(page.getByRole('heading', { name: '단계 성공!' })).toBeVisible();
  await expect(page.getByText('6번 중 6번 맞힘')).toBeVisible();
  await expect(page.getByRole('button', { name: '다음 단계' })).toBeVisible();
  await page.getByRole('button', { name: '단계 선택' }).click();
  await expect(cards.nth(1)).toBeEnabled();
  await expect(cards.nth(2)).toBeDisabled();
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
      await expect(page.locator('.stage-badge')).toHaveText(/^✗ 정육면체가 안 돼요/);
    } else {
      await page.locator(`.answer-btn[data-answer="${q.expected}"]`).click();
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

  await page.locator(`.answer-btn[data-answer="${q.expected}"]`).click();
  await expect(foldStage(page)).toHaveAttribute('data-fold', 'done');
  await expect(page.locator('.stage-badge')).toHaveText(q.valid ? '✓ 정육면체가 됐어요' : /^✗/);
  await expect(toggle).toHaveText('◀ 펴기');
  await toggle.click();
  await expect(foldStage(page)).toHaveAttribute('data-fold', 'flat');
  await expect(toggle).toHaveText('▶ 접어 보기');
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
  await expect(page.locator('.q-counter')).toHaveText('문제 2 / 5');
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
    await expect(page.locator('.q-counter')).toHaveText(`문제 ${i + 1} / 5`);
    await page.locator(`.net-face[data-face="${each.answer}"]`).click();
    await expect(page.locator(`.net-face[data-face="${each.answer}"]`)).toHaveClass(/is-correct/);
    await page.locator('.next-btn').click();
  }
  await expect(page.getByText('6번 중 5번 맞힘')).toBeVisible(); // 같은 면을 두 번 눌렀지만 오답은 1번
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
  await expect(page.locator('.stage-badge')).toHaveText('✓ 정육면체가 됐어요');
  expect(errors).toEqual([]);
});

test('면 붙이기: 틀린 자리는 접어서 겹침을 보여 주고 다시 하게 하며, 차시 끝에는 "이 차시를 마쳤어요!"', async ({ page }) => {
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
  await expect(page.locator('.stage-badge')).toHaveText(/^✗/);
  await page.getByRole('button', { name: '◀ 펴고 다시 하기' }).click();
  await expect(page.locator(`.net-slot[data-cell="${wrong.key}"]`)).toHaveClass(/is-tried/);
  await expect(page.locator('.hint-btn')).toBeVisible();
  // 이미 놓아 본 자리에 다시 놓으면 기록하지 않고 안내만
  await page.locator('.face-card').click();
  await page.locator(`.net-slot[data-cell="${wrong.key}"]`).click();
  await expect(page.locator('.toast-info')).toContainText('이미 놓아 본 자리');
  await expect(foldStage(page)).toHaveAttribute('data-fold', 'flat');
  await expect(page.locator('.face-card')).toBeVisible();

  for (const [i, q] of questions.entries()) {
    await expect(page.locator('.q-counter')).toHaveText(`문제 ${i + 1} / 4`);
    await page.locator('.face-card').click();
    await page.locator(`.net-slot[data-cell="${q.slots.find((s) => s.ok).key}"]`).click();
    await expect(page.locator('.stage-badge')).toHaveText('✓ 정육면체가 됐어요');
    await page.locator('.next-btn').click();
  }
  await expect(page.getByRole('heading', { name: '이 차시를 마쳤어요!' })).toBeVisible();
  await expect(page.getByRole('button', { name: '학습 기록 보기' })).toBeVisible();
  await expect(page.getByRole('button', { name: '다음 단계' })).toHaveCount(0);
  await expect(page.getByText('5번 중 4번 맞힘')).toBeVisible(); // 틀린 자리에 두 번 놓았지만 오답은 1번
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
  await expect(page.locator('.stage-badge')).toHaveText('✓ 정육면체가 됐어요');
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
  await page.getByRole('button', { name: '◀ 펴고 다시 하기' }).click();
  await expect(page.locator('.hint-btn')).toBeVisible();
  await noScroll(page);
  await page.locator('.face-card').click();
  await page.locator(`.net-slot[data-cell="${cq.slots.find((s) => s.ok).key}"]`).click();
  await expect(page.locator('.stage-badge')).toHaveText('✓ 정육면체가 됐어요');
  await noScroll(page);
});

test('휴대폰(390×844): 빈 자리 버튼은 48px 이상, 알림은 접기 도구를 가리지 않는다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'tablet', '터치 기기 설정(태블릿 프로젝트)에서 휴대폰 크기로 확인');
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
  const tools = await page.locator('.fold-tools').boundingBox();
  expect(toast.y + toast.height).toBeLessThanOrEqual(tools.y);
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
      await page.getByRole('button', { name: '◀ 펴고 다시 하기' }).click();
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
      await expect(badge).toContainText('↻ 돌려 보면 빈 자리가 보여요');
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
    await page.getByRole('button', { name: '◀ 펴고 다시 하기' }).click();
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
