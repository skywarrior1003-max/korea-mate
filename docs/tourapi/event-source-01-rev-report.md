# TASK-DATA-BUSAN-EVENT-SOURCE-01-REV — 완료 보고서

**날짜:** 2026-07-24
**태스크:** TASK-DATA-BUSAN-EVENT-SOURCE-01-REV
**상태:** PASS

---

## 1. 검증 결과 (사전 검증 → 실행 결정)

GPT 원안(EVENT-SOURCE-01) 검증 시 발견 사항:

| 항목 | 원안 문제 | REV 반영 |
|---|---|---|
| D1 HOMEPAGE_URL 언어별 분리 | 설계 미정 → 각 언어 raw에 별도 URL 존재 확인 | 언어별 자체 URL → KO fallback → null |
| D2 official_source_name | visitbusan 고정 시 운영 주체 오인 위험 | 필드 제거, official_url_domain만 추출 |
| D3 affiliate_provider | klook/booking.com/viator/kkday 제안 | klook/booking/null 로 제한 |
| M1 구현 방법론 | normBusanFestival 수정만으로 현재 데이터 반영 불가 | 별도 enrichment 스크립트 + batch 수정 분리 |
| possible_stale_event | 원안 미포함 | REV에서 추가 (과거 연도 행사 안전장치) |

---

## 2. 변경 파일

| 파일 | 변경 |
|---|---|
| `scripts/tourapi-busan-event-source.mjs` | **신규** — enrichment 스크립트 |
| `scripts/tourapi-busan-batch.mjs` | **수정** — normBusanFestival 필드 추가 |
| `data/tourapi/candidates/busan/busan-festival-event-source.csv` | **신규** — 184행 (183 records + header) |
| `data/tourapi/reports/busan/busan-festival-event-source-metrics.json` | **신규** |
| `docs/tourapi/event-source-disclaimer.md` | **신규** — 사용자 안내 문구 확정 |

---

## 3. 추가 필드 정의

| 필드 | 타입 | 설명 |
|---|---|---|
| `official_url` | string \| null | 언어별 HOMEPAGE_URL → KO fallback → null |
| `official_url_domain` | string \| null | official_url 도메인 추출 |
| `official_url_fallback_language` | `'ko'` \| null | KO fallback 사용 시 `'ko'` |
| `official_check_required` | boolean | 행사 기본값 `true` |
| `schedule_change_detected` | boolean | diff 기반 venue·event_period_raw 변경 여부 |
| `possible_stale_event` | boolean | event_period_raw 최대 연도 < 현재 연도 |
| `date_review_required` | boolean | possible_stale_event와 동일 조건 |
| `affiliate_url` | null | 향후 수동 입력 |
| `affiliate_provider` | null \| `'klook'` \| `'booking'` | 허용값 외 0건 보장 |

---

## 4. 검증 결과

### 수치 검증

| 항목 | 수치 | 결과 |
|---|---|---|
| festival 건수 | 183 / 183 | ✓ PASS |
| source_key 중복 | 0 | ✓ PASS |
| official_url 자체 | 105건 | ✓ |
| official_url KO fallback | 55건 | ✓ |
| official_url null | 23건 | ✓ |
| official_url 채움률 | 87.4% (160/183) | ✓ |
| official_check_required 전체 true | YES | ✓ PASS |
| affiliate_provider 허용값 외 | 0건 | ✓ PASS |
| possible_stale_event | 96건 (52%) | ✓ |
| date_review_required | 96건 | ✓ |
| schedule_change_detected=true | 0건 (baseline) | ✓ PASS |
| Synthetic test (FestivalService:71:ko) | PASS | ✓ PASS |
| canonical 1,356건 미수정 | YES | ✓ PASS |
| 비밀값 노출 | 0 | ✓ PASS |

### 언어별 official_url 채움률

| 언어 | 수집 건수 | 자체 URL | KO fallback | null |
|---|---|---|---|---|
| KO | 40 | 34 | 0 | 6 |
| EN | 37 | 19 | 16 | 2 |
| JA | 35 | 17 | 14 | 4 |
| ZhS | 35 | 17 | 14 | 4 |
| ZhT | 36 | 18 | 11 | 7 |

KO URL 채움률 85% (34/40). EN 이하는 KO fallback 포함 시 크게 개선.

---

## 5. 표본 확인

### official_url 언어별 표본 (UC_SEQ:71 부산바다축제)

| 언어 | official_url | fallback |
|---|---|---|
| KO | http://www.bfo.or.kr/festival_sea/info/01.asp?MENUDIV=1 | - |
| EN | http://www.bfo.or.kr/festival_Eng/info/01.asp?MENUDIV=1&Fcode=SEAFESTIVAL | - (자체 EN URL) |
| JA | http://www.bfo.or.kr/festival_Eng/info/01.asp?MENUDIV=1&Fcode=SEAFESTIVAL | - (JA raw에 EN URL 제공) |
| ZhS | http://www.bfo.or.kr/festival_Eng/info/01.asp?MENUDIV=1&Fcode=SEAFESTIVAL | - |
| ZhT | http://www.bfo.or.kr/festival_Eng/info/01.asp?MENUDIV=1&Fcode=SEAFESTIVAL | - |

### possible_stale_event 표본 (KO 기준)

| source_id | 행사명 | event_period_raw | stale 여부 |
|---|---|---|---|
| 71 | 부산바다축제 | "2025. 8. 1. ~ 8. 3." | ✓ |
| 253 | 수국축제 | "2025. 7. 5.(토) ~ 7. 13.(일)" | ✓ |
| 331 | 낙동강구포나루축제 | "2025. 9. 26.(금) ~ 2025. 9. 28.(일)" | ✓ |
| 395 | 부산불꽃축제 | "2025.11.15.(토)매년 11월" | ✓ |

---

## 6. 주요 발견

### possible_stale_event 52% (96/183건)

API에 수록된 행사 중 절반 이상이 2025년 기간 정보를 포함. 2026년 현재 기준으로 과거 행사일 가능성이 있으나, **종료 확정이 아님** — 주최자가 매년 반복 개최하는 행사(부산바다축제, 불꽃축제 등)는 2025 기간 정보 그대로이더라도 2026년에도 개최될 수 있음.

→ `possible_stale_event=true` + `date_review_required=true`로 **AI 일정 자동 추천 보류** 처리. 사용자에게 공식 사이트 확인 유도.

### JA/ZhS/ZhT → EN URL 패턴

JA·ZhS·ZhT raw는 HOMEPAGE_URL에 언어별 전용 페이지 대신 EN URL을 그대로 제공. 이는 Busan API의 정상 동작. `official_url_fallback_language=null` (raw에서 직접 제공됐으므로 fallback 아님).

### KO 6건 URL null

6개 행사는 KO raw에서도 HOMEPAGE_URL이 빈 값. 이 행사의 비KO 레코드는 KO fallback도 null이 되어 `official_url=null` 상태. 임의 URL 생성 없음.

---

## 7. normBusanFestival 업데이트 (향후 배치 반영)

`tourapi-busan-batch.mjs`의 `normBusanFestival` 함수에 다음 필드 추가:

```javascript
official_url: officialUrl,           // HOMEPAGE_URL
official_url_domain: officialUrlDomain, // hostname
official_check_required: true,
affiliate_url: null,
affiliate_provider: null,
possible_stale_event: possibleStale, // event_period_raw 연도 기반
date_review_required: possibleStale,
```

`official_url_fallback_language`와 `schedule_change_detected`는 배치 시 결정 불가 (언어 간 비교·diff 필요) → enrichment 스크립트에서만 생성.

---

## 8. 사용자 안내 문구 확정

`docs/tourapi/event-source-disclaimer.md`에 확정 수록:

**행사 카드 표준 문구:**
> Event details may change. Please check the official event website before visiting or purchasing tickets.

**카드 요약 문구:**
> Schedule may change. Check the official website before visiting.

**구매 링크 주변:**
> Ticket availability, prices, and event details are determined by the organizer or booking partner.

---

## 9. Git 상태

git add / commit / push 없음. 비밀값 노출 없음. API 호출 없음. 운영 DB 수정 없음.

---

TASK-DATA-BUSAN-EVENT-SOURCE-01-REV 행사 공식 출처·확인 정책 반영 완료.
