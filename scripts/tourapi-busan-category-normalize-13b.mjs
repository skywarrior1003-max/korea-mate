/**
 * TASK-DATA-BUSAN-CATEGORY-NORMALIZE-13B
 * busan-K-* 665건 category=unknown → contentTypeId 기반 분류
 *
 * 분류 규칙:
 *   12 관광지       → attraction
 *   14 문화시설     → attraction
 *   15 축제공연행사 → event
 *   25 여행코스     → candidate_status=course_reference (독립 장소 아님)
 *   28 레포츠       → 키워드 기반 nature/attraction
 *   32 숙박         → accommodation
 *   38 쇼핑         → attraction (시장·상권)
 *   39 음식점       → restaurant
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const NBJ   = path.join(ROOT, 'data/tourapi/normalized/busan/busan-batch-normalized.json');
const CSV   = path.join(ROOT, 'data/tourapi/candidates/busan/busan-integrated-candidates.csv');
const JFILE = path.join(ROOT, 'data/tourapi/candidates/busan/busan-integrated-candidates.json');
const MFILE = path.join(ROOT, 'data/tourapi/reports/busan/busan-integrated-candidates-metrics.json');

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

// ── 분류 테이블 ─────────────────────────────────────────────
const CT_MAP = {
  12: { category: 'attraction',    contentType: '관광지' },
  14: { category: 'attraction',    contentType: '문화시설' },
  15: { category: 'event',         contentType: '축제공연행사' },
  25: { category: null,            contentType: '여행코스',     newStatus: 'course_reference' },
  28: { category: null,            contentType: '레포츠' },
  32: { category: 'accommodation', contentType: '숙박' },
  38: { category: 'attraction',    contentType: '쇼핑' },
  39: { category: 'restaurant',    contentType: '음식점' },
};

// 레포츠: 실내 시설 키워드 → attraction / 기본 → nature
const INDOOR_KW = ['빙상', '사격', '아이스', '수련관', '클럽', '레이저', '태그', '인라인', '교육원', '컨트리클럽', '볼링'];

function classifySports(title) {
  for (const kw of INDOOR_KW) {
    if (title.includes(kw)) return 'attraction';
  }
  return 'nature';
}

// ── 정규화 조회 맵 ───────────────────────────────────────────
const norm = JSON.parse(fs.readFileSync(NBJ, 'utf-8'));
const ctLookup = {};
for (const x of norm) {
  if (x.source_service === 'KorService2') {
    ctLookup[x.source_key] = { ct: x.content_type_id, title: x.title };
  }
}

// ── CSV 처리 ────────────────────────────────────────────────
const raw = fs.readFileSync(CSV, 'utf-8');
const { hdr, rows } = parseCSV(raw);

const stats = {
  total_processed: 0,
  attraction: 0, event: 0, accommodation: 0,
  restaurant: 0, nature: 0,
  course_reference_reclassified: 0,
  not_found: 0,
  skipped_already_categorized: 0,
};
const notFoundLog = [];
const changed = [];

for (const row of rows) {
  if (!row.candidate_id.startsWith('busan-K-')) continue;
  if (row.category !== 'unknown') {
    stats.skipped_already_categorized++;
    continue;
  }

  // 파이프 구분 다중 원천에서 KorService2 키 추출
  const srcKeys = (row.linked_source_keys || '').split('|').map(k => k.trim());
  const k2Key = srcKeys.find(k => k.startsWith('KorService2:'));

  if (!k2Key) {
    stats.not_found++;
    notFoundLog.push({ id: row.candidate_id, reason: 'no_korservice2_key', src: row.linked_source_keys });
    continue;
  }

  const normItem = ctLookup[k2Key];
  if (!normItem) {
    stats.not_found++;
    notFoundLog.push({ id: row.candidate_id, reason: 'normalized_miss', key: k2Key });
    continue;
  }

  const ct = normItem.ct;
  const entry = CT_MAP[ct];
  if (!entry) {
    stats.not_found++;
    notFoundLog.push({ id: row.candidate_id, reason: 'unknown_ct', ct, title: normItem.title });
    continue;
  }

  stats.total_processed++;
  const prev = { status: row.candidate_status, cat: row.category, ct: row.content_type };

  row.content_type = entry.contentType;
  row.category_compatibility_method = `korservice2_ct_${ct}`;

  if (entry.newStatus === 'course_reference') {
    row.candidate_status = 'course_reference';
    row.review_reason = '여행코스(contentTypeId=25): 독립 장소 후보 아님 — 13B 재분류';
    stats.course_reference_reclassified++;
  } else if (ct === 28) {
    const cat = classifySports(normItem.title);
    row.category = cat;
    stats[cat]++;
  } else {
    row.category = entry.category;
    stats[entry.category]++;
  }

  changed.push({
    id: row.candidate_id,
    ct,
    prev_status: prev.status,
    new_status: row.candidate_status,
    prev_cat: prev.cat,
    new_cat: row.category,
    title: normItem.title,
  });
}

// ── 최종 수치 확인 ───────────────────────────────────────────
const statusDist = {};
const catDist = {};
for (const row of rows) {
  statusDist[row.candidate_status] = (statusDist[row.candidate_status] || 0) + 1;
  if (['api_only_existing','existing_enriched','web_only_new'].includes(row.candidate_status)) {
    catDist[row.category] = (catDist[row.category] || 0) + 1;
  }
}
const active = (statusDist['existing_enriched'] || 0)
  + (statusDist['api_only_existing'] || 0)
  + (statusDist['web_only_new'] || 0);

// ── CSV 출력 ────────────────────────────────────────────────
const csvOut = [hdr.join(','), ...rows.map(r => rowToLine(r, hdr))].join('\n');
fs.writeFileSync(CSV, csvOut, 'utf-8');

// ── JSON 출력 ───────────────────────────────────────────────
fs.writeFileSync(JFILE, JSON.stringify(rows, null, 2), 'utf-8');

// ── metrics 업데이트 ─────────────────────────────────────────
const metrics = JSON.parse(fs.readFileSync(MFILE, 'utf-8'));
metrics.category_normalize_13b = {
  task: 'TASK-DATA-BUSAN-CATEGORY-NORMALIZE-13B',
  generated_at: new Date().toISOString().slice(0, 10),
  stats,
  not_found_log: notFoundLog,
  final_status_dist: statusDist,
  final_active_category_dist: catDist,
  final_total: rows.length,
  final_active: active,
};
fs.writeFileSync(MFILE, JSON.stringify(metrics, null, 2), 'utf-8');

// ── 콘솔 결과 ───────────────────────────────────────────────
console.log('=== TASK-DATA-BUSAN-CATEGORY-NORMALIZE-13B ===');
console.log('처리 결과:');
console.log(JSON.stringify(stats, null, 2));
console.log('\nnot_found 항목:');
notFoundLog.forEach(x => console.log(' ', JSON.stringify(x)));
console.log('\n최종 status 분포:');
console.log(JSON.stringify(statusDist, null, 2));
console.log('\n활성 행 category 분포:');
console.log(JSON.stringify(catDist, null, 2));
console.log('\n전체 행 수:', rows.length, '/ 활성 수:', active);
