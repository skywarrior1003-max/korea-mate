# TASK-DATA-BUSAN-VISITBUSAN-PARSER-FIX-04A 완료 보고서

**날짜:** 2026-07-24  
**상태:** **PASS ✓**  
**회귀 테스트:** 19건 PASS / 0건 FAIL  

---

## 1. 수행 내역 요약

| 작업 | 결과 |
|---|---|
| hours 라벨 수정 (KO + EN) | ✓ 완료 |
| image_url 서버사이드 패턴 조사 (표본 5건) | ✓ 완료 — Vue.js 동적 로딩 확인 |
| 회귀 테스트 추가 (S14–S19, 기존 regression-02a.mjs) | ✓ 완료 |
| 회귀 테스트 실행 | ✓ 19/19 PASS |

---

## 2. hours 라벨 수정

### 버그 원인

`tourapi-busan-visitbusan-content-collect.mjs` 작성 시 VisitBusan 실제 HTML 라벨 **`'운영요일 및 시간'`** 누락 → COLLECT-04 결과 hours=0% (773건 전부 빈 문자열).

파일럿 스크립트는 해당 라벨 포함 → 54.3% 채움률을 기록한 것과 대조.

### 수정 내용

**KO parseKoDetail (collect.mjs):**
```javascript
// 수정 전
hours: extractInfoField(html, '운영시간', 'Opening Hours', '영업시간'),

// 수정 후
hours: extractInfoField(html, '운영요일 및 시간', '운영시간', '영업시간', 'Hours', 'Opening Hours', 'Operating', 'Open'),
```

**EN parseEnDetail (collect.mjs):**
```javascript
// 수정 전
hours: extractInfoField(html, 'Opening Hours', 'Hours'),

// 수정 후
hours: extractInfoField(html, 'Opening Hours', 'Hours', '운영요일 및 시간', '운영시간', 'Operating', 'Open'),
```

추가 수정 (부가 버그):
- **phone** (KO): `'전화번호', 'Inquiry', 'Inquiries', 'Phone', '전화', 'TEL'` 포함
- **closed_days** (KO/EN): `'Closing Dates', 'Closed', '휴관일', '정기휴일'` 포함
- **representative_menu** (KO): `'대표 메뉴'` (공백 포함) + `'대표메뉴'` 병기 — 파일럿 기준 라벨 복구

---

## 3. hours 표본 결과 (회귀 테스트 S14–S18)

| 샘플 | 유형 | uc_seq | 추출 결과 | 판정 |
|---|---|---|---|---|
| S14 | 명소 (attraction) | 2753 | `10:00~18:00(월~토)` | PASS ✓ |
| S15 | 음식 (food) | 2386 | `10:00-20:00` | PASS ✓ |
| S16 | 쇼핑 (shopping) | 2670 | `화~일 / 10:30~21:00` | PASS ✓ |
| S17 | 체험 (experience) | 2789 | `""` (빈 문자열, 라벨 없음) | PASS ✓ |
| S18 | 코스 (course) | 2788 | `""` (빈 문자열, 라벨 없음) | PASS ✓ |

- 명소·음식·쇼핑: `'운영요일 및 시간'` 라벨 정상 추출 확인
- 체험·코스: 해당 라벨 없음 → 빈 문자열이 올바른 동작

---

## 4. image_url 패턴 조사 결과 (표본 5건)

| uc_seq | 유형 | 서버사이드 img src 패턴 | content-specific 이미지 |
|---|---|---|---|
| 2753 | 명소 | 로고·아이콘·내비게이션 경로만 존재 | 없음 |
| 2678 | 명소 | 로고·아이콘·내비게이션 경로만 존재 | 없음 |
| 2386 | 음식 | 로고·아이콘·내비게이션 경로만 존재 | 없음 |
| 2670 | 쇼핑 | 로고·아이콘·내비게이션 경로만 존재 | 없음 |
| 2789 | 체험 | 로고·아이콘·내비게이션 경로만 존재 | 없음 |

**결론:** VisitBusan 콘텐츠 이미지는 **Vue.js가 동적 로딩** (클라이언트 렌더링).  
서버사이드 HTML에는 `uploadImgs`, `conts_img`, `content_img` 경로 없음.  
현재 `extractImageUrl()` 패턴의 문제가 아니라 **구조적 한계** — HTTP 정적 수집으로는 해결 불가.

**회귀 테스트 S19 (uc_seq=2753):** image_url="" 서버사이드 빈 문자열 → PASS ✓

---

## 5. 수정 파일

| 파일 | 수정 내용 |
|---|---|
| `scripts/tourapi-busan-visitbusan-content-collect.mjs` | KO/EN hours, phone, closed_days, representative_menu 라벨 확장 |
| `scripts/tourapi-busan-visitbusan-regression-02a.mjs` | S14–S19 표본 추가, `extractHoursFromSpan()` 함수, hours/image_url PASS 조건 |

---

## 6. 남은 결함

| 결함 | 범위 | 해결 방법 |
|---|---|---|
| **hours=0% in full CSV/JSON** | KO 773건 전체 | CONTENT-PATCH-04A: KO만 재수집 후 기존 full 파일 KO 행 교체 |
| **image_url=0% (구조적 한계)** | 전체 1510건 | 별도 Playwright 페이즈 — 이번 태스크 범위 외 |
| **대표메뉴 채움률 미확인** | KO food 336건 | KO 패치 후 확인 |

**기존 `visitbusan-content-full.csv/json`은 미수정** (CONTENT-PATCH-04A에서 KO 행만 교체 예정).

---

## 7. 회귀 테스트 전체 결과

```
=== 결과: PASS ✓ ===
표본: 19건 PASS / 0건 FAIL
```

| 그룹 | 샘플 | 내용 | 결과 |
|---|---|---|---|
| 1 — KO title 없음 | S1 | requires_client_render | PASS |
| 2 — KO 정상 | S2 | var mtTitle 존재 | PASS |
| 3 — EN 정상 | S3 | EN title 존재 | PASS |
| 4 — EN title 없음 | S4–S9 | language_content_unavailable | PASS (6건) |
| 5 — ext_url | S10–S13 | 외부 URL 오포착 방지 | PASS (4건) |
| 6 — hours 회귀 | S14–S18 | 5개 ctype hours 추출 | PASS (5건) |
| 7 — image_url | S19 | 서버사이드 빈 문자열 확인 | PASS |

---

TASK-DATA-BUSAN-VISITBUSAN-PARSER-FIX-04A hours·image 파서 수정 완료.
