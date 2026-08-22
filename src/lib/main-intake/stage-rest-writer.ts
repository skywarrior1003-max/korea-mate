// STAGE REST writer — PostgREST(service_role) chunk write. 실행 코드이지만 이 TASK 에서는 호출되지 않는다(Production write 0).
// (TASK-FIVE-CITY-CORE-RELEASE-PREREQUISITES-V1-R1)
//
// 왜 REST chunk 가 STAGE 에 허용되는가
//   STAGE 가 쓰는 모든 NEW 행은 is_published=false(비노출)이고, 멱등 키(source_type, external_id)로 upsert 하므로
//   chunk 중간 실패 → 재실행이 안전하다(중복 0). 트랜잭션이 필요한 것은 PUBLISH cutover 이며 그것은 SQL Editor 단일
//   트랜잭션 스크립트(publish-sql.ts)로 사람이 실행한다.
//
// 절대 규칙: DELETE 없음 · 사용자 테이블 접근 없음 · secrets 출력 없음 · fetch 는 주입 가능(테스트는 가짜 fetch).

import type { InsertAction, UpdateAction } from "./importer-core.ts";
import { CANONICAL_SOURCE_TYPE } from "./identity.ts";

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export interface RestTarget { url: string; serviceKey: string; }

export interface InsertedRow { id: number; external_id: string; }

function headers(t: RestTarget, extra: Record<string, string> = {}): Record<string, string> {
  return { apikey: t.serviceKey, Authorization: `Bearer ${t.serviceKey}`, "Content-Type": "application/json", ...extra };
}

/** NEW chunk: upsert on (source_type, external_id) — 재실행 시 기존 행을 갱신할 뿐 새 행을 만들지 않는다. 실제 id 를 돌려받는다. */
export async function stageInsertChunk(fetchLike: FetchLike, t: RestTarget, rows: InsertAction[]): Promise<InsertedRow[]> {
  const body = rows.map(r => {
    if (r.row.source_type !== CANONICAL_SOURCE_TYPE || typeof r.row.external_id !== "string") throw new Error(`INSERT ${r.canonical_id} lacks canonical identity`);
    if (r.row.is_published !== false) throw new Error(`STAGE insert must be is_published=false (${r.canonical_id})`);
    return r.row;
  });
  const res = await fetchLike(`${t.url}/rest/v1/city_spots?on_conflict=source_type,external_id&select=id,external_id`, {
    method: "POST", headers: headers(t, { Prefer: "resolution=merge-duplicates,return=representation" }), body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`stage insert chunk failed: HTTP ${res.status}`);
  const out = JSON.parse(await res.text()) as InsertedRow[];
  if (out.length !== rows.length) throw new Error(`stage insert chunk returned ${out.length} rows for ${rows.length}`);
  return out;
}

/** MATCH_REPLACE: 기존 numeric id 로 PATCH. source-owned 필드만(plan.writes). is_published 는 보내지 않는다(STAGE 계약). */
export async function stageUpdateRow(fetchLike: FetchLike, t: RestTarget, u: UpdateAction): Promise<void> {
  const writes = { ...u.writes };
  delete writes.is_published;   // STAGE 에서는 visibility 를 바꾸지 않는다 — 056 backfill 의 true 를 유지
  const res = await fetchLike(`${t.url}/rest/v1/city_spots?id=eq.${u.main_city_spot_id}`, {
    method: "PATCH", headers: headers(t, { Prefer: "return=minimal" }), body: JSON.stringify(writes),
  });
  if (!res.ok) throw new Error(`stage update #${u.main_city_spot_id} failed: HTTP ${res.status}`);
}

/** resume 용: external_id 집합 중 이미 DB 에 있는 것(→ 실제 id) */
export async function lookupExistingByExternalIds(fetchLike: FetchLike, t: RestTarget, externalIds: readonly string[]): Promise<InsertedRow[]> {
  if (externalIds.length === 0) return [];
  const list = externalIds.map(e => `"${e.replace(/"/g, "")}"`).join(",");
  const res = await fetchLike(`${t.url}/rest/v1/city_spots?select=id,external_id&source_type=eq.${CANONICAL_SOURCE_TYPE}&external_id=in.(${encodeURIComponent(list)})`, { method: "GET", headers: headers(t) });
  if (!res.ok) throw new Error(`lookup failed: HTTP ${res.status}`);
  return JSON.parse(await res.text()) as InsertedRow[];
}
