/**
 * 게임 이름에서 형광펜을 칠할 낱말을 고른다(처음 화면 h1, 게임 모음 h1).
 * 마지막 낱말. 이름 끝이 "(예시)"처럼 괄호 묶음이면 그 앞 낱말.
 *
 *   splitTitleMark('전개도 접기 공방')       → { before: '전개도 접기 ', mark: '공방', after: '' }
 *   splitTitleMark('약수·배수 분류 (예시)')  → { before: '약수·배수 ', mark: '분류', after: ' (예시)' }
 *   splitTitleMark('학습게임 모음 (개발 중)') → { before: '학습게임 ', mark: '모음', after: ' (개발 중)' }
 *
 * before + mark + after 는 늘 원래 이름과 같다.
 */
export function splitTitleMark(title) {
  const text = String(title);
  const tail = text.match(/\s*[([][^()[\]]*[)\]]\s*$/);
  const head = tail && tail.index > 0 ? text.slice(0, tail.index) : text;
  const rest = text.slice(head.length);
  const words = [...head.matchAll(/\S+/g)];
  if (words.length === 0 || (words.length === 1 && !rest)) return { before: '', mark: text, after: '' };
  const word = words[words.length - 1];
  return {
    before: head.slice(0, word.index),
    mark: word[0],
    after: head.slice(word.index + word[0].length) + rest,
  };
}
