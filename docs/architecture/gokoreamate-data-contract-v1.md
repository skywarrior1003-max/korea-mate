# GoKoreaMate 데이터 계약 v1 — 공식 SSOT

| 항목 | 값 |
|---|---|
| `document_title` | GoKoreaMate Data Contract v1 |
| `document_version` | **1.2** |
| `status` | **ACTIVE** — GoKoreaMate 데이터·DB·병합·보강 작업의 공식 최상위 SSOT v1.2 |
| `ssot_scope` | 장소 데이터 · identity · 사용자 여행 콘텐츠의 데이터 구조 · 공유/재방문 데이터 계약 · DB 물리 구조 · readiness/RLS · 스케줄러 데이터 · provenance · legacy 승계 · 병합·보강 · importer 계약 · 보조컴퓨터 계약 · 다도시 확장 |
| `product_authority` | **제품 목적·사용자 흐름·기능 우선순위·개인정보·바이럴·수익화 원칙은 `../product/gokoreamate-product-constitution-v1.md` v1.0 ACTIVE 를 따른다.** 이 문서는 그 원칙을 데이터·DB 구조로 구현한다 |
| `implementation_status` | 현재 구현 상태·수치는 `../product/gokoreamate-product-status-v1.md`(`authority: NONE`)가 기록한다 |
| `last_verified_commit` | `d50afef` (local master) |
| `last_verified_origin_commit` | `d50afef` (origin/master) |
| `last_verified_db_date` | 2026-07-29 |
| `document_updated_date` | 2026-07-29 |
| `schema_status` | 방향 승인(DIRECTION_APPROVED) · 물리 명세 확정 · **v1.1에서 review flag semantics 교정** · migration 미작성 · 운영 DB 미적용 |
| `pending_decisions` | §23 참조 — 현재 blocker **0건** / 사용자 실행 승인 **1건**(M5) / 기술 후속 **3건** / 향후 사업 결정 **1건** |

**표기 규칙** — `CONFIRMED` 코드·DB·파일 실측 / `DECIDED` 제품·운영 원칙 확정 / `PROPOSED` 후속 구현 전 권고 / `BLOCKED` 추가 결정·검증 필요.

이 문서는 기존 채팅 보고서보다 우선한다. 단 **실제 코드·DB가 이 문서와 다르면 문서에 맞추지 말고 작업을 중단하고 차이를 보고한다.**

---

## 1. 제품 방향 — Product Constitution 참조

**GoKoreaMate의 제품 목적 · 사용자 흐름 · 기능 우선순위 · 개인정보 · 바이럴 · 수익화 원칙은 `../product/gokoreamate-product-constitution-v1.md` (v1.0 `ACTIVE`)를 따른다.**

**이 문서는 그 제품 원칙을 데이터·DB 구조로 구현하는 계약이다.** 데이터 설계가 Product Constitution과 충돌하면 임의로 진행하지 않고 **중단·보고**한다.

**제품 판단 기준의 상세 목록은 Product Constitution 한 곳에서만 관리한다.** 이 문서는 중복 보유하지 않는다.

### 1-1. 데이터 판단에 직접 필요한 최소 요약 · DECIDED

아래는 데이터 구조 결정에 매번 필요한 항목만 남긴 것이다. 근거와 전문은 Product Constitution에 있다.

- **공개 카탈로그 장소와 사용자 기록을 구분한다.** 운영 장소 테이블에 들어갔다는 사실이 공식 기관 원천을 뜻하지 않는다. 승인된 사용자 제보도 provenance는 사용자 제보로 보존한다.
- **사용자 사진과 공식 장소 이미지를 같은 테이블·같은 권한 체계로 섞지 않는다.** 공유 이미지 우선순위는 사용자가 선택한 개인 사진이 1순위이며, 장소 이미지는 그것이 없을 때의 대체재다.
- **스케줄러와 상업 데이터를 분리한다.** 스케줄러는 provider ID·offer ID·수수료·상업 우선순위 등 상업 문맥을 입력받지 않는다. 상품 연결은 일정과 장소 순서가 확정된 **후** 렌더·추천 계층에서만 수행한다. 특정 파트너명을 애플리케이션 로직에 고정하지 않는다.
- **provenance를 보존한다.** 원천·수집 시각·연결 근거를 잃는 병합을 하지 않는다.
- **공개 상태와 개인 상태를 분리해 저장한다.** 축적과 공개는 다른 층위이며, 개인 기록의 기본값은 비공개다.

### 1-2. 권고 형식 · DECIDED

선택지를 나열하지 않고 권장안 1개를 먼저 제시한다. 판정 수준: `STRONGLY_RECOMMENDED` / `RECOMMENDED` / `ACCEPTABLE_ALTERNATIVE` / `NOT_RECOMMENDED` / `BLOCKED`.

---

## 2. 검증된 현재 사실 · CONFIRMED (측정일 2026-07-28)

| 항목 | 실측값 | 방법 |
|---|---|---|
| `city_spots` 행 수 | **86** (전부 `busan`, 도시 1개) | READ ONLY SELECT |
| 기존 컬럼 수 | **34** | `information_schema.columns` |
| `source_type` | **86/86 `manual`** | SELECT |
| `external_id` | **86/86 NULL** | SELECT |
| `name_l10n` | **86/86 NULL** | SELECT |
| `image_url` | **86/86 Unsplash 계열** (그중 79건 폐지된 `source.unsplash.com`) | 문자열 분류 |
| RLS 정책 | `anon_read_city_spots` **`qual = true`** | `pg_policies` |
| 읽기 경로 공개 필터 | **8경로 중 0개** | 코드 grep |
| `trip_moments` | **0행** | SELECT |
| Storage `moments` 객체 | **0개** | `storage.objects` |
| 개인 Trip Cover | **0건** (`cover_moment_id IS NOT NULL`) | SELECT |
| `itineraries` | **55건** · `days`에 `city_spot_id` **0건** · `place_id` 1건 | SELECT |
| 공식 candidate | **1,642** | `busan-linkage-index-21r.csv` |
| 공식 source row | **2,004** (3토큰 1,331 / 4토큰 673) | linked_source_keys 파싱 |
| 설명 확보 | **687** (바로 사용 657 · HTML 정리 30) / 없음 **955** | normalized 조인 |
| 설명 카테고리별 | restaurant 437/721 · attraction 212/717 · event 38/72 · **nature 0/50 · accommodation 0/82** | 조인 |
| 검증 영어 대표명 | **0건** (EngService2 194행은 후보와 미연결) | 조인 |
| `district` | 결측 **311** + 숫자코드(`16`·`3`·`12`·`1`) 오염 | 분포 |
| 이미지 상태 | sufficient 1,506 / exhausted 134 / partial 2 / missing 0 | 21Q CSV |
| 권리 | VB **958 전건 `operational_assumed`**, `rights_confirmed` **0** | 21H-REV2 |
| legacy | `restaurants` 100행 · `places` 194행 — **둘 다 소비 코드 0건** | grep |
| 응답 크기 실측 | `select *` 행당 1,242B / 목록 8필드 212B / 핀 4필드 63B / 일정 6필드 142B | anon REST |
| `/place/[id]` | 전량 정적 생성, 페이지당 약 70KB, 빌드 시 REST 1회 | `out/place` 실측 |
| `city_spots.id` | `is_identity=YES`, `generation=BY DEFAULT`, `max(id)=95` | `information_schema` |

**수치가 달라졌으면 최신 실측값을 쓰고 차이를 보고한다.**

**목표 (DECIDED)** CATALOG_READY 1,200+ · SCHEDULER_READY 800+ · FEATURED_READY 500+ · 부산 장기 1,500+ · 다도시 5,000+. FEATURED 500은 전체 공개를 500으로 제한한다는 뜻이 **아니다**. 기능 개발과 데이터 보강은 **병렬**로 진행하며, 파일럿 규모로 장기 목표를 축소하지 않고 불안정한 데이터로 숫자만 채우지도 않는다.

---

## 3. 논리 데이터 영역 · DECIDED

| 영역 | 내용 | 저장 위치 |
|---|---|---|
| **A. PLACE_CORE** | canonical 정체성 · 이름 · category/subcategory · 주소 · **사용자 도착 좌표** · district/zone · 공개·검수·readiness | `city_spots` |
| **B. DISPLAY_CONTENT** | description · why_it_matters · highlights · visit_tips · 운영시간 · 가격 · 공식 정보 · 지도 연결 | `city_spots` (일부 후속) |
| **C. SCHEDULER_DATA** | schedulable · schedule_role · zone · rule_v1 · override · rule_version | `city_spots` |
| **D. PROVENANCE** | source identity · source key · 외부 ID · 언어 · **원천 좌표** · URL · 수집·수정·확인 시각 · 연결 근거 | `city_spot_sources` |
| **E. PLACE_MEDIA** | 장소 대표·보조 이미지 · 역할 · 권리 · 장소 일치 · 원본/출처 · 순서 | `city_spot_images` |
| **F. USER_TRIP_CONTENT** | itinerary · day · place order · 사용자 선택 사진 · 개인 Trip Cover · Moment · 메모 · 공개 여부 · 장소 snapshot | `itineraries` · `trip_moments` |
| **G. COMMERCIAL_OFFERS** | eSIM · 숙박 · 액티비티 · 교통 · 입장권 · 기타 | 후속 별도 구조 |

**공식 장소 이미지와 사용자 추억 사진은 같은 테이블·같은 권한 체계로 섞지 않는다.**

---

## 4. `city_spots` 기존 34컬럼 처리 · DECIDED

**자동 검산 (2026-07-28)** `information_schema.columns` 실제 34개 ↔ 아래 **분류표** 34개 일치, 각 컬럼 출현 **정확히 1회**, 누락 0, 중복 0. 검산 방법: 분류표 범위의 백틱 토큰(숫자 포함 `[a-z0-9_]+`)을 `Counter` 로 세어 DB 컬럼명과 대조한다. **집합 교집합만으로는 중복을 놓친다.** 표 아래 설명 문장은 검산 범위에 포함하지 않으며 컬럼명을 백틱으로 표기하지 않는다. 사람이 세지 않는다.

| 처분 | 컬럼 |
|---|---|
| **그대로 유지** | `id` `city` `category` `subcategory` `district` `address` `tags` `opening_hours` `duration_minutes` `best_time_slot` `entry_fee` `difficulty` `official_url` `solo_friendly` `foreign_card_accepted` `cash_only` `rating` `created_at` `updated_at` |
| **의미 명확화 후 재사용** | `lat`/`lng` → **사용자 도착 좌표**(원천 좌표는 sources) · `name` → 영문 대표명 · `name_l10n` → 다국어 이름 SSOT · `description` → short summary 역할 · `desc_l10n` → **description 다국어 SSOT** · `why_it_matters` 유지 · `why_l10n` → **why_it_matters 다국어 SSOT** · `image_url` → **대표 이미지 캐시**(SSOT는 `city_spot_images`) |
| **신규 데이터로 점진 교체** | `map_url` `naver_map_url` → 검증된 exact URL만 유지, 일반 search URL은 런타임 생성 |
| **deprecated 동결** | `source_type` `external_id` — **값을 손대지 않는다. 신규 다중 원천을 여기 저장 금지** |
| **향후 제거 후보** | `affiliate_url` `affiliate_provider` — commercial offer 구조 이관 후 |

**기존 컬럼과 중복되는 신규 컬럼을 만들지 않는다.** canonical_name_ko/en · map_name_ko 신설은 기존 name + name_l10n 과 SSOT 가 이중화되므로 채택하지 않는다. (이 문장은 분류가 아니므로 위 검산 범위 밖이다.)

---

## 5. `city_spots` 신규 컬럼 목록 (SSOT) · DECIDED

**개수가 아니라 아래 목록이 SSOT다. 개수는 목록에서 자동 검산한 값만 기록한다.**

```
is_published
review_status
review_flags
catalog_ready
scheduler_ready
featured_ready
zone
schedulable
schedule_role
scheduler_override
scheduler_rule_version
arrival_anchor_type
arrival_anchor_verified_at
arrival_anchor_source
content_meta
```

**자동 검산 (2026-07-28)** 항목 **15**개 · 중복 **0**개. 검산 방법: 위 코드블록을 줄 단위로 파싱해 `len(items)` / `len(set(items))` 비교. 사람이 세지 않는다.

| 컬럼 | 타입 | NULL | 기본값 | CHECK 개요 | 공급 | 화면 | 스케줄러 | 인덱스 |
|---|---|---|---|---|---|---|---|---|
| `is_published` | boolean | NO | `false` | §7 관계식 | importer/승인 | — | — | `(city, is_published)` |
| `review_status` | text | NO | `'collected'` | 5값 enum | 보조+메인 | — | — | — |
| `review_flags` | text[] | NO | `'{}'` | 허용 flag 목록 | 보조 | — | — | 없음(1,500 규모) |
| `catalog_ready` | boolean | NO | `false` | §7 | importer 규칙 | — | — | 부분 |
| `scheduler_ready` | boolean | NO | `false` | §7 | importer 규칙 | — | ○ | — |
| `featured_ready` | boolean | NO | `false` | §7 | importer 규칙 | ○ | — | 부분 |
| `zone` | text | YES | NULL | — | 보조(정규화) | ○ | **○** | `(city, zone)` |
| `schedulable` | boolean | NO | **`false`** | — | rule_v1 승격 | — | **○** | `(city, schedulable, category)` |
| `schedule_role` | text | YES | NULL | 7값 enum | rule_v1 | — | **○** | 위 복합 |
| `scheduler_override` | jsonb | YES | NULL | object | 메인(예외만) | — | ○ | — |
| `scheduler_rule_version` | text | YES | NULL | — | importer | — | — | — |
| `arrival_anchor_type` | text | YES | NULL | 11값 enum(§8) | 보조(분류) | — | — | — |
| `arrival_anchor_verified_at` | timestamptz | YES | NULL | — | 메인 승인 | — | — | — |
| `arrival_anchor_source` | text | YES | NULL | — | 메인 | — | — | — |
| `content_meta` | jsonb | YES | NULL | object 여부만(§9) | importer | — | — | — |

---

## 6. review 구조 · DECIDED

**`review_status`** = 장소 정체성·기본 검수의 **전체 진행 상태**. 허용값 `collected` · `in_review` · `approved` · `rejected` · `archived`.

**`review_flags text[] NOT NULL DEFAULT '{}'`** = 동시에 존재할 수 있는 **부족 항목**. 허용 flag (v1.1 확정):

```
needs_identity
needs_translation
needs_content
needs_image
needs_arrival
needs_arrival_verification
needs_map_name_ko
needs_district
needs_hours
needs_restaurant_branch
```

**자동 검산 (2026-07-28)** 항목 **10**개 · 중복 **0**개. 위 코드블록을 줄 단위로 파싱해 `len` / `len(set)` 비교한다. 사람이 세지 않는다.

**flag 의미 정의 (v1.1 교정)**

| flag | 의미 | 해당하지 않는 것 |
|---|---|---|
| `needs_identity` | canonical 장소 동일성이 불명확 — 동명 장소 충돌 · 음식점 지점 불명확 · 중복 장소 가능성 · 서로 다른 시설 가능성 · source 간 identity 충돌 | **`external_id` NULL · 공식 source 연결 없음 · `source_type='manual'` · 자동 갱신 원천 없음** (이는 provenance·자동 갱신 상태이며 identity와 분리한다) |
| `needs_translation` | GoKoreaMate 기본 fallback 언어인 **영어**의 canonical display name이 없거나 신뢰할 수 없음 — 사용자가 장소를 구분할 필수 영문 표시 정보 부재 | **`name_l10n.ko` 없음 · 일본어/중국어 번역 없음 · 영문 description 부족**(→ `needs_content`) · 검증된 legacy 영문 대표명이 있는데 공식 source 영어명만 없는 경우 |
| `needs_arrival` | 좌표 없음 · 좌표가 명백히 잘못됨 · 다른 장소 좌표 가능성 · **사용자를 안전하게 안내할 수 없음** | 좌표로 접근은 되는데 최적 진입점만 미검증인 경우(→ `needs_arrival_verification`) |
| `needs_arrival_verification` | 현재 좌표로 장소 접근은 가능하나 **정문·출입구·주차장·셔틀·트레일 입구 등 최적 도착점 검증이 남음** | 좌표 자체가 없거나 틀린 경우(→ `needs_arrival`) |
| `needs_map_name_ko` | Naver Maps 검색 · 한국 현지 지도 확인 · 택시 기사·현장 안내에 쓸 **검증된 한국어 장소명 부족** | 영문명 부재(→ `needs_translation`) |
| `needs_content` | `description`·`why_it_matters` 등 사용자 판단용 콘텐츠 부족 | 이름 부재 |
| `needs_image` | 장소와 일치하는 대표 이미지 부족 | — |
| `needs_district` | district/zone 확정 불가 | — |
| `needs_hours` | 운영시간 미확인 | — |
| `needs_restaurant_branch` | 음식점 지점 동일성 불명확 | — |

**readiness별 차단 flag 매트릭스** (10/10 전건 명시)

| flag | CATALOG 차단 | SCHEDULER 차단 | FEATURED 차단 |
|---|---|---|---|
| `needs_identity` | ● | ● | ● |
| `needs_translation` | ● | ● | ● |
| `needs_arrival` | ● | ● | ● |
| `needs_district` | ● | ● | — |
| `needs_restaurant_branch` | ● | ● | ● |
| `needs_content` | — | — | ● |
| `needs_image` | — | — | ● |
| `needs_arrival_verification` | — | — | — |
| `needs_map_name_ko` | — | — | — |
| `needs_hours` | — | — | — |

**공존 규칙** `approved` 상태에서도 **비차단 flag는 남을 수 있다**. 예: `review_status='approved'` + `review_flags={needs_image}` → `catalog_ready=true`, `scheduler_ready=true`, `featured_ready=false`. 데이터 부족 flag와 전체 검수 상태를 혼동하지 않는다. **GIN 인덱스는 만들지 않는다** — 1,500건 규모에서 불필요하며, 실제 필요성이 측정된 뒤 추가한다.

---

## 7. readiness와 공개 관계 · DECIDED

**예외 없이 유지한다.**

```
is_published    → catalog_ready
is_published    → review_status = 'approved'
featured_ready  → catalog_ready
scheduler_ready → catalog_ready
```

CHECK 표현식 방향(SQL 아님): `NOT is_published OR catalog_ready` 형태로 작성해 **NULL 통과를 만들지 않는다**. `review_status`는 NOT NULL이므로 비교가 안전하다.

**공항·역·터미널도 예외를 만들지 않는다.** 아래 최소 정보를 확보해 `catalog_ready=true`, `is_published=true`로 관리한다 — 정확한 한국어·영어 이름 · 주소 · 도착 좌표 · 지도 연결 · 시설 유형 · 짧은 설명 · 공식 원천 · 검수 완료.

**별도 service_role 스케줄러 경로나 SECURITY DEFINER RPC는 현재 만들지 않는다.** 근거: `functions/api/trip/plan.ts:124-128`이 **anon 키**를 사용하고 `near-me/candidate-generator.ts`는 헤더에 "service role key forbidden"을 명시하므로(CONFIRMED), 비공개 anchor를 두면 스케줄러가 읽지 못한다. 공항·역·터미널은 내부 계산용 비공개 지점이 아니므로 공개 장소로 관리하는 편이 단순하고 정확하다.

**향후 재검토 조건** 임시 환승 좌표 · 클러스터 중심점 · 계산용 가상 장소 · 운영 전용 경로 기준점 같은 **내부 전용 지점이 실제로 생길 때만** RPC 도입을 재검토한다.

---

## 8. arrival_anchor 정책 · DECIDED

**`arrival_anchor_type` 11종**
`beach_access` · `park_gate` · `market_entrance` · `trailhead` · `viewpoint` · `venue_entrance` · `building_location` · `accommodation_entrance` · `station` · `transport_hub` · `other`

정의 — `station`: 철도역·도시철도역 / `transport_hub`: 공항·버스터미널·여객터미널 등 대형 교통거점.

**도착 좌표 원칙** 해변=바다·모래사장 접근점 / 시장=대표 건물 주출입구 / 관리형 공원=정문·주차장·셔틀 출발점 / 트레일=실제 진입점 / 전망대=차량 또는 보행 도착점 / 음식점·숙박=해당 지점 건물 입구. **원천 좌표가 바뀌어도 사용자 도착 좌표를 자동으로 덮어쓰지 않는다.**

**화면 노출 정책**

| 경로 | arrival_anchor 노출 |
|---|---|
| Explore 일반 둘러보기 | 기본 제외 |
| Trending·추천 | 제외 |
| 일반 관광 지도 탐색 | 기본 제외 |
| **명시적 장소 검색** | **포함** (외국인이 "Gimhae Airport"·"Busan Station"을 검색해야 함) |
| 장소 상세 URL | 포함 |
| 일정 생성 | 포함 |
| 일정 내 지도·도착·출발 처리 | 포함 |

**`catalog_ready`는 공개 품질을 뜻하며 Explore 노출 여부를 뜻하지 않는다.** 별도 `is_discoverable` 컬럼을 만들지 않고 **쿼리 문맥 + `schedule_role`** 로 노출을 결정한다.

---

## 9. content_meta 계약 · DECIDED

**JSONB 단일 컬럼. 자유 키 사용 금지.**

```json
{
  "version": 1,
  "names": {
    "en": { "origin": "official", "source_keys": ["..."], "verified_at": "2026-07-28T00:00:00Z" },
    "ko": { "origin": "official", "source_keys": ["..."], "verified_at": "2026-07-28T00:00:00Z" }
  },
  "description": {
    "origin": "generated_from_verified_facts",
    "source_keys": ["busan_official_api:AttractionService:123:ko"],
    "generation_rule": "summary_rule_v1",
    "verified_at": "2026-07-28T00:00:00Z"
  },
  "why_it_matters": {
    "origin": "legacy_verified", "source_keys": [], "verified_at": "2026-07-28T00:00:00Z"
  }
}
```

**`origin` 허용값** `official`(공식 원문) · `official_translated`(공식 원문 번역) · `legacy_verified`(legacy 검증 승계) · `generated_from_verified_facts`(검증 사실 기반 생성) · `hand_written`(직접 작성) · `auto_summary`(자동 요약).

**필요성 근거** 장소가 어느 원천에서 왔는지(`city_spot_sources`)와 **지금 화면에 나가는 문장이 어떻게 만들어졌는지**는 별개다. 원문 복사와 사실 기반 생성은 저작권 노출도 다르다.

**검증 위치** DB는 `content_meta IS NULL OR jsonb_typeof(content_meta)='object'`만 CHECK한다. 내부 키·enum·날짜·source key는 **importer JSON schema**가 검증한다. 다국어는 `names.{language}` 형태로 처리하며 `name_en_origin`·`name_ja_origin` 같은 컬럼 증식을 만들지 않는다.

---

## 10. scheduler 구조 · DECIDED

**별도 1:1 `city_spot_scheduler_profiles` 테이블은 만들지 않는다.** 최다 호출 경로가 `functions/api/trip/plan.ts:139`의 bbox 스캔이라 조인 추가가 손해다(CONFIRMED).

**일반 컬럼(빈번한 SQL 필터)** `schedulable` · `schedule_role` · `zone`

**기본 파생** `category + subcategory + 검증된 운영 사실 → scheduler_rule_v1`

**예외** `scheduler_override jsonb` + `scheduler_rule_version`

**rule_v1 또는 override에서 처리** `recommended_duration_min` · `best_time_slot` · `meal_slot` · `indoor_outdoor` · `weather_dependency` · `reservation_required` · `difficulty` · `walking_required`

**`schedule_role` 허용값** `attraction` · `meal` · `cafe` · `fixed_event` · `accommodation` · `arrival_anchor` · `display_only`

**`schedulable` 기본값은 `false` 다.** 미검수 장소가 이전 코드 경로나 잘못된 쿼리로 일정 후보에 섞이지 않게 하는 안전 기본값이다. `rule_v1`·importer 는 **아래 4조건을 모두 만족할 때만** `true` 로 승격한다.

```
review_status   = 'approved'
catalog_ready   = true
scheduler_ready = true
schedule_role IS NOT NULL
schedule_role  <> 'display_only'
```

`schedule_role IS NOT NULL` 을 반드시 함께 둔다. `NULL <> 'display_only'` 는 TRUE 가 아니라 **NULL** 이라 구현마다 판정이 갈린다.

`scheduler_ready=true` 만으로는 일정 후보에 오르지 않는다 — `scheduler_ready` 는 데이터 준비 상태, `schedulable` 은 운영 노출 스위치다. 기존 승인 장소는 §17 backfill manifest 에서 행별로 설정한다.

**보조컴퓨터가 1,500행의 스케줄러 파생값을 수작업으로 채우지 않는다.** 상업 offer는 스케줄러 입력에서 분리한다.

---

## 11. `city_spot_sources` · DECIDED

신규 1:N. 예상 부산 규모 — 장소 1,642 / source row **2,004**.

**물리 명세**

| 컬럼 | 타입 | NULL | 기본값 | CHECK |
|---|---|---|---|---|
| `id` | `bigint GENERATED ALWAYS AS IDENTITY` | NO | — | PK |
| `city_spot_id` | `bigint` | NO | — | FK |
| `source_namespace` | `text` | NO | — | **CHECK 없음** (importer 허용목록) |
| `service_name` | `text` | NO | — | **CHECK 없음** |
| `content_type` | `text` | YES | NULL | — (4토큰 키 전용) |
| `external_id` | `text` | NO | — | `length(external_id) > 0` |
| `language` | `text` | NO | `'ko'` | **CHECK 없음** (BCP 47, importer 검증) |
| `source_key` | `text` | NO | — | `length(source_key) > 0` |
| `source_url` | `text` | YES | NULL | — |
| `display_url` | `text` | YES | NULL | — |
| `source_lat` | `double precision` | YES | NULL | `-90 ≤ x ≤ 90` |
| `source_lng` | `double precision` | YES | NULL | `-180 ≤ x ≤ 180` |
| `source_updated_at` | `timestamptz` | YES | NULL | — |
| `collected_at` | `timestamptz` | NO | — | — |
| `last_seen_at` | `timestamptz` | NO | `now()` | — |
| `link_basis` | `text` | NO | — | 4값 enum |
| `link_basis_raw` | `text` | YES | NULL | — |
| `is_primary` | `boolean` | NO | `false` | — |
| `is_active` | `boolean` | NO | `true` | — |
| `created_at` / `updated_at` | `timestamptz` | NO | `now()` | 앱이 갱신(트리거 0) |

**source_key 형식** 3토큰 `Service:ID:lang` (1,331) 또는 4토큰 `VisitBusanContent:type:ID:lang` (673). **`split(":")[1]` 고정 인덱싱 금지** — 토큰 수 분기 필수.

**`link_basis` 허용값** `official_id_direct` · `geo_title_category` · `manual_confirmed` · `imported_legacy`. 부산 배분(source row 기준): `official_id_direct` **1,642** + `geo_title_category` **362** = 2,004.

**제약**
- `FK city_spot_id → city_spots(id) ON DELETE CASCADE`
- `UNIQUE (source_namespace, source_key)` — 전역 `UNIQUE(source_key)`는 타 도시 충돌 위험
- **표현식 UNIQUE** `(source_namespace, service_name, COALESCE(content_type,''), external_id, language)` — `content_type` NULL이 1,331건이라 일반 UNIQUE는 NULL 누수로 중복 통과
- `UNIQUE (city_spot_id) WHERE is_primary AND is_active`
- 인덱스 `(city_spot_id)` · `(source_namespace, external_id)` · `(is_active, last_seen_at)`

**`source_namespace` 와 `language` 에는 고정 CHECK를 두지 않는다.** 도시·언어를 추가할 때마다 migration이 필요해져 확장 원칙과 충돌한다. 둘 다 `TEXT NOT NULL` 로 두고 **importer 허용목록**으로 검증하며, `language` 는 BCP 47 형식(`ko`·`en`·`ja`·`zh-Hans`·`zh-Hant`)을 따른다. CHECK를 유지하는 것은 **값 집합이 제품 정의로 닫혀 있는 `link_basis`·`image_role`·`rights_status`·`place_match_status`·`review_status`·`schedule_role`·`arrival_anchor_type`** 뿐이다.

**접근** anon/authenticated 직접 SELECT 금지. RLS 활성 + 정책 0개 + `REVOKE ALL`을 **테이블·컬럼 양쪽**에 적용(027의 컬럼 권한 잔존 교훈). service_role 또는 내부 서버 처리만. 사용자 화면에는 필요한 공식 링크만 선택 노출.

**legacy `city_spots.source_type`/`external_id`는 동결한다.**

---

## 12. `city_spot_images` · DECIDED

신규 1:N. 사용자 사진·Moment·개인 Trip Cover와 **완전히 분리**한다.

**저장 방식 확정 · CONFIRMED 기반** 운영에 이미 세 가지 제공 경로가 있다 — ①관광 자산: manifest의 외부 HTTPS `image_url` 을 `/img/cover/[assetId]` 가 **프록시 스트리밍**(`functions/img/cover/[assetId].ts:64,75`) ②개인 사진: Supabase Storage private 버킷 + `storage_path`, `/img/trip-cover/[id]` 가 `.download()` 로 바이트 스트리밍하며 **signed URL·경로를 절대 노출하지 않음**(`functions/img/trip-cover/[itineraryId].ts:11,124-125`) ③`city_spots.image_url`: 외부 URL 원문 직접 저장(현재 Unsplash 86/86).

**따라서 `city_spot_images` 는 원본 위치만 저장하고 표시 URL은 런타임에 생성한다.** 물리 명세에 택일(A 또는 B) 표현을 쓰지 않으며, 아래 표의 컬럼이 그대로 실제 컬럼이다.

| 컬럼 | 타입 | NULL | 기본값 | CHECK |
|---|---|---|---|---|
| `id` | `bigint GENERATED ALWAYS AS IDENTITY` | NO | — | PK |
| `city_spot_id` | `bigint` | NO | — | FK |
| `image_role` | `text` | NO | — | `primary`·`context`·`experience`·`food` |
| `original_url` | `text` | YES | NULL | 외부 원천이 제공한 원본 HTTPS |
| `storage_path` | `text` | YES | NULL | Supabase Storage 경로. **응답에 절대 노출 금지** |
| `source_namespace` | `text` | YES | NULL | CHECK 없음 |
| `source_image_id` | `text` | YES | NULL | — |
| `rights_status` | `text` | NO | `'review_required'` | `rights_confirmed`·`operational_assumed`·`review_required`·`blocked` |
| `place_match_status` | `text` | NO | `'unverified'` | `verified`·`likely`·`unverified`·`mismatch` |
| `display_order` | `int` | NO | `0` | `>= 0` |
| `is_primary` | `boolean` | NO | `false` | — |
| `is_active` | `boolean` | NO | `true` | — |
| `collected_at` | `timestamptz` | NO | — | 권리 Gate 필수 |
| `created_at` / `updated_at` | `timestamptz` | NO | `now()` | 앱이 갱신 |

**저장 위치 CHECK** `NULLIF(BTRIM(original_url),'') IS NOT NULL OR NULLIF(BTRIM(storage_path),'') IS NOT NULL` — NULL 뿐 아니라 **빈 문자열·공백만 있는 값도 실패**시킨다. 둘 다 비어 있는 이미지 행은 존재할 수 없다. 둘을 **동시에 가질 수 있다**(외부 원본을 Storage에 캐시한 경우) 이때 표시는 `storage_path` 를 우선한다.

**표시 URL은 저장하지 않고 런타임 생성한다** — `/img/place/{image_id}` 동일 출처 프록시. 근거: 기존 두 경로가 이미 프록시 방식이고, 외부 URL 직접 노출은 CORS·핫링크·죽은 URL(현재 79건) 문제를 그대로 사용자에게 넘긴다. 프록시면 원본이 죽어도 fallback을 한 곳에서 처리한다.

**published 이미지 필수 조건** `is_active = true` AND (`original_url` 또는 `storage_path` 가 비어 있지 않음) AND **`rights_status IN ('rights_confirmed','operational_assumed')`** AND `place_match_status IN ('verified','likely')`. **허용목록으로 닫는다** — `rights_status <> 'blocked'` 로 두면 `review_required` 까지 공개되므로 쓰지 않는다. 이 조건은 DB CHECK가 아니라 importer·승인 Function에서 검증한다(타 테이블 참조 불가).

**`city_spots.image_url` 캐시 동기화 — 원자적 처리 필수** 아래 3단계를 **동일 트랜잭션**으로 처리하고, 중간 실패 시 **전체 롤백**한다.

```
① 기존 active primary 해제
② 신규 active primary 지정
③ city_spots.image_url 을 /img/place/{image_id} 로 갱신
```

한 단계라도 분리되면 대표 이미지는 바뀌었는데 캐시가 이전 이미지를 가리켜 **목록과 상세의 사진이 달라진다.** importer는 외부 원본 URL이 아니라 **생성된 프록시 경로**를 복사한다. 목록·지도 projection이 조인 없이 읽기 위한 캐시이며 SSOT는 `city_spot_images` 다.

**`image_status` 는 이 테이블에 두지 않는다.** `image_sufficient`·`source_exhausted`·`image_partial`·`image_missing` 은 개별 이미지 한 장의 속성이 아니라 **장소 후보 전체의 수집 상태**다. 특히 `source_exhausted` 는 이미지가 0장이라는 뜻이라 담을 행 자체가 없고, 여러 이미지 행에 같은 값이 반복 저장된다. 이 값은 **보조컴퓨터 산출물과 `release-report.md` 에 보존**하고, 운영상 이미지 부족은 `review_flags` 의 `needs_image` 로 표현한다. 별도 장소 단위 컬럼은 실제 운영 필요가 확인될 때만 추가한다.

**`operational_assumed`를 `rights_confirmed`로 자동 승격하지 않는다.**

**제약**
- `FK city_spot_id → city_spots(id) ON DELETE CASCADE`
- `UNIQUE (city_spot_id) WHERE is_primary AND is_active`
- **부분 UNIQUE** `(city_spot_id, source_namespace, source_image_id) WHERE source_namespace IS NOT NULL AND source_image_id IS NOT NULL` — nullable 값을 포함한 일반 UNIQUE는 NULL 누수로 중복을 막지 못한다
- 수동·Storage 이미지 중복은 **importer가 `original_url`·`storage_path` 또는 해시로 검증**
- 인덱스 `(city_spot_id, display_order)`

**`featured_ready`와 이미지 `rights_status`/`place_match_status` 관계는 DB CHECK로 처리하지 않는다.** PostgreSQL CHECK는 서브쿼리를 허용하지 않아 다른 테이블을 참조할 수 없다. **importer validation + 공개 승인 Function + release dry-run**에서 검증한다. 초기 범위에서 constraint trigger를 만들지 않는다.

---

## 13. 사용자 사진과 장소 이미지 경계 · DECIDED

**사용자 사진 선택 경로** 휴대전화 카메라 촬영 · 휴대전화 앨범 · 컴퓨터 파일.

**기본 처리** 용량 축소 → 해상도 최적화 → 방향 보정 → 적절한 비율·크롭 → 안전한 저장 → 공개 범위 적용. 로컬 파일 선택은 브라우저에서 직접 읽어 축소 후 업로드하므로 **CORS는 개인 사진 기능의 차단 요인이 아니다** — 이미 저장된 사진을 Canvas로 다시 불러오는 구현 단계의 세부사항이다.

**공유 이미지 우선순위**
1. 사용자가 공유용으로 직접 선택한 여행·추억 사진
2. 사용자가 선택한 개인 Trip Cover
3. 공개 허용된 Moment 사진
4. 실제 일정에 포함된 검증된 장소 이미지
5. 도시·테마 fallback

**공개 선택되지 않은 개인 사진을 OG·Story Card·공유 API에 자동 사용하지 않는다.** `trip_moments`·personal cover의 저장 경로·권한은 공식 장소 이미지 구조와 분리한다.

---

## 14. 공유·복사·재방문·길찾기 계약 · DECIDED / PROPOSED

외부 SNS의 **이야기형 공유**와 서비스 내부의 **실행형 여행 정보**를 구분한다.

**A. 외부 SNS·Story Card에 표시 가능** 사용자가 공개 선택한 사진 · 여행 제목 · 도시와 기간 · 날짜별 일정 요약 · 장소 이름 · 지역·동네 · 개인 메모와 추억 · 대략적 이동 흐름 · GoKoreaMate 공유 링크 · QR 또는 CTA.

**B. 외부 SNS·Story Card에 기본 미포함** 정확한 GPS 좌표 · 상세 주소 · Naver/Google Maps 직접 링크 · 장소별 경로 URL · 개인 장소의 정확한 위치 · 공개되지 않은 사진·메모.

**C. GoKoreaMate 공유 페이지에서 제공** (공개 허용 범위 안에서) 정확한 장소 정보 · 상세 주소 · 사용자 도착 좌표 · Naver Maps · Google Maps · 이전 장소→다음 장소 경로 · 날짜별 상세 동선 · 장소 저장 · 내 일정에 추가 · Copy this trip · 본인 재방문.

**D. 접근 원칙 · 공식 장소** 정확한 위치와 지도 실행은 GoKoreaMate 접속 후 제공한다. **이것은 화면 표현·UX 원칙이며 기술적 비밀 보호가 아니다** — 현재 `city_spots` 는 브라우저 anon 키로 직접 조회되고 RLS는 행만 제한하므로, `is_published=true` 인 행의 `address`·`lat`·`lng` 는 anon REST로 조회 가능하다(CONFIRMED). 공개 관광지의 좌표는 본질적으로 비밀정보가 아니므로 이를 결함으로 보지 않는다. **"기술적으로 GoKoreaMate만 접근 가능"이라고 표현하지 않는다.** 향후 직접 anon 테이블 조회를 Function·projection 경로로 전환하면 노출면을 줄일 수 있다.

**D-2. 접근 원칙 · 공통** **공개 공유 일정 열람에 회원가입을 기본 강제하지 않는다.** 복사·저장·수정·다른 기기 소유권 복구는 계정 또는 소유권 연결 구조로 처리한다. 사용자를 속이는 강제 장벽이 아니라 **외부 이야기와 내부 실행 도구의 역할 분리**로 설계한다. 외부 CTA 예시: *View exact locations and directions on GoKoreaMate* · *Open the interactive itinerary* · *Copy this trip*.

**E. 공식 장소 저장 계약 · PROPOSED** 일정 항목에 `city_spot_id` + `place_snapshot`을 함께 보존한다. snapshot 최소 항목 — `name` · `name_ko` · `address` · `arrival_lat` · `arrival_lng` · `category` · `zone`. 동작: 공개 `city_spots` 연결이 유효하면 최신 운영 정보 우선 / 연결 실패·삭제·비공개면 snapshot으로 당시 기록 보존 / 지도 실행 가능 여부와 데이터 상태를 사용자에게 표시 / 원본과 복사본은 복사 후 독립.
**현재 상태 CONFIRMED** — `itineraries.days` 55건에 `city_spot_id` **0건**. 이 계약은 미구현이며 후속 구현 대상이다.

**F. 개인 장소 저장 계약 · PROPOSED — 여기는 실제 보안이 필요하다** `user_spot_id` + `place_snapshot` 보존. 개인 장소는 검색으로 찾기 어려우므로 정확한 주소·GPS·메모를 안전하게 보존하되, 공개 응답에서는 단계별로 가린다.

`location_visibility` **기본값 `hidden`** (확정 — `approximate` 와의 택일이 아니다)

| 값 | 공개 API 응답 |
|---|---|
| `hidden` | 주소·좌표 **없음** |
| `approximate` | district 또는 거친 위치만 |
| `exact` | 사용자가 **명시적으로 허용**한 경우만 정확한 위치 |

**owner projection 과 public share projection 을 분리한다.** 공유 API가 `days`·`place_snapshot` 전체를 그대로 반환해 정확한 위치를 유출하면 안 되며, 복사 시에도 **공유 허용된 필드만** 전달한다. 소유자는 항상 원본 정확 위치에 접근할 수 있다. **OG·Story Card에 `exact` 개인 위치를 절대 포함하지 않는다.**

**G. 재방문 계약 · PROPOSED** 일정 작성자는 자신의 여행을 다시 열어 사진·메모 확인 / 당시 일정 확인 / 저장 장소 확인 / 정확한 주소·GPS 확인 / Naver·Google Maps 실행 / 일정 수정 / 재공유를 할 수 있어야 한다.
**현재 한계 CONFIRMED** — 소유권이 기기 ID(`device_id`) 기반이다. 같은 기기·브라우저에서는 접근 가능하지만 **다른 기기·브라우저에서 편집 권한 복구는 현재 보장되지 않는다.** 향후 계정 또는 소유권 복구 구조가 필요하다.

**H. 장소 단독 공유** `/place/[id]`. 내부에서 장소 상세 · 정확한 주소·도착 좌표 · Naver Maps · Google Maps · Save · Add to Itinerary를 제공한다. **외부 SNS 카드에서는 정확한 GPS·직접 지도 링크를 기본 제외한다.**

---

## 15. 지도 연결 계약 · DECIDED

Naver Maps와 Google Maps를 **모두** 제공한다. Naver=한국 현지 장소·지점 확인·실제 이동, Google=외국인 친숙성·여행 전 계획.

**URL 우선순위** ①검증된 exact URL이 있으면 사용 ②없으면 **한국어 이름 + 주소 + 도착 좌표로 런타임 검색 URL 생성**.

**1,500개 전체를 수작업 검증하지 않는다.** 고위험·우선 장소(동명 장소·복수 지점·해변·공원·시장·트레일)만 exact URL을 검증한다. 규칙으로 생성 가능한 URL을 1,500건 모두 DB에 중복 저장하지 않는다.

**공유 일정 장소 카드 기본 동작** `View Place` · `Naver Maps` · `Google Maps`. 후속: 두 번째 장소부터 `Route from previous stop`, 하루 단위 `Open Today's Route`.

**공유 이미지에 실제 지도 타일을 의무화하지 않는다.** 날짜별 장소 좌표와 순서로 점·선·방문 순서·사진·장소명만 표현해도 동선이 전달된다. 지도 타일 API는 후속 선택 사항이다.

---

## 16. legacy 데이터 승계 · DECIDED

`city_spots`(86) · `restaurants`(100) · `places`(194)는 **행 전체가 아니라 필드 단위**로 검증 승계한다. **`places`는 폐기된 테이블이며 SSOT로 복귀시키지 않는다.**

**자동 공식 연결 가능 — 확정 3행만** `#24 용두산공원`(4m) · `#18 송도해수욕장`(151m) · `#44 송도케이블카`(317m).

**자동 연결 금지** STRONG_SINGLE_CANDIDATE **11행** · 복수 후보 **52행** · 도착점 특화 **7행** · 공식 후보 없음 **10행**. `STRONG_SINGLE_CANDIDATE`는 "가능성 높음"이지 동일성 확인 완료가 아니다.

**승계 후보** 검증된 `why_it_matters`(83/83) · `duration_minutes`(83/83) · `best_time_slot`(83/83) · `entry_fee`(83/83) · 검증된 도착 좌표 · 검증된 영문명 · `restaurants`의 검증된 가격·예약·수상 정보(`price_range`·`reservation_required`·`award`·`name_en`·`description_en`) · 실제 관련성과 유효성이 확인된 affiliate link(78/83) · 정확성이 확인된 exact 지도 링크.

**승계 금지** Unsplash 이미지 자동 승계(86/86) · 미검증 좌표 · 오래된 영업시간(36/83만 보유) · 잘못된 지도 링크 · 다른 지점 음식점 이미지 · 관계없는 affiliate URL.

**준중복 처리 방향** `#16` 유지/`#4` 삭제 대상 · `#21` 유지/`#3` 삭제 대상 · `#27` 유지/`#49` 삭제 대상(`#49`의 검증된 등대 설명·태그만 선별 이관) · `#33`과 `#5` 모두 유지 · `#29`와 `#7` 모두 유지. **삭제는 M5에서 사용자 승인 후 수행한다.**

---

## 17. migration M1~M6 · DECIDED (SQL 미작성)

| # | 목적 | 의존성 | 중단 조건 | 롤백 |
|---|---|---|---|---|
| **M1** | publication + readiness + `review_status` + `review_flags` + RLS 교체 | 없음 | 기존 86행 backfill 실패 / 코드 배포 미완 | 정책 원복 + 컬럼 DROP |
| **M5** | 기존 중복 3쌍 안전 정리 | M1 | 참조 0건 재확인 실패 | 스냅샷 재INSERT + `setval` |
| **M2** | `city_spot_sources` | M1·M5 | UNIQUE 충돌 1건 이상 | `DROP TABLE` |
| **M3** | arrival anchor + scheduler 최소 컬럼 + `content_meta` | M1 | — | `DROP COLUMN` |
| **M4** | `city_spot_images` | M1·M5 | — | `DROP TABLE` |
| **M6** | 대량 조회 index | M1·M3 | — | `DROP INDEX` |

**M5를 M2·M4의 실제 source/image import 전에 완료한다.** 이유: import 후 삭제하면 `ON DELETE CASCADE`로 자식 `city_spot_sources`·`city_spot_images` 행이 함께 사라져 본체 3행만 재INSERT해서는 복구되지 않는다.

**M1 안전 전환 5단계** ①신규 컬럼 추가 ②**기존 86행 per-row backfill manifest 적용**(아래) ③코드 읽기 경로 **8곳** 공개 필터 반영 ④RLS `USING (is_published)` 교체 ⑤운영 확인.

**86행 backfill manifest · 일괄 승인 금지** — "기존에 공개하고 있었다"는 사실만으로 `approved`·`catalog_ready` 를 부여하지 않는다. 실측된 결함(깨진 이미지 79건 · 삭제 대상 3건 · 도착 좌표 일부 미검증 · 공식 identity 대부분 미확정 · 오래된 영업시간 · 잘못될 수 있는 지도 링크)을 그대로 승인하면 §7 readiness 규칙을 문서 스스로 위반한다.

**v1.1 manifest 판정 금지 사항** ①`name_l10n.ko` NULL만으로 비공개 금지 — `needs_map_name_ko`(비차단)로 기록한다 ②`external_id` NULL만으로 `needs_identity` 부여 금지 ③좌표가 사용 가능한데 최적 진입점만 미검증이면 `needs_arrival` 이 아니라 `needs_arrival_verification` ④이미지 부족은 CATALOG 차단이 아니다 ⑤기존 공개 이력만으로 `approved` 부여 금지 ⑥**보고서의 예상 수치(공개 유지 83행 등)를 승인값으로 그대로 사용하지 않는다** — 행별 근거 manifest로 확정한다.

M1 실행 **전에** 행별 manifest를 만든다.

**M1 backfill manifest 필드** `city_spot_id` · `is_published` · `review_status` · `review_flags` · `catalog_ready` · `scheduler_ready` · `featured_ready` · `backfill_reason`

**`schedulable` 은 M1 manifest에 넣지 않는다** — 해당 컬럼은 M3에서 추가되므로 M1 시점에는 DB에 존재하지 않는다. 스케줄러 값은 M3에서 별도 backfill 한다.

**M3 scheduler backfill 필드** `city_spot_id` · `zone` · `schedule_role` · `schedulable` · `scheduler_rule_version` · `scheduler_override`

하나의 계획 파일로 함께 관리하려면 M1 단계의 값을 **`planned_schedulable`** 로 이름 붙여 구분하고, **M3 이전에는 DB에 적용하지 않는다.**

| 행 상태 | 처리 |
|---|---|
| 최소 공개 계약 충족 | 공개 유지 (`approved`·`catalog_ready=true`·`is_published=true`) |
| 이미지·콘텐츠만 부족(`needs_image`·`needs_content`) | **공개 유지 + 비차단 flag 기록**, `featured_ready=false` |
| 차단 flag 보유(`needs_identity`·`needs_arrival`·`needs_translation`·`needs_district`·`needs_restaurant_branch`) | **수정 후 공개 또는 비공개 보류** (`in_review`) |
| 비차단 flag만 보유(`needs_arrival_verification`·`needs_map_name_ko`·`needs_hours`) | **공개 유지**, `approved` 와 공존 가능 |
| M5 삭제 대상 3행(`#4`·`#3`·`#49`) | backfill 제외, M5에서 처리 |
| 일정 후보로 부적합 | `planned_schedulable=false` (M3에서 `schedulable` 로 적용) | **SQL만 먼저 적용하거나 코드만 먼저 배포하면 기존 장소가 전부 사라져 보이거나 미검수 데이터가 노출된다.** 같은 배포 창에서 처리한다.

**M5 안전 조건** 삭제 대상 전체 행 스냅샷 · 참조 0건 재확인 · 선별 필드 survivor 이관 · 단일 트랜잭션 · 명시적 ID 포함 rollback · child source/image 0건 확인 · **identity sequence `setval` 검증**(`id`는 `GENERATED BY DEFAULT`, `max(id)=95`).

**migration 수동 적용 운영 계약 · DECIDED** 실측상 `supabase/migrations` 파일 **31개**인데 `supabase_migrations.schema_migrations` 기록은 **4건(최신 `004`)** 이다(2026-07-28 확인). 이 프로젝트는 005~031을 `supabase db push` 가 아니라 검증된 SQL 수동 적용으로 운영해 왔으므로 **예상된 상태**이며, 검증된 SQL 수동 적용 자체의 차단 사유가 아니다.

- **금지** `supabase db push` · migration history repair · history 기반 자동 적용
- **허용** 사전 스키마 직접 조회 → 검증된 SQL 수동 적용
- **적용 기록 필수 항목** migration 파일명 · 적용 대상 project · **사전 schema fingerprint** · 적용 명령 · 적용 시각 · 적용 결과 · **사후 schema fingerprint** · rollback SQL · QA 결과
- migration 파일은 **코드 이력용**으로 보존하고, 실제 적용 여부는 **DB 구조로 검증**한다

**공개 게이트 대상 8경로 (CONFIRMED, 현재 필터 0개)** `fetchCitySpots` · `fetchCitySpotsByCategory` · `/place/[id] fetchSpotIds` · `/place/[id] fetchSpot` · `functions/api/trip/plan.ts:139` · `:250` · `src/app/api/trip/plan/route.ts:94` · `near-me/candidate-generator.ts:52`.

---

## 18. 중단 병합 분류 A~E · DECIDED

**측정 방법 주의** `git diff master research`(두-점)는 272개를 보고하지만 master가 이후 발전시킨 앱 코드 124개가 섞인다. **merge-base(`dfc94d4`) 기준**으로 research 추가분은 **194개**이고 그중 44개는 이미 master에 동일 내용으로 존재한다.

**자동 검산 (2026-07-28)** 전체 **194** · path 중복 **0** · 미분류 **0** · A+B+C+D+E = **194 일치**. 검산 방법: `git diff --name-only <merge-base>..research` 전 항목에 대해 master 존재/동일 여부와 경로 접두사로 기계 분류 후 합계 대조. `≤`·`+` 같은 불확정 표기를 쓰지 않는다.

| 분류 | 대상 | 개수 |
|---|---|---|
| **A. ALREADY_MERGED** | master에 동일 내용으로 존재 | **44** |
| **B. SELECTIVE_MERGE_CANDIDATE** — 문서 | `docs/` (자동화 규칙 + 작업 보고서) | **51** |
| **B. SELECTIVE_MERGE_CANDIDATE** — 스크립트 | `scripts/` | **33** |
| **C. HOLD_UNTIL_SCHEMA** | `data/tourapi/reports/` | **22** |
| **D. RESEARCH_ONLY** | normalized 2 + 후보 CSV/JSON 30 | **32** |
| **E. REJECT_OR_REBUILD** | master와 내용 상이 | **12** |
| **합계** | | **194** |

**B는 "충돌 없음"이지 "지금 병합해도 되는 것"이 아니다.** 그래서 분류명을 `SAFE_TO_MERGE_NOW` 가 아니라 **`SELECTIVE_MERGE_CANDIDATE`** 로 둔다. 84건(51+33) 중 **최종 파이프라인이 실제 호출하는 스크립트 + 최신 운영 규칙 + 최종 handoff만** 선별하며, 병합 실행 TASK의 파일별 manifest에서 선택된 것만 그 시점에 `SAFE_TO_MERGE_NOW` 로 **승격**한다. 선별 manifest는 이 문서에 저장하지 않는다.

**참고** `integration/busan-linkage-index-20260727`의 2파일(`busan-linkage-index-21r.csv`·exporter)은 research 194에 포함되지 않는 **별도 브랜치 산출물**이며 `HOLD_UNTIL_SCHEMA` 로 취급한다.

**84개 일괄 병합 금지.** 기술적 무충돌과 master 포함 가치는 다르다. 작업 보고서 51개를 통째로 넣으면 다음 세션이 구문서를 SSOT로 오인한다(실례: `busan-image-rights-21h-validation.md`는 **반려된 원안**이고 실제 적용은 21H-REV2).

**master 포함 후보** 최종 파이프라인이 실제 호출하는 스크립트 · 최신 운영 규칙 · 최종 handoff · **본 SSOT 문서** · 필요한 exporter.
**research 유지** 중간 작업 보고서 · 대체된 감사 문서 · 대형 normalized · 중간 CSV · metrics · 실험 산출물 · 과거 단계 보고서.

**파일별 확정**

| 파일 | 결정 |
|---|---|
| `.gitignore` | **master 유지** — research본에 master의 Playwright 무시 블록이 없어 덮어쓰면 테스트 산출물이 커밋 가능해짐 |
| `CLAUDE.md` | **master 유지** — `57f1bd9`로 최소 통합(+10줄) 완료, 전문 덮어쓰기 금지 |
| 최종 handoff(`busan-data-branch-final-handoff-21w.md`) | **master 유지** — `## 메인 통합 범위` 절이 추가돼 master가 최신 |
| `data/tourapi-nightly-config.json` `maxRetry` 2→3 | **조건부 반영** — transient network·timeout·HTTP 429·5xx에만 재시도, 제한된 backoff, 최대 재시도 횟수, idempotency(동일 페이지 중복 저장 방지). **인증 오류·잘못된 요청·존재하지 않는 endpoint·영구 4xx는 재시도 금지** |
| `tourapi-busan-batch.mjs` · `tourapi-busan-diff.mjs` | **HOLD** — 양쪽 diff 확인 후 최종 파이프라인 기준 통합본. 어느 한쪽 통째 덮어쓰기 금지 |
| 중간 batch CSV·metrics·report | **research 유지**, master 병합 안 함 |

---

## 19. 보조컴퓨터 공급 계약 · DECIDED

**보조가 책임질 값** source identity · source key · 한국어명 · 검증 가능한 영어명 · 주소 · district 정규화 근거 · 원천 좌표 · 도착점 유형 · category/subcategory 근거 · 공식 설명 · 사실 기반 요약 후보 · 음식점 지점 동일성 · 이미지 장소 일치 · image provenance · `field_provenance` · `confidence` · `validation_status` · `review_flags`.

**보조가 만들지 않을 값** 최종 numeric `city_spots.id` · 공개 승인 · RLS · DB import action · 런타임 지도 URL · scheduler 기본 파생값 · 상업 추천 순위 · 임의 canonical 병합 · 운영 DB 쓰기.

**schema-independent 고정 키** `candidate_id` · `source_key` · `original_record_id` · `provenance` · `confidence` · `validation_status` · `review_flags`.

**현재 산출 형식** `candidate_id` · `source_key` · `facts` · `proposed_values` · `field_provenance` · `confidence` · `validation_status` · `review_flags`. **최종 `places-ready.jsonl`은 아직 만들지 않는다.**

**지금 즉시 착수 가능한 작업(스키마 무관)** 영어 대표명 보강 · 설명 955건 보강(nature 50·accommodation 82는 0%) · district 정규화(결측 311 + 숫자코드) · 음식점 721건 지점 동일성 · 이미지 장소 일치 판정 · 도착점 유형 분류 · source identity·provenance 보존.

**후속 최종 산출물** `places-ready.jsonl` · `place-sources-ready.jsonl`(≈2,004행) · `place-images-ready.jsonl` · `places-review.csv` · `release-report.md`. **scheduler profile 파일은 만들지 않는다.** `candidate_id`는 파이프라인 내부 키이며 운영 `external_id`로 쓰지 않는다. importer는 **안정 키인 `source_key`** 로 기존 운영 장소와 연결한다.

---

## 20. importer·검증 원칙 · DECIDED

**import 순서** ①canonical places ②source rows ③images ④readiness/publication ⑤legacy field enrichment ⑥별도 승인 후 공개. **승격은 단일 트랜잭션** — 중간 실패 시 sources 없는 고아 장소나 공개된 미검증 장소가 남는다.

**자동 검증 항목** schema/type · 필수 결측 · `candidate_id` 중복 · canonical 중복 · `source_key` 중복 · source conflict · FK 손실 · category/subcategory 허용값 · 좌표 범위 · district/zone · image `place_match` · `rights_status` · 영어명 origin · 설명 origin · `content_meta` schema · `review_flags` · readiness 조건 · 공개 상태 · **deterministic repeat(동일 입력 출력 SHA 동일)**.

**메인 QA** 자동 검증 보고 확인 · 위험 유형별 표본(`geo_title_category` 362건 표본 · 음식점 지점 표본 · 이미지 mismatch 표본) · importer dry-run · 중단 조건 · rollback · 운영 코드 호환성. **메인이 1,500개 장소를 전수 수동 재검수하지 않는다.**

---

## 21. 다도시 확장 · DECIDED

`city`는 기존 컬럼을 사용하고 인덱스는 `city`를 선두로 둔다. `source_namespace`는 **importer registry 방식**이라 서울·제주·경주 추가 시 DB CHECK migration을 반복하지 않는다. `zone`은 도시별로 정의하고 **부산 zone을 전역 하드코딩하지 않는다.** `scheduler_rule_v1`은 공통 규칙 + 도시 override. 언어 확장은 `name_l10n`과 `content_meta.names.{language}`에서 처리한다. 지도 검색 URL은 도시와 무관하게 런타임 생성한다. 이미지 원천은 추가 가능하다.

**규모별 대응** 1,200~1,500건은 현재 projection으로 감당(목록 248~311KB · 핀 74~92KB · 일정 166~208KB). **5,000건 이상**은 목록 cursor pagination · 지도 pin projection + clustering · 상세는 runtime Function 구조.

---

## 22. 결정 이력

| 이전 결정 | 새 결정 | 이유 | 변경일 |
|---|---|---|---|
| FEATURED 150~200으로 축소 | 500 유지, 목표 축소 안 함 | 소규모 제한은 2.0 목적과 불일치 | 2026-07-28 |
| 데이터·기능 순차 진행 | **병렬 진행** | 데이터가 부수 자료가 아니라 핵심 제품 | 2026-07-28 |
| strong single candidate 11행 자동 연결 | **확정 3행만 자동 연결** | 가능성 높음 ≠ 동일성 확인 완료 | 2026-07-28 |
| 시간대 기반 지도 버튼 우선순위 | 철회, 두 버튼 명확 제공 | 시간대가 실제 위치를 보장하지 않음 | 2026-07-28 |
| 장소 이미지 중심 바이럴 | **사용자 사진·추억 중심** | 바이럴 주인공은 개인 경험 | 2026-07-28 |
| `review_status` 단일 구조 | **`review_status` + `review_flags`** | 부족 항목이 동시 존재 가능 | 2026-07-28 |
| content provenance 제외 | **`content_meta` JSONB** | 장소 출처와 문장 생성 방식은 별개 | 2026-07-28 |
| `source_namespace` 고정 CHECK | **CHECK 제거 + importer 허용목록** | 도시 추가마다 migration 발생 | 2026-07-28 |
| M5를 M2·M4 이후 | **M1 → M5 → M2** | CASCADE로 자식 행 유실, 롤백 불가 | 2026-07-28 |
| 비공개 arrival_anchor + RPC | **공개 catalog 장소로 관리, RPC 보류** | 스케줄러가 anon이라 비공개면 읽지 못함 | 2026-07-28 |
| 이미지 권리×FEATURED를 DB CHECK로 | **importer·승인 Function 검증** | CHECK는 타 테이블 참조 불가 | 2026-07-28 |
| images 일반 UNIQUE | **부분 UNIQUE** | nullable 컬럼 NULL 누수 | 2026-07-28 |
| 명시적 검색에서도 anchor 제외 | **검색에는 포함** | 외국인이 공항·역을 검색해야 함 | 2026-07-28 |
| 84개 일괄 병합 | **선별 병합** | 구문서 SSOT 오인 위험 | 2026-07-28 |
| — | SNS 이야기형 공유와 내부 실행형 정보 분리 | 정확한 주소·GPS·지도는 GoKoreaMate 내부에서 제공 | 2026-07-28 |
| 공개 이미지 `rights_status <> 'blocked'` | **허용목록 `IN ('rights_confirmed','operational_assumed')`** | `<> blocked` 는 `review_required` 까지 공개함 | 2026-07-28 |
| `city_spot_images.image_status` 보유 | **제거** | 개별 이미지가 아니라 장소 단위 수집 상태 | 2026-07-28 |
| B 분류 `SAFE_TO_MERGE_NOW` | **`SELECTIVE_MERGE_CANDIDATE`** | "충돌 없음"과 "병합 대상"은 다름 | 2026-07-28 |

**v1.1 개정 (2026-07-28)** — 본 버전은 공식 SSOT v1.0 커밋 `297f6b4` 를 기반으로 개정했다. `last_verified_commit`·`last_verified_origin_commit` 은 **코드·DB 검증 기준점**이므로 `6e6f62f` 를 유지한다.

| 이전 결정 | 새 결정 | 이유 | 변경일 |
|---|---|---|---|
| `name_l10n.ko` 부재 = `needs_translation` | **철회** — `needs_map_name_ko` 로 분리 | 영문 대표명이 있으면 발견·이해에 지장 없음. 한국어명은 지도 검색·현장 확인 품질 문제 | 2026-07-28 |
| — | **`needs_map_name_ko` 신설**(비차단) | Naver 검색·택시·현장 안내용 한국어명 부족을 별도 queue 로 관리 | 2026-07-28 |
| `external_id` 부재 = `needs_identity` | **철회** — provenance 문제로 분리 | 공식 source 연결 부재는 자동 갱신 상태이지 장소 동일성 문제가 아님 | 2026-07-28 |
| `needs_arrival` = 도착점 관련 전반 | **unsafe/missing 으로 한정**(차단 유지) | 좌표가 없거나 틀리면 사용자를 엉뚱한 곳으로 보냄 — 사용자 신뢰 1순위 위반 | 2026-07-28 |
| — | **`needs_arrival_verification` 신설**(비차단) | 좌표로 접근은 되고 최적 진입점만 미검증인 경우를 차단과 분리 | 2026-07-28 |
| `needs_translation` CATALOG·FEATURED 차단, SCHEDULER 미차단 | **CATALOG·SCHEDULER·FEATURED 3종 차단** | 영문 대표명이 없으면 일정에 넣어도 사용자가 장소를 구분할 수 없음 | 2026-07-28 |
| `review_flags` 8개 | **10개** | 위 2종 신설 | 2026-07-28 |
| `document_version` 1.0 | **1.1** | review flag semantics 교정 | 2026-07-28 |

**Security-0 · PROPOSED (미구현)** — `src/lib/city-spots.ts` 의 anon 기반 write 함수 2개(`upsertCitySpot`·`bulkUpsertCitySpots`)가 코드에 존재하나 **호출부 0건**이고 현재 RLS 정책 구성에서 **실행 불가**다(2026-07-28 확인). Security-0 에서 **삭제**할 예정이며, 대량 적재는 서버 전용 importer 가 담당한다. **브라우저 anon write 경로로 이관하지 않는다.** 아울러 `city_spots` 의 anon·authenticated 테이블/컬럼 write 권한 `REVOKE` 도 같은 단계에서 다룬다. **이 항목은 후속 결정이며 구현 완료가 아니다.**

---

## 23. 남은 blocker · 사용자 결정

**현재 보조컴퓨터 작업을 막는 blocker: 0건.** §19의 schema-independent 보강은 즉시 착수 가능하다.

| 구분 | 항목 | 진행 영향 | 권장 |
|---|---|---|---|
| **1. 현재 blocker** | — | — | **없음** |
| **2. 사용자 실행 승인** | M5 중복 3쌍 삭제(`#4`→`#16` · `#3`→`#21` · `#49`→`#27`) | M2·M4 데이터 import 전 완료 필요 | 승인 권장(참조 0건 확인). 대상은 확정, **실행 승인만** 필요 |
| **3. 기술 후속** | `tourapi-busan-batch.mjs`·`tourapi-busan-diff.mjs` 통합본 | 병합 선별 시 | diff 후 최종 파이프라인 기준 통합 |
| **3. 기술 후속** | `/place/[id]` 대량 대응 | 1,200건 공개 전 | `/place/` 정적 쉘 + `functions/place/[id].ts`(`/shared/[id]` 봇 분기 복제) + `s-maxage` |
| **3. 기술 후속** | M1 코드 8경로 공개 필터 | M1과 같은 배포 창 | §17 5단계 절차 |
| **4. 향후 사업 결정** | 분야별 제휴 파트너 | 수익화 구현 시 | 비교 보고서로 `RECOMMENDED` 1 + `ALTERNATIVE` 1 |
| **5. NULL·보류로 진행 가능** | 태종대 `#27` 정문 좌표 | 없음 | `arrival_anchor_verified_at=NULL` 유지 |

---

## 24. 문서 운영 규칙

1. 모든 데이터·DB TASK는 **이 문서를 먼저 읽고** 시작한다.
2. 결정이 바뀌면 채팅만 수정하지 않고 **이 문서를 갱신한다.**
3. 실제 코드·DB가 문서와 다르면 **작업을 중단하고 차이를 보고한다.** 문서에 맞추지 않는다.
4. 컬럼·enum 개수를 **손으로 세지 않는다.**
5. 목록 기반 자동 검산을 사용한다(§5의 코드블록 파싱 방식).
6. 보조컴퓨터 산출물 계약도 이 문서를 따른다.
7. `CONFIRMED`/`DECIDED`/`PROPOSED`/`BLOCKED`를 구분한다.
8. 대체된 보고서를 SSOT로 사용하지 않는다.
9. 문서와 migration이 다르면 **migration 실행을 중단한다.**
10. 업데이트 시 `document_version`과 `last_verified_commit`을 갱신한다.
