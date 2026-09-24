// /api/* 로컬 환경 가드 미들웨어 (GOKOREAMATE-V2-PRELAUNCH-ENVIRONMENT-ISOLATION-V1)
//
// 목적: `wrangler pages dev` 로 로컬에서 Functions 를 띄웠는데 .dev.vars 가
// Production Supabase 를 가리키면(또는 판정 불가면) 모든 /api 요청을 503 으로
// fail-closed 한다. npm run dev:pages 의 선-검사(check-local-env.cjs)를 우회해
// wrangler 를 직접 실행해도 이 미들웨어가 막는다.
//
// 배포 환경(gokoreamate.com·*.pages.dev)은 loopback host 가 아니므로 이 가드를
// 타지 않고 그대로 통과한다 — Production/Preview 동작 무변경.
// 환경변수 하나를 바꿔서 우회할 수 없다: 판정은 요청 host(서버 실행 경로)와
// Supabase URL 분류로만 한다.
import { classifyDataEnv, isLoopbackHost, BLOCK_MESSAGE } from "../../src/lib/env-guard/data-env-core.ts";

interface Env {
  NEXT_PUBLIC_SUPABASE_URL?: string;
}

interface Ctx {
  request: Request;
  env: Env;
  next: () => Promise<Response>;
}

export async function onRequest(ctx: Ctx): Promise<Response> {
  let hostname = "";
  try {
    hostname = new URL(ctx.request.url).hostname;
  } catch {
    // URL 파싱 실패는 로컬 판정 불가 — 배포 경로를 막지 않도록 통과시킨다
  }
  if (hostname && isLoopbackHost(hostname) && classifyDataEnv(ctx.env.NEXT_PUBLIC_SUPABASE_URL) !== "other") {
    // 값·존재 여부를 응답에 넣지 않는다
    return new Response(JSON.stringify({ error: BLOCK_MESSAGE }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }
  return ctx.next();
}
