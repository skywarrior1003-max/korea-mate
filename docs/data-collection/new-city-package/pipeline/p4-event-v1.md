# P4 EVENT — Phase Instruction

## Phase 목표
현재/미래 이벤트·축제를 별도 freshness contract로 수집한다.
이벤트가 없는 도시 → `NOT_APPLICABLE`으로 advance.

## 허용 입력
- P1 SOURCE_CAPABILITY checkpoint의 EVENT_PRIMARY source
- KTO TourAPI type15 (축제공연행사)
- 지자체 공식 이벤트 캘린더

## 필수 추적 필드 (per record)
- canonical_id
- source_key
- service_status (SERVICE_ACTIVE|EXPIRED_EVENT|REVIEW_REQUIRED)
- category = "event"
- name_ko
- start_date, end_date (YYYY-MM-DD)
- is_current_or_future (bool)
- venue_canonical_id (Core P3 장소 참조)
- review_by (freshness 재검토 기한)

## checkpoint 필수 필드 (→ P8 집계 대상)
P2 FOOD와 동일 구조. `_phase: "P4"`.  
`category_counts.event` 포함.

## 핵심 규칙
- 종료된 Event는 EXPIRED_EVENT (SERVICE_ACTIVE 계산에서 제외)
- 서비스 활성 장소 count에 과거 Event 혼입 금지
- review_by 없는 Event는 REVIEW_REQUIRED

## 이벤트 없는 도시 처리
```bash
python scripts/city-pipeline-v1.py advance <slug> --phase P4 --status NOT_APPLICABLE \
  --notes "해당 도시 이벤트 수집 대상 없음"
```

## PASS 기준 (이벤트 있는 경우)
- start/end date 모두 기록
- EXPIRED_EVENT가 SERVICE_ACTIVE에 혼입되지 않음
- arithmetic_valid = true
