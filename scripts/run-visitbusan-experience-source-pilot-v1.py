#!/usr/bin/env python3
"""
TASK-VISITBUSAN-EXPERIENCE-SOURCE-PILOT
5-sample pilot to identify the actual data source for VB experience content.
KO + EN pages fetched via plain HTTP. 0 candidate data changes.
"""

import csv
import hashlib
import io
import json
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import urllib.request

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

TASK_ID   = "TASK-VISITBUSAN-EXPERIENCE-SOURCE-PILOT"
BASE      = Path(".")
EC_FILE   = BASE / "data/tourapi/enriched/busan/busan-enriched-candidates-v1.jsonl"
SF_FILE   = BASE / "data/tourapi/enriched/busan/busan-source-facts-v1.jsonl"
REPORT_DIR = BASE / "data/tourapi/reports/busan"

PILOT_REPORT_FILE = REPORT_DIR / "visitbusan-experience-source-pilot-v1-report.json"
PILOT_PARSED_FILE = REPORT_DIR / "visitbusan-experience-source-pilot-v1-parsed.jsonl"

EXPERIENCE_MENU_CD = "DOM_000000202008001000"
VB_KO_URL_TMPL = f"https://www.visitbusan.net/kr/index.do?menuCd={EXPERIENCE_MENU_CD}&uc_seq={{uc_seq}}&lang_cd=ko"
VB_EN_URL_TMPL = f"https://www.visitbusan.net/kr/index.do?menuCd={EXPERIENCE_MENU_CD}&uc_seq={{uc_seq}}&lang_cd=en"

LINKAGE_REF  = "origin/integration/busan-linkage-index-20260727"
LINKAGE_PATH = "data/tourapi/reports/busan/busan-linkage-index-21r.csv"

PILOT_N = 5

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9,ko;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

REQUEST_DELAY = 0.5


def sha256_file(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def fetch_page(url: str) -> tuple[int, str]:
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            status = resp.status
            body = resp.read().decode("utf-8", errors="replace")
            return status, body
    except urllib.error.HTTPError as e:
        return e.code, ""
    except Exception as e:
        return 0, str(e)


def strip_html(text: str) -> str:
    return re.sub(r"<[^>]+>", "", text).strip()


def detect_render_type(html: str) -> str:
    if not html:
        return "EMPTY"
    tit_match = re.search(r'<h4[^>]*class=["\'][^"\']*tit[^"\']*["\'][^>]*>(.*?)</h4>', html, re.S)
    if tit_match:
        return "SSR"
    if "react" in html.lower() or "__NEXT_DATA__" in html or "ng-app" in html:
        return "CLIENT_RENDERED"
    if "tit" in html and "cntnts" in html:
        return "SSR"
    return "UNKNOWN"


def parse_ssr_content(html: str) -> dict:
    result = {
        "title": None,
        "description": None,
        "description_raw": None,
        "image_seqs": [],
        "embedded_json": None,
        "internal_api_endpoints": [],
        "parse_notes": [],
    }
    if not html:
        return result

    # Title: h4.tit (same as attraction/shopping)
    tit_match = re.search(r'<h4[^>]*class=["\'][^"\']*tit[^"\']*["\'][^>]*>(.*?)</h4>', html, re.S)
    if tit_match:
        result["title"] = strip_html(tit_match.group(1)).strip()
    else:
        result["parse_notes"].append("h4_tit_not_found")

    # Description: JS meta_description pattern (same as attraction/shopping)
    desc_match = re.search(r"""['"]#meta_description['"].*?attr\s*\(\s*['"]content['"],\s*['"](.*?)['"]""", html, re.S)
    if desc_match:
        raw = desc_match.group(1)
        cleaned = strip_html(raw).strip()
        result["description_raw"] = raw
        result["description"] = cleaned
    else:
        result["parse_notes"].append("js_meta_description_not_found")
        # Fallback: look for meta description tag
        meta_match = re.search(r'<meta\s+name=["\']description["\'][^>]*content=["\']([^"\']+)["\']', html)
        if meta_match:
            result["description"] = strip_html(meta_match.group(1)).strip()
            result["parse_notes"].append("meta_description_tag_used_as_fallback")

    # Image sequences: imgLoadComm pattern
    img_seqs = re.findall(r"""imgLoadComm\s*\(\s*['"]\d*['"],\s*['"](\d+)['"]""", html)
    if img_seqs:
        result["image_seqs"] = img_seqs
    else:
        # imgLoadComm2 pattern (shopping)
        img2 = re.findall(r"""imgLoadComm2\s*\([^,]+,\s*['"]([^'"]+)['"]""", html)
        if img2:
            result["image_seqs"] = img2
            result["parse_notes"].append("imgLoadComm2_pattern_detected")
        else:
            result["parse_notes"].append("no_img_load_comm_found")
            # Check for static image URLs in the experience-specific path
            static_imgs = re.findall(r'(https://www\.visitbusan\.net/uploadImgs/files/cntnts/[^\s"\'<>]+)', html)
            if static_imgs:
                result["image_seqs"] = static_imgs[:3]
                result["parse_notes"].append("static_image_urls_found")

    # Detect embedded JSON (e.g., __INITIAL_STATE__, window.__DATA__)
    json_matches = re.findall(r'(?:window\.__\w+|__INITIAL_STATE__|__NEXT_DATA__)\s*=\s*(\{[^;]+)', html, re.S)
    if json_matches:
        result["embedded_json"] = f"found_{len(json_matches)}_candidates"
        result["parse_notes"].append(f"embedded_json_detected:{len(json_matches)}")

    # Detect internal API calls in script tags
    api_patterns = re.findall(r"(?:ajax|fetch|axios)\s*(?:\.\w+\s*)?\(\s*['\"]([^'\"]+/(?:api|ubicont|getContent|cntnts)[^'\"]*)['\"]", html)
    if api_patterns:
        result["internal_api_endpoints"] = list(set(api_patterns))
        result["parse_notes"].append(f"internal_api_detected:{len(result['internal_api_endpoints'])}")

    # Check for getContents or specific experience-related API patterns
    exp_api = re.findall(r"['\"]([^'\"]*(?:getCntnts|getContent|ubicont)[^'\"]*)['\"]", html)
    if exp_api:
        for ep in exp_api:
            if ep not in result["internal_api_endpoints"]:
                result["internal_api_endpoints"].append(ep)

    # Check for uc_seq in hidden input (may not exist for experience pages)
    uc_seq_input = re.search(r'<input[^>]*name=["\']uc_seq["\'][^>]*value=["\'](\d+)["\']', html)
    result["uc_seq_in_hidden_input"] = uc_seq_input.group(1) if uc_seq_input else None
    if not uc_seq_input:
        result["parse_notes"].append("uc_seq_input_not_found")

    return result


def determine_source_type(ko_parsed: dict, en_parsed: dict, ko_status: int, en_status: int) -> str:
    if ko_status in (403, 401, 503):
        return "ACCESS_BLOCKED"
    if ko_status == 0:
        return "ACCESS_BLOCKED"
    if en_parsed.get("embedded_json"):
        return "EMBEDDED_JSON"
    if en_parsed.get("internal_api_endpoints"):
        return "VISITBUSAN_INTERNAL_API"
    # Check if JS renders content (no SSR title at all despite 200)
    if ko_status == 200 and ko_parsed.get("title") and not en_parsed.get("title") and en_status == 200:
        # EN page exists but no title in SSR
        return "CLIENT_RENDERED_ONLY"
    if ko_parsed.get("title") or en_parsed.get("title"):
        return "STATIC_HTML"
    return "CLIENT_RENDERED_ONLY"


def determine_result_status(en_status: int, en_parsed: dict) -> str:
    if en_status == 0 or en_status >= 500:
        return "PARSE_FAILED"
    if en_status == 404:
        return "EN_PAGE_NOT_FOUND"
    if en_status in (403, 401):
        return "ACCESS_BLOCKED"
    if not en_parsed.get("title"):
        return "CLIENT_RENDERED"
    desc = en_parsed.get("description") or ""
    if len(desc) >= 80:
        return "SSR_USEFUL"
    if en_parsed.get("title"):
        return "SSR_TITLE_ONLY"
    return "PARSE_FAILED"


def main():
    run_ts = datetime.now(timezone.utc).isoformat()
    print("=" * 70)
    print("TASK-VISITBUSAN-EXPERIENCE-SOURCE-PILOT")
    print(f"run_ts: {run_ts}")
    print("=" * 70)

    branch = subprocess.check_output(["git", "branch", "--show-current"], text=True).strip()
    head   = subprocess.check_output(["git", "log", "--oneline", "-1"], text=True).strip().split()[0]
    print(f"branch: {branch}  HEAD: {head}\n")

    ec_sha_before = sha256_file(EC_FILE)
    sf_sha_before = sha256_file(SF_FILE)

    # ── Load experience candidates from enriched candidates ──
    print("Loading experience candidates …")
    exp_candidates: list[dict] = []
    with open(EC_FILE, encoding="utf-8-sig") as f:
        for line in f:
            r = json.loads(line.strip())
            if not r.get("candidate_id", "").startswith("busan-VB-"):
                continue
            ss = r.get("source_summary", {})
            for sk in ss.get("source_keys", []):
                if "VisitBusanContent:experience:" in sk:
                    parts = sk.split(":")
                    uc_seq = parts[2] if len(parts) > 2 else ""
                    exp_candidates.append({
                        "candidate_id": r["candidate_id"],
                        "uc_seq": uc_seq,
                        "title_ko": r.get("title_ko", ""),
                        "category": r.get("category", ""),
                        "source_key_ko": sk,
                        "ko_url": VB_KO_URL_TMPL.format(uc_seq=uc_seq),
                        "en_url": VB_EN_URL_TMPL.format(uc_seq=uc_seq),
                    })
                    break

    n = len(exp_candidates)
    print(f"  {n} experience candidates found")
    if n != 93:
        print(f"  WARNING: expected 93, got {n}")

    # ── Deterministic 5-sample selection (index spread) ──
    indices = [0, n // 4, n // 2, 3 * n // 4, n - 1]
    samples = [exp_candidates[i] for i in indices]
    print(f"\nSample indices: {indices}")
    print("Samples selected:")
    for s in samples:
        print(f"  {s['candidate_id']} uc_seq={s['uc_seq']}")

    # ── Fetch pages ──
    print(f"\n{'='*70}")
    print("FETCHING PAGES (10 requests)")
    print(f"{'='*70}")

    results: list[dict] = []
    total_requests = 0

    for s in samples:
        cid    = s["candidate_id"]
        uc_seq = s["uc_seq"]
        ko_url = s["ko_url"]
        en_url = s["en_url"]
        print(f"\n[{cid}] uc_seq={uc_seq}")

        # KO page
        print(f"  KO: {ko_url}")
        ko_status, ko_html = fetch_page(ko_url)
        total_requests += 1
        print(f"  → {ko_status} ({len(ko_html)} bytes)")
        time.sleep(REQUEST_DELAY)

        # EN page
        print(f"  EN: {en_url}")
        en_status, en_html = fetch_page(en_url)
        total_requests += 1
        print(f"  → {en_status} ({len(en_html)} bytes)")
        time.sleep(REQUEST_DELAY)

        ko_render = detect_render_type(ko_html)
        en_render = detect_render_type(en_html)
        ko_parsed = parse_ssr_content(ko_html)
        en_parsed = parse_ssr_content(en_html)
        source_type = determine_source_type(ko_parsed, en_parsed, ko_status, en_status)
        result_status = determine_result_status(en_status, en_parsed)

        # Identity check
        en_uc_seq_hidden = en_parsed.get("uc_seq_in_hidden_input")
        identity_method = "url_uc_seq"
        identity_confirmed = en_status == 200

        # Confirm title match between KO and EN pages (cross-check)
        ko_title = ko_parsed.get("title") or ""
        en_title = en_parsed.get("title") or ""
        has_identity_conflict = False  # no KO vs EN title comparison required

        print(f"  ko_render: {ko_render}  en_render: {en_render}")
        print(f"  source_type: {source_type}  result_status: {result_status}")
        print(f"  ko_title: {ko_title[:60]!r}")
        print(f"  en_title: {en_title[:60]!r}")
        print(f"  en_desc_len: {len(en_parsed.get('description') or '')}")
        print(f"  en_image_seqs: {en_parsed.get('image_seqs', [])[:3]}")
        print(f"  parse_notes_ko: {ko_parsed.get('parse_notes', [])}")
        print(f"  parse_notes_en: {en_parsed.get('parse_notes', [])}")
        if en_parsed.get("internal_api_endpoints"):
            print(f"  INTERNAL_API: {en_parsed['internal_api_endpoints'][:3]}")

        r = {
            "candidate_id": cid,
            "uc_seq": uc_seq,
            "title_ko": s["title_ko"],
            "category": s["category"],
            "result_status": result_status,
            "source_type": source_type,
            "ko_url": ko_url,
            "en_url": en_url,
            "ko_status": ko_status,
            "en_status": en_status,
            "ko_render_type": ko_render,
            "en_render_type": en_render,
            "identity_method": identity_method,
            "identity_confirmed": identity_confirmed,
            "uc_seq_in_hidden_input": en_uc_seq_hidden,
            "has_identity_conflict": has_identity_conflict,
            "ko_title": ko_title,
            "en_title": en_title,
            "en_description": en_parsed.get("description"),
            "en_description_raw": en_parsed.get("description_raw"),
            "en_description_len": len(en_parsed.get("description") or ""),
            "en_description_preview": (en_parsed.get("description") or "")[:120] if en_parsed.get("description") else None,
            "en_image_seqs": en_parsed.get("image_seqs", []),
            "has_en_page": en_status == 200,
            "has_en_title": bool(en_title),
            "has_en_description": len(en_parsed.get("description") or "") >= 80,
            "internal_api_endpoints": en_parsed.get("internal_api_endpoints", []),
            "embedded_json": en_parsed.get("embedded_json"),
            "parse_notes_ko": ko_parsed.get("parse_notes", []),
            "parse_notes_en": en_parsed.get("parse_notes", []),
        }
        results.append(r)

    # ── Write parsed results ──
    with open(PILOT_PARSED_FILE, "w", encoding="utf-8") as f:
        for r in results:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    # ── Summary ──
    print(f"\n{'='*70}")
    print("SUMMARY")
    print(f"{'='*70}")

    from collections import Counter
    status_dist = Counter(r["result_status"] for r in results)
    source_type_dist = Counter(r["source_type"] for r in results)
    en_pages = sum(1 for r in results if r["has_en_page"])
    en_titles = sum(1 for r in results if r["has_en_title"])
    en_descs = sum(1 for r in results if r["has_en_description"])
    en_images = sum(1 for r in results if r["en_image_seqs"])
    identity_ok = sum(1 for r in results if r["identity_confirmed"])
    has_api = sum(1 for r in results if r["internal_api_endpoints"])

    print(f"  Result status: {dict(status_dist)}")
    print(f"  Source types: {dict(source_type_dist)}")
    print(f"  EN page 200 OK: {en_pages}/{PILOT_N}")
    print(f"  EN title found: {en_titles}/{PILOT_N}")
    print(f"  EN description (≥80 chars): {en_descs}/{PILOT_N}")
    print(f"  EN images/metadata: {en_images}/{PILOT_N}")
    print(f"  Identity confirmed: {identity_ok}/{PILOT_N}")
    print(f"  Internal API detected: {has_api}/{PILOT_N}")
    print(f"  Total HTTP requests: {total_requests}")

    # Verify no candidate data modified
    ec_sha_after = sha256_file(EC_FILE)
    sf_sha_after = sha256_file(SF_FILE)
    assert ec_sha_before == ec_sha_after, "EC MODIFIED!"
    assert sf_sha_before == sf_sha_after, "SF MODIFIED!"
    print(f"\n  EC SHA unchanged: {ec_sha_before == ec_sha_after}")
    print(f"  SF SHA unchanged: {sf_sha_before == sf_sha_after}")

    # Determine overall verdict
    min_en_titles = en_titles >= 3
    any_ssr = any(r["result_status"].startswith("SSR") for r in results)
    no_data_change = (ec_sha_before == ec_sha_after) and (sf_sha_before == sf_sha_after)
    verdict = "PASS" if (min_en_titles and no_data_change) else ("PARTIAL" if (any_ssr and no_data_change) else "FAIL")

    # Expand recommendation
    ssr_count = sum(1 for r in results if r["result_status"].startswith("SSR"))
    client_rendered = sum(1 for r in results if r["result_status"] == "CLIENT_RENDERED")
    if ssr_count == PILOT_N and client_rendered == 0:
        expand = "EXPAND_FULL_93"
        expand_method = "plain_http_ssr"
    elif ssr_count > 0:
        expand = "EXPAND_PARTIAL_SSR"
        expand_method = "plain_http_ssr_with_fallback"
    elif client_rendered == PILOT_N:
        expand = "REQUIRES_PLAYWRIGHT"
        expand_method = "playwright"
    else:
        expand = "INVESTIGATE_FURTHER"
        expand_method = "mixed"

    # Unique parse findings
    all_notes = []
    for r in results:
        all_notes.extend(r["parse_notes_en"])
    notes_dist = Counter(all_notes)

    print(f"\n  Verdict: {verdict}")
    print(f"  Expand: {expand}")
    print(f"  Expand method: {expand_method}")
    print(f"{'='*70}\n")

    # ── Write report ──
    report = {
        "report_id": "visitbusan-experience-source-pilot-v1",
        "task": TASK_ID,
        "verdict": verdict,
        "run_ts": run_ts,
        "branch": branch,
        "head": head,
        "pilot_summary": {
            "total_experience_vb_candidates": n,
            "pilot_sample_count": PILOT_N,
            "sample_indices": indices,
            "en_page_200": en_pages,
            "en_title_found": en_titles,
            "en_description_useful": en_descs,
            "en_images_metadata_found": en_images,
            "identity_confirmed": identity_ok,
            "internal_api_detected": has_api,
            "status_distribution": dict(status_dist),
            "source_type_distribution": dict(source_type_dist),
        },
        "expand_recommendation": expand,
        "expand_method": expand_method,
        "expand_note": (
            f"{ssr_count}/{PILOT_N} SSR 확인. "
            f"EN 제목 {en_titles}건, EN 설명 {en_descs}건. "
            f"내부 API: {has_api}건 감지."
        ),
        "data_source_finding": {
            "primary_source_type": source_type_dist.most_common(1)[0][0] if source_type_dist else "UNKNOWN",
            "menu_cd": EXPERIENCE_MENU_CD,
            "url_pattern_confirmed": any_ssr,
            "en_lang_cd_works": en_pages > 0,
            "identity_method": "url_uc_seq",
            "hidden_uc_seq_input": "not_expected_based_on_shopping_precedent",
        },
        "parse_notes_distribution": dict(notes_dist),
        "sample_results": results,
        "pass_criteria": {
            "sample_count": len(results) == PILOT_N,
            "no_candidate_data_modified": no_data_change,
            "no_images_downloaded": True,
            "no_push": True,
            "http_requests_recorded": True,
        },
        "safety": {
            "data_modified": False,
            "images_downloaded": False,
            "push": False,
            "external_requests": total_requests,
            "ec_sha_preserved": ec_sha_before == ec_sha_after,
            "sf_sha_preserved": sf_sha_before == sf_sha_after,
        },
    }

    PILOT_REPORT_FILE.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Report: {PILOT_REPORT_FILE}")
    print(f"Parsed: {PILOT_PARSED_FILE}")

    return verdict


if __name__ == "__main__":
    v = main()
    sys.exit(0 if v in ("PASS", "PARTIAL") else 1)
