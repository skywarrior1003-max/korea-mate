// UGC-DELETE-PROPAGATION-V1 — 삭제 전파·제보 철회 소스 계약 가드
// 실행: node --experimental-strip-types src/lib/community/ugc-delete-propagation-guard.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter(l => !l.trimStart().startsWith("//")).join("\n");

test("itinerary DELETE — orphan 정리 3종이 Storage 뒤·행 삭제 앞에 있다", () => {
  const src = read("functions/api/itinerary/[id].ts");
  const del = src.slice(src.indexOf("export async function onRequestDelete"));
  for (const t of ["content_likes", "content_dislikes", "story_submissions"]) {
    assert.ok(del.includes(`"${t}"`), `${t} 정리 누락`);
  }
  // 순서: Storage 삭제 → 정리 → trip_moments → itineraries
  const storageIdx = del.indexOf("removeItineraryStorage");
  const cleanupIdx = del.indexOf('"content_likes"');
  const momentsIdx = del.indexOf("momDelErr"); // 4단계 수집 select 가 아니라 삭제 지점
  const itinIdx = del.lastIndexOf('from("itineraries")');
  assert.ok(storageIdx > 0 && storageIdx < cleanupIdx, "정리가 Storage-first 계약보다 앞");
  assert.ok(cleanupIdx < momentsIdx && momentsIdx < itinIdx, "정리→moments→itinerary 순서");
  // 대상 조건 — 068 CHECK 전체 집합과 소문자 key 계약
  assert.ok(del.includes('["itinerary", "story"]'), "target_type 집합이 068 CHECK 와 어긋남");
  assert.ok(del.includes("id.toLowerCase()"), "target_key 소문자 저장 계약");
  // 실패 시 원문 미출력 — 단계·코드만
  assert.ok(!/cleanupErr\.message|storage_path.*console/.test(del), "실패 로그에 원문 금지");
});

test("제보 철회 API — 소유 재계산·pending 전용·경합 재검", () => {
  const src = read("functions/api/place-suggestion/[id].ts");
  assert.ok(src.includes('actorKey("share"'), "suggester_key 재계산(제출과 동일 방식)이 아니다");
  assert.ok(src.includes('fail("not_found", 404)'), "타인·미존재 404");
  assert.ok(src.includes('"already_decided"'), "결정된 제보 409 계약");
  assert.ok(src.includes("status=eq.pending"), "DELETE WHERE 에 pending 재확인(경합 방어)이 없다");
  // 응답·로그에 해시 미노출
  assert.ok(!/json\([^)]*suggester_key/.test(src), "응답에 suggester_key 금지");
  assert.ok(!/console\.log\([^)]*suggester_key|console\.log\([^)]*mine/.test(src), "로그에 해시 금지");
  // city_spots 무접촉(코드 기준 — 주석의 설명 문구는 제외)
  assert.ok(!strip(src).includes("city_spots"), "철회는 canonical 을 건드리지 않는다");
});

test("제보 목록 GET — 본인 축 해시 조회·해시 미반환", () => {
  const src = read("functions/api/place-suggestion.ts");
  const get = src.slice(src.indexOf("export async function onRequestGet"));
  assert.ok(get.includes('actorKey("share"'), "본인 판정은 동일 해시 재계산");
  assert.ok(get.includes("select=id,name,status,created_at"), "select 는 화면 필요 필드만");
  assert.ok(!get.includes("select=*") && !/select=[^&"`]*suggester_key/.test(get), "suggester_key 반환 금지");
});

test("Sheet — 내 제보 섹션·철회 confirm·목록 반영", () => {
  const src = read("src/components/community/SuggestPlaceSheet.tsx");
  assert.ok(src.includes("loadMine"), "목록 로드가 없다");
  assert.ok(src.includes('t("suggestWithdrawConfirmBody")'), "철회 확인 안내(공식 등록 무영향)가 없다");
  assert.ok(src.includes("setMine(prev => prev.filter"), "성공 시 목록 즉시 제거");
  assert.ok(src.includes('m.status === "pending"'), "pending 에만 철회 버튼");
  assert.ok(!src.includes("suggester_key"), "클라이언트에 해시 개념 유입 금지");
});

test("4locale — 철회 문구 6키", () => {
  const KEYS = ["mySuggestionsTitle", "suggestWithdraw", "suggestWithdrawConfirmBody",
    "suggestWithdrawConfirmYes", "suggestStatusAccepted", "suggestStatusDeclined"];
  for (const l of ["en", "ko", "ja", "zh"]) {
    const m = JSON.parse(read(`src/messages/${l}.json`)) as Record<string, Record<string, string>>;
    for (const k of KEYS) assert.ok(typeof m.community?.[k] === "string" && m.community[k].length > 0, `${l}.community.${k}`);
  }
});

test("place_usage — 이번 변경이 손대지 않았다(비소급 계약 유지)", () => {
  const usage = read("functions/api/place-usage.ts");
  assert.ok(!usage.includes(".delete()") && !/decrement|감소/.test(usage), "place_usage 감소·삭제 금지");
  const itin = read("functions/api/itinerary/[id].ts");
  assert.ok(!itin.includes("place_usage"), "itinerary 삭제가 usage 를 소급하지 않는다");
});
