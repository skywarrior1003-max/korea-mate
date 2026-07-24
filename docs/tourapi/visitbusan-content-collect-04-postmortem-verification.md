# COLLECT-04 사후 GPT 평가 검증 보고서

**날짜:** 2026-07-24
**대상:** COLLECT-04 완료 후 GPT 제시 사후 평가 및 다음 단계 방향
**판정: 실행 보류 — 버그 발견 및 개선 방향 반영 필요**

---

## 1. GPT 평가 검증

### 1-1. 정확한 항목 ✓

| 항목 | GPT 평가 | 검증 |
|---|---|---|
| COLLECT-04 PASS 판정 | ✓ | 수치 정합 (KO 773+2=775, EN 737+38=775) |
| 좌표 100% | ✓ | lat/lon 전항목 확보 확인 |
| HTML 오염·중복·허위 fallback 0 | ✓ | 검증 로그 확인 |
| hours=0% 문제 인식 | ✓ | 파일럿 CSV 교차 확인으로 실증 |
| image_url=0% 문제 인식 | ✓ | 파일럿도 0/105 = 동일 결과 |
| 바로 TourAPI 비교로 넘어가면 안 됨 | ✓ | 정확한 판단 |
| 운영시간 우선순위 > 이미지 URL | ✓ | 일정 AI 기능 관점 타당 |

---

## 2. 핵심 버그 발견 — 조사 불필요, 수정 가능

GPT는 "조사 먼저"를 권장했으나, 파일럿 CSV와 스크립트 비교로 이미 원인이 확인됨.

### 버그 1: hours=0% — collect 스크립트 라벨 누락

**파일럿 스크립트 (정상, 54.3% 채움):**
```javascript
row.hours = extractInfoField(html, '운영요일 및 시간', '운영시간', 'Hours', 'Operating', 'Open');
```

**전체 수집 스크립트 (버그, 0% 채움):**
```javascript
hours: extractInfoField(html, '운영시간', 'Opening Hours', '영업시간'),
```

**원인:** VisitBusan 실제 HTML 라벨은 **`'운영요일 및 시간'`** (공백 포함). collect 스크립트 작성 시 이 라벨이 누락됨.

**증거:**
- 파일럿 CSV: hours 채움 57/105 = **54.3%** (같은 `extractInfoField()` 패턴 사용, `'운영요일 및 시간'` 포함 시)
- 전체 수집 CSV: hours 채움 0/773 = **0%** (`'운영요일 및 시간'` 누락)
- 파일럿 hours 확인 샘플 (attraction 위주): `10:00~18:00(월~토)`, `매일 9:00~18:00` 등

**수정 내용 (단순):**
```javascript
// 현재 (잘못됨)
hours: extractInfoField(html, '운영시간', 'Opening Hours', '영업시간'),

// 수정 (파일럿 기준)
hours: extractInfoField(html, '운영요일 및 시간', '운영시간', 'Hours', 'Operating', 'Open'),
```

---

### 버그 2 (부가): representative_menu 라벨 공백 차이

**파일럿:**
```javascript
extractInfoField(html, '대표 메뉴', 'Best Menu', 'Representative Menu')
```

**전체 수집:**
```javascript
extractInfoField(html, '대표메뉴', 'Representative Menu', '주요 메뉴')
```

VisitBusan 실제 라벨은 `'대표 메뉴'` (공백 있음). 미미한 영향이나 수정 필요.

---

### 미해결: image_url=0% — 패턴 조사 필요

```javascript
function extractImageUrl(html) {
  const m = html.match(/src=["']([^"']*(?:uploadImgs|conts_img|content_img)[^"']+\.(?:jpg|jpeg|png|webp))["']/i);
  return m ? m[1] : '';
}
```

- **파일럿 결과:** 0/105 = 0% (동일 함수 사용)
- **전체 수집 결과:** 0/773 = 0%
- **결론:** 파일럿부터 image_url 패턴이 VisitBusan 실제 이미지 URL 경로와 불일치
- **조사 필요:** VisitBusan 상세 페이지 `<img>` src 실제 경로 패턴 확인 후 정규식 교체

---

## 3. GPT 제안 대비 개선 방향

### GPT 제안
```
1. hours·image_url 패턴 조사
2. 파서 수정 및 전체 결과 재생성 (1,597건)
3. VisitBusan ↔ TourAPI/KTO 비교
4. matched / web_only / api_only / manual_review 분류
5. 원천별 필드 우선순위 적용
6. 부산 최종 통합 보고서
```

### 개선 방향 (이유 포함)

| 차이점 | GPT | 개선안 |
|---|---|---|
| hours 조사 필요 여부 | "조사 필요" | **불필요** — 라벨 불일치가 이미 확인됨 |
| image_url 조사 필요 여부 | "조사 필요" | **필요** — 파일럿부터 패턴 불일치, 실제 경로 미확인 |
| 재수집 범위 | "전체 재생성 (KO+EN 1,597건)" | **KO만 패치 수집 (775건)** — EN 737건 재수집 불필요 |
| 접근 방식 | 조사 → 수정 → 재생성 | **수정 → KO 패치 → 데이터 병합** |

**KO만 패치 이유:**
- EN 결과 (737건)는 hours/image_url 변경과 무관 — EN rows는 영어 제목만 핵심
- KO 775건만 재수집 → hours/image_url 채움
- 기존 `visitbusan-content-full.csv/json`에서 KO rows만 교체
- 예상 시간: 775 × 500ms ≈ **7분** (기존 20분 대비 65% 단축)

---

## 4. 수정된 다음 단계 순서

```
STEP 1: PARSER-FIX-04A
  - image_url 실제 패턴 조사 (표본 5건)
  - hours 라벨 수정 (이미 확인됨, 즉시 적용)
  - representative_menu 라벨 공백 수정
  - 신규 extractImageUrl() 패턴 적용
  - 대상 스크립트: tourapi-busan-visitbusan-content-collect.mjs 수정
    (신규 스크립트 생성 불필요 — 같은 파일 수정)

STEP 2: CONTENT-PATCH-04A
  - KO 775건만 재수집 (EN 재수집 불필요)
  - 신규 스크립트: tourapi-busan-visitbusan-content-patch-ko.mjs
  - 기존 visitbusan-content-full.csv/json의 KO rows 교체
  - 출력: visitbusan-content-full.csv/json 갱신 (버전 명시)

STEP 3: TourAPI/KTO 비교
  - VisitBusan 전체 ↔ TourAPI/KTO matched / web_only / api_only / manual_review

STEP 4: 부산 통합
  - 원천별 필드 우선순위 적용
  - 최종 통합 후보 생성
```

---

## 5. 판정 요약

| 항목 | 판정 |
|---|---|
| GPT의 COLLECT-04 평가 | ✓ 정확 |
| GPT의 hours/image_url 문제 인식 | ✓ 정확 |
| GPT의 "조사 후 수정" 접근 | △ 부분 — hours는 이미 원인 확인됨 |
| GPT의 "전체 재생성" 제안 | △ 개선 가능 — KO만 패치로 충분 |
| 즉시 실행 여부 | **보류** |

**보류 사유:**
1. `collect.mjs` 스크립트 수정 (hours 라벨 + image_url 패턴) 먼저 필요
2. image_url 실제 패턴 조사 필요 (표본 5건)
3. KO 패치 전략 확정 후 실행

---

COLLECT-04 사후 GPT 평가 검증 완료 — 실행 보류, 스크립트 수정 후 PARSER-FIX-04A 진행 권장.
