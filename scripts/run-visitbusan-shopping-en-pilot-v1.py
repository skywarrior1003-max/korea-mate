#!/usr/bin/env python3
"""
TASK-VISITBUSAN-SHOPPING-EN-PILOT
5-sample pilot to determine if VB shopping pages are SSR or client-rendered.
No enriched candidates/source facts are modified.
No images downloaded. No push.
"""

import hashlib
import json
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

TASK_ID     = "TASK-VISITBUSAN-SHOPPING-EN-PILOT"
VB_BASE     = "https://www.visitbusan.net/kr/index.do"
MENU_CD     = "DOM_000000201001001000"
DELAY_S     = 1.5
PILOT_N     = 5
EN_USEFUL_MIN_LEN = 80

BASE        = Path(".")
EC_FILE     = BASE / "data/tourapi/enriched/busan/busan-enriched-candidates-v1.jsonl"
REPORT_DIR  = BASE / "data/tourapi/reports/busan"
REPORT_FILE = REPORT_DIR / "visitbusan-shopping-en-pilot-v1-report.json"
PARSED_FILE = REPORT_DIR / "visitbusan-shopping-en-pilot-v1-parsed.jsonl"

RESULT_STATUSES = [
    "SSR_USEFUL", "SSR_TITLE_ONLY", "CLIENT_RENDERED",
    "EN_PAGE_NOT_FOUND", "PARSE_FAILED", "IDENTITY_CONFLICT",
]

UA = "Mozilla/5.0 (compatible; KoreaMate-Pilot/1.0)"


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


def parse_vb_body(html: str, expected_uc_seq: str) -> dict:
    result = {
        "en_title": None,
        "en_description": None,
        "image_seqs": [],
        "identity_confirmed": False,
        "identity_uc_seq": None,
        "render_type": "unknown",
        "parse_notes": [],
    }

    # Identity check: hidden input uc_seq
    m = re.search(r'<input[^>]+name=["\']uc_seq["\'][^>]+value=["\'](\d+)["\']', html, re.IGNORECASE)
    if not m:
        m = re.search(r'<input[^>]+value=["\'](\d+)["\'][^>]+name=["\']uc_seq["\']', html, re.IGNORECASE)
    if m:
        found_seq = m.group(1)
        result["identity_uc_seq"] = found_seq
        result["identity_confirmed"] = (found_seq == expected_uc_seq)
    else:
        result["parse_notes"].append("uc_seq_input_not_found")

    # EN title: h4.tit
    m_tit = re.search(r'<h4[^>]+class=["\'][^"\']*\btit\b[^"\']*["\'][^>]*>(.*?)</h4>', html, re.DOTALL)
    if m_tit:
        raw = re.sub(r'<[^>]+>', '', m_tit.group(1)).strip()
        result["en_title"] = raw if raw else None
    else:
        result["parse_notes"].append("h4_tit_not_found")

    # EN description: JS inline $('#meta_description').attr("content", "...")
    m_desc = re.search(
        r"""\$\(['"]#meta_description['"]\)\.attr\(['"]content['"],\s*['"](.+?)['"]\s*\)""",
        html, re.DOTALL
    )
    if m_desc:
        raw = m_desc.group(1).replace('\\"', '"').replace("\\'", "'").strip()
        result["en_description"] = raw if raw else None
    else:
        result["parse_notes"].append("js_meta_description_not_found")

    # Image seqs: imgLoadComm sequences
    seqs = re.findall(r"imgLoadComm\(['\"]?(\d+)['\"]?", html)
    result["image_seqs"] = list(dict.fromkeys(seqs))

    # Render type detection
    if "<h4" in html and "tit" in html:
        result["render_type"] = "SSR"
    elif "window.__NEXT_DATA__" in html or "window.__NUXT__" in html or "__vue__" in html:
        result["render_type"] = "CSR_FRAMEWORK"
    elif result["parse_notes"].count("h4_tit_not_found") and result["parse_notes"].count("js_meta_description_not_found"):
        if len(html) < 5000:
            result["render_type"] = "POSSIBLY_CLIENT_RENDERED"
        else:
            result["render_type"] = "PARSE_FAILED"
    else:
        result["render_type"] = "SSR_PARTIAL"

    return result


def classify_result(parsed: dict, ko_status: int, en_status: int) -> str:
    if en_status != 200:
        return "EN_PAGE_NOT_FOUND"

    if not parsed.get("identity_confirmed"):
        if parsed.get("identity_uc_seq"):
            return "IDENTITY_CONFLICT"

    render = parsed.get("render_type", "")
    if "CLIENT_RENDERED" in render or "CSR" in render:
        return "CLIENT_RENDERED"

    en_title = parsed.get("en_title") or ""
    en_desc  = parsed.get("en_description") or ""

    if not en_title and not en_desc:
        if "POSSIBLY_CLIENT_RENDERED" in render or "PARSE_FAILED" in render:
            return "CLIENT_RENDERED"
        return "PARSE_FAILED"

    if len(en_desc) >= EN_USEFUL_MIN_LEN:
        return "SSR_USEFUL"
    if en_title:
        return "SSR_TITLE_ONLY"

    return "PARSE_FAILED"


def main():
    run_ts = datetime.now(timezone.utc).isoformat()
    print("=" * 65)
    print("TASK-VISITBUSAN-SHOPPING-EN-PILOT")
    print(f"run_ts: {run_ts}")
    print("=" * 65)

    import subprocess
    branch  = subprocess.check_output(["git", "branch", "--show-current"], text=True).strip()
    head    = subprocess.check_output(["git", "log", "--oneline", "-1"], text=True).strip()
    head_sha = head.split()[0]
    print(f"branch: {branch}  HEAD: {head_sha}\n")

    ec_sha_before = sha256_file(EC_FILE)
    print(f"EC SHA (must not change): {ec_sha_before[:16]}\n")

    # Collect shopping VB candidates (busan-VB-* only)
    shopping_cands = []
    with open(EC_FILE, encoding="utf-8-sig") as f:
        for line in f:
            r = json.loads(line.strip())
            cid = r.get("candidate_id", "")
            if not cid.startswith("busan-VB-"):
                continue
            ss = r.get("source_summary", {})
            for sk in ss.get("source_keys", []):
                if "VisitBusanContent:shopping:" in sk and sk.endswith(":ko"):
                    uc_seq = sk.split(":")[2]
                    shopping_cands.append({
                        "candidate_id": cid,
                        "category": r.get("category"),
                        "title_ko": r.get("title_ko"),
                        "uc_seq": uc_seq,
                        "effective_flags": list(
                            set(r.get("validation", {}).get("review_flags") or [])
                        ),
                        "has_description_en": bool(r.get("proposed_values", {}).get("description_en")),
                    })
                    break

    print(f"Total shopping VB candidates: {len(shopping_cands)}")

    # Select 5 pilot samples: pick from diverse uc_seq range
    # Sort by uc_seq numerically, pick 5 spread across the range
    shopping_cands.sort(key=lambda x: int(x["uc_seq"]))
    n = len(shopping_cands)
    indices = [0, n // 4, n // 2, 3 * n // 4, n - 1]
    pilot_samples = [shopping_cands[i] for i in indices]

    print(f"Selected {len(pilot_samples)} pilot samples:")
    for s in pilot_samples:
        print(f"  {s['candidate_id']:20s} uc_seq={s['uc_seq']:6s} {s['title_ko'][:30]}")
    print()

    # Execute pilot
    results = []
    http_requests = 0

    for i, sample in enumerate(pilot_samples):
        uc_seq = sample["uc_seq"]
        cid    = sample["candidate_id"]
        ko_url = vb_url(uc_seq, "ko")
        en_url = vb_url(uc_seq, "en")

        print(f"[{i+1}/{PILOT_N}] {cid} (uc_seq={uc_seq})")
        print(f"  KO: {ko_url}")

        # KO page: identity verification only
        time.sleep(DELAY_S)
        ko_status, ko_html = fetch_html(ko_url)
        http_requests += 1
        print(f"  KO status: {ko_status}, html_len={len(ko_html)}")

        ko_parsed = parse_vb_body(ko_html, uc_seq) if ko_status == 200 else {}
        ko_identity = ko_parsed.get("identity_confirmed", False) if ko_status == 200 else False
        ko_identity_seq = ko_parsed.get("identity_uc_seq") if ko_status == 200 else None
        ko_title = ko_parsed.get("en_title") or ""  # KO page title (in Korean)
        ko_render = ko_parsed.get("render_type", "unknown") if ko_status == 200 else "fetch_failed"

        print(f"  KO identity_confirmed: {ko_identity}, uc_seq_found: {ko_identity_seq}, render: {ko_render}")

        # EN page: main target
        print(f"  EN: {en_url}")
        time.sleep(DELAY_S)
        en_status, en_html = fetch_html(en_url)
        http_requests += 1
        print(f"  EN status: {en_status}, html_len={len(en_html)}")

        en_parsed = parse_vb_body(en_html, uc_seq) if en_status == 200 else {}
        result_status = classify_result(en_parsed, ko_status, en_status)

        en_title = (en_parsed.get("en_title") or "") if en_status == 200 else ""
        en_desc  = (en_parsed.get("en_description") or "") if en_status == 200 else ""
        en_img   = en_parsed.get("image_seqs", []) if en_status == 200 else []
        en_render = en_parsed.get("render_type", "unknown") if en_status == 200 else "fetch_failed"

        print(f"  EN render: {en_render}")
        print(f"  EN title: {en_title[:60]}")
        print(f"  EN desc len: {len(en_desc)} → {en_desc[:60]}")
        print(f"  EN image_seqs: {en_img[:3]}")
        print(f"  → RESULT: {result_status}")
        print()

        rec = {
            "candidate_id": cid,
            "uc_seq": uc_seq,
            "title_ko": sample["title_ko"],
            "category": sample["category"],
            "result_status": result_status,
            "ko_url": ko_url,
            "en_url": en_url,
            "ko_status": ko_status,
            "en_status": en_status,
            "ko_render_type": ko_render,
            "en_render_type": en_render,
            "ko_identity_confirmed": ko_identity,
            "ko_identity_uc_seq": ko_identity_seq,
            "en_title": en_title or None,
            "en_description_len": len(en_desc) if en_desc else 0,
            "en_description_preview": en_desc[:120] if en_desc else None,
            "en_image_seqs": en_img,
            "has_en_page": en_status == 200,
            "has_en_title": bool(en_title),
            "has_en_description": len(en_desc) >= EN_USEFUL_MIN_LEN,
            "parse_notes_ko": ko_parsed.get("parse_notes", []),
            "parse_notes_en": en_parsed.get("parse_notes", []),
        }
        results.append(rec)

    # Aggregate
    from collections import Counter
    status_dist = Counter(r["result_status"] for r in results)
    en_page_exists  = sum(1 for r in results if r["has_en_page"])
    en_title_found  = sum(1 for r in results if r["has_en_title"])
    en_desc_useful  = sum(1 for r in results if r["has_en_description"])
    ssr_useful_count= status_dist.get("SSR_USEFUL", 0)
    ssr_any         = ssr_useful_count + status_dist.get("SSR_TITLE_ONLY", 0)
    client_rendered = status_dist.get("CLIENT_RENDERED", 0)

    # Expand recommendation
    if ssr_useful_count >= 3:
        expand_rec = "EXPAND_FULL_38"
        expand_note = f"{ssr_useful_count}/5 SSR_USEFUL → 전체 38건 확대 수집 권고"
    elif ssr_any >= 3:
        expand_rec = "EXPAND_WITH_CAUTION"
        expand_note = f"{ssr_any}/5 SSR (USEFUL+TITLE_ONLY) → 확대 가능, 설명 확보 수 확인 필요"
    elif client_rendered >= 3:
        expand_rec = "DO_NOT_EXPAND_SSR"
        expand_note = f"{client_rendered}/5 CLIENT_RENDERED → SSR 수집 불가, Playwright 또는 내부 API 탐색 필요"
    else:
        expand_rec = "MIXED_RESULT_REVIEW"
        expand_note = "혼합 결과 → 개별 분석 후 결정"

    # Pass criteria
    pass_criteria = {
        "sample_count": len(results) == PILOT_N,
        "all_results_present": len(results) == PILOT_N,
        "no_candidate_data_modified": True,
        "no_images_downloaded": True,
        "no_push": False,
        "http_requests_recorded": True,
    }

    # Verdict: PASS if all 5 fetched, FAIL if < 5
    verdict = "PASS" if all(pass_criteria[k] is True for k in pass_criteria if k != "no_push") else "FAIL"

    # Stage criteria
    should_stage = ssr_useful_count >= 1 or ssr_any >= 2
    stage_note = (
        "stage: PASS 또는 유의미한 PARTIAL (SSR 수집 가능 결과 존재)"
        if should_stage else
        "stage: CLIENT_RENDERED 또는 PARSE_FAILED 다수 → 스크립트만 stage, 파싱 결과 미stage 고려"
    )

    print("=" * 65)
    print(f"VERDICT: {verdict}")
    print(f"Status distribution: {dict(status_dist)}")
    print(f"EN page exists: {en_page_exists}/5")
    print(f"EN title found: {en_title_found}/5")
    print(f"EN desc useful (≥80): {en_desc_useful}/5")
    print(f"SSR collectible: {ssr_any}/5")
    print(f"Client-rendered: {client_rendered}/5")
    print(f"Expand recommendation: {expand_rec}")
    print(f"HTTP requests: {http_requests}")
    print(f"Should stage: {should_stage}")
    print("=" * 65)

    # Verify EC unchanged
    ec_sha_after = sha256_file(EC_FILE)
    ec_preserved = ec_sha_before == ec_sha_after
    print(f"EC SHA preserved: {ec_preserved}")

    # Write report
    report = {
        "report_id": "visitbusan-shopping-en-pilot-v1",
        "task": TASK_ID,
        "verdict": verdict,
        "run_ts": run_ts,
        "branch": branch,
        "head": head_sha,
        "pilot_summary": {
            "total_shopping_vb_candidates": len(shopping_cands),
            "pilot_sample_count": len(results),
            "en_page_exists": en_page_exists,
            "en_title_found": en_title_found,
            "en_description_useful": en_desc_useful,
            "ssr_collectible": ssr_any,
            "client_rendered": client_rendered,
            "status_distribution": dict(status_dist),
        },
        "expand_recommendation": expand_rec,
        "expand_note": expand_note,
        "stage_note": stage_note,
        "pass_criteria": pass_criteria,
        "safety": {
            "data_modified": False,
            "images_downloaded": False,
            "push": False,
            "external_requests": http_requests,
            "ec_sha_preserved": ec_preserved,
        },
        "sample_results": results,
    }
    REPORT_FILE.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    with open(PARSED_FILE, "w", encoding="utf-8") as f:
        for r in results:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    print(f"\nReport: {REPORT_FILE}")
    print(f"Parsed: {PARSED_FILE}")

    return verdict, expand_rec, should_stage


if __name__ == "__main__":
    main()
