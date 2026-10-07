/**
 * 작은 DOM 도우미. innerHTML 대신 이것으로 화면을 만든다.
 *
 *   h('button', { class: 'btn', onclick: go }, '시작하기')
 *   h('ul', null, items.map((x) => h('li', null, x)))
 *
 * props: class, text, dataset, style(객체), on이벤트(함수), 나머지는 속성.
 * 값이 null·undefined·false면 건너뛰고, true면 빈 속성(disabled 등)으로 넣는다.
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(value));
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const child of [children].flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export function clear(el) {
  el.replaceChildren();
  return el;
}
