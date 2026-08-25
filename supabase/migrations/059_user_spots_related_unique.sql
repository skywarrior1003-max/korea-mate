-- 059 · My Places canonical dedup (TASK-MY-TRIP-TIMELINE-B-AND-DEDUP-V1-R1)
--
-- 원본 연결은 이미 있는 user_spots.related_city_spot_id (bigint, FK → city_spots(id) ON DELETE SET NULL) 다.
-- 새 컬럼을 만들지 않는다. backfill 하지 않는다. 어떤 행도 지우거나 고치지 않는다.
--
-- 계약: 같은 기기(device_id) + 같은 원본(related_city_spot_id) 은 한 행뿐이다.
-- API 는 insert 전에 기존 행을 찾아 돌려주고, check→insert 사이 경쟁은 이 partial UNIQUE 가 막는다.
--
-- 적용 전 조건: 이미 중복 그룹이 있으면 인덱스 생성이 실패한다. 아래 DO 블록이 그 사실을
-- 명확한 오류로 알린다 — 중복은 앱(픽 › 내 장소 › 🗑)에서 사용자가 직접 정리한 뒤 다시 적용한다.
-- Owner 가 Supabase SQL Editor 에서 직접 실행한다. (supabase db push 금지)

DO $$
DECLARE dup_groups integer;
BEGIN
  SELECT count(*) INTO dup_groups FROM (
    SELECT device_id, related_city_spot_id
    FROM public.user_spots
    WHERE related_city_spot_id IS NOT NULL
    GROUP BY device_id, related_city_spot_id
    HAVING count(*) > 1
  ) g;
  IF dup_groups > 0 THEN
    RAISE EXCEPTION '059 blocked: % duplicate (device_id, related_city_spot_id) group(s) exist. Remove duplicates in the app (My Places) first, then re-run.', dup_groups;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS user_spots_device_related_uniq
  ON public.user_spots (device_id, related_city_spot_id)
  WHERE related_city_spot_id IS NOT NULL;
