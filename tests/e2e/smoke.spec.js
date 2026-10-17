import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { DIST, GUIDE_FILE, SERVER_ORIGIN, SITE_BASE, SITE_URL, collectErrors, fileUrl, gameFiles, hasHorizontalScroll } from './helpers.js';

// 모든 게임에 공통으로 적용되는 기본 검사. 새 게임을 만들면 자동으로 포함된다.

/**
 * 게임 인트로가 있는 게임(엔진 intro)은 [입장하기]로 처음 화면에 들어간다 (B0c — 인트로가 없는 게임은 아무것도 하지 않는다)
 */
async function passIntro(page) {
  const intro = page.locator('.intro-enter');
  await expect(intro.or(page.locator('.screen-title')).first()).toBeVisible();
  if (await intro.count()) await intro.click();
  await expect(page.locator('.screen-title')).toBeVisible();
}

/**
 * 처음 화면 → 단계 지도: [시작하기]를 누른다. 영역이 있는 게임(엔진 areas)은 [시작하기] 자리에 영역 카드가 있어 첫 영역 카드를,
 * 학년이 있는 게임은 학년 카드 → 학년 화면의 첫 열린 영역 카드를 누른다
 * (B0a: 학년·영역 카드가 생기며 바꿈 — 뜻은 그대로 "처음 화면에서 단계 지도로". B0c: 인트로가 있으면 먼저 [입장하기])
 */
async function openStageMap(page) {
  await passIntro(page);
  const grade = page.locator('.grade-card:not([disabled])');
  const area = page.locator('.area-card:not([disabled])');
  await expect(area.or(page.getByRole('button', { name: '시작하기' })).first()).toBeVisible();
  if (await grade.count()) {
    await grade.first().click();
    await expect(page.locator('.screen-grade')).toBeVisible();
  }
  if (await area.count()) await area.first().click();
  else await page.getByRole('button', { name: '시작하기' }).click();
}

/** 게임 폴더의 game.json(목록 표시 값 listed — false면 선생님용 안내 목록에서 빠지고 주소로만 연다) */
const gameMeta = (file) => JSON.parse(readFileSync(path.resolve('src/games', file.replace(/\.html$/, ''), 'game.json'), 'utf8'));

// B0d(spec-grade6 15-13): 게임 모음 → 선생님용 안내. 게임 링크는 인트로를 건너뛰는 주소(?intro=0)이고, 목록에서 뺀 게임(예시 게임)은 링크가 없이 주소로만 열린다
test('선생님용 안내 페이지가 목록에 보이는 모든 게임으로 연결된다 (목록에서 뺀 게임은 주소로 열린다)', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(fileUrl(GUIDE_FILE));
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  let listed = 0;
  for (const file of gameFiles()) {
    const shown = gameMeta(file).listed !== false;
    await expect(page.locator(`a.hub-card[href="${file}?intro=0"]`), file).toHaveCount(shown ? 1 : 0);
    if (!shown) await expect(page.locator(`a[href^="${file}"]`), file).toHaveCount(0); // 그 게임은 아래 "오류 없이 열리고"에서 주소로 연다
    if (shown) listed += 1;
  }
  expect(listed).toBeGreaterThan(0);
  expect(await hasHorizontalScroll(page)).toBe(false);
  expect(errors).toEqual([]);
});

for (const file of gameFiles()) {
  test(`${file}: 오류 없이 열리고 첫 단계를 시작할 수 있다`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(fileUrl(file));

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await hasHorizontalScroll(page)).toBe(false);

    await openStageMap(page);
    await expect(page.getByRole('heading', { name: '단계를 골라요' })).toBeVisible();
    await expect(page.locator('.stage-card').nth(1)).toBeDisabled();

    await page.locator('.stage-card').first().click();
    await expect(page.locator('.play-area')).toBeVisible();
    expect(await hasHorizontalScroll(page)).toBe(false);

    await page.getByRole('button', { name: '← 단계 선택' }).click();
    await expect(page.getByRole('heading', { name: '단계를 골라요' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test(`${file}: ?unlock=all 이면 모든 단계가 열린다`, async ({ page }) => {
    await page.goto(fileUrl(file, '?unlock=all&sound=off'));
    /** 지금 단계 지도의 모든 단계 카드가 열려 있다 */
    const allOpen = async () => {
      await expect(page.getByRole('heading', { name: '단계를 골라요' })).toBeVisible();
      const cards = page.locator('.stage-card');
      const count = await cards.count();
      expect(count).toBeGreaterThan(0);
      for (let i = 0; i < count; i += 1) await expect(cards.nth(i)).toBeEnabled();
    };
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await passIntro(page); // 학년 카드는 인트로 다음의 처음 화면에 있다
    // 영역이 있는 게임은 학년마다(있으면) 영역 탭마다 그 영역의 단계 카드를 본다 (모든 단계)
    const grades = await page.locator('.grade-card:not([disabled])').count();
    await openStageMap(page);
    for (let g = 0; g < Math.max(1, grades); g += 1) {
      if (g > 0) {
        await page.getByRole('button', { name: '처음 화면' }).click();
        await page.locator('.grade-card:not([disabled])').nth(g).click();
        await page.locator('.area-card:not([disabled])').first().click();
      }
      const tabs = page.getByRole('tab');
      const areas = await tabs.count();
      for (let t = 0; t < Math.max(1, areas); t += 1) {
        if (areas) {
          await tabs.nth(t).click();
          await expect(tabs.nth(t)).toHaveAttribute('aria-selected', 'true');
        }
        await allOpen();
      }
    }
  });
}

/**
 * 이 페이지가 받을 수 있는 dist의 파일: HTML의 src·href, CSS의 url(), JS의 import … from·import()를 상대 주소로 따라간다(이 검사가 따로 계산 —
 * 빌드 코드를 쓰지 않는다). 게임 모음의 게임 링크(<a href="<id>.html">)는 따라가지 않는다
 */
function pageFiles(name) {
  const seen = new Set();
  const visit = (rel) => {
    if (seen.has(rel)) return;
    seen.add(rel);
    if (!/\.(html|css|js)$/.test(rel)) return;
    const text = readFileSync(path.join(DIST, rel), 'utf8');
    const refs = rel.endsWith('.html') ? [...text.matchAll(/\s(?:src|href)="(\.\/[^"]+)"/g)]
      : rel.endsWith('.css') ? [...text.matchAll(/url\(\s*"?(\.\/[^")]+)"?\s*\)/g)]
        : [...text.matchAll(/(?:from|import)\s*\(?\s*"(\.\/[^"]+)"/g)];
    for (const m of refs) visit(path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1])));
  };
  visit(name);
  return [...seen].filter((rel) => rel !== name);
}

// 사이트와 같은 조건(B0b — 하위 경로 /game2/, 여러 파일): 테스트 서버(scripts/serve.mjs)가 GitHub Pages처럼 /game2/ 아래로 준다
for (const file of ['index.html', GUIDE_FILE, ...gameFiles()]) {
  test(`${file}: 하위 경로(/game2/)에서 열리고, 모든 요청이 같은 출처·하위 경로 안이며 응답 400 이상이 없고, 이 페이지의 해시 파일(늦게 받는 묶음 포함)이 모두 받아진다`, async ({ page }) => {
    test.setTimeout(60_000);
    const errors = collectErrors(page);
    const requested = new Map(); // 주소 → 응답 상태
    const bad = [];
    page.on('response', (r) => {
      requested.set(r.url(), r.status());
      if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`);
    });
    page.on('requestfailed', (r) => bad.push(`받지 못함 ${r.url()} ${r.failure()?.errorText ?? ''}`));
    const others = [];
    page.on('request', (r) => {
      const url = r.url();
      if (url.startsWith('data:') || url.startsWith('blob:')) return;
      const u = new URL(url);
      if (u.origin !== SERVER_ORIGIN || !u.pathname.startsWith(SITE_BASE)) others.push(url);
    });
    await page.goto(fileUrl(file, '?sound=off'));
    expect(page.url().startsWith(SITE_URL)).toBe(true);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const want = pageFiles(file);
    expect(want.length).toBeGreaterThan(file === GUIDE_FILE ? 2 : 4); // B0d: index.html은 이제 입체도형 공방(게임)이고 선생님용 안내가 게임 모음 자리
    for (const rel of want) expect(rel, rel).toMatch(/^assets\/[a-z0-9-]+-[A-Z0-9]{8}\.[a-z0-9]+$/);
    // 늦게 받는 묶음은 처음 화면이 그려진 뒤 한가할 때 미리 받는다 — 모두 받아질 때까지(받아지지 않으면 시간 예산 안에 실패)
    await expect.poll(() => want.filter((rel) => requested.get(`${SITE_URL}${rel}`) !== 200), { timeout: 30_000 }).toEqual([]);
    expect(others).toEqual([]);
    expect(bad).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('테스트 서버는 사이트와 같은 조건: 하위 경로 밖은 404, /game2 는 /game2/ 로, 글 파일은 gzip', async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromebook', '서버 확인은 한 번만');
  for (const p of ['/net-workshop.html', '/index.html', '/assets/', '/game22/net-workshop.html']) expect((await request.get(`${SERVER_ORIGIN}${p}`)).status(), p).toBe(404);
  const moved = await request.get(`${SERVER_ORIGIN}/game2`, { maxRedirects: 0 });
  expect(moved.status()).toBe(301);
  expect(moved.headers().location).toBe('/game2/');
  for (const file of ['index.html', GUIDE_FILE, ...gameFiles()]) {
    const r = await request.get(fileUrl(file), { headers: { 'Accept-Encoding': 'gzip' } });
    expect(r.status(), file).toBe(200);
    expect(r.headers()['content-encoding'], file).toBe('gzip');
  }
});
