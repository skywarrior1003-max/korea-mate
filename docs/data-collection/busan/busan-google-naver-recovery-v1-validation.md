# TASK-BUSAN-FOOD-194-GOOGLE-NAVER-RECOVERY-V1 검증보고서

**작성일**: 2026-08-17  
**판정**: ❌ **EXECUTION_BLOCKED — 실행하지 않음**  
**사유**: Google Places API / Naver Local Search API 키 없음

---

## 검증 요약

| 항목 | 값 |
|------|-----|
| GOOGLE_PLACES_CAPABILITY | **NO** (키 없음) |
| GOOGLE_PLACE_PHOTOS_CAPABILITY | **NO** (키 없음) |
| NAVER_LOCAL_SEARCH_CAPABILITY | **NO** (키 없음) |

이 Task의 모든 실질 작업(Section B Image + Section C 운영 검증)이 Google Places API 또는 Naver Local Search API에 의존한다. 두 API 모두 `.env.local`에 키가 없으므로 Task 자체 규칙("키가 없으면 해당 source만 SKIP") 적용 시 실행할 작업이 없다.

---

## Capability 상세

### 현재 .env.local 보유 API

| 키 이름 | 용도 | 이 Task 적용 가능 |
|---------|------|------------------|
| GEMINI_API_KEY | Gemini LLM | ❌ (이미지·장소 검색 불가) |
| TOUR_API_KEY / KOR_TOUR_API_KEY | KTO TourAPI / FoodService | ❌ (이미 68건 0/68 확인 완료) |
| VWORLD_API_KEY | VWorld 지오코딩 | ❌ (이미지·운영 검증 불가) |
| PEXELS_API_KEY | Pexels 스톡사진 | ❌ (공식 식당 이미지 정책 불가) |

### 필요하지만 없는 API

| API | 용도 | 대안 |
|-----|------|------|
| Google Places API (v1) | businessStatus 운영 확인, Place Photos | 없음 |
| Google Place Photos API | 식당 대표 사진 참조 | 없음 |
| Naver Local Search API | 한국 로컬 장소 현재 상태 확인 | 없음 |

---

## Task 구조 검증

프롬프트 자체는 기술적으로 올바르게 작성되어 있다.

| 검증 항목 | 결과 |
|-----------|------|
| Google Place Photos ≠ image_resolved 구분 | ✅ (GOOGLE_PLACE_PHOTO_AVAILABLE 플래그 분리) |
| 다른 지점 이미지 전이 금지 | ✅ |
| 정책 위반 콘텐츠 제한 (다운로드·재호스팅 금지) | ✅ |
| AI_AUTO 강제 승격 금지 | ✅ |
| 종료 분류 체계 완결 | ✅ (6가지 이미지 + 6가지 운영 분류) |
| Secret 출력 금지 | ✅ |

**구조 문제 없음 — API 키만 없음**

---

## 차단 이유 상세

### Section A: Capability → SKIP

세 API 모두 NO. Task 규칙상 "해당 source만 SKIP".

### Section B: 이미지 69건 Recovery → SKIP

Google Place Photos SKIP → Image Recovery 0건.  
현재 공식 source(VisitBusan WAF, FoodService 0/68)는 이미 CLOSURE-SPRINT-V1에서 소진.  
**결과: IMAGE = 125/194 변동 없음**

### Section C: AI_AUTO 보류 68건 Recovery → SKIP

Google Places businessStatus SKIP → 운영 검증 불가.  
Naver Local Search SKIP → 한국 로컬 확인 불가.  
**결과: AI_AUTO = 126/194 변동 없음**

---

## API 키 추가 시 예상 효과

Google Places API 활성화 시:

| 예상 항목 | 설명 |
|-----------|------|
| GOOGLE_PLACE_PHOTO_AVAILABLE | 68건 중 영업 중인 식당에 대해 Google Photo 참조 확보 가능 |
| VERIFIED_ACTIVE | 68 TEMPORARILY_UNVERIFIED 중 Google businessStatus=OPERATIONAL인 건 → 상태 확정 |
| AI_AUTO 증가 가능 | VERIFIED_ACTIVE + AI common gate 통과 시 |
| image_resolved 직접 증가 | 불가 (Google Photo는 동적 API 참조, static URL 저장 불가) |

Naver Local Search API 활성화 시:

| 예상 항목 | 설명 |
|-----------|------|
| 한국 식당 identity 교차 확인 | 상호·주소·전화 Naver 현재 검색 결과로 보강 |
| VERIFIED_ACTIVE 보완 신호 | Google만으로는 불충분한 경우 Naver로 보완 |

두 API 모두 활성화 시 **68 TEMPORARILY_UNVERIFIED 중 일부(추정 10~30건)가 VERIFIED_ACTIVE로 승격 가능**, AI_AUTO 증가 기대.

---

## 현재 상태 (CLOSURE-SPRINT-V1 기준)

| 항목 | 값 |
|------|-----|
| CANONICAL | 194 |
| NAV_READY | 194/194 |
| IMAGE | 125/194 |
| IMAGE_UNRESOLVED | 69 (전체 종료분류 완료) |
| AI_AUTO | 126/194 |
| TEMPORARILY_UNVERIFIED | 68 (전체 OFFICIAL_EVIDENCE_INSUFFICIENT) |
| UNCLASSIFIED_IMAGE | 0 |
| UNCLASSIFIED_OPERATION_STATUS | 0 |

CLOSURE-SPRINT-V1에서 모든 미해결 항목이 exact reason으로 분류된 상태.  
현재 SAFE_TO_START_BUSAN_FOOD_FINAL_QA = **YES** (Google-Naver Recovery 없이도 착수 가능).

---

## 권고 사항

### 방안 A: Google Places / Naver API 키 추가 후 재실행 (권장)

1. Google Cloud Console에서 Places API (New) 활성화
2. `.env.local`에 `GOOGLE_PLACES_API_KEY` 추가
3. Naver Cloud Platform에서 Naver Local Search API 발급
4. `.env.local`에 `NAVER_CLIENT_ID` + `NAVER_CLIENT_SECRET` 추가
5. 이 Task를 동일 프롬프트로 재실행

**예상 결과**: 68건 운영 확인, AI_AUTO 증가, GOOGLE_PLACE_PHOTO_AVAILABLE 확보.

### 방안 B: FINAL-QA-V1 즉시 착수 (현재 가능)

IMAGE 125/194, AI_AUTO 126/194 기준으로 FINAL-QA-V1 착수.  
Google-Naver Recovery는 FINAL-QA 이후 별도 추가 작업으로 처리.

---

## 최종 판정

| 항목 | 판정 |
|------|------|
| GOOGLE_PLACES_CAPABILITY | NO |
| GOOGLE_PLACE_PHOTOS_CAPABILITY | NO |
| NAVER_LOCAL_SEARCH_CAPABILITY | NO |
| EXECUTION_STATUS | **BLOCKED** |
| CANONICAL_CHANGED | **NO** (변경 없음) |
| SAFE_TO_START_BUSAN_FOOD_FINAL_QA | **YES** (이 Task 없이도) |
| RECOMMENDED_NEXT | 방안 A (API 키 추가) 또는 방안 B (FINAL-QA 즉시) |
