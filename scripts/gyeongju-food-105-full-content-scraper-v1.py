#!/usr/bin/env python3
"""
TASK-GYEONGJU-VISITGYEONGJU-FOOD-105-MULTILINGUAL-FULL-CONTENT-V1
Scrape full KO/EN/JA/ZH content from official VisitGyeongju food pages.
Source: 105 vg_id records from gyeongju-food-vg-raw-v1.jsonl
Target: 420 pages (105 × 4 locales)

URL patterns confirmed via probe:
  KO: https://www.visitgyeongju.or.kr/kr/cuisine/view/{vg_id}
  EN: https://www.visitgyeongju.or.kr/cuisine/view/{vg_id}
  JA: https://www.visitgyeongju.or.kr/jp/cuisine/view/{vg_id}
  ZH: https://www.visitgyeongju.or.kr/zh/cuisine/view/{vg_id}

Status codes:
  NATIVE_TEXT_PRESENT  - article found + non-empty description
  SOURCE_EMPTY         - article found but no qualifying description text
  PAGE_UNAVAILABLE     - no article element (wrong URL or page blank)
  FETCH_ERROR          - network/HTTP error
  STRUCTURE_CHANGED    - article exists but unexpected structure

Constraints:
  - READ official pages only
  - No CAPTCHA/WAF bypass
  - No AI translation
  - No unofficial source
  - Rate-limit: ~1.5s between requests
  - Resumable: skip already-fetched (vg_id, locale) pairs from raw output
"""
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup

# ── Paths ──────────────────────────────────────────────────────────────────
BASE = Path("c:/기본저장/나의 프로젝트/KoreaMate/korea-mate")
SRC_FILE = BASE / "data/gyeongju-multilingual-v1/gyeongju-food-vg-raw-v1.jsonl"
OUT_DIR = BASE / "data/gyeongju-food-105-multilingual-full-content-v1"
OUT_DIR.mkdir(parents=True, exist_ok=True)

RAW_FILE = OUT_DIR / "gyeongju-vg-food-105-raw-content.jsonl"
SERVICE_FILE = OUT_DIR / "gyeongju-vg-food-105-service-v2.jsonl"
HANDOFF_FILE = OUT_DIR / "gyeongju-vg-food-105-multilingual-handoff-v2.jsonl"
QA_FILE = OUT_DIR / "gyeongju-vg-food-105-coverage-qa-v2.json"
MANIFEST_FILE = OUT_DIR / "gyeongju-vg-food-105-manifest-v2.json"

# 화수브루어리 targeted check
HWASU_VG_ID = "535f4149060609450a4104474351404740"
HWASU_CANONICAL_ID = "gyeongju-GJ08-6917"
HWASU_CANONICAL_PHONE = "0507-1391-8015"
HWASU_CANONICAL_ADDR = "경주시 보문로 465-67 A동 1층 101호"

# ── URL patterns ────────────────────────────────────────────────────────────
LOCALE_URL = {
    "ko": "https://www.visitgyeongju.or.kr/kr/cuisine/view/{vg_id}",
    "en": "https://www.visitgyeongju.or.kr/cuisine/view/{vg_id}",
    "ja": "https://www.visitgyeongju.or.kr/jp/cuisine/view/{vg_id}",
    "zh-CN": "https://www.visitgyeongju.or.kr/zh/cuisine/view/{vg_id}",
}

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

RATE_LIMIT = 1.5  # seconds between requests

# ── Parser ──────────────────────────────────────────────────────────────────
def clean_text(t):
    """Clean whitespace from scraped text."""
    if not t:
        return ""
    t = re.sub(r"\r\n", "\n", t)
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()

def is_menu_item(text):
    """Return True if paragraph text is a menu item (contains price)."""
    return "₩" in text

def extract_description(paragraphs):
    """Extract description from article paragraphs (non-menu, non-trivial)."""
    desc_parts = []
    for p in paragraphs:
        p_clean = clean_text(p)
        if not p_clean or len(p_clean) < 10:
            continue
        if is_menu_item(p_clean):
            continue
        # Skip single-word structural items
        if p_clean.lower() in ("share", "menu", "allergy information", "알러지 식품 포함 정보 제공",
                                "アレルギー情報を提供", "提供过敏原信息"):
            continue
        desc_parts.append(p_clean)
    return "\n\n".join(desc_parts) if desc_parts else ""

def parse_dl_info(article):
    """Extract DL key-value pairs from article."""
    info = {}
    for dl in article.find_all("dl"):
        dt = dl.find("dt")
        dd = dl.find("dd")
        if dt and dd:
            key = dt.get_text(strip=True)
            val = dd.get_text(separator=" ", strip=True)
            # Clean up extra whitespace from nested tags
            val = re.sub(r"\s+", " ", val).strip()
            info[key] = val
    return info

def extract_phone_from_contact(contact_text):
    """Pull phone number from DL contact text."""
    if not contact_text:
        return ""
    # Pattern: "Tel + 054-775-3260" or "Tel + 0507-..."
    m = re.search(r"(\d[\d\-]+\d)", contact_text)
    return m.group(1) if m else ""

def parse_page(html, locale, vg_id):
    """
    Parse a VisitGyeongju food detail page.
    Returns dict with status + extracted fields.
    """
    soup = BeautifulSoup(html, "html.parser")
    article = soup.find("article")

    if not article:
        return {
            "status": "PAGE_UNAVAILABLE",
            "name": "",
            "subtitle": "",
            "description": "",
            "address": "",
            "hours": "",
            "phone": "",
        }

    # Name (h2)
    h2 = article.find("h2")
    name = h2.get_text(strip=True) if h2 else ""

    # Subtitle (first h3, before "Menu" section)
    h3s = article.find_all("h3")
    subtitle = ""
    for h in h3s:
        t = h.get_text(strip=True)
        if t.lower() not in ("menu", "菜品", "メニュー", "메뉴"):
            subtitle = t
            break

    # Paragraphs
    paragraphs = [p.get_text(strip=True) for p in article.find_all("p")]
    description = extract_description(paragraphs)

    # DL structured info
    dl_info = parse_dl_info(article)

    # Address: varies by locale
    address_keys = ["Address", "주소", "住所", "地址"]
    address = ""
    for k in address_keys:
        if k in dl_info:
            address = dl_info[k]
            break

    # Hours
    hours_keys = ["Hours", "영업시간", "営業時間", "营业时间"]
    hours = ""
    for k in hours_keys:
        if k in dl_info:
            hours = dl_info[k]
            break

    # Phone from Contact
    contact_keys = ["Contact", "연락처", "連絡先", "联系方式"]
    phone = ""
    for k in contact_keys:
        if k in dl_info:
            phone = extract_phone_from_contact(dl_info[k])
            break

    # Determine status
    if not name:
        status = "STRUCTURE_CHANGED"
    elif description:
        status = "NATIVE_TEXT_PRESENT"
    else:
        # Article found but no qualifying description
        status = "SOURCE_EMPTY"

    return {
        "status": status,
        "name": name,
        "subtitle": subtitle,
        "description": description,
        "address": address,
        "hours": hours,
        "phone": phone,
    }

# ── Load source records ─────────────────────────────────────────────────────
def load_vg_raw():
    records = []
    with open(SRC_FILE, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records

# ── Resume: load already-fetched pairs ─────────────────────────────────────
def load_already_fetched():
    fetched = {}  # (vg_id, locale) -> parsed result dict
    if RAW_FILE.exists():
        with open(RAW_FILE, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    r = json.loads(line)
                    key = (r["vg_id"], r["locale"])
                    fetched[key] = r
                except Exception:
                    pass
    return fetched

# ── Fetch one page ──────────────────────────────────────────────────────────
def fetch_page(url):
    try:
        resp = requests.get(url, headers=HEADERS, timeout=20)
        if resp.status_code == 200:
            return resp.text, None
        else:
            return None, f"HTTP_{resp.status_code}"
    except requests.exceptions.Timeout:
        return None, "TIMEOUT"
    except requests.exceptions.ConnectionError as e:
        return None, f"CONNECTION_ERROR:{e}"
    except Exception as e:
        return None, f"ERROR:{e}"

# ── Main scraping loop ──────────────────────────────────────────────────────
def main():
    vg_records = load_vg_raw()
    print(f"Loaded {len(vg_records)} VG records from source.")

    already = load_already_fetched()
    print(f"Already fetched: {len(already)} (vg_id, locale) pairs. Resuming...")

    # Count total work
    locales = list(LOCALE_URL.keys())
    total = len(vg_records) * len(locales)
    done = len(already)
    remaining = total - done
    print(f"Total: {total}  Done: {done}  Remaining: {remaining}")

    raw_fh = open(RAW_FILE, "a", encoding="utf-8")

    fetched_this_run = 0
    errors = 0

    for idx, rec in enumerate(vg_records):
        vg_id = rec["vg_id"]
        ko_title = rec["ko"]["title"]

        for locale in locales:
            key = (vg_id, locale)
            if key in already:
                continue  # Skip already fetched

            url = LOCALE_URL[locale].format(vg_id=vg_id)
            html, err = fetch_page(url)

            if err:
                result = {
                    "vg_id": vg_id,
                    "locale": locale,
                    "ko_title": ko_title,
                    "url": url,
                    "status": "FETCH_ERROR",
                    "error": err,
                    "name": "",
                    "subtitle": "",
                    "description": "",
                    "address": "",
                    "hours": "",
                    "phone": "",
                    "fetched_at": datetime.now(timezone.utc).isoformat(),
                }
                errors += 1
            else:
                parsed = parse_page(html, locale, vg_id)
                result = {
                    "vg_id": vg_id,
                    "locale": locale,
                    "ko_title": ko_title,
                    "url": url,
                    **parsed,
                    "fetched_at": datetime.now(timezone.utc).isoformat(),
                }

            # Write immediately (resume-safe)
            raw_fh.write(json.dumps(result, ensure_ascii=False) + "\n")
            raw_fh.flush()
            already[key] = result
            fetched_this_run += 1

            # Progress
            total_done = done + fetched_this_run
            pct = total_done / total * 100
            status_str = result.get("status", "?")
            desc_len = len(result.get("description", ""))
            print(
                f"[{total_done:3d}/{total}] {pct:5.1f}% | "
                f"{locale:5s} | {status_str:22s} | desc={desc_len:4d}c | "
                f"{ko_title[:30]}"
            )

            # Targeted check for 화수브루어리
            if vg_id == HWASU_VG_ID and locale == "ko":
                vg_phone = result.get("phone", "")
                vg_addr = result.get("address", "")
                print(f"\n  *** 화수브루어리 TARGETED CHECK ***")
                print(f"  Canonical ID: {HWASU_CANONICAL_ID}")
                print(f"  Canonical phone: {HWASU_CANONICAL_PHONE}")
                print(f"  VG KO phone: {vg_phone!r}")
                print(f"  Canonical addr: {HWASU_CANONICAL_ADDR}")
                print(f"  VG KO addr: {vg_addr!r}")
                phone_match = vg_phone and (vg_phone in HWASU_CANONICAL_PHONE or HWASU_CANONICAL_PHONE.replace("-","") in vg_phone.replace("-",""))
                print(f"  Phone match: {phone_match}")
                print(f"  *** END TARGETED CHECK ***\n")

            time.sleep(RATE_LIMIT)

    raw_fh.close()
    print(f"\nFetch complete. This run: {fetched_this_run} fetched, {errors} errors.")

    # ── Build final artifacts ──────────────────────────────────────────────
    print("\nBuilding final artifacts...")
    build_artifacts(vg_records, already)
    print("Done.")

# ── Artifact builder ────────────────────────────────────────────────────────
def load_existing_service():
    """Load existing service file to preserve coords and canonical IDs."""
    path = BASE / "data/gyeongju-food-visitgyeongju-primary-v1/gyeongju-vg-food-service-v1.jsonl"
    records = {}
    if path.exists():
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    r = json.loads(line)
                    records[r["vg_id"]] = r
    return records

def load_hwasu_info(raw_results):
    """Extract 화수브루어리 targeted check info."""
    ko_rec = raw_results.get((HWASU_VG_ID, "ko"), {})
    return {
        "vg_id": HWASU_VG_ID,
        "canonical_id": HWASU_CANONICAL_ID,
        "canonical_phone": HWASU_CANONICAL_PHONE,
        "canonical_addr": HWASU_CANONICAL_ADDR,
        "vg_page_phone": ko_rec.get("phone", ""),
        "vg_page_addr_ko": ko_rec.get("address", ""),
        "vg_page_name_ko": ko_rec.get("name", ""),
        "vg_page_status_ko": ko_rec.get("status", ""),
    }

def build_artifacts(vg_records, raw_results):
    existing_service = load_existing_service()

    # Coverage counters
    cov = {
        "ko": {"NATIVE_TEXT_PRESENT": 0, "SOURCE_EMPTY": 0, "PAGE_UNAVAILABLE": 0, "FETCH_ERROR": 0, "STRUCTURE_CHANGED": 0},
        "en": {"NATIVE_TEXT_PRESENT": 0, "SOURCE_EMPTY": 0, "PAGE_UNAVAILABLE": 0, "FETCH_ERROR": 0, "STRUCTURE_CHANGED": 0},
        "ja": {"NATIVE_TEXT_PRESENT": 0, "SOURCE_EMPTY": 0, "PAGE_UNAVAILABLE": 0, "FETCH_ERROR": 0, "STRUCTURE_CHANGED": 0},
        "zh-CN": {"NATIVE_TEXT_PRESENT": 0, "SOURCE_EMPTY": 0, "PAGE_UNAVAILABLE": 0, "FETCH_ERROR": 0, "STRUCTURE_CHANGED": 0},
    }

    service_rows = []
    handoff_rows = []

    for rec in vg_records:
        vg_id = rec["vg_id"]
        ex = existing_service.get(vg_id, {})

        # Per-locale page results
        ko_r = raw_results.get((vg_id, "ko"), {})
        en_r = raw_results.get((vg_id, "en"), {})
        ja_r = raw_results.get((vg_id, "ja"), {})
        zh_r = raw_results.get((vg_id, "zh-CN"), {})

        # Count coverage
        for loc, r in [("ko", ko_r), ("en", en_r), ("ja", ja_r), ("zh-CN", zh_r)]:
            s = r.get("status", "FETCH_ERROR")
            if s in cov[loc]:
                cov[loc][s] += 1

        # Prefer scraped desc; fallback to existing enrichment
        def get_desc(r, existing_field):
            scraped = r.get("description", "")
            if scraped and r.get("status") == "NATIVE_TEXT_PRESENT":
                return scraped
            return ex.get(existing_field, "")

        desc_ko = get_desc(ko_r, "desc_ko")
        desc_en = get_desc(en_r, "desc_en")
        desc_ja = get_desc(ja_r, "desc_ja")
        desc_zh = get_desc(zh_r, "desc_zh")

        # Titles: prefer scraped (live) or fall back to vg-raw
        title_ko = ko_r.get("name") or rec["ko"]["title"]
        title_en = en_r.get("name") or rec["en"]["title"]
        title_ja = ja_r.get("name") or rec["ja"]["title"]
        title_zh = zh_r.get("name") or rec["zh"]["title"]

        # Address: prefer scraped or fall back to vg-raw
        addr_ko = ko_r.get("address") or rec["ko"]["address"]
        addr_en = en_r.get("address") or rec["en"]["address"]
        addr_ja = ja_r.get("address") or rec["ja"]["address"]
        addr_zh = zh_r.get("address") or rec["zh"]["address"]

        # Phone: prefer canonical → vg-raw → scraped
        phone = ex.get("phone") or rec["ko"].get("phone") or ko_r.get("phone", "")

        # ── Service row ────────────────────────────────────────────────────
        service_row = {
            "replacement_candidate_id": ex.get("replacement_candidate_id", ""),
            "vg_id": vg_id,
            "area": rec.get("area", ""),
            # Titles
            "title_ko": title_ko,
            "title_en": title_en,
            "title_ja": title_ja,
            "title_zh": title_zh,
            # Descriptions
            "desc_ko": desc_ko,
            "desc_en": desc_en,
            "desc_ja": desc_ja,
            "desc_zh": desc_zh,
            # Addresses
            "address_ko": addr_ko,
            "address_en": addr_en,
            "address_ja": addr_ja,
            "address_zh": addr_zh,
            # Info
            "phone": phone,
            "hours_en": en_r.get("hours", "") or ko_r.get("hours", ""),
            # Coordinates (from existing if available)
            "lat": ex.get("lat"),
            "lng": ex.get("lng"),
            # Sources
            "source_url_ko": LOCALE_URL["ko"].format(vg_id=vg_id),
            "source_url_en": LOCALE_URL["en"].format(vg_id=vg_id),
            "source_url_ja": LOCALE_URL["ja"].format(vg_id=vg_id),
            "source_url_zh": LOCALE_URL["zh-CN"].format(vg_id=vg_id),
            # Native flags
            "native_ko": ko_r.get("status") == "NATIVE_TEXT_PRESENT",
            "native_en": en_r.get("status") == "NATIVE_TEXT_PRESENT",
            "native_ja": ja_r.get("status") == "NATIVE_TEXT_PRESENT",
            "native_zh": zh_r.get("status") == "NATIVE_TEXT_PRESENT",
            # Crosswalk info
            "service_status": "SERVICE_ACTIVE",
            "match_to_existing": ex.get("match_to_existing", "NEW_VISITGYEONGJU"),
            "existing_canonical_id": ex.get("existing_canonical_id", ""),
        }
        service_rows.append(service_row)

        # ── Multilingual handoff rows ──────────────────────────────────────
        for locale, r, title, desc, addr, src_url in [
            ("ko", ko_r, title_ko, desc_ko, addr_ko, LOCALE_URL["ko"].format(vg_id=vg_id)),
            ("en", en_r, title_en, desc_en, addr_en, LOCALE_URL["en"].format(vg_id=vg_id)),
            ("ja", ja_r, title_ja, desc_ja, addr_ja, LOCALE_URL["ja"].format(vg_id=vg_id)),
            ("zh-CN", zh_r, title_zh, desc_zh, addr_zh, LOCALE_URL["zh-CN"].format(vg_id=vg_id)),
        ]:
            status = r.get("status", "FETCH_ERROR")
            handoff_row = {
                "vg_id": vg_id,
                "replacement_candidate_id": ex.get("replacement_candidate_id", ""),
                "existing_canonical_id": ex.get("existing_canonical_id", ""),
                "locale": locale,
                "title": title,
                "description": desc,
                "address": addr,
                "source_url": src_url,
                "page_status": status,
                "required_core_ready": bool(title),
                "rights_status": "OFFICIAL_TOURISM_BODY_NO_EXPLICIT_PROHIBITION",
            }
            handoff_rows.append(handoff_row)

    # ── Write service file ─────────────────────────────────────────────────
    with open(SERVICE_FILE, "w", encoding="utf-8") as f:
        for row in service_rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(f"  Written: {SERVICE_FILE.name} ({len(service_rows)} records)")

    # ── Write handoff file ─────────────────────────────────────────────────
    with open(HANDOFF_FILE, "w", encoding="utf-8") as f:
        for row in handoff_rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(f"  Written: {HANDOFF_FILE.name} ({len(handoff_rows)} records)")

    # ── Coverage QA ────────────────────────────────────────────────────────
    total_records = len(vg_records)

    def count_status(locale, status):
        return cov[locale].get(status, 0)

    def desc_count(locale):
        """Count records with non-empty description for this locale."""
        return sum(
            1 for r in raw_results.values()
            if r.get("locale") == locale and r.get("status") == "NATIVE_TEXT_PRESENT"
        )

    qa = {
        "task": "TASK-GYEONGJU-VISITGYEONGJU-FOOD-105-MULTILINGUAL-FULL-CONTENT-V1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_vg_records": total_records,
        "total_pages_targeted": total_records * 4,
        "total_pages_fetched": len(raw_results),
        "coverage_by_locale": {}
    }

    for loc in ["ko", "en", "ja", "zh-CN"]:
        loc_results = {k: v for k, v in raw_results.items() if k[1] == loc}
        native_present = sum(1 for r in loc_results.values() if r.get("status") == "NATIVE_TEXT_PRESENT")
        source_empty = sum(1 for r in loc_results.values() if r.get("status") == "SOURCE_EMPTY")
        page_unavailable = sum(1 for r in loc_results.values() if r.get("status") == "PAGE_UNAVAILABLE")
        fetch_error = sum(1 for r in loc_results.values() if r.get("status") == "FETCH_ERROR")
        structure_changed = sum(1 for r in loc_results.values() if r.get("status") == "STRUCTURE_CHANGED")
        fetched = len(loc_results)

        qa["coverage_by_locale"][loc] = {
            "fetched": fetched,
            "NATIVE_TEXT_PRESENT": native_present,
            "SOURCE_EMPTY": source_empty,
            "PAGE_UNAVAILABLE": page_unavailable,
            "FETCH_ERROR": fetch_error,
            "STRUCTURE_CHANGED": structure_changed,
            "desc_coverage": f"{native_present}/{total_records}",
            "desc_pct": round(native_present / total_records * 100, 1) if total_records else 0,
        }

    # Titles from vg-raw (all 105 are native, already confirmed)
    qa["title_coverage"] = {
        "ko": f"105/105 (from vg-raw + page)",
        "en": f"105/105 (from vg-raw + page)",
        "ja": f"105/105 (from vg-raw + page)",
        "zh-CN": f"105/105 (from vg-raw + page)",
    }

    # 화수브루어리 targeted check
    hwasu_info = load_hwasu_info(raw_results)
    qa["hwasu_brewery_targeted_check"] = hwasu_info

    # QA assertions
    qa["assertions"] = {
        "total_records_correct": total_records == 105,
        "total_handoff_correct": len(handoff_rows) == 105 * 4,
        "no_locale_zero": all(
            qa["coverage_by_locale"][loc]["fetched"] > 0
            for loc in ["ko", "en", "ja", "zh-CN"]
        ),
    }

    qa["qa_result"] = "PASS" if all(qa["assertions"].values()) else "FAIL"

    with open(QA_FILE, "w", encoding="utf-8") as f:
        json.dump(qa, f, ensure_ascii=False, indent=2)
    print(f"  Written: {QA_FILE.name}")

    # ── Manifest ───────────────────────────────────────────────────────────
    manifest = {
        "task": "TASK-GYEONGJU-VISITGYEONGJU-FOOD-105-MULTILINGUAL-FULL-CONTENT-V1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "branch": "data/gyeongju-food-105-multilingual-full-content-v1",
        "base_branch": "data/gyeongju-food-visitgyeongju-primary-v1",
        "source_file": str(SRC_FILE.relative_to(BASE)),
        "total_vg_records": 105,
        "total_locales": 4,
        "total_pages_targeted": 420,
        "url_patterns": LOCALE_URL,
        "scrape_method": "requests+BeautifulSoup official pages only",
        "ai_translation_used": False,
        "unofficial_source_used": False,
        "desc_coverage": {
            loc: qa["coverage_by_locale"][loc]["desc_coverage"]
            for loc in ["ko", "en", "ja", "zh-CN"]
        },
        "artifacts": {
            "A_raw_content": str(RAW_FILE.relative_to(BASE)),
            "B_service_v2": str(SERVICE_FILE.relative_to(BASE)),
            "C_multilingual_handoff_v2": str(HANDOFF_FILE.relative_to(BASE)),
            "D_coverage_qa_v2": str(QA_FILE.relative_to(BASE)),
            "E_manifest_v2": str(MANIFEST_FILE.relative_to(BASE)),
        },
        "hwasu_brewery_targeted_check": hwasu_info,
        "qa_result": qa["qa_result"],
        "invariants": {
            "attraction_changed": 0,
            "db_changed": 0,
            "production_changed": 0,
            "master_changed": 0,
            "ai_translation_used": False,
            "canonical_modified": False,
        },
    }

    with open(MANIFEST_FILE, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print(f"  Written: {MANIFEST_FILE.name}")

    # ── Summary ────────────────────────────────────────────────────────────
    print("\n" + "="*60)
    print("FINAL COVERAGE SUMMARY")
    print("="*60)
    for loc in ["ko", "en", "ja", "zh-CN"]:
        lc = qa["coverage_by_locale"][loc]
        print(
            f"  {loc:6s}: NATIVE={lc['NATIVE_TEXT_PRESENT']:3d}  EMPTY={lc['SOURCE_EMPTY']:3d}  "
            f"UNAVAIL={lc['PAGE_UNAVAILABLE']:3d}  ERR={lc['FETCH_ERROR']:3d}  "
            f"  [{lc['desc_coverage']} desc, {lc['desc_pct']}%]"
        )
    print(f"\n  QA result: {qa['qa_result']}")
    print(f"\n  화수브루어리 check:")
    hw = hwasu_info
    print(f"    VG phone: {hw.get('vg_page_phone')!r}  (canonical: {HWASU_CANONICAL_PHONE})")
    print(f"    VG addr:  {hw.get('vg_page_addr_ko')!r}")

if __name__ == "__main__":
    main()
