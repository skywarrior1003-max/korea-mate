# TASK-BUSAN-IMAGE-R1-AND-OVERNIGHT-COMPLETENESS-V1 검증보고서

**작성일**: 2026-08-16  
**판정**: ⛔ **IMPROVEMENT_FOUND — 실행 보류**  
**기준 커밋**: 2095964 (IMAGE-RECOVERY-V1 완료보고서)

---

## 검증 요약

태스크를 실행하기 전 discovery 데이터 전수 검증을 수행한 결과,  
**3건의 blocking 이슈**와 **Phase B 범위 오류**를 확인했다.  
아래 수정 사항을 적용한 후 재실행해야 한다.

---

## PHASE A 검증

### 1. Seed uc_seq 오류 (Blocking)

**태스크 명시 seed → 실제 데이터 비교:**

| canonical | 태스크 seed | 실제 VBC 후보 | 거리 | 판정 |
|-----------|-------------|--------------|------|------|
| busan-G-00004 톤쇼우 | `uc_seq=1251` (광안점) | busan-F-00134 (광안점) | **9,027m** | ⛔ WRONG_BRANCH |
| busan-G-00004 톤쇼우 | (미언급) | busan-F-00220 (부산대점, uc_seq=1506) | **0m** | ✅ CORRECT |
| busan-G-00144 언양불고기부산집 | `uc_seq=950` | busan-F-00076 (광안리 언양불고기 부산집) | **1,018m** | ⚠️ VERIFY |

#### 톤쇼우 (busan-G-00004) 상세

canonical 좌표 = 금정구 금강로 247-10 (VWorld geocode). 이것이 **부산대점**.

| VBC 후보 | uc_seq | 주소 | 거리 | 이미지 |
|---------|--------|------|------|-------|
| busan-F-00134 (광안점) | 1251 | 광안해변로279번길 13 | **9,027m** | `20220511142349184_ttiel` |
| busan-F-00220 (부산대점) | 1506 | 금정구 금강로 247-10 | **0m** | `20240416105423031_ttiel` |

**태스크 프롬프트의 seed `uc_seq=1251`은 광안점을 가리키며, canonical entity (부산대점)와 9km 이격.**  
실행 시 WRONG_ENTITY_IMAGE QA 위반 발생.  
**정정 seed: `uc_seq=1506` (busan-F-00220, 부산대점)**

#### 언양불고기부산집 (busan-G-00144) 상세

| 소스 | 좌표 | 주소 | 거리 |
|------|------|------|------|
| canonical (VWorld) | 35.1397, 129.1086 | (미기재) | — |
| API (FoodService uc_seq=1544) | 35.14793, 129.11354 | 수영구 남천바다로 32 | — |
| VBC busan-F-00076 (uc_seq=950) | 35.14790, 129.11357 | 수영구 남천바다로 32 | — |

VWorld coord와 API/VBC coord 간 **1,018m 이격**이 있으나,  
API와 VBC는 같은 주소(수영구 남천바다로 32)·좌표를 가리킨다.  
→ VWorld geocode 불일치 가능성. 주소 기반 동일성 판단 필요.  
이미지: `20240418102343022_ttiel` (rights=usable, 2024-04)  
**판정: 주소 직접 확인 후 적용 가능 (ADDR_VERIFY_REQUIRED)**

---

### 2. 쥬가정효 — 상호 변경 확인 필요 (Blocking)

| 항목 | canonical | VBC 후보 (busan-F-00408) |
|------|-----------|--------------------------|
| name_ko | 쥬가정효 | 쥬가 |
| uc_seq | 1638 | 2341 |
| 주소 | 해운대구 | 해운대구 우동1로20번길 53, 2층 |
| 좌표 | 35.1662, 129.1551 | 35.165016, 129.15915 |
| 거리 | — | **~15m** |

좌표·주소는 일치하지만 **상호가 다름 (쥬가정효 → 쥬가)**. 이미지 날짜: 2025-04-08 (최신).  
**이름 유사도만으로 이미지 연결 금지** (태스크 §3 명시) 위반 가능성.  
→ 폐업/상호변경 여부 USER_BROWSER 확인 필요.

---

### 3. 할매재첩국 — 좌표 충돌 (Blocking)

| 소스 | 좌표 | 행정구역 | 거리 |
|------|------|---------|------|
| canonical (VWorld) | 35.1454, 128.9968 | 서부산 방향 | — |
| API (uc_seq=1625) | 35.1934, 128.9861 | 사상구 삼락동 | 5,422m |
| VBC F-00026 (할매재첩국집, uc_seq=164) | 35.1934, 128.9861 | 사상구 | 5,422m |
| VBC F-00232 (할매재첩국부산본점, uc_seq=1519) | 35.1519, 129.1164 | 수영구 | 10,896m |

VWorld와 API 간 5.4km 이격으로 **어떤 VBC도 canonical 좌표와 매칭 불가**.  
이 엔티티의 canonical 좌표 자체를 먼저 검증해야 한다.  
→ 이미지 연결 보류. 좌표 이슈 선결 후 재시도.

---

### 4. 차오란, 원조할매낙지 — VBC 미존재

| canonical | 태스크 seed | discovery data 현황 |
|-----------|-------------|---------------------|
| busan-G-00055 차오란 | uc_seq=1597 | VBC:food:1597 없음 |
| busan-G-00095 원조할매낙지 | uc_seq=1621 | VBC:food:1621 없음 |

두 엔티티 모두 VisitBusanContent:food 후보가 discovery data에 없음.  
→ 신규 web discovery 또는 USER_BROWSER_SAMPLE 필요.

---

### 5. 수정 후 Phase A 예상 결과

| canonical | 현황 | 정정 후 적용 가능 여부 |
|-----------|------|----------------------|
| busan-G-00004 톤쇼우 | uc_seq=1506 (부산대점) local data 있음 | ✅ APPLY_READY (uc_seq 정정 후) |
| busan-G-00043 쥬가정효 | 이름 변경 의심 | ⚠️ USER_CONFIRM_REQUIRED |
| busan-G-00055 차오란 | VBC 없음 | 🔴 WEB_DISCOVERY_NEEDED |
| busan-G-00095 원조할매낙지 | VBC 없음 | 🔴 WEB_DISCOVERY_NEEDED |
| busan-G-00144 언양불고기부산집 | 1km 이격, 주소 일치 | ⚠️ ADDR_VERIFY_REQUIRED |
| busan-G-00168 할매재첩국 | 좌표 충돌 5.4km | 🔴 COORD_CONFLICT_PRIOR |

---

## PHASE B 검증

### 1. 부산 서비스 universe 실제 현황

태스크 설명: "부산에서 실제 서비스 대상으로 사용되는 entity를 유형별로 집계"  
**실제 normalized canonical 파일:**

| 파일 | 건수 | 설명 |
|------|------|------|
| `busan-food-194-canonical-v1.json` | 194 | Food SSOT, NAV_READY=194/194 (완료) |
| `busan-food-c1-publication-curation-v1.json` | 721 | Food discovery candidates (SSOT 아님) |

**Place/Attraction canonical = 없음** (busan에 normalized place canonical 미존재)

### 2. Phase B 범위 오류

태스크는 "Place / Food / Event / 기타" 유형별 집계를 예시로 들었으나:
- Busan Food: 194 canonical (coord 완료, 추가 VWorld 작업 없음)
- Busan Place: canonical 없음
- Busan Event: canonical 없음

**결과: Phase B coord VWorld backfill 대상 = 0**

### 3. c1 721 candidates 현황 (참고)

| 항목 | 값 |
|------|-----|
| 전체 | 721 |
| lat/lng 보유 | 721/721 (모두 보유) |
| 부산 bbox 내 (35.4N, 129.4E) | 720/721 |
| image_url 보유 | 0/721 (candidates는 이미지 미설정) |

→ c1 candidates는 canonical이 아니므로 VWorld backfill 대상 아님.  
→ Phase B coord 작업 대상 없음.

### 4. Phase B 재정의 권고

현재 Busan 서비스 universe에서 실행 가능한 Phase B 범위:

| 항목 | 상태 | 권고 |
|------|------|------|
| Food 194 coord | NAV_READY=194/194 | 확인 완료, 추가 작업 없음 |
| Food 194 image | 120/194 resolved | Phase A 결과 반영 |
| c1 721 candidates coord | 721/721 보유 | audit 목적 기록만 |
| Place canonical | 없음 | N/A |
| VWorld backfill 대상 | 0 | 없음 |

---

## 검증 중 발견된 이미지 (실행 차단 전 확인 완료)

아래 이미지는 local discovery data에서 확인된 공식 이미지로,  
올바른 uc_seq/seed 정정 후 실행 시 즉시 적용 가능하다.

| canonical | VBC disc_id | uc_seq | image_url (visitbusan.net) | rights |
|-----------|-------------|--------|---------------------------|--------|
| busan-G-00004 톤쇼우 | busan-F-00220 | **1506** | `20240416105423031_ttiel` | usable |
| busan-G-00144 언양불고기 | busan-F-00076 | 950 | `20240418102343022_ttiel` | usable |

> ⚠️ 위 2건은 정정된 seed 기준이며, 실행 전 주소/좌표 최종 확인 필요.

---

## 요약: 수정 필요 항목

### 프롬프트 수정

| ID | 위치 | 현재 | 수정 |
|----|------|------|------|
| F-001 | PHASE A §1 Seed | 톤쇼우 광안점: `uc_seq=1251` | `uc_seq=1506` (부산대점) |
| F-002 | PHASE A §1 Seed | 언양불고기: `uc_seq=950` | 950은 유지하되 1km 이격 명시, 주소 기반 검증 필요 |
| F-003 | PHASE A §1 Seed | 쥬가정효만 추가 | 이름 변경 확인(쥬가→쥬가정효) 단계 추가 |
| F-004 | PHASE B §1 | Place/Event universe 집계 | "Food 194 canonical 이외 canonical 없음" 명시 |
| F-005 | PHASE B §3 | VWorld backfill 수행 | "Food 194 coord 완료, 추가 backfill 대상 없음" 명시 |

### 실행 전 USER 확인 요청 (선택)

| 엔티티 | 확인 내용 |
|--------|---------|
| 쥬가정효 (busan-G-00043) | 해운대구 우동1로20번길 53, 2층 '쥬가' = 기존 쥬가정효 동일 식당인지 |
| 차오란 (busan-G-00055) | VisitBusan 차오란 상세 페이지 URL 및 이미지 확인 |
| 원조할매낙지 (busan-G-00095) | VisitBusan 원조할매낙지 상세 페이지 URL 및 이미지 확인 |
| 할매재첩국 (busan-G-00168) | canonical 좌표(35.1454, 128.9968) vs 사상구 API coord(35.1934, 128.9861) — 실제 위치 확인 |

---

## 결론

| 항목 | 판정 |
|------|------|
| PHASE A seed 오류 (톤쇼우 uc_seq=1251→1506) | ⛔ BLOCKING |
| PHASE A 쥬가정효 이름 충돌 | ⛔ BLOCKING |
| PHASE A 할매재첩국 좌표 충돌 | ⛔ BLOCKING |
| PHASE B universe 범위 오류 | ⚠️ SCOPE_ERROR |
| Local data에서 확인된 이미지 2건 | ✅ READY_TO_APPLY (정정 후) |

**프롬프트 수정 항목 F-001~F-005 적용 후 재실행 권고.**
