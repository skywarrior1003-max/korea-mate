#!/usr/bin/env node
/**
 * tourapi-busan-canonical-fix.mjs — CANONICAL-01-FIX
 * Busan city KO + KTO KO 동일 장소 통합 후보 생성.
 * GPS ≤100m + nameSim ≥0.85 + 카테고리 일치 → same_place 병합.
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

const SAME_PLACE_DIST_M   = 100;   // same_place/manual_review 거리 임계
const SAME_PLACE_SIM      = 0.85;  // same_place 이름 유사도 임계
const PARENT_CHILD_DIST_M = 300;   // 참고용 상한

// ── CSV 파서·생성 ─────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split('\n');
  const hdrs = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const vals = []; let cur = '', inQ = false;
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

function csvRow(cells) {
  return cells.map(c => {
    const s = String(c ?? '').replace(/[\r\n]+/g, ' ').trim();
    return (s.includes(',') || s.includes('"')) ? `"${s.replace(/"/g, '""')}"` : s;
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

// ── 이름 유사도 ───────────────────────────────────────────────────────────────
function normTitle(s) {
  return (s ?? '').replace(/\s+/g, '').replace(/[^가-힣a-z0-9]/gi, '').toLowerCase();
}

function nameSim(a, b) {
  const na = normTitle(a), nb = normTitle(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1.0;
  const [shorter, longer] = na.length <= nb.length ? [na, nb] : [nb, na];
  // contains 체크 (최소 3자: "성일집" 같은 단명 포함)
  if (shorter.length >= 3 && longer.includes(shorter)) return 0.9;
  // 문자 bigram Jaccard
  const bg = s => { const st = new Set(); for (let i = 0; i < s.length - 1; i++) st.add(s[i] + s[i + 1]); return st; };
  const ba = bg(na), bb = bg(nb);
  if (!ba.size || !bb.size) return 0;
  let inter = 0; for (const g of ba) if (bb.has(g)) inter++;
  return inter / (ba.size + bb.size - inter);
}

// ── 카테고리 일치 ─────────────────────────────────────────────────────────────
// KTO content_type_id와 Busan 서비스 카테고리 매핑
function isCategoryMatch(ctKtoStr, catBusan) {
  const ct = parseInt(ctKtoStr);
  if (ct === 15) return false;                   // festival → 제외
  if (ct === 39) return catBusan === 'food';     // KTO 음식점 ↔ Busan FoodService
  return catBusan === 'attraction';              // 나머지 KTO ↔ Busan AttractionService
}

// ── 데이터 로드 ───────────────────────────────────────────────────────────────
console.log('[1/7] 데이터 로드 중...');
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
const koRecs    = records.filter(r => r.source_language === 'ko');
const nonKoRecs = records.filter(r => r.source_language !== 'ko');

console.log(`  records: ${records.length}, KO: ${koRecs.length}, 비KO: ${nonKoRecs.length}`);

// ── 초기 canonical group 구축 (1 KO = 1 group) ───────────────────────────────
console.log('[2/7] 초기 Canonical Group 구축 중...');

const svcPrefix = { AttractionService:'A', FoodService:'F', FestivalService:'E', KorService2:'K' };
const svcSeq = { A:0, F:0, E:0, K:0, X:0 };

const sortedKo = [...koRecs].sort((a, b) => {
  if (a.source_service !== b.source_service) return a.source_service.localeCompare(b.source_service);
  return parseInt(a.source_id ?? '0') - parseInt(b.source_id ?? '0');
});

const groups = new Map();

for (const ko of sortedKo) {
  const pfx = svcPrefix[ko.source_service] ?? 'X';
  svcSeq[pfx]++;
  groups.set(ko.source_key, {
    canonical_key:    ko.source_key,
    canonical_id:     `busan-${pfx}-${String(svcSeq[pfx]).padStart(5, '0')}`,
    source_service:   ko.source_service,
    category:         ko.category,
    content_type_id:  ko.content_type_id,
    title_ko:         ko.title,
    address:          ko.address,
    district:         ko.district,
    latitude:         ko.latitude,
    longitude:        ko.longitude,
    image_url:        ko.image_url,
    venue:            ko.venue ?? null,
    event_period_raw: ko.event_period_raw ?? null,
    members:          [ko.source_key],
    languages:        ['ko'],
    member_details:   [],
    has_any_link:     false,
    has_manual_review_link: false,
    kto_merges:       [],     // 병합된 KTO source_key 목록
    status:           'unlinked',
  });
}

// 언어 링크 반영
const assignedNonKo = new Set();
for (const row of linkRows) {
  const group = groups.get(row.source_key_ko);
  if (!group) continue;
  group.members.push(row.source_key_target);
  group.languages.push(row.target_language);
  group.has_any_link = true;
  if (row.confidence === 'manual_review') group.has_manual_review_link = true;
  group.member_details.push({
    source_key: row.source_key_target, language: row.target_language,
    confidence: row.confidence, score: parseInt(row.score, 10),
    dist_m: parseInt(row.dist_m, 10) || 0, link_method: row.link_method,
    title_target: row.title_target,
  });
  assignedNonKo.add(row.source_key_target);
}

// 언어 링크 기반 status
for (const [, g] of groups) {
  if (g.source_service === 'FestivalService') {
    g.status = !g.has_any_link ? 'festival_unlinked'
      : g.has_manual_review_link ? 'festival_manual_review'
      : 'festival_confirmed';
  } else if (g.source_service === 'KorService2') {
    g.status = 'kto_separate';  // 기본값; KTO 병합 단계에서 갱신
  } else {
    g.status = !g.has_any_link ? 'busan_unlinked'
      : g.has_manual_review_link ? 'busan_manual_review'
      : 'busan_confirmed';
  }
}

// ── KTO ↔ Busan 쌍 분석 ──────────────────────────────────────────────────────
console.log('[3/7] KTO ↔ Busan 쌍 분석 중...');

const ktoGrps   = [...groups.values()].filter(g => g.source_service === 'KorService2' && g.latitude && g.longitude);
const busanGrps = [...groups.values()].filter(g =>
  g.source_service !== 'KorService2' && g.source_service !== 'FestivalService'
  && g.latitude && g.longitude
);

const samePlacePairs    = [];  // dist≤100 + sim≥0.85 + cat match
const manualReviewPairs = [];  // dist≤100 + cat mismatch (cross-category)
const parentChildPairs  = [];  // dist 101-300 (참고용)

for (const kto of ktoGrps) {
  for (const busan of busanGrps) {
    const d = distM(kto.latitude, kto.longitude, busan.latitude, busan.longitude);
    if (d > PARENT_CHILD_DIST_M) continue;

    const sim = nameSim(kto.title_ko, busan.title_ko);
    const catOk = isCategoryMatch(kto.content_type_id, busan.category);
    const dRound = Math.round(d);

    if (d <= SAME_PLACE_DIST_M && sim >= SAME_PLACE_SIM && catOk) {
      samePlacePairs.push({ kto_key: kto.canonical_key, busan_key: busan.canonical_key, dist_m: dRound, sim, title_kto: kto.title_ko, title_busan: busan.title_ko, category_busan: busan.category ?? '', ct_kto: kto.content_type_id ?? '' });
    } else if (d <= SAME_PLACE_DIST_M && sim >= SAME_PLACE_SIM && !catOk) {
      manualReviewPairs.push({ kto_key: kto.canonical_key, busan_key: busan.canonical_key, dist_m: dRound, sim, title_kto: kto.title_ko, title_busan: busan.title_ko, category_busan: busan.category ?? '', ct_kto: kto.content_type_id ?? '', reason: 'category_mismatch' });
    } else if (d > SAME_PLACE_DIST_M) {
      parentChildPairs.push({ kto_key: kto.canonical_key, busan_key: busan.canonical_key, dist_m: dRound, sim: parseFloat(sim.toFixed(3)), title_kto: kto.title_ko, title_busan: busan.title_ko, category_busan: busan.category ?? '', ct_kto: kto.content_type_id ?? '' });
    }
  }
}

console.log(`  same_place 후보: ${samePlacePairs.length}, manual_review(cat불일치): ${manualReviewPairs.length}, parent_child ref: ${parentChildPairs.length}`);

// ── Same-place 병합 (dist_m 오름차순 → 가장 가까운 Busan 우선) ───────────────
console.log('[4/7] Same-place 병합 중...');

// 거리 오름차순·유사도 내림차순 정렬: 동일 KTO에 2개 Busan 후보 있을 경우 가장 가까운 쪽을 우선 병합
samePlacePairs.sort((a, b) => a.dist_m - b.dist_m || b.sim - a.sim);

const mergedKtoKeys = new Set();  // 흡수된 KTO canonical_key

for (const p of samePlacePairs) {
  if (mergedKtoKeys.has(p.kto_key)) continue;  // 이 KTO는 이미 가장 가까운 Busan에 병합됨

  const busanGroup = groups.get(p.busan_key);
  const ktoGroup   = groups.get(p.kto_key);

  if (!busanGroup || !ktoGroup) continue;

  // KTO 그룹의 멤버를 Busan 그룹으로 이동
  for (const m of ktoGroup.members) {
    if (!busanGroup.members.includes(m)) busanGroup.members.push(m);
  }
  for (const lang of ktoGroup.languages) {
    if (lang !== 'ko' || !busanGroup.languages.includes('ko')) {
      // KTO KO는 secondary KO로만 기록 (kto_merges)
      if (lang !== 'ko') busanGroup.languages.push(lang);
    }
  }
  for (const md of ktoGroup.member_details) {
    busanGroup.member_details.push(md);
    assignedNonKo.add(md.source_key);
  }
  busanGroup.kto_merges.push(p.kto_key);
  busanGroup.status = 'same_place';

  mergedKtoKeys.add(p.kto_key);
}

// 병합된 KTO 그룹 → groups에서 제거 (단, members는 이미 busan group에 이전됨)
for (const key of mergedKtoKeys) {
  groups.delete(key);
}

// 남은 KTO 그룹 상태 갱신
const ktoWithManualReview = new Set(manualReviewPairs.map(p => p.kto_key));
const ktoWithParentChild  = new Set(parentChildPairs.map(p => p.kto_key));
for (const [, g] of groups) {
  if (g.source_service !== 'KorService2') continue;
  if (ktoWithManualReview.has(g.canonical_key)) g.status = 'kto_manual_review';
  else if (ktoWithParentChild.has(g.canonical_key)) g.status = 'kto_parent_child';
  else g.status = 'kto_separate';
}

console.log(`  병합 완료: ${mergedKtoKeys.size}개 KTO 그룹 흡수 → 최종 canonical groups: ${groups.size}`);

// ── 미매칭 비KO 추적 ──────────────────────────────────────────────────────────
console.log('[5/7] 미매칭 비KO 추적 중...');

const insuOnlyKeys = new Set();
for (const row of unlinkedRows) {
  if (!assignedNonKo.has(row.source_key_target)) insuOnlyKeys.add(row.source_key_target);
}

// 모든 멤버 수집 (KO 포함)
const allMemberKeys = new Set();
for (const [, g] of groups) for (const m of g.members) allMemberKeys.add(m);

const unclaimedKeys = new Set(
  nonKoRecs.filter(r => !allMemberKeys.has(r.source_key) && !insuOnlyKeys.has(r.source_key))
    .map(r => r.source_key)
);

// 합계 검증
const koCount    = sortedKo.length;  // 원래 KO 수 (1465)
const linkedNK   = assignedNonKo.size;
const insuOnly   = insuOnlyKeys.size;
const unclaimed  = unclaimedKeys.size;
const totalCheck = koCount + linkedNK + insuOnly + unclaimed;
const verifyOk   = totalCheck === 4135;
console.log(`  KO:${koCount} + linkedNK:${linkedNK} + insu:${insuOnly} + unclaimed:${unclaimed} = ${totalCheck} ${verifyOk?'✓ PASS':'⚠ CHECK'}`);

// ── 산출물 저장 ───────────────────────────────────────────────────────────────
console.log('[6/7] 산출물 저장 중...');
fs.mkdirSync(CAND_DIR, { recursive: true });
fs.mkdirSync(RPT_DIR, { recursive: true });

const allGroups = [...groups.values()].sort((a, b) => a.canonical_id.localeCompare(b.canonical_id));

// ① busan-canonical-candidates.csv (기존 덮어쓰기)
{
  const rows = [csvRow([
    'canonical_id','canonical_key','status','category','source_service',
    'lang_count','member_count','languages','kto_merges',
    'title_ko','address','district','latitude','longitude',
    'image_url','venue','event_period_raw',
  ])];
  for (const g of allGroups) {
    rows.push(csvRow([
      g.canonical_id, g.canonical_key, g.status,
      g.category ?? '', g.source_service,
      g.languages.length, g.members.length,
      g.languages.join('|'), g.kto_merges.join('|'),
      g.title_ko ?? '', g.address ?? '', g.district ?? '',
      g.latitude ?? '', g.longitude ?? '',
      g.image_url ?? '', g.venue ?? '', g.event_period_raw ?? '',
    ]));
  }
  const p = path.join(CAND_DIR, 'busan-canonical-candidates.csv');
  fs.writeFileSync(p, rows.join('\n'), 'utf8');
  console.log(`  ① candidates.csv: ${rows.length-1}건 → ${path.relative(ROOT, p)}`);
}

// ② busan-canonical-same-place.csv (신규)
{
  const rows = [csvRow([
    'kto_canonical_key','busan_canonical_key','dist_m','sim',
    'title_kto','title_busan','category_busan','ct_kto',
  ])];
  samePlacePairs.sort((a,b)=>a.dist_m-b.dist_m).forEach(p=>
    rows.push(csvRow([p.kto_key,p.busan_key,p.dist_m,parseFloat(p.sim.toFixed(3)),p.title_kto,p.title_busan,p.category_busan,p.ct_kto]))
  );
  const p = path.join(CAND_DIR, 'busan-canonical-same-place.csv');
  fs.writeFileSync(p, rows.join('\n'), 'utf8');
  console.log(`  ② same-place.csv: ${samePlacePairs.length}건 → ${path.relative(ROOT, p)}`);
}

// ③ busan-canonical-manual-review.csv (덮어쓰기: 언어링크 MR + 카테고리 불일치)
{
  const rows = [csvRow([
    'canonical_id','canonical_key','review_type','title_ko','address','dist_m','sim',
    'kto_canonical_key','title_kto','ct_kto','category_busan','reason',
  ])];
  // 언어 링크 manual_review 그룹
  for (const g of allGroups) {
    if (!g.has_manual_review_link) continue;
    const mrDetails = g.member_details.filter(d => d.confidence === 'manual_review');
    for (const d of mrDetails) {
      rows.push(csvRow([
        g.canonical_id, g.canonical_key, 'lang_link_quality',
        g.title_ko ?? '', g.address ?? '', '', '',
        '', d.title_target, '', '', d.link_method,
      ]));
    }
  }
  // 카테고리 불일치 쌍
  manualReviewPairs.forEach(p=>
    rows.push(csvRow([
      '', p.busan_key, 'category_mismatch',
      '', '', p.dist_m, parseFloat(p.sim.toFixed(3)),
      p.kto_key, p.title_kto, p.ct_kto, p.category_busan, p.reason,
    ]))
  );
  const p = path.join(CAND_DIR, 'busan-canonical-manual-review.csv');
  fs.writeFileSync(p, rows.join('\n'), 'utf8');
  console.log(`  ③ manual-review.csv: ${rows.length-1}행 → ${path.relative(ROOT, p)}`);
}

// ④ busan-canonical-parent-child.csv (덮어쓰기: 101-300m 참고용, nameSim 포함)
{
  const rows = [csvRow([
    'kto_canonical_key','busan_canonical_key','dist_m','sim',
    'title_kto','title_busan','category_busan','ct_kto',
  ])];
  parentChildPairs.sort((a,b)=>a.dist_m-b.dist_m).forEach(p=>
    rows.push(csvRow([p.kto_key,p.busan_key,p.dist_m,p.sim,p.title_kto,p.title_busan,p.category_busan,p.ct_kto]))
  );
  const p = path.join(CAND_DIR, 'busan-canonical-parent-child.csv');
  fs.writeFileSync(p, rows.join('\n'), 'utf8');
  console.log(`  ④ parent-child.csv: ${parentChildPairs.length}건 → ${path.relative(ROOT, p)}`);
}

// ⑤ busan-canonical-unmatched.csv (동일)
{
  const rows = [csvRow(['source_key','source_language','source_service','category','title','unmatched_reason'])];
  for (const key of insuOnlyKeys) {
    const r = recMap.get(key);
    if (!r) continue;
    rows.push(csvRow([r.source_key,r.source_language,r.source_service,r.category??'',r.title??'','insufficient_evidence_only']));
  }
  for (const key of unclaimedKeys) {
    const r = recMap.get(key);
    if (!r) continue;
    rows.push(csvRow([r.source_key,r.source_language,r.source_service,r.category??'',r.title??'','unclaimed']));
  }
  const p = path.join(CAND_DIR, 'busan-canonical-unmatched.csv');
  fs.writeFileSync(p, rows.join('\n'), 'utf8');
  console.log(`  ⑤ unmatched.csv: ${rows.length-1}건 → ${path.relative(ROOT, p)}`);
}

// ⑥ busan-canonical-metrics.json
{
  const statusDist = {}, catDist = {}, svcDist = {};
  for (const g of allGroups) {
    statusDist[g.status] = (statusDist[g.status]||0)+1;
    catDist[g.category??'null'] = (catDist[g.category??'null']||0)+1;
    svcDist[g.source_service] = (svcDist[g.source_service]||0)+1;
  }

  // unlinked 92→96 delta 분석
  const preLinkConf = {high:0,manual_review:0};
  for (const row of linkRows) {
    const rec = recMap.get(row.source_key_ko);
    if (rec && rec.source_service !== 'FestivalService')
      preLinkConf[row.confidence] = (preLinkConf[row.confidence]||0)+1;
  }
  const preUnlinkedNonFest = unlinkedRows.filter(u=>{
    const rec=recMap.get(u.source_key_ko);
    return rec && rec.source_service !== 'FestivalService';
  });
  const festUnlinked = unlinkedRows.filter(u=>{
    const rec=recMap.get(u.source_key_ko);
    return rec && rec.source_service === 'FestivalService';
  });

  const metrics = {
    run_date: TODAY,
    total_records: records.length,
    canonical_groups: {
      total: groups.size,
      by_status: statusDist,
      by_category: catDist,
      by_source_service: svcDist,
    },
    same_place_merges: {
      pairs_merged:        samePlacePairs.length,
      kto_groups_absorbed: mergedKtoKeys.size,
      dist_threshold_m:    SAME_PLACE_DIST_M,
      sim_threshold:       SAME_PLACE_SIM,
      sim_method:          'normTitle + contains(min3) + bigram_jaccard',
    },
    manual_review: {
      lang_link_quality_groups: allGroups.filter(g=>g.has_manual_review_link).length,
      category_mismatch_pairs:  manualReviewPairs.length,
      total: allGroups.filter(g=>g.has_manual_review_link).length + manualReviewPairs.length,
    },
    parent_child_ref: {
      total:          parentChildPairs.length,
      dist_range_m:   '101-300',
    },
    unmatched_records: {
      total:                       insuOnly + unclaimed,
      insufficient_evidence_only:  insuOnly,
      unclaimed:                   unclaimed,
    },
    unlinked_delta_analysis: {
      note: 'busan-batch-unlinked-candidates.csv 기반 festival/비Festival 분리',
      pre_festival_total_rows: 92,
      post_festival_total_rows: unlinkedRows.length,
      festival_rows:            festUnlinked.length,
      non_festival_rows:        preUnlinkedNonFest.length,
      non_festival_delta:       preUnlinkedNonFest.length - 92,
      explanation: 'festival 통합 시 KTO 타겟 풀 확장으로 비Festival KorService2 4건 새로 insufficient_evidence 진입. Festival 자체 2건 신규.',
      non_festival_link_check: {
        high:             preLinkConf.high,
        manual_review:    preLinkConf.manual_review,
        high_ok:          preLinkConf.high === 2364,
        manual_review_ok: preLinkConf.manual_review === 66,
      },
    },
    tracking_verification: {
      original_ko:    koCount,
      linked_non_ko:  linkedNK,
      insu_only:      insuOnly,
      unclaimed:      unclaimed,
      total_accounted: totalCheck,
      expected:       4135,
      ok:             verifyOk,
    },
    generated_at: new Date().toISOString(),
  };

  const p = path.join(RPT_DIR, 'busan-canonical-metrics.json');
  fs.writeFileSync(p, JSON.stringify(metrics, null, 2), 'utf8');
  console.log(`  ⑥ canonical-metrics.json → ${path.relative(ROOT, p)}`);
}

// ── 최종 요약 ────────────────────────────────────────────────────────────────
console.log('\n[7/7] 완료');
console.log('='.repeat(55));
const statusDist2 = {};
for (const [,g] of groups) statusDist2[g.status]=(statusDist2[g.status]||0)+1;
console.log(`최종 canonical groups: ${groups.size}건`);
Object.entries(statusDist2).sort().forEach(([k,v])=>console.log(`  ${k}: ${v}`));
console.log(`same_place 병합: ${mergedKtoKeys.size}건 (${samePlacePairs.length} pairs)`);
console.log(`unmatched: ${insuOnly+unclaimed}건`);
console.log(`전체 추적: ${totalCheck}/4135 ${verifyOk?'✓ PASS':'⚠ CHECK'}`);
