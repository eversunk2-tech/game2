/**
 * 모든 학습게임이 함께 쓰는 화면 흐름.
 *
 *   처음 화면 → (놀이 방법) → 단계 선택 → 플레이 → 결과 → 학습 기록
 *
 * 게임은 stages(단계 목록)와 playStage(stage, ctx)만 만들면 된다.
 * 별점·잠금 해제·학습 기록 저장·소리 켜고 끄기·결과 복사는 여기서 처리한다.
 * 사용법: docs/engine.md
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
import { createSfx } from './audio.js';
import { clear, h } from './dom.js';
import { createFeedback } from './feedback.js';

/**
 * 교사용 주소 옵션
 *   ?unlock=all   모든 단계 열기 (시범 보이기, 특정 단계만 수업)
 *   ?stage=<id>   그 단계로 바로 시작
 *   ?sound=off    소리 끄고 시작
 *   ?seed=<값>    모두 같은 문제 순서로 시작
 */
export function readUrlOptions(search = globalThis.location?.search ?? '') {
  const params = new URLSearchParams(search);
  return {
    unlockAll: params.get('unlock') === 'all',
    stageId: params.get('stage'),
    sound: params.get('sound') !== 'off',
    seed: params.get('seed'),
  };
}

function defaultSubtitle(game) {
  const parts = [];
  if (game.grades?.length) parts.push(game.grades.map((g) => `${g}학년`).join('·'));
  if (game.subject) parts.push(game.subject);
  if (game.units?.length) parts.push(game.units.join(', '));
  return parts.join(' · ');
}

function starsEl(count, extraClass = '') {
  const stars = [];
  for (let i = 0; i < MAX_STARS; i += 1) stars.push(h('span', { class: i < count ? 'on' : 'off' }, '★'));
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

export function createGameApp({ root, game, stages, playStage, howTo = [], options = readUrlOptions() }) {
  if (!root) throw new Error('createGameApp: root 요소가 필요해요.');
  if (!game?.id || !game?.title) throw new Error('createGameApp: game.id와 game.title이 필요해요.');
  if (!Array.isArray(stages) || stages.length === 0) throw new Error('createGameApp: stages가 비어 있어요.');
  if (typeof playStage !== 'function') throw new Error('createGameApp: playStage 함수가 필요해요.');
  const stageIds = stages.map((s) => s.id);
  if (new Set(stageIds).size !== stageIds.length) throw new Error('createGameApp: 단계 id가 겹쳐요.');

  const storage = createStorage(game.id);
  const progress = createProgress({ stageIds, storage, unlockAll: options.unlockAll });
  const log = createLearningLog({ storage });
  const sfx = createSfx({ storage, enabled: options.sound });

  const soundButton = h('button', {
    type: 'button',
    class: 'btn btn-small',
    onclick: () => {
      sfx.setMuted(!sfx.isMuted());
      renderSoundButton();
      sfx.play('click');
    },
  });
  function renderSoundButton() {
    soundButton.textContent = sfx.isMuted() ? '🔇 소리 끔' : '🔊 소리 켬';
  }

  const main = h('main', { class: 'screen-host' });
  root.classList.add('edu-app');
  root.append(h('header', { class: 'topbar' }, h('span', { class: 'topbar-title' }, game.title), soundButton), main);
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
    clear(main);
    main.append(screen);
    const heading = screen.querySelector('h1, h2');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    }
    globalThis.scrollTo?.(0, 0);
  }

  const button = (label, onclick, cls = 'btn') =>
    h('button', {
      type: 'button',
      class: cls,
      onclick: () => {
        sfx.play('click');
        onclick();
      },
    }, label);

  function titleScreen() {
    const subtitle = game.subtitle ?? defaultSubtitle(game);
    return h('section', { class: 'screen screen-title' },
      subtitle && h('p', { class: 'eyebrow' }, subtitle),
      h('h1', { class: 'title-main' }, game.title),
      game.summary && h('p', { class: 'lead' }, game.summary),
      h('div', { class: 'actions' },
        button('시작하기', () => show(stageSelectScreen()), 'btn btn-primary btn-lg'),
        howTo.length > 0 && button('놀이 방법', () => show(howToScreen())),
        button('학습 기록', () => show(reportScreen())),
      ),
    );
  }

  function howToScreen() {
    return h('section', { class: 'screen' },
      h('h2', null, '놀이 방법'),
      h('ol', { class: 'panel howto-list' }, howTo.map((step) => h('li', null, step))),
      h('div', { class: 'actions actions-start' },
        button('시작하기', () => show(stageSelectScreen()), 'btn btn-primary btn-lg'),
        button('처음 화면', () => show(titleScreen())),
      ),
    );
  }

  function stageSelectScreen() {
    return h('section', { class: 'screen' },
      h('div', { class: 'screen-head' },
        h('h2', null, '단계를 골라요'),
        h('p', { class: 'muted' }, `모은 별 ${progress.totalStars()} / ${progress.maxStars}`),
      ),
      h('ol', { class: 'stage-grid' }, stages.map((stage, i) => {
        const unlocked = progress.isUnlocked(stage.id);
        return h('li', null, h('button', {
          type: 'button',
          class: 'stage-card',
          disabled: !unlocked,
          onclick: () => {
            sfx.play('click');
            startStage(stage);
          },
        },
          h('span', { class: 'stage-number' }, `${i + 1}단계`),
          h('span', { class: 'stage-title' }, stage.title),
          stage.goal && h('span', { class: 'stage-goal' }, stage.goal),
          unlocked ? starsEl(progress.getStars(stage.id)) : h('span', { class: 'stage-lock' }, '🔒 앞 단계를 마치면 열려요'),
        ));
      })),
      h('div', { class: 'actions actions-start' }, button('처음 화면', () => show(titleScreen()))),
    );
  }

  function startStage(stage) {
    const area = h('div', { class: 'play-area' });
    show(h('section', { class: 'screen screen-play' },
      h('div', { class: 'play-header' },
        button('← 단계 선택', () => {
          log.cancelStage();
          show(stageSelectScreen());
        }, 'btn btn-small'),
        h('div', { class: 'play-header-text' },
          h('h2', { class: 'play-title' }, stage.title),
          stage.goal && h('p', { class: 'play-goal' }, stage.goal),
        ),
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
        const stars = cleared ? clampStars(result.stars ?? starsFromAccuracy(log.currentStats().accuracy)) : 0;
        const record = log.endStage({ stars, cleared });
        progress.record(stage.id, stars);
        sfx.play(cleared ? 'clear' : 'wrong');
        show(resultScreen(stage, record));
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

  function resultScreen(stage, record) {
    const nextStage = stages[stageIds.indexOf(stage.id) + 1] ?? null;
    const canGoNext = nextStage && progress.isUnlocked(nextStage.id);
    const isLast = !nextStage;
    const mistakes = countMistakes(record.answers);
    let title = '아쉬워요! 다시 해 볼까요?';
    if (record.cleared) title = isLast ? '모든 단계를 마쳤어요!' : '단계 성공!';

    const stat = (label, value, sub) =>
      h('div', { class: 'stat' }, h('dt', null, label), h('dd', null, value), sub && h('dd', { class: 'stat-sub' }, sub));

    return h('section', { class: 'screen screen-result' },
      h('h2', { class: 'result-title' }, title),
      starsEl(record.stars, 'stars-big'),
      h('dl', { class: 'result-stats' },
        stat('정답률', formatPercent(record.accuracy), record.attempts ? `${record.attempts}번 중 ${record.correct}번 맞힘` : null),
        stat('걸린 시간', formatDuration(record.durationMs)),
      ),
      mistakes.length > 0 && h('div', { class: 'panel' },
        h('h3', null, '다시 살펴볼 점'),
        h('ul', null, mistakes.map((m) => h('li', null, `${m.tag} (${m.count}번)`))),
      ),
      h('div', { class: 'actions' },
        canGoNext && button('다음 단계', () => startStage(nextStage), 'btn btn-primary btn-lg'),
        isLast && record.cleared && button('학습 기록 보기', () => show(reportScreen()), 'btn btn-primary btn-lg'),
        button('다시 하기', () => startStage(stage)),
        button('단계 선택', () => show(stageSelectScreen())),
      ),
    );
  }

  function reportScreen() {
    const records = log.records();
    const summary = summarize(records);
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
    }, 'btn btn-primary');

    let confirming = false;
    const clearButton = button('기록·별 모두 지우기', () => {
      if (!confirming) {
        confirming = true;
        clearButton.textContent = '한 번 더 누르면 지워져요';
        return;
      }
      log.clear();
      progress.reset();
      show(reportScreen());
      feedback.info('기록을 지웠어요.');
    });

    const body = records.length === 0
      ? h('p', { class: 'panel' }, '아직 기록이 없어요. 게임을 하면 여기에 쌓여요.')
      : [
        h('p', null, `지금까지 ${summary.plays}번 했고, 전체 정답률은 ${formatPercent(summary.accuracy)}예요.`),
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
        summary.mistakes.length > 0 && h('div', { class: 'panel' },
          h('h3', null, '자주 틀린 개념'),
          h('ol', null, summary.mistakes.slice(0, 5).map((m) => h('li', null, `${m.tag} (${m.count}번)`))),
        ),
      ];

    return h('section', { class: 'screen' },
      h('h2', null, '학습 기록'),
      body,
      h('div', { class: 'field' },
        h('label', { for: 'student-name' }, '이름 (선택 · 저장되지 않고 복사할 때만 쓰여요)'),
        nameInput,
      ),
      h('div', { class: 'actions actions-start' }, copyButton, clearButton, button('처음 화면', () => show(titleScreen()))),
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
