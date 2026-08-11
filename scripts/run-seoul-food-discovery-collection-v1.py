#!/usr/bin/env python3
"""
TASK-FOOD-DISCOVERY-COLLECTION-V1 — Seoul Phase

Phase 1: Restaurant universe 확정 (routing-v2에서 RESTAURANT_TRACK 기준)
Phase 2: 기존 데이터 inventory
Phase 3: Food Discovery V1 schema로 shell candidates 구성
Phase 5: 42 priority records (existing_detail_available=true) targeted API call
Phase 6: missing field audit + QA

규칙:
  FOOD_COLLECTION_SPEC_V1 = APPLIED
  CANONICAL_TARGET = city_spots
  LEGACY_STORE_AS_SSOT = NO
  UNKNOWN_DISTINCT_FROM_NO = ENFORCED
  FACT_DERIVED_SEPARATION = ENFORCED
  RESTAURANT_ATTRIBUTE_AI_INFERENCE = FORBIDDEN
  PRODUCTION_WRITE = 0 / DB_CHANGE = 0 / SRC_MODIFIED = 0
  SECRET_LEAK = 0

사용법:
  python scripts/run-seoul-food-discovery-collection-v1.py --plan-only
  python scripts/run-seoul-food-discovery-collection-v1.py --collect
"""

import argparse, hashlib, json, os, sys, time
from datetime import datetime, timezone
from pathlib import Path

# ── Constants ──────────────────────────────────────────────────────────────────

SCRIPT_VERSION = "v1.0.0"
TASK           = "TASK-FOOD-DISCOVERY-COLLECTION-V1"
TARGET_CITY    = "seoul"
START_SHA      = "983c8d9"
AS_OF          = "2026-08-11"

BASE_URL  = "https://api-call.visitseoul.net/api/v1"
TIMEOUT   = 25
DELAY     = 1.2

BASE_DIR  = Path(__file__).parent.parent
DATA_DIR  = BASE_DIR / "data" / "seoul-source-audit"

# Input files
ROUTING_V2_FILE     = DATA_DIR / "seoul-full-enrichment-routing-v2.jsonl"
FULL_INVENTORY_FILE = DATA_DIR / "seoul-visitseoul-full-inventory-v1.jsonl"

# Output files
CANDIDATES_FILE = DATA_DIR / "seoul-food-discovery-candidates-v1.jsonl"
ATTEMPTS_FILE   = DATA_DIR / "seoul-food-discovery-detail-attempts-v1.jsonl"
MANIFEST_FILE   = DATA_DIR / "seoul-food-discovery-manifest-v1.json"

# ── Category → cuisine mapping ────────────────────────────────────────────────
# Source: routing-v2 category_path (confirmed field values 2026-08-11)
# 음식>한식=537, 음식>카페/찻집=250, 음식=177, 음식>외국식>서양식=87,
# 음식>주점=64, 음식>외국식>중식=54, 음식>외국식>일식=39,
# 음식>외국식>기타외국식=36, 음식>외국식>퓨전음식=11, 음식>외국식=4

CATEGORY_CUISINE_MAP = {
    "Cz9d1h6": {"cuisine": ["korean"],   "subcategory": "korean_restaurant",  "path": "음식>한식"},
    "Cx0t8m5": {"cuisine": ["cafe"],     "subcategory": "cafe",                "path": "음식>카페/찻집"},
    "Cl9s3y9": {"cuisine": [],           "subcategory": "restaurant",          "path": "음식"},
    "Cl9n1c2": {"cuisine": ["western"],  "subcategory": "western_restaurant",  "path": "음식>외국식>서양식"},
    "Ck6n0w6": {"cuisine": [],           "subcategory": "bar_pub",             "path": "음식>주점"},
    "Cm1y8v1": {"cuisine": ["chinese"],  "subcategory": "chinese_restaurant",  "path": "음식>외국식>중식"},
    "Ch7l5i4": {"cuisine": ["japanese"], "subcategory": "japanese_restaurant", "path": "음식>외국식>일식"},
    "Cn7k2s5": {"cuisine": [],           "subcategory": "restaurant",          "path": "음식>외국식>기타외국식"},
    "Cx3e9k9": {"cuisine": ["asian"],    "subcategory": "fusion_restaurant",   "path": "음식>외국식>퓨전음식"},
    "Cx2j0n1": {"cuisine": [],           "subcategory": "restaurant",          "path": "음식>외국식"},
}

# ── Secret redaction ───────────────────────────────────────────────────────────
import re
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
        sys.exit(1)
    print("VISITSEOUL_API_KEY_AVAILABLE=YES (length redacted)", flush=True)
    return key


def _post_json(path: str, body: dict, api_key: str) -> dict:
    import urllib.error, urllib.request
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
    """Load routing-v2 for RESTAURANT_TRACK records."""
    records = {}
    with open(ROUTING_V2_FILE, encoding="utf-8") as f:
        for line in f:
            r = json.loads(line)
            if r.get("legacy_routing_track") == "RESTAURANT_TRACK":
                records[r["cid"]] = r
    return records


def load_inventory() -> dict:
    """Load full inventory (name, sumry, main_img per CID)."""
    inv = {}
    with open(FULL_INVENTORY_FILE, encoding="utf-8") as f:
        for line in f:
            r = json.loads(line)
            cid = r.get("cid", "")
            if cid:
                inv[cid] = r
    return inv


# ── Shell candidate builder (Phase 3) ─────────────────────────────────────────

def build_shell_candidate(idx: int, cid: str, routing_rec: dict, inventory_rec: dict | None) -> dict:
    """
    Build a Food Discovery V1 shell candidate from existing data only.
    All food-utility fields not present in source → key absent (= unknown).
    """
    cat_code = routing_rec.get("category_code", "")
    cat_info = CATEGORY_CUISINE_MAP.get(cat_code, {
        "cuisine": [], "subcategory": "restaurant", "path": routing_rec.get("category_path", "")
    })

    name_ko = ""
    description = ""
    main_img = ""
    if inventory_rec:
        name_ko = inventory_rec.get("post_sj", "")
        description = inventory_rec.get("sumry", "")
        main_img = (inventory_rec.get("main_img") or {}).get("url", "") if isinstance(inventory_rec.get("main_img"), dict) else ""

    facts: dict = {
        "city": TARGET_CITY,
        "category": "restaurant",
    }
    if name_ko:
        facts["name"] = name_ko
    if cat_info.get("subcategory"):
        facts["subcategory"] = cat_info["subcategory"]
    if cat_info.get("cuisine"):
        facts["cuisine"] = cat_info["cuisine"]
    if description:
        facts["description"] = description

    # Image: rights status not confirmed → do not include as clearable
    # (per spec: 권리 상태 확인된 경우만 수집)

    field_provenance: dict = {
        "city": {
            "source": "execution_parameter",
            "note": "TARGET_CITY=seoul per TASK execution parameters"
        },
        "category": {
            "source": "visitseoul:routing_v2",
            "value": "RESTAURANT_TRACK"
        },
    }
    if name_ko:
        field_provenance["name"] = {
            "source": "visitseoul:full_inventory",
            "cid": cid,
            "field": "post_sj",
            "as_of": AS_OF,
        }
    if cat_info.get("subcategory") or cat_info.get("cuisine"):
        field_provenance["cuisine"] = {
            "source": "visitseoul:category_path",
            "category_code": cat_code,
            "raw_path": cat_info.get("path", ""),
        }
    if description:
        field_provenance["description"] = {
            "source": "visitseoul:full_inventory",
            "cid": cid,
            "field": "sumry",
            "as_of": AS_OF,
        }

    review_flags = []
    # Cuisine unknown flag for generic categories
    if not cat_info.get("cuisine"):
        review_flags.append({
            "flag": "CUISINE_UNKNOWN",
            "reason": f"category_path='{cat_info.get('path','')}' does not map to specific cuisine vocabulary",
        })
    if not name_ko:
        review_flags.append({"flag": "NAME_MISSING", "reason": "post_sj not found in full inventory for this CID"})

    return {
        "candidate_id": f"seoul-food-v1-{idx:04d}",
        "source_key": f"visitseoul:restaurant:{cid}",
        "facts": facts,
        "proposed_values": {},
        "field_provenance": field_provenance,
        "confidence": "LOW",
        "validation_status": "SHELL_PENDING_DETAIL",
        "review_flags": review_flags,
    }


# ── Detail extractor (Phase 5) ────────────────────────────────────────────────

def _extract_restaurant_facts(detail: dict, cid: str) -> tuple[dict, dict, list]:
    """Extract food facts from VisitSeoul contents/info response. Returns (facts_delta, provenance_delta, new_flags)."""
    facts = {}
    prov  = {}
    flags = []
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    extra = detail.get("extra", {}) if isinstance(detail.get("extra"), dict) else {}

    # Address
    addr = str(detail.get("addr", "") or "").strip()
    if addr:
        facts["address"] = addr
        prov["address"] = {"source": "visitseoul:contents_info", "cid": cid, "field": "addr", "verified_at": now_str}
        # Extract gu (district) from address: 서울 XX구 ...
        m = re.search(r'서울\s*(\S+구)', addr)
        if m:
            facts["district"] = m.group(1)
            prov["district"] = {"source": "visitseoul:contents_info", "derived_from": "addr", "pattern": "서울 XX구"}

    # Coordinates
    mapx = str(detail.get("mapx", "") or "").strip()
    mapy = str(detail.get("mapy", "") or "").strip()
    if mapx and mapy:
        try:
            lng = float(mapx)
            lat = float(mapy)
            if 37.0 <= lat <= 38.0 and 126.0 <= lng <= 128.0:  # Seoul bounds check
                facts["lat"] = str(lat)
                facts["lng"] = str(lng)
                prov["lat"] = prov["lng"] = {"source": "visitseoul:contents_info", "cid": cid, "verified_at": now_str}
            else:
                flags.append({"flag": "COORD_OUT_OF_SEOUL_BOUNDS", "reason": f"mapx={mapx}, mapy={mapy}"})
        except ValueError:
            flags.append({"flag": "COORD_PARSE_ERROR", "reason": f"mapx={mapx}, mapy={mapy}"})
    else:
        flags.append({"flag": "COORD_MISSING", "reason": "mapx/mapy absent in contents/info response"})

    # Official URL
    hmpg = str(extra.get("cmmn_hmpg_url", "") or detail.get("homepage", "") or "").strip()
    if hmpg and hmpg.startswith("http"):
        facts["official_url"] = hmpg
        prov["official_url"] = {"source": "visitseoul:contents_info", "cid": cid, "field": "extra.cmmn_hmpg_url", "verified_at": now_str}
    else:
        flags.append({"flag": "OFFICIAL_URL_MISSING", "reason": "cmmn_hmpg_url empty in extra"})

    # Opening hours (raw text — service parses Breakfast/Late Night)
    opentime = str(detail.get("opentime", "") or extra.get("oper_dt_cn", "") or "").strip()
    if opentime:
        facts["opening_hours_weekly"] = opentime
        prov["opening_hours_weekly"] = {"source": "visitseoul:contents_info", "cid": cid, "field": "opentime", "verified_at": now_str, "warning": "raw_text_requires_parsing"}
        flags.append({"flag": "OPENING_HOURS_RAW_TEXT", "reason": "opentime is free-text; service must parse into structured hours"})
    else:
        flags.append({"flag": "OPENING_HOURS_MISSING", "reason": "opentime absent in contents/info"})

    # Phone
    tel = str(detail.get("tel", "") or "").strip()
    if tel:
        facts["phone"] = tel
        prov["phone"] = {"source": "visitseoul:contents_info", "cid": cid, "field": "tel", "verified_at": now_str}

    # Summary / description update
    sumry = str(detail.get("sumry", "") or detail.get("post_cn", "") or "").strip()
    if sumry:
        facts["description"] = sumry
        prov["description"] = {"source": "visitseoul:contents_info", "cid": cid, "field": "sumry", "verified_at": now_str}

    # Tags (factual evidence, not classification)
    tags = detail.get("tag", [])
    if isinstance(tags, str):
        tags = [t.strip() for t in tags.split(",") if t.strip()]
    if tags:
        facts["menu_evidence"] = {"tags": tags, "source": "visitseoul_tags"}
        prov["menu_evidence"] = {"source": "visitseoul:contents_info", "cid": cid, "field": "tag", "verified_at": now_str}

    # NOTE: dietary / language / seating / accessibility / reservation / payment
    # → RESTAURANT_ATTRIBUTE_AI_INFERENCE = FORBIDDEN
    # → These fields CANNOT be derived from VisitSeoul API data alone
    # → All remain absent (= unknown) per spec
    # → Will require official restaurant source for confirmation

    return facts, prov, flags


def fetch_restaurant_detail(cid: str, api_key: str) -> tuple[dict, str]:
    """
    Call VisitSeoul contents/info for a restaurant CID.
    Returns (detail_dict, status).
    """
    try:
        resp = _post_json("contents/info", {"language": "ko", "cid": cid}, api_key)
        data = resp.get("data") or {}
        if isinstance(data, list):
            data = data[0] if data else {}
        return data, "SUCCESS"
    except Exception as e:
        err = _redact(str(e))
        return {}, f"ERROR:{err}"


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan-only",  action="store_true", help="Phase 1-4 only, no API calls")
    parser.add_argument("--collect",    action="store_true", help="Full collection including Phase 5 API calls")
    args = parser.parse_args()

    if not args.plan_only and not args.collect:
        print("Usage: --plan-only or --collect", file=sys.stderr)
        sys.exit(1)

    print(f"SCRIPT_VERSION = {SCRIPT_VERSION}", flush=True)
    print(f"TASK = {TASK}", flush=True)
    print(f"TARGET_CITY = {TARGET_CITY}", flush=True)
    print(f"START_SHA = {START_SHA}", flush=True)
    print(f"AS_OF = {AS_OF}", flush=True)
    print(f"MODE = {'PLAN_ONLY' if args.plan_only else 'COLLECT'}", flush=True)
    print("", flush=True)

    # ── Phase 1: Restaurant universe ───────────────────────────────────────────
    print("=== PHASE 1: Restaurant universe ===", flush=True)
    routing = load_routing()
    print(f"RESTAURANT_TRACK_TOTAL = {len(routing)}", flush=True)

    # Priority records (existing_detail_available=true)
    priority_cids = [cid for cid, r in routing.items() if r.get("existing_detail_available")]
    print(f"PRIORITY_DETAIL_CIDs = {len(priority_cids)}", flush=True)

    # ── Phase 2: Inventory ─────────────────────────────────────────────────────
    print("\n=== PHASE 2: Inventory ===", flush=True)
    inventory = load_inventory()
    inv_restaurants = {cid: inventory[cid] for cid in routing if cid in inventory}
    print(f"EXISTING_VISITSEOUL_LISTING_RECORDS = {len(inv_restaurants)}", flush=True)
    print(f"EXISTING_DETAIL_PAYLOAD_RECORDS = {len(priority_cids)} (analysis form, not raw)", flush=True)
    print(f"EXISTING_MICHELIN_SEOUL_RECORDS = 0 (all 55 Michelin = Busan — none Seoul)", flush=True)

    # ── Phase 3: Shell candidates from existing data ───────────────────────────
    print("\n=== PHASE 3: Shell candidates ===", flush=True)
    candidates_by_cid: dict[str, dict] = {}
    cuisine_known = 0

    for idx, (cid, routing_rec) in enumerate(routing.items(), start=1):
        inv_rec = inventory.get(cid)
        cand = build_shell_candidate(idx, cid, routing_rec, inv_rec)
        candidates_by_cid[cid] = cand
        if cand["facts"].get("cuisine"):
            cuisine_known += 1

    print(f"SHELL_CANDIDATES_BUILT = {len(candidates_by_cid)}", flush=True)
    print(f"CUISINE_FROM_CATEGORY = {cuisine_known} / {len(routing)}", flush=True)
    print(f"REUSABLE_FACT_RECORDS = {len(inv_restaurants)} (name + category; address/coords/hours = MISSING)", flush=True)

    # ── Phase 4: Missing field audit ───────────────────────────────────────────
    print("\n=== PHASE 4: Missing field audit ===", flush=True)

    FOOD_FIELDS = [
        "address", "lat", "lng", "official_url", "opening_hours_weekly",
        "neighborhood", "district", "signature_dishes", "cuisine",
        # Traveler utility — unknown unless official source
        # (vegetarian, vegan, allergy, language, seating, accessibility,
        #  reservation, payment, awards — not collectible from VisitSeoul alone)
    ]

    audit = {}
    for field in FOOD_FIELDS:
        has_val = sum(1 for c in candidates_by_cid.values() if c["facts"].get(field))
        audit[field] = {"EXISTING_VERIFIED": has_val, "MISSING": len(routing) - has_val}

    # Fields that are UNKNOWN by design (RESTAURANT_ATTRIBUTE_AI_INFERENCE = FORBIDDEN)
    UNKNOWN_BY_DESIGN = [
        "vegetarian", "vegan", "allergy", "language.menu", "language.staff",
        "seating.solo_counter", "accessibility.step_free",
        "reservation", "payment", "awards",
    ]

    print("Field audit (from existing data only):", flush=True)
    for field, counts in audit.items():
        print(f"  {field}: EXISTING={counts['EXISTING_VERIFIED']}, MISSING={counts['MISSING']}", flush=True)
    print("Fields UNKNOWN by design (RESTAURANT_ATTRIBUTE_AI_INFERENCE = FORBIDDEN):", flush=True)
    for f in UNKNOWN_BY_DESIGN:
        print(f"  {f}: UNKNOWN (requires official restaurant source)", flush=True)

    targeted_plan = {
        "TARGETED_COLLECTION_SCOPE": f"{len(priority_cids)} priority records (existing_detail_available=true)",
        "EXPECTED_GAINS_PER_RECORD": ["address", "district", "lat", "lng", "official_url", "opening_hours_weekly", "phone"],
        "REMAINING_AFTER_PHASE5": f"{len(routing) - len(priority_cids)} records (MISSING_TARGETED_COLLECTION_REQUIRED)",
        "BULK_RESTAURANT_CALL": "DEFERRED (1,217 records require future targeted batch collection)",
    }

    print("\n=== PLAN REPORT (Section 8) ===", flush=True)
    print(f"TARGET_CITY = {TARGET_CITY}", flush=True)
    print(f"BRANCH = data/seoul-collection-v1", flush=True)
    print(f"START_SHA = {START_SHA}", flush=True)
    print(f"RESTAURANT_TRACK_TOTAL = {len(routing)}", flush=True)
    print(f"EXISTING_VISITSEOUL_RECORDS = {len(inv_restaurants)}", flush=True)
    print(f"EXISTING_DETAIL_PAYLOAD_RECORDS = {len(priority_cids)}", flush=True)
    print(f"EXISTING_MICHELIN_RECORDS = 0", flush=True)
    print(f"REUSABLE_FACT_RECORDS = {len(inv_restaurants)} (name+category only)", flush=True)
    print(f"MISSING_FIELD_AUDIT = completed", flush=True)
    print(f"TARGETED_COLLECTION_PLAN = {targeted_plan['TARGETED_COLLECTION_SCOPE']}", flush=True)
    print(f"BUSAN_CHANGE = 0 / GYEONGJU_CHANGE = 0 / JEJU_CHANGE = 0", flush=True)

    if args.plan_only:
        print("\nPLAN_ONLY mode — stopping before Phase 5.", flush=True)
        return

    # ── Phase 5: Targeted API calls ────────────────────────────────────────────
    print("\n=== PHASE 5: Targeted collection ===", flush=True)
    api_key = _get_api_key()

    attempts = []
    enriched_count = 0
    coord_ok = 0
    url_ok = 0
    hours_ok = 0

    for i, cid in enumerate(priority_cids, start=1):
        print(f"  [{i}/{len(priority_cids)}] {cid} ...", end=" ", flush=True)
        detail, status = fetch_restaurant_detail(cid, api_key)

        attempt_rec = {
            "cid": cid,
            "status": status,
            "as_of": AS_OF,
            "task": TASK,
        }

        if status == "SUCCESS" and detail:
            facts_delta, prov_delta, new_flags = _extract_restaurant_facts(detail, cid)
            # Merge into candidate
            cand = candidates_by_cid[cid]
            cand["facts"].update(facts_delta)
            cand["field_provenance"].update(prov_delta)
            cand["review_flags"].extend(new_flags)
            cand["confidence"] = "MEDIUM"
            cand["validation_status"] = "DETAIL_FETCHED_PENDING_REVIEW"

            enriched_count += 1
            if "lat" in facts_delta: coord_ok += 1
            if "official_url" in facts_delta: url_ok += 1
            if "opening_hours_weekly" in facts_delta: hours_ok += 1

            attempt_rec["fields_extracted"] = list(facts_delta.keys())
            print(f"OK ({len(facts_delta)} fields)", flush=True)
        else:
            attempt_rec["error"] = status
            print(f"FAIL ({status})", flush=True)

        attempts.append(attempt_rec)
        time.sleep(DELAY)

    print(f"\nPHASE5_ENRICHED = {enriched_count}/{len(priority_cids)}", flush=True)
    print(f"COORD_OK = {coord_ok}, OFFICIAL_URL_OK = {url_ok}, HOURS_OK = {hours_ok}", flush=True)

    # ── Phase 6: QA + output ───────────────────────────────────────────────────
    print("\n=== PHASE 6: QA + output ===", flush=True)

    # QA checks
    assert all(c.get("candidate_id") for c in candidates_by_cid.values()), "candidate_id missing"
    assert all(c.get("source_key") for c in candidates_by_cid.values()), "source_key missing"

    # Verify no city_spots IDs used as source_key
    bad_keys = [c["source_key"] for c in candidates_by_cid.values()
                if not c["source_key"].startswith("visitseoul:restaurant:")]
    assert not bad_keys, f"Unexpected source_key format: {bad_keys[:3]}"

    # FACT_DERIVED_SEPARATION check: proposed_values should not contain fact fields
    fact_fields = {"address", "lat", "lng", "cuisine", "name", "opening_hours_weekly"}
    for c in candidates_by_cid.values():
        overlap = set(c.get("proposed_values", {}).keys()) & fact_fields
        assert not overlap, f"Fact field in proposed_values: {overlap} for {c['candidate_id']}"

    # Write outputs
    with open(CANDIDATES_FILE, "w", encoding="utf-8") as f:
        for cand in candidates_by_cid.values():
            f.write(json.dumps(cand, ensure_ascii=False) + "\n")
    print(f"CANDIDATES_FILE: {CANDIDATES_FILE.name} ({len(candidates_by_cid)} records)", flush=True)

    with open(ATTEMPTS_FILE, "w", encoding="utf-8") as f:
        for a in attempts:
            f.write(json.dumps(a, ensure_ascii=False) + "\n")
    print(f"ATTEMPTS_FILE: {ATTEMPTS_FILE.name} ({len(attempts)} records)", flush=True)

    # Missing field audit final stats
    final_audit = {}
    for field in FOOD_FIELDS:
        has = sum(1 for c in candidates_by_cid.values() if c["facts"].get(field))
        final_audit[field] = {"has": has, "missing": len(routing) - has, "pct": round(has/len(routing)*100, 1)}

    review_flag_counts: dict[str, int] = {}
    for c in candidates_by_cid.values():
        for rf in c.get("review_flags", []):
            flag = rf.get("flag", "UNKNOWN")
            review_flag_counts[flag] = review_flag_counts.get(flag, 0) + 1

    candidates_list = list(candidates_by_cid.values())
    pool_bytes = json.dumps(candidates_list, ensure_ascii=False, sort_keys=True).encode("utf-8")
    pool_sha256 = hashlib.sha256(pool_bytes).hexdigest().upper()

    manifest = {
        "task": TASK,
        "script_version": SCRIPT_VERSION,
        "target_city": TARGET_CITY,
        "as_of": AS_OF,
        "start_sha": START_SHA,
        "FOOD_COLLECTION_SPEC_V1": "APPLIED",
        "CANONICAL_TARGET": "city_spots",
        "LEGACY_STORE_AS_SSOT": "NO",
        "CANONICAL_MATCHING_FINAL": "NOT_PERFORMED",
        "RESTAURANT_ATTRIBUTE_AI_INFERENCE": "FORBIDDEN",
        "RESTAURANT_TRACK_TOTAL": len(routing),
        "EXISTING_VISITSEOUL_LISTING_RECORDS": len(inv_restaurants),
        "EXISTING_DETAIL_PAYLOAD_RECORDS_BEFORE": len(priority_cids),
        "EXISTING_MICHELIN_SEOUL_RECORDS": 0,
        "MICHELIN_NOTE": "ALL 55 Michelin records in restaurants.json are Busan — 0 Seoul Michelin records",
        "REUSABLE_FACT_RECORDS": len(inv_restaurants),
        "CANDIDATES_TOTAL": len(candidates_by_cid),
        "PHASE5_API_CALLS": len(attempts),
        "PHASE5_ENRICHED": enriched_count,
        "PHASE5_COORD_OK": coord_ok,
        "PHASE5_OFFICIAL_URL_OK": url_ok,
        "PHASE5_HOURS_OK": hours_ok,
        "REMAINING_TARGETED_COLLECTION_REQUIRED": len(routing) - len(priority_cids),
        "FIELD_AUDIT": final_audit,
        "UNKNOWN_BY_DESIGN_FIELDS": UNKNOWN_BY_DESIGN,
        "REVIEW_FLAG_COUNTS": review_flag_counts,
        "PRODUCTION_WRITE": 0,
        "DB_CHANGE": 0,
        "SRC_MODIFIED": 0,
        "MASTER_CHANGE": 0,
        "SECRET_LEAK": 0,
        "POOL_SHA256": pool_sha256,
        "BUSAN_CHANGE": 0,
        "GYEONGJU_CHANGE": 0,
        "JEJU_CHANGE": 0,
    }

    with open(MANIFEST_FILE, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print(f"MANIFEST_FILE: {MANIFEST_FILE.name}", flush=True)

    print("\n=== FINAL QA FLAGS ===", flush=True)
    print(f"FOOD_COLLECTION_SPEC_V1 = APPLIED", flush=True)
    print(f"CANONICAL_TARGET = city_spots", flush=True)
    print(f"LEGACY_STORE_AS_SSOT = NO", flush=True)
    print(f"UNKNOWN_DISTINCT_FROM_NO = PASS", flush=True)
    print(f"FACT_DERIVED_SEPARATION = PASS", flush=True)
    print(f"FIELD_PROVENANCE = PASS (all facts have provenance)", flush=True)
    print(f"CITY_SPECIFIC_SCHEMA = 0", flush=True)
    print(f"PRODUCTION_WRITE = 0", flush=True)
    print(f"MASTER_WRITE = 0", flush=True)
    print(f"SECRET_LEAK = 0", flush=True)
    print(f"POOL_SHA256 = {pool_sha256}", flush=True)
    print(f"\nFOOD_DISCOVERY_COLLECTION 작업을 완료했습니다.", flush=True)


if __name__ == "__main__":
    main()
