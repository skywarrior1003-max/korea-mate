-- 069: 장소 고유 활용 신호 (additive) — COMMUNITY-…-V2 §2
--
-- Owner 확정 계약: 장소 활용 = **저장 또는 내 여행에 추가**.
--   · 어느 한쪽만 해도 +3, 둘 다 해도 actor 당 최대 +3(중복 없음).
--   · 순서 무관, 반복 클릭·여러 trip 추가로 증가하지 않음.
--
-- 왜 place_saves 로 부족한가 (V2 감사 실증)
--   저장은 place_saves 에 남지만 "내 여행에 추가"는 기기 cart(localStorage)
--   에만 남아 서버 신호가 0 이었다. 또한 place_saves 는 **현재상태형**
--   (unsave = 행 삭제)이라 "활용했다"는 사실 축과 다르다.
--
-- 정책: 이벤트-누적형
--   활용은 "발생했다"는 사실이다. 저장을 취소하거나 trip 에서 빼도 그 사람이
--   이 장소를 실제로 여행 계획에 활용했던 사실은 사라지지 않는다 — 행을
--   지우지 않는다(§7-7·8·9 를 한 가지 정책으로 일관). usage_key UNIQUE 가
--   actor×장소당 1 을 강제하므로 어떤 조합·반복에도 1 이다.
--
-- 하지 않는 것: 068 수정 0 · 기존 place_saves 계약 변경 0 · RLS 완화 0 ·
-- raw device 저장 0 · itinerary 스캔 기반 랭킹 0 (이 테이블 tally 만 읽는다).

BEGIN;

CREATE TABLE IF NOT EXISTS public.place_usage (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  target_type  TEXT        NOT NULL CHECK (target_type IN ('city_spot')),
  target_key   TEXT        NOT NULL CHECK (char_length(target_key) BETWEEN 1 AND 64),
  -- sha256(device|usage:city_spot:key) — 대상별 해시라 기기 역추적 불가
  usage_key    TEXT        NOT NULL UNIQUE CHECK (char_length(usage_key) = 64),
  -- 최초 원인(관찰용) — 점수는 원인과 무관하게 행 존재 = 1 이다
  first_cause  TEXT        NOT NULL CHECK (first_cause IN ('save', 'trip_add')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_place_usage_target
  ON public.place_usage (target_type, target_key);
ALTER TABLE public.place_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.place_usage FROM anon, authenticated;

DO $v069$
DECLARE bad text;
BEGIN
  SELECT string_agg(relname, ', ') INTO bad
    FROM pg_class WHERE relname = 'place_usage' AND relrowsecurity = false;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '[069] RLS 미적용: %', bad;
  END IF;
END $v069$;

COMMIT;
