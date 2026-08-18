-- 053: Memory 의 장소 표시명 + 공개 동의 (additive)
--
-- 무엇을 더하나
--   ① place_name              — 사람이 읽는 장소 표시명
--   ② public_consent_at       — 이 Memory 를 공개하기로 한 시각
--   ③ public_consent_version  — 그때 동의한 문구의 판본
--
-- 왜 location_label 을 쓰지 않나
--   그 컬럼에는 `formatCoord()` 가 만든 좌표 문자열이 들어 있다("35.18°N
--   129.08°E"). 사람이 읽는 장소 이름이 아니고, 공개하면 소수점 두 자리 좌표를
--   내보내는 것이 된다. 이름이 비슷해 헷갈리기 쉬워 여기 적어 둔다 —
--   location_label 은 계속 비공개고, 공개 표시명은 place_name 이다.
--
-- 왜 snapshot 인가
--   일정을 고치면(장소 삭제·순서 변경·추가) 과거 Memory 가 가리키던 장소가
--   달라질 수 있다. 그때 화면의 장소명이 저절로 다른 이름으로 바뀌면 그건
--   그 사람의 기억이 아니다. 그래서 Memory 가 자기 이름을 들고 있는다.
--   일정에서 실시간으로 찾아 오지 않는다.
--
-- city_spot_id 는 새로 만들지 않는다
--   026 이 이미 nullable BIGINT → city_spots(id) 로 만들어 두었고 지금까지
--   비어 있었다. 공식 장소일 때만 채운다. 표시명의 정본이 아니라, 나중에
--   "이 장소를 내 Saved 로" 를 붙일 때 쓰는 열쇠다.
--
-- 동의 불변식을 왜 NOT VALID 로 거나
--   "공개인데 동의 기록이 없는 행은 없다" 를 CHECK 로 걸고 싶다. 그런데 일반
--   ADD CONSTRAINT 는 기존 행을 전부 검사한다. 운영에 is_public=true 인 행이
--   하나도 없다고 **가정하지 않는다** — 있으면 migration 이 실패하고, 그걸
--   피하려고 데이터를 고치는 것은 이 작업의 범위가 아니다.
--   NOT VALID 로 걸면 앞으로 들어오거나 수정되는 행에는 강제되고 기존 행은
--   건드리지 않는다. 나중에 운영에서 위반 행이 0 임을 확인한 뒤
--   VALIDATE CONSTRAINT 로 승격하면 된다(이 작업에서는 하지 않는다).
--
-- 하지 않는 것
--   기존 행 UPDATE·DELETE 0 · location_label 변환 0 · lat/lng 변경 0 ·
--   is_public 일괄 변경 0 · backfill 0 · RLS 완화 0 · anon/authenticated 권한
--   부여 0 · Storage 변경 0. 027 의 잠금과 service_role 전용 계약 그대로다.
--
-- 적용 방법
--   이 저장소의 운영 SQL 은 Supabase Dashboard > SQL Editor 에서 사람이 직접
--   실행한다. `supabase db push` 로 적용하지 않는다.
--
-- 적용 전 확인 (읽기 전용)
--   SELECT count(*) FROM public.trip_moments WHERE is_public IS TRUE;
--   → 0 이면 나중에 VALIDATE CONSTRAINT 로 승격해도 안전하다는 뜻이다.
--
-- 롤백 (되돌려야 할 때만 — 이 세 컬럼의 값이 사라진다)
--   ALTER TABLE public.trip_moments
--     DROP CONSTRAINT IF EXISTS trip_moments_public_consent_check;
--   ALTER TABLE public.trip_moments
--     DROP COLUMN IF EXISTS place_name,
--     DROP COLUMN IF EXISTS public_consent_at,
--     DROP COLUMN IF EXISTS public_consent_version;

BEGIN;

ALTER TABLE public.trip_moments
  ADD COLUMN IF NOT EXISTS place_name             TEXT,
  ADD COLUMN IF NOT EXISTS public_consent_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS public_consent_version TEXT;

-- 공개로 표시된 Memory 에는 반드시 동의 기록이 있다.
-- NOT VALID — 기존 행은 검사하지 않는다(위 주석 참조).
ALTER TABLE public.trip_moments
  DROP CONSTRAINT IF EXISTS trip_moments_public_consent_check;

ALTER TABLE public.trip_moments
  ADD CONSTRAINT trip_moments_public_consent_check
  CHECK (is_public IS NOT TRUE OR public_consent_at IS NOT NULL)
  NOT VALID;

COMMIT;

-- 적용 후 확인 (읽기 전용)
--   SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_name = 'trip_moments'
--      AND column_name IN ('place_name','public_consent_at','public_consent_version');
--   → 3행, 전부 nullable
--
--   SELECT conname, convalidated FROM pg_constraint
--    WHERE conrelid = 'public.trip_moments'::regclass
--      AND conname = 'trip_moments_public_consent_check';
--   → convalidated = false (의도한 상태)
