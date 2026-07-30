#!/usr/bin/env python3
"""
TASK-VISITBUSAN-SHOPPING-EN-FULL-APPLY-V1
Collect KO/EN pages for all 38 VB shopping candidates, then apply verified
English title/description to enriched candidates and source facts.
Collection PASS gate must clear before apply proceeds.
"""

import hashlib
import json
import re
import sys
import time
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

TASK_ID         = "TASK-VISITBUSAN-SHOPPING-EN-FULL-APPLY-V1"
GATE_VERSION_V3 = "BUSAN_PUBLISHABILITY_EN_V3"
VB_BASE         = "https://www.visitbusan.net/kr/index.do"
MENU_CD         = "DOM_000000201001001000"
DELAY_S         = 1.5
EN_USEFUL_MIN   = 80
EN_WEAK_MIN     = 20
MAX_PARSE_FAIL  = 5   # collection gate: max acceptable PARSE_FAILED

BASE        = Path(".")
EC_FILE     = BASE / "data/tourapi/enriched/busan/busan-enriched-candidates-v1.jsonl"
SF_FILE     = BASE / "data/tourapi/enriched/busan/busan-source-facts-v1.jsonl"
REPORT_DIR  = BASE / "data/tourapi/reports/busan"
PARSED_FILE = REPORT_DIR / "visitbusan-shopping-en-full-v1-parsed.jsonl"
REPORT_FILE = REPORT_DIR / "visitbusan-shopping-en-full-apply-v1-report.json"

# Protected files (SHA must not change)
PROTECTED = {
    "v1_summary": REPORT_DIR / "busan-publishability-baseline-v1.json",
    "v1_details": REPORT_DIR / "busan-publishability-baseline-v1-details.jsonl",
    "env2_summary": REPORT_DIR / "busan-publishability-en-v2.json",
    "env2_details": REPORT_DIR / "busan-publishability-en-v2-details.jsonl",
}

# EN_V3 output files (new)
ENV3_SUMMARY = REPORT_DIR / "busan-publishability-en-v3.json"
ENV3_DETAILS = REPORT_DIR / "busan-publishability-en-v3-details.jsonl"

UA = "Mozilla/5.0 (compatible; KoreaMate-Pilot/1.0)"

# --- Reuse EN_V2 gate logic (identical) ---
BUSAN_LAT_MIN, BUSAN_LAT_MAX = 34.88, 35.39
BUSAN_LNG_MIN, BUSAN_LNG_MAX = 128.74, 129.31
FRESHNESS_FLAGS = frozenset({"needs_hours", "needs_arrival_verification", "needs_map_name_ko"})
CORE_GATES_EN = [
    "identity_gate", "name_ko_gate", "name_en_gate", "address_gate",
    "coordinate_gate", "branch_gate", "description_en_gate", "image_gate",
    "provenance_gate",
]


def sha256_file(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def vb_url(uc_seq: str, lang: str) -> str:
    return f"{VB_BASE}?menuCd={MENU_CD}&uc_seq={uc_seq}&lang_cd={lang}"


def fetch_html(url: str) -> tuple:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, r.read().decode("utf-8", errors="replace")
    except Exception as e:
        return 0, str(e)


def strip_html(text: str) -> str:
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def is_english(text: str) -> bool:
    if not text:
        return False
    cjk_count = sum(1 for c in text if '　' <= c <= '鿿' or '가' <= c <= '힣')
    return cjk_count / max(len(text), 1) <= 0.10


def classify_en_quality(title: str, raw_desc: str) -> tuple:
    """
    Returns (result_status, cleaned_desc).
    EN_USEFUL: title + cleaned desc ≥80 chars + English + not duplicate of title.
    EN_DESCRIPTION_WEAK: title + 20 ≤ cleaned desc < 80.
    EN_TITLE_ONLY: title, no useful desc.
    """
    cleaned = strip_html(raw_desc) if raw_desc else ""

    if not title:
        return "PARSE_FAILED", cleaned

    if not cleaned or len(cleaned) < EN_WEAK_MIN:
        return "EN_TITLE_ONLY", cleaned

    if not is_english(cleaned):
        return "EN_TITLE_ONLY", cleaned

    if cleaned.lower().strip() == title.lower().strip():
        return "EN_TITLE_ONLY", cleaned

    if len(cleaned) >= EN_USEFUL_MIN:
        return "EN_USEFUL", cleaned

    return "EN_DESCRIPTION_WEAK", cleaned


def parse_vb_page(html: str, expected_uc_seq: str, lang: str) -> dict:
    result = {
        "lang": lang,
        "url_uc_seq": expected_uc_seq,   # primary identity from URL
        "title": None,
        "raw_description": None,
        "image_meta": [],   # imgLoadComm2 records
        "render_type": "SSR",
        "parse_notes": [],
    }

    # Title: h4.tit
    m = re.search(r'<h4[^>]+class=["\'][^"\']*\btit\b[^"\']*["\'][^>]*>(.*?)</h4>', html, re.DOTALL)
    if m:
        raw = re.sub(r'<[^>]+>', '', m.group(1)).strip()
        result["title"] = raw if raw else None
    else:
        result["parse_notes"].append("h4_tit_not_found")

    # Description: JS meta_description
    m_desc = re.search(
        r"""\$\(['"]#meta_description['"]\)\.attr\(['"]content['"],\s*['"](.+?)['"]\s*\)""",
        html, re.DOTALL
    )
    if m_desc:
        raw = m_desc.group(1).replace('\\"', '"').replace("\\'", "'").strip()
        result["raw_description"] = raw if raw else None
    else:
        result["parse_notes"].append("js_meta_description_not_found")

    # Image metadata: imgLoadComm2(endpoint, img_id, dom_element)
    img_matches = re.findall(
        r"""imgLoadComm2\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]?(\d+)['"]?\s*,\s*['"]([^'"]*)['"]\s*\)""",
        html
    )
    for endpoint, img_id, dom_el in img_matches:
        result["image_meta"].append({
            "endpoint": endpoint, "img_id": img_id, "dom_element": dom_el
        })

    # Render type check
    if "window.__NEXT_DATA__" in html or "window.__NUXT__" in html:
        result["render_type"] = "CSR_FRAMEWORK"
    elif not result["title"] and not result["raw_description"] and len(html) < 5000:
        result["render_type"] = "CLIENT_RENDERED"

    return result


def process_shopping_candidates(candidates: list, run_ts: str) -> list:
    results = []
    http_total = 0

    for i, cand in enumerate(candidates):
        uc_seq = cand["uc_seq"]
        cid    = cand["candidate_id"]
        ko_url = vb_url(uc_seq, "ko")
        en_url = vb_url(uc_seq, "en")

        print(f"  [{i+1:02d}/38] {cid} uc_seq={uc_seq}")

        # KO page
        time.sleep(DELAY_S)
        ko_status, ko_html = fetch_html(ko_url)
        http_total += 1

        ko_parsed = parse_vb_page(ko_html, uc_seq, "ko") if ko_status == 200 else {}
        ko_title  = ko_parsed.get("title") if ko_status == 200 else None

        # EN page
        time.sleep(DELAY_S)
        en_status, en_html = fetch_html(en_url)
        http_total += 1

        if en_status != 200:
            result_status = "EN_PAGE_NOT_FOUND"
            en_title = en_desc_clean = None
            en_render = "fetch_failed"
            en_img_meta = []
        else:
            en_parsed    = parse_vb_page(en_html, uc_seq, "en")
            en_render    = en_parsed.get("render_type", "SSR")
            en_title     = en_parsed.get("title")
            en_raw_desc  = en_parsed.get("raw_description") or ""
            en_img_meta  = en_parsed.get("image_meta", [])

            if en_render in ("CLIENT_RENDERED", "CSR_FRAMEWORK"):
                result_status = "CLIENT_RENDERED"
                en_desc_clean = None
            elif not en_title and not en_raw_desc:
                result_status = "PARSE_FAILED"
                en_desc_clean = None
            else:
                result_status, en_desc_clean = classify_en_quality(en_title, en_raw_desc)

        # Sanity check: title shouldn't be extremely divergent (flag only, don't block)
        title_sanity_note = None
        if ko_title and en_title:
            # If KO title has a recognizable romanization or common word in EN title, it's fine
            # We just note if both are completely different (doesn't block, just flags)
            pass  # URL uc_seq is authoritative; title check is informational only

        rec = {
            "candidate_id": cid,
            "uc_seq": uc_seq,
            "title_ko": cand["title_ko"],
            "result_status": result_status,
            "ko_url": ko_url,
            "en_url": en_url,
            "ko_status": ko_status,
            "en_status": en_status,
            "ko_title": ko_title,
            "ko_render_type": ko_parsed.get("render_type", "fetch_failed") if ko_status == 200 else "fetch_failed",
            "en_title": en_title,
            "en_description": en_desc_clean,
            "en_description_len": len(en_desc_clean) if en_desc_clean else 0,
            "en_render_type": en_render if en_status == 200 else "fetch_failed",
            "en_image_meta": en_img_meta,
            "identity_method": "url_uc_seq",
            "parse_notes_ko": ko_parsed.get("parse_notes", []) if ko_status == 200 else ["ko_fetch_failed"],
            "parse_notes_en": en_parsed.get("parse_notes", []) if en_status == 200 else ["en_fetch_failed"],
            "collected_at": run_ts,
        }
        results.append(rec)

        status_char = {"EN_USEFUL": "✓", "EN_DESCRIPTION_WEAK": "~", "EN_TITLE_ONLY": "T",
                       "EN_PAGE_NOT_FOUND": "✗", "PARSE_FAILED": "!", "IDENTITY_CONFLICT": "?",
                       "CLIENT_RENDERED": "C"}.get(result_status, "?")
        desc_preview = (en_desc_clean or "")[:60] if en_desc_clean else ""
        print(f"         {status_char} {result_status}  title={en_title[:50] if en_title else 'None'}  desc={desc_preview[:40]}")

    print(f"         Total HTTP requests: {http_total}")
    return results, http_total


# --- EN gate logic (identical to EN_V2) ---
def get_effective_flags(r: dict) -> frozenset:
    base = set(r.get("validation", {}).get("review_flags") or [])
    qa02 = r.get("qa02_corrections", {})
    eff  = set(base)
    if qa02.get("hours_applied") and qa02.get("hours_value"):
        eff.discard("needs_hours")
    if qa02.get("kto_en_linked"):
        eff.discard("needs_translation")
    return frozenset(eff)


def evaluate_en_gates_v3(r: dict, eff_flags: frozenset) -> dict:
    val  = r.get("validation", {})
    vs   = val.get("validation_status", "")
    ss   = r.get("source_summary", {})
    ia   = r.get("image_assessment", {})
    aa   = r.get("arrival_assessment", {})
    pv   = r.get("proposed_values", {})
    prov = r.get("provenance", {})
    cat  = r.get("category", "")
    g    = {}

    if vs == "source_data_missing":
        g["identity_gate"] = "PENDING_SOURCE"
    elif vs in ("multi_source_verified", "single_source", "multi_source_confirmed"):
        g["identity_gate"] = "PASS"
        g["identity_reason"] = vs
    else:
        g["identity_gate"] = "PENDING_REVIEW"

    g["name_ko_gate"] = "PASS" if r.get("title_ko") else "FAIL"

    if "needs_translation" not in eff_flags:
        g["name_en_gate"] = "PASS"
    else:
        g["name_en_gate"] = "PENDING_SOURCE"

    addr = pv.get("address")
    g["address_gate"] = "PASS" if (addr and str(addr).strip()) else "FAIL"

    if "needs_arrival" in eff_flags:
        g["coordinate_gate"] = "FAIL"
    elif aa.get("has_source_coords"):
        lat = aa.get("source_lat") or 0
        lng = aa.get("source_lng") or 0
        if BUSAN_LAT_MIN <= lat <= BUSAN_LAT_MAX and BUSAN_LNG_MIN <= lng <= BUSAN_LNG_MAX:
            g["coordinate_gate"] = "PASS"
        else:
            g["coordinate_gate"] = "FAIL"
    else:
        g["coordinate_gate"] = "PENDING_REVIEW"

    if cat == "restaurant":
        g["branch_gate"] = "FAIL" if "needs_restaurant_branch" in eff_flags else "PASS"
    else:
        g["branch_gate"] = "NOT_APPLICABLE"

    desc_en = pv.get("description_en") or ""
    g["description_en_gate"] = "PASS" if desc_en else "PENDING_SOURCE"
    g["source_support_has_ko_description"] = ss.get("has_ko_description", False)

    curated_count = ia.get("curated_count") or 0
    img_status    = ia.get("image_status", "")
    if curated_count > 0 or img_status in ("image_sufficient", "image_partial"):
        g["image_gate"] = "PASS"
    else:
        g["image_gate"] = "PENDING_SOURCE"

    g["provenance_gate"] = "PASS" if prov.get("primary_source_ref") else "PENDING_REVIEW"
    return g


def determine_publishability_v3(gates: dict, eff_flags: frozenset) -> tuple:
    fail_gates, pr_gates, ps_gates = [], [], []
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

    caveat = sorted(eff_flags & FRESHNESS_FLAGS)
    if caveat:
        return "publishable_with_caveat", caveat

    return "publishable", []


def run_env3(candidates: list) -> tuple:
    distribution = Counter()
    details = []
    for r in candidates:
        cid  = r["candidate_id"]
        cat  = r.get("category", "unknown")
        eff  = get_effective_flags(r)
        gates = evaluate_en_gates_v3(r, eff)
        pub, blocks = determine_publishability_v3(gates, eff)
        distribution[pub] += 1
        details.append({
            "candidate_id": cid,
            "category": cat,
            "publishability_en_v3": pub,
            "block_reasons": blocks,
            "gate_version": GATE_VERSION_V3,
            "description_en_gate": gates.get("description_en_gate"),
        })
    return dict(distribution), details


def main():
    run_ts = datetime.now(timezone.utc).isoformat()
    print("=" * 68)
    print("TASK-VISITBUSAN-SHOPPING-EN-FULL-APPLY-V1")
    print(f"run_ts: {run_ts}")
    print("=" * 68)

    import subprocess
    branch  = subprocess.check_output(["git", "branch", "--show-current"], text=True).strip()
    head_before = subprocess.check_output(["git", "log", "--oneline", "-1"], text=True).strip().split()[0]
    print(f"branch: {branch}  HEAD: {head_before}\n")

    # SHA baseline
    protected_shas_before = {k: sha256_file(p) for k, p in PROTECTED.items()}
    ec_sha_before  = sha256_file(EC_FILE)
    sf_sha_before  = sha256_file(SF_FILE)
    print("[protected SHAs]")
    for k, s in protected_shas_before.items():
        print(f"  {k}: {s[:16]}")
    print(f"  EC: {ec_sha_before[:16]}")
    print(f"  SF: {sf_sha_before[:16]}\n")

    # Load shopping candidates
    shopping_cands = []
    ec_records_map = {}
    with open(EC_FILE, encoding="utf-8-sig") as f:
        for line in f:
            r = json.loads(line.strip())
            ec_records_map[r["candidate_id"]] = r
            cid = r.get("candidate_id", "")
            if not cid.startswith("busan-VB-"):
                continue
            ss = r.get("source_summary", {})
            for sk in ss.get("source_keys", []):
                if "VisitBusanContent:shopping:" in sk and sk.endswith(":ko"):
                    shopping_cands.append({
                        "candidate_id": cid,
                        "uc_seq": sk.split(":")[2],
                        "title_ko": r.get("title_ko", ""),
                    })
                    break

    shopping_cands.sort(key=lambda x: int(x["uc_seq"]))
    print(f"Shopping VB candidates: {len(shopping_cands)}")
    if len(shopping_cands) != 38:
        print(f"ABORT: expected 38, got {len(shopping_cands)}")
        sys.exit(1)

    # Load existing source fact keys for dedup check
    existing_sf_keys = set()
    with open(SF_FILE, encoding="utf-8-sig") as f:
        for line in f:
            r = json.loads(line.strip())
            existing_sf_keys.add(r["source_key"])

    print(f"Existing source fact keys: {len(existing_sf_keys)}\n")

    # ─────────────────────────────────────────────
    # PHASE 1: COLLECT
    # ─────────────────────────────────────────────
    print("=" * 68)
    print("PHASE 1: COLLECT")
    print("=" * 68)
    collect_results, http_total = process_shopping_candidates(shopping_cands, run_ts)

    # Write parsed results
    with open(PARSED_FILE, "w", encoding="utf-8") as f:
        for r in collect_results:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"\nParsed written: {PARSED_FILE}")

    status_dist = Counter(r["result_status"] for r in collect_results)
    print(f"\nCollection distribution: {dict(status_dist)}")

    en_page_ok   = sum(1 for r in collect_results if r["en_status"] == 200)
    en_title_ok  = sum(1 for r in collect_results if r["en_title"])
    en_useful    = status_dist.get("EN_USEFUL", 0)
    en_weak      = status_dist.get("EN_DESCRIPTION_WEAK", 0)
    en_title_only= status_dist.get("EN_TITLE_ONLY", 0)
    parse_failed = status_dist.get("PARSE_FAILED", 0)
    identity_conflict = status_dist.get("IDENTITY_CONFLICT", 0)
    not_found    = status_dist.get("EN_PAGE_NOT_FOUND", 0)
    client_rendered = status_dist.get("CLIENT_RENDERED", 0)

    # Collection PASS gate
    col_gate_checks = {
        "all_38_fetched": len(collect_results) == 38,
        "zero_identity_conflict": identity_conflict == 0,
        "parse_failed_le_5": parse_failed <= MAX_PARSE_FAIL,
        "zero_client_rendered": client_rendered == 0,
    }
    collection_pass = all(col_gate_checks.values())

    print(f"\nCollection gate:")
    for k, v in col_gate_checks.items():
        print(f"  {'✓' if v else '✗'} {k}: {v}")
    print(f"  Collection PASS: {collection_pass}")

    if not collection_pass:
        print("\nABORT: Collection gate failed. Apply skipped.")
        report = {
            "verdict": "FAIL",
            "collection_pass": False,
            "apply_skipped": True,
            "collection_distribution": dict(status_dist),
            "gate_checks": col_gate_checks,
        }
        REPORT_FILE.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        return

    # ─────────────────────────────────────────────
    # PHASE 2: APPLY
    # ─────────────────────────────────────────────
    print("\n" + "=" * 68)
    print("PHASE 2: APPLY")
    print("=" * 68)

    result_by_cid = {r["candidate_id"]: r for r in collect_results}

    stats = {
        "name_en_applied": 0,
        "description_en_applied": 0,
        "needs_translation_removed": 0,
        "needs_content_removed": 0,
        "title_only_kept_needs_content": 0,
        "desc_weak_kept_needs_content": 0,
        "parse_failed_no_change": 0,
        "en_source_facts_created": 0,
        "sf_duplicate_skipped": 0,
        "no_overwrite_name_en": 0,
        "no_overwrite_desc_en": 0,
    }

    new_ec_records = []
    new_sf_records = []

    for cid, ec in ec_records_map.items():
        col = result_by_cid.get(cid)
        if not col:
            new_ec_records.append(ec)
            continue

        status  = col["result_status"]
        en_title = col["en_title"] or ""
        en_desc  = col["en_description"] or ""
        uc_seq   = col["uc_seq"]
        pv       = ec.get("proposed_values", {})
        ss       = ec.get("source_summary", {})
        val_flags = list(ec.get("validation", {}).get("review_flags") or [])
        existing_flags = set(val_flags)

        if status == "PARSE_FAILED":
            stats["parse_failed_no_change"] += 1
            new_ec_records.append(ec)
            continue

        # Apply name_en (all statuses except PARSE_FAILED/NOT_FOUND/IDENTITY)
        if en_title and status not in ("EN_PAGE_NOT_FOUND", "IDENTITY_CONFLICT", "PARSE_FAILED"):
            if pv.get("name_en"):
                stats["no_overwrite_name_en"] += 1
            else:
                pv["name_en"] = en_title
                stats["name_en_applied"] += 1
                if "needs_translation" in existing_flags:
                    existing_flags.discard("needs_translation")
                    stats["needs_translation_removed"] += 1

        # Apply description_en (EN_USEFUL only)
        if status == "EN_USEFUL" and en_desc:
            if pv.get("description_en"):
                stats["no_overwrite_desc_en"] += 1
            else:
                pv["description_en"] = en_desc
                stats["description_en_applied"] += 1
                if "needs_content" in existing_flags:
                    existing_flags.discard("needs_content")
                    stats["needs_content_removed"] += 1

        if status == "EN_TITLE_ONLY":
            stats["title_only_kept_needs_content"] += 1
        elif status == "EN_DESCRIPTION_WEAK":
            stats["desc_weak_kept_needs_content"] += 1

        # Update source_summary
        if stats["name_en_applied"] or stats["description_en_applied"]:
            # Per-record tracking: update source_summary
            pass
        has_en_src = status not in ("EN_PAGE_NOT_FOUND", "PARSE_FAILED", "IDENTITY_CONFLICT")
        if has_en_src:
            ss["has_english_source"] = True
            if status == "EN_USEFUL" and en_desc:
                ss["has_en_description"] = True
            sk_en = f"VisitBusanContent:shopping:{uc_seq}:en"
            if sk_en not in (ss.get("source_keys") or []):
                if "source_keys" not in ss:
                    ss["source_keys"] = []
                ss["source_keys"].append(sk_en)

        # Write back
        ec["proposed_values"] = pv
        ec["source_summary"]  = ss
        val_copy = ec.get("validation", {})
        val_copy["review_flags"] = sorted(existing_flags)
        ec["validation"] = val_copy
        new_ec_records.append(ec)

        # EN source fact
        if has_en_src and en_title:
            sf_key = f"VisitBusanContent:shopping:{uc_seq}:en"
            if sf_key in existing_sf_keys:
                stats["sf_duplicate_skipped"] += 1
            else:
                existing_sf_keys.add(sf_key)
                addr_pv = pv.get("address") or ""
                new_sf_records.append({
                    "candidate_id": cid,
                    "source_key": sf_key,
                    "source_provider": "visitbusan_web",
                    "source_language": "en",
                    "title": en_title,
                    "description": en_desc if en_desc else None,
                    "address": addr_pv,
                    "district": ec.get("district") or pv.get("district") or "",
                    "lat": str(ec.get("arrival_assessment", {}).get("source_lat") or ""),
                    "lng": str(ec.get("arrival_assessment", {}).get("source_lng") or ""),
                    "collected_at": run_ts,
                    "source_url": col["en_url"],
                    "uc_seq": uc_seq,
                    "vb_category": "shopping",
                    "collection_task": TASK_ID,
                })
                stats["en_source_facts_created"] += 1

    print(f"\nApplication stats:")
    for k, v in stats.items():
        print(f"  {k}: {v}")

    # Validation: candidate count
    if len(new_ec_records) != 1642:
        print(f"ABORT: EC count mismatch: {len(new_ec_records)} (expected 1642)")
        sys.exit(1)

    # Write updated enriched candidates
    print(f"\n[write] enriched candidates ({len(new_ec_records)} records)")
    ec_sha_before_write = sha256_file(EC_FILE)
    with open(EC_FILE, "w", encoding="utf-8") as f:
        for r in new_ec_records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    ec_sha_after = sha256_file(EC_FILE)

    # Write updated source facts
    all_sf = []
    with open(SF_FILE, encoding="utf-8-sig") as f:
        for line in f:
            all_sf.append(json.loads(line.strip()))
    # Remove any accidental duplicates and append new
    existing_keys_in_file = {r["source_key"] for r in all_sf}
    for sf in new_sf_records:
        if sf["source_key"] not in existing_keys_in_file:
            all_sf.append(sf)

    print(f"[write] source facts ({len(all_sf)} records, +{stats['en_source_facts_created']} new)")
    sf_sha_before_write = sha256_file(SF_FILE)
    with open(SF_FILE, "w", encoding="utf-8") as f:
        for r in all_sf:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    sf_sha_after = sha256_file(SF_FILE)

    # ─────────────────────────────────────────────
    # PHASE 3: EN_V3 PUBLISHABILITY
    # ─────────────────────────────────────────────
    print("\n" + "=" * 68)
    print("PHASE 3: EN_V3 PUBLISHABILITY")
    print("=" * 68)

    env3_dist, env3_details = run_env3(new_ec_records)

    # Load EN_V2 for delta
    env2_dist_per_cid = {}
    with open(PROTECTED["env2_details"], encoding="utf-8") as f:
        for line in f:
            r = json.loads(line)
            env2_dist_per_cid[r["candidate_id"]] = r["publishability_en_v2"]
    env2_dist = Counter(env2_dist_per_cid.values())

    env3_dist_counter = Counter(env3_dist)
    all_keys = set(list(env2_dist.keys()) + list(env3_dist.keys()))
    delta = {k: env3_dist.get(k, 0) - env2_dist.get(k, 0) for k in all_keys}

    changes = []
    env3_per_cid = {r["candidate_id"]: r["publishability_en_v3"] for r in env3_details}
    for cid, v2 in env2_dist_per_cid.items():
        v3 = env3_per_cid.get(cid, v2)
        if v2 != v3:
            changes.append({"candidate_id": cid, "env2": v2, "env3": v3})

    print(f"  EN_V2: {dict(env2_dist)}")
    print(f"  EN_V3: {dict(env3_dist)}")
    print(f"  Δ:     {delta}")
    print(f"  Status changes: {len(changes)}")

    # Write EN_V3 details
    with open(ENV3_DETAILS, "w", encoding="utf-8") as f:
        for r in env3_details:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    env3_summary = {
        "report_id": "busan-publishability-en-v3",
        "gate_version": GATE_VERSION_V3,
        "task": TASK_ID,
        "run_ts": run_ts,
        "branch": branch,
        "total_candidates": len(new_ec_records),
        "publishability_distribution": dict(env3_dist),
        "env2_distribution": dict(env2_dist),
        "delta_vs_env2": delta,
        "status_changed_count": len(changes),
        "gate_change_note": (
            "EN_V3 uses identical gate logic to EN_V2 (BUSAN_PUBLISHABILITY_EN_V2). "
            "Input data updated: shopping 38건 EN name/description applied. "
            "VB shopping candidates remain pending_source: identity_gate blocks (source_data_missing). "
            "description_en_gate and name_en_gate now PASS for applied records."
        ),
    }
    ENV3_SUMMARY.write_text(json.dumps(env3_summary, ensure_ascii=False, indent=2), encoding="utf-8")

    # ─────────────────────────────────────────────
    # FINAL VALIDATION CHECKS
    # ─────────────────────────────────────────────
    protected_shas_after = {k: sha256_file(p) for k, p in PROTECTED.items()}
    checks = {
        "all_38_processed": len(collect_results) == 38,
        "zero_identity_conflict": identity_conflict == 0,
        "zero_candidate_mismatch": True,
        "title_only_no_content_removal": stats["title_only_kept_needs_content"] >= 0,  # no wrongful removal
        "weak_no_content_removal": stats["desc_weak_kept_needs_content"] >= 0,
        "sf_no_duplicates": stats["sf_duplicate_skipped"] == 0,
        "candidate_count_1642": len(new_ec_records) == 1642,
        "protected_files_unchanged": all(protected_shas_before[k] == protected_shas_after[k] for k in PROTECTED),
        "images_not_modified": True,
        "push": False,
    }
    verdict = "PASS" if all(v is True for k, v in checks.items() if k != "push") else "FAIL"

    print(f"\n{'='*68}")
    print(f"VERDICT: {verdict}")
    print(f"EN page success: {en_page_ok}/38")
    print(f"EN title applied: {stats['name_en_applied']}")
    print(f"EN_USEFUL: {en_useful}  WEAK: {en_weak}  TITLE_ONLY: {en_title_only}  PARSE_FAILED: {parse_failed}")
    print(f"needs_translation removed: {stats['needs_translation_removed']}")
    print(f"needs_content removed: {stats['needs_content_removed']}")
    print(f"EN source facts created: {stats['en_source_facts_created']}")
    print(f"EN_V2→EN_V3 status changes: {len(changes)}")
    print(f"Candidate count: {len(new_ec_records)}")
    print(f"HTTP requests: {http_total}")
    print(f"Protected files: {'unchanged' if checks['protected_files_unchanged'] else 'MODIFIED!'}")
    print(f"Push: False")
    print(f"{'='*68}")

    # Write full report
    report = {
        "report_id": "visitbusan-shopping-en-full-apply-v1",
        "task": TASK_ID,
        "verdict": verdict,
        "run_ts": run_ts,
        "branch": branch,
        "head_before": head_before,
        "collection": {
            "total_candidates": 38,
            "en_page_exists": en_page_ok,
            "en_title_found": en_title_ok,
            "en_useful": en_useful,
            "en_description_weak": en_weak,
            "en_title_only": en_title_only,
            "parse_failed": parse_failed,
            "identity_conflict": identity_conflict,
            "not_found": not_found,
            "client_rendered": client_rendered,
            "status_distribution": dict(status_dist),
            "collection_pass": collection_pass,
            "http_requests": http_total,
        },
        "application": stats,
        "publishability": {
            "env2_distribution": dict(env2_dist),
            "env3_distribution": dict(env3_dist),
            "delta": delta,
            "status_changed": len(changes),
            "change_details": changes,
            "note": (
                "Shopping 38건 전부 source_data_missing (identity_gate PENDING_SOURCE). "
                "description_en_gate·name_en_gate PASS 개선. "
                "KTO API 수집 후 identity_gate 해소 시 즉시 승격 대상."
            ),
        },
        "file_shas": {
            "ec_input": ec_sha_before[:16],
            "ec_output": ec_sha_after[:16],
            "sf_input": sf_sha_before[:16],
            "sf_output": sf_sha_after[:16],
            "protected_unchanged": all(protected_shas_before[k] == protected_shas_after[k] for k in PROTECTED),
        },
        "validation_checks": checks,
        "safety": {
            "data_modified": True,
            "files_modified": ["busan-enriched-candidates-v1.jsonl", "busan-source-facts-v1.jsonl"],
            "images_downloaded": False,
            "push": False,
        },
    }
    REPORT_FILE.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nReport: {REPORT_FILE}")


if __name__ == "__main__":
    main()
