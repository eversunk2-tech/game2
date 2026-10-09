# 공통 엔진 사용법

모든 게임은 `src/shared/`의 엔진을 함께 쓴다. 게임 하나가 만드는 것은 **단계 목록**과 **단계 하나를 플레이하는 함수**뿐이다.
처음 화면, 놀이 방법, 단계 선택(잠금·별), 결과, 학습 기록, 소리 켜고 끄기, 결과 복사는 엔진이 만든다.
솜씨 점수·칭호·연속·다시 일어서기·도장판도 엔진이 붙인다. 게임이 `ctx.log.answer`로 답을 기록하기만 하면 저절로 붙는다(아래 10절).
화면 모습은 공통 디자인 "종이 공방"([docs/design/spec.md](design/spec.md))이라 게임이 따로 꾸미지 않아도 모든 게임이 같은 모습이 된다.

완성된 예시: [`src/games/sample-divisor-sort/`](../src/games/sample-divisor-sort/)

```
src/shared/
├── core/                 화면과 상관없는 순수 로직 (Node에서 테스트)
│   ├── storage.js        게임별 localStorage (막혀도 메모리로 동작)
│   ├── progress.js       단계 잠금 해제, 별 개수
│   ├── learning-log.js   답 기록, 오개념 집계, 복사용 결과 문장
│   ├── random.js         시드 고정 난수 (shuffle, sample, int, pick)
│   ├── korean.js         조사 고르기 josa(12, '을/를') → '12를'
│   ├── title-mark.js     게임 이름에서 형광펜 칠할 낱말 고르기
│   ├── rewards.js        솜씨 점수 표·칭호·연속·다시 일어서기·도장 판정 (10절)
│   ├── collection.js     도감 틀 (10절)
│   └── canvas.js         Canvas 게임 루프, 고해상도 캔버스, 포인터 좌표
├── ui/                   브라우저 화면
│   ├── app.js            createGameApp: 화면 흐름 전체
│   ├── dom.js            h(): 요소 만들기
│   ├── icons.js          인라인 SVG 아이콘 icon('sound'), 별 starIcon(true)
│   ├── drag-drop.js      끌어다 놓기 + 눌러서 넣기 + 키보드
│   ├── feedback.js       정답·오답 알림(말풍선 쪽지), 흔들기 효과, anchor, 화면 읽기 안내(announce)
│   ├── celebrate.js      색종이 조각, 결과 화면 연출(2초 안, 건너뛰기)
│   ├── rewards-view.js   칭호 칩·내 공방 카드·칭호 카드·도장판·도감 칸 그리기
│   └── audio.js          효과음 (파일 없이 Web Audio)
├── styles/
│   ├── base.css          디자인 토큰(색·글꼴·간격·그림자)과 기본 부품, 엔진 화면
│   └── hub.css           게임 모음 페이지
└── fonts/OFL.txt         제목 글꼴(Do Hyeon) 라이선스. 글꼴 파일은 npm 패키지에서 빌드가 잘라 넣는다
```

## 1. 게임 파일 구성

```
src/games/<게임-id>/
├── game.json     게임 정보 (게임 모음·처음 화면에 쓰임)
├── index.html    <link>로 CSS, <script type="module">로 main.js만 넣는다
├── main.js       createGameApp(...) 호출
├── logic.js      규칙·채점·문제 만들기 (순수 함수, 테스트 대상)
├── style.css     이 게임만의 스타일
└── cover.svg     (선택) 게임 모음 카드의 표지 그림 (아래 "표지")
```

`game.json` 필드

| 필드 | 예 | 설명 |
| --- | --- | --- |
| `id` | `"fraction-factory"` | 폴더 이름과 같게. 영어 소문자·숫자·하이픈 |
| `title` | `"분수 공장"` | |
| `summary` | `"띠 조각을 자르고 붙여…"` | 한두 문장 |
| `subject` | `"수학"` | |
| `grades` | `[5]` | `[5]`, `[6]`, `[5, 6]` |
| `units` | `["5-1 약분과 통분"]` | |
| `standards` | `[]` | 성취기준. **출처에서 확인한 것만** 쓴다 |
| `playMinutes` | `10` | 한 판 길이(분) |
| `mode` | `"개인"` | `개인`, `모둠`, `개인·모둠` |
| `status` | `"기획"` | `기획`, `개발 중`, `시범 운영`, `완료`, `예시` |
| `color` | `"#2f6f5e"` | (선택) 게임 색. 처음 화면 그림의 매트와 게임 모음 표지 바탕에 쓴다. `#` 뒤 16진수 6자리. 없으면 기본 초록 매트 |

**표지 `cover.svg`** (선택): 게임 모음 카드 왼쪽에 그대로 들어가는 SVG 한 장(게임 색 모눈 바탕 위, 가로 약 170px).
빌드는 **허용 목록**으로 읽어 받은 것만으로 SVG를 새로 쓴다(`scripts/lib/games.mjs`의 `prepareCover`). 그래서 스크립트·링크·바깥 요청·애니메이션은 원천적으로 들어가지 않는다.

- 받는 요소: `svg g rect circle ellipse line polyline polygon path text tspan title desc`
- 받는 속성: 모양(`viewBox width height x y x1 y1 x2 y2 cx cy r rx ry points d dx dy`), 색·선(`fill stroke stroke-width stroke-linejoin stroke-linecap stroke-dasharray opacity fill-opacity stroke-opacity fill-rule`), `transform`(matrix·translate·scale·rotate·skew만), 글자(`font-family font-size font-weight text-anchor dominant-baseline letter-spacing`), `preserveAspectRatio`, 뿌리 `svg`의 `xmlns`(SVG 이름공간만)
- 그 밖은 모두 빌드 오류: `style`·`href`·`id`·`class`·`on…` 속성, `<style>`·`<script>`·`<a>`·`<use>`·`<image>`·`<animate>`·`<set>`·`<filter>`, DOCTYPE·ENTITY·CDATA, `&#` 문자 참조, `url()`·`@import`·바깥 주소(`http`, `//`)

색은 `fill="#ffd86b"`처럼 속성으로 쓰고, 글자를 넣으면 `font-family="'Do Hyeon', sans-serif"`. 없으면 게임 색 무늬 위에 게임 이름 첫 글자 종이가 나온다.

## 2. createGameApp

```js
import meta from './game.json' with { type: 'json' };
import { createGameApp } from '../../shared/ui/app.js';

createGameApp({
  root: document.getElementById('app'),
  game: meta,                          // id, title 필수. subtitle로 처음 화면 윗줄을 바꿀 수 있다
  howTo: ['놀이 방법 1', '놀이 방법 2'], // 비우면 "놀이 방법" 버튼이 없다
  // lessons: [{ id, title }],          // 선택: 차시 묶음 (아래 "차시 묶음")
  // heroArt: (h) => h('div', …),       // 선택: 처음 화면 오른쪽 그림 (아래 "처음 화면 그림")
  // rewards: { ranks, thresholds, badges, off },  // 선택: 칭호 이름·게임 도장 (10절)
  // collections: [{ id, title, items }],          // 선택: 도감 (10절)
  stages: [
    { id: 'stage-1', title: '1단계', goal: '학생이 할 일 한 문장' /* 게임이 쓰는 값은 자유롭게 추가 */ },
  ],
  playStage(stage, ctx) {
    // ctx.el 안에 화면을 만든다.
    // 끝나면 ctx.finish()
    return () => { /* 정리: 타이머·루프·window 이벤트 해제 */ };
  },
}).start();
```

### ctx (playStage의 두 번째 인자)

| 이름 | 설명 |
| --- | --- |
| `ctx.el` | 플레이 영역 요소. 여기에만 그린다 |
| `ctx.stage`, `ctx.game` | 지금 단계, 게임 정보 |
| `ctx.rng` | 이 판의 난수. `?seed=`가 있으면 모두 같은 문제 |
| `ctx.log.answer({ itemId, correct, tag, given, expected, scored })` | 학생이 답할 때마다 부른다. 틀렸으면 `tag`에 오개념 이름. `scored`(선택, 10절): `false`는 "이미 점수를 받은 것을 다시 답함"(예: 지난 판에 이미 찾은 모양) — 기록·정답률·별에는 넣고 솜씨 점수는 주지 않는다. `'once'`는 "이 기기에서 한 번만 점수를 받는 답"(예: 이 기기에서 처음 접는 모양) — 별 3개 단계를 다시 하는 판에서도 점수를 받고, 그 점수는 그 자리에서 바로 저장된다. 없으면 보통 답 |
| `ctx.log.stats()` | 지금까지 `{ attempts, correct, accuracy }` |
| `ctx.feedback.correct(문장, 요소)` | 초록 알림(✓) + 요소 튀기기 |
| `ctx.feedback.wrong(문장, 요소)` | 벽돌색 알림(✗) + 요소 흔들기. **왜 틀렸는지** 쓴다 |
| `ctx.feedback.info(문장)` | 안내 알림 |
| `ctx.feedback.anchor(요소, { lift, narrow })` | 넓은 화면(901px 이상)에서 알림을 그 요소(예: 게임 무대)의 아래쪽 가운데에 띄운다. 옆 판의 버튼을 가리지 않게 할 때. `lift`(px): 요소 아래쪽에 조작 띠가 있으면 그만큼 더 위에. `narrow: 'below'`: 좁은 화면(900px 이하: 태블릿 세로·휴대폰)에서는 요소 바로 밑(요소 밖)에 띄워 무대 안의 면·조작을 가리지 않는다(없으면 화면 아래 가운데). `null`이면 기본 자리. 화면이 바뀌면 엔진이 되돌린다 |
| `ctx.feedback.celebrate({ kind, at, text })` | 작은 축하: 색종이 8~12개(`at` 요소 위쪽에서) + 소리(`kind`: `'discover'` `'combo'` `'stamp'` `'clear'` `'correct'` `'rankup'` `'unlock'`) + 화면 읽기 안내(`text`). 움직임 줄이기·`?fx=low`면 색종이 없이 소리·안내만 |
| `ctx.feedback.announce(문장)` | 토스트 없이 화면 읽기 프로그램에만 알림 |
| `ctx.feedback.clear()` | 지금 떠 있는 알림을 지운다(예: 결과 장면에서 다시 놓는 판으로 돌아갈 때) |
| `ctx.sfx.play(이름, n?)` | 효과음: `click` `correct` `wrong` `clear` `stamp` `combo`(n = 연속 단계, 높을수록 높은 음) `discover` `rankup` `fold` `unlock` |
| `ctx.h` | 요소 만들기 도우미 (아래) |
| `ctx.finish({ stars?, cleared?, highlights?, practiceNote?, stats? })` | 단계 끝. `stars`를 생략하면 정답률로 정한다(90%↑ ★3, 70%↑ ★2, 나머지 ★1). 실패는 `{ cleared: false }`. `highlights: [{ icon, label, value, xp }]`로 결과의 "오늘의 솜씨" 칸을 게임이 채운다(보여 주기만. 실제 점수는 엔진이 행동으로 계산). 없으면 엔진이 답 기록에서 만든다. `practiceNote`(글자): 별 3개 단계를 다시 한 판의 결과 안내 문장을 게임의 말로 바꾼다(그런 판에서만 보인다, 10절). `stats: [{ label, value }]`(3개까지): 결과의 기록 칸(정답률 · 맞힘/시도)을 게임의 말로 바꾼다 — 맞힘·틀림으로 보이지 않는 단계(직접 만들어 보는 단계, 예: "찾은 전개도 3가지 · 접어 본 모양 5가지")에 쓴다. 그런 판은 "다시 살펴볼 점"(틀린 개념 수)도 보이지 않는다. 걸린 시간 칸과 학습 기록(답·tag)은 그대로다 |
| `ctx.reward.event(이름, data)` | 학습 행동 알림: `'explain'`(설명, `{ correct, itemId }`, 맞으면 문항마다 한 번 +2. **`itemId`가 없으면 점수·횟수 모두 없다**), `'inspect'`(까닭 장면을 돌려 보거나 접어 봄, 횟수만 셈). 돌려주는 값은 받은 점수 |
| `ctx.reward.peek()` | `{ on, xp(이번 판), streak, bounceReady(다음 문항을 맞히면 다시 일어서기 +1), practice(false면 별 3개 단계 다시 하기라 연습 점수 없음. `scored: 'once'` 답은 그래도 점수를 받는다), counters(누적 횟수) }` — "다음 문제를 맞히면 +1, 도장까지 2/5" 같은 쪽지를 그릴 때 |
| `ctx.streak()` | 지금 연속 수(처음 시도에 연달아 맞힌 수) |
| `ctx.collect(도감 id, 칸 id)` | 도감에 등록 → `{ isNew, count, total }`. 처음이면 +5(도감 정의에 `xp`가 있으면 그 점수), "새로 찾았어요" 안내, 소리 |
| `ctx.collection(도감 id)` | `{ found: Set(칸 id), total }` |
| `ctx.setProgress(current, total, { label, done, check })` | 플레이 머리에 "문제 3 / 6"과 점 막대(마친 칸은 잉크, 지금 칸은 노랑). `label`(기본 `'문제'`), `done`(마친 수, 기본 `current − 1`), `check: true`면 마친 칸에 ✓(예: `setProgress(1, 3, { label: '찾은 전개도', done: 1, check: true })`). 휴대폰 폭에서는 다른 머리 상자처럼 숨는다 |
| `ctx.ui.order({ kind, counter, label })` | 작업 지시서(문제 판) 틀: 테이프 붙은 종이 + 주문 도장(`kind`, 예 '검사 주문') + 문제 번호. → `{ el, counter, setCounter(글) }`. 게임이 `el`에 물음·답·쪽지를 넣는다(선택 부품) |
| `ctx.ui.note({ type, title, text, tip })` | 까닭 쪽지: `type` `'wrong'`(벽돌색 ✗) · `'correct'`(초록 ✓) · `'info'`, 제목·문장·살펴볼 거리(돋보기 한 줄) |
| `ctx.ui.bonus(…내용)` | 노랑 점선 보너스 쪽지("다시 일어서기 · 다음 문제를 맞히면 +1, 도장까지 2 / 5"). 점수는 엔진이 행동으로 계산하고, 쪽지는 보여 주기만 한다(`ctx.reward.peek()`로 문장을 만든다) |

### 단계 필드 (선택)

| 필드 | 설명 |
| --- | --- |
| `goal` | 단계 지도 카드와 플레이 머리에 나오는 목표 한 문장 |
| `thumb` | `(h) => 요소` 단계 카드 오른쪽 위 작은 그림(약 76×57px, SVG 권장). 잠긴 카드에서는 흐리게 |
| `chip` | 플레이 머리 제목 옆 칩 글자(예: `'검사 주문'`). 없으면 `'1단계'`(제목과 같으면 칩을 숨긴다) |
| `challenge` | `true`면 도전 주문서(선택 활동, 10절). 차시의 일반 단계를 모두 마치면 열리고, 다음 단계를 막지 않으며, 모은 별 합계에 넣지 않는다 |
| `timer` | `'optional'`(도전 주문서만): 플레이 머리에 [시간 재기] 버튼. 첫 답 전에 켠 학생만 걸린 시간이 보이고 결과에 "내 기록 2분 10초 (지난번보다 12초 빨라요)". 점수 없음. **켜지 않은 판은 시간이 어디에도 보이지 않는다**: 머리의 시계, 결과의 "내 기록" 줄과 "걸린 시간" 칸, 단계 카드의 "내 기록" 칩 모두 없다(선생님이 보는 학습 기록 표의 걸린 시간은 다른 단계처럼 남는다) |

### 처음 화면 그림 (heroArt, 선택)

`heroArt: (h) => 요소`를 주면 처음 화면 오른쪽, 게임 색(`game.json`의 `color`) 매트 위 가운데에 놓인다. 매트·자·색종이 조각은 엔진이 그린다.
움직이지 않는 그림으로 만든다(저사양 기기). 주지 않으면 색종이 몇 장 위에 게임 이름 첫 글자가 나온다. 처음 화면 그림은 화면 읽기 프로그램에서 숨긴다.

### 화면 모습 (엔진이 그린다)

- 머리: 게임 이름(왼쪽 노랑 네모에 첫 글자) + 칭호 칩(도장 + "새싹 32점") + [소리 켬/끔]
- 처음 화면: 윗줄(`.eyebrow` = 차시 제목 또는 `subtitle`) + 학년 칩, 게임 이름(마지막 낱말에 형광펜), 요약, [시작하기 ▶]·[놀이 방법]·[학습 기록], 그 아래 **내 공방 카드**(칭호 도장, 다음 칭호까지 점수 막대, 별·도감·도장 수), 오른쪽 그림
- 단계 지도: 차시마다 종이 판(`.lesson-group`, "1차시" 칩 + 차시 제목 h3 + 도감·시간 칩) 안에 점선 길로 이은 단계 카드(`.stage-path .stage-card`). 카드 상태는 마쳤어요 ✓ / 지금 할 곳(파랑 테두리 + "여기부터!") / 잠김(점선 + 자물쇠, `disabled`). 그 아래 **도전 주문서** 줄(`.challenge-card`, 이것도 `.stage-card`. 일반 단계 카드가 먼저)
- 플레이 머리: [← 단계 선택] · 단계 제목 + 칩 · 목표 · 오른쪽에 문제 n / N 점 막대(`ctx.setProgress`를 부를 때)·연속(2 이상일 때)·이번 판 솜씨 점수(휴대폰 폭에서는 숨김). 아래가 `ctx.el`(`.play-area`)
- 결과: 증명서(단계 이름, 제목, 도장, 별, 별 기준 안내, **오늘의 솜씨** 칸, 단계 완료·별 점수 줄, 정답률·맞힘·시간, 버튼) + 오른쪽 칭호 카드(이번에 모은 점수, 점수 막대, 칭호 오름)·새 도장 카드·다시 살펴볼 점·"도전 주문서가 열렸어요" 칩. 기록 칸(정답률·맞힘/시도)은 게임이 `ctx.finish({ stats })`로 바꿀 수 있고(그러면 "다시 살펴볼 점"도 없다), 걸린 시간 칸은 시간 재기(`timer: 'optional'`)를 켜지 않은 판에는 없다 (`resultStats`)
- 학습 기록: 요약 칸 4개(한 판 수·정답률·모은 별·칭호와 솜씨 점수), 기록 표, 자주 틀린 개념, **도장판**, 아래에 이름 칸·지우기. 도감이 있으면 머리에 [도감 이름 n / m] → 도감 화면 (`label`이 있는 도감은 뒤에 따로: "전개도 도감 3 / 11 ㆍ 노트 2 / 24")
- 결과 화면(`.screen-result`)은 가로만 자른다(`overflow-x: clip`): 도장이 크게 시작해 줄어드는 연출이 좁은 화면에서 가로 스크롤을 만들지 않게. 자르는 선은 앱 여백(20px, 휴대폰 16px)까지라 종이 그림자·초점 테두리는 잘리지 않는다

### 별과 잠금

- 앞 단계를 별 1개 이상으로 마치면 다음 단계가 열린다.
- 단계마다 가장 좋은 별 개수만 남는다.
- 답 기록이 없는 게임(시뮬레이션 등)은 `finish({ stars })`로 직접 준다.
- 차시 묶음(아래)을 쓰면 차시마다 첫 단계가 처음부터 열린다. (`createProgress({ stageIds, openIds })`의 `openIds`. 주지 않으면 첫 단계만 열린다)

### 차시 묶음 (선택)

단계가 많아 여러 차시에 나눠 쓰는 게임은 `lessons`로 단계를 묶는다. 쓰지 않는 게임은 지금과 똑같이 동작한다.

```js
createGameApp({
  // …
  lessons: [
    { id: 'cube', title: '정육면체의 전개도' },
    { id: 'cuboid', title: '직육면체의 전개도' },
  ],
  stages: [
    { id: 'cube-judge', lesson: 'cube', title: '…' },   // 단계마다 lesson 필드
    { id: 'cube-opposite', lesson: 'cube', title: '…' },
    { id: 'cuboid-edge', lesson: 'cuboid', title: '…' },
  ],
});
```

- 단계 선택 화면에서 차시 제목(`h3`)별로 묶어 보인다. 단계 번호는 차시마다 1단계부터.
- 차시마다 첫 단계는 처음부터 열려 있다. 그다음 단계는 같은 차시의 앞 단계를 마쳐야 열린다.
- 결과 화면의 "다음 단계"는 같은 차시 안에서만 나온다. 차시의 끝 단계를 마치면 "이 차시를 마쳤어요!"와 "학습 기록 보기".
- 주소에 `?lesson=<차시 id>`를 붙이면 그 차시의 단계만 보이고, 처음 화면 윗줄에 차시 제목이 나온다. 맞는 차시가 없으면 모든 차시를 보인다.
- 모든 단계에 `lessons`에 있는 `lesson`이 있어야 한다(없으면 오류). 단계가 하나도 없는 차시는 보이지 않는다.

## 3. 화면 만들기: h()

```js
const { h } = ctx;
h('button', { type: 'button', class: 'btn btn-primary', onclick: go }, '확인');
h('ul', null, items.map((x) => h('li', null, x)));
h('div', { dataset: { value: 3 }, 'aria-label': '3번 카드' });
```

`innerHTML`은 쓰지 않는다.

**기본 부품 클래스** ("종이 공방": 잉크 테두리 + 아래 단단한 그림자 = 누를 수 있는 것, 옅은 선 + 부드러운 그림자 = 읽을 정보)

| 클래스 | 모습 |
| --- | --- |
| `btn`, `btn-primary`, `btn-lg`, `btn-small` | 두꺼운 종이 버튼(누르면 내려앉음). 비활성은 점선 + 회색 종이 |
| `panel` | 정보 판(옅은 선, 부드러운 그림자) |
| `sheet`, `tape` | 종이 한 장(잉크 테두리, 비스듬한 그림자), 위쪽 가운데 마스킹 테이프 |
| `note`, `note-wrong`, `note-correct`, `note-title`, `note-text`, `note-tip` | 까닭 쪽지(벽돌색·초록, ✓✗ 아이콘·글자와 함께). `ctx.ui.note()`가 만든다 |
| `order`, `order-head`, `order-kind`, `order-counter` | 작업 지시서(테이프 붙은 문제 판, 주문 도장 + 문제 번호). `ctx.ui.order()`가 만든다 |
| `bonus-note` | 노랑 점선 보너스 쪽지. `ctx.ui.bonus()`가 만든다 |
| `chip`, `chip-ink`, `chip-butter`, `chip-primary`, `chip-lg` | 작은 꼬리표 |
| `stamp` | 둥근 도장(`--size`로 크기) |
| `actions`, `actions-start`, `muted`, `display`(제목 글꼴), `sr-only` | |

**토큰**: 색 `--paper-bg` `--paper` `--paper-2` `--paper-3` `--ink` `--ink-2` `--line` `--primary` `--primary-edge` `--primary-soft` `--butter` `--butter-soft` `--correct(-bg)` `--wrong(-bg)` `--stamp` `--star` `--mat` `--face-1`~`--face-8`(색종이), `--game-color`(game.json `color`) ·
글꼴 `--font`(본문, 기기 글꼴) `--font-display`(제목·버튼·숫자) · 크기 `--fs-xs`~`--fs-3xl` · 간격 `--sp-1`~`--sp-7` · 모서리 `--radius-sm` `--radius` `--radius-lg` ·
그림자 `--edge-sm` `--edge`(누를 수 있는 것) `--sheet` `--lift`(정보 판) · 움직임 `--dur-1`~`--dur-4` `--ease-out` `--ease-pop` · 누르는 곳 `--tap`(48px).
옛 이름(`--bg` `--surface` `--surface-2` `--text` `--text-muted` `--border` `--primary-strong` `--focus` `--shadow`)도 새 값으로 그대로 쓸 수 있다.
값과 대비: [docs/design/spec.md 2절](design/spec.md).

**아이콘**: 이모지 대신 `icon(이름)`을 쓴다(기기마다 모양이 같음). 글자색을 따르고 화면 읽기에서는 숨기므로, 뜻은 버튼 글자로 전한다.

```js
import { icon, starIcon } from '../../shared/ui/icons.js';
h('button', { type: 'button', class: 'btn' }, icon('rotr'), '돌려 보기');
// 이름: back sound mute lock check cross info rotl rotr play unfold bulb book stamp spark clock user target search cube trash undo hand shield grid flag arrow copy home rise star ring
//       up down (위·아래 꺾쇠) zoomin zoomout (돋보기 안의 + −)
// 답 버튼의 ○ · ✕ 는 이모지(⭕❌) 대신 icon('ring') · icon('cross')
```

## 4. 끌어다 놓기

```js
import { enableDragDrop } from '../../shared/ui/drag-drop.js';

// 카드: <button class="dnd-item">  상자: <button class="dnd-target">
const dnd = enableDragDrop({
  root: ctx.el,
  onDrop(itemEl, targetEl) {
    // 판정 → ctx.log.answer(...) → 맞으면 targetEl 안으로 옮기기
  },
});
return () => dnd.destroy();
```

한 번 설정으로 마우스·터치 끌기, "카드 누르고 상자 누르기", 키보드(Tab + Enter)가 모두 된다.
카드·상자를 `<button>`으로 만들어야 키보드로도 된다.

**끄는 동안 보이는 것은 카드의 복제(`.dnd-ghost`)다.** 엔진이 카드를 복제해 `<body>`에 고정 위치(`position: fixed`, `z-index: 1000`)로 붙이고 포인터를 따라 옮긴다. 그래서 카드가 스크롤 상자·`overflow: hidden` 상자 안에 있어도 **집은 순간부터 놓을 때까지 잘리지 않고 맨 위에 보인다.** 게임이 따로 할 일은 없다.

- 복제는 지금 화면에 보이는 모습(계산된 스타일)을 그대로 옮겨 적으므로 조상 선택자·조상의 CSS 변수로 정한 크기·색·글자도 같다. 그림자만 들어 올린 그림자로 바뀐다. `aria-hidden`·`inert`이고 `id`와 `dnd-item` 클래스는 떼므로 화면 읽기·초점·`.dnd-item` 선택자에 걸리지 않는다. 단, `[data-…]` 속성은 남으니 **끄는 동안에는 같은 `data-` 값을 가진 요소가 문서에 둘**이다 — 게임 코드는 `ctx.el` 안에서만 찾는다.
- 원래 카드는 제자리에서 흐려진다(`.is-dragging`, 투명도 0.35 — 또렷한 카드가 둘로 보이지 않게). 옮겨지지 않으므로 끄는 동안 다른 카드가 밀리지 않는다.
- 놓을 수 있는 상자 위에 오면 그 상자에 `.is-over`가 붙고, 놓으면 `onDrop`이 불린다. `onDrop` 뒤에 카드가 옮겨졌거나 없어졌거나 더는 끌 수 없는 것이 됐으면 복제는 그 자리에서 사라진다. **카드가 제자리에 그대로면**(틀려서 받지 않음, 놓을 곳이 아님, Esc·`pointercancel`·창이 가려짐) **복제가 150ms 동안 제자리로 돌아간 뒤 사라진다**(움직임 줄이기면 바로). 그동안 원래 카드는 `.is-returning`(흐림)이다. 이 판단을 직접 정하려면 `onDrop`에서 `true`(받았다)·`false`(받지 않았다)를 돌려준다.
- 끄는 도중 Esc를 누르면 끌기를 그만둔다. `destroy()`는 끄는 도중이어도 복제·표시·리스너를 모두 치운다.
- 카드의 `::before`·`::after` 장식은 복제에 옮겨 적을 수 없다. 그런 장식이 조상 선택자(`.board .card::after`)에 기대면 복제에는 보이지 않으니, 카드 자신의 클래스 규칙(`.card.is-x::after`)으로 쓴다.

## 5. Canvas 게임

```js
import { createLoop, setupCanvas, toCanvasPoint } from '../../shared/core/canvas.js';

const W = 960, H = 540;                       // 논리 크기 (화면에 맞춰 늘어남)
const canvas = h('canvas');
ctx.el.append(canvas);
const g = setupCanvas(canvas, { width: W, height: H });
canvas.addEventListener('pointerdown', (e) => {
  const { x, y } = toCanvasPoint(canvas, e, { width: W, height: H });
});
const loop = createLoop({ update: (dt) => { /* dt: 초 */ }, render: () => { /* g로 그리기 */ } });
loop.start();
return () => loop.stop();
```

## 6. 그 밖의 도구

```js
import { josa } from '../../shared/core/korean.js';
josa(12, '을/를');      // '12를'
josa('3/4', '이/가');   // '3/4이' (사분의 삼)
josa('서울', '으로/로'); // '서울로'

ctx.rng.shuffle(list);  ctx.rng.sample(list, 3);  ctx.rng.int(1, 6);  ctx.rng.pick(list);
```

## 7. 이미지·소리 넣기

빌드하면 게임이 HTML 파일 하나가 되므로, 바깥 파일은 빌드 때 `data:` 주소로 들어가는 방법으로만 넣는다.

- 그림 파일: 게임 폴더의 `style.css`에서 `url()`로 쓰고, 요소에는 클래스를 붙인다.
  ```css
  .apple { background: url('./img/apple.png') center / contain no-repeat; }
  ```
  개발 서버에서도, 빌드한 파일에서도 똑같이 보인다. 그림이 뜻을 가지면 요소에 `role="img"`와 `aria-label`을 붙인다.
- 도형·그래프·띠 모델처럼 값에 따라 바뀌는 그림은 JS에서 SVG(`document.createElementNS`)나 Canvas로 그린다.
- 소리는 `ctx.sfx` 효과음을 쓴다. 소리 파일이 꼭 필요하면 엔진에 기능을 먼저 추가한다.
- `index.html`에 `<img src="…">`를 쓰거나, JS에서 그림 파일을 `import`하지 않는다(개발 서버에서 열리지 않음).
- 외부 CDN·웹 글꼴 주소는 쓰지 않는다(학교망 차단·오프라인). 빌드가 막는다.
- 제목 글꼴(Do Hyeon, SIL OFL 1.1)은 빌드가 게임 파일에 **쓰인 글자만 잘라** `@font-face`(data: 주소)로 넣는다(게임마다 약 40 KB).
  제목·버튼처럼 굵은 글자는 `font-family: var(--font-display); font-weight: 700`으로 쓴다. 글꼴에 없는 글자는 기기 글꼴 굵게로 보인다.
  Do Hyeon에 없는 기호(가운뎃점 `·`, `…`, `✓`, 이모지 등)는 제목·버튼 자리에 쓰지 않는다(그 글자만 다른 글꼴로 섞여 보임). 가운뎃점은 `ㆍ`(U+318D)나 쉼표로.
  빌드가 "알림: 제목 글꼴에 없는 기호"로 알려 준다(본문 글자에 쓰는 것은 괜찮다).
  개발 서버(`npm run dev`)는 전체 글꼴 파일을 `/__fonts/`에서 준다. 게임 `index.html`은 고치지 않는다.
- 게임 파일 하나는 **400 KB 이하**여야 한다(빌드가 검사하고 넘으면 멈춘다). 그림은 SVG나 작은 PNG를 쓴다.

## 8. 교사용 주소 옵션

| 옵션 | 동작 |
| --- | --- |
| `?unlock=all` | 모든 단계 열기 (시범, 특정 단계만 수업) |
| `?stage=<단계 id>` | 그 단계로 바로 시작 |
| `?sound=off` | 소리 끄고 시작 |
| `?seed=<값>` | 모두 같은 문제 순서 |
| `?lesson=<차시 id>` | 그 차시 묶음의 단계만 보이기 (게임이 `lessons`를 쓸 때. 예: `net-workshop.html?lesson=cube`) |
| `?fx=low` | 효과 줄이기(느린 기기): 색종이·화면 들어오기 움직임을 끄고 결과 연출을 처음부터 끝 상태로. CPU 코어가 2개 이하인 기기는 저절로 |

옵션은 함께 쓸 수 있다: `fraction-factory.html?unlock=all&sound=off`

## 9. 학습 기록과 개인정보

- 기록은 그 기기 브라우저(localStorage)에만 남고 어디로도 보내지 않는다.
- 이름은 저장하지 않는다. "결과 복사" 때만 입력한 이름을 문장에 넣는다.
- 학생은 학습 기록 화면의 "결과 복사"로 결과를 클래스룸·패들렛 등에 붙여 넣는다.
- 같은 기기를 여러 학생이 쓰면 "기록 모두 지우기"로 지운다. 기록·별·솜씨 점수·도장·도감·시간 기록이 모두 지워진다.
- 결과 복사 문장 끝에 한 줄이 붙는다: "칭호: 탐험가(60점) · 도장 4개 · 도감 4/11" (`label`이 있는 도감은 따로 "· 노트 2/24").
- 게임 모음 페이지는 같은 주소(같은 출처)에서 게임의 별 기록을 읽을 수 있으면 카드에 "별 n개 · 칭호 · 이어 하기"를 보인다(읽기만 하고 보내지 않는다).

## 10. 공통 게임 요소: 솜씨 점수·칭호·도장·도감·도전 주문서

**원칙: 학습 행동에만 보상한다. 빠르기 점수·순위표·친구 비교·목숨·뽑기는 없다.**
점수는 정확히 맞히기, 틀린 뒤 다시 도전하기, 여러 가지를 새로 찾기, 설명하기에만 준다.
어떤 보너스도 처음부터 맞힌 것보다 크지 않아서 일부러 틀리거나 찍어서 이득을 볼 수 없다(`tests/unit/rewards.test.js`가 무작위 답 순서 6,000개로 검사).
시간은 기록에만 남는다. 기록은 그 기기에만(`createStorage(game.id)`의 `rewards`·`collections`) 남고 이름은 저장하지 않는다.

게임은 **아무것도 하지 않아도** 된다. `ctx.log.answer({ itemId, correct })`만 부르면 엔진이 점수·연속·도장을 붙인다.
`itemId`는 문항마다 같은 값을 준다(같은 문항을 다시 푼 것과 새 문항을 구분한다. 없으면 "틀린 바로 뒤 답"을 같은 문항으로 본다).

**솜씨 점수 표** (`core/rewards.js`의 `XP`)

| 행동 | 점수 |
| --- | --- |
| 그 문항을 처음 시도에 맞힘 | +2 |
| 같은 문항을 틀린 뒤 다시 도전해 맞힘 | +1 |
| 틀림 · 이미 맞힌 문항을 또 답함 | 0 (벌점 없음) |
| 이미 점수를 받은 것을 다시 답함 (`ctx.log.answer`의 `scored: false`) | 0 |
| 이 기기에서 한 번만 점수를 받는 답 (`scored: 'once'`) | 위와 같은 점수(+2, 다시 도전 +1, 다시 일어서기·연속 +1, 설명 +2). 별 3개 단계에서도 받고, 바로 저장 |
| 다시 일어서기: 틀린 뒤 다음 새 문항을 처음 시도에 맞힘 (틀린 문항 하나마다 한 번) | +1 |
| 연속(처음 시도에 연달아 맞힘) 3번마다 | +1 (머리에 "연속 n", 틀리면 조용히 0) |
| 단계 완료 (그 단계 별이 처음 생길 때만) | +5 |
| 별 (늘어난 만큼만) | 별 1개당 +2 |
| 도전 주문서 처음 성공 (단계 완료 대신) | +10 |
| 도감에 처음 등록 (`ctx.collect`) | +5 (도감마다 `xp`로 0~5) |
| 설명 맞힘 (`ctx.reward.event('explain', { correct: true, itemId })`, 문항마다 한 번. `itemId`가 없으면 0) | +2 |
| 빠르기 | 0 |

- **다시 하기 점수**: 판을 시작할 때 이미 별 3개(`MASTERED_STARS`)인 단계를 다시 하면 연습 점수(처음 맞힘·다시 도전·다시 일어서기·연속·설명)는 0이다.
  별 3개가 안 된 단계는 다시 해도 연습 점수를 그대로 받는다(어려워하는 학생의 복습은 계속 보상). 기준은 **판을 시작할 때**의 별이라 이번 판에 처음 별 3개를 받으면 이번 판 점수는 받는다.
  도감에 처음 등록(+5)·도전 주문서 처음 성공(+10)은 원래 처음 한 번뿐이라 그대로 받는다. "연속 n" 글자와 소리는 보이지만 머리 점수는 오르지 않는다.
  결과 화면 "오늘의 솜씨" 아래에 까닭 "별 3개를 받은 단계라 연습 점수는 없어요. 새로 찾으면 점수를 받아요."를 보이고 화면 읽기로도 알린다.
  엔진이 `createPlayReward({ startStars })`(`core/rewards.js`, `practiceAllowed(startStars)`)에 시작 별을 넘기고, 게임은 `ctx.reward.peek().practice`(`false`면 연습 점수 없음)로 "+1" 쪽지·"예상이 맞으면 +2" 같은 점수 안내를 숨긴다.
  게임이 `ctx.finish({ highlights })`로 솜씨 칸 점수를 직접 줄 때도 연습 칸은 `peek().practice`가 `false`면 0으로 적는다.
  이 규칙은 표시 없는 보통 답에만 걸린다. "이 기기에서 한 번만 점수를 받는 답"(`scored: 'once'`, 아래)은 도감 등록처럼 처음 한 번뿐이라 별 3개 단계에서도 점수를 받는다.
  그런 답이 있었던 판의 안내 문장은 "별 3개를 받은 단계라 연습 점수는 없어요. 처음 해 본 것은 점수를 받았어요."이고, 게임이 `ctx.finish({ practiceNote })`로 자기 말로 바꿀 수 있다
  (예: 전개도 게임 "처음 접는 모양은 점수를 받아요. 접어 본 모양은 다시 접어도 점수가 없어요.").
- 단계 완료·별 점수는 별이 늘 때만 받는다(별 3개가 안 된 단계를 다시 하면 답 점수는 받는다).
- **점수 없는 답 (`scored: false`)**: 같은 것을 판을 넘어 되풀이해 점수를 쌓지 못하게 할 때 쓴다. 게임이 저장된 값(예: 도감에 이미 있는 모양)으로
  "이미 점수를 받은 것"임을 알 때 `ctx.log.answer({ …, scored: false })`로 기록한다. 그 답은 학습 기록·정답률·별에는 들어가고,
  솜씨 점수는 "이미 맞힌 문항을 또 답한 것"과 같다: 점수 0, 연속·다시 일어서기 계산에 넣지 않고(틀리면 연속만 끊긴다), 그 문항(`itemId`)의 설명 점수도 없다(횟수만 센다).
  점수를 받는 답만 따로 보면 규칙이 그대로라 "일부러 틀려도 이득 없음"이 유지된다(`tests/unit/rewards.test.js`).
  예: 전개도 게임의 "내 맘대로 전개도"는 이 기기에서 처음 접는 모양에만 점수를 준다(`docs/games/net-workshop/spec.md` 16-8).
- **한 번만 점수 답 (`scored: 'once'`)**: "이 기기에서 처음이자 마지막으로 점수를 받는 답"이다. 게임이 저장된 값(예: 도감에 아직 없는 모양)으로
  그 답이 이 기기에서 한 번뿐임을 **보장할 때만** 쓴다 — 같은 것을 다시 답할 때는 `scored: false`로 기록해야 한다(엔진은 한 번뿐인지 따로 확인하지 않는다).
  도감에 등록하면서 쓸 때는 `ctx.collect`를 먼저 부르고, 그 결과가 `isNew`일 때만 `'once'`로 기록한다.
  - 별과 상관없이 점수: 판을 시작할 때 별이 3개여도 처음 맞힘 +2·다시 도전 +1·다시 일어서기 +1·연속 +1과 그 문항(`itemId`)의 설명 +2를 받는다.
    (다시 하기 규칙의 까닭은 "같은 것을 되풀이해 쌓지 못하게"인데, 이 답은 이미 한 번뿐이다. 그러지 않으면 여러 판에 나눠 탐구할 때 모두 맞힌 학생이 일부러 틀려 별 2개를 지킨 학생보다 적게 받는다.)
  - 바로 저장: 이 답과 그 설명의 점수는 새로 찾음 점수처럼 생긴 그 자리에서 저장하고(`createPlayReward().instant()`), 판을 마칠 때 다시 더하지 않는다.
    답한 순간 "이미 한 것"이 되므로 점수도 그때 정해져야, 판 중간에 나갔을 때 두 번 받는 길도 못 받는 길도 없다. 머리의 칭호 칩도 그때 오른다.
  - 연속·다시 일어서기는 '한 번만' 답끼리, 보통 답끼리 따로 센다. 서로에게는 `scored: false`와 같다(틀리면 연속만 끊긴다).
    그래서 보통 답을 일부러 틀리거나 판 중간에 나가서 '한 번만' 답의 보너스를 더 얻을 수 없다. 머리의 "연속 n"은 모든 답을 함께 센 수다.
    한 판에 한 가지 답만 쓰면(지금까지의 모든 단계, 전개도 게임의 "내 맘대로 전개도") 점수는 하나로 셀 때와 같다. 한 문항(`itemId`)은 한 가지로만 기록한다.
  - 학습 기록·정답률·별·도장 판정은 보통 답과 같다. 결과 "오늘의 솜씨" 기본 칸은 실제로 받은 점수만 적는다(`summary().paid`).
  예: "내 맘대로 전개도"·도감 주문에서 처음 접는 모양의 기록(`docs/games/net-workshop/spec.md` 16-9·16-12 — 정육면체가 되면 맞음 +2, 안 되는 모양은 틀림 0점 + 다시 일어서기 기회).
- 플레이 중 점수는 단계를 마칠 때 저장한다(중간에 나가면 저장하지 않음). 새로 찾음 +5와 `scored: 'once'` 답·그 설명의 점수만 그 자리에서 바로 저장한다.
  단계 완료·별 점수, 도장, 누적 횟수(`counters`의 `bounce`·`retryFix`·`explain`·`inspect`), 학습 기록은 늘 단계를 마칠 때 정해진다(중간에 나가면 남지 않는다).
- 도감이 있는 게임은 점수를 저장할 때 저장된 도감이 그 탭의 것과 다르면 도감과 점수를 그 탭의 값으로 함께 쓴다(탭 하나로 할 때는 늘 같아 아무것도 더 쓰지 않는다). 같은 기기에서 탭을 두 개 열어 섞어 써도 저장된 값이 늘
  "한 탭의 같은 때의 점수와 도감 한 쌍"이라, 도감에서 빠진 칸의 점수만 남아 같은 칸으로 점수를 다시 받는 일이 없다(탭마다 따로 센 점수가 합쳐지지는 않는다 — 나중에 저장한 탭의 값이 남는다).

**칭호**: 기본 새싹(0) → 탐험가(40) → 해결사(100) → 척척박사(180) → 으뜸 박사(300). 차시 하나(문항 15개 정도)를 잘 하면 한 번은 오른다.

```js
createGameApp({
  // …
  rewards: {
    ranks: ['견습생', '솜씨꾼', '접기 장인', '설계 장인', '공방 명장'], // 이름만 바꿀 때 (기준 점수는 그대로)
    // thresholds: [0, 40, 100, 180, 300],                             // 기준 점수 (0부터 커지는 순서, ranks와 같은 개수)
    badges: [                                                          // 게임 도장 (엔진 기본 6개에 더한다)
      { id: 'look-again', title: '다시 보는 눈', desc: '까닭 장면을 5번 돌려 보거나 접어 봐요', icon: 'search',
        test: (s) => s.counters.inspect >= 5 },                       // ctx.reward.event('inspect') 횟수
    ],
    // off: true,  // 점수·칭호·도장을 모두 숨긴다 (도감은 그대로)
  },
});
```

**도장(업적)**: 모두 처음부터 학습 기록의 도장판에 "어떻게 받는지"가 보인다(숨은 도장 없음). 새로 받으면 결과 화면 카드 + 도장 소리 + 화면 읽기 안내.

| id | 이름 | 받는 조건 |
| --- | --- | --- |
| `first-step` | 첫 발걸음 | 첫 단계를 마침 |
| `sharp-eye` | 꼼꼼한 눈 | 한 단계에서 4번 이상 답하고 모두 처음에 맞힘 |
| `try-again` | 끝까지 다시 | 틀린 문제를 다시 도전해 맞힘 3번(누적) |
| `bounce-back` | 다시 일어서기 | 틀린 바로 다음 문제를 맞힘 5번(누적) |
| `lesson-done` | 차시 완주 | 한 차시의 일반 단계를 모두 마침 (차시가 없으면 모든 단계) |
| `all-stars` | 별 부자 | 한 차시의 일반 단계를 모두 별 3개 |

게임 도장의 `test(state)`는 순수 함수다. `state`: `stars`(단계 id → 별, 모든 차시), `clearedCount`, `lessons`(`[{ id, ids }]`), `counters`(`bounce` `retryFix` `explain` `inspect` `discover` 누적),
`collections`(도감 id → `{ count, total, found: [칸 id] }`), `records`(학습 기록, 방금 마친 판 포함 `[{ stageId, cleared, stars, answers: [{ itemId, correct, given, expected, tag }] }]`),
`xp`, `play`(방금 마친 판 `{ stageId, attempts, correct, wrong, firstTry, cleared, stars, challenge }`). 단계를 마칠 때 판정한다.
예: "안 되는 것을 5번 맞힘" = `records`의 답에서 `expected === 'no' && correct`를 센다. "기록 모두 지우기" 뒤에는 `records`도 비므로 도장 조건도 처음부터다.
`icon`은 `icons.js` 아이콘 이름.

**도감 틀**: 여러 가지를 새로 찾는 게임에서 쓴다.

```js
createGameApp({
  // …
  collections: [{
    id: 'cube-nets', title: '전개도 도감', lesson: 'cube',   // lesson: 그 차시 머리에 "도감 n / m" 칩 (없으면 단계 지도 머리에)
    items: [{ id: '1-4-1a', name: '1-4-1 가', thumb: (h) => svg }, /* … */],
    // xp: 1,          // 선택: 처음 등록 점수 (0~5 정수, 기본 5)
    // label: '노트',  // 선택: 짧은 이름. 있으면 "도감 n / m"에 합치지 않고 따로 "노트 n / m"으로 보인다 (icon: 그 칩의 아이콘 이름, 기본 책)
  }],
  playStage(stage, ctx) {
    const { isNew, count, total } = ctx.collect('cube-nets', '1-4-1a'); // 처음이면 isNew, +5, 안내·소리
  },
});
```

학습 기록 머리의 [전개도 도감 n / m] → 도감 화면: 찾은 칸은 `thumb` 그림(없으면 이름 첫 글자)과 이름, 못 찾은 칸은 점선 "?", 이번에 찾은 칸은 "새로!" 꼬리표.

**도감 칩 숫자** (처음 화면 내 공방 카드, 단계 지도, 학습 기록, 결과 복사): `label`이 없는 도감은 모두 합쳐 "도감 n / m"으로 보인다.
`label`이 있는 도감(곁들이는 모음, 예: 안 되는 모양 노트)은 합치지 않고 단계 지도·학습 기록·결과 복사에 따로 "노트 n / m"으로 보인다(내 공방 카드에는 "도감 n / m"만).
그래서 대표 도감을 다 채우면 "도감 11 / 11"로 보인다(`core/collection.js`의 `collectionChips`).

**도전 주문서 틀**: 단계에 `challenge: true`(선택 `timer: 'optional'`). 차시의 일반 단계를 모두 마치면 열리는 선택 활동이라 10분 차시를 늘리지 않는다.
다음 단계 사슬·모은 별 합계에 넣지 않는다. 결과 제목은 "도전 성공!". 도전 내용(주문)은 게임이 `playStage`에서 만든다.
시간 재기(`timer: 'optional'`)는 켠 학생에게만 시간을 보인다 — 켜지 않은 판은 플레이·결과·단계 카드 어디에도 시간이 없다(4절 `timer`).
`createProgress({ optionalIds })`가 잠금을 정한다.

**축하 연출**: 결과 화면은 별이 하나씩 튀고(0.1~0.4초) → 도장이 찍히고(0.6초, 쿵 + 색종이 12개 이하) → 칭호 카드와 점수 막대(1초) → 새 도장·칭호 오름(1.5초). 2초 안에 끝나고,
아무 키(Enter·Space·Esc)나 누르기로 끝 상태로 건너뛴다. 움직이는 것은 `transform`·`opacity`뿐이다. `prefers-reduced-motion`이나 `?fx=low`면 색종이 0개, 처음부터 끝 상태.
보상(점수, 새 도장, 칭호 오름, 도전 주문서 열림)은 `role="status"` 알림으로 한 번 읽어 준다. 소리를 꺼도 모든 보상은 글자로 보인다.
