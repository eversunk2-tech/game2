import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  countMistakes,
  createLearningLog,
  formatDuration,
  formatPercent,
  formatReport,
  summarize,
} from '../../src/shared/core/learning-log.js';
import { createMemoryBackend, createStorage } from '../../src/shared/core/storage.js';

function fakeClock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms) => (t += ms) };
}

test('한 단계의 답을 모아 정답률·걸린 시간을 기록한다', () => {
  const clock = fakeClock();
  const log = createLearningLog({ now: clock.now });
  log.startStage({ id: 's1', title: '1단계' });
  log.answer({ itemId: 1, correct: true });
  clock.advance(5000);
  log.answer({ itemId: 2, correct: false, tag: '약수를 놓침' });
  log.answer({ itemId: 2, correct: true });
  assert.deepEqual(log.currentStats(), { attempts: 3, correct: 2, accuracy: 2 / 3 });
  clock.advance(61_000);
  const rec = log.endStage({ stars: 2 });
  assert.equal(rec.stageTitle, '1단계');
  assert.equal(rec.durationMs, 66_000);
  assert.equal(rec.attempts, 3);
  assert.equal(rec.stars, 2);
  assert.equal(rec.answers[1].itemId, '2');
  assert.equal(rec.answers[1].atMs, 5000);
  assert.equal(log.isRecording(), false);
});

test('startStage 없이 답하면 바로 알려 준다', () => {
  const log = createLearningLog();
  assert.throws(() => log.answer({ correct: true }), /startStage/);
});

test('취소한 단계는 남지 않고, 기록은 저장소에 남는다', () => {
  const backend = createMemoryBackend();
  const log = createLearningLog({ storage: createStorage('g', backend) });
  log.startStage({ id: 's1' });
  log.cancelStage();
  log.startStage({ id: 's1' });
  log.answer({ correct: true });
  log.endStage({ stars: 3 });
  const reopened = createLearningLog({ storage: createStorage('g', backend) });
  assert.equal(reopened.records().length, 1);
  reopened.clear();
  assert.equal(createLearningLog({ storage: createStorage('g', backend) }).records().length, 0);
});

test('records()는 복사본이라 바깥에서 바꿔도 기록이 그대로다', () => {
  const log = createLearningLog();
  log.startStage({ id: 's1' });
  log.endStage();
  log.records()[0].stageId = 'changed';
  assert.equal(log.records()[0].stageId, 's1');
});

test('maxRecords를 넘으면 오래된 것부터 지운다', () => {
  const log = createLearningLog({ maxRecords: 2 });
  for (const id of ['a', 'b', 'c']) {
    log.startStage({ id });
    log.endStage();
  }
  assert.deepEqual(log.records().map((r) => r.stageId), ['b', 'c']);
});

test('오개념 tag를 많이 틀린 순서로 센다', () => {
  const answers = [
    { correct: false, tag: 'A' },
    { correct: false, tag: 'B' },
    { correct: false, tag: 'B' },
    { correct: true, tag: 'A' },
    { correct: false, tag: null },
  ];
  assert.deepEqual(countMistakes(answers), [
    { tag: 'B', count: 2 },
    { tag: 'A', count: 1 },
  ]);
  const s = summarize([{ answers }, { answers: [{ correct: true }] }]);
  assert.equal(s.plays, 2);
  assert.equal(s.attempts, 6);
  assert.equal(s.correct, 2);
});

test('시간·퍼센트 표시', () => {
  assert.equal(formatDuration(0), '0초');
  assert.equal(formatDuration(45_400), '45초');
  assert.equal(formatDuration(60_000), '1분');
  assert.equal(formatDuration(80_000), '1분 20초');
  assert.equal(formatPercent(null), '-');
  assert.equal(formatPercent(0.876), '88%');
});

test('복사용 결과 문장', () => {
  const records = [{
    stageTitle: '12의 약수',
    attempts: 10,
    correct: 8,
    accuracy: 0.8,
    durationMs: 80_000,
    stars: 2,
    answers: [{ correct: false, tag: '1과 자기 자신도 약수' }, { correct: false, tag: '1과 자기 자신도 약수' }],
  }];
  const text = formatReport({ title: '약수 게임', records, studentName: '김○○', date: new Date(2026, 9, 7) });
  assert.match(text, /^\[약수 게임\] 학습 기록/);
  assert.match(text, /이름: 김○○/);
  assert.match(text, /날짜: 2026\. 10\. 7\./);
  assert.match(text, /- 12의 약수: 정답률 80% \(10번 중 8번\), 1분 20초, 별 2개/);
  assert.match(text, /자주 틀린 개념: 1과 자기 자신도 약수\(2번\)/);
  assert.match(formatReport({ title: 'x', records: [] }), /아직 기록이 없어요/);
});
