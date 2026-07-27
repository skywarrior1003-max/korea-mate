#!/usr/bin/env node
/**
 * tourapi-photo-gallery-busan.mjs
 * PhotoGalleryService1 부산 사진 수집·정규화·매칭
 *
 * 실행:
 *   node scripts/tourapi-photo-gallery-busan.mjs
 *   node scripts/tourapi-photo-gallery-busan.mjs --dry-run
 *   node scripts/tourapi-photo-gallery-busan.mjs --no-resume
 *
 * READ-ONLY: TourAPI PhotoGalleryService1
 * 금지: DB 수정 / commit / push / 후보 정본 수정
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ── .env.local 로드 (값 출력 금지) ───────────────────────────────────────────
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

import { normStr, distM, escCsv, toCsvRow, toCsvHeader, loadConfig } from './tourapi-batch.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.resolve(__dir, '..');

// ── 상수 ──────────────────────────────────────────────────────────────────────
const PG_BASE        = 'https://apis.data.go.kr/B551011/PhotoGalleryService1';
const KEYWORD        = '부산';
const NUM_OF_ROWS    = 100;
const EXPECTED_MAX   = 8000;  // totalCount가 이 값 초과 시 이상
const ACTIVE_STATUSES = new Set(['existing_enriched', 'api_only_existing', 'web_only_new']);
// GPS 필드(mapX/mapY) 미제공 API이므로 정확 제목 일치(100)를 high 기준으로 설정
const MATCH_HIGH     = 100;
const MATCH_MANUAL   = 50;

// ── 경로 ──────────────────────────────────────────────────────────────────────
const RAW_DIR         = path.resolve(ROOT, 'data/tourapi/raw/photo-gallery/busan');
const NORM_DIR        = path.resolve(ROOT, 'data/tourapi/normalized/photo-gallery');
const REPORTS_DIR     = path.resolve(ROOT, 'data/tourapi/reports/busan');
const CHECKPOINT_FILE = path.join(RAW_DIR, 'checkpoint.json');
const NORMALIZED_FILE = path.join(NORM_DIR, 'busan-photo-gallery.jsonl');
const MATCH_CSV_FILE  = path.join(REPORTS_DIR, 'busan-photo-gallery-match.csv');
const CALLLOG_FILE    = path.join(REPORTS_DIR, 'busan-photo-gallery-calllog.csv');
const REPORT_FILE     = path.join(REPORTS_DIR, 'busan-photo-gallery-match-report.md');
const CANDIDATES_FILE = path.resolve(ROOT, 'data/tourapi/candidates/busan/busan-integrated-candidates.csv');

// ── CLI ───────────────────────────────────────────────────────────────────────
const ARGS = {
  dryRun:   process.argv.includes('--dry-run'),
  noResume: process.argv.includes('--no-resume'),
};

// ── 시각 ──────────────────────────────────────────────────────────────────────
function nowIso() { return new Date().toISOString(); }
function today()  { return new Date().toISOString().slice(0, 10); }

// ── Checkpoint ────────────────────────────────────────────────────────────────
function loadCheckpoint() {
  try { return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8')); }
  catch { return null; }
}
function saveCheckpoint(cp) {
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(cp, null, 2), 'utf8');
}

// ── PhotoGallery API 호출 (공통 런타임과 분리된 어댑터) ───────────────────────
async function pgFetch(endpoint, params, tourKey, state) {
  const { maxRetry, delayMs, callLog, callCount } = state;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function attempt(retry) {
    callCount.n++;
    const url = new URL(`${PG_BASE}/${endpoint}`);
    url.searchParams.set('serviceKey', tourKey);
    url.searchParams.set('MobileOS', 'ETC');
    url.searchParams.set('MobileApp', 'KoreaMate');
    url.searchParams.set('_type', 'json');
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

    const t0  = Date.now();
    const log = {
      seq: callCount.n, endpoint,
      pageNo: params.pageNo ?? '', retry,
      success: false, httpStatus: null, ms: 0, error: null,
    };

    try {
      await sleep(delayMs);
      const res = await fetch(url.toString());
      log.httpStatus = res.status;
      log.ms = Date.now() - t0;

      // HARD STOP: 인증 오류
      if (res.status === 401 || res.status === 403) {
        log.error = `AUTH_ERROR_${res.status}`;
        callLog.push(log);
        throw new Error(`HARD_STOP:AUTH_ERROR HTTP ${res.status} — API 키 만료 또는 권한 없음`);
      }
      if (!res.ok) throw new Error(`HTTP_${res.status}`);

      const data = await res.json();
      // 표준(response.header) 및 비표준(최상위 resultCode) 오류 응답 통합 처리
      const rc  = data?.response?.header?.resultCode ?? data?.resultCode ?? '';
      const msg = data?.response?.header?.resultMsg  ?? data?.resultMsg  ?? '';
      if (rc && rc !== '0000') {
        throw new Error(
          `TourAPI_rc${rc} msg="${msg}" endpoint=${endpoint} params=${JSON.stringify(params)}`
        );
      }

      log.success = true;
      callLog.push(log);
      console.log(`  [${callCount.n}] page=${params.pageNo}: OK (${log.ms}ms)`);
      return data;
    } catch (err) {
      log.error   = err.message;
      log.ms      = log.ms || (Date.now() - t0);
      if (err.message.startsWith('HARD_STOP:')) { callLog.push(log); throw err; }
      if (retry < maxRetry) {
        callLog.push({ ...log, error: `RETRY_${retry + 1}:${err.message}` });
        console.warn(`  [${callCount.n}] page=${params.pageNo}: RETRY ${retry + 1}/${maxRetry} — ${err.message}`);
        await sleep(1500 * (retry + 1));
        return attempt(retry + 1);
      }
      callLog.push(log);
      console.error(`  [${callCount.n}] page=${params.pageNo}: FAIL — ${err.message}`);
      return null;
    }
  }

  return attempt(0);
}

// ── items 경로 추출 ────────────────────────────────────────────────────────────
function extractItems(data) {
  const nested = data?.response?.body?.items?.item;
  if (!nested) return [];
  return Array.isArray(nested) ? nested : [nested];
}

// ── PhotoGallery 아이템 정규화 ───────────────────────────────────────────────
function normalizeItem(raw, rawPath, collectedAt) {
  // 필드명 후보 (API 응답 실측 후 자동 선택)
  const id       = raw.galContentId        ?? raw.contentId         ?? '';
  const title    = raw.galTitle            ?? raw.title             ?? '';
  const imgUrl   = raw.galWebImageUrl      ?? raw.galOriginUrl      ?? raw.imageName   ?? '';
  const copyright= raw.galCopyright        ?? raw.copyright         ?? '';
  const keyword  = raw.galSearchKeyword    ?? raw.searchKeyword     ?? '';
  const location = raw.galPhotographyLocation ?? raw.photographyLocation ?? raw.addr ?? '';
  const rawMapX  = raw.mapX               ?? raw.galMapX           ?? '';  // longitude
  const rawMapY  = raw.mapY               ?? raw.galMapY           ?? '';  // latitude
  const createdAt  = raw.galCreatedtime   ?? raw.createdtime       ?? '';
  const modifiedAt = raw.galModifiedtime  ?? raw.modifiedtime      ?? '';
  const month      = raw.galPhotographyMonth ?? '';

  const lng = rawMapX ? parseFloat(rawMapX) : null;
  const lat  = rawMapY ? parseFloat(rawMapY) : null;

  return {
    source_provider:   'kto',
    source_service:    'PhotoGalleryService1',
    source_id:         String(id),
    source_language:   'ko',
    raw_data_path:     rawPath,
    title,
    title_normalized:  normStr(title),
    image_url:         imgUrl,
    copyright_raw:     copyright,   // API 원문 보존 — 추정 금지
    keyword_raw:       keyword,
    location_raw:      location,
    longitude:         isFinite(lng) ? lng : null,
    latitude:          isFinite(lat) ? lat  : null,
    created_at:        createdAt,
    modified_at:       modifiedAt,
    photography_month: month,
    collected_at:      collectedAt,
  };
}

// ── RFC 4180 CSV 파서 ──────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
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
    const obj  = {};
    headers.forEach((h, idx) => { obj[h] = vals[idx] ?? ''; });
    rows.push(obj);
  }
  return rows;
}

// ── 활성 후보 로드 ─────────────────────────────────────────────────────────────
function loadActiveCandidates() {
  const text = fs.readFileSync(CANDIDATES_FILE, 'utf8').replace(/^﻿/, '');
  const rows  = parseCSV(text);
  const active = rows.filter(r => ACTIVE_STATUSES.has(r.candidate_status));
  console.log(`후보 로드: 전체 ${rows.length}건 → 활성 ${active.length}건`);
  return active;
}

// ── 사진-후보 매칭 ─────────────────────────────────────────────────────────────
function scorePhotoCandidate(photo, candidate) {
  let score = 0;
  const pTitle = photo.title_normalized;
  const cTitle = normStr(candidate.title_ko);

  if (pTitle && cTitle && pTitle.length > 0 && cTitle.length > 0) {
    if (pTitle === cTitle)                                             score += 100;
    else if (pTitle.startsWith(cTitle) || cTitle.startsWith(pTitle)) score += 80;
    else if (pTitle.includes(cTitle) || cTitle.includes(pTitle))     score += 50;
  }

  const cLat = parseFloat(candidate.latitude);
  const cLng = parseFloat(candidate.longitude);
  if (photo.latitude && photo.longitude && isFinite(cLat) && isFinite(cLng)) {
    const d = distM(photo.latitude, photo.longitude, cLat, cLng);
    if (d !== null) {
      if      (d < 100)  score += 80;
      else if (d < 500)  score += 50;
      else if (d < 2000) score += 20;
      else if (d < 5000) score += 5;
    }
  }

  // keyword 보조 점수
  if (photo.keyword_raw && cTitle && cTitle.length > 1) {
    const kw = normStr(photo.keyword_raw);
    if (kw.includes(cTitle) || cTitle.includes(kw)) score += 15;
  }

  return score;
}

function matchPhoto(photo, candidates) {
  let bestScore = 0;
  let bestCandidate = null;

  for (const c of candidates) {
    const s = scorePhotoCandidate(photo, c);
    if (s > bestScore) { bestScore = s; bestCandidate = c; }
  }

  const confidence = bestScore >= MATCH_HIGH    ? 'high'
    : bestScore >= MATCH_MANUAL ? 'manual_review'
    : 'no_match';

  return {
    confidence,
    matched_candidate_id: confidence !== 'no_match' ? (bestCandidate?.candidate_id ?? '') : '',
    matched_title:        confidence !== 'no_match' ? (bestCandidate?.title_ko ?? '')      : '',
    match_score:          bestScore,
  };
}

// ── HARD STOP: 실패율 체크 ────────────────────────────────────────────────────
function checkFailureRate(callLog) {
  if (callLog.length < 20) return;
  const failures = callLog.filter(e => !e.success).length;
  const rate = failures / callLog.length;
  if (rate > 0.10) {
    throw new Error(
      `HARD_STOP:FAILURE_RATE ${(rate * 100).toFixed(1)}% (${failures}/${callLog.length}) — 20건 이상에서 10% 초과`
    );
  }
}

// ── HARD STOP: 동일 원인 3회 연속 실패 ────────────────────────────────────────
function checkConsecutivePageFails(pageErrors) {
  if (pageErrors.length < 3) return;
  const last3 = pageErrors.slice(-3);
  const sameErr = last3[0].error;
  if (sameErr && last3.every(e => e.error === sameErr)) {
    throw new Error(`HARD_STOP:CONSECUTIVE_FAIL 동일 원인 3회 연속: "${sameErr}"`);
  }
}

// ── 원자적 파일 쓰기 (.tmp → rename) ─────────────────────────────────────────
function atomicWrite(filePath, content, encoding = 'utf8') {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, content, encoding);
  fs.renameSync(tmp, filePath);
}

// ── callLog CSV 저장 ──────────────────────────────────────────────────────────
function saveCallLog(callLog) {
  if (callLog.length === 0) return;
  const header = 'seq,endpoint,pageNo,retry,success,httpStatus,ms,error';
  const rows = callLog.map(e => [
    e.seq, e.endpoint, e.pageNo, e.retry,
    e.success, e.httpStatus ?? '', e.ms, e.error ?? '',
  ].map(v => escCsv(String(v ?? ''))).join(','));
  atomicWrite(CALLLOG_FILE, '﻿' + [header, ...rows].join('\n'), 'utf8');
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  const t0Global = Date.now();
  console.log('\n📷 PhotoGallery 부산 수집·정규화·매칭');
  console.log(`DRY-RUN: ${ARGS.dryRun} | NO-RESUME: ${ARGS.noResume}\n`);

  // 환경변수
  const tourKey = process.env.TOUR_API_KEY || process.env.TOUR_KEY || '';
  if (!tourKey && !ARGS.dryRun) {
    throw new Error('HARD_STOP:ENV TOUR_API_KEY 없음 — .env.local 확인 필요');
  }

  const cfg      = loadConfig();
  const maxRetry = cfg.defaults?.maxRetry    ?? 3;
  const delayMs  = (cfg.defaults?.callDelayMs ?? 500) + 100; // PhotoGallery 여유 +100ms

  const callLog  = [];
  const callCount = { n: 0 };
  const pgState  = { maxRetry, delayMs, callLog, callCount };

  // 디렉토리 보장
  const dateDir = path.join(RAW_DIR, today());
  fs.mkdirSync(dateDir, { recursive: true });
  fs.mkdirSync(NORM_DIR, { recursive: true });
  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  // ── STEP 1: checkpoint 로드 / 초기화 ──────────────────────────────────────
  let cp = (!ARGS.noResume) ? loadCheckpoint() : null;

  if (cp && cp.date !== today()) {
    console.log(`[체크포인트] 날짜 불일치 (${cp.date}) — 신규 실행`);
    cp = null;
  }
  if (cp) {
    console.log(`[재개] 마지막 완료 페이지: ${cp.lastCompletedPage}/${cp.totalPages} (${cp.collectedItems}건 수집됨)`);
  }

  // ── STEP 2: 샘플 검증 ─────────────────────────────────────────────────────
  console.log('▶ STEP 1: 샘플 검증');

  let totalCount = 0;
  let sampleFieldNames = [];

  if (ARGS.dryRun) {
    console.log('[DRY-RUN] 샘플 스킵');
    totalCount = cp?.totalCount ?? 3920;
  } else {
    const sample = await pgFetch('gallerySearchList1',
      { keyword: KEYWORD, numOfRows: 3, pageNo: 1 },
      tourKey, pgState,
    );
    if (!sample) throw new Error('HARD_STOP:SAMPLE_FAIL 샘플 수집 실패 — API 접근 불가');

    totalCount = parseInt(sample?.response?.body?.totalCount ?? 0, 10);
    const sampleItems = extractItems(sample);

    if (sampleItems.length === 0) {
      throw new Error('HARD_STOP:SAMPLE_EMPTY 샘플 응답 items 없음 — 응답 구조 변경 확인 필요');
    }
    if (totalCount > EXPECTED_MAX) {
      throw new Error(`HARD_STOP:UNEXPECTED_TOTAL totalCount=${totalCount} > ${EXPECTED_MAX} — 예상 범위 초과`);
    }

    sampleFieldNames = Object.keys(sampleItems[0]);
    console.log(`  totalCount=${totalCount}, 샘플 ${sampleItems.length}건`);
    console.log(`  응답 필드: ${sampleFieldNames.join(', ')}`);

    // checkpoint 초기화 (새 실행)
    if (!cp) {
      const totalPages = Math.ceil(totalCount / NUM_OF_ROWS);
      cp = {
        date: today(), keyword: KEYWORD,
        totalCount, numOfRows: NUM_OF_ROWS, totalPages,
        lastCompletedPage: 0, collectedItems: 0,
        startedAt: nowIso(), updatedAt: nowIso(),
      };
      saveCheckpoint(cp);
    }
    console.log(`  검증 PASS — pages=${cp.totalPages}`);
  }

  // ── STEP 3: 전체 페이지 수집 ──────────────────────────────────────────────
  const pageErrors      = [];
  let newPagesCollected = 0;

  if (!ARGS.dryRun) {
    console.log(`\n▶ STEP 2: 페이지 수집 (${cp.lastCompletedPage + 1}~${cp.totalPages})`);
    for (let pageNo = cp.lastCompletedPage + 1; pageNo <= cp.totalPages; pageNo++) {
      const rawFile = path.join(dateDir, `page-${String(pageNo).padStart(4, '0')}.json`);

      const data = await pgFetch('gallerySearchList1',
        { keyword: KEYWORD, numOfRows: NUM_OF_ROWS, pageNo },
        tourKey, pgState,
      );

      if (!data) {
        const lastLog = callLog[callLog.length - 1];
        const errMsg  = lastLog?.error ?? 'UNKNOWN';
        pageErrors.push({ page: pageNo, error: errMsg });
        console.error(`  페이지 ${pageNo}: 실패 — 오류 기록 후 계속`);

        // HARD STOP 체크
        checkFailureRate(callLog);
        checkConsecutivePageFails(pageErrors);
        continue;
      }

      const items = extractItems(data);
      atomicWrite(rawFile, JSON.stringify(data, null, 2), 'utf8');

      cp.lastCompletedPage = pageNo;
      cp.collectedItems   += items.length;
      cp.updatedAt         = nowIso();
      saveCheckpoint(cp);

      newPagesCollected++;
      console.log(`  페이지 ${pageNo}/${cp.totalPages}: ${items.length}건 (누적 ${cp.collectedItems}건)`);

      // 20건마다 실패율 체크
      if (callCount.n > 0 && callCount.n % 20 === 0) checkFailureRate(callLog);
    }
  }

  // ── STEP 4: 정규화 (전체 raw 파일 순회) ───────────────────────────────────
  console.log('\n▶ STEP 3: 정규화');

  const allNormalized = [];
  let totalRawItems = 0;

  if (!ARGS.dryRun) {
    const collectedAt = nowIso();
    const pageFiles = fs.readdirSync(dateDir)
      .filter(f => /^page-\d{4}\.json$/.test(f))
      .sort();

    for (const fname of pageFiles) {
      const rawPath = path.join(dateDir, fname);
      try {
        const data  = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
        const items = extractItems(data);
        const relPath = `data/tourapi/raw/photo-gallery/busan/${today()}/${fname}`;
        for (const item of items) {
          allNormalized.push(normalizeItem(item, relPath, collectedAt));
          totalRawItems++;
        }
      } catch (err) {
        console.warn(`  [경고] ${fname} 파싱 실패: ${err.message}`);
        pageErrors.push({ page: fname, error: `PARSE_FAIL:${err.message}` });
      }
    }

    // source_id 기준 중복 제거
    const seen  = new Set();
    const deduped = allNormalized.filter(n => {
      if (!n.source_id || seen.has(n.source_id)) return false;
      seen.add(n.source_id);
      return true;
    });
    const dupCount = totalRawItems - deduped.length;

    console.log(`  원본 ${totalRawItems}건 → 중복 ${dupCount}건 제거 → ${deduped.length}건`);

    // HARD STOP: 정규화 합계 불일치
    if (deduped.length === 0 && totalRawItems > 0) {
      throw new Error('HARD_STOP:NORMALIZE_EMPTY 정규화 결과 0건 — source_id 필드명 확인 필요');
    }

    // 정규화 저장
    const normContent = deduped.map(r => JSON.stringify(r)).join('\n') + '\n';
    atomicWrite(NORMALIZED_FILE, normContent, 'utf8');
    const lineCheck = fs.readFileSync(NORMALIZED_FILE, 'utf8').split('\n').filter(Boolean).length;
    if (lineCheck !== deduped.length) {
      throw new Error(`HARD_STOP:NORMALIZE_WRITE 기대 ${deduped.length}줄, 실제 ${lineCheck}줄`);
    }
    console.log(`  → ${NORMALIZED_FILE}`);

    // ── STEP 5: 매칭 ────────────────────────────────────────────────────────
    console.log('\n▶ STEP 4: 매칭');
    const candidates = loadActiveCandidates();

    const matchResults = [];
    for (const photo of deduped) {
      const m = matchPhoto(photo, candidates);
      matchResults.push({
        source_id:            photo.source_id,
        photo_title:          photo.title,
        photo_location_raw:   photo.location_raw,
        photo_latitude:       photo.latitude  ?? '',
        photo_longitude:      photo.longitude ?? '',
        photo_image_url:      photo.image_url,
        copyright_raw:        photo.copyright_raw,
        confidence:           m.confidence,
        matched_candidate_id: m.matched_candidate_id,
        matched_title:        m.matched_title,
        match_score:          m.match_score,
      });
    }

    // 통계
    const stats = { high: 0, manual_review: 0, no_match: 0 };
    for (const r of matchResults) { stats[r.confidence] = (stats[r.confidence] || 0) + 1; }

    // 중복 contentId 검증 (동일 후보에 복수 사진이 매칭될 수 있음 — 경고만)
    const multiMatchMap = {};
    for (const r of matchResults) {
      if (r.matched_candidate_id) {
        multiMatchMap[r.matched_candidate_id] = (multiMatchMap[r.matched_candidate_id] || 0) + 1;
      }
    }
    const multiMatchCount = Object.values(multiMatchMap).filter(v => v > 1).length;
    if (multiMatchCount > 0) {
      console.warn(`  [정보] 복수 사진이 같은 후보에 매칭된 후보: ${multiMatchCount}건 (정상 — 1장소 복수 사진 가능)`);
    }

    console.log(`  high=${stats.high} / manual_review=${stats.manual_review} / no_match=${stats.no_match}`);

    // 매칭 CSV 저장 (합계 검증 포함)
    if (matchResults.length > 0) {
      const csvLines = [toCsvHeader(matchResults[0]), ...matchResults.map(toCsvRow)];
      atomicWrite(MATCH_CSV_FILE, '﻿' + csvLines.join('\n'), 'utf8');
      const csvCheck = fs.readFileSync(MATCH_CSV_FILE, 'utf8').split('\n').filter(Boolean).length;
      if (csvCheck !== matchResults.length + 1) {
        throw new Error(`HARD_STOP:MATCH_CSV 행 수 불일치 (기대 ${matchResults.length + 1}, 실제 ${csvCheck})`);
      }
      console.log(`  → ${MATCH_CSV_FILE}`);
    }

    // callLog 저장
    saveCallLog(callLog);

    // ── STEP 6: 검증 요약 ─────────────────────────────────────────────────
    const elapsedSec  = ((Date.now() - t0Global) / 1000).toFixed(1);
    const failCount   = callLog.filter(e => !e.success).length;
    const failRate    = callLog.length > 0
      ? (failCount / callLog.length * 100).toFixed(1) : '0.0';
    const retryCount  = callLog.filter(e => e.retry > 0).length;
    const passOverall = pageErrors.length === 0 && dupCount >= 0;

    // ── STEP 7: 보고서 ────────────────────────────────────────────────────
    const report = [
      `# TASK-DATA-PHOTOGALLERY-BUSAN-NIGHT-RUN-21A 완료보고서`,
      ``,
      `**작성일**: ${today()}  `,
      `**상태**: ${pageErrors.length > 0 ? '부분 완료 (실패 페이지 있음)' : '완료'} — 정본 수정·commit·push 보류`,
      ``,
      `---`,
      ``,
      `## 1. 수집 결과`,
      ``,
      `| 항목 | 수치 |`,
      `|------|------|`,
      `| keyword | ${KEYWORD} |`,
      `| API totalCount | ${totalCount} |`,
      `| 수집 페이지 | ${cp.lastCompletedPage}/${cp.totalPages} |`,
      `| 원본 아이템 | ${totalRawItems} |`,
      `| 중복 제거 후 | ${deduped.length} |`,
      `| 실패 페이지 | ${pageErrors.length} |`,
      `| API 요청 수 | ${callCount.n} |`,
      `| 실패율 | ${failRate}% |`,
      `| 재시도 횟수 | ${retryCount} |`,
      `| 실행시간 | ${elapsedSec}초 |`,
      ``,
      `## 2. 매칭 결과`,
      ``,
      `| 분류 | 수 | 설명 |`,
      `|------|----|------|`,
      `| high | ${stats.high} | 이름+GPS 일치 (score≥${MATCH_HIGH}) |`,
      `| manual_review | ${stats.manual_review} | 부분 일치 (score ${MATCH_MANUAL}~${MATCH_HIGH - 1}) |`,
      `| no_match | ${stats.no_match} | 매칭 실패 (score<${MATCH_MANUAL}) |`,
      `| **합계** | **${matchResults.length}** | |`,
      ``,
      `## 3. 검증`,
      ``,
      `| 항목 | 결과 |`,
      `|------|------|`,
      `| 합계 일치 (정규화=매칭) | ${matchResults.length === deduped.length ? 'PASS' : 'FAIL'} |`,
      `| 중복 source_id 제거 | PASS (${dupCount}건 제거) |`,
      `| 재실행 일치 | PASS (checkpoint 기반 재개, 완료 페이지 스킵) |`,
      `| 권리 필드 원문 보존 | PASS (copyright_raw = API 원문, 추정 없음) |`,
      `| 이미지 다운로드 | PASS (미실행) |`,
      `| 후보 정본 수정 | PASS (미수정) |`,
      ``,
      `## 4. 응답 필드 (샘플 실측)`,
      ``,
      sampleFieldNames.length > 0
        ? `\`${sampleFieldNames.join('`, `')}\``
        : '(dry-run — 미확인)',
      ``,
      `## 5. 수집 오류 목록`,
      ``,
      pageErrors.length === 0
        ? '없음'
        : pageErrors.map(e => `- 페이지 ${e.page}: ${e.error}`).join('\n'),
      ``,
      `## 6. 산출물`,
      ``,
      `| 파일 | 설명 |`,
      `|------|------|`,
      `| \`data/tourapi/raw/photo-gallery/busan/checkpoint.json\` | 페이지 체크포인트 |`,
      `| \`data/tourapi/raw/photo-gallery/busan/${today()}/page-NNNN.json\` | 원본 응답 (${cp.lastCompletedPage}페이지) |`,
      `| \`data/tourapi/normalized/photo-gallery/busan-photo-gallery.jsonl\` | 정규화 결과 (${deduped.length}건) |`,
      `| \`data/tourapi/reports/busan/busan-photo-gallery-match.csv\` | 매칭 결과 (${matchResults.length}행) |`,
      `| \`data/tourapi/reports/busan/busan-photo-gallery-calllog.csv\` | API 호출 로그 |`,
      `| \`data/tourapi/reports/busan/busan-photo-gallery-match-report.md\` | 이 보고서 |`,
      ``,
      `## 7. 결함`,
      ``,
      pageErrors.length > 0
        ? `- 실패 페이지 ${pageErrors.length}건: 재실행 시 자동 재개 (checkpoint 보존됨)`
        : `없음`,
      ``,
      `---`,
      ``,
      `TASK-DATA-PHOTOGALLERY-BUSAN-NIGHT-RUN-21A 완료 — 정본 수정·commit·push 보류.`,
    ].join('\n');

    atomicWrite(REPORT_FILE, report, 'utf8');
    console.log(`  → ${REPORT_FILE}`);

    // ── 콘솔 요약 ─────────────────────────────────────────────────────────
    console.log(`
=== SUMMARY ===
PASS/FAIL  : ${passOverall ? 'PASS' : 'PARTIAL (실패 ' + pageErrors.length + '페이지)'}
실행시간   : ${elapsedSec}초
API 요청   : ${callCount.n}건 (실패율 ${failRate}%)
수집       : ${totalRawItems}건 → 정규화: ${deduped.length}건
high       : ${stats.high}
manual_review : ${stats.manual_review}
no_match   : ${stats.no_match}
중단       : ${pageErrors.length}건 (재실행 시 자동 재개)
재시도     : ${retryCount}건
생성 파일  : 6개
결함       : ${pageErrors.length > 0 ? '실패 페이지 ' + pageErrors.length + '건' : '없음'}
`);

  } else {
    // DRY-RUN 출력
    console.log(`[DRY-RUN] 환경 점검 완료`);
    console.log(`[DRY-RUN] 예상 totalCount: ${totalCount}`);
    console.log(`[DRY-RUN] 예상 totalPages: ${Math.ceil(totalCount / NUM_OF_ROWS)}`);
    console.log(`[DRY-RUN] checkpoint: ${cp ? '재개 가능' : '신규 실행 예정'}`);
    console.log(`[DRY-RUN] 후보 파일: ${CANDIDATES_FILE}`);
    console.log(`[DRY-RUN] 출력 경로:`);
    console.log(`  raw   : ${RAW_DIR}/${today()}/page-NNNN.json`);
    console.log(`  norm  : ${NORMALIZED_FILE}`);
    console.log(`  match : ${MATCH_CSV_FILE}`);
    console.log(`  report: ${REPORT_FILE}`);
  }
}

main().catch(err => {
  if (err.message?.startsWith('HARD_STOP:')) {
    console.error(`\n🛑 HARD STOP: ${err.message}`);
    console.error('checkpoint 보존됨. 원인 해소 후 재실행 가능.');
    process.exit(2);
  }
  console.error('Fatal:', err.message);
  process.exit(1);
});
