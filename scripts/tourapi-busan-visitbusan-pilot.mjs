#!/usr/bin/env node
/**
 * TASK-DATA-BUSAN-VISITBUSAN-PILOT
 * VisitBusan 웹 행사 수집 파일럿
 *
 * 범위:
 *   - KO 2026년 7월 전체 페이지 (POST 페이지네이션)
 *   - EN/JA 상위 10개 dataSid 상세
 *   - ZhS/ZhT 상위 3개 dataSid 상세
 *
 * 수집 필드: dataSid, title, date_start, date_end, venue, address,
 *             official_url, visitbusan_url, image_url,
 *             language_available, language_review_required
 *
 * 금지: DB/commit/push/본문 전문 저장
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.resolve(__dir, '..');
const TODAY = new Date().toISOString().slice(0, 10);

// ── 설정 ──────────────────────────────────────────────────────────────────────
const BASE     = 'https://www.visitbusan.net';
const MENU_CD  = 'DOM_000000204012000000';
const BOARD_ID = 'BBS_0000009';
const YEAR     = '2026';
const MONTH    = '07';
const DELAY_MS = 600;   // 요청 간 대기
const MAX_RETRY = 2;
const MAX_PAGES = 6;    // 안전 상한 (예상 최대 3페이지)

const LANG_PATH  = { ko: 'kr', en: 'en', ja: 'jp', zhs: 'cns', zht: 'cnt' };
const PILOT_LANGS = [
  { lang: 'en',  limit: 10 },
  { lang: 'ja',  limit: 10 },
  { lang: 'zhs', limit: 3  },
  { lang: 'zht', limit: 3  },
];

const OUT_DIR = path.join(ROOT, 'data/tourapi/candidates/busan');
const RPT_DIR = path.join(ROOT, 'data/tourapi/reports/busan');
const DOC_DIR = path.join(ROOT, 'docs/tourapi');
const RAW_DIR = path.join(ROOT, 'data/tourapi/raw/busan/visitbusan-pilot');

// ── 상태 ──────────────────────────────────────────────────────────────────────
let reqCount  = 0;
let cookieJar = '';

// ── 유틸 ──────────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function cleanHtml(s = '') {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g,   '&')
    .replace(/&lt;/g,    '<')
    .replace(/&gt;/g,    '>')
    .replace(/&nbsp;/g,  ' ')
    .replace(/&#\d+;/g,  '')
    .replace(/\s+/g,     ' ')
    .trim();
}

function csvCell(v) {
  const s = String(v ?? '').replace(/[\r\n]+/g, ' ').trim();
  return (s.includes(',') || s.includes('"') || s.includes('\n'))
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}
function csvRow(arr) { return arr.map(csvCell).join(','); }

// ── HTTP ──────────────────────────────────────────────────────────────────────
const UA = 'GoKoreaMate-Bot/1.0 (travel itinerary research; non-commercial)';

async function doGet(url) {
  reqCount++;
  console.log(`  [#${reqCount}] GET ${url.slice(0, 100)}`);
  for (let i = 0; i <= MAX_RETRY; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent':      UA,
          'Accept':          'text/html,application/xhtml+xml',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8',
          'Referer':         BASE,
          ...(cookieJar ? { Cookie: cookieJar } : {}),
        },
        redirect: 'follow',
      });
      // 쿠키 저장
      const sc = res.headers.get('set-cookie');
      if (sc) {
        const pairs = sc.split(/,(?=\s*\w+=)/g).map(c => c.split(';')[0].trim()).filter(Boolean);
        cookieJar = pairs.join('; ');
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return await res.text();
    } catch (e) {
      if (i === MAX_RETRY) throw e;
      await sleep(800 * (i + 1));
    }
  }
}

async function doPost(url, body) {
  reqCount++;
  const encoded = new URLSearchParams(body).toString();
  console.log(`  [#${reqCount}] POST ${url.slice(0, 100)}`);
  console.log(`         body: ${encoded.slice(0, 120)}`);
  for (let i = 0; i <= MAX_RETRY; i++) {
    try {
      const res = await fetch(url, {
        method:  'POST',
        headers: {
          'Content-Type':    'application/x-www-form-urlencoded',
          'User-Agent':      UA,
          'Accept':          'text/html,application/xhtml+xml',
          'Accept-Language': 'ko-KR,ko;q=0.9',
          'Referer':         `${BASE}/${LANG_PATH.ko}/index.do?menuCd=${MENU_CD}`,
          ...(cookieJar ? { Cookie: cookieJar } : {}),
        },
        body: encoded,
        redirect: 'follow',
      });
      const sc = res.headers.get('set-cookie');
      if (sc) {
        const pairs = sc.split(/,(?=\s*\w+=)/g).map(c => c.split(';')[0].trim()).filter(Boolean);
        cookieJar = pairs.join('; ');
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return await res.text();
    } catch (e) {
      if (i === MAX_RETRY) throw e;
      await sleep(800 * (i + 1));
    }
  }
}

// ── Form 구조 탐색 ────────────────────────────────────────────────────────────
// searchfrm form 전용 필드만 추출 (다른 form의 hidden과 혼용 방지)
function extractSearchFormFields(html) {
  const fields = {};
  // searchfrm form 블록만 추출
  const formMatch = html.match(/<form\b[^>]*(?:name|id)=["']searchfrm["'][^>]*>([\s\S]*?)<\/form>/i);
  const formHtml  = formMatch ? formMatch[1] : html;

  const re = /<input\b[^>]*type=["']?hidden["']?[^>]*>/gi;
  let m;
  while ((m = re.exec(formHtml)) !== null) {
    const nm  = m[0].match(/name=["']([^"']+)["']/i);
    const val = m[0].match(/value=["']([^"']*?)["']/i);
    if (nm) fields[nm[1]] = val ? val[1] : '';
  }
  return fields;
}

function extractFormAction(html) {
  const m = html.match(/<form\b[^>]*(?:name|id)=["']searchfrm["'][^>]*action=["']([^"']+)["']/i)
          || html.match(/<form\b[^>]*action=["']([^"']+)["'][^>]*(?:name|id)=["']searchfrm["']/i);
  if (m) {
    const act = m[1];
    return act.startsWith('http') ? act : `${BASE}${act}`;
  }
  return null;
}

// fn_go_page 함수 소스 추출
function extractGoPageSource(html) {
  const m = html.match(/function\s+fn_go_page\s*\([^)]*\)\s*\{[\s\S]*?\}/i);
  return m ? m[0].slice(0, 400) : null;
}

// startPage 파라미터 이름 감지 (fn_go_page 분석)
function detectStartPageParam(html) {
  // fn_go_page에서 .val(pageno) 앞의 id 확인
  const m = html.match(/\$\(["']#([^"']+)["']\)\.val\s*\(\s*pageno\s*\)/i);
  return m ? m[1] : 'startPage';  // 기본값 startPage
}

// ── 목록 페이지 파싱 ──────────────────────────────────────────────────────────
// 실제 HTML 구조:
//   <a href="/schedule/view.do?...&dataSid=6167" title="TITLE 바로가기">
//     <p class="imgwrap"><img src="..." alt="TITLE"></p>
//     <p class="tit">TITLE</p>
//     <p class="cont">2026-07-31 ~ 2026-08-09</p>
//   </a>
function parseListingPage(html) {
  const events = [];
  const seen   = new Set();

  const aBlockRe = /<a\b[^>]*href=["'][^"']*dataSid=(\d+)[^"']*["'][^>]*>([\s\S]{0,1200}?)<\/a>/gi;
  let m;
  while ((m = aBlockRe.exec(html)) !== null) {
    const dataSid = m[1];
    if (seen.has(dataSid)) continue;
    seen.add(dataSid);
    const block = m[2];

    // 제목: <p class="tit"> 우선, 없으면 title 속성, img alt
    const titTag  = block.match(/<p[^>]*class=["']tit["'][^>]*>([\s\S]*?)<\/p>/i);
    const titAttr = m[0].match(/title=["']([^"']+?)\s*바로가기["']/i);
    const imgAlt  = block.match(/<img[^>]*alt=["']([^"']+)["']/i);
    const title   = cleanHtml(titTag?.[1] ?? titAttr?.[1] ?? imgAlt?.[1] ?? '');

    // 날짜: <p class="cont">YYYY-MM-DD ~ YYYY-MM-DD</p>
    // 이미 ISO 형식으로 제공됨
    const contTag = block.match(/<p[^>]*class=["']cont["'][^>]*>([\s\S]*?)<\/p>/i);
    const contText = cleanHtml(contTag?.[1] ?? '');
    const isoDate = contText.match(/(\d{4}-\d{2}-\d{2})/g);

    // fallback: 기타 날짜 패턴
    const anyDate = isoDate ?? cleanHtml(block).match(/\d{4}[.\-]\d{1,2}[.\-]\d{1,2}/g);

    events.push({
      dataSid,
      title:      title || null,
      date_raw:   contText || null,
      date_start: anyDate?.[0] ?? null,
      date_end:   anyDate?.[1] ?? null,
    });
  }

  // fallback: dataSid만 추출
  if (events.length === 0) {
    const sidRe = /dataSid=(\d+)/g;
    let sm;
    while ((sm = sidRe.exec(html)) !== null) {
      if (!seen.has(sm[1])) {
        seen.add(sm[1]);
        events.push({ dataSid: sm[1], title: null, date_raw: null, date_start: null, date_end: null });
      }
    }
  }

  return events;
}

// 두 목록의 dataSid 집합이 동일한지 확인
function sameSidSet(a, b) {
  const sa = new Set(a.map(e => e.dataSid));
  const sb = new Set(b.map(e => e.dataSid));
  if (sa.size !== sb.size) return false;
  for (const s of sa) if (!sb.has(s)) return false;
  return true;
}

// ── 상세 페이지 파싱 ──────────────────────────────────────────────────────────
// 실제 HTML 구조:
//   제목: <div class="tit_view_sub"><p>TITLE</p></div>
//         OR JS: var mtTitle = "TITLE"
//   레이블-값: <div class="name">일자</div>
//              <div class="detail">VALUE</div>
//   공식URL: <a href="URL" target="_blank">홈페이지</a>
//   이미지: <img src="/upload_data/board_data/...">

function extractDetailTitle(html) {
  // 1순위: tit_view_sub 내 p 태그
  const subDiv = html.match(/<div[^>]*class=["']tit_view_sub["'][^>]*>([\s\S]*?)<\/div>/i);
  if (subDiv) {
    const pTag = subDiv[1].match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    if (pTag) {
      const t = cleanHtml(pTag[1]);
      if (t && t.length > 1) return t;
    }
  }
  // 2순위: JS 변수 var mtTitle = "..."
  const jsTitle = html.match(/var\s+mtTitle\s*=\s*["']([^"']+)["']/i);
  if (jsTitle?.[1]) return jsTitle[1].trim();
  // 3순위: og:title
  const ogTitle = html.match(/<meta[^>]+(?:property=["']og:title["'][^>]*content=["']([^"']+)["']|content=["']([^"']+)["'][^>]*property=["']og:title["'])/i);
  if (ogTitle) {
    const t = cleanHtml(ogTitle[1] ?? ogTitle[2] ?? '');
    if (t && !/비짓부산|visitbusan/i.test(t)) return t;
  }
  return null;
}

function extractByLabel(html, label) {
  // <div class="name">LABEL</div> 이후 <div class="detail">VALUE</div>
  const re = new RegExp(
    `<div[^>]*class=["']name["'][^>]*>[\\s\\S]*?${label}[\\s\\S]*?<\\/div>[\\s\\S]{0,50}<div[^>]*class=["']detail["'][^>]*>([\\s\\S]{0,400}?)<\\/div>`,
    'i'
  );
  const m = html.match(re);
  return m ? cleanHtml(m[1]) : null;
}

function extractOfficialUrl(html) {
  // <a href="URL" target="_blank">홈페이지</a> 패턴
  const m = html.match(/<a\s+href=["'](https?:\/\/[^"']+)["'][^>]*>홈페이지<\/a>/i)
          || html.match(/홈페이지[\s\S]{0,200}?href=["'](https?:\/\/(?!www\.visitbusan\.net)[^"']+)["']/i)
          || html.match(/<a\s+href=["'](https?:\/\/(?!www\.visitbusan\.net)[^"']+)["'][^>]*>\s*홈페이지\s*<\/a>/i);
  return m ? m[1].replace(/&amp;/g, '&') : null;
}

function extractImageUrl(html) {
  // <img src="/upload_data/board_data/..." alt="TITLE">
  // (내용 섹션의 첫 번째 업로드 이미지)
  const m = html.match(/src=["']((?:https?:\/\/[^"']+)?\/upload_data\/board_data\/[^"'\s>]+)["']/i);
  if (m?.[1]) {
    const url = m[1].replace(/&amp;/g, '&');
    return url.startsWith('http') ? url : `${BASE}${url}`;
  }
  return null;
}

function parseDetailPage(html, dataSid, lang) {
  const title    = extractDetailTitle(html);
  const dateRaw  = extractByLabel(html, '일자') ?? extractByLabel(html, '기간');
  const venue    = extractByLabel(html, '장소');
  const address  = extractByLabel(html, '주소');
  const officialUrl = extractOfficialUrl(html);
  const imageUrl = extractImageUrl(html);

  const dates = (dateRaw ?? '').match(/\d{4}[.\-]\d{1,2}[.\-]\d{1,2}/g);

  return {
    dataSid,
    lang,
    source_key: `VisitBusanSchedule:${dataSid}:${lang}`,
    title,
    date_raw:     dateRaw,
    date_start:   dates?.[0]?.replace(/[.]/g, '-').replace(/(\d{4})-(\d{1})-(\d{1})$/, '$1-0$2-0$3').replace(/(\d{4})-(\d{1})-(\d{2})$/, '$1-0$2-$3').replace(/(\d{4})-(\d{2})-(\d{1})$/, '$1-$2-0$3') ?? null,
    date_end:     dates?.[1]?.replace(/[.]/g, '-').replace(/(\d{4})-(\d{1})-(\d{1})$/, '$1-0$2-0$3').replace(/(\d{4})-(\d{1})-(\d{2})$/, '$1-0$2-$3').replace(/(\d{4})-(\d{2})-(\d{1})$/, '$1-$2-0$3') ?? null,
    venue,
    address,
    official_url: officialUrl,
    visitbusan_url: `${BASE}/${LANG_PATH[lang]}/schedule/view.do?boardId=${BOARD_ID}&menuCd=${MENU_CD}&dataSid=${dataSid}`,
    image_url:    imageUrl,
    language_available:       null,
    language_review_required: false,
  };
}

// ── 언어 감지 ─────────────────────────────────────────────────────────────────
// Korean: 가-힣, Japanese-specific: ぁ-ん ァ-ン
const KO_RE  = /[가-힣]/g;
const JA_RE  = /[ぁ-んァ-ン]/g;
const EN_RE  = /[a-zA-Z]{3,}/g;

function detectLanguage(detail, koDetail) {
  const lang = detail.lang;
  if (lang === 'ko') return;

  const myTitle  = detail.title   ?? '';
  const myVenue  = detail.venue   ?? '';
  const koTitle  = koDetail?.title  ?? '';
  const koVenue  = koDetail?.venue  ?? '';

  // 1차: 제목 + 장소 모두 KO와 동일 → 같은 페이지 반환 → 언어 미제공
  if (myTitle && myTitle === koTitle && myVenue && myVenue === koVenue) {
    detail.language_available = false;
    return;
  }

  // 2차: 언어별 문자 특성 검사
  const combined = `${myTitle} ${myVenue}`;

  if (lang === 'en') {
    // EN 장소에 영어 단어가 있는지
    const enWords = (myVenue.match(EN_RE) ?? []).length;
    const koChars = (combined.match(KO_RE) ?? []).length;
    if (enWords >= 2) {
      detail.language_available = true;
    } else if (koChars > 5 && enWords === 0) {
      // EN 페이지인데 한국어만 → 미제공 가능성 높음
      if (myTitle === koTitle) {
        detail.language_available = false;
      } else {
        detail.language_available       = null;
        detail.language_review_required = true;
      }
    } else {
      detail.language_available       = null;
      detail.language_review_required = true;
    }
    return;
  }

  if (lang === 'ja') {
    const jaChars = (combined.match(JA_RE) ?? []).length;
    if (jaChars > 0) {
      detail.language_available = true;
    } else if (myTitle === koTitle) {
      detail.language_available = false;
    } else {
      detail.language_available       = null;
      detail.language_review_required = true;
    }
    return;
  }

  // zhs / zht: CJK 공유 → 제목/장소 비교에 의존
  if (myTitle !== koTitle || myVenue !== koVenue) {
    // 콘텐츠가 다름 → 번역 제공
    detail.language_available = true;
  } else if (!myTitle && !myVenue) {
    detail.language_available       = null;
    detail.language_review_required = true;
  } else {
    // 동일 → 미제공
    detail.language_available = false;
  }
}

// ── GET 페이지네이션 (startPage 파라미터) ─────────────────────────────────────
// 실제 form: method="get", field: startPage
async function fetchListingPage(pageNum, startPageParam = 'startPage') {
  const params = new URLSearchParams({
    boardId:          BOARD_ID,
    menuCd:           MENU_CD,
    [startPageParam]: String(pageNum),
    month:            MONTH,
    year:             YEAR,
  });
  const url = `${BASE}/schedule/list.do?${params.toString()}`;
  return doGet(url);
}

// ── 메인 ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  TASK-DATA-BUSAN-VISITBUSAN-PILOT                    ║');
  console.log(`╚══════════════════════════════════════════════════════╝`);
  console.log(`날짜: ${TODAY}  범위: KO ${YEAR}.${MONTH} 전체 + EN/JA top10 + ZhS/ZhT top3\n`);

  [OUT_DIR, RPT_DIR, DOC_DIR, RAW_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

  const log = [];  // 보고서 로그

  // ────────────────────────────────────────────────────────────────────────────
  // [1] KO 목록 1페이지 GET — form 구조 탐색
  // ────────────────────────────────────────────────────────────────────────────
  console.log('[1] KO 목록 GET (1페이지) + form 구조 탐색');
  const initUrl  = `${BASE}/${LANG_PATH.ko}/index.do?menuCd=${MENU_CD}&schYear=${YEAR}&schMonth=${MONTH}`;
  const initHtml = await doGet(initUrl);
  await sleep(DELAY_MS);

  // 샘플 HTML 저장 (디버깅용)
  fs.writeFileSync(path.join(RAW_DIR, 'ko-listing-p1.html'), initHtml, 'utf8');

  const formFields    = extractSearchFormFields(initHtml);
  const formAction    = extractFormAction(initHtml);
  const goPageSrc     = extractGoPageSource(initHtml);
  const startPagePrm  = detectStartPageParam(initHtml);

  console.log(`  form action: ${formAction ?? 'NOT FOUND'}`);
  console.log(`  searchfrm 필드: ${JSON.stringify(formFields)}`);
  console.log(`  startPage 파라미터: "${startPagePrm}"`);
  console.log(`  fn_go_page 소스: ${goPageSrc ? goPageSrc.slice(0, 100) + '...' : 'NOT FOUND'}`);

  log.push({ step: 'form_discovery', formAction, formFields, startPageParam: startPagePrm, goPageFound: !!goPageSrc });

  const getPage1 = parseListingPage(initHtml);
  console.log(`  GET 1페이지 파싱: ${getPage1.length}건`);
  getPage1.slice(0, 3).forEach(e => console.log(`    [${e.dataSid}] ${e.title ?? '(제목 미파싱)'}`));

  if (getPage1.length === 0) {
    console.error('\n[ABORT] GET 1페이지 0건 — 파서 점검 필요. 기존 결과 보호.');
    process.exit(1);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // [2] GET startPage 페이지네이션
  // 실제 form: method="get", startPage 파라미터, /schedule/list.do
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n[2] GET 페이지네이션 (startPage 파라미터)');

  const allKoEvents = [...getPage1];
  const seenSids    = new Set(getPage1.map(e => e.dataSid));
  let   totalPages  = 1;
  let   paginationWorked = false;

  // 2페이지 링크 존재 확인
  const hasPage2Link = /fn_go_page\s*\(\s*2\s*\)/.test(initHtml);
  console.log(`  2페이지 링크 존재: ${hasPage2Link ? 'YES' : 'NO'}`);

  for (let pg = 2; pg <= MAX_PAGES; pg++) {
    try {
      await sleep(DELAY_MS);
      const pgHtml   = await fetchListingPage(pg, startPagePrm);
      const pgEvents = parseListingPage(pgHtml);
      const newEvts  = pgEvents.filter(e => !seenSids.has(e.dataSid));

      console.log(`  page${pg}: ${pgEvents.length}건 파싱, 신규 ${newEvts.length}건`);

      if (pgEvents.length === 0) {
        console.log(`  → 0건 반환, 종료`);
        break;
      }
      if (newEvts.length === 0) {
        // 동일 페이지 반환 = 마지막 페이지 초과
        console.log(`  → 신규 없음 (1페이지 반복), 종료`);
        break;
      }

      paginationWorked = true;
      newEvts.forEach(e => seenSids.add(e.dataSid));
      allKoEvents.push(...newEvts);
      totalPages = pg;

      if (pg === 2) {
        fs.writeFileSync(path.join(RAW_DIR, 'ko-listing-p2.html'), pgHtml, 'utf8');
      }

      // 다음 페이지 링크 없으면 종료
      const hasNext = new RegExp(`fn_go_page\\s*\\(\\s*${pg + 1}\\s*\\)`).test(pgHtml);
      if (!hasNext) {
        console.log(`  → page${pg + 1} 링크 없음, 종료`);
        break;
      }
    } catch (e) {
      console.warn(`  page${pg} 실패: ${e.message}`);
      break;
    }
  }

  const allDataSids = [...new Set(allKoEvents.map(e => e.dataSid))];
  console.log(`\n  KO 7월 수집 완료: ${allKoEvents.length}건 (${totalPages}페이지, dataSid ${allDataSids.length}개)`);

  log.push({
    step: 'ko_listing',
    getPage1Count: getPage1.length,
    paginationWorked,
    startPageParam: startPagePrm,
    totalEvents: allKoEvents.length,
    totalPages,
    dataSidCount: allDataSids.length,
  });

  // ────────────────────────────────────────────────────────────────────────────
  // [3] KO 상세 수집
  // ────────────────────────────────────────────────────────────────────────────
  console.log(`\n[3] KO 상세 수집 (${allDataSids.length}건)`);
  const koDetails = {};

  for (const sid of allDataSids) {
    await sleep(DELAY_MS);
    try {
      const url  = `${BASE}/${LANG_PATH.ko}/schedule/view.do?boardId=${BOARD_ID}&menuCd=${MENU_CD}&dataSid=${sid}`;
      const html = await doGet(url);
      koDetails[sid] = parseDetailPage(html, sid, 'ko');
      const d = koDetails[sid];
      console.log(`  [${sid}] "${d.title ?? '?'}" | ${d.date_start ?? '?'}~${d.date_end ?? '?'} | ${d.venue ?? '?'}`);
      // 첫 번째 상세 HTML 저장
      if (sid === allDataSids[0]) {
        fs.writeFileSync(path.join(RAW_DIR, `ko-detail-${sid}.html`), html, 'utf8');
      }
    } catch (e) {
      console.warn(`  [WARN] KO ${sid}: ${e.message}`);
    }
  }

  const koParseOk = Object.values(koDetails).filter(d => d.title && d.date_start).length;
  console.log(`  파싱 성공(title+date): ${koParseOk}/${allDataSids.length}`);

  // ────────────────────────────────────────────────────────────────────────────
  // [4] 비KO 상세 수집 + 언어 감지
  // ────────────────────────────────────────────────────────────────────────────
  const langResults = {};

  for (const { lang, limit } of PILOT_LANGS) {
    const targets = allDataSids.slice(0, limit);
    console.log(`\n[4/${lang}] ${lang.toUpperCase()} 상세 (${targets.length}건)`);
    const arr = [];

    for (const sid of targets) {
      await sleep(DELAY_MS);
      try {
        const url  = `${BASE}/${LANG_PATH[lang]}/schedule/view.do?boardId=${BOARD_ID}&menuCd=${MENU_CD}&dataSid=${sid}`;
        const html = await doGet(url);
        const d    = parseDetailPage(html, sid, lang);
        detectLanguage(d, koDetails[sid]);
        arr.push(d);
        console.log(`  [${sid}] available=${d.language_available} review=${d.language_review_required} | title="${d.title ?? '?'}"`);
        // 첫 번째 저장
        if (sid === targets[0]) {
          fs.writeFileSync(path.join(RAW_DIR, `${lang}-detail-${sid}.html`), html, 'utf8');
        }
      } catch (e) {
        console.warn(`  [WARN] ${lang} ${sid}: ${e.message}`);
      }
    }

    langResults[lang] = arr;
    const avail   = arr.filter(d => d.language_available === true).length;
    const unavail = arr.filter(d => d.language_available === false).length;
    const review  = arr.filter(d => d.language_review_required).length;
    console.log(`  → available: ${avail}  unavailable: ${unavail}  review: ${review}`);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // [5] 여러 달 중복 후보 분석
  // ────────────────────────────────────────────────────────────────────────────
  const multiMonth = allKoEvents.filter(e => {
    if (!e.date_end) return false;
    const endMonth = parseInt(e.date_end.slice(5, 7), 10);
    return endMonth > parseInt(MONTH, 10);
  });
  console.log(`\n[5] 여러 달 중복 후보: ${multiMonth.length}건`);
  multiMonth.slice(0, 5).forEach(e =>
    console.log(`  [${e.dataSid}] ${e.title ?? '?'}: ${e.date_start}~${e.date_end}`)
  );

  // ────────────────────────────────────────────────────────────────────────────
  // [6] 출력 파일 생성
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n[6] 출력 파일 생성');

  // 6-1. 이벤트 CSV (KO 기준 전체 dataSid)
  const csvHeader = csvRow([
    'dataSid', 'ko_title', 'date_start', 'date_end', 'ko_venue', 'ko_address',
    'official_url', 'visitbusan_url_ko', 'image_url',
    'en_available', 'en_review',
    'ja_available', 'ja_review',
    'zhs_available', 'zhs_review',
    'zht_available', 'zht_review',
    'multi_month_candidate',
  ]);

  const csvRows = allDataSids.map(sid => {
    const ko  = koDetails[sid];
    const en  = langResults.en?.find(d => d.dataSid === sid);
    const ja  = langResults.ja?.find(d => d.dataSid === sid);
    const zhs = langResults.zhs?.find(d => d.dataSid === sid);
    const zht = langResults.zht?.find(d => d.dataSid === sid);
    const mm  = multiMonth.some(e => e.dataSid === sid);
    return csvRow([
      sid,
      ko?.title, ko?.date_start, ko?.date_end, ko?.venue, ko?.address,
      ko?.official_url,
      `${BASE}/${LANG_PATH.ko}/schedule/view.do?boardId=${BOARD_ID}&menuCd=${MENU_CD}&dataSid=${sid}`,
      ko?.image_url,
      en  ? String(en.language_available)  : 'not_fetched',
      en  ? String(en.language_review_required)  : '',
      ja  ? String(ja.language_available)  : 'not_fetched',
      ja  ? String(ja.language_review_required)  : '',
      zhs ? String(zhs.language_available) : 'not_fetched',
      zhs ? String(zhs.language_review_required) : '',
      zht ? String(zht.language_available) : 'not_fetched',
      zht ? String(zht.language_review_required) : '',
      String(mm),
    ]);
  });

  const csvPath = path.join(OUT_DIR, 'busan-visitbusan-pilot-events.csv');
  fs.writeFileSync(csvPath, [csvHeader, ...csvRows].join('\n'), 'utf8');
  console.log(`  → ${path.relative(ROOT, csvPath)} (${csvRows.length}행)`);

  // 6-2. 전체 JSON
  const allDetails = {
    ko:  Object.values(koDetails),
    en:  langResults.en  ?? [],
    ja:  langResults.ja  ?? [],
    zhs: langResults.zhs ?? [],
    zht: langResults.zht ?? [],
  };

  const jsonOut = {
    run_date:    TODAY,
    task:        'TASK-DATA-BUSAN-VISITBUSAN-PILOT',
    pilot_scope: { year: YEAR, month: MONTH },
    pagination:  {
      method:            'GET',
      param:             startPagePrm,
      get_page1_count:   getPage1.length,
      pagination_worked: paginationWorked,
      total_pages:       totalPages,
      total_events:      allKoEvents.length,
    },
    ko_listing:        allKoEvents,
    details:           allDetails,
    multi_month_sids:  multiMonth.map(e => e.dataSid),
    form_discovery:    log[0],
    total_requests:    reqCount,
    generated_at:      new Date().toISOString(),
  };

  const jsonPath = path.join(OUT_DIR, 'busan-visitbusan-pilot.json');
  fs.writeFileSync(jsonPath, JSON.stringify(jsonOut, null, 2), 'utf8');
  console.log(`  → ${path.relative(ROOT, jsonPath)}`);

  // 6-3. 메트릭스 JSON
  const koArr = Object.values(koDetails);
  const fillRate = (arr, field) => `${arr.filter(d => d[field]).length}/${arr.length}`;

  const langStats = {};
  for (const lang of ['en', 'ja', 'zhs', 'zht']) {
    const arr = langResults[lang] ?? [];
    langStats[lang] = {
      fetched:          arr.length,
      available:        arr.filter(d => d.language_available === true).length,
      unavailable:      arr.filter(d => d.language_available === false).length,
      review_required:  arr.filter(d => d.language_review_required).length,
    };
  }

  const metrics = {
    run_date:   TODAY,
    task:       'TASK-DATA-BUSAN-VISITBUSAN-PILOT',
    pagination: {
      method:            'GET',
      param:             startPagePrm,
      get_page1:         getPage1.length,
      pagination_worked: paginationWorked,
      total_pages:       totalPages,
      total_events:      allKoEvents.length,
    },
    ko_fill_rates: {
      total:       koArr.length,
      title:       koArr.filter(d => d.title).length,
      date_start:  koArr.filter(d => d.date_start).length,
      date_end:    koArr.filter(d => d.date_end).length,
      venue:       koArr.filter(d => d.venue).length,
      address:     koArr.filter(d => d.address).length,
      official_url: koArr.filter(d => d.official_url).length,
      image_url:   koArr.filter(d => d.image_url).length,
    },
    language_stats:       langStats,
    multi_month_count:    multiMonth.length,
    multi_month_sids:     multiMonth.map(e => e.dataSid),
    total_requests:       reqCount,
    generated_at:         new Date().toISOString(),
  };

  const metricsPath = path.join(RPT_DIR, 'busan-visitbusan-pilot-metrics.json');
  fs.writeFileSync(metricsPath, JSON.stringify(metrics, null, 2), 'utf8');
  console.log(`  → ${path.relative(ROOT, metricsPath)}`);

  // ────────────────────────────────────────────────────────────────────────────
  // [7] 요약
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  파일럿 요약                                          ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║  총 HTTP 요청       : ${String(reqCount).padEnd(5)} (목표: < 100)          ║`);
  console.log(`║  KO 7월 수집        : ${String(allKoEvents.length).padEnd(5)} (1페이지:${getPage1.length} 추가:${allKoEvents.length - getPage1.length})     ║`);
  console.log(`║  GET 페이지네이션   : ${paginationWorked ? 'PASS (startPage=' + startPagePrm + ')' : 'PARTIAL (1페이지만)'}`);
  console.log(`║  KO 파싱 성공률     : ${koParseOk}/${allDataSids.length} (title+date)           ║`);
  for (const [lang, s] of Object.entries(langStats)) {
    console.log(`║  ${lang.padEnd(4)} language_avail : avail=${s.available} unavail=${s.unavailable} review=${s.review_required}  ║`);
  }
  console.log(`║  여러 달 중복 후보  : ${multiMonth.length}건                               ║`);
  console.log('╚══════════════════════════════════════════════════════╝');

  return { metrics, koDetails, langResults, allKoEvents, multiMonth, paginationWorked };
}

main().catch(e => {
  console.error('\n[FATAL]', e.message);
  console.error(e.stack);
  process.exit(1);
});
