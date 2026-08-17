-- 051: get_shared_itinerary 의 공개 직접 실행 권한 회수
--
-- 무엇을 닫나
--   공개한 일정을 브라우저가 이 RPC 로 직접 읽던 시절이 있었다. 그때는 anon 에
--   EXECUTE 를 열어 둘 수밖에 없었다(030). 문제는 이 함수가 `days` 를 통째로
--   돌려준다는 것이다 — 화면이 쓰지도 않는 좌표·지도 링크·내부 식별자가 함께
--   나가고, My Place 를 담은 일정이라면 그 장소의 비공개 메모까지 실렸다.
--
--   `61a9dbf` 부터 브라우저는 이 함수를 부르지 않는다. 공개 일정은
--   `/api/shared/{id}/story` Pages Function 이 service_role 로 읽고 whitelist 로
--   정제해 돌려준다. 그런데 anon 키는 클라이언트 번들에 들어 있으므로, 그 경로를
--   쓰지 않고 share id 로 이 RPC 를 직접 부르면 여전히 원본이 나온다.
--   이 파일이 닫는 것은 그 마지막 우회로다.
--
-- 왜 세 대상을 한꺼번에 회수하나
--   PostgreSQL 함수는 생성 시 PUBLIC 에 EXECUTE 가 자동으로 붙는다. 030 이
--   그것을 회수했다는 기록은 있지만, 운영 ACL 을 직접 읽지 않고 "anon 만 지우면
--   된다" 고 가정하면 PUBLIC 경유 우회가 남을 수 있다. 없는 권한을 REVOKE 하는
--   것은 PostgreSQL 에서 아무 일도 일어나지 않으므로, 셋을 모두 지정하는 편이
--   추측보다 안전하다. 재실행해도 결과가 같다.
--
-- 무엇을 건드리지 않나
--   함수 본문·반환 구조·SECURITY DEFINER·search_path 를 그대로 둔다. RLS 도,
--   테이블 데이터도 건드리지 않는다. service_role 의 EXECUTE 는 유지한다 —
--   030 이 명시적으로 부여한 것이라 PUBLIC 회수의 영향을 받지 않는다.
--   (지금은 서버 코드도 이 RPC 를 쓰지 않고 테이블을 직접 읽지만, 서버 경로를
--    좁히는 것은 이 작업의 목적이 아니므로 그대로 남긴다.)
--
-- 적용 방법
--   이 저장소의 운영 SQL 은 Supabase Dashboard > SQL Editor 에서 사람이 직접
--   실행한다. `supabase db push` 로 적용하지 않는다 — 로컬 파일 수와 원격
--   history 기록 수가 다른 것은 이 저장소의 정상 상태다.
--
-- 적용 전 확인 (읽기 전용, SQL Editor 에서 실행)
--   SELECT p.oid::regprocedure AS signature,
--          pg_get_userbyid(p.proowner) AS owner,
--          p.prosecdef AS security_definer,
--          p.proacl    AS acl
--     FROM pg_proc p
--     JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'get_shared_itinerary';
--   → signature 가 아래와 다르거나 overload 가 2개 이상이면 실행하지 말고 보고할 것.
--
-- 롤백 (되돌려야 할 때만)
--   GRANT EXECUTE ON FUNCTION public.get_shared_itinerary(uuid) TO anon;
--   GRANT EXECUTE ON FUNCTION public.get_shared_itinerary(uuid) TO authenticated;
--   (PUBLIC 은 되돌리지 않는다. 030 이 이미 회수한 상태가 정상이다.)

BEGIN;

REVOKE EXECUTE ON FUNCTION public.get_shared_itinerary(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_shared_itinerary(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_shared_itinerary(uuid) FROM authenticated;

COMMIT;

-- 적용 후 확인 (읽기 전용)
--   위 조회를 다시 실행해 proacl 에서 anon=X/ 와 authenticated=X/ 항목이
--   사라졌는지, service_role=X/ 는 남아 있는지 확인한다.
