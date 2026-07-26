/**
 * TASK-DATA-BUSAN-KTO-IMAGE-RIGHTS-APPLY-20A-4
 * KTO 543건 cpyrhtDivCd → busan-image-rights-audit.csv 반영
 * VB 958건, no_image 141건 무변경
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function hardStop(reason) {
  console.error('\n[HARD STOP]', reason);
  process.exit(1);
}

// ── 경로 ────────────────────────────────────────────────
const AUDIT_CSV   = path.join(ROOT, 'data/tourapi/candidates/busan/busan-image-rights-audit.csv');
const LINKAGE_CSV = path.join(ROOT, 'data/tourapi/reports/busan/busan-image-rights-linkage-audit.csv');
const CAND_JSON   = path.join(ROOT, 'data/tourapi/candidates/busan/busan-integrated-candidates.json');
const CAND_CSV    = path.join(ROOT, 'data/tourapi/candidates/busan/busan-integrated-candidates.csv');
const TMP_PATH    = AUDIT_CSV + '.tmp';
const APPLY_DATE  = '2026-07-26';
const KTO_DOMAIN  = 'tong.visitkorea.or.kr';

// ── 원본 파일 크기 스냅샷 (무변경 확인용) ────────────────
const snapJson = fs.statSync(CAND_JSON).size;
const snapCsv  = fs.statSync(CAND_CSV).size;

// ── CSV 파서 (RFC 4180) ──────────────────────────────────
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

// ── 파일 읽기 ────────────────────────────────────────────
const auditRaw   = fs.readFileSync(AUDIT_CSV, 'utf8');
const linkageRaw = fs.readFileSync(LINKAGE_CSV, 'utf8');

const auditRows   = parseCsv(auditRaw);
const linkageRows = parseCsv(linkageRaw);

const auditCols   = auditRows[0];
const linkageCols = linkageRows[0];

// ── 컬럼 인덱스 ──────────────────────────────────────────
const ai = (name) => { const i = auditCols.indexOf(name); if (i<0) hardStop(`audit 컬럼 없음: ${name}`); return i; };
const li = (name) => { const i = linkageCols.indexOf(name); if (i<0) hardStop(`linkage 컬럼 없음: ${name}`); return i; };

const A = {
  id:         ai('candidate_id'),
  domain:     ai('image_source_domain'),
  evUrl:      ai('license_evidence_url'),
  checkedAt:  ai('license_checked_at'),
  licType:    ai('license_type'),
  licVerif:   ai('license_verification'),
  commercial: ai('commercial_use'),
  modif:      ai('modification_use'),
  attrib:     ai('attribution_required'),
  decision:   ai('operational_image_decision'),
  evidence:   ai('evidence_level'),
  reason:     ai('decision_reason'),
};

const L = {
  id:       li('candidate_id'),
  status:   li('linkage_status'),
  rval:     li('rights_field_value'),
  srcId:    li('source_record_id'),
};

// ── linkage 맵 구성 (KTO auto_linkable만) ────────────────
const linkageMap = new Map();
for (const row of linkageRows.slice(1)) {
  if (row[L.status] === 'auto_linkable') {
    linkageMap.set(row[L.id], { cpyrhtDivCd: row[L.rval], sourceRecordId: row[L.srcId] });
  }
}
if (linkageMap.size !== 543) hardStop(`linkage 맵 크기 이상: ${linkageMap.size} (기대 543)`);

// ── HARD STOP: audit CSV 기준 수치 ───────────────────────
const dataRows = auditRows.slice(1);
if (dataRows.length !== 1642) hardStop(`audit 데이터 행 수 이상: ${dataRows.length} (기대 1642)`);

const dupIds = dataRows.map(r => r[A.id]).filter((id, i, arr) => arr.indexOf(id) !== i);
if (dupIds.length > 0) hardStop(`candidate_id 중복: ${dupIds.join(', ')}`);

// ── 행별 적용 ────────────────────────────────────────────
const originalVbSnapshot = new Map(); // 무변경 검증용

const updatedRows = dataRows.map(row => {
  const r = [...row]; // 복사
  const domain = r[A.domain];

  if (domain === KTO_DOMAIN) {
    const lnk = linkageMap.get(r[A.id]);
    if (!lnk) hardStop(`KTO 행 linkage 없음: ${r[A.id]}`);

    const { cpyrhtDivCd, sourceRecordId } = lnk;
    const srcTag = sourceRecordId
      ? `source_record=${sourceRecordId}`
      : '(source_record_id 미확인)';

    if (cpyrhtDivCd === 'Type1') {
      r[A.licType]    = 'kogl_1';
      r[A.licVerif]   = 'verified';
      r[A.commercial] = 'allowed';
      r[A.modif]      = 'allowed';
      r[A.attrib]     = 'true';
      r[A.decision]   = 'usable';
      r[A.evidence]   = 'item_verified';
      r[A.evUrl]      = 'https://www.kogl.or.kr/info/licenseType1.do';
      r[A.checkedAt]  = APPLY_DATE;
      r[A.reason]     = `KTO raw API의 cpyrhtDivCd=Type1 확인. ${srcTag}. 공공누리 1유형 — 출처표시 조건 충족 시 상업·수정 허용.`;
    } else if (cpyrhtDivCd === 'Type3') {
      r[A.licType]    = 'kogl_3';
      r[A.licVerif]   = 'verified';
      r[A.commercial] = 'allowed';
      r[A.modif]      = 'prohibited';
      r[A.attrib]     = 'true';
      r[A.decision]   = 'usable';
      r[A.evidence]   = 'item_verified';
      r[A.evUrl]      = 'https://www.kogl.or.kr/info/licenseType3.do';
      r[A.checkedAt]  = APPLY_DATE;
      r[A.reason]     = `KTO raw API의 cpyrhtDivCd=Type3 확인. ${srcTag}. 공공누리 3유형 — 출처표시 조건 충족 시 상업 허용, 수정 금지.`;
    } else {
      hardStop(`예상치 못한 cpyrhtDivCd 값: ${cpyrhtDivCd} (${r[A.id]})`);
    }

  } else {
    // VB 또는 no_image — 원본 스냅샷 기록
    originalVbSnapshot.set(r[A.id], row.join('|'));
  }

  return r;
});

// ── HARD STOP: 적용 결과 정합성 ──────────────────────────
const ktoUpdated   = updatedRows.filter(r => r[A.domain] === KTO_DOMAIN);
const vbRows_post  = updatedRows.filter(r => r[A.domain] === 'www.visitbusan.net');
const noImgRows_p  = updatedRows.filter(r => r[A.domain] !== KTO_DOMAIN && r[A.domain] !== 'www.visitbusan.net');

if (ktoUpdated.length !== 543) hardStop(`KTO 갱신 행수 이상: ${ktoUpdated.length}`);
if (vbRows_post.length !== 958) hardStop(`VB 행수 이상: ${vbRows_post.length}`);
if (noImgRows_p.length !== 141) hardStop(`no_image 행수 이상: ${noImgRows_p.length}`);

// KTO Type1/Type3 수치
const ktoType1 = ktoUpdated.filter(r => r[A.licType] === 'kogl_1').length;
const ktoType3 = ktoUpdated.filter(r => r[A.licType] === 'kogl_3').length;
if (ktoType1 !== 75)  hardStop(`Type1 수 이상: ${ktoType1} (기대 75)`);
if (ktoType3 !== 468) hardStop(`Type3 수 이상: ${ktoType3} (기대 468)`);

// KTO usable 전건
const ktoUsable = ktoUpdated.filter(r => r[A.decision] === 'usable').length;
if (ktoUsable !== 543) hardStop(`KTO usable 이상: ${ktoUsable} (기대 543)`);

// KTO item_verified 전건
const ktoItemVer = ktoUpdated.filter(r => r[A.evidence] === 'item_verified').length;
if (ktoItemVer !== 543) hardStop(`KTO item_verified 이상: ${ktoItemVer} (기대 543)`);

// decision_reason "미확인" 잔존 0
const ktoMiHwak = ktoUpdated.filter(r => r[A.reason].includes('미확인')).length;
if (ktoMiHwak > 0) hardStop(`KTO decision_reason "미확인" 잔존: ${ktoMiHwak}건`);

// license_evidence_url 빈 값 0
const ktoEmptyEvUrl = ktoUpdated.filter(r => !r[A.evUrl]).length;
if (ktoEmptyEvUrl > 0) hardStop(`KTO license_evidence_url 빈 값: ${ktoEmptyEvUrl}건`);

// license_checked_at=2026-07-26 전건
const ktoWrongDate = ktoUpdated.filter(r => r[A.checkedAt] !== APPLY_DATE).length;
if (ktoWrongDate > 0) hardStop(`KTO license_checked_at 날짜 불일치: ${ktoWrongDate}건`);

// decision_reason에 source_record= 누락 0 (원천값 없는 경우 제외)
const ktoNoSrcRec = ktoUpdated.filter(r =>
  !r[A.reason].includes('source_record=') && !r[A.reason].includes('source_record_id 미확인')
).length;
if (ktoNoSrcRec > 0) hardStop(`KTO decision_reason source_record 누락: ${ktoNoSrcRec}건`);

// source_record_id 자체가 없는 건 별도 집계
const ktoSrcIdMissing = ktoUpdated.filter(r => r[A.reason].includes('source_record_id 미확인')).length;

// VB 행 무변경 확인
let vbChangedCount = 0;
for (const r of vbRows_post) {
  const orig = originalVbSnapshot.get(r[A.id]);
  const curr = r.join('|');
  if (orig !== curr) vbChangedCount++;
}
if (vbChangedCount > 0) hardStop(`VB 행 변경 감지: ${vbChangedCount}건`);

// no_image 무변경 확인
let noImgChangedCount = 0;
for (const r of noImgRows_p) {
  const orig = originalVbSnapshot.get(r[A.id]);
  const curr = r.join('|');
  if (orig !== curr) noImgChangedCount++;
}
if (noImgChangedCount > 0) hardStop(`no_image 행 변경 감지: ${noImgChangedCount}건`);

// 전체 행수
if (updatedRows.length !== 1642) hardStop(`전체 행수 이상: ${updatedRows.length}`);

// candidate_id 중복
const postDupIds = updatedRows.map(r => r[A.id]).filter((id, i, arr) => arr.indexOf(id) !== i);
if (postDupIds.length > 0) hardStop(`적용 후 candidate_id 중복: ${postDupIds.join(', ')}`);

// ── 원자적 CSV 출력 ──────────────────────────────────────
const csvLines = [
  auditCols.join(','),
  ...updatedRows.map(row => row.map(escapeCsv).join(',')),
];
const csvText = csvLines.join('\n');

fs.writeFileSync(TMP_PATH, csvText, 'utf8');

// 임시 파일 행수 검증
const tmpLineCount = fs.readFileSync(TMP_PATH, 'utf8').split('\n').length;
if (tmpLineCount !== 1643) {
  fs.unlinkSync(TMP_PATH);
  hardStop(`임시 파일 행수 이상: ${tmpLineCount} (기대 1643)`);
}

// 교체
fs.renameSync(TMP_PATH, AUDIT_CSV);

// ── 정본 파일 무변경 확인 ────────────────────────────────
if (fs.statSync(CAND_JSON).size !== snapJson) hardStop('통합 후보 JSON 크기 변경 감지');
if (fs.statSync(CAND_CSV).size !== snapCsv)  hardStop('통합 후보 CSV 크기 변경 감지');

// ── 최종 보고 ─────────────────────────────────────────────
console.log('\n==========================================');
console.log('TASK-DATA-BUSAN-KTO-IMAGE-RIGHTS-APPLY-20A-4');
console.log('KTO 이미지 권리 상태 반영 완료');
console.log('==========================================');
console.log('');
console.log('[ 적용 결과 ]');
console.log('  Type1 (kogl_1) 반영:     ', ktoType1, '건');
console.log('  Type3 (kogl_3) 반영:     ', ktoType3, '건');
console.log('  KTO usable 합계:         ', ktoUsable, '건');
console.log('  KTO item_verified:       ', ktoItemVer, '건');
console.log('');
console.log('[ 검증 결과 ]');
console.log('  decision_reason "미확인" 잔존: 0 ✓');
console.log('  license_evidence_url 빈 값:   0 ✓');
console.log('  license_checked_at 불일치:    0 ✓');
console.log('  source_record_id 미확인 건:  ', ktoSrcIdMissing, ktoSrcIdMissing===0?'✓':'(별도 확인 필요)');
console.log('  VB 958건 변경:               0 ✓');
console.log('  no_image 141건 변경:         0 ✓');
console.log('  candidate_id 중복:           0 ✓');
console.log('  전체 행수:                  ', updatedRows.length, '✓');
console.log('  통합 후보 CSV·JSON 무변경:   ✓');
console.log('');
console.log('[ 변경 파일 ]');
console.log('  data/tourapi/candidates/busan/busan-image-rights-audit.csv (KTO 543건 갱신)');
console.log('');
console.log('git add·commit·push 미실행 ✓');
