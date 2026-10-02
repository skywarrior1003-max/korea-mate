// 고른 사진을 이 브라우저가 열 수 있는가 — 고르는 순간 확인한다.
//
// 저장할 때 압축(compressPhotoBlob)이 같은 방법(<img> 로드)으로 사진을 연다. 그 단계에서야
// 실패를 알면, 사용자는 미리보기 깨진 사진을 넣은 채 저장을 누르고 장소 전체가 저장되지
// 않는다(2026-10-02 Preview 실측: Chromium·WebKit(Windows) 모두 HEIC → "이 이미지를 읽지
// 못했습니다", 장소 0건). 고를 때 걸러 내고 이유를 말한다.
//
// HEIC 는 브라우저마다 다르다 — iPhone Safari 는 열 수 있어 그대로 JPEG 로 압축되고,
// 열 수 없는 브라우저(Chrome·Android 등)에서는 넣지 않고 대체 방법을 안내한다.

import { isHeif } from "./photo-exif.ts";

export type PhotoPickCheck = { ok: true } | { ok: false; reason: "heic" | "unreadable" };

/** 이름·MIME 보다 바이트를 믿는다. 앞 64바이트면 충분하다. */
export async function looksHeic(file: Blob & { name?: string }): Promise<boolean> {
  try {
    if (isHeif(new Uint8Array(await file.slice(0, 64).arrayBuffer()))) return true;
  } catch { /* 이름으로 판단 */ }
  return /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name ?? "");
}

export async function checkPhotoPick(file: File, timeoutMs = 15_000): Promise<PhotoPickCheck> {
  const opened = await new Promise<boolean>(resolve => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    const done = (v: boolean) => { clearTimeout(timer); URL.revokeObjectURL(url); resolve(v); };
    const timer = setTimeout(() => done(false), timeoutMs);
    img.onload = () => done(img.naturalWidth > 0 && img.naturalHeight > 0);
    img.onerror = () => done(false);
    img.src = url;
  });
  if (opened) return { ok: true };
  return { ok: false, reason: (await looksHeic(file)) ? "heic" : "unreadable" };
}
