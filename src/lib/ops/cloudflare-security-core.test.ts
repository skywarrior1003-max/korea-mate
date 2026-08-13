// Cloudflare 보안 설정을 건드릴 때의 안전장치를 고정한다.
//
// 여기서 실제 Cloudflare 를 부르지 않는다. 네트워크가 필요한 것이 하나도 없다.
//
// 무엇을 지키는가
//   · 배포 토큰으로 방화벽을 만지지 않는다
//   · 기본은 dry-run 이다 — 옵션을 빠뜨렸다고 뭔가 바뀌면 안 된다
//   · 확인 문구가 틀리면 아무 일도 일어나지 않는다
//   · zone 은 하나뿐이고 와일드카드는 없다
//   · 있던 규칙은 승인 없이 고치거나 지우지 않는다
//   · 승인한 것 말고 뭔가 달라졌으면 실패로 본다

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PAGES_TOKEN_ENV, SECURITY_READ_TOKEN_ENV, SECURITY_WRITE_TOKEN_ENV,
  ALLOWED_ZONE, CONFIRM_PHRASE, READ_METHODS,
  envNameForRole, resolveRoleCredential, isAllowedZone, isReadMethod,
  evaluateWriteGate, diffSnapshots, verifyDiffAgainstApproval, isForbiddenOperation,
  type ZoneSnapshot, type RuleSnapshot, type WriteTarget,
} from "./cloudflare-security-core.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p.join("/").split("/")), "utf8");
const code = (...p: string[]) =>
  read(...p).replace(/\/\*[\s\S]*?\*\//g, "")
            .split(/\r?\n/).map(l => l.replace(/(^|\s)\/\/.*/, "")).join("\n");

/** 실제처럼 보이는 값을 쓰지 않는다 — fixture 도 secret 처럼 다룬다. */
const ALL = {
  [PAGES_TOKEN_ENV]: true, [SECURITY_READ_TOKEN_ENV]: true, [SECURITY_WRITE_TOKEN_ENV]: true,
};
const NO_WRITE = { ...ALL, [SECURITY_WRITE_TOKEN_ENV]: false };

const target = (over: Partial<WriteTarget> = {}): WriteTarget => ({
  zone: ALLOWED_ZONE, operation: "create-rule", ruleRef: "ai-personalize-rate-limit", ...over,
});
const okInput = (over = {}) => ({
  present: ALL, applied: true, confirm: CONFIRM_PHRASE, target: target(), ...over,
});

// ── A. 토큰 역할 분리 ────────────────────────────────────────────────────────

test("A 역할마다 다른 환경변수를 쓴다", () => {
  assert.equal(envNameForRole("pages"),          "CLOUDFLARE_API_TOKEN");
  assert.equal(envNameForRole("security-read"),  "CLOUDFLARE_SECURITY_READ_TOKEN");
  assert.equal(envNameForRole("security-write"), "CLOUDFLARE_SECURITY_WRITE_TOKEN");
  assert.equal(new Set([PAGES_TOKEN_ENV, SECURITY_READ_TOKEN_ENV, SECURITY_WRITE_TOKEN_ENV]).size, 3);
});

test("A 다른 역할의 토큰으로 대신하지 않는다", () => {
  // 쓰기 토큰만 없는 상태 — 배포 토큰도 읽기 토큰도 있지만 대신하지 못한다
  const r = resolveRoleCredential("security-write", NO_WRITE);
  assert.equal(r.ok, false);
  assert.equal(r.envName, SECURITY_WRITE_TOKEN_ENV);
  assert.deepEqual(evaluateWriteGate(okInput({ present: NO_WRITE })),
    { allowed: false, reason: "missing_write_token" });
});

test("A 읽기 도구는 쓰기 토큰 값을 꺼내지 않는다", () => {
  const src = code("scripts", "cloudflare-security-read.ts");
  // 존재 여부 보고(envPresence)는 세 이름을 다 알아도 된다 — 값을 만지지 않는다.
  // 값을 꺼내는 곳은 readTokenValue 하나뿐이고, 거기서는 읽기 토큰만 본다.
  const body = src.slice(src.indexOf("function readTokenValue"), src.indexOf("export async function cfGet"));
  assert.ok(body.length > 0, "값을 꺼내는 함수를 찾지 못했다");
  assert.ok(body.includes("SECURITY_READ_TOKEN_ENV"), "읽기 토큰만 꺼내야 한다");
  for (const other of ["SECURITY_WRITE_TOKEN_ENV", "PAGES_TOKEN_ENV"]) {
    assert.ok(!body.includes(other), `읽기 도구가 ${other} 값을 꺼내려 한다`);
  }
});

// ── B. 기본 dry-run ──────────────────────────────────────────────────────────

test("B --apply 가 없으면 아무것도 바꾸지 않는다", () => {
  assert.deepEqual(evaluateWriteGate(okInput({ applied: false })),
    { allowed: false, reason: "not_applied" });
});

// ── C. 확인 문구 ─────────────────────────────────────────────────────────────

test("C 확인 문구가 없거나 틀리면 막힌다", () => {
  for (const c of [null, "", "CLOUDFLARE-SECURITY-CHANGE-APPROVE", "approved", CONFIRM_PHRASE.toLowerCase()]) {
    assert.deepEqual(evaluateWriteGate(okInput({ confirm: c })),
      { allowed: false, reason: "confirm_missing" }, String(c));
  }
  const ok = evaluateWriteGate(okInput());
  assert.equal(ok.allowed, true);
});

// ── D. zone guard ────────────────────────────────────────────────────────────

test("D gokoreamate.com 외에는 다루지 않는다", () => {
  assert.equal(isAllowedZone("gokoreamate.com"), true);
  assert.equal(isAllowedZone("GoKoreaMate.com"), true);
  for (const z of ["bupplatform.com", "example.com", "*", "all", "sub.gokoreamate.com"]) {
    assert.equal(isAllowedZone(z), false, z);
    assert.deepEqual(evaluateWriteGate(okInput({ target: target({ zone: z }) })),
      { allowed: false, reason: "zone_not_allowed" }, z);
  }
});

// ── E. 정확한 대상 ───────────────────────────────────────────────────────────

test("E 대상이 없거나 와일드카드면 막힌다", () => {
  assert.deepEqual(evaluateWriteGate(okInput({ target: null })),
    { allowed: false, reason: "target_missing" });
  for (const ref of ["*", "all", "any", "", "  "]) {
    assert.deepEqual(evaluateWriteGate(okInput({ target: target({ ruleRef: ref }) })),
      { allowed: false, reason: "target_wildcard" }, JSON.stringify(ref));
  }
});

// ── F. 기존 규칙 보호 ────────────────────────────────────────────────────────

test("F 기존 규칙 수정은 별도 승인이 있어야 한다", () => {
  const t = target({ operation: "update-rule", ruleRef: "some-existing-rule" });
  assert.deepEqual(evaluateWriteGate(okInput({ target: t })),
    { allowed: false, reason: "modifies_existing_rule" });
  const withApproval = evaluateWriteGate(okInput({ target: t, updateApproved: true }));
  assert.equal(withApproval.allowed, true);
});

// ── G. 삭제 guard ────────────────────────────────────────────────────────────

test("G 삭제는 명시적 승인 없이는 절대 안 된다", () => {
  const t = target({ operation: "delete-rule", ruleRef: "old-rule" });
  assert.deepEqual(evaluateWriteGate(okInput({ target: t })),
    { allowed: false, reason: "delete_not_approved" });
  // 다른 문들을 다 통과해도 삭제 승인이 없으면 막힌다
  assert.deepEqual(evaluateWriteGate({ ...okInput({ target: t }), updateApproved: true }),
    { allowed: false, reason: "delete_not_approved" });
  const approved = evaluateWriteGate(okInput({ target: t, deleteApproved: true }));
  assert.equal(approved.allowed, true);
});

test("G 도구가 다루지 않기로 한 영역", () => {
  for (const op of ["dns", "pages-deploy", "secret", "billing", "token-create", "other-zone"]) {
    assert.equal(isForbiddenOperation(op), true, op);
  }
  assert.equal(isForbiddenOperation("create-rule"), false);
});

// ── H. snapshot / diff ───────────────────────────────────────────────────────

const rule = (id: string, name: string, over: Partial<RuleSnapshot> = {}): RuleSnapshot => ({
  id, name, expression: `http.request.uri.path eq "/${name}"`,
  action: "block", enabled: true, ...over,
});
const snap = (rules: RuleSnapshot[]): ZoneSnapshot =>
  ({ zone: ALLOWED_ZONE, phase: "http_ratelimit", rules, takenAt: "2026-08-13T00:00:00Z" });

test("H 신규 1개 추가 — 기존 3개 그대로면 PASS", () => {
  const before = snap([rule("a", "r1"), rule("b", "r2"), rule("c", "r3")]);
  const after  = snap([...before.rules, rule("d", "ai-personalize-rate-limit")]);
  const d = diffSnapshots(before, after);
  assert.equal(d.added.length, 1);
  assert.equal(d.removed.length, 0);
  assert.equal(d.changed.length, 0);
  assert.equal(d.unchanged, 3);
  assert.deepEqual(
    verifyDiffAgainstApproval(d, { operation: "create-rule", ruleRef: "ai-personalize-rate-limit" }),
    { pass: true });
});

test("H 기존 규칙이 함께 바뀌면 FAIL", () => {
  const before = snap([rule("a", "r1"), rule("b", "r2"), rule("c", "r3")]);
  const after  = snap([
    rule("a", "r1"), rule("b", "r2", { action: "challenge" }), rule("c", "r3"),
    rule("d", "ai-personalize-rate-limit"),
  ]);
  const d = diffSnapshots(before, after);
  assert.equal(d.changed.length, 1);
  assert.deepEqual(d.changed[0]!.fields, ["action"]);
  const v = verifyDiffAgainstApproval(d, { operation: "create-rule", ruleRef: "ai-personalize-rate-limit" });
  assert.equal(v.pass, false);
  if (!v.pass) assert.ok(v.problems.some(p => p.includes("기존 규칙")));
});

test("H 규칙이 조용히 사라져도 FAIL", () => {
  const before = snap([rule("a", "r1"), rule("b", "r2")]);
  const after  = snap([rule("a", "r1"), rule("d", "ai-personalize-rate-limit")]);
  const v = verifyDiffAgainstApproval(diffSnapshots(before, after),
    { operation: "create-rule", ruleRef: "ai-personalize-rate-limit" });
  assert.equal(v.pass, false);
  if (!v.pass) assert.ok(v.problems.some(p => p.includes("사라졌다")));
});

test("H 승인한 이름과 다른 규칙이 생기면 FAIL", () => {
  const before = snap([rule("a", "r1")]);
  const after  = snap([rule("a", "r1"), rule("z", "something-else")]);
  const v = verifyDiffAgainstApproval(diffSnapshots(before, after),
    { operation: "create-rule", ruleRef: "ai-personalize-rate-limit" });
  assert.equal(v.pass, false);
});

test("H threshold·period·순서 변화도 잡는다", () => {
  const before = snap([rule("a", "r1", { threshold: 20, period: 60, position: 0 })]);
  const after  = snap([rule("a", "r1", { threshold: 200, period: 60, position: 0 })]);
  const d = diffSnapshots(before, after);
  assert.deepEqual(d.changed[0]!.fields, ["threshold"]);
});

// ── I. secret 노출 방지 ──────────────────────────────────────────────────────

test("I core 는 토큰 값을 다루지 않는다", () => {
  const src = read("src/lib/ops/cloudflare-security-core.ts");
  for (const bad of ["Authorization", "Bearer", "fetch(", "process.env", "readFileSync"]) {
    assert.ok(!src.includes(bad), `core 는 순수해야 한다 — ${bad} 발견`);
  }
});

test("I 도구가 토큰 값을 출력하지 않는다", () => {
  for (const f of ["scripts/cloudflare-security-read.ts", "scripts/cloudflare-security-apply.ts"]) {
    const src = code(...f.split("/"));
    // 콘솔에 나가는 것은 이름과 AVAILABLE/UNAVAILABLE 뿐이다.
    // TOKEN_ENV 는 이름 상수이므로 검사 전에 걷어낸다.
    // 콘솔로 나가는 줄만 본다. 파싱 코드(line.slice 등)는 출력이 아니다.
    const logged = src.split(/\r?\n/).filter(l => l.includes("console.log"));
    for (const l of logged) {
      const noNames = l.replace(/TOKEN_ENV/g, "").replace(/token 값/g, "");
      assert.ok(!/\btoken\b/i.test(noNames), `${f}: 토큰을 찍는 줄이 있다 — ${l.trim().slice(0, 60)}`);
      // 토큰에 붙은 slice/length/hash 만 본다. rules.length 같은 것은 토큰이 아니다.
      for (const pat of [/token\w*\.slice\(/i, /token\w*\.length/i, /createHash/]) {
        assert.ok(!pat.test(l), `${f}: 출력에 토큰 일부/길이/hash 흔적 — ${l.trim().slice(0, 60)}`);
      }
    }
    assert.ok(logged.length > 0, `${f}: 출력이 하나도 없다`);
  }
});

// ── 읽기 경로가 구조적으로 변경 불가 ─────────────────────────────────────────

test("읽기 도구에는 변경 method 가 없다", () => {
  assert.deepEqual([...READ_METHODS], ["GET", "HEAD"]);
  assert.equal(isReadMethod("get"), true);
  for (const m of ["POST", "PATCH", "PUT", "DELETE"]) assert.equal(isReadMethod(m), false, m);

  const src = code("scripts", "cloudflare-security-read.ts");
  for (const m of ['"POST"', '"PATCH"', '"PUT"', '"DELETE"', "method: \"POST\""]) {
    assert.ok(!src.includes(m), `읽기 도구에 ${m} 이 있다`);
  }
  assert.match(src, /if \(!isReadMethod\(method\)\) throw/, "다른 method 는 던져야 한다");
});

test("읽기와 쓰기가 서로 다른 파일이다", () => {
  const readSrc  = code("scripts", "cloudflare-security-read.ts");
  const applySrc = code("scripts", "cloudflare-security-apply.ts");
  assert.ok(!readSrc.includes("evaluateWriteGate"), "읽기 도구가 쓰기 게이트를 갖지 않는다");
  assert.ok(!applySrc.includes("cfGet("), "쓰기 도구가 읽기 도구를 흉내 내지 않는다");
  // 이번 단계에서는 쓰기 도구에 실제 mutation 호출이 없다
  assert.ok(!/fetch\(/.test(applySrc), "아직 실제 변경 호출을 붙이지 않았다");
});
