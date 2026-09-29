"use client";

// 개인(private) API 공통 헤더 (DEVICE-ACCOUNT-LINKING-SECURITY-V1)
//
// linked device 는 서버가 무세션 접근을 거부한다(§3.2). 그래서 세션이 있는
// 브라우저의 모든 private 호출은 반드시 Bearer 를 함께 실어야 한다 — 이
// 헬퍼 하나가 x-device-id 와 Authorization 을 같이 만든다. 호출부가 각자
// 헤더를 조립하는 방식은 금지(가드가 "x-device-id" 직접 사용을 감시한다).
//
// token 이 없으면(비로그인) Authorization 없이 기존 게스트 계약 그대로다.
// token 값은 로그·URL 에 싣지 않는다.

import { getDeviceId } from "../deviceId.ts";
import { getAccessTokenForApi } from "./auth-client.ts";

/** private API 용: { "x-device-id", Authorization? } */
export async function deviceAuthHeaders(): Promise<Record<string, string>> {
  const h: Record<string, string> = { "x-device-id": getDeviceId() };
  try {
    const token = await getAccessTokenForApi();
    if (token) h.Authorization = `Bearer ${token}`;
  } catch { /* 세션 조회 실패 = 게스트로 — 서버가 linked 여부로 최종 판정 */ }
  return h;
}

/** deviceId 를 이미 확보한 호출부용 — 같은 계약, id 재조회만 생략 */
export async function withAuthHeader(base: Record<string, string>): Promise<Record<string, string>> {
  try {
    const token = await getAccessTokenForApi();
    if (token) return { ...base, Authorization: `Bearer ${token}` };
  } catch { /* 게스트 폴백 */ }
  return base;
}
