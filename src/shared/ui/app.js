/**
 * 모든 학습게임이 함께 쓰는 화면 흐름 ("종이 공방" 모습).
 *
 *   처음 화면 → (놀이 방법) → 단계 선택(단계 지도) → 플레이 → 결과 → 학습 기록
 *
 * 게임은 stages(단계 목록)와 playStage(stage, ctx)만 만들면 된다.
 * 별점·잠금 해제·학습 기록 저장·소리 켜고 끄기·결과 복사는 여기서 처리한다.
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
import { MAX_STARS, clampStars, createProgress, starsFromAccuracy } from '../core/progress.js';
import { createRng } from '../core/random.js';
import { createStorage } from '../core/storage.js';
import { splitTitleMark } from '../core/title-mark.js';
import { createSfx } from './audio.js';
import { clear, h } from './dom.js';
import { createFeedback } from './feedback.js';
import { icon, starIcon } from './icons.js';

/**
 * 교사용 주소 옵션
 *   ?unlock=all   모든 단계 열기 (시범 보이기, 특정 단계만 수업)
 *   ?stage=<id>   그 단계로 바로 시작
 *   ?sound=off    소리 끄고 시작
 *   ?seed=<값>    모두 같은 문제 순서로 시작
 *   ?lesson=<id>  그 차시 묶음의 단계만 보이기 (게임이 lessons를 쓸 때)
 */
export function readUrlOptions(search = globalThis.location?.search ?? '') {
  const params = new URLSearchParams(search);
  return {
    unlockAll: params.get('unlock') === 'all',
    stageId: params.get('stage'),
    lessonId: params.get('lesson'),
    sound: params.get('sound') !== 'off',
    seed: params.get('seed'),
  };
}

/**
 * 차시 묶음(선택 기능). lessons가 없으면 단계 목록을 그대로 쓴다.
 * lessons가 있으면 단계를 차시 순서로 묶고, 차시마다 첫 단계를 처음부터 연다.
 * lessonId가 어떤 차시와 맞으면 그 차시의 단계만 쓴다(맞지 않으면 모든 차시).
 */
function planLessons(stages, lessons, lessonId) {
  if (!Array.isArray(lessons) || lessons.length === 0) {
    return { stages, groups: null, current: null, openIds: [] };
  }
  if (lessons.some((l) => !l?.id || !l?.title)) throw new Error('createGameApp: 차시마다 id와 title이 필요해요.');
  const lessonIds = lessons.map((l) => l.id);
  if (new Set(lessonIds).size !== lessonIds.length) throw new Error('createGameApp: 차시 id가 겹쳐요.');
  const stray = stages.find((s) => !lessonIds.includes(s.lesson));
  if (stray) throw new Error(`createGameApp: 단계 ${stray.id}의 lesson이 lessons에 없어요.`);

  const groups = lessons
    .map((lesson, index) => ({ lesson, number: index + 1, stages: stages.filter((s) => s.lesson === lesson.id) }))
    .filter((g) => g.stages.length > 0);
  const current = lessonId ? groups.find((g) => g.lesson.id === lessonId) ?? null : null;
  const shown = current ? [current] : groups;
  return {
    stages: shown.flatMap((g) => g.stages),
    groups: shown,
    current: current?.lesson ?? null,
    openIds: shown.map((g) => g.stages[0].id),
  };
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
  options = readUrlOptions(),
}) {
  if (!root) throw new Error('createGameApp: root 요소가 필요해요.');
  if (!game?.id || !game?.title) throw new Error('createGameApp: game.id와 game.title이 필요해요.');
  if (!Array.isArray(allStages) || allStages.length === 0) throw new Error('createGameApp: stages가 비어 있어요.');
  if (typeof playStage !== 'function') throw new Error('createGameApp: playStage 함수가 필요해요.');
  if (heroArt != null && typeof heroArt !== 'function') throw new Error('createGameApp: heroArt는 (h) => 요소 함수예요.');
  const allIds = allStages.map((s) => s.id);
  if (new Set(allIds).size !== allIds.length) throw new Error('createGameApp: 단계 id가 겹쳐요.');

  // 이번에 보이는 단계 (차시 묶음이면 차시 순서, ?lesson=이면 그 차시만)
  const plan = planLessons(allStages, lessons, options.lessonId);
  const { stages } = plan;
  const stageIds = stages.map((s) => s.id);
  const groups = plan.groups ?? [{ lesson: null, number: null, stages }];
  /** 단계 번호: 차시마다 1단계부터 */
  const stageNumber = (stage) => {
    const group = groups.find((g) => g.stages.includes(stage));
    return group ? group.stages.indexOf(stage) + 1 : stageIds.indexOf(stage.id) + 1;
  };

  const storage = createStorage(game.id);
  const progress = createProgress({ stageIds, storage, unlockAll: options.unlockAll, openIds: plan.openIds });
  const log = createLearningLog({ storage });
  const sfx = createSfx({ storage, enabled: options.sound });

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

  const main = h('main', { class: 'screen-host' });
  root.classList.add('edu-app');
  if (isColor(game.color)) root.style.setProperty('--game-color', game.color);
  root.append(
    h('header', { class: 'topbar' },
      h('span', { class: 'brand' },
        h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, [...String(game.title).trim()][0] ?? ''),
        h('span', { class: 'topbar-title' }, game.title),
      ),
      h('span', { class: 'topbar-space' }),
      soundButton,
    ),
    main,
  );
  const feedback = createFeedback(root);

  let cleanup = null;
  function stopPlay() {
    const fn = cleanup;
    cleanup = null;
    if (!fn) return;
    try {
      fn();
    } catch (error) {
      console.error(error);
    }
  }

  function show(screen) {
    stopPlay();
    feedback.clear();
    feedback.anchor(null);
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

  function stageSelectScreen() {
    const minutes = game.playMinutes ? h('span', { class: 'chip' }, icon('clock'), `약 ${game.playMinutes}분`) : null;
    return h('section', { class: 'screen screen-stages' },
      h('div', { class: 'screen-head' },
        h('h2', null, '단계를 골라요'),
        h('p', { class: 'chip chip-ink chip-lg star-total' }, starIcon(true), `모은 별 ${progress.totalStars()} / ${progress.maxStars}`),
      ),
      plan.groups
        ? plan.groups.map((g) => h('section', { class: 'sheet lesson-group', dataset: { lesson: g.lesson.id } },
          h('div', { class: 'lesson-head' },
            h('span', { class: 'lesson-no' }, `${g.number}차시`),
            h('h3', { class: 'lesson-title' }, g.lesson.title),
            minutes && h('span', { class: 'lesson-chips' }, minutes.cloneNode(true)),
          ),
          stagePath(g.stages),
        ))
        : h('section', { class: 'sheet stage-board' }, stagePath(stages)),
      h('div', { class: 'actions actions-start' }, button('처음 화면', () => show(titleScreen()), 'btn', 'home')),
    );
  }

  function startStage(stage) {
    const area = h('div', { class: 'play-area' });
    show(h('section', { class: 'screen screen-play' },
      h('div', { class: 'play-header' },
        button('← 단계 선택', () => {
          log.cancelStage();
          show(stageSelectScreen());
        }, 'btn btn-small btn-back'),
        h('div', { class: 'play-header-text' },
          h('div', { class: 'play-title-row' },
            h('h2', { class: 'play-title' }, stage.title),
            h('span', { class: 'chip chip-butter play-chip' }, stage.chip ?? `${stageNumber(stage)}단계`),
          ),
          stage.goal && h('p', { class: 'play-goal' }, stage.goal),
        ),
        // 문제 진행·연속·솜씨 점수 상자 자리 (D2에서 채운다)
        h('div', { class: 'play-meta' }),
      ),
      area,
    ));

    log.startStage(stage);
    let finished = false;
    const ctx = {
      el: area,
      stage,
      game,
      rng: createRng(options.seed != null ? `${options.seed}:${stage.id}` : `${Date.now()}:${stage.id}`),
      log: {
        answer: (entry) => {
          if (!finished) log.answer(entry);
        },
        stats: () => log.currentStats(),
      },
      feedback,
      sfx,
      h,
      /** 단계를 끝낸다. stars를 생략하면 정답률로 정한다. 실패면 { cleared: false } */
      finish(result = {}) {
        if (finished) return;
        finished = true;
        const cleared = result.cleared ?? true;
        const fromAccuracy = result.stars == null;
        const stars = cleared ? clampStars(result.stars ?? starsFromAccuracy(log.currentStats().accuracy)) : 0;
        const record = log.endStage({ stars, cleared });
        progress.record(stage.id, stars);
        sfx.play(cleared ? 'clear' : 'wrong');
        show(resultScreen(stage, record, { fromAccuracy }));
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

  function resultStamp(record, number) {
    const words = STAMP_WORDS[record.cleared ? record.stars : 0] ?? STAMP_WORDS[1];
    const d = new Date(record.startedAt ?? Date.now());
    return h('div', { class: `stamp result-stamp${record.cleared ? '' : ' stamp-blue'}`, 'aria-hidden': 'true' },
      h('span', { class: 'stamp-inner' },
        words.map((w) => h('b', null, w)),
        h('small', null, `${d.getMonth() + 1}.${d.getDate()} · ${number}단계`),
      ),
    );
  }

  function resultScreen(stage, record, { fromAccuracy = true } = {}) {
    let nextStage = stages[stageIds.indexOf(stage.id) + 1] ?? null;
    // 차시 묶음이면 "다음 단계"는 같은 차시 안에서만
    if (nextStage && plan.groups && nextStage.lesson !== stage.lesson) nextStage = null;
    const canGoNext = nextStage && progress.isUnlocked(nextStage.id);
    const isLast = !nextStage;
    const mistakes = countMistakes(record.answers);
    let title = '아쉬워요! 다시 해 볼까요?';
    if (record.cleared && isLast) title = plan.groups ? '이 차시를 마쳤어요!' : '모든 단계를 마쳤어요!';
    else if (record.cleared) title = '단계 성공!';
    const number = stageNumber(stage);
    const hint = starHint({ ...record, fromAccuracy });

    const stat = (label, value) => h('div', { class: 'stat' }, h('dt', null, label), h('dd', null, value));
    const side = [
      mistakes.length > 0 && h('section', { class: 'panel review-note' },
        h('h3', null, icon('search'), '다시 살펴볼 점'),
        h('ul', null, mistakes.map((m) => h('li', null, `${m.tag} (${m.count}번)`))),
      ),
    ].filter(Boolean);

    return h('section', { class: 'screen screen-result' },
      h('div', { class: `result-wrap${side.length ? '' : ' is-single'}` },
        h('section', { class: 'sheet certificate tape' },
          h('p', { class: 'cert-eyebrow' }, `${number}단계 · ${stage.title}`),
          h('h2', { class: 'result-title' }, title),
          resultStamp(record, number),
          starsEl(record.stars, 'stars-big'),
          hint && h('p', { class: 'star-hint' }, hint),
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
  }

  function reportScreen() {
    const records = log.records();
    const summary = summarize(records);
    const clearedCount = stageIds.filter((id) => progress.isCleared(id)).length;
    const nameInput = h('input', {
      class: 'input',
      id: 'student-name',
      type: 'text',
      autocomplete: 'off',
      maxlength: '20',
      placeholder: '예: 3번 김○○',
    });

    const copyButton = button('결과 복사', async () => {
      const text = formatReport({ title: game.title, records, studentName: nameInput.value.trim() });
      const ok = await copyText(text);
      feedback.info(ok ? '결과를 복사했어요. 원하는 곳에 붙여 넣으세요.' : '복사하지 못했어요. 화면을 캡처해 주세요.');
    }, 'btn btn-primary', 'copy');

    let confirming = false;
    const clearButton = button('기록·별 모두 지우기', () => {
      if (!confirming) {
        confirming = true;
        clearButton.replaceChildren(icon('trash'), '한 번 더 누르면 지워져요');
        clearButton.classList.add('is-confirm');
        return;
      }
      log.clear();
      progress.reset();
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

    return h('section', { class: 'screen screen-report' },
      h('div', { class: 'screen-head' },
        h('h2', null, '학습 기록'),
        h('div', { class: 'actions' }, copyButton, button('처음 화면', () => show(titleScreen()), 'btn', 'home')),
      ),
      h('dl', { class: 'summary-tiles' },
        tile('한 판 수', `${summary.plays}번`),
        tile('전체 정답률', formatPercent(summary.accuracy)),
        tile('모은 별', `${progress.totalStars()} / ${progress.maxStars}`),
        tile('마친 단계', `${clearedCount} / ${stageIds.length}`),
      ),
      body,
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
      const direct = options.stageId ? stages.find((s) => s.id === options.stageId) : null;
      if (direct && progress.isUnlocked(direct.id)) startStage(direct);
      else show(titleScreen());
    },
    progress,
    log,
    sfx,
  };
}
