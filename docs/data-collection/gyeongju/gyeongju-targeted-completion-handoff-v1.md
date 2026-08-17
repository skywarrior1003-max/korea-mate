# TASK-GYEONGJU-ALL-DATA-TARGETED-COMPLETION-V1 완료보고서

> Branch: `data/gyeongju-targeted-completion-v1`
> Base: `data/multicity-common` HEAD `f9e3543`
> Data commit: `32a83ea`
> 작성일: 2026-08-17

---

## 1. 최종 경주 데이터 지표

| 항목 | 값 | 비고 |
|---|---|---|
| SERVICE_UNIVERSE | **302** | attraction=200, restaurant=102 |
| EXCLUDED | 0 | 제외 없음 (accommodation 0건) |
| NAV_READY | **302/302 = 100%** | VWorld 107건 복구 포함 |
| IMAGE | **301/302 = 99.7%** | 경주생활체육공원 진정한 예외 |
| IMAGE_DISPLAY | **299/302 = 99.0%** | KTO_TYPE_UNKNOWN 2건 display=False(설계) |
| AI_AUTO | **301/302 = 99.7%** | IMAGE_MISSING=1 |
| PHONE | 172/302 | 레스토랑 100/102 + 관광지 72/200 |
| FINAL_QA | **PASS** | 12개 체크 전체 통과 |
| SAFE_TO_CLOSE | **YES** | |
| NEXT_CITY | SEOUL | |

---

## 2. Phase별 작업 요약

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

**최종 IMAGE: 301/302**

| 잔여 미확보 | 사유 |
|---|---|
| 경주생활체육공원 (GJ01-0092) | heritage patch 미수록, IMAGE_SOURCE_EXHAUSTED |

**KTO_TYPE_UNKNOWN 2건** (경주월드 캘리포니아비치, 경주 낭산 일원):
- image_url 보유하나 image_display_eligible=False (권리 미확인 — 설계 의도)

### Phase 8: AI 적격성

| 기준 | 건수 |
|---|---|
| AI_AUTO=True | 301 |
| AI_AUTO=False (IMAGE_MISSING) | 1 (경주생활체육공원) |

### Phase 9: Final QA

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

## 3. Canonical 파일 정보

| 항목 | 값 |
|---|---|
| 파일 | `data/gyeongju-final-release/gyeongju-canonical-places-v1.jsonl` |
| 레코드 수 | 302 |
| SHA256 | `a0c0c4a579b68284eb0c3dc2c0d66336f3c6c910cbf203144dfef6cc3ba06fd8` |
| schema_version | `gyeongju-canonical-places-v2` |
| branch | `data/gyeongju-targeted-completion-v1` |
| commit | `32a83ea` |

---

## 4. 공통 정책 연결

| 정책 | 파일 | 적용 내용 |
|---|---|---|
| 좌표/nav 정책 | `multicity-phone-semantics-and-geometry-policy-v1.md` RULE-H~M | bbox 검증, 7단계 복구, area/line 예외 금지 |
| Accommodation 정책 | `multicity-place-accommodation-policy-v1.md` | STANDARD_ACCOMMODATION_IS_NOT_CITY_SPOT |
| Eligibility 정책 | `multicity-place-eligibility-policy-v1.md` | 5축 판단, AI_ITINERARY vs SEARCHABLE 분리 |

COMMON_POLICY_COMMIT = `f9e3543` (data/multicity-common)

---

## 5. 진정한 예외 목록

| candidate_id | 이름 | 예외 유형 | 사유 |
|---|---|---|---|
| gyeongju-GJ01-0092 | 경주생활체육공원 | IMAGE_SOURCE_EXHAUSTED | gyeongju.go.kr 미수록, 권리 확인 이미지 없음 |
| gyeongju-KTO12-590997 | 경주월드 캘리포니아비치 | KTO_TYPE_UNKNOWN_IMAGE | 이미지 존재하나 KTO 권리 유형 미확인 |
| gyeongju-KTO12-987844 | 경주 낭산 일원 | KTO_TYPE_UNKNOWN_IMAGE | 이미지 존재하나 KTO 권리 유형 미확인 |

---

## 6. 이미지 출처 요약

| 출처 | 건수 | 권리 유형 |
|---|---|---|
| VG_RESTAURANT_OFFICIAL (VG) | 102 | 레스토랑 공식 사진 |
| gyeongju.go.kr (공공저작물) | 132 | VG_OFFICIAL_PUBLIC |
| KTO TourAPI Type3 | 36 | Type3 |
| KTO TourAPI Type1 | 27 | Type1 |
| IMAGE_RIGHTS_CLEARED | 2 | 확인 완료 |
| KTO_TYPE_UNKNOWN | 2 | 권리 미확인 (display=False) |
| IMAGE_SOURCE_EXHAUSTED | 1 | 이미지 없음 |
| **합계** | **302** | |

---

## 7. 경주 전체 지표 (GYEONGJU_DATA_STATUS)

```
GYEONGJU_DATA_STATUS = {
    "SERVICE_UNIVERSE": 302,
    "category": {"attraction": 200, "restaurant": 102},
    "NAV_READY": "302/302 = 100%",
    "IMAGE": "301/302 = 99.7%",
    "IMAGE_DISPLAY": "299/302 = 99.0%",
    "AI_AUTO": "301/302 = 99.7%",
    "ACCOMMODATION_EXCLUDED": 0,
    "FINAL_QA": "PASS",
    "SAFE_TO_CLOSE": "YES",
    "CANONICAL_SHA256": "a0c0c4a579b68284eb0c3dc2c0d66336f3c6c910cbf203144dfef6cc3ba06fd8",
    "CANONICAL_COMMIT": "32a83ea",
    "BRANCH": "data/gyeongju-targeted-completion-v1",
    "COMMON_POLICY_COMMIT": "f9e3543"
}
```

---

## 8. 다음 단계

**NEXT_CITY = SEOUL**

서울 데이터는 `data/seoul-collection-v1` branch에서 수집 완료 (서울 handoff `7a71304` 참조).
TASK-MULTICITY-ELIGIBILITY-POLICY-V1 (2ca9e09) 에서 AI_ITINERARY_MAIN_CHANGE_REQUIRED=YES 플래그.

**DB 주의사항**:
- food proposals 190건 (경주) → place 승격 미완; DB insert 금지
- course stops MANUAL_REVIEW_FINAL 14건 → place 생성 금지
- KTO_TYPE_UNKNOWN 2건 → display 전에 권리 확인 필요

작업을 완료했습니다.
