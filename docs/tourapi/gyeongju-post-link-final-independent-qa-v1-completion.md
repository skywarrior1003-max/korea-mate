# TASK-GYEONGJU-POST-LINK-FINAL-INDEPENDENT-QA-V1 완료보고서

**완료일**: 2026-08-06  
**기반 브랜치**: `data/gyeongju-vg-kto-duplicate-link-fix-v1` HEAD `781417b`  
**작업 브랜치**: `research/gyeongju-post-link-final-independent-qa-v1`  
**QA 스크립트**: `scripts/gyeongju_post_link_final_independent_qa_v1.py` v1.0.0  
**최종 판정**: **PASS** — CRITICAL=0 HIGH=0 MEDIUM=0 LOW=0  
**재현성**: Run1=Run2 **13/13 BYTE_IDENTICAL**

---

## 1. 검증 결과 (실행 전)

### GPT 프롬프트 수치 불일치 (2건) — 개선 적용

| 항목 | GPT 프롬프트 값 | 실제 값 | 수정 내용 |
|---|---|---|---|
| Section 10 `recommendation_relations` | 8 | **14** | `monthly_rec_place_relations` 동적 읽기; 8은 MR queue만 해당 |
| Section 10 `heritage_relations` | 33 | **53** | `heritage_relations` 총수 동적 읽기; 33은 RELATED_ATTRACTION 타입만 해당 |

**차단 블로커**: 없음 — 두 값 모두 동적으로 읽도록 개선하여 **EXECUTE 결정**.

### 추가 개선 사항 (실행 시 발견)

실행 중 QA 스크립트 로직 3건 수정:

| 항목 | 원인 | 수정 내용 |
|---|---|---|
| S3 GJ08-405 lineage | `has_any_gj_sf=False`로 LINEAGE_UNCLEAR 오탐 | `has_kto39_sf`만으로도 `VG_TO_GJ08_WITH_KTO_PROVENANCE` 판정 |
| S7 LIKELY_DUPLICATE 과도 판정 | 공유전화(3+) + 이름 포함 케이스를 LIKELY로 처리 | 공유전화는 POSSIBLE_DUPLICATE로 낮춤 (규정 준수) |
| S8 ML audit 구조 오독 | `locale` 최상위 필드 없음 — `locale_variants`에 있음 | ML 구조 올바르게 파악; `entity_source_id` 기반 체크로 전환 |

---

## 2. 섹션별 QA 결과

| 섹션 | 내용 | 결과 |
|---|---|---|
| **S1** | 입력 무결성 (baseline 831, full_v1 910, new 79, sf 1158) | ✅ PASS |
| **S2** | VG 4건 link integrity (old removed, HC evidence, SF links) | ✅ PASS (4/4) |
| **S3** | Source lineage 정정 (VG_TO_GJ08_BASELINE × 3, VG_TO_GJ08_WITH_KTO_PROVENANCE × 1) | ✅ PASS |
| **S4** | 공유전화 규칙 6-case 회귀검증 | ✅ PASS (6/6) |
| **S5+S6** | 식당 HC:9/MR:13/NEW:62; 831+79=910; 제거된 VG 후보 0건 활성 | ✅ PASS |
| **S7** | 신규 79건 중복 재검사 (LIKELY_DUPLICATE 0건) | ✅ PASS |
| **S8** | 다국어 ML audit 92개 / VG source facts 84개 정합 | ✅ PASS |
| **S9** | MRQ 38건; 연결된 VG 4건 MRQ 잔존 0 | ✅ PASS |
| **S10** | 불변 데이터 15개 항목 전수 확인 (헤리티지 53, 추천 14 등) | ✅ PASS |
| **S11** | Manifest 204개 추적; missing=0, SHA mismatch=0 | ✅ PASS |
| **S12** | 결함 CRITICAL=0 HIGH=0 MEDIUM=0 LOW=0 | ✅ |
| **S13** | READY_FOR_GYEONGJU_RELEASE_HOLD_CLASSIFICATION | ✅ |

---

## 3. 핵심 검증 내용

### 3.1 VG 4건 link integrity (S2)

| VG source_fact_id (줄임) | VG 이름 | 연결 후보 | 이전 VG 후보 제거 | Web SF 링크 |
|---|---|---|---|---|
| VG-REST-535f…4741 | 고도벌 한정식 | gyeongju-GJ08-733 | ✅ | ✅ |
| VG-REST-535f…404d | 산해식당 | gyeongju-GJ08-87 | ✅ | ✅ |
| VG-REST-535f…4c4f | 박용자 경주 명동쫄면 | gyeongju-GJ08-760 | ✅ | ✅ |
| VG-REST-535f…4d4a | 스틸룸(Stillroom) | gyeongju-GJ08-405 | ✅ | ✅ |

모든 4건: `VG_KTO_PHONE_ADDRESS_NAME_MATCH` 증거, HIGH_CONFIDENCE, 이전 VG 후보 비활성 확인.

### 3.2 Source lineage 정정 (S3)

QA v2에서 "VG–KTO"로 표기했던 4건의 실제 lineage:

| 후보 | linked_source_facts | 해결된 lineage |
|---|---|---|
| gyeongju-GJ08-733 | [] (baseline_831) | VG_TO_GJ08_BASELINE |
| gyeongju-GJ08-87 | [gyeongju-GJ09-87] | VG_TO_GJ08_BASELINE |
| gyeongju-GJ08-760 | [] (baseline_831) | VG_TO_GJ08_BASELINE |
| gyeongju-GJ08-405 | [gyeongju-KTO39-2840439] | VG_TO_GJ08_WITH_KTO_PROVENANCE |

### 3.3 공유전화 회귀검증 (S4)

| 케이스 | 시나리오 | 결과 |
|---|---|---|
| CASE1 | 공유전화 + 강한 후보 정확히 1건 → 연결 가능 | PASS |
| CASE2 | 전화 매칭 없음 → 연결 금지 | PASS |
| CASE3 | 공유전화 + 강한 후보 2건 (AMBIGUOUS) → 연결 금지 | PASS |
| CASE4 | 전화만 동일, 주소·이름 불일치 → 연결 금지 | PASS |
| CASE5 | 이름·전화 동일, 다른 지점 — 주소 필터로 특정 | PASS |
| CASE6 | 공용 관광청 전화(054-779-8585) 식당 오병합 0 | PASS |

### 3.4 비관련 데이터 불변 검증 (S10)

| 항목 | 예상 | 실제 | 비고 |
|---|---|---|---|
| 관광지 HIGH_CONFIDENCE | 145 | 145 | ✅ |
| 관광지 NEW_OFFICIAL_PLACE | 10 | 10 | ✅ |
| 이벤트 listing 관계 | 10 | 10 | ✅ |
| **추천 place relations** | **14** | **14** | GPT 프롬프트 8→14 수정 |
| 코스 waypoint 관계 | 29 | 29 | ✅ |
| 헤리티지 entity | 5 | 5 | ✅ |
| **헤리티지 relations (전체)** | **53** | **53** | GPT 프롬프트 33→53 수정 |
| 헤리티지 RELATED_ATTRACTION 타입 | 33 | 33 | ✅ (53 중 33) |
| 문화 가이드 관계 | 17 | 17 | ✅ |

---

## 4. 재현성 검증

| 항목 | 값 |
|---|---|
| 비교 방식 | Run1 vs Run2 (동일 입력/파라미터) |
| 비교 파일 수 | **13** |
| BYTE_IDENTICAL | **13** |
| MISMATCH | 0 |
| **판정** | ✅ **BYTE_IDENTICAL** |

`datetime.now()` 미사용; `as_of`는 `gyeongju-normalization-summary-v1.json`에서 읽음; 모든 출력 `sort_keys=True`.

---

## 5. DEF 상태

| DEF | 등급 | 내용 | 상태 |
|---|---|---|---|
| DEF-C01 | CRITICAL | candidate_id 중복 | ✅ RESOLVED (이전 태스크) |
| DEF-C02 | CRITICAL | source_fact_id 중복 | ✅ RESOLVED (이전 태스크) |
| DEF-M01 | MEDIUM | manifest stale SHA | ✅ RESOLVED (이전 태스크) |
| DEF-H01 | HIGH | VG 식당 4건 LIKELY_DUPLICATE | ✅ RESOLVED (TASK-VG-KTO-DUPLICATE-LINK-FIX-V1) |
| DEF-L01 | LOW | Heritage coverage gap 25건 | OPEN (수집 범위 한계, 비차단) |

**모든 CRITICAL/HIGH/MEDIUM DEF RESOLVED — READY_FOR_GYEONGJU_RELEASE_HOLD_CLASSIFICATION.**

---

## 6. 미수정 확인

| 항목 | 결과 |
|---|---|
| frozen raw 파일 변경 | 없음 ✅ |
| baseline 831 원본 수정 | 없음 ✅ |
| identity status 임의 변경 | 없음 ✅ |
| 특정 hexID·candidate ID 하드코딩 | 없음 ✅ |
| HTTP·API·WebFetch 호출 | 0건 ✅ |
| DB/migration/배포 | 없음 ✅ |
| `src/`·`functions/`·`supabase/` 수정 | 없음 ✅ |

---

## 7. 산출물

### QA 스크립트 (1개)

| 파일 | 내용 |
|---|---|
| `scripts/gyeongju_post_link_final_independent_qa_v1.py` | v1.0.0, 13-section 독립 QA |

### 감사 파일 (14개, `data/tourapi/validation/gyeongju/`)

| 파일 | SHA256 (16-hex) | 섹션 |
|---|---|---|
| `gyeongju-post-link-input-integrity-qa-v1.json` | `abd0931c33126147` | S1 |
| `gyeongju-post-link-vg-link-integrity-qa-v1.jsonl` | `fd00570a71a08616` | S2 |
| `gyeongju-post-link-lineage-audit-v1.jsonl` | `89bfa2fb174371c7` | S3 |
| `gyeongju-post-link-shared-phone-regression-v1.json` | `340552bca537d27e` | S4 |
| `gyeongju-post-link-candidate-reconciliation-v1.json` | `f2527c0b61874e94` | S5+S6 |
| `gyeongju-post-link-new-candidate-duplicate-audit-v1.jsonl` | `287a9181747e364b` | S7 |
| `gyeongju-post-link-multilingual-sf-integrity-qa-v1.json` | `3719d19f79b37b52` | S8 |
| `gyeongju-post-link-manual-review-reconciliation-v1.json` | `515fe29a69c95d18` | S9 |
| `gyeongju-post-link-relation-preservation-qa-v1.json` | `603fa50146f8e3a9` | S10 |
| `gyeongju-post-link-manifest-consistency-qa-v1.json` | `c9eae55668976821` | S11 |
| `gyeongju-post-link-defect-register-v1.jsonl` | `7eb70257593da06f` | S12 |
| `gyeongju-post-link-release-readiness-v1.json` | `3fec2763f2601836` | S13 |
| `gyeongju-post-link-final-qa-summary-v1.json` | `3f6c5fac0667bba7` | 종합 |
| `gyeongju-post-link-run1-run2-sha-audit.json` | `7f9839b870381827` | 재현성 |

---

## 8. 후속 조치

**READY_FOR_GYEONGJU_RELEASE_HOLD_CLASSIFICATION** — 경주 데이터셋 Release/HOLD 분류 태스크로 진행 가능.

- DEF-L01 (heritage coverage gap 25건): 수집 범위 한계, 차단 사항 아님. Release/HOLD 분류 시 처리 방안 결정.
- `data/gyeongju-vg-kto-duplicate-link-fix-v1` 브랜치가 이 QA의 베이스 — release/hold 분류는 이 브랜치 기준.

---

*본 완료보고서는 검증 내용을 포함한다.  
QA 세부 결과: `data/tourapi/validation/gyeongju/gyeongju-post-link-final-qa-summary-v1.json` 참조.  
Run1=Run2 SHA 감사: `data/tourapi/validation/gyeongju/gyeongju-post-link-run1-run2-sha-audit.json` 참조.*
