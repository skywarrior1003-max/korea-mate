# TASK-DATA-BUSAN-OVERNIGHT-PREP-13A 검증 보고서

**날짜:** 2026-07-24  
**상태:** **REVIEW REQUIRED — 실행 보류**  
**판단:** 블로커 3건 해결 후 실행 권장

---

## 검증 결과 요약

| 항목 | 결과 |
|---|---|
| Playwright 설치 여부 | ❌ **미설치** — 이미지 표본 검증 불가 |
| subcategory 실제 대상 수 | ⚠️ **예상과 다름** — 1,352건 → 실제 1,290건 (활성) |
| category=unknown 선결 과제 | ❌ **661건 미해결** — subcategory 분류 전 category 확정 필요 |

---

## 블로커 1 — Playwright 미설치 (Critical)

### 현황

```
node_modules/.bin/playwright  → 없음
node_modules/playwright        → 없음
node_modules/@playwright/test  → 없음
package.json playwright 항목   → 없음
로컬 브라우저 바이너리         → 없음
```

### 영향

프롬프트가 요구하는 "Playwright 렌더링 후 대표 이미지 URL 추출(10건 표본)"을 실행할 수 없습니다.  
VisitBusan은 Vue.js 동적 로딩 구조이므로 정적 fetch로는 이미지를 추출할 수 없습니다.

### 해결 방법 (야간 작업 전 선행 필수)

```bash
# 1. Playwright 패키지 설치 (약 30MB)
npm install -D playwright

# 2. 브라우저 바이너리 다운로드 (Chromium 약 300MB)
npx playwright install chromium --with-deps

# 3. 설치 확인
npx playwright --version
```

### 대안 — 2단계 전략

```
1단계 (정적 fetch): VisitBusan HTML에서 og:image, <img> 태그로 일부 추출
2단계 (Playwright): 1단계 실패 건만 동적 렌더링 재시도
```

이 전략을 쓰면 Playwright 의존도를 낮추고 실행 시간도 단축됩니다.

---

## 블로커 2 — category=unknown 661건 미해결 (Critical)

### 현황

통합 후보 CSV의 `category=unknown` 활성 건 분포:

| candidate_id prefix | 건수 | 원천 | 문제 |
|---|---|---|---|
| busan-K-* | **661건** | KorService2 (TourAPI) | category 매핑 없음 |

샘플: busan-K-00001~00005 모두 `KorService2:{contentId}:ko` 원천, category=unknown

### 영향

- 활성 subcategory=unknown 1,290건 중 `category=unknown` 행은 subcategory 분류 불가
- category를 먼저 확정해야 subcategory 분류가 의미 있음
- **분류 가능 즉시 대상: 1,290 - 661 = 629건**

### 원인

TASK-06 integrated-candidates 생성 시 `busan-K-*` 행들은 TourAPI KorService2 서비스에서 왔으며, 이 서비스의 contentTypeId가 AttractionService/FoodService/FestivalService와 다른 코드 체계를 사용해 매핑이 누락됐습니다.

### 해결 방법

TourAPI KorService2 응답의 `contentTypeId` → `category` 매핑 스크립트를 선행 실행:

| contentTypeId | 매핑 category |
|---|---|
| 12 (관광지) | attraction |
| 14 (문화시설) | attraction |
| 15 (축제·공연·행사) | event |
| 28 (레포츠) | nature 또는 attraction |
| 32 (숙박) | accommodation |
| 38 (쇼핑) | 제외 (city_spots 미허용) |
| 39 (음식점) | restaurant |

이 선행 작업이 `busan-K-*` 661건의 category를 확정해야 subcategory 야간 배치가 가능합니다.

---

## 블로커 3 — subcategory 실제 대상 수 불일치 (Warning)

### 현황

| 출처 | 수치 |
|---|---|
| 핸드오프 문서 기재 | 1,352건 |
| integrated CSV 실측 (전체 rows) | 1,299건 |
| integrated CSV 실측 (활성만) | **1,290건** |

### 상세 분포 (활성, subcategory=unknown)

| candidate_status | 건수 |
|---|---|
| api_only_existing | 853 |
| existing_enriched | 329 |
| web_only_new | 108 |
| **합계** | **1,290** |

| category | 건수 |
|---|---|
| unknown | 661 |
| restaurant | 446 |
| attraction | 173 |
| event | 7 |
| (기타/파싱 오류) | 3 |
| **합계** | **1,290** |

### 원인

핸드오프 문서(1,352건)는 TASK-10 이전 기준이었고, TASK-12A에서 busan-K-00081이 api_only_existing으로 이동하고 VBM 9건이 merge_existing으로 전환되면서 활성 subcategory=unknown 수가 줄었습니다.

---

## VB 이미지 수집 실제 대상 수 (참고)

| 항목 | 건수 |
|---|---|
| VB 연결 활성 후보 (uc_seq 보유) | 570건 |
| 이미지 이미 있음 | 332건 |
| **이미지 없음 (수집 대상)** | **238건** |

전체 배치 실행 시 238건 이미지 URL 수집이 필요합니다.

---

## 개선된 야간 작업 순서 제안

현재 프롬프트는 이미지 + subcategory를 병렬로 준비하는 구조이지만,  
아래 순서가 더 안전하고 효율적입니다:

```
TASK-13A (오늘):
  └─ Playwright 설치 + 10건 이미지 표본 (설치 후)
  └─ busan-K-* 661건 category 매핑 스크립트 작성

TASK-13B (야간 배치):
  └─ busan-K-* category 확정 (661건)
  └─ VB 이미지 수집 (238건)

TASK-13C (야간 또는 다음날):
  └─ subcategory 분류 (1,290건 → category 확정 후)
```

---

## 야간 실행 전 필수 체크리스트

- [ ] `npm install -D playwright` 완료
- [ ] `npx playwright install chromium --with-deps` 완료 (~300MB)
- [ ] busan-K-* contentTypeId → category 매핑 스크립트 작성·검증
- [ ] 이미지 표본 10건 성공률 확인
- [ ] subcategory 허용 목록 확정 (아래 초안)
- [ ] HARD STOP 조건 정의 (아래 초안)

---

## subcategory 허용 목록 초안

city_spots 5종 category 기준:

**attraction:**
beach, mountain, park, museum, gallery, temple, historic_site, theme_park, observation, market, street, harbor, cultural_space, media_center, nature_trail, festival_venue

**restaurant:**
korean, japanese, chinese, western, cafe, seafood, street_food, dessert_shop, buffet

**nature:**
beach, mountain, hiking_trail, river, wetland, island, forest, park

**event:**
festival, concert, exhibition, seasonal, sports

**accommodation:**
hotel, pension, hostel, resort, hanok

> subcategory 허용 목록은 city_spots 스키마 원본에서 최종 확인 필요.

---

## HARD STOP 초안

야간 배치 스크립트에 포함해야 할 HARD STOP 조건:

| 조건 | 임계치 |
|---|---|
| 이미지 요청 연속 실패 | 10건 연속 → 중단 |
| HTTP 429 (rate limit) | 즉시 중단 + 5분 대기 후 재시도 |
| subcategory 분류 오류율 | 20% 초과 → 중단 |
| 최종 파일 행 수 불일치 | 1,767행 ≠ → 교체 금지 |
| 비밀값 패턴 검출 | 즉시 중단 |

---

## 변경 파일

이번 검증 태스크에서 파일 변경 없음.  
생성 파일: `docs/tourapi/busan-overnight-prep-13a-verify.md` (본 보고서)

---

## 결론

| 블로커 | 조치 |
|---|---|
| Playwright 미설치 | `npm install -D playwright && npx playwright install chromium` 후 재시도 |
| busan-K-* 661건 category 미확정 | contentTypeId 매핑 스크립트 선행 실행 |
| 수치 불일치 (1,352 → 1,290) | 핸드오프 문서 수치 정정 필요 |

**3건 모두 해결 후 TASK-13A 재실행 권장.**

---

TASK-DATA-BUSAN-OVERNIGHT-PREP-13A 부산 야간 보강 사전 준비 완료.
