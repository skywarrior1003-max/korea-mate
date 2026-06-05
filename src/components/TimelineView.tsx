"use client";

import Link from "next/link";
import type { CartItem } from "@/lib/cart";

// ── 상수 ───────────────────────────────────────
const PX_PER_MIN    = 1.4;   // 60분 = 84px
const MIN_BLOCK_H   = 80;    // 짧은 이벤트 최소 높이
const TRANSIT_MINS  = 20;    // 두 장소 사이 기본 이동 시간
const TRANSIT_H     = 28;    // 이동 블록 높이(px)

// ── Stage 스타일 매핑 ─────────────────────────
const STAGE_STYLE: Record<string, { border: string; bg: string; badge: string; dot: string }> = {
  "Early-Bird": { border: "border-violet-400", bg: "bg-violet-50",  badge: "bg-violet-100 text-violet-700", dot: "bg-violet-500"  },
  "Pre-Event":  { border: "border-blue-400",   bg: "bg-blue-50",   badge: "bg-blue-100 text-blue-700",     dot: "bg-blue-500"    },
  "Event-Day":  { border: "border-red-400",    bg: "bg-red-50",    badge: "bg-red-100 text-red-700",       dot: "bg-red-500"     },
  "Post-Event": { border: "border-emerald-400",bg: "bg-emerald-50",badge: "bg-emerald-100 text-emerald-700",dot: "bg-emerald-500" },
  "Standalone": { border: "border-gray-300",   bg: "bg-gray-50",   badge: "bg-gray-100 text-gray-600",     dot: "bg-gray-400"    },
};

// ── 서바이벌 가이드 메타 ──────────────────────
const GUIDE_META: Record<string, { icon: string; label: string; cls: string }> = {
  "getting-around": { icon: "🚇", label: "Getting Around", cls: "bg-blue-50 text-blue-600 border border-blue-100"   },
  "payments":       { icon: "💳", label: "Cash & Payments", cls: "bg-yellow-50 text-yellow-700 border border-yellow-100" },
  "solo-dining":    { icon: "🍜", label: "Solo Dining",     cls: "bg-green-50 text-green-700 border border-green-100"  },
};

// ── 유틸 함수 ──────────────────────────────────
function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function blockHeight(mins: number): number {
  return Math.max(MIN_BLOCK_H, Math.round(mins * PX_PER_MIN));
}

// ── Props ─────────────────────────────────────
interface Props {
  items: CartItem[];
  arrivalTime: string;        // "14:00"
  date: string;               // "2026-10-17" (표시용, 선택)
  onRemoveItem: (id: string) => void;
  onMoveUp:     (id: string) => void;
  onMoveDown:   (id: string) => void;
  /** 타임라인 드롭존 이벤트 (미배치 아이템 → 이 날로 이동) */
  onDragOver: React.DragEventHandler<HTMLDivElement>;
  onDrop:     React.DragEventHandler<HTMLDivElement>;
  isDragOver: boolean;
}

export default function TimelineView({
  items,
  arrivalTime,
  date,
  onRemoveItem,
  onMoveUp,
  onMoveDown,
  onDragOver,
  onDrop,
  isDragOver,
}: Props) {

  // 각 아이템의 시작 시각 누적 계산
  const startTimes: string[] = [];
  let cursor = arrivalTime;
  items.forEach((item, idx) => {
    startTimes.push(cursor);
    cursor = addMinutes(cursor, item.recommendedDurationMinutes);
    if (idx < items.length - 1) cursor = addMinutes(cursor, TRANSIT_MINS);
  });

  // ── 빈 드롭존 ───────────────────────────────
  if (items.length === 0) {
    return (
      <div
        onDragOver={onDragOver}
        onDrop={onDrop}
        className={`
          flex flex-col items-center justify-center min-h-[260px] rounded-2xl border-2 border-dashed
          transition-colors duration-200
          ${isDragOver
            ? "border-orange-400 bg-orange-50"
            : "border-gray-200 bg-gray-50"
          }
        `}
      >
        <p className="text-3xl mb-3">📅</p>
        <p className="text-sm font-bold text-gray-500">
          {isDragOver ? "Release to add to this day" : "Drag events here to build your day"}
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Starts at {arrivalTime}{date ? ` · ${date}` : ""}
        </p>
      </div>
    );
  }

  // ── 타임라인 렌더 ────────────────────────────
  return (
    <div
      className={`
        relative rounded-2xl transition-colors duration-200
        ${isDragOver ? "ring-2 ring-orange-400 ring-offset-2" : ""}
      `}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {items.map((item, idx) => {
        const st   = STAGE_STYLE[item.stage] ?? STAGE_STYLE["Standalone"];
        const h    = blockHeight(item.recommendedDurationMinutes);
        const endT = addMinutes(startTimes[idx], item.recommendedDurationMinutes);

        return (
          <div key={item.id} className="flex gap-3">

            {/* ── 시간 레이블 컬럼 ── */}
            <div className="w-14 shrink-0 flex flex-col items-end pt-3 gap-0.5">
              <span className="text-xs font-bold text-gray-700">{startTimes[idx]}</span>
              <span className="text-[10px] text-gray-400">{endT}</span>
            </div>

            {/* ── 타임라인 세로선 + 블록 ── */}
            <div className="flex flex-col items-center relative">
              {/* 세로 연결선 */}
              <div className="w-0.5 bg-gray-200 absolute top-0 bottom-0 left-1/2 -translate-x-1/2 -z-0" />
              {/* 도트 */}
              <div className={`w-3 h-3 rounded-full ${st.dot} ring-2 ring-white mt-3.5 shrink-0 z-10`} />
            </div>

            {/* ── 이벤트 블록 ── */}
            <div className="flex-1 mb-2">
              <div
                style={{ minHeight: `${h}px` }}
                className={`
                  relative flex flex-col rounded-2xl border-l-4 p-4 shadow-sm
                  ${st.border} ${st.bg}
                `}
              >
                {/* 상단: 이름 + 순서 변경 + 제거 */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.badge}`}>
                        {item.stage}
                      </span>
                      {item.isAnchor && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
                          ⭐ Anchor
                        </span>
                      )}
                    </div>
                    <h4 className="text-sm font-black text-gray-900 leading-snug">
                      {item.shortName}
                    </h4>
                    <p className="text-xs text-gray-500 mt-0.5">{item.city} · {item.district}</p>
                  </div>

                  {/* 순서 조정 + 제거 버튼 */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => onMoveUp(item.id)}
                      disabled={idx === 0}
                      className="w-6 h-6 flex items-center justify-center rounded-md text-gray-400 hover:bg-white hover:text-gray-700 disabled:opacity-20 transition-colors text-xs"
                      title="Move up"
                    >▲</button>
                    <button
                      onClick={() => onMoveDown(item.id)}
                      disabled={idx === items.length - 1}
                      className="w-6 h-6 flex items-center justify-center rounded-md text-gray-400 hover:bg-white hover:text-gray-700 disabled:opacity-20 transition-colors text-xs"
                      title="Move down"
                    >▼</button>
                    <button
                      onClick={() => onRemoveItem(item.id)}
                      className="w-6 h-6 flex items-center justify-center rounded-md text-gray-300 hover:bg-red-50 hover:text-red-500 transition-colors font-bold"
                      title="Remove from timeline"
                    >×</button>
                  </div>
                </div>

                {/* 체류 시간 + 이동수단 */}
                <div className="flex flex-wrap gap-2 text-xs text-gray-500 mb-3">
                  <span>🕐 {item.recommendedDurationMinutes} min</span>
                  {item.cashOnly && (
                    <span className="text-amber-600 font-semibold">💵 Cash Only</span>
                  )}
                  {item.foreignCardAccepted && !item.cashOnly && (
                    <span>💳 Card OK</span>
                  )}
                  {!item.englishMenu && (
                    <span className="text-orange-500">⚠️ Korean menu</span>
                  )}
                  {!item.barrierFree && (
                    <span className="text-orange-500">⚠️ Stairs/Uneven</span>
                  )}
                </div>

                {/* ── 서바이벌 가이드 추천 ── */}
                {item.relatedSurvivalGuides.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {item.relatedSurvivalGuides.map((guideId) => {
                      const g = GUIDE_META[guideId];
                      if (!g) return null;
                      return (
                        <Link
                          key={guideId}
                          href={`/survival-guide#${guideId}`}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold ${g.cls} hover:opacity-80 transition-opacity`}
                        >
                          {g.icon} {g.label}
                        </Link>
                      );
                    })}
                  </div>
                )}

                {/* ── 제휴 링크 CTA ── */}
                {item.commerce.hasAffiliate &&
                  item.commerce.affiliateUrl &&
                  item.commerce.affiliatePartner && (
                    <a
                      href={item.commerce.affiliateUrl}
                      target="_blank"
                      rel="noopener noreferrer sponsored"
                      className="inline-flex items-center gap-1.5 self-start px-3 py-1.5 rounded-xl text-xs font-bold text-white transition-opacity hover:opacity-90"
                      style={{ backgroundColor: "#f97316" }}
                    >
                      🤝 Book via {item.commerce.affiliatePartner} →
                    </a>
                  )}

                {/* 티켓 링크 (별도 존재 시) */}
                {item.commerce.hasTicketing && item.commerce.bookingUrl && (
                  <a
                    href={item.commerce.bookingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 self-start mt-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors"
                    style={{ color: "#1a1f36", border: "1.5px solid #1a1f36" }}
                  >
                    🎟️ Book Tickets →
                  </a>
                )}
              </div>

              {/* ── 이동 시간 커넥터 (마지막 아이템 제외) ── */}
              {idx < items.length - 1 && (
                <div
                  style={{ height: `${TRANSIT_H}px` }}
                  className="flex items-center gap-2 pl-4 ml-2"
                >
                  <div className="w-0.5 h-full bg-gray-200 shrink-0" />
                  <span className="text-[10px] text-gray-400 font-medium">
                    🚌 ~{TRANSIT_MINS} min transit
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* 드롭존 추가 프롬프트 (아이템 있을 때 하단) */}
      <div
        className={`
          mt-2 flex items-center justify-center h-12 rounded-xl border-2 border-dashed text-xs font-medium
          transition-colors duration-200
          ${isDragOver
            ? "border-orange-400 bg-orange-50 text-orange-500"
            : "border-gray-100 text-gray-300"
          }
        `}
      >
        {isDragOver ? "Release to add" : "+ Drop more events here"}
      </div>
    </div>
  );
}
