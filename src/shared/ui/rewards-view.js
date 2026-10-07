/**
 * 솜씨 점수·칭호·도장·도감을 그리는 작은 부품 (app.js가 쓴다).
 * 제목 글꼴(Do Hyeon)로 그리는 자리에는 글꼴에 없는 기호(가운뎃점 · 등)를 쓰지 않는다.
 */
import { h } from './dom.js';
import { ICONS, icon, starIcon } from './icons.js';

/** 없는 아이콘 이름이면 그림 없이(게임이 준 이름이 틀려도 화면은 그려지게) */
export function safeIcon(name, opts) {
  return name && ICONS[name] ? icon(name, opts) : null;
}

/** 점수 막대. ratio 0~1. from을 주면 연출 때 그 비율에서 채우기 시작한다(--from) */
export function xpBar(ratio, { from = null, label = null } = {}) {
  const r = Math.max(0, Math.min(1, Number(ratio) || 0));
  const fill = h('span', { class: 'xp-fill', style: { width: `${Math.round(r * 1000) / 10}%` } });
  if (from != null && r > 0) fill.style.setProperty('--from', String(Math.max(0, Math.min(1, from / r))));
  return h('span', {
    class: 'xp-bar',
    role: 'progressbar',
    'aria-valuemin': '0',
    'aria-valuemax': '100',
    'aria-valuenow': String(Math.round(r * 100)),
    'aria-label': label ?? '다음 칭호까지',
  }, fill);
}

/** 머리 오른쪽 칭호 칩: 도장 + "새싹 32점" */
export function rankChip(rank) {
  return h('p', { class: 'rank-chip' },
    h('span', { class: 'rank-seal', 'aria-hidden': 'true' }, icon('stamp')),
    h('span', { class: 'rank-name' }, rank.name),
    h('small', null, `${rank.xp}점`),
  );
}

/** 칭호 도장 (size px) */
export function rankStamp(rank, { caption = '내 칭호', size = 74, extraClass = '' } = {}) {
  const el = h('span', { class: `stamp rank-stamp ${extraClass}`.trim(), 'aria-hidden': 'true' },
    h('span', { class: 'stamp-inner' }, h('small', null, caption), h('b', null, rank.name)),
  );
  el.style.setProperty('--size', `${size}px`);
  return el;
}

/** 다음 칭호 안내 글 */
export function nextRankText(rank) {
  return rank.next ? [`다음 칭호 `, h('b', null, rank.next.name), `까지 ${rank.toNext}점`] : ['가장 높은 칭호예요!'];
}

/**
 * 처음 화면 "내 공방" 카드: 칭호 도장, 다음 칭호까지 점수 막대, 별·도감·도장 수
 * info: { rank, stars: { total, max }, collection: { count, total } | null, badges: { count, total } }
 */
export function workshopCard({ rank, stars, collection, badges }) {
  const chip = (iconEl, text) => h('span', { class: 'chip chip-ink' }, iconEl, text);
  return h('section', { class: 'sheet tape workshop-card', 'aria-label': '내 공방' },
    rankStamp(rank),
    h('div', { class: 'workshop-main' },
      h('h3', { class: 'workshop-title' }, rank.name, h('small', null, `칭호 ${rank.index + 1} / ${rank.count}`)),
      h('p', { class: 'workshop-next' }, nextRankText(rank), ' · 맞히고, 다시 도전하고, 새로 찾을 때 점수가 쌓여요'),
      xpBar(rank.progress, { label: rank.next ? `다음 칭호 ${rank.next.name}까지` : '가장 높은 칭호' }),
    ),
    h('div', { class: 'workshop-meta' },
      chip(starIcon(true), `별 ${stars.total} / ${stars.max}`),
      collection && chip(icon('book'), `도감 ${collection.count} / ${collection.total}`),
      chip(icon('stamp'), `도장 ${badges.count} / ${badges.total}`),
    ),
  );
}

/**
 * 결과 화면 오른쪽 칭호 카드
 * { before, after(rankOf 결과), gained(이번 판 점수) }
 */
export function rankCard({ before, after, gained }) {
  const up = after.index > before.index;
  // 같은 칭호 안에서 늘었으면 막대를 이전 값에서 채우고, 칭호가 올랐으면 0에서 채운다
  const from = up ? 0 : before.progress;
  return h('section', { class: `sheet rank-card reward-early${up ? ' is-up' : ''}` },
    h('div', { class: 'rank-up' },
      rankStamp(after, { caption: up ? '새 칭호' : '내 칭호', size: 84, extraClass: 'rank-seal-big' }),
      h('div', { class: 'rank-text' },
        up && h('span', { class: 'chip chip-butter reward-pop' }, '칭호가 올랐어요'),
        h('p', { class: 'rank-line' }, up ? [before.name, ' ', icon('arrow'), ' ', after.name, '!'] : after.name),
        h('p', { class: 'rank-gain' }, '이번에 모은 솜씨 점수 ', h('b', { class: 'xp-gain' }, `+${gained}`)),
      ),
    ),
    xpBar(after.progress, { from, label: after.next ? `다음 칭호 ${after.next.name}까지` : '가장 높은 칭호' }),
    h('p', { class: 'rank-foot' }, `솜씨 점수 ${after.xp}`, after.next ? ` · 다음 칭호 '${after.next.name}'까지 ${after.toNext}점` : ' · 가장 높은 칭호예요'),
  );
}

/** 도장 하나의 그림 (받은 것은 빨간 도장 + 아이콘, 못 받은 것은 점선 원 + ?) */
export function badgeSeal(def, earned, size = 70) {
  const el = h('span', { class: `stamp badge-seal${earned ? '' : ' is-locked'}`, 'aria-hidden': 'true' },
    earned ? (safeIcon(def.icon, { class: 'stamp-icon' }) ?? h('b', null, '★')) : h('b', null, '?'),
  );
  el.style.setProperty('--size', `${size}px`);
  return el;
}

/** 결과 화면: 새로 받은 도장 카드 */
export function newBadgeCard(defs) {
  const shown = defs.slice(0, 3);
  return h('section', { class: 'sheet new-badge reward-pop' },
    h('h3', null, '새 도장을 받았어요'),
    h('ul', { class: 'new-badge-list' }, shown.map((def) => h('li', null,
      badgeSeal(def, true, 58),
      h('span', null, h('b', null, def.title), h('small', null, def.desc)),
    ))),
    defs.length > shown.length && h('p', { class: 'muted' }, `도장 ${defs.length - shown.length}개를 더 받았어요. 학습 기록에서 볼 수 있어요.`),
  );
}

/** 학습 기록: 도장판 (모든 도장이 처음부터 "어떻게 받는지" 보인다) */
export function badgeBoard(defs, earned) {
  const count = defs.filter((d) => earned[d.id]).length;
  return h('section', { class: 'sheet badge-board', 'aria-labelledby': 'badge-board-title' },
    h('div', { class: 'badge-head' },
      h('h3', { id: 'badge-board-title' }, icon('stamp'), '도장판'),
      h('span', { class: 'muted' }, `받은 도장 ${count} / ${defs.length} · 어떤 행동으로 받는지 미리 보여요`),
    ),
    h('ul', { class: 'badge-grid' }, defs.map((def) => {
      const got = Boolean(earned[def.id]);
      return h('li', { class: `badge-item${got ? ' is-earned' : ' is-locked'}`, dataset: { badge: def.id } },
        badgeSeal(def, got),
        h('b', null, def.title),
        h('span', { class: 'badge-desc' }, def.desc),
        h('span', { class: 'sr-only' }, got ? '받았어요' : '아직 받지 않았어요'),
      );
    })),
  );
}

/** 도감 칸 하나 */
function collectionCell(item, found, isNew) {
  if (!found) {
    return h('li', { class: 'collect-cell is-missing' },
      h('span', { class: 'collect-thumb', 'aria-hidden': 'true' }, '?'),
      h('span', { class: 'sr-only' }, '아직 못 찾은 칸'),
    );
  }
  let thumb = null;
  if (typeof item.thumb === 'function') {
    try {
      thumb = item.thumb(h);
    } catch (error) {
      console.error(error);
    }
  }
  return h('li', { class: `collect-cell is-found${isNew ? ' is-new' : ''}` },
    isNew && h('span', { class: 'new-tag' }, '새로!'),
    h('span', { class: 'collect-thumb', 'aria-hidden': 'true' }, thumb ?? h('b', null, [...String(item.name)][0] ?? '')),
    h('span', { class: 'collect-name' }, item.name),
  );
}

/** 도감 하나: 제목 + 찾은 수 + 격자 */
export function collectionSection(def, status, isNew) {
  return h('section', { class: 'sheet collection', dataset: { collection: def.id } },
    h('div', { class: 'collection-head' },
      h('h3', null, icon('book'), def.title),
      h('span', { class: 'chip chip-ink' }, `${status.count} / ${status.total}`),
    ),
    def.desc && h('p', { class: 'muted collection-desc' }, def.desc),
    h('ul', { class: 'collect-grid' }, def.items.map((item) => collectionCell(item, status.found.has(item.id), isNew(item.id)))),
  );
}
