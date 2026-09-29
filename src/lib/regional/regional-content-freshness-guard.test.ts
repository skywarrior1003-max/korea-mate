// REGIONAL-CONTENT-FRESHNESS-V1 — 행사 노출 기한·주간 확인 기록·교정 원천 가드
// 실행: node --experimental-strip-types --test src/lib/regional/regional-content-freshness-guard.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isListableEvent } from "../events/event-visibility.ts";
import { judgeContentHealth } from "./content-health.ts";
import { getCityEvents, getCityEventById } from "../../data/regional/regional-recommendations.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const json = (p: string) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

test("이벤트 목록 기준 — 숨김·표시 기한·종료일 지난 항목 제외", () => {
  const t = "2026-09-29";
  assert.equal(isListableEvent({ endDate: "2026-08-31" }, t), false);
  assert.equal(isListableEvent({ displayUntil: "2026-06-13", endDate: "2026-10-20" }, t), false);
  assert.equal(isListableEvent({ hidden: true }, t), false);
  assert.equal(isListableEvent({ endDate: "2026-09-29" }, t), true);
  assert.equal(isListableEvent({ endDate: null, displayUntil: null }, t), true);
  for (const f of ["src/app/trending/page.tsx", "src/app/all-spots/page.tsx"]) {
    assert.match(read(f), /isListableEvent\(e, today\)/, f);
  }
});

test("/public/data/events.json — 오늘 목록에 종료 행사가 남지 않는다", () => {
  const ev = json("public/data/events.json") as { endDate: string | null; displayUntil?: string; hidden?: boolean }[];
  const t = "2026-09-29";
  const leaked = ev.filter(e => isListableEvent(e, t) && ((e.endDate && e.endDate.slice(0, 10) < t) || (e.displayUntil && e.displayUntil < t)));
  assert.equal(leaked.length, 0);
});

test("City Hub 행사 — 달만 적힌 날짜는 그 달 말에 목록에서 빠지고, 2026-09-29 교정분은 종료로 처리", () => {
  const d = new Date("2026-09-29T03:00:00Z");
  const ids = ["busan", "seoul", "gyeongju", "jeju", "jeonju"].flatMap(c => getCityEvents(c, d).map(e => e.id));
  assert.ok(!ids.includes("jeju-RN-R01") && !ids.includes("jeonju-RN-R02"));
  // 상세는 공유 링크를 위해 남기되 진행 상태는 붙이지 않는다
  assert.equal(getCityEventById("jeonju", "jeonju-RN-R02", d)?.status, null);
  // 모든 기간 행사는 목록에서 빠질 날짜를 계산할 수 있어야 한다(ISO 종료일 또는 달 단위 시작일)
  const places = json("src/data/regional/regional-places-v1.json").places as { id: string; validFrom: string | null; validTo: string | null }[];
  for (const p of places.filter(x => x.validFrom !== null || x.validTo !== null)) {
    assert.ok((p.validTo && /^\d{4}-\d{2}-\d{2}$/.test(p.validTo)) || (p.validFrom && /^\d{4}-\d{2}/.test(p.validFrom)), p.id);
  }
});

test("교정 기록 — 모든 변경에 공식 원천·확인일·검토 상태", () => {
  const log = json("data/regional-recommendations/corrections/freshness-2026-09-29.json");
  assert.equal(log.changes.length, 4);
  for (const c of log.changes) {
    assert.ok(c.sources.length > 0 && c.sources.every((u: string) => u.startsWith("https://")), c.id);
    assert.equal(c.verified_at, "2026-09-29");
    assert.match(c.review_status, /Owner release approval required/);
  }
  const ess = json("src/data/regional/regional-essentials-v1.json").essentials as { id: string; keyInfo: Record<string, unknown> }[];
  const s1 = ess.find(e => e.id === "seoul-U-001")!;
  assert.equal(s1.keyInfo.fare_adult_card, 1550);
  const s7 = ess.find(e => e.id === "seoul-U-007")!;
  assert.ok(!("price_approx_krw" in s7.keyInfo), "종료된 30일권 가격을 판매 상품처럼 두지 않는다");
});

test("주간 확인 상태 판정 — 기한 초과·종료일 없는 행사·Essentials 검토일 초과는 503", () => {
  const f = { cadence_days: 7, grace_days: 2, checks: [{ date: "2026-09-29" }] };
  const ok = judgeContentHealth(f, [{ validFrom: "2026-08-07", validTo: "2026-08-15" }], [{ reviewBy: "2027-01-01" }], "2026-10-05");
  assert.equal(ok.state, "ok");
  assert.equal(judgeContentHealth(f, [], [], "2026-10-09").state, "weekly_check_overdue");
  assert.equal(judgeContentHealth(f, [{ validFrom: "sometime", validTo: null }], [], "2026-09-30").state, "event_without_end_date");
  assert.equal(judgeContentHealth(f, [], [{ reviewBy: "2026-09-01" }], "2026-09-30").state, "essentials_review_overdue");
  // 실제 기록 파일: 최신 확인일이 교정 기록일과 같다
  const rec = json("src/data/regional/content-freshness-v1.json");
  assert.equal(rec.checks.map((c: { date: string }) => c.date).sort().pop(), "2026-09-29");
  assert.match(read("functions/api/health/content.ts"), /judgeContentHealth/);
});

test("날짜 경계 — 한국 날짜 기준·종료일 당일 포함·달만 적힌 날짜는 그 달 말까지·날짜를 모르면 목록 없음", async () => {
  const { kstToday } = await import("../dates/kst-today.ts");
  // UTC 10-31 15:00 = KST 11-01 00:00 → 한국 날짜는 11-01
  assert.equal(kstToday(Date.parse("2026-10-31T14:59:59Z")), "2026-10-31");
  assert.equal(kstToday(Date.parse("2026-10-31T15:00:00Z")), "2026-11-01");
  // jeonju-RN-001 은 2026-10-31 종료 — 종료일 당일까지 보이고 다음 날 빠진다
  assert.ok(getCityEvents("jeonju", "2026-10-31").some(e => e.id === "jeonju-RN-001"));
  assert.ok(!getCityEvents("jeonju", "2026-11-01").some(e => e.id === "jeonju-RN-001"));
  // Date 를 넘기면 한국 날짜로 바꾼다(UTC 날짜가 아니다)
  assert.ok(!getCityEvents("jeonju", new Date("2026-10-31T16:00:00Z")).some(e => e.id === "jeonju-RN-001"));
  // 상세: 날짜를 모르면(null) 진행 상태를 붙이지 않는다
  assert.equal(getCityEventById("jeonju", "jeonju-RN-001", null)?.status, null);
  assert.equal(getCityEventById("jeonju", "jeonju-RN-001", "2026-10-01")?.status, "ongoing");
  // 컴포넌트는 브라우저 날짜(useKstToday)로만 거르고, 모를 때는 목록도 '곧' 안내도 그리지 않는다
  for (const f of ["src/components/quiet/CityHubClient.tsx", "src/components/quiet/EventsClient.tsx"]) {
    const s = read(f);
    assert.match(s, /useKstToday\(\)/, f);
    assert.match(s, /today \? getCityEvents\(slug, today\) : null/, f);
    assert.match(s, /events === null \? null :/, f);
  }
  assert.match(read("src/lib/dates/use-kst-today.ts"), /useSyncExternalStore\(subscribe, \(\) => kstToday\(\), \(\) => null\)/);
  for (const f of ["src/app/trending/page.tsx", "src/app/all-spots/page.tsx"]) assert.match(read(f), /const today = kstToday\(\);/, f);
});

test("기후동행카드 문구 — 신규 충전 종료와 기존 이용권 사용 종료를 구분", () => {
  const ess = json("src/data/regional/regional-essentials-v1.json").essentials as { id: string; summary: string; keyInfo: Record<string, unknown>; recheckPending?: string }[];
  const s7 = ess.find(e => e.id === "seoul-U-007")!;
  assert.match(s7.summary, /신규 충전이 2026년 8월 31일\(선불\)로 끝났다/);
  assert.match(s7.summary, /이미 충전한 카드는 만료일까지/);
  assert.ok(!/운영을 종료/.test(s7.summary));
  // 원천 재확인 대기 항목은 최신 확정 정보처럼 보이지 않게 안내를 붙인다
  const pending = ess.filter(e => e.recheckPending).map(e => e.id).sort();
  assert.deepEqual(pending, ["jeju-U-003", "jeju-U-004", "jeju-U-006", "jeonju-U-004", "seoul-U-006"]);
  assert.match(read("src/components/quiet/EssentialsClient.tsx"), /es\.recheckPending && [\s\S]{0,120}essRecheckPending/);
  for (const l of ["ko", "en", "ja", "zh"]) assert.ok(json(`src/messages/${l}.json`).quiet.essRecheckPending, l);
});
