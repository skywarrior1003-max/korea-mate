// STAGE relation writers — city_spot_sources / city_spot_images (TASK-FIVE-CITY-CORE-STAGE-WRITER-COMPLETION-V1)
//
// OWNER DATA TRUST: FINAL VALIDATED ARTIFACT > LEGACY. Final source/image plan 이 authoritative current relation 이다.
//   · 기존 DB 행은 "같은 identity 의 행을 Final 값으로 동기화" 하기 위해 재사용할 뿐, Final plan 을 바꾸는 근거가 아니다.
//   · 기존 source 존재 ≠ Final provenance 채택. Final 에 없는 legacy source 는 is_primary=false 로 비주요화(보존, DELETE 0).
//   · Final 에 없는 legacy image 는 display_eligible=false · is_primary=false 로 비노출(보존, DELETE 0). legacy image fallback 없음.
//   · identity 가 다른 city_spot 에 붙어 있으면(Case B) 자동 remap 하지 않고 실패한다.
//   · name/address/좌표 heuristic 0. 데이터 재검증 0. DELETE 0. 사용자 테이블 접근 0.
//
// schema(045/046, Production 실측과 동일)
//   city_spot_sources: UNIQUE(source_type, source_key) · UNIQUE(city_spot_id, source_type) · partial UNIQUE(city_spot_id) WHERE is_primary
//   city_spot_images : UNIQUE(city_spot_id, image_url) · partial UNIQUE(city_spot_id) WHERE is_primary · CHECK(not(display_eligible and rights in UNKNOWN))
//   partial unique 는 PostgREST on_conflict 로 추론되지 않으므로 모든 쓰기는 lookup-first + exact-id PATCH/plain INSERT 다.

import type { CrosswalkRow, ImageRow, SourceRow } from "./importer-core.ts";
import type { FetchLike, RestTarget } from "./stage-rest-writer.ts";
import { StageIdentityError } from "./stage-rest-writer.ts";

export interface ResolvedSource { canonical_id: string; city_spot_id: number; source_type: string; source_key: string; candidate_id: string | null; source_url: string | null; source_tier: string | null; is_primary: boolean; as_of: string | null; }
export interface ResolvedImage { canonical_id: string; city_spot_id: number; image_url: string; rights_status: string; attribution_required: boolean; rights_note: string | null; display_eligible: boolean; is_primary: boolean; sort_order: number; as_of: string | null; }

export const UNKNOWN_RIGHTS = ["RIGHTS_UNKNOWN", "KTO_TYPE_UNKNOWN"] as const;   // DB CHECK csi_unknown_rights_not_public
const NEVER_ELIGIBLE = new Set<string>([...UNKNOWN_RIGHTS, "SOCIAL_CDN_REVIEW", "OPERATOR_ASSUMED_REVIEW"]);

/** Final plan → actual city_spot_id. MATCH 는 crosswalk 의 기존 id, NEW 는 STAGE mapping. 쓰지 않는 decision(twin/review/excluded)의 행은 제외. */
export function resolveRelationTargets(input: { sources: SourceRow[]; images: ImageRow[]; crosswalk: CrosswalkRow[]; newIdByCanonical: ReadonlyMap<string, number> }): {
  sources: ResolvedSource[]; images: ResolvedImage[]; unresolved: Array<{ kind: "source" | "image"; canonical_id: string; reason: string }>; skipped_not_written: number;
} {
  const target = new Map<string, number>();
  const written = new Set<string>();
  for (const c of input.crosswalk) {
    if (c.service_status !== "ACTIVE") continue;
    if (c.decision === "MATCH_REPLACE" && c.main_city_spot_id !== null) { target.set(c.canonical_id, c.main_city_spot_id); written.add(c.canonical_id); }
    else if (c.decision === "NEW") { const id = input.newIdByCanonical.get(c.canonical_id); if (id !== undefined) target.set(c.canonical_id, id); written.add(c.canonical_id); }
  }
  const unresolved: Array<{ kind: "source" | "image"; canonical_id: string; reason: string }> = [];
  let skipped = 0;
  const sources: ResolvedSource[] = [];
  for (const s of input.sources) {
    if (!written.has(s.canonical_id)) { skipped += 1; continue; }
    const id = target.get(s.canonical_id);
    if (id === undefined) { unresolved.push({ kind: "source", canonical_id: s.canonical_id, reason: "NEW without actual id mapping" }); continue; }
    sources.push({ canonical_id: s.canonical_id, city_spot_id: id, source_type: s.source_type, source_key: String(s.source_key), candidate_id: s.candidate_id ?? null, source_url: s.source_url ?? null, source_tier: s.source_tier ?? null, is_primary: Boolean(s.is_primary), as_of: s.as_of ?? null });
  }
  const images: ResolvedImage[] = [];
  for (const i of input.images) {
    if (!written.has(i.canonical_id)) { skipped += 1; continue; }
    const id = target.get(i.canonical_id);
    if (id === undefined) { unresolved.push({ kind: "image", canonical_id: i.canonical_id, reason: "NEW without actual id mapping" }); continue; }
    images.push({ canonical_id: i.canonical_id, city_spot_id: id, image_url: i.image_url, rights_status: i.rights_status, attribution_required: Boolean(i.attribution_required), rights_note: i.rights_note ?? null, display_eligible: Boolean(i.display_eligible), is_primary: Boolean(i.is_primary), sort_order: i.sort_order ?? 0, as_of: i.as_of ?? null });
  }
  return { sources, images, unresolved, skipped_not_written: skipped };
}

export interface RelationPreflight {
  source_planned: number; image_planned: number;
  source_unresolved: number; image_unresolved: number;
  source_conflicts: string[]; image_conflicts: string[]; rights_violations: string[];
  source_primary_conflicts: number; image_primary_conflicts: number;
}

/** 품질 검증이 아니라 "DB 에 넣을 수 있는가" 만 본다(schema UNIQUE/CHECK/length). */
export function preflightRelations(r: ReturnType<typeof resolveRelationTargets>): RelationPreflight {
  const sc: string[] = []; const ic: string[] = []; const rv: string[] = [];
  const byTypeKey = new Map<string, Set<number>>(); const bySpotType = new Map<string, number>(); const primaryPerSpot = new Map<number, number>();
  for (const s of r.sources) {
    if (s.source_type.length < 1 || s.source_type.length > 64 || s.source_key.length < 1 || s.source_key.length > 128) sc.push(`length ${s.canonical_id} ${s.source_type}`);
    const k1 = `${s.source_type}|${s.source_key}`; byTypeKey.set(k1, (byTypeKey.get(k1) ?? new Set()).add(s.city_spot_id));
    const k2 = `${s.city_spot_id}|${s.source_type}`; bySpotType.set(k2, (bySpotType.get(k2) ?? 0) + 1);
    if (s.is_primary) primaryPerSpot.set(s.city_spot_id, (primaryPerSpot.get(s.city_spot_id) ?? 0) + 1);
  }
  for (const [k, spots] of byTypeKey) if (spots.size > 1) sc.push(`identity ${k} → ${spots.size} spots`);
  for (const [k, n] of bySpotType) if (n > 1) sc.push(`provider ${k} × ${n}`);
  const spc = [...primaryPerSpot.values()].filter(n => n > 1).length;
  const byUrl = new Map<string, number>(); const imgPrimary = new Map<number, number>();
  for (const i of r.images) {
    if (i.image_url.length < 1 || i.image_url.length > 2048 || i.rights_status.length < 1 || i.rights_status.length > 64) ic.push(`length ${i.canonical_id}`);
    const k = `${i.city_spot_id}|${i.image_url}`; byUrl.set(k, (byUrl.get(k) ?? 0) + 1);
    if (i.is_primary) imgPrimary.set(i.city_spot_id, (imgPrimary.get(i.city_spot_id) ?? 0) + 1);
    if (i.display_eligible && NEVER_ELIGIBLE.has(i.rights_status)) rv.push(`${i.canonical_id} ${i.rights_status} eligible`);
  }
  for (const [k, n] of byUrl) if (n > 1) ic.push(`url ${k} × ${n}`);
  const ipc = [...imgPrimary.values()].filter(n => n > 1).length;
  return { source_planned: r.sources.length, image_planned: r.images.length, source_unresolved: r.unresolved.filter(u => u.kind === "source").length, image_unresolved: r.unresolved.filter(u => u.kind === "image").length, source_conflicts: sc, image_conflicts: ic, rights_violations: rv, source_primary_conflicts: spc, image_primary_conflicts: ipc };
}

// ── REST helpers ───────────────────────────────────────────────────────────────
function headers(t: RestTarget, extra: Record<string, string> = {}): Record<string, string> {
  return { apikey: t.serviceKey, Authorization: `Bearer ${t.serviceKey}`, "Content-Type": "application/json", ...extra };
}
const inList = (vals: ReadonlyArray<string | number>) => encodeURIComponent(vals.map(v => (typeof v === "number" ? String(v) : `"${String(v).replace(/"/g, "")}"`)).join(","));
async function getJson<T>(f: FetchLike, t: RestTarget, path: string): Promise<T[]> {
  const res = await f(`${t.url}/rest/v1/${path}`, { method: "GET", headers: headers(t) });
  if (!res.ok) throw new StageIdentityError(`GET ${path.split("?")[0]} failed: HTTP ${res.status}`);
  return JSON.parse(await res.text()) as T[];
}
async function patchById(f: FetchLike, t: RestTarget, table: string, id: number, body: Record<string, unknown>): Promise<void> {
  const res = await f(`${t.url}/rest/v1/${table}?id=eq.${id}`, { method: "PATCH", headers: headers(t, { Prefer: "return=minimal" }), body: JSON.stringify(body) });
  if (!res.ok) throw new StageIdentityError(`PATCH ${table}#${id} failed: HTTP ${res.status}`);
}
async function insertRows<T>(f: FetchLike, t: RestTarget, table: string, rows: Record<string, unknown>[], select: string): Promise<{ ok: true; rows: T[] } | { ok: false; conflict: boolean; status: number }> {
  const res = await f(`${t.url}/rest/v1/${table}?select=${select}`, { method: "POST", headers: headers(t, { Prefer: "return=representation" }), body: JSON.stringify(rows) });
  if (res.ok) return { ok: true, rows: JSON.parse(await res.text()) as T[] };
  const text = await res.text();
  return { ok: false, conflict: res.status === 409 || /23505|duplicate key/i.test(text), status: res.status };
}
function sameValue(a: unknown, b: unknown): boolean { return (a ?? null) === (b ?? null); }

export interface SourceSyncResult { planned: number; reused_exact: number; updated_to_final: number; inserted: number; unchanged: number; legacy_demoted: number; failed: number; sourceIdByKey: Map<string, number>; }
interface ExistingSource { id: number; city_spot_id: number; source_type: string; source_key: string; candidate_id: string | null; source_url: string | null; source_tier: string | null; is_primary: boolean; as_of: string | null; }

/**
 * 한 chunk(여러 spot)의 Final source 관계를 적용한다. lookup → 분류 → Case B 실패 → primary 해제 → PATCH/INSERT → legacy 비주요화.
 * 멱등: 두 번째 실행은 unchanged 만 늘어난다. DELETE 없음.
 */
export async function syncSourcesChunk(f: FetchLike, t: RestTarget, finals: ResolvedSource[]): Promise<SourceSyncResult> {
  const r: SourceSyncResult = { planned: finals.length, reused_exact: 0, updated_to_final: 0, inserted: 0, unchanged: 0, legacy_demoted: 0, failed: 0, sourceIdByKey: new Map() };
  if (finals.length === 0) return r;
  const spotIds = [...new Set(finals.map(s => s.city_spot_id))];
  const existingBySpot = await getJson<ExistingSource>(f, t, `city_spot_sources?select=id,city_spot_id,source_type,source_key,candidate_id,source_url,source_tier,is_primary,as_of&city_spot_id=in.(${inList(spotIds)})`);
  // Case B 탐지: 같은 (source_type, source_key) 가 다른 spot 에 붙어 있는가 — type 별 조회
  const byType = new Map<string, string[]>();
  for (const s of finals) byType.set(s.source_type, [...(byType.get(s.source_type) ?? []), s.source_key]);
  const existingByIdentity = new Map<string, ExistingSource>();
  for (const [type, keys] of byType) {
    const rows = await getJson<ExistingSource>(f, t, `city_spot_sources?select=id,city_spot_id,source_type,source_key,candidate_id,source_url,source_tier,is_primary,as_of&source_type=eq.${encodeURIComponent(type)}&source_key=in.(${inList(keys)})`);
    for (const e of rows) existingByIdentity.set(`${e.source_type}|${e.source_key}`, e);
  }
  const existingSpotType = new Map<string, ExistingSource>();
  for (const e of existingBySpot) existingSpotType.set(`${e.city_spot_id}|${e.source_type}`, e);
  const finalKeys = new Set(finals.map(s => `${s.source_type}|${s.source_key}`));
  const finalSpotType = new Set(finals.map(s => `${s.city_spot_id}|${s.source_type}`));

  // Case B: identity 가 다른 spot 에 존재 → 실패(자동 remap 금지)
  for (const s of finals) {
    const e = existingByIdentity.get(`${s.source_type}|${s.source_key}`);
    if (e && e.city_spot_id !== s.city_spot_id) throw new StageIdentityError(`source identity ${s.source_type}:${s.source_key} is attached to city_spot #${e.city_spot_id}, expected #${s.city_spot_id} (no auto remap)`);
  }
  // primary 정리: Final primary 가 아닌 기존 primary 는 먼저 해제(partial UNIQUE 충돌 방지)
  const finalPrimaryBySpot = new Map<number, ResolvedSource>();
  for (const s of finals) if (s.is_primary) finalPrimaryBySpot.set(s.city_spot_id, s);
  for (const e of existingBySpot) {
    const fp = finalPrimaryBySpot.get(e.city_spot_id);
    const isFinalPrimaryRow = fp && (`${e.source_type}|${e.source_key}` === `${fp.source_type}|${fp.source_key}` || (`${e.city_spot_id}|${e.source_type}` === `${fp.city_spot_id}|${fp.source_type}`));
    if (e.is_primary && fp && !isFinalPrimaryRow) { await patchById(f, t, "city_spot_sources", e.id, { is_primary: false }); e.is_primary = false; }
  }
  // Final 행 적용
  const toInsert: ResolvedSource[] = [];
  for (const s of finals) {
    const body = { city_spot_id: s.city_spot_id, source_type: s.source_type, source_key: s.source_key, candidate_id: s.candidate_id, source_url: s.source_url, source_tier: s.source_tier, is_primary: s.is_primary, as_of: s.as_of };
    const exact = existingByIdentity.get(`${s.source_type}|${s.source_key}`);
    const sameProvider = existingSpotType.get(`${s.city_spot_id}|${s.source_type}`);
    const row = exact ?? sameProvider;   // Case A (exact) 또는 Case C (같은 spot/provider, 다른 key → Final 로 동기화)
    if (row) {
      const diff = Object.entries(body).filter(([k, v]) => !sameValue((row as unknown as Record<string, unknown>)[k], v));
      if (diff.length === 0) { r.unchanged += 1; }
      else { await patchById(f, t, "city_spot_sources", row.id, Object.fromEntries(diff)); if (exact) r.reused_exact += 1; else r.updated_to_final += 1; }
      r.sourceIdByKey.set(`${s.source_type}|${s.source_key}`, row.id);
    } else toInsert.push(s);
  }
  if (toInsert.length > 0) {
    const bodies = toInsert.map(s => ({ city_spot_id: s.city_spot_id, source_type: s.source_type, source_key: s.source_key, candidate_id: s.candidate_id, source_url: s.source_url, source_tier: s.source_tier, is_primary: s.is_primary, as_of: s.as_of }));
    const ins = await insertRows<{ id: number; source_type: string; source_key: string }>(f, t, "city_spot_sources", bodies, "id,source_type,source_key");
    if (ins.ok) { for (const x of ins.rows) r.sourceIdByKey.set(`${x.source_type}|${x.source_key}`, x.id); r.inserted += ins.rows.length; }
    else if (ins.conflict) {
      // race: 같은 identity 가 방금 생겼다 — 재조회해 정확히 1행이면 재사용, 아니면 실패
      for (const [type, keys] of byType) {
        const rows = await getJson<ExistingSource>(f, t, `city_spot_sources?select=id,city_spot_id,source_type,source_key&source_type=eq.${encodeURIComponent(type)}&source_key=in.(${inList(keys)})`);
        for (const e of rows) { if (!finalKeys.has(`${e.source_type}|${e.source_key}`)) continue; r.sourceIdByKey.set(`${e.source_type}|${e.source_key}`, e.id); }
      }
      const missing = toInsert.filter(s => !r.sourceIdByKey.has(`${s.source_type}|${s.source_key}`));
      if (missing.length > 0) throw new StageIdentityError(`source conflict recovery incomplete: ${missing.length} rows`);
      r.reused_exact += toInsert.length;
    } else throw new StageIdentityError(`source insert failed: HTTP ${ins.status}`);
  }
  // Case D: Final 에 없는 legacy source — 비주요화(보존). 이미 false 면 no-op.
  for (const e of existingBySpot) {
    if (finalKeys.has(`${e.source_type}|${e.source_key}`) || finalSpotType.has(`${e.city_spot_id}|${e.source_type}`)) continue;
    if (e.is_primary) { await patchById(f, t, "city_spot_sources", e.id, { is_primary: false }); r.legacy_demoted += 1; }
  }
  return r;
}

export interface ImageSyncResult { planned: number; reused_exact: number; updated_to_final: number; inserted: number; unchanged: number; legacy_suppressed: number; failed: number; }
interface ExistingImage { id: number; city_spot_id: number; image_url: string; rights_status: string; attribution_required: boolean; rights_note: string | null; display_eligible: boolean; is_primary: boolean; sort_order: number; source_id: number | null; as_of: string | null; }

/** Final image 관계 적용. Final 에 없는 legacy image 는 display_eligible=false·is_primary=false(보존). RIGHTS_UNKNOWN 은 절대 eligible 로 쓰지 않는다. */
export async function syncImagesChunk(f: FetchLike, t: RestTarget, finals: ResolvedImage[], sourceIdForCanonical: (canonicalId: string) => number | null, spotsInScope?: number[]): Promise<ImageSyncResult> {
  const r: ImageSyncResult = { planned: finals.length, reused_exact: 0, updated_to_final: 0, inserted: 0, unchanged: 0, legacy_suppressed: 0, failed: 0 };
  const spotIds = [...new Set([...finals.map(i => i.city_spot_id), ...(spotsInScope ?? [])])];
  if (spotIds.length === 0) return r;
  for (const i of finals) if (i.display_eligible && NEVER_ELIGIBLE.has(i.rights_status)) throw new StageIdentityError(`rights violation ${i.canonical_id}: ${i.rights_status} cannot be display_eligible`);
  const existing = await getJson<ExistingImage>(f, t, `city_spot_images?select=id,city_spot_id,image_url,rights_status,attribution_required,rights_note,display_eligible,is_primary,sort_order,source_id,as_of&city_spot_id=in.(${inList(spotIds)})`);
  const byKey = new Map<string, ExistingImage>();
  for (const e of existing) byKey.set(`${e.city_spot_id}|${e.image_url}`, e);
  const finalKeys = new Set(finals.map(i => `${i.city_spot_id}|${i.image_url}`));
  const finalPrimary = new Map<number, string>();
  for (const i of finals) if (i.is_primary) finalPrimary.set(i.city_spot_id, i.image_url);
  // 1) Final 에 없는 legacy image → 비노출·비주요화 (먼저 해서 primary partial UNIQUE 충돌을 막는다)
  for (const e of existing) {
    if (finalKeys.has(`${e.city_spot_id}|${e.image_url}`)) continue;
    const body: Record<string, unknown> = {};
    if (e.display_eligible) body.display_eligible = false;
    if (e.is_primary) body.is_primary = false;
    if (Object.keys(body).length) { await patchById(f, t, "city_spot_images", e.id, body); r.legacy_suppressed += 1; }
  }
  // 2) Final primary 가 아닌 기존 Final-행 primary 해제
  for (const e of existing) {
    if (!finalKeys.has(`${e.city_spot_id}|${e.image_url}`)) continue;
    if (e.is_primary && finalPrimary.get(e.city_spot_id) !== e.image_url) { await patchById(f, t, "city_spot_images", e.id, { is_primary: false }); e.is_primary = false; }
  }
  // 3) Final 행 적용
  const toInsert: ResolvedImage[] = [];
  for (const i of finals) {
    const body = { city_spot_id: i.city_spot_id, image_url: i.image_url, rights_status: i.rights_status, attribution_required: i.attribution_required, rights_note: i.rights_note, display_eligible: i.display_eligible, is_primary: i.is_primary, sort_order: i.sort_order, source_id: sourceIdForCanonical(i.canonical_id), as_of: i.as_of };
    const e = byKey.get(`${i.city_spot_id}|${i.image_url}`);
    if (e) {
      const diff = Object.entries(body).filter(([k, v]) => !sameValue((e as unknown as Record<string, unknown>)[k], v));
      if (diff.length === 0) r.unchanged += 1; else { await patchById(f, t, "city_spot_images", e.id, Object.fromEntries(diff)); r.reused_exact += 1; }
    } else toInsert.push(i);
  }
  if (toInsert.length > 0) {
    const bodies = toInsert.map(i => ({ city_spot_id: i.city_spot_id, image_url: i.image_url, rights_status: i.rights_status, attribution_required: i.attribution_required, rights_note: i.rights_note, display_eligible: i.display_eligible, is_primary: i.is_primary, sort_order: i.sort_order, source_id: sourceIdForCanonical(i.canonical_id), as_of: i.as_of }));
    const ins = await insertRows<{ id: number }>(f, t, "city_spot_images", bodies, "id");
    if (ins.ok) r.inserted += ins.rows.length;
    else if (ins.conflict) {
      const again = await getJson<ExistingImage>(f, t, `city_spot_images?select=id,city_spot_id,image_url&city_spot_id=in.(${inList(spotIds)})`);
      const have = new Set(again.map(e => `${e.city_spot_id}|${e.image_url}`));
      const missing = toInsert.filter(i => !have.has(`${i.city_spot_id}|${i.image_url}`));
      if (missing.length > 0) throw new StageIdentityError(`image conflict recovery incomplete: ${missing.length} rows`);
      r.reused_exact += toInsert.length;
    } else throw new StageIdentityError(`image insert failed: HTTP ${ins.status}`);
  }
  return r;
}
