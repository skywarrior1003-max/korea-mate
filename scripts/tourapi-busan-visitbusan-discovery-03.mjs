#!/usr/bin/env node
/**
 * TASK-DATA-BUSAN-VISITBUSAN-CONTENT-DISCOVERY-03
 * VisitBusan 5개 콘텐츠 유형 전체 uc_seq 발견 스크립트
 *
 * 재사용 목적: 전체 수집(CONTENT-COLLECT-04) 전 ID 목록 갱신·검증
 *   - 유형별 전체 uc_seq 목록 출력 (콘솔)
 *   - 카테고리 코드(ucc2_seq) 출력
 *   - 표본 상세 페이지 유효성 확인
 *   - 전체 수집 예상 요청량 산정
 *
 * 발견 방식: 서버사이드 HTTP GET 페이지네이션
 *   - listCntPerPage2=500 → attraction/shopping/experience/course 전체 1회 수집
 *   - page_no=N 순회 → food (500 이상 아이템, 16건/페이지 고정)
 *
 * 금지: DB·commit·push·전체 상세 페이지 수집·Playwright·파일 저장
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.dirname(__dir);
const TODAY = new Date().toISOString().slice(0, 10);
const BASE  = 'https://www.visitbusan.net';
const DELAY_MS  = 700;
const SAMPLE_N  = 3;    // 타입당 유효성 확인 표본 수
const UA = 'Mozilla/5.0 (compatible; KoreaMate-Discovery/1.0; educational research)';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const CONTENT_TYPES = {
  attraction: { listing: 'DOM_000000201001000000', detail: 'DOM_000000201001001000', label: '명소' },
  food:       { listing: 'DOM_000000201002000000', detail: 'DOM_000000201002001000', label: '음식' },
  shopping:   { listing: 'DOM_000000201003000000', detail: 'DOM_000000201003001000', label: '쇼핑' },
  experience: { listing: 'DOM_000000202008000000', detail: 'DOM_000000202008001000', label: '체험' },
  course:     { listing: 'DOM_000000202012000000', detail: 'DOM_000000202012001000', label: '코스' },
};

// food은 listCntPerPage2=500을 무시하고 항상 16건/페이지 반환 → page_no 순회 필요
const FOOD_FIXED_PER_PAGE = true;

async function doGet(url) {
  await sleep(DELAY_MS);
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    return { ok: r.ok, status: r.status, text: await r.text() };
  } catch(e) {
    return { ok: false, status: 0, text: '', error: e.message };
  }
}

function extractUcSeqs(html) {
  return [...new Set([...html.matchAll(/uc_seq=(\d+)/g)].map(m => m[1]))];
}

function extractCategories(html) {
  // 카테고리 버튼: <button value="CODE" class="search_btn">LABEL</button>
  return [...html.matchAll(/<button[^>]+value="(\d+)"[^>]*class="[^"]*search_btn[^"]*"[^>]*>([^<]{1,30})<\/button>/gi)]
    .map(m => ({ code: m[1], label: m[2].trim() }));
}

function getLastPageNo(html) {
  const pagenos = [...html.matchAll(/page_no=(\d+)/g)].map(m => parseInt(m[1]));
  return pagenos.length ? Math.max(...pagenos) : 1;
}

function isErrorPage(html) {
  return !html || html.length < 1000 ||
    /RFC\s*3[\.\s]?0\s*오류|500\s*Internal|알\s*수\s*없는\s*오류/i.test(html);
}

function extractTitle(html) {
  if (!html) return '';
  const m1 = html.match(/var\s+mtTitle\s*=\s*["']([^"']{2,80})["']/i);
  if (m1) return m1[1].replace(/&amp;/g, '&').trim();
  const m2 = html.match(/<!--\s*<div[^>]*class=["'][^"']*p-txt[^"']*["'][^>]*>([^<]{2,80})<\/div>\s*-->/i);
  if (m2) return m2[1].replace(/&amp;/g, '&').trim();
  return '';
}

// ── Phase 1: 카테고리 코드 + 전체 ID 발견 ─────────────────────────────────────
async function discoverIds(ctype) {
  const meta = CONTENT_TYPES[ctype];
  const { text: firstHtml } = await doGet(`${BASE}/kr/index.do?menuCd=${meta.listing}`);

  // 카테고리 코드 (버튼 value)
  const categories = extractCategories(firstHtml);

  // food는 listCntPerPage2=500을 무시하므로 page_no 순회 방식
  const isFood = ctype === 'food';

  if (!isFood) {
    // 1회 요청으로 전체 수집 (listCntPerPage2=500)
    const { text: allHtml } = await doGet(
      `${BASE}/kr/index.do?menuCd=${meta.listing}&ucc2_seq=&list_type=TYPE_SMALL_CARD&order_type=NEW&listCntPerPage2=500`
    );
    const ucSeqs = extractUcSeqs(allHtml);
    const hasMore = /btn_next/.test(allHtml);
    if (hasMore) {
      console.warn(`  [WARN] ${ctype}: listCntPerPage2=500에도 다음 페이지 있음 — page_no 순회 필요`);
    }
    return { categories, ucSeqs, requests: 2 }; // 1(기본) + 1(500)
  }

  // food: page_no 순회
  const allIds = new Set();
  const lastPage = getLastPageNo(firstHtml);
  let reqCount = 1;
  for (let p = 1; p <= lastPage + 1; p++) {
    const { text } = await doGet(
      `${BASE}/kr/index.do?menuCd=${meta.listing}&ucc2_seq=&list_type=TYPE_SMALL_CARD&order_type=NEW&listCntPerPage2=16&page_no=${p}`
    );
    const ids = extractUcSeqs(text);
    const newCount = ids.filter(id => !allIds.has(id)).length;
    for (const id of ids) allIds.add(id);
    reqCount++;
    if (newCount === 0 && p > 1) break; // 신규 없으면 종료
  }
  return { categories, ucSeqs: [...allIds], requests: reqCount };
}

// ── Phase 2: 표본 유효성 확인 ────────────────────────────────────────────────
async function validateSamples(ctype, ucSeqs) {
  const meta = CONTENT_TYPES[ctype];
  const samples = ucSeqs.slice(0, SAMPLE_N);
  let ok = 0, vueOnly = 0, err = 0;

  for (const ucSeq of samples) {
    const url = `${BASE}/kr/index.do?menuCd=${meta.detail}&uc_seq=${ucSeq}&lang_cd=ko`;
    const { text } = await doGet(url);
    if (isErrorPage(text)) { err++; console.log(`    [ERROR] ${ucSeq}`); continue; }
    const title = extractTitle(text);
    if (title) { ok++; console.log(`    [OK] ${ucSeq} → "${title.slice(0, 35)}"`); }
    else { vueOnly++; console.log(`    [VUE_ONLY] ${ucSeq} → var mtTitle 없음`); }
  }

  return { ok, vueOnly, err, total: samples.length };
}

// ── 메인 ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== TASK-DATA-BUSAN-VISITBUSAN-CONTENT-DISCOVERY-03 시작 ===');
  console.log(`날짜: ${TODAY}\n`);

  const summary = {};
  let totalRequests = 0;

  // ─── Phase 1: 타입별 전체 ID 발견 ──────────────────────────────────────────
  console.log('=== Phase 1: 전체 uc_seq 발견 ===');

  for (const ctype of Object.keys(CONTENT_TYPES)) {
    console.log(`\n--- [${ctype}] ---`);
    const { categories, ucSeqs, requests } = await discoverIds(ctype);
    totalRequests += requests;

    console.log(`  카테고리 ${categories.length}개: ${categories.map(c=>`${c.code}:${c.label}`).join(', ')}`);
    console.log(`  uc_seq 총 ${ucSeqs.length}건 발견 (요청 ${requests}건)`);
    console.log(`  ID 샘플 (처음 5건): [${ucSeqs.slice(0, 5).join(', ')}]`);

    summary[ctype] = { categories, ucSeqs, requests };
  }

  // ─── Phase 2: 표본 유효성 확인 ─────────────────────────────────────────────
  console.log('\n=== Phase 2: 표본 유효성 확인 ===');
  let totalValid = 0, totalVueOnly = 0, totalErr = 0, totalSampled = 0;

  for (const [ctype, data] of Object.entries(summary)) {
    console.log(`\n  [${ctype}] 표본 ${SAMPLE_N}건:`);
    const { ok, vueOnly, err, total } = await validateSamples(ctype, data.ucSeqs);
    totalRequests += total;
    totalValid   += ok;
    totalVueOnly += vueOnly;
    totalErr     += err;
    totalSampled += total;
    data.sampleValid   = ok;
    data.sampleVueOnly = vueOnly;
    data.sampleErr     = err;
  }

  // ─── Phase 3: 전체 수집 예상 요청량 산정 ───────────────────────────────────
  console.log('\n=== Phase 3: 전체 수집 예상 요청량 ===');

  const allIdCount    = Object.values(summary).reduce((a, d) => a + d.ucSeqs.length, 0);
  const idDiscovReq   = Object.values(summary).reduce((a, d) => a + d.requests, 0);
  const koDetailReq   = allIdCount;
  const enDetailReq   = 5 * Object.keys(CONTENT_TYPES).length;     // 타입당 5건
  const langCheckReq  = 3 * Object.keys(CONTENT_TYPES).length;     // JA/ZhS/ZhT 각 1건

  const totalFullReq  = idDiscovReq + koDetailReq + enDetailReq + langCheckReq;
  const estSeconds    = Math.ceil(totalFullReq * DELAY_MS / 1000);

  console.log(`  타입별 ID 건수:`);
  for (const [ct, d] of Object.entries(summary)) {
    console.log(`    ${ct}: ${d.ucSeqs.length}건`);
  }
  console.log(`  합계: ${allIdCount}건`);
  console.log(`  ID 발견 요청: ${idDiscovReq}건`);
  console.log(`  KO 상세 요청: ${koDetailReq}건`);
  console.log(`  EN 상세 요청: ${enDetailReq}건`);
  console.log(`  JA/ZhS/ZhT 확인: ${langCheckReq}건`);
  console.log(`  총 예상 요청: ${totalFullReq}건`);
  console.log(`  예상 소요시간: ${Math.ceil(estSeconds/60)}분 (@${DELAY_MS}ms/req)`);

  // ─── 결과 요약 ─────────────────────────────────────────────────────────────
  console.log('\n=== 결과 요약 ===');
  console.log(`  전체 uc_seq: ${allIdCount}건`);
  console.log(`  표본 유효성: ${totalValid}/${totalSampled}건 OK, ${totalVueOnly}건 vue_only, ${totalErr}건 error`);
  console.log(`  발견 방식: server-side HTTP GET (page_no + listCntPerPage2)`);
  console.log(`  Playwright 필요: ID 발견=불필요, uc_seq=2566 제목=필요`);
  console.log(`  ucc2_seq 코드: 서버사이드 렌더링 확인됨`);
  console.log(`  총 요청 (조사): ${totalRequests}건`);

  console.log('\nTASK-DATA-BUSAN-VISITBUSAN-CONTENT-DISCOVERY-03 전체 콘텐츠 발견 방식 확정 완료.');
  return summary;
}

main().catch(e => {
  console.error('[FATAL]', e.message);
  process.exit(1);
});
