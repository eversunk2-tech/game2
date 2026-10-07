import { readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const DIST = path.resolve('dist');

export const gameFiles = () => readdirSync(DIST).filter((f) => f.endsWith('.html') && f !== 'index.html');

export const fileUrl = (name, query = '') => pathToFileURL(path.join(DIST, name)).href + query;

/** 페이지의 오류(예외·console.error)를 모은다. 테스트 끝에 빈 배열인지 확인한다. */
export function collectErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

/** 가로 스크롤이 생기지 않았는지 */
export async function hasHorizontalScroll(page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
}
