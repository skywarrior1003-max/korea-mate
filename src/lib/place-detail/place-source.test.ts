/**
 * TASK-FIVE-CITY-CORE-PUBLISH-READINESS-HARDENING-V1 — place-source fetch freshness contract
 * Run: node --experimental-strip-types --test src/lib/place-detail/place-source.test.ts
 *
 * 배경: Next 정적 생성은 옵션 없는 fetch() 를 Data Cache(revalidate 1년)에 저장하고 다음 빌드에서 재사용한다.
 * STAGE BUILD 에서 2026-08-12 캐시 응답이 R3 이후 빌드에 쓰여 legacy /place 페이지가 pre-R3 내용으로 렌더됐다.
 * 여기서는 fetch 에 전달되는 RequestInit 을 가로채 계약을 고정한다(네트워크·DB 없음).
 *   CACHE-1 long-lived cache 옵션(force-cache / next.revalidate) 을 쓰지 않고 `cache: "no-store"` 를 보낸다
 *   CACHE-2 같은 URL 에 대해 fetch 가 돌려주는 "현재" 응답이 그대로 결과가 된다(이전 표현을 고정하는 메모이제이션 없음)
 *   CACHE-3 discovery 는 is_published=eq.true, reference 는 필터 없음 — visibility 계약 불변
 *   CACHE-4 정적 export 계약: /place/[id] 는 dynamicParams=false + dynamic="force-static", sitemap 은 force-static
 *   CACHE-5 keyset pagination 계약 불변(id>after · order id.asc · limit 1000 · 다음 페이지 이어 읽기)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fetchPublicSpotIds, fetchSpot, PLACE_FETCH_CACHE_POLICY } from "./place-source.ts";

type Call = { url: string; init: RequestInit | undefined };

function withFetch<T>(responder: (url: string) => unknown, run: () => Promise<T>): Promise<{ result: T; calls: Call[] }> {
  const calls: Call[] = [];
  const original = globalThis.fetch;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test-key";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return new Response(JSON.stringify(responder(url)), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return run().then(result => ({ result, calls })).finally(() => { globalThis.fetch = original; });
}

test("CACHE-1 · 정책 상수는 no-store 이고 두 조회 모두 그 정책으로 fetch 한다(장기 cache 옵션 0)", async () => {
  assert.equal(PLACE_FETCH_CACHE_POLICY, "no-store");
  const { calls } = await withFetch(url => (url.includes("id=eq.") ? [{ id: 607, name: "Whasoo Brewery" }] : []), async () => {
    await fetchSpot("607");
    await fetchPublicSpotIds("reference");
  });
  assert.equal(calls.length, 2);
  for (const c of calls) {
    assert.equal(c.init?.cache, "no-store", `${c.url} must be no-store`);
    assert.equal((c.init as { next?: unknown } | undefined)?.next, undefined, "next.revalidate 같은 장기 캐시 힌트를 보내지 않는다");
  }
});

test("CACHE-2 · 같은 URL 이라도 현재 응답이 결과다(이전 표현 고정 없음)", async () => {
  let version = 0;
  const { result } = await withFetch(() => [{ id: 607, name: version === 0 ? "화수브루어리" : "Whasoo Brewery" }], async () => {
    const before = await fetchSpot("607");
    version = 1;
    const after = await fetchSpot("607");
    return { before: before?.name, after: after?.name };
  });
  assert.equal(result.before, "화수브루어리");
  assert.equal(result.after, "Whasoo Brewery");
});

test("CACHE-3 · visibility 계약 불변: discovery 만 is_published=eq.true, reference 는 필터 없음", async () => {
  const { calls } = await withFetch(() => [], async () => {
    await fetchPublicSpotIds("discovery");
    await fetchPublicSpotIds("reference");
  });
  assert.equal(calls.length, 2);
  assert.ok(calls[0].url.includes("&is_published=eq.true"), "discovery 는 published 만");
  assert.ok(!calls[1].url.includes("is_published"), "reference 는 숨긴 행도 포함(사용자 기록 보존)");
  assert.equal(calls[0].init?.cache, "no-store");
  assert.equal(calls[1].init?.cache, "no-store");
});

test("CACHE-4 · 정적 export 계약: /place/[id] force-static + dynamicParams=false, sitemap force-static", () => {
  const page = readFileSync(new URL("../../app/place/[id]/page.tsx", import.meta.url), "utf8");
  const sitemap = readFileSync(new URL("../../app/sitemap.ts", import.meta.url), "utf8");
  assert.match(page, /export const dynamicParams = false/);
  assert.match(page, /export const dynamic = "force-static"/);
  assert.match(sitemap, /export const dynamic = "force-static"/);
  const source = readFileSync(new URL("./place-source.ts", import.meta.url), "utf8");
  assert.ok(!/force-cache|revalidate\s*:/.test(source), "place-source 에 장기 캐시 옵션이 없다");
});

test("CACHE-5 · keyset pagination 계약 불변(1,000 단위로 끝까지, id 오름차순)", async () => {
  const ids = Array.from({ length: 2_345 }, (_, i) => i + 1);
  const { result, calls } = await withFetch(url => {
    const after = Number((url.match(/id=gt\.(\d+)/) ?? [])[1]);
    const limit = Number((url.match(/limit=(\d+)/) ?? [])[1]);
    return ids.filter(id => id > after).slice(0, limit).map(id => ({ id }));
  }, () => fetchPublicSpotIds("reference"));
  assert.equal(result.length, 2_345);
  assert.deepEqual(result.slice(0, 3), [1, 2, 3]);
  assert.equal(result[2_344], 2_345);
  assert.equal(calls.length, 3, "1,000 · 1,000 · 345 — 세 페이지");
  for (const c of calls) {
    assert.match(c.url, /&order=id\.asc&limit=1000$/);
    assert.equal(c.init?.cache, "no-store");
  }
});
