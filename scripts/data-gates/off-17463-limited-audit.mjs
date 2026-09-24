#!/usr/bin/env node
// OFF-17463 유형 제한 감사 (§9) — 같은 유형만 기계 검사, 수정 없음.
//
// 대상:
//  A. 전주 Final catalog(all_candidates) — kto-raw 를 조인해 content type 판정
//  B. Main 반입분 five-city-core-v3 active + images (git show origin/master:…
//     로 읽는다 — Main 파일은 수정하지 않는다)
//
// 출력: data/quality-gates/off-17463/five-city-limited-audit-v1.json
// 분류: confirmed_contamination / review_candidate / confirmed_clean(집계만)
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { checkCandidate, GOVERNMENT_PHONES, distMeters } from "./entity-coherence-gate.mjs";

const catalog = JSON.parse(readFileSync("data/jeonju-raw-collection-v1/jeonju-final-service-catalog-v1.json", "utf8"));
const ktoRaw = readFileSync("data/jeonju-raw-collection-v1/jeonju-kto-raw-v1.jsonl", "utf8")
  .split("\n").filter(Boolean).map(l => JSON.parse(l));
const ktoType = new Map(ktoRaw.map(r => [String(r.contentid ?? r.kto_cid ?? ""), String(r.cat_large ?? r.contenttypeid_label ?? r.contenttypeid ?? "")]));

const findings = { generated_at: new Date().toISOString(), scope: "OFF-17463 동형(제한) — 전수 재검증 아님",
  jeonju_catalog: { review_candidates: [], confirmed_contamination: [], stats: {} },
  main_intake_v3: { review_candidates: [], stats: {} } };

// ── A. 전주 catalog ──
let clean = 0;
for (const c of catalog.all_candidates) {
  const joined = { ...c, kto_type: c.kto_type ?? ktoType.get(String(c.kto_cid ?? "")) ?? c.contenttypeid };
  const r = checkCandidate(joined);
  const active = c.final_status === "ACTIVE_SERVICE";
  if (!r.quarantine && r.verdicts.length === 0) { clean++; continue; }
  const entry = { id: c.candidate_id, city: "jeonju", active,
    fields: r.fieldExclusions, verdicts: r.verdicts,
    risk: active && r.quarantine ? "HIGH(ACTIVE 인데 quarantine 사유)" : active ? "MEDIUM" : "LOW(비활성)",
    recommendation: r.quarantine ? "사람 검토 queue — 해소 전 재승격·export 금지" : "필드 배제 유지" };
  // 이번 사건과 동일한 '확정 오염'은 OFF-17463 뿐(교정 완료) — 나머지는 후보.
  findings.jeonju_catalog.review_candidates.push(entry);
}
findings.jeonju_catalog.stats = {
  total: catalog.all_candidates.length, confirmed_clean: clean,
  review_candidates: findings.jeonju_catalog.review_candidates.length,
  ambiguous_active: catalog.all_candidates.filter(c => c.match_type === "AMBIGUOUS" && c.final_status === "ACTIVE_SERVICE").length,
  government_phone_rows: catalog.all_candidates.filter(c => GOVERNMENT_PHONES.has(String(c.phone ?? ""))).length,
};

// ── B. Main 반입분(five-city-core-v3) — 읽기 전용 ──
const gitShow = p => execFileSync("git", ["show", `origin/master:${p}`], { maxBuffer: 1 << 26 }).toString();
const active = gitShow("data/main-intake/five-city-core-v3/five-city-core-active-v1.jsonl")
  .split("\n").filter(Boolean).map(l => JSON.parse(l));
const images = gitShow("data/main-intake/five-city-core-v3/five-city-core-images-v1.jsonl")
  .split("\n").filter(Boolean).map(l => JSON.parse(l));
const imgByCanonical = new Map();
for (const im of images) {
  if (!imgByCanonical.has(im.canonical_id)) imgByCanonical.set(im.canonical_id, []);
  imgByCanonical.get(im.canonical_id).push(im);
}
for (const row of active) {
  const issues = [];
  const prov = row.provenance ?? {};
  if (prov.match_type === "AMBIGUOUS") issues.push("provenance.match_type=AMBIGUOUS 인데 반입됨");
  const ims = imgByCanonical.get(row.canonical_id) ?? [];
  for (const im of ims) {
    if (im.display_eligible === false && row.image_url && String(row.image_url).includes(String(im.image_url ?? "\u0000").split("/").pop() ?? "\u0000"))
      issues.push("display_eligible:false 이미지가 반입 image_url 로 사용");
  }
  if (issues.length) {
    findings.main_intake_v3.review_candidates.push({
      id: row.canonical_id, city: row.city, name: row.name, fields: issues,
      risk: row.canonical_id === "OFF-17463" ? "RESOLVED(776 교정 완료)" : "MEDIUM",
      recommendation: "재반입·재수집 전 identity 재검토" });
  }
}
findings.main_intake_v3.stats = {
  total: active.length,
  ambiguous_imported: active.filter(r => (r.provenance ?? {}).match_type === "AMBIGUOUS").length,
  review_candidates: findings.main_intake_v3.review_candidates.length,
};

writeFileSync("data/quality-gates/off-17463/five-city-limited-audit-v1.json",
  JSON.stringify(findings, null, 1) + "\n");
console.log("[전주 catalog]", JSON.stringify(findings.jeonju_catalog.stats));
console.log("[main-intake v3]", JSON.stringify(findings.main_intake_v3.stats));
console.log("audit 파일 기록 완료");
