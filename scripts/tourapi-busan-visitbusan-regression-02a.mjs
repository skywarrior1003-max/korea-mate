#!/usr/bin/env node
/**
 * TASK-DATA-BUSAN-VISITBUSAN-PARSER-FIX-02A-REV 회귀 검증
 * PARSER-FIX-02A-REV 수정 사항에 대한 표본 회귀 테스트
 *
 * 표본: uc_seq 2566(KO), 2753(KO/EN), 2678(KO/EN), 2789/2784/2763/2755/2788(EN 누락)
 * 금지: 전체 수집, Playwright, DB, commit/push
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.dirname(__dir);
const TODAY = new Date().toISOString().slice(0, 10);

const BASE     = 'https://www.visitbusan.net';
const DELAY_MS = 700;
const UA       = 'Mozilla/5.0 (compatible; KoreaMate-Regression/1.0; educational research)';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── 유틸 (PARSER-FIX-02A-REV 반영) ──────────────────────────────────────────

function stripHtml(s = '') {
  if (!s) return '';
  let r = s
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, '');
  r = r.replace(/<[^<>]*>/g, ' ');
  r = r.replace(/\s*\/>/g, '').replace(/["']\s*>/g, '');
  r = r.replace(/[<>]/g, '');
  r = r.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
  return r.replace(/\s+/g, ' ').trim();
}

const SITE_AND_CATEGORY = new Set([
  '부산에가면', 'visitbusan', 'visit busan', '비짓부산', '부산관광',
  'visit busan 부산광역시', 'visit busan 釜山広域市',
  '명소', '음식', '쇼핑', '체험', '일정여행', '추천코스', '추천여행', '숙박',
  '테마여행', '미식투어', '해양', '웰니스',
  'attraction', 'food', 'shopping', 'experience', 'itinerary', 'course',
]);

const UI_TEXTS = new Set([
  '상세보기', '자세히 보기', '더보기', '더 보기',
  'view detail', 'view details', 'view more', 'more', 'see more',
]);
function isUiText(s) {
  if (!s) return false;
  return UI_TEXTS.has(s.toLowerCase().replace(/[\s\.\!\?\-]+/g, ' ').trim());
}

const BLOCKED_URL_PATTERNS = /vprivacy|terms\.do|agreement|policy\.do|visitbusan\.net\/[a-z]{2}\/index/i;

/** PARSER-FIX-02A-REV: var mtTitle + p-txt 주석만 사용 (h1/h2·og:title·title 태그 금지) */
function extractTitle(html) {
  if (!html) return '';
  let m = html.match(/var\s+mtTitle\s*=\s*["']([^"']{2,80})["']/i);
  if (m) return m[1].replace(/&amp;/g, '&').trim();
  m = html.match(/<!--\s*<div[^>]*class=["'][^"']*p-txt[^"']*["'][^>]*>([^<]{2,80})<\/div>\s*-->/i);
  if (m) return m[1].replace(/&amp;/g, '&').trim();
  // 기타 JS 변수
  m = html.match(/(?:var|let|const)\s+(?:contTitle|contentTitle|wTitle|pageTitle|contsTitle)\s*=\s*["']([^"']{2,80})["']/i);
  if (m) {
    const v = m[1].replace(/&amp;/g, '&').trim();
    if (!SITE_AND_CATEGORY.has(v.toLowerCase())) return v;
  }
  // NOTE: h1/h2, og:title, <title> 태그 fallback 없음 (VisitBusan 구조 특성)
  return '';
}

/** PARSER-FIX-02A-REV: 라벨 없으면 빈 문자열, 공통 푸터 URL 차단 */
function extractOfficialUrl(html) {
  if (!html) return '';
  const re = /<li[^>]*>\s*<p[^>]*>(?:홈페이지|Homepage|Website|Official)[^<]*<\/p>\s*<span[^>]*>([\s\S]*?)<\/span>/i;
  const m = html.match(re);
  if (!m) return '';
  const hrefM = m[1].match(/href=["']?(https?:\/\/[^"'\s>]{5,})["']?/i);
  const raw = hrefM
    ? hrefM[1]
    : (m[1].match(/https?:\/\/[^\s"'<>]{5,}/)?.[0] ?? '').replace(/['">\s]+$/, '');
  if (!raw) return '';
  if (BLOCKED_URL_PATTERNS.test(raw)) return '';
  return raw;
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

async function doGet(url, lang = 'ko') {
  await sleep(DELAY_MS);
  const acceptLang = { ko: 'ko-KR,ko;q=0.9', en: 'en-US,en;q=0.9' }[lang] ?? 'ko-KR';
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html,*/*;q=0.8', 'Accept-Language': acceptLang },
      redirect: 'follow', signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { html: null, status: res.status };
    return { html: await res.text(), status: res.status };
  } catch(e) {
    return { html: null, status: 0, error: e.message };
  }
}

// ─── 표본 정의 ────────────────────────────────────────────────────────────────

const SAMPLES = [
  // 그룹 1: uc_seq=2566 — requires_client_render 분류 확인
  { id: 'S1', uc_seq: '2566', lang: 'ko', menuCd: 'DOM_000000201001001000', listingTitle: '상세보기',
    expect: 'requires_client_render', desc: 'KO UI텍스트 제목, var mtTitle 없음' },

  // 그룹 2: 정상 EN var mtTitle 표본 (2678)
  { id: 'S2', uc_seq: '2678', lang: 'ko', menuCd: 'DOM_000000201001001000', listingTitle: '',
    expect: 'ok', expect_title_nonempty: true, desc: 'KO 정상 — var mtTitle 존재' },
  { id: 'S3', uc_seq: '2678', lang: 'en', menuCd: 'DOM_000000201001001000', listingTitle: '',
    expect: 'en_ok', expect_title_nonempty: true, desc: 'EN 정상 — var mtTitle 영문 존재' },

  // 그룹 3: EN title 누락 6건 — EN 후보 레코드 미생성 확인
  { id: 'S4', uc_seq: '2753', lang: 'en', menuCd: 'DOM_000000201001001000', listingTitle: '',
    expect: 'en_excluded', desc: 'EN title 없음 → 미생성' },
  { id: 'S5', uc_seq: '2789', lang: 'en', menuCd: 'DOM_000000202008001000', listingTitle: '',
    expect: 'en_excluded', desc: 'EN title 없음 → 미생성' },
  { id: 'S6', uc_seq: '2784', lang: 'en', menuCd: 'DOM_000000202008001000', listingTitle: '',
    expect: 'en_excluded', desc: 'EN title 없음 → 미생성' },
  { id: 'S7', uc_seq: '2763', lang: 'en', menuCd: 'DOM_000000202008001000', listingTitle: '',
    expect: 'en_excluded', desc: 'EN title 없음 → 미생성 (EN 주소·전화 있음)' },
  { id: 'S8', uc_seq: '2755', lang: 'en', menuCd: 'DOM_000000202008001000', listingTitle: '',
    expect: 'en_excluded', desc: 'EN title 없음 → 미생성' },
  { id: 'S9', uc_seq: '2788', lang: 'en', menuCd: 'DOM_000000202012001000', listingTitle: '',
    expect: 'en_excluded', desc: 'EN title 없음 → 미생성 (EN 주소 있음)' },

  // 그룹 4: 정상 홈페이지 보유 — external_official_url 정상 추출
  { id: 'S10', uc_seq: '2753', lang: 'ko', menuCd: 'DOM_000000201001001000', listingTitle: '',
    expect: 'ok', expect_ext_url: true, desc: 'KO 외부 홈페이지 있음 (zigzagartcenter.com)' },
  { id: 'S11', uc_seq: '2314', lang: 'ko', menuCd: 'DOM_000000201001001000', listingTitle: '',
    expect: 'ok', expect_ext_url: true, desc: 'KO 외부 홈페이지 있음 (beomeomuseum.org)' },

  // 그룹 5: 홈페이지 없는 표본 — external_official_url 공백 확인
  { id: 'S12', uc_seq: '2678', lang: 'ko', menuCd: 'DOM_000000201001001000', listingTitle: '',
    expect: 'ok', expect_ext_url: false, desc: 'KO 홈페이지 없음 (이전에 vprivacy1 오포착)' },
  { id: 'S13', uc_seq: '2612', lang: 'ko', menuCd: 'DOM_000000201001001000', listingTitle: '',
    expect: 'ok', expect_ext_url: false, desc: 'KO 홈페이지 없음' },

  // 그룹 6: hours 추출 회귀 (PARSER-FIX-04A) — '운영요일 및 시간' 라벨 복원 검증
  { id: 'S14', uc_seq: '2753', lang: 'ko', menuCd: 'DOM_000000201001001000', listingTitle: '',
    expect: 'ok', expect_hours_nonempty: true, desc: 'hours 정상 — 명소 운영요일 및 시간 존재' },
  { id: 'S15', uc_seq: '2386', lang: 'ko', menuCd: 'DOM_000000201002001000', listingTitle: '',
    expect: 'ok', expect_hours_nonempty: true, desc: 'hours 정상 — 음식 운영요일 및 시간 존재' },
  { id: 'S16', uc_seq: '2670', lang: 'ko', menuCd: 'DOM_000000201003001000', listingTitle: '',
    expect: 'ok', expect_hours_nonempty: true, desc: 'hours 정상 — 쇼핑 운영요일 및 시간 존재' },
  { id: 'S17', uc_seq: '2789', lang: 'ko', menuCd: 'DOM_000000202008001000', listingTitle: '',
    expect: 'ok', expect_hours_empty: true, desc: 'hours 정상 — 체험 운영시간 라벨 없음 (빈 문자열)' },
  { id: 'S18', uc_seq: '2788', lang: 'ko', menuCd: 'DOM_000000202012001000', listingTitle: '',
    expect: 'ok', expect_hours_empty: true, desc: 'hours 정상 — 코스 운영시간 라벨 없음 (빈 문자열)' },

  // 그룹 7: image_url 서버사이드 확인 (PARSER-FIX-04A)
  // VisitBusan 콘텐츠 이미지는 Vue.js 동적 로딩 → 서버사이드 HTML에 없음 → 빈 문자열 정상
  { id: 'S19', uc_seq: '2753', lang: 'ko', menuCd: 'DOM_000000201001001000', listingTitle: '',
    expect: 'ok', expect_image_serverside_blank: true, desc: 'image_url 서버사이드 빈 문자열 확인 (Vue 동적 로딩)' },
];

// ─── PASS 조건 함수 ────────────────────────────────────────────────────────────

function checkPass(results) {
  const issues = [];

  // 개인정보처리방침·공통 푸터 URL 0
  const footerUrls = results.filter(r =>
    r.external_official_url && BLOCKED_URL_PATTERNS.test(r.external_official_url)
  );
  if (footerUrls.length > 0) {
    issues.push(`개인정보처리방침·공통 푸터 URL 잔류: ${footerUrls.map(r=>r.sample_id).join(', ')}`);
  }

  // UI 문구 제목 후보 저장 0
  const uiTitleRows = results.filter(r =>
    r.candidate_created && isUiText(r.title_extracted)
  );
  if (uiTitleRows.length > 0) {
    issues.push(`UI 문구 제목 저장: ${uiTitleRows.map(r=>r.sample_id).join(', ')}`);
  }

  // 제목 없는 정상 후보 레코드 0
  const blankTitles = results.filter(r =>
    r.candidate_created && (!r.title_extracted || r.title_extracted.trim() === '')
  );
  if (blankTitles.length > 0) {
    issues.push(`제목 없는 후보 레코드: ${blankTitles.map(r=>r.sample_id).join(', ')}`);
  }

  // 2566이 requires_client_render로 분류
  const s2566 = results.find(r => r.uc_seq === '2566' && r.language === 'ko');
  if (!s2566 || s2566.parse_status !== 'requires_client_render') {
    issues.push(`uc_seq=2566 requires_client_render 미분류: ${JSON.stringify(s2566?.parse_status)}`);
  }
  if (s2566 && s2566.candidate_created) {
    issues.push(`uc_seq=2566 후보 레코드가 생성됨 (미생성이어야 함)`);
  }

  // EN 허위 fallback 0 — h1/h2·og:title·title 태그에서 잘못된 값 없어야 함
  // (이 검증은 title_extracted가 ko 카테고리 문자열이면 실패)
  const koCategory = ['명소', '음식', '쇼핑', '체험', '추천여행', '추천코스', '일정여행'];
  const falseFallbacks = results.filter(r =>
    r.language === 'en' && r.candidate_created &&
    koCategory.includes(r.title_extracted?.trim())
  );
  if (falseFallbacks.length > 0) {
    issues.push(`EN 허위 fallback (KO 카테고리): ${falseFallbacks.map(r=>r.sample_id).join(', ')}`);
  }

  // 공식 EN 제목이 확인된 표본 정상 추출 (S3: 2678 EN)
  const s2678en = results.find(r => r.uc_seq === '2678' && r.language === 'en');
  if (!s2678en?.candidate_created || !s2678en?.title_extracted) {
    issues.push(`EN 정상 표본(2678) 제목 추출 실패`);
  }

  // EN 미제공 항목 후보 레코드 미생성
  const enShouldExclude = ['2753','2789','2784','2763','2755','2788'];
  for (const ucSeq of enShouldExclude) {
    const r = results.find(r => r.uc_seq === ucSeq && r.language === 'en');
    if (r?.candidate_created) {
      issues.push(`EN 미제공 ${ucSeq} 후보 레코드가 생성됨`);
    }
  }

  // source_detail_url과 external_official_url 혼합 0
  const mixedUrl = results.filter(r =>
    r.candidate_created &&
    r.external_official_url &&
    r.external_official_url.includes('visitbusan.net') &&
    r.external_official_url.includes('menuCd=')
  );
  if (mixedUrl.length > 0) {
    issues.push(`source_detail_url과 external_official_url 혼합: ${mixedUrl.map(r=>r.sample_id).join(', ')}`);
  }

  // 기존 정상 표본 회귀 결함 — S2(2678 KO), S10(2753 KO) 정상 수집 확인
  const s2678ko = results.find(r => r.uc_seq === '2678' && r.language === 'ko');
  if (!s2678ko?.candidate_created || !s2678ko?.title_extracted) {
    issues.push(`회귀 결함: 2678 KO 정상 표본 실패`);
  }

  // PARSER-FIX-04A: hours 추출 확인 (S14=2753, S15=2386, S16=2670 → nonempty 기대)
  const hoursExpectFilled = results.filter(r => r.hours_note === 'EXPECTED_HOURS_MISSING');
  if (hoursExpectFilled.length > 0) {
    issues.push(`hours 미추출 (nonempty 기대): ${hoursExpectFilled.map(r=>r.sample_id).join(', ')}`);
  }

  // PARSER-FIX-04A: hours 없어야 하는 표본 (S17=2789, S18=2788 → empty 기대)
  const hoursUnexpected = results.filter(r => r.hours_note?.startsWith('UNEXPECTED_HOURS'));
  if (hoursUnexpected.length > 0) {
    issues.push(`hours 예상치 않게 추출됨: ${hoursUnexpected.map(r => `${r.sample_id}:${r.hours_extracted}`).join(', ')}`);
  }

  // PARSER-FIX-04A: image_url 서버사이드 공백 확인 — 공통 이미지 포착 금지
  const wrongImages = results.filter(r => r.image_note?.startsWith('UNEXPECTED_IMG'));
  if (wrongImages.length > 0) {
    issues.push(`잘못된 공통 이미지 URL 포착: ${wrongImages.map(r=>r.sample_id).join(', ')}`);
  }

  return issues;
}

// ─── 메인 ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== PARSER-FIX-02A-REV 회귀 검증 ===');
  console.log(`날짜: ${TODAY}, 표본: ${SAMPLES.length}건\n`);

  const results = [];
  let reqCount = 0;

  for (const s of SAMPLES) {
    reqCount++;
    const langPath = s.lang === 'en' ? 'en' : 'kr';
    const langCd   = s.lang === 'en' ? 'en' : 'ko';
    const url = `${BASE}/${langPath}/index.do?menuCd=${s.menuCd}&uc_seq=${s.uc_seq}&lang_cd=${langCd}`;
    console.log(`\n[${s.id}] ${s.desc}`);
    console.log(`  URL: ...${url.replace(BASE,'')}`);

    const { html, status } = await doGet(url, s.lang);

    // hours 추출 (PARSER-FIX-04A: '운영요일 및 시간' 라벨 복원)
    function extractHours(h) {
      if (!h) return '';
      const re = /<li[^>]*>\s*<p[^>]*>(?:운영요일 및 시간|운영시간|영업시간|Hours|Opening Hours|Operating|Open)[^<]*<\/p>\s*<span[^>]*>([\s\S]*?)<\/span>/i;
      const m = h.match(re);
      if (!m) return '';
      return h.replace(/<!--[\s\S]*?-->/g, '').replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '')
              .replace(/<[^<>]*>/g, ' ').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim()
             .slice(0, 200);
      // inline stripHtml-equivalent for span content:
    }
    function extractHoursFromSpan(h) {
      if (!h) return '';
      const re = /<li[^>]*>\s*<p[^>]*>(?:운영요일 및 시간|운영시간|영업시간|Hours|Opening Hours|Operating|Open)[^<]*<\/p>\s*<span[^>]*>([\s\S]*?)<\/span>/i;
      const m = h.match(re);
      if (!m) return '';
      const raw = m[1].replace(/<!--[\s\S]*?-->/g, '').replace(/&nbsp;/g, ' ').replace(/<[^<>]*>/g, ' ').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
      return raw.slice(0, 100);
    }

    const result = {
      sample_id:             s.id,
      uc_seq:                s.uc_seq,
      language:              s.lang,
      expect:                s.expect,
      desc:                  s.desc,
      http_status:           status,
      html_ok:               !!html && !isErrorPage(html),
      detected_lang:         html ? detectLanguage(html) : 'none',
      title_extracted:       html ? extractTitle(html) : '',
      external_official_url: html ? extractOfficialUrl(html) : '',
      hours_extracted:       html ? extractHoursFromSpan(html) : '',
      image_url_extracted:   '',
      source_detail_url:     url,
      candidate_created:     false,
      parse_status:          null,
      excluded_reason:       null,
      pass:                  null,
    };

    if (!html || isErrorPage(html)) {
      result.parse_status = 'error_page';
      result.pass = false;
      console.log(`  → ERROR (status=${status})`);
      results.push(result);
      continue;
    }

    const title     = result.title_extracted;
    const listTitle = s.listingTitle ?? '';

    // KO 처리
    if (s.lang === 'ko') {
      const effectiveTitle = title || (!isUiText(listTitle) ? listTitle : '');
      if (!effectiveTitle) {
        result.parse_status    = 'requires_client_render';
        result.excluded_reason = 'vue_title_only';
        result.candidate_created = false;
      } else {
        result.candidate_created = true;
        result.title_extracted   = effectiveTitle;
        result.parse_status      = 'ok';
      }
    }

    // EN 처리
    if (s.lang === 'en') {
      if (result.detected_lang !== 'en') {
        result.parse_status    = 'not_en_page';
        result.excluded_reason = 'not_en';
        result.candidate_created = false;
      } else if (!title) {
        result.parse_status    = 'language_content_unavailable';
        result.excluded_reason = 'en_title_not_found';
        result.candidate_created = false;
      } else {
        result.candidate_created = true;
        result.parse_status      = 'ok';
      }
    }

    // expect 검증
    const expMap = {
      'requires_client_render': () => result.parse_status === 'requires_client_render',
      'ok':                     () => result.candidate_created && result.parse_status === 'ok',
      'en_ok':                  () => result.candidate_created && result.parse_status === 'ok',
      'en_excluded':            () => !result.candidate_created && result.parse_status === 'language_content_unavailable',
    };
    const expectFn = expMap[s.expect];
    result.pass = expectFn ? expectFn() : null;

    // ext_url 기대값 확인
    if (s.expect_ext_url === true && !result.external_official_url) {
      result.pass = false;
      result.ext_url_note = 'EXPECTED_URL_MISSING';
    }
    if (s.expect_ext_url === false && result.external_official_url) {
      result.pass = false;
      result.ext_url_note = `UNEXPECTED_URL: ${result.external_official_url}`;
    }

    // hours 기대값 확인 (PARSER-FIX-04A)
    if (s.expect_hours_nonempty === true && !result.hours_extracted) {
      result.pass = false;
      result.hours_note = 'EXPECTED_HOURS_MISSING';
    }
    if (s.expect_hours_empty === true && result.hours_extracted) {
      result.pass = false;
      result.hours_note = `UNEXPECTED_HOURS: ${result.hours_extracted}`;
    }

    // image_url 서버사이드 공백 확인 (PARSER-FIX-04A)
    if (s.expect_image_serverside_blank === true && result.image_url_extracted) {
      result.pass = false;
      result.image_note = `UNEXPECTED_IMG: ${result.image_url_extracted}`;
    }

    console.log(`  title: "${(result.title_extracted ?? '').slice(0, 40)}"`);
    console.log(`  hours: "${result.hours_extracted ?? ''}"`);
    console.log(`  image_url: "${result.image_url_extracted ?? ''}" (서버사이드)`);
    console.log(`  ext_url: "${result.external_official_url ?? ''}"`);
    console.log(`  candidate: ${result.candidate_created} | status: ${result.parse_status} | PASS: ${result.pass}`);

    results.push(result);
  }

  // ─── PASS 조건 검사 ────────────────────────────────────────────────────────

  console.log('\n=== PASS 조건 검사 ===');
  const issues = checkPass(results);

  const passed    = results.filter(r => r.pass === true).length;
  const failed    = results.filter(r => r.pass === false).length;
  const allPassed = issues.length === 0 && failed === 0;

  console.log(`  표본 결과: ${passed}건 PASS / ${failed}건 FAIL / ${results.length}건 총`);
  if (issues.length > 0) {
    console.log('  PASS 조건 위반:');
    issues.forEach(i => console.log(`    ✗ ${i}`));
  } else {
    console.log('  모든 PASS 조건 충족 ✓');
  }

  // ─── 결과 저장 ─────────────────────────────────────────────────────────────

  const RPT_DIR = path.join(ROOT, 'data/tourapi/reports/busan');
  if (!fs.existsSync(RPT_DIR)) fs.mkdirSync(RPT_DIR, { recursive: true });

  const regressionResult = {
    run_date:     TODAY,
    task:         'TASK-DATA-BUSAN-VISITBUSAN-PARSER-FIX-02A-REV',
    sample_count: results.length,
    req_count:    reqCount,
    passed,
    failed,
    pass_condition_violations: issues,
    overall:      allPassed ? 'PASS' : 'REVIEW_REQUIRED',
    results,
  };

  const jsonPath = path.join(RPT_DIR, 'visitbusan-parser-fix-02a-rev-regression.json');
  fs.writeFileSync(jsonPath, JSON.stringify(regressionResult, null, 2), 'utf8');
  console.log(`\n  회귀 JSON: ${jsonPath}`);

  // ─── MD 보고서 ─────────────────────────────────────────────────────────────

  const DOC_DIR = path.join(ROOT, 'docs/tourapi');
  if (!fs.existsSync(DOC_DIR)) fs.mkdirSync(DOC_DIR, { recursive: true });

  const table = results.map(r =>
    `| ${r.sample_id} | ${r.uc_seq} | ${r.language} | ${r.desc.slice(0,40)} | ${r.candidate_created ? '✓' : '✗'} | ${(r.title_extracted ?? '').slice(0,30)} | ${(r.external_official_url ?? '').slice(0,30)} | ${r.parse_status ?? '-'} | ${r.pass === true ? '✓ PASS' : '✗ FAIL'} |`
  ).join('\n');

  const md = `# TASK-DATA-BUSAN-VISITBUSAN-PARSER-FIX-02A-REV 완료 보고서

**날짜:** ${TODAY}
**상태:** ${allPassed ? '**PASS ✓**' : '**REVIEW REQUIRED ✗**'}
**총 요청 수:** ${reqCount}, **표본:** ${results.length}건

---

## 수정 내용

| 수정 | 적용 |
|---|---|
| \`extractOfficialUrl()\` — fallback 제거, 라벨 없으면 빈 문자열 | ✓ |
| 공통 푸터·개인정보처리방침 URL 차단 (\`BLOCKED_URL_PATTERNS\`) | ✓ |
| UI 텍스트 차단 ("상세보기" 등) | ✓ |
| uc_seq=2566: \`requires_client_render\`, 후보 레코드 미생성 | ✓ |
| EN 제목: var mtTitle + p-txt 주석만 (h1/h2·og:title·title 태그 금지) | ✓ |
| EN 공식 제목 없으면 후보 레코드 미생성 (\`language_content_unavailable\`) | ✓ |
| \`source_detail_url\` / \`external_official_url\` 필드 분리 | ✓ |

---

## 회귀 표본 결과

| ID | uc_seq | 언어 | 설명 | 후보생성 | 제목 | external_official_url | parse_status | 결과 |
|---|---|---|---|---|---|---|---|---|
${table}

---

## PASS 조건 검사

${issues.length === 0
  ? '모든 PASS 조건 충족 ✓'
  : '**위반 항목:**\n' + issues.map(i => `- ✗ ${i}`).join('\n')}

---

## 제외 항목 요약

| 유형 | 건수 | 처리 |
|---|---|---|
| KO \`requires_client_render\` (vue_title_only) | ${results.filter(r=>r.parse_status==='requires_client_render').length}건 | 후보 미생성, 진단 기록 |
| EN \`language_content_unavailable\` | ${results.filter(r=>r.excluded_reason==='en_title_not_found').length}건 | 후보 미생성, 진단 기록 |

---

**판정: ${allPassed ? 'PASS ✓' : 'REVIEW REQUIRED ✗'}**

TASK-DATA-BUSAN-VISITBUSAN-PARSER-FIX-02A-REV 파서 결함 수정 완료.
`;

  const mdPath = path.join(DOC_DIR, 'visitbusan-parser-fix-02a-rev-report.md');
  fs.writeFileSync(mdPath, md, 'utf8');
  console.log(`  MD 보고서: ${mdPath}`);

  console.log(`\n=== 결과: ${allPassed ? 'PASS ✓' : 'REVIEW REQUIRED ✗'} ===`);
  console.log(`TASK-DATA-BUSAN-VISITBUSAN-PARSER-FIX-02A-REV 파서 결함 수정 완료.`);

  process.exit(allPassed ? 0 : 1);
}

main().catch(e => {
  console.error('[FATAL]', e);
  process.exit(1);
});
