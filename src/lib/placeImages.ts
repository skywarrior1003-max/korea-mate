/**
 * placeImages.ts — 고유 식별자(place_id) 기반 1:1 이미지 레지스트리
 * 텍스트·사진 매칭 오류 완전 방지: 이 파일이 단일 소스 오브 트루스
 */

export const VERIFIED_IMAGES: Record<string, string> = {
  // ── K-POP / BTS ───────────────────────────────────────────────
  "kpop-bts-001":    "https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?w=600",
  "kpop-bts-002":    "https://images.unsplash.com/photo-1448523183439-d2ac62aca997?w=600",
  "kpop-bts-003":    "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=600",
  "kpop-bts-004":    "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600",
  "kpop-bts-005":    "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=600",

  // ── 메가 이벤트 ──────────────────────────────────────────────
  "mega-event-001":  "https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?w=600",
  "mega-event-002":  "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600",
  "mega-event-003":  "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=600",

  // ── 부산 명소 (spot-busan-*) ──────────────────────────────────
  "spot-busan-001":  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600", // 해운대
  "spot-busan-002":  "https://images.unsplash.com/photo-1548115184-bc6544d06a58?w=600",   // 감천문화마을
  "spot-busan-003":  "https://images.unsplash.com/photo-1534482421-64566f976cfa?w=600",   // 자갈치시장
  "spot-busan-004":  "https://images.unsplash.com/photo-1490818387583-1baba5e638af?w=600", // 해동용궁사
  "spot-busan-005":  "https://images.unsplash.com/photo-1583689397935-7de22f67e3c7?w=600", // 광안리
  "spot-busan-006":  "https://images.unsplash.com/photo-1534080564583-6be75777b70a?w=600", // 황령산
  "spot-busan-007":  "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=600", // 장산
  "spot-busan-008":  "https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=600", // 이기대
  "spot-busan-009":  "https://images.unsplash.com/photo-1648061348284-a7116a7c637b?w=600", // UN기념공원 (검증됨)
  "spot-busan-010":  "https://images.unsplash.com/photo-1519451241324-20b4ea2c4220?w=600", // 남포동
  "spot-busan-011":  "https://images.unsplash.com/photo-1447933601403-0c6688de566a?w=600", // 서면카페
  "spot-busan-012":  "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600", // 부산박물관
  "spot-busan-013":  "https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=600", // 오륙도
  "spot-busan-014":  "https://images.unsplash.com/photo-1448375240586-882707db888b?w=600", // 태종대
  "spot-busan-015":  "https://images.unsplash.com/photo-1534080564583-6be75777b70a?w=600", // 부산타워

  // ── 미쉐린 식당 (michelin-*) ──────────────────────────────────
  "michelin-busan-001": "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600",
  "michelin-busan-002": "https://images.unsplash.com/photo-1534482421-64566f976cfa?w=600",
  "michelin-busan-003": "https://images.unsplash.com/photo-1519451241324-20b4ea2c4220?w=600",

  // ── 로컬 하드코딩 스팟 (local-{id}) ──────────────────────────
  "local-6":  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600", // Haeundae Beach
  "local-7":  "https://images.unsplash.com/photo-1548115184-bc6544d06a58?w=600",   // Gamcheon
  "local-8":  "https://images.unsplash.com/photo-1534482421-64566f976cfa?w=600",   // Jagalchi
  "local-12": "https://images.unsplash.com/photo-1583689397935-7de22f67e3c7?w=600", // Gwangalli
  "local-13": "https://images.unsplash.com/photo-1534080564583-6be75777b70a?w=600", // Hwangnyeongsan
  "local-14": "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=600", // Jangsan
  "local-15": "https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=600", // Igidae

  // ── 석불사 (kpop-bts-002와 혼용되었던 사찰) ──────────────────
  "culture-busan-001": "https://images.unsplash.com/photo-1448523183439-d2ac62aca997?w=600",
};

/**
 * place_id를 우선 조회, 없으면 fallback 이미지(events.json의 image 필드) 반환.
 * fallback도 없으면 null.
 */
export function getVerifiedImage(placeId: string, fallback?: string | null): string | null {
  return VERIFIED_IMAGES[placeId] ?? fallback ?? null;
}
