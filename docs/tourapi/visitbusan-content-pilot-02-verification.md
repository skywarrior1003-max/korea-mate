# PILOT-02 GPT 분석 검증 보고서

**날짜:** 2026-07-24  
**대상:** GPT가 제시한 PILOT-02 조건부 PASS 판정 및 CONTENT-DISCOVERY-03 권장  
**판정: 실행 보류 — 선행 수정 2건 추가 확인**

---

## 1. GPT 분석 검증 결과

| GPT 주장 | 검증 | 근거 |
|---|---|---|
| PILOT-02 조건부 PASS (HARD STOP 3개 해소) | ✓ 정확 | metrics.json: title_blank=0, html_contam=0, sk_dup=0 |
| KO 16건 제한 — Vue.js 카테고리 필터 | ✓ 정확 | 카테고리 발견 0개 (5타입 전체) |
| EN title_missing 6건 (25건 중 24%) | ✓ 정확 | attraction 1건, experience 4건, course 1건 확인 |
| website 100% 지표 의심 | ✓ + 심각도 상향 | 아래 §2 참조 — 의심이 아닌 확정 결함 |
| CONTENT-DISCOVERY-03 필요성 | ✓ 정확 | 전체 ID 발견 방식 미해결 |
| XHR/API 우선, Playwright 후순위 | ✓ 정확 | |

---

## 2. 신규 발견 결함 (GPT 미감지)

### 결함 A: website 50% 이상이 부산시 개인정보처리방침 URL

```
확인된 값: https://www.busan.go.kr/vprivacy1
발생 건수: 54/105건 (51%)
```

**원인:** `extractWebsiteUrl()` 함수의 fallback 로직이 너무 광범위합니다.

```javascript
// scripts/tourapi-busan-visitbusan-content-pilot.mjs:208-216
function extractWebsiteUrl(html) {
  const re = /<li[^>]*>\s*<p[^>]*>(?:홈페이지|Homepage|...)[^<]*<\/p>\s*<span[^>]*>([\s\S]*?)<\/span>/i;
  const m  = html.match(re);
  const searchIn = m ? m[1] : html;   // ← m이 null이면 html 전체를 탐색
  const hrefM = searchIn.match(/href=["']?(https?:\/\/...)/i);
  ...
}
```

`홈페이지` 라벨이 없으면 `searchIn = html` (페이지 전체 HTML)이 됩니다. VisitBusan 모든 페이지 하단의 개인정보처리방침 링크 `<a href="https://www.busan.go.kr/vprivacy1">` 가 첫 번째 URL로 걸립니다.

**영향:** metrics에 표시된 `website 100%`는 실제 외부 공식 홈페이지 수집률이 아니며, 51%는 개인정보처리방침 URL입니다.

**필요 수정:**
```javascript
function extractWebsiteUrl(html) {
  if (!html) return '';
  const re = /<li[^>]*>\s*<p[^>]*>(?:홈페이지|Homepage|Website|Official)[^<]*<\/p>\s*<span[^>]*>([\s\S]*?)<\/span>/i;
  const m  = html.match(re);
  if (!m) return '';  // ← 라벨이 없으면 빈 문자열 반환 (fallback 제거)
  const hrefM = m[1].match(/href=["']?(https?:\/\/[^"'\s>]{5,})["']?/i);
  if (hrefM) return hrefM[1];
  const urlM = m[1].match(/https?:\/\/[^\s"'<>]{5,}/);
  return urlM ? urlM[0].replace(/['">\s]+$/, '') : '';
}
```

---

### 결함 B: attraction 2566 title="상세보기" — UI 버튼 텍스트 오포착

```
uc_seq: 2566
source_key: VisitBusanContent:attraction:2566:ko
현재 title_ko: "상세보기"
실제 장소: 부산 동래구 낙민로 28 구 동래역사
```

"상세보기"는 목록 페이지 링크 버튼 텍스트입니다. `extractTitle(html)`이 빈 값을 반환했을 때 `listingTitle`("상세보기")로 폴백됐거나, 해당 상세 페이지의 `var mtTitle`이 "상세보기"로 세팅된 경우입니다.

**필요 수정:** `SITE_AND_CATEGORY` 집합 또는 별도 UI_TEXT 집합에 추가:
```javascript
const UI_TEXT = new Set(['상세보기', '자세히 보기', 'view detail', 'more', '더보기', 'see more']);
// parseDetail() 또는 extractTitle()에서 UI_TEXT 포함 값 거부
```

---

## 3. EN title_missing 6건 분류

| uc_seq | 타입 | EN 주소 있음 | EN 전화 있음 | 진단 |
|---|---|---|---|---|
| 2753 | attraction | ✗ | ✗ | EN 콘텐츠 미제공 또는 `var mtTitle` 없음 |
| 2789 | experience | ✗ | ✗ | EN 콘텐츠 미제공 또는 `var mtTitle` 없음 |
| 2784 | experience | ✗ | ✗ | EN 콘텐츠 미제공 또는 `var mtTitle` 없음 |
| 2763 | experience | ✓ | ✓ | EN 콘텐츠 존재, `var mtTitle` 없는 EN 패턴 |
| 2755 | experience | ✗ | ✗ | EN 콘텐츠 미제공 또는 `var mtTitle` 없음 |
| 2788 | course | ✓ | ✗ | EN 콘텐츠 존재, `var mtTitle` 없는 EN 패턴 |

**중요:** 2763(experience), 2788(course)은 EN 주소가 영어로 번역돼 있어 EN 콘텐츠가 존재하지만 title만 추출 실패. EN 페이지에서 `var mtTitle`이 없는 경우 `<title>` 태그 첫 번째 세그먼트 탐색이 추가로 필요할 수 있습니다.

**GPT 권장 처리방침 (지지):**
- EN 번역 제목이 확인되면 → 파서 보완
- EN 제목이 공식 제공되지 않으면 → EN 레코드 미생성 또는 `language_available=false`
- KO 제목 EN 칸 복사 금지

---

## 4. CONTENT-DISCOVERY-03 범위 검토

GPT가 제시한 CONTENT-DISCOVERY-03 범위에 동의합니다. 다음을 추가합니다.

| 항목 | GPT 권장 | 추가 |
|---|---|---|
| 전체 ID 발견 방식 | XHR/JSON API 탐색 | ✓ |
| ucc2_seq 확보 | 필요 | ✓ |
| 전체 예상 건수 | 확정 | ✓ |
| EN title 누락 원인 | 분류 | ✓ 구체화: EN 페이지 `<title>` 첫 세그먼트 패턴 확인 |
| website / source_detail_url 분리 | 필요 | ✓ extractWebsiteUrl fallback 제거 선행 |
| **UI 텍스트 필터 추가** | ❌ 미언급 | 추가 필요 ("상세보기" 등) |
| **website fallback 버그 수정** | ❌ 의심 수준 | 확정 결함으로 상향, 수정 선행 필요 |

---

## 5. 전체 수집 전 선행 수정 목록

CONTENT-DISCOVERY-03 진입 전 스크립트에서 수정해야 할 사항:

1. `extractWebsiteUrl()` — fallback 제거: `홈페이지` 라벨 없으면 빈 문자열 반환
2. UI 텍스트 필터 추가: "상세보기" 등을 title로 저장하지 않도록 차단
3. EN title 추출 보완: EN 페이지 `<title>` 첫 번째 세그먼트 패턴 조사 후 반영

---

## 6. 최종 판정

| 구분 | 판정 |
|---|---|
| PILOT-02 상세 파서 검증 | **PASS** (HARD STOP 3개 해소) |
| website 지표 신뢰도 | **FAIL** — 결함 수정 후 재측정 필요 |
| title "상세보기" | **FAIL** — UI 텍스트 필터 추가 필요 |
| EN title 추출 | **부분 완료** — 6건 원인 분류 필요 |
| VisitBusan 전체 수집 준비 | **REVIEW REQUIRED** |

**다음 단계:** 위 3개 선행 수정 → CONTENT-DISCOVERY-03 (XHR/API 탐색 + ID 전체 발견)
