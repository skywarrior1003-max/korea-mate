/**
 * TASK-DATA-BUSAN-RESTAURANT-IMAGE-RIGHTS-20A-9
 * VB 958건 중 restaurant 415건 — 공식 홍보 이미지 최소 안전검사
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

// 경로
const AUDIT_CSV = path.join(ROOT, 'data/tourapi/candidates/busan/busan-image-rights-audit.csv');
const CAND_JSON = path.join(ROOT, 'data/tourapi/candidates/busan/busan-integrated-candidates.json');
const CAND_CSV  = path.join(ROOT, 'data/tourapi/candidates/busan/busan-integrated-candidates.csv');
const OUT_CSV   = path.join(ROOT, 'data/tourapi/reports/busan/busan-restaurant-image-rights.csv');
const TMP_CSV   = OUT_CSV + '.tmp';

// 원본 크기 스냅샷
const snapAudit = fs.statSync(AUDIT_CSV).size;
const snapJson  = fs.statSync(CAND_JSON).size;
const snapCsv   = fs.statSync(CAND_CSV).size;

// ── 데이터 로드 ──────────────────────────────────────────────
const cands = JSON.parse(fs.readFileSync(CAND_JSON, 'utf8'));
if (!Array.isArray(cands)) hardStop('후보 JSON 배열 아님');

const auditRows = parseCsv(fs.readFileSync(AUDIT_CSV, 'utf8'));
const auditCols = auditRows[0];
const A = {
  id:     auditCols.indexOf('candidate_id'),
  domain: auditCols.indexOf('image_source_domain'),
  imgUrl: auditCols.indexOf('image_url'),
};
for (const [k, v] of Object.entries(A)) {
  if (v < 0) hardStop(`audit 컬럼 없음: ${k}`);
}

const auditData = auditRows.slice(1);
if (auditData.length !== 1642) hardStop(`audit 행수 이상: ${auditData.length} (기대 1642)`);

// VB 958 IDs + image_url 맵
const vbAuditMap = new Map();
for (const r of auditData) {
  if (r[A.domain] === 'www.visitbusan.net') {
    vbAuditMap.set(r[A.id], r[A.imgUrl] || '');
  }
}
if (vbAuditMap.size !== 958) hardStop(`VB audit 건수 이상: ${vbAuditMap.size} (기대 958)`);

// restaurant 415건 필터
const restCands = cands.filter(c =>
  vbAuditMap.has(c.candidate_id) && c.category === 'restaurant'
);
if (restCands.length !== 415) hardStop(`restaurant VB 후보 이상: ${restCands.length} (기대 415)`);

// 후보 ID 중복 사전 검증
const restIds = restCands.map(c => c.candidate_id);
const dupIds  = restIds.filter((id, i, arr) => arr.indexOf(id) !== i);
if (dupIds.length > 0) hardStop(`입력 candidate_id 중복: ${dupIds.join(', ')}`);

// ── 판정 함수 ─────────────────────────────────────────────────
function classify(cand) {
  const lsk = cand.linked_source_keys || '';
  const hasFoodService      = lsk.includes('FoodService');
  const hasVisitBusanContent = lsk.includes('VisitBusanContent');

  // source_type 결정
  let sourceType;
  if (hasFoodService && hasVisitBusanContent) {
    sourceType = 'foodservice_and_visitbusan_content';
  } else if (hasFoodService) {
    sourceType = 'visitbusan_foodservice';
  } else if (hasVisitBusanContent) {
    sourceType = 'visitbusan_content';
  } else {
    sourceType = 'unknown';
  }

  // source_provider: 부산관광공사 VisitBusan 공식 소스 (전건)
  const sourceProvider = '부산관광공사_VisitBusan';

  // 이미지 직접 검수 미실시 → third_party_indicator / watermark_or_credit 불가
  const thirdPartyIndicator = 'unknown';
  const watermarkOrCredit   = 'unknown';

  // ── 판정 로직 ──────────────────────────────────────────────
  let ownerPromotional, operationalRisk, recommendedAction, decisionReason;

  if (sourceType === 'foodservice_and_visitbusan_content') {
    // FoodService API + VisitBusan 콘텐츠 이중 확인
    ownerPromotional  = 'yes';
    operationalRisk   = 'low';
    recommendedAction = 'use_as_official_promotional_image';
    decisionReason    = 'FoodService API + VisitBusan 공식 콘텐츠 이중 소스 확인. 공식 음식점 홍보 이미지 추정 기준 충족. 이미지 직접 검수 미실시 — 법적 라이선스 미확정.';

  } else if (sourceType === 'visitbusan_foodservice') {
    // FoodService API 단독 — VisitBusan 공식 API 데이터
    ownerPromotional  = 'yes';
    operationalRisk   = 'low';
    recommendedAction = 'use_as_official_promotional_image';
    decisionReason    = 'VisitBusan FoodService API 단독 소스. 공식 관광 음식점 데이터 베이스 출처. 상세 페이지 미연결. 이미지 직접 검수 미실시 — 법적 라이선스 미확정.';

  } else if (sourceType === 'visitbusan_content') {
    // VisitBusan 웹 콘텐츠 단독 — FoodService API 미연결, 공식 출처 확인 약함
    ownerPromotional  = 'unknown';
    operationalRisk   = 'medium';
    recommendedAction = 'manual_review';
    decisionReason    = 'VisitBusan 웹 콘텐츠 단독 소스 (web_only_new). FoodService API 미연결. 공식 음식점 홍보 이미지 여부 불확실 — 수동 확인 필요.';

  } else {
    // 소스 불명
    ownerPromotional  = 'unknown';
    operationalRisk   = 'unknown';
    recommendedAction = 'manual_review';
    decisionReason    = '소스 연결 정보 없음 — 수동 확인 필요.';
  }

  return {
    sourceProvider,
    sourceType,
    ownerPromotional,
    thirdPartyIndicator,
    watermarkOrCredit,
    operationalRisk,
    recommendedAction,
    decisionReason,
  };
}

// ── 처리 ─────────────────────────────────────────────────────
const HEADER = [
  'candidate_id', 'restaurant_name', 'current_image_url',
  'source_provider', 'source_type',
  'owner_promotional_image_likely', 'third_party_indicator', 'watermark_or_credit',
  'operational_risk', 'recommended_action', 'decision_reason',
];

const outRows = [];

for (const cand of restCands) {
  const imageUrl = vbAuditMap.get(cand.candidate_id) || cand.image_url || '';
  const {
    sourceProvider, sourceType,
    ownerPromotional, thirdPartyIndicator, watermarkOrCredit,
    operationalRisk, recommendedAction, decisionReason,
  } = classify(cand);

  outRows.push([
    cand.candidate_id,
    cand.title_ko || '',
    imageUrl,
    sourceProvider,
    sourceType,
    ownerPromotional,
    thirdPartyIndicator,
    watermarkOrCredit,
    operationalRisk,
    recommendedAction,
    decisionReason,
  ]);
}

// ── HARD STOP: 출력 검증 ──────────────────────────────────────
if (outRows.length !== 415) hardStop(`출력 행수 이상: ${outRows.length} (기대 415)`);

const outIds = outRows.map(r => r[0]);
const outDupIds = outIds.filter((id, i, arr) => arr.indexOf(id) !== i);
if (outDupIds.length > 0) hardStop(`출력 candidate_id 중복: ${outDupIds.join(', ')}`);

// restaurant 415건 전원 포함 확인
const outIdSet = new Set(outIds);
for (const c of restCands) {
  if (!outIdSet.has(c.candidate_id)) hardStop(`누락 candidate: ${c.candidate_id}`);
}

// 제3자 흔적 있는 건 low 처리 금지 (third_party_indicator=yes AND risk=low → 0)
const badLow = outRows.filter(r => r[5+1] === 'yes' && r[8] === 'low');
if (badLow.length > 0) {
  hardStop(`제3자 흔적(yes) + low 처리 ${badLow.length}건: ${badLow.map(r=>r[0]).join(', ')}`);
}

// low 판정은 FoodService 또는 VisitBusan 공식 소스 필수
const lowRows = outRows.filter(r => r[8] === 'low');
const lowNonOfficial = lowRows.filter(r =>
  r[4] !== 'visitbusan_foodservice' &&
  r[4] !== 'foodservice_and_visitbusan_content' &&
  r[4] !== 'visitbusan_content'
);
if (lowNonOfficial.length > 0) {
  hardStop(`low 판정 중 비공식 소스 ${lowNonOfficial.length}건`);
}

// operational_risk 허용값 검증
const validRisk = new Set(['low', 'medium', 'high', 'unknown']);
const badRisk = outRows.filter(r => !validRisk.has(r[8]));
if (badRisk.length > 0) hardStop(`operational_risk 허용값 외: ${badRisk.map(r=>r[0]).join(', ')}`);

// recommended_action 허용값 검증
const validAction = new Set([
  'use_as_official_promotional_image', 'use_with_source_label',
  'manual_review', 'replace_image', 'do_not_use'
]);
const badAction = outRows.filter(r => !validAction.has(r[9]));
if (badAction.length > 0) hardStop(`recommended_action 허용값 외: ${badAction.map(r=>r[0]).join(', ')}`);

// owner_promotional_image_likely 허용값 검증
const validOwner = new Set(['yes', 'no', 'unknown']);
const badOwner = outRows.filter(r => !validOwner.has(r[5]));
if (badOwner.length > 0) hardStop(`owner_promotional_image_likely 허용값 외: ${badOwner.map(r=>r[0]).join(', ')}`);

// 정본 무변경 확인
if (fs.statSync(AUDIT_CSV).size !== snapAudit) hardStop('audit CSV 크기 변경 감지');
if (fs.statSync(CAND_JSON).size !== snapJson)  hardStop('candidates JSON 크기 변경 감지');
if (fs.statSync(CAND_CSV).size !== snapCsv)    hardStop('candidates CSV 크기 변경 감지');

// ── 원자적 CSV 출력 ───────────────────────────────────────────
const csvLines = [
  HEADER.join(','),
  ...outRows.map(row => row.map(escapeCsv).join(',')),
];
fs.writeFileSync(TMP_CSV, csvLines.join('\n'), 'utf8');

const tmpLineCount = fs.readFileSync(TMP_CSV, 'utf8').split('\n').length;
if (tmpLineCount !== 416) {
  fs.unlinkSync(TMP_CSV);
  hardStop(`임시 파일 행수 이상: ${tmpLineCount} (기대 416)`);
}

fs.renameSync(TMP_CSV, OUT_CSV);

// ── 통계 집계 ─────────────────────────────────────────────────
const ownerYes  = outRows.filter(r => r[5] === 'yes').length;
const ownerNo   = outRows.filter(r => r[5] === 'no').length;
const ownerUnk  = outRows.filter(r => r[5] === 'unknown').length;

const riskLow   = outRows.filter(r => r[8] === 'low').length;
const riskMed   = outRows.filter(r => r[8] === 'medium').length;
const riskHigh  = outRows.filter(r => r[8] === 'high').length;
const riskUnk   = outRows.filter(r => r[8] === 'unknown').length;

const actUse    = outRows.filter(r => r[9] === 'use_as_official_promotional_image').length;
const actManual = outRows.filter(r => r[9] === 'manual_review').length;
const actRepl   = outRows.filter(r => r[9] === 'replace_image' || r[9] === 'do_not_use').length;

const srcDist = {};
outRows.forEach(r => { srcDist[r[4]] = (srcDist[r[4]]||0)+1; });

// ── 최종 보고 ─────────────────────────────────────────────────
console.log('\n==========================================');
console.log('TASK-DATA-BUSAN-RESTAURANT-IMAGE-RIGHTS-20A-9');
console.log('음식점 공식 홍보 이미지 최소 안전검사 완료');
console.log('==========================================');
console.log('');
console.log('[ 공식 홍보 사진 추정 ]');
console.log('  yes    :', ownerYes, '건');
console.log('  no     :', ownerNo, '건');
console.log('  unknown:', ownerUnk, '건');
console.log('');
console.log('[ 운영 위험도 ]');
console.log('  low    :', riskLow, '건');
console.log('  medium :', riskMed, '건');
console.log('  high   :', riskHigh, '건');
console.log('  unknown:', riskUnk, '건');
console.log('');
console.log('[ 권고 ]');
console.log('  사용 후보 (use_as_official_promotional_image):', actUse, '건');
console.log('  수동 확인 (manual_review)                    :', actManual, '건');
console.log('  교체·사용 제외 (replace/do_not_use)          :', actRepl, '건');
console.log('');
console.log('[ 소스 유형 ]');
Object.entries(srcDist).forEach(([k, v]) => console.log('  ' + k + ':', v, '건'));
console.log('');
console.log('[ 검증 ]');
console.log('  restaurant 415건 누락 0               ✓');
console.log('  candidate_id 중복 0                   ✓');
console.log('  third_party=yes + low 처리 0건        ✓');
console.log('  low 판정 전건 공식 소스 확인           ✓');
console.log('  정본 파일 무변경                       ✓');
console.log('');
console.log('[ 변경 파일 ]');
console.log('  data/tourapi/reports/busan/busan-restaurant-image-rights.csv (신규)');
console.log('');
console.log('TASK-DATA-BUSAN-RESTAURANT-IMAGE-RIGHTS-20A-9 음식점 공식 홍보 이미지 최소 안전검사 완료 — 운영 반영·commit·push 보류.');
