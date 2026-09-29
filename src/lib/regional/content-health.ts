// 행사·Travel Essentials 주간 확인 상태 판정 — /api/health/content 와 가드가 공유 (REGIONAL-CONTENT-FRESHNESS-V1)

export type Check = { date: string };
export type Place = { validFrom: string | null; validTo: string | null };
export type Essential = { reviewBy: string | null };

const DAY = 86_400_000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** 순수 판정(가드가 직접 검사) — today 는 KST 기준 YYYY-MM-DD */
export function judgeContentHealth(
  f: { cadence_days: number; grace_days: number; checks: Check[] },
  placeRows: Place[], essentialRows: Essential[], today: string,
): { ok: boolean; state: string; last_check: string | null; days_since: number | null; undated_events: number; review_overdue: number } {
  const last = f.checks.map(c => c.date).filter(d => ISO.test(d)).sort().pop() ?? null;
  const days = last ? Math.floor((Date.parse(today) - Date.parse(last)) / DAY) : null;
  const undated = placeRows.filter(p => (p.validFrom !== null || p.validTo !== null)
    && !(p.validTo && ISO.test(p.validTo)) && !(p.validFrom && /^\d{4}-\d{2}/.test(p.validFrom))).length;
  const reviewOverdue = essentialRows.filter(e => e.reviewBy && ISO.test(e.reviewBy) && e.reviewBy < today).length;
  const base = { last_check: last, days_since: days, undated_events: undated, review_overdue: reviewOverdue };
  if (days === null || days > f.cadence_days + f.grace_days) return { ok: false, state: "weekly_check_overdue", ...base };
  if (undated > 0) return { ok: false, state: "event_without_end_date", ...base };
  if (reviewOverdue > 0) return { ok: false, state: "essentials_review_overdue", ...base };
  return { ok: true, state: "ok", ...base };
}
