/**
 * TASK-DATA-BUSAN-PRECOMMIT-REVIEW-12A
 *
 * 작업:
 * 1. busan-K-00081 (롯데호텔 부산): category=accommodation, subcategory=hotel, status=api_only_existing
 * 2. VBM geo_near 9건: manual_review → merge_existing (교차 검증 완료)
 *
 * 금지: commit, push, 운영 DB, SQL, migration, 배포, 원본 파일 덮어쓰기
 */

import fs from 'fs';
import path from 'path';

const ROOT = 'c:/기본저장/나의 프로젝트/KoreaMate/korea-mate';

const FILES = {
  intCandidates: path.join(ROOT, 'data/tourapi/candidates/busan/busan-integrated-candidates.csv'),
  intCandidatesJson: path.join(ROOT, 'data/tourapi/candidates/busan/busan-integrated-candidates.json'),
  manualReview: path.join(ROOT, 'data/tourapi/candidates/busan/busan-integrated-manual-review.csv'),
  metrics: path.join(ROOT, 'data/tourapi/reports/busan/busan-integrated-candidates-metrics.json'),
  finalMetrics: path.join(ROOT, 'data/tourapi/reports/busan/busan-final-metrics.json'),
};

// 롯데호텔 수정
const LOTTE_ID = 'busan-K-00081';
const LOTTE_CATEGORY = 'accommodation';
const LOTTE_SUBCATEGORY = 'hotel';
const LOTTE_NEW_STATUS = 'api_only_existing';

// VBM 9건 merge_existing 판정 (교차 검증 완료: uc_seq, 주소, 전화 일치 확인)
const VBM_MERGES = [
  { id: 'busan-VBM-1796', target: 'busan-A-00139', reason: 'uc_seq=1796 동일, 주소 일치' },
  { id: 'busan-VBM-1322', target: 'busan-A-00119', reason: 'uc_seq=1322 동일, 주소 일치' },
  { id: 'busan-VBM-367',  target: 'busan-A-00064', reason: 'uc_seq=367 동일, 주소+전화 일치' },
  { id: 'busan-VBM-346',  target: 'busan-A-00053', reason: 'uc_seq=346 동일, 주소 일치' },
  { id: 'busan-VBM-308',  target: 'busan-A-00041', reason: 'uc_seq=308 동일, 주소+전화 일치' },
  { id: 'busan-VBM-1523', target: 'busan-F-00236', reason: 'uc_seq=1523 동일, 주소+전화 일치' },
  { id: 'busan-VBM-1516', target: 'busan-F-00229', reason: 'uc_seq=1516 동일, 주소+전화 일치' },
  { id: 'busan-VBM-2131', target: 'busan-F-00088', reason: '주소+전화 완전 일치 (2nd VB article)' },
  { id: 'busan-VBM-1640', target: 'busan-A-00064', reason: '좌표 4m 이내, 주소+전화 일치' },
];

const VBM_MERGE_MAP = new Map(VBM_MERGES.map(m => [m.id, m]));
const RESOLVED_IDS = new Set([LOTTE_ID, ...VBM_MERGES.map(m => m.id)]);

// ─── CSV 파싱 (간단 구현: 따옴표 내 쉼표 처리) ────────────────────────────────

function parseCsvLine(line) {
  const cols = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQuote = !inQuote; }
    } else if (ch === ',' && !inQuote) {
      cols.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  cols.push(cur);
  return cols;
}

function escapeCsvField(val) {
  if (val == null) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function rowToCsvLine(cols) {
  return cols.map(escapeCsvField).join(',');
}

// ─── 메인 ─────────────────────────────────────────────────────────────────────

function main() {
  console.log('=== TASK-DATA-BUSAN-PRECOMMIT-REVIEW-12A 시작 ===\n');

  // ── 1. integrated candidates 로드 ──────────────────────────────────────────
  const rawCsv = fs.readFileSync(FILES.intCandidates, 'utf-8');
  const csvLines = rawCsv.split('\n');
  const header = csvLines[0];
  const headerCols = parseCsvLine(header);

  const COL = {};
  headerCols.forEach((h, i) => { COL[h] = i; });

  const dataLines = csvLines.slice(1).filter(l => l.trim() !== '');
  console.log(`integrated candidates 로드: ${dataLines.length}행`);

  // 컬럼 인덱스 확인
  const needed = ['candidate_id','candidate_status','category','subcategory','category_compatibility_method','review_reason','merge_target_id'];
  for (const c of needed) {
    if (COL[c] === undefined) throw new Error(`헤더에 컬럼 없음: ${c}`);
  }

  // ── 2. 변경 적용 ──────────────────────────────────────────────────────────
  let lotteFixed = false;
  const vbmFixed = new Set();
  const statusBefore = {};
  const statusAfter = {};

  const updatedLines = dataLines.map(line => {
    const cols = parseCsvLine(line);
    const id = cols[COL.candidate_id];
    const statusOrig = cols[COL.candidate_status];

    statusBefore[statusOrig] = (statusBefore[statusOrig] || 0) + 1;

    if (id === LOTTE_ID) {
      // 롯데호텔: category/subcategory 수정, status 변경
      const prev = { status: cols[COL.candidate_status], cat: cols[COL.category], sub: cols[COL.subcategory] };
      cols[COL.category] = LOTTE_CATEGORY;
      cols[COL.subcategory] = LOTTE_SUBCATEGORY;
      cols[COL.candidate_status] = LOTTE_NEW_STATUS;
      cols[COL.category_compatibility_method] = 'category_confirmed';
      cols[COL.review_reason] = '[PRECOMMIT-12A] 롯데호텔 부산 — accommodation/hotel 확정 (공식 호텔, 수동 확인)';
      lotteFixed = true;
      console.log(`  [K-00081] ${prev.status}→${LOTTE_NEW_STATUS} | category: ${prev.cat}→${LOTTE_CATEGORY} | subcategory: ${prev.sub}→${LOTTE_SUBCATEGORY}`);

    } else if (VBM_MERGE_MAP.has(id)) {
      // VBM geo_near: merge_existing
      const merge = VBM_MERGE_MAP.get(id);
      const prevStatus = cols[COL.candidate_status];
      cols[COL.candidate_status] = 'merge_existing';
      cols[COL.category_compatibility_method] = 'merge_existing';
      cols[COL.merge_target_id] = merge.target;
      cols[COL.review_reason] = `[PRECOMMIT-12A] ${merge.reason} → ${merge.target}에 병합`;
      vbmFixed.add(id);
      console.log(`  [${id}] ${prevStatus}→merge_existing | target: ${merge.target}`);
    }

    const statusNew = cols[COL.candidate_status];
    statusAfter[statusNew] = (statusAfter[statusNew] || 0) + 1;

    return rowToCsvLine(cols);
  });

  // ── 3. HARD STOP 검증 ─────────────────────────────────────────────────────
  console.log('\n--- 검증 ---');

  if (!lotteFixed) throw new Error('HARD STOP: K-00081 롯데호텔 행을 찾지 못했습니다.');
  if (vbmFixed.size !== 9) throw new Error(`HARD STOP: VBM 병합 ${vbmFixed.size}건 처리 (9건 필요). 미처리: ${VBM_MERGES.filter(m=>!vbmFixed.has(m.id)).map(m=>m.id).join(',')}`);

  // 총 행 수 유지
  if (updatedLines.length !== dataLines.length) throw new Error(`HARD STOP: 행 수 불일치 ${updatedLines.length} ≠ ${dataLines.length}`);

  // 상태 분포 확인
  const expectedAfter = {
    api_only_existing: 991,
    existing_enriched: 362,
    web_only_new: 311,
    course_reference: 49,
    reference_only: 21,
    merge_existing: 21,
    excluded: 8,
    manual_review: 4,
  };
  let statusOk = true;
  for (const [st, cnt] of Object.entries(expectedAfter)) {
    const actual = statusAfter[st] || 0;
    if (actual !== cnt) {
      console.error(`  ✗ ${st}: 예상 ${cnt}, 실제 ${actual}`);
      statusOk = false;
    } else {
      console.log(`  ✓ ${st}: ${actual}`);
    }
  }
  const total = Object.values(statusAfter).reduce((a, b) => a + b, 0);
  console.log(`  총 합: ${total}`);
  if (total !== 1767) throw new Error(`HARD STOP: 총 행 수 ${total} ≠ 1767`);
  if (!statusOk) throw new Error('HARD STOP: 상태 분포 불일치');

  // merge target 유효성 (모든 merge_existing의 target이 CSV에 존재)
  const allIds = new Set(dataLines.map(l => parseCsvLine(l)[COL.candidate_id]));
  for (const m of VBM_MERGES) {
    if (!allIds.has(m.target)) throw new Error(`HARD STOP: merge target 없음 — ${m.target}`);
  }
  console.log('  ✓ merge target 모두 존재');

  // K-00081 category 확인
  const lotteRow = updatedLines.find(l => l.startsWith('busan-K-00081,'));
  const lotteCols = parseCsvLine(lotteRow);
  if (lotteCols[COL.category] !== 'accommodation') throw new Error('HARD STOP: K-00081 category 미반영');
  if (lotteCols[COL.subcategory] !== 'hotel') throw new Error('HARD STOP: K-00081 subcategory 미반영');
  if (lotteCols[COL.candidate_status] !== 'api_only_existing') throw new Error('HARD STOP: K-00081 status 미반영');
  console.log('  ✓ K-00081 category=accommodation / subcategory=hotel / status=api_only_existing');

  // active count
  const activeStatuses = new Set(['existing_enriched', 'api_only_existing', 'web_only_new']);
  const activeCount = updatedLines.filter(l => {
    const c = parseCsvLine(l);
    return activeStatuses.has(c[COL.candidate_status]);
  }).length;
  if (activeCount !== 1664) throw new Error(`HARD STOP: 활성 후보 ${activeCount} ≠ 1664`);
  console.log(`  ✓ 활성 후보: ${activeCount}`);

  console.log('\n  전체 검증 PASS ✓');

  // ── 4. integrated candidates CSV 쓰기 (atomic) ───────────────────────────
  const newCsv = [header, ...updatedLines].join('\n') + '\n';
  const tmpCsv = FILES.intCandidates + '.tmp';
  fs.writeFileSync(tmpCsv, newCsv, 'utf-8');
  fs.renameSync(tmpCsv, FILES.intCandidates);
  console.log(`\n✓ integrated candidates CSV 갱신: ${updatedLines.length}행`);

  // ── 5. integrated candidates JSON 쓰기 ────────────────────────────────────
  const jsonRows = updatedLines.map(line => {
    const cols = parseCsvLine(line);
    const obj = {};
    headerCols.forEach((h, i) => { obj[h] = cols[i] ?? ''; });
    return obj;
  });
  const tmpJson = FILES.intCandidatesJson + '.tmp';
  fs.writeFileSync(tmpJson, JSON.stringify(jsonRows, null, 2), 'utf-8');
  fs.renameSync(tmpJson, FILES.intCandidatesJson);
  console.log(`✓ integrated candidates JSON 갱신: ${jsonRows.length}건`);

  // ── 6. manual_review CSV 갱신 (RESOLVED_IDS 제거) ─────────────────────────
  const rawMr = fs.readFileSync(FILES.manualReview, 'utf-8');
  const mrLines = rawMr.split('\n');
  const mrHeader = mrLines[0];
  const mrData = mrLines.slice(1).filter(l => l.trim() !== '');
  const mrHeaderCols = parseCsvLine(mrHeader);
  const MR_ID_COL = mrHeaderCols.indexOf('candidate_id');

  const mrKept = mrData.filter(l => {
    const id = parseCsvLine(l)[MR_ID_COL];
    return !RESOLVED_IDS.has(id);
  });
  const mrRemoved = mrData.filter(l => RESOLVED_IDS.has(parseCsvLine(l)[MR_ID_COL]));

  console.log(`\n수동검토 제거: ${mrRemoved.length}건`);
  mrRemoved.forEach(l => console.log(`  제거: ${parseCsvLine(l)[MR_ID_COL]}`));

  if (mrKept.length !== 4) throw new Error(`HARD STOP: manual_review 잔여 ${mrKept.length}건 ≠ 4건`);

  const newMr = [mrHeader, ...mrKept].join('\n') + '\n';
  const tmpMr = FILES.manualReview + '.tmp';
  fs.writeFileSync(tmpMr, newMr, 'utf-8');
  fs.renameSync(tmpMr, FILES.manualReview);
  console.log(`✓ manual_review CSV 갱신: ${mrKept.length}건 잔류`);

  // ── 7. metrics JSON 갱신 ──────────────────────────────────────────────────
  const metrics = JSON.parse(fs.readFileSync(FILES.metrics, 'utf-8'));
  metrics.precommit_12a = {
    task: 'TASK-DATA-BUSAN-PRECOMMIT-REVIEW-12A',
    generated_at: '2026-07-24',
    lotte_hotel: {
      candidate_id: 'busan-K-00081',
      change: 'category=unknown → accommodation, subcategory=unknown → hotel',
      status_change: 'manual_review → api_only_existing',
    },
    vbm_merges: VBM_MERGES.map(m => ({
      candidate_id: m.id,
      merge_target_id: m.target,
      status_change: 'manual_review → merge_existing',
      reason: m.reason,
    })),
    counts_after: {
      existing_enriched: 362,
      api_only_existing: 991,
      web_only_new: 311,
      course_reference: 49,
      reference_only: 21,
      merge_existing: 21,
      excluded: 8,
      manual_review: 4,
      total: 1767,
      active_operational: 1664,
    },
  };
  const tmpMetrics = FILES.metrics + '.tmp';
  fs.writeFileSync(tmpMetrics, JSON.stringify(metrics, null, 2), 'utf-8');
  fs.renameSync(tmpMetrics, FILES.metrics);
  console.log('✓ integrated candidates metrics 갱신');

  // ── 8. busan-final-metrics.json 갱신 ─────────────────────────────────────
  const finalMetrics = JSON.parse(fs.readFileSync(FILES.finalMetrics, 'utf-8'));
  finalMetrics.final_candidate_counts.by_status.api_only_existing = 991;
  finalMetrics.final_candidate_counts.by_status.merge_existing = 21;
  finalMetrics.final_candidate_counts.by_status.manual_review = 4;
  finalMetrics.final_candidate_counts.active_operational = 1664;
  finalMetrics.precommit_12a = {
    task: 'TASK-DATA-BUSAN-PRECOMMIT-REVIEW-12A',
    generated_at: '2026-07-24',
    lotte_hotel_fixed: { candidate_id: 'busan-K-00081', category: 'accommodation', subcategory: 'hotel' },
    vbm_merges_count: 9,
    manual_review_remaining: 4,
  };
  const tmpFm = FILES.finalMetrics + '.tmp';
  fs.writeFileSync(tmpFm, JSON.stringify(finalMetrics, null, 2), 'utf-8');
  fs.renameSync(tmpFm, FILES.finalMetrics);
  console.log('✓ busan-final-metrics.json 갱신');

  // ── 9. 완료 요약 ──────────────────────────────────────────────────────────
  console.log('\n=== 완료 요약 ===');
  console.log('롯데호텔 busan-K-00081: accommodation/hotel 확정, manual_review → api_only_existing');
  console.log('VBM 9건: manual_review → merge_existing (모두 canonical에 병합)');
  console.log(`활성 후보: 1663 → 1664 (+1 K-00081)`);
  console.log(`manual_review: 14 → 4`);
  console.log(`merge_existing: 12 → 21 (+9 VBM)`);
  console.log(`api_only_existing: 990 → 991 (+1 K-00081)`);
  console.log('\nTASK-DATA-BUSAN-PRECOMMIT-REVIEW-12A 완료');
}

main();
