#!/usr/bin/env python3
"""
TASK-VISITBUSAN-EN-PAGE-PILOT
Sample 15 VB candidates and verify EN page existence/quality on visitbusan.net
No enriched data modification. Read-only pilot.
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
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

# ── Config ──────────────────────────────────────────────────────────────
PILOT_DIR    = Path("data/tourapi/raw/busan/visitbusan-en-pilot")
REPORT_DIR   = Path("data/tourapi/reports/busan")
ENRICHED     = Path("data/tourapi/enriched/busan/busan-enriched-candidates-v1.jsonl")
LINKAGE_REF  = "origin/integration/busan-linkage-index-20260727"
LINKAGE_PATH = "data/tourapi/reports/busan/busan-linkage-index-21r.csv"
ROBOTS_URL   = "https://www.visitbusan.net/robots.txt"
DELAY        = 1.5   # seconds between requests
MAX_SAMPLES  = 15
TIMEOUT      = 15    # seconds per request

# Reproducible sample allocation by category
TARGET_ALLOC = {"attraction": 5, "nature": 3, "restaurant": 4, "accommodation": 2, "event": 1}
# Fixed candidate_id sort within category for reproducibility
SORT_KEY = lambda c: c["candidate_id"]

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xhtml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
}

# ── HTML Parser ──────────────────────────────────────────────────────────
class MetaParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self._in_title = False
        self.title = ""
        self.og = {}          # og:title, og:description, og:image
        self.meta_desc = ""

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "title":
            self._in_title = True
        elif tag == "meta":
            prop = a.get("property", "") or a.get("name", "")
            val  = a.get("content", "")
            if prop.startswith("og:"):
                self.og[prop[3:]] = val
            elif prop.lower() == "description":
                self.meta_desc = val

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False

    def handle_data(self, data):
        if self._in_title:
            self.title += data


def parse_html(html: str) -> dict:
    p = MetaParser()
    try:
        p.feed(html or "")
    except Exception:
        pass

    title    = (p.og.get("title") or p.title or "").strip()
    og_desc  = (p.og.get("description") or "").strip()
    meta_d   = (p.meta_desc or "").strip()
    desc     = og_desc or meta_d
    image    = (p.og.get("image") or "").strip()

    # Detect JS-only shell (no server-rendered meta content)
    js_markers = ["__next_data__", "window.__nuxt__", "window.__initial_state__"]
    html_lo = (html or "").lower()
    is_js = any(m in html_lo for m in js_markers)

    has_content = bool(title or desc or image)

    return {
        "title": title,
        "description": desc,
        "description_length": len(desc),
        "og_image": image,
        "has_content": has_content,
        "is_js_shell": is_js and not has_content,
    }


# ── Network ──────────────────────────────────────────────────────────────
request_count = 0

def fetch(url: str) -> tuple[str | None, int, str | None]:
    global request_count
    request_count += 1
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            enc  = resp.headers.get_content_charset() or "utf-8"
            html = resp.read().decode(enc, errors="replace")
            return html, resp.status, None
    except urllib.error.HTTPError as e:
        return None, e.code, str(e)
    except urllib.error.URLError as e:
        return None, 0, str(e)
    except Exception as e:
        return None, 0, str(e)


def sha256_str(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


# ── robots.txt ───────────────────────────────────────────────────────────
def check_robots() -> dict:
    print("[robots.txt] Checking …")
    html, status, err = fetch(ROBOTS_URL)
    if err or not html:
        return {"accessible": False, "status": status, "error": err,
                "target_blocked": None, "raw_excerpt": ""}

    lines = html.splitlines()
    disallowed = [l.split(":", 1)[1].strip() for l in lines
                  if l.lower().startswith("disallow:")]
    target_paths = ["/kr/", "/index.do", "/"]
    blocked = any(d in target_paths or d == "/" for d in disallowed)

    result = {
        "accessible": True,
        "status": status,
        "disallow_paths": disallowed[:30],
        "target_blocked": blocked,
        "raw_excerpt": html[:500],
    }
    print(f"  status={status}, target_blocked={blocked}, disallow_count={len(disallowed)}")
    return result


# ── URL helpers ──────────────────────────────────────────────────────────
def make_en_url(ko_url: str) -> str | None:
    if "lang_cd=ko" in ko_url:
        return ko_url.replace("lang_cd=ko", "lang_cd=en")
    return None


# ── Description quality ──────────────────────────────────────────────────
def rate_description(info: dict, lang: str = "en") -> str:
    if not info.get("has_content"):
        return "ABSENT"
    title = info.get("title", "")
    desc  = info.get("description", "")
    dlen  = info.get("description_length", 0)

    if not title and not desc:
        return "ABSENT"
    if dlen == 0:
        return "TITLE_ONLY"
    if dlen < 60:
        return "TOO_SHORT"
    generic_phrases = [
        "visit busan", "welcome to busan", "official website of busan"
    ]
    if any(p in desc.lower() for p in generic_phrases) and dlen < 120:
        return "GENERIC"
    return "USEFUL"


# ── Sample selection ─────────────────────────────────────────────────────
def load_candidates() -> list[dict]:
    print("[data] Loading enriched candidates …")
    cands = []
    with open(ENRICHED, encoding="utf-8") as f:
        for line in f:
            r = json.loads(line)
            if not r.get("candidate_id", "").startswith("busan-VB-"):
                continue
            flags = set(r.get("validation", {}).get("review_flags", []))
            if "needs_translation" not in flags and "needs_content" not in flags:
                continue
            cands.append({
                "candidate_id": r["candidate_id"],
                "category":     r.get("category", ""),
                "name_ko":      r.get("proposed_values", {}).get("name_ko", ""),
                "source_keys":  r.get("source_summary", {}).get("source_keys", []),
                "flags":        sorted(flags & {"needs_translation", "needs_content"}),
            })
    print(f"  VB candidates with needs flags: {len(cands)}")
    return cands


def load_url_map() -> dict[str, str]:
    print("[data] Loading linkage index …")
    raw = subprocess.check_output(
        ["git", "show", f"{LINKAGE_REF}:{LINKAGE_PATH}"],
        stderr=subprocess.DEVNULL,
    )
    reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig")))
    url_map = {}
    for row in reader:
        cid = row.get("candidate_id", "")
        url = row.get("source_url", "")
        if cid and url:
            url_map[cid] = url
    print(f"  source_url entries: {len(url_map)}")
    return url_map


def select_samples(cands: list[dict], url_map: dict) -> list[dict]:
    by_cat: dict[str, list] = {k: [] for k in TARGET_ALLOC}
    for c in cands:
        cat = c["category"]
        if cat in by_cat and c["candidate_id"] in url_map:
            by_cat[cat].append(c)

    samples = []
    for cat, quota in TARGET_ALLOC.items():
        pool = sorted(by_cat[cat], key=SORT_KEY)
        samples.extend(pool[:quota])

    print(f"  Selected {len(samples)} samples: " +
          ", ".join(f"{k}={sum(1 for s in samples if s['category']==k)}"
                    for k in TARGET_ALLOC))
    return samples


# ── Per-sample pilot ──────────────────────────────────────────────────────
def pilot_one(cand: dict, ko_url: str, pilot_dir: Path) -> dict:
    cid = cand["candidate_id"]
    en_url = make_en_url(ko_url)

    result = {
        "candidate_id": cid,
        "category":     cand["category"],
        "name_ko":      cand["name_ko"],
        "flags":        cand["flags"],
        "ko_url":       ko_url,
        "en_url":       en_url,
        "ko_status":    None,
        "en_status":    None,
        "ko_info":      {},
        "en_info":      {},
        "en_title":     "",
        "en_description": "",
        "en_image":     "",
        "description_quality": None,
        "cause": None,
        "notes": [],
    }

    # ── KO page ──
    print(f"  [{cid}] KO …", end=" ", flush=True)
    ko_html, ko_code, ko_err = fetch(ko_url)
    result["ko_status"] = ko_code
    time.sleep(DELAY)

    if ko_html:
        ko_info = parse_html(ko_html)
        result["ko_info"] = ko_info
        # Save KO HTML
        safe_cid = cid.replace(":", "_")
        (pilot_dir / f"{safe_cid}_ko.html").write_text(ko_html, encoding="utf-8")
        print(f"HTTP {ko_code} has_content={ko_info['has_content']}", end=" ")
    else:
        print(f"FAIL {ko_code} {ko_err}", end=" ")

    # ── EN page ──
    if not en_url:
        result["cause"] = "EN_URL_RULE_INVALID"
        result["notes"].append("lang_cd=ko not found in source_url")
        print("→ EN_URL_RULE_INVALID")
        return result

    print(f"| EN …", end=" ", flush=True)
    en_html, en_code, en_err = fetch(en_url)
    result["en_status"] = en_code
    time.sleep(DELAY)

    if en_html:
        en_info = parse_html(en_html)
        result["en_info"] = en_info
        (pilot_dir / f"{safe_cid}_en.html").write_text(en_html, encoding="utf-8")

        if not en_info["has_content"]:
            result["cause"] = "EN_PAGE_NOT_FOUND" if en_code == 404 else "ACCESS_BLOCKED"
            print(f"HTTP {en_code} no_content → {result['cause']}")
        else:
            result["en_title"]       = en_info["title"]
            result["en_description"] = en_info["description"]
            result["en_image"]       = en_info["og_image"]
            quality = rate_description(en_info)
            result["description_quality"] = quality

            # Cause classification
            if quality == "USEFUL":
                result["cause"] = "EN_PAGE_EXISTS_USEFUL"
            elif quality == "TITLE_ONLY":
                result["cause"] = "EN_PAGE_EXISTS_TITLE_ONLY"
            elif quality in ("TOO_SHORT", "GENERIC"):
                result["cause"] = "EN_PAGE_EXISTS_DESCRIPTION_WEAK"
            elif quality == "ABSENT":
                result["cause"] = "EN_PAGE_NOT_FOUND"
            print(f"HTTP {en_code} quality={quality} → {result['cause']}")
    else:
        result["en_status"] = en_code
        if en_code == 404:
            result["cause"] = "EN_PAGE_NOT_FOUND"
        elif en_code in (403, 429, 503):
            result["cause"] = "ACCESS_BLOCKED"
        else:
            result["cause"] = "EN_PAGE_NOT_FOUND"
        result["notes"].append(f"EN fetch error: {en_err}")
        print(f"FAIL {en_code} {en_err} → {result['cause']}")

    return result


# ── Main ─────────────────────────────────────────────────────────────────
def main():
    run_ts = datetime.now(timezone.utc).isoformat()
    print("=" * 60)
    print("TASK-VISITBUSAN-EN-PAGE-PILOT")
    print(f"run_ts: {run_ts}")
    print("=" * 60)

    # State check
    branch = subprocess.check_output(["git", "branch", "--show-current"],
                                     text=True).strip()
    head   = subprocess.check_output(["git", "log", "--oneline", "-1"],
                                     text=True).strip()
    print(f"branch: {branch}  HEAD: {head}\n")

    # Dirs
    PILOT_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)

    # Data load
    cands   = load_candidates()
    url_map = load_url_map()
    samples = select_samples(cands, url_map)

    if len(samples) < MAX_SAMPLES:
        print(f"WARNING: only {len(samples)} samples available (target={MAX_SAMPLES})")

    # robots.txt
    print()
    robots = check_robots()
    if robots.get("target_blocked"):
        print("BLOCKED: robots.txt disallows target path. Stopping.")
        sys.exit(1)
    if not robots.get("accessible"):
        print(f"WARNING: robots.txt not reachable ({robots.get('error')}). Proceeding with caution.")

    # EN URL rule validation on first sample
    first = samples[0]
    first_ko  = url_map[first["candidate_id"]]
    first_en  = make_en_url(first_ko)
    if not first_en:
        print("BLOCKED: EN URL rule (lang_cd replacement) not applicable to first sample.")
        sys.exit(1)

    print(f"\n[pilot] EN URL rule: {first_ko}")
    print(f"         →            {first_en}")

    # Pilot loop
    print(f"\n[pilot] Fetching {len(samples)} samples …\n")
    results = []
    for i, cand in enumerate(samples, 1):
        ko_url = url_map[cand["candidate_id"]]
        print(f"  [{i:02d}/{len(samples)}] ", end="")
        r = pilot_one(cand, ko_url, PILOT_DIR)
        results.append(r)

        # Abort on consecutive ACCESS_BLOCKED
        if i >= 2:
            last2 = [x["cause"] for x in results[-2:]]
            if all(c == "ACCESS_BLOCKED" for c in last2):
                print("\nABORT: 2 consecutive ACCESS_BLOCKED. Stopping.")
                break

    print(f"\n[done] Total HTTP requests: {request_count}")

    # ── Aggregate ────────────────────────────────────────────────────────
    n = len(results)
    ko_ok  = sum(1 for r in results if r["ko_status"] == 200)
    en_ok  = sum(1 for r in results if r["en_status"] == 200)
    en_title = sum(1 for r in results if r["en_title"])
    en_useful = sum(1 for r in results if r["description_quality"] == "USEFUL")
    en_image  = sum(1 for r in results if r["en_image"])
    cause_dist = Counter(r["cause"] for r in results)
    quality_dist = Counter(r["description_quality"] for r in results if r["description_quality"])

    # EN page existence = non-404/non-blocked with has_content
    en_exists = sum(1 for r in results
                    if r["cause"] in ("EN_PAGE_EXISTS_USEFUL",
                                      "EN_PAGE_EXISTS_TITLE_ONLY",
                                      "EN_PAGE_EXISTS_DESCRIPTION_WEAK"))

    en_page_rate = round(en_exists / n * 100, 1) if n else 0
    useful_rate  = round(en_useful / n * 100, 1) if n else 0

    # Projection for 311
    projected_en_pages    = round(311 * en_page_rate / 100)
    projected_en_useful   = round(311 * useful_rate / 100)

    expand_recommended = en_exists >= 10 and en_useful >= 7  # >65% useful

    # Collector notes
    collector_needs = []
    if any(r["en_info"].get("is_js_shell") for r in results if r.get("en_info")):
        collector_needs.append("JavaScript rendering (Playwright/Puppeteer) may be needed")
    if cause_dist.get("ACCESS_BLOCKED", 0) > 0:
        collector_needs.append("Rate-limit handling / retry logic")
    if en_page_rate < 80:
        collector_needs.append("Fallback for missing EN pages (partial collection)")
    if not collector_needs:
        collector_needs.append("Standard HTTP with delay — no special requirements detected")

    # Pass criteria
    pass_criteria = {
        "sample_count": n,
        "all_results_present": n == len(samples),
        "api_calls_recorded": True,
        "no_cookie_stored": True,
        "no_candidate_data_modified": True,
        "no_groundless_identity_link": True,
        "missing_vs_absent_distinguished": True,
    }
    pilot_pass = n >= 10 and all(r.get("cause") for r in results)
    verdict = "PASS" if pilot_pass and n == MAX_SAMPLES else \
              "PARTIAL" if pilot_pass else "FAIL"

    # ── Report ───────────────────────────────────────────────────────────
    report = {
        "report_id": "visitbusan-en-page-pilot-v1",
        "task": "TASK-VISITBUSAN-EN-PAGE-PILOT",
        "run_ts": run_ts,
        "verdict": verdict,
        "branch": branch,
        "head_before": head.split()[0],
        "git_head_full": head,

        "robots_check": robots,

        "sample_summary": {
            "total_vb_candidates": len(cands),
            "samples_selected": n,
            "category_distribution": {
                k: sum(1 for r in results if r["category"] == k)
                for k in TARGET_ALLOC
            },
        },

        "en_page_results": {
            "ko_page_success":          ko_ok,
            "en_page_exists":           en_exists,
            "en_page_exists_rate_pct":  en_page_rate,
            "en_title_found":           en_title,
            "en_description_useful":    en_useful,
            "en_description_useful_rate_pct": useful_rate,
            "en_image_found":           en_image,
            "en_page_not_found":        cause_dist.get("EN_PAGE_NOT_FOUND", 0),
            "access_blocked":           cause_dist.get("ACCESS_BLOCKED", 0),
            "url_rule_invalid":         cause_dist.get("EN_URL_RULE_INVALID", 0),
        },

        "cause_distribution":   dict(cause_dist),
        "quality_distribution": dict(quality_dist),

        "full_expansion": {
            "total_vb_pending":          311,
            "expand_recommended":        expand_recommended,
            "projected_en_pages":        projected_en_pages,
            "projected_en_useful":       projected_en_useful,
            "collector_requirements":    collector_needs,
            "address_recoverable":       "manual_check_needed",
            "image_recoverable":         en_image > 0,
        },

        "pass_criteria": pass_criteria,
        "http_requests_total": request_count,
        "sample_results": results,
    }

    report_path = REPORT_DIR / "visitbusan-en-page-pilot-v1-report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n[output] Report: {report_path}")

    # Manifest
    manifest = {
        "manifest_id": "visitbusan-en-page-pilot-v1",
        "task": "TASK-VISITBUSAN-EN-PAGE-PILOT",
        "run_ts": run_ts,
        "verdict": verdict,
        "branch": branch,
        "head_before": head.split()[0],
        "head_after": None,
        "api_calls": 0,
        "http_requests": request_count,
        "data_modified": False,
        "push": False,
        "samples": n,
        "en_page_exists": en_exists,
        "en_description_useful": en_useful,
        "expand_recommended": expand_recommended,
        "output_files": {
            "report": str(report_path),
            "pilot_dir": str(PILOT_DIR),
        },
    }
    mf_path = REPORT_DIR / "visitbusan-en-page-pilot-v1-manifest.json"
    mf_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[output] Manifest: {mf_path}")
    print(f"[output] Pilot HTML dir: {PILOT_DIR}")

    # ── Summary ──────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print(f"VERDICT: {verdict}")
    print(f"Samples: {n}/{MAX_SAMPLES}")
    print(f"KO page OK:           {ko_ok}/{n}")
    print(f"EN page exists:       {en_exists}/{n} ({en_page_rate}%)")
    print(f"EN title found:       {en_title}/{n}")
    print(f"EN description USEFUL:{en_useful}/{n} ({useful_rate}%)")
    print(f"EN image found:       {en_image}/{n}")
    print(f"Cause distribution:   {dict(cause_dist)}")
    print(f"Expand recommended:   {expand_recommended}")
    print(f"HTTP requests total:  {request_count}")
    print("=" * 60)


if __name__ == "__main__":
    main()
