# P7 REGIONAL — Phase Instruction

## Phase 목표
Core와 분리된 B 레이어 여행 콘텐츠를 수집한다.  
처음부터 `normalized-v1` schema와 호환되게 작성한다 (계약 §제18조).

## 지원 콘텐츠 유형
- 추천 코스 (recommended_courses)
- 코스 정류소 (course_stops)
- 추천 장소 (recommended_now)
- 여행 가이드 (regional_guides)
- 공항/교통 접근
- 지하철/버스 노선
- 교통카드/패스/결제
- 수하물/로밍/접근성
- 기타 utility

## 핵심 규칙
- Core에 있는 장소 → 복제 금지, canonical_id reference 사용
- 신규 후보 → `NEW_PLACE_CANDIDATE` 분리 (Core P2/P3 반영 여부 별도 검토)
- 지역추천 콘텐츠가 없는 도시 → `NOT_APPLICABLE`

## checkpoint 필수 필드 (→ P8 집계 대상)
```json
{
  "_phase": "P7", "city_slug": "...", "completed_at": "...",
  "regional": {
    "has_content": true,
    "courses_count": 0,
    "course_stops_count": 0,
    "recommended_now_count": 0,
    "guides_count": {"ko": 0, "en": 0, "ja": 0, "zh-CN": 0},
    "utility_categories": [],
    "artifact_path": "data/regional-recommendations/normalized/...",
    "new_place_candidates": 0,
    "schema": "normalized-v1"
  }
}
```

## PASS 기준
- normalized-v1 schema 호환
- Core 장소 참조 = canonical_id (복사 없음)
- NEW_PLACE_CANDIDATE 명시적 분리
