-- 052: Memory 한 개에 사진 여러 장 (additive)
--
-- 무엇을 더하나
--   `trip_moments` 는 지금 사진 한 장만 들 수 있다 — `storage_path` 하나뿐이다.
--   여행에서 한 장소를 한 장으로 남기는 사람은 없다. 그래서 사진을 담을 자식
--   테이블을 하나 더한다.
--
-- 왜 moment 를 복제하지 않나
--   사진마다 moment 행을 만들면 메모·장소·날짜가 사진 수만큼 중복되고, 메모를
--   고칠 때 몇 행을 고쳐야 하는지가 애매해진다. Memory 는 하나고 사진이 여럿이다.
--
-- 기존 사진은 건드리지 않는다
--   운영에 이미 있는 Memory 의 `storage_path` 는 그대로 둔다. 옮기지도, 지우지도,
--   UPDATE 하지도 않는다. 읽을 때 `storage_path` 한 장 + 이 테이블의 사진들을
--   하나의 목록으로 합친다. 첫 장은 계속 `storage_path` 에 남으므로 표지
--   (`cover_moment_id`)·`has_photo`·기존 photo-url API 가 모두 그대로 동작한다.
--
-- device_id·itinerary_id 를 왜 같이 두나
--   사진 한도(기기 100장·여행 30장)를 세기 위해서다. moment 를 거쳐 조인해서
--   세면 업로드마다 조인이 붙고, Storage 를 훑어 세면 moment 수만큼 왕복이
--   생긴다. 두 컬럼을 들고 있으면 한도 검사가 인덱스 하나짜리 count 두 번이다.
--   `trip_moments` 도 같은 이유로 device_id 를 직접 들고 있다.
--
-- 권한
--   027 이 잠근 개인 테이블과 같은 취급이다 — anon·authenticated 는 이 테이블을
--   건드릴 수 없고, 서버(service_role)만 읽고 쓴다. 소유권은 API 가 device 로
--   확인한다.
--
-- 적용 방법
--   이 저장소의 운영 SQL 은 Supabase Dashboard > SQL Editor 에서 사람이 직접
--   실행한다. `supabase db push` 로 적용하지 않는다.
--
-- 롤백 (되돌려야 할 때만 — 이 테이블의 사진 기록이 사라진다)
--   DROP TABLE IF EXISTS public.trip_moment_photos;

BEGIN;

CREATE TABLE IF NOT EXISTS public.trip_moment_photos (
  photo_id     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Memory 가 지워지면 사진 기록도 함께 사라진다. Storage 파일은 API 가
  -- 지우기 전에 먼저 치운다 — DB 만 지우고 파일을 남기지 않기 위해서다.
  moment_id    UUID        NOT NULL REFERENCES public.trip_moments(moment_id) ON DELETE CASCADE,

  -- 한도 계산용. 사실의 출처는 moment 지만, 세는 일이 잦아 여기 함께 둔다.
  itinerary_id UUID        NOT NULL,
  device_id    UUID        NOT NULL,

  -- `${itinerary_id}/${moment_id}/${uuid}.jpg` — 서버가 만든다.
  -- 같은 파일이 두 번 등록되지 않도록 유일하게 둔다.
  storage_path TEXT        NOT NULL UNIQUE,

  -- 표시 순서. 올린 순서를 그대로 쓴다. 같은 값이면 created_at 으로 가른다.
  sort_index   INTEGER     NOT NULL DEFAULT 0,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 한 Memory 의 사진을 순서대로 읽는다
CREATE INDEX IF NOT EXISTS idx_tmp_moment_order
  ON public.trip_moment_photos (moment_id, sort_index, created_at);

-- 한도 검사 두 개
CREATE INDEX IF NOT EXISTS idx_tmp_device    ON public.trip_moment_photos (device_id);
CREATE INDEX IF NOT EXISTS idx_tmp_itinerary ON public.trip_moment_photos (itinerary_id);

-- 027 이 개인 테이블에 건 것과 같은 잠금 — 서버만 만진다
ALTER TABLE public.trip_moment_photos ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.trip_moment_photos FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.trip_moment_photos FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.trip_moment_photos FROM authenticated;
GRANT  ALL PRIVILEGES ON TABLE public.trip_moment_photos TO   service_role;

COMMIT;

-- 적용 후 확인 (읽기 전용)
--   SELECT relrowsecurity FROM pg_class WHERE oid = 'public.trip_moment_photos'::regclass;
--   → true
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--    WHERE table_name = 'trip_moment_photos';
--   → service_role 만 남아 있어야 한다
