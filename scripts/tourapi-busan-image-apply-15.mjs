/**
 * TASK-DATA-BUSAN-OVERNIGHT-ENRICHMENT-15 PHASE 5
 * VisitBusan 이미지 URL 적용 스크립트
 *
 * 규칙:
 *   - 기존 image_url이 있는 행은 절대 덮어쓰지 않음
 *   - 전체 행 수 유지 검증 (HARD STOP)
 *   - 이미지 바이너리 다운로드 없음 — URL만 기록
 *   - image_source = 'visitbusan', image_license = 'all_rights_reserved_visitbusan'
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const CSV   = path.join(ROOT, 'data/tourapi/candidates/busan/busan-integrated-candidates.csv');
const JFILE = path.join(ROOT, 'data/tourapi/candidates/busan/busan-integrated-candidates.json');
const MFILE = path.join(ROOT, 'data/tourapi/reports/busan/busan-integrated-candidates-metrics.json');

const IMAGE_RESULTS = 'C:/기본저장/나의 프로젝트/KoreaMate/.tools/playwright-visitbusan/image-results.json';

// ── CSV 파서 ────────────────────────────────────────────────
function parseCSVLine(line) {
  const cells = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      cells.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
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
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function rowToLine(row, hdr) {
  return hdr.map(h => escapeCSV(row[h])).join(',');
}

// ── 메인 ────────────────────────────────────────────────────
const raw = fs.readFileSync(CSV, 'utf-8');
const { hdr, rows } = parseCSV(raw);
const TOTAL_BEFORE = rows.length;

console.log(`=== PHASE 5 — 이미지 URL 적용 ===`);
console.log(`전체 행 수: ${TOTAL_BEFORE}`);

// 수집 결과 로드
const imageResults = JSON.parse(fs.readFileSync(IMAGE_RESULTS, 'utf-8'));
const successMap = {};
for (const [id, r] of Object.entries(imageResults)) {
  if (r.imageUrl) successMap[id] = r.imageUrl;
}
console.log(`수집 결과: ${Object.keys(imageResults).length}건 중 이미지 URL ${Object.keys(successMap).length}건`);

// 비밀값 패턴 검사
const SECRET_PATTERN = /api[_-]?key|secret|token|password|auth|bearer/i;
for (const url of Object.values(successMap)) {
  if (SECRET_PATTERN.test(url)) {
    console.error(`[HARD STOP] 비밀값 패턴 검출: ${url.substring(0, 60)}`);
    process.exit(1);
  }
}
console.log('비밀값 패턴 검사: 이상 없음 ✓');

// 적용
const stats = {
  applied: 0,
  skipped_existing: 0,
  skipped_no_result: 0,
  not_in_csv: 0,
};

for (const row of rows) {
  const id = row.candidate_id;
  if (!(id in successMap)) {
    stats.skipped_no_result++;
    continue;
  }

  // 기존 image_url이 있으면 절대 덮어쓰기 금지
  if (row.image_url && row.image_url !== '') {
    stats.skipped_existing++;
    continue;
  }

  row.image_url = successMap[id];
  row.image_source = 'visitbusan';
  row.image_license = 'all_rights_reserved_visitbusan';
  stats.applied++;
}

console.log(`\n적용 통계:`);
console.log(`  적용: ${stats.applied}건`);
console.log(`  건너뜀(기존 URL 있음): ${stats.skipped_existing}건`);
console.log(`  건너뜀(수집 결과 없음): ${stats.skipped_no_result}건`);

// HARD STOP: 행 수 불일치
if (rows.length !== TOTAL_BEFORE) {
  console.error(`[HARD STOP] 행 수 불일치: ${TOTAL_BEFORE} → ${rows.length}`);
  process.exit(1);
}
console.log(`\n행 수 검증: ${rows.length} === ${TOTAL_BEFORE} ✓`);

// ── 원자적 파일 교체 ─────────────────────────────────────────
const csvOut = [hdr.join(','), ...rows.map(r => rowToLine(r, hdr))].join('\n');
const csvTmp = CSV + '.tmp';
fs.writeFileSync(csvTmp, csvOut, 'utf-8');
fs.renameSync(csvTmp, CSV);
console.log('CSV 업데이트 완료 ✓');

const jsonTmp = JFILE + '.tmp';
fs.writeFileSync(jsonTmp, JSON.stringify(rows, null, 2), 'utf-8');
fs.renameSync(jsonTmp, JFILE);
console.log('JSON 업데이트 완료 ✓');

// metrics 업데이트
const metrics = JSON.parse(fs.readFileSync(MFILE, 'utf-8'));

// 이미지 보유 현황 집계
const imageStats = { total: 0, has_image: 0, no_image: 0, by_source: {} };
for (const row of rows) {
  const status = row.candidate_status;
  if (!['api_only_existing','existing_enriched','web_only_new'].includes(status)) continue;
  imageStats.total++;
  if (row.image_url && row.image_url !== '') {
    imageStats.has_image++;
    const src = row.image_source || 'unknown';
    imageStats.by_source[src] = (imageStats.by_source[src] || 0) + 1;
  } else {
    imageStats.no_image++;
  }
}

metrics.image_apply_15 = {
  task: 'TASK-DATA-BUSAN-OVERNIGHT-ENRICHMENT-15 PHASE 5',
  generated_at: new Date().toISOString().slice(0, 10),
  stats,
  image_coverage: imageStats,
  total_rows: rows.length,
};
const mTmp = MFILE + '.tmp';
fs.writeFileSync(mTmp, JSON.stringify(metrics, null, 2), 'utf-8');
fs.renameSync(mTmp, MFILE);
console.log('metrics 업데이트 완료 ✓');

console.log('\n=== PHASE 5 완료 ===');
console.log(`이미지 보유: ${imageStats.has_image}/${imageStats.total} (${(imageStats.has_image/imageStats.total*100).toFixed(1)}%)`);
console.log(`소스별:`, JSON.stringify(imageStats.by_source));
