# TASK-GYEONGJU-EN-IDENTITY-OFFLINE-CLOSEOUT-AND-NIGHT-MARKET-SEMANTIC-FIX-V1 완료보고서

**작성일**: 2026-08-07  
**브랜치**: `data/gyeongju-en-identity-offline-closeout-v1`  
**베이스 커밋**: `ac31411` (Task 9 — EN identity semantic safety v2)  
**커밋**: `5764afb`  
**스크립트**: `scripts/gyeongju_en_identity_offline_closeout_v1.py`

---

## 1. 작업 목적

Task 9(EN identity semantic safety v2)에서 남긴 미완 항목을 오프라인으로 마감한다.

1. **EN 102 "기타 18건" 구체적 분류**: `UNASSIGNED_TYPE_INCOMPATIBLE` 8건 재분류 + 나머지 10건 변동 없음 확인
2. **EN_RELATED_ENTITY_ONLY 3건 감사**: 중앙시장 야시장 semantic 재분류, 나머지 2건 CHILD_ENTITY 확정
3. **중앙시장 야시장 Semantic Overlay**: `SAME_BASE_PLACE + TEMPORAL_SUB_EXPERIENCE` 복합 분류 적용
4. **회귀검증 (R1–R9)**: 보문호·첨성대·남산 등 주요 이전 결정 11건 재검증
5. **EN 102 / KO 235 최종 Taxonomy 확정**: `UNASSIGNED_TYPE_INCOMPATIBLE` 0건 잔존
6. **Unassigned Place Proposals 마감**: 신규 장소 제안 6건 + 그룹 개체 1건
7. **Supplement Queue v4 생성**: 97건 (HIGH=6, MEDIUM=2, STANDARD=89)

---

## 2. 사전 검증 결과

| 항목 | 상태 | 비고 |
|---|---|---|
| TYPE_INCOMPATIBLE 8건 재분류 계획 적정성 | ✅ 확인 | 데이터 근거 충분 (EN type / KO category / 주소) |
| EN 1945431 중앙시장 야시장 semantic 근거 | ✅ 확인 | 주소 '295 Geumseong-ro' = '금성로 295', 야간특화 텍스트 존재 |
| EN_RELATED_ENTITY_ONLY 3건 semantic 분석 | ✅ 확인 | GJ01-0068·GJ01-0088 CHILD_ENTITY 구조 확정 |
| false positive regression 파일 키 구조 | ✅ 수정 | `en_cid`·`ko_cid` (not `en_contentid`) |
| collision resolution 파일 키 구조 | ✅ 수정 | `en_cid` (not `en_contentid`) |
| `_extract_ko` 함수 정의 순서 | ✅ 수정 | Phase 8 시작 직전으로 이동 |
| 블로킹 문제 여부 | ✅ 없음 | EXECUTE 결정 |

**결정**: EXECUTE (블로킹 문제 없음)

---

## 3. 스크립트 수정 이력 (실행 전 버그 수정)

### 3.1 Error 1: False Positive Regression 키 오류
```python
# 수정 전 (KeyError: 'en_contentid')
fp_reg_map = {(r["en_contentid"], r["ko_candidate_id"]): r for r in fp_reg}

# 수정 후
fp_reg_map = {(r.get("en_cid", r.get("en_contentid", "")), r.get("ko_cid", r.get("ko_candidate_id", ""))): r for r in fp_reg}
```
- 파일 `gyeongju-en-known-false-positive-regression-v2.jsonl` 실제 키: `en_cid`, `ko_cid`

### 3.2 Error 2: Collision Resolution 키 오류
```python
# 수정 전 (KeyError: 'en_contentid')
collision_map = {r["en_contentid"]: r for r in collision_res}

# 수정 후
collision_map = {r.get("en_cid", r.get("en_contentid", "")): r for r in collision_res}
```
- 파일 `gyeongju-en-known-collision-resolution-v2.jsonl` 실제 키: `en_cid`

### 3.3 Error 3: `_extract_ko` 함수 정의 순서 오류
```python
# 수정 전: 함수가 Phase 8 루프 내 사용부(line 663) 이후에 정의(line 691)
# NameError: name '_extract_ko' is not defined

# 수정 후: Phase 8 print(...) 직후, proposals 리스트 생성 전으로 이동
def _extract_ko(title: str) -> str:
    import re
    match = re.search(r'\(([가-힣\s]+)\)', title)
    return match.group(1).strip() if match else ""
```

---

## 4. 스크립트 실행 결과

### Run 1
- 스크립트 버그 3건 수정 후 정상 실행
- HTTP: 0건 (순수 오프라인)
- Phase 1–12 전 단계 PASS
- QA 검증: PASS ✅

### Run 2 (BYTE_IDENTICAL 검증)
- HTTP: 0건 ✅
- 8개 데이터 파일 SHA 전수 일치 → **BYTE_IDENTICAL_PASS** ✅
- summary/QA JSON: timestamp만 다름 (정상)

---

## 5. 핵심 결과

### 5.1 Phase 1 — "기타 18건" 구체적 분류

| EN cid | EN title | 기존 | Task 10 |
|---|---|---|---|
| 806320 | Gyeongju Namsan Mountain | UNASSIGNED_GROUP_ENTITY | 유지 |
| 1945431 | Gyeongju Jungang Market | UNASSIGNED_PARENT_CHILD_ENTITY | 유지 → Phase 6에서 TEMPORAL로 승격 |
| 2371627 | Gyeongju Bird Park | UNASSIGNED_PARENT_CHILD_ENTITY | 유지 |
| 2953370 | Gyeongju Yangnam Columnar Joint Observatory | UNASSIGNED_PARENT_CHILD_ENTITY | 유지 |
| 3492117 | Library of the Silla Millennium | UNASSIGNED_PARENT_CHILD_ENTITY | 유지 |
| 1862991 | Gyeongju Seongdong Market | UNASSIGNED_TYPE_INCOMPATIBLE | → UNASSIGNED_VALID_EN_PLACE |
| 2992462 | Hwangnambbang | UNASSIGNED_TYPE_INCOMPATIBLE | → UNASSIGNED_OUT_OF_SCOPE |
| 3337817 | Bulguksa Hanok Dongodang | UNASSIGNED_TYPE_INCOMPATIBLE | → UNASSIGNED_PARENT_CHILD_ENTITY |
| 3404180 | Sosomilmil Seoak Branch | UNASSIGNED_TYPE_INCOMPATIBLE | → UNASSIGNED_OUT_OF_SCOPE |
| 3447093 | Infinity Flying | UNASSIGNED_TYPE_INCOMPATIBLE | → UNASSIGNED_OUT_OF_SCOPE |
| 3447661 | Gyochon Cultural Performance | UNASSIGNED_TYPE_INCOMPATIBLE | → UNASSIGNED_OUT_OF_SCOPE |
| 4030396 | Discovery Gyeongju Branch | UNASSIGNED_TYPE_INCOMPATIBLE | → UNASSIGNED_OUT_OF_SCOPE |
| 4054334 | ZERO SPACE Gyeongju | UNASSIGNED_TYPE_INCOMPATIBLE | → UNASSIGNED_OUT_OF_SCOPE |
| 3098009 | Songdaemal Lighthouse | UNASSIGNED_VALID_EN_PLACE | 유지 |
| 3493818 | MCY PARK | UNASSIGNED_VALID_EN_PLACE | 유지 |
| 3493961 | Bullidan Street | UNASSIGNED_VALID_EN_PLACE | 유지 |
| 985137 | Rasunjae | UNASSIGNED_VALID_EN_PLACE | 유지 |
| 994021 | Bomunho Lake | UNASSIGNED_VALID_EN_PLACE | 유지 |

→ **TYPE_INCOMPATIBLE 8건 전원 재분류, 잔존 0건**

### 5.2 Phase 2 — 회귀검증 11건

| ID | 항목 | 결과 |
|---|---|---|
| R1 | EN 994021 보문호 → UNASSIGNED_VALID_EN_PLACE | ✅ PASS |
| R1b | GJ01-0103, GJ08-85에 EN 994021 배정 없음 | ✅ PASS |
| R2 | GJ01-0035 첨성대 → EN 264117, EN_IDENTITY_CONFIRMED | ✅ PASS |
| R2b | GJ01-0014에 EN 264117 중복 배정 없음 | ✅ PASS |
| R3 | EN 806320 경주남산 → UNASSIGNED_GROUP_ENTITY | ✅ PASS |
| R4 | GJ01-0009 국립경주박물관 → EN 268141, EN_IDENTITY_CONFIRMED | ✅ PASS |
| R5 | EN 3492117 신라천년서고 → UNASSIGNED_PARENT_CHILD_ENTITY, assigned_ko_cid=None | ✅ PASS |
| R6 | EN 2371627 버드파크 → UNASSIGNED_PARENT_CHILD_ENTITY, GJ01-0088 → EN_RELATED_ENTITY_ONLY | ✅ PASS |
| R7 | EN 2992462 황남빵 → GJ01-0015에 배정 없음 | ✅ PASS |
| R8 | EN 4054334 ZERO SPACE → GJ08-7128에 배정 없음 | ✅ PASS |
| R9 | EN 4030396 Discovery → GJ08-7496에 배정 없음 | ✅ PASS |

**전체: 11/11 PASS**

### 5.3 Phase 3 — EN_RELATED_ENTITY_ONLY 3건 감사

| KO candidate_id | KO name | EN cid | EN title | 이전 | Task 10 |
|---|---|---|---|---|---|
| gyeongju-GJ01-0034 | 중앙시장 야시장 | 1945431 | Gyeongju Jungang Market | RELATED_PARENT_ENTITY | **EN_SAME_BASE_PLACE_TEMPORAL_EXPERIENCE** |
| gyeongju-GJ01-0068 | 경주 양남 주상절리 | 2953370 | Gyeongju Yangnam Columnar Joint Observatory | CHILD_ENTITY | EN_RELATED_ENTITY_ONLY (유지) |
| gyeongju-GJ01-0088 | 경주 동궁원 | 2371627 | Gyeongju Bird Park | CHILD_ENTITY | EN_RELATED_ENTITY_ONLY (유지) |

### 5.4 Phase 4 — 중앙시장 야시장 Semantic Overlay

- **분류**: SAME_BASE_PLACE + TEMPORAL_SUB_EXPERIENCE
- **근거**: EN addr `295 Geumseong-ro` ↔ KO addr `금성로 295` → **SAME_BASE_ADDRESS** ✅
- **야간특화 텍스트**: EN record 내 야시장 관련 텍스트 확인 ✅
- **EN 102**: `ASSIGNED_SAME_BASE_PLACE_TEMPORAL_EXPERIENCE` (1건)
- **KO 235**: `EN_SAME_BASE_PLACE_TEMPORAL_EXPERIENCE` (1건)

### 5.5 EN 102 최종 Taxonomy (Task 10 확정)

| 분류 | 건수 | 설명 |
|---|---|---|
| ASSIGNED_EXACT | 18 | Level 1 exact match 확정 |
| ASSIGNED_HIGH_CONFIDENCE | 18 | Multi-evidence 고신뢰 확정 |
| ASSIGNED_SAME_BASE_PLACE_TEMPORAL_EXPERIENCE | 1 | 중앙시장 야시장 |
| IDENTITY_COLLISION_REVIEW | 22 | 후속 충돌 검토 필요 |
| UNASSIGNED_OUT_OF_SCOPE | 32 | KO 235 범위 밖 EN |
| UNASSIGNED_VALID_EN_PLACE | 6 | 유효한 경주 장소, KO pair 없음 |
| UNASSIGNED_PARENT_CHILD_ENTITY | 4 | 상위/하위 개체 |
| UNASSIGNED_GROUP_ENTITY | 1 | 그룹 개체 |
| **합계** | **102** | |

> Task 9 대비 변경: `UNASSIGNED_TYPE_INCOMPATIBLE` 8건 → 완전 제거 (VALID_EN_PLACE 1, OUT_OF_SCOPE 6, PARENT_CHILD 1); `ASSIGNED_SAME_BASE_PLACE_TEMPORAL_EXPERIENCE` 신규 추가; `UNASSIGNED_VALID_EN_PLACE` 5→6 (+1)

### 5.6 KO 235 최종 Taxonomy (Task 10 확정)

| 분류 | 건수 | 설명 |
|---|---|---|
| EN_IDENTITY_CONFIRMED | 36 | EN identity 확정 |
| EN_SAME_BASE_PLACE_TEMPORAL_EXPERIENCE | 1 | 중앙시장 야시장 |
| EN_RELATED_ENTITY_ONLY | 2 | 관련 개체만 존재 (CHILD_ENTITY 구조) |
| EN_IDENTITY_REVIEW | 4 | 검토 필요 |
| EN_CANDIDATE_COLLISION | 5 | 후보 충돌 |
| NO_EN_RECORD | 187 | EN 없음 |
| **합계** | **235** | |

> Task 9 대비 변경: `EN_RELATED_ENTITY_ONLY` 3→2 (-1); `EN_SAME_BASE_PLACE_TEMPORAL_EXPERIENCE` 신규 1건

### 5.7 EN Coverage (KO 235 기준)

| 분류 | 건수 |
|---|---|
| EN_READY | 11 |
| EN_PARTIAL | 25 |
| EN_SAME_BASE_PLACE_TEMPORAL_PARTIAL | 1 |
| EN_RELATED_ONLY | 2 |
| EN_IDENTITY_REVIEW | 9 |
| EN_SOURCE_MISSING | 187 |
| **합계** | **235** |

### 5.8 Supplement Queue v4

| 우선순위 | 건수 |
|---|---|
| HIGH | 6 |
| MEDIUM | 2 |
| STANDARD | 89 |
| **합계** | **97** |

---

## 6. QA 검증 결과

| 항목 | 결과 | 기준 |
|---|---|---|
| EN 102 합계 | 102 ✅ | must be 102 |
| KO 235 합계 | 235 ✅ | must be 235 |
| TYPE_INCOMPATIBLE 잔존 | 0건 ✅ | must be 0 |
| 회귀검증 PASS 율 | 11/11 ✅ | must be 11/11 |
| GJ01-0034 → EN_SAME_BASE_PLACE_TEMPORAL_EXPERIENCE | ✅ | 필수 |
| BirdPark SAME_PLACE 금지 (PARENT_CHILD 유지) | ✅ | 필수 |
| False positive 재발 | 0건 ✅ | must be 0 |
| 신규 HTTP 요청 | 0건 ✅ | must be 0 |
| Run 2 BYTE_IDENTICAL (8 data files) | ✅ | all match |

---

## 7. 출력 파일 목록 및 SHA

**경로**: `data/tourapi/normalized/gyeongju/` (data 파일 8건)  
**경로**: `data/tourapi/validation/gyeongju/` (검증 파일 3건)

| 파일명 | SHA-256 (앞 16자) | 건수 |
|---|---|---|
| gyeongju-en-misc-18-classification-v1.jsonl | 8424858a3bb6babf | 18 |
| gyeongju-en-related-3-semantic-audit-v1.jsonl | 969e96848901abe0 | 3 |
| gyeongju-en-night-market-semantic-overlay-v1.jsonl | 9f8144810d669743 | 1 |
| gyeongju-en-known-identity-regression-v1.jsonl | 9276a57f4c48c3c3 | 11 |
| gyeongju-en-102-offline-closeout-v1.jsonl | 0ac235f47bca343a | 102 |
| gyeongju-en-235-offline-closeout-v1.jsonl | 05716d59396afd62 | 235 |
| gyeongju-en-unassigned-place-proposals-closeout-v1.jsonl | c70ba08be98a433a | 7 |
| gyeongju-en-official-site-supplement-queue-v4.jsonl | 28fdf1e219f31fdf | 97 |
| gyeongju-en-offline-closeout-summary-v1.json | (validation) | - |
| gyeongju-en-offline-closeout-qa-v1.json | (validation) | - |
| gyeongju-en-offline-closeout-sha-v1.json | (validation) | - |

---

## 8. 안전 규칙 준수

- ✅ master checkout/merge/push 금지 — branch: `data/gyeongju-en-identity-offline-closeout-v1`
- ✅ force push 금지
- ✅ git add . / git add -A 금지 — 파일별 명시적 stage (12개 파일)
- ✅ 기존 frozen/raw/candidate 파일 수정 없음
- ✅ HTTP/API/WebFetch 0건 (순수 오프라인 작업)
- ✅ 임의 번역/요약/영문 생성 없음 — 기존 데이터 재분류만
- ✅ relation entity를 SAME_PLACE로 임의 승격 없음
- ✅ EN record 삭제 없음
- ✅ API key 출력/커밋 없음
- ✅ KO contentId ≠ EN contentId (JOIN KEY 사용 금지) 준수

---

작업을 완료했습니다
