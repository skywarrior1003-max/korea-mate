// STAGE Phase A3 — RESTORE_PRE_R2 (TASK-FIVE-CITY-CORE-R3-RESTORE-WRITER-SUPPORT-V1)
//
// 무엇을 하나
//   R2 Phase A 가 old erroneous GJ08 Food Final 값을 Production 기존 행(94)에 써버렸다. 그 행들은 새 active Final 에서 제외(retire)되지만
//   PUBLISH 전까지 공개 상태로 남으므로, R2 가 실제 바꾼 필드만 **immutable R2 before-Phase-A snapshot 의 before 값**으로 되돌린다.
//   restore now → PUBLISH 에서 hide. old Food 를 Final 로 보존하는 것이 아니다.
//
// 계약
//   · restore source = R2 historical snapshot(ops 3622e26, sha 10240f4f…) 뿐. 현재 Production 값·old artifact·legacy·VisitGyeongju·추측 0.
//   · allowlist = plan 의 restore_fields ∩ SOURCE_FIELDS. id/source_type/external_id/is_published/runtime·Main-owned 필드는 절대 payload 에 없다.
//   · identity guard: numeric id 존재 + old canonical 의 gyeongju-city source bridge 가 같은 spot 을 가리킴. 아니면 IDENTITY_MISMATCH(쓰기 0).
//   · drift guard: 현재 값이 R2 적용값(NEEDS_RESTORE) 또는 snapshot before 값(ALREADY_RESTORED)일 때만 자동. 그 외 DRIFT_DETECTED(쓰기 0).
//   · per-row PATCH(기존 MATCH PATCH 와 같은 패턴) · return=representation 으로 결과 검증 · 멱등 · 부분 실패 시 row receipt 즉시 → throw.
//   · DELETE 0 · INSERT 0 · child row 0.

import { createHash } from "node:crypto";
import { SOURCE_FIELDS } from "./importer-core.ts";
import type { FetchLike, RestTarget } from "./stage-rest-writer.ts";
import { StageIdentityError, StageRestError, parsePostgrestError } from "./stage-rest-writer.ts";

export const R2_OPS_COMMIT = "3622e26";
export const R2_HISTORICAL_SNAPSHOT_SHA256 = "10240f4f404c95fae71dc20b6599b14f83bcf3812173bd155d388ec76d6c6207";
export const R2_HISTORICAL_SNAPSHOT_FILE = "pre-stage-match-snapshot-v1.r2-before-phaseA-2026-08-22T115804Z.jsonl";
export const RESTORE_FORBIDDEN_FIELDS = new Set(["id", "city", "source_type", "external_id", "is_published", "rating", "review_count", "view_count", "like_count", "created_at", "updated_at", "affiliate_url", "affiliate_provider", "solo_friendly", "foreign_card_accepted", "cash_only", "duration_minutes", "best_time_slot", "entry_fee", "difficulty"]);
export const OLD_FOOD_BRIDGE_SOURCE_TYPE = "gyeongju-city";

export interface RestorePlanRow {
  main_city_spot_id: number; old_canonical_id: string; restore_fields: string[]; before_values: Record<string, unknown>;
  source: { ops_commit: string; snapshot_sha256: string; captured_at: string }; never_touch: string[]; publish_hide_candidate: boolean; hard_delete: boolean;
}
export type RestoreState = "NEEDS_RESTORE" | "ALREADY_RESTORED" | "DRIFT_DETECTED" | "IDENTITY_MISMATCH" | "SNAPSHOT_MISSING";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
/** 값 비교: JSON 정규화(객체 키 정렬) — jsonb/array 필드(name_l10n·desc_l10n·tags)도 의미 비교 */
export function canon(v: unknown): string {
  if (v === undefined) return "null";
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  return `{${Object.keys(v as Record<string, unknown>).sort().map(k => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(",")}}`;
}
export const sameValue = (a: unknown, b: unknown): boolean => canon(a) === canon(b);

/** plan 자체의 내부 무결성 — rows 94 · distinct id · allowlist · forbidden 0 · before_values ↔ restore_fields · snapshot 출처 고정 */
export function validateRestorePlan(rows: readonly RestorePlanRow[], opts: { expectedRows?: number } = {}): { rows: number; distinct_ids: number; fields: string[]; errors: string[] } {
  const errors: string[] = [];
  const ids = new Set<number>(); const fields = new Set<string>();
  for (const r of rows) {
    if (!Number.isInteger(r.main_city_spot_id) || r.main_city_spot_id <= 0) errors.push(`bad id ${String(r.main_city_spot_id)}`);
    if (ids.has(r.main_city_spot_id)) errors.push(`duplicate id ${r.main_city_spot_id}`); ids.add(r.main_city_spot_id);
    if (r.source?.ops_commit !== R2_OPS_COMMIT || r.source?.snapshot_sha256 !== R2_HISTORICAL_SNAPSHOT_SHA256) errors.push(`#${r.main_city_spot_id}: restore source is not the R2 historical snapshot`);
    if (r.hard_delete !== false) errors.push(`#${r.main_city_spot_id}: hard_delete must be false`);
    if (!Array.isArray(r.restore_fields) || r.restore_fields.length === 0) errors.push(`#${r.main_city_spot_id}: empty restore_fields`);
    for (const f of r.restore_fields ?? []) {
      fields.add(f);
      if (RESTORE_FORBIDDEN_FIELDS.has(f)) errors.push(`#${r.main_city_spot_id}: forbidden field ${f}`);
      if (!(SOURCE_FIELDS as readonly string[]).includes(f)) errors.push(`#${r.main_city_spot_id}: ${f} not a source-owned field`);
      if (!(f in (r.before_values ?? {}))) errors.push(`#${r.main_city_spot_id}: before value missing for ${f}`);
    }
    for (const k of Object.keys(r.before_values ?? {})) if (!r.restore_fields.includes(k)) errors.push(`#${r.main_city_spot_id}: before_values has extra key ${k}`);
  }
  if (opts.expectedRows !== undefined && rows.length !== opts.expectedRows) errors.push(`rows ${rows.length} != expected ${opts.expectedRows}`);
  return { rows: rows.length, distinct_ids: ids.size, fields: [...fields].sort(), errors };
}

/** R2 historical snapshot 과의 교차 검증(테스트/preflight): plan 의 before 값 == snapshot before 값, restore_fields ⊆ snapshot fields_to_write */
export function crossCheckWithSnapshot(rows: readonly RestorePlanRow[], snapshot: ReadonlyArray<{ city_spot_id: number; canonical_id: string; before: Record<string, unknown>; fields_to_write: string[] }>): { matched: number; missing: number; mismatched: string[] } {
  const byId = new Map(snapshot.map(s => [s.city_spot_id, s])); let matched = 0, missing = 0; const mismatched: string[] = [];
  for (const r of rows) {
    const s = byId.get(r.main_city_spot_id);
    if (!s) { missing += 1; continue; }
    const bad = r.restore_fields.filter(f => !s.fields_to_write.includes(f) || !sameValue(s.before[f], r.before_values[f]));
    if (bad.length || s.canonical_id !== r.old_canonical_id) mismatched.push(`#${r.main_city_spot_id}: ${bad.join(",") || "canonical"}`); else matched += 1;
  }
  return { matched, missing, mismatched };
}

export interface RestorePayload { main_city_spot_id: number; old_canonical_id: string; body: Record<string, unknown>; payload_sha256: string; }
/** 결정적 payload — id 오름차순 · 필드 이름순 · 값은 snapshot before 그대로 */
export function buildRestorePayloads(rows: readonly RestorePlanRow[]): { payloads: RestorePayload[]; plan_sha256: string } {
  const payloads = [...rows].sort((a, b) => a.main_city_spot_id - b.main_city_spot_id).map(r => {
    const body = Object.fromEntries([...r.restore_fields].sort().map(f => [f, r.before_values[f] === undefined ? null : r.before_values[f]]));
    for (const k of Object.keys(body)) if (RESTORE_FORBIDDEN_FIELDS.has(k)) throw new StageIdentityError(`restore payload contains forbidden field ${k}`);
    return { main_city_spot_id: r.main_city_spot_id, old_canonical_id: r.old_canonical_id, body, payload_sha256: sha256(`${r.main_city_spot_id}|${canon(body)}`) };
  });
  return { payloads, plan_sha256: sha256(payloads.map(p => p.payload_sha256).join("\n")) };
}

export interface CurrentRow { id: number; source_type: string; external_id: string | null; is_published: boolean; [k: string]: unknown; }
/** 현재 행 분류 — expectedR2 = R2 Phase A 가 그 행에 쓴 값(v1 plan writes). 필드별로 before/R2 중 하나여야 자동 처리. */
export function classifyRestoreState(plan: RestorePlanRow, current: CurrentRow | undefined, bridgeSpot: number | undefined, expectedR2: Record<string, unknown> | undefined): { state: RestoreState; fields_to_patch: string[]; detail: string } {
  if (!current) return { state: "IDENTITY_MISMATCH", fields_to_patch: [], detail: "row not found" };
  if (current.id !== plan.main_city_spot_id) return { state: "IDENTITY_MISMATCH", fields_to_patch: [], detail: "id mismatch" };
  if (current.source_type === "canonical") return { state: "IDENTITY_MISMATCH", fields_to_patch: [], detail: "row is a canonical NEW row, not a legacy Main row" };
  if (bridgeSpot !== plan.main_city_spot_id) return { state: "IDENTITY_MISMATCH", fields_to_patch: [], detail: `bridge ${OLD_FOOD_BRIDGE_SOURCE_TYPE}:${plan.old_canonical_id} → ${bridgeSpot ?? "none"}` };
  if (!expectedR2) return { state: "SNAPSHOT_MISSING", fields_to_patch: [], detail: "no R2 applied-state expectation for this row" };
  const toPatch: string[] = []; const drift: string[] = [];
  for (const f of plan.restore_fields) {
    const cur = current[f]; const before = plan.before_values[f];
    if (sameValue(cur, before)) continue;
    if (f in expectedR2 && sameValue(cur, expectedR2[f])) { toPatch.push(f); continue; }
    drift.push(f);
  }
  if (drift.length) return { state: "DRIFT_DETECTED", fields_to_patch: [], detail: `third state in ${drift.join(",")}` };
  if (toPatch.length === 0) return { state: "ALREADY_RESTORED", fields_to_patch: [], detail: "all fields already at snapshot before values" };
  return { state: "NEEDS_RESTORE", fields_to_patch: toPatch, detail: `${toPatch.length}/${plan.restore_fields.length} fields at R2 value` };
}

export interface RestoreRowReceipt { main_city_spot_id: number; state: RestoreState; intended_fields: number; patched_fields: number; updated: number; unchanged: number; failed: number; payload_sha256: string; http_status: number | null; error_code: string | null; error_message: string | null; detail: string; }
export interface RestoreResult { planned: number; restored: number; already_restored: number; drift: number; identity_mismatch: number; snapshot_missing: number; failed: number; rows: RestoreRowReceipt[]; }
export interface RestoreOptions { expectedR2ByRow: ReadonlyMap<number, Record<string, unknown>>; onRow?: (r: RestoreRowReceipt) => void | Promise<void>; }

function headers(t: RestTarget, extra: Record<string, string> = {}): Record<string, string> {
  return { apikey: t.serviceKey, Authorization: `Bearer ${t.serviceKey}`, "Content-Type": "application/json", ...extra };
}

/**
 * Phase A3 writer. 각 row: 현재 행 GET → bridge GET → 분류 → NEEDS_RESTORE 만 PATCH(allowlist 필드, snapshot before 값) → representation 검증.
 * DRIFT/IDENTITY/SNAPSHOT_MISSING 은 쓰지 않고 receipt 만 남긴다(호출자가 Phase B 진입을 막는다). HTTP 실패는 row receipt 후 StageRestError.
 */
export async function stageRestoreChunk(fetchLike: FetchLike, t: RestTarget, rows: readonly RestorePlanRow[], opts: RestoreOptions): Promise<RestoreResult> {
  const v = validateRestorePlan(rows);
  if (v.errors.length) throw new StageIdentityError(`restore plan invalid: ${v.errors.slice(0, 3).join("; ")}`);
  const { payloads } = buildRestorePayloads(rows);
  const byId = new Map(rows.map(r => [r.main_city_spot_id, r]));
  const ids = payloads.map(p => p.main_city_spot_id);
  const fields = [...new Set(rows.flatMap(r => r.restore_fields))].sort();
  const sel = ["id", "source_type", "external_id", "is_published", ...fields].join(",");
  const cur = await fetchLike(`${t.url}/rest/v1/city_spots?select=${sel}&id=in.(${ids.join(",")})`, { method: "GET", headers: headers(t) });
  if (!cur.ok) throw new StageRestError({ phase: "RESTORE_PRE_R2", chunk_index: null, subgroup_index: null, request_rows: ids.length }, parsePostgrestError(cur.status, await cur.text()));
  const current = new Map((JSON.parse(await cur.text()) as CurrentRow[]).map(r => [r.id, r]));
  const keys = rows.map(r => `"${r.old_canonical_id.replace(/"/g, "")}"`).join(",");
  const br = await fetchLike(`${t.url}/rest/v1/city_spot_sources?select=city_spot_id,source_key&source_type=eq.${OLD_FOOD_BRIDGE_SOURCE_TYPE}&source_key=in.(${encodeURIComponent(keys)})`, { method: "GET", headers: headers(t) });
  if (!br.ok) throw new StageRestError({ phase: "RESTORE_PRE_R2", chunk_index: null, subgroup_index: null, request_rows: ids.length }, parsePostgrestError(br.status, await br.text()));
  const bridge = new Map<string, number[]>();
  for (const b of JSON.parse(await br.text()) as Array<{ city_spot_id: number; source_key: string }>) bridge.set(b.source_key, [...(bridge.get(b.source_key) ?? []), b.city_spot_id]);

  const res: RestoreResult = { planned: rows.length, restored: 0, already_restored: 0, drift: 0, identity_mismatch: 0, snapshot_missing: 0, failed: 0, rows: [] };
  for (const p of payloads) {
    const plan = byId.get(p.main_city_spot_id)!;
    const spots = bridge.get(plan.old_canonical_id) ?? [];
    const cls = classifyRestoreState(plan, current.get(p.main_city_spot_id), spots.length === 1 ? spots[0] : undefined, opts.expectedR2ByRow.get(p.main_city_spot_id));
    const receipt: RestoreRowReceipt = { main_city_spot_id: p.main_city_spot_id, state: cls.state, intended_fields: plan.restore_fields.length, patched_fields: 0, updated: 0, unchanged: 0, failed: 0, payload_sha256: p.payload_sha256, http_status: null, error_code: null, error_message: null, detail: cls.detail };
    if (cls.state === "NEEDS_RESTORE") {
      const body = Object.fromEntries(cls.fields_to_patch.sort().map(f => [f, p.body[f]]));
      for (const k of Object.keys(body)) if (RESTORE_FORBIDDEN_FIELDS.has(k)) throw new StageIdentityError(`forbidden field in restore payload: ${k}`);
      const r = await fetchLike(`${t.url}/rest/v1/city_spots?id=eq.${p.main_city_spot_id}&select=${sel}`, { method: "PATCH", headers: headers(t, { Prefer: "return=representation" }), body: JSON.stringify(body) });
      if (!r.ok) {
        const info = parsePostgrestError(r.status, await r.text());
        receipt.failed = 1; receipt.http_status = info.http_status; receipt.error_code = info.code; receipt.error_message = info.message ?? info.snippet; res.failed += 1; res.rows.push(receipt);
        await opts.onRow?.(receipt);
        throw new StageRestError({ phase: "RESTORE_PRE_R2", chunk_index: null, subgroup_index: p.main_city_spot_id, request_rows: 1 }, info);
      }
      const rep = JSON.parse(await r.text()) as CurrentRow[];
      const after = rep[0];
      if (rep.length !== 1 || !after || after.id !== p.main_city_spot_id) throw new StageIdentityError(`restore #${p.main_city_spot_id}: representation mismatch`);
      const wrong = cls.fields_to_patch.filter(f => !sameValue(after[f], plan.before_values[f]));
      if (wrong.length || after.is_published !== current.get(p.main_city_spot_id)!.is_published) throw new StageIdentityError(`restore #${p.main_city_spot_id}: post-write verification failed (${wrong.join(",") || "is_published changed"})`);
      receipt.patched_fields = cls.fields_to_patch.length; receipt.updated = 1; receipt.http_status = r.status; res.restored += 1;
    } else if (cls.state === "ALREADY_RESTORED") { receipt.unchanged = 1; res.already_restored += 1; }
    else if (cls.state === "DRIFT_DETECTED") res.drift += 1;
    else if (cls.state === "IDENTITY_MISMATCH") res.identity_mismatch += 1;
    else res.snapshot_missing += 1;
    res.rows.push(receipt);
    await opts.onRow?.(receipt);
  }
  return res;
}

/** Phase B 진입 가능 조건: 전부 restored/already_restored, drift·mismatch·missing·failed 0 */
export function restoreAllowsNextPhase(r: RestoreResult): boolean {
  return r.failed === 0 && r.drift === 0 && r.identity_mismatch === 0 && r.snapshot_missing === 0 && r.restored + r.already_restored === r.planned;
}
