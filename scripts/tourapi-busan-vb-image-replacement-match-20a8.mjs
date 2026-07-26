/**
 * TASK-DATA-BUSAN-VB-IMAGE-REPLACEMENT-MATCH-20A-8
 * VB 이미지 958건 → KTO Type1·Type3 대체 후보 매칭
 * 원본 후보 CSV·JSON·audit CSV 수정 없음. 신규 파일만 생성.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function hardStop(reason) {
  console.error('\n[HARD STOP]', reason);
  process.exit(1);
}

// RFC 4180 CSV 파서
function parseCsv(text) {
  const rows = [];
  let field = '', row = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') { inQ = false; }
      else { field += ch; }
    } else {
      if (ch === '"') { inQ = true; }
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n') {
        row.push(field); field = '';
        if (row.some(Boolean)) rows.push(row);
        row = [];
      } else if (ch === '\r') { /* skip */ }
      else { field += ch; }
    }
  }
  if (field || row.length) { row.push(field); if (row.some(Boolean)) rows.push(row); }
  return rows;
}

function escapeCsv(val) {
  const s = (val == null) ? '' : String(val);
  return (s.includes(',') || s.includes('"') || s.includes('\n'))
    ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// 하버사인 거리 (미터)
function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const rad = x => x * Math.PI / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// 장소명 정규화 (한글+알파벳+숫자만, 소문자)
function normName(s) {
  if (!s) return '';
  return s.replace(/[^\wㄱ-힣]/g, '').toLowerCase();
}

// 주소 정규화 (구 + 동·로·길 수준)
function normAddr(s) {
  if (!s) return '';
  const m = s.match(/([가-힣]+구)\s*([가-힣0-9]+[동로길])/);
  if (m) return m[1] + m[2];
  return s.replace(/[^\wㄱ-힣]/g, '').substring(0, 12);
}

// KTO contentid 추출 (linked_source_keys에서 KorService2:NNN:ko 패턴)
function extractKtoContentid(linkedSourceKeys) {
  if (!linkedSourceKeys) return '';
  const m = linkedSourceKeys.match(/KorService2:(\d+):/);
  return m ? m[1] : '';
}

// 경로
const AUDIT_CSV = path.join(ROOT, 'data/tourapi/candidates/busan/busan-image-rights-audit.csv');
const CAND_JSON = path.join(ROOT, 'data/tourapi/candidates/busan/busan-integrated-candidates.json');
const CAND_CSV  = path.join(ROOT, 'data/tourapi/candidates/busan/busan-integrated-candidates.csv');
const OUT_CSV   = path.join(ROOT, 'data/tourapi/reports/busan/busan-vb-image-replacement-match.csv');
const TMP_CSV   = OUT_CSV + '.tmp';
const TODAY     = '2026-07-26';

// 원본 파일 크기 스냅샷
const snapAudit = fs.statSync(AUDIT_CSV).size;
const snapJson  = fs.statSync(CAND_JSON).size;
const snapCsv   = fs.statSync(CAND_CSV).size;

// ── 데이터 로드 ──────────────────────────────────────────────
const cands = JSON.parse(fs.readFileSync(CAND_JSON, 'utf8'));
if (!Array.isArray(cands)) hardStop('후보 JSON 배열 아님');

const auditRows = parseCsv(fs.readFileSync(AUDIT_CSV, 'utf8'));
const auditCols = auditRows[0];

const A = {
  id:       auditCols.indexOf('candidate_id'),
  imgUrl:   auditCols.indexOf('image_url'),
  domain:   auditCols.indexOf('image_source_domain'),
  licType:  auditCols.indexOf('license_type'),
  decision: auditCols.indexOf('operational_image_decision'),
  evidence: auditCols.indexOf('evidence_level'),
};
for (const [k, v] of Object.entries(A)) {
  if (v < 0) hardStop(`audit 컬럼 없음: ${k}`);
}

const auditData = auditRows.slice(1);
if (auditData.length !== 1642) hardStop(`audit 행수 이상: ${auditData.length} (기대 1642)`);

// VB 958건
const vbAuditRows = auditData.filter(r => r[A.domain] === 'www.visitbusan.net');
if (vbAuditRows.length !== 958) hardStop(`VB audit 행수 이상: ${vbAuditRows.length} (기대 958)`);

// KTO usable 543건
const ktoUsableAuditRows = auditData.filter(r =>
  r[A.domain] === 'tong.visitkorea.or.kr' &&
  r[A.decision] === 'usable' &&
  r[A.evidence] === 'item_verified'
);
if (ktoUsableAuditRows.length !== 543) hardStop(`KTO usable 행수 이상: ${ktoUsableAuditRows.length} (기대 543)`);

// KTO license_type 검증 (kogl_1 or kogl_3만 허용)
for (const r of ktoUsableAuditRows) {
  if (r[A.licType] !== 'kogl_1' && r[A.licType] !== 'kogl_3') {
    hardStop(`KTO usable license_type 이상: ${r[A.id]} = ${r[A.licType]}`);
  }
}

// audit VB candidate_id → imageUrl 맵
const vbAuditMap = new Map();
for (const r of vbAuditRows) {
  vbAuditMap.set(r[A.id], r[A.imgUrl] || '');
}

// 후보 맵
const candMap = new Map();
for (const c of cands) candMap.set(c.candidate_id, c);

// KTO usable 풀 구성
const ktoPool = [];
for (const r of ktoUsableAuditRows) {
  const cand = candMap.get(r[A.id]);
  if (!cand) hardStop(`KTO usable candidate JSON 없음: ${r[A.id]}`);
  ktoPool.push({
    candidate_id: cand.candidate_id,
    title_ko:     cand.title_ko || '',
    address:      cand.address || '',
    latitude:     parseFloat(cand.latitude)  || null,
    longitude:    parseFloat(cand.longitude) || null,
    image_url:    cand.image_url || '',
    license_type: r[A.licType],
    contentid:    extractKtoContentid(cand.linked_source_keys),
    normTitle:    normName(cand.title_ko),
    normAddr:     normAddr(cand.address),
  });
}

// KTO candidate_id → pool 엔트리 맵
const ktoById = new Map(ktoPool.map(k => [k.candidate_id, k]));

// Method 2: (normTitle|normAddr) → ktoPool 인덱스
const ktoByNameAddr = new Map();
for (const k of ktoPool) {
  const key = k.normTitle + '|' + k.normAddr;
  if (!ktoByNameAddr.has(key)) ktoByNameAddr.set(key, []);
  ktoByNameAddr.get(key).push(k);
}

// ── 매칭 처리 ─────────────────────────────────────────────────
const HEADER = [
  'candidate_id', 'place_name', 'current_vb_image_url',
  'matched_kto_contentid', 'replacement_kto_image_url', 'kto_license_type',
  'match_method', 'match_confidence', 'replacement_status', 'decision_reason',
];

const outRows = [];
let m1Count = 0, m2Count = 0, m3Count = 0, m4Count = 0;

for (const vbRow of vbAuditRows) {
  const vbId      = vbRow[A.id];
  const vbCand    = candMap.get(vbId);
  const vbImgUrl  = vbRow[A.imgUrl] || '';

  let placeName           = '';
  let matchedKtoContentid = '';
  let replacementKtoImg   = '';
  let ktoLicType          = '';
  let matchMethod         = 'no_match';
  let matchConfidence     = 'unmatched';
  let replacementStatus   = 'no_kto_match';
  let decisionReason      = '';

  if (!vbCand) {
    decisionReason    = 'candidates JSON에서 후보 없음 — 수동 확인 필요';
    replacementStatus = 'manual_review';
    matchMethod       = 'no_match';
    matchConfidence   = 'unmatched';
  } else {
    placeName = vbCand.title_ko || '';

    const vbLsk      = vbCand.linked_source_keys || '';
    const vbNormName = normName(vbCand.title_ko);
    const vbNormAddr = normAddr(vbCand.address);
    const vbLat      = parseFloat(vbCand.latitude)  || null;
    const vbLng      = parseFloat(vbCand.longitude) || null;

    // ── Method 1: 동일 canonical 안에 KTO+VB source 연결 ────
    // Case A: linked_source_keys에 KorService2 포함 → 직접 contentid 보유
    const ktoContentidFromLsk = extractKtoContentid(vbLsk);
    if (!matchedKtoContentid && ktoContentidFromLsk) {
      // VB candidate 자체가 KTO 데이터와 연결되어 있음 — KTO candidate 탐색
      const ktoCandidate = ktoPool.find(k => k.contentid === ktoContentidFromLsk);
      if (ktoCandidate) {
        matchedKtoContentid = ktoCandidate.contentid;
        replacementKtoImg   = ktoCandidate.image_url;
        ktoLicType          = ktoCandidate.license_type;
        matchMethod         = 'method1_linked_source';
        matchConfidence     = 'exact';
        replacementStatus   = 'auto_replace_candidate';
        decisionReason      = `linked_source_keys에 KorService2:${ktoContentidFromLsk} 포함 — 동일 장소 KTO usable(${ktoCandidate.license_type}) 확인.`;
        if (ktoLicType === 'kogl_3') decisionReason += ' [공공누리 3유형: 수정 금지]';
        m1Count++;
      }
    }

    // Case B: merge_target_id → KTO usable 후보
    if (!matchedKtoContentid && vbCand.merge_target_id) {
      const targetKto = ktoById.get(vbCand.merge_target_id);
      if (targetKto) {
        matchedKtoContentid = targetKto.contentid;
        replacementKtoImg   = targetKto.image_url;
        ktoLicType          = targetKto.license_type;
        matchMethod         = 'method1_merge_target';
        matchConfidence     = 'exact';
        replacementStatus   = 'auto_replace_candidate';
        decisionReason      = `merge_target_id=${vbCand.merge_target_id} → KTO usable(${targetKto.license_type}) 확인. 동일 장소 명확.`;
        if (ktoLicType === 'kogl_3') decisionReason += ' [공공누리 3유형: 수정 금지]';
        m1Count++;
      }
    }

    // ── Method 2: 장소명 정규화 + 주소 일치 ─────────────────
    if (!matchedKtoContentid && vbNormName.length >= 2) {
      const key  = vbNormName + '|' + vbNormAddr;
      const hits = ktoByNameAddr.get(key) || [];
      if (hits.length > 0) {
        const best = hits[0];
        matchedKtoContentid = best.contentid;
        replacementKtoImg   = best.image_url;
        ktoLicType          = best.license_type;
        matchMethod         = 'method2_name_address';
        matchConfidence     = hits.length === 1 ? 'exact' : 'high';
        replacementStatus   = 'auto_replace_candidate';
        decisionReason      = `장소명 일치(${vbCand.title_ko}) + 주소 일치(${vbNormAddr}). KTO usable(${best.license_type}).`;
        if (hits.length > 1) decisionReason += ` 동명 KTO ${hits.length}건 — 첫 번째 선택.`;
        if (ktoLicType === 'kogl_3') decisionReason += ' [공공누리 3유형: 수정 금지]';
        m2Count++;
      }
    }

    // ── Method 3: 좌표 100m 이내 + 장소명 유사도 ────────────
    if (!matchedKtoContentid && vbLat !== null && vbLng !== null && vbNormName.length >= 2) {
      let bestDist = Infinity;
      let bestKto  = null;

      for (const k of ktoPool) {
        if (k.latitude === null || k.longitude === null) continue;
        const dist = haversineM(vbLat, vbLng, k.latitude, k.longitude);
        if (dist > 100) continue;

        // 장소명 유사도: 한쪽이 다른 쪽을 포함하고 최소 2자 이상 공유
        const nameSim = vbNormName.length >= 2 && k.normTitle.length >= 2 && (
          vbNormName.includes(k.normTitle) || k.normTitle.includes(vbNormName)
        );
        if (nameSim && dist < bestDist) {
          bestDist = dist;
          bestKto  = k;
        }
      }

      if (bestKto) {
        matchedKtoContentid = bestKto.contentid;
        replacementKtoImg   = bestKto.image_url;
        ktoLicType          = bestKto.license_type;
        matchMethod         = 'method3_coordinate';
        const distM         = Math.round(bestDist);

        if (bestDist <= 50) {
          matchConfidence   = 'high';
          replacementStatus = 'auto_replace_candidate';
          decisionReason    = `좌표 ${distM}m 이내 + 장소명 유사(${vbCand.title_ko} ≈ ${bestKto.title_ko}). KTO usable(${bestKto.license_type}).`;
        } else {
          matchConfidence   = 'medium';
          replacementStatus = 'manual_review';
          decisionReason    = `좌표 ${distM}m(50~100m 범위) + 장소명 유사(${vbCand.title_ko} ≈ ${bestKto.title_ko}). 수동 확인 권고.`;
        }
        if (ktoLicType === 'kogl_3') decisionReason += ' [공공누리 3유형: 수정 금지]';
        m3Count++;
      }
    }

    // ── Method 4: no_kto_match ───────────────────────────────
    if (!matchedKtoContentid && matchMethod === 'no_match') {
      replacementStatus = 'no_kto_match';
      matchMethod       = 'no_match';
      matchConfidence   = 'unmatched';
      decisionReason    = '장소명·주소·좌표 기반 KTO 대체 후보 없음.';
      m4Count++;
    }
  }

  // Method 1 unavailable (merge_target_id 있으나 KTO usable 아님) 처리
  if (matchMethod === 'no_match' && replacementStatus === 'no_kto_match' && vbCand?.merge_target_id) {
    const tgt = vbCand.merge_target_id;
    const tgtCand = candMap.get(tgt);
    if (tgtCand && !ktoById.has(tgt)) {
      replacementStatus = 'manual_review';
      decisionReason    = `merge_target_id=${tgt} 있으나 merge 대상도 VB 이미지 — KTO usable 없음. 수동 확인 필요.`;
      matchMethod       = 'method1_merge_unavailable';
      matchConfidence   = 'unmatched';
      // m4Count는 이미 위에서 카운트되지 않았을 수도 있으므로 보정 필요
      // → no_match 분기에서 m4Count가 증가됐다면 감소
      m4Count--;
    }
  }

  outRows.push([
    vbId,
    placeName,
    vbImgUrl,
    matchedKtoContentid,
    replacementKtoImg,
    ktoLicType,
    matchMethod,
    matchConfidence,
    replacementStatus,
    decisionReason,
  ]);
}

// ── HARD STOP: 출력 검증 ──────────────────────────────────────
if (outRows.length !== 958) hardStop(`출력 행수 이상: ${outRows.length} (기대 958)`);

const outIds    = outRows.map(r => r[0]);
const dupIds    = outIds.filter((id, i, arr) => arr.indexOf(id) !== i);
if (dupIds.length > 0) hardStop(`candidate_id 중복: ${dupIds.join(', ')}`);

// VB 958건 전원 포함 확인
const vbIdSet  = new Set(vbAuditRows.map(r => r[A.id]));
const outIdSet = new Set(outIds);
for (const id of vbIdSet) {
  if (!outIdSet.has(id)) hardStop(`VB candidate 누락: ${id}`);
}

// auto_replace_candidate → KTO 이미지 URL 및 license_type 검증
const autoRows = outRows.filter(r => r[8] === 'auto_replace_candidate');
for (const r of autoRows) {
  if (!r[4] || !r[4].includes('tong.visitkorea.or.kr')) {
    hardStop(`auto_replace 후보 KTO 이미지 URL 이상: ${r[0]} → "${r[4]}"`);
  }
  if (r[5] !== 'kogl_1' && r[5] !== 'kogl_3') {
    hardStop(`auto_replace 후보 license_type 이상: ${r[0]} → "${r[5]}"`);
  }
}

// 정본 무변경 확인
if (fs.statSync(AUDIT_CSV).size !== snapAudit) hardStop('audit CSV 크기 변경 감지');
if (fs.statSync(CAND_JSON).size !== snapJson)  hardStop('candidates JSON 크기 변경 감지');
if (fs.statSync(CAND_CSV).size !== snapCsv)    hardStop('candidates CSV 크기 변경 감지');

// ── 원자적 CSV 출력 ───────────────────────────────────────────
const csvLines = [
  HEADER.join(','),
  ...outRows.map(row => row.map(escapeCsv).join(',')),
];
const csvText = csvLines.join('\n');

fs.writeFileSync(TMP_CSV, csvText, 'utf8');

const tmpLineCount = fs.readFileSync(TMP_CSV, 'utf8').split('\n').length;
if (tmpLineCount !== 959) {
  fs.unlinkSync(TMP_CSV);
  hardStop(`임시 파일 행수 이상: ${tmpLineCount} (기대 959)`);
}

fs.renameSync(TMP_CSV, OUT_CSV);

// ── 통계 집계 ─────────────────────────────────────────────────
const autoReplace  = outRows.filter(r => r[8] === 'auto_replace_candidate').length;
const manualReview = outRows.filter(r => r[8] === 'manual_review').length;
const noKtoMatch   = outRows.filter(r => r[8] === 'no_kto_match').length;

const type1Count = outRows.filter(r => r[5] === 'kogl_1').length;
const type3Count = outRows.filter(r => r[5] === 'kogl_3').length;

const m1actual = outRows.filter(r => r[6].startsWith('method1') && !r[6].includes('unavailable')).length;
const m1unavail = outRows.filter(r => r[6] === 'method1_merge_unavailable').length;
const m2actual = outRows.filter(r => r[6] === 'method2_name_address').length;
const m3actual = outRows.filter(r => r[6] === 'method3_coordinate').length;
const m4actual = outRows.filter(r => r[6] === 'no_match').length;

// ── 최종 보고 ─────────────────────────────────────────────────
console.log('\n==========================================');
console.log('TASK-DATA-BUSAN-VB-IMAGE-REPLACEMENT-MATCH-20A-8');
console.log('VB 이미지 KTO 대체 후보 매칭 완료');
console.log('==========================================');
console.log('');
console.log('[ 결과 ]');
console.log('  auto_replace_candidate:', autoReplace, '건');
console.log('  manual_review         :', manualReview, '건');
console.log('  no_kto_match          :', noKtoMatch, '건');
console.log('  합계                  :', outRows.length, '건');
console.log('');
console.log('[ KTO 라이선스 ]');
console.log('  Type1 (kogl_1):', type1Count, '건');
console.log('  Type3 (kogl_3):', type3Count, '건');
console.log('');
console.log('[ 매칭 방식 ]');
console.log('  Method 1 (linked_source / merge_target):', m1actual, '건');
console.log('  Method 1 (merge_target KTO usable 없음):', m1unavail, '건');
console.log('  Method 2 (장소명 + 주소)               :', m2actual, '건');
console.log('  Method 3 (좌표 100m + 장소명 유사)     :', m3actual, '건');
console.log('  no_match                                :', m4actual, '건');
console.log('');
console.log('[ 검증 ]');
console.log('  VB 958건 누락 0              ✓');
console.log('  candidate_id 중복 0          ✓');
console.log('  auto_replace KTO 이미지 검증 ✓');
console.log('  정본 파일 무변경             ✓');
console.log('');
console.log('[ 변경 파일 ]');
console.log('  data/tourapi/reports/busan/busan-vb-image-replacement-match.csv (신규)');
console.log('');
console.log('TASK-DATA-BUSAN-VB-IMAGE-REPLACEMENT-MATCH-20A-8 VisitBusan 이미지의 KTO 대체 후보 매칭 완료 — 실제 교체·commit·push 보류.');
