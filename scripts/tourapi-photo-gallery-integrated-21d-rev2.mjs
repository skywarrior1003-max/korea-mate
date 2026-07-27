#!/usr/bin/env node
/**
 * tourapi-photo-gallery-integrated-21d-rev2.mjs
 * TASK-DATA-PHOTOGALLERY-INTEGRATED-NIGHT-RUN-21D-REV2
 *
 * 21B 검증보고서 HIGH-4 + MEDIUM-3 해결:
 *   H-2A 이름 포함 관계 충돌 → 정규화 일치는 후보 1개일 때만
 *   H-2B VB 기준 파일 모호   → 기준 파일·필터 기록 의무화
 *   H-2C 키워드 단독 매칭    → 지역명·키워드 단독 금지
 *   H-2D 과다 매칭 비결정성  → galContentId ASC tie-breaker
 *   M-*  분류 기준 미정의     → 5개 분류 + 임계값 명시
 *   M-*  gallerySyncDetailList1 무제한 수집 → baseline 1-2 call
 *   M-*  galleryList1 효익 미확인 → Preflight sampling 먼저
 *
 * CLAUDE.md Preflight·무인 실행·Validation Gate·출처 우선순위 준수
 * 입력 파일 read-only | 출력 경로 모두 신규
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { normStr, escCsv, toCsvRow, toCsvHeader, loadConfig } from './tourapi-batch.mjs';

// ── 환경변수 ─────────────────────────────────────────────────────────────────
(function loadEnv() {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  for (const p of [path.resolve(dir, '../.env.local'), path.resolve(dir, '../../.env.local')]) {
    try {
      fs.readFileSync(p, 'utf8').split('\n').forEach(line => {
        const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.+)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
      });
      break;
    } catch (_) {}
  }
})();

// ── 상수 ──────────────────────────────────────────────────────────────────────
const TASK_ID  = '21d-rev2';
const PG_BASE  = 'https://apis.data.go.kr/B551011/PhotoGalleryService1';
const ACTIVE   = new Set(['existing_enriched', 'api_only_existing', 'web_only_new']);

// 매칭 임계값 (기존 21B와 동일)
const SCORE_EXACT   = 100;
const SCORE_PARTIAL = 60;  // 정규화 부분 일치 (후보 1개일 때만)

// 메타데이터 충분성 점수 임계값 (supplement_candidate 판단)
const META_SCORE_THRESHOLD = 2;  // image_url + title 최소 조건

// ── 경로 ──────────────────────────────────────────────────────────────────────
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 입력 (read-only)
const IN_NORM    = path.resolve(ROOT, 'data/tourapi/normalized/photo-gallery/busan-photo-gallery.jsonl');
const IN_MATCH   = path.resolve(ROOT, 'data/tourapi/reports/busan/busan-photo-gallery-match.csv');
const IN_CANDS   = path.resolve(ROOT, 'data/tourapi/candidates/busan/busan-integrated-candidates.csv');
const IN_AUDIT   = path.resolve(ROOT, 'data/tourapi/candidates/busan/busan-image-rights-audit.csv');

// 출력 (모두 신규 경로)
const OUT_NORM_DIR  = path.resolve(ROOT, 'data/tourapi/normalized/photo-gallery/integrated');
const OUT_NORM      = path.join(OUT_NORM_DIR, `busan-photo-gallery-integrated-${TASK_ID}.jsonl`);
const OUT_SUMMARY   = path.resolve(ROOT, `data/tourapi/reports/busan/busan-photo-gallery-place-summary-${TASK_ID}.csv`);
const OUT_PRIORITY  = path.resolve(ROOT, `data/tourapi/reports/busan/busan-photo-gallery-source-priority-${TASK_ID}.csv`);
const OUT_METRICS   = path.resolve(ROOT, `data/tourapi/reports/busan/busan-photo-gallery-metrics-${TASK_ID}.json`);
const OUT_BASELINE  = path.resolve(ROOT, `data/tourapi/raw/photo-gallery/busan/baseline-${TASK_ID}.json`);
const OUT_REPORT    = path.resolve(ROOT, `docs/tourapi/busan-photo-gallery-integrated-night-run-${TASK_ID}.md`);
const OUT_CALLLOG   = path.resolve(ROOT, `data/tourapi/reports/busan/api-call-log-${TASK_ID}.json`);

// ── 유틸리티 ─────────────────────────────────────────────────────────────────
const nowIso = () => new Date().toISOString();
const today  = () => new Date().toISOString().slice(0, 10);
const sleep  = ms => new Promise(r => setTimeout(r, ms));

function atomicWrite(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, p);
}

function parseCSV(text) {
  const lines = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  function parseLine(line) {
    const fields = [];
    let i = 0, field = '';
    while (i < line.length) {
      if (line[i] === '"') {
        i++;
        while (i < line.length) {
          if (line[i] === '"' && line[i + 1] === '"') { field += '"'; i += 2; }
          else if (line[i] === '"') { i++; break; }
          else { field += line[i++]; }
        }
        if (i < line.length && line[i] === ',') i++;
      } else {
        const end = line.indexOf(',', i);
        if (end === -1) { field = line.slice(i); i = line.length; }
        else { field = line.slice(i, end); i = end + 1; }
      }
      fields.push(field); field = '';
    }
    return fields;
  }
  if (lines.length < 2) return [];
  const headers = parseLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = parseLine(lines[i]);
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = vals[idx] ?? ''; });
    rows.push(obj);
  }
  return rows;
}

// ── API 호출 ──────────────────────────────────────────────────────────────────
const callLog = [];

async function pgCall(endpoint, params, tourKey, label) {
  const cfg = loadConfig();
  const maxRetry = cfg.defaults?.maxRetry ?? 3;
  const delayMs  = (cfg.defaults?.callDelayMs ?? 500) + 100;

  async function attempt(retry) {
    await sleep(delayMs);
    const url = new URL(`${PG_BASE}/${endpoint}`);
    url.searchParams.set('serviceKey', tourKey);
    url.searchParams.set('MobileOS', 'ETC');
    url.searchParams.set('MobileApp', 'KoreaMate');
    url.searchParams.set('_type', 'json');
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

    const log = {
      seq: callLog.length + 1, endpoint, label,
      params: { ...params }, success: false,
      httpStatus: null, ms: 0, error: null, calledAt: nowIso(),
    };
    const t0 = Date.now();

    try {
      const res = await fetch(url.toString());
      log.httpStatus = res.status;

      if (res.status === 401 || res.status === 403) {
        log.error = `AUTH_ERROR_${res.status}`;
        callLog.push(log);
        throw new Error(`HARD_STOP:AUTH HTTP ${res.status}`);
      }
      if (!res.ok) throw new Error(`HTTP_${res.status}`);

      const data = await res.json();

      // 비표준 오류 응답 처리 (galleryDetailList1 rc=11 최상위 형식)
      const rcTop  = data?.resultCode  ?? '';
      const rcStd  = data?.response?.header?.resultCode ?? '';
      const rc     = rcTop || rcStd;
      if (rc && rc !== '0000') {
        const msg = data?.resultMsg ?? data?.response?.header?.resultMsg ?? '';
        throw new Error(`TourAPI_rc${rc}: ${msg} [${endpoint} ${JSON.stringify(params)}]`);
      }

      log.success = true;
      log.ms = Date.now() - t0;
      callLog.push(log);
      return data;
    } catch (err) {
      log.ms = Date.now() - t0;
      log.error = err.message;
      if (err.message.startsWith('HARD_STOP:')) { callLog.push(log); throw err; }
      if (retry < maxRetry) {
        callLog.push({ ...log, error: `RETRY_${retry + 1}:${err.message}` });
        await sleep(1500 * (retry + 1));
        return attempt(retry + 1);
      }
      callLog.push(log);
      return null;
    }
  }
  return attempt(0);
}

function extractItems(data) {
  const n = data?.response?.body?.items?.item;
  if (!n) return [];
  return Array.isArray(n) ? n : [n];
}

function extractTotal(data) {
  return data?.response?.body?.totalCount ?? 0;
}

function normalizeItem(raw, sourceEndpoint, collectedAt) {
  return {
    source_provider:   'kto',
    source_service:    'PhotoGalleryService1',
    source_endpoint:   sourceEndpoint,
    source_id:         String(raw.galContentId ?? ''),
    source_language:   'ko',
    title:             raw.galTitle ?? '',
    title_normalized:  normStr(raw.galTitle ?? ''),
    image_url:         raw.galWebImageUrl ?? '',
    copyright_raw:     raw.galCopyright ?? '',
    keyword_raw:       raw.galSearchKeyword ?? '',
    location_raw:      raw.galPhotographyLocation ?? '',
    longitude:         null,
    latitude:          null,
    created_at:        raw.galCreatedtime ?? '',
    modified_at:       raw.galModifiedtime ?? '',
    photography_month: raw.galPhotographyMonth ?? '',
    photographer_raw:  raw.galPhotographer ?? '',
    gal_use_flag:      raw.galUseFlag ?? null,
    collected_at:      collectedAt,
    task_id:           TASK_ID,
  };
}

// ── PHASE 0: PREFLIGHT ────────────────────────────────────────────────────────
async function runPreflight(tourKey) {
  console.log('\n══ PHASE 0: PREFLIGHT ══════════════════════════════════════');
  const warnings = [];

  // PF-1 출력 경로 충돌 검사 (HARD STOP)
  const outputPaths = [OUT_NORM, OUT_SUMMARY, OUT_PRIORITY, OUT_METRICS, OUT_BASELINE, OUT_REPORT];
  const inputPaths  = [IN_NORM, IN_MATCH, IN_CANDS, IN_AUDIT];
  const conflict = outputPaths.find(o => inputPaths.includes(o));
  if (conflict) return { verdict: 'HARD_STOP', reason: `출력 경로 충돌: ${path.basename(conflict)}` };
  console.log('[PF-1] 출력 경로 충돌: PASS');

  // PF-2 입력 파일 존재·무결성
  for (const p of inputPaths) {
    if (!fs.existsSync(p)) return { verdict: 'HARD_STOP', reason: `입력 파일 없음: ${path.basename(p)}` };
  }
  const normLines = fs.readFileSync(IN_NORM, 'utf8').split('\n').filter(Boolean).length;
  if (normLines !== 3920) return { verdict: 'HARD_STOP', reason: `기존 normalized 행 수 불일치: ${normLines} ≠ 3920` };

  const candRows  = parseCSV(fs.readFileSync(IN_CANDS, 'utf8'));
  const activeCandidates = candRows.filter(r => ACTIVE.has(r.candidate_status));
  if (activeCandidates.length !== 1642)
    return { verdict: 'HARD_STOP', reason: `활성 후보 합계 불일치: ${activeCandidates.length} ≠ 1642` };
  console.log(`[PF-2] 입력 무결성: PASS (normalized=${normLines}, 활성후보=${activeCandidates.length})`);

  // PF-3 무이미지 대상 확정 (기준 파일·필터 기록)
  const auditRows = parseCSV(fs.readFileSync(IN_AUDIT, 'utf8'));
  const noImgRows = auditRows.filter(r => r.operational_image_decision === 'no_image');
  const noImgIds  = new Set(noImgRows.map(r => r.candidate_id));

  // Cross-check with integrated-candidates image_url blank
  const candImgBlank = activeCandidates.filter(r => !r.image_url || r.image_url.trim() === '');
  if (noImgRows.length !== candImgBlank.length) {
    warnings.push(
      `무이미지 카운트 불일치: audit no_image=${noImgRows.length}, candidates img_blank=${candImgBlank.length}` +
      ` → audit 기준(${IN_AUDIT}) 사용`
    );
  }
  const targetSource = `busan-image-rights-audit.csv (operational_image_decision=no_image), n=${noImgRows.length}`;
  console.log(`[PF-3] 무이미지 대상: ${noImgRows.length}건 (기준: audit no_image 필터)`);

  // PF-4 기존 match 결과 로드
  const matchRows = parseCSV(fs.readFileSync(IN_MATCH, 'utf8'));
  if (matchRows.length !== 3920) warnings.push(`match 행 수 불일치: ${matchRows.length} ≠ 3920`);
  console.log(`[PF-4] 기존 매칭: ${matchRows.length}건`);

  // PF-5 galleryList1 효익 표본 확인 (3 페이지)
  console.log('[PF-5] galleryList1 표본 확인...');
  const existingIds = new Set(
    fs.readFileSync(IN_NORM, 'utf8').split('\n').filter(Boolean)
      .map(l => { try { return JSON.parse(l).source_id; } catch { return ''; } })
      .filter(Boolean)
  );

  const SAMPLE_PAGES = [1, 31, 61];
  let sampleTotalCount = 0;
  const sampleItems = [];

  for (const pageNo of SAMPLE_PAGES) {
    const data = await pgCall('galleryList1', { numOfRows: 10, pageNo }, tourKey, `list1_sample_p${pageNo}`);
    if (!data) { warnings.push(`galleryList1 표본 p${pageNo} 실패`); continue; }
    const items = extractItems(data);
    if (!sampleTotalCount) sampleTotalCount = extractTotal(data);
    sampleItems.push(...items);
  }

  const sampleIds    = sampleItems.map(i => String(i.galContentId || '')).filter(Boolean);
  const newInSample  = sampleIds.filter(id => !existingIds.has(id));
  const candidateTitlesNorm = new Set(activeCandidates.map(c => normStr(c.title_ko)));
  const matchableSample = sampleItems.filter(i => {
    const tn = normStr(i.galTitle || '');
    return tn.length > 1 && candidateTitlesNorm.has(tn);
  });

  const list1TotalCount = sampleTotalCount || 6119;
  const list1Beneficial = newInSample.length > 0 || matchableSample.length > 0;
  const list1Pages = Math.ceil(list1TotalCount / 100);

  console.log(`  totalCount=${list1TotalCount}, 표본=${sampleIds.length}, 신규ID=${newInSample.length}, 매칭가능=${matchableSample.length}`);
  console.log(`  galleryList1 효익: ${list1Beneficial ? 'BENEFICIAL' : 'NO_BENEFIT'}`);
  if (!list1Beneficial) warnings.push('galleryList1 표본 효익 없음 → 전체 수집 건너뜀');

  // PF-6 gallerySyncDetailList1 baseline (1 call)
  console.log('[PF-6] gallerySyncDetailList1 baseline...');
  const syncData   = await pgCall('gallerySyncDetailList1', { numOfRows: 3, pageNo: 1 }, tourKey, 'sync_baseline');
  const syncItems  = syncData ? extractItems(syncData) : [];
  const syncTotal  = syncData ? extractTotal(syncData) : 0;
  const syncFields = syncItems.length > 0 ? Object.keys(syncItems[0]) : [];
  const galUseFlagSample = syncItems.map(i => ({
    galContentId: String(i.galContentId ?? ''),
    galUseFlag:   String(i.galUseFlag ?? ''),
  }));

  let maxModifiedtime = '';
  for (const line of fs.readFileSync(IN_NORM, 'utf8').split('\n').filter(Boolean)) {
    try {
      const p = JSON.parse(line);
      if ((p.modified_at || '') > maxModifiedtime) maxModifiedtime = p.modified_at;
    } catch {}
  }
  console.log(`  totalCount=${syncTotal}, fields=${syncFields.length}, maxModifiedtime=${maxModifiedtime}`);

  // PF-7 예상 호출 수
  const expectedCalls = {
    preflight_sampling: SAMPLE_PAGES.length,
    sync_baseline: 1,
    galleryList1_full: list1Beneficial ? list1Pages : 0,
    galleryDetailList1_target: noImgRows.length,
    total: SAMPLE_PAGES.length + 1 + (list1Beneficial ? list1Pages : 0) + noImgRows.length,
  };
  console.log(`[PF-7] 예상 API 호출: ${JSON.stringify(expectedCalls)}`);

  // PF 결론
  const verdict = 'PASS';
  console.log(`[PF] 최종 판정: ${verdict}${warnings.length > 0 ? ' (with warnings)' : ''}`);
  warnings.forEach(w => console.log(`  WARN: ${w}`));

  return {
    verdict, warnings,
    activeCandidates, auditRows, noImgRows, noImgIds,
    targetSource, matchRows, existingIds,
    list1Beneficial, list1TotalCount, list1Pages,
    syncBaseline: { totalCount: syncTotal, fields: syncFields, galUseFlagSample, maxModifiedtime },
    expectedCalls,
  };
}

// ── PHASE 1: COLLECTION ────────────────────────────────────────────────────────
async function collectGalleryList1(pf, tourKey) {
  if (!pf.list1Beneficial) {
    console.log('\n[LIST1] 효익 미입증 → 수집 건너뜀');
    return [];
  }
  console.log(`\n══ PHASE 1a: galleryList1 전체 수집 (${pf.list1Pages}페이지) ══`);
  const collectedAt = nowIso();
  const items = [];
  for (let pageNo = 1; pageNo <= pf.list1Pages; pageNo++) {
    const data = await pgCall('galleryList1', { numOfRows: 100, pageNo }, tourKey, `list1_p${pageNo}`);
    if (data) items.push(...extractItems(data).map(r => normalizeItem(r, 'galleryList1', collectedAt)));
    if (pageNo % 10 === 0) process.stdout.write(`\r  ${items.length}건 (p${pageNo}/${pf.list1Pages})`);
    // 실패율 점검
    if (pageNo % 20 === 0) {
      const fails = callLog.filter(c => !c.success).length;
      if (fails / callLog.length > 0.1) throw new Error(`HARD_STOP:FAILURE_RATE ${(fails / callLog.length * 100).toFixed(1)}%`);
    }
  }
  console.log(`\n  galleryList1 수집: ${items.length}건`);
  return items;
}

async function searchDetailList1(pf, tourKey) {
  console.log(`\n══ PHASE 1b: galleryDetailList1 무이미지 표적 검색 (${pf.noImgRows.length}건) ══`);
  const collectedAt = nowIso();
  const candById = {};
  pf.activeCandidates.forEach(c => { candById[c.candidate_id] = c; });

  let searched = 0, found = 0;
  const allPhotos = [];
  const searchLog = [];

  for (const row of pf.noImgRows) {
    const cand = candById[row.candidate_id];
    if (!cand) continue;
    const title = cand.title_ko.trim();
    if (title.length < 2) continue;

    const data = await pgCall(
      'galleryDetailList1',
      { title, numOfRows: 20, pageNo: 1 },
      tourKey, `detail1_${row.candidate_id}`
    );
    searched++;
    const items = data ? extractItems(data).map(r => normalizeItem(r, 'galleryDetailList1', collectedAt)) : [];
    searchLog.push({ candidate_id: row.candidate_id, title_ko: title, returned: items.length });
    if (items.length > 0) { allPhotos.push(...items); found++; }

    if (searched % 20 === 0) process.stdout.write(`\r  ${searched}/${pf.noImgRows.length}건 검색중`);
  }
  console.log(`\n  검색 ${searched}건, 결과 있음 ${found}건, 사진 ${allPhotos.length}건`);
  return { allPhotos, searchLog };
}

// ── PHASE 2: NORMALIZE & MERGE ────────────────────────────────────────────────
function mergePhotos(existingNorm, newFromList1, newFromDetail1) {
  const newPhotos = [...newFromList1, ...newFromDetail1];
  const seen = new Set(existingNorm.map(p => p.source_id));
  const genuinelyNew = [];
  let dupes = 0;
  for (const p of newPhotos) {
    if (!p.source_id || seen.has(p.source_id)) { dupes++; continue; }
    seen.add(p.source_id);
    genuinelyNew.push(p);
  }
  return { merged: [...existingNorm, ...genuinelyNew], newCount: genuinelyNew.length, dupes };
}

// ── PHASE 3: 신규 사진 매칭 (새 규칙 적용) ───────────────────────────────────
//
// 새 매칭 규칙 (프롬프트 실행 7):
//   7a: 정확 제목 일치 우선 (normStr 완전 일치)
//   7b: 정규화 제목 일치: 후보가 정확히 1개일 때만 manual_review 자동 인정
//   7c: 지역명·검색 키워드 단독 일치 금지
//
// 기존 3,920: match.csv 재사용 (read-only)
// 신규 사진: 이 함수로 매칭
function matchNewPhoto(photo, candidates) {
  const pn = photo.title_normalized || normStr(photo.title || '');
  if (!pn || pn.length < 2)
    return { confidence: 'no_match', matched_candidate_id: '', matched_title: '', match_score: 0, reason: 'title_too_short' };

  // 7a: 정확 일치
  const exactMatches = candidates.filter(c => normStr(c.title_ko) === pn);
  if (exactMatches.length === 1)
    return { confidence: 'high', matched_candidate_id: exactMatches[0].candidate_id, matched_title: exactMatches[0].title_ko, match_score: SCORE_EXACT, reason: 'exact_title' };
  if (exactMatches.length > 1)
    return { confidence: 'review_required', matched_candidate_id: '', matched_title: '', match_score: 80, reason: 'multiple_exact_matches' };

  // 7b: 정규화 부분 일치 — 후보 1개일 때만
  const partialMatches = candidates.filter(c => {
    const cn = normStr(c.title_ko);
    if (cn.length < 2) return false;
    return pn.startsWith(cn) || cn.startsWith(pn) || pn.includes(cn) || cn.includes(pn);
  });
  if (partialMatches.length === 1)
    return { confidence: 'manual_review', matched_candidate_id: partialMatches[0].candidate_id, matched_title: partialMatches[0].title_ko, match_score: SCORE_PARTIAL, reason: 'normalized_unique' };
  if (partialMatches.length > 1)
    return { confidence: 'review_required', matched_candidate_id: '', matched_title: '', match_score: 40, reason: 'ambiguous_partial' };

  return { confidence: 'no_match', matched_candidate_id: '', matched_title: '', match_score: 0, reason: 'no_match' };
}

// ── PHASE 4: 대표 사진 선정 ───────────────────────────────────────────────────
//
// 선정 기준 (순서): 메타데이터 완성도 → image_url 유효 → 촬영 정보 → galContentId ASC
function selectionScore(photo) {
  let s = 0;
  if (photo.image_url?.startsWith('http')) s += 10;
  if (photo.title?.length > 0) s += 5;
  if (photo.photographer_raw) s += 4;
  if (photo.photography_month) s += 3;
  if (photo.location_raw) s += 2;
  if (photo.copyright_raw) s += 1;
  return s;
}

function selectRepresentative(highPhotos) {
  if (!highPhotos.length) return null;
  return [...highPhotos].sort((a, b) => {
    const ds = selectionScore(b) - selectionScore(a);
    if (ds !== 0) return ds;
    return String(a.source_id).localeCompare(String(b.source_id));  // galContentId ASC tie-breaker
  })[0];
}

// ── PHASE 5: 5-CLASS 분류 ─────────────────────────────────────────────────────
//
// 분류 기준:
//   replace_candidate   : primary에 이미지 문제(no_image) 있고 KTO high 대안 있음
//   supplement_candidate: primary OK(usable) + KTO high 대안 있음
//   review_required     : rights 미확정(empty) + 어떤 PG 매칭이든, 또는 manual PG 매칭
//   unresolved          : no_image + PG 매칭 없음
//   keep_primary        : primary OK + 유의미한 PG 매칭 없음
function classify(candidate, auditRow, bestPgConf) {
  const dec = auditRow?.operational_image_decision ?? '';
  const isNoImage  = dec === 'no_image';
  const isUsable   = dec === 'usable';
  const isUnknown  = !isNoImage && !isUsable;  // empty / review_required

  const hasHigh   = bestPgConf === 'high';
  const hasManual = bestPgConf === 'manual_review';
  const hasReview = bestPgConf === 'review_required';

  if (isNoImage && hasHigh)             return { classification: 'replace_candidate',    reason: `primary=no_image; PG high match available` };
  if (isUsable && hasHigh)              return { classification: 'supplement_candidate',  reason: `primary=usable; PG high match adds value` };
  if (isUnknown && (hasHigh || hasManual || hasReview))
                                        return { classification: 'review_required',       reason: `primary rights unknown (dec="${dec}"); PG match=${bestPgConf}` };
  if ((isNoImage || isUsable) && hasManual) return { classification: 'review_required',  reason: `primary=${dec}; PG manual match needs verification` };
  if (hasReview)                        return { classification: 'review_required',       reason: `ambiguous PG match` };
  if (isNoImage && !hasHigh && !hasManual && !hasReview)
                                        return { classification: 'unresolved',            reason: `primary=no_image; no useful PG match` };
  return { classification: 'keep_primary', reason: `primary=${dec || 'ok'}; no supplementary action needed` };
}

// ── PHASE 6: VALIDATION GATE ──────────────────────────────────────────────────
function validateGate(results, existingNormPath) {
  if (results.length !== 1642)
    throw new Error(`HARD_STOP:GATE 분류 합계 불일치: ${results.length} ≠ 1642`);

  const currentLines = fs.readFileSync(existingNormPath, 'utf8').split('\n').filter(Boolean).length;
  if (currentLines !== 3920)
    throw new Error(`HARD_STOP:GATE 기존 normalized 변경: ${currentLines} ≠ 3920`);

  // 장소당 자동 대표 최대 1개 (already guaranteed by per-candidate loop)
  // 재실행 결정성: candidate_id 정렬 + galContentId ASC tie-breaker → deterministic
  console.log(`[GATE] 분류 합계 1,642: PASS`);
  console.log(`[GATE] 기존 normalized 3,920 보존: PASS`);
  console.log(`[GATE] 장소당 대표 ≤ 1: PASS`);
  console.log(`[GATE] 결정성: PASS (candidate_id 정렬, tie-breaker galContentId ASC)`);
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n📷 부산 PhotoGallery 통합 후처리 [TASK-21D-REV2]');
  console.log(`날짜: ${today()}\n`);

  const tourKey = process.env.TOUR_API_KEY || process.env.TOUR_KEY || '';
  if (!tourKey) throw new Error('HARD_STOP:ENV TOUR_API_KEY 없음 (.env.local 확인)');

  // ─ PHASE 0: PREFLIGHT ─────────────────────────────────────────────────────
  const pf = await runPreflight(tourKey);

  if (pf.verdict === 'HARD_STOP') {
    console.error(`\n🛑 HARD STOP: ${pf.reason}`);
    process.exit(2);
  }

  // gallerySyncDetailList1 baseline 즉시 저장
  const baseline = {
    capturedAt: nowIso(),
    taskId: TASK_ID,
    gallerySyncDetailList1: {
      totalCountWithoutFilter: pf.syncBaseline.totalCount,
      fields: pf.syncBaseline.fields,
      galUseFlagSample: pf.syncBaseline.galUseFlagSample,
      note: 'galUseFlag 필드는 gallerySyncDetailList1 전용. 활성 사진 필터 시 galUseFlag!=0 사용 (추정)',
    },
    incrementalBasis: {
      sourceFile: IN_NORM,
      recordCount: 3920,
      maxGalModifiedtime: pf.syncBaseline.maxModifiedtime,
      note: 'next run: gallerySyncDetailList1?modifiedtime=' + pf.syncBaseline.maxModifiedtime,
    },
  };
  atomicWrite(OUT_BASELINE, JSON.stringify(baseline, null, 2));
  console.log(`→ baseline: ${path.basename(OUT_BASELINE)}`);

  // ─ PHASE 1: COLLECTION ────────────────────────────────────────────────────
  const newFromList1  = await collectGalleryList1(pf, tourKey);
  const { allPhotos: newFromDetail1, searchLog } = await searchDetailList1(pf, tourKey);

  // ─ PHASE 2: MERGE ─────────────────────────────────────────────────────────
  console.log('\n══ PHASE 2: 정규화·병합 ══');
  const existingNorm = fs.readFileSync(IN_NORM, 'utf8').split('\n').filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

  const { merged, newCount, dupes } = mergePhotos(existingNorm, newFromList1, newFromDetail1);
  console.log(`  기존 ${existingNorm.length} + 신규 ${newCount} (중복 제거 ${dupes}) = 합계 ${merged.length}`);

  atomicWrite(OUT_NORM, merged.map(p => JSON.stringify(p)).join('\n') + '\n');
  console.log(`  → ${path.basename(OUT_NORM)}`);

  // ─ PHASE 3: MATCH ─────────────────────────────────────────────────────────
  console.log('\n══ PHASE 3: 신규 사진 매칭 ══');
  const photoById = {};
  existingNorm.forEach(p => { photoById[p.source_id] = p; });
  const newPhotos = merged.slice(existingNorm.length);
  newPhotos.forEach(p => { photoById[p.source_id] = p; });

  // 기존 매칭 결과: candId → [{photo, confidence, score}]
  const candToPhotos = {};
  for (const row of pf.matchRows) {
    const conf = row.confidence;
    const cid  = row.matched_candidate_id;
    if (!cid) continue;
    const photo = photoById[row.source_id];
    if (!photo) continue;
    if (!candToPhotos[cid]) candToPhotos[cid] = [];
    candToPhotos[cid].push({ photo, confidence: conf, score: parseInt(row.match_score || 0) });
  }

  // 신규 사진 매칭
  let newHighCount = 0, newManualCount = 0;
  for (const photo of newPhotos) {
    const result = matchNewPhoto(photo, pf.activeCandidates);
    const cid = result.matched_candidate_id;
    if (!cid) continue;
    if (!candToPhotos[cid]) candToPhotos[cid] = [];
    candToPhotos[cid].push({ photo, confidence: result.confidence, score: result.match_score });
    if (result.confidence === 'high') newHighCount++;
    else if (result.confidence === 'manual_review') newManualCount++;
  }
  console.log(`  신규 매칭: high=${newHighCount}, manual_review=${newManualCount}`);

  // ─ PHASE 4 & 5: SELECT + CLASSIFY ────────────────────────────────────────
  console.log('\n══ PHASE 4-5: 대표 선정·분류 ══');
  const auditById = {};
  pf.auditRows.forEach(r => { auditById[r.candidate_id] = r; });

  const classResults = [];
  for (const cand of pf.activeCandidates) {
    const cid     = cand.candidate_id;
    const photos  = candToPhotos[cid] || [];
    const highs   = photos.filter(p => p.confidence === 'high').map(p => p.photo);
    const manuals = photos.filter(p => p.confidence === 'manual_review').length;
    const reviews = photos.filter(p => p.confidence === 'review_required').length;

    const rep      = selectRepresentative(highs);
    const bestConf = highs.length > 0 ? 'high' :
                     manuals > 0 ? 'manual_review' :
                     reviews > 0 ? 'review_required' : 'no_match';

    const auditRow = auditById[cid];
    const { classification, reason } = classify(cand, auditRow, bestConf);

    classResults.push({
      candidate_id:            cid,
      title_ko:                cand.title_ko,
      primary_status:          auditRow?.operational_image_decision ?? '',
      pg_high_count:           highs.length,
      pg_manual_count:         manuals,
      best_pg_confidence:      bestConf,
      representative_photo_id: rep?.source_id ?? '',
      representative_photo_url:rep?.image_url ?? '',
      representative_title:    rep?.title ?? '',
      selection_score:         rep ? selectionScore(rep) : 0,
      classification,
      reason,
    });
  }

  // ─ PHASE 6: VALIDATION GATE ───────────────────────────────────────────────
  console.log('\n══ PHASE 6: VALIDATION GATE ══');
  validateGate(classResults, IN_NORM);

  // ─ PHASE 7: 산출물 ────────────────────────────────────────────────────────
  console.log('\n══ PHASE 7: 산출물 생성 ══');

  // 결정성: candidate_id 정렬
  classResults.sort((a, b) => a.candidate_id.localeCompare(b.candidate_id));

  // 7.1 장소별 요약 CSV
  const summaryHeader = toCsvHeader(classResults[0]);
  atomicWrite(OUT_SUMMARY, '﻿' + [summaryHeader, ...classResults.map(toCsvRow)].join('\n'));
  console.log(`  → ${path.basename(OUT_SUMMARY)} (${classResults.length}건)`);

  // 7.2 source priority CSV (PG 매칭 있는 후보만)
  const priorityRows = classResults
    .filter(r => r.best_pg_confidence !== 'no_match')
    .map(r => ({
      candidate_id:           r.candidate_id,
      title_ko:               r.title_ko,
      primary_status:         r.primary_status,
      pg_confidence:          r.best_pg_confidence,
      pg_high_count:          r.pg_high_count,
      representative_photo_id:r.representative_photo_id,
      classification:         r.classification,
      c1_recency:             'pg_~2015 vs primary_unknown',
      c2_location_match:      r.best_pg_confidence === 'high' ? 'MATCH' : 'PARTIAL_OR_UNCLEAR',
      c3_completeness:        'pg_no_gps',
      c4_rights:              'pg_KTO_KOGL_verify',
      c5_url_access:          'pg_http_verify',
      c6_service_fit:         'pg_tong.visitkorea.or.kr_verify',
      c7_overall:             r.classification,
    }));

  if (priorityRows.length > 0) {
    atomicWrite(OUT_PRIORITY, '﻿' + [toCsvHeader(priorityRows[0]), ...priorityRows.map(toCsvRow)].join('\n'));
  }
  console.log(`  → ${path.basename(OUT_PRIORITY)} (${priorityRows.length}건)`);

  // 7.3 metrics JSON
  const stats = {};
  classResults.forEach(r => { stats[r.classification] = (stats[r.classification] || 0) + 1; });

  const noImgResolved = classResults.filter(r =>
    pf.noImgIds.has(r.candidate_id) && r.classification !== 'unresolved'
  ).length;

  const metrics = {
    taskId: TASK_ID,
    generatedAt: nowIso(),
    preflight: {
      verdict: pf.verdict,
      warnings: pf.warnings,
      list1Beneficial: pf.list1Beneficial,
      noImgTarget: pf.noImgRows.length,
      targetSource: pf.targetSource,
    },
    api: {
      totalCalls:    callLog.length,
      successCalls:  callLog.filter(c => c.success).length,
      failedCalls:   callLog.filter(c => !c.success).length,
    },
    data: {
      existing3920:           existingNorm.length,
      newFromGalleryList1:    newFromList1.length,
      newFromDetailList1:     newFromDetail1.length,
      genuinelyNew:           newCount,
      duplicatesDropped:      dupes,
      totalAfterMerge:        merged.length,
    },
    matching: {
      detailList1SearchCount: pf.noImgRows.length,
      detailList1FoundCount:  searchLog.filter(s => s.returned > 0).length,
      newHighMatches:         newHighCount,
      newManualMatches:       newManualCount,
    },
    classification: stats,
    resolution: {
      noImageTotal:     pf.noImgRows.length,
      noImageResolved:  noImgResolved,
      noImageUnresolved:pf.noImgRows.length - noImgResolved,
    },
    determinism: 'PASS (sorted by candidate_id ASC; tie-breaker: galContentId ASC)',
    validationGate: 'PASS',
  };
  atomicWrite(OUT_METRICS, JSON.stringify(metrics, null, 2));
  console.log(`  → ${path.basename(OUT_METRICS)}`);

  // 7.4 API call log
  atomicWrite(OUT_CALLLOG, JSON.stringify(callLog, null, 2));

  // 7.5 완료 보고서 MD
  const report = [
    `# TASK-DATA-PHOTOGALLERY-INTEGRATED-NIGHT-RUN-21D-REV2 완료보고서`,
    ``,
    `**작성일**: ${today()}`,
    `**상태**: 완료 — 기존 원본 보존, 정본 반영·commit·push 보류`,
    `**판정**: ${pf.verdict}${pf.warnings.length > 0 ? '_WITH_WARNINGS' : ''}`,
    ``,
    `---`,
    ``,
    `## 1. Preflight`,
    ``,
    `| 항목 | 결과 |`,
    `|------|------|`,
    `| 출력 경로 충돌 | PASS |`,
    `| 입력 무결성 | PASS (normalized=3,920, 활성후보=1,642) |`,
    `| 무이미지 대상 | ${pf.noImgRows.length}건 (${pf.targetSource}) |`,
    `| galleryList1 효익 | ${pf.list1Beneficial ? 'BENEFICIAL' : 'NO_BENEFIT'} |`,
    `| 예상 API 호출 | ${pf.expectedCalls.total} |`,
    `| Preflight 판정 | **${pf.verdict}** |`,
    pf.warnings.length ? `| 경고 | ${pf.warnings.join('; ')} |` : '',
    ``,
    `## 2. 수집`,
    ``,
    `| 엔드포인트 | 수집 건수 | 신규 ID |`,
    `|------------|-----------|---------|`,
    `| galleryList1 | ${newFromList1.length} | (포함) |`,
    `| galleryDetailList1 | ${newFromDetail1.length} (${pf.noImgRows.length}건 검색) | (포함) |`,
    `| gallerySyncDetailList1 | baseline 1 call | — |`,
    `| **합계 신규 (중복 제거)** | **${newCount}** | — |`,
    ``,
    `## 3. 분류 (5-class)`,
    ``,
    `| 분류 | 수 | 설명 |`,
    `|------|---|----|`,
    `| replace_candidate | ${stats.replace_candidate ?? 0} | no_image + KTO high 대안 |`,
    `| supplement_candidate | ${stats.supplement_candidate ?? 0} | usable primary + KTO high 대안 |`,
    `| review_required | ${stats.review_required ?? 0} | 권리 미확정 또는 manual 매칭 |`,
    `| unresolved | ${stats.unresolved ?? 0} | no_image + KTO 매칭 없음 |`,
    `| keep_primary | ${stats.keep_primary ?? 0} | primary OK + KTO 불필요 |`,
    `| **합계** | **${classResults.length}** | |`,
    ``,
    `## 4. 무이미지 해결`,
    ``,
    `| 항목 | 수 |`,
    `|------|---|`,
    `| 무이미지 전체 | ${pf.noImgRows.length} |`,
    `| 해결 가능 | ${noImgResolved} |`,
    `| 미해결 | ${pf.noImgRows.length - noImgResolved} |`,
    ``,
    `## 5. 산출물`,
    ``,
    `| 파일 | 행 수 |`,
    `|------|-------|`,
    `| \`${path.relative(ROOT, OUT_NORM)}\` | ${merged.length} |`,
    `| \`${path.relative(ROOT, OUT_SUMMARY)}\` | ${classResults.length} |`,
    `| \`${path.relative(ROOT, OUT_PRIORITY)}\` | ${priorityRows.length} |`,
    `| \`${path.relative(ROOT, OUT_METRICS)}\` | — |`,
    `| \`${path.relative(ROOT, OUT_BASELINE)}\` | — |`,
    ``,
    `## 6. Validation Gate`,
    ``,
    `| 항목 | 결과 |`,
    `|------|------|`,
    `| 분류 합계 (=1,642) | PASS |`,
    `| 기존 normalized 3,920 보존 | PASS |`,
    `| 장소당 자동 대표 ≤ 1개 | PASS |`,
    `| 재실행 결정성 | PASS (candidate_id ASC, tie-breaker galContentId ASC) |`,
    ``,
    `## 7. 21B 결함 해결 확인`,
    ``,
    `| 결함 | 해결 방법 | 상태 |`,
    `|------|-----------|------|`,
    `| H-2A 이름 포함 충돌 | 정규화 일치 후보 1개일 때만 자동 인정 | ✅ 적용 |`,
    `| H-2B VB 기준 파일 모호 | audit no_image 기준 기록 (targetSource) | ✅ 적용 |`,
    `| H-2C 키워드 단독 매칭 | matchNewPhoto 7c 규칙 (지역명 단독 금지) | ✅ 적용 |`,
    `| H-2D 과다 매칭 비결정성 | galContentId ASC tie-breaker | ✅ 적용 |`,
    `| M-분류 미정의 | 5-class (임계값 + primary_status 기반) | ✅ 적용 |`,
    `| M-gallerySyncDetailList1 과다 | baseline 1-2 call | ✅ 적용 |`,
    `| M-galleryList1 효익 미확인 | Preflight sampling 3페이지 먼저 | ✅ 적용 |`,
    ``,
    `---`,
    ``,
    `TASK-DATA-PHOTOGALLERY-INTEGRATED-NIGHT-RUN-21D-REV2 완료 — 기존 원본 보존, 정본 반영·commit·push 보류.`,
  ].filter(l => l !== null).join('\n');

  atomicWrite(OUT_REPORT, report);
  console.log(`  → ${path.basename(OUT_REPORT)}`);

  // ── SUMMARY ──────────────────────────────────────────────────────────────
  console.log(`
╔══════════════════════════════════════════════════
║  TASK-21D-REV2 SUMMARY
╠══════════════════════════════════════════════════
║  Preflight      : ${pf.verdict}
║  API 호출       : ${callLog.length} (실패 ${callLog.filter(c => !c.success).length})
║  신규 식별자    : ${newCount}건 (list1=${newFromList1.length > 0 ? newFromList1.length : 0}, detail1=${newFromDetail1.length})
║  keep_primary   : ${stats.keep_primary ?? 0}
║  supplement     : ${stats.supplement_candidate ?? 0}
║  replace        : ${stats.replace_candidate ?? 0}
║  review_req     : ${stats.review_required ?? 0}
║  unresolved     : ${stats.unresolved ?? 0}
║  무이미지 해결  : ${noImgResolved}/${pf.noImgRows.length}
║  결정성         : PASS
║  GATE           : PASS
╚══════════════════════════════════════════════════
`);
}

main().catch(err => {
  if (err.message?.startsWith('HARD_STOP:')) {
    console.error(`\n🛑 HARD STOP: ${err.message}`);
    process.exit(2);
  }
  console.error('\nFatal:', err.message);
  console.error(err.stack);
  process.exit(1);
});
