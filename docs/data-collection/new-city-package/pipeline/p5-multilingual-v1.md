# P5 MULTILINGUAL — Phase Instruction

## Phase 목표
SERVICE_ACTIVE records에 ko/en/ja/zh-CN locale을 연결한다.
P2+P3+P4 canonical 정리 후 시작. locale 추가가 canonical 구조를 변경하지 않는다.

## Required locales
- **ko**: 한국어 (항상 필수, 100% 목표)
- **en**: 영어
- **ja**: 일본어
- **zh-CN**: 간체 중국어

## 수집 원칙 (계약 §제8조)
- official native locale 우선
- KTO AttractionService / FoodService multilingual endpoint 우선
- AI/임의 기계번역 gap-fill 금지
- Google Translate 임의 적용 금지 (공식 제공만 허용)
- 미수집 시 gap_reason 코드 필수 기록

## gap_reason 코드
`SOURCE_HAS_NO_VALUE | NOT_COLLECTED | SOURCE_NO_LOCALE | FETCH_GAP | COLLECTION_GAP`

## checkpoint 필수 필드 (→ P8 집계 대상)
```json
{
  "_phase": "P5", "city_slug": "...", "completed_at": "...",
  "locale": {
    "ko":    {"title_count": 0, "description_count": 0, "gap_count": 0, "gap_by_reason": {}},
    "en":    {"title_count": 0, "description_count": 0, "gap_count": 0, "gap_by_reason": {}},
    "ja":    {"title_count": 0, "description_count": 0, "gap_count": 0, "gap_by_reason": {}},
    "zh-CN": {"title_count": 0, "description_count": 0, "gap_count": 0, "gap_by_reason": {}}
  }
}
```

## PASS 기준
- ko.title_count = service_active_count (G-09 준비)
- 모든 gap에 reason 코드 기록
- AI 번역 없음
