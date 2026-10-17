/**
 * 사이트의 맨 위 주소와 선생님용 안내(spec-grade6 15-13) — 빌드(scripts/build.mjs)와 개발 서버(scripts/dev.mjs)가 같이 쓴다(사용자 결정 15-13 끝: 개발용 주소도 사이트와 같게).
 *   빌드:       dist/index.html = FRONT_GAME의 게임 HTML,  dist/teacher.html = 선생님용 안내
 *   개발 서버:  /  → /games/<FRONT_GAME>/ (쿼리 그대로),     …/teacher.html → 선생님용 안내(같은 내용 — 링크만 개발 서버 주소)
 */
import { isListed } from './games.mjs';
import { COPYRIGHT, renderTeacherGuide } from './hub.mjs';

/** 사이트 맨 위 주소로 여는 게임 — 빌드는 그 게임 HTML을 index.html로도 내보내고, 개발 서버의 /는 그 게임으로 간다 */
export const FRONT_GAME = 'net-workshop';
/** 선생님용 안내 페이지 이름(게임 main.js의 teacherGuide: './teacher.html'과 같아야 한다 — tests/unit/build.test.js) */
export const GUIDE_PAGE = 'teacher.html';
/** 같은 사이트가 올라가 있는 주소(선생님용 안내에 글로만 — 학생 기록은 주소마다 따로다). 바깥 주소 검사 ①에 걸리지 않게 https://는 빼고 쓴다 */
export const SITE_ADDRESSES = ['eversunk2-tech.github.io/game2/', 'solid-figure.pages.dev'];

/**
 * 선생님용 안내 HTML. 게임 카드와 맨 위 [← 학년 고르기]는 인트로를 건너뛰는 주소(<게임 주소>?intro=0).
 * @param {object} p
 * @param {Array} p.games  loadGames() 결과(템플릿이 섞여 있어도 된다 — 목록에 보이는 게임만 고른다)
 * @param {(id: string) => string} p.gameHref  게임을 여는 주소(빌드: "<id>.html", 개발 서버: "/games/<id>/")
 * @param {{ inline?: string, links?: string[], head?: string }} p.styles
 */
export function teacherGuideHtml({ games, gameHref, styles }) {
  const front = games.find((g) => !g.isTemplate && g.meta?.id === FRONT_GAME);
  if (!front) throw new Error(`사이트 맨 위 주소로 열 게임(${FRONT_GAME})이 src/games에 없어요(scripts/lib/site.mjs FRONT_GAME).`);
  const skipIntro = (id) => `${gameHref(id)}?intro=0`;
  return renderTeacherGuide({
    games: games.filter(isListed),
    hrefFor: (g) => skipIntro(g.meta.id),
    home: { href: skipIntro(FRONT_GAME), title: front.meta.title },
    sites: SITE_ADDRESSES,
    copyright: COPYRIGHT,
    styles,
  });
}
