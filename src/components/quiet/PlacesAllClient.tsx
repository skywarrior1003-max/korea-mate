"use client";

// Places View All — 추천 장소를 더 보는 곳(Explore 아님: 지도·필터 없음).
// 카드 = 사진 + 이름 + 간결한 메타 + Save. 탭하면 기존 canonical /place/[id] 로.
// Save 는 기존 semantics 그대로: Saved = 장기 북마크(favorites) — My Places·
// This Trip 자동 추가 없음. 아이콘도 북마크다(하트는 Like 전용). 저장은 다른
// 화면과 같은 중앙 togglePlaceSaved 를 쓴다 → 조용한 toast 만.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useTranslations, useLocale } from "next-intl";
import type { CitySpot } from "@/data/cities/types";
import { displayPlaceName } from "@/lib/place-display-name";
import { isFavorited, FAVORITES_EVENT } from "@/lib/favorites";
import { togglePlaceSaved } from "@/lib/place-actions/place-actions-core";
import { toEventItem } from "@/components/ExploreCity";
import { loadCitySpots, quietCity } from "./quiet-data";
import { recommendedSpotIds } from "@/data/regional/regional-recommendations";

/** 서버 확정 도시 전체 순위 행(COLD-START §2) — rank 는 서버 값, 재정렬 금지 */
interface CommunityPlaceRank { id: number; likeCount: number; usageCount: number; rank: number }

export default function PlacesAllClient({ slug }: { slug: string }) {
  const t = useTranslations("quiet");
  const tForm = useTranslations("tripForm");
  const locale = useLocale();
  const city = quietCity(slug);
  const [spots, setSpots] = useState<CitySpot[] | null>(null);
  const [commPlaces, setCommPlaces] = useState<CommunityPlaceRank[]>([]);
  const [savedTick, setSavedTick] = useState(0);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { loadCitySpots(slug).then(setSpots); }, [slug]);
  // COLD-START §2·§3 — 서버가 도시 전체 후보의 연속 순위를 확정한다(반응 0
  // 포함). 이 화면은 그 순서를 그대로 그린다 — 클라이언트 재정렬 없음.
  useEffect(() => {
    let alive = true;
    fetch(`/api/recommendations/${slug}?limit=2000`)
      .then(r => (r.ok ? r.json() : null))
      .then((j: { places?: CommunityPlaceRank[] } | null) => {
        if (alive && j && Array.isArray(j.places)) setCommPlaces(j.places);
      })
      .catch(() => { /* 순위 없이 기존 목록 유지(과도기 폴백) */ });
    return () => { alive = false; };
  }, [slug]);
  useEffect(() => {
    const bump = () => setSavedTick(n => n + 1);
    window.addEventListener(FAVORITES_EVENT, bump);
    return () => window.removeEventListener(FAVORITES_EVENT, bump);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  if (!city) return null;
  const cityLabel = tForm(city.labelKey);
  // 공식 recommended_now 의 canonical 연결 장소를 먼저, 그 뒤 카탈로그(사진 우선).
  // 배지·순위 숫자는 붙이지 않는다 — 정렬 provenance 만.
  // COLD-START §2·§3 — 서버가 준 도시 전체 연속 순위를 그대로 그린다(1위부터
  // 마지막 후보까지 전부 badge, 반응 0 포함·별도 섹션 없음). 서버 응답에 없는
  // 카탈로그 행(공개 상태 편차 등 드문 경우)만 맨 뒤에 badge 없이 남긴다.
  // API 실패 시에는 기존 정적 순서를 badge 없이 보여 준다(과도기 폴백 —
  // 클라이언트 임의 재정렬이 아니다).
  const list = (() => {
    const all = spots ?? [];
    const byId = new Map(all.map(s => [Number(s.id), s]));
    const ranked = commPlaces
      .map(r => ({ spot: byId.get(r.id), rank: r.rank as number | null, likeCount: r.likeCount, usageCount: r.usageCount }))
      .filter((x): x is { spot: CitySpot; rank: number; likeCount: number; usageCount: number } => Boolean(x.spot));
    const taken = new Set(ranked.map(x => Number(x.spot.id)));
    if (ranked.length > 0) {
      const leftover = all.filter(s => !taken.has(Number(s.id)))
        .map(s => ({ spot: s, rank: null as number | null, likeCount: 0, usageCount: 0 }));
      return [...ranked, ...leftover];
    }
    const ids = recommendedSpotIds(slug);
    const official = ids.map(id => byId.get(id)).filter((s): s is NonNullable<typeof s> => Boolean(s));
    const rest = all.filter(s => !official.includes(s));
    return [...official, ...rest.filter(s => s.image), ...rest.filter(s => !s.image)]
      .map(s => ({ spot: s, rank: null as number | null, likeCount: 0, usageCount: 0 }));
  })();

  const onSave = (e: React.MouseEvent, spot: CitySpot) => {
    e.preventDefault();
    e.stopPropagation();
    const item = toEventItem(spot);
    // 다른 화면과 같은 중앙 toggle 을 쓴다 — 캐시·서버 save-signal 까지 한 곳에서.
    const nowSaved = togglePlaceSaved(item);
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
          {list.map(({ spot: s, rank, likeCount, usageCount }) => {
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
                    {/* §6-2 조용한 순위 badge — 서버 순위가 실재하는 카드에만 */}
                    {rank !== null && (
                      <span className="absolute top-1 left-1 rounded-[3px] px-1.5 py-0.5 text-[10.5px] font-bold"
                        style={{ background: "rgba(255,255,255,.92)", color: "var(--qh-blue)" }}>
                        {t("communityRank", { n: rank })}
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
                  {/* Save = 북마크 — 하트는 Like 전용(최종 Social 문법) */}
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
