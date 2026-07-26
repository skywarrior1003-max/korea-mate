/**
 * TASK-DATA-BUSAN-EXCEPTION-REVIEW-20A-6
 * manual_review 15건 + busan-A-00064 병합 검토 → 권고 보고서
 * 기존 정본 파일 수정 없음
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

const CAND_JSON   = path.join(ROOT, 'data/tourapi/candidates/busan/busan-integrated-candidates.json');
const MR_CSV      = path.join(ROOT, 'data/tourapi/candidates/busan/busan-subcategory-manual-review.csv');
const OUT_CSV     = path.join(ROOT, 'data/tourapi/reports/busan/busan-manual-review-decisions.csv');
const OUT_MD      = path.join(ROOT, 'docs/tourapi/busan-exception-review-20a6.md');
const TMP_CSV     = OUT_CSV + '.tmp';
const TMP_MD      = OUT_MD  + '.tmp';

const SNAP_JSON   = fs.statSync(CAND_JSON).size;
const SNAP_MR     = fs.statSync(MR_CSV).size;
const AUDIT_DATE  = '2026-07-26';

// ── 원본 데이터 로드 ──────────────────────────────────────
const candidates = JSON.parse(fs.readFileSync(CAND_JSON, 'utf8'));
const candMap = new Map(candidates.map(r => [r.candidate_id, r]));

const mrCsv = fs.readFileSync(MR_CSV, 'utf8');
const mrLines = mrCsv.split('\n').filter(Boolean);
const mrIds = mrLines.slice(1).map(l => l.split(',')[0]);
if (mrIds.length !== 15) hardStop(`manual_review CSV 건수 이상: ${mrIds.length} (기대 15)`);

// ── 결정 데이터 ───────────────────────────────────────────
// 권고 결정: keep / reclassify / exclude / insufficient_evidence
const decisions = [
  // ─── camping_in_nature 8건 (busan-K, subcategory=unknown) ───
  {
    candidate_id:       'busan-K-00309',
    cur_category:       'nature',
    cur_subcategory:    'unknown',
    rec_category:       'accommodation',
    rec_subcategory:    'camping',
    recommendation:     'reclassify',
    evidence:           '시설명 "야영장"은 캠핑시설을 명시. 고정 주소 확인(중구 이순신대로 72). content_type=레포츠이나 실제 숙박/야영 시설.',
    source_url:         'https://www.data.go.kr/data/15101578/openapi.do (contentid:2726803)',
    auto_apply:         'possible',
  },
  {
    candidate_id:       'busan-K-00311',
    cur_category:       'nature',
    cur_subcategory:    'unknown',
    rec_category:       'accommodation',
    rec_subcategory:    'camping',
    evidence:           '시설명 "캠핑장" 명시. 고정 주소 확인(강서구 체육공원로6번길 184).',
    recommendation:     'reclassify',
    source_url:         'https://www.data.go.kr/data/15101578/openapi.do (contentid:2729157)',
    auto_apply:         'possible',
  },
  {
    candidate_id:       'busan-K-00315',
    cur_category:       'nature',
    cur_subcategory:    'unknown',
    rec_category:       'accommodation',
    rec_subcategory:    'camping',
    evidence:           '시설명 "캠핑장" 명시. 고정 주소 확인(기장군 정관읍 병산1길 18).',
    recommendation:     'reclassify',
    source_url:         'https://www.data.go.kr/data/15101578/openapi.do (contentid:2734175)',
    auto_apply:         'possible',
  },
  {
    candidate_id:       'busan-K-00316',
    cur_category:       'nature',
    cur_subcategory:    'unknown',
    rec_category:       'accommodation',
    rec_subcategory:    'camping',
    evidence:           '시설명 "장안캠프"는 캠프(캠핑) 시설. 고정 주소 확인(기장군 장안읍 장안로 18).',
    recommendation:     'reclassify',
    source_url:         'https://www.data.go.kr/data/15101578/openapi.do (contentid:2734243)',
    auto_apply:         'possible',
  },
  {
    candidate_id:       'busan-K-00317',
    cur_category:       'nature',
    cur_subcategory:    'unknown',
    rec_category:       'accommodation',
    rec_subcategory:    'camping',
    evidence:           '시설명 "오토캠핑장" 명시. 고정 주소 확인(북구 낙동강자전거길 1425).',
    recommendation:     'reclassify',
    source_url:         'https://www.data.go.kr/data/15101578/openapi.do (contentid:2734674)',
    auto_apply:         'possible',
  },
  {
    candidate_id:       'busan-K-00320',
    cur_category:       'nature',
    cur_subcategory:    'unknown',
    rec_category:       'accommodation',
    rec_subcategory:    'camping',
    evidence:           '시설명 "글램핑"은 캠핑 변형. 고정 주소 확인(기장군 일광읍 이천8길 132-20).',
    recommendation:     'reclassify',
    source_url:         'https://www.data.go.kr/data/15101578/openapi.do (contentid:2741526)',
    auto_apply:         'possible',
  },
  {
    candidate_id:       'busan-K-00321',
    cur_category:       'nature',
    cur_subcategory:    'unknown',
    rec_category:       'accommodation',
    rec_subcategory:    'camping',
    evidence:           '시설명 "카라반파크"는 카라반 캠핑시설. 고정 주소 확인(기장군 일광면 일광로 763).',
    recommendation:     'reclassify',
    source_url:         'https://www.data.go.kr/data/15101578/openapi.do (contentid:2741535)',
    auto_apply:         'possible',
  },
  {
    candidate_id:       'busan-K-00325',
    cur_category:       'nature',
    cur_subcategory:    'unknown',
    rec_category:       'accommodation',
    rec_subcategory:    'camping',
    evidence:           '시설명 "카라반"은 카라반 캠핑시설. 고정 주소 확인(기장군 장안읍 해맞이로 290).',
    recommendation:     'reclassify',
    source_url:         'https://www.data.go.kr/data/15101578/openapi.do (contentid:2747589)',
    auto_apply:         'possible',
  },
  // ─── mobile_program 5건 (busan-K, subcategory=unknown) ───
  {
    candidate_id:       'busan-K-00378',
    cur_category:       'nature',
    cur_subcategory:    'unknown',
    rec_category:       'nature',
    rec_subcategory:    'outdoor_activity',
    evidence:           '서핑 스쿨. 고정 주소 확인(수영구 광안해변로 125). 관광객이 직접 찾아가는 고정 위치 레저시설. "no_fixed_spot" 자동 분류 오류.',
    recommendation:     'reclassify',
    source_url:         'https://www.data.go.kr/data/15101578/openapi.do (contentid:2783308)',
    auto_apply:         'possible',
  },
  {
    candidate_id:       'busan-K-00383',
    cur_category:       'nature',
    cur_subcategory:    'unknown',
    rec_category:       'nature',
    rec_subcategory:    'outdoor_activity',
    evidence:           '서핑 스쿨. 고정 주소 확인(해운대구 송정해변로 34-8). 고정 위치 레저시설.',
    recommendation:     'reclassify',
    source_url:         'https://www.data.go.kr/data/15101578/openapi.do (contentid:2784112)',
    auto_apply:         'possible',
  },
  {
    candidate_id:       'busan-K-00422',
    cur_category:       'nature',
    cur_subcategory:    'unknown',
    rec_category:       'nature',
    rec_subcategory:    'outdoor_activity',
    evidence:           '요트투어 운영사. 고정 출발지(해운대 해변로 84, 해운대 마리나). 관광객이 예약·탑승하는 고정 장소. [주의: 00688·00708과 동일 주소 — 중복 3건 운영 여부 확인 권고]',
    recommendation:     'reclassify',
    source_url:         'https://www.data.go.kr/data/15101578/openapi.do (contentid:2790332)',
    auto_apply:         'manual_confirm_recommended',
  },
  {
    candidate_id:       'busan-K-00688',
    cur_category:       'nature',
    cur_subcategory:    'unknown',
    rec_category:       'nature',
    rec_subcategory:    'outdoor_activity',
    evidence:           '요트투어 운영사. 고정 출발지(해운대 해변로 84, 해운대 마리나). [주의: 00422·00708과 동일 주소 — 3건 중복 운영 여부 확인 권고]',
    recommendation:     'reclassify',
    source_url:         'https://www.data.go.kr/data/15101578/openapi.do (contentid:3009050)',
    auto_apply:         'manual_confirm_recommended',
  },
  {
    candidate_id:       'busan-K-00708',
    cur_category:       'nature',
    cur_subcategory:    'unknown',
    rec_category:       'nature',
    rec_subcategory:    'outdoor_activity',
    evidence:           '요트투어 운영사. 고정 출발지(해운대 해변로 84, 해운대 마리나). [주의: 00422·00688과 동일 주소 — 3건 중복 운영 여부 확인 권고]',
    recommendation:     'reclassify',
    source_url:         'https://www.data.go.kr/data/15101578/openapi.do (contentid:3065360)',
    auto_apply:         'manual_confirm_recommended',
  },
  // ─── camping_in_nature 2건 (busan-VB, subcategory=other_nature) ───
  {
    candidate_id:       'busan-VB-2142',
    cur_category:       'nature',
    cur_subcategory:    'other_nature',
    rec_category:       'accommodation',
    rec_subcategory:    'camping',
    evidence:           '시설명 "천성항 노지 캠핑장" — 캠핑장 명시. 고정 주소(강서구 천성동 3435). content_type=experience이나 야영 시설.',
    recommendation:     'reclassify',
    source_url:         'https://www.visitbusan.net/kr/index.do?menuCd=DOM_000000202008001000&uc_seq=2142&lang_cd=ko',
    auto_apply:         'possible',
  },
  {
    candidate_id:       'busan-VB-1852',
    cur_category:       'nature',
    cur_subcategory:    'other_nature',
    rec_category:       'accommodation',
    rec_subcategory:    'camping',
    evidence:           '시설명 "힐링야영장" — 야영장(캠핑) 명시. 고정 주소(동구 초량동 1185-1). content_type=experience이나 야영 시설.',
    recommendation:     'reclassify',
    source_url:         'https://www.visitbusan.net/kr/index.do?menuCd=DOM_000000202008001000&uc_seq=1852&lang_cd=ko',
    auto_apply:         'possible',
  },
];

// ── HARD STOP: 결정 수 확인 ──────────────────────────────
if (decisions.length !== 15) hardStop(`결정 건수 이상: ${decisions.length} (기대 15)`);

const decisionIds = decisions.map(d => d.candidate_id);
const missingIds = mrIds.filter(id => !decisionIds.includes(id));
if (missingIds.length > 0) hardStop(`결정 누락 candidate_id: ${missingIds.join(', ')}`);

// 근거 없는 결정 확인
const noEvidence = decisions.filter(d => !d.evidence || d.evidence.length < 10);
if (noEvidence.length > 0) hardStop(`근거 미비: ${noEvidence.map(d=>d.candidate_id).join(', ')}`);

// 권고값 확인
const validRec = ['keep','reclassify','exclude','insufficient_evidence'];
const badRec = decisions.filter(d => !validRec.includes(d.recommendation));
if (badRec.length > 0) hardStop(`잘못된 권고값: ${badRec.map(d=>d.candidate_id+':'+d.recommendation).join(', ')}`);

// ── busan-A-00064 병합 권고 ──────────────────────────────
const a64    = candMap.get('busan-A-00064');
const vbm367 = candMap.get('busan-VBM-367');
const vbm1640= candMap.get('busan-VBM-1640');

if (!a64 || !vbm367 || !vbm1640)
  hardStop('busan-A-00064 / VBM-367 / VBM-1640 중 하나 이상 미발견');

const mergeDecision = {
  subject:        'busan-A-00064 병합 감사',
  canonical_id:   'busan-A-00064',
  canonical_name: a64.title_ko,
  canonical_addr: a64.address,
  vbm367_id:      vbm367.candidate_id,
  vbm367_name:    vbm367.title_ko,
  vbm367_addr:    vbm367.address,
  vbm367_type:    vbm367.content_type,
  vbm1640_id:     vbm1640.candidate_id,
  vbm1640_name:   vbm1640.title_ko,
  vbm1640_addr:   vbm1640.address,
  vbm1640_type:   vbm1640.content_type,
  verdict:        'same_place',
  confidence:     'high',
  evidence:
    '세 후보 모두 동일 주소(중구 대청로126번길 12). ' +
    'VBM-367("부산영화체험박물관 feat.씨네뮤지엄", attraction)·' +
    'VBM-1640("부산영화체험박물관", experience) — 동일 시설을 VB에서 attraction/experience 두 카테고리로 중복 등재. ' +
    '씨네뮤지엄(cinema museum)은 부산영화체험박물관 내 전시관이므로 별도 시설 아님.',
  auto_merge: false,
  merge_note:
    'VBM-367의 hours·phone·source_detail_url을 busan-A-00064에 보강 가능. ' +
    'VBM-1640은 중복 제거 권고. 자동 병합 금지 — 메인 노트북에서 수동 확인 후 진행.',
};

// ── CSV 생성 ─────────────────────────────────────────────
function escapeCsv(val) {
  const s = (val == null) ? '' : String(val);
  return (s.includes(',') || s.includes('"') || s.includes('\n'))
    ? '"' + s.replace(/"/g, '""') + '"' : s;
}

const CSV_COLS = [
  'candidate_id','cur_category','cur_subcategory',
  'rec_category','rec_subcategory','recommendation',
  'evidence','source_url','auto_apply',
];

const csvLines = [
  CSV_COLS.join(','),
  ...decisions.map(d => CSV_COLS.map(c => escapeCsv(d[c])).join(',')),
];

fs.writeFileSync(TMP_CSV, csvLines.join('\n'), 'utf8');
const tmpCsvLineCount = fs.readFileSync(TMP_CSV, 'utf8').split('\n').length;
if (tmpCsvLineCount !== 16) {
  fs.unlinkSync(TMP_CSV);
  hardStop(`임시 CSV 행수 이상: ${tmpCsvLineCount} (기대 16)`);
}
fs.renameSync(TMP_CSV, OUT_CSV);

// ── 통계 집계 ─────────────────────────────────────────────
const subcatUnknown     = decisions.filter(d => d.cur_subcategory === 'unknown').length;
const subcatOtherNature = decisions.filter(d => d.cur_subcategory === 'other_nature').length;
const campingCount      = decisions.filter(d => d.evidence.includes('야영장') || d.evidence.includes('캠핑') || d.evidence.includes('글램핑') || d.evidence.includes('카라반')).length;
const mobileProg        = decisions.filter(d => d.rec_subcategory === 'outdoor_activity').length;
const recReclassify     = decisions.filter(d => d.recommendation === 'reclassify').length;
const recKeep           = decisions.filter(d => d.recommendation === 'keep').length;
const recExclude        = decisions.filter(d => d.recommendation === 'exclude').length;
const autoOk            = decisions.filter(d => d.auto_apply === 'possible').length;
const autoManual        = decisions.filter(d => d.auto_apply === 'manual_confirm_recommended').length;

// ── MD 보고서 ─────────────────────────────────────────────
const md = `# 부산 예외 후보 검토 보고서

**작성일:** ${AUDIT_DATE}
**작성:** TASK-DATA-BUSAN-EXCEPTION-REVIEW-20A-6
**목적:** manual_review 15건 + busan-A-00064 병합 권고

---

## 1. manual_review 15건 집계

| 구분 | 건수 |
|---|---|
| 전체 manual_review | **15** |
| subcategory=unknown | **${subcatUnknown}** (busan-K-* 13건) |
| subcategory=other_nature | **${subcatOtherNature}** (busan-VB-* 2건) |
| camping 계열 (캠핑·글램핑·카라반·야영장) | **10** |
| mobile_program 계열 (서핑·요트) | **5** |

---

## 2. 권고 결과 분포

| 권고 | 건수 |
|---|---|
| reclassify | **${recReclassify}** |
| keep | **${recKeep}** |
| exclude | **${recExclude}** |
| insufficient_evidence | **0** |

| 자동 반영 가능 여부 | 건수 |
|---|---|
| possible | **${autoOk}** |
| manual_confirm_recommended | **${autoManual}** |

---

## 3. camping 계열 10건 권고

모두 **reclassify → accommodation/camping**.

| candidate_id | 현재 subcategory | 시설명 | 근거 요약 |
|---|---|---|---|
| busan-K-00309 | unknown | 부산항힐링야영장 | 야영장, 고정 주소 확인 |
| busan-K-00311 | unknown | 대저캠핑장 | 캠핑장 명시 |
| busan-K-00315 | unknown | 초원숲속캠핑장 | 캠핑장 명시 |
| busan-K-00316 | unknown | 장안캠프 | 캠프=캠핑 시설 |
| busan-K-00317 | unknown | 화명오토캠핑장 | 오토캠핑장 명시 |
| busan-K-00320 | unknown | 제이스글램핑 | 글램핑=캠핑 변형 |
| busan-K-00321 | unknown | 임랑카라반파크 | 카라반=캠핑 시설 |
| busan-K-00325 | unknown | 더무빙 카라반 | 카라반 명시 |
| busan-VB-2142 | other_nature | 천성항 노지 캠핑장 | 캠핑장 명시, VB experience 중복 등재 |
| busan-VB-1852 | other_nature | 부산항 힐링야영장 | 야영장 명시, VB experience 중복 등재 |

**자동 반영:** 10건 모두 possible (시설명 키워드+고정 주소 확인).

---

## 4. mobile_program 계열 5건 권고

모두 **reclassify → nature/outdoor_activity**.

자동 분류기가 "mobile_program:no_fixed_spot"으로 분류했으나, 전 항목에 고정 주소가 존재하며 관광객이 직접 방문하는 레저시설입니다.

| candidate_id | 시설명 | 주소 | 비고 |
|---|---|---|---|
| busan-K-00378 | 서프마린 | 수영구 광안해변로 125 | 서핑 스쿨, 고정 위치 |
| busan-K-00383 | 송정서핑학교 | 해운대구 송정해변로 34-8 | 서핑 스쿨, 고정 위치 |
| busan-K-00422 | 부산요트투어 3355마린 | 해운대 해변로 84 | **동일 주소 3건 주의** |
| busan-K-00688 | 부산요트투어 고고요트 | 해운대 해변로 84 | **동일 주소 3건 주의** |
| busan-K-00708 | 부산 요트투어 요트야 | 해운대 해변로 84 | **동일 주소 3건 주의** |

**요트투어 3건 주의:** 동일 주소(해운대 마리나)를 공유하는 별개 운영사. DB 반영 시 중복 여부 메인 노트북에서 수동 확인 권고. 자동 반영: **manual_confirm_recommended**.

---

## 5. busan-A-00064 병합 감사

### 비교 대상

| 항목 | busan-A-00064 | busan-VBM-367 | busan-VBM-1640 |
|---|---|---|---|
| 시설명 | 부산영화체험박물관/씨네뮤지엄 | 부산영화체험박물관 feat.씨네뮤지엄 | 부산영화체험박물관 |
| 주소 | 중구 대청로126번길 12 | 중구 대청로126번길 12 | 중구 대청로126번길 12 |
| content_type | (없음) | attraction | experience |
| candidate_status | api_only_existing | merge_existing | merge_existing |

### 판정

**same_place — 신뢰도: high**

- 세 항목 모두 동일 주소
- VBM-367(attraction)·VBM-1640(experience)은 동일 시설을 VisitBusan에서 두 카테고리로 중복 등재한 것
- 씨네뮤지엄은 부산영화체험박물관 내부 전시관 — 별도 시설이 아님

### 권고 처치

| 항목 | 권고 |
|---|---|
| busan-A-00064 | 유지. VBM-367의 hours·phone·source_detail_url로 보강 가능 |
| busan-VBM-367 | 보강 후 canonical 흡수 (merge_existing 처리) |
| busan-VBM-1640 | 중복 제거 권고 |
| 자동 병합 | **금지** — 메인 노트북 수동 확인 후 진행 |

---

## 6. 정본 파일 무변경 확인

- busan-integrated-candidates.json: ✓ 무변경
- busan-subcategory-manual-review.csv: ✓ 무변경

---

## 7. 산출물

| 파일 | 설명 |
|---|---|
| \`data/tourapi/reports/busan/busan-manual-review-decisions.csv\` | 15건 권고 CSV |
| \`docs/tourapi/busan-exception-review-20a6.md\` | 이 보고서 |

git add·commit·push: 미실행
`;

fs.writeFileSync(TMP_MD, md, 'utf8');
const mdLen = fs.readFileSync(TMP_MD, 'utf8').length;
if (mdLen < 500) {
  fs.unlinkSync(TMP_MD);
  hardStop('MD 파일 내용 이상');
}
fs.renameSync(TMP_MD, OUT_MD);

// ── 정본 무변경 검증 ─────────────────────────────────────
if (fs.statSync(CAND_JSON).size !== SNAP_JSON) hardStop('통합 후보 JSON 크기 변경 감지');
if (fs.statSync(MR_CSV).size   !== SNAP_MR)   hardStop('manual_review CSV 크기 변경 감지');

// ── 최종 보고 ─────────────────────────────────────────────
console.log('\n==========================================');
console.log('TASK-DATA-BUSAN-EXCEPTION-REVIEW-20A-6');
console.log('==========================================');
console.log('');
console.log('[ manual_review 15건 집계 ]');
console.log('  전체:', decisions.length);
console.log('  subcategory=unknown:     ', subcatUnknown);
console.log('  subcategory=other_nature:', subcatOtherNature);
console.log('  camping 계열:            ', campingCount);
console.log('  mobile_program 계열:     ', mobileProg);
console.log('');
console.log('[ 권고 분포 ]');
console.log('  reclassify:              ', recReclassify);
console.log('  keep:                    ', recKeep);
console.log('  exclude:                 ', recExclude);
console.log('  auto_apply possible:     ', autoOk);
console.log('  manual_confirm_needed:   ', autoManual);
console.log('');
console.log('[ busan-A-00064 결론 ]');
console.log('  판정: same_place (신뢰도: high)');
console.log('  VBM-367: merge_existing → canonical 보강 후 흡수');
console.log('  VBM-1640: 중복 제거 권고');
console.log('  자동 병합: 금지 (메인 노트북 수동 확인 필요)');
console.log('');
console.log('[ 변경 파일 ]');
console.log('  data/tourapi/reports/busan/busan-manual-review-decisions.csv (신규)');
console.log('  docs/tourapi/busan-exception-review-20a6.md (신규)');
console.log('');
console.log('정본 파일 무변경 ✓');
console.log('git add·commit·push 미실행 ✓');
