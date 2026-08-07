// whole-trip 개인화 프로필을 가져오는 클라이언트 헬퍼.
//
// 규칙은 하나다. **여행 하나당 한 번만 부른다.**
//   3일 여행도 1회, 7일도 1회, 14일도 1회. 날짜 수와 무관하다.
//   날짜 루프 안에서 부르면 안 된다 — 과거 비용 사고가 그 모양이었다.
//
// 실패는 전부 조용히 넘긴다. 프로필이 없으면 규칙 기반 스케줄러가 그대로 돌고
// 사용자는 아무 차이도 느끼지 않는다. 개인화 실패가 일정 생성 실패가 되면 안 된다.
//
// 재시도는 없다. 여기서도, 서버에서도.

import type { PersonalizationProfile } from "@/lib/scheduler/ai/personalization-profile";

export interface PersonalizeRequest {
  city:                string;
  locale:              string;
  start_date:          string;
  end_date:            string;
  travel_style:        string;
  travelers:           string;
  pace:                string;
  selected_place_ids:  string[];
  liked_place_ids:     string[];
  selected_places:     { place_id: string; name?: string; category?: string }[];
}

/**
 * 같은 여행 조건이면 같은 키. 한 생성 흐름 안에서 같은 키로 두 번 부르지 않는다.
 * 개인정보는 넣지 않는다 — 도시·날짜·고른 장소·여행 조건뿐이다.
 */
export function personalizationRequestKey(r: PersonalizeRequest): string {
  return [
    r.city, r.start_date, r.end_date, r.travel_style, r.travelers, r.pace,
    [...r.selected_place_ids].sort().join(","),
  ].join("|");
}

/** 한 생성 흐름 안에서의 중복 차단. 프로세스 전역 exactly-once 를 주장하지 않는다. */
const inFlight = new Map<string, Promise<PersonalizationProfile | null>>();

export async function fetchPersonalizationProfile(
  req: PersonalizeRequest,
): Promise<PersonalizationProfile | null> {
  const key = personalizationRequestKey(req);

  const existing = inFlight.get(key);
  if (existing) return existing;   // 같은 흐름의 중복 호출 — 서버로 다시 나가지 않는다

  const p = (async (): Promise<PersonalizationProfile | null> => {
    try {
      const res = await fetch("/api/trip/personalize", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ ...req, request_id: key }),
      });
      if (!res.ok) return null;                       // 재시도하지 않는다
      const body = await res.json() as { profile?: PersonalizationProfile | null };
      return body.profile ?? null;
    } catch {
      return null;                                   // 네트워크 실패도 그냥 넘어간다
    }
  })();

  inFlight.set(key, p);
  // 흐름이 끝나면 키를 놓아준다. 사용자가 명시적으로 다시 만들면 새 요청이다.
  void p.finally(() => { setTimeout(() => inFlight.delete(key), 0); });
  return p;
}

/** 테스트 전용 — 흐름 간 격리 */
export function __resetPersonalizeCache(): void { inFlight.clear(); }
