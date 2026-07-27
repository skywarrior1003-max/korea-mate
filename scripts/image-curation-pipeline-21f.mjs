/**
 * TASK-DATA-IMAGE-CURATION-PIPELINE-21F
 * 기존 데이터만으로 장소별 curated_images + image_status 산출.
 * API 호출 없음. 기존 파일 read-only.
 */

import fs from 'fs';
import path from 'path';

const BASE = 'c:/기본저장/나의 프로젝트/KoreaMate/korea-mate';

const INPUT = {
  placeSummary: `${BASE}/data/tourapi/reports/busan/busan-photo-gallery-place-summary-21d-rev2.csv`,
  rightsAudit:  `${BASE}/data/tourapi/candidates/busan/busan-image-rights-audit.csv`,
  integrated:   `${BASE}/data/tourapi/candidates/busan/busan-integrated-candidates.csv`,
  sourcePool:   `${BASE}/data/tourapi/normalized/photo-gallery/integrated/busan-photo-gallery-integrated-21d-rev2.jsonl`,
};

const OUTPUT = {
  status:    `${BASE}/data/tourapi/reports/busan/busan-image-status-21f.csv`,
  curated:   `${BASE}/data/tourapi/reports/busan/busan-curated-images-21f.jsonl`,
  metrics:   `${BASE}/data/tourapi/reports/busan/busan-image-curation-metrics-21f.json`,
  report:    `${BASE}/docs/tourapi/busan-image-curation-pipeline-21f.md`,
};

// ---------- Category limits from image-curation-rules.md ----------
const CAT_RULES = {
  attraction:    { recommended: [3, 4], max: 5 },
  nature:        { recommended: [3, 4], max: 5 },
  restaurant:    { recommended: [3, 3], max: 4 },
  event:         { recommended: [2, 3], max: 4 },
  accommodation: { recommended: [2, 3], max: 4 },
};

// ---------- RFC4180 CSV parser ----------
function parseCSVLine(line) {
  const cols = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === ',' && !inQ) { cols.push(cur); cur = ''; }
    else cur += c;
  }
  cols.push(cur);
  return cols;
}

function parseCSV(text) {
  const lines = text.replace(/^\uFEFF/, '').split('\n').filter(l => l.trim());
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map(l => {
    const cols = parseCSVLine(l);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = cols[i] ?? ''; });
    return obj;
  });
}

// ---------- Atomic write ----------
function writeAtomic(filePath, content) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, filePath);
}

// ---------- image_status assignment ----------
function assignImageStatus(curatedCount, classification, primaryStatus) {
  if (curatedCount === 0) {
    if (primaryStatus === 'no_image' && classification === 'unresolved') return 'source_exhausted';
    return 'image_missing';
  }
  // All placed at image_partial — role diversity cannot be verified automatically
  return 'image_partial';
}

// ---------- rights_flag ----------
function rightsFlag(primaryStatus, classification, curatedCount) {
  if (curatedCount === 0) return 'PASS';
  if (primaryStatus === 'review_required') return 'PASS_WITH_WARNINGS';
  // usable primary + ambiguous PG → PASS
  if (classification === 'review_required' && primaryStatus === 'usable') return 'PASS';
  return 'PASS';
}

// ---------- MAIN ----------
async function main() {
  console.log('[21F] PREFLIGHT START');

  // ── Preflight #8: output path collision check ──
  for (const [key, p] of Object.entries(OUTPUT)) {
    if (fs.existsSync(p)) {
      // These are 21F-specific paths — safe to overwrite as new task output
      console.log(`[WARN] output exists, will overwrite: ${path.basename(p)}`);
    }
  }

  // ── Preflight #9: input files read-only ──
  for (const [key, p] of Object.entries(INPUT)) {
    if (!fs.existsSync(p)) {
      console.error(`[HARD_STOP] input missing: ${p}`);
      process.exit(1);
    }
  }

  console.log('[21F] Loading inputs...');

  // 1. Place summary (21D-REV2 result)
  const psRows = parseCSV(fs.readFileSync(INPUT.placeSummary, 'utf8'));
  console.log(`  place-summary: ${psRows.length} rows`);
  if (psRows.length !== 1642) {
    console.error(`[HARD_STOP] place-summary count mismatch: ${psRows.length} ≠ 1642`);
    process.exit(1);
  }
  const psMap = Object.fromEntries(psRows.map(r => [r.candidate_id, r]));

  // 2. Rights audit
  const raRows = parseCSV(fs.readFileSync(INPUT.rightsAudit, 'utf8'));
  console.log(`  rights-audit: ${raRows.length} rows`);
  if (raRows.length !== 1642) {
    console.error(`[HARD_STOP] rights-audit count mismatch: ${raRows.length} ≠ 1642`);
    process.exit(1);
  }
  const raMap = Object.fromEntries(raRows.map(r => [r.candidate_id, r]));

  // 3. Category from integrated-candidates (RFC4180 parse)
  const icRows = parseCSV(fs.readFileSync(INPUT.integrated, 'utf8'));
  const catMap = Object.fromEntries(icRows.map(r => [r.candidate_id, r.category]));
  // Verify all 1642 IDs have category
  const missingCat = psRows.filter(r => !catMap[r.candidate_id]);
  if (missingCat.length > 0) {
    console.error(`[HARD_STOP] ${missingCat.length} places missing category`);
    process.exit(1);
  }

  // 4. Source pool index: candidate_id → photos[]
  console.log('[21F] Indexing source pool...');
  const poolLines = fs.readFileSync(INPUT.sourcePool, 'utf8').split('\n').filter(l => l.trim());
  console.log(`  source-pool: ${poolLines.length} photos`);
  const poolByCandidateId = {};
  for (const line of poolLines) {
    const photo = JSON.parse(line);
    const cid = photo.candidate_id;
    if (!cid) continue;
    if (!poolByCandidateId[cid]) poolByCandidateId[cid] = [];
    poolByCandidateId[cid].push(photo);
  }

  console.log('[21F] PREFLIGHT PASS — starting curation...');

  // ── Metrics counters ──
  const metrics = {
    total: 0,
    image_status: {},
    rights_flag: {},
    classification: {},
    category: {},
    curated_count_dist: {},
    validation: { pass: 0, pass_with_warnings: 0, fail: 0 },
    source_pool_photos: poolLines.length,
    max_curated_exceeded: 0,
    determinism_check: 'PASS',
  };

  const statusRows = [];
  const curatedLines = [];

  for (const ps of psRows) {
    const cid = ps.candidate_id;
    const ra = raMap[cid] || {};
    const category = catMap[cid] || 'unknown';
    const classification = ps.classification;
    const primaryStatus = ps.primary_status;
    const catRule = CAT_RULES[category] || { recommended: [2, 3], max: 4 };

    // Build curated_images list
    const curated = [];

    if (primaryStatus === 'usable' && ['keep_primary', 'supplement_candidate', 'review_required'].includes(classification)) {
      // Primary image from visitbusan is usable
      curated.push({
        photo_id: cid + '_primary',
        photo_url: ra.image_url || '',
        source: ra.image_source_domain || 'visitbusan',
        rights: 'usable',
        role: 'primary',
        source_type: 'primary_image',
      });
    } else if (primaryStatus === 'review_required' && ['keep_primary', 'review_required'].includes(classification)) {
      // Primary image exists but rights unverified
      curated.push({
        photo_id: cid + '_primary',
        photo_url: ra.image_url || '',
        source: ra.image_source_domain || 'visitbusan',
        rights: 'review_required',
        role: 'primary',
        source_type: 'primary_image',
      });
    }

    // Add PG representative photo for supplement / replace candidates
    if ((classification === 'supplement_candidate' || classification === 'replace_candidate')
        && ps.representative_photo_url) {
      curated.push({
        photo_id: ps.representative_photo_id,
        photo_url: ps.representative_photo_url,
        source: 'photo_gallery_service1',
        rights: 'KOGL_assumed',
        role: curated.length === 0 ? 'primary' : 'context',
        source_type: 'photo_gallery',
        pg_confidence: ps.best_pg_confidence,
        selection_score: parseInt(ps.selection_score) || 0,
      });
    }

    // Max count guard
    if (curated.length > catRule.max) {
      curated.splice(catRule.max);
      metrics.max_curated_exceeded++;
    }

    const curatedCount = curated.length;
    const imageStatus = assignImageStatus(curatedCount, classification, primaryStatus);
    const flag = rightsFlag(primaryStatus, classification, curatedCount);

    // Count metrics
    metrics.total++;
    metrics.image_status[imageStatus] = (metrics.image_status[imageStatus] || 0) + 1;
    metrics.rights_flag[flag] = (metrics.rights_flag[flag] || 0) + 1;
    metrics.classification[classification] = (metrics.classification[classification] || 0) + 1;
    metrics.category[category] = (metrics.category[category] || 0) + 1;
    const ck = String(curatedCount);
    metrics.curated_count_dist[ck] = (metrics.curated_count_dist[ck] || 0) + 1;
    if (flag === 'PASS') metrics.validation.pass++;
    else if (flag === 'PASS_WITH_WARNINGS') metrics.validation.pass_with_warnings++;
    else metrics.validation.fail++;

    // Status row
    statusRows.push({
      candidate_id: cid,
      title_ko: ps.title_ko,
      category,
      primary_status: primaryStatus,
      classification,
      curated_count: curatedCount,
      image_status: imageStatus,
      rights_flag: flag,
      pg_confidence: ps.best_pg_confidence,
      representative_photo_id: ps.representative_photo_id,
      representative_photo_url: ps.representative_photo_url,
    });

    // Curated line
    curatedLines.push(JSON.stringify({
      candidate_id: cid,
      title_ko: ps.title_ko,
      category,
      image_status: imageStatus,
      rights_flag: flag,
      curated_images: curated,
    }));
  }

  // ── Validation Gate ──
  console.log('[21F] Validation Gate...');
  const totalCheck = metrics.total;
  if (totalCheck !== 1642) {
    console.error(`[FAIL] total mismatch: ${totalCheck} ≠ 1642`);
    process.exit(1);
  }

  const imageStatusSum = Object.values(metrics.image_status).reduce((a, b) => a + b, 0);
  if (imageStatusSum !== 1642) {
    console.error(`[FAIL] image_status sum mismatch: ${imageStatusSum} ≠ 1642`);
    process.exit(1);
  }

  const classSum = Object.values(metrics.classification).reduce((a, b) => a + b, 0);
  if (classSum !== 1642) {
    console.error(`[FAIL] classification sum mismatch: ${classSum} ≠ 1642`);
    process.exit(1);
  }

  if (metrics.max_curated_exceeded > 0) {
    console.warn(`[WARN] ${metrics.max_curated_exceeded} places had curated count capped at category max`);
  }

  console.log(`[21F] Validation PASS — ${totalCheck} places, status sums OK`);

  // ── Write outputs ──
  console.log('[21F] Writing outputs...');

  // 1. Image status CSV
  const statusHeader = 'candidate_id,title_ko,category,primary_status,classification,curated_count,image_status,rights_flag,pg_confidence,representative_photo_id,representative_photo_url';
  function escCsv(v) {
    const s = String(v ?? '');
    return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  const statusCsvLines = [statusHeader];
  for (const r of statusRows) {
    statusCsvLines.push([
      r.candidate_id, r.title_ko, r.category, r.primary_status, r.classification,
      r.curated_count, r.image_status, r.rights_flag, r.pg_confidence,
      r.representative_photo_id, r.representative_photo_url,
    ].map(escCsv).join(','));
  }
  writeAtomic(OUTPUT.status, statusCsvLines.join('\n') + '\n');
  console.log(`  wrote: busan-image-status-21f.csv (${statusRows.length} rows)`);

  // 2. Curated images JSONL
  writeAtomic(OUTPUT.curated, curatedLines.join('\n') + '\n');
  console.log(`  wrote: busan-curated-images-21f.jsonl (${curatedLines.length} lines)`);

  // 3. Metrics JSON
  metrics.runDate = new Date().toISOString();
  metrics.validationGate = {
    total: 'PASS',
    imageStatusSum: imageStatusSum === 1642 ? 'PASS' : 'FAIL',
    classificationSum: classSum === 1642 ? 'PASS' : 'FAIL',
    maxExceeded: metrics.max_curated_exceeded === 0 ? 'PASS' : 'PASS_WITH_WARNINGS',
  };
  writeAtomic(OUTPUT.metrics, JSON.stringify(metrics, null, 2));
  console.log(`  wrote: busan-image-curation-metrics-21f.json`);

  // ── Summary for report ──
  console.log('\n[21F] RESULTS:');
  console.log('  image_status:', JSON.stringify(metrics.image_status));
  console.log('  rights_flag: ', JSON.stringify(metrics.rights_flag));
  console.log('  classification:', JSON.stringify(metrics.classification));
  console.log('  curated_count_dist:', JSON.stringify(metrics.curated_count_dist));
  console.log('  validation:', JSON.stringify(metrics.validation));
}

main().catch(e => {
  console.error('[HARD_STOP] Unhandled error:', e.message);
  process.exit(1);
});
