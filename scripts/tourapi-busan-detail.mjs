#!/usr/bin/env node
/**
 * tourapi-busan-detail.mjs — KTO KorService2 상세정보 수집
 *
 * 이번 TASK (TASK-BUSAN-KTO-DETAIL-ENDPOINT-PILOT):
 *   --sample   파일럿 15건만 실행 (허용)
 *
 * 향후 전체 수집 (현재 TASK에서 금지):
 *   --full --allow-full  643건 전체 실행
 *
 * endpoint:
 *   KorService2/detailIntro2   — 유형별 이용정보 (hours, facilities)
 *   KorService2/detailCommon2  — 공통 상세 (overview/description, tel, homepage)
 *   KorService2/detailImage2   — 이미지 목록 (originimgurl, smallimageurl)
 *
 * raw:     data/tourapi/raw/busan/kto-detail-pilot/
 * reports: data/tourapi/reports/busan/
 *
 * 금지: API key 출력 / enriched candidates 수정 / source facts 수정 / flag 변경
 *       master 변경 / DB·migration / push / git add . / git add -A
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT   = path.resolve(__dir, '..');

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
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
      });
      break;
    } catch (_) {}
  }
})();

const API_KEY = process.env.TOUR_API_KEY;
if (!API_KEY) { console.error('[ERROR] TOUR_API_KEY not set in .env.local'); process.exit(1); }

// ── CLI 파싱 ──────────────────────────────────────────────────────────────────
const args        = process.argv.slice(2);
const SAMPLE_MODE = args.includes('--sample');
const FULL_MODE   = args.includes('--full');
const ALLOW_FULL  = args.includes('--allow-full');
const DRY_RUN     = args.includes('--dry-run');

if (FULL_MODE && !ALLOW_FULL) {
  console.error('[BLOCKED] --full requires --allow-full. TASK-BUSAN-KTO-DETAIL-ENDPOINT-PILOT prohibits full execution.');
  process.exit(1);
}
if (!SAMPLE_MODE && !FULL_MODE) {
  console.error('Usage: node tourapi-busan-detail.mjs --sample | --full --allow-full');
  process.exit(1);
}

// ── 설정 ──────────────────────────────────────────────────────────────────────
const KTO_BASE         = 'https://apis.data.go.kr/B551011/KorService2';
const MOBILE_OS        = 'ETC';
const MOBILE_APP       = 'GoKoreaMate';
const CALL_INTERVAL_MS = 300;
const MAX_RETRIES      = 2;

// ── 경로 ──────────────────────────────────────────────────────────────────────
const PILOT_RAW_DIR = path.join(ROOT, 'data/tourapi/raw/busan/kto-detail-pilot');
const RPT_DIR       = path.join(ROOT, 'data/tourapi/reports/busan');
const MANIFEST_OUT  = path.join(RPT_DIR, 'kto-detail-pilot-manifest.json');
const REPORT_OUT    = path.join(RPT_DIR, 'kto-detail-pilot-report.json');
const MATRIX_OUT    = path.join(RPT_DIR, 'kto-detail-pilot-field-matrix.json');

fs.mkdirSync(PILOT_RAW_DIR, { recursive: true });
fs.mkdirSync(RPT_DIR,       { recursive: true });

// ── 파일럿 표본 (결정적, contentTypeId당 3건) ────────────────────────────────
// contentTypeId는 raw batch 파일(kto-ko-p*.json)에서 확인.
// source_key 형식: KorService2:<contentId>:ko
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

// detailCommon2 표본: contentTypeId당 1건 (5건)
const COMMON_SAMPLE = [
  PILOT_SAMPLE[0],   // type 12
  PILOT_SAMPLE[3],   // type 14
  PILOT_SAMPLE[6],   // type 28
  PILOT_SAMPLE[9],   // type 32
  PILOT_SAMPLE[12],  // type 39
];

// detailImage2 표본: 처음 5건
const IMAGE_SAMPLE = PILOT_SAMPLE.slice(0, 5);

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

function buildUrl(endpoint, params) {
  const p = new URLSearchParams({
    serviceKey: API_KEY,
    MobileOS: MOBILE_OS,
    MobileApp: MOBILE_APP,
    _type: 'json',
    ...params,
  });
  return `${KTO_BASE}/${endpoint}?${p.toString()}`;
}

function maskKey(url) {
  return url.replace(encodeURIComponent(API_KEY), '[KEY]').replace(API_KEY, '[KEY]');
}

// ── API 호출 ──────────────────────────────────────────────────────────────────
let totalCalls = 0;
const rateLimitHeaders = [];

async function fetchDetail(url, rawPath) {
  const safeUrl = maskKey(url);
  totalCalls++;
  const epName = new URL(url).pathname.split('/').pop();
  console.log(`  [call ${totalCalls}] ${epName} → ${safeUrl.split('serviceKey')[0]}...`);

  if (DRY_RUN) {
    console.log('    [dry-run] skipped');
    return { ok: false, dry_run: true, safe_url: safeUrl };
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url);

      // 응답 헤더에서 rate limit 정보 수집
      for (const hdr of ['X-RateLimit-Limit','X-RateLimit-Remaining','X-Rate-Limit-Limit','RateLimit-Limit','RateLimit-Remaining']) {
        const val = res.headers.get(hdr) || res.headers.get(hdr.toLowerCase());
        if (val) rateLimitHeaders.push({ call: totalCalls, header: hdr, value: val });
      }

      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const text = await res.text();

      // XML 응답 감지 (_type=json 누락 또는 API 오류 시 발생)
      if (text.trimStart().startsWith('<')) {
        const saved = { is_xml: true, snippet: text.slice(0, 500), fetched_at: new Date().toISOString() };
        if (rawPath) fs.writeFileSync(rawPath, JSON.stringify(saved, null, 2), 'utf8');
        return { ok: false, is_xml: true, snippet: text.slice(0, 300), safe_url: safeUrl };
      }

      const data = JSON.parse(text);
      // serviceKey는 응답 body에 포함되지 않으므로 그대로 저장
      if (rawPath) fs.writeFileSync(rawPath, JSON.stringify(data, null, 2), 'utf8');
      return { ok: true, data, safe_url: safeUrl };

    } catch (e) {
      if (attempt === MAX_RETRIES) return { ok: false, error: String(e.message), safe_url: safeUrl };
      console.log(`    retry ${attempt + 1}/${MAX_RETRIES}: ${e.message}`);
      await sleep(500 * (attempt + 1));
    }
  }
}

function parseKTO(data) {
  const hdr   = data?.response?.header;
  const code  = hdr?.resultCode;
  const msg   = hdr?.resultMsg;
  if (code !== '0000') return { ok: false, code, msg, items: [], total: 0 };
  const body  = data?.response?.body;
  const raw   = body?.items?.item;
  const items = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  return { ok: true, code, msg, items, total: Number(body?.totalCount ?? items.length) };
}

// ── 메인 ──────────────────────────────────────────────────────────────────────
const RUN_TS = new Date().toISOString();
console.log('\n[tourapi-busan-detail] TASK-BUSAN-KTO-DETAIL-ENDPOINT-PILOT');
console.log(`  mode: ${SAMPLE_MODE ? 'SAMPLE (pilot 15건)' : 'FULL'} | run_ts: ${RUN_TS}`);
console.log(`  raw dir: ${PILOT_RAW_DIR}\n`);

const results = { detailIntro2: [], detailCommon2: [], detailImage2: [] };

// ── §4: detailIntro2 (15건) ───────────────────────────────────────────────────
console.log('=== §4 detailIntro2 (15건, contentTypeId별 3건) ===');

for (const s of PILOT_SAMPLE) {
  await sleep(CALL_INTERVAL_MS);
  const rawPath = path.join(PILOT_RAW_DIR,
    `detail-intro2-${s.content_id}-type${s.content_type_id}.json`);
  const url = buildUrl('detailIntro2', {
    contentId:     String(s.content_id),
    contentTypeId: String(s.content_type_id),
  });
  const res     = await fetchDetail(url, rawPath);
  const parsed  = res.ok ? parseKTO(res.data) : { ok: false, code: null, msg: null, items: [], total: 0 };
  const item    = parsed.items[0] || null;
  const allFields = INTRO_FIELDS_BY_TYPE[s.content_type_id] || [];

  // 실제로 값이 있는 필드만 추출
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

  // 응답에 있는 모든 필드 (예상 외 필드 포함)
  const allResponseFields = item ? Object.keys(item) : [];

  const entry = {
    candidate_id: s.candidate_id,
    content_id: s.content_id,
    content_type_id: s.content_type_id,
    title: s.title,
    http_ok: res.ok,
    is_xml: res.is_xml || false,
    result_code: parsed.code,
    result_msg: parsed.msg,
    api_ok: parsed.ok,
    item_count: parsed.items.length,
    hours_fields_expected: allFields,
    hours_fields_present_with_value: presentFields,
    hours_coverage_pct: allFields.length ? Math.round(100 * presentFields.length / allFields.length) : 0,
    all_response_fields: allResponseFields,
    extracted_values: extractedValues,
    raw_path: rawPath.replace(ROOT, '.'),
    raw_sha: (!DRY_RUN && res.ok) ? sha256File(rawPath) : null,
    fetch_error: res.error || null,
  };
  results.detailIntro2.push(entry);

  const status = entry.api_ok
    ? `OK | hours=${presentFields.length}/${allFields.length}`
    : `FAIL(${res.is_xml ? 'XML' : (parsed.code || res.error || '?')})`;
  console.log(`  ${s.candidate_id} type=${s.content_type_id}: ${status}`);
  if (presentFields.length > 0) {
    const preview = presentFields.slice(0, 3).map(f => `${f}="${extractedValues[f]?.slice(0,30)}"`).join(', ');
    console.log(`    fields: ${preview}...`);
  }
}

// ── §5: detailCommon2 (5건, 파싱 실패 원인 규명) ─────────────────────────────
// 발견: KorService2는 YN 선택 파라미터(defaultYN, overviewYN, addrinfoYN 등)를 지원하지 않음
// contentId만으로 전체 공통 정보(overview 포함) 자동 반환됨 → KorService1 YN 방식과 다름
// 기존 파싱 실패 원인: YN 파라미터 사용 시 {responseTime,resultCode,resultMsg} GW 에러 반환
console.log('\n=== §5 detailCommon2 (5건, contentId만 — KorService2에서 YN 파라미터 invalid) ===');

for (const s of COMMON_SAMPLE) {
  await sleep(CALL_INTERVAL_MS);
  const rawPath = path.join(PILOT_RAW_DIR, `detail-common2-${s.content_id}.json`);
  const url = buildUrl('detailCommon2', {
    contentId: String(s.content_id),
    // KorService2에서는 defaultYN/overviewYN/areacodeYN 등 YN 파라미터 사용 금지
    // 사용 시 INVALID_REQUEST_PARAMETER_ERROR(paramName) 반환
  });
  const res    = await fetchDetail(url, rawPath);
  const parsed = res.ok ? parseKTO(res.data) : { ok: false, code: null, msg: null, items: [], total: 0 };
  const item   = parsed.items[0] || null;

  // 파싱 실패 분류
  let failClass = null;
  if (!res.ok && res.is_xml)  failClass = 'XML_RESPONSE';
  else if (!res.ok && res.error) failClass = 'HTTP_OR_NETWORK_ERROR';
  else if (!parsed.ok)        failClass = `API_ERROR_CODE_${parsed.code}`;
  else if (!item)             failClass = 'EMPTY_ITEMS';

  const overviewVal  = item?.overview || null;
  const commonFields = item ? Object.keys(item).filter(k => item[k] !== null && item[k] !== '') : [];

  const entry = {
    candidate_id: s.candidate_id,
    content_id: s.content_id,
    content_type_id: s.content_type_id,
    title: s.title,
    http_ok: res.ok,
    is_xml: res.is_xml || false,
    result_code: parsed.code,
    result_msg: parsed.msg,
    api_ok: parsed.ok,
    item_count: parsed.items.length,
    failure_classification: failClass,
    overview_present: !!overviewVal,
    overview_length: overviewVal ? overviewVal.length : 0,
    overview_snippet: overviewVal ? overviewVal.slice(0, 150) : null,
    common_fields_with_value: commonFields,
    raw_path: rawPath.replace(ROOT, '.'),
    raw_sha: (!DRY_RUN && res.ok) ? sha256File(rawPath) : null,
    fetch_error: res.error || null,
  };
  results.detailCommon2.push(entry);

  const status = entry.api_ok
    ? `OK | overview=${entry.overview_present}(${entry.overview_length}chars) | fields=${commonFields.length}`
    : `FAIL(${failClass || '?'})`;
  console.log(`  ${s.candidate_id} type=${s.content_type_id}: ${status}`);
  if (entry.overview_snippet) {
    console.log(`    overview: "${entry.overview_snippet.slice(0, 80)}..."`);
  }
}

// ── §6: detailImage2 (5건) ───────────────────────────────────────────────────
console.log('\n=== §6 detailImage2 (5건) ===');

for (const s of IMAGE_SAMPLE) {
  await sleep(CALL_INTERVAL_MS);
  const rawPath = path.join(PILOT_RAW_DIR, `detail-image2-${s.content_id}.json`);
  const url = buildUrl('detailImage2', {
    contentId: String(s.content_id),
    imageYN:   'Y',
    // subImageYN은 KorService2에서 INVALID_REQUEST_PARAMETER_ERROR → 제거
  });
  const res    = await fetchDetail(url, rawPath);
  const parsed = res.ok ? parseKTO(res.data) : { ok: false, code: null, msg: null, items: [], total: 0 };
  const items  = parsed.items;

  const sampleFields     = items[0] ? Object.keys(items[0]) : [];
  const hasOriginUrl     = items.some(i => !!i.originimgurl);
  const hasSmallUrl      = items.some(i => !!i.smallimageurl);
  const sampleUrls       = items.slice(0, 2).map(i => i.originimgurl || i.smallimageurl).filter(Boolean);

  const entry = {
    candidate_id: s.candidate_id,
    content_id: s.content_id,
    content_type_id: s.content_type_id,
    title: s.title,
    http_ok: res.ok,
    is_xml: res.is_xml || false,
    result_code: parsed.code,
    result_msg: parsed.msg,
    api_ok: parsed.ok,
    image_count: items.length,
    has_origin_imgurl: hasOriginUrl,
    has_small_imgurl: hasSmallUrl,
    image_fields_in_response: sampleFields,
    sample_urls: sampleUrls,
    raw_path: rawPath.replace(ROOT, '.'),
    raw_sha: (!DRY_RUN && res.ok) ? sha256File(rawPath) : null,
    fetch_error: res.error || null,
  };
  results.detailImage2.push(entry);

  const status = entry.api_ok ? `OK | images=${entry.image_count}` : `FAIL(${res.is_xml ? 'XML' : (parsed.code || res.error || '?')})`;
  console.log(`  ${s.candidate_id}: ${status}`);
  if (sampleUrls.length) console.log(`    sample url: ${sampleUrls[0].slice(0, 80)}`);
}

// ── §7: 호출 제한 확인 ────────────────────────────────────────────────────────
const callLimitVerdict = rateLimitHeaders.length > 0
  ? `HEADER_CONFIRMED: ${rateLimitHeaders.map(h => `${h.header}=${h.value}`).join(', ')}`
  : 'CALL_LIMIT_UNVERIFIED — 응답 헤더 rate-limit 없음; approved-api-inventory.md 추정값(1,000회/일) 미확인';

// ── contentTypeId 필드 매트릭스 생성 ─────────────────────────────────────────
const fieldMatrix = {};
for (const entry of results.detailIntro2) {
  const ct = entry.content_type_id;
  if (!fieldMatrix[ct]) {
    fieldMatrix[ct] = {
      content_type_id: ct,
      expected_fields: entry.hours_fields_expected,
      fields_with_value_union: new Set(),
      sample_count: 0,
    };
  }
  entry.hours_fields_present_with_value.forEach(f => fieldMatrix[ct].fields_with_value_union.add(f));
  fieldMatrix[ct].sample_count++;
}
const fieldMatrixOut = {};
for (const [ct, m] of Object.entries(fieldMatrix)) {
  const withValue = [...m.fields_with_value_union].sort();
  const absent    = m.expected_fields.filter(f => !m.fields_with_value_union.has(f));
  fieldMatrixOut[ct] = {
    content_type_id: Number(ct),
    sample_count: m.sample_count,
    expected_fields: m.expected_fields,
    fields_with_value_in_any_sample: withValue,
    fields_always_empty_in_sample: absent,
    coverage_pct: m.expected_fields.length
      ? Math.round(100 * withValue.length / m.expected_fields.length) : 0,
  };
}

if (DRY_RUN) {
  console.log(`[dry-run] would write field_matrix: ${MATRIX_OUT}`);
} else {
  fs.writeFileSync(MATRIX_OUT, JSON.stringify(fieldMatrixOut, null, 2), 'utf8');
}

// ── 요약 집계 ─────────────────────────────────────────────────────────────────
const intro_ok   = results.detailIntro2.filter(r => r.api_ok).length;
const common_ok  = results.detailCommon2.filter(r => r.api_ok).length;
const image_ok   = results.detailImage2.filter(r => r.api_ok).length;
const overview_n = results.detailCommon2.filter(r => r.overview_present).length;
const failClasses = [...new Set(results.detailCommon2.filter(r => !r.api_ok).map(r => r.failure_classification))];

const hoursExtractable = results.detailIntro2.some(r => r.hours_fields_present_with_value.length > 0);
const overviewExtractable = overview_n > 0;
const imageExtractable  = results.detailImage2.some(r => r.image_count > 0);

// 전체 확대 전 필요 사항
const preFullRunRequirements = [
  intro_ok < PILOT_SAMPLE.length ? `detailIntro2 실패 ${PILOT_SAMPLE.length - intro_ok}건 원인 해결` : null,
  common_ok === 0 && failClasses.length > 0 ? `detailCommon2 파싱 실패 원인 해결: ${failClasses.join(', ')}` : null,
  'call limit 공식 확인 (현재 추정 1,000회/일); 전체 643×3=1,929회 가능 여부 확정',
  '전체 실행 시 --allow-full 플래그 필수',
  'needs_hours / needs_content 필드 추출 결과 enriched candidates 반영 설계 확정',
].filter(Boolean);

const verdict =
  intro_ok === PILOT_SAMPLE.length && (common_ok > 0 || overview_n > 0) && image_ok > 0
    ? 'PASS'
  : intro_ok === 0 && common_ok === 0 && image_ok === 0
    ? 'FAIL'
    : 'PARTIAL';

// ── 보고서 저장 ────────────────────────────────────────────────────────────────
const report = {
  report_id: 'kto-detail-pilot-report',
  task: 'TASK-BUSAN-KTO-DETAIL-ENDPOINT-PILOT',
  run_ts: RUN_TS,
  branch: 'data/busan-enrichment-v1',
  expected_head: '400e31e',
  ssot_version: 'v1.1',
  mode: 'SAMPLE',
  pilot_sample_count: PILOT_SAMPLE.length,
  total_calls_made: totalCalls,
  call_limit: {
    inventory_note: '추정: 상세기능별 1,000회/일 (approved-api-inventory.md, 공식 미확인)',
    response_headers_checked: true,
    rate_limit_headers_found: rateLimitHeaders.length > 0,
    rate_limit_headers: rateLimitHeaders,
    verdict: callLimitVerdict,
  },
  endpoints: {
    detailIntro2: {
      requests: results.detailIntro2.length,
      ok: intro_ok,
      fail: results.detailIntro2.length - intro_ok,
      pass: intro_ok === results.detailIntro2.length,
      hours_extractable: hoursExtractable,
      results: results.detailIntro2,
    },
    detailCommon2: {
      requests: results.detailCommon2.length,
      ok: common_ok,
      fail: results.detailCommon2.length - common_ok,
      failure_classifications: failClasses,
      overview_present_count: overview_n,
      overview_extractable: overviewExtractable,
      pass: common_ok === results.detailCommon2.length,
      results: results.detailCommon2,
    },
    detailImage2: {
      requests: results.detailImage2.length,
      ok: image_ok,
      fail: results.detailImage2.length - image_ok,
      image_metadata_extractable: imageExtractable,
      pass: image_ok > 0,
      results: results.detailImage2,
    },
  },
  field_matrix: fieldMatrixOut,
  full_run_feasibility: {
    target_candidate_count: 643,
    estimated_total_calls: 643 * 3,
    pre_full_run_requirements: preFullRunRequirements,
    feasible_if_requirements_met: true,
  },
  verdict,
  safety_checks: {
    enriched_candidates_modified: false,
    source_facts_modified: false,
    review_flags_modified: false,
    api_key_in_saved_files: false,
    prohibited_paths_modified: false,
    master_modified: false,
    db_migration_modified: false,
    push_executed: false,
    total_calls_recorded: totalCalls,
  },
};

if (DRY_RUN) {
  console.log(`[dry-run] would write report: ${REPORT_OUT}`);
} else {
  fs.writeFileSync(REPORT_OUT, JSON.stringify(report, null, 2), 'utf8');
}

// 파일럿 매니페스트
const manifest = {
  manifest_type: 'kto-detail-pilot',
  task: 'TASK-BUSAN-KTO-DETAIL-ENDPOINT-PILOT',
  run_ts: RUN_TS,
  branch: 'data/busan-enrichment-v1',
  head: '400e31e',
  ssot_version: 'v1.1',
  pilot_sample: PILOT_SAMPLE,
  detailCommon2_sample: COMMON_SAMPLE.map(s => s.candidate_id),
  detailImage2_sample: IMAGE_SAMPLE.map(s => s.candidate_id),
  total_calls: totalCalls,
  verdict,
  output_sha: DRY_RUN ? { report: null, field_matrix: null } : {
    report: sha256File(REPORT_OUT),
    field_matrix: sha256File(MATRIX_OUT),
  },
};
if (DRY_RUN) {
  console.log(`[dry-run] would write manifest: ${MANIFEST_OUT}`);
  console.log(`[dry-run] expected total calls: ${totalCalls}`);
} else {
  fs.writeFileSync(MANIFEST_OUT, JSON.stringify(manifest, null, 2), 'utf8');
}

// ── 콘솔 최종 요약 ─────────────────────────────────────────────────────────────
console.log('\n=== PILOT 결과 요약 ===');
console.log(`  총 호출 수: ${totalCalls}`);
console.log(`  detailIntro2:  ${intro_ok}/${results.detailIntro2.length} OK | hours 추출가능: ${hoursExtractable}`);
console.log(`  detailCommon2: ${common_ok}/${results.detailCommon2.length} OK | overview 추출: ${overview_n}건 | 실패분류: ${failClasses.join(',')||'없음'}`);
console.log(`  detailImage2:  ${image_ok}/${results.detailImage2.length} OK | 이미지 metadata: ${imageExtractable}`);
console.log(`  호출 제한: ${callLimitVerdict}`);
console.log(`  판정: ${verdict}`);
console.log(`\n  report:       ${REPORT_OUT}`);
console.log(`  field matrix: ${MATRIX_OUT}`);
console.log(`  manifest:     ${MANIFEST_OUT}`);
console.log(`  raw dir:      ${PILOT_RAW_DIR}`);
console.log('\n  safety: enriched=unmodified | flags=unmodified | key=hidden | master=unmodified');
