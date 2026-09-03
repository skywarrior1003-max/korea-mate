-- 060: Social Actions Foundation — content_likes · place_saves · share_events
--
-- 목적 (TASK-GOKOREAMATE-SOCIAL-ACTIONS-FOUNDATION-V1)
--   · Like(공개 반응) 를 공개 Trip / 공개 Story 로 확장한다. 기존 place_likes(043)
--     는 손대지 않는다 — 그 테이블의 CHECK/이름은 city_spot 전용 계약이다.
--   · Save 는 사용자에게 비공개지만 향후 Popular ranking 의 raw signal 로 쓰기
--     위해 "현재 저장 중" 관계를 서버에 남길 수 있게 한다(append-only 아님).
--   · Share 는 count 를 공개하지 않지만 행동 자체는 기록한다(일 단위 dedup).
--
-- 지키는 것 (043·036 의 방식 그대로)
--   · raw device_id / IP / UA 를 저장하지 않는다. 서버가 만든 대상별 SHA-256
--     (64자리 hex) 만 저장한다. 행끼리 이어 붙여 한 사람을 재구성할 수 없다.
--   · Helpful(helpful_count·itinerary_helpful_votes)을 변환·삭제하지 않는다.
--   · 파괴적 변경 0 — additive 만. IF NOT EXISTS 로 재실행 안전.
--   · 브라우저 직접 읽기/쓰기 금지 — RLS 활성 + 정책 0개 (service_role 전용).
--
-- Production 적용: 이 파일 작성 시점에는 하지 않는다. 별도 승인된 PROD-SQL task 에서만.

-- ── 1) content_likes — 공개 Trip('itinerary') · 공개 Story('story') 좋아요 ──
-- target_key 는 두 타입 모두 itineraries.id (UUID 문자열). 'story' 는 같은 여행의
-- 공개 Story 표면에 대한 반응으로, API 가 "공개 여행 + 공개 moment ≥1" 을 검증한다.
-- FK 를 걸지 않는 이유: 원본 여행이 삭제되어도 반응 기록을 조용히 남겨 두고
-- (지표 왜곡 방지), 노출은 어차피 대상 조회가 실패하므로 일어나지 않는다.
create table if not exists public.content_likes (
  id          uuid        primary key default gen_random_uuid(),
  target_type text        not null,
  target_key  text        not null,
  liker_key   text        not null,
  created_at  timestamptz not null default now(),
  constraint content_likes_target_type_chk check (target_type in ('itinerary', 'story')),
  constraint content_likes_target_key_chk  check (char_length(target_key) between 1 and 64),
  constraint content_likes_liker_key_chk   check (char_length(liker_key) = 64)
);

-- 한 사람(가명 키)은 한 대상에 좋아요 하나 — unlike 는 행 삭제다.
create unique index if not exists uq_content_likes_liker_target
  on public.content_likes (liker_key, target_type, target_key);
create index if not exists idx_content_likes_target
  on public.content_likes (target_type, target_key);

alter table public.content_likes enable row level security;
revoke all on public.content_likes from anon, authenticated;

comment on table public.content_likes is
  '공개 Trip/Story 좋아요. liker_key = sha256(device|like:type:key) — raw device 저장 금지. service_role 전용.';

-- ── 2) place_saves — Save(북마크) 의 서버측 ranking signal ────────────────
-- 사용자 기능의 SSOT 는 여전히 기기 localStorage(favorites)다. 이 테이블은
-- "현재 저장 중" 관계의 best-effort 미러로, count 는 어디에도 공개하지 않는다.
-- unsave = 행 삭제 → 반복 토글로 숫자가 부풀지 않는다.
create table if not exists public.place_saves (
  id          uuid        primary key default gen_random_uuid(),
  target_type text        not null,
  target_key  text        not null,
  saver_key   text        not null,
  created_at  timestamptz not null default now(),
  constraint place_saves_target_type_chk check (target_type in ('city_spot')),
  constraint place_saves_target_key_chk  check (target_key ~ '^[0-9]{1,12}$'),
  constraint place_saves_saver_key_chk   check (char_length(saver_key) = 64)
);

create unique index if not exists uq_place_saves_saver_target
  on public.place_saves (saver_key, target_type, target_key);
create index if not exists idx_place_saves_target
  on public.place_saves (target_type, target_key);

alter table public.place_saves enable row level security;
revoke all on public.place_saves from anon, authenticated;

comment on table public.place_saves is
  'Save(북마크) ranking raw signal — 비공개. saver_key = sha256(device|save:type:key). 현재 관계만(삭제로 해제). service_role 전용.';

-- ── 3) share_events — Share 행동 기록 (count 비공개) ──────────────────────
-- 브라우저는 외부 앱 전달 완료까지 알 수 없으므로 이름을 과장하지 않는다:
-- "공유 UI 에서 share/copy 행동이 일어났다" 는 사실만 기록한다.
-- dedup: 같은 사람이 같은 대상·같은 방법을 하루 한 번만 — 스팸 클릭 방어와
-- 정직한 재공유 허용 사이의 단순한 절충(036 의 24h rolling 보다 가벼운 일 단위).
create table if not exists public.share_events (
  id          uuid        primary key default gen_random_uuid(),
  target_type text        not null,
  target_key  text        not null,
  actor_key   text        not null,
  method      text        not null,
  created_day date        not null default (now() at time zone 'utc')::date,
  created_at  timestamptz not null default now(),
  constraint share_events_target_type_chk check (target_type in ('itinerary', 'story', 'city_spot')),
  constraint share_events_target_key_chk  check (char_length(target_key) between 1 and 64),
  constraint share_events_actor_key_chk   check (char_length(actor_key) = 64),
  constraint share_events_method_chk      check (method in ('web_share', 'copy_link'))
);

create unique index if not exists uq_share_events_actor_target_day
  on public.share_events (actor_key, target_type, target_key, method, created_day);
create index if not exists idx_share_events_target
  on public.share_events (target_type, target_key);

alter table public.share_events enable row level security;
revoke all on public.share_events from anon, authenticated;

comment on table public.share_events is
  'Share 행동 기록(비공개 raw signal). actor_key = sha256(device|share:type:key). 일 단위 dedup. service_role 전용.';
