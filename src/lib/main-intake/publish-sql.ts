// PUBLISH cutover SQL generator — exact target set · 단일 트랜잭션 · 규모 독립 (R1 §26~29, Production TASK §33~34)
//
//   · 대상은 "이번 run 에서 STAGE 된 실제 city_spots.id 집합" 뿐이다. city 전체·prefix·id 범위·category 로 UPDATE 하지 않는다.
//   · id 집합은 `WHERE id IN (...)` 문자열이 아니라 VALUES 기반 CTE(target set) 로 싣는다 — 4천이든 5만이든 같은 구조.
//   · 트랜잭션 안에서 DO 블록이 개수·교집합·keep 보호를 검증하고, 하나라도 어긋나면 RAISE 로 전체 ROLLBACK 된다.
//   · Supabase SQL Editor 에서 사람이 실행한다(운영 규칙). 스크립트 생성만 하며 여기서 실행하지 않는다.
//   · 되돌림(rollback) 스크립트도 같은 구조로 생성한다: new → false, hidden → true (delete 없음).

export interface PublishSqlInput {
  run_id: string;
  manifest_sha256: string;
  /** STAGE id mapping 의 실제 DB id (NEW) */
  new_ids: readonly number[];
  /** 최종 manifest 의 legacy hide 대상 실제 DB id */
  hide_ids: readonly number[];
  /** 반드시 true 로 남아야 하는 id (LEGACY_ONLY_VALID + Owner override) — hide 와 교집합이면 생성 거부 */
  keep_ids: readonly number[];
}

export interface PublishSqlResult { sql: string; rollback_sql: string; new_count: number; hide_count: number; keep_count: number; }

function assertIntIds(label: string, ids: readonly number[]): void {
  const seen = new Set<number>();
  for (const id of ids) {
    if (!Number.isInteger(id) || id <= 0) throw new Error(`${label}: invalid id ${String(id)}`);
    if (seen.has(id)) throw new Error(`${label}: duplicate id ${id}`);
    seen.add(id);
  }
}

/** VALUES (1),(2),… — 줄당 500개로 나눠 사람이 읽을 수 있게 */
function valuesList(ids: readonly number[]): string {
  const sorted = [...ids].sort((a, b) => a - b);
  const lines: string[] = [];
  for (let i = 0; i < sorted.length; i += 500) lines.push(sorted.slice(i, i + 500).map(n => `(${n})`).join(","));
  return lines.join(",\n");
}

export function buildPublishCutoverSql(input: PublishSqlInput): PublishSqlResult {
  assertIntIds("new_ids", input.new_ids); assertIntIds("hide_ids", input.hide_ids); assertIntIds("keep_ids", input.keep_ids);
  const newSet = new Set(input.new_ids), hideSet = new Set(input.hide_ids), keepSet = new Set(input.keep_ids);
  for (const id of hideSet) {
    if (newSet.has(id)) throw new Error(`id ${id} is in both new and hide sets`);
    if (keepSet.has(id)) throw new Error(`id ${id} is in both hide and keep sets (Owner override / LEGACY_ONLY_VALID must stay published)`);
  }
  for (const id of newSet) if (keepSet.has(id)) throw new Error(`id ${id} is in both new and keep sets`);
  if (!/^[0-9a-f]{8,64}$/.test(input.run_id) || !/^[0-9a-f]{64}$/.test(input.manifest_sha256)) throw new Error("run_id/manifest_sha256 must be hex");
  const header = (mode: string) => `-- five-city-core ${mode} · run_id=${input.run_id} · manifest_sha256=${input.manifest_sha256}
-- exact target sets only (no city-wide / range / category update). Run in Supabase SQL Editor as ONE transaction. No DELETE.
-- new=${input.new_ids.length} hide=${input.hide_ids.length} keep=${input.keep_ids.length}`;
  const sets = `
create temporary table publish_new_ids(id bigint primary key) on commit drop;
insert into publish_new_ids(id) values
${valuesList(input.new_ids)};
create temporary table publish_hide_ids(id bigint primary key) on commit drop;
insert into publish_hide_ids(id) values
${input.hide_ids.length ? valuesList(input.hide_ids) : "(-1)"};
delete from publish_hide_ids where id = -1;
create temporary table publish_keep_ids(id bigint primary key) on commit drop;
insert into publish_keep_ids(id) values
${input.keep_ids.length ? valuesList(input.keep_ids) : "(-1)"};
delete from publish_keep_ids where id = -1;

do $$
declare n_new int; n_hide int; n_keep int; n_missing int; n_x int;
begin
  select count(*) into n_new from publish_new_ids;
  select count(*) into n_hide from publish_hide_ids;
  select count(*) into n_keep from publish_keep_ids;
  if n_new <> ${input.new_ids.length} then raise exception 'new set count % <> ${input.new_ids.length}', n_new; end if;
  if n_hide <> ${input.hide_ids.length} then raise exception 'hide set count % <> ${input.hide_ids.length}', n_hide; end if;
  if n_keep <> ${input.keep_ids.length} then raise exception 'keep set count % <> ${input.keep_ids.length}', n_keep; end if;
  select count(*) into n_x from publish_new_ids n join publish_hide_ids h on h.id = n.id;
  if n_x <> 0 then raise exception 'new ∩ hide = %', n_x; end if;
  select count(*) into n_x from publish_keep_ids k join publish_hide_ids h on h.id = k.id;
  if n_x <> 0 then raise exception 'keep ∩ hide = %', n_x; end if;
  select count(*) into n_missing from publish_new_ids n left join public.city_spots c on c.id = n.id where c.id is null;
  if n_missing <> 0 then raise exception 'new ids missing in city_spots: %', n_missing; end if;
  select count(*) into n_missing from publish_hide_ids h left join public.city_spots c on c.id = h.id where c.id is null;
  if n_missing <> 0 then raise exception 'hide ids missing in city_spots: %', n_missing; end if;
end $$;
`;
  const sql = `${header("PUBLISH CUTOVER")}
begin;
${sets}
update public.city_spots c set is_published = true  from publish_new_ids  n where c.id = n.id;
update public.city_spots c set is_published = false from publish_hide_ids h where c.id = h.id;
update public.city_spots c set is_published = true  from publish_keep_ids k where c.id = k.id;

do $$
declare n_bad int;
begin
  select count(*) into n_bad from public.city_spots c join publish_new_ids n on n.id = c.id where c.is_published is distinct from true;
  if n_bad <> 0 then raise exception 'post-check: % new rows not published', n_bad; end if;
  select count(*) into n_bad from public.city_spots c join publish_hide_ids h on h.id = c.id where c.is_published is distinct from false;
  if n_bad <> 0 then raise exception 'post-check: % hide rows still published', n_bad; end if;
  select count(*) into n_bad from public.city_spots c join publish_keep_ids k on k.id = c.id where c.is_published is distinct from true;
  if n_bad <> 0 then raise exception 'post-check: % keep rows not published', n_bad; end if;
end $$;
commit;
`;
  const rollback_sql = `${header("PUBLISH ROLLBACK (no delete)")}
begin;
${sets}
update public.city_spots c set is_published = false from publish_new_ids  n where c.id = n.id;
update public.city_spots c set is_published = true  from publish_hide_ids h where c.id = h.id;
update public.city_spots c set is_published = true  from publish_keep_ids k where c.id = k.id;
commit;
`;
  return { sql, rollback_sql, new_count: input.new_ids.length, hide_count: input.hide_ids.length, keep_count: input.keep_ids.length };
}
