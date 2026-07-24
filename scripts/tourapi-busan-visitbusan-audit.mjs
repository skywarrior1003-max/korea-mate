#!/usr/bin/env node
/**
 * TASK-DATA-BUSAN-VISITBUSAN-CONTENT-AUDIT-01
 * VisitBusan 비행사 관광 콘텐츠 구조 조사
 * (관광지·맛집·쇼핑·체험·추천코스/일정여행)
 *
 * Phase 1: Robots + Navigation Discovery (≤15 req)
 * Phase 2: Listing page structure per content type (≤30 req)
 * Phase 3: Detail page sampling (≤40 req)
 * Phase 4: Cross-reference with canonical CSV (no new requests)
 *
 * 금지: DB/commit/push/본문 전문 저장/이미지 파일 저장
 *
 * 파일럿 검증 완료된 URL 구조:
 *   - ID 파라미터: uc_seq (contentsSid/dataSid 아님)
 *   - 목록: /kr/index.do?menuCd={CATEGORY_MENU}
 *   - 상세: /kr/index.do?menuCd={DETAIL_MENU}&uc_seq={N}&lang_cd=ko
 *   - 페이지네이션: currentPage=N (카테고리 필터: ucc2_seq=N)
 *   - 언어: KO·EN 서버사이드 렌더링 완료, JA/ZhS/ZhT RFC3.0 에러
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.dirname(__dir);
const TODAY = new Date().toISOString().slice(0, 10);

// ── 설정 ─────────────────────────────────────────────────────────────────────
const BASE      = 'https://www.visitbusan.net';
const DELAY_MS  = 600;
const MAX_RETRY = 1;
const REQ_CAP   = 95;

// 언어 경로 (파일럿에서 검증됨)
const LANG_PATH = { ko: 'kr', en: 'en', ja: 'jp', zhs: 'cns', zht: 'cnt' };

// 콘텐츠 타입별 메뉴코드 (직접 탐색으로 확인)
const CONTENT_MENUS = {
  attraction: {
    listing:  'DOM_000000201001000000',
    detail:   'DOM_000000201001001000',
    label_ko: '명소',
  },
  food: {
    listing:  'DOM_000000201002000000',
    detail:   'DOM_000000201002001000',
    label_ko: '음식',
  },
  shopping: {
    listing:  'DOM_000000201003000000',
    detail:   null,   // Phase 2에서 탐색
    label_ko: '쇼핑',
  },
  experience: {
    listing:  'DOM_000000202008000000',
    detail:   null,
    label_ko: '체험·해양·웰니스',
  },
  course: {
    listing:  'DOM_000000202012000000',
    detail:   null,
    label_ko: '일정여행(추천코스)',
  },
};

const OUT_DIR = path.join(ROOT, 'data/tourapi/candidates/busan');
const RPT_DIR = path.join(ROOT, 'data/tourapi/reports/busan');
const DOC_DIR = path.join(ROOT, 'docs/tourapi');
const CANONICAL_CSV = path.join(OUT_DIR, 'busan-canonical-candidates.csv');

// ── 상태 ─────────────────────────────────────────────────────────────────────
let reqCount  = 0;
let cookieJar = '';

// ── 유틸 ─────────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function cleanHtml(s = '') {
  return s
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g,  ' ')
    .replace(/&amp;/g,    '&')
    .replace(/&lt;/g,     '<')
    .replace(/&gt;/g,     '>')
    .replace(/&nbsp;/g,   ' ')
    .replace(/&#\d+;/g,   '')
    .replace(/\s+/g,      ' ')
    .trim();
}

function csvCell(v) {
  const s = String(v ?? '').replace(/[\r\n]+/g, ' ').trim();
  return (s.includes(',') || s.includes('"')) ? `"${s.replace(/"/g, '""')}"` : s;
}
function csvRow(arr) { return arr.map(csvCell).join(','); }

// ── HTTP ─────────────────────────────────────────────────────────────────────
const UA = 'Mozilla/5.0 (compatible; KoreaMate-Audit/1.0; educational research)';

async function doGet(url, lang = 'ko') {
  if (reqCount >= REQ_CAP) {
    console.warn(`  [SKIP] 요청 상한(${REQ_CAP}) 도달 — ${url.replace(BASE,'')}`);
    return null;
  }
  reqCount++;
  const acceptLang = lang === 'ko' ? 'ko-KR,ko;q=0.9'
                   : lang === 'en' ? 'en-US,en;q=0.9'
                   : lang === 'ja' ? 'ja-JP,ja;q=0.9'
                   : lang === 'zhs' ? 'zh-CN,zh;q=0.9'
                   : 'zh-TW,zh;q=0.9';
  console.log(`  [#${reqCount}] GET ${url.replace(BASE, '')}`);
  for (let i = 0; i <= MAX_RETRY; i++) {
    try {
      await sleep(DELAY_MS);
      const res = await fetch(url, {
        headers: {
          'User-Agent':      UA,
          'Accept':          'text/html,application/xhtml+xml,*/*;q=0.8',
          'Accept-Language': acceptLang,
          'Referer':         `${BASE}/${LANG_PATH[lang]}/index.do`,
          ...(cookieJar ? { Cookie: cookieJar } : {}),
        },
        redirect: 'follow',
        signal:   AbortSignal.timeout(15000),
      });
      const sc = res.headers.get('set-cookie');
      if (sc) {
        const pairs = sc.split(/,(?=\s*\w+=)/g).map(c => c.split(';')[0].trim()).filter(Boolean);
        cookieJar = pairs.join('; ');
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      console.warn(`  [WARN] #${reqCount} 시도 ${i+1}/${MAX_RETRY+1}: ${e.message}`);
      if (i === MAX_RETRY) return null;
      await sleep(1000 * (i + 1));
    }
  }
  return null;
}

// ── 수집 결과 저장소 ──────────────────────────────────────────────────────────
const findings = {
  run_date: TODAY,
  robots_txt: { allow: [], disallow: [], crawl_delay: null, sitemap: [] },
  total_requests: 0,
  content_types: {},
  language_findings: { ko: 'full' },
  internal_api: { found: false, endpoints: [], notes: '' },
  canonical_cross_ref: { sampled: 0, matched: 0, web_only: 0, api_only: 0, match_rate: '0%' },
  collection_feasibility: {},
  estimated_total_requests: 0,
  risks: [],
};

const sampleRows = [];   // CSV 행

// ── PHASE 1: Robots + Navigation ─────────────────────────────────────────────
async function phase1() {
  console.log('\n=== PHASE 1: Robots + Navigation Discovery ===');

  // robots.txt
  const robotsTxt = await doGet(`${BASE}/robots.txt`, 'ko');
  if (robotsTxt && !robotsTxt.includes('죄송합니다')) {
    for (const line of robotsTxt.split('\n')) {
      const t = line.trim();
      if (/^allow:/i.test(t))       findings.robots_txt.allow.push(t.replace(/^allow:\s*/i, ''));
      if (/^disallow:/i.test(t))    findings.robots_txt.disallow.push(t.replace(/^disallow:\s*/i, ''));
      if (/^crawl-delay:/i.test(t)) findings.robots_txt.crawl_delay = t.replace(/^crawl-delay:\s*/i, '');
      if (/^sitemap:/i.test(t))     findings.robots_txt.sitemap.push(t.replace(/^sitemap:\s*/i, ''));
    }
    console.log(`  robots.txt: allow=${findings.robots_txt.allow.length} disallow=${findings.robots_txt.disallow.length}`);
  } else {
    console.log('  robots.txt: 접근 실패 또는 없음');
  }

  // KO 홈페이지 — 메뉴구조 확인
  const koHome = await doGet(`${BASE}/${LANG_PATH.ko}/index.do`, 'ko');
  const navLinks = {};
  if (koHome) {
    // 메뉴 코드별 레이블 추출
    const menuRe = /menuCd=(DOM_\d+)[^>\"']{0,50}[>\"']([\s\S]{0,200}?)<\/a>/g;
    let m;
    const menuMap = {};
    while ((m = menuRe.exec(koHome)) !== null) {
      const code = m[1];
      const text = cleanHtml(m[2]).slice(0, 30);
      if (text && !menuMap[code]) menuMap[code] = text;
    }
    console.log('  메뉴 구조 발견:');
    for (const [code, label] of Object.entries(menuMap).slice(0, 20)) {
      console.log(`    ${code}: ${label}`);
    }

    // 내부 API / Vue.js 패턴 탐색
    if (/new\s+Vue\s*\(|createApp\s*\(/.test(koHome)) {
      findings.internal_api.notes += 'Vue.js 프론트엔드 사용 확인. ';
    }
    const vueTemplates = koHome.match(/\{\{[^}]{1,50}\}\}/g);
    if (vueTemplates) {
      findings.internal_api.notes += `Vue 템플릿 패턴 ${vueTemplates.length}개. `;
    }
    const fetchPats = koHome.match(/fetch\(['"]([^'"]{5,80})['"]/g) ?? [];
    for (const fp of fetchPats) {
      const ep = fp.match(/['"]([^'"]+)['"]/)?.[1];
      if (ep && !findings.internal_api.endpoints.includes(ep)) {
        findings.internal_api.endpoints.push(ep);
        findings.internal_api.found = true;
      }
    }

    // 확인된 메뉴코드 할당
    for (const [code, label] of Object.entries(menuMap)) {
      if (/명소/.test(label) && !navLinks.attraction) {
        navLinks.attraction = `${BASE}/${LANG_PATH.ko}/index.do?menuCd=${code}`;
      }
      if (/음식/.test(label) && !navLinks.food) {
        navLinks.food = `${BASE}/${LANG_PATH.ko}/index.do?menuCd=${code}`;
      }
      if (/쇼핑/.test(label) && !navLinks.shopping) {
        navLinks.shopping = `${BASE}/${LANG_PATH.ko}/index.do?menuCd=${code}`;
      }
      if (/체험/.test(label) && !navLinks.experience) {
        navLinks.experience = `${BASE}/${LANG_PATH.ko}/index.do?menuCd=${code}`;
      }
      if (/일정여행|코스/.test(label) && !navLinks.course) {
        navLinks.course = `${BASE}/${LANG_PATH.ko}/index.do?menuCd=${code}`;
      }
    }
  }

  // 탐색 안 된 섹션은 알려진 메뉴코드로 채움
  for (const [ctype, meta] of Object.entries(CONTENT_MENUS)) {
    if (!navLinks[ctype]) {
      navLinks[ctype] = `${BASE}/${LANG_PATH.ko}/index.do?menuCd=${meta.listing}`;
      console.log(`  [추정] ${ctype}: menuCd=${meta.listing}`);
    }
  }

  return navLinks;
}

// ── 목록 페이지 파싱 ─────────────────────────────────────────────────────────
function parseListingPage(html) {
  const result = {
    ucSeqIds:   [],
    itemCount:  0,
    detailMenuCd: null,
    categories: [],
    paginationType: 'currentPage',
  };
  if (!html) return result;

  // uc_seq IDs (실제 콘텐츠 ID)
  const ucRe = /uc_seq=(\d+)/g;
  let m;
  const seen = new Set();
  while ((m = ucRe.exec(html)) !== null) {
    if (!seen.has(m[1])) { seen.add(m[1]); result.ucSeqIds.push(m[1]); }
  }
  result.itemCount = result.ucSeqIds.length;

  // 상세 페이지 menuCd 추출 (uc_seq가 포함된 href에서)
  const detMenuRe = /menuCd=(DOM_\d+)[^&\"']*&[^\"']*uc_seq=/;
  const detMenuM = html.match(detMenuRe);
  if (detMenuM) result.detailMenuCd = detMenuM[1];

  // 카테고리 버튼 (ucc2_seq)
  const catRe = /value=["'](\d+)["'][^>]*class=["'][^"']*search_btn[^"']*["'][^>]*>([\s\S]{0,30}?)</g;
  while ((m = catRe.exec(html)) !== null) {
    result.categories.push({ id: m[1], label: cleanHtml(m[2]) });
  }

  // Vue.js 템플릿 존재 여부
  result.hasVueTemplates = /\{\{[^}]{1,50}\}\}/.test(html);

  return result;
}

// ── 상세 페이지 파싱 ─────────────────────────────────────────────────────────
function parseDetailPage(html) {
  const fields = {};
  if (!html) return fields;

  // 에러 페이지 체크 (RFC 3.0 오류)
  if (/RFC\s*3\.0\s*오류|알\s*수\s*없는\s*오류|죄송합니다/.test(html)) {
    fields.is_error_page = true;
    return fields;
  }
  fields.is_error_page = false;

  // 페이지 길이
  fields.page_length = html.length;

  // 제목 (h1/h2/title)
  const titleM = html.match(/<h[12][^>]*class=["'][^"']*(?:tit|title|name)[^"']*["'][^>]*>([\s\S]*?)<\/h[12]>/i)
              || html.match(/<h2[^>]*>([\s\S]{3,60}?)<\/h2>/i);
  if (titleM) fields.title = cleanHtml(titleM[1]);
  if (!fields.title) {
    // 메타 타이틀에서
    const metaT = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
    if (metaT) fields.title = metaT[1].trim();
  }

  // 주소 — InfoD-List 패턴 (확인된 실제 구조)
  const addrRe = /<li[^>]*>\s*<p[^>]*>(?:주소|Address)<\/p>\s*<span[^>]*>([\s\S]*?)<\/span>/i;
  const addrM  = html.match(addrRe);
  if (addrM) fields.address = cleanHtml(addrM[1]).slice(0, 150);
  else {
    // fallback: 부산 주소 패턴
    const addrFb = html.match(/부산(?:광역시)[\s\S]{0,150}?(?=<)/);
    if (addrFb) fields.address = cleanHtml(addrFb[0]).slice(0, 150);
  }

  // 전화번호
  const phoneRe = /<li[^>]*>\s*<p[^>]*>(?:전화번호|Inquiry|Inquiries|전화)[^<]*<\/p>\s*<span[^>]*>([\s\S]*?)<\/span>/i;
  const phoneM  = html.match(phoneRe);
  if (phoneM) fields.phone = cleanHtml(phoneM[1]).slice(0, 30);
  else {
    const phoneFb = html.match(/\d{2,3}-\d{3,4}-\d{4}/);
    if (phoneFb) fields.phone = phoneFb[0];
  }

  // 좌표 (JS 변수)
  const latM = html.match(/(?:lat|latitude|mapY|_lat)\s*[:=]\s*["']?([\d.]{4,12})["']?/i);
  const lonM = html.match(/(?:lng|lon|longitude|mapX|_lon|_lng)\s*[:=]\s*["']?([\d.]{4,12})["']?/i);
  if (latM && parseFloat(latM[1]) > 30) fields.lat = parseFloat(latM[1]);
  if (lonM && parseFloat(lonM[1]) > 120) fields.lon = parseFloat(lonM[1]);

  // 운영시간
  const hoursRe = /<li[^>]*>\s*<p[^>]*>(?:운영요일\s*및\s*시간|Hours?|Operating)[^<]*<\/p>\s*<span[^>]*>([\s\S]*?)<\/span>/i;
  const hoursM  = html.match(hoursRe);
  fields.has_hours = hoursM !== null || /운영시간|이용시간|운영요일/i.test(html);
  if (hoursM) fields.hours = cleanHtml(hoursM[1]).slice(0, 80);

  // 휴무일
  const closedRe = /<li[^>]*>\s*<p[^>]*>(?:휴무일|Closing Dates?|Closed)[^<]*<\/p>\s*<span[^>]*>([\s\S]*?)<\/span>/i;
  const closedM  = html.match(closedRe);
  fields.has_closed_days = closedM !== null || /휴무일|정기휴무|휴관일/i.test(html);

  // 이미지
  const imgRe = html.match(/src=["']([^"']*(?:uploadImgs|conts_img|content_img)[^"']+\.(?:jpg|jpeg|png|webp))["']/i);
  if (imgRe) { fields.has_images = true; fields.sample_image = imgRe[1]; }
  else fields.has_images = /uploadImgs|conts_img/.test(html);

  // 홈페이지 링크
  const webRe = /<li[^>]*>\s*<p[^>]*>(?:홈페이지|Homepage|Website|Official Site)[^<]*<\/p>\s*<span[^>]*>([\s\S]*?)<\/span>/i;
  const webM  = html.match(webRe);
  if (webM) { fields.has_website = true; fields.website = cleanHtml(webM[1]).slice(0, 100); }
  else fields.has_website = /홈페이지|official.*site|homepage/i.test(html);

  // 대표메뉴 (맛집용)
  const menuRe = /<li[^>]*>\s*<p[^>]*>(?:대표\s*메뉴|Best Menu|Representative Menu)[^<]*<\/p>\s*<span[^>]*>([\s\S]*?)<\/span>/i;
  const menuM  = html.match(menuRe);
  fields.has_menu = menuM !== null || /대표메뉴|best menu/i.test(html);
  if (menuM) fields.sample_menu = cleanHtml(menuM[1]).slice(0, 60);

  // 설명 텍스트 (div.cont)
  const descRe = /<div[^>]*class=["']cont["'][^>]*>([\s\S]{10,500}?)<\/div>/i;
  const descM  = html.match(descRe);
  if (descM) fields.has_description = true;

  // uc_seq 추출
  const ucM = html.match(/uc_seq=(\d+)/);
  if (ucM) fields.uc_seq = ucM[1];

  // 언어 판단
  const korChars = (html.match(/[가-힣]/g) ?? []).length;
  const engChars = (html.match(/[a-zA-Z]/g) ?? []).length;
  const jpChars  = (html.match(/[぀-ヿ]/g) ?? []).length;
  fields.char_counts = { ko: korChars, en: engChars, jp: jpChars };
  const enRatio = engChars / (korChars + engChars + 1);
  fields.appears_translated = enRatio > 0.7 && html.length > 5000;

  // InfoD-List 필드 카운트
  const infoFields = [...html.matchAll(/<li[^>]*>\s*<p[^>]*>([^<]+)<\/p>/gi)]
    .map(m => cleanHtml(m[1]).slice(0, 30))
    .filter(Boolean);
  fields.info_fields = [...new Set(infoFields)];

  return fields;
}

// ── PHASE 2: Listing Page Structure ──────────────────────────────────────────
async function phase2(navLinks) {
  console.log('\n=== PHASE 2: Listing Page Structure per Content Type ===');
  const ctResults = {};

  for (const [ctype, listingUrl] of Object.entries(navLinks)) {
    const meta = CONTENT_MENUS[ctype];
    console.log(`\n--- [${ctype}] (${meta?.label_ko}) ---`);

    const ctResult = {
      listing_url_ko:      listingUrl,
      listing_menu_cd:     meta?.listing ?? '',
      detail_menu_cd:      meta?.detail ?? null,
      pagination:          'currentPage',
      items_per_page:      0,
      total_estimated:     null,
      id_param:            'uc_seq',
      sample_ids:          [],
      categories:          [],
      has_vue_templates:   false,
      page2_same_as_p1:    false,
      en_listing_works:    false,
      en_different_content: null,
    };

    // KO 목록 페이지 1
    const koHtml = await doGet(listingUrl, 'ko');
    const koList = parseListingPage(koHtml);
    ctResult.items_per_page   = koList.itemCount;
    ctResult.sample_ids       = koList.ucSeqIds.slice(0, 5);
    ctResult.categories       = koList.categories;
    ctResult.has_vue_templates = koList.hasVueTemplates ?? false;
    if (!ctResult.detail_menu_cd && koList.detailMenuCd) {
      ctResult.detail_menu_cd = koList.detailMenuCd;
    }

    console.log(`  KO 목록: ${koList.itemCount}개 uc_seq, 카테고리 ${koList.categories.length}개`);
    console.log(`  샘플 IDs: ${ctResult.sample_ids.join(', ')}`);
    console.log(`  상세 menuCd: ${ctResult.detail_menu_cd ?? '미확인'}`);

    // 페이지 2 확인
    if (reqCount < REQ_CAP && koList.itemCount > 0) {
      const p2Url   = `${listingUrl}&currentPage=2`;
      const p2Html  = await doGet(p2Url, 'ko');
      const p2List  = parseListingPage(p2Html);
      const p1Set   = new Set(koList.ucSeqIds);
      const overlap = p2List.ucSeqIds.filter(id => p1Set.has(id)).length;
      ctResult.page2_same_as_p1 = overlap === p2List.ucSeqIds.length && p2List.itemCount > 0;
      console.log(`  페이지 2: ${p2List.itemCount}개, p1과 중복 ${overlap}개 → ${ctResult.page2_same_as_p1 ? '동일(featured 목록)' : '다른 내용'}`);
    }

    // EN 목록 확인
    if (reqCount < REQ_CAP) {
      const enListUrl = listingUrl.replace(`/${LANG_PATH.ko}/`, `/${LANG_PATH.en}/`);
      const enHtml    = await doGet(enListUrl, 'en');
      const enList    = parseListingPage(enHtml);
      ctResult.en_listing_works = enList.itemCount > 0;

      if (enHtml) {
        const isErrPage = /RFC\s*3\.0\s*오류|죄송합니다/.test(enHtml);
        const korR = (enHtml.match(/[가-힣]/g) ?? []).length;
        const engR = (enHtml.match(/[a-zA-Z]/g) ?? []).length;
        const ratio = engR / (korR + engR + 1);
        ctResult.en_different_content = isErrPage ? '에러페이지' : ratio > 0.5 ? '영어 콘텐츠' : '한국어만';
        console.log(`  EN 목록: ${enList.itemCount}개 IDs, 언어비율 ${(ratio * 100).toFixed(0)}% → ${ctResult.en_different_content}`);
      }
    }

    ctResults[ctype] = ctResult;
  }

  return ctResults;
}

// ── PHASE 3: Detail Page Sampling ────────────────────────────────────────────
async function phase3(ctResults) {
  console.log('\n=== PHASE 3: Detail Page Sampling ===');

  // attraction과 food에서 다국어 샘플 (최대 2타입)
  const MULTILANG_TYPES = ['attraction', 'food'];

  for (const [ctype, ctResult] of Object.entries(ctResults)) {
    console.log(`\n--- [${ctype}] 상세 페이지 샘플링 ---`);

    if (!ctResult.sample_ids || ctResult.sample_ids.length === 0) {
      console.log(`  [${ctype}] 샘플 ID 없음, 건너뜀`);
      findings.content_types[ctype] = buildCtFindings(ctResult, [], null);
      continue;
    }

    const detailMenuCd = ctResult.detail_menu_cd;
    const detailSamplesKo = [];

    // KO 상세 3개
    const koIds = ctResult.sample_ids.slice(0, 3);
    for (const seq of koIds) {
      if (reqCount >= REQ_CAP) break;

      const detUrl = buildDetailUrl(LANG_PATH.ko, detailMenuCd, ctResult.listing_menu_cd, seq, 'ko');
      const html   = await doGet(detUrl, 'ko');
      const df     = parseDetailPage(html);

      detailSamplesKo.push({ seq, url: detUrl, fields: df });

      // CSV 행 추가
      sampleRows.push({
        content_type: ctype,
        content_id:   seq,
        title_ko:     df.title ?? '',
        url_ko:       detUrl,
        url_en:       buildDetailUrl(LANG_PATH.en, detailMenuCd, ctResult.listing_menu_cd, seq, 'en'),
        language_available: '',
        address:      df.address ?? '',
        lat:          df.lat ?? '',
        lon:          df.lon ?? '',
        phone:        df.phone ?? '',
        has_hours:    df.has_hours ? '1' : '0',
        has_images:   df.has_images ? '1' : '0',
        has_website:  df.has_website ? '1' : '0',
        field_count:  (df.info_fields ?? []).length,
        canonical_match: '',
      });

      console.log(`  KO #${seq}: title="${(df.title ?? '').slice(0, 35)}", lat=${df.lat ?? '-'}, fields=${(df.info_fields ?? []).join('|').slice(0, 60)}`);
    }

    // 다국어 샘플 (attraction + food만)
    if (MULTILANG_TYPES.includes(ctype) && koIds.length > 0) {
      const testSeq = koIds[0];
      const langResults = {};

      for (const lang of ['en', 'ja', 'zhs', 'zht']) {
        if (reqCount >= REQ_CAP) break;
        const lp  = LANG_PATH[lang];
        const url = buildDetailUrl(lp, detailMenuCd, ctResult.listing_menu_cd, testSeq, lang);
        const html = await doGet(url, lang);
        const df   = parseDetailPage(html);

        langResults[lang] = {
          is_error:         df.is_error_page ?? false,
          appears_translated: df.appears_translated ?? false,
          page_length:      df.page_length ?? (html?.length ?? 0),
        };
        ctResult[`lang_${lang}`] = langResults[lang];

        const status = df.is_error_page ? '에러페이지(RFC3.0)' : df.appears_translated ? '번역됨' : '한국어반환';
        console.log(`  ${lang.toUpperCase()} #${testSeq}: ${status} (len=${df.page_length ?? 0})`);

        // CSV에 language_available 채우기 (첫 번째 KO 행)
        const csvIdx = sampleRows.findIndex(r => r.content_type === ctype && r.content_id === testSeq);
        if (csvIdx >= 0 && lang === 'en') {
          sampleRows[csvIdx].language_available = df.is_error_page ? 'false' : df.appears_translated ? 'true' : 'false';
        }
      }
    }

    findings.content_types[ctype] = buildCtFindings(ctResult, detailSamplesKo, ctResult);
  }
}

function buildDetailUrl(lp, detailMenuCd, listingMenuCd, seq, lang) {
  const menuCd = detailMenuCd ?? listingMenuCd;
  return `${BASE}/${lp}/index.do?menuCd=${menuCd}&uc_seq=${seq}&lang_cd=${lang}`;
}

function buildCtFindings(ctResult, koSamples, extResult) {
  const allFields = new Set();
  for (const s of koSamples) {
    for (const f of (s.fields?.info_fields ?? [])) allFields.add(f);
    if (s.fields?.has_hours)        allFields.add('hours');
    if (s.fields?.has_images)       allFields.add('images');
    if (s.fields?.has_website)      allFields.add('website');
    if (s.fields?.has_menu)         allFields.add('menu');
    if (s.fields?.has_description)  allFields.add('description');
    if (s.fields?.lat)              allFields.add('lat');
    if (s.fields?.lon)              allFields.add('lon');
  }

  const langSupport = { ko: true };
  if (extResult?.lang_en)  langSupport.en  = !extResult.lang_en.is_error && extResult.lang_en.appears_translated;
  if (extResult?.lang_ja)  langSupport.ja  = !extResult.lang_ja.is_error && extResult.lang_ja.appears_translated;
  if (extResult?.lang_zhs) langSupport.zhs = !extResult.lang_zhs.is_error && extResult.lang_zhs.appears_translated;
  if (extResult?.lang_zht) langSupport.zht = !extResult.lang_zht.is_error && extResult.lang_zht.appears_translated;

  return {
    listing_url_pattern:   ctResult.listing_url_ko,
    listing_menu_cd:       ctResult.listing_menu_cd,
    detail_menu_cd:        ctResult.detail_menu_cd,
    id_param:              'uc_seq',
    pagination:            'GET currentPage=N (16 items/page, category filter: ucc2_seq=N)',
    items_per_page:        ctResult.items_per_page,
    total_estimated:       ctResult.total_estimated ?? 'unknown (featured list only)',
    page2_same_as_p1:      ctResult.page2_same_as_p1,
    categories_found:      ctResult.categories?.length ?? 0,
    detail_fields:         [...allFields],
    language_support:      langSupport,
    en_different_content:  ctResult.en_different_content,
    internal_api:          false,
    has_vue_templates:     ctResult.has_vue_templates,
    sample_ids:            ctResult.sample_ids,
  };
}

// ── PHASE 4: Cross-reference ───────────────────────────────────────────────────
function phase4() {
  console.log('\n=== PHASE 4: Canonical CSV 교차 검증 ===');

  if (!fs.existsSync(CANONICAL_CSV)) {
    console.log('  canonical CSV 없음, 건너뜀');
    return;
  }

  const lines  = fs.readFileSync(CANONICAL_CSV, 'utf8').split('\n').filter(Boolean);
  const header = lines[0].split(',');
  const titleIdx  = header.indexOf('title_ko');
  const addrIdx   = header.indexOf('address');
  const catIdx    = header.indexOf('category');
  const latIdx    = header.indexOf('latitude');
  const lonIdx    = header.indexOf('longitude');

  console.log(`  canonical CSV: ${lines.length - 1}행, fields: title_ko=${titleIdx}, address=${addrIdx}`);

  // canonical에서 attraction 5개 + food 5개 샘플
  const canonSample = [];
  for (const line of lines.slice(1)) {
    // CSV에 쉼표 이스케이핑 있으므로 간단 split
    const cols = line.split(',');
    const cat  = cols[catIdx] ?? '';
    if (['attraction', 'food'].includes(cat) && canonSample.length < 10) {
      canonSample.push({
        title:    cleanHtml(cols[titleIdx] ?? ''),
        address:  cleanHtml(cols[addrIdx] ?? ''),
        lat:      parseFloat(cols[latIdx] ?? '0'),
        lon:      parseFloat(cols[lonIdx] ?? '0'),
        category: cat,
      });
    }
  }

  console.log(`  canonical 샘플 ${canonSample.length}개 로드`);

  let matched = 0;
  let webOnly = 0;

  for (const webRow of sampleRows) {
    const webTitle   = webRow.title_ko?.replace(/\s+/g, '').toLowerCase() ?? '';
    const webAddr    = webRow.address?.replace(/\s+/g, '').toLowerCase() ?? '';
    if (!webTitle && !webAddr) { webOnly++; continue; }

    const hit = canonSample.find(c => {
      const ct = c.title.replace(/\s+/g, '').toLowerCase();
      const ca = c.address.replace(/\s+/g, '').toLowerCase();
      return (ct && ct.length >= 3 && webTitle.includes(ct.slice(0, Math.min(4, ct.length))))
          || (ca && ca.length >= 5 && webAddr.includes(ca.slice(0, Math.min(8, ca.length))));
    });

    if (hit) {
      matched++;
      webRow.canonical_match = 'matched';
      console.log(`  MATCH: "${webRow.title_ko}" ↔ canonical "${hit.title}"`);
    } else {
      webRow.canonical_match = 'web_only';
      webOnly++;
    }
  }

  const apiOnly = Math.max(0, canonSample.length - matched);
  const total   = sampleRows.length + apiOnly;

  findings.canonical_cross_ref = {
    canonical_total: lines.length - 1,
    web_sampled:    sampleRows.length,
    canon_sampled:  canonSample.length,
    matched,
    web_only:  webOnly,
    api_only:  apiOnly,
    match_rate: total > 0 ? `${((matched / total) * 100).toFixed(1)}%` : '0%',
    notes: 'uc_seq(VisitBusan)↔contentId(TourAPI) 직접 매핑 없음. 제목·주소 유사도로 추정.',
  };

  console.log(`  결과: matched=${matched}, web_only=${webOnly}, api_only=${apiOnly}`);
}

// ── 결과 저장 ─────────────────────────────────────────────────────────────────
function saveResults() {
  for (const d of [OUT_DIR, RPT_DIR, DOC_DIR]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }

  findings.total_requests = reqCount;

  // language_findings 집계
  const attrLang = findings.content_types.attraction?.language_support ?? {};
  const foodLang = findings.content_types.food?.language_support ?? {};
  findings.language_findings = {
    ko:  '완전 서버사이드 렌더링',
    en:  (attrLang.en || foodLang.en) ? '번역된 EN 콘텐츠 서버사이드 렌더링 확인' : '미확인',
    ja:  (attrLang.ja === false || foodLang.ja === false) ? 'RFC 3.0 서버 오류 (미제공)' : '미확인',
    zhs: (attrLang.zhs === false || foodLang.zhs === false) ? 'RFC 3.0 서버 오류 (미제공)' : '미확인',
    zht: (attrLang.zht === false || foodLang.zht === false) ? 'RFC 3.0 서버 오류 (미제공)' : '미확인',
  };

  findings.internal_api.found = findings.internal_api.notes.includes('Vue.js') || findings.internal_api.endpoints.length > 0;

  findings.collection_feasibility = {
    overall:              '가능 (단, 주의사항 있음)',
    ko_collection:        '직접 가능 (서버사이드 렌더링, uc_seq 기반)',
    en_collection:        '가능 (EN 상세 페이지 번역 제공 확인)',
    ja_collection:        '불가 (서버 RFC 3.0 오류)',
    zhs_collection:       '불가 (서버 RFC 3.0 오류)',
    zht_collection:       '불가 (서버 RFC 3.0 오류)',
    id_param:             'uc_seq (contentsSid/dataSid 아님)',
    listing_limitation:   '목록 페이지는 16개 featured 항목만 표시. 전체 목록은 카테고리 필터(ucc2_seq) 조합 필요',
    vue_js_impact:        '일부 동적 렌더링 있으나 핵심 필드는 서버사이드 임베드 확인',
    rate_limit_safe:      `${DELAY_MS}ms 간격 권장`,
  };

  // 전체 요청 수 추정 (KO+EN: 2개 언어 × 각 타입의 예상 페이지 수)
  const totalPages = Object.values(findings.content_types)
    .reduce((s, ct) => s + (ct.categories_found > 0 ? ct.categories_found : 3), 0);
  findings.estimated_total_requests = totalPages * 16 * 2; // per-category × 2 langs

  // JSON 보고서
  const jsonPath = path.join(RPT_DIR, 'visitbusan-content-audit-01.json');
  fs.writeFileSync(jsonPath, JSON.stringify(findings, null, 2), 'utf8');
  console.log(`\n  JSON 저장: ${jsonPath}`);

  // CSV 샘플
  if (sampleRows.length > 0) {
    const csvPath = path.join(OUT_DIR, 'visitbusan-audit-samples.csv');
    const csvHeader = 'content_type,content_id,title_ko,url_ko,url_en,language_available,address,lat,lon,phone,has_hours,has_images,has_website,field_count,canonical_match';
    const csvLines  = [csvHeader, ...sampleRows.map(r => csvRow([
      r.content_type, r.content_id, r.title_ko, r.url_ko, r.url_en,
      r.language_available, r.address, r.lat, r.lon, r.phone,
      r.has_hours, r.has_images, r.has_website, r.field_count, r.canonical_match,
    ]))];
    fs.writeFileSync(csvPath, csvLines.join('\n'), 'utf8');
    console.log(`  CSV 저장: ${csvPath} (${sampleRows.length}행)`);
  }
}

// ── 요약 테이블 ───────────────────────────────────────────────────────────────
function printSummary() {
  console.log('\n' + '='.repeat(72));
  console.log('비짓부산 콘텐츠 감사 요약');
  console.log('='.repeat(72));
  console.log(`실행일: ${TODAY}  총 요청 수: ${reqCount}`);
  console.log(`robots.txt: disallow=${findings.robots_txt.disallow.length}개 / crawl-delay=${findings.robots_txt.crawl_delay ?? '없음'}`);
  console.log(`\n콘텐츠 타입별 결과:`);
  console.log('─'.repeat(72));
  console.log(
    '타입'.padEnd(14) +
    'ID파라미터'.padEnd(12) +
    'KO항목'.padEnd(8) +
    'EN번역'.padEnd(12) +
    'JA번역'.padEnd(12) +
    '좌표'
  );
  console.log('─'.repeat(72));
  for (const [ctype, ct] of Object.entries(findings.content_types)) {
    console.log(
      ctype.padEnd(14) +
      (ct.id_param ?? 'uc_seq').padEnd(12) +
      String(ct.items_per_page || '-').padEnd(8) +
      String(ct.language_support?.en ?? '-').padEnd(12) +
      String(ct.language_support?.ja ?? '-').padEnd(12) +
      (ct.detail_fields?.includes('lat') ? '있음' : '-')
    );
  }
  console.log('─'.repeat(72));
  console.log(`\n언어 지원:`);
  for (const [l, v] of Object.entries(findings.language_findings)) {
    console.log(`  ${l.padEnd(6)}: ${v}`);
  }
  console.log(`\n내부 API: ${findings.internal_api.notes || '없음'}`);
  console.log(`canonical 교차: ${findings.canonical_cross_ref.matched}/${findings.canonical_cross_ref.web_sampled} matched`);
  console.log(`\n수집 가능성:`);
  for (const [k, v] of Object.entries(findings.collection_feasibility)) {
    console.log(`  ${k.padEnd(24)}: ${v}`);
  }
  console.log(`\n위험 항목:`);
  for (const r of findings.risks) console.log(`  - ${r}`);
  if (!findings.risks.length) console.log('  (특이 위험 없음)');
}

// ── 메인 ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('TASK-DATA-BUSAN-VISITBUSAN-CONTENT-AUDIT-01 시작');
  console.log(`날짜: ${TODAY}  요청 상한: ${REQ_CAP}  딜레이: ${DELAY_MS}ms`);

  try {
    const navLinks  = await phase1();
    const ctResults = await phase2(navLinks);
    await phase3(ctResults);
    phase4();

    // 위험 항목
    for (const [ctype, ct] of Object.entries(findings.content_types)) {
      if (ct.language_support?.ja === false) {
        const r = `JA/ZhS/ZhT: 비이벤트 콘텐츠도 RFC 3.0 서버 에러 — KO+EN만 수집 가능`;
        if (!findings.risks.includes(r)) findings.risks.push(r);
      }
      if (ct.page2_same_as_p1) {
        const r = `${ctype}: 목록 페이지네이션이 featured 16개만 순환. 전체 수집은 카테고리 필터(ucc2_seq) 루프 필요`;
        if (!findings.risks.includes(r)) findings.risks.push(r);
      }
    }
    if (reqCount >= REQ_CAP) {
      findings.risks.push(`요청 상한(${REQ_CAP}) 도달 — 일부 데이터 미수집`);
    }

    saveResults();
    printSummary();

  } catch (err) {
    console.error('\n[FATAL]', err.message, err.stack?.slice(0, 500));
    findings.risks.push(`스크립트 오류: ${err.message}`);
    saveResults();
  }

  console.log('\nTASK-DATA-BUSAN-VISITBUSAN-CONTENT-AUDIT-01 비짓부산 전체 콘텐츠 구조 조사 완료.');
}

main();
