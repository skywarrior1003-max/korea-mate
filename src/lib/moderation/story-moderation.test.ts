// 공개 Story 신고와 관리자 숨김 — 계약·보안 테스트
//
// 여기서 지키는 것은 네 가지다.
//   1. 신고는 아무것도 가리지 않는다. 몇 건이 쌓여도 자동으로 가려지지 않는다.
//   2. 가리면 바깥으로 나가는 길이 **전부** 닫힌다 — 한 곳이라도 남으면 무의미하다.
//   3. 가려도 사용자의 것은 지워지지 않는다. Memory 의 공개 선택과 동의 기록은 그대로다.
//   4. 관리자가 가린 것을 만든 사람이 되돌려 켤 수 없다.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

import {
  STORY_TARGET_TYPE,
  STORY_REPORT_CATEGORIES,
  REPORT_NOTE_MAX,
  parseStoryReport,
  isModerationHidden,
  isPubliclyVisible,
  canAcceptReport,
  publishVerdict,
  buildModerationPatch,
} from "./story-moderation-core.ts";

/** 주석을 걷어낸 실제 코드. 설명문이 검사에 걸리지 않게 한다. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}
const read = (p: string) => readFileSync(p, "utf8");

const REPORT_FN_PATH = "functions/api/story-report.ts";
const ADMIN_FN_PATH  = "functions/api/admin/story-moderation.ts";
const ADMIN_UI_PATH  = "src/app/korea-mate-admin/place-reports/page.tsx";
const STORY_UI_PATH  = "src/components/story/StoryReport.tsx";
const MIGRATION_PATH = "supabase/migrations/054_story_reports_and_moderation.sql";

const reportFn = code(read(REPORT_FN_PATH));
const adminFn  = code(read(ADMIN_FN_PATH));
const adminUi  = code(read(ADMIN_UI_PATH));
const storyUi  = code(read(STORY_UI_PATH));

const UUID_A = "11111111-2222-3333-4444-555555555555";

// ── P: 신고 요청 읽기 ────────────────────────────────────────────────────────

test("P1 정상 요청을 읽는다", () => {
  const r = parseStoryReport({ target_key: UUID_A, category: "privacy_concern", note: " 사진에 제 얼굴이 " });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.targetKey, UUID_A);
  assert.equal(r.category, "privacy_concern");
  assert.equal(r.note, "사진에 제 얼굴이");
});

test("P2 대상은 UUID 하나뿐 — Memory·사진 내부 id 를 받지 않는다", () => {
  for (const bad of ["", "not-a-uuid", "1", "moment-abc", UUID_A + "x"]) {
    const r = parseStoryReport({ target_key: bad, category: "other" });
    assert.equal(r.ok, false, `허용되면 안 되는 대상: ${bad}`);
  }
  // 요청 스키마에 Memory·사진 식별자 자리가 아예 없다
  const core = read("src/lib/moderation/story-moderation-core.ts");
  assert.ok(!/moment_id|photo_id|storage_path/.test(code(core)));
});

test("P3 모르는 사유는 거절한다", () => {
  for (const bad of ["hate", "", null, 42, "CITY_SPOT"]) {
    assert.equal(parseStoryReport({ target_key: UUID_A, category: bad }).ok, false);
  }
  for (const good of STORY_REPORT_CATEGORIES) {
    assert.equal(parseStoryReport({ target_key: UUID_A, category: good }).ok, true);
  }
});

test("P4 긴 상세 설명은 조용히 자르지 않고 거절한다", () => {
  const ok = parseStoryReport({ target_key: UUID_A, category: "other", note: "가".repeat(REPORT_NOTE_MAX) });
  assert.equal(ok.ok, true);
  const over = parseStoryReport({ target_key: UUID_A, category: "other", note: "가".repeat(REPORT_NOTE_MAX + 1) });
  assert.equal(over.ok, false);
  if (!over.ok) assert.equal(over.status, 400);
});

test("P5 빈 상세 설명은 null 로 남는다 — 빈 문자열을 저장하지 않는다", () => {
  for (const v of [undefined, null, "", "   "]) {
    const r = parseStoryReport({ target_key: UUID_A, category: "other", note: v });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.note, null);
  }
});

test("P6 body 가 객체가 아니면 거절한다", () => {
  for (const bad of [null, "x", 1, [] as unknown]) {
    if (Array.isArray(bad)) continue;
    assert.equal(parseStoryReport(bad).ok, false);
  }
});

test("P7 대상 종류는 042 의 city_spot 과 구분된다", () => {
  assert.equal(STORY_TARGET_TYPE, "shared_story");
  assert.notEqual(STORY_TARGET_TYPE, "city_spot");
});

// ── V: 공개 자격 ─────────────────────────────────────────────────────────────

test("V1 공개이고 가려지지 않은 것만 밖에 보인다", () => {
  assert.equal(isPubliclyVisible({ is_public: true,  moderation_hidden_at: null }), true);
  assert.equal(isPubliclyVisible({ is_public: false, moderation_hidden_at: null }), false);
  assert.equal(isPubliclyVisible({ is_public: true,  moderation_hidden_at: "2026-08-18T00:00:00Z" }), false);
  assert.equal(isPubliclyVisible({ is_public: null,  moderation_hidden_at: null }), false);
});

test("V2 빈 문자열은 숨김이 아니다 — 값이 있어야 가려진 것이다", () => {
  assert.equal(isModerationHidden({ moderation_hidden_at: null }), false);
  assert.equal(isModerationHidden({ moderation_hidden_at: "" }), false);
  assert.equal(isModerationHidden({ moderation_hidden_at: "   " }), false);
  assert.equal(isModerationHidden({ moderation_hidden_at: "2026-08-18T00:00:00Z" }), true);
});

test("V3 이미 가려진 것은 신고를 더 받지 않는다", () => {
  assert.equal(canAcceptReport({ is_public: true, moderation_hidden_at: null }), true);
  assert.equal(canAcceptReport({ is_public: true, moderation_hidden_at: "2026-08-18T00:00:00Z" }), false);
});

// ── H: 가리기 / 풀기 ─────────────────────────────────────────────────────────

test("H1 가리면 시각이 찍히고 공개도 함께 내려간다", () => {
  const p = buildModerationPatch(true, "2026-08-18T09:00:00Z");
  assert.equal(p.moderation_hidden_at, "2026-08-18T09:00:00Z");
  assert.equal(p.is_public, false);
  assert.equal(p.updated_at, "2026-08-18T09:00:00Z");
});

test("H2 풀어도 저절로 공개되지 않는다 — is_public 을 건드리지 않는다", () => {
  const p = buildModerationPatch(false, "2026-08-18T09:00:00Z");
  assert.equal(p.moderation_hidden_at, null);
  assert.ok(!("is_public" in p), "차단 해제가 남의 여행을 대신 공개해서는 안 된다");
});

test("H3 가리기·풀기 어느 쪽도 사용자 데이터를 지우지 않는다", () => {
  for (const hidden of [true, false]) {
    const p = buildModerationPatch(hidden, "2026-08-18T09:00:00Z") as unknown as Record<string, unknown>;
    for (const k of Object.keys(p)) {
      assert.ok(
        ["moderation_hidden_at", "is_public", "updated_at"].includes(k),
        `관리자 조작이 건드리면 안 되는 컬럼: ${k}`,
      );
    }
  }
  // days·trip_title·device_id·동의 기록은 patch 대상이 아니다
  assert.ok(!/days|trip_title|device_id|consent/.test(JSON.stringify(buildModerationPatch(true, "t"))));
});

test("H4 Memory 의 공개 선택은 관리자 조작에서 제외된다", () => {
  // trip_moments 를 아예 건드리지 않는다 — 사용자가 무엇을 넣기로 골랐는지의 기록이다
  assert.ok(!/trip_moments/.test(adminFn), "Story 숨김이 Memory 행을 수정해서는 안 된다");
  assert.ok(!/trip_moment_photos/.test(adminFn));
  assert.ok(!/public_consent_at|public_consent_version/.test(adminFn), "동의 기록은 보존한다");
});

test("H5 만든 사람은 가려진 여행을 다시 켤 수 없다 — 끄는 것은 언제나 허용", () => {
  const hidden = { moderation_hidden_at: "2026-08-18T00:00:00Z" };
  const open   = { moderation_hidden_at: null };
  const on = publishVerdict(hidden, true);
  assert.equal(on.allowed, false);
  if (!on.allowed) assert.equal(on.status, 409);
  assert.equal(publishVerdict(hidden, false).allowed, true, "공개를 줄이는 방향은 언제나 허용한다");
  assert.equal(publishVerdict(open, true).allowed, true);
});

// ── A: 신고 접수 API ─────────────────────────────────────────────────────────

test("A1 신고는 로그인 없이 받고, 결과는 언제나 같은 응답이다", () => {
  assert.match(reportFn, /export async function onRequestPost/);
  assert.match(reportFn, /accepted[\s\S]{0,80}202/);
  // 비공개·미존재·이미 가려짐 → 같은 accepted() 로 끝난다(존재 여부 누출 방지)
  assert.match(reportFn, /if \(!row \|\| !isPubliclyVisible\(row\)\) return accepted\(\);/);
});

test("A2 raw device_id 를 저장하지 않는다 — 해시만 남긴다", () => {
  assert.match(reportFn, /reporterKey\(/);
  const insert = reportFn.slice(reportFn.indexOf('rest(env, "POST", "place_reports"'));
  assert.ok(insert.length > 0);
  assert.ok(!/device_id/.test(insert.slice(0, 400)), "insert 본문에 device_id 가 들어가면 안 된다");
  assert.match(insert, /reporter_key: rkey/);
});

test("A3 IP·User-Agent 를 읽지도 저장하지도 않는다", () => {
  assert.ok(!/cf-connecting-ip|x-forwarded-for|user-agent/i.test(reportFn));
});

test("A4 같은 사람이 같은 이유로 하루에 여러 번 넣지 않게 한다", () => {
  assert.match(reportFn, /24 \* 60 \* 60 \* 1000/);
  assert.match(reportFn, /reporter_key=eq\.\$\{rkey\}/);
  assert.match(reportFn, /created_at=gte\./);
});

test("A5 신고가 쌓여도 자동으로 가려지지 않는다", () => {
  // 임계치 자동 숨김이 있으면 여러 명이 몰려와 남의 여행을 내릴 수 있다.
  // 숨김 상태를 **읽는** 것은 정상이다(이미 가려진 대상인지 본다). 막을 것은 쓰기다.
  for (const m of reportFn.match(/rest\(\s*env,\s*"(GET|POST|PATCH|PUT|DELETE)",\s*"?[^,)]*/g) ?? []) {
    if (/"GET"/.test(m)) continue;
    assert.match(m, /"POST",\s*"place_reports"/, `접수 경로가 신고 저장 외의 쓰기를 한다: ${m}`);
  }
  assert.ok(!/THRESHOLD|threshold|auto_hide/.test(reportFn));
});

test("A6 service_role 키가 응답·로그에 실리지 않는다", () => {
  const logs = reportFn.match(/console\.(error|log|warn)\([^)]*\)/g) ?? [];
  for (const l of logs) {
    assert.ok(!/SERVICE_ROLE|serviceKey|apikey|Authorization/i.test(l), `로그에 키가 실린다: ${l}`);
  }
  assert.ok(!/note:\s*parsed\.note[\s\S]{0,40}console/.test(reportFn));
});

// ── D: 관리자 API ────────────────────────────────────────────────────────────

test("D1 관리자 인증을 통과해야만 동작한다 — 미설정이면 503", () => {
  assert.match(adminFn, /checkAdminAuth\(ctx\.request, ctx\.env\.ADMIN_KEY\)/);
  const authIdx  = adminFn.indexOf("checkAdminAuth");
  const patchIdx = adminFn.indexOf('method: "PATCH"');
  assert.ok(authIdx > 0 && patchIdx > authIdx, "인증이 PATCH 보다 먼저 와야 한다");
  assert.match(adminFn, /if \(authErr\) return authErr;/);
});

test("D2 입력을 검증한다 — UUID 와 boolean 만 받는다", () => {
  assert.match(adminFn, /UUID_RE\.test\(id\)/);
  assert.match(adminFn, /typeof body\.hidden !== "boolean"/);
});

test("D3 patch 는 core 가 만든 것만 쓴다 — 함수 안에서 컬럼을 새로 짜지 않는다", () => {
  assert.match(adminFn, /buildModerationPatch\(body\.hidden, new Date\(\)\.toISOString\(\)\)/);
  assert.match(adminFn, /body: JSON\.stringify\(patch\)/);
});

test("D4 응답에 device_id·저장 경로·좌표를 담지 않는다", () => {
  // 예전에는 요청값을 그대로 돌려줬다. 지금은 실제로 저장된 값을 되받아
  // 돌려준다 — 그래도 나가는 것은 두 값뿐이어야 한다.
  const ret = adminFn.slice(adminFn.lastIndexOf("return json("));
  assert.match(ret, /return json\(\{ hidden: state\.moderationHidden, isPublic: state\.isPublic \}\)/);
  assert.ok(!/device_id|storage_path|lat|lng|trip_title/.test(ret));
});

// ── E: 공개 경로 차단 ────────────────────────────────────────────────────────

test("E1 바깥으로 나가는 길이 전부 숨김을 본다", () => {
  const gates: Array<[string, RegExp]> = [
    ["functions/api/shared/[id]/story.ts",           /isModerationHidden/],
    ["functions/img/memory/[itineraryId]/[ref].ts",  /isModerationHidden/],
    ["functions/api/itinerary/copy.ts",              /isModerationHidden/],
    ["functions/api/trips/popular.ts",               /\.is\("moderation_hidden_at", null\)/],
    ["functions/shared/[id].ts",                     /moderation_hidden_at=is\.null/],
    ["src/lib/trip-cover/cover-state-core.ts",       /moderation_hidden_at/],
  ];
  for (const [path, re] of gates) {
    assert.ok(existsSync(path), `없는 파일: ${path}`);
    assert.match(code(read(path)), re, `${path} 가 숨김을 보지 않는다`);
  }
});

test("E2 공개 판정에 쓰이는 곳을 새로 만들 때 빠뜨리지 않게 한다", () => {
  // is_public 을 공개 조건으로 거는 서버 파일은 모두 숨김도 함께 봐야 한다.
  const CANDIDATES = [
    "functions/api/shared/[id]/story.ts",
    "functions/img/memory/[itineraryId]/[ref].ts",
    "functions/api/itinerary/copy.ts",
    "functions/api/trips/popular.ts",
    "functions/shared/[id].ts",
  ];
  for (const p of CANDIDATES) {
    const src = code(read(p));
    if (!/is_public/.test(src)) continue;
    assert.match(src, /moderation_hidden_at|isModerationHidden/, `${p} 는 is_public 만 보고 있다`);
  }
});

test("E3 숨김 사유를 바깥에 설명하지 않는다 — 없는 것처럼 다룬다", () => {
  const story = code(read("functions/api/shared/[id]/story.ts"));
  const idx = story.indexOf("if (isModerationHidden(");
  const near = story.slice(idx, idx + 300);
  assert.ok(!/report|신고|moderat(ed|ion) by|hidden by/i.test(near.replace(/isModerationHidden/g, "")));
  assert.match(near, /404/);
});

test("E4 만든 사람의 공개 전환에 숨김 검사가 붙어 있다", () => {
  // 이 검사는 한때 파일 전체에서 `publishVerdict(` 를 찾기만 했다. PUT 에 있으면
  // 통과하므로, 사람이 실제로 쓰는 PATCH 가 무방비인 것을 놓쳤다.
  // 이제 핸들러 본문을 하나씩 잘라 본다. 세부 동작은 publish-gate.test.ts 가 본다.
  const src = code(read("functions/api/itinerary/[id].ts"));
  const body = (name: string) => {
    const start = src.indexOf(`export async function ${name}`);
    assert.ok(start >= 0, `핸들러가 없다: ${name}`);
    const next = src.slice(start + 1).search(/\nexport (async )?function /);
    return next < 0 ? src.slice(start) : src.slice(start, start + 1 + next);
  };
  for (const h of ["onRequestPatch", "onRequestPut"]) {
    assert.match(body(h), /publishGate\(/, `${h} 에 공개 판정이 없다`);
  }
  assert.match(src, /\.select\("moderation_hidden_at"\)/);
});

// ── M: 사용자 것은 남는다 ────────────────────────────────────────────────────

test("M1 어떤 경로도 Memory 를 대량으로 비공개 처리하지 않는다", () => {
  for (const p of [ADMIN_FN_PATH, REPORT_FN_PATH]) {
    const src = code(read(p));
    assert.ok(!/trip_moments/.test(src), `${p} 가 Memory 행을 건드린다`);
  }
});

test("M2 삭제하는 경로가 없다", () => {
  for (const p of [ADMIN_FN_PATH, REPORT_FN_PATH]) {
    const src = code(read(p));
    assert.ok(!/method:\s*"DELETE"|\.delete\(\)|DROP |DELETE FROM/i.test(src), `${p} 에 삭제가 있다`);
  }
});

test("M3 migration 은 더하기만 한다 — 기존 값을 지우거나 컬럼을 떨어뜨리지 않는다", () => {
  assert.ok(existsSync(MIGRATION_PATH));
  const sql = read(MIGRATION_PATH);
  // 롤백 안내는 주석으로만 적혀 있다. 실행되는 줄만 본다.
  const runnable = sql.replace(/^\s*--.*$/gm, "");
  assert.ok(!/DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM/i.test(runnable));
  // CHECK 를 넓히려면 제약을 한 번 떼었다 다시 건다 — 그것만 허용된 DROP 이다
  for (const d of runnable.match(/DROP\s+\w+/gi) ?? []) {
    assert.match(d, /DROP\s+CONSTRAINT/i, `허용되지 않는 DROP: ${d}`);
  }
  assert.match(sql, /ADD COLUMN IF NOT EXISTS moderation_hidden_at/i);
  // 042 의 사유·대상 CHECK 는 넓히기만 한다
  assert.match(sql, /shared_story/);
  assert.match(sql, /city_spot/, "기존 대상 종류를 남겨 둔다");
});

// ── U: 화면 ──────────────────────────────────────────────────────────────────

test("U1 Story 신고는 조용한 글자 하나다 — 카드마다 붙지 않는다", () => {
  assert.match(read(STORY_UI_PATH), /^"use client";/);
  const page = code(read("src/app/shared/page.tsx"));
  const uses = page.match(/<StoryReport/g) ?? [];
  assert.equal(uses.length, 1, "Story 안에 신고 진입점은 하나뿐이다");
});

test("U2 신고 화면은 자동으로 가려지지 않는다는 사실을 먼저 말한다", () => {
  assert.match(storyUi, /t\("reportSubtitle"\)/);
  const en = JSON.parse(read("src/messages/en.json")) as Record<string, Record<string, string>>;
  for (const k of ["reportStory", "reportTitle", "reportSubtitle", "reportThanks", "reportFailed"]) {
    assert.ok(en.story?.[k], `en.json story.${k} 가 없다`);
  }
});

test("U3 신고에 내부 식별자를 담지 않는다 — 공유 링크의 id 하나뿐", () => {
  const body = storyUi.slice(storyUi.indexOf("JSON.stringify({"), storyUi.indexOf("});", storyUi.indexOf("JSON.stringify({")));
  assert.match(body, /target_key: shareId/);
  assert.ok(!/moment|photo|storage|lat|lng/i.test(body));
});

test("U4 사유 값이 서버가 아는 것과 같다", () => {
  const values = [...storyUi.matchAll(/\{ value: "([a-z_]+)"/g)].map(m => m[1]);
  assert.deepEqual(values.sort(), [...STORY_REPORT_CATEGORIES].sort());
});

test("U5 관리자 화면은 Story 신고를 장소 신고와 구분해 연다", () => {
  assert.match(adminUi, /target_type === "shared_story"[\s\S]{0,120}\/shared\/\$\{r\.target_key\}/);
  assert.match(adminUi, /\/place\/\$\{r\.target_key\}/, "기존 장소 링크는 그대로 남는다");
});

test("U6 공개 차단은 확인을 한 번 받고, 지워지지 않는다고 알린다", () => {
  assert.match(adminUi, /window\.confirm\(/);
  const ui = read(ADMIN_UI_PATH);
  assert.match(ui, /삭제되지 않습니다/);
  assert.match(adminUi, /moderate\(r\.target_key, true\)/);
  assert.match(adminUi, /moderate\(r\.target_key, false\)/);
});

test("U7 차단 해제가 재공개가 아니라고 화면에서도 말한다", () => {
  assert.match(read(ADMIN_UI_PATH), /재공개는 사용자가 정합니다/);
});

test("U8 관리자 키는 헤더로만 보낸다 — URL 에 싣지 않는다", () => {
  const call = adminUi.slice(adminUi.indexOf('"/api/admin/story-moderation"'));
  assert.match(call, /"x-admin-key": adminKey/);
  assert.ok(!/story-moderation\?[^"]*key/.test(adminUi));
});
