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
