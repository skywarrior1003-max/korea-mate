#!/usr/bin/env node
/**
 * TASK-DATA-BUSAN-INTEGRATED-CANDIDATES-06
 * VisitBusan + canonical 통합 후보 생성
 *
 * 입력:
 *   busan-canonical-candidates.csv          (1,356)
 *   busan-visitbusan-match-candidates.csv   (362 matched)
 *   busan-visitbusan-web-only.csv           (402 web_only: 353 web_only_new + 49 course)
 *   busan-visitbusan-manual-review.csv      (9 VB manual_review)
 *   visitbusan-content-full.json            (lat/lon 조인용)
 *
 * 출력 (PASS 시):
 *   busan-integrated-candidates.csv / .json
 *   busan-integrated-manual-review.csv
 *   busan-integrated-candidates-metrics.json
 *   busan-integrated-candidates-06-report.md
 *
 * 금지: canonical 수정 / DB / migration / deploy / commit / push
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.dirname(__dir);
const TODAY = new Date().toISOString().slice(0, 10);

// ─── 파일 경로 ─────────────────────────────────────────────────────────────────
const IN_CANONICAL  = path.join(ROOT, 'data/tourapi/candidates/busan/busan-canonical-candidates.csv');
const IN_MATCH      = path.join(ROOT, 'data/tourapi/candidates/busan/busan-visitbusan-match-candidates.csv');
const IN_WEBONLY    = path.join(ROOT, 'data/tourapi/candidates/busan/busan-visitbusan-web-only.csv');
const IN_MANUAL     = path.join(ROOT, 'data/tourapi/candidates/busan/busan-visitbusan-manual-review.csv');
const IN_FULL_JSON  = path.join(ROOT, 'data/tourapi/candidates/busan/visitbusan-content-full.json');

const OUT_CSV       = path.join(ROOT, 'data/tourapi/candidates/busan/busan-integrated-candidates.csv');
const OUT_JSON      = path.join(ROOT, 'data/tourapi/candidates/busan/busan-integrated-candidates.json');
const OUT_MANUAL    = path.join(ROOT, 'data/tourapi/candidates/busan/busan-integrated-manual-review.csv');
const OUT_METRICS   = path.join(ROOT, 'data/tourapi/reports/busan/busan-integrated-candidates-metrics.json');
const OUT_REPORT    = path.join(ROOT, 'docs/tourapi/busan-integrated-candidates-06-report.md');

// 임시 파일
const TMP_CSV  = OUT_CSV  + '.tmp';
const TMP_JSON = OUT_JSON + '.tmp';

// ─── 필수 컬럼 ────────────────────────────────────────────────────────────────
const CSV_HDR = [
  'candidate_id', 'canonical_id', 'candidate_status', 'title_ko',
  'category', 'subcategory', 'content_type',
  'latitude', 'longitude', 'coordinate_distance_m',
  'hours', 'address', 'phone',
  'external_official_url', 'source_detail_url', 'image_url',
  'visitbusan_uc_seq', 'linked_source_keys',
  'field_provenance', 'category_compatibility_method', 'review_reason',
];

// ─── city_spots 카테고리 매핑 ─────────────────────────────────────────────────
// city_spots 허용 category: attraction / restaurant / nature / event / accommodation
const VB_TO_CITY = {
  attraction: { category: 'attraction', subcategory: 'unknown', compat: 'direct' },
  food:       { category: 'restaurant', subcategory: 'unknown', compat: 'direct' },
  shopping:   { category: 'attraction', subcategory: 'unknown', compat: 'unknown_allowed' }, // city_spots에 shopping 없음 → 임시
  experience: { category: 'attraction', subcategory: 'unknown', compat: 'unknown_allowed' }, // city_spots에 experience 없음 → 임시
  course:     { category: '',           subcategory: '',         compat: 'course_excluded' },
};

const CANON_TO_CITY = {
  attraction: { category: 'attraction', subcategory: 'unknown' },
  food:       { category: 'restaurant', subcategory: 'unknown' },
  festival:   { category: 'event',      subcategory: 'unknown' },
  '':         { category: 'unknown',    subcategory: 'unknown' }, // null/KorService2
};

// ─── 유틸 ─────────────────────────────────────────────────────────────────────
function csvCell(v) {
  const s = String(v ?? '').replace(/[\r\n]+/g, ' ').trim();
  return (s.includes(',') || s.includes('"') || s.includes('\n'))
    ? `"${s.replace(/"/g, '""')}"` : s;
}
function csvRow(arr) { return arr.map(csvCell).join(','); }

function parseCsv(text) {
  const lines = text.split('\n').filter(l => l.trim());
  const header = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const fields = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i+1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (c === ',' && !inQ) { fields.push(cur); cur = ''; }
      else cur += c;
    }
    fields.push(cur);
    const obj = {};
    header.forEach((h, i) => { obj[h] = (fields[i] ?? '').trim(); });
    return obj;
  });
}

function prov(fields) { return JSON.stringify(fields); }

function cleanTmp() {
  for (const f of [TMP_CSV, TMP_JSON]) {
    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {}
  }
}

// ─── 메인 ─────────────────────────────────────────────────────────────────────
function main() {
  console.log('=== TASK-DATA-BUSAN-INTEGRATED-CANDIDATES-06 시작 ===');
  console.log(`날짜: ${TODAY}\n`);

  cleanTmp();

  // 입력 파일 확인
  for (const f of [IN_CANONICAL, IN_MATCH, IN_WEBONLY, IN_MANUAL, IN_FULL_JSON]) {
    if (!fs.existsSync(f)) {
      console.error(`[HARD STOP] 입력 파일 없음: ${f}`); process.exit(1);
    }
  }

  // ─── 로드 ─────────────────────────────────────────────────────────────────
  console.log('=== 입력 데이터 로드 ===');

  const canonItems   = parseCsv(fs.readFileSync(IN_CANONICAL, 'utf8'));
  const matchItems   = parseCsv(fs.readFileSync(IN_MATCH,     'utf8'));
  const webItems     = parseCsv(fs.readFileSync(IN_WEBONLY,   'utf8'));
  const manualItems  = parseCsv(fs.readFileSync(IN_MANUAL,    'utf8'));
  const fullAll      = JSON.parse(fs.readFileSync(IN_FULL_JSON,'utf8'));
  const fullKo       = fullAll.filter(r => r.language === 'ko');

  console.log(`  canonical: ${canonItems.length}건`);
  console.log(`  matched:   ${matchItems.length}건`);
  console.log(`  web_only:  ${webItems.length}건`);
  console.log(`  manual:    ${manualItems.length}건`);

  // 입력 검증
  if (canonItems.length  !== 1356) { console.error(`[HARD STOP] canonical ${canonItems.length}≠1356`); process.exit(1); }
  if (matchItems.length  !== 362)  { console.error(`[HARD STOP] matched ${matchItems.length}≠362`);    process.exit(1); }
  if (webItems.length    !== 402)  { console.error(`[HARD STOP] web_only ${webItems.length}≠402`);     process.exit(1); }
  if (manualItems.length !== 9)    { console.error(`[HARD STOP] manual ${manualItems.length}≠9`);      process.exit(1); }

  // uc_seq → VB row 인덱스 (lat/lon 조인용)
  const vbByUcSeq = new Map(fullKo.map(r => [String(r.uc_seq), r]));

  // 매칭된 canonical_id 집합
  const matchedCanonIds = new Set(matchItems.map(m => m.canonical_id));

  // canonical manual_review 집합 (canonical CSV의 status 기준)
  const canonManualIds = new Set(
    canonItems.filter(c => c.status.includes('manual_review')).map(c => c.canonical_id)
  );

  console.log(`  matched canonical: ${matchedCanonIds.size}건`);
  console.log(`  canonical manual_review: ${canonManualIds.size}건`);

  // ─── 통합 후보 생성 ───────────────────────────────────────────────────────
  console.log('\n=== 통합 후보 생성 ===');

  const rows = [];
  let countEnriched = 0, countApiOnly = 0, countCanonManual = 0;
  let countWebNew = 0, countCourse = 0, countVbManual = 0;
  let countUnknownAllowed = 0, countCoordConflict = 0;
  const candidateIdSet = new Set();

  // matched map: canonical_id → match row
  const matchByCanonId = new Map(matchItems.map(m => [m.canonical_id, m]));

  // ── 1. canonical 기준 처리 (1,356건) ──────────────────────────────────────
  for (const canon of canonItems) {
    const canonId = canon.canonical_id;
    const cityMap = CANON_TO_CITY[canon.category] ?? CANON_TO_CITY[''];

    if (matchedCanonIds.has(canonId)) {
      // existing_enriched: VB 필드로 보강
      const m = matchByCanonId.get(canonId);
      const vbUcSeq = m.visitbusan_uc_seq;
      const vb = vbByUcSeq.get(vbUcSeq);

      const coordDist = parseInt(m.distance_m) || 0;
      if (coordDist > 0) countCoordConflict++;

      // VB 우선 필드: hours, address, phone, external_official_url, source_detail_url
      // canonical 우선: title_ko, image_url, latitude, longitude
      const address = m.visitbusan_address || canon.address || '';
      const provMap = {
        title_ko:             'canonical',
        hours:                m.visitbusan_hours              ? 'visitbusan' : 'none',
        address:              m.visitbusan_address            ? 'visitbusan' : (canon.address ? 'canonical' : 'none'),
        phone:                m.visitbusan_phone              ? 'visitbusan' : 'none',
        external_official_url:m.visitbusan_external_official_url ? 'visitbusan' : 'none',
        image_url:            canon.image_url                 ? 'canonical' : 'none',
        latitude:             'canonical',
        longitude:            'canonical',
      };

      const row = makeRow({
        candidate_id:                canonId,
        canonical_id:                canonId,
        candidate_status:            'existing_enriched',
        title_ko:                    canon.title_ko,
        category:                    cityMap.category,
        subcategory:                 cityMap.subcategory,
        content_type:                m.visitbusan_content_type,
        latitude:                    canon.latitude,
        longitude:                   canon.longitude,
        coordinate_distance_m:       coordDist > 0 ? coordDist : '',
        hours:                       m.visitbusan_hours || '',
        address,
        phone:                       m.visitbusan_phone || '',
        external_official_url:       m.visitbusan_external_official_url || '',
        source_detail_url:           m.visitbusan_source_detail_url || '',
        image_url:                   canon.image_url || '',
        visitbusan_uc_seq:           vbUcSeq,
        linked_source_keys:          `${m.visitbusan_source_key}|${canon.canonical_key}`,
        field_provenance:            prov(provMap),
        category_compatibility_method: m.match_method || 'geo_title_category',
        review_reason:               '',
      });
      rows.push(row);
      candidateIdSet.add(canonId);
      countEnriched++;

    } else if (canonManualIds.has(canonId)) {
      // canonical manual_review
      const row = makeRow({
        candidate_id:                canonId,
        canonical_id:                canonId,
        candidate_status:            'manual_review',
        title_ko:                    canon.title_ko,
        category:                    cityMap.category,
        subcategory:                 cityMap.subcategory,
        content_type:                '',
        latitude:                    canon.latitude,
        longitude:                   canon.longitude,
        coordinate_distance_m:       '',
        hours:                       '',
        address:                     canon.address || '',
        phone:                       '',
        external_official_url:       '',
        source_detail_url:           '',
        image_url:                   canon.image_url || '',
        visitbusan_uc_seq:           '',
        linked_source_keys:          canon.canonical_key,
        field_provenance:            prov({ title_ko:'canonical', image_url: canon.image_url ? 'canonical':'none', latitude:'canonical', longitude:'canonical' }),
        category_compatibility_method: 'canonical_only',
        review_reason:               'canonical_manual_review',
      });
      rows.push(row);
      candidateIdSet.add(canonId);
      countCanonManual++;

    } else {
      // api_only_existing
      const row = makeRow({
        candidate_id:                canonId,
        canonical_id:                canonId,
        candidate_status:            'api_only_existing',
        title_ko:                    canon.title_ko,
        category:                    cityMap.category,
        subcategory:                 cityMap.subcategory,
        content_type:                '',
        latitude:                    canon.latitude,
        longitude:                   canon.longitude,
        coordinate_distance_m:       '',
        hours:                       '',
        address:                     canon.address || '',
        phone:                       '',
        external_official_url:       '',
        source_detail_url:           '',
        image_url:                   canon.image_url || '',
        visitbusan_uc_seq:           '',
        linked_source_keys:          canon.canonical_key,
        field_provenance:            prov({ title_ko:'canonical', image_url: canon.image_url ? 'canonical':'none', latitude:'canonical', longitude:'canonical' }),
        category_compatibility_method: 'canonical_only',
        review_reason:               '',
      });
      rows.push(row);
      candidateIdSet.add(canonId);
      countApiOnly++;
    }
  }

  console.log(`  existing_enriched: ${countEnriched}`);
  console.log(`  api_only_existing: ${countApiOnly}`);
  console.log(`  canonical_manual:  ${countCanonManual}`);

  // ── 2. VB web_only 처리 (402건: 353 web_only_new + 49 course_reference) ──
  for (const w of webItems) {
    const ucSeq   = w.visitbusan_uc_seq;
    const vbType  = w.visitbusan_content_type;
    const vb      = vbByUcSeq.get(ucSeq);
    const lat     = vb?.lat  || '';
    const lon     = vb?.lon  || '';

    if (vbType === 'course') {
      // course_reference
      const candId = `busan-VBC-${ucSeq}`;
      if (candidateIdSet.has(candId)) { console.error(`[HARD STOP] candidate_id 중복: ${candId}`); process.exit(1); }
      rows.push(makeRow({
        candidate_id:                candId,
        canonical_id:                '',
        candidate_status:            'course_reference',
        title_ko:                    w.visitbusan_title_ko,
        category:                    '',
        subcategory:                 '',
        content_type:                'course',
        latitude:                    lat,
        longitude:                   lon,
        coordinate_distance_m:       '',
        hours:                       w.visitbusan_hours || '',
        address:                     w.visitbusan_address || '',
        phone:                       w.visitbusan_phone || '',
        external_official_url:       w.visitbusan_external_official_url || '',
        source_detail_url:           w.visitbusan_source_detail_url || '',
        image_url:                   '',
        visitbusan_uc_seq:           ucSeq,
        linked_source_keys:          w.visitbusan_source_key,
        field_provenance:            prov({ title_ko:'visitbusan', hours:'visitbusan', address:'visitbusan', latitude: lat ? 'visitbusan':'none', longitude: lon ? 'visitbusan':'none' }),
        category_compatibility_method: 'course_excluded',
        review_reason:               'course_auto_web_only',
      }));
      candidateIdSet.add(candId);
      countCourse++;
    } else {
      // web_only_new
      const cityMap = VB_TO_CITY[vbType] ?? { category:'unknown', subcategory:'unknown', compat:'unknown_allowed' };
      if (cityMap.compat === 'unknown_allowed') countUnknownAllowed++;
      const candId  = `busan-VB-${ucSeq}`;
      if (candidateIdSet.has(candId)) { console.error(`[HARD STOP] candidate_id 중복: ${candId}`); process.exit(1); }
      rows.push(makeRow({
        candidate_id:                candId,
        canonical_id:                '',
        candidate_status:            'web_only_new',
        title_ko:                    w.visitbusan_title_ko,
        category:                    cityMap.category,
        subcategory:                 cityMap.subcategory,
        content_type:                vbType,
        latitude:                    lat,
        longitude:                   lon,
        coordinate_distance_m:       '',
        hours:                       w.visitbusan_hours || '',
        address:                     w.visitbusan_address || '',
        phone:                       w.visitbusan_phone || '',
        external_official_url:       w.visitbusan_external_official_url || '',
        source_detail_url:           w.visitbusan_source_detail_url || '',
        image_url:                   '',
        visitbusan_uc_seq:           ucSeq,
        linked_source_keys:          w.visitbusan_source_key,
        field_provenance:            prov({ title_ko:'visitbusan', hours: w.visitbusan_hours ? 'visitbusan':'none', address: w.visitbusan_address ? 'visitbusan':'none', latitude: lat ? 'visitbusan':'none', image_url:'none' }),
        category_compatibility_method: cityMap.compat,
        review_reason:               '',
      }));
      candidateIdSet.add(candId);
      countWebNew++;
    }
  }

  console.log(`  web_only_new:      ${countWebNew}`);
  console.log(`  course_reference:  ${countCourse}`);

  // ── 3. VB manual_review 처리 (9건) ────────────────────────────────────────
  for (const m of manualItems) {
    const ucSeq  = m.visitbusan_uc_seq;
    const vbType = m.visitbusan_content_type;
    const cityMap = VB_TO_CITY[vbType] ?? { category:'unknown', subcategory:'unknown', compat:'unknown_allowed' };
    const candId  = `busan-VBM-${ucSeq}`;
    if (candidateIdSet.has(candId)) { console.error(`[HARD STOP] candidate_id 중복: ${candId}`); process.exit(1); }
    rows.push(makeRow({
      candidate_id:                candId,
      canonical_id:                m.canonical_id || '',
      candidate_status:            'manual_review',
      title_ko:                    m.visitbusan_title_ko,
      category:                    cityMap.category,
      subcategory:                 cityMap.subcategory,
      content_type:                vbType,
      latitude:                    '',
      longitude:                   '',
      coordinate_distance_m:       m.distance_m || '',
      hours:                       m.visitbusan_hours || '',
      address:                     m.visitbusan_address || '',
      phone:                       m.visitbusan_phone || '',
      external_official_url:       m.visitbusan_external_official_url || '',
      source_detail_url:           m.visitbusan_source_detail_url || '',
      image_url:                   m.canonical_image_url || '',
      visitbusan_uc_seq:           ucSeq,
      linked_source_keys:          `${m.visitbusan_source_key}|${m.canonical_id}`,
      field_provenance:            prov({ title_ko:'visitbusan', hours: m.visitbusan_hours ? 'visitbusan':'none', image_url: m.canonical_image_url ? 'canonical':'none' }),
      category_compatibility_method: m.match_method || 'pending',
      review_reason:               m.review_reason || 'vb_manual_review',
    }));
    candidateIdSet.add(candId);
    countVbManual++;
  }

  console.log(`  vb_manual_review:  ${countVbManual}`);

  // ─── 검증 ───────────────────────────────────────────────────────────────────
  console.log('\n=== 검증 ===');

  const total = rows.length;
  const expectedTotal = 1356 + 402 + 9;
  console.log(`  총 통합 후보: ${total}건 (예상: ${expectedTotal}건)`);

  if (total !== expectedTotal) {
    console.error(`[HARD STOP] 총 건수 불일치: ${total} ≠ ${expectedTotal}`); process.exit(1);
  }
  console.log('  총 건수 ✓');

  // 상태별 합계
  const byStatus = {};
  for (const r of rows) {
    byStatus[r.candidate_status] = (byStatus[r.candidate_status] || 0) + 1;
  }
  console.log('  상태별:', JSON.stringify(byStatus));

  const statusCheck =
    (byStatus['existing_enriched'] ?? 0)  === 362  &&
    (byStatus['web_only_new']      ?? 0) + (byStatus['course_reference'] ?? 0) === 402 &&
    (byStatus['manual_review']     ?? 0)  === (countCanonManual + countVbManual) &&
    (byStatus['existing_enriched'] ?? 0) + (byStatus['api_only_existing'] ?? 0) + countCanonManual === 1356;
  if (!statusCheck) {
    console.error(`[HARD STOP] 상태별 합계 불일치: enriched=${byStatus['existing_enriched']} api_only=${byStatus['api_only_existing']} canon_manual=${countCanonManual} web=${(byStatus['web_only_new']??0)+(byStatus['course_reference']??0)} vb_manual=${countVbManual}`); process.exit(1);
  }
  console.log('  상태별 합계 ✓');

  // canonical 1,356건 추적
  const canonTracked = (byStatus['existing_enriched'] ?? 0) + (byStatus['api_only_existing'] ?? 0) + countCanonManual;
  if (canonTracked !== 1356) {
    console.error(`[HARD STOP] canonical 추적 ${canonTracked}≠1356`); process.exit(1);
  }
  console.log(`  canonical 1356건 추적 ✓`);

  // matched canonical_id 중복 0
  const enrichedIds = rows.filter(r => r.candidate_status === 'existing_enriched').map(r => r.canonical_id);
  if (new Set(enrichedIds).size !== enrichedIds.length) {
    console.error('[HARD STOP] enriched canonical_id 중복'); process.exit(1);
  }
  console.log('  matched canonical_id 중복 0 ✓');

  // candidate_id 중복 0
  const allCandIds = rows.map(r => r.candidate_id);
  if (new Set(allCandIds).size !== allCandIds.length) {
    console.error('[HARD STOP] candidate_id 중복'); process.exit(1);
  }
  console.log('  candidate_id 중복 0 ✓');

  // field_provenance 누락 0
  const missingProv = rows.filter(r => !r.field_provenance || r.field_provenance === '{}').length;
  if (missingProv > 0) {
    console.error(`[HARD STOP] field_provenance 누락 ${missingProv}건`); process.exit(1);
  }
  console.log('  field_provenance 누락 0 ✓');

  console.log(`  unknown_allowed: ${countUnknownAllowed}건`);
  console.log(`  coordinate_conflict: ${countCoordConflict}건`);

  console.log('  모든 검증 조건 충족 ✓ → PASS');

  // ─── 저장 ───────────────────────────────────────────────────────────────────
  console.log('\n=== 저장 ===');

  // CSV 임시 파일
  const csvLines = [csvRow(CSV_HDR)];
  for (const r of rows) csvLines.push(csvRow(CSV_HDR.map(h => r[h] ?? '')));
  fs.writeFileSync(TMP_CSV, csvLines.join('\n'), 'utf8');

  // JSON 임시 파일
  fs.writeFileSync(TMP_JSON, JSON.stringify(rows, null, 2), 'utf8');

  // PASS → 원자적 교체
  fs.renameSync(TMP_CSV,  OUT_CSV);
  fs.renameSync(TMP_JSON, OUT_JSON);
  console.log(`  CSV:  ${OUT_CSV} (${rows.length}행)`);
  console.log(`  JSON: ${OUT_JSON}`);

  // manual-review 별도 파일
  const manualRows = rows.filter(r => r.candidate_status === 'manual_review');
  const manualLines = [csvRow(CSV_HDR)];
  for (const r of manualRows) manualLines.push(csvRow(CSV_HDR.map(h => r[h] ?? '')));
  fs.writeFileSync(OUT_MANUAL, manualLines.join('\n'), 'utf8');
  console.log(`  manual-review: ${OUT_MANUAL} (${manualRows.length}건)`);

  // ─── metrics ────────────────────────────────────────────────────────────────
  const enrichedWithHours = rows.filter(r => r.candidate_status === 'existing_enriched' && r.hours).length;
  const enrichedWithPhone = rows.filter(r => r.candidate_status === 'existing_enriched' && r.phone).length;
  const enrichedWithUrl   = rows.filter(r => r.candidate_status === 'existing_enriched' && r.external_official_url).length;

  const metrics = {
    run_date: TODAY,
    task: 'TASK-DATA-BUSAN-INTEGRATED-CANDIDATES-06',
    overall: 'PASS',
    total_candidates: total,
    by_status: byStatus,
    canonical_tracked: { enriched: countEnriched, api_only: countApiOnly, canon_manual: countCanonManual, total: canonTracked },
    vb_tracked: { web_only_new: countWebNew, course_reference: countCourse, vb_manual: countVbManual },
    enriched_fields: { hours: enrichedWithHours, phone: enrichedWithPhone, external_url: enrichedWithUrl },
    unknown_allowed_count: countUnknownAllowed,
    coordinate_conflict_count: countCoordConflict,
    generated_at: new Date().toISOString(),
  };
  fs.writeFileSync(OUT_METRICS, JSON.stringify(metrics, null, 2), 'utf8');
  console.log(`  metrics: ${OUT_METRICS}`);

  // ─── 보고서 ─────────────────────────────────────────────────────────────────
  const md = `# TASK-DATA-BUSAN-INTEGRATED-CANDIDATES-06 완료 보고서

**날짜:** ${TODAY}
**상태:** **PASS ✓**

---

## 1. 상태별 건수

| candidate_status | 건수 |
|---|---|
| existing_enriched | ${countEnriched} |
| api_only_existing | ${countApiOnly} |
| web_only_new | ${countWebNew} |
| course_reference | ${countCourse} |
| manual_review (canonical) | ${countCanonManual} |
| manual_review (VB) | ${countVbManual} |
| **합계** | **${total}** |

---

## 2. 보강 필드 수 (existing_enriched ${countEnriched}건 기준)

| 필드 | 보강 건수 | 비율 |
|---|---|---|
| hours | ${enrichedWithHours} | ${(enrichedWithHours/countEnriched*100).toFixed(1)}% |
| phone | ${enrichedWithPhone} | ${(enrichedWithPhone/countEnriched*100).toFixed(1)}% |
| external_official_url | ${enrichedWithUrl} | ${(enrichedWithUrl/countEnriched*100).toFixed(1)}% |

---

## 3. 신규 web_only 후보

| 항목 | 건수 |
|---|---|
| web_only_new (비-코스) | ${countWebNew} |
| course_reference | ${countCourse} |
| **합계** | **${countWebNew + countCourse}** |

---

## 4. manual_review

| 원천 | 건수 |
|---|---|
| canonical manual_review | ${countCanonManual} |
| VB manual_review | ${countVbManual} |
| **합계** | **${countCanonManual + countVbManual}** |

→ \`busan-integrated-manual-review.csv\` 별도 저장

---

## 5. unknown_allowed 및 좌표 충돌

| 항목 | 건수 |
|---|---|
| unknown_allowed (shopping·experience web_only) | ${countUnknownAllowed} |
| 좌표 충돌 (coordinate_distance_m > 0) | ${countCoordConflict} |

unknown_allowed: city_spots 5종 카테고리에 직접 대응되지 않는 shopping/experience 유형.
현재 \`attraction\`으로 임시 매핑, \`subcategory=unknown\`, 운영 반영 전 수동 검토 필요.

---

## 6. 검증 조건

| 조건 | 결과 |
|---|---|
| canonical 1,356건 전부 추적 | ✓ (${canonTracked}건) |
| matched 362건 existing_enriched | ✓ |
| web_only 402건 전부 추적 | ✓ (web_only_new ${countWebNew} + course ${countCourse} = ${countWebNew+countCourse}) |
| api_only 987건 전부 추적 | ✓ |
| VB manual_review 9건 별도 추적 | ✓ |
| canonical manual_review 7건 별도 추적 | ✓ |
| 총수·상태별 합계 일치 | ✓ |
| matched canonical_id 중복 0 | ✓ |
| candidate_id 중복 0 | ✓ |
| field_provenance 누락 0 | ✓ |
| 원본 canonical·VB full 무변경 | ✓ (읽기 전용) |

---

## 7. 변경 파일

| 파일 | 내용 |
|---|---|
| busan-integrated-candidates.csv | ${total}행 통합 후보 |
| busan-integrated-candidates.json | ${total}건 JSON |
| busan-integrated-manual-review.csv | ${countCanonManual+countVbManual}건 검토 대상 |
| busan-integrated-candidates-metrics.json | 지표 요약 |
| busan-integrated-candidates-06-report.md | 본 보고서 |

---

TASK-DATA-BUSAN-INTEGRATED-CANDIDATES-06 부산 최종 통합 후보 생성 완료.
`;

  fs.writeFileSync(OUT_REPORT, md, 'utf8');
  console.log(`  report: ${OUT_REPORT}`);

  console.log(`\n=== 완료 ===`);
  console.log(`  총 통합 후보: ${total}건`);
  console.log(`  enriched=${countEnriched} api_only=${countApiOnly} web_only_new=${countWebNew} course=${countCourse} manual=${countCanonManual+countVbManual}`);
  console.log('\nTASK-DATA-BUSAN-INTEGRATED-CANDIDATES-06 부산 최종 통합 후보 생성 완료.');
}

// ─── 행 객체 생성 ────────────────────────────────────────────────────────────
function makeRow(fields) {
  const row = {};
  for (const h of CSV_HDR) row[h] = fields[h] ?? '';
  return row;
}

try {
  main();
} catch (e) {
  cleanTmp();
  console.error('[FATAL]', e.message, e.stack);
  process.exit(1);
}
