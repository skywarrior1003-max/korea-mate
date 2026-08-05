# TASK-GYEONGJU-WEB-RAW-COLLECTION-V1 검증보고서

**Task:** TASK-GYEONGJU-WEB-RAW-COLLECTION-V1
**검증일:** 2026-08-05
**판정:** `EXECUTION_HOLD — SCRIPT_UPGRADE_REQUIRED`
**검증 방법:** 스크립트 전체 코드 리뷰 + sample output 분석 + task 명세 대조

---

## 1. 검증 범위

| 대상 | 버전 | 검토 방법 |
|------|------|---------|
| `scripts/gyeongju_culture_web_collect.py` | v1.0.0 | 전체 코드 정적 분석 |
| `scripts/visitgyeongju_collect.py` | v1.0.0 | 전체 코드 정적 분석 |
| TASK 명세 요구사항 대조 | — | 라인별 대응 확인 |
| 기존 표본 수집 결과 | 2026-08-04 | JSONL 내용 확인 |

---

## 2. 판정 요약

| # | 항목 | 심각도 | 판정 |
|---|------|--------|------|
| B1 | attractions 상세 페이지 미수집 | **BLOCKER** | 실행 불가 |
| B2 | events 상세 페이지 미수집 (날짜·장소 없음) | **BLOCKER** | 실행 불가 |
| B3 | cultural-guides 하드코딩 목록 (task 금지 위반) | **BLOCKER** | 실행 불가 |
| B4 | monthly-recommendations 콘텐츠 미파싱 | **BLOCKER** | 실행 불가 |
| B5 | visitgyeongju 언어 번역 판정 분류 없음 | **BLOCKER** | 실행 불가 |
| B6 | visitgyeongju 상호명 추출 불가 (OG title = 사이트명 고정) | **BLOCKER** | 실행 불가 |
| I7 | visitgyeongju KNOWN_COUNTS 오류 (96 → 실제 84) | improvement | 수정 권장 |
| I8 | visitgyeongju Accept-Language 헤더 locale별 미분리 | improvement | 수정 권장 |
| I9 | visitgyeongju 비KO 주소 추출 불가 | improvement | 수정 권장 |
| I10 | visitgyeongju list reconciliation 불가 (JS 렌더링) | improvement | 명세 수정 |

**블로커 6개 — 현행 스크립트로 실행 시 task 검증 기준 다수 위반.**

---

## 3. 블로커 상세

### B1 — attractions: 상세 페이지 미수집

**근거 코드 (gyeongju_culture_web_collect.py:303-308):**
```python
rec = {
    "area_uid": item["area_uid"],
    ...
    "detail_url": item["detail_url"],
    "detail_fetched": False,   # ← 상세 페이지를 가져오지 않음
    ...
}
```

현재 `collect_attractions()`는 권역별 목록 페이지만 fetch하여 area_uid와 detail_url을 추출합니다.
상세 페이지 fetch 자체가 없고, `detail_fetched: False`가 명시적으로 기록됩니다.

**Task 요구 (Section 2 "관광지"):**
> 반드시 수집: 관광지명, 주소, 전화번호, 운영시간, 입장료, 휴무일, 주차, 페이지 내 구조화 사실

이 필드들은 **상세 페이지 (`area_uid=N&cmd=2`)에서만 제공**됩니다. 목록 페이지에는 없습니다.

**충돌하는 검증 기준:**
- "경주문화관광 유형별 reconciliation" — 상세 URL 수 vs 성공 상세 수가 항상 0으로 기록됨

**필요한 수정:** `collect_attractions()` 내에 area_uid당 상세 URL fetch 루프 + 상세 HTML 파서 추가 (~120줄 신규)

---

### B2 — events: 상세 페이지 미수집 (날짜·장소·주최 없음)

**근거 코드 (gyeongju_culture_web_collect.py:540-553):**
```python
rec = {
    "con_uid": ev["con_uid"],
    "name_ko": ev.get("name_ko"),  # ← "상세보기" 고정 텍스트
    "year": cur_year,
    "month": cur_month,            # ← 월 단위만 있고 일자 없음
    "detail_url": ev["detail_url"],
    # 시작일, 종료일, 장소, 주소, 주최·주관, 연락처 없음
}
```

이벤트 목록 페이지는 링크 텍스트가 "상세보기"로 고정돼 있어 name_ko가 전혀 추출되지 않습니다.
날짜는 month 단위만 있고, 일(day) 레벨 시작일/종료일이 없습니다.

**Task 요구 (Section 2 "행사·축제·공연·전시"):**
> 공식 con_uid, 행사명, 유형, 시작일, 종료일, 장소, 주소, 주최·주관, 연락처

**충돌하는 검증 기준 (Section 필수 검증):**
- "현재·예정 행사 날짜 역전 0" — 날짜가 없어 검증 자체 불가
- "이벤트 날짜의 opening_hours 저장 0" — 날짜 필드가 없으므로 잘못된 필드명 사용 위험

**필요한 수정:** `collect_events()` 내에 con_uid당 상세 URL fetch 루프 + 날짜·장소·주최 파서 추가 (~100줄 신규)

---

### B3 — cultural-guides: 하드코딩 금지 위반

**근거 코드 (gyeongju_culture_web_collect.py:471-484):**
```python
# Known 17개소 (verified from mnu_uid=2262 page 2026-08-04)
KNOWN_GUIDE_SITES = [
    "대릉원", "불국사", "석굴암", "양동마을", "분황사",
    "첨성대", "동궁과월지", "옥산서원", "김유신묘", "무열왕릉",
    "포석정지", "원성왕릉", "오릉", "감은사지",
    "동리목월문학관", "향교", "경주읍성",
]
...
"guide_sites": KNOWN_GUIDE_SITES,  # ← 하드코딩 값을 그대로 레코드로 저장
```

페이지를 fetch하지만 HTML을 파싱하지 않고 하드코딩 목록을 레코드에 삽입합니다.

**Task 요구 (Section 1 수집기 사전검증):**
> 특정 콘텐츠 ID 하드코딩 금지, 공식 목록에서 링크 자동 추출

사이트가 업데이트돼 17개소가 변경되면 이 값은 틀린 채로 남습니다.
또한 task가 요구하는 "지원 언어, 운영시간, 예약 여부, 비용, 신청·안내 URL, 장소 공식 URL"을 전혀 파싱하지 않습니다.

**필요한 수정:** mnu_uid=2262 페이지에서 장소명·예약 URL 등을 동적으로 파싱하는 로직으로 교체

---

### B4 — monthly-recommendations: 콘텐츠 미파싱

**근거 코드 (gyeongju_culture_web_collect.py:337-348):**
```python
rec = {
    "mnu_uid": MONTHLY_REC_MNU_UID,
    "page_title": title,
    "source_url": url,
    "body_sha256": sha256_bytes(body),    # ← SHA만 기록
    "body_size_bytes": len(body),         # ← 크기만 기록
    "collected_at": now_iso(),
}
```

페이지를 fetch하지만 내용을 파싱하지 않습니다. body 원문도 저장되지 않습니다.

**Task 요구 (Section 2 "이달의 추천여행지"):**
> 연도, 월, 추천 페이지, 추천 장소, 장소 순서, 공식 주제, 상세 URL, 관련 공식 관광지 ID
> "확인 가능한 현재 공식 연·월 전체를 수집한다"

현재 코드는 mnu_uid=4185 단일 URL만 fetch합니다. "연·월 전체" 수집 로직이 없습니다.

**필요한 수정:**
1. 가용 연·월 목록 확인 로직 추가 (페이지 내 year/month selector 파싱)
2. 각 월 페이지에서 추천 장소 목록 동적 추출

---

### B5 — visitgyeongju: 언어 번역 판정 분류 없음

**근거 코드 (visitgyeongju_collect.py:280-298):**
```python
def check_language_availability(hex_id, content_type, timeout, retries, delay):
    results = {}
    for locale in LOCALE_PREFIXES:
        body, status, err = http_get(url, ...)
        page_empty = len(text.split()) < 50  # ← 단순 단어 수 기준
        results[locale] = {
            "http_status": status,
            "accessible": status == 200,
            "page_appears_empty": page_empty,
        }
```

HTTP status와 단어 수 임계값만으로 판정합니다.

**Task 요구 (Section 3 "5개 언어 상세"):**
> 각 페이지 판정: VALID_TRANSLATED_DETAIL / KOREAN_FALLBACK / EMPTY_TEMPLATE / PARTIAL_TRANSLATION / DETAIL_NOT_FOUND / HTTP_ERROR
>
> HTTP 200만으로 번역 존재를 확정하지 않는다.
>
> 검증 필드: 해당 locale의 실제 제목, 빈 본문 여부, 한국어 fallback 여부

`KOREAN_FALLBACK`을 감지하려면 비KO URL에서 가져온 페이지의 텍스트가 한국어인지 확인해야 합니다.
현재 로직으로는 한국어 fallback 페이지를 `VALID_TRANSLATED_DETAIL`로 잘못 분류할 수 있습니다.

**필요한 수정:**
- locale별 페이지에서 언어 판별 로직 (한글 문자 비율 분석, 제목 언어 감지)
- 6단계 분류 함수 구현
- `Accept-Language` 헤더를 locale에 맞게 설정 (→ B8과 연관)

---

### B6 — visitgyeongju: 상호명(name) 추출 불가

**근거 코드 (visitgyeongju_collect.py:182-197):**
```python
def extract_page_title(html_bytes):
    # Try OG title first (most reliable for VG pages)
    m = re.search(r'property="og:title"[^>]+content="([^"]+)"', html)
    if m:
        return m.group(1).strip()  # ← "VISIT GYEONGJU" 고정 반환
```

visitgyeongju의 OG title은 사이트 전체에 "VISIT GYEONGJU"로 고정돼 있어
모든 상세 페이지에서 상호명이 "VISIT GYEONGJU"로 수집됩니다.

이는 TASK-GYEONGJU-WEB-COLLECTOR-FOUNDATION-V1에서 이미 확인된 기지 한계이며,
"전체 수집 단계에서 h1/h2 직접 추출 필요"로 기록됐지만 수정이 이루어지지 않았습니다.

**Task 요구 (Section 3 "KO 상세"):**
> 이름, (언어별 실제 제목 검증)

**필요한 수정:** `extract_page_title()` 로직을 h1/h2 우선 파싱으로 변경. OG title을 fallback으로만 사용.

---

## 4. 개선사항 상세

### I7 — visitgyeongju KNOWN_COUNTS 오류

**근거 (visitgyeongju_collect.py:46-49):**
```python
KNOWN_COUNTS = {
    "restaurants": 96,   # ← 실제 sitemap 수집: 84건
    "souvenirs": 8,
}
```

2026-08-04 sitemap 실제 파싱 결과: 식당 84건.
GPT 프롬프트에도 "기존 파일럿 보고: 식당 87건 이상"으로 기재돼 있으나 실제값은 84건입니다.

96은 discovery 초기 추정값이고, 87은 GPT가 잘못 계산한 중간값입니다. 84가 실제값입니다.
이 값이 잘못되면 reconciliation summary에서 "발견 건수 > 실제 수집 건수" 경고가 불필요하게 발생합니다.

### I8 — Accept-Language 헤더 locale별 미분리

**근거 (visitgyeongju_collect.py:60):**
```python
req = Request(url, headers={"User-Agent": UA, "Accept-Language": "ko,en;q=0.9"})
```

모든 요청에 `Accept-Language: ko,en` 고정. 일본어·중국어 페이지 요청 시
서버가 한국어 콘텐츠를 우선 반환할 수 있어 KOREAN_FALLBACK 감지 정확도 저하.

권장: locale별 Accept-Language 매핑 적용
- ko → `ko,en;q=0.5`
- en → `en,ko;q=0.3`
- ja → `ja,en;q=0.5`
- zh-CN → `zh-CN,zh;q=0.9,en;q=0.3`
- zh-TW → `zh-TW,zh;q=0.9,en;q=0.3`

### I9 — 비KO 주소 추출 불가

**근거 (visitgyeongju_collect.py:226-228):**
```python
addr_m = re.search(r"경주시[^<\n]{5,60}", html)
```

`경주시` 한국어 패턴만 사용. 영어(Gyeongju), 일어(慶州市), 중국어(庆州市) 주소 추출 불가.
언어별 주소 패턴 또는 CSS selector 기반 추출로 교체 필요.

### I10 — visitgyeongju list reconciliation 카테고리 정의 불일치

**Task 요구:**
> LIST_AND_SITEMAP, LIST_ONLY, SITEMAP_ONLY, PILOT_ONLY, DETAIL_EXISTS_NOT_LISTED ...

**실제 상황:**
visitgyeongju 목록 페이지는 SPA/JS 동적 렌더링 → WebFetch/urllib 직접 접근 불가.
TASK-GYEONGJU-WEB-COLLECTOR-FOUNDATION-V1에서 이미 확인된 사실 (sitemap 기반 전략으로 전환).

`LIST_AND_SITEMAP`, `LIST_ONLY` 분류는 현행 수집 방법으로 달성 불가.
reconciliation을 `SITEMAP_AND_DETAIL`, `SITEMAP_ONLY`, `DETAIL_ONLY(PILOT_MATCH)` 등으로 재정의 필요.

---

## 5. GPT 프롬프트 수치 오류

| 항목 | GPT 프롬프트 기재 | 실제 값 | 출처 |
|------|-----------------|--------|------|
| 파일럿 식당 건수 | "87건 이상" | 84건 | sitemap 실제 파싱 (2026-08-04) |
| 파일럿 기념품 건수 | "9건 이상" | 8건 | sitemap 실제 파싱 (2026-08-04) |
| scripts KNOWN_COUNTS | 96 | 84 | sitemap 실제 파싱 (2026-08-04) |

GPT가 기반으로 삼은 "파일럿 보고"는 최종 확정값이 아닌 초기 WebFetch 추정값입니다.
이 수치를 수정하지 않으면 reconciliation summary에서 허위 불일치가 발생합니다.

---

## 6. 필요한 스크립트 수정 요약

### gyeongju_culture_web_collect.py 수정 항목

| # | 함수 | 변경 내용 | 예상 규모 |
|---|------|---------|---------|
| A | `collect_attractions()` | area_uid별 상세 URL fetch + 주소·전화·시간·입장료·휴무·주차 파서 추가 | +120줄 |
| B | `collect_events()` | con_uid별 상세 URL fetch + 시작일·종료일·장소·주최·연락처 파서 추가 | +100줄 |
| C | `collect_cultural_guides()` | KNOWN_GUIDE_SITES 하드코딩 제거 → mnu_uid=2262 HTML 동적 파싱 | 교체 ~40줄 |
| D | `collect_monthly_recommendations()` | 가용 연·월 열거 로직 + 추천 장소 목록 파서 추가 | +80줄 |

### visitgyeongju_collect.py 수정 항목

| # | 함수 | 변경 내용 | 예상 규모 |
|---|------|---------|---------|
| E | `extract_page_title()` | OG title → h1/h2 우선 파싱으로 전환 | ~20줄 교체 |
| F | `parse_visitgyeongju_detail()` | 비KO 주소 패턴 추가 | +10줄 |
| G | `check_language_availability()` / 신규 함수 | 6단계 언어 판정 분류 구현 (한글 비율 분석 등) | +60줄 |
| H | `http_get()` 또는 호출부 | Accept-Language locale별 분리 | +10줄 |
| I | `KNOWN_COUNTS` | 96 → 84 수정 | 1줄 |

**총 예상 변경 규모: 약 440줄 (신규+교체)**
이는 task가 허용하는 "최소 수정" 범위를 초과하므로 **별도 업그레이드 태스크**로 분리를 권장합니다.

---

## 7. 현재 스크립트로 실행 시 검증 위반 항목

| 검증 기준 (Task Section 필수 검증) | 위반 여부 | 원인 |
|-------------------------------|---------|------|
| 경주문화관광 유형별 reconciliation | **위반** | 상세 URL 수 vs 성공 상세 수 불일치 (attractions, events) |
| 현재·예정 행사 날짜 역전 0 | **검증 불가** | 날짜 필드 없음 |
| 이벤트 날짜의 opening_hours 저장 0 | **검증 불가** | 날짜 필드 없음 |
| raw filter의 unknown → false 변환 0 | 잠재 위험 | 태그 파싱 부재로 raw filter 자체 미수집 |
| 언어별 요청 수와 판정 합계 일치 | **위반** | 6단계 분류가 없어 합계 검증 불가 |
| 비지트경주 list/sitemap/pilot reconciliation | **부분 위반** | LIST 카테고리 달성 불가 |

---

## 8. 권고 작업 순서

### 권고 1 (즉시): TASK-GYEONGJU-WEB-COLLECTOR-UPGRADE-V1

수집기 2개를 업그레이드한다.

수정 대상:
1. `gyeongju_culture_web_collect.py`: A, B, C, D 항목
2. `visitgyeongju_collect.py`: E, F, G, H, I 항목

완료 기준:
- 표본 재검증: attractions 1건 상세 fetch + 주소·전화·시간 필드 확인
- 표본 재검증: events 1건 상세 fetch + 시작일·종료일 필드 확인
- 표본 재검증: visitgyeongju 1건 EN fetch + 상호명 + VALID_TRANSLATED_DETAIL 판정
- cultural-guides 동적 파싱 17개소 확인

### 권고 2 (업그레이드 완료 후): TASK-GYEONGJU-WEB-RAW-COLLECTION-V2

GPT 프롬프트 수치 수정 후 재발행:
- "기존 파일럿 보고: 식당 87건 이상" → "식당 84건 (sitemap 2026-08-04)"
- "기념품 9건 이상" → "기념품 8건 (sitemap 2026-08-04)"
- reconciliation 카테고리 재정의 (LIST 계열 제거 → SITEMAP/DETAIL 기반)

---

## 9. 기존 데이터 무변경 확인

이번 검증 작업에서:

| 항목 | 상태 |
|------|------|
| 기존 831건 candidate 수정 | **0건** ✓ |
| KTO 행사 24건 수정 | **0건** ✓ |
| 스크립트 실행 | **미실행** ✓ |
| 신규 branch 생성 | **미생성** (검증 보고서만 현재 branch에 추가) |
| 허용 경로 밖 변경 | **0건** ✓ |

---

## 최종 판정

```
EXECUTION_HOLD — SCRIPT_UPGRADE_REQUIRED

블로커 6개:
✗ B1: attractions 상세 페이지 미수집 → 주소·전화·운영시간·입장료·휴무·주차 없음
✗ B2: events 상세 페이지 미수집 → 시작일·종료일·장소·주최 없음, 날짜 검증 불가
✗ B3: cultural-guides 하드코딩 금지 위반 (KNOWN_GUIDE_SITES 정적 목록)
✗ B4: monthly-recommendations 콘텐츠 미파싱 (SHA/크기만 기록, 추천 장소 없음)
✗ B5: visitgyeongju 언어 판정 6단계 분류 없음 (HTTP_200 = 번역 확정으로 처리됨)
✗ B6: visitgyeongju 상호명 추출 불가 (OG title = "VISIT GYEONGJU" 고정)

현행 스크립트로 실행하면 필수 검증 기준(날짜 역전·언어 판정 합계 일치·reconciliation)
중 다수가 위반되거나 검증 자체 불가 상태가 됩니다.

권고: TASK-GYEONGJU-WEB-COLLECTOR-UPGRADE-V1 선행 실행 후
TASK-GYEONGJU-WEB-RAW-COLLECTION-V2로 재발행
```
