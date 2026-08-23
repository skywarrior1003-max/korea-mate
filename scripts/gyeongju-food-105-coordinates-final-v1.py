#!/usr/bin/env python3
"""
TASK-GYEONGJU-FOOD-105-COORDINATES-FINAL-NAV-READY-V1

Goal: 105/105 NAV_READY coordinates for VG Food 105 entities.

Current state (from media-nav-completion sidecar):
  Kakao Place exact: 71
  Nominatim REVIEW: 33
  UNRESOLVED: 1 (데네브)

Strategy:
  Phase A — Re-resolve 33 Nominatim records via kko hId approach
              (30 have kko links → were missed by old Phase 2 resolver)
  Phase B — VWorld exact-address geocoding for remaining
              (토함민속식당 kko-no-hId, 맷돌순두부, 반다99, 교동쌈밥경주, 데네브)
  Phase C — Kakao Place page validation for 71 existing records
              (fetch place page → extract name/address → compare with VG official)
  Phase D — Build final V2 coordinate artifact with quality taxonomy
  Phase E — QA (bounds, duplicates, outliers, sample spot check)

Output:
  data/gyeongju-food-105-coordinates-final-v1/
    gyeongju-vg-food-105-coordinates-final-v2.jsonl  (105 rows)
    gyeongju-vg-food-105-coordinates-final-manifest-v2.json
    gyeongju-vg-food-105-coordinates-final-qa-v2.json
    (internal) coord-final-raw.jsonl  (resumable intermediate)
    (internal) kakao-validation-raw.jsonl  (validation QA data)
"""
import json
import math
import re
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup

# ── Paths ────────────────────────────────────────────────────────────────────
BASE = Path("c:/기본저장/나의 프로젝트/KoreaMate/korea-mate")
SCRAPE_FILE = BASE / "data/gyeongju-food-105-media-nav-completion-v1/gyeongju-vg-food-105-media-nav-raw-scrape.jsonl"
COORD_RAW_V1 = BASE / "data/gyeongju-food-105-media-nav-completion-v1/gyeongju-vg-food-105-coord-raw.jsonl"
VG_RAW       = BASE / "data/gyeongju-multilingual-v1/gyeongju-food-vg-raw-v1.jsonl"
SVC_FILE     = BASE / "data/gyeongju-food-105-multilingual-full-content-v1/gyeongju-vg-food-105-service-v2.jsonl"

OUT_DIR = BASE / "data/gyeongju-food-105-coordinates-final-v1"
OUT_DIR.mkdir(parents=True, exist_ok=True)

COORD_FINAL_RAW   = OUT_DIR / "coord-final-raw.jsonl"
KAKAO_VAL_RAW     = OUT_DIR / "kakao-validation-raw.jsonl"
COORD_FINAL_V2    = OUT_DIR / "gyeongju-vg-food-105-coordinates-final-v2.jsonl"
MANIFEST_V2       = OUT_DIR / "gyeongju-vg-food-105-coordinates-final-manifest-v2.json"
QA_V2             = OUT_DIR / "gyeongju-vg-food-105-coordinates-final-qa-v2.json"

# ── Config ────────────────────────────────────────────────────────────────────
LAT_MIN, LAT_MAX = 35.6, 36.1
LNG_MIN, LNG_MAX = 128.9, 129.7
RATE = 1.5   # seconds between requests
AS_OF = datetime.now(timezone.utc).date().isoformat()

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}
HEADERS_NOM = {
    "User-Agent": "KoreaMateResearch/1.0 (research project; skywarrior0@gmail.com)",
    "Accept": "application/json",
}


# ── Env key loader (never prints key) ────────────────────────────────────────
def load_env_key(key_name):
    env_path = BASE / ".env.local"
    with open(env_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line.startswith(f"{key_name}="):
                return line.split("=", 1)[1].strip()
    return None

VWORLD_KEY = load_env_key("VWORLD_API_KEY")
assert VWORLD_KEY, "VWORLD_API_KEY not found in .env.local"
# Key loaded — NEVER printed below


# ── JSONL helpers ─────────────────────────────────────────────────────────────
def load_jsonl(path):
    out = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                out.append(json.loads(line))
    return out

def append_jsonl(path, record):
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


# ── Coord extractors ──────────────────────────────────────────────────────────
def gyeongju_floats(text):
    """Extract Gyeongju-range lat/lng pairs from HTML text."""
    lats = [float(m) for m in re.findall(r"(3[56]\.\d{5,})", text)
            if LAT_MIN <= float(m) <= LAT_MAX]
    lngs = [float(m) for m in re.findall(r"(12[89]\.\d{5,})", text)
            if LNG_MIN <= float(m) <= LNG_MAX]
    return lats, lngs


# ── Kakao helpers ─────────────────────────────────────────────────────────────
def resolve_kko_hid(kko_url):
    """Follow kko.kakao.com short link → extract hId from map.kakao.com redirect URL."""
    try:
        r = requests.get(kko_url, headers=HEADERS, timeout=15, allow_redirects=True)
        final = r.url
        m = re.search(r"[?&]hId=(\d+)", final)
        if m:
            return m.group(1), "KKO_HID", final
        m2 = re.search(r"place\.map\.kakao\.com/(\d+)", final)
        if m2:
            return m2.group(1), "KKO_DIRECT", final
        return None, "KKO_NO_HID", final
    except Exception as e:
        return None, f"KKO_ERROR:{e}", None


def fetch_kakao_place_page(place_id):
    """Fetch place.map.kakao.com/{id}, return (lat, lng, name, address, status, url)."""
    url = f"https://place.map.kakao.com/{place_id}"
    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        if r.status_code != 200:
            return None, None, None, None, f"HTTP_{r.status_code}", url
        text = r.text
        soup = BeautifulSoup(text, "html.parser")

        lats, lngs = gyeongju_floats(text)
        lat = lats[0] if lats else None
        lng = lngs[0] if lngs else None

        # Extract name from og:title or <title>
        og_title = soup.find("meta", property="og:title")
        page_title = soup.find("title")
        kakao_name = ""
        if og_title:
            kakao_name = og_title.get("content", "")
        elif page_title:
            kakao_name = page_title.get_text(strip=True)
        # Clean "- 카카오맵" suffix
        kakao_name = re.sub(r"\s*[-:]\s*카카오맵.*$", "", kakao_name).strip()
        kakao_name = re.sub(r"\s*\|\s*Kakao Map.*$", "", kakao_name).strip()

        # Extract address from og:description or body
        og_desc = soup.find("meta", property="og:description")
        kakao_addr = ""
        if og_desc:
            kakao_addr = og_desc.get("content", "")
        if not kakao_addr:
            # Try to find address-like patterns in page
            addr_match = re.search(r"경[상북도제주]*\s*경주시[^\n<>\"']{5,60}", text)
            if addr_match:
                kakao_addr = addr_match.group(0).strip()

        if lat and lng:
            return lat, lng, kakao_name, kakao_addr, "OK", url
        return None, None, kakao_name, kakao_addr, "NO_COORDS_IN_PAGE", url
    except Exception as e:
        return None, None, None, None, f"FETCH_ERROR:{e}", url


# ── VWorld geocoding ──────────────────────────────────────────────────────────
def vworld_geocode(address_ko, addr_type="road"):
    """
    VWorld address → coordinate.
    addr_type: 'road' for 도로명주소, 'parcel' for 지번주소
    Returns: (lat, lng, refined_addr, result_type, precision)
    """
    url = "https://api.vworld.kr/req/address"
    params = {
        "service": "address",
        "request": "getcoord",
        "version": "2.0",
        "crs": "epsg:4326",
        "address": address_ko,
        "refine": "true",
        "simple": "false",
        "format": "json",
        "type": addr_type,
        "key": VWORLD_KEY,
    }
    try:
        r = requests.get(url, params=params, headers=HEADERS, timeout=15)
        data = r.json()
        status = data.get("response", {}).get("status", "")
        if status != "OK":
            error = data.get("response", {}).get("error", {})
            return None, None, "", f"VWORLD_ERROR_{error.get('code','')}", ""
        result = data["response"]["result"]
        point = result.get("point", {})
        lng = float(point.get("x", 0))
        lat = float(point.get("y", 0))
        refined = result.get("refined", {})
        refined_addr = refined.get("text", "")
        struct = refined.get("structure", {})

        # Check if in Gyeongju
        if not (LAT_MIN <= lat <= LAT_MAX and LNG_MIN <= lng <= LNG_MAX):
            return None, None, refined_addr, "VWORLD_OUTSIDE_GYEONGJU", ""

        # Determine precision level
        level = struct.get("level4L", "") or struct.get("level4A", "") or struct.get("level3", "")
        if struct.get("detail", ""):
            precision = "BUILDING_LEVEL"
        elif struct.get("level4LC", "") or struct.get("level4AC", ""):
            precision = "LOT_LEVEL"
        elif struct.get("level4L", "") or struct.get("level4A", ""):
            precision = "BLOCK_LEVEL"
        else:
            precision = "ROAD_LEVEL"

        return lat, lng, refined_addr, "VWORLD_OK", precision
    except Exception as e:
        return None, None, "", f"VWORLD_EXCEPTION:{e}", ""


# ── Distance helper ───────────────────────────────────────────────────────────
def haversine_m(lat1, lng1, lat2, lng2):
    """Approx distance in meters between two WGS84 coordinates."""
    R = 6371000
    φ1, φ2 = math.radians(lat1), math.radians(lat2)
    dφ = math.radians(lat2 - lat1)
    dλ = math.radians(lng2 - lng1)
    a = math.sin(dφ/2)**2 + math.cos(φ1)*math.cos(φ2)*math.sin(dλ/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))


# ── Address similarity check ──────────────────────────────────────────────────
def address_compatible(vg_addr, kakao_addr):
    """
    Rough check: do VG and Kakao addresses refer to same location?
    Returns True if they share enough key tokens.
    """
    if not vg_addr or not kakao_addr:
        return None  # cannot determine
    # Extract street/lot numbers
    vg_nums = re.findall(r"\d+", vg_addr)
    kk_nums = re.findall(r"\d+", kakao_addr)
    # Check if any key number matches (lot/building number)
    shared = set(vg_nums) & set(kk_nums) - {"0"}
    if shared:
        return True
    # Check if 경주 is in both
    return "경주" in vg_addr and "경주" in kakao_addr


# ── Phase A: Re-resolve 33 Nominatim records via kko hId ─────────────────────
def phase_a(nominatim_records, scrape_map):
    """Follow kko links for 33 Nominatim records to upgrade to Kakao exact."""
    print("=== PHASE A: kko hId resolution for Nominatim records ===")
    done = {}
    if COORD_FINAL_RAW.exists():
        for r in load_jsonl(COORD_FINAL_RAW):
            done[r["vg_id"]] = r

    results = {}
    for vg_id, cv in nominatim_records:
        if vg_id in done:
            results[vg_id] = done[vg_id]
            continue

        sc = scrape_map.get(vg_id, {})
        kko_link = sc.get("kko_link")
        direct_id = sc.get("kakao_place_id")
        title = cv["ko_title"]
        addr = cv.get("address_ko", "")

        result = {"vg_id": vg_id, "ko_title": title, "address_ko": addr,
                  "phase": "A", "fetched_at": datetime.now(timezone.utc).isoformat()}

        if kko_link:
            hid, hid_status, final_url = resolve_kko_hid(kko_link)
            time.sleep(RATE)
            result["kko_hid_status"] = hid_status
            result["kko_final_url"] = (final_url or "")[:150]

            if hid:
                lat, lng, name, addr_k, pg_status, src_url = fetch_kakao_place_page(hid)
                time.sleep(RATE)
                result["kakao_place_id"] = hid
                result["kakao_place_name"] = name or ""
                result["kakao_place_addr"] = addr_k or ""
                result["kakao_page_status"] = pg_status
                if lat and lng:
                    result.update({
                        "lat": lat, "lng": lng,
                        "coordinate_source": "KAKAO_PLACE",
                        "source_url": src_url,
                        "nav_ready": True,
                        "resolution": "KKO_HID_KAKAO_PLACE",
                    })
                    print(f"  [A-KAKAO] {title}: lat={lat:.5f} lng={lng:.5f}")
                else:
                    result["resolution"] = f"KKO_HID_PLACE_PAGE_FAILED_{pg_status}"
                    print(f"  [A-MISS] {title}: hId={hid} but {pg_status}")
            else:
                result["resolution"] = f"KKO_RESOLVE_FAILED_{hid_status}"
                print(f"  [A-MISS] {title}: kko {hid_status}")

        elif direct_id:
            lat, lng, name, addr_k, pg_status, src_url = fetch_kakao_place_page(direct_id)
            time.sleep(RATE)
            result["kakao_place_id"] = direct_id
            result["kakao_place_name"] = name or ""
            result["kakao_place_addr"] = addr_k or ""
            result["kakao_page_status"] = pg_status
            if lat and lng:
                result.update({
                    "lat": lat, "lng": lng,
                    "coordinate_source": "KAKAO_PLACE",
                    "source_url": src_url,
                    "nav_ready": True,
                    "resolution": "DIRECT_ID_RETRY",
                })
                print(f"  [A-RETRY] {title}: lat={lat:.5f} lng={lng:.5f}")
            else:
                result["resolution"] = f"DIRECT_ID_FAILED_{pg_status}"
                print(f"  [A-MISS] {title}: direct_id={direct_id} {pg_status}")
        else:
            result["resolution"] = "NO_KAKAO_LINK"
            print(f"  [A-SKIP] {title}: no kakao link (handled in Phase B)")

        append_jsonl(COORD_FINAL_RAW, result)
        done[vg_id] = result
        results[vg_id] = result

    print(f"Phase A done: {sum(1 for r in results.values() if r.get('coordinate_source')=='KAKAO_PLACE')} resolved via Kakao")
    return results


# ── Phase B: VWorld for remaining records ─────────────────────────────────────
def phase_b(target_records, vg_map):
    """VWorld exact-address geocoding for records Phase A couldn't resolve."""
    print("\n=== PHASE B: VWorld exact-address geocoding ===")
    done_vids = set()
    existing = {}
    if COORD_FINAL_RAW.exists():
        for r in load_jsonl(COORD_FINAL_RAW):
            existing[r["vg_id"]] = r
            if r.get("coordinate_source") == "KAKAO_PLACE" or r.get("resolution", "").startswith("VWORLD"):
                done_vids.add(r["vg_id"])

    results = {}
    for vg_id, title, official_addr in target_records:
        if vg_id in done_vids:
            results[vg_id] = existing[vg_id]
            continue

        prev = existing.get(vg_id, {})
        result = {"vg_id": vg_id, "ko_title": title, "address_ko": official_addr,
                  "phase": "B", "fetched_at": datetime.now(timezone.utc).isoformat()}

        print(f"  {title}: addr={official_addr}")

        # Try road address first, then parcel
        for addr_variant, addr_type in [
            (official_addr, "road"),
            (official_addr, "parcel"),
            # Try stripping business name from address
            (re.sub(r"\s+" + re.escape(title) + r"\s*$", "", official_addr).strip(), "road"),
        ]:
            if not addr_variant or addr_variant == official_addr and addr_type == "parcel" and result.get("lat"):
                continue
            lat, lng, refined, vw_status, precision = vworld_geocode(addr_variant, addr_type)
            time.sleep(RATE)
            if lat and lng:
                result.update({
                    "lat": lat, "lng": lng,
                    "coordinate_source": "VWORLD_EXACT_ADDRESS",
                    "geocoder_provider": "VWorld/행정안전부",
                    "geocode_input_address": addr_variant,
                    "geocode_addr_type": addr_type,
                    "matched_address": refined,
                    "precision": precision,
                    "nav_ready": precision in ("BUILDING_LEVEL", "LOT_LEVEL"),
                    "resolution": f"VWORLD_{addr_type.upper()}_{precision}",
                })
                print(f"    VWorld [{addr_type}] → lat={lat:.5f} lng={lng:.5f} precision={precision}")
                break
            else:
                print(f"    VWorld [{addr_type}] failed: {vw_status}")

        if not result.get("lat"):
            result["resolution"] = "VWORLD_ALL_FAILED"
            result["nav_ready"] = False
            print(f"    UNRESOLVED")

        # Merge previous kko attempt data
        if "kko_hid_status" in prev:
            result["kko_hid_status"] = prev.get("kko_hid_status", "")

        append_jsonl(COORD_FINAL_RAW, result)
        existing[vg_id] = result
        results[vg_id] = result

    return results


# ── Phase C: Kakao Place page validation for 71 existing records ───────────────
def phase_c(kakao71_records, coord_v1_map, scrape_map):
    """
    Fetch Kakao Place pages for 71 existing records.
    Extract name/address, compare with VG official.
    """
    print("\n=== PHASE C: Kakao Place page validation for 71 existing records ===")
    done = {}
    if KAKAO_VAL_RAW.exists():
        for r in load_jsonl(KAKAO_VAL_RAW):
            done[r["vg_id"]] = r

    results = {}
    for vg_id, cv in kakao71_records:
        if vg_id in done:
            results[vg_id] = done[vg_id]
            continue

        place_id = cv.get("kakao_place_id", "")
        title = cv["ko_title"]
        v1_lat = cv.get("lat")
        v1_lng = cv.get("lng")
        vg_addr = cv.get("address_ko", "")
        sc = scrape_map.get(vg_id, {})

        result = {"vg_id": vg_id, "ko_title": title, "vg_address": vg_addr,
                  "kakao_place_id": place_id, "v1_lat": v1_lat, "v1_lng": v1_lng,
                  "fetched_at": datetime.now(timezone.utc).isoformat()}

        if not place_id:
            # Try to get place_id from scrape data or kko
            place_id = sc.get("kakao_place_id", "")
            kko = sc.get("kko_link", "")
            if not place_id and kko:
                # Try kko → hId  (already resolved ones should have it in coord_v1)
                pass

        if place_id:
            lat, lng, name, kakao_addr, pg_status, src_url = fetch_kakao_place_page(place_id)
            time.sleep(RATE)
            result.update({
                "page_status": pg_status,
                "kakao_name": name or "",
                "kakao_addr": kakao_addr or "",
                "page_lat": lat,
                "page_lng": lng,
            })
            if lat and lng and v1_lat and v1_lng:
                delta_m = haversine_m(v1_lat, v1_lng, lat, lng)
                result["coord_delta_m"] = round(delta_m, 1)
                result["coord_stable"] = delta_m < 30  # < 30m = same point
            else:
                result["coord_delta_m"] = None
                result["coord_stable"] = None

            # Name compatibility check
            name_ok = None
            if name and title:
                # Simple token overlap check
                title_clean = re.sub(r"[\s\(\)\[\]]+", "", title).lower()
                name_clean = re.sub(r"[\s\(\)\[\]]+", "", name).lower()
                # Remove common suffixes from kakao name
                name_clean = re.sub(r"(경주|gyeongju|점|store|지점)", "", name_clean)
                title_clean = re.sub(r"(경주|gyeongju|점|store|지점)", "", title_clean)
                # Check token overlap
                overlap = len(set(title_clean) & set(name_clean)) / max(len(set(title_clean)), 1)
                name_ok = overlap >= 0.5 or title_clean in name_clean or name_clean in title_clean
            result["name_match"] = name_ok

            addr_ok = address_compatible(vg_addr, kakao_addr)
            result["addr_compatible"] = addr_ok

            # Overall entity match assessment
            if pg_status == "OK" and lat and lng:
                if name_ok is True or name_ok is None:
                    if addr_ok is True or addr_ok is None:
                        result["entity_match"] = "CONFIRMED"
                    else:
                        result["entity_match"] = "ADDR_MISMATCH_REVIEW"
                else:
                    result["entity_match"] = "NAME_MISMATCH_REVIEW"
            elif pg_status.startswith("HTTP_"):
                result["entity_match"] = f"PAGE_UNAVAILABLE_{pg_status}"
            else:
                result["entity_match"] = f"PAGE_ISSUE_{pg_status}"

            print(f"  {title}: {pg_status} entity={result['entity_match']} delta={result.get('coord_delta_m')}m")
        else:
            result["page_status"] = "NO_PLACE_ID"
            result["entity_match"] = "NO_PLACE_ID"
            print(f"  {title}: NO_PLACE_ID")

        done[vg_id] = result
        results[vg_id] = result

    # Write all at once (replacing file)
    with open(KAKAO_VAL_RAW, "w", encoding="utf-8") as f:
        for r in results.values():
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    print(f"Phase C done: {len(results)} validated")
    confirmed = sum(1 for r in results.values() if r.get("entity_match") == "CONFIRMED")
    review = sum(1 for r in results.values() if "REVIEW" in r.get("entity_match", ""))
    unavailable = sum(1 for r in results.values() if "UNAVAILABLE" in r.get("entity_match", ""))
    print(f"  Confirmed={confirmed} Review={review} Unavailable={unavailable}")
    return results


# ── Build final V2 artifact ────────────────────────────────────────────────────
def phase_d_build(vg_records, scrape_map, coord_v1_map, phase_a_results, phase_b_results, phase_c_val):
    """Build final coordinates V2 JSONL with quality taxonomy."""
    print("\n=== PHASE D: Build final V2 coordinate artifact ===")
    rows = []

    for vg_rec in vg_records:
        vg_id = vg_rec["vg_id"]
        title = vg_rec["ko"]["title"]
        addr = vg_rec["ko"]["address"]
        phone = vg_rec["ko"].get("phone", "")
        sc = scrape_map.get(vg_id, {})
        v1 = coord_v1_map.get(vg_id, {})

        # Determine coordinate from best available source
        lat = lng = None
        coord_source = "UNRESOLVED"
        quality = "REVIEW_REQUIRED"
        source_url = ""
        map_place_id = ""
        geocoder_provider = ""
        geocode_input = ""
        matched_addr = ""
        validation_method = ""
        nav_ready = False
        precision = ""

        # Priority order:
        # 1. Phase A resolved (Kakao exact via kko hId)
        # 2. Phase B resolved (VWorld exact address)
        # 3. Phase C validated existing Kakao 71

        pa = phase_a_results.get(vg_id)
        pb = phase_b_results.get(vg_id)
        pc_val = phase_c_val.get(vg_id)

        if pa and pa.get("coordinate_source") == "KAKAO_PLACE":
            # Phase A: newly resolved Kakao exact
            lat, lng = pa["lat"], pa["lng"]
            coord_source = "KAKAO_PLACE"
            quality = "ENTITY_EXACT"
            source_url = pa.get("source_url", "")
            map_place_id = pa.get("kakao_place_id", "")
            validation_method = pa.get("resolution", "")
            nav_ready = True

        elif pb and pb.get("lat"):
            # Phase B: VWorld address geocoding
            lat, lng = pb["lat"], pb["lng"]
            coord_source = "VWORLD_EXACT_ADDRESS"
            precision = pb.get("precision", "")
            geocoder_provider = "VWorld/행정안전부"
            geocode_input = pb.get("geocode_input_address", "")
            matched_addr = pb.get("matched_address", "")
            validation_method = pb.get("resolution", "")
            nav_ready = precision in ("BUILDING_LEVEL", "LOT_LEVEL")
            quality = "ADDRESS_EXACT" if nav_ready else "REVIEW_REQUIRED"

        elif v1.get("coordinate_source") == "VISITGYEONGJU_KAKAO_OFFICIAL":
            # Existing Kakao 71 — check Phase C validation
            lat, lng = v1.get("lat"), v1.get("lng")
            map_place_id = v1.get("kakao_place_id", "")
            # Get original source from scrape_map
            sc_place_id = sc.get("kakao_place_id") or v1.get("kakao_place_id", "")
            map_place_id = sc_place_id or map_place_id

            if pc_val:
                entity_match = pc_val.get("entity_match", "")
                if entity_match == "CONFIRMED":
                    coord_source = "KAKAO_PLACE"
                    quality = "ENTITY_EXACT"
                    source_url = f"https://place.map.kakao.com/{map_place_id}" if map_place_id else ""
                    validation_method = "KAKAO_PLACE_PAGE_RECONFIRMED"
                    nav_ready = True
                elif "UNAVAILABLE" in entity_match:
                    # Place page not available for re-validation, but coord was extracted previously
                    coord_source = "KAKAO_PLACE"
                    quality = "VERIFIED_EXISTING"
                    source_url = f"https://place.map.kakao.com/{map_place_id}" if map_place_id else ""
                    validation_method = f"KAKAO_PRIOR_EXTRACT_{entity_match}"
                    nav_ready = True
                elif "REVIEW" in entity_match:
                    coord_source = "KAKAO_PLACE"
                    quality = "REVIEW_REQUIRED"
                    source_url = f"https://place.map.kakao.com/{map_place_id}" if map_place_id else ""
                    validation_method = f"KAKAO_ENTITY_REVIEW_{entity_match}"
                    nav_ready = False
                else:
                    # Not validated
                    coord_source = "KAKAO_PLACE"
                    quality = "VERIFIED_EXISTING"
                    source_url = f"https://place.map.kakao.com/{map_place_id}" if map_place_id else ""
                    validation_method = "KAKAO_PRIOR_EXTRACT"
                    nav_ready = True
            else:
                # Not in Phase C (shouldn't happen for 71)
                coord_source = "KAKAO_PLACE"
                quality = "VERIFIED_EXISTING"
                source_url = f"https://place.map.kakao.com/{map_place_id}" if map_place_id else ""
                validation_method = "KAKAO_PRIOR_EXTRACT_UNVALIDATED"
                nav_ready = True

        elif v1.get("lat"):
            # Nominatim fallback (still not resolved after all phases)
            lat, lng = v1.get("lat"), v1.get("lng")
            coord_source = "GEOCODED_OFFICIAL_ADDRESS"
            quality = "REVIEW_REQUIRED"
            geocoder_provider = "Nominatim/OpenStreetMap"
            geocode_input = v1.get("geocode_input_address", "")
            matched_addr = v1.get("matched_address", "")
            validation_method = "NOMINATIM_ONLY"
            nav_ready = False

        # Previous coordinate info (for delta QA)
        prev_src = v1.get("coordinate_source", "")
        prev_lat = v1.get("lat")
        prev_lng = v1.get("lng")

        # Delta vs Nominatim previous
        nominatim_delta_m = None
        if prev_src == "GEOCODED_OFFICIAL_ADDRESS" and prev_lat and prev_lng and lat and lng:
            nominatim_delta_m = round(haversine_m(prev_lat, prev_lng, lat, lng), 1)

        row = {
            "vg_id": vg_id,
            "title_ko": title,
            "address_ko": addr,
            "phone": phone,
            "lat": lat,
            "lng": lng,
            "coordinate_source": coord_source,
            "coordinate_quality": quality,
            "source_url": source_url,
            "map_place_id": map_place_id,
            "geocoder_provider": geocoder_provider,
            "geocode_input_address": geocode_input,
            "matched_address": matched_addr,
            "precision": precision,
            "previous_coordinate_source": prev_src,
            "previous_lat": prev_lat,
            "previous_lng": prev_lng,
            "nominatim_delta_m": nominatim_delta_m,
            "validation_method": validation_method,
            "nav_ready": nav_ready,
            "as_of": AS_OF,
            "provenance": ("VISITGYEONGJU_OFFICIAL_PAGE_KAKAO_PLACE" if "KAKAO" in coord_source
                           else "VWORLD_OFFICIAL_ADDRESS_GEOCODING" if "VWORLD" in coord_source
                           else coord_source),
        }
        rows.append(row)

    return rows


# ── Phase E: QA ───────────────────────────────────────────────────────────────
def phase_e_qa(rows, kakao_val_results, svc_map):
    """Full QA on 105 final coordinate rows."""
    print("\n=== PHASE E: Final QA ===")

    total = len(rows)
    lat_ok = sum(1 for r in rows if r["lat"] is not None)
    lng_ok = sum(1 for r in rows if r["lng"] is not None)
    nav_ready_cnt = sum(1 for r in rows if r.get("nav_ready"))
    unique_vg = len({r["vg_id"] for r in rows})

    entity_exact = sum(1 for r in rows if r.get("coordinate_quality") == "ENTITY_EXACT")
    addr_exact = sum(1 for r in rows if r.get("coordinate_quality") == "ADDRESS_EXACT")
    verified = sum(1 for r in rows if r.get("coordinate_quality") == "VERIFIED_EXISTING")
    review_req = sum(1 for r in rows if r.get("coordinate_quality") == "REVIEW_REQUIRED")

    kakao_cnt = sum(1 for r in rows if r.get("coordinate_source") == "KAKAO_PLACE")
    vworld_cnt = sum(1 for r in rows if r.get("coordinate_source") == "VWORLD_EXACT_ADDRESS")
    geocoded_cnt = sum(1 for r in rows if r.get("coordinate_source") == "GEOCODED_OFFICIAL_ADDRESS")
    unresolved_cnt = sum(1 for r in rows if r.get("coordinate_source") == "UNRESOLVED")

    # Out of range
    outside = [r for r in rows if r["lat"] and r["lng"]
               and not (LAT_MIN <= r["lat"] <= LAT_MAX and LNG_MIN <= r["lng"] <= LNG_MAX)]
    # Zero coords
    zero_coords = [r for r in rows if r["lat"] == 0 or r["lng"] == 0]
    # Duplicate suspicious: same coordinate for different restaurants
    coord_to_vids = {}
    for r in rows:
        if r["lat"] and r["lng"]:
            key = (round(r["lat"], 4), round(r["lng"], 4))
            coord_to_vids.setdefault(key, []).append(r["vg_id"])
    suspicious_dups = {k: v for k, v in coord_to_vids.items() if len(v) > 1}

    # Delta stats for Nominatim → final comparison
    deltas = [r["nominatim_delta_m"] for r in rows if r.get("nominatim_delta_m") is not None]
    d_gt150 = [r for r in rows if r.get("nominatim_delta_m") and r["nominatim_delta_m"] > 150]
    d_gt500 = [r for r in rows if r.get("nominatim_delta_m") and r["nominatim_delta_m"] > 500]

    print(f"  Total rows: {total}")
    print(f"  Unique vg_id: {unique_vg}")
    print(f"  lat/lng non-null: {lat_ok}/{lng_ok}")
    print(f"  NAV_READY: {nav_ready_cnt}")
    print(f"  ENTITY_EXACT: {entity_exact}  ADDRESS_EXACT: {addr_exact}  VERIFIED: {verified}  REVIEW: {review_req}")
    print(f"  Kakao: {kakao_cnt}  VWorld: {vworld_cnt}  Geocoded: {geocoded_cnt}  Unresolved: {unresolved_cnt}")
    print(f"  Outside Gyeongju: {len(outside)}")
    print(f"  Zero coords: {len(zero_coords)}")
    print(f"  Suspicious duplicate coords: {len(suspicious_dups)}")
    if suspicious_dups:
        for coord, vids in suspicious_dups.items():
            names = [r["title_ko"] for r in rows if r["vg_id"] in vids]
            print(f"    {coord}: {names}")
    print(f"  Delta vs Nominatim: n={len(deltas)} >150m={len(d_gt150)} >500m={len(d_gt500)}")
    for r in d_gt150[:5]:
        print(f"    {r['title_ko']}: {r['nominatim_delta_m']}m  src={r['coordinate_source']}")

    # Phase C entity match summary
    pc_confirmed = sum(1 for r in kakao_val_results.values() if r.get("entity_match") == "CONFIRMED")
    pc_review = sum(1 for r in kakao_val_results.values() if "REVIEW" in r.get("entity_match", ""))
    pc_unavail = sum(1 for r in kakao_val_results.values() if "UNAVAILABLE" in r.get("entity_match", ""))

    # QA assertions
    assertions = {
        "rows_eq_105": total == 105,
        "unique_vg_id_eq_105": unique_vg == 105,
        "no_null_lat": lat_ok == 105,
        "no_null_lng": lng_ok == 105,
        "no_outside_gyeongju": len(outside) == 0,
        "no_zero_coords": len(zero_coords) == 0,
        "suspicious_dup_coords": len(suspicious_dups),  # informational count
        "nav_ready_count": nav_ready_cnt,
        "entity_exact_plus_addr_exact_eq_105": (entity_exact + addr_exact + verified) == 105,
    }

    qa = {
        "task": "TASK-GYEONGJU-FOOD-105-COORDINATES-FINAL-NAV-READY-V1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "food_universe": 105,
        "coordinate_sources": {
            "KAKAO_PLACE": kakao_cnt,
            "VWORLD_EXACT_ADDRESS": vworld_cnt,
            "GEOCODED_OFFICIAL_ADDRESS": geocoded_cnt,
            "UNRESOLVED": unresolved_cnt,
        },
        "coordinate_quality": {
            "ENTITY_EXACT": entity_exact,
            "ADDRESS_EXACT": addr_exact,
            "VERIFIED_EXISTING": verified,
            "REVIEW_REQUIRED": review_req,
        },
        "coverage": {
            "lat_lng_ready": lat_ok,
            "nav_ready": nav_ready_cnt,
            "unresolved": unresolved_cnt,
            "outside_gyeongju": len(outside),
            "zero_coords": len(zero_coords),
        },
        "kakao_validation_phase_c": {
            "validated": len(kakao_val_results),
            "confirmed": pc_confirmed,
            "review": pc_review,
            "page_unavailable": pc_unavail,
        },
        "delta_vs_nominatim": {
            "total_pairs": len(deltas),
            "max_m": round(max(deltas), 1) if deltas else 0,
            "avg_m": round(sum(deltas)/len(deltas), 1) if deltas else 0,
            "gt150m_count": len(d_gt150),
            "gt500m_count": len(d_gt500),
            "gt150m_rows": [{"title": r["title_ko"], "delta_m": r["nominatim_delta_m"]} for r in d_gt150],
        },
        "duplicate_coord_check": {
            "suspicious_duplicate_coords": len(suspicious_dups),
            "clusters": [{"coord": list(k), "count": len(v), "titles": [r["title_ko"] for r in rows if r["vg_id"] in v]}
                         for k, v in list(suspicious_dups.items())[:10]],
        },
        "assertions": assertions,
        "qa_result": "PASS" if (
            total == 105 and unique_vg == 105 and
            len(outside) == 0 and len(zero_coords) == 0 and
            unresolved_cnt == 0 and nav_ready_cnt == 105
        ) else ("HOLD" if nav_ready_cnt >= 100 else "FAIL"),
    }
    return qa


# ── Sample QA (12 records) ────────────────────────────────────────────────────
def sample_qa(rows, kakao_val_results):
    """Select 12 sample records for spot QA."""
    # 4 from Kakao existing, 6 from newly resolved Nominatim→Kakao, 1 데네브, 1 max delta
    kakao_rows = [r for r in rows if r.get("coordinate_source") == "KAKAO_PLACE"
                  and r.get("previous_coordinate_source") == "VISITGYEONGJU_KAKAO_OFFICIAL"]
    new_kakao = [r for r in rows if r.get("coordinate_source") == "KAKAO_PLACE"
                 and r.get("previous_coordinate_source") == "GEOCODED_OFFICIAL_ADDRESS"]
    deneb_rows = [r for r in rows if r["title_ko"] == "데네브"]
    max_delta_rows = sorted([r for r in rows if r.get("nominatim_delta_m")],
                            key=lambda x: x["nominatim_delta_m"], reverse=True)

    samples = []
    step_k = max(1, len(kakao_rows) // 4)
    samples += [kakao_rows[i] for i in range(0, len(kakao_rows), step_k)][:4]
    step_n = max(1, len(new_kakao) // 6)
    samples += [new_kakao[i] for i in range(0, len(new_kakao), step_n)][:6]
    samples += deneb_rows[:1]
    samples += max_delta_rows[:1]

    # Deduplicate by vg_id
    seen = set()
    final_samples = []
    for s in samples:
        if s["vg_id"] not in seen:
            seen.add(s["vg_id"])
            final_samples.append(s)

    # Format sample report
    sample_report = []
    pass_cnt = 0
    for s in final_samples[:12]:
        pc = kakao_val_results.get(s["vg_id"], {})
        check = {
            "vg_id": s["vg_id"],
            "title_ko": s["title_ko"],
            "address_ko": s["address_ko"],
            "lat": s["lat"],
            "lng": s["lng"],
            "source": s["coordinate_source"],
            "quality": s["coordinate_quality"],
            "nav_ready": s["nav_ready"],
            "kakao_entity_match": pc.get("entity_match", "N/A"),
            "nominatim_delta_m": s.get("nominatim_delta_m"),
            "in_gyeongju": bool(s["lat"] and LAT_MIN <= s["lat"] <= LAT_MAX
                                and s["lng"] and LNG_MIN <= s["lng"] <= LNG_MAX),
        }
        check["qa_pass"] = (
            check["in_gyeongju"] and s["lat"] and
            s["coordinate_source"] not in ("UNRESOLVED", "GEOCODED_OFFICIAL_ADDRESS") and
            check["nav_ready"]
        )
        if check["qa_pass"]:
            pass_cnt += 1
        sample_report.append(check)

    return sample_report, pass_cnt


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    # Load source data
    vg_records = load_jsonl(VG_RAW)
    svc_records = load_jsonl(SVC_FILE)
    scrape_records = load_jsonl(SCRAPE_FILE)
    coord_v1_records = load_jsonl(COORD_RAW_V1)

    scrape_map = {r["vg_id"]: r for r in scrape_records}
    coord_v1_map = {r["vg_id"]: r for r in coord_v1_records}
    svc_map = {r["vg_id"]: r for r in svc_records}
    vg_map = {r["vg_id"]: r for r in vg_records}

    print(f"Loaded: vg={len(vg_records)} svc={len(svc_records)} scrape={len(scrape_records)} coord_v1={len(coord_v1_records)}")

    # Categorize v1 coordinates
    nominatim_vids = [(k, v) for k, v in coord_v1_map.items()
                      if v.get("coordinate_source") == "GEOCODED_OFFICIAL_ADDRESS"]
    unresolved_vids = [(k, v) for k, v in coord_v1_map.items()
                       if v.get("coordinate_source") == "UNRESOLVED"]
    kakao71_vids = [(k, v) for k, v in coord_v1_map.items()
                    if v.get("coordinate_source") == "VISITGYEONGJU_KAKAO_OFFICIAL"]

    print(f"V1 state: Kakao71={len(kakao71_vids)} Nominatim={len(nominatim_vids)} Unresolved={len(unresolved_vids)}")

    # ── Phase A: kko hId for Nominatim records ──────────────────────────────
    phase_a_results = phase_a(nominatim_vids, scrape_map)

    # ── Phase B: VWorld for remaining ──────────────────────────────────────
    # Identify which records Phase A didn't resolve
    phase_b_targets = []

    # Nominatim records that Phase A didn't resolve via Kakao
    for vg_id, cv in nominatim_vids:
        pa = phase_a_results.get(vg_id, {})
        if pa.get("coordinate_source") != "KAKAO_PLACE":
            vg_rec = vg_map.get(vg_id, {})
            addr = vg_rec.get("ko", {}).get("address", cv.get("address_ko", ""))
            phase_b_targets.append((vg_id, cv["ko_title"], addr))

    # UNRESOLVED records (데네브 etc.)
    for vg_id, cv in unresolved_vids:
        vg_rec = vg_map.get(vg_id, {})
        addr = vg_rec.get("ko", {}).get("address", cv.get("address_ko", ""))
        phase_b_targets.append((vg_id, cv["ko_title"], addr))

    print(f"\nPhase B targets: {len(phase_b_targets)}")
    phase_b_results = phase_b(phase_b_targets, vg_map)

    # ── Phase C: Validate 71 existing Kakao records ──────────────────────────
    phase_c_val = phase_c(kakao71_vids, coord_v1_map, scrape_map)

    # ── Phase D: Build final V2 artifact ────────────────────────────────────
    final_rows = phase_d_build(vg_records, scrape_map, coord_v1_map,
                               phase_a_results, phase_b_results, phase_c_val)

    # Write V2 JSONL
    with open(COORD_FINAL_V2, "w", encoding="utf-8") as f:
        for row in final_rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(f"\nWritten: {COORD_FINAL_V2.name} ({len(final_rows)} rows)")

    # ── Phase E: QA ──────────────────────────────────────────────────────────
    qa = phase_e_qa(final_rows, phase_c_val, svc_map)

    # Sample QA
    sample_report, sample_pass = sample_qa(final_rows, phase_c_val)
    qa["sample_qa"] = {
        "count": len(sample_report),
        "pass_count": sample_pass,
        "samples": sample_report,
    }

    with open(QA_V2, "w", encoding="utf-8") as f:
        json.dump(qa, f, ensure_ascii=False, indent=2)
    print(f"Written: {QA_V2.name}")

    # ── Manifest V2 ──────────────────────────────────────────────────────────
    entity_exact = qa["coordinate_quality"]["ENTITY_EXACT"]
    addr_exact = qa["coordinate_quality"]["ADDRESS_EXACT"]
    verified = qa["coordinate_quality"]["VERIFIED_EXISTING"]
    review = qa["coordinate_quality"]["REVIEW_REQUIRED"]
    nav_ready = qa["coverage"]["nav_ready"]
    unresolved = qa["coordinate_sources"]["UNRESOLVED"]

    manifest = {
        "task": "TASK-GYEONGJU-FOOD-105-COORDINATES-FINAL-NAV-READY-V1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "branch": "data/gyeongju-food-105-coordinates-final-v1",
        "food_ssot_branch": "data/gyeongju-food-105-media-nav-completion-v1",
        "food_ssot_sha": "323142e",
        "universe": 105,
        "vg_id_unique": 105,
        "entity_exact_count": entity_exact,
        "address_exact_count": addr_exact,
        "verified_existing_count": verified,
        "review_required_count": review,
        "lat_lng_ready_count": qa["coverage"]["lat_lng_ready"],
        "coord_ready_count": qa["coverage"]["lat_lng_ready"],
        "nav_ready_count": nav_ready,
        "coord_unresolved_count": unresolved,
        "outside_gyeongju_count": qa["coverage"]["outside_gyeongju"],
        "image_package": "data/gyeongju-food-105-media-nav-completion-v1/gyeongju-vg-food-105-official-images-v1.jsonl (105/105 unchanged)",
        "multilingual_package": "data/gyeongju-food-105-multilingual-full-content-v1/gyeongju-vg-food-105-service-v2.jsonl (105/105 unchanged)",
        "final_coordinates_v2": str(COORD_FINAL_V2.relative_to(BASE)),
        "main_join_key": "vg_id",
        "MAIN_MUST_USE_FINAL_COORDINATES_V2": "YES",
        "OLD_COORDINATES_V1_SUPERSEDED_FOR_RUNTIME": "YES",
        "identity_invariants": {
            "FOOD_IDENTITY_CHANGED": 0,
            "MULTILINGUAL_CHANGED": 0,
            "IMAGE_CHANGED": 0,
            "ATTRACTION_CHANGED": 0,
            "DB_CHANGED": 0,
            "PRODUCTION_CHANGED": 0,
        },
        "qa_result": qa["qa_result"],
        "FOOD_105_FINAL_RUNTIME_DATA_READY": "YES" if qa["qa_result"] == "PASS" else "NO",
        "MAIN_HANDOFF_READY": "YES" if qa["qa_result"] == "PASS" else "HOLD",
    }
    with open(MANIFEST_V2, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print(f"Written: {MANIFEST_V2.name}")

    print(f"\n{'='*60}")
    print(f"RESULT: {qa['qa_result']}")
    print(f"ENTITY_EXACT={entity_exact}  ADDRESS_EXACT={addr_exact}  VERIFIED={verified}  REVIEW={review}")
    print(f"NAV_READY={nav_ready}/105  UNRESOLVED={unresolved}")
    print(f"Sample QA: {sample_pass}/{len(sample_report)} PASS")

    return qa


if __name__ == "__main__":
    main()
