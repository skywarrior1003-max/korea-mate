"use client";

// GoKoreaMate — Shared Trip Cover (V1A, 관광 테마 사진)
//
// 시각 독창성: docs/media-license-policy.md 10절 적용.
// 참고 앱의 레이아웃·타이포·폴라로이드·지도 표현을 복제하지 않는다.
// 고유 장치 — 좌측 코랄 레일, 하단 정렬 텍스트 스택, 여행 사실 스탬프 3칸.
//
// theme_only 제약: 자산의 place_name 을 촬영지 캡션으로 노출하지 않는다.
// 사진 위에는 테마 라벨(Busan · Beach & Ocean)만 쓰고, 일정의 실제 장소는
// 아래 Trip highlights 영역에 분리해 표시한다.

import { useState } from "react";
import { THEME_LABEL } from "@/lib/trip-cover/cover-core";
import type { CoverAsset, CoverTheme } from "@/lib/trip-cover/cover-core";

export interface TripCoverProps {
  /** 커버 이미지 소스. V1B 에서 /img/trip-cover/:id?v= 로 주입된다 */
  coverSrc:      string;
  asset:         CoverAsset | undefined;
  theme:         CoverTheme;
  title:         string;
  city:          string;
  startDate:     string;
  endDate:       string;
  days:          number;
  places:        number;
  neighborhoods: number;
  copyCount:     number;
  helpfulCount:  number;
  highlights:    string[];       // 일정의 실제 대표 장소 — 사진과 결합하지 않는다
  /**
   * 실제로 표시되는 커버 종류.
   * "unknown" 이면 아직 판정 전이므로 KTO 출처를 **표시하지 않는다** —
   * 기본값을 tourism 으로 잡으면 개인 사진에 한국관광공사 출처가 잠깐 노출된다.
   */
  coverKind?:    "unknown" | "personal" | "tourism";
  /** 이미지 로드 실패 시 다음 후보를 요청 */
  onImageError?: () => void;
}

const CORAL = "#FF4A2D";
const INK   = "#191C21";

export default function TripCover({
  coverSrc, asset, theme, title, city, startDate, endDate,
  days, places, neighborhoods, copyCount, helpfulCount, highlights,
  coverKind = "unknown", onImageError,
}: TripCoverProps) {
  const [failed, setFailed] = useState(false);
  const cityCap = city.charAt(0).toUpperCase() + city.slice(1).toLowerCase();
  const showPhoto = Boolean(coverSrc) && !failed;

  const stamps: [number, string][] = [
    [days,          days === 1 ? "Day" : "Days"],
    [places,        places === 1 ? "Place" : "Places"],
    [neighborhoods, neighborhoods === 1 ? "Area" : "Areas"],
  ];

  return (
    <section
      className="relative w-full overflow-hidden"
      style={{ backgroundColor: INK }}
      aria-label="Trip cover"
    >
      {/* 좌측 코랄 레일 — GoKoreaMate 고유 장치 */}
      <div className="absolute left-0 top-0 bottom-0 z-20" style={{ width: 6, backgroundColor: CORAL }} />

      {/* 사진 레이어 — 모바일은 세로 표지, 데스크톱은 에디토리얼 와이드 */}
      <div className="relative w-full h-[62vh] min-h-[420px] max-h-[560px] sm:h-[52vh] sm:max-h-[520px]">
        {showPhoto ? (
          <img
            src={coverSrc}
            alt={`${cityCap} ${THEME_LABEL[theme]}`}
            className="absolute inset-0 w-full h-full object-cover"
            loading="eager"
            onError={() => { setFailed(true); onImageError?.(); }}
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: `linear-gradient(140deg, #22262C 0%, #2A1D1A 58%, ${CORAL} 100%)` }}
          />
        )}

        {/* 절제된 그라데이션 — 사진을 덮지 않고 하단 가독성만 확보 */}
        <div
          className="absolute inset-0"
          style={{
            background:
              `linear-gradient(to bottom, rgba(25,28,33,0.15) 0%, rgba(25,28,33,0) 34%, rgba(25,28,33,0.72) 76%, ${INK} 100%)`,
          }}
        />

        {/* 텍스트 스택 — 하단 정렬 */}
        <div className="absolute inset-x-0 bottom-0 px-6 sm:px-10 pb-7">
          <div className="max-w-3xl">
            <p
              className="text-[11px] sm:text-xs font-black tracking-[0.18em] uppercase mb-2.5"
              style={{ color: CORAL }}
            >
              {cityCap} · {THEME_LABEL[theme]}
            </p>
            <h1 className="text-white font-black leading-[1.08] text-[30px] sm:text-[44px] text-balance">
              {title}
            </h1>
            <p className="mt-2.5 text-white/60 text-sm sm:text-base font-medium">
              {startDate} – {endDate}
            </p>
          </div>
        </div>
      </div>

      {/* 여행 사실 스탬프 — Copied·Helpful 이 0 이어도 비지 않는다.
          pb 는 모바일 하단 고정 CTA 바에 출처 문구가 가려지지 않도록 넉넉히 둔다. */}
      <div className="px-6 sm:px-10 pb-24 sm:pb-6">
        <div className="max-w-3xl">
          <div className="flex items-stretch border-y border-white/10">
            {stamps.map(([n, label], i) => (
              <div
                key={label}
                className={`flex-1 py-4 ${i > 0 ? "border-l border-white/10 pl-5" : ""}`}
              >
                <div className="text-white font-black text-2xl sm:text-3xl tabular-nums leading-none">{n}</div>
                <div className="text-white/45 text-[10px] sm:text-[11px] font-bold tracking-widest uppercase mt-1.5">
                  {label}
                </div>
              </div>
            ))}
          </div>

          {(copyCount > 0 || helpfulCount > 0) && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 pt-4 text-sm font-bold">
              {copyCount > 0 && (
                <span style={{ color: CORAL }}>Copied {copyCount}×</span>
              )}
              {helpfulCount > 0 && (
                <span className="text-emerald-400">{helpfulCount} found it helpful</span>
              )}
            </div>
          )}

          {/* Trip highlights — 일정의 실제 장소. 사진 촬영지가 아님을 시각적으로 분리 */}
          {highlights.length > 0 && (
            <div className="pt-5">
              <p className="text-white/35 text-[10px] font-bold tracking-widest uppercase mb-2">
                Trip highlights
              </p>
              <p className="text-white/75 text-sm leading-relaxed">
                {highlights.join("  ·  ")}
              </p>
            </div>
          )}

          {/* 출처 — 짧은 표기만. creator·원본 페이지가 unknown 이면 표시하지 않는다 */}
          {showPhoto && asset && coverKind === "tourism" && (
            <p className="pt-5 pb-2 text-white/28 text-[11px]">
              {asset.attribution_text.replace(/\s*\(KOGL Type 1\)\s*$/i, "")}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
