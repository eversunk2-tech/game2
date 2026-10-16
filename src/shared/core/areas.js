/**
 * 영역(선택 기능): 차시 묶음을 몇 개의 영역으로 나눈다(예: "5학년 전개도" · "쌓기나무").
 * 화면과 상관없는 순수 로직 — 엔진(ui/app.js)이 처음 화면의 영역 카드·단계 지도의 영역 탭에 쓴다. 사용법: docs/engine.md 2절 "영역".
 *
 *   areas: [{ id, title, grades?, note?, lessons: ['cube', 'cuboid'], art?, howTo? }, …]
 *
 * - 영역의 lessons에 적힌 차시 가운데 게임에 없는 차시(아직 만들지 않은 차시)는 조용히 건너뛴다(만들어지면 저절로 보인다).
 * - 보이는 차시가 하나도 없는 영역은 보이지 않는다(카드·탭 없음).
 * - 게임의 차시(단계가 있는 것)는 꼭 한 영역에만 들어 있어야 한다(빠지거나 두 영역에 있으면 오류 — 화면에서 사라지는 차시가 없게).
 */

/** "지난번에 하던 영역"을 기억하는 저장 열쇠 (createStorage(game.id) 안. 다른 저장 값의 열쇠·모양은 그대로) */
export const AREA_KEY = 'area';

const text = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * 영역 정의를 확인하고 보이는 영역만 돌려준다. areas가 없거나 비었으면 null(영역을 쓰지 않는 게임 — 지금과 똑같다).
 * @param {Array|null} areas   게임이 준 영역 정의
 * @param {Array<{ lesson: { id }, stages }>} groups  단계가 있는 차시 묶음(차시 순서) — 엔진의 planLessons 결과
 * @param {Array|null} lessons 게임이 준 차시 정의(모든 차시)
 * @returns {null | Array<{ area, groups }>}  보이는 영역(정의 순서)과 그 영역의 차시 묶음(영역의 lessons 순서)
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
    for (const lessonId of area.lessons) {
      if (owner.has(lessonId) && owner.get(lessonId) !== area.id) throw new Error(`createGameApp: 차시 ${lessonId}가 두 영역(${owner.get(lessonId)}, ${area.id})에 있어요.`);
      owner.set(lessonId, area.id);
    }
  }
  const stray = groups.find((g) => !owner.has(g.lesson.id));
  if (stray) throw new Error(`createGameApp: 차시 ${stray.lesson.id}가 어느 영역에도 없어요.`);
  return areas
    .map((area) => ({
      area,
      groups: [...new Set(area.lessons)].map((id) => groups.find((g) => g.lesson.id === id)).filter(Boolean),
    }))
    .filter((entry) => entry.groups.length > 0);
}

/** 그 차시가 든 보이는 영역 (없으면 null) */
export function areaOfLesson(plan, lessonId) {
  if (!plan || lessonId == null) return null;
  return plan.find((entry) => entry.groups.some((g) => g.lesson.id === lessonId)) ?? null;
}

/** 영역 안에서 그 차시의 차례(1부터). 영역에 없으면 null */
export function lessonNumberInArea(plan, lessonId) {
  const entry = areaOfLesson(plan, lessonId);
  return entry ? entry.groups.findIndex((g) => g.lesson.id === lessonId) + 1 : null;
}

/**
 * "여기부터!"를 붙일 영역 id: 저장된 "지난번에 하던 영역"이 보이는 영역이면 그것, 아니면(처음·옛 저장 값·없어진 영역) 첫 영역.
 * saved는 저장소에서 읽은 값 그대로(무엇이든 될 수 있다)
 */
export function startAreaId(plan, saved) {
  if (!plan || plan.length === 0) return null;
  return plan.some((entry) => entry.area.id === saved) ? saved : plan[0].area.id;
}

/** 영역 카드의 학년·단원 한 줄: note에 학년이 있거나 영역 이름에 학년이 있으면 note 그대로, 아니면 "6학년 · note" */
export function areaLine(area) {
  const note = text(area?.note);
  const grades = Array.isArray(area?.grades) && area.grades.length ? `${area.grades.join('·')}학년` : '';
  if (!grades || note.includes('학년') || text(area?.title).includes('학년')) return note;
  return note ? `${grades} · ${note}` : grades;
}

/** 영역 카드·탭의 화면 읽기 이름: "5학년 전개도, 정육면체ㆍ직육면체, 차시 2개, 모은 별 0 / 24" (+ ", 여기부터") */
export function areaLabel(area, { lessons, stars, maxStars, here = false }) {
  const line = areaLine(area);
  return [text(area.title), line, `차시 ${lessons}개`, `모은 별 ${stars} / ${maxStars}`, here ? '여기부터' : '']
    .filter(Boolean)
    .join(', ');
}
