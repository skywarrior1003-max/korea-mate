#!/usr/bin/env node --experimental-strip-types
/**
 * 부산 P1 restaurant 의미 게이트 — READ-ONLY.
 *
 *   node --experimental-strip-types scripts/busan-p1-restaurant-semantic-gate.ts [--json <경로>]
 *
 * dry-run 이 고른 NEW_INSERT_SAFE 332건이 **실제 식음 업소인지** 판정하고
 * Production 반영 allowlist 를 확정한다. 기존 운영 restaurant 6건도 함께 점검한다.
 *
 * DB 는 GET 으로만 읽는다. 쓰기 경로가 없다.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

import {
  selectP1Restaurants, type ReleaseItem, type EnrichedCandidate,
} from "../src/lib/busan-import/p1-selector.ts";
import {
  classifyAll, detectIntraSetConflicts, type ExistingSpot, type MatchClass,
} from "../src/lib/busan-import/identity-matcher.ts";
import { displayName } from "../src/lib/busan-import/city-spots-mapping.ts";
import {
  classifyAllSemantics, buildAllowlist, type SemanticInput,
} from "../src/lib/busan-import/restaurant-semantics.ts";

const ROOT = process.cwd();
const RELEASE_MANIFEST = "data/tourapi/reports/busan/busan-final-place-event-release-manifest.json";
const ENRICHED_JSONL   = "data/tourapi/enriched/busan/busan-enriched-candidates-v1.jsonl";

const ZONES: Record<string, string> = {
  "Haeundae-gu": "Haeundae", "Busanjin-gu": "Seomyeon-Jeonpo",
  "Jung-gu": "Nampo-Busan Station", "Dong-gu": "Nampo-Busan Station",
  "Suyeong-gu": "Gwangalli", "Gijang-gun": "Gijang",
};

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

/** 유일한 네트워크 지점. GET 고정. */
async function getBusanSpots(cols: string): Promise<Record<string, unknown>[]> {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL, key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase 읽기 설정 없음");
  const res = await fetch(`${url}/rest/v1/city_spots?city=eq.busan&select=${cols}&order=id.asc`,
    { method: "GET", headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`city_spots 읽기 실패: HTTP ${res.status}`);
  return await res.json();
}

function readRelease(): ReleaseItem[] {
  return JSON.parse(readFileSync(path.join(ROOT, RELEASE_MANIFEST), "utf8")).items;
}
function readEnriched(): EnrichedCandidate[] {
  const out: EnrichedCandidate[] = [];
  for (const l of readFileSync(path.join(ROOT, ENRICHED_JSONL), "utf8").split(/\r?\n/)) {
    if (l.trim()) out.push(JSON.parse(l));
  }
  return out;
}

async function main(): Promise<void> {
  const release = readRelease();
  const enriched = readEnriched();
  const byId = new Map(enriched.map(e => [e.candidate_id, e]));
  const p1 = selectP1Restaurants(release, enriched);

  // dry-run 과 동일한 절차로 NEW_INSERT_SAFE 를 재현한다 (하드코딩 목록 사용 안 함)
  const existingFull = await getBusanSpots("id,name,category,district,lat,lng,source_type,external_id,description,tags,subcategory,image_url");
  const existing = existingFull as unknown as ExistingSpot[];
  const intra = detectIntraSetConflicts(p1.map(r => ({
    candidate_id: r.candidate_id, display_name: displayName(r),
    name_ko: r.name_ko, name_en: r.name_en, lat: r.lat, lng: r.lng,
  })));
  const classified = classifyAll(p1, existing).map(r => {
    const c = intra.get(r.candidate_id);
    return (c && r.klass === "NEW_INSERT_SAFE") ? { ...r, klass: "AMBIGUOUS_REVIEW" as MatchClass } : r;
  });
  const safeIds = new Set(classified.filter(r => r.klass === "NEW_INSERT_SAFE").map(r => r.candidate_id));
  const safe = p1.filter(r => safeIds.has(r.candidate_id));

  // ── 의미 판정 ──────────────────────────────────────────────────────────────
  const semInputs: SemanticInput[] = safe.map(r => {
    const e = byId.get(r.candidate_id)!;
    const ss = (e.source_summary ?? {}) as Record<string, unknown>;
    return {
      candidate_id: r.candidate_id, name_ko: r.name_ko, name_en: r.name_en,
      description_ko: r.description_ko, description_en: r.description_en,
      address: r.address,
      source_keys: (ss.source_keys as string[] | undefined) ?? [],
      primary_source: r.primary_source,
    };
  });
  const sem = classifyAllSemantics(semInputs);
  const allowlist = buildAllowlist(sem);

  const semCount: Record<string, number> = {
    SEMANTIC_RESTAURANT_CONFIRMED: 0, SEMANTIC_RESTAURANT_LIKELY: 0,
    SEMANTIC_NOT_RESTAURANT: 0, SEMANTIC_REVIEW_REQUIRED: 0,
  };
  for (const s of sem) semCount[s.klass]++;

  const byId2 = new Map(safe.map(r => [r.candidate_id, r]));
  const districtConfirmed: Record<string, number> = {};
  const zoneConfirmed: Record<string, number> = {};
  const providerBad: Record<string, number> = {};
  for (const s of sem) {
    const r = byId2.get(s.candidate_id)!;
    if (s.klass === "SEMANTIC_RESTAURANT_CONFIRMED") {
      districtConfirmed[r.district] = (districtConfirmed[r.district] ?? 0) + 1;
      const roman = Object.keys(ZONES).find(k => k.toLowerCase().startsWith(
        (r.district === "해운대구" ? "haeundae" : r.district === "부산진구" ? "busanjin"
         : r.district === "중구" ? "jung" : r.district === "동구" ? "dong"
         : r.district === "수영구" ? "suyeong" : r.district === "기장군" ? "gijang" : "__")));
      const zone = roman ? ZONES[roman] : "기타";
      zoneConfirmed[zone] = (zoneConfirmed[zone] ?? 0) + 1;
    } else {
      const p = r.primary_source ?? "unknown";
      providerBad[p] = (providerBad[p] ?? 0) + 1;
    }
  }

  // ── 기존 운영 restaurant 점검 (읽기만) ────────────────────────────────────
  const existingRestaurants = existingFull
    .filter(e => e.category === "restaurant")
    .map(e => {
      const name = String(e.name ?? ""), sub = String(e.subcategory ?? "");
      const collective = /market|street|hill|town|square|district/i.test(name) || /market|street/i.test(sub);
      return {
        id: e.id, name, subcategory: e.subcategory, district: e.district,
        lat: e.lat, lng: e.lng, source_type: e.source_type, external_id: e.external_id,
        has_description: Boolean(e.description), tags: e.tags,
        verdict: collective ? "EXISTING_CATEGORY_INCORRECT" : "EXISTING_RESTAURANT_CORRECT",
        recommended_category: collective ? (/market/i.test(name + sub) ? "attraction" : "attraction") : "restaurant",
        reason: collective ? `이름/subcategory 가 개별 업소가 아닌 시장·거리·지역을 가리킴 (subcategory='${sub}')`
                           : "개별 식음 업소",
      };
    });

  const summary = {
    contract: { db_write_capability: "NONE", production_apply: "SEPARATE_TASK" },
    reproduce: {
      p1_restaurant: p1.length,
      new_insert_safe: safe.length,
      ambiguous: classified.filter(r => r.klass === "AMBIGUOUS_REVIEW").length,
      invalid_skip: classified.filter(r => r.klass === "INVALID_SKIP").length,
    },
    semantic: semCount,
    semantic_total: sem.length,
    not_restaurant: sem.filter(s => s.klass === "SEMANTIC_NOT_RESTAURANT")
      .map(s => ({ ...s, name_ko: byId2.get(s.candidate_id)!.name_ko, name_en: byId2.get(s.candidate_id)!.name_en })),
    review_required: sem.filter(s => s.klass === "SEMANTIC_REVIEW_REQUIRED")
      .map(s => ({ ...s, name_ko: byId2.get(s.candidate_id)!.name_ko, name_en: byId2.get(s.candidate_id)!.name_en })),
    likely: sem.filter(s => s.klass === "SEMANTIC_RESTAURANT_LIKELY")
      .map(s => ({ ...s, name_ko: byId2.get(s.candidate_id)!.name_ko, name_en: byId2.get(s.candidate_id)!.name_en })),
    provider_of_non_confirmed: providerBad,
    district_confirmed: districtConfirmed,
    zone_confirmed: zoneConfirmed,
    existing_restaurants: existingRestaurants,
    existing_image_url_null: existingFull.filter(e => e.image_url === null).length,
    allowlist_count: allowlist.length,
    allowlist,
    projected_restaurant_total: existingFull.filter(e => e.category === "restaurant").length + allowlist.length,
  };

  const json = JSON.stringify(summary, null, 2);
  const hash = createHash("sha256").update(json).digest("hex");
  const ai = process.argv.indexOf("--json");
  if (ai !== -1 && process.argv[ai + 1]) writeFileSync(process.argv[ai + 1], json + "\n", "utf8");

  console.log("── 부산 P1 restaurant 의미 게이트 ──────────────────────");
  console.log(` 재현: P1 ${p1.length} · NEW_INSERT_SAFE ${safe.length} · AMBIGUOUS ${summary.reproduce.ambiguous}`);
  console.log("");
  for (const [k, v] of Object.entries(semCount)) console.log(` ${k.padEnd(32)} ${v}`);
  console.log(` ${"합계".padEnd(32)} ${sem.length}`);
  console.log("");
  console.log(` Production allowlist            : ${allowlist.length}`);
  console.log(` 반영 후 예상 restaurant 총수      : ${summary.projected_restaurant_total}`);
  console.log(` 기존 restaurant 오분류           : ${existingRestaurants.filter(e => e.verdict === "EXISTING_CATEGORY_INCORRECT").length} / ${existingRestaurants.length}`);
  console.log(` 기존 image_url NULL             : ${summary.existing_image_url_null}`);
  console.log("");
  console.log(` 권역별 confirmed: ${JSON.stringify(zoneConfirmed)}`);
  console.log("");
  console.log(` SEMANTIC_SHA256 = ${hash}`);
  console.log(" DB write 0 — 이 스크립트에는 쓰기 경로가 없습니다.");
}

main().catch(e => { console.error(String(e?.message ?? e)); process.exit(1); });
