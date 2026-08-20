// gokoreamate — 승인 관광 자산 upstream fetch 핵심 (TASK-SHARE-OG-PREVIEW-FIX-01)
//
// functions/img/cover/[assetId].ts 의 SECURITY CONTRACT 를 그대로 옮긴 순수 코어다.
// /img/trip-cover 가 OG 크롤러에게 302 대신 최종 이미지 bytes 를 직접 200 으로
// 돌려주기 위해 사용한다. fetch 를 주입받아 네트워크 없이 단위 테스트한다.
//
// SECURITY CONTRACT (V1A 와 동일):
// - 원본은 manifest 의 HTTPS URL 만. 호스트 허용 목록 밖이면 요청 자체를 하지 않는다
// - redirect 를 따라가되 최종 호스트를 다시 허용 목록으로 검사
// - 이미지 MIME 만 통과. HTML·JSON 등은 거부
// - 응답 크기 상한 + fetch timeout
// - 원본 URL 을 결과·오류에 노출하지 않는다 (호출부가 브랜드 fallback 처리)

export const ASSET_ALLOWED_HOSTS = new Set(["tong.visitkorea.or.kr"]);
export const ASSET_ALLOWED_MIME  = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
export const ASSET_MAX_BYTES     = 3 * 1024 * 1024;   // 실측 최대 670KB — 여유 4.5배
export const ASSET_TIMEOUT_MS    = 8000;

export type AssetFetchResult =
  | { ok: true; buf: ArrayBuffer; contentType: string }
  | { ok: false };

const FAIL: AssetFetchResult = { ok: false };

/**
 * 승인 자산 원본을 받아 검증된 bytes 를 돌려준다. 모든 실패는 { ok:false } 하나로
 * 수렴한다 — 원본 URL·사유를 밖으로 흘리지 않기 위해서다.
 */
export async function fetchApprovedAssetBytes(
  imageUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AssetFetchResult> {
  let origin: URL;
  try { origin = new URL(imageUrl); } catch { return FAIL; }
  if (origin.protocol !== "https:" || !ASSET_ALLOWED_HOSTS.has(origin.hostname)) return FAIL;

  const ctl   = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ASSET_TIMEOUT_MS);

  try {
    // 원본(tong.visitkorea.or.kr)은 HEAD 에 405 를 반환한다. 항상 GET 으로 받는다.
    const upstream = await fetchImpl(origin.toString(), {
      method:   "GET",
      redirect: "follow",
      signal:   ctl.signal,
      headers:  { "User-Agent": "GoKoreaMate/1.0 (+https://gokoreamate.com)" },
    });

    // redirect 이후 최종 호스트 재검사
    try {
      const finalHost = new URL(upstream.url || origin.toString()).hostname;
      if (!ASSET_ALLOWED_HOSTS.has(finalHost)) return FAIL;
    } catch { return FAIL; }

    if (!upstream.ok) return FAIL;

    const ctype = (upstream.headers.get("Content-Type") ?? "").split(";")[0].trim().toLowerCase();
    if (!ASSET_ALLOWED_MIME.has(ctype)) return FAIL;   // HTML·JSON 등 거부

    const declared = parseInt(upstream.headers.get("Content-Length") ?? "", 10);
    if (!isNaN(declared) && declared > ASSET_MAX_BYTES) return FAIL;

    const buf = await upstream.arrayBuffer();
    if (buf.byteLength > ASSET_MAX_BYTES) return FAIL;   // Content-Length 미제공 대비

    // 비표준 image/jpg 를 표준 MIME 으로 정규화
    return { ok: true, buf, contentType: ctype === "image/jpg" ? "image/jpeg" : ctype };
  } catch {
    // 타임아웃·네트워크 오류 — 사유를 노출하지 않는다
    return FAIL;
  } finally {
    clearTimeout(timer);
  }
}
