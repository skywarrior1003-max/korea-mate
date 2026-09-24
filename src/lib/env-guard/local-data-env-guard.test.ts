// 환경 분리 가드 회귀 테스트 (GOKOREAMATE-V2-PRELAUNCH-ENVIRONMENT-ISOLATION-V1)
// 실행: npm run test:env-guard
//
// §10.1 계약을 고정한다:
//   Local+Production→실패 · Local+Staging→통과 · Local+부재/판정불가→실패 ·
//   CI(CF_PAGES=1)→통과 · 오류에 Secret 없음 · 예시 파일에 실값 없음 ·
//   secret 파일 git 미추적 · TS/CJS 두 판정 사본 동기화 · 가드 배선 존재.
//
// 테스트에는 실제 Staging ref 를 쓰지 않는다 — 합성 ref 만 사용한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

import {
  classifyDataEnv as classifyTs,
  isLoopbackHost,
  PRODUCTION_SUPABASE_REF,
  BLOCK_MESSAGE,
} from "./data-env-core.ts";
import { onRequest } from "../../../functions/api/_middleware.ts";

const require_ = createRequire(import.meta.url);
const ROOT = process.cwd();
const cjs = require_(path.join(ROOT, "scripts/env-guard/data-env.cjs"));

const PROD_URL = `https://${PRODUCTION_SUPABASE_REF}.supabase.co`;
const FAKE_STAGING_URL = "https://abcdefghijklmnopqrst.supabase.co"; // 합성 ref (20자)

test("분류 — production/other/unknown 3값 계약", () => {
  assert.equal(classifyTs(PROD_URL), "production");
  assert.equal(classifyTs(PROD_URL + "/"), "production");
  assert.equal(classifyTs(FAKE_STAGING_URL), "other");
  assert.equal(classifyTs(undefined), "unknown");
  assert.equal(classifyTs(""), "unknown");
  assert.equal(classifyTs("https://placeholder.supabase.co"), "unknown"); // 11자 — 형식 불명
  assert.equal(classifyTs("http://" + PRODUCTION_SUPABASE_REF + ".supabase.co"), "unknown"); // http 불허
  assert.equal(classifyTs("https://example.com"), "unknown");
});

test("TS/CJS 두 사본이 동일하게 판정한다(동기화 가드)", () => {
  const cases = [PROD_URL, FAKE_STAGING_URL, "", undefined, "https://x.supabase.co", "not-a-url"];
  for (const c of cases) assert.equal(classifyTs(c), cjs.classifyDataEnv(c), `desync: ${String(c)}`);
  assert.equal(cjs.PRODUCTION_SUPABASE_REF, PRODUCTION_SUPABASE_REF);
  assert.equal(cjs.BLOCK_MESSAGE, BLOCK_MESSAGE);
});

test("assertLocalDataEnv — Local 계약 6종", () => {
  // Local + Production → 실패
  assert.throws(() => cjs.assertLocalDataEnv({ NEXT_PUBLIC_SUPABASE_URL: PROD_URL }));
  // Local + Staging(비-Production supabase) → 통과
  assert.equal(cjs.assertLocalDataEnv({ NEXT_PUBLIC_SUPABASE_URL: FAKE_STAGING_URL }), "local-ok");
  // Local + 부재 → 실패
  assert.throws(() => cjs.assertLocalDataEnv({}));
  // Local + 판정 불가 → 실패
  assert.throws(() => cjs.assertLocalDataEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://weird.example" }));
  // CI + Production → 통과 (Cloudflare Production 빌드 계약)
  assert.equal(cjs.assertLocalDataEnv({ CF_PAGES: "1", NEXT_PUBLIC_SUPABASE_URL: PROD_URL }), "ci");
  // CI + Staging → 통과 (Preview CI 빌드)
  assert.equal(cjs.assertLocalDataEnv({ CF_PAGES: "1", NEXT_PUBLIC_SUPABASE_URL: FAKE_STAGING_URL }), "ci");
});

test("오류 메시지에 URL·key·존재 여부가 없다", () => {
  try {
    cjs.assertLocalDataEnv({ NEXT_PUBLIC_SUPABASE_URL: PROD_URL, SUPABASE_SERVICE_ROLE_KEY: "fake-secret-value" });
    assert.fail("throw 해야 한다");
  } catch (e) {
    const msg = String((e as Error).message);
    assert.ok(msg.startsWith(BLOCK_MESSAGE));
    assert.ok(!msg.includes("supabase.co"));
    assert.ok(!msg.includes(PRODUCTION_SUPABASE_REF));
    assert.ok(!msg.includes("fake-secret-value"));
    assert.ok(!/service.?role/i.test(msg));
  }
});

function mwCtx(url: string, supabaseUrl?: string) {
  let passed = false;
  return {
    ctx: {
      request: new Request(url),
      env: { NEXT_PUBLIC_SUPABASE_URL: supabaseUrl },
      next: async () => { passed = true; return new Response("ok"); },
    },
    passedThrough: () => passed,
  };
}

test("functions/api/_middleware — loopback+Production/판정불가=503, Staging=통과, 배포 host=무조건 통과", async () => {
  // 로컬 wrangler + Production → 503
  let m = mwCtx("http://localhost:8788/api/itineraries", PROD_URL);
  const res = await onRequest(m.ctx);
  assert.equal(res.status, 503);
  assert.equal(m.passedThrough(), false);
  const body = await res.text();
  assert.ok(body.includes(BLOCK_MESSAGE) && !body.includes("supabase.co"));

  // 로컬 + 부재/판정불가 → 503
  m = mwCtx("http://127.0.0.1:8788/api/itineraries", undefined);
  assert.equal((await onRequest(m.ctx)).status, 503);

  // 로컬 + Staging(비-Production) → 통과
  m = mwCtx("http://localhost:8788/api/itineraries", FAKE_STAGING_URL);
  assert.equal((await onRequest(m.ctx)).status, 200);
  assert.equal(m.passedThrough(), true);

  // 배포 host 는 Production env 여도 그대로 통과 (Production 동작 무변경)
  for (const host of ["https://gokoreamate.com", "https://korea-mate.pages.dev", "https://5163752a.korea-mate.pages.dev"]) {
    m = mwCtx(`${host}/api/itineraries`, PROD_URL);
    assert.equal((await onRequest(m.ctx)).status, 200, host);
    assert.equal(m.passedThrough(), true, host);
  }
});

test("loopback 판정", () => {
  for (const h of ["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0", "app.localhost"]) {
    assert.equal(isLoopbackHost(h), true, h);
  }
  for (const h of ["gokoreamate.com", "korea-mate.pages.dev", "auth-lab.korea-mate.pages.dev"]) {
    assert.equal(isLoopbackHost(h), false, h);
  }
});

test("secret 파일은 git 미추적, 예시 파일에 실값 없음", () => {
  const tracked = execSync("git ls-files", { cwd: ROOT, encoding: "utf8" }).split("\n");
  assert.ok(!tracked.includes(".env.local"), ".env.local 이 추적됨");
  assert.ok(!tracked.includes(".dev.vars"), ".dev.vars 가 추적됨");
  assert.ok(tracked.includes(".env.example") && tracked.includes(".dev.vars.example"));

  for (const f of [".env.example", ".dev.vars.example"]) {
    const s = readFileSync(path.join(ROOT, f), "utf8");
    assert.ok(!s.includes(PRODUCTION_SUPABASE_REF), `${f}: Production ref 노출`);
    // 실 JWT(수백 자) 금지 — placeholder 수준(짧은 eyJ… 예시)만 허용
    for (const line of s.split(/\r?\n/)) {
      const v = line.includes("=") ? line.slice(line.indexOf("=") + 1).trim() : "";
      assert.ok(v.length < 80, `${f}: 실값 의심(길이 80+): ${line.slice(0, line.indexOf("=") + 1)}…`);
    }
  }
});

test("가드 배선 — next.config·build-static·predev·dev:pages·middleware 존재", () => {
  const nextCfg = readFileSync(path.join(ROOT, "next.config.ts"), "utf8");
  assert.ok(nextCfg.includes("assertLocalDataEnv"), "next.config 가드 배선 소실");
  const buildStatic = readFileSync(path.join(ROOT, "scripts/build-static.mjs"), "utf8");
  assert.ok(buildStatic.includes("classifyDataEnv"), "build-static 가드 배선 소실");
  const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  assert.ok(pkg.scripts.predev?.includes("check-local-env"), "predev 가드 소실");
  assert.ok(pkg.scripts["dev:pages"]?.includes("check-local-env"), "dev:pages 가드 소실");
  assert.ok(pkg.scripts["dev:pages"]?.includes(".dev.vars"), "dev:pages 가 .dev.vars 를 검사하지 않음");
  assert.ok(existsSync(path.join(ROOT, "functions/api/_middleware.ts")), "middleware 소실");
});

test("check-local-env CLI — 합성 파일로 negative/positive", () => {
  const tmp = process.env.TEMP || process.env.TMPDIR || ".";
  const mk = (name: string, url: string | null) => {
    const p = path.join(tmp, `gkm-envguard-${name}.env`);
    require_("node:fs").writeFileSync(p, url === null ? "# empty\n" : `NEXT_PUBLIC_SUPABASE_URL=${url}\n`);
    return p;
  };
  const run = (files: string[]) => {
    try {
      execSync(`node scripts/env-guard/check-local-env.cjs ${files.map(f => `"${f}"`).join(" ")}`, {
        cwd: ROOT, encoding: "utf8", stdio: "pipe",
      });
      return 0;
    } catch (e) {
      return (e as { status?: number }).status ?? 1;
    }
  };
  assert.equal(run([mk("prod", PROD_URL)]), 1, "Production 파일이 통과됨");
  assert.equal(run([mk("empty", null)]), 1, "URL 부재 파일이 통과됨");
  assert.equal(run([path.join(tmp, "gkm-envguard-missing-file-does-not-exist.env")]), 1, "부재 파일이 통과됨");
  assert.equal(run([mk("staging", FAKE_STAGING_URL)]), 0, "비-Production 파일이 차단됨");
  assert.equal(run([mk("staging2", FAKE_STAGING_URL), mk("prod2", PROD_URL)]), 1, "둘 중 하나만 오염돼도 실패해야 함");
});

test("현재 .env.local·.dev.vars 가 Production 을 가리키지 않는다(값 비출력)", () => {
  for (const f of [".env.local", ".dev.vars"]) {
    const p = path.join(ROOT, f);
    if (!existsSync(p)) continue; // CI 등 파일 부재 환경에서는 건너뜀
    assert.equal(cjs.classifyDataEnv(cjs.readEnvFileUrl(p)), "other", `${f}: Local 데이터 환경이 Staging/Local 이 아님`);
  }
});
