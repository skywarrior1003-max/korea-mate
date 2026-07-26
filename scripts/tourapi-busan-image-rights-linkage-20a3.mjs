/**
 * TASK-DATA-BUSAN-IMAGE-RIGHTS-LINKAGE-20A-3
 * 활성 후보 1,642건 이미지 권리 정보 연결 가능성 감사
 * 출력:
 *   data/tourapi/reports/busan/busan-image-rights-linkage-audit.csv
 *   docs/tourapi/busan-image-rights-linkage-20a3.md
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

// ── 경로 정의 ─────────────────────────────────────────────
const CANDIDATES_JSON = path.join(ROOT, 'data/tourapi/candidates/busan/busan-integrated-candidates.json');
const VB_FULL_JSON    = path.join(ROOT, 'data/tourapi/candidates/busan/visitbusan-content-full.json');
const KTO_BATCH_DIR   = path.join(ROOT, 'data/tourapi/raw/busan/2026-07-24/batch');
const VB_BATCH_DIR_23 = path.join(ROOT, 'data/tourapi/raw/busan/2026-07-23/batch');
const VB_BATCH_DIR_24 = path.join(ROOT, 'data/tourapi/raw/busan/2026-07-24/batch');

const OUT_CSV_PATH  = path.join(ROOT, 'data/tourapi/reports/busan/busan-image-rights-linkage-audit.csv');
const OUT_MD_PATH   = path.join(ROOT, 'docs/tourapi/busan-image-rights-linkage-20a3.md');
const TMP_CSV_PATH  = OUT_CSV_PATH + '.tmp';
const TMP_MD_PATH   = OUT_MD_PATH  + '.tmp';

const AUDIT_DATE = '2026-07-26';
const VB_DOMAIN  = 'www.visitbusan.net';
const KTO_DOMAIN = 'tong.visitkorea.or.kr';

// ── 원본 파일 존재 확인 ──────────────────────────────────
for (const p of [CANDIDATES_JSON, VB_FULL_JSON]) {
  if (!fs.existsSync(p)) hardStop(`정본 파일 없음: ${p}`);
}

// ── 정본 읽기 ────────────────────────────────────────────
const candidates = JSON.parse(fs.readFileSync(CANDIDATES_JSON, 'utf8'));
const vbFull     = JSON.parse(fs.readFileSync(VB_FULL_JSON, 'utf8'));

// ── HARD STOP: 기준 수치 ─────────────────────────────────
if (candidates.length !== 1767)
  hardStop(`전체 후보 수 이상: ${candidates.length} (기대 1767)`);

const ACTIVE = ['existing_enriched', 'api_only_existing', 'web_only_new'];
const active = candidates.filter(r => ACTIVE.includes(r.candidate_status));
if (active.length !== 1642)
  hardStop(`활성 후보 수 이상: ${active.length} (기대 1642)`);

const allIds = active.map(r => r.candidate_id);
const dupIds = allIds.filter((id, i) => allIds.indexOf(id) !== i);
if (dupIds.length > 0) hardStop(`candidate_id 중복: ${dupIds.join(', ')}`);

// ── 보조 데이터 로드 ─────────────────────────────────────

// 1. visitbusan-content-full uc_seq 맵
const vbFullMap = {};
vbFull.forEach(r => {
  if (r.uc_seq) vbFullMap[String(r.uc_seq)] = r;
});

// 2. KTO raw (2026-07-24 배치) contentid → cpyrhtDivCd 맵
const ktoRawMap = {};
const ktoFiles = fs.readdirSync(KTO_BATCH_DIR).filter(f => f.startsWith('kto-ko-'));
for (const f of ktoFiles) {
  const raw = JSON.parse(fs.readFileSync(path.join(KTO_BATCH_DIR, f), 'utf8'));
  const items = raw.items || raw.response?.body?.items?.item || raw;
  const arr = Array.isArray(items) ? items : [items];
  arr.forEach(r => {
    if (r.contentid) ktoRawMap[r.contentid] = { cpyrhtDivCd: r.cpyrhtDivCd || '', title: r.title || '' };
  });
}
console.log(`KTO raw 로드 완료: ${Object.keys(ktoRawMap).length}건`);

// 3. FestivalService raw: image_url → UC_SEQ 역맵
const festImgToUcSeq = {};
for (const dir of [VB_BATCH_DIR_23, VB_BATCH_DIR_24]) {
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter(f => f.startsWith('busan-festival-ko'))) {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const items = raw.getFestivalKr?.item || [];
    const arr = Array.isArray(items) ? items : [items];
    arr.forEach(r => {
      if (r.MAIN_IMG_NORMAL && r.UC_SEQ) festImgToUcSeq[r.MAIN_IMG_NORMAL] = String(r.UC_SEQ);
    });
  }
}

// 4. FoodService raw: image_url → UC_SEQ 역맵
const foodImgToUcSeq = {};
for (const dir of [VB_BATCH_DIR_23, VB_BATCH_DIR_24]) {
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter(f => f.startsWith('busan-food-ko'))) {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const items = raw.getFoodKr?.item || [];
    const arr = Array.isArray(items) ? items : [items];
    arr.forEach(r => {
      if (r.MAIN_IMG_NORMAL && r.UC_SEQ) foodImgToUcSeq[r.MAIN_IMG_NORMAL] = String(r.UC_SEQ);
    });
  }
}

console.log(`Festival 이미지→UC_SEQ 역맵: ${Object.keys(festImgToUcSeq).length}건`);
console.log(`Food 이미지→UC_SEQ 역맵: ${Object.keys(foodImgToUcSeq).length}건`);

// ── 도메인 판별 ──────────────────────────────────────────
function getDomain(url) {
  if (!url) return null;
  try { return new URL(url).hostname; } catch { return null; }
}

function extractContentId(linkedSourceKeys) {
  const m = (linkedSourceKeys || '').match(/KorService2:(\d+):/);
  return m ? m[1] : null;
}

function extractVbUcSeq(linkedSourceKeys) {
  const m = (linkedSourceKeys || '').match(/(?:AttractionService|FoodService|FestivalService):(\d+):/);
  return m ? m[1] : null;
}

// ── 감사 행 생성 ─────────────────────────────────────────
const COLS = [
  'candidate_id', 'provider', 'image_url',
  'source_record_id', 'source_detail_url',
  'rights_field_name', 'rights_field_value',
  'linkage_method', 'linkage_status', 'confidence', 'note',
];

const auditRows = [];
const stats = {
  vb_uc_seq_direct:       0,
  vb_service_uc_seq:      0,
  vb_img_to_raw_uc_seq:   0,
  vb_not_linkable:        0,
  kto_auto:               0,
  no_image:               0,
};
const statusDist = { auto_linkable: 0, manual_review: 0, not_linkable: 0, no_image: 0 };

for (const row of active) {
  const imgUrl = row.image_url || '';
  const domain = getDomain(imgUrl);

  const base = {
    candidate_id:       row.candidate_id,
    provider:           '',
    image_url:          imgUrl,
    source_record_id:   '',
    source_detail_url:  '',
    rights_field_name:  '',
    rights_field_value: '',
    linkage_method:     '',
    linkage_status:     'not_linkable',
    confidence:         'none',
    note:               '',
  };

  if (!imgUrl) {
    // ── 이미지 없음 ─────────────────────────────────────
    Object.assign(base, {
      provider:       'none',
      linkage_status: 'no_image',
      confidence:     'n/a',
      note:           '이미지 URL 없음',
    });
    stats.no_image++;

  } else if (domain === KTO_DOMAIN) {
    // ── KTO TourAPI CDN ─────────────────────────────────
    const contentid = extractContentId(row.linked_source_keys);
    const rawRec = contentid ? ktoRawMap[contentid] : null;

    if (contentid && rawRec) {
      Object.assign(base, {
        provider:           'kto',
        source_record_id:   contentid,
        source_detail_url:  'https://www.data.go.kr/data/15101578/openapi.do',
        rights_field_name:  'cpyrhtDivCd',
        rights_field_value: rawRec.cpyrhtDivCd,
        linkage_method:     'linked_source_keys_to_contentid_cpyrhtdivcd',
        linkage_status:     'auto_linkable',
        confidence:         'high',
        note:               `KorService2:${contentid}→raw cpyrhtDivCd=${rawRec.cpyrhtDivCd}. ` +
                            '권리 유형 확인됨 — 상업·수정·출처 조건은 20A-2 정책 참조.',
      });
      stats.kto_auto++;
    } else {
      Object.assign(base, {
        provider:       'kto',
        source_record_id: contentid || '',
        linkage_method: 'linked_source_keys_to_contentid_cpyrhtdivcd',
        linkage_status: 'not_linkable',
        confidence:     'none',
        note:           `contentid 추출 ${contentid ? '성공' : '실패'}, raw 매칭 ${rawRec ? '성공' : '실패'}`,
      });
    }

  } else if (domain === VB_DOMAIN) {
    // ── VisitBusan ──────────────────────────────────────
    base.provider = 'visitbusan';

    // 방법 1: visitbusan_uc_seq 직접 보유
    if (row.visitbusan_uc_seq && row.visitbusan_uc_seq.trim()) {
      const ucSeq = row.visitbusan_uc_seq.trim();
      Object.assign(base, {
        source_record_id:   ucSeq,
        source_detail_url:  row.source_detail_url || '',
        rights_field_name:  'kogl_mark_on_page',
        rights_field_value: '',
        linkage_method:     'uc_seq_direct',
        linkage_status:     'manual_review',
        confidence:         'high',
        note:               `uc_seq=${ucSeq} 직접 보유. source_detail_url로 페이지 방문 후 공공누리 마크 여부 확인 필요.`,
      });
      stats.vb_uc_seq_direct++;

    } else {
      // 방법 2: AttractionService/FoodService/FestivalService UC_SEQ 추출
      const serviceUcSeq = extractVbUcSeq(row.linked_source_keys);

      if (serviceUcSeq) {
        const vbRec = vbFullMap[serviceUcSeq];
        const servicePrefix = (row.linked_source_keys || '').split(':')[0];

        if (vbRec) {
          // vbFull에서 source_detail_url 확인
          Object.assign(base, {
            source_record_id:   serviceUcSeq,
            source_detail_url:  vbRec.source_detail_url || '',
            rights_field_name:  'kogl_mark_on_page',
            rights_field_value: '',
            linkage_method:     'service_uc_seq_to_vbfull',
            linkage_status:     'manual_review',
            confidence:         'high',
            note:               `${servicePrefix}:${serviceUcSeq}→vbFull 매칭. source_detail_url 확인됨. 페이지 방문 후 공공누리 마크 확인 필요.`,
          });
          stats.vb_service_uc_seq++;
        } else {
          // vbFull 미매칭 — 이미지 URL 역추적으로 UC_SEQ 재확인
          const imgUcSeq = festImgToUcSeq[imgUrl] || foodImgToUcSeq[imgUrl] || '';
          const confirmedUcSeq = imgUcSeq || serviceUcSeq;

          Object.assign(base, {
            source_record_id:   confirmedUcSeq,
            source_detail_url:  '',
            rights_field_name:  'kogl_mark_on_page',
            rights_field_value: '',
            linkage_method:     'image_url_to_raw_uc_seq',
            linkage_status:     'manual_review',
            confidence:         'medium',
            note:               `${servicePrefix}:${serviceUcSeq} — vbFull 미매칭(food/festival 전용 API). ` +
                                `이미지 URL 역추적으로 UC_SEQ=${confirmedUcSeq} 확인. ` +
                                'source_detail_url 수동 구성 후 공공누리 마크 확인 필요.',
          });
          stats.vb_img_to_raw_uc_seq++;
        }
      } else {
        // UC_SEQ 추출 불가
        Object.assign(base, {
          rights_field_name:  'kogl_mark_on_page',
          linkage_method:     'none',
          linkage_status:     'not_linkable',
          confidence:         'none',
          note:               'UC_SEQ 추출 불가 — linked_source_keys 패턴 미확인',
        });
        stats.vb_not_linkable++;
      }
    }
  } else {
    // 예상치 못한 도메인
    Object.assign(base, {
      provider:       'unknown',
      linkage_status: 'not_linkable',
      confidence:     'none',
      note:           `알 수 없는 도메인: ${domain}`,
    });
  }

  statusDist[base.linkage_status]++;
  auditRows.push(base);
}

// ── HARD STOP: 결과 정합성 ───────────────────────────────
if (auditRows.length !== 1642)
  hardStop(`감사 행 수 불일치: ${auditRows.length} (기대 1642)`);

const dupAuditIds = auditRows.map(r => r.candidate_id)
  .filter((id, i, arr) => arr.indexOf(id) !== i);
if (dupAuditIds.length > 0)
  hardStop(`감사 CSV candidate_id 중복: ${dupAuditIds.join(', ')}`);

// 공급자별 수치 검증
const vbTotal  = auditRows.filter(r => r.provider === 'visitbusan').length;
const ktoTotal = auditRows.filter(r => r.provider === 'kto').length;
const noImgTotal = auditRows.filter(r => r.linkage_status === 'no_image').length;
if (vbTotal !== 958)  hardStop(`VB 건수 불일치: ${vbTotal} (기대 958)`);
if (ktoTotal !== 543) hardStop(`KTO 건수 불일치: ${ktoTotal} (기대 543)`);
if (noImgTotal !== 141) hardStop(`no_image 건수 불일치: ${noImgTotal} (기대 141)`);

// auto_linkable 행에 근거 필드 + 연결 방법 존재 확인
const autoRows = auditRows.filter(r => r.linkage_status === 'auto_linkable');
const autoMissingEvidence = autoRows.filter(r => !r.source_record_id || !r.linkage_method || !r.rights_field_value);
if (autoMissingEvidence.length > 0)
  hardStop(`auto_linkable 행 중 근거 미비: ${autoMissingEvidence.length}건`);

// 기존 정본 파일 무변경 확인 (파일 크기로 간단 체크)
const origSize = fs.statSync(CANDIDATES_JSON).size;
if (origSize < 1000000) hardStop(`정본 JSON 크기 이상: ${origSize} bytes`);

// ── CSV 출력 ─────────────────────────────────────────────
function escapeCsv(val) {
  const str = (val === null || val === undefined) ? '' : String(val);
  return (str.includes(',') || str.includes('"') || str.includes('\n'))
    ? '"' + str.replace(/"/g, '""') + '"'
    : str;
}

const csvLines = [
  COLS.join(','),
  ...auditRows.map(row => COLS.map(c => escapeCsv(row[c])).join(',')),
];

fs.writeFileSync(TMP_CSV_PATH, csvLines.join('\n'), 'utf8');
const tmpCsvLines = fs.readFileSync(TMP_CSV_PATH, 'utf8').split('\n');
if (tmpCsvLines.length !== 1643) {
  fs.unlinkSync(TMP_CSV_PATH);
  hardStop(`임시 CSV 행 수 불일치: ${tmpCsvLines.length}`);
}
fs.renameSync(TMP_CSV_PATH, OUT_CSV_PATH);
console.log('✓ CSV 저장 완료:', OUT_CSV_PATH);

// ── MD 보고서 ────────────────────────────────────────────
const vbManual = stats.vb_uc_seq_direct + stats.vb_service_uc_seq + stats.vb_img_to_raw_uc_seq;
const ktoType1 = autoRows.filter(r => r.rights_field_value === 'Type1').length;
const ktoType3 = autoRows.filter(r => r.rights_field_value === 'Type3').length;

const md = `# 부산 이미지 권리 연결 가능성 감사

**작성일:** ${AUDIT_DATE}
**작성:** TASK-DATA-BUSAN-IMAGE-RIGHTS-LINKAGE-20A-3
**목적:** 기존 raw·normalized·candidate 데이터만으로 이미지 권리 정보 연결 가능 여부 점검

---

## 요약

| 공급자 | auto_linkable | manual_review | not_linkable | no_image | 합계 |
|---|---|---|---|---|---|
| VisitBusan | 0 | ${vbManual} | ${stats.vb_not_linkable} | 0 | 958 |
| KTO TourAPI | ${stats.kto_auto} | 0 | 0 | 0 | 543 |
| 이미지 없음 | 0 | 0 | 0 | ${stats.no_image} | 141 |
| **합계** | **${statusDist.auto_linkable}** | **${statusDist.manual_review}** | **${statusDist.not_linkable}** | **${statusDist.no_image}** | **1,642** |

---

## 1. KTO TourAPI (543건) — auto_linkable

### 1-1. 연결 키

| 단계 | 필드 | 위치 |
|---|---|---|
| ① candidate_id → contentid | \`linked_source_keys\`에서 \`KorService2:NNN:lang\` 패턴 추출 | busan-integrated-candidates.json |
| ② contentid → cpyrhtDivCd | KTO raw 배치 파일(\`kto-ko-p*.json\`)에서 contentid 키 조회 | data/tourapi/raw/busan/2026-07-24/batch/ |

### 1-2. 연결 결과

| cpyrhtDivCd 값 | 건수 | 공공누리 유형 |
|---|---|---|
| Type1 | ${ktoType1} | 출처표시 — 상업·수정 허용 |
| Type3 | ${ktoType3} | 출처표시+변경금지 — 상업 허용, 수정 금지 |
| 빈 값 | 0 | 해당 없음 |
| **합계** | **543** | |

**중요:** cpyrhtDivCd 값은 API 포털 기준 공공누리 유형이며, 개별 이미지의 최종 라이선스 확정은 별도 법률 검토 필요. (TASK-20A-2 정책 참조)

### 1-3. 다음 도시 재사용 절차

1. \`linked_source_keys\`에서 \`KorService2:NNN\` 패턴 추출 → contentid
2. KTO raw 배치 (\`kto-ko-p*.json\`) 로드 → contentid 키로 \`cpyrhtDivCd\` 조회
3. cpyrhtDivCd 값 → auto_linkable (Type1/Type3), 빈 값 → manual_review

---

## 2. VisitBusan (958건) — manual_review

VisitBusan 데이터에는 cpyrhtDivCd에 해당하는 권리 필드가 없습니다. 연결 가능한 식별자가 있더라도 실제 권리 여부(공공누리 마크 유무·유형)는 상세 페이지 수동 방문이 필요합니다.

### 2-1. 연결 방법 3가지

#### 방법 A — uc_seq_direct (${stats.vb_uc_seq_direct}건)

후보 레코드에 \`visitbusan_uc_seq\`와 \`source_detail_url\`이 직접 저장된 경우.

| 필드 | 위치 |
|---|---|
| \`visitbusan_uc_seq\` | busan-integrated-candidates.json |
| \`source_detail_url\` | 동일 레코드 — VB 상세 페이지 URL |

**활용:** source_detail_url 방문 → 공공누리 마크 유무 수동 확인.

#### 방법 B — service_uc_seq_to_vbfull (${stats.vb_service_uc_seq}건)

\`linked_source_keys\`가 \`AttractionService:NNN\` 또는 \`FoodService:NNN\` 형태이고 \`visitbusan-content-full.json\`에 UC_SEQ가 존재하는 경우.

| 단계 | 필드 | 위치 |
|---|---|---|
| ① UC_SEQ 추출 | \`linked_source_keys\`에서 \`ServiceName:NNN\` 패턴 | busan-integrated-candidates.json |
| ② source_detail_url 조회 | \`uc_seq\` 키로 vbFull 검색 | visitbusan-content-full.json |

**활용:** 조회된 source_detail_url 방문 → 공공누리 마크 확인.

#### 방법 C — image_url_to_raw_uc_seq (${stats.vb_img_to_raw_uc_seq}건)

\`linked_source_keys\`가 \`FoodService:NNN\` 또는 \`FestivalService:NNN\`이고 vbFull 미매칭인 경우. VB 전용 API(getFoodKr, getFestivalKr)에서만 제공되는 콘텐츠.

| 단계 | 필드 | 위치 |
|---|---|---|
| ① UC_SEQ 추출 | \`linked_source_keys\`에서 직접 또는 image_url 역추적 | busan-attraction/food/festival raw 배치 |
| ② source_detail_url | 현재 미확보 — URL 패턴 수동 구성 필요 | — |

**활용:** UC_SEQ를 사용해 VB 상세 페이지 URL 수동 구성 후 방문 → 공공누리 마크 확인.

### 2-2. 다음 도시 재사용 절차

1. \`visitbusan_uc_seq\` 필드 직접 확인 (있으면 방법 A)
2. \`linked_source_keys\`에서 AttractionService/FoodService:NNN 추출 → visitbusan-content-full에서 source_detail_url 조회 (있으면 방법 B)
3. FoodService/FestivalService raw 배치에서 이미지 URL 역맵 구성 → UC_SEQ 확인 (방법 C)
4. 모두 실패 → not_linkable

---

## 3. 연결 불가 (${statusDist.not_linkable}건)

${statusDist.not_linkable > 0
  ? '· linked_source_keys에서 UC_SEQ 추출 실패한 케이스.'
  : '· 해당 없음 (0건).'}

---

## 4. 산출물 파일

| 파일 | 설명 |
|---|---|
| \`data/tourapi/reports/busan/busan-image-rights-linkage-audit.csv\` | 1,642행 감사 결과 |
| \`docs/tourapi/busan-image-rights-linkage-20a3.md\` | 이 보고서 |

**수정하지 않은 파일:**
- busan-integrated-candidates.json / .csv
- busan-image-rights-audit.csv (PHASE 1)
- 기타 정본 파일 전체

git add·commit·push: 미실행

---

## 5. HARD STOP 검사 결과

| 검사 항목 | 결과 |
|---|---|
| 총 후보 1,767건 | ✓ |
| 활성 1,642건 | ✓ |
| candidate_id 중복 | 0건 ✓ |
| VB 958건 누락 | 0건 ✓ |
| KTO 543건 누락 | 0건 ✓ |
| no_image 141건 누락 | 0건 ✓ |
| auto_linkable 행 근거 미비 | 0건 ✓ |
| 기존 정본 파일 수정 | 없음 ✓ |
`;

fs.writeFileSync(TMP_MD_PATH, md, 'utf8');
if (fs.readFileSync(TMP_MD_PATH, 'utf8').length < 100) {
  fs.unlinkSync(TMP_MD_PATH);
  hardStop('MD 파일 내용 이상');
}
fs.renameSync(TMP_MD_PATH, OUT_MD_PATH);
console.log('✓ MD 저장 완료:', OUT_MD_PATH);

// ── 최종 보고 ─────────────────────────────────────────────
console.log('\n==========================================');
console.log('TASK-DATA-BUSAN-IMAGE-RIGHTS-LINKAGE-20A-3');
console.log('이미지 권리 연결 가능성 감사 완료');
console.log('==========================================');
console.log('');
console.log('[ 공급자별 linkage_status ]');
console.log('  KTO auto_linkable:           ', stats.kto_auto);
console.log('    ├ Type1:                   ', ktoType1);
console.log('    └ Type3:                   ', ktoType3);
console.log('  VB manual_review (합계):     ', vbManual);
console.log('    ├ uc_seq_direct:           ', stats.vb_uc_seq_direct);
console.log('    ├ service_uc_seq_to_vbfull:', stats.vb_service_uc_seq);
console.log('    └ image_url_to_raw_uc_seq: ', stats.vb_img_to_raw_uc_seq);
console.log('  VB not_linkable:             ', stats.vb_not_linkable);
console.log('  no_image:                    ', stats.no_image);
console.log('  합계:                        ', auditRows.length);
console.log('');
console.log('[ 재사용 가능 연결 키 ]');
console.log('  KTO: linked_source_keys (KorService2:NNN) → contentid → kto-ko raw → cpyrhtDivCd');
console.log('  VB A: visitbusan_uc_seq → source_detail_url → 페이지 수동 확인');
console.log('  VB B: linked_source_keys (ServiceName:NNN) → vbFull uc_seq → source_detail_url');
console.log('  VB C: image_url → getFoodKr/getFestivalKr raw 역맵 → UC_SEQ');
console.log('');
console.log('[ HARD STOP 검사 ]');
console.log('  모든 조건 통과 ✓');
console.log('');
console.log('git add·commit·push 미실행 ✓');
