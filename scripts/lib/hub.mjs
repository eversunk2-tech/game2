/** 게임 모음(허브) 페이지 HTML. 빌드(dist/index.html)와 개발 서버(/)가 함께 쓴다. */

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function card(game, href) {
  const { meta, isTemplate } = game;
  const title = isTemplate ? `새 게임 템플릿 (${game.dirName})` : meta.title;
  const tags = [meta.subject, ...(meta.grades ?? []).map((g) => `${g}학년`)].filter(Boolean);
  const status = isTemplate ? '템플릿' : meta.status;
  const facts = [
    meta.units?.join(', '),
    meta.playMinutes ? `약 ${meta.playMinutes}분` : null,
    meta.mode,
  ].filter(Boolean).join(' · ');

  return `<li><a class="hub-card" href="${escapeHtml(href)}">
  <span class="hub-tags">${tags.map((t) => `<span class="chip">${escapeHtml(t)}</span>`).join('')}${status ? `<span class="chip chip-status">${escapeHtml(status)}</span>` : ''}</span>
  <span class="hub-card-title">${escapeHtml(title)}</span>
  <span class="hub-card-summary">${escapeHtml(meta.summary ?? '')}</span>
  <span class="hub-card-meta">${escapeHtml(facts)}</span>
</a></li>`;
}

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
    <p class="eyebrow">2022 개정 교육과정 · 초등 5~6학년</p>
    <h1>${escapeHtml(title)}</h1>
    <p class="lead">게임 링크를 학생에게 나눠 주세요. 게임 하나가 HTML 파일 하나라서 내려받으면 인터넷 없이도 열 수 있어요.</p>
  </header>
  ${list}
  <footer class="hub-footer">
    <strong>선생님용 주소 옵션</strong> (게임 주소 뒤에 붙여요)
    <ul>
      <li><code>?unlock=all</code> 모든 단계 열기</li>
      <li><code>?stage=단계-id</code> 그 단계로 바로 시작</li>
      <li><code>?sound=off</code> 소리 끄고 시작</li>
      <li><code>?seed=1</code> 모두 같은 문제 순서로 시작</li>
      <li><code>?lesson=차시-id</code> 그 차시의 단계만 보이기 (차시 묶음이 있는 게임)</li>
    </ul>
    <p>학생 기록은 그 기기의 브라우저에만 남고 어디에도 전송되지 않아요.</p>
  </footer>
</div>
</body>
</html>
`;
}
