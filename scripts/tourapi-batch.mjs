/**
 * tourapi-batch.mjs — 공유 매칭·API 유틸리티
 *
 * tourapi-pilot.mjs 의 검증된 로직을 export-only 모듈로 분리.
 * 운영 DB 수정 없음. TourAPI / Supabase READ-ONLY.
 */

import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

export const TOURAPI_BASE = 'https://apis.data.go.kr/B551011/EngService2';

// ── 공유 설정 ──────────────────────────────────────────────────────────────────
export function loadConfig(configPath) {
  const p = configPath || path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../data/tourapi-nightly-config.json',
  );
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// ── GPS ────────────────────────────────────────────────────────────────────────
export function distM(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// ── 문자열 정규화 (pilot.mjs와 동일) ──────────────────────────────────────────
export function normStr(s) {
  return String(s || '').replace(/[\s\-()\[\]]/g, '').toLowerCase();
}

// ── 매칭 로직 (pilot.mjs와 동일) ──────────────────────────────────────────────
export function scoreCandidates(candidates, spot, dbCategory = '', cfg = {}) {
  const shoppingIds = new Set(cfg.shoppingTypeIds || [38, 79, 82]);
  const pool = (dbCategory === 'nature')
    ? candidates.filter(c => !shoppingIds.has(parseInt(c.contenttypeid, 10)))
    : candidates;

  if (pool.length === 0) return [];

  const enName = normStr(spot.name || spot.dbName || '');
  const koName = normStr(spot.koName || '');
  const koAlt  = normStr(spot.koAlt  || '');

  return pool.map(c => {
    const title = normStr(c.title);
    let s = 0;

    if (title === enName || title === koName || (koAlt && title === koAlt)) {
      s += 100;
    } else if (title.startsWith(enName) || title.startsWith(koName) || (koAlt && title.startsWith(koAlt))) {
      s += 80;
    } else if (enName.includes(title) || (koAlt && koAlt.includes(title))) {
      s += 60;
    } else if (title.includes(enName)) {
      s += 40;
    } else if (koName.includes(title)) {
      s += 50;
    } else if (title.includes(koName)) {
      s += 30;
    } else if (koAlt && title.includes(koAlt)) {
      s += 40;
    }

    const gpsLat = spot.gpsLat ?? spot.lat;
    const gpsLng = spot.gpsLng ?? spot.lng;
    const d = distM(gpsLat, gpsLng, parseFloat(c.mapy), parseFloat(c.mapx));
    if (d !== null) {
      if (d < 100)       s += 80;
      else if (d < 300)  s += 50;
      else if (d < 800)  s += 20;
      else if (d < 2000) s += 5;
    }

    return { ...c, _score: s, _dist: d };
  }).sort((a, b) => {
    if (b._score !== a._score) return b._score - a._score;
    const aT = spot.contentTypeId && parseInt(a.contenttypeid, 10) === spot.contentTypeId ? 1 : 0;
    const bT = spot.contentTypeId && parseInt(b.contenttypeid, 10) === spot.contentTypeId ? 1 : 0;
    if (bT !== aT) return bT - aT;
    if (a._dist === null && b._dist === null) return 0;
    if (a._dist === null) return 1;
    if (b._dist === null) return -1;
    return a._dist - b._dist;
  });
}

export function getMatchStatus(spot, best, allCount, cfg = {}) {
  if (!best) return 'no_match';
  const wrongDist = cfg.matchThresholds?.wrongMatchDistM ?? 5000;
  if (best._dist !== null && best._dist > wrongDist) return 'wrong_match';
  const title  = normStr(best.title);
  const enName = normStr(spot.name || spot.dbName || '');
  const koName = normStr(spot.koName || '');
  const nameExact   = title === enName || title === koName;
  const namePartial = title.includes(enName) || enName.includes(title) ||
                      title.includes(koName) || koName.includes(title);
  const closeDist = cfg.matchThresholds?.coordCloseDistM ?? 500;
  const coordClose = best._dist !== null && best._dist < closeDist;
  if (nameExact && coordClose)                  return 'exact_match';
  if ((nameExact || namePartial) && coordClose) return 'probable_match';
  if (allCount > 1)                             return 'multiple_candidates';
  if (namePartial || coordClose)                return 'probable_match';
  return 'manual_review_required';
}

export function classifyConfidence(status, score, cfg = {}) {
  const minScore = cfg.matchThresholds?.highConfidenceMinScore ?? 130;
  if (status === 'exact_match' && score >= minScore) return 'high_confidence';
  if (status === 'exact_match' || status === 'probable_match') return 'manual_review';
  if (status === 'wrong_match')                     return 'wrong_match';
  if (status === 'no_match')                        return 'no_match';
  if (status === 'duplicate_contentid_conflict')    return 'duplicate_conflict';
  return 'manual_review';
}

// ── API 호출 컨텍스트 팩토리 ──────────────────────────────────────────────────
export function createCallContext(opts = {}) {
  const maxCalls    = opts.maxCalls    ?? 200;
  const delayMs     = opts.delayMs     ?? 500;
  const maxRetry    = opts.maxRetry    ?? 2;
  const tourKey     = opts.tourKey     ?? '';
  const dryRun      = opts.dryRun      ?? false;

  let callCount = 0;
  const callLog   = [];
  const cidCache  = new Map();
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function extractItems(data) {
    const nested = data?.response?.body?.items?.item;
    if (nested) return Array.isArray(nested) ? nested : [nested];
    const flat = data?.items?.item;
    if (flat) return Array.isArray(flat) ? flat : [flat];
    return [];
  }

  async function tourCall(endpoint, params, label, apiType, retry = 0) {
    if (callCount >= maxCalls) throw new Error('MAX_CALLS_REACHED');

    if (dryRun) {
      callCount++;
      console.log(`  [DRY-RUN ${callCount}/${maxCalls}] ${apiType} ← ${label}`);
      return null;
    }

    await sleep(delayMs);
    const url = new URL(`${TOURAPI_BASE}/${endpoint}`);
    url.searchParams.set('serviceKey', tourKey);
    url.searchParams.set('MobileOS', 'ETC');
    url.searchParams.set('MobileApp', 'KoreaMate');
    url.searchParams.set('_type', 'json');
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

    callCount++;
    const t0  = Date.now();
    const log = { seq: callCount, label, apiType, success: false, httpStatus: null, responseMs: 0, retries: retry, error: null };

    try {
      const res = await fetch(url.toString());
      log.httpStatus = res.status;
      log.responseMs = Date.now() - t0;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const rc = data?.response?.header?.resultCode ?? data?.resultCode;
      if (rc && rc !== '0000') throw new Error(`TourAPI ${rc}: ${data?.response?.header?.resultMsg ?? data?.resultMsg}`);
      log.success = true;
      callLog.push(log);
      console.log(`  [${callCount}/${maxCalls}] ${apiType} ← ${label}: OK (${log.responseMs}ms)`);
      return data;
    } catch (err) {
      log.error = err.message;
      log.responseMs = Date.now() - t0;
      if (retry < maxRetry && err.message !== 'MAX_CALLS_REACHED') {
        callLog.push({ ...log, retries: retry });
        console.warn(`  [${callCount}/${maxCalls}] ${apiType} ← ${label}: RETRY ${retry + 1}`);
        await sleep(1500 * (retry + 1));
        return tourCall(endpoint, params, label, apiType, retry + 1);
      }
      callLog.push(log);
      console.error(`  [${callCount}/${maxCalls}] ${apiType} ← ${label}: FAIL (${err.message})`);
      return null;
    }
  }

  async function sbGet(sbUrl, sbAnon, table, params) {
    if (dryRun) { console.log(`  [DRY-RUN] Supabase GET ${table}`); return []; }
    const url = new URL(`${sbUrl}/rest/v1/${table}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url.toString(), {
      headers: { apikey: sbAnon, Authorization: `Bearer ${sbAnon}` },
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    return res.json();
  }

  return {
    get callCount() { return callCount; },
    get callLog()   { return callLog; },
    cidCache,
    tourCall,
    sbGet,
    extractItems,
  };
}

// ── 중복 contentId 감지 (pilot.mjs와 동일) ────────────────────────────────────
export function detectDuplicateContentIds(results) {
  const cidMap = {};
  for (const r of results) {
    if (r.selectedContentId) {
      (cidMap[r.selectedContentId] = cidMap[r.selectedContentId] || []).push(r.id);
    }
  }
  for (const [cid, ids] of Object.entries(cidMap)) {
    if (ids.length > 1) {
      console.warn(`\n⚠ 중복 contentId ${cid}: ${ids.join(', ')}`);
      for (const r of results) {
        if (r.selectedContentId === cid) {
          r.matchStatus   = 'duplicate_contentid_conflict';
          r.confidence    = 'duplicate_conflict';
          r.reviewReasons = [...(r.reviewReasons || []), `contentId ${cid} 중복: ${ids.join(', ')}`];
        }
      }
    }
  }
}

// ── CSV ────────────────────────────────────────────────────────────────────────
export function escCsv(v) {
  const s = v == null ? '' : String(v).replace(/\r?\n/g, ' ');
  return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
}
export function toCsvRow(obj)    { return Object.values(obj).map(escCsv).join(','); }
export function toCsvHeader(obj) { return Object.keys(obj).join(','); }
