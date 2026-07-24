# TASK-DATA-BUSAN-VISITBUSAN-CONTENT-DISCOVERY-03 완료 보고서

**날짜:** 2026-07-24
**상태:** **PASS ✓**
**조사 요청 수:** 47건
**표본 유효성:** 15/15건 PASS (100%)

---

## GPT 프롬프트 검증

| 우선순위 | 제안 방식 | 검증 결과 |
|---|---|---|
| 1. XHR/JSON API | Vue 카테고리 필터 XHR 요청 | ✗ **해당 없음** — VisitBusan은 XHR/JSON API 미노출. RFC3 CMS JS 번들에 콘텐츠 목록 API 엔드포인트 없음 |
| 2. 서버 HTML·script 상태 | 초기 상태 JSON·script 변수 | ✗ **해당 없음** — `window.__INITIAL_STATE__` 등 embedded JSON 없음. 카테고리 코드는 예상대로 버튼 `value`로 발견 |
| 3. 검색/사이트맵/페이지네이션 | 대체 ID 원천 | ✓ **페이지네이션 방식 작동** — `sitemap.xml`은 HTML 페이지로 무효, 검색 API도 uc_seq 미노출. 그러나 **서버사이드 페이지네이션** 파라미터 발견 → 전체 ID 수집 가능 |
| 4. Playwright | 위 방식 불가 시 | ✓ **ID 발견에 불필요** (단, uc_seq=2566 제목 추출에는 필요) |

**실제 발견 방식:** 서버사이드 HTTP GET 페이지네이션 (GPT 우선순위 3에 해당)

---

## 1. 발견 방식 상세

### 핵심 파라미터

```
GET /kr/index.do?menuCd={listing_menuCd}&ucc2_seq=&list_type=TYPE_SMALL_CARD&order_type=NEW&listCntPerPage2={N}&page_no={P}
```

| 파라미터 | 역할 | 값 |
|---|---|---|
| `menuCd` | 콘텐츠 유형 목록 페이지 코드 | 유형별 상이 (하단 표) |
| `ucc2_seq` | 카테고리 필터 (공백 = 전체) | `""` 또는 category code |
| `listCntPerPage2` | 페이지당 항목 수 | attraction/shopping/experience/course: `500` → 1회 전체 수집 |
| `page_no` | 페이지 번호 | food: 1~22 순회 필요 (16건/페이지 고정) |

### 유형별 수집 방법

| 유형 | 목록 menuCd | 방법 | 요청 수 |
|---|---|---|---|
| attraction | DOM_000000201001000000 | listCntPerPage2=500 (1회) | **2건** (기본+500) |
| food | DOM_000000201002000000 | page_no=1~22 순회 (16건/페이지) | **24건** |
| shopping | DOM_000000201003000000 | listCntPerPage2=500 (1회) | **2건** |
| experience | DOM_000000202008000000 | listCntPerPage2=500 (1회) | **2건** |
| course | DOM_000000202012000000 | listCntPerPage2=500 (1회) | **2건** |

> **food 특이사항:** `listCntPerPage2=500` 파라미터 무시, 항상 16건/페이지 고정 반환.
> `page_no` 파라미터로 페이지 번호 제어. 마지막 페이지(22): 1건, 페이지 23: 0건.

---

## 2. 유형별 전체 고유 uc_seq 건수

| 유형 | 전체 ID 건수 | 카테고리 수 (ucc2_seq) | listCntPerPage2=500 지원 |
|---|---|---|---|
| attraction | **213건** | 4개 | ✓ |
| food | **337건** | 8개 | ✗ (page_no 순회) |
| shopping | **55건** | 4개 | ✓ |
| experience | **121건** | 3개 | ✓ |
| course | **49건** | 4개 | ✓ |
| **합계** | **775건** | **23개** | — |

---

## 3. 카테고리 코드(ucc2_seq) 서버사이드 렌더링 확인

카테고리 필터 버튼은 서버사이드 HTML로 렌더링됨:
```html
<button value="31" title="자연 선택안됨" class="search_btn">자연</button>
```

| 유형 | ucc2_seq 코드 목록 |
|---|---|
| attraction | 31:자연, 35:역사, 36:문화, 37:공원 |
| food | 32:한식, 39:중식, 40:일식, 41:아세안요리, 42:양식, 43:카페&베이커리, 73:해산물, 95:그릴 |
| shopping | 44:전통시장, 45:쇼핑센터, 46:쇼핑거리, 47:기념품 |
| experience | 57:해양·레저, 59:역사·문화, 123:웰니스 |
| course | 90:당일여행, 91:1박2일, 92:2박3일, 93:3박4일이상 |

> PILOT-02에서 0개로 나왔던 이유: `discoverCategories()`가 `ucc2_seq=N` 형식의 href를 탐색했으나,
> 실제 카테고리 버튼은 form submit 방식으로 `<button value="N">` 형태로 렌더링됨.

---

## 4. 표본 15건 유효성 확인

| 유형 | uc_seq | 제목 (KO) | 결과 |
|---|---|---|---|
| attraction | 2753 | 지그재그아트센터 | ✓ OK |
| attraction | 2678 | 감천문화마을에 지어진 어린왕자의 집, 리틀 프린스 하우스 | ✓ OK |
| attraction | 2612 | 도심 속 호수로 떠나는 산책, 회동수원지 둘레길 | ✓ OK |
| food | 2386 | 히떼로스터리 전포점 | ✓ OK |
| food | 2384 | 우봉샤브 | ✓ OK |
| food | 2381 | 고기형 | ✓ OK |
| shopping | 2670 | 서부산 쇼핑의 중심, 르네시떼 | ✓ OK |
| shopping | 2662 | 부산의 분위기와 스토리를 담은 향수·라이프스타일 향 브랜드, 센오 | ✓ OK |
| shopping | 2589 | 무지개다리에서 시작하는 골동품 여행, 문현동 골동품거리 | ✓ OK |
| experience | 2789 | 부산의 아침을 함께 달린 따뜻한 하루, 모모스커피와 함께한 기부 러닝 | ✓ OK |
| experience | 2784 | 부산에서 만나는 새로운 휴식, 부산다운 웰니스 커뮤니티 | ✓ OK |
| experience | 2763 | 부산 최고 수준의 시설을 자랑하는 웰메이드 소극장, KNN시어터 | ✓ OK |
| course | 2788 | 여름을 수놓는 보랏빛 풍경, 2026 제16회 태종대 수국꽃 문화제 코스 | ✓ OK |
| course | 2624 | 연말과 새해를 한 번에, 부산 무박 2일 신년맞이 일출 여행 코스 | ✓ OK |
| course | 2606 | 가을빛 따라 걷는 1박 2일 부산 여행 | ✓ OK |

**유효 15건 / 오류 0건 / vue_only 0건**

---

## 5. requires_client_render (uc_seq=2566) 해결 가능 여부

| 항목 | 결과 |
|---|---|
| uc_seq=2566 ID 발견 가능 | ✓ listCntPerPage2=500 목록에 포함됨 |
| 상세 페이지 `var mtTitle` | ✗ 여전히 undefined |
| 상세 페이지 p-txt 주석 | ✗ 없음 |
| listing 앵커 텍스트 | 빈 텍스트 (href만 있음) |

**결론:** uc_seq=2566의 제목은 JavaScript 렌더링 이후에만 접근 가능.
ID 수집은 가능하지만 제목 추출에는 Playwright 필요.
→ 전체 수집 시 `requires_client_render` 마킹 후 Playwright 보완 단계로 이관.

---

## 6. 전체 수집 예상 HTTP 요청량

| 단계 | 내용 | 요청 수 |
|---|---|---|
| ID 발견 | attraction·shopping·experience·course 각 2건 + food 24건 | 32건 |
| KO 상세 | 775건 전체 | 775건 |
| EN 상세 | 타입당 5건 (총 5종) | 25건 |
| JA/ZhS/ZhT 확인 | 타입당 각 1건 | 15건 |
| **합계** | | **847건** |

- 요청 간격: 700ms
- 예상 소요시간: **약 10분** (@700ms/req)
- 인증 불필요, 우회 불필요
- rate limit 위험: 없음 (700ms 간격, 847건)

---

## 7. Playwright 필요 여부

| 목적 | Playwright 필요 |
|---|---|
| 전체 uc_seq ID 발견 | **불필요** |
| ucc2_seq 카테고리 코드 획득 | **불필요** |
| KO 상세 페이지 수집 | **불필요** |
| uc_seq=2566 제목 추출 | **필요** (서버사이드 `var mtTitle` 없음) |
| EN 상세 페이지 수집 | **불필요** |

---

## 8. 전체 수집 스크립트 수정 계획 (CONTENT-COLLECT-04)

기존 `tourapi-busan-visitbusan-content-pilot.mjs`의 수정 포인트:

| 함수 | 현재 | 수정 방향 |
|---|---|---|
| `discoverCategories()` | onclick/href/input에서 ucc2_seq 탐색 → 0건 | 버튼 `value` 추출로 교체 |
| `collectIds()` | 기본 16건 + 카테고리 루프 → 16건 고정 | `listCntPerPage2=500` + food는 `page_no` 순회 |
| KO_TARGET | 20 (달성 불가) | 제거 또는 타입별 전체 수집으로 변경 |

---

## 9. 검증 및 조사 파일

| 파일 | 목적 |
|---|---|
| `scripts/tourapi-busan-visitbusan-discovery-03.mjs` | **재사용** — 전체 수집 전 ID 목록 갱신·유효성 확인용 |
| `docs/tourapi/visitbusan-content-discovery-03-report.md` | 본 보고서 |

---

**판정: PASS ✓**

- 전체 775건 ID 발견 방식 확정 (서버사이드 HTTP GET 페이지네이션)
- ucc2_seq 카테고리 코드 23개 서버사이드 렌더링 확인
- Playwright 불필요 (ID 발견·KO/EN 상세 수집)
- 표본 15/15건 유효
- 예상 847건 요청, 약 10분 소요

TASK-DATA-BUSAN-VISITBUSAN-CONTENT-DISCOVERY-03 전체 콘텐츠 발견 방식 확정 완료.
