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
  assert.deepEqual(planIntro({}, GAME), { title: '입체도형 공방', subtitle: '', enterLabel: '입장하기', logo: null, art: null });
  assert.deepEqual(planIntro({ subtitle: '  도형 모험 ', enterLabel: ' 들어가기 ', title: ' 다른 이름 ' }, GAME), { title: '다른 이름', subtitle: '도형 모험', enterLabel: '들어가기', logo: null, art: null });
  assert.deepEqual(planIntro({ enterLabel: '   ', title: '' }, GAME), { title: '입체도형 공방', subtitle: '', enterLabel: '입장하기', logo: null, art: null });
});

test('제목 그림(logo): 크기·쓸 상자(crop, 없으면 그림 전체)·리본(가운데 선·글자 크기·글 길이)을 숫자로 받는다. 배경(art): 크기·꼭 보일 칸·머리 상자·빛 색', () => {
  const plan = planIntro({ logo: { width: '1352', height: 873, crop: [10, 20, '1300', 860], ribbon: { path: ' M0 0 L10 0 ', fontSize: '52', length: 580 } } }, GAME);
  assert.deepEqual(plan.logo, { width: 1352, height: 873, crop: [10, 20, 1300, 860], ribbon: { path: 'M0 0 L10 0', fontSize: 52, length: 580 } });
  assert.deepEqual(planIntro({ logo: { width: 10, height: 5 } }, GAME).logo, { width: 10, height: 5, crop: [0, 0, 10, 5], ribbon: null });
  assert.deepEqual(planIntro({ art: { width: 100, height: 50, keep: [10, 10, 90, 50], avoid: [[20, 10, 30, 20]], glow: ' red ' } }, GAME).art, { width: 100, height: 50, keep: [10, 10, 90, 50], avoid: [[20, 10, 30, 20]], glow: 'red' });
  assert.deepEqual(planIntro({ art: { width: 100, height: 50 } }, GAME).art, { width: 100, height: 50, keep: [0, 0, 100, 50], avoid: [], glow: null });
});

test('잘못된 intro는 바로 오류(개발 실수를 드러낸다)', () => {
  assert.throws(() => planIntro('인트로', GAME), /intro는/);
  assert.throws(() => planIntro([], GAME), /intro는/);
  assert.throws(() => planIntro({ logo: { width: 0, height: 10 } }, GAME), /width·height/);
  assert.throws(() => planIntro({ logo: { width: 10 } }, GAME), /width·height/);
  assert.throws(() => planIntro({ logo: { width: 10, height: 10, ribbon: { path: '', fontSize: 10, length: 10 } } }, GAME), /ribbon/);
  assert.throws(() => planIntro({ logo: { width: 10, height: 10, ribbon: { path: 'M0 0', fontSize: 10 } } }, GAME), /ribbon/);
  assert.throws(() => planIntro({ logo: { width: 10, height: 10, crop: [0, 0, 11, 10] } }, GAME), /crop/);
  assert.throws(() => planIntro({ art: { width: 0, height: 10 } }, GAME), /intro\.art/);
  assert.throws(() => planIntro({ art: { width: 10, height: 10, keep: [5, 5, 4, 9] } }, GAME), /keep/);
  assert.throws(() => planIntro({ art: { width: 10, height: 10, avoid: [[0, 0, 20, 5]] } }, GAME), /avoid/);
});

test('인트로로 시작하는가: 수업 주소(?stage=·?lesson=·?area=·?grade=, 값이 비었거나 틀려도)가 있으면 아니다. 그 밖의 옵션만 있으면 인트로', () => {
  for (const q of ['', '?seed=1&sound=off', '?unlock=all', '?fx=low', '?sound=off&seed=x&unlock=all&fx=low']) assert.equal(opensWithIntro(readUrlOptions(q)), true, q);
  for (const q of ['?stage=cube-judge', '?lesson=cube', '?area=blocks', '?grade=6', '?grade=', '?area=zzz', '?lesson=zzz&seed=1', '?seed=1&stage=']) assert.equal(opensWithIntro(readUrlOptions(q)), false, q);
  assert.equal(opensWithIntro({}), true);
  assert.equal(opensWithIntro(null), true);
});

/** 그림 파일 머리에서 크기 읽기: PNG(IHDR) · JPEG(SOF) */
function pngSize(buf) {
  assert.equal(buf.toString('latin1', 1, 4), 'PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
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

test('입체도형 공방의 인트로 값이 그림 파일과 맞다: 사용자가 받은 2880×1620 원본(md5 그대로), main.js의 그림 크기·상자가 그림 안, 옛 webp는 없다', async () => {
  const { createHash } = await import('node:crypto');
  const { readdir } = await import('node:fs/promises');
  const dir = new URL('../../src/games/net-workshop/', import.meta.url);
  const titleBuf = await readFile(new URL('img/intro-title.png', dir));
  const bgBuf = await readFile(new URL('img/intro-bg.jpg', dir));
  // spec-grade6 15-9: 캔바 AI 업스케일로 받은 파일을 바이트 그대로 (출처 정보 C2PA를 지우지 않는다)
  const md5 = (b) => createHash('md5').update(b).digest('hex');
  assert.equal(md5(bgBuf), 'a0ca1de662f43b43b63964d18f635e0c');
  assert.equal(md5(titleBuf), 'aa28acc246cf72c99d8a9a5a1367777f');
  assert.deepEqual((await readdir(new URL('img/', dir))).sort(), ['intro-bg.jpg', 'intro-title.png']);
  const title = pngSize(titleBuf);
  const bg = jpegSize(bgBuf);
  assert.deepEqual(title, { width: 2880, height: 1620 });
  assert.deepEqual(bg, { width: 2880, height: 1620 });
  const main = await readFile(new URL('main.js', dir), 'utf8');
  const nums = (m) => m.split(',').map((v) => Number(v.trim()));
  const art = /art: \{\s*width: (\d+),\s*height: (\d+),\s*keep: \[([^\]]+)\][^\n]*\n\s*avoid: \[\[([^\]]+)\], \[([^\]]+)\]\]/.exec(main);
  assert.ok(art, 'main.js에 intro.art가 있다');
  assert.deepEqual([Number(art[1]), Number(art[2])], [bg.width, bg.height]);
  for (const b of [art[3], art[4], art[5]].map(nums)) assert.ok(b[0] >= 0 && b[1] >= 0 && b[2] <= bg.width && b[3] <= bg.height && b[0] < b[2] && b[1] < b[3], `상자 ${b}`);
  const logo = /logo: \{ width: (\d+), height: (\d+), crop: \[([^\]]+)\], ribbon: \{ path: '([^']+)', fontSize: (\d+), length: (\d+) \} \}/.exec(main);
  assert.ok(logo, 'main.js에 intro.logo가 있다');
  assert.deepEqual([Number(logo[1]), Number(logo[2])], [title.width, title.height]);
  const crop = nums(logo[3]);
  const pts = logo[4].match(/-?\d+(\.\d+)?/g).map(Number);
  for (let i = 0; i < pts.length; i += 2) {
    assert.ok(pts[i] >= crop[0] && pts[i] <= crop[2] && pts[i + 1] >= crop[1] && pts[i + 1] <= crop[3], `리본 선의 점 ${pts[i]},${pts[i + 1]}이 쓰는 상자 안`);
  }
  // 그림 url()은 게임 CSS 안에서만 (엔진 CSS가 var()로 받으면 개발 서버가 엔진 폴더 기준으로 찾는다)
  const base = await readFile(new URL('../../shared/styles/base.css', dir), 'utf8');
  assert.equal(/url\(/.test(base.replace(/\/\*[\s\S]*?\*\//g, '')), false, 'base.css(주석 밖)에 url()이 없다');
  const css = await readFile(new URL('style.css', dir), 'utf8');
  assert.match(css, /url\('\.\/img\/intro-bg\.jpg'\)/);
  assert.match(css, /url\('\.\/img\/intro-title\.png'\)/);
});
