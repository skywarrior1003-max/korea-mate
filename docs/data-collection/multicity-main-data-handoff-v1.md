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
2. `READY=true` 또는 `city_spots에 존재` 단독으로 AI 후보가 되지 않도록 확인한다.
3. `AI_ITINERARY_ELIGIBLE` 축을 명시적으로 적용한다.

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
| 수집 현황 | SOURCE-DISCOVERY-V1 완료 (SHA 49f0806) + VISITSEOUL-LIVE-QUALITY-VALIDATION-V1(SHA 7a84ce2) + BENCHMARK-ALIGNMENT-AND-KTO-ID-INTEGRITY-V1 완료 |
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

**참조 파일 (data/seoul-collection-v1 branch):**

- `docs/data-collection/seoul/seoul-visitseoul-live-quality-summary-v1.md` — Live 검증 종합 보고서 (v1-corrected)
- `docs/data-collection/seoul/seoul-benchmark-live-verification-v1.json` — benchmark 32개 상세 (SSOT 정렬, 홍대 복구)
- `docs/data-collection/seoul/seoul-kto-candidate-id-integrity-v1.json` — KTO contentId 후보 무결성 테이블 (신규)
- `docs/data-collection/seoul/seoul-visitseoul-category-quality-v1.json` — 카테고리 품질 분석
- `docs/data-collection/seoul/seoul-source-cascade-live-recommendation-v1.json` — Source cascade 권장안 (수집 전략 포함)
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
