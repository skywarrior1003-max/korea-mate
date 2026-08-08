-- 045: 장소 출처 SSOT(city_spot_sources)
--
-- 무엇인가
--   한 장소가 어느 공식 출처에서 왔는지를 기록하는 표다. 경주 한 곳이
--   경주시 GJ01 · KTO KorService2 · 비지트경주 세 곳에 동시에 존재할 수 있으므로
--   장소 1 : 출처 N 이다.
--
-- 왜 새로 만드는가
--   ACTIVE 데이터 계약(docs/architecture/gokoreamate-data-contract-v1.md §11)이
--   "legacy city_spots.source_type/external_id 는 동결한다" 로 확정했다.
--   그 두 컬럼은 장소당 출처를 하나만 담을 수 있어 다중 출처를 표현하지 못한다.
--
-- 무엇이 아닌가
--   · 기존 컬럼을 대체하는 마이그레이션이 아니다. 부산 412행의
--     source_type/external_id/image_url 을 backfill 하거나 지우지 않는다.
--     legacy 값은 그대로 두고, 새 장소부터 이 표를 쓴다.
--   · 사용자에게 보여줄 표가 아니다. 어느 API 를 긁었는지·내부 candidate_id 가
--     무엇인지는 운영 정보다. 그래서 anon 에 열지 않는다.
--
-- 적용 방법
--   이 저장소는 원격 migration history 가 001~004 뿐이고, 운영 SQL 은 사용자가
--   Supabase SQL Editor 에서 직접 실행한다. 이 파일은 코드·감사 이력이며
--   `supabase db push` 로 적용하지 않는다.
--
--   기존 테이블을 DROP·ALTER 하지 않는다. 전부 IF NOT EXISTS 라 재실행해도 안전하다.
--
-- 적용 전 검증 (SQL Editor 에서 먼저 실행 — 0 이어야 한다)
--   select count(*) as table_exists from information_schema.tables
--     where table_schema='public' and table_name='city_spot_sources';

create table if not exists public.city_spot_sources (
  id            bigint generated always as identity primary key,

  city_spot_id  bigint not null references public.city_spots(id) on delete cascade,

  -- 어느 공급자인가. 'gyeongju-city' | 'kto' | 'visitgyeongju' 처럼 provider 단위다.
  source_type   text not null,

  -- 그 공급자 안에서의 식별자. KTO contentId, 경주시 콘텐츠 uid 등.
  -- NULL 을 허용하지 않는다 — 식별자 없는 출처는 이 표에 넣을 이유가 없고,
  -- NULL 이 섞이면 아래 unique 가 중복을 막지 못한다(Postgres 에서 NULL != NULL).
  source_key    text not null,

  -- 수집 파이프라인의 candidate_id. relation graph 350 이 이 값으로 장소를
  -- 가리키므로, 이것이 graph → DB 를 잇는 유일한 다리다.
  -- 여러 출처 행이 같은 candidate 를 가리킬 수 있어 unique 를 걸지 않는다.
  candidate_id  text,

  -- 원문 링크가 데이터에 실제로 있을 때만 채운다. 만들어내지 않는다.
  source_url    text,

  -- 수집 당시 품질 등급(TIER_A/TIER_B 등). 없으면 NULL.
  source_tier   text,

  -- 이 출처 행이 대표 출처인가. 장소당 최대 1개.
  is_primary    boolean not null default false,

  -- 수집 기준일. 런타임 시각이 아니라 데이터의 as_of 다.
  as_of         date,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint css_source_type_chk check (char_length(source_type) between 1 and 64),
  constraint css_source_key_chk  check (char_length(source_key)  between 1 and 128)
);

-- 같은 출처 식별자가 두 장소에 붙지 않게 한다. 재import 시 멱등성의 기준점이며
-- import 는 이 키로 ON CONFLICT 한다.
create unique index if not exists uq_city_spot_sources_source
  on public.city_spot_sources (source_type, source_key);

-- 장소 하나에 같은 provider 가 두 번 붙지 않게 한다.
create unique index if not exists uq_city_spot_sources_spot_provider
  on public.city_spot_sources (city_spot_id, source_type);

-- 대표 출처는 장소당 하나뿐이다. 부분 unique 라 is_primary=false 는 제한이 없다.
create unique index if not exists uq_city_spot_sources_primary
  on public.city_spot_sources (city_spot_id)
  where is_primary;

-- candidate_id → city_spot_id 역방향 조회. relation graph adapter 가 쓴다.
-- unique 가 아닌 이유는 위 candidate_id 주석 참조.
create index if not exists idx_city_spot_sources_candidate
  on public.city_spot_sources (candidate_id)
  where candidate_id is not null;

create index if not exists idx_city_spot_sources_spot
  on public.city_spot_sources (city_spot_id);

-- ── 권한 ────────────────────────────────────────────────────────────────────
-- city_spots 는 anon SELECT 가 열려 있지만 이 표는 열지 않는다.
--
-- 이유: 여기에는 내부 candidate_id 와 어떤 공식 API 를 어떤 키로 긁었는지가
-- 들어간다. 사용자 화면에 필요 없고, 공개하면 수집 경로가 그대로 드러난다.
-- city_spots 보다 약하게 만들지 않는다는 원칙에도 이쪽이 맞다.
--
-- 필요해지면 그때 컬럼을 골라 뷰로 여는 것이 옳지, 표 전체를 여는 것이 아니다.
alter table public.city_spot_sources enable row level security;

revoke all on public.city_spot_sources from anon;
revoke all on public.city_spot_sources from authenticated;
revoke all on public.city_spot_sources from public;

-- RLS 정책을 만들지 않는다. 정책이 없으면 anon/authenticated 는 아무것도 못 한다.
-- service_role 은 RLS 를 우회하므로 서버 경로(import script)만 동작한다.

-- ── 적용 후 검증 (SQL Editor 에서 실행) ──────────────────────────────────────
--   select
--     (select count(*) from information_schema.tables
--       where table_schema='public' and table_name='city_spot_sources')        as table_created,  -- 1
--     (select count(*) from pg_indexes where tablename='city_spot_sources')    as indexes,        -- 6
--     (select count(*) from pg_policies where tablename='city_spot_sources')   as policies,       -- 0
--     (select relrowsecurity from pg_class where relname='city_spot_sources')  as rls_enabled,    -- true
--     (select count(*) from pg_constraint
--       where conrelid='public.city_spot_sources'::regclass and contype='f')   as fkeys,          -- 1
--     (select count(*) from public.city_spot_sources)                          as rows_present;   -- 0
--
--   -- anon/authenticated/PUBLIC 직접 grant 0 (aclexplode 로 PUBLIC 까지 본다)
--   select count(*) as public_grants
--     from pg_class c,
--          aclexplode(coalesce(c.relacl, acldefault('r'::"char", c.relowner))) a
--    where c.oid = 'public.city_spot_sources'::regclass
--      and a.grantee in (0, to_regrole('anon')::oid, to_regrole('authenticated')::oid);  -- 0
--
--   -- 기존 city_spots 무변경 확인
--   select count(*) as busan_rows from public.city_spots where city='busan';  -- 412
--
-- ── rollback ────────────────────────────────────────────────────────────────
-- 신규 테이블만 만든다. 되돌려도 city_spots 에 영향이 없다.
--   drop table if exists public.city_spot_sources;
