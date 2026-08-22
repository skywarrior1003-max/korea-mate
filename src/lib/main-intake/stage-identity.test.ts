/**
 * TASK-FIVE-CITY-CORE-POSTGREST-CONFLICT-COMPATIBILITY-V1 — STAGE identity flow (lookup-before-insert + conflict recovery)
 * Run: node --experimental-strip-types --test src/lib/main-intake/stage-identity.test.ts
 *
 * 가짜 PostgREST: city_spots 테이블을 partial unique index (source_type, external_id) WHERE external_id IS NOT NULL 로 흉내낸다.
 * `on_conflict` 파라미터는 42P10 으로 거부한다(Production EXPLAIN 실측과 동일). DB/Production 접근 0.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planImport, type CrosswalkRow, type IntakeRow, type MainSnapshotRow, type MainClassificationRow } from "./importer-core.ts";
import { stageInsertChunkSafe, stageUpdateRow, lookupExistingByExternalIds, StageIdentityError, type FetchLike } from "./stage-rest-writer.ts";
import { buildStagePlan } from "./stage-plan.ts";

const ROOT = new URL("../../../", import.meta.url);
const base = { service_status: "ACTIVE", name_l10n: null, description: null, desc_l10n: null, why_it_matters: null, why_l10n: null, district: null, official_url: null, map_url: null, naver_map_url: null, opening_hours: null, tags: null, image_url: null, subcategory: null, semantic_category: "restaurant", category: "restaurant", address: null };

/** partial unique (source_type, external_id) WHERE external_id IS NOT NULL 을 가진 가짜 테이블 + PostgREST 흉내 */
function fakePostgrest(seed: Array<{ id: number; source_type: string; external_id: string | null; name: string }> = [], opts: { raceOnInsert?: Set<string>; alwaysConflict?: boolean } = {}) {
  const table = [...seed]; let nextId = Math.max(0, ...seed.map(r => r.id)) + 1;
  const log: Array<{ method: string; url: string; body?: unknown }> = [];
  const fetchLike: FetchLike = async (url, init) => {
    log.push({ method: init.method, url, body: init.body ? JSON.parse(init.body) : undefined });
    if (/on_conflict=/.test(url)) return { ok: false, status: 400, text: async () => JSON.stringify({ code: "42P10", message: "there is no unique or exclusion constraint matching the ON CONFLICT specification" }) };
    if (init.method === "GET") {
      const m = url.match(/external_id=in\.\((.*)\)$/); const ids = m ? decodeURIComponent(m[1]!).split(",").map(s => s.replace(/^"|"$/g, "")) : [];
      const rows = table.filter(r => r.source_type === "canonical" && r.external_id !== null && ids.includes(r.external_id)).map(r => ({ id: r.id, external_id: r.external_id }));
      return { ok: true, status: 200, text: async () => JSON.stringify(rows) };
    }
    if (init.method === "POST") {
      const rows = JSON.parse(init.body!) as Array<{ source_type: string; external_id: string; name: string }>;
      if (opts.alwaysConflict) return { ok: false, status: 409, text: async () => JSON.stringify({ code: "23505", message: "duplicate key value violates unique constraint" }) };
      // race 시뮬레이션: 요청 도착 직전에 다른 주체가 같은 identity 를 넣었다
      for (const r of rows) if (opts.raceOnInsert?.has(r.external_id) && !table.some(t => t.external_id === r.external_id)) table.push({ id: nextId++, source_type: "canonical", external_id: r.external_id, name: "raced" });
      // partial unique 검사 — 요청 전체가 한 트랜잭션: 하나라도 충돌이면 전부 실패
      if (rows.some(r => r.external_id !== null && table.some(t => t.source_type === r.source_type && t.external_id === r.external_id))) {
        return { ok: false, status: 409, text: async () => JSON.stringify({ code: "23505", message: "duplicate key value violates unique constraint \"idx_city_spots_source_external\"" }) };
      }
      const inserted = rows.map(r => { const row = { id: nextId++, source_type: r.source_type, external_id: r.external_id, name: r.name }; table.push(row); return { id: row.id, external_id: row.external_id }; });
      return { ok: true, status: 201, text: async () => JSON.stringify(inserted) };
    }
    if (init.method === "PATCH") return { ok: true, status: 204, text: async () => "" };
    return { ok: false, status: 405, text: async () => "" };
  };
  return { fetchLike, table, log };
}

function plan(n: number, extra: Partial<IntakeRow>[] = []) {
  const intake: IntakeRow[] = []; const xw: CrosswalkRow[] = [];
  for (let i = 0; i < n; i++) { intake.push({ ...base, canonical_id: `seoul-N-${i}`, city: "seoul", name: `Place ${i}`, lat: 37, lng: 127 }); xw.push({ city: "seoul", canonical_id: `seoul-N-${i}`, service_status: "ACTIVE", main_city_spot_id: null, decision: "NEW", decision_basis: "ARTIFACT_SERVICE_STATUS", tier: "NEW" }); }
  for (const e of extra) { intake.push({ ...base, lat: 37, lng: 127, ...e } as IntakeRow); xw.push({ city: e.city!, canonical_id: e.canonical_id!, service_status: "ACTIVE", main_city_spot_id: null, decision: "NEW", decision_basis: "ARTIFACT_SERVICE_STATUS", tier: "NEW" }); }
  const p = planImport({ intake, sources: [], images: [], crosswalk: xw, main: [], mainClassification: [], expectedActiveTotal: intake.length });
  assert.deepEqual(p.errors, []);
  return p.inserts.map(i => ({ ...i, row: { ...i.row, is_published: false } as Record<string, unknown> }));
}
const T = { url: "https://example.supabase.co", serviceKey: "k" };

test("T1 first insert — canonical 행 없음 → INSERT n · 실제 id 반환 · on_conflict 미사용", async () => {
  const srv = fakePostgrest(); const rows = plan(5);
  const out = await stageInsertChunkSafe(srv.fetchLike, T, rows);
  assert.equal(out.length, 5); assert.ok(out.every(o => o.reused_existing === false && Number.isInteger(o.id)));
  assert.equal(srv.table.length, 5);
  assert.ok(srv.log.every(l => !/on_conflict=/.test(l.url)), "PostgREST on_conflict 는 partial unique index 와 호환되지 않으므로 쓰지 않는다");
  assert.equal(srv.log.filter(l => l.method === "POST").length, 1);
});

test("T2 exact retry — 같은 chunk 재실행 → INSERT 0 · 같은 numeric id 재사용", async () => {
  const srv = fakePostgrest(); const rows = plan(5);
  const a = await stageInsertChunkSafe(srv.fetchLike, T, rows);
  const posts = srv.log.filter(l => l.method === "POST").length;
  const b = await stageInsertChunkSafe(srv.fetchLike, T, rows);
  assert.deepEqual(b.map(o => o.id), a.map(o => o.id));
  assert.ok(b.every(o => o.reused_existing));
  assert.equal(srv.log.filter(l => l.method === "POST").length, posts, "재실행에 INSERT 0");
  assert.equal(srv.table.length, 5, "중복 행 0");
});

test("T3 partial-stage retry — 일부만 존재 → 기존 재사용 + 없는 것만 INSERT", async () => {
  const rows = plan(6);
  const srv = fakePostgrest(rows.slice(0, 2).map((r, i) => ({ id: 900 + i, source_type: "canonical", external_id: String(r.row.external_id), name: "pre" })));
  const out = await stageInsertChunkSafe(srv.fetchLike, T, rows);
  assert.deepEqual(out.slice(0, 2).map(o => [o.id, o.reused_existing]), [[900, true], [901, true]]);
  assert.ok(out.slice(2).every(o => !o.reused_existing));
  assert.equal(srv.table.length, 6);
  const post = srv.log.find(l => l.method === "POST")!; assert.equal((post.body as unknown[]).length, 4, "없는 4건만 INSERT");
});

test("T4 same display name, different canonical → 별도 행 (identity 는 external_id)", async () => {
  const srv = fakePostgrest();
  const rows = plan(0, [{ canonical_id: "jeonju-KTO-2870672", city: "jeonju", name: "진미반점" }, { canonical_id: "jeonju-KTO-3444028", city: "jeonju", name: "진미반점" }]);
  const out = await stageInsertChunkSafe(srv.fetchLike, T, rows);
  assert.equal(out.length, 2); assert.notEqual(out[0]!.id, out[1]!.id);
  assert.equal(srv.table.filter(r => r.name === "진미반점").length, 2);
});

test("T5 unique race/conflict — INSERT 가 23505 → canonical 재조회 → race 행 재사용(정확히 1행) + 나머지만 재INSERT · 중복 0", async () => {
  const rows = plan(4);
  const raced = String(rows[2]!.row.external_id);
  const srv = fakePostgrest([], { raceOnInsert: new Set([raced]) });
  const out = await stageInsertChunkSafe(srv.fetchLike, T, rows);
  assert.equal(out.length, 4);
  assert.equal(out[2]!.reused_existing, true, "race 로 생긴 행을 재사용");
  assert.ok(out.filter(o => !o.reused_existing).length === 3);
  assert.equal(srv.table.length, 4, "중복 생성 0 · 부분 INSERT 없음(첫 요청은 문장 전체 실패)");
  assert.equal(srv.table.filter(r => r.external_id === raced).length, 1);
  assert.deepEqual(srv.log.map(l => l.method), ["GET", "POST", "GET", "POST"], "lookup → insert(409) → re-lookup → insert(remaining)");
});

test("T5b 복구 후에도 충돌이 계속되면 안전 실패(중복 0) — 같은 chunk 재실행은 재조회부터 시작", async () => {
  const rows = plan(3);
  const srv = fakePostgrest([], { alwaysConflict: true });
  await assert.rejects(stageInsertChunkSafe(srv.fetchLike, T, rows), StageIdentityError);
  assert.equal(srv.table.length, 0, "INSERT 0 · 중복 0");
});

test("T6 ambiguous lookup — 같은 identity 가 2행(비정상)이면 fail safely · chunk 안 중복 identity 거부", async () => {
  const rows = plan(2);
  const ext = String(rows[0]!.row.external_id);
  const srv = fakePostgrest([{ id: 1, source_type: "canonical", external_id: ext, name: "a" }, { id: 2, source_type: "canonical", external_id: ext, name: "b" }]);
  await assert.rejects(stageInsertChunkSafe(srv.fetchLike, T, rows), /ambiguous identity/);
  await assert.rejects(stageInsertChunkSafe(fakePostgrest().fetchLike, T, [rows[0]!, rows[0]!]), /duplicate external_id in chunk/);
  await assert.rejects(stageInsertChunkSafe(fakePostgrest().fetchLike, T, [{ ...rows[0]!, row: { ...rows[0]!.row, is_published: true } }]), /is_published=false/);
  await assert.rejects(stageInsertChunkSafe(fakePostgrest().fetchLike, T, [{ ...rows[0]!, row: { ...rows[0]!.row, external_id: undefined } }]), /lacks canonical identity/);
});

test("T7 MATCH_REPLACE — PATCH 는 기존 id · source_type/external_id/is_published 를 보내지 않는다", async () => {
  const main: MainSnapshotRow[] = [{ main_city_spot_id: 287, city: "busan", category: "restaurant", canonical_title: "Tonshou PNU Branch(톤쇼우 부산대점)", legacy_external_id: "busan-F-00220" }];
  const cls: MainClassificationRow[] = [{ main_city_spot_id: 287, city: "busan", class: "ACTIVE_MATCHED" }];
  const intake: IntakeRow[] = [{ ...base, canonical_id: "busan-G-00004", city: "busan", name: "Tonshou", lat: 35.23, lng: 129.08 }];
  const xw: CrosswalkRow[] = [{ city: "busan", canonical_id: "busan-G-00004", service_status: "ACTIVE", main_city_spot_id: 287, decision: "MATCH_REPLACE", decision_basis: "ARTIFACT_SOURCE_LINEAGE", tier: "TIER1" }];
  const p = planImport({ intake, sources: [], images: [], crosswalk: xw, main, mainClassification: cls, expectedActiveTotal: 1 });
  const srv = fakePostgrest();
  await stageUpdateRow(srv.fetchLike, T, p.updates[0]!);
  const patch = srv.log.find(l => l.method === "PATCH")!;
  assert.match(patch.url, /id=eq\.287$/);
  for (const k of ["source_type", "external_id", "is_published"]) assert.ok(!(k in (patch.body as Record<string, unknown>)), k);
});

test("T8 provenance/scale 계약 불변 — stage plan 은 그대로, writer 는 city_spots 만 건드린다", () => {
  const rows = plan(3);
  const p = planImport({ intake: rows.map(r => ({ ...base, canonical_id: r.canonical_id, city: r.city, name: String(r.row.name), lat: 37, lng: 127 })), sources: [], images: [], crosswalk: rows.map(r => ({ city: r.city, canonical_id: r.canonical_id, service_status: "ACTIVE", main_city_spot_id: null, decision: "NEW" as const, decision_basis: "ARTIFACT_SERVICE_STATUS", tier: "NEW" })), main: [], mainClassification: [], expectedActiveTotal: 3 });
  const sp = buildStagePlan(p, "0123456789abcdef", "a".repeat(64));
  assert.equal(sp.counts.inserts, 3); assert.equal(sp.counts.legacy_hidden_in_stage, 0);
  const writer = readFileSync(new URL("src/lib/main-intake/stage-rest-writer.ts", ROOT), "utf8");
  assert.ok(!/[?&]on_conflict=|resolution=merge-duplicates/.test(writer), "PostgREST upsert 요청 미사용(주석의 설명은 제외)");
  assert.ok(!/city_spot_sources|city_spot_images|itineraries|trip_moments|user_spots/.test(writer));
  assert.ok(!/method:\s*"DELETE"/.test(writer));
  assert.match(readFileSync(new URL("scripts/import-five-city-core-v1.ts", ROOT), "utf8"), /stageInsertChunkSafe\(/);
});

test("T9 lookup 요청 형식 — source_type=eq.canonical AND external_id=in.(…)", async () => {
  const srv = fakePostgrest([{ id: 7, source_type: "canonical", external_id: "seoul:seoul-N-0", name: "x" }, { id: 8, source_type: "manual", external_id: "seoul:seoul-N-0", name: "other-namespace" }]);
  const r = await lookupExistingByExternalIds(srv.fetchLike, T, ["seoul:seoul-N-0", "seoul:seoul-N-1"]);
  assert.deepEqual(r, [{ id: 7, external_id: "seoul:seoul-N-0" }], "다른 source_type 의 같은 external_id 는 다른 identity");
  assert.match(srv.log[0]!.url, /source_type=eq\.canonical&external_id=in\.\(/);
  assert.deepEqual(await lookupExistingByExternalIds(srv.fetchLike, T, []), []);
});
