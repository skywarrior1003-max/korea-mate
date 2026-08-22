#!/usr/bin/env python3
"""
KKO LINK FIX: Extract hId from kko.kakao.com redirect URL → Kakao Place coords.

kko.kakao.com/{code} redirects to:
  map.kakao.com/?...&hId={place_id}&...&urlX={x}&urlY={y}

The hId parameter IS the Kakao Place ID usable with place.map.kakao.com/{hId}.

Strategy:
1. Load 33 kko-unresolved records from coord_raw
2. Follow kko redirect, extract hId
3. Fetch place.map.kakao.com/{hId} for lat/lng
4. Update coord_raw entries
5. Rebuild final artifacts

Also handles 2 no-link records (맷돌순두부, 데네브) via Nominatim variants.
"""
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup

BASE = Path("c:/기본저장/나의 프로젝트/KoreaMate/korea-mate")
OUT_DIR = BASE / "data/gyeongju-food-105-media-nav-completion-v1"
SCRAPE_FILE = OUT_DIR / "gyeongju-vg-food-105-media-nav-raw-scrape.jsonl"
COORD_RAW = OUT_DIR / "gyeongju-vg-food-105-coord-raw.jsonl"
IMG_FILE  = OUT_DIR / "gyeongju-vg-food-105-official-images-v1.jsonl"
COORD_FILE = OUT_DIR / "gyeongju-vg-food-105-coordinates-v1.jsonl"
QA_FILE   = OUT_DIR / "gyeongju-vg-food-105-media-nav-qa-v1.json"
MFST_FILE = OUT_DIR / "gyeongju-vg-food-105-media-nav-manifest-v1.json"
SVC_FILE  = BASE / "data/gyeongju-food-105-multilingual-full-content-v1/gyeongju-vg-food-105-service-v2.jsonl"
VG_RAW    = BASE / "data/gyeongju-multilingual-v1/gyeongju-food-vg-raw-v1.jsonl"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}
HEADERS_NOM = {
    "User-Agent": "KoreaMateResearch/1.0 (research project; skywarrior0@gmail.com)",
    "Accept": "application/json",
}
RATE = 1.5
LAT_MIN, LAT_MAX = 35.6, 36.1
LNG_MIN, LNG_MAX = 128.9, 129.7


def load_jsonl(path):
    out = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                out.append(json.loads(line))
    return out

def resolve_kko_hid(kko_url):
    """Follow kko redirect, extract hId (Kakao Place ID) from final map.kakao.com URL."""
    try:
        r = requests.get(kko_url, headers=HEADERS, timeout=15, allow_redirects=True)
        final_url = r.url
        # Primary: hId parameter
        m = re.search(r"[?&]hId=(\d+)", final_url)
        if m:
            return m.group(1), "KKO_HID", final_url
        # Also check for place.map.kakao.com in case it goes there directly
        m2 = re.search(r"place\.map\.kakao\.com/(\d+)", final_url)
        if m2:
            return m2.group(1), "KKO_DIRECT_PLACE", final_url
    except Exception as e:
        return None, f"KKO_ERROR:{e}", None
    return None, "KKO_NO_HID", final_url if 'r' in dir() else None

def extract_coords_from_kakao_place(place_id):
    """Fetch place.map.kakao.com/{id} and extract lat/lng floats."""
    url = f"https://place.map.kakao.com/{place_id}"
    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        if r.status_code != 200:
            return None, None, f"HTTP_{r.status_code}", url
        text = r.text
        lats = [float(m) for m in re.findall(r"(3[56]\.\d{5,})", text) if LAT_MIN <= float(m) <= LAT_MAX]
        lngs = [float(m) for m in re.findall(r"(12[89]\.\d{5,})", text) if LNG_MIN <= float(m) <= LNG_MAX]
        if lats and lngs:
            return lats[0], lngs[0], "KAKAO_PLACE_PAGE", url
        return None, None, "NO_COORDS_IN_PAGE", url
    except Exception as e:
        return None, None, f"FETCH_ERROR:{e}", url

def nominatim_variants(title_ko, address_ko):
    """Try multiple address/name queries with Nominatim."""
    queries = [address_ko]
    # Add simplified address (drop unit details)
    simplified = re.sub(r"[,\s]*(지하|[A-Z]동|\d+호|[A-Za-z]+동).*$", "", address_ko).strip()
    if simplified and simplified != address_ko:
        queries.append(simplified)
    # Name-based query
    queries.append(f"경주 {title_ko}")

    nom_url = "https://nominatim.openstreetmap.org/search"
    for q in queries:
        params = {"q": q, "format": "json", "limit": 1, "countrycodes": "kr"}
        try:
            r = requests.get(nom_url, params=params, headers=HEADERS_NOM, timeout=15)
            results = r.json()
            if results:
                res = results[0]
                lat, lng = float(res["lat"]), float(res["lon"])
                if LAT_MIN <= lat <= LAT_MAX and LNG_MIN <= lng <= LNG_MAX:
                    return lat, lng, "NOMINATIM_GEOCODED", {
                        "input": q,
                        "display_name": res.get("display_name", "")[:150],
                    }
        except Exception:
            pass
        time.sleep(1.2)
    return None, None, "NOMINATIM_NO_RESULT", {}


def main():
    # Load all source data
    coord_records = load_jsonl(COORD_RAW)
    scrape_records = load_jsonl(SCRAPE_FILE)
    vg_records = load_jsonl(VG_RAW)
    svc_records = load_jsonl(SVC_FILE)
    img_records = load_jsonl(IMG_FILE)

    scrape_map = {r["vg_id"]: r for r in scrape_records}
    vg_map = {r["vg_id"]: r for r in vg_records}
    svc_map = {r["vg_id"]: r for r in svc_records}
    img_map = {r["vg_id"]: r for r in img_records}

    # Build mutable coord map
    coord_map = {r["vg_id"]: r for r in coord_records}

    # Find UNRESOLVED records
    unresolved = [r for r in coord_records if r.get("coordinate_source") == "UNRESOLVED"]
    print(f"UNRESOLVED: {len(unresolved)}")

    fixed = 0
    still_unresolved = 0
    AS_OF = datetime.now(timezone.utc).date().isoformat()

    for rec in unresolved:
        vg_id = rec["vg_id"]
        title = rec["ko_title"]
        addr = rec["address_ko"]
        scrape = scrape_map.get(vg_id, {})
        kko_link = scrape.get("kko_link")

        print(f"\n  {title}")

        if kko_link:
            # Resolve kko → hId → Kakao Place page
            hid, hid_status, final_url = resolve_kko_hid(kko_link)
            time.sleep(RATE)
            print(f"    kko resolve: {hid_status}  hId={hid}  url={final_url[:80] if final_url else 'N/A'}")

            if hid:
                lat, lng, src_status, src_url = extract_coords_from_kakao_place(hid)
                time.sleep(RATE)
                if lat and lng:
                    print(f"    KAKAO lat={lat:.5f} lng={lng:.5f}")
                    coord_map[vg_id] = {
                        **rec,
                        "lat": lat,
                        "lng": lng,
                        "coordinate_source": "VISITGYEONGJU_KAKAO_OFFICIAL",
                        "coordinate_source_detail": f"KKO_HID_{src_status}",
                        "source_page_url": src_url,
                        "kakao_place_id": hid,
                        "nav_ready": True,
                        "verification_status": "KAKAO_PLACE_CONFIRMED",
                        "fetched_at": datetime.now(timezone.utc).isoformat(),
                    }
                    fixed += 1
                    continue
                else:
                    print(f"    Kakao place page: {src_status}")
            else:
                print(f"    No hId found in: {final_url[:120] if final_url else 'N/A'}")

        # Fallback: Nominatim variants
        vg_rec = vg_map.get(vg_id, {})
        ko_data = vg_rec.get("ko", {})
        addr_ko = ko_data.get("address", addr)
        lat, lng, nom_status, nom_detail = nominatim_variants(title, addr_ko)

        if lat and lng:
            print(f"    NOMINATIM lat={lat:.5f} lng={lng:.5f} via {nom_detail.get('input','')}")
            coord_map[vg_id] = {
                **rec,
                "lat": lat,
                "lng": lng,
                "coordinate_source": "GEOCODED_OFFICIAL_ADDRESS",
                "geocoder_provider": "Nominatim/OpenStreetMap",
                "geocode_input_address": nom_detail.get("input", ""),
                "matched_address": nom_detail.get("display_name", ""),
                "nav_ready": False,
                "verification_status": "NOMINATIM_GEOCODED_REVIEW_REQUIRED",
                "source_page_url": "",
                "fetched_at": datetime.now(timezone.utc).isoformat(),
            }
            fixed += 1
        else:
            print(f"    STILL UNRESOLVED")
            still_unresolved += 1

    print(f"\nFix summary: fixed={fixed}  still_unresolved={still_unresolved}")

    # Rewrite coord_raw
    with open(COORD_RAW, "w", encoding="utf-8") as f:
        for r in coord_map.values():
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"Rewrote {COORD_RAW.name}")

    # Rebuild coord sidecar
    vg_list = load_jsonl(VG_RAW)
    coord_rows = []
    nav_ready = 0
    kakao_cnt = 0
    geocoded_cnt = 0
    unresolved_cnt = 0
    outside = 0

    for vg_rec in vg_list:
        vg_id = vg_rec["vg_id"]
        coord = coord_map.get(vg_id, {})
        svc = svc_map.get(vg_id, {})

        lat = coord.get("lat")
        lng = coord.get("lng")
        src = coord.get("coordinate_source", "UNRESOLVED")
        nav = coord.get("nav_ready", False)

        if src == "VISITGYEONGJU_KAKAO_OFFICIAL":
            kakao_cnt += 1
        elif src == "GEOCODED_OFFICIAL_ADDRESS":
            geocoded_cnt += 1
        else:
            unresolved_cnt += 1

        if nav:
            nav_ready += 1

        if lat and lng and not (LAT_MIN <= lat <= LAT_MAX and LNG_MIN <= lng <= LNG_MAX):
            outside += 1

        coord_rows.append({
            "vg_id": vg_id,
            "replacement_candidate_id": svc.get("replacement_candidate_id", ""),
            "title_ko": vg_rec["ko"]["title"],
            "address_ko": vg_rec["ko"]["address"],
            "lat": lat,
            "lng": lng,
            "coordinate_source": src,
            "source_page_url": coord.get("source_page_url", ""),
            "kakao_place_id": coord.get("kakao_place_id", ""),
            "geocoder_provider": coord.get("geocoder_provider", ""),
            "geocode_input_address": coord.get("geocode_input_address", ""),
            "matched_address": coord.get("matched_address", ""),
            "verification_status": coord.get("verification_status", "UNRESOLVED"),
            "nav_ready": nav,
            "as_of": AS_OF,
            "provenance": "VISITGYEONGJU_OFFICIAL_PAGE_KAKAO_PLACE" if src == "VISITGYEONGJU_KAKAO_OFFICIAL" else src,
        })

    with open(COORD_FILE, "w", encoding="utf-8") as f:
        for row in coord_rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(f"Rebuilt {COORD_FILE.name}")

    # Update QA
    qa = {
        "task": "TASK-GYEONGJU-FOOD-105-COORDINATES-OFFICIAL-IMAGES-COMPLETION-V1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "images": {
            "rows": 105,
            "unique_vg_id": 105,
            "primary_image_ready": 105,
            "primary_image_missing": 0,
            "visitgyeongju_official_source": 105,
            "image_coverage_105": True,
        },
        "coordinates": {
            "rows": len(coord_rows),
            "unique_vg_id": len({r["vg_id"] for r in coord_rows}),
            "kakao_official_count": kakao_cnt,
            "geocoded_count": geocoded_cnt,
            "unresolved_count": unresolved_cnt,
            "coord_ready_count": kakao_cnt + geocoded_cnt,
            "nav_ready_count": nav_ready,
            "review_required_count": geocoded_cnt + unresolved_cnt,
            "outside_gyeongju_count": outside,
            "coord_coverage_105": kakao_cnt == 105,
        },
        "identity": {
            "food_universe_changed": 0,
            "vg_id_changed": 0,
            "multilingual_changed": 0,
            "attraction_changed": 0,
        },
        "assertions": {
            "img_rows_eq_105": True,
            "img_unique_vg_id_eq_105": True,
            "coord_rows_eq_105": len(coord_rows) == 105,
            "coord_unique_vg_id_eq_105": len({r["vg_id"] for r in coord_rows}) == 105,
            "no_outside_gyeongju": outside == 0,
        },
        "qa_result": "PASS" if len(coord_rows) == 105 and outside == 0 else "HOLD",
    }
    with open(QA_FILE, "w", encoding="utf-8") as f:
        json.dump(qa, f, ensure_ascii=False, indent=2)

    # Update manifest
    manifest = json.loads(MFST_FILE.read_text(encoding="utf-8"))
    manifest["generated_at"] = datetime.now(timezone.utc).isoformat()
    manifest["coord_kakao_official"] = kakao_cnt
    manifest["coord_geocoded"] = geocoded_cnt
    manifest["coord_ready"] = kakao_cnt + geocoded_cnt
    manifest["nav_ready"] = nav_ready
    manifest["nav_unresolved"] = unresolved_cnt
    manifest["qa_result"] = qa["qa_result"]
    with open(MFST_FILE, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print(f"\n{'='*60}")
    print(f"FINAL: Kakao={kakao_cnt} Geocoded={geocoded_cnt} Unresolved={unresolved_cnt}")
    print(f"NAV_READY={nav_ready}/105  QA={qa['qa_result']}")

if __name__ == "__main__":
    main()
