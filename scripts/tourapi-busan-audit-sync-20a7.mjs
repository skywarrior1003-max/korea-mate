/**
 * TASK-DATA-BUSAN-AUDIT-SYNC-20A-7
 * busan-final-metrics.json + busan-handoff-to-main-pc.md 동기화
 * TASK-20A 이미지 권리 감사·예외 검토 결과 반영
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

const METRICS_PATH = path.join(ROOT, 'data/tourapi/reports/busan/busan-final-metrics.json');
const HANDOFF_PATH = path.join(ROOT, 'docs/tourapi/busan-handoff-to-main-pc.md');
const CAND_JSON    = path.join(ROOT, 'data/tourapi/candidates/busan/busan-integrated-candidates.json');
const AUDIT_CSV    = path.join(ROOT, 'data/tourapi/candidates/busan/busan-image-rights-audit.csv');

// 정본 파일 크기 스냅샷
const snap = {
  candJson: fs.statSync(CAND_JSON).size,
  auditCsv: fs.statSync(AUDIT_CSV).size,
};

// ── 파일 읽기 ────────────────────────────────────────────
const metricsRaw = fs.readFileSync(METRICS_PATH, 'utf8');
const handoffRaw = fs.readFileSync(HANDOFF_PATH, 'utf8').replace(/\r\n/g, '\n');

// ── metrics JSON 파싱 ─────────────────────────────────────
let m;
try { m = JSON.parse(metricsRaw); }
catch (e) { hardStop('metrics JSON 파싱 실패: ' + e.message); }

// ── HARD STOP: 사전 검증 ─────────────────────────────────
if (m.final_candidate_counts.active_operational !== 1642)
  hardStop(`활성 후보 이상: ${m.final_candidate_counts.active_operational}`);
if (543 + 958 + 141 !== 1642) hardStop('KTO+VB+no_image 합계 이상');
if (m.subcategory_manual_review.count !== 15)
  hardStop(`manual_review 수 이상: ${m.subcategory_manual_review.count}`);
if (!m.key_files || !m.pipeline_scripts)
  hardStop('key_files 또는 pipeline_scripts 섹션 미발견');

// ── [1] key_files 3개 추가 ────────────────────────────────
m.key_files.image_rights_audit         = 'data/tourapi/candidates/busan/busan-image-rights-audit.csv';
m.key_files.image_rights_linkage_audit = 'data/tourapi/reports/busan/busan-image-rights-linkage-audit.csv';
m.key_files.manual_review_decisions    = 'data/tourapi/reports/busan/busan-manual-review-decisions.csv';

// ── [2] audit_scripts 섹션 신규 추가 (pipeline_scripts와 별도) ──
m.audit_scripts = [
  {
    task:   'TASK-20A-3',
    script: 'scripts/tourapi-busan-image-rights-linkage-20a3.mjs',
    role:   '이미지 권리 링키지 감사 — 활성 후보 1,642건 linkage_status 매핑',
    type:   'audit_once',
    note:   '정기 배치 아님. 일회성 감사 스크립트.',
  },
  {
    task:   'TASK-20A-4',
    script: 'scripts/tourapi-busan-kto-rights-apply-20a4.mjs',
    role:   'KTO 543건 cpyrhtDivCd → busan-image-rights-audit.csv 반영',
    type:   'audit_once',
    note:   '정기 배치 아님. 일회성 판정 스크립트.',
  },
  {
    task:   'TASK-20A-6',
    script: 'scripts/tourapi-busan-exception-review-20a6.mjs',
    role:   'subcategory manual_review 15건 + busan-A-00064 병합 검토 권고',
    type:   'audit_once',
    note:   '정기 배치 아님. 일회성 판정 스크립트.',
  },
];

// ── [3] mobile_program 갱신 ───────────────────────────────
m.subcategory_manual_review.by_evidence.mobile_program = {
  count:                      5,
  recommendation:             'reclassify_to_nature_outdoor_activity',
  auto_apply_possible:        2,
  manual_confirm_recommended: 3,
  auto_apply_ids:             ['busan-K-00378', 'busan-K-00383'],
  manual_confirm_ids:         ['busan-K-00422', 'busan-K-00688', 'busan-K-00708'],
  manual_confirm_reason:      '동일 주소(해운대 해변로 84, 해운대 마리나) 3건 — 중복 운영 여부 확인 필요',
  decided_at:                 'TASK-DATA-BUSAN-EXCEPTION-REVIEW-20A-6',
  decision_date:              '2026-07-26',
};

// ── [4] camping_in_nature 갱신 ────────────────────────────
m.subcategory_manual_review.by_evidence.camping_in_nature = {
  count:                      10,
  recommendation:             'reclassify_to_accommodation_camping',
  auto_apply_possible:        10,
  manual_confirm_recommended: 0,
  ids: [
    'busan-K-00309','busan-K-00311','busan-K-00315',
    'busan-K-00316','busan-K-00317','busan-K-00320',
    'busan-K-00321','busan-K-00325','busan-VB-2142','busan-VB-1852',
  ],
  decided_at:    'TASK-DATA-BUSAN-EXCEPTION-REVIEW-20A-6',
  decision_date: '2026-07-26',
};

// known_limitations[0] 구버전 문구 갱신 (subcategory_manual_review와 일관성)
const oldLimitText = '의도적 manual_review unknown 13건: camping_in_nature 8건(→ accommodation/camping 권장), mobile_program 5건(고정 장소 없음, 제외 여부 결정 필요). subcategory_manual_review 섹션 참조.';
const newLimitText = '의도적 manual_review unknown 13건: camping_in_nature 8건(subcategory=unknown, TASK-20A-6 결정: reclassify → accommodation/camping, auto_apply 가능), mobile_program 5건(TASK-20A-6 결정: reclassify → nature/outdoor_activity, 서핑 2건 auto/요트 3건 manual_confirm). 결정서: busan-manual-review-decisions.csv 참조.';
const limitIdx = m.known_limitations.indexOf(oldLimitText);
if (limitIdx === -1) hardStop('known_limitations 구버전 문구 미발견');
m.known_limitations[limitIdx] = newLimitText;

// ── [5] merge_audit_results 섹션 신규 추가 ───────────────
m.merge_audit_results = {
  generated_at: 'TASK-DATA-BUSAN-EXCEPTION-REVIEW-20A-6',
  audit_date:   '2026-07-26',
  items: [
    {
      canonical_id:                 'busan-A-00064',
      canonical_title:              '부산영화체험박물관/씨네뮤지엄',
      sources:                      ['busan-VBM-367', 'busan-VBM-1640'],
      recommendation:               'same_place',
      confidence:                   'high',
      preferred_enrichment_source:  'busan-VBM-367',
      duplicate_candidate:          'busan-VBM-1640',
      auto_merge:                   false,
      main_pc_confirmation_required:true,
      evidence:                     '세 항목 동일 주소(중구 대청로126번길 12). VBM-367(attraction)/VBM-1640(experience)는 동일 시설 중복 등재.',
    },
  ],
};

// ── [6] image_rights_audit 섹션 신규 추가 ────────────────
m.image_rights_audit = {
  generated_at:  'TASK-20A-3 ~ TASK-20A-6',
  audit_date:    '2026-07-26',
  total_active:  1642,
  kto: {
    count:               543,
    source_domain:       'tong.visitkorea.or.kr',
    kogl_type1:          75,
    kogl_type3:          468,
    operational_decision:'usable',
    evidence_level:      'item_verified',
    license_basis:       'cpyrhtDivCd (KTO raw API)',
    attribution_required:true,
  },
  visitbusan: {
    count:                   958,
    source_domain:           'www.visitbusan.net',
    operational_decision:    'review_required',
    evidence_level:          'domain_inferred',
    license_basis:           'All Rights Reserved (부산광역시) — 개별 공공누리 마크 미확인',
    auto_detection_feasible: false,
    note:                    'Playwright 사전 점검(PRECHECK-20A-5A): KOGL 마크 미탐지. 기관 허가 필요.',
  },
  no_image: {
    count: 141,
  },
  audit_files: {
    rights_audit_csv:        'data/tourapi/candidates/busan/busan-image-rights-audit.csv',
    linkage_audit_csv:       'data/tourapi/reports/busan/busan-image-rights-linkage-audit.csv',
    manual_review_decisions: 'data/tourapi/reports/busan/busan-manual-review-decisions.csv',
  },
};

// image_status.license 갱신 (image_rights_audit와 일관성)
if (m.image_status && m.image_status.license) {
  m.image_status.license.visitbusan   = 'review_required (domain_inferred). All Rights Reserved — 개별 공공누리 마크 미확인. 기관 허가 필요. TASK-20A 감사 완료.';
  m.image_status.license.tourapi_kto  = 'KOGL 1유형 75건 + KOGL 3유형 468건. usable (item_verified). 출처 표시 필수. TASK-20A-4 확인 완료.';
}

// 타임스탬프 갱신
m.updated_at            = '2026-07-26';
m.current_snapshot_task = 'TASK-DATA-BUSAN-AUDIT-SYNC-20A-7';

// JSON 직렬화 + 검증
const metricsOut = JSON.stringify(m, null, 2);
try { JSON.parse(metricsOut); } catch (e) { hardStop('출력 JSON 파싱 실패: ' + e.message); }

// 원자 쓰기
fs.writeFileSync(METRICS_PATH + '.tmp', metricsOut, 'utf8');
fs.renameSync(METRICS_PATH + '.tmp', METRICS_PATH);
console.log('metrics JSON 갱신 완료');

// ── handoff 문서 수정 ────────────────────────────────────
let hd = handoffRaw;

// [A] Section 3: manual_review 블록 전체 교체
const hdOld_A = `**manual_review 15건:**
- camping_in_nature:10 — category=nature지만 캠핑/글램핑/카라반 → accommodation/camping 권장
- mobile_program:5 — 서핑학교·요트투어 (고정 장소 없음) → 제외 여부 결정 필요`;

const hdNew_A = `**manual_review 15건 — TASK-20A-6 결정 완료:**
- camping_in_nature:10 → reclassify accommodation/camping (auto_apply 10건 모두 가능)
- mobile_program:5 → reclassify nature/outdoor_activity
  - 서핑 2건 (busan-K-00378, 00383): auto_apply possible — 고정 사업장 주소 확인
  - 요트 3건 (busan-K-00422, 00688, 00708): manual_confirm_recommended — 동일 주소(해운대 마리나) 중복 여부 확인 필요`;

if (!hd.includes(hdOld_A)) hardStop('handoff Section 3 manual_review 블록 미발견');
hd = hd.replace(hdOld_A, hdNew_A);

// [B] Section 7: subcategory manual_review 행 교체
const hdOld_B = '| subcategory manual_review 15건 | camping_in_nature 10건(accommodation/camping 권장), mobile_program 5건(제외 여부 결정 필요). `data/tourapi/candidates/busan/busan-subcategory-manual-review.csv` 참조. |';
const hdNew_B = '| subcategory manual_review 15건 (TASK-20A-6 결정 완료) | camping 10건: reclassify → accommodation/camping (auto 10). mobile_program 5건: reclassify → nature/outdoor_activity (서핑 2건 auto_apply, 요트 3건 manual_confirm_recommended). 결정서: `data/tourapi/reports/busan/busan-manual-review-decisions.csv` |';

if (!hd.includes(hdOld_B)) hardStop('handoff Section 7 subcategory manual_review 행 미발견');
hd = hd.replace(hdOld_B, hdNew_B);

// [C] Section 7: 이미지 license 행 교체
const hdOld_C = '| 이미지 license | visitbusan 이미지는 `all_rights_reserved_visitbusan` — 상업 사용 전 권리 확인 필요 |';
const hdNew_C = '| 이미지 권리 감사 (TASK-20A 완료) | KTO 543건: usable (KOGL 1유형 75건·3유형 468건, item_verified, 출처 표시 필수). VisitBusan 958건: review_required (domain_inferred, 개별 공공누리 미탐지 — 기관 허가 필요). no_image 141건. 상세: `data/tourapi/candidates/busan/busan-image-rights-audit.csv` |';

if (!hd.includes(hdOld_C)) hardStop('handoff Section 7 이미지 license 행 미발견');
hd = hd.replace(hdOld_C, hdNew_C);

// [D] Section 11 신규 추가 (마지막 이상입니다 직전)
const section11 = `---

## 11. 이미지 권리 감사 결과 (TASK-20A 시리즈, 2026-07-26)

| 공급자 | 건수 | 권리 판정 | 근거 |
|---|---|---|---|
| KTO TourAPI | **543** | **usable** | cpyrhtDivCd (KOGL 1유형 75건·3유형 468건), item_verified |
| VisitBusan | **958** | **review_required** | All Rights Reserved, 개별 공공누리 미탐지, domain_inferred |
| no_image | **141** | — | 이미지 없음 |

**KTO 사용 조건 (KOGL 공통):** 출처 표시 필수 (기관명·저작연도·저작물명·링크). 1유형: 수정 허용. 3유형: 수정 금지.

**VisitBusan 조치 옵션:** KTO 이미지로 대체, 기관 서면 허가, 또는 placeholder 처리. 개별 공공누리 마크 확인 전 상업 사용 불가.

### busan-A-00064 병합 감사

| 항목 | 내용 |
|---|---|
| canonical | busan-A-00064 (부산영화체험박물관/씨네뮤지엄) |
| 판정 | **same_place** (신뢰도: high) |
| 보강 권고 | VBM-367(attraction) 정보로 busan-A-00064 보강 |
| 중복 제거 권고 | VBM-1640(experience) — 동일 시설 중복 등재 |
| 자동 병합 | **금지** — 메인 노트북 수동 확인 필요 |

### 관련 파일

| 파일 | 설명 |
|---|---|
| \`data/tourapi/candidates/busan/busan-image-rights-audit.csv\` | 1,642건 전체 권리 판정 (정본) |
| \`data/tourapi/reports/busan/busan-image-rights-linkage-audit.csv\` | 링키지 감사 원본 |
| \`data/tourapi/reports/busan/busan-manual-review-decisions.csv\` | manual_review 15건 결정 |
| \`docs/tourapi/busan-exception-review-20a6.md\` | 예외 검토 보고서 |

`;

const insertBefore = '\n이상입니다. 추가 질문은';
if (!hd.includes(insertBefore)) hardStop('handoff 마지막 문장 미발견');
hd = hd.replace(insertBefore, '\n' + section11 + '이상입니다. 추가 질문은');

// ── 검증 ─────────────────────────────────────────────────
if (hd.includes('고정 장소 없음'))
  hardStop('구버전 "고정 장소 없음" 문구 잔존');
if (hd.includes('제외 여부 결정 필요'))
  hardStop('구버전 "제외 여부 결정 필요" 문구 잔존');
if (!hd.includes('KTO 543건'))
  hardStop('handoff KTO 543건 수치 미발견');
if (!hd.includes('VisitBusan 958건'))
  hardStop('handoff VisitBusan 958건 수치 미발견');
if (!hd.includes('## 11. 이미지 권리 감사 결과'))
  hardStop('handoff Section 11 미발견');

// 원자 쓰기
fs.writeFileSync(HANDOFF_PATH + '.tmp', hd, 'utf8');
fs.renameSync(HANDOFF_PATH + '.tmp', HANDOFF_PATH);
console.log('handoff 문서 갱신 완료');

// ── 정본 무변경 확인 ─────────────────────────────────────
if (fs.statSync(CAND_JSON).size !== snap.candJson) hardStop('통합 후보 JSON 변경 감지');
if (fs.statSync(AUDIT_CSV).size !== snap.auditCsv) hardStop('audit CSV 변경 감지');

// ── 최종 검증: JSON 재파싱 ────────────────────────────────
try {
  const reread = fs.readFileSync(METRICS_PATH, 'utf8');
  JSON.parse(reread);
} catch(e) { hardStop('최종 metrics JSON 재파싱 실패: ' + e.message); }

// ── 최종 보고 ─────────────────────────────────────────────
console.log('\n==========================================');
console.log('TASK-DATA-BUSAN-AUDIT-SYNC-20A-7');
console.log('==========================================');
console.log('');
console.log('[ 수정 파일 ]');
console.log('  data/tourapi/reports/busan/busan-final-metrics.json');
console.log('  docs/tourapi/busan-handoff-to-main-pc.md');
console.log('');
console.log('[ metrics 갱신 섹션 ]');
console.log('  key_files +3: image_rights_audit, image_rights_linkage_audit, manual_review_decisions');
console.log('  audit_scripts: 신규 섹션 3개 (type=audit_once, pipeline_scripts와 분리)');
console.log('  subcategory_manual_review.mobile_program: reclassify_to_nature_outdoor_activity (auto:2, manual:3)');
console.log('  subcategory_manual_review.camping_in_nature: reclassify_to_accommodation_camping (auto:10)');
console.log('  known_limitations[0]: 구버전 문구 → 결정 결과 반영');
console.log('  image_status.license: KTO usable / VB review_required 갱신');
console.log('  merge_audit_results: 신규 섹션 (busan-A-00064 same_place, auto_merge:false)');
console.log('  image_rights_audit: 신규 섹션 (KTO:543 usable, VB:958 review_required, no_image:141)');
console.log('  updated_at: 2026-07-26');
console.log('  current_snapshot_task: TASK-DATA-BUSAN-AUDIT-SYNC-20A-7');
console.log('');
console.log('[ handoff 갱신 ]');
console.log('  Section 3: manual_review 블록 교체 (결정 완료 반영)');
console.log('  Section 7: subcategory manual_review 행 교체');
console.log('  Section 7: 이미지 license 행 → 이미지 권리 감사 행 교체');
console.log('  Section 11: 신규 추가 (이미지 권리 감사 결과 + busan-A-00064)');
console.log('');
console.log('[ 구버전 문구 잔존 ]');
console.log('  "고정 장소 없음": 0건 ✓');
console.log('  "제외 여부 결정 필요": 0건 ✓');
console.log('');
console.log('[ 정합성 검증 ]');
console.log('  활성 후보 1,642 ✓');
console.log('  KTO 543 + VB 958 + no_image 141 = 1,642 ✓');
console.log('  manual_review 15 = auto 12 + manual 3 ✓');
console.log('  metrics와 handoff 수치 일치 ✓');
console.log('  JSON 파싱 성공 ✓');
console.log('');
console.log('[ 정본 무변경 ]');
console.log('  busan-integrated-candidates.json ✓');
console.log('  busan-image-rights-audit.csv ✓');
console.log('');
console.log('git add·commit·push 미실행 ✓');
console.log('');
console.log('TASK-DATA-BUSAN-AUDIT-SYNC-20A-7 부산 감사 결과 metrics·handoff 동기화 완료 — 정본 반영·commit·push 보류.');
