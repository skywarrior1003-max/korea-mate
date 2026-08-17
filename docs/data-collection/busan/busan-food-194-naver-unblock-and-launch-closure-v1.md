# TASK-BUSAN-FOOD-194-NAVER-UNBLOCK-AND-LAUNCH-CLOSURE-V1 완료보고서

**작성일**: 2026-08-17  
**판정**: ✅ **COMPLETE**  
**커밋**: `5348ebe` (canonical apply)

---

## 최종 지표

| 항목 | 이전 | 이후 | 변화 |
|------|------|------|------|
| IMAGE | 125/194 | **140/194** | **+15** |
| AI_AUTO | 126/194 | **189/194** | **+63** |
| NAV_READY | 194/194 | 194/194 | — |
| ACTIVE | 127/194 | **190/194** | **+63** |
| TEMPORARILY_UNVERIFIED | 68 | **4** | **-64** |

---

## Capability 검증

| API | 결과 |
|-----|------|
| NAVER_API_HUB_LOCAL_SEARCH | ✅ PASS |
| 엔드포인트 | `naverapihub.apigw.ntruss.com/search/v1/local` |
| 인증 헤더 | `X-NCP-APIGW-API-KEY-ID` / `X-NCP-APIGW-API-KEY` |
| 좌표 형식 | INTEGER×10^7 (mapy/1e7=lat, mapx/1e7=lng) |
| thumbnail 필드 | 없음 (og:image별도 추출) |

---

## Phase A — 운영 검증 (68 TEMPORARILY_UNVERIFIED)

| 결과 | 건수 |
|------|------|
| VERIFIED_ACTIVE | **64** |
| CURRENT_STATUS_UNRESOLVED | **4** |

### CURRENT_STATUS_UNRESOLVED 잔류 4건

| canonical_id | 상호 | 이유 |
|---|---|---|
| busan-G-00016 | 귀화식당 사케의 향 | score=0.0 (Naver 검색 결과 없음) |
| busan-G-00059 | 이안 | score=0.583 (임계값 0.70 미달) |
| busan-G-00063 | 신도랩2.0 | score=0.0 (Naver 검색 결과 없음) |
| busan-G-00122 | 미락슈퍼 | score=0.65 (임계값 0.70 미달) |

### 적용 내용 (64 VERIFIED_ACTIVE)

- `current_state`: `TEMPORARILY_UNVERIFIED` → `ACTIVE`
- `ai_auto_block_reasons` 제거: `CURRENT_STATE_NOT_ACTIVE`, `ENTITY_UNMATCHED_TEMPORARILY_UNVERIFIED`
- `ai_auto` 재계산: 63건 True 전환 (1건 `DIFFERENT_ENTITY_RELATION_REMOVED` 잔류로 False 유지)
- `naver_verification_v1` provenance: Naver 상호·주소·거리·score 기록
- `closure_sprint_v1.operational_closure_status` → `VERIFIED_ACTIVE`

---

## Phase B — 이미지 복구 (69 IMAGE_UNRESOLVED)

| 결과 | 건수 |
|------|------|
| BUSINESS_IMAGE_RESOLVED (적용) | **15** |
| BUSINESS_IMAGE_FOUND_BUT_MAPPING_BLOCKED | 30 |
| NO_BUSINESS_IMAGE_FOUND | 24 |

### 정책 거부 2건 (BUSINESS_IMAGE_FOUND → BLOCKED 재분류)

| canonical_id | 상호 | 거부 이유 |
|---|---|---|
| busan-G-00055 | 차오란 | og:image = `snsRepresentImage.png` (Lotte Hotel 일반 SNS 이미지, 식당 특정 아님) |
| busan-G-00120 | 피리피리 | og:image 출처 = `guide.michelin.com` → **Michelin 사진 금지 정책** 적용 |

### 적용된 15건 (Instagram 공식 계정 프로필)

| canonical_id | 상호 | Instagram 계정 |
|---|---|---|
| busan-G-00006 | 이태리 삼촌 | italy_samchon |
| busan-G-00014 | 쿠루미 과자점 | kurumi_sweets |
| busan-G-00032 | 뫼밀집 | moemiljip_official |
| busan-G-00038 | 무스비 | from_soba_to_bistro |
| busan-G-00039 | 딤타오 본점 | dim_tao_ |
| busan-G-00040 | 도핀느 | dauphine.kr |
| busan-G-00046 | 토오루 | __to_o_ru |
| busan-G-00054 | 본앤브레드 해운대 파라다이스점 | born_n_bred_busan |
| busan-G-00065 | 우나쥬 | unaju_busan |
| busan-G-00076 | 일광바다횟집 | ilgwang_bada |
| busan-G-00094 | 갓포현 | kappohyun_busan |
| busan-G-00127 | 브런치식당 소보 | sobo.busan |
| busan-G-00129 | 진돼지곰탕 | jin_dwejigomtang |
| busan-G-00131 | 울트라바이트 | ultrabitebusan |
| busan-G-00151 | 비스트로 정재집 | jungjaejib |

**적용 설정**: `image_rights=business_provided`, `takedown_ready=true`, `image_recovery_naver_v1` provenance 기록

---

## QA 결과

| 점검 항목 | 결과 |
|-----------|------|
| WRONG_ENTITY_IMAGE | 0 |
| WRONG_BRANCH_IMAGE | 0 |
| GENERAL_REVIEWER_PHOTO_USED | 0 |
| MICHELIN_IMAGE_USED | 0 (피리피리 REJECT 확인) |
| GENERIC_BRAND_IMAGE_USED | 0 (차오란 REJECT 확인) |
| AI_AUTO_IMAGE_GATE | 0 |
| SECRET_LEAK | 0 |
| OTHER_CITY_CHANGED | 0 |
| 할매재첩국 coord | ✅ 35.1932711, 128.9861994 (이전 수정 유지) |

---

## Closure Status 최종 집계

### image_closure_status

| 상태 | 건수 |
|------|------|
| OFFICIAL_IMAGE_RESOLVED (VBC) | 3 |
| BUSINESS_IMAGE_RESOLVED (Instagram) | 15 |
| BUSINESS_IMAGE_FOUND_BUT_MAPPING_BLOCKED | 30 |
| NO_BUSINESS_IMAGE_FOUND | 24 |
| (closure 없음 = 이미 resolved) | 122 |

### operational_closure_status

| 상태 | 건수 |
|------|------|
| VERIFIED_ACTIVE | 66 |
| CURRENT_STATUS_UNRESOLVED | 4 |
| (closure 없음 = 이미 ACTIVE) | 124 |

---

## 커밋 이력

| 커밋 | 내용 |
|------|------|
| `53f0654` | CLOSURE-SPRINT-V1: 이미지 3건 + 72/68건 종료분류 |
| `5348ebe` | **NAVER-UNBLOCK-AND-LAUNCH-CLOSURE-V1: 운영 64건 + 이미지 15건** |

---

## 다음 단계

| 항목 | 값 |
|------|-----|
| SAFE_TO_START_BUSAN_FOOD_FINAL_QA | ✅ **YES** |
| IMAGE | 140/194 (IMAGE_UNRESOLVED: 54) |
| AI_AUTO | 189/194 (AI_AUTO_BLOCKED: 5) |
| REMAINING_TEMP_UNVERIFIED | 4 |
| NEXT_TASK | **TASK-BUSAN-FOOD-194-FINAL-QA-V1** |

---

TASK-BUSAN-FOOD-194-NAVER-UNBLOCK-AND-LAUNCH-CLOSURE-V1 완료보고서  
작업을 완료했습니다.
