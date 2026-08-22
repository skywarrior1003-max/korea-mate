# TASK-SEOUL-DESCRIPTION-LENGTH-AUDIT-V1 — generated audit (READ-ONLY)

- Final seoul canonical rows 1838 · ACTIVE 1837 · intake seoul rows 1837 · enrichment rows 5068 {'en': 1797, 'ja': 1638, 'zh-CN': 1633}
- pins: seoul `e9e9967:data/seoul-final-release/seoul-canonical-places-v1.jsonl` · seoul_ml `e9e9967:data/seoul-multilingual-v1/seoul-multilingual-enrichment-v1.jsonl`
- candidate rule: stripped > 20000 or raw > 100000 or (stripped>5000 and unique_block_ratio<0.6)

## locale ko — `description_ko (canonical)`
- rows 1837 · non-null 1837 · HTML 15 · stripped==intake length 1837/1837
- raw buckets: 0/null: 0, 1-500: 1763, 501-1,000: 58, 1,001-2,000: 14, 2,001-4,000: 2, 4,001-5,000: 0, 5,001-10,000: 0, 10,001-20,000: 0, 20,001-50,000: 0, 50,001-100,000: 0, 100,001+: 0
- stripped buckets: 0/null: 0, 1-500: 1763, 501-1,000: 58, 1,001-2,000: 14, 2,001-4,000: 2, 4,001-5,000: 0, 5,001-10,000: 0, 10,001-20,000: 0, 20,001-50,000: 0, 50,001-100,000: 0, 100,001+: 0
- raw percentiles {'min': 10, 'median': 38, 'p75': 155, 'p90': 367, 'p95': 471, 'p99': 900, 'max': 4000}
- stripped percentiles {'min': 10, 'median': 38, 'p75': 155, 'p90': 367, 'p95': 471, 'p99': 900, 'max': 4000}
- intake percentiles {'min': 10, 'median': 38, 'p75': 155, 'p90': 367, 'p95': 471, 'p99': 900, 'max': 4000}
- raw > {5k,10k,20k,50k,100k}: {5000: 0, 10000: 0, 20000: 0, 50000: 0, 100000: 0} · stripped >: {5000: 0, 10000: 0, 20000: 0, 50000: 0, 100000: 0} · intake >: {5000: 0, 10000: 0, 20000: 0, 50000: 0, 100000: 0}

## locale en — `short_description (enrichment, locale=en)`
- rows 1837 · non-null 1793 · HTML 1793 · stripped==intake length 1793/1793
- raw buckets: 0/null: 0, 1-500: 394, 501-1,000: 406, 1,001-2,000: 344, 2,001-4,000: 321, 4,001-5,000: 32, 5,001-10,000: 51, 10,001-20,000: 153, 20,001-50,000: 85, 50,001-100,000: 6, 100,001+: 1
- stripped buckets: 0/null: 0, 1-500: 695, 501-1,000: 222, 1,001-2,000: 810, 2,001-4,000: 60, 4,001-5,000: 2, 5,001-10,000: 2, 10,001-20,000: 1, 20,001-50,000: 0, 50,001-100,000: 0, 100,001+: 1
- raw percentiles {'min': 226, 'median': 1556, 'p75': 2572, 'p90': 15150, 'p95': 20533, 'p99': 35921, 'max': 556047}
- stripped percentiles {'min': 74, 'median': 935, 'p75': 1321, 'p90': 1641, 'p95': 1897, 'p99': 2768, 'max': 468316}
- intake percentiles {'min': 74, 'median': 935, 'p75': 1321, 'p90': 1641, 'p95': 1897, 'p99': 2768, 'max': 468316}
- raw > {5k,10k,20k,50k,100k}: {5000: 296, 10000: 245, 20000: 92, 50000: 7, 100000: 1} · stripped >: {5000: 4, 10000: 2, 20000: 1, 50000: 1, 100000: 1} · intake >: {5000: 4, 10000: 2, 20000: 1, 50000: 1, 100000: 1}

## locale ja — `short_description (enrichment, locale=ja)`
- rows 1837 · non-null 1638 · HTML 1636 · stripped==intake length 1638/1638
- raw buckets: 0/null: 0, 1-500: 777, 501-1,000: 78, 1,001-2,000: 555, 2,001-4,000: 173, 4,001-5,000: 15, 5,001-10,000: 27, 10,001-20,000: 10, 20,001-50,000: 2, 50,001-100,000: 0, 100,001+: 1
- stripped buckets: 0/null: 0, 1-500: 876, 501-1,000: 331, 1,001-2,000: 427, 2,001-4,000: 3, 4,001-5,000: 0, 5,001-10,000: 0, 10,001-20,000: 0, 20,001-50,000: 0, 50,001-100,000: 0, 100,001+: 1
- raw percentiles {'min': 120, 'median': 680, 'p75': 1688, 'p90': 2320, 'p95': 3157, 'p99': 7492, 'max': 335303}
- stripped percentiles {'min': 34, 'median': 294, 'p75': 1008, 'p90': 1130, 'p95': 1203, 'p99': 1475, 'max': 172339}
- intake percentiles {'min': 34, 'median': 294, 'p75': 1008, 'p90': 1130, 'p95': 1203, 'p99': 1475, 'max': 172339}
- raw > {5k,10k,20k,50k,100k}: {5000: 40, 10000: 13, 20000: 3, 50000: 1, 100000: 1} · stripped >: {5000: 1, 10000: 1, 20000: 1, 50000: 1, 100000: 1} · intake >: {5000: 1, 10000: 1, 20000: 1, 50000: 1, 100000: 1}

## locale zh — `short_description (enrichment, locale=zh)`
- rows 1837 · non-null 1630 · HTML 1630 · stripped==intake length 1630/1630
- raw buckets: 0/null: 0, 1-500: 799, 501-1,000: 52, 1,001-2,000: 557, 2,001-4,000: 176, 4,001-5,000: 19, 5,001-10,000: 21, 10,001-20,000: 5, 20,001-50,000: 0, 50,001-100,000: 0, 100,001+: 1
- stripped buckets: 0/null: 0, 1-500: 880, 501-1,000: 496, 1,001-2,000: 250, 2,001-4,000: 2, 4,001-5,000: 0, 5,001-10,000: 1, 10,001-20,000: 0, 20,001-50,000: 0, 50,001-100,000: 0, 100,001+: 1
- raw percentiles {'min': 103, 'median': 598, 'p75': 1645, 'p90': 2272, 'p95': 3002, 'p99': 6263, 'max': 355505}
- stripped percentiles {'min': 21, 'median': 206, 'p75': 945, 'p90': 1038, 'p95': 1111, 'p99': 1379, 'max': 219181}
- intake percentiles {'min': 21, 'median': 206, 'p75': 945, 'p90': 1038, 'p95': 1111, 'p99': 1379, 'max': 219181}
- raw > {5k,10k,20k,50k,100k}: {5000: 27, 10000: 6, 20000: 1, 50000: 1, 100000: 1} · stripped >: {5000: 2, 10000: 1, 20000: 1, 50000: 1, 100000: 1} · intake >: {5000: 2, 10000: 1, 20000: 1, 50000: 1, 100000: 1}

## classification counts
{"STRUCTURALLY_ABNORMAL": 6}
- abnormal unique places: 3 ['seoul-KOPk4sx8q', 'seoul-KOPpq0clc', 'seoul-KOPrfwk6e']
- normal long (4,001-20,000) examples per locale: {'en': 2, 'ja': 0, 'zh': 0}
- global 4,000 cap impact on en description: {'rows_over_4000': 6, 'rows_over_4000_not_abnormal': 3}

## candidates (short diagnostics only)
| canonical | locale | raw | stripped | intake | html | class | blocks/unique | ratio | top repeat | page markers | struct markers | label lines | head |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| seoul-KOPk4sx8q | en | 556047 | 468316 | 468316 | True | STRUCTURALLY_ABNORMAL | 9217/144 | 0.0156 | 1455 | 0 | 4 | 4850 | \nPerformance Dates: October 6th (FRI) 7:30 pm, October 7th  |
| seoul-KOPk4sx8q | zh | 355505 | 219181 | 219181 | True | STRUCTURALLY_ABNORMAL | 4979/124 | 0.0249 | 237 | 0 | 4 | 0 | \n公演日程 : 10.6.周五 7:30pm, 10.7.周六 3pm\n公演场地 : 国立剧场日升\n语言 : 提供 |
| seoul-KOPk4sx8q | ja | 335303 | 172339 | 172339 | True | STRUCTURALLY_ABNORMAL | 4042/102 | 0.0252 | 564 | 0 | 4 | 0 | _2.0』\r\n公演日程:10.12.(木)～10.13.(金) 8pm/10.14.(土)～10.15.(日) 4p |
| seoul-KOPrfwk6e | en | 29760 | 19467 | 19467 | True | STRUCTURALLY_ABNORMAL | 146/16 | 0.1096 | 14 | 0 | 4 | 0 | \n1. Seoul Future DX-CON WORLD: A specialized exhibition sho |
| seoul-KOPpq0clc | en | 8846 | 6947 | 6947 | True | STRUCTURALLY_ABNORMAL | 35/12 | 0.3429 | 5 | 0 | 4 | 0 | .se-contents .se-scrollbox{overflow-x: auto; -ms-overflow-st |
| seoul-KOPrfwk6e | zh | 11837 | 5477 | 5477 | True | STRUCTURALLY_ABNORMAL | 130/22 | 0.1692 | 13 | 0 | 3 | 0 | \n1.首尔未来DX-CON WORLD：智能信息通信未来技术特色展示会\n2.NEXT-CON 2023：将介绍建筑及 |

## cross-locale stripped length of candidate places
{"seoul-KOPk4sx8q": {"ko": 4000, "en": 468316, "ja": 172339, "zh": 219181}, "seoul-KOPpq0clc": {"ko": 537, "en": 6947, "ja": 1342, "zh": 2459}, "seoul-KOPrfwk6e": {"ko": 718, "en": 19467, "ja": 620, "zh": 5477}}


---

# 정책 분석 (hand-written, 2026-08-22) — DATA_MODIFIED=NO

## 핵심 답
- **장소 수 문제가 아니라 description 내용 문제다.** 서울 ACTIVE 1,837 은 그대로. 장소 삭제 제안 0.
- 비정상 장문은 **unique place 3 / locale row 6** 뿐: `seoul-KOPk4sx8q`(2023 서울국제공연예술제, en·ja·zh 전부), `seoul-KOPrfwk6e`(2023 코리아빌드위크, en·zh), `seoul-KOPpq0clc`(정재일 콘서트, en). 세 건 모두 VisitSeoul 에디터 본문이 **JSON 조각(`{&quot;…&quot;}`)·literal `\n`·알 수 없는 대문자 태그와 함께 같은 블록이 수십~수백 번 반복 직렬화**된 구조 결함(unique block 비율 1.6%~34%). 웹페이지 네비/푸터 혼입 흔적은 0 → 분류 `STRUCTURALLY_ABNORMAL`(반복 포함). "정상적인 긴 관광 설명" 이 아니다.
- 정상 설명의 길이 분포는 매우 좁다: en stripped median 935 · p90 1,641 · p95 1,897 · p99 2,768; 2,001–4,000 자 60행, 4,001 자 초과인데 비정상이 아닌 행 3행(천경자 전시 4,131 · 구홍과 윤기 4,114 는 정상 설명; 리움 미술관 7,168 은 schema.org JSON-LD `<script>` 3블록 약 5.4k 가 strip_html 을 통과해 남은 것으로 실제 설명은 약 1.8k — 아래 script/CSS 누출 항목). ja/zh 는 p99 1,475/1,379. ko 는 Final 에서 4,000 cap.
- **4,000 global cap 은 불필요**(4,000 초과 정상 행이 en 3건뿐이고, 비정상 3건은 4,000 으로 잘라도 반복 조각이 남아 품질이 해결되지 않음).

## 추가 발견 — CSS 누출 (PROPOSED_PARSER_FIX, 미적용)
`strip_html` 은 태그만 지우므로 `<style>…</style>` 안의 CSS 텍스트(`.se-contents .se-scrollbox{overflow-x: auto; …}` 약 778자)가 본문 앞에 그대로 남는다. 영향: en 913행(890행은 stripped 텍스트가 CSS 로 시작) · ja 744 · zh 735 — 서울 설명의 약 절반이 CSS 조각으로 시작한다. 같은 이유로 `<script>`(schema.org JSON-LD 등) 본문도 남는다: en 12 · ja 4 · zh 4 행(리움 미술관 en 이 대표). 이것은 길이 문제와 별개의 **Main parser 결함**이며, 수정은 결정적(`<style>`·`<script>` 블록 제거 후 strip)이고 Final 값을 바꾸지 않는다(Final 은 HTML 그대로). 이번 TASK 에서는 수정하지 않고 제안만 한다.

## 옵션 비교
| 옵션 | 내용 | 장점 | 단점 | 판단 |
|---|---|---|---|---|
| A global hard cap 4,000 | 모든 description 4,000 자 제한 | 단순 | 비정상 3건은 반복 조각이 4,000 안에도 남아 해결 안 됨 · 정상 3건 훼손 · 문제의 원인(구조 결함·CSS 누출) 미해결 | 비추천 |
| B abnormal-only | 구조 규칙(JSON 조각 + 반복 비율 < 0.6 + 길이 > 5,000)으로 판정된 행만 처리 | 정상 1,834 장소 불변 · 영향 3 장소 6 행 | 처리 방식(아래) Owner 결정 필요 | **추천** |
| C display/storage 분리 | raw 는 provenance 에 보존, 표시용만 제한 | 원본 보존 | 현재 schema 에 raw 본문 컬럼 없음 · `content_meta`/deferred sidecar 에 468k 를 넣는 것도 비용 · 새 저장 구조 필요 | 지금은 비추천(B 로 충분) |

## 추천 정책 (Owner 승인 전 미실행)
1. **규칙(혼합: 구조 기반 + 길이 게이트)**: `stripped > 5,000` AND (`{&quot;`/`&quot;}` JSON 조각 존재 OR unique block ratio < 0.6) → ABNORMAL. 단순 길이만으로는 판정하지 않는다. 현재 artifact 에서 이 규칙의 적중 = 정확히 위 3 장소 6 행, 오탐 0.
2. **ABNORMAL 행 처리 방식 후보**(둘 중 하나를 Owner 가 선택):
   - 방식 4(권장): 반복 전 **첫 unique 블록 집합**만 사용 — KOPk4sx8q en 의 unique 텍스트는 8,579자(144 블록: 공연 프로그램 목록), ja 10,348, zh 11,182; KOPrfwk6e en 1,728; KOPpq0clc en 2,955. 즉 "반복 제거" 만으로 정보 손실 0 에 가깝게 정상화된다(결정적, AI 0).
   - 방식 3: 첫 content block(프로그램 목록 전) 까지만 — KOPk4sx8q 는 본문 전체가 프로그램 목록이라 빈 값에 가까워짐 → 비권장.
   - 둘 다 적용 전 Owner 승인. 적용 위치는 Main intake 빌더(Final HTML 은 불변).
3. **CSS 누출 parser fix** 를 같은 correction 단계에서 함께(영향 ~2,400 locale 행, 값은 CSS 접두 제거뿐).
4. 사용자 손실: 정상 1,834 장소 0. ABNORMAL 3 장소는 반복 제거 후에도 공식 프로그램 정보 전부 유지(손실 ≈ 0). global cap 를 택했다면 정상 3건(리움 등)의 꼬리 설명이 잘렸을 것.

## 실행하지 않은 것
Final/intake 수정 0 · truncate 0 · AI 요약/번역 0 · 웹 재조사 0 · 경주/타도시 0 · stage plan 재생성 0 · Production 0.
