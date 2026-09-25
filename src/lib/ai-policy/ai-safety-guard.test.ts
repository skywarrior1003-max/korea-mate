// V2-AI-HARDCAP-EMERGENCY-SWITCH-AND-NON-AI-SCHEDULER-V1 §12 — AI 안전 가드
// 실행: node --experimental-strip-types src/lib/ai-policy/ai-safety-guard.test.ts
//
// 이 스위트는 "코드가 그렇게 배선되어 있다"를 소스 계약으로 고정한다.
// 런타임 동작(스위치 차단·예약 경쟁·unknown 보존)은 Staging RPC 실측이 맡고,
// 여기서는 그 배선이 조용히 풀리는 회귀를 잡는다. cost-model.test.ts 의
// 인벤토리 고정(9파일)과 겹치는 검사는 반복하지 않는다.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  BASE_SCHEDULER_CREDIT_COST, TRIP_DAYS_MIN, TRIP_DAYS_MAX,
  CREDIT_COST, FORBIDDEN_LEGACY, TICKET, FREE_MONTHLY,
} from "./usage-policy.ts";
import {
  provenanceOrUser, fieldEligible, creditUnitsForProposal,
  type WritingScope, type FullTripWritingProposal,
} from "./full-trip-writing-contract.ts";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

// ── §7 서버 하드캡 — 게이트가 provider 호출보다 앞에 있어야 한다 ──────────────
// (marker = 그 파일에서 실제 provider 실행이 시작되는 유일한 지점)

const GATED_ROUTES: { file: string; providerMarker: string }[] = [
  { file: "functions/api/trip/personalize.ts",   providerMarker: "await callProfileProvider" },
  { file: "functions/api/import/analyze.ts",     providerMarker: "await analyzeWithAi(" },
  // callGemini "정의"는 파일 위쪽에 있다 — 핸들러 안의 "호출" 지점과 비교한다.
  { file: "functions/api/generate-itinerary.ts", providerMarker: "await callGemini(" },
];

for (const { file, providerMarker } of GATED_ROUTES) {
  test(`게이트 순서 — ${file}`, () => {
    const whole = read(file);
    // HTTP 로 닿는 경로는 onRequest 핸들러다 — 게이트 순서는 거기서 판정한다.
    // (generate-itinerary 의 harness 전용 export 는 아래 별도 테스트가 다룬다)
    const hIdx = whole.indexOf("export const onRequest");
    const h2Idx = hIdx >= 0 ? hIdx : whole.indexOf("export async function onRequest");
    const src = h2Idx >= 0 ? whole.slice(h2Idx) : whole;
    const gateIdx = src.indexOf("aiOpsReserve(");
    const provIdx = src.indexOf(providerMarker);
    assert.ok(gateIdx > 0, "aiOpsReserve 호출이 없다");
    assert.ok(provIdx > 0, `provider marker(${providerMarker})가 없다 — marker 를 갱신하라`);
    assert.ok(gateIdx < provIdx, "aiOpsReserve 가 provider 호출 뒤에 있다 — 게이트 우회");
    // 정산 배선 — commit 과 unknown 보존 양쪽이 있어야 한다
    assert.ok(src.includes('"committed"'), "committed 정산이 없다");
    assert.ok(src.includes('"unknown_billed"'), "unknown_billed 정산이 없다(비용 0 가정 금지)");
  });
}

test("generate-itinerary — harness 전용 export 는 HTTP 핸들러에서 불리지 않는다", () => {
  const src = read("functions/api/generate-itinerary.ts");
  const hIdx = src.indexOf("export const onRequest");
  assert.ok(hIdx > 0, "onRequest 핸들러가 없다");
  // generateItineraryInternal 은 Node harness(process.env) 전용이다. 핸들러
  // 본문에서 이것을 부르기 시작하면 게이트 없는 provider 경로가 열린다.
  assert.ok(!src.slice(hIdx).includes("generateItineraryInternal("),
    "핸들러가 harness 경로를 부른다 — 게이트 우회");
  // harness 는 Pages env 가 아니라 process.env 를 읽는다(런타임에서 자연 차단)
  const harnessIdx = src.indexOf("export async function generateItineraryInternal");
  assert.ok(harnessIdx > 0 && src.slice(harnessIdx, harnessIdx + 400).includes("process.env.GEMINI_API_KEY"),
    "harness 가 process.env 기반이 아니게 바뀌었다 — 게이트 필요 여부 재검토");
});

test("게이트 순서 — writing.ts 는 캐시·레거시 두 경로 모두", () => {
  const src = read("functions/api/mytrip/writing.ts");
  const reserves = src.split("aiOpsReserve(").length - 1;
  // import 1 + 레거시(비캐시) 경로 1 + 본 경로 1 + `Parameters<typeof aiOpsReserve>` 캐스트들.
  // 실제 "호출"만 센다: `await aiOpsReserve(` 형태.
  const calls = (src.match(/await aiOpsReserve\(/g) ?? []).length;
  assert.equal(calls, 2, `writing.ts 예약 호출 ${calls}개 — 레거시·본 경로 각 1개여야 한다`);
  assert.ok(reserves >= calls, "sanity");
  // 두 provider 진입점(viaWorker/runDirect 레거시, runDirect 본) 앞에 게이트가 있는지 —
  // 레거시 경로: 첫 await aiOpsReserve 는 첫 viaWorker 호출보다 앞이어야 한다.
  const firstReserve = src.indexOf("await aiOpsReserve(");
  const firstViaWorker = src.indexOf("await viaWorker(");
  const firstRunDirect = src.indexOf("await runDirect(");
  assert.ok(firstViaWorker < 0 || firstReserve < firstViaWorker, "viaWorker 가 게이트보다 앞 — 우회");
  assert.ok(firstRunDirect < 0 || firstReserve < firstRunDirect, "runDirect 가 게이트보다 앞 — 우회");
});

test("공통 게이트 — AI_MODE(env) 최우선, 스위치는 fail-closed", () => {
  const g = read("functions/_lib/ai-ops-guard.ts");
  // ① aiAllowed(env) 검사가 DB 스위치 조회보다 앞
  const fnBody = g.slice(g.indexOf("export async function aiOpsReserve"));
  const aiAllowedIdx = fnBody.indexOf("aiAllowed(env)");
  const switchIdx = fnBody.indexOf("readSwitches(env)");
  const rpcIdx = fnBody.indexOf("rpc/ai_ops_reserve");
  assert.ok(aiAllowedIdx > 0 && switchIdx > 0 && rpcIdx > 0, "게이트 3단이 모두 있어야 한다");
  assert.ok(aiAllowedIdx < switchIdx, "env 게이트가 DB 스위치보다 뒤 — AI_MODE 최우선 위반");
  assert.ok(switchIdx < rpcIdx, "스위치 검사가 예약 RPC 보다 뒤");
  // ② 스위치 부재·조회실패·오타 = 차단(허용 기본값 없음)
  assert.ok(g.includes("if (!sw) return"), "조회 실패가 차단이 아니다");
  assert.ok(g.includes(`sw.get("ai_master") !== "live"`), "ai_master 정확 일치 검사가 없다");
  assert.ok(g.includes("FEATURE_KEY[input.feature]") && g.includes('!== "live"'),
    "기능 스위치 정확 일치 검사가 없다");
  // ③ 예약 실패 = provider 미호출 (실패 시 ok:false 반환만 있고 fallthrough 없음)
  assert.ok(g.includes("duplicate_idempotency"), "중복 idempotency 분기가 없다");
});

test("일수 하드캡 — 서버 1~14 강제", () => {
  const legacy = read("functions/api/generate-itinerary.ts");
  assert.ok(/numDays\s*<\s*1\s*\|\|\s*numDays\s*>\s*14/.test(legacy),
    "generate-itinerary 1~14 검사가 없다");
  assert.ok(legacy.includes("maxOutputTokens: 8192"), "출력 하드캡 8192 가 없다");
  const pers = read("functions/api/trip/personalize.ts");
  assert.ok(/days\s*<\s*1\s*\|\|\s*days\s*>\s*14/.test(pers), "personalize 1~14 검사가 없다");
  // 클라 실제 생성 진입점(This Trip/Picks — /planner 는 redirect 전용)도 같은 상한
  const picks = read("src/app/picks/PicksClient.tsx");
  assert.ok(/dayCount\s*<\s*1\s*\|\|\s*dayCount\s*>\s*14/.test(picks), "Picks 1~14 검사가 없다");
  assert.equal(TRIP_DAYS_MIN, 1); assert.equal(TRIP_DAYS_MAX, 14);
});

// ── §8 Worker 도 같은 정책 — 자체 kill switch(누락=차단) ─────────────────────

test("Worker kill switch — ai-writing", () => {
  const w = read("workers/ai-writing/src/index.ts");
  const gate = w.indexOf("AI_WRITING_WORKER_MODE");
  const key = w.indexOf("const apiKey = env.GEMINI_API_KEY");
  assert.ok(gate > 0, "AI_WRITING_WORKER_MODE 스위치가 없다");
  assert.ok(w.includes(`!== "live"`), "정확 일치(누락=차단) 검사가 아니다");
  assert.ok(key < 0 || w.lastIndexOf("AI_WRITING_WORKER_MODE", key) > 0,
    "스위치가 provider 준비(apiKey)보다 뒤에 있다");
});

test("Worker kill switch — trend-curator(cron 포함)", () => {
  const c = read("workers/trend-curator/src/index.ts");
  const runIdx = c.indexOf("export async function run(");
  assert.ok(runIdx > 0, "run() 이 없다");
  // provider(fetch) 정의는 run() 위쪽 헬퍼다 — 실행 순서는 run 본문 기준으로 본다:
  // env.CURATOR_MODE 검사가 run 본문에서 research 실행보다 앞이어야 한다.
  const body = c.slice(runIdx);
  const gateIdx = body.indexOf("env.CURATOR_MODE");
  const researchIdx = body.search(/deps\.research|researchReal/);
  assert.ok(gateIdx > 0, "CURATOR_MODE 스위치가 run() 에 없다");
  assert.ok(researchIdx > 0, "research 실행 지점 marker 를 갱신하라");
  assert.ok(gateIdx < researchIdx, "스위치가 research 실행보다 뒤");
  assert.ok(body.slice(gateIdx, gateIdx + 200).includes(`!== "live"`), "누락=차단 검사가 아니다");
});

// ── §4·§5 — 기본 일정은 AI 0, 개인화는 명시 옵트인 ──────────────────────────

test("옵트인 계약 — 자동 personalize 결합이 없다", () => {
  const page = read("src/app/itinerary/page.tsx");
  // fetchPersonalizationProfile 호출 지점은 생성 함수 안의 단 1곳
  const calls = (page.match(/fetchPersonalizationProfile\(/g) ?? []).length;
  assert.equal(calls, 1, `fetchPersonalizationProfile 호출 ${calls}곳 — 1곳(생성 함수 내부)이어야 한다`);
  // 그 1곳은 aiPersonalize 옵트인 뒤에만 실행된다
  assert.ok(page.includes("!aiPersonalize ? null : await fetchPersonalizationProfile"),
    "옵트인 가드(!aiPersonalize → null)가 없다");
  // 기본값 false — 파라미터 기본값이 명시되어 있다
  assert.ok(page.includes("aiPersonalize = false"), "aiPersonalize 기본 false 가 아니다");
  // true 를 넘기는 곳은 옵트인 핸들러 1곳뿐
  const optIns = (page.match(/true, \/\/ aiPersonalize/g) ?? []).length;
  assert.equal(optIns, 1, "aiPersonalize=true 전달이 옵트인 핸들러 1곳이 아니다");
  // 실패 시 기본 일정 보존 — personalizationApplied 아닐 때 setDays 금지 배선
  assert.ok(page.includes('if (!r.personalizationApplied) { setAiOptInPhase("unavailable"); return; }'),
    "실패 시 기본 일정 보존(조기 return)이 없다");
});

test("옵트인 문구 — 4 locale 존재·내부 용어 미노출", () => {
  const KEYS = ["aiOptInButton", "aiOptInNote", "aiOptInConfirmTitle", "aiOptInConfirmBody",
    "aiOptInConfirmYes", "aiOptInConfirmNo", "aiOptInBusy", "aiOptInApplied", "aiUnavailableNotice"];
  for (const l of ["en", "ko", "ja", "zh"]) {
    const m = JSON.parse(read(`src/messages/${l}.json`)) as Record<string, Record<string, string>>;
    for (const k of KEYS) {
      const v = m.itin?.[k];
      assert.ok(typeof v === "string" && v.length > 0, `${l}.itin.${k} 누락`);
      for (const banned of ["Gemini", "provider", "mock", "quota", "credit", "budget", "switch"]) {
        assert.ok(!v.toLowerCase().includes(banned.toLowerCase()), `${l}.itin.${k} 에 내부 용어 "${banned}"`);
      }
    }
  }
});

// ── §6 원장·스위치 스키마(072) — 저장 금지 항목·원자성 장치 ─────────────────

test("072 migration — 원장 계약", () => {
  const sql = read("supabase/migrations/072_ai_ops_ledger_and_switches.sql");
  // 상태 집합 4종
  for (const s of ["reserved", "committed", "released", "unknown_billed"]) {
    assert.ok(sql.includes(`'${s}'`), `status ${s} 누락`);
  }
  // 원자성 — advisory lock + idempotency UNIQUE
  assert.ok(sql.includes("pg_advisory_xact_lock"), "advisory lock 없음 — 예약 경쟁 원자성 붕괴");
  assert.ok(/idempotency_key\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i.test(sql), "idempotency UNIQUE 없음");
  // unknown_billed = 예약액 보존(비용 0 가정 금지)
  assert.ok(/unknown_billed/.test(sql) && /reserved_usd_micro/.test(sql), "unknown 보존 재료 없음");
  // 저장 금지 — prompt 원문·자유 메모·raw device id 컬럼이 없어야 한다
  for (const banned of ["prompt", "memo_text", "device_id", "user_agent", "ip_address"]) {
    assert.ok(!new RegExp(`^\\s*${banned}\\s+`, "m").test(sql), `원장에 금지 컬럼 ${banned}`);
  }
  assert.ok(sql.includes("actor_hash"), "actor 는 해시로만");
  // 권한 — anon/authenticated 직접 접근 차단, service_role 만
  assert.ok(/revoke/i.test(sql) && /service_role/.test(sql), "권한 잠금 배선 없음");
});

// ── §2 정책 가드 — 최신 확정 정책 고정 + 과거 정책 재적용 금지 ──────────────

test("정책 — 기본 일정 무제한·차감 0, 1~14일", () => {
  assert.equal(BASE_SCHEDULER_CREDIT_COST, 0);
  assert.equal(TRIP_DAYS_MIN, 1);
  assert.equal(TRIP_DAYS_MAX, 14);
  assert.notEqual(TRIP_DAYS_MAX, FORBIDDEN_LEGACY.tripDaysMaxFive, "과거 1~5일 정책 재적용 금지");
});

test("정책 — 과금 단위는 완성 작업 1건=1, 3크레딧 금지", () => {
  assert.equal(CREDIT_COST.aiPersonalize, 1);
  assert.equal(CREDIT_COST.aiFullTripWriting, 1);
  for (const v of Object.values(CREDIT_COST)) {
    assert.notEqual(v, FORBIDDEN_LEGACY.itineraryCostThreeCredits, "일정 3크레딧 정책 재적용 금지");
  }
});

test("정책 — 5,900원 이용권 100(첫)=80+20 / 80(재), 구독·만료 없음", () => {
  assert.equal(TICKET.priceKRW, 5_900);
  assert.equal(TICKET.firstPurchaseCredits, 100);
  assert.equal(TICKET.repeatPurchaseCredits + TICKET.firstPurchaseBonus, TICKET.firstPurchaseCredits);
  assert.equal(TICKET.repeatPurchaseCredits, 80);
  assert.equal(TICKET.subscription, false);
  assert.equal(TICKET.expiry, null);
});

test("정책 — 무료 월 1+2(공유풀)=3, 30일 통합 1회 금지", () => {
  assert.equal(FREE_MONTHLY.aiPersonalize, 1);
  assert.equal(FREE_MONTHLY.fullTripWritingSharedPool, 2);
  assert.equal(FREE_MONTHLY.total, FREE_MONTHLY.aiPersonalize + FREE_MONTHLY.fullTripWritingSharedPool);
  assert.notEqual(FREE_MONTHLY.total, 1, "과거 '30일 통합 1회' 정책 재적용 금지");
});

// ── §10 전체 여행 글쓰기 계약 — 사용자 작성 보호 ────────────────────────────

test("writing 계약 — provenance 미상은 user 로(보호 우선)", () => {
  assert.equal(provenanceOrUser(undefined), "user");
  assert.equal(provenanceOrUser("gibberish"), "user");
  assert.equal(provenanceOrUser("system"), "system");
  assert.equal(provenanceOrUser("ai_then_user_edited"), "ai_then_user_edited");
});

test("writing 계약 — scope 별 대상 자격(자동 덮어쓰기 금지)", () => {
  const scopes: WritingScope[] = ["empty_and_system_only", "include_ai", "include_user_authored"];
  for (const s of scopes) {
    assert.equal(fieldEligible(s, "user", true), true, "빈 값은 어느 scope 든 대상");
  }
  // 사용자 작성값은 명시 동의 scope 에서만
  assert.equal(fieldEligible("empty_and_system_only", "user", false), false);
  assert.equal(fieldEligible("include_ai", "user", false), false);
  assert.equal(fieldEligible("include_user_authored", "user", false), true);
  // AI 가 만든 뒤 사용자가 손댄 값 = 사용자 작성값과 동급 보호
  assert.equal(fieldEligible("include_ai", "ai_then_user_edited", false), false);
  assert.equal(fieldEligible("include_user_authored", "ai_then_user_edited", false), true);
  // AI 생성값은 include_ai 부터
  assert.equal(fieldEligible("empty_and_system_only", "ai", false), false);
  assert.equal(fieldEligible("include_ai", "ai", false), true);
  // system 기본값은 항상 대상
  assert.equal(fieldEligible("empty_and_system_only", "system", false), true);
});

test("writing 계약 — 완성 제안 1건=1회, 빈 제안·실패=0", () => {
  assert.equal(creditUnitsForProposal(null), 0);
  const empty: FullTripWritingProposal = { items: [] };
  assert.equal(creditUnitsForProposal(empty), 0);
  const full: FullTripWritingProposal = {
    tripTitle: "t", tripIntro: "i",
    items: [{ targetId: "a", kind: "moment", memo: "m" }, { targetId: "b", kind: "place", title: "x" }],
  };
  assert.equal(creditUnitsForProposal(full), 1, "장소별 각각 차감 금지 — 전체 1");
});
