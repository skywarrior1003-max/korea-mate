#!/usr/bin/env python3
"""
TASK-GYEONGJU-FOOD-105-COORDINATES-FINAL-NAV-READY-V1  Fix Script
==================================================================
FIX-1: VWorld precision reclassification
  Current: level5 not checked -> all 10 VWORLD_EXACT_ADDRESS marked ROAD_LEVEL
  Fix: level5 != "" -> ADDRESS_NUMBER_LEVEL -> nav_ready=True

FIX-2: ahwa (아화전통국수 보문점) wrong Kakao entity
  Current: Phase A Kakao lat=35.894 lng=129.049 -- 19.7km from address
  Fix: Replace with VWorld result for correct address 경주시 북군길 25
"""
import json
import re
import requests
import time
import math
from datetime import datetime, timezone
from pathlib import Path

BASE    = Path("c:/기본저장/나의 프로젝트/KoreaMate/korea-mate")
SVC_FILE = BASE / "data/gyeongju-food-105-multilingual-full-content-v1/gyeongju-vg-food-105-service-v2.jsonl"
VG_RAW   = BASE / "data/gyeongju-multilingual-v1/gyeongju-food-vg-raw-v1.jsonl"
OUT_DIR  = BASE / "data/gyeongju-food-105-coordinates-final-v1"

COORD_FINAL_RAW = OUT_DIR / "coord-final-raw.jsonl"
KAKAO_VAL_RAW   = OUT_DIR / "kakao-validation-raw.jsonl"
V1_COORDS       = BASE / "data/gyeongju-food-105-media-nav-completion-v1/gyeongju-vg-food-105-coordinates-v1.jsonl"

OUT_V2      = OUT_DIR / "gyeongju-vg-food-105-coordinates-final-v2.jsonl"
OUT_QA      = OUT_DIR / "gyeongju-vg-food-105-coordinates-final-qa-v2.json"
OUT_MANIFEST= OUT_DIR / "gyeongju-vg-food-105-coordinates-final-manifest-v2.json"

LAT_MIN, LAT_MAX = 35.6, 36.1
LNG_MIN, LNG_MAX = 128.9, 129.7

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120"}


def load_env_key(k):
    with open(BASE / ".env.local", encoding="utf-8") as f:
        for line in f:
            if line.strip().startswith(f"{k}="):
                return line.strip().split("=", 1)[1].strip()
    return None


VW_KEY = load_env_key("VWORLD_API_KEY")


def load_jsonl(path):
    recs = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                recs.append(json.loads(line))
    return recs


def haversine(lat1, lng1, lat2, lng2):
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lng2 - lng1)
    a = (math.sin(d_phi / 2) ** 2
         + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2)
    return 2 * R * math.asin(math.sqrt(a))


def normalize_addr(addr_raw, title=""):
    """Add spaces before digits, strip trailing business name, add province."""
    addr = addr_raw.strip()
    if title and addr.endswith(title):
        addr = addr[:-len(title)].strip()
    addr = re.sub(r"([가-힣])(\d)", r"\1 \2", addr)
    if not addr.startswith("경상북도"):
        addr = "경상북도 " + addr
    return addr.strip()


def vworld_geocode_full(address):
    """VWorld getcoord with full structure including level5."""
    r = requests.get(
        "https://api.vworld.kr/req/address",
        params={
            "service": "address", "request": "getcoord", "version": "2.0",
            "crs": "epsg:4326", "address": address, "refine": "true",
            "simple": "false", "format": "json", "type": "road", "key": VW_KEY,
        },
        headers=HEADERS, timeout=15,
    )
    data = r.json()
    status = data.get("response", {}).get("status", "")
    if status != "OK":
        return None
    result  = data["response"]["result"]
    refined = data["response"].get("refined", {})
    struct  = refined.get("structure", {})
    pt      = result.get("point", {})
    if not pt.get("x") or not pt.get("y"):
        return None

    lat = float(pt["y"])
    lng = float(pt["x"])
    level4L  = struct.get("level4L", "")
    level4LC = struct.get("level4LC", "")
    level5   = struct.get("level5", "")   # building number in address
    detail   = struct.get("detail", "")
    level3   = struct.get("level3", "")

    # Precision: level5 means address-number-interpolated (accurate to tens of metres)
    if detail:
        precision = "BUILDING_LEVEL"
    elif level4LC:
        precision = "BUILDING_LEVEL"
    elif level5:
        precision = "ADDRESS_NUMBER_LEVEL"
    elif level4L:
        precision = "ROAD_LEVEL"
    else:
        precision = "ADMIN_LEVEL"

    nav_ready = precision in ("BUILDING_LEVEL", "ADDRESS_NUMBER_LEVEL")

    return {
        "lat": lat, "lng": lng,
        "precision": precision,
        "nav_ready": nav_ready,
        "refined_text": refined.get("text", ""),
        "level3": level3,
        "level4L": level4L,
        "level4LC": level4LC,
        "level5": level5,
        "detail": detail,
    }


def main():
    print("=== TASK-GYEONGJU-FOOD-105-COORDINATES-FINAL-NAV-READY-V1 :: Fix Script ===\n")

    vg_recs  = load_jsonl(VG_RAW)
    svc_recs = load_jsonl(SVC_FILE)
    v1_recs  = load_jsonl(V1_COORDS)
    ka_recs  = load_jsonl(KAKAO_VAL_RAW)
    fa_recs  = load_jsonl(COORD_FINAL_RAW)

    vg_map  = {r["vg_id"]: r for r in vg_recs}
    svc_map = {r["vg_id"]: r for r in svc_recs}
    ka_map  = {r["vg_id"]: r for r in ka_recs}

    # Build Phase A and Phase B maps from coord-final-raw
    phase_a_map = {}
    phase_b_map = {}
    for r in fa_recs:
        vid = r["vg_id"]
        ph  = r.get("phase", "?")
        if ph == "A" and r.get("lat"):
            phase_a_map[vid] = r
        elif ph == "B":
            phase_b_map[vid] = r

    # ------- FIX-2: 아화전통국수 보문점 wrong Kakao entity -------
    AHWA_TITLE = "아화전통국수 보문점"
    ahwa_vg_id = None
    for vid, r in phase_a_map.items():
        if r.get("ko_title", "") == AHWA_TITLE:
            ahwa_vg_id = vid
            break

    if ahwa_vg_id:
        bad_lat = phase_a_map[ahwa_vg_id].get("lat", 0)
        print(f"FIX-2: {AHWA_TITLE} vg_id={ahwa_vg_id}")
        print(f"  Removing wrong Kakao entity lat={bad_lat:.5f} (19.7km delta)")
        del phase_a_map[ahwa_vg_id]

        vg      = vg_map.get(ahwa_vg_id, {})
        addr_raw = vg.get("ko", {}).get("address", "경주시 북군길 25")
        addr_norm = normalize_addr(addr_raw, AHWA_TITLE)
        print(f"  VWorld query: {addr_norm!r}")
        vw = vworld_geocode_full(addr_norm)
        time.sleep(1.2)
        if vw:
            print(f"  VWorld: lat={vw['lat']:.5f} lng={vw['lng']:.5f} "
                  f"precision={vw['precision']} level5={vw['level5']!r} "
                  f"nav={vw['nav_ready']}")
            phase_b_map[ahwa_vg_id] = {
                "vg_id": ahwa_vg_id,
                "ko_title": AHWA_TITLE,
                "address_ko": addr_raw,
                "phase": "B_FIX2",
                "coordinate_source": "VWORLD_EXACT_ADDRESS",
                "lat": vw["lat"], "lng": vw["lng"],
                "vworld_precision": vw["precision"],
                "vworld_level5": vw["level5"],
                "vworld_refined_text": vw["refined_text"],
                "nav_ready": vw["nav_ready"],
                "resolution": f"VWORLD_{vw['precision']}",
            }
        else:
            print(f"  VWorld FAILED — will remain unresolved")
    print()

    # ------- FIX-1: Re-query VWorld for Phase B records (level5 precision) -------
    REVIEW_TITLES = {
        "토함민속식당", "맷돌순두부", "소솜당", "반다99", "난식당1974",
        "교동쌈밥경주", "빛꾸리", "TAK!", "에이프레임익스프레스", "데네브",
    }
    print("FIX-1: Re-checking VWorld precision for Phase B records (level5 check)...")
    for vid, rec in list(phase_b_map.items()):
        title = rec.get("ko_title", "")
        if title not in REVIEW_TITLES:
            continue
        if rec.get("phase") == "B_FIX2":
            # Already queried above for ahwa; skip if title matches
            print(f"  {title}: already processed (FIX-2)")
            continue
        addr_raw  = rec.get("address_ko", "")
        addr_norm = normalize_addr(addr_raw, title)

        vw = vworld_geocode_full(addr_norm)
        time.sleep(1.2)
        if vw:
            old_nav = rec.get("nav_ready", False)
            phase_b_map[vid] = {
                **rec,
                "lat": vw["lat"], "lng": vw["lng"],
                "vworld_precision": vw["precision"],
                "vworld_level5": vw["level5"],
                "vworld_refined_text": vw["refined_text"],
                "nav_ready": vw["nav_ready"],
                "resolution": f"VWORLD_{vw['precision']}",
            }
            tag = "UPGRADED" if (not old_nav and vw["nav_ready"]) else "same"
            print(f"  {title}: {vw['precision']} level5={vw['level5']!r} "
                  f"nav={vw['nav_ready']} [{tag}]")
        else:
            print(f"  {title}: VWorld FAILED — keeping original nav={rec.get('nav_ready')}")
    print()

    # ------- Phase D: Final coordinate selection -------
    print("Phase D: Building final coordinate table for 105 records...")
    AS_OF = datetime.now(timezone.utc).date().isoformat()
    coord_rows = []
    stats = {
        "entity_exact": 0, "address_number": 0, "address_exact": 0,
        "review": 0, "nav_ready": 0,
    }

    for vg in vg_recs:
        vid      = vg["vg_id"]
        svc      = svc_map.get(vid, {})
        ko       = vg.get("ko", {})
        title_ko = ko.get("title", "")
        addr_ko  = ko.get("address", "")

        pa = phase_a_map.get(vid)
        pb = phase_b_map.get(vid)
        pv = ka_map.get(vid)   # Phase C: original 71 Kakao validated

        row = {
            "vg_id": vid,
            "replacement_candidate_id": svc.get("replacement_candidate_id", ""),
            "title_ko": title_ko,
            "address_ko": addr_ko,
            "as_of": AS_OF,
        }

        if pv and (pv.get("page_lat") or pv.get("v1_lat")):
            # Phase C: original Kakao entity (71 records), validated in Phase C
            # Use page_lat if present (re-extracted from Place page), else v1_lat
            use_lat = pv.get("page_lat") or pv.get("v1_lat")
            use_lng = pv.get("page_lng") or pv.get("v1_lng")
            row.update({
                "lat": use_lat,
                "lng": use_lng,
                "coordinate_source": "KAKAO_PLACE",
                "coordinate_quality": "ENTITY_EXACT",
                "kakao_place_id": pv.get("kakao_place_id", ""),
                "kakao_entity_match": pv.get("entity_match", ""),
                "source_page_url": f"https://place.map.kakao.com/{pv.get('kakao_place_id','')}",
                "nav_ready": True,
                "provenance": "VISITGYEONGJU_KAKAO_OFFICIAL",
            })
            stats["entity_exact"] += 1

        elif pa and pa.get("lat"):
            # Phase A: new kko hId Kakao (24 records)
            row.update({
                "lat": pa["lat"],
                "lng": pa["lng"],
                "coordinate_source": "KAKAO_PLACE",
                "coordinate_quality": "ENTITY_EXACT",
                "kakao_place_id": pa.get("kakao_place_id", ""),
                "source_page_url": pa.get("source_url", ""),
                "nav_ready": True,
                "provenance": "VISITGYEONGJU_KKO_KAKAO",
            })
            stats["entity_exact"] += 1

        elif pb and pb.get("lat"):
            # Phase B: VWorld geocode (10 records + ahwa fix)
            prec = pb.get("vworld_precision", pb.get("resolution", "?"))
            if prec in ("BUILDING_LEVEL", "LOT_LEVEL"):
                quality = "ADDRESS_EXACT"
                nav     = True
                stats["address_exact"] += 1
            elif prec == "ADDRESS_NUMBER_LEVEL":
                quality = "ADDRESS_NUMBER_LEVEL"
                nav     = True
                stats["address_number"] += 1
            else:
                quality = "REVIEW_REQUIRED"
                nav     = False
                stats["review"] += 1

            row.update({
                "lat": pb["lat"],
                "lng": pb["lng"],
                "coordinate_source": "VWORLD_EXACT_ADDRESS",
                "coordinate_quality": quality,
                "vworld_precision": prec,
                "vworld_level5": pb.get("vworld_level5", ""),
                "vworld_refined_text": pb.get("vworld_refined_text", ""),
                "nav_ready": nav,
                "provenance": "VWORLD_ADDRESS_GEOCODE",
            })

        else:
            row.update({
                "lat": None, "lng": None,
                "coordinate_source": "UNRESOLVED",
                "coordinate_quality": "UNRESOLVED",
                "nav_ready": False,
                "provenance": "NONE",
            })
            stats["review"] += 1

        if row.get("nav_ready"):
            stats["nav_ready"] += 1

        # Bounds check
        lat, lng = row.get("lat"), row.get("lng")
        if lat is not None and lng is not None:
            if not (LAT_MIN <= lat <= LAT_MAX and LNG_MIN <= lng <= LNG_MAX):
                print(f"  BOUNDS FAIL: {title_ko} lat={lat} lng={lng}")

        coord_rows.append(row)

    print(f"\n  ENTITY_EXACT:         {stats['entity_exact']}/105")
    print(f"  ADDRESS_NUMBER_LEVEL: {stats['address_number']}/105")
    print(f"  ADDRESS_EXACT:        {stats['address_exact']}/105")
    print(f"  REVIEW_REQUIRED:      {stats['review']}/105")
    print(f"  NAV_READY:            {stats['nav_ready']}/105")

    # Write V2
    with open(OUT_V2, "w", encoding="utf-8") as f:
        for row in coord_rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(f"\nWrote {OUT_V2.name} ({len(coord_rows)} rows)")

    # Duplicate check
    print("\n=== Duplicate coordinate check ===")
    coord_counts = {}
    for row in coord_rows:
        lat, lng = row.get("lat"), row.get("lng")
        if lat and lng:
            key = (round(lat, 4), round(lng, 4))
            coord_counts.setdefault(key, []).append(row["title_ko"])
    dups = {k: v for k, v in coord_counts.items() if len(v) > 1}
    if dups:
        for k, titles in dups.items():
            addrs = [r["address_ko"] for r in coord_rows if r["title_ko"] in titles]
            print(f"  DUPLICATE {k}: {titles}  addrs={addrs}")
    else:
        print("  No duplicates")

    # Outlier check
    GJ_LAT, GJ_LNG = 35.8397, 129.2155
    print("\n=== Outlier check (>25km from 경주 중심) ===")
    found_outlier = False
    for row in coord_rows:
        lat, lng = row.get("lat"), row.get("lng")
        if lat and lng:
            d = haversine(lat, lng, GJ_LAT, GJ_LNG)
            if d > 25000:
                print(f"  OUTLIER: {row['title_ko']} lat={lat:.5f} lng={lng:.5f} dist={d/1000:.1f}km")
                found_outlier = True
    if not found_outlier:
        print("  No outliers")

    # 12 sample spot checks
    print("\n=== Sample spot checks (12 records) ===")
    sample_titles = [
        "고도벌 한정식", "황리화덕가", "서민식당", "진가네대구갈비",
        "토함민속식당", "소솜당", "TAK!", "에이프레임익스프레스",
        "교동쌈밥경주", "데네브", "아화전통국수 보문점", "맷돌순두부",
    ]
    for row in coord_rows:
        if row["title_ko"] in sample_titles:
            quality = row.get("coordinate_quality", "?")
            lat, lng = row.get("lat"), row.get("lng")
            nav = row.get("nav_ready", False)
            level5 = row.get("vworld_level5", "")
            print(f"  {row['title_ko']:20s}: quality={quality:22s} lat={lat} lng={lng} nav={nav} L5={level5!r}")

    # Build QA
    nav_ok = stats["nav_ready"]
    qa = {
        "task": "TASK-GYEONGJU-FOOD-105-COORDINATES-FINAL-NAV-READY-V1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "version": "v2",
        "coordinate_stats": {
            "total_records": len(coord_rows),
            "unique_vg_id": len({r["vg_id"] for r in coord_rows}),
            "ENTITY_EXACT":          stats["entity_exact"],
            "ADDRESS_NUMBER_LEVEL":  stats["address_number"],
            "ADDRESS_EXACT":         stats["address_exact"],
            "REVIEW_REQUIRED":       stats["review"],
            "NAV_READY":             nav_ok,
            "NAV_READY_PCT":         round(100 * nav_ok / len(coord_rows), 1),
        },
        "assertions": {
            "rows_eq_105":           len(coord_rows) == 105,
            "unique_vg_id_eq_105":   len({r["vg_id"] for r in coord_rows}) == 105,
            "no_outside_gyeongju":   all(
                LAT_MIN <= (r.get("lat") or 0) <= LAT_MAX
                and LNG_MIN <= (r.get("lng") or 0) <= LNG_MAX
                for r in coord_rows if r.get("lat")
            ),
            "nav_ready_105":         nav_ok == 105,
            "no_duplicates":         len(dups) == 0,
        },
        "duplicate_count": len(dups),
        "duplicate_details": {str(k): v for k, v in dups.items()},
        "qa_result": (
            "PASS" if (len(coord_rows) == 105 and nav_ok == 105)
            else "HOLD"
        ),
        "hold_reason": "" if nav_ok == 105 else f"NAV_READY={nav_ok}/105",
        "fix_applied": ["FIX-1:VWorld_level5_precision", "FIX-2:Ahwa_wrong_Kakao_entity"],
    }
    with open(OUT_QA, "w", encoding="utf-8") as f:
        json.dump(qa, f, ensure_ascii=False, indent=2)
    print(f"\nWrote {OUT_QA.name}")

    # Manifest
    manifest = {
        "task": "TASK-GYEONGJU-FOOD-105-COORDINATES-FINAL-NAV-READY-V1",
        "branch": "data/gyeongju-food-105-coordinates-final-v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "base_branch": "data/gyeongju-food-105-media-nav-completion-v1",
        "base_commit": "323142e",
        "total_records": 105,
        "ENTITY_EXACT":          stats["entity_exact"],
        "ADDRESS_NUMBER_LEVEL":  stats["address_number"],
        "ADDRESS_EXACT":         stats["address_exact"],
        "REVIEW_REQUIRED":       stats["review"],
        "NAV_READY":             nav_ok,
        "identity": {
            "food_universe_changed":    0,
            "multilingual_changed":     0,
            "attraction_changed":       0,
        },
        "qa_result": qa["qa_result"],
        "fix_applied": ["FIX-1:VWorld_level5_precision", "FIX-2:Ahwa_wrong_Kakao_entity"],
        "vworld_precision_note": (
            "level5 != '' => ADDRESS_NUMBER_LEVEL (address-number-interpolated, nav_ready). "
            "level4LC != '' => BUILDING_LEVEL. detail != '' => BUILDING_LEVEL."
        ),
    }
    with open(OUT_MANIFEST, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print(f"Wrote {OUT_MANIFEST.name}")

    print(f"\n{'='*60}")
    print(f"FINAL: ENTITY_EXACT={stats['entity_exact']} "
          f"ADDR_NUMBER={stats['address_number']} "
          f"REVIEW={stats['review']}")
    print(f"       NAV_READY={nav_ok}/105  QA={qa['qa_result']}")
    if qa["hold_reason"]:
        print(f"       HOLD_REASON: {qa['hold_reason']}")


if __name__ == "__main__":
    main()
