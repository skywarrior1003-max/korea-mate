// AI Writing 품질 계약 — 3방향·locale-native·context enrichment·generic 억제.
// (TASK-GOKOREAMATE-AI-WRITING-QUALITY-PRODUCTION-V1)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildWritingPrompt, deriveTripWritingFacts, buildProviderBody,
  DIRECTION_TEMPERATURE, WRITING_DIRECTIONS, MAX_TRIP_FACTS,
  type WritingRequest,
} from "./writing-core.ts";

const req = (over: Partial<WritingRequest> = {}): WritingRequest => ({
  target: "title", direction: "witty", locale: "ko",
  context: { city: "busan" }, ...over,
});

test("3 style 계약 — 정확히 calm/witty/warm, 각자 다른 craft 지시", () => {
  assert.deepEqual([...WRITING_DIRECTIONS], ["calm", "witty", "warm"]);
  const p = (d: "calm" | "witty" | "warm") => buildWritingPrompt(req({ direction: d }));
  assert.match(p("calm"), /restrained/i);
  assert.match(p("witty"), /observation/i);
  assert.match(p("witty"), /pasted on ANY trip/i);
  assert.match(p("warm"), /concrete scene/i);
  assert.notEqual(p("calm"), p("witty"));
});

test("locale-native — 4개 언어 각각 고유한 voice 지시가 들어간다(번역투 금지)", () => {
  const seen = new Set<string>();
  for (const loc of ["ko", "en", "ja", "zh"] as const) {
    const p = buildWritingPrompt(req({ locale: loc }));
    assert.match(p, new RegExp(`ONLY in`));
    const m = p.split("\n")[2]!; // LOCALE_VOICE 줄
    seen.add(m);
  }
  assert.equal(seen.size, 4, "locale voice 가 언어별로 달라야 한다");
  assert.match(buildWritingPrompt(req({ locale: "ja" })), /旅の記録/);
  assert.match(buildWritingPrompt(req({ locale: "ko" })), /담백한 구어체/);
});

test("generic copy suppression — Owner FAIL 계열이 금지어로 명시된다", () => {
  const p = buildWritingPrompt(req());
  for (const bad of ["웃음꽃", "행복 가득", "추억 가득", "힐링", "잊지 못할", "특별한 순간"]) {
    assert.ok(p.includes(bad), `금지어 명시 누락: ${bad}`);
  }
  assert.match(p, /unforgettable memories/);
  assert.match(p, /could NOT be pasted onto a different trip/);
});

test("title vs memo — 역할 분리 craft", () => {
  const t = buildWritingPrompt(req({ target: "title" }));
  assert.match(t, /NEVER a label like/);
  const m = buildWritingPrompt(req({ target: "memo", context: { city: "busan", placeName: "국제시장" } }));
  assert.match(m, /stay inside THIS one moment/i);
  assert.match(m, /came from X, heading to Y/);
});

test("draft 우선 — 사용자의 농담/표현을 밋밋하게 만들지 말라는 지시", () => {
  const p = buildWritingPrompt(req({ context: { city: "busan", draft: "국밥이 세 그릇째다" } }));
  assert.match(p, /keep their meaning/i);
  assert.match(p, /their jokes/i);
  assert.match(p, /never flatten/i);
  assert.ok(p.includes("국밥이 세 그릇째다"));
});

test("prev/next 기계 삽입 금지·사실 창작 금지 유지", () => {
  const p = buildWritingPrompt(req());
  assert.match(p, /Do NOT mention previous or next itinerary stops/);
  assert.match(p, /Do NOT invent facts/);
});

test("context enrichment — tripFacts 가 프롬프트 facts 로 들어간다(상한 포함)", () => {
  const facts = Array.from({ length: 20 }, (_, i) => `fact ${i}`);
  const p = buildWritingPrompt(req({ context: { city: "busan", tripFacts: facts } }));
  assert.ok(p.includes("- fact 0"));
  assert.ok(p.includes(`- fact ${MAX_TRIP_FACTS - 1}`));
  assert.ok(!p.includes(`- fact ${MAX_TRIP_FACTS}`), "상한 초과 facts 가 들어갔다");
});

test("deriveTripWritingFacts — 실제 일정에서만 센다(발명 0, 숙소 제외)", () => {
  const days = [
    { places: [
      { name: "Gukje Market", category: "attraction" },
      { name: "Grandma Soup", category: "restaurant" },
      { name: "Sunset Cafe", category: "cafe" },
      { name: "Hotel X", category: "accommodation", isAccommodation: true },
    ] },
    { places: [
      { name: "Haedong Yonggungsa", category: "attraction" },
      { name: "Noodle House", category: "restaurant" },
    ] },
  ];
  const f = deriveTripWritingFacts(days);
  assert.ok(f.some(x => x.includes("2 day(s), 5 stops")), JSON.stringify(f));
  assert.ok(f.some(x => x.includes("food/cafe stops: 3 of 5")));
  assert.ok(f.some(x => x.startsWith("places include:") && x.includes("Gukje Market")));
  const joined = f.join(" | ");
  assert.ok(!joined.includes("Hotel X"), "숙소명이 새 나갔다");
});

test("privacy — 프롬프트에 좌표/기기/경로 필드가 존재하지 않는다", () => {
  const src = readFileSync(join(process.cwd(), "src", "lib", "mytrip-writing", "writing-core.ts"), "utf8");
  for (const bad of ["lat", "lng", "device_id", "storage_path", "sourceKey"]) {
    assert.ok(!new RegExp(`\\b${bad}\\b`).test(src), `writing-core 에 ${bad}`);
  }
});

test("temperature — witty 는 재생성 다양성을 위해 더 높다", () => {
  assert.ok(DIRECTION_TEMPERATURE.witty > DIRECTION_TEMPERATURE.calm);
  const b = buildProviderBody("p", "witty") as { generationConfig: { temperature: number } };
  assert.equal(b.generationConfig.temperature, DIRECTION_TEMPERATURE.witty);
  const d = buildProviderBody("p") as { generationConfig: { temperature: number } };
  assert.equal(d.generationConfig.temperature, 0.7);
});

test("배선 가드 — title 은 tripFacts, memo 는 tripTitle 을 실제로 보낸다·Worker 는 direction 온도 사용", () => {
  const page = readFileSync(join(process.cwd(), "src", "app", "itinerary", "page.tsx"), "utf8");
  assert.match(page, /tripFacts: deriveTripWritingFacts\(days\)/);
  const cap = readFileSync(join(process.cwd(), "src", "components", "TripMomentCapture.tsx"), "utf8");
  assert.match(cap, /tripTitle: \(tripTitle \?\? ""\)\.trim\(\) \|\| null/);
  const worker = readFileSync(join(process.cwd(), "workers", "ai-writing", "src", "index.ts"), "utf8");
  assert.match(worker, /buildProviderBody\(prompt, direction\)/);
  const fn = readFileSync(join(process.cwd(), "functions", "api", "mytrip", "writing.ts"), "utf8");
  assert.match(fn, /buildProviderBody\(prompt, body\.direction\)/);
});
