# TASK-GYEONGJU-EN-IDENTITY-SEMANTIC-SAFETY-CORRECTION-AND-TARGETED-DETAIL-V2 완료보고서

**작성일**: 2026-08-07  
**브랜치**: `data/gyeongju-en-identity-semantic-safety-v2`  
**베이스 커밋**: `8be1664` (Task 7 — EN-first global identity reconciliation)  
**스크립트**: `scripts/gyeongju_en_identity_semantic_safety_correction_v2.py`  
**버전**: v2.1.0 (Phase 6/7 cache_reuse 재현성 수정 포함)

---

## 1. 작업 목적

Task 7(EN-first 글로벌 identity 행렬)에서 발견된 두 가지 구조적 문제를 수정하고, EN 102건 전체에 대해 semantic safety 분류를 적용한다.

1. **Task 7 이중 배정 버그(double-claim bug)**: `exact_assigned_ko` dict 구성 시 두 EN이 동일 KO를 주장할 경우, dict comprehension 덮어쓰기로 마지막 EN이 이기는 문제 → `GJ01-0009 국립경주박물관`에서 EN 268141(Level 1)이 EN 3492117(Level 2)에게 억울하게 밀려난 사례 수정.
2. **NAME_CONTAINMENT_REVIEW**: Level 2/3 substring match를 자동으로 EXACT로 처리하던 방식 폐기 → 의미적 관계(SAME_PLACE / PARENT/CHILD_ENTITY / RELATED_ENTITY 등)를 결정론적 규칙으로 분류.
3. **Targeted Detail Fetch**: identity confirmed EN 36건에 대해 EngService2 상세 정보(detailCommon2·Intro2·Image2) 수집.

---

## 2. 사전 검증 결과

| 항목 | 상태 | 비고 |
|---|---|---|
| Task 7 double-claim 버그 재현 | ✅ 확인 | EN 268141(pos 43, L1) vs EN 3492117(pos 74, L2) |
| GJ01-0009 SILENT_EN_REASSIGNMENT | ✅ 확인 | T6:268141 → T7:3492117 → T9:268141(복원) |
| MANUAL_RESOLUTIONS 3건 충돌 없음 | ✅ 확인 | - |
| KNOWN_FALSE_POSITIVES 3건 검증 | ✅ 확인 | TYPE_INCOMPATIBLE 모두 정상 |
| EN type 코드 데이터 기반 검증 | ✅ 확인 | 76=tourist, 79=shopping/market, 82=restaurant |
| API key 로드 방식 | ✅ 수정 | TOUR_API_KEY= from .env.local (os.environ 오류 수정) |
| Cache 파일명 규칙 | ✅ 수정 | detailCommon2_{en_cid}.json (detail_common_ 오류 수정) |

**결정**: EXECUTE (블로킹 문제 없음)

---

## 3. 스크립트 실행 결과

### Run 1 (HTTP=24, 최초 실행)
- 스크립트 오류 2건 수정 후 정상 실행
- HTTP=24 (EN 8건 × 3 ops), CACHE=75, ERROR=0
- 이후 Phase 6/7 cache_reuse 재현성 문제 발견 → 스크립트 v2.1.0으로 수정

### Run 1b (HTTP=0, 수정 후 재실행)
- **스크립트 수정**: `cache_reuse` EN도 snapshot에 포함, en_cid 정렬 저장
- HTTP=0, CACHE=75, ERROR=0
- Total snapshot: **36건** (fetch=25, cache_reuse=11)

### Run 2b (BYTE_IDENTICAL 검증)
- HTTP=0 ✅ (NETWORK 0)
- CACHE=75, ERROR=0
- 데이터 파일 14개 SHA 전수 일치 → **BYTE_IDENTICAL_PASS** ✅
- summary/QA JSON: timestamp만 다름 (정상)

---

## 4. 핵심 결과

### 4.1 EN 102 최종 배정 분포

| 분류 | 건수 | 설명 |
|---|---|---|
| ASSIGNED_EXACT | 18 | Level 1 exact match 확정 |
| ASSIGNED_HIGH_CONFIDENCE | 18 | Multi-evidence 고신뢰 확정 |
| UNASSIGNED_OUT_OF_SCOPE | 26 | KO 235 범위 밖 EN (서울/부산 관할 등) |
| IDENTITY_COLLISION_REVIEW | 22 | 후속 충돌 검토 필요 |
| UNASSIGNED_VALID_EN_PLACE | 5 | 유효한 경주 장소이나 KO pair 없음 |
| UNASSIGNED_TYPE_INCOMPATIBLE | 8 | TYPE 호환 불가 (attraction↔restaurant 등) |
| UNASSIGNED_PARENT_CHILD_ENTITY | 4 | 상위/하위 개체 (불포함 원칙) |
| UNASSIGNED_GROUP_ENTITY | 1 | 그룹 개체 |
| **합계** | **102** | |

### 4.2 KO 235 최종 Identity 분포

| 분류 | 건수 | 설명 |
|---|---|---|
| EN_IDENTITY_CONFIRMED | 36 | EN identity 확정 |
| EN_RELATED_ENTITY_ONLY | 3 | 관련 개체만 존재 (SAME_PLACE 없음) |
| EN_IDENTITY_REVIEW | 4 | 검토 필요 |
| EN_CANDIDATE_COLLISION | 5 | 후보 충돌 |
| NO_EN_RECORD | 187 | EN 없음 (번역 fallback 필요) |
| **합계** | **235** | |

### 4.3 EN Coverage 분포 (KO 235 기준)

| 분류 | 건수 |
|---|---|
| EN_READY | 11 |
| EN_PARTIAL | 25 |
| EN_RELATED_ONLY | 3 |
| EN_IDENTITY_REVIEW | 9 |
| EN_SOURCE_MISSING | 187 |
| **합계** | **235** |

---

## 5. 주요 수정 내역

### 5.1 Task 7 Double-Claim 버그 수정 (GJ01-0009)

**문제**: Task 7의 `build_ko_assignments` 함수에서 `exact_assigned_ko = {v["assigned_ko_cid"]: k for k, v in en_assignment.items()}` dict comprehension이 두 EN이 같은 KO를 주장할 때 나중에 처리된 EN으로 덮어씀.

- EN 268141 (위치 43번, Level 1 exact): `[국립경주박물관]==[국립경주박물관]`
- EN 3492117 (위치 74번, Level 2): `[국립경주박물관] in [신라천년서고(국립경주박물관)]`
- Task 7 결과: EN 3492117이 GJ01-0009를 빼앗아 EN 268141은 unassigned

**Task 9 수정**:
```python
MANUAL_RESOLUTIONS = {
    ("268141", "gyeongju-GJ01-0009"): ("SAME_PLACE", "Level1_exact: ...", "ASSIGNED_EXACT"),
    ("3492117", "gyeongju-GJ01-0009"): ("CHILD_ENTITY", "신라천년서고 is library WITHIN 국립경주박물관", "UNASSIGNED_PARENT_CHILD_ENTITY"),
}
```

**검증**: GJ01-0009 T6→T9: 268141 → 268141 ✅

### 5.2 Semantic Relation 분류 (결정론적 규칙)

Level 2/3 substring match에 대해 다음 규칙을 순서대로 적용:

1. **TYPE_INCOMPATIBLE** (최우선): KO category와 EN type 비호환
2. **Level 1** → SAME_PLACE (기본)
3. **same_entity_patterns**: "경주" prefix, UNESCO suffix, "일원" → SAME_PLACE
4. **child_entity_patterns**: "서고/도서관", "전망대", "식물원", "버드파크", 숙박시설명 → CHILD_ENTITY
5. **branch_patterns**: "서악점", "중앙점" → 주소 일치 시 SAME_PLACE, 불일치 시 REVIEW_REQUIRED
6. **야시장 vs 시장** → RELATED_PARENT_ENTITY
7. 기타 → NAME_CONTAINMENT_REVIEW

### 5.3 Known False Positives (3건 제거)

| EN cid | KO candidate_id | 판정 | 사유 |
|---|---|---|---|
| 2992462 | gyeongju-GJ01-0015 | TYPE_INCOMPATIBLE | attraction↔restaurant |
| 4054334 | gyeongju-GJ08-7128 | TYPE_INCOMPATIBLE | restaurant↔shopping |
| 4030396 | gyeongju-GJ08-7496 | TYPE_INCOMPATIBLE | restaurant↔shopping |

### 5.4 SILENT_EN_REASSIGNMENT 3건 수정

| KO candidate_id | Task 6 EN | Task 7 EN | Task 9 EN | 판정 |
|---|---|---|---|---|
| GJ01-0009 국립경주박물관 | 268141 | 3492117 (버그) | **268141** (복원) | SAME_PLACE |
| GJ01-0035 대릉원 | 264117 | 2818690 | **264117** (복원) | SAME_PLACE |
| GJ01-0125 불국사 | 3337817 | 264261 | **264261** (유지) | SAME_PLACE (Task7 수정이 오히려 올바른 경우) |

---

## 6. 스크립트 수정 사항 (v2.1.0)

### 6.1 수정 1: Phase 6 cache_reuse 재현성 문제

**문제**: Phase 6은 `detailCommon2_{en_cid}.json` 존재와 `items is not None`으로 cache_reuse/fetch_targets를 분류. Task5 캐시 파일들은 body={}(빈 응답)이라 `items=None` → fetch_targets로 분류. Run 1 HTTP 후 CORR cache에 8건이 추가되면 Run 2에서 fetch_targets가 33→25로 변화 → snapshot 누락.

**수정**: 
- `gyeongju-en-targeted-detail-fetch-input-v2.jsonl`: `fetch_targets + cache_reuse` 전체 36건 저장 (has_pre_cache 필드 추가, en_cid 정렬)
- Phase 7 완료 후 `cache_reuse` EN도 `_load_cache_detail` 함수로 snapshot에 추가
- snapshot을 en_cid 기준 정렬 후 저장

**결과**: Run 1b/2b snapshot 36건 동일, 14개 데이터 파일 BYTE_IDENTICAL ✅

### 6.2 초기 수정 (v2.0 → v2.1 이전)

- `API_KEY = os.environ.get("KTO_API_KEY")` → `load_api_key()` 함수 (.env.local 파싱)
- 캐시 파일명 `detail_common_{en_cid}.json` → `detailCommon2_{en_cid}.json`
- `import os` 제거 (미사용)

---

## 7. QA 검증 결과

| 항목 | 결과 | 기준 |
|---|---|---|
| False positive confirmed | 0 ✅ | must be 0 |
| Parent/Child as SAME_PLACE | 0 ✅ | must be 0 |
| Type incompatible confirmed | 0 ✅ | must be 0 |
| Coord-only confirmed | 0 ✅ | must be 0 |
| KO 235 합계 | 235 ✅ | must be 235 |
| EN 102 합계 | 102 ✅ | must be 102 |
| GJ01-0009 T9 EN | 268141 ✅ | must be 268141 |
| Run 2 HTTP | 0 ✅ | must be 0 |
| BYTE_IDENTICAL (14 data files) | ✅ | all match |

---

## 8. 출력 파일 목록 및 SHA

**경로**: `data/tourapi/normalized/gyeongju/` (data 파일 14건)  
**경로**: `data/tourapi/validation/gyeongju/` (검증 파일 3건)

| 파일명 | SHA-256 (앞 32자) | 건수 |
|---|---|---|
| gyeongju-en-task6-task7-contentid-delta-audit-v2.jsonl | 74c00a6f4a4cb4482f995d3f0e99402a | 235 |
| gyeongju-en-semantic-relation-audit-v2.jsonl | bd96dc5f1a9393f2584f70ac8886ac93 | 102 |
| gyeongju-en-type-compatibility-audit-v2.jsonl | 9a65e3e7aaded9e39ce869abab2abc09 | 10 |
| gyeongju-en-known-false-positive-regression-v2.jsonl | 8263c4fbf759436bc0fd202de176dfec | 3 |
| gyeongju-en-known-collision-resolution-v2.jsonl | 3c6ec54930b734db6a4fc12f48e15507 | 3 |
| gyeongju-en-102-final-semantic-assignment-v2.jsonl | d6d13468926a914956f5d9cdf0cdbd1b | 102 |
| gyeongju-en-unassigned-entity-audit-v2.jsonl | fa382abdac027cb0af91fdb32a7c6121 | - |
| gyeongju-en-new-place-proposals-v2.jsonl | 9a13511486ddd07b3877b733933504ae | - |
| gyeongju-en-final-identity-v2.jsonl | 919d89290960c2da65771f056a65e8bb | 235 |
| gyeongju-en-targeted-detail-fetch-input-v2.jsonl | 3a678374fb5e9a862e07468db3340014 | 36 |
| gyeongju-engservice2-targeted-detail-snapshot-v2.jsonl | e2c11a7eb5bda5545b6cacad4d8d0879 | 36 |
| gyeongju-en-235-final-coverage-v2.jsonl | e6a19fa07ec1be396bd7b50b7aa0e174 | 235 |
| gyeongju-en-official-site-supplement-queue-v3.jsonl | ce73b9c247eb4b694637bbfea467345a | 98 |
| gyeongju-en-translation-fallback-pending-v5.jsonl | 125bdbd2bbcf33cb81044802ee0866c2 | 187 |
| gyeongju-en-semantic-safety-summary-v2.json | 1048b37b8087088831dcceb6949abfa4 | - |
| gyeongju-en-semantic-safety-qa-v2.json | b7575401ceeaddcaf6e1a3cc3e3df988 | - |

---

## 9. 안전 규칙 준수

- ✅ master checkout/merge/push 금지 — branch: `data/gyeongju-en-identity-semantic-safety-v2`
- ✅ force push 금지
- ✅ git add . / git add -A 금지 — 파일별 명시적 stage
- ✅ 기존 frozen/raw/candidate 파일 수정 없음
- ✅ EngService2 전체 재수집 없음 (cache-first, HTTP=24 only on Run1)
- ✅ fuzzy/substring name만으로 EXACT 확정 없음
- ✅ parent/child/group entity를 SAME_PLACE로 확정 없음
- ✅ API key 출력/커밋 없음
- ✅ KO contentId ≠ EN contentId (JOIN KEY 사용 금지)

---

작업을 완료했습니다
