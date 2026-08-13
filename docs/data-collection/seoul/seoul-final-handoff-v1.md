# 서울 데이터 수집 최종 인수인계 v1

| 항목 | 값 |
|---|---|
| 버전 | v1 |
| 작성일 | 2026-08-13 |
| 작성 TASK | TASK-SEOUL-FINAL-HANDOFF-V1 |
| Branch | data/seoul-collection-v1 |
| Final commit | **a070926** |
| DB 변경 | 0 |
| 수신 대상 | Main 개발팀 (운영 반영 판단용) |

---

## ⚠️ 상위 문서 병행 확인 필수

이 문서는 서울 전용 인수인계이다. 아래 SSOT 문서를 병행 확인한다.

| SSOT 문서 | 용도 |
|---|---|
| `docs/data-collection/multicity-main-data-handoff-v1.md` | 전 도시 공통 Main 요구사항 |
| `docs/data-collection/multicity-place-eligibility-policy-v1.md` | Place 5축 eligibility 정책 (원문 우선) |
| `docs/data-collection/multicity-event-freshness-policy-v1.md` | Event freshness·refresh 정책 (원문 우선) |
| `docs/data-collection/multicity-food-discovery-collection-policy-v1.md` | Food 수집 정책 |

---

## SECTION 1 — 서울 전체 수집 완료 상태

```
SEOUL_FOOD_STATUS         = COMPLETE
SEOUL_NONFOOD_STATUS      = COMPLETE
SEOUL_TOTAL_UNIVERSE      = 3,765
SEOUL_UNRESOLVED          = 0
FINAL_QA                  = PASS
MAIN_HANDOFF_READY        = YES

VISITSEOUL_SOURCE         = PRIMARY_AND_SUFFICIENT
KTO_SEOUL_EXECUTION_TARGET = 0
SEOUL_FOOD_EXECUTION_TARGET = 0

API_CALLS                 = 0  (QA·인수인계 단계)
PRODUCTION_WRITE          = 0
MASTER_WRITE              = 0
DB_WRITE                  = 0
```

서울은 **재수집·재오픈 없이 반영 판단 가능한 완료 상태**이다.

---

## SECTION 2 — Food / non-Food 상태

### 2.1 Food

| 지표 | 값 |
|---|---|
| 수집 정책 | Food Discovery V1 (`multicity-food-discovery-collection-policy-v1.md`) |
| 레스토랑 전체 대상 | 1,259건 (RESTAURANT_TRACK, routing=A) |
| 위치 좌표 커버리지 | 1,259/1,259 (100%) |
| 주소 커버리지 | 1,258/1,259 (99.9%) |
| 영업시간 커버리지 | 1,243/1,259 (98.7%) |
| 전화번호 커버리지 | 1,222/1,259 (97.1%) |
| 대표 메뉴 커버리지 | 864/1,259 (68.6%) |
| 할랄 인증 (공식 기준) | 94/1,259 |
| POOL SHA256 | `4ECE54CC01D67B0E9AE1794D16D3EBB8C6B39B4C7A4FAFC33715C3168420BD39` |
| 상태 | **COMPLETE** — 재수집 금지 |

**VisitSeoul 레스토랑 API 제한**: `addr/mapx/mapy/opentime` 레스토랑 응답에 없음 확인됨.
좌표·영업시간은 KTO enrichment로 보완 완료. KTO 추가 bulk 수집 불필요.

```
MICHELIN_SEOUL = 0 (FINAL — 외부 연동 별도 판단)
KTO_MATCHABLE  = 0 (key 불일치)
RESTAURANT_ATTRIBUTE_AI_INFERENCE = FORBIDDEN
```

### 2.2 non-Food

| 지표 | 값 |
|---|---|
| 전체 대상 (Batch 2 manifest) | 573건 (+ special 2건 = 575건) |
| PLACE_AI_OR_EXPLORE_ELIGIBLE | **560건** |
| PLACE_SEARCHABLE_USER_PICK | **14건** |
| MULTI_LOCATION_NON_PLACE | **1건** (KOPc3g5o6 — 서울, 세계와 노래하다, 3개 장소 복수 주소) |
| 기존 raw 재사용 | 9건 (EXISTING_RAW_REUSED_EXACT) |
| 신규 API 호출 | 564건 (100% 성공) |
| UNRESOLVED | 0 |
| Final QA | **PASS** (a070926) |
| 상태 | **COMPLETE** |

---

## SECTION 3 — Source 및 수집일

| 소스 | 역할 | 상태 |
|---|---|---|
| VisitSeoul API (`api-call.visitseoul.net`) | 전 항목 1차 소스 | PRIMARY_AND_SUFFICIENT |
| KTO TourAPI | 레스토랑 좌표·영업시간 보완 | 완료, 추가 수집 불필요 |
| 열린데이터광장 OA-15486 | Event 보완 소스 | 미접근 — 실제 gap 발견 시 Main 판단 |

| 수집 단계 | 수집일 | Commit |
|---|---|---|
| Full inventory list | 2026-05 ~ 2026-07 | a3b599c |
| Place Core + Experience detail | 2026-07 | 1448aca |
| Event sync R1 | 2026-08-11 | 5263084 |
| non-Food Batch 2 (573건) | 2026-08-12 | 15a29de |
| Food V1 R1 enrichment | 2026-08-07 | 64b4cf5 |
| Final QA + text cleanup | 2026-08-13 | **a070926** |

---

## SECTION 4 — 최종 Artifact / Manifest 경로

| 파일 | 설명 | 비고 |
|---|---|---|
| `data/seoul-source-audit/seoul-nonfood-batch2-detail-normalized-v1.jsonl` | non-Food 573건 정규화 (Final) | 2,116 KB |
| `data/seoul-source-audit/seoul-nonfood-batch2-detail-raw-v1.jsonl` | non-Food raw 응답 (564건) | 5,108 KB |
| `data/seoul-source-audit/seoul-nonfood-batch2-detail-attempts-v1.jsonl` | 호출 시도 로그 (566건) | |
| `data/seoul-source-audit/seoul-nonfood-batch2-eligibility-manifest-v1.json` | 573건 eligibility (Explore/AI/Searchable) | |
| `data/seoul-source-audit/seoul-nonfood-final-qa-r1-report.json` | Final QA PASS 보고서 | a070926 |
| `data/seoul-source-audit/seoul-nonfood-nightly-qa-r1-report.json` | Nightly safe QA 보고서 | |
| `data/seoul-source-audit/seoul-nonfood-nightly-qa-r1-anomalies.json` | 이상치 상세 (28 KB) | |
| `data/seoul-source-audit/seoul-nonfood-active-event-manifest-v1.json` | Active Event 6건 (서비스 풀) | |
| `data/seoul-source-audit/seoul-nonfood-batch1-eligibility-assessment-v1.json` | Batch 1 recovery 38건 | |
| `data/seoul-source-audit/seoul-nonfood-batch2-special2-v1.jsonl` | Special 2건 (KOPc3g5o6, KOPgdf9ry) | |
| `scripts/run-seoul-nonfood-final-qa-r1.py` | Final QA 스크립트 | 재실행 가능 |

---

## SECTION 5 — Exact Counts

### 5.1 전체 Universe (routing v2, 3,765건)

| Track | 건수 |
|---|---|
| RESTAURANT_TRACK | 1,259 |
| EVENT_TRACK | 1,190 |
| PLACE_CONDITIONAL_REVIEW | 577 |
| PLACE_CORE_CANDIDATE | 316 |
| SHOPPING_REVIEW | 262 |
| EXPERIENCE_CANDIDATE | 120 |
| GENERAL_ACCOMMODATION_EXCLUDE | 17 |
| TEMPLE_STAY_CANDIDATE | 2 |
| UNRESOLVED_CATEGORY | **0** |
| **합계** | **3,765** |

### 5.2 non-Food 반영 분류 (최종)

| 분류 | 건수 | 비고 |
|---|---|---|
| PLACE_AI_OR_EXPLORE_ELIGIBLE | **560** | Explore/AI 대상 핵심 장소 |
| PLACE_SEARCHABLE_USER_PICK | **14** | 검색/사용자 선택 (Explore·AI 제외) |
| MULTI_LOCATION_NON_PLACE | **1** | KOPc3g5o6 — 단일 Place 생성 금지 |
| EXISTING_RAW_REUSED | 9 | place-core 기수집 재활용 |
| **Batch 2 합계** | **575 (573+special 2)** | |

### 5.3 non-Food Eligibility 분포 (573건 manifest 기준)

| 축 | YES | CONDITIONAL | NO |
|---|---|---|---|
| EXPLORE | 544 | 15 | 14 |
| AI_ITINERARY | 417 | 129 | 27 |

### 5.4 Event

| 지표 | 값 |
|---|---|
| ACTIVE_EVENT_SERVICE_POOL | **6** |
| ACTIVE_EVENT_D_ROUTING (EVENT_TRACK) | 4 |
| ACTIVE_EVENT_PLACE_ROUTING (PLACE_DETAIL_TARGET 내) | 2 |
| INACTIVE_OR_HISTORICAL_EVENT | ~1,186 (archive — 서비스 제외) |
| HISTORICAL_BULK_EVENT_DETAIL_TARGET | 0 |

---

## SECTION 6 — Place Eligibility 정책

> 원문 SSOT: `docs/data-collection/multicity-place-eligibility-policy-v1.md`
> 아래는 Main 반영 시 필수 이해 요약이다. **원문이 이 요약보다 우선한다.**

### 5축 정의

| Axis | 값 | 의미 |
|---|---|---|
| SEARCHABLE | YES / NO | 검색 결과 노출, 상세 접근, 저장/선택 후보 |
| EXPLORE_ELIGIBLE | YES / CONDITIONAL / NO | Explore 섹션 노출 적합성 |
| AI_ITINERARY_ELIGIBLE | YES / CONDITIONAL / NO | AI 자동 일정 포함 적합성 |
| USER_CAN_SELECT | YES / NO | 사용자 직접 Selected 추가 가능 |
| USER_CAN_SAVE | YES / NO | 사용자 저장(위시리스트) 가능 |

### 핵심 원칙 (Main 반드시 적용)

```
1. DATA PRESENCE ≠ AI RECOMMENDATION ELIGIBILITY
   - city_spots 존재 ≠ AI 자동 추천 허가

2. SEARCH VALUE ≠ ITINERARY VALUE
   - SEARCHABLE과 AI_ITINERARY_ELIGIBLE 은 독립 판단

3. COMMERCIAL → 자동 SEARCHABLE 제외 금지
   - 여행자가 실제 찾는 상업시설(K-beauty flagship, 전통시장,
     K-pop 체험공간 등)은 검색·저장 가치 유지

4. AI_ITINERARY=NO ≠ 검색/선택 불가
   - AI 자동 일정 제외 장소도 사용자 직접 선택 가능

5. USER PICKED > AI AUTO RECOMMENDATION FILTER
   - 사용자가 선택한 장소는 AI_ITINERARY=NO여도 일정 포함

6. 5축을 단일 "관광지 여부" boolean으로 축소 금지
   - SEARCHABLE=YES이나 AI_ITINERARY=NO인 장소가 14건 존재
```

### Main 반영 시 주의

- `PLACE_SEARCHABLE_USER_PICK` 14건: SEARCHABLE=YES지만 Explore·AI 기본 제외. 검색/저장/선택은 허용.
- `MULTI_LOCATION_NON_PLACE` 1건(KOPc3g5o6): 단일 city_spots record 생성 금지. 3개 장소 개별 처리 또는 제외.
- AI 필터 실제 구현은 Main 코드에서 별도 확인 필요 (`CURRENT_MAIN_AI_FILTER = NOT_VERIFIED_IN_AUXILIARY`).

---

## SECTION 7 — Event Freshness 정책 + Active 6건

> 원문 SSOT: `docs/data-collection/multicity-event-freshness-policy-v1.md`

### 7.1 정책 핵심

```
PRODUCT_ROLE           = AI_TRAVEL_SCHEDULER (이벤트 아카이브 아님)
EVENT_POOL_GATE        = ONGOING 또는 날짜 확정 UPCOMING만 진입
REFRESH_CYCLE          = 7일 (전체 재수집, 증분 아님)
NEXT_REFRESH           = 2026-08-18 이후
SOURCE_UPDATED_AT_AS_DATE = FORBIDDEN (updt_dt_text ≠ event date)
HISTORICAL_BULK_DETAIL_CALLS = 0

과거 Event / 날짜 없는 Event / 미확정 recurring Event
→ SERVICE_EVENT_POOL 제외
```

### 7.2 Active Event 6건 (서비스 풀, 2026-08-13 기준)

| CID | 제목 | 기간 | 장소 | Provenance |
|---|---|---|---|---|
| KOPsj8gga | 조선 양반 접객 문화 체험 공연 '옹기콘서트' | 2026-07-02 ~ 2026-12-10 | 동대문종합시장 신관 9층 광무대 | OFFICIAL_VISIT_OR_PUBLIC_PAGE |
| KOPnkfasx | 연희 상설 공연 〈연희판판〉 | 2026-04-04 ~ 2026-10-31 | 국립국악원 연희마당 | OFFICIAL_VISIT_OR_PUBLIC_PAGE |
| KOPd5mmfg | 2026 서울시 태권도 공연 | 2026-05-09 ~ 2026-10-18 | 남산골한옥마을 및 DDP | ORGANIZER_DIRECT |
| KOP47mbp7 | 2026 서울국제정원박람회 | 2026-05-01 ~ 2026-10-27 | 서울숲 일대 & 매헌시민의숲 | ORGANIZER_DIRECT |
| KOPw5jg9e | 2026 남산골 전통체험 : 예술가의 시간 | 2026-04-03 ~ 2026-10-25 | 남산골한옥마을 프로그램별 상이 | ORGANIZER_DIRECT |
| KOPvro3vg | 2026 서울야외도서관 | 2026-04-23 ~ 2026-11-01 | 서울광장·광화문광장·청계천 | ORGANIZER_DIRECT |

**Routing 구분**:
- `KOPsj8gga`, `KOPnkfasx`: PLACE_DETAIL_TARGET(573) 내 포함 (상설 공연 venue)
- `KOPd5mmfg`, `KOP47mbp7`, `KOPw5jg9e`, `KOPvro3vg`: EVENT_TRACK D-routing (별도 풀)

### 7.3 Event 금지 사항

```
- 과거 1,190건 bulk archive를 향후 실행 target으로 재사용 금지
- 과거 1,032 / 1,152 숫자를 active target으로 오인 금지
- 날짜 없는 Event의 가능성 기반 detail API 호출 금지
- updt_dt_text를 event 날짜나 discovery hard gate로 사용 금지
```

### 7.4 AI 런타임 gate

서비스 시 Event는 pool 진입 여부와 별개로 **여행자 여행 기간 ∩ event 기간 ≠ ∅** 조건을 런타임 재검사한다. pool에 있어도 날짜가 안 겹치면 AI 일정에 포함하지 않는다.

---

## SECTION 8 — Known Non-blocking Notes

### 8.1 인천공항 서울관광정보센터 3건 (→ Section 9 상세)

3건(KOP011863 / KOP024807 / KOP042078)은 현재 `PLACE_AI_OR_EXPLORE_ELIGIBLE`로 분류되어 있으나, `AI_ITINERARY` 분류가 일부 과도하게 설정되어 있다. 다음 eligibility update 사이클에서 정정 권장. 서비스에 즉각적 영향 없음.

### 8.2 html_tag_residue 16건 — 모두 전시/공연 제목 FP

`<DIVINITY>`, `<오징어 게임>` 등 공연·전시 제목에 사용된 angle bracket이 HTML 태그 패턴과 일치하여 검출되었으나, 실제 HTML 잔류물은 없음. 모두 `TITLE_MARKUP_FALSE_POSITIVE`로 검증 완료. 정제 불필요.

### 8.3 KOPij99b4 팔색찬란 — venue 판정 확정

기술 설명 내 `[주최/주관] 문화체육관광부/지역문화진흥원` 슬래시가 복수 장소 신호로 오인되었으나, `addr_slash=0` 확인 — 단일 주소(청와대사랑채). PLACE 분류 정확. 2026년 12월 31일까지 활성 전시. `secondary_routing=['E']`로 이벤트 속성 이미 인식됨.

### 8.4 KOPc3g5o6 서울, 세계와 노래하다

addr에 3개 장소(`남산공원팔각광장 / 여의도한강공원이벤트광장 / 청계천광장`) 명시. `MULTI_LOCATION_NON_PLACE` 정상 분류. 단일 city_spots record 생성 금지.

---

## SECTION 9 — 인천공항 서울관광정보센터 처리 원칙

### 9.1 3건 현황

| CID | 제목 | 좌표 | 현재 분류 |
|---|---|---|---|
| KOP011863 | 인천국제공항 제 1터미널 서울관광정보센터 (동편) | 37.447 / 126.452 | PLACE_AI_OR_EXPLORE_ELIGIBLE |
| KOP024807 | 인천공항 제2여객터미널 관광정보센터 | 37.468 / 126.433 | PLACE_AI_OR_EXPLORE_ELIGIBLE |
| KOP042078 | 인천국제공항 제 1터미널 서울관광정보센터 (서편) | 37.447 / 126.452 | PLACE_AI_OR_EXPLORE_ELIGIBLE |

KOP011863 / KOP042078는 T1 동·서편 — 동일 공항 터미널의 별개 창구. 중복 아님.

### 9.2 제품 원칙 (변경 불가)

```
1. 위치·주소·좌표 = 실제 인천공항 위치 유지 (수정 금지)
   - 서울 관광 목적이라도 물리 위치는 공항임이 사실

2. 공식 터미널/층/입국장 안내 정보가 source에 있으면 보존

3. AI_ITINERARY = NO 권장 (다음 eligibility 사이클에서 정정)
   - 공항 도착 직후 방문하는 안내 시설 = AI 자동 일정 삽입 불적절
   - 현재는 YES/CONDITIONAL 일부 → 정정 권장

4. SEARCHABLE = YES 유지
   - 서울 입국자가 정보 안내소를 검색할 수 있어야 함
   - USER_CAN_SELECT = YES / USER_CAN_SAVE = YES 유지

5. EXPLORE = CONDITIONAL 권장
   - 일반 Explore 기본 노출 불필요, 테마별(공항·안내소) 노출 허용
```

### 9.3 범위 확대 금지

GoKoreaMate는 시설 운영 디렉터리가 아니다.

```
- 서울역 보관함, 특정 게이트 내부 시설 등
  복합시설의 세부 내부 동선을 공통 수집 대상으로 확대하지 않음
- 기준: 관광지·여행에 필요한 위치정보 + 안내 데스크 수준까지만 확실히 제공
- 시설 내부의 자주 변하는 micro-navigation = 해당 운영기관 책임
```

---

## SECTION 10 — Official / Public Source 사용 정책

```
VISITSEOUL = PRIMARY_AND_SUFFICIENT_SOURCE
  - 공식/public source facts 및 허용된 이미지 사용 정책 = 기존 ACTIVE 규칙 유지
  - 권리 검토 반복 불필요

KTO TourAPI = SUPPLEMENTARY (서울 레스토랑 좌표·영업시간 보완 완료)
  - KTO 전체수집 재실행 금지
  - 실제 중요 gap 발견 시 Main 판단으로 targeted 보완만 허용

Naver = FINAL_VERIFICATION_ONLY (phone/영업시간 최종 확인 전용)
  - NAVER_FINAL_VERIFICATION_ONLY = YES
  - Naver 기반 AI 분류·번역 금지

Google Maps / Kakao = FORBIDDEN (검증 목적 사용 금지)

FABRICATED_OFFICIAL_URL = FORBIDDEN
AI_SEMANTIC_CLASSIFICATION = FORBIDDEN
AI_TRANSLATION = FORBIDDEN
RESTAURANT_ATTRIBUTE_AI_INFERENCE = FORBIDDEN
```

이미지 관련 규칙은 `image-curation-rules.md` 유지.

---

## SECTION 11 — Main에서 해야 할 일

```
1. canonical import 여부 결정
   - PLACE_AI_OR_EXPLORE_ELIGIBLE 560건 → city_spots 반영 검토
   - PLACE_SEARCHABLE_USER_PICK 14건 → SEARCHABLE 한정 반영 검토
   - MULTI_LOCATION_NON_PLACE 1건(KOPc3g5o6) → 개별 처리 or 제외

2. city_spots mapping
   - eligibility 5축(SEARCHABLE/EXPLORE/AI_ITINERARY/USER_CAN_SELECT/USER_CAN_SAVE)
     DB column 설계 및 적용
   - 기존 단일 READY boolean → 5축 마이그레이션 전략 수립

3. 중복·entity relation 정리
   - KOP011863 / KOP042078 (T1 동·서편): 별개 창구, 중복 아님 — 개별 record 유지
   - 중복 후보 152건 (Night audit 식별, AUTO_MERGE=0) → 수동 검토 후 결정

4. Explore / Search / AI eligibility 연결
   - normalized JSONL의 eligibility 필드 → DB 반영
   - AI_ITINERARY CONDITIONAL 129건: 사용자 여행 의도 context가 있을 때만 후보

5. 다국어 연결
   - KO_ONLY_RECORDS = 110건 (영어 설명 없음 — HIGH_PRIORITY_LANGUAGE_GAP)
   - HIGH_PRIORITY_LANGUAGE_GAP = 258건 (1개 이상 언어 누락)
   - 다국어 보완 전략은 Main 결정 (AI 번역 = FORBIDDEN)

6. 실제 UI/DB 반영
   - 운영 반영 전 Main 측 별도 검증 필수 (canonical import / entity dedup / eligibility 연결)
   - Active Event 6건 서비스 풀 등록 + 7일 refresh 로직 연결

7. 인천공항 3건 eligibility 정정 (다음 사이클)
   - AI_ITINERARY = NO 로 정정
```

---

## SECTION 12 — Main에서 하면 안 되는 일

```
1. Auxiliary branch에서 직접 작업 금지
   - master merge 금지
   - DB write 금지
   - migration 금지
   - production deploy 금지

2. 서울 데이터 재수집·재오픈 금지
   - SEOUL_FOOD_EXECUTION_TARGET = 0 (재수집 금지)
   - KTO_SEOUL_EXECUTION_TARGET = 0 (KTO 전체 bulk 재수집 금지)
   - VISITSEOUL 재호출 없이 현행 normalized JSONL 사용

3. 과거 Event 수치 오용 금지
   - 1,190 / 1,032 / 1,152 같은 archive 숫자를 active target으로 사용 금지
   - 현재 Active 서비스 풀 = 6건 (7일 주기 refresh)

4. Place eligibility 5축 → 단일 boolean 축소 금지
   - 단일 "관광지 여부" boolean으로 압축하지 않는다
   - AI_ITINERARY=NO인 장소는 Explore·검색·저장 허용될 수 있음

5. MULTI_LOCATION_NON_PLACE(KOPc3g5o6) 단일 record 생성 금지

6. AI 분류·AI 번역·AI 의미 추론으로 필드 채우기 금지
   - RESTAURANT_ATTRIBUTE_AI_INFERENCE = FORBIDDEN
   - AI_SEMANTIC_CLASSIFICATION = FORBIDDEN
   - AI_TRANSLATION = FORBIDDEN

7. 인천공항 3건 좌표·주소 임의 수정 금지
   - 물리 위치 = 인천공항, 이것이 사실이자 올바른 데이터

8. GoKoreaMate 범위를 시설 내부 micro-navigation 디렉터리로 확장 금지
```

---

## SECTION 13 — Freshness / 향후 갱신 기준

### 13.1 Event (7일 주기)

```
REFRESH_CYCLE    = 7일 (전체 재수집, 증분 아님)
NEXT_REFRESH     = 2026-08-18 이후
GATE             = AS_OF 날짜 기준 ONGOING / UPCOMING 재판정
RUNTIME_CHECK    = 여행자 날짜 ∩ event 기간 ≠ ∅ (서비스 시점 재검사)
```

### 13.2 장소 (Place) 변동 정보

```
- 안정적인 사실(coords / 공식 명칭 / category)은 짧은 주기 재수집 불필요
- 변동 가능 정보(영업시간 / 전화번호 / 가격): VisitSeoul source 변경 감지 시 targeted 갱신
- 주기적 점검 = GoKoreaMate가 실제 서비스하는 핵심 여행 정보에 집중
- 운영기관 내부 구조 전체 동기화 금지
```

### 13.3 Food

```
- 식당 기본 정보(위치·이름·카테고리) = 안정적, 짧은 재수집 불필요
- signature_dishes / halal 인증: 실제 gap 발생 시 targeted 보완 (정책 문서 참조)
- SEOUL_FOOD_EXECUTION_TARGET = 0 (재오픈 금지)
```

### 13.4 KTO 보완

```
- 현재 seoul = KTO_SEOUL_EXECUTION_TARGET=0
- VisitSeoul 실제 중요 gap 발견 시 Main 판단으로 targeted 보완만
- KTO 전체 bulk 재수집 = 금지
```

---

## SECTION 14 — Branch / Commit History

| Commit | 설명 | 날짜 |
|---|---|---|
| **a070926** | FINAL — text cleanup PASS, Final QA PASS | 2026-08-13 |
| 98b4be5 | Final QA R1 (HOLD — desc_plain injection 3건) | 2026-08-13 |
| f154637 | Nightly safe QA R1 PASS | 2026-08-12 |
| 15a29de | non-Food Batch 2 collection (575건) | 2026-08-12 |
| 9f3aa47 | non-Food Batch 1 recovery (38건) | 2026-08-12 |
| d753fb7 | Active Event flag + raw dedupe correction | 2026-08-12 |
| b912ce7 | Event accounting correction R1 | 2026-08-12 |
| 5263084 | Event sync R1 (6건 확정) | 2026-08-11 |
| 1448aca | Place Core + Experience detail 311건 | 2026-07~08 |
| 64b4cf5 | Food V1 R1 gapfill (1,259건) | 2026-08-07 |
| 802d163 | Routing V2 correction (blanket rule fix) | 2026-07 |
| 2ca9e09 | Multicity eligibility policy V1 | 2026-08-10 |

Branch: `data/seoul-collection-v1` (push 완료, master merge 금지)

---

## SECTION 15 — 다음 도시 준비 상태

```
SEOUL_COLLECTION_STATUS = COMPLETE
NEXT_CITY_READY         = YES

추천 다음 단계 (Main 승인 후):
  JEJU_SOURCE_STATE_AUDIT 또는 Main이 승인한 다음 정확한 태스크

부산·경주:
  - 부산: enrichment v1 + QA-02 완료 (HEAD 4465278, data/busan-enrichment-v1)
  - 경주: Phone Gate V2 NEAR_COMPLETE (bfcf495), 99.5% phone coverage
  - 부산-경주 gap fill: HERITAGE-FILL-V1 완료 (b4c3b18)
  → 별도 인수인계 문서 참조
```

---

## 최종 플래그

```
TASK_RESULT              = PASS
SEOUL_FOOD_STATUS        = COMPLETE
SEOUL_NONFOOD_STATUS     = COMPLETE
SEOUL_TOTAL_UNIVERSE     = 3765
SEOUL_UNRESOLVED         = 0
ACTIVE_EVENT_SERVICE_POOL = 6
FINAL_QA                 = PASS
MAIN_HANDOFF_READY       = YES
API_CALLS                = 0
DB_WRITE                 = 0
MASTER_WRITE             = 0
PRODUCTION_WRITE         = 0
FINAL_COMMIT             = a070926
```
