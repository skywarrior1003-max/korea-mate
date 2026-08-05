# TASK-GYEONGJU-MONTHLY-REC-RELATION-FIX-ALT-V1 완료보고서

**완료일**: 2026-08-05  
**기반 브랜치**: `data/gyeongju-normalization-identity-v1` HEAD `47de380`  
**작업 브랜치**: `data/gyeongju-monthly-rec-relation-fix-alt-v1`  
**스크립트**: `scripts/gyeongju_normalize_full_v1.py` v1.0.0 → **v1.1.0**  
**결과**: **PASS** — Run2 = Run3 29/29 BYTE_IDENTICAL

---

## 1. 검증 결과 (실행 전)

### 전제 조건 확인

| 항목 | 결과 |
|---|---|
| 기반 HEAD `47de380` | ✅ 확인 |
| baseline 831 candidates JSONL | ✅ 확인 |
| source facts 1,158건 JSONL | ✅ 확인 |
| web-raw-v3 monthly-rec JSONL 7건 | ✅ 확인 |
| Run1=Run2 22/22 BYTE_IDENTICAL (기반 태스크) | ✅ 확인 |

### 설계 검토 결과

**차단 블로커**: 없음.  
**더 나은 개선방향**: 없음 (V3 frozen data 단독 활용이 최적).  
**결정**: EXECUTE

---

## 2. 사전 분석 (Preflight)

### 2.1 mnu_uid=4134 area_uid 교차 확인

| area_uid | 159 web att 포함 | pilot audit 포함 | identity 판정 |
|---|---|---|---|
| 357 | ❌ | ❌ | MANUAL_REVIEW |
| 358 | ❌ | ❌ | MANUAL_REVIEW |
| 359 | ❌ | ❌ | MANUAL_REVIEW |
| 365 | ❌ | ❌ | MANUAL_REVIEW |
| 43565 | ❌ | ❌ | MANUAL_REVIEW |
| 43567 | ❌ | ❌ | MANUAL_REVIEW |
| 43568 | ❌ | ❌ | MANUAL_REVIEW |
| 43571 | ❌ | ❌ | MANUAL_REVIEW |

**결론**: v1.0.0에서 `LINKED_WEB_SF`로 가정한 것이 잘못됨. ALT에서 `MANUAL_REVIEW`로 정정.

### 2.2 V3 places 필드 구조 확인

V3 raw에서 `places` 필드는 문자열 리스트가 아닌 **`{"name": "BEST", "order": 1}` 형태의 dict 리스트**임을 확인. (v1.0.0 완료보고서에서 "UI 탭 레이블 문자열" 로 기술한 것의 정확한 구조.)

### 2.3 +83 candidate delta reconciliation

| 항목 | 건수 |
|---|---|
| 관광지 NEW_OFFICIAL_PLACE | 10 |
| 식당 NEW_OFFICIAL_PLACE | 66 |
| 기념품 PHYSICAL_PLACE (total) | 8 |
| 기념품 → 기존 candidate 연결 (배리삼릉공원) | 1 |
| 기념품 신규 candidate | 7 |
| **합계** | **83** |

`배리삼릉공원` → `gyeongju-KTO12-2717319` (기존 candidate 연결) → 신규 생성 제외.  
**CANDIDATE_DELTA_RECONCILIATION_PASS** ✅

---

## 3. 스크립트 변경 내역 (v1.0.0 → v1.1.0)

### 3.1 수정 함수

| 함수 | 변경 내용 |
|---|---|
| `build_monthly_rec_collections()` | `as_of` 파라미터 추가; `source_mutability`, `relation_status`, `relation_count`, `as_of`, `source_snapshot_sha`, `source_collected_at` 필드 추가; `identity_status` 수정 (LINKED_WEB_SF→MANUAL_REVIEW); `relation_id` 결정적 생성 추가; `PLACE_LINKS_NOT_FOUND`→`SOURCE_PAGE_NO_OFFICIAL_PLACE_LINKS` 개명 |
| `build_manual_review_queue()` | monthly-rec 섹션: place_name_raw 기반 → area_uid 기반으로 갱신 |

### 3.2 신규 함수

| 함수 | 역할 |
|---|---|
| `make_relation_id(collection_id, area_uid)` | 결정적 relation_id 생성 (SHA256[:16]) |
| `classify_ui_label_type(text)` | UI 레이블 분류 (NAVIGATION/INFORMATION/UNKNOWN) |
| `_place_label_text(item)` | places 필드 dict/str 항목에서 텍스트 추출 |
| `build_ui_label_rejection_audit(data)` | V3 places 필드 거부 감사 |
| `build_mutable_source_audit(data, as_of)` | MUTABLE_SOURCE_PAGE 속성 문서화 |
| `build_relation_status_audit(data)` | v1→ALT relation_status 변경 감사 |
| `build_before_after_comparison(data)` | 필드별 v1 vs ALT 비교 |
| `build_candidate_delta_reconciliation(...)` | +83 delta reconciliation 검증 |
| `build_recommendation_review_queue(mr_place_rel)` | MANUAL_REVIEW 전용 검토 큐 |

### 3.3 summary 필드 추가

- `base_task`: `TASK-GYEONGJU-NORMALIZATION-AND-IDENTITY-V1`
- `collections.monthly_rec_ui_label_collections`: 7
- `collections.monthly_rec_manual_review`: 8
- `monthly_rec_alt`: source_mutability, relation_status_corrected, candidate_delta_reconciliation, total_new_candidates

---

## 4. 실행 결과

### 4.1 이달의 추천여행지 컬렉션 (7건)

| mnu_uid | year-month | relation_status | relation_count |
|---|---|---|---|
| 4134 | 2020-12 | LINKED_VIA_AREA_UID | 8 |
| 3801 | 2023-12 | SOURCE_PAGE_NO_OFFICIAL_PLACE_LINKS | 0 |
| 4075 | 2025-11 | SOURCE_PAGE_NO_OFFICIAL_PLACE_LINKS | 0 |
| 4172 | 2026-05 | SOURCE_PAGE_NO_OFFICIAL_PLACE_LINKS | 0 |
| 4185 | 2026-05 | SOURCE_PAGE_NO_OFFICIAL_PLACE_LINKS | 0 |
| 4306 | 2026-06 | SOURCE_PAGE_NO_OFFICIAL_PLACE_LINKS | 0 |
| 4367 | 2026-05 | SOURCE_PAGE_NO_OFFICIAL_PLACE_LINKS | 0 |

모든 컬렉션: `source_mutability = "MUTABLE_SOURCE_PAGE"` ✅  
모든 컬렉션: `source_snapshot_sha` (V3 raw 레코드 SHA256) 부여 ✅

### 4.2 place_relations 변경 (14건)

**mnu_uid=4134 (8건)**:

| 필드 | v1.0.0 | ALT v1.1.0 |
|---|---|---|
| `identity_status` | `LINKED_WEB_SF` | `MANUAL_REVIEW` |
| `relation_id` | 없음 | `REL-{SHA256[:16]}` (결정적) |
| `source_place_name` | 없음 | `null` (V3 미저장) |
| `name_extract_method` | 없음 | `PLACE_NAME_NOT_IN_V3_SNAPSHOT` |
| `identity_evidence` | 없음 | `["OFFICIAL_AREA_UID_FROM_V3_SNAPSHOT", "NO_EXISTING_SOURCE_FACT_MATCH"]` |

**나머지 6건 (sentinel)**:

| 필드 | v1.0.0 | ALT v1.1.0 |
|---|---|---|
| `identity_status` | `PLACE_LINKS_NOT_FOUND` | `SOURCE_PAGE_NO_OFFICIAL_PLACE_LINKS` |
| `link_basis` | `UNRESOLVABLE` | `SOURCE_PAGE_NO_OFFICIAL_PLACE_LINKS` |
| `relation_id` | 없음 | `REL-{SHA256[:16]}` (결정적) |
| `identity_evidence` | 없음 | `["V3_PLACE_LINKS_EMPTY", "MODERN_PAGE_FORMAT_NO_AREA_UID_LINKS"]` |

### 4.3 신규 감사 파일 (6건)

| 파일 | 내용 |
|---|---|
| `gyeongju-recommendation-ui-label-rejection-audit.jsonl` | V3 places dict 거부 감사 — 7 collections |
| `gyeongju-mutable-source-page-audit.jsonl` | MUTABLE_SOURCE_PAGE 문서화 — 7 collections |
| `gyeongju-recommendation-relation-status-audit.jsonl` | relation_status 변경 감사 — 7건 모두 변경 |
| `gyeongju-recommendation-before-after-comparison.jsonl` | 필드별 v1 vs ALT 비교 |
| `gyeongju-recommendation-relation-review-queue.jsonl` | MANUAL_REVIEW 검토 큐 — area_uid 8건 |
| `gyeongju-candidate-delta-reconciliation-audit.json` | +83 reconciliation PASS 감사 |

### 4.4 수동 검토 큐 변경

| 항목 | v1.0.0 | ALT v1.1.0 | 비고 |
|---|---|---|---|
| 관광지 MANUAL_REVIEW | 4 | 4 | 변경 없음 |
| 식당 MANUAL_REVIEW | 13 | 13 | 변경 없음 |
| 기념품 review_required | 8 | 8 | 변경 없음 |
| monthly_rec MANUAL_REVIEW | 0 | **8** | area_uid 8건 추가 |
| cultural_guide | 5 | 5 | 변경 없음 |
| **합계** | **30** | **38** | +8 |

---

## 5. 재현성 검증

| 검증 | 결과 |
|---|---|
| 비교 방식 | Run2 vs Run3 (Run1 SHA 손상: PowerShell cp949 인코딩 오류) |
| 비교 파일 수 | 29 |
| MATCH | 29 |
| MISMATCH | 0 |
| 판정 | ✅ BYTE_IDENTICAL |

**불변 파일 확인** (v1.0.0 → v1.1.0 SHA 동일):

| 파일 | SHA256 (16-hex prefix) |
|---|---|
| `source-facts-full-v1.jsonl` | `fb1953...` ✅ |
| `gyeongju-attraction-identity-audit-v1.jsonl` | `a3b2d0...` ✅ |
| `gyeongju-restaurant-identity-audit-v1.jsonl` | `feee35...` ✅ |
| `gyeongju-souvenir-classification-audit-v1.jsonl` | `4db096...` ✅ |
| `gyeongju-full-v1-candidates.jsonl` | `794dab...` ✅ |
| `gyeongju-multilingual-entity-link-audit-v1.jsonl` | `c017a1...` ✅ |
| `gyeongju-baseline-831-identity-link-audit.jsonl` | `58494e...` ✅ |

**변경 파일** (예상된 변경):

| 파일 | v1.0.0 | v1.1.0 |
|---|---|---|
| `gyeongju-recommendation-collections-v1.jsonl` | `8fbd27...` | `f51c3f...` |
| `gyeongju-recommendation-place-relations-v1.jsonl` | `93178e...` | `d141b3...` |
| `gyeongju-manual-review-queue-v1.jsonl` | `1113a7...` | `a6dbb1...` |
| `gyeongju-normalization-summary-v1.json` | `b91f2b...` | `30d3e9...` |

---

## 6. 산출물 (28개 파일)

### 신규 (6개)

| 파일 | 내용 |
|---|---|
| `gyeongju-candidate-delta-reconciliation-audit.json` | +83 reconciliation PASS |
| `gyeongju-mutable-source-page-audit.jsonl` | MUTABLE_SOURCE_PAGE 7건 |
| `gyeongju-recommendation-before-after-comparison.jsonl` | v1 vs ALT 비교 |
| `gyeongju-recommendation-relation-review-queue.jsonl` | MANUAL_REVIEW 큐 8건 |
| `gyeongju-recommendation-relation-status-audit.jsonl` | 상태 변경 감사 7건 |
| `gyeongju-recommendation-ui-label-rejection-audit.jsonl` | UI 레이블 거부 감사 |

### 갱신 (4개)

| 파일 | 변경 내용 |
|---|---|
| `gyeongju-recommendation-collections-v1.jsonl` | source_mutability, relation_status, source_snapshot_sha 등 추가 |
| `gyeongju-recommendation-place-relations-v1.jsonl` | relation_id, identity_status 정정, identity_evidence 추가 |
| `gyeongju-manual-review-queue-v1.jsonl` | monthly_rec 8건 추가 (+8) |
| `gyeongju-normalization-summary-v1.json` | task=ALT, base_task, monthly_rec_alt 섹션 추가 |

### 불변 (18개)

이전 태스크(v1.0.0) SHA와 byte-identical 유지 확인.

---

## 7. 미수정 확인

| 항목 | 결과 |
|---|---|
| 기존 canonical 831건 직접 수정 | 미수정 ✅ |
| source facts 1,158건 직접 수정 | 미수정 ✅ |
| V3 raw snapshot 수정 | 미수정 ✅ |
| `gyeongju_culture_web_collect.py` 수정 | 미수정 ✅ |
| 신규 candidate 생성 (monthly-rec area_uid) | 미생성 ✅ |
| HTTP 요청 | 0건 ✅ |
| DB/migration/배포 | 없음 ✅ |
| `src/`·`functions/`·`supabase/` 수정 | 없음 ✅ |
| 비밀값 출력/커밋 | 없음 ✅ |

---

## 8. 후속 조치 (MANUAL_REVIEW 8건)

`gyeongju-recommendation-relation-review-queue.jsonl`에 등록된 8건:

| area_uid | collection_id | 필요 조치 |
|---|---|---|
| 357 | gyeongju-MR-4134 | gyeongju.go.kr 상세페이지 직접 확인 |
| 358 | gyeongju-MR-4134 | 동일 |
| 359 | gyeongju-MR-4134 | 동일 |
| 365 | gyeongju-MR-4134 | 동일 |
| 43565 | gyeongju-MR-4134 | 동일 |
| 43567 | gyeongju-MR-4134 | 동일 |
| 43568 | gyeongju-MR-4134 | 동일 |
| 43571 | gyeongju-MR-4134 | 동일 |

이 8개 area_uid는 2020-12 이달의 추천여행지(mnu_uid=4134)에 링크되어 있으나,  
159 web attractions·pilot audit 어디에도 포함되지 않음. 수동 확인이 필요하다.

---

*본 완료보고서는 검증 내용을 포함하며, 관련 검증보고서는 `docs/tourapi/gyeongju-monthly-rec-relation-fix-v1-verification.md`를 참조.*
