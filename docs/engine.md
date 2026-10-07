# 공통 엔진 사용법

모든 게임은 `src/shared/`의 엔진을 함께 쓴다. 게임 하나가 만드는 것은 **단계 목록**과 **단계 하나를 플레이하는 함수**뿐이다.
처음 화면, 놀이 방법, 단계 선택(잠금·별), 결과, 학습 기록, 소리 켜고 끄기, 결과 복사는 엔진이 만든다.
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
│   └── canvas.js         Canvas 게임 루프, 고해상도 캔버스, 포인터 좌표
├── ui/                   브라우저 화면
│   ├── app.js            createGameApp: 화면 흐름 전체
│   ├── dom.js            h(): 요소 만들기
│   ├── icons.js          인라인 SVG 아이콘 icon('sound'), 별 starIcon(true)
│   ├── drag-drop.js      끌어다 놓기 + 눌러서 넣기 + 키보드
│   ├── feedback.js       정답·오답 알림(말풍선 쪽지), 흔들기 효과, anchor
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
파일 하나 규칙 때문에 `<script>`·`<image>`·`<use>`·`href`·`url()`·`id`는 쓸 수 없다(빌드가 검사). 색은 `#ffd86b`처럼 직접 쓰고,
글자를 넣으면 `font-family="'Do Hyeon', sans-serif"`. 없으면 게임 색 무늬 위에 게임 이름 첫 글자 종이가 나온다.

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
| `ctx.log.answer({ itemId, correct, tag, given, expected })` | 학생이 답할 때마다 부른다. 틀렸으면 `tag`에 오개념 이름 |
| `ctx.log.stats()` | 지금까지 `{ attempts, correct, accuracy }` |
| `ctx.feedback.correct(문장, 요소)` | 초록 알림(✓) + 요소 튀기기 |
| `ctx.feedback.wrong(문장, 요소)` | 벽돌색 알림(✗) + 요소 흔들기. **왜 틀렸는지** 쓴다 |
| `ctx.feedback.info(문장)` | 안내 알림 |
| `ctx.feedback.anchor(요소)` | 넓은 화면(901px 이상)에서 알림을 그 요소(예: 게임 무대)의 아래쪽 가운데에 띄운다. 옆 판의 버튼을 가리지 않게 할 때. `null`이면 기본 자리(화면 아래 가운데). 화면이 바뀌면 엔진이 되돌린다 |
| `ctx.sfx.play('correct' \| 'wrong' \| 'click' \| 'clear')` | 효과음 |
| `ctx.h` | 요소 만들기 도우미 (아래) |
| `ctx.finish({ stars?, cleared? })` | 단계 끝. `stars`를 생략하면 정답률로 정한다(90%↑ ★3, 70%↑ ★2, 나머지 ★1). 실패는 `{ cleared: false }` |

### 단계 필드 (선택)

| 필드 | 설명 |
| --- | --- |
| `goal` | 단계 지도 카드와 플레이 머리에 나오는 목표 한 문장 |
| `thumb` | `(h) => 요소` 단계 카드 오른쪽 위 작은 그림(약 76×57px, SVG 권장). 잠긴 카드에서는 흐리게 |
| `chip` | 플레이 머리 제목 옆 칩 글자(예: `'검사 주문'`). 없으면 `'1단계'` |

### 처음 화면 그림 (heroArt, 선택)

`heroArt: (h) => 요소`를 주면 처음 화면 오른쪽, 게임 색(`game.json`의 `color`) 매트 위 가운데에 놓인다. 매트·자·색종이 조각은 엔진이 그린다.
움직이지 않는 그림으로 만든다(저사양 기기). 주지 않으면 색종이 몇 장 위에 게임 이름 첫 글자가 나온다. 처음 화면 그림은 화면 읽기 프로그램에서 숨긴다.

### 화면 모습 (엔진이 그린다)

- 머리: 게임 이름(왼쪽 노랑 네모에 첫 글자) + [소리 켬/끔]
- 처음 화면: 윗줄(`.eyebrow` = 차시 제목 또는 `subtitle`) + 학년 칩, 게임 이름(마지막 낱말에 형광펜), 요약, [시작하기 ▶]·[놀이 방법]·[학습 기록], 오른쪽 그림
- 단계 지도: 차시마다 종이 판(`.lesson-group`, "1차시" 칩 + 차시 제목 h3) 안에 점선 길로 이은 단계 카드(`.stage-path .stage-card`). 카드 상태는 마쳤어요 ✓ / 지금 할 곳(파랑 테두리 + "여기부터!") / 잠김(점선 + 자물쇠, `disabled`)
- 플레이 머리: [← 단계 선택] · 단계 제목 + 칩 · 목표. 아래가 `ctx.el`(`.play-area`)
- 결과: 증명서(단계 이름, 제목, 도장 "참 잘했어요"/"잘했어요"/"끝까지 했어요"/"다시 해 봐요", 별, 별 기준 안내, 정답률·맞힘·시간, 버튼) + 오른쪽 "다시 살펴볼 점"
- 학습 기록: 요약 칸 4개(한 판 수·정답률·모은 별·마친 단계), 기록 표, 자주 틀린 개념, 아래에 이름 칸·지우기

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
| `note`, `note-wrong`, `note-correct`, `note-title` | 까닭 쪽지(벽돌색·초록, ✓✗ 아이콘·글자와 함께) |
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
// 이름: back sound mute lock check cross info rotl rotr play unfold bulb book stamp spark clock user target search cube trash undo hand shield grid flag arrow copy home
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

옵션은 함께 쓸 수 있다: `fraction-factory.html?unlock=all&sound=off`

## 9. 학습 기록과 개인정보

- 기록은 그 기기 브라우저(localStorage)에만 남고 어디로도 보내지 않는다.
- 이름은 저장하지 않는다. "결과 복사" 때만 입력한 이름을 문장에 넣는다.
- 학생은 학습 기록 화면의 "결과 복사"로 결과를 클래스룸·패들렛 등에 붙여 넣는다.
- 같은 기기를 여러 학생이 쓰면 "기록·별 모두 지우기"로 지운다.
- 게임 모음 페이지는 같은 주소(같은 출처)에서 게임의 별 기록을 읽을 수 있으면 카드에 "별 n개 · 이어 하기"를 보인다(읽기만 하고 보내지 않는다).
