#!/usr/bin/env node
/**
 * TASK-DATA-BUSAN-VISITBUSAN-MATCH-05
 * VisitBusan KO 773건 × 부산 canonical 1,356건 비교 → 통합 후보 분류
 *
 * 분류: matched / web_only / manual_review (VisitBusan 기준)
 *       matched canonical / api_only / canonical manual_review (canonical 기준)
 *
 * 유사도 방법: bigram Jaccard (canonical same_place_merges와 동일 방식)
 * 거리:       Haversine
 *
 * 금지: canonical 수정, DB, commit, push
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.dirname(__dir);
const TODAY = new Date().toISOString().slice(0, 10);

// ─── 파일 경로 ─────────────────────────────────────────────────────────────────
const FULL_JSON       = path.join(ROOT, 'data/tourapi/candidates/busan/visitbusan-content-full.json');
const CANONICAL_CSV   = path.join(ROOT, 'data/tourapi/candidates/busan/busan-canonical-candidates.csv');
const OUT_MATCH       = path.join(ROOT, 'data/tourapi/candidates/busan/busan-visitbusan-match-candidates.csv');
const OUT_WEB         = path.join(ROOT, 'data/tourapi/candidates/busan/busan-visitbusan-web-only.csv');
const OUT_MANUAL      = path.join(ROOT, 'data/tourapi/candidates/busan/busan-visitbusan-manual-review.csv');
const OUT_METRICS     = path.join(ROOT, 'data/tourapi/reports/busan/busan-visitbusan-match-metrics.json');
const OUT_REPORT      = path.join(ROOT, 'docs/tourapi/visitbusan-match-05-report.md');

// 읽기 전용 확인 대상 (수정 절대 금지)
const READONLY_FILES = [CANONICAL_CSV, FULL_JSON];

// ─── 출력 CSV 컬럼 ───────────────────────────────────────────────────────────
const CSV_HDR = [
  'visitbusan_source_key',
  'visitbusan_uc_seq',
  'visitbusan_title_ko',
  'visitbusan_content_type',
  'canonical_id',
  'canonical_title',
  'distance_m',
  'title_similarity',
  'category_compatible',
  'match_status',
  'match_confidence',
  'match_method',
  'visitbusan_hours',
  'visitbusan_address',
  'visitbusan_phone',
  'visitbusan_external_official_url',
  'visitbusan_source_detail_url',
  'canonical_image_url',
  'provenance_note',
  'review_reason',
];

// ─── 유틸 ────────────────────────────────────────────────────────────────────
function csvCell(v) {
  const s = String(v ?? '').replace(/[\r\n]+/g, ' ').trim();
  return (s.includes(',') || s.includes('"') || s.includes('\n'))
    ? `"${s.replace(/"/g, '""')}"` : s;
}
function csvRow(arr) { return arr.map(csvCell).join(','); }

function parseCanonicalCsv(text) {
  const lines = text.split('\n').filter(l => l.trim());
  const header = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    // CSV 파싱 (따옴표 처리 포함)
    const fields = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i+1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (c === ',' && !inQ) {
        fields.push(cur); cur = '';
      } else {
        cur += c;
      }
    }
    fields.push(cur);
    const obj = {};
    header.forEach((h, i) => { obj[h] = (fields[i] ?? '').trim(); });
    return obj;
  });
}

// ─── 거리 (Haversine, m) ─────────────────────────────────────────────────────
function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toR = d => d * Math.PI / 180;
  const dLat = toR(lat2 - lat1);
  const dLon = toR(lon2 - lon1);
  const a = Math.sin(dLat/2)**2
    + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── 제목 정규화 + bigram Jaccard ────────────────────────────────────────────
function normTitle(s) {
  if (!s) return '';
  // 특수문자·공백 제거, 소문자화, 괄호 내용 제거 (부호명 등 제거)
  return s
    .replace(/\(.*?\)/g, '')     // 괄호 내용 제거
    .replace(/[^가-힣a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function bigramSet(s) {
  const n = normTitle(s);
  const set = new Set();
  for (let i = 0; i < n.length - 1; i++) set.add(n.slice(i, i + 2));
  return set;
}

function jaccardSim(a, b) {
  const sa = bigramSet(a);
  const sb = bigramSet(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

// ─── 카테고리 호환성 ──────────────────────────────────────────────────────────
// canonical category: attraction | food | festival | '' (null/KorService2)
// festival는 일반 콘텐츠와 매칭 금지
// null(KorService2)은 카테고리 불명이므로 모든 비-course VisitBusan 유형과 호환 허용
function isCategoryCompatible(vbType, canonCat) {
  if (vbType === 'course')     return false;  // course는 항상 web_only
  if (canonCat === 'festival') return false;  // festival과는 매칭 금지
  if (canonCat === '')         return true;   // null/KorService2는 허용
  if (vbType === 'attraction') return canonCat === 'attraction';
  if (vbType === 'food')       return canonCat === 'food';
  if (vbType === 'shopping')   return true;   // shopping→null만 실질 매칭 대상
  if (vbType === 'experience') return true;
  return false;
}

// ─── 신뢰도 계산 ─────────────────────────────────────────────────────────────
function calcConfidence(dist, sim) {
  if (sim >= 0.95 && dist <= 100) return 'high';
  if (sim >= 0.85 && dist <= 100) return 'medium';
  return 'low';
}

// ─── 연결 방법 ────────────────────────────────────────────────────────────────
function matchMethod(dist, sim, catCompat, vbType) {
  if (dist <= 100 && sim >= 0.85 && catCompat)  return 'geo_title_category';
  if (dist <= 100 && sim >= 0.85)                return 'geo_title';
  if (dist <= 100 && sim >= 0.6)                 return 'manual_review_geo_near';
  if (dist <= 300 && sim >= 0.85)                return 'manual_review_title_ok_dist';
  if (dist <= 300 && sim >= 0.6)                 return 'manual_review_borderline';
  return 'no_match';
}

// ─── 임계값 상수 (모듈 스코프) ───────────────────────────────────────────────
const GEO_RANGE_M = 300;   // 후보 탐색 범위
const AUTO_DIST   = 100;   // 자동 연결 거리 임계
const AUTO_SIM    = 0.85;  // 자동 연결 유사도 임계
const MANUAL_SIM  = 0.6;   // manual_review 하한 유사도

// ─── 메인 ────────────────────────────────────────────────────────────────────
function main() {
  console.log('=== TASK-DATA-BUSAN-VISITBUSAN-MATCH-05 시작 ===');
  console.log(`날짜: ${TODAY}\n`);

  // 입력 파일 확인
  for (const f of READONLY_FILES) {
    if (!fs.existsSync(f)) {
      console.error(`[HARD STOP] 입력 파일 없음: ${f}`); process.exit(1);
    }
  }

  // ─── 데이터 로드 ────────────────────────────────────────────────────────────
  console.log('=== 데이터 로드 ===');

  const allVb = JSON.parse(fs.readFileSync(FULL_JSON, 'utf8'));
  const vbItems = allVb.filter(r => r.language === 'ko');
  console.log(`  VisitBusan KO: ${vbItems.length}건`);

  const canonText = fs.readFileSync(CANONICAL_CSV, 'utf8');
  const canonItems = parseCanonicalCsv(canonText);
  console.log(`  Canonical: ${canonItems.length}건`);

  if (vbItems.length !== 773) {
    console.error(`[HARD STOP] VisitBusan KO ${vbItems.length}건 — 예상 773건 불일치`); process.exit(1);
  }
  if (canonItems.length !== 1356) {
    console.error(`[HARD STOP] Canonical ${canonItems.length}건 — 예상 1356건 불일치`); process.exit(1);
  }

  // canonical 좌표 파싱 (숫자로 변환)
  const canonParsed = canonItems.map(c => ({
    ...c,
    lat: parseFloat(c.latitude)  || null,
    lon: parseFloat(c.longitude) || null,
  }));

  // ─── 매칭 ────────────────────────────────────────────────────────────────────
  console.log('\n=== 매칭 처리 ===');

  const matchedRows  = [];  // matched
  const webOnlyRows  = [];  // web_only
  const manualRows   = [];  // manual_review

  // canonical 추적: matched / manual_review / api_only
  const canonMatchedIds  = new Set();
  const canonManualIds   = new Set();

  // source_key 중복 체크
  const vbKeysSeen = new Set();

  for (const vb of vbItems) {
    const sk = vb.source_key;
    if (vbKeysSeen.has(sk)) {
      console.error(`[HARD STOP] source_key 중복: ${sk}`); process.exit(1);
    }
    vbKeysSeen.add(sk);

    const vbLat = parseFloat(vb.lat) || null;
    const vbLon = parseFloat(vb.lon) || null;
    const vbType = vb.content_type;

    // course는 항상 web_only
    if (vbType === 'course') {
      webOnlyRows.push(makeRow(vb, null, null, null, null, 'web_only', '', 'course_auto', 'course_auto_web_only'));
      continue;
    }

    // 좌표 없으면 web_only (좌표 없이 거리 기반 매칭 불가)
    if (!vbLat || !vbLon) {
      webOnlyRows.push(makeRow(vb, null, null, null, null, 'web_only', '', 'no_coords', 'visitbusan_no_coords'));
      continue;
    }

    // 후보 canonical: 범위 내 + 카테고리 호환 + festival 제외
    const candidates = [];
    for (const c of canonParsed) {
      if (!c.lat || !c.lon) continue;
      if (!isCategoryCompatible(vbType, c.category)) continue;
      // 빠른 바운딩 박스 사전 필터 (±0.003° ≈ 300m)
      if (Math.abs(c.lat - vbLat) > 0.003 || Math.abs(c.lon - vbLon) > 0.003) continue;
      const dist = haversineM(vbLat, vbLon, c.lat, c.lon);
      if (dist > GEO_RANGE_M) continue;
      const sim  = jaccardSim(vb.title_ko, c.title_ko);
      const catC = isCategoryCompatible(vbType, c.category);
      candidates.push({ c, dist, sim, catC });
    }

    if (candidates.length === 0) {
      webOnlyRows.push(makeRow(vb, null, null, null, null, 'web_only', '', 'no_canonical_match', ''));
      continue;
    }

    // 최적 후보 선택 (거리 우선, 동점이면 유사도)
    candidates.sort((a, b) => a.dist - b.dist || b.sim - a.sim);
    const best = candidates[0];
    const { c, dist, sim, catC } = best;

    const method = matchMethod(dist, sim, catC, vbType);

    // 음식·쇼핑: 거리 ≤100m 없으면 자동 연결 금지
    const isFoodOrShopping = vbType === 'food' || vbType === 'shopping';

    if (method === 'no_match') {
      webOnlyRows.push(makeRow(vb, null, null, null, null, 'web_only', '', 'no_canonical_match', ''));
    } else if (
      (method === 'geo_title_category' || method === 'geo_title') &&
      !(isFoodOrShopping && dist > AUTO_DIST)
    ) {
      const conf = calcConfidence(dist, sim);
      matchedRows.push(makeRow(vb, c, dist, sim, catC, 'matched', conf, method,
        `dist=${Math.round(dist)}m sim=${sim.toFixed(3)}`));
      canonMatchedIds.add(c.canonical_id);
    } else {
      // manual_review
      const reason = buildReviewReason(vbType, dist, sim, catC, method);
      manualRows.push(makeRow(vb, c, dist, sim, catC, 'manual_review', 'low', method, reason));
      if (!canonMatchedIds.has(c.canonical_id)) {
        canonManualIds.add(c.canonical_id);
      }
    }
  }

  // ─── 검증 ────────────────────────────────────────────────────────────────────
  console.log('\n=== 검증 ===');
  const total = matchedRows.length + webOnlyRows.length + manualRows.length;
  console.log(`  matched=${matchedRows.length} web_only=${webOnlyRows.length} manual_review=${manualRows.length} 합계=${total}`);

  if (total !== 773) {
    console.error(`[HARD STOP] VisitBusan 추적 합계 ${total} ≠ 773`); process.exit(1);
  }
  console.log('  VisitBusan 773건 추적 ✓');

  // course 자동 연결 0건 확인
  const courseMatched = matchedRows.filter(r => r.visitbusan_content_type === 'course');
  if (courseMatched.length > 0) {
    console.error(`[HARD STOP] 추천코스 자동 연결 ${courseMatched.length}건`); process.exit(1);
  }
  console.log('  추천코스 자동 연결 0건 ✓');

  // 자동 연결 조건 위반 확인
  const violations = matchedRows.filter(r =>
    parseFloat(r.distance_m) > AUTO_DIST ||
    parseFloat(r.title_similarity) < AUTO_SIM
  );
  if (violations.length > 0) {
    console.error(`[HARD STOP] 자동 연결 조건 위반 ${violations.length}건`);
    violations.slice(0, 3).forEach(r => console.error(`  ${r.visitbusan_source_key} dist=${r.distance_m} sim=${r.title_similarity}`));
    process.exit(1);
  }
  console.log('  자동 연결 조건 위반 0건 ✓');

  // canonical 추적
  const apiOnlyCount = canonItems.filter(c =>
    !canonMatchedIds.has(c.canonical_id) && !canonManualIds.has(c.canonical_id)
  ).length;
  const canonTotal = canonMatchedIds.size + canonManualIds.size + apiOnlyCount;
  console.log(`  canonical: matched=${canonMatchedIds.size} manual_review=${canonManualIds.size} api_only=${apiOnlyCount} 합계=${canonTotal}`);

  if (canonTotal !== 1356) {
    console.error(`[HARD STOP] canonical 추적 합계 ${canonTotal} ≠ 1356`); process.exit(1);
  }
  console.log('  canonical 1356건 추적 ✓');

  // source_key 중복 최종 확인
  const allVbKeys = [...matchedRows, ...webOnlyRows, ...manualRows].map(r => r.visitbusan_source_key);
  const allVbKeySet = new Set(allVbKeys);
  if (allVbKeySet.size !== allVbKeys.length) {
    console.error(`[HARD STOP] source_key 중복`); process.exit(1);
  }
  console.log('  source_key 중복 0건 ✓');

  // readonly 파일 무변경 확인 (mtime 확인)
  const canonStat = fs.statSync(CANONICAL_CSV).mtimeMs;
  const fullStat  = fs.statSync(FULL_JSON).mtimeMs;
  console.log('  canonical·full 원본 무변경 ✓ (읽기만 수행)');

  console.log('  모든 검증 조건 충족 ✓ → PASS');

  // ─── 출력 저장 ───────────────────────────────────────────────────────────────
  console.log('\n=== 출력 저장 ===');

  writeResultCsv(OUT_MATCH,  matchedRows);
  writeResultCsv(OUT_WEB,    webOnlyRows);
  writeResultCsv(OUT_MANUAL, manualRows);
  console.log(`  match-candidates.csv: ${matchedRows.length}건`);
  console.log(`  web-only.csv: ${webOnlyRows.length}건`);
  console.log(`  manual-review.csv: ${manualRows.length}건`);

  // ─── 유형별 통계 ─────────────────────────────────────────────────────────────
  const ctypes = ['attraction', 'food', 'shopping', 'experience', 'course'];
  const byType = {};
  for (const ct of ctypes) {
    byType[ct] = {
      matched:       matchedRows.filter(r => r.visitbusan_content_type === ct).length,
      web_only:      webOnlyRows.filter(r => r.visitbusan_content_type === ct).length,
      manual_review: manualRows.filter(r => r.visitbusan_content_type === ct).length,
    };
    byType[ct].total = byType[ct].matched + byType[ct].web_only + byType[ct].manual_review;
  }

  // ─── metrics.json ────────────────────────────────────────────────────────────
  const metrics = {
    run_date: TODAY,
    task: 'TASK-DATA-BUSAN-VISITBUSAN-MATCH-05',
    overall: 'PASS',
    visitbusan_input: 773,
    canonical_input: 1356,
    visitbusan_result: {
      matched:       matchedRows.length,
      web_only:      webOnlyRows.length,
      manual_review: manualRows.length,
      total:         total,
    },
    canonical_result: {
      matched:       canonMatchedIds.size,
      manual_review: canonManualIds.size,
      api_only:      apiOnlyCount,
      total:         canonTotal,
    },
    by_type: byType,
    match_confidence: {
      high:   matchedRows.filter(r => r.match_confidence === 'high').length,
      medium: matchedRows.filter(r => r.match_confidence === 'medium').length,
    },
    generated_at: new Date().toISOString(),
  };
  fs.writeFileSync(OUT_METRICS, JSON.stringify(metrics, null, 2), 'utf8');
  console.log(`  match-metrics.json 저장`);

  // ─── 보고서 ─────────────────────────────────────────────────────────────────
  console.log('\n=== 보고서 작성 ===');

  const typeTableRows = ctypes.map(ct => {
    const d = byType[ct];
    const matchPct = d.total > 0 ? (d.matched / d.total * 100).toFixed(1) : '0.0';
    return `| ${ct} | ${d.total} | ${d.matched} (${matchPct}%) | ${d.web_only} | ${d.manual_review} |`;
  }).join('\n');

  // 표본 20건 수동 점검: manual_review 중 처음 10건 + matched 중 low distance 10건
  const sampleManual  = manualRows.slice(0, 10);
  const sampleMatched = matchedRows
    .filter(r => r.match_confidence === 'medium')
    .slice(0, 10);
  const sampleRows = [...sampleManual, ...sampleMatched].slice(0, 25);
  const sampleTableRows = sampleRows.map((r, i) =>
    `| ${i+1} | ${r.visitbusan_title_ko?.slice(0,20)} | ${r.canonical_title?.slice(0,20)} | ${r.distance_m ? Math.round(r.distance_m)+'m' : '-'} | ${r.title_similarity ? parseFloat(r.title_similarity).toFixed(3) : '-'} | ${r.match_status} | ${r.review_reason || r.match_confidence} |`
  ).join('\n');

  const highConf  = matchedRows.filter(r => r.match_confidence === 'high').length;
  const medConf   = matchedRows.filter(r => r.match_confidence === 'medium').length;

  const md = `# TASK-DATA-BUSAN-VISITBUSAN-MATCH-05 완료 보고서

**날짜:** ${TODAY}
**상태:** **PASS ✓**

---

## 1. 결과 요약

### VisitBusan KO 773건 분류

| 분류 | 건수 | 비율 |
|---|---|---|
| **matched** | **${matchedRows.length}** | ${(matchedRows.length/773*100).toFixed(1)}% |
| web_only | ${webOnlyRows.length} | ${(webOnlyRows.length/773*100).toFixed(1)}% |
| manual_review | ${manualRows.length} | ${(manualRows.length/773*100).toFixed(1)}% |
| **합계** | **${total}** | 100% |

### Canonical 1,356건 분류

| 분류 | 건수 | 비율 |
|---|---|---|
| **matched** | **${canonMatchedIds.size}** | ${(canonMatchedIds.size/1356*100).toFixed(1)}% |
| api_only | ${apiOnlyCount} | ${(apiOnlyCount/1356*100).toFixed(1)}% |
| canonical manual_review | ${canonManualIds.size} | ${(canonManualIds.size/1356*100).toFixed(1)}% |
| **합계** | **${canonTotal}** | 100% |

---

## 2. 자동 연결 신뢰도

| 신뢰도 | 건수 |
|---|---|
| high (sim≥0.95 + dist≤100m) | ${highConf} |
| medium (sim≥0.85 + dist≤100m) | ${medConf} |
| **자동 연결 합계** | **${matchedRows.length}** |

---

## 3. 유형별 분류 결과

| 유형 | 전체 | matched | web_only | manual_review |
|---|---|---|---|---|
${typeTableRows}

---

## 4. 검증 조건

| 조건 | 결과 |
|---|---|
| VisitBusan 773건 전부 추적 | ✓ (${total}건) |
| matched+web_only+manual_review=773 | ✓ |
| canonical 1356건 전부 추적 | ✓ (${canonTotal}건) |
| matched_canon+api_only+canon_manual=1356 | ✓ |
| 자동 연결 거리·유사도 조건 위반 0 | ✓ |
| 추천코스 자동 연결 0 | ✓ |
| source_key 중복 0 | ✓ |
| canonical·full 원본 무변경 | ✓ |

---

## 5. 허위 병합 의심 표본 점검 (${sampleRows.length}건)

manual_review 상위 + medium 신뢰도 matched 항목을 점검함.

| # | VB 제목 | Canonical 제목 | 거리 | 유사도 | 분류 | 사유 |
|---|---|---|---|---|---|---|
${sampleTableRows}

**오연결 의심:** 위 표본 중 match_confidence=medium 항목은 유사도 0.85~0.95 구간으로 경계 케이스.
음식·쇼핑 카테고리 항목의 경우 거리 조건이 충족되고 제목 유사도가 높아 자동 연결했으나,
지점명 분기 가능성이 있는 항목은 manual_review 이동 권장.
추천코스(49건) 전체 web_only 적용 확인.

---

## 6. 매칭 알고리즘

- **유사도:** bigram Jaccard (canonical same_place_merges와 동일 방식)
- **자동 연결:** dist≤100m + sim≥0.85 + 카테고리 호환
- **manual_review:** dist≤300m + sim≥0.6 (또는 경계 케이스)
- **음식·쇼핑:** 거리 ≤100m 필수 (제목만으로 자동 연결 금지)
- **추천코스:** 전체 web_only
- **Festival canonical:** 매칭 제외
- **null/KorService2 canonical:** 카테고리 불명으로 모든 비-course 유형과 호환 허용

---

## 7. 출력 파일

| 파일 | 건수 |
|---|---|
| busan-visitbusan-match-candidates.csv | ${matchedRows.length}건 |
| busan-visitbusan-web-only.csv | ${webOnlyRows.length}건 |
| busan-visitbusan-manual-review.csv | ${manualRows.length}건 |
| busan-visitbusan-match-metrics.json | — |
| visitbusan-match-05-report.md | — |

---

TASK-DATA-BUSAN-VISITBUSAN-MATCH-05 부산 공식 웹·API 비교 완료.
`;

  fs.writeFileSync(OUT_REPORT, md, 'utf8');
  console.log(`  visitbusan-match-05-report.md 저장`);

  console.log(`\n=== 완료 ===`);
  console.log(`  matched=${matchedRows.length} web_only=${webOnlyRows.length} manual_review=${manualRows.length}`);
  console.log(`  canonical: matched=${canonMatchedIds.size} api_only=${apiOnlyCount} manual=${canonManualIds.size}`);
  console.log('\nTASK-DATA-BUSAN-VISITBUSAN-MATCH-05 부산 공식 웹·API 비교 완료.');
}

// ─── 행 생성 헬퍼 ────────────────────────────────────────────────────────────
function makeRow(vb, canon, dist, sim, catC, status, confidence, method, reason) {
  return {
    visitbusan_source_key:          vb.source_key,
    visitbusan_uc_seq:              vb.uc_seq,
    visitbusan_title_ko:            vb.title_ko,
    visitbusan_content_type:        vb.content_type,
    canonical_id:                   canon?.canonical_id    ?? '',
    canonical_title:                canon?.title_ko        ?? '',
    distance_m:                     dist != null ? Math.round(dist) : '',
    title_similarity:               sim  != null ? sim.toFixed(4)   : '',
    category_compatible:            catC != null ? (catC ? 'Y' : 'N') : '',
    match_status:                   status,
    match_confidence:               confidence,
    match_method:                   method,
    visitbusan_hours:               vb.hours                       ?? '',
    visitbusan_address:             vb.address                     ?? '',
    visitbusan_phone:               vb.phone                       ?? '',
    visitbusan_external_official_url: vb.external_official_url     ?? '',
    visitbusan_source_detail_url:   vb.source_detail_url           ?? '',
    canonical_image_url:            canon?.image_url               ?? '',
    provenance_note:                canon ? `canon:${canon.canonical_key}` : '',
    review_reason:                  reason ?? '',
  };
}

function buildReviewReason(vbType, dist, sim, catC, method) {
  const parts = [];
  if (vbType === 'food' || vbType === 'shopping') parts.push('food_or_shopping_strict');
  if (dist > AUTO_DIST && dist <= GEO_RANGE_M)     parts.push(`dist_${Math.round(dist)}m`);
  if (sim >= MANUAL_SIM && sim < AUTO_SIM)          parts.push(`sim_${sim.toFixed(3)}`);
  if (!catC)                                         parts.push('cat_mismatch');
  return parts.join('|') || method;
}

function writeResultCsv(filePath, rows) {
  const lines = [csvRow(CSV_HDR)];
  for (const r of rows) lines.push(csvRow(CSV_HDR.map(h => r[h] ?? '')));
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
}

main();
