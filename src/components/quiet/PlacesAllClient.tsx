"use client";

// Places View All — 인기|신규 추천 순위 (PAGINATION-AND-NEW-DISCOVERY-V1 §8-1)
//
//  · 인기: 도시 전체 적격 후보의 서버 확정 연속 순위(반응 0 포함·분리 없음).
//  · 신규: 최근 60일 게시 연결 장소의 서버 확정 순위(신선도 보너스는 서버 내부).
//  · 순위·페이지는 전부 서버가 결정한다(24개 단위 "더 보기") — 클라이언트
//    재정렬·score 계산 없음. rank 는 페이지와 무관한 전역 값이다.
//  · 신규 상태는 URL(?tab=new)로 직접 진입·공유·새로고침·뒤로 가기가 된다.
//  · Save 는 기존 semantics 그대로(북마크·중앙 togglePlaceSaved).

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import type { CitySpot } from "@/data/cities/types";
import { displayPlaceName } from "@/lib/place-display-name";
import { isFavorited, FAVORITES_EVENT } from "@/lib/favorites";
import { togglePlaceSaved } from "@/lib/place-actions/place-actions-core";
import { toEventItem } from "@/components/ExploreCity";
import { loadCitySpots, quietCity } from "./quiet-data";
import { recommendedSpotIds } from "@/data/regional/regional-recommendations";
import { DEFAULT_PAGE_LIMIT } from "@/lib/community/ranking-page-core";

interface RankedItem { id: number; likeCount: number; usageCount: number; rank: number }
interface RankedPage { items: RankedItem[]; page: number; total: number; hasMore: boolean }

type Tab = "popular" | "new";

function PlacesAllInner({ slug }: { slug: string }) {
  const t = useTranslations("quiet");
  const tForm = useTranslations("tripForm");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const city = quietCity(slug);
  const tab: Tab = searchParams.get("tab") === "new" ? "new" : "popular";

  const [spots, setSpots] = useState<CitySpot[] | null>(null);
  const [ranked, setRanked] = useState<RankedItem[]>([]);
  const [pageMeta, setPageMeta] = useState<{ page: number; hasMore: boolean; loaded: boolean; failed: boolean }>(
    { page: 0, hasMore: false, loaded: false, failed: false });
  const [busy, setBusy] = useState(false);
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

  const fetchPage = useCallback(async (mode: Tab, page: number): Promise<RankedPage | null> => {
    try {
      const r = await fetch(`/api/recommendations/${slug}/places?mode=${mode}&page=${page}&limit=${DEFAULT_PAGE_LIMIT}`);
      if (!r.ok) return null;
      const j = await r.json() as RankedPage;
      return Array.isArray(j.items) ? j : null;
    } catch { return null; }
  }, [slug]);

  // tab·slug 전환 시 1페이지부터 — 서버 순위만 소비한다.
  useEffect(() => {
    let alive = true;
    fetchPage(tab, 1).then(j => {
      if (!alive) return;
      if (!j) { setRanked([]); setPageMeta({ page: 0, hasMore: false, loaded: true, failed: true }); return; }
      setRanked(j.items);
      setPageMeta({ page: 1, hasMore: j.hasMore, loaded: true, failed: false });
    });
    return () => { alive = false; };
  }, [slug, tab, fetchPage]);

  const loadMore = async () => {
    if (busy || !pageMeta.hasMore) return;
    setBusy(true);
    const j = await fetchPage(tab, pageMeta.page + 1);
    if (j) {
      setRanked(prev => [...prev, ...j.items]);
      setPageMeta({ page: j.page, hasMore: j.hasMore, loaded: true, failed: false });
    }
    setBusy(false);
  };

  const switchTab = (next: Tab) => {
    if (next === tab) return;
    router.push(next === "new" ? `${pathname}?tab=new` : pathname, { scroll: false });
  };

  if (!city) return null;
  const cityLabel = tForm(city.labelKey);
  const byId = new Map((spots ?? []).map(s => [Number(s.id), s]));

  // 서버 순위 그대로. 카탈로그에 없는 행(공개 편차)만 조용히 건너뛴다.
  const list = ranked
    .map(r => ({ ...r, spot: byId.get(r.id) }))
    .filter((x): x is RankedItem & { spot: CitySpot } => Boolean(x.spot));

  // 인기 API 실패 시에만 — 기존 정적 순서를 badge 없이(과도기 폴백, 재정렬 아님)
  const fallback = (() => {
    if (!(tab === "popular" && pageMeta.failed) || !spots) return null;
    const ids = recommendedSpotIds(slug);
    const official = ids.map(id => byId.get(id)).filter((s): s is CitySpot => Boolean(s));
    const rest = spots.filter(s => !official.includes(s));
    return [...official, ...rest.filter(s => s.image), ...rest.filter(s => !s.image)];
  })();

  const onSave = (e: React.MouseEvent, spot: CitySpot) => {
    e.preventDefault();
    e.stopPropagation();
    const item = toEventItem(spot);
    const nowSaved = togglePlaceSaved(item);
    setSavedTick(n => n + 1);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(nowSaved ? t("saved") : t("removed"));
    toastTimer.current = setTimeout(() => setToast(""), 1600);
  };

  void savedTick;

  const card = (s: CitySpot, rank: number | null, likeCount: number, usageCount: number) => {
    const item = toEventItem(s);
    const saved = isFavorited(item.id, item.sourceKey);
    return (
      <div key={`${tab}-${s.id}`} className="relative min-w-0">
        <Link href={`/place/${s.id}/`} className="block min-w-0 gkm-focus rounded-[4px]">
          <span className="relative block aspect-square rounded-[4px] overflow-hidden bg-[var(--qh-line)]">
            {s.image ? (
              <Image src={s.image} alt="" fill sizes="(max-width: 768px) 50vw, 240px" className="object-cover" unoptimized={s.image.startsWith("http")} />
            ) : (
              <img src="/images/placeholder-spot.svg" alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />
            )}
            {rank !== null && (
              <span className="absolute top-1 left-1 rounded-[3px] px-1.5 py-0.5 text-[10.5px] font-bold"
                style={{ background: "rgba(255,255,255,.92)", color: "var(--qh-blue)" }}>
                {tab === "new" ? t("communityNewRank", { n: rank }) : t("communityRank", { n: rank })}
              </span>
            )}
          </span>
          <span className="block mt-1.5 text-[14px] font-medium text-[var(--qh-ink)] truncate">
            {displayPlaceName(s.name, s.nameL10n, locale)}
          </span>
          <span className="block text-[12px] text-[var(--qh-faint2)] truncate">
            {rank !== null
              ? `${t("communityLiked", { count: likeCount })} · ${t("communityUsage", { count: usageCount })}`
              : (s.district ?? s.category)}
          </span>
        </Link>
        <button
          type="button"
          aria-pressed={saved}
          aria-label={saved ? t("removed") : t("saved")}
          onClick={e => onSave(e, s)}
          className="absolute top-0.5 right-0.5 w-11 h-11 flex items-center justify-center gkm-focus"
        >
          <span
            className="w-[34px] h-[34px] rounded-full flex items-center justify-center"
            style={{ background: "rgba(255,255,255,.92)", color: saved ? "var(--qh-blue)" : "var(--qh-ink)" }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden
                 fill={saved ? "currentColor" : "none"} stroke="currentColor"
                 strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6.5 4.5h11a1 1 0 011 1V20l-6.5-3.4L5.5 20V5.5a1 1 0 011-1z" />
            </svg>
          </span>
        </button>
      </div>
    );
  };

  return (
    <div className="qh min-h-screen pb-20" style={{ backgroundColor: "var(--qh-paper)" }}>
      <div className="max-w-3xl mx-auto px-5 md:px-6 pt-5">
        <Link href={`/city/${slug}`} className="inline-flex items-center whitespace-nowrap text-[13px] text-[var(--qh-faint)] hover:text-[var(--qh-ink)] py-2 min-h-11 gkm-focus">
          ← {cityLabel}
        </Link>
        <h1 className="mt-1 text-[22px] md:text-[26px] font-semibold text-[var(--qh-ink)]">{t("placesIn", { city: cityLabel })}</h1>

        {/* §8-1 인기|신규 전환 — URL 이 상태의 정본(공유·새로고침·뒤로 가기) */}
        <div role="tablist" aria-label={t("placesIn", { city: cityLabel })} className="mt-3 inline-flex rounded-full border p-0.5" style={{ borderColor: "var(--qh-line)", background: "#fff" }}>
          {(["popular", "new"] as const).map(m => (
            <button key={m} type="button" role="tab" aria-selected={tab === m}
              onClick={() => switchTab(m)}
              className="gkm-focus rounded-full px-4 min-h-10 text-[13px] font-semibold"
              style={tab === m ? { background: "var(--qh-ink)", color: "var(--qh-paper)" } : { color: "var(--qh-faint)" }}>
              {t(m === "new" ? "tabNew" : "tabPopular")}
            </button>
          ))}
        </div>

        {/* 신규 0건 — 빈 섹션 대신 조용한 안내 + 인기 복귀(§8-2 동일 문법) */}
        {tab === "new" && pageMeta.loaded && !pageMeta.failed && ranked.length === 0 ? (
          <div className="mt-8 text-center">
            <p className="text-[13.5px] text-[var(--qh-faint)]">{t("newPlacesEmpty")}</p>
            <button type="button" onClick={() => switchTab("popular")}
              className="gkm-focus mt-3 inline-flex min-h-11 items-center text-[13px] font-semibold" style={{ color: "var(--qh-blue)" }}>
              {t("backToPopular")} <span aria-hidden className="ml-1">→</span>
            </button>
          </div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-4">
              {(spots === null || !pageMeta.loaded) && [0, 1, 2, 3].map(i => (
                <div key={i} className="aspect-square rounded-[4px] bg-[var(--qh-line)] animate-pulse" />
              ))}
              {spots !== null && pageMeta.loaded && (
                fallback
                  ? fallback.map(s => card(s, null, 0, 0))
                  : list.map(x => card(x.spot, x.rank, x.likeCount, x.usageCount))
              )}
            </div>
            {pageMeta.hasMore && !fallback && (
              <div className="mt-5 flex justify-center">
                <button type="button" onClick={loadMore} disabled={busy}
                  className="gkm-focus inline-flex min-h-11 items-center rounded-full border px-5 text-[13.5px] font-semibold disabled:opacity-50"
                  style={{ borderColor: "var(--qh-line)", color: "var(--qh-ink)", background: "#fff" }}>
                  {t("loadMore")}
                </button>
              </div>
            )}
          </>
        )}
      </div>

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

export default function PlacesAllClient({ slug }: { slug: string }) {
  // useSearchParams 는 정적 export 에서 Suspense 경계가 필요하다
  return (
    <Suspense fallback={null}>
      <PlacesAllInner slug={slug} />
    </Suspense>
  );
}
