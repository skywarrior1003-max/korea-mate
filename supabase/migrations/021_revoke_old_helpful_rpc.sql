-- 021: increment_trip_helpful anon EXECUTE 차단
-- 적용 순서: 020 migration + 코드 배포 + smoke test 완료 후 단독 적용
-- 목적: shared/page.tsx가 신규 /api/itinerary/helpful/{id} 로 전환된 후
--       기존 anon 직접 RPC 호출 경로 영구 차단

REVOKE EXECUTE ON FUNCTION public.increment_trip_helpful(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_trip_helpful(UUID) FROM PUBLIC;
