/**
 * 새 버전을 올린 직후(spec-grade6 7-5절): 브라우저가 들고 있던 옛 HTML이 이제는 없는 옛 파일(이름에 내용 해시)을 찾는 일.
 *
 *   처음 스크립트가 받아지지 않으면: 빌드한 HTML의 <script type="module" … onerror>(bootErrorHandler)가 **한 번만** 새로 고친다.
 *     되풀이를 막는 표시는 sessionStorage의 RELOAD_KEY(값 = 그 페이지 경로). 이미 한 번 새로 고쳤거나 sessionStorage를 못 쓰면
 *     새로 고치지 않고 #app에 안내와 [새로 고침]만 보인다(되풀이 없음).
 *   앱이 열리면 엔진(createGameApp().start())이 표시를 지운다(clearReloadMark) — 다음에 또 새 버전이 올라와도 한 번은 저절로 새로 고친다.
 *   늦게 받는 묶음(영역의 플레이)을 못 받으면 엔진의 불러오기 실패 화면(docs/engine.md 2절 "늦게 불러오기")이다.
 * 학생 정보는 담지 않는다(페이지 경로뿐, 탭을 닫으면 없어진다).
 */
export const RELOAD_KEY = 'edu:reload-once';

/** 처음 스크립트를 못 받았을 때 #app에 보이는 안내 */
export const BOOT_ERROR_TEXT = '게임 파일을 받지 못했어요. 새 버전이 올라오는 중일 수 있어요. 잠시 뒤에 [새로 고침]을 눌러 주세요.';

/** 앱이 열렸다: 되풀이 막는 표시를 지운다(sessionStorage를 못 쓰면 아무것도 하지 않는다) */
export function clearReloadMark() {
  try {
    globalThis.sessionStorage?.removeItem(RELOAD_KEY);
  } catch {
    // 막힌 브라우저: 표시도 없다
  }
}

/**
 * HTML의 <script type="module" onerror="…">에 넣을 처리(자바스크립트 글자 — 빌드가 속성 값으로 넣는다).
 * 바깥 주소·`//`를 쓰지 않는다(빌드 검사 ①). 엔진 CSS가 받아졌으면 .panel·.btn 모습, 아니면 기본 모습이다.
 */
export function bootErrorHandler() {
  return [
    '(function(){',
    `var k='${RELOAD_KEY}',p=location.pathname,s=null;`,
    'try{s=window.sessionStorage;}catch(e){}',
    'try{if(s&&s.getItem(k)!==p){s.setItem(k,p);location.reload();return;}}catch(e){}',
    "var a=document.getElementById('app')||document.body;",
    "if(!a||document.querySelector('.boot-error'))return;",
    "var b=document.createElement('div');b.className='panel boot-error';b.setAttribute('role','alert');",
    `var t=document.createElement('p');t.textContent='${BOOT_ERROR_TEXT}';`,
    "var r=document.createElement('button');r.type='button';r.className='btn btn-primary';r.textContent='새로 고침';",
    'r.onclick=function(){location.reload();};',
    'b.appendChild(t);b.appendChild(r);a.appendChild(b);',
    '})()',
  ].join('');
}
