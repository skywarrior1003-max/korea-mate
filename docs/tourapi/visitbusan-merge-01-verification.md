# TASK-DATA-BUSAN-EVENT-MERGE-01 — 검증 보고서

**날짜:** 2026-07-24  
**태스크:** TASK-DATA-BUSAN-EVENT-MERGE-01  
**상태:** ⚠ REVIEW REQUIRED — 실행 불가 (4건 수정 필요)

---

## 1. 검증 결과 요약

| 항목 | 판정 | 비고 |
|---|---|---|
| high 2건 자동 연결 | ✓ 정상 | 연등회·부산항축제, URL+제목 이중 확인 |
| medium 6건 secondary criteria | **✗ 결함** | 정확한 3건 차단, false positive는 차단 안 함 |
| medium ⚠ 3건 manual_link_review | ✓ 정상 | false positive 분리 의도 정확 |
| 출력 스키마 | **✗ 미정의** | 파일명·컬럼 목록·필드명 없음 |
| status 분류 로직 | **✗ 불완전** | 과거 행사(52건) 처리 미정의 |
| schedule_ready 기준 | **✗ 모호** | "현재·예정" 컷오프 미지정 |
| FestivalService 183건 무변경 | ✓ 정상 | 읽기 전용 의도 명확 |
| canonical 1,356건 무변경 | ✓ 정상 | 읽기 전용 의도 명확 |

**실행 불가 사유:** 문제 1·2(Critical) 수정 없이 실행 시 6개 medium 연결 중 3건이 오연결 거부되고, 출력 스키마 부재로 검증 기준을 충족할 수 없음.

---

## 2. 문제 1 (Critical) — Secondary Criteria가 정확한 매칭 3건을 역차단

### 2-1. 발생 원인

프롬프트: `"medium 6건은 title_similarity=1.0 + venue/date/domain 중 1개 이상 일치할 때만 연결"`

이 기준을 실제 데이터에 적용한 결과:

| dataSid | VisitBusan 행사 | FS source_id | date 비교 | venue 비교 | domain 비교 | 판정 |
|---|---|---|---|---|---|---|
| 5014 | 광복로 겨울빛 트리축제 | 449 | VB `2025-12-05~2026-02-22` = FS `2025.12.05~2026.02.22` **✓** | FS venue 없음 | FS official_url 없음 | **PASS** |
| **4837** | **서면 빛 축제** | 2136 | VB `2025-10-13~2026-02-14` ≠ FS `2024.10.02~2025.01.10` **✗** (전년도 스테일) | FS venue 없음 **✗** | VB official_url 없음 **✗** | **BLOCKED ✗** |
| 5487 | 센텀맥주축제 | 329 | VB `2026-05-22~05-31` = FS `2026.05.22~05.31` **✓** | — | — | **PASS** |
| **5677** | **해운대 모래축제** | 405 | VB `2026-05-15~05-18` ≠ FS `2025.5.16~5.19` **✗** (전년도 스테일) | VB "해운대 해수욕장 일원" ≠ FS "해운대모래축제" **✗** | VB `haeundae.go.kr` ≠ FS `instagram.com` **✗** | **BLOCKED ✗** |
| 6060 | 제30회 부산바다축제 | 71 | VB `2026-08-07~08-13` ≠ FS `2025.8.1~8.3` **✗** | VB "다대포해수욕장 일원" ≈ FS "다대포 해수욕장 일원" **(공백 차이, 구현 의존)** | VB `festivalbusan.com` ≠ FS `www.bfo.or.kr` **✗** | **불확실** |
| **5392** | **부산국제록페스티벌** | 470 | VB `2026-10-02~10-04` ≠ FS `2025.9.26~9.28` **✗** (전년도 스테일, 월도 다름) | VB "삼락생태공원" ≠ FS "부산국제록페스티벌" **✗** | VB official_url 없음 **✗** | **BLOCKED ✗** |

**결과:** `title_sim=1.0` 6건 중 최소 **3건(4837·5677·5392)이 차단**. 6060도 구현 방식에 따라 차단될 수 있음.

### 2-2. 근본 원인 분석

Secondary criteria 도입 의도는 "false positive 방어"였으나:

- **보호 대상(false positive):** medium ⚠ 3건(5073·5583·6148) — `title_sim≈0`, URL domain만 일치 → 프롬프트가 이미 `manual_link_review`로 별도 분류. Secondary criteria 적용 대상이 **아님**.
- **피해 대상(title_sim=1.0):** FestivalService의 연간 행사 데이터는 전년도 날짜 스테일이 구조적 특성. `possible_stale_event=true` 레코드가 6건 중 4건(71·405·470·2136). FS venue 필드는 장소명이 아닌 행사명으로 채워진 경우 다수(비교 의미 없음). 결국 secondary criteria는 **FestivalService 데이터 품질 제약을 이유로 정확한 매칭을 거부**하는 역효과 발생.

### 2-3. 개선 방향

`title_sim=1.0`은 연도·특수문자·회차·언어suffix 제거 후 제목이 완전 일치한다는 의미로, 동일 행사 여부를 충분히 증명함. Secondary criteria 불필요.

**수정안:**
```
title_similarity=1.0인 medium 6건 → 모두 자동 연결
  link_method: 'title_exact'
  schedule_change_note: FS possible_stale_event 여부 기록

secondary criteria(venue/date/domain)는 title_sim 0.6~0.99 구간에만 적용
```

이미 false positive인 medium ⚠ 3건(5073·5583·6148)은 `title_sim≈0`으로 분리되어 있으므로 secondary criteria 제거가 이들에게 영향 없음.

---

## 3. 문제 2 (Critical) — 출력 스키마 미정의

### 3-1. 미정의 항목

| 항목 | 현 상태 | 필요 사항 |
|---|---|---|
| 출력 파일명 | 없음 | e.g., `busan-visitbusan-merged.csv`, `busan-schedule-ready.csv` |
| 컬럼 목록 | 없음 | 아래 제안 참조 |
| `source_detail_url` | 개념만 언급 | = `visitbusan_url`인지, 별도 컬럼인지 불명 |
| `organizer_official_url` | 개념만 언급 | = `official_url`의 rename인지 불명 |
| source_key 형식 | 없음 | `VisitBusanSchedule:{dataSid}:ko`? |
| FestivalService 다국어 필드 | "보조 원천으로 사용" | embed vs ID 참조만? |
| 좌표(lat/lon) | 언급 없음 | canonical CSV에서 JOIN 여부? |

### 3-2. 제안 출력 스키마

```
source_key              (VisitBusanSchedule:{dataSid}:ko)
dataSid
title_ko                (VisitBusan 행사명 원문)
date_start              (ISO)
date_end                (ISO)
venue
address
source_detail_url       (= visitbusan_url — VisitBusan 상세 페이지)
organizer_official_url  (= official_url — 주최측 URL, 야놀자 등 예매 플랫폼 포함 가능)
image_url
listed_months
multi_month
linked_festival_source_id
linked_canonical_id     (= busan-E-00XXX, canonical JOIN용)
link_confidence         (high/medium/none)
link_method             (url_domain+title / title_exact / none)
latitude                (canonical CSV에서 JOIN, 없으면 공백)
longitude
status                  (schedule_ready / official_check_required / manual_link_review / archived)
schedule_change_note    (FS possible_stale_event 경고 등)
```

**별도 파일 제안:**
- `busan-visitbusan-merged.csv` — 68건 전체
- `busan-schedule-ready.csv` — status=schedule_ready 필터링 결과 (현재 기준 ~16건)
- `busan-visitbusan-merge-metrics.json` — 상태별 집계

---

## 4. 문제 3 (Important) — 과거 행사(52건) Status 미정의

### 4-1. schedule_ready 기준

"현재·예정" 의 정확한 정의 필요.

| 정의 | 해당 건수 | 비고 |
|---|---|---|
| date_end >= 2026-07-24 | **16건** | 권장 — 진행 중 + 향후 행사 |
| date_start >= 2026-07-24 | ~9건 | 미시작 행사만 |
| date_end >= 2026-07-24 AND date_start <= 2026-07-24 | ~7건 | 현재 진행 중만 |

### 4-2. 과거 행사(52건) 처리

프롬프트 정의 status 3종: `schedule_ready`, `official_check_required`, `manual_link_review`

**미정의 케이스:** date_end < 2026-07-24인 52건 — 상태가 없음.

**수정 방안:** `archived` status 추가 OR `official_check_required` 에 과거 행사 포함.

권장: `archived` 추가 (과거 행사를 오류로 오해할 소지 방지)

```
status 분류 로직:
  archived:               date_end < run_date
  manual_link_review:     medium ⚠ 3건 (link_confidence=medium AND title_sim≈0)
  official_check_required: 링크된 FS가 possible_stale_event=true OR official_check_required=true
  schedule_ready:         date_end >= run_date AND status 위 조건 해당 없음
```

---

## 5. 문제 4 (Minor) — 6074 야놀자 URL organizer_official_url 미처리

dataSid=6074 "전시 울트라백화점 부산"의 official_url: `https://nol.yanolja.com/ticket/products/26006746` — 야놀자 예매 플랫폼 URL.

`organizer_official_url`이라는 명칭은 주최자(organizer) 공식 사이트를 의미하나 예매 플랫폼과 혼동 가능. 파일럿 보고서에서 이미 지적된 사항이나 프롬프트에서 처리 방식을 명시하지 않음.

**수정 방안:** `organizer_official_url_type` 필드 추가 (`organizer` / `ticket_platform` / `social` / `null`). 또는 예매 URL은 별도 `ticket_url` 컬럼으로 분리.

---

## 6. 예상 결과 (수정안 적용 시)

| 구분 | 건수 |
|---|---|
| 전체 VisitBusan 행사 | 68건 |
| linked_high (자동 연결) | 2건 (5678 연등회, 5727 부산항축제) |
| linked_medium_title_exact (수정 후 자동 연결) | 6건 (5014, 4837, 5487, 5677, 6060, 5392) |
| manual_link_review (검토 필요) | 3건 (5073, 5583, 6148 — false positive 의심) |
| unlinked (독립 행사) | 57건 |
| schedule_ready (date_end ≥ 오늘) | ~16건 |
| archived (과거 행사) | ~52건 |

---

## 7. 수정 전 확인 필요 사항

1. **[Must Fix] medium 6건 secondary criteria 제거** — `title_sim=1.0` 전건 자동 연결로 변경
2. **[Must Fix] 출력 스키마 명시** — 파일명, 컬럼 목록, source_key 형식
3. **[Must Fix] schedule_ready 기준 명시** — "현재·예정" 컷오프 날짜 (권장: `date_end >= run_date`)
4. **[Must Fix] 과거 행사 status 정의** — `archived` 추가 또는 기존 status 중 하나로 귀속 명시
5. **[Optional] organizer_official_url_type 추가** — 예매 플랫폼 URL 구분
6. **[Optional] linked_canonical_id 포함 여부** — canonical DB와 JOIN 필요성 결정

---

## 8. 변경 파일

이번 검증에서 생성 또는 변경된 파일 없음.  
운영 DB 수정 없음. git add / commit / push 없음. API 키 노출 없음.

---

TASK-DATA-BUSAN-EVENT-MERGE-01 검증 완료. 위 4건 수정 후 재제출 시 실행 가능.
