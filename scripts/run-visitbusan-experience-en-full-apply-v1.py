#!/usr/bin/env python3
"""
TASK-VISITBUSAN-EXPERIENCE-EN-FULL-APPLY-V1
Full collect + apply for VB experience 93건.
Creates KO source facts (0 exist), EN source facts, upgrades validation_status.
"""

import hashlib
import json
import re
import subprocess
import sys
import time
import unicodedata
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

TASK_ID          = "TASK-VISITBUSAN-EXPERIENCE-EN-FULL-APPLY-V1"
GATE_VERSION_V5  = "BUSAN_PUBLISHABILITY_EN_V5"
BASE             = Path(".")
EC_FILE          = BASE / "data/tourapi/enriched/busan/busan-enriched-candidates-v1.jsonl"
SF_FILE          = BASE / "data/tourapi/enriched/busan/busan-source-facts-v1.jsonl"
REPORT_DIR       = BASE / "data/tourapi/reports/busan"

EXPERIENCE_MENU_CD = "DOM_000000202008001000"
VB_KO_URL   = f"https://www.visitbusan.net/kr/index.do?menuCd={EXPERIENCE_MENU_CD}&uc_seq={{uc_seq}}&lang_cd=ko"
VB_EN_URL   = f"https://www.visitbusan.net/kr/index.do?menuCd={EXPERIENCE_MENU_CD}&uc_seq={{uc_seq}}&lang_cd=en"

PROTECTED = {
    "v1_summary":   REPORT_DIR / "busan-publishability-baseline-v1.json",
    "v1_details":   REPORT_DIR / "busan-publishability-baseline-v1-details.jsonl",
    "env2_summary": REPORT_DIR / "busan-publishability-en-v2.json",
    "env3_summary": REPORT_DIR / "busan-publishability-en-v3.json",
    "env3_details": REPORT_DIR / "busan-publishability-en-v3-details.jsonl",
    "env4_summary": REPORT_DIR / "busan-publishability-en-v4.json",
    "env4_details": REPORT_DIR / "busan-publishability-en-v4-details.jsonl",
}

ENV5_SUMMARY      = REPORT_DIR / "busan-publishability-en-v5.json"
ENV5_DETAILS      = REPORT_DIR / "busan-publishability-en-v5-details.jsonl"
FULL_PARSED_FILE  = REPORT_DIR / "visitbusan-experience-en-full-v1-parsed.jsonl"
COMPLETION_REPORT = REPORT_DIR / "visitbusan-experience-en-full-apply-v1-completion-report.json"

EN_USEFUL_MIN    = 80
EN_WEAK_MIN      = 20
PARSE_FAIL_MAX   = 10
REQUEST_DELAY    = 0.5

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9,ko;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

# EN_V5 gate constants (same as V2/V3/V4)
BUSAN_LAT_MIN, BUSAN_LAT_MAX = 34.88, 35.39
BUSAN_LNG_MIN, BUSAN_LNG_MAX = 128.74, 129.31
FRESHNESS_FLAGS = frozenset({"needs_hours", "needs_arrival_verification", "needs_map_name_ko"})
CORE_GATES_EN   = [
    "identity_gate", "name_ko_gate", "name_en_gate", "address_gate",
    "coordinate_gate", "branch_gate", "description_en_gate", "image_gate",
    "provenance_gate",
]

VISIT_VALUE_KEYWORDS = [
    "located", "offers", "features", "provides", "known", "famous",
    "visitors", "experience", "enjoy", "popular", "activity",
    "busan", "korea", "traditional", "modern", "unique", "special",
    "available", "program", "class", "tour", "open", "visit",
    "attraction", "landmark", "view", "natural", "cultural", "art",
    "museum", "park", "beach", "mountain", "river", "sea", "ocean",
]


def sha256_file(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def fetch_page(url: str) -> tuple[int, str]:
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, ""
    except Exception:
        return 0, ""


def strip_html(text: str) -> str:
    cleaned = re.sub(r"<[^>]+>", "", text)
    return re.sub(r"\s+", " ", cleaned).strip()


def cjk_ratio(text: str) -> float:
    if not text:
        return 0.0
    cjk = sum(1 for c in text if unicodedata.east_asian_width(c) in ("W", "F"))
    return cjk / len(text)


def is_english(text: str) -> bool:
    return len(text) > 0 and cjk_ratio(text) <= 0.10


def has_visit_value(text: str, title: str) -> bool:
    """
    '장소 특징과 방문 가치가 있는지 확인' heuristic for experience content.
    Beyond mere length check: requires sentence structure OR length ≥150,
    plus at least one experience/place keyword.
    """
    if not text or len(text) < EN_USEFUL_MIN:
        return False
    tl = title.lower().strip() if title else ""
    txt = text.lower().strip()
    # Reject if description is essentially just the title repeated
    if tl and txt.startswith(tl) and len(txt) - len(tl) < 30:
        return False
    has_sentences = bool(re.search(r"[.!?]\s+[A-Z]", text))
    is_long        = len(text) >= 150
    has_keywords   = any(kw in txt for kw in VISIT_VALUE_KEYWORDS)
    return (has_sentences or is_long) and has_keywords


def classify_en_quality(title: str, raw_desc: str) -> tuple[str, str]:
    cleaned = strip_html(raw_desc) if raw_desc else ""
    if not title:
        return "PARSE_FAILED", cleaned
    if not cleaned:
        return "EN_TITLE_ONLY", cleaned
    if not is_english(cleaned):
        return "EN_TITLE_ONLY", cleaned
    if cleaned.lower().strip() == title.lower().strip():
        return "EN_TITLE_ONLY", cleaned
    if has_visit_value(cleaned, title):
        return "EN_USEFUL", cleaned
    if len(cleaned) >= EN_USEFUL_MIN:
        return "EN_DESCRIPTION_WEAK", cleaned
    if len(cleaned) >= EN_WEAK_MIN:
        return "EN_DESCRIPTION_WEAK", cleaned
    return "EN_TITLE_ONLY", cleaned


def parse_ssr_page(html: str, expected_uc_seq: str) -> dict:
    r = {
        "title": None, "description_raw": None, "description": None,
        "image_ids": [], "uc_seq_in_hidden": None, "parse_notes": [],
    }
    if not html:
        return r
    tit = re.search(r'<h4[^>]*class=["\'][^"\']*tit[^"\']*["\'][^>]*>(.*?)</h4>', html, re.S)
    if tit:
        r["title"] = strip_html(tit.group(1)).strip()
    else:
        r["parse_notes"].append("h4_tit_not_found")

    desc = re.search(
        r"""['"]#meta_description['"].*?attr\s*\(\s*['"]content['"],\s*['"](.*?)['"]""",
        html, re.S
    )
    if desc:
        r["description_raw"] = desc.group(1)
        r["description"] = strip_html(desc.group(1)).strip()
    else:
        r["parse_notes"].append("js_meta_description_not_found")

    # imgLoadComm2 IMAGE_ID (≠ uc_seq)
    img2 = re.findall(r"""imgLoadComm2\s*\([^,]+,\s*['"]([^'"]+)['"]""", html)
    if img2:
        r["image_ids"] = list(set(img2))
        r["parse_notes"].append("imgLoadComm2_detected")
    else:
        r["parse_notes"].append("no_imgLoadComm2")

    uc_input = re.search(r'<input[^>]*name=["\']uc_seq["\'][^>]*value=["\'](\d+)["\']', html)
    r["uc_seq_in_hidden"] = uc_input.group(1) if uc_input else None
    if not uc_input:
        r["parse_notes"].append("uc_seq_input_not_found")
    return r


def get_effective_flags(r: dict) -> frozenset:
    base = set(r.get("validation", {}).get("review_flags") or [])
    qa02 = r.get("qa02_corrections", {})
    eff  = set(base)
    if qa02.get("hours_applied") and qa02.get("hours_value"):
        eff.discard("needs_hours")
    if qa02.get("kto_en_linked"):
        eff.discard("needs_translation")
    return frozenset(eff)


def evaluate_en_gates_v5(r: dict, eff_flags: frozenset) -> dict:
    val  = r.get("validation", {})
    vs   = val.get("validation_status", "")
    ss   = r.get("source_summary", {})
    ia   = r.get("image_assessment", {})
    aa   = r.get("arrival_assessment", {})
    pv   = r.get("proposed_values", {})
    prov = r.get("provenance", {})
    cat  = r.get("category", "")
    g    = {}

    if vs in ("multi_source_verified", "single_source", "multi_source_confirmed"):
        g["identity_gate"] = "PASS"
        g["identity_reason"] = vs
    elif vs == "source_data_missing":
        g["identity_gate"] = "PENDING_SOURCE"
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

    curated = ia.get("curated_count") or 0
    img_st  = ia.get("image_status", "")
    g["image_gate"] = "PASS" if (curated > 0 or img_st in ("image_sufficient", "image_partial")) else "PENDING_SOURCE"

    g["provenance_gate"] = "PASS" if prov.get("primary_source_ref") else "PENDING_REVIEW"
    return g


def determine_publishability_v5(gates: dict, eff_flags: frozenset) -> tuple:
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


def main():
    run_ts = datetime.now(timezone.utc).isoformat()
    print("=" * 70)
    print("TASK-VISITBUSAN-EXPERIENCE-EN-FULL-APPLY-V1")
    print(f"run_ts: {run_ts}")
    print("=" * 70)

    branch      = subprocess.check_output(["git", "branch", "--show-current"], text=True).strip()
    head_before = subprocess.check_output(["git", "log", "--oneline", "-1"], text=True).strip().split()[0]
    print(f"branch: {branch}  HEAD: {head_before}\n")

    protected_shas_before = {k: sha256_file(p) for k, p in PROTECTED.items()}
    ec_sha_before = sha256_file(EC_FILE)
    sf_sha_before = sha256_file(SF_FILE)
    print("[Protected SHAs]")
    for k, s in protected_shas_before.items():
        print(f"  {k}: {s[:16]}")

    # ─────────────────────────────────────────────
    # PHASE 0: Load experience candidates
    # ─────────────────────────────────────────────
    print("\nPHASE 0: Load experience candidates …")
    exp_candidates: list[dict] = []
    with open(EC_FILE, encoding="utf-8-sig") as f:
        for line in f:
            r = json.loads(line.strip())
            cid = r.get("candidate_id", "")
            if not cid.startswith("busan-VB-"):
                continue
            ss = r.get("source_summary", {})
            for sk in ss.get("source_keys", []):
                if "VisitBusanContent:experience:" in sk:
                    uc_seq = sk.split(":")[2]
                    exp_candidates.append({
                        "candidate_id": cid,
                        "uc_seq": uc_seq,
                        "title_ko": r.get("title_ko", ""),
                        "ko_url": VB_KO_URL.format(uc_seq=uc_seq),
                        "en_url": VB_EN_URL.format(uc_seq=uc_seq),
                        "source_key_ko": sk,
                    })
                    break

    n = len(exp_candidates)
    print(f"  Experience candidates: {n}")
    if n != 93:
        print(f"  ABORT: expected 93, got {n}")
        sys.exit(1)

    existing_sf: list[dict] = []
    existing_sf_keys: set[str] = set()
    with open(SF_FILE, encoding="utf-8-sig") as f:
        for line in f:
            r = json.loads(line.strip())
            existing_sf.append(r)
            existing_sf_keys.add(r["source_key"])
    print(f"  Source facts loaded: {len(existing_sf)}")

    # ─────────────────────────────────────────────
    # PHASE 1: COLLECT (93 × 2 = 186 requests)
    # ─────────────────────────────────────────────
    print(f"\nPHASE 1: COLLECT (186 HTTP requests) …")
    collected: list[dict] = []
    total_requests = 0

    for i, c in enumerate(exp_candidates, 1):
        cid, uc_seq = c["candidate_id"], c["uc_seq"]
        if i % 10 == 0 or i == 1 or i == n:
            print(f"  [{i}/{n}] {cid} uc_seq={uc_seq}")

        ko_status, ko_html = fetch_page(c["ko_url"])
        total_requests += 1
        time.sleep(REQUEST_DELAY)
        en_status, en_html = fetch_page(c["en_url"])
        total_requests += 1
        time.sleep(REQUEST_DELAY)

        ko_parsed = parse_ssr_page(ko_html, uc_seq)
        en_parsed = parse_ssr_page(en_html, uc_seq)

        # Identity: URL uc_seq is primary (no hidden input in experience pages)
        identity_method = "url_uc_seq"
        identity_confirmed = (en_status == 200 and ko_status == 200)

        # Identity conflict check: ko_title vs en_title should be different languages (sanity)
        # IDENTITY_CONFLICT only if uc_seq embedded elsewhere mismatches
        has_conflict = False
        if ko_parsed.get("uc_seq_in_hidden") and ko_parsed["uc_seq_in_hidden"] != uc_seq:
            has_conflict = True
        if en_parsed.get("uc_seq_in_hidden") and en_parsed["uc_seq_in_hidden"] != uc_seq:
            has_conflict = True

        en_title  = en_parsed.get("title") or ""
        ko_title  = ko_parsed.get("title") or c["title_ko"] or ""
        en_desc_r = en_parsed.get("description_raw")
        en_desc   = en_parsed.get("description")

        if has_conflict:
            status = "IDENTITY_CONFLICT"
            quality, en_desc_cleaned = "IDENTITY_CONFLICT", ""
        elif ko_status == 0 or en_status == 0 or ko_status >= 500:
            status = "PARSE_FAILED"
            quality, en_desc_cleaned = "PARSE_FAILED", ""
        elif not en_title:
            status = "EN_NO_CONTENT"
            quality, en_desc_cleaned = "EN_NO_CONTENT", ""
        else:
            quality, en_desc_cleaned = classify_en_quality(en_title, en_desc_r)
            status = quality

        collected.append({
            "candidate_id": cid,
            "uc_seq": uc_seq,
            "title_ko": c["title_ko"],
            "result_status": status,
            "ko_url": c["ko_url"],
            "en_url": c["en_url"],
            "ko_status": ko_status,
            "en_status": en_status,
            "identity_method": identity_method,
            "identity_confirmed": identity_confirmed,
            "has_identity_conflict": has_conflict,
            "ko_title": ko_title,
            "en_title": en_title,
            "en_description": en_desc_cleaned if status == "EN_USEFUL" else None,
            "en_description_raw": en_desc_r,
            "en_description_len": len(en_desc_cleaned) if en_desc_cleaned else 0,
            "en_description_preview": en_desc_cleaned[:120] if en_desc_cleaned else None,
            "image_ids": en_parsed.get("image_ids", []),
            "has_en_title": bool(en_title),
            "has_en_description": status == "EN_USEFUL",
            "parse_notes_ko": ko_parsed.get("parse_notes", []),
            "parse_notes_en": en_parsed.get("parse_notes", []),
        })

    # Write parsed results
    with open(FULL_PARSED_FILE, "w", encoding="utf-8") as f:
        for r in collected:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"  Parsed: {FULL_PARSED_FILE}")

    # ─────────────────────────────────────────────
    # PHASE 2: COLLECTION GATE CHECK
    # ─────────────────────────────────────────────
    print(f"\nPHASE 2: COLLECTION GATE CHECK")
    status_dist = Counter(r["result_status"] for r in collected)
    print(f"  Status distribution: {dict(status_dist)}")

    all_93_fetched        = len(collected) == 93
    zero_identity_conflict = status_dist.get("IDENTITY_CONFLICT", 0) == 0
    parse_failed_ok       = status_dist.get("PARSE_FAILED", 0) <= PARSE_FAIL_MAX

    gate_pass = all_93_fetched and zero_identity_conflict and parse_failed_ok

    print(f"  all_93_fetched: {all_93_fetched}")
    print(f"  zero_identity_conflict: {zero_identity_conflict}")
    print(f"  parse_failed ≤ {PARSE_FAIL_MAX}: {parse_failed_ok} ({status_dist.get('PARSE_FAILED', 0)}건)")
    print(f"  GATE: {'PASS' if gate_pass else 'FAIL'}")

    if not gate_pass:
        print("\nGATE FAIL — 반영 중단")
        completion_report = {
            "task": TASK_ID, "verdict": "FAIL", "run_ts": run_ts,
            "branch": branch, "head_before": head_before,
            "gate_result": {
                "all_93_fetched": all_93_fetched,
                "zero_identity_conflict": zero_identity_conflict,
                "parse_failed_ok": parse_failed_ok,
            },
            "status_distribution": dict(status_dist),
            "applied": False,
        }
        COMPLETION_REPORT.write_text(json.dumps(completion_report, ensure_ascii=False, indent=2), encoding="utf-8")
        sys.exit(1)

    # ─────────────────────────────────────────────
    # PHASE 3: APPLY
    # ─────────────────────────────────────────────
    print(f"\nPHASE 3: APPLY")
    collected_map = {r["candidate_id"]: r for r in collected}

    stats = {
        "name_en_applied": 0,
        "desc_en_applied": 0,
        "needs_translation_removed": 0,
        "needs_content_removed": 0,
        "ko_sf_created": 0,
        "en_sf_created": 0,
        "ko_sf_already_existed": 0,
        "en_sf_already_existed": 0,
        "validation_status_upgraded": 0,
        "parse_failed_skipped": 0,
        "conflict_skipped": 0,
        "en_no_content": 0,
    }

    new_sf_records: list[dict] = []
    new_ec_records: list[dict] = []

    with open(EC_FILE, encoding="utf-8-sig") as f:
        all_ec = [json.loads(line.strip()) for line in f]

    for ec in all_ec:
        cid = ec["candidate_id"]
        if cid not in collected_map:
            new_ec_records.append(ec)
            continue

        col = collected_map[cid]
        status = col["result_status"]
        uc_seq = col["uc_seq"]

        if status in ("PARSE_FAILED", "IDENTITY_CONFLICT"):
            if status == "PARSE_FAILED":
                stats["parse_failed_skipped"] += 1
            else:
                stats["conflict_skipped"] += 1
            new_ec_records.append(ec)
            continue

        pv   = ec.get("proposed_values", {})
        val  = ec.get("validation", {})
        ss   = ec.get("source_summary", {})
        flags = set(val.get("review_flags") or [])

        # Apply name_en (do not overwrite existing stronger value)
        en_title = col.get("en_title") or ""
        if en_title and not pv.get("name_en"):
            pv["name_en"] = en_title
            if "needs_translation" in flags:
                flags.discard("needs_translation")
                stats["needs_translation_removed"] += 1
            stats["name_en_applied"] += 1
        elif en_title and pv.get("name_en"):
            pass  # keep existing stronger value

        # Apply description_en (EN_USEFUL only)
        if status == "EN_USEFUL":
            desc_en = col.get("en_description") or ""
            if desc_en and not pv.get("description_en"):
                pv["description_en"] = desc_en
                if "needs_content" in flags:
                    flags.discard("needs_content")
                    stats["needs_content_removed"] += 1
                stats["desc_en_applied"] += 1
            elif desc_en and pv.get("description_en"):
                pass  # keep existing stronger value
        elif status == "EN_NO_CONTENT":
            stats["en_no_content"] += 1

        val["review_flags"] = sorted(flags)
        ec["proposed_values"] = pv
        ec["validation"] = val

        # Create KO source fact
        ko_sf_key = f"VisitBusanContent:experience:{uc_seq}:ko"
        if ko_sf_key not in existing_sf_keys:
            aa = ec.get("arrival_assessment", {})
            new_sf_records.append({
                "candidate_id": cid,
                "source_key": ko_sf_key,
                "source_provider": "visitbusan_web",
                "source_language": "ko",
                "title": col.get("ko_title") or ec.get("title_ko") or "",
                "description": None,
                "address": pv.get("address") or "",
                "district": ec.get("district") or pv.get("district") or "",
                "lat": str(aa.get("source_lat") or ""),
                "lng": str(aa.get("source_lng") or ""),
                "collected_at": run_ts,
                "source_url": col["ko_url"],
                "uc_seq": uc_seq,
                "vb_category": "experience",
                "collection_task": TASK_ID,
                "identity_evidence": "url_uc_seq_200ok",
            })
            existing_sf_keys.add(ko_sf_key)
            stats["ko_sf_created"] += 1
        else:
            stats["ko_sf_already_existed"] += 1

        # Create EN source fact (if EN page confirmed)
        if status not in ("PARSE_FAILED", "IDENTITY_CONFLICT") and col.get("en_status") == 200:
            en_sf_key = f"VisitBusanContent:experience:{uc_seq}:en"
            if en_sf_key not in existing_sf_keys:
                new_sf_records.append({
                    "candidate_id": cid,
                    "source_key": en_sf_key,
                    "source_provider": "visitbusan_web",
                    "source_language": "en",
                    "title": col.get("en_title") or "",
                    "description": col.get("en_description") if status == "EN_USEFUL" else None,
                    "address": None,
                    "district": ec.get("district") or pv.get("district") or "",
                    "lat": None,
                    "lng": None,
                    "collected_at": run_ts,
                    "source_url": col["en_url"],
                    "uc_seq": uc_seq,
                    "vb_category": "experience",
                    "collection_task": TASK_ID,
                    "result_status": status,
                    "image_ids": col.get("image_ids", []),
                    "identity_evidence": "url_uc_seq_200ok",
                })
                existing_sf_keys.add(en_sf_key)
                stats["en_sf_created"] += 1
            else:
                stats["en_sf_already_existed"] += 1

        # Upgrade validation_status
        # KO confirmed (status not PARSE_FAILED/CONFLICT) + EN page 200 → single_source
        old_vs = val.get("validation_status", "")
        if old_vs == "source_data_missing" and col.get("identity_confirmed"):
            val["validation_status"] = "single_source"
            # Update source_summary
            if ko_sf_key not in (ss.get("source_keys") or []):
                ss.setdefault("source_keys", []).append(ko_sf_key)
            ss["has_visitbusan_ko_source"] = True
            ec["source_summary"] = ss
            ec["validation"] = val
            stats["validation_status_upgraded"] += 1

        new_ec_records.append(ec)

    # ─────────────────────────────────────────────
    # PHASE 4: WRITE UPDATED FILES
    # ─────────────────────────────────────────────
    print(f"\nPHASE 4: WRITE UPDATED FILES")

    if len(new_ec_records) != 1642:
        print(f"ABORT: expected 1642 records, got {len(new_ec_records)}")
        sys.exit(1)

    with open(EC_FILE, "w", encoding="utf-8") as f:
        for r in new_ec_records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    ec_sha_after = sha256_file(EC_FILE)

    all_sf = existing_sf + new_sf_records
    with open(SF_FILE, "w", encoding="utf-8") as f:
        for r in all_sf:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    sf_sha_after = sha256_file(SF_FILE)

    print(f"  EC: 1642 records")
    print(f"  SF: {len(all_sf)} records (+{len(new_sf_records)} new)")
    print(f"  name_en applied: {stats['name_en_applied']}")
    print(f"  description_en applied: {stats['desc_en_applied']}")
    print(f"  needs_translation removed: {stats['needs_translation_removed']}")
    print(f"  needs_content removed: {stats['needs_content_removed']}")
    print(f"  KO SF created: {stats['ko_sf_created']}")
    print(f"  EN SF created: {stats['en_sf_created']}")
    print(f"  validation_status upgraded: {stats['validation_status_upgraded']}")

    # ─────────────────────────────────────────────
    # PHASE 5: EN_V5 PUBLISHABILITY
    # ─────────────────────────────────────────────
    print(f"\nPHASE 5: BUSAN_PUBLISHABILITY_EN_V5")

    # Reload env4 dist for delta
    env4_per_cid: dict[str, str] = {}
    with open(PROTECTED["env4_details"], encoding="utf-8") as f:
        for line in f:
            r = json.loads(line)
            env4_per_cid[r["candidate_id"]] = r["publishability_en_v4"]
    env4_dist = Counter(env4_per_cid.values())

    env5_dist = Counter()
    env5_details: list[dict] = []
    for r in new_ec_records:
        cid  = r["candidate_id"]
        eff  = get_effective_flags(r)
        gates = evaluate_en_gates_v5(r, eff)
        pub, blocks = determine_publishability_v5(gates, eff)
        env5_dist[pub] += 1
        env5_details.append({
            "candidate_id": cid,
            "category": r.get("category", "unknown"),
            "publishability_en_v5": pub,
            "block_reasons": blocks,
            "gate_version": GATE_VERSION_V5,
            "identity_gate": gates.get("identity_gate"),
            "description_en_gate": gates.get("description_en_gate"),
            "name_en_gate": gates.get("name_en_gate"),
            "validation_status": r.get("validation", {}).get("validation_status"),
        })

    delta_v4_v5 = {
        k: env5_dist.get(k, 0) - env4_dist.get(k, 0)
        for k in set(list(env4_dist.keys()) + list(env5_dist.keys()))
    }
    changes_v4_v5 = []
    for d in env5_details:
        v4 = env4_per_cid.get(d["candidate_id"], "unknown")
        v5 = d["publishability_en_v5"]
        if v4 != v5:
            changes_v4_v5.append({"candidate_id": d["candidate_id"], "env4": v4, "env5": v5})
    change_type_dist = Counter(f"{c['env4']}→{c['env5']}" for c in changes_v4_v5)

    exp_cids = {c["candidate_id"] for c in exp_candidates}
    kto_not_needed = sum(
        1 for c in changes_v4_v5
        if c["candidate_id"] in exp_cids
        and c["env4"] == "pending_source"
        and c["env5"] in ("publishable", "publishable_with_caveat")
    )

    with open(ENV5_DETAILS, "w", encoding="utf-8") as f:
        for r in env5_details:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    ENV5_SUMMARY.write_text(json.dumps({
        "report_id": "busan-publishability-en-v5",
        "gate_version": GATE_VERSION_V5,
        "task": TASK_ID, "run_ts": run_ts, "branch": branch,
        "total_candidates": len(new_ec_records),
        "publishability_distribution": dict(env5_dist),
        "env4_distribution": dict(env4_dist),
        "delta_vs_env4": delta_v4_v5,
        "status_changed_count": len(changes_v4_v5),
        "change_types": dict(change_type_dist),
        "kto_not_needed_upgrades": kto_not_needed,
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"  EN_V4: {dict(env4_dist)}")
    print(f"  EN_V5: {dict(env5_dist)}")
    print(f"  Δ:     {delta_v4_v5}")
    print(f"  Changes: {len(changes_v4_v5)}  Types: {dict(change_type_dist)}")
    print(f"  KTO 없이 승격: {kto_not_needed}")

    # ─────────────────────────────────────────────
    # PHASE 6: VALIDATION & REPORT
    # ─────────────────────────────────────────────
    print(f"\nPHASE 6: VALIDATION")
    protected_shas_after = {k: sha256_file(p) for k, p in PROTECTED.items()}
    protected_ok = all(protected_shas_before[k] == protected_shas_after[k] for k in PROTECTED)

    # Source fact duplicate check
    all_sf_keys = [r["source_key"] for r in all_sf]
    sf_dup_count = len(all_sf_keys) - len(set(all_sf_keys))

    checks = {
        "candidate_count_1642": len(new_ec_records) == 1642,
        "experience_target_93": n == 93,
        "zero_identity_conflict": zero_identity_conflict,
        "parse_failed_ok": parse_failed_ok,
        "source_fact_duplicates": sf_dup_count,
        "protected_files_unchanged": protected_ok,
        "external_requests": total_requests,
        "push": False,
    }

    verdict = "PASS" if (
        checks["candidate_count_1642"]
        and checks["zero_identity_conflict"]
        and checks["parse_failed_ok"]
        and sf_dup_count == 0
        and protected_ok
    ) else "FAIL"

    publishable_increase = env5_dist.get("publishable", 0) - env4_dist.get("publishable", 0)
    caveat_increase = env5_dist.get("publishable_with_caveat", 0) - env4_dist.get("publishable_with_caveat", 0)

    head_after = subprocess.check_output(["git", "log", "--oneline", "-1"], text=True).strip().split()[0]

    print(f"\n{'='*70}")
    print(f"VERDICT: {verdict}")
    print(f"Experience 93건 status: {dict(status_dist)}")
    print(f"name_en applied: {stats['name_en_applied']}")
    print(f"description_en applied: {stats['desc_en_applied']}")
    print(f"needs_translation removed: {stats['needs_translation_removed']}")
    print(f"needs_content removed: {stats['needs_content_removed']}")
    print(f"KO SF created: {stats['ko_sf_created']}  EN SF: {stats['en_sf_created']}")
    print(f"source_data_missing removed: {stats['validation_status_upgraded']}")
    print(f"publishable +{publishable_increase}  caveat +{caveat_increase}")
    print(f"KTO 없이 승격: {kto_not_needed}")
    print(f"SF duplicates: {sf_dup_count}")
    print(f"Protected: {'unchanged' if protected_ok else 'MODIFIED!'}")
    print(f"Requests: {total_requests}")
    print(f"Candidates: {len(new_ec_records)}")
    print(f"{'='*70}")

    completion_report = {
        "report_id": "visitbusan-experience-en-full-apply-v1-completion-report",
        "task": TASK_ID,
        "verdict": verdict,
        "run_ts": run_ts,
        "branch": branch,
        "head_before": head_before,
        "head_after": head_after,
        "experience_93_status_distribution": dict(status_dist),
        "applied": {
            "name_en_applied": stats["name_en_applied"],
            "description_en_applied": stats["desc_en_applied"],
            "needs_translation_removed": stats["needs_translation_removed"],
            "needs_content_removed": stats["needs_content_removed"],
            "ko_sf_created": stats["ko_sf_created"],
            "ko_sf_already_existed": stats["ko_sf_already_existed"],
            "en_sf_created": stats["en_sf_created"],
            "source_data_missing_removed": stats["validation_status_upgraded"],
            "validation_status_upgraded_to": "single_source",
            "kto_not_needed_upgrades": kto_not_needed,
            "en_no_content": stats["en_no_content"],
            "parse_failed_skipped": stats["parse_failed_skipped"],
            "conflict_skipped": stats["conflict_skipped"],
        },
        "publishability": {
            "env4_distribution": dict(env4_dist),
            "env5_distribution": dict(env5_dist),
            "delta": delta_v4_v5,
            "publishable_increase": publishable_increase,
            "caveat_increase": caveat_increase,
            "status_changed": len(changes_v4_v5),
            "change_types": dict(change_type_dist),
        },
        "file_shas": {
            "ec_before": ec_sha_before[:16],
            "ec_after": ec_sha_after[:16],
            "sf_before": sf_sha_before[:16],
            "sf_after": sf_sha_after[:16],
            "protected_unchanged": protected_ok,
            "sf_total_after": len(all_sf),
            "sf_new_records": len(new_sf_records),
        },
        "validation_checks": checks,
        "safety": {
            "external_requests": total_requests,
            "images_downloaded": False,
            "push": False,
            "candidate_count": len(new_ec_records),
            "sf_duplicates": sf_dup_count,
        },
        "commit_message_last_line": (
            "TASK-VISITBUSAN-EXPERIENCE-EN-FULL-APPLY-V1 완료 — "
            "VisitBusan 체험 93건의 영어 원천 전수 수집·검증·반영 완료."
        ),
    }
    COMPLETION_REPORT.write_text(json.dumps(completion_report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nCompletion report: {COMPLETION_REPORT}")
    return verdict


if __name__ == "__main__":
    v = main()
    sys.exit(0 if v == "PASS" else 1)
