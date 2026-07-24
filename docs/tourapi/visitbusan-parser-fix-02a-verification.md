# PARSER-FIX-02A GPT 프롬프트 검증 보고서

**날짜:** 2026-07-24  
**대상 태스크:** TASK-DATA-BUSAN-VISITBUSAN-PARSER-FIX-02A  
**판정: 실행 보류 — EN 제목 추출 전략 수정 필요, uc_seq=2566 처리 방침 결정 필요**

---

## 1. 진단 결과 요약

PARSER-FIX-02A 실행 전에 EN title_missing 케이스 및 uc_seq=2566의 실제 HTML 구조를 확인했습니다.

### 진단 대상 및 결과

| uc_seq | 언어 | var mtTitle | og:title | h1/h2 | `<title>` 내 콘텐츠명 | p-txt 주석 |
|---|---|---|---|---|---|---|
| 2678 (EN 정상) | EN | `"The Little Prince House in Gamcheon Culture Village"` ✓ | undefined | 없음 | 없음 | `"The Little Prince House"` ✓ |
| 2763 (EN 누락) | EN | undefined | undefined | 없음 | 없음 | undefined |
| 2753 (EN 누락) | EN | undefined | undefined | 없음 | 없음 | undefined |
| 2566 (KO 상세보기) | KO | undefined | undefined | 없음 | 없음 | undefined |

### `<title>` 태그 패턴

**EN 페이지의 `<title>` 태그는 한국어 카테고리 라벨을 포함합니다.**

```
experience:2763 EN → "체험·해양·웰니스 | 추천여행 | Visit Busan 釜山広域市"
attraction:2753 EN → "명소 | 부산에가면 | Visit Busan 釜山広域市"
attraction:2678 EN → "명소 | 부산에가면 | Visit Busan 釜山広域市"  (정상 케이스도 동일)
```

즉 EN 페이지의 `<title>` 태그는 KO 페이지와 동일한 한국어 카테고리 포맷입니다. 영문 콘텐츠명이 포함되지 않습니다.

---

## 2. GPT 프롬프트 검증

### 수정 1: `extractWebsiteUrl()` — ✓ 검증 통과

라벨 없으면 빈 문자열, fallback 제거 — 올바른 방향입니다. 코드 수정 방향:

```javascript
function extractWebsiteUrl(html) {
  if (!html) return '';
  const re = /<li[^>]*>\s*<p[^>]*>(?:홈페이지|Homepage|Website|Official)[^<]*<\/p>\s*<span[^>]*>([\s\S]*?)<\/span>/i;
  const m = html.match(re);
  if (!m) return '';   // 라벨 없으면 즉시 반환 (fallback 없음)
  const hrefM = m[1].match(/href=["']?(https?:\/\/[^"'\s>]{5,})["']?/i);
  if (hrefM) return hrefM[1];
  const urlM = m[1].match(/https?:\/\/[^\s"'<>]{5,}/);
  return urlM ? urlM[0].replace(/['">\s]+$/, '') : '';
}
```

**추가 권장:** 도메인 차단 목록으로 2차 방어

```javascript
const BLOCKED_DOMAINS = ['busan.go.kr/vprivacy', 'visitbusan.net', 'busan.go.kr/index'];
if (BLOCKED_DOMAINS.some(d => url.includes(d))) return '';
```

---

### 수정 2: UI 문구 제목 차단 — ✓ 검증 통과 (단 추가 고려 필요)

GPT 제안은 올바릅니다. 단, **uc_seq=2566에 대한 중요한 사실이 진단에서 드러났습니다.**

#### uc_seq=2566 실제 상황

```
KO 페이지 HTML 결과:
  var mtTitle: undefined          ← 변수 자체가 없음
  p-txt comment: undefined        ← 없음
  모든 추출 경로: 비어 있음
  현재 title: "상세보기" (목록 링크 텍스트에서 폴백된 값)
```

"상세보기" UI 텍스트를 필터하면 `title_ko = ""` (공백)이 됩니다.  
→ **이 경우 HARD STOP(title_ko 공백 ≥ 1건)이 발동합니다.**

이 콘텐츠의 실제 제목은 Vue.js 클라이언트 렌더링으로만 확인 가능합니다. 서버사이드 HTML에는 제목이 없습니다.

**처리 방침 결정이 필요합니다 (GPT 프롬프트에 명시 없음):**

| 방식 | 장점 | 단점 |
|---|---|---|
| A: 수집 제외 | HARD STOP 회피, 데이터 오염 없음 | 일부 콘텐츠 누락 |
| B: `parse_status=vue_title_only`로 저장, HARD STOP 별도 처리 | 누락 추적 가능 | HARD STOP 로직 수정 필요 |
| C: Playwright로 실제 제목 수집 | 완전한 데이터 | 복잡도·속도 비용 큼 |

GPT 프롬프트가 선택하지 않은 결정입니다. 실행 전에 방침이 확정돼야 합니다.

---

### 수정 3: EN 제목 추출 순서 보완 — ❌ 수정 필요

**GPT 제안 순서:**
```
var mtTitle → h1/h2 → og:title → <title> 세그먼트 필터
```

**진단 결과:**

| 방법 | EN 2678 (정상) | EN 2763 (누락) | EN 2753 (누락) | 사용 가능 |
|---|---|---|---|---|
| `var mtTitle` | ✓ 영문 제목 | undefined | undefined | ✓ (가장 신뢰) |
| h1/h2 | **없음** | **없음** | **없음** | ✗ |
| og:title | **undefined** | **undefined** | **undefined** | ✗ |
| `<title>` 세그먼트 | "명소\|부산에가면..." (KO) | "체험·해양·웰니스..." (KO) | "명소\|부산에가면..." (KO) | ✗ |
| p-txt HTML 주석 | ✓ "The Little Prince House" | **undefined** | **undefined** | △ (있을 때만) |

**결론:**

> VisitBusan EN 페이지에서 h1/h2, og:title, `<title>` 태그는 콘텐츠명을 담지 않습니다.  
> `var mtTitle`과 p-txt HTML 주석만 신뢰 가능한 소스입니다.  
> EN 페이지의 `<title>` 태그는 **한국어 카테고리 라벨**을 포함하며, 세그먼트 필터로 추출하면 잘못된 한국어 값이 반환됩니다.

**올바른 EN 제목 추출 순서:**

```
1. var mtTitle = "..." (영문 문자열)
2. <!--<div class="p-txt">name</div>--> HTML 주석
3. 위 모두 없으면 → 빈 문자열, language_available=false
```

---

### `source_detail_url` / `external_official_url` 분리 — ✓ 검증 통과

현재 `website` 컬럼명을 `external_official_url`로 변경하고 `source_detail_url`은 그대로 유지하는 방향은 올바릅니다. CSV 스키마 변경으로 처리합니다.

---

## 3. 검증 항목별 종합

| GPT 프롬프트 항목 | 판정 | 비고 |
|---|---|---|
| `extractWebsiteUrl()` fallback 제거 | ✓ 실행 가능 | 도메인 차단 목록 추가 권장 |
| UI 문구 필터 ("상세보기" 등) | △ 실행 가능 (단) | uc_seq=2566 처리 방침 미결정 |
| EN 제목: `var mtTitle` 우선 | ✓ | |
| EN 제목: h1/h2 | ✗ **존재하지 않음** | 진단 확인 |
| EN 제목: og:title | ✗ **undefined** | 진단 확인 |
| EN 제목: `<title>` 세그먼트 | ✗ **한국어 라벨 반환** | EN 페이지도 KO `<title>` 포맷 |
| EN 제목: p-txt 주석 보완 | ✓ 추가 필요 | 2678 케이스에서 확인 |
| language_available=false | ✓ 올바른 방향 | |
| KO→EN 복사 금지 | ✓ | |
| source_detail_url / external_official_url 분리 | ✓ | |

---

## 4. 수정된 PARSER-FIX-02A 실행 방침

GPT 프롬프트 실행을 위해 다음 2개 사항이 먼저 결정·반영돼야 합니다.

### 결정 필요 1: uc_seq=2566 처리 방침

**권장:** 방식 B — `parse_status=vue_title_only`로 수집하되, HARD STOP 조건에서 제외
- 수집은 하되 title_ko="" 허용
- `parse_status=vue_title_only`로 표시
- HARD STOP 체크 대상에서 제외 (`title_blank_count`에서 제외)
- 별도 `vue_title_only_count` 메트릭으로 보고

### 결정 필요 2: EN 제목 추출 순서 (h1/h2, og:title, title 태그 제거)

GPT 프롬프트의 EN 제목 추출 순서를 다음으로 교체:

```javascript
// EN 제목 추출 (VisitBusan EN 페이지 특성에 맞춤)
function extractEnTitle(html) {
  if (!html) return '';
  // 1. var mtTitle (영문 버전이면 영문 값)
  let m = html.match(/var\s+mtTitle\s*=\s*["']([^"']{2,80})["']/i);
  if (m) return m[1].replace(/&amp;/g, '&').trim();
  // 2. p-txt HTML 주석 (영문 버전이면 영문 값)
  m = html.match(/<!--\s*<div[^>]*class=["'][^"']*p-txt[^"']*["'][^>]*>([^<]{2,80})<\/div>\s*-->/i);
  if (m) return m[1].replace(/&amp;/g, '&').trim();
  // h1/h2: VisitBusan EN 페이지에 콘텐츠명 h1/h2 없음 — 사용 안 함
  // og:title: VisitBusan EN 페이지에서 undefined — 사용 안 함
  // <title>: EN 페이지도 한국어 카테고리 포맷 — 사용 안 함
  return '';
}
```

---

## 5. PASS 조건 수정 권장

GPT PASS 조건 중 다음을 수정:

| 원래 PASS 조건 | 수정안 |
|---|---|
| KO 유효 제목 누락 0 | KO 유효 제목 누락 0 (vue_title_only 제외) |
| EN 허위 fallback 0 | EN 허위 fallback 0 (`<title>` KO 카테고리 라벨 포함 차단 확인) |

---

## 6. 결론

GPT 프롬프트의 수정 1(website), 수정 2(UI 필터), 필드 분리는 올바른 방향이며 실행 가능합니다.  
**수정 3(EN 제목 추출 순서)은 VisitBusan 실제 HTML 구조와 불일치합니다.** h1/h2·og:title·`<title>` 세그먼트 방법은 모두 적용 불가합니다.

위 2개 결정 사항을 반영한 수정된 프롬프트로 실행하면 됩니다.

---

**다음 단계:** uc_seq=2566 처리 방침 확정 후 PARSER-FIX-02A 수정 버전 실행
