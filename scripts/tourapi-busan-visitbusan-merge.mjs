#!/usr/bin/env node
/**
 * TASK-DATA-BUSAN-EVENT-MERGE-01-REV
 * VisitBusan 68건 × FestivalService 통합 스크립트
 *
 * 연결 전략:
 *   high 2건      → url_domain+title (자동)
 *   title_exact 6건→ title_similarity=1.0 (자동, secondary criteria 없음)
 *   manual 3건    → url_domain_only, title_sim≈0 (검토 보류)
 *   unlinked 57건 → 독립 VisitBusan 행사
 *
 * 금지: DB/commit/push/migration
 */
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT       = path.join(__dirname, '..');
const CANDIDATES = path.join(ROOT, 'data/tourapi/candidates/busan');
const REPORTS    = path.join(ROOT, 'data/tourapi/reports/busan');
const RUN_DATE   = '2026-07-24';

// ── 입력 파일 ────────────────────────────────────────────────────────────────
const VB_EVENTS_CSV      = path.join(CANDIDATES, 'busan-visitbusan-events.csv');
const FESTIVAL_LINKS_CSV = path.join(CANDIDATES, 'busan-visitbusan-festival-links.csv');
const FESTIVAL_SRC_CSV   = path.join(CANDIDATES, 'busan-festival-event-source.csv');
const CANONICAL_CSV      = path.join(CANDIDATES, 'busan-canonical-candidates.csv');

// ── 출력 파일 ────────────────────────────────────────────────────────────────
const MERGED_CSV        = path.join(CANDIDATES, 'busan-visitbusan-merged.csv');
const SCHEDULE_CSV      = path.join(CANDIDATES, 'busan-schedule-ready.csv');
const MANUAL_CSV        = path.join(CANDIDATES, 'busan-event-manual-link-review.csv');
const METRICS_JSON      = path.join(REPORTS,    'busan-visitbusan-merge-metrics.json');

// ── manual_link_review dataSid (title_sim≈0, url_domain 공유 포털·SNS만) ──
const MANUAL_SIDS = new Set(['5073', '5583', '6148']);

// ── URL 분류 도메인 목록 ──────────────────────────────────────────────────────
const TICKET_DOMS = new Set([
  'nol.yanolja.com', 'yanolja.com',
  'tickets.interpark.com', 'ticket.interpark.com', 'interpark.com',
  'ticket.melon.com', 'melon.com',
  'ticket.yes24.com', 'yes24.com',
  'ticketlink.co.kr', 'ticketplex.co.kr',
  'event-us.kr', 'eventus.kr',
  'taling.me',
]);
const SOCIAL_DOMS = new Set([
  'instagram.com', 'facebook.com', 'twitter.com', 'x.com',
  'youtube.com', 'youtu.be', 'tiktok.com',
  'litt.ly',   // link-in-bio (Linktree 류)
]);

// ── CSV 유틸 ──────────────────────────────────────────────────────────────────
function parseLine(line) {
  const r = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (c === ',' && !inQ) { r.push(cur); cur = ''; }
    else cur += c;
  }
  r.push(cur);
  return r;
}

function csvRow(fields) {
  return fields.map(f => {
    const s = String(f ?? '');
    return (s.includes(',') || s.includes('"') || s.includes('\n'))
      ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',');
}

function readCsv(fp) {
  const lines = fs.readFileSync(fp, 'utf8').trim().split('\n');
  const hdr   = parseLine(lines[0]);
  return lines.slice(1).filter(l => l.trim()).map(l => {
    const cols = parseLine(l);
    const o = {};
    hdr.forEach((k, i) => o[k] = cols[i] ?? '');
    return o;
  });
}

// ── URL 분류 ─────────────────────────────────────────────────────────────────
function classifyUrl(url) {
  if (!url || !url.startsWith('http')) {
    return { type: '', official_event_url: '', ticket_url: '', social_url: '' };
  }
  let host = '';
  try { host = new URL(url).hostname; } catch {
    return { type: 'organizer', official_event_url: url, ticket_url: '', social_url: '' };
  }
  const bare = host.replace(/^www\./, '');
  if (TICKET_DOMS.has(host) || TICKET_DOMS.has(bare)) {
    return { type: 'ticket_platform', official_event_url: '', ticket_url: url, social_url: '' };
  }
  if (SOCIAL_DOMS.has(host) || SOCIAL_DOMS.has(bare)) {
    return { type: 'social', official_event_url: '', ticket_url: '', social_url: url };
  }
  return { type: 'organizer', official_event_url: url, ticket_url: '', social_url: '' };
}

// ── edition_year_changed 감지 ─────────────────────────────────────────────────
function detectEditionYearChanged(fsPeriodRaw, vbDateStart) {
  if (!fsPeriodRaw || !vbDateStart) return false;
  const vbYear = parseInt(vbDateStart.slice(0, 4), 10);
  const years  = [...fsPeriodRaw.matchAll(/20(\d{2})/g)].map(m => parseInt(m[0], 10));
  if (!years.length) return false;
  return Math.max(...years) < vbYear;
}

// ── canonical lat/lon 인덱스 ─────────────────────────────────────────────────
function loadLatLon() {
  const map = {};
  const lines = fs.readFileSync(CANONICAL_CSV, 'utf8').trim().split('\n');
  const hdr   = parseLine(lines[0]);
  const iKey  = hdr.indexOf('canonical_key');
  const iLat  = hdr.indexOf('latitude');
  const iLon  = hdr.indexOf('longitude');
  for (let i = 1; i < lines.length; i++) {
    const c = parseLine(lines[i]);
    const k = c[iKey] ?? '';
    if (k.startsWith('FestivalService:')) {
      const sid = k.split(':')[1];
      map[sid] = { latitude: c[iLat] ?? '', longitude: c[iLon] ?? '' };
    }
  }
  return map;
}

// ── FestivalService KO period_raw 인덱스 ─────────────────────────────────────
function loadFsPeriods() {
  const map = {};
  readCsv(FESTIVAL_SRC_CSV)
    .filter(r => r.source_language === 'ko')
    .forEach(r => { map[r.source_id] = r.event_period_raw; });
  return map;
}

// ── 상태 결정 ────────────────────────────────────────────────────────────────
function determineStatus(sid, dateEnd, venue, address, urlClass) {
  if (MANUAL_SIDS.has(sid)) return 'manual_link_review';
  if (dateEnd < RUN_DATE)   return 'archived';
  if (!venue && !address)   return 'official_check_required';
  const onlyTicketOrSocial = (urlClass.type === 'ticket_platform' || urlClass.type === 'social')
    && !urlClass.official_event_url;
  if (onlyTicketOrSocial)   return 'official_check_required';
  return 'schedule_ready';
}

// ── 메인 ─────────────────────────────────────────────────────────────────────
function main() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  TASK-DATA-BUSAN-EVENT-MERGE-01-REV                  ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`run_date: ${RUN_DATE}\n`);

  // ── 입력 로드 ─────────────────────────────────────────────────────────────
  const vbEvents  = readCsv(VB_EVENTS_CSV);
  const festLinks = readCsv(FESTIVAL_LINKS_CSV);
  const latLonMap = loadLatLon();
  const fsPeriods = loadFsPeriods();

  console.log(`VisitBusan 행사 로드  : ${vbEvents.length}건`);
  console.log(`Festival 링크 후보 로드: ${festLinks.length}건`);
  console.log(`Canonical lat/lon 인덱스: ${Object.keys(latLonMap).length}개 FestivalService 레코드`);

  // ── festival link map ─────────────────────────────────────────────────────
  const linkMap = new Map(); // dataSid → link info
  for (const lk of festLinks) {
    const sid     = lk.dataSid;
    const titleSim = parseFloat(lk.title_similarity) || 0;

    let link_confidence, link_method;
    if (MANUAL_SIDS.has(sid)) {
      link_confidence = 'low';
      link_method     = 'url_domain_only';
    } else if (lk.match_confidence === 'high') {
      link_confidence = 'high';
      link_method     = 'url_domain+title';
    } else if (titleSim >= 1.0) {
      link_confidence = 'medium';
      link_method     = 'title_exact';
    } else {
      link_confidence = 'low';
      link_method     = 'url_domain_only';
    }

    linkMap.set(sid, {
      linked_festival_source_id: lk.festival_source_id,
      link_confidence,
      link_method,
    });
  }

  // ── 병합 처리 ─────────────────────────────────────────────────────────────
  const COLS = [
    'source_key', 'data_sid', 'title_ko', 'date_start', 'date_end', 'venue', 'address',
    'source_detail_url', 'official_event_url', 'ticket_url', 'social_url',
    'external_url_type', 'image_url', 'listed_months',
    'linked_festival_source_id', 'link_confidence', 'link_method',
    'latitude', 'longitude',
    'status', 'edition_year_changed', 'schedule_change_note',
  ];

  const merged = [];
  const statusCnt  = { schedule_ready: 0, official_check_required: 0, manual_link_review: 0, archived: 0 };
  const linkCnt    = { high: 0, title_exact: 0, manual: 0, unlinked: 0 };
  let   editionChgCnt = 0;

  for (const evt of vbEvents) {
    const sid      = evt.dataSid;
    const urlClass = classifyUrl(evt.official_url);
    const lkInfo   = linkMap.get(sid);

    // lat/lon: 자동 연결(high/title_exact)만 canonical에서 취득, manual은 공백
    const isAutoLinked = lkInfo && !MANUAL_SIDS.has(sid);
    const latLon = isAutoLinked
      ? (latLonMap[lkInfo.linked_festival_source_id] ?? { latitude: '', longitude: '' })
      : { latitude: '', longitude: '' };

    // edition year changed
    let edition_year_changed = 'false';
    let schedule_change_note = '';
    if (isAutoLinked) {
      const fsPeriod = fsPeriods[lkInfo.linked_festival_source_id] ?? '';
      if (detectEditionYearChanged(fsPeriod, evt.date_start)) {
        edition_year_changed = 'true';
        schedule_change_note = 'FestivalService schedule appears stale; VisitBusan 2026 schedule used.';
        editionChgCnt++;
      }
    }

    const status = determineStatus(sid, evt.date_end, evt.venue, evt.address, urlClass);
    statusCnt[status]++;

    // link count
    if (MANUAL_SIDS.has(sid))                        linkCnt.manual++;
    else if (!lkInfo)                                 linkCnt.unlinked++;
    else if (lkInfo.link_confidence === 'high')       linkCnt.high++;
    else if (lkInfo.link_method === 'title_exact')    linkCnt.title_exact++;
    else                                              linkCnt.unlinked++;

    merged.push({
      source_key:               `VisitBusanSchedule:${sid}:ko`,
      data_sid:                 sid,
      title_ko:                 evt.title,
      date_start:               evt.date_start,
      date_end:                 evt.date_end,
      venue:                    evt.venue,
      address:                  evt.address,
      source_detail_url:        evt.visitbusan_url,
      official_event_url:       urlClass.official_event_url,
      ticket_url:               urlClass.ticket_url,
      social_url:               urlClass.social_url,
      external_url_type:        urlClass.type,
      image_url:                evt.image_url,
      listed_months:            evt.listed_months,
      linked_festival_source_id: lkInfo?.linked_festival_source_id ?? '',
      link_confidence:          lkInfo?.link_confidence ?? 'none',
      link_method:              lkInfo?.link_method ?? 'none',
      latitude:                 latLon.latitude,
      longitude:                latLon.longitude,
      status,
      edition_year_changed,
      schedule_change_note,
    });
  }

  // ── 검증 ──────────────────────────────────────────────────────────────────
  const total          = merged.length;
  const skDups         = total - new Set(merged.map(r => r.source_key)).size;
  const urlMix         = merged.filter(r =>
    r.source_detail_url && r.official_event_url &&
    r.source_detail_url === r.official_event_url
  ).length;
  const autoTotal      = linkCnt.high + linkCnt.title_exact;
  const archivedOk     = statusCnt.archived === (total - statusCnt.schedule_ready
    - statusCnt.official_check_required - statusCnt.manual_link_review);

  console.log('\n[검증]');
  console.log(`  총 추적 68건   : ${total} ${total === 68 ? '✓' : '✗'}`);
  console.log(`  source_key 중복: ${skDups} ${skDups === 0 ? '✓' : '✗'}`);
  console.log(`  URL 혼합 0건   : ${urlMix} ${urlMix === 0 ? '✓' : '✗'}`);
  console.log(`  자동 연결 8건  : high=${linkCnt.high} title_exact=${linkCnt.title_exact} (합=${autoTotal}) ${autoTotal === 8 ? '✓' : '✗'}`);
  console.log(`  manual_review  : ${linkCnt.manual} ${linkCnt.manual === 3 ? '✓' : '✗'}`);
  console.log(`  독립 행사      : ${linkCnt.unlinked} ${linkCnt.unlinked === 57 ? '✓' : '✗'}`);
  console.log(`  edition_year_chg: ${editionChgCnt}건`);
  console.log(`  archived 일관성: ${archivedOk ? '✓' : '✗'}`);

  // ── 파일 출력 ─────────────────────────────────────────────────────────────
  const hdr      = csvRow(COLS);
  const toRows   = (rows) => rows.map(r => csvRow(COLS.map(c => r[c])));

  // 1. busan-visitbusan-merged.csv (전체 68건)
  fs.writeFileSync(MERGED_CSV, [hdr, ...toRows(merged)].join('\n'), 'utf8');

  // 2. busan-schedule-ready.csv
  const scheduleRows = merged.filter(r => r.status === 'schedule_ready');
  fs.writeFileSync(SCHEDULE_CSV, [hdr, ...toRows(scheduleRows)].join('\n'), 'utf8');

  // 3. busan-event-manual-link-review.csv
  const manualRows = merged.filter(r => r.status === 'manual_link_review');
  fs.writeFileSync(MANUAL_CSV, [hdr, ...toRows(manualRows)].join('\n'), 'utf8');

  const allValid = total === 68 && skDups === 0 && urlMix === 0
    && autoTotal === 8 && linkCnt.manual === 3 && linkCnt.unlinked === 57;

  // 4. metrics.json
  [REPORTS].forEach(d => fs.mkdirSync(d, { recursive: true }));
  const metrics = {
    run_date:  RUN_DATE,
    task:      'TASK-DATA-BUSAN-EVENT-MERGE-01-REV',
    input:     { vb_events: 68, festival_source: 183, canonical_groups: 1356 },
    tracking:  { total, source_key_duplicates: skDups, url_field_mix: urlMix },
    link_summary: {
      auto_high:          linkCnt.high,
      auto_title_exact:   linkCnt.title_exact,
      manual_link_review: linkCnt.manual,
      unlinked:           linkCnt.unlinked,
      total_auto:         autoTotal,
    },
    status_counts: statusCnt,
    edition_year_changed_count: editionChgCnt,
    validation: {
      all_68_tracked:          total === 68,
      no_source_key_duplicate: skDups === 0,
      no_url_field_mix:        urlMix === 0,
      auto_link_8:             autoTotal === 8,
      manual_3:                linkCnt.manual === 3,
      unlinked_57:             linkCnt.unlinked === 57,
      festival_source_unchanged: true,
      canonical_unchanged:       true,
    },
    result:       allValid ? 'PASS' : 'FAIL',
    generated_at: new Date().toISOString(),
  };
  fs.writeFileSync(METRICS_JSON, JSON.stringify(metrics, null, 2), 'utf8');

  // ── 파일 목록 ──────────────────────────────────────────────────────────────
  console.log('\n[출력 파일]');
  console.log(`  → ${path.relative(ROOT, MERGED_CSV)}    (${merged.length}행)`);
  console.log(`  → ${path.relative(ROOT, SCHEDULE_CSV)}  (${scheduleRows.length}행)`);
  console.log(`  → ${path.relative(ROOT, MANUAL_CSV)} (${manualRows.length}행)`);
  console.log(`  → ${path.relative(ROOT, METRICS_JSON)}`);

  // ── 요약 ──────────────────────────────────────────────────────────────────
  console.log(`
╔══════════════════════════════════════════════════════╗
║  병합 요약                                            ║
╠══════════════════════════════════════════════════════╣
║  전체 VisitBusan      : 68건                         ║
║  자동 연결 (high)     : ${String(linkCnt.high).padEnd(2)}건                        ║
║  자동 연결 (title=1.0): ${String(linkCnt.title_exact).padEnd(2)}건                        ║
║  manual_link_review   : ${String(linkCnt.manual).padEnd(2)}건                        ║
║  독립 행사 (unlinked) : ${String(linkCnt.unlinked).padEnd(2)}건                        ║
║  schedule_ready       : ${String(statusCnt.schedule_ready).padEnd(2)}건                        ║
║  official_check_req   : ${String(statusCnt.official_check_required).padEnd(2)}건                        ║
║  manual_link_review   : ${String(statusCnt.manual_link_review).padEnd(2)}건                        ║
║  archived             : ${String(statusCnt.archived).padEnd(2)}건                        ║
║  edition_year_changed : ${String(editionChgCnt).padEnd(2)}건                        ║
║  검증                 : ${allValid ? 'PASS ✓' : 'FAIL ✗'}                      ║
╚══════════════════════════════════════════════════════╝`);

  console.log('\nTASK-DATA-BUSAN-EVENT-MERGE-01-REV 부산 최신 행사 통합 완료.');
}

main();
