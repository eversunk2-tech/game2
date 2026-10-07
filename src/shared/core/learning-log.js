/**
 * 학습 기록: 단계마다 학생의 답(맞음/틀림, 오개념 태그)을 모아
 * 결과 화면·교사용 학습 기록·"결과 복사" 문장을 만든다.
 *
 * tag는 "왜 틀렸는지"를 사람이 읽을 수 있게 적은 말이다.
 * 예: '1과 자기 자신도 약수', '약수와 배수 혼동'
 * 기획서의 "오개념·막히는 지점" 표와 같은 말을 쓴다.
 */

export function countAnswers(answers) {
  const attempts = answers.length;
  const correct = answers.filter((a) => a.correct).length;
  return { attempts, correct, accuracy: attempts === 0 ? null : correct / attempts };
}

/** 틀린 답을 tag별로 세어 많은 순서로 돌려준다. tag가 없는 오답은 세지 않는다. */
export function countMistakes(answers) {
  const counts = new Map();
  for (const answer of answers) {
    if (answer.correct || !answer.tag) continue;
    counts.set(answer.tag, (counts.get(answer.tag) ?? 0) + 1);
  }
  // Map은 처음 나온 순서를 지키므로 sort가 안정적이면 같은 횟수는 먼저 나온 순서가 된다.
  return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count);
}

export function summarize(records) {
  const answers = records.flatMap((r) => r.answers ?? []);
  return { plays: records.length, ...countAnswers(answers), mistakes: countMistakes(answers) };
}

export function createLearningLog({ storage = null, key = 'log', maxRecords = 200, now = () => Date.now() } = {}) {
  const saved = storage?.get(key, []);
  let records = Array.isArray(saved) ? saved : [];
  let current = null;

  const save = () => storage?.set(key, records);

  function requireCurrent(method) {
    if (!current) throw new Error(`learning log: ${method}() 전에 startStage()를 불러야 해요.`);
  }

  return {
    startStage(stage) {
      current = { stageId: stage.id, stageTitle: stage.title ?? stage.id, startedAt: now(), answers: [] };
    },

    /** 학생이 한 번 답할 때마다 부른다. */
    answer({ itemId = null, correct, tag = null, given = null, expected = null } = {}) {
      requireCurrent('answer');
      current.answers.push({
        itemId: itemId == null ? null : String(itemId),
        correct: Boolean(correct),
        tag,
        given,
        expected,
        atMs: now() - current.startedAt,
      });
    },

    currentStats() {
      return countAnswers(current ? current.answers : []);
    },

    endStage({ stars = 0, cleared = true } = {}) {
      requireCurrent('endStage');
      const record = {
        ...current,
        durationMs: now() - current.startedAt,
        stars,
        cleared,
        ...countAnswers(current.answers),
      };
      records.push(record);
      if (records.length > maxRecords) records = records.slice(-maxRecords);
      save();
      current = null;
      return record;
    },

    /** 단계를 끝내지 않고 나갈 때. 기록에 남기지 않는다. */
    cancelStage() {
      current = null;
    },

    isRecording() {
      return current !== null;
    },

    records() {
      // 기록은 JSON으로 저장되므로 JSON 복사로 충분하다 (structuredClone은 Safari 15.4+).
      return JSON.parse(JSON.stringify(records));
    },

    clear() {
      records = [];
      current = null;
      save();
    },
  };
}

export function formatPercent(accuracy) {
  return accuracy == null ? '-' : `${Math.round(accuracy * 100)}%`;
}

export function formatDuration(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes === 0) return `${seconds}초`;
  return seconds === 0 ? `${minutes}분` : `${minutes}분 ${seconds}초`;
}

export function formatDate(date) {
  return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}.`;
}

/**
 * 학생이 복사해서 클래스룸·패들렛 등에 붙여 넣을 결과 문장.
 * extra: 끝에 덧붙일 줄(예: 엔진이 넣는 "칭호: 탐험가(60점) · 도장 4개 · 도감 4/11"). 기록이 없으면 넣지 않는다.
 */
export function formatReport({ title, records, studentName = '', date = new Date(), extra = [] }) {
  const lines = [`[${title}] 학습 기록`, `이름: ${studentName || '(쓰지 않음)'}`, `날짜: ${formatDate(date)}`, ''];
  if (records.length === 0) {
    lines.push('아직 기록이 없어요.');
    return lines.join('\n');
  }
  for (const r of records) {
    lines.push(
      `- ${r.stageTitle}: 정답률 ${formatPercent(r.accuracy)} (${r.attempts}번 중 ${r.correct}번), ${formatDuration(r.durationMs)}, 별 ${r.stars}개`,
    );
  }
  const summary = summarize(records);
  lines.push('', `전체 정답률: ${formatPercent(summary.accuracy)} (${summary.plays}번 플레이)`);
  if (summary.mistakes.length > 0) {
    const top = summary.mistakes.slice(0, 3).map((m) => `${m.tag}(${m.count}번)`);
    lines.push(`자주 틀린 개념: ${top.join(', ')}`);
  }
  for (const line of extra) if (line) lines.push(String(line));
  return lines.join('\n');
}
