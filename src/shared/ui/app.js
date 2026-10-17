/**
 * 모든 학습게임이 함께 쓰는 화면 흐름 ("종이 공방" 모습).
 *
 *   (게임 인트로) → 처음 화면 → (놀이 방법) → 단계 선택(단계 지도) → 플레이 → 결과 → 학습 기록
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
  AREA_KEY,
  areaLabel,
  areaLine,
  areaOfLesson,
  gradeCardLabel,
  planAreas,
  planGrades,
  startAreaId,
  startGrade,
} from '../core/areas.js';
import {
  collectItem,
  collectionChips,
  collectionStatus,
  collectionXp,
  normalizeCollectionState,
  normalizeCollections,
  reportedQuiet,
  xpAfterCount,
} from '../core/collection.js';
import { MAX_STARS, clampStars, createProgress, starsFromAccuracy } from '../core/progress.js';
import { createRng } from '../core/random.js';
import {
  XP,
  badgeState,
  createPlayReward,
  createRewardStore,
  discoverXp,
  evaluateBadges,
  normalizeBadges,
  normalizeRanks,
  stageXp,
} from '../core/rewards.js';
import { planIntroLayout, sanitizeDpr } from '../core/intro-fit.js';
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
 *   ?area=<id>    그 영역의 단계 지도로 바로 (게임이 areas를 쓸 때. ?lesson=이 함께 오면 ?lesson=이 이긴다)
 *   ?grade=<n>    그 학년 화면으로 바로 (영역에 학년이 있을 때. ?lesson= > ?area= > ?grade=)
 *   ?fx=low       효과 줄이기: 색종이·화면 움직임 끔 (느린 기기. CPU 코어 2개 이하면 자동)
 */
export function readUrlOptions(search = globalThis.location?.search ?? '') {
  const params = new URLSearchParams(search);
  return {
    unlockAll: params.get('unlock') === 'all',
    stageId: params.get('stage'),
    lessonId: params.get('lesson'),
    areaId: params.get('area'),
    gradeId: params.get('grade'),
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

/**
 * 단계 지도의 차시 칩 글자. 차시 정의에 chip(글자)이 있으면 그것, 없으면 차시 순서대로 "n차시".
 * (한 게임에 영역이 다른 차시가 섞일 때: 예) 전개도 차시 뒤의 쌓기나무 차시에 chip: '쌓기나무 1차시')
 * useChip: false면 chip을 쓰지 않고 늘 "n차시" — 영역의 단계 지도(영역 탭이 어느 영역인지 알려 주고, n은 영역 안의 차례)
 */
export const lessonChipText = (lesson, number, { useChip = true } = {}) => (useChip && typeof lesson?.chip === 'string' && lesson.chip.trim() ? lesson.chip.trim() : `${number}차시`);

/** 차시의 시간 칩에 쓸 분: 차시 정의의 minutes(양수)가 있으면 그것, 없으면 게임의 playMinutes. 둘 다 없으면 null */
export function lessonMinutes(lesson, game) {
  const own = Number(lesson?.minutes);
  if (Number.isFinite(own) && own > 0) return own;
  return game?.playMinutes || null;
}

/** 차시 제목 옆의 짧은 말(단원 등): 차시 정의의 note(글자). 없으면 null */
export const lessonNoteText = (lesson) => (typeof lesson?.note === 'string' && lesson.note.trim() ? lesson.note.trim() : null);

/**
 * 결과 화면 "오늘의 솜씨" 기본 칸: 답 기록에서 만든다(맞힘, 다시 일어서기, 연속) + 새로 찾음·설명
 * 연습 점수가 없는 판(별 3개 단계를 다시 함, summary.practice === false)이면 연습 칸의 점수는 0.
 * 그 판에 '한 번만' 답(scored: 'once')이 있으면 그 답으로 받은 점수만 적는다(summary.paid) → 칸 점수의 합 = 이번 판 점수
 */
export function defaultHighlights(summary) {
  const a = summary.answers;
  const paid = summary.paid ?? (summary.practice === false ? {} : a); // 점수를 준 답만 센 횟수
  const n = (value) => Number(value) || 0;
  const list = [];
  if (a.attempts > 0) list.push({ icon: 'target', label: '처음에 맞힘', value: `${a.firstTry} / ${a.items}`, xp: n(paid.firstTry) * XP.first });
  if (summary.discover.count > 0) list.push({ icon: 'book', label: '새로 찾음', value: `${summary.discover.count}가지`, xp: summary.discover.xp });
  if (summary.explain.count > 0) list.push({ icon: 'bulb', label: '설명 맞힘', value: `${summary.explain.count}번`, xp: summary.explain.xp });
  if (a.attempts > 0) {
    list.push({ icon: 'rise', label: '다시 일어서기', value: `${a.retryFix + a.bounce}번`, xp: n(paid.retryFix) * XP.retry + n(paid.bounce) * XP.bounce });
    list.push({ icon: 'spark', label: '연속 최고', value: `${a.bestStreak}번`, xp: n(paid.streakBonus) * XP.streakBonus });
  }
  return list;
}

/** 별 3개 단계를 다시 할 때 결과 화면에 보이는 까닭 */
export const PRACTICE_OFF_TEXT = '별 3개를 받은 단계라 연습 점수는 없어요. 새로 찾으면 점수를 받아요.';
/** 별 3개 단계를 다시 한 판에 '한 번만' 답(scored: 'once')이 있었을 때의 까닭 (그 답은 점수를 받았다) */
export const PRACTICE_OFF_ONCE_TEXT = '별 3개를 받은 단계라 연습 점수는 없어요. 처음 해 본 것은 점수를 받았어요.';

/**
 * 연습 점수가 없는 판(별 3개 단계 다시 하기)의 결과 화면 안내 문장. 연습 점수가 있는 판이면 null.
 * custom: 게임이 ctx.finish({ practiceNote })로 준 문장(게임의 말로 바꿀 때)
 */
export function practiceNoteText(summary, custom = null) {
  if (!summary || summary.practice !== false) return null;
  if (typeof custom === 'string' && custom.trim()) return custom.trim();
  return (summary.once?.count ?? 0) > 0 ? PRACTICE_OFF_ONCE_TEXT : PRACTICE_OFF_TEXT;
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

/**
 * 결과 화면의 기록 칸 [이름, 값]. 기본은 정답률 · 맞힘/시도 · 걸린 시간.
 * custom: 게임이 ctx.finish({ stats: [{ label, value }] })로 준 칸(3개까지). 맞힘·틀림으로 보이지 않는 단계(직접 만들어 보는 단계)가
 *   정답률 · 맞힘/시도 대신 자기 말로 채운다(예: "찾은 전개도 3가지"). 쓸 수 있는 칸이 없으면 기본 칸.
 * showTime: false면 걸린 시간을 넣지 않는다 — 시간 재기(timer: 'optional')를 켜지 않은 판은 시간이 어디에도 보이지 않는다
 */
export function resultStats({ record, custom = null, showTime = true }) {
  const own = customStats(custom);
  const list = own ?? [
    ['정답률', formatPercent(record.accuracy)],
    ...(record.attempts ? [['맞힘/시도', `${record.attempts}번 중 ${record.correct}번 맞힘`]] : []),
  ];
  if (showTime) list.push(['걸린 시간', formatDuration(record.durationMs)]);
  return list;
}

/** ctx.finish({ stats })의 쓸 수 있는 칸 [이름, 값] (3개까지). 없으면 null */
export function customStats(stats) {
  if (!Array.isArray(stats)) return null;
  const list = stats
    .filter((x) => x && x.label != null && String(x.label).trim() && x.value != null)
    .slice(0, 3)
    .map((x) => [String(x.label), String(x.value)]);
  return list.length > 0 ? list : null;
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
 * note: 게임이 별을 직접 정한 판(finish({ stars, starNote }))에서 별이 3개가 안 될 때 보일 그 게임의 별 기준 한 문장
 */
export function starHint({ stars, attempts, correct, cleared = true, fromAccuracy = true, note = null }) {
  if (!cleared) return '까닭을 다시 살펴보고 한 번 더 해 봐요.';
  if (stars >= MAX_STARS) return '별 3개를 모두 받았어요!';
  if (!fromAccuracy) return typeof note === 'string' && note.trim() ? note.trim() : null;
  if (!attempts) return null;
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

/**
 * 게임 인트로(선택 기능, B0c · B0c2): 앱을 열면 맨 처음 보이는 화면. [입장하기]를 누르면 처음 화면(학년·영역 카드)으로 간다.
 * intro 정의를 확인해 화면에 쓸 값으로 바꾼다. intro가 없으면 null — 인트로가 없는 게임은 화면·저장 값이 지금과 똑같다.
 *   intro: {
 *     subtitle?,                 부제(글자). 제목 그림의 리본 위(logo.ribbon) 또는 제목 아래
 *     enterLabel? = '입장하기',  큰 버튼의 글자
 *     title? = game.title,       화면 읽기용 제목(h1). 제목 그림이 있으면 그 그림의 대체 글
 *     art?: { width, height, keep?, avoid?, buttonAvoid?, glow? }  — buttonAvoid: [입장하기]가 가리면 왼쪽으로 조금 비킬 상자들(core/intro-fit.js placeIntroButton)
 *       배경 그림의 크기(px)·꼭 보일 칸 keep [x0, y0, x1, y1](인물 — 꽉 채울 때 자르지 않는다)·제목이 가리면 안 되는 상자들 avoid(머리)·카드 둘레 빛 색.
 *       주면 꽉 채우기/카드 규칙(core/intro-fit.js)으로 놓는다. 주지 않으면 그림을 화면 가득(cover)
 *     logo?: { width, height, crop?, ribbon?: { path, fontSize, length } }
 *       제목 그림의 크기, 쓸 상자 crop [x0, y0, x1, y1](그림 파일은 그대로 — 투명 여백을 CSS로 뺀다), 부제를 얹을 리본의 가운데 선(그림 좌표의 SVG 경로)·글자 크기·글 길이
 *   }
 * 그림은 게임 CSS가 준다: .intro-bg(배경)·.intro-logo(제목)의 background-image, .intro-shine(빛이 스치는 틀)의 mask-image
 * (엔진은 그림 파일을 모른다 — docs/engine.md 2절 "게임 인트로").
 */
export function planIntro(intro, game) {
  if (intro == null || intro === false) return null;
  if (typeof intro !== 'object' || Array.isArray(intro)) throw new Error('createGameApp: intro는 { subtitle, enterLabel, logo } 객체예요.');
  const text = (value, fallback = '') => (typeof value === 'string' && value.trim() ? value.trim() : fallback);
  const box = (value, w, h, name) => {
    if (value == null) return null;
    const nums = Array.isArray(value) ? value.map(Number) : [];
    if (nums.length !== 4 || nums.some((v) => !Number.isFinite(v)) || nums[0] < 0 || nums[1] < 0 || nums[2] > w || nums[3] > h || nums[0] >= nums[2] || nums[1] >= nums[3]) {
      throw new Error(`createGameApp: ${name}는 그림 안의 상자 [x0, y0, x1, y1]이에요.`);
    }
    return nums;
  };
  let logo = null;
  if (intro.logo != null) {
    const { width, height, ribbon = null } = intro.logo;
    if (!(Number(width) > 0 && Number(height) > 0)) throw new Error('createGameApp: intro.logo에는 제목 그림의 width·height(양수)가 필요해요.');
    if (ribbon != null && !(typeof ribbon.path === 'string' && ribbon.path.trim() && Number(ribbon.fontSize) > 0 && Number(ribbon.length) > 0)) {
      throw new Error('createGameApp: intro.logo.ribbon에는 path(SVG 경로)·fontSize·length가 필요해요.');
    }
    const w = Number(width);
    const h = Number(height);
    logo = { width: w, height: h, crop: box(intro.logo.crop, w, h, 'intro.logo.crop') ?? [0, 0, w, h], ribbon: ribbon && { path: ribbon.path.trim(), fontSize: Number(ribbon.fontSize), length: Number(ribbon.length) } };
  }
  let art = null;
  if (intro.art != null) {
    const w = Number(intro.art.width);
    const h = Number(intro.art.height);
    if (!(w > 0 && h > 0)) throw new Error('createGameApp: intro.art에는 배경 그림의 width·height(양수)가 필요해요.');
    if (intro.art.avoid != null && !Array.isArray(intro.art.avoid)) throw new Error('createGameApp: intro.art.avoid는 상자들의 배열이에요.');
    art = {
      width: w,
      height: h,
      keep: box(intro.art.keep, w, h, 'intro.art.keep') ?? [0, 0, w, h],
      avoid: (intro.art.avoid ?? []).map((b) => box(b, w, h, 'intro.art.avoid')),
      ...(intro.art.buttonAvoid != null && { buttonAvoid: (Array.isArray(intro.art.buttonAvoid) ? intro.art.buttonAvoid : [[]]).map((b) => box(b ?? [], w, h, 'intro.art.buttonAvoid')) }), // [입장하기]가 비킬 칸(주었을 때만 — c4, 15-11 끝)
      glow: text(intro.art.glow) || null,
    };
  }
  return { title: text(intro.title, String(game.title)), subtitle: text(intro.subtitle), enterLabel: text(intro.enterLabel, '입장하기'), logo, art };
}

/** 인트로로 시작하는가: 선생님이 준 수업 주소(?stage= · ?lesson= · ?area= · ?grade= — 값이 맞든 틀리든 주소에 있으면)로 열면 인트로 없이 그 화면으로 */
export const opensWithIntro = (options) => !['stageId', 'lessonId', 'areaId', 'gradeId'].some((key) => options?.[key] != null);

/** 인트로 그림이 풀리기를(디코딩) 기다리는 가장 긴 시간. 그 안에 안 풀리면 그냥 시작한다(그때까지는 하늘색 바탕과 반짝임이 보인다) */
const INTRO_WAIT_MS = 1500;
const SVG_NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs, ...children) => {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs ?? {})) if (value != null) el.setAttribute(key, String(value));
  el.append(...children);
  return el;
};
// 인트로 꾸밈(화면 읽기에서 숨김). 자리·크기·때는 base.css의 nth-child가 정한다
const INTRO_SKY_SPARKS = 8; // 하늘의 반짝임
const INTRO_LOGO_SPARKS = 5; // 제목 둘레의 반짝임
const INTRO_BLOCKS = [[1, 1, 1], [2, 1, 1], [1, 1, 1], [1, 2, 1], [1, 1, 1], [1, 1, 2]]; // 아래에서 떠오르는 정육면체·직육면체 (가로·세로·높이)

/** 등축 투영으로 그린 작은 입체 하나: 윗면·왼쪽 앞면·오른쪽 앞면 (색은 base.css의 .ib-top·.ib-left·.ib-right) */
function isoBlock([a, b, c]) {
  const u = 10;
  const at = ([x, y, z]) => `${((x - y) * 0.866 * u).toFixed(1)},${(((x + y) * 0.5 - z) * u).toFixed(1)}`;
  const faces = [
    ['ib-top', [[0, 0, c], [a, 0, c], [a, b, c], [0, b, c]]],
    ['ib-left', [[0, b, 0], [a, b, 0], [a, b, c], [0, b, c]]],
    ['ib-right', [[a, 0, 0], [a, b, 0], [a, b, c], [a, 0, c]]],
  ];
  const [x0, x1, y0, y1] = [-b * 0.866 * u - 2, a * 0.866 * u + 2, -c * u - 2, (a + b) * 0.5 * u + 2];
  return svgEl('svg', { viewBox: `${x0.toFixed(1)} ${y0.toFixed(1)} ${(x1 - x0).toFixed(1)} ${(y1 - y0).toFixed(1)}`, focusable: 'false' },
    ...faces.map(([cls, pts]) => svgEl('polygon', { class: cls, points: pts.map(at).join(' ') })));
}

/**
 * 제목 그림의 리본 위에 얹는 부제: 그림과 같은 좌표의 SVG에서 리본의 가운데 선을 따라 휘어진 글(흰 글자 + 남색 테두리 + 아래 그림자).
 * 글 길이는 length로 맞춘다(글꼴이 달라도 리본 밖으로 나가지 않는다). 테두리·그림자·글자를 세 겹으로 따로 그린다 —
 * 한 겹에 테두리와 글자를 함께 그리면 글자마다 차례로 칠해져 옆 글자의 테두리가 앞 글자의 획(ㅏ의 짧은 획)을 덮는다
 */
function ribbonText(text, { crop, ribbon }) {
  const id = 'intro-ribbon-path';
  const [x0, y0, x1, y1] = crop;
  const edge = Math.round(ribbon.fontSize * 0.19 * 10) / 10; // 테두리 두께: 글자 크기의 19%(바깥으로 보이는 것은 그 반)
  const layer = (cls, extra = null) => svgEl('text', { class: cls, 'font-size': ribbon.fontSize, 'text-anchor': 'middle', 'dominant-baseline': 'central', ...extra },
    svgEl('textPath', { href: `#${id}`, startOffset: '50%', textLength: ribbon.length, lengthAdjust: 'spacingAndGlyphs' }, text));
  // 그림에서 쓰는 상자(crop)와 같은 좌표 — 리본의 선은 그림 파일 좌표 그대로
  return svgEl('svg', { class: 'intro-ribbon', viewBox: `${x0} ${y0} ${x1 - x0} ${y1 - y0}`, 'aria-hidden': 'true', focusable: 'false' },
    svgEl('defs', null, svgEl('path', { id, d: ribbon.path })),
    layer('intro-ribbon-shadow', { transform: `translate(0 ${Math.round(ribbon.fontSize * 0.077 * 10) / 10})`, 'stroke-width': edge }),
    layer('intro-ribbon-edge', { 'stroke-width': edge }),
    layer('intro-ribbon-text'),
  );
}

/** 요소의 CSS 배경 그림을 받아 풀(디코딩) 때까지 → 그 그림(Image). 그림이 없거나 받지·풀지 못하면 null */
function backgroundDecoded(el) {
  const url = /url\((["']?)(.*?)\1\)/.exec(getComputedStyle(el).backgroundImage || '')?.[2];
  if (!url || typeof Image !== 'function') return Promise.resolve(null);
  const img = new Image();
  img.src = url;
  const done = typeof img.decode === 'function' ? img.decode() : new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });
  return done.then(() => img, () => null);
}

/** 카드 뒤의 흐린 바탕: 같은 그림을 작은 캔버스(96×54)에 한 번 그린다 — 화면 크기로 늘리면 저절로 흐려진다(새 그림 파일을 만들지 않는다) */
const INTRO_BLUR_W = 96;
const INTRO_BLUR_H = 54;
function drawIntroBlur(img, canvas) {
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    if ('filter' in ctx) ctx.filter = 'blur(2px)';
    ctx.drawImage(img, -4, -4, INTRO_BLUR_W + 8, INTRO_BLUR_H + 8);
    return true;
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
  areas = null,
  grades: gradeDefs = null,
  heroArt = null,
  rewards: rewardOptions = null,
  collections: collectionDefs = null,
  intro: introDef = null,
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
  const introPlan = planIntro(introDef, game); // 게임 인트로(선택). null이면 인트로가 없다 — 아래 화면이 모두 지금과 같다

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

  // 영역(선택 기능, core/areas.js): 보이는 영역과 그 차시 묶음. 영역을 쓰지 않는 게임은 null — 아래 화면이 모두 지금과 같다.
  // ?lesson=으로 한 차시만 열면 영역 카드·탭은 없다(areaMode가 아님). 그때도 놀이 방법·차시 칩은 그 차시가 든 영역의 것을 쓴다
  const areaPlan = planAreas(areas, Array.isArray(lessons) && lessons.length ? planLessons(allStages, lessons, null).groups : [], lessons);
  const areaMode = Boolean(areaPlan && !plan.current);
  const lessonArea = plan.current ? areaOfLesson(areaPlan, plan.current.id) : null;
  // 학년(영역에 grade가 있을 때): 처음 화면에 학년 카드 → 학년 화면(그 학년의 영역 카드) → 영역의 단계 지도
  const gradePlan = planGrades(areaPlan, gradeDefs);
  let currentArea = null; // 영역의 단계 지도에서 보는 영역 id (areaMode)
  let currentGrade = null; // 학년 화면에서 보는 학년

  const storage = createStorage(game.id);
  const progress = createProgress({ stageIds, storage, unlockAll: options.unlockAll, openIds: plan.openIds, optionalIds });
  const log = createLearningLog({ storage });
  const sfx = createSfx({ storage, enabled: options.sound });
  const rewardStore = createRewardStore({ storage, ...rankConfig });
  let collectionState = normalizeCollectionState(storage.get('collections', null), collections);
  /**
   * 점수를 저장할 때 도감도 함께 맞춘다(도감이 있는 게임만). 탭을 두 개 열어 섞어 해도 저장된 값이 늘 "한 탭의
   * 같은 때의 점수와 도감 한 쌍"이 되어, 도감에서 빠진 칸의 점수만 남아 같은 칸으로 점수를 다시 받는 일이 없다.
   * 저장된 도감이 이미 같으면(탭 하나로 할 때는 늘 같다) 아무것도 쓰지 않는다. 다르면 도감과 점수를 이 탭의 값으로 함께 쓴다.
   */
  const saveCollections = () => {
    if (collections.length === 0) return;
    const saved = normalizeCollectionState(storage.get('collections', null), collections);
    if (JSON.stringify(saved) === JSON.stringify(collectionState)) return;
    storage.set('collections', collectionState);
    rewardStore.save();
  };
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
    // 인트로가 떠 있는 동안: 머리의 게임 이름·칭호 칩은 숨고 [소리] 버튼만 화면 오른쪽 위에 (base.css .edu-app.is-intro)
    if (introPlan) root.classList.toggle('is-intro', screen.classList.contains('screen-intro'));
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
  /**
   * 도감 칩 숫자: label이 없는 도감은 합쳐 "도감 n / m"(main), label이 있는 도감(예: '노트')은 따로(side).
   * defs를 주지 않으면 모든 도감.
   */
  const chipsOf = (defs = collections) => collectionChips(collectionState, defs);
  /** label 도감의 글자: "노트 2 / 24" (sep: 숫자 사이 글자) */
  const sideText = (c, sep = ' / ') => `${c.label} ${c.count}${sep}${c.total}`;
  /**
   * 한 차시만 열었을 때(?lesson=) 화면 머리의 칩과 처음 화면 내 공방 카드에서 빼는 도감: 다른 차시(lessons에 있는 차시)에 딸린 도감.
   * 이 차시에는 없는 도감이라 무엇을 채우는 것인지 알 수 없다. 차시를 고르지 않은 화면과 차시가 없는 게임에서는 빼는 것이 없다.
   */
  const offLesson = (def) => Boolean(plan.current && def.lesson && def.lesson !== plan.current.id && lessons?.some((l) => l.id === def.lesson));

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
    const lines = howToLines(lessonArea);
    const card = rewardsOn && workshopCard({
      rank: rewardStore.rank(),
      stars: { total: progress.totalStars(), max: progress.maxStars },
      collection: chipsOf(collections.filter((c) => !offLesson(c))).main,
      badges: { count: earnedCount(), total: badgeDefs.length },
    });
    // 인트로가 있는 게임: 처음 화면(한 차시 주소 화면은 빼고) 맨 위 왼쪽에 [← 처음으로] → 인트로
    const toIntro = introPlan && !plan.current && button('← 처음으로', () => openIntro(), 'btn btn-small btn-back btn-intro');
    return h('section', { class: `screen screen-title hero${areaMode ? ' has-areas' : ''}` },
      h('div', { class: 'hero-copy' },
        (eyebrow || grade || toIntro) && h('div', { class: 'title-chips' },
          toIntro,
          eyebrow && h('p', { class: 'eyebrow' }, eyebrow),
          grade && !String(eyebrow).includes('학년') && h('span', { class: 'chip chip-ink' }, grade),
        ),
        h('h1', { class: 'title-main' }, before, h('span', { class: 'mark' }, mark), after),
        game.summary && h('p', { class: 'lead' }, game.summary),
        // 영역이 있으면 [시작하기] 자리에 영역 카드(누르면 그 영역의 단계 지도). 놀이 방법·학습 기록은 내 공방 카드 옆에 세로로
        // (크롬북 1366×680에서 처음 화면이 한 화면에 들어오게 — 버튼 줄 하나만큼 낮아진다)
        areaMode
          ? [
            gradePlan ? gradeCards() : areaCards(areaPlan, startAreaId(areaPlan, storage.get(AREA_KEY, null))),
            h('div', { class: 'hero-foot' },
              card,
              h('div', { class: 'actions hero-more' },
                lines.length > 0 && button('놀이 방법', () => show(howToScreen()), 'btn', 'info'),
                button('학습 기록', () => show(reportScreen()), 'btn', 'book'),
              ),
            ),
          ]
          : [
            h('div', { class: 'actions' },
              button('시작하기', () => show(stageSelectScreen()), 'btn btn-primary btn-lg', 'play', { after: true }),
              lines.length > 0 && button('놀이 방법', () => show(howToScreen())),
              button('학습 기록', () => show(reportScreen())),
            ),
            card,
          ],
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

  /**
   * 게임 인트로 화면(introPlan이 있을 때만): 화면 가득 배경 그림 · 가운데 위 제목 그림(+ 리본 위 부제) · 아래 가운데 큰 [입장하기].
   * 꾸밈(반짝임·떠오르는 입체)은 화면 읽기에서 숨긴다. 움직임은 transform·opacity만(base.css). 움직임 줄이기·?fx=low면 움직이지 않는 한 장면
   */
  function introScreen() {
    const { title, subtitle, enterLabel, logo, art } = introPlan;
    const repeat = (n, make) => Array.from({ length: n }, (_, i) => make(i));
    const enter = h('button', {
      type: 'button',
      class: 'intro-enter',
      onclick: () => {
        sfx.play('unlock'); // 문이 열리는 종소리 (소리 끔이면 없다)
        show(titleScreen());
      },
    }, h('span', { class: 'intro-enter-pulse' }, h('span', { class: 'intro-enter-face' }, enterLabel)));
    const screen = h('section', { class: `screen screen-intro${logo ? ' has-logo' : ''}${art ? '' : ' no-art'}${quietFx() ? ' is-ready is-titled is-still' : ''}` },
      // 카드 뒤(와 꽉 채우기의 얇은 띠)의 흐린 같은 그림 · 가장자리 어둡게
      h('canvas', { class: 'intro-blur', width: INTRO_BLUR_W, height: INTRO_BLUR_H, 'aria-hidden': 'true' }),
      h('div', { class: 'intro-vignette', 'aria-hidden': 'true' }),
      // 무대: 그림이 보이는 곳(꽉 채우기 = 화면, 카드 = 카드). 그림·반짝임·떠오르는 입체는 무대 안에
      h('div', { class: 'intro-stage', 'aria-hidden': 'true' },
        h('div', { class: 'intro-bg' }),
        h('div', { class: 'intro-sparks' }, repeat(INTRO_SKY_SPARKS, () => h('span', { class: 'intro-spark' }))),
        h('div', { class: 'intro-blocks' }, INTRO_BLOCKS.map((size) => h('span', { class: 'intro-block' }, isoBlock(size)))),
      ),
      h('div', { class: 'intro-head' },
        h('div', { class: 'intro-drop' },
          h('div', { class: 'intro-float' },
            h('div', { class: 'intro-logo-box' },
              h('h1', { class: 'intro-title' }, logo
                ? [h('span', { class: 'sr-only' }, title), h('span', { class: 'intro-logo', 'aria-hidden': 'true' }, h('span', { class: 'intro-shine' }))]
                : h('span', { class: 'intro-title-text' }, title)),
              subtitle && h('p', { class: `intro-subtitle${logo?.ribbon ? ' on-ribbon' : ''}` }, logo?.ribbon
                ? [h('span', { class: 'sr-only' }, subtitle), ribbonText(subtitle, logo)]
                : subtitle),
              h('span', { class: 'intro-logo-sparks', 'aria-hidden': 'true' }, repeat(INTRO_LOGO_SPARKS, () => h('span', { class: 'intro-spark' }))),
            ),
          ),
        ),
      ),
      h('div', { class: 'intro-foot' }, enter),
    );
    if (logo) {
      // 제목 그림에서 쓸 상자(crop)만 보이게: 그림 크기·자리를 상자 기준 백분율로 (그림 파일은 그대로)
      const [x0, y0, x1, y1] = logo.crop;
      const cw = x1 - x0;
      const ch = y1 - y0;
      const pos = (start, size, full) => (full > size ? `${((start / (full - size)) * 100).toFixed(4)}%` : '0%');
      screen.style.setProperty('--intro-ratio', String(cw / ch));
      screen.style.setProperty('--intro-logo-size', `${((logo.width / cw) * 100).toFixed(4)}% ${((logo.height / ch) * 100).toFixed(4)}%`);
      screen.style.setProperty('--intro-logo-pos', `${pos(x0, cw, logo.width)} ${pos(y0, ch, logo.height)}`);
    }
    if (art?.glow) screen.style.setProperty('--intro-glow', art.glow);
    layoutIntro(screen);
    return screen;
  }

  /**
   * 인트로 배치(core/intro-fit.js): 지금 화면 크기·devicePixelRatio로 꽉 채우기/카드를 정하고 무대·그림·제목·[입장하기]의 자리를 CSS 변수로 준다.
   * 그림 정보(art)가 없으면 그림을 화면 가득(cover)
   */
  function layoutIntro(screen) {
    const sw = globalThis.innerWidth || 1;
    const sh = globalThis.innerHeight || 1;
    const dpr = sanitizeDpr(globalThis.devicePixelRatio);
    const { art, logo } = introPlan;
    const crop = logo?.crop;
    const logoRatio = crop ? (crop[2] - crop[0]) / (crop[3] - crop[1]) : 1.6;
    const plan = planIntroLayout({ w: sw, h: sh, dpr, art: art ?? { width: sw, height: sh }, logoRatio });
    const px = (v) => `${Math.round(v * 1000) / 1000}px`;
    const vars = {
      '--st-x': plan.stage.x, '--st-y': plan.stage.y, '--st-w': plan.stage.w, '--st-h': plan.stage.h,
      '--im-x': plan.image.x - plan.stage.x, '--im-y': plan.image.y - plan.stage.y, '--im-w': plan.image.w, '--im-h': plan.image.h,
      '--logo-x': plan.logo.x, '--logo-y': plan.logo.y, '--logo-w': plan.logo.w,
      '--btn-x': plan.button.x, '--btn-y': plan.button.y, '--btn-h': plan.button.h, '--btn-w': plan.button.w, '--btn-s': plan.button.s, // --btn-w = 면의 최소 폭, --btn-s = 1px × 큰 화면 배율(base.css가 px 값에 곱한다)
    };
    for (const [name, value] of Object.entries(vars)) screen.style.setProperty(name, px(value));
    screen.classList.toggle('is-card', plan.mode === 'card');
    screen.classList.toggle('is-fill', plan.mode === 'fill');
    // 꽉 채우기에서 띠가 남으면(5% 이하) 그 띠에 흐린 같은 그림
    screen.classList.toggle('has-band', plan.mode === 'fill' && plan.band > 0.0005);
    screen.dataset.mode = plan.mode;
    screen.dataset.ratio = plan.ratio.toFixed(3);
    screen.dataset.band = plan.band.toFixed(4);
    return plan;
  }

  /**
   * 인트로를 연다: [입장하기]에 초점. 그림은 받아 풀리는 대로 나타난다(배경은 부드럽게, 그 전에는 하늘색 바탕과 반짝임).
   * 제목 그림이 풀리면(.is-titled) 제목이 떨어지는 움직임과 부제, [입장하기]는 그때(늦어도 INTRO_WAIT_MS 뒤 — 느린 망에서도 들어갈 수 있게, .is-ready) 올라온다
   */
  function openIntro() {
    const screen = introScreen();
    show(screen);
    screen.querySelector('.intro-enter').focus({ preventScroll: true });
    const bg = screen.querySelector('.intro-bg');
    const logoEl = screen.querySelector('.intro-logo');
    const ready = () => {
      if (screen.isConnected) screen.classList.add('is-ready');
    };
    backgroundDecoded(bg).then((img) => {
      if (!screen.isConnected) return;
      if (img) bg.classList.add('is-loaded');
      // 배경 그림이 오면 카드 뒤의 흐린 바탕을 한 번 그린다
      if (img && drawIntroBlur(img, screen.querySelector('.intro-blur'))) screen.classList.add('has-blur');
    });
    (logoEl ? backgroundDecoded(logoEl) : Promise.resolve(null)).then((img) => {
      if (!screen.isConnected) return;
      if (img) logoEl.classList.add('is-loaded');
      screen.classList.add('is-titled'); // 받지 못했어도(그림 없음) 부제·움직임은 보인다
      ready();
    });
    const timer = setTimeout(ready, INTRO_WAIT_MS);
    // 화면 크기·방향·devicePixelRatio(브라우저 확대, 다른 화면으로 옮김)가 바뀌면 모드를 다시 정한다
    const relayout = () => {
      if (screen.isConnected) layoutIntro(screen);
    };
    let dprQuery = null;
    const watchDpr = () => {
      dprQuery?.removeEventListener?.('change', onDpr);
      dprQuery = typeof globalThis.matchMedia === 'function' ? globalThis.matchMedia(`(resolution: ${sanitizeDpr(globalThis.devicePixelRatio)}dppx)`) : null;
      dprQuery?.addEventListener?.('change', onDpr);
    };
    function onDpr() {
      relayout();
      watchDpr();
    }
    watchDpr();
    globalThis.addEventListener?.('resize', relayout);
    screenCleanups.push(() => {
      clearTimeout(timer);
      globalThis.removeEventListener?.('resize', relayout);
      dprQuery?.removeEventListener?.('change', onDpr);
    });
  }

  /**
   * 놀이 방법 줄: 영역의 howTo가 있으면 그 영역의 줄, 없으면 게임의 howTo.
   * entry: 영역(areaPlan의 한 칸). 영역을 고르기 전(처음 화면)·영역이 없는 게임은 null → 게임의 howTo(공통 줄)
   */
  function howToLines(entry) {
    const own = entry?.area?.howTo;
    return Array.isArray(own) && own.length > 0 ? own : howTo;
  }

  /**
   * 놀이 방법 화면. 처음 화면에서 열면 그 화면의 줄(영역을 고르기 전이면 공통 줄, ?lesson=이면 그 차시가 든 영역의 줄).
   * entry를 주면(영역의 단계 지도에서 열었을 때) 그 영역의 줄과 [단계 선택](그 영역의 지도로)
   */
  function howToScreen(entry = null) {
    const lines = entry ? howToLines(entry) : howToLines(lessonArea);
    let go = button('시작하기', () => show(stageSelectScreen()), 'btn btn-primary btn-lg', 'play', { after: true });
    if (entry) go = button('단계 선택', () => show(stageSelectScreen()), 'btn btn-primary btn-lg', 'play', { after: true });
    else if (areaMode) go = null; // 영역을 고르기 전: 처음 화면의 학년·영역 카드에서 고른다
    return h('section', { class: 'screen screen-howto' },
      h('h2', null, '놀이 방법'),
      h('ol', { class: 'sheet howto-list' }, lines.map((step, i) => h('li', null,
        h('span', { class: 'howto-no', 'aria-hidden': 'true' }, String(i + 1)),
        h('span', null, step),
      ))),
      h('div', { class: 'actions actions-start' },
        go,
        button('처음 화면', () => show(titleScreen()), 'btn', 'home'),
      ),
    );
  }

  // ── 영역 (areaMode): 처음 화면의 학년·영역 카드 · 학년 화면 · 단계 지도의 영역 탭 ─────────────
  const areaEntry = (id) => areaPlan?.find((entry) => entry.area.id === id) ?? null;
  const gradeEntry = (grade) => gradePlan?.find((g) => g.grade === grade) ?? null;
  /** 그 영역이 든 학년 (학년이 없으면 null) */
  const gradeOfArea = (id) => gradePlan?.find((g) => g.areas.some((entry) => entry.area.id === id)) ?? null;
  /** 영역의 일반 단계 id (모은 별은 일반 단계만 센다 — 도전 주문서는 빼는 것이 엔진 규칙) */
  const areaStageIds = (entry) => entry.groups.flatMap((g) => regularOf(g.stages)).map((s) => s.id);
  function starsOf(ids) {
    return { stars: ids.reduce((sum, id) => sum + progress.getStars(id), 0), max: ids.length * MAX_STARS };
  }
  const areaStars = (entry) => starsOf(areaStageIds(entry));
  const gradeStars = (g) => starsOf(g.areas.flatMap(areaStageIds));
  const savedArea = () => storage.get(AREA_KEY, null);
  function artOf(make) {
    if (typeof make !== 'function') return null;
    try {
      return make(h);
    } catch (error) {
      console.error(error);
      return null;
    }
  }
  const areaArt = (entry) => artOf(entry.area.art);
  /** 영역의 단계 지도를 연다 (학년이 있으면 그 영역의 학년도 정한다) */
  function openArea(id) {
    currentArea = id;
    if (gradePlan) currentGrade = gradeOfArea(id)?.grade ?? currentGrade;
    show(stageSelectScreen());
  }
  /** 학년 화면을 연다 */
  function openGrade(grade) {
    currentGrade = grade;
    show(gradeScreen());
  }
  const flagEl = () => h('span', { class: 'flag', 'aria-hidden': 'true' }, '여기부터!');

  /**
   * 영역 카드: 작은 그림 · 영역 이름 · 학년·단원 한 줄 · 차시 수 · 그 영역의 모은 별. here(영역 id)에 "여기부터!".
   * 차시가 아직 없는 영역은 "준비 중" 카드 — 누를 수 없고(disabled) 자물쇠 + 글자 "준비 중"(색만으로 구분하지 않는다)
   */
  function areaCards(entries, here) {
    return h('ul', { class: 'area-cards', 'aria-label': '영역' }, entries.map((entry) => {
      const { area, ready } = entry;
      const { stars, max } = areaStars(entry);
      const isHere = ready && area.id === here;
      const art = areaArt(entry);
      const line = areaLine(area);
      return h('li', null,
        isHere && flagEl(),
        h('button', {
          type: 'button',
          class: `area-card${isHere ? ' is-now' : ''}${ready ? '' : ' is-soon'}`,
          dataset: { area: area.id },
          disabled: !ready,
          'aria-label': areaLabel(area, { lessons: entry.groups.length, stars, maxStars: max, here: isHere, ready }),
          onclick: () => {
            sfx.play('click');
            openArea(area.id);
          },
        },
          art && h('span', { class: 'area-art', 'aria-hidden': 'true' }, art),
          h('span', { class: 'area-title' }, area.title),
          line && h('span', { class: 'area-line' }, line),
          h('span', { class: 'area-meta' }, ready
            ? [
              h('span', { class: 'chip' }, icon('book'), `차시 ${entry.groups.length}개`),
              h('span', { class: 'chip' }, starIcon(true), `별 ${stars} / ${max}`),
            ]
            : h('span', { class: 'chip chip-soon' }, icon('lock'), '준비 중')),
        ),
      );
    }));
  }

  /** 처음 화면의 학년 카드: 작은 그림 · "5학년" · 학년 설명 · 그 학년의 모은 별. 지난번에 하던 학년(처음이면 첫 학년)에 "여기부터!" */
  function gradeCards() {
    const here = startGrade(gradePlan, savedArea());
    return h('ul', { class: 'area-cards grade-cards', 'aria-label': '학년' }, gradePlan.map((g) => {
      const { stars, max } = gradeStars(g);
      const isHere = g.grade === here;
      const art = artOf(g.art);
      return h('li', null,
        isHere && flagEl(),
        h('button', {
          type: 'button',
          class: `area-card grade-card${isHere ? ' is-now' : ''}${g.ready ? '' : ' is-soon'}`,
          dataset: { grade: String(g.grade) },
          disabled: !g.ready,
          'aria-label': g.ready ? gradeCardLabel(g, { stars, maxStars: max, here: isHere }) : `${g.title}, 준비 중`,
          onclick: () => {
            sfx.play('click');
            openGrade(g.grade);
          },
        },
          art && h('span', { class: 'area-art', 'aria-hidden': 'true' }, art),
          h('span', { class: 'area-title' }, g.title),
          g.note && h('span', { class: 'area-line' }, g.note),
          h('span', { class: 'area-meta' }, g.ready
            ? h('span', { class: 'chip' }, starIcon(true), `별 ${stars} / ${max}`)
            : h('span', { class: 'chip chip-soon' }, icon('lock'), '준비 중')),
        ),
      );
    }));
  }

  /** 학년 화면: [← 학년 고르기] · 학년 이름과 설명 · 그 학년의 모은 별 · 그 학년의 영역 카드(준비 중 포함). 지난 영역(그 학년이면)에 "여기부터!" */
  function gradeScreen() {
    const g = gradeEntry(currentGrade) ?? gradeEntry(startGrade(gradePlan, savedArea()));
    currentGrade = g.grade;
    const { stars, max } = gradeStars(g);
    return h('section', { class: 'screen screen-grade', dataset: { grade: String(g.grade) } },
      h('div', { class: 'screen-head grade-head' },
        h('div', { class: 'grade-title' },
          button('← 학년 고르기', () => show(titleScreen()), 'btn btn-small btn-back'),
          h('h2', null, g.title),
        ),
        h('p', { class: 'chip chip-ink chip-lg star-total' }, starIcon(true), `모은 별 ${stars} / ${max}`),
      ),
      g.note && h('p', { class: 'grade-note' }, g.note),
      h('p', { class: 'grade-guide' }, '공부할 영역을 골라요.'),
      areaCards(g.areas, startAreaId(areaPlan, savedArea(), g.areas)),
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

  /**
   * 도감 칩: lesson이 맞는 도감은 그 차시 머리에, 나머지(차시 없음·안 보이는 차시)는 화면 머리에.
   * "도감 n / m"에는 label이 없는 도감만 합치고, label이 있는 도감은 따로 "노트 n / m"처럼 보인다.
   */
  function collectionChip(lessonId, cls = 'chip', shownGroups = plan.groups) {
    const shown = (c) => shownGroups?.some((g) => g.lesson.id === c.lesson);
    const defs = collections.filter((c) => (lessonId === null ? !shown(c) : c.lesson === lessonId));
    // 한 차시만 열었을 때: 다른 차시의 도감은 화면 머리에 넣지 않는다 (offLesson)
    // 영역의 단계 지도: 다른 영역의 차시에 딸린 도감도 넣지 않는다 (그 영역에 없는 차시라 무엇을 채우는지 알 수 없다)
    const offArea = (c) => Boolean(areaMode && c.lesson && lessons?.some((l) => l.id === c.lesson) && !shown(c));
    if (lessonId === null) for (let i = defs.length - 1; i >= 0; i -= 1) if (offLesson(defs[i]) || offArea(defs[i])) defs.splice(i, 1);
    if (defs.length === 0) return null;
    const { main, side } = chipsOf(defs);
    return [
      main && h('span', { class: `${cls} collection-chip` }, icon('book'), `도감 ${main.count} / ${main.total}`),
      side.map((c) => h('span', { class: `${cls} collection-chip is-side` }, safeIcon(c.icon) ?? icon('book'), sideText(c))),
    ];
  }

  /** 차시 묶음 한 판: "n차시" 칩 + 차시 제목 + 단원 글 + 도감·시간 칩, 단계 카드 길, 도전 주문서 줄 */
  function lessonGroup(g, chipText) {
    const minutesChip = (n) => (n ? h('span', { class: 'chip' }, icon('clock'), `약 ${n}분`) : null);
    const minutes = game.playMinutes ? h('span', { class: 'chip' }, icon('clock'), `약 ${game.playMinutes}분`) : null;
    return h('section', { class: 'sheet lesson-group', dataset: { lesson: g.lesson.id } },
      h('div', { class: 'lesson-head' },
        chipText && h('span', { class: 'lesson-no' }, chipText),
        h('h3', { class: 'lesson-title' }, g.lesson.title),
        lessonNoteText(g.lesson) && h('span', { class: 'lesson-note' }, lessonNoteText(g.lesson)),
        h('span', { class: 'lesson-chips' }, collectionChip(g.lesson.id), g.lesson.minutes == null ? minutes : minutesChip(lessonMinutes(g.lesson, game))),
      ),
      stagePath(regularOf(g.stages)),
      challengeRow(challengesOf(g.stages)),
    );
  }

  function stageSelectScreen() {
    if (areaMode) return areaStageScreen();
    return h('section', { class: 'screen screen-stages' },
      h('div', { class: 'screen-head' },
        h('h2', null, '단계를 골라요'),
        h('div', { class: 'head-chips' },
          collectionChip(null, 'chip chip-ink chip-lg'),
          h('p', { class: 'chip chip-ink chip-lg star-total' }, starIcon(true), `모은 별 ${progress.totalStars()} / ${progress.maxStars}`),
        ),
      ),
      plan.groups
        // 차시 칩: 차시 정의의 chip, 없으면 차시 순서대로 "n차시" (영역이 있는 게임을 ?lesson=으로 열어도 지금과 같다)
        ? plan.groups.map((g) => lessonGroup(g, lessonChipText(g.lesson, g.number)))
        : h('section', { class: 'sheet stage-board' }, stagePath(regularOf(stages)), challengeRow(challengesOf(stages))),
      h('div', { class: 'actions actions-start' }, button('처음 화면', () => show(titleScreen()), 'btn', 'home')),
    );
  }

  /**
   * 영역의 단계 지도: 위에 영역 탭(지금 영역 표시, 다른 영역으로 바로 — 방향키·Home·End), 아래에 그 영역의 차시만.
   * 차시 칩은 영역 안의 차례 "n차시"(차시 정의의 chip은 쓰지 않는다 — 탭이 영역을 알려 준다. 차시가 하나뿐인 영역은 칩 없음). 모은 별·도감 칩은 그 영역의 것
   */
  function areaStageScreen() {
    if (!areaEntry(currentArea)?.ready) currentArea = startAreaId(areaPlan, savedArea());
    // 탭은 열린 영역만 — 학년이 있으면 같은 학년의 영역끼리
    const grade = gradeOfArea(currentArea);
    const tabEntries = (grade ? grade.areas : areaPlan).filter((entry) => entry.ready);
    const headChips = h('div', { class: 'head-chips' });
    const panel = h('div', { class: 'area-panel', id: 'area-panel', role: 'tabpanel' });
    const howToButton = button('놀이 방법', () => show(howToScreen(areaEntry(currentArea))), 'btn', 'info');
    const ids = tabEntries.map((entry) => entry.area.id);
    const tabs = tabEntries.map((entry) => {
      const art = areaArt(entry);
      return h('button', {
        type: 'button',
        role: 'tab',
        class: 'area-tab',
        id: `area-tab-${entry.area.id}`,
        'aria-controls': 'area-panel',
        dataset: { area: entry.area.id },
        onclick: () => pick(entry.area.id),
        onkeydown: (event) => {
          const at = ids.indexOf(entry.area.id);
          const to = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: ids.length - 1 }[event.key];
          if (to == null) return;
          event.preventDefault();
          const next = (to + ids.length) % ids.length;
          pick(ids[next]);
          tabs[next].focus();
        },
      }, art && h('span', { class: 'area-tab-art', 'aria-hidden': 'true' }, art), h('span', null, entry.area.title));
    });
    function render() {
      const entry = areaEntry(currentArea);
      const { stars, max } = areaStars(entry);
      headChips.replaceChildren(...[
        collectionChip(null, 'chip chip-ink chip-lg', entry.groups),
        h('p', { class: 'chip chip-ink chip-lg star-total' }, starIcon(true), `모은 별 ${stars} / ${max}`),
      ].flat().filter(Boolean));
      tabs.forEach((tab, i) => {
        const on = ids[i] === currentArea;
        tab.setAttribute('aria-selected', String(on));
        tab.setAttribute('tabindex', on ? '0' : '-1');
        tab.classList.toggle('is-current', on);
      });
      panel.setAttribute('aria-labelledby', `area-tab-${currentArea}`);
      panel.dataset.area = currentArea;
      // 차시가 하나뿐인 영역은 차시 칩을 붙이지 않는다(영역 탭과 차시 제목이 알려 준다 — 수업 주소의 "2차시"와 어긋나는 "1차시"가 생기지 않게, B0a-2)
      const many = entry.groups.length > 1;
      panel.replaceChildren(...entry.groups.map((g, i) => lessonGroup(g, many ? lessonChipText(g.lesson, i + 1, { useChip: false }) : null)));
      howToButton.hidden = howToLines(entry).length === 0;
    }
    function pick(id) {
      if (id === currentArea) return;
      sfx.play('click');
      currentArea = id;
      render();
    }
    render();
    return h('section', { class: 'screen screen-stages has-areas' },
      h('div', { class: 'screen-head' }, h('h2', null, '단계를 골라요'), headChips),
      h('div', { class: 'area-tabs', role: 'tablist', 'aria-label': '영역' }, tabs),
      panel,
      h('div', { class: 'actions actions-start' },
        grade && button('← 영역 고르기', () => openGrade(grade.grade), 'btn'),
        button('처음 화면', () => show(titleScreen()), 'btn', 'home'),
        howToButton,
      ),
    );
  }

  /**
   * 작업 지시서(문제 판) 도우미 — 테이프 붙은 종이 한 장에 주문 도장 + 문제 번호 (design/spec.md 3절 "문제 판")
   *   order({ kind: '검사 주문', counter: '문제 3 / 6', label }) → { el, counter(요소), setCounter(글) }
   *   note({ type: 'wrong'|'correct'|'info', title, text, tip }) → 까닭 쪽지(✓✗ 아이콘·제목·문장·살펴볼 거리)
   *   bonus(글 또는 요소들) → 노랑 점선 보너스 쪽지("다시 일어서기 · 다음 문제를 맞히면 +1")
   */
  const NOTE_ICONS = { wrong: 'cross', correct: 'check', info: 'info' };
  const workOrderUi = {
    order({ kind = '', counter = '', label = '문제 판' } = {}) {
      const counterEl = h('span', { class: 'order-counter' }, counter);
      const el = h('section', { class: 'sheet tape order', 'aria-label': label },
        h('div', { class: 'order-head' }, kind ? h('span', { class: 'order-kind' }, kind) : h('span'), counterEl),
      );
      return { el, counter: counterEl, setCounter: (text) => { counterEl.textContent = text; } };
    },
    note({ type = 'info', title = '', text = '', tip = '' } = {}) {
      const kind = NOTE_ICONS[type] ? type : 'info';
      return h('div', { class: `note note-${kind}` },
        title && h('p', { class: 'note-title' }, icon(NOTE_ICONS[kind]), title),
        text && h('p', { class: 'note-text' }, text),
        tip && h('p', { class: 'note-tip' }, icon('search'), tip),
      );
    },
    bonus(...content) {
      return h('p', { class: 'bonus-note' }, icon('spark'), h('span', null, content));
    },
  };

  /** m:ss (시간 재기 시계) */
  const clockText = (ms) => {
    const total = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  };

  function startStage(stage) {
    // 영역: 이 단계가 든 영역을 "지난번에 하던 영역"으로 기억하고(처음 화면의 "여기부터!"), 단계 지도로 돌아가면 그 영역의 지도
    const stageArea = areaOfLesson(areaPlan, stage.lesson);
    if (stageArea) {
      if (areaMode) {
        currentArea = stageArea.area.id;
        if (gradePlan) currentGrade = gradeOfArea(currentArea)?.grade ?? currentGrade;
      }
      storage.set(AREA_KEY, stageArea.area.id);
    }
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

    // 머리 높이를 CSS 변수(--play-header-h)로 알린다: 화면 높이에 맞춰 무대 높이를 정하는 게임이 "100dvh − 머리 − 나머지"로 쓴다.
    // 글자가 넓은 기기에서 목표 글이 두 줄이 되어 머리가 높아져도 그만큼 무대가 낮아져 화면이 넘치지 않는다 (머리 높이는 판 도중에는 바뀌지 않는다)
    const playScreen = area.closest('.screen-play');
    const playHeader = playScreen?.querySelector('.play-header');
    if (playHeader && typeof ResizeObserver === 'function') {
      const tellHeight = () => playScreen.style.setProperty('--play-header-h', `${playHeader.getBoundingClientRect().height}px`);
      const headerWatch = new ResizeObserver(tellHeight);
      headerWatch.observe(playHeader);
      tellHeight();
      screenCleanups.push(() => headerWatch.disconnect());
    }

    log.startStage(stage);
    const startedAt = Date.now();
    // 다시 하기 점수 규칙: 판을 시작할 때 이미 별 3개인 단계는 연습 점수가 없다 (새로 찾음은 그대로)
    const play = createPlayReward({ startStars: progress.getStars(stage.id) });
    const startXp = rewardStore.xp();
    // 이 판 점수 가운데 이미 저장한 몫(play.instant(): 새로 찾음, '한 번만' 답과 그 설명). 나머지는 판을 마칠 때 저장한다
    let savedXp = 0;
    const timers = [];
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    screenCleanups.push(() => timers.forEach((t) => {
      clearTimeout(t);
      clearInterval(t);
    }));
    let finished = false;

    // 문제 n / N 점 막대 (게임이 ctx.setProgress로 알려 줄 때만 보인다)
    const progressBox = h('span', { class: 'meta-box meta-progress', hidden: true });
    meta.append(progressBox);
    function setProgress(current, total, { label = '문제', done = Number(current) - 1, check = false } = {}) {
      const n = Math.max(0, Math.floor(Number(total) || 0));
      const at = Math.max(0, Math.floor(Number(current) || 0));
      const finishedCount = Math.max(0, Math.min(n, Math.floor(Number(done) || 0)));
      if (n === 0) {
        progressBox.hidden = true;
        return;
      }
      progressBox.hidden = false;
      progressBox.replaceChildren(
        h('small', null, `${label} ${at} / ${n}`),
        h('span', { class: `q-dots${check ? ' is-check' : ''}`, 'aria-hidden': 'true' }, Array.from({ length: n }, (_, i) => {
          const state = i < finishedCount ? 'is-done' : !check && i === finishedCount ? 'is-now' : '';
          return h('i', { class: state || null }, check && i < finishedCount ? icon('check') : null);
        })),
      );
    }

    // 시간 재기 (점수 없음): 첫 답 전에만 켤 수 있고, 켜면 머리에 걸린 시간이 보인다.
    // 시계는 버튼과 같은 자리에 겹쳐 보인다(버튼 글자는 작게 위로, 시계는 그 아래) — 켜도 정보 칸의 폭이 달라지지 않아 머리가 움직이지 않는다
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
      }, h('span', { class: 'timer-label' }, icon('clock'), '시간 재기'));
      timers.push(setInterval(() => {
        if (timerOn && !finished) clock.textContent = clockText(Date.now() - startedAt);
      }, 1000));
      meta.classList.add('has-timer');
      meta.append(h('span', { class: 'meta-box meta-timer' }, timerToggle, clock));
    }

    const streakText = h('span', { class: 'streak-n' }, '');
    const streakBox = h('span', { class: 'meta-box meta-streak', hidden: true }, icon('spark'), h('b', null, streakText));
    const xpText = h('b', null, '+0');
    if (rewardsOn) meta.append(streakBox, h('span', { class: 'meta-box meta-xp' }, h('small', null, '솜씨 점수'), xpText));
    function updateMeta() {
      if (!rewardsOn) return;
      xpText.textContent = `+${play.xp()}`;
      const n = play.streak();
      streakBox.hidden = n < 2;
      streakText.textContent = `연속 ${n}`;
    }

    /** '한 번만' 답(scored: 'once')과 그 설명 점수는 새로 찾음 점수처럼 생긴 자리에서 바로 저장한다 (중간에 나가도 남는다) */
    function saveInstant() {
      if (!rewardsOn || finished) return;
      const add = play.instant() - savedXp;
      if (add <= 0) return;
      savedXp += add;
      rewardStore.addXp(add);
      saveCollections(); // 점수와 도감은 늘 같은 때의 한 쌍으로
      renderRankChip();
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
            // 새로 찾음 점수(기본 +5, 도감 정의의 xp)는 칸과 함께 바로 저장한다(같은 칸으로 다시 받을 수 없다)
            // 도감 정의에 xpAfter가 있으면 그만큼 찬 뒤의 칸은 그 점수 — 몇 번째인지는 방금 등록한 뒤의 칸 수(r.count)로 센다
            // (xpAfter.with가 있으면 함께 세는 모음의 칸까지 합친 수 — xpAfterCount)
            const def = collections.find((c) => c.id === id);
            const gain = discoverXp(collectionXp(def, xpAfterCount(collectionState, collections, def)));
            const xp = finished ? gain : play.discovered(gain);
            rewardStore.addXp(xp);
            if (!finished) savedXp += xp;
            rewardStore.addCounters({ discover: 1 });
            renderRankChip();
            updateMeta();
          }
          sfx.play('discover');
          // 화면에 보이지 않는 모음(quiet)은 안내하지 않는다 — 무엇을 찾았는지는 게임이 제 말로 알린다
          if (!collections.find((c) => c.id === id)?.quiet) feedback.announce(`새로 찾았어요: ${r.item.name} (${r.count} / ${r.total})`);
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
          saveInstant();
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
          saveInstant();
          updateMeta();
          return rewardsOn ? xp : 0;
        },
        /** 지금 상태: 이번 판 점수, 연속, 다시 일어서기 기회, 연습 점수를 주는 판인지, 누적 횟수(도장까지 몇 번 남았는지 보일 때) */
        peek() {
          const stored = rewardStore.counters();
          const a = play.summary().answers;
          return {
            on: rewardsOn,
            xp: play.xp(),
            streak: play.streak(),
            bounceReady: play.bounceReady(),
            practice: play.practice(), // false: 별 3개 단계를 다시 하는 판이라 연습 점수가 없다 ('한 번만' 답은 그래도 받는다)
            counters: { ...stored, bounce: stored.bounce + a.bounce, retryFix: stored.retryFix + a.retryFix },
          };
        },
      },
      collect: collectionsCtx.collect,
      collection: collectionsCtx.collection,
      streak: () => play.streak(),
      /** 플레이 머리의 "문제 n / N" 점 막대. done(마친 수, 기본 current − 1), check면 마친 칸에 ✓(예: 찾은 전개도 1 / 3) */
      setProgress,
      /** 작업 지시서 도우미 (선택): 오른쪽 문제 판·까닭 쪽지·보너스 쪽지 */
      ui: workOrderUi,
      feedback: { ...feedback, celebrate },
      sfx,
      h,
      /**
       * 단계를 끝낸다. stars를 생략하면 정답률로 정한다. 실패면 { cleared: false }.
       * highlights: [{ icon, label, value, xp }]로 결과의 "오늘의 솜씨" 칸을 게임이 채울 수 있다(보여 주기만).
       * starNote: 별을 직접 정했고(stars) 3개가 안 될 때, 별 아래에 보일 그 게임의 별 기준 한 문장(예: '한 번도 틀리지 않으면 별 3개!').
       *   stars를 생략한 판(정답률 기준)은 엔진의 안내("한 번만 더 맞히면 별 2개!")가 그대로 나온다.
       * practiceNote: 별 3개 단계를 다시 한 판의 안내 문장을 게임의 말로 바꾼다(그런 판에서만 보인다).
       * stats: [{ label, value }](3개까지)로 결과의 기록 칸(정답률 · 맞힘/시도)을 게임의 말로 바꾼다 — 맞힘·틀림으로 보이지 않는 단계.
       *   그런 판은 "다시 살펴볼 점"(틀린 개념 수)도 보이지 않는다. 학습 기록에는 답이 그대로 남는다.
       * title · stamp(선택): 결과 제목과 결과 도장의 글(한두 줄 [글, 글])을 게임의 말로 바꾼다 — 예: 여러 번에 나눠 하는 도전을 별 없이
       *   멈춘 판("오늘은 여기까지!" · ["다음에", "또 찾아요"]). 주지 않으면 지금까지와 같다. 점수·별·기록은 바뀌지 않는다
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
        const reward = rewardsOn ? settleRewards({ stage, play, prevStars, stars, cleared, startXp, savedXp }) : null;
        const time = stage.timer === 'optional' && timerOn && cleared ? rewardStore.recordTime(stage.id, record.durationMs) : null;
        sfx.play(cleared ? 'clear' : 'wrong');
        renderRankChip();
        // 시간 재기를 고를 수 있는 단계에서 켜지 않았으면 결과에도 걸린 시간을 보이지 않는다 (켠 학생만 시간이 보인다)
        const showTime = !(stage.timer === 'optional' && !timerOn);
        showResult(stage, record, {
          fromAccuracy, reward, highlights: result.highlights, practiceNote: result.practiceNote, stats: result.stats, starNote: result.starNote, showTime, opened, time,
          title: result.title, stamp: result.stamp,
        });
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

  /**
   * 단계를 마칠 때 점수·도장을 정산해 저장한다. → 결과 화면에 보일 것
   * savedXp: 이 판 점수 가운데 플레이 중에 이미 저장한 몫(새로 찾음, '한 번만' 답과 그 설명) — 다시 더하지 않는다
   */
  function settleRewards({ stage, play, prevStars, stars, cleared, startXp, savedXp = 0 }) {
    const summary = play.summary();
    const a = summary.answers;
    const sx = stageXp({ prevStars, stars, cleared, challenge: Boolean(stage.challenge) });
    rewardStore.addXp(play.xp() - savedXp + sx.total);
    saveCollections();
    rewardStore.addCounters({ bounce: a.bounce, retryFix: a.retryFix, explain: summary.explain.count, inspect: summary.inspect });
    const state = badgeState({
      stars: progress.allStars(),
      lessons: lessonsForBadges,
      counters: rewardStore.counters(),
      collections: Object.fromEntries(collections.map((c) => {
        const s = collectionStatus(collectionState, c);
        return [c.id, { count: s.count, total: s.total, found: [...s.found] }];
      })),
      records: log.records(), // 방금 마친 판까지 (기록 모두 지우기 뒤에는 비어 있다)
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

  function resultStamp(record, label, custom = null) {
    const words = custom ?? STAMP_WORDS[record.cleared ? record.stars : 0] ?? STAMP_WORDS[1];
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

  function showResult(stage, record, {
    fromAccuracy = true, reward = null, highlights = null, practiceNote = null, stats = null, starNote = null, showTime = true, opened = [], time = null,
    title: customTitle = null, stamp: customStamp = null,
  } = {}) {
    let nextStage = null;
    if (!stage.challenge) {
      const nextId = progress.nextStageId(stage.id);
      nextStage = nextId ? stages.find((s) => s.id === nextId) ?? null : null;
      // 차시 묶음이면 "다음 단계"는 같은 차시 안에서만
      if (nextStage && plan.groups && nextStage.lesson !== stage.lesson) nextStage = null;
    }
    const canGoNext = nextStage && progress.isUnlocked(nextStage.id);
    const isLast = !nextStage;
    // 게임이 기록 칸을 자기 말로 채운 판(맞힘·틀림으로 보이지 않는 단계)은 틀린 개념 수("다시 살펴볼 점")도 보이지 않는다
    const mistakes = customStats(stats) ? [] : countMistakes(record.answers);
    let title = '아쉬워요! 다시 해 볼까요?';
    if (record.cleared && stage.challenge) title = '도전 성공!';
    else if (record.cleared && isLast) title = plan.groups ? '이 차시를 마쳤어요!' : '모든 단계를 마쳤어요!';
    else if (record.cleared) title = '단계 성공!';
    if (typeof customTitle === 'string' && customTitle.trim()) title = customTitle.trim(); // 게임이 정한 제목 (finish({ title }))
    const stampWords = Array.isArray(customStamp) && customStamp.length > 0 && customStamp.length <= 2 && customStamp.every((w) => typeof w === 'string' && w.trim())
      ? customStamp.map((w) => w.trim()) : null;
    const number = stageNumber(stage);
    const label = stage.challenge ? '도전' : `${number}단계`;
    const eyebrow = stage.challenge ? `도전 주문서 · ${stage.title}` : label === stage.title ? label : `${label} · ${stage.title}`;
    const hint = starHint({ ...record, fromAccuracy, note: starNote });
    const practiceOff = reward ? practiceNoteText(reward.summary, practiceNote) : null;

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
          resultStamp(record, label, stampWords),
          starsEl(record.stars, 'stars-big'),
          hint && h('p', { class: 'star-hint' }, hint),
          reward && highlightTiles(highlights ?? defaultHighlights(reward.summary)),
          practiceOff && h('p', { class: 'practice-note' }, icon('info'), practiceOff),
          reward && h('p', { class: 'xp-line' }, stageXpLine(reward.sx, { challenge: Boolean(stage.challenge) })),
          time && h('p', { class: 'time-line' }, icon('clock'), timeRecordText(time)),
          h('dl', { class: 'result-stats' }, resultStats({ record, custom: stats, showTime }).map(([name, value]) => stat(name, value))),
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
      if (practiceOff) said.push(practiceOff);
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
      collections.filter((def) => !def.quiet).map((def) => collectionSection(def, collectionStatus(collectionState, def), (itemId) => foundThisVisit.has(`${def.id}:${itemId}`))),
    );
  }

  function reportScreen() {
    const records = log.records();
    const summary = summarize(records);
    const regularIds = stageIds.filter((id) => !progress.isOptional(id));
    const clearedCount = regularIds.filter((id) => progress.isCleared(id)).length;
    const rank = rewardStore.rank();
    const chips = chipsOf();
    const nameInput = h('input', {
      class: 'input',
      id: 'student-name',
      type: 'text',
      autocomplete: 'off',
      maxlength: '20',
      placeholder: '예: 3번 김○○',
    });

    const collectionParts = [
      chips.main && `도감 ${chips.main.count}/${chips.main.total}`,
      ...chips.side.map((c) => sideText(c, '/')),
      // 보이지 않는 모음 가운데 report: true인 것은 찾은 칸이 있을 때만 "제목 n/m" (예: 직육면체 전개도 3/54)
      ...reportedQuiet(collectionState, collections).map((c) => `${c.title} ${c.count}/${c.total}`),
    ].filter(Boolean);
    const copyButton = button('결과 복사', async () => {
      const extra = [];
      if (rewardsOn) {
        // 결과 복사에 한 줄: "칭호: 탐험가(60점) · 도장 4개 · 도감 4/11" (label 도감은 따로 "노트 2/24")
        extra.push([`칭호: ${rank.name}(${rank.xp}점)`, `도장 ${earnedCount()}개`, ...collectionParts].join(' · '));
      } else if (collectionParts.length) extra.push(collectionParts.join(' · '));
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
      if (areaPlan) storage.remove(AREA_KEY); // 지난번에 하던 영역도 잊는다(다음 학생은 첫 영역부터)
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

    // 도감 화면으로 가는 버튼: "전개도 도감 3 / 11" (label 도감이 있으면 뒤에 "노트 2 / 24")
    const collectionLabel = [
      chips.main && `${chips.mainDefs.length === 1 ? chips.mainDefs[0].title : '도감'} ${chips.main.count} / ${chips.main.total}`,
      ...chips.side.map((c) => sideText(c)),
    ].filter(Boolean).join(` ${DISPLAY_DOT} `) || null;
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
      else if (areaMode && areaEntry(options.areaId)?.ready) openArea(options.areaId); // ?area=<id>: 그 영역의 단계 지도로 바로 (없는·준비 중 영역이면 아래로)
      else if (areaMode && gradeEntry(Number(options.gradeId))?.ready) openGrade(Number(options.gradeId)); // ?grade=<n>: 그 학년 화면으로
      else if (introPlan && opensWithIntro(options)) openIntro(); // 게임 인트로: 수업 주소(?stage=·?lesson=·?area=·?grade=)가 없을 때만
      else show(titleScreen());
    },
    progress,
    log,
    sfx,
    rewards: rewardStore,
  };
}
