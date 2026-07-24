#!/usr/bin/env node
/**
 * TASK-DATA-BUSAN-VISITBUSAN-COLLECT
 * VisitBusan 웹 행사 연간 수집 (KO 2026년 1~12월)
 *
 * 파일럿(TASK-DATA-BUSAN-VISITBUSAN-PILOT) 검증 결과 기반:
 *   - 페이지네이션: GET startPage (POST 아님)
 *   - 비KO 언어: schedule 섹션 미번역 → KO만 수집
 *   - dataSid 기반 dedup + listed_months 추적
 *   - parse_failed = 0 보장 (schedule/view.do 링크만 수집)
 *   - FestivalService 연결 후보 생성
 *
 * 금지: DB/commit/push/본문 전문 저장/이미지 파일 저장
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.dirname(__dir);
const TODAY = new Date().toISOString().slice(0, 10);

// ── 설정 ──────────────────────────────────────────────────────────────────────
const BASE     = 'https://www.visitbusan.net';
const MENU_CD  = 'DOM_000000204012000000';
const BOARD_ID = 'BBS_0000009';
const YEAR     = '2026';
const MONTHS   = ['01','02','03','04','05','06','07','08','09','10','11','12'];
const DELAY_MS = 700;
const MAX_RETRY = 2;
const MAX_PAGES = 8;   // 월별 안전 상한

const OUT_DIR = path.join(ROOT, 'data/tourapi/candidates/busan');
const RPT_DIR = path.join(ROOT, 'data/tourapi/reports/busan');
const DOC_DIR = path.join(ROOT, 'docs/tourapi');

// FestivalService 원천 파일
const FESTIVAL_CSV = path.join(OUT_DIR, 'busan-festival-event-source.csv');

// ── 상태 ──────────────────────────────────────────────────────────────────────
let reqCount  = 0;
let cookieJar = '';

// ── 유틸 ──────────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function cleanHtml(s = '') {
  return s
    .replace(/<!--[\s\S]*?-->/g, '')  // HTML 주석 제거 (dataSid 오염 방지)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, '')
    .replace(/\s+/g,    ' ')
    .trim();
}

function csvCell(v) {
  const s = String(v ?? '').replace(/[\r\n]+/g, ' ').trim();
  return (s.includes(',') || s.includes('"')) ? `"${s.replace(/"/g, '""')}"` : s;
}
function csvRow(arr) { return arr.map(csvCell).join(','); }

// ── HTTP ──────────────────────────────────────────────────────────────────────
const UA = 'GoKoreaMate-Bot/1.0 (travel research; non-commercial)';

async function doGet(url) {
  reqCount++;
  if (reqCount <= 5 || reqCount % 10 === 0) {
    console.log(`  [#${reqCount}] GET ${url.replace(BASE, '')}`);
  }
  for (let i = 0; i <= MAX_RETRY; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent':      UA,
          'Accept':          'text/html,application/xhtml+xml',
          'Accept-Language': 'ko-KR,ko;q=0.9',
          'Referer':         BASE,
          ...(cookieJar ? { Cookie: cookieJar } : {}),
        },
        redirect: 'follow',
      });
      const sc = res.headers.get('set-cookie');
      if (sc) {
        const pairs = sc.split(/,(?=\s*\w+=)/g).map(c => c.split(';')[0].trim()).filter(Boolean);
        cookieJar = pairs.join('; ');
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (i === MAX_RETRY) throw e;
      await sleep(1000 * (i + 1));
    }
  }
}

// ── 목록 페이지 파싱 ──────────────────────────────────────────────────────────
// 수정: schedule/view.do 링크만 매칭 (footer/copyright 링크 완전 배제)
// 파일럿에서 dataSid=4138 = HTML 주석 내 board/download.do 링크 → 이 패턴으로 완전 차단
function parseListingPage(html) {
  const events = [];
  const seen   = new Set();
  // HTML 주석 먼저 제거
  const cleanedHtml = html.replace(/<!--[\s\S]*?-->/g, '');

  // schedule/view.do 경로만 매칭
  const aBlockRe = /<a\b[^>]*href=["'][^"']*schedule\/view\.do[^"']*dataSid=(\d+)[^"']*["'][^>]*>([\s\S]{0,1200}?)<\/a>/gi;
  let m;
  while ((m = aBlockRe.exec(cleanedHtml)) !== null) {
    const dataSid = m[1];
    if (seen.has(dataSid)) continue;
    seen.add(dataSid);
    const block = m[2];

    const titTag  = block.match(/<p[^>]*class=["']tit["'][^>]*>([\s\S]*?)<\/p>/i);
    const titAttr = m[0].match(/title=["']([^"']+?)\s*바로가기["']/i);
    const imgAlt  = block.match(/<img[^>]*alt=["']([^"']+)["']/i);
    const title   = cleanHtml(titTag?.[1] ?? titAttr?.[1] ?? imgAlt?.[1] ?? '') || null;

    const contTag  = block.match(/<p[^>]*class=["']cont["'][^>]*>([\s\S]*?)<\/p>/i);
    const contText = cleanHtml(contTag?.[1] ?? '');
    const isoDate  = contText.match(/(\d{4}-\d{2}-\d{2})/g);
    const anyDate  = isoDate ?? cleanHtml(block).match(/\d{4}[.\-]\d{1,2}[.\-]\d{1,2}/g);

    events.push({
      dataSid,
      title,
      date_raw:   contText || null,
      date_start: anyDate?.[0] ?? null,
      date_end:   anyDate?.[1] ?? null,
    });
  }
  return events;
}

function sameSidSet(a, b) {
  const sa = new Set(a.map(e => e.dataSid));
  const sb = new Set(b.map(e => e.dataSid));
  if (sa.size !== sb.size) return false;
  for (const s of sa) if (!sb.has(s)) return false;
  return true;
}

// ── 상세 페이지 파싱 ──────────────────────────────────────────────────────────
function extractDetailTitle(html) {
  const subDiv = html.match(/<div[^>]*class=["']tit_view_sub["'][^>]*>([\s\S]*?)<\/div>/i);
  if (subDiv) {
    const pTag = subDiv[1].match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    if (pTag) { const t = cleanHtml(pTag[1]); if (t?.length > 1) return t; }
  }
  const jsTitle = html.match(/var\s+mtTitle\s*=\s*["']([^"']+)["']/i);
  if (jsTitle?.[1]) return jsTitle[1].trim();
  return null;
}

function extractByLabel(html, label) {
  const re = new RegExp(
    `<div[^>]*class=["']name["'][^>]*>[\\s\\S]*?${label}[\\s\\S]*?<\\/div>[\\s\\S]{0,60}<div[^>]*class=["']detail["'][^>]*>([\\s\\S]{0,400}?)<\\/div>`,
    'i'
  );
  const m = html.match(re);
  return m ? cleanHtml(m[1]) : null;
}

function extractOfficialUrl(html) {
  const m = html.match(/<a\s+href=["'](https?:\/\/[^"']+)["'][^>]*>홈페이지<\/a>/i)
          || html.match(/<a\s+href=["'](https?:\/\/[^"']+)["'][^>]*>\s*홈페이지\s*<\/a>/i);
  return m ? m[1].replace(/&amp;/g, '&') : null;
}

function extractImageUrl(html) {
  const m = html.match(/src=["']((?:https?:\/\/[^"']+)?\/upload_data\/board_data\/[^"'\s>]+)["']/i);
  if (m?.[1]) {
    const url = m[1].replace(/&amp;/g, '&');
    return url.startsWith('http') ? url : `${BASE}${url}`;
  }
  return null;
}

function parseDetailPage(html, dataSid) {
  const title    = extractDetailTitle(html);
  const dateRaw  = extractByLabel(html, '일자') ?? extractByLabel(html, '기간');
  const venue    = extractByLabel(html, '장소');
  const address  = extractByLabel(html, '주소');
  const officialUrl = extractOfficialUrl(html);
  const imageUrl = extractImageUrl(html);

  const dates = (dateRaw ?? '').match(/\d{4}[.\-]\d{1,2}[.\-]\d{1,2}/g);
  const parseDate = (s) => {
    if (!s) return null;
    const parts = s.replace(/[.]/g, '-').split('-');
    if (parts.length !== 3) return null;
    const [y, m, d] = parts.map(Number);
    if (!y || !m || !d) return null;
    return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  };

  const parseFailed = !title || !dates?.[0];

  return {
    dataSid,
    title,
    date_raw:     dateRaw,
    date_start:   parseDate(dates?.[0]) ?? null,
    date_end:     parseDate(dates?.[1]) ?? null,
    venue,
    address,
    official_url: officialUrl,
    image_url:    imageUrl,
    parse_failed: parseFailed,
  };
}

// ── FestivalService 데이터 로드 ────────────────────────────────────────────────
function loadFestivalData() {
  if (!fs.existsSync(FESTIVAL_CSV)) return [];
  const lines = fs.readFileSync(FESTIVAL_CSV, 'utf8').split('\n');
  const header = lines[0].split(',');
  const idxKey  = header.indexOf('source_key');
  const idxId   = header.indexOf('source_id');
  const idxLang = header.indexOf('source_language');
  const idxTitle = header.indexOf('title');
  const idxUrl  = header.indexOf('official_url');
  const idxDom  = header.indexOf('official_url_domain');
  const idxPeriod = header.indexOf('event_period_raw');
  const idxVenue  = header.indexOf('venue');

  return lines.slice(1).filter(l => l.trim()).map(line => {
    const cols = parseCsvLine(line);
    return {
      source_key:   cols[idxKey],
      source_id:    cols[idxId],
      source_lang:  cols[idxLang],
      title:        cols[idxTitle],
      official_url: cols[idxUrl],
      official_url_domain: cols[idxDom],
      event_period_raw: cols[idxPeriod],
      venue:        cols[idxVenue],
    };
  });
}

// 간단 CSV 파서 (따옴표 처리 포함)
function parseCsvLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i+1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

// ── 제목 정규화 (FestivalService 연결용) ─────────────────────────────────────
function normTitle(s) {
  return (s ?? '')
    .replace(/\([^)]*\)/g, '')          // 괄호 내용 제거 (FestivalService 언어 suffix: "(한,영,중간,중번,일)")
    .replace(/\b\d{4}\b/g, '')          // 4자리 연도 제거 (서기 2026, 불기 2570 등)
    .replace(/제\d+회/g, '')            // 회차 표기 제거 ("제30회")
    .replace(/[^가-힣a-zA-Z0-9]/g, '') // 특수문자·공백 제거
    .toLowerCase();
}

// 바이그램 기반 Jaccard 유사도
function bigramJaccard(a, b) {
  if (!a || !b || a.length < 2 || b.length < 2) return 0;
  const bigrams = (s) => {
    const set = new Set();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const bA = bigrams(a);
  const bB = bigrams(b);
  const intersection = [...bA].filter(x => bB.has(x)).length;
  const union = new Set([...bA, ...bB]).size;
  return union === 0 ? 0 : intersection / union;
}

// ── FestivalService 연결 후보 생성 ────────────────────────────────────────────
function buildFestivalLinks(webEvents, festivalData) {
  // KO 레코드만 매칭 대상
  const koFestivals = festivalData.filter(f => f.source_lang === 'ko');
  const links = [];

  for (const evt of webEvents) {
    const normWeb = normTitle(evt.title);
    if (!normWeb || normWeb.length < 3) continue;

    const candidates = [];
    for (const fest of koFestivals) {
      const normFest = normTitle(fest.title);
      const sim = bigramJaccard(normWeb, normFest);
      if (sim >= 0.6) {
        candidates.push({ source_id: fest.source_id, festival_title: fest.title, similarity: sim });
      }
    }

    // URL 도메인 일치 추가 (more reliable)
    if (evt.official_url) {
      let webDomain = '';
      try { webDomain = new URL(evt.official_url).hostname; } catch {}
      for (const fest of koFestivals) {
        if (fest.official_url_domain && webDomain && webDomain === fest.official_url_domain) {
          const existing = candidates.find(c => c.source_id === fest.source_id);
          if (existing) existing.url_domain_match = true;
          else candidates.push({ source_id: fest.source_id, festival_title: fest.title, similarity: 1.0, url_domain_match: true });
        }
      }
    }

    if (candidates.length > 0) {
      const best = candidates.sort((a, b) => b.similarity - a.similarity)[0];

      // 신뢰도 결정:
      // - URL 도메인 일치 + 제목 유사도 >= 0.5 → high (명확한 동일 행사)
      // - URL 도메인 일치 + 제목 유사도 < 0.5 → medium (공통 포털 가능성, 검토 필요)
      // - 제목 유사도만 >= 0.8 → medium
      // - 제목 유사도만 0.6-0.8 → low
      const titleSim = bigramJaccard(normTitle(evt.title), normTitle(best.festival_title));
      let confidence;
      if (best.url_domain_match) {
        confidence = titleSim >= 0.5 ? 'high' : 'medium';
      } else {
        confidence = titleSim >= 0.8 ? 'medium' : 'low';
      }

      links.push({
        dataSid:          evt.dataSid,
        web_title:        evt.title,
        festival_source_id: best.source_id,
        festival_title:   best.festival_title,
        title_similarity: Math.round(titleSim * 1000) / 1000,
        url_domain_match: best.url_domain_match ?? false,
        match_confidence: confidence,
      });
    }
  }
  return links;
}

// ── visitbusan URL 생성 ────────────────────────────────────────────────────────
function visitBusanUrl(dataSid) {
  return `${BASE}/kr/schedule/view.do?boardId=${BOARD_ID}&menuCd=${MENU_CD}&dataSid=${dataSid}`;
}

// ── 메인 ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  TASK-DATA-BUSAN-VISITBUSAN-COLLECT                  ║');
  console.log(`╚══════════════════════════════════════════════════════╝`);
  console.log(`날짜: ${TODAY}  범위: KO ${YEAR}년 ${MONTHS[0]}~${MONTHS[MONTHS.length-1]}월\n`);

  [OUT_DIR, RPT_DIR, DOC_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

  // ── FestivalService 데이터 로드 ─────────────────────────────────────────────
  const festivalData = loadFestivalData();
  console.log(`FestivalService 레코드 로드: ${festivalData.length}건`);

  // ── 월별 목록 수집 ──────────────────────────────────────────────────────────
  console.log('\n[1] 월별 목록 수집 (schedule/list.do GET month= 필터)');

  // 쿠키 초기화 — index.do 한 번 요청으로 세션 취득
  await doGet(`${BASE}/kr/index.do?menuCd=${MENU_CD}`);
  await sleep(DELAY_MS);

  // dataSid → { listing info, listed_months: Set }
  const sidMap = new Map();
  const monthStats = [];

  for (const month of MONTHS) {
    // 실제 month 필터 URL: schedule/list.do?...&month=M&year=YYYY
    // (kr/index.do?...&schMonth=MM 은 서버에서 무시됨 — 파일럿 검증에서 확인)
    const p1Params = new URLSearchParams({
      boardId: BOARD_ID, menuCd: MENU_CD,
      startPage: '1', month: String(parseInt(month)), year: YEAR,
    });
    await sleep(DELAY_MS);
    const p1Html   = await doGet(`${BASE}/schedule/list.do?${p1Params}`);
    const page1    = parseListingPage(p1Html);

    let monthTotal = page1.length;
    let pages      = 1;
    let lastHtml   = p1Html;

    const seenInMonth = new Set(page1.map(e => e.dataSid));

    for (const e of page1) {
      if (!sidMap.has(e.dataSid)) sidMap.set(e.dataSid, { ...e, listed_months: new Set() });
      sidMap.get(e.dataSid).listed_months.add(month);
    }

    // 다음 페이지: lastHtml에서 fn_go_page(N) 탐지
    for (let pg = 2; pg <= MAX_PAGES; pg++) {
      const hasNext = new RegExp(`fn_go_page\\s*\\(\\s*${pg}\\s*\\)`).test(
        lastHtml.replace(/<!--[\s\S]*?-->/g, '')
      );
      if (!hasNext) break;

      await sleep(DELAY_MS);
      const pgParams = new URLSearchParams({
        boardId: BOARD_ID, menuCd: MENU_CD,
        startPage: String(pg), month: String(parseInt(month)), year: YEAR,
      });
      const pgHtml = await doGet(`${BASE}/schedule/list.do?${pgParams}`);
      const pgEvts = parseListingPage(pgHtml);
      const newEvts = pgEvts.filter(e => !seenInMonth.has(e.dataSid));

      if (pgEvts.length === 0 || newEvts.length === 0) break;

      for (const e of newEvts) {
        seenInMonth.add(e.dataSid);
        if (!sidMap.has(e.dataSid)) sidMap.set(e.dataSid, { ...e, listed_months: new Set() });
        sidMap.get(e.dataSid).listed_months.add(month);
      }
      monthTotal += newEvts.length;
      pages = pg;
      lastHtml = pgHtml;
    }

    console.log(`  ${YEAR}.${month}: ${monthTotal}건 (${pages}페이지) | 누적 고유: ${sidMap.size}개`);
    monthStats.push({ month, count: monthTotal, pages });
  }

  const allDataSids = [...sidMap.keys()];
  console.log(`\n  전체 목록 완료: 고유 dataSid ${allDataSids.length}개`);

  // ── 상세 수집 ────────────────────────────────────────────────────────────────
  console.log(`\n[2] KO 상세 수집 (${allDataSids.length}건)`);
  const details = {};
  let parseFailed = 0;
  let parseFailedList = [];

  for (const sid of allDataSids) {
    await sleep(DELAY_MS);
    const url  = `${BASE}/kr/schedule/view.do?boardId=${BOARD_ID}&menuCd=${MENU_CD}&dataSid=${sid}`;
    try {
      const html = await doGet(url);
      const d    = parseDetailPage(html, sid);
      details[sid] = d;
      if (d.parse_failed) {
        parseFailed++;
        parseFailedList.push({ dataSid: sid, title: d.title, date_start: d.date_start });
        console.warn(`  [PARSE_FAIL] ${sid}: title="${d.title ?? 'null'}" date="${d.date_start ?? 'null'}"`);
      }
    } catch (e) {
      parseFailed++;
      parseFailedList.push({ dataSid: sid, error: e.message });
      console.warn(`  [HTTP_FAIL] ${sid}: ${e.message}`);
    }
  }

  const parseSuccess = allDataSids.length - parseFailed;
  console.log(`\n  파싱 성공: ${parseSuccess}/${allDataSids.length} | parse_failed: ${parseFailed}`);

  if (parseFailed > 0) {
    console.warn(`  parse_failed 목록:`);
    parseFailedList.forEach(f => console.warn(`    ${JSON.stringify(f)}`));
  }

  // ── FestivalService 연결 후보 ─────────────────────────────────────────────
  console.log('\n[3] FestivalService 연결 후보 생성');
  const webEvents = allDataSids.map(sid => ({ dataSid: sid, ...details[sid] }));
  const festLinks = buildFestivalLinks(webEvents, festivalData);
  console.log(`  연결 후보: ${festLinks.length}건 (confidence: high=${festLinks.filter(f=>f.match_confidence==='high').length} medium=${festLinks.filter(f=>f.match_confidence==='medium').length} low=${festLinks.filter(f=>f.match_confidence==='low').length})`);

  // ── 여러 달 중복 분석 ────────────────────────────────────────────────────────
  const multiMonthEvents = allDataSids.filter(sid => {
    const entry = sidMap.get(sid);
    return entry && entry.listed_months.size > 1;
  });
  console.log(`\n[4] 여러 달 노출 행사: ${multiMonthEvents.length}건`);
  multiMonthEvents.slice(0, 5).forEach(sid => {
    const e = sidMap.get(sid);
    const d = details[sid];
    console.log(`  [${sid}] ${d?.title ?? e?.title}: 노출월 [${[...e.listed_months].join(',')}]`);
  });

  // ── 출력 파일 ────────────────────────────────────────────────────────────────
  console.log('\n[5] 출력 파일 생성');

  // 5-1. 행사 CSV
  const evtHdr = csvRow([
    'dataSid', 'title', 'date_start', 'date_end', 'venue', 'address',
    'official_url', 'visitbusan_url', 'image_url',
    'listed_months', 'multi_month',
    'parse_failed',
    'festival_link_source_id', 'festival_link_confidence',
  ]);

  const evtRows = allDataSids.map(sid => {
    const e    = sidMap.get(sid);
    const d    = details[sid] ?? {};
    const link = festLinks.find(f => f.dataSid === sid);
    const months = [...(e?.listed_months ?? [])].sort().join('|');
    return csvRow([
      sid,
      d.title ?? e?.title,
      d.date_start, d.date_end,
      d.venue, d.address,
      d.official_url,
      visitBusanUrl(sid),
      d.image_url,
      months,
      (e?.listed_months?.size ?? 0) > 1 ? 'true' : 'false',
      d.parse_failed ? 'true' : 'false',
      link?.festival_source_id ?? '',
      link?.match_confidence ?? '',
    ]);
  });

  const evtPath = path.join(OUT_DIR, 'busan-visitbusan-events.csv');
  fs.writeFileSync(evtPath, [evtHdr, ...evtRows].join('\n'), 'utf8');
  console.log(`  → ${path.relative(ROOT, evtPath)} (${evtRows.length}행)`);

  // 5-2. FestivalService 연결 CSV
  const linkHdr = csvRow(['dataSid','web_title','festival_source_id','festival_title','title_similarity','url_domain_match','match_confidence']);
  const linkRows = festLinks.map(f => csvRow([
    f.dataSid, f.web_title, f.festival_source_id, f.festival_title,
    f.title_similarity, f.url_domain_match, f.match_confidence,
  ]));
  const linkPath = path.join(OUT_DIR, 'busan-visitbusan-festival-links.csv');
  fs.writeFileSync(linkPath, [linkHdr, ...linkRows].join('\n'), 'utf8');
  console.log(`  → ${path.relative(ROOT, linkPath)} (${linkRows.length}행)`);

  // 5-3. 메트릭스
  const koFillRates = {
    total:        allDataSids.length,
    title:        Object.values(details).filter(d => d.title).length,
    date_start:   Object.values(details).filter(d => d.date_start).length,
    date_end:     Object.values(details).filter(d => d.date_end).length,
    venue:        Object.values(details).filter(d => d.venue).length,
    address:      Object.values(details).filter(d => d.address).length,
    official_url: Object.values(details).filter(d => d.official_url).length,
    image_url:    Object.values(details).filter(d => d.image_url).length,
    parse_failed: parseFailed,
  };

  const metrics = {
    run_date:     TODAY,
    task:         'TASK-DATA-BUSAN-VISITBUSAN-COLLECT',
    year:         YEAR,
    month_stats:  monthStats,
    total_unique_events: allDataSids.length,
    multi_month_count:  multiMonthEvents.length,
    fill_rates:   koFillRates,
    festival_links: {
      total:  festLinks.length,
      high:   festLinks.filter(f => f.match_confidence === 'high').length,
      medium: festLinks.filter(f => f.match_confidence === 'medium').length,
      low:    festLinks.filter(f => f.match_confidence === 'low').length,
    },
    parse_failed_list: parseFailedList,
    total_requests:    reqCount,
    generated_at:      new Date().toISOString(),
  };

  const metricsPath = path.join(RPT_DIR, 'busan-visitbusan-collect-metrics.json');
  fs.writeFileSync(metricsPath, JSON.stringify(metrics, null, 2), 'utf8');
  console.log(`  → ${path.relative(ROOT, metricsPath)}`);

  // ── 요약 ────────────────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  수집 요약                                            ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║  총 HTTP 요청       : ${String(reqCount).padEnd(5)}                        ║`);
  console.log(`║  고유 행사 수       : ${String(allDataSids.length).padEnd(5)}                        ║`);
  console.log(`║  여러 달 중복       : ${String(multiMonthEvents.length).padEnd(5)}                        ║`);
  console.log(`║  parse_failed       : ${String(parseFailed).padEnd(5)} (목표: 0)              ║`);
  console.log(`║  title 채움률       : ${koFillRates.title}/${koFillRates.total}                        ║`);
  console.log(`║  date_start 채움률  : ${koFillRates.date_start}/${koFillRates.total}                        ║`);
  console.log(`║  venue 채움률       : ${koFillRates.venue}/${koFillRates.total}                        ║`);
  console.log(`║  official_url 채움률: ${koFillRates.official_url}/${koFillRates.total}                        ║`);
  console.log(`║  FestivalService 연결: ${String(festLinks.length).padEnd(5)}건 (high:${metrics.festival_links.high})    ║`);
  console.log(`║  parse_failed = 0   : ${parseFailed === 0 ? 'PASS ✓' : 'FAIL ✗ — 상세 확인 필요'}       ║`);
  console.log('╚══════════════════════════════════════════════════════╝');

  return metrics;
}

main().catch(e => {
  console.error('\n[FATAL]', e.message);
  console.error(e.stack);
  process.exit(1);
});
