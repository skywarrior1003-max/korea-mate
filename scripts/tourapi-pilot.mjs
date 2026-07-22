#!/usr/bin/env node
/**
 * tourapi-pilot.mjs  (EngService2 version)
 *
 * 부산 city_spots 20개 표본 TourAPI 조회 & 비교파일 생성
 * API: EngService2 (KorService1 — 미승인, 기존 프로젝트도 EngService2 사용)
 *
 * READ-ONLY: Supabase (anon), TourAPI (English)
 * NO: DB 수정 / commit / push
 * MAX: 120 TourAPI 호출
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));

// ── Credentials (from env vars, NEVER log them) ───────────────────────────────
const SB_URL   = (process.env.SB_URL   || '').replace(/\/$/, '');
const SB_ANON  = process.env.SB_ANON  || '';
const TOUR_KEY = process.env.TOUR_KEY || '';

if (!SB_URL || !SB_ANON || !TOUR_KEY) {
  console.error('ERROR: SB_URL / SB_ANON / TOUR_KEY 환경변수 필요');
  process.exit(1);
}

// ── Config ────────────────────────────────────────────────────────────────────
const MAX_CALLS     = 120;
const CALL_DELAY_MS = 500;
const MAX_RETRY     = 2;
const TOURAPI_BASE  = 'https://apis.data.go.kr/B551011/EngService2';
const OUT_DIR       = process.env.OUT_DIR || path.resolve(__dir, '../tmp/tourapi-pilot');

// ── State ─────────────────────────────────────────────────────────────────────
let callCount = 0;
const callLog = [];
const cidCache = new Map();

// ── Utilities ─────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

function distM(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function normStr(s) {
  return String(s || '').replace(/[\s\-()\[\]]/g, '').toLowerCase();
}

// ── Supabase REST (read-only anon) ────────────────────────────────────────────
async function sbGet(table, params) {
  const url = new URL(`${SB_URL}/rest/v1/${table}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

// ── TourAPI EngService2 call with retry ───────────────────────────────────────
async function tourCall(endpoint, params, spotName, apiType, retry = 0) {
  if (callCount >= MAX_CALLS) throw new Error('MAX_CALLS_REACHED');
  await sleep(CALL_DELAY_MS);

  const url = new URL(`${TOURAPI_BASE}/${endpoint}`);
  url.searchParams.set('serviceKey', TOUR_KEY);
  url.searchParams.set('MobileOS', 'ETC');
  url.searchParams.set('MobileApp', 'KoreaMate');
  url.searchParams.set('_type', 'json');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  callCount++;
  const t0 = Date.now();
  const log = { seq: callCount, spot: spotName, apiType, success: false, httpStatus: null, responseMs: 0, retries: retry, error: null };

  try {
    const res = await fetch(url.toString());
    log.httpStatus = res.status;
    log.responseMs = Date.now() - t0;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const rc1 = data?.response?.header?.resultCode;
    const rc2 = data?.resultCode;
    const rc  = rc1 ?? rc2;
    if (rc && rc !== '0000') throw new Error(`TourAPI ${rc}: ${data?.response?.header?.resultMsg ?? data?.resultMsg}`);

    log.success = true;
    callLog.push(log);
    console.log(`  [${callCount}/${MAX_CALLS}] ${apiType} ← ${spotName}: OK (${log.responseMs}ms)`);
    return data;
  } catch (err) {
    log.error = err.message;
    log.responseMs = Date.now() - t0;
    if (retry < MAX_RETRY && err.message !== 'MAX_CALLS_REACHED') {
      callLog.push({ ...log, retries: retry });
      console.warn(`  [${callCount}/${MAX_CALLS}] ${apiType} ← ${spotName}: RETRY ${retry + 1} (${err.message})`);
      await sleep(1500 * (retry + 1));
      return tourCall(endpoint, params, spotName, apiType, retry + 1);
    }
    callLog.push(log);
    console.error(`  [${callCount}/${MAX_CALLS}] ${apiType} ← ${spotName}: FAIL (${err.message})`);
    return null;
  }
}

function extractItems(data) {
  const nested = data?.response?.body?.items?.item;
  if (nested) return Array.isArray(nested) ? nested : [nested];
  const flat = data?.items?.item;
  if (flat) return Array.isArray(flat) ? flat : [flat];
  return [];
}

// ── Scoring & matching ────────────────────────────────────────────────────────

// TourAPI contenttypeid — 쇼핑·음식·레포츠 계열
const SHOPPING_TYPE_IDS = new Set([38, 79, 82]);

function scoreCandidates(candidates, spot, dbCategory = '') {
  // category=nature이면 쇼핑·매장 계열 후보 제외 (DAISO·편의점 등 지명 포함 상업시설 방지)
  const pool = (dbCategory === 'nature')
    ? candidates.filter(c => !SHOPPING_TYPE_IDS.has(parseInt(c.contenttypeid, 10)))
    : candidates;

  if (pool.length === 0) return [];

  const enName = normStr(spot.dbName);
  const koName = normStr(spot.koName);
  const koAlt  = normStr(spot.koAlt || '');

  return pool.map(c => {
    const title = normStr(c.title);
    let s = 0;

    // 이름 일치: 본 시설(시작·정확 일치)과 하위 업체(중간 포함)를 구분
    if (title === enName || title === koName || (koAlt && title === koAlt)) {
      s += 100;                            // 정확 일치
    } else if (title.startsWith(enName) || title.startsWith(koName) || (koAlt && title.startsWith(koAlt))) {
      s += 80;                             // 본 시설명으로 시작 (예: "Shinsegae Centum City (한글명)")
    } else if (enName.includes(title) || (koAlt && koAlt.includes(title))) {
      s += 60;                             // 후보명이 DB명 내 포함
    } else if (title.includes(enName)) {
      s += 40;                             // DB명이 후보명 내 포함 → 하위 업체 위치 표기 가능성
    } else if (koName.includes(title)) {
      s += 50;
    } else if (title.includes(koName)) {
      s += 30;
    } else if (koAlt && title.includes(koAlt)) {
      s += 40;
    }

    // GPS 거리 점수
    const d = distM(spot.gpsLat, spot.gpsLng, parseFloat(c.mapy), parseFloat(c.mapx));
    if (d !== null) {
      if (d < 100)       s += 80;
      else if (d < 300)  s += 50;
      else if (d < 800)  s += 20;
      else if (d < 2000) s += 5;
    }

    return { ...c, _score: s, _dist: d };
  }).sort((a, b) => {
    if (b._score !== a._score) return b._score - a._score;
    // 동점 우선순위: ① contentTypeId 일치 ② 거리
    const aT = spot.contentTypeId && parseInt(a.contenttypeid, 10) === spot.contentTypeId ? 1 : 0;
    const bT = spot.contentTypeId && parseInt(b.contenttypeid, 10) === spot.contentTypeId ? 1 : 0;
    if (bT !== aT) return bT - aT;
    if (a._dist === null && b._dist === null) return 0;
    if (a._dist === null) return 1;
    if (b._dist === null) return -1;
    return a._dist - b._dist;
  });
}

function getMatchStatus(spot, best, allCount) {
  if (!best) return 'no_match';
  // 5km 초과는 오매칭으로 판정 (방장산 224km 케이스 방지)
  if (best._dist !== null && best._dist > 5000) return 'wrong_match';
  const title  = normStr(best.title);
  const enName = normStr(spot.dbName);
  const koName = normStr(spot.koName);
  const nameExact   = title === enName || title === koName;
  const namePartial = title.includes(enName) || enName.includes(title) || title.includes(koName) || koName.includes(title);
  const d = best._dist;
  const coordClose  = d !== null && d < 500;
  if (nameExact && coordClose)                  return 'exact_match';
  if ((nameExact || namePartial) && coordClose) return 'probable_match';
  if (allCount > 1)                             return 'multiple_candidates';
  if (namePartial || coordClose)                return 'probable_match';
  return 'manual_review_required';
}

function getReviewFlags(spot, introData) {
  const flags = [];
  if (introData) {
    if (introData.usetime) flags.push(`운영시간 API값: ${introData.usetime.slice(0, 60)}`);
    if (introData.restdate) flags.push('휴무일 정보 있음');
    if (introData.usefee || introData.entryfee) flags.push('입장료 정보 있음');
  }
  const complexList = ['Beomeosa Temple','Busan Lotte World Adventure','Shinsegae Centum City',
                       'Haeundae Blue Line Park','Busan Cinema Center','Busan Asiad Main Stadium'];
  if (complexList.includes(spot.dbName)) flags.push('운영시간 복잡(계절·행사·시설별)');
  return flags;
}

// ── Process one spot ──────────────────────────────────────────────────────────
async function processSpot(spot, dbRow) {
  console.log(`\n▸ ${spot.sampleId}: ${spot.dbName}`);
  const result = {
    sampleId: spot.sampleId, dbName: spot.dbName, koName: spot.koName,
    candidates: [], selectedContentId: null, selectedContentTypeId: null,
    matchStatus: 'no_match', tourApiCommon: null, tourApiIntro: null,
    imageDetailCalled: false, imageItems: [],
    officialReviewRequired: false, reviewReasons: [],
  };

  // 1. Search by English name
  let candidates = [];
  if (callCount < MAX_CALLS) {
    const d = await tourCall('searchKeyword2', { keyword: spot.dbName, numOfRows: 5, pageNo: 1 }, spot.dbName, 'searchKeyword');
    candidates = extractItems(d);
  }

  // 2. GPS fallback if no results or spot flagged
  if ((candidates.length === 0 || spot.gpsFallback) && callCount < MAX_CALLS) {
    console.log(`  → GPS fallback (radius 500m)`);
    const d2 = await tourCall('locationBasedList2',
      { mapX: spot.gpsLng, mapY: spot.gpsLat, radius: 500, numOfRows: 5 },
      spot.dbName, 'locationBasedList');
    const gpsCands = extractItems(d2);
    if (gpsCands.length > 0) candidates = gpsCands;
  }

  // 3. Korean alt name search
  if (candidates.length === 0 && spot.koAlt && callCount < MAX_CALLS) {
    const d3 = await tourCall('searchKeyword2', { keyword: spot.koAlt, numOfRows: 5, pageNo: 1 }, spot.dbName, 'searchKeyword(koAlt)');
    candidates = extractItems(d3);
  }

  // 4. Korean name search
  if (candidates.length === 0 && callCount < MAX_CALLS) {
    const d4 = await tourCall('searchKeyword2', { keyword: spot.koName, numOfRows: 5, pageNo: 1 }, spot.dbName, 'searchKeyword(ko)');
    candidates = extractItems(d4);
  }

  if (candidates.length === 0) {
    result.matchStatus = 'no_match';
    console.log(`  → no_match`);
    return result;
  }

  const dbCategory = dbRow?.category || '';
  const scored = scoreCandidates(candidates, spot, dbCategory);
  const best   = scored[0];

  if (!best) {
    result.matchStatus = 'no_match';
    console.log(`  → no_match (모든 후보 필터 제외)`);
    return result;
  }

  result.candidates = scored.map(c => ({
    contentid: c.contentid, contenttypeid: c.contenttypeid,
    title: c.title, addr1: c.addr1,
    mapx: c.mapx, mapy: c.mapy,
    firstimage: c.firstimage || '',
    _dist: c._dist, _score: c._score,
  }));
  result.selectedContentId      = best.contentid;
  result.selectedContentTypeId  = best.contenttypeid;
  result.matchStatus            = getMatchStatus(spot, best, candidates.length);

  // 5. detailCommon2 (cache by contentId)
  if (callCount < MAX_CALLS) {
    if (cidCache.has(best.contentid)) {
      result.tourApiCommon = cidCache.get(best.contentid);
      console.log(`  → detailCommon2: cache (${best.contentid})`);
    } else {
      const dc = await tourCall('detailCommon2', {
        contentId: best.contentid,
      }, spot.dbName, 'detailCommon');
      result.tourApiCommon = extractItems(dc)[0] || null;
      cidCache.set(best.contentid, result.tourApiCommon);
    }
  }

  // 6. detailIntro2
  if (callCount < MAX_CALLS && result.selectedContentId) {
    const engTypeId = result.selectedContentTypeId || 76;
    const di = await tourCall('detailIntro2', {
      contentId: result.selectedContentId, contentTypeId: engTypeId,
    }, spot.dbName, 'detailIntro');
    result.tourApiIntro = extractItems(di)[0] || null;
  }

  // 7. detailImage2 — only if DB has generic unsplash image
  const dbHasGenericImage = dbRow?.image_url?.includes('source.unsplash.com');
  const hasFirstImage     = !!(result.tourApiCommon?.firstimage);
  if ((!hasFirstImage || dbHasGenericImage) && callCount < MAX_CALLS) {
    const img = await tourCall('detailImage2', {
      contentId: result.selectedContentId,
      imageYN: 'Y', numOfRows: 3,
    }, spot.dbName, 'detailImage');
    result.imageItems        = extractItems(img);
    result.imageDetailCalled = true;
  }

  const flags = getReviewFlags(spot, result.tourApiIntro);
  result.officialReviewRequired = flags.length > 0;
  result.reviewReasons          = flags;
  return result;
}

// ── CSV helpers ───────────────────────────────────────────────────────────────
function escCsv(v) {
  const s = v == null ? '' : String(v).replace(/\r?\n/g, ' ');
  return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCsvRow(obj) { return Object.values(obj).map(escCsv).join(','); }
function toCsvHeader(obj) { return Object.keys(obj).join(','); }

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // ── STEP 2: Supabase restaurant rows ───────────────────────────────────────
  console.log(`\n=== STEP 2: Supabase restaurant rows (city='busan') ===\n`);
  let restaurantRows = [];
  try {
    restaurantRows = await sbGet('city_spots', {
      select:   'id,name,subcategory,district,address,lat,lng,opening_hours,official_url,external_id,source_type',
      city:     'eq.busan',
      category: 'eq.restaurant',
      order:    'id.asc',
    });
    console.log(`restaurant rows: ${restaurantRows.length}`);
    restaurantRows.forEach(r =>
      console.log(`  [${r.id}] ${r.name} | sub:${r.subcategory || '-'} | ${r.district || '-'} | ext:${r.external_id || '-'}`)
    );
  } catch (err) {
    console.error('Supabase restaurant query failed:', err.message);
  }

  // ── STEP 3: Spot definitions (fixed list) ──────────────────────────────────
  const ALL_SPOTS = [
    { sampleId: 'A-1', dbName: 'Gamcheon Culture Village',        koName: '감천문화마을',         contentTypeId: 12, gpsLat: 35.0975, gpsLng: 129.0104 },
    { sampleId: 'A-2', dbName: 'Haedong Yonggungsa Temple',       koName: '해동용궁사',           contentTypeId: 12, gpsLat: 35.1883, gpsLng: 129.2233 },
    { sampleId: 'A-3', dbName: 'Yongdusan Park and Busan Tower',  koName: '부산타워',  koAlt: '용두산공원', contentTypeId: 12, gpsLat: 35.1007, gpsLng: 129.0326 },
    { sampleId: 'A-4', dbName: 'Busan X the Sky',                 koName: '부산엑스더스카이', koAlt: '엘씨티전망대', contentTypeId: 12, gpsLat: 35.1595, gpsLng: 129.1690, gpsFallback: true },
    { sampleId: 'A-5', dbName: 'Haeundae Blue Line Park',         koName: '해운대블루라인파크', koAlt: '해변열차', contentTypeId: 12, gpsLat: 35.1588, gpsLng: 129.1810 },
    { sampleId: 'B-1', dbName: 'Hwangnyeongsan Night View Trail', koName: '황령산',               contentTypeId: 12, gpsLat: 35.1475, gpsLng: 129.0715 },
    { sampleId: 'B-2', dbName: 'Jangsan Mountain Trail',          koName: '장산',                 contentTypeId: 12, gpsLat: 35.1894, gpsLng: 129.2017 },
    { sampleId: 'B-3', dbName: 'Igidae Coastal Walk',             koName: '이기대해안산책로', koAlt: '이기대공원', contentTypeId: 12, gpsLat: 35.1215, gpsLng: 129.1287 },
    { sampleId: 'B-4', dbName: 'Taejongdae Resort Park',          koName: '태종대유원지',         contentTypeId: 12, gpsLat: 35.0527, gpsLng: 129.0866 },
    { sampleId: 'B-5', dbName: 'Geumjeongsan Mountain',           koName: '금정산',               contentTypeId: 12, gpsLat: 35.2806, gpsLng: 129.0556 },
    { sampleId: 'D-1', dbName: 'Beomeosa Temple',                 koName: '범어사',               contentTypeId: 12, gpsLat: 35.2838, gpsLng: 129.0686 },
    { sampleId: 'D-2', dbName: 'Busan Lotte World Adventure',     koName: '롯데월드어드벤처부산', contentTypeId: 12, gpsLat: 35.1922, gpsLng: 129.2138 },
    { sampleId: 'D-3', dbName: 'Shinsegae Centum City',           koName: '신세계센텀시티', koAlt: '신세계백화점센텀시티점', contentTypeId: 38, gpsLat: 35.1698, gpsLng: 129.1290 },
    { sampleId: 'E-1', dbName: 'Busan Cinema Center',             koName: '영화의전당',           contentTypeId: 14, gpsLat: 35.1710, gpsLng: 129.1270 },
    { sampleId: 'E-2', dbName: 'F1963',                           koName: 'F1963',                contentTypeId: 14, gpsLat: 35.1760, gpsLng: 129.1133, gpsFallback: true },
    { sampleId: 'E-3', dbName: 'Busan Asiad Main Stadium',        koName: '부산아시아드주경기장', contentTypeId: 14, gpsLat: 35.1901, gpsLng: 129.0587 },
    { sampleId: 'C-1', dbName: 'Jagalchi Fish Market',            koName: '자갈치시장',           contentTypeId: 38, gpsLat: 35.0971, gpsLng: 129.0302 },
    { sampleId: 'C-2', dbName: 'Gukje Market',                    koName: '국제시장',             contentTypeId: 38, gpsLat: 35.1014, gpsLng: 129.0284 },
    { sampleId: 'C-3', dbName: 'Dalmaji Hill',                    koName: '달맞이언덕',           contentTypeId: 12, gpsLat: 35.1580, gpsLng: 129.1823 },
    { sampleId: 'C-4', dbName: 'Jeonpo Cafe Street',              koName: '전포카페거리', koAlt: '전포동 카페거리', contentTypeId: 12, gpsLat: 35.1579, gpsLng: 129.0632, gpsFallback: true },
  ];

  console.log(`\n=== STEP 3: Final 20 spots ===`);
  ALL_SPOTS.forEach(s => console.log(`  ${s.sampleId}: ${s.dbName} (${s.koName})`));

  // ── STEP 4: Extract all 20 from Supabase ──────────────────────────────────
  console.log(`\n=== STEP 4: Supabase — extract 20 spots ===\n`);
  let dbRows = [];
  try {
    const spotNames = ALL_SPOTS.map(s => s.dbName);
    dbRows = await sbGet('city_spots', {
      select: 'id,city,name,name_l10n,category,subcategory,district,address,description,image_url,lat,lng,duration_minutes,best_time_slot,opening_hours,tags,source_type,external_id,official_url,entry_fee,difficulty,updated_at',
      city:   'eq.busan',
      name:   `in.(${spotNames.map(n => `"${n}"`).join(',')})`,
      order:  'id.asc',
    });
    console.log(`Retrieved ${dbRows.length} / 20 rows`);
    const missing = ALL_SPOTS.map(s => s.dbName).filter(n => !dbRows.find(r => r.name === n));
    if (missing.length) console.warn('MISSING from DB:', missing.join(', '));
  } catch (err) {
    console.error('Supabase 20-spot query failed:', err.message);
  }

  const dbOutPath = path.join(OUT_DIR, 'busan-20-city-spots.json');
  fs.writeFileSync(dbOutPath, JSON.stringify({ extractedAt: new Date().toISOString(), count: dbRows.length, rows: dbRows }, null, 2), 'utf8');
  console.log(`→ Saved: ${dbOutPath}`);

  const dbByName = Object.fromEntries(dbRows.map(r => [r.name, r]));

  // ── STEP 5-7: TourAPI calls ────────────────────────────────────────────────
  console.log(`\n=== STEP 5-7: TourAPI EngService2 (max ${MAX_CALLS} calls) ===`);
  const tourResults = [];
  for (const spot of ALL_SPOTS) {
    if (callCount >= MAX_CALLS) {
      console.error(`[STOP] Max ${MAX_CALLS} calls at ${spot.sampleId}`);
      tourResults.push({ sampleId: spot.sampleId, dbName: spot.dbName, koName: spot.koName,
        candidates: [], selectedContentId: null, selectedContentTypeId: null,
        matchStatus: 'skipped_call_limit', tourApiCommon: null, tourApiIntro: null,
        imageDetailCalled: false, imageItems: [], officialReviewRequired: false, reviewReasons: [] });
      continue;
    }
    const r = await processSpot(spot, dbByName[spot.dbName] || null);
    tourResults.push(r);
  }

  // ── 중복 contentId 감지 ────────────────────────────────────────────────────
  const cidMap = {};
  for (const r of tourResults) {
    if (r.selectedContentId) {
      (cidMap[r.selectedContentId] = cidMap[r.selectedContentId] || []).push(r.sampleId);
    }
  }
  for (const [cid, sids] of Object.entries(cidMap)) {
    if (sids.length > 1) {
      console.warn(`\n⚠ 중복 contentId ${cid}: ${sids.join(', ')}`);
      for (const r of tourResults) {
        if (r.selectedContentId === cid) {
          r.matchStatus = 'duplicate_contentid_conflict';
          r.officialReviewRequired = true;
          r.reviewReasons = [...(r.reviewReasons || []), `contentId ${cid} 중복: ${sids.join(', ')}`];
        }
      }
    }
  }

  // ── STEP 9a: Save TourAPI raw ──────────────────────────────────────────────
  const rawPath = path.join(OUT_DIR, 'busan-20-tourapi-raw.json');
  fs.writeFileSync(rawPath, JSON.stringify({
    calledAt: new Date().toISOString(),
    apiService: 'EngService2',
    note: 'KorService1 미승인(HTTP 500) — 영문 API 사용. 기존 프로젝트도 EngService2 사용 중.',
    totalCalls: callCount,
    results: tourResults,
  }, null, 2), 'utf8');
  console.log(`\n→ Saved: ${rawPath}`);

  // ── STEP 9b: Comparison CSV ────────────────────────────────────────────────
  const csvRows = tourResults.map(r => {
    const spot = ALL_SPOTS.find(s => s.sampleId === r.sampleId) || {};
    const db   = dbByName[r.dbName] || {};
    const tc   = r.tourApiCommon || {};
    const ti   = r.tourApiIntro  || {};
    const taLat = tc.mapy ? parseFloat(tc.mapy) : null;
    const taLng = tc.mapx ? parseFloat(tc.mapx) : null;
    const dbLat = db.lat ? parseFloat(db.lat) : null;
    const dbLng = db.lng ? parseFloat(db.lng) : null;
    const coordDist = (dbLat && taLat) ? distM(dbLat, dbLng, taLat, taLng) : null;

    const nameMismatch = (() => {
      if (!tc.title) return 'no_tourapi_data';
      const en = normStr(r.dbName); const tn = normStr(tc.title);
      if (en === tn || tn.includes(en) || en.includes(tn)) return 'match_or_partial';
      return 'review_needed';
    })();

    const imgUrls = (r.imageItems || []).map(i => i.originimgurl || '').filter(Boolean).join(' | ');

    return {
      sample_id:                r.sampleId,
      city_spots_id:            db.id ?? '',
      db_name:                  r.dbName,
      db_category:              db.category ?? '',
      db_subcategory:           db.subcategory ?? '',
      db_district:              db.district ?? '',
      db_address:               db.address ?? '',
      db_lat:                   db.lat ?? '',
      db_lng:                   db.lng ?? '',
      db_opening_hours:         db.opening_hours ? JSON.stringify(db.opening_hours) : '',
      db_entry_fee:             db.entry_fee ?? '',
      db_official_url:          db.official_url ?? '',
      db_image_url:             db.image_url ?? '',
      db_external_id:           db.external_id ?? '',
      db_source_type:           db.source_type ?? '',
      tourapi_content_id:       r.selectedContentId ?? '',
      tourapi_content_type_id:  r.selectedContentTypeId ?? '',
      tourapi_title:            tc.title ?? '',
      tourapi_address:          tc.addr1 ?? '',
      tourapi_tel:              tc.tel ?? '',
      tourapi_lat:              taLat ?? '',
      tourapi_lng:              taLng ?? '',
      coord_distance_m:         coordDist ?? '',
      name_comparison:          nameMismatch,
      match_status:             r.matchStatus,
      tourapi_modified:         tc.modifiedtime ?? '',
      tourapi_hours_raw:        ti.usetime ?? '',
      tourapi_closed_day_raw:   ti.restdate ?? '',
      tourapi_entry_fee_raw:    [ti.usefee, ti.entryfee, ti.discountinfo].filter(Boolean).join(' | '),
      tourapi_parking_raw:      ti.parking ?? ti.parkinginfo ?? '',
      tourapi_infocenter:       ti.infocenter ?? '',
      tourapi_firstimage:       tc.firstimage ?? '',
      detail_image_called:      r.imageDetailCalled ? 'Y' : 'N',
      image_urls_from_api:      imgUrls,
      official_review_required: r.officialReviewRequired ? 'Y' : 'N',
      review_reason:            (r.reviewReasons || []).join(' / '),
      recommended_action: (() => {
        switch (r.matchStatus) {
          case 'exact_match':                  return 'update_external_id';
          case 'probable_match':               return 'verify_then_update_external_id';
          case 'related_entity_only':          return 'manual_search_required';
          case 'wrong_match':                  return 'manual_search_required';
          case 'duplicate_contentid_conflict': return 'resolve_duplicate_then_verify';
          case 'multiple_candidates':          return 'manual_select';
          case 'no_match':                     return 'manual_search_required';
          case 'skipped_call_limit':           return 'rerun_script';
          default:                             return 'manual_review';
        }
      })(),
    };
  });

  if (csvRows.length > 0) {
    const csvPath = path.join(OUT_DIR, 'busan-20-tourapi-comparison.csv');
    fs.writeFileSync(csvPath, '﻿' + [toCsvHeader(csvRows[0]), ...csvRows.map(toCsvRow)].join('\n'), 'utf8');
    console.log(`→ Saved: ${csvPath}`);
  }

  // ── STEP 9c: Call log CSV ──────────────────────────────────────────────────
  if (callLog.length > 0) {
    const logPath = path.join(OUT_DIR, 'busan-20-tourapi-call-log.csv');
    fs.writeFileSync(logPath, '﻿' + ['seq,spot,apiType,success,httpStatus,responseMs,retries,error',
      ...callLog.map(toCsvRow)].join('\n'), 'utf8');
    console.log(`→ Saved: ${logPath}`);
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const statusCounts  = tourResults.reduce((a, r) => { a[r.matchStatus] = (a[r.matchStatus] || 0) + 1; return a; }, {});
  const apiTypeCounts = callLog.reduce((a, l) => { a[l.apiType] = (a[l.apiType] || 0) + 1; return a; }, {});

  console.log(`
=== FINAL SUMMARY ===
API 서비스: EngService2 (영문 관광정보 API)
  ※ KorService1(국문 API)은 현재 키로 미승인 — data.go.kr 별도 신청 필요

TourAPI 호출: ${callCount} / ${MAX_CALLS} (상한 준수: ${callCount <= MAX_CALLS ? 'OK' : 'EXCEEDED'})
성공: ${callLog.filter(l => l.success).length}  실패: ${callLog.filter(l => !l.success).length}  재시도: ${callLog.filter(l => l.retries > 0).length}

API 종류별:
${Object.entries(apiTypeCounts).map(([k, v]) => `  ${k}: ${v}회`).join('\n')}

매칭 결과 (20개):
${Object.entries(statusCounts).map(([k, v]) => `  ${k}: ${v}개`).join('\n')}

공식 추가 검수 필요: ${tourResults.filter(r => r.officialReviewRequired).length}개
`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
