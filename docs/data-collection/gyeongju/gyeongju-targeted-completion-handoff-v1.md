# TASK-GYEONGJU-ALL-DATA-TARGETED-COMPLETION-V1 완료보고서

> Branch: `data/gyeongju-targeted-completion-v1`
> Base: `data/multicity-common` HEAD `f9e3543`
> Data commit: `32a83ea` (Completion-V1) → Close-V2 커밋 참조
> 작성일: 2026-08-17

---

## 1. 최종 경주 데이터 지표 (FINAL — Close-V2 완료 후)

| 항목 | 값 | 비고 |
|---|---|---|
| TOTAL_RECORDS | **302** | canonical 총 레코드 |
| SERVICE_UNIVERSE | **299** | attraction=197, restaurant=102 |
| EXCLUDED | **3** | EXCLUDED_LOW_TRAVEL_VALUE=1, EXCLUDED_DUPLICATE=2 |
| NAV_READY | **299/299 = 100%** | |
| IMAGE | **299/299 = 100%** | |
| IMAGE_DISPLAY | **299/299 = 100%** | KTO_TYPE_UNKNOWN 0건 — 모두 해소 |
| AI_AUTO | **299/299 = 100%** | |
| PHONE | 171/299 | |
| FINAL_QA | **PASS** | Close-V2 9개 체크 전체 통과 |
| SAFE_TO_CLOSE | **YES** | |
| NEXT_CITY | SEOUL | |

---

## 2. TASK-GYEONGJU-FINAL-CURATION-CLOSE-V2 (최신)

Close-V2는 Completion-V1 직후 실행된 큐레이션 확정 작업이다.

### 처리 결정

| candidate_id | 이름 | 결정 | 사유 |
|---|---|---|---|
| gyeongju-GJ01-0092 | 경주생활체육공원 | **EXCLUDED_LOW_TRAVEL_VALUE** | 손곡동 지역 생활체육공원. 관광 콘텐츠 가치 없음. 이미지 미확보. |
| gyeongju-KTO12-590997 | 경주월드 캘리포니아비치 | **EXCLUDED_DUPLICATE** | GJ01-0116 캘리포니아비치(동일 entity, 보문로 544)의 KTO 중복 레코드. GJ01-0116 유지. |
| gyeongju-KTO12-987844 | 경주 낭산 일원 | **EXCLUDED_DUPLICATE** | GJ01-0011 낭산(동일 entity, 보문동)의 KTO 중복 레코드. GJ01-0011 유지. |

### 중복 보존 레코드 (ACTIVE 유지)

| candidate_id | 이름 | image_rights_status | image_url 상태 |
|---|---|---|---|
| gyeongju-GJ01-0116 | 캘리포니아비치 | VG_OFFICIAL_PUBLIC | gyeongju.go.kr (공공저작물) |
| gyeongju-GJ01-0011 | 낭산 | VG_OFFICIAL_PUBLIC | gyeongju.go.kr (공공저작물) |

### Close-V2 QA 결과

| 체크 | 결과 |
|---|---|
| QA-A GYEONGJU_SPORTS_PARK_IN_SERVICE=0 | PASS |
| QA-B KTO_TYPE_UNKNOWN_IN_ACTIVE=0 | PASS |
| QA-C DISPLAY_FALSE_AS_UNRESOLVED=0 | PASS |
| QA-D NAV_MISSING=0 | PASS |
| QA-E AI_DECISION_UNKNOWN=0 | PASS |
| QA-F AI_AUTO_ALL_ACTIVE=True | PASS |
| QA-G SECRET_LEAK=0 | PASS |
| QA-H SERVICE_STATUS_ALL_SET | PASS |
| QA-I DUPLICATE_OF_RECORDS_ACTIVE | PASS |

---

## 3. Phase별 작업 요약 (Completion-V1)

### Phase 1-2: 서비스 유니버스 확정 + Accommodation 정책

- **302개** 전체 ACTIVE (service_status=ACTIVE)
- Accommodation: 0건 → 제외 없음
- schema_version → `gyeongju-canonical-places-v2`
- 공통 정책: `data/multicity-common` HEAD `f9e3543` (RULE-H~M + accommodation policy)

### Phase 3-4: Nav 감사 + 좌표 복구

| 구분 | 건수 |
|---|---|
| 원래 NAV_READY | 180 |
| COORD_OUTSIDE_BBOX (감포/양남) | 6 |
| MISSING_COORD | 116 |
| VWorld road/jibun 복구 | 107 |
| Bbox 완화 (감포/양남 해안 진정한 예외) | 11 |
| 대안 주소 복구 | 3 (충의당·전촌용굴·골굴사 alt) |
| KTO 공식 좌표 적용 | 2 (석굴암·골굴사 corrected) |
| **최종 NAV_READY** | **302/302** |

**좌표 출처별**:
- 원본 (VG/KTO 수집): 186건
- VWorld road/jibun geocoding: 107건
- 해안 bbox 완화 (감포/양남 정당한 예외): 11건 (`coord_note=OUTSIDE_STRICT_BBOX_GENUINE_COASTAL_GYEONGJU`)
- KTO 공식 확인 좌표: 2건 (석굴암 KTO_CONTENTID_125440, 골굴사 KTO_CONTENTID_130369)

**bbox 완화 근거**: 경주시 감포읍·양남면 일부 장소는 RULE-M bbox(35.7–36.1/129.0–129.5)를 미세하게 벗어남. 경주시 행정구역 내 실재 장소 확인 후 `coord_note=OUTSIDE_STRICT_BBOX_GENUINE_COASTAL_GYEONGJU` 부여. VWorld 반환 좌표와 행정구역 일치 확인.

### Phase 5: Food 파이프라인 상태

| 항목 | 값 |
|---|---|
| restaurant 총수 | 102 |
| NAV_READY | 102/102 |
| IMAGE | 102/102 (VG_RESTAURANT_OFFICIAL) |
| PHONE | 100/102 (2건 진정한 예외) |
| food_pipeline_status | CONFIRMED |

### Phase 6-7: Image 감사 + 복구

**원래 image_url 보유**: 169/302 (KTO 67 attraction + VG 102 restaurant)

**gyeongju-heritage-content-patch로부터 복구** (gyeongju.go.kr, 공공저작물):
- 132건 gyeongju.go.kr 이미지 URL 적용
- image_rights_status=VG_OFFICIAL_PUBLIC, image_source=gyeongju.go.kr

**최종 IMAGE (Completion-V1): 301/302** → Close-V2 제외 후 299/299=100%

### Phase 8: AI 적격성

| 기준 | 건수 |
|---|---|
| AI_AUTO=True (Completion-V1) | 301 |
| AI_AUTO=False (IMAGE_MISSING) | 1 (경주생활체육공원) |
| **AI_AUTO=True (Close-V2 최종)** | **299/299** |

### Phase 9: Final QA (Completion-V1)

| 체크 | 결과 |
|---|---|
| QA-1 SERVICE_UNIVERSE_STABLE | PASS (302=302) |
| QA-2 ACCOMMODATION_IN_SERVICE=0 | PASS |
| QA-3 NAV_READY=100% | PASS |
| QA-4 INVENTED_COORD=0 | PASS |
| QA-5 COORD_IN_KOREA | PASS |
| QA-6 IMAGE_RIGHTS_VALID | PASS |
| QA-7 BUSAN_NONFOOD_UNCHANGED | WARN (파일 이 branch에 없음 — 정상) |
| QA-8 SERVICE_STATUS_ALL_SET | PASS |
| QA-9 AI_AUTO_ALL_SET | PASS |
| QA-10 IMG_DISPLAY_ELIGIBLE | PASS (KTO_TYPE_UNKNOWN 2건 설계 제외) |
| QA-11 NO_SECRET_LEAK | PASS |
| QA-12 SCHEMA_V2 | PASS |

---

## 4. Canonical 파일 정보

| 항목 | 값 |
|---|---|
| 파일 | `data/gyeongju-final-release/gyeongju-canonical-places-v1.jsonl` |
| 총 레코드 수 | 302 (ACTIVE=299, EXCLUDED=3) |
| SHA256 (Close-V2) | `fdbff0f90e94cf7c50536ddcf9b22e05dfb7cd834ac374ec6a1a2b315477aeef` |
| schema_version | `gyeongju-canonical-places-v2` |
| branch | `data/gyeongju-targeted-completion-v1` |
| 이전 SHA256 (Completion-V1) | `a0c0c4a579b68284eb0c3dc2c0d66336f3c6c910cbf203144dfef6cc3ba06fd8` |

---

## 5. 공통 정책 연결

| 정책 | 파일 | 적용 내용 |
|---|---|---|
| 좌표/nav 정책 | `multicity-phone-semantics-and-geometry-policy-v1.md` RULE-H~M | bbox 검증, 7단계 복구, area/line 예외 금지 |
| Accommodation 정책 | `multicity-place-accommodation-policy-v1.md` | STANDARD_ACCOMMODATION_IS_NOT_CITY_SPOT |
| Eligibility 정책 | `multicity-place-eligibility-policy-v1.md` | 5축 판단, AI_ITINERARY vs SEARCHABLE 분리 |

COMMON_POLICY_COMMIT = `f9e3543` (data/multicity-common)

---

## 6. 제외 레코드 (EXCLUDED=3)

| candidate_id | 이름 | exclusion_reason |
|---|---|---|
| gyeongju-GJ01-0092 | 경주생활체육공원 | EXCLUDED_LOW_TRAVEL_VALUE |
| gyeongju-KTO12-590997 | 경주월드 캘리포니아비치 | EXCLUDED_DUPLICATE (→ GJ01-0116) |
| gyeongju-KTO12-987844 | 경주 낭산 일원 | EXCLUDED_DUPLICATE (→ GJ01-0011) |

---

## 7. 이미지 출처 요약 (ACTIVE 299건 기준)

| 출처 | 건수 | 권리 유형 |
|---|---|---|
| VG_RESTAURANT_OFFICIAL (VG) | 102 | 레스토랑 공식 사진 |
| gyeongju.go.kr (공공저작물) | 132 | VG_OFFICIAL_PUBLIC |
| KTO TourAPI Type3 | 36 | Type3 |
| KTO TourAPI Type1 | 27 | Type1 |
| IMAGE_RIGHTS_CLEARED | 2 | 확인 완료 |
| **합계** | **299** | |

---

## 8. 경주 전체 지표 (GYEONGJU_DATA_STATUS — FINAL)

```
GYEONGJU_DATA_STATUS = {
    "SERVICE_UNIVERSE": 299,
    "category": {"attraction": 197, "restaurant": 102},
    "EXCLUDED": 3,
    "exclusion_reasons": {
        "EXCLUDED_LOW_TRAVEL_VALUE": 1,
        "EXCLUDED_DUPLICATE": 2
    },
    "NAV_READY": "299/299 = 100%",
    "IMAGE": "299/299 = 100%",
    "IMAGE_DISPLAY": "299/299 = 100%",
    "AI_AUTO": "299/299 = 100%",
    "ACCOMMODATION_EXCLUDED": 0,
    "FINAL_QA": "PASS",
    "SAFE_TO_CLOSE": "YES",
    "CANONICAL_SHA256": "fdbff0f90e94cf7c50536ddcf9b22e05dfb7cd834ac374ec6a1a2b315477aeef",
    "BRANCH": "data/gyeongju-targeted-completion-v1",
    "COMMON_POLICY_COMMIT": "f9e3543"
}
```

---

## 9. 다음 단계

**NEXT_CITY = SEOUL**

서울 데이터는 `data/seoul-collection-v1` branch에서 수집 완료 (서울 handoff `7a71304` 참조).
TASK-MULTICITY-ELIGIBILITY-POLICY-V1 (2ca9e09) 에서 AI_ITINERARY_MAIN_CHANGE_REQUIRED=YES 플래그.

**DB 주의사항**:
- food proposals 190건 (경주) → place 승격 미완; DB insert 금지
- course stops MANUAL_REVIEW_FINAL 14건 → place 생성 금지
- KTO_TYPE_UNKNOWN: 제외 처리로 완전 해소. 남은 미결 없음.

작업을 완료했습니다.
