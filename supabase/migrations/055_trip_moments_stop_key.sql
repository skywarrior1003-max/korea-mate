-- 055: Memory(순간) ↔ 일정 장소의 일반 열쇠 `stop_key` (additive, nullable)
--
-- 무엇을 더하나
--   trip_moments.stop_key TEXT NULL
--
-- 왜 필요한가
--   Story 는 일정(itinerary)을 뼈대로 삼고, 사용자가 어떤 일정 장소에서 남긴
--   순간(사진·메모)으로 그 장소 항목을 개인화한다. 그 결합의 열쇠로 지금까지는
--   `city_spot_id`(026) 하나뿐이었다. 그래서 공식 장소(city_spots)가 아닌 일정
--   항목 — 내 장소(user_spots), 행사(event), 기타 출처 — 에서 남긴 순간은
--   어느 장소의 기억인지 저장할 곳이 없어 Story 에서 기본 항목과 따로 떠 있었다.
--
-- 값의 문법
--   일정 항목이 이미 들고 있는 출처 열쇠(`sourceKey`, src/lib/place-identity.ts)
--   를 그대로 쓴다 — 새 id 체계를 만들지 않는다.
--     city_spot:<숫자 id>
--     user_spot:<uuid>
--     event:<city>:<id>
--     local_info:<city>:<id>
--     stay:<uuid>          — 사용자의 실제 숙소 체크인 stop(일정에 넣을 때 만든 uuid)
--   서버(functions/api/trip-moments)가 형식을 검사하고, 잘못된 값은 400 이다.
--   같은 장소를 여러 날 가는 경우는 기존 `day_number` 와 함께 구별한다.
--
-- city_spot_id 는 그대로 둔다
--   검증된 결합 경로다. 공식 장소는 앞으로 두 값(`city_spot_id` + `stop_key`)을
--   같이 들고, 읽는 쪽은 `stop_key` 가 없으면 `city_spot_id` 로 떨어진다.
--   기존 행은 그대로 동작한다.
--
-- 하지 않는 것
--   기존 행 UPDATE·DELETE 0 · backfill 0 (과거 순간을 장소명으로 추측해 채우지
--   않는다) · RLS 완화 0 · anon/authenticated 권한 부여 0 · 공개 응답 컬럼 추가 0
--   (public serializer 는 이 컬럼을 읽지 않는다) · 인덱스 추가 0 (순간 조회는
--   itinerary_id + device_id 로 이미 좁혀진 뒤 메모리에서 결합한다).
--
-- 코드와의 순서
--   함수 코드는 이 컬럼이 없어도 동작한다 — 컬럼이 없다는 오류(42703/PGRST204)
--   를 받으면 `stop_key` 없이 한 번 더 저장/조회한다. 그래서 배포와 migration
--   의 순서가 어긋나도 순간 저장이 깨지지 않는다. 다만 migration 전에는 일반
--   장소 결합이 저장되지 않으므로(자유 순간으로 보임) 가능한 한 먼저 적용한다.
--
-- 적용 방법
--   이 저장소의 운영 SQL 은 Supabase Dashboard > SQL Editor 에서 사람이 직접
--   실행한다. `supabase db push` 로 적용하지 않는다.
--
-- 적용 전 확인 (읽기 전용)
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='trip_moments' AND column_name='stop_key';
--   → 0 행이어야 한다.
--
-- 롤백 (되돌려야 할 때만 — 이 컬럼의 값이 사라진다)
--   ALTER TABLE public.trip_moments DROP COLUMN IF EXISTS stop_key;

BEGIN;

ALTER TABLE public.trip_moments
  ADD COLUMN IF NOT EXISTS stop_key TEXT;

COMMENT ON COLUMN public.trip_moments.stop_key IS
  '일정 장소 출처 열쇠(sourceKey 문법: city_spot:<id> | user_spot:<uuid> | event:<city>:<id> | local_info:<city>:<id> | stay:<uuid>). day_number 와 함께 Story 결합에 쓴다. 자유 순간은 NULL.';

COMMIT;
