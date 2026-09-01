-- OWNER-RUN-BUSAN-GYEONGJU-LEGACY-RETIREMENT-V1.sql
-- TASK-BUSAN-GYEONGJU-LEGACY-RETIREMENT-CROSSWALK-V1 · candidate, NOT executed. Owner approval required.
-- SET A — SAFE_RETIRE_EXISTING_RESIDUE: 13 old Main rows still published in Production although the Final universe
--   either holds the same entity under another id (FINAL_REPLACED_BY_OTHER_ID) or does not contain them (FINAL_RETIRED).
--   Action: is_published = false only. DELETE 0. DDL 0. No other column. Strategic (94) and Owner-override (7, 28, 29, 42) rows are NOT included.
--   Supersedes OWNER-RUN-P4-preopen-busan-jangsan-legacy-unpublish-v6.sql (id 6 is in this set).
--   Rollback: update public.city_spots set is_published = true where id in (5, 6, 23, 32, 39, 50, 55, 57, 61, 64, 68, 81, 82);
begin;
do $$
declare v_cnt int;
begin
  create temp table _retire(id int, city text, name text) on commit drop;
  insert into _retire(id, city, name) values
    (5, 'busan', 'Hwangnyeongsan Night View Trail'),
    (6, 'busan', 'Jangsan Mountain Trail'),
    (23, 'busan', 'BIFF Square'),
    (32, 'busan', 'Geumjeongsanseong Fortress'),
    (39, 'busan', 'Cheongsapo Daritdol Observatory'),
    (50, 'busan', 'Busan Harbor Bridge Viewpoint'),
    (55, 'busan', 'Seomyeon Shopping District'),
    (57, 'busan', 'Oncheoncheon Stream Park'),
    (61, 'busan', 'Mandeok Pass Deck'),
    (64, 'busan', 'Nakdong River Estuary Eco Center'),
    (68, 'busan', 'Ananti Cove Gijang'),
    (81, 'busan', 'Busan Station'),
    (82, 'busan', '168 Stairs and Monorail Area');
  select count(*) into v_cnt from _retire t join public.city_spots c on c.id = t.id and c.city = t.city and c.name = t.name and c.is_published = true;
  if v_cnt <> 13 then raise exception 'PRECONDITION FAILED: expected 13 published rows with matching id/city/name, got %', v_cnt; end if;
  select count(*) into v_cnt from public.city_spots where id in (30, 93, 94, 1392) and is_published = true;
  if v_cnt <> 4 then raise exception 'PRECONDITION FAILED: canonical/strategic rows 30/93/94/1392 must be published (got %)', v_cnt; end if;

  update public.city_spots c set is_published = false, updated_at = now() from _retire t where c.id = t.id and c.is_published = true;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 13 then raise exception 'POSTCONDITION FAILED: expected 13 rows updated, got %', v_cnt; end if;
  select count(*) into v_cnt from _retire t join public.city_spots c on c.id = t.id where c.is_published = true;
  if v_cnt <> 0 then raise exception 'POSTCONDITION FAILED: % target rows still published', v_cnt; end if;
  select count(*) into v_cnt from public.city_spots where id in (30, 93, 94, 1392) and is_published = true;
  if v_cnt <> 4 then raise exception 'POSTCONDITION FAILED: canonical/strategic rows changed'; end if;
end $$;
commit;
-- READ-BACK: select id, city, name, is_published, updated_at from public.city_spots where id in (5, 6, 23, 32, 39, 50, 55, 57, 61, 64, 68, 81, 82) order by id;
