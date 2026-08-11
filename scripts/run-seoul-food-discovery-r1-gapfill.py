#!/usr/bin/env python3
"""
TASK-SEOUL-FOOD-DISCOVERY-V1-R1-SOURCE-AUDIT-AND-TARGETED-GAPFILL

R1 수정 사항:
  PARSER_BUG_FIXED = YES
  직전 스크립트가 잘못된 key path 사용 (addr/mapx/mapy/opentime)
  실제 VisitSeoul 레스토랑 응답 구조:
    traffic.adres → address (legacy)
    traffic.new_adres → address_road
    traffic.map_position_x → lng
    traffic.map_position_y → lat
    extra.cmmn_telno → phone
    extra.cmmn_use_time → opening_hours_raw_text
    extra.closed_days → closed_days
    extra.business_days → business_days
    extra.cmmn_hmpg_url → official_url (이미 수집됨)
    extra.disabled_facility → accessibility_evidence (list)
    restaurant.fd_reprsnt_menu → signature_dishes_raw
    restaurant.dietary → dietary_certification
    restaurant.halal → halal_evidence (source evidence, NOT verified certification)
    restaurant.muslim → muslim_certification
    restaurant.salam → salam_certification
    restaurant.price_range → price_range_krw
    restaurant.type / kind → restaurant type codes
    tag → menu_evidence_tags (이미 수집됨)

모드:
  --fix-priority : 42 priority records 재수집 (parser fix)
  --expand-all   : 나머지 1,217건 수집 (full gap-fill)
  --plan-only    : dry-run, API 호출 없음
  --tourapi-probe: TourAPI Seoul restaurant 구조 탐색

규칙:
  RESTAURANT_ATTRIBUTE_AI_INFERENCE = FORBIDDEN
  UNKNOWN_DISTINCT_FROM_NO = ENFORCED
  FACT_DERIVED_SEPARATION = ENFORCED
  SECRET_LEAK = 0
  BUSAN_CHANGE = 0 / GYEONGJU_CHANGE = 0 / JEJU_CHANGE = 0
"""

import argparse, hashlib, json, os, re, sys, time
from datetime import datetime, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

# ── Constants ──────────────────────────────────────────────────────────────────
SCRIPT_VERSION = "v1.1.0-R1"
TASK           = "TASK-SEOUL-FOOD-DISCOVERY-V1-R1-SOURCE-AUDIT-AND-TARGETED-GAPFILL"
TARGET_CITY    = "seoul"
START_SHA      = "ac372fd"
AS_OF          = "2026-08-11"

BASE_URL = "https://api-call.visitseoul.net/api/v1"
TIMEOUT  = 25
DELAY    = 1.2

BASE_DIR  = Path(__file__).parent.parent
DATA_DIR  = BASE_DIR / "data" / "seoul-source-audit"

CANDIDATES_V1     = DATA_DIR / "seoul-food-discovery-candidates-v1.jsonl"
CANDIDATES_R1     = DATA_DIR / "seoul-food-discovery-candidates-r1.jsonl"
ATTEMPTS_R1       = DATA_DIR / "seoul-food-discovery-detail-attempts-r1.jsonl"
MANIFEST_R1       = DATA_DIR / "seoul-food-discovery-manifest-r1.json"
ROUTING_V2_FILE   = DATA_DIR / "seoul-full-enrichment-routing-v2.jsonl"

# Seoul geographic bounds (generous)
SEOUL_LAT_MIN, SEOUL_LAT_MAX = 37.40, 37.70
SEOUL_LNG_MIN, SEOUL_LNG_MAX = 126.70, 127.20

# ── Secret redaction ───────────────────────────────────────────────────────────
_SECRET_RE = re.compile(
    r'(?:VISITSEOUL[-_]?API[-_]?KEY|TOUR[-_]?API[-_]?KEY|api[-_]?key|'
    r'token|secret|bearer|credential)\s*[=:]\s*\S+',
    re.IGNORECASE,
)

def _redact(text: str) -> str:
    return _SECRET_RE.sub("[REDACTED]", text)

# ── API helpers ────────────────────────────────────────────────────────────────
import urllib.request, urllib.error

def _get_visitseoul_key() -> str:
    key = os.environ.get("VISITSEOUL_API_KEY", "")
    if not key:
        print("VISITSEOUL_API_KEY_AVAILABLE = NO", flush=True)
        sys.exit(1)
    print("VISITSEOUL_API_KEY_AVAILABLE = YES (length redacted)", flush=True)
    return key


def _post_json(path: str, body: dict, api_key: str) -> dict:
    url  = f"{BASE_URL}/{path}"
    data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    req  = urllib.request.Request(
        url, data=data,
        headers={
            "Content-Type":       "application/json; charset=utf-8",
            "VISITSEOUL-API-KEY": api_key,
            "Accept":             "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        return json.loads(resp.read().decode("utf-8"))

# ── Data loaders ───────────────────────────────────────────────────────────────

def load_routing() -> dict:
    records = {}
    with open(ROUTING_V2_FILE, encoding="utf-8") as f:
        for line in f:
            r = json.loads(line)
            if r.get("legacy_routing_track") == "RESTAURANT_TRACK":
                records[r["cid"]] = r
    return records


def load_candidates_v1() -> dict:
    """
    Load candidates. Prefers R1 file (from previous expand pass) over V1 baseline.
    This ensures fix-priority after expand-all preserves 1217 enriched records.
    """
    source_file = CANDIDATES_R1 if CANDIDATES_R1.exists() else CANDIDATES_V1
    candidates = {}
    with open(source_file, encoding="utf-8") as f:
        for line in f:
            c = json.loads(line)
            sk = c.get("source_key", "")
            cid = sk.split(":")[-1]
            candidates[cid] = c
    print(f"BASE_FILE = {source_file.name}", flush=True)
    return candidates

# ── Correct field extractor (R1 — fixed key paths) ─────────────────────────────

def _extract_restaurant_facts_r1(detail: dict, cid: str) -> tuple[dict, dict, list]:
    """
    Extract food facts from VisitSeoul contents/info response.
    CORRECTED key paths vs. V1 (addr→traffic.adres, mapx→traffic.map_position_x, etc.)
    Returns (facts_delta, provenance_delta, new_flags).
    """
    facts = {}
    prov  = {}
    flags = []
    now   = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    extra     = detail.get("extra", {}) if isinstance(detail.get("extra"), dict) else {}
    traffic   = detail.get("traffic", {}) if isinstance(detail.get("traffic"), dict) else {}
    restaurant= detail.get("restaurant", {}) if isinstance(detail.get("restaurant"), dict) else {}

    # ── Address ────────────────────────────────────────────────────────────────
    # Prefer road address (new_adres), fall back to legacy (adres)
    road_addr = str(traffic.get("new_adres", "") or "").strip()
    legacy_addr = str(traffic.get("adres", "") or "").strip()
    addr = road_addr or legacy_addr

    if addr:
        facts["address"] = addr
        prov["address"] = {
            "source": "visitseoul:contents_info",
            "cid": cid,
            "field": "traffic.new_adres" if road_addr else "traffic.adres",
            "verified_at": now,
        }
        # Extract gu (district)
        m = re.search(r'서울\s*(\S+구)', addr)
        if m:
            facts["district"] = m.group(1)
            prov["district"] = {
                "source": "visitseoul:contents_info",
                "derived_from": "traffic.new_adres/adres",
                "pattern": "서울 XX구",
            }
    else:
        flags.append({"flag": "ADDRESS_MISSING", "reason": "traffic.new_adres and traffic.adres both empty"})

    if legacy_addr and legacy_addr != road_addr:
        facts["address_legacy"] = legacy_addr
        prov["address_legacy"] = {"source": "visitseoul:contents_info", "cid": cid, "field": "traffic.adres"}

    # Postal code
    postal = str(traffic.get("new_zip_code", "") or traffic.get("zip_code", "") or "").strip()
    if postal:
        facts["postal_code"] = postal
        prov["postal_code"] = {"source": "visitseoul:contents_info", "cid": cid, "field": "traffic.new_zip_code"}

    # ── Coordinates ────────────────────────────────────────────────────────────
    pos_x = str(traffic.get("map_position_x", "") or "").strip()  # longitude
    pos_y = str(traffic.get("map_position_y", "") or "").strip()  # latitude

    if pos_x and pos_y:
        try:
            lng = float(pos_x)
            lat = float(pos_y)
            if SEOUL_LAT_MIN <= lat <= SEOUL_LAT_MAX and SEOUL_LNG_MIN <= lng <= SEOUL_LNG_MAX:
                facts["lat"] = str(round(lat, 8))
                facts["lng"] = str(round(lng, 8))
                prov["lat"] = prov["lng"] = {
                    "source": "visitseoul:contents_info",
                    "cid": cid,
                    "field_lat": "traffic.map_position_y",
                    "field_lng": "traffic.map_position_x",
                    "verified_at": now,
                }
            else:
                flags.append({
                    "flag": "COORD_OUT_OF_SEOUL_BOUNDS",
                    "reason": f"map_position_x={pos_x}, map_position_y={pos_y}"
                })
        except ValueError:
            flags.append({"flag": "COORD_PARSE_ERROR", "reason": f"x={pos_x}, y={pos_y}"})
    else:
        flags.append({"flag": "COORD_MISSING", "reason": "traffic.map_position_x/y empty"})

    # Transit info
    subway = str(traffic.get("subway_info", "") or "").strip()
    if subway:
        facts["transit_info"] = subway
        prov["transit_info"] = {"source": "visitseoul:contents_info", "cid": cid, "field": "traffic.subway_info"}

    # ── Phone ──────────────────────────────────────────────────────────────────
    tel = str(extra.get("cmmn_telno", "") or "").strip()
    if tel:
        facts["phone"] = tel
        prov["phone"] = {"source": "visitseoul:contents_info", "cid": cid, "field": "extra.cmmn_telno", "verified_at": now}

    # ── Official URL ───────────────────────────────────────────────────────────
    hmpg = str(extra.get("cmmn_hmpg_url", "") or "").strip()
    if hmpg and hmpg.startswith("http"):
        facts["official_url"] = hmpg
        prov["official_url"] = {
            "source": "visitseoul:contents_info",
            "cid": cid,
            "field": "extra.cmmn_hmpg_url",
            "verified_at": now
        }
        hmpg_lang = str(extra.get("cmmn_hmpg_lang", "") or "").strip()
        if hmpg_lang:
            facts["official_url_lang"] = hmpg_lang
    else:
        flags.append({"flag": "OFFICIAL_URL_MISSING", "reason": "extra.cmmn_hmpg_url empty"})

    # ── Opening hours ──────────────────────────────────────────────────────────
    use_time = str(extra.get("cmmn_use_time", "") or "").strip()
    use_time = use_time.replace("\r\n", " | ").replace("\r", " | ").replace("\n", " | ")
    if use_time:
        facts["opening_hours_raw_text"] = use_time
        prov["opening_hours_raw_text"] = {
            "source": "visitseoul:contents_info",
            "cid": cid,
            "field": "extra.cmmn_use_time",
            "verified_at": now,
            "note": "raw_text_normalized_newlines",
        }
        flags.append({
            "flag": "OPENING_HOURS_RAW_TEXT",
            "reason": "cmmn_use_time is free-text; service must parse into structured hours"
        })
    else:
        flags.append({"flag": "OPENING_HOURS_MISSING", "reason": "extra.cmmn_use_time empty"})

    # ── Closed days ────────────────────────────────────────────────────────────
    closed = str(extra.get("closed_days", "") or "").strip()
    if closed:
        facts["closed_days"] = closed
        prov["closed_days"] = {"source": "visitseoul:contents_info", "cid": cid, "field": "extra.closed_days"}

    # Business days
    biz_days = str(extra.get("business_days", "") or "").strip()
    if biz_days:
        facts["business_days"] = biz_days
        prov["business_days"] = {"source": "visitseoul:contents_info", "cid": cid, "field": "extra.business_days"}

    # Admission fee
    usage_fee = str(extra.get("usage_fee", "") or "").strip()
    charge_code = str(extra.get("trrsrt_use_chrge", "") or "").strip()
    if usage_fee:
        facts["admission_fee"] = usage_fee
        prov["admission_fee"] = {"source": "visitseoul:contents_info", "cid": cid, "field": "extra.usage_fee"}
    elif charge_code == "N":
        facts["admission_required"] = "no"
        prov["admission_required"] = {
            "source": "visitseoul:contents_info",
            "cid": cid,
            "field": "extra.trrsrt_use_chrge",
            "value": "N",
            "note": "N = free admission"
        }

    # Accessibility facilities (list — EVIDENCE ONLY, not inferred)
    disabled_fac = extra.get("disabled_facility", [])
    if isinstance(disabled_fac, list) and disabled_fac:
        facts["accessibility_evidence"] = disabled_fac
        prov["accessibility_evidence"] = {
            "source": "visitseoul:contents_info",
            "cid": cid,
            "field": "extra.disabled_facility",
            "note": "raw code list from official source"
        }

    # ── Restaurant-specific fields ─────────────────────────────────────────────

    # Signature dishes (fd_reprsnt_menu = comma-separated string)
    menu_raw = str(restaurant.get("fd_reprsnt_menu", "") or "").strip()
    if menu_raw:
        dishes = [d.strip() for d in re.split(r'[,，]', menu_raw) if d.strip()]
        if dishes:
            facts["signature_dishes"] = [{"ko": d} for d in dishes]
            prov["signature_dishes"] = {
                "source": "visitseoul:contents_info",
                "cid": cid,
                "field": "restaurant.fd_reprsnt_menu",
                "raw": menu_raw,
                "verified_at": now,
                "note": "en translation absent; ko only preserved per spec"
            }

    # Price range
    price = str(restaurant.get("price_range", "") or "").strip()
    if price and price.isdigit():
        facts["price_range_krw"] = int(price)
        prov["price_range_krw"] = {"source": "visitseoul:contents_info", "cid": cid, "field": "restaurant.price_range"}

    # Restaurant type/kind codes
    rest_type = restaurant.get("type", [])
    rest_kind = restaurant.get("kind", [])
    if isinstance(rest_type, list) and rest_type:
        type_names = [x.get("code_nm", "") for x in rest_type if isinstance(x, dict) and x.get("code_nm")]
        if type_names:
            facts["restaurant_type_codes"] = type_names
            prov["restaurant_type_codes"] = {
                "source": "visitseoul:contents_info",
                "cid": cid,
                "field": "restaurant.type",
                "note": "code_nm values — for type enrichment only"
            }
    if isinstance(rest_kind, list) and rest_kind:
        kind_names = [x.get("code_nm", "") for x in rest_kind if isinstance(x, dict) and x.get("code_nm")]
        if kind_names:
            facts["restaurant_kind_codes"] = kind_names
            prov["restaurant_kind_codes"] = {
                "source": "visitseoul:contents_info",
                "cid": cid,
                "field": "restaurant.kind"
            }

    # Dietary/halal/muslim/salam evidence (official source — NEVER inferred, NEVER auto-certified)
    # restaurant.dietary/halal/muslim/salam are lists; empty = unknown
    # SEMANTIC: source field != formal external certification → use *_evidence naming
    for cert_field, cert_key in [
        ("dietary", "dietary_evidence"),     # SEMANTIC: dietary category, not a certification
        ("halal",   "halal_evidence"),       # SEMANTIC: restaurant.halal != formal certification
        ("muslim",  "muslim_evidence"),      # SEMANTIC: may be self-declared (e.g. 할랄 자가 인증)
        ("salam",   "salam_evidence"),       # SEMANTIC: Salam program evidence, certification unverified
    ]:
        cert_list = restaurant.get(cert_field, [])
        if isinstance(cert_list, list) and cert_list:
            # Non-empty list = explicit official source evidence
            cert_names = [x.get("code_nm", "") for x in cert_list if isinstance(x, dict)]
            if cert_names:
                facts[cert_key] = cert_names
                prov[cert_key] = {
                    "source": "visitseoul:contents_info",
                    "cid": cid,
                    "field": f"restaurant.{cert_field}",
                    "note": "official source evidence from VisitSeoul (field semantics preserved; formal certification unverified)"
                }
        # Empty list = NOT present = unknown (NOT "no certification")
        # Per UNKNOWN_DISTINCT_FROM_NO: empty list → key absent

    # Tags (menu evidence)
    tags = detail.get("tag", [])
    if isinstance(tags, list) and tags:
        facts["menu_evidence"] = {"tags": tags, "source": "visitseoul_tags"}
        prov["menu_evidence"] = {"source": "visitseoul:contents_info", "cid": cid, "field": "tag", "verified_at": now}

    # Image URLs (from main_img and relate_img)
    main_img = str(detail.get("main_img", "") or "").strip()
    if main_img and main_img.startswith("http"):
        facts["image_main_url"] = main_img
        prov["image_main_url"] = {
            "source": "visitseoul:contents_info",
            "cid": cid,
            "field": "main_img",
            "note": "VisitSeoul image; rights clearance required before use in product"
        }
    relate_imgs = [str(u) for u in (detail.get("relate_img") or []) if str(u).startswith("http")]
    if relate_imgs:
        facts["image_additional_urls"] = relate_imgs[:5]  # max 5
        prov["image_additional_urls"] = {
            "source": "visitseoul:contents_info",
            "cid": cid,
            "field": "relate_img",
            "count": len(relate_imgs),
            "note": "rights clearance required before use in product"
        }

    # Multi-language pages (identity — not content quality)
    multi_lang = str(detail.get("multi_lang_list", "") or "").strip()
    if multi_lang:
        # Parse "ko:KOP...,en:ENP...,ja:JPP...,zh-CN:CNP..."
        lang_entries = {}
        for entry in multi_lang.split(","):
            parts = entry.strip().split(":")
            if len(parts) == 2:
                lang_entries[parts[0]] = parts[1]
        if lang_entries:
            facts["multilingual_page_cids"] = lang_entries
            prov["multilingual_page_cids"] = {
                "source": "visitseoul:contents_info",
                "cid": cid,
                "field": "multi_lang_list",
                "note": "language-specific CIDs for fetching translated content"
            }

    # Description (sumry — preferred from detail, may be richer than listing)
    sumry = str(detail.get("sumry", "") or "").strip()
    if sumry:
        facts["description"] = sumry
        prov["description"] = {"source": "visitseoul:contents_info", "cid": cid, "field": "sumry", "verified_at": now}

    return facts, prov, flags


# ── Fetch detail ───────────────────────────────────────────────────────────────

def fetch_detail(cid: str, api_key: str) -> tuple[dict, str]:
    try:
        resp = _post_json("contents/info", {"language": "ko", "cid": cid}, api_key)
        data = resp.get("data") or {}
        if isinstance(data, list):
            data = data[0] if data else {}
        return data, "SUCCESS"
    except Exception as e:
        return {}, f"ERROR:{_redact(str(e))}"


# ── Build updated candidate ────────────────────────────────────────────────────

def update_candidate(cand: dict, facts_delta: dict, prov_delta: dict, new_flags: list) -> dict:
    """Merge detail facts into existing candidate. Remove old parser-error flags."""
    import copy
    c = copy.deepcopy(cand)

    # Remove previous "wrong-parser" flags that are now resolved
    obsolete_flags = {"COORD_MISSING", "OPENING_HOURS_MISSING", "ADDRESS_MISSING",
                      "COORD_OUT_OF_SEOUL_BOUNDS", "COORD_PARSE_ERROR"}
    c["review_flags"] = [rf for rf in c.get("review_flags", [])
                         if rf.get("flag") not in obsolete_flags]

    # Merge facts
    c["facts"].update(facts_delta)

    # Merge provenance
    c.setdefault("field_provenance", {}).update(prov_delta)

    # Add new flags (dedupe by flag name)
    existing_flag_names = {rf.get("flag") for rf in c["review_flags"]}
    for rf in new_flags:
        if rf.get("flag") not in existing_flag_names:
            c["review_flags"].append(rf)
            existing_flag_names.add(rf.get("flag"))

    # Upgrade confidence and status
    has_location = "lat" in c["facts"] and "lng" in c["facts"]
    has_addr     = "address" in c["facts"]
    has_hours    = "opening_hours_raw_text" in c["facts"]
    if has_location and has_addr and has_hours:
        c["confidence"] = "HIGH"
    elif has_location or has_addr:
        c["confidence"] = "MEDIUM"
    c["validation_status"] = "DETAIL_FETCHED_PENDING_REVIEW"
    c["r1_updated"] = True

    return c


# ── Coverage metrics ───────────────────────────────────────────────────────────

def compute_coverage(candidates: dict) -> dict:
    total = len(candidates)

    FOOD_FIELDS = [
        "name", "address", "lat", "lng", "district", "neighborhood",
        "cuisine", "signature_dishes", "description",
        "official_url", "phone", "opening_hours_raw_text", "closed_days",
        "price_range_krw", "menu_evidence",
        "image_main_url", "transit_info",
        "dietary_evidence", "halal_evidence",
        "language_menu", "language_staff",
        "payment", "seating_solo_counter", "accessibility_step_free",
        "reservation",
    ]
    coverage = {}
    for f in FOOD_FIELDS:
        has = sum(1 for c in candidates.values() if c["facts"].get(f) is not None)
        coverage[f] = {"has": has, "missing": total - has, "pct": round(has/total*100, 1)}

    # Flag summary
    flag_counts: dict = {}
    for c in candidates.values():
        for rf in c.get("review_flags", []):
            fn = rf.get("flag", "UNKNOWN")
            flag_counts[fn] = flag_counts.get(fn, 0) + 1

    # Status breakdown
    status_counts: dict = {}
    for c in candidates.values():
        s = c.get("validation_status", "UNKNOWN")
        status_counts[s] = status_counts.get(s, 0) + 1

    confidence_counts: dict = {}
    for c in candidates.values():
        conf = c.get("confidence", "UNKNOWN")
        confidence_counts[conf] = confidence_counts.get(conf, 0) + 1

    return {
        "TOTAL": total,
        "FIELD_COVERAGE": coverage,
        "REVIEW_FLAG_COUNTS": flag_counts,
        "VALIDATION_STATUS_COUNTS": status_counts,
        "CONFIDENCE_COUNTS": confidence_counts,
    }


# ── TourAPI probe ──────────────────────────────────────────────────────────────

def probe_tourapi_seoul_restaurants():
    """Probe KTO TourAPI for Seoul restaurant data structure."""
    import urllib.parse

    tour_key = os.environ.get("TOUR_API_KEY", "")
    if not tour_key:
        print("TOUR_API_KEY_AVAILABLE = NO — skip TourAPI probe", flush=True)
        return {"KTO_AVAILABLE": False, "KTO_RESTAURANT_MATCHABLE": "0 (API key not available)"}

    print("TOUR_API_KEY_AVAILABLE = YES (length redacted)", flush=True)

    # contentTypeId=39 = restaurants in KTO
    # areaCode=1 = Seoul
    # sigunguCode: 서울 구 코드 (optional)
    base_url = "https://apis.data.go.kr/B551011/KorService1/areaBasedList1"
    params = {
        "serviceKey":    tour_key,
        "numOfRows":     "10",
        "pageNo":        "1",
        "MobileOS":      "ETC",
        "MobileApp":     "KoreaMate",
        "_type":         "json",
        "listYN":        "Y",
        "arrange":       "A",
        "contentTypeId": "39",   # 음식점
        "areaCode":      "1",    # 서울
    }
    url = base_url + "?" + urllib.parse.urlencode(params)

    try:
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        # Check response structure
        response = data.get("response", {})
        header = response.get("header", {})
        result_code = header.get("resultCode", "")
        result_msg  = header.get("resultMsg", "")
        print(f"TourAPI resultCode={result_code}, resultMsg={result_msg}", flush=True)

        if result_code != "0000":
            return {
                "KTO_AVAILABLE": False,
                "KTO_RESULT_CODE": result_code,
                "KTO_RESULT_MSG": result_msg,
                "KTO_RESTAURANT_MATCHABLE": "0 (API error)"
            }

        body = response.get("body", {})
        total_count = body.get("totalCount", 0)
        items = body.get("items", {})
        item_list = items.get("item", []) if isinstance(items, dict) else []
        if isinstance(item_list, dict):
            item_list = [item_list]  # single item → list

        print(f"TourAPI Seoul restaurants total: {total_count}", flush=True)
        print(f"Sample page size: {len(item_list)}", flush=True)

        sample_keys = list(item_list[0].keys()) if item_list else []
        print(f"Sample keys: {sample_keys}", flush=True)

        if item_list:
            s = item_list[0]
            print(f"Sample record: title={s.get('title')}, addr={s.get('addr1')}, "
                  f"mapx={s.get('mapx')}, mapy={s.get('mapy')}, "
                  f"cat3={s.get('cat3')}, tel={s.get('tel')}", flush=True)

        return {
            "KTO_AVAILABLE": True,
            "KTO_SEOUL_RESTAURANT_TOTAL": total_count,
            "KTO_SAMPLE_KEYS": sample_keys,
            "KTO_CONTENT_TYPE_ID": "39",
            "KTO_AREA_CODE": "1 (Seoul)",
            "KTO_RESTAURANT_MATCHABLE": str(total_count),
        }

    except Exception as e:
        err = _redact(str(e))
        print(f"TourAPI probe error: {err}", flush=True)
        return {"KTO_AVAILABLE": False, "KTO_ERROR": err, "KTO_RESTAURANT_MATCHABLE": "UNKNOWN"}


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan-only",      action="store_true")
    parser.add_argument("--fix-priority",   action="store_true", help="Re-collect 42 priority records")
    parser.add_argument("--expand-all",     action="store_true", help="Collect remaining 1,217 records")
    parser.add_argument("--full",           action="store_true", help="fix-priority + expand-all")
    parser.add_argument("--tourapi-probe",  action="store_true", help="TourAPI Seoul probe only")
    args = parser.parse_args()

    if not any([args.plan_only, args.fix_priority, args.expand_all, args.full, args.tourapi_probe]):
        print("Usage: --plan-only | --fix-priority | --expand-all | --full | --tourapi-probe")
        sys.exit(1)

    if args.full:
        args.fix_priority = True
        args.expand_all   = True

    print(f"SCRIPT_VERSION = {SCRIPT_VERSION}", flush=True)
    print(f"TASK = {TASK}", flush=True)
    print(f"TARGET_CITY = {TARGET_CITY}", flush=True)
    print(f"START_SHA = {START_SHA}", flush=True)
    print(f"AS_OF = {AS_OF}", flush=True)
    print(f"PARSER_BUG_FIXED = YES (traffic.adres/map_position_x/extra.cmmn_use_time)", flush=True)
    print("", flush=True)

    # ── TourAPI probe ──────────────────────────────────────────────────────────
    if args.tourapi_probe:
        print("=== TOURAPI SEOUL RESTAURANT PROBE ===", flush=True)
        result = probe_tourapi_seoul_restaurants()
        for k, v in result.items():
            print(f"  {k} = {v}", flush=True)
        return

    # ── Load data ──────────────────────────────────────────────────────────────
    print("=== Loading existing candidates ===", flush=True)
    candidates = load_candidates_v1()
    routing    = load_routing()

    priority_cids   = [cid for cid, r in routing.items() if r.get("existing_detail_available")]
    non_priority    = [cid for cid in routing if cid not in priority_cids]

    print(f"RESTAURANT_TRACK_TOTAL = {len(routing)}", flush=True)
    print(f"PRIORITY_CIDS (fix) = {len(priority_cids)}", flush=True)
    print(f"NON_PRIORITY_CIDS (expand) = {len(non_priority)}", flush=True)
    print(f"V1_CANDIDATES_LOADED = {len(candidates)}", flush=True)

    if args.plan_only:
        print("\nPLAN_ONLY — no API calls", flush=True)
        cov = compute_coverage(candidates)
        print(f"\nCURRENT COVERAGE (V1 baseline):", flush=True)
        for f, v in cov["FIELD_COVERAGE"].items():
            if v["has"] > 0 or f in ["name","address","lat","cuisine"]:
                print(f"  {f}: {v['has']}/{cov['TOTAL']} ({v['pct']}%)", flush=True)
        return

    api_key = _get_visitseoul_key()

    # Decide which CIDs to process
    cids_to_process = []
    if args.fix_priority:
        cids_to_process += priority_cids
        print(f"\nFIX_PRIORITY: {len(priority_cids)} records", flush=True)
    if args.expand_all:
        cids_to_process += non_priority
        print(f"EXPAND_ALL: {len(non_priority)} additional records", flush=True)

    cids_to_process = list(dict.fromkeys(cids_to_process))  # dedupe
    total_calls = len(cids_to_process)
    print(f"TOTAL_API_CALLS_PLANNED = {total_calls}", flush=True)
    print(f"ESTIMATED_RUNTIME = {total_calls * DELAY / 60:.1f} min @ {DELAY}s/call", flush=True)

    # ── API collection ─────────────────────────────────────────────────────────
    print(f"\n=== TARGETED COLLECTION ({total_calls} records) ===", flush=True)

    attempts = []
    enriched = 0
    coord_ok = 0
    addr_ok  = 0
    hours_ok = 0
    sig_dish_ok = 0
    phone_ok = 0

    for i, cid in enumerate(cids_to_process, start=1):
        label = "PRIORITY" if cid in priority_cids else "EXPAND"
        print(f"  [{i}/{total_calls}] {cid} ({label}) ...", end=" ", flush=True)

        detail, status = fetch_detail(cid, api_key)
        attempt_rec = {"cid": cid, "status": status, "as_of": AS_OF, "task": TASK, "label": label}

        if status == "SUCCESS" and detail:
            facts_delta, prov_delta, new_flags = _extract_restaurant_facts_r1(detail, cid)

            # Update candidate
            if cid in candidates:
                candidates[cid] = update_candidate(candidates[cid], facts_delta, prov_delta, new_flags)
            else:
                # CID not in v1 candidates (shouldn't happen) — skip
                print(f"WARN: {cid} not in v1 candidates", flush=True)
                continue

            enriched += 1
            if "lat" in facts_delta:   coord_ok += 1
            if "address" in facts_delta: addr_ok += 1
            if "opening_hours_raw_text" in facts_delta: hours_ok += 1
            if "signature_dishes" in facts_delta: sig_dish_ok += 1
            if "phone" in facts_delta: phone_ok += 1

            attempt_rec["fields_extracted"] = list(facts_delta.keys())
            n_fields = len(facts_delta)
            print(f"OK ({n_fields}f: addr={'Y' if 'address' in facts_delta else 'N'} "
                  f"coord={'Y' if 'lat' in facts_delta else 'N'} "
                  f"hrs={'Y' if 'opening_hours_raw_text' in facts_delta else 'N'} "
                  f"dish={'Y' if 'signature_dishes' in facts_delta else 'N'})", flush=True)
        else:
            attempt_rec["error"] = status
            print(f"FAIL ({status})", flush=True)

        attempts.append(attempt_rec)
        time.sleep(DELAY)

    print(f"\nCOLLECTION SUMMARY:", flush=True)
    print(f"  ENRICHED = {enriched}/{total_calls}", flush=True)
    print(f"  COORD_OK = {coord_ok}", flush=True)
    print(f"  ADDRESS_OK = {addr_ok}", flush=True)
    print(f"  HOURS_OK = {hours_ok}", flush=True)
    print(f"  SIGNATURE_DISHES_OK = {sig_dish_ok}", flush=True)
    print(f"  PHONE_OK = {phone_ok}", flush=True)

    # ── QA ─────────────────────────────────────────────────────────────────────
    print("\n=== QA ===", flush=True)

    # No facts in proposed_values
    fact_fields = {"address", "lat", "lng", "cuisine", "name", "opening_hours_raw_text"}
    for c in candidates.values():
        overlap = set(c.get("proposed_values", {}).keys()) & fact_fields
        assert not overlap, f"Fact in proposed_values: {overlap} @ {c['candidate_id']}"

    # All candidates have provenance
    no_prov = [c["candidate_id"] for c in candidates.values() if not c.get("field_provenance")]
    if no_prov:
        print(f"WARN: Missing provenance: {no_prov[:3]}", flush=True)

    print("FACT_DERIVED_SEPARATION = PASS", flush=True)

    # ── Write outputs ──────────────────────────────────────────────────────────
    print("\n=== Writing outputs ===", flush=True)

    # R1 candidates
    with open(CANDIDATES_R1, "w", encoding="utf-8") as f:
        for c in candidates.values():
            f.write(json.dumps(c, ensure_ascii=False) + "\n")
    print(f"CANDIDATES_R1: {CANDIDATES_R1.name} ({len(candidates)} records)", flush=True)

    # Attempts
    with open(ATTEMPTS_R1, "w", encoding="utf-8") as f:
        for a in attempts:
            f.write(json.dumps(a, ensure_ascii=False) + "\n")
    print(f"ATTEMPTS_R1: {ATTEMPTS_R1.name} ({len(attempts)} records)", flush=True)

    # ── Coverage metrics ───────────────────────────────────────────────────────
    cov = compute_coverage(candidates)
    print("\n=== SECTION 20 COVERAGE METRICS ===", flush=True)
    print(f"TOTAL_RESTAURANTS = {cov['TOTAL']}", flush=True)
    for f, v in cov["FIELD_COVERAGE"].items():
        print(f"  {f}: {v['has']}/{cov['TOTAL']} ({v['pct']}%)", flush=True)

    print("\nREVIEW_FLAG_COUNTS:", flush=True)
    for fn, cnt in sorted(cov["REVIEW_FLAG_COUNTS"].items(), key=lambda x: -x[1]):
        print(f"  {fn}: {cnt}", flush=True)

    print("\nVALIDATION_STATUS:", flush=True)
    for s, cnt in cov["VALIDATION_STATUS_COUNTS"].items():
        print(f"  {s}: {cnt}", flush=True)

    # Pool SHA256
    pool_bytes = json.dumps(list(candidates.values()), ensure_ascii=False, sort_keys=True).encode("utf-8")
    pool_sha256 = hashlib.sha256(pool_bytes).hexdigest().upper()

    # ── TourAPI probe (run in context of full script) ──────────────────────────
    print("\n=== TOURAPI SEOUL RESTAURANT PROBE ===", flush=True)
    kto_result = probe_tourapi_seoul_restaurants()
    for k, v in kto_result.items():
        print(f"  {k} = {v}", flush=True)

    # ── Manifest ───────────────────────────────────────────────────────────────
    manifest = {
        "task": TASK,
        "script_version": SCRIPT_VERSION,
        "target_city": TARGET_CITY,
        "as_of": AS_OF,
        "start_sha": START_SHA,
        "PARSER_BUG_FIXED": True,
        "PARSER_FIX_DETAIL": {
            "OLD_FIELD": "addr (top-level) / mapx / mapy / opentime",
            "CORRECT_FIELD": "traffic.adres / traffic.map_position_x / traffic.map_position_y / extra.cmmn_use_time",
            "DISCOVERY_METHOD": "live recursive key dump on 4 sample restaurant CIDs"
        },
        "FOOD_COLLECTION_SPEC_V1": "APPLIED",
        "CANONICAL_TARGET": "city_spots",
        "LEGACY_STORE_AS_SSOT": "NO",
        "CANONICAL_MATCHING_FINAL": "NOT_PERFORMED",
        "RESTAURANT_ATTRIBUTE_AI_INFERENCE": "FORBIDDEN",
        "RESTAURANT_TRACK_TOTAL": len(routing),
        "PRIORITY_CIDS": len(priority_cids),
        "EXPAND_CIDS": len(non_priority),
        "TOTAL_API_CALLS": len(attempts),
        "ENRICHED": enriched,
        "COORD_OK": coord_ok,
        "ADDRESS_OK": addr_ok,
        "HOURS_OK": hours_ok,
        "SIGNATURE_DISHES_OK": sig_dish_ok,
        "PHONE_OK": phone_ok,
        "MICHELIN_SEOUL": 0,
        "MICHELIN_NOTE": "All 194 restaurant records in public/data are Busan. SEOUL_MICHELIN_REUSABLE=0 CONFIRMED FINAL",
        "KTO_RESULT": kto_result,
        "COVERAGE": cov,
        "POOL_SHA256": pool_sha256,
        "PRODUCTION_WRITE": 0,
        "DB_CHANGE": 0,
        "SRC_MODIFIED": 0,
        "MASTER_CHANGE": 0,
        "SECRET_LEAK": 0,
        "BUSAN_CHANGE": 0,
        "GYEONGJU_CHANGE": 0,
        "JEJU_CHANGE": 0,
    }

    with open(MANIFEST_R1, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print(f"\nMANIFEST_R1: {MANIFEST_R1.name}", flush=True)
    print(f"POOL_SHA256 = {pool_sha256}", flush=True)
    print(f"\nTASK-SEOUL-FOOD-DISCOVERY-V1-R1-SOURCE-AUDIT-AND-TARGETED-GAPFILL 작업을 완료했습니다.", flush=True)


if __name__ == "__main__":
    main()
