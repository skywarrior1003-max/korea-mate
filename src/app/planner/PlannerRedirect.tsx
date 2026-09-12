"use client";

// /planner 는 더 이상 자체 폼을 그리지 않는다 — This Trip(Picks)으로 승계 이동.
// (Owner 2026-09-12 스케줄러 일원화. PlannerClient 는 참조·가드 테스트용으로
//  파일만 남고 route 에서 내려갔다.)
//
// layout effect 인 이유: V1 폼이 한 프레임이라도 그려지면 안 된다(기존
// PlannerClient 의 redirect 관례와 동일).

import { useLayoutEffect } from "react";
import { useRouter } from "next/navigation";
import { resolvePlannerEntry } from "@/lib/planner/planner-entry-redirect";
import { writeTripDraft } from "@/lib/trip-draft/trip-draft-core";

export default function PlannerRedirect() {
  const router = useRouter();
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const r = resolvePlannerEntry(window.location.search);
    if (r.draft) writeTripDraft({ ...r.draft });
    router.replace(r.href);
  }, [router]);
  // 리다이렉트 순간의 빈 화면 — 아무 것도 주장하지 않는다
  return <div className="min-h-screen" aria-hidden />;
}
