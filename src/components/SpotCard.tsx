"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import type { CitySpot } from "@/data/cities/types";

function getCategoryColor(category: string): string {
  switch (category) {
    case "restaurant": return "#e85d04";
    case "nature":     return "#2d6a4f";
    case "attraction": return "#1a1f36";
    case "event":      return "#7b2d8b";
    default:           return "#1a1f36";
  }
}

interface SpotCardProps {
  spot: CitySpot;
  distKm?: number;
  onClick: () => void;
}

export default function SpotCard({ spot, distKm, onClick }: SpotCardProps) {
  const [imgError, setImgError] = useState(false);
  const tB = useTranslations("badges");
  const tM = useTranslations("map");
  const tE = useTranslations("explore");

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-2xl border border-gray-100 overflow-hidden flex flex-col hover:shadow-xl transition-all duration-300 cursor-pointer group"
    >
      {/* 이미지 */}
      <div className="h-44 overflow-hidden relative bg-gray-200">
        {spot.image && !imgError ? (
          <Image
            src={spot.image} alt={spot.name} fill unoptimized
            onError={() => setImgError(true)}
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/images/placeholder-spot.svg" alt="No image" className="w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors duration-200 flex items-center justify-center">
          <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white font-black text-sm bg-black/50 backdrop-blur-sm px-4 py-2 rounded-full">
            {tE("viewDetails")}
          </span>
        </div>
        <div className="absolute top-3 left-3">
          <span
            className="px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wide text-white"
            style={{ backgroundColor: getCategoryColor(spot.category) }}
          >
            {spot.category === "nature" ? tB("nature") : spot.category}
          </span>
        </div>
        {distKm !== undefined && (
          <div className="absolute top-3 right-3">
            <span className="px-2.5 py-1 rounded-lg text-xs font-bold text-white" style={{ backgroundColor: "#f97316" }}>
              📍 {distKm.toFixed(1)} km
            </span>
          </div>
        )}
      </div>

      {/* 본문 */}
      <div className="p-4 flex flex-col flex-1">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-gray-400">📍 {spot.district ?? spot.city}</span>
          {spot.durationMinutes && (
            <span className="text-xs font-semibold text-gray-400">🕐 {spot.durationMinutes}min</span>
          )}
        </div>
        <h3 className="text-sm font-black text-gray-900 mb-1.5 leading-snug line-clamp-2">{spot.name}</h3>
        <p className="text-xs text-gray-500 mb-3 line-clamp-2 leading-relaxed flex-1">{spot.description}</p>

        {/* 배지 */}
        <div className="flex flex-wrap gap-1 mb-3">
          {spot.soloFriendly      && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">{tB("soloOk")}</span>}
          {spot.cashOnly          && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100">{tB("cashOnly")}</span>}
          {spot.foreignCardAccepted && !spot.cashOnly && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">{tB("cardOk")}</span>}
          {spot.category === "nature" && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-100">{tB("free")}</span>}
        </div>

        {/* 지도 버튼 */}
        <div className="grid grid-cols-2 gap-1.5 mt-auto" onClick={e => e.stopPropagation()}>
          <a
            href={spot.mapUrl}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-1 px-2 py-2 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-xl transition-colors"
          >
            {tM("google")}
          </a>
          <a
            href={spot.naverMapUrl ?? `https://map.naver.com/v5/search/${encodeURIComponent(spot.name)}`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-1 px-2 py-2 text-xs font-bold text-green-700 bg-green-50 border border-green-200 hover:bg-green-100 rounded-xl transition-colors"
          >
            {tM("naver")}
          </a>
        </div>
      </div>
    </div>
  );
}
