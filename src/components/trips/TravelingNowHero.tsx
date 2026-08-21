"use client";

// TRAVELING NOW — 진행 중인 여행 하나를 큰 사진 카드로. (TASK-MY-TRIPS-FINAL-UI-V1)
// 시안 `my_trips_final/code.html`:
//   h-[280px] · rounded-xl(8) · border outline-variant/30 · shadow-sm
//   아래에서 위로 black/80 → black/30 → 투명 그라디언트
//   p-md(24) 안에  eyebrow(label, 12px, white/90, uppercase, tracking-widest)
//                 제목(headline-lg-mobile 28px serif, white)
//                 칩(bg white/20, blur, rounded-full(12), border white/10, 점 secondary-fixed pulse, label-md white)
//
// 칩의 "Today · 장소"는 일정 시간으로 고른 장소다(GPS 아님). 알 수 없으면 칩을 그리지 않는다.
// 카드 전체가 My Trip 진입 링크다. 시안에 없는 기존 기능(삭제)은 오른쪽 위 ⋯ 하나.

import Link from "next/link";
import type { ReactNode } from "react";
import type { CityVisual } from "@/lib/city-visual";
import { TRIPS_COLORS as C, RADIUS_XL, RADIUS_FULL, SP, HEADLINE_LG_MOBILE, LABEL_MD } from "./trips-tokens";
import { MoreHoriz } from "./TripsPrimitives";

interface Props {
  href:       string;
  eyebrow:    string;          // "Aug 19 – Aug 24 · Seoul"
  title:      string;
  chip?:      string | null;   // "Today · Cafe Onion Anguk"
  visual:     CityVisual | null;
  cityLabel:  string;
  onMore?:    () => void;
  moreLabel?: string;
  confirm?:   ReactNode;
}

export default function TravelingNowHero({ href, eyebrow, title, chip, visual, cityLabel, onMore, moreLabel, confirm }: Props) {
  return (
    <div>
      <div
        className="relative w-full overflow-hidden shadow-sm group"
        style={{ height: 280, borderRadius: RADIUS_XL, border: `1px solid ${C.outlineVariant}4d`, backgroundColor: C.surfaceContainerLow }}
      >
        <Link href={href} className="gkm-focus absolute inset-0 block" aria-label={title}>
          {visual ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={visual.src} alt="" width={visual.w} height={visual.h}
              style={{ objectPosition: visual.objectPosition }}
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
          ) : (
            /* 대표 비주얼이 없는 도시 — 다른 도시 사진으로 메우지 않는다 */
            <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: C.onSurfaceVariant }}>
              <span style={{ ...HEADLINE_LG_MOBILE, color: "rgba(255,255,255,0.6)" }}>{cityLabel}</span>
            </div>
          )}
          {/* 값을 직접 적는다 — tailwind 그라디언트의 oklab 보간을 피한다(Story Cover 와 같은 이유) */}
          <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(to top, rgba(0,0,0,0.8), rgba(0,0,0,0.3) 50%, rgba(0,0,0,0))" }} />
          <div className="absolute bottom-0 left-0 w-full" style={{ padding: SP.md }}>
            <p className="uppercase tracking-widest" style={{ ...LABEL_MD, fontWeight: 600, letterSpacing: "0.1em", color: "rgba(255,255,255,0.9)", marginBottom: SP.base }}>
              {eyebrow}
            </p>
            <h3 style={{ ...HEADLINE_LG_MOBILE, color: "#ffffff", marginBottom: chip ? SP.mobile : 0, textWrap: "balance" }}>
              {title}
            </h3>
            {chip && (
              <div
                className="inline-flex items-center backdrop-blur-md"
                style={{ backgroundColor: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: RADIUS_FULL, padding: `${SP.base}px ${SP.mobile}px` }}
              >
                <span className="animate-pulse" style={{ width: 8, height: 8, borderRadius: 9999, backgroundColor: C.secondaryFixed, marginRight: SP.base }} aria-hidden />
                <span style={{ ...LABEL_MD, color: "#ffffff" }}>{chip}</span>
              </div>
            )}
          </div>
        </Link>
        {onMore && (
          <button
            type="button" onClick={onMore} aria-label={moreLabel}
            className="gkm-focus absolute flex items-center justify-center w-10 h-10 rounded-full backdrop-blur-md cursor-pointer"
            style={{ top: SP.sm, right: SP.sm, backgroundColor: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <MoreHoriz color="#ffffff" />
          </button>
        )}
      </div>
      {confirm && (
        <div className="shadow-sm" style={{ marginTop: SP.sm, backgroundColor: C.surfaceContainerLowest, border: `1px solid ${C.outlineVariant}`, borderRadius: RADIUS_XL, paddingTop: SP.xs }}>
          {confirm}
        </div>
      )}
    </div>
  );
}
