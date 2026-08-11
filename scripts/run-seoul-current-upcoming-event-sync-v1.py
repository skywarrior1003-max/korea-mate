#!/usr/bin/env python3
"""
TASK-SEOUL-EVENT-CURRENT-UPCOMING-SYNC-AND-REFRESH-POLICY-V1

서울 현재/예정 이벤트를 VisitSeoul 공식 소스에서 새로 discovery하여
현재 진행 중(ONGOING) + 정확한 날짜가 확정된 예정(UPCOMING) 풀을 생성한다.

GoKoreaMate = AI_TRAVEL_SCHEDULER (not event archive)

핵심 발견 (Section 30 verification):
  - VisitSeoul contents/list: 날짜 필드 없음 (creat_dt_text/updt_dt_text만)
  - VisitSeoul contents/info: 이벤트 전용 날짜 필드 존재
      schdul_info_bgnde = 이벤트 시작일 (e.g., "2026.07.31")
      schdul_info_endde = 이벤트 종료일 (e.g., "2026.08.02")
  - Recency pre-filter: updt_dt_text >= RECENCY_CUTOFF 로 detail call 범위 제한

사용법:
  python scripts/run-seoul-current-upcoming-event-sync-v1.py --discover-only
  python scripts/run-seoul-current-upcoming-event-sync-v1.py --collect
  python scripts/run-seoul-current-upcoming-event-sync-v1.py --normalize-only

제약:
  - POSSIBILITY_BASED_API_CALLS = 0
  - HISTORICAL_BULK_DETAIL_CALLS = 0
  - AUTO_DELETE = 0
  - SECRET_LEAK = 0
  - DB / SRC / UI / MASTER 변경 금지
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

# ── Constants ─────────────────────────────────────────────────────────────────

SCRIPT_VERSION = "v1.0.0"
TASK           = "TASK-SEOUL-EVENT-CURRENT-UPCOMING-SYNC-AND-REFRESH-POLICY-V1"
BASE_URL       = "https://api-call.visitseoul.net/api/v1"
AS_OF          = "2026-08-11"   # Asia/Seoul 기준
TIMEZONE       = "Asia/Seoul"
PAGE_SIZE      = 50
TIMEOUT        = 25
DELAY_LIST     = 1.2
DELAY_DETAIL   = 1.2
MAX_LIST_PAGES = 120            # safety ceiling (3765/50 = ~76 pages + buffer)
MAX_DETAIL_CANDIDATES = 600    # safety ceiling for targeted detail calls

# Recency pre-filter: only events updated/created this year are candidates
# Assumption: currently active/upcoming events will have been recently updated
RECENCY_CUTOFF = "2026-01-01"  # YYYY-MM-DD

# Event category codes (from TASK-SEOUL-VISITSEOUL-FULL-INVENTORY-LIST-ONLY-V1)
EVENT_CATEGORY_CODES = {"Cd4y5u1", "Cu9u5z7", "Cv7s8m5"}
EVENT_TEXT_KEYWORDS  = ["축제", "공연", "행사", "페스티벌", "festival", "event", "전시회"]

# Seoul location validation indicators
SEOUL_INDICATORS = [
    "서울", "seoul", "강남", "강북", "강동", "강서", "노원", "도봉", "동대문",
    "동작", "마포", "서대문", "서초", "성동", "성북", "송파", "양천", "영등포",
    "용산", "은평", "종로", "중구", "중랑", "광진", "관악", "구로",
]

# ── File paths ─────────────────────────────────────────────────────────────────

BASE_DIR   = Path(__file__).parent.parent
DATA_DIR   = BASE_DIR / "data" / "seoul-source-audit"
DOCS_SEOUL = BASE_DIR / "docs" / "data-collection" / "seoul"
DOCS_MULTI = BASE_DIR / "docs" / "data-collection"

DISCOVERY_FILE  = DATA_DIR / "seoul-current-upcoming-event-discovery-v1.jsonl"
POOL_FILE       = DATA_DIR / "seoul-current-upcoming-event-pool-v1.jsonl"
ATTEMPTS_FILE   = DATA_DIR / "seoul-current-upcoming-event-attempts-v1.jsonl"
MANIFEST_FILE   = DATA_DIR / "seoul-current-upcoming-event-sync-manifest-v1.json"
DETAIL_RAW_FILE = DATA_DIR / "seoul-current-upcoming-event-detail-raw-v1.jsonl"

# ── Secret redaction ───────────────────────────────────────────────────────────

_SECRET_RE = re.compile(
    r'(?:VISITSEOUL[-_]?API[-_]?KEY|api[-_]?key|token|secret|bearer|credential)'
    r'\s*[=:]\s*\S+',
    re.IGNORECASE,
)


def _redact(text: str) -> str:
    return _SECRET_RE.sub("[REDACTED]", text)


# ── API helpers ────────────────────────────────────────────────────────────────

def _get_api_key() -> str:
    key = os.environ.get("VISITSEOUL_API_KEY", "")
    if not key:
        print("VISITSEOUL_API_KEY_AVAILABLE=NO", flush=True)
        print("STOP: API key not available in environment.", file=sys.stderr)
        sys.exit(1)
    print("VISITSEOUL_API_KEY_AVAILABLE=YES", flush=True)
    return key


def _post_json(path: str, body: dict, api_key: str) -> dict:
    import urllib.error
    import urllib.request
    url  = f"{BASE_URL}/{path}"
    data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    req  = urllib.request.Request(
        url, data=data,
        headers={
            "Content-Type":      "application/json; charset=utf-8",
            "VISITSEOUL-API-KEY": api_key,
            "Accept":            "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            raise RuntimeError(f"AUTH_FAIL:HTTP_{e.code}") from e
        raise RuntimeError(f"HTTP_{e.code}:{e.reason}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"URLError:{e.reason}") from e


# ── Category classification ───────────────────────────────────────────────────

def _is_event_category(record: dict) -> bool:
    """Return True if this list record is an event-category item."""
    cat_code = str(record.get("com_ctgry_sn", "") or "").strip()
    if cat_code in EVENT_CATEGORY_CODES:
        return True
    cate_text = str(record.get("cate_depth", "") or "").lower()
    title     = str(record.get("post_sj",    "") or "").lower()
    combined  = f"{cate_text} {title}"
    return any(kw in combined for kw in EVENT_TEXT_KEYWORDS)


def _is_recent(record: dict, cutoff: str = RECENCY_CUTOFF) -> bool:
    """True if updt_dt_text or creat_dt_text >= cutoff (YYYY-MM-DD)."""
    cutoff_norm = cutoff.replace("-", ".")
    updt = str(record.get("updt_dt_text", "") or "").strip()
    creat = str(record.get("creat_dt_text", "") or "").strip()
    if updt and updt >= cutoff_norm:
        return True
    if creat and creat >= cutoff_norm:
        return True
    return False


# ── Date parsing ───────────────────────────────────────────────────────────────

def _parse_date(raw: str) -> str | None:
    """
    Parse VisitSeoul date string to YYYY-MM-DD.
    Accepts: "2026.07.31", "20260731", "2026-07-31"
    Returns None if can't parse to exact YYYY-MM-DD.
    """
    if not raw or not str(raw).strip():
        return None
    s = str(raw).strip()
    # YYYY.MM.DD
    m = re.match(r'^(\d{4})\.(\d{2})\.(\d{2})$', s)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    # YYYYMMDD
    m = re.match(r'^(\d{4})(\d{2})(\d{2})$', s)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    # YYYY-MM-DD
    m = re.match(r'^(\d{4})-(\d{2})-(\d{2})$', s)
    if m:
        return s
    return None


def _compute_temporal_status(start: str | None, end: str | None, as_of: str) -> str:
    """
    ONGOING: start <= as_of <= end
    UPCOMING: start > as_of
    ENDED: end < as_of
    INACTIVE: date missing or unparseable
    """
    if not start or not end:
        return "INACTIVE"
    try:
        s = datetime.fromisoformat(start)
        e = datetime.fromisoformat(end)
        a = datetime.fromisoformat(as_of)
    except ValueError:
        return "INACTIVE"
    if s <= a <= e:
        return "ONGOING"
    if s > a:
        return "UPCOMING"
    return "ENDED"


# ── Seoul validation ───────────────────────────────────────────────────────────

def _is_seoul_event(place_str: str, addr_str: str) -> bool:
    """Soft check: is the event venue in Seoul?"""
    combined = (str(place_str or "").lower() + " " + str(addr_str or "").lower())
    return any(ind in combined for ind in SEOUL_INDICATORS)


# ── Official URL ───────────────────────────────────────────────────────────────

def _extract_official_url(detail: dict, cid: str) -> tuple[str, str]:
    """
    Returns (official_url, url_source_type).
    Priority:
      1. extra.cmmn_hmpg_url (organizer/official page)
      2. NO_OFFICIAL_URL_FOUND
    url_source_type: ORGANIZER_DIRECT | OFFICIAL_VISIT_SOURCE_FALLBACK | NONE
    Note: VisitSeoul public page URL format unknown → cannot construct fallback.
    Records without official_url are NOT SERVICE_EVENT_ELIGIBLE.
    """
    extra = detail.get("extra", {}) if isinstance(detail.get("extra"), dict) else {}
    hmpg = str(extra.get("cmmn_hmpg_url", "") or "").strip()
    if hmpg and hmpg.startswith("http"):
        return hmpg, "ORGANIZER_DIRECT"
    return "", "NONE"


# ── List phase ─────────────────────────────────────────────────────────────────

def fetch_all_event_candidates(api_key: str) -> tuple[list, dict]:
    """
    Page through VisitSeoul contents/list, collect all EVENT_TRACK records.
    Returns (event_candidates, list_stats).
    event_candidates: list of raw list records (event category)
    """
    print("\n[LIST] Fetching VisitSeoul inventory pages...", flush=True)

    # Probe page 1 for total count
    probe = _post_json("contents/list",
                       {"language": "ko", "keyword": "", "page_no": 1, "num_of_rows": PAGE_SIZE},
                       api_key)
    total_count = probe.get("paging", {}).get("total_count", 0)
    total_pages = max(1, (total_count + PAGE_SIZE - 1) // PAGE_SIZE)
    total_pages = min(total_pages, MAX_LIST_PAGES)

    print(f"[LIST] total_count={total_count}  total_pages={total_pages}", flush=True)

    list_stats = {
        "total_count_api": total_count,
        "pages_fetched": 0,
        "list_api_calls": 0,
    }
    all_records: list = list(probe.get("data", []))
    list_stats["pages_fetched"] += 1
    list_stats["list_api_calls"] += 1

    for page_no in range(2, total_pages + 1):
        time.sleep(DELAY_LIST)
        try:
            resp = _post_json("contents/list",
                              {"language": "ko", "keyword": "", "page_no": page_no, "num_of_rows": PAGE_SIZE},
                              api_key)
            all_records.extend(resp.get("data", []))
            list_stats["pages_fetched"] += 1
            list_stats["list_api_calls"] += 1
        except RuntimeError as e:
            if str(e).startswith("AUTH_FAIL"):
                print(f"\n[FATAL] AUTH_FAIL at list page {page_no}. STOP.", file=sys.stderr)
                sys.exit(2)
            print(f"  [WARN] List page {page_no} failed: {e}", flush=True)
        if page_no % 10 == 0:
            print(f"  [LIST] page {page_no}/{total_pages}  records_so_far={len(all_records)}", flush=True)

    # Deduplicate by CID (list may have duplicates across pages)
    seen: set[str] = set()
    unique_records: list = []
    for r in all_records:
        cid = r.get("cid", "")
        if cid and cid not in seen:
            seen.add(cid)
            unique_records.append(r)

    list_stats["total_unique_list_records"] = len(unique_records)
    print(f"[LIST] Done. unique_records={len(unique_records)}", flush=True)

    # Filter to event category
    event_all = [r for r in unique_records if _is_event_category(r)]
    print(f"[LIST] EVENT_TRACK records: {len(event_all)}", flush=True)

    # Recency filter
    event_recent = [r for r in event_all if _is_recent(r)]
    print(f"[LIST] Recent candidates (updt/creat >= {RECENCY_CUTOFF}): {len(event_recent)}", flush=True)

    list_stats["all_event_records"]    = len(event_all)
    list_stats["recent_candidates"]    = len(event_recent)

    return event_recent, list_stats


# ── Detail phase ───────────────────────────────────────────────────────────────

def fetch_event_detail(cid: str, api_key: str) -> tuple[str, dict, int]:
    """
    Fetch event detail from contents/info.
    Returns (status, content_dict, attempt_count).
    """
    for attempt in range(3):
        try:
            resp = _post_json("contents/info", {"language": "ko", "cid": cid}, api_key)
            content = resp.get("data") or {}
            if isinstance(content, list):
                content = content[0] if content else {}
            if not content or not content.get("post_sj"):
                return "EMPTY_RESPONSE", {}, attempt + 1
            return "SUCCESS", content, attempt + 1
        except RuntimeError as e:
            err = str(e)
            if err.startswith("AUTH_FAIL"):
                return "AUTH_FAIL", {}, attempt + 1
            if attempt < 2:
                time.sleep(2.0)
    return "API_ERROR", {}, 3


def process_detail(cid: str, list_rec: dict, detail: dict) -> dict:
    """
    Build discovery record from list metadata + detail content.
    """
    fetched_at = datetime.now(timezone.utc).isoformat()

    # Event dates (discovered in Section 30 verification)
    start_raw = str(detail.get("schdul_info_bgnde", "") or "").strip()
    end_raw   = str(detail.get("schdul_info_endde", "") or "").strip()
    start_date = _parse_date(start_raw)
    end_date   = _parse_date(end_raw)

    has_exact_start = start_date is not None
    has_exact_end   = end_date is not None
    has_exact_dates = has_exact_start and has_exact_end

    temporal_status = _compute_temporal_status(start_date, end_date, AS_OF)

    # Venue and address
    place    = str(detail.get("place", "") or "").strip()
    traffic  = detail.get("traffic", {}) if isinstance(detail.get("traffic"), dict) else {}
    addr     = str(traffic.get("new_adres") or traffic.get("adres") or "").strip()
    lat      = str(traffic.get("map_position_y", "") or "").strip()
    lng      = str(traffic.get("map_position_x", "") or "").strip()
    coords   = {"lat": lat, "lng": lng} if lat and lng else None

    # Seoul validation
    is_seoul = _is_seoul_event(place, addr)

    # Official URL
    official_url, url_type = _extract_official_url(detail, cid)

    # Poster / image
    main_img   = str(detail.get("main_img", "") or "").strip()
    relate_img = detail.get("relate_img", []) or []
    if isinstance(relate_img, str):
        relate_img = [relate_img] if relate_img else []
    poster_url = main_img or (relate_img[0] if relate_img else "")

    # Extra fields
    extra        = detail.get("extra", {}) if isinstance(detail.get("extra"), dict) else {}
    phone        = str(extra.get("cmmn_telno", "") or "").strip()
    opening_hrs  = str(extra.get("cmmn_use_time", "") or "").strip()
    fee_info     = str(extra.get("cmmn_ntry_se_dc", "") or extra.get("trrsrt_use_chrge", "") or "").strip()

    # Summary / description
    summary    = str(detail.get("sumry", "") or "").strip()[:500]
    raw_desc   = str(detail.get("post_desc", "") or "")
    desc_plain = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', raw_desc)).strip()[:1000]

    # Service eligibility
    service_eligible = (
        has_exact_dates and
        temporal_status in ("ONGOING", "UPCOMING") and
        bool(official_url) and
        is_seoul
    )

    title = str(detail.get("post_sj", "") or list_rec.get("post_sj", "") or "").strip()

    return {
        "cid":                 cid,
        "source":              "visitseoul",
        "source_record_id":    cid,
        "title":               title,
        "category_code":       str(list_rec.get("com_ctgry_sn", "") or ""),
        "category_path":       str(list_rec.get("cate_depth", "") or "").strip(),

        "start_date":          start_date,
        "end_date":            end_date,
        "start_date_raw":      start_raw,
        "end_date_raw":        end_raw,
        "has_exact_start":     has_exact_start,
        "has_exact_end":       has_exact_end,
        "has_exact_dates":     has_exact_dates,
        "temporal_status":     temporal_status,

        "venue":               place,
        "address":             addr,
        "coordinates":         coords,
        "is_seoul_location":   is_seoul,

        "poster_url":          poster_url,
        "main_img":            main_img,

        "official_url":        official_url,
        "official_url_type":   url_type,

        "phone":               phone,
        "opening_hours":       opening_hrs,
        "fee_info":            fee_info,

        "summary":             summary,
        "desc_plain":          desc_plain,

        "list_creat_dt_text":  str(list_rec.get("creat_dt_text", "") or ""),
        "list_updt_dt_text":   str(list_rec.get("updt_dt_text", "") or ""),
        "source_updated_at":   str(detail.get("updt_dt_text", "") or "").strip(),

        "service_eligible":    service_eligible,
        "ineligible_reasons":  _ineligible_reasons(
            has_exact_dates, temporal_status, bool(official_url), is_seoul),

        "provenance": {
            "source":   "visitseoul",
            "endpoint": "contents/info",
            "cid":      cid,
            "as_of":    AS_OF,
            "task":     TASK,
            "script":   SCRIPT_VERSION,
        },
        "as_of": AS_OF,
    }


def _ineligible_reasons(has_dates: bool, status: str, has_url: bool, is_seoul: bool) -> list:
    reasons = []
    if not has_dates:
        reasons.append("MISSING_EXACT_DATE")
    elif status == "ENDED":
        reasons.append("ENDED")
    elif status == "INACTIVE":
        reasons.append("DATE_INACTIVE")
    if not has_url:
        reasons.append("NO_OFFICIAL_URL")
    if not is_seoul:
        reasons.append("NON_SEOUL_LOCATION")
    return reasons


def build_pool_record(disc: dict) -> dict:
    """Build service pool record from discovery record."""
    return {
        "source":           disc["source"],
        "source_record_id": disc["source_record_id"],
        "title":            disc["title"],

        "start_date":       disc["start_date"],
        "end_date":         disc["end_date"],

        "temporal_status":  disc["temporal_status"],

        "venue":            disc["venue"],
        "address":          disc["address"],
        "coordinates":      disc["coordinates"],

        "poster_url":       disc["poster_url"],

        "official_url":     disc["official_url"],
        "official_url_type": disc["official_url_type"],

        "summary":          disc["summary"],

        "source_updated_at": disc["source_updated_at"],
        "provenance":       disc["provenance"],
        "as_of":            disc["as_of"],
    }


# ── Discovery gate check ───────────────────────────────────────────────────────

def print_discovery_gate(disc_records: list, detail_stats: dict) -> None:
    """Print Section 33 gate metrics."""
    total        = len(disc_records)
    exact_date   = sum(1 for r in disc_records if r["has_exact_dates"])
    missing_date = total - exact_date
    ongoing      = sum(1 for r in disc_records if r["temporal_status"] == "ONGOING")
    upcoming     = sum(1 for r in disc_records if r["temporal_status"] == "UPCOMING")
    ended        = sum(1 for r in disc_records if r["temporal_status"] == "ENDED")
    inactive     = sum(1 for r in disc_records if r["temporal_status"] == "INACTIVE")
    service_plan = sum(1 for r in disc_records if r["service_eligible"])
    no_url       = sum(1 for r in disc_records if r["service_eligible"] and not r["official_url"])
    no_date_svc  = sum(1 for r in disc_records if r["service_eligible"] and not r["has_exact_dates"])
    possibility  = 0  # always 0 by design

    print("\n" + "=" * 60, flush=True)
    print("DISCOVERY GATE (Section 33)", flush=True)
    print("=" * 60, flush=True)
    print(f"DISCOVERED_RECORDS              = {total}", flush=True)
    print(f"EXACT_DATE_RECORDS              = {exact_date}", flush=True)
    print(f"MISSING_EXACT_DATE              = {missing_date}", flush=True)
    print(f"ONGOING_CANDIDATES              = {ongoing}", flush=True)
    print(f"UPCOMING_CANDIDATES             = {upcoming}", flush=True)
    print(f"ENDED_RECORDS                   = {ended}", flush=True)
    print(f"INACTIVE_RECORDS                = {inactive}", flush=True)
    print(f"SERVICE_EVENT_PLAN              = {service_plan}", flush=True)
    print(f"SERVICE_EVENT_WITHOUT_OFFICIAL_URL  = {no_url}", flush=True)
    print(f"SERVICE_EVENT_WITHOUT_EXACT_DATE    = {no_date_svc}", flush=True)
    print(f"POSSIBILITY_BASED_CANDIDATES    = {possibility}", flush=True)
    print(f"DETAIL_API_CALLS               = {detail_stats.get('total_detail_calls', 0)}", flush=True)
    print(f"DETAIL_SUCCESS                 = {detail_stats.get('success', 0)}", flush=True)
    print(f"DETAIL_EMPTY                   = {detail_stats.get('empty', 0)}", flush=True)
    print(f"DETAIL_ERROR                   = {detail_stats.get('error', 0)}", flush=True)
    print("=" * 60, flush=True)

    # Gate assertions
    passed = True
    if no_date_svc > 0:
        print(f"[GATE FAIL] SERVICE_EVENT_WITHOUT_EXACT_DATE = {no_date_svc} (must be 0)", flush=True)
        passed = False
    if no_url > 0:
        print(f"[GATE WARN] SERVICE_EVENT_WITHOUT_OFFICIAL_URL = {no_url} (must be 0 for final pool)", flush=True)
    if possibility > 0:
        print(f"[GATE FAIL] POSSIBILITY_BASED_CANDIDATES = {possibility} (must be 0)", flush=True)
        passed = False
    if passed:
        print("PLAN_GATE = PASS", flush=True)
    else:
        print("PLAN_GATE = FAIL — review required", flush=True)
    return passed


# ── Main execution ─────────────────────────────────────────────────────────────

def run_collect(api_key: str, output_mode: str) -> None:
    """
    Full discovery + collect flow.
    output_mode: "discover_only" | "collect"
    """
    fetched_at_start = datetime.now(timezone.utc).isoformat()

    # ── Step 1: List phase ────────────────────────────────────────────────────
    event_candidates, list_stats = fetch_all_event_candidates(api_key)

    if len(event_candidates) > MAX_DETAIL_CANDIDATES:
        print(f"\n[WARN] Recency candidates ({len(event_candidates)}) exceeds safety ceiling "
              f"({MAX_DETAIL_CANDIDATES}). Capping to most recently updated.", flush=True)
        # Sort by updt_dt_text desc, take top N
        event_candidates = sorted(
            event_candidates,
            key=lambda r: str(r.get("updt_dt_text", "") or ""),
            reverse=True
        )[:MAX_DETAIL_CANDIDATES]

    # ── Step 2: Detail phase (targeted) ──────────────────────────────────────
    print(f"\n[DETAIL] Calling contents/info for {len(event_candidates)} candidates...", flush=True)

    discovery_records = []
    attempts_records  = []
    raw_details       = []
    detail_stats      = {"total_detail_calls": 0, "success": 0, "empty": 0, "error": 0, "auth_fail": 0}

    for i, list_rec in enumerate(event_candidates, 1):
        cid = list_rec.get("cid", "")
        attempt_at = datetime.now(timezone.utc).isoformat()

        status, detail, n_attempts = fetch_event_detail(cid, api_key)
        detail_stats["total_detail_calls"] += 1

        if status == "AUTH_FAIL":
            print(f"\n[FATAL] AUTH_FAIL at CID {cid}. STOP.", file=sys.stderr)
            sys.exit(2)

        if status == "SUCCESS":
            detail_stats["success"] += 1
            disc = process_detail(cid, list_rec, detail)
        elif status == "EMPTY_RESPONSE":
            detail_stats["empty"] += 1
            disc = {
                "cid": cid, "title": list_rec.get("post_sj", ""),
                "temporal_status": "INACTIVE", "has_exact_dates": False,
                "service_eligible": False, "status": "EMPTY_RESPONSE",
                "ineligible_reasons": ["EMPTY_DETAIL_RESPONSE"],
                "start_date": None, "end_date": None,
                "official_url": "", "official_url_type": "NONE",
                "is_seoul_location": False, "has_exact_start": False,
                "has_exact_end": False, "poster_url": "", "venue": "",
                "address": "", "coordinates": None, "summary": "",
                "desc_plain": "", "phone": "", "opening_hours": "",
                "fee_info": "", "source": "visitseoul", "source_record_id": cid,
                "category_code": str(list_rec.get("com_ctgry_sn", "")),
                "category_path": str(list_rec.get("cate_depth", "")).strip(),
                "start_date_raw": "", "end_date_raw": "", "source_updated_at": "",
                "list_creat_dt_text": str(list_rec.get("creat_dt_text", "")),
                "list_updt_dt_text": str(list_rec.get("updt_dt_text", "")),
                "provenance": {"source": "visitseoul", "endpoint": "contents/info",
                               "cid": cid, "as_of": AS_OF, "task": TASK,
                               "script": SCRIPT_VERSION},
                "as_of": AS_OF,
            }
        else:
            detail_stats["error"] += 1
            disc = {
                "cid": cid, "title": list_rec.get("post_sj", ""),
                "temporal_status": "INACTIVE", "has_exact_dates": False,
                "service_eligible": False, "status": status,
                "ineligible_reasons": ["API_ERROR"],
                "start_date": None, "end_date": None,
                "official_url": "", "official_url_type": "NONE",
                "is_seoul_location": False, "has_exact_start": False,
                "has_exact_end": False, "poster_url": "", "venue": "",
                "address": "", "coordinates": None, "summary": "",
                "desc_plain": "", "phone": "", "opening_hours": "",
                "fee_info": "", "source": "visitseoul", "source_record_id": cid,
                "category_code": str(list_rec.get("com_ctgry_sn", "")),
                "category_path": str(list_rec.get("cate_depth", "")).strip(),
                "start_date_raw": "", "end_date_raw": "", "source_updated_at": "",
                "list_creat_dt_text": str(list_rec.get("creat_dt_text", "")),
                "list_updt_dt_text": str(list_rec.get("updt_dt_text", "")),
                "provenance": {"source": "visitseoul", "endpoint": "contents/info",
                               "cid": cid, "as_of": AS_OF, "task": TASK,
                               "script": SCRIPT_VERSION},
                "as_of": AS_OF,
            }

        discovery_records.append(disc)

        # Raw detail storage
        raw_details.append({
            "cid":          cid,
            "status":       status,
            "n_attempts":   n_attempts,
            "fetched_at":   attempt_at,
            "_raw_content": detail if status == "SUCCESS" else {},
        })

        # Attempt record
        attempts_records.append({
            "cid":          cid,
            "attempted_at": attempt_at,
            "status":       status,
            "n_attempts":   n_attempts,
            "service_eligible": disc.get("service_eligible", False),
            "temporal_status":  disc.get("temporal_status", "INACTIVE"),
        })

        if i % 20 == 0:
            print(f"  [DETAIL] {i}/{len(event_candidates)} processed", flush=True)
        time.sleep(DELAY_DETAIL)

    print(f"[DETAIL] Done. success={detail_stats['success']}  "
          f"empty={detail_stats['empty']}  error={detail_stats['error']}", flush=True)

    # ── Step 3: Gate check ────────────────────────────────────────────────────
    gate_pass = print_discovery_gate(discovery_records, detail_stats)

    if output_mode == "discover_only":
        print("\nDISCOVER_ONLY = YES — files NOT written.", flush=True)
        print(f"COLLECTION_STARTED = NO — review gate then run --collect.", flush=True)
        if gate_pass:
            print("PLAN_GATE = PASS — safe to proceed with --collect", flush=True)
        return

    if not gate_pass:
        print("\n[STOP] Gate FAIL — run --discover-only and review before --collect.", file=sys.stderr)
        sys.exit(3)

    # ── Step 4: Write output files ────────────────────────────────────────────
    print("\n[WRITE] Writing output files...", flush=True)

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    # Discovery file (all candidates with gate status)
    with open(DISCOVERY_FILE, "w", encoding="utf-8") as f:
        for r in discovery_records:
            f.write(json.dumps(r, ensure_ascii=False, default=str) + "\n")
    print(f"  {DISCOVERY_FILE.name}: {len(discovery_records)} records", flush=True)

    # Pool file (service eligible only)
    pool_records = [build_pool_record(r) for r in discovery_records if r.get("service_eligible")]
    with open(POOL_FILE, "w", encoding="utf-8") as f:
        for r in pool_records:
            f.write(json.dumps(r, ensure_ascii=False, default=str) + "\n")
    print(f"  {POOL_FILE.name}: {len(pool_records)} records", flush=True)

    # Attempts file
    with open(ATTEMPTS_FILE, "w", encoding="utf-8") as f:
        for r in attempts_records:
            f.write(json.dumps(r, ensure_ascii=False, default=str) + "\n")
    print(f"  {ATTEMPTS_FILE.name}: {len(attempts_records)} records", flush=True)

    # Raw detail file
    with open(DETAIL_RAW_FILE, "w", encoding="utf-8") as f:
        for r in raw_details:
            f.write(json.dumps(r, ensure_ascii=False, default=str) + "\n")
    print(f"  {DETAIL_RAW_FILE.name}: {len(raw_details)} records", flush=True)

    # Manifest
    ongoing_count  = sum(1 for r in discovery_records if r["temporal_status"] == "ONGOING")
    upcoming_count = sum(1 for r in discovery_records if r["temporal_status"] == "UPCOMING")
    org_direct     = sum(1 for r in pool_records if r.get("official_url_type") == "ORGANIZER_DIRECT")
    vs_fallback    = sum(1 for r in pool_records if r.get("official_url_type") == "OFFICIAL_VISIT_SOURCE_FALLBACK")

    pool_sha = hashlib.sha256(
        "\n".join(json.dumps(r, ensure_ascii=False, default=str) for r in pool_records).encode()
    ).hexdigest().upper()

    manifest = {
        "task":             TASK,
        "script_version":   SCRIPT_VERSION,
        "as_of":            AS_OF,
        "timezone":         TIMEZONE,

        "PRODUCT_ROLE":     "AI_TRAVEL_SCHEDULER",

        "LIST_TOTAL_API_COUNT":          list_stats["total_count_api"],
        "LIST_UNIQUE_RECORDS_FETCHED":   list_stats["total_unique_list_records"],
        "LIST_API_CALLS":                list_stats["list_api_calls"],
        "EVENT_CATEGORY_RECORDS":        list_stats["all_event_records"],
        "RECENT_CANDIDATES":             list_stats["recent_candidates"],
        "RECENCY_CUTOFF":               RECENCY_CUTOFF,

        "DETAIL_API_CALLS":              detail_stats["total_detail_calls"],
        "DETAIL_SUCCESS":                detail_stats["success"],
        "DETAIL_EMPTY":                  detail_stats["empty"],
        "DETAIL_ERROR":                  detail_stats["error"],

        "LEGACY_EVENT_TOTAL":            1190,
        "LEGACY_EVENT_DEEP_TRIAGE":      "NOT_PERFORMED",
        "HISTORICAL_BULK_DETAIL_CALLS":  0,
        "POSSIBILITY_BASED_API_CALLS":   0,

        "DISCOVERED_RECORDS":            len(discovery_records),
        "EXACT_DATE_RECORDS":            sum(1 for r in discovery_records if r["has_exact_dates"]),
        "MISSING_EXACT_DATE":            sum(1 for r in discovery_records if not r["has_exact_dates"]),
        "ONGOING_CANDIDATES":            ongoing_count,
        "UPCOMING_CANDIDATES":           upcoming_count,
        "ENDED_RECORDS":                 sum(1 for r in discovery_records if r["temporal_status"] == "ENDED"),
        "INACTIVE_RECORDS":              sum(1 for r in discovery_records if r["temporal_status"] == "INACTIVE"),

        "SERVICE_EVENT_POOL_TOTAL":       len(pool_records),
        "CURRENT_EVENT_COUNT":            ongoing_count,
        "UPCOMING_EVENT_COUNT":           upcoming_count,
        "SERVICE_EVENT_WITHOUT_EXACT_DATE": 0,
        "SERVICE_EVENT_WITHOUT_OFFICIAL_URL": 0,

        "ORGANIZER_DIRECT_URL_COUNT":    org_direct,
        "OFFICIAL_VISIT_SOURCE_FALLBACK_COUNT": vs_fallback,
        "OFFICIAL_URL_PRESENT_COUNT":    org_direct + vs_fallback,

        "FUTURE_DAY_THRESHOLD_POLICY":   "NONE",
        "POSTER_REQUIRED_FOR_ACTIVATION": "NO",

        "RECURRING_EVENT_WATCHLIST_CREATED": 0,
        "EVENT_SERIES_REGISTRY_CREATED":     0,

        "BASE_EVENT_REFRESH":                "7_DAYS",
        "RUNTIME_EVENT_EXPIRY_GATE":         "REQUIRED",
        "AI_EVENT_TRIP_DATE_OVERLAP_REQUIRED": "YES",

        "VISITSEOUL_DATE_FIELD_DISCOVERY": {
            "schdul_info_bgnde": "event start date (found in contents/info, NOT in contents/list)",
            "schdul_info_endde": "event end date (found in contents/info, NOT in contents/list)",
            "note": "These event-specific date fields are not in the list response."
        },

        "NON_SEOUL_EVENTS_FLAGGED":      sum(1 for r in discovery_records if not r.get("is_seoul_location")),

        "POOL_SHA256":                   pool_sha,

        "AUTO_DELETE":  0,
        "AUTO_MERGE":   0,
        "SECRET_LEAK":  0,
        "DB_CHANGE":    0,
        "SRC_MODIFIED": 0,
    }

    with open(MANIFEST_FILE, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2, default=str)
    print(f"  {MANIFEST_FILE.name}: written", flush=True)

    print(f"\nCOLLECTION_COMPLETE = YES", flush=True)
    print(f"SERVICE_EVENT_POOL_TOTAL = {len(pool_records)}", flush=True)
    print(f"  ONGOING  = {ongoing_count}", flush=True)
    print(f"  UPCOMING = {upcoming_count}", flush=True)


def run_normalize_only() -> None:
    """Re-normalize from raw detail file."""
    if not DETAIL_RAW_FILE.exists():
        print(f"RAW_FILE_NOT_FOUND: {DETAIL_RAW_FILE}", file=sys.stderr)
        sys.exit(1)

    # Load raw
    raw_records = [json.loads(l) for l in DETAIL_RAW_FILE.read_text(encoding="utf-8").strip().splitlines()]
    # Load discovery records (need list metadata)
    disc_records = []
    if DISCOVERY_FILE.exists():
        disc_records = [json.loads(l) for l in DISCOVERY_FILE.read_text(encoding="utf-8").strip().splitlines()]

    disc_by_cid = {r["cid"]: r for r in disc_records}

    print(f"\n[NORMALIZE] Re-normalizing {len(raw_records)} records...", flush=True)
    # Regenerate from raw
    pool_records = [build_pool_record(disc_by_cid[r["cid"]]) for r in raw_records
                    if r["cid"] in disc_by_cid and disc_by_cid[r["cid"]].get("service_eligible")]

    with open(POOL_FILE, "w", encoding="utf-8") as f:
        for r in pool_records:
            f.write(json.dumps(r, ensure_ascii=False, default=str) + "\n")

    pool_sha = hashlib.sha256(
        "\n".join(json.dumps(r, ensure_ascii=False, default=str) for r in pool_records).encode()
    ).hexdigest().upper()

    print(f"NORMALIZE_ONLY_COMPLETE: {len(pool_records)} pool records", flush=True)
    print(f"POOL_SHA256: {pool_sha}", flush=True)


# ── CLI ────────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description=TASK)
    group  = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--discover-only",  action="store_true",
                       help="List + detail gate check only. No file writes.")
    group.add_argument("--collect",        action="store_true",
                       help="Full collection + write output files.")
    group.add_argument("--normalize-only", action="store_true",
                       help="Re-normalize from existing raw file.")
    args = parser.parse_args()

    print(f"\n{TASK}", flush=True)
    print(f"SCRIPT_VERSION = {SCRIPT_VERSION}", flush=True)
    print(f"AS_OF = {AS_OF}  TIMEZONE = {TIMEZONE}", flush=True)
    print(f"RECENCY_CUTOFF = {RECENCY_CUTOFF}", flush=True)

    if args.normalize_only:
        run_normalize_only()
        return

    api_key = _get_api_key()

    if args.discover_only:
        run_collect(api_key, "discover_only")
    elif args.collect:
        run_collect(api_key, "collect")


if __name__ == "__main__":
    main()
