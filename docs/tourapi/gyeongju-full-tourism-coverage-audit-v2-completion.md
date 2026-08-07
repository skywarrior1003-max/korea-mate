# TASK-GYEONGJU-FULL-TOURISM-COVERAGE-AUDIT-AND-ATTRIBUTE-RECOVERY-V2 완료보고서

> 작성일: 2026-08-07  
> 브랜치: `data/gyeongju-full-tourism-coverage-audit-v2`  
> Base HEAD: `eef72d9` (data/gyeongju-core27-location-recovery-v2)  
> HTTP·API·지오코딩: **0건**

---

## 1. 전제 검증 결과

| 항목 | 확인값 |
|------|--------|
| GJ-01 장소명 필드 | `TRRSRT` 사용 확인 |
| GJ-02 상태 | `EMPTY_SOURCE_CONFIRMED` (items 0건, 정상) |
| entity-attribute-evidence | 84건 전건 `NEGATIVE_DISCOVERY_LOG` — 속성 집계 제외 |
| GJ-06 SF source_name | `경주시 야경 API` |
| GJ-07 SF source_name | `경주시 전망대 API` |

---

## 2. 전체 관광지·자연 범위

| 항목 | 수치 |
|------|------|
| 전체 attraction+nature | **393건** |
| attraction | 334건 |
| nature | 59건 |
| CORE27 | 27건 (RELEASE_READY_OWNER_APPROVED_WEB_CONTENT) |
| 나머지 | **366건** |

---

## 3. GJ01~GJ09 원천 역할 감사

| 데이터셋 | 역할 | 건수 | 비고 |
|----------|------|------|------|
| GJ-01 | PLACE_LIST | 159건 | 장소명=TRRSRT, 권역=TURSM_DSTRCT |
| GJ-02 | EMPTY_SOURCE | **0건** | EMPTY_SOURCE_CONFIRMED, 결함 아님 |
| GJ-03 | IMAGE_ALBUM_CMS | 680건 | 시내권 CMS 이미지 앨범, 독립 장소 아님 |
| GJ-04 | IMAGE_ALBUM_CMS | 560건 | 보문권 이미지 앨범 |
| GJ-05 | IMAGE_ALBUM_CMS | 52건 | 남산권 이미지 앨범 |
| GJ-06 | THEMATIC_LIST | 10건 | 야경 명소 (PLACE_ATTRIBUTE 근거) |
| GJ-07 | THEMATIC_LIST | 10건 | 전망포인트 (INDEPENDENT_PLACE+PLACE_ATTRIBUTE 혼재) |
| GJ-08 | RESTAURANT_LIST_CMS | 111건 | 식당, 관광지·자연 범위 외 |
| GJ-09 | RESTAURANT_HOTPLACE | 61건 | 식당 핫플레이스, 범위 외 |

---

## 4. 야경·전망·유산·코스 thematic 감사

| 테마 | raw | SF 연결 | candidate 연결 | 비고 |
|------|-----|---------|----------------|------|
| 야경 (GJ-06) | 10건 | **10/10** | **10/10** | 전건 PLACE_ATTRIBUTE |
| 전망포인트 (GJ-07) | 10건 | **10/10** | **10/10** | INDEPENDENT_PLACE 9 + PLACE_ATTRIBUTE 1 |
| 세계유산·문화유산 | 53건 | 53건 | 0건* | *heritage-relations에 candidate_id 직접 연결 없음 — 파이프라인 갭 |
| 여행코스·산책 | 29건 | 29건 | 0건* | *course-waypoint에 sfid 연결 없음 — 파이프라인 갭 |

**파이프라인 갭 발견**: heritage-relations·course-waypoint 레코드에서 SF→candidate 연결 경로 부재.  
신규 태스크에서 별도 보강 필요.

---

## 5. 장소·속성·관계 분류 (entity role)

| 분류 | 건수 | 원천 |
|------|------|------|
| INDEPENDENT_PLACE | 9건 | GJ-07 전망포인트 (전용 GJ07-* candidate) |
| PLACE_ATTRIBUTE | 11건 | GJ-06 야경 10건 + GJ-07 → GJ01-0010 1건 |
| IMAGE_ALBUM | 9건 | GJ-03 샘플 3건씩 |
| NON_PLACE_UI_LABEL | 0건 | 확인됨 |

---

## 6. Category·Subcategory Proposal

| 제안 subcategory | 건수 | 근거 |
|-----------------|------|------|
| night_view | 6건* | GJ-06 야경 API |
| viewpoint | 9건 | GJ-07 전망대 API |
| heritage_site | 0건 | heritage-relations candidate_id 연결 부재 |

\* 야경 10건 중 4건은 이미 `night_view` subcategory 보유 → 신규 제안 6건

총 subcategory proposal: **15건**

---

## 7. Tourism Attribute Overlay

| attribute_key | true 건수 | 원천 |
|---------------|-----------|------|
| night_view | **10건** | GJ-06 야경 명소 전건 |
| viewpoint | **10건** | GJ-07 전망포인트 전건 |
| heritage | 0건 | 파이프라인 갭 (별도 보강 필요) |

- 전건 explicit evidence (명시적 공식 근거)
- 전건 `confidence=0.95`
- 언급 없음 → false 처리 없음 (unknown 유지)
- 추론값 자동 true 없음

---

## 8. Pipeline Loss Audit (104건)

| 상태 | 건수 | 설명 |
|------|------|------|
| COMPLETE | 13건 | SF·candidate 연결 있고 subcategory 보유 |
| INCOMPLETE | 7건 | candidate 연결 있으나 attribute 미모델링 |
| NEGATIVE_DISCOVERY_LOG | **84건** | entity-attribute-evidence VG 필터 탐색 실패 — pipeline loss 아님 |

- ATTRIBUTE_NOT_MODELED: 야경 10건 중 7건 (subcategory 아직 night_view 아닌 것)
- NEGATIVE_DISCOVERY_LOG 84건: pipeline loss 집계에서 제외 확인

---

## 9. 신규 장소 Proposal

| 판정 | 건수 |
|------|------|
| NEW_PLACE_HIGH_CONFIDENCE | 10건 (WEB-ATT baseline_candidate_id=None, area_uid 보유) |
| MANUAL_REVIEW_REQUIRED | 2건 (area_uid 없음) |
| 합계 | **12건** |

기존 candidate 연결 proposal: **20건** (GJ-06 10건 + GJ-07 10건 SF→candidate 연결 확인)

---

## 10. 나머지 366건 상세 수집 우선순위

| TIER | 건수 | 기준 |
|------|------|------|
| **TIER_A_NEXT_RELEASE** | **117건** | 야경·전망·유산·코스 속성 보유 또는 CORE_TIER_2 + area_uid/WEB-ATT 보유 |
| TIER_B_COVERAGE_EXPANSION | 15건 | area_uid·WEB-ATT 없는 CORE_TIER_2 |
| TIER_C_LONG_TAIL | 234건 | SUPPORTING_TIER, 장기 수집 대상 |
| MANUAL_REVIEW | 0건 | |

TIER_A 구성 (균형):
- 야경 속성 보유 (GJ-06 연결, CORE27 외): 6건
- 전망 독립 장소 (GJ-07): 9건
- CORE_TIER_2 + area_uid: 나머지 다수

---

## 11. Collector 재사용 평가

| 항목 | 평가 |
|------|------|
| 재사용 가능성 | **HIGH** |
| candidate selection 교체 | 가능 |
| CORE27 하드코딩 | 없음 (area_uid 기반 일반화) |
| WEB-ATT area_uid 연결 | 일반화됨 |
| TIER_A 적용 가능 | 117건 |
| 최소 수정사항 | candidate 목록 교체, 출력 디렉토리명 변경 |
| 권장 배치 크기 | **20건** |
| TIER_A 예상 HTTP 요청 | 117건 (VG 상세 페이지 1건/장소) |

---

## 12. 완료 검증

| 항목 | 결과 |
|------|------|
| 전체 관광지·자연 전수 분석 | **393건** |
| CORE27·나머지 분리 | 27 / 366 |
| GJ01~GJ09 전수 역할 확인 | 9/9 |
| GJ02 EMPTY_SOURCE 처리 | ✅ |
| 야경 raw→SF→candidate | 10/10 |
| 전망 raw→SF→candidate | 10/10 |
| 독립 장소와 속성 혼동 | 0건 |
| 이미지 앨범을 장소로 생성 | 0건 |
| UI label을 장소로 생성 | 0건 |
| evidence 없는 attribute true | 0건 |
| 언급 없음 false 처리 | 0건 |
| negative_discovery_log 속성 근거 사용 | 0건 |
| HTTP·API | **0건** |
| Run1=Run2 | **BYTE_IDENTICAL_PASS (5/5)** |
| 회귀 테스트 | **10/10 PASS** |
| frozen SHA | **ALL_OK (6건)** |
| 결함 등록 | **0건** |
| manifest | 309 → **326파일** |

---

## 13. 생성 산출물 (16개 + script + docs 3개)

### validation/gyeongju/ (11개)
| 파일 | 건수 |
|------|------|
| `gyeongju-source-role-audit-v1.jsonl` | 9건 |
| `gyeongju-tourism-384-coverage-v1.jsonl` | 393건 |
| `gyeongju-tourism-raw-taxonomy-inventory-v1.jsonl` | 86건 |
| `gyeongju-tourism-theme-audit-v1.jsonl` | 4건 |
| `gyeongju-tourism-entity-role-classification-v1.jsonl` | 29건 |
| `gyeongju-tourism-pipeline-loss-audit-v1.jsonl` | 104건 |
| `gyeongju-tourism-coverage-summary-v1.json` | — |
| `gyeongju-full-snapshot-collector-reuse-audit-v1.json` | — |
| `gyeongju-tourism-coverage-reproducibility-v1.json` | — |
| `gyeongju-tourism-coverage-frozen-sha-v1.json` | — |
| `gyeongju-tourism-defect-register-v1.jsonl` | 0건 |

### normalized/gyeongju/ (5개)
| 파일 | 건수 |
|------|------|
| `gyeongju-tourism-category-recovery-v1.jsonl` | 15건 |
| `gyeongju-tourism-attributes-overlay-v1.jsonl` | 20건 |
| `gyeongju-tourism-new-place-proposal-v1.jsonl` | 12건 |
| `gyeongju-tourism-existing-link-proposal-v1.jsonl` | 20건 |
| `gyeongju-tourism-next-batch-priority-v1.jsonl` | 366건 |

### scripts/ (1개)
- `scripts/gyeongju_tourism_coverage_audit_v2.py`

### docs/tourapi/ (3개)
- `gyeongju-full-tourism-coverage-audit-v1-verification.md` (V1 검증, 미실행)
- `gyeongju-full-tourism-coverage-audit-v2-verification.md`
- `gyeongju-full-tourism-coverage-audit-v2-completion.md` (이 파일)

---

## 14. 주요 발견 및 다음 권고

1. **야경·전망 속성 10/10 완전 연결**: GJ-06/07 모두 SF→candidate 경로 확인. attribute overlay 20건 생성.
2. **파이프라인 갭**: heritage-relations·course-waypoint → candidate 직접 연결 없음 → 다음 태스크에서 heritage candidate_id 보강 필요.
3. **TIER_A 117건**: 즉시 full snapshot collector 재사용 가능. 배치 20건 기준 6회 실행.
4. **신규 장소 12건**: WEB-ATT area_uid 보유 10건은 NEW_PLACE_HIGH_CONFIDENCE — candidate 생성 검토 가능.
5. **GJ-03/04/05 이미지**: 1,292건 CMS 이미지 앨범 — 기존 candidate 이미지 보강에 활용 가능 (별도 태스크).
6. **수동 push 필요**: 3개 미push 브랜치 (d54620a, cc96dd7, ca64e5c) 별도 처리 필요.

---

## 15. 완료 판정

| 항목 | 결과 |
|------|------|
| 전체 관광지·자연 범위 확정 | ✅ 393건 |
| 야경·전망 정보 연결 확인 | ✅ 10/10 |
| 장소·속성·관계 정확히 분리 | ✅ |
| attribute·subcategory proposal | ✅ 35건 |
| 신규 장소 proposal | ✅ 12건 |
| 다음 전체 수집 우선순위 확정 | ✅ TIER_A 117건 |
| 기존 데이터 무변경 | ✅ |
| Run1=Run2 BYTE_IDENTICAL | ✅ |
| manifest·하네스 | ✅ PASS |

**종합 판정: PASS**

작업을 완료했습니다
