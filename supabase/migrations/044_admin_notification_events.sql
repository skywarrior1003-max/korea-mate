-- 044: 관리자 알림 — 사건(incidents) + 발송 이벤트(events)
--
-- 무엇인가
--   "이 운영 알림은 이미 처리했다" 를 기억하는 최소 상태다.
--
-- 왜 DB 여야 하나
--   Pages Functions 는 요청 사이에 메모리를 공유하지 않는다. 어딘가 적어 두지
--   않으면 좋아요가 10 → 9 → 10 으로 오갈 때마다 같은 메일을 다시 보내게 된다.
--   동시에 두 명이 임계를 넘길 때 메일이 두 통 나가는 것도 막을 수 없다.
--   그래서 **DB 를 마지막 방어선**으로 쓴다 — 먼저 자리를 잡은(reserve) 요청만
--   메일을 보낸다.
--
-- 왜 사건 표를 따로 두나
--   처음엔 "열려 있는 신고 중 가장 오래된 id" 를 사건 이름으로 썼다. 그런데
--   관리자가 그 가장 오래된 신고 하나만 종결하면 이름이 다음 신고로 **옮겨간다.**
--   같은 사건인데 이름이 바뀌니 2/5/10 알림이 처음부터 다시 울린다.
--   사건의 정체성은 신고 한 건에 매달면 안 된다. 그래서 사건을 행으로 만들고,
--   그 행의 id 는 무슨 일이 있어도 바뀌지 않게 했다.
--
-- 무엇이 아닌가
--   moderation 상태가 아니다. 알림은 "봐 주세요" 이고 판단은 place_reports 에
--   따로 있다. 이 표들이 신고를 종결시키거나 장소를 숨기지 않는다.
--
-- 적용 방법
--   이 저장소는 원격 migration history 가 001~004 뿐이고, 운영 SQL 은 사용자가
--   Supabase SQL Editor 에서 직접 실행한다. `supabase db push` 로 적용하지 않는다.
--   기존 테이블을 DROP·ALTER 하지 않는다. 전부 IF NOT EXISTS 라 재실행해도 안전하다.
--
-- 적용 전 검증 (SQL Editor 에서 먼저 실행 — 둘 다 0 이어야 한다)
--   select
--     (select count(*) from information_schema.tables where table_schema='public'
--        and table_name='admin_notification_incidents') as incidents_exists,
--     (select count(*) from information_schema.tables where table_schema='public'
--        and table_name='admin_notification_events')    as events_exists;

-- ── 사건 ────────────────────────────────────────────────────────────────────
--
-- 한 장소에서 지금 벌어지고 있는 일 하나. 열려 있는 신고가 하나라도 남아 있는
-- 동안 같은 사건이고, 전부 종결되면 닫힌다. 나중에 새 신고가 들어오면 **새
-- 사건**이 열려 2/5/10 을 다시 쓸 수 있다.
create table if not exists public.admin_notification_incidents (
  id          bigint generated always as identity primary key,

  target_type text not null,
  target_key  text not null,

  status      text not null default 'open',

  -- 사건을 연 최초 신고. 기록용일 뿐 **사건의 정체성이 아니다.**
  -- 이 신고가 종결돼도 위의 id 는 바뀌지 않는다. 그게 이 표의 존재 이유다.
  anchor_report_id bigint,

  opened_at   timestamptz not null default now(),
  closed_at   timestamptz,

  constraint ani_target_type_chk check (target_type in ('city_spot')),
  constraint ani_status_chk      check (status in ('open','closed')),
  -- 닫힌 사건은 닫힌 시각이 있어야 하고, 열린 사건은 없어야 한다.
  constraint ani_closed_at_chk
    check ((status = 'closed' and closed_at is not null)
        or (status = 'open'   and closed_at is null))
);

-- 한 장소에 열려 있는 사건은 **최대 하나**다.
--
-- 이걸 애플리케이션 쪽 판단에 맡기면, 첫 신고 두 건이 동시에 들어올 때 둘 다
-- "열린 사건이 없네" 라고 보고 각자 사건을 만든다. 그러면 같은 상황이 사건 두
-- 개로 갈라져 알림이 두 번 울린다. 그래서 DB 가 하나만 허용한다 — 진 요청은
-- 충돌을 받고 이미 열린 사건을 다시 조회해 **같은 id** 를 쓴다.
create unique index if not exists uq_ani_one_open_per_target
  on public.admin_notification_incidents (target_type, target_key)
  where status = 'open';

create index if not exists idx_ani_target
  on public.admin_notification_incidents (target_type, target_key, opened_at desc);

-- ── 발송 이벤트 ─────────────────────────────────────────────────────────────
create table if not exists public.admin_notification_events (
  id              bigint generated always as identity primary key,

  -- 어떤 종류의 알림인가. 자유 문자열 축이라 나중에
  -- 'public_place_submission' 을 추가할 때 이 표를 다시 뜯지 않아도 된다.
  event_type      text not null,

  target_type     text not null,
  target_key      text not null,

  -- 신고 알림은 반드시 어느 사건의 것인지 적는다. 좋아요는 사건이 없다(NULL).
  incident_id     bigint references public.admin_notification_incidents(id),

  -- 같은 event_type 안에서 축을 하나 더 나눠야 할 때 쓴다.
  signal_key      text,

  -- 어떤 단계에 대한 알림인가. 'threshold:2' · 'like:10' 처럼 쓴다.
  milestone_key   text not null,

  delivery_mode   text not null,   -- immediate | digest
  delivery_status text not null default 'pending',   -- pending | sent | failed

  -- 그때 몇 명이었나. 숫자 하나만 남긴다.
  metric_value    integer,

  created_at      timestamptz not null default now(),
  sent_at         timestamptz,
  failed_at       timestamptz,
  failure_code    text,

  constraint ane_target_type_chk   check (target_type in ('city_spot')),
  constraint ane_delivery_mode_chk check (delivery_mode in ('immediate','digest')),
  constraint ane_status_chk        check (delivery_status in ('pending','sent','failed')),
  constraint ane_event_type_len_chk   check (char_length(event_type)    between 1 and 64),
  constraint ane_milestone_len_chk    check (char_length(milestone_key) between 1 and 64),
  constraint ane_signal_len_chk       check (signal_key is null or char_length(signal_key) <= 64),
  constraint ane_failure_code_len_chk check (failure_code is null or char_length(failure_code) <= 64)
);

-- ── 중복 발송 방지 ──────────────────────────────────────────────────────────
--
-- 두 개로 나눈 이유가 있다.
--
-- Postgres 에서 NULL 은 서로 같지 않다. 그래서 incident_id 를 포함한 UNIQUE 하나로
-- 신고와 좋아요를 함께 처리하면, incident_id 가 NULL 인 좋아요 이벤트는 **아무리
-- 넣어도 충돌하지 않는다.** 좋아요를 눌렀다 뗐다 할 때마다 같은 단계가 새로 쌓인다.
-- 예전엔 incident_key 에 빈 문자열을 채워 이 문제를 피했지만, 그건 "사건이 없다"
-- 를 문자열로 흉내 낸 것이라 읽는 사람이 뜻을 오해한다. 조건을 나눠 각자에게
-- 맞는 계약을 준다.

-- 신고: 같은 사건 안에서 같은 단계는 한 번.
-- 사건이 바뀌면 같은 단계를 다시 쓸 수 있다 — 몇 달 뒤 새 문제는 다시 알려야 한다.
create unique index if not exists uq_ane_report_event
  on public.admin_notification_events
     (event_type, target_type, target_key, incident_id, milestone_key)
  where incident_id is not null;

-- 좋아요: 사건 개념이 없다. 한 장소의 같은 단계는 평생 한 번.
create unique index if not exists uq_ane_like_event
  on public.admin_notification_events
     (event_type, target_type, target_key, milestone_key)
  where incident_id is null;

-- 아직 안 보낸 digest 후보를 꺼낼 때 쓴다
create index if not exists idx_ane_pending
  on public.admin_notification_events (delivery_mode, delivery_status, created_at);

-- 한 장소의 알림 이력을 볼 때 쓴다
create index if not exists idx_ane_target
  on public.admin_notification_events (target_type, target_key, created_at desc);

-- ── 권한 ────────────────────────────────────────────────────────────────────
-- 브라우저는 두 표에 손댈 수 없다. 알림 이력은 운영 정보라 공개 대상이 아니다.
-- 쓰기·읽기 모두 Pages Function(service_role)만 한다.
alter table public.admin_notification_incidents enable row level security;
alter table public.admin_notification_events    enable row level security;

revoke all on public.admin_notification_incidents from anon;
revoke all on public.admin_notification_incidents from authenticated;
revoke all on public.admin_notification_incidents from public;

revoke all on public.admin_notification_events from anon;
revoke all on public.admin_notification_events from authenticated;
revoke all on public.admin_notification_events from public;

-- RLS 정책을 만들지 않는다. 정책이 없으면 anon/authenticated 는 아무것도 못 한다.
-- service_role 은 RLS 를 우회하므로 서버 경로만 동작한다.

-- ── 여기에 없는 것 ──────────────────────────────────────────────────────────
-- raw device_id · reporter_key · liker_key · 신고 원문(note) · 이메일 주소 ·
-- API key · ADMIN_KEY 를 저장하지 않는다. 넣을 칸 자체를 두지 않았다.

-- ── 적용 후 검증 (SQL Editor 에서 실행) ──────────────────────────────────────
--   select
--     (select count(*) from information_schema.tables where table_schema='public'
--        and table_name='admin_notification_incidents')                     as incidents_created, -- 1
--     (select count(*) from information_schema.tables where table_schema='public'
--        and table_name='admin_notification_events')                        as events_created,    -- 1
--     (select count(*) from pg_indexes where tablename='admin_notification_incidents') as ani_indexes, -- 3
--     (select count(*) from pg_indexes where tablename='admin_notification_events')    as ane_indexes, -- 5
--     (select count(*) from pg_policies
--        where tablename in ('admin_notification_incidents','admin_notification_events')) as policies, -- 0
--     (select bool_and(relrowsecurity) from pg_class
--        where relname in ('admin_notification_incidents','admin_notification_events'))   as rls_enabled, -- true
--     (select count(*) from information_schema.role_table_grants
--        where table_name in ('admin_notification_incidents','admin_notification_events')
--          and grantee in ('anon','authenticated','PUBLIC'))                 as public_grants,     -- 0
--     (select count(*) from public.admin_notification_incidents)             as incident_rows,     -- 0
--     (select count(*) from public.admin_notification_events)                as event_rows;        -- 0
--
-- ── rollback ────────────────────────────────────────────────────────────────
-- 신규 테이블만 만든다. 되돌려도 기존 데이터에 영향이 없다.
-- 알림 이력이 쌓인 뒤에는 백업 후 실행할 것 — 지우면 이미 보낸 알림을
-- 다시 보내게 된다. events 가 incidents 를 참조하므로 순서가 중요하다.
--   drop table if exists public.admin_notification_events;
--   drop table if exists public.admin_notification_incidents;
