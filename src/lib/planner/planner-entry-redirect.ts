// /planner → This Trip(Picks) 일원화 (Owner 2026-09-12)
//
// V1 플래너 폼과 Picks 의 This Trip 이 같은 일을 두 군데서 하고 있었다.
// Owner 결정: 스케줄러 진입은 This Trip 하나다. /planner 는 기존 링크·클론
// 딥링크의 의미만 승계해 /picks 로 보낸다.
//
//  · ?city=          → /picks?city=<Canonical> (This Trip 시작 카드 preselect)
//  · ?ref=clone&city=&from=&to=  → TripDraft 를 만들어 여행이 "시작된 상태"로
//    /picks 착지 — V1 폼의 클론 prefill 과 같은 의미(가입·재입력 없이 이어감).
//  · 그 외/모르는 도시 → /picks (아무것도 지어내지 않는다)
//
// 순수 함수다 — draft 쓰기는 호출측(client)이 한다.

export const PLANNER_CITIES = ["Busan", "Seoul", "Jeju", "Gyeongju", "Jeonju"] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface PlannerEntryResolution {
  href: string;
  /** 있으면 착지 전에 writeTripDraft 로 저장한다(클론 승계). */
  draft?: { city: string; startDate: string; endDate: string; travelers: string };
}

function canonicalCity(raw: string | null): string | null {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v) return null;
  return PLANNER_CITIES.find(c => c.toLowerCase() === v) ?? null;
}

export function resolvePlannerEntry(search: string): PlannerEntryResolution {
  let p: URLSearchParams;
  try { p = new URLSearchParams(search); } catch { return { href: "/picks" }; }
  const city = canonicalCity(p.get("city"));
  const from = (p.get("from") ?? "").trim();
  const to = (p.get("to") ?? "").trim();

  if (p.get("ref") === "clone" && city && DATE_RE.test(from) && DATE_RE.test(to) && from <= to) {
    return { href: "/picks", draft: { city, startDate: from, endDate: to, travelers: "1" } };
  }
  if (city) return { href: `/picks?city=${encodeURIComponent(city)}` };
  return { href: "/picks" };
}
