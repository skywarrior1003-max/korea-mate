// Page 1 개인화 — 여행 마무리 화면.
//
// 사용자가 직접 "마무리" 를 실행한 여행에서만 나온다. 운영에는 아직 그 신호가
// 없어서 지금은 켜지지 않는다(§10 B1). 컴포넌트와 계약을 먼저 두는 이유는,
// 신호가 생겼을 때 화면을 새로 만들지 않기 위해서다.
//
// 여기 보이는 건 전부 사용자 것이다. 사진·메모·날짜 모두. 없는 값은 만들지
// 않는다 — trip_moments 에 장소명 필드가 없으므로 장소 이름을 쓰지 않고,
// 저장된 문구가 없으면 그 블록을 통째로 숨긴다.

"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { MOMENT_CATEGORIES } from "@/lib/trip-moments";
import type { TripMoment } from "@/lib/trip-moments";
import type { ItineraryRow } from "@/lib/supabase";
import type { SavedStoryCopy } from "./home-experience-types";
import {
  DESIGN_PRIMARY, DESIGN_INK, DESIGN_SURFACE, DESIGN_SURFACE_LOW,
  DESIGN_OUTLINE, HERO_MAX_WIDTH,
  FONT_SANS,
} from "./home-visual";

interface Props {
  trip:    ItineraryRow;
  moments: TripMoment[];
  /** 장소별 저장 문구. 지금은 항상 비어 있다 — 생성·저장 기능이 아직 없다 */
  savedCopy?: readonly SavedStoryCopy[];
  onPlanTrip: () => void;
}

const CAT = (key: string) => MOMENT_CATEGORIES.find(c => c.key === key) ?? MOMENT_CATEGORIES[4];

export default function MemorySynergyHome({ trip, moments, savedCopy = [], onPlanTrip }: Props) {
  const t = useTranslations("home");
  // 표지 요청이 실패할 수 있다(삭제·네트워크). 깨진 이미지 자리를 남기지 않는다.
  const [coverFailed, setCoverFailed] = useState(false);
  const copyOf = (id: string) => savedCopy.find(c => c.momentId === id)?.text ?? null;

  const period = trip.start_date && trip.end_date ? `${trip.start_date} – ${trip.end_date}` : "";
  const withPhoto = moments.filter(m => m.photo_data);

  return (
    <div style={{ backgroundColor: DESIGN_SURFACE, fontFamily: FONT_SANS }}>
      <div className="mx-auto" style={{ maxWidth: HERO_MAX_WIDTH }}>
      {/* ── 여행 표지 ──────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="relative w-full" style={{ aspectRatio: "4 / 5" }}>
          {/* 서버가 종류를 정해 돌려주는 표지. 개인 사진이면 개인 사진이,
              아니면 KOGL 테마 이미지가 나온다. 여기서 추론하지 않는다. */}
          {coverFailed ? (
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                backgroundColor: "var(--gkm-ink)",
                backgroundImage:
                  "radial-gradient(circle at 28% 66%, rgba(255,74,45,0.28) 0%, transparent 55%)," +
                  "radial-gradient(circle at 74% 26%, rgba(95,91,214,0.26) 0%, transparent 50%)",
              }}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/img/trip-cover/${encodeURIComponent(trip.id)}`}
              alt={trip.trip_title || trip.city}
              className="absolute inset-0 w-full h-full object-cover"
              loading="eager"
              decoding="async"
              onError={() => setCoverFailed(true)}
            />
          )}
          <div
            aria-hidden
            className="absolute inset-0"
            style={{ background: "linear-gradient(to top, rgba(10,12,20,0.86) 0%, rgba(10,12,20,0.3) 46%, rgba(10,12,20,0) 66%)" }}
          />
          <div className="absolute inset-x-0 bottom-0 p-5">
            {period && (
              <span
                className="inline-block px-3 py-1.5 rounded-full text-[11px] font-black tracking-wider text-white mb-3"
                style={{ backgroundColor: "rgba(0,65,200,0.55)", border: "1px solid rgba(182,196,255,0.5)" }}
              >
                {period}
              </span>
            )}
            <h1 className="font-black text-white leading-[1.12]" style={{ fontSize: "clamp(1.9rem,7.6vw,2.5rem)" }}>
              {trip.trip_title || trip.city}
            </h1>
          </div>
        </div>
      </section>

      {/* ── Memory Timeline ────────────────────────────────────────────── */}
      <section className="px-5 py-8" aria-label={t("memoryTimeline")}>
        <div>
          <div className="flex items-baseline justify-between mb-5">
            <h2 className="text-[20px] font-black" style={{ color: DESIGN_INK }}>{t("memoryTimeline")}</h2>
            <span className="text-xs font-bold" style={{ color: DESIGN_OUTLINE }}>
              {t("memoryCount", { n: moments.length })}
            </span>
          </div>

          <ol className="flex flex-col gap-5">
            {moments.map(m => {
              const cat  = CAT(m.category);
              const copy = copyOf(m.moment_id);
              const when = new Date(m.captured_at).toLocaleDateString(undefined, {
                month: "short", day: "numeric",
              });
              return (
                <li key={m.moment_id} className="overflow-hidden" style={{ borderRadius: 20, backgroundColor: DESIGN_SURFACE_LOW }}>
                  <div className="relative w-full" style={{ aspectRatio: "4 / 3" }}>
                    {m.photo_data ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.photo_data}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      // 사진 없는 Memory. 회색 박스 대신 카테고리를 보여준다.
                      <div
                        className="absolute inset-0 flex items-center justify-center"
                        style={{
                          backgroundColor: "var(--gkm-surface-dim)",
                          backgroundImage:
                            "radial-gradient(circle at 30% 65%, rgba(255,74,45,0.10) 0%, transparent 55%)",
                        }}
                      >
                        <span className="text-4xl" aria-hidden>{cat.emoji}</span>
                      </div>
                    )}
                  </div>

                  <div className="p-4">
                    <p className="text-[11px] font-black tracking-wide mb-1.5" style={{ color: DESIGN_OUTLINE }}>
                      {when} · {cat.emoji} {cat.label}
                    </p>
                    {/* 사용자가 쓴 글. 번역하지 않고 그대로 둔다 */}
                    {m.memo && (
                      <p className="text-[14.5px] leading-relaxed whitespace-pre-wrap" style={{ color: DESIGN_INK }}>{m.memo}</p>
                    )}
                    {/* 저장된 문구가 있을 때만. 없으면 이 블록 자체가 없다 */}
                    {copy && (
                      <p className="mt-3 rounded-control px-3 py-2 text-sm leading-relaxed text-kpop bg-kpop-tint">
                        {copy}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* ── 여행 요약 ──────────────────────────────────────────────────── */}
      <section className="px-5 pb-6">
        <div className="p-5" style={{ borderRadius: 20, backgroundColor: DESIGN_SURFACE_LOW }}>
          <h2 className="text-sm font-black mb-3" style={{ color: DESIGN_INK }}>{t("tripSummary")}</h2>
          <dl className="grid grid-cols-3 gap-3 text-center">
            {[
              { k: t("summaryCity"),    v: trip.city },
              { k: t("summaryMemories"), v: String(moments.length) },
              { k: t("summaryPhotos"),  v: String(withPhoto.length) },
            ].map(x => (
              <div key={x.k}>
                <dt className="text-[10px] font-black uppercase tracking-wide mb-1" style={{ color: DESIGN_OUTLINE }}>{x.k}</dt>
                <dd className="text-base font-black" style={{ color: DESIGN_INK }}>{x.v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── 다음 여행 ──────────────────────────────────────────────────── */}
      <section className="px-5 pb-12">
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={onPlanTrip}
            className="gkm-focus flex-1 inline-flex items-center justify-center min-h-14 h-14 px-6 rounded-full text-white text-[15px] font-black transition-transform active:scale-95"
            style={{ background: `linear-gradient(100deg, ${DESIGN_PRIMARY} 0%, #2f6bff 100%)`, boxShadow: "0 10px 26px rgba(0,65,200,0.28)" }}
          >
            ✨ {t("planTrip")}
          </button>
          <Link
            href="/my-trips"
            className="gkm-focus flex-1 inline-flex items-center justify-center min-h-14 h-14 px-6 rounded-full text-[15px] font-bold"
            style={{ backgroundColor: DESIGN_SURFACE_LOW, color: DESIGN_INK }}
          >
            {t("openTrips")}
          </Link>
        </div>
      </section>
      </div>
    </div>
  );
}
