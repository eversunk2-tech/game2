/**
 * 정육면체 전개도 자료 (상수). 칸 [x, y]는 왼쪽 위가 [0, 0], 오른쪽으로 x, 아래로 y.
 * 모두 가로가 세로보다 길거나 같게 놓았다(무대에 크게 보이도록).
 * tests/unit/net-workshop-fold.test.js에서 헥소미노 35개를 나열해 이 표가 빠짐없고 맞는지 검사한다.
 */

/**
 * 정육면체 전개도 11가지. family: 줄마다 칸 수(1-4-1, 2-3-1, 2-2-2, 3-3)
 *   1-4-1: 가운데 줄 4칸 + 위·아래에 1칸씩 (6가지)
 *   2-3-1: 위 2칸, 가운데 3칸, 아래 1칸 (3가지)
 *   2-2-2: 계단 (1가지) · 3-3: 3칸 두 줄 (1가지)
 */
export const CUBE_NETS = [
  { name: '1-4-1a', family: '1-4-1', cells: [[0, 0], [0, 1], [1, 1], [2, 1], [3, 1], [0, 2]] }, // #.../####/#...
  { name: '1-4-1b', family: '1-4-1', cells: [[0, 0], [0, 1], [1, 1], [2, 1], [3, 1], [1, 2]] }, // #.../####/.#..
  { name: '1-4-1c', family: '1-4-1', cells: [[0, 0], [0, 1], [1, 1], [2, 1], [3, 1], [2, 2]] }, // #.../####/..#.
  { name: '1-4-1d', family: '1-4-1', cells: [[0, 0], [0, 1], [1, 1], [2, 1], [3, 1], [3, 2]] }, // #.../####/...#
  { name: '1-4-1e', family: '1-4-1', cells: [[1, 0], [0, 1], [1, 1], [2, 1], [3, 1], [1, 2]] }, // .#../####/.#.. (십자)
  { name: '1-4-1f', family: '1-4-1', cells: [[1, 0], [0, 1], [1, 1], [2, 1], [3, 1], [2, 2]] }, // .#../####/..#.
  { name: '2-3-1a', family: '2-3-1', cells: [[0, 0], [1, 0], [1, 1], [2, 1], [3, 1], [1, 2]] }, // ##../.###/.#..
  { name: '2-3-1b', family: '2-3-1', cells: [[0, 0], [1, 0], [1, 1], [2, 1], [3, 1], [2, 2]] }, // ##../.###/..#.
  { name: '2-3-1c', family: '2-3-1', cells: [[0, 0], [1, 0], [1, 1], [2, 1], [3, 1], [3, 2]] }, // ##../.###/...#
  { name: '2-2-2', family: '2-2-2', cells: [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2], [3, 2]] }, // ##../.##./..##
  { name: '3-3', family: '3-3', cells: [[0, 0], [1, 0], [2, 0], [2, 1], [3, 1], [4, 1]] }, // ###../..###
];

/**
 * 정육면체로 접히지 않는 헥소미노 24가지.
 * reason: 접을 때 먼저 걸리는 까닭 (checkNet의 problem type)
 * shape: line5(한 줄 5칸 이상) · same-side(4칸 줄의 같은 쪽에 날개 둘) · block(2×2 덩어리) · other
 */
export const INVALID_HEXOMINOES = [
  { name: 'line5-a', shape: 'line5', reason: 'overlap', cells: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0]] }, // ######
  { name: 'line5-b', shape: 'line5', reason: 'overlap', cells: [[0, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1]] }, // #..../#####
  { name: 'line5-c', shape: 'line5', reason: 'overlap', cells: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [1, 1]] }, // #####/.#...
  { name: 'line5-d', shape: 'line5', reason: 'overlap', cells: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [2, 1]] }, // #####/..#..
  { name: 'same-side-a', shape: 'same-side', reason: 'overlap', cells: [[0, 0], [1, 0], [2, 0], [3, 0], [0, 1], [2, 1]] }, // ####/#.#.
  { name: 'same-side-b', shape: 'same-side', reason: 'overlap', cells: [[0, 0], [1, 0], [2, 0], [3, 0], [0, 1], [3, 1]] }, // ####/#..#
  { name: 'other-a', shape: 'other', reason: 'overlap', cells: [[0, 0], [1, 0], [1, 1], [2, 1], [3, 1], [4, 1]] }, // ##.../.####
  { name: 'other-b', shape: 'other', reason: 'overlap', cells: [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2], [3, 2]] }, // #.../#.../####
  { name: 'other-c', shape: 'other', reason: 'overlap', cells: [[0, 0], [1, 0], [2, 0], [3, 0], [1, 1], [1, 2]] }, // ####/.#../.#..
  { name: 'other-d', shape: 'other', reason: 'overlap', cells: [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2], [3, 2]] }, // #.../##../.###
  { name: 'other-e', shape: 'other', reason: 'overlap', cells: [[0, 0], [1, 0], [2, 0], [2, 1], [3, 1], [2, 2]] }, // ###./..##/..#.
  { name: 'other-f', shape: 'other', reason: 'overlap', cells: [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1], [3, 1]] }, // ###./#.##
  { name: 'other-g', shape: 'other', reason: 'overlap', cells: [[0, 0], [1, 0], [1, 1], [1, 2], [2, 2], [3, 2]] }, // ##../.#../.###
  { name: 'other-h', shape: 'other', reason: 'overlap', cells: [[0, 0], [0, 1], [2, 1], [0, 2], [1, 2], [2, 2]] }, // #../#.#/###
  { name: 'other-i', shape: 'other', reason: 'overlap', cells: [[0, 0], [0, 1], [1, 1], [2, 1], [0, 2], [2, 2]] }, // #../###/#.#
  { name: 'other-j', shape: 'other', reason: 'overlap', cells: [[0, 0], [1, 0], [1, 1], [2, 1], [0, 2], [1, 2]] }, // ##./.##/##.
  { name: 'block-a', shape: 'block', reason: 'vertex-full', cells: [[0, 0], [1, 0], [0, 1], [1, 1], [2, 1], [3, 1]] }, // ##../####
  { name: 'block-b', shape: 'block', reason: 'vertex-full', cells: [[0, 0], [1, 0], [2, 0], [3, 0], [1, 1], [2, 1]] }, // ####/.##.
  { name: 'block-c', shape: 'block', reason: 'vertex-full', cells: [[0, 0], [1, 0], [2, 0], [1, 1], [2, 1], [3, 1]] }, // ###./.###
  { name: 'block-d', shape: 'block', reason: 'vertex-full', cells: [[0, 0], [0, 1], [1, 1], [0, 2], [1, 2], [2, 2]] }, // #../##./###
  { name: 'block-e', shape: 'block', reason: 'vertex-full', cells: [[0, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2]] }, // #../###/##.
  { name: 'block-f', shape: 'block', reason: 'vertex-full', cells: [[0, 0], [1, 0], [0, 1], [1, 1], [2, 1], [1, 2]] }, // ##./###/.#.
  { name: 'block-g', shape: 'block', reason: 'vertex-full', cells: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]] }, // ###/###
  { name: 'block-h', shape: 'block', reason: 'vertex-full', cells: [[0, 0], [0, 1], [1, 1], [2, 1], [1, 2], [2, 2]] }, // #../###/.##
];

/** 면 개수가 6이 아닌 전개도 (펜토미노 5면, 헵토미노 7면). 2×2 덩어리는 없다. */
export const FACE_COUNT_NETS = [
  { name: 'penta-y', faces: 5, cells: [[1, 0], [0, 1], [1, 1], [2, 1], [3, 1]] }, // .#../####
  { name: 'penta-x', faces: 5, cells: [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]] }, // .#./###/.#.
  { name: 'penta-n', faces: 5, cells: [[0, 0], [1, 0], [1, 1], [2, 1], [3, 1]] }, // ##../.###
  { name: 'hepta-cross', faces: 7, cells: [[1, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [1, 2]] }, // .#.../#####/.#...
  { name: 'hepta-step', faces: 7, cells: [[0, 0], [1, 0], [1, 1], [2, 1], [3, 1], [4, 1], [2, 2]] }, // ##.../.####/..#..
];
