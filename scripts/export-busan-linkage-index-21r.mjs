#!/usr/bin/env node
/**
 * export-busan-linkage-index-21r.mjs
 *
 * 부산 21Q 이미지 산출물과 운영 city_spots 를 잇기 위한 compact linkage index 생성.
 *
 * 왜 필요한가:
 *   21Q 산출물(curated-images / image-status)에는 candidate_id·title·category 뿐이라
 *   좌표·외부 식별자·행정구역·수집일이 없다. 그 값들은 research 브랜치의 후보·정규화
 *   파일에만 있고, 두 파일 합계가 12MB 라 master 에 통째로 넣을 수 없다.
 *   그래서 연결에 필요한 필드만 뽑아 한 파일로 고정한다.
 *
 * 안전 규약:
 *   - 모든 입력은 read-only. research 파일은 `git show <SOURCE_COMMIT>:<path>` 로만 읽고
 *     작업 트리에 복사하지 않는다.
 *   - 출력은 OUTPUT 경로 하나뿐. 기존 파일을 수정·덮어쓰지 않는다(이미 있으면 중단).
 *   - 21F·21G 파이프라인을 실행하지 않는다(고정 경로 writeAtomic 덮어쓰기 위험).
 *   - 결측값을 추정하지 않는다. 모르면 공란으로 둔다.
 *   - 파일 mtime·git commit 날짜를 collected_at 으로 쓰지 않는다.
 *   - 같은 입력이면 같은 출력. 실행 시각·난수·Map 순회 순서에 의존하지 않는다.
 *
 * 실행:
 *   node scripts/export-busan-linkage-index-21r.mjs
 *   node scripts/export-busan-linkage-index-21r.mjs --dry-run   (파일을 쓰지 않고 검증만)
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** research 입력을 고정하는 커밋. 바뀌면 출력도 바뀌므로 인자로 받지 않는다. */
const SOURCE_COMMIT = "fe43388";

const MASTER_IN = {
  curated: "data/tourapi/reports/busan/busan-curated-images-21q.jsonl",
  status:  "data/tourapi/reports/busan/busan-image-status-21q.csv",
  vbRights:"data/tourapi/reports/busan/busan-visitbusan-rights-21h-rev2.csv",
};

const RESEARCH_IN = {
  candidates: "data/tourapi/candidates/busan/busan-integrated-candidates.csv",
  normalized: "data/tourapi/normalized/busan/busan-batch-normalized.json",
  vbContent:  "data/tourapi/candidates/busan/visitbusan-content-full.csv",
  pgIntegrated: "data/tourapi/normalized/photo-gallery/integrated/busan-photo-gallery-integrated-21d-rev2.jsonl",
};

const OUTPUT = "data/tourapi/reports/busan/busan-linkage-index-21r.csv";

const EXPECT = {
  rows: 1642,
  imageStatus: { image_sufficient: 1506, source_exhausted: 134, image_partial: 2 },
  vbOperationalAssumed: 958,
};

// ── 입력 읽기 ────────────────────────────────────────────────────────────────

function readMaster(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** research 파일은 작업 트리에 내려놓지 않고 git object 에서 직접 읽는다 */
function readResearch(rel) {
  return execFileSync("git", ["show", `${SOURCE_COMMIT}:${rel}`], {
    cwd: ROOT, encoding: "utf8", maxBuffer: 1024 * 1024 * 256,
  });
}

/** RFC4180 최소 파서 — 따옴표 안의 쉼표·개행·이중따옴표를 처리한다 */
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;   // BOM 제거
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ",") { row.push(field); field = ""; continue; }
    if (c === "\r") continue;
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift() ?? [];
  return rows
    .filter((r) => r.length > 1 || (r[0] ?? "").trim() !== "")
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

const csvEscape = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const trim = (v) => (v === null || v === undefined ? "" : String(v).trim());

// ── 원천 종류 판정 ───────────────────────────────────────────────────────────
//
// source_key 는 `Service:ID:lang` 또는 `VisitBusanContent:type:ID:lang` 형태다.
// data-source-priority.md 의 원천 역할 분류를 그대로 따른다:
//   기본 원천(primary)  = 도시 공식 관광사이트 (VisitBusan 계열)
//   보완 원천           = 한국관광공사 TourAPI (KorService2 / EngService2)
// primary 선택은 이 역할 순서로만 결정한다 — 이름·최신성으로 흔들리지 않게 고정.

const SERVICE_SOURCE_TYPE = {
  VisitBusanContent:  "visitbusan_web",
  AttractionService:  "busan_official_api",
  FoodService:        "busan_official_api",
  FestivalService:    "busan_official_api",
  KorService2:        "kto_tourapi",
  EngService2:        "kto_tourapi",
};

/** 낮을수록 우선. 도시 공식 원천이 기본 원천이다. */
const SOURCE_TYPE_RANK = { visitbusan_web: 0, busan_official_api: 1, kto_tourapi: 2 };

const serviceOf = (key) => key.split(":")[0] ?? "";
const sourceTypeOf = (key) => SERVICE_SOURCE_TYPE[serviceOf(key)] ?? "";

/**
 * 여러 source_key 중 대표 1개를 고른다.
 * 1) 원천 역할 순위, 2) 동순위면 key 문자열 오름차순 — 둘 다 입력에만 의존하므로
 * 실행할 때마다 같은 결과가 나온다.
 */
function pickPrimaryKey(keys) {
  return [...keys].sort((a, b) => {
    const ra = SOURCE_TYPE_RANK[sourceTypeOf(a)] ?? 99;
    const rb = SOURCE_TYPE_RANK[sourceTypeOf(b)] ?? 99;
    return ra !== rb ? ra - rb : (a < b ? -1 : a > b ? 1 : 0);
  })[0];
}

// ── 본체 ─────────────────────────────────────────────────────────────────────

function main() {
  const dryRun = process.argv.includes("--dry-run");
  const outAbs = path.join(ROOT, OUTPUT);
  if (!dryRun && fs.existsSync(outAbs)) {
    fail(`출력 파일이 이미 있다: ${OUTPUT} — 덮어쓰지 않는다. 지우고 다시 실행하라.`);
  }

  // master 입력
  const curated = readMaster(MASTER_IN.curated).split("\n")
    .filter((l) => l.trim()).map((l) => JSON.parse(l));
  const statusRows = parseCsv(readMaster(MASTER_IN.status));
  const vbRightsRows = parseCsv(readMaster(MASTER_IN.vbRights));

  const status   = new Map(statusRows.map((r) => [r.candidate_id, r]));
  const vbRights = new Map(vbRightsRows.map((r) => [r.candidate_id, r]));

  // research 입력 (git object 에서 직접)
  const candidates = new Map(
    parseCsv(readResearch(RESEARCH_IN.candidates)).map((r) => [r.candidate_id, r]));
  const normalized = new Map(
    JSON.parse(readResearch(RESEARCH_IN.normalized)).map((r) => [r.source_key, r]));
  const vbContent = new Map(
    parseCsv(readResearch(RESEARCH_IN.vbContent)).map((r) => [r.source_key, r]));

  // PG 는 curated 에 실제로 쓰인 photo id 행만 필요하다 (9,630행 중 극히 일부)
  const pgWanted = new Set();
  for (const place of curated) {
    for (const img of place.curated_images ?? []) {
      if (img.source_type === "photo_gallery") {
        const m = String(img.photo_url ?? "").match(/(\d+)\.jpg$/);
        if (m) pgWanted.add(m[1]);
      }
    }
  }
  const pgCollected = new Map();
  if (pgWanted.size) {
    for (const line of readResearch(RESEARCH_IN.pgIntegrated).split("\n")) {
      if (!line.trim()) continue;
      const r = JSON.parse(line);
      const id = String(r.source_id ?? "");
      if (pgWanted.has(id)) pgCollected.set(id, trim(r.collected_at));
    }
  }

  const problems = [];
  const out = [];

  for (const place of curated) {
    const cid = place.candidate_id;
    const cand = candidates.get(cid);
    const st   = status.get(cid);
    if (!cand) { problems.push(`${cid}: integrated-candidates 에 없음`); continue; }
    if (!st)   { problems.push(`${cid}: image-status-21q 에 없음`); continue; }

    const keys = trim(cand.linked_source_keys).split("|").map(trim).filter(Boolean);
    if (!keys.length) { problems.push(`${cid}: linked_source_keys 비어 있음`); continue; }
    const unresolved = keys.filter((k) => !normalized.has(k) && !vbContent.has(k));
    if (unresolved.length === keys.length) {
      problems.push(`${cid}: source_key 전부 미해석 (${keys.join("|")})`);
      continue;
    }

    const primaryKey = pickPrimaryKey(keys);

    // district — normalized 가 명시 필드를 가진 경우에만 사용한다.
    // 주소에서 추측하지 않는다(결측 추정 금지). 없으면 공란.
    let district = "";
    for (const k of keys) {
      const d = trim(normalized.get(k)?.district);
      if (d) { district = d; break; }
    }

    // collected_at — 대표 source_key 의 수집일을 쓴다.
    // 후보 하나가 두 원천에서 수집되면 호출 시각이 초 단위로 다르지만, 그건
    // 같은 수집 회차의 시각 차이지 값 충돌이 아니다. 날짜(YYYY-MM-DD)가 서로
    // 다르면 실제 충돌로 보고 중단한다.
    const collectedOf = (k) =>
      trim(normalized.get(k)?.collected_at) || trim(vbContent.get(k)?.collected_at);
    const collected = collectedOf(primaryKey) ||
                      keys.map(collectedOf).find(Boolean) || "";
    const days = new Set(keys.map(collectedOf).filter(Boolean).map((s) => s.slice(0, 10)));
    if (days.size > 1) {
      problems.push(`${cid}: collected_at 날짜 불일치 ${[...days].sort().join(" / ")}`);
      continue;
    }
    if (!collected) { problems.push(`${cid}: collected_at 확보 실패`); continue; }

    // 이미지 — curated_images 순서를 그대로 신뢰한다. role=primary 가 있으면 그것,
    // 없으면 첫 번째. 이미지가 없으면 공란.
    const imgs = place.curated_images ?? [];
    const primaryImg = imgs.find((i) => i.role === "primary") ?? imgs[0];

    // 권리 — SSOT 는 image-status-21q.csv 의 rights_status_21q 뿐이다.
    // curated JSONL 안의 rights 필드는 21H-REV2 재분류 이전 값이라 사용하지 않는다.
    const rightsStatus = trim(st.rights_status_21q);
    if (rightsStatus === "rights_confirmed") {
      problems.push(`${cid}: rights_confirmed 는 이 파이프라인에서 나올 수 없다`);
      continue;
    }
    const rightsBasis = trim(vbRights.get(cid)?.rights_basis) || trim(st.change_reason);

    // 좌표·category 는 연결의 최소 조건이라 없으면 실패로 본다.
    const lat = trim(cand.latitude), lng = trim(cand.longitude);
    const category = trim(place.category) || trim(cand.category);
    if (!lat || !lng) { problems.push(`${cid}: 좌표 없음`); continue; }
    if (!category)    { problems.push(`${cid}: category 없음`); continue; }

    // PG 이미지는 장소 수집일이 아니라 사진 자체의 수집일이 따로 있다.
    let imgCollected = "";
    if (primaryImg?.source_type === "photo_gallery") {
      const m = String(primaryImg.photo_url ?? "").match(/(\d+)\.jpg$/);
      imgCollected = m ? (pgCollected.get(m[1]) ?? "") : "";
    }

    out.push({
      candidate_id: cid,
      title_ko: trim(place.title_ko) || trim(cand.title_ko),
      category,
      district,
      lat, lng,
      primary_source_type: sourceTypeOf(primaryKey),
      primary_external_id: primaryKey,
      linked_source_keys: keys.join("|"),
      source_url:  trim(cand.source_detail_url),
      display_url: trim(cand.external_official_url),
      primary_image_url: trim(primaryImg?.photo_url),
      image_count: String(imgs.length),
      image_status: trim(st.image_status_21q),
      rights_status: rightsStatus,
      rights_basis: rightsBasis,
      collected_at: imgCollected || collected,
      provenance_file: RESEARCH_IN.candidates,
      provenance_commit: SOURCE_COMMIT,
    });
  }

  if (problems.length) {
    console.error(`[FAIL] 해결되지 않은 행 ${problems.length}건`);
    for (const p of problems.slice(0, 20)) console.error("  " + p);
    process.exit(1);
  }

  // candidate_id 오름차순 고정 — 입력 순서가 바뀌어도 출력 SHA 가 흔들리지 않게 한다
  out.sort((a, b) => (a.candidate_id < b.candidate_id ? -1 : a.candidate_id > b.candidate_id ? 1 : 0));

  validate(out);

  const cols = Object.keys(out[0]);
  const csv = [cols.join(","), ...out.map((r) => cols.map((c) => csvEscape(r[c])).join(","))]
    .join("\n") + "\n";

  if (dryRun) {
    console.log(`[dry-run] ${out.length}행 / ${Buffer.byteLength(csv)}B — 파일을 쓰지 않았다`);
    return;
  }
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });
  fs.writeFileSync(outAbs, csv, "utf8");     // BOM 없이 UTF-8
  console.log(`[OK] ${OUTPUT} — ${out.length}행 / ${Buffer.byteLength(csv)}B`);
}

/** 산출물이 기존 확정 수치를 그대로 재현하는지 확인한다. 하나라도 어긋나면 중단. */
function validate(rows) {
  const errs = [];
  if (rows.length !== EXPECT.rows) errs.push(`행 수 ${rows.length} ≠ ${EXPECT.rows}`);

  const ids = new Set(rows.map((r) => r.candidate_id));
  if (ids.size !== rows.length) errs.push(`candidate_id 중복 ${rows.length - ids.size}건`);

  const st = {};
  for (const r of rows) st[r.image_status] = (st[r.image_status] ?? 0) + 1;
  for (const [k, v] of Object.entries(EXPECT.imageStatus)) {
    if ((st[k] ?? 0) !== v) errs.push(`${k} ${st[k] ?? 0} ≠ ${v}`);
  }
  if (st.image_missing) errs.push(`image_missing ${st.image_missing} ≠ 0`);

  const oa = rows.filter((r) => r.rights_status === "operational_assumed").length;
  if (oa < EXPECT.vbOperationalAssumed) {
    errs.push(`operational_assumed ${oa} < ${EXPECT.vbOperationalAssumed}`);
  }
  if (rows.some((r) => r.rights_status === "rights_confirmed")) {
    errs.push("rights_confirmed 가 존재한다 — 승격 금지");
  }
  // 21H-REV2 이전 값이 섞여 들어오지 않았는지 (JSONL 의 rights 어휘)
  const stale = new Set(["review_required", "usable", "KOGL_assumed"]);
  if (rows.some((r) => stale.has(r.rights_status))) {
    errs.push("curated JSONL 구버전 rights 값이 섞였다");
  }

  for (const f of ["lat", "lng", "category", "collected_at", "primary_external_id", "primary_source_type"]) {
    const n = rows.filter((r) => !r[f]).length;
    if (n) errs.push(`${f} 결측 ${n}건`);
  }
  const noType = rows.filter((r) => !SOURCE_TYPE_RANK.hasOwnProperty(r.primary_source_type)).length;
  if (noType) errs.push(`알 수 없는 primary_source_type ${noType}건`);

  if (errs.length) {
    console.error("[FAIL] 검증 실패");
    for (const e of errs) console.error("  " + e);
    process.exit(1);
  }
  const imgTotal = rows.reduce((s, r) => s + Number(r.image_count), 0);
  const noImg = rows.filter((r) => r.image_count === "0").length;
  console.log(`  검증 통과 — ${rows.length}행 · 이미지 합계 ${imgTotal} · 이미지 0장 ${noImg}`);
  console.log(`  image_status ${JSON.stringify(st)}`);
  console.log(`  operational_assumed ${oa} · rights_confirmed 0`);
}

function fail(msg) { console.error("[FAIL] " + msg); process.exit(1); }

main();
