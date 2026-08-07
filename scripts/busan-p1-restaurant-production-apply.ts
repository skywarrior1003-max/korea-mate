#!/usr/bin/env node --experimental-strip-types
/**
 * 부산 P1 restaurant 1차 운영 반영 — **이 저장소에서 유일하게 운영 데이터를 쓰는 스크립트다.**
 *
 *   미리보기 (기본):  node --experimental-strip-types scripts/busan-p1-restaurant-production-apply.ts
 *   실제 반영:        ... --apply --confirm-batch=BUSAN-P1-RESTAURANT-326 --out <경로>
 *   롤백:             ... --rollback <이번 run 의 out 파일> --confirm-batch=BUSAN-P1-RESTAURANT-326
 *
 * 무엇을 하는가
 *   ① 검증된 restaurant 326건을 city_spots 에 신규 INSERT
 *   ② 기존 manual 5건(3·21·22·41·54)의 category 만 restaurant → attraction 정정
 *
 * 무엇을 하지 않는가
 *   기존 row 삭제 · 이름/좌표/출처 변경 · allowlist 밖 insert · migration · schema 변경.
 *   이 스크립트는 부산 restaurant 1차 tranche 전용이다. 다른 도시·카테고리로 넓히지 않는다.
 *
 * 안전 장치 — 하나라도 어긋나면 write 경로에 진입하지 않는다.
 *   운영 project ref 일치 · allowlist 정확히 326 · allowlist SHA256 일치 ·
 *   제외 45건과 교집합 0 · 운영 pre-state 일치 · 정정 대상 5건 drift 없음 ·
 *   --apply 와 confirm 토큰 **둘 다** 존재.
 * 이미 반영돼 있으면 다시 넣지 않고 ALREADY_APPLIED 로 끝낸다.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

import { selectP1Restaurants, type ReleaseItem, type EnrichedCandidate } from "../src/lib/busan-import/p1-selector.ts";
import { classifyAll, detectIntraSetConflicts, type ExistingSpot, type MatchClass } from "../src/lib/busan-import/identity-matcher.ts";
import { mapToCitySpot, displayName, IMPORT_SOURCE_TYPE } from "../src/lib/busan-import/city-spots-mapping.ts";
import { classifyAllSemantics, buildAllowlist, type SemanticInput } from "../src/lib/busan-import/restaurant-semantics.ts";

// ── 불변 계약 ────────────────────────────────────────────────────────────────

export const PRODUCTION_REF        = "tfulaxxtorbxhlgupktc";
export const CONFIRM_TOKEN         = "BUSAN-P1-RESTAURANT-326";
export const EXPECTED_ALLOWLIST_N  = 326;
/** 정렬된 candidate_id 를 개행으로 이은 값의 sha256 */
export const EXPECTED_ALLOWLIST_SHA256 =
  "3efad2e5cc8257cf5a55ffcaf83b4f50e1cf73df7c02cfa272141c20dbac9f79";
/** category 만 고칠 기존 manual row. 이 목록은 넓히지 않는다. */
export const MANUAL_CORRECTION = [
  { id: 3,  name: "Jagalchi Fish Market" },
  { id: 21, name: "Jagalchi Market" },
  { id: 22, name: "Gukje Market" },
  { id: 41, name: "Dalmaji Hill" },
  { id: 54, name: "Jeonpo Cafe Street" },
] as const;
export const EXPECTED_PRESTATE = {
  total: 86, restaurant: 6, attraction: 43, nature: 37,
  manual: 86, enrichment: 0, external_id_non_null: 0,
} as const;
export const EXPECTED_POSTSTATE = {
  total: 412, restaurant: 327, attraction: 48, nature: 37,
  manual: 86, enrichment: 326,
} as const;

const ROOT = process.cwd();
const RELEASE_MANIFEST = "data/tourapi/reports/busan/busan-final-place-event-release-manifest.json";
const ENRICHED_JSONL   = "data/tourapi/enriched/busan/busan-enriched-candidates-v1.jsonl";

export function allowlistSha256(ids: readonly string[]): string {
  return createHash("sha256").update([...ids].sort().join("\n")).digest("hex");
}

/** --apply 만으로는 부족하다. 토큰까지 있어야 쓴다. */
export function isWriteAuthorized(argv: readonly string[]): boolean {
  return argv.includes("--apply") && argv.includes(`--confirm-batch=${CONFIRM_TOKEN}`);
}

/** write 진입 자격. 하나라도 false 면 읽기만 하고 끝낸다. */
export function writeGate(g: {
  ref: string; allowlistCount: number; allowlistSha: string;
  excludedOverlap: number; prestateOk: boolean; targetsOk: boolean; authorized: boolean;
}): { ok: boolean; reason: string } {
  if (g.ref !== PRODUCTION_REF)                       return { ok: false, reason: "운영 project ref 불일치" };
  if (g.allowlistCount !== EXPECTED_ALLOWLIST_N)      return { ok: false, reason: `allowlist ${g.allowlistCount} != ${EXPECTED_ALLOWLIST_N}` };
  if (g.allowlistSha !== EXPECTED_ALLOWLIST_SHA256)   return { ok: false, reason: "allowlist 해시 불일치 — source 가 달라졌다" };
  if (g.excludedOverlap !== 0)                        return { ok: false, reason: "제외 대상이 allowlist 에 섞였다" };
  if (!g.prestateOk)                                  return { ok: false, reason: "운영 pre-state 불일치" };
  if (!g.targetsOk)                                   return { ok: false, reason: "정정 대상 5건 drift" };
  if (!g.authorized)                                  return { ok: false, reason: "--apply + confirm 토큰 필요 (기본은 읽기 전용)" };
  return { ok: true, reason: "ok" };
}

// ── 자격증명 · HTTP ──────────────────────────────────────────────────────────
// 값은 절대 출력하지 않는다. 길이·앞자리도 찍지 않는다.

function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of [".env.local", ".dev.vars"]) {
    let raw = ""; try { raw = readFileSync(path.join(ROOT, f), "utf8"); } catch { continue; }
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !(m[1] in out)) out[m[1]] = m[2].trim();
    }
  }
  return out;
}

interface Conn { url: string; anon: string; admin: string; ref: string }
function connect(): Conn {
  const e = { ...loadEnv(), ...process.env } as Record<string, string>;
  const url = e.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const ref = (url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/) ?? [])[1] ?? "";
  return { url, anon: e.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", admin: e.SUPABASE_SERVICE_ROLE_KEY ?? "", ref };
}

async function rest(c: Conn, method: string, pathQ: string, body?: unknown, prefer?: string) {
  // 읽기는 anon, 쓰기는 service-role. anon 으로는 절대 쓰지 않는다.
  const key = method === "GET" ? c.anon : c.admin;
  if (!key) throw new Error(`자격증명 없음 (${method})`);
  const res = await fetch(`${c.url}/rest/v1/${pathQ}`, {
    method,
    headers: {
      apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${pathQ.split("?")[0]} → HTTP ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

// ── source 재현 ──────────────────────────────────────────────────────────────

function readRelease(): ReleaseItem[] {
  return JSON.parse(readFileSync(path.join(ROOT, RELEASE_MANIFEST), "utf8")).items;
}
function readEnriched(): EnrichedCandidate[] {
  const out: EnrichedCandidate[] = [];
  for (const l of readFileSync(path.join(ROOT, ENRICHED_JSONL), "utf8").split(/\r?\n/)) if (l.trim()) out.push(JSON.parse(l));
  return out;
}

async function buildSets(c: Conn) {
  const release = readRelease(), enriched = readEnriched();
  const byId = new Map(enriched.map(e => [e.candidate_id, e]));
  const p1 = selectP1Restaurants(release, enriched);

  const existing = (await rest(c, "GET",
    "city_spots?city=eq.busan&select=id,name,category,district,lat,lng,source_type,external_id&order=id.asc")) as ExistingSpot[];

  const intra = detectIntraSetConflicts(p1.map(r => ({
    candidate_id: r.candidate_id, display_name: displayName(r), name_ko: r.name_ko, name_en: r.name_en, lat: r.lat, lng: r.lng })));
  const classified = classifyAll(p1, existing).map(r =>
    (intra.get(r.candidate_id) && r.klass === "NEW_INSERT_SAFE") ? { ...r, klass: "AMBIGUOUS_REVIEW" as MatchClass } : r);

  const safeIds = new Set(classified.filter(r => r.klass === "NEW_INSERT_SAFE").map(r => r.candidate_id));
  const safe = p1.filter(r => safeIds.has(r.candidate_id));
  const ambiguous = classified.filter(r => r.klass === "AMBIGUOUS_REVIEW").map(r => r.candidate_id);

  const sem = classifyAllSemantics(safe.map(r => {
    const ss = (byId.get(r.candidate_id)!.source_summary ?? {}) as Record<string, unknown>;
    return {
      candidate_id: r.candidate_id, name_ko: r.name_ko, name_en: r.name_en,
      description_ko: r.description_ko, description_en: r.description_en, address: r.address,
      source_keys: (ss.source_keys as string[] | undefined) ?? [], primary_source: r.primary_source,
    } as SemanticInput;
  }));
  const allowlist = buildAllowlist(sem);
  const excluded = [...new Set([...ambiguous, ...sem.filter(s => s.klass !== "SEMANTIC_RESTAURANT_CONFIRMED").map(s => s.candidate_id)])];
  const allowSet = new Set(allowlist);
  const rows = safe.filter(r => allowSet.has(r.candidate_id)).map(mapToCitySpot).map(m => m.row);

  return { p1, safe, sem, allowlist, excluded, rows, existing, ambiguous,
           overlap: excluded.filter(id => allowSet.has(id)).length };
}

async function prestate(c: Conn) {
  const rows = (await rest(c, "GET",
    "city_spots?city=eq.busan&select=id,category,source_type,external_id,name")) as Record<string, string | null>[];
  return {
    total: rows.length,
    restaurant: rows.filter(r => r.category === "restaurant").length,
    attraction: rows.filter(r => r.category === "attraction").length,
    nature:     rows.filter(r => r.category === "nature").length,
    manual:     rows.filter(r => r.source_type === "manual").length,
    enrichment: rows.filter(r => r.source_type === IMPORT_SOURCE_TYPE).length,
    external_id_non_null: rows.filter(r => r.external_id !== null).length,
    names: rows.map(r => String(r.name)),
  };
}

// ── 실행 ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const c = connect();
  const authorized = isWriteAuthorized(argv);

  if (c.ref !== PRODUCTION_REF) { console.error(`중단: project ref 가 예상과 다르다`); process.exit(1); }

  // ── rollback 모드 ─────────────────────────────────────────────────────────
  const rbIdx = argv.indexOf("--rollback");
  if (rbIdx !== -1) {
    if (!argv.includes(`--confirm-batch=${CONFIRM_TOKEN}`)) { console.error("rollback 에도 confirm 토큰이 필요하다"); process.exit(1); }
    const man = JSON.parse(readFileSync(argv[rbIdx + 1], "utf8"));
    const ids: number[] = man.inserted_ids;
    if (!Array.isArray(ids) || ids.length === 0) { console.error("rollback 대상 id 없음"); process.exit(1); }
    // 3중 조건 — id allowlist + source_type + external_id 존재. wildcard 삭제하지 않는다.
    await rest(c, "PATCH",
      `city_spots?id=in.(${MANUAL_CORRECTION.map(m => m.id).join(",")})&city=eq.busan&source_type=eq.manual&category=eq.attraction`,
      { category: "restaurant" }, "return=representation");
    const del = await rest(c, "DELETE",
      `city_spots?id=in.(${ids.join(",")})&source_type=eq.${IMPORT_SOURCE_TYPE}&external_id=not.is.null`,
      undefined, "return=representation") as unknown[];
    console.log(`ROLLBACK 완료 — 삭제 ${del.length} / 대상 ${ids.length}`);
    return;
  }

  const sets = await buildSets(c);
  const sha = allowlistSha256(sets.allowlist);
  const pre = await prestate(c);
  const prestateOk = (["total","restaurant","attraction","nature","manual","enrichment","external_id_non_null"] as const)
    .every(k => pre[k] === EXPECTED_PRESTATE[k]);

  const targets = (await rest(c, "GET",
    `city_spots?id=in.(${MANUAL_CORRECTION.map(m => m.id).join(",")})&select=id,name,category,city,source_type,external_id`)) as Record<string, unknown>[];
  const targetsOk = targets.length === MANUAL_CORRECTION.length && MANUAL_CORRECTION.every(m => {
    const r = targets.find(t => t.id === m.id);
    return r && r.name === m.name && r.category === "restaurant" && r.city === "busan"
        && r.source_type === "manual" && r.external_id === null;
  });

  const nameClash = sets.rows.filter(r => pre.names.includes(r.name)).length;

  console.log("── 부산 P1 restaurant 운영 반영 ─────────────────────────");
  console.log(` P1 ${sets.p1.length} · NEW_INSERT_SAFE ${sets.safe.length} · AMBIGUOUS ${sets.ambiguous.length}`);
  console.log(` semantic confirmed ${sets.sem.filter(s => s.klass === "SEMANTIC_RESTAURANT_CONFIRMED").length}` +
              ` · likely ${sets.sem.filter(s => s.klass === "SEMANTIC_RESTAURANT_LIKELY").length}` +
              ` · not-restaurant ${sets.sem.filter(s => s.klass === "SEMANTIC_NOT_RESTAURANT").length}` +
              ` · review ${sets.sem.filter(s => s.klass === "SEMANTIC_REVIEW_REQUIRED").length}`);
  console.log(` allowlist ${sets.allowlist.length} · 제외 ${sets.excluded.length} · 교집합 ${sets.overlap}`);
  console.log(` ALLOWLIST_SHA256 ${sha}`);
  console.log(` pre-state ${JSON.stringify({ ...pre, names: undefined })}`);
  console.log(` pre-state 일치 ${prestateOk} · 정정대상 5건 정상 ${targetsOk} · (city,name) 충돌 ${nameClash}`);

  if (pre.enrichment === EXPECTED_ALLOWLIST_N) { console.log("\nALREADY_APPLIED — 이미 326건이 반영돼 있다. 아무것도 하지 않는다."); return; }

  const gate = writeGate({ ref: c.ref, allowlistCount: sets.allowlist.length, allowlistSha: sha,
                           excludedOverlap: sets.overlap, prestateOk, targetsOk, authorized });
  if (nameClash !== 0) { console.error("\n중단: 기존 이름과 충돌"); process.exit(1); }
  if (!gate.ok) { console.log(`\nPREFLIGHT ONLY — write 안 함 (${gate.reason})`); return; }

  // ── 실제 write ────────────────────────────────────────────────────────────
  console.log("\n[1/2] INSERT 326 …");
  const inserted = await rest(c, "POST", "city_spots", sets.rows, "return=representation") as Record<string, unknown>[];
  const insertedIds = inserted.map(r => Number(r.id));
  const insertedExt = inserted.map(r => String(r.external_id));
  console.log(`  inserted ${inserted.length} · id unique ${new Set(insertedIds).size} · external_id unique ${new Set(insertedExt).size}`);

  const outIdx = argv.indexOf("--out");
  if (outIdx !== -1 && argv[outIdx + 1]) {
    writeFileSync(argv[outIdx + 1], JSON.stringify({
      batch: CONFIRM_TOKEN, inserted_ids: insertedIds, inserted_external_ids: insertedExt,
      manual_correction_ids: MANUAL_CORRECTION.map(m => m.id), prestate: { ...pre, names: undefined },
    }, null, 2) + "\n", "utf8");
    console.log(`  rollback manifest → ${argv[outIdx + 1]}`);
  }
  if (inserted.length !== EXPECTED_ALLOWLIST_N) { console.error("중단: insert 수 불일치 — 정정 단계로 넘어가지 않는다"); process.exit(1); }

  console.log("[2/2] manual 5건 category 정정 …");
  const updated = await rest(c, "PATCH",
    `city_spots?id=in.(${MANUAL_CORRECTION.map(m => m.id).join(",")})&city=eq.busan&source_type=eq.manual&category=eq.restaurant`,
    { category: "attraction" }, "return=representation") as unknown[];
  console.log(`  updated ${updated.length} (기대 ${MANUAL_CORRECTION.length})`);

  const post = await prestate(c);
  const postOk = (["total","restaurant","attraction","nature","manual","enrichment"] as const)
    .every(k => post[k] === EXPECTED_POSTSTATE[k]);
  console.log(` post-state ${JSON.stringify({ ...post, names: undefined })}`);
  console.log(` post-state 일치 ${postOk}`);
}

const invokedDirectly = process.argv[1]?.includes("busan-p1-restaurant-production-apply");
if (invokedDirectly) main().catch(e => { console.error(String(e?.message ?? e)); process.exit(1); });
