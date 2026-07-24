#!/usr/bin/env node
/**
 * TASK-DATA-BUSAN-VISITBUSAN-CONTENT-COLLECT-04
 * VisitBusan 5개 일반 콘텐츠 유형 전체 KO/EN 수집
 *
 * Phase 0: ID 발견 (DISCOVERY-03 방식)
 * Phase 1: KO 상세 수집 (전체)
 * Phase 2: EN 상세 수집 (동일 전체 확인)
 * Phase 3: JA/ZhS/ZhT 상태 확인 (레코드 미생성)
 * Phase 4: 검증 (HARD STOP + FAIL 조건)
 * Phase 5: 출력 저장 (PASS만)
 * Phase 6: MD 보고서
 *
 * 출력 (PASS만):
 *   data/tourapi/candidates/busan/visitbusan-content-full.csv
 *   data/tourapi/candidates/busan/visitbusan-content-full.json
 *   data/tourapi/reports/busan/visitbusan-content-full-excluded.json
 *   data/tourapi/reports/busan/visitbusan-content-full-metrics.json
 *   docs/tourapi/visitbusan-content-collect-04-report.md
 *
 * 절대 금지:
 *   visitbusan-content-pilot.csv / .json 덮어쓰기
 *   DB·commit·push·본문·이미지 파일 저장
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
  attraction: { listing: 'DOM_000000201001000000', detail: 'DOM_000000201001001000', label: '명소' },
  food:       { listing: 'DOM_000000201002000000', detail: 'DOM_000000201002001000', label: '음식' },
  shopping:   { listing: 'DOM_000000201003000000', detail: 'DOM_000000201003001000', label: '쇼핑' },
  experience: { listing: 'DOM_000000202008000000', detail: 'DOM_000000202008001000', label: '체험' },
  course:     { listing: 'DOM_000000202012000000', detail: 'DOM_000000202012001000', label: '코스' },
};

// ─── 파일 경로 ────────────────────────────────────────────────────────────────
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

// CSV 헤더 (pilot과 동일)
const CSV_HDR = [
  'source_key','content_type','uc_seq','language',
  'title_ko','address','phone','lat','lon',
  'hours','closed_days','external_official_url','representative_menu',
  'image_url','category_label','language_available',
  'parse_status','missing_required_fields','source_detail_url','collected_at',
];

// ─── 유틸 ─────────────────────────────────────────────────────────────────────

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

const UI_TEXTS = new Set([
  '상세보기','자세히 보기','더보기','더 보기',
  'view detail','view details','view more','more','see more',
]);
function isUiText(s) {
  if (!s) return false;
  return UI_TEXTS.has(s.toLowerCase().replace(/[\s\.\!\?\-]+/g, ' ').trim());
}

const BLOCKED_URL_PATTERNS = /vprivacy|terms\.do|agreement|policy\.do|visitbusan\.net\/[a-z]{2}\/index/i;

// PARSER-FIX-02A-REV: var mtTitle + p-txt 주석만 (h1/h2·og:title·title 태그 금지)
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

// PARSER-FIX-02A-REV: 라벨 없으면 빈 문자열, 공통 푸터 URL 차단
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

function detectLanguage(html) {
  if (!html) return 'error';
  if (isErrorPage(html)) return 'error';
  const ko = (html.match(/[가-힣]/g) ?? []).length;
  const en = (html.match(/[a-zA-Z]/g) ?? []).length;
  if (ko === 0 && en > 100) return 'en';
  if (ko > 50 && en / (ko + en) < 0.4) return 'ko';
  if (en / (ko + en) > 0.7) return 'en';
  return 'ko';
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

// ─── Phase 0: ID 발견 (DISCOVERY-03 방식) ─────────────────────────────────────

function extractUcSeqs(html) {
  return [...new Set([...html.matchAll(/uc_seq=(\d+)/g)].map(m => m[1]))];
}

function extractCategoryButtons(html) {
  return [...html.matchAll(/<button[^>]+value="(\d+)"[^>]*class="[^"]*search_btn[^"]*"[^>]*>([^<]{1,30})<\/button>/gi)]
    .map(m => ({ code: m[1], label: m[2].trim() }));
}

function getLastPageNo(html) {
  const nos = [...html.matchAll(/page_no=(\d+)/g)].map(m => parseInt(m[1]));
  return nos.length ? Math.max(...nos) : 1;
}

async function discoverIds(ctype) {
  const meta = CONTENT_TYPES[ctype];
  const { html: firstHtml } = await doGet(`${BASE}/kr/index.do?menuCd=${meta.listing}`);
  if (!firstHtml) throw new Error(`[Phase 0] ${ctype} 목록 페이지 접근 실패`);

  const categories = extractCategoryButtons(firstHtml);

  if (ctype !== 'food') {
    const { html: allHtml } = await doGet(
      `${BASE}/kr/index.do?menuCd=${meta.listing}&ucc2_seq=&list_type=TYPE_SMALL_CARD&order_type=NEW&listCntPerPage2=500`
    );
    if (!allHtml) throw new Error(`[Phase 0] ${ctype} 전체 목록 접근 실패`);
    const ucSeqs = extractUcSeqs(allHtml);
    if (/btn_next/.test(allHtml)) {
      console.warn(`  [WARN] ${ctype}: listCntPerPage2=500에도 다음 페이지 있음 — page_no 순회 필요`);
    }
    return { categories, ucSeqs };
  }

  // food: page_no 순회 (listCntPerPage2=500 무시됨)
  const allIds = new Set();
  const lastPage = getLastPageNo(firstHtml);
  for (let p = 1; p <= lastPage + 1; p++) {
    const { html } = await doGet(
      `${BASE}/kr/index.do?menuCd=${meta.listing}&ucc2_seq=&list_type=TYPE_SMALL_CARD&order_type=NEW&listCntPerPage2=16&page_no=${p}`
    );
    if (!html) { console.warn(`  [WARN] food page_no=${p} 접근 실패`); continue; }
    const ids = extractUcSeqs(html);
    const newCount = ids.filter(id => !allIds.has(id)).length;
    for (const id of ids) allIds.add(id);
    if (newCount === 0 && p > 1) break;
  }
  return { categories, ucSeqs: [...allIds] };
}

// ─── KO 상세 파싱 ─────────────────────────────────────────────────────────────

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

// ─── EN 상세 파싱 ─────────────────────────────────────────────────────────────

function parseEnDetail(html, ucSeq, ctype, detailUrl) {
  const meta = CONTENT_TYPES[ctype];
  const now  = new Date().toISOString();

  if (!html || isErrorPage(html)) {
    return { excluded: true, parse_status: 'error_page', reason: 'http_error_or_short', uc_seq: ucSeq, ctype, source_detail_url: detailUrl };
  }

  const detectedLang = detectLanguage(html);
  if (detectedLang !== 'en') {
    return { excluded: true, parse_status: 'not_en_page', reason: `detected_lang=${detectedLang}`, uc_seq: ucSeq, ctype, source_detail_url: detailUrl };
  }

  const title = extractTitle(html);
  if (!title) {
    return { excluded: true, parse_status: 'language_content_unavailable', reason: 'en_var_mtTitle_absent', uc_seq: ucSeq, ctype, source_detail_url: detailUrl };
  }

  const coords = extractCoords(html);
  const row = {
    source_key:             `VisitBusanContent:${ctype}:${ucSeq}:en`,
    content_type:           ctype,
    uc_seq:                 ucSeq,
    language:               'en',
    title_ko:               title,
    address:                extractInfoField(html, 'Address', '주소', '도로명주소'),
    phone:                  extractInfoField(html, 'Phone', 'Inquiry', 'Inquiries', 'Tel', '전화번호', 'TEL'),
    lat:                    coords.lat,
    lon:                    coords.lon,
    hours:                  extractInfoField(html, 'Opening Hours', 'Hours', '운영요일 및 시간', '운영시간', 'Operating', 'Open'),
    closed_days:            extractInfoField(html, 'Closed', 'Closing Dates', '휴무일', '휴관일'),
    external_official_url:  extractOfficialUrl(html),
    representative_menu:    ctype === 'food' ? extractInfoField(html, 'Best Menu', 'Representative Menu', '대표 메뉴', '대표메뉴') : '',
    image_url:              extractImageUrl(html),
    category_label:         extractCategory(html, meta.label),
    language_available:     true,
    parse_status:           'ok',
    missing_required_fields:'',
    source_detail_url:      detailUrl,
    collected_at:           now,
  };

  const missing = [];
  if (!row.address)   missing.push('address');
  if (!row.lat)       missing.push('lat');
  if (!row.lon)       missing.push('lon');
  if (!row.image_url) missing.push('image_url');
  if (missing.length) row.missing_required_fields = missing.join('|');

  return { excluded: false, row };
}

// ─── 메인 ─────────────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();
  console.log('=== TASK-DATA-BUSAN-VISITBUSAN-CONTENT-COLLECT-04 시작 ===');
  console.log(`날짜: ${TODAY}, DELAY_MS: ${DELAY_MS}\n`);

  // HARD STOP: 전체 출력 파일 이미 존재하면 중단
  if (fs.existsSync(FULL_CSV) || fs.existsSync(FULL_JSON)) {
    console.error('[HARD STOP] 전체 수집 출력 파일이 이미 존재합니다. 덮어쓰기 절대 금지.');
    process.exit(1);
  }

  [CAND_DIR, RPT_DIR, DOC_DIR].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });

  // ─── Phase 0: ID 발견 ──────────────────────────────────────────────────────
  console.log('=== Phase 0: ID 발견 (DISCOVERY-03 방식) ===');
  const discoveryMap = {};
  for (const ctype of Object.keys(CONTENT_TYPES)) {
    process.stdout.write(`  [${ctype}] 발견 중...`);
    const { categories, ucSeqs } = await discoverIds(ctype);
    discoveryMap[ctype] = { categories, ucSeqs };
    console.log(` ${ucSeqs.length}건, 카테고리 ${categories.length}개: [${categories.map(c=>`${c.code}:${c.label}`).join(', ')}]`);
  }

  const allUcSeqEntries = [];
  for (const [ctype, d] of Object.entries(discoveryMap)) {
    for (const ucSeq of d.ucSeqs) allUcSeqEntries.push([ucSeq, ctype]);
  }
  // 중복 제거 (ucSeq 기준)
  const seenUcSeqs = new Set();
  const uniqueEntries = allUcSeqEntries.filter(([ucSeq]) => {
    if (seenUcSeqs.has(ucSeq)) return false;
    seenUcSeqs.add(ucSeq);
    return true;
  });
  const totalIds = uniqueEntries.length;
  const countByType = {};
  for (const [ctype, d] of Object.entries(discoveryMap)) {
    countByType[ctype] = d.ucSeqs.length;
  }
  console.log(`\n  전체 ID: ${totalIds}건`);
  for (const [ct, n] of Object.entries(countByType)) console.log(`    ${ct}: ${n}건`);

  if (totalIds < 750 || totalIds > 820) {
    console.error(`[HARD STOP] 전체 ID ${totalIds}건 — 예상 범위 750~820 벗어남`);
    process.exit(1);
  }

  // ─── Phase 1: KO 상세 수집 ─────────────────────────────────────────────────
  console.log('\n=== Phase 1: KO 상세 수집 ===');

  const allRows      = [];
  const excludedRows = [];
  const koMetrics = { total: 0, ok: 0, requires_client_render: 0, html_contamination: 0, error_page: 0, by_type: {} };
  for (const ct of Object.keys(CONTENT_TYPES)) {
    koMetrics.by_type[ct] = { total: 0, ok: 0, requires_client_render: 0, html_contamination: 0, error_page: 0 };
  }

  let doneCount = 0;
  for (const [ucSeq, ctype] of uniqueEntries) {
    doneCount++;
    const meta = CONTENT_TYPES[ctype];
    const url = `${BASE}/kr/index.do?menuCd=${meta.detail}&uc_seq=${ucSeq}&lang_cd=ko`;
    const { html } = await doGet(url, 'ko');
    const result = parseKoDetail(html, ucSeq, ctype, url);

    koMetrics.total++;
    koMetrics.by_type[ctype].total++;

    if (result.excluded) {
      const st = result.parse_status;
      koMetrics[st] = (koMetrics[st] ?? 0) + 1;
      koMetrics.by_type[ctype][st] = (koMetrics.by_type[ctype][st] ?? 0) + 1;
      excludedRows.push({ excluded_at: new Date().toISOString(), language: 'ko', uc_seq: ucSeq, ctype, parse_status: st, reason: result.reason, source_detail_url: url });
      if (st === 'html_contamination') {
        console.error(`\n[HARD STOP] HTML 오염 — uc_seq=${ucSeq} (${ctype}): ${result.reason}`);
        process.exit(1);
      }
    } else {
      koMetrics.ok++;
      koMetrics.by_type[ctype].ok++;
      allRows.push(result.row);
    }

    if (doneCount % 100 === 0) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`  KO 진행: ${doneCount}/${totalIds} (OK=${koMetrics.ok} 제외=${koMetrics.total - koMetrics.ok}) [${elapsed}s]`);
    }
  }

  console.log(`  KO 완료: ${koMetrics.ok}건 OK / ${koMetrics.total - koMetrics.ok}건 제외`);

  // HARD STOP: KO source_key 중복
  const koKeys = allRows.map(r => r.source_key);
  const koKeySet = new Set(koKeys);
  if (koKeySet.size !== koKeys.length) {
    const dupes = koKeys.filter((k, i) => koKeys.indexOf(k) !== i);
    console.error(`[HARD STOP] KO source_key 중복: ${dupes.slice(0,5).join(', ')}`);
    process.exit(1);
  }
  console.log('  KO source_key 중복 없음 ✓');

  // ─── Phase 2: EN 상세 수집 ─────────────────────────────────────────────────
  console.log('\n=== Phase 2: EN 상세 수집 (전체 ID 동일 확인) ===');

  const enMetrics = { total: 0, ok: 0, language_content_unavailable: 0, not_en_page: 0, error_page: 0, by_type: {} };
  for (const ct of Object.keys(CONTENT_TYPES)) {
    enMetrics.by_type[ct] = { total: 0, ok: 0, language_content_unavailable: 0, not_en_page: 0, error_page: 0 };
  }

  doneCount = 0;
  for (const [ucSeq, ctype] of uniqueEntries) {
    doneCount++;
    const meta = CONTENT_TYPES[ctype];
    const url = `${BASE}/en/index.do?menuCd=${meta.detail}&uc_seq=${ucSeq}&lang_cd=en`;
    const { html } = await doGet(url, 'en');
    const result = parseEnDetail(html, ucSeq, ctype, url);

    enMetrics.total++;
    enMetrics.by_type[ctype].total++;

    if (result.excluded) {
      const st = result.parse_status;
      enMetrics[st] = (enMetrics[st] ?? 0) + 1;
      enMetrics.by_type[ctype][st] = (enMetrics.by_type[ctype][st] ?? 0) + 1;
      excludedRows.push({ excluded_at: new Date().toISOString(), language: 'en', uc_seq: ucSeq, ctype, parse_status: st, reason: result.reason, source_detail_url: url });
    } else {
      enMetrics.ok++;
      enMetrics.by_type[ctype].ok++;
      allRows.push(result.row);
    }

    if (doneCount % 100 === 0) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`  EN 진행: ${doneCount}/${totalIds} (OK=${enMetrics.ok} 제외=${enMetrics.total - enMetrics.ok}) [${elapsed}s]`);
    }
  }

  console.log(`  EN 완료: ${enMetrics.ok}건 OK / ${enMetrics.total - enMetrics.ok}건 제외`);

  // FAIL: EN 합계 검증
  const enExcludedTotal = (enMetrics.language_content_unavailable ?? 0) + (enMetrics.not_en_page ?? 0) + (enMetrics.error_page ?? 0);
  const enGrandTotal = enMetrics.ok + enExcludedTotal;
  if (enGrandTotal !== totalIds) {
    console.error(`[FAIL] EN 합계 불일치: ${enGrandTotal} ≠ ${totalIds} (ok=${enMetrics.ok} excl=${enExcludedTotal})`);
    process.exit(1);
  }
  console.log(`  EN 합계 검증 통과: ${enGrandTotal} = ${totalIds} ✓`);

  // ─── Phase 3: JA/ZhS/ZhT 상태 확인 (레코드 미생성) ────────────────────────
  console.log('\n=== Phase 3: JA/ZhS/ZhT 상태 확인 ===');

  const jaZhMetrics = {};
  for (const [ctype, d] of Object.entries(discoveryMap)) {
    const ucSeq = d.ucSeqs[0];
    const meta  = CONTENT_TYPES[ctype];
    jaZhMetrics[ctype] = {};
    for (const lang of ['ja', 'zhs', 'zht']) {
      const lp = LANG_PATH[lang];
      const url = `${BASE}/${lp}/index.do?menuCd=${meta.detail}&uc_seq=${ucSeq}`;
      const { html } = await doGet(url, lang);
      const accessible = !!(html && !isErrorPage(html));
      const title = accessible ? extractTitle(html) : null;
      jaZhMetrics[ctype][lang] = { uc_seq: ucSeq, accessible, title };
      console.log(`  [${ctype}/${lang}] accessible=${accessible}, title="${title?.slice(0, 30) ?? 'N/A'}"`);
    }
  }

  // ─── Phase 4: 검증 ─────────────────────────────────────────────────────────
  console.log('\n=== Phase 4: 검증 ===');

  // HARD STOP 1: title_ko 공백 후보 레코드 (requires_client_render 이미 제외됨)
  const blankTitles = allRows.filter(r => !r.title_ko?.trim());
  if (blankTitles.length > 0) {
    console.error(`[HARD STOP] title_ko 공백 후보 레코드: ${blankTitles.map(r => r.source_key).slice(0,5).join(', ')}`);
    process.exit(1);
  }
  console.log('  HARD STOP 1: title_ko 공백 0건 ✓');

  // HARD STOP 2: HTML 오염 (Phase 1에서 이미 즉시 중단하므로 여기서는 최종 확인)
  const contamRows = allRows.filter(r =>
    ['address','phone','hours','closed_days'].some(f => hasHtmlContam(r[f]))
  );
  if (contamRows.length > 0) {
    console.error(`[HARD STOP] HTML 오염 후보 레코드 잔류: ${contamRows.map(r => r.source_key).join(', ')}`);
    process.exit(1);
  }
  console.log('  HARD STOP 2: HTML 오염 0건 ✓');

  // HARD STOP 3: source_key 중복 (KO + EN 합산)
  const allKeys = allRows.map(r => r.source_key);
  const allKeySet = new Set(allKeys);
  if (allKeySet.size !== allKeys.length) {
    const dupes = allKeys.filter((k, i) => allKeys.indexOf(k) !== i);
    console.error(`[HARD STOP] source_key 중복: ${dupes.slice(0,5).join(', ')}`);
    process.exit(1);
  }
  console.log('  HARD STOP 3: source_key 중복 0건 ✓');

  // FAIL: 개인정보처리방침 URL
  const policyUrls = allRows.filter(r => r.external_official_url && BLOCKED_URL_PATTERNS.test(r.external_official_url));
  if (policyUrls.length > 0) {
    console.error(`[FAIL] 개인정보처리방침 URL 잔류: ${policyUrls.map(r => r.source_key).join(', ')}`);
    process.exit(1);
  }
  console.log('  FAIL 조건: 개인정보처리방침 URL 0건 ✓');

  // FAIL: EN 허위 fallback (KO 카테고리 라벨 문자열)
  const koCategories = ['명소','음식','쇼핑','체험','추천여행','추천코스','일정여행'];
  const falseFallbacks = allRows.filter(r => r.language === 'en' && koCategories.includes(r.title_ko?.trim()));
  if (falseFallbacks.length > 0) {
    console.error(`[FAIL] EN 허위 fallback (KO 카테고리): ${falseFallbacks.map(r => r.source_key).join(', ')}`);
    process.exit(1);
  }
  console.log('  FAIL 조건: EN 허위 fallback 0건 ✓');

  // FAIL: 파일럿 파일 덮어쓰기 금지 최종 확인
  if (fs.existsSync(FULL_CSV) || fs.existsSync(FULL_JSON)) {
    console.error('[FAIL] 전체 수집 출력 파일이 이미 존재 — 덮어쓰기 금지');
    process.exit(1);
  }
  console.log('  FAIL 조건: 파일 덮어쓰기 없음 ✓');

  console.log('  모든 검증 조건 충족 ✓ → PASS');

  // ─── Phase 5: 출력 저장 (PASS) ─────────────────────────────────────────────
  console.log('\n=== Phase 5: 출력 저장 ===');

  const koRows = allRows.filter(r => r.language === 'ko');
  const enRows = allRows.filter(r => r.language === 'en');

  // CSV
  const csvLines = [csvRow(CSV_HDR)];
  for (const r of allRows) csvLines.push(csvRow(CSV_HDR.map(h => r[h] ?? '')));
  fs.writeFileSync(FULL_CSV, csvLines.join('\n'), 'utf8');
  console.log(`  CSV: ${FULL_CSV} (${allRows.length}행)`);

  // JSON
  fs.writeFileSync(FULL_JSON, JSON.stringify(allRows, null, 2), 'utf8');
  console.log(`  JSON: ${FULL_JSON}`);

  // Excluded JSON
  fs.writeFileSync(EXCL_JSON, JSON.stringify(excludedRows, null, 2), 'utf8');
  console.log(`  Excluded JSON: ${EXCL_JSON} (${excludedRows.length}건)`);

  // Metrics JSON
  const elapsedSec = Math.round((Date.now() - startTime) / 1000);
  const metrics = {
    run_date:             TODAY,
    task:                 'TASK-DATA-BUSAN-VISITBUSAN-CONTENT-COLLECT-04',
    overall:              'PASS',
    elapsed_seconds:      elapsedSec,
    req_count:            reqCount,
    total_ids_discovered: totalIds,
    count_by_type:        countByType,
    candidates_total:     allRows.length,
    ko: {
      total:                   koMetrics.total,
      ok:                      koMetrics.ok,
      requires_client_render:  koMetrics.requires_client_render ?? 0,
      error_page:              koMetrics.error_page ?? 0,
      by_type:                 koMetrics.by_type,
    },
    en: {
      total:                        enMetrics.total,
      ok:                           enMetrics.ok,
      language_content_unavailable: enMetrics.language_content_unavailable ?? 0,
      not_en_page:                  enMetrics.not_en_page ?? 0,
      error_page:                   enMetrics.error_page ?? 0,
      by_type:                      enMetrics.by_type,
    },
    ja_zhs_zht_status: jaZhMetrics,
  };
  fs.writeFileSync(METR_JSON, JSON.stringify(metrics, null, 2), 'utf8');
  console.log(`  Metrics JSON: ${METR_JSON}`);

  // ─── Phase 6: MD 보고서 ────────────────────────────────────────────────────
  console.log('\n=== Phase 6: MD 보고서 ===');

  function fillRate(field, rows) {
    if (!rows.length) return '0%';
    return ((rows.filter(r => r[field]).length / rows.length) * 100).toFixed(1) + '%';
  }

  const typeTable = Object.entries(CONTENT_TYPES).map(([ct, meta]) => {
    const koCt  = koRows.filter(r => r.content_type === ct);
    const enCt  = enRows.filter(r => r.content_type === ct);
    const disc  = countByType[ct] ?? 0;
    const koRcr = koMetrics.by_type[ct]?.requires_client_render ?? 0;
    const koErr = koMetrics.by_type[ct]?.error_page ?? 0;
    return `| ${meta.label} | ${disc} | ${koCt.length} | ${koRcr + koErr} | ${enCt.length} |`;
  }).join('\n');

  const jaZhTable = Object.entries(jaZhMetrics).flatMap(([ct, langs]) =>
    Object.entries(langs).map(([lang, d]) =>
      `| ${ct} | ${lang} | ${d.uc_seq} | ${d.accessible ? '✓' : '✗'} | ${d.title?.slice(0,25) ?? 'N/A'} |`
    )
  ).join('\n');

  const md = `# TASK-DATA-BUSAN-VISITBUSAN-CONTENT-COLLECT-04 완료 보고서

**날짜:** ${TODAY}
**상태:** **PASS ✓**
**소요 시간:** ${Math.ceil(elapsedSec / 60)}분 (${elapsedSec}초)
**총 요청:** ${reqCount}건

---

## 1. 수집 결과 요약

| 항목 | 건수 |
|---|---|
| 전체 ID 발견 | ${totalIds}건 |
| KO 후보 레코드 | ${koRows.length}건 |
| EN 후보 레코드 | ${enRows.length}건 |
| **전체 후보 레코드** | **${allRows.length}건** |
| 제외 레코드 | ${excludedRows.length}건 |

---

## 2. 유형별 결과

| 유형 | 발견 | KO 후보 | KO 제외 | EN 후보 |
|---|---|---|---|---|
${typeTable}

---

## 3. KO 파싱 결과

| 구분 | 건수 |
|---|---|
| KO OK | ${koMetrics.ok} |
| requires_client_render | ${koMetrics.requires_client_render ?? 0} |
| error_page | ${koMetrics.error_page ?? 0} |
| **합계** | **${koMetrics.total}** |

---

## 4. EN 결과

| 구분 | 건수 |
|---|---|
| EN OK (후보 생성) | ${enMetrics.ok} |
| language_content_unavailable | ${enMetrics.language_content_unavailable ?? 0} |
| not_en_page | ${enMetrics.not_en_page ?? 0} |
| error_page | ${enMetrics.error_page ?? 0} |
| **합계** | **${enMetrics.total}** (= ID 전체 ${totalIds}) |

---

## 5. 채움률 (KO 후보 기준)

| 필드 | 채움률 |
|---|---|
| address | ${fillRate('address', koRows)} |
| phone | ${fillRate('phone', koRows)} |
| lat | ${fillRate('lat', koRows)} |
| lon | ${fillRate('lon', koRows)} |
| hours | ${fillRate('hours', koRows)} |
| closed_days | ${fillRate('closed_days', koRows)} |
| external_official_url | ${fillRate('external_official_url', koRows)} |
| image_url | ${fillRate('image_url', koRows)} |

---

## 6. 검증 조건

| 조건 | 결과 |
|---|---|
| HARD STOP 1: title_ko 공백 0건 | ✓ |
| HARD STOP 2: HTML 오염 0건 | ✓ |
| HARD STOP 3: source_key 중복 0건 | ✓ |
| FAIL: 개인정보처리방침 URL 0건 | ✓ |
| FAIL: EN 허위 fallback 0건 | ✓ |
| FAIL: 파일럿 파일 덮어쓰기 없음 | ✓ |
| FAIL: EN 합계 = ID 전체 | ✓ ${enMetrics.total} = ${totalIds} |

---

## 7. JA/ZhS/ZhT 상태 (레코드 미생성)

| 유형 | 언어 | uc_seq | 접근 | 표본 제목 |
|---|---|---|---|---|
${jaZhTable}

---

## 8. 출력 파일

| 파일 | 설명 |
|---|---|
| visitbusan-content-full.csv | ${allRows.length}행 후보 레코드 |
| visitbusan-content-full.json | ${allRows.length}건 JSON |
| visitbusan-content-full-excluded.json | ${excludedRows.length}건 제외 레코드 (requires_client_render + EN 미제공) |
| visitbusan-content-full-metrics.json | 지표 요약 |
| visitbusan-content-collect-04-report.md | 본 보고서 |

---

## 9. 다음 단계

TourAPI/KTO matched / web_only / api_only / manual_review 비교

---

TASK-DATA-BUSAN-VISITBUSAN-CONTENT-COLLECT-04 VisitBusan 일반 콘텐츠 전체 수집 완료.
`;

  fs.writeFileSync(REPORT_MD, md, 'utf8');
  console.log(`  MD: ${REPORT_MD}`);

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`\n=== 완료 (${elapsed}초) ===`);
  console.log(`  후보 레코드: ${allRows.length}건 (KO=${koRows.length}, EN=${enRows.length})`);
  console.log(`  제외: ${excludedRows.length}건`);
  console.log(`  총 요청: ${reqCount}건`);
  console.log('\nTASK-DATA-BUSAN-VISITBUSAN-CONTENT-COLLECT-04 VisitBusan 일반 콘텐츠 전체 수집 완료.');
}

main().catch(e => {
  console.error('[FATAL]', e.message);
  console.error(e.stack);
  process.exit(1);
});
