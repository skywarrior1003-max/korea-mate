# TASK-BUSAN-FOOD-VISITBUSAN-DYNAMIC-DATA-PROBE-V1 검증보고서

**상태**: HOLD (실행 금지 · 개선 아이디어 도출)  
**작성일**: 2026-08-16  
**Branch**: data/busan-food-discovery-v1 @ 8aaca98  
**목적**: VisitBusan 엔티티 상세 페이지에서 이미지 URL·좌표를 자동 추출하는 메커니즘의 실현 가능성 검증  

---

## §1 프로브 대상 및 방법론

### 기준 샘플
| 구분 | 엔티티명 | UC_SEQ | 역할 |
|------|----------|--------|------|
| 브라우저 검증 기준 | 금수복국(VB 기준) | 1941 | 브라우저 정상 표시 레퍼런스 |
| IMAGE_EXTRACTION_FAILED | 톤쇼우 | 1639 | 목표 복구 엔티티 |
| IMAGE_EXTRACTION_FAILED | 차오란 | 1597 | 목표 복구 엔티티 |

### 테스트 URL 형식
```
https://www.visitbusan.net/kr/index.do?menuCd=DOM_000000703003000000&contentsSid={UC_SEQ}
https://api.visitbusan.net/visitFoodContent/getFoodKrItem?UC_SEQ={UC_SEQ}
https://www.visitbusan.net/uploadImgs/files/cntnts/{timestamp}_{type}   (정적 이미지)
```

### 사용 도구
- **WebFetch**: 헤드리스 URL 페치 + Claude 분석 (JavaScript 비실행)
- **PowerShell**: 로컬 데이터 분석

---

## §2 접근성 테스트 결과

### 2-1. www.visitbusan.net 엔티티 상세 페이지

| URL | 결과 | 콘텐츠 |
|-----|------|---------|
| `index.do?menuCd=DOM_000000703003000000&contentsSid=1941` | ❌ 에러 | RFC 3.0 오류 메세지 (eGovFramework) |
| `index.do?menuCd=DOM_000000703003000000&contentsSid=1941&lang=ko` | ❌ 에러 | RFC 3.0 오류 메세지 |
| `index.do?menuCd=DOM_000000208001000000&contentsSid=1941` | ❌ 에러 | RFC 3.0 오류 메세지 |
| `index.do?menuCd=DOM_000000703003002000&contentsSid=1941` | ❌ 에러 | RFC 3.0 오류 메세지 |
| `index.do?menuCd=DOM_000000703003000000` (목록) | ❌ 에러 | RFC 3.0 오류 메세지 |
| `index.do?menuCd=DOM_000000703003003000` (목록) | ❌ 에러 | RFC 3.0 오류 메세지 |

**에러 원인**: eGovFramework 기반 사이트는 세션 쿠키 + CSRF 토큰 필요. WebFetch는 JavaScript를 실행하지 않으므로 초기 세션 수립 불가 → 모든 index.do 경로가 동일한 에러 반환.

### 2-2. api.visitbusan.net

| 엔드포인트 | 결과 |
|------------|------|
| `getFoodKr` (배치 목록) | ❌ WAF 차단 (2018-byte HTML, 기 확인) |
| `getFoodKrItem?UC_SEQ=1941` | ❌ 404 NOT FOUND (엔드포인트 없음) |

**중요**: `getFoodKrItem`은 WAF 차단이 아니라 실제로 존재하지 않는 엔드포인트.  
단일 엔티티 조회 REST API는 VB API에 없음.

### 2-3. 정적 이미지 URL (uploadImgs)

| URL 예시 | 결과 |
|----------|------|
| `uploadImgs/files/cntnts/20230523140214260_ttiel` | ✅ **JPEG 200 OK** (정상 반환) |

**정적 이미지 파일은 접근 가능**. 단, URL 자체를 알아야 접근 가능 (패턴 예측 불가).

### 2-4. robots.txt
```
Allow: /     # 모든 경로 크롤링 허용 (정책 차단 없음)
```
기술적 장벽(JS 실행 필요)만 존재하며 정책적 차단은 없음.

---

## §3 데이터 구조 발견

### 3-1. UC_SEQ=1941 discovery 미수록

Discovery 데이터(721건)에서 UC_SEQ 범위: **70 ~ 3,452,014**  
1941 직전 마지막 수록: **UC_SEQ=1851** (하레마)  
1941 다음 수록: **UC_SEQ=2097** (experience 카테고리)

→ UC_SEQ=1941은 우리 collection 당시 VB API 응답에 포함되지 않았거나, 이후 신규 등록된 엔티티임.

### 3-2. IMAGE_EXTRACTION_FAILED 근본 원인 확인

| 엔티티 | source_key | 원본 image_count | 원인 |
|--------|-----------|-----------------|------|
| 톤쇼우 | FoodService:1639:ko | 0 | 수집 시 API 응답에 이미지 없음 |
| 차오란 | FoodService:1597:ko | 0 | 수집 시 API 응답에 이미지 없음 |
| 쥬가정효 | FoodService:1638:ko | 0 | 수집 시 API 응답에 이미지 없음 |
| 원조할매낙지 | FoodService:1621:ko | 0 | 수집 시 API 응답에 이미지 없음 |
| 언양불고기부산집 | FoodService:1544:ko | 0 | 수집 시 API 응답에 이미지 없음 |
| 할매재첩국 | FoodService:1625:ko | 0 | 수집 시 API 응답에 이미지 없음 |

**핵심**: IMAGE_EXTRACTION_FAILED 6건은 "엔티티 페이지 스크래핑 실패"가 아님.  
원본 `getFoodKr` 배치 API 응답 자체에 이미지 URL이 없었음 (image_count=0).  
→ 엔티티 페이지에 접근하더라도 동일한 이미지 부재일 가능성 있음 (VB DB 내 미등록).

### 3-3. 이미지 수집 원본 메커니즘 확인

기존 120건의 이미지는 **`getFoodKr` 배치 API**에서 수집됨:
```json
{
  "rights": "usable",
  "role": "primary", 
  "source": "www.visitbusan.net",
  "source_type": "primary_image",
  "url": "https://www.visitbusan.net/uploadImgs/files/cntnts/{timestamp}_{type}"
}
```
엔티티 상세 페이지 스크래핑이 아닌 **API 배치 응답의 이미지 필드**에서 직접 추출.  
→ 상세 페이지 접근 방식은 기존 수집 메커니즘과 다른 새로운 시도였으나 차단됨.

---

## §4 자동화 판정

| 항목 | 판정 | 근거 |
|------|------|------|
| VISITBUSAN_DYNAMIC_IMAGE_EXTRACTION | **FAIL** | 모든 index.do 경로 에러. JS 세션 필요 |
| VISITBUSAN_DYNAMIC_COORD_EXTRACTION | **FAIL** | 동일 이유 |
| SAME_MECHANISM_REPRODUCED | **NO** | 브라우저=정상, WebFetch=차단 |
| SAFE_TO_SCALE_TO_BUSAN_FOOD_194 | **NO** | 위 FAIL들로 스케일 불가 |

**종합 판정**: **HOLD** — 엔티티 페이지 접근 메커니즘을 자동화로 재현 불가.

---

## §5 근본 제약 분석

```
┌─────────────────────────────────────────────────────────────┐
│  접근 방법                   상태          차단 이유         │
├─────────────────────────────────────────────────────────────┤
│  api.visitbusan.net getFoodKr     ❌WAF     IP/헤더 차단     │
│  api.visitbusan.net getFoodKrItem ❌404     엔드포인트 없음  │
│  www.visitbusan.net index.do      ❌세션    JS/세션 필요     │
│  uploadImgs 정적 이미지           ✅OK      공개 정적 파일   │
└─────────────────────────────────────────────────────────────┘

접근 가능한 것: 이미 URL을 아는 이미지 파일
접근 불가한 것: 이미지 URL을 발견하는 모든 경로
```

---

## §6 개선 아이디어

### 아이디어 A: KTO API 대체 경로
**대상**: IMAGE_EXTRACTION_FAILED 6건 + UNMATCHED 중 KTO 컨텐츠가 있는 엔티티  
**방법**: 엔티티명·전화번호로 KTO `searchKeyword` API 조회 → contentId 확인 → KTO `detailCommon`/`detailImage` API로 이미지 조회  
**실현 가능성**: MEDIUM (KTO API 접근 가능, 이름 매칭 정확도 미확인)  
**제약**: KTO contentId가 없는 VB-only 엔티티는 커버 불가

### 아이디어 B: getFoodKr 배치 API 재시도 (인프라 변경)
**방법**: 서버사이드 요청, API Key 헤더 추가, Referer 설정 등으로 WAF 우회 시도  
**실현 가능성**: LOW → MEDIUM (WAF 정책에 따라 가변)  
**범위**: 성공 시 전체 VB food 데이터 갱신 + 신규 이미지 발견 가능  
**위험**: WAF 정책이 강화됐다면 동일 차단 반복

### 아이디어 C: Playwright/Selenium 접근 (브라우저 자동화)
**방법**: 실제 브라우저로 JS 실행 → 세션 수립 → 엔티티 페이지 접근  
**실현 가능성**: HIGH (사용자 브라우저에서 확인된 동일 경로)  
**범위**: 74건 대상 이미지 URL + Kakao 지도 좌표 추출 가능  
**제약**: 현재 도구 범위 외 (별도 스크립트 개발 필요), 74건 × rate limit 고려

### 아이디어 D: 엔티티 수준 Source Gap 분류
**방법**: IMAGE_EXTRACTION_FAILED 6건 — VB 엔티티 페이지 존재 자체를 수동/브라우저로 확인  
**목적**: "VB에 이미지 없음(DB 미등록)" vs "이미지 있으나 자동화 실패" 구분  
**비용**: 6건 수동 확인 (소량)  
**결과**: OFFICIAL_IMAGE_NOT_IN_SOURCE vs IMAGE_EXTRACTION_FAILED 재분류

### 아이디어 E: VisitBusan URL 형식 사전 조사
**방법**: 사용자 브라우저에서 금수복국(UC_SEQ=1941) 페이지 → 네트워크 탭 → XHR/fetch 요청 캡처  
**목적**: 실제 데이터 API 엔드포인트 확인 (index.do 렌더링 시 호출되는 Ajax URL)  
**결과**: 새로운 API 경로 발견 가능 → A/B 아이디어 개선

---

## §7 수정된 작업 우선순위 제안

```
[단기] 아이디어 D + E (수동/브라우저 사전조사)
  ① 사용자가 브라우저에서 금수복국 페이지 네트워크 탭 캡처
  ② IMAGE_EXTRACTION_FAILED 6건 VB 페이지 수동 이미지 유무 확인
  → 실제 gap 성격(DB 미등록 vs 추출 실패) 파악 가능

[중기] 아이디어 C (Playwright)
  ③ Playwright 스크립트로 6건 엔티티 페이지 접근 + 이미지 URL 추출
  ④ Kakao 지도 핀 좌표 추출 (지도/주변관광지 탭)
  → 성공 시 스케일 가능

[대안] 아이디어 A (KTO 보완)
  ⑤ 6건 중 KTO에 존재하는 엔티티 KTO API로 이미지 조회
```

---

## §8 판정 근거 요약

| 체크 항목 | 판정 | 상세 |
|-----------|------|------|
| VB entity 페이지 WebFetch 접근 | FAIL | 6가지 URL 변형 모두 에러 |
| getFoodKrItem 단건 API | FAIL | 엔드포인트 없음(404) |
| getFoodKr 배치 API | FAIL | WAF 차단 |
| 정적 이미지 직접 접근 | PASS | URL을 알 경우만 유효 |
| 이미지 URL 탐색 자동화 | FAIL | 탐색 경로 전부 차단 |
| IMAGE_EXTRACTION_FAILED 근본 원인 | 확인 | 수집 시 API image_count=0 |
| UC_SEQ=1941 discovery 수록 여부 | 미수록 | 1851→2097 갭 내 위치 |
| 개선 아이디어 존재 | YES | 5개 아이디어 도출 |

**→ 검증보고서만 작성, 실행(커밋) 금지**

---

## §9 첨부: 테스트 로그 요약

```
[PROBE-001] WebFetch DOM_000000703003000000 contentsSid=1941
  → RFC 3.0 오류 메세지 (eGovFramework, 세션 필요)

[PROBE-002] WebFetch DOM_000000208001000000 contentsSid=1941
  → RFC 3.0 오류 메세지 (동일)

[PROBE-003] WebFetch DOM_000000703003002000 contentsSid=1941
  → RFC 3.0 오류 메세지 (동일)

[PROBE-004] WebFetch index.do 목록 페이지 (menuCd만)
  → RFC 3.0 오류 메세지 (동일)

[PROBE-005] WebFetch api.visitbusan.net getFoodKrItem?UC_SEQ=1941
  → HTTP 404 (엔드포인트 없음, WAF 아님)

[PROBE-006] WebFetch uploadImgs/files/cntnts/20230523140214260_ttiel
  → JPEG 200 OK ✅

[DATA-001] discovery 721건 UC_SEQ=1941 검색
  → NOT FOUND (1851→2097 갭)

[DATA-002] IMAGE_EXTRACTION_FAILED 6건 image_count 확인
  → 전원 image_count=0 (원본 배치 API 이미지 부재)

[DATA-003] 금수복국 canonical 확인
  → 금수복국 해운대본점 = MATCHED + OFFICIAL_IMAGE_RESOLVED
  → 별도 VB entity (UC_SEQ≠1941)
```
