import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGames, prepareCover, validateGameMeta } from '../../scripts/lib/games.mjs';

const GAMES_DIR = fileURLToPath(new URL('../../src/games', import.meta.url));

test('모든 게임 폴더의 game.json과 필수 파일이 올바르다', async () => {
  const games = await loadGames(GAMES_DIR);
  assert.ok(games.length > 0);
  for (const game of games) assert.deepEqual(game.errors, [], `${game.dirName}: ${game.errors.join(' / ')}`);
});

test('템플릿은 기본으로 건너뛰고, includeTemplates면 맨 뒤에 온다', async () => {
  const plain = await loadGames(GAMES_DIR);
  assert.ok(plain.every((g) => !g.isTemplate));
  const all = await loadGames(GAMES_DIR, { includeTemplates: true });
  assert.equal(all.at(-1).dirName, '_template');
  assert.equal(path.basename(all.at(-1).dir), '_template');
});

test('game.json 검사가 흔한 실수를 잡는다', () => {
  const ok = {
    id: 'fraction-factory',
    title: '분수 공장',
    summary: '설명',
    subject: '수학',
    grades: [5],
    units: ['5-1 약분과 통분'],
    standards: [],
    playMinutes: 10,
    mode: '개인',
    status: '기획',
  };
  assert.deepEqual(validateGameMeta(ok, 'fraction-factory'), []);
  assert.equal(validateGameMeta(ok, 'other-dir').length, 1);
  assert.equal(validateGameMeta({ ...ok, id: 'Fraction_Factory' }, 'Fraction_Factory').length, 1);
  assert.equal(validateGameMeta({ ...ok, grades: [4] }, 'fraction-factory').length, 1);
  assert.equal(validateGameMeta({ ...ok, mode: '팀' }, 'fraction-factory').length, 1);
  assert.equal(validateGameMeta({ ...ok, status: 'done' }, 'fraction-factory').length, 1);
  assert.equal(validateGameMeta({ ...ok, units: [] }, 'fraction-factory').length, 1);
  // color는 선택 필드: 있으면 #rrggbb
  assert.deepEqual(validateGameMeta({ ...ok, color: '#2f6f5e' }, 'fraction-factory'), []);
  assert.equal(validateGameMeta({ ...ok, color: 'green' }, 'fraction-factory').length, 1);
  assert.equal(validateGameMeta({ ...ok, color: '#2f6f5e; background:url(x)' }, 'fraction-factory').length, 1);
});

test('표지 cover.svg: 게임 모음에 그대로 넣을 수 있는 그림만 받는다', async () => {
  const ok = prepareCover('<?xml version="1.0"?>\n<!-- 설명 -->\n<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="#ffd86b"/></svg>\n');
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.svg, '<svg aria-hidden="true" focusable="false" viewBox="0 0 10 10"><rect width="10" height="10" fill="#ffd86b"/></svg>');
  for (const bad of [
    '<svg><script>alert(1)</script></svg>',
    '<svg><image href="https://example.com/a.png"/></svg>',
    '<svg><rect onclick="x()"/></svg>',
    '<svg><rect style="fill:url(#g)"/></svg>',
    '<svg><linearGradient id="g"/></svg>',
    '<div>그림 아님</div>',
    // <style>은 게임 모음 전체에 적용되고 @import로 바깥 파일을 부를 수 있다 (D1 Review 3번)
    '<svg><style>@import "https://example.com/a.css"; .hub-card{display:none}</style><rect/></svg>',
    '<svg><style>rect{fill:#ffd86b}</style><rect/></svg>',
    '<svg><text>@import url(x.css)</text></svg>',
    '<svg><text>https://example.com</text></svg>',
  ]) assert.ok(prepareCover(bad).errors.length > 0, bad);
  // SVG 이름공간(xmlns="http://www.w3.org/2000/svg")은 바깥 참조가 아니다
  assert.deepEqual(prepareCover('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect/></svg>').errors, []);

  // 허용 목록(D2 Review 고치면 좋음 1): 막기 목록을 피하던 길과 흔한 공격 20가지를 모두 거부한다
  const S = (inner, attrs = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"${attrs}>${inner}</svg>`;
  const attacks = {
    'style @import': S('<style>@import "https://e.com/x.css";</style><rect/>'),
    'STYLE 대문자': S('<STYLE>rect{fill:red}</STYLE><rect/>'),
    'style="" url(https)': S('<rect style="fill:url(https://e.com/a.svg#g)"/>'),
    '뿌리 svg style background url': S('<rect/>', ' style="background:url(https://e.com/a.png)"'),
    'fill="url(#g)" 내부 참조': S('<rect fill="url(#g)"/>'),
    'image-set 따옴표 주소': S('<rect/>', ` style="background-image:image-set('https://e.com/a.png' 1x)"`),
    '//주소 (프로토콜 생략)': S('<rect/>', ' style="background-image:image-set(\'//e.com/a.png\' 1x)"'),
    'xlink:href': S('<a xlink:href="https://e.com"><rect/></a>'),
    'feImage href': S('<filter><feImage href="https://e.com/a.png"/></filter>'),
    script: S('<script>alert(1)</script>'),
    onload: S('<rect onload="alert(1)"/>'),
    'svg onload': S('<rect/>', ' onload="alert(1)"'),
    foreignObject: S('<foreignObject><div>x</div></foreignObject>'),
    iframe: S('<iframe src="https://e.com"></iframe>'),
    '엔티티로 숨긴 url(https)': S('<rect/>', ' style="background:u&#114;l(h&#116;tps:&#47;&#47;e.com/a.png)"'),
    '엔티티로 숨긴 주소(fill 값)': S('<rect fill="u&#114;l(h&#116;tps://e.com/x)"/>'),
    'animate로 href를 javascript:로': S('<a><text y="8">x</text><animate attributeName="href" values="javascript:alert(1)"/></a>'),
    'set으로 href 바꾸기': S('<a><text y="8">x</text><set attributeName="href" to="javascript:alert(1)"/></a>'),
    '<a> 링크': S('<a><rect width="10" height="10"/></a>'),
    'CDATA 안 script': S('<![CDATA[<script>alert(1)</script>]]>'),
    'DOCTYPE ENTITY': `<!DOCTYPE svg [<!ENTITY x "https://e.com">]>${S('<text>&x;</text>')}`,
    use: S('<use href="#a"/>'),
    '따옴표 없는 속성으로 숨기기': S('<rect fill=red onclick=alert(1) />'),
    'transform에 다른 함수': S('<rect transform="url(https://e.com)"/>'),
    'id 충돌': S('<rect id="app"/>'),
    'class로 게임 모음 꾸미기': S('<rect class="hub-card"/>'),
    'svg 두 개': `${S('<rect/>')}${S('<rect/>')}`,
    '짝이 안 맞는 태그': S('<g><rect/>'),
  };
  assert.ok(Object.keys(attacks).length >= 18);
  for (const [name, svg] of Object.entries(attacks)) {
    const r = prepareCover(svg);
    assert.ok(r.errors.length > 0, `거부하지 않음: ${name}`);
    assert.equal(r.svg, null, name);
  }
  // 받는 것만으로 새로 쓰므로, 통과한 표지에는 위험한 글자가 없다 (글자 안의 <·&도 이스케이프)
  const good = prepareCover(S('<g transform="rotate(-4 5 5)" font-family="\'Do Hyeon\', sans-serif"><rect width="4" height="4" rx="1" fill="#ffd86b" stroke="#1e2140" stroke-width="0.5"/><text x="5" y="8" text-anchor="middle">1 &lt; 2</text></g><title>표지</title>'));
  assert.deepEqual(good.errors, []);
  assert.doesNotMatch(good.svg, /style|href|on\w+=|url\(|<script|&#/i);
  assert.match(good.svg, /<text x="5" y="8" text-anchor="middle">1 &lt; 2<\/text>/);
  assert.match(good.svg, /^<svg aria-hidden="true" focusable="false" xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 10 10">/);

  // 지금 게임의 표지는 모두 통과하고 loadGames가 읽어 둔다
  const games = await loadGames(GAMES_DIR);
  for (const game of games.filter((g) => g.cover)) assert.match(game.cover, /^<svg aria-hidden="true"/, game.dirName);
  assert.ok(games.some((g) => g.cover), '표지가 있는 게임이 하나 이상');
});
