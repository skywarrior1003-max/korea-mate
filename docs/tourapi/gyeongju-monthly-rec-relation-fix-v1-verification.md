# TASK-GYEONGJU-MONTHLY-RECOMMENDATION-RELATION-FIX-V1 검증보고서

**검증일**: 2026-08-05  
**기반 브랜치**: `data/gyeongju-normalization-identity-v1` HEAD `47de380`  
**검증 결정**: ⛔ **미실행** — 실행 차단 문제 2건 + 더 나은 개선방향 1건 발견  
**권고**: 아래 대안 태스크(`*-ALT-V1`)로 재설계 후 실행

---

## 1. 전제 조건 확인

| 항목 | 결과 |
|---|---|
| base HEAD `47de380` | ✅ 확인 |
| baseline 831건 파일 존재 | ✅ 확인 |
| source facts 1,158건 파일 존재 | ✅ 확인 |
| web-raw-v3 monthly-rec JSONL 7건 | ✅ 확인 |
| normalization Run1=Run2 22/22 BYTE_IDENTICAL | ✅ 확인 |
| 하네스 PASS | ✅ 확인 |

**전제 조건 전원 충족.**

---

## 2. 태스크 설계 검토

### 2.1 올바른 방향

| 항목 | 평가 |
|---|---|
| UI 레이블("BEST", "주차 정보")을 관계 데이터에서 제외 | ✅ 필요·정확 |
| area_uid 링크를 실제 장소 연결 기준으로 사용 | ✅ 정확 |
| V4 snapshot을 V3 raw와 분리 저장 | ✅ 올바른 원칙 |
| collection 7건 구조 보존 | ✅ 필요 |
| candidate 914건 무변경 | ✅ 필요 |
| source facts 1,158건 무변경 | ✅ 필요 |
| SOURCE_PAGE_NO_OFFICIAL_PLACE_LINKS 상태 허용 | ✅ 현실적 |

### 2.2 핵심 전제: "파서 수정으로 area_uid 추출 개선 가능"

태스크는 V3 `place_links=[]`를 **파서 결함**으로 가정하고 있다.  
이를 검증하기 위해 실제 페이지 HTML을 직접 프로브했다.

---

## 3. 실제 HTML 프로브 결과 (검증 근거)

4개 대표 페이지를 직접 요청하여 분석했다.

| mnu_uid | 분류 | HTML 크기 | area_uid 링크 수 | 비고 |
|---|---|---|---|---|
| 4134 | 2020-12 (과거 고정) | 66,654 B | **8건** | 구형 포맷 |
| 4306 | V3: 2026-06 → **현재: 2026-07** | 87,966 B | **0건** | 내용이 7월로 교체됨 |
| 4185 | V3: 2026-05 → **현재: 2026-08** | 90,042 B | **0건** | 내용이 8월로 교체됨 |
| 3801 | 2023-12 | 84,454 B | **0건** | 신형 포맷 |

### 발견 사항 1: 라이브 페이지 교체 확인

```
mnu_uid=4306
  V3 수집 시각:       2026-08-05T04:43:xx (이른 아침)
  V3 수집 결과:       year=2026, month=6, theme="경주 여행"
  현재 페이지 제목:   "7월 경주, 여름을 채우다"
  현재 year-month:    ('2026', '6'), ('2026', '5'), ('2026', '7')

mnu_uid=4185
  V3 수집 결과:       year=2026, month=5
  현재 페이지 제목:   "8월 경주, 푸름에 머물다"
```

경주문화관광 이달의 추천여행지 페이지는 **매월 콘텐츠를 교체하는 라이브 페이지**다.  
같은 mnu_uid가 다음 달 content로 덮어씌워진다.  
V3 수집(2026-08-05 새벽)과 현재(2026-08-05 오후) 사이에 이미 일부 페이지가 교체됐을 가능성이 있으며, 이후 수집에서는 완전히 다른 월의 콘텐츠가 반환된다.

### 발견 사항 2: 신형 페이지 포맷 — area_uid 링크 구조적 부재

```
mnu_uid=4306 (2026 신형): area_uid 링크 = 0건
mnu_uid=4185 (2026 신형): area_uid 링크 = 0건
mnu_uid=3801 (2023 신형): area_uid 링크 = 0건
mnu_uid=4134 (2020 구형): area_uid 링크 = 8건
```

신형 추천여행지 페이지(2023~2026)는 관광지 카드를 **인라인 HTML로 직접 삽입**하며 `area_uid` 파라미터를 포함한 상세 링크를 제공하지 않는다. 이는 파서 결함이 아니라 **페이지 생성 방식의 구조적 차이**다.

V3 파서는 이미 올바르게 동작했다 — area_uid 링크가 없으니 0건을 반환한 것이다.

---

## 4. 실행 차단 이유

### 🚫 BLOCKER-1: 라이브 페이지 재수집 시 시간적 오염

태스크가 V4 재수집을 요구하지만, 현재 페이지는 이미 다른 월의 콘텐츠를 보여주고 있다.

| 결과 | 문제 |
|---|---|
| V4 mnu_uid=4306 재수집 | 2026-07 content 취득 (V3: 2026-06) |
| V4 mnu_uid=4185 재수집 | 2026-08 content 취득 (V3: 2026-05) |
| 정규화 실행 | V3(5·6월) + V4(7·8월) 데이터 혼합 |
| byte-identical 요건 | V4 snapshot이 시간에 따라 달라져 보장 불가능 |

**V4 재수집을 실행하면 태스크 자체가 요구하는 "same as_of, byte-identical" 요건과 모순된다.**

### 🚫 BLOCKER-2: 파서 수정으로 해결 불가한 구조적 부재

V3 `PLACE_LINKS_NOT_FOUND`는 파서 버그가 아니다.  
신형 페이지(2023~2026) 6건에는 area_uid 링크가 **HTML에 존재하지 않는다**.  
파서를 아무리 개선해도 없는 링크를 만들어낼 수 없다.

따라서:
- `gyeongju_culture_web_collect.py` v2.3.0 업그레이드를 통한 파서 개선 → **효과 없음**
- V4 재수집 + 개선된 파서 적용 → **0건으로 동일 (+ 시간적 오염 발생)**

---

## 5. 더 나은 개선 방향 (대안 설계)

**정규화 스크립트(`gyeongju_normalize_full_v1.py`) 단독 수정으로 태스크 목표를 모두 달성 가능하며, 라이브 페이지 위험 없음.**

### 5.1 수정 범위

| 대상 | 현재 상태 | 대안 수정 |
|---|---|---|
| `gyeongju_normalize_full_v1.py` | `places`(UI 레이블)를 place_relations로 출력 | V3 `place_links`만 사용, UI 레이블 거부 감사 생성 |
| `gyeongju_culture_web_collect.py` | 수정 불필요 | 수정 불필요 |
| V4 재수집 | 필요 | **불필요** |

### 5.2 mnu_uid=4134 (2020-12) 처리

V3 raw에 이미 8개 `place_links` (area_uid 기반)가 정확하게 추출되어 있다.  
정규화 스크립트에서 이 데이터를 그대로 사용하여 정상적인 place relation을 생성한다.

```json
// V3 data/tourapi/gyeongju/web-raw-v3/monthly-recommendations/monthly-recommendations-raw.jsonl
// mnu_uid=4134 record:
{
  "mnu_uid": 4134,
  "year": 2020, "month": 12,
  "place_links": [
    {"area_uid": 43571, "url": "https://www.gyeongju.go.kr/...&area_uid=43571&cmd=2"},
    {"area_uid": 43568, "url": "..."},
    {"area_uid": 43567, "url": "..."},
    {"area_uid": 43565, "url": "..."},
    {"area_uid": 365,   "url": "..."},
    {"area_uid": 359,   "url": "..."},
    {"area_uid": 358,   "url": "..."},
    {"area_uid": 357,   "url": "..."}
  ]
}
```

### 5.3 나머지 6건 처리

V3 `place_links=[]` (0건) → `SOURCE_PAGE_NO_OFFICIAL_PLACE_LINKS`로 상태 기록.  
이유: 신형 페이지 포맷은 area_uid 링크 미제공.  
근거: V3 수집 시점 HTML에도 존재하지 않았음을 V3 raw 데이터로 입증.

### 5.4 UI 레이블 거부 감사

V3 `places` 필드값("BEST", "주차 정보" 등)을 거부 감사로 기록:
```json
{
  "collection_id": "gyeongju-MR-4185",
  "rejected_values": ["BEST", "주차 정보", "관람시간", ...],
  "rejection_reason": "UI_TAB_LABELS",
  "impact": "place_relations에 불포함"
}
```

### 5.5 대안 태스크 정의

```
TASK-GYEONGJU-MONTHLY-REC-RELATION-FIX-ALT-V1

목표:
  - gyeongju_normalize_full_v1.py 수정 (재수집 없음)
  - V3 place_links 활용 (mnu_uid=4134: 8건)
  - 나머지 6건: SOURCE_PAGE_NO_OFFICIAL_PLACE_LINKS
  - UI 레이블 거부 감사 생성
  - 관련 산출물 재생성 (recommendation collection, relation, audit)
  - 추천여행지 외 모든 normalized 파일 byte-identical 유지

실행 금지:
  - gyeongju_culture_web_collect.py 수정
  - 라이브 페이지 재수집
  - 신규 HTTP 요청 (검증 제외)
```

---

## 6. 태스크 산출물 항목별 달성 가능성

| 산출물 | 현재 태스크(V4 재수집) | 대안(정규화 수정) |
|---|---|---|
| 수정된 collector | 작성 가능하나 효과 없음 | **불필요** |
| V4 raw snapshot | 시간적 오염 위험 | **불필요** |
| recommendation collection 7건 | 가능 | 가능 |
| recommendation-place relation | mnu_uid=4134: 8건<br>나머지: 0건 | **동일 결과, 안전하게** |
| UI label rejection audit | 가능 | 가능 |
| identity-link audit | 가능 | 가능 |
| byte-identical (Run1=Run2) | **V4 snapshot이 실행 시점에 달라져 불안정** | **안정적으로 보장** |
| +83 delta reconciliation | 가능 | 가능 |
| 하네스 PASS | 가능 | 가능 |

---

## 7. +83 candidate delta reconciliation 사전 분석

태스크 Section 9에서 84 예상 vs 83 실제 신규 candidate에 대한 reconciliation을 요구한다.  
이는 재수집 없이 현재 데이터로 분석 가능하다:

- 관광지 NEW_OFFICIAL_PLACE: 10
- 식당 NEW_OFFICIAL_PLACE: 66
- 기념품 새 candidate: 7 (PHYSICAL_PLACE 8 중 1건은 기존 candidate 연결)
- 합계: 83

차이 원인: `gyeongju_normalize_full_v1.py`의 `classify_souvenir()` 함수에서  
`SOUVENIR_PHYSICAL_INDICATORS` 딕셔너리에 정의된 이름이 기존 831 candidates의  
`cand_by_norm_name` 인덱스에서 1건 발견 → `baseline_candidate_id` 설정 → `new_souv_count` 제외.

해당 기념품: `SOUVENIR_PHYSICAL_INDICATORS` 중 이름이 기존 candidate와 일치하는 1건.  
`classify_souvenir()`의 `if sc["baseline_candidate_id"] is None:` 조건에 의해 신규 candidate 생성에서 제외됨.

**결론: +83은 정상 산술이며 소프트웨어 버그 없음.**  
`CANDIDATE_DELTA_RECONCILIATION_REVIEW` 불필요.

---

## 8. 검증 결론

| 항목 | 결과 |
|---|---|
| 전제 조건 충족 | ✅ |
| 태스크 목표 유효성 | ✅ (UI 레이블 제거는 필요) |
| BLOCKER-1: 라이브 페이지 재수집 시간적 오염 | ❌ **실행 차단** |
| BLOCKER-2: 신형 페이지 area_uid 구조적 부재 | ❌ **파서 수정 효과 없음** |
| 더 나은 개선 방향 존재 | ✅ 정규화 스크립트 단독 수정 |
| **실행 판정** | **미실행 — 검증보고서만 작성** |

---

## 9. 권고 사항

### 즉시 실행 가능

**`TASK-GYEONGJU-MONTHLY-REC-RELATION-FIX-ALT-V1`** 로 재설계:
1. `gyeongju_normalize_full_v1.py` 수정 — place_links 기반 relation 생성
2. V3 data 재사용 (HTTP 요청 없음)
3. mnu_uid=4134: 8건 HIGH_CONFIDENCE place relation 생성
4. 나머지 6건: `SOURCE_PAGE_NO_OFFICIAL_PLACE_LINKS` + rejection audit
5. 모든 산출물 byte-identical 보장

### 장기 개선

1. **monthly-rec raw snapshot 보존**: V3부터 HTML bytes를 `body_path` 파일로 저장하여 나중에 재파싱 가능하게 함
2. **이달의 추천여행지 아카이브 전략**: 라이브 페이지가 매월 교체되므로 수집 후 즉시 스냅샷 저장 필요
3. **신형 포맷 place 추출**: 신형 추천 페이지에서 place를 추출하려면 `<script>` 태그 내 JSON-LD 또는 카드 title 속성 분석이 필요할 수 있음 — 별도 탐색 태스크로 분리 권고

---

*본 검증보고서는 실행 차단 사유 및 대안 개선방향을 포함합니다.*  
*대안 태스크 재설계 후 실행 요청 시 즉시 실행 가능합니다.*
