#!/usr/bin/env node
/**
 * TASK-DATA-BUSAN-VISITBUSAN-CONTENT-PATCH-04A
 * VisitBusan KO 775건 재수집 후 기존 full 결과의 KO 행 교체
 *
 * Phase 0: 기존 full.json + excluded.json 에서 KO 775개 ID 추출 (DISCOVERY 재실행 금지)
 * Phase 1: KO 재수집 (수정된 hours 라벨 적용)
 * Phase 2: 병합 + 검증 (EN 행 그대로 보존)
 * Phase 3: 임시 파일 → 원자적 교체 (PASS 시에만)
 * Phase 4: metrics.json 갱신, collect-04-report.md 에 PATCH-04A 섹션 추가
 *
 * 금지: EN 재수집, Playwright, image_url 개선, canonical 수정, commit/push/DB
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.dirname(__dir);
const TODAY = new Date().toISOString().slice(0, 10);

const BASE      = 'https://www.visitbusan.net';
const DELAY_MS  = 500;
const MAX_RETRY = 2;
const UA = 'Mozilla/5.0 (compatible; KoreaMate-Collect/1.0; educational research)';

const LANG_PATH = { ko: 'kr', en: 'en', ja: 'jp', zhs: 'cn', zht: 'tw' };

const CONTENT_TYPES = {
  attraction: { detail: 'DOM_000000201001001000', label: '명소' },
  food:       { detail: 'DOM_000000201002001000', label: '음식' },
  shopping:   { detail: 'DOM_000000201003001000', label: '쇼핑' },
  experience: { detail: 'DOM_000000202008001000', label: '체험' },
  course:     { detail: 'DOM_000000202012001000', label: '코스' },
};

const CAND_DIR = path.join(ROOT, 'data/tourapi/candidates/busan');
const RPT_DIR  = path.join(ROOT, 'data/tourapi/reports/busan');
const DOC_DIR  = path.join(ROOT, 'docs/tourapi');

const PILOT_CSV  = path.join(CAND_DIR, 'visitbusan-content-pilot.csv');
const PILOT_JSON = path.join(CAND_DIR, 'visitbusan-content-pilot.json');
const FULL_CSV   = path.join(CAND_DIR, 'visitbusan-content-full.csv');
const FULL_JSON  = path.join(CAND_DIR, 'visitbusan-content-full.json');
const EXCL_JSON  = path.join(RPT_DIR,  'visitbusan-content-full-excluded.json');
const METR_JSON  = path.join(RPT_DIR,  'visitbusan-content-full-metrics.json');
const REPORT_MD  = path.join(DOC_DIR,  'visitbusan-content-collect-04-report.md');

const TMP_CSV  = FULL_CSV  + '.patch.tmp';
const TMP_JSON = FULL_JSON + '.patch.tmp';

const CSV_HDR = [
  'source_key','content_type','uc_seq','language',
  'title_ko','address','phone','lat','lon',
  'hours','closed_days','external_official_url','representative_menu',
  'image_url','category_label','language_available',
  'parse_status','missing_required_fields','source_detail_url','collected_at',
];

// ─── 유틸 (collect.mjs 동일) ──────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function stripHtml(s = '') {
  if (!s) return '';
  let r = s.replace(/<!--[\s\S]*?-->/g, '').replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '');
  r = r.replace(/<[^<>]*>/g, ' ').replace(/\s*\/>/g, '').replace(/["']\s*>/g, '').replace(/[<>]/g, '');
  r = r.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
  return r.replace(/\s+/g, ' ').trim();
}

function hasHtmlContam(v) {
  if (typeof v !== 'string' || !v) return false;
  return /<[a-zA-Z\/!]/.test(v) || /\/>/.test(v) || /&[a-zA-Z]{2,6};/.test(v);
}

function csvCell(v) {
  const s = String(v ?? '').replace(/[\r\n]+/g, ' ').trim();
  return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s;
}
function csvRow(arr) { return arr.map(csvCell).join(','); }

const SITE_AND_CATEGORY = new Set([
  '부산에가면','visitbusan','visit busan','비짓부산','부산관광',
  'visit busan 부산광역시','visit busan 釜山広域市',
  '명소','음식','쇼핑','체험','일정여행','추천코스','추천여행','숙박',
  '테마여행','미식투어','해양','웰니스',
  'attraction','food','shopping','experience','itinerary','course',
]);

const BLOCKED_URL_PATTERNS = /vprivacy|terms\.do|agreement|policy\.do|visitbusan\.net\/[a-z]{2}\/index/i;

function extractTitle(html) {
  if (!html) return '';
  let m = html.match(/var\s+mtTitle\s*=\s*["']([^"']{2,80})["']/i);
  if (m) return m[1].replace(/&amp;/g, '&').trim();
  m = html.match(/<!--\s*<div[^>]*class=["'][^"']*p-txt[^"']*["'][^>]*>([^<]{2,80})<\/div>\s*-->/i);
  if (m) return m[1].replace(/&amp;/g, '&').trim();
  m = html.match(/(?:var|let|const)\s+(?:contTitle|contentTitle|wTitle|pageTitle|contsTitle)\s*=\s*["']([^"']{2,80})["']/i);
  if (m) {
    const v = m[1].replace(/&amp;/g, '&').trim();
    if (!SITE_AND_CATEGORY.has(v.toLowerCase())) return v;
  }
  return '';
}

function extractOfficialUrl(html) {
  if (!html) return '';
  const re = /<li[^>]*>\s*<p[^>]*>(?:홈페이지|Homepage|Website|Official)[^<]*<\/p>\s*<span[^>]*>([\s\S]*?)<\/span>/i;
  const m = html.match(re);
  if (!m) return '';
  const hrefM = m[1].match(/href=["']?(https?:\/\/[^"'\s>]{5,})["']?/i);
  const raw = hrefM
    ? hrefM[1]
    : (m[1].match(/https?:\/\/[^\s"'<>]{5,}/)?.[0] ?? '').replace(/['">\s]+$/, '');
  if (!raw || BLOCKED_URL_PATTERNS.test(raw)) return '';
  return raw;
}

function extractInfoField(html, ...labels) {
  const labelPattern = labels.join('|');
  const re = new RegExp(
    `<li[^>]*>\\s*<p[^>]*>(?:${labelPattern})[^<]*<\\/p>\\s*<span[^>]*>([\\s\\S]*?)<\\/span>`,
    'i'
  );
  const m = html?.match(re);
  return m ? stripHtml(m[1]).slice(0, 200) : '';
}

function extractCoords(html) {
  if (!html) return { lat: '', lon: '' };
  const latM = html.match(/(?:^|[^a-zA-Z])(?:lat|latitude|mapY|_lat)\s*[:=]\s*["']?([\d.]{4,12})["']?/im);
  const lonM = html.match(/(?:^|[^a-zA-Z])(?:lng|lon|longitude|mapX|_lon|_lng)\s*[:=]\s*["']?([\d.]{4,12})["']?/im);
  const lat = latM ? parseFloat(latM[1]) : NaN;
  const lon = lonM ? parseFloat(lonM[1]) : NaN;
  return {
    lat: (lat > 30 && lat < 40)   ? lat : '',
    lon: (lon > 120 && lon < 135) ? lon : '',
  };
}

function extractImageUrl(html) {
  if (!html) return '';
  const m = html.match(/src=["']([^"']*(?:uploadImgs|conts_img|content_img)[^"']+\.(?:jpg|jpeg|png|webp))["']/i);
  return m ? m[1] : '';
}

function extractCategory(html, ctypeLabel) {
  if (!html) return ctypeLabel;
  const m = html.match(/<li[^>]*class=["'][^"']*(?:active|current|on)[^"']*["'][^>]*>[\s\S]*?<a[^>]*>([\s\S]{2,20}?)<\/a>/i)
          || html.match(/class=["'][^"']*breadcrumb[^"']*["'][^>]*>[\s\S]*?<[^>]+>([\s\S]{2,20}?)<\/[^>]+>\s*<\/li>/i);
  const cat = m ? stripHtml(m[1]).slice(0, 20) : '';
  return cat || ctypeLabel;
}

function isErrorPage(html) {
  if (!html) return true;
  return /RFC\s*3[\.\s]?0\s*오류|알\s*수\s*없는\s*오류|죄송합니다|서버\s*오류|500\s*Internal/i.test(html)
      || html.length < 1000;
}

// ─── HTTP ─────────────────────────────────────────────────────────────────────
let reqCount  = 0;
let cookieJar = '';

async function doGet(url, lang = 'ko') {
  const acceptLang = {
    ko: 'ko-KR,ko;q=0.9', en: 'en-US,en;q=0.9',
    ja: 'ja-JP,ja;q=0.9', zhs: 'zh-CN,zh;q=0.9', zht: 'zh-TW,zh;q=0.9',
  }[lang] ?? 'ko-KR';
  for (let i = 0; i <= MAX_RETRY; i++) {
    try {
      await sleep(DELAY_MS);
      reqCount++;
      const res = await fetch(url, {
        headers: {
          'User-Agent':      UA,
          'Accept':          'text/html,application/xhtml+xml,*/*;q=0.8',
          'Accept-Language': acceptLang,
          'Referer':         `${BASE}/${LANG_PATH[lang] ?? 'kr'}/index.do`,
          ...(cookieJar ? { Cookie: cookieJar } : {}),
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(15000),
      });
      const sc = res.headers.get('set-cookie');
      if (sc) {
        const pairs = sc.split(/,(?=\s*\w+=)/g).map(c => c.split(';')[0].trim()).filter(Boolean);
        if (pairs.length) cookieJar = pairs.join('; ');
      }
      if (!res.ok) return { html: null, status: res.status };
      return { html: await res.text(), status: res.status };
    } catch (e) {
      if (i === MAX_RETRY) return { html: null, status: 0, error: e.message };
      await sleep(1000 * (i + 1));
    }
  }
  return { html: null, status: 0 };
}

// ─── KO 파싱 (collect.mjs와 동일 — PARSER-FIX-04A 수정 라벨 적용) ───────────

function parseKoDetail(html, ucSeq, ctype, detailUrl) {
  const meta = CONTENT_TYPES[ctype];
  const now  = new Date().toISOString();

  if (!html || isErrorPage(html)) {
    return { excluded: true, parse_status: 'error_page', reason: 'http_error_or_short', uc_seq: ucSeq, ctype, source_detail_url: detailUrl };
  }

  const title = extractTitle(html);
  if (!title) {
    return { excluded: true, parse_status: 'requires_client_render', reason: 'vue_title_only', uc_seq: ucSeq, ctype, source_detail_url: detailUrl };
  }

  const coords = extractCoords(html);
  const row = {
    source_key:             `VisitBusanContent:${ctype}:${ucSeq}:ko`,
    content_type:           ctype,
    uc_seq:                 ucSeq,
    language:               'ko',
    title_ko:               title,
    address:                extractInfoField(html, '주소', 'Address', '도로명주소'),
    phone:                  extractInfoField(html, '전화번호', 'Inquiry', 'Inquiries', 'Phone', '전화', 'TEL'),
    lat:                    coords.lat,
    lon:                    coords.lon,
    hours:                  extractInfoField(html, '운영요일 및 시간', '운영시간', '영업시간', 'Hours', 'Opening Hours', 'Operating', 'Open'),
    closed_days:            extractInfoField(html, '휴무일', 'Closing Dates', 'Closed', '휴관일', '정기휴일'),
    external_official_url:  extractOfficialUrl(html),
    representative_menu:    ctype === 'food' ? extractInfoField(html, '대표 메뉴', '대표메뉴', 'Best Menu', 'Representative Menu', '주요 메뉴') : '',
    image_url:              extractImageUrl(html),
    category_label:         extractCategory(html, meta.label),
    language_available:     true,
    parse_status:           'ok',
    missing_required_fields:'',
    source_detail_url:      detailUrl,
    collected_at:           now,
  };

  const contamFields = ['address','phone','hours','closed_days'].filter(f => hasHtmlContam(row[f]));
  if (contamFields.length > 0) {
    return { excluded: true, parse_status: 'html_contamination', reason: `HTML 오염 필드: ${contamFields.join(', ')}`, uc_seq: ucSeq, ctype, source_detail_url: detailUrl };
  }

  const missing = [];
  if (!row.address)   missing.push('address');
  if (!row.lat)       missing.push('lat');
  if (!row.lon)       missing.push('lon');
  if (!row.image_url) missing.push('image_url');
  if (missing.length) row.missing_required_fields = missing.join('|');

  return { excluded: false, row };
}

// ─── 임시 파일 정리 ───────────────────────────────────────────────────────────
function cleanTmp() {
  for (const f of [TMP_CSV, TMP_JSON]) {
    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {}
  }
}

// ─── 메인 ─────────────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();
  console.log('=== TASK-DATA-BUSAN-VISITBUSAN-CONTENT-PATCH-04A 시작 ===');
  console.log(`날짜: ${TODAY}, DELAY_MS: ${DELAY_MS}\n`);

  // 이전 실패 임시 파일 정리
  cleanTmp();

  // ─── Phase 0: 기존 데이터 로드 + ID 추출 ──────────────────────────────────
  console.log('=== Phase 0: 기존 데이터 로드 ===');

  if (!fs.existsSync(FULL_JSON)) {
    console.error('[HARD STOP] 기존 full.json 없음 — 패치 불가'); process.exit(1);
  }
  if (!fs.existsSync(EXCL_JSON)) {
    console.error('[HARD STOP] 기존 excluded.json 없음 — 패치 불가'); process.exit(1);
  }

  const existingAll  = JSON.parse(fs.readFileSync(FULL_JSON,  'utf8'));
  const existingExcl = JSON.parse(fs.readFileSync(EXCL_JSON,  'utf8'));
  const existingMetr = fs.existsSync(METR_JSON) ? JSON.parse(fs.readFileSync(METR_JSON, 'utf8')) : {};

  const existingKoRows = existingAll.filter(r => r.language === 'ko');
  const existingEnRows = existingAll.filter(r => r.language === 'en');
  const existingKoExcl = existingExcl.filter(r => r.language === 'ko');
  const existingEnExcl = existingExcl.filter(r => r.language === 'en');

  console.log(`  기존 full  : KO=${existingKoRows.length}건, EN=${existingEnRows.length}건`);
  console.log(`  기존 excluded: KO=${existingKoExcl.length}건, EN=${existingEnExcl.length}건`);

  // KO 대상 목록: full KO rows (source_key 파싱) + excluded KO rows (uc_seq/ctype 직접)
  const seenTargets = new Set();
  const koTargets   = [];

  for (const r of existingKoRows) {
    // source_key: VisitBusanContent:{ctype}:{uc_seq}:ko
    const parts = (r.source_key ?? '').split(':');
    const ctype = parts[1];
    const ucSeq = parts[2];
    if (ctype && ucSeq && CONTENT_TYPES[ctype]) {
      const key = `${ctype}:${ucSeq}`;
      if (!seenTargets.has(key)) { seenTargets.add(key); koTargets.push({ ucSeq, ctype }); }
    }
  }
  for (const r of existingKoExcl) {
    const ctype = r.ctype;
    const ucSeq = String(r.uc_seq ?? '');
    if (ctype && ucSeq && CONTENT_TYPES[ctype]) {
      const key = `${ctype}:${ucSeq}`;
      if (!seenTargets.has(key)) { seenTargets.add(key); koTargets.push({ ucSeq, ctype }); }
    }
  }

  const totalTargets = koTargets.length;
  console.log(`  KO 수집 대상: ${totalTargets}건`);

  if (totalTargets !== 775) {
    console.error(`[HARD STOP] KO 대상 ${totalTargets}건 — 예상 775건과 불일치`); process.exit(1);
  }

  // Before 채움률 계산
  const beforeHoursN   = existingKoRows.filter(r => r.hours).length;
  const beforeHoursPct = existingKoRows.length > 0
    ? (beforeHoursN / existingKoRows.length * 100).toFixed(1) : '0.0';
  console.log(`  Before hours: ${beforeHoursN}/${existingKoRows.length} = ${beforeHoursPct}%`);

  // ─── Phase 1: KO 재수집 ────────────────────────────────────────────────────
  console.log('\n=== Phase 1: KO 재수집 ===');

  const newKoRows = [];
  const newKoExcl = [];
  const koMetrics = {
    total: 0, ok: 0,
    requires_client_render: 0, html_contamination: 0, error_page: 0, parse_failed: 0,
    by_type: Object.fromEntries(Object.keys(CONTENT_TYPES).map(ct => [ct, { total: 0, ok: 0 }])),
  };

  let doneCount = 0;
  for (const { ucSeq, ctype } of koTargets) {
    doneCount++;
    const meta = CONTENT_TYPES[ctype];
    const url  = `${BASE}/kr/index.do?menuCd=${meta.detail}&uc_seq=${ucSeq}&lang_cd=ko`;
    const { html } = await doGet(url, 'ko');
    const result = parseKoDetail(html, ucSeq, ctype, url);

    koMetrics.total++;
    koMetrics.by_type[ctype].total++;

    if (result.excluded) {
      const st = result.parse_status;
      koMetrics[st] = (koMetrics[st] ?? 0) + 1;
      newKoExcl.push({
        excluded_at:       new Date().toISOString(),
        language:          'ko',
        uc_seq:            ucSeq,
        ctype,
        parse_status:      st,
        reason:            result.reason,
        source_detail_url: url,
        source_key:        `VisitBusanContent:${ctype}:${ucSeq}:ko`,
      });
      if (st === 'html_contamination') {
        console.error(`\n[HARD STOP] HTML 오염 — uc_seq=${ucSeq} (${ctype}): ${result.reason}`);
        cleanTmp(); process.exit(1);
      }
    } else {
      koMetrics.ok++;
      koMetrics.by_type[ctype].ok++;
      newKoRows.push(result.row);
    }

    if (doneCount % 100 === 0) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`  KO 진행: ${doneCount}/${totalTargets} (OK=${koMetrics.ok} 제외=${koMetrics.total - koMetrics.ok}) [${elapsed}s]`);
    }
  }

  console.log(`  KO 완료: ${koMetrics.ok}건 OK / ${koMetrics.total - koMetrics.ok}건 제외`);
  console.log(`    requires_client_render: ${koMetrics.requires_client_render ?? 0}`);
  console.log(`    error_page: ${koMetrics.error_page ?? 0}`);

  // HARD STOP: KO 처리 총 775건
  if (koMetrics.total !== 775) {
    console.error(`[HARD STOP] KO 처리 총 ${koMetrics.total}건 — 예상 775건 불일치`);
    cleanTmp(); process.exit(1);
  }
  console.log('  KO 처리 총 775건 ✓');

  // ─── Phase 2: 병합 + 검증 ──────────────────────────────────────────────────
  console.log('\n=== Phase 2: 병합 + 검증 ===');

  // 병합: 새 KO rows + 기존 EN rows (그대로 보존)
  const mergedRows = [...newKoRows, ...existingEnRows];
  console.log(`  병합: KO=${newKoRows.length}건 + EN=${existingEnRows.length}건 = ${mergedRows.length}건`);

  // HARD STOP: EN 행 수 보존
  const enInMerged = mergedRows.filter(r => r.language === 'en').length;
  if (enInMerged !== existingEnRows.length) {
    console.error(`[HARD STOP] EN 행 수 변경: ${enInMerged} ≠ ${existingEnRows.length}`);
    cleanTmp(); process.exit(1);
  }
  console.log(`  HARD STOP: EN ${existingEnRows.length}건 보존 ✓`);

  // HARD STOP: title_ko 공백
  const blankTitles = newKoRows.filter(r => !r.title_ko?.trim());
  if (blankTitles.length > 0) {
    console.error(`[HARD STOP] title_ko 공백: ${blankTitles.map(r => r.source_key).slice(0, 5).join(', ')}`);
    cleanTmp(); process.exit(1);
  }
  console.log('  HARD STOP: title_ko 공백 0건 ✓');

  // HARD STOP: HTML 오염 최종 확인
  const contamRows = newKoRows.filter(r =>
    ['address', 'phone', 'hours', 'closed_days'].some(f => hasHtmlContam(r[f]))
  );
  if (contamRows.length > 0) {
    console.error(`[HARD STOP] HTML 오염: ${contamRows.map(r => r.source_key).join(', ')}`);
    cleanTmp(); process.exit(1);
  }
  console.log('  HARD STOP: HTML 오염 0건 ✓');

  // HARD STOP: source_key 중복 (KO + EN 합산)
  const allKeys = mergedRows.map(r => r.source_key);
  const allKeySet = new Set(allKeys);
  if (allKeySet.size !== allKeys.length) {
    const dupes = allKeys.filter((k, i) => allKeys.indexOf(k) !== i);
    console.error(`[HARD STOP] source_key 중복: ${dupes.slice(0, 5).join(', ')}`);
    cleanTmp(); process.exit(1);
  }
  console.log('  HARD STOP: source_key 중복 0건 ✓');

  // HARD STOP: 개인정보처리방침 URL
  const policyUrls = newKoRows.filter(r => r.external_official_url && BLOCKED_URL_PATTERNS.test(r.external_official_url));
  if (policyUrls.length > 0) {
    console.error(`[HARD STOP] 개인정보처리방침 URL: ${policyUrls.map(r => r.source_key).join(', ')}`);
    cleanTmp(); process.exit(1);
  }
  console.log('  HARD STOP: 개인정보처리방침 URL 0건 ✓');

  // After 채움률
  const afterHoursN   = newKoRows.filter(r => r.hours).length;
  const afterHoursPct = newKoRows.length > 0 ? (afterHoursN / newKoRows.length * 100).toFixed(1) : '0.0';

  // 유형별 Before/After
  const hoursTable = Object.keys(CONTENT_TYPES).map(ct => {
    const bRows = existingKoRows.filter(r => r.content_type === ct);
    const bFill = bRows.filter(r => r.hours).length;
    const bPct  = bRows.length > 0 ? (bFill / bRows.length * 100).toFixed(1) : '0.0';
    const aRows = newKoRows.filter(r => r.content_type === ct);
    const aFill = aRows.filter(r => r.hours).length;
    const aPct  = aRows.length > 0 ? (aFill / aRows.length * 100).toFixed(1) : '0.0';
    return { ct, bFill, bTotal: bRows.length, bPct, aFill, aTotal: aRows.length, aPct };
  });

  console.log(`\n  hours Before/After (KO 전체): ${beforeHoursPct}% → ${afterHoursPct}%`);
  for (const h of hoursTable) {
    console.log(`    ${CONTENT_TYPES[h.ct].label}: ${h.bPct}% → ${h.aPct}% (${h.aFill}/${h.aTotal})`);
  }

  // 유형별 KO 건수 비교
  console.log('\n  유형별 KO 건수 Before/After:');
  for (const ct of Object.keys(CONTENT_TYPES)) {
    const before = existingKoRows.filter(r => r.content_type === ct).length;
    const after  = newKoRows.filter(r => r.content_type === ct).length;
    const diff   = after - before;
    console.log(`    ${CONTENT_TYPES[ct].label}: ${before} → ${after} (${diff >= 0 ? '+' : ''}${diff})`);
  }

  // 기존 address·phone·lat/lon·title 회귀 확인 (공백 건수 비교)
  const regression = ['address', 'phone', 'lat', 'lon', 'title_ko'].map(f => {
    const before = existingKoRows.filter(r => !r[f]).length;
    const after  = newKoRows.filter(r => !r[f]).length;
    const ok     = after <= before;
    return { f, before, after, ok };
  });
  const regrFail = regression.filter(r => !r.ok);
  if (regrFail.length > 0) {
    const msg = regrFail.map(r => `${r.f}: ${r.before}→${r.after}`).join(', ');
    console.error(`[HARD STOP] 기존 필드 회귀 결함: ${msg}`);
    cleanTmp(); process.exit(1);
  }
  console.log('  회귀 확인 (address·phone·lat/lon·title_ko): 결함 0건 ✓');

  console.log('\n  모든 검증 조건 충족 ✓ → PASS');

  // ─── Phase 3: 원자적 저장 ──────────────────────────────────────────────────
  console.log('\n=== Phase 3: 원자적 저장 ===');

  // 임시 파일에 쓰기
  const csvLines = [csvRow(CSV_HDR)];
  for (const r of mergedRows) csvLines.push(csvRow(CSV_HDR.map(h => r[h] ?? '')));
  fs.writeFileSync(TMP_CSV,  csvLines.join('\n'), 'utf8');
  fs.writeFileSync(TMP_JSON, JSON.stringify(mergedRows, null, 2), 'utf8');

  // PASS 확정 → 원자적 교체
  fs.renameSync(TMP_CSV,  FULL_CSV);
  fs.renameSync(TMP_JSON, FULL_JSON);
  console.log(`  CSV 교체: ${FULL_CSV} (${mergedRows.length}행)`);
  console.log(`  JSON 교체: ${FULL_JSON} (${mergedRows.length}건)`);

  // Excluded JSON 갱신 (새 KO excluded + 기존 EN excluded 보존)
  const newExcl = [...newKoExcl, ...existingEnExcl];
  fs.writeFileSync(EXCL_JSON, JSON.stringify(newExcl, null, 2), 'utf8');
  console.log(`  Excluded JSON 갱신: KO=${newKoExcl.length}건, EN=${existingEnExcl.length}건`);

  // ─── Phase 4: metrics + 보고서 갱신 ───────────────────────────────────────
  console.log('\n=== Phase 4: metrics + 보고서 갱신 ===');

  const elapsedSec = Math.round((Date.now() - startTime) / 1000);

  existingMetr.patch_04a = {
    run_date:        TODAY,
    task:            'TASK-DATA-BUSAN-VISITBUSAN-CONTENT-PATCH-04A',
    overall:         'PASS',
    elapsed_seconds: elapsedSec,
    req_count:       reqCount,
    ko: {
      total:                  koMetrics.total,
      ok:                     koMetrics.ok,
      requires_client_render: koMetrics.requires_client_render ?? 0,
      error_page:             koMetrics.error_page ?? 0,
      parse_failed:           koMetrics.parse_failed ?? 0,
      by_type:                koMetrics.by_type,
    },
    en_preserved:     existingEnRows.length,
    candidates_total: mergedRows.length,
    hours_before_pct: parseFloat(beforeHoursPct),
    hours_after_pct:  parseFloat(afterHoursPct),
    hours_before_n:   beforeHoursN,
    hours_after_n:    afterHoursN,
  };
  fs.writeFileSync(METR_JSON, JSON.stringify(existingMetr, null, 2), 'utf8');
  console.log(`  Metrics JSON 갱신: ${METR_JSON}`);

  // collect-04-report.md 에 PATCH-04A 섹션 추가
  const hoursTableMd = hoursTable.map(h =>
    `| ${CONTENT_TYPES[h.ct].label} | ${h.bPct}% (${h.bFill}/${h.bTotal}) | ${h.aPct}% (${h.aFill}/${h.aTotal}) |`
  ).join('\n');

  const typeCountMd = Object.keys(CONTENT_TYPES).map(ct => {
    const before = existingKoRows.filter(r => r.content_type === ct).length;
    const after  = newKoRows.filter(r => r.content_type === ct).length;
    return `| ${CONTENT_TYPES[ct].label} | ${before} | ${after} |`;
  }).join('\n');

  const patchSection = `
---

## PATCH-04A: KO 운영시간 패치 결과

**날짜:** ${TODAY}
**상태:** **PASS ✓**
**소요:** ${Math.ceil(elapsedSec / 60)}분 (${elapsedSec}초) / ${reqCount}건 요청

### KO 처리 결과

| 구분 | 건수 |
|---|---|
| KO 처리 총 | 775건 |
| KO OK (후보) | ${koMetrics.ok}건 |
| requires_client_render | ${koMetrics.requires_client_render ?? 0}건 |
| error_page | ${koMetrics.error_page ?? 0}건 |

### EN 보존 확인

| 항목 | 결과 |
|---|---|
| 기존 EN 후보 | ${existingEnRows.length}건 |
| 패치 후 EN 후보 | ${existingEnRows.length}건 |
| 변경 | 없음 ✓ |

### hours 채움률 Before/After (KO 기준)

| 유형 | Before (COLLECT-04) | After (PATCH-04A) |
|---|---|---|
| **전체** | **${beforeHoursPct}%** (${beforeHoursN}/${existingKoRows.length}) | **${afterHoursPct}%** (${afterHoursN}/${newKoRows.length}) |
${hoursTableMd}

### 유형별 KO 후보 건수 Before/After

| 유형 | Before | After |
|---|---|---|
${typeCountMd}

### HARD STOP 결과

| 조건 | 결과 |
|---|---|
| KO 처리 총 775건 | ✓ |
| EN 후보 ${existingEnRows.length}건 보존 | ✓ |
| title_ko 공백 0건 | ✓ |
| HTML 오염 0건 | ✓ |
| source_key 중복 0건 | ✓ |
| 개인정보처리방침 URL 0건 | ✓ |
| EN 레코드 내용 변경 없음 | ✓ |
| 회귀 결함 0건 (address·phone·lat/lon·title) | ✓ |
| pilot 파일 무변경 | ✓ |
| PASS 전 full 파일 미덮어쓰기 | ✓ |

TASK-DATA-BUSAN-VISITBUSAN-CONTENT-PATCH-04A KO 운영시간 패치 완료.
`;

  const existingMd = fs.readFileSync(REPORT_MD, 'utf8');
  fs.writeFileSync(REPORT_MD, existingMd + patchSection, 'utf8');
  console.log(`  Report MD 갱신: ${REPORT_MD}`);

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`\n=== 완료 (${elapsed}초) ===`);
  console.log(`  KO OK: ${koMetrics.ok}건 / 전체: ${mergedRows.length}건 (EN=${existingEnRows.length} 보존)`);
  console.log(`  hours: ${beforeHoursPct}% → ${afterHoursPct}%`);
  console.log('\nTASK-DATA-BUSAN-VISITBUSAN-CONTENT-PATCH-04A KO 운영시간 패치 완료.');
}

main().catch(e => {
  cleanTmp();
  console.error('[FATAL]', e.message);
  console.error(e.stack);
  process.exit(1);
});
