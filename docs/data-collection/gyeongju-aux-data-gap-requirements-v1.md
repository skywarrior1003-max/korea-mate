# 경주 보조 데이터 보강 요구사항 v1

| 항목 | 값 |
|---|---|
| status | ACTIVE |
| source candidate SHA | `d49ad34` |
| as_of | 2026-08-08 (`_run_metadata.json.collection_date`) |
| canonical baseline | `data/gyeongju-final-release/gyeongju-canonical-places-v1.jsonl` (302) |
| machine-readable queue | `data/gyeongju-final-release/gyeongju-aux-data-gap-queue-v1.jsonl` (2,352) |

## 0. 이 문서의 성격

> **메인노트북은 데이터 수집을 수행하지 않는다.**
> 이 문서는 현재 서비스·DB·AI 일정 구조에서 필요한 데이터 요건을 정의한다.
> 실제 공식 원천 조사·수집·보강은 보조컴퓨터가 수행한다.
> 경주 현재 1차 데이터 통합을 먼저 완료하고,
> 이후 부산 추가 수집과 경주 gap 보강을 보조컴퓨터의 후속 데이터 브랜치에서 함께 진행한다.

이 문서는 **웹 조사 없이** 작성됐다. 모든 수치는 승인된 21개 handoff 파일에서 재계산한 값이고,
`preferred_source_type`은 `gyeongju-source-priority-matrix-v1.json`에 근거가 있을 때만 적었다.
근거가 없으면 비워 뒀다 — 출처를 새로 찾지 않았다.

## 1. 왜 이 문서가 필요한가

handoff의 `gyeongju-final-ready-302-v1.jsonl`은 `has_coords`·`has_description`·`has_images`를
302/302 전부 `true`로 선언한다. 그러나 같은 handoff가 "Full place detail"로 지정한
`gyeongju-enriched-candidates-v1.jsonl`을 실제로 JOIN하면 다음과 같다.

| 플래그 | handoff 선언 | 실제 값 | 차이 |
|---|---|---|---|
| `has_address` | 302 | **302** | 0 |
| `has_coords` | 302 | **186** | **-116** |
| `has_images` | 302 | **169** | **-133** |
| `has_description` | 302 | **102** | **-200** |

EN도 같은 형태의 괴리가 있다. `has_en_title = 138`이지만 **승인된 21개 파일 어디에도 EN 본문 텍스트가 없다**
(`en-coverage`는 boolean 커버리지만, `enriched.title_en`은 302/302 `null`). 즉 실제 공식 EN title = **0**.

원본은 고치지 않았다. 대신 canonical에서 실제 값으로 다시 계산했고, 그 차이가 아래 gap이다.

## 2. 현재 확보된 것 (재수집 불필요)

| 항목 | 값 |
|---|---|
| baseline identity | **302** (attraction 200 / restaurant 102) |
| 주소 | **302/302** |
| 좌표 | 186/302 |
| 이미지 (실존) | 169/302 · 그중 **권리상 노출 가능 167** |
| 설명 | 102/302 |
| quality tier | TIER_A 193 / TIER_B 109 |
| relation graph | 350 (HARD 222 / SOFT 32 / UNRESOLVED 96) — target 247건이 **247/247 canonical 안**으로 해소 |
| events / courses / stops / experiences / applications / travel info | 87 / 57 / 132 / 23 / 6 / 54 |

이미지 권리는 오히려 양호하다 — 노출 불가는 `KTO_TYPE_UNKNOWN` **2건**뿐이다.

## 3. 우선순위별 gap

총 **2,352건**. 상세는 machine-readable queue 참조.

### P0_AI_ROUTE — 117건

AI 일정·동선 생성이 **불가능**한 항목.

| gap_type | 건수 | 내용 | preferred source |
|---|---|---|---|
| `COORDINATES_MISSING` | 116 | 좌표 없음. 전부 `gyeongju-city/touristDestinationService` · 전부 attraction | KTO KorService2 type12/14 (mapx/mapy) |
| `FOOD_NEW_PLACE_PROPOSAL_ENRICHMENT` | 1 (영향 190행) | food 제안 190건 — 주소 190/190 있으나 **좌표 0/190** | 비지트경주 |

좌표가 없으면 spatial continuity에 참여할 수 없어 일정에 배치되지 않는다. **최우선.**

### P1_PUBLIC_CONTENT — 1,441건

| gap_type | 건수 | preferred source |
|---|---|---|
| `OFFICIAL_EN_TITLE_MISSING` | 302 | (matrix 근거 없음) |
| `OFFICIAL_EN_DESCRIPTION_MISSING` | 302 | (matrix 근거 없음) |
| `ADMISSION_MISSING` | 302 | 경주문화관광 웹사이트 (HOLD) |
| `DESCRIPTION_MISSING` | 200 | 경주시 GJ01 — **단 matrix가 "API 필드 미제공"이라고 기록** |
| `OFFICIAL_URL_MISSING` | 200 | 경주시 GJ01 |
| `IMAGE_MISSING` | 133 | 경주시 GJ03·GJ04·GJ05 이미지 API |
| `IMAGE_RIGHTS_UNKNOWN` | 2 | `cpyrhtDivCd` 미확보 — 그 필드만 받으면 해소 |

⚠️ `DESCRIPTION_MISSING` 200건은 **source priority matrix 자체가 GJ01에 설명 필드가 없다고 기록**하고 있다.
같은 API를 다시 호출해도 나오지 않을 가능성이 높으므로, 보조컴은 **대체 출처를 먼저 확정**한 뒤 착수하기 바란다.

### P1_AI_QUALITY — 201건

| gap_type | 건수 | 용도 |
|---|---|---|
| `OPENING_HOURS_MISSING` | 200 | 시간대 배치 · 휴무일 회피 |
| `EVENT_DATE_INCOMPLETE` | 1 (영향 3행) | 행사 기간 확정 |

### P2_ENRICHMENT — 249건

`PHONE_MISSING` 130 · `COORD_NOT_VALIDATED` 119. 공개나 일정 생성을 막지 않는다.

### MANUAL_REVIEW — 344건

자동 수집·자동 매칭으로 처리하면 **안 되는** 것.

| gap_type | 건수 | 이유 |
|---|---|---|
| `IDENTITY_UNLINKED` | 250 | 동일 장소 중복 판정은 사람이 봐야 한다 |
| `EN_IDENTITY_REVIEW` | 92 | EN 명칭이 같은 장소를 가리키는지 확인 필요 |
| `EVENT_VENUE_NOT_IN_PLACE_SET` | 1 (영향 60행) | 신규 place인지 비장소인지 판단 필요 |
| `COURSE_STOP_MANUAL_REVIEW` | 1 (영향 14행) | 코스 경유지 자동 매칭 미확정 |

## 4. 보조컴퓨터에 넘기지 않는 것 (메인 책임)

수집 gap이 아니라 **메인의 정책·구현 사안**이므로 queue에 넣지 않았다.

| 항목 | 왜 메인인가 |
|---|---|
| `publishability = pending_review` 302/302 | 공개 승인 기준은 제품 정책이다. 데이터가 더 온다고 해결되지 않는다 |
| `city_spot_sources` / `city_spot_images` 미구현 | ACTIVE 데이터 계약이 `source_type`/`external_id` 동결을 확정했으나 대체 테이블이 없다. migration은 메인 작업 |
| `candidate_id → city_spots.id` 매핑 계층 | scheduler가 relation graph를 소비하려면 필요. 구현 사안 |
| EN 노출 정책 (공식 EN만 vs KO fallback) | 정책 결정 |
| food 190 승격 기준 | 좌표가 채워진 뒤 메인이 판단 |

## 5. 절대 하지 말 것

- 없는 값을 추정해 채우지 않는다 (`do_not_guess: true`가 전 행에 있다)
- AI로 설명·영문·좌표를 생성하지 않는다
- 공식 EN과 generated/translated EN을 같은 필드에 섞지 않는다
- `RIGHTS_UNKNOWN`·`KTO_TYPE_UNKNOWN` 이미지를 공개 노출로 승격하지 않는다
- food 제안 190건을 canonical 302에 합치지 않는다

## 6. 후속 순서

1. **경주 1차 통합 완료** (메인) — canonical 기준으로 `city_spot_sources`/`city_spot_images` 및 place integration 구현
2. **보조컴 후속 데이터 브랜치** — 부산 추가 수집 + 위 경주 gap 보강을 함께 수행
3. 부산 gap audit은 아직 시작하지 않는다
