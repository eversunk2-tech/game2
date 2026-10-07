/**
 * 제목 글꼴(Do Hyeon, SIL OFL 1.1)을 게임마다 쓰인 글자만 잘라 넣는다.
 *
 *   빌드: 묶은 HTML(JS·CSS 포함)에서 글자를 모아 → 잘라서 woff2 → data: 주소 @font-face
 *   개발 서버: 전체 TTF를 /__fonts/display.ttf 로 보여 준다(devFontCss)
 *
 * 글꼴 원본은 npm 패키지 @expo-google-fonts/do-hyeon(devDependency)에 있다. 저장소에는 라이선스만 둔다
 * (src/shared/fonts/OFL.txt). 글꼴에 없는 글자는 기기 글꼴(굵게)로 보인다.
 */
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import subsetFont from 'subset-font';

const require = createRequire(import.meta.url);

export const DISPLAY_FONT = {
  family: 'Do Hyeon',
  file: require.resolve('@expo-google-fonts/do-hyeon/400Regular/DoHyeon_400Regular.ttf'),
  notice: 'Do Hyeon - Copyright 2018 The Do Hyeon Project Authors. SIL Open Font License 1.1 (openfontlicense.org)',
};

// 저작권(0)·이름(1~6)·라이선스(13, 14)는 잘라 낸 글꼴 안에도 남긴다(OFL 조건).
const NAME_IDS = [0, 1, 2, 3, 4, 5, 6, 13, 14];
// 한 굵기 글꼴이지만 100~900 범위로 선언한다: 굵게(700) 써도 가짜 굵기를 만들지 않고,
// 글꼴이 없을 때는 기기 글꼴이 그 굵기로 보인다.
const FACE_RULES = 'font-weight:100 900;font-style:normal;font-display:swap';

export const isHangulSyllable = (ch) => {
  const code = ch.codePointAt(0);
  return code >= 0xac00 && code <= 0xd7a3;
};

/** 화면에 나올 수 있는 글자 모으기: data: 주소(그림·글꼴)를 뺀 HTML 전체 + 출력 가능한 ASCII */
export function collectFontText(html) {
  const text = String(html).replace(/data:[^"')\s]+/g, ' ');
  const chars = new Set();
  for (let c = 0x20; c < 0x7f; c += 1) chars.add(String.fromCharCode(c));
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code < 0x20 || (code >= 0x7f && code < 0xa0)) continue;
    chars.add(ch);
  }
  return [...chars].sort().join('');
}

/** TTF/OTF(sfnt)의 cmap에서 글자 코드 목록을 읽는다(format 4·12). */
export function readCmap(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const numTables = view.getUint16(4);
  let cmap = -1;
  for (let i = 0; i < numTables; i += 1) {
    const rec = 12 + i * 16;
    const tag = String.fromCharCode(...new Uint8Array(buffer.buffer, buffer.byteOffset + rec, 4));
    if (tag === 'cmap') cmap = view.getUint32(rec + 8);
  }
  if (cmap < 0) throw new Error('글꼴에 cmap 표가 없어요.');
  const codes = new Set();
  const count = view.getUint16(cmap + 2);
  for (let i = 0; i < count; i += 1) {
    const offset = cmap + view.getUint32(cmap + 4 + i * 8 + 4);
    const format = view.getUint16(offset);
    if (format === 4) {
      const segX2 = view.getUint16(offset + 6);
      const ends = offset + 14;
      const starts = ends + segX2 + 2;
      const deltas = starts + segX2;
      const ranges = deltas + segX2;
      for (let s = 0; s < segX2; s += 2) {
        const end = view.getUint16(ends + s);
        const start = view.getUint16(starts + s);
        const delta = view.getInt16(deltas + s);
        const rangeOffset = view.getUint16(ranges + s);
        for (let c = start; c <= end && c !== 0xffff; c += 1) {
          let glyph;
          if (rangeOffset === 0) glyph = (c + delta) & 0xffff;
          else {
            const at = ranges + s + rangeOffset + (c - start) * 2;
            glyph = view.getUint16(at);
            if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
          }
          if (glyph !== 0) codes.add(c);
        }
      }
    } else if (format === 12) {
      const groups = view.getUint32(offset + 12);
      for (let g = 0; g < groups; g += 1) {
        const at = offset + 16 + g * 12;
        const start = view.getUint32(at);
        const end = view.getUint32(at + 4);
        for (let c = start; c <= end; c += 1) codes.add(c);
      }
    }
  }
  return codes;
}

let source = null;
async function loadSource() {
  if (!source) {
    source = readFile(DISPLAY_FONT.file).then((ttf) => ({ ttf, cmap: readCmap(ttf) }));
  }
  return source;
}

/** 글자들로 글꼴을 자른다. format: 'woff2'(빌드) · 'sfnt'(검사) */
export async function subsetDisplayFont(text, format = 'woff2') {
  const { ttf } = await loadSource();
  return subsetFont(ttf, text, { targetFormat: format, preserveNameIds: NAME_IDS });
}

/**
 * 이 HTML에 쓰인 글자만 담은 @font-face CSS를 만든다.
 * → { css, chars(넣은 글자 수), bytes(woff2 크기), missing(글꼴에 없는 한글 음절) }
 */
export async function displayFontFace(html) {
  const { cmap } = await loadSource();
  const text = collectFontText(html);
  const kept = [...text].filter((ch) => cmap.has(ch.codePointAt(0)));
  const missing = [...text].filter((ch) => isHangulSyllable(ch) && !cmap.has(ch.codePointAt(0)));
  const woff2 = await subsetDisplayFont(kept.join(''), 'woff2');
  const css = `/*! ${DISPLAY_FONT.notice} */@font-face{font-family:"${DISPLAY_FONT.family}";`
    + `src:url(data:font/woff2;base64,${Buffer.from(woff2).toString('base64')}) format("woff2");${FACE_RULES}}`;
  return { css, chars: kept.length, bytes: woff2.length, missing };
}

/** 글꼴 CSS를 <head> 끝에 넣는다. */
export function injectStyle(html, css) {
  const tag = `<style>${css}</style>`;
  return /<\/head>/i.test(html) ? html.replace(/<\/head>/i, () => `${tag}\n</head>`) : tag + html;
}

/** 개발 서버용: 전체 글꼴 파일을 쓰는 @font-face */
export function devFontCss(url) {
  return `/* ${DISPLAY_FONT.notice} */\n@font-face{font-family:"${DISPLAY_FONT.family}";src:url(${url}) format("truetype");${FACE_RULES}}\n`;
}
