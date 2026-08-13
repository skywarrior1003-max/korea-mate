#!/usr/bin/env node --experimental-strip-types
/**
 * Cloudflare 보안 설정 **변경** 도구.
 *
 *   dry-run(기본, 변경 0):
 *     node --experimental-strip-types scripts/cloudflare-security-apply.ts \
 *       --op=create-rule --rule="ai-personalize-rate-limit"
 *
 *   실제 변경(승인된 TASK 에서만):
 *     ... --apply --confirm=CLOUDFLARE-SECURITY-CHANGE-APPROVED
 *
 * 네 개의 문을 전부 통과해야 한다.
 *   1. CLOUDFLARE_SECURITY_WRITE_TOKEN — 배포 토큰·읽기 토큰으로 대신할 수 없다
 *   2. --apply — 붙이지 않으면 dry-run 이다
 *   3. --confirm=<고정 문구> — 오타는 통과하지 못한다
 *   4. 정확한 대상 — zone 은 gokoreamate.com 하나, 규칙은 이름으로 명시
 *
 * 그리고 바꾸기 전과 후를 찍어 비교한다. 승인한 것 말고 뭔가 달라졌으면
 * 실패로 보고하고 더 이상 바꾸지 않는다.
 *
 * 지우는 것과 고치는 것은 따로 승인받는다. "정리" 는 이유가 되지 않는다.
 *
 * ⚠ 이 파일에는 아직 실제 mutation 호출이 없다. 게이트·dry-run·diff 판정만
 *   있고, 실제 Cloudflare 변경은 오너가 승인한 별도 TASK 에서 붙인다.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import {
  ALLOWED_ZONE, CONFIRM_PHRASE,
  PAGES_TOKEN_ENV, SECURITY_READ_TOKEN_ENV, SECURITY_WRITE_TOKEN_ENV,
  evaluateWriteGate, diffSnapshots, verifyDiffAgainstApproval,
  type WriteOperation, type WriteTarget, type ZoneSnapshot,
} from "../src/lib/ops/cloudflare-security-core.ts";

export {
  ALLOWED_ZONE, CONFIRM_PHRASE, evaluateWriteGate, diffSnapshots, verifyDiffAgainstApproval,
} from "../src/lib/ops/cloudflare-security-core.ts";

/** 이름이 있는지만 본다. 값은 읽지 않는다. */
export function envPresence(): Record<string, boolean> {
  let raw = "";
  try { raw = readFileSync(path.join(process.cwd(), ".env.local"), "utf8"); } catch { /* 없어도 된다 */ }
  const names = new Set(
    raw.split(/\r?\n/).map(l => l.slice(0, l.indexOf("=")).trim()).filter(Boolean),
  );
  const has = (k: string) => names.has(k) || Boolean(process.env[k]);
  return {
    [PAGES_TOKEN_ENV]:          has(PAGES_TOKEN_ENV),
    [SECURITY_READ_TOKEN_ENV]:  has(SECURITY_READ_TOKEN_ENV),
    [SECURITY_WRITE_TOKEN_ENV]: has(SECURITY_WRITE_TOKEN_ENV),
  };
}

export function parseArgs(argv: readonly string[]): {
  applied: boolean; confirm: string | null; target: WriteTarget | null;
  deleteApproved: boolean; updateApproved: boolean;
} {
  const get = (k: string): string | null => {
    for (const a of argv) if (a.startsWith(`--${k}=`)) return a.slice(k.length + 3);
    return null;
  };
  const op   = get("op");
  const rule = get("rule");
  const zone = get("zone") ?? ALLOWED_ZONE;
  const valid: WriteOperation[] = ["create-rule", "update-rule", "delete-rule"];
  const target: WriteTarget | null =
    op && rule !== null && (valid as string[]).includes(op)
      ? { zone, operation: op as WriteOperation, ruleRef: rule }
      : null;
  return {
    applied:        argv.includes("--apply"),
    confirm:        get("confirm"),
    target,
    deleteApproved: argv.includes("--delete-approved"),
    updateApproved: argv.includes("--update-approved"),
  };
}

/** 사람이 읽을 수 있는 변경 계획. 실제 호출은 하지 않는다. */
export function renderPlan(target: WriteTarget, before: ZoneSnapshot | null): string[] {
  const lines = [
    `  zone      : ${target.zone}`,
    `  operation : ${target.operation}`,
    `  rule      : ${target.ruleRef}`,
  ];
  if (before) {
    lines.push(`  BEFORE    : ${before.rules.length} rules (phase ${before.phase})`);
    const expected =
      target.operation === "create-rule" ? before.rules.length + 1
      : target.operation === "delete-rule" ? before.rules.length - 1
      : before.rules.length;
    lines.push(`  EXPECTED  : ${expected} rules`);
  } else {
    lines.push(`  BEFORE    : (읽기 토큰이 없어 snapshot 을 찍지 못했다)`);
  }
  return lines;
}

function main(): void {
  const argv = process.argv.slice(2);
  const a = parseArgs(argv);
  const present = envPresence();

  console.log("── Cloudflare security APPLY ──");
  console.log(` 대상 zone : ${ALLOWED_ZONE} (다른 zone 은 다루지 않는다)`);
  for (const [k, v] of Object.entries(present)) console.log(` ${k.padEnd(34)} ${v ? "AVAILABLE" : "UNAVAILABLE"}`);

  const gate = evaluateWriteGate({
    present, applied: a.applied, confirm: a.confirm, target: a.target,
    deleteApproved: a.deleteApproved, updateApproved: a.updateApproved,
  });

  if (a.target) {
    console.log("\n계획:");
    for (const l of renderPlan(a.target, null)) console.log(l);
  }

  if (!gate.allowed) {
    console.log(`\nBLOCKED (${gate.reason}) — Cloudflare 변경 0회.`);
    if (gate.reason === "not_applied") {
      console.log("기본은 dry-run 이다. 실제로 바꾸려면 --apply 와 확인 문구가 함께 필요하다.");
    }
    if (gate.reason === "missing_write_token") {
      console.log(`${SECURITY_WRITE_TOKEN_ENV} 이 없다. 다른 토큰으로 대신하지 않는다.`);
    }
    return;
  }

  // 여기까지 왔다는 것은 네 문을 모두 통과했다는 뜻이다. 그래도 아직
  // 실제 변경 코드는 없다 — 승인된 별도 TASK 에서 붙인다.
  console.log("\nGATES PASSED — 다만 이 도구에는 아직 실제 변경 호출이 없다.");
  console.log("실제 mutation 은 오너가 승인한 별도 TASK 에서 구현한다. Cloudflare 변경 0회.");
}

const invokedDirectly = process.argv[1]?.includes("cloudflare-security-apply");
if (invokedDirectly) { main(); }
