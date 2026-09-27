-- 078: account_devices — 기기→계정 소유권 매핑 (DEVICE-ACCOUNT-LINKING-SECURITY-V1 §5)
--
-- 계약:
--  · device 하나는 정확히 한 계정에만 연결된다(device_id PK).
--  · 연결은 불변이다 — 같은 user 재연결은 멱등, 다른 user 는 충돌(overwrite 금지).
--  · **ON DELETE RESTRICT**: auth user 가 예상치 않게 삭제될 때 mapping 이 자동
--    소멸하면 linked device 가 다시 익명 device 처럼 취급되어 계정 콘텐츠가
--    무세션 접근에 열린다. 계정 삭제 기능이 콘텐츠 처리 후 mapping 을 **명시적
--    으로** 지우는 것만 허용한다(CASCADE 금지 — 가드 감시).
--  · 접근: service_role 전용(RLS ON + policy 0 + REVOKE). 콘텐츠 행의 대량
--    user_id backfill·기존 데이터 삭제 없음 — 소유권은 이 매핑으로만 확장된다.
--  · PII 없음: device UUID(기존 익명 식별자)와 user id·시각뿐.

BEGIN;

CREATE TABLE IF NOT EXISTS public.account_devices (
  device_id  UUID        PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  linked_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_account_devices_user ON public.account_devices (user_id);

ALTER TABLE public.account_devices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.account_devices FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.account_devices TO service_role;

-- ── 원자 연결 함수 — 경합에서도 overwrite 가 불가능한 유일한 쓰기 경로 ──────
-- 같은 user: 멱등 성공(ok=true, already=true) · 다른 user: 충돌(ok=false)
-- 기존 행 UPDATE 없음·외부 호출 없음·secret 없음·raw id 반환 없음(입력 재반환 금지).
CREATE OR REPLACE FUNCTION public.link_device_to_account(p_device UUID, p_user UUID)
RETURNS TABLE (ok BOOLEAN, already BOOLEAN, conflict BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_owner UUID;
BEGIN
  INSERT INTO public.account_devices (device_id, user_id)
  VALUES (p_device, p_user)
  ON CONFLICT (device_id) DO NOTHING;

  SELECT user_id INTO v_owner FROM public.account_devices WHERE device_id = p_device;
  IF v_owner IS NULL THEN
    -- INSERT 도 조회도 실패 — 판정 불가는 실패로(fail closed)
    RETURN QUERY SELECT false, false, false;
  ELSIF v_owner = p_user THEN
    RETURN QUERY SELECT true, true, false;   -- 신규든 기존이든 같은 user = 멱등 성공
  ELSE
    RETURN QUERY SELECT false, false, true;  -- 다른 계정 소유 — 충돌(변경 0)
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.link_device_to_account(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_device_to_account(UUID, UUID) TO service_role;

-- ── 검증 ────────────────────────────────────────────────────────────────────
DO $v078$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'public.account_devices'::regclass AND c.contype = 'f' AND c.confdeltype = 'c'
  ) THEN
    RAISE EXCEPTION '[078] CASCADE 금지 — RESTRICT 여야 한다';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'account_devices'
      AND column_name IN ('email','name','ip','user_agent','token')
  ) THEN
    RAISE EXCEPTION '[078] PII 컬럼 금지';
  END IF;
END $v078$;

COMMIT;
