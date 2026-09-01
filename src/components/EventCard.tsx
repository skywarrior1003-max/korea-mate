"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { TRIP_FLOW_COMMERCE_ENABLED } from "@/config/commerce-surfaces";
import type { EventItem } from "@/lib/cart";
import { isFavorited, FAVORITES_EVENT } from "@/lib/favorites";
import { togglePlaceSaved } from "@/lib/place-actions/place-actions-core";
import { getItemSourceKey } from "@/lib/place-identity";
import { getVerifiedImage } from "@/lib/placeImages";
import { dislikeSpot } from "@/lib/spots";
import { getDeviceId } from "@/lib/deviceId";

// ── Stage 뱃지 ────────────────────────────────────
// 색은 여기, 문구는 events.stage_* 가 갖는다. 예전엔 label 이 영어로 박혀 있어
// 4 개 언어 어디서도 번역되지 않았다. bg 는 stage 다섯 단계를 구분하는 상태색이라
// Save 색과 무관하다 — 그대로 둔다.
const STAGE_STYLE: Record<string, { bg: string; text: string; key: string }> = {
  "Early-Bird":  { bg: "bg-violet-500",  text: "text-white", key: "stage_earlyBird" },
  "Pre-Event":   { bg: "bg-blue-500",    text: "text-white", key: "stage_preEvent"  },
  "Event-Day":   { bg: "bg-red-500",     text: "text-white", key: "stage_eventDay"  },
  "Post-Event":  { bg: "bg-emerald-500", text: "text-white", key: "stage_postEvent" },
  "Standalone":  { bg: "bg-gray-500",    text: "text-white", key: "stage_standalone" },
};

// koreanSurvivalScore → 색상
function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-500";
  if (score >= 60) return "text-yellow-500";
  return "text-red-400";
}

// 가장 빠른 이동 수단.
// 여기서 문장을 만들지 않는다 — 어순이 언어마다 다르다("12min walk" / "도보 12분").
// 종류와 분만 돌려주고 문장은 events.transit* 가 만든다.
type Transit = { kind: "Walk" | "Subway" | "Taxi"; minutes: number } | null;
function fastestTransit(transit: EventItem["transitFromAnchor"]): Transit {
  if (!transit) return null;
  if (transit.walkMinutes)   return { kind: "Walk",   minutes: transit.walkMinutes };
  if (transit.subwayMinutes) return { kind: "Subway", minutes: transit.subwayMinutes };
  if (transit.taxiMinutes)   return { kind: "Taxi",   minutes: transit.taxiMinutes };
  return null;
}

// bestTimeSlot 은 내부 값이다(morning|afternoon|evening|anytime). 값은 그대로 두고
// 표시만 옮긴다. 셋은 planner 가 이미 갖고 있어 재사용하고, anytime 만 새로 둔다.
const SLOT_KEY: Record<string, string> = {
  morning: "slot_morning", afternoon: "slot_afternoon", evening: "slot_evening",
  lunch: "slot_lunch", sunset: "slot_sunset", night: "slot_night",
};

interface Props {
  event: EventItem;
  onClick: () => void;
  distanceBadge?: string;
}

export default function EventCard({ event, onClick, distanceBadge }: Props) {
  const tPicks  = useTranslations("picks");
  const tE      = useTranslations("events");
  const tC      = useTranslations("common");
  const tB      = useTranslations("badges");
  const tR      = useTranslations("report");
  const tSlot   = useTranslations("planner");
  const tForm   = useTranslations("tripForm");
  const cityDisplay = (() => { const c = (event.city || "").trim(); if (!c) return ""; const key = `city_${c.charAt(0).toUpperCase()}${c.slice(1).toLowerCase()}`; try { return tForm.has(key) ? tForm(key) : c.charAt(0).toUpperCase() + c.slice(1); } catch { return c; } })();
  const [imgError,    setImgError]    = useState(false);
  const [favorited,   setFavorited]   = useState(false);
  const [disliked,    setDisliked]    = useState(false);

  // imgError 상태를 이벤트 ID 변경 시 초기화 (카테고리 전환 후 이미지 꼬임 방지)
  useEffect(() => { setImgError(false); }, [event.id]);

  // dislike 상태 localStorage 복원
  useEffect(() => {
    setDisliked(!!localStorage.getItem(`km_dislike_${event.id}`));
  }, [event.id]);

  async function handleDislike(e: React.MouseEvent) {
    e.stopPropagation();
    if (disliked) return;
    const ok = await dislikeSpot(String(event.id), getDeviceId());
    if (ok) {
      localStorage.setItem(`km_dislike_${event.id}`, "1");
      setDisliked(true);
    }
  }

  // 문자열로 고정해 effect 의존성을 안정화한다
  const sourceKey = getItemSourceKey(event);

  useEffect(() => {
    setFavorited(isFavorited(event.id, sourceKey));
    const handler = () => setFavorited(isFavorited(event.id, sourceKey));
    window.addEventListener(FAVORITES_EVENT, handler);
    return () => window.removeEventListener(FAVORITES_EVENT, handler);
  }, [event.id, sourceKey]);

  const stage   = STAGE_STYLE[event.stage] ?? STAGE_STYLE["Standalone"];
  const transit = fastestTransit(event.transitFromAnchor);
  // place_id(=event.id)로 레지스트리 우선 조회 → 1:1 검증 이미지 강제 매핑
  const resolvedImage = getVerifiedImage(event.id, event.image);

  return (
    <button
      onClick={onClick}
      className="group relative w-full text-left rounded-2xl overflow-hidden shadow-md hover:shadow-xl transition-all duration-500 hover:-translate-y-1 bg-white border border-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-400"
    >
      {/* ── 이미지 영역 ── */}
      <div className="relative h-48 w-full overflow-hidden bg-gray-100">

        {/* place_id 기반 1:1 검증 이미지 조회 (placeImages.ts 레지스트리) */}
        {resolvedImage && !imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resolvedImage}
            alt={event.name}
            onError={() => setImgError(true)}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/images/placeholder-spot.svg"
            alt={tC("noImage")}
            className="w-full h-full object-cover"
          />
        )}

        {/* 그라디언트 오버레이 */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

        {/* Trending 뱃지 */}
        {event.isTrending && (
          <span className="absolute top-3 left-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-orange-500 text-white shadow">
            🔥 {tE("trendingBadge")}
          </span>
        )}

        {/* Anchor 뱃지 */}
        {event.isAnchor && (
          <span className="absolute top-3 right-10 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-yellow-400 text-gray-900 shadow">
            ⭐ Anchor
          </span>
        )}

        {/* Save + Dislike 버튼 그룹 */}
        <div className="absolute top-3 right-3 flex flex-col gap-1.5 z-10">
          {/* 저장 — 이 동작은 favorites 에 넣는 **개인 보관**이다. 하트를 쓰면
              다른 사용자의 Story·Memory 에 대한 Like 와 같은 기호가 되어 둘 다
              읽히지 않는다. Explore·모달·Place Detail 과 같은 북마크로 맞춘다. */}
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              setFavorited(togglePlaceSaved(event));
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                setFavorited(togglePlaceSaved(event));
              }
            }}
            aria-pressed={favorited}
            aria-label={favorited ? tPicks("unsaveAria", { name: event.name }) : tPicks("saveAria", { name: event.name })}
            className={`w-8 h-8 flex items-center justify-center rounded-full shadow-md cursor-pointer transition-all select-none ${
              favorited ? "bg-action text-white scale-110" : "bg-white/80 hover:bg-white text-gray-500"
            }`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden
                 fill={favorited ? "currentColor" : "none"}
                 stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 3h12a1 1 0 0 1 1 1v16l-7-4-7 4V4a1 1 0 0 1 1-1z" />
            </svg>
          </span>
          {/* 정보 오류 신고 (Dislike) */}
          <span
            role="button"
            tabIndex={0}
            onClick={handleDislike}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleDislike(e as unknown as React.MouseEvent); }}
            aria-label={disliked ? tR("alreadyReportedAria") : tR("inaccurateAria")}
            title={disliked ? tR("underReviewTitle") : tR("inaccurateAria")}
            className={`w-8 h-8 flex items-center justify-center rounded-full text-sm shadow-md cursor-pointer transition-all select-none ${
              disliked
                ? "bg-gray-600 text-white scale-110 cursor-not-allowed"
                : "bg-white/80 hover:bg-white text-gray-400 hover:text-gray-700"
            }`}
          >
            👎
          </span>
        </div>

        {/* Stage 뱃지 (이미지 하단 왼쪽) */}
        <span
          className={`absolute bottom-3 left-3 px-2 py-0.5 rounded-full text-xs font-bold ${stage.bg} ${stage.text}`}
        >
          {tE(stage.key)}
        </span>

        {/* Transit 뱃지 (이미지 하단 오른쪽) */}
        {transit && (
          <span className="absolute bottom-3 right-3 px-2 py-0.5 rounded-full text-xs font-semibold bg-black/50 text-white backdrop-blur-sm">
            📍 {tE(`transit${transit.kind}`, { n: transit.minutes })}
          </span>
        )}
      </div>

      {/* ── 카드 본문 ── */}
      <div className="p-4 space-y-2">

        {/* 도시 + 지역 + 거리 뱃지 */}
        <p className="text-xs font-semibold text-orange-500 uppercase tracking-wider flex items-center gap-1.5 flex-wrap">
          <span>{cityDisplay}{event.district ? ` · ${event.district}` : ""}</span>
          {distanceBadge && (
            <span className="px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-700 font-bold normal-case text-[10px] shrink-0">
              📍 {distanceBadge}
            </span>
          )}
        </p>

        {/* 이벤트 이름 */}
        <h3 className="text-sm font-bold text-gray-900 leading-snug line-clamp-2">
          {event.shortName}
        </h3>

        {/* 설명 한 줄 */}
        <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">
          {event.description}
        </p>

        {/* 메타 정보 행 */}
        <div className="flex items-center gap-3 text-xs text-gray-500 pt-1">
          <span className="flex items-center gap-1">
            🕐 {tC("minutes", { n: event.recommendedDurationMinutes })}
          </span>
          <span className="flex items-center gap-1">
            ☀️ {SLOT_KEY[event.bestTimeSlot]
                  ? tSlot(SLOT_KEY[event.bestTimeSlot])
                  : tE("slotAnytime")}
          </span>
          {event.cashOnly && (
            <span className="flex items-center gap-1 text-amber-600 font-semibold">
              💵 {tB("cashOnly")}
            </span>
          )}
        </div>

        {/* 태그 (최대 3개) + Survival Score */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex flex-wrap gap-1">
            {event.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-gray-100 text-gray-600"
              >
                {tag}
              </span>
            ))}
          </div>
          <span
            className={`text-xs font-bold ${scoreColor(event.koreanSurvivalScore)} shrink-0 ml-2`}
            title={tE("scoreTooltip")}
          >
            {tE("score", { n: event.koreanSurvivalScore })}
          </span>
        </div>

        {/* 제휴 파트너 표시 */}
        {TRIP_FLOW_COMMERCE_ENABLED && event.commerce?.hasAffiliate && event.commerce?.affiliatePartner && (
          <p className="text-[10px] text-gray-400 pt-0.5">
            🤝 via {event.commerce?.affiliatePartner}
          </p>
        )}
      </div>

      {/* 하단 CTA 힌트 */}
      <div className="px-4 pb-4">
        <div
          className="w-full py-2 rounded-xl text-xs font-bold text-center text-white transition-opacity group-hover:opacity-100 opacity-80"
          style={{ backgroundColor: "#1a1f36" }}
        >
          {/* 이 카드는 상세로 보내는 역할만 한다. 일정 편입은 여기서 약속하지 않는다 —
              담기는 Picks > Saved 에서 This Trip 으로 보낼 때 일어난다. */}
          {tPicks("viewDetails")} →
        </div>
      </div>
    </button>
  );
}
