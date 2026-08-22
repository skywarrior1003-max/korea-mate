#!/usr/bin/env python3
"""
TASK-GYEONGJU-FOOD-105-FIVE-CITY-REINTEGRATION-PREP-V1 — reconciliation artifacts (READ-ONLY inputs, plan only, Production write 0)

Inputs
  · v1 (R2 historical plan)  data/main-intake/five-city-core-v1/five-city-core-crosswalk-v1.jsonl + main classification
  · v2 (new plan)            data/main-intake/five-city-core-v2/five-city-core-crosswalk-v1.jsonl + main classification
  · R2 before-Phase-A immutable snapshot  git show 3622e26:…/pre-stage-match-snapshot-v1.r2-before-phaseA-2026-08-22T115804Z.jsonl
  · VisitGyeongju package (pinned via five_city_core_lib)
Outputs (v2 package dir)
  A gyeongju-food-105-main-intake-mapping-v1.jsonl   (105)
  B gyeongju-food-retire-from-service-v1.jsonl        (94/95)
  C five-city-r2-phase-a-reconcile-v1.jsonl           (462 R2 MATCH rows)
  + five-city-r2-restore-plan-v1.jsonl (retire rows: snapshot-only restore fields) · five-city-publish-hide-union-v1.json · five-city-r3-stage-plan-v1.json
"""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(__file__))
from five_city_core_lib import (  # noqa: E402
    GYEONGJU_FOOD_RETIRED_CLASS, HWASU_BREWERY, PACKAGE_DIR, REPO, VISITGYEONGJU_SOURCE_TYPE, load_input, write_json, write_jsonl,
)

V1 = os.path.join(REPO, "data", "main-intake", "five-city-core-v1")
V2 = os.path.join(REPO, "data", "main-intake", PACKAGE_DIR)
R2_OPS_COMMIT = "3622e26"
R2_SNAPSHOT_PATH = "data/main-intake/five-city-core-v1/production-runs/f8abf0cf5f75e55f/pre-stage-match-snapshot-v1.r2-before-phaseA-2026-08-22T115804Z.jsonl"
R2_SNAPSHOT_SHA256 = "10240f4f404c95fae71dc20b6599b14f83bcf3812173bd155d388ec76d6c6207"
MAIN_OWNED_NEVER_RESTORE = {"id", "source_type", "external_id", "is_published", "created_at", "updated_at", "rating", "review_count", "view_count", "like_count"}


def jsonl(path: str) -> list[dict]:
    return [json.loads(l) for l in open(path, encoding="utf-8") if l.strip()]


def r2_snapshot() -> list[dict]:
    out = subprocess.run(["git", "show", f"{R2_OPS_COMMIT}:{R2_SNAPSHOT_PATH}"], capture_output=True, cwd=REPO)
    if out.returncode != 0:
        raise SystemExit("R2 snapshot not readable from ops commit")
    raw = out.stdout
    if hashlib.sha256(raw).hexdigest() != R2_SNAPSHOT_SHA256:
        raise SystemExit("R2 snapshot sha256 mismatch — evidence integrity")
    rows = [json.loads(l) for l in raw.decode("utf-8").splitlines() if l.strip()]
    if len(rows) != 462:
        raise SystemExit(f"R2 snapshot rows {len(rows)} != 462")
    return rows


def main() -> None:
    xw1 = jsonl(os.path.join(V1, "five-city-core-crosswalk-v1.jsonl")); xw2 = jsonl(os.path.join(V2, "five-city-core-crosswalk-v1.jsonl"))
    mc1 = jsonl(os.path.join(V1, "five-city-core-main-classification-v1.jsonl")); mc2 = jsonl(os.path.join(V2, "five-city-core-main-classification-v1.jsonl"))
    snap = {r["city_spot_id"]: r for r in r2_snapshot()}
    vg, _ = load_input("gyeongju_food_vg")
    old_match = {d["main_city_spot_id"]: d for d in xw1 if d["service_status"] == "ACTIVE" and d["decision"] == "MATCH_REPLACE"}
    if len(old_match) != 462 or set(old_match) != set(snap):
        raise SystemExit("R2 MATCH set != snapshot ids")
    new_by_main = {d["main_city_spot_id"]: d for d in xw2 if d["service_status"] == "ACTIVE" and d["decision"] == "MATCH_REPLACE" and d["main_city_spot_id"] is not None}
    retired = {d["main_city_spot_id"]: d for d in xw2 if d["service_status"] == "RETIRED"}
    review = [d for d in xw2 if d["decision"] == "REVIEW_REQUIRED"]

    # ── C. R2 Phase A reconcile ───────────────────────────────────────────────
    reconcile = []; restore_plan = []
    for mid in sorted(old_match):
        old = old_match[mid]; s = snap[mid]
        if mid in retired:
            fields = [f for f in s["fields_to_write"] if f not in MAIN_OWNED_NEVER_RESTORE]
            before = {f: s["before"].get(f) for f in fields}
            action = "RESTORE_PRE_R2_THEN_PUBLISH_HIDE"
            restore_plan.append({"main_city_spot_id": mid, "old_canonical_id": old["canonical_id"], "restore_fields": fields, "before_values": before,
                                 "source": {"ops_commit": R2_OPS_COMMIT, "snapshot_sha256": R2_SNAPSHOT_SHA256, "captured_at": s["captured_at"]},
                                 "never_touch": sorted(MAIN_OWNED_NEVER_RESTORE), "publish_hide_candidate": True, "hard_delete": False})
            new_cid = None
        elif mid in new_by_main:
            new_cid = new_by_main[mid]["canonical_id"]
            action = "REPLACE_WITH_NEW_FINAL" if new_cid != old["canonical_id"] else "KEEP_CURRENT_VALID"
        elif any(r["main_city_spot_id"] == mid for r in review) or any(d.get("main_city_spot_id") is None and d["decision"] == "REVIEW_REQUIRED" for d in review):
            new_cid = None; action = "REVIEW_REQUIRED"
        else:
            new_cid = None; action = "NO_LONGER_ACTIVE_FINAL"
        reconcile.append({"main_city_spot_id": mid, "city": old["city"], "previous_plan_canonical_id": old["canonical_id"], "new_final_canonical_id": new_cid, "action": action,
                          "r2_fields_written": s["fields_to_write"], "r2_snapshot_captured_at": s["captured_at"]})
    c_counts = Counter(r["action"] for r in reconcile)

    # ── A. VG 105 mapping ─────────────────────────────────────────────────────
    xw2_by_cid = {d["canonical_id"]: d for d in xw2}
    mapping = []
    for r in sorted(vg, key=lambda x: x["replacement_candidate_id"]):
        cid = r["replacement_candidate_id"]; d = xw2_by_cid[cid]
        action = {"MATCH_REPLACE": "PRESERVE_ID_AND_REPLACE", "NEW": "NEW_INSERT", "REVIEW_REQUIRED": "REVIEW_REQUIRED"}[d["decision"]]
        coord = r.get("lat") is not None and r.get("lng") is not None
        mapping.append({"vg_id": r["vg_id"], "canonical_id": cid, "title_ko": r["title_ko"], "title_en": r["title_en"], "area": r["area"], "action": action,
                        "existing_numeric_id": d["main_city_spot_id"], "old_gj08_identity": r.get("existing_canonical_id"), "decision_basis": d["decision_basis"],
                        "official_locale_ready": {"ko": bool(r.get("title_ko") and r.get("desc_ko")), "en": bool(r.get("title_en") and r.get("desc_en")), "ja": bool(r.get("title_ja") and r.get("desc_ja")), "zh": bool(r.get("title_zh") and r.get("desc_zh"))},
                        "coordinate_ready": coord, "coordinate_source": "package(lat/lng)" if coord else None, "nav_ready": coord, "geocoding_required": not coord,
                        "source_bridge": {"source_type": VISITGYEONGJU_SOURCE_TYPE, "source_key": r["vg_id"], "ready": True}, "image_ready": False, "image_note": "package 에 공식 이미지 없음 — fallback/recrawl 0",
                        "review_reason": HWASU_BREWERY["evidence"] if r.get("match_to_existing") == "REVIEW_EXISTING" else None})
    a_counts = Counter(m["action"] for m in mapping)

    # ── B. retire ─────────────────────────────────────────────────────────────
    mc2_by = {m["main_city_spot_id"]: m for m in mc2}
    retire_rows = [{"main_city_spot_id": mid, "old_canonical_id": d["canonical_id"], "reason": "old GJ08 Food superseded by VisitGyeongju Food 105 (Owner decision; no 102+105 merge, no supplement)",
                    "new_active_final_counterpart": None, "current_published": True, "publish_hide_candidate": True, "hard_delete": False,
                    "main_class": mc2_by[mid]["class"], "r2_phase_a_applied": mid in snap, "r3_action": "RESTORE_PRE_R2_THEN_PUBLISH_HIDE"}
                   for mid, d in sorted(retired.items())]

    # ── publish-hide union ────────────────────────────────────────────────────
    old_hide = {m["main_city_spot_id"] for m in mc1 if m["class"] in ("EXCLUDED_FROM_SERVICE_REVIEW", "DUPLICATE_REVIEW")}
    gj_retire = {r["main_city_spot_id"] for r in retire_rows}
    new_hide = {m["main_city_spot_id"] for m in mc2 if m["class"] in ("EXCLUDED_FROM_SERVICE_REVIEW", "DUPLICATE_REVIEW", GYEONGJU_FOOD_RETIRED_CLASS)}
    union = {"old_legacy_hide_count": len(old_hide), "gyeongju_food_retire_count": len(gj_retire), "overlap": len(old_hide & gj_retire),
             "final_publish_hide_unique_count": len(old_hide | gj_retire), "v2_main_classification_hide_count": len(new_hide),
             "consistent": new_hide == (old_hide | gj_retire), "hard_delete": 0}

    # ── R3 stage plan (exact phases) ──────────────────────────────────────────
    new_rows = [d for d in xw2 if d["service_status"] == "ACTIVE" and d["decision"] == "NEW"]
    per_city_new = Counter(d["city"] for d in new_rows)
    plan = {"task": "TASK-FIVE-CITY-CORE-PRODUCTION-STAGE-V1-R3 (plan only — not executed)", "package": PACKAGE_DIR,
            "production_baseline": {"city_spots": 714, "published_true": 714, "published_false": 0, "canonical_namespace": 0, "sources": 302, "images": 169,
                                    "r2_phase_a_applied": True, "r2_match_completed": 462, "r2_new_inserted": 0},
            "phases": {
                "A1_keep_current_valid": {"rows": c_counts["KEEP_CURRENT_VALID"], "op": "idempotent PATCH with new plan writes (same Final values)"},
                "A2_preserve_id_replace_with_visitgyeongju": {"rows": c_counts["REPLACE_WITH_NEW_FINAL"], "op": "PATCH existing numeric id with VisitGyeongju official values"},
                "A3_restore_pre_r2_retire_rows": {"rows": c_counts["RESTORE_PRE_R2_THEN_PUBLISH_HIDE"], "op": "PATCH only R2-changed approved fields back to snapshot before-values; is_published untouched",
                                                  "artifact": "five-city-r2-restore-plan-v1.jsonl", "writer_note": "importer needs a Phase A3 restore step (reads restore plan) before R3 execution"},
                "B_new_insert": {"rows": len(new_rows), "per_city": dict(per_city_new), "op": "lookup-before-insert, key-set subgroups, is_published=false"},
                "C_mapping": {"rows": len(new_rows)}, "D_sources": "new Final source plan (v2)", "E_images": "new Final image plan (v2)",
                "VERIFY": "DB totals · NEW false · user counts pre==post · relation integrity"},
            "expected_after_stage": {"physical_city_spots": 714 + len(new_rows), "published_true": 714, "published_false": len(new_rows), "published_null": 0,
                                     "per_city_physical": {c: (412 if c == "busan" else 302 if c == "gyeongju" else 0) + per_city_new.get(c, 0) for c in ("busan", "gyeongju", "seoul", "jeju", "jeonju")}},
            "publish_not_executed": True, "hard_delete": 0, "publish_hide_union": union}

    write_jsonl(os.path.join(V2, "gyeongju-food-105-main-intake-mapping-v1.jsonl"), mapping)
    write_jsonl(os.path.join(V2, "gyeongju-food-retire-from-service-v1.jsonl"), retire_rows)
    write_jsonl(os.path.join(V2, "five-city-r2-phase-a-reconcile-v1.jsonl"), reconcile)
    write_jsonl(os.path.join(V2, "five-city-r2-restore-plan-v1.jsonl"), sorted(restore_plan, key=lambda r: r["main_city_spot_id"]))
    write_json(os.path.join(V2, "five-city-publish-hide-union-v1.json"), union)
    write_json(os.path.join(V2, "five-city-r3-stage-plan-v1.json"), plan)
    print(json.dumps({"mapping": dict(a_counts), "retire": len(retire_rows), "reconcile": dict(c_counts), "restore_rows": len(restore_plan),
                      "restore_fields_hist": dict(Counter(len(r["restore_fields"]) for r in restore_plan)), "publish_hide_union": union,
                      "new_rows": len(new_rows), "per_city_new": dict(per_city_new), "coord_ready": sum(1 for m in mapping if m["coordinate_ready"]),
                      "geocoding_required": sum(1 for m in mapping if m["geocoding_required"])}, ensure_ascii=False))


if __name__ == "__main__":
    main()
