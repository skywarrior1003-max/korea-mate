#!/usr/bin/env node
/**
 * tourapi-nightly.mjs — TourAPI 야간 조사 자동화
 *
 * 실행 모드:
 *   update   기존 city_spots의 external_id 누락·오매칭 갱신
 *   discover 신규 장소 후보 발굴 (자동 승인 없음)
 *   full     전체 재수집 — --allow-full 필수
 *
 * 사용 예:
 *   node scripts/tourapi-nightly.mjs --mode update --city busan --max-calls 200
 *   node scripts/tourapi-nightly.mjs --mode update --city busan --id 6,7,16
 *   node scripts/tourapi-nightly.mjs --mode discover --city busan --dry-run
 *   node scripts/tourapi-nightly.mjs --mode full --city busan --allow-full --max-calls 500
 *
 * READ-ONLY: Supabase (anon), TourAPI
 * 금지: DB 수정 / upsert / commit / push
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ── .env.local 자동 로드 (값은 절대 출력하지 않음) ───────────────────────────
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

import {
  loadConfig,
  distM,
  scoreCandidates,
  getMatchStatus,
  classifyConfidence,
  createCallContext,
  detectDuplicateContentIds,
  toCsvRow,
  toCsvHeader,
} from './tourapi-batch.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));

// ── CLI 파싱 ──────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = {
    mode:       null,
    city:       'busan',
    ids:        [],          // --id 1,2,3 → ['1','2','3']
    maxCalls:   null,
    maxItems:   null,
    allowFull:  false,
    dryRun:     false,
    resume:     true,
    configPath: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if      (a === '--mode')        args.mode       = argv[++i];
    else if (a === '--city')        args.city       = argv[++i];
    else if (a === '--id')          args.ids        = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--max-calls')   args.maxCalls   = parseInt(argv[++i], 10);
    else if (a === '--max-items')   args.maxItems   = parseInt(argv[++i], 10);
    else if (a === '--allow-full')  args.allowFull  = true;
    else if (a === '--dry-run')     args.dryRun     = true;
    else if (a === '--no-resume')   args.resume     = false;
    else if (a === '--config')      args.configPath = argv[++i];
  }
  return args;
}

// ── 시각 유틸 ─────────────────────────────────────────────────────────────────
function nowIso()  { return new Date().toISOString(); }
function runStamp() {
  // Windows 경로에서 콜론 불가 → YYYYMMDD-HHMMSS
  return new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
}
function today() { return new Date().toISOString().slice(0, 10); }

// ── 경로 ──────────────────────────────────────────────────────────────────────
function getPaths(city, mode, stamp) {
  const baseDir    = path.resolve(__dir, '../tmp/tourapi-nightly');
  const runsDir    = path.join(baseDir, 'runs');
  const runDir     = path.join(runsDir, stamp);          // runs/20260722-220000/
  const stateFile  = path.join(baseDir, 'state.json');
  const resultsFile  = path.join(runDir, `results-${mode}-${city}.json`);
  const summaryFile  = path.join(runDir, `summary-${mode}-${city}.csv`);
  const callLogFile  = path.join(runDir, `call-log-${mode}-${city}.csv`);
  const discoverFile = path.join(runDir, `discover-${city}.json`);
  return { baseDir, runsDir, runDir, stateFile, resultsFile, summaryFile, callLogFile, discoverFile };
}

// ── 상태 구조 ─────────────────────────────────────────────────────────────────
/*
state.json v2:
{
  "items": {
    "1": { "status": "manual_review", "contentId": "264155", "title": "...", "updatedAt": "..." },
    "6": { "status": "no_match",      "contentId": null,      "title": null,  "updatedAt": "..." }
  },
  "currentRun": {
    "runId":          "20260722-220000",
    "mode":           "update",
    "city":           "busan",
    "startedAt":      "...",
    "processedInRun": ["1", "6"]    ← 이번 실행 세션에서 처리된 ID (재개용)
  }
}
*/

function loadState(stateFile) {
  try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')); }
  catch { return null; }
}

function saveState(stateFile, state) {
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8');
}

// ── 구버전 state(completed 배열) → v2 items 맵 마이그레이션 ──────────────────
function migrateFromLegacy(oldState, baseDir, city) {
  const completed = (oldState.completed || []).map(String);
  const recovered = {};

  // 기존 날짜 폴더 결과 파일 스캔 (status 복구)
  try {
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory() || !/^\d{4}-\d{2}-\d{2}$/.test(e.name)) continue;
      const rFile = path.join(baseDir, e.name, `results-update-${city}.json`);
      try {
        const data = JSON.parse(fs.readFileSync(rFile, 'utf8'));
        for (const r of (data.results || [])) {
          const id = String(r.id);
          if (!recovered[id]) {
            recovered[id] = {
              status:    r.confidence || r.matchStatus || 'unknown_migrated',
              contentId: r.selectedContentId || null,
              title:     r.candidates?.[0]?.title || null,
              updatedAt: data.generatedAt || nowIso(),
            };
          }
        }
      } catch (_) {}
    }
  } catch (_) {}

  const items = {};
  for (const id of completed) {
    items[id] = recovered[id] || {
      status:    'unknown_migrated',
      contentId: null,
      title:     null,
      updatedAt: oldState.lastUpdatedAt || nowIso(),
    };
  }
  if (Object.keys(recovered).length > 0) {
    const recCount = Object.keys(recovered).length;
    const unkCount = completed.filter(id => !recovered[id]).length;
    console.log(`[마이그레이션] 기존 completed ${completed.length}건 → 복구 ${recCount}건 / 미확인 ${unkCount}건(unknown_migrated)`);
  }
  return items;
}

// ── 신규 실행 state 초기화 ────────────────────────────────────────────────────
function initState(args, stamp) {
  return {
    items: {},
    currentRun: {
      runId: stamp, mode: args.mode, city: args.city,
      startedAt: nowIso(), processedInRun: [],
    },
  };
}

// ── 실행 세션 시작/재개 판단 ──────────────────────────────────────────────────
function resolveState(raw, args, stamp, baseDir) {
  if (!raw) return initState(args, stamp);

  // 구버전 감지 (completed 배열 형식)
  if (Array.isArray(raw.completed)) {
    console.log('[마이그레이션] state.json v1 감지 — v2로 변환합니다.');
    const items = migrateFromLegacy(raw, baseDir, args.city);
    return {
      items,
      currentRun: {
        runId: stamp, mode: args.mode, city: args.city,
        startedAt: nowIso(), processedInRun: [],
      },
    };
  }

  // v2 형식 — currentRun이 같은 모드·도시·날짜면 재개
  const cr = raw.currentRun || {};
  const sameSession = cr.mode === args.mode
    && cr.city === args.city
    && args.resume
    && cr.runId?.slice(0, 8) === today().replace(/-/g, '');

  if (sameSession) {
    console.log(`[재개] runId=${cr.runId} processedInRun=${(cr.processedInRun||[]).length}건`);
    return raw;
  }

  // 다른 날짜/모드/도시 또는 --no-resume → items는 보존, currentRun만 새로 시작
  console.log('[신규 실행] 이전 items 맵 보존, 현재 실행 세션 초기화.');
  return {
    items: raw.items || {},
    currentRun: {
      runId: stamp, mode: args.mode, city: args.city,
      startedAt: nowIso(), processedInRun: [],
    },
  };
}

// ── Supabase: 전체 spots 조회 (name_l10n 포함) ───────────────────────────────
async function fetchAllSpotsForUpdate(ctx, sbUrl, sbAnon, city) {
  return ctx.sbGet(sbUrl, sbAnon, 'city_spots', {
    select: 'id,name,category,lat,lng,external_id,name_l10n,source_type',
    city:   `eq.${city}`,
    order:  'id.asc',
  });
}

// ── update 대상 우선순위 선별 ─────────────────────────────────────────────────
function selectUpdateTargets(allSpots, stateItems, explicitIds, processedInRun) {
  const processed = new Set(processedInRun.map(String));

  // 이번 실행 세션에서 이미 처리한 항목은 재개 시에도 건너뜀
  const available = allSpots.filter(s => !processed.has(String(s.id)));

  // 우선 1: 명시적 --id
  if (explicitIds.length > 0) {
    const idSet = new Set(explicitIds.map(String));
    return available.filter(s => idSet.has(String(s.id)));
  }

  // canonical: duplicate_conflict (confidence 값); 하위 호환: duplicate_contentid_conflict (matchStatus 값)
  const P1_STATUSES = new Set(['no_match', 'wrong_match', 'duplicate_conflict', 'duplicate_contentid_conflict']);
  const P2_STATUSES = new Set(['manual_review', 'unknown_migrated']);
  const EXCLUDE     = new Set(['high_confidence']);

  const p1 = [], p2 = [], p3 = [];

  for (const s of available) {
    const entry = stateItems[String(s.id)];
    if (!entry) {
      // 우선 4: 아직 한 번도 처리하지 않은 항목 (external_id 누락인 경우만)
      if (!s.external_id) p3.push(s);
    } else if (EXCLUDE.has(entry.status)) {
      // high_confidence → 제외
    } else if (P1_STATUSES.has(entry.status)) {
      p1.push(s);
    } else if (P2_STATUSES.has(entry.status)) {
      p2.push(s);
    }
    // 그 외(multiple_candidates 등) → 2순위에 포함
    else {
      p2.push(s);
    }
  }

  return [...p1, ...p2, ...p3];
}

// ── TourAPI 후보 조회 ─────────────────────────────────────────────────────────
async function fetchCandidates(ctx, spot, cfg) {
  const numOfRows = cfg.defaults?.searchNumOfRows || 5;
  let candidates = [];

  const name = spot.name || '';
  if (name) {
    const d = await ctx.tourCall('searchKeyword2',
      { keyword: name, numOfRows, pageNo: 1 }, name, 'searchKeyword');
    candidates = ctx.extractItems(d);
  }

  // GPS fallback: 후보 없을 때만
  if (candidates.length === 0 && spot.lat && spot.lng) {
    const d2 = await ctx.tourCall('locationBasedList2',
      { mapX: spot.lng, mapY: spot.lat, radius: 500, numOfRows }, name, 'locationBasedList');
    candidates = ctx.extractItems(d2);
  }

  // 한국어명으로 추가 검색 (영문 검색 결과가 없을 때)
  if (candidates.length === 0 && spot.koName) {
    const d3 = await ctx.tourCall('searchKeyword2',
      { keyword: spot.koName, numOfRows, pageNo: 1 }, name, 'searchKeyword(ko)');
    candidates = ctx.extractItems(d3);
  }

  return candidates;
}

// ── 단일 spot 처리 ────────────────────────────────────────────────────────────
async function processSpot(ctx, spot, cfg) {
  console.log(`\n▸ [${spot.id}] ${spot.name}`);

  // name_l10n?.ko 가 실제로 존재할 때만 koName으로 사용 (임의 추정 금지)
  const l10n = (spot.name_l10n && typeof spot.name_l10n === 'object') ? spot.name_l10n : null;
  const koName = (l10n && typeof l10n.ko === 'string' && l10n.ko.trim()) ? l10n.ko.trim() : null;

  const spotForSearch = { ...spot, koName };
  const candidates = await fetchCandidates(ctx, spotForSearch, cfg);

  if (candidates.length === 0) {
    return {
      id: spot.id, name: spot.name, koName, category: spot.category,
      dbExternalId: spot.external_id || null,
      selectedContentId: null, selectedContentTypeId: null,
      matchStatus: 'no_match', confidence: 'no_match',
      candidates: [], reviewReasons: [],
    };
  }

  const scored = scoreCandidates(candidates, {
    name:          spot.name,
    koName:        koName || '',
    gpsLat:        spot.lat,
    gpsLng:        spot.lng,
    contentTypeId: spot.contentTypeId || null,
  }, spot.category || '', cfg);

  const best   = scored[0];
  const status = best ? getMatchStatus(
    { name: spot.name, gpsLat: spot.lat, gpsLng: spot.lng },
    best, candidates.length, cfg,
  ) : 'no_match';

  const confidence = classifyConfidence(status, best?._score ?? 0, cfg);

  return {
    id: spot.id, name: spot.name, koName, category: spot.category,
    dbExternalId:          spot.external_id || null,
    selectedContentId:     best?.contentid      || null,
    selectedContentTypeId: best?.contenttypeid  || null,
    matchStatus:  status,
    confidence,
    topScore:     best?._score ?? null,
    topDist:      best?._dist  ?? null,
    candidates:   scored.slice(0, 5).map(c => ({
      contentid: c.contentid, contenttypeid: c.contenttypeid,
      title: c.title, addr1: c.addr1,
      mapx: c.mapx, mapy: c.mapy,
      _score: c._score, _dist: c._dist,
    })),
    reviewReasons: [],
  };
}

// ── discover 모드 (변경 없음) ─────────────────────────────────────────────────
async function runDiscover(ctx, sbUrl, sbAnon, city, cityCfg, cfg, args, paths) {
  console.log(`\n=== DISCOVER 모드: ${city} 신규 장소 후보 발굴 ===\n`);

  const bb      = cityCfg.boundingBox;
  const step    = cityCfg.discoverGridStepDeg || 0.03;
  const radius  = cityCfg.discoverRadiusM || 2000;
  const numOfRows = cfg.defaults?.discoverNumOfRows || 10;

  const existing = await ctx.sbGet(sbUrl, sbAnon, 'city_spots', {
    select: 'id,name,lat,lng,external_id', city: `eq.${city}`, order: 'id.asc',
  });
  const existingCids = new Set(existing.map(r => r.external_id).filter(Boolean));

  const gridPoints = [];
  for (let lat = bb.latMin; lat <= bb.latMax; lat = Math.round((lat + step) * 10000) / 10000)
    for (let lng = bb.lngMin; lng <= bb.lngMax; lng = Math.round((lng + step) * 10000) / 10000)
      gridPoints.push({ lat, lng });

  console.log(`격자 포인트: ${gridPoints.length}개 (step=${step}°, radius=${radius}m)`);
  if (args.dryRun) {
    console.log(`[DRY-RUN] 격자 스캔 생략 — 출력 경로: ${paths.discoverFile}`);
    return [];
  }

  const seen = new Set();
  const newCandidates = [];
  const maxItems = args.maxItems ?? Infinity;

  for (const pt of gridPoints) {
    if (ctx.callCount >= (args.maxCalls ?? 200)) { console.warn('MAX_CALLS 도달 — discover 중단'); break; }
    if (newCandidates.length >= maxItems)         { console.warn('MAX_ITEMS 도달 — discover 중단'); break; }

    const d = await ctx.tourCall('locationBasedList2',
      { mapX: pt.lng, mapY: pt.lat, radius, numOfRows },
      `grid(${pt.lat},${pt.lng})`, 'locationBasedList');
    const items = ctx.extractItems(d);

    for (const item of items) {
      if (seen.has(item.contentid)) continue;
      seen.add(item.contentid);
      if (!existingCids.has(item.contentid)) {
        const near = existing.find(e =>
          e.lat && e.lng && distM(e.lat, e.lng, parseFloat(item.mapy), parseFloat(item.mapx)) < 100
        );
        newCandidates.push({
          contentid: item.contentid, contenttypeid: item.contenttypeid,
          title: item.title, addr1: item.addr1,
          mapx: item.mapx, mapy: item.mapy,
          firstimage: item.firstimage || '',
          matchesExisting: near?.name || null,
          status: 'new_candidate',
        });
      }
    }
  }

  console.log(`\n신규 후보: ${newCandidates.length}개 (기존 ${existingCids.size}개 제외)`);
  return newCandidates;
}

// ── 결과 저장 (run 폴더에 저장, 덮어쓰기 없음) ───────────────────────────────
function saveResults(results, paths, mode, ctx) {
  fs.mkdirSync(paths.runDir, { recursive: true });

  fs.writeFileSync(paths.resultsFile, JSON.stringify({
    generatedAt: nowIso(), mode,
    totalCalls:  ctx.callCount,
    count:       results.length,
    results,
  }, null, 2), 'utf8');

  if (results.length > 0 && results[0].id !== undefined) {
    const csvRows = results.map(r => ({
      id:                   r.id,
      name:                 r.name,
      ko_name:              r.koName || '',
      category:             r.category || '',
      db_external_id:       r.dbExternalId || '',
      selected_content_id:  r.selectedContentId || '',
      match_status:         r.matchStatus,
      confidence:           r.confidence,
      top_score:            r.topScore ?? '',
      top_dist_m:           r.topDist  ?? '',
      review_reasons:       (r.reviewReasons || []).join(' / '),
      top_candidate_title:  r.candidates?.[0]?.title || '',
    }));
    fs.writeFileSync(paths.summaryFile,
      '﻿' + [toCsvHeader(csvRows[0]), ...csvRows.map(toCsvRow)].join('\n'), 'utf8');
  }

  if (ctx.callLog.length > 0) {
    const header = 'seq,label,apiType,success,httpStatus,responseMs,retries,error';
    fs.writeFileSync(paths.callLogFile,
      '﻿' + [header, ...ctx.callLog.map(toCsvRow)].join('\n'), 'utf8');
  }

  console.log(`\n→ ${paths.resultsFile}`);
  if (fs.existsSync(paths.summaryFile)) console.log(`→ ${paths.summaryFile}`);
  if (fs.existsSync(paths.callLogFile)) console.log(`→ ${paths.callLogFile}`);
}

function saveDiscoverResults(candidates, paths, ctx) {
  fs.mkdirSync(paths.runDir, { recursive: true });
  fs.writeFileSync(paths.discoverFile, JSON.stringify({
    generatedAt: nowIso(), totalCalls: ctx.callCount,
    note: '신규 후보 — 자동 승인 없음. 수동 검토 후 city_spots 반영 결정.',
    count: candidates.length, candidates,
  }, null, 2), 'utf8');
  console.log(`\n→ ${paths.discoverFile}`);
}

// ── 요약 출력 ─────────────────────────────────────────────────────────────────
function printSummary(results, mode, ctx, args) {
  const cnt = {};
  for (const r of results) {
    const k = r.confidence || r.status;
    cnt[k] = (cnt[k] || 0) + 1;
  }
  console.log(`
=== SUMMARY (${mode.toUpperCase()}) ===
도시:     ${args.city}
항목:     ${results.length}
API 호출: ${ctx.callCount}${args.dryRun ? ' (dry-run)' : ''}

분류:`);
  for (const [k, v] of Object.entries(cnt)) console.log(`  ${k}: ${v}`);
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  const args  = parseArgs(process.argv.slice(2));
  const stamp = runStamp();

  if (!args.mode) { console.error('ERROR: --mode update|discover|full 필수'); process.exit(1); }
  if (!['update', 'discover', 'full'].includes(args.mode)) {
    console.error(`ERROR: 알 수 없는 mode: ${args.mode}`); process.exit(1);
  }
  if (args.mode === 'full' && !args.allowFull) {
    console.error('ERROR: full 모드는 --allow-full 옵션 필수'); process.exit(1);
  }

  const sbUrl   = (process.env.NEXT_PUBLIC_SUPABASE_URL  || process.env.SB_URL  || '').replace(/\/$/, '');
  const sbAnon  =  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SB_ANON  || '';
  const tourKey =  process.env.TOUR_API_KEY || process.env.TOUR_KEY || '';

  if (!sbUrl || !sbAnon || !tourKey) {
    console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / TOUR_API_KEY 필요');
    if (!args.dryRun) process.exit(1);
    console.warn('[DRY-RUN] 환경변수 없이 계속 실행합니다.');
  }

  const cfg     = loadConfig(args.configPath);
  const cityCfg = cfg.cities?.[args.city];
  if (!cityCfg) { console.error(`ERROR: 설정에 없는 도시: ${args.city}`); process.exit(1); }

  const maxCalls = args.maxCalls ?? cfg.defaults?.maxCalls ?? 200;
  const maxItems = args.maxItems ?? cfg.defaults?.maxItems ?? 50;
  const paths    = getPaths(args.city, args.mode, stamp);

  console.log(`
🌙 TourAPI 야간 조사 자동화
모드:   ${args.mode}${args.mode === 'full' ? ' (--allow-full)' : ''}
도시:   ${args.city}
상한:   API ${maxCalls}호 / 항목 ${maxItems}개
run:    ${stamp}
출력:   ${paths.runDir}
DRY-RUN: ${args.dryRun}
`);

  if (args.dryRun) {
    const rawState = loadState(paths.stateFile);
    const state    = resolveState(rawState, args, stamp, paths.baseDir);
    const items    = state.items || {};
    const itemCount = Object.keys(items).length;
    console.log(`[DRY-RUN] 파싱 OK`);
    console.log(`[DRY-RUN] state items: ${itemCount}건 (high_confidence 제외 후 update 대상 산출)`);
    if (args.ids.length > 0) console.log(`[DRY-RUN] 명시적 --id: ${args.ids.join(', ')}`);
    console.log(`[DRY-RUN] 출력 경로: ${paths.resultsFile}`);
    console.log(`[DRY-RUN] 상태 파일: ${paths.stateFile}`);
    process.exit(0);
  }

  fs.mkdirSync(paths.baseDir, { recursive: true });

  // 상태 로드 / 마이그레이션 / 재개 판단
  // items 맵은 --no-resume 여부와 관계없이 항상 디스크에서 보존
  // resume/no-resume 분기는 resolveState 내부 sameSession 조건이 처리한다
  const rawState = loadState(paths.stateFile);
  const state    = resolveState(rawState, args, stamp, paths.baseDir);

  const ctx = createCallContext({
    maxCalls, tourKey,
    delayMs:  cfg.defaults?.callDelayMs ?? 500,
    maxRetry: cfg.defaults?.maxRetry    ?? 2,
  });

  // ── 모드 분기 ──────────────────────────────────────────────────────────────
  if (args.mode === 'discover') {
    const candidates = await runDiscover(ctx, sbUrl, sbAnon, args.city, cityCfg, cfg, args, paths);
    saveDiscoverResults(candidates, paths, ctx);
    printSummary(candidates, args.mode, ctx, args);
    return;
  }

  // ── update / full ──────────────────────────────────────────────────────────
  const stateItems       = state.items || {};
  const processedInRun   = state.currentRun?.processedInRun || [];

  let spots;
  if (args.mode === 'full') {
    console.log('=== FULL 모드: 전체 spot 재수집 ===');
    const allSpots = await fetchAllSpotsForUpdate(ctx, sbUrl, sbAnon, args.city);
    spots = allSpots.filter(s => !processedInRun.includes(String(s.id)));
  } else {
    console.log('=== UPDATE 모드: 우선순위 기반 대상 선별 ===');
    const allSpots = await fetchAllSpotsForUpdate(ctx, sbUrl, sbAnon, args.city);

    const hcCount   = Object.values(stateItems).filter(v => v.status === 'high_confidence').length;
    const unkCount  = Object.values(stateItems).filter(v => v.status === 'unknown_migrated').length;
    const unproc    = allSpots.filter(s => !stateItems[String(s.id)] && !s.external_id).length;
    console.log(`  items 맵: ${Object.keys(stateItems).length}건 기록 (high_confidence ${hcCount}건 제외, unknown_migrated ${unkCount}건)`);
    console.log(`  미처리(external_id IS NULL): ${unproc}건`);

    spots = selectUpdateTargets(allSpots, stateItems, args.ids, processedInRun);
  }

  console.log(`대상: ${spots.length}개 (이번 세션 처리 완료: ${processedInRun.length}개)`);

  const results  = [];
  let processed  = 0;

  for (const spot of spots) {
    if (processed >= maxItems) { console.warn(`MAX_ITEMS(${maxItems}) 도달 — 중단`); break; }
    if (ctx.callCount >= maxCalls) { console.warn(`MAX_CALLS(${maxCalls}) 도달 — 중단`); break; }

    try {
      const r = await processSpot(ctx, spot, cfg);
      results.push(r);

      // items 맵 갱신
      stateItems[String(spot.id)] = {
        status:    r.confidence || r.matchStatus,
        contentId: r.selectedContentId || null,
        title:     r.candidates?.[0]?.title || null,
        updatedAt: nowIso(),
      };

      state.items = stateItems;
      state.currentRun.processedInRun = [...processedInRun, ...results.map(x => String(x.id))];
      saveState(paths.stateFile, state);
      processed++;
    } catch (err) {
      if (err.message === 'MAX_CALLS_REACHED') { console.warn('MAX_CALLS 도달'); break; }
      console.error(`[${spot.id}] ${spot.name} 처리 실패: ${err.message}`);
    }
  }

  detectDuplicateContentIds(results);
  saveResults(results, paths, args.mode, ctx);
  printSummary(results, args.mode, ctx, args);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
