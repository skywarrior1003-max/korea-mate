"use client";

// gokoreamate — Trip Moment Timeline
// TASK-022: 기록된 순간들의 아름다운 타임라인 뷰

import { useState, useCallback } from "react";
import type { TripMoment } from "@/lib/trip-moments/types";
import { MOMENT_CATEGORIES } from "@/lib/trip-moments/types";

interface Props {
  moments:       TripMoment[];
  onDelete:      (momentId: string) => void;
  onAddMemory:   () => void;
}

const CAT_COLORS: Record<string, string> = {
  food:    "#f97316",
  scenery: "#16a34a",
  people:  "#7c3aed",
  culture: "#d97706",
  random:  "#D4AF37",
};

export default function TripMomentTimeline({ moments, onDelete, onAddMemory }: Props) {
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [expanded,      setExpanded]      = useState<string | null>(null);

  const handleDelete = useCallback((id: string) => {
    if (deleteConfirm === id) {
      onDelete(id);
      setDeleteConfirm(null);
    } else {
      setDeleteConfirm(id);
      setTimeout(() => setDeleteConfirm(null), 3000);
    }
  }, [deleteConfirm, onDelete]);

  if (moments.length === 0) {
    return (
      <div
        className="rounded-3xl border-2 border-dashed border-[#E6DFD5] p-10 text-center flex flex-col items-center gap-4 cursor-pointer hover:border-[#D4AF37] transition-colors"
        onClick={onAddMemory}
      >
        <div className="w-16 h-16 rounded-2xl bg-[#EAE3D2] flex items-center justify-center text-3xl">📸</div>
        <div>
          <p className="text-base font-black text-[#2C2520]">아직 기록된 순간이 없어요</p>
          <p className="text-sm text-[#8C6239] mt-1">우연히 들른 맛집, 풍경, 사람들…<br/>이 여행의 진짜 이야기를 남겨보세요</p>
        </div>
        <button
          className="mt-2 px-6 py-3 rounded-xl text-sm font-black text-white transition-all active:scale-95"
          style={{ backgroundColor: "#D4AF37" }}
        >
          📸 첫 순간 기록하기
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {moments.map((m, i) => {
        const cat      = MOMENT_CATEGORIES.find(c => c.key === m.category) ?? MOMENT_CATEGORIES[4];
        const color    = CAT_COLORS[m.category] ?? "#D4AF37";
        const isOpen   = expanded === m.moment_id;
        const dateStr  = new Date(m.captured_at).toLocaleString("ko-KR", {
          month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
        });

        return (
          <div
            key={m.moment_id}
            className="bg-white rounded-2xl border border-[#E6DFD5] overflow-hidden shadow-sm"
            style={{ animation: `fadeInUp 0.3s ease-out ${i * 0.06}s both` }}
          >
            {/* 사진 */}
            {m.photo_data && (
              <div
                className="relative w-full overflow-hidden cursor-pointer"
                style={{ maxHeight: isOpen ? 400 : 200 }}
                onClick={() => setExpanded(isOpen ? null : m.moment_id)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={m.photo_data}
                  alt={m.memo || cat.label}
                  className="w-full object-cover transition-all duration-500"
                  style={{ maxHeight: isOpen ? 400 : 200 }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                <div className="absolute bottom-3 left-3 flex items-center gap-1.5">
                  <span
                    className="text-xs font-black px-2.5 py-1 rounded-lg text-white"
                    style={{ backgroundColor: color }}
                  >
                    {cat.emoji} {cat.label}
                  </span>
                  {m.day_number !== null && (
                    <span className="text-xs font-bold bg-black/50 text-white px-2 py-1 rounded-lg backdrop-blur-sm">
                      Day {m.day_number}
                    </span>
                  )}
                </div>
                <div className="absolute top-3 right-3 text-xs text-white/70 font-medium bg-black/40 px-2 py-1 rounded-lg backdrop-blur-sm">
                  {isOpen ? "접기 ↑" : "더보기 ↓"}
                </div>
              </div>
            )}

            {/* 사진 없을 때 카테고리 배지 */}
            {!m.photo_data && (
              <div
                className="px-5 pt-4 pb-0 flex items-center gap-2"
              >
                <span
                  className="text-xs font-black px-2.5 py-1 rounded-lg text-white"
                  style={{ backgroundColor: color }}
                >
                  {cat.emoji} {cat.label}
                </span>
                {m.day_number !== null && (
                  <span className="text-xs font-bold bg-[#EAE3D2] text-[#8C6239] px-2 py-1 rounded-lg">
                    Day {m.day_number}
                  </span>
                )}
              </div>
            )}

            {/* 내용 */}
            <div className="px-5 py-4 space-y-2.5">
              {m.memo && (
                <p className="text-sm text-[#2C2520] leading-relaxed font-medium whitespace-pre-line">
                  {m.memo}
                </p>
              )}
              {!m.memo && (
                <p className="text-sm text-[#8C6239]/60 italic">메모 없음</p>
              )}

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-xs text-[#8C6239]/60">
                  <span>🕐 {dateStr}</span>
                  {m.lat !== null && (
                    <span>📍 {m.location_label}</span>
                  )}
                  {m.synced && (
                    <span className="text-emerald-500">☁️</span>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(m.moment_id)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    deleteConfirm === m.moment_id
                      ? "bg-red-500 text-white"
                      : "text-[#8C6239]/40 hover:text-red-400 hover:bg-red-50"
                  }`}
                >
                  {deleteConfirm === m.moment_id ? "삭제 확인" : "삭제"}
                </button>
              </div>
            </div>
          </div>
        );
      })}

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
