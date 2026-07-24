# TASK-DATA-BUSAN-VISITBUSAN-COLLECT — 완료 보고서

**날짜:** 2026-07-24  
**태스크:** TASK-DATA-BUSAN-VISITBUSAN-COLLECT  
**상태:** PASS (연간 수집 완료 + FestivalService 연결 후보 생성)

---

## 1. GPT 프롬프트 검증 요약

이번 태스크의 GPT 프롬프트는 파이럿(TASK-DATA-BUSAN-VISITBUSAN-PILOT)에서 확인된 구조를 정확히 반영하여 작성되었다. 아래는 설계 방향과 실제 실행 결과의 대조표이다.

| 항목 | GPT 설계 | 실제 결과 | 판정 |
|---|---|---|---|
| 페이지네이션 | GET + `startPage` (pilot 확인 값) | ✓ GET + `startPage` 동작 | PASS |
| 월 필터 URL | `schedule/list.do?month=N&year=2026` | ✓ 동작. `kr/index.do?schMonth=` 사용 시 현재 월만 반환 (초기화 용도로만 사용) | PASS |
| dataSid dedup | `Map<dataSid>` 기반 중복 제거 | ✓ 68개 고유 dataSid | PASS |
| listed_months | Set → `01|02|03` 파이프 직렬화 | ✓ 14건 멀티월 이벤트 추적 | PASS |
| parse_failed = 0 | `schedule/view.do` 링크만 수집, HTML 코멘트 제거 | ✓ 0/68 실패 | **PASS** |
| FestivalService 연결 | 바이그램 Jaccard + URL 도메인 이중 검증 | ✓ 11건 후보 (high 2, medium 9) | PASS |
| 비KO 언어 수집 | 수집 불필요 (pilot: 26/26 언어 미제공) | ✓ KO 전용 | PASS |

**문제 없음. 실행 후 완료 보고.**

---

## 2. GPT 프롬프트 실행 중 발견된 이슈 및 수정

### [이슈-1] `kr/index.do?schMonth=` 월 필터 무시

**원인:** VisitBusan 서버가 `kr/index.do` 경로에서 `schMonth` GET 파라미터를 무시하고 현재 월을 반환함.  
**증상:** 12개 월 요청이 모두 동일한 2026년 7월 이벤트를 반환 → 전체 수집이 0건 증가.  
**수정:** 월 초기화는 `kr/index.do`(쿠키 세팅)로 1회만 수행하고, 각 월 목록은 `schedule/list.do?month=N&year=2026`으로 수집.

```
GET https://www.visitbusan.net/schedule/list.do
  ?boardId=BBS_0000009&menuCd=DOM_000000204012000000&startPage=1&month=1&year=2026
```

### [이슈-2] FestivalService `(한,영,중간,중번,일)` suffix로 바이그램 오염

**원인:** FestivalService CSV의 제목 형식: `"부산항축제(한,영,중간,중번,일)"` — 괄호 내 언어 코드가 바이그램에 포함되어 유사도가 낮게 계산됨.  
**추가 원인:** 불기(佛紀) 연도 "2570" (= 서기 2026)가 `/202[0-9]/g` 패턴으로 제거되지 않음.  
**수정:** `normTitle()` 함수 개선:

```javascript
function normTitle(s) {
  return (s ?? '')
    .replace(/\([^)]*\)/g, '')          // 괄호 내용 제거 (언어 suffix)
    .replace(/\b\d{4}\b/g, '')          // 4자리 연도 제거 (서기·불기)
    .replace(/제\d+회/g, '')            // 회차 표기 제거 ("제30회")
    .replace(/[^가-힣a-zA-Z0-9]/g, '')
    .toLowerCase();
}
```

**효과:** 수정 전 11건 모두 medium → 수정 후 high 2건 정확 분리.

### [이슈-3] 공유 포털 도메인 false positive

**원인:** `festivalbusan.com`은 부산시 축제 통합 포털로, 여러 다른 행사가 동일 도메인을 사용함. `www.instagram.com`도 복수 행사가 공유.  
**원 동작:** URL 도메인 일치를 무조건 `high`로 설정 → 7건 모두 `high` (실제로는 다수 false positive).  
**수정:** URL 도메인 일치 + 제목 유사도 ≥ 0.5 → `high`, URL 도메인만 일치 (제목 유사도 < 0.5) → `medium` (검토 필요).

---

## 3. 수집 결과

### 월별 이벤트 수

| 월 | 이벤트 수 | 페이지 |
|---|---|---|
| 2026.01 | 6건 | 1페이지 |
| 2026.02 | 7건 | 1페이지 |
| 2026.03 | 5건 | 1페이지 |
| 2026.04 | 12건 | 1페이지 |
| 2026.05 | 18건 | **2페이지** |
| 2026.06 | 11건 | 1페이지 |
| 2026.07 | 15건 | **2페이지** |
| 2026.08 | 11건 | 1페이지 |
| 2026.09 | 5건 | 1페이지 |
| 2026.10 | 5건 | 1페이지 |
| 2026.11 | 4건 | 1페이지 |
| 2026.12 | 3건 | 1페이지 |
| **합계** | **102건 (목록 노출 합산)** | 14페이지 |
| **dedup 후** | **68개 고유 dataSid** | — |

### 데이터 품질 지표

| 항목 | 수치 |
|---|---|
| 총 HTTP 요청 | 83건 |
| 고유 행사 | **68건** |
| parse_failed | **0 ✓ PASS** |
| title 채움률 | 68/68 (100%) |
| date_start/end 채움률 | 68/68 (100%) |
| venue 채움률 | 62/68 (91%) |
| address 채움률 | 40/68 (59%) |
| official_url 채움률 | 39/68 (57%) |
| image_url 채움률 | 68/68 (100%) |
| 멀티월 이벤트 | 14건 |

### venue 미파싱 6건 — 원인

venue가 비어있는 6건은 VisitBusan 상세 페이지에 장소 레이블이 아예 없는 경우로, 수집 버그가 아닌 원천 데이터 미입력이다.

### official_url 미수집 29건 — 원인

VisitBusan에 홈페이지 링크가 없는 행사이며, 이 경우 `visitbusan_url` 컬럼이 fallback URL로 사용된다. 이는 설계 의도대로이다.

### 멀티월 이벤트 (14건 발췌)

| dataSid | 행사명 | 노출월 |
|---|---|---|
| 5125 | 부산항과 재즈의 만남(2026 BUSAN JAZZ PORT) | 01,02,03 |
| 5014 | 2025 광복로 겨울빛 트리축제 | 01,02 |
| 4837 | 2025 서면 빛 축제 | 01,02 |
| 5475 | 초대형 야외 방탈출 게임 더 스카우트 in 부산 | 04,05 |
| 5576 | 2026 루프 랩 부산 | 04,05,06 |
| (외 9건) | … | … |

---

## 4. FestivalService 연결 후보 결과

### 신뢰도별 결과 (11건)

| dataSid | 웹 행사명 | festival_source_id | FestivalService 제목 | title_sim | url_domain | confidence |
|---|---|---|---|---|---|---|
| 5678 | 2570 부산연등회 | 1432 | 부산연등회 | 1.000 | ✓ | **high** |
| 5727 | 2026 부산항 축제 | 406 | 부산항축제 | 1.000 | ✓ | **high** |
| 5014 | 2025 광복로 겨울빛 트리축제 | 449 | 광복로 겨울빛 트리축제 | 1.000 | — | medium |
| 4837 | 2025 서면 빛 축제 | 2136 | 서면 빛 축제 | 1.000 | — | medium |
| 5487 | 2026 센텀맥주축제 | 329 | 센텀맥주축제 | 1.000 | — | medium |
| 5677 | 2026 해운대 모래축제 | 405 | 해운대모래축제 | 1.000 | — | medium |
| 6060 | 제30회 부산바다축제 | 71 | 부산바다축제 | 1.000 | — | medium |
| 5392 | 2026 부산국제록페스티벌 | 470 | 부산국제록페스티벌 | 1.000 | — | medium |
| 5073 | 2026 부산 시민의 종 타종행사 | 406 | 부산항축제 | 0.083 | ✓ | medium ⚠ |
| 5583 | 2026 부산 밀 페스티벌 | 406 | 부산항축제 | 0.111 | ✓ | medium ⚠ |
| 6148 | 2026 별바다부산 나이트페스타 | 405 | 해운대모래축제 | 0.000 | ✓ | medium ⚠ |

### 신뢰도 해석

**high (2건):** URL 도메인 일치 + 제목 유사도 ≥ 0.5 → 명확한 동일 행사. 바로 연결 가능.

**medium (title_sim=1.0, 6건):** 제목이 동일하나 URL 도메인 검증이 안 된 경우. 실제 일치 가능성 높음 — FestivalService URL 업데이트 또는 수동 확인 후 연결 가능.

**medium ⚠ (title_sim≈0, 3건):** URL 도메인만 일치. `festivalbusan.com` (5073, 5583) 또는 `www.instagram.com` (6148)은 다수 행사가 공유하는 포털/SNS 도메인으로 **false positive** 가능성 높음. 수동 검토 필요.

---

## 5. 비KO 언어 수집 현황

파이럿(TASK-DATA-BUSAN-VISITBUSAN-PILOT)에서 확정됨:
- 26/26 비KO schedule 상세 페이지 → 한국어 콘텐츠 반환
- `language_available = false` (모든 비KO)
- **연간 수집에서 비KO 상세 수집 제외** — KO 원문만 저장

GoKoreaMate 다국어 표시 전략:
- 행사명: KO 원문 + AI 번역 (추후 적용)
- 날짜/장소: KO 원문 (형식이 국제적으로 이해 가능)
- 공식 URL: `official_url` 또는 `visitbusan_url` fallback

---

## 6. 변경 파일 목록

| 파일 | 상태 | 비고 |
|---|---|---|
| `scripts/tourapi-busan-visitbusan-collect.mjs` | **신규** | 연간 수집 스크립트 |
| `data/tourapi/candidates/busan/busan-visitbusan-events.csv` | **신규** | 68행 이벤트 데이터 |
| `data/tourapi/candidates/busan/busan-visitbusan-festival-links.csv` | **신규** | 11행 FestivalService 연결 후보 |
| `data/tourapi/reports/busan/busan-visitbusan-collect-metrics.json` | **신규** | 수집 지표 |

---

## 7. 데이터 스키마 (busan-visitbusan-events.csv)

| 컬럼 | 설명 |
|---|---|
| `source_key` | `VisitBusanSchedule:{dataSid}:ko` |
| `dataSid` | VisitBusan 행사 고유 ID |
| `title` | 행사명 (KO) |
| `date_start` / `date_end` | ISO 날짜 (YYYY-MM-DD) |
| `venue` | 장소 |
| `address` | 주소 |
| `official_url` | 주최측 공식 URL |
| `visitbusan_url` | VisitBusan 상세 URL (fallback) |
| `image_url` | 썸네일 이미지 URL |
| `listed_months` | 목록 노출 월 (파이프 구분: `01|02|03`) |
| `multi_month` | 멀티월 이벤트 여부 (`true/false`) |
| `parse_failed` | 파싱 실패 여부 (`true/false`) |
| `festival_source_id` | FestivalService 연결 후보 ID |
| `match_confidence` | 연결 신뢰도 (`high/medium/low`) |

---

## 8. 다음 단계

1. **FestivalService 연결 확정** — medium(title_sim=1.0) 6건은 FestivalService URL 확인 후 high로 승격 가능. medium ⚠ 3건은 수동 검토.
2. **FestivalService 다국어 데이터 병합** — high/medium 확정 건에 대해 EN/JA/ZhS/ZhT 제목·설명 취득.
3. **official_url 도메인 분류** — 예매 플랫폼(야놀자, 인터파크) vs 주최측 URL 분리 태깅. dataSid=6074처럼 예매 URL이 official_url로 등재된 사례 처리.
4. **venue 미파싱 6건 보강** — TourAPI 또는 수작업으로 장소 보완.
5. **GoKoreaMate DB 로드** — 수집 데이터 검증 후 스테이징 DB 적재 (별도 작업으로 진행).

---

## 9. git 상태

git add / commit / push 없음. 운영 DB 수정 없음. API 키 노출 없음.  
visitbusan.net 83건 요청 (robots.txt 허용). FestivalService CSV 읽기 전용.

---

TASK-DATA-BUSAN-VISITBUSAN-COLLECT 완료. 68건 연간 행사 수집, parse_failed=0 PASS, FestivalService 연결 후보 11건(high 2, medium 9) 생성.
