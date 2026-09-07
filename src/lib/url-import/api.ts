// /api/import/analyze 클라이언트 — 어떤 실패도 던지지 않고 {ok:false} 로 돌린다.
import type { AnalyzedContent } from "./import-core";

export type AnalyzeResponse =
  | { ok: true; url: string; pageTitle: string; analysis: AnalyzedContent }
  | { ok: false; error: string };

export async function apiAnalyzeUrl(url: string): Promise<AnalyzeResponse | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    const res = await fetch("/api/import/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ url }),
    });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, error: `http_${res.status}` };
    return (await res.json()) as AnalyzeResponse;
  } catch {
    return { ok: false, error: "network" };
  }
}
