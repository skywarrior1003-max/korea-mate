-- 013_city_spots_unique_city_name.sql
-- (city, name) UNIQUE 제약 — CSV bulk upsert 중복 방지
-- 실행 전: city_spots 테이블에 같은 (city, name) 중복 행이 없어야 함

ALTER TABLE city_spots
  ADD CONSTRAINT uq_city_spots_city_name UNIQUE (city, name);
