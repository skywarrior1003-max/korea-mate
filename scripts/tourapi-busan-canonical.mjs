#!/usr/bin/env node
/**
 * tourapi-busan-canonical.mjs
 * 정규화된 4,135건을 canonical group으로 묶고 5개 산출물 생성.
 *
 * 금지: DB수정/upsert/commit/push/비밀값출력/src수정/functions수정/자동삭제
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT     = path.resolve(__dir, '..');
const TODAY    = new Date().toISOString().slice(0, 10);
const CAND_DIR = path.join(ROOT, 'data/tourapi/candidates/busan');
const RPT_DIR  = path.join(ROOT, 'data/tourapi/reports/busan');

const PARENT_CHILD_DIST_M = 300;  // KTO ↔ Busan 동일 장소 후보 거리 임계

// ── RFC 4180 CSV 파서 ─────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split('\n');
  const hdrs = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const vals = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; continue; }
        inQ = !inQ;
      } else if (ch === ',' && !inQ) { vals.push(cur); cur = ''; }
      else cur += ch;
    }
    vals.push(cur);
    return Object.fromEntries(hdrs.map((h, i) => [h, vals[i] ?? '']));
  });
}

// ── CSV 행 생성 ───────────────────────────────────────────────────────────────
function csvRow(cells) {
  return cells.map(c => {
    // 개행을 공백으로 정규화 (event_period_raw 등 텍스트 필드 임베드 개행 방지)
    const s = String(c ?? '').replace(/[\r\n]+/g, ' ').trim();
    return (s.includes(',') || s.includes('"'))
      ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',');
}

// ── Haversine 거리 (m) ────────────────────────────────────────────────────────
function distM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
    * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ── 데이터 로드 ───────────────────────────────────────────────────────────────
console.log('[1/6] 데이터 로드 중...');
const records = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'data/tourapi/normalized/busan/busan-batch-normalized.json'), 'utf8')
);
const linkRows = parseCSV(
  fs.readFileSync(path.join(CAND_DIR, 'busan-batch-language-links.csv'), 'utf8')
);
const unlinkedRows = parseCSV(
  fs.readFileSync(path.join(CAND_DIR, 'busan-batch-unlinked-candidates.csv'), 'utf8')
);

const recMap = new Map(records.map(r => [r.source_key, r]));
const koRecs   = records.filter(r => r.source_language === 'ko');
const nonKoRecs = records.filter(r => r.source_language !== 'ko');

console.log(`  normalized: ${records.length}건, KO: ${koRecs.length}, 비KO: ${nonKoRecs.length}`);
console.log(`  language links: ${linkRows.length}행, unlinked CSV: ${unlinkedRows.length}행`);

// ── Canonical Group 구축 ──────────────────────────────────────────────────────
console.log('[2/6] Canonical Group 구축 중...');

// service별 순서 번호 (source_id 기준 정렬로 안정적 canonical_id 부여)
const svcPrefix = {
  AttractionService: 'A',
  FoodService:       'F',
  FestivalService:   'E',
  KorService2:       'K',
};

// KO 레코드를 service별로 정렬 후 canonical_id 부여
const svcSeq = { A: 0, F: 0, E: 0, K: 0, X: 0 };
const sortedKo = [...koRecs].sort((a, b) => {
  if (a.source_service !== b.source_service) return a.source_service.localeCompare(b.source_service);
  return parseInt(a.source_id ?? '0') - parseInt(b.source_id ?? '0');
});

const groups = new Map();  // canonical_key → group

for (const ko of sortedKo) {
  const pfx = svcPrefix[ko.source_service] ?? 'X';
  svcSeq[pfx]++;
  const canonical_id = `busan-${pfx}-${String(svcSeq[pfx]).padStart(5, '0')}`;

  groups.set(ko.source_key, {
    canonical_id,
    canonical_key:     ko.source_key,
    source_service:    ko.source_service,
    category:          ko.category,
    content_type_id:   ko.content_type_id,
    title_ko:          ko.title,
    address:           ko.address,
    district:          ko.district,
    latitude:          ko.latitude,
    longitude:         ko.longitude,
    image_url:         ko.image_url,
    venue:             ko.venue ?? null,
    event_period_raw:  ko.event_period_raw ?? null,
    members:           [ko.source_key],
    languages:         ['ko'],
    member_details:    [],
    has_any_link:      false,
    has_manual_review: false,
    status:            'unlinked',  // 아래에서 갱신
  });
}

// 링크된 비KO 멤버 추가
const assignedNonKo = new Set();

for (const row of linkRows) {
  const group = groups.get(row.source_key_ko);
  if (!group) {
    console.warn(`  경고: link의 source_key_ko ${row.source_key_ko} 를 groups에서 찾을 수 없음`);
    continue;
  }

  group.members.push(row.source_key_target);
  group.languages.push(row.target_language);
  group.has_any_link = true;
  if (row.confidence === 'manual_review') group.has_manual_review = true;

  group.member_details.push({
    source_key:   row.source_key_target,
    language:     row.target_language,
    confidence:   row.confidence,
    score:        parseInt(row.score, 10),
    dist_m:       parseInt(row.dist_m, 10) || 0,
    link_method:  row.link_method,
    title_target: row.title_target,
  });

  assignedNonKo.add(row.source_key_target);
}

// status 결정
for (const [, g] of groups) {
  g.status = !g.has_any_link ? 'unlinked'
    : g.has_manual_review    ? 'manual_review'
    : 'confirmed';
}

// ── 미매칭 비KO 추적 ──────────────────────────────────────────────────────────
console.log('[3/6] 미매칭 비KO 추적 중...');

// insufficient_evidence: unlinked CSV의 target 중 assigned되지 않은 것 (unique)
const insuOnlyKeys = new Set();
for (const row of unlinkedRows) {
  if (!assignedNonKo.has(row.source_key_target)) {
    insuOnlyKeys.add(row.source_key_target);
  }
}

// unclaimed: 비KO 중 어디에도 속하지 않는 것
const unclaimedKeys = new Set(
  nonKoRecs
    .filter(r => !assignedNonKo.has(r.source_key) && !insuOnlyKeys.has(r.source_key))
    .map(r => r.source_key)
);

// ── 합계 검증 ────────────────────────────────────────────────────────────────
const koCount     = groups.size;           // 1,465
const linkedNKCnt = assignedNonKo.size;    // 2,571
const insuOnly    = insuOnlyKeys.size;     // 37
const unclaimed   = unclaimedKeys.size;    // 62
const totalCheck  = koCount + linkedNKCnt + insuOnly + unclaimed;

const verifyOk = totalCheck === 4135;
console.log(`  KO: ${koCount}, 링크 비KO: ${linkedNKCnt}, insu_only: ${insuOnly}, unclaimed: ${unclaimed}`);
console.log(`  합계: ${totalCheck} / 4135 → ${verifyOk ? 'PASS' : '⚠ 불일치'}`);

if (!verifyOk) {
  console.error(`  오류: 합계가 4135와 다릅니다. 스크립트를 중단하지 않고 계속하지만 결과를 재검토하세요.`);
}

// ── parent_child 후보 탐색 ────────────────────────────────────────────────────
console.log('[4/6] parent_child 후보 탐색 중 (KTO ↔ Busan, ≤300m)...');

// KTO 그룹: GPS 있는 것, content_type_id≠15(festival) 제외
const ktoGroups = [...groups.values()].filter(g =>
  g.source_service === 'KorService2'
  && g.latitude && g.longitude
  && g.content_type_id !== 15
);

// Busan 그룹: GPS 있는 것, FestivalService 제외
const busanGroups = [...groups.values()].filter(g =>
  g.source_service !== 'KorService2'
  && g.source_service !== 'FestivalService'
  && g.latitude && g.longitude
);

const parentChildCandidates = [];

for (const kto of ktoGroups) {
  for (const busan of busanGroups) {
    const d = distM(kto.latitude, kto.longitude, busan.latitude, busan.longitude);
    if (d <= PARENT_CHILD_DIST_M) {
      parentChildCandidates.push({
        kto_canonical_key:   kto.canonical_key,
        busan_canonical_key: busan.canonical_key,
        dist_m:              Math.round(d),
        title_kto:           kto.title_ko ?? '',
        title_busan:         busan.title_ko ?? '',
        category_busan:      busan.category ?? '',
        content_type_id_kto: kto.content_type_id ?? '',
        kto_status:          kto.status,
        busan_status:        busan.status,
      });
    }
  }
}

parentChildCandidates.sort((a, b) => a.dist_m - b.dist_m);
console.log(`  parent_child 후보: ${parentChildCandidates.length}건`);

// ── 산출물 저장 ───────────────────────────────────────────────────────────────
console.log('[5/6] 산출물 저장 중...');
fs.mkdirSync(CAND_DIR, { recursive: true });
fs.mkdirSync(RPT_DIR, { recursive: true });

// 출력용 정렬 (canonical_id 순)
const allGroups = [...groups.values()].sort((a, b) => a.canonical_id.localeCompare(b.canonical_id));

// ① busan-canonical-candidates.csv — 전체 1,465 그룹
{
  const rows = [csvRow([
    'canonical_id', 'canonical_key', 'status', 'category', 'source_service',
    'lang_count', 'member_count', 'languages',
    'title_ko', 'address', 'district', 'latitude', 'longitude',
    'image_url', 'venue', 'event_period_raw',
  ])];
  for (const g of allGroups) {
    rows.push(csvRow([
      g.canonical_id, g.canonical_key, g.status,
      g.category ?? '', g.source_service,
      g.languages.length, g.members.length,
      g.languages.join('|'),
      g.title_ko ?? '', g.address ?? '', g.district ?? '',
      g.latitude ?? '', g.longitude ?? '',
      g.image_url ?? '', g.venue ?? '', g.event_period_raw ?? '',
    ]));
  }
  const p = path.join(CAND_DIR, 'busan-canonical-candidates.csv');
  fs.writeFileSync(p, rows.join('\n'), 'utf8');
  console.log(`  ① candidates.csv: ${rows.length - 1}건 → ${path.relative(ROOT, p)}`);
}

// ② busan-canonical-manual-review.csv — manual_review 그룹 상세
{
  const mrGroups = allGroups.filter(g => g.status === 'manual_review');
  const rows = [csvRow([
    'canonical_id', 'canonical_key', 'title_ko', 'address', 'district',
    'latitude', 'longitude',
    'mr_language', 'score', 'dist_m', 'link_method',
    'source_key_target', 'title_target',
  ])];
  for (const g of mrGroups) {
    const mrDetails = g.member_details.filter(d => d.confidence === 'manual_review');
    for (const d of mrDetails) {
      rows.push(csvRow([
        g.canonical_id, g.canonical_key, g.title_ko ?? '',
        g.address ?? '', g.district ?? '',
        g.latitude ?? '', g.longitude ?? '',
        d.language, d.score, d.dist_m, d.link_method,
        d.source_key, d.title_target,
      ]));
    }
  }
  const p = path.join(CAND_DIR, 'busan-canonical-manual-review.csv');
  fs.writeFileSync(p, rows.join('\n'), 'utf8');
  console.log(`  ② manual-review.csv: ${mrGroups.length}그룹, ${rows.length - 1}행 → ${path.relative(ROOT, p)}`);
}

// ③ busan-canonical-parent-child.csv — KTO ↔ Busan 이중 수록 후보
{
  const rows = [csvRow([
    'kto_canonical_key', 'busan_canonical_key', 'dist_m',
    'title_kto', 'title_busan',
    'category_busan', 'content_type_id_kto',
    'kto_status', 'busan_status',
  ])];
  for (const pc of parentChildCandidates) {
    rows.push(csvRow([
      pc.kto_canonical_key, pc.busan_canonical_key, pc.dist_m,
      pc.title_kto, pc.title_busan,
      pc.category_busan, pc.content_type_id_kto,
      pc.kto_status, pc.busan_status,
    ]));
  }
  const p = path.join(CAND_DIR, 'busan-canonical-parent-child.csv');
  fs.writeFileSync(p, rows.join('\n'), 'utf8');
  console.log(`  ③ parent-child.csv: ${parentChildCandidates.length}건 → ${path.relative(ROOT, p)}`);
}

// ④ busan-canonical-unmatched.csv — canonical group 미귀속 비KO
{
  const rows = [csvRow([
    'source_key', 'source_language', 'source_service',
    'category', 'title', 'unmatched_reason',
  ])];
  for (const key of insuOnlyKeys) {
    const r = recMap.get(key);
    if (!r) continue;
    rows.push(csvRow([
      r.source_key, r.source_language, r.source_service,
      r.category ?? '', r.title ?? '',
      'insufficient_evidence_only',
    ]));
  }
  for (const key of unclaimedKeys) {
    const r = recMap.get(key);
    if (!r) continue;
    rows.push(csvRow([
      r.source_key, r.source_language, r.source_service,
      r.category ?? '', r.title ?? '',
      'unclaimed',
    ]));
  }
  const p = path.join(CAND_DIR, 'busan-canonical-unmatched.csv');
  fs.writeFileSync(p, rows.join('\n'), 'utf8');
  console.log(`  ④ unmatched.csv: ${rows.length - 1}건 → ${path.relative(ROOT, p)}`);
}

// ⑤ busan-canonical-metrics.json
{
  const statusDist = {}, catDist = {}, svcDist = {}, langDist = {};
  let totalLangs = 0;

  for (const g of allGroups) {
    statusDist[g.status] = (statusDist[g.status] || 0) + 1;
    const cat = g.category ?? 'null';
    catDist[cat] = (catDist[cat] || 0) + 1;
    svcDist[g.source_service] = (svcDist[g.source_service] || 0) + 1;
    totalLangs += g.languages.length;
    for (const lang of g.languages) {
      langDist[lang] = (langDist[lang] || 0) + 1;
    }
  }

  // 기존 수치 유지 검증: festival 제외 링크 집계
  const preLinkConf = { high: 0, manual_review: 0 };
  for (const row of linkRows) {
    const rec = recMap.get(row.source_key_ko);
    if (rec && rec.source_service !== 'FestivalService') {
      preLinkConf[row.confidence] = (preLinkConf[row.confidence] || 0) + 1;
    }
  }
  const preUnlinkedRows = unlinkedRows.filter(u => {
    const rec = recMap.get(u.source_key_ko);
    return rec && rec.source_service !== 'FestivalService';
  });

  const metrics = {
    run_date: TODAY,
    total_records: records.length,
    canonical_groups: {
      total:             groups.size,
      by_status:         statusDist,
      by_category:       catDist,
      by_source_service: svcDist,
      avg_lang_count:    +(totalLangs / groups.size).toFixed(2),
      lang_member_dist:  langDist,
    },
    parent_child_candidates: parentChildCandidates.length,
    parent_child_dist_threshold_m: PARENT_CHILD_DIST_M,
    unmatched_records: {
      total:                        insuOnly + unclaimed,
      insufficient_evidence_only:   insuOnly,
      unclaimed:                    unclaimed,
    },
    pre_festival_link_check: {
      note: 'Festival 제외 링크 수치. high/manual_review는 festival 추가 전과 동일(2364/66 PASS). unlinked는 92→96(+4): festival 통합 시 KTO 타겟 풀 확장으로 비Festival KorService2 4건이 새로 insufficient_evidence 진입.',
      high:                  preLinkConf.high,
      manual_review:         preLinkConf.manual_review,
      non_festival_unlinked_rows: preUnlinkedRows.length,
      expect_high:           2364,
      expect_manual_review:  66,
      pre_festival_unlinked_baseline: 92,
      unlinked_delta:        preUnlinkedRows.length - 92,
      high_ok:          preLinkConf.high === 2364,
      manual_review_ok:  preLinkConf.manual_review === 66,
    },
    tracking_verification: {
      ko_records:                  koCount,
      linked_non_ko:               linkedNKCnt,
      insufficient_evidence_only:  insuOnly,
      unclaimed:                   unclaimed,
      total_accounted:             totalCheck,
      expected:                    4135,
      ok:                          verifyOk,
    },
    generated_at: new Date().toISOString(),
  };

  const p = path.join(RPT_DIR, 'busan-canonical-metrics.json');
  fs.writeFileSync(p, JSON.stringify(metrics, null, 2), 'utf8');
  console.log(`  ⑤ canonical-metrics.json → ${path.relative(ROOT, p)}`);
}

// ── 최종 요약 ────────────────────────────────────────────────────────────────
console.log('\n[6/6] 완료');
console.log('='.repeat(50));
const statusDist2 = {};
for (const [, g] of groups) statusDist2[g.status] = (statusDist2[g.status] || 0) + 1;
console.log(`canonical groups: ${groups.size}건`);
Object.entries(statusDist2).sort().forEach(([k, v]) => console.log(`  ${k}: ${v}`));
console.log(`unmatched: ${insuOnly + unclaimed}건 (insu_only:${insuOnly}, unclaimed:${unclaimed})`);
console.log(`parent_child 후보: ${parentChildCandidates.length}건`);
console.log(`전체 추적: ${totalCheck}/4135 ${verifyOk ? '✓ PASS' : '⚠ CHECK'}`);
