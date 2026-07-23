#!/usr/bin/env node
/**
 * tourapi-busan-batch.mjs — 부산 전체 배치 수집
 *
 * 부산시 명소·맛집 KO/EN/JA/ZhS/ZhT + KTO KO/EN 전체 페이지 수집·정규화·언어 연결
 * 원천·페이지 단위 상태 저장 → 중단 후 재개 지원
 *
 * 실행:      node scripts/tourapi-busan-batch.mjs
 * 소규모 테스트: node scripts/tourapi-busan-batch.mjs --max-pages 2
 * 초기화:    node scripts/tourapi-busan-batch.mjs --reset
 *
 * 상태 파일: data/tourapi/raw/busan/batch-state.json
 * Raw 저장:  data/tourapi/raw/busan/{date}/batch/{source}-p{NNN}.json
 *
 * 금지: DB 수정 / upsert / commit / push / 비밀값 출력
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { distM, normStr } from './tourapi-batch.mjs';
import {
  checkDiskSpace, rawStorageStats,
  findPreviousSnapshot, saveSnapshot,
  buildDiff, saveDiffResults,
} from './tourapi-busan-diff.mjs';

// ── .env.local 로드 ───────────────────────────────────────────────────────────
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
const ROOT   = path.resolve(__dir, '..');
const TODAY  = new Date().toISOString().slice(0, 10);
const COL_AT = new Date().toISOString();

// ── CLI 파싱 ──────────────────────────────────────────────────────────────────
const cliArgs = process.argv.slice(2);
const MAX_PAGES_FLAG = (() => {
  const i = cliArgs.indexOf('--max-pages');
  return i >= 0 ? parseInt(cliArgs[i + 1], 10) : null;
})();
const RESET = cliArgs.includes('--reset');

// ── 설정 ──────────────────────────────────────────────────────────────────────
const NUM_OF_ROWS            = 100;
const CALL_INTERVAL_MS       = 300;
const MAX_RETRIES            = 2;
const CONSECUTIVE_ERR_ABORT  = 3;
const BUSAN_HARD_PAGE_LIMIT  = 50;  // 부산시 API: totalCount 없음, 절대 상한
const KTO_HARD_PAGE_LIMIT    = 20;  // KTO: totalCount 기반이지만 안전 상한

// ── 경로 ──────────────────────────────────────────────────────────────────────
const BATCH_RAW_DIR  = path.join(ROOT, 'data/tourapi/raw/busan', TODAY, 'batch');
const RAW_BUSAN_DIR  = path.join(ROOT, 'data/tourapi/raw/busan');
const NORM_DIR       = path.join(ROOT, 'data/tourapi/normalized/busan');
const CAND_DIR       = path.join(ROOT, 'data/tourapi/candidates/busan');
const RPT_DIR        = path.join(ROOT, 'data/tourapi/reports/busan');
const DOC_DIR        = path.join(ROOT, 'docs/tourapi');
const SNAPSHOT_DIR   = path.join(ROOT, 'data/tourapi/snapshots/busan');
const STATE_FILE     = path.join(ROOT, 'data/tourapi/raw/busan/batch-state.json');

const API_KEY = process.env.TOUR_API_KEY;
if (!API_KEY) { console.error('TOUR_API_KEY not set'); process.exit(1); }

for (const d of [BATCH_RAW_DIR, NORM_DIR, CAND_DIR, RPT_DIR, DOC_DIR]) {
  fs.mkdirSync(d, { recursive: true });
}

// ── 상태 관리 ─────────────────────────────────────────────────────────────────
function loadState() {
  if (RESET) return null;
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return null; }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

function initState() {
  return { run_date: TODAY, started_at: COL_AT, total_requests: 0, sources: {} };
}

function initSourceState() {
  return {
    status: 'pending',
    total_count: null, total_pages: null,
    completed_pages: [],
    items_collected: 0, request_count: 0,
    last_error: null, updated_at: COL_AT,
  };
}

// ── API 호출 ──────────────────────────────────────────────────────────────────
let totalRequests = 0;

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchWithRetry(url) {
  const safeUrl = url.replace(API_KEY, '[KEY]');
  totalRequests++;
  console.log(`  [req ${totalRequests}] ${safeUrl}`);
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res  = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (text.trimStart().startsWith('<')) throw new Error('XML response (JSON expected) — check _type=json or resultType param');
      return JSON.parse(text);
    } catch (e) {
      if (attempt === MAX_RETRIES) throw e;
      await sleep(500 * (attempt + 1));
    }
  }
}

// ── 파서 ──────────────────────────────────────────────────────────────────────
function parseBusan(data, funcName) {
  const w = data[funcName];
  if (!w || w.header?.code !== '00') return { ok: false, items: [], total: null, code: w?.header?.code };
  const raw   = w.item;
  const items = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  // 부산시 API 헤더에 totalCount 없음 → null 반환, 빈 페이지로 종료 판단
  return { ok: true, items, total: null };
}

function parseKTO(data) {
  const hdr = data?.response?.header;
  if (hdr?.resultCode !== '0000') return { ok: false, items: [], total: null, code: hdr?.resultCode };
  const body = data?.response?.body;
  const raw  = body?.items?.item;
  const items = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  return { ok: true, items, total: Number(body?.totalCount ?? items.length) };
}

// ── 정규화 (파일럿 검증 버전: TITLE 영문 필드, _type=json) ────────────────────
function normBusanAttraction(item, lang) {
  const id    = String(item.UC_SEQ ?? '');
  const title = lang !== 'ko' ? (item.TITLE ?? item.MAIN_TITLE) : item.MAIN_TITLE;
  return {
    source_provider: 'busan', source_service: 'AttractionService',
    source_id: id, source_language: lang,
    source_key: `AttractionService:${id}:${lang}`,
    title: title ?? null, title_normalized: normStr(title),
    address: item.ADDR1 ?? null, district: item.GUGUN_NM ?? null,
    latitude:  item.LAT ? parseFloat(item.LAT) : null,
    longitude: item.LNG ? parseFloat(item.LNG) : null,
    description: item.ITEMCNTNTS ?? null, content_type_id: null,
    category: 'attraction',
    image_url:    item.MAIN_IMG_NORMAL ?? null,
    image_source: item.MAIN_IMG_NORMAL ? 'visitbusan' : null,
    image_license: '미확인', modified_at: null,
    collected_at: COL_AT, source_verified: 'confirmed',
  };
}

function normBusanFood(item, lang) {
  const id    = String(item.UC_SEQ ?? '');
  const title = lang !== 'ko' ? (item.TITLE ?? item.MAIN_TITLE) : item.MAIN_TITLE;
  return {
    source_provider: 'busan', source_service: 'FoodService',
    source_id: id, source_language: lang,
    source_key: `FoodService:${id}:${lang}`,
    title: title ?? null, title_normalized: normStr(title),
    address: item.ADDR1 ?? null, district: item.GUGUN_NM ?? null,
    latitude:  item.LAT ? parseFloat(item.LAT) : null,
    longitude: item.LNG ? parseFloat(item.LNG) : null,
    description: item.ITEMCNTNTS ?? null, content_type_id: null,
    category: 'food',
    image_url:    item.MAIN_IMG_NORMAL ?? null,
    image_source: item.MAIN_IMG_NORMAL ? 'visitbusan' : null,
    image_license: '미확인', modified_at: null,
    collected_at: COL_AT, source_verified: 'inferred',
  };
}

function normKTO(item, service, lang) {
  const id = String(item.contentid ?? '');
  return {
    source_provider: 'kto', source_service: service,
    source_id: id, source_language: lang,
    source_key: `${service}:${id}:${lang}`,
    title: item.title ?? null, title_normalized: normStr(item.title),
    address: item.addr1 ?? null, district: item.sigungucode ? String(item.sigungucode) : null,
    latitude:  item.mapy ? parseFloat(item.mapy) : null,
    longitude: item.mapx ? parseFloat(item.mapx) : null,
    description: null,
    content_type_id: item.contenttypeid ? parseInt(item.contenttypeid, 10) : null,
    category: null,
    image_url:    item.firstimage || item.firstimage2 || null,
    image_source: (item.firstimage || item.firstimage2) ? 'kto' : null,
    image_license: '미확인', modified_at: item.modifiedtime ?? null,
    collected_at: COL_AT, source_verified: 'confirmed',
  };
}

// ── 언어 연결 (파일럿 검증 버전: 2-pass, EN 중복 방지, 임계값 50) ──────────────
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
    if (na === nb)                               score += 20;
    else if (na.includes(nb) || nb.includes(na)) score += 10;
  }
  if (a.category && a.category === b.category)   score += 10;
  if (a.district  && a.district  === b.district) score += 20;
  return score;
}

function linkConf(score) {
  if (score >= 80) return 'high';
  if (score >= 50) return 'manual_review';
  return 'low';
}

function buildLanguageLinks(records) {
  const koRecs     = records.filter(r => r.source_language === 'ko');
  const nonKoLangs = [...new Set(records.filter(r => r.source_language !== 'ko').map(r => r.source_language))];
  const links   = [];
  const unlinked = [];  // score 50-59: GPS 단독 후보 → insufficient_evidence

  for (const lang of nonKoLangs) {
    const targetRecs     = records.filter(r => r.source_language === lang);
    const usedTargetKeys = new Set();

    // Pass 1: same_id (부산시 UC_SEQ 동일, KTO는 contentId 불일치)
    for (const ko of koRecs) {
      const tSame = targetRecs.find(t => t.source_service === ko.source_service && t.source_id === ko.source_id);
      if (tSame) {
        links.push({
          source_key_ko: ko.source_key, source_key_target: tSame.source_key,
          target_language: lang, score: 100, confidence: 'high',
          dist_m: (ko.latitude && tSame.latitude) ? distM(ko.latitude, ko.longitude, tSame.latitude, tSame.longitude) : null,
          title_ko: ko.title, title_target: tSame.title, link_method: 'same_id',
        });
        usedTargetKeys.add(tSame.source_key);
      }
    }

    // Pass 2: GPS + 명칭 점수 (점령된 target 제외, 최소 60점 — GPS 단독 50점 제외)
    const linkedKoKeysForLang = new Set(
      links.filter(l => l.target_language === lang).map(l => l.source_key_ko)
    );
    for (const ko of koRecs) {
      if (linkedKoKeysForLang.has(ko.source_key)) continue;
      let best = null, bestScore = 0;
      for (const t of targetRecs) {
        if (usedTargetKeys.has(t.source_key)) continue;
        const sc = langLinkScore(ko, t);
        if (sc > bestScore) { bestScore = sc; best = t; }
      }
      if (best && bestScore >= 60) {
        links.push({
          source_key_ko: ko.source_key, source_key_target: best.source_key,
          target_language: lang, score: bestScore, confidence: linkConf(bestScore),
          dist_m: (ko.latitude && best.latitude) ? distM(ko.latitude, ko.longitude, best.latitude, best.longitude) : null,
          title_ko: ko.title, title_target: best.title, link_method: 'score',
        });
        usedTargetKeys.add(best.source_key);
      } else if (best && bestScore >= 50) {
        unlinked.push({
          source_key_ko: ko.source_key, source_key_target: best.source_key,
          target_language: lang, score: bestScore,
          dist_m: (ko.latitude && best.latitude) ? distM(ko.latitude, ko.longitude, best.latitude, best.longitude) : null,
          title_ko: ko.title, title_target: best.title,
          status: 'insufficient_evidence',
        });
      }
    }
  }
  return { links, unlinked };
}

// ── CSV 헬퍼 ──────────────────────────────────────────────────────────────────
function csvRow(cells) {
  return cells.map(c => {
    const s = String(c ?? '');
    return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',');
}

// ── 원천 정의 ─────────────────────────────────────────────────────────────────
const BUSAN_BASE = 'https://apis.data.go.kr/6260000';
const KOR_BASE   = 'https://apis.data.go.kr/B551011/KorService2';
const ENG_BASE   = 'https://apis.data.go.kr/B551011/EngService2';

const SOURCES = [
  {
    key: 'busan-attraction-ko', type: 'busan',
    buildUrl: p => `${BUSAN_BASE}/AttractionService/getAttractionKr?serviceKey=${API_KEY}&numOfRows=${NUM_OF_ROWS}&pageNo=${p}&resultType=json`,
    parse: d  => parseBusan(d, 'getAttractionKr'),
    norm:  item => normBusanAttraction(item, 'ko'),
    hardPageLimit: BUSAN_HARD_PAGE_LIMIT,
  },
  {
    key: 'busan-attraction-en', type: 'busan',
    buildUrl: p => `${BUSAN_BASE}/AttractionService/getAttractionEn?serviceKey=${API_KEY}&numOfRows=${NUM_OF_ROWS}&pageNo=${p}&resultType=json`,
    parse: d  => parseBusan(d, 'getAttractionEn'),
    norm:  item => normBusanAttraction(item, 'en'),
    hardPageLimit: BUSAN_HARD_PAGE_LIMIT,
  },
  {
    key: 'busan-food-ko', type: 'busan',
    buildUrl: p => `${BUSAN_BASE}/FoodService/getFoodKr?serviceKey=${API_KEY}&numOfRows=${NUM_OF_ROWS}&pageNo=${p}&resultType=json`,
    parse: d  => parseBusan(d, 'getFoodKr'),
    norm:  item => normBusanFood(item, 'ko'),
    hardPageLimit: BUSAN_HARD_PAGE_LIMIT,
  },
  {
    key: 'busan-food-en', type: 'busan',
    buildUrl: p => `${BUSAN_BASE}/FoodService/getFoodEn?serviceKey=${API_KEY}&numOfRows=${NUM_OF_ROWS}&pageNo=${p}&resultType=json`,
    parse: d  => parseBusan(d, 'getFoodEn'),
    norm:  item => normBusanFood(item, 'en'),
    hardPageLimit: BUSAN_HARD_PAGE_LIMIT,
  },
  {
    key: 'busan-attraction-ja', type: 'busan',
    buildUrl: p => `${BUSAN_BASE}/AttractionService/getAttractionJa?serviceKey=${API_KEY}&numOfRows=${NUM_OF_ROWS}&pageNo=${p}&resultType=json`,
    parse: d  => parseBusan(d, 'getAttractionJa'),
    norm:  item => normBusanAttraction(item, 'ja'),
    hardPageLimit: BUSAN_HARD_PAGE_LIMIT,
  },
  {
    key: 'busan-attraction-zhs', type: 'busan',
    buildUrl: p => `${BUSAN_BASE}/AttractionService/getAttractionZhs?serviceKey=${API_KEY}&numOfRows=${NUM_OF_ROWS}&pageNo=${p}&resultType=json`,
    parse: d  => parseBusan(d, 'getAttractionZhs'),
    norm:  item => normBusanAttraction(item, 'zhs'),
    hardPageLimit: BUSAN_HARD_PAGE_LIMIT,
  },
  {
    key: 'busan-attraction-zht', type: 'busan',
    buildUrl: p => `${BUSAN_BASE}/AttractionService/getAttractionZht?serviceKey=${API_KEY}&numOfRows=${NUM_OF_ROWS}&pageNo=${p}&resultType=json`,
    parse: d  => parseBusan(d, 'getAttractionZht'),
    norm:  item => normBusanAttraction(item, 'zht'),
    hardPageLimit: BUSAN_HARD_PAGE_LIMIT,
  },
  {
    key: 'busan-food-ja', type: 'busan',
    buildUrl: p => `${BUSAN_BASE}/FoodService/getFoodJa?serviceKey=${API_KEY}&numOfRows=${NUM_OF_ROWS}&pageNo=${p}&resultType=json`,
    parse: d  => parseBusan(d, 'getFoodJa'),
    norm:  item => normBusanFood(item, 'ja'),
    hardPageLimit: BUSAN_HARD_PAGE_LIMIT,
  },
  {
    key: 'busan-food-zhs', type: 'busan',
    buildUrl: p => `${BUSAN_BASE}/FoodService/getFoodZhs?serviceKey=${API_KEY}&numOfRows=${NUM_OF_ROWS}&pageNo=${p}&resultType=json`,
    parse: d  => parseBusan(d, 'getFoodZhs'),
    norm:  item => normBusanFood(item, 'zhs'),
    hardPageLimit: BUSAN_HARD_PAGE_LIMIT,
  },
  {
    key: 'busan-food-zht', type: 'busan',
    buildUrl: p => `${BUSAN_BASE}/FoodService/getFoodZht?serviceKey=${API_KEY}&numOfRows=${NUM_OF_ROWS}&pageNo=${p}&resultType=json`,
    parse: d  => parseBusan(d, 'getFoodZht'),
    norm:  item => normBusanFood(item, 'zht'),
    hardPageLimit: BUSAN_HARD_PAGE_LIMIT,
  },
  {
    key: 'kto-ko', type: 'kto',
    buildUrl: p => `${KOR_BASE}/areaBasedList2?serviceKey=${API_KEY}&numOfRows=${NUM_OF_ROWS}&pageNo=${p}&_type=json&areaCode=6&MobileOS=ETC&MobileApp=GoKoreaMate`,
    parse: parseKTO,
    norm:  item => normKTO(item, 'KorService2', 'ko'),
    hardPageLimit: KTO_HARD_PAGE_LIMIT,
  },
  {
    key: 'kto-en', type: 'kto',
    buildUrl: p => `${ENG_BASE}/areaBasedList2?serviceKey=${API_KEY}&numOfRows=${NUM_OF_ROWS}&pageNo=${p}&_type=json&areaCode=6&MobileOS=ETC&MobileApp=GoKoreaMate`,
    parse: parseKTO,
    norm:  item => normKTO(item, 'EngService2', 'en'),
    hardPageLimit: KTO_HARD_PAGE_LIMIT,
  },
];

// ── Phase 1: 원천별 전체 페이지 수집 ─────────────────────────────────────────
async function collectSource(src, srcState, state) {
  const completedPages = new Set(srcState.completed_pages);
  let { total_count: totalCount, total_pages: totalPages } = srcState;
  let consecutiveErrors = 0;
  const effectivePageLimit = MAX_PAGES_FLAG
    ? Math.min(MAX_PAGES_FLAG, src.hardPageLimit)
    : src.hardPageLimit;

  for (let page = 1; page <= effectivePageLimit; page++) {
    // 이미 완료된 페이지 건너뜀 (재개 시)
    if (completedPages.has(page)) continue;

    // KTO: totalPages 계산 후 초과 시 종료
    if (totalPages !== null && page > totalPages) break;

    await sleep(CALL_INTERVAL_MS);
    let data, parsed;
    try {
      data   = await fetchWithRetry(src.buildUrl(page));
      parsed = src.parse(data);
    } catch (e) {
      consecutiveErrors++;
      console.error(`  [ERROR] ${src.key} p${page}: ${e.message}`);
      srcState.last_error = e.message;
      srcState.updated_at = new Date().toISOString();
      if (consecutiveErrors >= CONSECUTIVE_ERR_ABORT) {
        console.error(`  [ABORT] 연속 오류 ${consecutiveErrors}회 — ${src.key} 중단`);
        srcState.status = 'failed';
        saveState(state);
        return;
      }
      saveState(state);
      continue;
    }
    consecutiveErrors = 0;

    if (!parsed.ok) {
      console.error(`  [FAIL] ${src.key} p${page}: code=${parsed.code}`);
      srcState.status = 'failed';
      srcState.last_error = `parse fail code=${parsed.code}`;
      saveState(state);
      return;
    }

    // KTO: 첫 성공 페이지에서 totalCount → totalPages 확정
    if (totalCount === null && parsed.total !== null) {
      totalCount = parsed.total;
      // 실제 페이지 수 + 1 안전 여유, 하드 상한 이하
      totalPages = Math.min(Math.ceil(totalCount / NUM_OF_ROWS) + 1, src.hardPageLimit);
      srcState.total_count = totalCount;
      srcState.total_pages = totalPages;
      console.log(`  totalCount=${totalCount} → 예상 ${Math.ceil(totalCount / NUM_OF_ROWS)}페이지 (상한 ${totalPages})`);
    }

    // raw 저장
    const rawPath = path.join(BATCH_RAW_DIR, `${src.key}-p${String(page).padStart(3, '0')}.json`);
    fs.writeFileSync(rawPath, JSON.stringify(data, null, 2), 'utf8');

    srcState.completed_pages.push(page);
    srcState.items_collected += parsed.items.length;
    srcState.request_count   += 1;
    state.total_requests     += 1;
    srcState.updated_at = new Date().toISOString();
    console.log(`  → p${page}: ${parsed.items.length}건 (누계 ${srcState.items_collected})`);
    saveState(state);

    // 부산시 API: 반환 건수 < numOfRows → 마지막 페이지
    if (parsed.total === null && parsed.items.length < NUM_OF_ROWS) break;

    // KTO: totalPages 기준 완료
    if (totalPages !== null && page >= totalPages) break;
  }

  srcState.status = 'completed';
  srcState.updated_at = new Date().toISOString();
  saveState(state);
  console.log(`  [DONE] ${src.key}: ${srcState.items_collected}건`);
}

// ── Phase 2: raw → 정규화 ────────────────────────────────────────────────────
function normalizeAll() {
  const records = [];
  const seen    = new Set();
  let errors = 0;

  for (const src of SOURCES) {
    if (!fs.existsSync(BATCH_RAW_DIR)) continue;
    const files = fs.readdirSync(BATCH_RAW_DIR)
      .filter(f => f.startsWith(src.key + '-p') && f.endsWith('.json'))
      .sort();

    for (const file of files) {
      try {
        const data   = JSON.parse(fs.readFileSync(path.join(BATCH_RAW_DIR, file), 'utf8'));
        const parsed = src.parse(data);
        if (!parsed.ok) { console.warn(`  [SKIP] ${file}`); continue; }
        for (const item of parsed.items) {
          try {
            const rec = src.norm(item);
            if (seen.has(rec.source_key)) { console.warn(`  [DUP] ${rec.source_key}`); continue; }
            seen.add(rec.source_key);
            records.push(rec);
          } catch (e) { errors++; }
        }
      } catch (e) { console.error(`  [ERROR] ${file}: ${e.message}`); errors++; }
    }
  }
  if (errors > 0) console.warn(`정규화 오류 ${errors}건`);
  return records;
}

// ── 보고서 ────────────────────────────────────────────────────────────────────
function buildReport(state, records, links, unlinked, reprocessPass, opts = {}) {
  const { storageStats = null, snapInfo = null, diffResult = null, prevSnapLabel = null } = opts;
  const withCoord = records.filter(r => r.latitude && r.longitude).length;
  const withImage = records.filter(r => r.image_url).length;
  const withDesc  = records.filter(r => r.description).length;
  const conf = { high: 0, manual_review: 0, low: 0 };
  links.forEach(l => { conf[l.confidence] = (conf[l.confidence] || 0) + 1; });

  const srcRows = SOURCES.map(s => {
    const st = state.sources[s.key] || {};
    return `| ${s.key} | ${st.items_collected ?? 0} | ${st.request_count ?? 0} | ${st.status ?? '-'} |`;
  }).join('\n');

  return `# GoKoreaMate 부산 전체 배치 보고서

**날짜:** ${TODAY}
**태스크:** TASK-DATA-BUSAN-BATCH-01
**max_pages:** ${MAX_PAGES_FLAG ?? 'all (전체)'}

## 원천별 수집 결과

| 원천 | 수집 건수 | 요청 수 | 상태 |
|---|---|---|---|
${srcRows}

**총 API 요청:** ${state.total_requests}회
**정규화 레코드:** ${records.length}건

## 필드 보유율

| 항목 | 보유율 |
|---|---|
| 좌표 | ${records.length ? (withCoord/records.length*100).toFixed(1) : 0}% |
| 이미지 URL | ${records.length ? (withImage/records.length*100).toFixed(1) : 0}% |
| 설명문 | ${records.length ? (withDesc/records.length*100).toFixed(1) : 0}% |

## 언어 연결

| 신뢰도 | 건수 |
|---|---|
| high | ${conf.high} |
| manual_review | ${conf.manual_review} |
| low | ${conf.low} |
| 합계 | ${links.length} |

## 미연결 후보 (insufficient_evidence)

| 항목 | 건수 |
|---|---|
| score 50~59 (GPS 단독) | ${unlinked.length} |
| status | insufficient_evidence |

## 재처리 검증

| 항목 | 결과 |
|---|---|
| 전체 재처리 일치 | ${reprocessPass ? 'PASS' : 'FAIL'} |

*자동 DB 반영 없음. 운영 반영은 사람 승인 필수.*
${storageStats ? `
## 저장공간

| 항목 | 값 |
|---|---|
| Raw 파일 수 | ${storageStats.totalFiles}개 |
| Raw 총 용량 | ${(storageStats.totalBytes/1024/1024).toFixed(1)}MB |
| 14일 초과 후보 | ${storageStats.candidateFiles}개 / ${(storageStats.candidateBytes/1024/1024).toFixed(1)}MB |
` : ''}
${snapInfo ? `
## 스냅샷

| 항목 | 값 |
|---|---|
| 저장 경로 | ${snapInfo.runLabel} |
| 실행 번호 | run-${String(snapInfo.runNum).padStart(3,'0')} |
| 비교 대상 | ${prevSnapLabel ?? '없음 (baseline)'} |
` : ''}
${diffResult ? `
## 변경분 비교

| 분류 | 건수 |
|---|---|
| new | ${diffResult.new} |
| changed | ${diffResult.changed} |
| missing_once | ${diffResult.missing_once} |
| unchanged | ${diffResult.unchanged} |
` : (prevSnapLabel === null && snapInfo ? `
## 변경분 비교

이전 스냅샷 없음 — baseline 저장 완료.
` : '')}
`;
}

// ── 메인 ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n=== TASK-DATA-BUSAN-BATCH-01 ===`);
  console.log(`Date: ${TODAY}, max_pages: ${MAX_PAGES_FLAG ?? 'all'}, reset: ${RESET}`);

  // 상태 로드 / 초기화
  let state = loadState();
  if (!state || state.run_date !== TODAY) {
    console.log(state ? `[신규 날짜 ${state.run_date}→${TODAY}] 초기화` : '[최초 실행] 초기화');
    state = initState();
  } else {
    const done = SOURCES.filter(s => state.sources[s.key]?.status === 'completed').length;
    console.log(`[재개] ${done}/${SOURCES.length}개 원천 완료 상태`);
    totalRequests = state.total_requests || 0;
  }

  // Phase 0: 저장공간 관리
  console.log('\n=== Phase 0: 저장공간 ===');
  const diskCheck = checkDiskSpace(ROOT);
  const freeGB = diskCheck.free !== null ? (diskCheck.free / 1024 / 1024 / 1024).toFixed(1) : '?';
  console.log(`디스크 여유: ${freeGB}GB [${diskCheck.method}]`);
  if (!diskCheck.ok) {
    console.error(`[ABORT] 디스크 여유 ${freeGB}GB < 2GB — 수집 중단`);
    process.exit(1);
  }

  const storageStats = rawStorageStats(RAW_BUSAN_DIR);
  console.log(`Raw 파일: ${storageStats.totalFiles}개 / ${(storageStats.totalBytes/1024/1024).toFixed(1)}MB`);
  console.log(`14일 초과 후보: ${storageStats.candidateFiles}개 / ${(storageStats.candidateBytes/1024/1024).toFixed(1)}MB`);

  fs.writeFileSync(
    path.join(RPT_DIR, 'busan-raw-cleanup-candidates.json'),
    JSON.stringify({
      generated_at: new Date().toISOString(), cutoff_days: 14,
      total_files: storageStats.totalFiles, total_bytes: storageStats.totalBytes,
      candidate_files: storageStats.candidateFiles, candidate_bytes: storageStats.candidateBytes,
      candidates: storageStats.candidates,
    }, null, 2),
    'utf8'
  );

  // Phase 1: 전체 원천 수집
  console.log('\n=== Phase 1: API 수집 ===');
  for (const src of SOURCES) {
    if (!state.sources[src.key]) state.sources[src.key] = initSourceState();
    const s = state.sources[src.key];
    if (s.status === 'completed') {
      console.log(`[SKIP] ${src.key}: 완료 (${s.items_collected}건)`);
      continue;
    }
    console.log(`\n[수집] ${src.key}`);
    s.status = 'in_progress';
    s.updated_at = new Date().toISOString();
    saveState(state);
    await collectSource(src, s, state);
  }

  const failedSources = SOURCES.filter(s => state.sources[s.key]?.status === 'failed').map(s => s.key);
  if (failedSources.length > 0) console.warn('\n[WARNING] 실패 원천:', failedSources.join(', '));

  // Phase 2: 정규화
  console.log('\n=== Phase 2: 정규화 ===');
  const records = normalizeAll();
  console.log(`정규화: ${records.length}건`);

  const dupKeys = [];
  const keySeen = new Set();
  records.forEach(r => { if (keySeen.has(r.source_key)) dupKeys.push(r.source_key); else keySeen.add(r.source_key); });
  if (dupKeys.length > 0) console.warn(`source_key 중복 ${dupKeys.length}건:`, dupKeys.slice(0, 5));

  // Phase 3: 언어 연결
  console.log('\n=== Phase 3: 언어 연결 ===');
  const { links, unlinked } = buildLanguageLinks(records);
  const conf = { high: 0, manual_review: 0, low: 0 };
  links.forEach(l => { conf[l.confidence] = (conf[l.confidence] || 0) + 1; });
  console.log(`연결: total=${links.length} high=${conf.high} manual=${conf.manual_review} low=${conf.low}`);
  console.log(`미연결(insufficient_evidence): ${unlinked.length}건`);

  // Phase 4: 파일 저장
  fs.writeFileSync(path.join(NORM_DIR, 'busan-batch-normalized.json'), JSON.stringify(records, null, 2), 'utf8');

  const linkHdr  = csvRow(['source_key_ko','source_key_target','target_language','score','confidence','dist_m','title_ko','title_target','link_method']);
  const linkRows = links.map(l => csvRow([l.source_key_ko, l.source_key_target, l.target_language, l.score, l.confidence, l.dist_m, l.title_ko, l.title_target, l.link_method]));
  fs.writeFileSync(path.join(CAND_DIR, 'busan-batch-language-links.csv'), [linkHdr, ...linkRows].join('\n'), 'utf8');

  const unlinkHdr  = csvRow(['source_key_ko','source_key_target','target_language','score','dist_m','title_ko','title_target','status']);
  const unlinkRows = unlinked.map(u => csvRow([u.source_key_ko, u.source_key_target, u.target_language, u.score, u.dist_m, u.title_ko, u.title_target, u.status]));
  fs.writeFileSync(path.join(CAND_DIR, 'busan-batch-unlinked-candidates.csv'), [unlinkHdr, ...unlinkRows].join('\n'), 'utf8');

  // Phase 5: 스냅샷 및 변경분 비교
  console.log('\n=== Phase 5: 스냅샷 및 변경분 비교 ===');
  const prevSnap = findPreviousSnapshot(SNAPSHOT_DIR);
  let diffResultMetrics = null;
  let prevSnapLabel = null;

  if (!prevSnap) {
    console.log('이전 스냅샷 없음 → baseline으로 저장');
  } else {
    prevSnapLabel = prevSnap.label;
    console.log(`이전 스냅샷: ${prevSnapLabel}`);
    const prevRecords = JSON.parse(fs.readFileSync(prevSnap.dataPath, 'utf8'));
    const diff = buildDiff(records, prevRecords);
    console.log(`diff: new=${diff.new.length}, changed=${diff.changed.length}, missing_once=${diff.missing_once.length}, unchanged=${diff.unchanged.length}`);
    const saved = saveDiffResults(diff, CAND_DIR, RPT_DIR, TODAY, prevSnapLabel);
    diffResultMetrics = saved.metrics;
  }

  const snapInfo = saveSnapshot(
    records,
    { high: conf.high, manual_review: conf.manual_review, low: conf.low, total_links: links.length, unlinked: unlinked.length },
    SNAPSHOT_DIR, TODAY
  );
  console.log(`스냅샷 저장: ${snapInfo.runLabel}`);

  // 재처리 검증 (raw에서 재로드, 결과 일치 확인)
  console.log('\n=== 재처리 검증 ===');
  const records2 = normalizeAll();
  const { links: links2, unlinked: unlinked2 } = buildLanguageLinks(records2);
  const reprocessPass = records.length === records2.length && links.length === links2.length && unlinked.length === unlinked2.length;
  console.log(`records: ${records.length}=${records2.length}, links: ${links.length}=${links2.length}, unlinked: ${unlinked.length}=${unlinked2.length} → ${reprocessPass ? 'PASS' : 'FAIL'}`);

  // 보고서
  const report = buildReport(state, records, links, unlinked, reprocessPass, {
    storageStats, snapInfo, prevSnapLabel,
    diffResult: diffResultMetrics,
  });
  fs.writeFileSync(path.join(DOC_DIR, 'busan-batch-report.md'), report, 'utf8');

  // 메트릭 JSON
  const metrics = {
    run_date: TODAY, max_pages: MAX_PAGES_FLAG ?? 'all',
    total_requests: state.total_requests,
    sources: Object.fromEntries(SOURCES.map(s => [s.key, state.sources[s.key] || {}])),
    total_normalized: records.length,
    source_key_duplicates: dupKeys.length,
    coord_rate:  records.length ? (records.filter(r => r.latitude).length / records.length).toFixed(3) : '0',
    image_rate:  records.length ? (records.filter(r => r.image_url).length / records.length).toFixed(3) : '0',
    desc_rate:   records.length ? (records.filter(r => r.description).length / records.length).toFixed(3) : '0',
    language_links: { ...conf, total: links.length },
    unlinked_insufficient_evidence: unlinked.length,
    reprocess_pass: reprocessPass,
    failed_sources: failedSources,
    storage: {
      total_files: storageStats.totalFiles, total_bytes: storageStats.totalBytes,
      candidate_files: storageStats.candidateFiles, candidate_bytes: storageStats.candidateBytes,
    },
    snapshot: { path: snapInfo.runLabel, run_number: snapInfo.runNum },
    diff: diffResultMetrics ?? { baseline: true, compared_against: null },
  };
  fs.writeFileSync(path.join(RPT_DIR, 'busan-batch-metrics.json'), JSON.stringify(metrics, null, 2), 'utf8');

  // 요약
  console.log('\n=== 완료 요약 ===');
  console.log(`총 요청: ${state.total_requests}`);
  console.log(`정규화: ${records.length}건`);
  console.log(`source_key 중복: ${dupKeys.length === 0 ? 'PASS' : 'FAIL (' + dupKeys.length + '건)'}`);
  console.log(`언어 연결: ${links.length}건`);
  console.log(`미연결(insufficient_evidence): ${unlinked.length}건`);
  console.log(`재처리: ${reprocessPass ? 'PASS' : 'FAIL'}`);
  console.log(`실패 원천: ${failedSources.length > 0 ? failedSources.join(', ') : '없음'}`);
  console.log(`스냅샷: ${snapInfo.runLabel}`);
  if (diffResultMetrics) {
    console.log(`diff: new=${diffResultMetrics.new} changed=${diffResultMetrics.changed} missing_once=${diffResultMetrics.missing_once} unchanged=${diffResultMetrics.unchanged}`);
  }
  console.log(`\n생성 파일:`);
  [
    path.join(BATCH_RAW_DIR, ''),
    path.join(NORM_DIR, 'busan-batch-normalized.json'),
    path.join(CAND_DIR, 'busan-batch-language-links.csv'),
    path.join(CAND_DIR, 'busan-batch-unlinked-candidates.csv'),
    path.join(RPT_DIR,  'busan-batch-metrics.json'),
    path.join(DOC_DIR,  'busan-batch-report.md'),
    path.join(SNAPSHOT_DIR, snapInfo.runLabel),
    path.join(RPT_DIR,  'busan-raw-cleanup-candidates.json'),
    STATE_FILE,
  ].forEach(p => console.log(' ', p.replace(ROOT + path.sep, '').replace(ROOT + '/', '')));
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
