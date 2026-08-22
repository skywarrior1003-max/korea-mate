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

import { createHash } from "node:crypto";
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

// ── PostgREST error observability (TASK-FIVE-CITY-CORE-STAGE-INSERT-WRITER-FIX-V1 §13) ───────────────────
//   body 는 code/message/details/hint 만, JSON 이 아니면 2KB 이내 snippet. payload/헤더/키/사용자 row 는 기록하지 않는다.
export interface PostgrestErrorInfo { http_status: number; code: string | null; message: string | null; details: string | null; hint: string | null; snippet: string | null; }
const ERROR_CLIP = 2048;
function clip(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > ERROR_CLIP ? `${s.slice(0, ERROR_CLIP)}…` : s;
}
export function parsePostgrestError(status: number, bodyText: string): PostgrestErrorInfo {
  try {
    const j = JSON.parse(bodyText) as Record<string, unknown>;
    if (j && typeof j === "object" && !Array.isArray(j)) return { http_status: status, code: typeof j.code === "string" ? j.code : null, message: clip(j.message), details: clip(j.details), hint: clip(j.hint), snippet: null };
  } catch { /* not JSON */ }
  return { http_status: status, code: null, message: null, details: null, hint: null, snippet: clip(bodyText) };
}
export interface StageRestWhere { phase: string; chunk_index: number | null; subgroup_index: number | null; request_rows: number; }
export class StageRestError extends StageIdentityError {
  readonly info: PostgrestErrorInfo; readonly where: StageRestWhere;
  constructor(where: StageRestWhere, info: PostgrestErrorInfo) {
    super(`${where.phase} chunk ${where.chunk_index ?? "?"} subgroup ${where.subgroup_index ?? "?"} (${where.request_rows} rows) failed: HTTP ${info.http_status}${info.code ? ` ${info.code}` : ""}${info.message ? ` — ${info.message}` : info.snippet ? ` — ${info.snippet.slice(0, 200)}` : ""}`);
    this.name = "StageRestError"; this.info = info; this.where = where;
  }
}

// ── bulk INSERT key-set subgrouping (§7·§9·§10) ──────────────────────────────
//   PostgREST bulk insert 는 한 요청의 모든 객체 key 가 같아야 한다(PGRST102 "All object keys must match").
//   planImport 는 값이 있는 필드만 row 에 넣으므로 같은 logical chunk 안에 key-set 이 여러 개다 → key-set 별 subgroup 으로 나눠 보낸다.
//   없는 키를 null 로 만들지 않는다(absent ≠ explicit null 가능성·DB default 의미 보존). 값은 건드리지 않고 key 순서만 정렬(결정적 payload).
export function keySignature(row: Record<string, unknown>): string { return Object.keys(row).sort().join(","); }
export function orderedBody(row: Record<string, unknown>): Record<string, unknown> { return Object.fromEntries(Object.keys(row).sort().map(k => [k, row[k]])); }
export interface KeySetGroup<T> { signature: string; rows: T[]; }
/** signature 문자열 순으로 정렬(입력 순서와 무관하게 결정적) · group 안 row 순서는 입력 순서 유지 */
export function groupByKeySet<T extends { row: Record<string, unknown> }>(rows: readonly T[]): KeySetGroup<T>[] {
  const m = new Map<string, T[]>();
  for (const r of rows) { const sig = keySignature(r.row); m.set(sig, [...(m.get(sig) ?? []), r]); }
  return [...m.keys()].sort().map(signature => ({ signature, rows: m.get(signature)! }));
}
export interface InsertSubgroupReceipt { chunk_index: number | null; subgroup_index: number; key_signature: string; key_signature_sha256: string; request_rows: number; inserted: number; reused_after_conflict: number; failed: number; retry_count: number; http_status: number | null; error_code: string | null; error_message: string | null; }
export interface StageInsertOptions { chunkIndex?: number; onSubgroup?: (r: InsertSubgroupReceipt) => void | Promise<void>; }
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/**
 * NEW chunk — lookup-before-insert.
 *   · 이미 있는 identity 는 재사용(INSERT 0) · 없는 것만 INSERT · unique 충돌은 재조회로 복구(정확히 1행) · 0/>1 이면 실패.
 *   · 모든 행은 source_type=canonical · external_id 존재 · is_published=false 여야 한다(STAGE 계약).
 *   · 없는 행은 key-set 별 subgroup 으로 나눠 각각 한 번의 bulk INSERT(PGRST102 회피). subgroup 마다 receipt 콜백(성공/실패 즉시).
 *   · 어떤 subgroup 이 실패하면 이미 성공한 subgroup 은 DB 에 남고(행 단위 identity), 재실행은 lookup 으로 그 행을 재사용한다(중복 0).
 */
export async function stageInsertChunkSafe(fetchLike: FetchLike, t: RestTarget, rows: InsertAction[], opts: StageInsertOptions = {}): Promise<StagedIdentity[]> {
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

  // 2. 없는 것만 INSERT — key-set subgroup 별 (on_conflict 미사용: partial unique index 는 PostgREST 가 추론하지 못한다)
  const missing = exts.filter(e => !out.has(e));
  const groups = groupByKeySet(missing.map(e => byExt.get(e)!));
  const chunkIndex = opts.chunkIndex ?? null;
  const post = (body: Record<string, unknown>[]) => fetchLike(`${t.url}/rest/v1/city_spots?select=id,external_id`, { method: "POST", headers: headers(t, { Prefer: "return=representation" }), body: JSON.stringify(body) });
  const absorb = (inserted: InsertedRow[], expected: string[], label: string) => {
    if (inserted.length !== expected.length) throw new StageIdentityError(`${label} returned ${inserted.length} rows for ${expected.length}`);
    for (const r of inserted) {
      if (!byExt.has(r.external_id)) throw new StageIdentityError(`${label} returned unknown identity ${r.external_id}`);
      out.set(r.external_id, { canonical_id: byExt.get(r.external_id)!.canonical_id, external_id: r.external_id, id: r.id, reused_existing: false });
    }
  };
  for (const [gi, g] of groups.entries()) {
    const gExts = g.rows.map(r => r.row.external_id as string);
    const receipt: InsertSubgroupReceipt = { chunk_index: chunkIndex, subgroup_index: gi, key_signature: g.signature, key_signature_sha256: sha256(g.signature), request_rows: gExts.length, inserted: 0, reused_after_conflict: 0, failed: 0, retry_count: 0, http_status: null, error_code: null, error_message: null };
    const fail = async (info: PostgrestErrorInfo, failedRows: number): Promise<never> => {
      receipt.http_status = info.http_status; receipt.error_code = info.code; receipt.error_message = info.message ?? info.snippet; receipt.failed = failedRows;
      await opts.onSubgroup?.(receipt);
      throw new StageRestError({ phase: "NEW_CITY_SPOTS", chunk_index: chunkIndex, subgroup_index: gi, request_rows: gExts.length }, info);
    };
    const res = await post(g.rows.map(r => orderedBody(r.row)));
    if (res.ok) {
      absorb(JSON.parse(await res.text()) as InsertedRow[], gExts, "insert"); receipt.inserted = gExts.length; receipt.http_status = res.status;
    } else {
      const text = await res.text();
      if (!isUniqueConflict(res.status, text)) await fail(parsePostgrestError(res.status, text), gExts.length);
      // 3. unique 충돌 복구 — 요청 전체가 한 문장(트랜잭션)이라 부분 INSERT 는 없다. 같은 identity 로 재조회해
      //    이미 생긴 행(race)은 재사용(정확히 1행), 아직 없는 행만 한 번 더 INSERT. 그래도 충돌/모호하면 안전 실패.
      const again = await lookupExistingByExternalIds(fetchLike, t, gExts);
      const byId = new Map<string, number[]>();
      for (const e of again) byId.set(e.external_id, [...(byId.get(e.external_id) ?? []), e.id]);
      const stillMissing: string[] = [];
      for (const ext of gExts) {
        const ids = byId.get(ext) ?? [];
        if (ids.length > 1) throw new StageIdentityError(`conflict recovery failed for ${ext}: ${ids.length} rows after conflict`);
        if (ids.length === 1) { out.set(ext, { canonical_id: byExt.get(ext)!.canonical_id, external_id: ext, id: ids[0]!, reused_existing: true }); receipt.reused_after_conflict += 1; }
        else stillMissing.push(ext);
      }
      if (stillMissing.length > 0) {
        receipt.retry_count = 1;
        const retry = await post(stillMissing.map(e => orderedBody(byExt.get(e)!.row)));
        if (!retry.ok) await fail(parsePostgrestError(retry.status, await retry.text()), stillMissing.length);
        absorb(JSON.parse(await retry.text()) as InsertedRow[], stillMissing, "retry insert"); receipt.inserted = stillMissing.length; receipt.http_status = retry.status;
      } else receipt.http_status = res.status;
    }
    await opts.onSubgroup?.(receipt);
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
