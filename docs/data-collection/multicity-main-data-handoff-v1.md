# GoKoreaMate Multicity Data Handoff — MAIN v1

| 항목 | 값 |
|---|---|
| 버전 | v1 |
| 생성일 | 2026-08-10 |
| 생성 TASK | TASK-MULTICITY-ELIGIBILITY-POLICY-CORRECTION-V1 |
| branch | data/seoul-collection-v1 |
| 적용 도시 | 부산·경주·서울·제주·전주·이후 전국 모든 도시 |
| DB 변경 | 0 (정책·인수인계만) |

---

## ⚠️ MAIN CRITICAL — 반드시 읽고 작업 착수

이 문서는 GoKoreaMate 모든 도시 데이터에 공통으로 적용되는
**MAIN 개발자 인수인계 요구사항**이다.

도시별 상세 인수인계(경주, 부산 등)와 **병행** 확인 필요.

### MAIN CRITICAL — Nature/Trekking Travel Value 정책 (2026-08-10 확립)

**AI 일정 생성 시 자연/트레킹 여행 의도 처리에 관한 필수 원칙:**

```
1. PLACE_VALUE ≠ PLACE_BASED_EXPERIENCE_VALUE
   - 야경·계절·활동형 경험은 PLACE entity와 분리 모델링 필요.
   - VisitSeoul은 동일 스키마이나 플랫폼은 구분해야 함.

2. ROUTE entity 분리
   - 서울 둘레길(156.5km, 21코스), 한강 자전거 코스(240km) 등은
     PLACE entity가 아닌 ROUTE entity. 시작점 좌표만으로 대표 불가.

3. EVENT-PLACE 관계
   - 자연 장소에서 발생하는 이벤트(벚꽃축제, 야시장, 눈썰매)는
     별도 CID — hosting_place 참조 연결 필요.

4. 트레킹 루트 상세 데이터 = VisitSeoul에서 미제공
   - 코스별 거리/소요시간/난이도/GPS 트랙 없음.
   - 별도 외부 API(국립공원공단, 서울둘레길) 또는 UGC 필요.

5. 19개 Nature Intent 매트릭스 정의 완료
   - coast = NOT_AVAILABLE_IN_SEOUL (내륙 도시)
   - 정책 문서: docs/data-collection/seoul/seoul-nature-travel-value-policy-v1.md
```

---

## SECTION 1 — Eligibility Policy 핵심 원칙

> `docs/data-collection/multicity-place-eligibility-policy-v1.md` 의 요약.
> 원문이 우선한다.

### RULE 1 — DATA PRESENCE ≠ AI RECOMMENDATION ELIGIBILITY

```
장소가 city_spots에 존재한다
≠
AI 일정이 자동 추천해도 된다
```

- `READY=true` 단독 → AI 후보 불가
- KTO 등재 단독 → AI 후보 불가
- VisitSeoul 공식 콘텐츠 단독 → AI 후보 불가

### RULE 2 — SEARCH VALUE ≠ ITINERARY VALUE

```
SEARCHABLE=YES ≠ AI_ITINERARY_ELIGIBLE=YES
```

검색 노출 가능한 장소가 AI 자동 일정에 포함되어야 한다는 의미가 아니다.

### RULE 3 — COMMERCIAL NOT AUTO-EXCLUDED FROM SEARCH

```
상업시설 = SEARCHABLE=NO (자동 처리 금지)
```

관광형 flagship / 외국인 primary destination은 SEARCHABLE=YES 가능.

### RULE 4 — USER PICKED > AI AUTO FILTER

```
사용자 직접 Selected 추가 → AI_ITINERARY_ELIGIBLE 값과 무관하게 일정 포함 허용
```

---

## SECTION 2 — 5개 Eligibility 축 요약

| Axis | 의미 | 값 |
|---|---|---|
| SEARCHABLE | 검색 surface 노출 가능 | YES / NO |
| EXPLORE_ELIGIBLE | Explore 화면 노출 자격 | YES / CONDITIONAL / NO |
| AI_ITINERARY_ELIGIBLE | AI 자동 일정 후보 자격 | YES / CONDITIONAL / NO |
| USER_CAN_SELECT | 사용자 직접 Selected 추가 | YES / NO |
| USER_CAN_SAVE | 사용자 저장 가능 | YES / NO |

**CONDITIONAL 처리 규칙:**

```
AI_ITINERARY = CONDITIONAL 이면:
  traveler_intent.matches(eligibility_conditions) → AI 후보 포함
  else → 제외
```

---

## SECTION 3 — AI Itinerary 구현 요구사항

### CURRENT_MAIN_AI_FILTER = NOT_VERIFIED_IN_THIS_TASK

현재 MAIN 코드에서 AI 후보 필터링이 어떻게 구현되어 있는지 이 데이터 TASK에서
직접 확인하지 않았다.

**MAIN ACTION REQUIRED:**

1. 실제 AI candidate selection 코드를 검토한다.
2. `READY=true` 또는 `city_spots에 존재` 단독으로 AI 후보가 결정되는 구조인지 실제 코드에서 먼저 확인한다. 만약 그런 구조가 확인된 경우, Travel Value + eligibility + traveler intent + current usability를 반영하도록 개선한다.
3. 현재 구현이 이미 intent-aware하다면 추가 개선 범위는 MAIN이 판단한다.

> **주의 (TASK-SEOUL-TRAVEL-VALUE-POLICY-CORRECTION-AND-DETAIL-GATE-V1 수정)**:
> 데이터 branch에서 MAIN 코드의 실제 AI filtering 구현을 검증하지 않았다.
> CURRENT_MAIN_AI_FILTER = NOT_VERIFIED_IN_THIS_TASK로 유지.

### AI 후보 선정 최소 조건 (전부 통과 필요)

1. `AI_ITINERARY_ELIGIBLE` = YES 또는 CONDITIONAL (→ intent 매칭 필요)
2. verified coordinates (source 확인 좌표)
3. `tourism_relevance` = CONFIRMED
4. identity verified
5. category validity (tourism-relevant category)
6. current/open/usable 상태 (폐업·임시휴장 제외)
7. 사용자 관심사·여행 목적과의 매칭
8. 사용자가 Selected로 명시적으로 추가했는지 (USER PICKED 우선)

### Schema Proposal (MAIN 결정 대상)

> 실제 DB migration은 하지 않는다. MAIN 검토용 제안.

```sql
-- Option B (권장): city_spots 테이블 추가 제안
searchable              BOOLEAN DEFAULT true,
explore_eligible        TEXT CHECK (explore_eligible IN ('YES','CONDITIONAL','NO')) DEFAULT 'YES',
ai_itinerary_eligible   TEXT CHECK (ai_itinerary_eligible IN ('YES','CONDITIONAL','NO')) DEFAULT 'NO',
eligibility_conditions  JSONB DEFAULT '{}'::jsonb,
user_can_select         BOOLEAN DEFAULT true,
user_can_save           BOOLEAN DEFAULT true
```

**MAIN_SCHEMA_CHANGE_REQUIRED = PROPOSAL_ONLY — 최종 schema 결정은 MAIN**

---

## SECTION 4 — 도시별 현황 요약

### 부산 (Busan)

| 항목 | 값 |
|---|---|
| Eligibility 감사 universe | 1,642건 (`busan-enriched-candidates-v1.jsonl`) |
| Canonical places (city_spots 대상) | 1,529건 |
| Canonical events | 4건 |
| Canonical total | 1,533건 |
| 사용자 제외 확정 | 14건 (복구 금지) |
| Restaurant in universe | 721건 |
| Restaurant in canonical | 680건 (41건 hold/exclude) |
| Accommodation in canonical | 82건 (AI=NO 즉시 백필 가능) |

**부산 즉시 백필 가능:**

- Accommodation 82건 → `ai_itinerary_eligible=NO`

**부산 MAIN 결정 필요:**

- Restaurant 분류 (721건 universe / canonical 680건)
- Market tourism threshold (~10건)
- Experience/theme attraction 분류 (~25건)
- 부산 14건 제외 결정 — 복구 절대 금지

**참조 파일 (busan-gyeongju-gap-fill-v1 branch, SHA 8dfdc6d):**

- `data/tourapi/reports/busan/busan-final-place-event-release-manifest.json`
- `data/busan-gap-fill/busan-canonical-count-clarification-v3.json`
- `data/busan-gap-fill/busan-user-excluded-14-v1.jsonl`

---

### 경주 (Gyeongju)

| 항목 | 값 |
|---|---|
| Canonical 전체 | 302건 (`gyeongju-canonical-places-v1.jsonl`, `gyeongju-final-ready-302-v1.jsonl` 양 파일 동일) |
| Service candidates | 300건 (302 - 사용자 제외 2건) |
| Attraction | 200건 |
| Restaurant | 102건 |
| 사용자 제외 (canonical에 포함, 마커 없음) | 2건: 경주생활체육공원, 경주축구공원 |

**⚠️ 중요**: 경주생활체육공원, 경주축구공원은 canonical 302에 **제외 마커 없이 포함**되어 있다.
MAIN은 service 적용 시 이 2건을 **명시적으로 제외** 처리해야 한다 → service candidates = 300건.

**경주 즉시 백필 가능:**

- Heritage attractions 81건 → `ai_itinerary_eligible=YES` (고신뢰)
- Resort-type (attraction 분류된 숙박) ~5~8건 → `ai_itinerary_eligible=NO`

**경주 MAIN 결정 필요:**

- Restaurant 분류 (102건)
- Culture facility 분류 (~9건)
- Resort vs spa/체험 구분 (~8건)

**참조 파일 (busan-gyeongju-gap-fill-v1 branch, SHA 8dfdc6d):**

- `data/gyeongju-final-release/gyeongju-canonical-places-v1.jsonl`
- `data/gyeongju-final-release/gyeongju-canonical-release-summary-v1.json`

**도시별 상세 MAIN 인수인계:**

- `docs/data-collection/gyeongju-main-clean-import-manifest-v1.md` (경주 상세)
- `docs/data-collection/busan-gyeongju-gap-fill-main-handoff-final.md` (부산·경주 gap fill)

---

### 서울 (Seoul)

| 항목 | 값 |
|---|---|
| 수집 현황 | SOURCE-DISCOVERY-V1 완료 (SHA 49f0806) + VISITSEOUL-LIVE-QUALITY-VALIDATION-V1(SHA 7a84ce2) + BENCHMARK-ALIGNMENT-AND-KTO-ID-INTEGRITY-V1 완료 + VISITSEOUL-INVENTORY-COLLECTOR-DRYRUN-V1 완료 + **VISITSEOUL-FULL-INVENTORY-LIST-ONLY-V1 완료** |
| KTO 관광지 | 421건 |
| KTO 문화 | 220건 |
| KTO 쇼핑 | 150건 |
| Bulk 수집 | NOT_STARTED (금지 — 별도 승인 필요) |
| VisitSeoul 총 콘텐츠 | 3,765건 (lang=ko 기준) |
| VisitSeoul API 검증 | 109 calls. Benchmark 32개 CONFIRMED 17(53.1%) / DEGRADED 10 / NOT_IN_VS 4. |
| SSOT | 32개 entity (docs/data-collection/seoul/seoul-tourism-benchmark-v1.json) |
| KTO ID 무결성 | COLLISION 3건(264337/264491), 창덕궁 WRONG_ENTITY, 5건 CANDIDATE_DISCREPANCY. 모두 DEFERRED. |

**서울 Live 검증 핵심 발견:**

- **VisitSeoul primary source 확정**: 고궁·박물관·시장·자연공원·랜드마크 커버리지 확인
- **KTO 병행 필수**: N서울타워·롯데월드서울스카이·SMTOWN·한양도성·숭례문·서울역사박물관 — VisitSeoul 미등록/500오류
- **이벤트 오염 심각**: 경복궁 검색 13번째, 창덕궁 11번째 — 키워드 검색 금지, list inventory + local filter 필요
- **Flagship 탐지 가능**: 올리브영 명동 플래그십만 VS에 등록 (chain 지점 미등록) — FLAGSHIP_DETECTION_FEASIBLE=YES
- **전문매장/상가 FP 32%**: 최근 50건 중 CU 편의점·약국 포함 — USER_REVIEW 필수
- **7개 언어 CID suffix 동일**: 다국어 entity 자동 매핑 가능 (KOP/ENP/JPP/CNP/TCP/RUP/MLP + suffix)
- **Temple Stay 현장 확인**: 국제선센터(양천구 목동) — AI=CONDITIONAL 정책 현장 적용 확인

**서울 SSOT 정렬 원칙 (반드시 준수):**

| 원칙 | 내용 |
|---|---|
| SSOT_BENCHMARK_TOTAL = 32 | 분모는 항상 SSOT 32개 entity. 분할/추가 금지. |
| ONE_SSOT_ONE_BENCHMARK | VS source records가 여러 개여도 benchmark count=1 (창덕궁 예: VS 2건 = benchmark 1건) |
| KTO_IDs_ARE_CANDIDATES | KTO contentId는 후보 — targeted detail 조회 후 title 매칭으로 확정 |
| COLLISION_GATE_MANDATORY | 동일 ID가 다른 entity의 candidate → AUTO_ASSIGN_FORBIDDEN |
| KEYWORD_ZERO ≠ SOURCE_ABSENCE | keyword 0건 → NOT_IN_VS 확정 불가. list inventory로 재확인 필요 |
| COLLECTOR_STRATEGY | list inventory pagination → local category filter → targeted detail (keyword 방식 금지) |

**KTO ID 충돌 현황 (UNRESOLVED — targeted detail DEFERRED):**

| collision_id | entity A | entity B | action |
|---|---|---|---|
| 264337 | 창덕궁 (no.2) | N서울타워 (no.16) | AUTO_ASSIGN_FORBIDDEN — disambiguate 후 확정 |
| 264491 | 인사동 (no.27) | 홍대 (no.30) | AUTO_ASSIGN_FORBIDDEN — disambiguate 후 확정 |

**KTO 후보 ID 불일치 현황 (keyword 검색 결과 기준, targeted detail 필요):**

| 장소 | candidate_id | search_returned | identity_status |
|---|---|---|---|
| 창덕궁 | 264337(COLLISION) | 2923488(창덕궁상품관) | WRONG_ENTITY |
| 창경궁 | 126500 | 126511 | CANDIDATE_DISCREPANCY |
| 덕수궁 | 127000 | 130173 | CANDIDATE_DISCREPANCY |
| 경희궁 | 126998 | 126484 | CANDIDATE_DISCREPANCY |
| 종묘 | 264335 | 126510 | CANDIDATE_DISCREPANCY |
| 북촌 | 264370 | 126537 | CANDIDATE_DISCREPANCY |

**MAIN 결정 필요 (서울 수집 착수 전):**

1. list inventory + local category filter 수집 전략 승인
2. 전문매장/상가 USER_REVIEW 프로세스
3. KTO 병행 수집 범위 확정 (credential 확보 포함)
4. 서울역사박물관 대안 source
5. KTO ID collision 해소 (264337, 264491) — credential 확보 후 targeted detail

**VisitSeoul 수집기 전략 (DRYRUN-V1 검증 완료):**

| 단계 | 내용 |
|---|---|
| 1. Inventory pagination | `contents/list` empty keyword → 전체 3,765건 CID 수집 (76 pages) |
| 2. Local category filter | `com_ctgry_sn` 코드 매핑 → 21개 코드 확인, `CATEGORY_CODE_MAP` 적용 |
| 3. Targeted detail | PLACE_CORE + PLACE_CONDITIONAL만 `contents/info` 호출 |
| 4. Track 분리 보존 | EVENT/RESTAURANT/SHOPPING → 드롭 없이 track별 보존 |
| 5. KTO crosscheck | credential 확보 후 별도 TASK (현재 DEFERRED) |

**Dry-run 결과 요약 (5 pages, 215 records):**

| 지표 | 값 |
|---|---|
| total_count 실측 | 3,765건 (76 pages) |
| 샘플 레코드 | 215건 (0 중복) |
| PLACE_CORE_CANDIDATE | 22건 (10.2%) |
| PLACE_CONDITIONAL_REVIEW | 38건 (17.7%) |
| EVENT_TRACK | 47건 (21.9%) |
| RESTAURANT_TRACK | 35건 (16.3%) |
| multi_lang_list 보유율 | 100% (215/215) |
| 스크립트 | `scripts/run-visitseoul-inventory-collector-v1.py` |
| 설계 문서 | `docs/data-collection/seoul/seoul-visitseoul-inventory-collector-design-v1.md` |
| 실행 결과 | `docs/data-collection/seoul/seoul-visitseoul-inventory-dryrun-summary-v1.md` |

**VisitSeoul Korean LIST Inventory completed (2026-08-10):**

| 지표 | 값 |
|---|---|
| 전체 total_count | **3,765건** (confirmed) |
| 전체 수집 records | **3,765건** |
| unique CIDs | **3,765** (중복 0) |
| pages_success | **76 / 76** |
| DETAIL_CALLS | **0** (list only) |
| TOTAL_API_CALLS | **76** |
| SOURCE_MUTATED | NO |
| PLACE_CORE_CANDIDATE | **316건** (8.4%) |
| PLACE_CONDITIONAL_REVIEW | **577건** (15.3%) |
| RESTAURANT_TRACK | **1,259건** (33.4%) |
| EVENT_TRACK | **1,190건** (31.6%) |
| SHOPPING_REVIEW | **262건** (7.0%) |
| EXPERIENCE_CANDIDATE | **120건** (3.2%) |
| GENERAL_ACCOMMODATION_EXCLUDE | **17건** (0.5%) |
| TEMPLE_STAY_CANDIDATE | **2건** (0.1%) |
| UNRESOLVED_CATEGORY | **22건** (0.6%) — 3개 미매핑 코드, detail 진입 금지 |
| EXACT_PRELIMINARY_RETAINED_COUNT | **1,277건** (CORE+COND+SHOP+EXP+TEMPLE) |
| MAX_POSSIBLE_DETAIL_CALLS | 1,277건 |
| multi_lang_list 보유율 | 100% (3765/3765) |
| SEOUL_BULK_DETAIL_COLLECTION | **NOT_STARTED** |
| 수집기 | `scripts/run-visitseoul-full-inventory-v1.py` (v2.0.0-list-only) |
| 산출물 | `data/seoul-source-audit/seoul-visitseoul-full-inventory-v1.jsonl` (3765건) |
| 요약 | `docs/data-collection/seoul/seoul-visitseoul-full-inventory-summary-v1.md` |

다음 승인 gate: retained detail 수집 (1,277건 → 후속 TASK)

**MAIN 결정 필요 (retained detail 착수 전):**

1. ~~list inventory + local category filter 수집 전략 승인~~ (**완료** — 전체 3,765건 수집됨)
2. 전문매장/상가 USER_REVIEW 프로세스 (262건)
3. KTO 병행 수집 범위 확정 (credential 확보 포함)
4. 서울역사박물관 대안 source
5. KTO ID collision 해소 (264337, 264491) — credential 확보 후 targeted detail
6. ~~UNRESOLVED 22건 코드맵 추가~~ (**완료** — 아래 Travel Value 통합 섹션 참조)

**⚠️ LEGACY TERMINOLOGY CORRECTION (MAIN 필독):**

```
OLD (사용 금지): EXACT_PRELIMINARY_RETAINED = 1,277
NEW (사용 필수): LEGACY_PRE_TRAVEL_VALUE_DETAIL_POOL = 1,277
```

1,277건은 PLACE_CORE / PLACE_CONDITIONAL / SHOPPING / EXPERIENCE / TEMPLE만 포함.
Restaurant(1,259건), Event(1,190건)은 **별도 track — 이 숫자에 포함되지 않음**.
이 1,277건은 Travel Value Gate 적용 **전** 상태 → `RETAINED_DETAIL_PLAN_READY = NO`.

**Travel Value Integration — 통합 완료 (2026-08-10):**

| 항목 | 값 |
|---|---|
| TASK | TASK-SEOUL-TRAVEL-VALUE-INTEGRATION-AND-ENTITY-MODEL-V1 |
| 추가 detail 호출 | 120건 (Restaurant 40, Event 35, Shopping 18, Experience 12, K-pop 8, UNRESOLVED 7) |
| 누적 detail 호출 | **239건** (Nature 119 + Integrated 120) |
| FULL_INVENTORY_UNRESOLVED_CATEGORY | **0** (22건 routing 완료) |

**UNRESOLVED 22건 Resolution:**

| Code | Category | 건수 | Routing |
|---|---|---|---|
| `Cw8j0y7` | 자연경관(하천) | 13 | PLACE_CONDITIONAL_REVIEW (Nature 119 포함) |
| `Cy5h2x9` | 테마공원 | 7 | 4건 PLACE_CORE + 3건 PLACE_CONDITIONAL |
| `Ca1z6p7` | 역사관광 | 2 | PLACE_CONDITIONAL_REVIEW |

**Cy5h2x9 상세:**
- PLACE_CORE: 씨라이프코엑스아쿠아리움, 서울랜드, 롯데월드어드벤처, 롯데월드아쿠아리움
- PLACE_CONDITIONAL: 어린이대공원반려견놀이터, 라바타운, 키자니아서울

**7축 Travel Value Gate 확립:**

| 축 | 이름 |
|---|---|
| TV1 | TRAVEL_PURPOSE_VALUE |
| TV2 | TRAVELER_UTILITY_VALUE |
| TV3 | KOREA_LOCAL_UNIQUENESS |
| TV4 | EXPERIENCE_VALUE |
| TV5 | INTENT_MATCH_POTENTIAL |
| TV6 | INFORMATION_QUALITY |
| TV7 | CURRENT_USABILITY |

자세한 정책: `docs/data-collection/seoul/seoul-integrated-travel-value-policy-v1.md`

**SOURCE_CONTENT_TYPE 분류 완료:**

6가지 분류 확립 (PHYSICAL_PLACE, EXPERIENCE_CONTENT, ROUTE_COURSE, EVENT, EDITORIAL_CONTENT, UTILITY_SERVICE).
전국 공통 적용. 자세한 정책: `docs/data-collection/seoul/seoul-source-content-entity-classification-v1.md`

**Key Field Gap 발견 (구조화 필드 부재 — 외부 보강 필요):**

| 필드 | VisitSeoul | 보강 방법 |
|---|---|---|
| Event 시작/종료일 | NOT_AVAILABLE (텍스트에만) | 공식 사이트 + regex 추출 |
| 할랄 인증 | NOT_AVAILABLE | 한국이슬람교 연합회 |
| 채식/비건 | NOT_AVAILABLE | HappyCow API + UGC |
| 외국어 메뉴 | NOT_AVAILABLE | 구글 리뷰 + UGC |
| 솔로 다이닝 | NOT_AVAILABLE | UGC |
| 이미지 URL | Detail API 미포함 | 별도 이미지 API |

**K-pop 발견 (KPOP_DISCOVERY_FROM_VISITSEOUL = CONDITIONAL):**
- 전체 3,765건 중 K-pop 키워드 145건 (3.85%)
- 공연장/문화 venue = STRONG. K-pop 직접 체험 시설 = WEAK
- 하이브 인사이트/SM TOWN 등 공식 체험 공간 → VisitSeoul 미등록 또는 EXPERIENCE_CANDIDATE
- 별도 K-pop 특화 source 연동 필요

**44개 여행자 intent 커버리지 정의 완료:**

| 등급 | intent 수 |
|---|---|
| STRONG | 8 |
| MODERATE | 18 |
| WEAK | 13 |
| NOT_AVAILABLE | 1 |

자세한 정책: `docs/data-collection/seoul/seoul-traveler-need-coverage-matrix-v1.json`

**Nature/Trekking Travel Value 정책 (VALIDATED — 2026-08-10):**

> 119건 detail 호출 live 검증 완료. 정책 문서: `docs/data-collection/seoul/seoul-nature-travel-value-policy-v1.md`

| 플래그 | 값 |
|---|---|
| NATURE_TRAVEL_VALUE_POLICY | **VALIDATED** |
| TREKKING_ROUTE_DATA_AVAILABLE_IN_VISITSEOUL | **PARTIAL** (텍스트 추출 16%, 구조화 필드 없음) |
| PLACE_BASED_EXPERIENCE_MODEL_REQUIRED | **YES** |
| EVENT_PLACE_RELATION_REQUIRED | **YES** |
| USER_ROUTE_ENRICHMENT_ROLE | **DOCUMENTED** |

**핵심 발견:**

- VisitSeoul 자연 카테고리: 산(Cu5u8d4) 29건, 도시공원(Ce9z7g9) 73건, 자연공원(Cp3b3j9) 17건, 하천(Cw8j0y7) 13건
- 좌표 가용성: 95.8% (자연 장소 detail 119건 기준)
- 거리 데이터: 16% (text에만 서술, 구조화 없음) — 서울 둘레길 156.5km, 한강 자전거 코스 240km, 청계천 10.84km 등
- 고도 데이터: 6.7% (text에만 서술)
- 활동 탐지: 51.3% — walking(35건), cycling(16건), hiking(10건), swimming(9건), camping(7건)
- PLACE_VALUE vs PLACE_BASED_EXPERIENCE_VALUE: 야경 시리즈 8건 + 계절 시설이 별도 CID로 분리 등록됨 (동일 스키마 사용)

**MAIN 구현 요구사항 (schema/DB 결정은 MAIN):**

1. PLACE entity + PLACE_BASED_EXPERIENCE entity 분리 모델링 (야경/계절/루트)
2. event-place 관계 연결 (`hosting_place_id`)
3. 19개 nature intent → VisitSeoul 카테고리 매핑 필터
4. 서울 둘레길 21개 코스 상세 → 외부 API 또는 UGC 보완 필요
5. 북한산 코스별 데이터 → 국립공원공단 API 연동 검토

**참조 파일 (data/seoul-collection-v1 branch):**

- `docs/data-collection/seoul/seoul-nature-travel-value-policy-v1.md` — **Nature Travel Value 정책 (신규)**
- `docs/data-collection/seoul/seoul-nature-trekking-value-live-validation-v1.md` — **Nature/Trekking live validation 119건 (신규)**
- `docs/data-collection/seoul/seoul-visitseoul-full-inventory-summary-v1.md` — **Full inventory 결과 요약**
- `docs/data-collection/seoul/seoul-visitseoul-full-category-distribution-v1.json` — **Track 분포 + category coverage**
- `docs/data-collection/seoul/seoul-visitseoul-detail-candidate-plan-v1.json` — **Retained detail plan EXACT**
- `docs/data-collection/seoul/seoul-visitseoul-live-quality-summary-v1.md` — Live 검증 종합 보고서 (v1-corrected)
- `docs/data-collection/seoul/seoul-benchmark-live-verification-v1.json` — benchmark 32개 상세 (SSOT 정렬, 홍대 복구)
- `docs/data-collection/seoul/seoul-kto-candidate-id-integrity-v1.json` — KTO contentId 후보 무결성 테이블
- `docs/data-collection/seoul/seoul-visitseoul-inventory-collector-design-v1.md` — 수집기 설계 문서
- `docs/data-collection/seoul/seoul-visitseoul-inventory-dryrun-summary-v1.md` — Dry-run 실행 결과 요약
- `docs/data-collection/seoul/seoul-visitseoul-category-quality-v1.json` — 카테고리 품질 분석
- `docs/data-collection/seoul/seoul-source-cascade-live-recommendation-v1.json` — Source cascade 권장안
- `docs/data-collection/seoul/seoul-live-user-review-groups-v1.md` — 사용자 검토 그룹
- `docs/data-collection/seoul/seoul-visitseoul-kto-crosswalk-sample-v1.json` — KTO↔VS 교차 매핑
- `docs/data-collection/seoul/seoul-source-cascade-proposal-v1.json` — SOURCE-DISCOVERY 원안
- `docs/data-collection/seoul/seoul-tourism-benchmark-v1.json` — SSOT 32개 (READ ONLY)

---

## SECTION 5 — SEARCHABLE 구현 방식 구분

SEARCHABLE=YES가 "canonical city_spots DB에 해당 장소를 반드시 bulk 저장한다"를 의미하지 않는다.

SEARCHABLE=YES는 **product surface capability** 정의다. 실현 방식은:

| 방식 | 설명 | 대상 |
|---|---|---|
| (A) Canonical curated record | canonical city_spots에 있는 장소 | 핵심 관광지, 대표 flagship |
| (B) External place search | 외부 지도/검색 연동 | 일반 chain 지점, 상업시설 |
| (C) My Places / user-added | 사용자가 직접 추가 | 개인 추가 장소 |

**일반 chain 지점 수백 개는 (A)로 전체 구축 금지 — (B) 또는 (C)로 처리.**

| 개념 | 의미 |
|---|---|
| CANONICAL USER_CAN_SELECT | canonical city_spots에 있는 장소를 Selected에 추가 |
| EXTERNAL_SEARCH USER_ADD_ALLOWED | canonical에 없어도 외부 장소 검색으로 사용자가 직접 추가 가능 |

`canonical SEARCHABLE=NO`여도 사용자는 외부 장소 검색으로 직접 추가할 수 있음.
이 두 개념을 혼동하지 않는다.

---

## SECTION 6 — Backfill 우선순위 (RECOMMENDATION ONLY)

> 이 섹션은 BACKFILL RECOMMENDATION이다. DB 변경·patch 지시가 아니다.
> 실제 적용은 MAIN 결정 후 별도 TASK에서 수행한다.

**즉시 적용 가능 (고신뢰, USER_REVIEW 불필요):**

| 도시 | 대상 | 제안 | 건수 |
|---|---|---|---|
| 부산 | accommodation | `ai_itinerary_eligible=NO` | 82건 |
| 경주 | heritage attraction | `ai_itinerary_eligible=YES` | 81건 |
| 경주 | resort-type in attraction | `ai_itinerary_eligible=NO` | ~5~8건 |

**MAIN 결정 필요 후 적용:**

| 도시 | 대상 | 이슈 |
|---|---|---|
| 부산 | restaurant (canonical 680건) | 관광 대표 vs 일반 구분 기준 필요 |
| 경주 | restaurant (102건) | 관광 대표 vs 일반 구분 기준 필요 |
| 부산 | market (~10건) | 관광형 vs 지역 시장 기준 필요 |
| 경주 | culture facility (~9건) | 대표 vs 일반 기준 필요 |

---

## SECTION 7 — 도시별 문서 참조 지도

| 문서 | 위치 | 설명 |
|---|---|---|
| Eligibility Policy v1 | `docs/data-collection/multicity-place-eligibility-policy-v1.md` | 5개 축 정의 원문 |
| Eligibility Backfill Audit | `docs/data-collection/multicity-place-eligibility-backfill-audit-v1.json` | 부산/경주 감사 결과 |
| Eligibility Regression Fixtures | `docs/data-collection/multicity-eligibility-regression-fixtures-v1.json` | 회귀 테스트 |
| Data Quality Guardrail v1 | `docs/data-collection/multicity-data-quality-guardrail-v1.md` | 13개 원칙 (busan-gyeongju branch) |
| Gyeongju MAIN 상세 | `docs/data-collection/gyeongju-main-clean-import-manifest-v1.md` | 경주 상세 인수인계 |
| Busan-Gyeongju Gap Fill Handoff | `docs/data-collection/busan-gyeongju-gap-fill-main-handoff-final.md` | 부산·경주 gap fill 최종 |
| Seoul Source Discovery | `docs/data-collection/seoul/seoul-source-cascade-proposal-v1.json` | 서울 수집 현황 |
| Seoul Live Quality Validation | `docs/data-collection/seoul/seoul-visitseoul-live-quality-summary-v1.md` | VisitSeoul 실시간 검증 (109 calls) |
| Seoul Benchmark Verification | `docs/data-collection/seoul/seoul-benchmark-live-verification-v1.json` | 32개 benchmark CID 확인 |
| Seoul Category Quality | `docs/data-collection/seoul/seoul-visitseoul-category-quality-v1.json` | 카테고리별 FP·수집 적합성 |
| Seoul Source Cascade Live | `docs/data-collection/seoul/seoul-source-cascade-live-recommendation-v1.json` | Source 우선순위 최종 (수집 전략 포함) |
| Seoul KTO ID Integrity | `docs/data-collection/seoul/seoul-kto-candidate-id-integrity-v1.json` | KTO contentId 후보 무결성 (32 entries, collision gate) |
| Seoul Nature Travel Value Policy | `docs/data-collection/seoul/seoul-nature-travel-value-policy-v1.md` | **19개 intent 정의, PLACE vs EXPERIENCE 분리, 이벤트-장소 관계** |
| Seoul Nature Trekking Live Validation | `docs/data-collection/seoul/seoul-nature-trekking-value-live-validation-v1.md` | **119건 detail 검증, 트레킹 루트 데이터 가용성** |
| Seoul Source Content Entity Classification | `docs/data-collection/seoul/seoul-source-content-entity-classification-v1.md` | **SOURCE_CONTENT_TYPE 7종 분류, 전국 공통 적용 원칙 (신규)** |
| Seoul Restaurant Travel Value Live Validation | `docs/data-collection/seoul/seoul-restaurant-travel-value-live-validation-v1.md` | **40건 restaurant detail 검증, 할랄/비건/솔로 field gap (신규)** |
| Seoul Event Travel Value Live Validation | `docs/data-collection/seoul/seoul-event-travel-value-live-validation-v1.md` | **35건 event detail 검증, 날짜 field gap, lifecycle 분석 (신규)** |
| Seoul Shopping K-pop Experience Validation | `docs/data-collection/seoul/seoul-shopping-kpop-experience-live-validation-v1.md` | **38건 (Shopping+Kpop+Experience) 검증, UNRESOLVED 22건 해소 (신규)** |
| Seoul Integrated Travel Value Policy | `docs/data-collection/seoul/seoul-integrated-travel-value-policy-v1.md` | **7축 TV Gate, 4-Layer Curation, Entity Relation Model (신규)** |
| Seoul Traveler Need Coverage Matrix | `docs/data-collection/seoul/seoul-traveler-need-coverage-matrix-v1.json` | **44개 intent 커버리지 STRONG/MODERATE/WEAK (신규)** |
| Seoul Traveler Utility Field Gap | `docs/data-collection/seoul/seoul-traveler-utility-field-gap-v1.json` | **30개 필드 가용성 분석, 보강 전략 (신규)** |
| Seoul Integrated Detail Strategy | `docs/data-collection/seoul/seoul-integrated-detail-strategy-v1.md` | **6-Tier detail 호출 전략, 239건 완료 현황 (신규)** |

**Branch 참조:**

| Branch | SHA | 내용 |
|---|---|---|
| `data/busan-gyeongju-gap-fill-v1` | `8dfdc6d` | 부산·경주 원본 데이터, guardrail v1 |
| `data/seoul-collection-v1` | 이 branch | Eligibility policy, backfill audit, regression fixtures |

---

## SECTION 8 — QA 체크리스트

- [ ] AI candidate selection 코드에서 READY=true 단독 후보 여부 확인
- [ ] accommodation 82건(부산) `ai_itinerary_eligible=NO` 적용
- [ ] 경주생활체육공원, 경주축구공원 service 제외 처리 (canonical에 마커 없음)
- [ ] heritage 81건(경주) `ai_itinerary_eligible=YES` 적용
- [ ] USER PICKED > AI AUTO FILTER 구현 확인
- [ ] CONDITIONAL 처리 로직 구현 (intent 매칭)
- [ ] Schema 변경 여부 결정 (Option B 권장, MAIN 결정)
- [ ] 부산 14건 제외 결정 보존 (복구 금지)
- [ ] VisitSeoul 카테고리 직접 AI 후보 처리 금지 확인
- [ ] Seoul branch eligibility policy 확인 (data/seoul-collection-v1)
- [ ] **[신규]** PLACE_VALUE vs PLACE_BASED_EXPERIENCE_VALUE 분리 모델 구현 (야경 8건, 계절 시설)
- [ ] **[신규]** event-place 관계 연결 (`hosting_place_id`) M:N 구현 (단일 ID 확정 금지)
- [ ] **[신규]** 19개 nature intent → VisitSeoul 카테고리 매핑 필터 구현
- [ ] **[신규]** 서울 둘레길 21코스 상세 데이터 수집 출처 결정 (외부 API or UGC)
- [ ] **[신규]** 북한산 등산 코스 상세 수집 출처 결정 (국립공원공단 API)
- [ ] **[신규]** Event START_DATE/END_DATE 추출 파이프라인 구현 (구조화 필드 없음 — regex+공식사이트)
- [ ] **[신규]** 할랄 인증 리스트 연동 (한국이슬람교 연합회/할랄코리아)
- [ ] **[신규]** SOURCE_CONTENT_TYPE 분류 로직 적용 (EVENT CID → city_spots entity 변환 금지)
- [ ] **[신규]** LEGACY_PRE_TRAVEL_VALUE_DETAIL_POOL 1,277건 → 개별 TV Gate 적용 (후속 TASK)
- [ ] **[신규]** Cy5h2x9 4건 PLACE_CORE 확정 반영 (씨라이프, 서울랜드, 롯데월드2건)
- [ ] **[신규]** MAIN이 실제 AI candidate filtering 코드를 먼저 검토한다. 현재 구현이 READY/data presence만으로 결정되는 구조인지 확인 후, 필요 시 Travel Value + eligibility + intent 기반으로 개선 (CURRENT_MAIN_AI_FILTER = NOT_VERIFIED_IN_THIS_TASK)
- [ ] **[신규]** 서울 3,765건 enrichment routing 결과 확인 (TASK-SEOUL-FULL-INVENTORY-ENRICHMENT-ROUTING-V1)
- [ ] **[신규]** EXISTING_DETAIL_UNIQUE_CIDS = 254 (call count 239 ≠ unique count) — 중복 CID 체크 로직 필요
- [ ] **[신규]** Event lifecycle: ENDED/RECURRING/ACTIVE/UNKNOWN 상태값 schema 지원 확인

---

## SECTION 9 — 서울 Full Enrichment Routing 결과 (2026-08-10)

**TASK**: TASK-SEOUL-FULL-INVENTORY-ENRICHMENT-ROUTING-V1

> ROUTING_COUNTS_ARE_NOT_RETENTION_COUNTS = YES
> 아래 숫자는 GoKoreaMate 최종 포함/제외가 아님. "다음 필요 정보" 분류임.

**Primary Routing 요약:**

| Routing | 건수 | 비율 |
|---|---|---|
| A — DETAIL_REQUIRED_NOW | 1,318 | 35.0% |
| B — DETAIL_ALREADY_SUFFICIENT | 254 | 6.7% |
| C — UTILITY_ENRICHMENT_REQUIRED | 921 | 24.5% |
| D — EVENT_DATE_ENRICHMENT_REQUIRED | 1,152 | 30.6% |
| F — EXTERNAL_SEARCH_LAYER_SUITABLE | 72 | 1.9% |
| H — HOLD_USER_REVIEW_REQUIRED | 48 | 1.3% |
| **합계** | **3,765** | |

**핵심 수치:**
- EXISTING_DETAIL_UNIQUE_CIDS = **254** (Nature 119 + Integrated 120 + Dryrun 15 unique)
- BYTE_IDENTICAL_REPRODUCIBLE = YES
- E secondary (official source 보강 필요): **1,856건** (49.3%)
- G secondary (user enrichment 적합): **417건** (11.1%)

**RECOMMENDED_NEXT_TASK = TASK-SEOUL-PLACE-CORE-DETAIL-COLLECTION-V1**
(194건 non-B PLACE_CORE + 108건 EXPERIENCE → AI 일정 서울 서비스 시작 최소 조건)

**전국 재사용 규칙 (이번 TASK에서 확립):**
- ROUTE_COURSE = 0 (VisitSeoul 공통): 경로 data는 SEOUL_CITY/NATIONAL_PARK 별도 source
- Restaurant C primary = "utility 수집 필요" (제외 아님)
- Event D primary = "날짜 확인 필요" (제외 아님)
- E secondary 비율 높음 → 전국 공통으로 VisitSeoul + official source 병행 필요

**상세 문서:**
- `docs/data-collection/seoul/seoul-full-enrichment-routing-summary-v1.md`
- `docs/data-collection/seoul/seoul-enrichment-routing-distribution-v1.json`
- `docs/data-collection/seoul/seoul-next-collection-priority-v1.md`
- `docs/data-collection/seoul/seoul-traveler-need-routing-gap-v1.json`
- `data/seoul-source-audit/seoul-full-enrichment-routing-v1.jsonl` (3,765건)
- `data/seoul-source-audit/seoul-full-enrichment-routing-manifest-v1.json`
- `scripts/run-seoul-full-enrichment-routing-v1.py`

---

## SECTION 10 — 서울 야간 오프라인 품질 감사 결과 (2026-08-10)

**TASK**: TASK-SEOUL-NIGHT-OFFLINE-MULTILINGUAL-ENTITY-RELATION-QUALITY-AUDIT-V1  
**방법**: 3,765건 오프라인 전수 감사 (API 호출 0 / 자동 변경 0)

### 주요 발견

**다국어 무결성:**
```
STRUCTURAL_ANOMALIES = 0  (SELF_LINK=0, MISMATCH=0, DUPLICATE=0)
KO_ONLY_RECORDS = 110  (다국어 추천 제외 후보)
HIGH_PRIORITY_LANGUAGE_GAP = 258  (High-value 레코드 중 target 언어 누락)
EN=95.9% / JA=90.5% / ZH-CN=90.2% / ZH-TW=90.0%
```

**SCT 재분류:**
```
ROUTE_COURSE_AUDITED_COUNT = 1  (KOP015873 = EDITORIAL_MULTI_ROUTE_CONTENT)
DULLEGIL_RECORD_COUNT = 4
ROUTE_RELATED_CONTENT_TOTAL = 11
SCT_RECLASSIFIED_COUNT = 16
```

**⚠️ 전국 공통 규칙 수정 (RULE_MH_02):**  
~~ROUTE_COURSE = 0 (VisitSeoul 공통)~~ →  
**ROUTE_COURSE ≥ 1 존재 가능. 반드시 SCT 감사 후 확인 필요.**  
KOP015873 = 서울 둘레길 코스 안내 → EDITORIAL_MULTI_ROUTE_CONTENT로 재분류.  
서울 둘레길 21개 코스는 개별 CID 없음 (확인 완료).

**Blanket Rule 결함:**
```
BLANKET_RULE_DEFECT_COUNT = 2
  BLANKET_01: Ck6n0w6 (주점) 전체 F → 28건 upgrade 필요
  BLANKET_02: Cl2d2s1 (교육) 전체 H → 체험형 예외 필요
ROUTING_V2_REQUIRED = YES
```

**Entity Relations / Duplicates:**
```
ENTITY_RELATION_CANDIDATE_COUNT = 306  (AUTO_MERGE=0)
DUPLICATE_CANDIDATE_COUNT = 152  (AUTO_MERGE=0, AUTO_DELETE=0)
REVIEW_QUEUE_COUNT = 526
```

### 전국 공통 정책 업데이트 (이번 감사에서 추가)

```
RULE_MH_08: KO_ONLY 레코드 = 다국어 AI 일정 추천 제외 기본 처리 대상
RULE_MH_09: 주점 category (Ck6n0w6) blanket F = 정책 위반.
            야경/루프탑/전통주/포차 키워드 보유 시 A 상향 필요.
RULE_MH_10: routing 스크립트는 blanket rule 감사 포함 QA를 통과해야 함.
            전국 타 도시에도 동일 blanket rule 적용 여부 확인 필요.
```

### 상세 문서

- `docs/data-collection/seoul/seoul-offline-multilingual-quality-summary-v1.md`
- `docs/data-collection/seoul/seoul-entity-relation-quality-summary-v1.md`
- `docs/data-collection/seoul/seoul-routing-blanket-rule-audit-v1.md`
- `docs/data-collection/seoul/seoul-night-quality-audit-summary-v1.md`
- `data/seoul-source-audit/seoul-multilingual-link-audit-v1.jsonl` (3,765건)
- `data/seoul-source-audit/seoul-entity-relation-candidates-v1.jsonl` (306건)
- `data/seoul-source-audit/seoul-duplicate-related-candidates-v1.jsonl` (152건)
- `data/seoul-source-audit/seoul-night-quality-review-queue-v1.jsonl` (526건)
- `data/seoul-source-audit/seoul-night-quality-audit-manifest-v1.json`
- `scripts/run-seoul-offline-entity-relation-quality-audit-v1.py`

---

## SECTION 11 — 서울 Routing V2 Correction 결과 (2026-08-10)

**TASK**: TASK-SEOUL-FULL-ENRICHMENT-ROUTING-V2-CORRECTION  
**방법**: 오프라인 V1→V2 전수 재라우팅 (API=0, 자동변경=0)

### Blanket Rule 수정 결과 (전국 공통 적용)

```
PRIMARY_ROUTING_CHANGED = 39건
  BLANKET_01_FIX (주점 Ck6n0w6): F→A/C/F 3-tier = 26건 변경
  BLANKET_02_FIX (교육시설 Cl2d2s1): H→A/C/F = 13건 변경
```

### ⚠️ 전국 규칙 수정 (RULE_MH_09, RULE_MH_10, RULE_MH_11)

```
RULE_MH_09 (수정):
  OLD: 주점 category(Ck6n0w6) blanket F = 정책 위반
  NEW: keyword evidence 3-tier
    A: 루프탑/야경/전통주/양조장/재즈/한류/클럽/한강뷰/남산뷰
    C: 포차/포장마차/외국인/이자카야
    F: 위 신호 없는 일반 주점 (default)
  → 모든 도시 주점 routing에 동일 3-tier 원칙 적용

RULE_MH_10 (수정):
  OLD: 교육시설 category(Cl2d2s1) blanket H = 정책 위반
  NEW: evidence-based
    A: 체험/전시/박물관/과학관/복합문화공간/한옥/어린이체험
    C: 아카데미/한국어수업/교육과정
    F: 일반 civic facility
  → 모든 도시 교육시설 routing에 동일 원칙 적용

RULE_MH_11 (신규):
  대형마트 category(Ct1z4k9) latent blanket F
    K-food/specialty signal → A, 없으면 → F
    현재 3건은 B(기존 detail)로 실제 영향 없으나 script 보정 완료
```

### V2 Primary 분포

| Primary | V1 | V2 |
|---|---|---|
| A | 1,318 | 1,344 |
| B | 254 | 254 |
| C | 921 | 931 |
| D | 1,152 | 1,152 |
| F | 72 | 49 |
| H | 48 | 35 |

### RECOMMENDED_NEXT_TASK

```
TASK-SEOUL-PLACE-CORE-DETAIL-COLLECTION-V1 (유지)
  V2 blanket fix는 routing script 레벨 완료 — 별도 collection task 불필요
```

### 상세 문서

- `docs/data-collection/seoul/seoul-routing-v1-v2-correction-report.md`
- `docs/data-collection/seoul/seoul-full-enrichment-routing-v2-summary.md`
- `data/seoul-source-audit/seoul-full-enrichment-routing-v2.jsonl` (3,765건)
- `data/seoul-source-audit/seoul-full-enrichment-routing-v1-v2-delta.jsonl` (41건)
- `data/seoul-source-audit/seoul-full-enrichment-routing-v2-manifest.json`
- `scripts/run-seoul-full-enrichment-routing-v2.py`

---

## SECTION 12 — 서울 PLACE_CORE + EXPERIENCE Detail Collection 결과 (2026-08-11)

**TASK**: TASK-SEOUL-PLACE-CORE-AND-EXPERIENCE-DETAIL-COLLECTION-V1-R1  
**방법**: VisitSeoul contents/info API 배치 호출 311건 (API_CALLS=311)

### ⚠️ CRITICAL — B_ROUTING_EVIDENCE ≠ ACTUAL_API_PAYLOAD

```
B_ROUTING_EVIDENCE_CIDS   = 254  (Nature 119 + Integrated 120 + Dryrun 15)
  └─ Nature 119: category code 증거만. API payload 없음. NATURE_RECALLED=0.
  └─ Integrated 120: 실제 API 호출 완료 (7f9fae5)
  └─ Dryrun 15: 실제 API 호출 완료 (55e7d10)

ACTUAL_API_PAYLOAD_BEFORE_TASK = 135  (= Integrated 120 + Dryrun 15)
ACTUAL_API_PAYLOAD_AFTER_TASK  = 446  (= 135 + 311 이번 task)

B_ROUTING_EVIDENCE(254) ≠ ACTUAL_API_PAYLOAD(135)

전국 공통 원칙:
  B routing = "detail 충분하다고 판단된 라우팅" — 모두 실제 API payload를 의미하지 않음
  Nature/trekking 119건은 routing 증거만. 실제 payload 취득 시 별도 task 필요.
```

### 수집 결과

| Collection Domain | 건수 |
|---|---|
| PLACE_CORE | 194 |
| EXPERIENCE | 107 |
| TEMPLE_STAY | 1 |
| V2_RECOVERED (BLANKET_02_FIX 교육 A-복원) | 9 |
| **PLAN_TOTAL** | **311** |

```
API_SUCCESS     = 311/311
API_FAILURE     = 0
BAR_PUB_CALLED  = 0  (17건 → TASK-SEOUL-RESTAURANT-UTILITY-ENRICHMENT-V1)
NATURE_RECALLED = 0
```

### 필드 발견 (Round-2)

```
relate_img → related_images  (311/311 가용)
tag        → tags            (311/311 가용, 평균 10~15개 한국어 태그)
sumry      → summary         (311/311 가용, 최대 500자)
creat_dt_text → created_at  (311/311)
updt_dt_text  → updated_at  (311/311)

NORMALIZED_SHA256 = c1b88ae1e5eb20e821348da60d9952222e282450a3892d40827a70e8aa40e87c
NORMALIZATION_BYTE_IDENTICAL = YES
```

### Eligibility

```
AI_ITINERARY_YES         = 265/311  (85.2%)
AI_ITINERARY_CONDITIONAL = 30/311   (9.6%)
AI_ITINERARY_NO          = 16/311   (5.2%)
SEARCHABLE_YES           = 311/311
```

### SCT 재분류 (Detail 기반)

```
SCT_CHANGED_FROM_V2 = 7
  PHYSICAL_PLACE → EXPERIENCE_CONTENT: 5건
  PHYSICAL_PLACE → PHYSICAL_PLACE_WITH_ROUTE_CONTENT: 2건
SCT_REMAINING_AFTER_DETAIL = 7건 (수동 검토 권장)
```

### RECOMMENDED_NEXT_TASK

```
TASK-SEOUL-RESTAURANT-UTILITY-ENRICHMENT-V1
  대상: Bar/Pub 17건 + Restaurant C 931건 utility enrichment
  이유: halal/vegan/solo intent CRITICAL GAP

또는:
TASK-SEOUL-EVENT-DATE-STATUS-PIPELINE-V1
  대상: D-routing 1,152건
  이유: 날짜 없이 AI 일정 사용 불가
```

### 상세 문서

- `docs/data-collection/seoul/seoul-place-core-experience-detail-summary-v1.md`
- `docs/data-collection/seoul/seoul-place-core-experience-quality-gap-v1.json`
- `docs/data-collection/seoul/seoul-place-core-experience-eligibility-audit-v1.json`
- `data/seoul-source-audit/seoul-place-core-experience-detail-plan-v1.jsonl` (311건)
- `data/seoul-source-audit/seoul-place-core-experience-detail-raw-v1.jsonl` (311건)
- `data/seoul-source-audit/seoul-place-core-experience-detail-normalized-v1.jsonl` (311건)
- `data/seoul-source-audit/seoul-place-core-experience-detail-manifest-v1.json`
- `scripts/run-seoul-place-core-experience-detail-collection-v1.py`

---

## SECTION 13 — 서울 현재/예정 이벤트 수집 결과 (2026-08-11)

> **최초 Task**: TASK-SEOUL-EVENT-CURRENT-UPCOMING-SYNC-AND-REFRESH-POLICY-V1  
> **R1 수정 Task**: TASK-SEOUL-EVENT-CURRENT-UPCOMING-SYNC-R1-CORRECTION  
> **정책 문서**: `docs/data-collection/multicity-event-freshness-policy-v1.md`

### 핵심 원칙

```
PRODUCT_ROLE = AI_TRAVEL_SCHEDULER (이벤트 아카이브 아님)
수집 대상: ONGOING + 날짜확정 UPCOMING 이벤트만
이벤트 새로고침 주기: 7일 (전체 재수집)
FUTURE_DATE_THRESHOLD_GATE = 없음
RECURRING_EVENT_WATCHLIST = 미운영 (v1)
SOURCE_UPDATED_AT_HARD_DISCOVERY_GATE = FORBIDDEN (R1에서 확립)
ORGANIZER_DIRECT_URL_REQUIRED = NO (R1에서 확립)
OFFICIAL_INFORMATION_URL_REQUIRED = YES
```

### Section 30 API 검증 결과 (2026-08-11 실측)

```
VisitSeoul contents/list → 날짜 필드 없음
  updt_dt_text = source 수정 날짜 (행사 날짜 아님)
VisitSeoul contents/info → 이벤트 전용 날짜 필드 존재:
  schdul_info_bgnde = 이벤트 시작일 (형식: "2026.07.31")
  schdul_info_endde = 이벤트 종료일 (형식: "2026.08.02")
실측 예시:
  KOPqn2nrl (DDP 바캉스): 2026.07.31~2026.08.02 → ENDED
  KOPl5u8ht (의성 썸머뮤직): 2026.08.29~2026.08.29 → UPCOMING (비서울)
  KOPz4etr5 (서울썸머비치): 2026.07.20~2026.08.09 → ENDED
```

### 수집 전략 (R1 기준)

```
1. contents/list 전체 페이징 (76페이지, 3,765건)
2. 로컬 필터: EVENT 카테고리 코드 → 1,232건
3. updt_dt_text DESC 정렬 (최신 우선 힌트 — hard gate 아님)
   MAX_DETAIL_CANDIDATES = 200 (soft ceiling)
4. targeted contents/info 200건 호출
5. schdul_info_bgnde/schdul_info_endde 추출 → AS_OF date gate
6. ONGOING/UPCOMING + official_url + Seoul location 검증
HISTORICAL_BULK_DETAIL_CALLS = 0
POSSIBILITY_BASED_API_CALLS = 0
SOURCE_UPDATED_AT_IS_NOT_EVENT_DATE = YES
```

### V1 결과 (c99095e — REFERENCE ONLY)

| 지표 | 값 |
|---|---|
| 상세 call 후보 (old hard gate) | 60건 |
| **SERVICE_EVENT_POOL** | **4건** |
| Pool 제외 ONGOING 2건 이유 | NO_OFFICIAL_URL (FIX-1 미적용) |

### R1 최종 결과 (AS_OF = 2026-08-11)

| 지표 | 값 |
|---|---|
| VisitSeoul 전체 | 3,765건 |
| EVENT_CATEGORY 식별 | 1,232건 |
| 상세 call 후보 (soft limit 200) | 200건 |
| Outside V1 hard gate (추가 탐색) | 140건 |
| 날짜 확정 | 162건 |
| ONGOING | 6건 |
| UPCOMING | 1건 (비서울 — 제외) |
| ENDED | 155건 |
| INACTIVE | 38건 (날짜 없음) |
| RECENCY_HARD_GATE_FALSE_NEGATIVE_COUNT | 0 |
| **SERVICE_EVENT_POOL** | **6건** |

### SERVICE_EVENT_POOL 6건 (R1 최종)

| 제목 | 기간 | URL type |
|---|---|---|
| 2026 서울 태권도 광장 | 2026-05-09 ~ 2026-10-18 | ORGANIZER_DIRECT |
| 2026 서울국제정원박람회 | 2026-05-01 ~ 2026-10-27 | ORGANIZER_DIRECT |
| 2026 서울야외도서관 | 2026-04-23 ~ 2026-11-01 | ORGANIZER_DIRECT |
| 2026 서울 한옥체험 : 어제와의 오늘 시간 | 2026-04-03 ~ 2026-10-25 | ORGANIZER_DIRECT |
| 옹기콘서트 (조선 양반 접객 문화 체험 공연) | 2026-07-02 ~ 2026-12-10 | OFFICIAL_VISIT_OR_PUBLIC_PAGE |
| 연희판판 (연희 상설 공연) | 2026-04-04 ~ 2026-10-31 | OFFICIAL_VISIT_OR_PUBLIC_PAGE |

```
POOL_SHA256 = EC89604497EEB544483E688E2FABCAD439BA2905F2359BD27499F8F14ACF3C89
SERVICE_EVENT_WITHOUT_EXACT_DATE = 0
SERVICE_EVENT_WITHOUT_OFFICIAL_URL = 0
SECRET_LEAK = 0  DB_CHANGE = 0  SRC_MODIFIED = 0
```

### Regression Fixture (R1 통과)

| CID | 이벤트 | 결과 |
|---|---|---|
| KOPsj8gga | 옹기콘서트 | IN_POOL ✅ |
| KOPnkfasx | 연희판판 | IN_POOL ✅ |
| KOPl5u8ht | 의성 썸머뮤직 | NOT_IN_POOL ✅ |
| KOPz4etr5 | 서울썸머비치 | NOT_IN_POOL ✅ |

### 산출물

- `data/seoul-source-audit/seoul-current-upcoming-event-discovery-v1.jsonl` (200건)
- `data/seoul-source-audit/seoul-current-upcoming-event-pool-v1.jsonl` (6건)
- `data/seoul-source-audit/seoul-current-upcoming-event-attempts-v1.jsonl` (200건)
- `data/seoul-source-audit/seoul-current-upcoming-event-detail-raw-v1.jsonl` (200건)
- `data/seoul-source-audit/seoul-current-upcoming-event-sync-manifest-v1.json`
- `docs/data-collection/multicity-event-freshness-policy-v1.md` (R1 업데이트)
- `scripts/run-seoul-current-upcoming-event-sync-v1.py` (v1.1.0-R1)

### AI 일정 통합 요구사항

```
1. RUNTIME_EVENT_EXPIRY_GATE = REQUIRED
   - 일정 생성 시 여행자 날짜 ∩ event 날짜 구간 ≠ ∅ 검사 필수
2. BASE_REFRESH = 7일 주기 (--collect 재실행)
3. AI_EVENT_TRIP_DATE_OVERLAP_REQUIRED = YES
4. 다음 재수집 예정: 2026-08-18 이후
5. OFFICIAL_VISIT_OR_PUBLIC_PAGE URL도 valid official_url — AI에서 사용 가능
```
