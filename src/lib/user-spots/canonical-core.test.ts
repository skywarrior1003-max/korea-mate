// 공개 장소 → 개인 장소 계약 테스트.
//
// 지키는 것 둘. 사실 값은 서버가 DB 에서 읽는다, 그리고 내가 찍은 사진 위에
// 카탈로그 사진이 덮이지 않는다.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  mapCanonicalCategory,
  buildCanonicalSnapshot,
  pickCanonicalImage,
  USER_SPOT_CATEGORIES,
  type CanonicalRow,
  type CanonicalImageRow,
} from "./canonical-core.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const FROM  = read("functions/api/user-spots/from-canonical.ts");
const IMG   = read("functions/api/user-spots/[id]/canonical-image.ts");
const PLACE = read("src/app/place/[id]/PlaceDetailClient.tsx");
const CLIENT= read("src/lib/user-spots-api.ts");
const FORM  = read("src/components/UserSpotForm.tsx");

function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map(l => l.replace(/(^|\s)\/\/.*/, ""))
    .join("\n");
}
const C = { from: code(FROM), img: code(IMG), place: code(PLACE), client: code(CLIENT), form: code(FORM) };

const BASE: CanonicalRow = {
  id: 42, name: "Gwangalli Beach", city: "busan", category: "attraction", lat: 35.1, lng: 129.1,
};

// ── category 매핑 ─────────────────────────────────────────────────────────────

test("실데이터 3종은 전부 user_spots 5종 안에 있다", () => {
  for (const v of ["restaurant", "attraction", "nature"]) {
    assert.equal(mapCanonicalCategory(v), v, `${v} 매핑`);
    assert.ok((USER_SPOT_CATEGORIES as readonly string[]).includes(v));
  }
});

test("모르는 category 는 뭉개지 않고 거른다", () => {
  for (const v of ["cafe", "shopping", "temple", "", null, undefined, "  "]) {
    assert.equal(mapCanonicalCategory(v), null, `${String(v)} 는 null`);
  }
});

// ── snapshot ──────────────────────────────────────────────────────────────────

test("좌표 있는 장소는 좌표까지 옮긴다", () => {
  const r = buildCanonicalSnapshot(BASE);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.snapshot, {
    related_city_spot_id: 42, name: "Gwangalli Beach", category: "attraction",
    city: "busan", lat: 35.1, lng: 129.1,
  });
});

test("좌표 없는 장소도 남길 수 있다 — 경주 116곳", () => {
  const r = buildCanonicalSnapshot({ ...BASE, lat: null, lng: null, city: "gyeongju" });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.snapshot.related_city_spot_id, 42);
  assert.equal(r.snapshot.name, "Gwangalli Beach");
  assert.equal(r.snapshot.city, "gyeongju");
  assert.ok(!("lat" in r.snapshot), "좌표 키를 넣지 않는다");
  assert.ok(!("lng" in r.snapshot));
});

test("이름이 비면 옮기지 않는다", () => {
  for (const n of [null, "", "   "]) {
    const r = buildCanonicalSnapshot({ ...BASE, name: n });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "blank_name");
  }
});

test("모르는 category 는 옮기지 않는다", () => {
  const r = buildCanonicalSnapshot({ ...BASE, category: "cafe" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "unsupported_category");
});

test("좌표가 한쪽만 있으면 옮기지 않는다", () => {
  for (const [la, ln] of [[35.1, null], [null, 129.1]] as const) {
    const r = buildCanonicalSnapshot({ ...BASE, lat: la, lng: ln });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "broken_coordinates");
  }
});

test("city 가 없으면 키 자체를 넣지 않는다", () => {
  const r = buildCanonicalSnapshot({ ...BASE, city: null });
  assert.equal(r.ok, true);
  if (r.ok) assert.ok(!("city" in r.snapshot));
});

test("snapshot 은 공개·게시 관련 값을 만들지 않는다", () => {
  const r = buildCanonicalSnapshot(BASE);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  for (const k of ["city_spot_id", "submission_status", "note", "display_title", "display_memo", "photo_public"]) {
    assert.ok(!(k in r.snapshot), `snapshot 에 ${k} 없음`);
  }
});

// ── 대표 이미지 선택 ──────────────────────────────────────────────────────────

const img = (o: Partial<CanonicalImageRow> = {}): CanonicalImageRow => ({
  image_url: "https://x/a.jpg", display_eligible: true, is_primary: false,
  attribution_required: false, source_url: null, ...o,
});

test("display_eligible 인 것만 쓴다", () => {
  assert.equal(pickCanonicalImage([img({ display_eligible: false })]), null);
  assert.ok(pickCanonicalImage([img()]));
});

test("primary 를 먼저 고른다", () => {
  const p = pickCanonicalImage([
    img({ image_url: "https://x/b.jpg" }),
    img({ image_url: "https://x/p.jpg", is_primary: true }),
  ]);
  assert.equal(p?.imageUrl, "https://x/p.jpg");
});

test("primary 인데 display_eligible=false 면 쓰지 않는다", () => {
  const p = pickCanonicalImage([
    img({ image_url: "https://x/bad.jpg", is_primary: true, display_eligible: false }),
    img({ image_url: "https://x/ok.jpg" }),
  ]);
  assert.equal(p?.imageUrl, "https://x/ok.jpg");
});

test("표기가 필요한데 보여줄 출처가 없으면 쓰지 않는다", () => {
  assert.equal(pickCanonicalImage([img({ attribution_required: true, source_url: null })]), null);
  assert.equal(pickCanonicalImage([img({ attribution_required: true, source_url: "  " })]), null);
});

test("표기가 필요하고 출처가 있으면 함께 준다", () => {
  const p = pickCanonicalImage([img({ attribution_required: true, source_url: "https://src" })]);
  assert.equal(p?.imageUrl, "https://x/a.jpg");
  assert.equal(p?.sourceUrl, "https://src");
});

test("표기가 필요 없으면 출처를 붙이지 않는다", () => {
  const p = pickCanonicalImage([img({ attribution_required: false, source_url: "https://src" })]);
  assert.equal(p?.sourceUrl, null);
});

test("rights_status 문자열로 허용 여부를 정하지 않는다", () => {
  // 그런 필드를 아예 받지 않는다 — 값이 하나 늘어도 이 함수는 흔들리지 않는다
  assert.ok(!C.img.includes("rights_status"), "endpoint 가 rights_status 를 읽지 않는다");
  assert.ok(!code(read("src/lib/user-spots/canonical-core.ts")).includes("rights_status"),
    "core 실행부에도 없다");
});

test("빈 URL 은 이미지가 아니다", () => {
  assert.equal(pickCanonicalImage([img({ image_url: "   " })]), null);
});

// ── endpoint 계약 ─────────────────────────────────────────────────────────────

test("사실 값은 서버가 city_spots 에서 읽는다", () => {
  assert.match(C.from, /\.from\("city_spots"\)[\s\S]{0,120}\.select\("id, name, city, category, lat, lng"\)/);
  assert.match(C.from, /buildCanonicalSnapshot\(canonical/);
});

test("클라이언트가 보낸 사실 값을 읽지 않는다", () => {
  for (const k of ["name", "lat", "lng", "city", "category", "related_city_spot_id"]) {
    assert.ok(!new RegExp(`body\\.${k}\\b`).test(C.from), `body.${k} 를 읽지 않는다`);
  }
  assert.ok(C.from.includes("body.city_spot_id"), "id 하나만 받는다");
});

test("안정적인 error code 를 준다", () => {
  assert.match(C.from, /CANONICAL_PLACE_NOT_FOUND[\s\S]{0,20}404/);
  assert.match(C.from, /CANONICAL_PLACE_NOT_USABLE[\s\S]{0,20}400/);
});

test("게시 상태와 공개 절차를 건드리지 않는다", () => {
  // INSERT 로 넣는 객체만 본다. 응답 select 목록에는 submission_status 가
  // 정상적으로 들어 있어서 파일 전체를 훑으면 그것까지 걸린다.
  const row = C.from.slice(C.from.indexOf("const row: Record"), C.from.indexOf(".insert(row)"));
  for (const k of ["city_spot_id:", "submission_status", "published_at", "note:",
                   "display_title", "display_memo"]) {
    assert.ok(!row.includes(k), `INSERT 객체에 ${k} 없음`);
  }
  assert.match(row, /photo_public: false/);
  assert.ok(row.includes("...built.snapshot"), "사실 값은 snapshot 에서만 온다");
});

test("응답에 storage path 를 담지 않는다", () => {
  const sel = C.from.match(/\.select\("(id, name[^"]+)"\)/);
  assert.ok(sel, "select 목록");
  assert.ok(!sel![1]!.includes("photo_storage_path"));
});

test("중복을 DB 로 막지 않는다", () => {
  assert.ok(!/unique/i.test(C.from), "UNIQUE·중복검사 없음");
  assert.ok(!/already/i.test(C.from), "이미 있음 류 거부 없음");
});

test("내 사진이 있으면 장소 사진을 주지 않는다", () => {
  assert.match(C.img, /row\.photo_storage_path === "string"[\s\S]{0,180}has_own_photo/,
    "개인 사진이 있으면 즉시 반환");
  const own   = C.img.indexOf("has_own_photo");
  // import 가 아니라 호출부를 본다.
  const pick  = C.img.indexOf("pickCanonicalImage(rows)");
  const query = C.img.indexOf('.from("city_spot_images")');
  assert.ok(own >= 0 && pick >= 0 && query >= 0, "세 지점이 모두 있어야 한다");
  assert.ok(own < query, "이미지를 조회하기도 전에 막는다");
  assert.ok(own < pick,  "고르기 전에 막는다");
});

test("관계가 없으면 좌표로 장소를 추측하지 않는다", () => {
  assert.match(C.img, /related_city_spot_id === null[\s\S]{0,80}no_relation/);
  // 단어 경계로 본다 — "related" 안의 lat 같은 부분 문자열에 걸리면 안 된다.
  for (const k of ["lat", "lng", "distance", "proximity", "nearby"]) {
    assert.ok(!new RegExp(`\\b${k}\\b`).test(C.img), `${k} 로 이미지를 고르지 않는다`);
  }
  assert.ok(!C.img.includes("ST_"), "PostGIS 거리 함수 사용 0");
});

test("legacy city_spots.image_url 을 쓰지 않는다", () => {
  assert.ok(!C.img.includes("image_url\"") || C.img.includes("city_spot_images"), "출처는 city_spot_images");
  assert.ok(!/from\("city_spots"\)/.test(C.img), "canonical-image 는 city_spots 를 직접 읽지 않는다");
});

test("이미지 조회는 관계당 한 번이다", () => {
  assert.equal((C.img.match(/\.from\("city_spot_images"\)/g) ?? []).length, 1);
  assert.match(C.img, /city_spot_sources\(source_url\)/, "출처를 같은 쿼리로 가져온다");
});

// ── 화면 계약 ─────────────────────────────────────────────────────────────────

test("Saved 와 다른 액션이다", () => {
  assert.ok(C.place.includes("handleKeepAsMyPlace"), "전용 핸들러");
  assert.ok(C.place.includes("apiCreateUserSpotFromCanonical"), "전용 API");
  // toggleFavorite 이 My Place 를 만들지 않는다
  const save = C.place.slice(C.place.indexOf("function handleSave"), C.place.indexOf("function handleKeepAsMyPlace"));
  assert.ok(!save.includes("apiCreateUserSpotFromCanonical"), "Saved 가 기록을 만들지 않는다");
});

test("연타로 두 번 저장되지 않는다", () => {
  assert.match(C.place, /if \(keeping\) return;/);
  assert.match(C.place, /disabled=\{keeping\}/);
});

test("데스크톱과 모바일 양쪽에 배치했다", () => {
  assert.equal((C.place.match(/\{keepAsMyPlaceAction\}/g) ?? []).length, 2);
  assert.match(C.place, /md:hidden">\{keepAsMyPlaceAction\}/, "모바일은 본문");
});

test("클라이언트는 canonical id 만 보낸다", () => {
  const fn = C.client.slice(C.client.indexOf("apiCreateUserSpotFromCanonical"));
  assert.match(fn, /JSON\.stringify\(\{ city_spot_id: citySpotId \}\)/);
});

test("폼은 내 사진이 없을 때만 장소 사진을 보여준다", () => {
  assert.match(C.form, /const shownCanonical = !shownPhoto \? canonicalImageUrl : null/);
});

test("출처 링크는 외부 링크 정책을 따른다", () => {
  assert.match(C.form, /target="_blank"[\s\S]{0,60}rel="noopener noreferrer"/);
});

test("내부 권리 메모를 사용자에게 보여주지 않는다", () => {
  for (const src of [C.form, C.img, C.client]) {
    assert.ok(!src.includes("rights_note"), "rights_note 노출 0");
  }
});
