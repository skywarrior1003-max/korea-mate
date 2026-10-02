// 기록의 추가 사진을 서버로 올려도 되는가 — 클라이언트·서버 공용 약속 (2026-10-02, 추가 사진 단독 수정)
//
// 예전 앱은 한 기록의 2번째 이후 사진을 기기에만 남겼다. 고친 앱은 그 사진을 뒤늦게 올린다.
// 이미 공개한 기록이면 "공개 동의 뒤에 올라온 사진은 공개하지 않는다" 는 서버 보호가 있어야 안전하다.
//
// 그래서 서버가 이 머리글로 "보호가 있고, 지금 올려도 된다" 를 알릴 때만 클라이언트가 추가 사진을 올린다.
//   "1" = 보호 있음·업로드 허용 · "0" = 보호 있음·운영자가 잠시 멈춤 · 없음 = 보호 없는 서버(되돌린 옛 배포 등)
// 보호 없는 서버를 만나면 올리지 않고 이 기기에 둔다 — 새 앱이 열린 채로 옛 서버로 되돌려져도 안전하다.

export const LATE_PHOTO_GUARD_HEADER = "x-gkm-late-photo-guard";

/** 운영 정지 스위치 — ai_ops_switches 의 이 행이 'paused' 면 추가 사진 업로드를 받지 않는다(행이 없으면 허용) */
export const EXTRA_PHOTO_SWITCH_KEY = "moment_extra_photos";

export function guardAllowsUpload(headerValue: string | null | undefined): boolean {
  return headerValue === "1";
}
