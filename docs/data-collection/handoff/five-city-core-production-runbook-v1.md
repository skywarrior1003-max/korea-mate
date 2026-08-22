# Five-City Core — Production Runbook v1 (+ SCALE READINESS)

TASK-FIVE-CITY-CORE-RELEASE-PREREQUISITES-V1-R1 · 2026-08-22 · Production write 0 · migration 056/057 미적용 · master 불변

기준 package: `data/main-intake/five-city-core-v1/` (input manifest + crosswalk summary 가 기대값 SSOT — 코드 상수 아님)
현재 5도시 선언값: ACTIVE 4,826 = MATCH_REPLACE 462 + NEW 4,194 + ARTIFACT_SAME_ENTITY_SKIP 170 + REVIEW_REQUIRED 0 · hide legacy 233 · keep 19(LEGACY_ONLY_VALID 15 + Owner override 4)
→ projected total 4,908 · discovery-visible 4,675 · hidden 233.

## 1. 순서 (불변)
1. **Owner**: Supabase SQL Editor 에서 `056_city_spots_is_published.sql` → verify(컬럼·NOT NULL·default false·714 전부 true·false 0·인덱스) → `057_city_spots_drop_city_name_unique.sql` → verify(제약 없음·`city_spots_city_name_idx` 비유니크·`idx_city_spots_source_external` UNIQUE 유지·714).
2. **Release code**(master fast-forward): `DISCOVERY_VISIBILITY_GATE_ENABLED=true` + 이 prerequisites 코드. 714 전부 true 라 화면 불변. smoke: `/`·`/my-trips`(200)·`/trips`(404 by design)·기존 `/place/<id>`·`/api/trip/plan`.
3. **STAGE** (`--stage`, service_role REST chunk): MATCH 462 → 기존 id PATCH(source-owned 필드만, is_published 미전송) · NEW 4,194 → `is_published=false` **lookup-before-insert**(canonical identity 로 조회 → 없는 것만 plain INSERT → unique 충돌 시 재조회 복구; PostgREST `on_conflict` 는 partial unique index 와 비호환이라 미사용) · legacy 233 은 그대로 true. 산출: `production-runs/<run_id>/production-id-mapping-v1.jsonl`(canonical_id → actual id) + `stage-receipt-v1.json`. 검증: post = pre + 4,194 · mapping 4,194 · 전부 false · 삭제 0.
4. **BUILD**: master checkpoint 커밋(`release: record five-city staged production intake`) → Cloudflare 빌드. `/place` 정적 경로는 reference scope 로 false 행까지 생성(4,908). 도시별 신규 샘플 `/place/<actual-id>` 200 + noindex + sitemap 미수록 확인. 실패 시 PUBLISH 금지(NEW 는 false 라 안전).
5. **PUBLISH** (`--publish-sql --mapping … --out …` 로 생성한 `publish-cutover-<run_id>.sql` 을 **Owner 가 SQL Editor 에서 단일 트랜잭션으로 실행**): exact new ids → true · exact hide 233 → false · keep 19 → true. 스크립트 내부 DO 블록이 개수·교집합·존재를 검증하고 어긋나면 RAISE(전체 ROLLBACK). 되돌림은 `publish-rollback-<run_id>.sql`(delete 없음).
6. **REBUILD**: publish receipt 커밋(`release: finalize five-city core production publish`) → master → Cloudflare. robots/sitemap/metadata 정상화. 최종 검증: DB 4,908/4,675/233 · GitHub master == Cloudflare source · 5도시 smoke.

invariant: `NEW_PLACE_VISIBLE_BEFORE_STATIC_PAGE_EXISTS = 0` · DELETE 0 · id 변경 0 · 사용자 테이블 write 0 · AI live call 0.

## 2. 실행 능력 (2026-08-22 실측)
- psql/pg/DB URL 없음 → DDL·트랜잭션은 Owner SQL Editor. service_role REST 는 STAGE(비노출·멱등)에만 사용. `TRANSACTION_SAFE_APPLY_CAPABILITY`: STAGE=REST-chunk-idempotent · PUBLISH=SQL-Editor-single-transaction.
- Supabase PostgREST `max_rows` = **1000** (Management API GET 실측). **코드가 이 값에 의존하지 않는다**(SUPABASE_MAX_ROWS_SETTING_RELIED_ON=NO).

## 3. SCALE READINESS (SCALE_READINESS_SCOPE=RELEASE_PIPELINE_CEILING_REMOVAL_ONLY)
목표: 장소가 10k/20k/50k 로 늘어도 조회·빌드·sitemap·import·publish 의 **기본 구조를 다시 뜯지 않는다**. City Package 플랫폼·권역 importer·CMS·registry 는 POST-LAUNCH FOUNDATION(미구현).

| 계층 | 구현 | 규모 독립 근거 |
|---|---|---|
| pagination | `src/lib/city-spots-paging.ts` keyset(id ASC · id>last · limit=pageSize) · pageSize 1,000(=Max Rows) · MAX_PAGES 1,000(=1M 행 safety guard, 초과 시 **명시적 실패**, partial 금지) · 정렬/초과 반환 검증 | 5페이지·4,908 같은 규모 상수 없음(테스트 P5) |
| FULL COLLECTION | `/place` static params · sitemap(`fetchPublicSpotIds`, REST keyset) · Explore 도시 목록(`fetchCitySpots`, supabase keyset) | synthetic 999…50,000 PASS(P1) |
| BOUNDED QUERY | Planner `/api/trip/plan`·Near Me: bbox(7km)+category 유지 + keyset → bbox 안 1,000 초과도 절단 없음. 후보 제한은 하류 expandZones/diversify(제품 계약)가 담당 — PostgREST 상한을 "의도된 limit" 으로 포장하지 않음 | — |
| hydration | itinerary/DayMap: 도시 전량 → `fetchCitySpotsByIds(place_id 집합)`(200개 chunk `.in`) — 도시 규모와 무관 | `ITINERARY_HYDRATION_CITY_FULL_SCAN=NO` |
| Explore 장기 | 현재 도시 전량(keyset) — 4,908 에서는 충분. **SCALE_BACKLOG**: 권역 수천 건이 되면 city+bbox+category 서버 범위 query 로 전환(UI 재설계 아님) | 전환 경로 명확 |
| static `/place` | `output:"export"` + `dynamicParams=false` 유지. 50k 실제 빌드는 하지 않음. **STAGE BUILD 에서 실측**(아래 §4) 후 threshold 확정. 장기 옵션: ① full static export 유지 ② build partition/sharding ③ Cloudflare Functions 기반 dynamic rendering(정적 export 제약상 Next SSR/ISR 아님) | `PLACE_STATIC_BUILD_SCALE_REVIEW_REQUIRED` trigger |
| sitemap | 단일 파일 + keyset 전량(4,675 OK; Next sitemap 50k URL 한도 내). 분할 경로: Next `generateSitemaps` 또는 정적 export 호환 분할 — 지금은 미적용 | `SITEMAP_SHARDING_FUTURE_READY=YES` |
| importer 기대값 | `manifest-expectations.ts`: input manifest + crosswalk summary → expected(active/match/new/twin/review/hide). 코드 상수 제거 | 다음 package(예: 532) 동일 importer |
| NEW identity | `identity.ts`: `source_type="canonical"`, `external_id="<city>:<canonical_id>"` — 012 `idx_city_spots_source_external` **partial** UNIQUE index(`WHERE external_id IS NOT NULL`, Production 실측)가 DB-level 멱등 보호. PostgREST `on_conflict` 추론 불가(EXPLAIN 42P10 실측) → STAGE 는 lookup-before-insert + 충돌 재조회(`stage-rest-writer.ts`, 테스트 T1~T9) | `PACKAGE_VERSION_COUPLED_IDENTITY=NO` · `POSTGREST_ON_CONFLICT_COMPATIBLE=NO` |
| STAGE | `stage-plan.ts`: 결정적 chunk(INSERT 200 / UPDATE 100) + sha256 + resume(`remainingInsertChunks`) + receipt invariant. `stage-rest-writer.ts`: upsert on_conflict + return=representation(실제 id) | synthetic 50k plan PASS(S3) |
| PUBLISH | `publish-sql.ts`: temporary target tables(VALUES) + DO 검증 + 단일 트랜잭션. `WHERE id IN (…)` 문자열·city 전체·id 범위 금지 | synthetic 50k SQL PASS(S3), 거부 규칙(S4) |
| DB index | 현재: PK id · `(city,is_published)`(056) · `(city,name)` 비유니크(057) · source identity UNIQUE. bbox 는 lat/lng 범위 스캔(city 필터 없음) — 5도시 4,908 에서는 문제 없음. **POST_LAUNCH_SCALE_INDEX_BACKLOG**: 수만 행·권역 확장 시 `(lat,lng)` 또는 `(city,lat,lng)` 복합 인덱스 검토(PostGIS 도입 아님) | 지금 신규 인덱스 추가 없음 |

## 4. STAGE BUILD 측정 계약 (실측 전 숫자 만들지 않음)
기록: DB rows · static param count · build duration · output size · deployment duration · `/place` route count · sitemap URL count · warning/failure. 이 baseline 이 10k+ 전략(§3 static 옵션)의 근거가 된다. 현재 이 문서의 ACTUAL_BUILD_DB_ROWS = 714(Production 미통합).

## 5. Owner Priority
`City Package architecture = POST-LAUNCH FOUNDATION` · 현재 우선순위: 5도시 Production integration 완료 → GoKoreaMate 오픈용 UI/function/design 복귀. `OWNER_OVERRIDE_IMAGE_REFRESH_BACKLOG`: #7·#28·#29·#42 legacy Unsplash 이미지(숨김 근거 아님).

## 6. STAGE WRITER COMPLETION (TASK-FIVE-CITY-CORE-STAGE-WRITER-COMPLETION-V1 · 2026-08-22) · DECIDED

### 6-0. OWNER DATA TRUST — null/absence policy (Owner 확정)
- **FINAL VALIDATED ARTIFACT > LEGACY.** Final 값이 있으면 Final 로 UPDATE. 필드 ownership 은 intake 가 각 artifact 의 base_row 매핑에서 기계적으로 기록한다(`owned_fields`/`deferred_fields`; Main 추측 0):
  - **FINAL_OWNED**(artifact 가 그 컬럼을 Final 필드로 매핑): 값 있음 → `REPLACE_WITH_VALUE`, 값 없음 = "공식 값 없음 확정" → **`FINAL_ABSENT_CLEAR`(null 로 UPDATE, legacy 보충 금지)**. 경주 `description`(en) 102건의 legacy 한국어가 여기 해당(Final 공식 EN 0 → clear, 기계 번역 0).
  - **DEFERRED**(값은 있으나 구조화 불가 → sidecar, 예: opening_hours raw) / **NOT_OWNED**(매핑이 None 상수 — artifact 에 그 필드 없음, 예: why_*) / **RUNTIME_DERIVED**(map_url·naver_map_url): `NO_SOURCE_VALUE` → UPDATE payload 제외(no-op). "NO_SOURCE_VALUE → legacy no-op" 은 전역 규칙이 아니다.
  - `INTENTIONALLY_CLEAR` = legacy Unsplash image_url 만. RUNTIME/REFERENCE(rating·review_count·is_published 등) 은 ownership 과 무관하게 불가침.
- **numeric `city_spots.id` 보존 ≠ legacy 콘텐츠 보존.** MATCH 462 는 id·reference 만 보존하고 콘텐츠는 Final 로 동기화.
- 이미지: Final image plan 이 authoritative. Final 에 없는 legacy image 는 `display_eligible=false`·`is_primary=false` 로 비노출(보존, DELETE 0). Final 이미지 없다고 legacy fallback 안 함(MATCH 132건 중 legacy 이미지 실존 0 — 재검증 불필요). `RIGHTS_UNKNOWN`/`KTO_TYPE_UNKNOWN` 은 DB CHECK 와 동일하게 eligible 금지.
- 출처: Final source plan 이 authoritative. identity 는 `(source_type, source_key)` **뿐**. 같은 identity 의 기존 행은 재사용·Final 값으로 동기화(Case A), identity 가 다른 spot 에 붙어 있으면 **자동 remap 금지·실패**(Case B), 같은 spot/provider 의 다른 key 는 **별도 행 INSERT**(migration 058 — 구 Case C "Final key 로 덮어쓰기" 폐기: legacy 행의 관계 의미를 바꾸지 않는다), Final 에 없는 legacy source 는 `is_primary=false`(Case D). DELETE 0.

### 6-1. Final source plan 수정(Main mapping 결함 3건 — 데이터 재검증 아님)
- 부산 NonFood `VisitBusanContent:<category>:<num>:<locale>` 를 `parts[1]`(category) 로 읽던 parser 결함 → 번호(uc_seq)로 교정, locale 변형 접음.
- 부산 Food: **모든 `matched_uc_seqs` 를 정식 `city_spot_sources` 행으로**(multi uc_seq 16 — migration 058 이 `uq_city_spot_sources_spot_provider` 제거). sidecar 접기(`source_keys_extra`) 폐기. 완전히 같은 `(entity, source_type, source_key)` 의 중복 직렬화 41건만 접음(Owner 승인 A).
- 전주 OFF 레코드의 `kto_cid` 는 근접 crossmatch 후보(FINAL-ARTIFACT-ALIGNMENT)라 provenance 로 쓰지 않음 — artifact 가 확정한 match_type 에서만 `kto` 출처(4건: OFF-10114·16133·16310·16670). 비확정 78건은 relation metadata 에 보존(Owner 승인 C).
→ 쓰기 대상 sources **5,621 − 41(exact dup) − 78(전주 non-provenance) = 5,502**(`FINAL_SOURCE_RELATION_TARGET`). images 4,394 불변. 구조 preflight: identity 공유 0 · exact 중복 relation 0 · primary 충돌 0 · rights 위반 0 · unresolved 0. **migration 058 적용 전 STAGE 금지**(적용 전엔 부산 Food 16행이 UNIQUE 위반으로 실패).

### 6-1a. migration 058 (`058_city_spot_sources_allow_multi_source_keys_per_provider.sql`, FILE ONLY)
`drop index if exists public.uq_city_spot_sources_spot_provider;` 한 문장. 유지: `uq_city_spot_sources_source`·`uq_city_spot_sources_primary`·FK·`idx_city_spot_sources_spot`·CHECK. 데이터·RLS·GRANT·POLICY 변경 0. 적용은 Owner 가 SQL Editor 에서 PRECHECK→MIGRATION→VERIFY 순으로(058 HANDOFF 보고서의 OWNER COPY 0/1/2).

### 6-1b. 후속 locale supplement 계약 (`locale-supplement.ts`)
경주 Final 공식 EN = 0. 후속 Owner 승인 English supplement 는 canonical_id → **기존 entity 의 en 필드만 UPDATE**(name/name_l10n.en/description/desc_l10n.en merge), 새 entity INSERT 0, identity 재매칭 0, ko 불변. 매핑 없는 canonical 은 unresolved(생성 금지). 번역 플랫폼 아님.

### 6-1c. 사용자 테이블 count guard · snapshot freshness (USER-COUNT-GUARD-FIX-V1, STAGE-V1-R1 HOLD 후속)
- `readUserTableCounts` 는 테이블별 실측 PK(`itineraries.id`·`trip_moments.moment_id`·`user_spots.id`·`place_reports.id`)로 `select=<pk>&limit=0` + `Prefer: count=exact` → `Content-Range: */N` 만 읽는다(body `[]`, 사용자 row 내용 0). non-2xx·Content-Range 누락·파싱 불가는 실패(0 fallback 없음). pre == post 아니면 STAGE CLOSED 금지.
- `--stage` 는 `pre-stage-match-snapshot-v1.jsonl` 을 기존 파일이 있어도 **항상 새로 생성**(STAGE 직전 상태, MATCH 전체 462 와 정확히 일치해야 첫 write 진행) 하고 `user-table-counts-pre-v1.json` 을 Phase A 이전에 기록한다.
- `--stage` 가드 (8) `DISCOVERY_VISIBILITY_GATE_ENABLED === true`(repo runtime contract import). 057/058 index 존재/부재는 PostgREST 로 introspection 불가 → importer 가드가 아니라 §6-1a PRECHECK(READ-ONLY SELECT)로 STAGE 직전 사람이 확인(Management API 토큰을 writer 프로세스에 두지 않는다).

### 6-1d. NEW bulk INSERT 계약 · receipt 즉시 기록 · 불변 snapshot (STAGE-INSERT-WRITER-FIX-V1, STAGE-V1-R2 partial HOLD 후속)
- **R2 실측 결함**: PostgREST bulk INSERT 는 한 요청의 모든 객체 key-set 이 같아야 한다(`PGRST102 All object keys must match`). `planImport` 는 값 있는 필드만 row 에 넣으므로 21 INSERT chunk 중 19 가 heterogeneous → 첫 chunk 400, NEW INSERT 0(Phase A 462 는 완료·유지).
- **fix**: `stageInsertChunkSafe` 가 lookup 후 없는 행을 `sorted(keys)` signature 별 subgroup 으로 나눠 각각 bulk INSERT(old plan 4,194 → 99 subgroup). 없는 키를 null 로 채우지 않는다(absent ≠ explicit null, DB default 보존, Final 값 변형 0). 값 불변·payload 컬럼 순서만 정렬(결정적). subgroup 마다 receipt 콜백(성공/실패 즉시). 한 subgroup 실패 시 이미 성공한 subgroup 은 남고 재실행은 lookup-first 로 재사용(중복 0).
- **오류 관측**: `StageRestError{where: phase/chunk/subgroup/request_rows, info: http_status/code/message/details/hint(2KB clip) or snippet}` — payload·헤더·키·사용자 row 기록 0.
- **receipt**: `stage-chunk-receipts-v1.<attempt>.jsonl` append-only(chunk/subgroup 직후), 실패 시 failure receipt + `stage-failure-v1.<attempt>.json`. 최종 `stage-receipt-v1.<attempt>.json`.
- **snapshot 불변**: `--stage`/`--pre-stage-snapshot` 은 `pre-stage-match-snapshot-v1.<attempt>.jsonl` 을 `wx`(존재 시 EEXIST) 로만 쓴다. R2 before-Phase-A evidence `pre-stage-match-snapshot-v1.r2-before-phaseA-2026-08-22T115804Z.jsonl`(462행, sha256 10240f4f…, ops 브랜치 `ops/five-city-core-production-stage-v1-r2` 커밋)은 절대 덮어쓰지 않는다. R3 는 실행 직전 새 attempt snapshot 을 만든다(현재 DB = Phase A 반영 상태).
- 경주 Food 교체 패키지 도착 전에는 stage plan 재생성·R3 실행 금지.

### 6-2. 구현
`stage-relations.ts`(resolveRelationTargets · preflightRelations · syncSourcesChunk · syncImagesChunk) · `stage-safety.ts`(buildPreStageSnapshot · chunkReceipt · readUserTableCounts/userCountsDiff · verifyNewUnpublished) · importer `--stage` Phase A(MATCH PATCH)→B(NEW lookup-before-insert, false)→C(sources, actual id)→D(images, Final source_id)→E(verify: DB count·NEW false 사후검증·사용자 테이블 count pre==post) + `stage-chunk-receipts-v1.jsonl` + `stage-receipt-v1.json` + `pre-stage-match-snapshot-v1.jsonl`(`--pre-stage-snapshot` READ-ONLY 모드). partial unique 는 lookup-first, full unique 는 conflict 재조회. 가드 8종 전부 통과해야 write.
