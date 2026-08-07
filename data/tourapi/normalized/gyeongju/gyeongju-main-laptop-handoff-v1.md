# Gyeongju Release Candidate Package — Main-Laptop Handoff

**생성일**: 2026-08-07
**스크립트**: `scripts/gyeongju_overnight_release_batch_v1.py`
**브랜치**: `data/gyeongju-overnight-release-batch-v1`

---

## 1. 최종 Release 집계

| 구분 | 건수 |
|---|---|
| CORE27 READY | 27 |
| TIER_A READY | 106 |
| TIER_A HOLD_DESCRIPTION | 11 |
| Restaurant READY | 102 |
| Long-tail 신규 READY | 0 |
| **Attraction+Nature 합계 READY** | **133** |
| **Restaurant 합계 READY** | **102** |
| **전체 READY** | **235** |
| Hold (attraction/nature) | 201 |
| Out-of-scope (long-tail) | 59 |
| Event RELEASE_READY | 2 |
| Event PAST | 0 |

## 2. EN Coverage

| EN 상태 | 건수 |
|---|---|
| EN_IDENTITY_REVIEW | 31 |
| EN_PARTIAL | 25 |
| EN_READY | 11 |
| EN_RELATED_ONLY | 2 |
| EN_SAME_BASE_PLACE_TEMPORAL_PARTIAL | 1 |
| EN_SOURCE_MISSING | 165 |


## 3. Phase A — EN Supplement 결과

| 결과 | 건수 |
|---|---|
| EN_IDENTITY_REVIEW | 26 |
| EN_OFFICIAL_PARTIAL | 2 |
| OFFICIAL_EN_PAGE_NOT_RESOLVED | 69 |

- 총 HTTP: 0건

## 4. Phase B — Long-tail 결과

| 분류 | 건수 |
|---|---|
| HOLD_DESCRIPTION | 190 |
| OUT_OF_SCOPE | 59 |

- 총 HTTP: 0건

## 5. 남은 미완료 작업

1. **TIER_A HOLD_DESCRIPTION 11건**: 공식 description 출처 미발견 → 수동 확인 필요
2. **Long-tail 신규 HOLD_DESCRIPTION 190건**: VG 또는 KTO description 없음 → 개별 수집 필요
3. **EN supplement OFFICIAL_EN_PAGE_NOT_RESOLVED 69건**: EN 레코드 미발견 → 번역 fallback 또는 별도 EN 수집 필요
4. **Event DATE_INCOMPLETE 29건**: 공식 날짜 확인 필요
5. **IDENTITY_COLLISION_REVIEW 22건**: 충돌 EN 레코드 수동 검토 필요

## 6. 다음 단계 권고

1. TIER_A HOLD 11건에 대한 공식 설명 수집 (경주시 공식 API 재시도)
2. 번역 fallback 187건 처리 (gyeongju-en-translation-fallback-pending-v5.jsonl)
3. IDENTITY_COLLISION_REVIEW 22건 수동 검토
4. DB insert SQL 생성 (별도 태스크)
5. Long-tail 249건 중 tourism-value가 있는 것 별도 수집 대상 선별

---

*생성: gyeongju_overnight_release_batch_v1*
