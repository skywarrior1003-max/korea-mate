// 빌드 타임 city_spots 조회 (서버 전용)
//
// 왜 별도 모듈인가
//   /place/[id] 의 generateStaticParams 와 sitemap 이 **같은 장소 집합**을 써야
//   한다. 각자 쿼리를 짜면 조건이 조금만 달라져도 sitemap 에 존재하지 않는 URL 이
//   실리거나, 생성된 페이지가 sitemap 에서 빠진다. 조회를 한 곳으로 모아 그
//   불일치를 구조적으로 막는다.
//
// 공개 범위
//   is_published 컬럼이 아직 없으므로 임의의 공개 필터를 만들지 않는다.
//   지금은 city_spots 전체가 곧 공개 대상이며, 이는 현재 RLS(anon SELECT qual=true)
//   와도 일치한다. M1-A 적용 후 이 함수에 is_published=true 조건을 넣는다.
//
// Gate B (TASK-FIVE-CITY-CORE-PREPROD-GATE-V1) — 위 예약의 실제 형태
//   · generateStaticParams 는 "reference" : 숨긴 legacy 도 페이지를 만든다. 사용자의 Saved/My Trip/Story
//     가 /place/<old-id> 로 들어오는 경로를 404 로 만들지 않기 위해서다(사용자 기록 보존 우선).
//   · sitemap 은 "discovery" : 게이트가 켜지면 is_published=true 만 싣는다. sitemap ⊆ 생성 페이지 이므로
//     "sitemap 에 있는데 페이지가 없는" 불일치는 생기지 않는다(반대 방향의 부분집합은 의도된 것).
//   · 숨긴 행의 페이지는 generateMetadata 에서 robots noindex 를 받는다(page.tsx).
//
// 실패 정책
//   env 부재·네트워크 실패 시 빈 배열을 반환해 기존 빌드를 깨뜨리지 않는다.
//   그 경우 /place 페이지도 sitemap 항목도 함께 0건이 되므로 불일치는 생기지 않는다.

import type { CitySpotRow } from "@/lib/city-spots";
import { visibilityRestFilter, type VisibilityScope } from "@/lib/city-spots-visibility";

function supabaseEnv(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return { url, key };
}

/** 정적 생성·sitemap 이 공유하는 공개 장소 id 목록. scope: reference(전체) / discovery(게이트 ON 이면 published 만) */
export async function fetchPublicSpotIds(scope: VisibilityScope = "reference"): Promise<number[]> {
  const env = supabaseEnv();
  if (!env) return [];
  try {
    const res = await fetch(`${env.url}/rest/v1/city_spots?select=id&order=id${visibilityRestFilter(scope)}`, {
      headers: { apikey: env.key, Authorization: `Bearer ${env.key}` },
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as { id: number }[];
    return rows.map(r => r.id);
  } catch {
    return [];
  }
}

/** 상세 1건. id 형식이 숫자가 아니면 조회하지 않는다 */
export async function fetchSpot(id: string): Promise<CitySpotRow | null> {
  const env = supabaseEnv();
  if (!env) return null;
  if (!/^\d+$/.test(id)) return null;
  try {
    const res = await fetch(`${env.url}/rest/v1/city_spots?id=eq.${id}&limit=1`, {
      headers: { apikey: env.key, Authorization: `Bearer ${env.key}` },
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as CitySpotRow[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}
