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

//
// Freshness (TASK-FIVE-CITY-CORE-PUBLISH-READINESS-HARDENING-V1)
//   Next 는 정적 생성 중 옵션 없는 fetch() 를 "auto cache"(revalidate = 1년) 로 Data Cache(`.next/cache/fetch-cache`)
//   에 저장하고, 같은 URL 이면 **다음 빌드에서도** 그 응답을 재사용한다. STAGE BUILD 에서 2026-08-12 에 캐시된
//   `fetchSpot()` 응답이 R3 이후 빌드에 그대로 쓰여 legacy 714 페이지가 pre-R3 내용으로 렌더된 것이 실측됐다.
//   Production DB 가 release source of truth 이므로 이 모듈의 두 조회는 `cache: "no-store"` 로 Data Cache 를
//   읽지도 쓰지도 않는다(PLACE_FETCH_CACHE_POLICY). 정적 export 와의 호환은 /place/[id] 의
//   `dynamic = "force-static"` 이 담당한다(no-store 가 정적 생성을 dynamic 으로 bail 시키지 않음 — sitemap 은 이미 force-static).
//   visibility scope·keyset·실패 정책은 바꾸지 않는다.

import type { CitySpotRow } from "@/lib/city-spots";
// 값 import 는 상대 경로 — node --test(strip-types) 가 `@/` alias 를 해석하지 못해 place-source.test.ts 가 이 모듈을 직접
// 실행할 수 있도록 한다(다른 테스트 대상 lib 모듈과 같은 관례). 해석 결과는 동일 파일이며 동작 변화 없음.
import { visibilityRestFilter, type VisibilityScope } from "../city-spots-visibility.ts";
import { collectAllKeyset, keysetRestSuffix } from "../city-spots-paging.ts";

/** 빌드/런타임 place 조회의 fetch cache 정책 — Data Cache 재사용 금지(장기 stale 방지). 테스트가 이 값을 검증한다. */
export const PLACE_FETCH_CACHE_POLICY = "no-store" as const;

function supabaseEnv(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return { url, key };
}

/**
 * 정적 생성·sitemap 이 공유하는 공개 장소 id 목록. scope: reference(전체) / discovery(게이트 ON 이면 published 만)
 * R1 SCALE: FULL COLLECTION — keyset 으로 끝까지 읽는다(1,000행 상한 없음). 4,908 이든 50,000 이든 같은 루프.
 * 실패 정책 유지: env 부재/네트워크 실패 → 빈 배열(페이지·sitemap 이 함께 0건이라 불일치 없음). paging guard 초과는 실패로 취급.
 */
export async function fetchPublicSpotIds(scope: VisibilityScope = "reference"): Promise<number[]> {
  const env = supabaseEnv();
  if (!env) return [];
  try {
    const rows = await collectAllKeyset<{ id: number }>(async (afterId, pageSize) => {
      const res = await fetch(`${env.url}/rest/v1/city_spots?select=id${visibilityRestFilter(scope)}${keysetRestSuffix(afterId, pageSize)}`, {
        headers: { apikey: env.key, Authorization: `Bearer ${env.key}` },
        cache: PLACE_FETCH_CACHE_POLICY,
      });
      if (!res.ok) throw new Error(`city_spots id page failed: HTTP ${res.status}`);
      return (await res.json()) as { id: number }[];
    });
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
      cache: PLACE_FETCH_CACHE_POLICY,
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as CitySpotRow[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}
