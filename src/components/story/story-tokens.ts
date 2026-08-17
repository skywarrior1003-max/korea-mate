// Public Memory Story 의 시각 토큰.
//
// 디자이너 최종 산출물에서 그대로 옮긴 값이다. 출처는 두 파일이고 우선순위가
// 정해져 있다 — 눈으로 본 `screen.png` 가 먼저고, 그 화면을 만든 `code.html`
// 의 tailwind.config 가 그 다음이다. Specs 문서와 값이 다르면 화면을 따른다
// (오너 확정). 그래서 이 파일의 숫자를 "더 나아 보인다" 는 이유로 고치면 안 된다.
//
// 왜 전역 tailwind.config 를 건드리지 않았나
//   이 토큰들(primary #a53c05, margin 20px …)은 이 화면 전용이다. 전역에 넣으면
//   `primary` 같은 흔한 이름이 앱의 다른 화면과 충돌한다. 여기 모아 두고 이
//   화면의 컴포넌트만 쓴다.

/** 화면 배경. `background`·`surface`·`surface-bright` 가 모두 같은 값이다. */
export const PAGE_BG = "#f8f9fa";

/** 브랜드 주황. code.html 의 `primary`. Specs 의 #C04808 이 아니다 — 화면 우선. */
export const PRIMARY = "#a53c05";

/** 본문 글자. code.html 의 `on-surface`. */
export const ON_SURFACE = "#191c1d";

/** 보조 글자. code.html 의 `on-surface-variant` — 회색이 아니라 따뜻한 갈색이다. */
export const ON_SURFACE_VARIANT = "#57423a";

/** 선·빈 상자 바탕. `surface-variant`. */
export const SURFACE_VARIANT = "#e1e3e4";

/** Summary 구간 바탕. `surface-container-low`. */
export const SURFACE_CONTAINER_LOW = "#f3f4f5";

/** hover 바탕. `surface-container`. */
export const SURFACE_CONTAINER = "#edeeef";

/** 가는 테두리. `outline-variant` 를 30% 로 쓴다. */
export const OUTLINE_VARIANT = "#dfc0b5";

/** 칩 바탕. `primary-container` 를 20% 로 쓴다. */
export const PRIMARY_CONTAINER = "#ff7e47";

/** 칩 글자. `on-primary-container`. */
export const ON_PRIMARY_CONTAINER = "#370e00";

// ── 여백 ─────────────────────────────────────────────────────────────────────
export const MARGIN_MOBILE  = 20; // px — Specs 의 24px 이 아니다
export const MARGIN_DESKTOP = 80;
export const STACK_LG       = 48; // Day 사이. Specs 의 64px 이 아니다
export const STACK_MD       = 24;
export const GUTTER         = 16; // 사진 사이
export const BASE           = 4;

// ── 글자 ─────────────────────────────────────────────────────────────────────
// serif 는 Noto Serif, sans 는 Inter. layout.tsx 가 next/font 로 받아 CSS 변수로
// 내려 준다 — 런타임에 외부 폰트를 부르지 않는다.
export const FONT_SERIF = "var(--font-story-serif), Georgia, serif";
export const FONT_SANS  = "var(--font-story-sans), system-ui, sans-serif";

/** Cover 제목 · Focus 인용 · Summary 제목. `display-memory` */
export const DISPLAY_MEMORY = {
  fontFamily: FONT_SERIF, fontSize: "48px", lineHeight: 1.2,
  letterSpacing: "-0.02em", fontWeight: 700,
} as const;

/** DAY 라벨. `headline-lg` */
export const HEADLINE_LG = {
  fontFamily: FONT_SERIF, fontSize: "32px", lineHeight: 1.3, fontWeight: 600,
} as const;

/** Journal 의 Memory 인용. `headline-lg-mobile` + italic */
export const HEADLINE_LG_MOBILE = {
  fontFamily: FONT_SERIF, fontSize: "26px", lineHeight: 1.3, fontWeight: 600,
} as const;

/** 버튼·장소명. `title-md` */
export const TITLE_MD = {
  fontFamily: FONT_SANS, fontSize: "18px", lineHeight: 1.5, fontWeight: 600,
} as const;

/** 본문. `body-lg` */
export const BODY_LG = {
  fontFamily: FONT_SANS, fontSize: "16px", lineHeight: 1.6, fontWeight: 400,
} as const;

/** 날짜·장소칩. `body-sm` */
export const BODY_SM = {
  fontFamily: FONT_SANS, fontSize: "14px", lineHeight: 1.6, fontWeight: 400,
} as const;

/** 대문자 라벨. `label-caps` */
export const LABEL_CAPS = {
  fontFamily: FONT_SANS, fontSize: "12px", lineHeight: 1,
  letterSpacing: "0.05em", fontWeight: 700,
} as const;

// ── 모양 ─────────────────────────────────────────────────────────────────────
/** 사진·카드 모서리. `rounded-xl` = 0.75rem. Specs 의 16px 이 아니다 — 화면 우선. */
export const RADIUS_PHOTO = "0.75rem";

/** code.html 의 `.ambient-shadow` */
export const AMBIENT_SHADOW = "0 10px 30px rgba(0,0,0,0.05)";

/** code.html 의 `.glass-overlay` — 사진 위 장소칩 */
export const GLASS_OVERLAY = {
  background: "rgba(255, 255, 255, 0.1)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  borderTop: "1px solid rgba(255, 255, 255, 0.2)",
} as const;
