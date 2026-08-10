"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { getSavedSpotsData, FAVORITES_EVENT, removeFavorite } from "@/lib/favorites";
import { getItemSourceKey } from "@/lib/place-identity";
import type { EventItem } from "@/lib/cart";
import EventDetailModal from "@/components/EventDetailModal";

export default function SavedSpotsPanel() {
  const pathname = usePathname();
  // 이 패널의 문구는 Saved 보관함의 것이다. 목록 제목과 해제 동작은 이미
  // 같은 뜻으로 쓰이는 키가 있어 그대로 쓴다 — 같은 말에 키를 새로 만들면
  // 나중에 한쪽만 고쳐진다.
  const t = useTranslations("saved");
  const tPicks = useTranslations("picks");
  const [spots, setSpots] = useState<EventItem[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [selectedSpot, setSelectedSpot] = useState<EventItem | null>(null);

  // 이 패널은 저장 목록만 본다. cart 를 구독할 이유가 없어졌다 —
  // This Trip 편입은 Picks 에서만 일어난다.
  const refresh = useCallback(() => {
    setSpots([...getSavedSpotsData()]);
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(FAVORITES_EVENT, refresh);
    return () => window.removeEventListener(FAVORITES_EVENT, refresh);
  }, [refresh]);

  // 저장된 Spot이 없으면 패널 숨김
  if (spots.length === 0) return null;
  // /picks 에는 Saved 가 이미 탭으로 있다. 같은 목록을 부유 패널로 한 번 더
  // 띄우면 중복일 뿐 아니라 Selected 탭의 Build CTA 를 덮는다(실측 겹침).
  // /explore 는 최종 디자인(list/map) 두 화면 어디에도 이 패널이 없고, 지도
  // 하단 선택 카드와 같은 자리를 다툰다. 기능은 Picks > Saved 가 대체한다.
  if (pathname.startsWith("/picks") || pathname.startsWith("/explore")) return null;

  return (
    // BottomNav 위로 올린다(4.25rem = nav 3.5rem + 간격 0.75rem).
    // 전역 CartDrawer 가 사라져 한 줄 위로 쌓을 이유가 없어졌다 — 그대로 두면
    // 아래가 빈 채로 떠 있는다. 데스크톱은 nav 가 없어 기존 위치를 유지한다.
    <div className="fixed left-4 z-[45] select-none bottom-[calc(4.25rem+env(safe-area-inset-bottom))] md:bottom-6">
      {!expanded ? (
        // ── 접힌 상태: 작은 pill 버튼 ──────────────────────────────
        <button
          onClick={() => setExpanded(true)}
          aria-label={t("panelShow")}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white shadow-lg border border-gray-200 hover:shadow-xl transition-all"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden className="text-emerald-600"
               fill="currentColor" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 3h12a1 1 0 0 1 1 1v16l-7-4-7 4V4a1 1 0 0 1 1-1z" />
          </svg>
          <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[11px] font-black bg-emerald-500 text-white px-1 leading-none">
            {spots.length}
          </span>
          <span className="text-xs font-semibold text-gray-600">{t("title")}</span>
          <span className="text-gray-400 text-xs leading-none">▲</span>
        </button>
      ) : (
        // ── 펼친 상태: 스팟 목록 카드 ───────────────────────────────
        <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-72 max-h-[380px] flex flex-col overflow-hidden">
          {/* 헤더 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
            {/* 이 목록은 favorites 다. 하트가 아니라 북마크로 표기한다 —
                하트는 Story·Memory 의 Like 로 남긴다. */}
            <div className="flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden className="text-emerald-600"
                   fill="currentColor" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 3h12a1 1 0 0 1 1 1v16l-7-4-7 4V4a1 1 0 0 1 1-1z" />
              </svg>
              <span className="text-sm font-black text-gray-900">{t("title")}</span>
              <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[11px] font-black bg-emerald-500 text-white px-1 leading-none">
                {spots.length}
              </span>
            </div>
            <button
              onClick={() => setExpanded(false)}
              aria-label={t("panelCollapse")}
              className="text-gray-400 hover:text-gray-700 font-bold px-1 py-0.5 transition-colors text-sm"
            >
              ▼
            </button>
          </div>

          {/* 스팟 목록 */}
          <ul className="overflow-y-auto flex-1 divide-y divide-gray-50">
            {spots.map(item => {
              return (
                <li
                  key={getItemSourceKey(item)}
                  onClick={() => setSelectedSpot(item)}
                  role="button"
                  aria-label={`View details for ${item.shortName}`}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50/60 transition-colors cursor-pointer"
                >
                  {/* 썸네일 */}
                  <div className="w-9 h-9 rounded-xl overflow-hidden shrink-0 bg-gray-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.image ?? "/images/placeholder-spot.svg"}
                      alt={item.shortName}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = "/images/placeholder-spot.svg";
                      }}
                    />
                  </div>

                  {/* 이름 + 지역 */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-900 truncate">{item.shortName}</p>
                    <p className="text-[10px] text-gray-400 truncate">{item.district || item.city}</p>
                  </div>

                  {/* 여기서 This Trip 으로 바로 보내지 않는다. 이번 여행에 넣는
                      공식 경로는 Picks > Saved 하나뿐이다 — 우회 경로를 두면 같은
                      동작이 두 곳에 생겨 어느 쪽이 진짜인지 흐려진다.
                      이 패널은 저장한 것을 훑고 상세로 들어가는 역할만 한다. */}

                  {/* 저장 해제 */}
                  <button
                    onClick={(e) => { e.stopPropagation(); removeFavorite(item.id); }}
                    title={tPicks("unsaveAria", { name: item.shortName })}
                    className="shrink-0 w-7 h-7 rounded-full text-xs flex items-center justify-center text-gray-300 hover:text-red-400 hover:bg-red-50 transition-all cursor-pointer"
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>

          {/* 이번 여행에 넣는 일은 Picks 에서 한다. 여기서는 그리로 보내기만 한다. */}
          <div className="px-4 py-2 border-t border-gray-50 shrink-0">
            <Link
              href="/picks/?tab=saved"
              className="block text-[11px] font-bold text-gray-600 hover:text-gray-900 text-center py-1 transition-colors"
            >
              {t("manageInPicks")}
            </Link>
          </div>
        </div>
      )}

      {selectedSpot && (
        <EventDetailModal
          event={selectedSpot}
          onClose={() => setSelectedSpot(null)}
        />
      )}
    </div>
  );
}
