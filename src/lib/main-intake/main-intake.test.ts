/**
 * TASK-MAIN-FIVE-CITY-CORE-INTEGRATION-PREP-AND-DRY-RUN-V1 — intake 어댑터·importer 계획 계약
 * Run: node --experimental-strip-types --test src/lib/main-intake/main-intake.test.ts
 *
 * 실제 intake package(data/main-intake/five-city-core-v1)를 읽어 산술·보존 규칙을 검증한다. DB 접근 0.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { toMainLocale, buildL10n, pickName } from "./locale-adapter.ts";
import { mapCategory, isMainCategory } from "./category-adapter.ts";
import { decideField, isLegacyClearCandidate } from "./null-policy.ts";
import { planImport, changeManifestRows, type CrosswalkRow, type ImageRow, type IntakeRow, type MainSnapshotRow, type SourceRow } from "./importer-core.ts";

const ROOT = new URL("../../../", import.meta.url);
const PKG = "data/main-intake/five-city-core-v1/";
const readJsonl = <T,>(p: string): T[] => readFileSync(new URL(PKG + p, ROOT), "utf8").split(/\r?\n/).filter(l => l.trim()).map(l => JSON.parse(l) as T);

test("L1: zh-CN → zh, 모르는 locale 은 버린다, 빈 값은 키를 만들지 않는다", () => {
  assert.equal(toMainLocale("zh-CN"), "zh");
  assert.equal(toMainLocale("ja"), "ja");
  assert.equal(toMainLocale("fr"), null);
  assert.deepEqual(buildL10n([["ko", "해운대"], ["zh-CN", "海云台"], ["en", "  "], ["xx", "nope"]]), { ko: "해운대", zh: "海云台" });
  assert.equal(buildL10n([["en", ""]]), null);
  assert.equal(pickName({ ko: "해운대", en: "Haeundae Beach" }, "zh-CN", "Haeundae"), "Haeundae Beach");
  assert.equal(pickName(null, "ko", "Haeundae"), "Haeundae");
});

test("C1: category 는 Main 5종으로만 — semantic 은 subcategory 에(Gate C), 모르는 값은 DEFER 표시", () => {
  // Gate C 이후: semantic == runtime 이면 subcategory 는 raw 그대로(없으면 null), semantic != runtime 이면 semantic 토큰
  assert.deepEqual(mapCategory("food"), { category: "restaurant", subcategory: null, kind: "NORMALIZE_MAP", semantic: "restaurant", subcategoryRawDeferred: null });
  assert.deepEqual(mapCategory("shopping", "department store"), { category: "attraction", subcategory: "shopping", kind: "NORMALIZE_MAP", semantic: "shopping", subcategoryRawDeferred: "department store" });
  assert.deepEqual(mapCategory("nature"), { category: "nature", subcategory: null, kind: "DIRECT_MAP", semantic: "nature", subcategoryRawDeferred: null });
  assert.equal(mapCategory("theme_park").kind, "UNSUPPORTED_DEFER");
  assert.ok(isMainCategory("accommodation") && !isMainCategory("shopping"));
});

test("N1: null 의미 — REPLACE / NO_SOURCE_VALUE / INTENTIONALLY_CLEAR(Unsplash) / RUNTIME·MANUAL 보호", () => {
  assert.equal(decideField("name", "Haeundae Beach", "Haeundae").policy, "REPLACE_WITH_VALUE");
  assert.equal(decideField("description", undefined, "old").policy, "NO_SOURCE_VALUE");
  assert.equal(decideField("description", null, "old").sourceState, "null");
  assert.equal(decideField("description", "", "old").sourceState, "empty");
  assert.equal(decideField("image_url", null, "https://source.unsplash.com/x").policy, "INTENTIONALLY_CLEAR");
  assert.equal(decideField("image_url", null, "https://www.visitbusan.net/a.jpg").policy, "NO_SOURCE_VALUE");
  assert.equal(decideField("rating", 4.5, 4.0).policy, "PRESERVE_RUNTIME_FIELD");
  assert.equal(decideField("external_id", "x", "y").policy, "PRESERVE_RUNTIME_FIELD");
  assert.equal(decideField("entry_fee", "무료", null).policy, "MANUAL_REVIEW");
  assert.equal(decideField("not_a_column", "v", null).policy, "MANUAL_REVIEW");
  assert.ok(isLegacyClearCandidate("image_url", "https://images.unsplash.com/q"));
});

test("P1: 소형 fixture — UPDATE 는 id 보존, NEW 는 placeholder, CONFIRMED_TWIN/EXCLUDED 는 SKIP, DELETE 없음", () => {
  const main: MainSnapshotRow[] = [
    { main_city_spot_id: 1, city: "busan", category: "attraction", canonical_title: "Haeundae Beach", legacy_image_url: "https://source.unsplash.com/a" },
    { main_city_spot_id: 2, city: "busan", category: "restaurant", canonical_title: "Old Legacy" },
  ];
  const intake: IntakeRow[] = [
    { canonical_id: "busan-A-00070", city: "busan", service_status: "ACTIVE", category: "attraction", subcategory: null, name: "Haeundae Beach", name_l10n: { ko: "해운대" }, description: null, desc_l10n: null, why_it_matters: null, why_l10n: null, address: "부산", district: null, lat: 35.1, lng: 129.1, official_url: null, map_url: null, naver_map_url: null, opening_hours: null, tags: null, image_url: null },
    { canonical_id: "busan-A-00999", city: "busan", service_status: "ACTIVE", category: "nature", subcategory: null, name: "New Park", name_l10n: null, description: null, desc_l10n: null, why_it_matters: null, why_l10n: null, address: null, district: null, lat: 35.2, lng: 129.2, official_url: null, map_url: null, naver_map_url: null, opening_hours: null, tags: null, image_url: "https://www.visitbusan.net/p.jpg" },
    { canonical_id: "busan-VB-1", city: "busan", service_status: "ACTIVE", category: "attraction", subcategory: null, name: "Haeundae Beach", name_l10n: null, description: null, desc_l10n: null, why_it_matters: null, why_l10n: null, address: null, district: null, lat: 35.1, lng: 129.1, official_url: null, map_url: null, naver_map_url: null, opening_hours: null, tags: null, image_url: null },
  ];
  const crosswalk: CrosswalkRow[] = [
    { city: "busan", canonical_id: "busan-A-00070", service_status: "ACTIVE", main_city_spot_id: 1, decision: "MATCH_REPLACE", tier: "TIER2" },
    { city: "busan", canonical_id: "busan-A-00999", service_status: "ACTIVE", main_city_spot_id: null, decision: "NEW", tier: "NEW" },
    { city: "busan", canonical_id: "busan-VB-1", service_status: "ACTIVE", main_city_spot_id: null, decision: "CONFIRMED_TWIN", decision_basis: "ARTIFACT_SOURCE_LINEAGE", tier: "SAME_SOURCE_ENTITY", twin_of: "busan-A-00070" },
    { city: "gyeongju", canonical_id: "gyeongju-GJ01-0092", service_status: "EXCLUDED", main_city_spot_id: 5, decision: "EXCLUDED", tier: "TIER1" },
  ];
  const plan = planImport({ intake, sources: [] as SourceRow[], images: [] as ImageRow[], crosswalk, main, expectedActiveTotal: 3 });
  assert.deepEqual(plan.errors, []);
  assert.equal(plan.updates.length, 1);
  assert.equal(plan.updates[0]!.main_city_spot_id, 1);
  assert.equal(plan.updates[0]!.writes.name, "Haeundae Beach");
  assert.equal(plan.updates[0]!.writes.image_url, null, "Unsplash legacy 는 INTENTIONALLY_CLEAR");
  assert.ok(!("description" in plan.updates[0]!.writes), "NO_SOURCE_VALUE 는 쓰지 않는다");
  assert.equal(plan.inserts.length, 1);
  assert.equal(plan.inserts[0]!.placeholder_id, "NEW:busan-A-00999");
  assert.equal(plan.skips.length, 2);
  assert.equal(plan.counts.delete, 0);
  assert.equal(plan.counts.existing_id_preserved, 1);
  assert.deepEqual(plan.no_write.map(n => n.main_city_spot_id), [2]);
  assert.equal(plan.per_city.busan!.projected_after, 3);
  const rows = changeManifestRows(plan);
  assert.ok(rows.every(r => r.action !== "DELETE"));
});

const pkgReady = existsSync(new URL(PKG + "five-city-core-input-manifest-v1.json", ROOT));

test("R1: 실제 package — ACTIVE 4,826 산술, 경주 299·부산 Food 97 id 보존, historical 227 미쓰기, 쌍둥이 SKIP", { skip: !pkgReady }, () => {
  const intake = readJsonl<IntakeRow>("five-city-core-active-v1.jsonl");
  const sources = readJsonl<SourceRow>("five-city-core-sources-v1.jsonl");
  const images = readJsonl<ImageRow>("five-city-core-images-v1.jsonl");
  const crosswalk = readJsonl<CrosswalkRow>("five-city-core-crosswalk-v1.jsonl");
  const main = readJsonl<MainSnapshotRow>("main-city-spots-snapshot-2026-08-22-v1.jsonl");
  assert.equal(main.length, 714);
  const plan = planImport({ intake, sources, images, crosswalk, main, expectedActiveTotal: 4826 });
  assert.deepEqual(plan.errors, []);
  assert.equal(plan.counts.active_input, 4826);
  assert.equal(plan.counts.match_replace + plan.counts.new + plan.counts.confirmed_twin_skipped + plan.counts.review_required_skipped, 4826);
  assert.equal(plan.counts.delete, 0);
  // 경주 ACTIVE 299 → 전부 기존 id UPDATE, EXCLUDED 3 은 SKIP
  assert.equal(plan.updates.filter(u => u.city === "gyeongju").length, 299);
  assert.equal(plan.skips.filter(s => s.city === "gyeongju" && s.reason.startsWith("service_status")).length, 3);
  assert.equal(plan.inserts.filter(i => i.city === "gyeongju").length, 0);
  // 부산 Food artifact lineage 99 (TIER1) 보존
  const busanFoodT1 = crosswalk.filter(c => c.city === "busan" && c.canonical_id.startsWith("busan-G-") && c.tier === "TIER1");
  assert.equal(busanFoodT1.length, 99);   // 97 discovery-id + 2 artifact recovery lineage(G-00004→#287, G-00144→#160)
  assert.ok(busanFoodT1.every(c => plan.updates.some(u => u.main_city_spot_id === c.main_city_spot_id)));
  // historical busan-F 는 어떤 UPDATE/INSERT 에도 나타나지 않는다
  const historical = main.filter(m => m.city === "busan" && m.legacy_external_id && !plan.updates.some(u => u.main_city_spot_id === m.main_city_spot_id));
  assert.equal(historical.length, 227);   // 228 − #287(톤쇼우 부산대점) − #160(언양불고기)(artifact lineage 로 MATCH) + #407(슌사이쿠보: 옛 TIER2 이름/주소 bridge 폐기 → legacy 복귀)
  // Gate B: mainClassification 없이 계획하면 legacy 는 전부 NO_WRITE (숨김은 분류가 있을 때만)
  assert.ok(plan.no_write.filter(n => n.city === "busan").length >= 228);
  assert.equal(plan.visibility_updates.length, 0);
  // 쌍둥이는 SKIP, 대표는 쓰인다 (ARTIFACT TRUST: 부산 uc_seq 근거 170 · Main review hold 0)
  const twins = plan.skips.filter(s => s.reason.startsWith("SKIP_TWIN"));
  assert.equal(twins.length, 170);
  assert.equal(plan.skips.filter(s => s.reason.startsWith("SKIP_REVIEW_REQUIRED")).length, 0);   // 전주 identity_review 는 보류가 아니다
  for (const t of twins.slice(0, 50)) assert.ok(plan.updates.some(u => u.canonical_id === t.twin_of) || plan.inserts.some(i => i.canonical_id === t.twin_of), `twin_of ${t.twin_of} 가 쓰이지 않음`);
  // 서울·제주·전주는 INSERT 만
  for (const city of ["seoul", "jeju", "jeonju"]) assert.equal(plan.updates.filter(u => u.city === city).length, 0);
  // NEW 행의 category 는 Main 5종, name 필수
  assert.ok(plan.inserts.every(i => isMainCategory(i.row.category) && typeof i.row.name === "string"));
  // 같은 Main id 가 두 번 UPDATE 되지 않는다
  assert.equal(new Set(plan.updates.map(u => u.main_city_spot_id)).size, plan.updates.length);
  // locale 키는 Main 4종만
  for (const r of intake) for (const k of Object.keys(r.name_l10n ?? {})) assert.ok(["en", "ko", "ja", "zh"].includes(k), `bad locale key ${k}`);
  // 이미지: 권리 미확인은 display_eligible=false
  assert.ok(images.every(i => !(i.display_eligible && ["RIGHTS_UNKNOWN", "KTO_TYPE_UNKNOWN"].includes(i.rights_status))));
  assert.ok(images.every(i => !/pixabay/i.test(i.image_url)));
  // 결정적: 두 번 계산해도 같은 manifest
  const h = (p: ReturnType<typeof planImport>) => createHash("sha256").update(changeManifestRows(p).map(r => JSON.stringify(r)).join("\n")).digest("hex");
  assert.equal(h(plan), h(planImport({ intake, sources, images, crosswalk, main, expectedActiveTotal: 4826 })));
});

test("R2: 실제 package — manifest 의 sha256 이 파일과 일치 (입력 재현성)", { skip: !pkgReady }, () => {
  const manifest = JSON.parse(readFileSync(new URL(PKG + "five-city-core-input-manifest-v1.json", ROOT), "utf8")) as { outputs: Record<string, { path: string; sha256: string }>; main_snapshot: { path: string; sha256: string }; active_total: number };
  assert.equal(manifest.active_total, 4826);
  for (const o of Object.values(manifest.outputs)) {
    const h = createHash("sha256").update(readFileSync(new URL(PKG + o.path, ROOT))).digest("hex");
    assert.equal(h, o.sha256, o.path);
  }
  const hs = createHash("sha256").update(readFileSync(new URL(PKG + manifest.main_snapshot.path, ROOT))).digest("hex");
  assert.equal(hs, manifest.main_snapshot.sha256);
});
