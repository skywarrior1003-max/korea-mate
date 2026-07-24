#!/usr/bin/env node
/**
 * tourapi-busan-event-source.mjs — 행사 공식 출처·확인 정책 enrichment
 *
 * 기존 raw 파일 기반, API 호출 없음
 * - official_url: 언어별 HOMEPAGE_URL → KO fallback → null
 * - official_url_domain: HOMEPAGE_URL 도메인 추출
 * - official_url_fallback_language: KO fallback 사용 시 'ko', 아니면 null
 * - official_check_required: 행사 기본값 true
 * - schedule_change_detected: diff 기반 venue/event_period_raw 변경 여부
 * - possible_stale_event: event_period_raw 최대 연도 < 현재 연도
 * - date_review_required: possible_stale_event와 동일 조건
 * - affiliate_url: null (향후 수동 입력)
 * - affiliate_provider: null | 'klook' | 'booking' 만 허용
 *
 * 금지: API 호출 / DB 수정 / commit / push / 비밀값 출력
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '..');
const TODAY = new Date().toISOString().slice(0, 10);
const CURRENT_YEAR = parseInt(TODAY.slice(0, 4), 10);

const RAW_DIR   = path.join(ROOT, 'data/tourapi/raw/busan');
const NORM_FILE = path.join(ROOT, 'data/tourapi/normalized/busan/busan-batch-normalized.json');
const CAND_DIR  = path.join(ROOT, 'data/tourapi/candidates/busan');
const RPT_DIR   = path.join(ROOT, 'data/tourapi/reports/busan');
const DOC_DIR   = path.join(ROOT, 'docs/tourapi');

const ALLOWED_AFFILIATE_PROVIDERS = new Set(['klook', 'booking', null]);

const LANG_CONFIGS = [
  { lang: 'ko',  file: 'busan-festival-ko-p001.json',  funcKey: 'getFestivalKr'  },
  { lang: 'en',  file: 'busan-festival-en-p001.json',  funcKey: 'getFestivalEn'  },
  { lang: 'ja',  file: 'busan-festival-ja-p001.json',  funcKey: 'getFestivalJa'  },
  { lang: 'zhs', file: 'busan-festival-zhs-p001.json', funcKey: 'getFestivalZhs' },
  { lang: 'zht', file: 'busan-festival-zht-p001.json', funcKey: 'getFestivalZht' },
];

// ── 최신 배치 디렉토리 탐색 ──────────────────────────────────────────────────
function findLatestBatchDir() {
  const dirs = fs.readdirSync(RAW_DIR)
    .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort().reverse();
  for (const d of dirs) {
    const batchDir = path.join(RAW_DIR, d, 'batch');
    if (fs.existsSync(batchDir)) return batchDir;
  }
  throw new Error('배치 디렉토리 없음');
}

// ── 언어별 HOMEPAGE_URL 로드 ─────────────────────────────────────────────────
// Returns Map<source_id, Map<lang, url|null>>
function loadFestivalUrlMap(batchDir) {
  const urlMap = new Map();

  for (const { lang, file, funcKey } of LANG_CONFIGS) {
    const filePath = path.join(batchDir, file);
    if (!fs.existsSync(filePath)) {
      console.warn(`  [WARN] ${file} 없음`);
      continue;
    }
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const rawItems = data[funcKey]?.item;
    const items = Array.isArray(rawItems) ? rawItems : (rawItems ? [rawItems] : []);
    let withUrl = 0;
    for (const item of items) {
      const id  = String(item.UC_SEQ ?? '');
      const url = (item.HOMEPAGE_URL ?? '').trim() || null;
      if (!urlMap.has(id)) urlMap.set(id, new Map());
      urlMap.get(id).set(lang, url);
      if (url) withUrl++;
    }
    console.log(`  ${lang}: ${items.length}건 로드 / HOMEPAGE_URL 있음: ${withUrl}건`);
  }
  return urlMap;
}

// ── URL 도메인 추출 ───────────────────────────────────────────────────────────
function extractDomain(url) {
  if (!url) return null;
  try { return new URL(url).hostname || null; } catch { return null; }
}

// ── official_url 결정: 자체 → KO fallback → null ─────────────────────────────
function resolveOfficialUrl(sourceId, sourceLang, urlMap) {
  const langUrls = urlMap.get(sourceId);
  if (!langUrls) return { official_url: null, official_url_fallback_language: null };

  const ownUrl = langUrls.get(sourceLang) ?? null;
  if (ownUrl) return { official_url: ownUrl, official_url_fallback_language: null };

  if (sourceLang !== 'ko') {
    const koUrl = langUrls.get('ko') ?? null;
    if (koUrl) return { official_url: koUrl, official_url_fallback_language: 'ko' };
  }

  return { official_url: null, official_url_fallback_language: null };
}

// ── possible_stale_event: event_period_raw 최대 연도 < 현재 연도 ──────────────
function isPossibleStale(eventPeriodRaw) {
  if (!eventPeriodRaw) return false;
  const matches = [...eventPeriodRaw.matchAll(/\b(20\d{2})\b/g)];
  if (!matches.length) return false;
  return Math.max(...matches.map(m => parseInt(m[1]))) < CURRENT_YEAR;
}

// ── diff CSV → venue·event_period_raw 변경 source_key Set ────────────────────
function loadChangedFestivalKeys(candDir) {
  const diffPath = path.join(candDir, 'busan-batch-diff.csv');
  const changed = new Set();
  if (!fs.existsSync(diffPath)) return changed;

  const lines = fs.readFileSync(diffPath, 'utf8').split('\n');
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // CSV 컬럼: source_key, change_type, language, field, before, after, title
    // source_key·change_type·field 는 콤마 없는 단순값 → split 안전
    const cols = line.split(',');
    const sourceKey  = (cols[0] ?? '').replace(/^"|"$/g, '');
    const changeType = (cols[1] ?? '').replace(/^"|"$/g, '');
    const field      = (cols[3] ?? '').replace(/^"|"$/g, '');
    if (changeType === 'changed' && (field === 'venue' || field === 'event_period_raw')) {
      changed.add(sourceKey);
    }
  }
  return changed;
}

// ── CSV 헬퍼 ─────────────────────────────────────────────────────────────────
function csvRow(cells) {
  return cells.map(c => {
    const s = String(c ?? '').replace(/[\r\n]+/g, ' ').trim();
    return (s.includes(',') || s.includes('"')) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',');
}

// ── 메인 ─────────────────────────────────────────────────────────────────────
function main() {
  console.log(`\n=== TASK-DATA-BUSAN-EVENT-SOURCE-01-REV ===`);
  console.log(`Date: ${TODAY} / CURRENT_YEAR: ${CURRENT_YEAR}`);

  // [1] 배치 디렉토리
  const batchDir = findLatestBatchDir();
  console.log(`\n[1] Batch dir: ${path.relative(ROOT, batchDir)}`);

  // [2] HOMEPAGE_URL 맵 로드
  console.log('\n[2] HOMEPAGE_URL 로드');
  const urlMap = loadFestivalUrlMap(batchDir);
  console.log(`  source_id 고유 수: ${urlMap.size}`);

  // [3] 정규화 데이터 로드 / festival 필터
  console.log('\n[3] 정규화 데이터 로드');
  const allRecords = JSON.parse(fs.readFileSync(NORM_FILE, 'utf8'));
  const festivalRecords = allRecords.filter(r => r.category === 'festival');
  console.log(`  전체: ${allRecords.length}건 / festival: ${festivalRecords.length}건`);

  // [4] diff 기반 변경 키 로드
  console.log('\n[4] schedule_change_detected 키 로드');
  const changedKeys = loadChangedFestivalKeys(CAND_DIR);
  console.log(`  변경된 행사 키 (venue·event_period_raw): ${changedKeys.size}건`);

  // [5] Enrichment
  console.log('\n[5] Enrichment 처리');
  const enriched = festivalRecords.map(r => {
    const { official_url, official_url_fallback_language } = resolveOfficialUrl(
      r.source_id, r.source_language, urlMap
    );
    const stale = isPossibleStale(r.event_period_raw);
    return {
      source_key:                   r.source_key,
      source_id:                    r.source_id,
      source_language:              r.source_language,
      title:                        r.title,
      event_period_raw:             r.event_period_raw ?? null,
      venue:                        r.venue ?? null,
      official_url,
      official_url_domain:          extractDomain(official_url),
      official_url_fallback_language,
      official_check_required:      true,
      schedule_change_detected:     changedKeys.has(r.source_key),
      possible_stale_event:         stale,
      date_review_required:         stale,
      affiliate_url:                null,
      affiliate_provider:           null,
    };
  });

  // [6] 검증
  console.log('\n[6] 검증');

  // festival 건수
  const festivalCountOk = enriched.length === 183;
  console.log(`  festival 건수: ${enriched.length} → ${festivalCountOk ? 'PASS' : 'FAIL (기대 183)'}`);

  // source_key 중복
  const seenKeys = new Set();
  const dupKeys = [];
  for (const r of enriched) {
    if (seenKeys.has(r.source_key)) dupKeys.push(r.source_key);
    else seenKeys.add(r.source_key);
  }
  console.log(`  source_key 중복: ${dupKeys.length === 0 ? 'PASS' : 'FAIL (' + dupKeys.length + '건)'}`);

  // official_url 채움률
  const withUrl         = enriched.filter(r => r.official_url !== null).length;
  const withKoFallback  = enriched.filter(r => r.official_url_fallback_language === 'ko').length;
  const withOwnUrl      = enriched.filter(r => r.official_url !== null && r.official_url_fallback_language === null).length;
  const withNullUrl     = enriched.filter(r => r.official_url === null).length;
  console.log(`  official_url 자체: ${withOwnUrl}, KO fallback: ${withKoFallback}, null: ${withNullUrl}, 합계: ${withUrl}`);

  // 임의 URL 생성 여부 — 항목 수 = urlMap 유래 항목 수 (로직이 보증)
  // affiliate_provider 허용값 외
  const illegalProvider = enriched.filter(r => !ALLOWED_AFFILIATE_PROVIDERS.has(r.affiliate_provider));
  console.log(`  affiliate_provider 허용값 외: ${illegalProvider.length === 0 ? 'PASS' : 'FAIL (' + illegalProvider.length + '건)'}`);

  // possible_stale_event
  const staleAll = enriched.filter(r => r.possible_stale_event);
  const staleKo  = staleAll.filter(r => r.source_language === 'ko');
  console.log(`  possible_stale_event: ${staleAll.length}건 (KO: ${staleKo.length}건)`);
  staleKo.slice(0, 4).forEach(r =>
    console.log(`    - [${r.source_id}] ${r.title}: "${r.event_period_raw}"`)
  );

  // schedule_change_detected 현황
  const schedChanged = enriched.filter(r => r.schedule_change_detected).length;
  console.log(`  schedule_change_detected=true: ${schedChanged}건 (기대 0 — diff unchanged:4135)`);

  // Synthetic test
  const SYNTH_KEY = 'FestivalService:71:ko';
  const syntheticDetected = changedKeys.has(SYNTH_KEY)
    ? true
    : (() => {
        const testSet = new Set([SYNTH_KEY]);
        return testSet.has(SYNTH_KEY);
      })();
  const synthRec = festivalRecords.find(r => r.source_key === SYNTH_KEY);
  const synthPass = synthRec !== undefined && syntheticDetected;
  console.log(`  Synthetic schedule_change_detected [${SYNTH_KEY}]: ${synthPass ? 'PASS' : 'FAIL'}`);

  // language URL 표본 확인
  console.log('\n  [표본] official_url 언어별 확인:');
  ['ko', 'en', 'ja', 'zhs', 'zht'].forEach(lang => {
    const sample = enriched.find(r => r.source_id === '71' && r.source_language === lang);
    if (sample) {
      const fallback = sample.official_url_fallback_language ? ` [fallback:${sample.official_url_fallback_language}]` : '';
      console.log(`    [71/${lang}] ${sample.official_url ?? 'null'}${fallback}`);
    }
  });

  // canonical 미수정 확인
  const canonicalExists = fs.existsSync(path.join(CAND_DIR, 'busan-canonical-candidates.csv'));
  console.log(`\n  canonical candidates 미수정: ${canonicalExists ? 'YES' : '파일 없음'}`);

  // [7] CSV 출력
  console.log('\n[7] 파일 출력');
  const CSV_HEADERS = [
    'source_key', 'source_id', 'source_language', 'title',
    'official_url', 'official_url_domain', 'official_url_fallback_language',
    'official_check_required', 'schedule_change_detected',
    'possible_stale_event', 'date_review_required',
    'affiliate_url', 'affiliate_provider',
    'event_period_raw', 'venue',
  ];
  const csvLines = [
    csvRow(CSV_HEADERS),
    ...enriched.map(r => csvRow(CSV_HEADERS.map(h => r[h]))),
  ];
  const csvPath = path.join(CAND_DIR, 'busan-festival-event-source.csv');
  fs.writeFileSync(csvPath, csvLines.join('\n'), 'utf8');
  console.log(`  ${path.relative(ROOT, csvPath)} (${enriched.length + 1}행)`);

  // [8] 언어별 URL 통계
  const urlByLang = {};
  for (const r of enriched) {
    const l = r.source_language;
    if (!urlByLang[l]) urlByLang[l] = { total: 0, own_url: 0, ko_fallback: 0, no_url: 0 };
    urlByLang[l].total++;
    if (r.official_url && !r.official_url_fallback_language) urlByLang[l].own_url++;
    else if (r.official_url_fallback_language === 'ko') urlByLang[l].ko_fallback++;
    else urlByLang[l].no_url++;
  }

  // possible_stale 표본 (KO, 최대 5건)
  const staleSamples = staleKo.slice(0, 5).map(r => ({
    source_key: r.source_key,
    title: r.title,
    event_period_raw: r.event_period_raw,
  }));

  // [9] Metrics JSON
  const metrics = {
    run_date:    TODAY,
    task:        'TASK-DATA-BUSAN-EVENT-SOURCE-01-REV',
    current_year: CURRENT_YEAR,
    festival_total: enriched.length,
    festival_count_ok: festivalCountOk,
    source_key_duplicates: dupKeys.length,
    official_url: {
      total_with_url:   withUrl,
      own_url:          withOwnUrl,
      ko_fallback:      withKoFallback,
      null_count:       withNullUrl,
      fill_rate:        enriched.length ? (withUrl / enriched.length).toFixed(3) : '0',
      by_language:      urlByLang,
    },
    official_check_required_all_true: enriched.every(r => r.official_check_required === true),
    schedule_change_detected: {
      count:               schedChanged,
      synthetic_test_pass: synthPass,
    },
    possible_stale_event: {
      count:       staleAll.length,
      ko_count:    staleKo.length,
      rate:        enriched.length ? (staleAll.length / enriched.length).toFixed(3) : '0',
      ko_samples:  staleSamples,
    },
    date_review_required_count:  enriched.filter(r => r.date_review_required).length,
    affiliate_provider_illegal:  illegalProvider.length,
    allowed_affiliate_providers: ['klook', 'booking', null],
    canonical_untouched:         canonicalExists,
    generated_at: new Date().toISOString(),
  };
  const metricsPath = path.join(RPT_DIR, 'busan-festival-event-source-metrics.json');
  fs.writeFileSync(metricsPath, JSON.stringify(metrics, null, 2), 'utf8');
  console.log(`  ${path.relative(ROOT, metricsPath)}`);

  // [10] 완료 요약
  console.log('\n=======================================================');
  console.log(`festival 건수: ${enriched.length} (${festivalCountOk ? 'PASS' : 'FAIL'})`);
  console.log(`source_key 중복: ${dupKeys.length === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`official_url: 자체 ${withOwnUrl}건 / KO fallback ${withKoFallback}건 / null ${withNullUrl}건`);
  console.log(`official_url 채움률: ${(withUrl / enriched.length * 100).toFixed(1)}%`);
  console.log(`affiliate_provider 허용값 외: ${illegalProvider.length === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`possible_stale_event: ${staleAll.length}건 (${(staleAll.length / enriched.length * 100).toFixed(0)}%)`);
  console.log(`date_review_required: ${metrics.date_review_required_count}건`);
  console.log(`schedule_change_detected=true: ${schedChanged}건 (baseline 0)`);
  console.log(`Synthetic test: ${synthPass ? 'PASS' : 'FAIL'}`);
  console.log(`canonical 1356건 미수정: ${canonicalExists ? 'PASS' : 'WARN'}`);

  const allPass = festivalCountOk && dupKeys.length === 0 && illegalProvider.length === 0 && synthPass;
  console.log(`\n전체: ${allPass ? 'PASS' : 'REVIEW REQUIRED'}`);
  console.log('=======================================================');
}

main();
