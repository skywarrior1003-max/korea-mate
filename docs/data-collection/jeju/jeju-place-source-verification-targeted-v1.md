# TASK-JEJU-PLACE-SOURCE-VERIFICATION-TARGETED-V1

**Branch:** data/jeju-collection-v2  
**Status:** PASS_WITH_WARN  
**Generated:** 2026-08-13

---

## 개요

제주 c1 장소 컬렉션의 좌표 누락/무효 32건 및 전화 NEEDS_VERIFICATION 6건을 대상으로
외부 소스(KTO searchKeyword2, VisitJeju 웹)를 통한 targeted source verification 수행.

**RULE-E 준수:** 임의 좌표 생성 금지 · 지도 웹 scraping 금지 · KTO API 및 공식 소스만 허용.

---

## 검증 결과 요약

| 항목 | 입력 | 검증 완료 | 미확보 | 비고 |
|------|-----:|--------:|------:|------|
| 좌표 (COORD) | 32 | 4 (12.5%) | 28 | KTO 3건 + LINEAR_ROUTE anchor 1건 |
| 전화 (PHONE) | 6 | 0 | 6 | Naver 후속 필요 |

---

## 좌표 결과 상세 (32건 전체)

| # | contentsid | title | geometry_type | 결과 | KTO ID | lat | lon |
|---|-----------|-------|--------------|------|--------|-----|-----|
| 1 | CNTS_000000000022255 | 제주 카약올레 | LINEAR_ROUTE | **VERIFIED_SOURCE_ANCHOR** | 2738709 | 33.4624 | 126.3105 |
| 2 | CNTS_000000000022390 | 병악현무암지대 | POINT | NO_SOURCE_COORDINATE_FOUND | — | — | — |
| 3 | CNTS_200000000007159 | 신산신양해안도로 | LINEAR_ROUTE | NO_SOURCE_COORDINATE_FOUND | — | — | — |
| 4 | CNTS_200000000010375 | 제주환상자전거길 | ROUTE_COLLECTION | **FOLLOWUP_REQUIRED** | — | — | — |
| 5 | CNTS_200000000011254 | 제주친구 | POINT | NO_SOURCE_COORDINATE_FOUND | — | — | — |
| 6 | CNTS_200000000011313 | 케이제주해양사업단 | POINT | NO_SOURCE_COORDINATE_FOUND | — | — | — |
| 7 | CNTS_200000000011915 | 신흥리 동백 & 향나무길 | LINEAR_ROUTE | NO_SOURCE_COORDINATE_FOUND | — | — | — |
| 8 | CNTS_200000000012073 | 영등할망신화공원 | AREA | NO_SOURCE_COORDINATE_FOUND | — | — | — |
| 9 | CNTS_200000000012075 | 헌마공신김만일기념관 | POINT | NO_SOURCE_COORDINATE_FOUND | — | — | — |
| 10 | CNTS_200000000012138 | 영아리 | UNKNOWN | **VERIFIED_SOURCE_COORDINATE** | 2433925 | 33.3269 | 126.7170 |
| 11 | CNTS_200000000012139 | 진지동굴 | POINT | **VERIFIED_SOURCE_COORDINATE** | 2765245 | 33.1991 | 126.2935 |
| 12 | CNTS_200000000012327 | 종달고망난돌쉼터 | LINEAR_ROUTE | NO_SOURCE_COORDINATE_FOUND | — | — | — |
| 13 | CNTS_300000000012898 | 성안올레 | LINEAR_ROUTE | NO_SOURCE_COORDINATE_FOUND | — | — | — |
| 14 | CNTS_300000000013561 | 아이바가든 | AREA | NO_SOURCE_COORDINATE_FOUND | — | — | — |
| 15 | CNTS_300000000013654 | 김정문알로에 알로에숲 | AREA | NO_SOURCE_COORDINATE_FOUND | — | — | — |
| 16 | CNTS_300000000013657 | 오투힐 | POINT | NO_SOURCE_COORDINATE_FOUND | — | — | — |
| 17 | CNTS_300000000013707 | 그림휴가 | POINT | NO_SOURCE_COORDINATE_FOUND | — | — | — |
| 18 | CNTS_300000000013749 | 영천동 해바라기축제 | POINT | NO_SOURCE_COORDINATE_FOUND | — | — | — |
| 19 | CNTS_300000000013755 | 국수문화거리 | AREA | NO_SOURCE_COORDINATE_FOUND | — | — | — |
| 20 | CNTS_300000000013757 | 중앙로 | AREA | NO_SOURCE_COORDINATE_FOUND | — | — | — |
| 21 | CNTS_300000000013798 | 쏙인제주 | POINT | NO_SOURCE_COORDINATE_FOUND | — | — | — |
| 22 | CNTS_300000000013959 | 자연인제주족욕 | POINT | NO_SOURCE_COORDINATE_FOUND | — | — | — |
| 23 | CNTS_300000000014075 | 마리에 인 제주 | POINT | NO_SOURCE_COORDINATE_FOUND | — | — | — |
| 24 | CNTS_300000000014092 | 파호이호이 라바필드 파크 제주 | AREA | NO_SOURCE_COORDINATE_FOUND | — | — | — |
| 25 | CNTS_300000000014330 | 안덕면사무소 수국길 | UNKNOWN | NO_SOURCE_COORDINATE_FOUND | — | — | — |
| 26 | CNTS_300000000014331 | 곽지 과물노천탕 | POINT | NO_SOURCE_COORDINATE_FOUND | — | — | — |
| 27 | CNTS_300000000014461 | 색달포레스트 | AREA | NO_SOURCE_COORDINATE_FOUND | — | — | — |
| 28 | CNTS_300000000014486 | 노틸러스다이브제주 | POINT | NO_SOURCE_COORDINATE_FOUND | — | — | — |
| 29 | CNTS_300000000014529 | 피크닉인제주 | POINT | NO_SOURCE_COORDINATE_FOUND | — | — | — |
| 30 | CNTS_300000000014534 | 스카이 다이어리 | POINT | NO_SOURCE_COORDINATE_FOUND | — | — | — |
| 31 | CNTS_300000000014605 | 드르쿰다 in 성산 | POINT | **VERIFIED_SOURCE_COORDINATE** | 2755445 | 33.4445 | 126.9191 |
| 32 | CNTS_300000000014728 | 애월 몽달 | POINT | NO_SOURCE_COORDINATE_FOUND | — | — | — |

**집계 검증:** VERIFIED_SOURCE_COORDINATE(3) + VERIFIED_SOURCE_ANCHOR(1) + FOLLOWUP_REQUIRED(1) + NO_SOURCE_COORDINATE_FOUND(27) = 32 ✓

### 검증 성공 4건 상세

| contentsid | title | KTO contentid | KTO title | lat (mapy) | lon (mapx) | anchor_type |
|-----------|-------|--------------|-----------|-----------|-----------|------------|
| CNTS_000000000022255 | 제주 카약올레 | 2738709 | 제주카약올레 | 33.4623616693 | 126.3104869587 | KTO_REPRESENTATIVE_POINT |
| CNTS_200000000012138 | 영아리 | 2433925 | 영아리 | 33.3268525509 | 126.716996389 | — |
| CNTS_200000000012139 | 진지동굴 | 2765245 | 진지동굴 | 33.1991210589 | 126.2935109685 | — |
| CNTS_300000000014605 | 드르쿰다 in 성산 | 2755445 | 드르쿰다 | 33.4444983695 | 126.9191261882 | — |

**주의:** 드르쿰다 KTO 검색에서 "목장카페드르쿰다"(id=2774895, 서귀포시 표선면)도 반환됨.  
"드르쿰다 in 성산" 대상에는 id=2755445(서귀포시 성산읍 섭지코지로25번길 64)가 정확한 매칭.

---

## 전화 결과 상세 (6건 전체)

| title | contentsid | 원본 phone_source_state | KTO 결과 | VisitJeju 웹 | 최종 phone_semantic_status |
|-------|-----------|----------------------|---------|------------|--------------------------|
| 노을승마장 | CNTS_000000000018496 | SOURCE_PLACEHOLDER | NO_KTO_MATCH | 템플릿 번호만¹ | NEEDS_VERIFICATION |
| 성읍목장 | CNTS_000000000019988 | SOURCE_PLACEHOLDER | NO_KTO_MATCH | 템플릿 번호만¹ | NEEDS_VERIFICATION |
| 성이시돌목장 | CNTS_200000000008053 | SOURCE_EMPTY | KTO_MATCHED_NO_PHONE² | 템플릿 번호만¹ | NEEDS_VERIFICATION |
| 대정현역사자료전시관 | CNTS_200000000008156 | SOURCE_EMPTY | NO_KTO_MATCH | 템플릿 번호만¹ | NEEDS_VERIFICATION |
| 예래생태체험관 | CNTS_200000000008159 | SOURCE_EMPTY | NO_KTO_MATCH | 템플릿 번호만¹ | NEEDS_VERIFICATION |
| 감귤박물관 월라봉 산책로 - 생이소리길 | CNTS_200000000011919 | SOURCE_EMPTY | NO_KTO_MATCH | 템플릿 번호만¹ | NEEDS_VERIFICATION |

**집계 검증:** DIRECT_PHONE_VERIFIED(0) + SOURCE_PLACEHOLDER_CONFIRMED(2) + SOURCE_EMPTY_CONFIRMED(4) = 6 ✓

> ¹ "064-740-6000" = 제주특별자치도 관광정보센터 공통 번호 — VisitJeju **모든** 페이지 공통 템플릿에 포함. 시설 직통번호 아님. 6개 페이지 HTML 렌더 확인(800KB~1MB), 시설별 개별 전화 없음.
>
> ² 성이시돌목장: KTO contentid=2606298 매칭(score=2). searchKeyword2 tel 필드 없음. detailCommon2 호출 결과 DETAIL_NOT_FOUND. VisitJeju 웹도 템플릿 번호만.

---

## 검증 방법론

### 사용 소스 (우선순위 순)

| 우선순위 | 소스 | 사용 여부 | 결과 |
|---------|------|----------|------|
| P1 | VisitJeju 공식 API | — | 이미 원본 데이터 소스, 재검증 불필요 |
| P2 | VisitJeju 웹 | **사용** | 전화 6건 HTML 렌더 확인. 시설 번호 없음 |
| P3 | 제주도 공식 사이트 | — | KTO 검색으로 대체 |
| P4 | 공인 지오코딩 API | — | KTO 좌표로 대체 (KTO = 공인 데이터) |
| P5 | KTO searchKeyword2 | **사용** | areaCode=39, 3 pass (primary+supplement+finalize) |

### KTO 검색 통계

- **1차 (primary):** 38건 × 1회 = 38 calls (title 직접 검색)
- **2차 (supplement):** 23건 × 2~3 alt_keyword = ~46 calls (alternative keyword)
- **3차 (finalize):** 2건 × 1회 = 2 calls (좌표 확정용)
- **전화 detailCommon2:** 1건 (성이시돌목장 contentid=2606298)
- **VisitJeju 웹:** 6 pages

### 매칭 기준

- score=3: 정규화 제목 완전 일치 (제주카약올레)
- score=2: 부분 포함 관계 (영아리, 진지동굴, 드르쿰다)
- score=1: 단어 50% 이상 일치 (모호 — 좌표 미채택)
- score=0: 미매칭 (NO_SOURCE_COORDINATE_FOUND)

### 좌표 검증 기준

Jeju 유효 범위: lat 33.0 ~ 34.5, lon 126.0 ~ 127.0

---

## FOLLOWUP_REQUIRED 분석: 제주환상자전거길

- **geometry_type:** ROUTE_COLLECTION
- **이유:** 여러 구간(segment)으로 구성된 자전거 도로. 단일 대표점 불가.
- **필요한 데이터:** 공식 자전거길 운영기관의 segment 구조 (시작점/끝점 좌표 쌍)
- **권장 소스:** 제주특별자치도 자전거길 공식 GIS 또는 운영기관 직접 연락
- **현재 상태:** NEEDS_SOURCE_SEGMENTATION 유지

---

## NO_SOURCE_COORDINATE_FOUND (27건) 분석

27건 미확보 이유:

| 유형 | 건수 | 설명 |
|------|-----:|------|
| 상업 체험업체 (VisitJeju only) | ~12 | KTO 미등재 소규모 업체 (제주친구, 케이제주해양사업단, 오투힐, 그림휴가 등) |
| 자연지형/도로 (지명 KTO 미등재) | ~7 | 병악현무암지대, 신산신양해안도로, 국수문화거리, 중앙로, 수국길 등 |
| LINEAR_ROUTE (anchor 없음) | 4 | 신흥리 동백길, 종달고망난돌쉼터, 성안올레, 신산신양해안도로 |
| AREA (KTO 미등재) | 4 | 영등할망신화공원, 아이바가든, 김정문알로에 알로에숲, 파호이호이 등 |

---

## RULE-E 준수 확인

- **임의 좌표 생성:** 없음 (모든 좌표 = KTO API 반환값)
- **지도 웹 스크레이핑:** 없음
- **Google Maps / Kakao Map:** 미사용
- **AI 좌표 추정:** 없음
- **VisitJeju 웹 접근:** 전화번호 텍스트 추출 목적만, 좌표 추출 없음

---

## 후속 작업

1. **좌표 업데이트 (4건):** jeju-place-c1-canonical-v1.json 또는 해당 레코드에 검증된 좌표 반영 → navigation_status → READY, AI_ITINERARY_ELIGIBLE 재평가
2. **전화 Naver 후속 (6건):** NAVER_FINAL_VERIFICATION_ONLY 정책에 따라 Naver 직접 검색으로 시설별 직통전화 확인
3. **제주환상자전거길 FOLLOWUP:** 별도 태스크로 segment 구조 확보
4. **TASK-JEJU-PLACE-FINAL-QA-V1:** source verification 완료 후 최종 QA

---

## 관련 파일

- 검증 원본 타겟: `data/visitjeju/manifests/jeju/jeju-place-source-verification-targets-v1.json`
- 검증 결과: `data/visitjeju/normalized/jeju/jeju-place-source-verification-v1.json`
- 검증 매니페스트: `data/visitjeju/manifests/jeju/jeju-place-source-verification-manifest-v1.json`
- 리뷰 항목: `data/visitjeju/reports/jeju/jeju-place-source-verification-review-v1.json`
- QA: `data/visitjeju/reports/jeju/jeju-place-source-verification-qa-v1.json`
- RULE-A~G SSOT: `docs/data-collection/multicity-phone-semantics-and-geometry-policy-v1.md`
