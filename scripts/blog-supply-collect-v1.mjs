// Blog 공식 원천 공급층 v1 (TASK-GOKOREAMATE-BLOG-OFFICIAL-SOURCE-SUPPLY-V1)
//
// 무엇을 하나
//   Blog 후보(candidate)를 공식 원천에서 수집해 data/blog-supply/ 에 정규화한다.
//   ① 본체: KTO TourAPI (KorService2/EngService2 — 승인 인벤토리의 서비스만)
//      - 여행코스(ko, contentTypeId 25): 전국 여행 아이디어의 최대 공급원 (실측 1,069건)
//      - 축제행사(ko 15 / en 85, searchFestival2): 전국·교차지역 소재 후보 (REVIEW 분류)
//   ② 보조: VisitKorea(영문) Travel News 공식 목록 — 외국인 대상 프로그램·캠페인·
//      전국 캠페인. RSS/공개 API 부재를 확인했으므로(302/404 실측) 공식 목록 페이지
//      1곳을 브라우저로 읽는 최소 수집이다. 목록 메타(제목/날짜/공식 상세 URL)만
//      가져오고 본문 장문 복제는 하지 않는다.
//
// 무엇을 하지 않나
//   · 자동 게시 없음 — 이 스크립트는 후보를 만들 뿐, Blog(BLOG_POSTS)는 사람이
//     별도 작업에서 계약 적합성을 보고 4-locale 로 집필해 게시한다.
//   · Travel Essentials/지역 Events 정본을 건드리지 않는다. 실용정보·단순 행사
//     복제 후보는 blog_fit 로 걸러 표시만 한다.
//   · DB 쓰기 0 · commit/push 없음 · secret 출력 없음.
//
// 호출 예산 (승인 인벤토리의 미검증 상한 존중 — data/tourapi/config/kto-detail-call-limit.json)
//   KTO 호출은 실행당 최대 4회(목록 1페이지×4소스)로 고정한다. 상세 호출 없음.
//
// refresh 구조 (§7 — cadence 는 Owner 미확정, 임의 고정하지 않는다)
//   실행할 때마다 이전 candidates 와 source_key 로 대조해
//   NEW / CHANGED(title·date) / GONE(이번 수집에 없음 — 종료·만료·URL 변경 후보) 를
//   data/blog-supply/blog-supply-diff-<date>.json 에 남긴다.
//
//   ③ 보조: KTO 보도자료(knto.or.kr/pressRelease) — "여행자 가치 사실 탐지 레이더"
//      (BLOG-KTO-PRESS-RELEASE-SUPPLY-V1). 외국인 방한 프로그램·국가/언어권 캠페인·
//      지방공항 연계·교차지역·바우처 유형을 탐지한다. **제목과 구조화 메타만**
//      저장한다 — 본문을 아예 수집하지 않으므로 원문 문장 복제가 구조적으로
//      불가능하다. 게시는 GoKoreaMate 가 여행자 관점으로 완전히 새로 쓴다.
//      상세 페이지의 공공누리(KOGL) 마커를 확인해 kogl_type 으로 기록하고,
//      이미지는 수집하지 않으며 image_rights_status 로 자동 사용을 차단한다.
//
// usage: node scripts/blog-supply-collect-v1.mjs [--source kto|news|press|all] [--dry-run]

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { createRequire } from "node:module";

const require2 = createRequire(import.meta.url);

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const OUT_DIR = path.join(ROOT, "data", "blog-supply");
const CANDIDATES = path.join(OUT_DIR, "blog-supply-candidates-v1.jsonl");
const MANIFEST = path.join(OUT_DIR, "blog-supply-manifest-v1.json");

const argSource = (process.argv.find(a => a.startsWith("--source")) ?? "--source=all").split("=")[1] ?? "all";
const DRY = process.argv.includes("--dry-run");

// ── env ──────────────────────────────────────────────────────────────────────
const env = Object.fromEntries(
  readFileSync(path.join(ROOT, ".env.local"), "utf8")
    .split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }),
);
const KEY = env.TOUR_API_KEY;
if (!KEY) { console.error("TOUR_API_KEY missing"); process.exit(2); }

const COLLECTED_AT = new Date().toISOString();
const AS_OF = COLLECTED_AT.slice(0, 10);
const CALL_INTERVAL_MS = 500;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sha256 = s => createHash("sha256").update(s).digest("hex");

function atomicWrite(file, content) {
  const tmp = file + ".tmp";
  writeFileSync(tmp, content);
  renameSync(tmp, file);
}

// ── blog_fit 분류 (§2 계약) ──────────────────────────────────────────────────
// FIT: 전국 여행 아이디어/코스/테마 — Blog 소재로 바로 검토 가능
// REVIEW: 행사·캠페인 — 전국/교차지역·외국인 대상 성격일 때만 Blog 소재.
//         지역 Event DB 단순 복사 금지 계약이 있어 사람이 판정한다.
// UNFIT_PRACTICAL: 규정·요금·운영 등 실용정보 — Travel Essentials 정본 영역
const PRACTICAL_RE = /regulation|visa|fare|price|refund|tax|sim|wifi|transport pass|operating hours|규정|요금|환불|운영시간/i;
const EVENTY_RE = /winner announcement|quiz|giveaway|당첨/i;

function classifyNews(title) {
  if (PRACTICAL_RE.test(title)) return { fit: "UNFIT_PRACTICAL", reason: "실용정보 성격 — Essentials 정본 영역" };
  if (EVENTY_RE.test(title)) return { fit: "REVIEW", reason: "이벤트/경품 공지 — 시효성·홍보성 검토 필요" };
  return { fit: "REVIEW", reason: "외국인 대상 프로그램/캠페인 — 전국·교차지역 여부와 시효 검토" };
}

// ── ① KTO TourAPI ────────────────────────────────────────────────────────────
let ktoCalls = 0;
async function kto(service, op, params) {
  ktoCalls += 1;
  const q = new URLSearchParams({
    serviceKey: KEY, MobileOS: "ETC", MobileApp: "GoKoreaMate", _type: "json",
    numOfRows: "100", pageNo: "1", ...params,
  });
  const url = `https://apis.data.go.kr/B551011/${service}/${op}?${q}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
  const j = JSON.parse(await r.text());
  const h = j?.response?.header;
  if (h?.resultCode !== "0000") throw new Error(`${service}/${op} resultCode=${h?.resultCode}`);
  const items = j?.response?.body?.items?.item ?? [];
  return { total: j?.response?.body?.totalCount ?? 0, items: Array.isArray(items) ? items : [items] };
}

const AREA_NAME = { 1: "seoul", 2: "incheon", 3: "daejeon", 4: "daegu", 5: "gwangju", 6: "busan", 7: "ulsan", 8: "sejong", 31: "gyeonggi", 32: "gangwon", 33: "chungbuk", 34: "chungnam", 35: "gyeongbuk", 36: "gyeongnam", 37: "jeonbuk", 38: "jeonnam", 39: "jeju" };

function ktoCandidate(item, service, lang, theme, fit, fitReason) {
  return {
    candidate_id: `kto-${service}-${item.contentid}-${lang}`,
    source_provider: "kto",
    source_service: `${service}`,
    source_key: `${service}:${item.contentid}:${lang}`,
    source_language: lang,
    title: item.title ?? "",
    summary: null, // 목록 수준 수집 — 원문 장문 복제 금지. 상세는 게시 검토 단계에서.
    official_url: null, // TourAPI 데이터 자체가 공식 원천 — provider/service 가 출처다
    region: AREA_NAME[Number(item.areacode)] ?? (item.areacode ? String(item.areacode) : null),
    theme,
    content_type_id: item.contenttypeid ?? null,
    source_modified: item.modifiedtime ?? null,
    event_start: item.eventstartdate ?? null,
    event_end: item.eventenddate ?? null,
    collected_at: COLLECTED_AT,
    status: "ACTIVE",
    blog_fit: fit,
    fit_reason: fitReason,
  };
}

async function collectKto() {
  const out = [];
  // 전국 여행코스(ko) — 최신 수정순 1페이지
  const course = await kto("KorService2", "areaBasedList2", { contentTypeId: "25", arrange: "Q" });
  for (const it of course.items) out.push(ktoCandidate(it, "KorService2", "ko", "travel_course", "FIT", "전국 여행코스 — Blog 여행 아이디어 소재"));
  await sleep(CALL_INTERVAL_MS);
  // 다가오는 축제(ko/en) — Events 정본과 구분 위해 REVIEW
  const today = AS_OF.replace(/-/g, "");
  const festKo = await kto("KorService2", "searchFestival2", { eventStartDate: today, arrange: "Q" });
  for (const it of festKo.items) out.push(ktoCandidate(it, "KorService2", "ko", "festival", "REVIEW", "행사 — 전국/교차지역·테마 맥락일 때만 Blog 소재(단순 복사 금지)"));
  await sleep(CALL_INTERVAL_MS);
  const festEn = await kto("EngService2", "searchFestival2", { eventStartDate: today, arrange: "Q" });
  for (const it of festEn.items) out.push(ktoCandidate(it, "EngService2", "en", "festival", "REVIEW", "행사(영문) — 외국인 대상 표현 확보용·단순 복사 금지"));
  return { candidates: out, totals: { course_ko: course.total, festival_ko: festKo.total, festival_en: festEn.total } };
}

// ── ② VisitKorea Travel News (영문 공식 목록 1페이지) ────────────────────────
async function collectNews() {
  const { chromium } = require2(path.join(ROOT, "node_modules", "playwright"));
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" })).newPage();
  const LIST_URL = "https://english.visitkorea.or.kr/svc/planYourTravel/travelNews/travelNewsList.do?menuSn=177";
  await page.goto(LIST_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(6000);
  const rows = await page.evaluate(() => {
    // 목록 카드: a[href="javascript:fn_goContentsViewHelper(<vcontsId>)"] — 실측 구조
    const out = [];
    const seen = new Set();
    for (const a of document.querySelectorAll('a[href*="fn_goContentsViewHelper"]')) {
      const m = (a.getAttribute("href") ?? "").match(/fn_goContentsViewHelper\((\d{5,9})\)/);
      if (!m || seen.has(m[1])) continue;
      const text = (a.textContent ?? "").replace(/\s+/g, " ").trim();
      const dm = text.match(/(\d{2}\/\d{2}\/\d{4})/);
      const title = text.replace(/My Bookmarks/g, "").replace(/(\d{2}\/\d{2}\/\d{4}).*$/, "").trim();
      if (title.length < 8) continue;
      seen.add(m[1]);
      out.push({ id: m[1], title: title.slice(0, 160), date: dm ? dm[1] : null });
    }
    return out;
  });
  await browser.close();
  const toIso = d => { if (!d) return null; const [mm, dd, yy] = d.split("/"); return `${yy}-${mm}-${dd}`; };
  return rows.map(rw => {
    const cls = classifyNews(rw.title);
    return {
      candidate_id: `visitkorea-news-${rw.id}`,
      source_provider: "visitkorea",
      source_service: "travelNewsList(en)",
      source_key: `visitkorea-news:${rw.id}:en`,
      source_language: "en",
      title: rw.title,
      summary: null,
      official_url: `https://english.visitkorea.or.kr/svc/contents/contentsView.do?menuSn=177&vcontsId=${rw.id}`,
      region: null,
      theme: "news_program_campaign",
      content_type_id: null,
      source_modified: toIso(rw.date),
      event_start: null,
      event_end: null,
      collected_at: COLLECTED_AT,
      status: "ACTIVE",
      blog_fit: cls.fit,
      fit_reason: cls.reason,
    };
  });
}

// ── ③ KTO 보도자료 (knto.or.kr — 서버렌더 HTML, 브라우저 불필요) ─────────────
//
// 여행자 관련성 분류 — §1 계약:
//   FIT: 외국인/방한/국가·언어권 캠페인·지방공항·바우처 등 여행자가 실제 참여
//        가능한 유형(교차지역 관광 캠페인 포함)
//   UNFIT_INSTITUTIONAL: 인사·협약·세미나·산업정책 등 기관 소식
//   REVIEW: 그 외 — 사람이 여행자 가치 판정
const PRESS_FIT_RE = /방한|외국인|외래\s?관광|인바운드|관광객\s?유치|캠페인|프로모션|바우처|할인권|지방\s?공항|공항\s?노선|전세기|크루즈|무비자|비자\s?완화|중화권|일본인|대만|홍콩|동남아|무슬림|K-?컬처|한류|체험\s?프로그램|여행\s?프로그램|워케이션|템플스테이/;
const PRESS_INSTITUTIONAL_RE = /인사|임명|취임|이사장|사장\s?후보|업무협약|MOU|협약\s?체결|세미나|포럼|공청회|간담회|채용|입찰|공모(?!전)|윤리|ESG|감사|조직\s?개편|경영\s?평가|이사회|노사/;

function classifyPress(title) {
  if (PRESS_INSTITUTIONAL_RE.test(title)) return { fit: "UNFIT_INSTITUTIONAL", reason: "기관 소식/산업정책 — 여행자 직접 관련 없음" };
  if (PRACTICAL_RE.test(title)) return { fit: "UNFIT_PRACTICAL", reason: "실용정보 성격 — Essentials 정본 영역" };
  if (PRESS_FIT_RE.test(title)) return { fit: "FIT", reason: "외국인/전국/교차지역 여행자 프로그램·캠페인 후보 — 사실 추출 후 독립 작성" };
  return { fit: "REVIEW", reason: "여행자 가치 판정 필요 — 원문 복제 금지, 사실만 추출" };
}

const PRESS_BASE = "https://knto.or.kr";
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" };

function parsePressList(html) {
  // 행: <a href="/pressRelease/<id>?...">제목</a> … 날짜(YYYY-MM-DD)
  const rows = [];
  const seen = new Set();
  const re = /<a\s+href="\/pressRelease\/(\d+)[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const id = m[1];
    if (seen.has(id)) continue;
    const title = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (title.length < 6) continue;
    // 링크 뒤쪽 500자 안의 첫 날짜를 그 행의 게시일로 본다
    const tail = html.slice(m.index, m.index + 800);
    const dm = tail.match(/20\d{2}-\d{2}-\d{2}/);
    seen.add(id);
    rows.push({ id, title: title.slice(0, 180), date: dm ? dm[0] : null });
  }
  return rows;
}

/** 상세 페이지에서 공공누리 유형만 확인한다. 본문은 저장하지 않는다. */
async function pressKogl(id) {
  try {
    const r = await fetch(`${PRESS_BASE}/pressRelease/${id}`, { headers: UA, signal: AbortSignal.timeout(20000) });
    const t = await r.text();
    const m = t.match(/kogl\.or\.kr\/info\/licenseType(\d)\.do|공공누리\s*제?\s*(\d)\s*유형|공공누리:출처표시/);
    if (!m) return null;
    const n = m[1] ?? m[2] ?? "1";
    return `KOGL_TYPE${n}`;
  } catch { return null; }
}

async function collectPress() {
  const out = [];
  for (const pageNo of [1, 2]) {
    const r = await fetch(`${PRESS_BASE}/pressRelease?curPage=${pageNo}`, { headers: UA, signal: AbortSignal.timeout(25000) });
    const rows = parsePressList(await r.text());
    for (const rw of rows) {
      const cls = classifyPress(rw.title);
      out.push({
        candidate_id: `kto-press-${rw.id}`,
        source_provider: "kto-press",
        source_service: "knto.or.kr/pressRelease",
        source_key: `kto-press:${rw.id}:ko`,
        source_language: "ko",
        title: rw.title,
        source_title: rw.title,
        summary: null, // 본문 미수집 — 원문 복제 구조적 차단
        official_url: `${PRESS_BASE}/pressRelease/${rw.id}`,
        source_date: rw.date,
        region: null,
        theme: "press_release",
        content_type_id: null,
        source_modified: rw.date,
        event_start: null,
        event_end: null,
        collected_at: COLLECTED_AT,
        status: "ACTIVE",
        blog_fit: cls.fit,
        fit_reason: cls.reason,
        kogl_type: null,               // FIT/REVIEW 만 상세에서 확인해 채운다
        image_rights_status: "NOT_VERIFIED_DO_NOT_AUTOUSE", // 사진은 글과 별개 권리 — 자동 사용 금지
      });
    }
    await sleep(1000);
  }
  // 권리 메타: 여행자 후보(FIT/REVIEW)만 상세 1회씩 확인 (politeness 1s)
  let detailFetches = 0;
  for (const c of out) {
    if (c.blog_fit !== "FIT" && c.blog_fit !== "REVIEW") continue;
    if (detailFetches >= 12) break;
    c.kogl_type = await pressKogl(c.candidate_id.replace("kto-press-", ""));
    detailFetches += 1;
    await sleep(1000);
  }
  return out;
}

// ── diff (refresh 구조) ──────────────────────────────────────────────────────
function loadPrevious() {
  if (!existsSync(CANDIDATES)) return new Map();
  const map = new Map();
  for (const line of readFileSync(CANDIDATES, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const c = JSON.parse(line);
    map.set(c.source_key, c);
  }
  return map;
}

// ── main ─────────────────────────────────────────────────────────────────────
(async () => {
  mkdirSync(OUT_DIR, { recursive: true });
  const prev = loadPrevious();
  const collected = [];
  const totals = {};

  if (argSource === "kto" || argSource === "all") {
    const k = await collectKto();
    collected.push(...k.candidates);
    Object.assign(totals, k.totals);
  }
  if (argSource === "news" || argSource === "all") {
    const n = await collectNews();
    collected.push(...n);
    totals.news_en = n.length;
  }
  if (argSource === "press" || argSource === "all") {
    const pr = await collectPress();
    collected.push(...pr);
    totals.press_ko = pr.length;
  }

  // 같은 실행 내 dedup
  const byKey = new Map();
  for (const c of collected) if (!byKey.has(c.source_key)) byKey.set(c.source_key, c);
  const fresh = [...byKey.values()];

  // 이전 대비 diff — 이번 소스만 수집했을 때 다른 소스가 GONE 으로 오인되지 않게
  // provider 별로 비교한다.
  const providersRun = new Set(fresh.map(c => c.source_provider));
  const diff = { new: [], changed: [], gone: [] };
  for (const c of fresh) {
    const p = prev.get(c.source_key);
    if (!p) diff.new.push(c.source_key);
    else if (p.title !== c.title || p.source_modified !== c.source_modified) diff.changed.push(c.source_key);
  }
  for (const [key, p] of prev) {
    if (providersRun.has(p.source_provider) && !byKey.has(key)) diff.gone.push(key);
  }

  // 이번에 안 돈 provider 의 기존 후보는 보존
  const kept = [...prev.values()].filter(p => !providersRun.has(p.source_provider));
  const finalList = [...kept, ...fresh];

  const fitCounts = {};
  for (const c of finalList) fitCounts[c.blog_fit] = (fitCounts[c.blog_fit] ?? 0) + 1;

  const jsonl = finalList.map(c => JSON.stringify(c)).join("\n") + "\n";
  const manifest = {
    task: "TASK-GOKOREAMATE-BLOG-OFFICIAL-SOURCE-SUPPLY-V1",
    schema_version: 1,
    as_of: AS_OF,
    generated_at: COLLECTED_AT,
    sources_run: [...providersRun],
    kto_calls_this_run: ktoCalls,
    source_totals_reported: totals,
    candidates: finalList.length,
    fit_counts: fitCounts,
    diff_counts: { new: diff.new.length, changed: diff.changed.length, gone: diff.gone.length },
    candidates_sha256: sha256(jsonl),
    refresh_cadence: "OWNER_DECISION_PENDING", // §7 — 임의로 7일 고정하지 않는다
    notes: [
      "자동 게시 없음 — Blog 게시는 별도 큐레이션 작업에서 4-locale 로 집필한다",
      "KTO Jpn/Chs 서비스는 403(별도 data.go.kr 활용신청 필요) — ko/en 만 수집",
      "festival 후보는 지역 Events 정본과 구분: 단순 복사 금지, REVIEW 분류",
    ],
  };

  if (DRY) {
    console.log("[dry-run]", JSON.stringify({ candidates: fresh.length, totals, diff: manifest.diff_counts }));
    return;
  }
  atomicWrite(CANDIDATES, jsonl);
  atomicWrite(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  atomicWrite(path.join(OUT_DIR, `blog-supply-diff-${AS_OF}.json`), JSON.stringify(diff, null, 2) + "\n");
  console.log(JSON.stringify({ ok: true, candidates: finalList.length, fresh: fresh.length, ktoCalls, fit: fitCounts, diff: manifest.diff_counts }));
})().catch(e => { console.error("FAIL", e.message); process.exit(1); });
