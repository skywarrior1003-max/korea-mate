// planner_sessions helper 재유입 방어.
//
// src/lib/supabase.ts 에 있던 PlannerSessionRow 와 helper 4종을 제거했다.
// 호출처가 0건인 dead code 였다.
//
// 이 테스트가 지키는 건 "지금 없다"가 아니라 "다시 생기지 않는다"다.
// planner_sessions 는 029 로 anon·authenticated 권한을 전면 회수했으므로
// 브라우저에서 다시 부르면 42501 로 실패한다. 코드만 되살아나고 권한은
// 닫혀 있는 상태가 가장 나쁘다 — 화면에서 조용히 빈 결과로 보인다.
//
// 반대로 과잉 방어도 곤란하다. migration 과 보안 test 는 이 이름들을 **역사
// 기록**으로 갖고 있어야 정상이다. 그래서 검사 범위를 runtime source 로
// 한정한다: src/**, functions/** 의 .ts/.tsx 중 *.test.ts 를 뺀 것.
// 문자열 오탐으로 migration·문서를 실패시키지 않는다.

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const MIGDIR = join(ROOT, "supabase", "migrations");
const SUPA = join(ROOT, "src", "lib", "supabase.ts");

const REMOVED = ["upsertPlannerSession", "fetchPlannerSession",
                 "fetchPlannersByDevice", "deletePlannerSession"] as const;

/** 주석을 뗀 실행 본문 — 주석 추가는 통과, SQL 변경은 실패해야 한다 */
const migBody = (f: string) =>
  readFileSync(join(MIGDIR, f), "utf8")
    .split("\n").filter(l => !l.trimStart().startsWith("--")).join("\n")
    .split("\n").map(l => l.trim()).filter(Boolean).join(" ").replace(/\s+/g, " ");
const md5 = (s: string) => createHash("md5").update(s).digest("hex");

/** 블록 주석을 먼저 떼고 줄 주석을 뗀다 — 순서가 바뀌면 파일 본문을 삼킨다 */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "")
   .split("\n").filter(l => !l.trimStart().startsWith("//")).join("\n");

/** runtime source: src·functions 의 .ts/.tsx 에서 테스트 파일 제외 */
function runtimeSources(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === ".next" || name === "out") continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!/\.tsx?$/.test(name)) continue;
      if (/\.test\.tsx?$/.test(name)) continue;
      out.push(p);
    }
  };
  walk(join(ROOT, "src"));
  walk(join(ROOT, "functions"));
  return out;
}

const SOURCES = runtimeSources();
const rel = (p: string) => relative(ROOT, p).split(sep).join("/");

// ── 1. helper 4종이 runtime source 에 없다 ───────────────────────────────────
test("★runtime source 를 실제로 수집했다 — 빈 목록이면 아래 검사가 전부 무의미하다", () => {
  assert.ok(SOURCES.length > 100, `수집 ${SOURCES.length}개`);
  assert.ok(SOURCES.some(p => rel(p) === "src/lib/supabase.ts"));
  assert.ok(SOURCES.some(p => rel(p).startsWith("functions/api/")));
});

test("★helper 4종의 정의가 runtime source 에 없다", () => {
  for (const p of SOURCES) {
    const src = readFileSync(p, "utf8");
    for (const fn of REMOVED) {
      assert.doesNotMatch(src,
        new RegExp(`(export\\s+)?(async\\s+)?function\\s+${fn}\\b`), `${rel(p)}: ${fn} 정의`);
      assert.doesNotMatch(src,
        new RegExp(`(const|let|var)\\s+${fn}\\b`), `${rel(p)}: ${fn} 정의`);
    }
  }
});

test("★helper 4종의 호출·import 가 runtime source 에 없다", () => {
  for (const p of SOURCES) {
    const src = strip(readFileSync(p, "utf8"));
    for (const fn of REMOVED) {
      assert.doesNotMatch(src, new RegExp(`${fn}\\s*\\(`), `${rel(p)}: ${fn} 호출`);
      assert.doesNotMatch(src, new RegExp(`import[^;]*\\b${fn}\\b`), `${rel(p)}: ${fn} import`);
    }
  }
});

test("★PlannerSessionRow 타입이 runtime source 에 없다", () => {
  for (const p of SOURCES) {
    assert.doesNotMatch(strip(readFileSync(p, "utf8")), /\bPlannerSessionRow\b/, rel(p));
  }
});

test("★supabase.ts 에 제거 사유가 주석으로 남아 있다 — 왜 없는지 모르면 다시 만든다", () => {
  const raw = readFileSync(SUPA, "utf8");
  assert.match(raw, /플래너 세션/);
  assert.match(raw, /dead code/);
  assert.match(raw, /029_lockdown_planner_sessions\.sql/);
  for (const fn of REMOVED) assert.ok(raw.includes(fn), `${fn} 이 사유 주석에 없다`);
});

// ── 2·3. planner_sessions 직접 접근 0 ────────────────────────────────────────
test("★브라우저·서버 어디에서도 planner_sessions 를 직접 읽고 쓰지 않는다", () => {
  for (const p of SOURCES) {
    const src = strip(readFileSync(p, "utf8"));
    assert.doesNotMatch(src, /from\(\s*["'`]planner_sessions["'`]\s*\)/, `${rel(p)}: supabase.from`);
    assert.doesNotMatch(src, /rest\/v1\/planner_sessions/,               `${rel(p)}: REST 직접 호출`);
    assert.doesNotMatch(src, /public\.planner_sessions/,                 `${rel(p)}: 직접 SQL`);
  }
});

test("★Pages Function 에도 planner_sessions 접근이 없다 — service_role 로도 열지 않는다", () => {
  const fns = SOURCES.filter(p => rel(p).startsWith("functions/"));
  assert.ok(fns.length > 10, `functions 수집 ${fns.length}개`);
  for (const p of fns) {
    assert.doesNotMatch(readFileSync(p, "utf8"), /planner_sessions/, rel(p));
  }
});

// ── 4. 역사 참조는 허용 ──────────────────────────────────────────────────────
test("★migration 은 planner_sessions 기록을 그대로 갖고 있다 — 지우면 안 된다", () => {
  const sql = readFileSync(join(MIGDIR, "029_lockdown_planner_sessions.sql"), "utf8");
  assert.match(sql, /public\.planner_sessions/);
  // 029 는 helper 4종을 이름으로 적어 둔 감사 기록이다. 이 테스트가 그걸
  // 오탐으로 지우게 만들면 안 되므로 존재 자체를 여기서 못 박는다.
  for (const fn of REMOVED) assert.ok(sql.includes(fn), `029 에서 ${fn} 기록이 사라졌다`);
});

// ── 5. 현재 쓰는 helper 는 그대로 ────────────────────────────────────────────
test("★itinerary 계열 helper 와 supabase client 가 그대로 남아 있다", () => {
  const raw = readFileSync(SUPA, "utf8");
  for (const fn of ["upsertItinerary", "fetchItinerary", "fetchSharedItinerary",
                    "updateItineraryTitle", "fetchItinerariesByDevice",
                    "deleteItinerary", "fetchPopularTrips"]) {
    assert.match(raw, new RegExp(`export async function ${fn}\\b`), fn);
  }
  for (const t of ["ItineraryRow", "PopularTrip"]) {
    assert.match(raw, new RegExp(`export interface ${t}\\b`), t);
  }
  assert.match(raw, /export const supabase = createClient\(/);
  assert.match(raw, /import \{ createClient \} from "@supabase\/supabase-js"/);
});

test("★공유 RPC 호출 구조를 바꾸지 않았다", () => {
  assert.match(readFileSync(SUPA, "utf8"), /\.rpc\("get_shared_itinerary", \{ p_id: id \}\)/);
});

test("★일정 저장·조회는 itineraries 서버 API 쪽에 그대로 있다", () => {
  assert.ok(existsSync(join(ROOT, "src", "lib", "itinerary-api.ts")));
  assert.ok(existsSync(join(ROOT, "functions", "api", "itineraries.ts")));
});

// ── 6·7. migration 무변경 ────────────────────────────────────────────────────
test("★029·041 실행 본문이 바뀌지 않았다 (주석 추가는 허용)", () => {
  assert.equal(md5(migBody("029_lockdown_planner_sessions.sql")),
               "a7b21a72eaf4eada3a12a14eb530c0de", "029");
  assert.equal(md5(migBody("041_lock_down_legacy_spots_select.sql")),
               "e8b0c5b1bb517e22d00fd6186275bfb9", "041");
});

test("★016·022·030·038·039·040 실행 본문이 바뀌지 않았다", () => {
  const expected: Record<string, string> = {
    "016_create_shared_itinerary_rpc.sql":  "857f1632afda1966828f43ac96211708",
    "022_itinerary_is_public.sql":          "8969e64146d64ece21375d3f0fc6324c",
    "030_shared_itinerary_copy_count.sql":  "29f336908ea19d81018ddcb83e301e0b",
    "038_lock_down_spot_reactions.sql":     "b17339279c3f0552adf1d9fc63832965",
    "039_lock_down_legacy_restaurants.sql": "44386bbfd717e4d5e15a4ecdea49bb3c",
    "040_fix_function_search_paths.sql":    "014c233d1fbccc25154fbd08662465f7",
  };
  for (const [f, h] of Object.entries(expected)) assert.equal(md5(migBody(f)), h, f);
});

test("★migration 이 추가되지 않았다 — 041 이 마지막이고 042 는 없다", () => {
  const files = readdirSync(MIGDIR).filter(f => f.endsWith(".sql")).sort();
  assert.equal(files.length, 43, files.length + "개");   // 042 place_reports · 043 place_likes 추가됨
  assert.ok(files.includes("041_lock_down_legacy_spots_select.sql"));
  // 이 가드의 뜻은 "이 작업이 DB 를 건드리지 않았다" 이다.
  // 042(place_reports)·043(place_likes)는 피드백 작업이 추가한 것으로 이 작업과 무관하다.
  // 그 밖의 migration 이 생기면 여기서 걸린다.
  for (const f of files.filter(f => f.slice(0, 3) > "041")) {
    assert.match(f, /^04[23]_(place_reports|place_likes)\.sql$/, `예상치 못한 migration: ${f}`);
  }
});

test("★이번 정리가 권한을 여는 SQL 을 끌고 들어오지 않았다", () => {
  for (const f of readdirSync(MIGDIR).filter(x => x.endsWith(".sql"))) {
    const sql = readFileSync(join(MIGDIR, f), "utf8")
      .split("\n").filter(l => !l.trimStart().startsWith("--")).join("\n");
    assert.doesNotMatch(sql,
      /GRANT[^\n;]*ON[^\n;]*planner_sessions[^\n;]*TO[^\n;]*\b(anon|authenticated|PUBLIC)\b/i, f);
  }
});
