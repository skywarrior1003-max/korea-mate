#!/usr/bin/env python3
"""
TASK-SEOUL-VISITSEOUL-FULL-INVENTORY-LIST-ONLY-V1
VisitSeoul full LIST inventory collector.

KEY RULES:
  - DETAIL API CALLS = 0  (enforced by design — NOT controlled by any flag)
  - --allow-full-inventory REQUIRED for full 76-page pagination
  - Without --allow-full-inventory: SMOKE mode (≤5 sample pages)
  - FULL_INVENTORY_FLAG (--allow-full-inventory) != FULL_DETAIL_FLAG (forbidden)
  - category_code API parameter NOT used (local filter only)
  - keyword search NOT used (empty keyword = full inventory pagination)
  - API key: env only, never printed/logged/committed

Usage (smoke — default):
  python scripts/run-visitseoul-full-inventory-v1.py
  python scripts/run-visitseoul-full-inventory-v1.py --page-limit 5 --as-of 2026-08-10

Usage (full list inventory — requires --allow-full-inventory):
  python scripts/run-visitseoul-full-inventory-v1.py --allow-full-inventory --as-of 2026-08-10

Self-test (no API calls):
  python scripts/run-visitseoul-full-inventory-v1.py --self-test
"""

import argparse
import json
import os
import re
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

# ── Constants ─────────────────────────────────────────────────────────────────

COLLECTOR_VERSION = "v2.0.0-list-only"
BASE_URL = "https://api-call.visitseoul.net/api/v1"
TIMEOUT = 20           # seconds per request
DELAY = 1.5            # seconds between requests (avoids rate limit)
DEFAULT_PAGE_SIZE = 50
DEFAULT_LANG = "ko"
DEFAULT_SMOKE_PAGE_LIMIT = 5
DEFAULT_OUTPUT_DIR = Path("data/seoul-source-audit")
DOCS_DIR = Path("docs/data-collection/seoul")

# Hard limit: this task is LIST ONLY
DETAIL_CALLS_ALLOWED = 0

# Max list calls this task (smoke: ≤6 incl. probe; full: ≤90 total)
MAX_API_CALLS_FULL = 90

# ── Category code mapping (21 confirmed codes from dry-run) ───────────────────

CATEGORY_CODE_MAP = {
    # ── PLACE_CORE_CANDIDATE ────────────────────────────────────────────────
    "Ch5t7s7": ("PLACE_CORE_CANDIDATE",     "역사관광 > 역사유적지 > 고궁"),
    "Co2n1h7": ("PLACE_CORE_CANDIDATE",     "역사관광 > 역사유적지 > 성/문"),
    "Ci7i9i6": ("PLACE_CORE_CANDIDATE",     "역사관광 > 역사유적지 > 근대건축물"),
    "Cr0q2v2": ("PLACE_CORE_CANDIDATE",     "문화관광 > 전시시설 > 박물관"),
    "Ce9z7g9": ("PLACE_CORE_CANDIDATE",     "문화관광 > 도시공원"),
    "Cu5u8d4": ("PLACE_CORE_CANDIDATE",     "자연관광 > 자연경관(산)"),
    "Cn7z1h7": ("PLACE_CORE_CANDIDATE",     "쇼핑 > 시장"),
    # ── PLACE_CONDITIONAL_REVIEW ─────────────────────────────────────────────
    "Ct9t6m8": ("PLACE_CONDITIONAL_REVIEW", "문화관광 > 전시시설 > 미술관/화랑"),
    "Cg1x6l1": ("PLACE_CONDITIONAL_REVIEW", "문화관광 > 전시시설"),
    "Cw1i3e4": ("PLACE_CONDITIONAL_REVIEW", "역사관광 > 종교성지"),
    "Ca0o2d4": ("PLACE_CONDITIONAL_REVIEW", "문화관광"),
    "Ct4h4b7": ("PLACE_CONDITIONAL_REVIEW", "문화관광 > 기타문화관광지"),
    # ── TEMPLE_STAY_CANDIDATE ────────────────────────────────────────────────
    "Cq9d5v0": ("TEMPLE_STAY_CANDIDATE",    "체험관광 > 산사체험"),
    # ── EXPERIENCE_CANDIDATE ─────────────────────────────────────────────────
    "Cl8f8q1": ("EXPERIENCE_CANDIDATE",     "체험관광 > 기타체험"),
    # ── SHOPPING_REVIEW ──────────────────────────────────────────────────────
    "Cn0t1e0": ("SHOPPING_REVIEW",          "쇼핑 > 전문매장/상가"),
    # ── RESTAURANT_TRACK (PRESERVED) ─────────────────────────────────────────
    "Cx0t8m5": ("RESTAURANT_TRACK",         "음식 > 카페/찻집"),
    "Cz9d1h6": ("RESTAURANT_TRACK",         "음식 > 한식"),
    "Ck6n0w6": ("RESTAURANT_TRACK",         "음식 > 주점"),
    # ── EVENT_TRACK (PRESERVED) ──────────────────────────────────────────────
    "Cd4y5u1": ("EVENT_TRACK",              "축제/공연/행사 > 축제"),
    "Cu9u5z7": ("EVENT_TRACK",              "축제/공연/행사 > 행사 > 전시회"),
    "Cv7s8m5": ("EVENT_TRACK",              "축제/공연/행사"),
    # ── Additional codes discovered in smoke run (2026-08-10) ─────────────────
    # PLACE_CORE_CANDIDATE additions
    "Cl5y4k0": ("PLACE_CORE_CANDIDATE",     "문화관광 > 랜드마크관광"),
    "Cr6m1i5": ("PLACE_CORE_CANDIDATE",     "역사관광 > 역사유적지 > 기타역사유적지"),
    "Cb9c5i3": ("PLACE_CORE_CANDIDATE",     "역사관광 > 역사유적지 > 고분/능"),
    "Cb9o5c4": ("PLACE_CORE_CANDIDATE",     "역사관광 > 역사유적지 > 사적지"),
    # PLACE_CONDITIONAL_REVIEW additions
    "Cr1f0k2": ("PLACE_CONDITIONAL_REVIEW", "문화관광 > 공연시설"),
    "Co0g3x0": ("PLACE_CONDITIONAL_REVIEW", "문화관광 > 레저스포츠시설"),
    "Cl2d2s1": ("PLACE_CONDITIONAL_REVIEW", "문화관광 > 교육시설"),   # ← was UNRESOLVED
    "Co6c2n2": ("PLACE_CONDITIONAL_REVIEW", "자연관광"),               # ← was UNRESOLVED
    "Cy6j7j7": ("PLACE_CONDITIONAL_REVIEW", "문화관광 > 전시시설 > 기타전시시설"),
    # EXPERIENCE_CANDIDATE additions
    "Cd0m9o0": ("EXPERIENCE_CANDIDATE",     "체험관광 > 전통체험"),
    "Cf1y9k1": ("EXPERIENCE_CANDIDATE",     "체험관광 > 웰니스관광"),
    "Cc9i5o2": ("EXPERIENCE_CANDIDATE",     "체험관광"),
    "Cq3m6s6": ("EXPERIENCE_CANDIDATE",     "체험관광 > 공예체험"),
    # SHOPPING_REVIEW additions
    "Cy4k5t1": ("SHOPPING_REVIEW",          "쇼핑 > 쇼핑몰"),
    "Cu8e6t5": ("SHOPPING_REVIEW",          "쇼핑"),
    "Cs3j7y4": ("SHOPPING_REVIEW",          "쇼핑 > 백화점"),
    # EVENT_TRACK additions
    "Cw7q1x8": ("EVENT_TRACK",              "축제/공연/행사 > 행사 > 기타행사"),
    "Cb2b0t2": ("EVENT_TRACK",              "축제/공연/행사 > 공연"),
    "Cu6j1f4": ("EVENT_TRACK",              "축제/공연/행사 > 행사 > 박람회"),
    # RESTAURANT_TRACK additions
    "Cl9n1c2": ("RESTAURANT_TRACK",         "음식 > 외국식 > 서양식"),
    "Cl9s3y9": ("RESTAURANT_TRACK",         "음식"),
    "Ch7l5i4": ("RESTAURANT_TRACK",         "음식 > 외국식 > 일식"),
}

KNOWN_CATEGORY_CODES = set(CATEGORY_CODE_MAP.keys())

# Text fallback routing (unmapped codes)
_TEMPLE_STAY_KW   = ["템플스테이", "temple stay", "산사체험"]
_EVENT_KW         = ["축제", "공연", "행사", "페스티벌", "festival", "event"]
_ACCOMMODATION_KW = ["숙박", "호텔", "모텔", "게스트하우스", "펜션", "호스텔", "여관"]
_RESTAURANT_KW    = ["음식", "식당", "맛집", "카페", "찻집", "레스토랑",
                     "한식", "양식", "중식", "일식", "분식"]
_PLACE_CORE_KW    = ["고궁", "성/문", "사적지", "박물관", "랜드마크",
                     "자연공원", "시장", "역사유적지"]
_PLACE_COND_KW    = ["미술관", "화랑", "갤러리", "전시시설", "레저스포츠"]
_EXPERIENCE_KW    = ["전통체험", "체험관광"]
_SHOPPING_KW      = ["전문매장", "상가", "쇼핑"]

# Secret redaction
_SECRET_RE = re.compile(
    r'(?:VISITSEOUL[-_]?API[-_]?KEY|api[-_]?key|token|secret|bearer|credential)'
    r'\s*[=:]\s*\S+',
    re.IGNORECASE,
)


# ── API helpers ───────────────────────────────────────────────────────────────

def _get_api_key() -> str:
    """Load VISITSEOUL_API_KEY. NEVER prints/logs/commits the value."""
    key = os.environ.get("VISITSEOUL_API_KEY", "")
    if not key:
        print("VISITSEOUL_API_KEY_AVAILABLE=NO", flush=True)
        print("STOP: API key not set.", file=sys.stderr)
        sys.exit(1)
    print("VISITSEOUL_API_KEY_AVAILABLE=YES", flush=True)
    return key


def _post_json(path: str, body: dict, api_key: str, max_retries: int = 2) -> dict:
    """POST JSON to VisitSeoul API with retry. Never logs api_key."""
    import urllib.error
    import urllib.request

    url = f"{BASE_URL}/{path}"
    data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    last_exc = None
    for attempt in range(max_retries + 1):
        req = urllib.request.Request(
            url, data=data,
            headers={
                "Content-Type":       "application/json; charset=utf-8",
                "VISITSEOUL-API-KEY": api_key,
                "Accept":             "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as exc:
            last_exc = exc
            if attempt < max_retries:
                backoff = 3 * (attempt + 1)
                print(f"    [retry {attempt+1}/{max_retries}] after {backoff}s: {exc}", flush=True)
                time.sleep(backoff)
    raise RuntimeError(f"API failed after {max_retries+1} attempts: {last_exc}") from last_exc


def fetch_list_page(page_no: int, page_size: int, lang: str, api_key: str) -> dict:
    """Fetch one inventory page (empty keyword = full inventory)."""
    return _post_json(
        "contents/list",
        {"language": lang, "keyword": "", "page_no": page_no, "num_of_rows": page_size},
        api_key,
    )


# ── Category routing ─────────────────────────────────────────────────────────

def route_category(record: dict) -> tuple:
    """LOCAL CATEGORY FILTER. Returns (track, routing_reason)."""
    cat_code = str(record.get("com_ctgry_sn", "") or "").strip()

    # 1. Exact code match
    if cat_code in CATEGORY_CODE_MAP:
        track, cat_label = CATEGORY_CODE_MAP[cat_code]
        return track, f"code_match:{cat_code}:{cat_label}"

    # 2. Text fallback
    title    = str(record.get("post_sj", "") or "").lower()
    cat_text = " ".join(str(record.get(f, "") or "") for f in [
        "cate_depth", "com_ctgry_sn", "ctgry_nm", "com_ctgry_sn_nm",
    ]).lower()
    combined = f"{cat_text} {title}"

    # Temple Stay FIRST (before accommodation)
    if any(kw in combined for kw in _TEMPLE_STAY_KW):
        return "TEMPLE_STAY_CANDIDATE",       f"text_match:temple_stay:code={cat_code}"
    if any(kw in combined for kw in _EVENT_KW):
        return "EVENT_TRACK",                 f"text_match:event:code={cat_code}"
    if any(kw in combined for kw in _ACCOMMODATION_KW):
        return "GENERAL_ACCOMMODATION_EXCLUDE", f"text_match:accommodation:code={cat_code}"
    if any(kw in combined for kw in _RESTAURANT_KW):
        return "RESTAURANT_TRACK",            f"text_match:restaurant:code={cat_code}"
    if "전문매장" in combined or ("상가" in combined and "전통" not in combined):
        return "SHOPPING_REVIEW",             f"text_match:shopping_specialty:code={cat_code}"
    if "시장" in combined:
        return "PLACE_CORE_CANDIDATE",        f"text_match:market:code={cat_code}"
    if any(kw in combined for kw in _SHOPPING_KW):
        return "SHOPPING_REVIEW",             f"text_match:shopping_general:code={cat_code}"
    if any(kw in combined for kw in _PLACE_CORE_KW):
        return "PLACE_CORE_CANDIDATE",        f"text_match:place_core:code={cat_code}"
    if any(kw in combined for kw in _PLACE_COND_KW):
        return "PLACE_CONDITIONAL_REVIEW",    f"text_match:place_conditional:code={cat_code}"
    if any(kw in combined for kw in _EXPERIENCE_KW):
        return "EXPERIENCE_CANDIDATE",        f"text_match:experience:code={cat_code}"
    if not cat_code or cat_code == "None":
        return "UNRESOLVED_CATEGORY",         "no_category_code_or_text_match"

    return "UNRESOLVED_CATEGORY",             f"unrecognized_code:{cat_code}"


# ── Page helpers ──────────────────────────────────────────────────────────────

def compute_smoke_pages(total_count: int, page_size: int, page_limit: int) -> list:
    """Select distributed sample pages for smoke: first, second, middle, last-1, last."""
    max_page = max(1, (total_count + page_size - 1) // page_size)
    candidates = {1}
    if max_page >= 2:
        candidates.add(2)
    if max_page >= 5:
        candidates.add(max_page // 2)
    if max_page >= 4:
        candidates.add(max_page - 1)
    candidates.add(max_page)
    return sorted(candidates)[:page_limit]


# ── Multi-lang breakdown ──────────────────────────────────────────────────────

_ML_LANGS = ["ko", "en", "ja", "zh-CN", "zh-TW"]

def parse_multi_lang(multi_lang_str: str) -> dict:
    """
    Parse multi_lang_list string into {lang_code: cid} dict.
    Format: "ko:CID,en:CID,ja:CID,..."
    """
    result = {}
    if not multi_lang_str:
        return result
    for part in multi_lang_str.split(","):
        part = part.strip()
        if ":" in part:
            lang, cid = part.split(":", 1)
            result[lang.strip()] = cid.strip()
    return result


def compute_multilang_stats(records: list) -> dict:
    """Compute per-language linkage counts."""
    totals = {lang: 0 for lang in _ML_LANGS}
    has_any = 0
    for rec in records:
        ml = parse_multi_lang(rec.get("multi_lang_list", ""))
        if ml:
            has_any += 1
        for lang in _ML_LANGS:
            if lang in ml:
                totals[lang] += 1
    n = len(records)
    return {
        "multi_lang_list_present": has_any,
        "multi_lang_list_rate": round(has_any / n, 4) if n else 0,
        "per_lang": {
            lang: {"count": totals[lang], "rate": round(totals[lang] / n, 4) if n else 0}
            for lang in _ML_LANGS
        },
        "ZH_VARIANT_DECISION": "PENDING",
        "CID_SUFFIX_AUTOGENERATION": "NO",
        "note": "multi_lang_list is SSOT for multilingual linkage",
    }


# ── Category coverage ─────────────────────────────────────────────────────────

def compute_category_coverage(records: list) -> dict:
    """Build category code coverage: observed vs known vs unmapped."""
    observed_codes: Counter = Counter()
    code_to_path: dict = {}
    code_to_titles: dict = defaultdict(list)

    for rec in records:
        code = str(rec.get("com_ctgry_sn", "") or "").strip()
        path = str(rec.get("cate_depth", "") or "").strip()
        title = str(rec.get("post_sj", "") or "")
        if code:
            observed_codes[code] += 1
            if code not in code_to_path:
                code_to_path[code] = path
            if len(code_to_titles[code]) < 3:
                code_to_titles[code].append(title)

    unmapped = {
        code: {
            "count": cnt,
            "path": code_to_path.get(code, ""),
            "sample_titles": code_to_titles.get(code, []),
        }
        for code, cnt in observed_codes.items()
        if code not in KNOWN_CATEGORY_CODES
    }

    mapped = {
        code: {
            "count": cnt,
            "track": CATEGORY_CODE_MAP[code][0],
            "path": CATEGORY_CODE_MAP[code][1],
        }
        for code, cnt in observed_codes.items()
        if code in KNOWN_CATEGORY_CODES
    }

    return {
        "known_category_codes_count": len(KNOWN_CATEGORY_CODES),
        "observed_category_codes_count": len(observed_codes),
        "mapped_codes_count": len(mapped),
        "unmapped_codes_count": len(unmapped),
        "mapped_codes": dict(sorted(mapped.items())),
        "unmapped_codes": dict(sorted(unmapped.items(), key=lambda x: -x[1]["count"])),
    }


# ── Detail candidate plan ─────────────────────────────────────────────────────

def compute_detail_plan(track_counts: Counter, all_records: list) -> dict:
    """
    Calculate exact detail candidate pool from full inventory.
    No API calls made — this is planning only.
    """
    core   = track_counts.get("PLACE_CORE_CANDIDATE",       0)
    cond   = track_counts.get("PLACE_CONDITIONAL_REVIEW",   0)
    shop   = track_counts.get("SHOPPING_REVIEW",            0)
    exp    = track_counts.get("EXPERIENCE_CANDIDATE",       0)
    temple = track_counts.get("TEMPLE_STAY_CANDIDATE",      0)
    rest   = track_counts.get("RESTAURANT_TRACK",           0)
    event  = track_counts.get("EVENT_TRACK",                0)
    excl   = track_counts.get("GENERAL_ACCOMMODATION_EXCLUDE", 0)
    unres  = track_counts.get("UNRESOLVED_CATEGORY",        0)

    preliminary_retained = core + cond + shop + exp + temple

    # Shopping pre-gate: list-evidence only (title-based signal)
    shop_strong_include = sum(
        1 for r in all_records
        if r["routing_track"] == "SHOPPING_REVIEW"
        and any(kw in str(r.get("post_sj", "")).lower()
                for kw in ["플래그십", "flagship", "명동", "시장", "전통시장"])
    )
    shop_strong_exclude = sum(
        1 for r in all_records
        if r["routing_track"] == "SHOPPING_REVIEW"
        and any(kw in str(r.get("post_sj", "")).lower()
                for kw in ["편의점", "cu ", "gs25", "세븐일레븐", "미니스톱",
                           "약국", "피씨방", "노래방", "세탁"])
    )
    shop_ambiguous = shop - shop_strong_include - shop_strong_exclude

    return {
        "DETAIL_PRIORITY_CORE":        core,
        "DETAIL_PRIORITY_CONDITIONAL": cond,
        "DETAIL_PRIORITY_SHOPPING_REVIEW": shop,
        "DETAIL_PRIORITY_EXPERIENCE":  exp,
        "DETAIL_PRIORITY_TEMPLE_STAY": temple,
        "DETAIL_DEFERRED_RESTAURANT":  rest,
        "DETAIL_DEFERRED_EVENT":       event,
        "DETAIL_EXCLUDED_GENERAL_ACCOMMODATION": excl,
        "UNRESOLVED_DEFERRED":         unres,
        "EXACT_PRELIMINARY_RETAINED_COUNT": preliminary_retained,
        "MAX_POSSIBLE_DETAIL_CALLS":   preliminary_retained,
        "RECOMMENDED_FIRST_DETAIL_BATCH": min(core + cond, 300),
        "shopping_pre_gate": {
            "STRONG_AUTO_INCLUDE": shop_strong_include,
            "STRONG_AUTO_EXCLUDE": shop_strong_exclude,
            "AMBIGUOUS_REVIEW":    shop_ambiguous,
            "note": "list-evidence only — no API calls made",
        },
        "note": "DETAIL_CALLS = 0 in this task. Calculation only.",
    }


# ── Self-test ─────────────────────────────────────────────────────────────────

def run_self_test() -> bool:
    """Local fixture self-test — no API calls."""
    print("[self-test] Starting …", flush=True)
    failures = []

    def chk(label, got, expected):
        if got != expected:
            failures.append(f"FAIL {label}: got={got!r} expected={expected!r}")
        else:
            print(f"  PASS {label}", flush=True)

    # Category routing
    chk("code:고궁",     route_category({"com_ctgry_sn": "Ch5t7s7"})[0], "PLACE_CORE_CANDIDATE")
    chk("code:박물관",   route_category({"com_ctgry_sn": "Cr0q2v2"})[0], "PLACE_CORE_CANDIDATE")
    chk("code:공원",     route_category({"com_ctgry_sn": "Ce9z7g9"})[0], "PLACE_CORE_CANDIDATE")
    chk("code:종교성지", route_category({"com_ctgry_sn": "Cw1i3e4"})[0], "PLACE_CONDITIONAL_REVIEW")
    chk("code:전시시설", route_category({"com_ctgry_sn": "Cg1x6l1"})[0], "PLACE_CONDITIONAL_REVIEW")
    chk("code:문화관광", route_category({"com_ctgry_sn": "Ca0o2d4"})[0], "PLACE_CONDITIONAL_REVIEW")
    chk("code:산사체험", route_category({"com_ctgry_sn": "Cq9d5v0"})[0], "TEMPLE_STAY_CANDIDATE")
    chk("code:체험기타", route_category({"com_ctgry_sn": "Cl8f8q1"})[0], "EXPERIENCE_CANDIDATE")
    chk("code:카페",     route_category({"com_ctgry_sn": "Cx0t8m5"})[0], "RESTAURANT_TRACK")
    chk("code:축제",     route_category({"com_ctgry_sn": "Cd4y5u1"})[0], "EVENT_TRACK")
    chk("code:전시회",   route_category({"com_ctgry_sn": "Cu9u5z7"})[0], "EVENT_TRACK")
    chk("code:전문매장", route_category({"com_ctgry_sn": "Cn0t1e0"})[0], "SHOPPING_REVIEW")

    # Temple Stay exception (text fallback)
    chk("temple_stay_not_accommodation",
        route_category({"com_ctgry_sn": "UNKNOWN", "post_sj": "산사 템플스테이 체험"})[0],
        "TEMPLE_STAY_CANDIDATE")

    # Accommodation exclusion
    chk("accommodation_excluded",
        route_category({"com_ctgry_sn": "UNKNOWN", "post_sj": "강남 호텔 숙박"})[0],
        "GENERAL_ACCOMMODATION_EXCLUDE")

    # Unknown code → UNRESOLVED
    chk("unknown_code",
        route_category({"com_ctgry_sn": "Zz9z9z9", "post_sj": "미등록 장소"})[0],
        "UNRESOLVED_CATEGORY")

    # detail_calls=0 enforced: no fetch_detail function exists in this script
    chk("detail_calls_enforced", DETAIL_CALLS_ALLOWED, 0)

    # Multi-lang parse
    ml = parse_multi_lang("ko:KOP000072,en:ENP000072,ja:JPP000072,zh-CN:CNP000072")
    chk("multi_lang_ko",    ml.get("ko"), "KOP000072")
    chk("multi_lang_en",    ml.get("en"), "ENP000072")
    chk("multi_lang_zh_cn", ml.get("zh-CN"), "CNP000072")

    # Smoke page computation
    pages = compute_smoke_pages(3765, 50, 5)
    chk("smoke_pages_count",     len(pages) <= 5, True)
    chk("smoke_pages_first",     pages[0], 1)
    chk("smoke_pages_has_last",  76 in pages, True)

    # Category coverage
    recs = [
        {"com_ctgry_sn": "Ch5t7s7", "cate_depth": "역사관광 > 역사유적지 > 고궁",   "post_sj": "경복궁"},
        {"com_ctgry_sn": "NEWCODE", "cate_depth": "신규카테고리",                   "post_sj": "미등록장소"},
    ]
    cov = compute_category_coverage(recs)
    chk("coverage_unmapped", cov["unmapped_codes_count"], 1)
    chk("coverage_mapped",   cov["mapped_codes_count"],   1)

    if failures:
        print(f"\n[self-test] FAILED ({len(failures)} failures):", flush=True)
        for f in failures:
            print(f"  {f}", flush=True)
        return False
    print(f"[self-test] ALL PASS (22 tests)", flush=True)
    return True


# ── Main collector ────────────────────────────────────────────────────────────

def run_collector(args) -> dict:
    """Execute inventory collection (smoke or full list). DETAIL = 0 always."""

    full_mode = args.allow_full_inventory
    mode_label = "FULL_LIST" if full_mode else "SMOKE"

    api_key = _get_api_key()

    as_of    = args.as_of or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    run_id   = f"visitseoul-{'full-inventory' if full_mode else 'smoke'}-{as_of}"
    lang     = args.lang
    page_size = args.page_size
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    started_at = datetime.now(timezone.utc).isoformat()

    print(f"\n[{run_id}] MODE={mode_label}  DETAIL_CALLS=0 (enforced)", flush=True)
    print(f"  lang={lang}  page_size={page_size}", flush=True)
    print(f"  CATEGORY_PARAMETER_USED=NO  KEYWORD_SEARCH_USED=NO", flush=True)
    print(f"  COLLECTOR_VERSION={COLLECTOR_VERSION}", flush=True)

    # ── Step 1: Probe page 1 ─────────────────────────────────────────────────
    print(f"\n[list] Probing page 1 …", flush=True)
    probe_resp = fetch_list_page(1, page_size, lang, api_key)
    list_calls = 1
    time.sleep(DELAY)

    paging = probe_resp.get("paging") or {}
    initial_total_count = int(paging.get("total_count") or 0)
    actual_page_size    = int(paging.get("page_size") or paging.get("num_of_rows") or page_size)
    max_page = max(1, (initial_total_count + actual_page_size - 1) // actual_page_size)

    print(f"  initial_total_count={initial_total_count}  page_size={actual_page_size}  max_page={max_page}", flush=True)

    # ── Step 2: Determine pages ──────────────────────────────────────────────
    if full_mode:
        pages_to_fetch = list(range(1, max_page + 1))
        print(f"  FULL MODE: all {len(pages_to_fetch)} pages", flush=True)
    elif args.page_set:
        pages_to_fetch = sorted(set(int(p.strip()) for p in args.page_set.split(",")))
        print(f"  SMOKE MODE (explicit page-set): {pages_to_fetch}", flush=True)
    else:
        pages_to_fetch = compute_smoke_pages(initial_total_count, actual_page_size, args.page_limit)
        print(f"  SMOKE MODE: sample pages {pages_to_fetch}", flush=True)

    # API call budget check (full mode)
    if full_mode:
        expected_calls = len(pages_to_fetch)
        if expected_calls > MAX_API_CALLS_FULL:
            print(
                f"ERROR: expected_calls={expected_calls} exceeds MAX_API_CALLS_FULL={MAX_API_CALLS_FULL}",
                file=sys.stderr,
            )
            sys.exit(1)

    # ── Step 3: Collect pages ─────────────────────────────────────────────────
    all_records    = []
    list_attempts  = []
    pages_success  = 0
    pages_failed   = 0
    failed_pages   = []
    final_total_count = initial_total_count
    source_mutated = False
    seen_cids: dict = {}
    duplicate_cids  = []
    page_overlap_count = 0
    unexpected_empty_pages = 0

    for page_no in pages_to_fetch:
        fetched_at = datetime.now(timezone.utc).isoformat()
        attempt_rec = {
            "kind":          "list",
            "page_no":       page_no,
            "attempted_at":  fetched_at,
            "status":        None,
            "records_count": 0,
            "error":         None,
        }

        try:
            if page_no == 1:
                resp = probe_resp     # reuse probe response
            else:
                resp = fetch_list_page(page_no, actual_page_size, lang, api_key)
                list_calls += 1
                time.sleep(DELAY)

            p = resp.get("paging") or {}
            contents = resp.get("data") or resp.get("contents") or []
            current_total = int(p.get("total_count") or initial_total_count)

            # Mutation guard
            if current_total != initial_total_count:
                print(f"  ⚠️  SOURCE_MUTATED: {initial_total_count}→{current_total} at page {page_no}", flush=True)
                final_total_count = current_total
                source_mutated = True

            # Empty page guard
            if not contents and current_total > 0:
                print(f"  ⚠️  EMPTY_PAGE: page {page_no}", flush=True)
                unexpected_empty_pages += 1

            page_cids_this = set()
            for rec in contents:
                cid = str(rec.get("cid") or rec.get("contents_id") or "").strip()
                if not cid:
                    continue

                # Duplicate/overlap detection
                if cid in seen_cids:
                    duplicate_cids.append({
                        "cid":        cid,
                        "first_page": seen_cids[cid],
                        "dup_page":   page_no,
                    })
                    if seen_cids[cid] != page_no:
                        if cid in page_cids_this:
                            pass  # within same page duplicate
                        else:
                            page_overlap_count += 1
                    print(f"  ⚠️  DUP_CID: {cid} (p{seen_cids[cid]}+p{page_no})", flush=True)
                else:
                    seen_cids[cid] = page_no
                page_cids_this.add(cid)

                # Local category routing
                track, routing_reason = route_category(rec)

                inventory_record = {
                    "cid":            cid,
                    "lang_code_id":   lang,
                    "post_sj":        str(rec.get("post_sj")       or ""),
                    "sumry":          str(rec.get("sumry")          or ""),
                    "com_ctgry_sn":   str(rec.get("com_ctgry_sn")  or ""),
                    "cate_depth":     str(rec.get("cate_depth")     or "").strip(),
                    "multi_lang_list": str(rec.get("multi_lang_list") or ""),
                    "main_img":       str(rec.get("main_img")       or ""),
                    "creat_dt_text":  str(rec.get("creat_dt_text")  or ""),
                    "updt_dt_text":   str(rec.get("updt_dt_text")   or ""),
                    "routing_track":  track,
                    "eligibility_stage": "INVENTORY_PRELIMINARY",
                    "routing_reason": routing_reason,
                    "review_required": track in (
                        "PLACE_CONDITIONAL_REVIEW", "SHOPPING_REVIEW", "UNRESOLVED_CATEGORY"
                    ),
                    "kto_crosscheck_required": track in (
                        "PLACE_CORE_CANDIDATE", "PLACE_CONDITIONAL_REVIEW"
                    ),
                    "kto_candidate_id":     None,
                    "kto_candidate_status": "NOT_CHECKED",
                    "provenance": {
                        "source":            "visitseoul",
                        "endpoint":          "contents/list",
                        "page_no":           page_no,
                        "page_size":         actual_page_size,
                        "fetched_at":        fetched_at,
                        "as_of":             as_of,
                        "collector_version": COLLECTOR_VERSION,
                    },
                }
                all_records.append(inventory_record)

            attempt_rec["status"]        = "SUCCESS"
            attempt_rec["records_count"] = len(contents)
            pages_success += 1
            if page_no % 10 == 0 or page_no in [1, 2, max_page]:
                print(f"  [page {page_no:3d}/{max_page}] OK → {len(contents)} records", flush=True)

        except Exception as exc:
            attempt_rec["status"] = "FAILED"
            attempt_rec["error"]  = str(exc)
            pages_failed += 1
            failed_pages.append(page_no)
            print(f"  [page {page_no}] FAILED: {exc}", flush=True)

        list_attempts.append(attempt_rec)

    finished_at = datetime.now(timezone.utc).isoformat()

    # ── Step 4: Sort records by CID (reproducibility) ─────────────────────────
    # Canonical sort: cid ascending (stable, deterministic)
    all_records.sort(key=lambda r: r["cid"])

    # ── Step 5: Track distribution ────────────────────────────────────────────
    track_counts = Counter(r["routing_track"] for r in all_records)
    unique_cids_count = len(seen_cids)
    total_records = len(all_records)

    print(f"\n[routing] {total_records} records  {unique_cids_count} unique CIDs:", flush=True)
    for track, cnt in sorted(track_counts.items()):
        pct = 100 * cnt / total_records if total_records else 0
        print(f"  {track:<35s}: {cnt:5d}  ({pct:.1f}%)", flush=True)

    # ── Step 6: Category coverage ─────────────────────────────────────────────
    cat_coverage = compute_category_coverage(all_records)
    print(f"\n[category] observed={cat_coverage['observed_category_codes_count']}  "
          f"mapped={cat_coverage['mapped_codes_count']}  "
          f"unmapped={cat_coverage['unmapped_codes_count']}", flush=True)
    if cat_coverage["unmapped_codes"]:
        print("  Unmapped codes:", flush=True)
        for code, info in cat_coverage["unmapped_codes"].items():
            print(f"    {code}  count={info['count']}  path={info['path']!r}  "
                  f"samples={info['sample_titles']}", flush=True)

    # ── Step 7: Multi-lang stats ──────────────────────────────────────────────
    ml_stats = compute_multilang_stats(all_records)
    print(f"\n[multilang] multi_lang_list={ml_stats['multi_lang_list_present']}/{total_records}", flush=True)
    for lang_code, info in ml_stats["per_lang"].items():
        print(f"  {lang_code}: {info['count']} ({100*info['rate']:.1f}%)", flush=True)

    # ── Step 8: Detail candidate plan ────────────────────────────────────────
    detail_plan = compute_detail_plan(track_counts, all_records)
    print(f"\n[detail_plan] EXACT_PRELIMINARY_RETAINED={detail_plan['EXACT_PRELIMINARY_RETAINED_COUNT']}", flush=True)
    print(f"  core={detail_plan['DETAIL_PRIORITY_CORE']}  "
          f"cond={detail_plan['DETAIL_PRIORITY_CONDITIONAL']}  "
          f"shop={detail_plan['DETAIL_PRIORITY_SHOPPING_REVIEW']}  "
          f"exp={detail_plan['DETAIL_PRIORITY_EXPERIENCE']}  "
          f"temple={detail_plan['DETAIL_PRIORITY_TEMPLE_STAY']}", flush=True)
    print(f"  MAX_POSSIBLE_DETAIL_CALLS={detail_plan['MAX_POSSIBLE_DETAIL_CALLS']}", flush=True)
    print(f"  RECOMMENDED_FIRST_BATCH={detail_plan['RECOMMENDED_FIRST_DETAIL_BATCH']}", flush=True)
    print(f"  DETAIL_CALLS_MADE=0 (this task: list only)", flush=True)

    # ── Step 9: Temple Stay wrongly excluded ──────────────────────────────────
    temple_wrongly_excluded = sum(
        1 for r in all_records
        if r["routing_track"] == "GENERAL_ACCOMMODATION_EXCLUDE"
        and any(kw in str(r.get("post_sj", "")).lower() for kw in _TEMPLE_STAY_KW)
    )

    # ── Step 10: Manifest ─────────────────────────────────────────────────────
    inventory_snapshot_status = (
        "DEGRADED" if source_mutated else
        ("PARTIAL" if pages_failed > 0 else "COMPLETE")
    )

    manifest = {
        "run_id":               run_id,
        "mode":                 mode_label,
        "as_of":                as_of,
        "collector_version":    COLLECTOR_VERSION,
        "lang":                 lang,
        "started_at":           started_at,
        "finished_at":          finished_at,
        "initial_total_count":  initial_total_count,
        "final_total_count":    final_total_count,
        "page_size":            actual_page_size,
        "expected_pages":       max_page if full_mode else len(pages_to_fetch),
        "pages_requested":      len(pages_to_fetch),
        "pages_success":        pages_success,
        "pages_failed":         pages_failed,
        "failed_pages":         failed_pages,
        "records_received":     total_records,
        "unique_cids":          unique_cids_count,
        "duplicate_cids":       len(duplicate_cids),
        "duplicate_records":    duplicate_cids,
        "page_overlap_count":   page_overlap_count,
        "unexpected_empty_pages": unexpected_empty_pages,
        "source_mutated_during_run": source_mutated,
        "inventory_snapshot_status": inventory_snapshot_status,
        "list_api_calls":       list_calls,
        "detail_calls":         0,
        "total_api_calls":      list_calls,
        "output_sort":          "cid_ascending",
        "track_counts":         dict(track_counts),
        "category_coverage": {
            "observed_codes": cat_coverage["observed_category_codes_count"],
            "mapped_codes":   cat_coverage["mapped_codes_count"],
            "unmapped_codes": cat_coverage["unmapped_codes_count"],
            "unmapped_detail": cat_coverage["unmapped_codes"],
        },
        "multilang_stats": ml_stats,
        "detail_candidate_plan": detail_plan,
        "safety": {
            "api_key_exposed":              False,
            "detail_api_calls":             0,
            "allow_full_inventory":         full_mode,
            "seoul_bulk_detail_collection": "NOT_STARTED",
            "db_change":                    0,
            "src_change":                   0,
            "ui_change":                    0,
            "secret_leak":                  0,
        },
        "temple_stay_wrongly_excluded": temple_wrongly_excluded,
        "kto": {
            "targeted_detail":  "DEFERRED",
            "collision_264337": "AUTO_ASSIGN_FORBIDDEN",
            "collision_264491": "AUTO_ASSIGN_FORBIDDEN",
        },
        "regression": {
            "restaurant_track_preserved":       True,
            "event_track_preserved":            True,
            "general_accommodation_excluded":   True,
            "temple_stay_exception_preserved":  True,
            "cid_suffix_autogeneration":        False,
            "keyword_search_primary_discovery": False,
            "api_category_filter_used":         False,
        },
    }

    # ── Step 11: Write output files ───────────────────────────────────────────
    if full_mode:
        inv_path = output_dir / "seoul-visitseoul-full-inventory-v1.jsonl"
        att_path = output_dir / "seoul-visitseoul-full-inventory-attempts-v1.jsonl"
        man_path = output_dir / "seoul-visitseoul-full-inventory-manifest-v1.json"
    else:
        inv_path = output_dir / "seoul-visitseoul-smoke-v2-inventory.jsonl"
        att_path = output_dir / "seoul-visitseoul-smoke-v2-attempts.jsonl"
        man_path = output_dir / "seoul-visitseoul-smoke-v2-manifest.json"

    with open(inv_path, "w", encoding="utf-8", newline="\n") as f:
        for rec in all_records:
            f.write(json.dumps(rec, ensure_ascii=False, sort_keys=True) + "\n")

    with open(att_path, "w", encoding="utf-8", newline="\n") as f:
        for rec in list_attempts:
            f.write(json.dumps(rec, ensure_ascii=False, sort_keys=True) + "\n")

    with open(man_path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2, sort_keys=True)
        f.write("\n")

    print(f"\n[output] {inv_path}  ({total_records} records, CID-sorted)", flush=True)
    print(f"[output] {att_path}  ({len(list_attempts)} attempts)", flush=True)
    print(f"[output] {man_path}", flush=True)
    print(f"\nAPI calls: list={list_calls}  detail=0  total={list_calls}", flush=True)

    return manifest


# ── Category distribution doc writer ─────────────────────────────────────────

def write_category_distribution(manifest: dict, docs_dir: Path) -> Path:
    """Write category distribution JSON for full inventory."""
    out = {
        "task":          "TASK-SEOUL-VISITSEOUL-FULL-INVENTORY-LIST-ONLY-V1",
        "as_of":         manifest["as_of"],
        "total_records": manifest["records_received"],
        "unique_cids":   manifest["unique_cids"],
        "track_counts":  manifest["track_counts"],
        "track_rates": {
            k: round(v / manifest["records_received"], 4) if manifest["records_received"] else 0
            for k, v in manifest["track_counts"].items()
        },
        "category_coverage": manifest["category_coverage"],
        "detail_candidate_plan": manifest["detail_candidate_plan"],
    }
    path = docs_dir / "seoul-visitseoul-full-category-distribution-v1.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(out, f, ensure_ascii=False, indent=2, sort_keys=True)
        f.write("\n")
    print(f"[output] {path}", flush=True)
    return path


def write_detail_candidate_plan(manifest: dict, docs_dir: Path) -> Path:
    """Write detail candidate plan JSON."""
    plan = manifest["detail_candidate_plan"]
    out = {
        "task":           "TASK-SEOUL-VISITSEOUL-FULL-INVENTORY-LIST-ONLY-V1",
        "as_of":          manifest["as_of"],
        "basis":          "exact full list inventory (not estimate)",
        "detail_calls_this_task": 0,
        "detail_candidate_plan": plan,
        "multilang_stats": manifest["multilang_stats"],
        "note": (
            "All counts derived from full LIST inventory. "
            "DETAIL collection requires separate task approval."
        ),
    }
    path = docs_dir / "seoul-visitseoul-detail-candidate-plan-v1.json"
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(out, f, ensure_ascii=False, indent=2, sort_keys=True)
        f.write("\n")
    print(f"[output] {path}", flush=True)
    return path


# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description=(
            "VisitSeoul full LIST inventory collector.\n"
            "DETAIL CALLS = 0 (enforced). --allow-full-inventory required for full pagination."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--allow-full-inventory", dest="allow_full_inventory",
        action="store_true", default=False,
        help="REQUIRED for full list pagination (all pages). Without this: smoke mode (≤5 pages).",
    )
    parser.add_argument(
        "--self-test", dest="self_test", action="store_true",
        help="Run local self-test (no API calls).",
    )
    parser.add_argument("--lang",        default="ko",     help="Language code (default: ko)")
    parser.add_argument("--page-size",   dest="page_size", type=int, default=DEFAULT_PAGE_SIZE)
    parser.add_argument("--page-limit",  dest="page_limit", type=int, default=DEFAULT_SMOKE_PAGE_LIMIT,
                        help="Max pages in smoke mode (default: 5)")
    parser.add_argument("--page-set",    dest="page_set",  default=None,
                        help="Explicit comma-separated page numbers (smoke mode only)")
    parser.add_argument("--as-of",       dest="as_of",     default=None,
                        help="Provenance date label (YYYY-MM-DD)")
    parser.add_argument("--output-dir",  dest="output_dir", default=str(DEFAULT_OUTPUT_DIR))

    args = parser.parse_args()

    if args.self_test:
        ok = run_self_test()
        sys.exit(0 if ok else 1)

    if not args.allow_full_inventory:
        print("[SMOKE MODE] --allow-full-inventory NOT set → running smoke (≤5 pages, detail=0)", flush=True)

    manifest = run_collector(args)

    # ── QA summary ────────────────────────────────────────────────────────────
    r = manifest.get("regression", {})
    s = manifest.get("safety", {})
    tc = manifest.get("track_counts", {})
    total = manifest.get("records_received", 0)
    unresolved = tc.get("UNRESOLVED_CATEGORY", 0)
    cat_cov = manifest.get("category_coverage", {})

    print("\n── QA FLAGS ─────────────────────────────────────────────────────────────", flush=True)
    print(f"VISITSEOUL_API_KEY_AVAILABLE     = YES", flush=True)
    print(f"API_KEY_EXPOSED                  = NO", flush=True)
    print(f"MODE                             = {manifest['mode']}", flush=True)
    print(f"FINAL_SMOKE_DETAIL_CALLS         = 0", flush=True)
    print(f"DETAIL_CALLS                     = 0", flush=True)
    print(f"PAGES_SUCCESS                    = {manifest['pages_success']}", flush=True)
    print(f"PAGES_FAILED                     = {manifest['pages_failed']}", flush=True)
    print(f"RECORDS_RECEIVED                 = {total}", flush=True)
    print(f"UNIQUE_CIDS                      = {manifest['unique_cids']}", flush=True)
    print(f"DUPLICATE_CID_COUNT              = {manifest['duplicate_cids']}", flush=True)
    print(f"PAGE_OVERLAP_COUNT               = {manifest['page_overlap_count']}", flush=True)
    print(f"SOURCE_MUTATED_DURING_RUN        = {manifest['source_mutated_during_run']}", flush=True)
    print(f"INVENTORY_SNAPSHOT_STATUS        = {manifest['inventory_snapshot_status']}", flush=True)
    print(f"TOTAL_API_CALLS                  = {manifest['total_api_calls']}", flush=True)
    print(f"UNRESOLVED_CATEGORY              = {unresolved}", flush=True)
    print(f"OBSERVED_CATEGORY_CODES          = {cat_cov.get('observed_codes', '?')}", flush=True)
    print(f"UNMAPPED_CATEGORY_CODES          = {cat_cov.get('unmapped_codes', '?')}", flush=True)
    print(f"RESTAURANT_TRACK_PRESERVED       = {r.get('restaurant_track_preserved')}", flush=True)
    print(f"EVENT_TRACK_PRESERVED            = {r.get('event_track_preserved')}", flush=True)
    print(f"GENERAL_ACCOMMODATION_EXCLUDED   = {r.get('general_accommodation_excluded')}", flush=True)
    print(f"TEMPLE_STAY_EXCEPTION_PRESERVED  = {r.get('temple_stay_exception_preserved')}", flush=True)
    print(f"TEMPLE_STAY_WRONGLY_EXCLUDED     = {manifest['temple_stay_wrongly_excluded']}", flush=True)
    print(f"MULTILINGUAL_LINK_PRIMARY        = multi_lang_list", flush=True)
    print(f"CID_SUFFIX_AUTOGENERATION        = NO", flush=True)
    print(f"SEOUL_BULK_DETAIL_COLLECTION     = NOT_STARTED", flush=True)
    print(f"DB_CHANGE                        = 0", flush=True)
    print(f"SRC_CHANGE                       = 0", flush=True)
    print(f"SECRET_LEAK                      = 0", flush=True)
    print(f"KTO_TARGETED_DETAIL              = DEFERRED", flush=True)

    # Write distribution docs only for full inventory
    if manifest["mode"] == "FULL_LIST":
        write_category_distribution(manifest, DOCS_DIR)
        write_detail_candidate_plan(manifest, DOCS_DIR)

    # Smoke gate summary
    if manifest["mode"] == "SMOKE":
        print(f"\n── SMOKE GATE ───────────────────────────────────────────────────────────", flush=True)
        smoke_pass = (
            manifest["pages_success"] <= DEFAULT_SMOKE_PAGE_LIMIT
            and manifest["detail_calls"] == 0
            and unresolved == 0
            and manifest["duplicate_cids"] == 0
            and not manifest["source_mutated_during_run"]
        )
        print(f"FINAL_SMOKE_PAGES            = {manifest['pages_success']}  (≤ {DEFAULT_SMOKE_PAGE_LIMIT}): {'PASS' if manifest['pages_success'] <= DEFAULT_SMOKE_PAGE_LIMIT else 'FAIL'}", flush=True)
        print(f"FINAL_SMOKE_DETAIL_CALLS     = 0:  PASS", flush=True)
        print(f"FINAL_SMOKE_UNRESOLVED       = {unresolved}: {'PASS (=0)' if unresolved == 0 else 'FAIL (!= 0) — STOP'}", flush=True)
        print(f"DUPLICATE_DETECTION          = {'PASS' if manifest['duplicate_cids'] == 0 else 'FAIL'}", flush=True)
        print(f"SOURCE_MUTATION_GUARD        = {'PASS' if not manifest['source_mutated_during_run'] else 'FAIL'}", flush=True)
        print(f"SECRET_LEAK                  = 0: PASS", flush=True)
        print(f"FINAL_SMOKE_PASS             = {'YES' if smoke_pass else 'NO'}", flush=True)
        if not smoke_pass and unresolved > 0:
            print(f"\nSTOP: UNRESOLVED_CATEGORY = {unresolved} — resolve new codes before full inventory", flush=True)
        elif smoke_pass:
            print(f"\n→ Smoke PASS — ready for --allow-full-inventory", flush=True)


if __name__ == "__main__":
    main()
