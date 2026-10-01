-- 088: 내 장소(user_spots) 사진을 장소당 최대 3장까지 (additive · 2026-10-01 · Staging 전용 적용)
--
-- 무엇을 더하나
--   user_spots 는 사진을 한 장만 든다 — photo_storage_path 하나뿐이다. 여행 중 한 장소를 한 장으로
--   남기지 않는다. 052(trip_moment_photos)와 같은 방식으로 자식 테이블을 더한다.
--
-- 기존 사진은 그대로다
--   photo_storage_path 는 계속 "대표 사진(1번)" 이다. 옮기지도 지우지도 않는다. 2·3번 사진만 이 테이블에
--   들어간다. 그래서 has_photo · 기존 photo-url API · 049 의 최소 식별(사진도 근거) 규칙이 그대로 동작한다.
--
-- 순서
--   1번 = photo_storage_path, 2·3번 = 이 테이블의 sort_index 오름차순. 순서를 바꾸면 경로를 자리끼리
--   바꾼다(파일은 그대로). 바꾸는 일은 아래 함수 한 번으로 — 중간 상태가 남지 않는다.
--
-- 한도
--   장소당 3장(대표 1 + 자식 2)은 API 와 아래 트리거가 함께 지킨다. 기기 100장 한도(USER_SPOT_PHOTO_DEVICE_LIMIT)는
--   API 가 대표 사진과 자식 사진을 함께 센다.

CREATE TABLE IF NOT EXISTS public.user_spot_photos (
  photo_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spot_id      UUID NOT NULL REFERENCES public.user_spots(id) ON DELETE CASCADE,
  device_id    TEXT NOT NULL,
  storage_path TEXT NOT NULL UNIQUE CHECK (char_length(storage_path) BETWEEN 1 AND 500),
  sort_index   INT  NOT NULL CHECK (sort_index BETWEEN 1 AND 2),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_spot_photos_spot   ON public.user_spot_photos (spot_id, sort_index);
CREATE INDEX IF NOT EXISTS idx_user_spot_photos_device ON public.user_spot_photos (device_id);
ALTER TABLE public.user_spot_photos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_spot_photos FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.user_spot_photos TO service_role;

-- 자식 사진은 최대 2장(대표 포함 3장)
CREATE OR REPLACE FUNCTION public.user_spot_photos_cap() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT count(*) FROM public.user_spot_photos WHERE spot_id = NEW.spot_id) >= 2 THEN
    RAISE EXCEPTION 'user_spot_photo_limit' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_user_spot_photos_cap ON public.user_spot_photos;
CREATE TRIGGER trg_user_spot_photos_cap BEFORE INSERT ON public.user_spot_photos
  FOR EACH ROW EXECUTE FUNCTION public.user_spot_photos_cap();

-- 순서·대표 바꾸기 — p_paths 는 새 순서의 저장 경로 전부(1번이 대표). 지금 가진 경로 집합과 정확히 같아야 한다.
-- 같은 집합이 아니면 아무것도 바꾸지 않고 false. 소유 확인은 호출하는 API(service_role)가 먼저 한다.
CREATE OR REPLACE FUNCTION public.user_spot_photos_set_order(p_spot uuid, p_paths text[])
RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE
  v_main   text;
  v_device text;
  v_have   text[];
  i        int;
BEGIN
  SELECT photo_storage_path, device_id::text INTO v_main, v_device FROM public.user_spots WHERE id = p_spot FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT array_agg(p ORDER BY p) INTO v_have FROM (
    SELECT v_main AS p WHERE v_main IS NOT NULL
    UNION ALL SELECT storage_path FROM public.user_spot_photos WHERE spot_id = p_spot
  ) s;
  IF v_have IS NULL OR p_paths IS NULL OR array_length(p_paths, 1) IS DISTINCT FROM array_length(v_have, 1)
     OR (SELECT array_agg(x ORDER BY x) FROM unnest(p_paths) x) <> v_have THEN
    RETURN false;
  END IF;
  DELETE FROM public.user_spot_photos WHERE spot_id = p_spot;
  -- 대표 사진이 바뀌면 공개 표시는 내린다 — 다른 사진이 조용히 공개되지 않게(048 photo_public 은 대표 사진에 대한 동의다)
  UPDATE public.user_spots
     SET photo_storage_path = p_paths[1],
         photo_public = CASE WHEN p_paths[1] = v_main THEN photo_public ELSE false END,
         updated_at = now()
   WHERE id = p_spot;
  FOR i IN 2 .. array_length(p_paths, 1) LOOP
    INSERT INTO public.user_spot_photos (spot_id, device_id, storage_path, sort_index)
    VALUES (p_spot, v_device, p_paths[i], i - 1);
  END LOOP;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.user_spot_photos_set_order(uuid, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_spot_photos_set_order(uuid, text[]) TO service_role;

-- 사진 한 장 빼기 — 대표 사진을 빼면 다음 사진이 대표가 된다(공개 표시는 내린다). 남은 순서를 1부터 다시 매긴다.
-- 돌려주는 값은 지운 저장 경로(호출 API 가 Storage 파일을 지운다). 없는 경로면 NULL.
-- 마지막 한 장이 장소의 유일한 근거(좌표·이름 없음)이면 빼지 않고 'ONLY_ANCHOR' 를 돌려준다.
CREATE OR REPLACE FUNCTION public.user_spot_photos_remove(p_spot uuid, p_path text)
RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_spot  public.user_spots%ROWTYPE;
  v_next  record;
  v_rows  record;
  i       int := 0;
BEGIN
  SELECT * INTO v_spot FROM public.user_spots WHERE id = p_spot FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_spot.photo_storage_path = p_path THEN
    SELECT photo_id, storage_path INTO v_next FROM public.user_spot_photos WHERE spot_id = p_spot ORDER BY sort_index LIMIT 1;
    IF v_next.photo_id IS NULL THEN
      IF v_spot.lat IS NULL AND (v_spot.name IS NULL OR btrim(v_spot.name) = '') THEN RETURN 'ONLY_ANCHOR'; END IF;
      UPDATE public.user_spots SET photo_storage_path = NULL, photo_public = false, updated_at = now() WHERE id = p_spot;
    ELSE
      DELETE FROM public.user_spot_photos WHERE photo_id = v_next.photo_id;
      UPDATE public.user_spots SET photo_storage_path = v_next.storage_path, photo_public = false, updated_at = now() WHERE id = p_spot;
    END IF;
  ELSE
    DELETE FROM public.user_spot_photos WHERE spot_id = p_spot AND storage_path = p_path;
    IF NOT FOUND THEN RETURN NULL; END IF;
  END IF;
  FOR v_rows IN SELECT photo_id FROM public.user_spot_photos WHERE spot_id = p_spot ORDER BY sort_index, created_at LOOP
    i := i + 1;
    UPDATE public.user_spot_photos SET sort_index = i WHERE photo_id = v_rows.photo_id;
  END LOOP;
  RETURN p_path;
END;
$$;
REVOKE ALL ON FUNCTION public.user_spot_photos_remove(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_spot_photos_remove(uuid, text) TO service_role;
