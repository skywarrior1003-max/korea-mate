// STAGE 계획 — 규모 독립 chunking · 멱등 · resumable · receipt (R1 §24~25) — 순수 함수, DB 를 모른다
//
// STAGE 계약 (Production TASK §21)
//   · MATCH_REPLACE : 기존 numeric id 로 PATCH(source-owned 필드만). is_published 는 건드리지 않는다(056 backfill true 유지).
//   · NEW           : INSERT … is_published=false. 멱등 키 = (source_type, external_id) → PostgREST `on_conflict=source_type,external_id`
//                     + `Prefer: resolution=merge-duplicates` 로 재실행이 안전하다. 실제 id 는 `Prefer: return=representation` 으로 받는다.
//   · legacy hide 233 은 STAGE 에서 하지 않는다(PUBLISH cutover).
//   · chunk 크기는 API payload 기준 고정값 — 4천이든 5만이든 같은 루프.
//   · 모든 chunk 는 결정적 경계(정렬 고정)와 sha256 을 가져 partial retry/resume 이 가능하다.

import { createHash } from "node:crypto";
import type { ImportPlan } from "./importer-core.ts";
import { chunk } from "../city-spots-paging.ts";

export const STAGE_INSERT_CHUNK = 200;
export const STAGE_UPDATE_CHUNK = 100;

export interface StageChunk {
  index: number;
  kind: "UPDATE" | "INSERT";
  /** UPDATE: main_city_spot_id 목록 · INSERT: external_id 목록 (멱등 키) */
  keys: Array<number | string>;
  sha256: string;
}

export interface StagePlan {
  run_id: string;
  manifest_sha256: string;
  counts: { updates: number; inserts: number; update_chunks: number; insert_chunks: number; new_staged_unpublished: number; legacy_hidden_in_stage: 0 };
  chunks: StageChunk[];
  /** 멱등 키 → canonical_id (resume 시 DB 의 external_id 로 실제 id 를 되찾는 데 쓴다) */
  insert_keys: Array<{ external_id: string; canonical_id: string; city: string }>;
  plan_sha256: string;
}

function sha(s: string): string { return createHash("sha256").update(s).digest("hex"); }

export function buildStagePlan(plan: ImportPlan, runId: string, manifestSha: string, sizes: { insert?: number; update?: number } = {}): StagePlan {
  const insertSize = sizes.insert ?? STAGE_INSERT_CHUNK;
  const updateSize = sizes.update ?? STAGE_UPDATE_CHUNK;
  const updates = [...plan.updates].sort((a, b) => a.main_city_spot_id - b.main_city_spot_id);
  const inserts = [...plan.inserts].sort((a, b) => (a.canonical_id < b.canonical_id ? -1 : 1));
  const insertKeys = inserts.map(i => {
    const ext = i.row.external_id;
    if (typeof ext !== "string" || !ext) throw new Error(`INSERT ${i.canonical_id} has no external_id — idempotent identity missing`);
    if (i.row.is_published !== false && i.row.is_published !== true) throw new Error(`INSERT ${i.canonical_id} has no is_published value`);
    return { external_id: ext, canonical_id: i.canonical_id, city: i.city };
  });
  const dupExt = insertKeys.map(k => k.external_id).filter((e, i, a) => a.indexOf(e) !== i);
  if (dupExt.length) throw new Error(`duplicate external_id in INSERT set: ${[...new Set(dupExt)].slice(0, 5).join(",")}`);
  const chunks: StageChunk[] = [];
  let index = 0;
  for (const c of chunk(updates.map(u => u.main_city_spot_id), updateSize)) chunks.push({ index: index++, kind: "UPDATE", keys: c, sha256: sha(`UPDATE|${c.join(",")}`) });
  for (const c of chunk(insertKeys.map(k => k.external_id), insertSize)) chunks.push({ index: index++, kind: "INSERT", keys: c, sha256: sha(`INSERT|${c.join(",")}`) });
  const body = {
    run_id: runId, manifest_sha256: manifestSha,
    counts: { updates: updates.length, inserts: inserts.length, update_chunks: chunks.filter(c => c.kind === "UPDATE").length, insert_chunks: chunks.filter(c => c.kind === "INSERT").length, new_staged_unpublished: inserts.length, legacy_hidden_in_stage: 0 as const },
    chunks, insert_keys: insertKeys,
  };
  return { ...body, plan_sha256: sha(JSON.stringify(body)) };
}

/** resume: 이미 DB 에 존재하는 external_id 집합이 주어지면 아직 남은 INSERT chunk 만 돌려준다 */
export function remainingInsertChunks(plan: StagePlan, existingExternalIds: ReadonlySet<string>): StageChunk[] {
  return plan.chunks
    .filter(c => c.kind === "INSERT")
    .map(c => ({ ...c, keys: c.keys.filter(k => !existingExternalIds.has(String(k))) }))
    .filter(c => c.keys.length > 0);
}

export interface StageReceipt {
  run_id: string; manifest_sha256: string; plan_sha256: string; release_sha: string | null;
  db_pre_count: number; db_post_count: number;
  update_count: number; insert_count: number; new_unpublished_count: number; mapping_rows: number;
  sources_writes: number; images_writes: number; error_count: number; id_mapping_sha256: string;
  legacy_newly_hidden: 0;
}

/** receipt invariant: post = pre + inserts · 오류 0 · mapping = inserts · stage 에서 hide 0 */
export function validateStageReceipt(r: StageReceipt, plan: StagePlan): string[] {
  const bad: string[] = [];
  if (r.db_post_count !== r.db_pre_count + r.insert_count) bad.push(`db_post ${r.db_post_count} != pre ${r.db_pre_count} + inserts ${r.insert_count}`);
  if (r.insert_count !== plan.counts.inserts) bad.push(`insert_count ${r.insert_count} != plan ${plan.counts.inserts}`);
  if (r.update_count !== plan.counts.updates) bad.push(`update_count ${r.update_count} != plan ${plan.counts.updates}`);
  if (r.mapping_rows !== r.insert_count) bad.push(`mapping_rows ${r.mapping_rows} != insert_count ${r.insert_count}`);
  if (r.new_unpublished_count !== r.insert_count) bad.push(`new_unpublished ${r.new_unpublished_count} != insert_count ${r.insert_count}`);
  if (r.error_count !== 0) bad.push(`error_count ${r.error_count}`);
  if (r.legacy_newly_hidden !== 0) bad.push("stage must not hide legacy");
  if (r.plan_sha256 !== plan.plan_sha256) bad.push("plan sha mismatch");
  return bad;
}
