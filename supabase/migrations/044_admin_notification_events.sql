-- 044: 관리자 알림 이벤트(admin_notification_events)
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
-- 무엇이 아닌가
--   moderation 상태가 아니다. 알림은 "봐 주세요" 이고 판단은 place_reports 에
--   따로 있다. 이 표가 신고를 종결시키거나 장소를 숨기지 않는다.
--
-- 적용 방법
--   이 저장소는 원격 migration history 가 001~004 뿐이고, 운영 SQL 은 사용자가
--   Supabase SQL Editor 에서 직접 실행한다. `supabase db push` 로 적용하지 않는다.
--   기존 테이블을 DROP·ALTER 하지 않는다. 전부 IF NOT EXISTS 라 재실행해도 안전하다.
--
-- 적용 전 검증 (SQL Editor 에서 먼저 실행 — 0 이어야 한다)
--   select count(*) as table_exists from information_schema.tables
--     where table_schema='public' and table_name='admin_notification_events';

create table if not exists public.admin_notification_events (
  id              bigint generated always as identity primary key,

  -- 어떤 종류의 알림인가. 자유 문자열 축이라 나중에
  -- 'public_place_submission' 을 추가할 때 이 표를 다시 뜯지 않아도 된다.
  event_type      text not null,

  -- 무엇에 대한 알림인가. 공개 장소만 대상이다.
  target_type     text not null,
  target_key      text not null,

  -- 같은 event_type 안에서 축을 하나 더 나눠야 할 때 쓴다.
  -- 예: safety 알림은 category 를 여기 넣어 일반 임계와 구분한다.
  signal_key      text,

  -- 어떤 단계에 대한 알림인가. 'threshold:2' · 'like:10' 처럼 쓴다.
  milestone_key   text not null,

  -- 신고는 "지금 열려 있는 사건" 단위로만 중복을 막는다. 아래 UNIQUE 설명 참조.
  -- 좋아요처럼 평생 한 번이면 되는 알림은 이 값이 없다(빈 문자열로 채운다).
  incident_key    text not null default '',

  delivery_mode   text not null,   -- immediate | digest
  delivery_status text not null default 'pending',   -- pending | sent | failed

  -- 그때 몇 명이었나. 숫자 하나만 남긴다.
  metric_value    integer,

  created_at      timestamptz not null default now(),
  sent_at         timestamptz,
  failed_at       timestamptz,
  failure_code    text,

  constraint ane_target_type_chk  check (target_type in ('city_spot')),
  constraint ane_delivery_mode_chk check (delivery_mode in ('immediate','digest')),
  constraint ane_status_chk        check (delivery_status in ('pending','sent','failed')),
  constraint ane_event_type_len_chk    check (char_length(event_type)    between 1 and 64),
  constraint ane_milestone_len_chk     check (char_length(milestone_key) between 1 and 64),
  constraint ane_incident_len_chk      check (char_length(incident_key)  <= 64),
  constraint ane_signal_len_chk        check (signal_key is null or char_length(signal_key) <= 64),
  constraint ane_failure_code_len_chk  check (failure_code is null or char_length(failure_code) <= 64)
);

-- ── 중복 발송 방지 ──────────────────────────────────────────────────────────
--
-- 이 UNIQUE 하나가 이 기능 전체를 지탱한다. 동시에 들어온 두 요청 중
-- **먼저 INSERT 에 성공한 쪽만** 메일을 보낸다. 진 쪽은 23505 를 받고 조용히
-- 물러난다. SELECT 로 세고 나중에 기록하는 방식이었다면 둘 다 보냈을 것이다.
--
-- incident_key 가 열쇠에 들어 있는 이유
--   신고에 (target, milestone) 만으로 영구 UNIQUE 를 걸면 안 된다. 그건
--   "이 장소는 평생 두 번 다시 신고 알림을 못 받는다" 는 뜻이 된다. 8월에
--   문제를 고쳤는데 11월에 새 문제가 생기면 아무도 모르게 된다.
--   그래서 지금 열려 있는 사건(incident)마다 임계를 다시 쓸 수 있게 한다.
--   좋아요는 반대다 — 평생 한 번이면 되므로 incident_key 를 비워 둔다.
create unique index if not exists uq_ane_event_identity
  on public.admin_notification_events
     (event_type, target_type, target_key, incident_key, milestone_key);

-- 아직 안 보낸 digest 후보를 꺼낼 때 쓴다
create index if not exists idx_ane_pending
  on public.admin_notification_events (delivery_mode, delivery_status, created_at);

-- 한 장소의 알림 이력을 볼 때 쓴다
create index if not exists idx_ane_target
  on public.admin_notification_events (target_type, target_key, created_at desc);

-- ── 권한 ────────────────────────────────────────────────────────────────────
-- 브라우저는 이 표에 손댈 수 없다. 알림 이력은 운영 정보라 공개 대상이 아니다.
-- 쓰기·읽기 모두 Pages Function(service_role)만 한다.
alter table public.admin_notification_events enable row level security;

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
--     (select count(*) from information_schema.tables
--       where table_schema='public' and table_name='admin_notification_events')  as table_created,  -- 1
--     (select count(*) from pg_indexes where tablename='admin_notification_events') as indexes,     -- 4
--     (select count(*) from pg_policies where tablename='admin_notification_events') as policies,   -- 0
--     (select relrowsecurity from pg_class where relname='admin_notification_events') as rls_enabled,-- true
--     (select count(*) from information_schema.role_table_grants
--       where table_name='admin_notification_events'
--         and grantee in ('anon','authenticated','PUBLIC'))                        as public_grants, -- 0
--     (select count(*) from public.admin_notification_events)                      as rows_present;  -- 0
--
-- ── rollback ────────────────────────────────────────────────────────────────
-- 신규 테이블만 만든다. 되돌려도 기존 데이터에 영향이 없다.
-- 알림 이력이 쌓인 뒤에는 백업 후 실행할 것 — 지우면 이미 보낸 알림을
-- 다시 보내게 된다.
--   drop table if exists public.admin_notification_events;
