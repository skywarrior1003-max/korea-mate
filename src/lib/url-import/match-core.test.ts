// 가져오기 장소 연결 가드 (EXTERNAL-TRIP-IMPORT-V2)
// 실행: node --experimental-strip-types --test src/lib/url-import/match-core.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlaceMatcher } from "./match-core.ts";

// Production city_spots 실측 표기(2026-09-30) — 동백섬은 오염 표기 1건 + "해운대 동백섬" 1건
const SPOTS = [
  { id: 37, city: "busan", name: "Dongbaekseom Island: Where Natural Beauty and History Come Together", nameL10n: { ko: "동백섬(한,영,중간,중번,일)" } },
  { id: 1228, city: "busan", name: "Haeundae Dongbaekseom Island", nameL10n: { ko: "해운대 동백섬" } },
  { id: 1460, city: "busan", name: "미포정거장", nameL10n: { ko: "미포정거장" } },
  { id: 39, city: "busan", name: "Cheongsapo Daritdol Observatory", nameL10n: { ko: "청사포 다릿돌전망대" } },
  { id: 966, city: "busan", name: "An art museum next to BEXCO, the Busan Museum of Art", nameL10n: { ko: "부산시립미술관" } },
  { id: 1243, city: "busan", name: "동백공원", nameL10n: { ko: "동백공원" } },
  { id: 500, city: "seoul", name: "공원", nameL10n: { ko: "공원" } },
];
const match = buildPlaceMatcher(SPOTS);

test("정확히 같은 이름은 자동 연결", () => {
  assert.deepEqual(match("청사포 다릿돌전망대", "busan")?.spot.id, 39);
  assert.equal(match("청사포 다릿돌전망대", "busan")?.kind, "exact");
  assert.equal(match("부산시립미술관", "busan")?.spot.id, 966);
});

test("수식어만 다른 이름은 제안만 — 자동 연결하지 않는다", () => {
  const a = match("해운대블루라인파크 미포정거장", "busan");
  assert.equal(a?.spot.id, 1460);
  assert.equal(a?.kind, "suggest");
  const b = match("동백섬", "busan");
  assert.equal(b?.spot.id, 1228);
  assert.equal(b?.kind, "suggest");
});

test("애매하면 연결하지 않는다 · 짧은 일반명사 제안 금지 · 도시 범위", () => {
  assert.equal(match("강릉 안목해변 카페거리", "강릉"), null);
  assert.equal(match("바다 공원", "busan"), null, "다른 도시의 '공원'에 붙지 않는다");
  assert.equal(match("x", "busan"), null);
});
