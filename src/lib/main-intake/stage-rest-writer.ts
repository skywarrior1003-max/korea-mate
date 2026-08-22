// STAGE REST writer — PostgREST(service_role) chunk write. 실행 코드이지만 이 TASK 에서는 호출되지 않는다(Production write 0).
// (TASK-FIVE-CITY-CORE-RELEASE-PREREQUISITES-V1-R1 → TASK-FIVE-CITY-CORE-POSTGREST-CONFLICT-COMPATIBILITY-V1)
//
// 왜 PostgREST `on_conflict=source_type,external_id` 를 쓰지 않는가 (POSTGREST_ON_CONFLICT_COMPATIBLE=NO)
//   Production 실측(pg_indexes): `CREATE UNIQUE INDEX idx_city_spots_source_external ON public.city_spots (source_type, external_id)
//   WHERE (external_id IS NOT NULL)` — **partial** unique index(제약 아님). PostgreSQL 은 partial index 를 ON CONFLICT 의 arbiter 로
//   추론하려면 `ON CONFLICT (source_type, external_id) WHERE external_id IS NOT NULL` 처럼 predicate 가 필요하다.
//   EXPLAIN 실측: predicate 없음 → `42P10 there is no unique or exclusion constraint matching the ON CONFLICT specification`,
//   predicate 있음 → `Conflict Arbiter Indexes: idx_city_spots_source_external`. PostgREST `on_conflict` 는 predicate 를 줄 수 없다.
//   → 첫 STAGE chunk 부터 42P10 으로 실패했을 것. upsert 대신 **lookup-before-insert + unique-conflict recovery** 를 쓴다.
//
// STAGE identity flow (retry-safe · duplicate-safe · actual id deterministic)
//   1. chunk 의 external_id 들로 기존 행 조회(source_type=canonical) → 있으면 INSERT 하지 않고 그 numeric id 를 mapping 에 사용
//   2. 없는 것만 plain INSERT(`Prefer: return=representation`) → 실제 id
//   3. INSERT 가 unique 충돌(409/23505)하면 중복 생성이 아니다 — 같은 identity 로 재조회해 정확히 1행이면 그 id, 0 또는 >1 이면 안전 실패
//   partial unique index 는 그대로 DB-level 최종 중복 방지 역할을 한다. name/address/좌표는 identity 가 아니다.
//
// 절대 규칙: DELETE 없음 · 사용자 테이블 접근 없음 · secrets 출력 없음 · fetch 는 주입 가능(테스트는 가짜 fetch).

import type { InsertAction, UpdateAction } from "./importer-core.ts";
import { CANONICAL_SOURCE_TYPE } from "./identity.ts";

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export interface RestTarget { url: string; serviceKey: string; }

export interface InsertedRow { id: number; external_id: string; }
export interface StagedIdentity { canonical_id: string; external_id: string; id: number; reused_existing: boolean; }

export class StageIdentityError extends Error {
  constructor(message: string) { super(message); this.name = "StageIdentityError"; }
}

function headers(t: RestTarget, extra: Record<string, string> = {}): Record<string, string> {
  return { apikey: t.serviceKey, Authorization: `Bearer ${t.serviceKey}`, "Content-Type": "application/json", ...extra };
}

/** canonical identity 로 기존 행 조회 (source_type=canonical AND external_id IN …). 사용자 데이터 없음. */
export async function lookupExistingByExternalIds(fetchLike: FetchLike, t: RestTarget, externalIds: readonly string[]): Promise<InsertedRow[]> {
  if (externalIds.length === 0) return [];
  const list = externalIds.map(e => `"${e.replace(/"/g, "")}"`).join(",");
  const res = await fetchLike(`${t.url}/rest/v1/city_spots?select=id,external_id&source_type=eq.${CANONICAL_SOURCE_TYPE}&external_id=in.(${encodeURIComponent(list)})`, { method: "GET", headers: headers(t) });
  if (!res.ok) throw new StageIdentityError(`lookup failed: HTTP ${res.status}`);
  return JSON.parse(await res.text()) as InsertedRow[];
}

function isUniqueConflict(status: number, bodyText: string): boolean {
  return status === 409 || /23505|duplicate key/i.test(bodyText);
}

/**
 * NEW chunk — lookup-before-insert.
 *   · 이미 있는 identity 는 재사용(INSERT 0) · 없는 것만 INSERT · unique 충돌은 재조회로 복구(정확히 1행) · 0/>1 이면 실패.
 *   · 모든 행은 source_type=canonical · external_id 존재 · is_published=false 여야 한다(STAGE 계약).
 */
export async function stageInsertChunkSafe(fetchLike: FetchLike, t: RestTarget, rows: InsertAction[]): Promise<StagedIdentity[]> {
  const byExt = new Map<string, InsertAction>();
  for (const r of rows) {
    if (r.row.source_type !== CANONICAL_SOURCE_TYPE || typeof r.row.external_id !== "string" || !r.row.external_id) throw new StageIdentityError(`INSERT ${r.canonical_id} lacks canonical identity`);
    if (r.row.is_published !== false) throw new StageIdentityError(`STAGE insert must be is_published=false (${r.canonical_id})`);
    if (byExt.has(r.row.external_id)) throw new StageIdentityError(`duplicate external_id in chunk: ${r.row.external_id}`);
    byExt.set(r.row.external_id, r);
  }
  const exts = [...byExt.keys()];
  const out = new Map<string, StagedIdentity>();

  // 1. 기존 행 재사용
  const existing = await lookupExistingByExternalIds(fetchLike, t, exts);
  const seen = new Map<string, number[]>();
  for (const e of existing) seen.set(e.external_id, [...(seen.get(e.external_id) ?? []), e.id]);
  for (const [ext, ids] of seen) {
    if (ids.length !== 1) throw new StageIdentityError(`ambiguous identity ${ext}: ${ids.length} rows`);
    out.set(ext, { canonical_id: byExt.get(ext)!.canonical_id, external_id: ext, id: ids[0]!, reused_existing: true });
  }

  // 2. 없는 것만 INSERT (on_conflict 미사용 — partial unique index 는 PostgREST 가 추론하지 못한다)
  const missing = exts.filter(e => !out.has(e));
  if (missing.length > 0) {
    const body = missing.map(e => byExt.get(e)!.row);
    const res = await fetchLike(`${t.url}/rest/v1/city_spots?select=id,external_id`, {
      method: "POST", headers: headers(t, { Prefer: "return=representation" }), body: JSON.stringify(body),
    });
    if (res.ok) {
      const inserted = JSON.parse(await res.text()) as InsertedRow[];
      if (inserted.length !== missing.length) throw new StageIdentityError(`insert returned ${inserted.length} rows for ${missing.length}`);
      for (const r of inserted) {
        if (!byExt.has(r.external_id)) throw new StageIdentityError(`insert returned unknown identity ${r.external_id}`);
        out.set(r.external_id, { canonical_id: byExt.get(r.external_id)!.canonical_id, external_id: r.external_id, id: r.id, reused_existing: false });
      }
    } else {
      const text = await res.text();
      if (!isUniqueConflict(res.status, text)) throw new StageIdentityError(`stage insert chunk failed: HTTP ${res.status}`);
      // 3. unique 충돌 복구 — 요청 전체가 한 문장(트랜잭션)이라 부분 INSERT 는 없다. 같은 identity 로 재조회해
      //    이미 생긴 행(race)은 재사용(정확히 1행), 아직 없는 행만 한 번 더 INSERT. 그래도 충돌/모호하면 안전 실패.
      const again = await lookupExistingByExternalIds(fetchLike, t, missing);
      const byId = new Map<string, number[]>();
      for (const e of again) byId.set(e.external_id, [...(byId.get(e.external_id) ?? []), e.id]);
      const stillMissing: string[] = [];
      for (const ext of missing) {
        const ids = byId.get(ext) ?? [];
        if (ids.length > 1) throw new StageIdentityError(`conflict recovery failed for ${ext}: ${ids.length} rows after conflict`);
        if (ids.length === 1) out.set(ext, { canonical_id: byExt.get(ext)!.canonical_id, external_id: ext, id: ids[0]!, reused_existing: true });
        else stillMissing.push(ext);
      }
      if (stillMissing.length > 0) {
        const retry = await fetchLike(`${t.url}/rest/v1/city_spots?select=id,external_id`, {
          method: "POST", headers: headers(t, { Prefer: "return=representation" }), body: JSON.stringify(stillMissing.map(e => byExt.get(e)!.row)),
        });
        if (!retry.ok) throw new StageIdentityError(`stage insert retry failed after conflict recovery: HTTP ${retry.status} (${stillMissing.length} rows) — chunk 을 다시 실행하면 재조회부터 시작한다`);
        const inserted = JSON.parse(await retry.text()) as InsertedRow[];
        if (inserted.length !== stillMissing.length) throw new StageIdentityError(`retry insert returned ${inserted.length} rows for ${stillMissing.length}`);
        for (const r of inserted) {
          if (!byExt.has(r.external_id)) throw new StageIdentityError(`retry insert returned unknown identity ${r.external_id}`);
          out.set(r.external_id, { canonical_id: byExt.get(r.external_id)!.canonical_id, external_id: r.external_id, id: r.id, reused_existing: false });
        }
      }
    }
  }
  if (out.size !== exts.length) throw new StageIdentityError(`identity resolution incomplete: ${out.size}/${exts.length}`);
  return exts.map(e => out.get(e)!);
}

/** MATCH_REPLACE: 기존 numeric id 로 PATCH. source-owned 필드만(plan.writes). is_published 는 보내지 않는다(STAGE 계약). */
export async function stageUpdateRow(fetchLike: FetchLike, t: RestTarget, u: UpdateAction): Promise<void> {
  const writes = { ...u.writes };
  delete writes.is_published;   // STAGE 에서는 visibility 를 바꾸지 않는다 — 056 backfill 의 true 를 유지
  delete writes.source_type; delete writes.external_id;   // reference 필드는 어떤 경우에도 쓰지 않는다
  const res = await fetchLike(`${t.url}/rest/v1/city_spots?id=eq.${u.main_city_spot_id}`, {
    method: "PATCH", headers: headers(t, { Prefer: "return=minimal" }), body: JSON.stringify(writes),
  });
  if (!res.ok) throw new StageIdentityError(`stage update #${u.main_city_spot_id} failed: HTTP ${res.status}`);
}
