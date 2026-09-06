"use client";

// City Hub Events — 전체보기 목록 + GoKoreaMate 내부 상세.
// (CITY-HUB-EVENTS-ESSENTIALS-UX-AND-BLUE-NORMALIZATION-V1)
//
// Owner 확정 흐름: Hub(대표 2~3) → 전체보기 → 내부 상세 → 공식 홈페이지는 상세 안의
// 보조 링크. 카드가 외부로 직행하지 않는다. 데이터는 기존 recommended_now 그대로 —
// 종료 행사는 목록에서 제외(기존 규칙 재사용), 없는 정보는 만들지 않는다.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import type { CitySpot } from "@/data/cities/types";
import { displayPlaceName } from "@/lib/place-display-name";
import { getCityEvents, getCityEventById, type CityEvent } from "@/data/regional/regional-recommendations";
import { loadCitySpots, quietCity } from "./quiet-data";

function eventName(ev: CityEvent, locale: string): string {
  return locale !== "ko" && ev.nameEn ? ev.nameEn : (ev.name ?? "");
}

function eventSource(ev: CityEvent): { provider: string | null; url: string | null; asOf: string | null } {
  const s = (ev.source ?? null) as { provider?: string | null; source_url?: string | null; as_of?: string | null } | null;
  return { provider: s?.provider ?? null, url: s?.source_url ?? null, asOf: s?.as_of ?? null };
}

export function EventMetaLine({ ev, t }: { ev: CityEvent; t: (k: string) => string }) {
  const period = [ev.validFrom, ev.validTo].filter(Boolean).join(" – ");
  return (
    <span className="block mt-0.5 text-[12px] text-[var(--qh-faint)] truncate">
      {ev.status && (
        <span className="font-medium" style={{ color: ev.status === "ongoing" ? "var(--qh-blue)" : "var(--qh-faint)" }}>
          {t(ev.status)}{" · "}
        </span>
      )}
      {period}{ev.category ? ` · ${ev.category}` : ""}
    </span>
  );
}

export function EventsAllClient({ slug }: { slug: string }) {
  const t = useTranslations("quiet");
  const tForm = useTranslations("tripForm");
  const locale = useLocale();
  const city = quietCity(slug);
  if (!city) return null;
  const cityLabel = tForm(city.labelKey);
  const events = getCityEvents(slug);

  return (
    <div className="qh min-h-screen pb-20" style={{ backgroundColor: "var(--qh-paper)" }}>
      <div className="max-w-3xl mx-auto px-5 md:px-6 pt-5">
        <Link href={`/city/${slug}`} className="inline-flex items-center whitespace-nowrap text-[13px] text-[var(--qh-faint)] hover:text-[var(--qh-ink)] py-2 min-h-11 gkm-focus">
          ← {cityLabel}
        </Link>
        <h1 className="mt-1 text-[22px] md:text-[26px] font-semibold text-[var(--qh-ink)]">{t("eventsIn", { city: cityLabel })}</h1>

        {events.length === 0 ? (
          <p className="mt-5 text-[13px] text-[var(--qh-faint2)]">{t("eventsSoon", { city: cityLabel })}</p>
        ) : (
          <ul className="mt-3">
            {events.map(ev => (
              <li key={ev.id}>
                <Link href={`/city/${slug}/events/${ev.id}`} className="flex items-start gap-3.5 py-3 border-b border-[var(--qh-line)] gkm-focus min-h-11">
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-semibold text-[var(--qh-ink)] leading-snug">{eventName(ev, locale)}</span>
                    <EventMetaLine ev={ev} t={t} />
                    {ev.whyNow && (
                      <span className="block mt-0.5 text-[12.5px] leading-snug text-[var(--qh-faint2)]"
                        style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {ev.whyNow}
                      </span>
                    )}
                  </span>
                  <span className="flex-none text-[13px]" style={{ color: "var(--qh-blue)" }} aria-hidden>→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function EventDetailClient({ slug, eventId }: { slug: string; eventId: string }) {
  const t = useTranslations("quiet");
  const tForm = useTranslations("tripForm");
  const locale = useLocale();
  const city = quietCity(slug);
  const [spots, setSpots] = useState<CitySpot[] | null>(null);
  useEffect(() => { loadCitySpots(slug).then(setSpots); }, [slug]);

  if (!city) return null;
  const cityLabel = tForm(city.labelKey);
  // 상세는 종료 여부와 무관하게 열린다(공유된 링크가 죽지 않게) — 목록만 걸러진다.
  const ev = getCityEventById(slug, eventId);
  if (!ev) {
    return (
      <div className="qh min-h-screen" style={{ backgroundColor: "var(--qh-paper)" }}>
        <div className="max-w-3xl mx-auto px-5 md:px-6 pt-5">
          <Link href={`/city/${slug}/events`} className="inline-flex items-center text-[13px] text-[var(--qh-faint)] py-2 min-h-11 gkm-focus">← {t("eventsIn", { city: cityLabel })}</Link>
          <p className="mt-4 text-[13px] text-[var(--qh-faint2)]">{t("eventsSoon", { city: cityLabel })}</p>
        </div>
      </div>
    );
  }
  const src = eventSource(ev);
  const spot = ev.spotId !== null ? (spots ?? []).find(s => Number(s.id) === ev.spotId) : undefined;

  return (
    <div className="qh min-h-screen pb-20" style={{ backgroundColor: "var(--qh-paper)" }}>
      <div className="max-w-3xl mx-auto px-5 md:px-6 pt-5">
        <Link href={`/city/${slug}/events`} className="inline-flex items-center whitespace-nowrap text-[13px] text-[var(--qh-faint)] hover:text-[var(--qh-ink)] py-2 min-h-11 gkm-focus">
          ← {t("eventsIn", { city: cityLabel })}
        </Link>
        <p className="mt-2 text-[11px] font-medium tracking-[.14em] text-[var(--qh-faint)] uppercase">{cityLabel}{ev.category ? ` · ${ev.category}` : ""}</p>
        <h1 className="mt-1 text-[22px] md:text-[26px] font-semibold text-[var(--qh-ink)] leading-snug">{eventName(ev, locale)}</h1>
        <div className="mt-1"><EventMetaLine ev={ev} t={t} /></div>

        {ev.whyNow && (
          <p className="mt-4 text-[14px] leading-relaxed" style={{ color: "rgba(33,29,23,.75)" }}>{ev.whyNow}</p>
        )}

        {/* 연결된 장소 — canonical 링크가 있을 때만 (임의 매칭 없음) */}
        {spot && (
          <Link href={`/place/${spot.id}/`} className="mt-5 flex items-center gap-3.5 py-2.5 border-y border-[var(--qh-line)] gkm-focus min-h-11">
            <span className="relative flex-none w-[56px] h-[56px] rounded-[4px] overflow-hidden bg-[var(--qh-line)]">
              {spot.image
                ? <img src={spot.image} alt="" className="absolute inset-0 w-full h-full object-cover" />
                : <img src="/images/placeholder-spot.svg" alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold text-[var(--qh-ink)]">{displayPlaceName(spot.name, spot.nameL10n, locale)}</span>
              <span className="block text-[12px]" style={{ color: "var(--qh-blue)" }}>{t("viewPlace")}</span>
            </span>
            <span className="flex-none text-[13px]" style={{ color: "var(--qh-blue)" }} aria-hidden>→</span>
          </Link>
        )}

        {/* 공식 홈페이지 — 보조 링크(상세 안). 외부 직행 카드는 만들지 않는다. */}
        {src.url && (
          <a href={src.url} target="_blank" rel="noopener noreferrer"
            className="mt-5 inline-flex items-center gap-2 rounded-[4px] border px-4 py-2.5 text-[13.5px] font-medium gkm-focus min-h-11"
            style={{ borderColor: "var(--qh-blue)", color: "var(--qh-blue)" }}>
            {t("officialLink")} ↗
          </a>
        )}

        {(src.provider || src.asOf) && (
          <p className="mt-5 text-[11.5px] text-[var(--qh-faint2)]">
            {src.provider ?? ""}{src.provider && src.asOf ? " · " : ""}{src.asOf ? t("asOfLine", { date: src.asOf }) : ""}
          </p>
        )}
      </div>
    </div>
  );
}
