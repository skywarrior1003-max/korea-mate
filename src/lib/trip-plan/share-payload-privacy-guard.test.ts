// 공개한 일정에 개인 메모가 실려 나가지 않는다.
//
// 무엇이 있었나
//   저장할 때마다 This Trip 을 통째로 `days.unscheduled` 에 넣고 있었다.
//   그 일정을 공개하면 `get_shared_itinerary` 가 `days` 전체를 돌려주므로,
//   링크를 아는 누구에게나 그 목록이 함께 나갔다. My Place 를 This Trip 에
//   담았다면 그 장소의 **비공개 메모까지** 공개 응답에 실렸다.
//   운영에서 실제로 재현했다 — 공개 payload 안에서 메모 문자열이 나왔다.
//
//   공개 미리보기 화면은 그때도 "사진과 메모는 비공개로 유지됩니다" 라고
//   적고 있었다. 약속과 payload 가 달랐다.
//
// 어떻게 막나
//   그 필드에 아무것도 담지 않는다. 읽는 곳이 하나도 없으므로(reopen 이
//   이것으로 cart 를 덮어쓰던 경로를 없앤 뒤) 잃는 기능이 없고, 저장 형식은
//   그대로라 기존 레코드도 계속 읽힌다.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "")
   .split("\n").filter(l => !l.trimStart().startsWith("//")).join("\n");

const ITIN = read("src", "app", "itinerary", "page.tsx");
const CODE = strip(ITIN);

test("★공개되는 일정에 This Trip 목록을 담지 않는다", () => {
  assert.match(CODE, /const snapUnscheduled: CartItem\[\] = \[\];/);
  // 저장 직전에 cart 를 읽어 담던 경로가 사라졌다
  assert.doesNotMatch(CODE, /snapUnscheduled = getCityCart\(/);
});

test("★저장 형식은 그대로다 — 기존 레코드가 계속 읽힌다", () => {
  assert.match(CODE, /days:\s*\{\s*__v:\s*2,\s*scheduled:\s*snapDays,\s*unscheduled:\s*snapUnscheduled\s*\}/);
  assert.doesNotMatch(CODE, /__v:\s*3/);
  // v2 를 읽는 쪽도 그대로
  assert.match(CODE, /\{\s*scheduled:\s*Day\[\];\s*unscheduled:\s*CartItem\[\];?\s*\}/);
});

test("★일정 안의 장소는 개인 필드를 갖지 않는다", () => {
  // days 에 넣는 Place 를 만드는 지점에 note·memo·device 를 싣지 않는다
  const build = CODE.slice(CODE.indexOf("cartSnapshot:"), CODE.indexOf("cartSnapshot:") + 400);
  for (const bad of [/\bnote:/, /displayMemo/, /device_id/, /deviceId/]) {
    assert.doesNotMatch(build, bad, String(bad));
  }
});

test("★공개 응답 컬럼 계약에 소유권 필드가 없다", () => {
  // RPC 정의는 마이그레이션에 있다. 공개로 나가는 컬럼을 여기서 못 박는다.
  const sql = read("supabase", "migrations", "022_itinerary_is_public.sql");
  const block = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.get_shared_itinerary"),
                          sql.indexOf("LANGUAGE plpgsql"));
  for (const bad of ["device_id", "email", "is_public", "copy_of"]) {
    assert.ok(!new RegExp(`\\b${bad}\\b`).test(block), `공개 컬럼에 ${bad} 가 있다`);
  }
  for (const need of ["id", "city", "days", "trip_title"]) {
    assert.ok(new RegExp(`\\b${need}\\b`).test(block), `${need} 가 빠졌다`);
  }
});

test("★공개 미리보기가 약속하는 문구가 네 언어에 그대로 있다", () => {
  for (const locale of ["en", "ko", "ja", "zh"]) {
    const pub = JSON.parse(read("src", "messages", `${locale}.json`)).publish;
    for (const k of ["privateTitle", "noDeviceInfo"]) {
      assert.equal(typeof pub?.[k], "string", `${locale}.publish.${k}`);
      assert.ok(pub[k].trim().length > 0, `${locale}.publish.${k} 가 비었다`);
    }
  }
});
