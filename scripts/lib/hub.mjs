/**
 * 게임 모음(허브) 페이지 HTML. 빌드(dist/index.html)와 개발 서버(/)가 함께 쓴다.
 * 모습: docs/design/spec.md 3절 "게임 모음". 게임 카드 = 표지(cover.svg 또는 게임 색 무늬 + 첫 글자) + 설명.
 * 같은 주소에서 기록을 읽을 수 있으면 "이어 하기 · 별 n개"를 보인다(작은 인라인 스크립트, 못 읽으면 그대로).
 */
import { splitTitleMark } from '../../src/shared/core/title-mark.js';
import { ICONS, STAR_PATH } from '../../src/shared/ui/icons.js';

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const COLOR = /^#[0-9a-f]{6}$/i;
// 거르기 칩은 게임이 이만큼 있을 때부터 보인다
export const FILTER_MIN_GAMES = 4;

/** 엔진 아이콘(ui/icons.js)과 같은 그림을 HTML 문자열로 */
export function iconSvg(name, cls = '') {
  const parts = ICONS[name].map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`).join('');
  return `<svg class="${`icon ${cls}`.trim()}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${parts}</svg>`;
}
const starSvg = () => `<svg class="star on" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${STAR_PATH}"/></svg>`;

function firstChar(text) {
  return [...String(text).trim()][0] ?? '';
}

function cover(game, title) {
  if (game.cover) return game.cover;
  // 표지가 없으면 게임 색 무늬 위에 첫 글자 종이
  return `<span class="cover-paper" aria-hidden="true">${escapeHtml(firstChar(title))}</span>`;
}

function card(game, href) {
  const { meta, isTemplate } = game;
  const title = isTemplate ? `새 게임 템플릿 (${game.dirName})` : meta.title;
  const grades = meta.grades ?? [];
  const tags = [meta.subject, ...grades.map((g) => `${g}학년`)].filter(Boolean);
  const status = isTemplate ? '템플릿' : meta.status;
  const units = meta.units ?? [];
  const unitText = units.length > 1 ? `${units[0]} 외 ${units.length - 1}단원` : units[0];
  const facts = [
    unitText && ['book', unitText],
    meta.playMinutes && ['clock', `약 ${meta.playMinutes}분`],
    meta.mode && ['user', meta.mode],
  ].filter(Boolean);
  const color = COLOR.test(meta.color ?? '') ? ` style="--game-color: ${meta.color}"` : '';
  const id = isTemplate ? '' : escapeHtml(meta.id);

  return `<li class="hub-item" data-subject="${escapeHtml(meta.subject ?? '')}" data-grades="${grades.join(' ')}"><a class="hub-card" href="${escapeHtml(href)}"${color}>
  <span class="hub-cover">${cover(game, title)}${status && status !== '완료' ? `<span class="status-ribbon">${escapeHtml(status)}</span>` : ''}</span>
  <span class="hub-body">
    <span class="hub-tags">${tags.map((t) => `<span class="chip">${escapeHtml(t)}</span>`).join('')}</span>
    <span class="hub-card-title">${escapeHtml(title)}</span>
    <span class="hub-card-summary">${escapeHtml(meta.summary ?? '')}</span>
    <span class="hub-card-meta">${facts.map(([icon, text]) => `<span>${iconSvg(icon)}${escapeHtml(text)}</span>`).join('')}</span>
    <span class="hub-continue">${id ? `<span class="chip chip-ink hub-progress" data-progress="${id}" hidden>${starSvg()}<span class="hub-stars"></span></span>` : ''}<span class="chip hub-fresh" hidden>아직 안 해 봤어요</span><span class="go"><span class="go-text">시작하기</span>${iconSvg('arrow')}</span></span>
  </span>
</a></li>`;
}

function filters(games) {
  if (games.length < FILTER_MIN_GAMES) return '';
  const count = (fn) => games.filter(fn).length;
  const subjects = [...new Set(games.map((g) => g.meta.subject).filter(Boolean))];
  const grades = [...new Set(games.flatMap((g) => g.meta.grades ?? []))].sort();
  const chip = (label, kind, value, n, pressed = false) =>
    `<button class="chip" type="button" aria-pressed="${pressed}" data-kind="${kind}" data-value="${escapeHtml(value)}">${escapeHtml(label)} ${n}</button>`;
  return `<div class="hub-filter" role="group" aria-label="게임 거르기">
    ${chip('전체', 'all', '', games.length, true)}
    ${subjects.map((s) => chip(s, 'subject', s, count((g) => g.meta.subject === s))).join('\n    ')}
    ${grades.map((g) => chip(`${g}학년`, 'grade', String(g), count((x) => (x.meta.grades ?? []).includes(g)))).join('\n    ')}
  </div>`;
}

// 이어 하기: 같은 주소(같은 출처)에서 게임의 별 기록(edu:<id>:stars)을 읽을 수 있을 때만 보인다.
// 칭호(edu:<id>:rewards의 rank)가 있으면 "별 5개 · 탐험가"처럼 함께 보인다(읽기만 한다).
// 거르기: 칩을 누르면 그 교과·학년 게임만 보인다.
const SCRIPT = `(function(){
try{var ls=window.localStorage;document.querySelectorAll('[data-progress]').forEach(function(el){
var id=el.getAttribute('data-progress'),raw=ls.getItem('edu:'+id+':stars'),s=raw?JSON.parse(raw):{},n=0,k;for(k in s)n+=Number(s[k])||0;
var c=el.closest('.hub-card');if(!(n>0)){c.querySelector('.hub-fresh').hidden=false;return;}
var rank='';try{var r=JSON.parse(ls.getItem('edu:'+id+':rewards')||'null');if(r&&typeof r.rank==='string')rank=r.rank;}catch(e){}
el.querySelector('.hub-stars').textContent='별 '+n+'개'+(rank?' · '+rank:'');el.hidden=false;c.querySelector('.go-text').textContent='이어 하기';});}catch(e){}
var chips=document.querySelectorAll('.hub-filter .chip');chips.forEach(function(b){b.addEventListener('click',function(){
chips.forEach(function(x){x.setAttribute('aria-pressed',String(x===b));});
var kind=b.getAttribute('data-kind'),v=b.getAttribute('data-value');
document.querySelectorAll('.hub-item').forEach(function(li){var ok=kind==='all'||(kind==='subject'?li.getAttribute('data-subject')===v:li.getAttribute('data-grades').split(' ').indexOf(v)>=0);li.hidden=!ok;});});});
})();`;

/**
 * @param {object} p
 * @param {Array} p.games   loadGames() 결과
 * @param {(game) => string} p.hrefFor  게임 링크 주소
 * @param {{ inline?: string, links?: string[] }} p.styles  인라인 CSS 또는 스타일시트 주소
 */
export function renderHub({ games, hrefFor, styles, title = '초등 5~6학년 학습게임' }) {
  const head = styles.inline != null
    ? `<style>${styles.inline}</style>`
    : (styles.links ?? []).map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`).join('\n  ');
  const list = games.length > 0
    ? `<ul class="hub-list">\n${games.map((g) => card(g, hrefFor(g))).join('\n')}\n</ul>`
    : '<p class="panel">아직 게임이 없어요.</p>';
  const { before, mark, after } = splitTitleMark(title);
  const minutes = games.map((g) => g.meta.playMinutes).filter((m) => typeof m === 'number');
  const playChip = minutes.length ? `한 판 ${Math.max(...minutes)}분 안팎` : '한 판 10분 안팎';

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <link rel="icon" href="data:,">
  ${head}
</head>
<body>
<div class="hub">
  <header class="hub-header">
    <p class="eyebrow"><span class="dot" aria-hidden="true"></span>2022 개정 교육과정 · 초등 5~6학년</p>
    <h1>${escapeHtml(before)}<span class="mark">${escapeHtml(mark)}</span>${escapeHtml(after)}</h1>
    <p class="lead">게임 링크를 학생에게 나눠 주세요. 게임 하나가 HTML 파일 하나라서 내려받으면 인터넷 없이도 열 수 있어요.</p>
    <ul class="hub-promises" aria-label="약속">
      <li class="chip chip-ink">${iconSvg('shield')}기록은 이 기기에만 남아요</li>
      <li class="chip chip-ink">${iconSvg('clock')}${escapeHtml(playChip)}</li>
      <li class="chip chip-ink">${iconSvg('user')}로그인·광고 없음</li>
    </ul>
  </header>
  ${filters(games)}
  ${list}
  <footer class="hub-footer">
    <section class="panel hub-note">
      <h2>${iconSvg('flag')}선생님용 주소 옵션 <small>게임 주소 뒤에 붙여요</small></h2>
      <ul class="opt-list">
        <li><code>?lesson=차시-id</code>그 차시만 보이기</li>
        <li><code>?unlock=all</code>모든 단계 열기</li>
        <li><code>?stage=단계-id</code>그 단계로 바로 시작</li>
        <li><code>?seed=1</code>모두 같은 문제 순서</li>
        <li><code>?sound=off</code>소리 끄고 시작</li>
        <li><code>?fx=low</code>효과 줄이기 (느린 기기)</li>
      </ul>
    </section>
    <section class="panel hub-privacy">${iconSvg('shield')}<p><b>학생 기록은 그 기기의 브라우저에만 남고 어디에도 전송되지 않아요.</b> 순위표·친구 비교가 없어요. 같은 기기를 함께 쓰면 게임의 학습 기록 화면에서 지울 수 있어요.</p></section>
  </footer>
</div>
<script>${SCRIPT}</script>
</body>
</html>
`;
}
