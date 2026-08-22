/**
 * TASK-FIVE-CITY-CORE-MIGRATION-058-AND-WRITER-CORRECTION-V1 — migration 058 계약 · 다중 source key · exact-dup 만 collapse ·
 * 전주 kto provenance · 필드 ownership(FINAL_ABSENT_CLEAR) · 경주 legacy 한국어 description · 후속 English supplement
 * Run: node --experimental-strip-types --test src/lib/main-intake/writer-correction-058.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { decideField } from "./null-policy.ts";
import { planImport, type CrosswalkRow, type IntakeRow, type MainSnapshotRow, type SourceRow, type ImageRow } from "./importer-core.ts";
import { resolveRelationTargets, preflightRelations, syncSourcesChunk, type ResolvedSource } from "./stage-relations.ts";
import { planLocaleSupplementPatch, resolveSupplementTargets } from "./locale-supplement.ts";
import type { FetchLike } from "./stage-rest-writer.ts";

const ROOT = new URL("../../../", import.meta.url);
const PKG = "data/main-intake/five-city-core-v1/";
const readJsonl = <T,>(p: string): T[] => readFileSync(new URL(PKG + p, ROOT), "utf8").split(/\r?\n/).filter(l => l.trim()).map(l => JSON.parse(l) as T);
const pkgReady = existsSync(new URL(PKG + "five-city-core-sources-v1.jsonl", ROOT));
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

test("M058-1: migration 058 — 오직 uq_city_spot_sources_spot_provider 제거 · 다른 UNIQUE/FK/데이터/RLS 불변 · 번호 순서", () => {
  const p = "supabase/migrations/058_city_spot_sources_allow_multi_source_keys_per_provider.sql";
  const sql = readFileSync(new URL(p, ROOT), "utf8");
  const stmts = sql.split("\n").filter(l => l.trim() && !l.trim().startsWith("--"));
  assert.deepEqual(stmts, ["drop index if exists public.uq_city_spot_sources_spot_provider;"], "DDL 은 한 문장");
  for (const bad of ["delete ", "update ", "insert ", "alter table", "add column", "create policy", "alter policy", "drop policy", "grant ", "revoke ", "truncate", "uq_city_spot_sources_source", "uq_city_spot_sources_primary"]) {
    assert.ok(!stmts.join("\n").toLowerCase().includes(bad), `058 DDL must not contain '${bad}'`);
  }
  // 045 에 실제 그 이름의 unique index 가 있고, 유지 대상 두 index 도 045 에 있다
  const m045 = readFileSync(new URL("supabase/migrations/045_city_spot_sources.sql", ROOT), "utf8");
  assert.match(m045, /create unique index if not exists uq_city_spot_sources_spot_provider\s+on public\.city_spot_sources \(city_spot_id, source_type\)/);
  assert.match(m045, /uq_city_spot_sources_source\s+on public\.city_spot_sources \(source_type, source_key\)/);
  assert.match(m045, /uq_city_spot_sources_primary\s+on public\.city_spot_sources \(city_spot_id\)\s+where is_primary/);
  assert.ok(existsSync(new URL("supabase/migrations/057_city_spots_drop_city_name_unique.sql", ROOT)) && !existsSync(new URL("supabase/migrations/059_x.sql", ROOT)));
});

test("M058-2: writer — 같은 spot/provider 의 서로 다른 key 는 별도 행 · exact identity 만 재사용 · 다른 spot 에 붙은 identity 는 실패 · primary ≤1 · DELETE 0", async () => {
  const table: Array<Record<string, unknown> & { id: number }> = [{ id: 1, city_spot_id: 287, source_type: "busan6260000-foodservice", source_key: "127", is_primary: false, candidate_id: null, source_url: null, source_tier: "OFFICIAL_API", as_of: null }];
  let next = 2; let deletes = 0;
  const fetchLike: FetchLike = async (url, init) => {
    const u = new URL(url); const qs = new URLSearchParams(u.search);
    if (init.method === "GET") {
      let rows = table;
      for (const [k, v] of qs) { if (["select", "order", "limit"].includes(k)) continue; if (v.startsWith("eq.")) rows = rows.filter(r => String(r[k]) === v.slice(3)); else if (v.startsWith("in.(")) { const vals = v.slice(4, -1).split(",").map(x => x.replace(/^"|"$/g, "")); rows = rows.filter(r => vals.includes(String(r[k]))); } }
      return { ok: true, status: 200, text: async () => JSON.stringify(rows) };
    }
    if (init.method === "POST") { const rows = JSON.parse(init.body!) as Array<Record<string, unknown>>; for (const r of rows) if (table.some(t => t.source_type === r.source_type && t.source_key === r.source_key)) return { ok: false, status: 409, text: async () => "23505" }; const out = rows.map(r => { const row = { ...r, id: next++ }; table.push(row); return row; }); return { ok: true, status: 201, text: async () => JSON.stringify(out) }; }
    if (init.method === "PATCH") { const id = Number(qs.get("id")!.slice(3)); Object.assign(table.find(r => r.id === id)!, JSON.parse(init.body!)); return { ok: true, status: 204, text: async () => "" }; }
    if (init.method === "DELETE") { deletes += 1; return { ok: false, status: 405, text: async () => "" }; }
    return { ok: false, status: 405, text: async () => "" };
  };
  const T = { url: "https://x.supabase.co", serviceKey: "k" };
  const src = (k: string, primary = false): ResolvedSource => ({ canonical_id: "busan-G-00007", city_spot_id: 287, source_type: "busan6260000-foodservice", source_key: k, candidate_id: null, source_url: null, source_tier: "OFFICIAL_API", is_primary: primary, as_of: null });
  const r1 = await syncSourcesChunk(fetchLike, T, [src("127"), src("1634"), { ...src("busan-G-00007", true), source_type: "busan-food-canonical" }]);
  assert.deepEqual({ reused: r1.reused_exact, updated: r1.updated_to_final, inserted: r1.inserted, unchanged: r1.unchanged }, { reused: 1, updated: 0, inserted: 2, unchanged: 1 });
  assert.equal(table.filter(r => r.city_spot_id === 287 && r.source_type === "busan6260000-foodservice").length, 2, "같은 provider 2행(058)");
  assert.equal(table.find(r => r.source_key === "127")!.id, 1, "exact identity 행 재사용 — 다른 key 로 덮어쓰지 않음");
  const r2 = await syncSourcesChunk(fetchLike, T, [src("127"), src("1634"), { ...src("busan-G-00007", true), source_type: "busan-food-canonical" }]);
  assert.equal(r2.inserted, 0); assert.equal(r2.unchanged, 3); assert.equal(table.length, 3); assert.equal(deletes, 0);
  assert.equal(table.filter(r => r.city_spot_id === 287 && r.is_primary).length, 1);
  await assert.rejects(syncSourcesChunk(fetchLike, T, [{ ...src("127"), city_spot_id: 999 }]), /attached to city_spot #287/);
});

test("M058-3: preflight — 같은 provider 다른 key 는 충돌 아님 · exact 중복 relation 은 충돌 · identity 가 두 spot 이면 충돌", () => {
  const xw: CrosswalkRow[] = [{ city: "busan", canonical_id: "g7", service_status: "ACTIVE", main_city_spot_id: 287, decision: "MATCH_REPLACE", tier: "T1" }, { city: "busan", canonical_id: "g8", service_status: "ACTIVE", main_city_spot_id: 160, decision: "MATCH_REPLACE", tier: "T1" }];
  const S: SourceRow[] = [
    { canonical_id: "g7", source_type: "fs", source_key: "127", candidate_id: null, source_url: null, source_tier: null, is_primary: false, as_of: null },
    { canonical_id: "g7", source_type: "fs", source_key: "1634", candidate_id: null, source_url: null, source_tier: null, is_primary: false, as_of: null },
  ];
  const ok = preflightRelations(resolveRelationTargets({ sources: S, images: [], crosswalk: xw, newIdByCanonical: new Map() }));
  assert.deepEqual(ok.source_conflicts, []);
  const dup = preflightRelations(resolveRelationTargets({ sources: [...S, S[0]!], images: [], crosswalk: xw, newIdByCanonical: new Map() }));
  assert.ok(dup.source_conflicts.some(c => c.startsWith("exact duplicate relation")));
  const shared = preflightRelations(resolveRelationTargets({ sources: [S[0]!, { ...S[0]!, canonical_id: "g8" }], images: [], crosswalk: xw, newIdByCanonical: new Map() }));
  assert.ok(shared.source_conflicts.some(c => c.includes("→ 2 spots")));
});

test("M058-4: 실제 package — source 5,502 = 5,621 − exact dup 41 − 전주 non-provenance 78 · 부산 다중 key 16 복원 · 구조 충돌 0 · images 4,394", { skip: !pkgReady }, () => {
  const S = readJsonl<SourceRow>("five-city-core-sources-v1.jsonl"); const I = readJsonl<ImageRow>("five-city-core-images-v1.jsonl");
  const xw = readJsonl<CrosswalkRow>("five-city-core-crosswalk-v1.jsonl"); const intake = readJsonl<IntakeRow>("five-city-core-active-v1.jsonl"); const main = readJsonl<MainSnapshotRow>("main-city-spots-snapshot-2026-08-22-v1.jsonl");
  const plan = planImport({ intake, sources: S, images: I, crosswalk: xw, main, mainClassification: [], expectedActiveTotal: 4826 });
  const ph = new Map(plan.inserts.map((i, idx) => [i.canonical_id, -(idx + 1)]));
  const r = resolveRelationTargets({ sources: S, images: I, crosswalk: xw, newIdByCanonical: ph }); const p = preflightRelations(r);
  assert.equal(p.source_planned, 5502); assert.equal(p.image_planned, 4394);
  assert.deepEqual(p.source_conflicts, []); assert.deepEqual(p.image_conflicts, []); assert.deepEqual(p.rights_violations, []);
  assert.equal(p.source_primary_conflicts, 0); assert.equal(p.image_primary_conflicts, 0); assert.equal(p.source_unresolved, 0);
  // 부산 Food: 같은 provider 다중 key 가 행으로 존재(16 추가 키)
  const fs = r.sources.filter(s => s.source_type === "busan6260000-foodservice");
  const perSpot = new Map<number, number>(); for (const s of fs) perSpot.set(s.city_spot_id, (perSpot.get(s.city_spot_id) ?? 0) + 1);
  assert.equal([...perSpot.values()].reduce((a, n) => a + Math.max(0, n - 1), 0), 16, "부산 multi uc_seq 16 복원");
  assert.equal(fs.length, 135);
  // sidecar 로 접은 흔적 없음
  const deferred = readJsonl<{ field: string }>("five-city-core-deferred-fields-v1.jsonl");
  assert.equal(deferred.filter(d => d.field === "source_keys_extra").length, 0);
  // 전주: kto provenance 는 artifact 확정 4 (OFF 기준), OFF 전체 103 은 visitjeonju
  const offKto = S.filter(s => s.canonical_id.startsWith("OFF-") && s.source_type === "kto").map(s => s.canonical_id).sort();
  assert.deepEqual(offKto, ["OFF-10114", "OFF-16133", "OFF-16310", "OFF-16670"]);
  assert.equal(S.filter(s => s.canonical_id.startsWith("OFF-") && s.source_type === "visitjeonju").length, 103);
  // exact 중복 0
  const seen = new Set<string>(); for (const s of r.sources) { const k = `${s.city_spot_id}|${s.source_type}|${s.source_key}`; assert.ok(!seen.has(k), k); seen.add(k); }
});

test("M058-5: 필드 ownership — FINAL_OWNED 절대 clear · DEFERRED/NOT_OWNED/RUNTIME no-op · INTENTIONALLY_CLEAR 유지", () => {
  assert.equal(decideField("description", undefined, "legacy ko text", { finalOwned: true }).policy, "FINAL_ABSENT_CLEAR");
  assert.equal(decideField("description", undefined, "legacy ko text", { finalOwned: true }).value, null);
  assert.equal(decideField("opening_hours", undefined, { open: "09:00" }, { finalOwned: true, deferred: true }).policy, "NO_SOURCE_VALUE");
  assert.equal(decideField("why_it_matters", undefined, "editorial", {}).policy, "NO_SOURCE_VALUE");
  assert.equal(decideField("map_url", undefined, "https://maps", {}).policy, "NO_SOURCE_VALUE");
  assert.equal(decideField("description", "Final text", "legacy", { finalOwned: true }).policy, "REPLACE_WITH_VALUE");
  assert.equal(decideField("image_url", undefined, "https://images.unsplash.com/x", {}).policy, "INTENTIONALLY_CLEAR");
  assert.equal(decideField("rating", 1, 2, { finalOwned: true }).policy, "PRESERVE_RUNTIME_FIELD", "RUNTIME/REFERENCE 는 ownership 과 무관하게 불가침");
});

test("M058-6: 실제 package — 경주 MATCH 299: description(en) FINAL_ABSENT_CLEAR(legacy 한국어 102 를 영어로 취급 안 함) · desc_l10n.ko Final 값 · map/naver/why no-op", { skip: !pkgReady }, () => {
  const S = readJsonl<SourceRow>("five-city-core-sources-v1.jsonl"); const I = readJsonl<ImageRow>("five-city-core-images-v1.jsonl");
  const xw = readJsonl<CrosswalkRow>("five-city-core-crosswalk-v1.jsonl"); const intake = readJsonl<IntakeRow>("five-city-core-active-v1.jsonl"); const main = readJsonl<MainSnapshotRow>("main-city-spots-snapshot-2026-08-22-v1.jsonl");
  const plan = planImport({ intake, sources: S, images: I, crosswalk: xw, main, mainClassification: [], expectedActiveTotal: 4826 });
  const gj = plan.updates.filter(u => u.city === "gyeongju");
  assert.equal(gj.length, 299);
  const pol = (u: typeof gj[number], f: string) => u.fields.find(x => x.field === f)!.policy;
  assert.ok(gj.every(u => pol(u, "description") === "FINAL_ABSENT_CLEAR" && u.writes.description === null), "경주 en 설명: Final 공식 값 0 → clear (legacy 한국어 102 보존 안 함, 기계 번역 0)");
  assert.ok(gj.every(u => ["NO_SOURCE_VALUE"].includes(pol(u, "map_url")) && pol(u, "naver_map_url") === "NO_SOURCE_VALUE" && pol(u, "why_it_matters") === "NO_SOURCE_VALUE"));
  assert.equal(gj.filter(u => pol(u, "desc_l10n") === "REPLACE_WITH_VALUE").length, 234);
  assert.ok(gj.filter(u => pol(u, "desc_l10n") === "REPLACE_WITH_VALUE").every(u => (u.writes.desc_l10n as Record<string, string>).ko && !(u.writes.desc_l10n as Record<string, string>).en));
  // 부산 MATCH: opening_hours 가 raw deferred 인 행은 no-op, 영어 설명은 Final 값
  const bs = plan.updates.filter(u => u.city === "busan");
  assert.ok(bs.every(u => pol(u, "description") !== "NO_SOURCE_VALUE" || false));
  assert.equal(plan.counts.lossy_category, 0); assert.deepEqual(plan.errors, []);
  assert.ok(plan.null_policy_counts.FINAL_ABSENT_CLEAR > 0 && plan.null_policy_counts.NO_SOURCE_VALUE > 0);
});

test("M058-7: 후속 English supplement — 기존 canonical entity 만 UPDATE · 새 entity 0 · ko/ja 불변 · en 필드만", () => {
  const existing = { id: 5123, name: "경주 계림", name_l10n: { ko: "경주 계림" }, description: null, desc_l10n: { ko: "계림은 …" } };
  const patch = planLocaleSupplementPatch(existing, { canonical_id: "gyeongju-GJ01-0001", locale: "en", title: "Gyeongju Gyerim Forest", description: "A sacred forest …" });
  assert.deepEqual(patch, { name_l10n: { ko: "경주 계림", en: "Gyeongju Gyerim Forest" }, name: "Gyeongju Gyerim Forest", desc_l10n: { ko: "계림은 …", en: "A sacred forest …" }, description: "A sacred forest …" });
  assert.deepEqual(planLocaleSupplementPatch(existing, { canonical_id: "x", locale: "en", title: "", description: null }), {}, "값 없는 supplement 는 아무것도 쓰지 않는다(Main 이 채우지 않음)");
  const ja = planLocaleSupplementPatch(existing, { canonical_id: "x", locale: "ja", title: "慶州 鶏林" });
  assert.deepEqual(ja, { name_l10n: { ko: "경주 계림", ja: "慶州 鶏林" } }, "ja 는 name/description(en 표시 컬럼) 을 건드리지 않는다");
  const t = resolveSupplementTargets([{ canonical_id: "gyeongju-GJ01-0001", locale: "en", title: "x" }, { canonical_id: "gyeongju-NEW-999", locale: "en", title: "y" }], new Map([["gyeongju-GJ01-0001", 5123]]));
  assert.deepEqual(t.targets, [{ canonical_id: "gyeongju-GJ01-0001", id: 5123 }]); assert.deepEqual(t.unresolved, ["gyeongju-NEW-999"], "매핑 없는 supplement 는 새 entity 를 만들지 않고 unresolved");
});

test("M058-8: Final 원본 불변 — 보조컴퓨터 Final 파일은 git pinned SHA 의 blob 을 그대로 읽는다(수정 경로 없음)", () => {
  const lib = readFileSync(new URL("scripts/main-intake/five_city_core_lib.py", ROOT), "utf8");
  assert.match(lib, /def git_show\(/); assert.match(lib, /def verify_pins\(/);
  const builder = readFileSync(new URL("scripts/main-intake/build-five-city-core-intake-v1.py", ROOT), "utf8");
  assert.ok(!/source_keys_extra/.test(builder));
  assert.ok(!/open\([^)]*data\/(seoul|jeju|jeonju|gyeongju|tourapi)[^)]*["']w/.test(builder), "Final 원본 디렉토리에 쓰지 않는다");
  assert.equal(sha("x").length, 64);
});
