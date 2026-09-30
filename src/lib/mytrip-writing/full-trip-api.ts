// 전체 여행 AI 글쓰기 클라이언트 — /api/mytrip/writing-full
//  load     : 저장된 지난 제안(재열람 · AI 호출·차감 0)
//  generate : 새 제안(성공하면 전체 여행 AI 글쓰기 사용권 1회). 같은 내용의 저장 결과가 있으면 그대로(0)

import { withAuthHeader } from "@/lib/auth/device-auth-headers";
import type { FullTripProposal } from "@/lib/mytrip-writing/full-trip-core";

/** 이 제안에 실제로 실린 사진(기록 id)과 싣지 못한 사진(이유) */
export interface FullTripPhotoCoverage { shown: string[]; skipped: { momentId: string; reason: string }[]; candidates: number }

/** 사용권을 쓰기 전 알리는 사진 계획 */
export interface FullTripPhotoPlan { candidates: number; will_use: number; skipped: { momentId: string; reason: string }[] }

export type FullTripResult =
  | { kind: "proposal"; proposal: FullTripProposal; photos: FullTripPhotoCoverage | null; photoPlan?: FullTripPhotoPlan | null; generationId: string | null; charged: boolean; saved: boolean; stale: boolean }
  | { kind: "none"; photoPlan: FullTripPhotoPlan | null }
  | { kind: "freeUsed"; nextFreeAt: string | null }
  | { kind: "login" }
  | { kind: "busy" }
  | { kind: "failed" };

export async function apiFullTrip(args: { itineraryId: string; deviceId: string; locale: string; mode: "load" | "generate"; forceFresh?: boolean }): Promise<FullTripResult> {
  try {
    const res = await fetch("/api/mytrip/writing-full", {
      method: "POST",
      headers: await withAuthHeader({ "Content-Type": "application/json", "x-device-id": args.deviceId }),
      body: JSON.stringify({ itineraryId: args.itineraryId, locale: args.locale, mode: args.mode, ...(args.forceFresh ? { forceFresh: true } : {}) }),
      signal: AbortSignal.timeout(60_000),
    });
    if (res.status === 401 || res.status === 403) return { kind: "login" };
    if (!res.ok) return { kind: "failed" };
    const j = (await res.json()) as { ok?: boolean; ai_status?: string; proposal?: FullTripProposal | null; photos?: FullTripPhotoCoverage | null; photo_plan?: FullTripPhotoPlan | null; generation_id?: string | null; charged?: boolean; next_free_at?: string | null; stale?: boolean | null };
    if (j.proposal) return { kind: "proposal", proposal: j.proposal, photos: j.photos ?? null, photoPlan: j.photo_plan ?? null, generationId: j.generation_id ?? null, charged: j.charged === true,
      saved: j.ai_status === "saved" || j.ai_status === "cache_server", stale: j.stale === true };
    if (j.ai_status === "none") return { kind: "none", photoPlan: j.photo_plan ?? null };
    if (j.ai_status === "fallback_quota") return { kind: "freeUsed", nextFreeAt: j.next_free_at ?? null };
    if (j.ai_status === "fallback_busy") return { kind: "busy" };
    return { kind: "failed" };
  } catch { return { kind: "failed" }; }
}

/** 이번 달 남은 전체 여행 AI 글쓰기 사용권 — 로그인 전이면 null */
export async function apiFullTripBalance(): Promise<{ remaining: number; limit: number; resetsAt: string } | null> {
  try {
    const res = await fetch("/api/mytrip/writing-full", { headers: await withAuthHeader({}) });
    if (!res.ok) return null;
    const j = (await res.json()) as { ok?: boolean; writing?: { monthly_remaining: number; monthly_limit: number }; resets_at?: string };
    return j.ok && j.writing ? { remaining: j.writing.monthly_remaining, limit: j.writing.monthly_limit, resetsAt: j.resets_at ?? "" } : null;
  } catch { return null; }
}
