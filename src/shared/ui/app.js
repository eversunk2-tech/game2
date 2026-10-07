/**
 * 모든 학습게임이 함께 쓰는 화면 흐름 ("종이 공방" 모습).
 *
 *   처음 화면 → (놀이 방법) → 단계 선택(단계 지도) → 플레이 → 결과 → 학습 기록
 *
 * 게임은 stages(단계 목록)와 playStage(stage, ctx)만 만들면 된다.
 * 별점·잠금 해제·학습 기록 저장·소리 켜고 끄기·결과 복사는 여기서 처리한다.
 * 공통 게임 요소(솜씨 점수·칭호·연속·다시 일어서기·도장판·도감·도전 주문서·축하 연출)도 여기서 붙인다.
 * 게임이 아무것도 하지 않아도 ctx.log.answer 기록만으로 점수·도장이 붙는다.
 * 사용법: docs/engine.md · 디자인: docs/design/spec.md
 */
import {
  countMistakes,
  createLearningLog,
  formatDuration,
  formatPercent,
  formatReport,
  summarize,
} from '../core/learning-log.js';
import {
  collectItem,
  collectionStatus,
  collectionTotals,
  normalizeCollectionState,
  normalizeCollections,
} from '../core/collection.js';
import { MAX_STARS, clampStars, createProgress, starsFromAccuracy } from '../core/progress.js';
import { createRng } from '../core/random.js';
import {
  XP,
  badgeState,
  createPlayReward,
  createRewardStore,
  evaluateBadges,
  normalizeBadges,
  normalizeRanks,
  stageXp,
} from '../core/rewards.js';
import { createStorage } from '../core/storage.js';
import { splitTitleMark } from '../core/title-mark.js';
import { createSfx } from './audio.js';
import { createConfetti, isLowFx, prefersReducedMotion, runCelebration } from './celebrate.js';
import { clear, h } from './dom.js';
import { createFeedback } from './feedback.js';
import { icon, starIcon } from './icons.js';
import {
  badgeBoard,
  collectionSection,
  newBadgeCard,
  rankCard,
  rankChip,
  safeIcon,
  workshopCard,
} from './rewards-view.js';

/**
 * 교사용 주소 옵션
 *   ?unlock=all   모든 단계 열기 (시범 보이기, 특정 단계만 수업)
 *   ?stage=<id>   그 단계로 바로 시작
 *   ?sound=off    소리 끄고 시작
 *   ?seed=<값>    모두 같은 문제 순서로 시작
 *   ?lesson=<id>  그 차시 묶음의 단계만 보이기 (게임이 lessons를 쓸 때)
 *   ?fx=low       효과 줄이기: 색종이·화면 움직임 끔 (느린 기기. CPU 코어 2개 이하면 자동)
 */
export function readUrlOptions(search = globalThis.location?.search ?? '') {
  const params = new URLSearchParams(search);
  return {
    unlockAll: params.get('unlock') === 'all',
    stageId: params.get('stage'),
    lessonId: params.get('lesson'),
    sound: params.get('sound') !== 'off',
    seed: params.get('seed'),
    fx: params.get('fx'),
  };
}

/** 일반 단계를 먼저, 도전 주문서 단계(challenge: true)를 뒤에 (각각 순서는 그대로) */
const regularFirst = (list) => [...list.filter((s) => !s.challenge), ...list.filter((s) => s.challenge)];
const firstOpenId = (list) => (list.find((s) => !s.challenge) ?? list[0]).id;

/**
 * 차시 묶음(선택 기능). lessons가 없으면 단계 목록을 그대로 쓴다.
 * lessons가 있으면 단계를 차시 순서로 묶고, 차시마다 첫 단계를 처음부터 연다.
 * lessonId가 어떤 차시와 맞으면 그 차시의 단계만 쓴다(맞지 않으면 모든 차시).
 */
function planLessons(stages, lessons, lessonId) {
  if (!Array.isArray(lessons) || lessons.length === 0) {
    return { stages: regularFirst(stages), groups: null, current: null, openIds: [] };
  }
  if (lessons.some((l) => !l?.id || !l?.title)) throw new Error('createGameApp: 차시마다 id와 title이 필요해요.');
  const lessonIds = lessons.map((l) => l.id);
  if (new Set(lessonIds).size !== lessonIds.length) throw new Error('createGameApp: 차시 id가 겹쳐요.');
  const stray = stages.find((s) => !lessonIds.includes(s.lesson));
  if (stray) throw new Error(`createGameApp: 단계 ${stray.id}의 lesson이 lessons에 없어요.`);

  const groups = lessons
    .map((lesson, index) => ({ lesson, number: index + 1, stages: regularFirst(stages.filter((s) => s.lesson === lesson.id)) }))
    .filter((g) => g.stages.length > 0);
  const current = lessonId ? groups.find((g) => g.lesson.id === lessonId) ?? null : null;
  const shown = current ? [current] : groups;
  return {
    stages: shown.flatMap((g) => g.stages),
    groups: shown,
    current: current?.lesson ?? null,
    openIds: shown.map((g) => firstOpenId(g.stages)),
  };
}

/** 도장 판정용 차시 묶음: 모든 차시(보이지 않는 차시 포함)의 일반 단계 id. 차시가 없으면 전체가 한 묶음 */
function badgeLessons(stages, lessons) {
  const regular = (list) => list.filter((s) => !s.challenge).map((s) => s.id);
  if (!Array.isArray(lessons) || lessons.length === 0) return [{ id: null, ids: regular(stages) }];
  return lessons.map((l) => ({ id: l.id, ids: regular(stages.filter((s) => s.lesson === l.id)) }));
}

/** 결과 화면 "오늘의 솜씨" 기본 칸: 답 기록에서 만든다(맞힘, 다시 일어서기, 연속) + 새로 찾음·설명 */
export function defaultHighlights(summary) {
  const a = summary.answers;
  const list = [];
  if (a.attempts > 0) list.push({ icon: 'target', label: '처음에 맞힘', value: `${a.firstTry} / ${a.items}`, xp: a.firstTry * XP.first });
  if (summary.discover.count > 0) list.push({ icon: 'book', label: '새로 찾음', value: `${summary.discover.count}가지`, xp: summary.discover.xp });
  if (summary.explain.count > 0) list.push({ icon: 'bulb', label: '설명 맞힘', value: `${summary.explain.count}번`, xp: summary.explain.xp });
  if (a.attempts > 0) {
    list.push({ icon: 'rise', label: '다시 일어서기', value: `${a.retryFix + a.bounce}번`, xp: a.retryFix * XP.retry + a.bounce * XP.bounce });
    list.push({ icon: 'spark', label: '연속 최고', value: `${a.bestStreak}번`, xp: a.streakBonus * XP.streakBonus });
  }
  return list;
}

/** 결과 화면의 단계 완료·별 점수 줄 */
export function stageXpLine(sx, { challenge = false } = {}) {
  const parts = [];
  if (sx.clearXp) parts.push(`${challenge ? '도전 성공' : '단계 완료'} +${sx.clearXp}`);
  if (sx.starXp) parts.push(`별 ${sx.newStars}개 +${sx.starXp}`);
  if (parts.length === 0) parts.push('단계 완료·별 점수는 별이 처음 늘 때만 받아요');
  parts.push('빨리 푼 시간에는 점수가 없어요');
  return parts.join(' · ');
}

/** 시간 재기 결과 문장 (점수 없음) */
export function timeRecordText({ ms, prevMs }) {
  const now = formatDuration(ms);
  if (prevMs == null) return `내 기록 ${now} (첫 기록이에요)`;
  const diff = Math.round((prevMs - ms) / 1000);
  if (diff > 0) return `내 기록 ${now} (지난번보다 ${formatDuration(diff * 1000)} 빨라요)`;
  return `내 기록 ${now} (가장 좋은 기록은 ${formatDuration(prevMs)})`;
}

function defaultSubtitle(game) {
  const parts = [];
  if (game.grades?.length) parts.push(game.grades.map((g) => `${g}학년`).join('·'));
  if (game.subject) parts.push(game.subject);
  if (game.units?.length) parts.push(game.units.join(', '));
  return parts.join(' · ');
}

/** 학년 칩 글자: "5·6학년 수학" */
export function gradeLabel(game) {
  const grades = game.grades?.length ? `${game.grades.join('·')}학년` : '';
  return [grades, game.subject].filter(Boolean).join(' ');
}

/**
 * 단계 카드 상태: 'done'(마침) · 'now'(지금 할 곳: 열린 단계 중 아직 안 한 첫 단계) · 'open' · 'locked'
 * ids는 한 묶음(차시)의 단계 순서.
 */
export function stageStates(ids, { isUnlocked, getStars }) {
  const states = {};
  let nowGiven = false;
  for (const id of ids) {
    if (!isUnlocked(id)) states[id] = 'locked';
    else if (getStars(id) > 0) states[id] = 'done';
    else if (!nowGiven) {
      states[id] = 'now';
      nowGiven = true;
    } else states[id] = 'open';
  }
  return states;
}

/**
 * 결과 화면의 별 기준 안내. 정답률로 별을 정했을 때만(fromAccuracy) 몇 번 더 맞히면 별이 늘어나는지 알려 준다.
 * 별 기준은 starsFromAccuracy의 기본값과 같다: 90% 이상 ★3, 70% 이상 ★2 (core/progress.js)
 */
export function starHint({ stars, attempts, correct, cleared = true, fromAccuracy = true }) {
  if (!cleared) return '까닭을 다시 살펴보고 한 번 더 해 봐요.';
  if (stars >= MAX_STARS) return '별 3개를 모두 받았어요!';
  if (!fromAccuracy || !attempts) return null;
  const next = stars + 1;
  const need = next >= 3 ? 0.9 : 0.7;
  const more = Math.max(1, Math.ceil(need * attempts - correct - 1e-9));
  return more === 1 ? `한 번만 더 맞히면 별 ${next}개!` : `${more}번 더 맞히면 별 ${next}개!`;
}

const STAMP_WORDS = { 3: ['참', '잘했어요'], 2: ['잘했어요'], 1: ['끝까지', '했어요'], 0: ['다시', '해 봐요'] };
// 제목 글꼴(Do Hyeon)로 그리는 자리의 구분 기호. 가운뎃점(U+00B7)은 글꼴에 없어 기기 글꼴로 섞여 그려진다.
const DISPLAY_DOT = 'ㆍ';

const isColor = (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

function starsEl(count, extraClass = '') {
  const stars = [];
  for (let i = 0; i < MAX_STARS; i += 1) stars.push(starIcon(i < count));
  return h('span', { class: `stars ${extraClass}`.trim(), role: 'img', 'aria-label': `별 ${MAX_STARS}개 중 ${count}개` }, stars);
}

function formatDateTime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // file:// 로 열었거나 권한이 없을 때
  }
  try {
    const area = h('textarea', { readonly: true, style: { position: 'fixed', top: '0', opacity: '0' } });
    area.value = text;
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/** heroArt가 없을 때 처음 화면 오른쪽 그림: 게임 색 매트 위에 색종이 몇 장과 게임 이름 첫 글자 */
function defaultHeroArt(game) {
  return h('div', { class: 'hero-papers' },
    h('span', { class: 'paper paper-1' }),
    h('span', { class: 'paper paper-2' }),
    h('span', { class: 'paper paper-3' }, h('b', null, [...String(game.title).trim()][0] ?? '')),
  );
}

export function createGameApp({
  root,
  game,
  stages: allStages,
  playStage,
  howTo = [],
  lessons = null,
  heroArt = null,
  rewards: rewardOptions = null,
  collections: collectionDefs = null,
  options = readUrlOptions(),
}) {
  if (!root) throw new Error('createGameApp: root 요소가 필요해요.');
  if (!game?.id || !game?.title) throw new Error('createGameApp: game.id와 game.title이 필요해요.');
  if (!Array.isArray(allStages) || allStages.length === 0) throw new Error('createGameApp: stages가 비어 있어요.');
  if (typeof playStage !== 'function') throw new Error('createGameApp: playStage 함수가 필요해요.');
  if (heroArt != null && typeof heroArt !== 'function') throw new Error('createGameApp: heroArt는 (h) => 요소 함수예요.');
  const allIds = allStages.map((s) => s.id);
  if (new Set(allIds).size !== allIds.length) throw new Error('createGameApp: 단계 id가 겹쳐요.');
  if (rewardOptions != null && typeof rewardOptions !== 'object') throw new Error('createGameApp: rewards는 { ranks, thresholds, badges, off } 객체예요.');

  // 공통 게임 요소 설정 (rewards.off면 점수·칭호·도장을 모두 숨긴다)
  const rewardsOn = !rewardOptions?.off;
  const rankConfig = normalizeRanks({
    ...(rewardOptions?.ranks ? { ranks: rewardOptions.ranks } : {}),
    ...(rewardOptions?.thresholds ? { thresholds: rewardOptions.thresholds } : {}),
  });
  const badgeDefs = normalizeBadges(rewardOptions?.badges ?? []);
  const collections = normalizeCollections(collectionDefs);

  // 이번에 보이는 단계 (차시 묶음이면 차시 순서, ?lesson=이면 그 차시만. 묶음마다 일반 단계 먼저, 도전 주문서는 뒤)
  const plan = planLessons(allStages, lessons, options.lessonId);
  const { stages } = plan;
  const stageIds = stages.map((s) => s.id);
  const groups = plan.groups ?? [{ lesson: null, number: null, stages }];
  const regularOf = (list) => list.filter((s) => !s.challenge);
  const challengesOf = (list) => list.filter((s) => s.challenge);
  /** 단계 번호: 차시마다 1단계부터(일반 단계만). 도전 주문서는 번호가 없다 */
  const stageNumber = (stage) => {
    if (stage.challenge) return null;
    const group = groups.find((g) => g.stages.includes(stage));
    return regularOf(group ? group.stages : stages).indexOf(stage) + 1;
  };
  const optionalIds = stages.filter((s) => s.challenge).map((s) => s.id);

  const storage = createStorage(game.id);
  const progress = createProgress({ stageIds, storage, unlockAll: options.unlockAll, openIds: plan.openIds, optionalIds });
  const log = createLearningLog({ storage });
  const sfx = createSfx({ storage, enabled: options.sound });
  const rewardStore = createRewardStore({ storage, ...rankConfig });
  let collectionState = normalizeCollectionState(storage.get('collections', null), collections);
  const foundThisVisit = new Set(); // 도감 화면의 "새로!" 꼬리표 (이번에 열어 둔 동안 찾은 칸)
  const lessonsForBadges = badgeLessons(allStages, lessons);
  const lowFx = isLowFx({ fx: options.fx });
  const quietFx = () => lowFx || prefersReducedMotion();

  const soundButton = h('button', {
    type: 'button',
    class: 'btn btn-small btn-sound',
    onclick: () => {
      sfx.setMuted(!sfx.isMuted());
      renderSoundButton();
      sfx.play('click');
    },
  });
  function renderSoundButton() {
    const muted = sfx.isMuted();
    soundButton.replaceChildren(icon(muted ? 'mute' : 'sound'), muted ? '소리 끔' : '소리 켬');
  }

  // 머리 오른쪽 칭호 칩 ("새싹 32점")
  const rankSlot = h('span', { class: 'rank-slot' });
  function renderRankChip() {
    if (rewardsOn) rankSlot.replaceChildren(rankChip(rewardStore.rank()));
  }

  const main = h('main', { class: 'screen-host' });
  root.classList.add('edu-app');
  root.classList.toggle('fx-low', lowFx);
  if (isColor(game.color)) root.style.setProperty('--game-color', game.color);
  root.append(
    h('header', { class: 'topbar' },
      h('span', { class: 'brand' },
        h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, [...String(game.title).trim()][0] ?? ''),
        h('span', { class: 'topbar-title' }, game.title),
      ),
      h('span', { class: 'topbar-space' }),
      rewardsOn && rankSlot,
      soundButton,
    ),
    main,
  );
  const feedback = createFeedback(root);
  const confetti = createConfetti({ host: root, quiet: quietFx });

  /** 작은 축하: 색종이 8~12개 + 소리 + 화면 읽기 안내. 움직임 줄이기·?fx=low면 색종이 없이 소리·안내만 */
  const CELEBRATE_SOUNDS = { correct: 'correct', discover: 'discover', combo: 'combo', stamp: 'stamp', clear: 'clear', rankup: 'rankup', unlock: 'unlock' };
  function celebrate({ kind = 'correct', at = null, text = '', count = 10 } = {}) {
    const made = confetti.burst({ at, count: Math.min(12, Math.max(8, Math.floor(Number(count) || 10))) });
    if (CELEBRATE_SOUNDS[kind]) sfx.play(CELEBRATE_SOUNDS[kind]);
    if (text) feedback.announce(text);
    return made;
  }

  let cleanup = null; // playStage가 돌려준 정리 함수
  const screenCleanups = []; // 엔진이 화면마다 건 타이머·연출 정리
  function stopPlay() {
    const fn = cleanup;
    cleanup = null;
    const fns = [fn, ...screenCleanups.splice(0)].filter(Boolean);
    for (const f of fns) {
      try {
        f();
      } catch (error) {
        console.error(error);
      }
    }
  }

  function show(screen) {
    stopPlay();
    feedback.clear();
    feedback.anchor(null);
    confetti.clear();
    clear(main);
    main.append(screen);
    const heading = screen.querySelector('h1, h2');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    }
    globalThis.scrollTo?.(0, 0);
  }

  /** 버튼: label은 글자(접근 이름), iconName은 글자 앞(또는 after면 뒤)에 붙는 그림 */
  const button = (label, onclick, cls = 'btn', iconName = null, { after = false } = {}) => {
    const pic = iconName ? icon(iconName) : null;
    return h('button', {
      type: 'button',
      class: cls,
      onclick: () => {
        sfx.play('click');
        onclick();
      },
    }, after ? null : pic, label, after ? pic : null);
  };

  const earnedCount = () => {
    const earned = rewardStore.badges();
    return badgeDefs.filter((d) => earned[d.id]).length;
  };
  const allCollections = () => (collections.length ? collectionTotals(collectionState, collections) : null);

  function titleScreen() {
    const eyebrow = plan.current ? plan.current.title : game.subtitle ?? defaultSubtitle(game);
    const grade = gradeLabel(game);
    const { before, mark, after } = splitTitleMark(game.title);
    let art = null;
    if (heroArt) {
      try {
        art = heroArt(h);
      } catch (error) {
        console.error(error);
      }
    }
    return h('section', { class: 'screen screen-title hero' },
      h('div', { class: 'hero-copy' },
        (eyebrow || grade) && h('div', { class: 'title-chips' },
          eyebrow && h('p', { class: 'eyebrow' }, eyebrow),
          grade && !String(eyebrow).includes('학년') && h('span', { class: 'chip chip-ink' }, grade),
        ),
        h('h1', { class: 'title-main' }, before, h('span', { class: 'mark' }, mark), after),
        game.summary && h('p', { class: 'lead' }, game.summary),
        h('div', { class: 'actions' },
          button('시작하기', () => show(stageSelectScreen()), 'btn btn-primary btn-lg', 'play', { after: true }),
          howTo.length > 0 && button('놀이 방법', () => show(howToScreen())),
          button('학습 기록', () => show(reportScreen())),
        ),
        rewardsOn && workshopCard({
          rank: rewardStore.rank(),
          stars: { total: progress.totalStars(), max: progress.maxStars },
          collection: allCollections(),
          badges: { count: earnedCount(), total: badgeDefs.length },
        }),
      ),
      h('div', { class: 'hero-art', 'aria-hidden': 'true' },
        h('div', { class: `hero-mat${art ? ' has-art' : ''}` }, art ?? defaultHeroArt(game)),
        h('span', { class: 'scrap scrap-1' }),
        h('span', { class: 'scrap scrap-2' }),
        h('span', { class: 'scrap scrap-3' }),
        h('span', { class: 'ruler' }),
      ),
    );
  }

  function howToScreen() {
    return h('section', { class: 'screen screen-howto' },
      h('h2', null, '놀이 방법'),
      h('ol', { class: 'sheet howto-list' }, howTo.map((step, i) => h('li', null,
        h('span', { class: 'howto-no', 'aria-hidden': 'true' }, String(i + 1)),
        h('span', null, step),
      ))),
      h('div', { class: 'actions actions-start' },
        button('시작하기', () => show(stageSelectScreen()), 'btn btn-primary btn-lg', 'play', { after: true }),
        button('처음 화면', () => show(titleScreen()), 'btn', 'home'),
      ),
    );
  }

  const STATE_TEXT = { done: ['check', '마쳤어요'], now: ['flag', '지금 할 곳'] };

  function stageCard(stage, number, state) {
    const locked = state === 'locked';
    let thumb = null;
    if (typeof stage.thumb === 'function') {
      try {
        thumb = stage.thumb(h);
      } catch (error) {
        console.error(error);
      }
    }
    const status = STATE_TEXT[state];
    return h('li', null,
      state === 'now' && h('span', { class: 'flag', 'aria-hidden': 'true' }, '여기부터!'),
      h('button', {
        type: 'button',
        class: `stage-card is-${state}`,
        disabled: locked,
        onclick: () => {
          sfx.play('click');
          startStage(stage);
        },
      },
        h('span', { class: 'stage-top' },
          h('span', { class: 'stage-medal', 'aria-hidden': 'true' }, locked ? icon('lock') : String(number)),
          h('span', { class: 'stage-meta' },
            h('span', { class: 'stage-number' }, `${number}단계`),
            status && h('span', { class: 'stage-state' }, icon(status[0]), status[1]),
          ),
          thumb && h('span', { class: 'stage-thumb', 'aria-hidden': 'true' }, thumb),
        ),
        h('span', { class: 'stage-title' }, stage.title),
        stage.goal && h('span', { class: 'stage-goal' }, stage.goal),
        h('span', { class: 'stage-foot' },
          locked
            ? h('span', { class: 'stage-lock' }, icon('lock'), '앞 단계를 마치면 열려요')
            : starsEl(progress.getStars(stage.id)),
          state === 'now' && h('span', { class: 'go-pill', 'aria-hidden': 'true' }, '시작', icon('play')),
        ),
      ),
    );
  }

  function stagePath(list) {
    const states = stageStates(list.map((s) => s.id), progress);
    return h('ol', { class: 'stage-path' }, list.map((stage, i) => stageCard(stage, i + 1, states[stage.id])));
  }

  /** 도전 주문서 카드: 차시의 일반 단계를 모두 마치면 열린다. 선택 활동이라 다음 단계를 막지 않는다 */
  function challengeCard(stage) {
    const locked = !progress.isUnlocked(stage.id);
    const stars = progress.getStars(stage.id);
    const best = rewardStore.best(stage.id);
    return h('li', null,
      h('button', {
        type: 'button',
        class: `stage-card challenge-card is-${locked ? 'locked' : stars > 0 ? 'done' : 'open'}`,
        disabled: locked,
        onclick: () => {
          sfx.play('click');
          startStage(stage);
        },
      },
        h('span', { class: 'stamp challenge-seal', 'aria-hidden': 'true' }, h('b', null, '도전')),
        h('span', { class: 'challenge-body' },
          h('span', { class: 'stage-title' }, stage.title),
          stage.goal && h('span', { class: 'stage-goal' }, stage.goal),
          h('span', { class: 'stage-foot' },
            locked ? h('span', { class: 'stage-lock' }, icon('lock'), '차시를 마치면 열려요') : starsEl(stars),
            best != null && h('span', { class: 'chip' }, icon('clock'), `내 기록 ${formatDuration(best)}`),
          ),
        ),
      ),
    );
  }

  function challengeRow(list) {
    if (list.length === 0) return null;
    return h('div', { class: 'challenge-row' },
      h('div', { class: 'challenge-label' },
        h('b', null, icon('stamp'), '도전 주문서'),
        h('span', null, '차시를 마치면 열려요'),
        h('span', null, '하고 싶은 사람만 · 시간 제한 없음'),
      ),
      h('ul', { class: 'challenge-list' }, list.map(challengeCard)),
    );
  }

  /** 도감 칩: lesson이 맞는 도감은 그 차시 머리에, 나머지(차시 없음·안 보이는 차시)는 화면 머리에 */
  function collectionChip(lessonId, cls = 'chip') {
    const shown = (c) => plan.groups?.some((g) => g.lesson.id === c.lesson);
    const defs = collections.filter((c) => (lessonId === null ? !shown(c) : c.lesson === lessonId));
    if (defs.length === 0) return null;
    const t = collectionTotals(collectionState, defs);
    return h('span', { class: cls }, icon('book'), `도감 ${t.count} / ${t.total}`);
  }

  function stageSelectScreen() {
    const minutes = game.playMinutes ? h('span', { class: 'chip' }, icon('clock'), `약 ${game.playMinutes}분`) : null;
    return h('section', { class: 'screen screen-stages' },
      h('div', { class: 'screen-head' },
        h('h2', null, '단계를 골라요'),
        h('div', { class: 'head-chips' },
          collectionChip(null, 'chip chip-ink chip-lg'),
          h('p', { class: 'chip chip-ink chip-lg star-total' }, starIcon(true), `모은 별 ${progress.totalStars()} / ${progress.maxStars}`),
        ),
      ),
      plan.groups
        ? plan.groups.map((g) => h('section', { class: 'sheet lesson-group', dataset: { lesson: g.lesson.id } },
          h('div', { class: 'lesson-head' },
            h('span', { class: 'lesson-no' }, `${g.number}차시`),
            h('h3', { class: 'lesson-title' }, g.lesson.title),
            h('span', { class: 'lesson-chips' }, collectionChip(g.lesson.id), minutes && minutes.cloneNode(true)),
          ),
          stagePath(regularOf(g.stages)),
          challengeRow(challengesOf(g.stages)),
        ))
        : h('section', { class: 'sheet stage-board' }, stagePath(regularOf(stages)), challengeRow(challengesOf(stages))),
      h('div', { class: 'actions actions-start' }, button('처음 화면', () => show(titleScreen()), 'btn', 'home')),
    );
  }

  /** m:ss (시간 재기 시계) */
  const clockText = (ms) => {
    const total = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  };

  function startStage(stage) {
    const area = h('div', { class: 'play-area' });
    const meta = h('div', { class: 'play-meta' });
    const chipText = stage.chip ?? (stage.challenge ? '도전 주문서' : `${stageNumber(stage)}단계`);
    show(h('section', { class: `screen screen-play${stage.challenge ? ' is-challenge' : ''}` },
      h('div', { class: 'play-header' },
        button('← 단계 선택', () => {
          log.cancelStage();
          show(stageSelectScreen());
        }, 'btn btn-small btn-back'),
        h('div', { class: 'play-header-text' },
          h('div', { class: 'play-title-row' },
            h('h2', { class: 'play-title' }, stage.title),
            chipText !== stage.title && h('span', { class: 'chip chip-butter play-chip' }, chipText),
          ),
          stage.goal && h('p', { class: 'play-goal' }, stage.goal),
        ),
        // 시간 재기(도전 주문서, 켜는 학생만) · 연속 · 이번 판 솜씨 점수
        meta,
      ),
      area,
    ));

    log.startStage(stage);
    const startedAt = Date.now();
    const play = createPlayReward();
    const startXp = rewardStore.xp();
    const timers = [];
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    screenCleanups.push(() => timers.forEach((t) => {
      clearTimeout(t);
      clearInterval(t);
    }));
    let finished = false;

    // 시간 재기 (점수 없음): 첫 답 전에만 켤 수 있고, 켜면 머리에 걸린 시간이 보인다
    let timerOn = false;
    let timerToggle = null;
    if (stage.timer === 'optional') {
      const clock = h('b', { class: 'timer-clock', hidden: true }, '0:00');
      timerToggle = h('button', {
        type: 'button',
        class: 'btn btn-small timer-toggle',
        'aria-pressed': 'false',
        onclick: () => {
          if (log.currentStats().attempts > 0) return;
          timerOn = !timerOn;
          timerToggle.setAttribute('aria-pressed', String(timerOn));
          clock.hidden = !timerOn;
          clock.textContent = clockText(Date.now() - startedAt);
          sfx.play('click');
        },
      }, icon('clock'), '시간 재기');
      timers.push(setInterval(() => {
        if (timerOn && !finished) clock.textContent = clockText(Date.now() - startedAt);
      }, 1000));
      meta.classList.add('has-timer');
      meta.append(h('span', { class: 'meta-box meta-timer' }, timerToggle, clock));
    }

    const streakText = h('b', null, '');
    const streakBox = h('span', { class: 'meta-box meta-streak', hidden: true }, icon('spark'), streakText);
    const xpText = h('b', null, '+0');
    if (rewardsOn) meta.append(streakBox, h('span', { class: 'meta-box meta-xp' }, h('small', null, '솜씨 점수'), xpText));
    function updateMeta() {
      if (!rewardsOn) return;
      xpText.textContent = `+${play.xp()}`;
      const n = play.streak();
      streakBox.hidden = n < 2;
      streakText.textContent = `연속 ${n}`;
    }

    const collectionsCtx = {
      collect(id, itemId) {
        const r = collectItem(collectionState, collections, id, itemId, { at: Date.now(), stage: stage.id });
        if (!r.known) return { isNew: false, count: r.count, total: r.total };
        if (r.isNew) {
          collectionState = r.state;
          storage.set('collections', collectionState);
          foundThisVisit.add(`${id}:${r.item.id}`);
          if (rewardsOn) {
            // 새로 찾음 +5는 칸과 함께 바로 저장한다(같은 칸으로 다시 받을 수 없다)
            const xp = finished ? XP.discover : play.discovered();
            rewardStore.addXp(xp);
            rewardStore.addCounters({ discover: 1 });
            renderRankChip();
            updateMeta();
          }
          sfx.play('discover');
          feedback.announce(`새로 찾았어요: ${r.item.name} (${r.count} / ${r.total})`);
        }
        return { isNew: r.isNew, count: r.count, total: r.total };
      },
      collection(id) {
        const def = collections.find((c) => c.id === id);
        if (!def) return { found: new Set(), total: 0 };
        const s = collectionStatus(collectionState, def);
        return { found: s.found, total: s.total };
      },
    };

    const ctx = {
      el: area,
      stage,
      game,
      rng: createRng(options.seed != null ? `${options.seed}:${stage.id}` : `${Date.now()}:${stage.id}`),
      log: {
        answer: (entry) => {
          if (finished) return;
          log.answer(entry);
          const step = play.answer(entry ?? {});
          if (timerToggle) timerToggle.disabled = true; // 첫 답 뒤에는 켜고 끄기를 바꾸지 않는다
          if (!rewardsOn) return;
          updateMeta();
          if (step.streakBonus) {
            feedback.mark(streakBox, 'correct');
            later(() => sfx.play('combo', Math.round(step.streak / XP.streakEvery)), 260);
          }
        },
        stats: () => log.currentStats(),
      },
      /** 학습 행동 알림: 'explain'(설명, { correct, itemId }), 'inspect'(까닭 장면을 돌려 보거나 접어 봄) */
      reward: {
        event(name, data) {
          if (finished) return 0;
          const xp = play.event(name, data);
          updateMeta();
          return rewardsOn ? xp : 0;
        },
        /** 지금 상태: 이번 판 점수, 연속, 다시 일어서기 기회, 누적 횟수(도장까지 몇 번 남았는지 보일 때) */
        peek() {
          const stored = rewardStore.counters();
          const a = play.summary().answers;
          return {
            on: rewardsOn,
            xp: play.xp(),
            streak: play.streak(),
            bounceReady: play.bounceReady(),
            counters: { ...stored, bounce: stored.bounce + a.bounce, retryFix: stored.retryFix + a.retryFix },
          };
        },
      },
      collect: collectionsCtx.collect,
      collection: collectionsCtx.collection,
      streak: () => play.streak(),
      feedback: { ...feedback, celebrate },
      sfx,
      h,
      /**
       * 단계를 끝낸다. stars를 생략하면 정답률로 정한다. 실패면 { cleared: false }.
       * highlights: [{ icon, label, value, xp }]로 결과의 "오늘의 솜씨" 칸을 게임이 채울 수 있다(보여 주기만).
       */
      finish(result = {}) {
        if (finished) return;
        finished = true;
        const cleared = result.cleared ?? true;
        const fromAccuracy = result.stars == null;
        const stars = cleared ? clampStars(result.stars ?? starsFromAccuracy(log.currentStats().accuracy)) : 0;
        const prevStars = progress.getStars(stage.id);
        const lockedBefore = optionalIds.filter((id) => !progress.isUnlocked(id));
        const record = log.endStage({ stars, cleared });
        progress.record(stage.id, stars);
        const opened = lockedBefore.filter((id) => progress.isUnlocked(id));
        const reward = rewardsOn ? settleRewards({ stage, play, prevStars, stars, cleared, startXp }) : null;
        const time = stage.timer === 'optional' && timerOn && cleared ? rewardStore.recordTime(stage.id, record.durationMs) : null;
        sfx.play(cleared ? 'clear' : 'wrong');
        renderRankChip();
        showResult(stage, record, { fromAccuracy, reward, highlights: result.highlights, opened, time });
      },
    };

    try {
      const result = playStage(stage, ctx);
      if (typeof result === 'function') {
        if (finished) result();
        else cleanup = result;
      }
    } catch (error) {
      console.error(error);
      area.append(h('p', { class: 'panel panel-error' }, '게임을 준비하다가 문제가 생겼어요. 선생님께 알려 주세요.'));
    }
  }

  /** 단계를 마칠 때 점수·도장을 정산해 저장한다. → 결과 화면에 보일 것 */
  function settleRewards({ stage, play, prevStars, stars, cleared, startXp }) {
    const summary = play.summary();
    const a = summary.answers;
    const sx = stageXp({ prevStars, stars, cleared, challenge: Boolean(stage.challenge) });
    // 새로 찾음 점수는 칸을 찾을 때 이미 저장했다
    rewardStore.addXp(a.xp + summary.explain.xp + sx.total);
    rewardStore.addCounters({ bounce: a.bounce, retryFix: a.retryFix, explain: summary.explain.count, inspect: summary.inspect });
    const state = badgeState({
      stars: progress.allStars(),
      lessons: lessonsForBadges,
      counters: rewardStore.counters(),
      collections: Object.fromEntries(collections.map((c) => {
        const s = collectionStatus(collectionState, c);
        return [c.id, { count: s.count, total: s.total }];
      })),
      xp: rewardStore.xp(),
      play: { stageId: stage.id, attempts: a.attempts, correct: a.correct, wrong: a.wrong, firstTry: a.firstTry, cleared, stars, challenge: Boolean(stage.challenge) },
    });
    const fresh = evaluateBadges(badgeDefs, state, rewardStore.badges(), {
      onError: (error, def) => console.error(`도장 ${def.id} 판정 오류:`, error),
    });
    rewardStore.earn(fresh.map((b) => b.id));
    const before = rewardStore.rank(startXp);
    const after = rewardStore.rank();
    return { summary, sx, gained: play.xp() + sx.total, before, after, rankUp: after.index > before.index, newBadges: fresh };
  }

  function resultStamp(record, label) {
    const words = STAMP_WORDS[record.cleared ? record.stars : 0] ?? STAMP_WORDS[1];
    const d = new Date(record.startedAt ?? Date.now());
    return h('div', { class: `stamp result-stamp${record.cleared ? '' : ' stamp-blue'}`, 'aria-hidden': 'true' },
      h('span', { class: 'stamp-inner' },
        words.map((w) => h('b', null, w)),
        h('small', null, `${d.getMonth() + 1}.${d.getDate()}${DISPLAY_DOT}${label}`),
      ),
    );
  }

  /** "오늘의 솜씨" 칸: 게임이 준 highlights 또는 엔진 기본(답 기록에서) */
  function highlightTiles(list) {
    const items = (Array.isArray(list) ? list : []).filter((x) => x && x.label != null).slice(0, 5);
    if (items.length === 0) return null;
    return h('ul', { class: 'behaviors', 'aria-label': '오늘의 솜씨' }, items.map((x) => h('li', { class: 'behavior' },
      h('span', { class: 'b-top' }, safeIcon(x.icon), String(x.label)),
      x.value != null && h('span', { class: 'b-val' }, String(x.value)),
      x.xp != null && h('span', { class: 'b-xp' }, `+${Math.max(0, Math.floor(Number(x.xp) || 0))}`),
    )));
  }

  function showResult(stage, record, { fromAccuracy = true, reward = null, highlights = null, opened = [], time = null } = {}) {
    let nextStage = null;
    if (!stage.challenge) {
      const nextId = progress.nextStageId(stage.id);
      nextStage = nextId ? stages.find((s) => s.id === nextId) ?? null : null;
      // 차시 묶음이면 "다음 단계"는 같은 차시 안에서만
      if (nextStage && plan.groups && nextStage.lesson !== stage.lesson) nextStage = null;
    }
    const canGoNext = nextStage && progress.isUnlocked(nextStage.id);
    const isLast = !nextStage;
    const mistakes = countMistakes(record.answers);
    let title = '아쉬워요! 다시 해 볼까요?';
    if (record.cleared && stage.challenge) title = '도전 성공!';
    else if (record.cleared && isLast) title = plan.groups ? '이 차시를 마쳤어요!' : '모든 단계를 마쳤어요!';
    else if (record.cleared) title = '단계 성공!';
    const number = stageNumber(stage);
    const label = stage.challenge ? '도전' : `${number}단계`;
    const eyebrow = stage.challenge ? `도전 주문서 · ${stage.title}` : label === stage.title ? label : `${label} · ${stage.title}`;
    const hint = starHint({ ...record, fromAccuracy });

    const stat = (name, value) => h('div', { class: 'stat' }, h('dt', null, name), h('dd', null, value));
    const side = [
      reward && rankCard(reward),
      reward && reward.newBadges.length > 0 && newBadgeCard(reward.newBadges),
      mistakes.length > 0 && h('section', { class: 'panel review-note' },
        h('h3', null, icon('search'), '다시 살펴볼 점'),
        h('ul', null, mistakes.map((m) => h('li', null, `${m.tag} (${m.count}번)`))),
      ),
      opened.length > 0 && h('p', { class: 'chip chip-primary opened-chip reward-pop' }, icon('stamp'), `도전 주문서 ${opened.length}개가 열렸어요`),
    ].filter(Boolean);

    const screen = h('section', { class: 'screen screen-result' },
      h('div', { class: `result-wrap${side.length ? '' : ' is-single'}` },
        h('section', { class: 'sheet certificate tape' },
          h('p', { class: 'cert-eyebrow' }, eyebrow),
          h('h2', { class: 'result-title' }, title),
          resultStamp(record, label),
          starsEl(record.stars, 'stars-big'),
          hint && h('p', { class: 'star-hint' }, hint),
          reward && highlightTiles(highlights ?? defaultHighlights(reward.summary)),
          reward && h('p', { class: 'xp-line' }, stageXpLine(reward.sx, { challenge: Boolean(stage.challenge) })),
          time && h('p', { class: 'time-line' }, icon('clock'), timeRecordText(time)),
          h('dl', { class: 'result-stats' },
            stat('정답률', formatPercent(record.accuracy)),
            record.attempts ? stat('맞힘/시도', `${record.attempts}번 중 ${record.correct}번 맞힘`) : null,
            stat('걸린 시간', formatDuration(record.durationMs)),
          ),
          h('div', { class: 'actions' },
            canGoNext && button('다음 단계', () => startStage(nextStage), 'btn btn-primary btn-lg', 'play', { after: true }),
            isLast && record.cleared && button('학습 기록 보기', () => show(reportScreen()), 'btn btn-primary btn-lg'),
            button('다시 하기', () => startStage(stage), 'btn', 'undo'),
            button('단계 선택', () => show(stageSelectScreen())),
          ),
        ),
        side.length > 0 && h('div', { class: 'side-col' }, side),
      ),
    );
    show(screen);

    // 연출: 별 하나씩(CSS) → 도장 찍힘(0.6초, 쿵 + 색종이) → 점수 막대(1초) → 칭호·새 도장 카드(1.5초). 2초 안에 끝, 아무 키·누르기로 건너뜀
    const cert = screen.querySelector('.certificate');
    const steps = [{ at: 600, run: () => {
      sfx.play('stamp');
      if (record.cleared) confetti.burst({ at: cert, count: 12, spread: true });
    } }];
    if (reward?.rankUp) steps.push({ at: 1500, always: true, run: () => sfx.play('rankup') });
    else if (reward?.newBadges.length) steps.push({ at: 1500, always: true, run: () => sfx.play('stamp') });
    if (opened.length) steps.push({ at: 1750, always: !reward?.rankUp && !reward?.newBadges.length, run: () => sfx.play('unlock') });
    const run = runCelebration({ el: screen, steps, animate: !quietFx() });
    screenCleanups.push(() => run.stop());

    // 화면 읽기: 보상은 한 번 알린다 (제목은 초점으로 읽힌다)
    const said = [`별 ${MAX_STARS}개 중 ${record.stars}개`];
    if (reward) {
      said.push(`솜씨 점수 ${reward.gained}점을 모았어요`);
      if (reward.rankUp) said.push(`칭호가 올랐어요: ${reward.after.name}`);
      if (reward.newBadges.length) said.push(`새 도장: ${reward.newBadges.map((b) => b.title).join(', ')}`);
    }
    if (opened.length) said.push(`도전 주문서 ${opened.length}개가 열렸어요`);
    feedback.announce(said.join('. '));
  }

  function collectionScreen() {
    return h('section', { class: 'screen screen-collection' },
      h('div', { class: 'screen-head' },
        h('h2', null, '도감'),
        h('div', { class: 'actions' },
          button('학습 기록', () => show(reportScreen()), 'btn', 'book'),
          button('처음 화면', () => show(titleScreen()), 'btn', 'home'),
        ),
      ),
      h('p', { class: 'muted collection-note' }, '여러 가지를 새로 찾으면 칸이 채워져요. 아직 못 찾은 칸은 ?로 보여요.'),
      collections.map((def) => collectionSection(def, collectionStatus(collectionState, def), (itemId) => foundThisVisit.has(`${def.id}:${itemId}`))),
    );
  }

  function reportScreen() {
    const records = log.records();
    const summary = summarize(records);
    const regularIds = stageIds.filter((id) => !progress.isOptional(id));
    const clearedCount = regularIds.filter((id) => progress.isCleared(id)).length;
    const rank = rewardStore.rank();
    const totals = allCollections();
    const nameInput = h('input', {
      class: 'input',
      id: 'student-name',
      type: 'text',
      autocomplete: 'off',
      maxlength: '20',
      placeholder: '예: 3번 김○○',
    });

    const copyButton = button('결과 복사', async () => {
      const extra = [];
      if (rewardsOn) {
        // 결과 복사에 한 줄: "칭호: 탐험가(60점) · 도장 4개 · 도감 4/11"
        const parts = [`칭호: ${rank.name}(${rank.xp}점)`, `도장 ${earnedCount()}개`];
        if (totals) parts.push(`도감 ${totals.count}/${totals.total}`);
        extra.push(parts.join(' · '));
      } else if (totals) extra.push(`도감 ${totals.count}/${totals.total}`);
      const text = formatReport({ title: game.title, records, studentName: nameInput.value.trim(), extra });
      const ok = await copyText(text);
      feedback.info(ok ? '결과를 복사했어요. 원하는 곳에 붙여 넣으세요.' : '복사하지 못했어요. 화면을 캡처해 주세요.');
    }, 'btn btn-primary', 'copy');

    let confirming = false;
    const clearButton = button('기록 모두 지우기', () => {
      if (!confirming) {
        confirming = true;
        clearButton.replaceChildren(icon('trash'), '한 번 더 누르면 지워져요');
        clearButton.classList.add('is-confirm');
        return;
      }
      // 기록·별·솜씨 점수·도장·도감을 모두 지운다 (같은 기기를 여러 학생이 쓸 때)
      log.clear();
      progress.reset();
      rewardStore.reset();
      collectionState = normalizeCollectionState(null, collections);
      storage.set('collections', collectionState);
      foundThisVisit.clear();
      renderRankChip();
      show(reportScreen());
      feedback.info('기록을 지웠어요.');
    }, 'btn btn-small', 'trash');

    const tile = (label, value) => h('div', { class: 'tile' }, h('dt', null, label), h('dd', null, value));
    const body = records.length === 0
      ? h('p', { class: 'panel empty-note' }, '아직 기록이 없어요. 게임을 하면 여기에 쌓여요.')
      : h('div', { class: `report-row${summary.mistakes.length ? '' : ' is-single'}` },
        h('section', { class: 'panel report-records', 'aria-label': '단계별 기록' },
          h('div', { class: 'table-wrap' }, h('table', { class: 'report-table' },
            h('thead', null, h('tr', null, ['날짜', '단계', '정답률', '맞힘/시도', '걸린 시간', '별'].map((t) => h('th', { scope: 'col' }, t)))),
            h('tbody', null, records.slice().reverse().map((r) => h('tr', null,
              h('td', null, formatDateTime(r.startedAt)),
              h('td', null, r.stageTitle),
              h('td', null, formatPercent(r.accuracy)),
              h('td', null, `${r.correct}/${r.attempts}`),
              h('td', null, formatDuration(r.durationMs)),
              h('td', null, starsEl(r.stars)),
            ))),
          )),
        ),
        summary.mistakes.length > 0 && h('section', { class: 'panel mistakes' },
          h('h3', null, '자주 틀린 개념'),
          h('ol', null, summary.mistakes.slice(0, 5).map((m) => h('li', null, `${m.tag} (${m.count}번)`))),
        ),
      );

    const collectionLabel = totals
      ? `${collections.length === 1 ? collections[0].title : '도감'} ${totals.count} / ${totals.total}`
      : null;
    return h('section', { class: 'screen screen-report' },
      h('div', { class: 'screen-head' },
        h('h2', null, '학습 기록'),
        h('div', { class: 'actions' },
          collectionLabel && button(collectionLabel, () => show(collectionScreen()), 'btn btn-collection', 'book'),
          copyButton,
          button('처음 화면', () => show(titleScreen()), 'btn', 'home'),
        ),
      ),
      h('dl', { class: 'summary-tiles' },
        tile('한 판 수', `${summary.plays}번`),
        tile('전체 정답률', formatPercent(summary.accuracy)),
        tile('모은 별', `${progress.totalStars()} / ${progress.maxStars}`),
        rewardsOn ? tile('칭호·솜씨 점수', `${rank.name} ${rank.xp}점`) : tile('마친 단계', `${clearedCount} / ${regularIds.length}`),
      ),
      body,
      rewardsOn && badgeBoard(badgeDefs, rewardStore.badges()),
      h('div', { class: 'panel report-foot' },
        h('div', { class: 'field' },
          h('label', { for: 'student-name' }, '이름 (선택 · 저장되지 않고 복사할 때만 쓰여요)'),
          nameInput,
        ),
        clearButton,
      ),
    );
  }

  return {
    start() {
      renderSoundButton();
      renderRankChip();
      const direct = options.stageId ? stages.find((s) => s.id === options.stageId) : null;
      if (direct && progress.isUnlocked(direct.id)) startStage(direct);
      else show(titleScreen());
    },
    progress,
    log,
    sfx,
    rewards: rewardStore,
  };
}
