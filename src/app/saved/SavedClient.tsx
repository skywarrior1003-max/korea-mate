// S1 — Saved 화면 (handoff §1: Saved = 2탭 Saved places / My Places)
// Saved places: localStorage favorites (기존 저장소 유지 — owner 결정 2)
// My Places: 기존 user_spots 서버 API 재사용 (읽기 전용 목록 — CRUD는 itinerary 편집기)

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { TopNav, Card, Badge, Button } from "@/components/ui";
import { getFavorites, getSavedSpotsData, removeFavorite, FAVORITES_EVENT } from "@/lib/favorites";
import { apiGetUserSpots, type UserSpot } from "@/lib/user-spots-api";
import type { EventItem } from "@/lib/cart";

type Tab = "places" | "mine";

const CATEGORY_EMOJI: Record<string, string> = {
  attraction: "🏛️", restaurant: "🍽️", nature: "🌿", event: "🎉", accommodation: "🏨",
};

export default function SavedClient() {
  const t = useTranslations("saved");
  const tS = useTranslations("shell");
  const tP = useTranslations("place");

  const [tab, setTab] = useState<Tab>("places");
  const [saved, setSaved] = useState<EventItem[]>([]);
  const [mine, setMine] = useState<UserSpot[]>([]);
  const [mineLoading, setMineLoading] = useState(true);

  // Saved places — favorites id 목록과 데이터 캐시 교집합
  useEffect(() => {
    const sync = () => {
      const ids = new Set(getFavorites());
      setSaved(getSavedSpotsData().filter(e => ids.has(e.id)));
    };
    sync();
    window.addEventListener(FAVORITES_EVENT, sync);
    return () => window.removeEventListener(FAVORITES_EVENT, sync);
  }, []);

  // My Places — 서버 API (device 소유분만)
  useEffect(() => {
    apiGetUserSpots()
      .then(setMine)
      .catch(() => setMine([]))
      .finally(() => setMineLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-surface-dim flex flex-col">
      <TopNav savedCount={saved.length} />

      {/* 모바일 헤더 (TopNav는 md+ 전용) */}
      <header className="md:hidden bg-surface border-b border-line px-4 h-14 flex items-center justify-between">
        <h1 className="text-lg font-bold text-ink">{t("title")}</h1>
        <Link href="/" className="gkm-focus text-sm font-semibold text-sub">{tS("home")}</Link>
      </header>

      <main className="flex-1 w-full max-w-[720px] mx-auto px-4 py-5">
        <h1 className="hidden md:block text-2xl font-extrabold text-ink mb-5">{t("title")}</h1>

        {/* 탭 */}
        <div role="tablist" aria-label={t("title")} className="flex gap-2 mb-5">
          {(["places", "mine"] as const).map(k => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={`gkm-focus min-h-11 px-4 rounded-full text-sm font-semibold border transition-colors ${
                tab === k
                  ? "bg-ink text-white border-ink"
                  : "bg-surface text-sub border-line"
              }`}
            >
              {k === "places" ? t("tabPlaces") : t("tabMine")}
              {k === "places" && saved.length > 0 && (
                <span className="ml-1.5 text-xs opacity-70">{saved.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── Saved places 탭 ── */}
        {tab === "places" && (
          saved.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-3xl mb-3" aria-hidden>🔖</p>
              <p className="font-bold text-ink mb-1">{t("empty")}</p>
              <p className="text-sm text-sub mb-5">{t("emptyHint")}</p>
              <Link href="/explore/busan" className="gkm-focus inline-flex items-center justify-center min-h-11 px-5 rounded-control bg-action text-white text-sm font-semibold hover:bg-action-hover shadow-cta">
                {t("explore")}
              </Link>
            </Card>
          ) : (
            <>
              <ul className="flex flex-col gap-3">
                {saved.map(e => {
                  const placeId = e.id.startsWith("local-") ? e.id.slice(6) : null;
                  return (
                    <li key={e.id}>
                      <Card className="flex items-center gap-3 p-3">
                        <div className="w-13 h-13 min-w-13 rounded-control bg-surface-dim flex items-center justify-center text-xl overflow-hidden">
                          {e.image
                            ? /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={e.image} alt="" className="w-full h-full object-cover" />
                            : <span aria-hidden>{CATEGORY_EMOJI[e.type] ?? "📍"}</span>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-ink text-[15px] leading-snug">{e.name}</p>
                          <p className="text-xs text-faint mt-0.5 truncate">
                            {[e.district, e.city].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        {placeId && (
                          <Link href={`/place/${placeId}`} className="gkm-focus shrink-0 text-sm font-semibold text-sub hover:text-ink px-2 py-2">
                            {tP("viewDetails")}
                          </Link>
                        )}
                        <Button variant="text" aria-label={`${t("remove")}: ${e.name}`} onClick={() => removeFavorite(e.id)}>
                          ✕
                        </Button>
                      </Card>
                    </li>
                  );
                })}
              </ul>
              {/* Saved → 일정 생성 브리지 (handoff: n saved → Build) */}
              <div className="sticky bottom-20 md:bottom-6 mt-6">
                <Link
                  href="/#planner"
                  className="gkm-focus flex items-center justify-center min-h-12 rounded-control bg-action text-white font-bold shadow-cta hover:bg-action-hover"
                >
                  {t("build")} ({saved.length})
                </Link>
              </div>
            </>
          )
        )}

        {/* ── My Places 탭 ── */}
        {tab === "mine" && (
          mineLoading ? (
            <div className="flex flex-col gap-3">
              {[0, 1].map(i => (
                <Card key={i} className="p-4 animate-pulse">
                  <div className="h-4 bg-surface-dim rounded w-1/2 mb-2" />
                  <div className="h-3 bg-surface-dim rounded w-1/3" />
                </Card>
              ))}
            </div>
          ) : mine.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-3xl mb-3" aria-hidden>📌</p>
              <p className="font-bold text-ink mb-1">{t("mineEmpty")}</p>
              <p className="text-sm text-sub mb-5">{t("mineHint")}</p>
              <Link href="/itinerary" className="gkm-focus inline-flex items-center justify-center min-h-11 px-5 rounded-control border border-line bg-surface text-ink text-sm font-semibold">
                {t("openItinerary")}
              </Link>
            </Card>
          ) : (
            <ul className="flex flex-col gap-3">
              {mine.map(s => (
                <li key={s.id}>
                  <Card className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-ink text-[15px]">{s.name}</p>
                        <p className="text-xs text-faint mt-0.5">
                          {[s.category, s.city, s.address].filter(Boolean).join(" · ")}
                        </p>
                        {s.note && <p className="text-sm text-sub mt-2 leading-relaxed">{s.note}</p>}
                      </div>
                      <Badge kind="editorial" className="shrink-0">🔒 {t("privateLabel")}</Badge>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )
        )}
      </main>
    </div>
  );
}
