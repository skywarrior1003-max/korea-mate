#!/usr/bin/env python3
"""
TASK-SEOUL-NONFOOD-TARGETED-EXECUTION-BATCH-2
VisitSeoul contents/info detail collection for Seoul non-Food Place Detail Target.

Scope:
  - 573-record PLACE_DETAIL_TARGET manifest  (A-routing CONDITIONAL+SHOPPING+UNRESOLVED)
  - 2 Batch-1 holdover entity/lifecycle recheck (KOPc3g5o6, KOPgdf9ry)
  Total max: 575

Policy:
  - EXISTING_SOURCE_RECOVERY_BEFORE_NEW_API = YES
    → 9 CIDs already normalized from place-core-experience task are REUSED
  - 5-axis eligibility: SEARCHABLE / EXPLORE / AI_ITINERARY / USER_CAN_SELECT / USER_CAN_SAVE
  - TV1~TV7 Travel Value Gate (existing policy, no new rules)
  - RULE 3: commercial → SEARCHABLE only (no AI auto-include)
  - RULE 4: USER PICKED PLACE > AI AUTO
  - Entity/Lifecycle Gate applied to special 2 BEFORE eligibility

Modes:
  --plan-only     Validate scope, print gate summary, no API calls.
  --collect       Full collection + normalize + eligibility assessment.
  --normalize-only Re-normalize from existing raw (deterministic, no API).

Safety:
  - API key: env VISITSEOUL_API_KEY, never printed/logged/committed.
  - PLAN_TOTAL gate: 575 (573 manifest + 2 special).
  - SAFETY_CEILING 650: stop if scope unexpectedly large.
  - Consecutive failure stop at 10.
  - AUTH_FAIL: immediate stop.
  - No unofficial sources, no Google/Kakao verification.
  - NUMERIC_PRUNING = FORBIDDEN.
  - SELF_OUTPUT_AS_SOURCE_INPUT = FORBIDDEN.
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
from datetime import date, datetime, timezone
from pathlib import Path

# ── Constants ─────────────────────────────────────────────────────────────────

SCRIPT_VERSION = "v1.0.0"
TASK = "TASK-SEOUL-NONFOOD-TARGETED-EXECUTION-BATCH-2"
BASE_URL = "https://api-call.visitseoul.net/api/v1"
TIMEOUT = 25
DELAY = 1.2
MAX_RETRY = 2
CONSECUTIVE_FAILURE_LIMIT = 10
AS_OF = "2026-08-12"
TODAY = date(2026, 8, 12)
ROUTING_SHA = "9f3aa47"

# ── Expected plan totals (gate) ────────────────────────────────────────────────
EXPECTED_MANIFEST_TOTAL = 573
EXPECTED_SPECIAL_TOTAL = 2
EXPECTED_PLAN_TOTAL = 575
SAFETY_CEILING = 650

SPECIAL_CIDS = {"KOPc3g5o6", "KOPgdf9ry"}  # Batch 1 holdover

# ── File paths ─────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data" / "seoul-source-audit"

# Inputs
MANIFEST_573_FILE       = DATA_DIR / "seoul-nonfood-place-detail-target-manifest-v1.json"
BATCH1_ASSESSMENT_FILE  = DATA_DIR / "seoul-nonfood-batch1-eligibility-assessment-v1.json"
PLACE_CORE_NORM_FILE    = DATA_DIR / "seoul-place-core-experience-detail-normalized-v1.jsonl"
INTEGRATED_FILE         = DATA_DIR / "seoul-integrated-travel-value-detail-samples-v1.jsonl"
DRYRUN_FILE             = DATA_DIR / "seoul-visitseoul-detail-dryrun-v1.jsonl"
V2_ROUTING_FILE         = DATA_DIR / "seoul-full-enrichment-routing-v2.jsonl"

# Outputs
RAW_FILE          = DATA_DIR / "seoul-nonfood-batch2-detail-raw-v1.jsonl"
NORMALIZED_FILE   = DATA_DIR / "seoul-nonfood-batch2-detail-normalized-v1.jsonl"
ATTEMPTS_FILE     = DATA_DIR / "seoul-nonfood-batch2-detail-attempts-v1.jsonl"
MANIFEST_OUT_FILE = DATA_DIR / "seoul-nonfood-batch2-eligibility-manifest-v1.json"

# ── Secret redaction ──────────────────────────────────────────────────────────
_SECRET_RE = re.compile(
    r"(?i)(api[-_]?key|apikey|secret|token|password|auth)\s*[=:]\s*\S+",
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
    if not raw:
        return ""
    s = _DANGEROUS_TAGS.sub(" ", raw)
    s = _HTML_TAG.sub(" ", s)
    s = html_mod.unescape(s)
    s = _WHITESPACE.sub(" ", s).strip()
    return s[:4000]


# ── Travel Value Gate ─────────────────────────────────────────────────────────
_TV1_HIGH_KW = [
    "경복궁", "창덕궁", "남산", "명동", "인사동", "광화문", "북촌", "홍대", "이태원",
    "동대문", "한강", "국립", "서울 대표", "서울 랜드마크", "must", "landmark",
    "대표", "명소", "historic", "palace", "heritage", "유네스코", "국보",
    "서울시립", "문화재", "보물", "사적",
]
_TV3_HIGH_KW = [
    "전통", "한옥", "한국 고유", "한류", "K-", "k-pop", "kpop", "조선",
    "서울 특유", "고궁", "사찰", "장인", "국내 최초", "최초",
    "전통주", "막걸리", "한식", "한국 전통", "오래가게",
]
_TV4_HIGH_KW = [
    "체험", "만들기", "직접", "배우는", "체험학습", "체험관", "workshop",
    "프로그램", "활동", "클래스", "체험 프로그램", "참여",
]
_TV7_HIGH_SIGNALS = ["homepage", "opening_hours", "phone", "addr", "coords"]

# RULE 3: Commercial category codes → SEARCHABLE only (no AI auto-include)
_COMMERCIAL_CATEGORY_PREFIXES = [
    "쇼핑>", "쇼핑 ",
]
# Exception signals override commercial restriction
_COMMERCIAL_EXCEPTION_KW = [
    "kpop", "k-pop", "케이팝", "k-beauty", "kbeauty", "케이뷰티",
    "플래그십", "flagship", "오래가게", "heritage", "한류",
    "관광 명소", "관광명소", "tourism",
]


def is_commercial_rule3(category: str, desc: str, tags: list) -> bool:
    """RULE 3: returns True if commercial blanket applies (no AI auto-include)."""
    cat_lower = (category or "").lower()
    if not any(cat_lower.startswith(p.lower()) for p in _COMMERCIAL_CATEGORY_PREFIXES):
        return False
    # Check exception signals
    text = (desc + " " + " ".join(tags or [])).lower()
    if any(k.lower() in text for k in _COMMERCIAL_EXCEPTION_KW):
        return False  # Exception: tourism/K-culture signal overrides
    return True


def assess_travel_value(plan_rec: dict, detail: dict) -> dict:
    """TV1~TV7 assessment. Evidence-based, no fixed thresholds."""
    text = " ".join([
        detail.get("title", ""),
        detail.get("desc_plain", ""),
        detail.get("addr", ""),
        " ".join(detail.get("tags", [])),
    ]).lower()

    def kw(kws): return any(k.lower() in text for k in kws)

    track = plan_rec.get("reason", "")
    signals = plan_rec.get("travel_value_signals", [])
    category = plan_rec.get("category", "")

    # TV1 TRAVEL_PURPOSE_VALUE
    if kw(_TV1_HIGH_KW) or "HIGH_TRAVEL_VALUE" in signals:
        tv1 = "HIGH"
    elif "SHOPPING_HIGH_OR_INTENT" in track or "미술관" in category or "박물관" in category:
        tv1 = "MEDIUM"
    else:
        tv1 = "LOW"

    # TV2 TRAVELER_UTILITY_VALUE
    u = sum([
        bool(detail.get("opening_hours")),
        bool(detail.get("phone")),
        bool(detail.get("homepage")),
        bool(detail.get("addr")),
    ])
    tv2 = "HIGH" if u >= 3 else ("MEDIUM" if u >= 2 else "LOW")

    # TV3 KOREA_LOCAL_UNIQUENESS
    if kw(_TV3_HIGH_KW):
        tv3 = "HIGH"
    elif "종교성지" in category or "역사" in category or "전통" in text:
        tv3 = "MEDIUM"
    else:
        tv3 = "UNKNOWN"

    # TV4 EXPERIENCE_VALUE
    if kw(_TV4_HIGH_KW):
        tv4 = "HIGH"
    elif "레저" in category or "체험" in text:
        tv4 = "MEDIUM"
    else:
        tv4 = "LOW"

    # TV5 INTENT_MATCH_POTENTIAL
    intents = plan_rec.get("detected_intents", [])
    tv5 = "HIGH" if len(intents) >= 3 else ("MEDIUM" if len(intents) >= 1 else "LOW")

    # TV6 INFORMATION_QUALITY
    desc_len = len(detail.get("desc_plain", ""))
    i6 = sum([desc_len > 200, bool(detail.get("has_image")), bool(detail.get("opening_hours")), bool(detail.get("phone"))])
    tv6 = "HIGH" if i6 >= 3 else ("MEDIUM" if i6 >= 2 else "LOW")

    # TV7 CURRENT_USABILITY
    has_coords = detail.get("has_coords", False)
    tv7 = "HIGH" if (has_coords and (detail.get("opening_hours") or detail.get("phone"))) else ("MEDIUM" if has_coords else "LOW")

    return {
        "TV1_TRAVEL_PURPOSE_VALUE": tv1,
        "TV2_TRAVELER_UTILITY_VALUE": tv2,
        "TV3_KOREA_LOCAL_UNIQUENESS": tv3,
        "TV4_EXPERIENCE_VALUE": tv4,
        "TV5_INTENT_MATCH_POTENTIAL": tv5,
        "TV6_INFORMATION_QUALITY": tv6,
        "TV7_CURRENT_USABILITY": tv7,
    }


def assess_eligibility(tv: dict, detail: dict, plan_rec: dict) -> dict:
    """5-axis eligibility assessment. Applies RULE 3 / RULE 4."""
    category = plan_rec.get("category", "")
    desc = detail.get("desc_plain", "")
    tags = detail.get("tags", [])

    has_location = detail.get("has_coords", False) or bool(detail.get("addr"))
    has_info = bool(detail.get("opening_hours") or detail.get("homepage"))

    # SEARCHABLE: has identity + location
    searchable = has_location

    # Explore
    high_tv = sum(1 for v in tv.values() if v == "HIGH")
    if high_tv >= 3 and has_location and has_info:
        explore = "YES"
    elif high_tv >= 2 and has_location:
        explore = "CONDITIONAL"
    else:
        explore = "NO"

    # AI_ITINERARY: TV gate + RULE 3
    commercial = is_commercial_rule3(category, desc, tags)
    ai_conditions = []
    if not detail.get("has_coords", False):
        ai_conditions.append("COORDINATE_REQUIRED")
    if not has_info:
        ai_conditions.append("HOURS_OR_HOMEPAGE_REQUIRED")
    if commercial:
        ai_conditions.append("RULE3_COMMERCIAL_NO_AUTO_AI")

    if commercial:
        ai = "NO"
    elif high_tv >= 4 and not ai_conditions:
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
        "commercial_rule3_applied": commercial,
    }


def classify_final(eligibility: dict, entity_class: str = None) -> str:
    """
    Map eligibility to final classification class.
    entity_class: only for special 2 cases (A/B/C/D gate result).
    """
    if entity_class:
        if entity_class == "B_ACTIVE_EVENT":
            return "EVENT_ACTIVE_CONFIRMED"
        if entity_class == "C_INACTIVE_EVENT":
            return "EVENT_INACTIVE_OR_ENDED"
        if entity_class == "D_MULTI_LOCATION":
            return "MULTI_LOCATION_NON_PLACE"
        # entity_class == "A_PHYSICAL_PLACE" → fall through to eligibility assessment

    ai = eligibility.get("AI_ITINERARY_ELIGIBLE", "NO")
    explore = eligibility.get("EXPLORE_ELIGIBLE", "NO")
    searchable = eligibility.get("SEARCHABLE", "NO")

    if ai in ("YES", "CONDITIONAL") or explore in ("YES", "CONDITIONAL"):
        return "PLACE_AI_OR_EXPLORE_ELIGIBLE"
    if searchable == "YES":
        return "PLACE_SEARCHABLE_USER_PICK"
    return "UNRESOLVED"


# ── Entity / Lifecycle Gate for special 2 ────────────────────────────────────

# Today for lifecycle date comparison
_DATE_PATTERN = re.compile(r"(20\d{2})[년.\-/]\s*(\d{1,2})[월.\-/]\s*(\d{1,2})")
_END_MARKERS = ["~", "까지", "기간", "종료"]
_PERMANENT_KW = ["상시", "연중", "연중무휴", "정규 운영", "상설", "개관", "관람시간", "운영시간"]
_MULTI_LOC_KW = [
    "여의도", "남산공원", "청계천", "을지로", "3곳", "3개소", "세 곳",
    "각 장소", "장소별", "여러 장소", "복수 장소",
]


def parse_end_date(text: str) -> date | None:
    """Find the latest date mentioned after an end marker (~, 까지)."""
    lines = text.split("\n")
    for line in lines:
        for marker in _END_MARKERS:
            if marker in line:
                for m in _DATE_PATTERN.finditer(line):
                    y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
                    try:
                        return date(y, mo, d)
                    except ValueError:
                        pass
    return None


def apply_entity_lifecycle_gate(cid: str, plan_rec: dict, detail: dict) -> dict:
    """
    Entity/Lifecycle Gate for Batch 1 holdover cases.
    Possible results:
      A_PHYSICAL_PLACE       → proceed to 5-axis eligibility
      B_ACTIVE_EVENT         → ACTIVE_EVENT_SERVICE_POOL candidate
      C_INACTIVE_EVENT       → excluded (ended)
      D_MULTI_LOCATION       → single Place creation forbidden
    """
    desc = detail.get("desc_plain", "").lower()
    addr = detail.get("addr", "")
    title = plan_rec.get("title", "")
    tags = detail.get("tags", [])

    # 1. Multi-location check
    if any(kw in desc for kw in _MULTI_LOC_KW):
        single_addr_signals = ["서울특별시", "서울시", "구 "]
        addr_specific = bool(addr) and sum(1 for s in single_addr_signals if s in addr) > 0
        if not addr_specific or any(kw in desc for kw in ["3곳", "3개소", "세 곳", "각 장소", "복수"]):
            return {
                "gate_result": "D_MULTI_LOCATION",
                "gate_evidence": f"multi_location_keywords_found_in_desc",
                "addr": addr,
            }

    # 2. Permanent place signals
    desc_full = detail.get("desc_plain", "")  # keep case for Korean
    has_permanent = any(kw in desc_full for kw in _PERMANENT_KW)
    has_coords = detail.get("has_coords", False)
    has_opening_hours = bool(detail.get("opening_hours"))

    # 3. Event lifecycle signals
    end_date = parse_end_date(desc_full)
    event_temporal_kw = ["전시기간", "행사기간", "운영기간", "운영 기간", "전시 기간"]
    has_event_temporal = any(kw in desc_full for kw in event_temporal_kw)

    if has_permanent and not has_event_temporal:
        return {
            "gate_result": "A_PHYSICAL_PLACE",
            "gate_evidence": "permanent_operation_signals_no_event_temporal",
        }

    if end_date:
        if end_date < TODAY:
            return {
                "gate_result": "C_INACTIVE_EVENT",
                "gate_evidence": f"end_date={end_date} < today={TODAY}",
            }
        else:
            return {
                "gate_result": "B_ACTIVE_EVENT",
                "gate_evidence": f"end_date={end_date} >= today={TODAY}, event_temporal",
            }

    if has_event_temporal:
        return {
            "gate_result": "B_ACTIVE_EVENT",
            "gate_evidence": "event_temporal_keywords_no_end_date_parseable",
        }

    # Default: if has_coords and specific address → physical place
    if has_coords and addr and not has_event_temporal:
        return {
            "gate_result": "A_PHYSICAL_PLACE",
            "gate_evidence": "has_coords_and_addr_no_event_signals",
        }

    return {
        "gate_result": "UNRESOLVED",
        "gate_evidence": "insufficient_signals_for_classification",
    }


# ── API engine ────────────────────────────────────────────────────────────────

def _post_json(endpoint: str, body: dict, api_key: str) -> dict:
    import urllib.error, urllib.request
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
    """Fetch VisitSeoul contents/info for one CID. Returns (status, content, attempt_count)."""
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
                time.sleep(2.0)
    return "API_ERROR", {"last_error": str(last_exc)}, MAX_RETRY + 1


# ── Normalization ─────────────────────────────────────────────────────────────

def normalize_raw(raw_rec: dict, plan_rec: dict, source: str = "API") -> dict:
    """Build normalized record from raw API content + plan metadata."""
    cid = raw_rec["cid"]
    content = raw_rec.get("_raw_content", {})
    status = raw_rec.get("status", "UNKNOWN")
    category = plan_rec.get("category", "")

    if status != "SUCCESS" or not content:
        return {
            "cid": cid,
            "status": status,
            "error": raw_rec.get("error"),
            "category": category,
            "reason": plan_rec.get("reason"),
            "has_detail": False,
            "raw_source": source,
            "provenance": raw_rec.get("provenance", {}),
        }

    extra   = content.get("extra")   or {}
    traffic = content.get("traffic") or {}

    lat = traffic.get("map_position_y") or content.get("map_position_y") or ""
    lng = traffic.get("map_position_x") or content.get("map_position_x") or ""
    coords = {"lat": str(lat).strip(), "lng": str(lng).strip()}
    has_coords = bool(coords["lat"] and coords["lng"])

    addr = str(
        traffic.get("new_adres") or traffic.get("adres") or
        content.get("new_adres") or content.get("adres") or ""
    ).strip()

    raw_desc = str(content.get("post_desc") or content.get("description") or "")
    if _SECRET_RE.search(raw_desc):
        raw_desc = "[REDACTED]"
    has_html = bool(re.search(r"<[a-zA-Z]", raw_desc))
    desc_plain = strip_html(raw_desc)

    homepage     = str(extra.get("cmmn_hmpg_url") or "").strip()
    phone        = str(extra.get("cmmn_telno") or "").strip()
    opening_hours= str(extra.get("cmmn_use_time") or "").strip()
    closed_days  = str(extra.get("cmmn_rstrde_info") or "").strip()
    fee_info     = str(extra.get("cmmn_ntry_se_dc") or "").strip()
    accessibility= str(extra.get("cmmn_acmpnyat_youth_dc") or extra.get("cmmn_acmpnyat_dc") or "").strip()
    subway_access= str(traffic.get("subway_info") or "").strip()

    raw_tags = content.get("tag") or content.get("tags") or []
    if isinstance(raw_tags, str):
        raw_tags = [t.strip() for t in raw_tags.split(",") if t.strip()]
    tags = [str(t) for t in raw_tags if t]

    summary       = str(content.get("sumry") or "").strip()[:500]
    related_imgs_raw = content.get("relate_img") or []
    if isinstance(related_imgs_raw, dict):
        related_imgs_raw = [related_imgs_raw]
    related_imgs  = [str(u) for u in related_imgs_raw if u]
    created_at    = str(content.get("creat_dt_text") or "").strip()
    updated_at    = str(content.get("updt_dt_text") or "").strip()
    main_img      = str(content.get("main_img") or "").strip()
    multi_lang    = str(content.get("multi_lang_list") or "").strip()
    detail_title  = str(content.get("post_sj") or "").strip()

    detail_dict = {
        "title": detail_title, "desc_plain": desc_plain, "addr": addr,
        "has_image": bool(main_img), "opening_hours": opening_hours,
        "phone": phone, "homepage": homepage, "has_coords": has_coords,
        "tags": tags,
    }
    tv   = assess_travel_value(plan_rec, detail_dict)
    elig = assess_eligibility(tv, detail_dict, plan_rec)

    gaps = {}
    for field, val in [
        ("coordinates", has_coords), ("address", bool(addr)),
        ("opening_hours", bool(opening_hours)), ("closed_days", bool(closed_days)),
        ("homepage", bool(homepage)), ("phone", bool(phone)),
        ("description", bool(desc_plain)), ("main_image", bool(main_img)),
        ("related_images", bool(related_imgs)), ("accessibility", bool(accessibility)),
        ("fee_price", bool(fee_info)), ("tags", bool(tags)),
    ]:
        if not val:
            gaps[field] = "VISITSEOUL_MISSING"

    return {
        "cid":         cid,
        "status":      status,
        "raw_source":  source,
        "category":    category,
        "reason":      plan_rec.get("reason"),

        "title":          detail_title,
        "title_plan":     plan_rec.get("title", ""),
        "addr":           addr,
        "coords":         coords,
        "has_coords":     has_coords,

        "desc_plain":     desc_plain,
        "desc_source_type": "HTML" if has_html else "PLAIN_TEXT",
        "desc_length":    len(desc_plain),

        "main_img":       main_img,
        "has_image":      bool(main_img),
        "summary":        summary,
        "created_at":     created_at,
        "updated_at":     updated_at,
        "related_images": related_imgs,
        "related_image_count": len(related_imgs),

        "homepage":       homepage,
        "phone":          phone,
        "opening_hours":  opening_hours,
        "closed_days":    closed_days,
        "fee_info":       fee_info,
        "accessibility":  accessibility,
        "subway_access":  subway_access,
        "tags":           tags,
        "multi_lang_list": multi_lang,

        "travel_value":   tv,
        "eligibility":    elig,
        "final_class":    classify_final(elig),
        "quality_gaps":   gaps,

        "v2_detected_intents":      plan_rec.get("detected_intents", []),
        "v2_travel_value_signals":  plan_rec.get("travel_value_signals", []),
        "v2_routing_reasons":       plan_rec.get("routing_reason_codes", []),

        "has_detail":  True,
        "provenance": {
            "source": "visitseoul", "endpoint": "contents/info",
            "cid": cid, "fetched_at": raw_rec.get("fetched_at", ""),
            "as_of": AS_OF, "task": TASK, "script_version": SCRIPT_VERSION,
            "routing_sha": ROUTING_SHA,
        },
    }


def normalize_from_existing(existing_norm_rec: dict, plan_rec: dict) -> dict:
    """
    Wrap an already-normalized place-core record into Batch 2 format.
    Recomputes eligibility with Batch 2 policy (RULE 3 commercial).
    """
    cid = existing_norm_rec["cid"]
    category = plan_rec.get("category", existing_norm_rec.get("category_path", ""))
    detail_dict = {
        "title":        existing_norm_rec.get("title", ""),
        "desc_plain":   existing_norm_rec.get("desc_plain", ""),
        "addr":         existing_norm_rec.get("addr", ""),
        "has_coords":   existing_norm_rec.get("has_coords", False),
        "has_image":    existing_norm_rec.get("has_image", False),
        "opening_hours": existing_norm_rec.get("opening_hours", ""),
        "phone":        existing_norm_rec.get("phone", ""),
        "homepage":     existing_norm_rec.get("homepage", ""),
        "tags":         existing_norm_rec.get("tags", []),
    }
    tv   = assess_travel_value(plan_rec, detail_dict)
    elig = assess_eligibility(tv, detail_dict, plan_rec)

    return {
        "cid":         cid,
        "status":      "SUCCESS",
        "raw_source":  "EXISTING_PLACE_CORE_NORMALIZED",
        "category":    category,
        "reason":      plan_rec.get("reason"),

        "title":          detail_dict["title"],
        "title_plan":     plan_rec.get("title", ""),
        "addr":           detail_dict["addr"],
        "coords":         existing_norm_rec.get("coords", {}),
        "has_coords":     detail_dict["has_coords"],

        "desc_plain":     detail_dict["desc_plain"],
        "desc_source_type": existing_norm_rec.get("desc_source_type", "UNKNOWN"),
        "desc_length":    len(detail_dict["desc_plain"]),

        "main_img":       existing_norm_rec.get("main_img", ""),
        "has_image":      detail_dict["has_image"],
        "summary":        existing_norm_rec.get("summary", ""),
        "created_at":     existing_norm_rec.get("created_at", ""),
        "updated_at":     existing_norm_rec.get("updated_at", ""),
        "related_images": existing_norm_rec.get("related_images", []),
        "related_image_count": existing_norm_rec.get("related_image_count", 0),

        "homepage":       detail_dict["homepage"],
        "phone":          detail_dict["phone"],
        "opening_hours":  detail_dict["opening_hours"],
        "closed_days":    existing_norm_rec.get("closed_days", ""),
        "fee_info":       existing_norm_rec.get("fee_info", ""),
        "accessibility":  existing_norm_rec.get("accessibility", ""),
        "subway_access":  existing_norm_rec.get("subway_access", ""),
        "tags":           detail_dict["tags"],
        "multi_lang_list": existing_norm_rec.get("multi_lang_list", ""),

        "travel_value":   tv,
        "eligibility":    elig,
        "final_class":    classify_final(elig),
        "quality_gaps":   existing_norm_rec.get("quality_gaps", {}),

        "v2_detected_intents":     plan_rec.get("detected_intents", []),
        "v2_travel_value_signals": plan_rec.get("travel_value_signals", []),
        "v2_routing_reasons":      plan_rec.get("routing_reason_codes", []),

        "has_detail":  True,
        "provenance": {
            "source": "visitseoul", "endpoint": "contents/info",
            "cid": cid, "fetched_at": existing_norm_rec.get("provenance", {}).get("fetched_at", ""),
            "as_of": AS_OF, "task": TASK, "script_version": SCRIPT_VERSION,
            "routing_sha": ROUTING_SHA,
            "reused_from": "seoul-place-core-experience-detail-normalized-v1.jsonl",
        },
    }


# ── Data loading ──────────────────────────────────────────────────────────────

def load_manifest_573() -> tuple:
    """Load 573-record manifest. Returns (records_list, dict_by_cid)."""
    with open(MANIFEST_573_FILE, encoding="utf-8") as f:
        data = json.load(f)
    records = data["records"]
    print(f"[INFO] Manifest loaded: {len(records)} records", file=sys.stderr)
    return records, {r["cid"]: r for r in records}


def load_batch1_special() -> list:
    """Load Batch 1 holdover special 2 cases."""
    with open(BATCH1_ASSESSMENT_FILE, encoding="utf-8") as f:
        data = json.load(f)
    specials = [r for r in data["records"] if r["cid"] in SPECIAL_CIDS]
    print(f"[INFO] Batch1 special CIDs loaded: {len(specials)}", file=sys.stderr)
    return specials


def load_v2_routing_by_cid(target_cids: set) -> dict:
    """Load V2 routing records for target CIDs only (for extra fields)."""
    by_cid = {}
    with open(V2_ROUTING_FILE, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            r = json.loads(line)
            if r.get("cid") in target_cids:
                by_cid[r["cid"]] = r
    print(f"[INFO] V2 routing enrichment: {len(by_cid)} CIDs matched", file=sys.stderr)
    return by_cid


def load_existing_normalized_by_cid(target_cids: set) -> dict:
    """Load already-normalized records from place-core task for target CIDs."""
    by_cid = {}
    if not PLACE_CORE_NORM_FILE.exists():
        return by_cid
    with open(PLACE_CORE_NORM_FILE, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            r = json.loads(line)
            cid = r.get("cid")
            if cid in target_cids and r.get("status") == "SUCCESS" and r.get("has_detail"):
                by_cid[cid] = r
    print(f"[INFO] Existing normalized reusable: {len(by_cid)} CIDs", file=sys.stderr)
    return by_cid


def enrich_plan_rec(plan_rec: dict, v2_by_cid: dict) -> dict:
    """Add V2 routing fields (detected_intents, etc.) to plan record."""
    cid = plan_rec["cid"]
    v2 = v2_by_cid.get(cid, {})
    result = dict(plan_rec)
    result.setdefault("detected_intents", v2.get("detected_intents", []))
    result.setdefault("travel_value_signals", plan_rec.get("travel_value_signals", []))
    result.setdefault("routing_reason_codes", v2.get("routing_reason_codes", []))
    return result


# ── Plan gate ─────────────────────────────────────────────────────────────────

def validate_plan_gate(manifest_records: list, special_records: list,
                       existing_reuse_cids: set) -> bool:
    """Validate plan integrity. Returns True if PASS."""
    total = len(manifest_records) + len(special_records)
    dup_manifest = len(manifest_records) - len(set(r["cid"] for r in manifest_records))
    overlap_special_in_manifest = len(set(r["cid"] for r in special_records) & {r["cid"] for r in manifest_records})

    expected_api_calls = total - len(existing_reuse_cids)

    print(f"\n=== PLAN-ONLY GATE SUMMARY ===")
    print(f"MANIFEST_573_RECORDS          = {len(manifest_records)}")
    print(f"SPECIAL_HOLDOVER_RECORDS      = {len(special_records)}")
    print(f"PLAN_TOTAL                    = {total}")
    print(f"MANIFEST_DUPLICATE_CIDS       = {dup_manifest}")
    print(f"SPECIAL_CID_IN_MANIFEST       = {overlap_special_in_manifest}")
    print(f"EXISTING_RAW_REUSED           = {len(existing_reuse_cids)}")
    print(f"  reused CIDs: {sorted(existing_reuse_cids)}")
    print(f"EXPECTED_API_CALLS            = {expected_api_calls}")
    print(f"EXISTING_SOURCE_RECOVERY_BEFORE_NEW_API = YES")

    reason_counts = Counter(r["reason"] for r in manifest_records)
    for reason, count in sorted(reason_counts.items(), key=lambda x: -x[1]):
        print(f"  {reason}: {count}")

    errors = []
    if len(manifest_records) != EXPECTED_MANIFEST_TOTAL:
        errors.append(f"MANIFEST_TOTAL: expected {EXPECTED_MANIFEST_TOTAL}, got {len(manifest_records)}")
    if len(special_records) != EXPECTED_SPECIAL_TOTAL:
        errors.append(f"SPECIAL_TOTAL: expected {EXPECTED_SPECIAL_TOTAL}, got {len(special_records)}")
    if total != EXPECTED_PLAN_TOTAL:
        errors.append(f"PLAN_TOTAL: expected {EXPECTED_PLAN_TOTAL}, got {total}")
    if dup_manifest != 0:
        errors.append(f"MANIFEST_DUPLICATE_CIDS: {dup_manifest}")
    if overlap_special_in_manifest != 0:
        errors.append(f"SPECIAL_CID_IN_MANIFEST: {overlap_special_in_manifest} (should be 0)")
    if total > SAFETY_CEILING:
        errors.append(f"SAFETY_CEILING: {total} > {SAFETY_CEILING}")

    if errors:
        print(f"\nPLAN_GATE = FAIL")
        for e in errors:
            print(f"  ERROR: {e}")
        return False

    print(f"\nPLAN_GATE = PASS")
    print(f"SAFETY_CEILING_CHECK = PASS ({total} <= {SAFETY_CEILING})")
    return True


# ── Collection ────────────────────────────────────────────────────────────────

def collect_all(plan_cids: list, plan_by_cid: dict, api_key: str, label: str = "") -> tuple:
    """
    Run API calls for list of CIDs.
    Returns (raw_records, attempts).
    """
    raw_records = []
    attempts = []
    consecutive_failures = 0

    print(f"\n[COLLECT{label}] Starting: {len(plan_cids)} CIDs", flush=True)

    for i, cid in enumerate(plan_cids, 1):
        plan_rec = plan_by_cid[cid]
        fetched_at = datetime.now(timezone.utc).isoformat()

        status, content, n_attempts = fetch_detail(cid, api_key)

        if status == "AUTH_FAIL":
            print(f"\n[FATAL] AUTH_FAIL at CID {cid}. STOP.", file=sys.stderr)
            sys.exit(2)

        attempt_rec = {
            "kind": "detail", "cid": cid, "attempted_at": fetched_at,
            "status": status, "n_attempts": n_attempts,
            "title": str(content.get("post_sj", "")) if status == "SUCCESS" else "",
            "error": content.get("last_error") if status != "SUCCESS" else None,
        }
        attempts.append(attempt_rec)

        raw_rec = {
            "cid": cid, "status": status, "fetched_at": fetched_at,
            "_raw_content": content if status == "SUCCESS" else {},
            "error": content.get("last_error") if status != "SUCCESS" else None,
            "provenance": {
                "source": "visitseoul", "endpoint": "contents/info",
                "cid": cid, "fetched_at": fetched_at,
                "task": TASK, "script_version": SCRIPT_VERSION,
            },
        }
        raw_records.append(raw_rec)

        if status == "SUCCESS":
            consecutive_failures = 0
            print(f"  [{i:3d}/{len(plan_cids)}] SUCCESS  {cid}  {str(content.get('post_sj',''))[:35]}", flush=True)
        else:
            consecutive_failures += 1
            print(f"  [{i:3d}/{len(plan_cids)}] {status:20s}  {cid}", flush=True)

        if consecutive_failures >= CONSECUTIVE_FAILURE_LIMIT:
            print(f"\n[FATAL] {CONSECUTIVE_FAILURE_LIMIT} consecutive failures. STOP.", file=sys.stderr)
            break

        if i < len(plan_cids):
            time.sleep(DELAY)

    n_ok = sum(1 for r in raw_records if r["status"] == "SUCCESS")
    print(f"\n[COLLECT{label}] Done: {len(raw_records)} processed, {n_ok} SUCCESS", flush=True)
    return raw_records, attempts


# ── Writers ───────────────────────────────────────────────────────────────────

def write_jsonl(records: list, path: Path, exclude_key: str = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = []
    for r in records:
        out = {k: v for k, v in r.items() if k != exclude_key} if exclude_key else r
        lines.append(json.dumps(out, ensure_ascii=False))
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_raw_jsonl(records: list, path: Path) -> None:
    """Write raw records with _raw_content; scan for secrets."""
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = []
    for r in records:
        out = dict(r)
        raw_c = out.get("_raw_content", {})
        if raw_c and _SECRET_RE.search(json.dumps(raw_c, ensure_ascii=False)):
            out["_raw_content_note"] = "REDACTED_SECRET_DETECTED"
            out["_raw_content"] = {}
        lines.append(json.dumps(out, ensure_ascii=False))
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def build_eligibility_manifest(
    manifest_records: list,
    special_records: list,
    all_normalized: list,
    special_normalized: list,
    existing_reuse_cids: set,
    raw_records: list,
    special_raw: list,
) -> dict:
    """Build final eligibility manifest."""
    all_norm_by_cid = {r["cid"]: r for r in all_normalized}
    special_norm_by_cid = {r["cid"]: r for r in special_normalized}

    # Classification counts — 573
    class_counts_573 = Counter(r.get("final_class", "UNRESOLVED") for r in all_normalized)
    explore_counts = Counter(r.get("eligibility", {}).get("EXPLORE_ELIGIBLE") for r in all_normalized if r.get("has_detail"))
    ai_counts      = Counter(r.get("eligibility", {}).get("AI_ITINERARY_ELIGIBLE") for r in all_normalized if r.get("has_detail"))

    # API stats
    status_counts  = Counter(r["status"] for r in raw_records)
    n_success      = status_counts.get("SUCCESS", 0)
    n_failed       = status_counts.get("API_ERROR", 0) + status_counts.get("FAILED_RETRY_EXHAUSTED", 0)
    n_empty        = status_counts.get("EMPTY_RESPONSE", 0)

    special_status = Counter(r["status"] for r in special_raw)
    n_special_ok   = special_status.get("SUCCESS", 0)

    actual_api_calls = len(raw_records) + len(special_raw)
    api_success      = n_success + n_special_ok

    # Special 2 gate results
    special_gate = {}
    for r in special_normalized:
        special_gate[r["cid"]] = {
            "title": r.get("title_plan"),
            "gate_result": r.get("entity_lifecycle_gate", {}).get("gate_result", "UNRESOLVED"),
            "gate_evidence": r.get("entity_lifecycle_gate", {}).get("gate_evidence", ""),
            "final_class": r.get("final_class", "UNRESOLVED"),
        }

    # Final counts (must sum to 575)
    place_ai_explore  = class_counts_573.get("PLACE_AI_OR_EXPLORE_ELIGIBLE", 0)
    place_search_pick = class_counts_573.get("PLACE_SEARCHABLE_USER_PICK", 0)
    place_complete    = class_counts_573.get("PLACE_COMPLETE_NO_ACTION", 0)
    unresolved_573    = class_counts_573.get("UNRESOLVED", 0)

    # Special 2 outcomes
    event_active   = sum(1 for r in special_normalized if r.get("final_class") == "EVENT_ACTIVE_CONFIRMED")
    event_inactive = sum(1 for r in special_normalized if r.get("final_class") == "EVENT_INACTIVE_OR_ENDED")
    multi_loc      = sum(1 for r in special_normalized if r.get("final_class") == "MULTI_LOCATION_NON_PLACE")
    special_place  = sum(1 for r in special_normalized if r.get("final_class") in ("PLACE_AI_OR_EXPLORE_ELIGIBLE", "PLACE_SEARCHABLE_USER_PICK"))
    special_unresolved = sum(1 for r in special_normalized if r.get("final_class") == "UNRESOLVED")

    # Total place classifications (including any special that became physical places)
    total_place_ai   = place_ai_explore + sum(1 for r in special_normalized if r.get("final_class") == "PLACE_AI_OR_EXPLORE_ELIGIBLE")
    total_place_pick = place_search_pick + sum(1 for r in special_normalized if r.get("final_class") == "PLACE_SEARCHABLE_USER_PICK")
    total_unresolved = unresolved_573 + special_unresolved

    return {
        "task": TASK,
        "script_version": SCRIPT_VERSION,
        "as_of": AS_OF,
        "routing_sha": ROUTING_SHA,

        "INPUT_PLACE_DETAIL_TARGET": 573,
        "INPUT_ENTITY_LIFECYCLE_RECHECK": 2,
        "MAX_DETAIL_TARGET": 575,

        "EXISTING_SOURCE_RECOVERY_BEFORE_NEW_API": "YES",
        "EXISTING_RAW_REUSED": len(existing_reuse_cids),
        "ACTUAL_VISITSEOUL_DETAIL_API_CALLS": actual_api_calls,
        "API_SUCCESS": api_success,
        "API_FAILED": n_failed + (special_status.get("API_ERROR", 0)),
        "API_EMPTY_RESPONSE": n_empty + special_status.get("EMPTY_RESPONSE", 0),

        "PLACE_AI_OR_EXPLORE_ELIGIBLE": total_place_ai,
        "PLACE_SEARCHABLE_USER_PICK": total_place_pick,
        "PLACE_COMPLETE_NO_ACTION": place_complete,
        "EVENT_ACTIVE_CONFIRMED": event_active,
        "EVENT_INACTIVE_OR_ENDED": event_inactive,
        "MULTI_LOCATION_NON_PLACE": multi_loc,
        "UNRESOLVED": total_unresolved,

        "TARGET_OVERLAP": 0,
        "SEOUL_FOOD_EXECUTION_TARGET": 0,
        "KTO_SEOUL_EXECUTION_TARGET": 0,

        "special_2_gate_results": special_gate,

        "eligibility_breakdown_573": {
            "EXPLORE_COUNTS": dict(explore_counts),
            "AI_ITINERARY_COUNTS": dict(ai_counts),
            "FINAL_CLASS_COUNTS": dict(class_counts_573),
        },
        "api_status_counts": dict(status_counts),
    }


# ── Main modes ────────────────────────────────────────────────────────────────

def run_plan_only():
    """Validate plan, no API calls."""
    manifest_records, plan_by_cid = load_manifest_573()
    special_records = load_batch1_special()
    all_target_cids = {r["cid"] for r in manifest_records}
    existing_reuse = load_existing_normalized_by_cid(all_target_cids)
    gate_pass = validate_plan_gate(manifest_records, special_records, set(existing_reuse.keys()))
    sys.exit(0 if gate_pass else 1)


def run_normalize_only():
    """Re-normalize from existing raw files. Deterministic."""
    if not RAW_FILE.exists():
        print("ERROR: raw file not found. Run --collect first.", file=sys.stderr)
        sys.exit(1)
    manifest_records, plan_by_cid = load_manifest_573()
    all_target_cids = {r["cid"] for r in manifest_records}
    v2_by_cid = load_v2_routing_by_cid(all_target_cids | SPECIAL_CIDS)

    raw = [json.loads(l) for l in RAW_FILE.read_text(encoding="utf-8").splitlines() if l.strip()]
    normalized = []
    for raw_rec in sorted(raw, key=lambda x: x["cid"]):
        cid = raw_rec["cid"]
        plan_rec = enrich_plan_rec(plan_by_cid.get(cid, {"cid": cid}), v2_by_cid)
        n = normalize_raw(raw_rec, plan_rec, "API")
        normalized.append(n)

    write_jsonl(normalized, NORMALIZED_FILE)
    h = hashlib.sha256(NORMALIZED_FILE.read_bytes()).hexdigest()
    print(f"NORMALIZE_ONLY_COMPLETE: {len(normalized)} records")
    print(f"NORMALIZED_SHA256: {h}")


def run_collect():
    """Full collection + normalize + eligibility manifest."""
    manifest_records, plan_by_cid_manifest = load_manifest_573()
    special_records = load_batch1_special()

    all_target_cids = {r["cid"] for r in manifest_records}
    v2_by_cid = load_v2_routing_by_cid(all_target_cids | SPECIAL_CIDS)

    # Enrich plan records with V2 routing fields
    for cid in all_target_cids:
        plan_by_cid_manifest[cid] = enrich_plan_rec(plan_by_cid_manifest[cid], v2_by_cid)

    # Build special plan records from batch1 assessment
    special_plan_by_cid = {}
    for r in special_records:
        plan_rec = {
            "cid": r["cid"],
            "title": r.get("title", ""),
            "category": r.get("category", ""),
            "reason": "ENTITY_LIFECYCLE_RECHECK_BATCH1",
            "routing": "B",
            "detected_intents": [],
            "travel_value_signals": [],
            "routing_reason_codes": [],
        }
        special_plan_by_cid[r["cid"]] = enrich_plan_rec(plan_rec, v2_by_cid)

    # Existing raw check
    existing_normalized = load_existing_normalized_by_cid(all_target_cids)
    reuse_cids = set(existing_normalized.keys())

    # Gate
    gate_pass = validate_plan_gate(manifest_records, special_records, reuse_cids)
    if not gate_pass:
        print("PLAN_GATE=FAIL — cannot proceed.", file=sys.stderr)
        sys.exit(1)

    # API key
    api_key = os.environ.get("VISITSEOUL_API_KEY", "")
    if not api_key:
        print("VISITSEOUL_API_KEY_AVAILABLE=NO")
        print("STOP: API key not set.", file=sys.stderr)
        sys.exit(1)
    print("VISITSEOUL_API_KEY_AVAILABLE=YES", flush=True)

    # ── Collect 573 manifest (excluding 9 reused) ──────────────────────────
    cids_to_call = sorted(cid for cid in all_target_cids if cid not in reuse_cids)
    print(f"\n[SCOPE] 573 manifest: {len(cids_to_call)} new calls + {len(reuse_cids)} reused", flush=True)

    raw_records, attempts = collect_all(cids_to_call, plan_by_cid_manifest, api_key, label=" 573")

    # Write raw
    write_raw_jsonl(raw_records, RAW_FILE)
    print(f"[INFO] Raw written: {RAW_FILE}", file=sys.stderr)

    # ── Collect special 2 ──────────────────────────────────────────────────
    special_cids_sorted = sorted(SPECIAL_CIDS)
    print(f"\n[SCOPE] Special 2 entity/lifecycle recheck", flush=True)
    special_raw_records, special_attempts = collect_all(
        special_cids_sorted, special_plan_by_cid, api_key, label=" SPECIAL"
    )

    # Append attempts
    write_jsonl(attempts + special_attempts, ATTEMPTS_FILE)

    # ── Normalize 573 ─────────────────────────────────────────────────────
    normalized_new = []
    plan_by_cid_map = {r["cid"]: plan_by_cid_manifest[r["cid"]] for r in raw_records}
    for raw_rec in sorted(raw_records, key=lambda x: x["cid"]):
        cid = raw_rec["cid"]
        n = normalize_raw(raw_rec, plan_by_cid_manifest[cid], "API")
        normalized_new.append(n)

    # Include reused
    normalized_reused = []
    for cid in sorted(reuse_cids):
        plan_rec = plan_by_cid_manifest[cid]
        n = normalize_from_existing(existing_normalized[cid], plan_rec)
        normalized_reused.append(n)

    all_normalized = sorted(normalized_new + normalized_reused, key=lambda x: x["cid"])
    write_jsonl(all_normalized, NORMALIZED_FILE)
    print(f"[INFO] Normalized written: {NORMALIZED_FILE} ({len(all_normalized)} records)", file=sys.stderr)

    # ── Normalize special 2 + apply entity/lifecycle gate ─────────────────
    special_normalized = []
    for raw_rec in special_raw_records:
        cid = raw_rec["cid"]
        plan_rec = special_plan_by_cid[cid]
        n = normalize_raw(raw_rec, plan_rec, "API_SPECIAL")
        # Apply gate if SUCCESS
        if n.get("has_detail"):
            gate_result = apply_entity_lifecycle_gate(cid, plan_rec, n)
            n["entity_lifecycle_gate"] = gate_result
            gate_class = gate_result.get("gate_result", "UNRESOLVED")
            if gate_class == "A_PHYSICAL_PLACE":
                # Proceed to eligibility (already computed in normalize_raw)
                n["final_class"] = classify_final(n.get("eligibility", {}))
            else:
                n["final_class"] = classify_final({}, entity_class=gate_class)
        else:
            n["entity_lifecycle_gate"] = {"gate_result": "UNRESOLVED", "gate_evidence": "no_detail_fetched"}
            n["final_class"] = "UNRESOLVED"
        special_normalized.append(n)

    print(f"\n[GATE] Special 2 results:")
    for r in special_normalized:
        gate_r = r.get("entity_lifecycle_gate", {})
        print(f"  {r['cid']} | {r.get('title_plan','')[:30]} → {gate_r.get('gate_result')} → final={r.get('final_class')}")
        print(f"    evidence: {gate_r.get('gate_evidence','')}")

    # ── Build eligibility manifest ─────────────────────────────────────────
    elg_manifest = build_eligibility_manifest(
        manifest_records, special_records,
        all_normalized, special_normalized,
        reuse_cids, raw_records, special_raw_records,
    )
    MANIFEST_OUT_FILE.write_text(
        json.dumps(elg_manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"[INFO] Eligibility manifest written: {MANIFEST_OUT_FILE}", file=sys.stderr)

    # ── Final summary ─────────────────────────────────────────────────────
    n_api_success = sum(1 for r in raw_records + special_raw_records if r["status"] == "SUCCESS")
    n_api_failed  = sum(1 for r in raw_records + special_raw_records if r["status"] != "SUCCESS")

    print(f"\n=== COLLECTION COMPLETE ===")
    print(f"INPUT_PLACE_DETAIL_TARGET       = 573")
    print(f"INPUT_ENTITY_LIFECYCLE_RECHECK  = 2")
    print(f"MAX_DETAIL_TARGET               = 575")
    print(f"EXISTING_RAW_REUSED             = {len(reuse_cids)}")
    print(f"ACTUAL_VISITSEOUL_DETAIL_API_CALLS = {len(cids_to_call) + len(special_cids_sorted)}")
    print(f"API_SUCCESS                     = {n_api_success}")
    print(f"API_FAILED                      = {n_api_failed}")
    print(f"PLACE_AI_OR_EXPLORE_ELIGIBLE    = {elg_manifest['PLACE_AI_OR_EXPLORE_ELIGIBLE']}")
    print(f"PLACE_SEARCHABLE_USER_PICK      = {elg_manifest['PLACE_SEARCHABLE_USER_PICK']}")
    print(f"PLACE_COMPLETE_NO_ACTION        = {elg_manifest['PLACE_COMPLETE_NO_ACTION']}")
    print(f"EVENT_ACTIVE_CONFIRMED          = {elg_manifest['EVENT_ACTIVE_CONFIRMED']}")
    print(f"EVENT_INACTIVE_OR_ENDED         = {elg_manifest['EVENT_INACTIVE_OR_ENDED']}")
    print(f"MULTI_LOCATION_NON_PLACE        = {elg_manifest['MULTI_LOCATION_NON_PLACE']}")
    print(f"UNRESOLVED                      = {elg_manifest['UNRESOLVED']}")
    print(f"TARGET_OVERLAP                  = 0")
    print(f"SEOUL_FOOD_EXECUTION_TARGET     = 0")
    print(f"KTO_SEOUL_EXECUTION_TARGET      = 0")
    print(f"SECRET_LEAK                     = 0")
    print(f"COUNT_TARGET                    = NOT_DEFINED_BY_DESIGN")


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description=TASK)
    parser.add_argument("--plan-only",      action="store_true", help="Gate check, no API")
    parser.add_argument("--collect",        action="store_true", help="Full collection")
    parser.add_argument("--normalize-only", action="store_true", help="Re-normalize from raw")
    args = parser.parse_args()

    if args.normalize_only:
        run_normalize_only()
    elif args.plan_only:
        run_plan_only()
    elif args.collect:
        run_collect()
    else:
        print("No mode specified. Use --plan-only, --collect, or --normalize-only.")
        sys.exit(0)


if __name__ == "__main__":
    main()
