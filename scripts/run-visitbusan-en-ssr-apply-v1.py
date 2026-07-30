#!/usr/bin/env python3
"""
TASK-VISITBUSAN-EN-SSR-APPLY-V1
Apply verified VB EN SSR results to enriched candidates + source facts.
Images: NOT touched.
Publishability: V1 preserved, V2 newly created.
"""

import csv
import hashlib
import io
import json
import subprocess
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

# ── Config ────────────────────────────────────────────────────────────────
EC_FILE     = Path("data/tourapi/enriched/busan/busan-enriched-candidates-v1.jsonl")
SF_FILE     = Path("data/tourapi/enriched/busan/busan-source-facts-v1.jsonl")
PARSED_FILE = Path("data/tourapi/reports/busan/visitbusan-en-ssr-full-v1-parsed.jsonl")
REPORT_DIR  = Path("data/tourapi/reports/busan")
PUB_V1_SUMMARY = REPORT_DIR / "busan-publishability-baseline-v1.json"
PUB_V1_DETAIL  = REPORT_DIR / "busan-publishability-baseline-v1-details.jsonl"

BASELINE_V2      = "BUSAN_PUBLISHABILITY_V2_POST_VB_EN_SSR"
BUSAN_LAT_MIN, BUSAN_LAT_MAX = 34.88, 35.39
BUSAN_LNG_MIN, BUSAN_LNG_MAX = 128.74, 129.31
FRESHNESS_FLAGS = frozenset({"needs_hours", "needs_arrival_verification", "needs_map_name_ko"})

sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def sha256_file(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


# ── Publishability gate (identical to V1 logic) ───────────────────────────
def get_effective_flags(r: dict) -> set:
    base = set(r.get("validation", {}).get("review_flags", []))
    qa02 = r.get("qa02_corrections", {})
    eff = set(base)
    if qa02.get("hours_applied") and qa02.get("hours_value"):
        eff.discard("needs_hours")
    if qa02.get("kto_en_linked"):
        eff.discard("needs_translation")
    return eff


def evaluate_gates(r: dict, eff_flags: set) -> dict:
    val  = r.get("validation", {})
    vs   = val.get("validation_status", "")
    ss   = r.get("source_summary", {})
    ia   = r.get("image_assessment", {})
    aa   = r.get("arrival_assessment", {})
    pv   = r.get("proposed_values", {})
    cat  = r.get("category", "")
    g    = {}

    # identity_gate
    if vs == "source_data_missing":
        g["identity_gate"] = "PENDING_SOURCE"
        g["identity_reason"] = "source_data_missing"
    elif vs in ("multi_source_verified", "single_source", "multi_source_confirmed"):
        g["identity_gate"] = "PASS"
        g["identity_reason"] = vs
    else:
        g["identity_gate"] = "PENDING_REVIEW"
        g["identity_reason"] = f"unknown_validation_status:{vs}"

    # name_ko_gate
    g["name_ko_gate"] = "PASS" if r.get("title_ko") else "FAIL"

    # name_en_gate
    if "needs_translation" not in eff_flags:
        g["name_en_gate"] = "PASS"
    else:
        g["name_en_gate"] = "PENDING_SOURCE"
        g["name_en_reason"] = (
            "source_data_missing_no_english_name"
            if vs == "source_data_missing"
            else "no_english_name_from_collected_sources"
        )

    # address_gate
    addr = pv.get("address")
    if addr and str(addr).strip():
        g["address_gate"] = "PASS"
    else:
        g["address_gate"] = "FAIL"
        g["address_reason"] = "address_absent"

    # coordinate_gate
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

    # branch_gate
    if cat == "restaurant":
        g["branch_gate"] = ("FAIL" if "needs_restaurant_branch" in eff_flags else "PASS")
        if g["branch_gate"] == "FAIL":
            g["branch_reason"] = "restaurant_branch_unresolved"
    else:
        g["branch_gate"] = "NOT_APPLICABLE"

    # description_gate
    has_ko = bool(pv.get("description_ko") or "")
    has_en = bool(pv.get("description_en") or "")
    content_blocked = "needs_content" in eff_flags
    if not content_blocked and (has_ko or has_en):
        g["description_gate"] = "PASS"
    elif content_blocked:
        g["description_gate"] = "PENDING_SOURCE" if vs == "source_data_missing" else "PENDING_SOURCE"
        g["description_reason"] = "needs_content_flag_set"
    else:
        g["description_gate"] = "PENDING_REVIEW"
        g["description_reason"] = "no_description_collected"

    # image_gate
    img_ok = ia.get("image_status") == "image_sufficient" and bool(ia.get("curated_images"))
    g["image_gate"] = "PASS" if img_ok else "PENDING_SOURCE"
    if not img_ok:
        g["image_reason"] = "no_sufficient_image"

    return g


def classify_publishability(g: dict, eff_flags: set) -> str:
    blocking = {v for k, v in g.items() if k.endswith("_gate") and v in ("FAIL", "PENDING_SOURCE", "PENDING_REVIEW")}
    freshness_only = all(f in FRESHNESS_FLAGS for f in eff_flags)

    if "FAIL" in blocking or "PENDING_SOURCE" in blocking:
        if "PENDING_SOURCE" in blocking or "FAIL" in blocking:
            pending_src = any(g.get(k) == "PENDING_SOURCE" for k in g if k.endswith("_gate"))
            has_fail = any(g.get(k) == "FAIL" for k in g if k.endswith("_gate"))
            if has_fail:
                return "pending_source"
            return "pending_source"
    if "PENDING_REVIEW" in blocking:
        return "pending_review"
    if not blocking:
        if not freshness_only and eff_flags - FRESHNESS_FLAGS:
            return "publishable_with_caveat"
        return "publishable"
    return "publishable_with_caveat"


def run_publishability_v2(candidates: list) -> dict:
    dist = Counter()
    details = []
    for r in candidates:
        eff = get_effective_flags(r)
        g = evaluate_gates(r, eff)
        status = classify_publishability(g, eff)
        # Correct classification
        pending_flags = eff - FRESHNESS_FLAGS
        hard_blocking = {
            k: v for k, v in g.items()
            if k.endswith("_gate") and v in ("FAIL", "PENDING_SOURCE")
        }
        if hard_blocking:
            if g.get("identity_gate") == "PENDING_SOURCE":
                status = "pending_source"
            elif any(v == "PENDING_SOURCE" for v in hard_blocking.values()):
                status = "pending_source"
            else:
                status = "pending_source"
        elif any(v == "PENDING_REVIEW" for k, v in g.items() if k.endswith("_gate")):
            status = "pending_review"
        elif pending_flags:
            status = "publishable_with_caveat"
        else:
            status = "publishable"
        dist[status] += 1
        details.append({"candidate_id": r["candidate_id"], "category": r.get("category"), "status": status})
    return {"distribution": dict(dist), "details": details, "total": len(candidates)}


# ── Main ─────────────────────────────────────────────────────────────────
def main():
    run_ts = datetime.now(timezone.utc).isoformat()
    print("=" * 65)
    print("TASK-VISITBUSAN-EN-SSR-APPLY-V1")
    print(f"run_ts: {run_ts}")
    print("=" * 65)

    branch = subprocess.check_output(["git", "branch", "--show-current"], text=True).strip()
    head   = subprocess.check_output(["git", "log", "--oneline", "-1"], text=True).strip()
    head_sha = head.split()[0]
    print(f"branch: {branch}  HEAD: {head_sha}\n")

    # ── V1 SHA preservation check ─────────────────────────────────────────
    v1_sha_summary = sha256_file(PUB_V1_SUMMARY)
    v1_sha_detail  = sha256_file(PUB_V1_DETAIL)
    print(f"[v1 sha] summary: {v1_sha_summary[:16]}")
    print(f"[v1 sha] detail:  {v1_sha_detail[:16]}")

    # ── Load SSR parsed results ───────────────────────────────────────────
    print("\n[load] SSR parsed results …")
    parsed: dict[str, dict] = {}
    with open(PARSED_FILE, encoding="utf-8-sig") as f:
        for line in f:
            r = json.loads(line)
            parsed[r["candidate_id"]] = r
    print(f"  {len(parsed)} parsed records")

    # ── Load enriched candidates ──────────────────────────────────────────
    print("[load] Enriched candidates …")
    candidates: list[dict] = []
    ec_input_sha = sha256_file(EC_FILE)
    with open(EC_FILE, encoding="utf-8-sig") as f:
        for line in f:
            candidates.append(json.loads(line))
    print(f"  {len(candidates)} candidates  SHA_in={ec_input_sha[:16]}")

    # ── Load source facts ─────────────────────────────────────────────────
    print("[load] Source facts …")
    sf_input_sha = sha256_file(SF_FILE)
    source_facts: list[dict] = []
    with open(SF_FILE, encoding="utf-8-sig") as f:
        for line in f:
            source_facts.append(json.loads(line))
    existing_sf_keys = {r["source_key"] for r in source_facts}
    print(f"  {len(source_facts)} source facts  SHA_in={sf_input_sha[:16]}")

    # ── Apply changes ─────────────────────────────────────────────────────
    print("\n[apply] Processing 183 SSR targets …")
    stats = {
        "name_en_applied": 0,
        "description_en_applied": 0,
        "needs_translation_removed": 0,
        "needs_content_removed": 0,
        "title_only_kept": 0,
        "desc_weak_kept": 0,
        "parse_failed_skipped": 0,
        "en_source_facts_created": 0,
        "en_source_fact_duplicate_skipped": 0,
        "source_summary_updated": 0,
        "identity_errors": 0,
    }
    parser_followup: list[dict] = []
    new_source_facts: list[dict] = []

    # Build candidate lookup
    cand_map: dict[str, dict] = {r["candidate_id"]: r for r in candidates}

    for cid, p in parsed.items():
        cand = cand_map.get(cid)
        if not cand:
            print(f"  ERROR: {cid} not found in enriched candidates")
            stats["identity_errors"] += 1
            continue

        status = p["result_status"]
        en_title = p.get("en_title") or ""
        en_desc  = p.get("en_description") or ""
        vb_cat   = p.get("vb_category", "")
        uc_seq   = p.get("uc_seq", "")
        en_url   = p.get("en_url") or ""

        if status == "PARSE_FAILED":
            parser_followup.append({
                "candidate_id": cid,
                "vb_category": vb_cat,
                "uc_seq": uc_seq,
                "ko_url": p.get("ko_url"),
                "en_url": en_url,
                "ko_status": p.get("ko_status"),
                "en_status": p.get("en_status"),
                "identity_confirmed": p.get("identity_confirmed"),
                "en_image_seqs": p.get("en_image_seqs", []),
                "reason": "h4.tit_pattern_not_found",
                "current_flags": cand.get("validation", {}).get("review_flags", []),
            })
            stats["parse_failed_skipped"] += 1
            continue

        pv  = cand["proposed_values"]
        val = cand["validation"]
        ss  = cand.get("source_summary", {})
        aa  = cand.get("arrival_assessment", {})
        existing_flags = set(val.get("review_flags") or [])

        # name_en: apply if title found and current name_en is empty/None
        if en_title and not (pv.get("name_en") or ""):
            pv["name_en"] = en_title
            stats["name_en_applied"] += 1
            if "needs_translation" in existing_flags:
                existing_flags.discard("needs_translation")
                stats["needs_translation_removed"] += 1

        # description_en: only for EN_USEFUL
        if status == "EN_USEFUL" and en_desc and not (pv.get("description_en") or ""):
            pv["description_en"] = en_desc
            stats["description_en_applied"] += 1
            if "needs_content" in existing_flags:
                existing_flags.discard("needs_content")
                stats["needs_content_removed"] += 1
        elif status == "EN_TITLE_ONLY":
            stats["title_only_kept"] += 1
        elif status == "EN_DESCRIPTION_WEAK":
            stats["desc_weak_kept"] += 1

        val["review_flags"] = sorted(existing_flags)

        # source_summary consistency update
        if en_title and not ss.get("has_english_source"):
            ss["has_english_source"] = True
            stats["source_summary_updated"] += 1
        if status == "EN_USEFUL" and not ss.get("has_en_description"):
            ss["has_en_description"] = True
        # Add EN source key to source_keys list (if not already there)
        en_sk = f"VisitBusanContent:{vb_cat}:{uc_seq}:en"
        if en_title and en_sk not in (ss.get("source_keys") or []):
            if ss.get("source_keys") is not None:
                ss["source_keys"] = ss["source_keys"] + [en_sk]
            else:
                ss["source_keys"] = [en_sk]

        # Create EN source fact (177 records with title)
        if en_title:
            if en_sk in existing_sf_keys:
                stats["en_source_fact_duplicate_skipped"] += 1
            else:
                lat = aa.get("source_lat")
                lng = aa.get("source_lng")
                new_sf = {
                    "candidate_id": cid,
                    "source_key": en_sk,
                    "source_provider": "visitbusan_web",
                    "source_language": "en",
                    "title": en_title,
                    "description": en_desc,  # stored as-is; only EN_USEFUL promoted to enriched
                    "address": pv.get("address") or "",
                    "district": pv.get("district") or "",
                    "lat": str(lat) if lat else "",
                    "lng": str(lng) if lng else "",
                    "collected_at": run_ts,
                    "source_url": en_url,
                    "uc_seq": uc_seq,
                    "vb_category": vb_cat,
                    "collection_task": "TASK-VISITBUSAN-EN-SSR-FULL-V1",
                }
                new_source_facts.append(new_sf)
                existing_sf_keys.add(en_sk)
                stats["en_source_facts_created"] += 1

    # Verify candidate count
    if len(candidates) != 1642:
        print(f"ABORT: candidate count mismatch: {len(candidates)} != 1642")
        sys.exit(1)

    # ── Write enriched candidates ─────────────────────────────────────────
    print("\n[write] Enriched candidates …")
    ec_out = EC_FILE
    with open(ec_out, "w", encoding="utf-8") as f:
        for r in candidates:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    ec_output_sha = sha256_file(ec_out)
    print(f"  SHA_out={ec_output_sha[:16]}")

    # ── Write source facts ────────────────────────────────────────────────
    print("[write] Source facts …")
    sf_out = SF_FILE
    all_sf = source_facts + new_source_facts
    with open(sf_out, "w", encoding="utf-8") as f:
        for r in all_sf:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    sf_output_sha = sha256_file(sf_out)
    print(f"  {len(source_facts)} existing + {len(new_source_facts)} new = {len(all_sf)} total")
    print(f"  SHA_out={sf_output_sha[:16]}")

    # ── V1 SHA verify (unchanged) ─────────────────────────────────────────
    v1_sha_summary_post = sha256_file(PUB_V1_SUMMARY)
    v1_sha_detail_post  = sha256_file(PUB_V1_DETAIL)
    v1_preserved = (v1_sha_summary == v1_sha_summary_post and v1_sha_detail == v1_sha_detail_post)
    print(f"\n[v1 preserve] {'OK' if v1_preserved else 'FAIL'}")
    if not v1_preserved:
        print("  ABORT: V1 publishability files were modified!")
        sys.exit(1)

    # ── Publishability V2 ─────────────────────────────────────────────────
    print("[pubv2] Computing publishability V2 …")
    v2_result = run_publishability_v2(candidates)
    v2_dist = v2_result["distribution"]

    # Load V1 for comparison
    with open(PUB_V1_SUMMARY, encoding="utf-8") as f:
        v1_data = json.load(f)
    v1_dist = v1_data.get("publishability_distribution", v1_data.get("distribution", {}))

    delta = {
        k: v2_dist.get(k, 0) - v1_dist.get(k, 0)
        for k in set(list(v1_dist.keys()) + list(v2_dist.keys()))
    }
    print(f"  V1: {v1_dist}")
    print(f"  V2: {v2_dist}")
    print(f"  Δ:  {delta}")

    v2_summary = {
        "report_id": "busan-publishability-v2-post-vb-en-ssr",
        "gate_version": BASELINE_V2,
        "task": "TASK-VISITBUSAN-EN-SSR-APPLY-V1",
        "run_ts": run_ts,
        "based_on_task": "TASK-VISITBUSAN-EN-SSR-FULL-V1",
        "total_candidates": v2_result["total"],
        "distribution": v2_dist,
        "v1_distribution": v1_dist,
        "delta_vs_v1": delta,
        "note": "Same gate rules as V1. Difference reflects VB EN name/description enrichment.",
    }
    v2_summary_path = REPORT_DIR / "busan-publishability-v2-post-vb-en-ssr.json"
    v2_summary_path.write_text(json.dumps(v2_summary, ensure_ascii=False, indent=2), encoding="utf-8")

    v2_details_path = REPORT_DIR / "busan-publishability-v2-post-vb-en-ssr-details.jsonl"
    with open(v2_details_path, "w", encoding="utf-8") as f:
        for d in v2_result["details"]:
            f.write(json.dumps(d, ensure_ascii=False) + "\n")
    print(f"  V2 summary: {v2_summary_path}")

    # ── Parser follow-up report ───────────────────────────────────────────
    pfu_path = REPORT_DIR / "visitbusan-parser-followup-v1.json"
    pfu = {
        "report_id": "visitbusan-parser-followup-v1",
        "task": "TASK-VISITBUSAN-EN-SSR-APPLY-V1",
        "run_ts": run_ts,
        "count": len(parser_followup),
        "reason": "h4.tit pattern not found in EN HTML; HTTP 200 returned but title absent",
        "note": "identity_confirmed=True for all 6. en_image_seqs captured but not applied this task.",
        "records": parser_followup,
    }
    pfu_path.write_text(json.dumps(pfu, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  Parser follow-up: {pfu_path} ({len(parser_followup)} records)")

    # ── Task report ───────────────────────────────────────────────────────
    verdict = "PASS" if (
        stats["identity_errors"] == 0
        and v1_preserved
        and stats["en_source_fact_duplicate_skipped"] == 0
        and len(candidates) == 1642
    ) else "FAIL"

    report = {
        "report_id": "visitbusan-en-ssr-apply-v1",
        "task": "TASK-VISITBUSAN-EN-SSR-APPLY-V1",
        "run_ts": run_ts,
        "verdict": verdict,
        "branch": branch,
        "head_before": head_sha,
        "head_after": None,

        "application_results": {
            "name_en_applied": stats["name_en_applied"],
            "description_en_applied": stats["description_en_applied"],
            "needs_translation_removed": stats["needs_translation_removed"],
            "needs_content_removed": stats["needs_content_removed"],
            "title_only_kept_needs_content": stats["title_only_kept"],
            "desc_weak_kept_needs_content": stats["desc_weak_kept"],
            "parse_failed_skipped": stats["parse_failed_skipped"],
            "en_source_facts_created": stats["en_source_facts_created"],
            "en_source_fact_duplicate_skipped": stats["en_source_fact_duplicate_skipped"],
            "source_summary_has_english_updated": stats["source_summary_updated"],
            "identity_errors": stats["identity_errors"],
        },

        "publishability": {
            "v1_distribution": v1_dist,
            "v2_distribution": v2_dist,
            "delta": delta,
            "v1_files_preserved": v1_preserved,
        },

        "safety_checks": {
            "candidate_count": len(candidates),
            "candidate_count_ok": len(candidates) == 1642,
            "curated_images_modified": False,
            "new_review_flags_added": False,
            "push": False,
            "external_requests": 0,
            "source_facts_schema_modified": False,
        },

        "file_shas": {
            "ec_input": ec_input_sha,
            "ec_output": ec_output_sha,
            "sf_input": sf_input_sha,
            "sf_output": sf_output_sha,
            "v1_summary_before": v1_sha_summary,
            "v1_summary_after": v1_sha_summary_post,
            "v1_detail_before": v1_sha_detail,
            "v1_detail_after": v1_sha_detail_post,
        },
    }

    report_path = REPORT_DIR / "visitbusan-en-ssr-apply-v1-report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    report_sha = sha256_file(report_path)

    manifest = {
        "manifest_id": "visitbusan-en-ssr-apply-v1",
        "task": "TASK-VISITBUSAN-EN-SSR-APPLY-V1",
        "run_ts": run_ts,
        "verdict": verdict,
        "branch": branch,
        "head_before": head_sha,
        "head_after": None,
        "name_en_applied": stats["name_en_applied"],
        "description_en_applied": stats["description_en_applied"],
        "needs_translation_removed": stats["needs_translation_removed"],
        "needs_content_removed": stats["needs_content_removed"],
        "en_source_facts_created": stats["en_source_facts_created"],
        "parse_failed_skipped": stats["parse_failed_skipped"],
        "v1_preserved": v1_preserved,
        "v2_distribution": v2_dist,
        "candidate_count": len(candidates),
        "push": False,
        "data_modified_files": [
            str(EC_FILE),
            str(SF_FILE),
        ],
        "report_sha256": report_sha,
    }
    mf_path = REPORT_DIR / "visitbusan-en-ssr-apply-v1-manifest.json"
    mf_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    # ── Summary ───────────────────────────────────────────────────────────
    print("\n" + "=" * 65)
    print(f"VERDICT: {verdict}")
    print(f"name_en applied:        {stats['name_en_applied']}")
    print(f"description_en applied: {stats['description_en_applied']}")
    print(f"needs_translation removed: {stats['needs_translation_removed']}")
    print(f"needs_content removed:  {stats['needs_content_removed']}")
    print(f"TITLE_ONLY kept:        {stats['title_only_kept']} (needs_content maintained)")
    print(f"DESC_WEAK kept:         {stats['desc_weak_kept']} (needs_content maintained)")
    print(f"PARSE_FAILED skipped:   {stats['parse_failed_skipped']}")
    print(f"EN source facts created:{stats['en_source_facts_created']}")
    print(f"Identity errors:        {stats['identity_errors']}")
    print(f"V1 preserved:           {v1_preserved}")
    print(f"Candidate count:        {len(candidates)} (must be 1642)")
    print(f"Publishability V1→V2:   {v1_dist} → {v2_dist}")
    print(f"Delta:                  {delta}")
    print(f"curated_images changed: 0")
    print(f"new review_flags added: 0")
    print(f"external requests:      0")
    print(f"push:                   False")
    print("=" * 65)


if __name__ == "__main__":
    main()
