# Five-City Core Main Intake v1 — crosswalk · intake package · dry-run importer

TASK-MAIN-FIVE-CITY-CORE-INTEGRATION-PREP-AND-DRY-RUN-V1 · 2026-08-22 · Production write 0

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
