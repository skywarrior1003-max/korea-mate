# TASK-DATA-BUSAN-VISITBUSAN-PARSER-FIX-02A-REV 완료 보고서

**날짜:** 2026-07-24
**상태:** **PASS ✓**
**총 요청 수:** 19, **표본:** 19건

---

## 수정 내용

| 수정 | 적용 |
|---|---|
| `extractOfficialUrl()` — fallback 제거, 라벨 없으면 빈 문자열 | ✓ |
| 공통 푸터·개인정보처리방침 URL 차단 (`BLOCKED_URL_PATTERNS`) | ✓ |
| UI 텍스트 차단 ("상세보기" 등) | ✓ |
| uc_seq=2566: `requires_client_render`, 후보 레코드 미생성 | ✓ |
| EN 제목: var mtTitle + p-txt 주석만 (h1/h2·og:title·title 태그 금지) | ✓ |
| EN 공식 제목 없으면 후보 레코드 미생성 (`language_content_unavailable`) | ✓ |
| `source_detail_url` / `external_official_url` 필드 분리 | ✓ |

---

## 회귀 표본 결과

| ID | uc_seq | 언어 | 설명 | 후보생성 | 제목 | external_official_url | parse_status | 결과 |
|---|---|---|---|---|---|---|---|---|
| S1 | 2566 | ko | KO UI텍스트 제목, var mtTitle 없음 | ✗ |  |  | requires_client_render | ✓ PASS |
| S2 | 2678 | ko | KO 정상 — var mtTitle 존재 | ✓ | 감천문화마을에 지어진 어린왕자의 집, 리틀 프린스 하우 |  | ok | ✓ PASS |
| S3 | 2678 | en | EN 정상 — var mtTitle 영문 존재 | ✓ | The Little Prince House in Gam |  | ok | ✓ PASS |
| S4 | 2753 | en | EN title 없음 → 미생성 | ✗ |  |  | language_content_unavailable | ✓ PASS |
| S5 | 2789 | en | EN title 없음 → 미생성 | ✗ |  |  | language_content_unavailable | ✓ PASS |
| S6 | 2784 | en | EN title 없음 → 미생성 | ✗ |  |  | language_content_unavailable | ✓ PASS |
| S7 | 2763 | en | EN title 없음 → 미생성 (EN 주소·전화 있음) | ✗ |  | https://s.klook.com/c/vw7E_2xM | language_content_unavailable | ✓ PASS |
| S8 | 2755 | en | EN title 없음 → 미생성 | ✗ |  |  | language_content_unavailable | ✓ PASS |
| S9 | 2788 | en | EN title 없음 → 미생성 (EN 주소 있음) | ✗ |  |  | language_content_unavailable | ✓ PASS |
| S10 | 2753 | ko | KO 외부 홈페이지 있음 (zigzagartcenter.com) | ✓ | 지그재그아트센터 | https://www.zigzagartcenter.co | ok | ✓ PASS |
| S11 | 2314 | ko | KO 외부 홈페이지 있음 (beomeomuseum.org) | ✓ | 범어사 성보박물관에서 불교문화의 깊이에 빠지다 | http://www.beomeomuseum.org | ok | ✓ PASS |
| S12 | 2678 | ko | KO 홈페이지 없음 (이전에 vprivacy1 오포착) | ✓ | 감천문화마을에 지어진 어린왕자의 집, 리틀 프린스 하우 |  | ok | ✓ PASS |
| S13 | 2612 | ko | KO 홈페이지 없음 | ✓ | 도심 속 호수로 떠나는 산책, 회동수원지 둘레길 |  | ok | ✓ PASS |
| S14 | 2753 | ko | hours 정상 — 명소 운영요일 및 시간 존재 | ✓ | 지그재그아트센터 | https://www.zigzagartcenter.co | ok | ✓ PASS |
| S15 | 2386 | ko | hours 정상 — 음식 운영요일 및 시간 존재 | ✓ | 히떼로스터리 전포점 |  | ok | ✓ PASS |
| S16 | 2670 | ko | hours 정상 — 쇼핑 운영요일 및 시간 존재 | ✓ | 서부산 쇼핑의 중심, 르네시떼 |  | ok | ✓ PASS |
| S17 | 2789 | ko | hours 정상 — 체험 운영시간 라벨 없음 (빈 문자열) | ✓ | 부산의 아침을 함께 달린 따뜻한 하루, 모모스커피와 함 |  | ok | ✓ PASS |
| S18 | 2788 | ko | hours 정상 — 코스 운영시간 라벨 없음 (빈 문자열) | ✓ | 여름을 수놓는 보랏빛 풍경, 2026 제16회 태종대  |  | ok | ✓ PASS |
| S19 | 2753 | ko | image_url 서버사이드 빈 문자열 확인 (Vue 동적 로딩) | ✓ | 지그재그아트센터 | https://www.zigzagartcenter.co | ok | ✓ PASS |

---

## PASS 조건 검사

모든 PASS 조건 충족 ✓

---

## 제외 항목 요약

| 유형 | 건수 | 처리 |
|---|---|---|
| KO `requires_client_render` (vue_title_only) | 1건 | 후보 미생성, 진단 기록 |
| EN `language_content_unavailable` | 6건 | 후보 미생성, 진단 기록 |

---

**판정: PASS ✓**

TASK-DATA-BUSAN-VISITBUSAN-PARSER-FIX-02A-REV 파서 결함 수정 완료.
