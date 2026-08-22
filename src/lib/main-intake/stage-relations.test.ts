/**
 * TASK-FIVE-CITY-CORE-STAGE-WRITER-COMPLETION-V1 — source/image writer · snapshot · chunk receipt · user-count guard · NEW false 검증
 * Run: node --experimental-strip-types --test src/lib/main-intake/stage-relations.test.ts
 *
 * 가짜 PostgREST 가 city_spots/city_spot_sources/city_spot_images 의 UNIQUE/partial UNIQUE/CHECK 를 흉내낸다. Production 접근 0.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolveRelationTargets, preflightRelations, syncSourcesChunk, syncImagesChunk, type ResolvedSource, type ResolvedImage } from "./stage-relations.ts";
import { buildPreStageSnapshot, chunkReceipt, receiptsSha, readUserTableCounts, userCountsDiff, verifyNewUnpublished } from "./stage-safety.ts";
import { StageIdentityError, type FetchLike } from "./stage-rest-writer.ts";
import { planImport, type CrosswalkRow, type ImageRow, type IntakeRow, type MainSnapshotRow, type SourceRow, type UpdateAction } from "./importer-core.ts";

const ROOT = new URL("../../../", import.meta.url);
const PKG = "data/main-intake/five-city-core-v1/";
const readJsonl = <T,>(p: string): T[] => readFileSync(new URL(PKG + p, ROOT), "utf8").split(/\r?\n/).filter(l => l.trim()).map(l => JSON.parse(l) as T);
const pkgReady = existsSync(new URL(PKG + "five-city-core-sources-v1.jsonl", ROOT));
const T = { url: "https://example.supabase.co", serviceKey: "k" };

type Row = Record<string, unknown> & { id: number };
/** 가짜 PostgREST(058 적용 후 schema): GET(eq/in 필터) · POST(return=representation, UNIQUE 검사) · PATCH(by id) · DELETE 거부 */
function fakeDb(seed: { city_spots?: Row[]; city_spot_sources?: Row[]; city_spot_images?: Row[]; user?: Record<string, number> } = {}) {
  const tables: Record<string, Row[]> = { city_spots: [...(seed.city_spots ?? [])], city_spot_sources: [...(seed.city_spot_sources ?? [])], city_spot_images: [...(seed.city_spot_images ?? [])] };
  const userCounts = seed.user ?? { itineraries: 68, trip_moments: 0, user_spots: 4, place_reports: 9 };
  let next = 1000; const log: Array<{ m: string; url: string; body?: unknown }> = []; let deletes = 0;
  const uniq = (table: string, row: Row, exclude?: number): string | null => {
    const rows = tables[table]!.filter(r => r.id !== exclude);
    const dup = (pred: (r: Row) => boolean, name: string) => rows.some(pred) ? name : null;
    if (table === "city_spot_sources") return dup(r => r.source_type === row.source_type && r.source_key === row.source_key, "uq_city_spot_sources_source")   /* 058: uq_city_spot_sources_spot_provider 제거 — (city_spot_id, source_type) 는 더 이상 UNIQUE 아님 */ ?? (row.is_primary ? dup(r => r.city_spot_id === row.city_spot_id && r.is_primary === true, "uq_city_spot_sources_primary") : null);
    if (table === "city_spot_images") { if (row.display_eligible && ["RIGHTS_UNKNOWN", "KTO_TYPE_UNKNOWN"].includes(String(row.rights_status))) return "csi_unknown_rights_not_public"; return dup(r => r.city_spot_id === row.city_spot_id && r.image_url === row.image_url, "uq_city_spot_images_spot_url") ?? (row.is_primary ? dup(r => r.city_spot_id === row.city_spot_id && r.is_primary === true, "uq_city_spot_images_primary") : null); }
    if (table === "city_spots") return row.external_id ? dup(r => r.source_type === row.source_type && r.external_id === row.external_id, "idx_city_spots_source_external") : null;
    return null;
  };
  const parseFilters = (qs: string) => { const f: Array<(r: Row) => boolean> = []; for (const [k, v] of new URLSearchParams(qs)) { if (k === "select" || k === "order" || k === "limit") continue; if (v.startsWith("eq.")) { const val = v.slice(3); f.push(r => String(r[k]) === val); } else if (v.startsWith("in.(")) { const vals = v.slice(4, -1).split(",").map(s => s.replace(/^"|"$/g, "")); f.push(r => vals.includes(String(r[k]))); } } return f; };
  const fetchLike: FetchLike = async (url, init) => {
    const u = new URL(url); const table = u.pathname.split("/").pop()!; const qs = u.search.slice(1);
    log.push({ m: init.method, url, body: init.body ? JSON.parse(init.body) : undefined });
    // 사용자 테이블: 실제 Production schema(trip_moments PK = moment_id). select 컬럼이 없으면 400 42703. limit=0 → `*/N` + body [] (row 내용 0).
    const USER_PK: Record<string, string> = { itineraries: "id", trip_moments: "moment_id", user_spots: "id", place_reports: "id" };
    if (init.method === "GET" && table in userCounts) {
      const sel = new URLSearchParams(qs).get("select") ?? "*"; const limit = new URLSearchParams(qs).get("limit");
      if (sel !== "*" && sel !== USER_PK[table]) return { ok: false, status: 400, headers: { get: () => null }, text: async () => JSON.stringify({ code: "42703", message: `column ${table}.${sel} does not exist` }) } as never;
      const n = userCounts[table]!;
      if (limit === "0") return { ok: true, status: n > 0 ? 206 : 200, headers: { get: (k: string) => (k === "content-range" ? `*/${n}` : null) }, text: async () => "[]" } as never;
      return { ok: true, status: 206, headers: { get: (k: string) => (k === "content-range" ? `0-0/${n}` : null) }, text: async () => JSON.stringify([{ [USER_PK[table]!]: "row-body-should-not-be-read" }]) } as never;
    }
    if (init.method === "GET") { const fs = parseFilters(qs); const rows = tables[table]!.filter(r => fs.every(f => f(r))); return { ok: true, status: 200, text: async () => JSON.stringify(rows) }; }
    if (init.method === "POST") { const rows = JSON.parse(init.body!) as Row[]; for (const r of rows) { const c = uniq(table, r); if (c) return { ok: false, status: 409, text: async () => JSON.stringify({ code: "23505", message: `duplicate key value violates unique constraint "${c}"` }) }; } const out = rows.map(r => { const row = { ...r, id: next++ }; tables[table]!.push(row); return row; }); return { ok: true, status: 201, text: async () => JSON.stringify(out) }; }
    if (init.method === "PATCH") { const id = Number(new URLSearchParams(qs).get("id")!.slice(3)); const row = tables[table]!.find(r => r.id === id)!; const body = JSON.parse(init.body!) as Row; const merged = { ...row, ...body }; const c = uniq(table, merged, id); if (c) return { ok: false, status: 409, text: async () => c }; Object.assign(row, body); return { ok: true, status: 204, text: async () => "" }; }
    if (init.method === "DELETE") { deletes += 1; return { ok: false, status: 405, text: async () => "forbidden" }; }
    return { ok: false, status: 405, text: async () => "" };
  };
  return { fetchLike, tables, log, deletes: () => deletes, userCounts };
}

const src = (o: Partial<ResolvedSource> & { canonical_id: string; city_spot_id: number; source_type: string; source_key: string }): ResolvedSource => ({ candidate_id: null, source_url: null, source_tier: "T", is_primary: false, as_of: "2026-08-18", ...o });
const img = (o: Partial<ResolvedImage> & { canonical_id: string; city_spot_id: number; image_url: string }): ResolvedImage => ({ rights_status: "VISITSEOUL_OFFICIAL", attribution_required: true, rights_note: null, display_eligible: true, is_primary: false, sort_order: 0, as_of: null, ...o });

test("S1/S3/S4/S8: exact identity → reuse+sync · 같은 spot/provider 다른 key → 별도 행 INSERT(058, legacy 행은 보존) · 재실행 중복 0 · DELETE 0", async () => {
  const db = fakeDb({ city_spot_sources: [{ id: 1, city_spot_id: 287, source_type: "busan-food-canonical", source_key: "busan-G-00004", is_primary: true, source_url: null, source_tier: "old", candidate_id: null, as_of: null }, { id: 2, city_spot_id: 287, source_type: "busan6260000-foodservice", source_key: "999", is_primary: false, source_url: null, source_tier: "OFFICIAL_API", candidate_id: null, as_of: null }] });
  const finals = [src({ canonical_id: "busan-G-00004", city_spot_id: 287, source_type: "busan-food-canonical", source_key: "busan-G-00004", is_primary: true, source_tier: "busan-mat-2026" }), src({ canonical_id: "busan-G-00004", city_spot_id: 287, source_type: "busan6260000-foodservice", source_key: "1506" }), src({ canonical_id: "busan-G-00004", city_spot_id: 287, source_type: "visitbusan-web", source_key: "x1" })];
  const r1 = await syncSourcesChunk(db.fetchLike, T, finals);
  assert.deepEqual({ reused: r1.reused_exact, updated: r1.updated_to_final, inserted: r1.inserted, unchanged: r1.unchanged }, { reused: 1, updated: 1, inserted: 2, unchanged: 0 });
  assert.equal(db.tables.city_spot_sources.find(r => r.id === 2)!.source_key, "999", "058: legacy 행을 다른 key 로 덮어쓰지 않음(관계 의미 불변) — Final key 는 별도 행");
  assert.equal(db.tables.city_spot_sources.filter(r => r.city_spot_id === 287 && r.source_type === "busan6260000-foodservice").length, 2);
  assert.equal(db.tables.city_spot_sources.find(r => r.id === 1)!.source_tier, "busan-mat-2026", "Case A: Final 값 우선");
  const r2 = await syncSourcesChunk(db.fetchLike, T, finals);
  assert.deepEqual({ inserted: r2.inserted, unchanged: r2.unchanged }, { inserted: 0, unchanged: 3 });
  assert.equal(db.tables.city_spot_sources.length, 4, "legacy 2 + Final INSERT 2(1506·x1) — legacy 999 보존, DELETE 0"); assert.equal(db.deletes(), 0);
  assert.equal(db.tables.city_spot_sources.filter(r => r.city_spot_id === 287 && r.is_primary).length, 1);
});

test("S2: 같은 source identity 가 다른 spot 에 붙어 있으면 자동 remap 금지 → 실패(쓰기 0)", async () => {
  const db = fakeDb({ city_spot_sources: [{ id: 1, city_spot_id: 999, source_type: "kto", source_key: "126626", is_primary: true }] });
  await assert.rejects(syncSourcesChunk(db.fetchLike, T, [src({ canonical_id: "KTO-126626", city_spot_id: 5001, source_type: "kto", source_key: "126626", is_primary: true })]), /attached to city_spot #999/);
  assert.ok(db.log.every(l => l.m === "GET"), "실패 전 쓰기 없음");
});

test("S5/S7: Final primary 가 다르면 기존 primary 해제 후 설정(primary ≤1) · Final 에 없는 legacy source 는 비주요화(보존)", async () => {
  const db = fakeDb({ city_spot_sources: [{ id: 1, city_spot_id: 10, source_type: "legacy-import", source_key: "L1", is_primary: true }, { id: 2, city_spot_id: 10, source_type: "kto", source_key: "77", is_primary: false }] });
  const r = await syncSourcesChunk(db.fetchLike, T, [src({ canonical_id: "c", city_spot_id: 10, source_type: "kto", source_key: "77", is_primary: true })]);
  const rows = db.tables.city_spot_sources;
  assert.equal(rows.filter(x => x.city_spot_id === 10 && x.is_primary).length, 1);
  assert.equal(rows.find(x => x.id === 2)!.is_primary, true); assert.equal(rows.find(x => x.id === 1)!.is_primary, false);
  assert.equal(r.legacy_demoted, 0, "legacy 는 primary 해제 단계에서 이미 내려감"); assert.equal(rows.length, 2, "DELETE 없음");
  await syncSourcesChunk(db.fetchLike, T, [src({ canonical_id: "c", city_spot_id: 10, source_type: "kto", source_key: "77", is_primary: true })]);
  assert.equal(rows.filter(x => x.city_spot_id === 10 && x.is_primary).length, 1);
});

test("S6/T2: unresolved actual id → write 전 실패 · 구조 preflight 가 UNIQUE/primary/rights 충돌을 잡는다", () => {
  const xw: CrosswalkRow[] = [{ city: "seoul", canonical_id: "n1", service_status: "ACTIVE", main_city_spot_id: null, decision: "NEW", tier: "NEW" }, { city: "busan", canonical_id: "m1", service_status: "ACTIVE", main_city_spot_id: 287, decision: "MATCH_REPLACE", tier: "T1" }, { city: "busan", canonical_id: "tw", service_status: "ACTIVE", main_city_spot_id: null, decision: "CONFIRMED_TWIN", tier: "S", twin_of: "m1" }];
  const S: SourceRow[] = [{ canonical_id: "n1", source_type: "visitseoul", source_key: "a", candidate_id: null, source_url: null, source_tier: null, is_primary: true, as_of: null }, { canonical_id: "m1", source_type: "kto", source_key: "a", candidate_id: null, source_url: null, source_tier: null, is_primary: true, as_of: null }, { canonical_id: "tw", source_type: "x", source_key: "z", candidate_id: null, source_url: null, source_tier: null, is_primary: true, as_of: null }];
  const r = resolveRelationTargets({ sources: S, images: [], crosswalk: xw, newIdByCanonical: new Map() });
  assert.equal(r.unresolved.length, 1); assert.equal(r.skipped_not_written, 1, "twin 의 source 는 쓰지 않는다");
  const ok = resolveRelationTargets({ sources: S, images: [{ canonical_id: "m1", image_url: "u", rights_status: "RIGHTS_UNKNOWN", attribution_required: true, rights_note: null, display_eligible: true, is_primary: true, sort_order: 0, as_of: null }], crosswalk: xw, newIdByCanonical: new Map([["n1", 5001]]) });
  const p = preflightRelations(ok);
  assert.equal(p.source_unresolved, 0); assert.equal(p.rights_violations.length, 1);
  const dupSpot = resolveRelationTargets({ sources: [...S, { ...S[1]!, source_key: "b", is_primary: true }], images: [], crosswalk: xw, newIdByCanonical: new Map([["n1", 5001]]) });
  const p2 = preflightRelations(dupSpot);
  assert.deepEqual(p2.source_conflicts, [], "058: 같은 provider 다른 key 는 구조 충돌 아님"); assert.equal(p2.source_primary_conflicts, 1);
});

test("I1~I9: Final image 동기화 · Final 에 없는 legacy image 비노출/비주요화 · Final 없음→legacy fallback 없음 · RIGHTS_UNKNOWN · source_id · 재실행 · primary ≤1 · DELETE 0", async () => {
  const db = fakeDb({ city_spot_images: [
    { id: 1, city_spot_id: 300, image_url: "https://legacy/wrong.jpg", rights_status: "Type1", display_eligible: true, is_primary: true, sort_order: 0, source_id: 55, attribution_required: true, rights_note: null, as_of: null },
    { id: 2, city_spot_id: 300, image_url: "https://final/a.jpg", rights_status: "Type3", display_eligible: true, is_primary: false, sort_order: 0, source_id: null, attribution_required: true, rights_note: null, as_of: null },
    { id: 3, city_spot_id: 301, image_url: "https://legacy/only.jpg", rights_status: "Type1", display_eligible: true, is_primary: true, sort_order: 0, source_id: null, attribution_required: true, rights_note: null, as_of: null },
  ] });
  const finals = [img({ canonical_id: "c300", city_spot_id: 300, image_url: "https://final/a.jpg", rights_status: "Type3", is_primary: true }), img({ canonical_id: "c300", city_spot_id: 300, image_url: "https://final/b.jpg", rights_status: "KTO_TYPE_UNKNOWN", display_eligible: false })];
  const r = await syncImagesChunk(db.fetchLike, T, finals, cid => (cid === "c300" ? 77 : null), [300, 301]);
  const rows = db.tables.city_spot_images;
  assert.equal(rows.find(x => x.id === 1)!.display_eligible, false); assert.equal(rows.find(x => x.id === 1)!.is_primary, false);   // I2 legacy not in Final → suppressed
  assert.equal(rows.find(x => x.id === 2)!.is_primary, true); assert.equal(rows.find(x => x.id === 2)!.source_id, 77);             // I1/I5 Final exact reuse + Final source_id
  assert.equal(rows.find(x => x.id === 3)!.display_eligible, false, "I3: Final image 없는 spot 의 legacy 도 fallback 없이 비노출");
  assert.equal(rows.filter(x => x.image_url === "https://final/b.jpg")[0]!.display_eligible, false);                              // I4
  assert.deepEqual({ reused: r.reused_exact, inserted: r.inserted, suppressed: r.legacy_suppressed }, { reused: 1, inserted: 1, suppressed: 2 });
  assert.equal(rows.filter(x => x.city_spot_id === 300 && x.is_primary).length, 1);                                               // I7
  const r2 = await syncImagesChunk(db.fetchLike, T, finals, () => 77, [300, 301]);
  assert.equal(r2.inserted, 0); assert.equal(r2.unchanged, 2); assert.equal(rows.length, 4); assert.equal(db.deletes(), 0);      // I6/I9
  await assert.rejects(syncImagesChunk(db.fetchLike, T, [img({ canonical_id: "x", city_spot_id: 300, image_url: "u", rights_status: "RIGHTS_UNKNOWN", display_eligible: true })], () => null), /rights violation/);
  // I8: 잘못된 spot 매핑은 resolve 단계에서 unresolved 로 막힌다(위 S6)
});

test("T1/T3/T4/T5/T6: NEW false 사후검증 · mapping 유일성 · user-count guard · chunk receipt/snapshot 결정적", async () => {
  const db = fakeDb({ city_spots: [{ id: 5001, is_published: false, name: "A", city: "seoul" }, { id: 5002, is_published: true, name: "B", city: "seoul" }, { id: 287, name: "Tonshou PNU", description: "old", image_url: "https://img.old/x.jpg", city: "busan" }] });
  const v = await verifyNewUnpublished(db.fetchLike, T, [5001, 5002, 5003]);
  assert.deepEqual(v, { checked: 3, published_true: 1, missing: 1 });
  const pre = await readUserTableCounts(db.fetchLike, T);
  assert.deepEqual(pre, { itineraries: 68, trip_moments: 0, user_spots: 4, place_reports: 9 });
  assert.deepEqual(userCountsDiff(pre, { ...pre, itineraries: 69 }), ["itineraries: 68 → 69"]); assert.deepEqual(userCountsDiff(pre, pre), []);
  const a = chunkReceipt({ phase: "SOURCES", chunk_index: 3, expected: 2, looked_up: 2, reused: 1, updated: 0, inserted: 1, unchanged: 0, suppressed: 0, failed: 0, retry_count: 0, timestamp: "t" }, ["kto|1", "kto|2"]);
  const b = chunkReceipt({ phase: "SOURCES", chunk_index: 3, expected: 2, looked_up: 2, reused: 1, updated: 0, inserted: 1, unchanged: 0, suppressed: 0, failed: 0, retry_count: 0, timestamp: "t" }, ["kto|1", "kto|2"]);
  assert.equal(a.content_sha256, b.content_sha256); assert.equal(receiptsSha([a]), receiptsSha([b]));
  const upd: UpdateAction = { action: "UPDATE", main_city_spot_id: 287, canonical_id: "busan-G-00004", city: "busan", fields: [], writes: { name: "Tonshou", image_url: "https://img.new/y.jpg", is_published: true }, old_summary: { name: "Tonshou PNU", category: "restaurant", had_image: true }, new_summary: { name: "Tonshou", category: "restaurant", has_image: true }, sources_upsert: 0, images_upsert: 0 };
  const s1 = await buildPreStageSnapshot(db.fetchLike, T, [upd], "m", "2026-08-22T00:00:00Z");
  const s2 = await buildPreStageSnapshot(db.fetchLike, T, [upd], "m", "2026-08-22T00:00:00Z");
  assert.equal(s1.sha256, s2.sha256); assert.equal(s1.rows.length, 1);
  assert.deepEqual(s1.rows[0]!.before, { image_url: "https://img.old/x.jpg", name: "Tonshou PNU" }); assert.deepEqual(s1.rows[0]!.fields_to_write, ["image_url", "name"]);
  assert.ok(!JSON.stringify(s1.rows).includes("device"), "사용자 데이터 없음");
});

test("T9/T10: importer 스크립트 배선 — phases A~E · snapshot/receipt/count guard · DELETE 없음 · 테스트는 Production 명령을 호출하지 않음", () => {
  const s = readFileSync(new URL("scripts/import-five-city-core-v1.ts", ROOT), "utf8");
  for (const g of ["stageInsertChunkSafe(", "syncSourcesChunk(", "syncImagesChunk(", "buildPreStageSnapshot(", "readUserTableCounts(", "verifyNewUnpublished(", "stage-chunk-receipts-v1.jsonl", "FIVE_CITY_CORE_APPLY", "FIVE_CITY_CORE_TARGET_HOST", "--expected-db-count", "STAGE_REFUSED"]) assert.ok(s.includes(g), g);
  assert.ok(!/method:\s*"DELETE"|\.delete\(/.test(s));
  assert.ok(!/on_conflict=/.test(readFileSync(new URL("src/lib/main-intake/stage-relations.ts", ROOT), "utf8")));
  assert.equal(process.env.FIVE_CITY_CORE_APPLY, undefined, "테스트 환경에서 apply env 없음");
});

test("R: 실제 package — Final source/image plan 이 schema 구조 검사를 통과한다(품질 검증 아님)", { skip: !pkgReady }, () => {
  const S = readJsonl<SourceRow>("five-city-core-sources-v1.jsonl"); const I = readJsonl<ImageRow>("five-city-core-images-v1.jsonl");
  const xw = readJsonl<CrosswalkRow>("five-city-core-crosswalk-v1.jsonl");
  const intake = readJsonl<IntakeRow>("five-city-core-active-v1.jsonl"); const main = readJsonl<MainSnapshotRow>("main-city-spots-snapshot-2026-08-22-v1.jsonl");
  const plan = planImport({ intake, sources: S, images: I, crosswalk: xw, main, mainClassification: [], expectedActiveTotal: 4826 });
  const ph = new Map(plan.inserts.map((i, idx) => [i.canonical_id, -(idx + 1)]));
  const r = resolveRelationTargets({ sources: S, images: I, crosswalk: xw, newIdByCanonical: ph });
  const p = preflightRelations(r);
  assert.equal(p.source_planned, 5502); assert.equal(p.image_planned, 4394);
  assert.equal(p.source_unresolved, 0); assert.equal(p.image_unresolved, 0);
  assert.deepEqual(p.source_conflicts, []); assert.deepEqual(p.image_conflicts, []); assert.deepEqual(p.rights_violations, []);
  assert.equal(p.source_primary_conflicts, 0); assert.equal(p.image_primary_conflicts, 0);
  // 전주 OFF 레코드의 근접 kto_cid 는 provenance 가 아니다 — kto 출처는 artifact 가 확정한 경우만
  const offKto = S.filter(s => s.canonical_id.startsWith("OFF-") && s.source_type === "kto").map(s => s.canonical_id).sort();
  assert.deepEqual(offKto, ["OFF-10114", "OFF-16133", "OFF-16310", "OFF-16670"], "artifact 가 CONFIRMED_MERGE/EXACT/STRONG 으로 확정한 4건만 kto 출처");
});
