-- 063: My Trip AI generation 영구 캐시 + 호출 원장 (DRAFT — Staging 전용)
-- (MAIN-AI-TREND-PACK-PERSISTENT-CACHE-COST-GUARD-AND-WITTY-PREVIEW-V1 §D)
--
-- ⚠ Production 적용 금지 — Owner 가 Preview 결과·TTL·한도 정책을 승인한 뒤
--   별도 절차로만 적용한다. 이 파일은 Staging(koreamate-staging)에서만 실행됐다.
--
-- 목적
--  · 같은 입력(entity+locale+문맥해시+사진해시+prompt/trend 버전)의 AI 후보를
--    서버에 보관해 브라우저·기기·세션이 달라도 재호출 0 (§C).
--  · provider 호출 rows 자체가 rate-limit 원장이다(인메모리 금지, §I) —
--    cache hit 는 hit_count 만 올리고 row 를 만들지 않으므로 한도에서 제외된다.
--  · 선택·수정 행동의 최소 메타데이터만 보관(§E) — 원문 사진·base64·signed URL·
--    EXIF/GPS·API key·전체 request body·raw IP 는 저장하지 않는다.
--
-- 접근: RLS enable + 정책 0 = service_role 전용(공개 serializer·클라 직접 접근 0).
-- 소유 경계: itinerary(entity). 읽기 전 함수 계층에서 device 소유 검증을 거친다.
-- 재생성: 기존 row 를 superseded=true 로 두고 같은 cache_key 의 새 row 를 만든다 —
--   부분 유니크 인덱스(superseded=false)가 "현재값 1개" 와 single-flight 를 보장한다.

create table if not exists public.mytrip_ai_generations (
  id                 uuid primary key default gen_random_uuid(),
  cache_key          text not null,
  feature            text not null check (feature in ('moment3', 'storyHero')),
  itinerary_id       uuid not null,
  owner_hash         text not null,             -- sha256(salt|device_id) — raw device id 저장 금지
  locale             text not null,
  context_hash       text not null,
  image_sha          text,                      -- 전처리 base64 의 sha256 — 픽셀·base64 자체는 저장 금지
  prompt_version     text not null,
  model              text not null,
  trend_pack_version text,
  status             text not null default 'pending' check (status in ('pending', 'ready')),
  result             jsonb,                     -- 생성 3안(또는 hero 1쌍) — 검증 통과본만
  trend_used_id      text,                      -- 검증 통과한 pack id(내부 진단 전용)
  in_tok             integer,
  out_tok            integer,
  think_tok          integer,
  latency_ms         integer,
  hit_count          integer not null default 0,
  superseded         boolean not null default false,
  regenerated_from   uuid references public.mytrip_ai_generations(id),
  chosen_style       text check (chosen_style in ('calm', 'witty', 'warm')),
  chosen_at          timestamptz,
  edited             boolean,
  title_len_delta    integer,
  memo_len_delta     integer,
  saved              boolean,
  created_at         timestamptz not null default now(),
  expires_at         timestamptz not null
);

-- 현재값 1개 + 동시 요청 single-flight(동일 키 두 번째 INSERT 는 conflict)
create unique index if not exists mytrip_ai_generations_cache_key_current
  on public.mytrip_ai_generations (cache_key) where superseded = false;
-- rate-limit 원장 조회용
create index if not exists mytrip_ai_generations_itinerary_created
  on public.mytrip_ai_generations (itinerary_id, created_at desc);
create index if not exists mytrip_ai_generations_owner_created
  on public.mytrip_ai_generations (owner_hash, created_at desc);
create index if not exists mytrip_ai_generations_created
  on public.mytrip_ai_generations (created_at desc);

-- service_role 전용 — 정책을 만들지 않는다(anon/authenticated 접근 전면 차단)
alter table public.mytrip_ai_generations enable row level security;
