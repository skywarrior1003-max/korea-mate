// 사용자-facing 문구에서 legacy "Memory" 제품 개념어 잔존을 막는 가드.
// 실행: node --experimental-strip-types src/lib/story/memory-copy-guard.test.ts
//
// 계약(P0-3): My Trip = 기록/편집의 본체, Story = 같은 내용의 표현. 사용자 화면 어휘는
// moment(순간/기록)와 Story 로 통일하며, 과거 "Memory" 고유명은 노출하지 않는다.
// 내부 키 이름(addMemory 등)은 안전상 유지한다 — 이 가드는 **표시 문자열 값**만 본다.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const load = (l: string) => JSON.parse(readFileSync(path.join(ROOT, "src", "messages", `${l}.json`), "utf8"));

function stringValues(o: unknown, pre = ""): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  if (o && typeof o === "object" && !Array.isArray(o)) {
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (typeof v === "string") out.push([pre + k, v]);
      else out.push(...stringValues(v, pre + k + "."));
    }
  }
  return out;
}

// EN 에서만 허용되는 예외: 어떤 컴포넌트도 참조하지 않는 dead key(제거 대신 기록 유지).
const EN_DEAD_KEYS = new Set(["trips.sectionArchive", "home.memoryTimeline"]);

test("ko/ja/zh 표시 문구에 raw 'Memory' 토큰이 없다", () => {
  for (const l of ["ko", "ja", "zh"]) {
    for (const [k, v] of stringValues(load(l))) {
      assert.ok(!/Memory/.test(v), `${l}:${k} = "${v}"`);
    }
  }
});

test("en 의 'Memory' 는 dead key 예외뿐이다", () => {
  for (const [k, v] of stringValues(load("en"))) {
    if (/Memory/.test(v)) assert.ok(EN_DEAD_KEYS.has(k), `en:${k} = "${v}"`);
  }
});
