# TASK-DATA-BUSAN-VISITBUSAN-PILOT — 완료 보고서

**날짜:** 2026-07-24  
**태스크:** TASK-DATA-BUSAN-VISITBUSAN-PILOT  
**상태:** PASS (파이럿 완료 + 주요 구조 발견 포함)

---

## 1. 검증 요약 (실행 전 GPT 프롬프트 대비 실제 결과)

| 항목 | GPT 프롬프트 예상 | 실제 발견 |
|---|---|---|
| 페이지네이션 방식 | POST + `pageIndex` | **GET + `startPage`** (form method="get") |
| form 필드명 | `pageIndex` | **`startPage`** (`fn_go_page`가 `#startPage` 업데이트) |
| POST 엔드포인트 | `schedule/list.do` POST | **/schedule/list.do GET** (lang prefix 없음) |
| 언어 콘텐츠 가용성 | 일부 언어 미제공 예상 | **ALL 26/26 비KO 페이지 language_available=false** |
| dataSid 일치 | KO·EN 확인됨 | ✓ 전 언어 동일 dataSid로 접근 가능 |
| HTML 파싱 패턴 | 불명확 | 확인: `<p class="tit">`, `<div class="name/detail">`, JS `var mtTitle` |

**GPT 프롬프트의 POST 가정은 틀렸으나** 프롬프트 자체가 "실제 form 구조를 확인해 구현"이라고 명시하여 파일럿 목적이 이 발견에 있었음. 구현 방향 수정으로 즉시 해결.

---

## 2. 핵심 발견

### [발견-1] 페이지네이션: POST 아닌 GET + startPage

**실제 form 구조:**
```html
<form action="/schedule/list.do" name="searchfrm" id="searchfrm" method="get">
  <input type="hidden" name="boardId" value="BBS_0000009"/>
  <input type="hidden" name="menuCd" value="DOM_000000204012000000"/>
  <input type="hidden" name="startPage" value="1"/>
  <input type="hidden" name="month" value="7"/>
  <input type="hidden" name="year" value="2026"/>
</form>
<script>
  function fn_go_page( pageno ) {
    $("#startPage").val(pageno);
    $("#searchfrm").submit();
  }
</script>
```

**동작하는 page 2 URL:**
```
GET https://www.visitbusan.net/schedule/list.do
  ?boardId=BBS_0000009&menuCd=DOM_000000204012000000&startPage=2&month=7&year=2026
```

결과: 1페이지 13건 + 2페이지 3건 = **16건 완전 수집**

---

### [발견-2] 비KO 언어 — schedule 섹션 전체 미번역

**테스트 범위:** EN 10건, JA 10건, ZhS 3건, ZhT 3건 (총 26건)  
**결과: 26/26 모두 language_available=false**

비짓부산의 `schedule/view.do` (행사일정) 상세 페이지는 **비KO URL 요청에도 한국어 콘텐츠를 반환**함.
- `/en/schedule/view.do?dataSid=6167` → 장소: "북항 친수공원 및 랜드마크 부지 일원" (한국어)
- `/jp/schedule/view.do?dataSid=6167` → 동일한 한국어 콘텐츠
- 5개 언어 지원은 일반 관광 정보 섹션에 해당하며 행사일정 상세는 KO 전용

**결론:** KO 데이터만 수집이 현실적. 비KO 언어 URL은 저장하되 `language_available=false`로 표시, GoKoreaMate 다국어 전시 시 KO 원문 + `language_available=false` 고지로 처리.

---

### [발견-3] HTML 파싱 구조 확정

**목록 페이지:**
```html
<a href="/schedule/view.do?...&dataSid=6167" title="TITLE 바로가기">
  <p class="imgwrap"><img src="/upload_data/..." alt="TITLE"></p>
  <p class="tit">TITLE</p>
  <p class="cont">2026-07-31 ~ 2026-08-09</p>  <!-- 이미 ISO 형식 -->
</a>
```

**상세 페이지:**
```html
<!-- 제목 (우선순위: tit_view_sub > JS mtTitle) -->
<div class="tit_view_sub"><p>TITLE</p></div>
<script>var mtTitle = "TITLE" + " | " + document.title;</script>

<!-- 레이블-값 구조 -->
<div class="name">일자</div>
<div class="detail">2026.07.31.(금) ~ 2026.08.09.(일)</div>
<div class="name">장소</div>
<div class="detail"><span>VENUE</span></div>
<div class="name">주소</div>
<div class="detail"><p>ADDRESS</p></div>

<!-- 공식 URL -->
<a href="https://bhsupfesta.com/" target="_blank">홈페이지</a>
```

---

### [발견-4] 여러 달 중복 행사 7건 (16건 중 43.75%)

| dataSid | 행사명 | 기간 |
|---|---|---|
| 6167 | 2026 북항 오션 SUP FESTA | 7월 31일 ~ 8월 9일 |
| 6111 | 발코니 뮤직쇼 앤 스트릿 페스타 | 7월 25일 ~ 12월 19일 |
| 6148 | 2026 별바다부산 나이트페스타 | 7월 1일 ~ 12월 31일 |
| 5524 | 부산행 축제대전 | 4월 13일 ~ 12월 31일 |
| 6074 | 전시 울트라백화점 부산 | 7월 17일 ~ 11월 1일 |
| 6037 | 포켓몬 메가페스타 2026 in 부산 | 7월 10일 ~ 8월 9일 |
| 6068 | 렛츠런파크 SUN 더 워터페스티벌 | 7월 4일 ~ 8월 17일 |

**대응 방안:** 전체 수집 시 월별 목록에서 중복 출현하는 dataSid를 dedup — 동일 dataSid가 여러 달 목록에 포함되더라도 1건으로 저장.

---

## 3. 수집 결과 지표

| 항목 | 수치 |
|---|---|
| 총 HTTP 요청 | 44건 |
| KO 7월 행사 | 16건 (2페이지) |
| 제목 파싱 성공 | 15/16 (93.75%) |
| 날짜 파싱 성공 | 15/16 (93.75%) |
| 장소 파싱 성공 | 13/16 (81.25%) |
| 주소 파싱 성공 | 10/16 (62.5%) |
| 공식 URL 수집 | 10/16 (62.5%) |
| 이미지 URL 수집 | 15/16 (93.75%) |
| language_available=false | 26/26 비KO 테스트 (100%) |

**dataSid=4138 파싱 실패:** 해당 레코드는 목록에서 페이지 하단 copyright 링크에 dataSid가 포함된 무관한 링크로 추정. 전체 수집 시 URL 필터링 필요.

---

## 4. 검증 확인 (파일럿 안전장치)

| 검증 항목 | 결과 |
|---|---|
| 0건 시 기존 결과 보호 | ✓ 코드 구현 완료 (exit 1) |
| GET 1페이지 0건 시 중단 | ✓ 구현 완료 |
| 중복 dataSid 제거 | ✓ seenSids Set 기반 처리 |
| 다음 페이지 링크 없으면 종료 | ✓ fn_go_page(N+1) 패턴 확인 |
| 500ms+ 요청 간격 | ✓ 600ms 적용 |
| 재시도 로직 | ✓ MAX_RETRY=2 |
| API 키 노출 없음 | ✓ |
| 본문 전문 미저장 | ✓ (행사명·날짜·장소·URL만 저장) |

---

## 5. 변경 파일

| 파일 | 변경 |
|---|---|
| `scripts/tourapi-busan-visitbusan-pilot.mjs` | **신규** — 파일럿 수집 스크립트 |
| `data/tourapi/candidates/busan/busan-visitbusan-pilot-events.csv` | **신규** — 16행 이벤트 데이터 |
| `data/tourapi/candidates/busan/busan-visitbusan-pilot.json` | **신규** — 전체 수집 결과 JSON |
| `data/tourapi/reports/busan/busan-visitbusan-pilot-metrics.json` | **신규** — 수집 지표 |
| `data/tourapi/raw/busan/visitbusan-pilot/` | **신규** — 디버깅용 원시 HTML 샘플 5개 |

---

## 6. 데이터 품질 이슈

### official_url 이상 사례 (dataSid=6074)

- 수집된 URL: `https://nol.yanolja.com/ticket/products/26006746`
- VisitBusan이 홈페이지 링크로 야놀자 예매 페이지를 제공한 케이스
- 이는 VisitBusan이 제공하는 raw 데이터를 그대로 반영한 결과
- 전체 수집 시 **도메인 분류 필요**: `nol.yanolja.com`, `tickets.interpark.com` 등 예매 플랫폼 도메인을 별도 태깅 (`official_url_type: 'organizer' | 'ticket_platform' | 'social'`)

### dataSid=4138 페이지 하단 copyright 링크

- 페이지 HTML에서 `<ul id="playlist">` 외부의 copyright 영역에 dataSid가 포함된 링크 존재
- 전체 수집 시 `<ul id="playlist">` 내부 링크만 대상으로 제한 필요

---

## 7. 전체 수집 확장 시 수정 사항

파일럿 결과를 반영한 전체 수집(`tourapi-busan-visitbusan-collect.mjs`) 구현 시:

1. **페이지네이션:** GET `startPage` 사용 (POST 불필요, 이전 가정 수정)
2. **언어:** KO 상세만 수집. 비KO URL은 제공하되 `language_available=false` 표시
3. **dataSid 중복:** 월별 dedup 처리 (Set 기반, 멀티월 행사 1건으로)
4. **dataSid=4138 필터:** `<ul id="playlist">` 내부 링크만 수집
5. **official_url 도메인 분류:** 예매 플랫폼 도메인 별도 태깅
6. **장소 미파싱 보강:** `<div class="detail">` 하위 구조 다양성 처리
7. **월 범위:** 2026년 7~12월 반복 수집 후 dataSid 기반 dedup
8. **전체 요청 예상:** 월 약 44건 × 6개월 = 약 264건 (월별 수집)

---

## 8. VisitBusan 데이터 활용 전략 수정

파일럿 결과에 따른 핵심 전략 변경:

**변경 전 (GPT 가정):** 비짓부산 5개 언어 콘텐츠 수집 → 다국어 데이터 풍부화  
**변경 후 (실제):** KO 콘텐츠 수집 전용 → GoKoreaMate에서 AI 기반 번역 또는 KO 원문 표시

```
VisitBusan 행사 데이터 (KO 전용)
  ↓
KO 행사명·일정·장소·공식URL 수집
  ↓
GoKoreaMate 사용자 언어별 표시:
  - 행사명: KO 원문 + 괄호 영어 (AI 번역)
  - 날짜/장소: KO 원문 (국제적으로 이해 가능)
  - official_url: 주최자 사이트 링크 (언어 무관)
```

---

## 9. git 상태

git add / commit / push 없음. 비밀값 노출 없음. 운영 DB 수정 없음.  
API 키 호출 없음. visitbusan.net 44건 요청 (robots.txt 허용).

---

TASK-DATA-BUSAN-VISITBUSAN-PILOT 비짓부산 행사 파일럿 수집 완료. GET startPage 페이지네이션 확인, 비KO 콘텐츠 미제공 확인, 파서 구조 확정.
