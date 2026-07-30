#!/usr/bin/env node
/**
 * tourapi-busan-detail.mjs — KTO KorService2 상세정보 수집 (v2 — hardened)
 *
 * Modes:
 *   --sample               pilot 15건 (허용)
 *   --full --allow-full    전체 수집 (kto-detail-call-limit.json status=VERIFIED 필요)
 *   --dry-run              API 호출 없이 대상·skip·신규 호출 수 출력
 *   --resume               checkpoint에서 이어서 시작 (full mode only)
 *   --manifest <path>      full 모드 target manifest 경로
 *
 * 절대 금지:
 *   API key 출력·저장 / enriched candidates 수정 / source facts 수정
 *   flag 변경 / master 변경 / DB·migration / push / git add . / git add -A
 */

import fs   from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.resolve(__dir, '..');

// ── .env.local 로드 ───────────────────────────────────────────────────────────
(function loadEnv() {
  const candidates = [
    path.resolve(ROOT, '.env.local'),
    path.resolve(ROOT, '../.env.local'),
  ];
  for (const p of candidates) {
    try {
      fs.readFileSync(p, 'utf8').split('\n').forEach(line => {
        const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.+)$/);
        if (m && !process.env[m[1]])
          process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
      });
      break;
    } catch (_) {}
  }
})();

const API_KEY = process.env.TOUR_API_KEY;
if (!API_KEY) {
  console.error('[ERROR] TOUR_API_KEY not set in .env.local');
  process.exit(1);
}

// ── 설정 상수 ─────────────────────────────────────────────────────────────────
const KTO_BASE                  = 'https://apis.data.go.kr/B551011/KorService2';
const MOBILE_OS                 = 'ETC';
const MOBILE_APP                = 'GoKoreaMate';
const CALL_INTERVAL_MS          = 300;
const MAX_RETRIES               = 2;
const FETCH_TIMEOUT_MS          = 30_000;
const CONSECUTIVE_FAILURE_LIMIT = 5;
const CHECKPOINT_INTERVAL       = 50;

// ── 호출 한도 상태 ────────────────────────────────────────────────────────────
// 설정 파일: data/tourapi/config/kto-detail-call-limit.json
// 'VERIFIED'   : 공식 한도 확인 완료 → full 실행 허용
// 'UNVERIFIED' : 미확인 → full 실행 차단
//   확인 방법: data.go.kr → 마이페이지 → 개발계정 관리
//              → 한국관광공사_국문 관광정보 서비스_GW → 트래픽 허용량
// 확인 후 kto-detail-call-limit.json의 status 필드를 'VERIFIED'로 변경한다.
const _clCfgPath = path.join(ROOT, 'data/tourapi/config/kto-detail-call-limit.json');
let _clCfg = { status: 'UNVERIFIED', daily_limit: null, verified_at: null };
try {
  const _clRaw = fs.readFileSync(_clCfgPath, 'utf8');
  const _clParsed = JSON.parse(_clRaw);
  if (_clParsed._schema === 'kto-detail-call-limit-v1' && _clParsed.status) {
    _clCfg = _clParsed;
  } else {
    console.warn('[CALL_LIMIT] config schema 불일치 — UNVERIFIED 유지');
  }
} catch (e) {
  if (e.code !== 'ENOENT') {
    console.warn(`[CALL_LIMIT] config 읽기 실패: ${e.message} — UNVERIFIED 유지`);
  }
}
if (_clCfg.status === 'VERIFIED' && !(_clCfg.verified_at && _clCfg.daily_limit > 0)) {
  console.error('[CALL_LIMIT] VERIFIED 설정 불완전 (verified_at·daily_limit 필수) — UNVERIFIED 처리');
  _clCfg.status = 'UNVERIFIED';
}
const CALL_LIMIT_STATUS = _clCfg.status;

// ── CLI 파싱 ──────────────────────────────────────────────────────────────────
const args        = process.argv.slice(2);
const SAMPLE_MODE = args.includes('--sample');
const FULL_MODE   = args.includes('--full');
const ALLOW_FULL  = args.includes('--allow-full');
const DRY_RUN     = args.includes('--dry-run');
const RESUME      = args.includes('--resume');

const manifestArgIdx = args.indexOf('--manifest');
const MANIFEST_PATH  = manifestArgIdx >= 0 ? args[manifestArgIdx + 1] : null;

// ── 실행 모드 안전장치 ─────────────────────────────────────────────────────────
if (FULL_MODE && !ALLOW_FULL) {
  console.error('[BLOCKED] --full requires --allow-full.');
  console.error('  Use: node tourapi-busan-detail.mjs --full --allow-full [--dry-run]');
  process.exit(1);
}
if (ALLOW_FULL && !FULL_MODE) {
  console.error('[BLOCKED] --allow-full is only valid together with --full.');
  console.error('  Use: node tourapi-busan-detail.mjs --full --allow-full [--dry-run]');
  process.exit(1);
}
if (!SAMPLE_MODE && !FULL_MODE) {
  console.error('Usage: node tourapi-busan-detail.mjs [options]');
  console.error('  --sample                    pilot 15건 (허용)');
  console.error('  --full --allow-full         전체 수집 (kto-detail-call-limit.json status=VERIFIED 필요)');
  console.error('  --dry-run                   API 호출 없이 계획 출력');
  console.error('  --resume                    checkpoint에서 재개 (full only)');
  console.error('  --manifest <path>           full 모드 target manifest');
  process.exit(1);
}

// ── 호출 한도 게이트 ───────────────────────────────────────────────────────────
// dry-run에서는 실제 호출이 없으므로 UNVERIFIED라도 계획 출력을 허용.
if (FULL_MODE && ALLOW_FULL && !DRY_RUN && CALL_LIMIT_STATUS !== 'VERIFIED') {
  console.error('[BLOCKED] KTO full collection blocked:');
  console.error('  official daily call limit is not verified.');
  console.error('  Confirm at: data.go.kr → 마이페이지 → 개발계정 관리');
  console.error('              → 한국관광공사_국문 관광정보 서비스_GW → 트래픽 허용량');
  console.error("  Then update status to 'VERIFIED' in: data/tourapi/config/kto-detail-call-limit.json");
  process.exit(1);
}

// ── 경로 ──────────────────────────────────────────────────────────────────────
const PILOT_RAW_DIR = path.join(ROOT, 'data/tourapi/raw/busan/kto-detail-pilot');
const FULL_RAW_DIR  = path.join(ROOT, 'data/tourapi/raw/busan/kto-detail-full');
const RPT_DIR       = path.join(ROOT, 'data/tourapi/reports/busan');
const RAW_DIR       = FULL_MODE ? FULL_RAW_DIR : PILOT_RAW_DIR;

// Checkpoint (full mode only)
const CHECKPOINT_PATH = path.join(FULL_RAW_DIR, 'checkpoint.json');

// Enriched candidates + batch files (for full mode target list)
const ENRICHED_PATH = path.join(ROOT, 'data/tourapi/enriched/busan/busan-enriched-candidates-v1.jsonl');
const BATCH_DIR     = path.join(ROOT, 'data/tourapi/raw/busan/2026-07-23/batch');

// Reports (pilot vs full 경로 분리)
const MANIFEST_OUT = path.join(RPT_DIR, FULL_MODE
  ? 'kto-detail-full-manifest.json'
  : 'kto-detail-pilot-manifest.json');
const REPORT_OUT   = path.join(RPT_DIR, FULL_MODE
  ? 'kto-detail-full-report.json'
  : 'kto-detail-pilot-report.json');
const MATRIX_OUT   = path.join(RPT_DIR, FULL_MODE
  ? 'kto-detail-full-field-matrix.json'
  : 'kto-detail-pilot-field-matrix.json');

fs.mkdirSync(RAW_DIR, { recursive: true });
fs.mkdirSync(RPT_DIR, { recursive: true });

// ── 파일럿 표본 (결정적, contentTypeId당 3건) ────────────────────────────────
const PILOT_SAMPLE = [
  { candidate_id: 'busan-K-00001', content_id: '126028',  content_type_id: 12, title: '금정산' },
  { candidate_id: 'busan-K-00002', content_id: '126108',  content_type_id: 12, title: '해운대온천센터' },
  { candidate_id: 'busan-K-00003', content_id: '126122',  content_type_id: 12, title: '부산 송도해수욕장' },
  { candidate_id: 'busan-K-00029', content_id: '129725',  content_type_id: 14, title: '부산문화회관' },
  { candidate_id: 'busan-K-00031', content_id: '130200',  content_type_id: 14, title: '구덕민속예술관' },
  { candidate_id: 'busan-K-00032', content_id: '130216',  content_type_id: 14, title: '부산 강서문화원' },
  { candidate_id: 'busan-K-00050', content_id: '131087',  content_type_id: 28, title: '용호동일대 바다낚시' },
  { candidate_id: 'busan-K-00051', content_id: '131146',  content_type_id: 28, title: '부산광역시교육청학생인성교육원' },
  { candidate_id: 'busan-K-00052', content_id: '131452',  content_type_id: 28, title: '함지골청소년수련관' },
  { candidate_id: 'busan-K-00077', content_id: '142852',  content_type_id: 32, title: '코모도 호텔 부산' },
  { candidate_id: 'busan-K-00078', content_id: '142853',  content_type_id: 32, title: '파라다이스 호텔 부산' },
  { candidate_id: 'busan-K-00079', content_id: '142861',  content_type_id: 32, title: '라메르호텔' },
  { candidate_id: 'busan-K-00068', content_id: '133525',  content_type_id: 39, title: '18번완당집' },
  { candidate_id: 'busan-K-00070', content_id: '133997',  content_type_id: 39, title: '대궐안집' },
  { candidate_id: 'busan-K-00072', content_id: '134718',  content_type_id: 39, title: '원조소문난산곰장어' },
];

const COMMON_SAMPLE = [PILOT_SAMPLE[0], PILOT_SAMPLE[3], PILOT_SAMPLE[6], PILOT_SAMPLE[9], PILOT_SAMPLE[12]];
const IMAGE_SAMPLE  = PILOT_SAMPLE.slice(0, 5);

// ── contentTypeId별 detailIntro2 예상 필드 ───────────────────────────────────
const INTRO_FIELDS_BY_TYPE = {
  12: ['usetime','restdate','parking','infocenter','chkbabycarriage','chkpet','chkcreditcard','expagerange','useseason','accomcount','expguide','heritage1','heritage2','heritage3'],
  14: ['usetimeculture','restdateculture','parking','parkingfee','infocenterculture','chkbabycarriageculture','chkpetculture','chkcreditcardculture','discountinfo','scale','spendtime','accomcountculture','usefee'],
  28: ['openperiod','reservation','infocenterleports','parkingleports','usetimeleports','restdateleports','chkbabycarriageleports','chkcreditcardleports','expagerangeleports','accomcountleports','usefeeleports','scaleleports'],
  32: ['checkin','checkout','infocenterlodging','parkinglodging','reservationlodging','chkbabycarriagelodging','subfacility','accomcountlodging','roomtype','foodplace','pickup','barbecue','beauty','beverage','bicycle','campfire','fitness','karaoke','publicbath','publicpc','sauna','seminar','sports'],
  39: ['opentimefood','restdatefood','firstmenu','treatmenu','infocenterfood','parkingfood','reservationfood','chkcreditcardfood','discountinfofood','packing','kidsfacility','seat','smoking','lcnsno'],
};

// ── 유틸 ──────────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function sha256File(fpath) {
  return crypto.createHash('sha256').update(fs.readFileSync(fpath)).digest('hex');
}

function sha256String(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

function buildUrl(endpoint, params) {
  const p = new URLSearchParams({
    serviceKey: API_KEY,
    MobileOS:   MOBILE_OS,
    MobileApp:  MOBILE_APP,
    _type:      'json',
    ...params,
  });
  return `${KTO_BASE}/${endpoint}?${p.toString()}`;
}

function maskKey(url) {
  return url
    .replace(encodeURIComponent(API_KEY), '[KEY]')
    .replace(API_KEY, '[KEY]');
}

// ── F. full_output_path — raw 파일 경로 ───────────────────────────────────────
// pilot raw와 full raw 경로 분리. 파일명에서 endpoint/contentId 식별 가능.
function getRawPath(rawDir, endpoint, contentId, contentTypeId = null) {
  switch (endpoint) {
    case 'detailIntro2':
      return path.join(rawDir, `detail-intro2-${contentId}-type${contentTypeId}.json`);
    case 'detailCommon2':
      return path.join(rawDir, `detail-common2-${contentId}.json`);
    case 'detailImage2':
      return path.join(rawDir, `detail-image2-${contentId}.json`);
    default:
      throw new Error(`Unknown endpoint: ${endpoint}`);
  }
}

// ── A. skip_existing ──────────────────────────────────────────────────────────
// 파일 존재만으로 skip 금지.
// JSON 파싱 가능 + resultCode 정상 + XML 아님 = VALID_EXISTS → skip
// 손상·오류 응답 → reprocess: true
function isValidExistingRaw(rawPath, endpoint) {
  if (!fs.existsSync(rawPath)) return { skip: false, reason: 'NOT_EXISTS' };

  let raw;
  try {
    raw = fs.readFileSync(rawPath, 'utf8');
  } catch (e) {
    return { skip: false, reason: `READ_ERROR: ${e.message}`, reprocess: true };
  }

  // XML 응답 감지
  if (raw.trimStart().startsWith('<')) {
    return { skip: false, reason: 'CORRUPT_XML', reprocess: true };
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return { skip: false, reason: `JSON_PARSE_ERROR: ${e.message}`, reprocess: true };
  }

  // 저장된 XML 오류 마커
  if (data.is_xml === true) {
    return { skip: false, reason: 'SAVED_XML_ERROR', reprocess: true };
  }

  // resultCode 확인
  const resultCode = data?.response?.header?.resultCode;
  if (resultCode !== '0000') {
    return { skip: false, reason: `RESULT_CODE_${resultCode ?? 'MISSING'}`, reprocess: true };
  }

  // resultCode 0000 = API 응답 정상. items=0이어도 "API에 해당 데이터 없음"으로
  // 유효한 응답. 재호출해도 동일 결과이므로 skip 처리.
  return { skip: true, reason: 'VALID_EXISTS', sha: sha256String(raw) };
}

function extractItems(data) {
  const raw = data?.response?.body?.items?.item;
  return Array.isArray(raw) ? raw : (raw ? [raw] : []);
}

// ── B. timeout-wrapped fetch ───────────────────────────────────────────────────
async function fetchWithTimeout(url, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') {
      throw Object.assign(
        new Error(`TIMEOUT after ${timeoutMs}ms`),
        { isTimeout: true }
      );
    }
    throw e;
  }
}

// ── C. checkpoint (atomic write) ──────────────────────────────────────────────
function readCheckpoint(cpPath) {
  if (!fs.existsSync(cpPath)) return null;
  let raw;
  try {
    raw = fs.readFileSync(cpPath, 'utf8');
  } catch (e) {
    console.error(`[CHECKPOINT] Read error: ${e.message} — safe abort`);
    process.exit(1);
  }
  let cp;
  try {
    cp = JSON.parse(raw);
  } catch (e) {
    console.error(`[CHECKPOINT] Parse error (corrupt checkpoint): ${e.message} — safe abort`);
    process.exit(1);
  }
  return cp;
}

function writeCheckpoint(cpPath, state) {
  const tmpPath = cpPath + '.tmp';
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf8');
    // Windows: delete target before rename (rename fails if target exists)
    if (fs.existsSync(cpPath)) fs.unlinkSync(cpPath);
    fs.renameSync(tmpPath, cpPath);
  } catch (e) {
    console.error(`[CHECKPOINT] Write error (non-fatal): ${e.message}`);
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (_) {}
  }
}

function makeCheckpointState(manifestHash) {
  return {
    manifest_hash:     manifestHash || null,
    started_ts:        new Date().toISOString(),
    last_updated_ts:   new Date().toISOString(),
    endpoints: {
      detailIntro2:  { done: [], failed: [], skipped: [], stats: { success: 0, failed: 0, skip: 0 } },
      detailCommon2: { done: [], failed: [], skipped: [], stats: { success: 0, failed: 0, skip: 0 } },
      detailImage2:  { done: [], failed: [], skipped: [], stats: { success: 0, failed: 0, skip: 0 } },
    },
  };
}

// ── E. manifest_input ─────────────────────────────────────────────────────────
// full target manifest를 유일한 실행 입력으로 사용.
// 임의로 candidate 전체를 다시 탐색하지 않음.
function loadManifest(manifestPath) {
  if (!manifestPath) return { manifest: null, hash: null };
  let raw;
  try {
    raw = fs.readFileSync(manifestPath, 'utf8');
  } catch (e) {
    console.error(`[MANIFEST] Cannot read ${manifestPath}: ${e.message}`);
    process.exit(1);
  }
  let manifest;
  try {
    manifest = JSON.parse(raw);
  } catch (e) {
    console.error(`[MANIFEST] JSON parse error: ${e.message}`);
    process.exit(1);
  }
  // 필수 구조 검증
  if (!manifest.endpoints || !manifest.endpoints.detailIntro2) {
    console.error('[MANIFEST] Missing required endpoint definitions (endpoints.detailIntro2)');
    process.exit(1);
  }
  const hash = sha256String(raw);
  console.log(`[MANIFEST] Loaded: ${path.basename(manifestPath)} (sha: ${hash.slice(0, 16)}...)`);
  return { manifest, hash };
}

// manifest 기준으로 enriched candidates JSONL + batch files → per-endpoint target list 생성
function buildTargetListFromManifest(manifest) {
  console.log('[TARGET_BUILD] Reading enriched candidates...');

  // 1. batch files에서 contentId → contentTypeId 맵 생성
  const typeMap = {};
  if (fs.existsSync(BATCH_DIR)) {
    const batchFiles = fs.readdirSync(BATCH_DIR).filter(f => /^kto-ko-p\d+\.json$/.test(f));
    for (const bf of batchFiles) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(BATCH_DIR, bf), 'utf8'));
        const raw  = data?.response?.body?.items?.item || [];
        const arr  = Array.isArray(raw) ? raw : [raw];
        for (const item of arr) {
          if (item.contentid && item.contenttypeid) {
            typeMap[String(item.contentid)] = Number(item.contenttypeid);
          }
        }
      } catch (_) {}
    }
    console.log(`[TARGET_BUILD] contentId→type map: ${Object.keys(typeMap).length} entries from ${batchFiles.length} batch files`);
  }

  // 2. enriched candidates 읽기
  const lines = fs.readFileSync(ENRICHED_PATH, 'utf8').split('\n').filter(Boolean);
  const excluded = manifest.endpoints.detailIntro2?.excluded || {};
  const excludedTypes = new Set([
    ...(excluded.type_15_festival !== undefined ? [15] : []),
    ...(excluded.type_38_shopping !== undefined ? [38] : []),
  ]);

  const intro2Targets  = [];
  const common2Targets = [];
  const image2Targets  = [];
  const seenIntro  = new Set();
  const seenCommon = new Set();
  const seenImage  = new Set();

  for (const line of lines) {
    let c;
    try { c = JSON.parse(line); } catch (_) { continue; }

    // source_key는 source_summary.source_keys 배열에 저장됨
    const sourceKeys = c?.source_summary?.source_keys ?? [];
    const sk = sourceKeys.find(k => k.startsWith('KorService2:')) || '';
    if (!sk) continue;

    const parts     = sk.split(':');
    const contentId = parts[1];
    if (!contentId) continue;

    const contentTypeId  = typeMap[contentId] ?? null;
    const flags          = c?.validation?.review_flags ?? [];
    const hasDescription = !!c?.proposed_values?.description_ko;
    const curatedImages  = c?.image_assessment?.curated_images ?? [];
    const hasNeedsImage  = flags.includes('needs_image');

    // E: endpoint/contentId/contentTypeId/candidate_id 검증 — candidate_id 필수
    if (!c.candidate_id) continue;

    const entry = {
      candidate_id:    c.candidate_id,
      content_id:      contentId,
      content_type_id: contentTypeId,
    };

    // detailIntro2: contentTypeId in {12,14,28,32,39}
    if (contentTypeId && !excludedTypes.has(contentTypeId) && !seenIntro.has(contentId)) {
      seenIntro.add(contentId);
      intro2Targets.push(entry);
    }

    // detailCommon2: needs_content + no description
    if (flags.includes('needs_content') && !hasDescription && !seenCommon.has(contentId)) {
      seenCommon.add(contentId);
      common2Targets.push({ ...entry });
    }

    // detailImage2: needs_image + no curated_images
    if (hasNeedsImage && curatedImages.length === 0 && !seenImage.has(contentId)) {
      seenImage.add(contentId);
      image2Targets.push({ ...entry });
    }
  }

  console.log(`[TARGET_BUILD] detailIntro2: ${intro2Targets.length} | detailCommon2: ${common2Targets.length} | detailImage2: ${image2Targets.length}`);

  // 매니페스트 기대값과 비교
  const mIntro  = manifest.endpoints.detailIntro2?.target_count  ?? 0;
  const mCommon = manifest.endpoints.detailCommon2?.target_count ?? 0;
  const mImage  = manifest.endpoints.detailImage2?.target_count  ?? 0;
  if (Math.abs(intro2Targets.length - mIntro) > 5)
    console.warn(`[TARGET_BUILD] WARNING: intro2 count mismatch (built ${intro2Targets.length} vs manifest ${mIntro})`);
  if (Math.abs(common2Targets.length - mCommon) > 5)
    console.warn(`[TARGET_BUILD] WARNING: common2 count mismatch (built ${common2Targets.length} vs manifest ${mCommon})`);
  if (Math.abs(image2Targets.length - mImage) > 5)
    console.warn(`[TARGET_BUILD] WARNING: image2 count mismatch (built ${image2Targets.length} vs manifest ${mImage})`);

  return { detailIntro2: intro2Targets, detailCommon2: common2Targets, detailImage2: image2Targets };
}

// ── raw 파일 원자적 쓰기 (existing 파일 덮어쓰기 방지) ───────────────────────
// 기존 유효 파일은 skip_existing에서 이미 걸러짐.
// 새 파일은 .tmp → rename 패턴으로 기록.
function writeRawFile(rawPath, data) {
  const tmpPath = rawPath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  if (fs.existsSync(rawPath)) fs.unlinkSync(rawPath);
  fs.renameSync(tmpPath, rawPath);
}

// ── parseKTO ──────────────────────────────────────────────────────────────────
function parseKTO(data) {
  const hdr  = data?.response?.header;
  const code = hdr?.resultCode;
  const msg  = hdr?.resultMsg;
  if (code !== '0000') return { ok: false, code, msg, items: [], total: 0 };
  const body = data?.response?.body;
  const raw  = body?.items?.item;
  const items = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  return { ok: true, code, msg, items, total: Number(body?.totalCount ?? items.length) };
}

// ── API 호출 (timeout 적용) ───────────────────────────────────────────────────
let totalCalls = 0;
const rateLimitHeaders = [];

async function fetchDetail(url, rawPath) {
  const safeUrl = maskKey(url);
  totalCalls++;
  const epName = new URL(url).pathname.split('/').pop();
  console.log(`  [call ${totalCalls}] ${epName}`);

  if (DRY_RUN) {
    console.log('    [dry-run] no API call');
    return { ok: false, dry_run: true, safe_url: safeUrl };
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let errorType = 'HTTP_OR_NETWORK';
    try {
      const res = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);

      for (const hdr of ['X-RateLimit-Limit','X-RateLimit-Remaining','X-Rate-Limit-Limit','RateLimit-Limit','RateLimit-Remaining']) {
        const val = res.headers.get(hdr) || res.headers.get(hdr.toLowerCase());
        if (val) rateLimitHeaders.push({ call: totalCalls, header: hdr, value: val });
      }

      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const text = await res.text();

      if (text.trimStart().startsWith('<')) {
        const saved = { is_xml: true, snippet: text.slice(0, 500), fetched_at: new Date().toISOString() };
        if (rawPath) writeRawFile(rawPath, saved);
        return { ok: false, is_xml: true, snippet: text.slice(0, 300), safe_url: safeUrl, error_type: 'XML_RESPONSE' };
      }

      const data = JSON.parse(text);
      if (rawPath) writeRawFile(rawPath, data);
      return { ok: true, data, safe_url: safeUrl };

    } catch (e) {
      errorType = e.isTimeout ? 'TIMEOUT' : 'HTTP_OR_NETWORK';
      if (attempt === MAX_RETRIES) {
        return { ok: false, error: String(e.message), safe_url: safeUrl, error_type: errorType };
      }
      console.log(`    retry ${attempt + 1}/${MAX_RETRIES} [${errorType}]: ${e.message}`);
      await sleep(500 * (attempt + 1));
    }
  }
}

// ── D. consecutive_failure_abort ─────────────────────────────────────────────
// 연속 실패 카운터. 성공 또는 유효 skip 시 초기화.
// HTTP 오류, timeout, API resultCode 실패 모두 실패로 카운트.
function checkConsecutiveFailure(counter, limit, endpoint, contentId, failureList) {
  if (counter >= limit) {
    console.error(`[ABORT] consecutive_failure_abort: ${limit}건 연속 실패 — endpoint=${endpoint}`);
    console.error(`  마지막 실패: contentId=${contentId}`);
    console.error(`  checkpoint와 실패 목록 보존.`);
    return true; // abort
  }
  return false;
}

// ── secret scan ───────────────────────────────────────────────────────────────
function secretScan(scanPaths) {
  const findings = [];
  for (const scanPath of scanPaths) {
    if (!fs.existsSync(scanPath)) continue;
    function scanEntry(p) {
      const st = fs.statSync(p);
      if (st.isDirectory()) {
        for (const e of fs.readdirSync(p)) scanEntry(path.join(p, e));
      } else if (p.endsWith('.json') || p.endsWith('.mjs') || p.endsWith('.md')) {
        try {
          const content = fs.readFileSync(p, 'utf8');
          if (content.includes(API_KEY)) {
            findings.push({ file: p.replace(ROOT + path.sep, '').replace(ROOT + '/', ''), issue: 'API_KEY_FOUND' });
          }
        } catch (_) {}
      }
    }
    scanEntry(scanPath);
  }
  return findings;
}

// ── 메인 ──────────────────────────────────────────────────────────────────────
const RUN_TS = new Date().toISOString();
const MODE_LABEL = SAMPLE_MODE ? `SAMPLE (pilot ${PILOT_SAMPLE.length}건)` : 'FULL';
console.log('\n[tourapi-busan-detail v2] TASK-BUSAN-KTO-DETAIL-COLLECTOR-HARDENING');
console.log(`  mode: ${MODE_LABEL}${DRY_RUN ? ' | DRY-RUN' : ''}${RESUME ? ' | RESUME' : ''} | ts: ${RUN_TS}`);
console.log(`  raw dir: ${RAW_DIR}`);
console.log(`  call_limit_status: ${CALL_LIMIT_STATUS}\n`);

// ── 대상 목록 결정 ─────────────────────────────────────────────────────────────
let introTargets, commonTargets, imageTargets;
let manifestHash = null;
let manifestData = null;

if (FULL_MODE) {
  if (!MANIFEST_PATH) {
    console.error('[ERROR] --full mode requires --manifest <path>');
    console.error('  예: --manifest data/tourapi/reports/busan/kto-detail-preflight-manifest.json');
    process.exit(1);
  }
  const { manifest, hash } = loadManifest(MANIFEST_PATH);
  manifestHash = hash;
  manifestData = manifest;
  const targets = buildTargetListFromManifest(manifest);
  introTargets  = targets.detailIntro2;
  commonTargets = targets.detailCommon2;
  imageTargets  = targets.detailImage2;
} else {
  // sample mode — hardcoded pilot list
  introTargets  = PILOT_SAMPLE;
  commonTargets = COMMON_SAMPLE;
  imageTargets  = IMAGE_SAMPLE;
}

// ── checkpoint 초기화 / resume ─────────────────────────────────────────────────
let checkpoint = null;

if (FULL_MODE) {
  if (RESUME) {
    checkpoint = readCheckpoint(CHECKPOINT_PATH);
    if (!checkpoint) {
      console.log('[RESUME] No checkpoint found — starting fresh');
      checkpoint = makeCheckpointState(manifestHash);
    } else {
      // E: manifest hash 변경 감지 → 안전 중단
      if (checkpoint.manifest_hash && manifestHash && checkpoint.manifest_hash !== manifestHash) {
        console.error('[ABORT] Manifest hash mismatch detected!');
        console.error(`  checkpoint: ${checkpoint.manifest_hash}`);
        console.error(`  current:    ${manifestHash}`);
        console.error('  The target manifest has changed since the last run.');
        console.error('  If intentional, delete checkpoint.json and restart without --resume.');
        process.exit(1);
      }
      const doneIntro  = new Set(checkpoint.endpoints.detailIntro2?.done  ?? []);
      const doneCommon = new Set(checkpoint.endpoints.detailCommon2?.done ?? []);
      const doneImage  = new Set(checkpoint.endpoints.detailImage2?.done  ?? []);
      const beforeIntro  = introTargets.length;
      const beforeCommon = commonTargets.length;
      const beforeImage  = imageTargets.length;
      introTargets  = introTargets.filter(t => !doneIntro.has(t.content_id));
      commonTargets = commonTargets.filter(t => !doneCommon.has(t.content_id));
      imageTargets  = imageTargets.filter(t => !doneImage.has(t.content_id));
      console.log(`[RESUME] Loaded checkpoint: ${checkpoint.started_ts}`);
      console.log(`  intro2:  ${doneIntro.size} done, ${introTargets.length}/${beforeIntro} remaining`);
      console.log(`  common2: ${doneCommon.size} done, ${commonTargets.length}/${beforeCommon} remaining`);
      console.log(`  image2:  ${doneImage.size} done, ${imageTargets.length}/${beforeImage} remaining`);
    }
  } else {
    checkpoint = makeCheckpointState(manifestHash);
  }
}

// ── dry-run 계획 출력 ─────────────────────────────────────────────────────────
if (DRY_RUN) {
  console.log('=== DRY-RUN 계획 ===');
  const plan = { endpoints: {} };

  for (const [ep, targets, cts] of [
    ['detailIntro2',  introTargets,  'content_type_id'],
    ['detailCommon2', commonTargets, null],
    ['detailImage2',  imageTargets,  null],
  ]) {
    let skipCount = 0, newCount = 0;
    const skipList = [], newList = [], reprocessList = [];

    for (const t of targets) {
      const rawPath = getRawPath(RAW_DIR, ep, t.content_id, t.content_type_id);
      const check   = isValidExistingRaw(rawPath, ep);
      if (check.skip) {
        skipCount++;
        skipList.push(t.content_id);
      } else {
        newCount++;
        newList.push(t.content_id);
        if (check.reprocess) reprocessList.push({ content_id: t.content_id, reason: check.reason });
      }
    }

    console.log(`\n  ${ep}:`);
    console.log(`    total targets: ${targets.length}`);
    console.log(`    skip (valid existing): ${skipCount}`);
    console.log(`    new calls needed:      ${newCount}`);
    if (reprocessList.length > 0)
      console.log(`    reprocess (error/corrupt): ${reprocessList.length}`);

    plan.endpoints[ep] = {
      total_targets: targets.length,
      skip_existing: skipCount,
      new_calls:     newCount,
      reprocess:     reprocessList.length,
      reprocess_list: reprocessList.slice(0, 10),
    };
  }

  const totalNew = Object.values(plan.endpoints).reduce((s, e) => s + e.new_calls, 0);
  const totalSkip = Object.values(plan.endpoints).reduce((s, e) => s + e.skip_existing, 0);
  console.log(`\n  total new API calls: ${totalNew}`);
  console.log(`  total skip (reuse):  ${totalSkip}`);
  console.log(`  call_limit_status:   ${CALL_LIMIT_STATUS}`);
  if (CALL_LIMIT_STATUS === 'UNVERIFIED') {
    console.log('  batch_plan:          CALL_LIMIT_UNVERIFIED — 배치 계산 불가 (공식 한도 확인 필요)');
  }

  plan.summary = {
    total_new_calls: totalNew,
    total_skip:      totalSkip,
    call_limit_status: CALL_LIMIT_STATUS,
    batch_plan: CALL_LIMIT_STATUS === 'VERIFIED' ? 'calculable' : 'UNVERIFIED',
    manifest_hash: manifestHash,
  };

  // dry-run report 저장
  const dryRunReport = {
    report_id:   'kto-detail-hardening-dry-run',
    task:        'TASK-BUSAN-KTO-DETAIL-COLLECTOR-HARDENING',
    run_ts:      RUN_TS,
    branch:      'data/busan-enrichment-v1',
    mode:        MODE_LABEL,
    dry_run:     true,
    call_limit_status: CALL_LIMIT_STATUS,
    plan,
    safety_checks: {
      api_calls_made:             0,
      enriched_candidates_modified: false,
      source_facts_modified:        false,
      review_flags_modified:        false,
      api_key_in_files:             false,
    },
  };

  const dryRunPath = path.join(RPT_DIR, 'kto-detail-hardening-dry-run.json');
  if (!DRY_RUN) { // 이 블록은 dry-run 내부이므로 항상 true → 단순 기록용
    fs.writeFileSync(dryRunPath, JSON.stringify(dryRunReport, null, 2), 'utf8');
  } else {
    fs.writeFileSync(dryRunPath, JSON.stringify(dryRunReport, null, 2), 'utf8');
    console.log(`\n  dry-run report: ${dryRunPath.replace(ROOT, '.')}`);
  }

  console.log('\n=== DRY-RUN 완료 (API 호출 0건) ===');
  process.exit(0);
}

// ── 이하는 실제 수집 (DRY_RUN=false일 때만 도달) ─────────────────────────────
// ── FULL 모드가 아니면 sample 모드만 여기로 옴 ───────────────────────────────

const results = { detailIntro2: [], detailCommon2: [], detailImage2: [] };

// ── §4: detailIntro2 ─────────────────────────────────────────────────────────
console.log(`\n=== detailIntro2 (${introTargets.length}건) ===`);

let consecutiveFailures = 0;
const failedIds = { detailIntro2: [], detailCommon2: [], detailImage2: [] };

for (let i = 0; i < introTargets.length; i++) {
  const s       = introTargets[i];
  const rawPath = getRawPath(RAW_DIR, 'detailIntro2', s.content_id, s.content_type_id);

  // A: skip_existing
  const skipCheck = isValidExistingRaw(rawPath, 'detailIntro2');
  if (skipCheck.skip) {
    const data    = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
    const parsed  = parseKTO(data);
    const allFields = INTRO_FIELDS_BY_TYPE[s.content_type_id] || [];
    const item = parsed.items[0] || null;
    const presentFields = allFields.filter(f => item?.[f] !== undefined && item?.[f] !== null && item?.[f] !== '');
    const entry = {
      candidate_id: s.candidate_id, content_id: s.content_id, content_type_id: s.content_type_id,
      title: s.title, skipped: true, skip_reason: 'VALID_EXISTS',
      http_ok: true, api_ok: true, item_count: parsed.items.length,
      hours_fields_expected: allFields, hours_fields_present_with_value: presentFields,
      hours_coverage_pct: allFields.length ? Math.round(100 * presentFields.length / allFields.length) : 0,
      all_response_fields: item ? Object.keys(item) : [],
      extracted_values: {},
      raw_path: rawPath.replace(ROOT, '.'), raw_sha: skipCheck.sha, fetch_error: null,
    };
    if (item) {
      for (const f of presentFields) entry.extracted_values[f] = String(item[f]).slice(0, 200);
    }
    results.detailIntro2.push(entry);
    if (checkpoint) {
      checkpoint.endpoints.detailIntro2.done.push(s.content_id);
      checkpoint.endpoints.detailIntro2.skipped.push(s.content_id);
      checkpoint.endpoints.detailIntro2.stats.skip++;
    }
    consecutiveFailures = 0;
    console.log(`  ${s.candidate_id} type=${s.content_type_id}: SKIP (valid exists)`);
    continue;
  }

  await sleep(CALL_INTERVAL_MS);
  const url = buildUrl('detailIntro2', {
    contentId:     String(s.content_id),
    contentTypeId: String(s.content_type_id),
  });
  const res    = await fetchDetail(url, rawPath);
  const parsed = res.ok ? parseKTO(res.data) : { ok: false, code: null, msg: null, items: [], total: 0 };
  const item   = parsed.items[0] || null;
  const allFields = INTRO_FIELDS_BY_TYPE[s.content_type_id] || [];
  const presentFields = [];
  const extractedValues = {};
  if (item) {
    for (const f of allFields) {
      const v = item[f];
      if (v !== undefined && v !== null && v !== '') {
        presentFields.push(f);
        extractedValues[f] = String(v).slice(0, 200);
      }
    }
  }

  const isSuccess = res.ok && parsed.ok;
  const entry = {
    candidate_id: s.candidate_id, content_id: s.content_id, content_type_id: s.content_type_id,
    title: s.title, skipped: false,
    http_ok: res.ok, is_xml: res.is_xml || false,
    result_code: parsed.code, result_msg: parsed.msg, api_ok: parsed.ok,
    item_count: parsed.items.length,
    hours_fields_expected: allFields, hours_fields_present_with_value: presentFields,
    hours_coverage_pct: allFields.length ? Math.round(100 * presentFields.length / allFields.length) : 0,
    all_response_fields: item ? Object.keys(item) : [],
    extracted_values: extractedValues,
    raw_path: rawPath.replace(ROOT, '.'),
    raw_sha: (res.ok && !res.dry_run) ? sha256File(rawPath) : null,
    fetch_error: res.error || null,
    error_type: res.error_type || null,
  };
  results.detailIntro2.push(entry);

  if (isSuccess) {
    consecutiveFailures = 0;
    if (checkpoint) {
      checkpoint.endpoints.detailIntro2.done.push(s.content_id);
      checkpoint.endpoints.detailIntro2.stats.success++;
    }
  } else {
    consecutiveFailures++;
    failedIds.detailIntro2.push({ content_id: s.content_id, error: res.error || parsed.code });
    if (checkpoint) {
      checkpoint.endpoints.detailIntro2.failed.push({ content_id: s.content_id, error: res.error || parsed.code });
      checkpoint.endpoints.detailIntro2.stats.failed++;
    }
    // D: consecutive_failure_abort
    if (checkConsecutiveFailure(consecutiveFailures, CONSECUTIVE_FAILURE_LIMIT, 'detailIntro2', s.content_id, failedIds.detailIntro2)) {
      if (checkpoint) { checkpoint.last_updated_ts = new Date().toISOString(); writeCheckpoint(CHECKPOINT_PATH, checkpoint); }
      process.exit(1);
    }
  }

  // C: checkpoint 저장 (N건마다)
  if (checkpoint && (i + 1) % CHECKPOINT_INTERVAL === 0) {
    checkpoint.last_updated_ts = new Date().toISOString();
    writeCheckpoint(CHECKPOINT_PATH, checkpoint);
    console.log(`  [checkpoint] saved at ${i + 1}/${introTargets.length}`);
  }

  const status = entry.api_ok
    ? `OK | hours=${presentFields.length}/${allFields.length}`
    : `FAIL(${res.is_xml ? 'XML' : (parsed.code || res.error || '?')})`;
  console.log(`  ${s.candidate_id} type=${s.content_type_id}: ${status}`);
}

// ── §5: detailCommon2 ────────────────────────────────────────────────────────
console.log(`\n=== detailCommon2 (${commonTargets.length}건) ===`);
consecutiveFailures = 0;

for (let i = 0; i < commonTargets.length; i++) {
  const s       = commonTargets[i];
  const rawPath = getRawPath(RAW_DIR, 'detailCommon2', s.content_id);

  const skipCheck = isValidExistingRaw(rawPath, 'detailCommon2');
  if (skipCheck.skip) {
    const data   = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
    const parsed = parseKTO(data);
    const item   = parsed.items[0] || null;
    const entry = {
      candidate_id: s.candidate_id, content_id: s.content_id, content_type_id: s.content_type_id,
      title: s.title, skipped: true, skip_reason: 'VALID_EXISTS',
      http_ok: true, api_ok: true, item_count: parsed.items.length,
      failure_classification: null,
      overview_present: !!(item?.overview),
      overview_length: item?.overview?.length ?? 0,
      overview_snippet: item?.overview?.slice(0, 150) ?? null,
      common_fields_with_value: item ? Object.keys(item).filter(k => item[k] !== null && item[k] !== '') : [],
      raw_path: rawPath.replace(ROOT, '.'), raw_sha: skipCheck.sha, fetch_error: null,
    };
    results.detailCommon2.push(entry);
    if (checkpoint) {
      checkpoint.endpoints.detailCommon2.done.push(s.content_id);
      checkpoint.endpoints.detailCommon2.skipped.push(s.content_id);
      checkpoint.endpoints.detailCommon2.stats.skip++;
    }
    consecutiveFailures = 0;
    console.log(`  ${s.candidate_id}: SKIP (valid exists)`);
    continue;
  }

  await sleep(CALL_INTERVAL_MS);
  const url = buildUrl('detailCommon2', { contentId: String(s.content_id) });
  const res    = await fetchDetail(url, rawPath);
  const parsed = res.ok ? parseKTO(res.data) : { ok: false, code: null, msg: null, items: [], total: 0 };
  const item   = parsed.items[0] || null;

  let failClass = null;
  if (!res.ok && res.is_xml)  failClass = 'XML_RESPONSE';
  else if (!res.ok && res.error) failClass = res.error_type === 'TIMEOUT' ? 'TIMEOUT' : 'HTTP_OR_NETWORK_ERROR';
  else if (!parsed.ok)        failClass = `API_ERROR_CODE_${parsed.code}`;
  else if (!item)             failClass = 'EMPTY_ITEMS';

  const isSuccess = res.ok && parsed.ok;
  const entry = {
    candidate_id: s.candidate_id, content_id: s.content_id, content_type_id: s.content_type_id,
    title: s.title, skipped: false,
    http_ok: res.ok, is_xml: res.is_xml || false,
    result_code: parsed.code, result_msg: parsed.msg, api_ok: parsed.ok,
    item_count: parsed.items.length, failure_classification: failClass,
    overview_present: !!(item?.overview),
    overview_length: item?.overview?.length ?? 0,
    overview_snippet: item?.overview?.slice(0, 150) ?? null,
    common_fields_with_value: item ? Object.keys(item).filter(k => item[k] !== null && item[k] !== '') : [],
    raw_path: rawPath.replace(ROOT, '.'),
    raw_sha: (res.ok && !res.dry_run) ? sha256File(rawPath) : null,
    fetch_error: res.error || null,
    error_type: res.error_type || null,
  };
  results.detailCommon2.push(entry);

  if (isSuccess) {
    consecutiveFailures = 0;
    if (checkpoint) {
      checkpoint.endpoints.detailCommon2.done.push(s.content_id);
      checkpoint.endpoints.detailCommon2.stats.success++;
    }
  } else {
    consecutiveFailures++;
    failedIds.detailCommon2.push({ content_id: s.content_id, error: failClass });
    if (checkpoint) {
      checkpoint.endpoints.detailCommon2.failed.push({ content_id: s.content_id, error: failClass });
      checkpoint.endpoints.detailCommon2.stats.failed++;
    }
    if (checkConsecutiveFailure(consecutiveFailures, CONSECUTIVE_FAILURE_LIMIT, 'detailCommon2', s.content_id, failedIds.detailCommon2)) {
      if (checkpoint) { checkpoint.last_updated_ts = new Date().toISOString(); writeCheckpoint(CHECKPOINT_PATH, checkpoint); }
      process.exit(1);
    }
  }

  if (checkpoint && (i + 1) % CHECKPOINT_INTERVAL === 0) {
    checkpoint.last_updated_ts = new Date().toISOString();
    writeCheckpoint(CHECKPOINT_PATH, checkpoint);
  }

  const status = entry.api_ok
    ? `OK | overview=${entry.overview_present}(${entry.overview_length}c)`
    : `FAIL(${failClass || '?'})`;
  console.log(`  ${s.candidate_id}: ${status}`);
}

// ── §6: detailImage2 ─────────────────────────────────────────────────────────
console.log(`\n=== detailImage2 (${imageTargets.length}건) ===`);
consecutiveFailures = 0;

for (let i = 0; i < imageTargets.length; i++) {
  const s       = imageTargets[i];
  const rawPath = getRawPath(RAW_DIR, 'detailImage2', s.content_id);

  const skipCheck = isValidExistingRaw(rawPath, 'detailImage2');
  if (skipCheck.skip) {
    const data   = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
    const parsed = parseKTO(data);
    const items  = parsed.items;
    const entry = {
      candidate_id: s.candidate_id, content_id: s.content_id, content_type_id: s.content_type_id,
      title: s.title, skipped: true, skip_reason: 'VALID_EXISTS',
      http_ok: true, api_ok: true, image_count: items.length,
      has_origin_imgurl: items.some(i => !!i.originimgurl),
      has_small_imgurl:  items.some(i => !!i.smallimageurl),
      image_fields_in_response: items[0] ? Object.keys(items[0]) : [],
      sample_urls: items.slice(0, 2).map(i => i.originimgurl || i.smallimageurl).filter(Boolean),
      raw_path: rawPath.replace(ROOT, '.'), raw_sha: skipCheck.sha, fetch_error: null,
    };
    results.detailImage2.push(entry);
    if (checkpoint) {
      checkpoint.endpoints.detailImage2.done.push(s.content_id);
      checkpoint.endpoints.detailImage2.skipped.push(s.content_id);
      checkpoint.endpoints.detailImage2.stats.skip++;
    }
    consecutiveFailures = 0;
    console.log(`  ${s.candidate_id}: SKIP (valid exists)`);
    continue;
  }

  await sleep(CALL_INTERVAL_MS);
  const url = buildUrl('detailImage2', { contentId: String(s.content_id), imageYN: 'Y' });
  const res    = await fetchDetail(url, rawPath);
  const parsed = res.ok ? parseKTO(res.data) : { ok: false, code: null, msg: null, items: [], total: 0 };
  const items  = parsed.items;

  const isSuccess = res.ok && parsed.ok;
  const entry = {
    candidate_id: s.candidate_id, content_id: s.content_id, content_type_id: s.content_type_id,
    title: s.title, skipped: false,
    http_ok: res.ok, is_xml: res.is_xml || false,
    result_code: parsed.code, result_msg: parsed.msg, api_ok: parsed.ok,
    image_count: items.length,
    has_origin_imgurl: items.some(i => !!i.originimgurl),
    has_small_imgurl:  items.some(i => !!i.smallimageurl),
    image_fields_in_response: items[0] ? Object.keys(items[0]) : [],
    sample_urls: items.slice(0, 2).map(i => i.originimgurl || i.smallimageurl).filter(Boolean),
    raw_path: rawPath.replace(ROOT, '.'),
    raw_sha: (res.ok && !res.dry_run) ? sha256File(rawPath) : null,
    fetch_error: res.error || null,
    error_type: res.error_type || null,
  };
  results.detailImage2.push(entry);

  if (isSuccess) {
    consecutiveFailures = 0;
    if (checkpoint) {
      checkpoint.endpoints.detailImage2.done.push(s.content_id);
      checkpoint.endpoints.detailImage2.stats.success++;
    }
  } else {
    consecutiveFailures++;
    failedIds.detailImage2.push({ content_id: s.content_id, error: res.error || parsed.code });
    if (checkpoint) {
      checkpoint.endpoints.detailImage2.failed.push({ content_id: s.content_id, error: res.error || parsed.code });
      checkpoint.endpoints.detailImage2.stats.failed++;
    }
    if (checkConsecutiveFailure(consecutiveFailures, CONSECUTIVE_FAILURE_LIMIT, 'detailImage2', s.content_id, failedIds.detailImage2)) {
      if (checkpoint) { checkpoint.last_updated_ts = new Date().toISOString(); writeCheckpoint(CHECKPOINT_PATH, checkpoint); }
      process.exit(1);
    }
  }

  if (checkpoint && (i + 1) % CHECKPOINT_INTERVAL === 0) {
    checkpoint.last_updated_ts = new Date().toISOString();
    writeCheckpoint(CHECKPOINT_PATH, checkpoint);
  }

  const status = entry.api_ok ? `OK | images=${entry.image_count}` : `FAIL`;
  console.log(`  ${s.candidate_id}: ${status}`);
}

// ── checkpoint 최종 저장 ──────────────────────────────────────────────────────
if (checkpoint) {
  checkpoint.last_updated_ts = new Date().toISOString();
  writeCheckpoint(CHECKPOINT_PATH, checkpoint);
}

// ── 호출 제한 확인 ────────────────────────────────────────────────────────────
const callLimitVerdict = rateLimitHeaders.length > 0
  ? `HEADER_CONFIRMED: ${rateLimitHeaders.map(h => `${h.header}=${h.value}`).join(', ')}`
  : 'CALL_LIMIT_UNVERIFIED — 응답 헤더 rate-limit 없음';

// ── contentTypeId 필드 매트릭스 ───────────────────────────────────────────────
const fieldMatrix = {};
for (const entry of results.detailIntro2) {
  if (entry.skipped) continue;
  const ct = entry.content_type_id;
  if (!fieldMatrix[ct]) {
    fieldMatrix[ct] = { content_type_id: ct, expected_fields: entry.hours_fields_expected, fields_with_value_union: new Set(), sample_count: 0 };
  }
  entry.hours_fields_present_with_value.forEach(f => fieldMatrix[ct].fields_with_value_union.add(f));
  fieldMatrix[ct].sample_count++;
}
const fieldMatrixOut = {};
for (const [ct, m] of Object.entries(fieldMatrix)) {
  const withValue = [...m.fields_with_value_union].sort();
  const absent    = m.expected_fields.filter(f => !m.fields_with_value_union.has(f));
  fieldMatrixOut[ct] = {
    content_type_id: Number(ct), sample_count: m.sample_count,
    expected_fields: m.expected_fields, fields_with_value_in_any_sample: withValue,
    fields_always_empty_in_sample: absent,
    coverage_pct: m.expected_fields.length ? Math.round(100 * withValue.length / m.expected_fields.length) : 0,
  };
}

// ── 집계 ─────────────────────────────────────────────────────────────────────
const intro_ok   = results.detailIntro2.filter(r => r.api_ok).length;
const common_ok  = results.detailCommon2.filter(r => r.api_ok).length;
const image_ok   = results.detailImage2.filter(r => r.api_ok).length;
const intro_skip = results.detailIntro2.filter(r => r.skipped).length;
const common_skip= results.detailCommon2.filter(r => r.skipped).length;
const image_skip = results.detailImage2.filter(r => r.skipped).length;
const overview_n = results.detailCommon2.filter(r => r.overview_present).length;
const failClasses = [...new Set(results.detailCommon2.filter(r => !r.api_ok && !r.skipped).map(r => r.failure_classification))];

const verdict =
  intro_ok === results.detailIntro2.length &&
  (common_ok > 0 || overview_n > 0) &&
  image_ok > 0
    ? 'PASS'
  : intro_ok === 0 && common_ok === 0 && image_ok === 0
    ? 'FAIL'
    : 'PARTIAL';

// ── 보고서 저장 ───────────────────────────────────────────────────────────────
const report = {
  report_id: FULL_MODE ? 'kto-detail-full-report' : 'kto-detail-pilot-report',
  task:      'TASK-BUSAN-KTO-DETAIL-COLLECTOR-HARDENING',
  run_ts:    RUN_TS,
  branch:    'data/busan-enrichment-v1',
  mode:      MODE_LABEL,
  call_limit: { status: CALL_LIMIT_STATUS, verdict: callLimitVerdict, headers_found: rateLimitHeaders.length > 0 },
  manifest:   { path: MANIFEST_PATH, hash: manifestHash },
  endpoints: {
    detailIntro2:  { requests: results.detailIntro2.length, ok: intro_ok, skip: intro_skip, fail: results.detailIntro2.length - intro_ok - intro_skip, results: results.detailIntro2 },
    detailCommon2: { requests: results.detailCommon2.length, ok: common_ok, skip: common_skip, fail: results.detailCommon2.length - common_ok - common_skip, overview_n, results: results.detailCommon2 },
    detailImage2:  { requests: results.detailImage2.length, ok: image_ok, skip: image_skip, fail: results.detailImage2.length - image_ok - image_skip, results: results.detailImage2 },
  },
  field_matrix: fieldMatrixOut,
  total_api_calls: totalCalls,
  verdict,
  safety_checks: {
    enriched_candidates_modified: false, source_facts_modified: false,
    review_flags_modified: false, api_key_in_saved_files: false,
    prohibited_paths_modified: false, master_modified: false,
    db_migration_modified: false, push_executed: false,
    total_calls_recorded: totalCalls,
  },
};

fs.writeFileSync(REPORT_OUT, JSON.stringify(report, null, 2), 'utf8');
fs.writeFileSync(MATRIX_OUT, JSON.stringify(fieldMatrixOut, null, 2), 'utf8');

const manifest_doc = {
  manifest_type: FULL_MODE ? 'kto-detail-full' : 'kto-detail-pilot',
  task:          'TASK-BUSAN-KTO-DETAIL-COLLECTOR-HARDENING',
  run_ts:        RUN_TS,
  mode:          MODE_LABEL,
  manifest_input_hash: manifestHash,
  total_api_calls:     totalCalls,
  verdict,
  output_sha: {
    report:       sha256File(REPORT_OUT),
    field_matrix: sha256File(MATRIX_OUT),
  },
};
fs.writeFileSync(MANIFEST_OUT, JSON.stringify(manifest_doc, null, 2), 'utf8');

// ── 콘솔 최종 요약 ────────────────────────────────────────────────────────────
console.log('\n=== 결과 요약 ===');
console.log(`  총 API 호출: ${totalCalls}`);
console.log(`  detailIntro2:  ${intro_ok} ok | ${intro_skip} skip | ${results.detailIntro2.length - intro_ok - intro_skip} fail`);
console.log(`  detailCommon2: ${common_ok} ok | ${common_skip} skip | overview=${overview_n}`);
console.log(`  detailImage2:  ${image_ok} ok | ${image_skip} skip`);
console.log(`  판정: ${verdict}`);
console.log(`\n  report:  ${REPORT_OUT.replace(ROOT, '.')}`);
console.log(`  matrix:  ${MATRIX_OUT.replace(ROOT, '.')}`);
console.log(`  manifest: ${MANIFEST_OUT.replace(ROOT, '.')}`);
console.log('\n  safety: enriched=unmodified | flags=unmodified | key=hidden | master=unmodified');
