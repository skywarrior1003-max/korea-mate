// Playwright globalSetup — 테스트가 하나라도 돌기 전에 실행된다.
//
// 여기서 막는 것: 운영 Supabase 자격증명을 가진 채로 자동 QA 가 시작되는 것.
// route intercept 를 실수해도 이 지점에서 먼저 멈추므로 운영 write 가 일어날 수 없다.
//
// 로컬 개발(사람이 직접 npm run dev)에는 걸리지 않는다 — isAutomatedQa 가 false 다.

import { assertQaNotUsingProductionWriteBackend } from "./qa-guard.ts";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/** .env.local·.dev.vars 값도 함께 본다 — 로컬 wrangler 가 실제로 읽는 것이 이것이다. */
function collectBackendHints(): (string | undefined)[] {
  const out: (string | undefined)[] = [
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_URL,
    process.env.QA_SUPABASE_URL,
  ];
  for (const f of [".env.local", ".dev.vars"]) {
    const p = join(process.cwd(), f);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_URL)=(.*)$/);
      if (m) out.push(m[2].trim());
    }
  }
  return out;
}

export default function globalSetup(): void {
  // 자동 QA 표시가 없으면 붙여 준다 — Playwright 로 들어온 시점에서 이미 자동 QA 다.
  process.env.GOKOREAMATE_QA = process.env.GOKOREAMATE_QA ?? "1";
  assertQaNotUsingProductionWriteBackend(process.env, collectBackendHints());
}
