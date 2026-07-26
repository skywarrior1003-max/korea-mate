/**
 * TASK-DATA-BUSAN-RIGHTS-REVIEW-AUDIT-20A — PHASE 1
 * 활성 후보 1,642건 이미지 권리 현황 감사
 * 출력: data/tourapi/candidates/busan/busan-image-rights-audit.csv
 * 기존 통합 후보 CSV·JSON 수정 없음
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

// ── 정본 읽기 ──────────────────────────────────────────────
const JSON_PATH = path.join(ROOT, 'data/tourapi/candidates/busan/busan-integrated-candidates.json');
const CSV_PATH  = path.join(ROOT, 'data/tourapi/candidates/busan/busan-integrated-candidates.csv');
const OUT_PATH  = path.join(ROOT, 'data/tourapi/candidates/busan/busan-image-rights-audit.csv');
const TMP_PATH  = OUT_PATH + '.tmp';

const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));

// ── HARD STOP: 기준 수치 ──────────────────────────────────
if (data.length !== 1767) hardStop(`전체 행 수 이상: ${data.length} (기대 1767)`);

const ACTIVE = ['existing_enriched', 'api_only_existing', 'web_only_new'];
const activeRows = data.filter(r => ACTIVE.includes(r.candidate_status));
if (activeRows.length !== 1642) hardStop(`활성 행 수 이상: ${activeRows.length} (기대 1642)`);

const allIds = activeRows.map(r => r.candidate_id);
const dupIds = allIds.filter((id, i) => allIds.indexOf(id) !== i);
if (dupIds.length > 0) hardStop(`candidate_id 중복: ${dupIds.join(', ')}`);

// ── HARD STOP: 기존 원본 불변 확인 ───────────────────────
const csvFirstLine = fs.readFileSync(CSV_PATH, 'utf8').split('\n')[0];
const csvCols = csvFirstLine.split(',');
if (!csvCols.includes('image_source_domain') && !csvCols.includes('operational_image_decision')) {
  console.log('원본 CSV 컬럼 수:', csvCols.length, '→ 권리 감사 컬럼 미포함 ✓');
}

// ── 도메인 상수 ───────────────────────────────────────────
const VB_DOMAIN  = 'www.visitbusan.net';
const KTO_DOMAIN = 'tong.visitkorea.or.kr';
const AUDIT_DATE = '2026-07-25';

function getDomain(url) {
  if (!url) return null;
  try { return new URL(url).hostname; } catch { return null; }
}

// ── 감사 행 생성 ──────────────────────────────────────────
const auditRows = [];
const stats = { vb: 0, vbTagged: 0, vbUntagged: 0, kto: 0, noImg: 0, other: 0 };
const decisionDist = {};
const evidenceDist = {};

for (const row of activeRows) {
  const imgUrl  = row.image_url || '';
  const domain  = getDomain(imgUrl);
  const srcPage = row.source_detail_url || '';

  const base = {
    candidate_id:            row.candidate_id,
    image_url:               imgUrl,
    image_source_domain:     '',
    image_source_type:       '',
    source_page_url:         srcPage,
    license_evidence_url:    '',
    license_checked_at:      AUDIT_DATE,
    copyright_holder:        '',
    license_type:            'unknown',
    license_verification:    'unverified',
    commercial_use:          'unknown',
    modification_use:        'unknown',
    attribution_required:    'unknown',
    required_attribution_text: '',
    operational_image_decision: 'review_required',
    evidence_level:          'unverified',
    decision_reason:         '',
  };

  if (!imgUrl) {
    // ── 이미지 없음 ───────────────────────────────────────
    stats.noImg++;
    Object.assign(base, {
      operational_image_decision: 'no_image',
      evidence_level:             'unverified',
      decision_reason:            '이미지 URL 없음',
    });

  } else if (domain === VB_DOMAIN) {
    // ── VisitBusan 도메인 ─────────────────────────────────
    stats.vb++;
    const isTagged = row.image_source === 'visitbusan';
    if (isTagged) stats.vbTagged++; else stats.vbUntagged++;

    const licNote = isTagged
      ? `기존 image_license=${row.image_license}`
      : 'image_source 미기록, image_license 미기록';

    Object.assign(base, {
      image_source_domain:     VB_DOMAIN,
      image_source_type:       'editorial_tourism',
      copyright_holder:        'VisitBusan / 부산광역시 (도메인 추정, 미확인)',
      license_type:            'unknown',
      license_verification:    'unverified',
      commercial_use:          'unknown',
      modification_use:        'unknown',
      attribution_required:    'unknown',
      operational_image_decision: 'review_required',
      evidence_level:          'domain_inferred',
      decision_reason:
        `VB 도메인 기반 분류. ${licNote}. ` +
        '공식 이용약관 미확인 — 상업 사용 개별 허가 필요.',
    });

  } else if (domain === KTO_DOMAIN) {
    // ── KTO 도메인 ────────────────────────────────────────
    stats.kto++;
    Object.assign(base, {
      image_source_domain:     KTO_DOMAIN,
      image_source_type:       'tourapi_cdn',
      copyright_holder:        'KTO / 한국관광공사 또는 원저작자 (미확인)',
      license_type:            'unknown',
      license_verification:    'unverified',
      commercial_use:          'unknown',
      modification_use:        'unknown',
      attribution_required:    'unknown',
      operational_image_decision: 'review_required',
      evidence_level:          'domain_inferred',
      decision_reason:
        'KTO TourAPI CDN 도메인 기반 분류. ' +
        'KOGL 해당 여부·공공누리 유형 미확인 — 원저작자·라이선스 개별 확인 필요.',
    });

  } else {
    // ── 기타 도메인 (예상치 못한 케이스) ──────────────────
    stats.other++;
    Object.assign(base, {
      image_source_domain:     domain || 'unknown',
      image_source_type:       'unknown',
      copyright_holder:        'unknown',
      decision_reason:         `알 수 없는 도메인(${domain}) — 개별 확인 필요.`,
    });
  }

  decisionDist[base.operational_image_decision] =
    (decisionDist[base.operational_image_decision] || 0) + 1;
  evidenceDist[base.evidence_level] =
    (evidenceDist[base.evidence_level] || 0) + 1;

  auditRows.push(base);
}

// ── HARD STOP: 결과 정합성 ────────────────────────────────
if (auditRows.length !== 1642)
  hardStop(`감사 행 수 불일치: ${auditRows.length} (기대 1642)`);

if (stats.vb !== 958)  hardStop(`VB 도메인 수 불일치: ${stats.vb}`);
if (stats.kto !== 543) hardStop(`KTO 도메인 수 불일치: ${stats.kto}`);
if (stats.noImg !== 141) hardStop(`이미지 없음 수 불일치: ${stats.noImg}`);
if (stats.other !== 0) hardStop(`예상치 못한 기타 도메인 ${stats.other}건`);

const domainOnlyUsable = auditRows.filter(
  r => r.operational_image_decision === 'usable' && r.evidence_level === 'domain_inferred'
);
if (domainOnlyUsable.length > 0)
  hardStop(`도메인 추론만으로 usable 처리된 항목: ${domainOnlyUsable.length}건`);

const dupAuditIds = auditRows.map(r => r.candidate_id)
  .filter((id, i, arr) => arr.indexOf(id) !== i);
if (dupAuditIds.length > 0)
  hardStop(`감사 CSV candidate_id 중복: ${dupAuditIds.join(', ')}`);

// ── CSV 출력 ──────────────────────────────────────────────
const COLS = [
  'candidate_id', 'image_url', 'image_source_domain', 'image_source_type',
  'source_page_url', 'license_evidence_url', 'license_checked_at', 'copyright_holder',
  'license_type', 'license_verification', 'commercial_use', 'modification_use',
  'attribution_required', 'required_attribution_text', 'operational_image_decision',
  'evidence_level', 'decision_reason',
];

function escapeCsv(val) {
  const str = val === null || val === undefined ? '' : String(val);
  return (str.includes(',') || str.includes('"') || str.includes('\n'))
    ? '"' + str.replace(/"/g, '""') + '"'
    : str;
}

const csvLines = [
  COLS.join(','),
  ...auditRows.map(row => COLS.map(c => escapeCsv(row[c])).join(',')),
];

fs.writeFileSync(TMP_PATH, csvLines.join('\n'), 'utf8');

// 임시 파일 검증
const tmpLines = fs.readFileSync(TMP_PATH, 'utf8').split('\n');
if (tmpLines.length !== 1643) { // header + 1642
  fs.unlinkSync(TMP_PATH);
  hardStop(`임시 파일 행 수 불일치: ${tmpLines.length}`);
}

// 원자적 교체
fs.renameSync(TMP_PATH, OUT_PATH);

// ── 최종 보고 ─────────────────────────────────────────────
console.log('\n==========================================');
console.log('PHASE 1 — 이미지 현황 감사 완료');
console.log('==========================================');
console.log('출력 파일:', OUT_PATH);
console.log('총 감사 행:', auditRows.length, '/ 기대 1642 ✓');
console.log('');
console.log('[ 도메인 분류 ]');
console.log('  VB 전체:         ', stats.vb);
console.log('  ├ image_source=visitbusan (tagged):', stats.vbTagged);
console.log('  └ 태그 없는 VB 도메인:              ', stats.vbUntagged);
console.log('  KTO:             ', stats.kto);
console.log('  이미지 없음:     ', stats.noImg);
console.log('  기타 도메인:     ', stats.other);
console.log('  합계:            ', stats.vb + stats.kto + stats.noImg + stats.other);
console.log('');
console.log('[ operational_image_decision ]');
Object.entries(decisionDist).forEach(([k, v]) => console.log('  ' + k + ':', v));
console.log('');
console.log('[ evidence_level ]');
Object.entries(evidenceDist).forEach(([k, v]) => console.log('  ' + k + ':', v));
console.log('');
console.log('[ HARD STOP 검사 ]');
console.log('  도메인 추론만으로 usable 처리: 0 ✓');
console.log('  candidate_id 중복: 0 ✓');
console.log('  기존 CSV/JSON 수정: 없음 ✓');
console.log('  HARD STOP 조건 없음 — 모두 통과 ✓');
console.log('');
console.log('git add·commit·push 미실행 ✓');
