// S1 — Adaptive Home 모듈 (handoff: pre/in/post-trip 조건부 모듈)
// 판정 근거: 기기 소유 itinerary의 start_date/end_date 실데이터만 사용.
// 여행 없음 → 렌더하지 않음 (기본 Home 그대로). 가짜 수치·샘플 여행 금지.

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { apiFetchItinerariesByDevice } from "@/lib/itinerary-api";
import { getDeviceId } from "@/lib/deviceId";

type Phase =
  | { kind: "in";   tripId: string; city: string }
  | { kind: "pre";  tripId: string; city: string; startDate: string }
  | { kind: "post"; tripId: string; city: string };

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function AdaptiveHomeCard() {
  const t = useTranslations("adaptive");
  const [phase, setPhase] = useState<Phase | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetchItinerariesByDevice(getDeviceId()).then(rows => {
      if (cancelled || rows.length === 0) return;
      const today = todayYmd();

      // 오늘이 기간에 포함되는 여행 → in-trip 최우선
      const inTrip = rows.find(r => r.start_date && r.end_date && r.start_date <= today && today <= r.end_date);
      if (inTrip) { setPhase({ kind: "in", tripId: inTrip.id, city: inTrip.city ?? "Korea" }); return; }

      // 미래 여행 중 가장 가까운 것 → pre-trip
      const future = rows
        .filter(r => r.start_date && r.start_date > today)
        .sort((a, b) => (a.start_date! < b.start_date! ? -1 : 1));
      if (future.length > 0) {
        const f = future[0];
        setPhase({ kind: "pre", tripId: f.id, city: f.city ?? "Korea", startDate: f.start_date! });
        return;
      }

      // 최근 종료된 여행 (14일 이내) → post-trip
      const past = rows
        .filter(r => r.end_date && r.end_date < today)
        .sort((a, b) => (a.end_date! > b.end_date! ? -1 : 1));
      if (past.length > 0) {
        const p = past[0];
        const daysSince = (new Date(today).getTime() - new Date(p.end_date!).getTime()) / 86400000;
        if (daysSince <= 14) setPhase({ kind: "post", tripId: p.id, city: p.city ?? "Korea" });
      }
    }).catch(() => { /* 네트워크 실패 → 모듈 미표시 */ });
    return () => { cancelled = true; };
  }, []);

  if (!phase) return null;

  const itinHref = `/itinerary?id=${phase.tripId}`;

  return (
    <section aria-label="Trip status" className="max-w-7xl mx-auto px-4 sm:px-6 -mt-8 relative z-10 mb-2">
      <div className="rounded-card border border-line bg-surface shadow-card p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        {phase.kind === "in" && (
          <>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-ink">🧳 {t("inTripTitle")}</p>
              <p className="text-sm text-sub mt-0.5">{t("inTripHint")}</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Link href={itinHref} className="gkm-focus inline-flex items-center min-h-11 px-4 rounded-control bg-action text-white text-sm font-bold hover:bg-action-hover shadow-cta">
                {t("todayPlan")}
              </Link>
              <Link href={`/explore/${phase.city.toLowerCase()}`} className="gkm-focus inline-flex items-center min-h-11 px-4 rounded-control border border-line bg-surface text-ink text-sm font-semibold">
                📍 {t("nearMe")}
              </Link>
            </div>
          </>
        )}
        {phase.kind === "pre" && (
          <>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-ink">🗓️ {t("preTripTitle")}</p>
              <p className="text-sm text-sub mt-0.5">{t("preTripHint", { city: phase.city, date: phase.startDate })}</p>
            </div>
            <Link href={itinHref} className="gkm-focus shrink-0 inline-flex items-center min-h-11 px-4 rounded-control border border-line bg-surface text-ink text-sm font-semibold">
              {t("openPlan")}
            </Link>
          </>
        )}
        {phase.kind === "post" && (
          <>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-ink">📸 {t("postTripTitle")}</p>
              <p className="text-sm text-sub mt-0.5">{t("postTripHint")}</p>
            </div>
            <Link href={itinHref} className="gkm-focus shrink-0 inline-flex items-center min-h-11 px-4 rounded-control border border-line bg-surface text-ink text-sm font-semibold">
              {t("memories")}
            </Link>
          </>
        )}
      </div>
    </section>
  );
}
