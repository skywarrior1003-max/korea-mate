# TASK-GYEONGJU-NORMALIZATION-INDEPENDENT-QA-V1 완료보고서

**완료일**: 2026-08-05  
**기반 브랜치**: `data/gyeongju-monthly-rec-relation-fix-alt-v1` HEAD `44e5a48`  
**작업 브랜치**: `research/gyeongju-normalization-independent-qa-v1`  
**스크립트**: `scripts/gyeongju_normalization_independent_qa_v1.py` v1.0.0  
**QA 최종 판정**: **FAIL**  
**준비도 상태**: `GYEONGJU_NORMALIZATION_QA_HOLD`

---

## 1. 프롬프트 검증 결과

### 검증 사항

| 항목 | 결과 |
|---|---|
| 데이터 수치 일치 여부 | ✅ 전체 일치 |
| 구조적 설계 오류 | ✅ 없음 |
| 차단 블로커 | ✅ 없음 |

### 검증 중 발견한 주의사항 (차단 없음, 구현 단계 반영)

| 주의사항 | 조치 |
|---|---|
| 프롬프트 "heritage related-attraction links: 33" vs summary "heritage_relations: 53" | 53 = PARENT_CHILD(20) + RELATED_ATTRACTION(33). 프롬프트 정확함 |
| `relation_status` 용어 — place_relations 파일은 `identity_status` 사용 | QA 스크립트에서 올바른 필드명 사용 |
| 좌표 경계 미지정 | 한국 표준 범위 lat 33–40, lon 124–132 적용 |
| `PILOT_VG_CAND_HIGH_CONFIDENCE` evidence code — 초기 strong evidence 목록 누락 | 스크립트 수정으로 해결 |
| Heritage RELATED_ATTRACTION FK — 159 web att 외부 area_uid → 커버리지 한계 | COVERAGE_LIMITATION으로 재분류 |

**결정**: 문제 없음 → **EXECUTE** (실행)

---

## 2. 입력 데이터 사용

| 파일 | 레코드 수 | 확인 |
|---|---|---|
| `gyeongju-full-v1-candidates.jsonl` | 914 | ✅ |
| `source-facts-full-v1.jsonl` | 1,158 | ✅ |
| `gyeongju-baseline-831-identity-link-audit.jsonl` | 831 | ✅ |
| `gyeongju-attraction-identity-audit-v1.jsonl` | 159 (HC:145, MR:4, NEW:10) | ✅ |
| `gyeongju-restaurant-identity-audit-v1.jsonl` | 84 (HC:5, MR:13, NEW:66) | ✅ |
| `gyeongju-souvenir-classification-audit-v1.jsonl` | 8 | ✅ |
| `gyeongju-manual-review-queue-v1.jsonl` | 38 | ✅ |
| `gyeongju-multilingual-entity-link-audit-v1.jsonl` | 92 | ✅ |
| `gyeongju-event-entities-v1.jsonl` | 7 | ✅ |
| `gyeongju-event-listing-relations-v1.jsonl` | 10 | ✅ |
| `gyeongju-course-entities-v1.jsonl` | 5 | ✅ |
| `gyeongju-course-waypoint-relations-v1.jsonl` | 29 | ✅ |
| `gyeongju-heritage-entities-v1.jsonl` | 5 | ✅ |
| `gyeongju-heritage-relations-v1.jsonl` | 53 (PARENT_CHILD:20, RELATED_ATT:33) | ✅ |
| `gyeongju-cultural-guide-relations-v1.jsonl` | 17 | ✅ |
| `gyeongju-recommendation-collections-v1.jsonl` | 7 | ✅ |
| `gyeongju-recommendation-place-relations-v1.jsonl` | 14 | ✅ |

---

## 3. 섹션별 QA 결과

### 3.1 입력·산출물 무결성 (섹션 1)

| 항목 | 기대값 | 실제값 | 판정 |
|---|---|---|---|
| baseline candidates | 831 | 831 | ✅ PASS |
| full-v1 candidates | 914 | 914 | ✅ PASS |
| source facts | 1,158 | 1,158 | ✅ PASS |
| manual review queue | 38 | 38 | ✅ PASS |
| rec collections | 7 | 7 | ✅ PASS |
| courses | 5 | 5 | ✅ PASS |
| waypoints | 29 | 29 | ✅ PASS |
| heritage entities | 5 | 5 | ✅ PASS |
| heritage RELATED_ATT | 33 | 33 | ✅ PASS |
| event entities | 7 | 7 | ✅ PASS |
| event listings | 10 | 10 | ✅ PASS |
| multilingual entities | 92 | 92 | ✅ PASS |
| new candidates (914-831) | 83 | 83 | ✅ PASS |
| **candidate_id 중복** | **0** | **10** | ❌ **CRITICAL** |
| **source_fact_id 중복** | **0** | **10** | ❌ **CRITICAL** |
| broken FK | 0 | 0 | ✅ PASS |
| manifest SHA (정규화 산출물) | 0 mismatch | 0 mismatch | ✅ PASS |
| manifest SHA (비산출물) | — | 4 mismatch | ⚠️ MEDIUM |

**CRITICAL 결함 상세**:

`candidate_id` 중복 10건 (총 중복 레코드 수 ~41건):

| candidate_id | 중복 레코드 수 | 레스토랑명 |
|---|---|---|
| `gyeongju-VG-NEW-REST-535f40400604084d` | 14 | 고도벌 한정식 |
| `gyeongju-VG-NEW-REST-535f404006040944` | 12 | (VG 식당) |
| `gyeongju-VG-NEW-REST-535f404006040946` | 5 | (VG 식당) |
| `gyeongju-VG-NEW-REST-535f404006050940` | 4 | (VG 식당) |
| `gyeongju-VG-NEW-REST-535f404006050941` | 3 | (VG 식당) |
| 기타 5건 | 2–3 | — |

**근본 원인**: VisitGyeongju hexId를 candidate_id로 변환 시 전체 hexId(34자) 대신 첫 16자(페이지 수준 prefix)만 사용. 동일 페이지의 여러 식당이 동일 candidate_id 공유. `source_fact_id`도 같은 방식으로 생성되어 동일 문제 발생.

**수정 권고**: `gyeongju_normalize_full_v1.py`에서 VG 식당 candidate_id/source_fact_id 생성 로직을 전체 hexId 기반으로 수정. 별도 정규화 수정 태스크 필요.

---

### 3.2 수동 검토 큐 38건 전수 QA (섹션 2)

| entity_type | 건수 | QA 판정 |
|---|---|---|
| attraction | 4 | 4 × REVIEW_CONFIRMED |
| restaurant | 13 | 13 × REVIEW_CONFIRMED |
| souvenir | 7 | 7 × REVIEW_CONFIRMED |
| monthly_rec_place_link | 8 | 8 × REVIEW_CONFIRMED (area_uid 기반, 라이브 확인 필요) |
| cultural_guide | 6 | 6 × REVIEW_CONFIRMED |
| **합계** | **38** | **38건 전수 판정 완료** |

모든 38건: 기존 review 사유 정당성 확인됨. 자동 승격 가능한 항목 0건.

---

### 3.3 추천여행지 area_uid 8건 QA (섹션 3)

| area_uid | 로컬 근거 | QA 판정 |
|---|---|---|
| 357 | 없음 | INSUFFICIENT_EVIDENCE |
| 358 | 없음 | INSUFFICIENT_EVIDENCE |
| 359 | 없음 | INSUFFICIENT_EVIDENCE |
| 365 | 없음 | INSUFFICIENT_EVIDENCE |
| 43565 | 없음 | INSUFFICIENT_EVIDENCE |
| 43567 | 없음 | INSUFFICIENT_EVIDENCE |
| 43568 | 없음 | INSUFFICIENT_EVIDENCE |
| 43571 | 없음 | INSUFFICIENT_EVIDENCE |

**판정**: 8건 전원 `INSUFFICIENT_EVIDENCE` — 로컬 소스(source_facts, att_audit)에서 직접 확인 불가. 8건 모두 `gyeongju.go.kr` 상세 페이지 라이브 확인 필요. normalization의 `MANUAL_REVIEW` 판정은 적절함.

---

### 3.4 관광지 identity QA (섹션 4)

| 항목 | 결과 |
|---|---|
| HC 145건 — 강한 근거 보유 | ✅ 145/145 |
| HC — GPS 단독 | ✅ 0건 |
| HC — fuzzy name 단독 | ✅ 0건 |
| MR 4건 — REVIEW_CONFIRMED | ✅ 4/4 |
| NEW 10건 — 신규 확인 | ✅ 10/10 (baseline 중복 없음) |
| 위험 표본 30건 (신뢰도 낮은 HC) | ✅ evidence 구조 정상 |

**판정**: 관광지 identity 결함 0건. ✅ PASS

---

### 3.5 식당 identity QA (섹션 5)

| 항목 | 결과 |
|---|---|
| HC 5건 — `PILOT_VG_CAND_HIGH_CONFIDENCE` | ✅ 5/5 강한 근거 확인 |
| MR 13건 — REVIEW_CONFIRMED | ✅ 13/13 |
| NEW 66건 — 신규 확인 | ✅ 66/66 (단, 아래 duplicate 신호 확인) |

**판정**: 식당 identity 직접 결함 0건. 단, S7 신규 candidate 중복 감사에서 3건의 VG 식당이 기존 baseline candidate와 이름+전화 동시 일치 → HIGH 결함으로 분류.

---

### 3.6 기념품 8건 QA (섹션 6)

| 항목 | 결과 |
|---|---|
| PHYSICAL_PLACE_CONFIRMED | 8/8 |
| 공식 URL 보유 | 8/8 |
| baseline 연결 | 1건 (`gyeongju-KTO12-2717319`, 배리삼릉공원) ✅ |
| 신규 candidate | 7건 |
| category_proposal 적절성 | 8/8 적절 |
| 동일 관광지·식당 entity 여부 | 0건 (모두 독립) |

**배리삼릉공원 연결 독립 확인**: baseline `gyeongju-KTO12-2717319` ∈ baseline_831 ✅

**판정**: 기념품 8건 결함 0건. ✅ PASS

---

### 3.7 신규 candidate 83건 중복·관계 QA (섹션 7)

| 판정 | 건수 |
|---|---|
| NO_DUPLICATE_SIGNAL | 33 |
| POSSIBLE_DUPLICATE | 9 |
| LIKELY_DUPLICATE | 41 (unique cid: 5건) |
| COLOCATED_SEPARATE | 0 |
| 합계 | 83 |

**LIKELY_DUPLICATE 5개 unique candidate_id**:

| candidate_id | 명칭 | 매칭 신호 | 충돌 대상 |
|---|---|---|---|
| `gyeongju-VG-NEW-REST-535f40400604084d` | 고도벌 한정식 | 이름+전화 | `gyeongju-GJ08-733`, `gyeongju-GJ09-733` |
| `gyeongju-VG-NEW-REST-535f40400605094c` | (VG 식당) | 이름+전화 | `gyeongju-GJ08-6733` |
| `gyeongju-VG-NEW-REST-535f404007020940` | (VG 식당) | 이름+전화 | `gyeongju-GJ09-372` |
| `gyeongju-WEB-NEW-ATT-307` | (웹 관광지) | 전화 | `gyeongju-KTO15-*` (복수) |
| `gyeongju-WEB-NEW-ATT-390` | (웹 관광지) | 전화 | `gyeongju-KTO15-*` (복수) |

처음 3건(VG 식당): 이름+전화 동시 일치 → 기존 GJ08/GJ09 API 후보와 동일 entity 가능성 HIGH. normalization에서 NEW_OFFICIAL_PLACE로 오분류 가능성.  
후 2건(ATT): 공용 전화(리조트·공원) 공유 가능성 — 추가 주소 확인 필요.

**판정**: HIGH 결함 1건 (5 LIKELY_DUPLICATE unique candidate_id). 수동 검토 필요: 50/83건.

---

### 3.8 다국어 QA (섹션 8)

| 항목 | 결과 |
|---|---|
| 전체 entity | 92 |
| 5개 locale 전부 보유 | 92/92 |
| locale_missing | 0 |
| name_missing | 0 |
| MULTI_VALID | 91/92 |
| POSSIBLE_FALLBACK (의심) | 1건 |

**판정**: 다국어 결함 실질적 0건 (1건은 ko fallback 의심 수준, 확인 권장). ✅ PASS

---

### 3.9 행사 QA (섹션 9)

| 항목 | 결과 |
|---|---|
| listing → entity reconciliation | ✅ PASS (10 → 7) |
| 날짜 역전 | 0건 |
| opening_hours에 날짜 저장 | 0건 |
| 공식 URL 없음 | 0건 |
| EVENT_VALID | 2/7 |
| EVENT_REVIEW (검토 필요) | 5/7 |

EVENT_REVIEW 5건: 종료일 미상, 상태 확인 필요 (MUTABLE 콘텐츠). release 판정은 별도 태스크에서 수행.

**판정**: 행사 구조 결함 0건. ✅ PASS

---

### 3.10 Collection·relation QA (섹션 10)

| 영역 | 결과 |
|---|---|
| 추천여행지: UI_LABEL relation | ✅ 0건 |
| 추천여행지: MUTABLE_SOURCE_PAGE 전수 | ✅ 7/7 |
| 추천여행지: relation_id 중복 | ✅ 0건 |
| 여행코스: waypoint order 오류 | ✅ 0건 |
| 여행코스: candidate FK | ✅ 0건 |
| 세계유산: RELATED_ATTRACTION 33건 | ✅ PASS |
| 세계유산: COVERAGE_LIMITATION | ℹ️ 25건 (heritage 전용 area_uid) |
| 문화관광해설: candidate FK | ✅ 0건 |
| 문화관광해설: MANUAL_REVIEW | 5건 (예상) |

**판정**: 모든 relation 구조 결함 0건. ✅ PASS

---

### 3.11 전체 914건 품질 측정 (섹션 11)

| 지표 | Coverage | 비고 |
|---|---|---|
| 이름 (title_ko) | **100.0%** | |
| 주소 | 99.1% | 8건 미보유 |
| 공식 URL | 25.9% | API-only candidate 다수 |
| 좌표 | 74.3% | API 미제공 분 포함 |
| 전화 | (측정됨) | |
| 운영시간 | (측정됨) | |
| 이미지 reference | (측정됨) | |
| district | (측정됨) | |

**category 분포**:

| category | 건수 |
|---|---|
| restaurant | 371 |
| attraction | 334 |
| accommodation | 126 |
| nature | 59 |
| event | 24 |
| 합계 | **914** |

모든 category가 허용 목록 내. 좌표 이상 0건. 권리 위반 이미지 0건.

**판정**: 품질 측정 완료. 결함 0건. ✅ PASS

---

### 3.12 Field selection·conflict QA (섹션 12)

| 항목 | 결과 |
|---|---|
| 전체 field conflict | 5건 |
| SELECTION_VALID | 5/5 |
| provenance 누락 | 0건 |
| 권리 정책 위반 선택 | 0건 |

5건 모두 `WEB_PREFERRED_FOR_OPERATIONAL_INFO` resolution 기록됨.

**판정**: field conflict provenance 결함 0건. ✅ PASS

---

### 3.13 Release/HOLD 준비도 평가 (섹션 13)

| 상태 | candidate 수 |
|---|---|
| 즉시 분류 가능 | 830 |
| targeted fix 후 가능 | 1 |
| normalization fix 필요 | 83 (candidate_id 중복 포함) |
| 행사 분류 가능 | 2 |
| heritage relation 분류 가능 | 33 |
| guide HC relation 분류 가능 | (측정됨) |

**전체 준비도**: `GYEONGJU_NORMALIZATION_QA_HOLD`  
CRITICAL 결함(candidate_id/source_fact_id 중복) 해결 후 분류 착수 가능.

---

## 4. 결함 레지스터

### CRITICAL (2건)

| ID | 섹션 | 결함 | 영향 | 수정 권고 |
|---|---|---|---|---|
| DEF-C01 | S1-id-dup | **candidate_id 중복**: 10개 VG 식당 candidate_id 공유 (~41 레코드) | candidate 고유성 위반; Release/HOLD 분류 불가 | `gyeongju_normalize_full_v1.py` VG hexId 전체 사용으로 수정 |
| DEF-C02 | S1-id-dup | **source_fact_id 중복**: 10개 VG 식당 sfid 공유 (~64 레코드) | source fact 고유성 위반; FK 연결 불신뢰 | 동일 수정 (candidate_id와 root cause 동일) |

### HIGH (1건)

| ID | 섹션 | 결함 | 영향 | 수정 권고 |
|---|---|---|---|---|
| DEF-H01 | S7-dup | **5개 신규 candidate LIKELY_DUPLICATE**: 3건 VG 식당(이름+전화 baseline 일치), 2건 ATT(공용 전화 의심) | 3건은 기존 baseline candidate와 동일 entity 가능성; NEW_OFFICIAL_PLACE 오분류 | 수동 검토 후 기존 candidate와 병합 또는 분리 결정 |

### MEDIUM (1건)

| ID | 섹션 | 결함 | 영향 | 수정 권고 |
|---|---|---|---|---|
| DEF-M01 | S1-sha-non-norm | **비정규화 파일 manifest SHA 불일치 4건** (scripts 2건, docs 1건, contracts 1건) | manifest 최신성 저하; 이후 브랜치에서 해당 파일이 수정됨 | manifest를 최신 브랜치 SHA로 갱신 |

### LOW (1건)

| ID | 섹션 | 결함 | 영향 | 수정 권고 |
|---|---|---|---|---|
| DEF-L01 | S1-heritage-cov | **Heritage COVERAGE_LIMITATION**: RELATED_ATTRACTION 25 area_uid가 web_att_159 밖 | 해당 area_uid의 place identity 미확인 | web attraction 수집 범위를 heritage-linked area_uid까지 확장 |

---

## 5. 불변 조건 검증

| 불변 조건 | 판정 |
|---|---|
| candidate_id 중복 0 | ❌ FAIL (10건) |
| source_fact_id 중복 0 | ❌ FAIL (10건) |
| broken FK 0 | ✅ PASS |
| GPS-only HC 0 | ✅ PASS |
| fuzzy-name-only HC 0 | ✅ PASS |
| UI_LABEL rec relation 0 | ✅ PASS |
| 행사 날짜 역전 0 | ✅ PASS |
| 날짜→opening_hours 저장 0 | ✅ PASS |
| 권리 위반 이미지 0 | ✅ PASS |
| 기존 normalized 파일 수정 | ✅ 없음 |
| 기존 raw 파일 수정 | ✅ 없음 |
| JSON 파싱 오류 0 | ✅ PASS |
| HTTP 요청 | ✅ 0건 |

---

## 6. 산출물 (17개 파일)

### QA 파일 (16개) — `data/tourapi/validation/gyeongju/`

| 파일 | 내용 |
|---|---|
| `gyeongju-normalization-input-integrity-qa-v1.json` | 입력 무결성: 수치·SHA·ID·FK |
| `gyeongju-manual-review-independent-qa-v1.jsonl` | 수동 검토 38건 전수 QA |
| `gyeongju-recommendation-area-uid-qa-v1.jsonl` | area_uid 8건 로컬 근거 QA |
| `gyeongju-attraction-identity-independent-qa-v1.jsonl` | 관광지 HC145/MR4/NEW10 |
| `gyeongju-restaurant-identity-independent-qa-v1.jsonl` | 식당 HC5/MR13/NEW66 |
| `gyeongju-souvenir-independent-qa-v1.jsonl` | 기념품 8건 |
| `gyeongju-new-candidate-duplicate-audit-v1.jsonl` | 신규 83건 중복 감사 |
| `gyeongju-multilingual-independent-qa-v1.jsonl` | 다국어 92×5 |
| `gyeongju-event-independent-qa-v1.jsonl` | 행사 7건 + listing 10건 |
| `gyeongju-relation-integrity-qa-v1.json` | 추천/코스/유산/해설 관계 |
| `gyeongju-candidate-quality-coverage-v1.json` | 914건 품질 coverage |
| `gyeongju-coordinate-anomaly-audit-v1.jsonl` | 좌표 이상 감사 |
| `gyeongju-field-selection-provenance-qa-v1.jsonl` | field conflict 5건 |
| `gyeongju-independent-qa-defect-register-v1.jsonl` | 결함 레지스터 5건 |
| `gyeongju-release-readiness-assessment-v1.json` | 준비도 평가 |
| `gyeongju-normalization-independent-qa-summary-v1.json` | QA 전체 요약 |

### QA 스크립트 (1개)

| 파일 | 내용 |
|---|---|
| `scripts/gyeongju_normalization_independent_qa_v1.py` | 독립 QA 스크립트 v1.0.0 (13개 섹션, 총 ~500줄) |

---

## 7. 미수정 확인

| 항목 | 결과 |
|---|---|
| `data/tourapi/normalized/gyeongju/` 기존 파일 수정 | 미수정 ✅ |
| V3 raw snapshot 수정 | 미수정 ✅ |
| `gyeongju_normalize_full_v1.py` 수정 | 미수정 ✅ |
| `gyeongju_culture_web_collect.py` 수정 | 미수정 ✅ |
| `scripts/visitgyeongju_collect.py` 수정 | 미수정 ✅ |
| source facts 1,158건 수정 | 미수정 ✅ |
| baseline 831건 수정 | 미수정 ✅ |
| DB/migration/배포 | 없음 ✅ |
| `src/` · `functions/` · `supabase/` 수정 | 없음 ✅ |
| 비밀값 출력/커밋 | 없음 ✅ |

---

## 8. 다음 권고

### 즉시 필요 (CRITICAL 해결 전 Release/HOLD 착수 불가)

**TASK-GYEONGJU-VG-CANDIDATE-ID-FIX-V1** (신규 태스크 필요):
- `gyeongju_normalize_full_v1.py`의 VG 식당 candidate_id 생성 로직 수정
- hexId 16자 → 전체 hexId 사용
- 중복 candidates 제거 후 재정규화
- 중복 source_fact_id 해결 (별도 sfid 체계 또는 전체 hexId 사용)

### 이후 권고

**TASK-GYEONGJU-LIKELY-DUPLICATE-RESOLUTION-V1** (선택):
- DEF-H01의 5개 LIKELY_DUPLICATE candidate 수동 검토
- 3개 VG 식당: GJ08/GJ09 baseline과 병합 또는 분리 결정
- 2개 ATT: 공용 전화 확인 후 처리

**area_uid 8건 라이브 확인** (추천여행지 identity):
- gyeongju.go.kr 상세 페이지 직접 확인
- 2020-12 이달의 추천여행지 복원 또는 PAST_OR_REMOVED_OFFICIAL_PLACE 처리

---

*본 완료보고서는 검증 결과를 포함하며 TASK-GYEONGJU-NORMALIZATION-INDEPENDENT-QA-V1의 전체 작업을 기록한다.*

작업을 완료했습니다
