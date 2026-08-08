-- 046: 장소 이미지 SSOT(city_spot_images)
--
-- 무엇인가
--   장소 이미지와 **그 이미지를 띄워도 되는지**를 함께 기록하는 표다.
--   ACTIVE 데이터 계약 §12 가 이미지 SSOT 를 여기로 정했다.
--
-- 왜 필요한가
--   city_spots.image_url 은 URL 문자열 하나뿐이라 권리 상태를 담을 자리가 없다.
--   경주 실측: 이미지 실존 169 건 중 노출 가능은 167 건이다. 나머지 2 건은
--   KTO cpyrhtDivCd 를 받아오지 못한 KTO_TYPE_UNKNOWN 이다. 이 2 건의 의미를
--   URL 한 칸에 담을 방법이 없어서 표를 나눈다.
--
-- 이 표가 지키는 계약
--   · 이미지가 있다고 공개 가능한 것이 아니다. display_eligible 은 URL 존재가
--     아니라 권리 상태에서 나온다.
--   · RIGHTS_UNKNOWN·KTO_TYPE_UNKNOWN 은 자동으로 열리지 않는다. DB 기본값이
--     false 이고, CHECK 가 그 조합을 아예 금지한다.
--   · 권리 정보를 tags·description 에 넣지 않는다. 여기가 자리다.
--
-- 무엇이 아닌가
--   · city_spots.image_url 을 없애는 마이그레이션이 아니다. 그 컬럼은 legacy·
--     캐시 호환으로 남는다. 부산 412 행을 backfill 하거나 지우지 않는다.
--
-- 적용 방법
--   운영 SQL 은 사용자가 Supabase SQL Editor 에서 직접 실행한다.
--   `supabase db push` 로 적용하지 않는다. 045 를 먼저 적용한다.
--
-- 적용 전 검증 (SQL Editor 에서 먼저 실행 — 0 이어야 한다)
--   select count(*) as table_exists from information_schema.tables
--     where table_schema='public' and table_name='city_spot_images';

create table if not exists public.city_spot_images (
  id             bigint generated always as identity primary key,

  city_spot_id   bigint not null references public.city_spots(id) on delete cascade,

  image_url      text not null,

  -- 수집 파이프라인이 판정한 권리 상태 원문을 그대로 보존한다.
  -- 'VG_OFFICIAL_PUBLIC' | 'VG_RESTAURANT_OFFICIAL' | 'Type1' | 'Type3'
  -- | 'IMAGE_RIGHTS_CLEARED' | 'KTO_TYPE_UNKNOWN' | 'RIGHTS_UNKNOWN'
  -- 값 목록을 CHECK 로 고정하지 않는다 — 도시마다 새 출처가 생기면 표를 고쳐야
  -- 하기 때문이다. 대신 아래 display_eligible CHECK 로 위험한 조합만 막는다.
  rights_status  text not null,

  -- 출처 표기가 필요한가. KTO Type3 는 저작권자 명시가 요구된다.
  attribution_required boolean not null default true,

  -- 권리 근거 원문. 판단을 나중에 재검증할 수 있도록 남긴다.
  rights_note    text,

  -- UI 에 띄워도 되는가. **기본값은 false 다.** 켜는 방향으로 실수할 수 없어야 한다.
  display_eligible boolean not null default false,

  -- 대표 이미지인가. 장소당 최대 1개.
  is_primary     boolean not null default false,

  -- 같은 장소 안에서의 표시 순서.
  sort_order     integer not null default 0,

  -- 어느 출처 행에서 온 이미지인가. 출처 행이 지워지면 이미지는 남되 연결만 끊는다.
  source_id      bigint references public.city_spot_sources(id) on delete set null,

  as_of          date,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint csi_image_url_chk  check (char_length(image_url) between 1 and 2048),
  constraint csi_rights_chk     check (char_length(rights_status) between 1 and 64),

  -- 권리가 불명확한 이미지는 어떤 경로로도 공개로 켜지지 않는다.
  -- 애플리케이션 실수를 DB 가 막는다.
  constraint csi_unknown_rights_not_public check (
    not (display_eligible and rights_status in ('RIGHTS_UNKNOWN', 'KTO_TYPE_UNKNOWN'))
  )
);

-- 같은 장소에 같은 URL 이 두 번 들어가지 않게 한다. import 멱등성의 기준점이며
-- import 는 이 키로 ON CONFLICT 한다.
create unique index if not exists uq_city_spot_images_spot_url
  on public.city_spot_images (city_spot_id, image_url);

-- 대표 이미지는 장소당 하나뿐이다.
create unique index if not exists uq_city_spot_images_primary
  on public.city_spot_images (city_spot_id)
  where is_primary;

-- 목록 화면이 "띄울 수 있는 이미지" 만 빠르게 고르도록.
create index if not exists idx_city_spot_images_displayable
  on public.city_spot_images (city_spot_id, sort_order)
  where display_eligible;

-- ── 권한 ────────────────────────────────────────────────────────────────────
-- 쓰기는 service_role 만이다. 읽기도 지금은 열지 않는다.
--
-- 이유: 이 표에는 **아직 띄우면 안 되는 이미지 URL** 이 함께 들어 있다.
-- 표 전체를 anon 에 열면 display_eligible=false 인 URL 까지 브라우저가 볼 수 있어
-- 권리 판정이 무의미해진다. 현재 화면은 city_spots.image_url 캐시로 동작하므로
-- 지금 열 필요가 없다.
--
-- 나중에 다중 이미지를 화면에 쓸 때는 표를 여는 것이 아니라
-- display_eligible=true 만 내보내는 뷰나 Pages Function 을 만든다.
alter table public.city_spot_images enable row level security;

revoke all on public.city_spot_images from anon;
revoke all on public.city_spot_images from authenticated;
revoke all on public.city_spot_images from public;

-- RLS 정책을 만들지 않는다. service_role 만 RLS 를 우회한다.

-- ── 적용 후 검증 (SQL Editor 에서 실행) ──────────────────────────────────────
--   select
--     (select count(*) from information_schema.tables
--       where table_schema='public' and table_name='city_spot_images')         as table_created,  -- 1
--     (select count(*) from pg_indexes where tablename='city_spot_images')     as indexes,        -- 4
--     (select count(*) from pg_policies where tablename='city_spot_images')    as policies,       -- 0
--     (select relrowsecurity from pg_class where relname='city_spot_images')   as rls_enabled,    -- true
--     (select count(*) from pg_constraint
--       where conrelid='public.city_spot_images'::regclass and contype='f')    as fkeys,          -- 2
--     (select count(*) from pg_constraint
--       where conrelid='public.city_spot_images'::regclass
--         and conname='csi_unknown_rights_not_public')                         as rights_guard,   -- 1
--     (select count(*) from public.city_spot_images)                           as rows_present;   -- 0
--
--   -- anon/authenticated/PUBLIC 직접 grant 0
--   select count(*) as public_grants
--     from pg_class c,
--          aclexplode(coalesce(c.relacl, acldefault('r'::"char", c.relowner))) a
--    where c.oid = 'public.city_spot_images'::regclass
--      and a.grantee in (0, to_regrole('anon')::oid, to_regrole('authenticated')::oid);  -- 0
--
--   -- 권리 가드가 실제로 막는지 확인 (에러가 나야 정상 — 커밋하지 말 것)
--   --   begin;
--   --   insert into public.city_spot_images
--   --     (city_spot_id, image_url, rights_status, display_eligible)
--   --   values ((select id from public.city_spots limit 1), 'https://x/y.jpg',
--   --           'RIGHTS_UNKNOWN', true);   -- csi_unknown_rights_not_public 위반
--   --   rollback;
--
-- ── rollback ────────────────────────────────────────────────────────────────
--   drop table if exists public.city_spot_images;
