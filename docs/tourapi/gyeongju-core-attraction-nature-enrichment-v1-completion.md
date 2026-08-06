# TASK-GYEONGJU-CORE-ATTRACTION-NATURE-RELEASE-ENRICHMENT-V1 완료보고서

**작성일**: 2026-08-06  
**버전**: v1.0.0  
**브랜치**: `data/gyeongju-core-attraction-nature-enrichment-v1`  
**기준 브랜치·HEAD**: `data/gyeongju-release-rights-resolution-overlay-v1` / `d54620a`  
**최종 판정**: **CONDITIONAL_PASS**  
**상태**: **GYEONGJU_CORE_PLACE_OFFLINE_ENRICHMENT_COMPLETE_WITH_TARGETED_COLLECTION_REQUIRED**

---

## 1. 프롬프트 검증 결과

| 항목 | 결과 |
|------|------|
| 프롬프트 완정성 | ✅ 전 섹션 존재 |
| 차단 이슈 | ✅ 없음 |
| 개선 아이디어 | 없음 — 실행 결정 |
| 브랜치 전략 | origin push 실패 → local HEAD d54620a 기반 생성 (기존 패턴) |

**사전 데이터 탐색 결과** (실행 전 확인):
- attraction: 334건 / nature: 59건 — 전건 HOLD
- `description_ko = 0건` → 전건 TARGETED_COLLECTION 예상 (프롬프트의 GYEONGJU_CORE_PLACE_OFFLINE_ENRICHMENT_COMPLETE_WITH_TARGETED_COLLECTION_REQUIRED 완료상태와 일치)
- 이미지 174건 (전건 `tong.visitkorea.or.kr`) → 계약 미등록 NS(KTO12/KTO28 등) → RIGHTS_EVIDENCE_MISSING 예상
- 스크립트 버그 발견 및 실행 전 수정: `None != ""` is True — `or ""` 누락으로 `has_description=True` 오판 방지

---

## 2. 입력 데이터 (SHA·as_of)

| 파일 | SHA (12자리) |
|------|-------------|
| gyeongju-full-v1-candidates.jsonl | 1ed2c18b2d7b |
| source-facts-full-v1.jsonl | 481fe795f992 |
| gyeongju-candidate-release-hold-v1.jsonl | 0690bdac6741 |
| gyeongju-release-final-rights-overlay-v1.jsonl | 776e5206dbad |
| gyeongju-heritage-relations-v1.jsonl | (frozen) |
| gyeongju-course-waypoint-relations-v1.jsonl | (frozen) |
| gyeongju-cultural-guide-relations-v1.jsonl | (frozen) |
| gyeongju-recommendation-place-relations-v1.jsonl | (frozen) |
| gyeongju_release_hold_classification_v1.py | (frozen) |
| gyeongju_release_rights_resolution_v1.py | (frozen) |

**as_of**: `2026-08-05T04:08:00Z` (normalization summary에서 읽음, datetime.now() 사용 없음)

---

## 3. 대상 후보 현황

| 항목 | 수치 |
|------|------|
| 분석 대상 (attraction + nature HOLD) | **393건** |
| attraction | 334건 |
| nature | 59건 |
| 총 후보 (변경 없음) | 910건 |
| source facts (변경 없음) | 1,158건 |
| 기존 RELEASE 식당 (변경 없음) | 102건 |

---

## 4. HOLD 원인 분포

| 원인 | 전체 | attraction+nature |
|------|------|-----------------|
| HOLD_ENRICHMENT_REQUIRED | 802 | 393 (전건) |
| HOLD_LOCATION_INCOMPLETE | 231 | 168 |
| HOLD_CATEGORY_REVIEW | 7 | 7 |
| HOLD_IDENTITY_REVIEW | 15 | 2 |
| HOLD_NO_CURRENT_OFFICIAL_SOURCE | 24 | 0 |

---

## 5. 우선순위 분포

| Tier | 수 | 기준 |
|------|---|------|
| CORE_TIER_1 | **27** | 문화해설 연결 + 복수 소스 + 핵심 필드 다수 |
| CORE_TIER_2 | **121** | GJ 공식 API + 코스/추천 연결 + 필드 보유 |
| SUPPORTING_TIER | 226 | 기본 KTO 데이터, 필드 일부 보유 |
| NOT_CURRENT_PRIORITY | 19 | identity 검토 또는 데이터 불충분 |

**문화해설 서비스 연결**: 11건 (HIGH_CONFIDENCE, CORE_TIER_1 승격)

---

## 6. 필드 가용성 분석 (393건)

| 필드 | 보유 | 미보유 |
|------|------|--------|
| 이름(title_ko) | 393 (100%) | 0 |
| 주소(address) | 386 (98%) | 7 |
| 좌표(lat+lng) | 225 (57%) | 168 |
| 이미지(image_url) | 174 (44%) | 219 |
| 설명(description_ko) | **0 (0%)** | **393** |

**핵심 발견**: description_ko가 전 393건에서 부재. source facts의 `description_reference`는 실제 텍스트가 아닌 자기 참조 ID → offline에서 설명 보강 불가.

---

## 7. 이미지·설명 권리 판정

### 이미지 (393건)
| 판정 | 수 | 사유 |
|------|---|------|
| NO_IMAGE | 219 | image_url 없음 |
| RIGHTS_EVIDENCE_MISSING | 174 | KTO12/KTO28/KTO32/KTO38 계약 미등록 |
| **domain_only_positive** | **0** | ZERO_CONFIRMED |

### 설명 (393건)
| 판정 | 수 | 사유 |
|------|---|------|
| NO_DESCRIPTION | 393 | description_ko 전건 부재 |

---

## 8. Offline Resolution 결과

| Resolution | 수 | 의미 |
|------------|---|------|
| TARGETED_DESCRIPTION_COLLECTION_REQUIRED | **172** | image+addr+coord 있으나 description 없음 |
| TARGETED_LOCATION_COLLECTION_REQUIRED | **161** | 좌표 누락 (HOLD_LOCATION_INCOMPLETE) |
| TARGETED_MULTIPLE_FIELDS_REQUIRED | **51** | image·description·좌표 복합 누락 |
| CATEGORY_REVIEW_REQUIRED | 7 | 카테고리 확인 필요 |
| NOT_ELIGIBLE_DUE_TO_IDENTITY | 2 | HOLD_IDENTITY_REVIEW |
| **OFFLINE_RELEASE_READY** | **0** | — |
| **OFFLINE_RELEASE_READY_METADATA_LIMITED** | **0** | — |

**신규 RELEASE 제안**: **0건** (offline에서 description 보강 불가)

---

## 9. 표적 수집 Queue (384건)

| collection_mode | 수 |
|-----------------|---|
| OFFICIAL_API_DETAIL_REFRESH | GJ NS 대상 |
| KTO_DETAIL_REFRESH | KTO NS 대상 (다수) |
| KTO_LOCATION_REFRESH | 좌표 누락 대상 |

| Priority Tier별 | 수 |
|-----------------|---|
| CORE_TIER_1 (최우선) | 27 |
| CORE_TIER_2 | 121 |
| SUPPORTING_TIER | 226 |
| NOT_CURRENT_PRIORITY (제외) | 9 |

**전체 재수집 권고: 없음** — 후보별 API endpoint·source_record_id 명시된 표적 queue만 생성

---

## 10. 도시 제품 구성 가능성

| 구분 | 현재 상태 |
|------|----------|
| 식당 RELEASE | 102건 |
| 관광지·자연 RELEASE | **0건** (offline 불가) |
| 1일 일정 구성 | ❌ 불가 (관광지 0건) |
| 2일 일정 구성 | ❌ 불가 |
| 3일 일정 구성 | ❌ 불가 |
| **City Core-Set Readiness** | **CITY_CORE_SET_NOT_READY** |

**평가 근거**: 데이터 가용성 기준만 평가 (일정 생성 아님). 표적 수집 완료 후 172건(CORE_TIER 포함)이 즉시 RELEASE 검토 가능.

---

## 11. 결함 Register

| DEF ID | 등급 | 설명 | 상태 |
|--------|------|------|------|
| DEF-ENRICH-M01 | MEDIUM | KTO12/KTO28/KTO32/KTO38 계약 미등록 → 이미지 174건 RIGHTS_EVIDENCE_MISSING | DOCUMENTED |

**domain_only_positive: 0건** ✅

---

## 12. 재현성

| 항목 | 결과 |
|------|------|
| 회귀 테스트 | **11/11 PASS** |
| Run1=Run2 | **16/16 BYTE_IDENTICAL_PASS** |
| 동결 파일 SHA postflight | **13/13 OK** |
| HTTP/API/WebFetch | **0건** |
| 기존 normalized 수정 | **0건** |
| 기존 classification 수정 | **0건** |
| 기존 rights overlay 수정 | **0건** |

---

## 13. 산출물 목록

| 파일 | 크기 |
|------|------|
| `scripts/gyeongju_core_attraction_nature_enrichment_v1.py` | — |
| `gyeongju-core-place-input-audit-v1.json` | 932B |
| `gyeongju-core-place-priority-v1.jsonl` | 183KB |
| `gyeongju-core-place-field-gap-audit-v1.jsonl` | 313KB |
| `gyeongju-core-place-enrichment-overlay-v1.jsonl` | 583KB |
| `gyeongju-core-place-image-rights-v1.jsonl` | 134KB |
| `gyeongju-core-place-description-rights-v1.jsonl` | 138KB |
| `gyeongju-core-place-proposed-release-v1.jsonl` | 257KB |
| `gyeongju-core-place-remaining-hold-v1.jsonl` | 141KB |
| `gyeongju-core-place-targeted-collection-queue-v1.jsonl` | 260KB |
| `gyeongju-core-place-coverage-summary-v1.json` | 693B |
| `gyeongju-city-core-set-readiness-v1.json` | 571B |
| `gyeongju-core-place-frozen-sha-audit-v1.json` | 2.3KB |
| `gyeongju-core-place-defect-register-v1.jsonl` | 281B |
| `gyeongju-core-place-enrichment-summary-v1.json` | 1.2KB |
| `gyeongju-core-place-regression-fixtures-v1.json` | 2.6KB |
| `gyeongju-core-place-reproducibility-v1.json` | 2.7KB |
| `docs/tourapi/gyeongju-core-attraction-nature-enrichment-v1-completion.md` | — |

**manifest**: 253 → 254+건 업데이트 예정

---

## 14. 다음 권고

1. **수동 push** (auto-classifier 차단):
   ```bash
   git push origin data/gyeongju-core-attraction-nature-enrichment-v1
   git push origin data/gyeongju-release-rights-resolution-overlay-v1
   git push origin research/gyeongju-release-102-provenance-rights-audit-v1
   git push origin data/gyeongju-release-hold-classification-v1
   ```

2. **표적 수집 태스크 (최우선 - CORE_TIER_1 27건)**:
   - collection_queue에서 priority_tier=CORE_TIER_1 필터
   - 대부분 KTO_DETAIL_REFRESH → 공공데이터포털 `소개정보조회` API
   - 수집 후 description_ko 보강 → 즉시 RELEASE 검토 가능

3. **KTO 계약 확장** (DEF-ENRICH-M01):
   - KTO12/KTO28/KTO32/KTO38 api_sources를 gyeongju-culture-tourism-source-contract-v1.json에 추가
   - 이미지 174건의 RIGHTS_EVIDENCE_MISSING 해소

4. **CATEGORY_REVIEW 7건** 수동 확인

5. **IDENTITY_REVIEW 2건** 수동 확인 후 재분류

---

*기준 브랜치*: [data/gyeongju-release-rights-resolution-overlay-v1](data/gyeongju-release-rights-resolution-overlay-v1-completion.md)  
*권리 정책*: [multicity-release-provenance-rights-gate-v1.md](multicity-release-provenance-rights-gate-v1.md)

작업을 완료했습니다
