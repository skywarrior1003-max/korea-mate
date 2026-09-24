#!/usr/bin/env node
// 로컬 개발 명령 선-검사 (GOKOREAMATE-V2-PRELAUNCH-ENVIRONMENT-ISOLATION-V1)
//
// 사용: node scripts/env-guard/check-local-env.cjs <envfile> [<envfile>...]
//   · npm run dev       → predev 가 .env.local 을 검사
//   · npm run dev:pages → .env.local(빌드에 베이크)과 .dev.vars(Functions 런타임) 둘 다 검사
//
// 각 파일의 NEXT_PUBLIC_SUPABASE_URL 이 "Production 아님이 확인된 Supabase" 가
// 아니면(파일 부재·키 부재·형식 불명·Production 전부 포함) 즉시 실패한다.
// 값·키·존재 여부는 출력하지 않는다 — 파일 이름만 출력한다.
"use strict";

const { classifyDataEnv, isCloudflareCi, readEnvFileUrl, BLOCK_MESSAGE } = require("./data-env.cjs");

if (isCloudflareCi(process.env)) process.exit(0);

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: node scripts/env-guard/check-local-env.cjs <envfile> [...]");
  process.exit(2);
}

for (const f of files) {
  if (classifyDataEnv(readEnvFileUrl(f)) !== "other") {
    console.error(`${BLOCK_MESSAGE} (checked: ${f})`);
    console.error("→ docs/operations/environment-isolation-v1.md 의 Local 설정 절차를 따르세요.");
    process.exit(1);
  }
}
process.exit(0);
