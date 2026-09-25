// /api/* 환경 게이트 미들웨어 (V2-ENVIRONMENT-ISOLATION-V1 §9)
//
// 모든 API 요청이 DB·Storage·외부 provider 에 닿기 전에 환경 일치를 검증한다.
//  · APP_ENV 누락·오타 → 503 (production 추정 금지·fail-closed)
//  · APP_ENV 와 Supabase project ref 불일치 → 503 (query 이전 차단)
//  · Production 실도메인 + 비-production APP_ENV → 503
// 응답은 일반 503 — 내부 설정·ref·URL 을 드러내지 않는다.
// 개별 라우트를 고치는 대신 이 한 곳에서 막는다(§9 공통 차단 원칙).
import { envGate, type ServerEnvVars } from "../_lib/app-env";

interface Ctx {
  request: Request;
  env: ServerEnvVars;
  next: () => Promise<Response>;
}

export async function onRequest(ctx: Ctx): Promise<Response> {
  const blocked = envGate(ctx.env, ctx.request.url);
  if (blocked) return blocked;
  return ctx.next();
}
