TASK-BUSAN-FOOD-194-COORD-RECOVERY-V1 완료보고서

---

**작업일**: 2026-08-16  
**기반 커밋**: `55465ac` (COORD-SCRIPT-FIX-AND-VWORLD-CAPABILITY-V1)  
**브랜치**: `data/busan-food-discovery-v1`  
**canonical 변경**: YES — nav_ready 106→194, ai_auto 106→126

---

## 개요

88개 nav_unresolved 부산 Food 엔티티에 대해 VWorld Geocoder 2.0을 통한 공식 좌표 일괄 확보.  
KTO Priority 0 = 0건(해당 없음), VWorld Priority 1 = 88/88 성공.

---

## 분류 결과 (사전 분석)

### By match_status

| 분류 | 수 |
|------|---|
| UNMATCHED_STRONG_GUIDE (Michelin/부산맛집) | 53 |
| MATCHED (FoodService 매칭, coord 이슈) | 18 |
| UNMATCHED_TAEGSHLANG | 15 |
| PHONE_MATCHED | 1 |
| MATCH_FAILURE_HIGH_CONFIDENCE (G-00057) | 1 |

### By coord_status_r1

| 분류 | 수 |
|------|---|
| GUIDE_COORD_ADDRESS_CONSISTENT | 66 |
| COORD_UNRESOLVED | 11 |
| GUIDE_COORD_CONFLICT_WITH_CURRENT_OFFICIAL_SOURCE | 10 |
| OFFICIAL_COORD_ADDR_MISMATCH_REVERTED (G-00057) | 1 |

### Recovery 우선순위 사전 평가

| 항목 | 값 |
|------|---|
| KTO contentId 보유 수 | **0/88** — KTO Priority 0 적용 불가 |
| VWorld 지오코딩 가능 주소 | **88/88** (이전 regex 오탐 6건 포함, 실제 전수 geocodable) |
| current_state=ACTIVE | **20/88** (AI_AUTO 즉시 수혜) |
| current_state=TEMPORARILY_UNVERIFIED | **68/88** (nav_ready만 확보, ai_auto는 별도 state 변경 필요) |

---

## VWorld 지오코딩 결과

**실행 방법**: VWorld Geocoder API 2.0, `type=road` 우선, NOT_FOUND 시 `type=parcel` fallback  
**딜레이**: 요청 간 120ms  
**API key**: `.env.local`에서 로드 (값 미노출)

| 항목 | 값 |
|------|---|
| 총 시도 | 88 |
| OK (Busan bbox 내) | **88** |
| NOT_FOUND | 0 |
| NOT_IN_BUSAN_BBOX | 0 |
| ERROR | 0 |
| 성공률 | **100%** |

모든 88개 주소가 도로명주소(`type=road`) 첫 시도에서 OK. parcel fallback 필요 없음.

### 주요 엔티티 좌표

| CID | 이름 | VWorld lat | VWorld lng | 비고 |
|-----|------|-----------|-----------|------|
| G-00027 | 스시시안 | 35.16784 | 129.13096 | 센텀1로 9 E동상가 — regex 오탐 해소 |
| G-00038 | 무스비 | 35.16348 | 129.15617 | 우동1로 19 — 숫자포함 도로명 OK |
| G-00057 | 엘부스 바이 수블 | **35.15776** | **129.17316** | ADDR_MISMATCH 해소 (건물49) |
| G-00072 | 기장해변짚불곰장어 | 35.18536 | 129.21161 | 공수2길 11 — OK |
| G-00073 | 레스토랑 엠비언스 | 35.20836 | 129.20735 | 내리1길 10 — OK |

---

## G-00057 특별 처리 (ADDR_MISMATCH_REVERTED → 해소)

- **canonical 주소**: 부산 해운대구 달맞이길62번길 **49**, 3층  
- **구 API 주소**: 달맞이길 62번길 **19**, 2층 (건물번호 불일치 → 이전 REVERT)  
- **VWorld 처리**: canonical 주소("달맞이길62번길 49") 직접 지오코딩 → 건물 49 위치 확인  
- **결과**: `coord_status_r1 = VWORLD_GEOCODE_CONFIRMED`, `navigation_ready=True`, `ai_auto=True`

---

## Canonical 적용 결과

### 좌표 업데이트

- `latitude` / `longitude`: VWorld 좌표로 갱신 (기존 guide 근사값 대체)  
- `api_recovery_v1.coord_authority_v1`:
  ```json
  {
    "task": "TASK-BUSAN-FOOD-194-COORD-RECOVERY-V1",
    "result": "VWORLD_GEOCODE_NAV_READY",
    "authority_source": "VWORLD_OFFICIAL_ADDRESS_GEOCODE",
    "geocoded_address": "부산광역시 ...",
    "vworld_lat": <실측값>,
    "vworld_lng": <실측값>,
    "vworld_addr_type": "road",
    "navigation_ready": true
  }
  ```
- `coord_status_r1`: `VWORLD_GEOCODE_CONFIRMED`

### nav 블록 제거

88개 엔티티의 `ai_auto_block_reasons`에서 제거:
- `NAVIGATION_NOT_READY` (76개)
- `NAVIGATION_READY_NO` (12개)

유지:
- `CURRENT_STATE_NOT_ACTIVE` (68개 TEMPORARILY_UNVERIFIED)
- `ENTITY_UNMATCHED_TEMPORARILY_UNVERIFIED` (68개)

### ACTIVE 엔티티 20개 — ai_auto 획득

| CID | 이름 | 비고 |
|-----|------|------|
| G-00004 | 톤쇼우 | GUIDE_COORD_CONFLICT 해소 |
| G-00020 | 소문난주문진막국수 | PHONE_MATCHED |
| G-00027 | 스시시안 | GUIDE_COORD_CONFLICT 해소 |
| G-00033 | 거대곰탕 | GUIDE_COORD_ADDRESS_CONSISTENT |
| G-00044 | 쇼진 | GUIDE_COORD_CONFLICT 해소 |
| G-00045 | 해목 해운대점 | GUIDE_COORD_ADDRESS_CONSISTENT |
| G-00047 | 으뜸이로리바타 | GUIDE_COORD_CONFLICT 해소 |
| G-00048 | 모리 | GUIDE_COORD_CONFLICT 해소 |
| G-00057 | 엘부스 바이 수블 | ADDR_MISMATCH_REVERTED 해소 |
| G-00068 | 양산국밥 | GUIDE_COORD_ADDRESS_CONSISTENT |
| G-00081 | 소수인 | GUIDE_COORD_CONFLICT 해소 |
| G-00099 | 고관함박 | COORD_UNRESOLVED → 확보 |
| G-00116 | 고민끝에여기 | GUIDE_COORD_ADDRESS_CONSISTENT |
| G-00132 | 델리봉 | GUIDE_COORD_CONFLICT 해소 |
| G-00153 | 나막집 | GUIDE_COORD_ADDRESS_CONSISTENT |
| G-00175 | 영남냉면밀면 | GUIDE_COORD_ADDRESS_CONSISTENT |
| G-00182 | 동삼정 | GUIDE_COORD_CONFLICT 해소 |
| G-00191 | 본참치 | GUIDE_COORD_CONFLICT 해소 |
| G-00192 | 편의방 | GUIDE_COORD_CONFLICT 해소 |
| G-00194 | 할매복국 | GUIDE_COORD_ADDRESS_CONSISTENT |

### TEMPORARILY_UNVERIFIED 68개

`navigation_ready=True` 확보. `ai_auto` 변경 없음(False 유지).  
이 엔티티들은 FoodService API 매칭 완료 시 ACTIVE로 전환되면 ai_auto 자동 가능.

---

## QA 결과

| 항목 | 결과 |
|------|------|
| CANONICAL=194 | ✓ PASS |
| ZERO_COORD | ✓ PASS (0건) |
| IN_BUSAN_BBOX | ✓ PASS (88/88) |
| ACTIVE_NAV_NO_AI_ANOMALY | ✓ PASS (0건) |
| NAV_READY=194 | ✓ PASS |
| AI_AUTO CONSISTENCY (106+20=126) | ✓ PASS |
| G-00057_RESOLVED | ✓ PASS |
| FALSE_SAME_ADDRESS_COUNT | ✓ 0 (회귀 감사 PASS) |
| REGRESSION_CHECKSUM | `ea029326c11760e3...` (불변 ✓) |
| ENV_LOCAL_GIT_EXPOSURE | ✓ 0 (key 미노출) |
| INVENTED_COORDINATE | ✓ 0 |
| Common/다른도시/master/production 변경 | ✓ 0 |

---

## Canonical SHA-256

| 단계 | SHA-256 |
|------|---------|
| before (55465ac 기준) | `4e3201140e2c791c2f339119e101bfc4102f44995c85cf3def90a7c34c05d37d` |
| after (VWorld 적용) | `0474fb87acbfbc5327e5ad9c66fb9e4e5a651859c1f1db060ac01d2e2df1b1ec` |

---

## 최종 통계 요약

| 항목 | 변경 전 | 변경 후 |
|------|---------|---------|
| `navigation_ready=True` | 106 | **194** (+88) |
| `ai_auto=True` | 106 | **126** (+20) |
| G-00057 coord_status | ADDR_MISMATCH_REVERTED | **VWORLD_GEOCODE_CONFIRMED** |
| TEMPORARILY_UNVERIFIED nav_ready | 0 | **68** |
| 추정좌표 생성 | 0 | 0 |

---

## 변경 파일

- `data/tourapi/normalized/busan/busan-food-194-canonical-v1.json` (수정)
- `docs/data-collection/busan/busan-food-194-coord-recovery-v1.md` (이 파일, 신규)

---

## 다음 단계

`SAFE_TO_START_BUSAN_FOOD_194_IMAGE_RECOVERY_V1 = YES`

- **IMAGE-RECOVERY-V1**: 74개 image_resolved=False 엔티티 대상 이미지 확보  
  (VisitBusan UC_SEQ 경로, WAF 이슈로 USER_ASSISTANCE_REQUIRED 예상)
- **FINAL-QA-V1**: image recovery 완료 후 전체 194개 최종 검수

TASK-BUSAN-FOOD-194-COORD-RECOVERY-V1 완료
