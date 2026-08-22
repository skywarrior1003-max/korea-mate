# Five-City Core Main Intake v1 — crosswalk · intake package · dry-run importer

TASK-MAIN-FIVE-CITY-CORE-INTEGRATION-PREP-AND-DRY-RUN-V1 · 2026-08-22 · Production write 0
§10 Pre-Production Gate (TASK-FIVE-CITY-CORE-PREPROD-GATE-V1 · 2026-08-22) — §3 의 '쌍둥이 197 = AMBIGUOUS' 과 §6·§7 의 게이트 권장은 §10 으로 **대체**된다.

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
