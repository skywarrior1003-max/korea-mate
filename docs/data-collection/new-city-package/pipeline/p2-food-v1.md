# P2 FOOD — Phase Instruction

## Phase 목표
도시 내 음식점(restaurant 카테고리) canonical places를 수집·정제한다.

## 허용 입력
- P1 SOURCE_CAPABILITY checkpoint의 FOOD_PRIMARY source
- KTO TourAPI (type39 음식)
- 공식 지자체 맛집 데이터

## 필수 추적 필드 (per record)
- canonical_id (deterministic, source-derived 권장)
- source_key / source_type
- service_status (SERVICE_ACTIVE | EXCLUDED | RELATION_CONTEXT | REVIEW_REQUIRED)
- category = "restaurant"
- name_ko
- phone, address
- lat, lng
- description_ko
- image_url, image_provenance
- branch/chain identity (stable_source_id)

## checkpoint 필수 필드 (→ P8 집계 대상)
```json
{
  "_phase": "P2", "city_slug": "...", "completed_at": "...",
  "universe": {
    "discovered_count": 0, "canonical_count": 0,
    "service_active_count": 0, "excluded_count": 0,
    "relation_context_count": 0, "expired_count": 0, "review_count": 0
  },
  "category_counts": {"restaurant": 0},
  "identity": {
    "canonical_id_count": 0, "canonical_id_duplicate_count": 0,
    "source_key_coverage": 0, "source_key_duplicate_count": 0,
    "canonical_id": {"type": "source-derived", "source_id_available": "YES", "deterministic": "YES", "cross_run_stable": "YES"}
  }
}
```

## STOP 조건 (HOLD)
- arithmetic 불일치 (sa+ex+rc+ep+rv ≠ canonical)
- canonical_id 중복 발견
- source 접근 차단

## 금지 행위
- 숙박시설을 restaurant으로 분류
- 폐업 추정 장소를 SERVICE_ACTIVE로 유지

## PASS 기준
- universe arithmetic_valid = true
- canonical_id_duplicate_count = 0
- source_key_duplicate_count = 0
- SERVICE_ACTIVE > 0
