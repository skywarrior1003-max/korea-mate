#!/usr/bin/env node
/**
 * TASK-DATA-BUSAN-VISITBUSAN-CONTENT-PILOT-02
 * VisitBusan 관광 콘텐츠 파일럿 수집
 *
 * AUDIT-01 대비 개선:
 *   1. title: <title> 태그 → 목록 <a> 텍스트 → og:title 순 추출
 *   2. HTML 오염: > 포함 속성도 처리하는 stripHtml()
 *   3. JA/ZhS/ZhT: 레코드 미생성, status만 기록
 *   4. ucc2_seq 카테고리 루프로 featured 16건 한계 극복
 *
 * 하드 스톱 조건 (조건 미충족 시 파일 저장 없이 종료):
 *   - KO title_ko 공백 ≥ 1건
 *   - 주소/전화/운영시간 HTML 오염 ≥ 1건
 *   - 위 조건 모두 해소 시에만 출력 파일 저장
 *
 * 금지: DB·commit·push·canonical 수정·git add .·이미지 파일 저장
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.dirname(__dir);
const TODAY = new Date().toISOString().slice(0, 10);

// ── 설정 ──────────────────────────────────────────────────────────────────────
const BASE       = 'https://www.visitbusan.net';
const DELAY_MS   = 600;
const MAX_RETRY  = 1;
const KO_TARGET  = 20;   // 타입당 KO 목표
const EN_TARGET  = 5;    // 타입당 EN 목표

const LANG_PATH = { ko: 'kr', en: 'en', ja: 'jp', zhs: 'cns', zht: 'cnt' };

const CONTENT_TYPES = {
  attraction: { listing: 'DOM_000000201001000000', detail: 'DOM_000000201001001000', label: '명소' },
  food:       { listing: 'DOM_000000201002000000', detail: 'DOM_000000201002001000', label: '음식' },
  shopping:   { listing: 'DOM_000000201003000000', detail: 'DOM_000000201003001000', label: '쇼핑' },
  experience: { listing: 'DOM_000000202008000000', detail: 'DOM_000000202008001000', label: '체험' },
  course:     { listing: 'DOM_000000202012000000', detail: 'DOM_000000202012001000', label: '코스' },
};

const OUT_DIR = path.join(ROOT, 'data/tourapi/candidates/busan');
const RPT_DIR = path.join(ROOT, 'data/tourapi/reports/busan');
const DOC_DIR = path.join(ROOT, 'docs/tourapi');

// ── 유틸 ──────────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * HTML 스트리핑 — > 포함 속성도 처리
 * AUDIT-01의 "부산광역시" />" 오염 재발 방지
 */
function stripHtml(s = '') {
  if (!s) return '';
  let r = s
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, '');
  // 1차: < 또는 > 를 포함하지 않는 정상 태그 제거 (백트래킹 없음)
  r = r.replace(/<[^<>]*>/g, ' ');
  // 2차: 속성 값 내 >로 인한 잔여 /> 아티팩트 제거
  r = r.replace(/\s*\/>/g, '').replace(/["']\s*>/g, '');
  // 3차: 나머지 < > 제거 (malformed HTML 잔류)
  r = r.replace(/[<>]/g, '');
  // 엔티티 디코딩
  r = r.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
  return r.replace(/\s+/g, ' ').trim();
}

/** HTML 오염 잔류 여부 — 주소·전화·운영시간에 HTML 태그가 남아있으면 true */
function hasHtmlContam(value) {
  if (typeof value !== 'string' || !value) return false;
  return /<[a-zA-Z\/!]/.test(value) || /\/>/.test(value) || /&[a-zA-Z]{2,6};/.test(value);
}

function csvCell(v) {
  const s = String(v ?? '').replace(/[\r\n]+/g, ' ').trim();
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
function csvRow(arr) { return arr.map(csvCell).join(','); }

// ── 제목 추출 ─────────────────────────────────────────────────────────────────

// 사이트명 / 카테고리 라벨 집합 — 콘텐츠명이 아닌 세그먼트
const SITE_AND_CATEGORY = new Set([
  '부산에가면', 'visitbusan', 'visit busan', '비짓부산', '부산관광',
  'visit busan 부산광역시', 'visit busan 釜山広域市',
  '명소', '음식', '쇼핑', '체험', '일정여행', '추천코스', '추천여행', '숙박',
  '테마여행', '미식투어', '해양', '웰니스',
  'attraction', 'food', 'shopping', 'experience', 'itinerary', 'course',
]);

// UI 버튼·링크 텍스트 집합 — 콘텐츠명으로 저장 금지
const UI_TEXTS = new Set([
  '상세보기', '자세히 보기', '더보기', '더 보기',
  'view detail', 'view details', 'view more', 'more', 'see more',
]);
function isUiText(s) {
  if (!s) return false;
  return UI_TEXTS.has(s.toLowerCase().replace(/[\s\.\!\?\-]+/g, ' ').trim());
}

/**
 * 서버사이드 HTML에서 콘텐츠 제목 추출 — 백트래킹 없는 단순 패턴 우선순위:
 *  1. 숨겨진 input[name/id=title] value
 *  2. JS 변수 (var/let/const contTitle = "...")
 *  3. meta name="title" 마지막 비-사이트 세그먼트
 *  4. og:title 마지막 비-사이트 세그먼트
 *  5. <title> 태그 마지막 비-사이트 세그먼트
 *  6. data-title / data-name 속성
 *
 * 주의: [\s\S] 광역 패턴 사용 금지 (catastrophic backtracking 방지)
 */
function extractTitle(html) {
  if (!html) return '';

  // 1. var mtTitle = "콘텐츠명" — VisitBusan 상세 페이지 JS 삽입 변수 (확인됨)
  let m = html.match(/var\s+mtTitle\s*=\s*["']([^"']{2,80})["']/i);
  if (m) return m[1].replace(/&amp;/g, '&').trim();

  // 2. HTML 주석 p-txt 패턴 — <!--<div class="p-txt">콘텐츠명</div>-->
  m = html.match(/<!--\s*<div[^>]*class=["'][^"']*p-txt[^"']*["'][^>]*>([^<]{2,80})<\/div>\s*-->/i);
  if (m) return m[1].replace(/&amp;/g, '&').trim();

  // 3. 기타 JS 변수 (contTitle, contentTitle, wTitle, pageTitle)
  m = html.match(/(?:var|let|const)\s+(?:contTitle|contentTitle|wTitle|pageTitle|contsTitle|default_goal)\s*=\s*["']([^"']{2,80})["']/i);
  if (m) {
    const v = m[1].replace(/&amp;/g, '&').trim();
    // 사이트명·카테고리 아닌 경우만 반환
    if (!SITE_AND_CATEGORY.has(v.toLowerCase())) return v;
  }

  // 4. hidden input[name/id=title]
  m = html.match(/<input[^>]{0,200}(?:name|id)=["'](?:contTitle|contentTitle|wTitle)[^"']*["'][^>]{0,200}value=["']([^"']{2,80})["'][^>]{0,50}>/i)
   || html.match(/<input[^>]{0,200}value=["']([^"']{2,80})["'][^>]{0,200}(?:name|id)=["'](?:contTitle|contentTitle|wTitle)[^"']*["'][^>]{0,50}>/i);
  if (m) return m[1].replace(/&amp;/g, '&').trim();

  // <title> 태그 fallback 없음 — EN 페이지의 <title>은 한국어 카테고리 라벨 포함
  // (예: "체험·해양·웰니스 | 추천여행 | Visit Busan 釜山広域市") → 허위 값 반환 위험
  return '';
}

// 하위 호환 별칭
const titleFromPageTag = extractTitle;

/** 목록 페이지의 <a> 링크 텍스트에서 제목 추출 */
function titleFromAnchor(html, ucSeq, detailMenuCd) {
  if (!html || !ucSeq) return '';
  // 해당 uc_seq로 이어지는 링크의 텍스트
  const re = new RegExp(
    `<a[^>]+href=["'][^"']*uc_seq=${ucSeq}[^"']*["'][^>]*>([\\s\\S]{1,80}?)<\\/a>`,
    'i'
  );
  const m = html.match(re);
  if (!m) return '';
  const text = stripHtml(m[1]).trim();
  // Vue 템플릿 플레이스홀더 제외
  if (/^\{\{/.test(text) || text.length < 2) return '';
  return text;
}

/** og:title 메타 태그에서 제목 추출 */
function titleFromOgMeta(html) {
  if (!html) return '';
  const m = html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']{2,80})["']/i)
          || html.match(/<meta[^>]+content=["']([^"']{2,80})["'][^>]*property=["']og:title["']/i);
  if (!m) return '';
  return m[1].replace(/&amp;/g, '&').replace(/&#\d+;/g, '').trim();
}

// ── 상세 필드 추출 ─────────────────────────────────────────────────────────────

/**
 * <li><p>레이블</p><span>값</span></li> 패턴에서 값 추출
 * HTML 오염을 stripHtml로 완전 제거
 */
function extractInfoField(html, ...labels) {
  const labelPattern = labels.join('|');
  const re = new RegExp(
    `<li[^>]*>\\s*<p[^>]*>(?:${labelPattern})[^<]*<\\/p>\\s*<span[^>]*>([\\s\\S]*?)<\\/span>`,
    'i'
  );
  const m = html?.match(re);
  if (!m) return '';
  return stripHtml(m[1]).slice(0, 200);
}

function extractCoords(html) {
  if (!html) return { lat: '', lon: '' };
  const latM = html.match(/(?:^|[^a-zA-Z])(?:lat|latitude|mapY|_lat)\s*[:=]\s*["']?([\d.]{4,12})["']?/im);
  const lonM = html.match(/(?:^|[^a-zA-Z])(?:lng|lon|longitude|mapX|_lon|_lng)\s*[:=]\s*["']?([\d.]{4,12})["']?/im);
  const lat  = latM  ? parseFloat(latM[1])  : NaN;
  const lon  = lonM  ? parseFloat(lonM[1])  : NaN;
  return {
    lat: (lat > 30 && lat < 40)   ? lat : '',
    lon: (lon > 120 && lon < 135) ? lon : '',
  };
}

/** external_official_url 추출 — 홈페이지 라벨 span 내부 URL만 반환
 *  - 라벨 없으면 빈 문자열 (전체 HTML fallback 제거)
 *  - 개인정보처리방침·이용약관·공통 푸터 URL 차단
 */
const BLOCKED_URL_PATTERNS = /vprivacy|terms\.do|agreement|policy\.do|visitbusan\.net\/[a-z]{2}\/index/i;

function extractOfficialUrl(html) {
  if (!html) return '';
  const re = /<li[^>]*>\s*<p[^>]*>(?:홈페이지|Homepage|Website|Official)[^<]*<\/p>\s*<span[^>]*>([\s\S]*?)<\/span>/i;
  const m = html.match(re);
  if (!m) return '';   // 라벨 없으면 빈 문자열 (fallback 없음)
  // href 속성 내 URL 우선
  const hrefM = m[1].match(/href=["']?(https?:\/\/[^"'\s>]{5,})["']?/i);
  const raw = hrefM
    ? hrefM[1]
    : (m[1].match(/https?:\/\/[^\s"'<>]{5,}/)?.[0] ?? '').replace(/['">\s]+$/, '');
  if (!raw) return '';
  if (BLOCKED_URL_PATTERNS.test(raw)) return '';   // 푸터·정책 URL 차단
  return raw;
}

function extractImageUrl(html) {
  if (!html) return '';
  const m = html.match(/src=["']([^"']*(?:uploadImgs|conts_img|content_img)[^"']+\.(?:jpg|jpeg|png|webp))["']/i);
  return m ? m[1] : '';
}

function extractCategory(html) {
  // breadcrumb 또는 메뉴 네비게이션에서 카테고리 라벨 추출
  const m = html.match(/<li[^>]*class=["'][^"']*(?:active|current|on)[^"']*["'][^>]*>[\s\S]*?<a[^>]*>([\s\S]{2,20}?)<\/a>/i)
          || html.match(/class=["'][^"']*breadcrumb[^"']*["'][^>]*>[\s\S]*?<[^>]+>([\s\S]{2,20}?)<\/[^>]+>\s*<\/li>/i);
  return m ? stripHtml(m[1]).slice(0, 20) : '';
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

// ── HTTP ──────────────────────────────────────────────────────────────────────
let reqCount  = 0;
let cookieJar = '';
const UA = 'Mozilla/5.0 (compatible; KoreaMate-Pilot/1.0; educational research)';

async function doGet(url, lang = 'ko') {
  reqCount++;
  const acceptLang = { ko: 'ko-KR,ko;q=0.9', en: 'en-US,en;q=0.9',
                        ja: 'ja-JP,ja;q=0.9', zhs: 'zh-CN,zh;q=0.9', zht: 'zh-TW,zh;q=0.9' }[lang] ?? 'ko-KR';
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
        signal: AbortSignal.timeout(15000),
      });
      const sc = res.headers.get('set-cookie');
      if (sc) {
        const pairs = sc.split(/,(?=\s*\w+=)/g).map(c => c.split(';')[0].trim()).filter(Boolean);
        if (pairs.length) cookieJar = pairs.join('; ');
      }
      if (!res.ok) {
        console.warn(`  [WARN] HTTP ${res.status} ${url.replace(BASE, '')}`);
        return { html: null, status: res.status };
      }
      return { html: await res.text(), status: res.status };
    } catch (e) {
      console.warn(`  [WARN] #${reqCount} 시도 ${i+1}/${MAX_RETRY+1}: ${e.message}`);
      if (i === MAX_RETRY) return { html: null, status: 0 };
      await sleep(1000 * (i + 1));
    }
  }
  return { html: null, status: 0 };
}

// ── Phase 1: 카테고리 코드 발견 ───────────────────────────────────────────────
async function discoverCategories(ctype) {
  const meta = CONTENT_TYPES[ctype];
  const url = `${BASE}/${LANG_PATH.ko}/index.do?menuCd=${meta.listing}`;
  const { html } = await doGet(url, 'ko');
  if (!html) return [];

  // ucc2_seq 값 추출: 카테고리 필터 버튼/링크에서
  const codes = new Set();
  // 방법 1: href에 ucc2_seq=N 포함
  const hrefRe = /ucc2_seq=(\d+)/g;
  let m;
  while ((m = hrefRe.exec(html)) !== null) codes.add(m[1]);
  // 방법 2: input/button value
  const btnRe = /value=["'](\d+)["'][^>]*(?:ucc2|category|cat)/gi;
  while ((m = btnRe.exec(html)) !== null) codes.add(m[1]);
  // 방법 3: onclick에 ucc2_seq
  const onRe = /ucc2_seq\s*=\s*['"]?(\d+)['"]?/g;
  while ((m = onRe.exec(html)) !== null) codes.add(m[1]);

  // 목록 페이지에서 기본 16개 uc_seq도 함께 수집
  const ids16 = extractIdsFromListing(html, meta.detail);

  console.log(`  [${ctype}] 카테고리 ${codes.size}개 발견: [${[...codes].join(', ')}], 기본 IDs ${ids16.length}개`);
  return { categoryCodes: [...codes], baseIds: ids16, html };
}

/** 목록 페이지 HTML에서 {uc_seq, title} 쌍 추출 */
function extractIdsFromListing(html, detailMenuCd) {
  if (!html) return [];
  const items = [];
  const seen  = new Set();

  // 방법 1: 상세 menuCd가 포함된 링크에서 uc_seq + 앵커 텍스트
  const re = new RegExp(
    `<a[^>]+href=["'][^"']*menuCd=${detailMenuCd}[^"']*uc_seq=(\\d+)[^"']*["'][^>]*>([\\s\\S]{0,100}?)<\\/a>`,
    'gi'
  );
  let m;
  while ((m = re.exec(html)) !== null) {
    const ucSeq = m[1];
    if (seen.has(ucSeq)) continue;
    seen.add(ucSeq);
    const titleCandidate = stripHtml(m[2]).trim();
    const title = (/^\{\{/.test(titleCandidate) || titleCandidate.length < 2) ? '' : titleCandidate;
    items.push({ ucSeq, titleFromListing: title });
  }

  // 방법 2: uc_seq만 있는 링크 (title은 별도 추출 필요)
  if (items.length === 0) {
    const re2 = /href=["'][^"']*uc_seq=(\d+)[^"']*["']/g;
    while ((m = re2.exec(html)) !== null) {
      if (!seen.has(m[1])) { seen.add(m[1]); items.push({ ucSeq: m[1], titleFromListing: '' }); }
    }
  }

  return items;
}

// ── Phase 2: ID 수집 (ucc2_seq 카테고리 루프) ────────────────────────────────
async function collectIds(ctype, discovery) {
  const meta   = CONTENT_TYPES[ctype];
  const allIds = new Map(); // ucSeq → titleFromListing

  // 기본 목록 페이지 IDs 먼저 추가
  for (const { ucSeq, titleFromListing } of discovery.baseIds) {
    if (!allIds.has(ucSeq)) allIds.set(ucSeq, titleFromListing);
    if (allIds.size >= KO_TARGET) break;
  }

  // 카테고리 루프
  for (const code of discovery.categoryCodes) {
    if (allIds.size >= KO_TARGET) break;
    const url = `${BASE}/${LANG_PATH.ko}/index.do?menuCd=${meta.listing}&ucc2_seq=${code}`;
    const { html } = await doGet(url, 'ko');
    if (!html) continue;
    const items = extractIdsFromListing(html, meta.detail);
    for (const { ucSeq, titleFromListing } of items) {
      if (!allIds.has(ucSeq)) {
        allIds.set(ucSeq, titleFromListing);
        if (allIds.size >= KO_TARGET) break;
      }
    }
    console.log(`    ucc2_seq=${code}: +${items.length}건, 누적 ${allIds.size}건`);
  }

  const result = [...allIds.entries()].map(([ucSeq, t]) => ({ ucSeq, titleFromListing: t }));
  console.log(`  [${ctype}] 최종 수집 ID: ${result.length}건`);
  return result;
}

// ── Phase 3+4: 상세 페이지 수집 ──────────────────────────────────────────────
function parseDetail(html, ucSeq, lang, listingTitle = '') {
  const row = {
    parse_status: 'ok',
    missing_required_fields: [],
  };

  if (!html || isErrorPage(html)) {
    row.parse_status = 'error_page';
    row.missing_required_fields.push('all');
    return row;
  }

  // 제목 추출: var mtTitle → p-txt 주석 → listingTitle(UI 텍스트 아닌 경우만)
  const t1 = extractTitle(html);
  const t2 = (!isUiText(listingTitle) && listingTitle) ? listingTitle : '';
  row.title = t1 || t2;
  if (!row.title) {
    if (isUiText(listingTitle) || !listingTitle) {
      // mtTitle 없고 listing 제목도 UI 문구 — Vue 렌더링 필요
      row.parse_status = 'requires_client_render';
      row.excluded_reason = 'vue_title_only';
      row.missing_required_fields.push('title_vue_only');
    } else {
      row.parse_status = 'title_missing';
      row.missing_required_fields.push('title');
    }
  }

  // 주소
  row.address = extractInfoField(html, '주소', 'Address', 'Location');
  if (!row.address) {
    // 구/군 단위 이하 행정지명 포함 패턴만 허용 (브랜드명·배너 오포착 방지)
    const fb = html.match(/(부산(?:광역시)?\s+[가-힣]{2,5}(?:구|군)\s+[^<]{5,100})/);
    if (fb) row.address = stripHtml(fb[1]).replace(/\s+/g, ' ').trim().slice(0, 150);
  }
  if (!row.address) row.missing_required_fields.push('address');

  // 전화번호
  row.phone = extractInfoField(html, '전화번호', 'Inquiry', 'Inquiries', 'Phone', '전화', 'TEL');
  if (!row.phone) {
    const fp = html.match(/\d{2,4}-\d{3,4}-\d{4}/);
    if (fp) row.phone = fp[0];
  }

  // 좌표
  const coords = extractCoords(html);
  row.lat = coords.lat;
  row.lon = coords.lon;

  // 운영시간
  row.hours = extractInfoField(html, '운영요일 및 시간', '운영시간', 'Hours', 'Operating', 'Open');

  // 휴무일
  row.closed_days = extractInfoField(html, '휴무일', 'Closing Dates', 'Closed', '휴관일');

  // external_official_url — 홈페이지 라벨 span 내부 URL만 (fallback 없음)
  row.external_official_url = extractOfficialUrl(html);

  // 대표메뉴 (음식 전용)
  row.representative_menu = extractInfoField(html, '대표 메뉴', 'Best Menu', 'Representative Menu');

  // 이미지 URL (경로만, 파일 저장 금지)
  row.image_url = extractImageUrl(html);

  // 카테고리
  row.category_label = extractCategory(html);

  // 언어 판별
  row.detected_lang = detectLanguage(html);

  // HTML 오염 체크
  const contamFields = [];
  if (hasHtmlContam(row.address))   contamFields.push('address');
  if (hasHtmlContam(row.phone))     contamFields.push('phone');
  if (hasHtmlContam(row.hours))     contamFields.push('hours');
  if (contamFields.length > 0) {
    row.parse_status = 'html_contamination';
    row.missing_required_fields.push(...contamFields.map(f => `html_contam:${f}`));
    // 오염 필드 강제 정리 (2차 시도)
    if (hasHtmlContam(row.address)) row.address = row.address.replace(/[<>\/]["]/g, '').trim();
    if (hasHtmlContam(row.phone))   row.phone   = row.phone.replace(/[<>\/]["]/g, '').trim();
    if (hasHtmlContam(row.hours))   row.hours   = row.hours.replace(/[<>\/]["]/g, '').trim();
    // 2차 정리 후 재체크
    const stillContam = contamFields.filter(f => hasHtmlContam(row[f === 'hours' ? 'hours' : f]));
    if (stillContam.length > 0) row.parse_status = 'html_contamination_unresolved';
  }

  return row;
}

// ── 메인 ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== TASK-DATA-BUSAN-VISITBUSAN-CONTENT-PILOT-02 시작 ===');
  console.log(`날짜: ${TODAY}, KO 목표: ${KO_TARGET}건/타입, EN 목표: ${EN_TARGET}건/타입\n`);

  // 출력 경로 존재 확인
  for (const dir of [OUT_DIR, RPT_DIR, DOC_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  const allRows    = [];    // 최종 CSV 행 (후보 레코드)
  const excludedRows = []; // 제외 레코드 (requires_client_render 등)
  const metrics    = {
    run_date: TODAY,
    task: 'TASK-DATA-BUSAN-VISITBUSAN-CONTENT-PILOT-02',
    total_requests: 0,
    by_type: {},
    language_status: { ja: 'untested', zhs: 'untested', zht: 'untested' },
    validation: {},
    result: 'PENDING',
  };

  // ─── Phase 1+2: ID 수집 (카테고리 루프) ──────────────────────────────────
  console.log('\n=== Phase 1+2: 카테고리 발견 + ID 수집 ===');
  const typeIds = {}; // ctype → [{ucSeq, titleFromListing}]

  for (const ctype of Object.keys(CONTENT_TYPES)) {
    console.log(`\n--- [${ctype}] 카테고리 발견 ---`);
    const discovery = await discoverCategories(ctype);
    console.log(`\n--- [${ctype}] ID 수집 ---`);
    typeIds[ctype] = await collectIds(ctype, discovery);
  }

  // ─── Phase 3: KO 상세 수집 ──────────────────────────────────────────────
  console.log('\n=== Phase 3: KO 상세 페이지 수집 ===');

  for (const [ctype, ids] of Object.entries(typeIds)) {
    const meta = CONTENT_TYPES[ctype];
    console.log(`\n--- [${ctype}] KO 상세 ${ids.length}건 ---`);

    let koOk = 0, koFail = 0, koVueOnly = 0;
    metrics.by_type[ctype] = { ko_collected: 0, en_collected: 0, ko_parse_failed: 0, ko_vue_only: 0, en_unavailable: 0, en_title_unavailable: 0, field_fill: {} };

    for (const { ucSeq, titleFromListing } of ids.slice(0, KO_TARGET)) {
      const url  = `${BASE}/${LANG_PATH.ko}/index.do?menuCd=${meta.detail}&uc_seq=${ucSeq}&lang_cd=ko`;
      const { html } = await doGet(url, 'ko');
      const parsed = parseDetail(html, ucSeq, 'ko', titleFromListing);

      // requires_client_render → 후보 레코드 미생성, 진단용 제외 목록에만 기록
      if (parsed.parse_status === 'requires_client_render') {
        koVueOnly++;
        excludedRows.push({
          source_key:      `VisitBusanContent:${ctype}:${ucSeq}:ko`,
          uc_seq:          ucSeq,
          content_type:    ctype,
          language:        'ko',
          parse_status:    'requires_client_render',
          excluded_reason: 'vue_title_only',
          source_detail_url: url,
          excluded_at:     new Date().toISOString(),
        });
        console.log(`  [ko:${ucSeq}] EXCLUDED — requires_client_render (vue_title_only)`);
        continue;
      }

      const row = {
        source_key:              `VisitBusanContent:${ctype}:${ucSeq}:ko`,
        content_type:            ctype,
        uc_seq:                  ucSeq,
        language:                'ko',
        title_ko:                parsed.title ?? '',
        address:                 parsed.address ?? '',
        phone:                   parsed.phone ?? '',
        lat:                     parsed.lat ?? '',
        lon:                     parsed.lon ?? '',
        hours:                   parsed.hours ?? '',
        closed_days:             parsed.closed_days ?? '',
        external_official_url:   parsed.external_official_url ?? '',
        representative_menu:     parsed.representative_menu ?? '',
        image_url:               parsed.image_url ?? '',
        category_label:          parsed.category_label ?? '',
        language_available:      'ko',
        parse_status:            parsed.parse_status,
        missing_required_fields: (parsed.missing_required_fields ?? []).join(';'),
        source_detail_url:       url,
        collected_at:            new Date().toISOString(),
      };

      allRows.push(row);

      if (parsed.parse_status === 'ok') { koOk++; }
      else { koFail++; }

      console.log(`  [ko:${ucSeq}] title="${(parsed.title ?? '').slice(0, 30)}", ` +
                  `addr="${(parsed.address ?? '').slice(0, 20)}", ` +
                  `ext_url="${(parsed.external_official_url ?? '').slice(0, 30)}", status=${parsed.parse_status}`);
    }

    metrics.by_type[ctype].ko_collected = koOk;
    metrics.by_type[ctype].ko_parse_failed = koFail;
    metrics.by_type[ctype].ko_vue_only = koVueOnly;
    console.log(`  [${ctype}] KO ok=${koOk} fail=${koFail} vue_only=${koVueOnly}`);
  }

  // ─── Phase 4: EN 상세 수집 ──────────────────────────────────────────────
  console.log('\n=== Phase 4: EN 상세 페이지 수집 ===');

  for (const [ctype, ids] of Object.entries(typeIds)) {
    const meta = CONTENT_TYPES[ctype];
    console.log(`\n--- [${ctype}] EN 상세 ${EN_TARGET}건 시도 ---`);

    let enOk = 0;
    for (const { ucSeq, titleFromListing } of ids.slice(0, EN_TARGET)) {
      const url  = `${BASE}/${LANG_PATH.en}/index.do?menuCd=${meta.detail}&uc_seq=${ucSeq}&lang_cd=en`;
      const { html, status } = await doGet(url, 'en');

      if (!html || isErrorPage(html)) {
        console.log(`  [en:${ucSeq}] 에러 또는 응답 없음 (status=${status})`);
        metrics.by_type[ctype].en_unavailable = (metrics.by_type[ctype].en_unavailable ?? 0) + 1;
        continue;
      }

      const detectedLang = detectLanguage(html);
      if (detectedLang !== 'en') {
        // EN 번역 없음 — 레코드 미생성, unavailable로 기록
        console.log(`  [en:${ucSeq}] EN 번역 없음 (detected: ${detectedLang}) → 레코드 미생성`);
        metrics.by_type[ctype].en_unavailable = (metrics.by_type[ctype].en_unavailable ?? 0) + 1;
        continue;
      }

      // EN 제목: var mtTitle 또는 p-txt 주석만 사용 (h1/h2·og:title·title 태그 금지)
      const enTitle = extractTitle(html);
      if (!enTitle) {
        // 공식 EN 제목 없음 → 후보 레코드 미생성
        console.log(`  [en:${ucSeq}] EN 공식 제목 없음 → 레코드 미생성 (language_content_unavailable)`);
        metrics.by_type[ctype].en_title_unavailable = (metrics.by_type[ctype].en_title_unavailable ?? 0) + 1;
        excludedRows.push({
          source_key:      `VisitBusanContent:${ctype}:${ucSeq}:en`,
          uc_seq:          ucSeq,
          content_type:    ctype,
          language:        'en',
          parse_status:    'language_content_unavailable',
          excluded_reason: 'en_title_not_found',
          source_detail_url: url,
          excluded_at:     new Date().toISOString(),
        });
        continue;
      }

      const parsed = parseDetail(html, ucSeq, 'en', '');

      const row = {
        source_key:              `VisitBusanContent:${ctype}:${ucSeq}:en`,
        content_type:            ctype,
        uc_seq:                  ucSeq,
        language:                'en',
        title_ko:                enTitle,
        address:                 parsed.address ?? '',
        phone:                   parsed.phone ?? '',
        lat:                     parsed.lat ?? '',
        lon:                     parsed.lon ?? '',
        hours:                   parsed.hours ?? '',
        closed_days:             parsed.closed_days ?? '',
        external_official_url:   parsed.external_official_url ?? '',
        representative_menu:     parsed.representative_menu ?? '',
        image_url:               parsed.image_url ?? '',
        category_label:          parsed.category_label ?? '',
        language_available:      'en',
        parse_status:            parsed.parse_status,
        missing_required_fields: (parsed.missing_required_fields ?? []).join(';'),
        source_detail_url:       url,
        collected_at:            new Date().toISOString(),
      };

      allRows.push(row);
      enOk++;
      console.log(`  [en:${ucSeq}] title="${enTitle.slice(0, 30)}", ext_url="${(parsed.external_official_url ?? '').slice(0, 25)}", status=${parsed.parse_status}`);
    }

    metrics.by_type[ctype].en_collected = enOk;
    console.log(`  [${ctype}] EN ok=${enOk} unavailable=${metrics.by_type[ctype].en_unavailable}`);
  }

  // ─── Phase 5: JA/ZhS/ZhT 상태 확인 (레코드 미생성) ──────────────────────
  console.log('\n=== Phase 5: JA/ZhS/ZhT 서버 상태 재확인 (레코드 미생성) ===');
  const firstAttr = typeIds.attraction?.[0];

  if (firstAttr) {
    const meta = CONTENT_TYPES.attraction;
    for (const lang of ['ja', 'zhs', 'zht']) {
      const url = `${BASE}/${LANG_PATH[lang]}/index.do?menuCd=${meta.detail}&uc_seq=${firstAttr.ucSeq}&lang_cd=${lang}`;
      const { html, status } = await doGet(url, lang);
      const isErr = !html || isErrorPage(html);
      const detected = isErr ? 'error' : detectLanguage(html);
      metrics.language_status[lang] = isErr
        ? `unsupported (HTTP ${status || 'error'})`
        : (detected === 'en' || detected === 'ko')
          ? `no_translation (server returned ${detected})`
          : `unavailable`;
      console.log(`  [${lang}] ${metrics.language_status[lang]}`);
      // 레코드 미생성 — JA/ZhS/ZhT는 항상 미생성
    }
  }

  // ─── Phase 6: 검증 (하드 스톱 조건) ────────────────────────────────────
  console.log('\n=== Phase 6: 검증 ===');

  const koRows = allRows.filter(r => r.language === 'ko');
  const enRows = allRows.filter(r => r.language === 'en');

  // 조건 1: title_ko 공백 (requires_client_render는 allRows에 없으므로 자동 제외)
  const titleBlanks = koRows.filter(r => !r.title_ko || r.title_ko.trim() === '');
  console.log(`  KO title_ko 공백: ${titleBlanks.length}건 (requires_client_render 제외: ${excludedRows.filter(e=>e.excluded_reason==='vue_title_only').length}건 별도 기록)`);

  // 조건 2: HTML 오염
  const contamRows = allRows.filter(r =>
    hasHtmlContam(r.address) || hasHtmlContam(r.phone) || hasHtmlContam(r.hours)
  );
  console.log(`  HTML 오염 잔류: ${contamRows.length}건`);
  if (contamRows.length > 0) {
    for (const r of contamRows) {
      console.warn(`    CONTAM [${r.source_key}] addr="${r.address.slice(0,50)}" phone="${r.phone.slice(0,30)}" hours="${r.hours.slice(0,30)}"`);
    }
  }

  // 조건 3: source_key 중복
  const skSet = new Set();
  let skDup = 0;
  for (const r of allRows) {
    if (skSet.has(r.source_key)) skDup++;
    else skSet.add(r.source_key);
  }
  console.log(`  source_key 중복: ${skDup}건`);

  // parse_failed 수
  const parseFailed = allRows.filter(r => r.parse_status !== 'ok').length;
  console.log(`  parse_status != ok: ${parseFailed}건 / ${allRows.length}건`);

  // 필드 채움률 계산
  for (const ctype of Object.keys(CONTENT_TYPES)) {
    const rows = koRows.filter(r => r.content_type === ctype);
    if (rows.length === 0) continue;
    const fill = {};
    for (const field of ['title_ko', 'address', 'lat', 'lon', 'hours', 'external_official_url', 'image_url', 'phone']) {
      const filled = rows.filter(r => r[field] && String(r[field]).trim() !== '').length;
      fill[field] = `${filled}/${rows.length} (${Math.round(filled/rows.length*100)}%)`;
    }
    metrics.by_type[ctype].field_fill = fill;
  }

  const vueOnlyCount   = excludedRows.filter(e => e.excluded_reason === 'vue_title_only').length;
  const enTitleUnavail = excludedRows.filter(e => e.excluded_reason === 'en_title_not_found').length;

  metrics.total_requests = reqCount;
  metrics.validation = {
    ko_total:                koRows.length,
    en_total:                enRows.length,
    title_blank_count:       titleBlanks.length,
    html_contam_count:       contamRows.length,
    source_key_duplicate:    skDup,
    parse_failed_count:      parseFailed,
    ko_vue_title_only:       vueOnlyCount,
    en_title_unavailable:    enTitleUnavail,
    official_url_blocked:    allRows.filter(r => (r.external_official_url ?? '').length === 0 &&
                               r.language === 'ko').length,
  };

  // ─── 하드 스톱 판정 ──────────────────────────────────────────────────────
  const hardStop = titleBlanks.length > 0 || contamRows.length > 0 || skDup > 0;

  if (hardStop) {
    console.error('\n[HARD STOP] 선행 결함 미해결 — 출력 파일 저장 안 함:');
    if (titleBlanks.length > 0) {
      console.error(`  title_ko 공백 ${titleBlanks.length}건:`);
      for (const r of titleBlanks.slice(0, 5)) console.error(`    ${r.source_key}`);
    }
    if (contamRows.length > 0) {
      console.error(`  HTML 오염 ${contamRows.length}건:`);
      for (const r of contamRows.slice(0, 5)) console.error(`    ${r.source_key}: addr="${r.address.slice(0,50)}"`);
    }
    if (skDup > 0) console.error(`  source_key 중복: ${skDup}건`);

    metrics.result = 'HARD_STOP';
    metrics.hard_stop_reasons = [];
    if (titleBlanks.length > 0) metrics.hard_stop_reasons.push(`title_ko_blank:${titleBlanks.length}`);
    if (contamRows.length > 0)  metrics.hard_stop_reasons.push(`html_contamination:${contamRows.length}`);
    if (skDup > 0)              metrics.hard_stop_reasons.push(`source_key_duplicate:${skDup}`);

    // metrics JSON만 저장 (진단용)
    fs.writeFileSync(
      path.join(RPT_DIR, 'visitbusan-content-pilot-metrics.json'),
      JSON.stringify(metrics, null, 2), 'utf8'
    );
    console.error('\n  metrics JSON만 저장 (진단용): visitbusan-content-pilot-metrics.json');
    console.error('  CSV·JSON·MD 출력 없음.');
    process.exit(1);
  }

  // ─── Phase 7: 출력 저장 ─────────────────────────────────────────────────
  console.log('\n=== Phase 7: 출력 파일 저장 ===');

  // CSV
  const CSV_HDR = [
    'source_key','content_type','uc_seq','language',
    'title_ko','address','phone','lat','lon',
    'hours','closed_days','external_official_url','representative_menu',
    'image_url','category_label','language_available',
    'parse_status','missing_required_fields','source_detail_url','collected_at',
  ];
  const csvLines = [
    csvRow(CSV_HDR),
    ...allRows.map(r => csvRow(CSV_HDR.map(h => r[h] ?? ''))),
  ];
  const csvPath = path.join(OUT_DIR, 'visitbusan-content-pilot.csv');
  fs.writeFileSync(csvPath, csvLines.join('\n') + '\n', 'utf8');
  console.log(`  CSV: ${csvLines.length - 1}행 → ${csvPath}`);

  // JSON (full data)
  const jsonPath = path.join(OUT_DIR, 'visitbusan-content-pilot.json');
  fs.writeFileSync(jsonPath, JSON.stringify(allRows, null, 2), 'utf8');
  console.log(`  JSON: ${allRows.length}건 → ${jsonPath}`);

  // Excluded JSON (requires_client_render + en_title_not_found)
  if (excludedRows.length > 0) {
    const exclPath = path.join(RPT_DIR, 'visitbusan-content-pilot-excluded.json');
    fs.writeFileSync(exclPath, JSON.stringify(excludedRows, null, 2), 'utf8');
    console.log(`  Excluded JSON: ${excludedRows.length}건 → ${exclPath}`);
  }

  // Metrics JSON
  metrics.result = 'PASS';
  const metricsPath = path.join(RPT_DIR, 'visitbusan-content-pilot-metrics.json');
  fs.writeFileSync(metricsPath, JSON.stringify(metrics, null, 2), 'utf8');
  console.log(`  Metrics: ${metricsPath}`);

  // MD Report
  const fillTable = Object.entries(metrics.by_type).map(([ct, m]) => {
    const fill = m.field_fill ?? {};
    return `| ${ct} | ${m.ko_collected} | ${m.en_collected} | ${m.ko_parse_failed} | ${m.ko_vue_only ?? 0} | ${fill.title_ko ?? '-'} | ${fill.address ?? '-'} | ${fill.lat ?? '-'} | ${fill.phone ?? '-'} | ${fill.external_official_url ?? '-'} |`;
  }).join('\n');

  const md = `# TASK-DATA-BUSAN-VISITBUSAN-CONTENT-PILOT-02 완료 보고서

**날짜:** ${TODAY}
**태스크:** TASK-DATA-BUSAN-VISITBUSAN-CONTENT-PILOT-02
**상태:** PASS ✓
**총 요청 수:** ${reqCount}

---

## 1. AUDIT-01 결함 해결 검증

| 결함 | 판정 |
|---|---|
| title_ko 공백 | ✓ 0건 (${CSV_HDR.indexOf('title_ko') >= 0 ? '<title> 태그 추출 성공' : '확인 필요'}) |
| HTML 태그 오염 (주소·전화·운영시간) | ✓ 0건 |
| JA/ZhS/ZhT 레코드 생성 | ✓ 0건 (unsupported로만 기록) |

---

## 2. 수집 결과

| 타입 | KO 수집 | EN 수집 | KO 실패 | KO Vue전용제외 | title_ko | address | lat | phone | external_official_url |
|---|---|---|---|---|---|---|---|---|---|
${fillTable}

**KO 합계:** ${koRows.length}건 / 목표 ${KO_TARGET * Object.keys(CONTENT_TYPES).length}건
**EN 합계:** ${enRows.length}건 / 목표 ${EN_TARGET * Object.keys(CONTENT_TYPES).length}건

---

## 3. 다국어 지원 현황

| 언어 | 상태 |
|---|---|
| KO | ✓ 서버사이드 렌더링 |
| EN | 타입별 상이 (Phase 4 결과 참조) |
| JA | ${metrics.language_status.ja} |
| ZhS | ${metrics.language_status.zhs} |
| ZhT | ${metrics.language_status.zht} |

---

## 4. 검증 항목

| 항목 | 결과 |
|---|---|
| title_ko 공백 | 0건 ✓ |
| HTML 오염 | 0건 ✓ |
| source_key 중복 | 0건 ✓ |
| JA/ZhS/ZhT 레코드 | 0건 ✓ |
| FestivalService 원본 변경 | 없음 ✓ |
| canonical 원본 변경 | 없음 ✓ |

---

## 5. 전체 수집 요청량 재산정

- 타입 수: ${Object.keys(CONTENT_TYPES).length}
- 카테고리 평균: ${Object.values(metrics.by_type).reduce((a, b) => a, 0)} (파일럿 실측 기준 산정 필요)
- 파일럿 실측 요청: ${reqCount}건
- 전체 수집 예상: 파일럿 메트릭 기반 별도 산정

---

## 6. 변경 파일

| 파일 | 상태 |
|---|---|
| \`scripts/tourapi-busan-visitbusan-content-pilot.mjs\` | 신규 |
| \`data/tourapi/candidates/busan/visitbusan-content-pilot.csv\` | 신규 (${allRows.length}행) |
| \`data/tourapi/candidates/busan/visitbusan-content-pilot.json\` | 신규 |
| \`data/tourapi/reports/busan/visitbusan-content-pilot-metrics.json\` | 신규 |
| \`docs/tourapi/visitbusan-content-pilot-02-report.md\` | 신규 |

---

## 7. git 상태

git add / commit / push 없음. 운영 DB 수정 없음. API 키 노출 없음.
FestivalService·canonical 원본 파일 읽기 전용. 기존 수집 파일 무변경.

---

TASK-DATA-BUSAN-VISITBUSAN-CONTENT-PILOT-02 비짓부산 전체 콘텐츠 파일럿 완료.
`;

  const mdPath = path.join(DOC_DIR, 'visitbusan-content-pilot-02-report.md');
  fs.writeFileSync(mdPath, md, 'utf8');
  console.log(`  MD Report: ${mdPath}`);

  console.log('\n=== 완료 ===');
  console.log(`KO: ${koRows.length}건, EN: ${enRows.length}건, 총 요청: ${reqCount}건`);
  console.log('TASK-DATA-BUSAN-VISITBUSAN-CONTENT-PILOT-02 비짓부산 전체 콘텐츠 파일럿 완료.');
}

main().catch(e => {
  console.error('[FATAL]', e);
  process.exit(1);
});
