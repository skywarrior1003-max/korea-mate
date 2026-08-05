# TASK-GYEONGJU-WEB-COLLECTOR-NAV-FIX-V1 완료보고서

**완료일**: 2026-08-05  
**기반 브랜치**: `data/gyeongju-web-raw-collection-v2` HEAD `09488d5`  
**작업 브랜치**: `data/gyeongju-web-collector-nav-fix-v1`  
**결과**: **PASS** — READY_FOR_GYEONGJU_WEB_RAW_COLLECTION_V3

---

## 1. 검증 결과 (실행 전)

태스크 명세 검증: 이상 없음. B-MR1(`NOT_MONTHLY_REC` 상태 추가), B-MR2(`extra_limit` 수정), B-NEM(`name_extract_method` 필드 추가) 모두 기술적으로 정확하다. 내가 이전에 제안한 `year >= 2023` 연도 하한 방어를 명시 금지한 것도 올바른 판단이다 — 근본 원인 해결이 아닌 증상 숨기기임.

---

## 2. 수정 내용

### B-MR1 — `parse_monthly_rec_content()` NOT_MONTHLY_REC 판정

**파일**: `scripts/gyeongju_culture_web_collect.py` (v2.0.0 → v2.1.0)

**수정 1**: `r"20\d{2}"` 전체 fallback 제거

```python
# BEFORE (v2.0.0):
year_m = re.search(r"20\d{2}", html)
if year_m and not rec["year"]:
    rec["year"] = int(year_m.group(0))  # ©2019 포착 → year=2019

# AFTER (v2.1.0):
# NOTE: NO r"20\d{2}" fallback — would match footer/copyright years
```

**수정 2**: month=None 페이지에 `NOT_MONTHLY_REC` 상태 설정

```python
if rec["month"] is None:
    rec["parse_status"] = "NOT_MONTHLY_REC"
    rec["rejection_reason"] = "month_not_found_in_recommendation_content"
```

**수정 3**: `rejected_recs` 별도 관리 및 rejection audit JSONL 자동 저장

### B-MR2 — `collect_monthly_recommendations()` extra_limit 수정

**수정 전**: `extra_limit = 1 if args.max_items and args.max_items <= 2 else min(2, len(nav))`  
→ `--max-items 12` 지정 시 `min(2, 12) = 2`, 최대 3페이지만 수집

**수정 후**:
```python
remaining = (
    args.max_items - len(valid_recs)
    if args.max_items is not None
    else len(nav)
)
extra_limit = max(0, min(len(nav), remaining))
```
→ `--max-items 12`면 `remaining = 12 - len(valid_recs)`, 유효 월 12개까지 수집 가능

**추가**: NOT_MONTHLY_REC 페이지는 `valid_recs` 카운트에서 제외되므로 유효 월 수 제한이 정확하게 적용된다.

### B-NEM — name_extract_method 필드 추가

**`gyeongju_culture_web_collect.py`:**

- `extract_name_from_detail()`: `str | None` → `dict` 반환
  ```python
  {"name": "경주 동궁원", "name_extract_method": "DETAIL_ENTITY_HEADING",
   "name_source_selector": "dt[skip_list]", "name_parse_status": "PARSED"}
  ```
- `parse_attraction_detail()`: 4개 필드 result에 복사
- `parse_event_detail()`: 4개 필드 result에 복사
- `collect_attractions()`: rec 초기화 + detail 병합에 3개 필드 추가
- `collect_events()`: rec 초기화 + detail 병합에 3개 필드 추가

**`visitgyeongju_collect.py`:**

- `extract_entity_name()`: `str` → `tuple(name, method, selector)` 반환
  - h2 detail class → `DETAIL_ENTITY_HEADING`, `"h2.detail"`
  - h2 any → `CONTENT_HEADING`, `"h2"`
  - h1 detail class → `DETAIL_ENTITY_HEADING`, `"h1.detail"`
  - h1 any → `CONTENT_HEADING`, `"h1"`
  - JSON-LD → `STRUCTURED_DATA_NAME`, `"json-ld"`
  - title → `DOCUMENT_TITLE_FALLBACK`, `"title"`
  - OG → `OG_TITLE_FALLBACK`, `"og:title"`
  - 실패 → `NAME_PARSE_FAILED`, `None`
- `classify_translation()`: 내부 호출 `entity_name, _m, _s = extract_entity_name(...)`
- `collect_entity_all_locales()`: locale_rec에 3개 필드 추가, top-level rec에 ko 로케일 값 전달

---

## 3. 회귀 검증 결과

### B-MR1: NOT_MONTHLY_REC 판정

| 항목 | 결과 |
|---|---|
| mnu_uid=4085 유효 데이터셋 혼입 건수 | 0 ✅ |
| mnu_uid=4085 parse_status | `NOT_MONTHLY_REC` ✅ |
| mnu_uid=4085 rejection_reason | `month_not_found_in_recommendation_content` ✅ |
| 유효 레코드 중 month=None 건수 | 0 ✅ |
| 연도 저작권 오인식 건수 | 0 ✅ |

거부된 페이지 6건:

| mnu_uid | 판정 | 사유 |
|---|---|---|
| 4085 | NOT_MONTHLY_REC | month_not_found (여행필수정보) |
| 4079 | NOT_MONTHLY_REC | month_not_found |
| 4154 | NOT_MONTHLY_REC | month_not_found |
| 4133 | NOT_MONTHLY_REC | month_not_found |
| 4084 | NOT_MONTHLY_REC | month_not_found |
| 4030 | NOT_MONTHLY_REC | month_not_found |

### B-MR2: extra_limit 순회

| 항목 | 결과 |
|---|---|
| 수식 `extra_limit = max(0, min(len(nav), remaining))` | 코드 확인 ✅ |
| `--max-items 12` 실행 시 nav 전체 순회 | 12개 URL 요청 ✅ |
| 유효 월 수집 결과 | 6개월 (nav 중 6개만 유효 추천여행지) |
| primary/navigation 중복 URL | 0 ✅ |

수집된 유효 월별 추천여행지:

| mnu_uid | year | month | places |
|---|---|---|---|
| 4185 (primary) | 2026 | 5 | 12 |
| 4172 | 2026 | 5 | 12 |
| 4075 | 2025 | 11 | 12 |
| 3801 | 2023 | 12 | 15 |
| 4134 | 2020 | 12 | 1 |
| 4367 | 2026 | 5 | 12 |

### B-NEM: name_extract_method 회귀 (17건)

| 콘텐츠 유형 | 건수 | method | 방법 분포 |
|---|---|---|---|
| 관광지 (gyeongju.go.kr) | 5건 | DETAIL_ENTITY_HEADING | `dt[skip_list]` |
| 행사 (gyeongju.go.kr) | 4건 | DETAIL_ENTITY_HEADING | `dt[skip_list]` |
| 식당 (visitgyeongju.or.kr) | 5건 | CONTENT_HEADING | `h2` |
| 기념품 (visitgyeongju.or.kr) | 3건 | CONTENT_HEADING | `h2` |

| 항목 | 결과 |
|---|---|
| name_extract_method 누락 | 0 / 17 ✅ |
| name_parse_status 누락 | 0 / 17 ✅ |
| VISIT GYEONGJU 오수집 | 0 ✅ |
| 고정 문자열 주입 | 없음 — 소스별 상이한 method 확인 ✅ |
| NAME_PARSE_FAILED 발생 | 0 (전원 이름 추출 성공) ✅ |

### 기존 B1–B6 회귀

| 항목 | 결과 |
|---|---|
| B1 관광지 상세 fetch 5/5 | ✅ PASS |
| B2 행사 날짜·장소 파싱 | ✅ PASS (4건 중 2건 날짜 확인) |
| B3 문화관광해설 동적 추출 17/17 | ✅ PASS |
| B5 visitgyeongju 6단계 언어 판정 | ✅ PASS |
| B6 엔티티명 VISIT_GYEONGJU 오추출 0 | ✅ PASS |
| SKIP_PATTERNS에 "경주" 재도입 없음 | ✅ PASS |
| `<li><span>` 주소 파싱 | ✅ PASS (addr=True 5/5) |

---

## 4. 전체 수집 미실행 확인

| 항목 | 결과 |
|---|---|
| 전체 웹 raw 대량 수집 | 미실행 ✅ |
| 기존 canonical 831건 수정 | 미수정 ✅ |
| 기존 KTO 행사 24건 수정 | 미수정 ✅ |
| 웹 이미지 다운로드 | 없음 ✅ |
| DB/migration/배포 | 없음 ✅ |

---

## 5. 산출물

| 파일 | 설명 |
|---|---|
| `scripts/gyeongju_culture_web_collect.py` (v2.1.0) | B-MR1·B-MR2·B-NEM 수정 |
| `scripts/visitgyeongju_collect.py` (v2.1.0) | B-NEM 수정 |
| `data/tourapi/validation/gyeongju/gyeongju-monthly-rec-nav-regression-v1.json` | nav 회귀 결과 |
| `data/tourapi/validation/gyeongju/gyeongju-monthly-rec-rejection-audit-v1.jsonl` | 거부 감사 6건 |
| `data/tourapi/validation/gyeongju/gyeongju-name-extract-method-regression-v1.jsonl` | name_extract_method 회귀 17건 |
| `data/tourapi/validation/gyeongju/gyeongju-web-collector-nav-fix-summary-v1.json` | 수정 요약 |
| `data/tourapi/manifests/gyeongju/gyeongju-manifest-v1.json` | 갱신 |
| `docs/tourapi/gyeongju-web-collector-nav-fix-v1.md` | 이 보고서 |

---

## 6. 하네스 결과

🎉 전체 하네스 PASS

---

## 7. 다음 단계

```
TASK-GYEONGJU-WEB-RAW-COLLECTION-V3
  기반 브랜치: data/gyeongju-web-collector-nav-fix-v1
  스크립트 버전: v2.1.0
  전제: B-MR1·B-MR2·B-NEM 모두 해결 (이번 태스크 완료)
  실행: 전체 수집 (관광지·행사·문화해설·추천여행지·코스·유산 + 식당84·기념품8 × 5언어)
```

작업을 완료했습니다
