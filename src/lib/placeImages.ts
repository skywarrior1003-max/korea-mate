/**
 * placeImages.ts — 고유 식별자(place_id) 기반 1:1 이미지 레지스트리
 * 텍스트·사진 매칭 오류 완전 방지: 이 파일이 단일 소스 오브 트루스
 */

export const VERIFIED_IMAGES: Record<string, string> = {
  // ── 로컬 하드코딩 스팟만 등록 (events.json에 없는 ID만) ────────
  // events.json에 있는 ID는 events.json.image가 단일 소스 오브 트루스
  "local-6":  "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=600", // Haeundae Beach
  "local-7":  "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?w=600",  // Gamcheon
  "local-8":  "https://images.unsplash.com/photo-1474690870753-1b92efa1f2d8?w=600",  // Jagalchi
  "local-12": "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600",    // Gwangalli
  "local-13": "https://images.unsplash.com/photo-1534080564583-6be75777b70a?w=600", // Hwangnyeongsan
  "local-14": "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=600", // Jangsan
  "local-15": "https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=600", // Igidae
  "culture-busan-001": "https://images.unsplash.com/photo-1448523183439-d2ac62aca997?w=600",
};

/**
 * place_id를 우선 조회, 없으면 fallback 이미지(events.json의 image 필드) 반환.
 * fallback도 없으면 null.
 */
export function getVerifiedImage(placeId: string, fallback?: string | null): string | null {
  return VERIFIED_IMAGES[placeId] ?? fallback ?? null;
}
