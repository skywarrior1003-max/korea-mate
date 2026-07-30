#!/usr/bin/env python3
"""
Publishability V2 — post VB EN SSR apply.
Exact same gate rules as run-busan-publishability-baseline-v1.py.
Reads updated enriched candidates, outputs to v2 files only.
V1 files are NOT touched.
"""
import json
import hashlib
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASELINE_V2 = "BUSAN_PUBLISHABILITY_V2_POST_VB_EN_SSR"
TASK_ID     = "TASK-VISITBUSAN-EN-SSR-APPLY-V1"

BUSAN_LAT_MIN, BUSAN_LAT_MAX = 34.88, 35.39
BUSAN_LNG_MIN, BUSAN_LNG_MAX = 128.74, 129.31
FRESHNESS_FLAGS = frozenset({"needs_hours", "needs_arrival_verification", "needs_map_name_ko"})

CORE_GATES = [
    "identity_gate", "name_ko_gate", "name_en_gate", "address_gate",
    "coordinate_gate", "branch_gate", "description_gate", "image_gate",
    "provenance_gate",
]

BASE       = Path(".")
EC_FILE    = BASE / "data/tourapi/enriched/busan/busan-enriched-candidates-v1.jsonl"
REPORT_DIR = BASE / "data/tourapi/reports/busan"
# V1 reference (read-only)
V1_SUMMARY = REPORT_DIR / "busan-publishability-baseline-v1.json"
# V2 outputs
V2_SUMMARY = REPORT_DIR / "busan-publishability-v2-post-vb-en-ssr.json"
V2_DETAILS = REPORT_DIR / "busan-publishability-v2-post-vb-en-ssr-details.jsonl"


def sha256_file(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def get_effective_flags(r: dict) -> frozenset:
    base = set(r.get("validation", {}).get("review_flags") or [])
    qa02 = r.get("qa02_corrections", {})
    eff  = set(base)
    if qa02.get("hours_applied") and qa02.get("hours_value"):
        eff.discard("needs_hours")
    if qa02.get("kto_en_linked"):
        eff.discard("needs_translation")
    return frozenset(eff)


def evaluate_gates(r: dict, eff_flags: frozenset) -> dict:
    val  = r.get("validation", {})
    vs   = val.get("validation_status", "")
    ss   = r.get("source_summary", {})
    ia   = r.get("image_assessment", {})
    aa   = r.get("arrival_assessment", {})
    pv   = r.get("proposed_values", {})
    prov = r.get("provenance", {})
    cat  = r.get("category", "")
    g    = {}

    # 1. identity_gate
    if vs == "source_data_missing":
        g["identity_gate"] = "PENDING_SOURCE"
        g["identity_reason"] = "source_data_missing"
    elif vs in ("multi_source_verified", "single_source", "multi_source_confirmed"):
        g["identity_gate"] = "PASS"
        g["identity_reason"] = vs
    else:
        g["identity_gate"] = "PENDING_REVIEW"
        g["identity_reason"] = f"unknown_validation_status:{vs}"

    # 2. name_ko_gate
    g["name_ko_gate"] = "PASS" if r.get("title_ko") else "FAIL"

    # 3. name_en_gate (reads review_flags directly)
    if "needs_translation" not in eff_flags:
        g["name_en_gate"] = "PASS"
    else:
        g["name_en_gate"] = "PENDING_SOURCE"
        g["name_en_reason"] = (
            "source_data_missing_no_english_name"
            if vs == "source_data_missing"
            else "no_english_name_from_collected_sources"
        )

    # 4. address_gate
    addr = pv.get("address")
    if addr and str(addr).strip():
        g["address_gate"] = "PASS"
    else:
        g["address_gate"] = "FAIL"
        g["address_reason"] = "address_absent"

    # 5. coordinate_gate
    if "needs_arrival" in eff_flags:
        g["coordinate_gate"] = "FAIL"
        g["coordinate_reason"] = "invalid_current_coordinates"
    elif aa.get("has_source_coords"):
        lat = aa.get("source_lat") or 0
        lng = aa.get("source_lng") or 0
        if (BUSAN_LAT_MIN <= lat <= BUSAN_LAT_MAX and
                BUSAN_LNG_MIN <= lng <= BUSAN_LNG_MAX):
            g["coordinate_gate"] = "PASS"
        else:
            g["coordinate_gate"] = "FAIL"
            g["coordinate_reason"] = "coordinates_out_of_busan_bounds"
    else:
        g["coordinate_gate"] = "PENDING_REVIEW"
        g["coordinate_reason"] = "no_source_coordinates"

    # 6. branch_gate (restaurant only)
    if cat == "restaurant":
        if "needs_restaurant_branch" in eff_flags:
            g["branch_gate"] = "FAIL"
            g["branch_reason"] = "restaurant_branch_unresolved"
        else:
            g["branch_gate"] = "PASS"
    else:
        g["branch_gate"] = "NOT_APPLICABLE"

    # 7. description_gate — IDENTICAL to V1: checks has_ko_description in source_summary
    if ss.get("has_ko_description"):
        g["description_gate"] = "PASS"
    else:
        g["description_gate"] = "PENDING_SOURCE"
        g["description_reason"] = (
            "source_data_missing_no_description"
            if vs == "source_data_missing"
            else "kto_description_not_collected_api_call_limit"
        )

    # 8. image_gate
    curated_count = ia.get("curated_count") or 0
    img_status    = ia.get("image_status", "")
    if curated_count > 0 or img_status in ("image_sufficient", "image_partial"):
        g["image_gate"] = "PASS"
        g["image_rights"] = ia.get("rights_status", "unknown")
    else:
        g["image_gate"] = "PENDING_SOURCE"
        g["image_reason"] = "no_curated_images_available"

    # 9. provenance_gate
    g["provenance_gate"] = "PASS" if prov.get("primary_source_ref") else "PENDING_REVIEW"

    return g


def determine_publishability(gates: dict, eff_flags: frozenset) -> tuple:
    fail_gates = []
    pr_gates   = []
    ps_gates   = []
    for gk in CORE_GATES:
        v = gates.get(gk, "PASS")
        if v == "NOT_APPLICABLE":
            continue
        if v == "FAIL":
            fail_gates.append(gk)
        elif v == "PENDING_REVIEW":
            pr_gates.append(gk)
        elif v == "PENDING_SOURCE":
            ps_gates.append(gk)

    if fail_gates or pr_gates:
        return "pending_review", fail_gates + pr_gates
    if ps_gates:
        return "pending_source", ps_gates

    # All core gates pass — check remaining flags
    remaining = set(eff_flags) - FRESHNESS_FLAGS
    if remaining:
        return "pending_review", [f"unresolved_flag:{f}" for f in sorted(remaining)]

    caveat_flags = sorted(eff_flags & FRESHNESS_FLAGS)
    if caveat_flags:
        return "publishable_with_caveat", caveat_flags

    return "publishable", []


def main():
    run_ts = datetime.now(timezone.utc).isoformat()
    print("=" * 60)
    print("Publishability V2 (post VB EN SSR apply)")
    print(f"run_ts: {run_ts}")
    print("=" * 60)

    v1_sha_before = sha256_file(V1_SUMMARY)
    print(f"V1 SHA (must not change): {v1_sha_before[:16]}")

    print("Loading enriched candidates …")
    ec_records = []
    with open(EC_FILE, encoding="utf-8-sig") as f:
        for line in f:
            line = line.strip()
            if line:
                ec_records.append(json.loads(line))
    print(f"  {len(ec_records)} records")

    print("Evaluating gates …")
    distribution = defaultdict(int)
    details      = []

    for r in ec_records:
        cid      = r["candidate_id"]
        cat      = r.get("category", "unknown")
        eff      = get_effective_flags(r)
        gates    = evaluate_gates(r, eff)
        pub, blocks = determine_publishability(gates, eff)
        distribution[pub] += 1
        details.append({
            "candidate_id": cid,
            "category":     cat,
            "publishability": pub,
            "block_reasons": blocks,
            "gate_version": BASELINE_V2,
            "effective_flags": sorted(eff),
        })

    dist_dict = dict(distribution)

    # Load V1 for delta
    with open(V1_SUMMARY, encoding="utf-8") as f:
        v1_data = json.load(f)
    v1_dist = v1_data.get("publishability_distribution", {})
    if not v1_dist:
        # Try alternative key
        v1_dist = {k: v1_data.get(k, 0) for k in ["publishable", "publishable_with_caveat", "pending_source", "pending_review"]}

    all_keys = set(list(v1_dist.keys()) + list(dist_dict.keys()))
    delta = {k: dist_dict.get(k, 0) - v1_dist.get(k, 0) for k in all_keys}

    print(f"\nV1: {v1_dist}")
    print(f"V2: {dist_dict}")
    print(f"Δ:  {delta}")

    # Write V2 summary
    v2_summary = {
        "report_id":   "busan-publishability-v2-post-vb-en-ssr",
        "gate_version": BASELINE_V2,
        "based_on":    "BUSAN_PUBLISHABILITY_BASELINE_V1 (identical gate rules)",
        "task":        TASK_ID,
        "run_ts":      run_ts,
        "total_candidates": len(ec_records),
        "publishability_distribution": dist_dict,
        "v1_distribution": v1_dist,
        "delta_vs_v1": delta,
        "gate_change_note": (
            "description_gate still uses has_ko_description (unchanged). "
            "VB EN candidates still blocked by description_gate despite EN description applied. "
            "name_en_gate improved for 177 records but other gates remain blocking."
        ),
    }
    V2_SUMMARY.write_text(json.dumps(v2_summary, ensure_ascii=False, indent=2), encoding="utf-8")

    # Write V2 details
    with open(V2_DETAILS, "w", encoding="utf-8") as f:
        for d in details:
            f.write(json.dumps(d, ensure_ascii=False) + "\n")

    v1_sha_after = sha256_file(V1_SUMMARY)
    v1_preserved = v1_sha_before == v1_sha_after
    print(f"\nV1 preserved: {v1_preserved}")
    if not v1_preserved:
        print("  ERROR: V1 file was modified!")

    print(f"V2 summary: {V2_SUMMARY}")
    print(f"V2 details: {V2_DETAILS}")
    print("=" * 60)
    return dist_dict, delta


if __name__ == "__main__":
    main()
