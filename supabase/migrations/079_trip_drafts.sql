-- 079: trip_drafts — This Trip(생성 전 장소 바구니) 서버 스냅숏 (THIS-TRIP-SYNC-V1)
--
-- 배경: 생성 전 This Trip 은 localStorage(cart)뿐이라 실제 기기 전용이었다
-- (CASE B). 이 테이블이 계정/게스트 축의 단일 스냅숏 원장이 된다.
--
-- 모델(§5 무손실):
--  · owner 당 정확히 1행 — guest 는 device 축, active account 는 user 축.
--  · items 는 카트 배열 전체(JSONB). 카트는 원래 다도시 컨테이너라(항목마다
--    tripCity) 서로 다른 도시의 draft 는 한 배열에서 그대로 공존한다 —
--    로그인 병합은 sourceKey 기준 합집합이라 어느 쪽도 폐기되지 않는다.
--  · 병합(activate)은 guest device 행을 user 행으로 합친 뒤 device 행을
--    제거한다(이동이지 삭제가 아니다 — 재병합 방지·멱등).
--  · owner_id 는 다형(device UUID 또는 auth user UUID)이라 FK 를 걸지 않는다.
--    계정 삭제 기능이 user 축 행을 명시적으로 정리해야 한다(운영 문서 §6).
--  · PII 없음: 장소 표시 데이터(이름·좌표·분류)와 정렬/고정 필드뿐이다.
--
-- 접근: service_role API 전용(RLS ON + policy 0 + REVOKE). 클라이언트는
-- /api/trip-draft 를 통해서만 접근하고 소유권은 resolveOwnership 이 판정한다.

BEGIN;

CREATE TABLE IF NOT EXISTS public.trip_drafts (
  owner_type  TEXT        NOT NULL CHECK (owner_type IN ('device','user')),
  owner_id    UUID        NOT NULL,
  items       JSONB       NOT NULL DEFAULT '[]'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_type, owner_id)
);

ALTER TABLE public.trip_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.trip_drafts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.trip_drafts TO service_role;

DO $v079$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'trip_drafts'
      AND column_name IN ('email','name','ip','user_agent','token','actor_hash')
  ) THEN
    RAISE EXCEPTION '[079] PII 컬럼 금지';
  END IF;
END $v079$;

COMMIT;
