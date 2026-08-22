/**
 * TASK-FIVE-CITY-CORE-RELEASE-PREREQUISITES-V1-R1 — keyset pagination 의 규모 독립성
 * Run: node --experimental-strip-types --test src/lib/city-spots-paging.test.ts
 *
 * synthetic: 999 / 1,000 / 1,001 / 1,837 / 4,675 / 4,908 / 10,000 / 20,000 / 50,000 행 — 반환=기대, 중복 0, 누락 0, 결정적.
 * (실제 DB/페이지 빌드가 아니라 pagination 계층의 synthetic 검증이다)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collectAllKeyset, keysetRestSuffix, chunk, uniqueNumericIds, PagingGuardError, MAX_PAGES, DEFAULT_PAGE_SIZE } from "./city-spots-paging.ts";

const ROOT = new URL("../../", import.meta.url);

/** PostgREST 처럼 "id>after · id asc · limit" 만 이해하는 가짜 서버. serverCap 은 Max Rows(기본 1,000) 를 흉내낸다 */
function fakeServer(ids: number[], serverCap = 1000) {
  const sorted = [...ids].sort((a, b) => a - b);
  let calls = 0;
  const fetchPage = async (afterId: number, pageSize: number) => {
    calls += 1;
    return sorted.filter(id => id > afterId).slice(0, Math.min(pageSize, serverCap)).map(id => ({ id }));
  };
  return { fetchPage, calls: () => calls };
}

/** 현실적인 id 분포: 연속이 아니라 구멍이 있다(삭제·legacy·여러 package) */
function sparseIds(n: number, seed = 7): number[] {
  const out: number[] = []; let id = 0; let x = seed;
  for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) % 2147483648; id += 1 + (x % 3); out.push(id); }
  return out;
}

for (const n of [0, 1, 999, 1000, 1001, 1837, 4675, 4908, 10000, 20000, 50000]) {
  test(`P1: synthetic ${n} rows — returned == expected, unique == expected, duplicate 0, missing 0, deterministic`, async () => {
    const ids = sparseIds(n);
    const srv = fakeServer(ids);
    const a = await collectAllKeyset(srv.fetchPage);
    assert.equal(a.length, n);
    assert.equal(new Set(a.map(r => r.id)).size, n);
    assert.deepEqual(a.map(r => r.id), ids);   // missing 0 · 순서 보존
    const b = await collectAllKeyset(fakeServer(ids).fetchPage);
    assert.deepEqual(a, b);
    assert.equal(srv.calls(), Math.floor(n / DEFAULT_PAGE_SIZE) + 1);   // n/1000 페이지 + 종료 페이지
  });
}

test("P2: 서버가 1,000 에서 조용히 잘라도(Max Rows) keyset 은 끝까지 읽는다 — 50k 에서 pageSize 1,000", async () => {
  const ids = sparseIds(50000);
  const a = await collectAllKeyset(fakeServer(ids, 1000).fetchPage, { pageSize: 1000 });
  assert.equal(a.length, 50000);
  // 서버 cap 이 500 으로 더 낮아 페이지가 pageSize 보다 항상 작게 오면: 첫 페이지(500<1000)에서 종료 → 절단을 **감지해야** 한다.
  // 이 경우 collectAllKeyset 은 "pageSize 미만 = 끝" 규약을 따르므로 호출자는 pageSize ≤ 서버 cap 을 써야 한다.
  // 규약 위반을 테스트로 고정: pageSize 가 서버 cap 보다 크면 결과가 짧아진다 → 운영 pageSize 는 DEFAULT_PAGE_SIZE(1000)=Supabase 기본 Max Rows 와 같게 둔다.
  const short = await collectAllKeyset(fakeServer(ids, 500).fetchPage, { pageSize: 1000 });
  assert.equal(short.length, 500);
  assert.equal(DEFAULT_PAGE_SIZE, 1000);
});

test("P3: guard — 규모 독립 safety(MAX_PAGES=1000) · 초과 시 부분 결과 대신 명시적 실패 · 정렬 위반 실패 · 초과 반환 실패", async () => {
  assert.equal(MAX_PAGES, 1000);
  assert.ok(MAX_PAGES * DEFAULT_PAGE_SIZE >= 1_000_000, "1M 행까지는 guard 에 닿지 않는다");
  // 서버가 항상 같은 페이지를 돌려주면(버그) → MAX_PAGES 에서 실패
  await assert.rejects(collectAllKeyset(async () => [{ id: 1 }], { pageSize: 1, maxPages: 3 }), PagingGuardError);
  // 정렬 무시
  await assert.rejects(collectAllKeyset(async () => [{ id: 5 }, { id: 3 }], { pageSize: 10 }), PagingGuardError);
  // after 이하 id 반환
  await assert.rejects(collectAllKeyset(async (after) => (after === 0 ? [{ id: 1 }, { id: 2 }] : [{ id: 2 }]), { pageSize: 2 }), PagingGuardError);
  // pageSize 초과 반환
  await assert.rejects(collectAllKeyset(async () => [{ id: 1 }, { id: 2 }, { id: 3 }], { pageSize: 2 }), PagingGuardError);
});

test("P4: REST suffix · chunk · uniqueNumericIds", () => {
  assert.equal(keysetRestSuffix(0, 1000), "&id=gt.0&order=id.asc&limit=1000");
  assert.equal(keysetRestSuffix(1342, 1000), "&id=gt.1342&order=id.asc&limit=1000");
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.equal(chunk(Array.from({ length: 50000 }, (_, i) => i), 200).length, 250);
  assert.throws(() => chunk([1], 0), PagingGuardError);
  assert.deepEqual(uniqueNumericIds(["12", 12, "mock-3", "local-7", null, undefined, " 5 ", "5", "abc"]), [5, 12]);
});

test("P5: 소비처 배선 — 전량 조회는 keyset, hydration 은 id 조회, 플래너/근처는 bbox+keyset, 5페이지 같은 규모 상한 없음", () => {
  const read = (p: string) => readFileSync(new URL(p, ROOT), "utf8");
  const cs = read("src/lib/city-spots.ts");
  assert.equal((cs.match(/collectAllKeyset</g) ?? []).length, 2, "fetchCitySpots · fetchCitySpotsByCategory");
  assert.match(cs, /export async function fetchCitySpotsByIds/);
  assert.match(cs, /\.in\("id", part\)/);
  const ps = read("src/lib/place-detail/place-source.ts");
  assert.match(ps, /collectAllKeyset<\{ id: number \}>/); assert.match(ps, /keysetRestSuffix\(afterId, pageSize\)/);
  assert.match(read("functions/api/trip/plan.ts"), /collectAllKeyset<\{ id: number \}>/);
  assert.match(read("src/lib/near-me/candidate-generator.ts"), /collectAllKeyset<Row>/);
  for (const p of ["src/app/itinerary/page.tsx", "src/components/ItineraryDayMap.tsx"]) {
    const src = read(p);
    assert.ok(!/fetchCitySpots\(/.test(src), `${p}: 도시 전량 조회 금지`);
    assert.match(src, /fetchCitySpotsByIds\(/); assert.match(src, /hydrationKey/);
  }
  // 규모 상한 흔적 없음
  for (const p of ["src/lib/city-spots-paging.ts", "src/lib/city-spots.ts", "src/lib/place-detail/place-source.ts"]) {
    assert.ok(!/maxPages:\s*[0-9]\b|4908|4675|1837/.test(read(p)), `${p}: 현재 규모 상수 금지`);
  }
});
