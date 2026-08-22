# Five-City Core Main Intake v1 — crosswalk · intake package · dry-run importer

TASK-MAIN-FIVE-CITY-CORE-INTEGRATION-PREP-AND-DRY-RUN-V1 · 2026-08-22 · Production write 0
§10 Pre-Production Gate (TASK-FIVE-CITY-CORE-PREPROD-GATE-V1 · 2026-08-22) — §3 의 '쌍둥이 197 = AMBIGUOUS' 과 §6·§7 의 게이트 권장은 §10 으로 **대체**된다.
§11 ARTIFACT TRUST (TASK-FIVE-CITY-CORE-ARTIFACT-TRUST-AND-IDENTITY-CORRECTION-V1 · 2026-08-22) — **§10-1 의 Gate A 쌍둥이 판정(195/1/4,631)은 폐기**되고 §11 로 대체된다.
§12 FINAL ARTIFACT ALIGNMENT (TASK-FIVE-CITY-CORE-FINAL-ARTIFACT-ALIGNMENT-V1 · 2026-08-22) — **§11 의 전주 REVIEW_REQUIRED 35·보조컴퓨터 handoff 요청(§11-4)은 철회**되고 §12 로 대체된다.

## 1. 무엇인가

보조컴퓨터의 5도시 최종 canonical(ACTIVE 4,826)을 Main `city_spots`(714)에 **기존 id 를 보존하며** 넣기 위한
(1) crosswalk, (2) Main importer 가 그대로 소비하는 정규화 intake package, (3) dry-run 전용 importer 다.
실제 DB write 는 이 문서 범위 밖이다(별도 승인 TASK).

| 파일 (`data/main-intake/five-city-core-v1/`) | 행 | 내용 |
|---|---|---|
| `five-city-core-input-manifest-v1.json` | — | 입력 branch/SHA/path/rows/sha256, 출력 sha256, 매핑 정책 |
| `main-city-spots-snapshot-2026-08-22-v1.jsonl` | 714 | Main 비사용자 컬럼 스냅샷(anon SELECT). 사용자 데이터 0 |
| `five-city-core-crosswalk-v1.jsonl` | 4,829 | ACTIVE 4,826 + 경주 EXCLUDED 3 의 decision/tier/evidence |
| `five-city-core-main-classification-v1.jsonl` | 714 | 기존 Main 행 분류 (`delete:false` 전부) |
| `five-city-core-active-v1.jsonl` | 4,826 | city_spots 컬럼에 맞춘 정규화 값 + decision |
| `five-city-core-sources-v1.jsonl` | 6,129 | `city_spot_sources` 계약 |
| `five-city-core-images-v1.jsonl` | 4,564 | `city_spot_images` 계약 (display_eligible 3,882) |
| `five-city-core-deferred-fields-v1.jsonl` | 10,594 | schema 가 아직 못 받는 값(phone·영업시간 raw·eligibility·…) |
| `dry-run/*` | — | importer dry-run 산출(change manifest·id mapping·skipped·summary) |

재현: `python scripts/main-intake/build-five-city-core-crosswalk-v1.py` → `python scripts/main-intake/build-five-city-core-intake-v1.py`
→ `node --experimental-strip-types scripts/import-five-city-core-v1.ts --dry-run`. 입력 SHA 가 고정값과 다르면 멈춘다.

## 2. 고정 입력

| city | branch | SHA | artifact |
|---|---|---|---|
| busan food | `data/busan-food-discovery-v1` | `40ecc06` | `data/tourapi/normalized/busan/busan-food-194-canonical-v1.json` |
| busan nonfood | `data/busan-nonfood-complete-v1` | `26fb3af` | `data/tourapi/normalized/busan/busan-nonfood-canonical-v1.json` |
| busan 다국어 | `data/busan-multilingual-v1` | `c4305f3` | `data/tourapi/multilingual/busan/busan-{food,nonfood}-multilingual-enrichment-v1.jsonl` |
| gyeongju | `data/five-city-regional-content-handoff-v1` | `922cce0` | `data/gyeongju-final-release/gyeongju-canonical-places-v1.jsonl` (+ sources/images import jsonl) |
| seoul | `data/seoul-multilingual-v1` | `e9e9967` | `data/seoul-final-release/seoul-canonical-places-v1.jsonl` + `data/seoul-multilingual-v1/seoul-multilingual-enrichment-v1.jsonl` |
| jeju | `data/jeju-multilingual-v1` | `649d169` | `data/jeju-final-release/jeju-canonical-places-v1.jsonl` + `data/jeju-multilingual-v1/jeju-multilingual-enrichment-v1.jsonl` |
| jeonju | `data/jeonju-multilingual-v1` | `436fe37` | `data/jeonju-raw-collection-v1/jeonju-final-service-catalog-v1.json` + `data/jeonju-multilingual-v1/jeonju-multilingual-enrichment-v1.jsonl` |

ACTIVE: busan 194+764 · gyeongju 299(+3 EXCLUDED) · seoul 1,837(1,838−1) · jeju 1,496(1,607−111) · jeonju 236(423 중) = **4,826**.

## 3. Crosswalk 규칙과 결과

- 경주: `city_spot_sources.source_key == candidate_id` 302/302 → ACTIVE 299 MATCH_REPLACE, EXCLUDED 3 은 identity 만 확정(쓰지 않음).
- 부산 Food: `discovery_candidate_ids ∩ legacy external_id(busan-F-*)` = 97 MATCH_REPLACE(TIER1). 나머지 97 은 한글 상호 정확 일치+≤300m 또는
  (Main 상호에 한글이 없을 때) 도로명 주소 끝 동일+로마자 상호 유사≥0.8+≤50m 만 같은 지점 → 1건(슌사이쿠보 #407). 동명이라도 멀면(톤쇼우 9km) 다른 지점 → NEW 96.
- 부산 NonFood: Main 85행을 canonical 의 `name_ko`·좌표·주소·지역 정체성으로 직접 판정한 표(스크립트 `BUSAN_NONFOOD_DECISIONS`). 해변·산·공원·시장·선형 산책로는
  좌표 차이를 이유로 다른 장소로 보지 않는다. 결과 MATCH 64 · LEGACY_ONLY_VALID 18 · DUPLICATE_REVIEW 3(데이터계약 §16: #3→#21, #4→#16, #49→#27).
- 서울·제주·전주: Main 0 → NEW.
- 아티팩트 내부 쌍둥이(같은 이름 ≤150m; 부산 A↔VB 167쌍 등): 대표 1건만 intake, 나머지는 `AMBIGUOUS / DUPLICATE_CANONICAL` 로 write 제외 — 같은 장소를 두 번 INSERT 하지 않는다.

| | ACTIVE | MATCH_REPLACE | NEW | AMBIGUOUS(쌍둥이) |
|---|---|---|---|---|
| busan | 958 | 162 (food 98 · nonfood 64) | 627 | 169 |
| gyeongju | 299 | 299 | 0 | 0 |
| seoul | 1,837 | 0 | 1,820 | 17 |
| jeju | 1,496 | 0 | 1,495 | 1 |
| jeonju | 236 | 0 | 226 | 10 |
| **합** | **4,826** | **461** | **4,168** | **197** |

기존 Main 714: ACTIVE_MATCHED 461 · EXCLUDED_FROM_SERVICE_REVIEW 231(부산 historical 228 + 경주 3) · LEGACY_ONLY_VALID 19 · DUPLICATE_REVIEW 3 · 삭제 0.
ID 변경 0. 진짜 모호(entity 판단 불가) 0.

## 4. 필드 소유·null 계약 (`src/lib/main-intake/null-policy.ts`)

SOURCE(importer 가 씀): name · name_l10n · description · desc_l10n · why_* · category · subcategory · district · address · lat · lng · official_url · map_url · naver_map_url · opening_hours · tags · image_url.
RUNTIME/REFERENCE(절대 안 씀): id · city · rating · source_type · external_id(§4 동결) · created_at · updated_at. MANUAL: duration_minutes · best_time_slot · entry_fee · difficulty · solo_friendly · foreign_card_accepted · cash_only · affiliate_*.
null 의미: REPLACE_WITH_VALUE / INTENTIONALLY_CLEAR(legacy Unsplash image_url) / NO_SOURCE_VALUE(artifact 에 없음 — 자동 fallback 이 아니라 '쓰지 않음') / PRESERVE_RUNTIME_FIELD / MANUAL_REVIEW. `undefined`·`null`·`""` 는 로그에서 구분한다.

## 5. 어댑터

- locale: source `zh-CN` → Main `zh`; 조인 키 `canonical_place_id`(서울·제주) / `canonical_id`(부산) / `candidate_id`(전주) → `canonical_id`.
- category: Main CHECK 5종만. `food`→restaurant, `shopping`→attraction+subcategory, 전주 domain 10종 → 5종(NORMALIZE_MAP). SCHEMA_CHANGE_REQUIRED 0.
- opening_hours: `HH:MM-HH:MM` 한 구간만 `{open,close}`(SAFE 539) · 그 외 raw 는 deferred(1,729) · 없음(NO_SOURCE_VALUE).
- phone: `city_spots` 에 컬럼 없음 → deferred(`content_meta.phone` 예정). migration 없음.
- image: `city_spot_images` 가 권리 SSOT. VISITBUSAN/VISITSEOUL/VISITJEJU/VG/KTO Type1·3 → eligible; operator 추정(254)·RIGHTS_UNKNOWN(254)·KTO_TYPE_UNKNOWN(전주 174) → 비공개. pixabay 0. legacy Unsplash 는 자동 승계 없이 INTENTIONALLY_CLEAR. `city_spots.image_url` = eligible 대표 1장 캐시.
- sources: `(source_type, source_key)` — busan-food-canonical / busan6260000-* (uc_seq) / gyeongju-city · kto / visitseoul / visitjeju / kto(전주) / visitjeonju. is_primary 장소당 1.

## 6. 서비스 노출 게이트 (SERVICE_VISIBILITY_GATE_REQUIRED=YES)

현재 런타임은 `city_spots` 를 필터 없이 읽는다(`fetchCitySpots` city=eq · `/api/trip/plan` category in · `/place/[id]` 전체 id). legacy 231행은 지금도 노출 중이며 신규 4,168행은 INSERT 즉시 노출된다.
권장(데이터계약 §5·§7, migration 은 별도 승인): `is_published boolean not null default false` + `(city, is_published)` 인덱스 → importer 가 MATCH/NEW 에 true, legacy 는 사람이 정함 → 런타임 3곳에 `is_published = true` 조건. `place-source.ts` 주석이 이미 M1-A 이후 이 조건을 넣도록 예약돼 있다.

## 7. `/place/[id]` 정적 경로

`dynamicParams=false` + 빌드 시 전체 id 조회 → 현재 714 페이지. 통합 후 714 + 4,168 = **4,882** 페이지(빌드 시간·출력 크기 증가 예상; 1,500 규모 projection 은 §21 참고).
404 창을 막는 순서: ① migration(is_published) ② 런타임 필터 코드 배포 ③ DB write(신규는 is_published=true) ④ 즉시 재빌드/배포. 게이트 없이 ③ 을 먼저 하면 Explore(런타임)에서 새 장소가 보이되 `/place/<new id>` 가 재빌드 전까지 404 다.

## 8. importer (`scripts/import-five-city-core-v1.ts`)

dry-run 기본 · manifest sha256 검증 · MATCH_REPLACE = 숫자 id UPDATE · NEW = INSERT(placeholder `NEW:<canonical_id>`) · AMBIGUOUS/EXCLUDED SKIP · DELETE 없음 · per-city before/after · change manifest · id mapping · 결정적(run_id = sha256(입력+계획)).
apply 가드: `--apply` + env `FIVE_CITY_CORE_APPLY=YES` + `--confirm-manifest-hash <sha256(manifest)>` 세 가지가 맞아도 **v1 은 APPLY_DISABLED_IN_V1 로 멈춘다**(DB 쓰기 코드 없음). 실제 write 는 다음 승인 TASK 에서 이 가드 위에 구현한다.

## 9. 다음 단계 전 Owner 승인 필요

① `is_published`(+인덱스) migration 적용 ② 런타임 3곳 필터 코드 릴리스 ③ importer apply 구현·실행(트랜잭션, change manifest 저장, rollback manifest) ④ 재빌드·배포 ⑤ legacy 231행·준중복 3쌍의 노출 여부 결정(삭제 아님).

## 10. Pre-Production Gate (TASK-FIVE-CITY-CORE-PREPROD-GATE-V1 · 2026-08-22) · DECIDED

### 10-0. Owner Priority — 반드시 유지
- **현재 최우선 = GoKoreaMate 오픈.** 이 문서의 범위는 "5도시 Core integration 을 안전하게 끝내기 위한 최소 작업" 이다.
- **`City Package architecture = POST-LAUNCH FOUNDATION`** — Owner 가 승인한 방향이지만 지금 구현하지 않는다(범용 builder·전국 ingestion·도시 activation framework·관리 UI·data platform 일반화 금지).
- **`Current priority = 5-city integration completion + launch UI/function/design`** — 통합이 Production 까지 끝나면 Main 개발은 즉시 Home·Search·Explore·Place Detail·Picks·My Trip 등 오픈 제품 surface 로 복귀한다.
- 향후 확장을 막는 하드코딩은 피하되, 미래 플랫폼을 지금 만들지 않는다.

### 10-1. Gate A — 쌍둥이 197건 최종 판정 (`five-city-core-twin-resolution-v1.jsonl`)
| 용어 | 값 | 뜻 |
|---|---|---|
| SOURCE_ACTIVE_RECORD_COUNT | **4,826** | 보조컴퓨터 최종 artifact 의 ACTIVE 레코드 수 (레코드이지 장소 수가 아니다) |
| CONFIRMED_TWIN_RECORD_COUNT | **195** | 같은 장소의 두 번째 레코드(SAME_ENTITY_TWIN) — 대표만 write, 이 행은 SKIP_TWIN |
| TRUE_AMBIGUOUS_COUNT | **1** | `seoul-food-v1-0909` 사마르칸트시티 — 이름 동일·등록 주소 다름·92m. 판정 전 SKIP(삭제·병합 아님) |
| UNIQUE_SERVICE_PLACE_COUNT | **4,631** | = MATCH_REPLACE 461 + NEW 4,169 + TRUE_AMBIGUOUS 1 = 4,826 − 195 |
| DISTINCT_ENTITY | 1쌍(2행) | `OFF-9756`(국립전주박물관 경내 어린이박물관) ↔ `KTO-129786`(본관) — 복합시설 내부 별개 entity → 둘 다 NEW |

도시별 구성원: busan SAME 169 · seoul SAME 16 + TRUE_AMBIGUOUS 1 · jeju SAME 1 · jeonju SAME 9 + DISTINCT 2 · gyeongju 0.
관계 자동 규칙: 이름 동일 + (정규화 주소 동일/포함 또는 ≤30m) + 카테고리 동일 → SAME(HIGH). 주소가 다르고 >30m 이면 자동으로 같은 장소로 보지 않는다 → 명시 표(`TWIN_SAME_ENTITY`·`TWIN_DISTINCT`·`TWIN_TRUE_AMBIGUOUS`, 크로스워크 스크립트 상단)에 근거가 있을 때만 SAME/DISTINCT, 없으면 TRUE_AMBIGUOUS. 전주향교(106m, 같은 경내)는 명시 SAME.
**대표 선택 규칙(`lib.resolve_twins`)** — 순서대로: ① provenance 등급(entity 레코드 < page/article: 부산 A<K<E<VB, 전주 OFF<KTO) ② 괄호·따옴표·작가/기사 접두가 없는 깨끗한 고유명 ③ 공개 가능 이미지 ④ 설명문(CSS 잔재 제외) ⑤ 공식 URL ⑥ canonical_id 오름차순. 배열/파일 순서는 쓰지 않는다. 이 규칙으로 bc70b35 대비 대표가 바뀐 묶음은 1개(슬립노모어 서울: 괄호 없는 `seoul-KOPtpyykt`), MATCH 대상 Main id 변경 0.
crosswalk decision 은 `AMBIGUOUS` 를 폐기하고 `CONFIRMED_TWIN` / `TRUE_AMBIGUOUS` 로 쓴다.

### 10-2. Gate B — 서비스 노출 게이트 (`is_published`)
- 기존 계약 조사: 데이터계약 v1 §5 에 `is_published boolean NOT NULL DEFAULT false` + `(city, is_published)` 인덱스가 이미 DECIDED, §7 에 `is_published → catalog_ready/approved` 관계식. `place-source.ts` 가 "M1-A 이후 is_published=true" 를 예약. 런타임 구현은 0 이었다. → 새 개념을 만들지 않고 §5 의 첫 컬럼만 먼저 쓴다.
- **migration `supabase/migrations/056_city_spots_is_published.sql`(파일만 생성, 미적용)**: additive 컬럼 + 기존 행 전부 `true` backfill + 인덱스. DELETE·id·RLS·GRANT 변경 0. §5 의 나머지 14컬럼·§7 CHECK 는 readiness 파이프라인과 함께 별도 migration(이 파일은 그 부분집합).
- **런타임 `src/lib/city-spots-visibility.ts`**: `DISCOVERY_VISIBILITY_GATE_ENABLED=false`(기본) — 켜기 전에는 어떤 쿼리도 바뀌지 않으므로 migration 전 배포가 안전하다. 릴리스 커밋에서만 `true` 로 바꾼다(env 가 아닌 코드 상수: Functions ctx.env 와 Next process.env 가 달라 두 표면이 어긋나는 것을 막는다).
- **discovery vs reference** (이 구분이 핵심):

| 소비처 | scope | 동작 |
|---|---|---|
| Explore `fetchCitySpots`/`ByCategory` (ExploreCity) | discovery | 게이트 ON 이면 `is_published=true` 만 |
| 플래너 자동 후보 `functions/api/trip/plan.ts` bbox 쿼리 · `near-me/candidate-generator` | discovery | 숨긴 legacy 는 자동 공급에서 제외 |
| sitemap | discovery | 숨긴 legacy URL 미수록 |
| itinerary/page.tsx · ItineraryDayMap 의 `fetchCitySpots(city, "reference")` | reference | 저장된 place_id hydration — 숨긴 legacy 도 과거 일정에서 그대로 |
| 플래너 place_map(by id) · `src/app/api/trip/plan/route.ts` | reference | 필터 없음 |
| Story `shared/[id]/story.ts` · trip-moments · user-spots from-canonical/enrich · admin | reference | 필터 없음(id 검증만) |
| `/place/[id]` generateStaticParams | reference | 숨긴 legacy 도 페이지 생성(Saved/My Trip/Story 의 직접 링크 보존). `is_published=false` 면 `robots noindex,follow` |

- importer: 모든 UPDATE/INSERT 에 `is_published=true`. Main 분류 `EXCLUDED_FROM_SERVICE_REVIEW`(231)·`DUPLICATE_REVIEW`(3) = **234행 → `VISIBILITY_UPDATE is_published=false`**(보존·숨김). `LEGACY_ONLY_VALID` 19행은 **노출 유지**(backfill true, NO_WRITE) — 오너가 달리 정하면 그때 목록으로 숨긴다.
- 플래너 주의: Saved/This Trip 의 선호 id 는 후보 풀(bbox) 안에서 가점으로만 쓰인다. 숨긴 legacy 를 Saved 에 가진 사용자의 경우 자동 배치 후보에서 빠진다(이미 만든 일정 snapshot 은 영향 없음). This Trip hard-constraint 배치는 별도 미구현 과제.

### 10-3. Gate C — Semantic Category Contract (`five-city-category-mapping-v1.json`)
- `RUNTIME_COMPAT_CATEGORY` = `category`(Main CHECK 5종) · `SOURCE_SEMANTIC_CATEGORY` = 원본의 여행 의미 {attraction, restaurant, nature, event, accommodation, **shopping, culture, heritage, activity, specialty**}.
- 보존 규칙: semantic ≠ runtime → `subcategory = semantic 토큰`(기계가 읽는 값), 원본 세부 분류는 deferred `content_meta.subcategory_raw`. semantic == runtime → `subcategory = raw`. 복원 규칙 `semanticOf(row)`(category-adapter.ts) 하나로 Search/Explore/AI 가 같은 값을 읽는다.
- 원본 distinct 값: busan attraction/event/nature/restaurant · gyeongju attraction/restaurant · seoul attraction/nature/restaurant/**shopping(30)** · jeju attraction/event/**food(256)** · jeonju FOOD/PLACE_TOURISM/PLACE_TOURISM_REVIEW/PLACE_GENERAL/PLACE_CULTURAL(72)/PLACE_HERITAGE(25)/PLACE_NATURE/ACTIVITY_EXPERIENCE(1)/SPECIALTY_INTEREST(3, menu '쇼핑' → shopping)/ACCOMMODATION_HANOK_REVIEW.
- 결과: 매핑 23종 — DIRECT 4,304행 · NORMALIZED 522행 · DEFERRED 0 · **LOSSY_MAPPING_COUNT = 0** (행 단위 검산, importer 가 lossy 를 오류로 센다). semantic 분포: attraction 2,713 · restaurant 1,879 · nature 84 · culture 72 · shopping 33 · heritage 25 · event 14 · accommodation 5 · activity 1.
- UI(카테고리 필터·새 Explore/Search)는 이 TASK 범위 밖 — Product Surface 단계.

### 10-4. Pre-Production dry-run (2회 동일)
run_id `6218ce73e836f370` · 입력 manifest sha256 `eae3bfc8…29abb5` · change manifest sha256 `03a3f119…53acfa` · errors 0 · UPDATE 461 · INSERT 4,169 · SKIP_TWIN 195 · SKIP_TRUE_AMBIGUOUS 1 · EXCLUDED 3 · VISIBILITY_UPDATE(hide) 234 · NO_WRITE 19 · sources 5,595 · images 4,369 · DELETE 0 · apply = `APPLY_REFUSED`/`APPLY_DISABLED_IN_V1`.

| 분류 | 수 |
|---|---|
| projected DB total rows | **4,883** = 714 + 4,169 |
| service-visible unique rows | **4,649** = 461 + 4,169 + LEGACY_ONLY_VALID 19 |
| preserved hidden legacy rows | **234** (busan 231 · gyeongju 3) |
| direct-reference-only legacy rows | 234 (위와 같은 집합 — /place/<id>·Saved·Story 에서만 도달) |
| TRUE_AMBIGUOUS (미write) | 1 |

도시별 after(visible/hidden): busan 1,039(808/231) · gyeongju 302(299/3) · seoul 1,820 · jeju 1,495 · jeonju 227.

### 10-5. Production rollout 권장 순서 (이 TASK 에서 실행하지 않음)
1. Owner 승인 후 **migration 056** 을 Dashboard SQL Editor 에서 적용(기존 714 = true, 사용자 경험 불변).
2. 릴리스 커밋: `DISCOVERY_VISIBILITY_GATE_ENABLED=true` + 이 브랜치 코드 → master → Cloudflare 빌드(이 시점 DB 는 전부 true 라 화면 불변).
3. importer apply 구현(트랜잭션·change manifest 보관·rollback manifest) → **DB write**: UPDATE 461(is_published=true) · INSERT 4,169(true) · VISIBILITY_UPDATE 234(false) · sources/images upsert.
4. **즉시 재빌드·배포** → `/place/<new id>` 4,169 페이지 생성(총 4,883). 3→4 사이가 유일한 404 창이므로 연속 실행.
5. 사후: TRUE_AMBIGUOUS 1건·LEGACY_ONLY_VALID 19건 노출 여부·DUPLICATE_REVIEW 3쌍 처리(삭제 아님) Owner 결정.

## 11. ARTIFACT TRUST — identity correction (TASK-FIVE-CITY-CORE-ARTIFACT-TRUST-AND-IDENTITY-CORRECTION-V1 · 2026-08-22) · DECIDED

### 11-0. MAIN DATA INTEGRATION TRUST RULE
- **final validated city artifact 는 Main 의 input SSOT 다.** Main 은 4,826건의 품질을 다시 검수하지 않는다.
- **FINAL VALIDATED ARTIFACT > MAIN HEURISTIC.** artifact 의 identity / service status / relation 을 우선한다. 이름 유사·주소 동일·전화 동일·좌표 근접·같은 건물·같은 provider 는 Main 의 merge 규칙이 아니다(보조 evidence 일 뿐).
- Main 이 PARENT/CHILD/SUBENTITY/SAME_ENTITY 관계를 새로 만들지 않는다. artifact 에 구분이 있으면 그대로, 없으면 artifact 의 review status 를 따른다.
- `review_required` 는 원래 data collection track(보조컴퓨터 identity gate)에서 마감한다 — 재수집·전체 재검수가 아니라 이미 수집된 근거로 판정만.
- legacy DB 제약(`uq_city_spots_city_name`)을 만족시키려고 검증된 표시명/identity 를 왜곡하지 않는다 → 제약 쪽을 고친다(migration 057).
- Owner Priority 유지: **City Package architecture = POST-LAUNCH FOUNDATION**. 현재 우선순위 = 5도시 Production integration 완료 → GoKoreaMate 오픈용 UI/function/design 구현 복귀.

### 11-1. a14ba83 Gate A 쌍둥이 195건의 재분류 (artifact 근거만)
| 분류 | 건수 | 처리 |
|---|---|---|
| A. ARTIFACT_CONFIRMED_SAME_SOURCE_ENTITY — 부산 `provenance.source_keys` 의 같은 uc_seq(`AttractionService:N` ↔ `VisitBusanContent:attraction:N`) | **170**(A↔VB 170쌍; 옛 166 + 이름이 달라 옛 규칙이 못 잡던 3쌍 + 아미동 A-00109↔VB-876) | `CONFIRMED_TWIN` / `SAME_SOURCE_ENTITY`, basis `ARTIFACT_SOURCE_LINEAGE`. 대표 = primary_source 역할(entity API < 웹 페이지) |
| D. NO_RELATION_EVIDENCE — Main 휴리스틱 해제 | **29**: 부산 2(VB-548 신세계, A-00109 아미동 기사형) · 서울 17 · 제주 1 · 전주 9 | 둘 다 원래 ACTIVE 레코드로 복원(NEW). `five-city-core-heuristic-twin-release-v1.jsonl` |
| C. ARTIFACT_REVIEW_REQUIRED — 전주 `identity_review=True` | **33** (+ Main 보류 2: 전주드림랜드 OFF-16676/KTO-2790515 `UNRESOLVED_AFTER_ARTIFACT_INSPECTION`) | `REVIEW_REQUIRED`, write 보류, 병합·삭제 없음. `jeonju-identity-review-handoff-v1.jsonl`(35행) |
| B. ARTIFACT_DISTINCT | 나머지 전부 | 그대로 intake |

부산 Food ↔ Main 브리지는 artifact 가 기록한 lineage(`discovery_candidate_ids` · `canonical_discovery_id` · `image_recovery_v1.disc_id` · `identity_removed_cids`) 와 legacy `external_id` 일치만 인정 → 97 + **2 복구**(`busan-G-00004`→#287 톤쇼우 부산대점, `busan-G-00144`→#160 광안리 언양불고기부산집). 옛 TIER2(주소 끝+로마자 상호 유사) 폐기 → `busan-G-00164` 슌사이쿠보는 NEW, #407 은 legacy 보존. 부산 NonFood 64 MATCH 는 행 단위 사람 판정표(`BUSAN_NONFOOD_DECISIONS`, basis `MAIN_EXPLICIT_DECISION_TABLE`)로 자동 규칙이 아니며 Owner 가 재검토할 수 있게 basis 를 남겼다.

### 11-2. 재산정 (provisional — 전주 REVIEW_REQUIRED 35 미반영)
SOURCE_ACTIVE 4,826 = MATCH_REPLACE **462** + NEW **4,159** + ARTIFACT_SAME_ENTITY_SKIP **170** + REVIEW_REQUIRED **35**. ACTIVE_DISTINCT 4,656 · WRITEABLE_ACTIVE 4,621 · HEURISTIC_TWIN_AUTO_MERGE 0 · EVIDENCELESS_SKIP 0.
Main 714: ACTIVE_MATCHED 462 · EXCLUDED_FROM_SERVICE_REVIEW 230 · DUPLICATE_REVIEW 3 · LEGACY_ONLY_VALID 15 · **OWNER_OVERRIDE_KEEP_PUBLISHED 4**(#7·#29 이기대, #28 오륙도 스카이워크, #42 더베이101 — id 보존·published 유지·플래너 후보 포함). LEGACY_ONLY_VALID 15 는 일괄 hide 하지 않는다(Owner 결정 대기 목록: #5,6,23,32,39,50,55,57,61,64,68,81,82,93,94).
Projected DB: total **4,873**(714+4,159) · visible **4,640**(462+4,159+15+4) · hidden **233**(230+3). 도시별 after(visible/hidden): busan 1,037(807/230) · gyeongju 302(299/3) · seoul 1,837 · jeju 1,496 · jeonju 201(+보류 35).
dry-run 2회 동일: run_id `fcc0894262096c22` · input manifest `fad19e68…a37d77` · change manifest `58418313…9b3613` · errors 0 · sources 5,552 · images 4,360 · DELETE 0.

### 11-3. `(city,name)` 충돌 12건 — 표시명 변형 0, migration 057 로 해소
현재 schema(`uq_city_spots_city_name`, 013) 기준 INSERT/UPDATE blocker: busan Tonshou(#208 legacy ↔ #287←G-00004) · jeonju 진미반점(KTO-2870672/3444028, 별도 지점) · seoul Play with K(2회차) · Korea House(코리아하우스/한국의집) · Eid(이드 2건, 관계 없음) · Delhi India · Hwagyesa Temple · Nammi Plant Lab · Persian Palace · Sanchon · Sleep No More Seoul · Sultan Kebab(서울 POST/MEDIA 동명 쌍 — artifact 관계 필드 없음, 둘 다 write).
**migration `057_city_spots_drop_city_name_unique.sql`(파일만, 미적용)**: `DROP CONSTRAINT uq_city_spots_city_name` + 비유니크 `(city,name)` 인덱스. 의존처 감사: 런타임 (city,name) 조회 0 · importer identity = numeric id/canonical/(source_type,external_id) · RPC 025/048 EXISTS 사전검사 유지(제약명 분기만 사장) · `scripts/import-spots.ts`(legacy CSV, 미연결) 폐기 대상 · `matchCitySpot` 은 동명 여러 개면 null(ambiguity-safe).
6쌍 artifact verdict: 전주드림랜드 UNRESOLVED(보류) · 이드 관계 없음(둘 다 write) · 진미반점 DISTINCT_BRANCH · Play with K DISTINCT_ENTITY(회차) · Korea House DISTINCT_ENTITY · Tonshou G-00004=#287 SAME_SOURCE(lineage), #208 DISTINCT_BRANCH. merge 0 · rename 0.

### 11-4. 보조컴퓨터 전달용 exact task summary (복사용)
```
TASK-JEONJU-IDENTITY-GATE-FINALIZATION-V1 (targeted · 재수집 아님)
범위: data/main-intake/five-city-core-v1/jeonju-identity-review-handoff-v1.jsonl 의 35건만
  · 33건 = jeonju-final-service-catalog-v1 에서 identity_review=True(match_type AMBIGUOUS, identity-resolution INSUFFICIENT_EVIDENCE)
  · 2건 = 전주드림랜드 OFF-16676 / KTO-2790515 (Main 이 artifact 를 읽고도 관계 확정 불가)
요청: 각 행에 required_final_verdict_enum 중 하나(SAME_SOURCE_ENTITY·DISTINCT_ENTITY·DISTINCT_BRANCH·CONTAINED_SUBENTITY·KEEP_BOTH·EXCLUDE_ONE·
      OTHER_EXISTING_ARTIFACT_VERDICT)를 기존 artifact 근거로 기록 (기존 terminology 가 있으면 그것 우선)
금지: 5도시 재수집 · 4,826 재검수 · 전주 전체 재수집 · 새 broad web research
산출: 35행 verdict 파일 + 근거 필드 → Main 은 이를 crosswalk 에 번역만 한다
```

### 11-5. Production rollout 계약(유지·미실행)
MIGRATION(056·057, 순서는 Production TASK 에서 확정) → VISIBILITY CODE(게이트 ON) → **STAGE**(NEW 는 `is_published=false` 로 INSERT, MATCH 는 기존 id UPDATE, `INSERT … RETURNING id` 로 `canonical_id → city_spots.id` 매핑 artifact 저장) → **BUILD**(false 상태 신규 `/place` 정적 페이지 생성) → **PUBLISH**(매핑 id 목록만 true) → **REBUILD**(robots/sitemap/metadata 정상화). 404-free.

## 12. FINAL ARTIFACT ALIGNMENT — 전주 field semantics 정정 (TASK-FIVE-CITY-CORE-FINAL-ARTIFACT-ALIGNMENT-V1 · 2026-08-22) · DECIDED

### 12-0. MAIN DATA INTEGRATION FIELD SEMANTICS RULE
- Main 은 도시 artifact 의 **field 이름만 보고 의미를 추측하지 않는다.** 각 도시 collection pipeline 에서 그 field 의 실제 의미·final status·resolution semantics·source lineage·service eligibility 를 **함께** 읽는다(final catalog + crossmatch + identity-resolution + curation-input).
- `review` / `identity_review` / `match` / `candidate` 같은 이름이 있다고 해서 Production 보류나 동일 entity 를 자동으로 뜻하지 않는다.
- **TRUST RULE:** final validated artifact 의 `ACTIVE_SERVICE` 판정은 Main 이 이름/주소/전화/좌표 heuristic 으로 뒤집지 않는다.
- 도시별 규칙을 하나로 일반화하지 않는다(전주의 `phase1_bucket`/`_resolution_type` 같은 필드가 다른 도시에는 없다).

### 12-1. 전주 semantics (artifact 재확인 결과)
- `identity_review=True`(33건) = "좌표 근접 KTO 후보(`kto_cid`)와의 동일성을 확정하지 않아 **병합하지 않았다**" 는 carried flag. `entity_integration`: "AMBIGUOUS=93 coord-only proximity, identity unconfirmed. **Isolated, not merged**", `DUPLICATE=0`, `AMBIGUOUS_FORCED_MERGE=0`. 33건 전부 `phase1_bucket=SERVICE_ENTITY` · `final_status=ACTIVE_SERVICE`(artifact 자체의 REVIEW_REQUIRED bucket 25건과 겹치지 않음).
- `kto_cid` = 좌표 기반 가장 가까운 KTO crossmatch 후보. identity equality 주장이 아니다(34건 중 26건은 제목이 다른 장소: 전주향교→장현식고택, 한옥마을도서관→전주 대사습청 …). `kto_cid` 만으로 merge 금지.
- **explicit `parent_id` hierarchy column 은 없으며**, crossmatch/identity-resolution sidecar 에 관계 판정 metadata(`_resolution_type`/`classification`: PARENT_CHILD_OR_AREA_POI 19 · DISTINCT_ENTITY 36 · INSUFFICIENT_EVIDENCE 36 · SAME_ENTITY 2)가 존재한다. PARENT_CHILD 는 코스/추천 글(RELATION_CONTEXT) ↔ POI 에만 부여돼 있다.
- 전주드림랜드: OFF-16676 의 phone/좌표/대표주소가 전주동물원 공식 페이지(OFF-9784)와 같은 것은 상위 시설 대표값 공유(수집 계약상 정상), `kto_cid=126626` 은 근접 후보. KTO-2790515 는 별도 KTO POI. → 동물원(OFF-9784·KTO-126626)·드림랜드(OFF-16676·KTO-2790515) **4 레코드 전부 보존, 병합 0**.

### 12-2. Main 정정
| | §11(583c51b) | §12 |
|---|---|---|
| 전주 identity_review 33 | REVIEW_REQUIRED(보류) | **NEW**(basis ARTIFACT_SERVICE_STATUS) |
| 드림랜드 OFF-16676 · KTO-2790515 | REVIEW_REQUIRED(UNRESOLVED) | **NEW** |
| `jeonju-identity-review-handoff-v1.jsonl`(보조컴퓨터 QA 요청) | 35행 | **삭제** → `jeonju-relation-identity-metadata-v1.jsonl`(35행, `status=RELATION_METADATA_REFERENCE_ONLY`, `secondary_qa_request=false`) |
| 관계 metadata | — | sidecar + deferred `content_meta.relation` 35행(identity_review·proximity_kto_cid/title·artifact_resolution·parent_child_markers·main_note). Core schema 에 관계 컬럼 없음 → 새 schema 발명 없이 deferred 로 보존. identity 자동 변경 없음 |
| TARGETED_SECONDARY_QA_REQUIRED | YES | **NO** — data collection 미완이 아니라 Main semantic 오독이었음 |
MAIN_FLAT_MATCHING_MISCLASSIFICATION_COUNT=35 → 0.

### 12-3. 최종 산술 (final)
SOURCE_ACTIVE 4,826 = MATCH_REPLACE **462** + NEW **4,194** + ARTIFACT_SAME_ENTITY_SKIP **170** + REVIEW_REQUIRED **0** ✓ · ACTIVE_DISTINCT 4,656 · WRITEABLE_ACTIVE **4,656** · heuristic merge 0 · evidenceless skip 0 · rename 0.
Main 714: ACTIVE_MATCHED 462 · EXCLUDED 230 · DUPLICATE_REVIEW 3 · LEGACY_ONLY_VALID 15(일괄 hide 없음) · OWNER_OVERRIDE 4(#7·#29 이기대 2행 유지, #28 오륙도 스카이워크, #42 더베이101 — published·플래너 후보·id 보존; `OWNER_OVERRIDE_IMAGE_REFRESH_BACKLOG`: 4행 legacy Unsplash 이미지, 숨김 근거 아님).
Projected DB: **total 4,908**(714+4,194) · **discovery-visible 4,675**(462+4,194+15+4) · hidden 233. 도시별 after(visible/hidden): busan 1,037(807/230) · gyeongju 302(299/3) · seoul 1,837 · jeju 1,496 · jeonju 236.
dry-run 2회 동일: run_id `28fe56dcfe1cc00e` · input manifest `b4b04991…004503` · change manifest `55e26b98…5f31ee` · errors 0 · sources 5,621 · images 4,394 · DELETE 0 · LOSSY 0.
`(city,name)` 충돌 **13**(12 + 전주드림랜드 OFF/KTO) = migration 057 적용 전 schema blocker 일 뿐 identity blocker 아님(PROJECTED_CITY_NAME_CONFLICT_COUNT_BEFORE_057=13 / AFTER_057=0). 표시명 변경 0.

### 12-4. Production rollout 계약(불변·미실행)
MIGRATION 056+057 → VISIBILITY CODE RELEASE → STAGE(NEW `is_published=false` INSERT … RETURNING id → canonical_id↔id immutable mapping artifact; MATCH 는 기존 id UPDATE) → BUILD(reference scope 로 신규 /place 정적 페이지 선생성) → PUBLISH(mapping 의 승인 id 만 true; broad city update 금지) → REBUILD(robots/sitemap/metadata). invariant `NEW_PLACE_VISIBLE_BEFORE_STATIC_PAGE_EXISTS=0`. importer apply 는 `APPLY_DISABLED_IN_V1` 유지.
