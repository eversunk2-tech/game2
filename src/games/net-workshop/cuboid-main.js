/**
 * 직육면체의 전개도 차시를 게임(main.js)에 붙이는 곳: 단계 화면, 찾은 전개도 모음.
 * 단계 목록은 cuboid-stages.js(logic.js의 STAGES에 들어간다), 규칙은 cuboid-logic.js.
 */
import { playCuboidFree } from './cuboid-free.js';
import { CUBOID_NETS_ID, FREE_NET_COUNT, freeNetIdAt } from './cuboid-logic.js';
import { playCuboidJudge, playEdge, playFaceCard } from './cuboid-play.js';

/** 단계 종류(kind) → 화면 함수 */
export const CUBOID_SCREENS = { edge: playEdge, face: playFaceCard, cjudge: playCuboidJudge, cfree: playCuboidFree };

/**
 * "내 맘대로 직육면체 전개도"에서 찾은 전개도를 이 기기에 적어 두는 모음(54칸). 점수는 전개도마다 이 기기에서 한 번만 주므로
 * (common-rules 3절) 무엇을 찾았는지 판을 넘어 남아야 한다 — 엔진의 도감 틀에 맡겨 점수와 늘 한 쌍으로 저장되게 한다.
 * 54가지는 도감 칸으로 보여 주기에는 너무 많아(spec 16-2) quiet로 둔다: 칩·도감 화면·결과 복사에 보이지 않고, 가지 수는 단계 화면이 보여 준다.
 */
export const CUBOID_COLLECTIONS = [
  {
    id: CUBOID_NETS_ID,
    title: '직육면체 전개도',
    lesson: 'cuboid',
    quiet: true,
    items: Array.from({ length: FREE_NET_COUNT }, (_, i) => ({ id: freeNetIdAt(i), name: `직육면체 전개도 ${i + 1}` })),
  },
];
