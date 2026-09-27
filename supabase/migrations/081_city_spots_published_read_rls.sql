-- 081_city_spots_published_read_rls.sql
-- CITY-SPOTS-RLS-HOTFIX-V1 — 공개 장소만 읽기 (보안 hotfix)
--
-- 무엇을
--   city_spots 의 SELECT RLS 를 "anon 이 전 행"에서 "anon·authenticated 가
--   is_published=true 행만"으로 교체한다. 정책 1건 교체 외에 아무것도 하지 않는다.
--
-- 왜
--   기존 anon_read_city_spots 는 TO anon USING (true) — 익명 Data API 가
--   is_published=false(보존하되 숨김) 행까지 직접 조회할 수 있었다(2026-09-27
--   HEAD count 실측: Production 368행 전부 집계 가능). 동시에 authenticated 는
--   정책이 없어 공개 행도 0행 — 로그인 도입 시 Explore/일정 hydration 이 빈다.
--   이 한 정책이 두 문제를 함께 만든다.
--
-- 왜 안전한가 (기존 화면 보존 근거 — 2026-09-27 감사)
--   · 일정 표시는 저장된 스냅숏(days 인라인)으로 렌더된다 — 실시간 조회 의존 0.
--   · 브라우저의 city_spots 조회 전 경로(Explore·itinerary hydration·DayMap·
--     Near Me·quiet)는 이미 discovery(is_published=true) 필터를 스스로 건다
--     (UNPUBLISHED-PLACE-GATE-V1). 미매칭 항목은 snapshot name-only 로 남는
--     fallback 이 코드에 있다(src/lib/city-spots.ts fetchCitySpotsByIds).
--   · 서버(Functions)는 service_role — RLS 의 영향을 받지 않는다.
--   · places 테이블이 이미 같은 패턴(공개 조건 qual·양 role)을 쓴다.
--
-- 재실행 안전
--   두 정책 이름 모두 DROP IF EXISTS 후 CREATE — 몇 번을 다시 실행해도 최종
--   상태가 같다(멱등). BEGIN/COMMIT 한 트랜잭션이라 교체 도중 밖에서는 이전
--   정책이 그대로 보이고, COMMIT 순간에만 새 정책으로 바뀐다(더 넓게 열리는
--   중간 상태 없음).
--
-- 하지 않는 것
--   grant 변경 · 다른 테이블/정책 · 컬럼/데이터 변경 · service_role 경로 변경.
--   롤백은 "익명 전 행 개방으로 복원"이 아니다 — 문제가 생기면 이 파일의
--   USING 조건을 고치는 전방 수정(ALTER POLICY)으로 대응한다(차단 유지).
--
-- 적용: 사람이 직접(Management API/SQL Editor). 적용 여부는 별도 원장에 기록.
-- 의존: public.city_spots + is_published(056) 뿐 — 077~080 과 상호 의존 0
--       (Production 076 상태에 먼저 적용해도, 077~080 뒤에 적용해도 결과 동일).

BEGIN;

DROP POLICY IF EXISTS anon_read_city_spots ON public.city_spots;
DROP POLICY IF EXISTS anon_authenticated_read_published_city_spots ON public.city_spots;

CREATE POLICY anon_authenticated_read_published_city_spots
  ON public.city_spots
  FOR SELECT
  TO anon, authenticated
  USING (is_published = true);

COMMIT;
