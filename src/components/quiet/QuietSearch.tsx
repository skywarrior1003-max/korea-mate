"use client";

// Global Search — Anchored Inline Search (Quiet Travel Editorial).
//
// 계약(LEVEL 2 + 최종 디자인):
//  - 검색은 시작한 자리에서 시작된다. field 는 이동·복제·모달화되지 않는다.
//  - 결과는 field "바로 아래" 표면: 모바일 = 같은 흐름(아래 섹션은 부모가 숨김),
//    데스크톱 = field 보다 약간 넓은 anchored panel. bottom sheet/팔레트 없음.
//  - 결과는 City · Trip · Place 통합 단일 리스트. 탭 없음. 타입은
//    썸네일 문법(원형/가로/정사각) + 텍스트 접두("City ·" 등) 이중 신호(RT-05 보완).
//  - 키보드: ↑↓ 행 이동 · Enter 열기 · Escape(입력 있으면 비우기, 없으면 닫기).
//    combobox/listbox 시맨틱 + aria-activedescendant.
//
// 데이터는 전부 기존 소스 재사용: 도시 5(정적) · curated trips(경주 공식 코스) ·
// 장소 = 기존 discovery fetch + explore-search-core 매칭. 새 스키마/SQL 없음.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useTranslations, useLocale } from "next-intl";
import type { CitySpot } from "@/data/cities/types";
import { normalizeSearchQuery, matchesExploreSearch, exploreSearchTier } from "@/lib/explore-search-core";
import { displayPlaceName } from "@/lib/place-display-name";
import { cityVisual } from "@/lib/city-visual";
import { CURATED_TRIPS } from "@/data/curated-trips";
import { QUIET_CITIES, loadSearchSpots } from "./quiet-data";

interface ResultRow {
  key: string;
  kind: "city" | "trip" | "place";
  title: string;
  meta: string;
  href: string;
  image?: string | null;
  imagePos?: string;
}

export interface QuietSearchProps {
  /** cover = 사진 위 유리질, floor = 종이 위 dock. 같은 컴포넌트가 스타일만 바꾼다 */
  variant: "cover" | "floor";
  /** 검색 활성(입력 focus 또는 질의 존재) 변화 — 모바일에서 아래 섹션을 숨길 때 사용 */
  onActiveChange?: (active: boolean) => void;
}

export default function QuietSearch({ variant, onActiveChange }: QuietSearchProps) {
  const t = useTranslations("quiet");
  const tForm = useTranslations("tripForm");
  const locale = useLocale();
  const router = useRouter();
  const listId = useId();

  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [spots, setSpots] = useState<CitySpot[] | null>(null);
  const [activeIdx, setActiveIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const active = focused || query.trim().length > 0;
  useEffect(() => { onActiveChange?.(active); }, [active, onActiveChange]);

  // 장소 인덱스는 검색이 처음 열릴 때 한 번만
  useEffect(() => {
    if (active && spots === null) { loadSearchSpots().then(setSpots); }
  }, [active, spots]);

  const nq = normalizeSearchQuery(query);

  const results: ResultRow[] = useMemo(() => {
    if (!nq) return [];
    const rows: ResultRow[] = [];
    const ql = nq.toLowerCase();
    // 1) 도시 — 영문·현지 표기 모두 매칭
    for (const c of QUIET_CITIES) {
      const label = tForm(c.labelKey);
      if (c.en.toLowerCase().includes(ql) || c.slug.includes(ql) || label.toLowerCase().includes(ql)) {
        rows.push({
          key: `city-${c.slug}`, kind: "city", title: label,
          meta: t("typeCity"), href: `/city/${c.slug}`,
          image: cityVisual(c.slug)?.src, imagePos: cityVisual(c.slug)?.objectPosition,
        });
      }
      if (rows.length >= 2) break;
    }
    // 2) curated trips — 제목·도시명 매칭
    let tripCount = 0;
    for (const trip of CURATED_TRIPS) {
      const cityLabel = tForm(`city_${trip.city.charAt(0).toUpperCase()}${trip.city.slice(1)}`);
      const hay = `${trip.title} ${trip.city} ${cityLabel}`.toLowerCase();
      if (hay.includes(ql)) {
        rows.push({
          key: `trip-${trip.id}`, kind: "trip", title: trip.title,
          meta: `${t("typeTrip")} · ${cityLabel}${trip.days ? ` · ${trip.days}d` : ""}`,
          href: `/city/${trip.city}/trips`,
        });
        if (++tripCount >= 2) break;
      }
    }
    // 3) 장소 — 기존 explore 검색 코어 그대로
    if (spots) {
      const matched = spots
        .filter(s => matchesExploreSearch(s, nq))
        .sort((a, b) => exploreSearchTier(a, nq) - exploreSearchTier(b, nq))
        .slice(0, 5);
      for (const s of matched) {
        const cityLabel = tForm(`city_${s.city.charAt(0).toUpperCase()}${s.city.slice(1)}`);
        rows.push({
          key: `place-${s.id}`, kind: "place",
          title: displayPlaceName(s.name, s.nameL10n, locale),
          meta: `${t("typePlace")} · ${cityLabel}${s.district ? ` · ${s.district}` : ""}`,
          href: `/place/${s.id}/`, image: s.image ?? null,
        });
      }
    }
    return rows.slice(0, 8);
  }, [nq, spots, t, tForm, locale]);

  const openRow = useCallback((row: ResultRow) => { router.push(row.href); }, [router]);

  const cancel = useCallback(() => {
    setQuery("");
    setFocused(false);
    inputRef.current?.blur();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, -1)); }
    else if (e.key === "Enter" && activeIdx >= 0 && results[activeIdx]) { e.preventDefault(); openRow(results[activeIdx]); }
    else if (e.key === "Escape") { e.preventDefault(); if (query) setQuery(""); else cancel(); }
  };

  const glass = variant === "cover" && !active;
  const showPanel = active && nq.length > 0;
  const showIdle = active && nq.length === 0;

  const thumbClass = (kind: ResultRow["kind"]) =>
    kind === "city" ? "w-11 h-11 rounded-full"
    : kind === "trip" ? "w-[68px] h-11 rounded-[4px]"
    : "w-11 h-11 rounded-[4px]";

  return (
    <div className="qh relative">
      {/* ── field — 모든 상태에서 같은 자리, 같은 요소 ── */}
      <div
        className={`flex items-center gap-3 rounded-[4px] px-4 transition-colors duration-200 ${
          glass
            ? "bg-white/15 border border-white/30 backdrop-blur-[6px]"
            : "bg-white border-[1.5px] border-[var(--qh-ink)]"
        } ${active ? "ring-2 ring-[var(--qh-clay)]/25" : ""}`}
        style={{ minHeight: 52 }}
      >
        {/* magnifier — 손잡이가 뚜렷한 svg(RT-05) */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden
          stroke={glass ? "rgba(255,255,255,.85)" : "var(--qh-ink)"} strokeWidth="2.2" strokeLinecap="round">
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="M15.5 15.5L21 21" />
        </svg>
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-activedescendant={activeIdx >= 0 ? `${listId}-${activeIdx}` : undefined}
          aria-label={t("searchShort")}
          value={query}
          onChange={e => { setQuery(e.target.value); setActiveIdx(-1); }}
          onFocus={() => setFocused(true)}
          onKeyDown={onKeyDown}
          placeholder={t("searchPlaceholder")}
          enterKeyHint="search"
          className={`flex-1 min-w-0 bg-transparent outline-none text-base ${
            glass ? "text-white placeholder:text-white/75" : "text-[var(--qh-ink)] placeholder:text-[var(--qh-faint)]"
          }`}
          style={{ fontSize: 16 /* iOS input zoom 방지 */ }}
        />
        {active && (
          <button
            type="button"
            onMouseDown={e => e.preventDefault()}
            onClick={cancel}
            className="qh flex-none whitespace-nowrap text-[13px] font-medium text-[var(--qh-faint)] hover:text-[var(--qh-ink)] py-3 -my-1 px-1 min-h-11"
          >
            {t("cancel")}
          </button>
        )}
      </div>

      {/* ── 결과 표면 — field 바로 아래. 모바일 = 같은 흐름, md+ = anchored panel ── */}
      {(showPanel || showIdle) && (
        /* 모바일: field 바로 아래부터 화면 끝까지가 결과 표면(아래 레거시 섹션을 덮는다).
           데스크톱: field 보다 약간 넓은 anchored panel. 어느 쪽도 모달·시트가 아니다. */
        <div
          className="fixed left-0 right-0 bottom-0 overflow-auto px-5 pb-28 bg-[var(--qh-paper)] z-30 md:static md:bg-transparent md:p-0 md:overflow-visible md:z-auto"
          style={{ top: "calc(3.5rem + 68px)" }}
        >
        <div
          className="md:absolute md:left-[-24px] md:right-[-24px] md:top-full md:mt-2 md:bg-[var(--qh-paper)] md:border md:border-[var(--qh-line)] md:rounded-[4px] md:shadow-[0_18px_50px_rgba(20,16,10,.16)] md:px-5 md:pb-3 md:max-h-[60vh] md:overflow-auto md:z-40"
        >
          {showIdle && (
            <p className="pt-4 pb-1 text-[13px] text-[var(--qh-faint2)]">{t("searchIdleHint")}</p>
          )}
          {showPanel && results.length === 0 && (
            <div className="pt-5 pb-2">
              <p className="text-[15px] font-semibold text-[var(--qh-ink)]">{t("noResults", { q: query.trim() })}</p>
              <p className="mt-1 text-[13px] text-[var(--qh-faint)]">{t("noResultsHint")}</p>
              <ul className="mt-3 border-t border-[var(--qh-line)]">
                {QUIET_CITIES.map(c => (
                  <li key={c.slug}>
                    <button type="button" onClick={() => router.push(`/city/${c.slug}`)}
                      className="w-full flex items-center gap-3.5 py-3 border-b border-[var(--qh-line)] text-left min-h-11">
                      <span className="relative w-11 h-11 rounded-full overflow-hidden flex-none bg-[var(--qh-line)]">
                        {cityVisual(c.slug) && (
                          <Image src={cityVisual(c.slug)!.src} alt="" fill sizes="44px" className="object-cover"
                            style={{ objectPosition: cityVisual(c.slug)!.objectPosition }} />
                        )}
                      </span>
                      <span className="text-[15px] font-semibold text-[var(--qh-ink)]">{tForm(c.labelKey)}</span>
                      <span className="text-[12px] text-[var(--qh-faint)]">{t("typeCity")}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {showPanel && results.length > 0 && (
            <ul id={listId} role="listbox" aria-label={t("searchShort")}>
              {results.map((r, i) => (
                <li key={r.key} id={`${listId}-${i}`} role="option" aria-selected={i === activeIdx}>
                  <button
                    type="button"
                    onClick={() => openRow(r)}
                    onMouseEnter={() => setActiveIdx(i)}
                    className={`w-full flex items-center gap-3.5 py-3 text-left border-b border-[var(--qh-line)] min-h-11 ${
                      i === activeIdx ? "bg-[rgba(138,75,42,.08)] shadow-[inset_3px_0_0_var(--qh-clay)] -mx-2 px-2" : ""
                    }`}
                  >
                    <span className={`relative overflow-hidden flex-none bg-[var(--qh-line)] ${thumbClass(r.kind)}`}>
                      {r.image && (
                        <Image src={r.image} alt="" fill sizes="68px" className="object-cover"
                          style={r.imagePos ? { objectPosition: r.imagePos } : undefined} unoptimized={r.image.startsWith("http")} />
                      )}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[15px] font-semibold text-[var(--qh-ink)] truncate">{r.title}</span>
                      <span className="block text-[12px] text-[var(--qh-faint)] truncate">{r.meta}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        </div>
      )}
    </div>
  );
}
