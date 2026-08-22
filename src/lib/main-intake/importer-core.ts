// five-city core importer — 순수 계획 계산. DB 를 모른다. (TASK-MAIN-FIVE-CITY-CORE-INTEGRATION-PREP-AND-DRY-RUN-V1)
//
// 입력  intake package(active/sources/images) + crosswalk + Main 스냅샷(비사용자 컬럼)
// 출력  ImportPlan — UPDATE(기존 id 보존) · INSERT(NEW) · SKIP(CONFIRMED_TWIN/REVIEW_REQUIRED/EXCLUDED)
//        · VISIBILITY_UPDATE(승인된 legacy → is_published=false) · NO_WRITE(그 외 legacy)
//
// Gate A/B/C (TASK-FIVE-CITY-CORE-PREPROD-GATE-V1)
//   · CONFIRMED_TWIN 은 SKIP_TWIN — 단 crosswalk decision_basis 가 ARTIFACT_SOURCE_LINEAGE 일 때만 받는다(근거 없는 skip 은 오류).
//     REVIEW_REQUIRED(artifact identity gate 잔여)는 SKIP_REVIEW_REQUIRED — 삭제·병합이 아니라 보류
//   · ARTIFACT TRUST RULE (TASK-FIVE-CITY-CORE-ARTIFACT-TRUST-AND-IDENTITY-CORRECTION-V1): 이 모듈은 identity 를
//     판단하지 않는다. crosswalk 가 준 decision 을 그대로 번역하고, 근거(decision_basis) 가 없는 skip 만 거부한다
//   · (city,name) 충돌은 오류가 아니라 constraint_blockers 로 보고한다 — 표시명을 바꾸지 않는다(migration 057 로 해소)
//   · 모든 UPDATE/INSERT 는 is_published=true (서비스 승인). EXCLUDED_FROM_SERVICE_REVIEW·DUPLICATE_REVIEW 로 분류된
//     legacy 행만 is_published=false 로 숨긴다(보존). LEGACY_ONLY_VALID 는 건드리지 않는다(migration backfill 로 true 유지)
//   · semantic category 가 (category, subcategory) 에서 복원되지 않는 행은 오류로 센다
//
// 지키는 것
//   · MATCH_REPLACE 는 숫자 city_spots.id 기준 UPDATE — (city,name) upsert 를 쓰지 않는다
//   · NEW 만 INSERT. 새 id 는 DB sequence 를 추측하지 않고 placeholder("NEW:<canonical_id>")
//   · AMBIGUOUS(쌍둥이 포함)·non-ACTIVE 는 자동 제외
//   · DELETE/RETIRE 없음 — 계획에 그런 action 이 존재하지 않는다
//   · 필드마다 null policy 를 적용하고 런타임/수동/참조 필드는 쓰지 않는다
//   · 같은 입력 → 같은 계획 (정렬 고정, 시각 없음)

import { decideField, isWritePolicy, type FieldDecision, type NullPolicy } from "./null-policy.ts";
import { isMainCategory, isSemanticRecoverable } from "./category-adapter.ts";
import { CANONICAL_SOURCE_TYPE, canonicalExternalId } from "./identity.ts";

export interface MainSnapshotRow {
  main_city_spot_id: number;
  city: string;
  category: string;
  canonical_title: string;
  legacy_source_type?: string | null;
  legacy_external_id?: string | null;
  legacy_image_url?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  official_url?: string | null;
  sources?: Array<{ source_type: string; source_key: string }>;
  images?: Array<{ image_url: string }>;
}

export interface CrosswalkRow {
  city: string;
  canonical_id: string;
  service_status: string;
  main_city_spot_id: number | null;
  decision: "MATCH_REPLACE" | "NEW" | "CONFIRMED_TWIN" | "REVIEW_REQUIRED" | "EXCLUDED";
  decision_basis?: string;
  tier: string;
  twin_of?: string | null;
}

/** SKIP_TWIN 이 허용되는 유일한 근거 — artifact 가 스스로 기록한 source lineage */
export const TWIN_SKIP_ALLOWED_BASIS = ["ARTIFACT_SOURCE_LINEAGE", "ARTIFACT_IDENTITY_RESOLUTION"] as const;
export const FORBIDDEN_BASIS = ["NAME_HEURISTIC", "ADDRESS_HEURISTIC", "COORDINATE_HEURISTIC"] as const;

export interface IntakeRow {
  canonical_id: string;
  city: string;
  service_status: string;
  category: string;
  subcategory: string | null;
  name: string | null;
  name_l10n: Record<string, string> | null;
  description: string | null;
  desc_l10n: Record<string, string> | null;
  why_it_matters: string | null;
  why_l10n: Record<string, string> | null;
  address: string | null;
  district: string | null;
  lat: number | null;
  lng: number | null;
  official_url: string | null;
  map_url: string | null;
  naver_map_url: string | null;
  opening_hours: { open: string; close: string } | null;
  tags: string[] | null;
  image_url: string | null;
  source_category?: string | null;
  semantic_category?: string | null;
  /** 058-WRITER-CORRECTION: intake 가 매핑에서 기록한 Final 소유 필드 / deferred 필드 (Main 추측 금지) */
  owned_fields?: string[];
  deferred_fields?: string[];
}

/** Main 714 분류(five-city-core-main-classification-v1.jsonl) — 숨길 legacy 를 고르는 유일한 입력 */
export interface MainClassificationRow { main_city_spot_id: number; city: string; class: string; }
/** 숨기는 분류 — 이 둘만. LEGACY_ONLY_VALID·PRESERVE_UNTOUCHED 는 노출 유지(오너 결정 전까지) */
export const HIDE_CLASSES = ["EXCLUDED_FROM_SERVICE_REVIEW", "DUPLICATE_REVIEW"] as const;
/** Owner 가 유지 확정한 legacy — published 유지 · 플래너 후보 포함 · id 보존 */
export const OWNER_OVERRIDE_CLASS = "OWNER_OVERRIDE_KEEP_PUBLISHED";

export interface SourceRow { canonical_id: string; source_type: string; source_key: string; candidate_id: string | null; source_url: string | null; source_tier: string | null; is_primary: boolean; as_of: string | null; }
export interface ImageRow { canonical_id: string; image_url: string; rights_status: string; attribution_required: boolean; rights_note: string | null; display_eligible: boolean; is_primary: boolean; sort_order: number; as_of: string | null; }

/** UPDATE 로 쓸 수 있는 컬럼 (FIELD_OWNERSHIP 의 SOURCE 만) */
export const SOURCE_FIELDS = [
  "name", "name_l10n", "description", "desc_l10n", "why_it_matters", "why_l10n",
  "category", "subcategory", "district", "address", "lat", "lng",
  "official_url", "map_url", "naver_map_url", "opening_hours", "tags", "image_url",
] as const;

export interface UpdateAction {
  action: "UPDATE";
  main_city_spot_id: number;
  canonical_id: string;
  city: string;
  fields: FieldDecision[];
  writes: Record<string, unknown>;        // 실제 UPDATE 에 실리는 값만
  old_summary: { name: string; category: string; had_image: boolean };
  new_summary: { name: string | null; category: string; has_image: boolean };
  sources_upsert: number;
  images_upsert: number;
}
export interface InsertAction {
  action: "INSERT";
  placeholder_id: string;                 // "NEW:<canonical_id>" — DB sequence 를 추측하지 않는다
  canonical_id: string;
  city: string;
  row: Record<string, unknown>;
  sources_upsert: number;
  images_upsert: number;
}
export interface SkipAction { action: "SKIP"; canonical_id: string; city: string; reason: string; twin_of?: string | null; }
export interface NoWriteAction { action: "NO_WRITE"; main_city_spot_id: number; city: string; reason: string; }
export interface VisibilityAction { action: "VISIBILITY_UPDATE"; main_city_spot_id: number; city: string; main_class: string; writes: { is_published: false }; reason: string; }

export interface ImportPlan {
  updates: UpdateAction[];
  inserts: InsertAction[];
  skips: SkipAction[];
  no_write: NoWriteAction[];
  visibility_updates: VisibilityAction[];
  counts: {
    active_input: number;
    match_replace: number;
    new: number;
    /** artifact 근거(ARTIFACT_SOURCE_LINEAGE)로만 skip 된 같은 source entity */
    confirmed_twin_skipped: number;
    /** artifact identity gate 잔여 — 보류 */
    review_required_skipped: number;
    excluded_skipped: number;
    /** = active_input − confirmed_twin_skipped (review_required 포함) */
    active_distinct: number;
    /** = match_replace + new */
    writeable_active: number;
    existing_id_preserved: number;
    lossy_category: number;
    heuristic_twin_auto_merge: 0;
    evidenceless_skip: number;
    delete: 0;
  };
  /** 현재 schema(uq_city_spots_city_name) 기준 INSERT/UPDATE 가 막히는 (city,name) 충돌 — migration 057 전까지 blocker */
  constraint_blockers: { city_name_collisions: Array<{ city: string; name: string; members: string[] }> };
  visibility: {
    publish_updates: number;          // MATCH_REPLACE → is_published=true
    publish_inserts: number;          // NEW → is_published=true
    hide_legacy: number;              // EXCLUDED_FROM_SERVICE_REVIEW + DUPLICATE_REVIEW → false
    preserved_visible_legacy: number; // LEGACY_ONLY_VALID — 노출 유지(오너 결정 대기)
    owner_override_published: number; // OWNER_OVERRIDE_KEEP_PUBLISHED — Owner 확정 유지
    untouched_other: number;
  };
  per_city: Record<string, { before: number; updates: number; inserts: number; projected_after: number; visible_after: number; hidden_after: number }>;
  null_policy_counts: Record<NullPolicy, number>;
  errors: string[];
}

function sortBy<T>(arr: T[], key: (t: T) => string): T[] {
  return [...arr].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
}

export function planImport(input: {
  intake: IntakeRow[];
  sources: SourceRow[];
  images: ImageRow[];
  crosswalk: CrosswalkRow[];
  main: MainSnapshotRow[];
  mainClassification?: MainClassificationRow[];
  expectedActiveTotal: number;
}): ImportPlan {
  const errors: string[] = [];
  const mainById = new Map(input.main.map(r => [r.main_city_spot_id, r]));
  const intakeById = new Map(input.intake.map(r => [r.canonical_id, r]));
  const srcBy = new Map<string, SourceRow[]>();
  for (const s of input.sources) srcBy.set(s.canonical_id, [...(srcBy.get(s.canonical_id) ?? []), s]);
  const imgBy = new Map<string, ImageRow[]>();
  for (const i of input.images) imgBy.set(i.canonical_id, [...(imgBy.get(i.canonical_id) ?? []), i]);

  const active = input.crosswalk.filter(c => c.service_status === "ACTIVE");
  if (active.length !== input.expectedActiveTotal) errors.push(`active crosswalk ${active.length} != expected ${input.expectedActiveTotal}`);
  if (input.intake.length !== input.expectedActiveTotal) errors.push(`intake rows ${input.intake.length} != expected ${input.expectedActiveTotal}`);

  const updates: UpdateAction[] = [];
  const inserts: InsertAction[] = [];
  const skips: SkipAction[] = [];
  const noWrite: NoWriteAction[] = [];
  const policyCounts: Record<NullPolicy, number> = { REPLACE_WITH_VALUE: 0, INTENTIONALLY_CLEAR: 0, FINAL_ABSENT_CLEAR: 0, NO_SOURCE_VALUE: 0, PRESERVE_RUNTIME_FIELD: 0, MANUAL_REVIEW: 0, VISIBILITY_GATE: 0 };
  const visibilityUpdates: VisibilityAction[] = [];
  const classById = new Map((input.mainClassification ?? []).map(r => [r.main_city_spot_id, r.class]));
  let lossyCategory = 0;
  let evidencelessSkip = 0;
  const targeted = new Set<number>();

  for (const c of sortBy(input.crosswalk, x => `${x.city}|${x.canonical_id}`)) {
    if (c.service_status !== "ACTIVE") {
      skips.push({ action: "SKIP", canonical_id: c.canonical_id, city: c.city, reason: `service_status=${c.service_status}` });
      continue;
    }
    const row = intakeById.get(c.canonical_id);
    if (c.decision_basis && (FORBIDDEN_BASIS as readonly string[]).includes(c.decision_basis)) {
      errors.push(`forbidden heuristic decision basis ${c.decision_basis} for ${c.canonical_id}`); continue;
    }
    if (c.decision === "CONFIRMED_TWIN") {
      if (!c.decision_basis || !(TWIN_SKIP_ALLOWED_BASIS as readonly string[]).includes(c.decision_basis) || !c.twin_of) {
        evidencelessSkip += 1;
        errors.push(`evidenceless twin skip for ${c.canonical_id} (basis=${c.decision_basis ?? "none"})`);
        continue;
      }
      skips.push({ action: "SKIP", canonical_id: c.canonical_id, city: c.city, reason: `SKIP_TWIN:${c.tier}`, twin_of: c.twin_of ?? null });
      continue;
    }
    if (c.decision === "REVIEW_REQUIRED") {
      skips.push({ action: "SKIP", canonical_id: c.canonical_id, city: c.city, reason: `SKIP_REVIEW_REQUIRED:${c.tier}`, twin_of: c.twin_of ?? null });
      continue;
    }
    if (!row) { errors.push(`intake row missing for ${c.canonical_id}`); continue; }
    if (!isMainCategory(row.category)) { errors.push(`non-main category ${row.category} for ${c.canonical_id}`); continue; }
    if (row.semantic_category && !isSemanticRecoverable(row.category, row.subcategory, row.semantic_category)) {
      lossyCategory += 1;
      errors.push(`lossy category for ${c.canonical_id}: ${row.semantic_category} not recoverable from (${row.category}, ${row.subcategory})`);
    }
    const srcs = sortBy(srcBy.get(c.canonical_id) ?? [], s => `${s.source_type}|${s.source_key}`);
    const imgs = sortBy(imgBy.get(c.canonical_id) ?? [], i => `${i.is_primary ? 0 : 1}|${i.image_url}`);
    if (c.decision === "MATCH_REPLACE") {
      if (c.main_city_spot_id === null) { errors.push(`MATCH_REPLACE without main id: ${c.canonical_id}`); continue; }
      const old = mainById.get(c.main_city_spot_id);
      if (!old) { errors.push(`main row ${c.main_city_spot_id} missing for ${c.canonical_id}`); continue; }
      if (old.city !== c.city) { errors.push(`city mismatch main#${c.main_city_spot_id} ${old.city} vs ${c.city}`); continue; }
      if (targeted.has(c.main_city_spot_id)) { errors.push(`main#${c.main_city_spot_id} targeted twice`); continue; }
      targeted.add(c.main_city_spot_id);
      const fields: FieldDecision[] = [];
      const writes: Record<string, unknown> = {};
      for (const f of SOURCE_FIELDS) {
        const oldValue = f === "image_url" ? old.legacy_image_url : f === "name" ? old.canonical_title : (old as unknown as Record<string, unknown>)[f];
        const d = decideField(f, (row as unknown as Record<string, unknown>)[f], oldValue, { finalOwned: (row.owned_fields ?? []).includes(f), deferred: (row.deferred_fields ?? []).includes(f) });
        fields.push(d);
        policyCounts[d.policy] += 1;
        if (isWritePolicy(d.policy)) writes[f] = d.value;
      }
      {
        const v = decideField("is_published", true, undefined);   // Gate B: 서비스 승인 행은 공개
        fields.push(v); policyCounts[v.policy] += 1; writes.is_published = true;
      }
      updates.push({
        action: "UPDATE", main_city_spot_id: c.main_city_spot_id, canonical_id: c.canonical_id, city: c.city,
        fields, writes,
        old_summary: { name: old.canonical_title, category: old.category, had_image: Boolean(old.legacy_image_url) },
        new_summary: { name: row.name, category: row.category, has_image: Boolean(row.image_url) },
        sources_upsert: srcs.length, images_upsert: imgs.length,
      });
    } else if (c.decision === "NEW") {
      const r: Record<string, unknown> = { city: row.city };
      for (const f of SOURCE_FIELDS) {
        const v = (row as unknown as Record<string, unknown>)[f];
        if (v !== undefined && v !== null && !(typeof v === "string" && v.trim() === "")) r[f] = v;
      }
      if (!r.name) { errors.push(`NEW without name: ${c.canonical_id}`); continue; }
      r.is_published = true;                                        // Gate B: 계획상 최종 상태(STAGE 는 false 로 INSERT, PUBLISH 가 true 로 전환)
      policyCounts.VISIBILITY_GATE += 1;
      // R1 §18: DB-level 멱등 identity — (source_type, external_id) UNIQUE (012). package 버전과 무관한 stable key.
      r.source_type = CANONICAL_SOURCE_TYPE;
      r.external_id = canonicalExternalId(row.city, c.canonical_id);
      inserts.push({ action: "INSERT", placeholder_id: `NEW:${c.canonical_id}`, canonical_id: c.canonical_id, city: c.city, row: r, sources_upsert: srcs.length, images_upsert: imgs.length });
    } else {
      skips.push({ action: "SKIP", canonical_id: c.canonical_id, city: c.city, reason: `decision=${c.decision}` });
    }
  }
  let preservedVisibleLegacy = 0;
  let ownerOverridePublished = 0;
  let untouchedOther = 0;
  for (const m of sortBy(input.main, r => String(r.main_city_spot_id).padStart(8, "0"))) {
    if (targeted.has(m.main_city_spot_id)) continue;
    const cls = classById.get(m.main_city_spot_id) ?? "UNCLASSIFIED";
    if ((HIDE_CLASSES as readonly string[]).includes(cls)) {
      visibilityUpdates.push({ action: "VISIBILITY_UPDATE", main_city_spot_id: m.main_city_spot_id, city: m.city, main_class: cls, writes: { is_published: false },
        reason: `${cls} — preserved, hidden from discovery (not deleted; direct references still resolve)` });
    } else {
      if (cls === "LEGACY_ONLY_VALID") preservedVisibleLegacy += 1;
      else if (cls === OWNER_OVERRIDE_CLASS) ownerOverridePublished += 1;
      else untouchedOther += 1;
      noWrite.push({ action: "NO_WRITE", main_city_spot_id: m.main_city_spot_id, city: m.city,
        reason: cls === OWNER_OVERRIDE_CLASS ? `${cls} — Owner 확정 유지: id 보존 · published 유지 · 플래너 후보 포함`
          : `${cls} — untouched, not deleted, stays published (migration 056 backfill)` });
    }
  }

  const per_city: ImportPlan["per_city"] = {};
  const cities = new Set([...input.main.map(r => r.city), ...active.map(c => c.city)]);
  for (const city of [...cities].sort()) {
    const before = input.main.filter(r => r.city === city).length;
    const u = updates.filter(x => x.city === city).length;
    const i = inserts.filter(x => x.city === city).length;
    const hidden = visibilityUpdates.filter(v => v.city === city).length;
    per_city[city] = { before, updates: u, inserts: i, projected_after: before + i, visible_after: before + i - hidden, hidden_after: hidden };
  }
  // (source_type, external_id) 는 INSERT 집합 안에서 유일해야 한다(재실행 멱등성의 전제)
  {
    const seen = new Set<string>();
    for (const i of inserts) {
      const k = `${String(i.row.source_type)}|${String(i.row.external_id)}`;
      if (seen.has(k)) errors.push(`duplicate identity ${k} (${i.canonical_id})`);
      seen.add(k);
    }
  }
  const twinSkipped = skips.filter(s => s.reason.startsWith("SKIP_TWIN")).length;
  const reviewRequired = skips.filter(s => s.reason.startsWith("SKIP_REVIEW_REQUIRED")).length;
  // (city,name) 충돌 — 표시명은 바꾸지 않는다. 현재 schema 에서는 INSERT/UPDATE 가 막히므로 blocker 로 보고한다.
  const finalNames = new Map<string, string[]>();
  const updatedIds = new Set(updates.map(u => u.main_city_spot_id));
  for (const m of input.main) if (!updatedIds.has(m.main_city_spot_id)) { const k = `${m.city}\u0000${m.canonical_title}`; finalNames.set(k, [...(finalNames.get(k) ?? []), `main#${m.main_city_spot_id}`]); }
  for (const u of updates) { const k = `${u.city}\u0000${u.new_summary.name ?? ""}`; finalNames.set(k, [...(finalNames.get(k) ?? []), `main#${u.main_city_spot_id}(${u.canonical_id})`]); }
  for (const i of inserts) { const k = `${i.city}\u0000${String(i.row.name)}`; finalNames.set(k, [...(finalNames.get(k) ?? []), i.canonical_id]); }
  const collisions = [...finalNames.entries()].filter(([, v]) => v.length > 1).map(([k, v]) => { const [city, name] = k.split("\u0000"); return { city: city!, name: name!, members: v.sort() }; }).sort((a, b) => (a.city + a.name < b.city + b.name ? -1 : 1));
  return {
    updates, inserts, skips, no_write: noWrite, visibility_updates: visibilityUpdates,
    counts: {
      active_input: active.length,
      match_replace: updates.length,
      new: inserts.length,
      confirmed_twin_skipped: twinSkipped,
      review_required_skipped: reviewRequired,
      excluded_skipped: skips.filter(s => s.reason.startsWith("service_status")).length,
      active_distinct: active.length - twinSkipped,
      writeable_active: updates.length + inserts.length,
      existing_id_preserved: targeted.size,
      lossy_category: lossyCategory,
      heuristic_twin_auto_merge: 0,
      evidenceless_skip: evidencelessSkip,
      delete: 0,
    },
    constraint_blockers: { city_name_collisions: collisions },
    visibility: {
      publish_updates: updates.length, publish_inserts: inserts.length, hide_legacy: visibilityUpdates.length,
      preserved_visible_legacy: preservedVisibleLegacy, owner_override_published: ownerOverridePublished, untouched_other: untouchedOther,
    },
    per_city, null_policy_counts: policyCounts, errors,
  };
}

/** 변경 manifest 한 줄짜리 요약 (사용자 데이터 없음) */
export function changeManifestRows(plan: ImportPlan): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];
  for (const u of plan.updates) rows.push({
    action: "UPDATE", main_city_spot_id: u.main_city_spot_id, canonical_id: u.canonical_id, city: u.city,
    fields_changed: Object.keys(u.writes).sort(), old: u.old_summary, new: u.new_summary,
    null_policy: Object.fromEntries(u.fields.map(f => [f.field, f.policy])),
    sources_upsert: u.sources_upsert, images_upsert: u.images_upsert,
  });
  for (const i of plan.inserts) rows.push({ action: "INSERT", placeholder_id: i.placeholder_id, canonical_id: i.canonical_id, city: i.city, name: i.row.name, category: i.row.category, has_image: Boolean(i.row.image_url), sources_upsert: i.sources_upsert, images_upsert: i.images_upsert });
  for (const s of plan.skips) rows.push({ action: "SKIP", canonical_id: s.canonical_id, city: s.city, reason: s.reason, twin_of: s.twin_of ?? null });
  for (const v of plan.visibility_updates) rows.push({ action: "VISIBILITY_UPDATE", main_city_spot_id: v.main_city_spot_id, city: v.city, main_class: v.main_class, fields_changed: ["is_published"], new: { is_published: false }, reason: v.reason });
  for (const n of plan.no_write) rows.push({ action: "NO_WRITE", main_city_spot_id: n.main_city_spot_id, city: n.city, reason: n.reason });
  return rows;
}
