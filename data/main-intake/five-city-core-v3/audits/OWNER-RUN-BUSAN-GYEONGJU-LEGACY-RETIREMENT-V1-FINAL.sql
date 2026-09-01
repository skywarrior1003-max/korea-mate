-- OWNER-RUN-BUSAN-GYEONGJU-LEGACY-RETIREMENT-V1-FINAL.sql
-- TASK-BUSAN-GYEONGJU-LEGACY-RETIREMENT-SET-A-FINALIZE-AND-STATIC-CONTRACT-V1 · FINAL candidate, NOT executed. Owner approval required.
-- SET A — SAFE_RETIRE_EXISTING_RESIDUE: 17 old Main rows still published in Production although the Final universe holds the same
--   entity under another id (id 6 → 30) or does not contain them (16 rows, incl. historical OWNER_OVERRIDE 7/28/29/42 per the latest
--   Owner principle). Action: is_published = false only. DELETE 0. persistent DDL 0. No other column. Strategic id 94 NOT included.
--   Supersedes OWNER-RUN-BUSAN-GYEONGJU-LEGACY-RETIREMENT-V1.sql (13 rows) and OWNER-RUN-P4-preopen-busan-jangsan-legacy-unpublish-v6.sql.
--   Rollback: update public.city_spots set is_published = true where id in (5, 6, 7, 23, 28, 29, 32, 39, 42, 50, 55, 57, 61, 64, 68, 81, 82);
begin;
do $$
declare v_cnt int;
begin
  create temp table _retire(id int, city text, name text) on commit drop;
  insert into _retire(id, city, name) values
    (5, 'busan', 'Hwangnyeongsan Night View Trail'),
    (6, 'busan', 'Jangsan Mountain Trail'),
    (7, 'busan', 'Igidae Coastal Walk'),
    (23, 'busan', 'BIFF Square'),
    (28, 'busan', 'Oryukdo Skywalk'),
    (29, 'busan', 'Igidae Coastal Trail'),
    (32, 'busan', 'Geumjeongsanseong Fortress'),
    (39, 'busan', 'Cheongsapo Daritdol Observatory'),
    (42, 'busan', 'The Bay 101'),
    (50, 'busan', 'Busan Harbor Bridge Viewpoint'),
    (55, 'busan', 'Seomyeon Shopping District'),
    (57, 'busan', 'Oncheoncheon Stream Park'),
    (61, 'busan', 'Mandeok Pass Deck'),
    (64, 'busan', 'Nakdong River Estuary Eco Center'),
    (68, 'busan', 'Ananti Cove Gijang'),
    (81, 'busan', 'Busan Station'),
    (82, 'busan', '168 Stairs and Monorail Area');
  select count(*) into v_cnt from _retire;
  if v_cnt <> 17 then raise exception 'TARGET LIST FAILED: expected 17 ids, got %', v_cnt; end if;
  select count(*) into v_cnt from _retire t join public.city_spots c on c.id = t.id and c.city = t.city and c.name = t.name and c.is_published = true and c.source_type = 'manual';
  if v_cnt <> 17 then raise exception 'PRECONDITION FAILED: expected 17 published manual rows with matching id/city/name, got %', v_cnt; end if;
  select count(*) into v_cnt from public.city_spots where id in (94, 30, 93, 1392) and is_published = true;
  if v_cnt <> 4 then raise exception 'PRECONDITION FAILED: 94 (strategic) / 30 (장산 canonical) / 93 (지밀레니얼) / 1392 (장산 지질공원) must be published (got %)', v_cnt; end if;

  update public.city_spots c set is_published = false, updated_at = now() from _retire t where c.id = t.id and c.is_published = true;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 17 then raise exception 'POSTCONDITION FAILED: expected 17 rows updated, got %', v_cnt; end if;
  select count(*) into v_cnt from _retire t join public.city_spots c on c.id = t.id where c.is_published = true;
  if v_cnt <> 0 then raise exception 'POSTCONDITION FAILED: % target rows still published', v_cnt; end if;
  select count(*) into v_cnt from public.city_spots where id in (94, 30, 93, 1392) and is_published = true;
  if v_cnt <> 4 then raise exception 'POSTCONDITION FAILED: strategic/canonical rows changed'; end if;
  select count(*) into v_cnt from public.city_spots where city = 'busan' and is_published = true;
  if v_cnt <> 805 - 17 then raise exception 'POSTCONDITION FAILED: busan published count expected %, got %', 805 - 17, v_cnt; end if;
end $$;
commit;
-- READ-BACK: select id, city, name, is_published, updated_at from public.city_spots where id in (5, 6, 7, 23, 28, 29, 32, 39, 42, 50, 55, 57, 61, 64, 68, 81, 82, 94, 30, 93, 1392) order by id;
