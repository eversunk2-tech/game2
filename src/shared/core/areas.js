/**
 * 영역(선택 기능): 차시 묶음을 몇 개의 영역으로 나누고, 영역을 학년 아래에 둘 수 있다
 * (예: 5학년 — 정육면체의 전개도 · 직육면체의 전개도 / 6학년 — 각기둥의 전개도 · 쌓기나무 · 원기둥의 전개도).
 * 화면과 상관없는 순수 로직 — 엔진(ui/app.js)이 처음 화면의 학년·영역 카드, 학년 화면, 단계 지도의 영역 탭에 쓴다. 사용법: docs/engine.md 2절 "영역".
 *
 *   areas:  [{ id, title, grade?, note?, lessons: ['cube'], art?, howTo? }, …]
 *   grades: [{ grade: 5, title?, note?, art? }, …]   (선택 — 영역에 grade가 있을 때 학년 카드의 글·그림)
 *
 * - 영역의 lessons에 적힌 차시 가운데 게임에 없는 차시(아직 만들지 않은 차시)는 조용히 건너뛴다(만들어지면 저절로 들어간다).
 * - 보이는 차시가 하나도 없는 영역은 "준비 중"(ready: false)이다 — 카드는 보이지만 누를 수 없고, 영역 탭에는 없다. 차시가 생기면 저절로 열린다.
 * - 게임의 차시(단계가 있는 것)는 꼭 한 영역에만 들어 있어야 한다(빠지거나 두 영역에 있으면 오류 — 화면에서 사라지는 차시가 없게).
 * - 영역에 grade를 하나라도 주면 모든 영역에 grade가 있어야 한다(학년 → 영역 → 단계 지도).
 */

/** "지난번에 하던 영역"을 기억하는 저장 열쇠 (createStorage(game.id) 안. 학년은 그 영역의 학년. 다른 저장 값의 열쇠·모양은 그대로) */
export const AREA_KEY = 'area';

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const isGrade = (value) => Number.isInteger(value) && value > 0;

/**
 * 영역 정의를 확인하고 영역마다 그 영역의 차시 묶음을 붙여 돌려준다. areas가 없거나 비었으면 null(영역을 쓰지 않는 게임 — 지금과 똑같다).
 * @param {Array|null} areas   게임이 준 영역 정의
 * @param {Array<{ lesson: { id }, stages }>} groups  단계가 있는 차시 묶음(차시 순서) — 엔진의 planLessons 결과
 * @param {Array|null} lessons 게임이 준 차시 정의(모든 차시)
 * @returns {null | Array<{ area, groups, ready }>}  영역(정의 순서)과 그 영역의 차시 묶음(영역의 lessons 순서). ready: 차시가 하나라도 있다
 */
export function planAreas(areas, groups, lessons) {
  if (areas == null) return null;
  if (!Array.isArray(areas)) throw new Error('createGameApp: areas는 [{ id, title, lessons }] 배열이에요.');
  if (areas.length === 0) return null;
  if (!Array.isArray(lessons) || lessons.length === 0) throw new Error('createGameApp: areas는 lessons(차시 묶음)와 함께 써요.');
  const ids = new Set();
  const owner = new Map(); // 차시 id → 영역 id
  for (const area of areas) {
    if (!area || !text(area.id) || !text(area.title)) throw new Error('createGameApp: 영역마다 id와 title이 필요해요.');
    if (ids.has(area.id)) throw new Error(`createGameApp: 영역 id가 겹쳐요: ${area.id}`);
    ids.add(area.id);
    if (!Array.isArray(area.lessons)) throw new Error(`createGameApp: 영역 ${area.id}에 lessons(차시 id 목록)가 필요해요.`);
    if (area.art != null && typeof area.art !== 'function') throw new Error(`createGameApp: 영역 ${area.id}의 art는 (h) => 요소 함수예요.`);
    if (area.grade != null && !isGrade(area.grade)) throw new Error(`createGameApp: 영역 ${area.id}의 grade는 학년 숫자예요.`);
    for (const lessonId of area.lessons) {
      if (owner.has(lessonId) && owner.get(lessonId) !== area.id) throw new Error(`createGameApp: 차시 ${lessonId}가 두 영역(${owner.get(lessonId)}, ${area.id})에 있어요.`);
      owner.set(lessonId, area.id);
    }
  }
  const graded = areas.filter((a) => a.grade != null).length;
  if (graded > 0 && graded < areas.length) throw new Error('createGameApp: 영역에 grade를 쓰면 모든 영역에 grade가 있어야 해요.');
  const stray = groups.find((g) => !owner.has(g.lesson.id));
  if (stray) throw new Error(`createGameApp: 차시 ${stray.lesson.id}가 어느 영역에도 없어요.`);
  return areas.map((area) => {
    const own = [...new Set(area.lessons)].map((id) => groups.find((g) => g.lesson.id === id)).filter(Boolean);
    return { area, groups: own, ready: own.length > 0 };
  });
}

/**
 * 학년(영역에 grade가 있을 때): 학년마다 그 학년의 영역(정의 순서, 준비 중 포함). 학년이 없으면 null.
 * 학년 차례는 grades 정의 순서, 정의에 없는 학년은 그 뒤에 영역에 나온 차례로. 제목이 없으면 "n학년"
 * @returns {null | Array<{ grade, title, note, art, areas: Array<{ area, groups, ready }>, ready }>}
 */
export function planGrades(areaPlan, grades = null) {
  if (!areaPlan || !areaPlan.some((entry) => entry.area.grade != null)) return null;
  if (grades != null && !Array.isArray(grades)) throw new Error('createGameApp: grades는 [{ grade, title, note }] 배열이에요.');
  const defs = grades ?? [];
  for (const def of defs) {
    if (!def || !isGrade(def.grade)) throw new Error('createGameApp: grades마다 grade(학년 숫자)가 필요해요.');
    if (def.art != null && typeof def.art !== 'function') throw new Error(`createGameApp: ${def.grade}학년의 art는 (h) => 요소 함수예요.`);
  }
  const order = [...new Set([...defs.map((d) => d.grade), ...areaPlan.map((e) => e.area.grade)])].filter((g) => areaPlan.some((e) => e.area.grade === g));
  return order.map((grade) => {
    const def = defs.find((d) => d.grade === grade) ?? {};
    const areas = areaPlan.filter((e) => e.area.grade === grade);
    return { grade, title: text(def.title) || `${grade}학년`, note: text(def.note), art: def.art ?? null, areas, ready: areas.some((e) => e.ready) };
  });
}

/** 그 차시가 든 영역 (없으면 null) */
export function areaOfLesson(plan, lessonId) {
  if (!plan || lessonId == null) return null;
  return plan.find((entry) => entry.groups.some((g) => g.lesson.id === lessonId)) ?? null;
}

/**
 * "여기부터!"를 붙일 영역 id: 저장된 "지난번에 하던 영역"이 열린(차시가 있는) 영역이면 그것, 아니면(처음·옛 저장 값·없어진 영역·준비 중) 첫 열린 영역.
 * within을 주면 그 영역들 안에서만 고른다(학년 화면: 그 학년의 영역). saved는 저장소에서 읽은 값 그대로(무엇이든 될 수 있다)
 */
export function startAreaId(plan, saved, within = plan) {
  const ready = (within ?? []).filter((entry) => entry.ready);
  if (ready.length === 0) return null;
  return ready.some((entry) => entry.area.id === saved) ? saved : ready[0].area.id;
}

/** "여기부터!"를 붙일 학년: 저장된 지난 영역의 학년(열린 영역일 때), 아니면 열린 영역이 있는 첫 학년 */
export function startGrade(grades, saved) {
  if (!grades || grades.length === 0) return null;
  const last = grades.find((g) => g.areas.some((e) => e.ready && e.area.id === saved));
  return (last ?? grades.find((g) => g.ready) ?? grades[0]).grade;
}

/** 영역 카드의 학년·단원 한 줄: note에 학년이 있거나 영역 이름에 학년이 있으면 note 그대로, 아니면 "6학년 · note" */
export function areaLine(area) {
  const note = text(area?.note);
  const grades = Array.isArray(area?.grades) && area.grades.length ? `${area.grades.join('·')}학년` : isGrade(area?.grade) ? `${area.grade}학년` : '';
  if (!grades || note.includes('학년') || text(area?.title).includes('학년')) return note;
  return note ? `${grades} · ${note}` : grades;
}

/**
 * 영역 카드·탭의 화면 읽기 이름: "정육면체의 전개도, 5학년 2학기 · 직육면체, 차시 1개, 모은 별 0 / 12" (+ ", 여기부터").
 * 준비 중인 영역은 "각기둥의 전개도, 준비 중"
 */
export function areaLabel(area, { lessons, stars, maxStars, here = false, ready = true }) {
  if (!ready) return `${text(area.title)}, 준비 중`;
  const line = areaLine(area);
  return [text(area.title), line, `차시 ${lessons}개`, `모은 별 ${stars} / ${maxStars}`, here ? '여기부터' : '']
    .filter(Boolean)
    .join(', ');
}

/** 학년 카드의 화면 읽기 이름: "5학년, 정육면체, 직육면체 전개도 탐구, 모은 별 0 / 24" (+ ", 여기부터") */
export function gradeCardLabel(grade, { stars, maxStars, here = false }) {
  return [grade.title, grade.note, `모은 별 ${stars} / ${maxStars}`, here ? '여기부터' : ''].filter(Boolean).join(', ');
}
