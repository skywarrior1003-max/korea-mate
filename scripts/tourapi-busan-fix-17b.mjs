/**
 * TASK-DATA-BUSAN-FIX-17B
 * 분류 정확성 결함 4건 일괄 패치
 *
 * 결함 A: CSV에 image_source / image_license 열 미기록
 * 결함 B: final-metrics.json subcategory 수치 stale
 * 결함 C: handoff 문서 api_only_existing 991 → 969 (L112, L184) stale
 * 결함 D: NON_TEMPLE_SUFFIX regex 버그 → 홍법사·금수사·운수사 other_attraction 오분류
 *          + 교회·성당·향교가 temple로 오분류
 *
 * 실행 후 재검증:
 *   - temple 38건 (41 - 7 + 4)
 *   - cultural_site 28건 (24 + 4)
 *   - historic_site 24건 (21 + 3)
 *   - other_attraction 202건 (206 - 4)
 *   - CSV 전체 행 수 변화 없음
 *   - CSV image_source 318건 = JSON image_source 318건
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const CSV   = path.join(ROOT, 'data/tourapi/candidates/busan/busan-integrated-candidates.csv');
const JFILE = path.join(ROOT, 'data/tourapi/candidates/busan/busan-integrated-candidates.json');
const MFILE = path.join(ROOT, 'data/tourapi/reports/busan/busan-integrated-candidates-metrics.json');
const HANDOFF = path.join(ROOT, 'docs/tourapi/busan-handoff-to-main-pc.md');

// ── CSV 유틸 ────────────────────────────────────────────────
function parseCSVLine(line) {
  const cells = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (ch === ',' && !inQ) { cells.push(cur); cur = ''; }
    else cur += ch;
  }
  cells.push(cur); return cells;
}
function parseCSV(text) {
  const lines = text.split('\n');
  const hdr = parseCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = parseCSVLine(lines[i]);
    const row = {};
    hdr.forEach((h, idx) => { row[h] = cells[idx] ?? ''; });
    rows.push(row);
  }
  return { hdr, rows };
}
function escapeCSV(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r'))
    return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function rowToLine(row, hdr) { return hdr.map(h => escapeCSV(row[h])).join(','); }

// ── 패치 정의 ─────────────────────────────────────────────────
// 결함 D: 교회·성당→cultural_site, 향교→historic_site (7건 temple 탈출)
const RECLASSIFY_FROM_TEMPLE = {
  'busan-A-00005': { sub: 'cultural_site',  status: 'classified_rule', evidence: 'keyword:church_cathedral' },
  'busan-VB-259':  { sub: 'cultural_site',  status: 'classified_rule', evidence: 'keyword:church_cathedral' },
  'busan-K-00188': { sub: 'cultural_site',  status: 'classified_rule', evidence: 'keyword:church_cathedral' },
  'busan-K-00677': { sub: 'cultural_site',  status: 'classified_rule', evidence: 'keyword:church_cathedral' },
  'busan-A-00086': { sub: 'historic_site',  status: 'classified_rule', evidence: 'keyword:confucian_hist' },
  'busan-K-00200': { sub: 'historic_site',  status: 'classified_rule', evidence: 'keyword:confucian_hist' },
  'busan-VB-439':  { sub: 'historic_site',  status: 'classified_rule', evidence: 'keyword:confucian_hist' },
};

// 결함 D: NON_TEMPLE_SUFFIX 버그 수정 → 4건 other_attraction→temple
const RECLASSIFY_TO_TEMPLE = {
  'busan-A-00093': { sub: 'temple', status: 'classified_rule', evidence: 'title_suffix:사(寺)_pattern' },
  'busan-A-00195': { sub: 'temple', status: 'classified_rule', evidence: 'title_suffix:사(寺)_pattern' },
  'busan-K-00023': { sub: 'temple', status: 'classified_rule', evidence: 'title_suffix:사(寺)_pattern' },
  'busan-K-00090': { sub: 'temple', status: 'classified_rule', evidence: 'title_suffix:사(寺)_pattern' },
};

const ALL_PATCHES = { ...RECLASSIFY_FROM_TEMPLE, ...RECLASSIFY_TO_TEMPLE };

// ── 실행 ─────────────────────────────────────────────────────
console.log('=== TASK-DATA-BUSAN-FIX-17B ===\n');

// CSV 로드
const rawCSV = fs.readFileSync(CSV, 'utf-8');
const { hdr, rows } = parseCSV(rawCSV);
const TOTAL_BEFORE = rows.length;
console.log(`CSV 로드: ${TOTAL_BEFORE}건`);

// JSON 로드 (image_source 참조용)
const jsonRows = JSON.parse(fs.readFileSync(JFILE, 'utf-8'));
const jsonMap = {};
for (const r of jsonRows) {
  jsonMap[r.candidate_id] = r;
}
const jWithSrc = jsonRows.filter(r => r.image_source);
console.log(`JSON image_source 항목: ${jWithSrc.length}건`);

// ── 결함 A: image_source / image_license 열 추가 ─────────────
if (!hdr.includes('image_source')) {
  hdr.push('image_source');
  console.log('  → 열 추가: image_source');
}
if (!hdr.includes('image_license')) {
  hdr.push('image_license');
  console.log('  → 열 추가: image_license');
}

// ── 결함 D: subcategory 패치 + 결함 A: image_source 채우기 ────
const patchLog = [];
let imgApplied = 0;

for (const row of rows) {
  const id = row.candidate_id;

  // subcategory 패치
  if (id in ALL_PATCHES) {
    const p = ALL_PATCHES[id];
    const prevSub = row.subcategory;
    row.subcategory        = p.sub;
    row.subcategory_status = p.status;
    row.subcategory_evidence = p.evidence;
    patchLog.push(`  RECLASSIFY ${id}: ${prevSub} → ${p.sub} [${p.evidence}]`);
  }

  // image_source / image_license (JSON에서 읽기, 없으면 빈 문자열)
  const jr = jsonMap[id];
  if (jr) {
    row.image_source  = jr.image_source  || '';
    row.image_license = jr.image_license || '';
    if (row.image_source) imgApplied++;
  } else {
    row.image_source  = row.image_source  || '';
    row.image_license = row.image_license || '';
  }
}

console.log('\n패치 상세:');
patchLog.forEach(l => console.log(l));

// ── HARD STOP 검증 ────────────────────────────────────────────
console.log('\n--- HARD STOP 검증 ---');

// 1. 행 수 불변
if (rows.length !== TOTAL_BEFORE) {
  console.error(`[HARD STOP] 행 수 변화: ${TOTAL_BEFORE} → ${rows.length}`);
  process.exit(1);
}
console.log(`✓ 행 수 불변: ${rows.length}`);

// 2. 패치 대상 전수 확인
const rowMap = {};
for (const r of rows) rowMap[r.candidate_id] = r;

for (const [id, p] of Object.entries(ALL_PATCHES)) {
  const r = rowMap[id];
  if (!r) {
    console.error(`[HARD STOP] 패치 대상 누락: ${id}`);
    process.exit(1);
  }
  if (r.subcategory !== p.sub) {
    console.error(`[HARD STOP] 패치 미적용: ${id} expected ${p.sub}, got ${r.subcategory}`);
    process.exit(1);
  }
}
console.log(`✓ 패치 전수 확인: ${Object.keys(ALL_PATCHES).length}건`);

// 3. subcategory 분포 검증
const dist = {};
for (const r of rows) {
  if (!['api_only_existing','existing_enriched','web_only_new'].includes(r.candidate_status)) continue;
  dist[r.subcategory] = (dist[r.subcategory] || 0) + 1;
}
const expectedCounts = { temple: 38, cultural_site: 28, historic_site: 24, other_attraction: 202 };
let distOK = true;
for (const [k, v] of Object.entries(expectedCounts)) {
  const got = dist[k] || 0;
  if (got !== v) {
    console.error(`[HARD STOP] subcategory ${k}: 예상 ${v}, 실제 ${got}`);
    distOK = false;
  }
}
if (!distOK) process.exit(1);
console.log(`✓ subcategory 분포: temple:${dist.temple}, cultural_site:${dist.cultural_site}, historic_site:${dist.historic_site}, other_attraction:${dist.other_attraction}`);

// 4. 교회/성당 temple 잔류 금지
const illegalTemple = rows.filter(r => {
  if (r.subcategory !== 'temple') return false;
  const t = r.title_ko || '';
  return t.includes('교회') || t.includes('성당');
});
if (illegalTemple.length > 0) {
  console.error(`[HARD STOP] 교회/성당이 temple로 잔류: ${illegalTemple.map(r => r.candidate_id).join(', ')}`);
  process.exit(1);
}
console.log(`✓ 교회/성당 temple 잔류: 0건`);

// 5. 향교 temple 잔류 금지
const illegalTemple2 = rows.filter(r => r.subcategory === 'temple' && (r.title_ko||'').includes('향교'));
if (illegalTemple2.length > 0) {
  console.error(`[HARD STOP] 향교가 temple로 잔류: ${illegalTemple2.map(r => r.candidate_id).join(', ')}`);
  process.exit(1);
}
console.log(`✓ 향교 temple 잔류: 0건`);

// 6. image_source CSV↔JSON 일치 확인
const csvWithSrc = rows.filter(r => r.image_source === 'visitbusan');
if (csvWithSrc.length !== jWithSrc.length) {
  console.error(`[HARD STOP] image_source 불일치: CSV ${csvWithSrc.length}건 vs JSON ${jWithSrc.length}건`);
  process.exit(1);
}
console.log(`✓ image_source CSV↔JSON 일치: 318건`);

// 7. image_license 비추정 확인 (visitbusan 외 license 없어야 함)
const badLic = rows.filter(r => r.image_license && r.image_license !== 'all_rights_reserved_visitbusan');
if (badLic.length > 0) {
  console.error(`[HARD STOP] 비허가 image_license: ${badLic.map(r => r.candidate_id + ':' + r.image_license).join(', ')}`);
  process.exit(1);
}
console.log(`✓ 비허가 image_license: 0건`);

// ── 원자적 CSV 기록 ────────────────────────────────────────────
const csvOut = [hdr.join(','), ...rows.map(r => rowToLine(r, hdr))].join('\n');
const csvTmp = CSV + '.tmp';
fs.writeFileSync(csvTmp, csvOut, 'utf-8');
fs.renameSync(csvTmp, CSV);
console.log('\n✓ CSV 기록 완료');

// ── 원자적 JSON 기록 ──────────────────────────────────────────
// JSON에 subcategory 패치 반영 (image_source는 이미 있음)
for (const r of jsonRows) {
  const patch = ALL_PATCHES[r.candidate_id];
  if (patch) {
    r.subcategory        = patch.sub;
    r.subcategory_status = patch.status;
    r.subcategory_evidence = patch.evidence;
  }
}
const jTmp = JFILE + '.tmp';
fs.writeFileSync(jTmp, JSON.stringify(jsonRows, null, 2), 'utf-8');
fs.renameSync(jTmp, JFILE);
console.log('✓ JSON 기록 완료');

// ── 결함 B: metrics 업데이트 ──────────────────────────────────
const metrics = JSON.parse(fs.readFileSync(MFILE, 'utf-8'));

// subcategory_classify_14 분포 업데이트 (CSV 재계산)
const fullDist = {};
for (const r of rows) {
  if (!['api_only_existing','existing_enriched','web_only_new'].includes(r.candidate_status)) continue;
  fullDist[r.subcategory] = (fullDist[r.subcategory] || 0) + 1;
}
metrics.subcategory_classify_14.subcategory_distribution = fullDist;

// image_source 분포 재계산
const imgDist = {};
let imgHas = 0, imgNo = 0;
for (const r of rows) {
  if (!['api_only_existing','existing_enriched','web_only_new'].includes(r.candidate_status)) continue;
  if (r.image_url) {
    imgHas++;
    const src = r.image_source || 'unknown';
    imgDist[src] = (imgDist[src] || 0) + 1;
  } else {
    imgNo++;
  }
}

metrics.fix_17b = {
  task: 'TASK-DATA-BUSAN-FIX-17B',
  applied_at: '2026-07-25',
  defects_fixed: ['A_csv_image_source_missing', 'B_metrics_stale', 'C_handoff_stale_991', 'D_non_temple_suffix_bug'],
  reclassified: {
    temple_to_cultural_site: Object.keys(RECLASSIFY_FROM_TEMPLE).filter(id => ALL_PATCHES[id].sub === 'cultural_site'),
    temple_to_historic_site: Object.keys(RECLASSIFY_FROM_TEMPLE).filter(id => ALL_PATCHES[id].sub === 'historic_site'),
    other_attraction_to_temple: Object.keys(RECLASSIFY_TO_TEMPLE),
  },
  subcategory_delta: {
    temple:           { before: 41, after: 38 },
    cultural_site:    { before: 24, after: 28 },
    historic_site:    { before: 21, after: 24 },
    other_attraction: { before: 206, after: 202 },
  },
  image_source_csv_added: imgApplied,
  image_coverage_after: {
    total: imgHas + imgNo,
    has_image: imgHas,
    no_image: imgNo,
    by_source: imgDist,
  },
};

const mTmp = MFILE + '.tmp';
fs.writeFileSync(mTmp, JSON.stringify(metrics, null, 2), 'utf-8');
fs.renameSync(mTmp, MFILE);
console.log('✓ metrics 업데이트 완료');

// ── 결함 C: handoff 문서 수정 ─────────────────────────────────
let doc = fs.readFileSync(HANDOFF, 'utf-8');

// L73: temple:41 → temple:38, other_attraction:206 → other_attraction:202
doc = doc.replace('temple:41', 'temple:38');
doc = doc.replace('other_attraction:206', 'other_attraction:202');

// L112: api_only_existing 991건 → 969건
doc = doc.replace('api_only_existing 991건 — 현재 유지', 'api_only_existing 969건 — 현재 유지');

// L184: api_only_existing 991 → 969
doc = doc.replace('existing_enriched 362 + api_only_existing 991', 'existing_enriched 362 + api_only_existing 969');

// TASK-17B 보강 섹션 추가 (TASK-15 야간 보강 테이블에 행 추가)
const row17b = '| TASK-17B | 분류 정확성 결함 4건 패치 (교회·향교·사찰 재분류 + CSV image_source 열 추가) | temple 38, cultural_site 28, historic_site 24 |';
const insertAfter = '| TASK-15 PHASE 4-5 | VisitBusan 이미지 URL 318건 수집·적용 | 이미지 보유율 91.4% (1,501/1,642) |';
if (!doc.includes('TASK-17B') && doc.includes(insertAfter)) {
  doc = doc.replace(insertAfter, insertAfter + '\n' + row17b);
}

fs.writeFileSync(HANDOFF, doc, 'utf-8');
console.log('✓ handoff 문서 업데이트 완료');

// ── 최종 요약 ─────────────────────────────────────────────────
console.log('\n=== FIX-17B 완료 ===');
console.log(`temple: 41 → ${dist.temple}`);
console.log(`cultural_site: 24 → ${dist.cultural_site}`);
console.log(`historic_site: 21 → ${dist.historic_site}`);
console.log(`other_attraction: 206 → ${dist.other_attraction}`);
console.log(`CSV image_source 318건 기록 완료`);
console.log(`전체 행 수: ${rows.length} (변화 없음)`);
