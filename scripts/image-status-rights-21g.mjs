/**
 * TASK-DATA-IMAGE-STATUS-AND-RIGHTS-21G
 * 21F 결과 재분류 + VisitBusan 권리 분류.
 * API 호출 없음. 기존 파일 read-only.
 */

import fs from 'fs';
import crypto from 'crypto';

const BASE = 'c:/기본저장/나의 프로젝트/KoreaMate/korea-mate';

const INPUT = {
  status21f:   `${BASE}/data/tourapi/reports/busan/busan-image-status-21f.csv`,
  curated21f:  `${BASE}/data/tourapi/reports/busan/busan-curated-images-21f.jsonl`,
  metrics21f:  `${BASE}/data/tourapi/reports/busan/busan-image-curation-metrics-21f.json`,
  rightsAudit: `${BASE}/data/tourapi/candidates/busan/busan-image-rights-audit.csv`,
};

const OUTPUT = {
  status:  `${BASE}/data/tourapi/reports/busan/busan-image-status-21g.csv`,
  rights:  `${BASE}/data/tourapi/reports/busan/busan-visitbusan-rights-21g.csv`,
  metrics: `${BASE}/data/tourapi/reports/busan/busan-image-status-rights-metrics-21g.json`,
  report:  `${BASE}/docs/tourapi/busan-image-status-rights-21g.md`,
};

// ---------- RFC4180 parser ----------
function parseCSVLine(line) {
  const cols = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (c === ',' && !inQ) { cols.push(cur); cur = ''; }
    else cur += c;
  }
  cols.push(cur); return cols;
}
function parseCSV(text) {
  const lines = text.replace(/^\uFEFF/, '').split('\n').filter(l => l.trim());
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map(l => {
    const cols = parseCSVLine(l);
    const o = {}; headers.forEach((h, i) => o[h] = cols[i] ?? '');
    return o;
  });
}

// ---------- CSV escape ----------
function escCsv(v) {
  const s = String(v ?? '');
  return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ---------- Atomic write ----------
function writeAtomic(p, content) {
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, p);
}

// ---------- File hash for 21F integrity check ----------
function fileHash(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

// ---------- Rights classification logic ----------
function classifyRights(ra) {
  // All 958 have license_type=unknown, license_verification=unverified, evidence_level=domain_inferred
  if (ra.decision_reason.includes('all_rights_reserved')) {
    return {
      vb_rights_class: 'rights_restricted',
      vb_rights_basis: 'all_rights_reserved_visitbusan',
      operational_blocked: true,
      block_reason: '명시적 all_rights_reserved — 개별 허가 없이 사용 불가',
    };
  }
  // image_source 미기록, image_license 미기록
  return {
    vb_rights_class: 'rights_unknown',
    vb_rights_basis: 'no_source_no_license',
    operational_blocked: true,
    block_reason: '출처·라이선스 미기록 — 권리 확인 불가',
  };
}

// ---------- image_status re-classification ----------
function reclassifyStatus(curated, originalStatus) {
  if (originalStatus !== 'image_partial') return originalStatus; // source_exhausted, image_missing unchanged

  if (curated.curated_images.length === 0) return 'image_missing'; // safety (should not occur)

  // Has at least one photo with confirmed operational rights
  const hasConfirmed = curated.curated_images.some(
    c => c.rights === 'usable' || c.rights === 'KOGL_assumed'
  );
  if (hasConfirmed) return 'image_sufficient';

  // All photos have review_required rights → 실제 보강 필요
  return 'image_partial';
}

// ---------- MAIN ----------
async function main() {
  console.log('[21G] PREFLIGHT START');

  // Preflight #9: all inputs exist
  for (const [k, p] of Object.entries(INPUT)) {
    if (!fs.existsSync(p)) { console.error(`[HARD_STOP] missing input: ${k} — ${p}`); process.exit(1); }
  }

  // Record 21F file hashes for integrity check
  const hash21fBefore = {
    status:  fileHash(INPUT.status21f),
    curated: fileHash(INPUT.curated21f),
    metrics: fileHash(INPUT.metrics21f),
  };

  // Preflight #8: output paths must not collide with 21F outputs
  for (const [k, p] of Object.entries(OUTPUT)) {
    if (Object.values(INPUT).includes(p)) {
      console.error(`[HARD_STOP] output path collides with input: ${p}`); process.exit(1);
    }
  }

  console.log('[21G] Loading 21F status...');
  const status21f = parseCSV(fs.readFileSync(INPUT.status21f, 'utf8'));
  console.log(`  status-21f: ${status21f.length} rows`);
  if (status21f.length !== 1642) {
    console.error(`[HARD_STOP] status-21f count mismatch: ${status21f.length}`); process.exit(1);
  }

  console.log('[21G] Loading 21F curated JSONL...');
  const curated21f = fs.readFileSync(INPUT.curated21f, 'utf8')
    .split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
  if (curated21f.length !== 1642) {
    console.error(`[HARD_STOP] curated-21f count mismatch: ${curated21f.length}`); process.exit(1);
  }
  const curatedMap = Object.fromEntries(curated21f.map(r => [r.candidate_id, r]));

  console.log('[21G] Loading rights audit...');
  const raRows = parseCSV(fs.readFileSync(INPUT.rightsAudit, 'utf8'));
  if (raRows.length !== 1642) {
    console.error(`[HARD_STOP] rights-audit count mismatch: ${raRows.length}`); process.exit(1);
  }
  const raMap = Object.fromEntries(raRows.map(r => [r.candidate_id, r]));

  // Verify 958 review_required in rights audit
  const reviewCount = raRows.filter(r => r.operational_image_decision === 'review_required').length;
  if (reviewCount !== 958) {
    console.error(`[HARD_STOP] rights review_required count mismatch: ${reviewCount} ≠ 958`); process.exit(1);
  }

  console.log('[21G] PREFLIGHT PASS');

  // ── Processing ──
  const metrics = {
    total: 0,
    image_status_before: {},
    image_status_after: {},
    sufficient_by_category: {},
    partial_remaining_by_category: {},
    rights_class: {},
    operational_blocked: 0,
    determinism_check: 'PASS',
  };

  const statusRows = [];
  const rightsRows = [];

  for (const s21f of status21f) {
    const cid = s21f.candidate_id;
    const curated = curatedMap[cid];
    const ra = raMap[cid];

    if (!curated || !ra) {
      console.error(`[HARD_STOP] missing join for ${cid}`); process.exit(1);
    }

    // Re-classify image_status
    const newStatus = reclassifyStatus(curated, s21f.image_status);

    metrics.total++;
    metrics.image_status_before[s21f.image_status] = (metrics.image_status_before[s21f.image_status] || 0) + 1;
    metrics.image_status_after[newStatus] = (metrics.image_status_after[newStatus] || 0) + 1;

    if (newStatus === 'image_sufficient') {
      metrics.sufficient_by_category[s21f.category] = (metrics.sufficient_by_category[s21f.category] || 0) + 1;
    }
    if (newStatus === 'image_partial') {
      metrics.partial_remaining_by_category[s21f.category] = (metrics.partial_remaining_by_category[s21f.category] || 0) + 1;
    }

    statusRows.push({
      candidate_id: cid,
      title_ko: s21f.title_ko,
      category: s21f.category,
      classification: s21f.classification,
      curated_count: s21f.curated_count,
      image_status_21f: s21f.image_status,
      image_status_21g: newStatus,
      status_changed: s21f.image_status !== newStatus ? 'yes' : 'no',
      rights_flag: s21f.rights_flag,
    });

    // Rights classification for the 958 VB review_required items
    if (ra.operational_image_decision === 'review_required') {
      const rc = classifyRights(ra);
      metrics.rights_class[rc.vb_rights_class] = (metrics.rights_class[rc.vb_rights_class] || 0) + 1;
      if (rc.operational_blocked) metrics.operational_blocked++;

      rightsRows.push({
        candidate_id: cid,
        title_ko: s21f.title_ko,
        category: s21f.category,
        image_url: ra.image_url,
        image_source_domain: ra.image_source_domain,
        image_source_type: ra.image_source_type,
        copyright_holder: ra.copyright_holder,
        license_type: ra.license_type,
        evidence_level: ra.evidence_level,
        vb_rights_class: rc.vb_rights_class,
        vb_rights_basis: rc.vb_rights_basis,
        operational_blocked: rc.operational_blocked ? 'true' : 'false',
        block_reason: rc.block_reason,
        original_decision_reason: ra.decision_reason,
      });
    }
  }

  // ── Validation Gate ──
  console.log('[21G] Validation Gate...');

  const afterSum = Object.values(metrics.image_status_after).reduce((a,b)=>a+b,0);
  if (afterSum !== 1642) {
    console.error(`[FAIL] image_status_after sum mismatch: ${afterSum}`); process.exit(1);
  }

  if (rightsRows.length !== 958) {
    console.error(`[FAIL] rights rows mismatch: ${rightsRows.length} ≠ 958`); process.exit(1);
  }

  const blockedSum = rightsRows.filter(r => r.operational_blocked === 'true').length;
  if (blockedSum !== metrics.operational_blocked) {
    console.error(`[FAIL] blocked sum mismatch`); process.exit(1);
  }

  // Status unchanged check (source_exhausted, image_missing must not change)
  const wrongChange = statusRows.filter(r =>
    ['source_exhausted','image_missing'].includes(r.image_status_21f) && r.status_changed === 'yes'
  );
  if (wrongChange.length > 0) {
    console.error(`[FAIL] source_exhausted/image_missing wrongly changed: ${wrongChange.length}`); process.exit(1);
  }

  // Determinism check: re-run classification for first 10 rows and compare
  let detOk = true;
  for (const s21f of status21f.slice(0, 10)) {
    const cid = s21f.candidate_id;
    const curated = curatedMap[cid];
    const check = reclassifyStatus(curated, s21f.image_status);
    const stored = statusRows.find(r => r.candidate_id === cid);
    if (stored.image_status_21g !== check) { detOk = false; break; }
  }
  if (!detOk) {
    console.error('[FAIL] determinism check failed'); process.exit(1);
  }

  // 21F file integrity check
  const hash21fAfter = {
    status:  fileHash(INPUT.status21f),
    curated: fileHash(INPUT.curated21f),
    metrics: fileHash(INPUT.metrics21f),
  };
  for (const k of Object.keys(hash21fBefore)) {
    if (hash21fBefore[k] !== hash21fAfter[k]) {
      console.error(`[HARD_STOP] 21F file modified: ${k}`); process.exit(1);
    }
  }

  console.log('[21G] Validation PASS');

  // ── Write outputs ──
  console.log('[21G] Writing outputs...');

  // 1. Image status CSV
  const statusHeader = 'candidate_id,title_ko,category,classification,curated_count,image_status_21f,image_status_21g,status_changed,rights_flag';
  const statusCsv = [statusHeader, ...statusRows.map(r =>
    [r.candidate_id, r.title_ko, r.category, r.classification, r.curated_count,
     r.image_status_21f, r.image_status_21g, r.status_changed, r.rights_flag].map(escCsv).join(',')
  )].join('\n') + '\n';
  writeAtomic(OUTPUT.status, statusCsv);
  console.log(`  wrote: busan-image-status-21g.csv (${statusRows.length} rows)`);

  // 2. Rights classification CSV
  const rightsHeader = 'candidate_id,title_ko,category,image_url,image_source_domain,image_source_type,copyright_holder,license_type,evidence_level,vb_rights_class,vb_rights_basis,operational_blocked,block_reason,original_decision_reason';
  const rightsCsv = [rightsHeader, ...rightsRows.map(r =>
    [r.candidate_id, r.title_ko, r.category, r.image_url, r.image_source_domain,
     r.image_source_type, r.copyright_holder, r.license_type, r.evidence_level,
     r.vb_rights_class, r.vb_rights_basis, r.operational_blocked, r.block_reason,
     r.original_decision_reason].map(escCsv).join(',')
  )].join('\n') + '\n';
  writeAtomic(OUTPUT.rights, rightsCsv);
  console.log(`  wrote: busan-visitbusan-rights-21g.csv (${rightsRows.length} rows)`);

  // 3. Metrics JSON
  metrics.runDate = new Date().toISOString();
  metrics.validationGate = {
    total_1642: afterSum === 1642 ? 'PASS' : 'FAIL',
    rights_958: rightsRows.length === 958 ? 'PASS' : 'FAIL',
    source_exhausted_unchanged: wrongChange.length === 0 ? 'PASS' : 'FAIL',
    determinism: detOk ? 'PASS' : 'FAIL',
    file_21f_integrity: 'PASS',
  };
  writeAtomic(OUTPUT.metrics, JSON.stringify(metrics, null, 2));
  console.log(`  wrote: busan-image-status-rights-metrics-21g.json`);

  // ── Summary ──
  console.log('\n[21G] RESULTS:');
  console.log('  image_status BEFORE:', JSON.stringify(metrics.image_status_before));
  console.log('  image_status AFTER: ', JSON.stringify(metrics.image_status_after));
  console.log('  image_sufficient by category:', JSON.stringify(metrics.sufficient_by_category));
  console.log('  image_partial remaining by category:', JSON.stringify(metrics.partial_remaining_by_category));
  console.log('  rights_class:', JSON.stringify(metrics.rights_class));
  console.log('  operational_blocked:', metrics.operational_blocked);
}

main().catch(e => {
  console.error('[HARD_STOP] Unhandled error:', e.message);
  process.exit(1);
});
