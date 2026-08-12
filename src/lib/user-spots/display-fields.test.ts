// migration 050 과 owner API 의 개인 필드 계약 테스트.
//
// 이 파일이 지키는 것은 하나다 — 개인적인 값이 공개 경로로 새지 않는다.
// name 과 note 는 이미 공개로 나가는 값이고, 그래서 개인 제목·기록은
// 자기 컬럼을 따로 갖는다. 그 분리가 코드에 남아 있는지 확인한다.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT   = join(import.meta.dirname, "..", "..", "..");
const read   = (p: string) => readFileSync(join(ROOT, p), "utf8");

const MIG050 = read("supabase/migrations/050_user_spots_canonical_display_foundation.sql");
const MIG049 = read("supabase/migrations/049_user_spots_photo_anchor.sql");
const RPC    = read("supabase/migrations/048_user_spots_photo_privacy_foundation.sql");
const LIST   = read("functions/api/user-spots.ts");
const SPOTID = read("functions/api/user-spots/[id].ts");
const SUBMIT = read("functions/api/user-spots/submit/[id].ts");
const ADMIN  = read("functions/api/admin/user-spots.ts");
const CLIENT = read("src/lib/user-spots-api.ts");

/** SQL 실행부만 남긴다 (주석 줄 제거). */
function sql(src: string): string {
  return src.split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith("--")).join("\n");
}
/** TS 실행부만 남긴다. CRLF 파일에서 `$` 는 쓰지 않는다 — \r 이 line terminator 다. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map(l => l.replace(/(^|\s)\/\/.*/, ""))
    .join("\n");
}
const SQL050 = sql(MIG050);
/**
 * "이 토큰이 없어야 한다" 류 검사는 COMMENT ON 의 설명 문자열까지 빼고 한다.
 * 컬럼 설명에 "note 와 분리된다" 라고 적어 두면 그 문장이 검사에 걸린다.
 */
const SQL050_EXEC = SQL050.replace(/COMMENT ON [\s\S]*?;\s*/g, "");
const C = { list: code(LIST), spotId: code(SPOTID), admin: code(ADMIN), client: code(CLIENT) };

// ── migration 안전성 ──────────────────────────────────────────────────────────

test("050 은 추가만 한다", () => {
  const U = SQL050.toUpperCase();
  assert.equal((U.match(/BEGIN;/g) ?? []).length, 1);
  assert.equal((U.match(/COMMIT;/g) ?? []).length, 1);
  assert.ok(!/\b(UPDATE|DELETE FROM|INSERT INTO|TRUNCATE|DROP TABLE|DROP COLUMN)\b/.test(U), "데이터 변경 금지");
  assert.ok(!U.includes("POLICY") && !U.includes("ROW LEVEL SECURITY"), "RLS 무변경");
  assert.ok(!U.includes("FUNCTION"), "RPC 무변경");
  assert.ok(!U.includes("MIN_IDENTITY_CHK"), "049 CHECK 무변경");
  assert.ok(!U.includes("PHOTO_PUBLIC_REQUIRES_PHOTO_CHK") && !U.includes("PHOTO_STORAGE_PATH_CHK"),
    "사진 privacy CHECK 무변경");
  assert.ok(!U.includes("LATLNG_PAIR_CHK"), "좌표 짝 CHECK 무변경");
});

test("050 이 건드리는 테이블은 user_spots 하나뿐", () => {
  const U = SQL050.toUpperCase();
  const altered = new Set([...U.matchAll(/ALTER TABLE PUBLIC\.([A-Z_]+)/g)].map(m => m[1]));
  assert.deepEqual([...altered], ["USER_SPOTS"]);
  // FK 참조로 city_spots 를 가리키는 것은 변경이 아니다
  assert.ok(U.includes("REFERENCES PUBLIC.CITY_SPOTS(ID)"), "FK 대상");
});

test("관계는 BIGINT · nullable · SET NULL · UNIQUE 없음", () => {
  assert.match(SQL050, /related_city_spot_id BIGINT/);
  assert.match(SQL050, /REFERENCES public\.city_spots\(id\) ON DELETE SET NULL/);
  assert.ok(!/UNIQUE/i.test(SQL050_EXEC), "UNIQUE 금지 — 여러 개인 장소가 같은 공개 장소를 가리킬 수 있어야 한다");
  // "IS NOT NULL"(인덱스 조건·CHECK) 은 컬럼 제약이 아니다.
  assert.ok(!/(?<!IS )NOT NULL/i.test(SQL050_EXEC), "신규 컬럼은 전부 nullable");
});

test("관계 인덱스는 값이 있는 행만 담는다", () => {
  assert.match(SQL050, /CREATE INDEX IF NOT EXISTS user_spots_related_city_spot_idx[\s\S]{0,120}WHERE related_city_spot_id IS NOT NULL/);
});

test("display_title 은 300, display_memo 는 1000", () => {
  assert.match(SQL050, /user_spots_display_title_chk[\s\S]{0,200}char_length\(display_title\) <= 300/);
  assert.match(SQL050, /user_spots_display_memo_chk[\s\S]{0,200}char_length\(display_memo\) <= 1000/);
});

test("공백만 있는 값은 값이 아니다", () => {
  for (const c of ["display_title", "display_memo"]) {
    assert.ok(SQL050.includes(`BTRIM(${c}) <> ''`), `${c}: blank 금지`);
    assert.ok(SQL050.includes(`${c} IS NULL`), `${c}: NULL 허용`);
  }
});

test("049 파일은 이번에 손대지 않았다", () => {
  assert.ok(MIG049.includes("photo_storage_path IS NOT NULL"), "049 의 photo 항 유지");
  assert.ok(MIG049.includes("user_spots_min_identity_chk"), "049 제약 이름 유지");
});

// ── owner API ─────────────────────────────────────────────────────────────────

test("owner GET 이 세 필드를 돌려준다", () => {
  for (const [name, src] of [["목록", C.list], ["단건", C.spotId]] as const) {
    const sel = src.match(/\.select\("(id, name[^"]+)"\)/);
    assert.ok(sel, `${name}: select 목록`);
    for (const f of ["related_city_spot_id", "display_title", "display_memo"]) {
      assert.ok(sel![1]!.includes(f), `${name}: ${f} 포함`);
    }
  }
});

test("storage path 는 여전히 응답에 담기지 않는다", () => {
  for (const src of [C.list, C.spotId]) {
    // select 에는 있지만 destructure 로 걷어낸 뒤 내보낸다
    assert.match(src, /photo_storage_path: _path, \.\.\.rest/);
    assert.equal(src.match(/json\(\s*\{[^}]*photo_storage_path[^}]*\}/), null);
  }
});

test("PUT 은 display 두 필드만 3-state 로 연다", () => {
  assert.match(C.spotId, /nullableStr\(body\.display_title,\s*300\)/);
  assert.match(C.spotId, /nullableStr\(body\.display_memo,\s*1000\)/);
  assert.match(C.spotId, /if \(dTitle !== undefined\) row\.display_title = dTitle/);
  assert.match(C.spotId, /if \(dMemo  !== undefined\) row\.display_memo  = dMemo/);
});

test("서버 상한이 DB CHECK 상한과 같다", () => {
  const t = C.spotId.match(/nullableStr\(body\.display_title,\s*(\d+)\)/);
  const m = C.spotId.match(/nullableStr\(body\.display_memo,\s*(\d+)\)/);
  assert.equal(t?.[1], "300",  "title 상한 일치");
  assert.equal(m?.[1], "1000", "memo 상한 일치");
});

test("클라이언트가 관계를 임의로 바꿀 수 없다", () => {
  assert.ok(!/body\.related_city_spot_id/.test(C.spotId), "PUT 에서 수용 금지");
  assert.ok(!/body\.related_city_spot_id/.test(C.list),   "POST 에서 수용 금지");
  assert.ok(!/formData\.get\("related_city_spot_id"\)/.test(code(read("functions/api/user-spots/with-photo.ts"))),
    "with-photo 에서도 수용 금지");
});

test("생성 입력에는 아직 개인 필드를 열지 않는다", () => {
  const create = C.client.slice(C.client.indexOf("export interface CreateUserSpotInput"),
                                C.client.indexOf("export interface UpdateUserSpotInput"));
  for (const f of ["display_title", "display_memo", "related_city_spot_id"]) {
    assert.ok(!create.includes(f), `CreateUserSpotInput 에 ${f} 없음`);
  }
});

test("client 타입이 세 필드를 갖는다", () => {
  assert.match(C.client, /related_city_spot_id\?: number \| null/);
  assert.match(C.client, /display_title\?:\s*string \| null/);
  assert.match(C.client, /display_memo\?:\s*string \| null/);
});

// ── 공개 오염 방지 ────────────────────────────────────────────────────────────

test("publish RPC 는 신규 컬럼을 읽지 않는다", () => {
  const live = sql(RPC);
  const sel  = live.slice(live.indexOf("SELECT\n"), live.indexOf("FROM public.user_spots"));
  for (const f of ["display_title", "display_memo", "related_city_spot_id"]) {
    assert.ok(!sel.includes(f), `RPC SELECT 에 ${f} 없음`);
    assert.ok(!live.includes(f), `RPC 어디에도 ${f} 없음`);
  }
});

test("publish overrides allowlist 에 신규 컬럼이 없다", () => {
  const live = sql(RPC);
  const allow = live.slice(live.indexOf("WHERE k NOT IN"), live.indexOf("USER_SPOT_INVALID_OVERRIDE"));
  for (const f of ["display_title", "display_memo", "related_city_spot_id"]) {
    assert.ok(!allow.includes(f), `allowlist 에 ${f} 없음`);
  }
});

test("개인 제목이 공개 이름으로 가는 경로가 없다", () => {
  const live = sql(RPC);
  // city_spots INSERT 의 name 값은 v_name 하나뿐이고, v_name 은 name/overrides 에서만 온다
  assert.match(live, /v_name\s*:=\s*NULLIF\(BTRIM\(COALESCE\(p_overrides->>'name',\s*v_orig_name\)\)/);
  assert.ok(!live.includes("display_title"));
});

test("개인 기록이 공개 설명으로 가는 경로가 없다", () => {
  const live = sql(RPC);
  assert.match(live, /v_description\s*:=\s*NULLIF\(BTRIM\(COALESCE\(p_overrides->>'description',\s*v_orig_note\)\)/);
  assert.ok(!live.includes("display_memo"));
});

test("관계가 게시 상태로 해석되지 않는다", () => {
  // 게시 판정은 city_spot_id 하나뿐이다
  for (const src of [C.admin, C.list, C.spotId]) {
    assert.ok(!/related_city_spot_id[\s\S]{0,40}(published|city_spot_id)/i.test(src),
      "관계와 게시 상태를 같이 판정하는 코드가 없다");
  }
  assert.ok(!C.admin.includes("related_city_spot_id"), "admin 은 관계를 모른다");
});

test("admin 은 개인 기록을 가져가지 않는다", () => {
  // 명시 select 라 신규 컬럼이 자동으로 딸려가지 않는다
  assert.ok(!/select=\*/.test(C.admin), "select=* 금지");
  for (const f of ["display_title", "display_memo"]) {
    assert.ok(!C.admin.includes(f), `admin select 에 ${f} 없음`);
  }
});

test("note 와 photo privacy 계약은 그대로", () => {
  assert.ok(C.list.includes("body.note"),   "POST note 유지");
  assert.ok(C.spotId.includes("body.note"), "PUT note 유지");
  assert.ok(!SQL050_EXEC.includes("note"),         "050 은 note 를 건드리지 않는다");
  assert.ok(!SQL050_EXEC.includes("photo_public"), "050 은 photo_public 을 건드리지 않는다");
  assert.ok(SUBMIT.includes("Add a name before submitting"), "공개 검토 게이트는 여전히 name 을 요구한다");
});

// ── 향후 AI write 계약 (구현 없음, 문서 고정) ─────────────────────────────────

test("개인 필드는 검증된 사용자 입력으로만 채워진다", () => {
  // row.display_* 에 대입하는 곳은 nullableStr 결과(dTitle·dMemo) 뿐이어야 한다.
  const assigns = [...C.spotId.matchAll(/row\.(display_title|display_memo)\s*=\s*(\w+)/g)]
    .map(m => [m[1], m[2]] as const);
  assert.deepEqual(assigns, [["display_title", "dTitle"], ["display_memo", "dMemo"]]);
  // 생성 경로는 아직 개인 필드를 쓰지 않는다.
  assert.ok(!/row\.display_/.test(C.list), "POST 는 개인 필드를 쓰지 않는다");
});

test("AI enrichment route 는 두 컬럼만 쓴다", () => {
  // route 가 생겼다. 계약 검증은 enrichment-core.test.ts 가 맡고,
  // 여기서는 이 파일의 관심사 — 개인 값이 공개로 새지 않는가 — 만 본다.
  const enrich = readFileSync(join(ROOT, "functions/api/user-spots/[id]/enrich.ts"), "utf8");
  const updates = [...code(enrich).matchAll(/\.update\(\{([^}]*)\}/g)].map(m => m[1]!);
  assert.ok(updates.length > 0, "UPDATE 가 있어야 한다");
  for (const u of updates) {
    for (const k of ["note", "city_spot_id", "submission_status", "photo_public"]) {
      assert.ok(!u.includes(k), `enrich UPDATE 에 ${k} 없음`);
    }
  }
});
