import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { opensWithIntro, planIntro, readUrlOptions } from '../../src/shared/ui/app.js';

// 게임 인트로(선택 기능, B0c · docs/engine.md 2절 "게임 인트로"): intro가 없는 게임은 지금과 같다

const GAME = { id: 'g', title: '입체도형 공방' };

test('intro가 없으면 null (인트로 없음 — 지금과 같다)', () => {
  assert.equal(planIntro(null, GAME), null);
  assert.equal(planIntro(undefined, GAME), null);
  assert.equal(planIntro(false, GAME), null);
});

test('intro 기본값: 제목은 게임 이름, 버튼은 "입장하기", 부제·제목 그림은 없음. 글자는 앞뒤 빈칸을 뺀다', () => {
  assert.deepEqual(planIntro({}, GAME), { title: '입체도형 공방', subtitle: '', enterLabel: '입장하기', logo: null });
  assert.deepEqual(planIntro({ subtitle: '  도형 모험 ', enterLabel: ' 들어가기 ', title: ' 다른 이름 ' }, GAME), { title: '다른 이름', subtitle: '도형 모험', enterLabel: '들어가기', logo: null });
  assert.deepEqual(planIntro({ enterLabel: '   ', title: '' }, GAME), { title: '입체도형 공방', subtitle: '', enterLabel: '입장하기', logo: null });
});

test('제목 그림(logo): 크기와 리본(가운데 선·글자 크기·글 길이)을 숫자로 받는다', () => {
  const plan = planIntro({ logo: { width: '1352', height: 873, ribbon: { path: ' M0 0 L10 0 ', fontSize: '52', length: 580 } } }, GAME);
  assert.deepEqual(plan.logo, { width: 1352, height: 873, ribbon: { path: 'M0 0 L10 0', fontSize: 52, length: 580 } });
  assert.deepEqual(planIntro({ logo: { width: 10, height: 5 } }, GAME).logo, { width: 10, height: 5, ribbon: null });
});

test('잘못된 intro는 바로 오류(개발 실수를 드러낸다)', () => {
  assert.throws(() => planIntro('인트로', GAME), /intro는/);
  assert.throws(() => planIntro([], GAME), /intro는/);
  assert.throws(() => planIntro({ logo: { width: 0, height: 10 } }, GAME), /width·height/);
  assert.throws(() => planIntro({ logo: { width: 10 } }, GAME), /width·height/);
  assert.throws(() => planIntro({ logo: { width: 10, height: 10, ribbon: { path: '', fontSize: 10, length: 10 } } }, GAME), /ribbon/);
  assert.throws(() => planIntro({ logo: { width: 10, height: 10, ribbon: { path: 'M0 0', fontSize: 10 } } }, GAME), /ribbon/);
});

test('인트로로 시작하는가: 수업 주소(?stage=·?lesson=·?area=·?grade=, 값이 비었거나 틀려도)가 있으면 아니다. 그 밖의 옵션만 있으면 인트로', () => {
  for (const q of ['', '?seed=1&sound=off', '?unlock=all', '?fx=low', '?sound=off&seed=x&unlock=all&fx=low']) assert.equal(opensWithIntro(readUrlOptions(q)), true, q);
  for (const q of ['?stage=cube-judge', '?lesson=cube', '?area=blocks', '?grade=6', '?grade=', '?area=zzz', '?lesson=zzz&seed=1', '?seed=1&stage=']) assert.equal(opensWithIntro(readUrlOptions(q)), false, q);
  assert.equal(opensWithIntro({}), true);
  assert.equal(opensWithIntro(null), true);
});

/** 그림 파일 머리에서 크기 읽기: WebP(VP8X) · JPEG(SOF) */
function webpSize(buf) {
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buf.toString('ascii', 12, 16), 'VP8X');
  return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
}
function jpegSize(buf) {
  let at = 2;
  while (at < buf.length) {
    const marker = buf[at + 1];
    const len = buf.readUInt16BE(at + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return { width: buf.readUInt16BE(at + 7), height: buf.readUInt16BE(at + 5) };
    at += 2 + len;
  }
  throw new Error('JPEG 크기를 찾지 못했어요');
}

test('입체도형 공방의 인트로 값이 그림 파일과 맞다: 제목 그림 1352×873(main.js의 logo 크기), 배경 1680×944(style.css의 세로 화면 높이 84.3vw = 150vw × 944 / 1680), 리본 선은 그림 안', async () => {
  const dir = new URL('../../src/games/net-workshop/', import.meta.url);
  const title = webpSize(await readFile(new URL('img/intro-title.webp', dir)));
  const bg = jpegSize(await readFile(new URL('img/intro-bg.jpg', dir)));
  assert.deepEqual(title, { width: 1352, height: 873 });
  assert.deepEqual(bg, { width: 1680, height: 944 });
  const main = await readFile(new URL('main.js', dir), 'utf8');
  const logo = /logo: \{ width: (\d+), height: (\d+), ribbon: \{ path: '([^']+)', fontSize: (\d+), length: (\d+) \} \}/.exec(main);
  assert.ok(logo, 'main.js에 intro.logo가 있다');
  assert.deepEqual([Number(logo[1]), Number(logo[2])], [title.width, title.height]);
  const nums = logo[3].match(/-?\d+(\.\d+)?/g).map(Number);
  for (let i = 0; i < nums.length; i += 2) {
    assert.ok(nums[i] >= 0 && nums[i] <= title.width && nums[i + 1] >= 0 && nums[i + 1] <= title.height, `리본 선의 점 ${nums[i]},${nums[i + 1]}`);
  }
  const css = await readFile(new URL('style.css', dir), 'utf8');
  assert.match(css, /height: 84\.3vw;/);
  assert.ok(Math.abs((150 * bg.height) / bg.width - 84.3) < 0.05);
  // 그림 url()은 게임 CSS 안에서만 (엔진 CSS가 var()로 받으면 개발 서버가 엔진 폴더 기준으로 찾는다)
  const base = await readFile(new URL('../../shared/styles/base.css', dir), 'utf8');
  assert.equal(/url\(/.test(base.replace(/\/\*[\s\S]*?\*\//g, '')), false, 'base.css(주석 밖)에 url()이 없다');
});
