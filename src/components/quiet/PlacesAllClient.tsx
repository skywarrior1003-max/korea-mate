"use client";

// Places View All — 추천 장소를 더 보는 곳(Explore 아님: 지도·필터 없음).
// 카드 = 사진 + 이름 + 간결한 메타 + Save. 탭하면 기존 canonical /place/[id] 로.
// Save 는 기존 semantics 그대로: Saved = 장기 북마크(favorites) — My Places·
// This Trip 자동 추가 없음. toggleFavorite + cacheSavedSpot(기존 Explore 저장과
// 동일 identity: EventItem id + citySpotSourceKey) → 조용한 toast 만.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useTranslations, useLocale } from "next-intl";
import type { CitySpot } from "@/data/cities/types";
import { displayPlaceName } from "@/lib/place-display-name";
import { isFavorited, toggleFavorite, cacheSavedSpot, uncacheSavedSpot, FAVORITES_EVENT } from "@/lib/favorites";
import { toEventItem } from "@/components/ExploreCity";
import { loadCitySpots, quietCity } from "./quiet-data";

export default function PlacesAllClient({ slug }: { slug: string }) {
  const t = useTranslations("quiet");
  const tForm = useTranslations("tripForm");
  const locale = useLocale();
  const city = quietCity(slug);
  const [spots, setSpots] = useState<CitySpot[] | null>(null);
  const [savedTick, setSavedTick] = useState(0);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { loadCitySpots(slug).then(setSpots); }, [slug]);
  useEffect(() => {
    const bump = () => setSavedTick(n => n + 1);
    window.addEventListener(FAVORITES_EVENT, bump);
    return () => window.removeEventListener(FAVORITES_EVENT, bump);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  if (!city) return null;
  const cityLabel = tForm(city.labelKey);
  const list = (spots ?? []).filter(s => s.image).concat((spots ?? []).filter(s => !s.image));

  const onSave = (e: React.MouseEvent, spot: CitySpot) => {
    e.preventDefault();
    e.stopPropagation();
    const item = toEventItem(spot);
    const nowSaved = toggleFavorite(item.id, item.sourceKey);
    if (nowSaved) cacheSavedSpot(item); else uncacheSavedSpot(item.id, item.sourceKey);
    setSavedTick(n => n + 1);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(nowSaved ? t("saved") : t("removed"));
    toastTimer.current = setTimeout(() => setToast(""), 1600);
  };

  void savedTick; // 저장 상태 re-render 트리거

  return (
    <div className="qh min-h-screen pb-20" style={{ backgroundColor: "var(--qh-paper)" }}>
      <div className="max-w-3xl mx-auto px-5 md:px-6 pt-5">
        <Link href={`/city/${slug}`} className="inline-flex items-center whitespace-nowrap text-[13px] text-[var(--qh-faint)] hover:text-[var(--qh-ink)] py-2 min-h-11 gkm-focus">
          ← {cityLabel}
        </Link>
        <h1 className="mt-1 text-[22px] md:text-[26px] font-semibold text-[var(--qh-ink)]">{t("placesIn", { city: cityLabel })}</h1>

        <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-4">
          {spots === null && [0, 1, 2, 3].map(i => (
            <div key={i} className="aspect-square rounded-[4px] bg-[var(--qh-line)] animate-pulse" />
          ))}
          {list.map(s => {
            const item = toEventItem(s);
            const saved = isFavorited(item.id, item.sourceKey);
            return (
              /* 하트는 카드 링크의 형제다 — interactive 중첩 금지 */
              <div key={s.id} className="relative min-w-0">
                <Link href={`/place/${s.id}/`} className="block min-w-0 gkm-focus rounded-[4px]">
                  <span className="relative block aspect-square rounded-[4px] overflow-hidden bg-[var(--qh-line)]">
                    {s.image ? (
                      <Image src={s.image} alt="" fill sizes="(max-width: 768px) 50vw, 240px" className="object-cover" unoptimized={s.image.startsWith("http")} />
                    ) : (
                      <img src="/images/placeholder-spot.svg" alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />
                    )}
                  </span>
                  <span className="block mt-1.5 text-[14px] font-medium text-[var(--qh-ink)] truncate">
                    {displayPlaceName(s.name, s.nameL10n, locale)}
                  </span>
                  <span className="block text-[12px] text-[var(--qh-faint2)] truncate">{s.district ?? s.category}</span>
                </Link>
                <button
                  type="button"
                  aria-pressed={saved}
                  aria-label={saved ? t("removed") : t("saved")}
                  onClick={e => onSave(e, s)}
                  className="absolute top-0.5 right-0.5 w-11 h-11 flex items-center justify-center gkm-focus"
                >
                  <span
                    className="w-[34px] h-[34px] rounded-full flex items-center justify-center text-[15px]"
                    style={{ background: "rgba(255,255,255,.92)", color: saved ? "var(--qh-clay)" : "var(--qh-ink)" }}
                  >
                    {saved ? "♥" : "♡"}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* 조용한 저장 피드백 — 모달·자동 This Trip 추가 없음 */}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 flex justify-center z-40">
        {toast && (
          <span className="qh rounded-[4px] px-4 py-2.5 text-[13px] font-medium" style={{ backgroundColor: "var(--qh-ink)", color: "var(--qh-paper)" }}>
            {toast}
          </span>
        )}
      </div>
    </div>
  );
}
