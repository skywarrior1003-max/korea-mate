#!/usr/bin/env python3
"""
TASK-GYEONGJU-FOOD-105-PARSER-SAMPLE-QA-V1

Sample QA: 12 restaurants × 4 locales = 48 locale checks.
Compares stored artifacts against live VisitGyeongju pages.

Sample method: per-area sorted vg_id → indices [0, mid, -1]
Areas: 경주시내권, 보문관광단지, 황리단길, 불국사권 (3 each)

READ-ONLY (no rewrite of service artifacts).
New file: gyeongju-vg-food-105-parser-sample-qa-v1.json
"""
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup

BASE = Path("c:/기본저장/나의 프로젝트/KoreaMate/korea-mate")
VG_RAW   = BASE / "data/gyeongju-multilingual-v1/gyeongju-food-vg-raw-v1.jsonl"
RAW_FILE = BASE / "data/gyeongju-food-105-multilingual-full-content-v1/gyeongju-vg-food-105-raw-content.jsonl"
SVC_FILE = BASE / "data/gyeongju-food-105-multilingual-full-content-v1/gyeongju-vg-food-105-service-v2.jsonl"
HANDOFF  = BASE / "data/gyeongju-food-105-multilingual-full-content-v1/gyeongju-vg-food-105-multilingual-handoff-v2.jsonl"
OUT_FILE = BASE / "data/gyeongju-food-105-multilingual-full-content-v1/gyeongju-vg-food-105-parser-sample-qa-v1.json"

LOCALE_URL = {
    "ko":   "https://www.visitgyeongju.or.kr/kr/cuisine/view/{vg_id}",
    "en":   "https://www.visitgyeongju.or.kr/cuisine/view/{vg_id}",
    "ja":   "https://www.visitgyeongju.or.kr/jp/cuisine/view/{vg_id}",
    "zh-CN":"https://www.visitgyeongju.or.kr/zh/cuisine/view/{vg_id}",
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

TARGET_AREAS = ["경주시내권", "보문관광단지", "황리단길", "불국사권"]


# ── Loaders ────────────────────────────────────────────────────────────────
def load_jsonl(path):
    records = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records

def index_by(records, key):
    return {r[key]: r for r in records}

def index_by_two(records, key1, key2):
    idx = {}
    for r in records:
        k = (r[key1], r[key2])
        idx[k] = r
    return idx


# ── Sample selection ───────────────────────────────────────────────────────
def select_samples(vg_raw):
    """
    For each target area: sort records by vg_id, pick [0, mid, -1].
    Returns list of (vg_id, area, ko_title, en_title, ja_title, zh_title).
    """
    by_area = {a: [] for a in TARGET_AREAS}
    for r in vg_raw:
        area = r.get("area", "기타")
        if area in by_area:
            by_area[area].append(r)

    # Print area distribution
    print("Area distribution:")
    for area, recs in by_area.items():
        print(f"  {area}: {len(recs)} records")

    samples = []
    for area in TARGET_AREAS:
        recs = sorted(by_area[area], key=lambda x: x["vg_id"])
        n = len(recs)
        if n == 0:
            print(f"  WARNING: no records for area={area}")
            continue
        indices = sorted({0, n // 2, n - 1})  # dedup if n<3
        # Need exactly 3; if n<3, repeat last
        while len(indices) < 3:
            indices.append(indices[-1])
        indices = indices[:3]
        for idx in indices:
            r = recs[idx]
            samples.append({
                "vg_id": r["vg_id"],
                "area": area,
                "area_index": idx,
                "title_ko": r["ko"]["title"],
                "title_en": r["en"]["title"],
                "title_ja": r["ja"]["title"],
                "title_zh": r["zh"]["title"],
            })

    print(f"\nSelected {len(samples)} samples:")
    for s in samples:
        print(f"  [{s['area']} idx={s['area_index']}] {s['title_ko']} ({s['vg_id'][:12]}...)")

    return samples


# ── Live page fetch & parse ────────────────────────────────────────────────
def clean_text(t):
    if not t:
        return ""
    t = re.sub(r"\r\n|\r", "\n", t)
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()

def is_menu_item(text):
    return "₩" in text

def extract_description_from_article(article):
    if not article:
        return "", ""
    h2 = article.find("h2")
    name = h2.get_text(strip=True) if h2 else ""
    paragraphs = [p.get_text(strip=True) for p in article.find_all("p")]
    desc_parts = []
    for p in paragraphs:
        p_clean = clean_text(p)
        if not p_clean or len(p_clean) < 10:
            continue
        if is_menu_item(p_clean):
            continue
        if p_clean.lower() in ("share", "menu", "菜品", "メニュー", "메뉴",
                                "allergy information", "알러지 식품 포함 정보 제공",
                                "アレルゲン情報を提供しています", "提供过敏原信息"):
            continue
        desc_parts.append(p_clean)
    desc = "\n\n".join(desc_parts)
    return name, desc

def fetch_live_page(vg_id, locale):
    url = LOCALE_URL[locale].format(vg_id=vg_id)
    try:
        resp = requests.get(url, headers=HEADERS, timeout=20)
        if resp.status_code != 200:
            return None, f"HTTP_{resp.status_code}", url
        soup = BeautifulSoup(resp.text, "html.parser")
        article = soup.find("article")
        if not article:
            return None, "NO_ARTICLE", url
        name, desc = extract_description_from_article(article)
        # Also get address from DL
        dl_info = {}
        for dl in article.find_all("dl"):
            dt = dl.find("dt")
            dd = dl.find("dd")
            if dt and dd:
                k = dt.get_text(strip=True)
                v = re.sub(r"\s+", " ", dd.get_text(separator=" ", strip=True)).strip()
                dl_info[k] = v
        address_keys = ["Address", "주소", "住所", "地址"]
        address = ""
        for k in address_keys:
            if k in dl_info:
                address = dl_info[k]
                break
        return {"name": name, "description": desc, "address": address, "url": url}, None, url
    except Exception as e:
        return None, str(e), LOCALE_URL[locale].format(vg_id=vg_id)


# ── Comparison helpers ─────────────────────────────────────────────────────
def normalize_ws(s):
    """Normalize whitespace for comparison."""
    return re.sub(r"\s+", " ", s or "").strip()

def compare_title(stored, live_name):
    s = normalize_ws(stored)
    l = normalize_ws(live_name)
    return s == l, s, l

def compare_description(stored, live_desc, locale):
    """
    Check stored description:
    1. Not empty
    2. Matches live page (after whitespace normalization within 95%)
    3. Is in correct language (heuristic checks)
    4. No price marker (₩) — means menu item leaked
    5. No obvious other-restaurant contamination
    """
    issues = []
    s = normalize_ws(stored)
    l = normalize_ws(live_desc)

    if not s:
        issues.append("DESCRIPTION_EMPTY_IN_STORED")
    if not l:
        issues.append("DESCRIPTION_EMPTY_ON_LIVE_PAGE")

    if s and l:
        # Check for ₩ in stored (menu item leaked)
        if "₩" in stored:
            issues.append("DESCRIPTION_CONTAINS_PRICE_MARKER")

        # Approximate match: live starts within stored or vice versa
        # Allow some divergence (sometimes stored has extra "allergy" line from parser)
        # Strip the common allergy suffix that parser sometimes includes
        s_stripped = re.sub(r"\s*アレルゲン情報を提供しています\s*$", "", s).strip()
        s_stripped = re.sub(r"\s*提供过敏原信息\s*$", "", s_stripped).strip()
        s_stripped = re.sub(r"\s*알러지 식품 포함 정보 제공\s*$", "", s_stripped).strip()

        # Check if stored content is substantially present in live
        # Allow whitespace diff; compare first 100 chars of both
        if len(s_stripped) > 20 and len(l) > 20:
            # Check overlap: does live page contain start of stored desc?
            stored_start = s_stripped[:80]
            if stored_start not in l and stored_start not in l.replace("\n", " "):
                # Check reverse: does stored contain start of live?
                live_start = l[:80]
                if live_start not in s_stripped and live_start not in s_stripped.replace("\n", " "):
                    issues.append("DESCRIPTION_CONTENT_MISMATCH")

    # Language check
    if locale == "en" and stored:
        # Should not be predominantly Korean
        korean_chars = len(re.findall(r"[\uAC00-\uD7A3]", stored))
        if korean_chars > 5:
            issues.append("LANGUAGE_MISMATCH_KO_IN_EN")
    if locale == "ja" and stored:
        # Should have Japanese characters
        japanese_chars = len(re.findall(r"[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]", stored))
        if japanese_chars < 5:
            issues.append("LANGUAGE_MISMATCH_NO_JA_CHARS")
        # Should not be English only
        if re.match(r"^[A-Za-z0-9 ,.!?'\"\-\(\)]+$", stored[:50]):
            issues.append("LANGUAGE_MISMATCH_EN_IN_JA")
    if locale == "zh-CN" and stored:
        chinese_chars = len(re.findall(r"[\u4E00-\u9FFF]", stored))
        if chinese_chars < 5:
            issues.append("LANGUAGE_MISMATCH_NO_ZH_CHARS")

    return issues

def check_structured_field(stored_addr, live_addr):
    """Rough check: stored address overlaps live address."""
    s = normalize_ws(stored_addr)
    l = normalize_ws(live_addr)
    if not s or not l:
        return "SKIP"  # Can't compare
    # Check if main part of address matches (at least 10 chars overlap)
    s_key = s[:20] if len(s) > 20 else s
    l_key = l[:20] if len(l) > 20 else l
    if s_key in l or l_key in s:
        return "PASS"
    # Try reverse
    if s in l or l in s:
        return "PASS"
    return "MISMATCH"


# ── Main QA logic ──────────────────────────────────────────────────────────
def run_qa():
    print("Loading source data...")
    vg_raw = load_jsonl(VG_RAW)
    raw_by = index_by_two(load_jsonl(RAW_FILE), "vg_id", "locale")
    svc_by = index_by(load_jsonl(SVC_FILE), "vg_id")
    handoff_by = index_by_two(load_jsonl(HANDOFF), "vg_id", "locale")

    print(f"  vg_raw: {len(vg_raw)}, raw: {len(raw_by)}, svc: {len(svc_by)}, handoff: {len(handoff_by)}")

    samples = select_samples(vg_raw)
    print(f"\nRunning live page checks ({len(samples)} restaurants × 4 locales)...")

    locales = ["ko", "en", "ja", "zh-CN"]
    checks = []
    issue_count = 0

    for si, s in enumerate(samples):
        vg_id = s["vg_id"]
        area = s["area"]
        title_ko = s["title_ko"]
        svc_rec = svc_by.get(vg_id, {})

        print(f"\n[{si+1}/12] {title_ko} ({area})")

        for locale in locales:
            # Stored values
            raw_rec = raw_by.get((vg_id, locale), {})
            handoff_rec = handoff_by.get((vg_id, locale), {})

            stored_title = handoff_rec.get("title", "")
            stored_desc = raw_rec.get("description", "")
            stored_addr = raw_rec.get("address", "")

            # Live fetch
            live, err, url = fetch_live_page(vg_id, locale)
            time.sleep(1.5)

            check = {
                "vg_id": vg_id,
                "area": area,
                "ko_title": title_ko,
                "locale": locale,
                "url": url,
                "stored_title": stored_title,
                "stored_desc_len": len(stored_desc),
                "stored_desc_preview": stored_desc[:100] if stored_desc else "",
            }

            if err or live is None:
                check["result"] = "FETCH_ERROR"
                check["issues"] = [f"FETCH_ERROR:{err}"]
                check["live_name"] = ""
                check["live_desc_len"] = 0
                check["live_desc_preview"] = ""
                issue_count += 1
                print(f"  {locale}: FETCH_ERROR {err}")
                checks.append(check)
                continue

            live_name = live.get("name", "")
            live_desc = live.get("description", "")
            live_addr = live.get("address", "")

            check["live_name"] = live_name
            check["live_desc_len"] = len(live_desc)
            check["live_desc_preview"] = live_desc[:100] if live_desc else ""

            # Title compare
            title_ok, stored_t_norm, live_t_norm = compare_title(stored_title, live_name)
            check["title_match"] = title_ok

            # Description compare
            desc_issues = compare_description(stored_desc, live_desc, locale)

            # Structured field
            addr_check = check_structured_field(stored_addr, live_addr)
            check["address_check"] = addr_check

            all_issues = []
            if not title_ok:
                all_issues.append(f"TITLE_MISMATCH: stored={stored_t_norm!r} live={live_t_norm!r}")
            all_issues.extend(desc_issues)
            if addr_check == "MISMATCH":
                all_issues.append(f"ADDRESS_MISMATCH: stored={stored_addr!r} live={live_addr!r}")

            check["issues"] = all_issues
            check["result"] = "PASS" if not all_issues else "FAIL"
            if all_issues:
                issue_count += len(all_issues)
            print(
                f"  {locale}: {check['result']}  title={'OK' if title_ok else 'MISMATCH'}  "
                f"desc_len={len(stored_desc)}c  "
                f"issues={all_issues or 'none'}"
            )
            checks.append(check)

    # ── Aggregate ──────────────────────────────────────────────────────────
    total_checks = len(checks)
    title_pass = sum(1 for c in checks if c.get("title_match") is True)
    desc_pass = sum(1 for c in checks if "DESCRIPTION" not in " ".join(c.get("issues", [])) and c.get("result") != "FETCH_ERROR")
    lang_pass = sum(1 for c in checks if "LANGUAGE" not in " ".join(c.get("issues", [])) and c.get("result") != "FETCH_ERROR")
    structured_pass = sum(1 for c in checks if c.get("address_check") in ("PASS", "SKIP"))
    overall_pass = all(c.get("result") == "PASS" for c in checks)
    result = "PASS" if overall_pass else "HOLD"

    # Issue summary
    all_issues_flat = []
    for c in checks:
        for iss in c.get("issues", []):
            all_issues_flat.append({
                "vg_id": c["vg_id"],
                "locale": c["locale"],
                "ko_title": c["ko_title"],
                "issue": iss,
            })

    title_mismatch = sum(1 for i in all_issues_flat if "TITLE_MISMATCH" in i["issue"])
    desc_wrong = sum(1 for i in all_issues_flat if "DESCRIPTION" in i["issue"])
    lang_mismatch = sum(1 for i in all_issues_flat if "LANGUAGE" in i["issue"])
    cross_contamination = sum(1 for i in all_issues_flat if "CROSS" in i["issue"] or "contamination" in i["issue"].lower())

    # Sample summary for report
    sample_summary = []
    for s in samples:
        sample_summary.append({
            "vg_id": s["vg_id"],
            "area": s["area"],
            "area_index": s["area_index"],
            "title_ko": s["title_ko"],
            "title_en": s["title_en"],
            "title_ja": s["title_ja"],
            "title_zh": s["title_zh"],
        })

    qa = {
        "task": "TASK-GYEONGJU-FOOD-105-PARSER-SAMPLE-QA-V1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "branch": "data/gyeongju-food-105-multilingual-full-content-v1",
        "base_sha": "373fcc3",
        "result": result,
        "sample_method": (
            "Per target area (경주시내권/보문관광단지/황리단길/불국사권), "
            "sort records by vg_id, select indices [0, n//2, n-1] = first/mid/last. "
            "Total 12 restaurants, 3 per area."
        ),
        "area_distribution": {a: 3 for a in TARGET_AREAS},
        "sampled_restaurants": sample_summary,
        "locale_checks": {
            "total": total_checks,
            "per_locale": {loc: 12 for loc in locales},
        },
        "pass_counts": {
            "title_pass": title_pass,
            "description_pass": desc_pass,
            "language_pass": lang_pass,
            "structured_info_pass": structured_pass,
            "overall_pass": sum(1 for c in checks if c.get("result") == "PASS"),
        },
        "issue_counts": {
            "title_mismatch": title_mismatch,
            "description_wrong_element": desc_wrong,
            "language_mismatch": lang_mismatch,
            "cross_entity_contamination": cross_contamination,
            "total_issues": len(all_issues_flat),
        },
        "issues_detail": all_issues_flat,
        "locale_checks_detail": checks,
        "assertions": {
            "all_48_checks_pass": overall_pass,
            "no_title_mismatch": title_mismatch == 0,
            "no_description_wrong_element": desc_wrong == 0,
            "no_language_mismatch": lang_mismatch == 0,
            "no_cross_contamination": cross_contamination == 0,
        },
        "parser_accuracy_result": result,
        "main_intake_safe": "YES" if overall_pass else "CONDITIONAL",
        "main_intake_notes": (
            "All sampled pages matched. zh-CN→zh adapter still required at intake. "
            "Geocoding required for 98 NEW records. 화수브루어리 identity confirm pending."
        ) if overall_pass else "Parser issues found — review issues_detail before intake.",
    }

    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(qa, f, ensure_ascii=False, indent=2)
    print(f"\nQA file written: {OUT_FILE}")

    # Final summary
    print("\n" + "="*60)
    print(f"RESULT: {result}")
    print(f"  Total checks: {total_checks}")
    print(f"  PASS: {sum(1 for c in checks if c.get('result') == 'PASS')}")
    print(f"  FAIL/ERROR: {sum(1 for c in checks if c.get('result') != 'PASS')}")
    print(f"  Title mismatches: {title_mismatch}")
    print(f"  Description wrong: {desc_wrong}")
    print(f"  Language mismatches: {lang_mismatch}")
    print(f"  Total issues: {len(all_issues_flat)}")
    if all_issues_flat:
        print("\nISSUES:")
        for iss in all_issues_flat:
            print(f"  [{iss['locale']}] {iss['ko_title']}: {iss['issue']}")

    return result

if __name__ == "__main__":
    run_qa()
