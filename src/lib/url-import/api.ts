// /api/import/analyze 클라이언트 — 어떤 실패도 던지지 않고 {ok:false} 로 돌린다.
//
// EXTERNAL-TRIP-IMPORT-V2: 서버는 로그인(Authorization Bearer)을 요구한다 — 예전 클라이언트는
// 헤더를 보내지 않아 항상 401 이었다. 세션이 있으면 withAuthHeader 가 붙인다.
// 서버의 오류 코드(본문 error)를 그대로 돌려준다 — 401/403/503 도 본문 코드로 구분한다.
import type { AnalyzedContent } from "./import-core";
import { withAuthHeader } from "@/lib/auth/device-auth-headers";

export interface ImportBalance { welcome_import: number; plan_import: number; writing: number; resets_at: string }

export type AnalyzeResponse =
  | { ok: true; url: string | null; pageTitle: string; analysis: AnalyzedContent; charged?: boolean; replay?: boolean; pool?: string; balance?: ImportBalance | null }
  | { ok: false; error: string; resets_at?: string; pool?: string };

export type AnalyzeInput = { url: string } | { text: string };

export async function apiAnalyze(input: AnalyzeInput): Promise<AnalyzeResponse> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    const res = await fetch("/api/import/analyze", {
      method: "POST",
      headers: await withAuthHeader({ "Content-Type": "application/json" }),
      signal: controller.signal,
      body: JSON.stringify(input),
    });
    clearTimeout(timer);
    let body: Record<string, unknown> | null = null;
    try { body = (await res.json()) as Record<string, unknown>; } catch { body = null; }
    if (body && typeof body.ok === "boolean") return body as unknown as AnalyzeResponse;
    // 401/403/503 은 { error } 만 온다 — 코드를 그대로 쓴다
    const code = body && typeof body.error === "string" ? body.error : `http_${res.status}`;
    return { ok: false, error: code };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return { ok: false, error: aborted ? "client_timeout" : "network" };
  }
}

/** 예전 이름 호환 — 링크 가져오기 */
export async function apiAnalyzeUrl(url: string): Promise<AnalyzeResponse> {
  return apiAnalyze({ url });
}

/** 로그인 사용자의 남은 무료 횟수(화면 안내). 로그인 전·실패면 null */
export async function apiImportBalance(): Promise<ImportBalance | null> {
  try {
    const res = await fetch("/api/import/analyze", { method: "GET", headers: await withAuthHeader({}) });
    if (!res.ok) return null;
    const body = (await res.json()) as { ok?: boolean; balance?: ImportBalance };
    return body.ok && body.balance ? body.balance : null;
  } catch { return null; }
}
