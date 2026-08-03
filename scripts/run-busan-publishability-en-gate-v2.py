#!/usr/bin/env python3
"""
TASK-BUSAN-PUBLISHABILITY-LANGUAGE-GATE-V2
Language-aware English publishability gate (BUSAN_PUBLISHABILITY_EN_V2).
description_en_gate replaces description_gate (which used has_ko_description).
Enriched candidates are NOT modified.
All prior baseline files are preserved.
"""

import hashlib
import json
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

GATE_VERSION = "BUSAN_PUBLISHABILITY_EN_V2"
TASK_ID      = "TASK-BUSAN-PUBLISHABILITY-LANGUAGE-GATE-V2"

BUSAN_LAT_MIN, BUSAN_LAT_MAX = 34.88, 35.39
BUSAN_LNG_MIN, BUSAN_LNG_MAX = 128.74, 129.31
FRESHNESS_FLAGS = frozenset({"needs_hours", "needs_arrival_verification", "needs_map_name_ko"})

# Gate order: description_gate replaced by description_en_gate
CORE_GATES_EN = [
    "identity_gate", "name_ko_gate", "name_en_gate", "address_gate",
    "coordinate_gate", "branch_gate", "description_en_gate", "image_gate",
    "provenance_gate",
]

BASE        = Path(".")
EC_FILE     = BASE / "data/tourapi/enriched/busan/busan-enriched-candidates-v1.jsonl"
REPORT_DIR  = BASE / "data/tourapi/reports/busan"

# Prior baseline files (read-only)
V1_SUMMARY  = REPORT_DIR / "busan-publishability-baseline-v1.json"
V1_DETAILS  = REPORT_DIR / "busan-publishability-baseline-v1-details.jsonl"
V2_SUMMARY  = REPORT_DIR / "busan-publishability-v2-post-vb-en-ssr.json"
V2_DETAILS  = REPORT_DIR / "busan-publishability-v2-post-vb-en-ssr-details.jsonl"

# New EN_V2 outputs
ENV2_SUMMARY  = REPORT_DIR / "busan-publishability-en-v2.json"
ENV2_DETAILS  = REPORT_DIR / "busan-publishability-en-v2-details.jsonl"
ENV2_DIFF     = REPORT_DIR / "busan-publishability-en-v2-vs-baseline.json"


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


def evaluate_en_gates(r: dict, eff_flags: frozenset) -> dict:
    val  = r.get("validation", {})
    vs   = val.get("validation_status", "")
    ss   = r.get("source_summary", {})
    ia   = r.get("image_assessment", {})
    aa   = r.get("arrival_assessment", {})
    pv   = r.get("proposed_values", {})
    prov = r.get("provenance", {})
    cat  = r.get("category", "")
    g    = {}

    # 1. identity_gate (unchanged from V1)
    if vs == "source_data_missing":
        g["identity_gate"] = "PENDING_SOURCE"
        g["identity_reason"] = "source_data_missing"
    elif vs in ("multi_source_verified", "single_source", "multi_source_confirmed"):
        g["identity_gate"] = "PASS"
        g["identity_reason"] = vs
    else:
        g["identity_gate"] = "PENDING_REVIEW"
        g["identity_reason"] = f"unknown_validation_status:{vs}"

    # 2. name_ko_gate (unchanged)
    g["name_ko_gate"] = "PASS" if r.get("title_ko") else "FAIL"

    # 3. name_en_gate (unchanged — reads eff_flags)
    if "needs_translation" not in eff_flags:
        g["name_en_gate"] = "PASS"
    else:
        g["name_en_gate"] = "PENDING_SOURCE"
        g["name_en_reason"] = (
            "source_data_missing_no_english_name"
            if vs == "source_data_missing"
            else "no_english_name_from_collected_sources"
        )

    # 4. address_gate (unchanged)
    addr = pv.get("address")
    if addr and str(addr).strip():
        g["address_gate"] = "PASS"
    else:
        g["address_gate"] = "FAIL"
        g["address_reason"] = "address_absent"

    # 5. coordinate_gate (unchanged)
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

    # 6. branch_gate (unchanged)
    if cat == "restaurant":
        if "needs_restaurant_branch" in eff_flags:
            g["branch_gate"] = "FAIL"
            g["branch_reason"] = "restaurant_branch_unresolved"
        else:
            g["branch_gate"] = "PASS"
    else:
        g["branch_gate"] = "NOT_APPLICABLE"

    # 7. description_en_gate — KEY CHANGE FROM V1
    desc_en = pv.get("description_en") or ""
    has_ko_desc = ss.get("has_ko_description", False)
    if desc_en:  # non-empty = verified useful (set only for EN_USEFUL ≥80 chars or official API)
        g["description_en_gate"] = "PASS"
        g["description_en_source"] = "proposed_values.description_en"
    else:
        g["description_en_gate"] = "PENDING_SOURCE"
        g["description_en_reason"] = (
            "source_data_missing_no_en_description"
            if vs == "source_data_missing"
            else "no_usable_english_description"
        )
    # source_support: informational only, does NOT affect gate outcome
    g["source_support_has_ko_description"] = has_ko_desc
    if has_ko_desc and not desc_en:
        g["description_en_note"] = "ko_description_available_but_not_substitute_for_en"

    # 8. image_gate (unchanged)
    curated_count = ia.get("curated_count") or 0
    img_status    = ia.get("image_status", "")
    if curated_count > 0 or img_status in ("image_sufficient", "image_partial"):
        g["image_gate"] = "PASS"
        g["image_rights"] = ia.get("rights_status", "unknown")
    else:
        g["image_gate"] = "PENDING_SOURCE"
        g["image_reason"] = "no_curated_images_available"

    # 9. provenance_gate (unchanged)
    g["provenance_gate"] = "PASS" if prov.get("primary_source_ref") else "PENDING_REVIEW"

    return g


def determine_publishability_en(gates: dict, eff_flags: frozenset) -> tuple:
    fail_gates = []
    pr_gates   = []
    ps_gates   = []
    for gk in CORE_GATES_EN:
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

    remaining = set(eff_flags) - FRESHNESS_FLAGS
    if remaining:
        return "pending_review", [f"unresolved_flag:{f}" for f in sorted(remaining)]

    caveat_flags = sorted(eff_flags & FRESHNESS_FLAGS)
    if caveat_flags:
        return "publishable_with_caveat", caveat_flags

    return "publishable", []


def main():
    run_ts = datetime.now(timezone.utc).isoformat()
    print("=" * 65)
    print("TASK-BUSAN-PUBLISHABILITY-LANGUAGE-GATE-V2")
    print(f"gate_version: {GATE_VERSION}")
    print(f"run_ts: {run_ts}")
    print("=" * 65)

    import subprocess
    branch  = subprocess.check_output(["git", "branch", "--show-current"], text=True).strip()
    head    = subprocess.check_output(["git", "log", "--oneline", "-1"], text=True).strip()
    head_sha = head.split()[0]
    print(f"branch: {branch}  HEAD: {head_sha}\n")

    # SHA of protected baseline files (must not change)
    protected = {
        "V1_summary":  V1_SUMMARY,
        "V1_details":  V1_DETAILS,
        "V2_summary":  V2_SUMMARY,
        "EC_file":     EC_FILE,
    }
    shas_before = {k: sha256_file(p) for k, p in protected.items()}
    print("[protected SHAs]")
    for k, s in shas_before.items():
        print(f"  {k}: {s[:16]}")

    # Load V1 per-record status for diff
    print("\n[load] V1 baseline details …")
    v1_record_status: dict[str, str] = {}
    with open(V1_DETAILS, encoding="utf-8") as f:
        for line in f:
            r = json.loads(line)
            v1_record_status[r["candidate_id"]] = r.get("publishability", r.get("status", ""))
    v1_dist = Counter(v1_record_status.values())
    print(f"  V1: {dict(v1_dist)}")

    # Load enriched candidates
    print("[load] Enriched candidates …")
    candidates: list[dict] = []
    with open(EC_FILE, encoding="utf-8-sig") as f:
        for line in f:
            line = line.strip()
            if line:
                candidates.append(json.loads(line))
    print(f"  {len(candidates)} records")

    if len(candidates) != 1642:
        print(f"ABORT: expected 1642, got {len(candidates)}")
        sys.exit(1)

    # Load SSR parsed results for cross-check
    print("[load] SSR parsed results for cross-check …")
    ssr_status: dict[str, str] = {}
    with open(REPORT_DIR / "visitbusan-en-ssr-full-v1-parsed.jsonl", encoding="utf-8-sig") as f:
        for line in f:
            r = json.loads(line)
            ssr_status[r["candidate_id"]] = r["result_status"]

    # Evaluate EN gates
    print("[eval] Applying BUSAN_PUBLISHABILITY_EN_V2 gates …")
    distribution     = Counter()
    cat_distribution = defaultdict(Counter)
    results          = []
    desc_en_gate_pass = 0
    has_ko_only_downgraded = 0

    # Track cross-check: VB SSR records by result_status
    vb_by_status: dict[str, Counter] = defaultdict(Counter)

    for r in candidates:
        cid    = r["candidate_id"]
        cat    = r.get("category", "unknown")
        eff    = get_effective_flags(r)
        gates  = evaluate_en_gates(r, eff)
        pub, blocks = determine_publishability_en(gates, eff)

        distribution[pub] += 1
        cat_distribution[cat][pub] += 1

        if gates.get("description_en_gate") == "PASS":
            desc_en_gate_pass += 1

        v1_pub = v1_record_status.get(cid, "unknown")
        changed = (pub != v1_pub)

        # Track downgrade due to KO-only description
        if (v1_pub in ("publishable", "publishable_with_caveat") and
                pub in ("pending_source", "pending_review") and
                gates.get("source_support_has_ko_description") and
                not (r.get("proposed_values", {}).get("description_en") or "")):
            has_ko_only_downgraded += 1

        # SSR cross-check
        if cid in ssr_status:
            vb_by_status[ssr_status[cid]][pub] += 1

        results.append({
            "candidate_id": cid,
            "category": cat,
            "publishability_en_v2": pub,
            "block_reasons": blocks,
            "gate_version": GATE_VERSION,
            "effective_flags": sorted(eff),
            "description_en_gate": gates.get("description_en_gate"),
            "source_support_has_ko_description": gates.get("source_support_has_ko_description"),
            "v1_publishability": v1_pub,
            "status_changed": changed,
            "gates": {k: v for k, v in gates.items()
                      if k.endswith("_gate") or k.endswith("_reason") or k.endswith("_note")},
        })

    env2_dist = dict(distribution)
    delta = {
        k: env2_dist.get(k, 0) - v1_dist.get(k, 0)
        for k in set(list(v1_dist.keys()) + list(env2_dist.keys()))
    }

    print(f"\n  V1:    {dict(v1_dist)}")
    print(f"  EN_V2: {env2_dist}")
    print(f"  Δ:     {delta}")
    print(f"\n  description_en_gate PASS: {desc_en_gate_pass}")
    print(f"  KO-only downgraded:       {has_ko_only_downgraded}")

    print("\n[cross-check] VB SSR 183건 by EN_V2 status:")
    for ssr_st, pub_dist in sorted(vb_by_status.items()):
        print(f"  SSR {ssr_st:30s}: {dict(pub_dist)}")

    # Validation checks
    checks = {}

    # 1. EN_USEFUL 144건 all PASS description_en_gate (gate-level, not overall publishability)
    vb_useful_pass = vb_by_status.get("EN_USEFUL", Counter())
    vb_useful_total = sum(vb_useful_pass.values())
    checks["ssr_useful_count_correct"] = vb_useful_total == 144
    # description_en_gate PASS for ALL EN_USEFUL (checked at gate level)
    en_useful_all_desc_gate_pass = all(
        r["description_en_gate"] == "PASS"
        for r in results
        if r["candidate_id"] in {cid for cid, st in {
            **{r2["candidate_id"]: r2 for r2 in results}
        }.items()}
        and ssr_status.get(r["candidate_id"]) == "EN_USEFUL"
    )
    checks["ssr_useful_all_desc_en_gate_pass"] = en_useful_all_desc_gate_pass
    # identity_gate blocks VB candidates (source_data_missing) — expected, separate from this task
    checks["ssr_useful_identity_gate_blocks_explained"] = (
        "VB candidates have source_data_missing validation_status (KTO API limit). "
        "identity_gate = PENDING_SOURCE for all VB candidates. "
        "Unblocked by description_en_gate; overall upgrade awaits KTO API calls."
    )

    # 2. TITLE_ONLY & WEAK not publishable
    vb_to_pub = vb_by_status.get("EN_TITLE_ONLY", Counter()).get("publishable", 0)
    vb_dw_pub = vb_by_status.get("EN_DESCRIPTION_WEAK", Counter()).get("publishable", 0)
    checks["title_only_not_publishable"] = vb_to_pub == 0
    checks["desc_weak_not_publishable"]  = vb_dw_pub == 0

    # 3. No publishable with empty description_en
    publishable_no_en = sum(
        1 for r in candidates
        if determine_publishability_en(
            evaluate_en_gates(r, get_effective_flags(r)),
            get_effective_flags(r)
        )[0] == "publishable"
        and not (r.get("proposed_values", {}).get("description_en") or "")
    )
    checks["no_publishable_without_en_desc"] = publishable_no_en == 0

    # 4. Protected files unchanged
    shas_after = {k: sha256_file(p) for k, p in protected.items()}
    checks["protected_files_unchanged"] = all(shas_before[k] == shas_after[k] for k in shas_before)

    # 5. Candidate count
    checks["candidate_count_1642"] = len(candidates) == 1642

    # 6. No data modification
    checks["data_modified"] = False
    checks["external_requests"] = 0
    checks["push"] = False

    gate_checks = {k: v for k, v in checks.items()
                   if k not in ("data_modified", "external_requests", "push",
                                "ssr_useful_identity_gate_blocks_explained")}
    all_pass = all(v is True for k, v in gate_checks.items()
                   if isinstance(v, bool))
    verdict = "PASS" if all_pass else "FAIL"

    # Status change breakdown
    changes = [r for r in results if r["status_changed"]]
    change_detail = Counter((r["v1_publishability"], r["publishability_en_v2"]) for r in changes)
    print(f"\n[changes] {len(changes)} records changed status:")
    for (f, t), n in sorted(change_detail.items()):
        print(f"  {f} → {t}: {n}")

    # Write EN_V2 details
    print(f"\n[write] {ENV2_DETAILS}")
    with open(ENV2_DETAILS, "w", encoding="utf-8") as f:
        for r in results:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    # Write EN_V2 summary
    summary = {
        "report_id":    "busan-publishability-en-v2",
        "gate_version": GATE_VERSION,
        "task":         TASK_ID,
        "run_ts":       run_ts,
        "branch":       branch,
        "head":         head_sha,
        "total_candidates": len(candidates),
        "publishability_distribution": env2_dist,
        "v1_baseline_distribution": dict(v1_dist),
        "delta_vs_v1_baseline": delta,
        "description_en_gate_pass": desc_en_gate_pass,
        "ko_only_downgraded": has_ko_only_downgraded,
        "status_changed_count": len(changes),
        "status_change_breakdown": {f"{f}→{t}": n for (f, t), n in sorted(change_detail.items())},
        "vb_ssr_cross_check": {
            st: dict(d) for st, d in sorted(vb_by_status.items())
        },
        "validation_checks": checks,
        "verdict": verdict,
        "gate_change_note": (
            "description_gate (V1: has_ko_description) replaced by description_en_gate. "
            "has_ko_description recorded as source_support only. "
            "EN description from official sources (AttractionService EN) and VB SSR EN_USEFUL "
            "are treated equally as 'verified useful'. "
            "EN description absent = PENDING_SOURCE regardless of KO description presence."
        ),
    }
    ENV2_SUMMARY.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    # Write diff report (per-record changes)
    diff_report = {
        "report_id": "busan-publishability-en-v2-vs-baseline",
        "run_ts": run_ts,
        "v1_distribution": dict(v1_dist),
        "env2_distribution": env2_dist,
        "delta": delta,
        "changed_records": [
            {
                "candidate_id": r["candidate_id"],
                "category": r["category"],
                "v1": r["v1_publishability"],
                "en_v2": r["publishability_en_v2"],
                "description_en_gate": r["description_en_gate"],
                "has_ko_description": r["source_support_has_ko_description"],
            }
            for r in results if r["status_changed"]
        ],
    }
    ENV2_DIFF.write_text(json.dumps(diff_report, ensure_ascii=False, indent=2), encoding="utf-8")

    # Final summary
    print("\n" + "=" * 65)
    print(f"VERDICT: {verdict}")
    print(f"V1:      {dict(v1_dist)}")
    print(f"EN_V2:   {env2_dist}")
    print(f"Delta:   {delta}")
    print(f"description_en_gate PASS: {desc_en_gate_pass}")
    print(f"KO-only downgraded: {has_ko_only_downgraded}")
    print(f"Status changes: {len(changes)}")
    print(f"Candidate count: {len(candidates)}")
    print(f"Protected files: {'unchanged' if checks['protected_files_unchanged'] else 'MODIFIED!'}")
    print(f"publishable without EN desc: {publishable_no_en}")
    print(f"Validation checks:")
    for k, v in checks.items():
        if isinstance(v, bool):
            icon = "✓" if v is True else "✗"
        elif isinstance(v, int):
            icon = "✓" if v == 0 else "✗"
        elif isinstance(v, str) and k.endswith("_explained"):
            icon = "ℹ"
        else:
            icon = "-"
        print(f"  {icon} {k}: {v}")
    print("=" * 65)


if __name__ == "__main__":
    main()
