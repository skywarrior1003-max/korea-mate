# TASK-GYEONGJU-MANIFEST-FIX-AND-INDEPENDENT-QA-RERUN-V1 완료보고서

**완료일**: 2026-08-06  
**기반 브랜치**: `data/gyeongju-vg-candidate-id-fix-v1` HEAD `993ed68`  
**작업 브랜치**: `research/gyeongju-normalization-independent-qa-v2`  
**커밋**: `99e47e8`  
**하네스**: PASS  
**최종 판정**: **PASS** — Run1=Run2 14/14 BYTE_IDENTICAL

---

## 1. 검증 결과 (실행 전)

### 전제 조건 확인

| 항목 | 결과 |
|---|---|
| 기반 HEAD `993ed68` | ✅ 확인 |
| DEF-M01: manifest stale SHA 4건 | ✅ PHASE A 수리 대상으로 확인 |
| 기존 QA v1 FAIL (DEF-C01/C02 — 이미 RESOLVED) | ✅ 확인 |
| normalized/raw 파일 변경 금지 | ✅ PHASE A에서 비-정규화 파일만 SHA 갱신 |
| PHASE B: 독립 재계산 (함수 직접 호출 금지) | ✅ 설계 확인 |

### 설계 검토 결과

**차단 블로커**: 없음.  
**더 나은 개선방향**: DEF-H01 재검증을 단순 16-char prefix 기준이 아닌 전체 그룹(34-char 복원 후 14/18/7개 후보)을 전수 검사하는 방식으로 강화 — 이 방향으로 실행.  
**결정**: EXECUTE (개선된 S4 로직 포함)

---

## 2. PHASE A — Manifest DEF-M01 수리

### 2.1 수리 대상 식별

| 파일 | 이유 | 조치 |
|---|---|---|
| `gyeongju-culture-tourism-source-contract-v2.json` | 계약서 이전 브랜치에서 갱신됨 | SHA 갱신 |
| `scripts/gyeongju_culture_web_collect.py` | 스크립트 이전 브랜치에서 갱신됨 | SHA 갱신 |
| `scripts/visitgyeongju_collect.py` | 스크립트 이전 브랜치에서 갱신됨 | SHA 갱신 |
| `docs/tourapi/gyeongju-web-raw-collection-v1-verification.md` | 문서 이전 브랜치에서 갱신됨 | SHA 갱신 |
| `data/tourapi/gyeongju/kto-detail/` | 디렉터리 항목 — SHA 비적용 | SKIP_DIRECTORY |

### 2.2 수리 결과

| 항목 | 값 |
|---|---|
| 총 추적 파일 | 182 |
| SHA 일치 (OK) | 177 |
| 수리됨 (REPAIRED) | 4 |
| 누락 (MISSING) | 0 |
| 권한 오류 | 0 |
| 건너뜀 (SKIP_DIRECTORY) | 1 |
| content_modified | ALL FALSE ✅ |
| 수리 후 불일치 | 0 |

> 감사 파일: `gyeongju-manifest-sha-repair-audit-v1.jsonl` (182 records)

---

## 3. PHASE B — 독립 QA v2 (12개 섹션)

### 3.1 스크립트

- 파일: `scripts/gyeongju_normalization_independent_qa_v2.py`
- 버전: `2.0.0`
- 입력: v1.2.0 정규화 산출물 (DEF-C01/C02 수정 후)
- 출력: 14개 QA 파일 + 1개 SHA 감사 파일

### 3.2 섹션별 결과

#### S1: 입력 무결성

| 항목 | 값 | 판정 |
|---|---|---|
| 전체 candidates | 914/914 | ✅ |
| candidate_id 중복 그룹 | 0 | ✅ |
| source facts | 1158/1158 | ✅ |
| source_fact_id 중복 그룹 | 0 | ✅ |
| 신규 candidates | 83 | ✅ |
| 구 16자 VG candidate_id | 0 | ✅ DEF-C01 RESOLVED |
| 구 16자 VG source_fact_id | 0 | ✅ DEF-C02 RESOLVED |
| 깨진 FK (source fact) | 0 | ✅ |
| **S1 verdict** | **PASS** | ✅ |

#### S2: VG ID 구조

| 항목 | 값 | 판정 |
|---|---|---|
| VG REST sfids | 84 / raw 84건 | ✅ |
| VG SOUV sfids | 8 / raw 8건 | ✅ |
| 구 16자 hexId (REST sfid) | 0 | ✅ |
| 구 16자 hexId (SOUV sfid) | 0 | ✅ |
| 구 16자 hexId (multilingual) | 0 | ✅ |
| REST/SOUV 교차 충돌 | 0 | ✅ |
| **S2 verdict** | **PASS** | ✅ |

#### S3: 의미적 결과 보존

| 항목 | 실제 | 기대 | 판정 |
|---|---|---|---|
| 관광지 HIGH_CONFIDENCE | 145 | 145 | ✅ |
| 관광지 MANUAL_REVIEW | 4 | 4 | ✅ |
| 관광지 NEW_OFFICIAL_PLACE | 10 | 10 | ✅ |
| 식당 HIGH_CONFIDENCE | 5 | 5 | ✅ |
| 식당 MANUAL_REVIEW | 13 | 13 | ✅ |
| 식당 NEW_OFFICIAL_PLACE | 66 | 66 | ✅ |
| 기념품 PHYSICAL_PLACE | 8 | 8 | ✅ |
| **S3 verdict** | **PASS** | — | ✅ |

#### S4: DEF-H01 5건 재검증

| 대상 (v1 ID) | 후보 수 (v1.2.0) | LIKELY_DUPLICATE | 판정 |
|---|---|---|---|
| `535f40400604084d` prefix | 14 | 2 (고도벌한정식·산해계열) | HIGH — 수동 LINK 필요 |
| `535f40400605094c` prefix | 18 | 2 (산해식당·박용자쫄면) | HIGH — 수동 LINK 필요 |
| `535f404007020940` prefix | 7 | 0 | NO_SIGNAL |
| `gyeongju-WEB-NEW-ATT-307` | 1 | 0 | 공유 관광청 전화 → NOT_DUPLICATE |
| `gyeongju-WEB-NEW-ATT-390` | 1 | 0 | 공유 관광청 전화 → NOT_DUPLICATE |

**결론**: DEF-H01은 v1.2.0에서도 부분 존재 (VG-KTO 데이터 소스 중복 — 동일 식당이 두 데이터베이스에 등록됨). 4건 = 이름(공백 제거 정규화) + 전화 신호 기반. WEB-ATT 2건은 관광청 대표 전화(054-779-8585) 공유로 인한 오탐 — NOT_DUPLICATE 확인. 수동 LINK 처리 별도 태스크 필요.

#### S5: 신규 83건 중복 재검색

| 상태 | 건수 |
|---|---|
| NO_DUPLICATE_SIGNAL | 81 |
| POSSIBLE_DUPLICATE | 2 |
| LIKELY_DUPLICATE | 0 |

#### S6: 수동 검토 큐 38건 전수 QA

- 전체 38건 REVIEW_CONFIRMED  
- DATA_FIX_REQUIRED: 0  
- 큐 항목 모두 의도된 상태 확인

#### S7: 다국어 92×5 QA

| 항목 | 값 | 판정 |
|---|---|---|
| multilingual entities | 92/92 | ✅ |
| entity_source_id 중복 | 0 | ✅ |
| 구 16자 hexId entity_source_id | 0 | ✅ |
| 이름 누락 locale 변수 | 0 | ✅ |
| **S7 verdict** | **PASS** | ✅ |

#### S8: 행사·관계 QA

| 항목 | 값 | 기대 | 판정 |
|---|---|---|---|
| 행사 목록 관계 | 10 | 10 | ✅ |
| 행사 엔티티 | 7 | 7 | ✅ |
| 추천 컬렉션 | 7 | 7 | ✅ |
| 코스 | 5 | 5 | ✅ |
| 코스 경유지 | 29 | 29 | ✅ |
| 문화유산 엔티티 | 5 | 5 | ✅ |
| 문화유산 관계 (총계) | 53 | 53 | ✅ |
| RELATED_ATTRACTION | 33 | 33 | ✅ |
| 문화해설 관계 | 17 | 17 | ✅ |
| DEF-L01 COVERAGE_LIMITATION | 25 coverage gaps | — | INFO |
| **S8 verdict** | **PASS** | — | ✅ |

#### S9: Candidate 품질·provenance QA

| 항목 | 값 | 판정 |
|---|---|---|
| 이름 없음 | 0 | ✅ |
| 깨진 source fact 참조 | 0 | ✅ |
| 권리 정책 위반 | 0 | ✅ |
| **S9 verdict** | **PASS** | ✅ |

#### S10: DEF-M01 최종 검증

| 항목 | 값 | 판정 |
|---|---|---|
| 추적 파일 총수 | 182 | |
| SHA 일치 | 181 | |
| SHA 불일치 | 0 | ✅ |
| 누락 파일 | 0 | ✅ |
| 디렉터리 항목 | 1 | (kto-detail/) |
| **DEF-M01 상태** | **RESOLVED** | ✅ |

#### S11: 결함 등록

| 등급 | 건수 | 내용 |
|---|---|---|
| CRITICAL | 0 | — |
| HIGH | 1 | DEF-H01: 4건 LIKELY_DUPLICATE (VG-KTO 중복) |
| MEDIUM | 0 | — |
| LOW | 0 | — |

#### S12: Release/HOLD 준비도

**판정**: `READY_FOR_GYEONGJU_RELEASE_HOLD_CLASSIFICATION_WITH_TARGETED_FIXES`  
**overall_verdict**: `PASS`

### 3.3 재현성 검증

| 항목 | 값 |
|---|---|
| 비교 방식 | Run1 vs Run2 (독립 실행, 동일 입력/파라미터) |
| 비교 파일 수 | 14 |
| BYTE_IDENTICAL | 14 |
| MISMATCH | 0 |
| **판정** | ✅ **BYTE_IDENTICAL** |

---

## 4. DEF 상태 업데이트

| DEF | 등급 | 내용 | 상태 |
|---|---|---|---|
| DEF-C01 | CRITICAL | candidate_id 중복 10그룹 | ✅ **RESOLVED** (이전 태스크) |
| DEF-C02 | CRITICAL | source_fact_id 중복 10그룹 | ✅ **RESOLVED** (이전 태스크) |
| DEF-M01 | MEDIUM | manifest stale SHA 4건 | ✅ **RESOLVED** (이 태스크 PHASE A) |
| DEF-H01 | HIGH | 5 LIKELY_DUPLICATE 후보 | ⚠️ **PARTIALLY OPEN** — 4건 확인 (VG-KTO 중복), WEB-ATT 2건 NOT_DUPLICATE |
| DEF-L01 | LOW | Heritage coverage gap 25건 | OPEN (수집 범위 한계) |

---

## 5. 미수정 확인

| 항목 | 결과 |
|---|---|
| normalized/raw 파일 내용 변경 | 미수정 ✅ |
| baseline 831 ID 수정 | 없음 ✅ |
| identity status 임의 변경 | 없음 ✅ |
| HIGH 중복 후보 임의 병합 | 없음 ✅ |
| 신규 candidate 추가·삭제 | 없음 ✅ |
| HTTP·API·WebFetch 호출 | 0건 ✅ |
| DB/migration/배포 | 없음 ✅ |
| `src/`·`functions/`·`supabase/` 수정 | 없음 ✅ |
| 비밀값 출력/커밋 | 없음 ✅ |

---

## 6. 산출물

### PHASE A (1개)

| 파일 | 내용 |
|---|---|
| `gyeongju-manifest-sha-repair-audit-v1.jsonl` | manifest SHA 수리 감사 (182 records) |

### PHASE B (16개)

| 파일 | SHA256 (16-hex) |
|---|---|
| `gyeongju-normalization-input-integrity-qa-v2.json` | `4fd618e72020b0fe` |
| `gyeongju-vg-id-integrity-qa-v2.json` | `3944cabea4c123fc` |
| `gyeongju-vg-id-integrity-records-v2.jsonl` | `5600c2742592af49` |
| `gyeongju-semantic-preservation-qa-v2.json` | `e3119fb54d507184` |
| `gyeongju-def-h01-recheck-v2.jsonl` | `6c03cad2be123a86` |
| `gyeongju-new-candidate-duplicate-audit-v2.jsonl` | `98e81ff493c2cd5f` |
| `gyeongju-manual-review-queue-qa-v2.jsonl` | `0b84a4abe9a00947` |
| `gyeongju-multilingual-qa-v2.jsonl` | `f29e517c3938d901` |
| `gyeongju-relation-integrity-qa-v2.json` | `e8483375f8797282` |
| `gyeongju-candidate-quality-provenance-qa-v2.json` | `459a60bd473d0aa8` |
| `gyeongju-manifest-consistency-qa-v2.json` | `4929ef5d931867ee` |
| `gyeongju-independent-qa-defect-register-v2.jsonl` | `a8cc4abf276db5da` |
| `gyeongju-release-readiness-assessment-v2.json` | `ce1d761d0e50c61f` |
| `gyeongju-normalization-independent-qa-summary-v2.json` | `ec0757f7d383db0e` |
| `gyeongju-qa-v2-run1-run2-sha-audit.json` | (Run1=Run2 감사) |
| `scripts/gyeongju_normalization_independent_qa_v2.py` | QA v2 스크립트 |

---

## 7. 후속 조치

### DEF-H01 수동 LINK 처리 (별도 태스크)

VG-KTO 중복으로 식별된 4건의 LIKELY_DUPLICATE 후보:

| candidate_id (v1.2.0) | 중복 신호 | 권장 처리 |
|---|---|---|
| `gyeongju-VG-NEW-REST-535f40400604084d0a48034645514b4741` | 이름+전화 → GJ08-733 | LINK→GJ08-733 |
| VG prefix `535f40400604084d`의 다른 1건 | 전화+이름 포함 | LINK 검토 |
| VG prefix `535f40400605094c` 2건 | 전화+이름 포함 신호 | LINK 검토 |

> **금지사항**: 이 태스크에서 임의 병합 금지. 별도 LINK 태스크에서 처리 필요.

---

*본 완료보고서는 검증 내용을 포함한다.  
QA v2 세부 결과: `data/tourapi/validation/gyeongju/gyeongju-normalization-independent-qa-summary-v2.json` 참조.*
