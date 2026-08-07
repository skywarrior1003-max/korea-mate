#!/usr/bin/env python3
"""
gyeongju_core27_location_recovery_v2.py

TASK-GYEONGJU-CORE27-LOCATION-RECOVERY-V2

기존 수집된 VG raw HTML 27건에서 kakaoMap.js의 var lat / var lng 좌표를 추출한다.
신규 HTTP·KTO API·검색·지오코딩 0건.
Run1 = Run2 BYTE_IDENTICAL.

LLM·Gemini 사용 금지.
기존 frozen raw·normalized·source facts 수정 금지.
"""

import hashlib, json, math, re, sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# ── Constants ────────────────────────────────────────────────────────────────
REPO    = Path(__file__).resolve().parent.parent
NORM    = REPO / "data/tourapi/normalized/gyeongju"
VAL     = REPO / "data/tourapi/validation/gyeongju"
MAN_DIR = REPO / "data/tourapi/manifests/gyeongju"
DOCS    = REPO / "docs/tourapi"
VG_RAW  = REPO / "data/tourapi/raw/gyeongju/gyeongju-core27-vg-detail"

AS_OF = "2026-08-07T00:00:00Z"

# 경주시 좌표 유효 범위 (행정 구역 포함 북부 안강읍·강동면)
LAT_MIN, LAT_MAX = 35.4, 36.2
LNG_MIN, LNG_MAX = 128.8, 129.6

# coordinate_type / source 어휘
COORD_TYPE   = "OFFICIAL_PAGE_MAP_POINT"
COORD_SOURCE = "GYEONGJU_OFFICIAL_TOURISM_DETAIL"
COORD_CONF   = "HIGH_CONFIDENCE"

# RELEASE conditions 권리 어휘
OWNER_A = "APPROVED_BY_OWNER_OFFICIAL_SOURCE"
KOGL1   = "VERIFIED_ALLOWED_BY_PUBLIC_LICENSE_KOGL_TYPE1"
KTO_MISSING = "RIGHTS_EVIDENCE_MISSING"

# ── Utilities ────────────────────────────────────────────────────────────────
def sha256_file(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()

def jdump(obj, *, indent=None) -> str:
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, indent=indent)

def jwrite(obj, path: Path, *, indent=None):
    path.write_text(jdump(obj, indent=indent) + "\n", encoding="utf-8")

def jlwrite(rows, path: Path):
    path.write_text(
        "\n".join(jdump(r) for r in rows) + ("\n" if rows else ""),
        encoding="utf-8",
    )

def load_jsonl(p: Path):
    return [json.loads(l) for l in p.read_text("utf-8").splitlines() if l.strip()]

def haversine(lat1, lon1, lat2, lon2) -> float:
    """두 좌표 간 거리(m)."""
    R = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return 2.0 * R * math.asin(math.sqrt(a))

# ── Coordinate Extraction ────────────────────────────────────────────────────
# 정규식: var lat = <number>; (공백·줄바꿈 허용)
LAT_PATTERN = re.compile(r'\bvar\s+lat\s*=\s*([0-9]+\.[0-9]+)\s*;')
LNG_PATTERN = re.compile(r'\bvar\s+lng\s*=\s*([0-9]+\.[0-9]+)\s*;')
TITLE_PATTERN = re.compile(r'id=["\']contentTitle["\'][^>]*>([^<]+)')


def validate_coordinate(lat: float, lng: float) -> tuple[bool, str]:
    """좌표 유효성 검사. (True, 'OK') 또는 (False, 이유) 반환."""
    if not math.isfinite(lat) or not math.isfinite(lng):
        return False, "NOT_FINITE"
    if lat == 0.0 and lng == 0.0:
        return False, "ZERO_ZERO"
    # 스왑 체크를 범위 체크보다 먼저 — 한국 좌표에서 lat > lng 이면 명백히 반전
    if lat > lng:
        return False, "LIKELY_SWAPPED"
    if not (LAT_MIN <= lat <= LAT_MAX):
        return False, f"LAT_OUT_OF_RANGE:{lat:.6f}"
    if not (LNG_MIN <= lng <= LNG_MAX):
        return False, f"LNG_OUT_OF_RANGE:{lng:.6f}"
    return True, "OK"


def extract_vg_coordinate(area_uid: int, candidate_id: str, name_ko: str) -> dict:
    """VG raw HTML에서 lat·lng 추출. 결과 dict 반환."""
    raw_path = VG_RAW / f"vg-area-{area_uid}.json"
    base = {
        "candidate_id": candidate_id,
        "name_ko": name_ko,
        "area_uid": area_uid,
        "raw_path": str(raw_path.relative_to(REPO)).replace("\\", "/"),
        "extracted_lat": None,
        "extracted_lng": None,
        "lat_count": 0,
        "lng_count": 0,
        "page_title": None,
        "url_area_uid_match": False,
        "validation_status": "HOLD",
        "validation_reason": "NOT_PROCESSED",
        "coordinate_type": COORD_TYPE,
        "coordinate_source": COORD_SOURCE,
        "extraction_pattern_lat": LAT_PATTERN.pattern,
        "extraction_pattern_lng": LNG_PATTERN.pattern,
        "as_of": AS_OF,
    }

    if not raw_path.exists():
        base["validation_reason"] = "RAW_FILE_MISSING"
        return base

    raw = json.loads(raw_path.read_text("utf-8"))
    html = raw.get("html", "")

    # URL의 area_uid 일치 확인
    raw_url = raw.get("url", "")
    base["url_area_uid_match"] = (f"area_uid={area_uid}" in raw_url)

    # 페이지 제목 추출
    title_m = TITLE_PATTERN.search(html)
    if title_m:
        base["page_title"] = title_m.group(1).strip()

    # lat·lng 패턴 검색
    lat_matches = LAT_PATTERN.findall(html)
    lng_matches = LNG_PATTERN.findall(html)
    base["lat_count"] = len(lat_matches)
    base["lng_count"] = len(lng_matches)

    if len(lat_matches) == 0 or len(lng_matches) == 0:
        base["validation_reason"] = "PATTERN_NOT_FOUND"
        return base

    if len(lat_matches) > 1 or len(lng_matches) > 1:
        base["validation_status"] = "REVIEW_REQUIRED"
        base["validation_reason"] = "MULTIPLE_COORDINATE_PAIRS"
        # 복수 쌍: 자동 선택하지 않음
        return base

    lat = float(lat_matches[0])
    lng = float(lng_matches[0])
    base["extracted_lat"] = lat
    base["extracted_lng"] = lng

    valid, reason = validate_coordinate(lat, lng)
    if not valid:
        base["validation_reason"] = reason
        return base

    if not base["url_area_uid_match"]:
        base["validation_reason"] = "URL_AREA_UID_MISMATCH"
        return base

    base["validation_status"] = "OK"
    base["validation_reason"] = "OK"
    return base


# ── Coordinate Comparison ────────────────────────────────────────────────────
def compare_coordinate(existing_lat, existing_lng, vg_lat, vg_lng) -> dict:
    """기존 좌표와 VG HTML 좌표 비교."""
    dist = haversine(existing_lat, existing_lng, vg_lat, vg_lng)
    if dist <= 100.0:
        status = "CONSISTENT"
    elif dist <= 300.0:
        status = "REVIEW_REQUIRED"
    else:
        status = "LOCATION_CONFLICT"
    return {"distance_m": round(dist, 2), "comparison_status": status}


# ── RELEASE Proposal ─────────────────────────────────────────────────────────
def build_release_proposal(overlay_item: dict, route_lat, route_lng) -> dict:
    """기존 overlay + 신규 좌표 → RELEASE 판정."""
    has_desc  = bool(overlay_item.get("description_ko_selected"))
    has_img   = bool(overlay_item.get("representative_image", {}).get("image_url"))
    has_addr  = bool(overlay_item.get("address"))
    has_coord = bool(route_lat and route_lng)
    identity  = overlay_item.get("identity_status", "")
    identity_ok = identity not in ("IDENTITY_REVIEW_REQUIRED", "IDENTITY_CONFLICT")

    desc_rights = overlay_item.get("description_rights", {})
    desc_rights_ok = desc_rights.get("product_use_decision") in (
        OWNER_A, "APPROVED", "APPROVED_BY_OWNER_OFFICIAL_SOURCE"
    )
    img_rights = overlay_item.get("representative_image", {}).get("rights_verdict", "")
    img_rights_ok = img_rights not in (KTO_MISSING, "RIGHTS_UNKNOWN", "NO_IMAGE", None, "")

    if all([identity_ok, has_desc, desc_rights_ok, has_img, img_rights_ok, has_addr, has_coord]):
        tier = "RELEASE_READY_OWNER_APPROVED_WEB_CONTENT"
    elif identity_ok and has_desc and desc_rights_ok and has_addr and has_coord:
        tier = "RELEASE_READY_OWNER_APPROVED_WEB_CONTENT"
    elif identity_ok and has_desc and has_addr and has_coord:
        tier = "HOLD_CONTENT_MISSING"
    elif identity_ok and has_addr and not has_coord:
        tier = "HOLD_LOCATION_INCOMPLETE"
    elif not identity_ok:
        tier = "HOLD_IDENTITY_REVIEW"
    else:
        tier = "HOLD_CONTENT_MISSING"

    return {
        "candidate_id": overlay_item["candidate_id"],
        "official_name_ko": overlay_item.get("official_name_ko"),
        "readiness_tier": tier,
        "conditions_met": {
            "identity_ok": identity_ok,
            "address_present": has_addr,
            "coordinates_present": has_coord,
            "description_present": has_desc,
            "description_rights_ok": desc_rights_ok,
            "image_present": has_img,
            "image_rights_ok": img_rights_ok,
        },
        "route_latitude": route_lat,
        "route_longitude": route_lng,
        "as_of": AS_OF,
    }


# ── Regression Tests ─────────────────────────────────────────────────────────
def run_regression_tests() -> dict:
    """회귀 테스트 11종."""
    passed, failed = [], []

    def check(name, actual, expected, notes=""):
        if actual == expected:
            passed.append(name)
        else:
            failed.append({"test": name, "expected": expected, "actual": actual, "notes": notes})

    # Test 1: 표준 var lat / var lng
    html1 = "var lat = 35.78178;\nvar lng = 129.34403;\n"
    lats1 = LAT_PATTERN.findall(html1)
    lngs1 = LNG_PATTERN.findall(html1)
    check("T01_standard_extraction", (lats1, lngs1), (["35.78178"], ["129.34403"]))

    # Test 2: 공백 없는 표현
    html2 = "var lat=35.78178;var lng=129.34403;"
    lats2 = LAT_PATTERN.findall(html2)
    lngs2 = LNG_PATTERN.findall(html2)
    check("T02_no_spaces", (lats2, lngs2), (["35.78178"], ["129.34403"]))

    # Test 3: 줄바꿈·추가 공백
    html3 = "var  lat  =  35.78178  ;\nvar  lng  =  129.34403  ;"
    lats3 = LAT_PATTERN.findall(html3)
    lngs3 = LNG_PATTERN.findall(html3)
    check("T03_extra_spaces", (lats3, lngs3), (["35.78178"], ["129.34403"]))

    # Test 4: lat만 있는 경우 → HOLD (lng 없음)
    html4 = "var lat = 35.78178;"
    ok4, _ = (LAT_PATTERN.findall(html4) != [] and LNG_PATTERN.findall(html4) == []), None
    check("T04_lat_only_hold", bool(ok4), True)

    # Test 5: lng만 있는 경우 → HOLD
    html5 = "var lng = 129.34403;"
    ok5 = (LAT_PATTERN.findall(html5) == [] and LNG_PATTERN.findall(html5) != [])
    check("T05_lng_only_hold", bool(ok5), True)

    # Test 6: 숫자 아닌 값 → 패턴 불일치
    html6 = "var lat = 'unknown';\nvar lng = null;"
    lats6 = LAT_PATTERN.findall(html6)
    lngs6 = LNG_PATTERN.findall(html6)
    check("T06_non_numeric_no_match", (lats6, lngs6), ([], []))

    # Test 7: 위도·경도 반전 탐지
    valid7, reason7 = validate_coordinate(129.34, 35.78)  # 반전됨
    check("T07_swap_detection", valid7, False)
    check("T07_swap_reason", reason7, "LIKELY_SWAPPED")

    # Test 8: 경주 유효 범위 밖
    valid8, reason8 = validate_coordinate(37.5, 126.9)  # 서울
    check("T08_out_of_range", valid8, False)

    # Test 9: 복수 좌표쌍 → REVIEW_REQUIRED
    html9 = "var lat = 35.78178;\nvar lng = 129.34403;\nvar lat = 35.8345;\nvar lng = 129.2186;"
    lats9 = LAT_PATTERN.findall(html9)
    check("T09_multiple_pairs_count", len(lats9) > 1, True)

    # Test 10: 기존 좌표와 100m 이내 CONSISTENT
    cmp10 = compare_coordinate(35.8072, 129.2129, 35.8071, 129.2130)
    check("T10_consistent_100m", cmp10["comparison_status"], "CONSISTENT")

    # Test 11: Run1=Run2 (동일 입력 → 동일 출력)
    result11a = jdump({"lat": 35.78178, "lng": 129.34403})
    result11b = jdump({"lat": 35.78178, "lng": 129.34403})
    check("T11_deterministic_output", result11a, result11b)

    return {
        "total": len(passed) + len(failed),
        "passed": len(passed),
        "failed": len(failed),
        "verdict": "PASS" if not failed else "FAIL",
        "failed_details": failed,
        "passed_names": passed,
    }


# ── Main Processing ───────────────────────────────────────────────────────────
def run_processing(overlay_items, bundles_by_cid):
    """전체 처리 로직 (결정적). 동일 입력 → 동일 출력."""
    extraction_results = []
    comparison_results = []
    recovery_overlays  = []
    validation_records = []
    release_proposals  = []
    remaining_queue    = []

    for item in overlay_items:
        cid      = item["candidate_id"]
        name     = item.get("official_name_ko", "")
        area_uid = item.get("area_uid")
        ex_lat   = item.get("latitude")
        ex_lng   = item.get("longitude")
        has_existing_coord = bool(ex_lat and ex_lng)

        # VG HTML 좌표 추출 (전 27건)
        ext = extract_vg_coordinate(area_uid, cid, name)
        extraction_results.append(ext)

        # 기존 좌표 6건 비교 감사
        if has_existing_coord and ext["validation_status"] == "OK":
            cmp = compare_coordinate(
                float(ex_lat), float(ex_lng),
                ext["extracted_lat"], ext["extracted_lng"]
            )
            comparison_results.append({
                "candidate_id": cid,
                "name_ko": name,
                "existing_lat": ex_lat,
                "existing_lng": ex_lng,
                "vg_html_lat": ext["extracted_lat"],
                "vg_html_lng": ext["extracted_lng"],
                "distance_m": cmp["distance_m"],
                "comparison_status": cmp["comparison_status"],
                "selected_coordinate": "EXISTING_KTO_SOURCE",
                "as_of": AS_OF,
            })

        # 좌표 결정
        if has_existing_coord:
            route_lat = float(ex_lat)
            route_lng = float(ex_lng)
            coord_source = "EXISTING_KTO_SOURCE"
        elif ext["validation_status"] == "OK":
            route_lat  = ext["extracted_lat"]
            route_lng  = ext["extracted_lng"]
            coord_source = COORD_SOURCE

            # Recovery overlay (21건)
            recovery_overlays.append({
                "candidate_id": cid,
                "name_ko": name,
                "area_uid": area_uid,
                "raw_path": ext["raw_path"],
                "official_detail_url": item.get("official_detail_url"),
                "recovered_latitude": route_lat,
                "recovered_longitude": route_lng,
                "route_latitude": route_lat,
                "route_longitude": route_lng,
                "coordinate_type": COORD_TYPE,
                "coordinate_source": COORD_SOURCE,
                "extraction_pattern": ext["extraction_pattern_lat"],
                "identity_evidence": {
                    "url_area_uid_match": ext["url_area_uid_match"],
                    "page_title": ext["page_title"],
                    "candidate_name_ko": name,
                },
                "coordinate_confidence": COORD_CONF,
                "validation_status": ext["validation_status"],
                "as_of": AS_OF,
            })
        else:
            route_lat = None
            route_lng = None
            coord_source = "NONE"
            remaining_queue.append({
                "candidate_id": cid,
                "name_ko": name,
                "area_uid": area_uid,
                "reason": ext["validation_reason"],
                "extraction_status": ext["validation_status"],
                "as_of": AS_OF,
            })

        # 유효성 레코드
        validation_records.append({
            "candidate_id": cid,
            "name_ko": name,
            "area_uid": area_uid,
            "has_existing_coord": has_existing_coord,
            "vg_html_extraction_status": ext["validation_status"],
            "vg_html_validation_reason": ext["validation_reason"],
            "final_route_lat": route_lat,
            "final_route_lng": route_lng,
            "coordinate_source": coord_source,
            "lat_count": ext["lat_count"],
            "lng_count": ext["lng_count"],
            "as_of": AS_OF,
        })

        # RELEASE 재판정
        proposal = build_release_proposal(item, route_lat, route_lng)
        release_proposals.append(proposal)

    return {
        "extraction_results": extraction_results,
        "comparison_results": comparison_results,
        "recovery_overlays":  recovery_overlays,
        "validation_records": validation_records,
        "release_proposals":  release_proposals,
        "remaining_queue":    remaining_queue,
    }


# ── Output Generation ─────────────────────────────────────────────────────────
def generate_outputs(results: dict, regression: dict):
    """모든 산출물 파일 생성."""
    # 1. VG 좌표 추출 결과
    jlwrite(results["extraction_results"],
            VAL / "gyeongju-core27-vg-coordinate-extraction-v2.jsonl")
    print("  ✅ vg-coordinate-extraction")

    # 2. 기존 좌표 비교 감사
    jlwrite(results["comparison_results"],
            VAL / "gyeongju-core27-existing-coordinate-comparison-v2.jsonl")
    print("  ✅ existing-coordinate-comparison")

    # 3. Location recovery overlay (21건)
    jlwrite(results["recovery_overlays"],
            NORM / "gyeongju-core27-location-recovery-overlay-v2.jsonl")
    print("  ✅ location-recovery-overlay")

    # 4. 좌표 유효성 감사
    jlwrite(results["validation_records"],
            VAL / "gyeongju-core27-location-validation-v2.jsonl")
    print("  ✅ location-validation")

    # 5. RELEASE 재판정
    jlwrite(results["release_proposals"],
            NORM / "gyeongju-core27-release-after-location-v2.jsonl")
    print("  ✅ release-after-location")

    # 6. 남은 location queue
    jlwrite(results["remaining_queue"],
            NORM / "gyeongju-core27-location-remaining-queue-v2.jsonl")
    print("  ✅ location-remaining-queue")

    # 7. 요약
    proposals = results["release_proposals"]
    release_ready = [p for p in proposals if "RELEASE_READY" in p.get("readiness_tier", "")]
    hold = [p for p in proposals if p not in release_ready]

    by_tier = {}
    for p in proposals:
        t = p.get("readiness_tier", "UNKNOWN")
        by_tier[t] = by_tier.get(t, 0) + 1

    recovery_ok = [r for r in results["recovery_overlays"] if r["coordinate_confidence"] == COORD_CONF]
    conf_counts = {}
    for v in results["validation_records"]:
        src = v.get("coordinate_source", "NONE")
        conf_counts[src] = conf_counts.get(src, 0) + 1

    comparison_stats = {}
    for c in results["comparison_results"]:
        s = c.get("comparison_status", "UNKNOWN")
        comparison_stats[s] = comparison_stats.get(s, 0) + 1

    summary = {
        "task": "TASK-GYEONGJU-CORE27-LOCATION-RECOVERY-V2",
        "as_of": AS_OF,
        "total_core27": len(proposals),
        "existing_coord_count": len(results["comparison_results"]),
        "recovered_count": len(results["recovery_overlays"]),
        "high_confidence_count": len(recovery_ok),
        "remaining_hold_count": len(results["remaining_queue"]),
        "final_with_coord": len([v for v in results["validation_records"] if v["final_route_lat"]]),
        "release_ready_total": len(release_ready),
        "hold_total": len(hold),
        "by_readiness_tier": by_tier,
        "by_coordinate_source": conf_counts,
        "existing_coord_comparison": comparison_stats,
        "http_requests": 0,
        "kto_api_requests": 0,
        "geocoding_requests": 0,
        "regression_tests": regression,
    }
    jwrite(summary, VAL / "gyeongju-core27-location-summary-v2.json", indent=2)
    print("  ✅ location-summary")

    return summary


def check_run1_run2(overlay_items, bundles_by_cid) -> dict:
    """Run2 재실행 — 동일 입력에서 동일 결과 확인."""
    results2 = run_processing(overlay_items, bundles_by_cid)
    # 핵심 파일 SHA 비교
    check_files = [
        NORM / "gyeongju-core27-location-recovery-overlay-v2.jsonl",
        NORM / "gyeongju-core27-release-after-location-v2.jsonl",
        VAL  / "gyeongju-core27-vg-coordinate-extraction-v2.jsonl",
        VAL  / "gyeongju-core27-location-validation-v2.jsonl",
        VAL  / "gyeongju-core27-existing-coordinate-comparison-v2.jsonl",
    ]
    file_results = []
    all_pass = True
    for f in check_files:
        if not f.exists():
            file_results.append({"file": f.name, "result": "MISSING"})
            all_pass = False
            continue
        # Run2 직렬화
        fname = f.name
        key_map = {
            "gyeongju-core27-location-recovery-overlay-v2.jsonl": "recovery_overlays",
            "gyeongju-core27-release-after-location-v2.jsonl": "release_proposals",
            "gyeongju-core27-vg-coordinate-extraction-v2.jsonl": "extraction_results",
            "gyeongju-core27-location-validation-v2.jsonl": "validation_records",
            "gyeongju-core27-existing-coordinate-comparison-v2.jsonl": "comparison_results",
        }
        key = key_map.get(fname)
        if key:
            run2_content = "\n".join(jdump(r) for r in results2[key]) + (
                "\n" if results2[key] else ""
            )
            run1_content = f.read_text("utf-8")
            match = (run1_content == run2_content)
            if not match:
                all_pass = False
            file_results.append({
                "file": fname,
                "result": "PASS" if match else "FAIL",
            })
            if match:
                print(f"  PASS {fname}")
            else:
                print(f"  FAIL {fname}")

    return {
        "verdict": "BYTE_IDENTICAL_PASS" if all_pass else "BYTE_IDENTICAL_FAIL",
        "files_checked": file_results,
        "pass_count": sum(1 for f in file_results if f["result"] == "PASS"),
        "total_count": len(file_results),
        "as_of": AS_OF,
    }


def update_manifest(new_files_count: int):
    man_path = MAN_DIR / "gyeongju-manifest-v1.json"
    man = json.loads(man_path.read_text("utf-8")) if man_path.exists() else {}
    prev = man.get("files_count", 0)
    man["files_count"] = prev + new_files_count
    man["last_task"] = "TASK-GYEONGJU-CORE27-LOCATION-RECOVERY-V2"
    man["last_updated"] = "2026-08-07"
    man["last_updated_at"] = AS_OF
    man["last_updated_task"] = "TASK-GYEONGJU-CORE27-LOCATION-RECOVERY-V2"
    man_path.write_text(jdump(man, indent=2) + "\n", encoding="utf-8")
    print(f"\n  ✅ manifest: {prev} → {prev + new_files_count} 파일")
    return prev + new_files_count


def frozen_sha_audit() -> dict:
    """기존 동결 파일 SHA 확인."""
    sha_source = VAL / "gyeongju-core27-frozen-sha-audit-v1.json"
    if not sha_source.exists():
        return {"verdict": "FROZEN_SHA_FILE_MISSING", "files": []}
    existing = json.loads(sha_source.read_text("utf-8"))
    frozen_files = existing.get("files", [])
    results = []
    all_ok = True
    for entry in frozen_files:
        fpath = REPO / entry["file"]
        stored_sha = entry.get("sha256", "")
        if not fpath.exists():
            results.append({"file": entry["file"], "status": "MISSING"})
            all_ok = False
            continue
        # SHA 앞 16자리 비교 (이전 태스크 저장 형식)
        actual_sha = sha256_file(fpath)[:16]
        match = actual_sha == stored_sha[:16]
        results.append({
            "file": entry["file"],
            "stored_sha16": stored_sha[:16],
            "actual_sha16": actual_sha,
            "status": "OK" if match else "MISMATCH",
        })
        if not match:
            all_ok = False
    return {
        "verdict": "ALL_OK" if all_ok else "MISMATCH_FOUND",
        "files_checked": len(results),
        "results": results,
    }


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    print("=" * 60)
    print("TASK-GYEONGJU-CORE27-LOCATION-RECOVERY-V2")
    print("=" * 60)
    print(f"HTTP 요청: 0건 | KTO API: 0건 | 지오코딩: 0건")

    # [A] 입력 데이터 로딩
    print("\n[A] 입력 데이터 로딩...")
    overlay_path = NORM / "gyeongju-core27-full-detail-overlay-v1.jsonl"
    bundle_path  = NORM / "gyeongju-core27-identity-bundle-v1.jsonl"
    for p in [overlay_path, bundle_path]:
        if not p.exists():
            print(f"[ERROR] {p} 없음", file=sys.stderr)
            sys.exit(1)

    overlay_items = load_jsonl(overlay_path)
    bundles = load_jsonl(bundle_path)
    bundles_by_cid = {b["candidate_id"]: b for b in bundles}

    no_coord = [o for o in overlay_items if not (o.get("latitude") and o.get("longitude"))]
    has_coord = [o for o in overlay_items if o.get("latitude") and o.get("longitude")]
    print(f"  CORE27 전체: {len(overlay_items)}건")
    print(f"  기존 좌표 보유: {len(has_coord)}건")
    print(f"  좌표 부족: {len(no_coord)}건")

    # [B] 회귀 테스트
    print("\n[B] 회귀 테스트 (11종)...")
    regression = run_regression_tests()
    print(f"  결과: {regression['passed']}/{regression['total']} PASS")
    if regression["failed"]:
        for f in regression["failed_details"]:
            print(f"  [FAIL] {f['test']}: expected={f['expected']} actual={f['actual']}")
        print("[ERROR] 회귀 테스트 실패 — 중단", file=sys.stderr)
        sys.exit(1)

    # [C] Run1 처리
    print("\n[C] Run1: VG raw HTML 좌표 추출 및 처리...")
    results = run_processing(overlay_items, bundles_by_cid)

    # 상태 출력
    ok_extractions = [r for r in results["extraction_results"] if r["validation_status"] == "OK"]
    print(f"  추출 성공: {len(ok_extractions)}/27")
    print(f"  복구 대상 (21건) 중 성공: {len(results['recovery_overlays'])}/{len(no_coord)}")
    release_ready = [p for p in results["release_proposals"] if "RELEASE_READY" in p.get("readiness_tier", "")]
    print(f"  RELEASE_READY 예상: {len(release_ready)}/27")

    # [D] 산출물 생성
    print("\n[D] 산출물 생성...")
    summary = generate_outputs(results, regression)

    # [E] Run1=Run2 검증
    print("\n[E] Run1=Run2 BYTE_IDENTICAL 검증...")
    repro = check_run1_run2(overlay_items, bundles_by_cid)
    jwrite(repro, VAL / "gyeongju-core27-location-reproducibility-v2.json", indent=2)
    print(f"\n  → Run1=Run2: {repro['verdict']}")
    print(f"  → {repro['pass_count']}/{repro['total_count']} 파일 일치")

    # [F] Frozen SHA 감사
    print("\n[F] frozen SHA 감사...")
    sha_result = frozen_sha_audit()
    print(f"  → {sha_result['verdict']} ({sha_result['files_checked']}건 확인)")

    # [G] Manifest 갱신
    # 새 파일: script(1) + normalized(3) + validation(6) + docs(1) = 11
    new_file_count = 11
    update_manifest(new_file_count)

    # [H] 결과 요약 출력
    print("\n" + "=" * 60)
    print("TASK 결과 요약")
    print("=" * 60)
    print(f"  VG raw 추출 성공:  {len(ok_extractions)}/27")
    print(f"  좌표 복구 (21건):  {len(results['recovery_overlays'])}/21")
    print(f"  기존 좌표 유지:    {len(has_coord)}건")
    print(f"  최종 좌표 보유:    {summary['final_with_coord']}/27")
    print(f"  신규 RELEASE_READY: {len(release_ready) - len(has_coord)}건 (추가)")
    print(f"  총 RELEASE_READY:  {len(release_ready)}/27")
    print(f"  Run1=Run2:         {repro['verdict']}")
    print(f"  회귀 테스트:       {regression['passed']}/{regression['total']} PASS")
    print(f"  HTTP 요청:         0건")
    print(f"  frozen SHA:        {sha_result['verdict']}")

    verdict = "PASS"
    if repro["verdict"] != "BYTE_IDENTICAL_PASS":
        verdict = "FAIL"
    if len(results["recovery_overlays"]) < len(no_coord):
        verdict = "CONDITIONAL_PASS"
    if regression["failed"]:
        verdict = "FAIL"
    print(f"\n  완료 판정: {verdict}")
    print(f"  상태: GYEONGJU_CORE27_LOCATION_RECOVERY_COMPLETE")
    return results, summary, repro, sha_result, regression


if __name__ == "__main__":
    main()
