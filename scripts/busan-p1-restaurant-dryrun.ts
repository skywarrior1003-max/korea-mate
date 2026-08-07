#!/usr/bin/env node --experimental-strip-types
/**
 * 부산 P1 restaurant → city_spots 반영 **DRY RUN**.
 *
 *   node --experimental-strip-types scripts/busan-p1-restaurant-dryrun.ts [--json <경로>]
 *
 * 이 스크립트는 Production 을 **읽기만** 한다.
 * insert/update/upsert/delete 옵션이 존재하지 않는다 — 실수로 실행해도 쓸 방법이 없다.
 * DB 접근은 아래 fetchExistingBusanSpots() 하나뿐이고 HTTP GET 만 쓴다.
 *
 * 출력은 결정론적이다. 타임스탬프·실행시간 같은 값은 넣지 않는다 —
 * 두 번 돌려 같은 해시가 나오는지로 검증하기 때문이다.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

import {
  selectP1Restaurants, findDuplicateIds, gradeCandidate,
  type ReleaseItem, type EnrichedCandidate,
} from "../src/lib/busan-import/p1-selector.ts";
import {
  classifyAll, detectIntraSetConflicts, coordinateClusters, type ExistingSpot, type MatchClass,
} from "../src/lib/busan-import/identity-matcher.ts";
import {
  mapToCitySpot, validatePreview, findNameCollisions, displayName, IMPORT_SOURCE_TYPE,
} from "../src/lib/busan-import/city-spots-mapping.ts";

const ROOT = process.cwd();
const RELEASE_MANIFEST = "data/tourapi/reports/busan/busan-final-place-event-release-manifest.json";
const ENRICHED_JSONL   = "data/tourapi/enriched/busan/busan-enriched-candidates-v1.jsonl";

// ── READ-ONLY fetch 계층 ─────────────────────────────────────────────────────
// 여기만 네트워크를 만진다. method 는 GET 고정이며 다른 값을 받지 않는다.

function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of [".env.local", ".dev.vars"]) {
    let raw = "";
    try { raw = readFileSync(path.join(ROOT, f), "utf8"); } catch { continue; }
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !(m[1] in out)) out[m[1]] = m[2].trim();
    }
  }
  return out;
}

async function fetchExistingBusanSpots(): Promise<ExistingSpot[]> {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase 읽기 설정 없음");

  const cols = "id,name,category,district,lat,lng,source_type,external_id";
  const res = await fetch(
    `${url}/rest/v1/city_spots?city=eq.busan&select=${cols}&order=id.asc`,
    { method: "GET", headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  if (!res.ok) throw new Error(`city_spots 읽기 실패: HTTP ${res.status}`);
  return (await res.json()) as ExistingSpot[];
}

// ── 순수 변환 계층 ───────────────────────────────────────────────────────────

function readRelease(): ReleaseItem[] {
  const j = JSON.parse(readFileSync(path.join(ROOT, RELEASE_MANIFEST), "utf8"));
  return j.items as ReleaseItem[];
}

function readEnriched(): EnrichedCandidate[] {
  const out: EnrichedCandidate[] = [];
  for (const line of readFileSync(path.join(ROOT, ENRICHED_JSONL), "utf8").split(/\r?\n/)) {
    if (line.trim()) out.push(JSON.parse(line));
  }
  return out;
}

async function main(): Promise<void> {
  const release  = readRelease();
  const enriched = readEnriched();
  const byId = new Map(enriched.map(e => [e.candidate_id, e]));

  // 전체 등급 분포 (감사 숫자 재현 확인용)
  const grades: Record<string, number> = {};
  const gradeRestaurant: Record<string, number> = {};
  for (const it of release) {
    const e = byId.get(it.candidate_id);
    if (!e) continue;
    const g = gradeCandidate(it, e);
    grades[g] = (grades[g] ?? 0) + 1;
    if (it.category === "restaurant") gradeRestaurant[g] = (gradeRestaurant[g] ?? 0) + 1;
  }

  const p1 = selectP1Restaurants(release, enriched);
  const dupIds = findDuplicateIds(p1);

  const existing = await fetchExistingBusanSpots();
  const raw      = classifyAll(p1, existing);

  // 기존 row 와의 대조를 통과해도, P1 집합 **내부**에서 충돌하면 넣을 수 없다.
  // (같은 식당이 provider 두 곳에서 살아남은 쌍 · 같은 상호의 다른 지점)
  const intraRows = p1.map(r => ({
    candidate_id: r.candidate_id, display_name: displayName(r),
    name_ko: r.name_ko, name_en: r.name_en, lat: r.lat, lng: r.lng,
  }));
  const intra    = detectIntraSetConflicts(intraRows);
  const clusters = coordinateClusters(intraRows, intra);
  const results = raw.map(r => {
    const c = intra.get(r.candidate_id);
    if (!c || r.klass !== "NEW_INSERT_SAFE") return r;
    return {
      ...r, klass: "AMBIGUOUS_REVIEW" as MatchClass,
      reason: c.conflict === "DUPLICATE_SAME_PLACE"
        ? `P1 집합 내부 중복 — ${c.with.join(",")} 와 ${c.distance_m}m (동일 장소 추정, canonical 미확정)`
        : `표시명 충돌 — ${c.with.join(",")} 와 이름 동일하나 ${c.distance_m}m 이격 (다른 지점, UNIQUE(city,name) 위반)`,
    };
  });

  const byClass: Record<MatchClass, number> = {
    MATCH_EXISTING_MANUAL_EXACT: 0, MATCH_EXISTING_MANUAL_LIKELY: 0,
    NEW_INSERT_SAFE: 0, AMBIGUOUS_REVIEW: 0, INVALID_SKIP: 0,
  };
  for (const r of results) byClass[r.klass]++;

  const safeIds = new Set(results.filter(r => r.klass === "NEW_INSERT_SAFE").map(r => r.candidate_id));
  const mapped  = p1.filter(r => safeIds.has(r.candidate_id)).map(mapToCitySpot);

  const invalidRows = mapped.flatMap(m => {
    const bad = validatePreview(m.row);
    return bad.length ? [{ candidate_id: m.candidate_id, bad }] : [];
  });
  const collisions = findNameCollisions(mapped, existing.map(e => e.name));

  const imageRights: Record<string, number> = {};
  for (const m of mapped) imageRights[m.image_rights] = (imageRights[m.image_rights] ?? 0) + 1;

  const summary = {
    contract: {
      source_manifest: RELEASE_MANIFEST,
      source_type_planned: IMPORT_SOURCE_TYPE,
      external_id_planned: "candidate_id",
      db_write_capability: "NONE",
    },
    source: {
      release_total: release.length,
      release_place: release.filter(i => i.category !== "event").length,
      release_event: release.filter(i => i.category === "event").length,
      grade_all: grades,
      grade_restaurant: gradeRestaurant,
      p1_restaurant: p1.length,
      p1_duplicate_candidate_ids: dupIds,
      p1_with_raw_hours: p1.filter(r => r.raw_hours).length,
      p1_with_name_en: p1.filter(r => r.name_en).length,
      p1_with_description_en: p1.filter(r => r.description_en).length,
      p1_image_status: p1.reduce<Record<string, number>>((a, r) => {
        const k = r.image_status ?? "none"; a[k] = (a[k] ?? 0) + 1; return a;
      }, {}),
      p1_confidence: p1.reduce<Record<string, number>>((a, r) => {
        const k = r.confidence ?? "none"; a[k] = (a[k] ?? 0) + 1; return a;
      }, {}),
    },
    existing: {
      busan_total: existing.length,
      restaurant:  existing.filter(e => e.category === "restaurant").length,
      source_type: existing.reduce<Record<string, number>>((a, e) => {
        const k = e.source_type ?? "null"; a[k] = (a[k] ?? 0) + 1; return a;
      }, {}),
      external_id_null: existing.filter(e => e.external_id === null).length,
    },
    classification: byClass,
    classification_total: results.length,
    intra_set_conflicts: {
      count: intra.size,
      groups: [...intra.entries()]
        .map(([id, c]) => ({ candidate_id: id, conflict: c.conflict, with: c.with, distance_m: c.distance_m }))
        .sort((a, b) => (a.candidate_id < b.candidate_id ? -1 : 1)),
    },
    // 좌표만 겹치는 묶음 — 분류에 반영하지 않는다(한 건물 안 서로 다른 가게)
    coordinate_clusters: { count: clusters.length, groups: clusters },
    new_insert_preview: {
      count: mapped.length,
      invalid_rows: invalidRows,
      name_collisions: collisions,
      image_rights: imageRights,
      raw_hours_available: mapped.filter(m => m.source_raw_hours_available).length,
      opening_hours_written: 0,
      duration_minutes_written: 0,
      subcategory_written: 0,
      image_url_written: 0,
    },
    projected_restaurant_total:
      existing.filter(e => e.category === "restaurant").length + mapped.length,
    details: results.map(r => ({
      candidate_id: r.candidate_id, klass: r.klass,
      existing_id: r.existing_id, existing_name: r.existing_name,
      distance_m: r.distance_m, reason: r.reason,
    })),
    rows: mapped.map(m => ({ candidate_id: m.candidate_id, ...m.row })),
  };

  const json = JSON.stringify(summary, null, 2);
  const hash = createHash("sha256").update(json).digest("hex");

  const argIdx = process.argv.indexOf("--json");
  if (argIdx !== -1 && process.argv[argIdx + 1]) {
    writeFileSync(process.argv[argIdx + 1], json + "\n", "utf8");
  }

  console.log("── 부산 P1 restaurant DRY RUN ───────────────────────────");
  console.log(` release total / place / event : ${summary.source.release_total} / ${summary.source.release_place} / ${summary.source.release_event}`);
  console.log(` 등급 전체                      : ${JSON.stringify(grades)}`);
  console.log(` 등급 restaurant                : ${JSON.stringify(gradeRestaurant)}`);
  console.log(` P1 restaurant                  : ${p1.length}  (candidate_id 중복 ${dupIds.length})`);
  console.log(` 기존 busan / restaurant        : ${summary.existing.busan_total} / ${summary.existing.restaurant}`);
  console.log(` external_id NULL               : ${summary.existing.external_id_null}`);
  console.log("");
  for (const [k, v] of Object.entries(byClass)) console.log(` ${k.padEnd(30)} ${v}`);
  console.log(` ${"합계".padEnd(30)} ${results.length}`);
  console.log("");
  console.log(` 신규 insert 미리보기            : ${mapped.length} (무효 ${invalidRows.length})`);
  console.log(` 이름 충돌 신규끼리 / 기존과      : ${collisions.withinNew.length} / ${collisions.withExisting.length}`);
  console.log(` 이미지 권리                    : ${JSON.stringify(imageRights)}`);
  console.log(` raw hours 보유(미기록)          : ${summary.new_insert_preview.raw_hours_available}`);
  console.log(` 반영 후 예상 restaurant 총수     : ${summary.projected_restaurant_total}`);
  console.log("");
  console.log(` DRYRUN_SHA256 = ${hash}`);
  console.log(" DB write 0 — 이 스크립트에는 쓰기 경로가 없습니다.");
}

main().catch(err => { console.error(String(err?.message ?? err)); process.exit(1); });
