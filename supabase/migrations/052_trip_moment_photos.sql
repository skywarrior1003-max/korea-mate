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
-- 왜 전부 text 인가 — 처음에 uuid 로 적었다가 운영에서 실패했다
--   첫 판은 `moment_id UUID` 였고 SQL Editor 에서 42804 로 거부됐다:
--     "Key columns moment_id and moment_id are of incompatible types: uuid and text"
--   운영 `trip_moments.moment_id` 는 **text** 다. 근거는 오류만이 아니다 —
--   운영에 이미 적용된 031 이 `cover_moment_id text` 를 만들고 그 컬럼으로
--   `REFERENCES public.trip_moments(moment_id)` FK 를 걸었다. FK 는 양쪽 타입이
--   맞아야 만들어지므로, 031 이 성공했다는 사실 자체가 부모가 text 라는 증거다.
--   그 증거가 저장소 안에 내내 있었는데 005(운영 테이블과 다른 옛 설계도)를
--   보고 uuid 로 적었다.
--
--   `itinerary_id`·`device_id` 는 어느 migration 도 타입을 적어 두지 않았고
--   FK 도 없다. 그래서 실제 타입을 모른다. 모르는 것을 맞히지 않는다 — 이 둘은
--   FK 를 걸지 않으므로 타입이 달라도 DDL 이 거부하지 않고, PostgREST 는 값을
--   문자열로 주고받으므로 text 로 두면 부모가 uuid 든 text 든 비교가 맞는다.
--   틀릴 수 있는 자리를 아예 없앤 것이다.
--
--   `photo_id` 만 uuid 다. 이 테이블에서 새로 만드는 값이라 맞출 부모가 없고,
--   API 가 UUID 형식으로 검증해 돌려준다.
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
-- 적용 전 확인 (읽기 전용 — 실제 타입을 눈으로 보고 시작한다)
--   SELECT a.attname,
--          format_type(a.atttypid, a.atttypmod) AS actual_type
--     FROM pg_attribute a
--    WHERE a.attrelid = 'public.trip_moments'::regclass
--      AND a.attname IN ('moment_id', 'itinerary_id', 'device_id')
--      AND a.attnum > 0 AND NOT a.attisdropped;
--   → moment_id 가 text 여야 아래 FK 가 만들어진다. uuid 로 나오면 실행하지 말고
--     보고할 것 — 그때는 이 파일이 다시 틀린 것이다.
--
--   SELECT to_regclass('public.trip_moment_photos');
--   → NULL 이어야 한다. 값이 나오면 이미 만들어진 것이므로 실행 전에 알릴 것.
--     (직전 시도는 BEGIN 안에서 실패해 아무것도 만들어지지 않았다)
--
-- 롤백 (되돌려야 할 때만 — 이 테이블의 사진 기록이 사라진다)
--   DROP TABLE IF EXISTS public.trip_moment_photos;

BEGIN;

CREATE TABLE IF NOT EXISTS public.trip_moment_photos (
  photo_id     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Memory 가 지워지면 사진 기록도 함께 사라진다. Storage 파일은 API 가
  -- 지우기 전에 먼저 치운다 — DB 만 지우고 파일을 남기지 않기 위해서다.
  -- text 인 이유는 위 주석 참조 — 운영 부모 컬럼이 text 다(031 이 증명).
  moment_id    TEXT        NOT NULL REFERENCES public.trip_moments(moment_id) ON DELETE CASCADE,

  -- 한도 계산용. 사실의 출처는 moment 지만, 세는 일이 잦아 여기 함께 둔다.
  -- FK 를 걸지 않으므로 부모 타입이 무엇이든 이 선언이 거부되지 않는다.
  itinerary_id TEXT        NOT NULL,
  device_id    TEXT        NOT NULL,

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
