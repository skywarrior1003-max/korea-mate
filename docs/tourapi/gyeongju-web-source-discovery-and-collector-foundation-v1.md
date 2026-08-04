# TASK-GYEONGJU-WEB-SOURCE-DISCOVERY-AND-COLLECTOR-FOUNDATION-V1 완료보고서

**Branch:** data/gyeongju-web-collector-foundation-v1
**완료 판정:** `COMPLETE`
**작성일:** 2026-08-04

---

## 1. 작업 개요

| 항목 | 내용 |
|------|------|
| 선행 태스크 | TASK-GYEONGJU-FULL-COLLECTION-PRECONDITIONS-FIX-V1 |
| 선행 판정 | `READY_FOR_GYEONGJU_FULL_COLLECTION_WITH_LIMITATIONS` |
| 이번 태스크 목적 | 웹 소스 URL 경로 확정, 수집기 스크립트 작성, 표본 수집 및 산출물 생성 |

---

## 2. Discovery 결과

### 2-1. gyeongju.go.kr/tour

| content_type | mnu_uid (및 code_uid) | 상태 |
|---|---|---|
| 관광명소 · 보문관광단지권 | 2291+1011 / 총 34건 / 5페이지 | VERIFIED |
| 관광명소 · 경주시내권 | 2292+1012 / 총 44건 / 6페이지 | VERIFIED |
| 관광명소 · 불국사권 | 2293+1015 / 총 12건 / 2페이지 | VERIFIED |
| 관광명소 · 동해권 | 2294+1016 / 총 23건 / 3페이지 | VERIFIED |
| 관광명소 · 남산권 | 2295+1014 / 총 19건 / 3페이지 | VERIFIED |
| 관광명소 · 서악북부권 | 2296+1010 / 총 27건 / 4페이지 | VERIFIED |
| 여행코스 5개 | 2297–2301 / 정적 페이지 | VERIFIED |
| 세계문화유산 | 2275 (메인) + 2349, 2508, 2509, 2510 | DEDICATED_WEB_SOURCE_FOUND |
| 문화관광해설 17개소 | 2262 / 단일 목록 페이지 | VERIFIED |
| 행사·축제 | 2393 / 월별 쿼리 | VERIFIED (2026년 8월 6건) |
| 이달의 추천여행지 | 4185 / 단일 페이지 | VERIFIED |

**관광명소 총계:** 159건 (6개 권역 합산)

### 2-2. 문화관광해설 17개소 경로 확정

mnu_uid=2262 단일 목록 페이지에 17개소 전체 나열.
개별 상세 페이지 없음. 예약 페이지: mnu_uid=2396.
수집 전략: 목록 페이지 1회 fetch → 17개소 배열 포함 단일 레코드로 저장.

### 2-3. 세계유산 전용 웹 경로

`DEDICATED_WEB_SOURCE_FOUND` — mnu_uid=2275 메인 + 구성유산별 sub-pages (2349/2508/2509/2510).
이전 추정 경로(2336–2340 숙박·2357–2359 역사) 모두 해당 없음. 직접 WebFetch로 확정.

### 2-4. visitgyeongju.or.kr

| 항목 | 값 |
|------|-----|
| 목록 페이지 | JS 동적 렌더링 → 직접 수집 불가 |
| 수집 전략 | sitemap.xml hexID 열거 → 언어별 상세 URL 직접 fetch |
| sitemap 총 URL 수 | 1,044 |
| KO 식당 hexID 수 | 84건 |
| KO 기념품 hexID 수 | 8건 |
| 5개 언어 가용 여부 | 전건 HTTP 200 확인 (/kr /en / /jp /zh /tw) |

---

## 3. GJ06 / GJ07 사전검증 결과

| 소스 | 판정 | 근거 |
|------|------|------|
| GJ-06 경주 야간관광 | `VALID_OFFICIAL_SOURCE` | 야간관광지 10개소 실데이터 (운영시간·입장료 기재) |
| GJ-07 경관 조망점 | `VALID_OFFICIAL_SOURCE` | 조망점 10개소 실데이터 (위치·특징 기재) |

두 소스 모두 플레이스홀더 없음. API 키 불필요 (웹 기반).

---

## 4. 수집기 스크립트

### gyeongju_culture_web_collect.py (v1.0.0)

- 대상: attractions / monthly-recommendations / courses / heritage / cultural-guides / events
- SHA-256 스냅샷 추적, --resume 지원, --dry-run 지원
- 표본 수집 결과: attractions 5건, courses 5건, heritage 5건, cultural-guides 1건, events 5건, monthly-recommendations 1건 — 전건 PASS

### visitgyeongju_collect.py (v1.0.0)

- 대상: restaurants / souvenirs (5개 언어)
- sitemap.xml hexID 열거 → 언어별 상세 URL 순차 fetch
- --check-languages 플래그: 표본 5건 5언어 가용 확인
- 표본 수집 결과: restaurants-ko 5건, souvenirs-ko 3건 — 전건 HTTP 200 PASS

---

## 5. 표본 수집 결과

### gyeongju.go.kr (gyeongju_culture_web_collect.py)

| content_type | 수집 건수 | 검증 결과 |
|---|---|---|
| attractions (보문권) | 5 | area_uid 5건 모두 고유, detail_url 포함 |
| monthly-recommendations | 1 | 이달 추천여행지 1페이지 |
| courses | 5 | 코스별 waypoints 4–7개 추출 |
| heritage | 5 | mnu_uid 2275/2349/2508/2509/2510 각 1건 |
| cultural-guides | 1 | 17개소 배열 포함 단일 레코드 |
| events (2026-08) | 5 | con_uid 5건 고유, detail_url 포함 |

### visitgyeongju.or.kr (visitgyeongju_collect.py)

| content_type | locale | 수집 건수 | HTTP 200 | 5개 언어 확인 |
|---|---|---|---|---|
| restaurants | ko | 5 | 5/5 | 전건 HTTP 200 |
| souvenirs | ko | 3 | 3/3 | 전건 HTTP 200 |

---

## 6. visitgyeongju 필터 조정 내역

| 구분 | 건수 |
|------|------|
| raw_filter_options_total | 59 |
| validated_mapping_total | 33 |
| meaning_review_required_total | 1 (비즈니스) |
| search_only_attributes | 25 |
| 합계 검증 | 34 + 25 = 59 ✓ |

비즈니스 속성: 의미 확정 전 자동 정규화 금지.

---

## 7. 알려진 한계 (후속 태스크 처리)

1. **관광지 name_ko**: 목록 링크 텍스트에 주소·전화 혼입 → 전체 수집 시 상세 페이지 h1 추출로 교체
2. **행사 name_ko**: 목록 링크 고정 텍스트 "상세보기" → 전체 수집 시 상세 페이지 title 추출
3. **visitgyeongju title**: OG title이 사이트명 고정 → 전체 수집 시 h1/h2 직접 파싱
4. **비즈니스 필터**: MEANING_REVIEW_REQUIRED → 의미 확정 후 편입

---

## 8. 산출물 목록

| # | 파일 | 상태 |
|---|------|------|
| 1 | scripts/gyeongju_culture_web_collect.py | ✓ |
| 2 | scripts/visitgyeongju_collect.py | ✓ |
| 3 | data/tourapi/contracts/gyeongju/gyeongju-culture-tourism-source-contract-v2.json | ✓ |
| 4 | data/tourapi/contracts/gyeongju/visitgyeongju-source-contract-v2.json | ✓ |
| 5 | data/tourapi/contracts/gyeongju/gyeongju-web-collection-readiness-v1.json | ✓ |
| 6 | data/tourapi/pilot/gyeongju/gyeongju-culture-tourism/collector-sample/ (6개) | ✓ |
| 7 | data/tourapi/pilot/gyeongju/visitgyeongju/collector-sample/ (4개) | ✓ |
| 8 | data/tourapi/validation/gyeongju/gyeongju-web-path-audit-v1.jsonl | ✓ |
| 9 | data/tourapi/validation/gyeongju/visitgyeongju-pagination-language-audit-v1.jsonl | ✓ |
| 10 | data/tourapi/validation/gyeongju/gyeongju-gj06-gj07-preflight-v1.json | ✓ |
| 11 | data/tourapi/reports/gyeongju/gyeongju-web-collector-foundation-summary-v1.json | ✓ |
| 12 | docs/tourapi/gyeongju-web-source-discovery-and-collector-foundation-v1.md | ✓ |
| 13 | data/tourapi/manifests/gyeongju/gyeongju-manifest-v1.json (갱신) | ✓ |

---

## 9. 최종 완료 판정

```
COMPLETE

충족 조건:
✓ gyeongju.go.kr/tour 전 content_type mnu_uid 확정
✓ 문화관광해설 17개소 경로 확정 (mnu_uid=2262, 단일 목록)
✓ 세계유산 전용 웹 경로 확정 (DEDICATED_WEB_SOURCE_FOUND)
✓ visitgyeongju 총 건수 확정 (84 식당 + 8 기념품, sitemap 기반)
✓ 5개 언어 전건 HTTP 200 확인
✓ GJ06/GJ07 VALID_OFFICIAL_SOURCE 확정
✓ 수집기 스크립트 2개 작성 및 표본 수집 PASS
✓ 전체 산출물 13종 완성
✓ robots.txt 준수 (두 사이트 모두 일반 크롤러 허용)
```

작업을 완료했습니다
