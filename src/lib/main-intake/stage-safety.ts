// STAGE 안전장치 — pre-stage snapshot · chunk receipt · 사용자 테이블 count guard · NEW 비공개 사후검증
// (TASK-FIVE-CITY-CORE-STAGE-WRITER-COMPLETION-V1) — fetch 주입, secrets/사용자 데이터 없음, DELETE 없음.

import { createHash } from "node:crypto";
import { appendFileSync, writeFileSync } from "node:fs";
import type { FetchLike, RestTarget } from "./stage-rest-writer.ts";
import { StageIdentityError } from "./stage-rest-writer.ts";
import { SOURCE_FIELDS, type UpdateAction } from "./importer-core.ts";
import { chunk } from "../city-spots-paging.ts";

function headers(t: RestTarget, extra: Record<string, string> = {}): Record<string, string> {
  return { apikey: t.serviceKey, Authorization: `Bearer ${t.serviceKey}`, ...extra };
}
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** MATCH 462 의 "변경 대상 source-owned 필드" before 값 + 그 spot 의 기존 source/image 상태 — emergency rollback material (READ-ONLY) */
export interface PreStageSnapshotRow { city_spot_id: number; canonical_id: string; before: Record<string, unknown>; fields_to_write: string[]; sources_before: unknown[]; images_before: unknown[]; manifest_hash: string; captured_at: string; }

export async function buildPreStageSnapshot(f: FetchLike, t: RestTarget, updates: UpdateAction[], manifestHash: string, capturedAt: string): Promise<{ rows: PreStageSnapshotRow[]; sha256: string; text: string }> {
  const rows: PreStageSnapshotRow[] = [];
  const cols = ["id", ...SOURCE_FIELDS].join(",");
  for (const part of chunk([...updates].sort((a, b) => a.main_city_spot_id - b.main_city_spot_id), 100)) {
    const ids = part.map(u => u.main_city_spot_id);
    const res = await f(`${t.url}/rest/v1/city_spots?select=${cols}&id=in.(${ids.join(",")})&order=id`, { method: "GET", headers: headers(t) });
    if (!res.ok) throw new StageIdentityError(`snapshot read failed: HTTP ${res.status}`);
    const spots = JSON.parse(await res.text()) as Array<Record<string, unknown> & { id: number }>;
    const srcRes = await f(`${t.url}/rest/v1/city_spot_sources?select=id,city_spot_id,source_type,source_key,is_primary,source_url,source_tier,candidate_id,as_of&city_spot_id=in.(${ids.join(",")})&order=id`, { method: "GET", headers: headers(t) });
    const imgRes = await f(`${t.url}/rest/v1/city_spot_images?select=id,city_spot_id,image_url,rights_status,display_eligible,is_primary,sort_order,source_id,attribution_required,rights_note,as_of&city_spot_id=in.(${ids.join(",")})&order=id`, { method: "GET", headers: headers(t) });
    if (!srcRes.ok || !imgRes.ok) throw new StageIdentityError("snapshot relation read failed");
    const srcs = JSON.parse(await srcRes.text()) as Array<{ city_spot_id: number }>; const imgs = JSON.parse(await imgRes.text()) as Array<{ city_spot_id: number }>;
    const bySpot = new Map(spots.map(s => [s.id, s]));
    for (const u of part) {
      const s = bySpot.get(u.main_city_spot_id);
      if (!s) throw new StageIdentityError(`snapshot: city_spot #${u.main_city_spot_id} not found`);
      const fields = Object.keys(u.writes).filter(k => k !== "is_published").sort();
      rows.push({ city_spot_id: u.main_city_spot_id, canonical_id: u.canonical_id, before: Object.fromEntries(fields.map(k => [k, s[k] ?? null])), fields_to_write: fields,
        sources_before: srcs.filter(x => x.city_spot_id === u.main_city_spot_id), images_before: imgs.filter(x => x.city_spot_id === u.main_city_spot_id), manifest_hash: manifestHash, captured_at: capturedAt });
    }
  }
  const text = rows.map(r => JSON.stringify(r)).join("\n") + "\n";
  return { rows, sha256: sha(text), text };
}

/** chunk receipt — phase 별 결정적 기록(시각은 호출자가 준다) */
export interface ChunkReceipt {
  phase: "MATCH_CITY_SPOTS" | "NEW_CITY_SPOTS" | "SOURCES" | "IMAGES" | "VERIFY"; chunk_index: number; expected: number; looked_up: number; reused: number; updated: number; inserted: number; unchanged: number; suppressed: number; failed: number; retry_count: number; content_sha256: string; timestamp: string;
  // STAGE-INSERT-WRITER-FIX-V1: attempt 식별 · subgroup 단위 · HTTP/PostgREST 오류(secret/payload 없음)
  attempt?: string; subgroup_index?: number | null; key_signature_sha256?: string | null; request_rows?: number; http_status?: number | null; error_code?: string | null; error_message?: string | null;
}
/** receipt 를 즉시 append-only JSONL 로 남긴다(마지막에만 쓰지 않음 → partial failure 에도 progress 보존). */
export function appendReceiptLine(path: string, r: ChunkReceipt): void { appendFileSync(path, JSON.stringify(r) + "\n", "utf8"); }
/** ISO → attempt id (2026-08-22T11:58:04.707Z → 20260822T115804Z) */
export function attemptId(iso: string): string { return iso.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z"); }
export function snapshotAttemptFilename(attempt: string): string { return `pre-stage-match-snapshot-v1.${attempt}.jsonl`; }
/** 절대 덮어쓰지 않는 쓰기(flag wx: 존재하면 EEXIST). 과거 attempt 의 before-state(예: R2 before-Phase-A)는 불변 evidence 다. */
export function writeImmutableFile(path: string, text: string): void { writeFileSync(path, text, { encoding: "utf8", flag: "wx" }); }
export const R2_BEFORE_PHASE_A_SNAPSHOT = "pre-stage-match-snapshot-v1.r2-before-phaseA-2026-08-22T115804Z.jsonl";
export function chunkReceipt(r: Omit<ChunkReceipt, "content_sha256">, contentKeys: ReadonlyArray<string | number>): ChunkReceipt {
  return { ...r, content_sha256: sha(`${r.phase}|${r.chunk_index}|${contentKeys.join(",")}`) };
}
export function receiptsSha(receipts: ChunkReceipt[]): string { return sha(receipts.map(r => JSON.stringify(r)).join("\n") + "\n"); }

/** 사용자 테이블 행 수만(내용 0). pre == post 여야 STAGE CLOSED. */
export const USER_TABLES = ["itineraries", "trip_moments", "user_spots", "place_reports"] as const;
/**
 * 테이블별 실제 PK 컬럼 (Production information_schema 실측 2026-08-22, TASK-FIVE-CITY-CORE-USER-COUNT-GUARD-FIX-V1).
 * trip_moments 의 PK 는 `moment_id` — `select=id` 는 42703 (STAGE-V1-R1 HOLD 원인). 추측 금지: 여기 값은 실측에서만 바꾼다.
 */
export const USER_TABLE_PK: Record<(typeof USER_TABLES)[number], string> = { itineraries: "id", trip_moments: "moment_id", user_spots: "id", place_reports: "id" };
/** `Content-Range: * /N` 또는 `a-b/N` 에서 N. 그 외 형태·누락·비정수는 null (조용한 0 fallback 금지). */
export function parseContentRangeCount(cr: string | null | undefined): number | null {
  if (typeof cr !== "string") return null;
  const m = /^(?:\*|\d+-\d+)\/(\d+)$/.exec(cr.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}
/** count 전용 요청: `select=<pk>&limit=0` + `Prefer: count=exact` → body `[]`, 사용자 row 내용 0. */
export function userCountRequestPath(table: (typeof USER_TABLES)[number]): string { return `${table}?select=${USER_TABLE_PK[table]}&limit=0`; }
export async function readUserTableCounts(f: FetchLike, t: RestTarget): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const table of USER_TABLES) {
    const res = await f(`${t.url}/rest/v1/${userCountRequestPath(table)}`, { method: "GET", headers: headers(t, { Prefer: "count=exact" }) });
    if (!res.ok) throw new StageIdentityError(`user table count failed: ${table} HTTP ${res.status}`);
    const cr = (res as unknown as { headers?: { get(k: string): string | null } }).headers?.get?.("content-range") ?? null;
    const total = parseContentRangeCount(cr);
    if (total === null) throw new StageIdentityError(`user table count unreadable: ${table} (content-range=${cr ?? "missing"})`);
    out[table] = total;
  }
  return out;
}
/** pre-stage snapshot 은 MATCH 전체(462)를 담아야 한다. 부족/초과/중복이면 STAGE 금지. */
export function assertSnapshotComplete(rows: ReadonlyArray<{ city_spot_id: number }>, expectedIds: ReadonlyArray<number>): void {
  const got = new Set(rows.map(r => r.city_spot_id)); const exp = new Set(expectedIds);
  if (rows.length !== exp.size || got.size !== exp.size || [...exp].some(id => !got.has(id))) throw new StageIdentityError(`pre-stage snapshot incomplete: rows=${rows.length} distinct=${got.size} expected=${exp.size}`);
}
export function userCountsDiff(pre: Record<string, number>, post: Record<string, number>): string[] {
  return USER_TABLES.filter(t => pre[t] !== post[t]).map(t => `${t}: ${pre[t]} → ${post[t]}`);
}

/** NEW 전체가 is_published=false 인지 사후 검증 — default 에 의존하지 않고 실제 행을 읽는다 */
export async function verifyNewUnpublished(f: FetchLike, t: RestTarget, ids: readonly number[]): Promise<{ checked: number; published_true: number; missing: number }> {
  let published = 0, found = 0;
  for (const part of chunk([...ids], 200)) {
    const res = await f(`${t.url}/rest/v1/city_spots?select=id,is_published&id=in.(${part.join(",")})`, { method: "GET", headers: headers(t) });
    if (!res.ok) throw new StageIdentityError(`verify read failed: HTTP ${res.status}`);
    const rows = JSON.parse(await res.text()) as Array<{ id: number; is_published: boolean }>;
    found += rows.length; published += rows.filter(r => r.is_published === true).length;
  }
  return { checked: ids.length, published_true: published, missing: ids.length - found };
}
