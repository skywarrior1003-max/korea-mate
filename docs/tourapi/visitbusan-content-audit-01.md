# TASK-DATA-BUSAN-VISITBUSAN-CONTENT-AUDIT-01 완료 보고서

**날짜:** 2026-07-24  
**태스크:** TASK-DATA-BUSAN-VISITBUSAN-CONTENT-AUDIT-01  
**범위:** VisitBusan 비이벤트 관광 콘텐츠 (명소·음식·쇼핑·체험·일정여행)  
**총 요청 수:** 40 / 상한 95  
**상태:** PASS

---

## 1. 핵심 발견 요약

| 항목 | 발견 |
|---|---|
| 콘텐츠 ID 파라미터 | **`uc_seq=N`** (이벤트의 `dataSid`나 TourAPI의 `contentId`와 무관) |
| 목록 URL 구조 | `/kr/index.do?menuCd={CATEGORY_CODE}` |
| 상세 URL 구조 | `/kr/index.do?menuCd={DETAIL_CODE}&uc_seq={N}&lang_cd=ko` |
| 페이지네이션 | GET `currentPage=N`, 카테고리 필터 `ucc2_seq=N` |
| 목록 항목 수 | 페이지당 16개 (featured 고정, currentPage로 갱신 안 됨) |
| 전체 항목 수 | **미확인** — 카테고리 필터 조합 없이는 전체 접근 불가 |
| KO 언어 | 완전 서버사이드 렌더링 |
| EN 언어 | **번역된 콘텐츠 서버사이드 렌더링 확인** (이벤트와 다른 결과!) |
| JA/ZhS/ZhT | **RFC 3.0 서버 에러 반환** — 수집 불가 |
| 좌표 | JS 변수(`lat`, `lon`)로 임베드 — 5개 타입 모두 확인 |
| Vue.js | 제목(`{{item.title}}`)은 클라이언트 렌더링 — 정적 HTML에서 미제공 |
| 서버 내부 API | 별도 `/api/` 엔드포인트 없음 (데이터는 HTML에 임베드) |

---

## 2. 사이트 구조 개요

### 2-a. robots.txt
```
Allow: /
Disallow: (없음)
Crawl-delay: (없음)
Sitemap: (없음)
```
수집 제한 없음. 600ms 간격은 안전 마진으로 유지 권장.

### 2-b. 전체 메뉴 구조 (발견된 menuCd)

```
DOM_000000201001000000  명소 (관광지)
DOM_000000201002000000  음식 (맛집)
DOM_000000201003000000  쇼핑
DOM_000000201004000000  숙박
DOM_000000201005000000  축제
DOM_000000202008000000  체험·해양·웰니스
DOM_000000202012000000  일정여행 (추천코스)
DOM_000000202002000000  테마여행
DOM_000000202003000000  미식투어
DOM_000000204012000000  축제·행사 (이벤트 스케줄)  ← 기존 수집 완료
```

---

## 3. Phase 2: 목록 페이지 구조

### 콘텐츠 타입별 목록/상세 menuCd

| 타입 | 목록 menuCd | 상세 menuCd | 카테고리 수 |
|---|---|---|---|
| 명소 (attraction) | DOM_000000201001000000 | DOM_000000201001001000 | 4 |
| 음식 (food) | DOM_000000201002000000 | DOM_000000201002001000 | 8 |
| 쇼핑 (shopping) | DOM_000000201003000000 | DOM_000000201003001000 | 4 |
| 일정여행/코스 | DOM_000000202012000000 | DOM_000000202012001000 | 4 |
| 체험·해양·웰니스 | DOM_000000202008000000 | DOM_000000202008001000 | 3 |

### 목록 페이지 패턴 (핵심 발견)

```
GET https://www.visitbusan.net/kr/index.do?menuCd=DOM_000000201001000000
GET https://www.visitbusan.net/kr/index.do?menuCd=DOM_000000201001000000&ucc2_seq=31   ← 카테고리 필터
GET https://www.visitbusan.net/kr/index.do?menuCd=DOM_000000201001000000&currentPage=2  ← 동일 내용 반환
```

**중요:** `currentPage=2`를 넣어도 1페이지와 동일한 16개 항목을 반환함.  
→ 목록 페이지는 "featured" 큐레이션 섹션이며, `ucc2_seq` 카테고리 필터 조합으로 전체를 순회해야 함.

### 명소 카테고리 (ucc2_seq 값) — 부분 확인

- `31` = 자연
- `35` = 역사
- (추가 카테고리는 HTML button value 파싱 필요)

---

## 4. Phase 3: 상세 페이지 구조

### 상세 URL 구조

```
# KO
GET /kr/index.do?menuCd=DOM_000000201001001000&uc_seq=2753&lang_cd=ko

# EN (번역됨)
GET /en/index.do?menuCd=DOM_000000201001001000&uc_seq=2753&lang_cd=en

# JA — RFC 3.0 에러 반환
GET /jp/index.do?menuCd=DOM_000000201001001000&uc_seq=2753&lang_cd=ja

# pagingParms 파라미터: 불필요 (없어도 정상 접근)
```

### 추출 가능 필드 (타입별)

| 필드 | 명소 | 음식 | 쇼핑 | 코스 | 체험 |
|---|---|---|---|---|---|
| 주소 | ✓ | ✓ | ✓ | ✓ | ✓ |
| 전화번호 | -   | ✓ | ✓ | -  | ✓ |
| 좌표 (lat/lon) | ✓ | ✓ | ✓ | ✓ | ✓ |
| 운영시간 | ✓ | ✓ | ✓ | -  | ✓ |
| 휴무일 | ✓ | ✓ | -  | -  | -  |
| 홈페이지 | ✓ | ✓ | ✓ | ✓ | ✓ |
| 대표메뉴 | -  | ✓ | -  | -  | -  |
| 이용요금 | ✓ | -  | -  | -  | -  |
| 교통정보 | -  | -  | ✓ | ✓ | ✓ |
| 설명 텍스트 | ✓ | ✓ | ✓ | ✓ | ✓ |
| 이미지 | 확인필요 | 확인필요 | 확인필요 | 확인필요 | 확인필요 |
| **제목** | **Vue.js 동적** | **Vue.js 동적** | **Vue.js 동적** | **Vue.js 동적** | **Vue.js 동적** |

**제목(title)**: 상세 페이지에서 `{{item.title}}` 형태의 Vue.js 템플릿으로 클라이언트 측 렌더링 → 정적 HTTP GET만으로는 취득 불가. **대신 목록 페이지에서 uc_seq와 제목을 함께 파싱해야 함.**

### 실제 필드 데이터 샘플 (HTML에서 직접 확인)

**명소 uc_seq=2753 (지그재그아트센터)**
```
주소: 부산 해운대구 달맞이길 30 엘시티 상가 포디움동 1001호
좌표: 35.161175, 129.16803
홈페이지: https://www.zigzagartcenter.com/
휴무일: 매주 일요일
운영: 10:00~18:00 (월~토)
이용요금: 성인 28,000원
```

**음식 uc_seq=2386 (필터커피 카페)**
```
주소: 부산진구 동성로 59 2층
좌표: 35.15574, 129.06819
전화: 070-7607-7060
대표메뉴: Filtered coffee ¥6,000, Cafe latte ¥5,500
휴무일: 연중무휴
운영: 10:00-20:00
```

**쇼핑 uc_seq=2670**
```
주소: 부산 사상구 광장로 7 르네시떼
좌표: 35.164616, 128.97768
전화: 051-319-5000
운영: (확인됨)
교통정보: (확인됨)
```

---

## 5. 다국어 지원 현황

### 비이벤트 콘텐츠 언어 테스트 결과

| 언어 | 목록 | 상세 | 비고 |
|---|---|---|---|
| 한국어 (KO) | ✓ | ✓ | 완전 서버사이드 렌더링 |
| 영어 (EN) | ✓ (92~95% EN) | ✓ **번역됨** | 이벤트와 달리 번역 제공! |
| 일본어 (JA) | ✓ 목록 접근 | ✗ 상세 RFC 3.0 에러 | 상세 수집 불가 |
| 중국어 간체 (ZhS) | ✓ 목록 접근 | ✗ 상세 RFC 3.0 에러 | 상세 수집 불가 |
| 중국어 번체 (ZhT) | ✓ 목록 접근 | ✗ 상세 RFC 3.0 에러 | 상세 수집 불가 |

**이벤트(schedule)와의 비교:**
- 이벤트: EN/JA/ZhS/ZhT 모두 KO 콘텐츠 반환 → KO만 수집
- 비이벤트: EN 번역 제공(서버사이드), JA/ZhS/ZhT 서버 에러 → KO+EN 수집 가능

### EN 번역 샘플 확인 (음식 uc_seq=2386)

```
Best Menu: Filtered coffee ¥6,000 / Cafe latte ¥5,500
Address: 2F, 59, Dongseong-ro, Busanjin-gu
Inquiry: 070-7607-7060
Closing Dates: Open every day
Hours: 10:00-20:00
```

→ 서버사이드에서 직접 영어 콘텐츠 반환. 별도 번역 API 호출 불필요.

---

## 6. Phase 4: TourAPI 교차 검증

### 요약

| 항목 | 값 |
|---|---|
| canonical CSV 총 레코드 | 1,356개 |
| 웹 샘플 수 | 15개 (5타입 × 3개) |
| canonical 비교 샘플 | 10개 (attraction 5 + food 5) |
| 매칭 | 1개 (부분 주소 일치) |
| 매칭률 (추정) | 낮음 |

### 핵심 격차

1. **ID 불일치**: VisitBusan의 `uc_seq` (2000번대)와 TourAPI의 `contentId` (255번 등) 간 직접 연결 없음
2. **콘텐츠 범위 차이**: VisitBusan은 최신 큐레이션 항목(featured list), TourAPI canonical CSV는 보다 오래된 AttractionService/FoodService 전체
3. **주소로 연결**: `태종대` 관련 항목에서 영도구 주소 매칭 발견 — 제목+주소 조합으로 연결 가능
4. **제목 파싱 실패**: 상세 페이지 제목이 Vue.js 렌더링 → 목록 페이지에서 제목 파싱 필요

---

## 7. 수집 전략 권고

### 콘텐츠 ID 수집 방법 (featured 16개 한계 극복)

목록 `index.do`는 featured 16개만 반복 반환. 전체 항목을 수집하려면:

```
# 카테고리 필터 조합
GET /kr/index.do?menuCd=DOM_000000201001000000&ucc2_seq=31   ← 자연
GET /kr/index.do?menuCd=DOM_000000201001000000&ucc2_seq=35   ← 역사
GET /kr/index.do?menuCd=DOM_000000201001000000&ucc2_seq={모든_카테고리_코드}
```

각 카테고리에서 uc_seq를 수집하고, 타입별로 합집합을 구하면 전체 목록 근사.

### 상세 수집 URL

```javascript
// 필드 추출 위치
- 제목:       목록 페이지 <a href="...uc_seq=N...">텍스트</a>에서 파싱
- 주소:       <li><p>주소</p><span>...</span></li>
- 전화:       <li><p>전화번호</p><span>...</span></li>
- 좌표:       JS 변수 lat=N, lon=N (detail 페이지 script 블록)
- 운영시간:   <li><p>운영요일 및 시간</p><span>...</span></li>
- 휴무일:     <li><p>휴무일</p><span>...</span></li>
- 대표메뉴:   <li><p>대표 메뉴</p><span>...</span></li>
- 설명:       <div class="cont">...</div>
- 이미지:     src 중 uploadImgs 포함 경로
```

### 언어별 수집 계획

| 언어 | 방법 | 비고 |
|---|---|---|
| KO | `/kr/index.do?...&lang_cd=ko` | 모든 타입 |
| EN | `/en/index.do?...&lang_cd=en` | 명소·음식·쇼핑·코스·체험 확인 필요 |
| JA | 수집 불가 | RFC 3.0 서버 에러 |
| ZhS | 수집 불가 | RFC 3.0 서버 에러 |
| ZhT | 수집 불가 | RFC 3.0 서버 에러 |

---

## 8. 위험 항목

| 위험 | 영향 | 대응 |
|---|---|---|
| 목록 featured 16개 한계 | 전체 DB 접근 불가 | ucc2_seq 카테고리 필터 루프 필수 |
| 제목 Vue.js 렌더링 | 상세 페이지에서 제목 추출 불가 | 목록 페이지에서 uc_seq+제목 동시 파싱 |
| JA/ZhS/ZhT 에러 | KO+EN만 수집 가능 | 한·영 2개 언어로 제한 (이벤트와 동일) |
| uc_seq ↔ TourAPI 직접 매핑 없음 | canonical CSV 연결 어려움 | 제목+주소 유사도 매칭으로 연결 |
| pagingParms 해시 | 목록→상세 이동 시 포함 여부 | 없어도 상세 페이지 정상 접근 확인 |

---

## 9. 출력 파일

| 파일 | 경로 |
|---|---|
| 감사 스크립트 | `scripts/tourapi-busan-visitbusan-audit.mjs` |
| 상세 샘플 CSV | `data/tourapi/candidates/busan/visitbusan-audit-samples.csv` (15행) |
| JSON 보고서 | `data/tourapi/reports/busan/visitbusan-content-audit-01.json` |
| 이 문서 | `docs/tourapi/visitbusan-content-audit-01.md` |

---

*TASK-DATA-BUSAN-VISITBUSAN-CONTENT-AUDIT-01 완료*
