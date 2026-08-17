# TASK-BUSAN-FOOD-IMAGE-R1-AND-OVERNIGHT-QUALITY-AUDIT-V2 완료보고서

**작성일**: 2026-08-17  
**브랜치**: data/busan-food-discovery-v1  
**HEAD at start**: 9e60300 (validation report)  
**HEAD at end**: [작업 커밋 아래 참조]  
**multicity-common HEAD**: 2476cac

---

## A. Image Recovery R1

### A-1. Preflight

| 항목 | 값 |
|------|-----|
| IMAGE_BEFORE | 120/194 |
| image_unresolved | 74 (6 WEB_VISIBLE_BUT_API_IMAGE_GAP + 68 FOODSERVICE_NOT_FOUND) |

### A-2. VBC Local Discovery 결과

VBC(VisitBusanContent:food) local data에서 직접 확인된 후보:

| VBC disc_id | uc_seq | 이름 | canonical_id | 거리 | 이미지 |
|-------------|--------|------|--------------|------|-------|
| busan-F-00220 | 1506 | 톤쇼우 부산대점 | busan-G-00004 | 0m | ✅ usable |
| busan-F-00076 | 950 | 광안리 언양불고기 부산집 | busan-G-00144 | ~0m (addr confirm) | ✅ usable |

**VBC 미발견** (FoodService uc_seq가 VBC에 없음):

| canonical_id | uc_seq | 결과 |
|--------------|--------|------|
| busan-G-00043 쥬가정효 | 1638 | NOT_IN_VBC |
| busan-G-00055 차오란 | 1597 | NOT_IN_VBC |
| busan-G-00095 원조할매낙지 | 1621 | NOT_IN_VBC |
| busan-G-00168 할매재첩국 | 1625, 2490 | NOT_IN_VBC |

### A-3. CMS 프로브 결과

VisitBusan 웹 URL 시도 (1건):

```
URL: https://www.visitbusan.net/kr/index.do?menuCd=DOM_000000201001001000&uc_seq=1638&lang_cd=ko
HTTP: 200  title: "명소 | 부산에가면"  uploadImgs: 0
```

→ `DOM_000000201001001000` = attraction 목록 페이지  
→ food 상세 menuCd 미확인 → **CMS_MAPPING_BLOCKED**

### A-4. 적용 결과

#### 톤쇼우 (busan-G-00004) ✅ RESOLVED

- **disc_id**: busan-F-00220 (uc_seq=1506, VisitBusanContent:food)
- **identity 검증**: 주소 금정구 금강로 247-10, VBC↔canonical coord 거리 **0m**
- **image_url**: `https://www.visitbusan.net/uploadImgs/files/cntnts/20240416105423031_ttiel`
- **rights**: usable, source: www.visitbusan.net (2024-04 촬영)
- uc_seq=1506 ≠ FoodService uc_seq=1639 (현행 CMS ID 상이 확인)

#### 언양불고기부산집 (busan-G-00144) ✅ RESOLVED

- **disc_id**: busan-F-00076 (uc_seq=950, VisitBusanContent:food)
- **identity 검증**: VBC·API 공통 주소 "수영구 남천바다로 32", VBC↔API coord 거리 **0m**
- **image_url**: `https://www.visitbusan.net/uploadImgs/files/cntnts/20240418102343022_ttiel`
- **rights**: usable, source: www.visitbusan.net (2024-04 촬영)
- uc_seq=950 ≠ FoodService uc_seq=1544

#### 쥬가정효 (busan-G-00043) — CMS_MAPPING_BLOCKED

V2 프롬프트가 명시한 대로 쥬가(uc_seq=2341)는 DIFFERENT_ENTITY → 제외.  
올바른 uc_seq=1638로 VisitBusan 접근 불가 (VBC 미등록, CMS URL 미확정).

#### 차오란 (busan-G-00055) — CMS_MAPPING_BLOCKED

VBC 미발견, VisitBusan 웹 접근 불가.

#### 원조할매낙지 (busan-G-00095) — CMS_MAPPING_BLOCKED

VBC 미발견, VisitBusan 웹 접근 불가.

#### 할매재첩국 (busan-G-00168) — CMS_MAPPING_BLOCKED + COORD_CORRECTED

VBC 미발견. 좌표 문제 Phase B에서 해소 (아래 참조).  
이미지 복구는 좌표 정정 후에도 CMS_MAPPING_BLOCKED 유지.

### A-5. 요약

| 항목 | 값 |
|------|-----|
| IMAGE_BEFORE | 120/194 |
| CMS_EXACT_MATCHES | 2 (busan-G-00004, busan-G-00144) |
| IMAGE_NEW | 2 |
| IMAGE_AFTER | **122/194** |
| CMS_MAPPING_BLOCKED | 4 (쥬가정효·차오란·원조할매낙지·할매재첩국) |
| FOODSERVICE_NOT_FOUND | 68 (변동 없음) |
| USER_BROWSER_SAMPLE_REQUIRED | **YES** → 쥬가정효 (uc_seq=1638) |

> **사용자 확인 요청 (1건)**: 쥬가정효  
> 해운대구 라뮤에뜨 3층 uc_seq=1638 VisitBusan 상세 페이지의 대표 이미지 Request URL  
> DevTools → Network → Img 탭에서 `uploadImgs/files/cntnts/...` 형태 URL 확인 후 보고

---

## B. VWorld 88 Coord Regression Audit

### B-1. 감사 범위

`TASK-BUSAN-FOOD-194-COORD-RECOVERY-V1` 적용 엔티티: **88건**

| 판정 | 건수 | 비고 |
|------|------|------|
| VERIFIED_NAV_READY | 87 | VWorld coord Busan bbox 내, API 거리 < 2km |
| SOURCE_COORD_CONFLICT | 1 | 톤쇼우 (busan-G-00004) |

#### 톤쇼우 (busan-G-00004) SOURCE_COORD_CONFLICT 상세

| 소스 | 좌표 | 주소 |
|------|------|------|
| VWorld (canonical) | 35.230447, 129.084270 | 금정구 금강로 247-10 (부산대점) |
| FoodService API | 35.15644, 129.12479 | 수영구 광안해변로279번길 13 (광안점) |
| 거리 | **9,015m** | — |

**판정**: VWorld coord가 CORRECT — 금강로 247-10(부산대점)을 올바르게 지오코딩.  
FoodService API coord가 광안점(다른 지점)을 가리킴.  
API note: `coord_not_verified_distant_from_guide_may_be_different_branch` (기존 확인)  
**결론**: VERIFIED_NAV_READY_API_BRANCH_DIFF (실질 오류 없음)

### B-2. 할매재첩국 특별 확인

| 항목 | 값 |
|------|-----|
| 기존 coord | lat=35.1454, lng=128.9968 |
| 기존 coord 출처 | COORD-RECOVERY-V1 **미포함** (해당 엔티티는 이미 nav_ready=True 상태였음) |
| geocoded_address | (공백) — coord_authority_v1 미설정 상태였음 |
| address_ko | 부산 사상구 낙동대로1530번길 20-15 |
| VWorld re-geocode 결과 | lat=35.1932711, lng=128.9861994 |
| FoodService API coord (uc_seq=1625) | lat=35.193363, lng=128.98607 |
| 정정↔API 거리 | **16m** ← 동일 건물 |
| 기존↔정정 거리 | 5,410m |

**ROOT CAUSE**: 기존 coord(35.1454, 128.9968)는 이전 태스크에서 부정확한 geocode로 설정된 값.  
사상구 주소를 VWorld에 정확히 입력하면 API coord와 16m 일치.

**조치**: VWorld 재지오코딩 후 좌표 정정 완료. nav_ready 유지.  
Phase A 이미지는 CMS_MAPPING_BLOCKED(VBC 미발견).

### B-3. 정정 사항

| canonical_id | 변경 내용 | 결과 |
|--------------|---------|------|
| busan-G-00168 | lat 35.1454→35.1932711, lng 128.9968→128.9861994 | COORD_CORRECTED |

| 지표 | 값 |
|------|-----|
| VWORLD_RECOVERED_AUDITED | 88 |
| VERIFIED_NAV_READY | 87 |
| SOURCE_COORD_CONFLICT (VWorld correct) | 1 |
| COORD_CORRECTED (pre-existing, not in 88) | 1 (할매재첩국) |
| FINAL_NAV_READY_TOTAL | **194** (변동 없음) |

---

## C. Temporarily Unverified 68건

### C-1. 분석 결과

| ai_auto_block_reason | 건수 |
|---------------------|------|
| CURRENT_STATE_NOT_ACTIVE | 68 |
| ENTITY_UNMATCHED_TEMPORARILY_UNVERIFIED | 68 |
| DIFFERENT_ENTITY_RELATION_REMOVED | 1 (복합) |

| 항목 | 값 |
|------|-----|
| FoodService UC_SEQ 매핑 | 0/68 |
| image_gap_reason | CURRENT_FOODSERVICE_ENTITY_NOT_FOUND (전체) |
| nav_ready_block_reasons | 없음 (nav_ready=True) |
| 상태 변경 가능 여부 | 외부 확인 없이 불가 |

68건 전원 FoodService 미매칭 → 공식 API에서 현재 운영 여부 확인 불가.  
`current_state=TEMPORARILY_UNVERIFIED`는 외부 확인이 있어야 ACTIVE로 승격 가능.  
로컬 데이터만으로는 blocker 제거 불가.

| 지표 | 값 |
|------|-----|
| BEFORE | 68 |
| VERIFIED_ACTIVE | 0 |
| STILL_UNVERIFIED | 68 |
| CLOSED/MOVED (확인 불가) | — |
| AI_AUTO_BEFORE | 126 |
| AI_AUTO_AFTER | **126** (변동 없음) |

---

## Non-Food Inventory

| 파일 | 위치 | 레코드 | 성격 |
|------|------|--------|------|
| busan-final-place-event-release-manifest.json | data/tourapi/reports/busan/ | 1,533 | Release manifest (attraction 717 + restaurant 680 + accommodation 82 + nature 50 + event 4) |
| busan-attraction-*-raw.json (여러 건) | data/tourapi/raw/busan/ | 0 (빈 파일) | 미수집 raw |

- **attraction/place canonical**: 별도 normalized canonical 없음
- 1,533-record manifest는 `TASK-BUSAN-DATA-FINAL-RELEASE-AND-MULTICITY-HANDOFF-V1` 산출물 (read-only reference)
- 현재 branch에서 수정 가능한 non-food canonical 없음

**NON_FOOD_BACKFILL_TARGET_NOT_AVAILABLE**

---

## Safety QA

| 항목 | 값 |
|------|-----|
| WRONG_ENTITY_IMAGE | 0 |
| WRONG_BRANCH_IMAGE | 0 |
| WRONG_BRANCH_COORD | 0 |
| INVENTED_COORD | 0 |
| FALSE_SAME_ADDRESS_COUNT | 0 |
| FOOD_194_CANONICAL_TOTAL | 194 |
| SECRET_LEAK | 0 |
| OTHER_CITY_CHANGED | 0 |
| MASTER_CHANGED | 0 |
| PRODUCTION_CHANGED | 0 |

---

## 커밋

| 커밋 SHA | 내용 |
|---------|------|
| 8e88ffa | data(busan-food): Phase A 이미지 2건 + Phase B 할매재첩국 좌표 정정 |
| [이 보고서] | docs: 완료보고서 |

---

## Final Decision

| 항목 | 판정 |
|------|------|
| BUSAN_FOOD_IMAGE_R1 | **PASS_WITH_WARN** (2건 복구, 4건 CMS_BLOCKED, USER_BROWSER_SAMPLE 필요) |
| BUSAN_VWORLD_88_REGRESSION | **PASS** (87 VERIFIED, 1 VWorld-correct/API-branch-diff) |
| BUSAN_COORD_CORRECTION | **PASS** (할매재첩국 5.4km 오류 정정) |
| BUSAN_TEMP_UNVERIFIED_RECOVERY | **HOLD** (68건 외부 확인 필요, 현재 자동화 불가) |
| SAFE_TO_START_BUSAN_FINAL_QA | **HOLD** (쥬가정효 USER_BROWSER_SAMPLE 응답 후 → YES) |

> 사용자 확인 (쥬가정효 VisitBusan 이미지 URL) 수신 후 IMAGE_AFTER 최대 123/194 가능.  
> 확인 없이도 FINAL_QA는 IMAGE=122/194 기준으로 착수 가능.

---

TASK-BUSAN-FOOD-IMAGE-R1-AND-OVERNIGHT-QUALITY-AUDIT-V2 완료보고서  
작업을 완료했습니다.
