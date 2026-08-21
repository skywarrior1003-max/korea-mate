// Trips 목록의 디자인 토큰 — 최종 시안 패키지의 `serene_executive_voyage/DESIGN.md`
// 와 `my_trips_final/code.html` 의 tailwind.config 값을 그대로 옮겼다.
// (TASK-MY-TRIPS-FINAL-UI-V1) 임의 색·임의 크기를 더하지 않는다.
//
// 글꼴은 Story 와 같은 Noto Serif / Inter 다 — layout.tsx 가 next/font 로 받아
// CSS 변수로 두므로 런타임에 Google Fonts 를 부르지 않는다.

import type { CSSProperties } from "react";
import { FONT_SERIF, FONT_SANS } from "@/components/story/story-tokens";

export const TRIPS_COLORS = {
  surface:                "#f8f9fa",
  surfaceContainerLowest: "#ffffff",
  surfaceContainerLow:    "#f3f4f5",
  onSurface:              "#191c1d",
  onSurfaceVariant:       "#444652",
  outline:                "#757683",
  outlineVariant:         "#c5c5d4",
  primary:                "#001654",
  secondary:              "#0041c9",
  secondaryFixed:         "#dce1ff",
  tertiary:               "#3e0a00",
  tertiaryContainer:      "#631500",
  error:                  "#ba1a1a",
} as const;

/** borderRadius: lg 0.25rem · xl 0.5rem · full 0.75rem (시안 config 그대로 — pill 이 아니다) */
export const RADIUS_LG   = 4;
export const RADIUS_XL   = 8;
export const RADIUS_FULL = 12;

/** spacing: xs 4 · base 8 · sm 12 · margin-mobile 16 · md 24 · lg 48 · xl 80 · margin-desktop 64 */
export const SP = { xs: 4, base: 8, sm: 12, mobile: 16, md: 24, lg: 48, xl: 80, desktop: 64, maxWidth: 1280 } as const;

export const HEADLINE_LG_MOBILE: CSSProperties = { fontFamily: FONT_SERIF, fontSize: 28, lineHeight: 1.2, fontWeight: 600 };
export const HEADLINE_LG:        CSSProperties = { fontFamily: FONT_SERIF, fontSize: 32, lineHeight: 1.2, fontWeight: 600 };
export const DISPLAY_LG:         CSSProperties = { fontFamily: FONT_SERIF, fontSize: 48, lineHeight: 1.1, fontWeight: 700, letterSpacing: "-0.02em" };
export const HEADLINE_MD:        CSSProperties = { fontFamily: FONT_SERIF, fontSize: 24, lineHeight: 1.3, fontWeight: 500 };
export const BODY_LG:            CSSProperties = { fontFamily: FONT_SANS,  fontSize: 18, lineHeight: 1.6, fontWeight: 400 };
export const BODY_MD:            CSSProperties = { fontFamily: FONT_SANS,  fontSize: 16, lineHeight: 1.6, fontWeight: 400 };
export const LABEL_LG:           CSSProperties = { fontFamily: FONT_SANS,  fontSize: 14, lineHeight: 1.2, fontWeight: 600, letterSpacing: "0.05em" };
export const LABEL_MD:           CSSProperties = { fontFamily: FONT_SANS,  fontSize: 12, lineHeight: 1.2, fontWeight: 500 };
export const CAPTION:            CSSProperties = { fontFamily: FONT_SANS,  fontSize: 11, lineHeight: 1.2, fontWeight: 400 };
