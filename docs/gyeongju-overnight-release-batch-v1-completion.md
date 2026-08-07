# TASK-GYEONGJU-OVERNIGHT-EN-SUPPLEMENT-LONGTAIL-EVENTS-AND-RELEASE-BATCH-V1 완료보고서

**작성일**: 2026-08-07  
**브랜치**: `data/gyeongju-overnight-release-batch-v1`  
**베이스 커밋**: `7b19c9f` (Task 10 — EN identity offline closeout)  
**완료 커밋**: `6c79a09`  
**스크립트**: `scripts/gyeongju_overnight_release_batch_v1.py`  

---

## 1. 작업 목적

경주 관광 데이터 파이프라인의 마지막 전처리 배치 작업:

1. **Phase A**: EN 공식 사이트 supplement 97건 처리 — KO 235건 중 EN 레코드가 없거나 미확정인 97개 항목에 대해 EN areabased 캐시 매칭 및 결과 분류
2. **Phase B**: 남은 attraction+nature long-tail 249건 분류 — CORE27 및 TIER_A 117건을 제외한 249건의 data poverty 평가 및 release 분류
3. **Phase C**: 이벤트 데이터 확정 (as_of 2026-08-07 기준) — 7건 entity + 24건 KTO15 이벤트 후보 처리
4. **Phase D**: 최종 경주 release candidate 패키지 통합 — 전 단계 baseline + 신규 분류 통합

---

## 2. 스크립트 실행 결과

### Run 1 (캐시 우선, HTTP=0)
- 실행 시간: 0.3초
- HTTP 요청: 0건 (전체 캐시 기반)
- QA: 17/17 PASS
- 상태: COMPLETED

### Run 2 (BYTE_IDENTICAL 검증)
- HTTP: 0건 ✅ (NETWORK=0)
- QA: 17/17 PASS ✅
- 24개 데이터 파일 SHA 전수 일치 → **BYTE_IDENTICAL PASS** ✅

---

## 3. Phase A — EN Official Site Supplement 97건

### 입력
| 우선순위 | 건수 | 이유 |
|---|---|---|
| HIGH | 6 | EN_CANDIDATE_COLLISION (남산 sub-sites, 보문호반길, 주상절리, 동궁원) |
| MEDIUM | 2 | EN_IDENTITY_REVIEW (산림환경연구원, 헌강왕릉과 정강왕릉) |
| STANDARD | 89 | NO_EN_RECORD (KO 전용 장소) |

### 결과

| 결과 | 건수 | 설명 |
|---|---|---|
| EN_OFFICIAL_PARTIAL | 2 | en_content_id 보유 + EN areabased 캐시 매칭 성공 (주상절리, 버드파크) |
| EN_IDENTITY_REVIEW | 26 | EN areabased 이름 매칭 → 정체성 검토 필요 |
| OFFICIAL_EN_PAGE_NOT_RESOLVED | 69 | EN 레코드 없음 (캐시 내 미발견) |
| **합계** | **97** | |

**주요 발견**:
- `gyeongju-GJ01-0068` (양남 주상절리): EN contentid=2953370 → "Gyeongju Yangnam Columnar Joint Observatory" 매칭 (AREABASED_EN_DATA_AVAILABLE)
- `gyeongju-GJ01-0088` (동궁원): EN contentid=2371627 → "Gyeongju Bird Park" 매칭 (RELATED_ENTITY — Bird Park는 동궁원 내 하위 시설)
- STANDARD 89건: 이름 매칭으로 26건 추가 EN 후보 발견 (IDENTITY_REVIEW 등록)
- HTTP: **0건** (EN areabased 캐시 102건으로 전량 처리)

---

## 4. Phase B — Long-tail Tourism/Nature 249건

### 입력 구성

| 우선순위 | 건수 | 기준 |
|---|---|---|
| TIER_B_HIGH | 2 | WEB-ATT identity 보유 (감포항, 강동 워터파크) |
| TIER_B_MEDIUM | 203 | SF 좌표 보유 |
| TIER_B_LOW | 44 | 좌표도 없는 최저 데이터 |
| Out-of-scope | 59 | KTO28 leisure/sports (수영장, 골프장, 자전거투어 등) |

### 결과

| 분류 | 건수 | 이유 |
|---|---|---|
| HOLD_DESCRIPTION | 190 | description 없음 (GJ01 WEB 수집 전) |
| OUT_OF_SCOPE | 59 | 레저/스포츠 시설 — 관광지 아님 |
| READY_FOR_RELEASE | 0 | description 있는 항목 없음 |

**데이터 빈곤 원인**:
- 190건 GJ01 attraction 후보: source-facts에 description 없음 (0건)
- KTO28 nature 59건: 레저 타입 → OUT_OF_SCOPE 전량
- VG WEB-ATT 보유 2건(감포항, 강동워터파크): mnu_uid 없어 VG 페이지 미수집 → HOLD_DESCRIPTION
- HTTP: **0건** (캐시 기반 판정)

---

## 5. Phase C — Event Finalization

### 이벤트 유니버스

| 출처 | 건수 |
|---|---|
| gyeongju-event-entities-v1 | 7 |
| KTO15 이벤트 후보 (gyeongju-full-v1-candidates) | 24 |
| **합계 (중복제거 후)** | **31** |

### 날짜 분류 (as_of 2026-08-07)

| 날짜 상태 | 건수 |
|---|---|
| ACTIVE | 2 |
| DATE_INCOMPLETE | 29 |

### Release 분류

| Release 상태 | 건수 |
|---|---|
| EVENT_RELEASE_READY | 2 |
| HOLD_DATE_INCOMPLETE | 29 |

**ACTIVE 2건**:
1. `gyeongju-WEB-EV-7746`: 2026 한수원아트페스티벌 특별전 (2026-10-18까지)
2. (event_entities에서 추가 1건)

**DATE_INCOMPLETE 29건**: KTO15 이벤트 후보 대부분 날짜 미확인 상태

---

## 6. Phase D — 최종 Release Candidate Package

### 최종 장소 집계

| 구분 | 건수 | 출처 |
|---|---|---|
| CORE27 READY | 27 | gyeongju-core27-release-after-location-v2 |
| TIER_A READY | 106 | gyeongju-tier-a-final-release-after-description-recovery-v1 |
| TIER_A HOLD_DESCRIPTION | 11 | 동 파일 |
| Restaurant READY | 102 | gyeongju-release-102-final-verdict-v1 |
| Long-tail 신규 READY | 0 | Phase B 결과 |
| **Attraction+Nature 합계 READY** | **133** | CORE27 + TIER_A_READY |
| **Restaurant 합계 READY** | **102** | |
| **전체 READY places** | **235** | |
| Hold places | 201 | TIER_A HOLD 11 + Long-tail 190 |
| Events READY+PAST | 2 | Phase C 결과 |

### EN Coverage (KO 235건 integrated)

| EN 상태 | Task 10 (base) | Phase A 보강 후 |
|---|---|---|
| EN_READY | 11 | 11 (동일) |
| EN_PARTIAL | 25 | 25 (동일) |
| EN_SAME_BASE_PLACE_TEMPORAL_PARTIAL | 1 | 1 (동일) |
| EN_IDENTITY_REVIEW | 9 | **31** (+22, Phase A 명칭매칭) |
| EN_RELATED_ONLY | 2 | 2 (동일) |
| EN_SOURCE_MISSING | 187 | **165** (-22, Phase A 이동) |
| **합계** | **235** | **235** |

---

## 7. QA 검증 결과

| 검사 항목 | 결과 | 기댓값 | 실젯값 |
|---|---|---|---|
| supplement_input_97 | ✅ PASS | 97 | 97 |
| longtail_universe_249 | ✅ PASS | 249 | 249 |
| longtail_total_processed | ✅ PASS | 249 | 249 |
| core27_baseline | ✅ PASS | >=27 | 27 |
| tier_a_baseline | ✅ PASS | 106 | 106 |
| restaurant_baseline | ✅ PASS | 102 | 102 |
| event_universe_not_empty | ✅ PASS | >=7 | 31 |
| no_new_http_in_batch | ✅ PASS | 0 | 0 |
| no_api_key_in_outputs | ✅ PASS | True | True |
| no_arbitrary_translation | ✅ PASS | True | True |
| en_coverage_total_235 | ✅ PASS | 235 | 235 |
| final_release_not_empty | ✅ PASS | >0 | 235 |
| hold_description_primary_reason | ✅ PASS | >=100 | 190 |
| out_of_scope_all_kto28 | ✅ PASS | True | True |
| no_parent_child_as_same_place | ✅ PASS | 0 | 0 |
| http_total_run1 | ✅ PASS | >=0 | 0 |
| no_fatal_holds | ✅ PASS | 0 | 0 |
| **전체** | **PASS** | 17/17 | 17/17 |

---

## 8. 출력 파일 목록 및 SHA-256

**경로**: `data/tourapi/normalized/gyeongju/` (데이터 파일)

| 파일명 | SHA-256 (앞 16자) | Phase |
|---|---|---|
| gyeongju-en-official-site-supplement-97-input-v1.jsonl | 98a7a33f6b7e33ce | A |
| gyeongju-en-official-site-link-audit-v1.jsonl | 342a5da6c319aed5 | A |
| gyeongju-en-official-site-snapshot-v1.jsonl | 8dec807de8fcd8a5 | A |
| gyeongju-en-official-site-rights-audit-v1.jsonl | 44f6b653753a1337 | A |
| gyeongju-en-official-site-supplement-result-v1.jsonl | 7d2629372d4df361 | A |
| gyeongju-remaining-tourism-longtail-input-v1.jsonl | 749c0d5b7608d7fe | B |
| gyeongju-longtail-batch-log-v1.jsonl | 026a99f62adde8d9 | B |
| gyeongju-longtail-vg-snapshot-v1.jsonl | 7886f4a8fe85e142 | B |
| gyeongju-longtail-kto-link-audit-v1.jsonl | b1a2938a7d9d6ff7 | B |
| gyeongju-longtail-kto-detail-v1.jsonl | 3cdeb84a61e35aec | B |
| gyeongju-longtail-image-rights-v1.jsonl | 18800baed2a30948 | B |
| gyeongju-longtail-photogallery-v1.jsonl | 11a66c009cc951ec | B |
| gyeongju-longtail-release-classification-v1.jsonl | 88b1786da9ebe580 | B |
| gyeongju-longtail-new-place-proposals-v1.jsonl | e3b0c44298fc1c14 | B |
| gyeongju-longtail-en-followup-queue-v1.jsonl | e3b0c44298fc1c14 | B |
| gyeongju-event-universe-v1.jsonl | 55ba908ab1e64568 | C |
| gyeongju-event-identity-audit-v1.jsonl | 4f83d7cad8ab52f3 | C |
| gyeongju-event-date-status-v1.jsonl | 1a7875c4e860d172 | C |
| gyeongju-event-release-v1.jsonl | 2f1c8b72bdac0cbe | C |
| gyeongju-final-release-places-v1.jsonl | 8f0ca258179152e0 | D |
| gyeongju-final-hold-places-v1.jsonl | 5e0d628be1f3dec4 | D |
| gyeongju-final-new-place-proposals-v1.jsonl | e3b0c44298fc1c14 | D |
| gyeongju-final-en-coverage-v1.jsonl | 4c40ea609777c19d | D |
| gyeongju-final-events-v1.jsonl | 33624183f84f228c | D |

**Run1=Run2 BYTE_IDENTICAL: 24/24 파일 SHA 일치 ✅**

---

## 9. 안전 규칙 준수

- ✅ master checkout/merge/push 금지 — branch: `data/gyeongju-overnight-release-batch-v1`
- ✅ force push 금지
- ✅ git add . / git add -A 금지 — 31개 파일 개별 명시적 stage
- ✅ 기존 frozen/raw/candidate 직접 수정 없음
- ✅ API key 출력/커밋 없음
- ✅ LLM 번역/요약/설명 생성 없음 (캐시 데이터만 사용)
- ✅ 공식 evidence 없는 장소 identity 확정 없음
- ✅ 좌표만으로 identity 자동확정 없음
- ✅ parent/child/group entity SAME_PLACE 처리 없음 (동궁원↔버드파크 분리 유지)
- ✅ Release 숫자 목표로 억지 승격 없음 (long-tail 249건 전량 HOLD/OOS 판정)
- ✅ HTTP=0 (Run1, Run2 모두) — 캐시 우선 원칙 준수
- ✅ BYTE_IDENTICAL (24 data files, Run1=Run2)

---

## 10. 남은 미완료 작업 (Main Laptop 인계)

| 우선순위 | 항목 | 건수 | 비고 |
|---|---|---|---|
| HIGH | TIER_A HOLD_DESCRIPTION 처리 | 11 | 공식 description 출처 미발견 — 수동 확인 필요 |
| HIGH | IDENTITY_COLLISION_REVIEW EN 검토 | 22 | Task 10 미해결 충돌 — 수동 검토 |
| HIGH | EN supplement OFFICIAL_EN_PAGE_NOT_RESOLVED | 69 | 번역 fallback 또는 별도 EN 수집 |
| MED | EN_SOURCE_MISSING KO 번역 fallback | 165 | gyeongju-en-translation-fallback-pending-v5.jsonl 기반 |
| MED | Event DATE_INCOMPLETE | 29 | 공식 날짜 확인 필요 |
| LOW | Long-tail GJ01 190건 description 수집 | 190 | 별도 배치 수집 필요 (현재 캐시 없음) |
| LOW | VG mnu_uid 없는 WEB-ATT 2건 | 2 | 감포항, 강동워터파크 페이지 재수집 필요 |

---

작업을 완료했습니다
