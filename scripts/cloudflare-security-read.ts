#!/usr/bin/env node --experimental-strip-types
/**
 * Cloudflare 보안 설정 **조회 전용** 도구.
 *
 *   node --experimental-strip-types scripts/cloudflare-security-read.ts
 *
 * 이 파일에는 변경 코드가 없다. POST·PATCH·PUT·DELETE 를 보낼 방법 자체를
 * 두지 않았다 — 조건에 따라 바꾸는 구조를 만들면, 언젠가 그 조건이 참이 된다.
 * 바꾸는 일은 cloudflare-security-apply.ts 가 따로 한다.
 *
 * 자격 증명
 *   CLOUDFLARE_SECURITY_READ_TOKEN 만 쓴다. 배포 토큰으로 대신하지 않는다.
 *   토큰이 없으면 무엇이 필요한지만 알려 주고 끝낸다. 값은 출력하지 않는다.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import {
  ALLOWED_ZONE, SECURITY_READ_TOKEN_ENV, PAGES_TOKEN_ENV, SECURITY_WRITE_TOKEN_ENV,
  isReadMethod, resolveRoleCredential, type ZoneSnapshot, type RuleSnapshot,
} from "../src/lib/ops/cloudflare-security-core.ts";

export { ALLOWED_ZONE, SECURITY_READ_TOKEN_ENV } from "../src/lib/ops/cloudflare-security-core.ts";

const API = "https://api.cloudflare.com/client/v4";

/** 이름이 있는지만 본다. 값은 이 함수 밖으로 나가지 않는다. */
function envPresence(): Record<string, boolean> {
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

/** 값을 꺼내 쓰되 돌려주지도 찍지도 않는다. */
function readTokenValue(): string {
  let raw = "";
  try { raw = readFileSync(path.join(process.cwd(), ".env.local"), "utf8"); } catch { /* ignore */ }
  for (const line of raw.split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0 && line.slice(0, i).trim() === SECURITY_READ_TOKEN_ENV) return line.slice(i + 1).trim();
  }
  return process.env[SECURITY_READ_TOKEN_ENV] ?? "";
}

/** 조회만 한다. 다른 method 는 인자로 들어와도 던진다. */
export async function cfGet(pathname: string, token: string, method = "GET"): Promise<unknown> {
  if (!isReadMethod(method)) throw new Error(`read tool refuses method: ${method}`);
  const res = await fetch(`${API}${pathname}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

/** Cloudflare 응답을 우리 snapshot 모양으로 줄인다. secret 은 담기지 않는다. */
export function toSnapshot(
  zone: string, phase: string, rules: unknown[], takenAt: string,
): ZoneSnapshot {
  const out: RuleSnapshot[] = rules.map((r, i) => {
    const x = r as Record<string, unknown>;
    const rl = (x.ratelimit ?? {}) as Record<string, unknown>;
    const snap: RuleSnapshot = {
      id:         String(x.id ?? ""),
      name:       String(x.description ?? x.ref ?? ""),
      expression: String(x.expression ?? ""),
      action:     String(x.action ?? ""),
      enabled:    x.enabled !== false,
      position:   i,
    };
    if (typeof rl.requests_per_period === "number") snap.threshold = rl.requests_per_period;
    if (typeof rl.period === "number")              snap.period    = rl.period;
    return snap;
  });
  return { zone, phase, rules: out, takenAt };
}

async function main(): Promise<void> {
  const present = envPresence();
  console.log("── Cloudflare security READ ──");
  console.log(` 대상 zone : ${ALLOWED_ZONE} (이 도구는 다른 zone 을 다루지 않는다)`);
  for (const [k, v] of Object.entries(present)) console.log(` ${k.padEnd(34)} ${v ? "AVAILABLE" : "UNAVAILABLE"}`);

  const cred = resolveRoleCredential("security-read", present);
  if (!cred.ok) {
    console.log(`\n${cred.envName} 이 없다. 조회하지 않는다.`);
    console.log("오너가 Cloudflare 대시보드에서 최소권한 READ 토큰을 만들어 .env.local 에 넣어야 한다.");
    console.log("토큰 값은 이 도구도, 보고서도 다루지 않는다.");
    return;
  }

  const token = readTokenValue();
  const takenAt = new Date().toISOString();

  const zonesRes = await cfGet(`/zones?name=${encodeURIComponent(ALLOWED_ZONE)}`, token) as
    { success?: boolean; result?: { id: string; name: string; status: string; plan?: { name?: string } }[];
      errors?: { message: string }[] };

  if (!zonesRes.success || !zonesRes.result?.length) {
    console.log(`\nzone 조회 실패: ${zonesRes.errors?.[0]?.message ?? "결과 없음"}`);
    console.log("토큰에 Zone:Read 가 없거나 resource scope 가 이 zone 을 포함하지 않는다.");
    return;
  }

  const zone = zonesRes.result[0]!;
  console.log(`\nzone   : ${zone.name} / status=${zone.status} / plan=${zone.plan?.name ?? "UNKNOWN"}`);

  for (const phase of ["http_ratelimit", "http_request_firewall_custom"]) {
    const rs = await cfGet(`/zones/${zone.id}/rulesets/phases/${phase}/entrypoint`, token) as
      { success?: boolean; result?: { rules?: unknown[] }; errors?: { message: string }[] };
    if (!rs.success) {
      console.log(` ${phase.padEnd(30)} 조회 불가: ${rs.errors?.[0]?.message ?? "?"}`);
      continue;
    }
    const snap = toSnapshot(zone.name, phase, rs.result?.rules ?? [], takenAt);
    console.log(` ${phase.padEnd(30)} rules=${snap.rules.length}`);
    for (const r of snap.rules) {
      console.log(`   · ${r.name || "(이름 없음)"} | ${r.action}` +
        `${r.threshold ? ` | ${r.threshold}req/${r.period}s` : ""}${r.enabled ? "" : " | disabled"}`);
    }
  }
}

const invokedDirectly = process.argv[1]?.includes("cloudflare-security-read");
if (invokedDirectly) { void main(); }
