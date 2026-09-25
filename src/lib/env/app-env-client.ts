"use client";

// 클라이언트 환경 판정 (V2-ENVIRONMENT-ISOLATION-V1 §11)
//
// 빌드 타임에 베이크되는 NEXT_PUBLIC_APP_ENV 만 읽는다(비밀 아님).
// 누락이면 development 로 본다 — **production 으로 추정하지 않는다**(fail-closed:
// analytics·affiliate 가 꺼진다). 빌드 가드가 APP_ENV 와 NEXT_PUBLIC_APP_ENV 의
// 일치를 강제하므로, 정상 빌드에서 이 값은 항상 실제 환경과 같다.

import { parseAppEnv, parseMode, type AppEnvironment } from "./app-env-core";

export function clientAppEnv(): AppEnvironment {
  return parseAppEnv(process.env.NEXT_PUBLIC_APP_ENV) ?? "development";
}

/** GA 등 분석 전송 허용 — production + live(기본) 에서만 */
export function analyticsLive(): boolean {
  if (clientAppEnv() !== "production") return false;
  const mode = parseMode(process.env.NEXT_PUBLIC_ANALYTICS_MODE ?? "live");
  return mode === "live";
}

/**
 * 실제 파트너 외부 이동 허용 — production + live(기본) 에서만.
 * staging/development 는 UI·문구·locale 는 그대로 두고 외부 redirect 와
 * affiliate_click 전송만 막는다(§11-2: 실제 귀속 0, broken link 금지).
 */
export function affiliateLive(): boolean {
  if (clientAppEnv() !== "production") return false;
  const mode = parseMode(process.env.NEXT_PUBLIC_AFFILIATE_MODE ?? "live");
  return mode === "live";
}

/** 비-live 환경에서 앵커가 갈 안전한 내부 목적지(외부 이동 없음) */
export const AFFILIATE_PREVIEW_HREF = "#partner-preview";
