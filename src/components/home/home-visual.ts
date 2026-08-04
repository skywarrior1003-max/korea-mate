// Home Experience 시각 상수.
//
// 승인된 시안(docs/design/final-mobile-2026-08-02)의 tailwind.config 에 박혀
// 있던 값을 그대로 옮겼다. 색을 눈대중으로 다시 고르지 않기 위해서다.
// 이 팔레트는 Home 상단(Storytelling / Discovery / Memory) 안에서만 쓴다 —
// 앱 전역 토큰(Coral/Ink/Neutral/Violet)을 갈아엎지 않는다.

/** 시안 primary. 파란 CTA·강조 링크·활성 표시에 쓴다 */
export const DESIGN_PRIMARY = "#0041c8";
/** 시안 on-surface. 본문 검정 */
export const DESIGN_INK = "#131b2e";
/** 시안 surface. 살짝 푸른 흰색 */
export const DESIGN_SURFACE = "#faf8ff";
/** 시안 surface-container-low. 카드·검색창 바탕 */
export const DESIGN_SURFACE_LOW = "#f2f3ff";
/** 시안 outline. 보조 텍스트 */
export const DESIGN_OUTLINE = "#737688";
/** 시안 outline-variant. 경계선 */
export const DESIGN_LINE = "#c3c5d9";
/** 시안 secondary-container. 민트 타일 */
export const DESIGN_MINT = "#26fedc";
/** 시안 on-secondary-fixed. 민트 타일 위 글자 */
export const DESIGN_MINT_INK = "#00201a";

/**
 * Hero 최대 폭.
 * 원본이 768px 폭이라 그 이상 늘리면 눈에 띄게 흐려진다. 태블릿·데스크톱에서
 * 화면을 꽉 채우는 대신 여기서 멈춘다.
 */
export const HERO_MAX_WIDTH = 768;
