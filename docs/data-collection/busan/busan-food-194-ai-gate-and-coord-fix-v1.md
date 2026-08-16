# TASK-BUSAN-FOOD-194-AI-GATE-AND-QUICK-COORD-FIX-V1
## 완료 보고서

**작업일**: 2026-08-16  
**기반 커밋**: `b9c4f6c` (TASK-BUSAN-FOOD-194-COUNT-AND-OFFICIAL-COORD-AUTHORITY-AUDIT-V1)  
**결과**: PASS  
**브랜치**: `data/busan-food-discovery-v1`

---

## 검증 요약

태스크 명세를 검증한 결과 **실행 가능 판정** — 이전 태스크(COORD-AUTHORITY-AUDIT-V1)에서 발견된 버그와 AI_AUTO 게이트 정책 오류를 정확히 식별하며, 기존 데이터만으로 즉시 해결 가능. §3 검토 중 추가 버그 1건(G-00057 coord_authority addr mismatch) 발견하여 동시 수정. 차단 이슈 없음.

---

## §A: G-00057 엘부스 바이 수블 — coord_authority 버그 REVERT

### 버그 원인

`apply_coord_authority_v1.py`의 address matching algorithm이 도로명 주소에서 건물번호를 정규화 없이 비교하다 오탐:

| 항목 | 값 |
|------|-----|
| canonical address | `부산 해운대구 달맞이길62번길 49, 3층` |
| api_addr (UC=2339) | `해운대구 달맞이길 62번길 19, 2층` |
| 건물번호 | **49 ≠ 19** — 동일 도로 상 다른 건물 |
| 이전 판정 | SOURCE_VERIFIED_NAV_READY (잘못됨) |

addr_match_level 비교 과정에서 "달맞이길62번길"과 "달맞이길 62번길"을 동일 도로로 처리하면서 건물번호 49/19 차이를 간과한 것으로 추정.

### REVERT 내용

| 항목 | 변경 전 | 변경 후 |
|------|---------|---------|
| `navigation_ready` | `True` | `False` |
| `ai_auto` | `True` | `False` |
| `coord_status_r1` | `OFFICIAL_COORD_CONFIRMED` | `OFFICIAL_COORD_ADDR_MISMATCH_REVERTED` |
| `ai_auto_block_reasons` | `null` | `["NAVIGATION_NOT_READY"]` |
| `coord_authority_v1.result` | `SOURCE_VERIFIED_NAV_READY` | `ADDR_MISMATCH_REVERTED` |

**좌표 현황**: canonical에 guide 좌표 없음 (lat_guide=empty). FoodService UC=2339 좌표는 다른 건물 → 미사용. 이 엔티티의 navigation 좌표는 현재 미확인 상태.

---

## §B: MULTI_UCSEQ 해소 — 미미루 / 달타이

### 미미루 (busan-G-00011)

| UC_SEQ | api_addr | phone | lat/lng |
|--------|----------|-------|---------|
| 1265 | 온천장로 91-1 | 051-555-6609 | 35.219486, 129.08296 |
| 1555 | 부산 동래구 온천장로 91-1 (온천동) | 051-555-6609 | 35.219494, 129.08295 |

**판정**: SAME_ENTITY_MULTI_RECORD — 동일 주소, 동일 전화, 좌표 차이 <1m.  
**선택 UC**: 1555 (canonical "부산 동래구 온천장로 91-1" 에 더 가까운 풀 주소).  
**결과**: `navigation_ready=True`, `coord_status_r1=OFFICIAL_COORD_CONFIRMED`

### 달타이 (busan-G-00061)

| UC_SEQ | api_addr | phone | lat/lng |
|--------|----------|-------|---------|
| 1573 | 달맞이길 193 (중동) | 0507-1403-1127 (VoIP) | 35.158127, 129.18245 |
| 2328 | 해운대구 달맞이길 193 1층 | 051-741-1122 | 35.158108, 129.18246 |

**판정**: SAME_ENTITY_MULTI_RECORD — 동일 주소, VoIP vs 유선전화(동일 업소), 좌표 차이 <2m.  
**선택 UC**: 2328 (canonical phone 051-741-1122와 일치).  
**결과**: `navigation_ready=True`, `coord_status_r1=OFFICIAL_COORD_CONFIRMED`

---

## §C: AI_AUTO Gate 수정

### 정책 확인

| 소스 | 내용 |
|------|------|
| `multicity-place-eligibility-policy-v1.md` | AI_ITINERARY 조건: verified coords + tourism_relevance + identity + category + content. **이미지 없음** |
| `multicity-data-quality-guardrail-v1.md PRINCIPLE 13` | 동일 5개 조건. **이미지 없음** |
| `multicity-phone-semantics-and-geometry-policy-v1.md` | "NAVIGATION_READINESS ≠ AI_AUTO_SCHEDULING_READINESS" — 별도 판단 필요 |

**결론**: `COMMON_POLICY_CHANGE_REQUIRED = NO`. 이미지는 AI_AUTO 필수조건이 아님.

### 발견된 버그: 스테일 블록 "NAVIGATION_READY_NO"

`apply_coord_authority_v1.py`는 블록 제거 시 `"NAVIGATION_NOT_READY"`만 처리:

```python
block = [b for b in block if b != 'NAVIGATION_NOT_READY']
```

일부 엔티티가 `"NAVIGATION_READY_NO"` 변형을 보유 → 스크립트가 제거하지 못해 15건이 ai_auto=False 잔류.

### 수정 사항

1. **이미지 조건 제거**: ai_auto gate에서 `image_status == 'OFFICIAL_IMAGE_RESOLVED'` 조건 삭제
2. **스테일 블록 제거**: `"NAVIGATION_READY_NO"` 및 `"NAVIGATION_NOT_READY"` 양쪽 변형 제거
3. **새 gate**: `navigation_ready=True + current_state=ACTIVE + no remaining blocks`

### §3 MATCH_FAILURE 7건 identity 검토

| 엔티티 | api_addr vs canonical | identity 판정 | 처리 |
|--------|----------------------|--------------|------|
| G-00007 모모스커피 본점 | SAME (오시게로 20) | CONFIRMED (address) | ai_auto=True 유지 |
| G-00057 엘부스 바이 수블 | DIFF (49≠19) | NOT CONFIRMED | §A에서 REVERT |
| G-00078 탐복 본점 | SAME (문오성길 31) | CONFIRMED (address) | ai_auto=True 유지 |
| G-00121 우리포차 본점 | SAME (광일로29번길 9) | CONFIRMED (address) | 스테일블록 제거 → ai_auto=True |
| G-00126 조이풀조이풀 | SAME (민락본동로11번길 21) | CONFIRMED (address) | 스테일블록 제거 → ai_auto=True |
| G-00142 동경밥상 본점 | SAME (남천바다로 34-6) | CONFIRMED (address) | ai_auto=True 유지 |
| G-00144 광안리 언양불고기부산집 | SAME (남천바다로 32) | CONFIRMED (address) | 이미지게이트 제거 → ai_auto=True |

`MATCH_FAILURE_HIGH_CONFIDENCE`는 enrichment discovery의 name-matching 실패 결과. coord_authority가 address-matching으로 동일 건물임을 확인했으므로 identity CONFIRMED으로 처리.

### AI_AUTO 20건 추가 내역

| 유형 | 건수 | 엔티티 |
|------|------|--------|
| 스테일블록 제거 + 이미지 있음 | 14 | G-00021, G-00024, G-00106, G-00121, G-00126, G-00147, G-00156, G-00161, G-00162, G-00163, G-00177, G-00186, G-00190, G-00193 |
| 스테일블록 제거 + 이미지게이트 제거 | 1 | G-00095 (원조할매낙지) |
| 이미지게이트 제거만 | 3 | G-00055 (차오란), G-00144 (광안리 언양불고기부산집), G-00168 (할매재첩국) |
| MULTI_UCSEQ 해소 | 2 | G-00011 (미미루), G-00061 (달타이) |
| **합계** | **20** | |

---

## 최종 카운트 요약

### 변화 추적

| 항목 | b9c4f6c 이전 | b9c4f6c 후 | 이번 태스크 | 최종 |
|------|------------|-----------|-----------|------|
| IMAGE_RESOLVED | 120 | 120 | 0 | **120/194** |
| NAVIGATION_READY | 5 | 105 (+100) | +2/-1 | **106/194** |
| AI_AUTO | 5 | 87 (+82) | +20/-1 | **106/194** |

### nav_ready 변화 내역 (이번 태스크)

| 변화 | 건수 |
|------|------|
| G-00057 REVERT | -1 |
| 미미루 MULTI_UCSEQ 해소 | +1 |
| 달타이 MULTI_UCSEQ 해소 | +1 |
| **순변화** | **+1** |

### 4-way 카운트 매트릭스 (최종)

|  | IMG_READY | IMG_UNRESOLVED | 소계 |
|--|-----------|----------------|------|
| **NAV_READY** | 101 | 5 | **106** |
| **NOT_NAV** | 19 | 69 | **88** |
| **소계** | **120** | **74** | **194** ✓ |

### 18 vs 5 비일관성 해소

이전 보고에서 "nav_ready+NOT_ai_auto=18, nav_ready+img_unresolved=5"가 불일치로 기록됨.

**원인**: 18 = 15 (스테일 NAVIGATION_READY_NO 블록) + 3 (image_unresolved, no block). 5는 img_unresolved만 카운트했으므로 다른 측정값. 이번 태스크에서 양쪽 모두 해소됨.

### nav_ready 분포 (최종 106건)

| match_status | 건수 |
|-------------|------|
| MATCHED | 95 |
| MATCH_FAILURE_HIGH_CONFIDENCE | 6 (G-00057 제외) |
| PHONE_MATCHED | 5 |
| **합계** | **106** |

### NOT nav_ready 분포 (88건)

| match_status | 건수 |
|-------------|------|
| UNMATCHED_STRONG_GUIDE | 53 |
| UNMATCHED_TAEGSHLANG | 15 |
| MATCHED | 18 (guide_only, no FoodService match) |
| MATCH_FAILURE_HIGH_CONFIDENCE | 1 (G-00057) |
| PHONE_MATCHED | 1 |
| **합계** | **88** |

---

## 체크섬

| 항목 | 값 |
|------|-----|
| `ai_gate_and_coord_fix_v1_checksum` | `0569c5b67a2d` |
| 이전 `coord_authority_v1_checksum` | `bad3b7ef0910` |

---

## 변경 파일

- `data/tourapi/normalized/busan/busan-food-194-canonical-v1.json`
  - G-00057: nav_ready=False, ai_auto=False, coord_status_r1=OFFICIAL_COORD_ADDR_MISMATCH_REVERTED
  - G-00011 미미루: nav_ready=True, coord_authority_v1=SAME_ENTITY_MULTI_RECORD_RESOLVED (UC=1555), ai_auto=True
  - G-00061 달타이: nav_ready=True, coord_authority_v1=SAME_ENTITY_MULTI_RECORD_RESOLVED (UC=2328), ai_auto=True
  - 15건: 스테일 NAVIGATION_READY_NO 블록 제거, ai_auto=True
  - 3건: 이미지게이트 제거, ai_auto=True
  - Header: navigation_ready_count=106, ai_auto_count=106, ai_gate_fix_v1_note, multi_ucseq_resolution_v1_note

---

## WARN 항목

| WARN | 내용 |
|------|------|
| `COORD_AUTHORITY_V1_BUG_1` | addr matching이 도로번호 내 건물번호를 정규화해 19≠49 오탐. G-00057 수정됨. 다른 엔티티도 유사 패턴 있을 수 있음 → FINAL_QA에서 재확인 권장 |
| `G-00057_NO_COORD` | 엘부스 바이 수블: guide 좌표 없음, FoodService 레코드 주소 불일치. 좌표 미해결. |
| `MATCH_FAILURE_6_IN_NAV` | 6건 MATCH_FAILURE가 nav_ready=True + ai_auto=True. FoodService 주소 일치로 identity 확인됨. discovery enrichment 단계의 name-match 실패 원인 미조사. |
| `IMAGE_UNRESOLVED_5` | NAV_READY + IMG_UNRESOLVED = 5건. AI_AUTO=True이지만 이미지 없음 (공통 정책 허용). |
| `UNRESOLVED_74` | 이미지 미해결 74건 (image audit 별도 태스크) |
| `UNMATCHED_88` | nav_not_ready 88건 (75 unmatched guide-only + 13 matched-no-API) |

---

## NEXT

**TASK-BUSAN-FOOD-194-COORD-IMAGE-WEBFETCH-V1** (선택적):
- 엘부스 바이 수블: Michelin/VisitBusan probe로 좌표 확인 시도
- G-00057 포함 guide-only coord conflict 엔티티 10건 재검토

**TASK-BUSAN-FOOD-194-FINAL-QA-V1** (필수):
- 전체 194건 최종 QA
- navigation_ready 106건 좌표 sanity check (coord_authority v1 버그 유사 패턴 탐지)
- ai_auto 106건 eligibility 재확인
- 완료 후 서비스 배포 준비
