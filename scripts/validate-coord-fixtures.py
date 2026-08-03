"""
좌표 자동검증 회귀 테스트 (schema-independent §N)
대상: busan-regression-fixtures-v1.json의 auto_testable 케이스
"""
import json
from pathlib import Path

ROOT = Path(__file__).parent.parent
FIXTURE_FILE = ROOT / "data/tourapi/validation/busan-regression-fixtures-v1.json"
ENRICHED_FILE = ROOT / "data/tourapi/enriched/busan/busan-enriched-candidates-v1.jsonl"

BUSAN_LAT_MIN, BUSAN_LAT_MAX = 34.88, 35.39
BUSAN_LNG_MIN, BUSAN_LNG_MAX = 128.74, 129.31


def detect_coord_error(lat, lng):
    """§N 규칙 적용 — 좌표 오류 탐지"""
    if lat is None or lng is None:
        return "coord_null"
    try:
        lat, lng = float(lat), float(lng)
    except (TypeError, ValueError):
        return "coord_parse_fail"
    if lat == 0.0 and lng == 0.0:
        return "coord_zero"
    if lat == lng:
        return "duplicate_coordinate_value"
    if (30 <= lng <= 40) and (125 <= lat <= 132):
        return "lat_lng_swapped"
    if not (BUSAN_LAT_MIN <= lat <= BUSAN_LAT_MAX) or not (BUSAN_LNG_MIN <= lng <= BUSAN_LNG_MAX):
        return "out_of_busan_bounds"
    return None


def run_tests():
    fixtures = json.loads(FIXTURE_FILE.read_text(encoding="utf-8"))

    enriched_sha = fixtures.get("enriched_candidates_sha256", "")
    print(f"Fixture set: {fixtures['fixture_set_id']}")
    print(f"Expected enriched SHA: {enriched_sha[:16]}...")

    auto_cases = [f for f in fixtures["fixtures"] if f.get("auto_testable")]
    print(f"\nAuto-testable cases: {len(auto_cases)}")

    passed, failed = 0, 0

    for case in auto_cases:
        fid = case["fixture_id"]
        inp = case["input"]
        expected_type = case.get("detection_rule", "")

        lat = inp.get("source_lat")
        lng = inp.get("source_lng")
        error_type = detect_coord_error(lat, lng)

        # Expected error type from fixture
        expected_error = (
            "duplicate_coordinate_value" if "duplicate" in case.get("expected_decision", "")
            else "out_of_busan_bounds" if "bounds" in case.get("expected_decision", "")
            else None
        )

        ok = (error_type == expected_error)
        status = "PASS" if ok else "FAIL"
        if ok:
            passed += 1
        else:
            failed += 1

        print(f"\n  [{status}] {fid}: {case['name']}")
        print(f"    input: lat={lat}, lng={lng}")
        print(f"    detected: {error_type}")
        print(f"    expected: {expected_error}")
        if not ok:
            print(f"    FAIL: detection mismatch")
            print(f"    expected_decision: {case.get('expected_decision','')}")

    # Also verify against actual enriched file (arrival_assessment)
    print("\n--- Verifying against enriched candidates (arrival_assessment) ---")
    target_ids = {c["candidate_id"] for c in auto_cases if "candidate_id" in c}
    found = {}
    with open(ENRICHED_FILE, encoding="utf-8") as f:
        for line in f:
            rec = json.loads(line)
            cid = rec.get("candidate_id", "")
            if cid in target_ids:
                aa = rec.get("arrival_assessment", {})
                found[cid] = {
                    "status": aa.get("status"),
                    "source_lat": aa.get("source_lat"),
                    "source_lng": aa.get("source_lng"),
                    "lat": rec.get("lat"),
                    "lng": rec.get("lng")
                }

    for case in auto_cases:
        cid = case.get("candidate_id")
        if cid not in found:
            print(f"  [SKIP] {cid}: not found in enriched file")
            continue
        rec = found[cid]
        actual_status = rec["status"]
        expected_status = "invalid_source_coordinates"
        actual_lat = rec["source_lat"]
        actual_lng = rec["source_lng"]
        expected_lat = case["input"]["source_lat"]
        expected_lng = case["input"]["source_lng"]

        coord_match = (actual_lat == expected_lat and actual_lng == expected_lng)
        status_ok = (actual_status == expected_status)
        ok = coord_match and status_ok

        status_str = "PASS" if ok else "FAIL"
        print(f"  [{status_str}] {cid}")
        print(f"    enriched status: {actual_status} (expected: {expected_status})")
        print(f"    enriched lat={actual_lat}, lng={actual_lng}")
        if not coord_match:
            print(f"    WARN: coordinate mismatch — fixture uses {expected_lat},{expected_lng}")
        if not status_ok:
            print(f"    FAIL: status mismatch")
            failed += 1
        else:
            if not coord_match:
                print(f"    WARN: coordinate mismatch but status check passed")

    total = passed + failed
    print(f"\n=== Result: {passed}/{total} PASS, {failed}/{total} FAIL ===")
    if failed > 0:
        print("VERDICT: FAIL")
        return 1
    print("VERDICT: PASS")
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(run_tests())
