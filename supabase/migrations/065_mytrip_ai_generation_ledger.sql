-- 065: AI generation 비용 원장 보완 (DRAFT — Staging 전용)
-- (MULTILOCALE-TREND-DB V2 §11 — V1 결함 수정)
--
-- ⚠ Production 적용 금지(063 도 미적용 상태다).
--
-- V1 결함: provider 실패 시 pending row 를 삭제해 실제 과금 가능 호출이 일일
-- 한도에서 빠질 수 있었다. 수정: provider 를 시작한 row 는 삭제하지 않는다.
--
-- 상태 매핑(§11 명세 ↔ 구현):
--   reserved                = row 예약(¹provider 시작 전)
--   provider_started        = provider 요청 시작(이 시점부터 일일 한도 포함)
--   succeeded / failed      = provider 결과(둘 다 원장에 남고 한도에 계산)
--   rejected_before_provider= row 를 만들지 않거나(rate-limit·invalid image)
--                             reserved 단계에서 삭제(no_key) — 과금 제외(§11)
--   cache_hit               = row 미생성·hit_count 증가로 기록 — 과금 제외(§11)
-- 실패 row 는 cache 로 재사용되지 않는다(읽기는 succeeded 만).
-- 063 파일은 수정하지 않는다 — 이 migration 이 상태 계약을 교체한다.

alter table public.mytrip_ai_generations drop constraint if exists mytrip_ai_generations_status_check;
update public.mytrip_ai_generations set status = 'provider_started' where status = 'pending';
update public.mytrip_ai_generations set status = 'succeeded' where status = 'ready';
alter table public.mytrip_ai_generations
  add constraint mytrip_ai_generations_status_check
  check (status in ('reserved', 'provider_started', 'succeeded', 'failed'));
alter table public.mytrip_ai_generations alter column status set default 'reserved';

-- 실패 사유 코드(민감정보 없는 상태 문자열만 — 예: fallback_http_429·fallback_timeout)
alter table public.mytrip_ai_generations add column if not exists fail_code text;

-- 한도 집계용(provider 를 시작한 row 만)
create index if not exists mytrip_ai_generations_billable
  on public.mytrip_ai_generations (owner_hash, created_at desc)
  where status in ('provider_started', 'succeeded', 'failed');
