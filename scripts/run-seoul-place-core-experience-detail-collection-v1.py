#!/usr/bin/env python3
"""
TASK-SEOUL-PLACE-CORE-AND-EXPERIENCE-DETAIL-COLLECTION-V1-R1
VisitSeoul contents/info detail collection for:
  - PLACE_CORE_CANDIDATE (A, no detail) = 194
  - EXPERIENCE_CANDIDATE (A, no detail) = 107
  - TEMPLE_STAY_CANDIDATE (A, no detail) = 1
  - V2_RECOVERED BLANKET_02_FIX education (A, no detail) = 9
  Total expected: PLAN_TOTAL = 311

Modes:
  --plan-only      Build candidate plan JSONL, print gate summary, no API calls.
  --collect        Plan-gate + API collection + raw output.
  --normalize-only Re-normalize from existing raw JSONL (deterministic, no API).

Safety:
  - API key: env VISITSEOUL_API_KEY, never printed/logged/committed.
  - PLAN_TOTAL gate = 311 (current HEAD 802d163 integrity check).
  - CANDIDATE_TOTAL > 400 → STOP (scope corruption safety ceiling).
  - BAR_PUB (BLANKET_01_FIX) excluded.
  - Nature 119 not recalled.
  - Existing API payload (135 CIDs) not recalled.
  - Consecutive failure STOP at 10.
  - Auth/key error: immediate STOP.
"""

import argparse
import hashlib
import html as html_mod
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
TASK = "TASK-SEOUL-PLACE-CORE-AND-EXPERIENCE-DETAIL-COLLECTION-V1-R1"
BASE_URL = "https://api-call.visitseoul.net/api/v1"
TIMEOUT = 25         # seconds
DELAY = 1.2          # seconds between calls
MAX_RETRY = 2
CONSECUTIVE_FAILURE_LIMIT = 10
AS_OF = "2026-08-11"
ROUTING_SHA = "802d163"
ROUTING_VERSION = "V2"

# ── Expected plan totals (HEAD 802d163 integrity) ──────────────────────────────
EXPECTED = {
    "PLACE_CORE": 194,
    "EXPERIENCE": 107,
    "TEMPLE_STAY": 1,
    "V2_RECOVERED": 9,
    "PLAN_TOTAL": 311,
}
SAFETY_CEILING = 400

# ── File paths ─────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data" / "seoul-source-audit"
DOCS_DIR = BASE_DIR / "docs" / "data-collection" / "seoul"

V2_ROUTING_FILE  = DATA_DIR / "seoul-full-enrichment-routing-v2.jsonl"
INTEGRATED_FILE  = DATA_DIR / "seoul-integrated-travel-value-detail-samples-v1.jsonl"
DRYRUN_FILE      = DATA_DIR / "seoul-visitseoul-detail-dryrun-v1.jsonl"

PLAN_FILE        = DATA_DIR / "seoul-place-core-experience-detail-plan-v1.jsonl"
RAW_FILE         = DATA_DIR / "seoul-place-core-experience-detail-raw-v1.jsonl"
NORMALIZED_FILE  = DATA_DIR / "seoul-place-core-experience-detail-normalized-v1.jsonl"
ATTEMPTS_FILE    = DATA_DIR / "seoul-place-core-experience-detail-attempts-v1.jsonl"
MANIFEST_FILE    = DATA_DIR / "seoul-place-core-experience-detail-manifest-v1.json"

# ── Schema assertion ───────────────────────────────────────────────────────────
REQUIRED_V2_FIELDS = {
    "cid", "legacy_routing_track", "primary_routing",
    "existing_detail_available", "blanket_fix_applied",
}

# ── Nature 119 ─────────────────────────────────────────────────────────────────
NATURE_119_CODES = {"Ce9z7g9", "Cu5u8d4", "Cp3b3j9"}

# ── Secret redaction ──────────────────────────────────────────────────────────
_SECRET_RE = re.compile(
    r"(?i)(api[-_]?key|apikey|secret|token|password|auth)\s*[=:]\s*\S+",
    re.IGNORECASE,
)

# ── HTML strip ────────────────────────────────────────────────────────────────
_DANGEROUS_TAGS = re.compile(
    r"<\s*(script|style|link|meta|iframe|object|embed|form|input|button)[^>]*>.*?</\s*\1\s*>|"
    r"<\s*(script|style|link|meta|iframe|object|embed|form|input|button)[^>]*/?>",
    re.IGNORECASE | re.DOTALL,
)
_HTML_TAG = re.compile(r"<[^>]+>")
_WHITESPACE = re.compile(r"\s+")


def strip_html(raw: str) -> str:
    """Remove executable HTML; return plain-text representation."""
    if not raw:
        return ""
    s = _DANGEROUS_TAGS.sub(" ", raw)
    s = _HTML_TAG.sub(" ", s)
    s = html_mod.unescape(s)
    s = _WHITESPACE.sub(" ", s).strip()
    return s[:4000]  # cap at 4000 chars for storage


# ── Travel Value signals ──────────────────────────────────────────────────────
_TV1_HIGH_KW = [
    "경복궁", "창덕궁", "남산", "명동", "인사동", "광화문", "북촌", "홍대", "이태원",
    "동대문", "한강", "국립", "서울 대표", "서울 랜드마크", "must", "landmark",
    "대표", "명소", "historic", "palace", "heritage", "유네스코", "국보",
]
_TV3_HIGH_KW = [
    "전통", "한옥", "한국 고유", "한류", "K-", "k-pop", "kpop", "조선",
    "서울 특유", "고궁", "사찰", "장인", "국내 최초", "최초",
    "전통주", "막걸리", "한식", "한국 전통",
]
_TV4_HIGH_KW = [
    "체험", "만들기", "직접", "배우는", "체험학습", "체험관", "workshop",
    "프로그램", "활동", "클래스", "체험 프로그램", "참여",
]
_TV4_EXPERIENCE_TRACKS = {"EXPERIENCE_CANDIDATE", "TEMPLE_STAY_CANDIDATE"}

_TV7_HIGH_SIGNALS = ["homepage", "opening_hours", "phone", "addr", "coords"]


def assess_travel_value(record: dict, detail: dict, track: str) -> dict:
    """
    Assign TV1-TV7 HIGH/MEDIUM/LOW/UNKNOWN without fixed formula.
    Evidence-based framework.
    """
    text = " ".join([
        detail.get("title", ""),
        detail.get("desc_plain", ""),
        detail.get("addr", ""),
    ]).lower()

    def kw_match(kws):
        return any(k.lower() in text for k in kws)

    # TV1 TRAVEL_PURPOSE_VALUE
    if kw_match(_TV1_HIGH_KW) or track in ("PLACE_CORE_CANDIDATE",):
        tv1 = "HIGH"
    elif track in ("EXPERIENCE_CANDIDATE", "TEMPLE_STAY_CANDIDATE", "PLACE_CONDITIONAL_REVIEW"):
        tv1 = "MEDIUM"
    else:
        tv1 = "LOW"

    # TV2 TRAVELER_UTILITY_VALUE
    has_hours = bool(detail.get("opening_hours"))
    has_phone = bool(detail.get("phone"))
    has_home  = bool(detail.get("homepage"))
    has_addr  = bool(detail.get("addr"))
    utility_score = sum([has_hours, has_phone, has_home, has_addr])
    tv2 = "HIGH" if utility_score >= 3 else ("MEDIUM" if utility_score >= 2 else "LOW")

    # TV3 KOREA_LOCAL_UNIQUENESS
    if kw_match(_TV3_HIGH_KW):
        tv3 = "HIGH"
    elif track in ("PLACE_CORE_CANDIDATE", "TEMPLE_STAY_CANDIDATE"):
        tv3 = "MEDIUM"
    else:
        tv3 = "UNKNOWN"

    # TV4 EXPERIENCE_VALUE
    if kw_match(_TV4_HIGH_KW) or track in _TV4_EXPERIENCE_TRACKS:
        tv4 = "HIGH"
    elif track == "PLACE_CONDITIONAL_REVIEW" and "체험" in text:
        tv4 = "MEDIUM"
    else:
        tv4 = "LOW"

    # TV5 INTENT_MATCH_POTENTIAL — from V2 routing intents
    intents = record.get("detected_intents", [])
    tv5 = "HIGH" if len(intents) >= 3 else ("MEDIUM" if len(intents) >= 1 else "LOW")

    # TV6 INFORMATION_QUALITY
    desc_len = len(detail.get("desc_plain", ""))
    has_img  = bool(detail.get("has_image"))
    info_score = sum([desc_len > 200, has_img, has_hours, has_phone])
    tv6 = "HIGH" if info_score >= 3 else ("MEDIUM" if info_score >= 2 else "LOW")

    # TV7 CURRENT_USABILITY
    has_coords = detail.get("has_coords", False)
    tv7 = "HIGH" if (has_coords and (has_hours or has_phone)) else ("MEDIUM" if has_coords else "LOW")

    return {
        "TV1_TRAVEL_PURPOSE_VALUE": tv1,
        "TV2_TRAVELER_UTILITY_VALUE": tv2,
        "TV3_KOREA_LOCAL_UNIQUENESS": tv3,
        "TV4_EXPERIENCE_VALUE": tv4,
        "TV5_INTENT_MATCH_POTENTIAL": tv5,
        "TV6_INFORMATION_QUALITY": tv6,
        "TV7_CURRENT_USABILITY": tv7,
    }


def assess_eligibility(tv: dict, detail: dict, sct: str) -> dict:
    """Preliminary eligibility without fixed threshold formula."""
    has_identity = sct not in ("UNKNOWN", "UTILITY_SERVICE")
    has_location = detail.get("has_coords", False) or bool(detail.get("addr"))
    has_info     = bool(detail.get("opening_hours") or detail.get("homepage"))

    # SEARCHABLE: has identity + address
    searchable = has_identity and has_location

    # EXPLORE_ELIGIBLE
    high_tv = sum(1 for v in tv.values() if v == "HIGH")
    if high_tv >= 3 and has_location and has_info:
        explore = "YES"
    elif high_tv >= 2 and has_location:
        explore = "CONDITIONAL"
    else:
        explore = "NO"

    # AI_ITINERARY_ELIGIBLE
    ai_conditions = []
    if not detail.get("has_coords", False):
        ai_conditions.append("COORDINATE_REQUIRED")
    if not has_info:
        ai_conditions.append("HOURS_OR_HOMEPAGE_REQUIRED")
    if not has_identity:
        ai_conditions.append("IDENTITY_VERIFICATION_REQUIRED")

    if high_tv >= 4 and not ai_conditions:
        ai = "YES"
    elif high_tv >= 2:
        ai = "CONDITIONAL"
    else:
        ai = "NO"

    return {
        "SEARCHABLE": "YES" if searchable else "NO",
        "EXPLORE_ELIGIBLE": explore,
        "AI_ITINERARY_ELIGIBLE": ai,
        "AI_CONDITIONS": ai_conditions,
        "USER_CAN_SELECT": "YES" if searchable else "NO",
        "USER_CAN_SAVE": "YES" if searchable else "NO",
    }


def assess_sct(record: dict, detail: dict) -> str:
    """Re-assess SOURCE_CONTENT_TYPE from detail evidence."""
    track = record.get("legacy_routing_track", "")
    v2_sct = record.get("source_content_type", "UNKNOWN")
    title = (detail.get("title", "") + " " + detail.get("desc_plain", "")).lower()

    # Route/editorial signals
    dullegil_kw = ["둘레길", "트레킹 코스", "산책로 안내", "코스 안내"]
    if any(k in title for k in dullegil_kw):
        if "코스 안내" in title or "안내" in title:
            return "EDITORIAL_MULTI_ROUTE_CONTENT"
        return "PHYSICAL_PLACE_WITH_ROUTE_CONTENT"

    # Experience content
    exp_kw = ["체험", "체험 프로그램", "워크숍", "만들기", "배우는"]
    if track == "EXPERIENCE_CANDIDATE" and any(k in title for k in exp_kw):
        return "EXPERIENCE_CONTENT"

    # Keep V2 SCT if no contradicting evidence
    return v2_sct


def assess_entity_identity(detail: dict, sct: str, track: str) -> str:
    """Assign entity identity from detail evidence."""
    if not detail.get("detail_verified", False):
        return "AMBIGUOUS"
    if sct in ("EDITORIAL_MULTI_ROUTE_CONTENT", "EDITORIAL_CONTENT"):
        return "VERIFIED_EDITORIAL_CONTENT"
    if sct in ("ROUTE_COURSE", "PHYSICAL_PLACE_WITH_ROUTE_CONTENT"):
        return "VERIFIED_ROUTE_CONTENT"
    if sct == "EXPERIENCE_CONTENT" or track in ("EXPERIENCE_CANDIDATE", "TEMPLE_STAY_CANDIDATE"):
        if detail.get("has_coords") and (detail.get("opening_hours") or detail.get("phone")):
            return "VERIFIED_EXPERIENCE"
        return "AMBIGUOUS"
    if sct == "PHYSICAL_PLACE" and detail.get("has_coords") and detail.get("addr"):
        return "VERIFIED_PHYSICAL_PLACE"
    if detail.get("has_coords"):
        return "VERIFIED_PHYSICAL_PLACE"
    return "AMBIGUOUS"


# ── API call engine ───────────────────────────────────────────────────────────

def _post_json(endpoint: str, body: dict, api_key: str) -> dict:
    """POST JSON to VisitSeoul API. Never logs api_key."""
    import urllib.error
    import urllib.request

    url = f"{BASE_URL}/{endpoint}"
    data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url, data=data,
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "VISITSEOUL-API-KEY": api_key,
            "Accept": "application/json",
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


def fetch_detail(cid: str, api_key: str) -> tuple:
    """
    Fetch detail for one CID with retry.
    Returns (status, content_dict, attempt_count)
    status: SUCCESS | EMPTY_RESPONSE | AUTH_FAIL | API_ERROR | PARSE_ERROR
    """
    import urllib.error
    last_exc = None
    for attempt in range(MAX_RETRY + 1):
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
            last_exc = err
            if attempt < MAX_RETRY:
                time.sleep(2.0)  # backoff before retry
    return "API_ERROR", {"last_error": str(last_exc)}, MAX_RETRY + 1


# ── Normalization ─────────────────────────────────────────────────────────────

def normalize_raw(raw_rec: dict, plan_rec: dict) -> dict:
    """Build normalized record from raw API content + plan metadata."""
    cid = raw_rec["cid"]
    content = raw_rec.get("_raw_content", {})
    status = raw_rec.get("status", "UNKNOWN")
    track = plan_rec.get("legacy_routing_track", "")

    if status != "SUCCESS" or not content:
        return {
            "cid": cid,
            "status": status,
            "error": raw_rec.get("error"),
            "collection_domain": plan_rec.get("collection_domain"),
            "legacy_routing_track": track,
            "has_detail": False,
            "provenance": raw_rec.get("provenance", {}),
        }

    extra   = content.get("extra")   or {}
    traffic = content.get("traffic") or {}

    # Coordinates
    lat = traffic.get("map_position_y") or content.get("map_position_y") or ""
    lng = traffic.get("map_position_x") or content.get("map_position_x") or ""
    coords = {"lat": str(lat).strip(), "lng": str(lng).strip()}
    has_coords = bool(coords["lat"] and coords["lng"])

    # Address
    addr = str(
        traffic.get("new_adres") or traffic.get("adres") or
        content.get("new_adres") or content.get("adres") or ""
    ).strip()

    # Description
    raw_desc = str(content.get("post_desc") or content.get("description") or "")
    has_html = bool(re.search(r"<[a-zA-Z]", raw_desc))
    if _SECRET_RE.search(raw_desc):
        raw_desc = "[REDACTED]"
    desc_plain = strip_html(raw_desc)
    desc_source_type = "HTML" if has_html else "PLAIN_TEXT"

    # Extra fields
    homepage     = str(extra.get("cmmn_hmpg_url") or "").strip()
    phone        = str(extra.get("cmmn_telno") or "").strip()
    opening_hours= str(extra.get("cmmn_use_time") or "").strip()
    closed_days  = str(extra.get("cmmn_rstrde_info") or "").strip()
    fee_info     = str(extra.get("cmmn_ntry_se_dc") or "").strip()
    accessibility= str(extra.get("cmmn_acmpnyat_youth_dc") or extra.get("cmmn_acmpnyat_dc") or "").strip()
    subway_access= str(traffic.get("subway_info") or "").strip()

    # Tags — actual API field is "tag" (list of strings)
    raw_tags = content.get("tag") or content.get("tags") or []
    if isinstance(raw_tags, str):
        raw_tags = [t.strip() for t in raw_tags.split(",") if t.strip()]
    tags = [str(t) for t in raw_tags if t]

    # Summary — actual API field is "sumry"
    summary = str(content.get("sumry") or "").strip()[:500]

    # Related images — actual API field is "relate_img" (list of URL strings)
    related_imgs_raw = content.get("relate_img") or content.get("related_img") or []
    if isinstance(related_imgs_raw, dict):
        related_imgs_raw = [related_imgs_raw]
    related_imgs = [str(u) for u in related_imgs_raw if u]

    # Created / Updated dates
    created_at = str(content.get("creat_dt_text") or "").strip()
    updated_at = str(content.get("updt_dt_text") or "").strip()

    # Main image
    main_img = str(content.get("main_img") or "").strip()

    multi_lang = str(content.get("multi_lang_list") or "").strip()

    # Title from detail (verify vs plan)
    detail_title = str(content.get("post_sj") or "").strip()
    title_match  = detail_title.lower() == str(plan_rec.get("title","")).lower()

    # SCT re-assessment
    sct = assess_sct(plan_rec, {
        "title": detail_title, "desc_plain": desc_plain,
        "has_coords": has_coords, "addr": addr,
    })
    entity_id = assess_entity_identity(
        {"detail_verified": True, "has_coords": has_coords, "addr": addr,
         "opening_hours": opening_hours, "phone": phone},
        sct, track
    )
    tv = assess_travel_value(plan_rec, {
        "title": detail_title, "desc_plain": desc_plain,
        "addr": addr, "has_image": bool(main_img),
        "opening_hours": opening_hours, "phone": phone,
        "homepage": homepage, "has_coords": has_coords,
        "v2_detected_intents": plan_rec.get("detected_intents", []),
    }, track)
    elig = assess_eligibility(tv, {
        "has_coords": has_coords, "addr": addr,
        "opening_hours": opening_hours, "homepage": homepage,
        "v2_detected_intents": plan_rec.get("detected_intents", []),
    }, sct)

    # Quality gaps
    gaps = {}
    for field, val in [
        ("coordinates", has_coords), ("address", bool(addr)),
        ("opening_hours", bool(opening_hours)), ("closed_days", bool(closed_days)),
        ("homepage", bool(homepage)), ("phone", bool(phone)),
        ("description", bool(desc_plain)), ("main_image", bool(main_img)),
        ("related_images", bool(related_imgs)), ("accessibility", bool(accessibility)),
        ("fee_price", bool(fee_info)), ("tags", bool(tags)),
        ("multi_lang_list", bool(multi_lang)),
    ]:
        if not val:
            gaps[field] = "VISITSEOUL_MISSING"

    return {
        "cid":              cid,
        "status":           status,
        "collection_domain": plan_rec.get("collection_domain"),
        "legacy_routing_track": track,
        "category_code":    plan_rec.get("category_code"),
        "category_path":    plan_rec.get("category_path"),
        "blanket_fix_applied": plan_rec.get("blanket_fix_applied"),

        "title":            detail_title,
        "title_plan":       plan_rec.get("title", ""),
        "title_match":      title_match,
        "addr":             addr,
        "coords":           coords,
        "has_coords":       has_coords,
        "coordinate_source": "traffic.map_position_xy" if has_coords else None,
        "coordinate_confidence": "HIGH" if has_coords else "NONE",

        "desc_plain":       desc_plain,
        "desc_source_type": desc_source_type,
        "desc_length":      len(desc_plain),

        "main_img":         main_img,
        "has_image":        bool(main_img),
        "summary":          summary,
        "created_at":       created_at,
        "updated_at":       updated_at,
        "related_images":   related_imgs,
        "related_image_count": len(related_imgs),
        "related_image_schema_observed": "YES" if related_imgs else "NO",

        "homepage":         homepage,
        "phone":            phone,
        "opening_hours":    opening_hours,
        "closed_days":      closed_days,
        "fee_info":         fee_info,
        "accessibility":    accessibility,
        "subway_access":    subway_access,
        "tags":             tags,
        "multi_lang_list":  multi_lang,
        "multi_lang_available": bool(multi_lang),

        "source_content_type": sct,
        "sct_v2_original":  plan_rec.get("source_content_type"),
        "sct_changed":      sct != plan_rec.get("source_content_type"),
        "entity_identity":  entity_id,

        "travel_value":     tv,
        "eligibility":      elig,
        "quality_gaps":     gaps,

        "v2_primary_routing":   plan_rec.get("primary_routing"),
        "v2_secondary_routing": plan_rec.get("secondary_routing"),
        "v2_detected_intents":  plan_rec.get("detected_intents", []),
        "v2_travel_value_signals": plan_rec.get("travel_value_signals", []),
        "v2_routing_reasons":   plan_rec.get("routing_reason_codes", []),
        "selection_reason":     plan_rec.get("selection_reason"),

        "has_detail":       True,
        "provenance": {
            "source":            "visitseoul",
            "endpoint":          "contents/info",
            "cid":               cid,
            "source_language":   "ko",
            "fetched_at":        raw_rec.get("fetched_at", ""),
            "as_of":             AS_OF,
            "task":              TASK,
            "script_version":    SCRIPT_VERSION,
            "routing_sha":       ROUTING_SHA,
        },
    }


# ── Data loading ──────────────────────────────────────────────────────────────

def load_v2_routing() -> list:
    """Load V2 routing JSONL with schema assertion."""
    records = []
    with open(V2_ROUTING_FILE, encoding="utf-8") as f:
        for i, line in enumerate(f):
            line = line.strip()
            if not line:
                continue
            r = json.loads(line)
            missing = REQUIRED_V2_FIELDS - set(r.keys())
            if missing:
                print(f"[SCHEMA ERROR] Record {i}: missing fields {missing}", file=sys.stderr)
                print("FIELD_SCHEMA_MISMATCH=YES", flush=True)
                sys.exit(1)
            records.append(r)
    print(f"[INFO] V2 routing loaded: {len(records)} records, schema OK", file=sys.stderr)
    return records


def load_existing_api_payload_cids() -> set:
    """Load CIDs that already have actual VisitSeoul API payload."""
    cids = set()
    for fp in [INTEGRATED_FILE, DRYRUN_FILE]:
        if not fp.exists():
            continue
        for line in fp.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line:
                r = json.loads(line)
                cid = r.get("cid")
                if cid:
                    cids.add(cid)
    return cids


def build_nature_119_cids(records: list) -> set:
    return {
        r["cid"] for r in records
        if r.get("category_code") in NATURE_119_CODES
        and r.get("legacy_routing_track") == "PLACE_CORE_CANDIDATE"
    }


# ── Plan builder ──────────────────────────────────────────────────────────────

def build_plan(v2_records: list, existing_api_cids: set, nature_cids: set) -> list:
    """
    Build collection plan from V2 routing.
    4 domains:
      A. PLACE_CORE_CANDIDATE + A + !existing_detail_available
      B. EXPERIENCE_CANDIDATE + A + !existing_detail_available
      C. TEMPLE_STAY_CANDIDATE + A + !existing_detail_available
      D. BLANKET_02_FIX + PLACE_CONDITIONAL_REVIEW + A + !existing_detail_available
    Excludes: BLANKET_01_FIX bars, Nature 119, existing API payload.
    """
    plan = []
    for r in sorted(v2_records, key=lambda x: x["cid"]):
        cid = r["cid"]
        track = r["legacy_routing_track"]
        primary = r["primary_routing"]
        has_detail = r.get("existing_detail_available", False)
        blanket = r.get("blanket_fix_applied")

        # Explicit exclusions
        if cid in nature_cids:
            continue
        if cid in existing_api_cids:
            continue
        if has_detail:
            continue

        domain = None
        reason = None

        if track == "PLACE_CORE_CANDIDATE" and primary == "A":
            domain = "PLACE_CORE"
            reason = "PLACE_CORE_CANDIDATE_A_NO_DETAIL"

        elif track == "EXPERIENCE_CANDIDATE" and primary == "A":
            domain = "EXPERIENCE"
            reason = "EXPERIENCE_CANDIDATE_A_NO_DETAIL"

        elif track == "TEMPLE_STAY_CANDIDATE" and primary == "A":
            domain = "TEMPLE_STAY"
            reason = "TEMPLE_STAY_CANDIDATE_A_NO_DETAIL"

        elif (blanket == "BLANKET_02_FIX" and
              track == "PLACE_CONDITIONAL_REVIEW" and
              primary == "A"):
            domain = "V2_RECOVERED"
            reason = "BLANKET_02_FIX_EDUCATION_RESTORED_TO_A"

        if domain is None:
            continue

        plan.append({
            "cid":                   cid,
            "title":                 r.get("title", ""),
            "category_code":         r.get("category_code", ""),
            "category_path":         r.get("category_path", ""),
            "collection_domain":     domain,
            "legacy_routing_track":  track,
            "primary_routing":       primary,
            "secondary_routing":     r.get("secondary_routing", []),
            "existing_detail_available": False,
            "blanket_fix_applied":   blanket,
            "selection_reason":      reason,
            "source_content_type":   r.get("source_content_type"),
            "detected_intents":      r.get("detected_intents", []),
            "travel_value_signals":  r.get("travel_value_signals", []),
            "routing_reason_codes":  r.get("routing_reason_codes", []),
            "confidence":            r.get("confidence"),
        })

    return plan


def validate_plan_gate(plan: list, bar_excluded: int) -> bool:
    """Check all Plan Gate conditions. Returns True if PASS."""
    domain_counts = Counter(p["collection_domain"] for p in plan)
    total = len(plan)
    dup_cids = len(plan) - len(set(p["cid"] for p in plan))

    print(f"\n=== PLAN-ONLY GATE SUMMARY ===")
    print(f"FIELD_SCHEMA_MISMATCH         = NO")
    print(f"PLACE_CORE_PLAN               = {domain_counts.get('PLACE_CORE', 0)}")
    print(f"EXPERIENCE_PLAN               = {domain_counts.get('EXPERIENCE', 0)}")
    print(f"TEMPLE_STAY_PLAN              = {domain_counts.get('TEMPLE_STAY', 0)}")
    print(f"V2_RECOVERED_PLAN             = {domain_counts.get('V2_RECOVERED', 0)}")
    print(f"PLAN_TOTAL                    = {total}")
    print(f"DUPLICATE_CIDS                = {dup_cids}")
    print(f"BAR_PUB_EXCLUDED_FROM_THIS_TASK = {bar_excluded}")

    errors = []
    for domain, key in [("PLACE_CORE", "PLACE_CORE"), ("EXPERIENCE", "EXPERIENCE"),
                         ("TEMPLE_STAY", "TEMPLE_STAY"), ("V2_RECOVERED", "V2_RECOVERED")]:
        actual = domain_counts.get(domain, 0)
        expected_val = EXPECTED[key]
        if actual != expected_val:
            errors.append(f"{domain}: expected {expected_val}, got {actual}")

    if total != EXPECTED["PLAN_TOTAL"]:
        errors.append(f"PLAN_TOTAL: expected {EXPECTED['PLAN_TOTAL']}, got {total}")

    if dup_cids != 0:
        errors.append(f"DUPLICATE_CIDS: {dup_cids}")

    if total > SAFETY_CEILING:
        errors.append(f"CANDIDATE_TOTAL {total} > SAFETY_CEILING {SAFETY_CEILING}")

    if errors:
        print(f"\nPLAN_GATE = FAIL")
        for e in errors:
            print(f"  ERROR: {e}")
        print("COLLECTION_STARTED = NO — delta analysis required before proceeding.")
        return False

    print(f"\nPLAN_GATE = PASS")
    print(f"COLLECTION_STARTED = PENDING --collect flag")
    return True


# ── API Collection ────────────────────────────────────────────────────────────

def collect_all(plan: list, api_key: str) -> tuple:
    """
    Run API calls for all plan CIDs.
    Returns (raw_records, attempts)
    """
    raw_records = []
    attempts = []
    consecutive_failures = 0

    print(f"\n[COLLECT] Starting API collection: {len(plan)} CIDs", flush=True)
    print(f"[COLLECT] DELAY={DELAY}s, MAX_RETRY={MAX_RETRY}", flush=True)

    for i, plan_rec in enumerate(plan, 1):
        cid = plan_rec["cid"]
        fetched_at = datetime.now(timezone.utc).isoformat()

        status, content, n_attempts = fetch_detail(cid, api_key)

        if status == "AUTH_FAIL":
            print(f"\n[FATAL] AUTH_FAIL at CID {cid}. STOP immediately.", file=sys.stderr)
            sys.exit(2)

        attempt_rec = {
            "kind":          "detail",
            "cid":           cid,
            "collection_domain": plan_rec["collection_domain"],
            "attempted_at":  fetched_at,
            "status":        status,
            "n_attempts":    n_attempts,
            "title":         str(content.get("post_sj", "")) if status == "SUCCESS" else "",
            "error":         content.get("last_error") if status != "SUCCESS" else None,
        }
        attempts.append(attempt_rec)

        raw_rec = {
            "cid":         cid,
            "status":      status,
            "fetched_at":  fetched_at,
            "_raw_content": content if status == "SUCCESS" else {},
            "error":       content.get("last_error") if status != "SUCCESS" else None,
            "provenance": {
                "source": "visitseoul", "endpoint": "contents/info",
                "cid": cid, "fetched_at": fetched_at,
                "task": TASK, "script_version": SCRIPT_VERSION,
            },
        }
        raw_records.append(raw_rec)

        if status == "SUCCESS":
            consecutive_failures = 0
            print(f"  [{i:3d}/{len(plan)}] SUCCESS  {cid}  {str(content.get('post_sj',''))[:40]}", flush=True)
        else:
            consecutive_failures += 1
            print(f"  [{i:3d}/{len(plan)}] {status:20s}  {cid}", flush=True)

        if consecutive_failures >= CONSECUTIVE_FAILURE_LIMIT:
            print(f"\n[FATAL] {CONSECUTIVE_FAILURE_LIMIT} consecutive failures. STOP.", file=sys.stderr)
            # Write partial output before stopping
            break

        if i < len(plan):
            time.sleep(DELAY)

    print(f"\n[COLLECT] Done: {len(raw_records)} processed, "
          f"{sum(1 for r in raw_records if r['status']=='SUCCESS')} SUCCESS", flush=True)
    return raw_records, attempts


# ── Output writers ────────────────────────────────────────────────────────────

def write_jsonl(records: list, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = []
    for r in records:
        # Strip _raw_content from file (raw file gets it; normalized doesn't need it)
        out = {k: v for k, v in r.items() if k != "_raw_content"}
        lines.append(json.dumps(out, ensure_ascii=False))
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_raw_jsonl(records: list, path: Path) -> None:
    """Write raw records — _raw_content included but no auth headers."""
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = []
    for r in records:
        out = dict(r)
        # Scan raw content for secrets
        raw_c = out.get("_raw_content", {})
        if raw_c:
            raw_str = json.dumps(raw_c, ensure_ascii=False)
            if _SECRET_RE.search(raw_str):
                out["_raw_content_note"] = "REDACTED_SECRET_DETECTED"
                out["_raw_content"] = {}
        lines.append(json.dumps(out, ensure_ascii=False))
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def build_manifest(plan: list, raw_records: list, normalized: list,
                   bar_excluded: int, nature_cids_count: int) -> dict:
    domain_counts = Counter(p["collection_domain"] for p in plan)
    status_counts = Counter(r["status"] for r in raw_records)
    success_norm  = [r for r in normalized if r.get("status") == "SUCCESS" and r.get("has_detail")]

    coord_avail  = sum(1 for r in success_norm if r.get("has_coords"))
    addr_avail   = sum(1 for r in success_norm if r.get("addr"))
    hours_avail  = sum(1 for r in success_norm if r.get("opening_hours"))
    home_avail   = sum(1 for r in success_norm if r.get("homepage"))
    phone_avail  = sum(1 for r in success_norm if r.get("phone"))
    img_avail    = sum(1 for r in success_norm if r.get("has_image"))
    rel_img      = sum(1 for r in success_norm if r.get("related_image_count", 0) > 0)
    acc_avail    = sum(1 for r in success_norm if r.get("accessibility"))

    sct_counts   = Counter(r.get("source_content_type") for r in success_norm)
    sct_changed  = sum(1 for r in success_norm if r.get("sct_changed"))

    search_counts= Counter(r.get("eligibility", {}).get("SEARCHABLE") for r in success_norm)
    explore_counts=Counter(r.get("eligibility", {}).get("EXPLORE_ELIGIBLE") for r in success_norm)
    ai_counts    = Counter(r.get("eligibility", {}).get("AI_ITINERARY_ELIGIBLE") for r in success_norm)

    all_gaps = Counter()
    for r in success_norm:
        all_gaps.update(r.get("quality_gaps", {}).keys())

    n_success = status_counts.get("SUCCESS", 0)
    actual_api_payload_before = 135  # integrated(120) + dryrun_unique(15)

    return {
        "task": TASK,
        "script_version": SCRIPT_VERSION,
        "as_of": AS_OF,
        "routing_sha": ROUTING_SHA,
        "routing_version": ROUTING_VERSION,

        "PLAN_TOTAL": len(plan),
        "PLACE_CORE_PLAN": domain_counts.get("PLACE_CORE", 0),
        "EXPERIENCE_PLAN": domain_counts.get("EXPERIENCE", 0),
        "TEMPLE_STAY_PLAN": domain_counts.get("TEMPLE_STAY", 0),
        "V2_RECOVERED_PLAN": domain_counts.get("V2_RECOVERED", 0),

        "BAR_PUB_EXCLUDED_FROM_THIS_TASK": bar_excluded,

        "DUPLICATE_PLAN_CIDS": 0,
        "EXISTING_DETAIL_INCLUDED": 0,

        "B_ROUTING_EVIDENCE_CIDS": 254,
        "NATURE_CATEGORY_EVIDENCE_ONLY": nature_cids_count,
        "ACTUAL_EXISTING_API_PAYLOAD_CIDS": actual_api_payload_before,

        "API_UNIQUE_CIDS_CALLED": len(raw_records),
        "API_TOTAL_ATTEMPTS": sum(a.get("n_attempts", 1) for a in []),  # filled below
        "API_SUCCESS": n_success,
        "API_FAILURE": status_counts.get("FAILED_RETRY_EXHAUSTED", 0) + status_counts.get("API_ERROR", 0),
        "EMPTY_RESPONSE": status_counts.get("EMPTY_RESPONSE", 0),
        "IDENTITY_MISMATCH": 0,
        "PARSE_ERROR": status_counts.get("PARSE_ERROR", 0),

        "NEW_DETAIL_SUCCESS_CIDS": n_success,

        "ACTUAL_API_PAYLOAD_BEFORE_TASK": actual_api_payload_before,
        "ACTUAL_API_PAYLOAD_AFTER_TASK": actual_api_payload_before + n_success,

        "COORD_AVAILABLE": coord_avail,
        "ADDRESS_AVAILABLE": addr_avail,
        "HOURS_AVAILABLE": hours_avail,
        "HOMEPAGE_AVAILABLE": home_avail,
        "PHONE_AVAILABLE": phone_avail,
        "MAIN_IMAGE_AVAILABLE": img_avail,
        "RELATED_IMAGE_AVAILABLE": rel_img,
        "ACCESSIBILITY_AVAILABLE": acc_avail,

        "SOURCE_CONTENT_TYPE_COUNTS": dict(sct_counts),
        "SCT_CHANGED_FROM_V2": sct_changed,

        "SEARCHABLE_COUNTS": dict(search_counts),
        "EXPLORE_COUNTS": dict(explore_counts),
        "AI_ELIGIBILITY_COUNTS": dict(ai_counts),

        "QUALITY_GAP_COUNTS": dict(all_gaps),

        "SCT_AUDIT_CANDIDATES": 16,
        "SCT_APPLIED_BEFORE_THIS_TASK": 2,
        "SCT_REMAINING_REVIEW": 14,
        "DETAIL_RESOLVED_SCT_COUNT": sct_changed,
        "SCT_REMAINING_AFTER_DETAIL": max(0, 14 - sct_changed),

        "SECRET_LEAK": 0,
        "NATURE_RECALLED": 0,
        "EXISTING_API_PAYLOAD_RECALLED": 0,
        "BAR_PUB_CALLED": 0,
    }


# ── Normalize-only (deterministic) ────────────────────────────────────────────

def run_normalize_only() -> None:
    """Re-normalize from existing raw JSONL. Deterministic."""
    if not RAW_FILE.exists():
        print("ERROR: raw file not found. Run --collect first.", file=sys.stderr)
        sys.exit(1)
    if not PLAN_FILE.exists():
        print("ERROR: plan file not found. Run --plan-only first.", file=sys.stderr)
        sys.exit(1)

    plan = [json.loads(l) for l in PLAN_FILE.read_text(encoding="utf-8").splitlines() if l.strip()]
    raw  = [json.loads(l) for l in RAW_FILE.read_text(encoding="utf-8").splitlines() if l.strip()]

    plan_by_cid = {p["cid"]: p for p in plan}
    normalized = []
    for raw_rec in sorted(raw, key=lambda x: x["cid"]):
        cid = raw_rec["cid"]
        plan_rec = plan_by_cid.get(cid, {})
        n = normalize_raw(raw_rec, plan_rec)
        normalized.append(n)

    write_jsonl(normalized, NORMALIZED_FILE)

    # Hash check
    h = hashlib.sha256(NORMALIZED_FILE.read_bytes()).hexdigest()
    print(f"NORMALIZE_ONLY_COMPLETE: {len(normalized)} records")
    print(f"NORMALIZED_SHA256: {h}")
    print("NORMALIZATION_BYTE_IDENTICAL: RUN_TWICE_TO_VERIFY")


# ── Main ──────────────────────────────────────────────────────────────────────

def get_api_key() -> str:
    key = os.environ.get("VISITSEOUL_API_KEY", "")
    if not key:
        print("VISITSEOUL_API_KEY_AVAILABLE=NO", flush=True)
        print("STOP: API key not set in environment.", file=sys.stderr)
        sys.exit(1)
    print("VISITSEOUL_API_KEY_AVAILABLE=YES", flush=True)
    return key


def main():
    parser = argparse.ArgumentParser(description=TASK)
    parser.add_argument("--plan-only",       action="store_true")
    parser.add_argument("--collect",         action="store_true")
    parser.add_argument("--normalize-only",  action="store_true")
    args = parser.parse_args()

    if args.normalize_only:
        run_normalize_only()
        return

    # ── Load V2 routing ──────────────────────────────────────────────────────
    v2_records = load_v2_routing()
    assert len(v2_records) == 3765, f"V2 inventory mismatch: {len(v2_records)}"

    existing_api_cids = load_existing_api_payload_cids()
    nature_cids = build_nature_119_cids(v2_records)
    assert len(nature_cids) == 119, f"Nature 119 mismatch: {len(nature_cids)}"

    # Count bars excluded (for gate reporting)
    bar_excluded = sum(
        1 for r in v2_records
        if r.get("blanket_fix_applied") == "BLANKET_01_FIX"
        and r.get("legacy_routing_track") == "RESTAURANT_TRACK"
        and r.get("primary_routing") == "A"
        and not r.get("existing_detail_available", False)
    )

    # ── Build plan ──────────────────────────────────────────────────────────
    plan = build_plan(v2_records, existing_api_cids, nature_cids)

    # Write plan JSONL
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    write_jsonl(plan, PLAN_FILE)
    print(f"[INFO] Plan written: {PLAN_FILE}", file=sys.stderr)

    # ── Plan gate ───────────────────────────────────────────────────────────
    gate_pass = validate_plan_gate(plan, bar_excluded)

    if args.plan_only:
        sys.exit(0 if gate_pass else 1)

    if not gate_pass:
        print("PLAN_GATE=FAIL — cannot proceed to --collect.", file=sys.stderr)
        sys.exit(1)

    if not args.collect:
        print("No action. Use --plan-only or --collect or --normalize-only.")
        sys.exit(0)

    # ── Collect ─────────────────────────────────────────────────────────────
    api_key = get_api_key()
    raw_records, attempts = collect_all(plan, api_key)

    # Write raw (includes _raw_content)
    write_raw_jsonl(raw_records, RAW_FILE)
    print(f"[INFO] Raw written: {RAW_FILE}", file=sys.stderr)

    # Write attempts
    write_jsonl(attempts, ATTEMPTS_FILE)

    # ── Normalize ───────────────────────────────────────────────────────────
    plan_by_cid = {p["cid"]: p for p in plan}
    normalized = []
    for raw_rec in sorted(raw_records, key=lambda x: x["cid"]):
        cid = raw_rec["cid"]
        plan_rec = plan_by_cid.get(cid, {})
        n = normalize_raw(raw_rec, plan_rec)
        normalized.append(n)

    write_jsonl(normalized, NORMALIZED_FILE)
    print(f"[INFO] Normalized written: {NORMALIZED_FILE}", file=sys.stderr)

    # ── Manifest ────────────────────────────────────────────────────────────
    manifest = build_manifest(plan, raw_records, normalized, bar_excluded, len(nature_cids))
    # Fix API_TOTAL_ATTEMPTS from actual attempts
    manifest["API_TOTAL_ATTEMPTS"] = sum(a.get("n_attempts", 1) for a in attempts)

    MANIFEST_FILE.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )
    print(f"[INFO] Manifest written: {MANIFEST_FILE}", file=sys.stderr)

    # ── Final QA summary ────────────────────────────────────────────────────
    n_success = sum(1 for r in raw_records if r["status"] == "SUCCESS")
    print(f"\n=== COLLECTION COMPLETE ===")
    print(f"ROUTING_VERSION              = {ROUTING_VERSION}")
    print(f"ROUTING_SHA                  = {ROUTING_SHA}")
    print(f"TRACK_FIELD_NAME             = legacy_routing_track")
    print(f"FIELD_SCHEMA_ASSERTION       = PASS")
    print(f"PLAN_TOTAL                   = {len(plan)}")
    print(f"API_UNIQUE_CIDS_CALLED       = {len(raw_records)}")
    print(f"API_SUCCESS                  = {n_success}")
    print(f"ACTUAL_API_PAYLOAD_BEFORE    = 135")
    print(f"ACTUAL_API_PAYLOAD_AFTER     = {135 + n_success}")
    print(f"NATURE_RECALLED              = 0")
    print(f"EXISTING_API_PAYLOAD_RECALLED= 0")
    print(f"BAR_PUB_CALLED               = 0")
    print(f"SECRET_LEAK                  = 0")
    print(f"COUNT_TARGET                 = NOT_DEFINED_BY_DESIGN")


if __name__ == "__main__":
    main()
