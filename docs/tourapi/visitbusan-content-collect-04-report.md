# TASK-DATA-BUSAN-VISITBUSAN-CONTENT-COLLECT-04 완료 보고서

**날짜:** 2026-07-24
**상태:** **PASS ✓**
**소요 시간:** 20분 (1193초)
**총 요청:** 1597건

---

## 1. 수집 결과 요약

| 항목 | 건수 |
|---|---|
| 전체 ID 발견 | 775건 |
| KO 후보 레코드 | 773건 |
| EN 후보 레코드 | 737건 |
| **전체 후보 레코드** | **1510건** |
| 제외 레코드 | 40건 |

---

## 2. 유형별 결과

| 유형 | 발견 | KO 후보 | KO 제외 | EN 후보 |
|---|---|---|---|---|
| 명소 | 213 | 212 | 1 | 207 |
| 음식 | 337 | 336 | 1 | 336 |
| 쇼핑 | 55 | 55 | 0 | 53 |
| 체험 | 121 | 121 | 0 | 103 |
| 코스 | 49 | 49 | 0 | 38 |

---

## 3. KO 파싱 결과

| 구분 | 건수 |
|---|---|
| KO OK | 773 |
| requires_client_render | 2 |
| error_page | 0 |
| **합계** | **775** |

---

## 4. EN 결과

| 구분 | 건수 |
|---|---|
| EN OK (후보 생성) | 737 |
| language_content_unavailable | 38 |
| not_en_page | 0 |
| error_page | 0 |
| **합계** | **775** (= ID 전체 775) |

---

## 5. 채움률 (KO 후보 기준)

| 필드 | 채움률 |
|---|---|
| address | 92.5% |
| phone | 87.3% |
| lat | 100.0% |
| lon | 100.0% |
| hours | 0.0% |
| closed_days | 74.1% |
| external_official_url | 35.2% |
| image_url | 0.0% |

---

## 6. 검증 조건

| 조건 | 결과 |
|---|---|
| HARD STOP 1: title_ko 공백 0건 | ✓ |
| HARD STOP 2: HTML 오염 0건 | ✓ |
| HARD STOP 3: source_key 중복 0건 | ✓ |
| FAIL: 개인정보처리방침 URL 0건 | ✓ |
| FAIL: EN 허위 fallback 0건 | ✓ |
| FAIL: 파일럿 파일 덮어쓰기 없음 | ✓ |
| FAIL: EN 합계 = ID 전체 | ✓ 775 = 775 |

---

## 7. JA/ZhS/ZhT 상태 (레코드 미생성)

| 유형 | 언어 | uc_seq | 접근 | 표본 제목 |
|---|---|---|---|---|
| attraction | ja | 2753 | ✗ | N/A |
| attraction | zhs | 2753 | ✗ | N/A |
| attraction | zht | 2753 | ✗ | N/A |
| food | ja | 2386 | ✗ | N/A |
| food | zhs | 2386 | ✗ | N/A |
| food | zht | 2386 | ✗ | N/A |
| shopping | ja | 2670 | ✗ | N/A |
| shopping | zhs | 2670 | ✗ | N/A |
| shopping | zht | 2670 | ✗ | N/A |
| experience | ja | 2789 | ✗ | N/A |
| experience | zhs | 2789 | ✗ | N/A |
| experience | zht | 2789 | ✗ | N/A |
| course | ja | 2788 | ✗ | N/A |
| course | zhs | 2788 | ✗ | N/A |
| course | zht | 2788 | ✗ | N/A |

---

## 8. 출력 파일

| 파일 | 설명 |
|---|---|
| visitbusan-content-full.csv | 1510행 후보 레코드 |
| visitbusan-content-full.json | 1510건 JSON |
| visitbusan-content-full-excluded.json | 40건 제외 레코드 (requires_client_render + EN 미제공) |
| visitbusan-content-full-metrics.json | 지표 요약 |
| visitbusan-content-collect-04-report.md | 본 보고서 |

---

## 9. 다음 단계

TourAPI/KTO matched / web_only / api_only / manual_review 비교

---

TASK-DATA-BUSAN-VISITBUSAN-CONTENT-COLLECT-04 VisitBusan 일반 콘텐츠 전체 수집 완료.

---

## PATCH-04A: KO 운영시간 패치 결과

**날짜:** 2026-07-24
**상태:** **PASS ✓**
**소요:** 10분 (573초) / 775건 요청

### KO 처리 결과

| 구분 | 건수 |
|---|---|
| KO 처리 총 | 775건 |
| KO OK (후보) | 773건 |
| requires_client_render | 2건 |
| error_page | 0건 |

### EN 보존 확인

| 항목 | 결과 |
|---|---|
| 기존 EN 후보 | 737건 |
| 패치 후 EN 후보 | 737건 |
| 변경 | 없음 ✓ |

### hours 채움률 Before/After (KO 기준)

| 유형 | Before (COLLECT-04) | After (PATCH-04A) |
|---|---|---|
| **전체** | **0.0%** (0/773) | **84.6%** (654/773) |
| 명소 | 0.0% (0/212) | 84.4% (179/212) |
| 음식 | 0.0% (0/336) | 100.0% (336/336) |
| 쇼핑 | 0.0% (0/55) | 87.3% (48/55) |
| 체험 | 0.0% (0/121) | 69.4% (84/121) |
| 코스 | 0.0% (0/49) | 14.3% (7/49) |

### 유형별 KO 후보 건수 Before/After

| 유형 | Before | After |
|---|---|---|
| 명소 | 212 | 212 |
| 음식 | 336 | 336 |
| 쇼핑 | 55 | 55 |
| 체험 | 121 | 121 |
| 코스 | 49 | 49 |

### HARD STOP 결과

| 조건 | 결과 |
|---|---|
| KO 처리 총 775건 | ✓ |
| EN 후보 737건 보존 | ✓ |
| title_ko 공백 0건 | ✓ |
| HTML 오염 0건 | ✓ |
| source_key 중복 0건 | ✓ |
| 개인정보처리방침 URL 0건 | ✓ |
| EN 레코드 내용 변경 없음 | ✓ |
| 회귀 결함 0건 (address·phone·lat/lon·title) | ✓ |
| pilot 파일 무변경 | ✓ |
| PASS 전 full 파일 미덮어쓰기 | ✓ |

TASK-DATA-BUSAN-VISITBUSAN-CONTENT-PATCH-04A KO 운영시간 패치 완료.

---

## PATCH-04A: KO 운영시간 패치 결과

**날짜:** 2026-07-24
**상태:** **PASS ✓**
**소요:** 10분 (575초) / 775건 요청

### KO 처리 결과

| 구분 | 건수 |
|---|---|
| KO 처리 총 | 775건 |
| KO OK (후보) | 773건 |
| requires_client_render | 2건 |
| error_page | 0건 |

### EN 보존 확인

| 항목 | 결과 |
|---|---|
| 기존 EN 후보 | 737건 |
| 패치 후 EN 후보 | 737건 |
| 변경 | 없음 ✓ |

### hours 채움률 Before/After (KO 기준)

| 유형 | Before (COLLECT-04) | After (PATCH-04A) |
|---|---|---|
| **전체** | **0.0%** (0/773) | **84.6%** (654/773) |
| 명소 | 0.0% (0/212) | 84.4% (179/212) |
| 음식 | 0.0% (0/336) | 100.0% (336/336) |
| 쇼핑 | 0.0% (0/55) | 87.3% (48/55) |
| 체험 | 0.0% (0/121) | 69.4% (84/121) |
| 코스 | 0.0% (0/49) | 14.3% (7/49) |

### 유형별 KO 후보 건수 Before/After

| 유형 | Before | After |
|---|---|---|
| 명소 | 212 | 212 |
| 음식 | 336 | 336 |
| 쇼핑 | 55 | 55 |
| 체험 | 121 | 121 |
| 코스 | 49 | 49 |

### HARD STOP 결과

| 조건 | 결과 |
|---|---|
| KO 처리 총 775건 | ✓ |
| EN 후보 737건 보존 | ✓ |
| title_ko 공백 0건 | ✓ |
| HTML 오염 0건 | ✓ |
| source_key 중복 0건 | ✓ |
| 개인정보처리방침 URL 0건 | ✓ |
| EN 레코드 내용 변경 없음 | ✓ |
| 회귀 결함 0건 (address·phone·lat/lon·title) | ✓ |
| pilot 파일 무변경 | ✓ |
| PASS 전 full 파일 미덮어쓰기 | ✓ |

TASK-DATA-BUSAN-VISITBUSAN-CONTENT-PATCH-04A KO 운영시간 패치 완료.
