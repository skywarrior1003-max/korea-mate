#!/usr/bin/env node
/**
 * tourapi-busan-pilot.mjs — TASK-DATA-BUSAN-PILOT-01
 *
 * 부산 명소·맛집 국문·영문 파일럿 수집 (원천별 최대 20건)
 * Phase 1: API 호출 → raw 저장 → 정규화 → 후보 → 보고서
 * Phase 2: raw 재처리만 (추가 API 호출 없음) → 결과 일치 확인
 *
 * 실행: node scripts/tourapi-busan-pilot.mjs
 * 재처리: node scripts/tourapi-busan-pilot.mjs --reprocess
 *
 * 금지: DB 수정 / upsert / commit / push / 비밀값 출력
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { distM, normStr } from './tourapi-batch.mjs';

// ── .env.local 로드 (값 미출력) ───────────────────────────────────────────────
(function loadEnv() {
  const candidates = [
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env.local'),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env.local'),
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

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.resolve(__dir, '..');
const TODAY = new Date().toISOString().slice(0, 10);

const REPROCESS = process.argv.includes('--reprocess');
const MAX_REQUESTS = 20;
let requestCount = 0;

// ── 출력 경로 ─────────────────────────────────────────────────────────────────
const RAW_DIR  = path.join(ROOT, 'data/tourapi/raw/busan', TODAY);
const NORM_DIR = path.join(ROOT, 'data/tourapi/normalized/busan');
const CAND_DIR = path.join(ROOT, 'data/tourapi/candidates/busan');
const RPT_DIR  = path.join(ROOT, 'data/tourapi/reports/busan');
const DOC_DIR  = path.join(ROOT, 'docs/tourapi');

for (const d of [RAW_DIR, NORM_DIR, CAND_DIR, RPT_DIR, DOC_DIR]) {
  fs.mkdirSync(d, { recursive: true });
}

// ── API 호출 ──────────────────────────────────────────────────────────────────
const API_KEY = process.env.TOUR_API_KEY;
if (!API_KEY) { console.error('TOUR_API_KEY not set'); process.exit(1); }

async function fetchAPI(url, retries = 2) {
  if (requestCount >= MAX_REQUESTS) throw new Error(`Request limit ${MAX_REQUESTS} reached`);
  requestCount++;
  const safeUrl = url.replace(API_KEY, '[KEY]');
  console.log(`[req ${requestCount}/${MAX_REQUESTS}] ${safeUrl}`);
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (attempt === retries) throw e;
      await new Promise(r => setTimeout(r, 500));
    }
  }
}

// ── 파서 ──────────────────────────────────────────────────────────────────────
function parseBusan(data, funcName) {
  const w = data[funcName];
  if (!w || w.header?.code !== '00') return { ok: false, items: [], total: 0, code: w?.header?.code };
  const items = Array.isArray(w.item) ? w.item : (w.item ? [w.item] : []);
  return { ok: true, items, total: Number(w.header?.totalCount ?? items.length) };
}

function parseKTO(data) {
  const hdr = data?.response?.header;
  if (hdr?.resultCode !== '0000') return { ok: false, items: [], total: 0, code: hdr?.resultCode };
  const body = data?.response?.body;
  const raw  = body?.items?.item;
  const items = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  return { ok: true, items, total: Number(body?.totalCount ?? items.length) };
}

// ── 정규화 ────────────────────────────────────────────────────────────────────
const COL_AT = new Date().toISOString();

function normBusanAttraction(item, lang) {
  const id = String(item.UC_SEQ ?? '');
  // EN 엔드포인트: MAIN_TITLE은 항상 한국어, TITLE이 영문 제목 필드
  const titleField = lang === 'en' ? (item.TITLE ?? item.MAIN_TITLE) : item.MAIN_TITLE;
  return {
    source_provider:   'busan',
    source_service:    'AttractionService',
    source_id:         id,
    source_language:   lang,
    source_key:        `AttractionService:${id}:${lang}`,
    title:             titleField ?? null,
    title_normalized:  normStr(titleField),
    address:           item.ADDR1 ?? null,
    district:          item.GUGUN_NM ?? null,
    latitude:          item.LAT  ? parseFloat(item.LAT)  : null,
    longitude:         item.LNG  ? parseFloat(item.LNG)  : null,
    description:       item.ITEMCNTNTS ?? null,
    content_type_id:   null,
    category:          'attraction',
    image_url:         item.MAIN_IMG_NORMAL ?? null,
    image_source:      item.MAIN_IMG_NORMAL ? 'visitbusan' : null,
    image_license:     '미확인',
    modified_at:       null,
    collected_at:      COL_AT,
    source_verified:   'confirmed',
  };
}

function normBusanFood(item, lang) {
  const id = String(item.UC_SEQ ?? '');
  // EN 엔드포인트: MAIN_TITLE은 항상 한국어, TITLE이 영문 제목 필드
  const titleField = lang === 'en' ? (item.TITLE ?? item.MAIN_TITLE) : item.MAIN_TITLE;
  return {
    source_provider:   'busan',
    source_service:    'FoodService',
    source_id:         id,
    source_language:   lang,
    source_key:        `FoodService:${id}:${lang}`,
    title:             titleField ?? null,
    title_normalized:  normStr(titleField),
    address:           item.ADDR1 ?? null,
    district:          item.GUGUN_NM ?? null,
    latitude:          item.LAT  ? parseFloat(item.LAT)  : null,
    longitude:         item.LNG  ? parseFloat(item.LNG)  : null,
    description:       item.ITEMCNTNTS ?? null,
    content_type_id:   null,
    category:          'food',
    image_url:         item.MAIN_IMG_NORMAL ?? null,
    image_source:      item.MAIN_IMG_NORMAL ? 'visitbusan' : null,
    image_license:     '미확인',
    modified_at:       null,
    collected_at:      COL_AT,
    source_verified:   'inferred', // 필드 구조 추정
  };
}

function normKTO(item, service, lang, category) {
  const id = String(item.contentid ?? '');
  return {
    source_provider:   'kto',
    source_service:    service,
    source_id:         id,
    source_language:   lang,
    source_key:        `${service}:${id}:${lang}`,
    title:             item.title ?? null,
    title_normalized:  normStr(item.title),
    address:           item.addr1 ?? null,
    district:          item.sigungucode ? String(item.sigungucode) : null,
    latitude:          item.mapy ? parseFloat(item.mapy) : null,
    longitude:         item.mapx ? parseFloat(item.mapx) : null,
    description:       null,
    content_type_id:   item.contenttypeid ? parseInt(item.contenttypeid) : null,
    category:          category,
    image_url:         item.firstimage  || item.firstimage2 || null,
    image_source:      (item.firstimage || item.firstimage2) ? 'kto' : null,
    image_license:     '미확인',
    modified_at:       item.modifiedtime ?? null,
    collected_at:      COL_AT,
    source_verified:   'confirmed',
  };
}

// ── 언어 연결 점수 ────────────────────────────────────────────────────────────
function langLinkScore(a, b) {
  let score = 0;
  if (a.latitude && a.longitude && b.latitude && b.longitude) {
    const d = distM(a.latitude, a.longitude, b.latitude, b.longitude);
    if      (d <= 100) score += 50;
    else if (d <= 200) score += 30;
    else if (d <= 500) score += 10;
  }
  const na = a.title_normalized, nb = b.title_normalized;
  if (na && nb) {
    if (na === nb)                             score += 20;
    else if (na.includes(nb) || nb.includes(na)) score += 10;
  }
  if (a.category && a.category === b.category)  score += 10;
  if (a.district  && a.district  === b.district) score += 20;
  return score;
}

function confidence(score) {
  if (score >= 80) return 'high';
  if (score >= 50) return 'manual_review';
  return 'low';
}

// ── 비교 (참고자료만, SSOT 아님) ─────────────────────────────────────────────
function loadReferenceData() {
  const stateFile = path.join(ROOT, 'tmp/tourapi-nightly/state.json');
  const busanFile = path.join(ROOT, 'src/data/cities/busan.ts');

  const stateItems = {};
  try {
    const s = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    Object.assign(stateItems, s.items || {});
  } catch (_) {}

  const busTsSpots = [];
  try {
    const content = fs.readFileSync(busanFile, 'utf8');
    const matches = [...content.matchAll(/lat:\s*([\d.]+),\s*\n\s*lng:\s*([\d.]+)/g)];
    const names   = [...content.matchAll(/name:\s*["'](.*?)["']/g)];
    names.forEach((m, i) => {
      if (matches[i]) {
        busTsSpots.push({ name: m[1], lat: parseFloat(matches[i][1]), lng: parseFloat(matches[i][2]) });
      }
    });
  } catch (_) {}

  return { stateItems, busTsSpots };
}

function compareWithRef(record, stateItems, busTsSpots) {
  // KTO items: check state.json contentId
  if (record.source_provider === 'kto') {
    for (const [, item] of Object.entries(stateItems)) {
      if (item.contentId === record.source_id) {
        return { result: 'matched_state_json', ref: `state.json:${record.source_id}` };
      }
    }
  }

  // All items: GPS match with busan.ts
  if (record.latitude && record.longitude) {
    for (const spot of busTsSpots) {
      const d = distM(record.latitude, record.longitude, spot.lat, spot.lng);
      if (d !== null && d < 300) {
        return { result: 'matched_busan_ts', ref: `busan.ts:${spot.name}` };
      }
    }
  }

  // Busan API items: no common ID with state.json
  if (record.source_provider === 'busan') {
    return { result: 'comparison_source_missing', ref: null };
  }

  return { result: 'new_candidate', ref: null };
}

// ── CSV 출력 헬퍼 ─────────────────────────────────────────────────────────────
function csvRow(cells) {
  return cells.map(c => {
    const s = String(c ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',');
}

// ── Phase 1: API 호출 ─────────────────────────────────────────────────────────
async function phase1Collect() {
  const BASE_BUSAN = 'https://apis.data.go.kr/6260000';
  const BASE_KOR   = 'https://apis.data.go.kr/B551011/KorService2';
  const BASE_ENG   = 'https://apis.data.go.kr/B551011/EngService2';
  const BUSAN_COMMON = `serviceKey=${API_KEY}&numOfRows=20&pageNo=1&resultType=json`;
  const KTO_COMMON   = `serviceKey=${API_KEY}&numOfRows=20&pageNo=1&_type=json`;

  const sources = [
    {
      key:  'busan-attraction-ko',
      url:  `${BASE_BUSAN}/AttractionService/getAttractionKr?${BUSAN_COMMON}`,
      parse: d => parseBusan(d, 'getAttractionKr'),
      norm:  (item) => normBusanAttraction(item, 'ko'),
    },
    {
      key:  'busan-attraction-en',
      url:  `${BASE_BUSAN}/AttractionService/getAttractionEn?${BUSAN_COMMON}`,
      parse: d => parseBusan(d, 'getAttractionEn'),
      norm:  (item) => normBusanAttraction(item, 'en'),
    },
    {
      key:  'busan-food-ko',
      url:  `${BASE_BUSAN}/FoodService/getFoodKr?${BUSAN_COMMON}`,
      parse: d => parseBusan(d, 'getFoodKr'),
      norm:  (item) => normBusanFood(item, 'ko'),
    },
    {
      key:  'busan-food-en',
      url:  `${BASE_BUSAN}/FoodService/getFoodEn?${BUSAN_COMMON}`,
      parse: d => parseBusan(d, 'getFoodEn'),
      norm:  (item) => normBusanFood(item, 'en'),
    },
    {
      key:  'kto-ko',
      url:  `${BASE_KOR}/areaBasedList2?${KTO_COMMON}&areaCode=6&MobileOS=ETC&MobileApp=GoKoreaMate`,
      parse: parseKTO,
      norm:  (item) => normKTO(item, 'KorService2', 'ko', null),
    },
    {
      key:  'kto-en',
      url:  `${BASE_ENG}/areaBasedList2?${KTO_COMMON}&areaCode=6&MobileOS=ETC&MobileApp=GoKoreaMate`,
      parse: parseKTO,
      norm:  (item) => normKTO(item, 'EngService2', 'en', null),
    },
  ];

  const rawResults = {};
  for (const src of sources) {
    let data, parsed;
    try {
      data   = await fetchAPI(src.url);
      parsed = src.parse(data);
    } catch (e) {
      console.error(`[ERROR] ${src.key}: ${e.message}`);
      rawResults[src.key] = { ok: false, items: [], total: 0, error: e.message };
      continue;
    }

    // raw 저장 (API 키 값 제거)
    const rawPath = path.join(RAW_DIR, `${src.key}-raw.json`);
    const safeData = JSON.parse(JSON.stringify(data));
    fs.writeFileSync(rawPath, JSON.stringify(safeData, null, 2), 'utf8');

    rawResults[src.key] = { ok: parsed.ok, items: parsed.items, total: parsed.total, rawPath };
    console.log(`  → ${src.key}: ${parsed.ok ? parsed.items.length + ' items' : 'FAILED (code:' + parsed.code + ')'}`);
  }

  return { rawResults, sources };
}

// ── Phase 2: raw 파일에서 정규화 (API 호출 없음) ─────────────────────────────
function phase2Process(rawResults, sources) {
  const all = [];

  for (const src of sources) {
    const res = rawResults[src.key];
    if (!res?.ok) continue;

    let items = res.items;

    // 재처리 모드: raw 파일에서 재로드
    if (REPROCESS && res.rawPath) {
      try {
        const data   = JSON.parse(fs.readFileSync(res.rawPath, 'utf8'));
        const parsed = src.parse(data);
        items = parsed.items;
      } catch (e) {
        console.error(`[REPROCESS ERROR] ${src.key}: ${e.message}`);
        continue;
      }
    }

    for (const item of items) {
      try {
        all.push(src.norm(item));
      } catch (e) {
        console.error(`[NORM ERROR] ${src.key}: ${e.message}`);
      }
    }
  }

  // 중복 source_key 제거
  const seen = new Set();
  return all.filter(r => {
    if (seen.has(r.source_key)) return false;
    seen.add(r.source_key);
    return true;
  });
}

// ── 언어 연결 후보 생성 ───────────────────────────────────────────────────────
function buildLanguageLinks(records) {
  const koRecs = records.filter(r => r.source_language === 'ko');
  const enRecs = records.filter(r => r.source_language === 'en');

  const links = [];
  const usedEnKeys = new Set(); // same_id로 점령된 EN 키 — score 매칭 대상에서 제외

  // Pass 1: same_id 연결 (source_service + source_id 일치)
  for (const ko of koRecs) {
    const enSame = enRecs.find(e =>
      e.source_service === ko.source_service && e.source_id === ko.source_id
    );
    if (enSame) {
      links.push({
        source_key_ko: ko.source_key,
        source_key_en: enSame.source_key,
        score: 100,
        confidence: 'high',
        dist_m: (ko.latitude && enSame.latitude)
          ? distM(ko.latitude, ko.longitude, enSame.latitude, enSame.longitude)
          : null,
        title_ko: ko.title,
        title_en: enSame.title,
        link_method: 'same_id',
      });
      usedEnKeys.add(enSame.source_key);
    }
  }

  // Pass 2: GPS + 명칭 점수 매칭 (same_id 미연결 KO만, 점령된 EN 제외, 최소 50점)
  const linkedKoKeys = new Set(links.map(l => l.source_key_ko));
  for (const ko of koRecs) {
    if (linkedKoKeys.has(ko.source_key)) continue;
    let best = null, bestScore = 0;
    for (const en of enRecs) {
      if (usedEnKeys.has(en.source_key)) continue; // 이미 same_id로 점령된 EN 제외
      const sc = langLinkScore(ko, en);
      if (sc > bestScore) { bestScore = sc; best = en; }
    }
    if (best && bestScore >= 50) { // 임계값 30 → 50: GPS 100m 이내 + 추가 근거 필요
      links.push({
        source_key_ko: ko.source_key,
        source_key_en: best.source_key,
        score: bestScore,
        confidence: confidence(bestScore),
        dist_m: (ko.latitude && best.latitude)
          ? distM(ko.latitude, ko.longitude, best.latitude, best.longitude)
          : null,
        title_ko: ko.title,
        title_en: best.title,
        link_method: 'score',
      });
      usedEnKeys.add(best.source_key);
    }
  }
  return links;
}

// ── 비교 후보 생성 ────────────────────────────────────────────────────────────
function buildCandidates(records, stateItems, busTsSpots) {
  return records.map(r => {
    const comp = compareWithRef(r, stateItems, busTsSpots);
    return {
      source_key:   r.source_key,
      title:        r.title,
      category:     r.category,
      lat:          r.latitude,
      lng:          r.longitude,
      address:      r.address,
      has_image:    !!r.image_url,
      has_desc:     !!r.description,
      comparison_result: comp.result,
      ref_match:    comp.ref,
    };
  });
}

// ── 측정 지표 ─────────────────────────────────────────────────────────────────
function buildMetrics(rawResults, records, links, candidates, phase) {
  const sources = {};
  for (const [key, res] of Object.entries(rawResults)) {
    sources[key] = {
      ok:          res.ok,
      items_raw:   res.items?.length ?? 0,
      total_api:   res.total ?? 0,
      error:       res.error ?? null,
    };
  }

  const withCoord = records.filter(r => r.latitude && r.longitude).length;
  const withImage = records.filter(r => r.image_url).length;
  const withDesc  = records.filter(r => r.description).length;

  const linkConf = { high: 0, manual_review: 0, low: 0 };
  for (const l of links) linkConf[l.confidence] = (linkConf[l.confidence] ?? 0) + 1;

  const compCounts = {};
  for (const c of candidates) {
    compCounts[c.comparison_result] = (compCounts[c.comparison_result] ?? 0) + 1;
  }

  return {
    run_date:      TODAY,
    phase,
    api_requests:  requestCount,
    sources,
    total_normalized:  records.length,
    coord_rate:    records.length ? (withCoord / records.length).toFixed(3) : '0',
    image_rate:    records.length ? (withImage / records.length).toFixed(3) : '0',
    desc_rate:     records.length ? (withDesc  / records.length).toFixed(3) : '0',
    language_links: { ...linkConf, total: links.length },
    comparison:    compCounts,
  };
}

// ── 보고서 ────────────────────────────────────────────────────────────────────
function buildReport(m1, m2, links, candidates) {
  const match = JSON.stringify(m1.total_normalized) === JSON.stringify(m2.total_normalized)
    && JSON.stringify(m1.language_links) === JSON.stringify(m2.language_links);

  const compRows = Object.entries(m1.comparison || {})
    .map(([k, v]) => `| ${k} | ${v} |`).join('\n');

  return `# GoKoreaMate 부산 파일럿 수집 보고서

**날짜:** ${TODAY}
**태스크:** TASK-DATA-BUSAN-PILOT-01

## 수집 결과

| 원천 | 수집 건수 | API 상태 |
|---|---|---|
${Object.entries(m1.sources).map(([k, v]) => `| ${k} | ${v.items_raw} | ${v.ok ? 'OK' : 'FAIL: ' + v.error} |`).join('\n')}

**API 요청 수:** ${m1.api_requests}회 (한도 20회, 재시도 포함 상한 30회)
**정규화 레코드:** ${m1.total_normalized}건

## 필드 보유율

| 항목 | 보유율 |
|---|---|
| 좌표 | ${(parseFloat(m1.coord_rate) * 100).toFixed(1)}% |
| 이미지 URL | ${(parseFloat(m1.image_rate) * 100).toFixed(1)}% |
| 설명문 | ${(parseFloat(m1.desc_rate) * 100).toFixed(1)}% |

이미지 라이선스: 모두 '미확인' — 공공누리 유형 별도 확인 필요

## 언어 연결 후보

| 신뢰도 | 건수 |
|---|---|
| high | ${m1.language_links.high} |
| manual_review | ${m1.language_links.manual_review} |
| low | ${m1.language_links.low} |
| 합계 | ${m1.language_links.total} |

## 기존 데이터 비교 (참고자료 기준)

> state.json (31건), busan.ts (7건)은 운영 city_spots SSOT가 아님. 비교 근거 부족 항목은 comparison_source_missing 또는 manual_review로 분류함.

| 분류 | 건수 |
|---|---|
${compRows}

## 재처리 검증

| 항목 | 결과 |
|---|---|
| 1차·2차 레코드 수 일치 | ${m1.total_normalized === m2.total_normalized ? 'PASS' : 'FAIL'} |
| 1차·2차 언어 연결 수 일치 | ${m1.language_links.total === m2.language_links.total ? 'PASS' : 'FAIL'} |
| 전체 재처리 일치 | ${match ? 'PASS' : 'REVIEW REQUIRED'} |

## 전체 배치 전 보완사항

- 부산시 FoodService·FestivalService 다국어 실제 필드 완전성 확인 필요 (추정 기반 수집)
- 이미지 라이선스 확인 전 상업 서비스 자동 사용 금지
- 언어 연결 manual_review 항목 수동 검토
- KorService2/EngService2 contentId 다른 장소에도 언어 연결 점수 보정 필요
- comparison_source_missing 항목은 운영 Supabase 접근 후 재분류 필요

*자동 DB 반영 없음. 운영 반영은 사람 승인 필수.*
`;
}

// ── 메인 ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n=== TASK-DATA-BUSAN-PILOT-01 [${REPROCESS ? 'REPROCESS' : 'FULL'}] ===`);
  console.log(`Date: ${TODAY}, Branch: research/tourapi-nightly-20260722\n`);

  // Phase 1: API 수집 (재처리 모드에서는 raw 파일 재로드)
  let rawResults, sources;
  if (!REPROCESS) {
    const res = await phase1Collect();
    rawResults = res.rawResults;
    sources    = res.sources;
    // rawResults를 파일에 저장 (2차 재처리용)
    fs.writeFileSync(
      path.join(RAW_DIR, '_meta.json'),
      JSON.stringify({ today: TODAY, requestCount }, null, 2)
    );
  } else {
    // 재처리: raw 파일에서 메타 로드
    const metaPath = path.join(RAW_DIR, '_meta.json');
    if (!fs.existsSync(metaPath)) {
      console.error('ERROR: raw files not found. Run without --reprocess first.');
      process.exit(1);
    }
    // sources 재구성 (norm 함수 참조를 위해)
    const { default: pilot } = await import('./tourapi-busan-pilot.mjs').catch(() => ({}));
    // sources 재구성은 아래에서 직접
  }

  // sources 정의 (재처리 포함 공통)
  const BASE_BUSAN = 'https://apis.data.go.kr/6260000';
  const BASE_KOR   = 'https://apis.data.go.kr/B551011/KorService2';
  const BASE_ENG   = 'https://apis.data.go.kr/B551011/EngService2';

  const allSources = [
    {
      key:   'busan-attraction-ko',
      rawPath: path.join(RAW_DIR, 'busan-attraction-ko-raw.json'),
      parse:  d => parseBusan(d, 'getAttractionKr'),
      norm:   item => normBusanAttraction(item, 'ko'),
    },
    {
      key:   'busan-attraction-en',
      rawPath: path.join(RAW_DIR, 'busan-attraction-en-raw.json'),
      parse:  d => parseBusan(d, 'getAttractionEn'),
      norm:   item => normBusanAttraction(item, 'en'),
    },
    {
      key:   'busan-food-ko',
      rawPath: path.join(RAW_DIR, 'busan-food-ko-raw.json'),
      parse:  d => parseBusan(d, 'getFoodKr'),
      norm:   item => normBusanFood(item, 'ko'),
    },
    {
      key:   'busan-food-en',
      rawPath: path.join(RAW_DIR, 'busan-food-en-raw.json'),
      parse:  d => parseBusan(d, 'getFoodEn'),
      norm:   item => normBusanFood(item, 'en'),
    },
    {
      key:   'kto-ko',
      rawPath: path.join(RAW_DIR, 'kto-ko-raw.json'),
      parse:  parseKTO,
      norm:   item => normKTO(item, 'KorService2', 'ko', null),
    },
    {
      key:   'kto-en',
      rawPath: path.join(RAW_DIR, 'kto-en-raw.json'),
      parse:  parseKTO,
      norm:   item => normKTO(item, 'EngService2', 'en', null),
    },
  ];

  // rawResults 재구성 (재처리 모드)
  if (REPROCESS) {
    rawResults = {};
    for (const src of allSources) {
      if (fs.existsSync(src.rawPath)) {
        const data   = JSON.parse(fs.readFileSync(src.rawPath, 'utf8'));
        const parsed = src.parse(data);
        rawResults[src.key] = { ok: parsed.ok, items: parsed.items, total: parsed.total, rawPath: src.rawPath };
      } else {
        rawResults[src.key] = { ok: false, items: [], total: 0, error: 'raw file missing' };
      }
    }
  }
  sources = allSources;

  // Phase 2: 정규화
  const records = phase2Process(rawResults, sources);
  console.log(`\nNormalized: ${records.length} records`);

  // 중복 확인
  const keys = records.map(r => r.source_key);
  const dupKeys = keys.filter((k, i) => keys.indexOf(k) !== i);
  if (dupKeys.length > 0) console.warn(`WARNING: duplicate source_keys: ${dupKeys.join(', ')}`);

  // 언어 연결
  const links = buildLanguageLinks(records);

  // 비교
  const { stateItems, busTsSpots } = loadReferenceData();
  const candidates = buildCandidates(records, stateItems, busTsSpots);

  // 지표
  const phase = REPROCESS ? 2 : 1;
  const metrics = buildMetrics(rawResults, records, links, candidates, phase);

  // 파일 저장
  fs.writeFileSync(
    path.join(NORM_DIR, 'busan-pilot-normalized.json'),
    JSON.stringify(records, null, 2), 'utf8'
  );

  // 언어 연결 CSV
  const linkHeader = csvRow(['source_key_ko','source_key_en','score','confidence','dist_m','title_ko','title_en','link_method']);
  const linkRows   = links.map(l => csvRow([l.source_key_ko, l.source_key_en, l.score, l.confidence, l.dist_m, l.title_ko, l.title_en, l.link_method]));
  fs.writeFileSync(
    path.join(CAND_DIR, 'busan-pilot-language-links.csv'),
    [linkHeader, ...linkRows].join('\n'), 'utf8'
  );

  // 후보 CSV
  const candHeader = csvRow(['source_key','title','category','lat','lng','address','has_image','has_desc','comparison_result','ref_match']);
  const candRows   = candidates.map(c => csvRow([c.source_key, c.title, c.category, c.lat, c.lng, c.address, c.has_image, c.has_desc, c.comparison_result, c.ref_match]));
  fs.writeFileSync(
    path.join(CAND_DIR, 'busan-pilot-candidates.csv'),
    [candHeader, ...candRows].join('\n'), 'utf8'
  );

  // 지표 JSON
  fs.writeFileSync(
    path.join(RPT_DIR, 'busan-pilot-metrics.json'),
    JSON.stringify(metrics, null, 2), 'utf8'
  );

  // Phase 1 후 Phase 2 자동 재처리 (--reprocess 없이 실행 시)
  let metrics2 = metrics;
  if (!REPROCESS) {
    console.log('\n=== Phase 2: raw 재처리 (API 호출 없음) ===');
    const reprocessRaw = {};
    for (const src of allSources) {
      if (fs.existsSync(src.rawPath)) {
        const data   = JSON.parse(fs.readFileSync(src.rawPath, 'utf8'));
        const parsed = src.parse(data);
        reprocessRaw[src.key] = { ok: parsed.ok, items: parsed.items, total: parsed.total, rawPath: src.rawPath };
      } else {
        reprocessRaw[src.key] = { ok: false, items: [], total: 0, error: 'raw file missing' };
      }
    }
    const records2   = phase2Process(reprocessRaw, allSources);
    const links2     = buildLanguageLinks(records2);
    const cands2     = buildCandidates(records2, stateItems, busTsSpots);
    metrics2 = buildMetrics(reprocessRaw, records2, links2, cands2, 2);

    // source_key 중복 확인
    const keys2 = records2.map(r => r.source_key);
    const dups2 = keys2.filter((k, i) => keys2.indexOf(k) !== i);
    if (dups2.length > 0) console.warn(`Phase2 WARNING: duplicate source_keys: ${dups2.join(', ')}`);

    console.log(`Phase2 records: ${records2.length} (Phase1: ${records.length})`);
    console.log(`Phase2 links: ${links2.length} (Phase1: ${links.length})`);
  }

  // 보고서 MD
  const report = buildReport(metrics, metrics2, links, candidates);
  fs.writeFileSync(path.join(DOC_DIR, 'busan-pilot-report.md'), report, 'utf8');

  // 완료
  console.log('\n=== 생성된 파일 ===');
  const outputs = [
    path.join(RAW_DIR, ''),
    path.join(NORM_DIR, 'busan-pilot-normalized.json'),
    path.join(CAND_DIR, 'busan-pilot-language-links.csv'),
    path.join(CAND_DIR, 'busan-pilot-candidates.csv'),
    path.join(RPT_DIR,  'busan-pilot-metrics.json'),
    path.join(DOC_DIR,  'busan-pilot-report.md'),
  ];
  outputs.forEach(p => console.log(' ', p.replace(ROOT + path.sep, '')));

  console.log(`\nAPI 요청: ${requestCount}/${MAX_REQUESTS}`);
  console.log(`Phase1 records: ${records.length}`);
  console.log(`Phase2 records: ${metrics2.total_normalized}`);
  console.log(`재처리 일치: ${metrics.total_normalized === metrics2.total_normalized && metrics.language_links.total === metrics2.language_links.total ? 'PASS' : 'REVIEW REQUIRED'}`);
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
