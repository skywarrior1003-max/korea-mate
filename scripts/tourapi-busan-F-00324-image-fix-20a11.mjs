/**
 * TASK-DATA-BUSAN-RESTAURANT-IMAGE-FIX-20A-11
 * busan-F-00324 부산명물횟집 깨진 이미지 공식 대체 후보 탐색
 * 탐색 순서: Step1(UC_SEQ=1612 다른 필드) → Step2(FoodService 이름+주소 중복) → Step3(VB 공식 페이지) → Step4(KTO)
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

function escapeCsv(val) {
  const s = (val == null) ? '' : String(val);
  return (s.includes(',') || s.includes('"') || s.includes('\n'))
    ? '"' + s.replace(/"/g, '""') + '"' : s;
}

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://www.visitbusan.net/kr/index.do',
  'Accept': 'image/*,text/html,*/*;q=0.8',
};

// HTTP GET 요청 (버퍼 반환)
function fetchUrl(url, timeoutMs = 12000) {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.request(
      { hostname: parsed.hostname, path: parsed.pathname + parsed.search, headers: BROWSER_HEADERS, timeout: timeoutMs },
      (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          resolve({ status: res.statusCode, ct: res.headers['content-type'] || '', buf, error: null });
        });
        res.on('error', e => resolve({ status: 0, ct: '', buf: Buffer.alloc(0), error: e.message }));
      }
    );
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, ct: '', buf: Buffer.alloc(0), error: 'timeout' }); });
    req.on('error', e => resolve({ status: 0, ct: '', buf: Buffer.alloc(0), error: e.message }));
    req.end();
  });
}

// JPEG SOF 파서 (라이브러리 없이 해상도 추출)
function parseJpegDimensions(buf) {
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xFF) break;
    const marker = buf[i + 1];
    if (marker === 0xFF) { i++; continue; }
    if (buf.length < i + 4) break;
    const segLen = buf.readUInt16BE(i + 2);
    const isSOF = (marker >= 0xC0 && marker <= 0xC3) || (marker >= 0xC5 && marker <= 0xC7)
               || (marker >= 0xC9 && marker <= 0xCB) || (marker >= 0xCD && marker <= 0xCF);
    if (isSOF && buf.length >= i + 9) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + segLen;
  }
  return null;
}

// 이미지 기술 검사
function techCheck(url, fetchResult) {
  const { status, ct, buf, error } = fetchResult;
  if (error || status !== 200) return { ok: false, reason: `접근 실패: HTTP ${status}${error ? ' / '+error : ''}` };
  const magic = buf.slice(0, 4).toString('hex');
  const isJpeg = magic.startsWith('ffd8ff');
  const isPng  = magic.startsWith('89504e47');
  if (!isJpeg && !isPng) return { ok: false, reason: `비이미지 (매직 ${magic}, content-type: ${ct})` };
  const dims = isJpeg ? parseJpegDimensions(buf) : null;
  const sizeKB = (buf.length / 1024).toFixed(1);
  return {
    ok: true,
    size: buf.length,
    format: isJpeg ? 'JPEG' : 'PNG',
    dims,
    reason: `HTTP 200 + ${isJpeg?'JPEG':'PNG'} ${sizeKB}KB${dims ? ` + ${dims.width}×${dims.height}px` : ''}`,
  };
}

// 주소 정규화 (구+로/길 추출)
function normAddr(s) { return (s||'').replace(/\s+/g,'').toLowerCase(); }
function normName(s) { return (s||'').replace(/[^\wㄱ-힣]/g,'').toLowerCase(); }

// 좌표 거리 (Haversine, 미터)
function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── 경로 ─────────────────────────────────────────────────────
const CAND_JSON  = path.join(ROOT, 'data/tourapi/candidates/busan/busan-integrated-candidates.json');
const CAND_CSV   = path.join(ROOT, 'data/tourapi/candidates/busan/busan-integrated-candidates.csv');
const AUDIT_CSV  = path.join(ROOT, 'data/tourapi/candidates/busan/busan-image-rights-audit.csv');
const BATCH_DIR  = path.join(ROOT, 'data/tourapi/raw/busan/2026-07-23/batch');
const OUT_CSV    = path.join(ROOT, 'data/tourapi/reports/busan/busan-F-00324-image-replacement.csv');
const TMP_CSV    = OUT_CSV + '.tmp';

// 원본 크기 스냅샷
const snapJson  = fs.statSync(CAND_JSON).size;
const snapCsv   = fs.statSync(CAND_CSV).size;
const snapAudit = fs.statSync(AUDIT_CSV).size;

// ── 대상 후보 로드 ────────────────────────────────────────────
const cands = JSON.parse(fs.readFileSync(CAND_JSON, 'utf8'));
const target = cands.find(c => c.candidate_id === 'busan-F-00324');
if (!target) hardStop('busan-F-00324 후보 없음');

const BROKEN_URL = target.image_url;
const TARGET_NAME = target.title_ko;
const TARGET_LAT  = parseFloat(target.latitude);
const TARGET_LNG  = parseFloat(target.longitude);
const TARGET_ADDR = target.address;

console.log('=== TASK-DATA-BUSAN-RESTAURANT-IMAGE-FIX-20A-11 ===');
console.log('대상:', target.candidate_id, '|', TARGET_NAME);
console.log('깨진 URL:', BROKEN_URL);
console.log('주소:', TARGET_ADDR);
console.log('');

// ── FoodService raw 로드 ──────────────────────────────────────
let fsAllItems = [];
for (const f of fs.readdirSync(BATCH_DIR).filter(f => f.startsWith('busan-food-ko'))) {
  const raw = JSON.parse(fs.readFileSync(path.join(BATCH_DIR, f), 'utf8'));
  fsAllItems.push(...(raw.getFoodKr?.item || []));
}
console.log(`FoodService raw 총 ${fsAllItems.length}건 로드됨`);

// UC_SEQ=1612 항목
const fs1612 = fsAllItems.find(x => x.UC_SEQ === 1612);
if (!fs1612) hardStop('FoodService raw에 UC_SEQ=1612 없음');
console.log('UC_SEQ=1612 확인:', fs1612.MAIN_TITLE, '|', fs1612.MAIN_IMG_NORMAL);

// ── Step 1: UC_SEQ=1612 다른 이미지 필드 ─────────────────────
console.log('\n[Step 1] UC_SEQ=1612 이미지 필드 검사');
const step1Result = await fetchUrl(fs1612.MAIN_IMG_THUMB);
const step1Check  = techCheck(fs1612.MAIN_IMG_THUMB, step1Result);
console.log('  MAIN_IMG_THUMB:', step1Check.ok ? `✅ ${step1Check.reason}` : `❌ ${step1Check.reason}`);
let found = null;

if (step1Check.ok) {
  found = {
    step: 1,
    provider: 'VisitBusan_FoodService',
    sourceId: 'FoodService:1612:ko',
    url: fs1612.MAIN_IMG_THUMB,
    check: step1Check,
    reason: `Step1: UC_SEQ=1612 THUMB 필드에서 정상 이미지 확인. ${step1Check.reason}`,
  };
}

// ── Step 2: FoodService raw — 같은 이름+주소 다른 UC_SEQ ─────
if (!found) {
  console.log('\n[Step 2] FoodService raw 전체 — 이름+주소 일치 다른 항목 탐색');
  const nName = normName(TARGET_NAME);
  const nAddr = normAddr(TARGET_ADDR).replace('부산','').substring(0, 15);
  const candidates2 = fsAllItems.filter(x =>
    x.UC_SEQ !== 1612 &&
    normName(x.MAIN_TITLE) === nName &&
    normAddr(x.ADDR1 || '').includes('자갈치해안로') &&
    x.MAIN_IMG_NORMAL
  );
  console.log(`  이름+자갈치해안로 일치: ${candidates2.length}건`);

  for (const item of candidates2) {
    const distM = haversineM(TARGET_LAT, TARGET_LNG, item.LAT, item.LNG);
    console.log(`  UC_SEQ=${item.UC_SEQ} | ${item.MAIN_TITLE} | ${item.ADDR1} | 거리=${distM.toFixed(0)}m | tel=${item.CNTCT_TEL}`);

    // 음식점명 일치 + 주소 일치 + 좌표 50m 이내 → 동일 음식점 판정
    const nameOk = normName(item.MAIN_TITLE) === nName;
    const addrOk = normAddr(item.ADDR1).includes('자갈치해안로');
    const coordOk = distM <= 50;

    if (!nameOk || !addrOk || !coordOk) {
      console.log(`  → 동일 음식점 조건 미충족 (name=${nameOk}, addr=${addrOk}, coord≤50m=${coordOk})`);
      continue;
    }

    // 이미지 접근 테스트
    const imgFetch = await fetchUrl(item.MAIN_IMG_NORMAL);
    const imgCheck = techCheck(item.MAIN_IMG_NORMAL, imgFetch);
    console.log(`  UC_SEQ=${item.UC_SEQ} MAIN_IMG_NORMAL: ${imgCheck.ok ? '✅' : '❌'} ${imgCheck.reason}`);

    if (imgCheck.ok) {
      // 연결된 기존 후보 찾기
      const linkedCand = cands.find(c =>
        c.linked_source_keys && (
          c.linked_source_keys.includes(`FoodService:${item.UC_SEQ}:ko`) ||
          c.linked_source_keys.includes(`VisitBusanContent:food:${item.UC_SEQ}:ko`)
        )
      );
      found = {
        step: 2,
        provider: 'VisitBusan_FoodService',
        sourceId: `FoodService:${item.UC_SEQ}:ko`,
        url: item.MAIN_IMG_NORMAL,
        check: imgCheck,
        ucSeq: item.UC_SEQ,
        distM: distM.toFixed(0),
        linkedCand: linkedCand?.candidate_id || '',
        phone1612: fs1612.CNTCT_TEL,
        phoneAlt: item.CNTCT_TEL,
        reason: `Step2: FoodService raw 이름(${item.MAIN_TITLE})+주소(자갈치해안로 55) 일치 항목 UC_SEQ=${item.UC_SEQ} 발견. 좌표 거리 ${distM.toFixed(0)}m (동일 음식점 판정). 이미 ${linkedCand?.candidate_id||'미매핑'} 후보로 등록됨. 이미지 기술검사 통과. ${imgCheck.reason}`,
      };
      break;
    }
  }
}

// ── Step 3: VisitBusan 공식 페이지 ────────────────────────────
if (!found) {
  console.log('\n[Step 3] VisitBusan 공식 상세 페이지 탐색');
  const vbUrl = 'https://www.visitbusan.net/kr/index.do?menuCd=DOM_000000201002001000&uc_seq=1612&lang_cd=ko';
  console.log('  페이지 URL:', vbUrl);
  const pageFetch = await fetchUrl(vbUrl, 15000);
  if (pageFetch.status === 200 && pageFetch.buf.length > 0) {
    const html = pageFetch.buf.toString('utf8');
    // VisitBusan 이미지 URL 패턴 탐색
    const imgMatches = [...html.matchAll(/uploadImgs\/files\/cntnts\/[^"']+_ttiel/g)].map(m => m[0]);
    const uniqueImgs = [...new Set(imgMatches)];
    console.log(`  페이지 크기: ${pageFetch.buf.length}B | 이미지 패턴 발견: ${uniqueImgs.length}건`);
    uniqueImgs.forEach(u => console.log('   -', u));

    for (const imgPath of uniqueImgs) {
      const imgUrl = `https://www.visitbusan.net/${imgPath}`;
      if (imgUrl === BROKEN_URL) continue;
      const imgFetch = await fetchUrl(imgUrl);
      const imgCheck = techCheck(imgUrl, imgFetch);
      if (imgCheck.ok) {
        found = {
          step: 3,
          provider: 'VisitBusan_DetailPage',
          sourceId: 'VisitBusanContent:food:1612:ko',
          url: imgUrl,
          check: imgCheck,
          reason: `Step3: VisitBusan UC_SEQ=1612 공식 상세 페이지에서 정상 이미지 발견. ${imgCheck.reason}`,
        };
        break;
      }
    }
  } else {
    console.log(`  페이지 접근 실패: HTTP ${pageFetch.status}`);
  }
}

// ── Step 4: KTO 동일 음식점 ───────────────────────────────────
let ktoResult = 'no_match';
if (!found) {
  console.log('\n[Step 4] KTO 후보 동일 음식점 탐색');
  const ktoCands = cands.filter(c =>
    c.candidate_id.startsWith('busan-K-') &&
    c.linked_source_keys && c.linked_source_keys.includes('KorService2') &&
    normName(c.title_ko || '') === normName(TARGET_NAME)
  );
  console.log('  이름 일치 KTO 후보:', ktoCands.length, '건');

  // 이름 미일치 시 좌표 100m 탐색
  if (ktoCands.length === 0) {
    const coordKto = cands.filter(c => {
      if (!c.candidate_id.startsWith('busan-K-')) return false;
      const lat = parseFloat(c.latitude), lng = parseFloat(c.longitude);
      if (!lat || !lng) return false;
      return haversineM(TARGET_LAT, TARGET_LNG, lat, lng) <= 100;
    });
    console.log('  좌표 100m 이내 KTO 후보:', coordKto.length, '건');
    coordKto.forEach(c => {
      const d = haversineM(TARGET_LAT, TARGET_LNG, parseFloat(c.latitude), parseFloat(c.longitude));
      console.log(`    ${c.candidate_id} | ${c.title_ko} | ${d.toFixed(0)}m`);
    });
    if (coordKto.length > 0) ktoResult = 'manual_review_needed';
  } else {
    ktoResult = 'match_found';
  }
} else {
  console.log('\n[Step 4] 이미 대체 후보 확정 — KTO 탐색 건너뜀');
}

// ── 결과 확정 ─────────────────────────────────────────────────
console.log('\n=== 탐색 결과 확정 ===');

let outRow;
if (found) {
  console.log(`✅ Step ${found.step} 에서 대체 이미지 발견`);
  console.log('  provider:', found.provider);
  console.log('  sourceId:', found.sourceId);
  console.log('  url:', found.url);
  console.log('  기술검사:', found.check.reason);

  outRow = [
    target.candidate_id,
    TARGET_NAME,
    BROKEN_URL,
    found.provider,
    found.sourceId,
    found.url,
    'unverified_official_promotional_image',
    'unknown',
    'unknown',
    'unknown',
    'found',
    found.reason,
  ];
} else {
  console.log('❌ 모든 Step에서 대체 이미지 없음 → replacement_not_found');
  outRow = [
    target.candidate_id,
    TARGET_NAME,
    BROKEN_URL,
    '',
    '',
    '',
    'unknown',
    'unknown',
    'unknown',
    'unknown',
    'replacement_not_found',
    `Step1~4 모두 탐색 완료. FoodService 이름+주소 중복 없음. KTO=${ktoResult}. 수동 재수집 필요.`,
  ];
}

// ── 원본 무변경 검증 ──────────────────────────────────────────
if (fs.statSync(CAND_JSON).size  !== snapJson)  hardStop('candidates JSON 크기 변경 감지');
if (fs.statSync(CAND_CSV).size   !== snapCsv)   hardStop('candidates CSV 크기 변경 감지');
if (fs.statSync(AUDIT_CSV).size  !== snapAudit) hardStop('audit CSV 크기 변경 감지');

// ── 허용값 검증 ───────────────────────────────────────────────
const validStatus = new Set(['found', 'manual_review', 'replacement_not_found']);
const validLicense = new Set(['unverified_official_promotional_image', 'unknown']);
if (!validStatus.has(outRow[10]))  hardStop(`replacement_status 허용값 외: ${outRow[10]}`);
if (!validLicense.has(outRow[6]))  hardStop(`license_type 허용값 외: ${outRow[6]}`);

// ── 원자적 CSV 출력 ───────────────────────────────────────────
const HEADER = [
  'candidate_id', 'restaurant_name', 'broken_image_url',
  'replacement_provider', 'replacement_source_id', 'replacement_image_url',
  'license_type', 'commercial_use', 'modification_use', 'attribution_required',
  'replacement_status', 'decision_reason',
];

const csvText = [HEADER.join(','), outRow.map(escapeCsv).join(',')].join('\n');
fs.writeFileSync(TMP_CSV, csvText, 'utf8');

const tmpLines = fs.readFileSync(TMP_CSV, 'utf8').split('\n').length;
if (tmpLines !== 2) {
  fs.unlinkSync(TMP_CSV);
  hardStop(`임시 파일 행수 이상: ${tmpLines} (기대 2)`);
}
fs.renameSync(TMP_CSV, OUT_CSV);

console.log('\n[ 변경 파일 ]');
console.log('  data/tourapi/reports/busan/busan-F-00324-image-replacement.csv (신규)');
console.log('');
console.log('TASK-DATA-BUSAN-RESTAURANT-IMAGE-FIX-20A-11 부산명물횟집 공식 대체 이미지 조사 완료 — 실제 교체·commit·push 보류.');
