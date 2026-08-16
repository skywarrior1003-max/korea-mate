TASK-BUSAN-FOOD-194-COORD-AI-REGRESSION-AUDIT-V1 완료보고서

---

**작업일**: 2026-08-16  
**기반 커밋**: `de8e903` (TASK-BUSAN-FOOD-194-AI-GATE-AND-QUICK-COORD-FIX-V1)  
**결과**: PASS_WITH_WARN  
**브랜치**: `data/busan-food-discovery-v1`  
**common HEAD**: `2476cac` (origin/data/multicity-common, 변경 없음)  
**canonical 변경**: 없음 (read-only audit)

---

## Address Regression

### normalization bug code-level fixed

`NO`

`count_and_coord_audit.py`의 `addr_match_level` 함수는 수정되지 않았다. `de8e903`에서의 수정은 G-00057 단일 엔티티의 출력을 REVERT한 것이었으며, 알고리즘 자체는 변경되지 않았다.

### 버그 원인 (코드 수준 분석)

`normalize_addr`의 `addr.replace(' ', '').lower()` — 공백을 완전 제거 — 로 인해 "달맞이길62번길 49" 와 "달맞이길 62번길 19"가 `해운대구달맞이길62번길` 공통 prefix 12자를 공유하게 되어 `shorter[:12] in longer` 조건이 True를 반환:

```
cn = "해운대구달맞이길62번길49,3층"  (19자)
an = "해운대구달맞이길62번길19,2층"  (19자)
cn[:12] = "해운대구달맞이길62번"  ← an에 포함됨 → SAME 오판
```

### matched unique audited

**101건** 전수 감사 (SOURCE_VERIFIED_NAV_READY 99건 + SAME_ENTITY_MULTI_RECORD_RESOLVED 2건).  
G-00057(ADDR_MISMATCH_REVERTED)은 감사 대상에서 제외됨.

#### 교정 비교 함수 (`coord_regression_corrected_v2.py`)

v1 비교 함수(coord_ai_regression_audit_v1.py)의 3가지 오류 발견 및 수정:

| 오류 | 원인 | 예시 |
|------|------|------|
| Road prefix 소실 | `[가-힣]+[구군]` 탐욕 매칭으로 도로명 앞부분 제거 | "중구구덕로22번길" → "중구구" 제거 → "덕로22번길" 오추출 |
| 건물번호+층수 병합 | 공백 제거 후 "418 2층" → "4182층" | bldg 418로 파싱해야 하는데 4182로 파싱 |
| 숫자 포함 도로명 미처리 | `[가-힣]+로` 패턴이 마린시티2로 미매칭 | DIFF_ROAD 오판 |

교정 함수: canonical address의 comma 이전 부분을 core로, api_addr와 prefix 매칭 비교.

#### v1에서 FALSE_SAME으로 오판된 12건 + DIFF_ROAD 3건 — 모두 TRUE_SAME 확인

| 엔티티 | canon addr (before comma) | api addr | 판정 |
|--------|--------------------------|----------|------|
| G-00001 마파람해물찜해물탕 | 금강로 418 | 금강로 418 2층 | TRUE_SAME ✓ |
| G-00031 르도헤 | 마린시티3로 37 | 마린시티3로 37 213,214호 | TRUE_SAME ✓ |
| G-00060 팔레트 | 달맞이길65번길 154 | 달맞이길65번길 154 3층 | TRUE_SAME ✓ |
| G-00061 달타이 | 달맞이길 193 | 달맞이길 193 1층 | TRUE_SAME ✓ |
| G-00071 랩24 바이 쿠무다 | 송정광어골로 41 | 송정 광어골로 41 4층 | TRUE_SAME ✓ |
| G-00086 굿모닝홍콩 | 서전로47번길 19 | 서전로 47번길 19 1층 | TRUE_SAME ✓ |
| G-00092 코르 파스타 바 | 동성로25번길 13 | 동성로 25번길13 2F | TRUE_SAME ✓ |
| G-00125 아웃트로 바이 비토 | 민락본동로19번길 18 | 민락본동로 19번길 18 1층 | TRUE_SAME ✓ |
| G-00133 제로베이스 | 민락로33번길 17 | 민락로33번길 17 202호 | TRUE_SAME ✓ |
| G-00140 611WoodFire | 황령산로 14-1 | 황령산로14-1 2층 | TRUE_SAME ✓ |
| G-00155 부산약콩밀면 이기대본점 | 동명로145번길 80 | 동명로145번길 80 1층 | TRUE_SAME ✓ |
| G-00190 1969부원동칼국수 | 구덕로22번길 3 | 구덕로22번길3 1층 | TRUE_SAME ✓ |
| G-00030 하레마 | 마린시티2로 33 | 마린시티2로 33 두산 위브더제니스 지하 1층 106호 | TRUE_SAME ✓ |
| G-00041 나가하마만게츠 | 우동1로 57 | 우동1로 57 대영빌딩1층 | TRUE_SAME ✓ |
| G-00049 부다면옥 | 중동1로 36 | 중동1로 36 2층 | TRUE_SAME ✓ |

### false same-address found/fixed

없음. G-00057은 de8e903에서 이미 수정됨.

### FALSE_SAME_ADDRESS_COUNT

`0`

---

## Identity

### MATCH_FAILURE_HIGH_CONFIDENCE 대상 수

7건 전수 감사

### identity confirmed

6건 — FoodService 주소 일치로 확인

| 엔티티 | 주소 비교 | identity |
|--------|----------|---------|
| G-00007 모모스커피 본점 | 오시게로 20 = 오시게로 20 | CONFIRMED |
| G-00057 엘부스 바이 수블 | 달맞이길62번길 49 ≠ 19 | REVERTED |
| G-00078 탐복 본점 | 문오성길 31 = 문오성길 31 | CONFIRMED |
| G-00121 우리포차 본점 | 광일로29번길 9 = 광일로29번길 9 | CONFIRMED |
| G-00126 조이풀조이풀 | 민락본동로11번길 21 = 민락본동로11번길 21 | CONFIRMED |
| G-00142 동경밥상 본점 | 남천바다로 34-6 = 남천바다로 34-6 | CONFIRMED |
| G-00144 광안리 언양불고기부산집 | 남천바다로 32 = 남천바다로 32 | CONFIRMED |

### identity unresolved

1건 — G-00057 엘부스 바이 수블 (nav_ready=False, ai_auto=False, 정상 처리됨)

### unresolved but AI_AUTO

`0` (G-00057: nav=False, ai=False → AI_AUTO=True 없음 ✓)

---

## Multi-UCSEQ

### 미미루 재현 결과

| 항목 | UC=1265 | UC=1555 |
|------|---------|---------|
| API addr | 온천장로 91-1 | 부산 동래구 온천장로 91-1 (온천동) |
| phone | 051-555-6609 | 051-555-6609 (동일) |
| coord dist | — | 1.3m |

**SAME_ENTITY**: 동일 전화번호, 동일 주소(동 정보 차이), 좌표 1.3m  
**선택 UC=1555 근거**: canonical "부산 동래구 온천장로 91-1"에 더 가까운 풀 주소 형식 (구 정보 포함)  
**결과**: nav_ready=True, ai_auto=True, cav.result=SAME_ENTITY_MULTI_RECORD_RESOLVED ✓

NOTE: canonical phone(051-557-7671) ≠ API phone(051-555-6609) 불일치 확인됨. SAME_ENTITY 판정에 영향 없음 (주소·좌표로 충분). 향후 phone 정정 검토 필요.

### 달타이 재현 결과

| 항목 | UC=1573 | UC=2328 |
|------|---------|---------|
| API addr | 달맞이길 193 (중동) | 달맞이길 193 1층 |
| phone | 0507-1403-1127 (VoIP) | 051-741-1122 |
| coord dist | — | 2.3m |

**SAME_ENTITY**: 동일 주소, 좌표 2.3m, 전화는 VoIP vs 유선(동일 업소)  
**선택 UC=2328 근거**: canonical phone 051-741-1122와 일치 (phone_match=YES)  
**결과**: nav_ready=True, ai_auto=True, cav.result=SAME_ENTITY_MULTI_RECORD_RESOLVED ✓

---

## Determinism

### rerun 1

SHA-256: `9b84bec3199b4e2c0ffb0d5bf61fbfb8c9fdc09d319164c0c2114ab9a86534dc`

### rerun 2

SHA-256: `9b84bec3199b4e2c0ffb0d5bf61fbfb8c9fdc09d319164c0c2114ab9a86534dc`

### checksum identical

`YES ✓`

---

## Final Counts

| 항목 | 값 | 기대값 |
|------|----|--------|
| CANONICAL | 194 | 194 ✓ |
| IMAGE_RESOLVED | 120 | 120 ✓ (변경 없음) |
| NAVIGATION_READY | 106 | 106 ✓ |
| NAVIGATION_UNRESOLVED | 88 | — |
| AI_AUTO | 106 | 106 ✓ |
| AI_AUTO_WITHOUT_NAV | 0 | 0 ✓ |

---

## QA Gate 전체

| 항목 | 결과 |
|------|------|
| CANONICAL = 194 | ✓ PASS |
| FALSE_SAME_ADDRESS_COUNT = 0 | ✓ PASS (교정 비교 기준) |
| WRONG_BRANCH_COORDINATE = 0 | ✓ PASS |
| IDENTITY_UNVERIFIED_AI_AUTO = 0 | ✓ PASS |
| STALE_NAVIGATION_READY_NO blocker 재발 = 0 | ✓ PASS |
| RECORD/ENTITY COUNT 혼용 = 0 | ✓ PASS |
| INVENTED_COORDINATE = 0 | ✓ PASS |
| IMAGE_DATA_CHANGE = 0 | ✓ PASS (120 불변) |
| COMMON/다른도시/master/production 변경 = 0 | ✓ PASS |

---

## WARN 항목

| WARN | 내용 |
|------|------|
| `ADDR_NORMALIZATION_CODE_LEVEL_FIXED = NO` | count_and_coord_audit.py 알고리즘 미수정. 단일 행 REVERT(G-00057)로 처리. 허용 근거: 교정 비교 감사에서 추가 오류 0건 확인. |
| `MIMIRU_PHONE_DISCREPANCY` | 미미루 canonical phone(051-557-7671) vs API phone(051-555-6609) 불일치. SAME_ENTITY 판정은 주소·좌표 기준으로 유효하나 phone 정정 검토 필요. |
| `MULTI_UCSEQ_NORMALIZATION_ASYMMETRY` | 미미루 두 UC_SEQ의 주소 형식 불일치("온천장로 91-1" vs "온천장로 91-1 (온천동)"). 좌표·전화로 SAME_ENTITY 충분히 입증됨. |

---

## Final Decision

`BUSAN_FOOD_194_COORD_AI_REGRESSION_AUDIT = PASS_WITH_WARN`

WARN 사유: 알고리즘 코드 수정 없이 단일 행 REVERT로 수정 완료. 교정 비교 감사 101건 전수 확인으로 추가 오류 없음을 증명.

다음 단계:

`SAFE_TO_START_TARGETED_OFFICIAL_COORD_IMAGE_RECOVERY = YES`

---

TASK-BUSAN-FOOD-194-COORD-AI-REGRESSION-AUDIT-V1 완료보고서  
작업을 완료했습니다.
