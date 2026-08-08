# 경주 Production 통합 runbook v1

| 항목 | 값 |
|---|---|
| status | READY — 사용자 수동 적용 대기 |
| 기준 canonical | `data/gyeongju-final-release/gyeongju-canonical-places-v1.jsonl` (302) |
| source candidate SHA | `d49ad34` |
| as_of | 2026-08-08 |

> 이 문서에는 secret 값이 없다. 아래 SQL 은 **사용자가 Supabase SQL Editor 에서 직접 실행**한다.
> `supabase db push` 와 migration repair 는 이 저장소에서 금지다 — 로컬 migration 파일 수와
> 원격 history 기록 수가 다른 것은 이 저장소의 정상 상태이며 repair 사유가 아니다.

## 0. 적용 순서 요약

```
STEP 1  045 precheck  →  045 적용  →  045 postcheck
STEP 2  046 precheck  →  046 적용  →  046 postcheck
STEP 3  import precheck  →  places import  →  sources/images import  →  import postcheck
STEP 4  재배포 (/place/[id] 정적 생성)
```

STEP 1·2 는 표만 만든다. 이 시점에 사용자 화면은 아무것도 바뀌지 않는다.

## STEP 1 — `045_city_spot_sources.sql`

**파일**: `supabase/migrations/045_city_spot_sources.sql`

### precheck (0 이어야 한다)

```sql
select count(*) as table_exists from information_schema.tables
 where table_schema='public' and table_name='city_spot_sources';
```

### postcheck

```sql
select
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name='city_spot_sources')        as table_created,
  (select count(*) from pg_indexes where tablename='city_spot_sources')    as indexes,
  (select count(*) from pg_policies where tablename='city_spot_sources')   as policies,
  (select relrowsecurity from pg_class where relname='city_spot_sources')  as rls_enabled,
  (select count(*) from pg_constraint
    where conrelid='public.city_spot_sources'::regclass and contype='f')   as fkeys,
  (select count(*) from public.city_spot_sources)                          as rows_present;
```

| 컬럼 | 기대값 |
|---|---|
| `table_created` | 1 |
| `indexes` | **6** (PK 1 + unique 3 + index 2) |
| `policies` | 0 |
| `rls_enabled` | true |
| `fkeys` | 1 |
| `rows_present` | 0 |

PUBLIC 권한은 `information_schema` 가 놓치므로 `aclexplode` 로 본다 (**0** 이어야 한다).

```sql
select count(*) as public_grants
  from pg_class c,
       aclexplode(coalesce(c.relacl, acldefault('r'::"char", c.relowner))) a
 where c.oid = 'public.city_spot_sources'::regclass
   and a.grantee in (0, to_regrole('anon')::oid, to_regrole('authenticated')::oid);
```

## STEP 2 — `046_city_spot_images.sql`

**파일**: `supabase/migrations/046_city_spot_images.sql` — **045 적용 후에** 실행한다 (FK 의존).

### postcheck

| 컬럼 | 기대값 |
|---|---|
| `table_created` | 1 |
| `indexes` | **4** (PK 1 + unique 2 + partial 1) |
| `policies` | 0 |
| `rls_enabled` | true |
| `fkeys` | **2** (city_spots, city_spot_sources) |
| `rights_guard` | 1 (`csi_unknown_rights_not_public`) |
| `rows_present` | 0 |

권리 가드가 실제로 막는지 확인 — **에러가 나야 정상이다. 반드시 rollback 한다.**

```sql
begin;
insert into public.city_spot_images (city_spot_id, image_url, rights_status, display_eligible)
values ((select id from public.city_spots limit 1), 'https://example.invalid/x.jpg',
        'RIGHTS_UNKNOWN', true);
rollback;
```

## STEP 3 — 경주 데이터 import

### payload

| 표 | 파일 | 행수 |
|---|---|---|
| `city_spots` | `data/gyeongju-final-release/gyeongju-city-spots-import-v1.jsonl` | **302** |
| `city_spot_sources` | `gyeongju-city-spot-sources-import-v1.jsonl` | **302** |
| `city_spot_images` | `gyeongju-city-spot-images-import-v1.jsonl` | **169** |
| 요약 | `gyeongju-db-import-summary-v1.json` | — |

### import precheck

```sql
select
  (select count(*) from public.city_spots where city='gyeongju')     as gyeongju_before,  -- 0
  (select count(*) from public.city_spots where city='busan')        as busan_before,     -- 412
  (select count(*) from public.city_spots)                           as total_before;     -- 412
```

`gyeongju_before` 가 0 이 아니면 **중단한다.** 이 runbook 은 최초 import 기준이다.

### 적용 순서 (2 단계인 이유)

`city_spot_sources`·`city_spot_images` 는 `city_spots.id` 를 FK 로 받는데, 그 id 는
insert 전에 존재하지 않는다. 그래서 payload 는 id 대신 조인 키(`_join_city`,`_join_name`)를
들고 있고 적용 시점에 id 를 붙인다.

1. **places** — `city_spots` 에 `on_conflict=(city,name)` upsert. `_` 로 시작하는 필드는 DB 컬럼이 아니므로 제외한다.
2. **id 확보** — `select id, name from public.city_spots where city='gyeongju'`
3. **sources** — `_join_name` → `city_spot_id` 매핑 후 `on_conflict=(source_type,source_key)` upsert
4. **images** — 같은 매핑 후 `on_conflict=(city_spot_id,image_url)` upsert

### 멱등성

| 표 | 충돌 키 | 재적용 시 |
|---|---|---|
| `city_spots` | `uq_city_spots_city_name (city, name)` | 행 증가 0 |
| `city_spot_sources` | `uq_city_spot_sources_source (source_type, source_key)` | 행 증가 0 |
| `city_spot_images` | `uq_city_spot_images_spot_url (city_spot_id, image_url)` | 행 증가 0 |

세 키 전부 payload 데이터에서 결정되므로 실행 순서·시각에 의존하지 않는다.
`candidate_id` 302 개가 서로 다르고 `title_ko` 302 개도 서로 다름을 테스트로 확인했다.

### import postcheck

```sql
select
  (select count(*) from public.city_spots where city='gyeongju')                     as gyeongju_places,
  (select count(*) from public.city_spots where city='gyeongju' and category='attraction') as attraction,
  (select count(*) from public.city_spots where city='gyeongju' and category='restaurant') as restaurant,
  (select count(*) from public.city_spots where city='gyeongju'
     and lat is not null and lng is not null)                                        as with_coords,
  (select count(*) from public.city_spots where city='gyeongju' and description is not null) as with_desc,
  (select count(*) from public.city_spots where city='gyeongju' and image_url is not null)  as image_cached,
  (select count(*) from public.city_spot_sources)                                    as source_rows,
  (select count(*) from public.city_spot_images)                                     as image_rows,
  (select count(*) from public.city_spot_images where display_eligible)              as displayable,
  (select count(*) from public.city_spots where city='busan')                        as busan_after;
```

| 컬럼 | 기대값 |
|---|---|
| `gyeongju_places` | **302** |
| `attraction` / `restaurant` | **200** / **102** |
| `with_coords` | **186** ← MAP_ELIGIBLE · ROUTE_AI_ELIGIBLE |
| `with_desc` | **102** |
| `image_cached` | **167** |
| `source_rows` | **302** |
| `image_rows` | **169** |
| `displayable` | **167** |
| `busan_after` | **412** (변동 없어야 한다) |

추가 안전 확인 — 셋 다 **0** 이어야 한다.

```sql
select
  (select count(*) from public.city_spots
     where city='gyeongju' and lat=0 and lng=0)                       as fake_coords,
  (select count(*) from public.city_spot_images
     where display_eligible
       and rights_status in ('RIGHTS_UNKNOWN','KTO_TYPE_UNKNOWN'))    as unknown_rights_public,
  (select count(*) from public.city_spots
     where city='gyeongju' and name_l10n is not null)                 as generated_en;
```

## STEP 4 — 재배포

| 표면 | 반영 시점 |
|---|---|
| `/explore/gyeongju` **List·Map** | **즉시** — `fetchCitySpots("gyeongju")` 가 런타임 조회 |
| `/place/[id]` | **재배포 필요** — 빌드 타임 `generateStaticParams` 가 id 목록을 조회 (`dynamicParams:false`) |
| `sitemap` | 재배포 시 함께 갱신 |

Cloudflare Git auto-deploy 가 걸려 있으므로 별도 수동 deploy 는 하지 않는다.

## 예상되는 화면 상태 (오너 결정 C 반영)

- 목록에 보이는 경주 장소 = **186** (좌표 있는 것)
- 좌표 없는 **116** 은 DB 에 identity 로 남되 화면에 나오지 않는다. 삭제가 아니다.
- 이는 `src/components/ExploreCity.tsx:268` 의 기존 정책이며 부산과 동일하게 동작한다.
- gap queue 의 `COORDINATES_MISSING` 116 건이 채워지면 **코드 수정 없이** 자동으로 나타난다.

## rollback

| 단계 | 절차 |
|---|---|
| STEP 3 (데이터) | `delete from public.city_spots where city='gyeongju';` — FK 가 `on delete cascade` 라 sources·images 가 함께 지워진다. **부산 412 행은 영향 없다.** |
| STEP 2 | `drop table if exists public.city_spot_images;` |
| STEP 1 | `drop table if exists public.city_spot_sources;` (046 를 먼저 내린 뒤) |

세 migration 모두 신규 테이블만 만들고 `city_spots` 를 ALTER 하지 않으므로,
되돌려도 기존 부산 데이터·컬럼·인덱스가 원상 그대로다.

문제를 push 후에 발견하면 force·reset 하지 않고 새 수정 commit 으로만 처리한다.
