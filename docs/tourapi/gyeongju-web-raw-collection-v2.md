# TASK-GYEONGJU-WEB-RAW-COLLECTION-V2 검증보고서

**작성일**: 2026-08-05  
**검증자**: Claude (KoreaMate 데이터 파이프라인)  
**기반 브랜치**: `data/gyeongju-web-collector-upgrade-v1` HEAD `67af412`  
**결과**: **EXECUTION_HOLD** — 블로커 3건 발견

---

## 1. 전제 조건 검증

| 항목 | 기댓값 | 실제값 | 결과 |
|---|---|---|---|
| 기반 브랜치 HEAD | `67af412` | `67af412` | ✅ PASS |
| `gyeongju_culture_web_collect.py` 버전 | v2.0.0 | v2.0.0 | ✅ PASS |
| `visitgyeongju_collect.py` 버전 | v2.0.0 | v2.0.0 | ✅ PASS |
| 블로커 B1–B6 해소 | 완료 | 완료 | ✅ PASS |
| `--as-of` 인자 지원 | 지원 | 지원 | ✅ PASS |
| `--resume` 인자 지원 | 지원 | 지원 | ✅ PASS |

---

## 2. 기존 산출물 교차 확인 (재수집 불필요)

이전 태스크 `TASK-GYEONGJU-VISITGYEONGJU-SOURCE-CONTRACT-AND-PILOT-V1`에서 다음 파일이 이미 생성·검증됐다.

| 파일 | 내용 | 활용 방안 |
|---|---|---|
| `validation/gyeongju/visitgyeongju/visitgyeongju-filter-audit-v1.json` | 6개 필터 그룹, 59개 옵션, 2026-08-04 검증 | Section 3 raw filter inventory — 재수집 불필요, 참조 인용 |
| `validation/gyeongju/visitgyeongju/visitgyeongju-candidate-link-audit-v1.jsonl` | 파일럿 hex ID 대조 완료 (HIGH_CONFIDENCE / MANUAL_REVIEW / NO_MATCH) | ID reconciliation — 기존 파일 활용 가능 |
| `validation/gyeongju/visitgyeongju-pagination-language-audit-v1.jsonl` | 8건 파일럿 언어 감사 | 소품종 기념품 cross-check |

---

## 3. 발견된 블로커

### B-MR1 — `parse_monthly_rec_content()`: 비추천여행지 페이지 오분류

**파일**: `scripts/gyeongju_culture_web_collect.py` 라인 598–634

**현상**  
검증 실행(v2.0.0 표본 수집)에서 mnu_uid=4085가 nav 링크로 발견되어 수집됐다:

```
mnu_uid=4085  year=2019  month=None  theme="여행필수정보"  parse_status="PARSED"
```

mnu_uid=4085는 "이달의 추천여행지" 페이지가 아니라 **"여행필수정보"** 섹션 페이지다.

**근본 원인 (2가지)**

원인 A — `parse_status` 기본값 `"PARSED"` 무조건 유지:
```python
# 라인 614
rec = { ..., "parse_status": "PARSED", ... }
# DECODE_FAILED만 예외 — month=None인 경우 상태 변경 없음
```

원인 B — year 추출 fallback이 저작권 연도를 포착:
```python
# 라인 632–634
year_m = re.search(r"20\d{2}", html)
if year_m and not rec["year"]:
    rec["year"] = int(year_m.group(0))  # ©2019 → year=2019
```
"여행필수정보" 페이지 HTML에 저작권 표기 "© 2019 경주시"가 있어 year=2019가 추출된다.

**영향**  
전체 수집(최대 12개 nav 페이지)을 실행하면 mnu_uid=4085가 monthly-rec 데이터셋에 혼입된다. `parse_status="PARSED"`, `year=2019`, `month=None` 레코드가 정상 추천여행지 데이터와 함께 저장된다.

**수정안**
```python
# parse_monthly_rec_content() 말미에 추가
if rec["month"] is None:
    rec["parse_status"] = "NOT_MONTHLY_REC"

# year fallback 강화 (라인 632–634 교체)
year_m = re.search(r"20\d{2}", html)
if year_m and not rec["year"]:
    candidate_year = int(year_m.group(0))
    if candidate_year >= 2023:          # 저작권 연도 필터
        rec["year"] = candidate_year
```

---

### B-MR2 — `collect_monthly_recommendations()`: `extra_limit` 상한 2로 고정

**파일**: `scripts/gyeongju_culture_web_collect.py` 라인 846

**현상**  
```python
extra_limit = 1 if args.max_items and args.max_items <= 2 else min(2, len(nav))
```

이 식은 `--max-items 12` 또는 max-items 미지정(None) 모두에서 동일하게 동작한다:

| `args.max_items` | 조건 평가 | `extra_limit` | 실제 수집 페이지 수 |
|---|---|---|---|
| `1` | True (1 ≤ 2) | 1 | 1 (primary 1 + nav 0) |
| `2` | True (2 ≤ 2) | 1 | 2 (primary 1 + nav 1) |
| `12` | False (12 > 2) | min(2, 12) = **2** | **3** (primary 1 + nav 2) |
| `None` | False (None 부적용) | min(2, 12) = **2** | **3** |

**영향**  
`--max-items 12`를 지정해도 최대 3개월(1 primary + 2 nav)만 수집된다. 전체 12개월 수집이 불가능하다.

**수정안**
```python
# 현재
extra_limit = 1 if args.max_items and args.max_items <= 2 else min(2, len(nav))

# 수정안
remaining = (args.max_items - len(records)) if args.max_items else len(nav)
extra_limit = min(len(nav), max(0, remaining))
```

이렇게 하면:
- `--max-items 12`: remaining = 12 - 1 = 11 → extra_limit = min(12, 11) = 11 → 최대 12페이지
- `--max-items None`: remaining = len(nav) → extra_limit = len(nav) → 모든 nav 페이지

---

### B-NEM — `name_extract_method` 필드 미출력

**파일**: `scripts/gyeongju_culture_web_collect.py`, `scripts/visitgyeongju_collect.py`

**현상**  
```
$ grep -r "name_extract_method" scripts/
(no matches)
```

**태스크 요건 (원문 발췌)**  
> "장소명 추출 위치가 네 번째 `<dt>`라는 위치값에만 의존하지 않는다 — 추출 방법을 레코드마다 기록한다"

현재 `extract_name_from_detail()` 함수는 이름만 반환하며 추출 방법을 기록하지 않는다.

**영향**  
모든 관광지·행사 레코드에서 `name_extract_method` 필드가 누락된다. 태스크에서 요구한 필수 필드 미충족.

**수정안**
```python
# extract_name_from_detail() 수정: 이름과 방법을 함께 반환
def extract_name_from_detail(html: str) -> tuple[str | None, str | None]:
    """Returns (name, method) tuple.
    method values: 'dt_skip_list' | 'fallback_h1' | 'fallback_title' | None
    """
    for m in re.finditer(r"<dt[^>]*>(.*?)</dt>", html, re.DOTALL):
        ...
        return name, "dt_skip_list"
    # fallback h1...
    return None, None

# 호출 측에서 필드 추가
name_ko, name_method = extract_name_from_detail(html)
rec["name_ko"] = name_ko
rec["name_extract_method"] = name_method   # "dt_skip_list" | None
```

visitgyeongju 수집기에도 동일한 필드 추가 필요.

---

## 4. 비블로커 개선 권고

| ID | 대상 | 권고 내용 | 우선순위 |
|---|---|---|---|
| I-MR3 | `parse_monthly_rec_content()` | "X월 경주" 단독 month 추출 시 year 추정 허용 여부 명시 — 현재 year 없이 month만 추출되면 year=None 유지 (올바름) | 낮음 |
| I-FILTER | `visitgyeongju_collect.py` | 수집 메타데이터에 `filter_schema_ref: "data/tourapi/validation/gyeongju/visitgyeongju/visitgyeongju-filter-audit-v1.json"` 추가 | 낮음 |
| I-PILOT | `visitgyeongju_collect.py` | 수집 레코드에 기존 `visitgyeongju-candidate-link-audit-v1.jsonl`의 `candidate_id`를 cross-reference 필드로 추가 | 중간 |
| I-NAV | `discover_monthly_rec_nav()` | 범위 3800–5500 대신 실제 이달의추천여행지 mnu_uid 패턴(4100–4300 등)으로 좁히는 것을 검토 — B-MR1 수정이 1차 방어선 | 낮음 |

---

## 5. 권고 후속 작업

```
TASK-GYEONGJU-WEB-COLLECTOR-NAV-FIX-V1
  블로커 해소:
    B-MR1: parse_monthly_rec_content() — NOT_MONTHLY_REC 상태 추가 + year fallback 강화
    B-MR2: collect_monthly_recommendations() — extra_limit 계산식 수정
    B-NEM: extract_name_from_detail() — name_extract_method 반환 + 출력 필드 추가
  기반: data/gyeongju-web-raw-collection-v2 (이 브랜치)
  완료 조건: 표본 재실행 → month=None 레코드 0건, max-items=12 → 12개월 수집, name_extract_method 필드 존재

TASK-GYEONGJU-WEB-RAW-COLLECTION-V3
  전제: TASK-GYEONGJU-WEB-COLLECTOR-NAV-FIX-V1 완료
  실행: 전체 수집 (관광지·행사·문화해설·추천여행지12개월·코스·유산 + 식당85·기념품8 × 5언어)
```

---

## 6. 요약

| 항목 | 결과 |
|---|---|
| 전제 조건 (브랜치·버전·인자) | ✅ 모두 충족 |
| 기존 filter-audit 재활용 가능 | ✅ 확인 |
| 기존 candidate-link-audit 재활용 가능 | ✅ 확인 |
| B-MR1 — 비추천여행지 오분류 | ❌ 블로커 |
| B-MR2 — extra_limit 2 고정 | ❌ 블로커 |
| B-NEM — name_extract_method 누락 | ❌ 블로커 |
| **실행 권고** | **HOLD — 스크립트 수정 후 V3으로 재실행** |
