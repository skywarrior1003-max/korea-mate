# TASK-DATA-BUSAN-EVENT-MERGE-01-REV — 완료 보고서

**날짜:** 2026-07-24  
**태스크:** TASK-DATA-BUSAN-EVENT-MERGE-01-REV  
**상태:** PASS ✓

---

## 1. GPT 프롬프트 검증 요약 (실행 전)

| 항목 | 판정 | 내용 |
|---|---|---|
| title_sim=1.0 → 자동 연결 (secondary criteria 없음) | ✓ 정상 | 이전 REVIEW REQUIRED 사유 해소됨 |
| edition_year_changed + schedule_change_note 메타데이터 | ✓ 정상 | 스테일 FS 데이터 경고를 메타로만 기록 |
| archived 상태 추가 (과거 행사 처리) | ✓ 정상 | 이전 미정의 상태 해소됨 |
| schedule_ready 기준 명시 (date_end ≥ run_date + venue/address 존재) | ✓ 정상 | 컷오프 명확 |
| URL 4분류 스키마 (source_detail_url / official_event_url / ticket_url / social_url) | ✓ 정상 | 예매·SNS 혼합 방지 |
| linked_canonical_id 이번 단계 제외 | ✓ 정상 | 후보 통합 단계 범위 적합 |
| possible_stale_event → schedule_ready에 영향 없음 | ✓ 정상 | VisitBusan이 최신 우선 원천 |

**검증 결과: 문제 없음 → 실행**

---

## 2. 연결 결과

| 구분 | 건수 | 내용 |
|---|---|---|
| 자동 연결 (high) | **2건** | URL 도메인 + 제목 이중 일치 |
| 자동 연결 (title_exact) | **6건** | title_similarity=1.0, secondary criteria 없음 |
| manual_link_review | **3건** | title_sim≈0, 공유 포털·SNS 도메인만 일치 |
| 독립 행사 (unlinked) | **57건** | FestivalService 연결 없음, 독립 VisitBusan 행사 |
| **합계** | **68건** | ✓ 전체 추적 |

### 2-1. 자동 연결 8건 상세

| dataSid | 행사명 | FS source_id | link_method | edition_year_changed |
|---|---|---|---|---|
| 5678 | 2570 부산연등회 | 1432 | url_domain+title | false (FS 2026 dates 일치) |
| 5727 | 2026 부산항 축제 | 406 | url_domain+title | false (FS 2026 dates 일치) |
| 5014 | 2025 광복로 겨울빛 트리축제 | 449 | title_exact | false (FS dates 일치) |
| 4837 | 2025 서면 빛 축제 | 2136 | title_exact | **false** (4837 VB date 시작연도=2025, FS도 2024→2025) |
| 5487 | 2026 센텀맥주축제 | 329 | title_exact | false (FS 2026 dates 일치) |
| 5677 | 2026 해운대 모래축제 | 405 | title_exact | **true** (FS 2025, VB 2026) |
| 6060 | 제30회 부산바다축제 | 71 | title_exact | **true** (FS 2025, VB 2026) |
| 5392 | 2026 부산국제록페스티벌 | 470 | title_exact | **true** (FS 2025, VB 2026) |

edition_year_changed=true 3건 → `schedule_change_note: "FestivalService schedule appears stale; VisitBusan 2026 schedule used."`

### 2-2. manual_link_review 3건 상세

| dataSid | 행사명 | 연결 후보 (FS) | 이유 |
|---|---|---|---|
| 5073 | 2026 부산 시민의 종 타종행사 | 406 (부산항축제) | festivalbusan.com 공유 포털, title_sim=0.083 |
| 5583 | 2026 부산 밀 페스티벌 | 406 (부산항축제) | festivalbusan.com 공유 포털, title_sim=0.111 |
| 6148 | 2026 별바다부산 나이트페스타 | 405 (해운대모래축제) | instagram.com 공유 SNS, title_sim=0 |

---

## 3. 상태 분류 결과

| status | 건수 | 조건 |
|---|---|---|
| schedule_ready | **13건** | date_end ≥ 2026-07-24 + venue/address 존재 + manual_link_review 아님 |
| official_check_required | **2건** | 현재·예정이지만 venue 없음 또는 예매·SNS URL만 존재 |
| manual_link_review | **3건** | 링크 불확실 (5073·5583·6148) |
| archived | **50건** | date_end < 2026-07-24 (단, manual_link_review 중 과거 2건 제외) |
| **합계** | **68건** | ✓ |

### 3-1. schedule_ready 13건

| dataSid | 행사명 | date_end | link |
|---|---|---|---|
| 6167 | 2026 북항 오션 SUP FESTA | 2026-08-09 | unlinked |
| 6111 | 발코니 뮤직쇼 앤 스트릿 페스타 | 2026-12-19 | unlinked |
| 6067 | 2026 피란수도 부산 국가유산 야행 | 2026-07-25 | unlinked |
| 5486 | 제48차 유네스코 세계유산위원회 | 2026-07-29 | unlinked |
| 6037 | 포켓몬 메가페스타 2026 in 부산 | 2026-08-09 | unlinked |
| 5907 | 광안리 M 드론라이트쇼 7월 | 2026-07-25 | unlinked |
| 6068 | 렛츠런파크 부산경남 SUN 더 워터페스티벌 | 2026-08-17 | unlinked |
| 6168 | 부산인디커넥트페스티벌 2026 | 2026-08-16 | unlinked |
| 5348 | 2026 세계도서관정보대회 | 2026-08-13 | unlinked |
| 6060 | 제30회 부산바다축제 | 2026-08-13 | title_exact→71 (edition_year_changed) |
| 6051 | 일러스타 페스 12 | 2026-08-02 | unlinked |
| 5767 | 2026 세븐브릿지 투어 | 2026-09-20 | unlinked |
| 5392 | 2026 부산국제록페스티벌 | 2026-10-04 | title_exact→470 (edition_year_changed) |

### 3-2. official_check_required 2건

| dataSid | 행사명 | 이유 |
|---|---|---|
| 5524 | 부산행 축제대전 | venue, address 모두 없음 (전국 프로모션) |
| 6074 | 전시 울트라백화점 부산 | 야놀자 예매 URL만 존재 (ticket_url=nol.yanolja.com, official_event_url 없음) |

---

## 4. URL 분류 검증

| 항목 | 결과 |
|---|---|
| source_detail_url = official_event_url 혼합 | **0건** ✓ |
| ticket_platform 분류 | 6074(야놀자), 5769(event-us.kr, archived) |
| social 분류 | 6148(instagram — manual_link_review), 기타 archived 일부 |
| organizer 분류 | 나머지 외부 URL |
| 외부 URL 없음 | source_detail_url(visitbusan_url)만 존재 |

---

## 5. lat/lon 취득 결과

자동 연결 8건 → canonical CSV에서 `FestivalService:{source_id}:ko` JOIN:

| dataSid | FS source_id | latitude | longitude |
|---|---|---|---|
| 5678 | 1432 | 35.166367 | 129.06589 |
| 5727 | 406 | 35.114414 | 129.0464 |
| 5014 | 449 | 35.09927 | 129.03131 |
| 4837 | 2136 | 35.15347 | 129.05841 |
| 5487 | 329 | 35.170998 | 129.12697 |
| 5677 | 405 | 35.158497 | 129.15985 |
| 6060 | 71 | 35.084934 | 128.976654 |
| 5392 | 470 | 35.168747 | 128.97238 |

manual_link_review 3건: lat/lon 공백 (링크 불확실)  
unlinked 57건: lat/lon 공백 (향후 별도 주소→좌표 변환 필요)

---

## 6. 검증 항목 전체

| 검증 항목 | 결과 |
|---|---|
| VisitBusan 68건 전체 추적 | ✓ 68/68 |
| source_key 중복 | ✓ 0건 |
| source_detail_url ↔ 외부 URL 혼합 | ✓ 0건 |
| 자동 연결 8건 (high=2 + title_exact=6) | ✓ |
| manual_link_review 3건 | ✓ |
| 독립 행사 57건 | ✓ |
| FestivalService 183건 원본 변경 | ✓ 없음 (읽기 전용) |
| canonical 1,356건 원본 변경 | ✓ 없음 (읽기 전용) |
| archived=50건 (manual 과거 2건 별도) | ✓ |
| 비밀값 노출 | ✓ 없음 |
| 범위 밖 변경 | ✓ 없음 |

---

## 7. 변경 파일 목록

| 파일 | 상태 |
|---|---|
| `scripts/tourapi-busan-visitbusan-merge.mjs` | **신규** |
| `data/tourapi/candidates/busan/busan-visitbusan-merged.csv` | **신규** (68행) |
| `data/tourapi/candidates/busan/busan-schedule-ready.csv` | **신규** (13행) |
| `data/tourapi/candidates/busan/busan-event-manual-link-review.csv` | **신규** (3행) |
| `data/tourapi/reports/busan/busan-visitbusan-merge-metrics.json` | **신규** |

---

## 8. 다음 단계

1. **manual_link_review 3건 수동 검토** — festivalbusan.com 포털(5073·5583)과 Instagram(6148)이 실제 같은 행사인지 확인 후 연결 또는 해제.
2. **official_check_required 2건 보완** — 5524(전국 프로모션 venue 확인), 6074(공식 홈페이지 URL 탐색).
3. **unlinked 57건 lat/lon 보완** — address 기반 geocoding 또는 TourAPI 좌표 병합.
4. **FestivalService 다국어 제목 병합** — 연결된 8건에 대해 EN/JA/ZhS/ZhT 제목 추가 (별도 단계).
5. **GoKoreaMate 스테이징 DB 반영** — 검증 완료 데이터 적재 (별도 작업).

---

## 9. git 상태

git add / commit / push 없음. 운영 DB 수정 없음. API 키 노출 없음.  
FestivalService·canonical 원본 파일 읽기 전용. 외부 HTTP 요청 없음.

---

TASK-DATA-BUSAN-EVENT-MERGE-01-REV 부산 최신 행사 통합 완료.
