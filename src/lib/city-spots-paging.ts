// city_spots 전량 수집용 keyset pagination — 순수 함수 (supabase 의존 없음)
// (TASK-FIVE-CITY-CORE-RELEASE-PREREQUISITES-V1-R1 · SCALE_READINESS_SCOPE=RELEASE_PIPELINE_CEILING_REMOVAL_ONLY)
//
// 왜
//   Supabase/PostgREST 는 한 요청을 기본 1,000행(프로젝트 Max Rows)에서 **조용히** 자른다. 5도시 통합 후
//   Seoul 1,837 · 전체 4,908 이 되면 Explore 목록·/place 정적 경로·sitemap 이 절단된다. Dashboard 의 Max Rows 를
//   올리는 것은 보조 장치일 뿐(SUPABASE_MAX_ROWS_SETTING_RELIED_ON=NO) — 코드가 끝까지 읽어야 한다.
//
// 방식: keyset (id ASC · id > last_seen_id). offset 과 달리 행 수와 무관하게 결정적이며 중복/누락이 없다.
//   · 한 페이지가 pageSize 미만이면 끝.
//   · MAX_PAGES 는 "현재 규모" 가 아니라 무한루프 방지용 safety guard 다(1,000 페이지 × 1,000 행 = 1,000,000 행).
//     guard 에 닿으면 부분 결과를 돌려주지 않고 **명시적으로 실패**한다.
//   · 페이지 안의 id 는 반드시 오름차순·이전 페이지보다 커야 한다(서버가 정렬을 무시했으면 실패).
//
// 두 가지 모드를 구분한다 (R1 §5)
//   FULL COLLECTION  : /place static params · sitemap · 빌드/검증 — 이 모듈로 전량.
//   BOUNDED QUERY    : Explore · Planner · Near Me — city/bbox/category 로 먼저 줄인 뒤, 그 결과가 1,000 을 넘어도
//                      잘리지 않도록 같은 keyset 루프를 쓴다(범위를 넓히는 도구가 아니다).

export const DEFAULT_PAGE_SIZE = 1000;
export const MAX_PAGES = 1000;

export class PagingGuardError extends Error {
  constructor(message: string) { super(message); this.name = "PagingGuardError"; }
}

export type KeysetPageFetcher<T> = (afterId: number, pageSize: number) => Promise<T[]>;

export interface CollectOptions { pageSize?: number; maxPages?: number; }

/** id 오름차순 keyset 으로 끝까지 모은다. pageSize 미만 페이지가 나오면 종료. */
export async function collectAllKeyset<T extends { id: number }>(fetchPage: KeysetPageFetcher<T>, opts: CollectOptions = {}): Promise<T[]> {
  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
  const maxPages = opts.maxPages ?? MAX_PAGES;
  if (!(pageSize > 0)) throw new PagingGuardError(`invalid pageSize ${pageSize}`);
  const out: T[] = [];
  let after = 0;
  for (let page = 0; ; page++) {
    if (page >= maxPages) throw new PagingGuardError(`keyset paging exceeded MAX_PAGES=${maxPages} (pageSize=${pageSize}, collected=${out.length}) — refusing partial result`);
    const rows = await fetchPage(after, pageSize);
    if (rows.length > pageSize) throw new PagingGuardError(`page ${page} returned ${rows.length} > pageSize ${pageSize}`);
    let prev = after;
    for (const r of rows) {
      if (typeof r.id !== "number" || !(r.id > prev)) throw new PagingGuardError(`page ${page}: ids must be strictly ascending and > ${after} (got ${String(r.id)} after ${prev})`);
      prev = r.id;
      out.push(r);
    }
    if (rows.length < pageSize) return out;
    after = prev;
  }
}

/** PostgREST URL 용 keyset 조각 — base 에는 select/필터가 이미 들어 있고, 여기서 id>after·정렬·limit 을 붙인다 */
export function keysetRestSuffix(afterId: number, pageSize: number): string {
  return `&id=gt.${afterId}&order=id.asc&limit=${pageSize}`;
}

/** 배열 분할 — STAGE chunk · `.in("id", …)` 조회 chunk 에 공통 사용. 크기 독립. */
export function chunk<T>(arr: readonly T[], size: number): T[][] {
  if (!(size > 0)) throw new PagingGuardError(`invalid chunk size ${size}`);
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** 일정의 place_id(문자열/숫자 혼재·mock-/local- 접두 포함)에서 city_spots 숫자 id 만 유일하게 추린다 */
export function uniqueNumericIds(ids: ReadonlyArray<string | number | null | undefined>): number[] {
  const set = new Set<number>();
  for (const raw of ids) {
    if (raw === null || raw === undefined) continue;
    const s = String(raw).trim();
    if (!/^\d+$/.test(s)) continue;
    set.add(Number(s));
  }
  return [...set].sort((a, b) => a - b);
}

/** `.in("id", chunk)` 한 번에 넣는 id 수 — URL 길이(PostgREST GET)와 응답 크기를 고려한 고정값. 데이터 총량과 무관. */
export const ID_LOOKUP_CHUNK = 200;
