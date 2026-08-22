# P6 MEDIA_NAV — Phase Instruction

## Phase 목표
P2-P4에서 수집된 canonical records의 이미지·좌표·NAV readiness를 검증·완성한다.
전체 도시 재감사가 아니라 수집 evidence를 검증하는 Phase.

## Image 기준 (계약 §제9조)
- official/public 이미지 우선
- operator/business-provided 허용 (takedown 대비 provenance 기록)
- reviewer/customer 제공 이미지 제외
- exact entity match (다른 장소 이미지 금지)
- image_display_eligible_count + image_missing_count = service_active_count 보장

## Coordinate / NAV 기준 (계약 §제10조)
- 좌표 = arrival-point (입구·정문·정류장) 우선
- 건물 중심점 = coord 있어도 NAV_READY 자동 처리 금지
- coord_valid + coord_missing = service_active_count 보장
- NAV_READY: arrival coord 확인 + map link 가능

## checkpoint 필수 필드 (→ P8 집계 대상)
```json
{
  "_phase": "P6", "city_slug": "...", "completed_at": "...",
  "data_readiness": {
    "coord_valid_count": 0, "coord_missing_count": 0,
    "nav_ready_count": 0, "nav_missing_count": 0,
    "image_display_eligible_count": 0, "image_missing_count": 0,
    "image_provenance_count": 0,
    "description_ko_count": 0, "description_ko_missing_count": 0
  }
}
```

## PASS 기준
- coord_valid + coord_missing = service_active (G-08 준비)
- image_eligible + image_missing = service_active (G-10 준비)
- image_provenance 기록 완료
- reviewer/customer 이미지 없음
