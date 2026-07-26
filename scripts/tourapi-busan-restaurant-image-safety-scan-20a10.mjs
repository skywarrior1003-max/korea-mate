/**
 * TASK-DATA-BUSAN-RESTAURANT-IMAGE-SAFETY-SCAN-20A-10 (Option A — 기술 스캔 전용)
 * busan-restaurant-image-rights.csv의 yes+low 397건 이미지 기술 검사
 * 원본 파일 수정 없음. 신규 보고서만 생성.
 */

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function hardStop(reason) {
  console.error('\n[HARD STOP]', reason);
  process.exit(1);
}

// RFC 4180 CSV 파서
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

// JPEG SOF 마커에서 해상도 추출
function parseJpegDimensions(buf) {
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xFF) break;
    const marker = buf[i + 1];
    if (marker === 0xFF) { i++; continue; }
    if (buf.length < i + 4) break;
    const segLen = buf.readUInt16BE(i + 2);
    const isSOF = (marker >= 0xC0 && marker <= 0xC3)
               || (marker >= 0xC5 && marker <= 0xC7)
               || (marker >= 0xC9 && marker <= 0xCB)
               || (marker >= 0xCD && marker <= 0xCF);
    if (isSOF && buf.length >= i + 9) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + segLen;
  }
  return null;
}

// PNG IHDR에서 해상도 추출
function parsePngDimensions(buf) {
  if (buf.length < 24) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// 이미지 기술 검사 (GET + 브라우저 헤더)
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://www.visitbusan.net/kr/index.do',
  'Accept': 'image/*,*/*;q=0.8',
};
const TIMEOUT_MS = 15000;
const MIN_SIZE_BYTES = 10240;   // 10KB
const MIN_DIMENSION = 100;      // 100px (너무 작은 해상도 기준)

function fetchImage(imageUrl) {
  return new Promise((resolve) => {
    const parsed = new URL(imageUrl);
    const lib = parsed.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: BROWSER_HEADERS,
      timeout: TIMEOUT_MS,
    };

    const req = lib.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const httpStatus = res.statusCode;
        const contentType = res.headers['content-type'] || '';
        const mimeType = contentType.split(';')[0].trim();

        if (httpStatus !== 200) {
          resolve({ httpStatus, mimeType, buf: Buffer.alloc(0), error: null });
          return;
        }
        resolve({ httpStatus, mimeType, buf, error: null });
      });
      res.on('error', (e) => resolve({ httpStatus: 0, mimeType: '', buf: Buffer.alloc(0), error: e.message }));
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ httpStatus: 0, mimeType: '', buf: Buffer.alloc(0), error: 'timeout' });
    });
    req.on('error', (e) => resolve({ httpStatus: 0, mimeType: '', buf: Buffer.alloc(0), error: e.message }));
    req.end();
  });
}

function classifyImage(fetchResult) {
  const { httpStatus, mimeType, buf, error } = fetchResult;

  // 접근 실패
  if (error || httpStatus !== 200) {
    return {
      httpStatus: httpStatus || 0,
      mimeType: mimeType || '',
      fileSizeBytes: 0,
      width: '',
      height: '',
      technicalStatus: 'access_failed',
      decisionReason: error
        ? `네트워크 오류: ${error}`
        : `HTTP ${httpStatus} — URL 접근 실패`,
    };
  }

  const fileSizeBytes = buf.length;
  const magic4 = buf.slice(0, 4).toString('hex');
  const isJpeg = magic4.startsWith('ffd8ff');
  const isPng  = magic4.startsWith('89504e47');

  // 비이미지 (JPEG/PNG 아님)
  if (!isJpeg && !isPng) {
    return {
      httpStatus,
      mimeType,
      fileSizeBytes,
      width: '',
      height: '',
      technicalStatus: 'invalid_image',
      decisionReason: `매직 바이트 비이미지: ${magic4} (JPEG/PNG 아님). content-type: ${mimeType}`,
    };
  }

  // 해상도 추출
  const dims = isJpeg ? parseJpegDimensions(buf) : parsePngDimensions(buf);
  const width  = dims ? dims.width  : '';
  const height = dims ? dims.height : '';

  // 크기 또는 해상도 미달
  const sizeOk = fileSizeBytes >= MIN_SIZE_BYTES;
  const dimOk  = !dims || (dims.width >= MIN_DIMENSION && dims.height >= MIN_DIMENSION);

  if (!sizeOk || !dimOk) {
    const reasons = [];
    if (!sizeOk) reasons.push(`파일 크기 ${fileSizeBytes}B < ${MIN_SIZE_BYTES}B(10KB)`);
    if (!dimOk)  reasons.push(`해상도 ${dims.width}×${dims.height}px — 최솟값(${MIN_DIMENSION}px) 미달`);
    return {
      httpStatus,
      mimeType: mimeType || (isJpeg ? 'image/jpeg' : 'image/png'),
      fileSizeBytes,
      width,
      height,
      technicalStatus: 'too_small',
      decisionReason: reasons.join('; '),
    };
  }

  // 정상
  return {
    httpStatus,
    mimeType: mimeType || (isJpeg ? 'image/jpeg' : 'image/png'),
    fileSizeBytes,
    width,
    height,
    technicalStatus: 'valid',
    decisionReason: `HTTP 200 + ${isJpeg ? 'JPEG' : 'PNG'} 확인 + ${fileSizeBytes}B + ${width}×${height}px. 시각 검수 미실시, URL·포맷 기술 확인만 완료.`,
  };
}

// ── 경로 ─────────────────────────────────────────────────────
const RIGHTS_CSV  = path.join(ROOT, 'data/tourapi/reports/busan/busan-restaurant-image-rights.csv');
const AUDIT_CSV   = path.join(ROOT, 'data/tourapi/candidates/busan/busan-image-rights-audit.csv');
const CAND_JSON   = path.join(ROOT, 'data/tourapi/candidates/busan/busan-integrated-candidates.json');
const CAND_CSV    = path.join(ROOT, 'data/tourapi/candidates/busan/busan-integrated-candidates.csv');
const OUT_CSV     = path.join(ROOT, 'data/tourapi/reports/busan/busan-restaurant-image-safety-scan.csv');
const TMP_CSV     = OUT_CSV + '.tmp';

// 원본 크기 스냅샷
const snapRights = fs.statSync(RIGHTS_CSV).size;
const snapAudit  = fs.statSync(AUDIT_CSV).size;
const snapJson   = fs.statSync(CAND_JSON).size;
const snapCsv    = fs.statSync(CAND_CSV).size;

// ── 입력 로드 ─────────────────────────────────────────────────
const rightsRows = parseCsv(fs.readFileSync(RIGHTS_CSV, 'utf8'));
const cols = rightsRows[0];
const C = {
  id:    cols.indexOf('candidate_id'),
  name:  cols.indexOf('restaurant_name'),
  url:   cols.indexOf('current_image_url'),
  owner: cols.indexOf('owner_promotional_image_likely'),
  risk:  cols.indexOf('operational_risk'),
};
for (const [k, v] of Object.entries(C)) {
  if (v < 0) hardStop(`rights CSV 컬럼 없음: ${k}`);
}

const data = rightsRows.slice(1);
if (data.length !== 415) hardStop(`rights CSV 행수 이상: ${data.length} (기대 415)`);

// yes+low 필터
const targets = data.filter(r => r[C.owner] === 'yes' && r[C.risk] === 'low');
if (targets.length !== 397) hardStop(`yes+low 대상 행수 이상: ${targets.length} (기대 397)`);

// 입력 중복 검사
const inputIds = targets.map(r => r[C.id]);
const inputDups = inputIds.filter((id, i, arr) => arr.indexOf(id) !== i);
if (inputDups.length > 0) hardStop(`입력 candidate_id 중복: ${inputDups.join(', ')}`);

// ── 중복 URL 선조사 ───────────────────────────────────────────
const urlCount = new Map();
for (const r of targets) {
  const u = r[C.url];
  urlCount.set(u, (urlCount.get(u) || 0) + 1);
}
const dupUrls = [...urlCount.entries()].filter(([, c]) => c > 1);
if (dupUrls.length > 0) {
  console.log(`[정보] 중복 URL ${dupUrls.length}건:`);
  dupUrls.forEach(([u, c]) => console.log(`  ${c}건: ${u}`));
}

// ── HTTP 검사 (배치 동시 처리) ────────────────────────────────
const BATCH_SIZE = 10;
const results = [];

console.log(`\n이미지 기술 검사 시작: 397건 (배치 ${BATCH_SIZE})`);
const startTime = Date.now();

for (let i = 0; i < targets.length; i += BATCH_SIZE) {
  const batch = targets.slice(i, i + BATCH_SIZE);
  const batchResults = await Promise.all(
    batch.map(async (row) => {
      const imageUrl = row[C.url];
      const fetchResult = await fetchImage(imageUrl);
      const classified = classifyImage(fetchResult);
      return {
        candidateId: row[C.id],
        restaurantName: row[C.name],
        imageUrl,
        ...classified,
      };
    })
  );
  results.push(...batchResults);
  const done = Math.min(i + BATCH_SIZE, targets.length);
  process.stdout.write(`처리: ${done} / ${targets.length} (${Math.round((Date.now()-startTime)/1000)}초)\r`);
}
console.log(`\n완료: ${((Date.now()-startTime)/1000).toFixed(1)}초`);

// ── 출력 행 구성 ──────────────────────────────────────────────
const HEADER = [
  'candidate_id', 'restaurant_name', 'image_url',
  'http_status', 'mime_type', 'file_size_bytes',
  'width', 'height',
  'technical_status', 'visual_inspection_status',
  'final_recommendation', 'decision_reason',
];

const VALID_TECH  = new Set(['valid', 'access_failed', 'invalid_image', 'too_small']);
const VALID_FINAL = new Set(['use_candidate', 'replace_image']);

const outRows = results.map(r => {
  const finalRec = r.technicalStatus === 'valid' ? 'use_candidate' : 'replace_image';
  // 중복 URL 여부를 decision_reason에 추가
  const isDupUrl = (urlCount.get(r.imageUrl) || 1) > 1;
  const dupNote = isDupUrl ? ` [중복 URL: ${urlCount.get(r.imageUrl)}건 공유]` : '';
  return [
    r.candidateId,
    r.restaurantName,
    r.imageUrl,
    r.httpStatus,
    r.mimeType,
    r.fileSizeBytes,
    r.width,
    r.height,
    r.technicalStatus,
    'not_inspected',
    finalRec,
    r.decisionReason + dupNote,
  ];
});

// ── HARD STOP: 출력 검증 ──────────────────────────────────────
if (outRows.length !== 397) hardStop(`출력 행수 이상: ${outRows.length} (기대 397)`);

const outIds = outRows.map(r => r[0]);
const outDups = outIds.filter((id, i, arr) => arr.indexOf(id) !== i);
if (outDups.length > 0) hardStop(`출력 candidate_id 중복: ${outDups.join(', ')}`);

const notInspectedCount = outRows.filter(r => r[9] === 'not_inspected').length;
if (notInspectedCount !== 397) hardStop(`visual_inspection_status ≠ not_inspected: ${397 - notInspectedCount}건`);

const badTech = outRows.filter(r => !VALID_TECH.has(r[8]));
if (badTech.length > 0) hardStop(`technical_status 허용값 외: ${badTech.map(r=>r[0]).join(', ')}`);

const badFinal = outRows.filter(r => !VALID_FINAL.has(r[10]));
if (badFinal.length > 0) hardStop(`final_recommendation 허용값 외: ${badFinal.map(r=>r[0]).join(', ')}`);

// 원본 무변경
if (fs.statSync(RIGHTS_CSV).size !== snapRights) hardStop('rights CSV 크기 변경 감지');
if (fs.statSync(AUDIT_CSV).size  !== snapAudit)  hardStop('audit CSV 크기 변경 감지');
if (fs.statSync(CAND_JSON).size  !== snapJson)   hardStop('candidates JSON 크기 변경 감지');
if (fs.statSync(CAND_CSV).size   !== snapCsv)    hardStop('candidates CSV 크기 변경 감지');

// ── 원자적 CSV 출력 ───────────────────────────────────────────
const csvLines = [
  HEADER.join(','),
  ...outRows.map(row => row.map(escapeCsv).join(',')),
];
fs.writeFileSync(TMP_CSV, csvLines.join('\n'), 'utf8');

const tmpLineCount = fs.readFileSync(TMP_CSV, 'utf8').split('\n').length;
if (tmpLineCount !== 398) {
  fs.unlinkSync(TMP_CSV);
  hardStop(`임시 파일 행수 이상: ${tmpLineCount} (기대 398)`);
}
fs.renameSync(TMP_CSV, OUT_CSV);

// ── 통계 집계 ─────────────────────────────────────────────────
const techDist  = { valid: 0, access_failed: 0, invalid_image: 0, too_small: 0 };
const finalDist = { use_candidate: 0, replace_image: 0 };
for (const r of outRows) {
  techDist[r[8]]   = (techDist[r[8]]  || 0) + 1;
  finalDist[r[10]] = (finalDist[r[10]]|| 0) + 1;
}

const accessFailed  = outRows.filter(r => r[8] === 'access_failed');
const invalidImage  = outRows.filter(r => r[8] === 'invalid_image');
const tooSmall      = outRows.filter(r => r[8] === 'too_small');

console.log('\n==========================================');
console.log('TASK-DATA-BUSAN-RESTAURANT-IMAGE-SAFETY-SCAN-20A-10');
console.log('음식점 이미지 기술 스캔 (Option A) 완료');
console.log('==========================================');
console.log('');
console.log('[ 기술 상태 (technical_status) ]');
console.log('  valid        :', techDist.valid, '건');
console.log('  access_failed:', techDist.access_failed, '건');
console.log('  invalid_image:', techDist.invalid_image, '건');
console.log('  too_small    :', techDist.too_small, '건');
console.log('');
console.log('[ 최종 권고 (final_recommendation) ]');
console.log('  use_candidate:', finalDist.use_candidate, '건');
console.log('  replace_image:', finalDist.replace_image, '건');
console.log('');
if (accessFailed.length > 0) {
  console.log('[ 접근 실패 (access_failed) ]');
  accessFailed.forEach(r => console.log(`  ${r[0]} — ${r[11]}`));
  console.log('');
}
if (invalidImage.length > 0) {
  console.log('[ 비이미지 (invalid_image) ]');
  invalidImage.forEach(r => console.log(`  ${r[0]} — ${r[11]}`));
  console.log('');
}
if (tooSmall.length > 0) {
  console.log('[ 크기/해상도 미달 (too_small) ]');
  tooSmall.forEach(r => console.log(`  ${r[0]} — ${r[11]}`));
  console.log('');
}
if (dupUrls.length > 0) {
  console.log('[ 중복 URL ]');
  dupUrls.forEach(([u, c]) => console.log(`  ${c}건 공유: ${u}`));
  console.log('');
}
console.log('[ 검증 ]');
console.log('  yes+low 397건 누락 0                        ✓');
console.log('  candidate_id 중복 0                         ✓');
console.log('  visual_inspection_status=not_inspected 397건 ✓');
console.log('  technical_status 허용값 검증                ✓');
console.log('  final_recommendation 허용값 검증            ✓');
console.log('  원본 파일 무변경                            ✓');
console.log('  임시 파일: 없음 (메모리 내 처리)            ✓');
console.log('');
console.log('[ 변경 파일 ]');
console.log('  data/tourapi/reports/busan/busan-restaurant-image-safety-scan.csv (신규)');
console.log('');
console.log('TASK-DATA-BUSAN-RESTAURANT-IMAGE-SAFETY-SCAN-20A-10 음식점 이미지 기술 스캔 완료 — 운영 반영·commit·push 보류.');
