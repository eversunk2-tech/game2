/**
 * 직육면체의 전개도 차시를 게임(main.js)에 붙이는 곳: 단계 화면, 찾은 전개도 모음, 도장, 놀이 방법 줄.
 * 단계 목록은 cuboid-stages.js(logic.js의 STAGES에 들어간다), 규칙은 cuboid-logic.js.
 */
import { playCuboidFree } from './cuboid-free.js';
import {
  CUBOID_FULL_SCORE_NETS,
  CUBOID_LATER_XP,
  CUBOID_NETS_ID,
  CUBOID_PAIR_NETS_ID,
  FREE_NET_COUNT,
  PAIR_NET_COUNT,
  freeNetIdAt,
  pairNetIdAt,
} from './cuboid-logic.js';
import { playCuboidJudge, playEdge, playFaceCard } from './cuboid-play.js';

/** 단계 종류(kind) → 화면 함수. cdex(직육면체 도감 주문)는 내 맘대로 직육면체 전개도와 같은 화면을 도감 주문으로 쓴다 */
export const CUBOID_SCREENS = { edge: playEdge, face: playFaceCard, cjudge: playCuboidJudge, cfree: playCuboidFree, cdex: playCuboidFree };

/**
 * "내 맘대로 직육면체 전개도"·"직육면체 도감 주문"에서 찾은 전개도를 이 기기에 적어 두는 모음. 점수는 전개도마다 이 기기에서 한 번만 주므로
 * (common-rules 3절) 무엇을 찾았는지 판을 넘어 남아야 한다 — 엔진의 도감 틀에 맡겨 점수와 늘 한 쌍으로 저장되게 한다.
 * - 세 길이가 모두 다른 상자의 54가지(cuboid-nets): 도감 주문의 54칸 도감이 단계 화면에 있다. 엔진의 칩·도감 화면에는 넣지 않고(quiet)
 *   결과 복사 문장에만 "직육면체 전개도 n/54"를 넣는다(report — 찾은 것이 있을 때만)
 * - 두 길이가 같은 상자의 29가지(cuboid-pair-nets): 조용한 모음(도감 화면 없음)
 * - 정육면체 상자로 찾은 것은 1차시의 정육면체 전개도 도감(cube-nets, main.js)에 넣는다
 * 점수 상한(사용자 결정 2026-10-11 · 2026-10-16): 두 모음을 합쳐 처음 10가지까지는 등록 +5(와 만들기 성공), 11번째부터는 등록 +1뿐 — xpAfter.with
 */
export const CUBOID_COLLECTIONS = [
  {
    id: CUBOID_NETS_ID,
    title: '직육면체 전개도',
    lesson: 'cuboid',
    quiet: true,
    report: true,
    xpAfter: { count: CUBOID_FULL_SCORE_NETS, xp: CUBOID_LATER_XP, with: [CUBOID_PAIR_NETS_ID] },
    items: Array.from({ length: FREE_NET_COUNT }, (_, i) => ({ id: freeNetIdAt(i), name: `직육면체 전개도 ${i + 1}` })),
  },
  {
    id: CUBOID_PAIR_NETS_ID,
    title: '두 길이가 같은 직육면체 전개도',
    lesson: 'cuboid',
    quiet: true,
    xpAfter: { count: CUBOID_FULL_SCORE_NETS, xp: CUBOID_LATER_XP, with: [CUBOID_NETS_ID] },
    items: Array.from({ length: PAIR_NET_COUNT }, (_, i) => ({ id: pairNetIdAt(i), name: `두 길이가 같은 직육면체 전개도 ${i + 1}` })),
  },
];

/**
 * 직육면체 차시의 도장: 직육면체 도감 54칸을 모두 채움("직육면체 도감 완성").
 * 도장판에 넣으면(main.js의 rewards.badges) 칸이 12 → 13개가 된다 — 등록은 최종 보고의 "사용자 결정 필요"를 보라
 */
export const CUBOID_BADGES = [
  {
    id: 'cuboid-dex-complete',
    title: '직육면체 도감 완성',
    desc: '세 모서리의 길이가 모두 다른 직육면체의 전개도 54가지를 모두 찾아요',
    icon: 'book',
    test: (s) => (s.collections[CUBOID_NETS_ID]?.count ?? 0) >= FREE_NET_COUNT,
  },
];

/** 직육면체 영역의 놀이 방법에 덧붙이는 줄 (상자 크기 정하기 · 돌리기 손잡이, spec 16-16) */
export const CUBOID_HOW_TO_MORE = [
  '[크기 바꾸기]로 상자의 가로, 세로, 높이를 1~4 cm에서 고르면 그 상자의 면 6장이 나와요.',
  '면을 누르면 모서리에 돌리기 손잡이가 생겨요. 손잡이를 잡고 돌리거나, 끄는 중에 R 키·마우스 오른쪽 버튼·다른 손가락으로 톡 쳐서 돌려요.',
];
