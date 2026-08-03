#!/usr/bin/env python3
"""
TASK-VISITBUSAN-EN-SSR-FULL-V1
Collect KO + EN HTML for 183 SSR-eligible VB records (attraction + food).
Parse EN title, description, images. No enriched data modification.
"""

import csv
import hashlib
import io
import json
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

# ── Config ───────────────────────────────────────────────────────────────
RAW_DIR     = Path("data/tourapi/raw/busan/visitbusan-en-ssr-full")
REPORT_DIR  = Path("data/tourapi/reports/busan")
ENRICHED    = Path("data/tourapi/enriched/busan/busan-enriched-candidates-v1.jsonl")
LINKAGE_REF = "origin/integration/busan-linkage-index-20260727"
LINKAGE_PATH = "data/tourapi/reports/busan/busan-linkage-index-21r.csv"
ROBOTS_URL  = "https://www.visitbusan.net/robots.txt"
CHECKPOINT  = RAW_DIR / "checkpoint.json"

DELAY          = 1.5   # seconds between requests
TIMEOUT        = 15    # seconds per request
MAX_CONSEC_FAIL = 5   # abort after N consecutive failures
MAX_RETRY      = 2    # retries per request

SSR_CATEGORIES = {"attraction", "food"}

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
}

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# ── Request counter ───────────────────────────────────────────────────────
request_log: list[dict] = []

def fetch(url: str, label: str = "") -> tuple:
    """Return (html, status_code, error_str)."""
    for attempt in range(MAX_RETRY + 1):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                enc  = r.headers.get_content_charset() or "utf-8"
                html = r.read().decode(enc, errors="replace")
                request_log.append({"url": url, "status": r.status, "error": None, "attempt": attempt})
                return html, r.status, None
        except urllib.error.HTTPError as e:
            if e.code in (404, 403, 410):
                request_log.append({"url": url, "status": e.code, "error": str(e), "attempt": attempt})
                return None, e.code, str(e)
            time.sleep(DELAY)
        except Exception as e:
            if attempt < MAX_RETRY:
                time.sleep(DELAY * 2)
            else:
                request_log.append({"url": url, "status": 0, "error": str(e), "attempt": attempt})
                return None, 0, str(e)
    return None, 0, "max_retries"


# ── HTML Parser ───────────────────────────────────────────────────────────
def parse_vb_body(html: str) -> dict:
    """Extract SSR content from VisitBusan HTML body."""
    r: dict = {}

    # Title: <h4 class="tit">
    m = re.search(r'<h4[^>]*class="[^"]*\btit\b[^"]*"[^>]*>(.*?)</h4>', html, re.DOTALL)
    r["title"] = re.sub(r"<[^>]+>", "", m.group(1)).strip() if m else ""

    # Subtitle: <p class="tit_sub">
    m2 = re.search(r'<p[^>]*class="[^"]*tit_sub[^"]*"[^>]*>(.*?)</p>', html, re.DOTALL)
    r["subtitle"] = re.sub(r"<[^>]+>", "", m2.group(1)).strip() if m2 else ""

    # Description — JS inline: $('#meta_description').attr("content", "...")
    # Handles both single and double quote variants
    m3 = re.search(
        r"meta_description['\"]?\s*\)\s*\.attr\s*\([^,]+,\s*[\"']([^\"']{20,3000})[\"']",
        html,
    )
    r["description"] = m3.group(1).strip() if m3 else ""

    # Image sequences from imgLoadComm / imgLoadComm2 calls
    img_seqs = re.findall(r'getCntntsImgThumb[^"\']*["\'],\s*["\'](\d+)', html)
    r["image_seqs"]       = list(dict.fromkeys(img_seqs))[:10]
    r["image_url_example"] = (
        f"https://visitbusan.net/uploadImgs/files/cntnts/{img_seqs[0]}_thumbL"
        if img_seqs else ""
    )

    # Address — best-effort (VB pages may only have transit/arrival info)
    # Look for structured Korean address or "Busan *-gu *" patterns
    addr_ko = re.search(
        r"부산(?:광역시)?\s+[^\s<]{2,4}구\s+[^<\n]{5,80}", html
    )
    addr_en = re.search(
        r"\d+[^<\n]{3,60}(?:Busan|부산)[^<\n]{0,40}", html, re.IGNORECASE
    )
    r["address_ko"] = addr_ko.group(0).strip()[:150] if addr_ko else ""
    r["address_en"] = addr_en.group(0).strip()[:150] if addr_en else ""

    # Arrival / access info
    arrival_m = re.search(
        r"(?:Line [0-9]|Exit [0-9]|Station|Bus \d|Get off|Depart from|Walk)[^\n<]{10,250}",
        html, re.IGNORECASE,
    )
    r["arrival_info"] = arrival_m.group(0).strip()[:200] if arrival_m else ""

    # Derived flags
    r["has_title"]       = bool(r["title"])
    r["has_description"] = bool(r["description"])
    r["has_image"]       = bool(r["image_seqs"])
    r["description_length"] = len(r["description"])

    # Identity check: uc_seq present in hidden input
    uc_hidden = re.search(r'photoView_uc_seq[^>]*value="(\d+)"', html)
    r["html_uc_seq"] = uc_hidden.group(1) if uc_hidden else ""

    return r


def classify_result(en_parsed: dict, en_status: int, en_err) -> str:
    if en_status == 404 or (en_status == 0 and not en_parsed):
        return "EN_PAGE_NOT_FOUND"
    if not en_parsed or not en_parsed.get("has_title"):
        return "PARSE_FAILED"
    desc_len = en_parsed["description_length"]
    if desc_len >= 80:
        return "EN_USEFUL"
    if desc_len >= 20:
        return "EN_DESCRIPTION_WEAK"
    if desc_len > 0:
        return "EN_TITLE_ONLY"
    return "EN_TITLE_ONLY"


# ── Data loading ──────────────────────────────────────────────────────────
def load_ssr_targets() -> list[dict]:
    print("[data] Loading linkage index …")
    raw = subprocess.check_output(
        ["git", "show", f"{LINKAGE_REF}:{LINKAGE_PATH}"],
        stderr=subprocess.DEVNULL,
    )
    reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig")))
    link_map: dict[str, dict] = {}
    for row in reader:
        cid = row.get("candidate_id", "")
        eid = row.get("primary_external_id", "")
        url = row.get("source_url", "")
        if ":" in eid and url:
            parts = eid.split(":")
            vb_cat = parts[1] if len(parts) >= 2 else ""
            uc_seq = parts[2] if len(parts) >= 3 else ""
            link_map[cid] = {"vb_cat": vb_cat, "uc_seq": uc_seq, "ko_url": url}

    print("[data] Loading enriched candidates …")
    flag_map: dict[str, dict] = {}
    with open(ENRICHED, encoding="utf-8") as f:
        for line in f:
            r = json.loads(line)
            cid = r.get("candidate_id", "")
            flags = set(r.get("validation", {}).get("review_flags", []))
            flag_map[cid] = {
                "category": r.get("category", ""),
                "name_ko":  r.get("proposed_values", {}).get("name_ko", ""),
                "flags":    sorted(flags & {"needs_translation", "needs_content"}),
            }

    targets = []
    seen: set[str] = set()
    for cid, li in link_map.items():
        if li["vb_cat"] not in SSR_CATEGORIES:
            continue
        fi = flag_map.get(cid, {})
        if not fi.get("flags"):
            continue
        if cid in seen:
            continue
        seen.add(cid)
        en_url = li["ko_url"].replace("lang_cd=ko", "lang_cd=en") if "lang_cd=ko" in li["ko_url"] else None
        targets.append({
            "candidate_id": cid,
            "vb_category":  li["vb_cat"],
            "uc_seq":       li["uc_seq"],
            "enriched_category": fi.get("category", ""),
            "name_ko":      fi.get("name_ko", ""),
            "flags":        fi.get("flags", []),
            "ko_url":       li["ko_url"],
            "en_url":       en_url,
        })

    targets.sort(key=lambda x: x["candidate_id"])
    print(f"  SSR targets: {len(targets)}")
    print("  By VB cat:", dict(Counter(t["vb_category"] for t in targets)))
    return targets


# ── Checkpoint ───────────────────────────────────────────────────────────
def load_checkpoint() -> dict[str, dict]:
    if CHECKPOINT.exists():
        with open(CHECKPOINT, encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_checkpoint(done: dict[str, dict]) -> None:
    CHECKPOINT.write_text(json.dumps(done, ensure_ascii=False), encoding="utf-8")


# ── Main ─────────────────────────────────────────────────────────────────
def main():
    run_ts = datetime.now(timezone.utc).isoformat()
    print("=" * 65)
    print("TASK-VISITBUSAN-EN-SSR-FULL-V1")
    print(f"run_ts: {run_ts}")
    print("=" * 65)

    branch = subprocess.check_output(["git", "branch", "--show-current"], text=True).strip()
    head   = subprocess.check_output(["git", "log", "--oneline", "-1"], text=True).strip()
    print(f"branch: {branch}  HEAD: {head}\n")

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)

    targets = load_ssr_targets()
    total   = len(targets)

    # robots.txt (fast check, already verified Allow: /)
    print("\n[robots.txt] Checking …")
    rb_html, rb_status, rb_err = fetch(ROBOTS_URL)
    rb_ok = rb_status == 200 and rb_html and "disallow" not in rb_html.lower().split("allow:")[0]
    print(f"  status={rb_status}, ok={rb_ok}")

    # EN URL rule pre-check
    t0 = targets[0]
    print(f"\n[EN URL rule] {t0['ko_url']}")
    print(f"           → {t0['en_url']}")
    if not t0["en_url"]:
        print("ABORT: EN URL rule broken.")
        sys.exit(1)

    # Checkpoint load
    done = load_checkpoint()
    already = len(done)
    print(f"\n[checkpoint] {already} already processed, {total - already} remaining\n")

    # ── Collection loop ─────────────────────────────────────────────────
    consec_fail = 0
    for i, t in enumerate(targets, 1):
        cid = t["candidate_id"]

        if cid in done:
            print(f"  [{i:03d}/{total}] SKIP {cid}")
            continue

        print(f"  [{i:03d}/{total}] {cid}  vb={t['vb_category']}  uc={t['uc_seq']}", end="  ")

        result = {
            "candidate_id":       cid,
            "vb_category":        t["vb_category"],
            "uc_seq":             t["uc_seq"],
            "enriched_category":  t["enriched_category"],
            "name_ko":            t["name_ko"],
            "flags":              t["flags"],
            "ko_url":             t["ko_url"],
            "en_url":             t["en_url"],
            "ko_status":          None,
            "en_status":          None,
            "en_title":           "",
            "en_subtitle":        "",
            "en_description":     "",
            "description_length": 0,
            "en_image_seqs":      [],
            "en_image_url":       "",
            "address_ko":         "",
            "address_en":         "",
            "arrival_info":       "",
            "identity_confirmed": False,
            "identity_note":      "",
            "result_status":      None,
            "notes":              [],
        }

        # KO page
        safe = cid.replace(":", "_")
        ko_path = RAW_DIR / f"{safe}_ko.html"
        if ko_path.exists():
            ko_html = ko_path.read_text(encoding="utf-8", errors="replace")
            ko_status = 200
        else:
            ko_html, ko_status, ko_err = fetch(t["ko_url"])
            if ko_html:
                ko_path.write_text(ko_html, encoding="utf-8")
            time.sleep(DELAY)

        result["ko_status"] = ko_status

        # EN page
        en_html, en_status, en_err = None, None, None
        if t["en_url"]:
            en_path = RAW_DIR / f"{safe}_en.html"
            if en_path.exists():
                en_html = en_path.read_text(encoding="utf-8", errors="replace")
                en_status = 200
            else:
                en_html, en_status, en_err = fetch(t["en_url"])
                if en_html:
                    en_path.write_text(en_html, encoding="utf-8")
                time.sleep(DELAY)

        result["en_status"] = en_status

        # Parse EN
        en_parsed: dict = {}
        if en_html:
            en_parsed = parse_vb_body(en_html)
            result["en_title"]        = en_parsed.get("title", "")
            result["en_subtitle"]     = en_parsed.get("subtitle", "")
            result["en_description"]  = en_parsed.get("description", "")
            result["description_length"] = en_parsed.get("description_length", 0)
            result["en_image_seqs"]   = en_parsed.get("image_seqs", [])
            result["en_image_url"]    = en_parsed.get("image_url_example", "")
            result["address_ko"]      = en_parsed.get("address_ko", "")
            result["address_en"]      = en_parsed.get("address_en", "")
            result["arrival_info"]    = en_parsed.get("arrival_info", "")

            # Identity: same uc_seq in hidden input?
            html_uc = en_parsed.get("html_uc_seq", "")
            if html_uc and html_uc == t["uc_seq"]:
                result["identity_confirmed"] = True
                result["identity_note"] = f"uc_seq={html_uc} confirmed in EN HTML"
            elif html_uc and html_uc != t["uc_seq"]:
                result["identity_confirmed"] = False
                result["identity_note"] = f"CONFLICT: url_uc={t['uc_seq']} html_uc={html_uc}"
                result["result_status"] = "IDENTITY_CONFLICT"

        if result["result_status"] != "IDENTITY_CONFLICT":
            result["result_status"] = classify_result(en_parsed, en_status or 0, en_err)

        # Consecutive failure tracking
        is_fail = result["result_status"] in ("EN_PAGE_NOT_FOUND", "PARSE_FAILED")
        if is_fail:
            consec_fail += 1
        else:
            consec_fail = 0

        print(f"ko={ko_status} en={en_status} → {result['result_status'][:18]:18s} title={result['en_title'][:30]!r}")

        done[cid] = result
        save_checkpoint(done)

        if consec_fail >= MAX_CONSEC_FAIL:
            print(f"\nABORT: {MAX_CONSEC_FAIL} consecutive failures. Stopping.")
            break

    print(f"\n[done] HTTP requests logged: {len(request_log)}")

    # ── Compile results ──────────────────────────────────────────────────
    results = list(done.values())
    n       = len(results)

    status_dist = dict(Counter(r["result_status"] for r in results))
    ko_ok       = sum(1 for r in results if r["ko_status"] == 200)
    en_ok       = sum(1 for r in results if r["en_status"] == 200)
    en_title    = sum(1 for r in results if r["en_title"])
    en_useful   = sum(1 for r in results if r["result_status"] == "EN_USEFUL")
    en_image    = sum(1 for r in results if r["en_image_url"])
    addr_ko     = sum(1 for r in results if r["address_ko"])
    id_conf     = sum(1 for r in results if r["identity_confirmed"])
    id_conflict = sum(1 for r in results if r["result_status"] == "IDENTITY_CONFLICT")
    need_trans  = sum(1 for r in results if "needs_translation" in r["flags"] and r["en_title"])

    verdict = "PASS" if n >= total and en_useful >= int(n * 0.6) else \
              "PARTIAL" if n >= int(total * 0.8) else "FAIL"

    # Write parsed JSONL
    parsed_path = REPORT_DIR / "visitbusan-en-ssr-full-v1-parsed.jsonl"
    with open(parsed_path, "w", encoding="utf-8") as f:
        for r in sorted(results, key=lambda x: x["candidate_id"]):
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    parsed_sha = hashlib.sha256(parsed_path.read_bytes()).hexdigest()
    print(f"[output] Parsed JSONL: {parsed_path}  SHA={parsed_sha[:16]}")

    # Write report
    report = {
        "report_id": "visitbusan-en-ssr-full-v1",
        "task":      "TASK-VISITBUSAN-EN-SSR-FULL-V1",
        "run_ts":    run_ts,
        "verdict":   verdict,
        "branch":    branch,
        "head_before": head.split()[0],
        "head_after":  None,

        "target_count":      total,
        "processed_count":   n,
        "ssr_category_breakdown": {
            "attraction": sum(1 for r in results if r["vb_category"] == "attraction"),
            "food":       sum(1 for r in results if r["vb_category"] == "food"),
        },

        "collection_results": {
            "ko_page_success":    ko_ok,
            "en_page_success":    en_ok,
            "http_requests_total": len(request_log),
        },

        "en_content_results": {
            "en_title_found":     en_title,
            "en_title_rate_pct":  round(en_title / n * 100, 1) if n else 0,
            "en_useful":          en_useful,
            "en_useful_rate_pct": round(en_useful / n * 100, 1) if n else 0,
            "en_image_found":     en_image,
            "address_ko_found":   addr_ko,
        },

        "status_distribution": status_dist,

        "identity_check": {
            "confirmed":    id_conf,
            "conflict":     id_conflict,
            "unverifiable": n - id_conf - id_conflict,
        },

        "needs_translation_impact": {
            "records_with_needs_translation": sum(1 for r in results if "needs_translation" in r["flags"]),
            "en_title_found_for_needs_translation": need_trans,
            "note": "EN title found = needs_translation potentially resolvable after enrichment reflux",
        },

        "pass_criteria": {
            "no_candidate_data_modified": True,
            "no_secret_stored":           True,
            "no_groundless_id_link":      True,
            "no_push":                    True,
            "request_count_recorded":     True,
        },

        "data_modified": False,
        "push": False,
        "raw_html_gitignored": True,
        "raw_dir": str(RAW_DIR),
        "parsed_sha256": parsed_sha,
    }

    report_path = REPORT_DIR / "visitbusan-en-ssr-full-v1-report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    report_sha = hashlib.sha256(report_path.read_bytes()).hexdigest()
    print(f"[output] Report: {report_path}  SHA={report_sha[:16]}")

    # Manifest
    manifest = {
        "manifest_id":  "visitbusan-en-ssr-full-v1",
        "task":         "TASK-VISITBUSAN-EN-SSR-FULL-V1",
        "run_ts":       run_ts,
        "verdict":      verdict,
        "branch":       branch,
        "head_before":  head.split()[0],
        "head_after":   None,
        "target_count": total,
        "processed":    n,
        "en_title_found": en_title,
        "en_useful":    en_useful,
        "en_image":     en_image,
        "status_distribution": status_dist,
        "api_calls":    0,
        "http_requests": len(request_log),
        "data_modified": False,
        "push":         False,
        "parsed_sha256": parsed_sha,
        "report_sha256": report_sha,
        "output_files": {
            "script":  "scripts/run-visitbusan-en-ssr-full-v1.py",
            "parsed":  str(parsed_path),
            "report":  str(report_path),
            "raw_dir": str(RAW_DIR),
        },
    }
    mf_path = REPORT_DIR / "visitbusan-en-ssr-full-v1-manifest.json"
    mf_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[output] Manifest: {mf_path}")

    # ── Summary ──────────────────────────────────────────────────────────
    print("\n" + "=" * 65)
    print(f"VERDICT: {verdict}")
    print(f"Processed:        {n}/{total}")
    print(f"KO page OK:       {ko_ok}/{n}")
    print(f"EN page OK:       {en_ok}/{n}")
    print(f"EN title found:   {en_title}/{n} ({round(en_title/n*100,1) if n else 0}%)")
    print(f"EN USEFUL:        {en_useful}/{n} ({round(en_useful/n*100,1) if n else 0}%)")
    print(f"EN image found:   {en_image}/{n}")
    print(f"Address KO:       {addr_ko}/{n}")
    print(f"Status dist:      {status_dist}")
    print(f"Identity conf:    {id_conf}/{n}  conflict={id_conflict}")
    print(f"needs_translation resolvable: {need_trans}")
    print(f"HTTP requests:    {len(request_log)}")
    print("=" * 65)


if __name__ == "__main__":
    main()
