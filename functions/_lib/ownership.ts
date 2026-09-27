// 공통 서버 소유권 판정기 (DEVICE-ACCOUNT-LINKING-SECURITY-V1 §6)
//
// 모든 계정 소유(private) API 는 이 판정기 하나를 거친다 — 분산 구현 금지.
//
// 결과 계약:
//  · guest   — session 없음 + 현재 device 가 어떤 계정에도 연결돼 있지 않음.
//              scope = [현재 device] 하나(기존 익명 계약 그대로).
//  · account — 서버 검증 session + 현재 Legal 버전 consent + 현재 device 가
//              같은 user 에 연결됨. scope = 그 user 의 모든 linked device.
//  · denied  — linked device 인데 session 없음 / consent 미활성 / 다른 user
//              session / 판정 장애(fail closed) 전부 즉시 오류 응답.
//
// §3.2 핵심: linked device 는 어떤 경우에도 익명 direct fallback 으로
// 되돌아가지 않는다(읽기·쓰기·삭제 동일). §3.1: body/query 의 device·user
// 값은 신원이 아니다 — 현재 device 는 검증된 x-device-id 헤더뿐, user 는
// 검증된 session 뿐이다. raw device 목록·user id 는 서버 내부 전용이며
// 응답·로그에 싣지 않는다(이 파일에 console 호출이 없다 — 가드 감시).

import { requireUser, hasCurrentConsent, type UserAuthEnv } from "./user-auth.ts";

export const OWNERSHIP_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface OwnershipEnv extends UserAuthEnv {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

export type Ownership =
  | { ok: true; mode: "guest"; currentDevice: string; devices: string[]; userId: null }
  | { ok: true; mode: "account"; currentDevice: string; devices: string[]; userId: string }
  | { ok: false; response: Response };

const jsonError = (error: string, status: number) =>
  new Response(JSON.stringify({ error }), {
    status, headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

async function restGet(env: OwnershipEnv, pathQ: string, fetchFn: typeof fetch = fetch): Promise<{ ok: boolean; rows: Record<string, unknown>[] }> {
  const base = env.NEXT_PUBLIC_SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return { ok: false, rows: [] };
  try {
    const r = await fetchFn(`${base}/rest/v1/${pathQ}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!r.ok) return { ok: false, rows: [] };
    return { ok: true, rows: (await r.json()) as Record<string, unknown>[] };
  } catch { return { ok: false, rows: [] }; }
}

/**
 * 현재 요청의 소유권 판정. 실패 응답 계약:
 *  400 invalid_device · 401 account_session_required(linked+무세션)
 *  403 consent_required(linked+미동의) · 403 device_owned_by_other_account
 *  503 ownership_unavailable(판정 장애 — 익명 폴백 금지)
 */
export async function resolveOwnership(
  env: OwnershipEnv, request: Request, fetchFn: typeof fetch = fetch, // fetchFn 주입은 테스트 전용
): Promise<Ownership> {
  const currentDevice = (request.headers.get("x-device-id") ?? "").trim().toLowerCase();
  if (!OWNERSHIP_UUID_RE.test(currentDevice)) {
    return { ok: false, response: jsonError("Invalid device ID", 400) };
  }

  // ① 현재 device 의 mapping — 조회 실패는 fail closed
  const map = await restGet(env, `account_devices?select=user_id&device_id=eq.${currentDevice}&limit=1`, fetchFn);
  if (!map.ok) return { ok: false, response: jsonError("ownership_unavailable", 503) };
  const mappedUser = map.rows[0]?.user_id as string | undefined;

  // ② session(있으면 서버 검증) — Authorization 이 없으면 시도하지 않는다
  const hasBearer = /^bearer\s+\S/i.test(request.headers.get("authorization") ?? "");
  let sessionUser: string | null = null;
  if (hasBearer) {
    const auth = await requireUser(env, request, fetchFn);
    if (!auth.ok) {
      // linked device 라면 무효 세션도 거부(익명 폴백 금지). unlinked 면 게스트로.
      if (mappedUser) return { ok: false, response: auth.response };
      sessionUser = null;
    } else {
      sessionUser = auth.userId;
    }
  }

  // ③ 판정
  if (!mappedUser) {
    if (!sessionUser) {
      return { ok: true, mode: "guest", currentDevice, devices: [currentDevice], userId: null };
    }
    // 세션은 있으나 아직 미연결 device — 자동 연결은 activate 가 담당한다.
    // 여기서 조용히 연결하지 않고(쓰기 경로 단일화) 게스트 범위로만 취급한다.
    return { ok: true, mode: "guest", currentDevice, devices: [currentDevice], userId: null };
  }

  // linked device — 이제부터 익명 direct fallback 이 없다(§3.2)
  if (!sessionUser) return { ok: false, response: jsonError("account_session_required", 401) };
  if (sessionUser !== mappedUser) {
    return { ok: false, response: jsonError("device_owned_by_other_account", 403) };
  }
  const consent = await hasCurrentConsent(env, sessionUser, fetchFn);
  if (consent === null) return { ok: false, response: jsonError("ownership_unavailable", 503) };
  if (!consent) return { ok: false, response: jsonError("consent_required", 403) };

  // ④ 계정 scope = 이 user 의 모든 linked device (서버 내부 전용)
  const all = await restGet(env, `account_devices?select=device_id&user_id=eq.${sessionUser}&limit=200`, fetchFn);
  if (!all.ok) return { ok: false, response: jsonError("ownership_unavailable", 503) };
  const devices = all.rows.map(r => String(r.device_id).toLowerCase()).filter(d => OWNERSHIP_UUID_RE.test(d));
  if (!devices.includes(currentDevice)) devices.push(currentDevice);
  return { ok: true, mode: "account", currentDevice, devices, userId: sessionUser };
}

/** 현재 device 를 session user 에 연결 — activate 전용(원자 RPC 경유) */
export async function linkCurrentDevice(
  env: OwnershipEnv, userId: string, deviceId: string,
): Promise<{ ok: true; already: boolean } | { ok: false; status: 409 | 503 }> {
  const base = env.NEXT_PUBLIC_SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return { ok: false, status: 503 };
  try {
    const r = await fetch(`${base}/rest/v1/rpc/link_device_to_account`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ p_device: deviceId, p_user: userId }),
    });
    if (!r.ok) return { ok: false, status: 503 };
    const rows = (await r.json()) as { ok: boolean; already: boolean; conflict: boolean }[];
    const row = rows[0];
    if (!row) return { ok: false, status: 503 };
    if (row.ok) return { ok: true, already: row.already };
    if (row.conflict) return { ok: false, status: 409 };
    return { ok: false, status: 503 };
  } catch { return { ok: false, status: 503 }; }
}
