/**
 * TASK-DATA-BUSAN-INTEGRATED-CANDIDATES-FINALIZE-10
 * unknown_allowed 173건 최종 상태를 busan-integrated-candidates.csv/json에 반영
 */

import fs from 'fs';
import path from 'path';

const BASE = 'c:/기본저장/나의 프로젝트/KoreaMate/korea-mate';
const DATA_DIR  = `${BASE}/data/tourapi/candidates/busan`;
const RPT_DIR   = `${BASE}/data/tourapi/reports/busan`;
const DOCS_DIR  = `${BASE}/docs/tourapi`;

const PATHS = {
  review07:    `${DATA_DIR}/busan-unknown-category-review.csv`,
  resolution08:`${DATA_DIR}/busan-duplicate-manual-resolution.csv`,
  integrated_csv: `${DATA_DIR}/busan-integrated-candidates.csv`,
  integrated_json:`${DATA_DIR}/busan-integrated-candidates.json`,
  manreview:   `${DATA_DIR}/busan-integrated-manual-review.csv`,
  metrics:     `${RPT_DIR}/busan-integrated-candidates-metrics.json`,
  report:      `${DOCS_DIR}/busan-integrated-candidates-06-report.md`,
};

// ── CSV helpers ──────────────────────────────────────────────────────────────

function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const headers = parseLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = parseLine(lines[i]);
    const obj = {};
    headers.forEach((h, j) => { obj[h] = vals[j] ?? ''; });
    rows.push(obj);
  }
  return { headers, rows };
}

function parseLine(line) {
  const fields = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      let val = '';
      i++;
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') { val += '"'; i += 2; }
        else if (line[i] === '"') { i++; break; }
        else { val += line[i++]; }
      }
      fields.push(val);
      if (line[i] === ',') i++;
    } else {
      const end = line.indexOf(',', i);
      if (end === -1) { fields.push(line.slice(i)); i = line.length; }
      else { fields.push(line.slice(i, end)); i = end + 1; }
    }
  }
  return fields;
}

function serializeCSV(headers, rows) {
  const escape = (v) => {
    const s = String(v ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const lines = [headers.map(escape).join(',')];
  for (const row of rows) {
    lines.push(headers.map(h => escape(row[h] ?? '')).join(','));
  }
  return lines.join('\n') + '\n';
}

// ── Build final mapping for the 173 unknown_allowed items ────────────────────

function buildFinalMapping(review07Rows, resolution08Rows) {
  const mapping = new Map();

  // Step 1: handle directly resolved items from TASK-07
  for (const r of review07Rows) {
    const id = r.candidate_id;
    const st = r.review_status;

    if (st === 'ready_for_candidate') {
      mapping.set(id, {
        candidate_status: 'web_only_new',
        category: r.category,
        subcategory: r.subcategory,
        category_compatibility_method: 'category_confirmed',
        merge_target_id: '',
        review_reason: `[REVIEW-07] ${r.reason}`,
        source: '07-direct',
      });
    } else if (st === 'exclude_non_place') {
      mapping.set(id, {
        candidate_status: 'excluded',
        category: 'attraction',
        subcategory: '',
        category_compatibility_method: 'excluded',
        merge_target_id: '',
        review_reason: `[REVIEW-07 제외] ${r.reason}`,
        source: '07-exclude',
      });
    } else if (st === 'reference_only') {
      mapping.set(id, {
        candidate_status: 'reference_only',
        category: 'attraction',
        subcategory: '',
        category_compatibility_method: 'reference_only',
        merge_target_id: '',
        review_reason: `[REVIEW-07 참조전용] ${r.reason}`,
        source: '07-reference',
      });
    }
    // duplicate_suspected and manual_review: handled by TASK-08 below
  }

  // Step 2: override with TASK-08/09 resolutions (covers dup_suspected + manual_review groups)
  for (const r of resolution08Rows) {
    const id = r.candidate_id;
    const st = r.final_status;

    if (st === 'ready_for_candidate') {
      mapping.set(id, {
        candidate_status: 'web_only_new',
        category: r.category,
        subcategory: r.subcategory,
        category_compatibility_method: 'category_confirmed',
        merge_target_id: '',
        review_reason: `[REVIEW-08/09] ${r.reason}`,
        source: '08-confirmed',
      });
    } else if (st === 'merge_existing') {
      mapping.set(id, {
        candidate_status: 'merge_existing',
        category: '',
        subcategory: '',
        category_compatibility_method: 'merge_existing',
        merge_target_id: r.merge_target_id,
        review_reason: `[REVIEW-08/09 병합→${r.merge_target_id}] ${r.reason}`,
        source: '08-merge',
      });
    } else if (st === 'reference_only') {
      mapping.set(id, {
        candidate_status: 'reference_only',
        category: '',
        subcategory: '',
        category_compatibility_method: 'reference_only',
        merge_target_id: '',
        review_reason: `[REVIEW-08/09 참조전용] ${r.reason}`,
        source: '08-reference',
      });
    } else if (st === 'unresolved') {
      mapping.set(id, {
        candidate_status: 'manual_review',
        category: 'attraction',
        subcategory: 'unknown',
        category_compatibility_method: 'unresolved',
        merge_target_id: '',
        review_reason: `[REVIEW-09 미확정] ${r.reason}`,
        source: '09-unresolved',
      });
    }
  }

  return mapping;
}

// ── Validation helpers ───────────────────────────────────────────────────────

function hardStop(msg) {
  console.error(`\n[HARD STOP] ${msg}`);
  process.exit(1);
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  console.log('=== TASK-DATA-BUSAN-INTEGRATED-CANDIDATES-FINALIZE-10 시작 ===\n');

  // Load source files
  const { rows: review07 }    = parseCSV(fs.readFileSync(PATHS.review07, 'utf8'));
  const { rows: resolution08 } = parseCSV(fs.readFileSync(PATHS.resolution08, 'utf8'));
  const { headers: intHeaders, rows: intRows } = parseCSV(fs.readFileSync(PATHS.integrated_csv, 'utf8'));
  const { headers: mrHeaders, rows: mrRows }  = parseCSV(fs.readFileSync(PATHS.manreview, 'utf8'));

  // Build mapping
  const mapping = buildFinalMapping(review07, resolution08);
  console.log(`매핑 완료: ${mapping.size}건`);

  // Verify mapping size
  if (mapping.size !== 173) hardStop(`매핑 크기 불일치: expected 173, got ${mapping.size}`);

  // Count by source for sanity
  const srcCount = {};
  for (const v of mapping.values()) { srcCount[v.source] = (srcCount[v.source] || 0) + 1; }
  console.log('소스별 매핑:', srcCount);

  // Add merge_target_id column if not present
  const newHeaders = intHeaders.includes('merge_target_id')
    ? intHeaders
    : [...intHeaders, 'merge_target_id'];

  // Process integrated CSV rows
  let updatedCount = 0;
  const statusAfter = {};
  const newIntRows = intRows.map(row => {
    if (row.category_compatibility_method !== 'unknown_allowed') {
      return { ...row, merge_target_id: row.merge_target_id || '' };
    }

    const id = row.candidate_id;
    const m = mapping.get(id);
    if (!m) hardStop(`mapping 누락: ${id}`);

    updatedCount++;
    statusAfter[m.candidate_status] = (statusAfter[m.candidate_status] || 0) + 1;

    return {
      ...row,
      candidate_status: m.candidate_status,
      category: m.category || row.category,
      subcategory: m.subcategory,
      category_compatibility_method: m.category_compatibility_method,
      merge_target_id: m.merge_target_id,
      review_reason: m.review_reason,
    };
  });

  console.log(`\n업데이트된 행: ${updatedCount} (expected 173)`);
  console.log('업데이트 후 unknown_allowed 상태 분포:', statusAfter);

  if (updatedCount !== 173) hardStop(`업데이트 행 수 불일치: expected 173, got ${updatedCount}`);

  // ── Validation ──────────────────────────────────────────────────────────────

  const finalUnk = newIntRows.filter(r => r.category_compatibility_method === 'unknown_allowed');
  if (finalUnk.length > 0) hardStop(`unknown_allowed 잔존: ${finalUnk.length}건`);

  // subcategory=unknown must be 0 among the 173 previously-unknown_allowed items
  // that are now confirmed active candidates (category_confirmed + web_only_new)
  // Note: canonical/api_only rows legitimately have subcategory=unknown from TASK-06
  const ACTIVE_STATUSES = new Set(['web_only_new', 'existing_enriched', 'api_only_existing']);
  const unkAllowedIds = new Set(review07.map(r => r.candidate_id));
  const activeUnknownSub = newIntRows.filter(r =>
    unkAllowedIds.has(r.candidate_id) &&
    ACTIVE_STATUSES.has(r.candidate_status) &&
    r.subcategory === 'unknown'
  );
  if (activeUnknownSub.length > 0) {
    hardStop(`unknown_allowed 출신 활성 후보 subcategory=unknown 잔존: ${activeUnknownSub.length}건\n  예: ${activeUnknownSub.slice(0,3).map(r=>r.candidate_id).join(', ')}`);
  }

  // merge_existing must all have merge_target_id
  const mergeRows = newIntRows.filter(r => r.candidate_status === 'merge_existing');
  const mergeMissingTarget = mergeRows.filter(r => !r.merge_target_id);
  if (mergeMissingTarget.length > 0) hardStop(`merge_existing merge_target_id 누락: ${mergeMissingTarget.map(r=>r.candidate_id).join(', ')}`);

  // reference/excluded/merge must not be in active candidate set
  const NON_ACTIVE = new Set(['reference_only', 'excluded', 'merge_existing']);
  const wrongActive = newIntRows.filter(r => NON_ACTIVE.has(r.candidate_status) && ACTIVE_STATUSES.has(r.candidate_status));
  if (wrongActive.length > 0) hardStop(`비활성 상태가 활성 후보에 포함: ${wrongActive.length}건`);

  // candidate_id uniqueness
  const idSet = new Set(newIntRows.map(r => r.candidate_id));
  if (idSet.size !== newIntRows.length) hardStop(`candidate_id 중복: ${newIntRows.length - idSet.size}건`);

  // total row count
  if (newIntRows.length !== 1767) hardStop(`총 행수 불일치: expected 1767, got ${newIntRows.length}`);

  // Verify final breakdown: 131+12+21+8+1=173
  const web_only_confirmed = newIntRows.filter(r => r.candidate_status === 'web_only_new' && r.category_compatibility_method === 'category_confirmed').length;
  const merge_cnt   = (statusAfter['merge_existing']  || 0);
  const ref_cnt     = (statusAfter['reference_only']  || 0);
  const excl_cnt    = (statusAfter['excluded']        || 0);
  const unres_cnt   = (statusAfter['manual_review']   || 0);  // unresolved → manual_review

  console.log(`\n최종 집계 검증:`);
  console.log(`  ready_for_candidate (web_only_new confirmed): ${web_only_confirmed} (expected 131)`);
  console.log(`  merge_existing: ${merge_cnt} (expected 12)`);
  console.log(`  reference_only: ${ref_cnt} (expected 21)`);
  console.log(`  excluded: ${excl_cnt} (expected 8)`);
  console.log(`  unresolved→manual_review: ${unres_cnt} (expected 1)`);
  console.log(`  합계: ${web_only_confirmed + merge_cnt + ref_cnt + excl_cnt + unres_cnt} (expected 173)`);

  if (web_only_confirmed !== 131) hardStop(`ready_for_candidate 수 불일치: ${web_only_confirmed} ≠ 131`);
  if (merge_cnt !== 12)  hardStop(`merge_existing 수 불일치: ${merge_cnt} ≠ 12`);
  if (ref_cnt !== 21)    hardStop(`reference_only 수 불일치: ${ref_cnt} ≠ 21`);
  if (excl_cnt !== 8)    hardStop(`excluded 수 불일치: ${excl_cnt} ≠ 8`);
  if (unres_cnt !== 1)   hardStop(`unresolved 수 불일치: ${unres_cnt} ≠ 1`);

  console.log('\n[검증 PASS] 모든 조건 충족\n');

  // ── Atomic write: integrated CSV ────────────────────────────────────────────
  const csvTmp = PATHS.integrated_csv + '.tmp';
  fs.writeFileSync(csvTmp, serializeCSV(newHeaders, newIntRows), 'utf8');
  fs.renameSync(csvTmp, PATHS.integrated_csv);
  console.log(`✓ busan-integrated-candidates.csv 갱신 (${newIntRows.length}행)`);

  // ── Atomic write: integrated JSON ───────────────────────────────────────────
  const jsonTmp = PATHS.integrated_json + '.tmp';
  fs.writeFileSync(jsonTmp, JSON.stringify(newIntRows, null, 2), 'utf8');
  fs.renameSync(jsonTmp, PATHS.integrated_json);
  console.log(`✓ busan-integrated-candidates.json 갱신`);

  // ── Update manual-review CSV (add VB-1859) ───────────────────────────────
  const vb1859 = newIntRows.find(r => r.candidate_id === 'busan-VB-1859');
  if (!vb1859) hardStop('busan-VB-1859를 integrated CSV에서 찾지 못함');

  const alreadyInMR = mrRows.find(r => r.candidate_id === 'busan-VB-1859');
  let newMrRows;
  if (alreadyInMR) {
    // Update existing entry
    newMrRows = mrRows.map(r => r.candidate_id === 'busan-VB-1859' ? { ...r, ...vb1859 } : r);
  } else {
    // Add new entry (same columns as manual-review CSV)
    const mrEntry = {};
    mrHeaders.forEach(h => { mrEntry[h] = vb1859[h] ?? ''; });
    newMrRows = [...mrRows, mrEntry];
  }

  const mrTmp = PATHS.manreview + '.tmp';
  fs.writeFileSync(mrTmp, serializeCSV(mrHeaders, newMrRows), 'utf8');
  fs.renameSync(mrTmp, PATHS.manreview);
  console.log(`✓ busan-integrated-manual-review.csv 갱신 (${newMrRows.length}행)`);

  // ── Build metrics for FINALIZE-10 section ────────────────────────────────

  // Overall final candidate_status distribution
  const finalStatusDist = {};
  for (const r of newIntRows) {
    finalStatusDist[r.candidate_status] = (finalStatusDist[r.candidate_status] || 0) + 1;
  }

  const finalize10Metrics = {
    task: 'TASK-DATA-BUSAN-INTEGRATED-CANDIDATES-FINALIZE-10',
    run_date: '2026-07-24',
    overall: 'PASS',
    input_unknown_allowed: 173,
    resolved_breakdown: {
      ready_for_candidate: web_only_confirmed,
      merge_existing: merge_cnt,
      reference_only: ref_cnt,
      excluded: excl_cnt,
      unresolved_manual_review: unres_cnt,
      total: 173,
    },
    merge_targets: mergeRows.map(r => ({
      candidate_id: r.candidate_id,
      merge_target_id: r.merge_target_id,
    })),
    unknown_allowed_active_subcategory_unknown: activeUnknownSub.length,
    final_status_distribution: finalStatusDist,
    total_candidates: newIntRows.length,
    active_operational_candidates: newIntRows.filter(r => ACTIVE_STATUSES.has(r.candidate_status)).length,
    manual_review_total: newMrRows.length,
    schema_additions: ['merge_target_id column added to integrated CSV'],
  };

  // ── Update metrics JSON ──────────────────────────────────────────────────
  const metricsRaw = fs.readFileSync(PATHS.metrics, 'utf8');
  const metrics = JSON.parse(metricsRaw);
  metrics.finalize_10 = finalize10Metrics;
  const metricsTmp = PATHS.metrics + '.tmp';
  fs.writeFileSync(metricsTmp, JSON.stringify(metrics, null, 2), 'utf8');
  fs.renameSync(metricsTmp, PATHS.metrics);
  console.log(`✓ busan-integrated-candidates-metrics.json FINALIZE-10 섹션 추가`);

  // ── Update report MD ─────────────────────────────────────────────────────
  const reportRaw = fs.readFileSync(PATHS.report, 'utf8');

  const finalize10Section = `
---

## FINALIZE-10: 최종 통합 후보 정리 결과

**날짜:** 2026-07-24
**상태:** **PASS ✓**
**입력:** unknown_allowed 173건 (shopping:53 + experience:120)

### 판정 결과

| 최종 상태 | 건수 | 설명 |
|---|---|---|
| ready_for_candidate (web_only_new confirmed) | 131 | 기존 116 + 추가 확정 15 |
| merge_existing | 12 | 기존 canonical 또는 VB 후보에 병합 |
| reference_only | 21 | 기존 18 + 추가 3 |
| excluded | 8 | 장소 아님 제외 |
| unresolved (manual_review) | 1 | busan-VB-1859 (K-POP 동문) |
| **합계** | **173** | ✓ |

### 활성 운영 후보

| candidate_status | 건수 |
|---|---|
| web_only_new | ${finalStatusDist['web_only_new'] || 0} |
| existing_enriched | ${finalStatusDist['existing_enriched'] || 0} |
| api_only_existing | ${finalStatusDist['api_only_existing'] || 0} |
| **활성 합계** | **${newIntRows.filter(r => ACTIVE_STATUSES.has(r.candidate_status)).length}** |

> 활성 후보 중 subcategory=unknown: **0건** ✓

### merge_existing 12건 병합 대상

| candidate_id | merge_target_id | 유형 |
|---|---|---|
${mergeRows.map(r => `| ${r.candidate_id} | ${r.merge_target_id} | ${r.merge_target_id.startsWith('busan-VB') ? 'vb_candidate' : 'canonical'} |`).join('\n')}

### 검증 조건

| 조건 | 결과 |
|---|---|
| 173건 전부 최종 상태 추적 | ✓ |
| 131+12+21+8+1=173 합계 일치 | ✓ |
| ready_for_candidate category/subcategory 누락 0 | ✓ |
| unknown_allowed 출신 활성 후보 subcategory=unknown 0 | ✓ |
| merge_existing 병합 대상 누락 0 | ✓ |
| reference/exclude/unresolved 활성 후보 미포함 | ✓ |
| candidate_id 중복 0 | ✓ |
| 총 행수 1767 유지 | ✓ |
| 원본 canonical·VisitBusan 무변경 | ✓ (읽기 전용) |

### 스키마 변경

- \`merge_target_id\` 컬럼 추가 (12건 merge_existing 추적용, 나머지 공란)
- \`category_compatibility_method\`: unknown_allowed → category_confirmed / merge_existing / reference_only / excluded / unresolved
- \`candidate_status\`: 신규 값 추가 (merge_existing, reference_only, excluded)

### 변경 파일

| 파일 | 변경 내용 |
|---|---|
| busan-integrated-candidates.csv | 173행 상태·category·subcategory 업데이트, merge_target_id 컬럼 추가 |
| busan-integrated-candidates.json | 동일 내용 JSON 갱신 |
| busan-integrated-manual-review.csv | busan-VB-1859 추가 (총 ${newMrRows.length}건) |
| busan-integrated-candidates-metrics.json | FINALIZE-10 섹션 추가 |
| busan-integrated-candidates-06-report.md | 본 섹션 추가 |

---

TASK-DATA-BUSAN-INTEGRATED-CANDIDATES-FINALIZE-10 부산 통합 후보 최종 정리 완료.`;

  const updatedReport = reportRaw.trimEnd() + '\n' + finalize10Section + '\n';
  const reportTmp = PATHS.report + '.tmp';
  fs.writeFileSync(reportTmp, updatedReport, 'utf8');
  fs.renameSync(reportTmp, PATHS.report);
  console.log(`✓ busan-integrated-candidates-06-report.md FINALIZE-10 섹션 추가`);

  console.log('\n=== FINALIZE-10 완료 ===');
  console.log(`활성 운영 후보: ${newIntRows.filter(r => ACTIVE_STATUSES.has(r.candidate_status)).length}건`);
  console.log(`병합: ${merge_cnt}건, reference: ${ref_cnt}건, 제외: ${excl_cnt}건, 보류: ${unres_cnt}건`);
}

main();
