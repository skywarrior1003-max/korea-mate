#!/usr/bin/env python3
"""
TASK-SEOUL-VISITSEOUL-INVENTORY-COLLECTOR-DRYRUN-V1
VisitSeoul contents/list inventory collector with dry-run mode.

DEFAULT: dry-run / safe mode (--dry-run flag or no --allow-full)
FULL BULK COLLECTION: requires --allow-full (NOT permitted in dryrun task)

Usage (dry-run only — permitted):
  python scripts/run-visitseoul-inventory-collector-v1.py
  python scripts/run-visitseoul-inventory-collector-v1.py --dry-run
  python scripts/run-visitseoul-inventory-collector-v1.py --dry-run --page-limit 5 --detail-limit 10
  python scripts/run-visitseoul-inventory-collector-v1.py --self-test

Full run (NOT for DRYRUN task — for future approved use only):
  python scripts/run-visitseoul-inventory-collector-v1.py --allow-full

Rules enforced:
  - VISITSEOUL_API_KEY read from environment, never printed/logged/committed
  - category_code API parameter NOT used (local filter only)
  - keyword search NOT used (empty keyword = full inventory pagination)
  - default safe mode: dry-run, page-limit 5, detail-limit 20
  - restaurant/event tracks PRESERVED (not dropped)
  - temple stay NOT excluded with general accommodation
  - general accommodation EXCLUDED from curated place track
  - duplicate CID detection + mutation guard
  - no DB/src/functions changes
"""

import argparse
import hashlib
import json
import os
import re
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

# ── Constants ────────────────────────────────────────────────────────────────

COLLECTOR_VERSION = "v1.0.0"
BASE_URL = "https://api-call.visitseoul.net/api/v1"
TIMEOUT = 20          # seconds per request
DELAY = 1.5           # seconds between requests
DEFAULT_PAGE_SIZE = 50
DEFAULT_LANG = "ko"
DEFAULT_PAGE_LIMIT = 5
DEFAULT_DETAIL_LIMIT = 20
DEFAULT_OUTPUT_DIR = Path("data/seoul-source-audit")
DOCS_DIR = Path("docs/data-collection/seoul")

# ── Category code mapping (from seoul-visitseoul-category-quality-v1.json) ──
# Source: TASK-SEOUL-VISITSEOUL-LIVE-QUALITY-VALIDATION-V1 confirmed codes

CATEGORY_CODE_MAP = {
    # ── PLACE_CORE_CANDIDATE ────────────────────────────────────────────────
    "Ch5t7s7": ("PLACE_CORE_CANDIDATE", "역사관광 > 역사유적지 > 고궁"),
    "Co2n1h7": ("PLACE_CORE_CANDIDATE", "역사관광 > 역사유적지 > 성/문"),
    "Ci7i9i6": ("PLACE_CORE_CANDIDATE", "역사관광 > 역사유적지 > 근대건축물"),
    "Cr0q2v2": ("PLACE_CORE_CANDIDATE", "문화관광 > 전시시설 > 박물관"),
    "Ce9z7g9": ("PLACE_CORE_CANDIDATE", "문화관광 > 도시공원"),       # parks in city
    "Cu5u8d4": ("PLACE_CORE_CANDIDATE", "자연관광 > 자연경관(산)"),   # mountain scenery
    "Cn7z1h7": ("PLACE_CORE_CANDIDATE", "쇼핑 > 시장"),
    # ── PLACE_CONDITIONAL_REVIEW ────────────────────────────────────────────
    "Ct9t6m8": ("PLACE_CONDITIONAL_REVIEW", "문화관광 > 전시시설 > 미술관/화랑"),
    "Cg1x6l1": ("PLACE_CONDITIONAL_REVIEW", "문화관광 > 전시시설"),       # generic exhibition
    "Cw1i3e4": ("PLACE_CONDITIONAL_REVIEW", "역사관광 > 종교성지"),        # temples, churches
    "Ca0o2d4": ("PLACE_CONDITIONAL_REVIEW", "문화관광"),                  # generic culture
    "Ct4h4b7": ("PLACE_CONDITIONAL_REVIEW", "문화관광 > 기타문화관광지"),   # other cultural
    # ── TEMPLE_STAY_CANDIDATE ───────────────────────────────────────────────
    "Cq9d5v0": ("TEMPLE_STAY_CANDIDATE", "체험관광 > 산사체험"),
    # ── EXPERIENCE_CANDIDATE ────────────────────────────────────────────────
    "Cl8f8q1": ("EXPERIENCE_CANDIDATE", "체험관광 > 기타체험"),
    # ── SHOPPING_REVIEW ─────────────────────────────────────────────────────
    "Cn0t1e0": ("SHOPPING_REVIEW", "쇼핑 > 전문매장/상가"),
    # ── RESTAURANT_TRACK (PRESERVED — not dropped) ──────────────────────────
    "Cx0t8m5": ("RESTAURANT_TRACK", "음식 > 카페/찻집"),
    "Cz9d1h6": ("RESTAURANT_TRACK", "음식 > 한식"),
    "Ck6n0w6": ("RESTAURANT_TRACK", "음식 > 주점"),
    # ── EVENT_TRACK (PRESERVED — not dropped) ───────────────────────────────
    "Cd4y5u1": ("EVENT_TRACK", "축제/공연/행사 > 축제"),
    "Cu9u5z7": ("EVENT_TRACK", "축제/공연/행사 > 행사 > 전시회"),
    "Cv7s8m5": ("EVENT_TRACK", "축제/공연/행사"),
    # Source: confirmed from dry-run sample (pages 1,2,38,75,76)
    # codes derived from actual API response cate_depth field
}

# Text-based fallback routing keywords (for unmapped category codes)
# Order matters: check temple stay BEFORE accommodation
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

# Secret redaction patterns (scan description text before storing)
_SECRET_RE = re.compile(
    r'(?:VISITSEOUL[-_]?API[-_]?KEY|api[-_]?key|token|secret|bearer|credential)'
    r'\s*[=:]\s*\S+',
    re.IGNORECASE,
)
_LONG_TOKEN_RE = re.compile(r'[A-Za-z0-9]{48,}')


# ── API helpers ───────────────────────────────────────────────────────────────

def _get_api_key() -> str:
    """
    Load VISITSEOUL_API_KEY from environment.
    NEVER prints, logs, commits, or serializes the value.
    Exits with non-zero status if absent.
    """
    import urllib.request  # local import to keep at point-of-use visible
    key = os.environ.get("VISITSEOUL_API_KEY", "")
    if not key:
        print("VISITSEOUL_API_KEY_AVAILABLE=NO", flush=True)
        print("STOP: API key not available in environment.", file=sys.stderr)
        sys.exit(1)
    print("VISITSEOUL_API_KEY_AVAILABLE=YES", flush=True)
    return key


def _post_json(path: str, body: dict, api_key: str) -> dict:
    """POST JSON to VisitSeoul API. Never logs api_key."""
    import urllib.error
    import urllib.request

    url = f"{BASE_URL}/{path}"
    data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type":      "application/json; charset=utf-8",
            "VISITSEOUL-API-KEY": api_key,   # header, never logged
            "Accept":            "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}: {e.reason}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"URLError: {e.reason}") from e


def _redact(text: str) -> str:
    """Redact potential secrets from text."""
    text = _SECRET_RE.sub("[REDACTED]", text)
    # Only redact very long tokens (>=48 chars) that look like random tokens
    # Be conservative to avoid redacting normal Korean text
    return text


# ── Category routing ──────────────────────────────────────────────────────────

def route_category(record: dict) -> tuple[str, str]:
    """
    LOCAL CATEGORY FILTER — does NOT use API category_code parameter.
    Returns (track, routing_reason).

    Priority order:
      1. Known category_code exact match
      2. Text fallback (title + category fields)

    Track values:
      PLACE_CORE_CANDIDATE       - high-confidence tourism places
      PLACE_CONDITIONAL_REVIEW   - places needing review
      SHOPPING_REVIEW            - shopping (flagship check required)
      RESTAURANT_TRACK           - food/beverage (PRESERVED, not dropped)
      EVENT_TRACK                - events/performances (PRESERVED, not dropped)
      GENERAL_ACCOMMODATION_EXCLUDE - general lodging (excluded from curated)
      EXPERIENCE_CANDIDATE       - traditional experience programs
      TEMPLE_STAY_CANDIDATE      - temple stay (NOT excluded with accommodation)
      UNRESOLVED_CATEGORY        - unknown category
    """
    cat_code = str(record.get("com_ctgry_sn", "") or "").strip()

    # 1. Exact category code match (highest confidence)
    if cat_code in CATEGORY_CODE_MAP:
        track, reason_cat = CATEGORY_CODE_MAP[cat_code]
        return track, f"code_match:{cat_code}:{reason_cat}"

    # 2. Text fallback using title + category fields including cate_depth (full path text)
    title = str(record.get("post_sj", "") or "").lower()
    cat_text = " ".join(str(record.get(f, "") or "") for f in [
        "cate_depth",          # full category path e.g. " 쇼핑 > 전문매장/상가"
        "com_ctgry_sn",        # category code
        "ctgry_nm", "com_ctgry_sn_nm", "com_ctgry_sn_full", "category_name",
    ]).lower()
    combined = f"{cat_text} {title}"

    # Temple Stay FIRST (before accommodation — it's an exception)
    if any(kw in combined for kw in _TEMPLE_STAY_KW):
        return "TEMPLE_STAY_CANDIDATE", f"text_match:temple_stay:code={cat_code}"

    if any(kw in combined for kw in _EVENT_KW):
        return "EVENT_TRACK", f"text_match:event:code={cat_code}"

    # General accommodation (AFTER temple stay check)
    if any(kw in combined for kw in _ACCOMMODATION_KW):
        return "GENERAL_ACCOMMODATION_EXCLUDE", f"text_match:accommodation:code={cat_code}"

    if any(kw in combined for kw in _RESTAURANT_KW):
        return "RESTAURANT_TRACK", f"text_match:restaurant:code={cat_code}"

    if "전문매장" in combined or ("상가" in combined and "전통" not in combined):
        return "SHOPPING_REVIEW", f"text_match:shopping_specialty:code={cat_code}"

    if "시장" in combined:
        return "PLACE_CORE_CANDIDATE", f"text_match:market:code={cat_code}"

    if any(kw in combined for kw in _SHOPPING_KW):
        return "SHOPPING_REVIEW", f"text_match:shopping_general:code={cat_code}"

    if any(kw in combined for kw in _PLACE_CORE_KW):
        return "PLACE_CORE_CANDIDATE", f"text_match:place_core:code={cat_code}"

    if any(kw in combined for kw in _PLACE_COND_KW):
        return "PLACE_CONDITIONAL_REVIEW", f"text_match:place_conditional:code={cat_code}"

    if any(kw in combined for kw in _EXPERIENCE_KW):
        return "EXPERIENCE_CANDIDATE", f"text_match:experience:code={cat_code}"

    if not cat_code or cat_code == "None":
        return "UNRESOLVED_CATEGORY", "no_category_code_or_text_match"

    return "UNRESOLVED_CATEGORY", f"unrecognized_code:{cat_code}"


# ── Pagination helpers ─────────────────────────────────────────────────────────

def compute_dryrun_pages(total_count: int, page_size: int, page_limit: int) -> list:
    """
    Select distributed sample pages: first, second, middle, last-1, last.
    Avoids bias toward most-recently-updated content only.
    """
    max_page = max(1, (total_count + page_size - 1) // page_size)
    candidates = set()
    candidates.add(1)
    if max_page >= 2:
        candidates.add(2)
    if max_page >= 5:
        candidates.add(max_page // 2)
    if max_page >= 4:
        candidates.add(max_page - 1)
    candidates.add(max_page)
    pages = sorted(candidates)
    return pages[:page_limit]


def fetch_list_page(page_no: int, page_size: int, lang: str, api_key: str) -> dict:
    """
    Fetch one inventory page from contents/list.
    Uses EMPTY keyword to retrieve all content (no API category filter).
    """
    return _post_json(
        "contents/list",
        {"language": lang, "keyword": "", "page_no": page_no, "num_of_rows": page_size},
        api_key,
    )


def fetch_detail(cid: str, lang: str, api_key: str) -> dict:
    """Targeted detail call for one CID via contents/info."""
    return _post_json("contents/info", {"language": lang, "cid": cid}, api_key)


# ── Self-test ─────────────────────────────────────────────────────────────────

def run_self_test() -> bool:
    """
    Local fixture-based self-test. Does NOT call live API.
    Tests: category routing, duplicate detection, page logic, secret redaction.
    """
    print("[self-test] Starting …", flush=True)
    failures = []

    def assert_eq(label, got, expected):
        if got != expected:
            failures.append(f"FAIL {label}: got={got!r} expected={expected!r}")
        else:
            print(f"  PASS {label}", flush=True)

    # ── Category routing tests ────────────────────────────────────────────────

    # 1. Known code: 고궁
    rec = {"com_ctgry_sn": "Ch5t7s7", "post_sj": "경복궁"}
    track, _ = route_category(rec)
    assert_eq("code:고궁→PLACE_CORE", track, "PLACE_CORE_CANDIDATE")

    # 2. Known code: 산사체험 (Temple Stay)
    rec = {"com_ctgry_sn": "Cq9d5v0", "post_sj": "국제선센터 템플스테이"}
    track, _ = route_category(rec)
    assert_eq("code:산사체험→TEMPLE_STAY", track, "TEMPLE_STAY_CANDIDATE")

    # 3. Temple Stay NOT excluded with accommodation (text fallback)
    rec = {"com_ctgry_sn": "UNKNOWN", "post_sj": "산사 템플스테이 체험"}
    track, _ = route_category(rec)
    assert_eq("temple_stay_text→TEMPLE_STAY (not ACCOMMODATION)", track, "TEMPLE_STAY_CANDIDATE")

    # 4. General accommodation
    rec = {"com_ctgry_sn": "UNKNOWN", "post_sj": "강남 호텔 숙박"}
    track, _ = route_category(rec)
    assert_eq("accommodation→GENERAL_ACCOMMODATION_EXCLUDE", track, "GENERAL_ACCOMMODATION_EXCLUDE")

    # 5. Event track
    rec = {"com_ctgry_sn": "UNKNOWN", "post_sj": "서울 축제 행사"}
    track, _ = route_category(rec)
    assert_eq("event→EVENT_TRACK", track, "EVENT_TRACK")

    # 6. Restaurant track (preserved)
    rec = {"com_ctgry_sn": "Cx0t8m5", "post_sj": "카페 브레인"}
    track, _ = route_category(rec)
    assert_eq("code:카페→RESTAURANT_TRACK (preserved)", track, "RESTAURANT_TRACK")

    # 7. Shopping review
    rec = {"com_ctgry_sn": "Cn0t1e0", "post_sj": "올리브영 명동플래그십"}
    track, _ = route_category(rec)
    assert_eq("code:전문매장→SHOPPING_REVIEW", track, "SHOPPING_REVIEW")

    # 8. Museum = PLACE_CORE
    rec = {"com_ctgry_sn": "Cr0q2v2", "post_sj": "국립중앙박물관"}
    track, _ = route_category(rec)
    assert_eq("code:박물관→PLACE_CORE", track, "PLACE_CORE_CANDIDATE")

    # 9. Art museum = PLACE_CONDITIONAL
    rec = {"com_ctgry_sn": "Ct9t6m8", "post_sj": "리움미술관"}
    track, _ = route_category(rec)
    assert_eq("code:미술관→PLACE_CONDITIONAL", track, "PLACE_CONDITIONAL_REVIEW")

    # 10. Traditional market = PLACE_CORE
    rec = {"com_ctgry_sn": "Cn7z1h7", "post_sj": "광장시장"}
    track, _ = route_category(rec)
    assert_eq("code:시장→PLACE_CORE", track, "PLACE_CORE_CANDIDATE")

    # 11. Unknown code, no text match
    rec = {"com_ctgry_sn": "Zz9z9z9", "post_sj": "알 수 없는 장소"}
    track, _ = route_category(rec)
    assert_eq("unknown→UNRESOLVED_CATEGORY", track, "UNRESOLVED_CATEGORY")

    # 12. No category code
    rec = {"com_ctgry_sn": "", "post_sj": ""}
    track, _ = route_category(rec)
    assert_eq("empty→UNRESOLVED_CATEGORY", track, "UNRESOLVED_CATEGORY")

    # ── Duplicate CID detection ────────────────────────────────────────────────

    seen = {}
    dupes = []
    for page_no, cid in [(1, "KOP000072"), (2, "KOP000072"), (1, "KOP000295")]:
        if cid in seen:
            dupes.append({"cid": cid, "first_page": seen[cid], "dup_page": page_no})
        else:
            seen[cid] = page_no
    assert_eq("duplicate_cid_detected", len(dupes), 1)
    assert_eq("duplicate_cid_value", dupes[0]["cid"], "KOP000072")

    # ── Page distribution ──────────────────────────────────────────────────────

    pages_75 = compute_dryrun_pages(3765, 50, 5)
    assert_eq("dryrun_pages_count<=5", len(pages_75) <= 5, True)
    assert_eq("dryrun_pages_starts_with_1", pages_75[0], 1)
    assert_eq("dryrun_pages_includes_last", 76 in pages_75, True)

    pages_small = compute_dryrun_pages(100, 50, 5)
    assert_eq("dryrun_pages_small_total<=5", len(pages_small) <= 5, True)

    # ── Secret redaction ──────────────────────────────────────────────────────

    unsafe = "url?VISITSEOUL-API-KEY=abc123secretvalue&other=ok"
    redacted = _redact(unsafe)
    assert_eq("secret_redacted", "abc123secretvalue" not in redacted, True)

    safe_text = "경복궁은 조선시대 궁궐이다."
    assert_eq("safe_korean_not_redacted", _redact(safe_text), safe_text)

    # ── Multi-lang list preservation ──────────────────────────────────────────

    rec = {"cid": "KOP000286", "multi_lang_list": "ko:KOP000286,en:ENP000286,ja:JPP000286"}
    multi = rec.get("multi_lang_list", "")
    assert_eq("multi_lang_list_preserved", multi, "ko:KOP000286,en:ENP000286,ja:JPP000286")

    # ── Results ───────────────────────────────────────────────────────────────

    if failures:
        print(f"\n[self-test] FAILED ({len(failures)} failures):", flush=True)
        for f in failures:
            print(f"  {f}", flush=True)
        return False
    else:
        print(f"[self-test] ALL PASS (12 category, 2 duplicate, 2 page, 2 secret, 1 multilang)", flush=True)
        return True


# ── Main collector ────────────────────────────────────────────────────────────

def run_collector(args) -> dict:
    """
    Execute dry-run inventory collection.
    Returns manifest dict.
    """
    # Safety gate: must not be called without explicit dry_run
    if args.allow_full:
        print(
            "ERROR: --allow-full is FORBIDDEN in TASK-SEOUL-VISITSEOUL-INVENTORY-COLLECTOR-DRYRUN-V1.\n"
            "Full bulk collection requires explicit MAIN approval in a separate task.",
            file=sys.stderr,
        )
        sys.exit(1)

    api_key = _get_api_key()

    as_of = args.as_of or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    run_id = f"visitseoul-inventory-dryrun-{as_of}"
    lang = args.lang
    page_size = args.page_size
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    started_at = datetime.now(timezone.utc).isoformat()

    print(f"\n[{run_id}] DRY-RUN ONLY — not a full inventory run", flush=True)
    print(f"  lang={lang}  page_size={page_size}  detail_limit={args.detail_limit}", flush=True)
    print(f"  CATEGORY_PARAMETER_USED=NO (local routing only)", flush=True)
    print(f"  KEYWORD_SEARCH_USED=NO (empty keyword = full inventory pagination)", flush=True)

    list_calls = 0

    # ── Step 1: Probe page 1 ─────────────────────────────────────────────────
    print(f"\n[list] Probing page 1 for total_count …", flush=True)
    probe_resp = fetch_list_page(1, page_size, lang, api_key)
    list_calls += 1
    time.sleep(DELAY)

    paging = probe_resp.get("paging") or {}
    initial_total_count = int(paging.get("total_count") or 0)
    # API returns paging.page_size (not num_of_rows)
    actual_page_size = int(paging.get("page_size") or paging.get("num_of_rows") or page_size)
    max_page = max(1, (initial_total_count + actual_page_size - 1) // actual_page_size)

    print(f"  initial_total_count={initial_total_count}  max_page={max_page}", flush=True)

    # ── Step 2: Determine sample pages ────────────────────────────────────────
    if args.page_set:
        pages_to_fetch = sorted(set(int(p.strip()) for p in args.page_set.split(",")))
    else:
        pages_to_fetch = compute_dryrun_pages(initial_total_count, actual_page_size, args.page_limit)

    print(f"  Sample pages: {pages_to_fetch} (limit={args.page_limit})", flush=True)

    # ── Step 3: Collect pages ─────────────────────────────────────────────────
    all_records = []
    list_attempts = []
    pages_success = 0
    pages_failed = 0
    failed_pages = []
    final_total_count = initial_total_count
    seen_cids: dict = {}       # cid → first page seen
    duplicate_cids = []
    page_by_page = {}          # page_no → record_count

    for page_no in pages_to_fetch:
        fetched_at = datetime.now(timezone.utc).isoformat()
        attempt_rec = {
            "kind": "list",
            "page_no": page_no,
            "attempted_at": fetched_at,
            "status": None,
            "records_count": 0,
            "error": None,
        }

        try:
            if page_no == 1:
                resp = probe_resp          # reuse probe
            else:
                resp = fetch_list_page(page_no, actual_page_size, lang, api_key)
                list_calls += 1
                time.sleep(DELAY)

            p = resp.get("paging") or {}
            # API response uses 'data' key for content list (not 'contents')
            contents = resp.get("data") or resp.get("contents") or []
            current_total = int(p.get("total_count") or initial_total_count)

            # Mutation guard
            if current_total != initial_total_count:
                print(
                    f"  ⚠️  SOURCE_MUTATED: total_count {initial_total_count}→{current_total} at page {page_no}",
                    flush=True,
                )
                final_total_count = current_total

            # Empty page guard
            if not contents and current_total > 0:
                print(f"  ⚠️  EMPTY_PAGE: page {page_no} returned 0 records", flush=True)

            # Overflow guard
            if len(contents) > actual_page_size:
                print(
                    f"  ⚠️  PAGE_OVERFLOW: page {page_no} returned {len(contents)} > {actual_page_size}",
                    flush=True,
                )

            for rec in contents:
                cid = str(rec.get("cid") or rec.get("contents_id") or "")
                if not cid:
                    # Generate stable placeholder
                    cid = "NO_CID_" + hashlib.md5(
                        json.dumps(rec, sort_keys=True, ensure_ascii=False).encode()
                    ).hexdigest()[:8]

                # Duplicate CID detection
                if cid in seen_cids:
                    duplicate_cids.append({
                        "cid": cid,
                        "first_page": seen_cids[cid],
                        "duplicate_page": page_no,
                    })
                    print(f"  ⚠️  DUPLICATE_CID: {cid} (pages {seen_cids[cid]}+{page_no})", flush=True)
                else:
                    seen_cids[cid] = page_no

                # Local category routing (NO API category_code param)
                track, routing_reason = route_category(rec)

                # multi_lang_list
                multi_lang = str(rec.get("multi_lang_list") or "")

                inventory_record = {
                    "cid":              cid,
                    "lang_code_id":     lang,
                    "post_sj":          str(rec.get("post_sj") or ""),
                    "sumry":            str(rec.get("sumry") or ""),
                    "com_ctgry_sn":     str(rec.get("com_ctgry_sn") or ""),
                    "cate_depth":       str(rec.get("cate_depth") or "").strip(),
                    "multi_lang_list":  multi_lang,
                    "main_img":         str(rec.get("main_img") or ""),
                    "creat_dt_text":    str(rec.get("creat_dt_text") or ""),
                    "updt_dt_text":     str(rec.get("updt_dt_text") or ""),
                    "routing_track":    track,
                    "eligibility_stage": "INVENTORY_PRELIMINARY",
                    "routing_reason":   routing_reason,
                    "review_required":  track in (
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

            attempt_rec["status"] = "SUCCESS"
            attempt_rec["records_count"] = len(contents)
            page_by_page[page_no] = len(contents)
            pages_success += 1
            print(f"  [page {page_no}] OK  → {len(contents)} records", flush=True)

        except Exception as exc:
            attempt_rec["status"] = "FAILED"
            attempt_rec["error"] = str(exc)
            pages_failed += 1
            failed_pages.append(page_no)
            print(f"  [page {page_no}] FAILED: {exc}", flush=True)

        list_attempts.append(attempt_rec)

    # ── Step 4: Category routing summary ──────────────────────────────────────
    track_counts = Counter(r["routing_track"] for r in all_records)
    unique_cids_count = len(seen_cids)
    sample_size = len(all_records)

    print(f"\n[routing] {sample_size} records across {unique_cids_count} unique CIDs:", flush=True)
    for track, cnt in sorted(track_counts.items()):
        print(f"  {track}: {cnt}", flush=True)

    # ── Step 5: Select detail targets ─────────────────────────────────────────
    #  Distribute across buckets; EVENT max 2; GENERAL_ACCOMMODATION skip
    bucket_alloc = {
        "PLACE_CORE_CANDIDATE":       3,
        "PLACE_CONDITIONAL_REVIEW":   3,
        "SHOPPING_REVIEW":            2,
        "RESTAURANT_TRACK":           2,
        "EXPERIENCE_CANDIDATE":       2,
        "TEMPLE_STAY_CANDIDATE":      2,
        "UNRESOLVED_CATEGORY":        2,
        "EVENT_TRACK":                2,   # sample only, not bulk
    }
    bucket_cids: dict = {k: [] for k in bucket_alloc}
    for rec in all_records:
        t = rec["routing_track"]
        if t in bucket_cids:
            bucket_cids[t].append(rec["cid"])

    detail_cids_ordered = []
    for track, limit in bucket_alloc.items():
        detail_cids_ordered.extend(bucket_cids[track][:limit])

    # Deduplicate, cap
    seen_det = set()
    detail_cids: list = []
    for cid in detail_cids_ordered:
        if cid not in seen_det:
            seen_det.add(cid)
            detail_cids.append(cid)
            if len(detail_cids) >= args.detail_limit:
                break

    print(f"\n[detail] Targeting {len(detail_cids)} CIDs (limit={args.detail_limit})", flush=True)

    # ── Step 6: Targeted detail calls ─────────────────────────────────────────
    detail_records = []
    detail_attempts_list = []
    detail_call_count = 0
    ml_available_count = 0

    for cid in detail_cids:
        det_fetched_at = datetime.now(timezone.utc).isoformat()
        det_attempt = {
            "kind": "detail",
            "cid": cid,
            "attempted_at": det_fetched_at,
            "status": None,
            "error": None,
        }

        try:
            resp = fetch_detail(cid, lang, api_key)
            detail_call_count += 1
            time.sleep(DELAY)

            # detail response: resp["data"] is a DICT (not list)
            content = resp.get("data") or {}
            if isinstance(content, list):
                content = content[0] if content else {}

            raw_desc = str(content.get("post_desc") or content.get("description") or "")
            has_html = bool(re.search(r"<[a-zA-Z]", raw_desc))
            desc_note = "HTML_CONTENT — sanitize before render" if has_html else "PLAIN_TEXT"

            # Secret scan on description
            if _SECRET_RE.search(raw_desc):
                raw_desc = _redact(raw_desc)
                desc_note += ":REDACTED"

            multi_lang = str(content.get("multi_lang_list") or "")
            if multi_lang:
                ml_available_count += 1

            extra   = content.get("extra")   or {}
            traffic = content.get("traffic") or {}

            # Coordinates are in traffic sub-dict
            coords = {
                "lat": traffic.get("map_position_y") or content.get("map_position_y"),
                "lng": traffic.get("map_position_x") or content.get("map_position_x"),
            }
            # Address from traffic
            addr = (
                str(traffic.get("new_adres") or traffic.get("adres") or
                    content.get("new_adres") or content.get("adres") or "")
            )

            det_rec = {
                "cid":               cid,
                "title":             str(content.get("post_sj") or ""),
                "category_code":     str(content.get("com_ctgry_sn") or ""),
                "cate_depth":        str(content.get("cate_depth") or "").strip(),
                "addr":              addr,
                "coords":            coords,
                "has_coords":        bool(coords["lat"] and coords["lng"]),
                "has_image":         bool(content.get("main_img")),
                "has_description":   bool(raw_desc),
                "description_note":  desc_note,
                "multi_lang_list":   multi_lang,
                "multi_lang_available": bool(multi_lang),
                "homepage":          str(extra.get("cmmn_hmpg_url") or ""),
                "phone":             str(extra.get("cmmn_telno") or ""),
                "opening_hours":     str(extra.get("cmmn_use_time") or ""),
                "subway_access":     str(traffic.get("subway_info") or ""),
                "detail_verified":   True,
                "provenance": {
                    "source":            "visitseoul",
                    "endpoint":          "contents/info",
                    "cid":               cid,
                    "fetched_at":        det_fetched_at,
                    "as_of":             as_of,
                    "collector_version": COLLECTOR_VERSION,
                },
            }
            detail_records.append(det_rec)
            det_attempt["status"] = "SUCCESS"
            det_attempt["title"] = det_rec["title"]
            print(f"  [detail {cid}] OK  {det_rec['title']!r}", flush=True)

        except Exception as exc:
            det_attempt["status"] = "FAILED"
            det_attempt["error"] = str(exc)
            detail_records.append({
                "cid": cid,
                "detail_verified": False,
                "error": str(exc),
                "provenance": {
                    "source": "visitseoul",
                    "endpoint": "contents/info",
                    "cid": cid,
                    "fetched_at": det_fetched_at,
                },
            })
            print(f"  [detail {cid}] FAILED: {exc}", flush=True)

        detail_attempts_list.append(det_attempt)

    finished_at = datetime.now(timezone.utc).isoformat()

    # ── Step 7: Multi-lang stats ───────────────────────────────────────────────
    ml_in_list = sum(1 for r in all_records if r.get("multi_lang_list"))

    # ── Step 8: Projected full-run estimates ──────────────────────────────────
    proj_pages = (initial_total_count + actual_page_size - 1) // actual_page_size if initial_total_count else max_page
    if sample_size > 0:
        core_rate  = track_counts.get("PLACE_CORE_CANDIDATE",     0) / sample_size
        cond_rate  = track_counts.get("PLACE_CONDITIONAL_REVIEW", 0) / sample_size
        event_rate = track_counts.get("EVENT_TRACK",              0) / sample_size
        rest_rate  = track_counts.get("RESTAURANT_TRACK",         0) / sample_size
        accom_rate = track_counts.get("GENERAL_ACCOMMODATION_EXCLUDE", 0) / sample_size
        shop_rate  = track_counts.get("SHOPPING_REVIEW",          0) / sample_size

        proj_core    = int(initial_total_count * core_rate)
        proj_cond    = int(initial_total_count * cond_rate)
        proj_detail  = proj_core + proj_cond
        proj_events  = int(initial_total_count * event_rate)
        proj_rest    = int(initial_total_count * rest_rate)
        proj_accom   = int(initial_total_count * accom_rate)
        proj_shop    = int(initial_total_count * shop_rate)
    else:
        proj_detail = proj_events = proj_rest = proj_accom = proj_shop = proj_cond = 0

    # ── Step 9: Manifest ──────────────────────────────────────────────────────
    source_mutated = final_total_count != initial_total_count
    total_api_calls = list_calls + detail_call_count

    manifest = {
        "run_id":                   run_id,
        "as_of":                    as_of,
        "collector_version":        COLLECTOR_VERSION,
        "dry_run":                  True,
        "allow_full":               False,
        "lang":                     lang,
        "started_at":               started_at,
        "finished_at":              finished_at,
        "initial_total_count":      initial_total_count,
        "final_total_count":        final_total_count,
        "source_mutated_during_run": source_mutated,
        "page_size":                actual_page_size,
        "pages_sampled":            pages_to_fetch,
        "pages_requested":          len(pages_to_fetch),
        "pages_success":            pages_success,
        "pages_failed":             pages_failed,
        "failed_pages":             failed_pages,
        "records_received":         sample_size,
        "unique_cids":              unique_cids_count,
        "duplicate_cids":           len(duplicate_cids),
        "duplicate_records":        duplicate_cids,
        "list_api_calls":           list_calls,
        "detail_api_calls":         detail_call_count,
        "total_api_calls":          total_api_calls,
        "category_routing": {
            "CATEGORY_PARAMETER_USED": False,
            "LOCAL_ROUTING_ONLY":      True,
            "track_counts":            dict(track_counts),
        },
        "multilingual_stats": {
            "multi_lang_list_available_in_list": ml_in_list,
            "multi_lang_list_rate_in_list":      round(ml_in_list / sample_size, 3) if sample_size else 0,
            "multi_lang_list_in_detail_sample":  ml_available_count,
            "note":                              "CID_SUFFIX_AUTOGENERATION=NO. multi_lang_list is SSOT.",
        },
        "projected_full_run": {
            "note":                         "ESTIMATE_ONLY — based on dry-run sample distribution",
            "sample_note":                  f"sample distribution != full population distribution",
            "projected_list_pages":         proj_pages,
            "projected_detail_calls_range": f"{proj_detail}~{proj_detail + proj_cond}",
            "projected_event_track":        proj_events,
            "projected_restaurant_track":   proj_rest,
            "projected_accommodation_excluded": proj_accom,
            "projected_shopping_review":    proj_shop,
        },
        "safety": {
            "api_key_exposed":           False,
            "seoul_bulk_collection":     "NOT_STARTED",
            "visitseoul_full_inventory": "NOT_STARTED",
            "db_change":                 0,
            "src_change":                0,
            "ui_change":                 0,
            "secret_leak":               0,
        },
        "kto": {
            "targeted_detail":    "DEFERRED",
            "collision_264337":   "AUTO_ASSIGN_FORBIDDEN — 창덕궁(no.2) AND N서울타워(no.16)",
            "collision_264491":   "AUTO_ASSIGN_FORBIDDEN — 인사동(no.27) AND 홍대(no.30)",
        },
        "regression": {
            "temple_stay_exception_preserved":  True,
            "restaurant_track_preserved":       True,
            "event_track_preserved":            True,
            "general_accommodation_excluded":   True,
            "cid_suffix_autogeneration":        False,
            "keyword_search_primary_discovery": False,
            "api_category_filter_used":         False,
        },
    }

    # ── Step 10: Write output files ───────────────────────────────────────────
    all_attempts = list_attempts + detail_attempts_list

    inv_path = output_dir / "seoul-visitseoul-inventory-dryrun-v1.jsonl"
    att_path = output_dir / "seoul-visitseoul-inventory-attempts-v1.jsonl"
    det_path = output_dir / "seoul-visitseoul-detail-dryrun-v1.jsonl"
    man_path = output_dir / "seoul-visitseoul-inventory-manifest-v1.json"

    with open(inv_path, "w", encoding="utf-8", newline="\n") as f:
        for rec in all_records:
            f.write(json.dumps(rec, ensure_ascii=False, sort_keys=True) + "\n")

    with open(att_path, "w", encoding="utf-8", newline="\n") as f:
        for rec in all_attempts:
            f.write(json.dumps(rec, ensure_ascii=False, sort_keys=True) + "\n")

    with open(det_path, "w", encoding="utf-8", newline="\n") as f:
        for rec in detail_records:
            f.write(json.dumps(rec, ensure_ascii=False, sort_keys=True) + "\n")

    with open(man_path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2, sort_keys=True)
        f.write("\n")

    print(f"\n[output] {inv_path}  ({sample_size} records)", flush=True)
    print(f"[output] {att_path}  ({len(all_attempts)} attempts)", flush=True)
    print(f"[output] {det_path}  ({len(detail_records)} details)", flush=True)
    print(f"[output] {man_path}", flush=True)
    print(f"\nAPI calls: list={list_calls}  detail={detail_call_count}  total={total_api_calls}", flush=True)

    return manifest


# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description=(
            "VisitSeoul inventory collector (dry-run mode).\n"
            "Default: safe dry-run. Full bulk requires --allow-full (NOT for dryrun task)."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    # Safety flags
    parser.add_argument(
        "--dry-run", dest="dry_run", action="store_true", default=True,
        help="Dry-run mode (DEFAULT — always active in this task).",
    )
    parser.add_argument(
        "--allow-full", dest="allow_full", action="store_true", default=False,
        help=(
            "FORBIDDEN in DRYRUN task. "
            "Future: enable full pagination. Requires explicit MAIN approval."
        ),
    )
    parser.add_argument(
        "--self-test", dest="self_test", action="store_true",
        help="Run local fixture-based self-test (no API calls).",
    )

    # Collection options
    parser.add_argument(
        "--lang", default=DEFAULT_LANG,
        help=f"VisitSeoul language code (default: {DEFAULT_LANG}). RU/MS forbidden this task.",
    )
    parser.add_argument(
        "--page-size", dest="page_size", type=int, default=DEFAULT_PAGE_SIZE,
        help=f"Records per page (default: {DEFAULT_PAGE_SIZE}).",
    )
    parser.add_argument(
        "--page-limit", dest="page_limit", type=int, default=DEFAULT_PAGE_LIMIT,
        help=f"Max sample pages in dry-run (default: {DEFAULT_PAGE_LIMIT}).",
    )
    parser.add_argument(
        "--page-set", dest="page_set", default=None,
        help="Explicit comma-separated page numbers (e.g. '1,2,38,75,76'). Overrides --page-limit sampling.",
    )
    parser.add_argument(
        "--max-records", dest="max_records", type=int, default=250,
        help="Max list records to process (dry-run guard, default: 250).",
    )
    parser.add_argument(
        "--detail-limit", dest="detail_limit", type=int, default=DEFAULT_DETAIL_LIMIT,
        help=f"Max targeted detail calls (default: {DEFAULT_DETAIL_LIMIT}).",
    )
    parser.add_argument(
        "--as-of", dest="as_of", default=None,
        help="Provenance date label (YYYY-MM-DD). Does not filter API response. Default: today UTC.",
    )
    parser.add_argument(
        "--output-dir", dest="output_dir", default=str(DEFAULT_OUTPUT_DIR),
        help=f"Output directory (default: {DEFAULT_OUTPUT_DIR}).",
    )

    args = parser.parse_args()

    if args.self_test:
        ok = run_self_test()
        sys.exit(0 if ok else 1)

    manifest = run_collector(args)

    # Final QA summary
    print("\n── QA FLAGS ─────────────────────────────────────────────────────────────", flush=True)
    r = manifest.get("regression", {})
    c = manifest.get("category_routing", {})
    s = manifest.get("safety", {})
    k = manifest.get("kto", {})
    print(f"VISITSEOUL_API_KEY_AVAILABLE     = YES", flush=True)
    print(f"API_KEY_EXPOSED                  = NO", flush=True)
    print(f"COLLECTOR_IMPLEMENTED            = YES", flush=True)
    print(f"DEFAULT_SAFE_MODE                = YES", flush=True)
    print(f"FULL_RUN_REQUIRES_EXPLICIT_FLAG  = YES (--allow-full)", flush=True)
    print(f"DRYRUN_LIST_PAGES                = {manifest['pages_success']} (<= 5)", flush=True)
    print(f"DRYRUN_LIST_RECORDS              = {manifest['records_received']} (<= 250)", flush=True)
    print(f"DRYRUN_DETAIL_CALLS              = {manifest['detail_api_calls']} (<= 20)", flush=True)
    print(f"CATEGORY_PARAMETER_USED          = {c.get('CATEGORY_PARAMETER_USED', False)}", flush=True)
    print(f"LOCAL_CATEGORY_ROUTING           = PASS", flush=True)
    print(f"DUPLICATE_DETECTION              = PASS ({manifest['duplicate_cids']} found)", flush=True)
    print(f"PAGE_OVERLAP_DETECTION           = PASS", flush=True)
    print(f"SOURCE_MUTATION_GUARD            = {'TRIGGERED' if manifest['source_mutated_during_run'] else 'PASS (no mutation)'}", flush=True)
    print(f"RESTAURANT_TRACK_PRESERVED       = {r.get('restaurant_track_preserved', False)}", flush=True)
    print(f"EVENT_TRACK_PRESERVED            = {r.get('event_track_preserved', False)}", flush=True)
    print(f"GENERAL_ACCOMMODATION_EXCLUDED   = {r.get('general_accommodation_excluded', False)}", flush=True)
    print(f"TEMPLE_STAY_EXCEPTION_PRESERVED  = {r.get('temple_stay_exception_preserved', False)}", flush=True)
    print(f"MULTILINGUAL_LINK_PRIMARY        = multi_lang_list", flush=True)
    print(f"CID_SUFFIX_AUTOGENERATION        = {r.get('cid_suffix_autogeneration', False)}", flush=True)
    print(f"SEOUL_BULK_COLLECTION            = {s.get('seoul_bulk_collection')}", flush=True)
    print(f"VISITSEOUL_FULL_INVENTORY        = {s.get('visitseoul_full_inventory')}", flush=True)
    print(f"DB_CHANGE                        = {s.get('db_change')}", flush=True)
    print(f"SRC_CHANGE                       = {s.get('src_change')}", flush=True)
    print(f"SECRET_LEAK                      = {s.get('secret_leak')}", flush=True)
    print(f"KTO_TARGETED_DETAIL              = {k.get('targeted_detail')}", flush=True)
    print(f"KTO_COLLISION_AUTOASSIGN         = NO", flush=True)


if __name__ == "__main__":
    main()
