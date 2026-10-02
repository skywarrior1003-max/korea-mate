// 가져오기 확인 화면 — AI 가 빠뜨린 장소를 저장 전에 사용자가 직접 더한다 (2026-10-02)
// node --experimental-strip-types --test src/lib/url-import/import-add-missing-guard.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const UI = readFileSync(join(ROOT, "src", "components", "importer", "ImportClient.tsx"), "utf8").replace(/\r\n/g, "\n");

test("확인 화면·저장은 AI 결과 + 사용자가 더한 장소를 함께 쓴다", () => {
  assert.match(UI, /analysis\.days\.map\(d => \(\{ \.\.\.d, stops: \[\.\.\.d\.stops, \.\.\.\(added\[d\.day_number\] \?\? \[\]\)\] \}\)\)/);
  assert.match(UI, /saveTrip\(daysWithAdded\)/);
});

test("더한 장소는 그 Day 끝에만 붙고 AI 항목의 순서·시각은 건드리지 않는다", () => {
  const fn = UI.slice(UI.indexOf("function addMissing("), UI.indexOf("function addMissing(") + 1200);
  assert.match(fn, /\[\.\.\.\(prev\[dayNumber\] \?\? \[\]\), \{ name, time, end_time: null, time_text: null, note: null \}\]/);
  assert.match(fn, /if \(exists\) \{ setAddDup\(dayNumber\); return; \}/, "같은 Day 의 같은 이름은 더하지 않는다");
  assert.doesNotMatch(fn, /analysis\.days\s*=|\.sort\(/, "AI 결과를 고치거나 다시 정렬하지 않는다");
});

test("새 분석이면 더한 장소를 비운다 · 4개 언어 문구", () => {
  assert.match(UI, /setAdded\(\{\}\); setAddDraft\(\{\}\); setAddDup\(null\);/);
  for (const l of ["ko", "en", "ja", "zh"]) {
    const m = JSON.parse(readFileSync(join(ROOT, "src", "messages", `${l}.json`), "utf8")).importer;
    for (const k of ["addMissingLabel", "addMissingPlaceholder", "addMissingTime", "addMissingButton", "addMissingDup", "userAddedBadge", "removeAdded"]) assert.ok(m[k], `${l}.${k}`);
  }
});
