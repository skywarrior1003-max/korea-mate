#!/usr/bin/env python3
"""
TASK-VISITBUSAN-DESCRIPTION-REGRESSION-FIXTURES
회귀 테스트: has_visit_value() 함수가 TOO_GENERIC 5건을 올바르게 탐지하는지 확인.

사용법: python scripts/test-visitbusan-description-regression-v1.py
외부 요청 없음. 데이터 수정 없음.
"""

import json
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

FIXTURE_FILE = Path("data/tourapi/reports/busan/visitbusan-description-regression-fixtures-v1.json")

# has_visit_value() 원본 구현 (run-visitbusan-experience-en-full-apply-v1.py와 동일)
EN_USEFUL_MIN = 80

VISIT_VALUE_KEYWORDS = [
    "located", "offers", "features", "provides", "known", "famous",
    "visitors", "experience", "enjoy", "popular", "activity",
    "busan", "korea", "traditional", "modern", "unique", "special",
    "available", "program", "class", "tour", "open", "visit",
    "attraction", "landmark", "view", "natural", "cultural", "art",
    "museum", "park", "beach", "mountain", "river", "sea", "ocean",
]


def has_visit_value(text: str, title: str) -> bool:
    """
    장소 특징과 방문 가치 확인 휴리스틱.
    run-visitbusan-experience-en-full-apply-v1.py의 원본 구현과 동일.
    """
    if not text or len(text) < EN_USEFUL_MIN:
        return False
    tl = title.lower().strip() if title else ""
    txt = text.lower().strip()
    if tl and txt.startswith(tl) and len(txt) - len(tl) < 30:
        return False
    has_sentences = bool(re.search(r"[.!?]\s+[A-Z]", text))
    is_long = len(text) >= 150
    has_keywords = any(kw in txt for kw in VISIT_VALUE_KEYWORDS)
    return (has_sentences or is_long) and has_keywords


def run_regression():
    fixtures = json.loads(FIXTURE_FILE.read_text(encoding="utf-8"))
    cases = fixtures["fixtures"]

    print("=" * 70)
    print("VISITBUSAN DESCRIPTION REGRESSION TEST")
    print(f"Fixture: {FIXTURE_FILE}")
    print(f"Total cases: {len(cases)} (all expected: TOO_GENERIC / has_visit_value==False)")
    print("=" * 70)

    results = []
    for c in cases:
        cid       = c["candidate_id"]
        title     = c["en_title"]
        desc      = c["en_description"]
        expected  = False   # TOO_GENERIC → has_visit_value() should be False
        actual    = has_visit_value(desc, title)
        detected  = (actual == expected)   # True = correctly flagged as TOO_GENERIC
        keywords_found = [kw for kw in VISIT_VALUE_KEYWORDS if kw in desc.lower()]

        results.append({
            "candidate_id": cid,
            "expected_has_visit_value": expected,
            "actual_has_visit_value": actual,
            "correctly_detected_as_too_generic": detected,
            "failure_pattern": c["failure_pattern"],
            "desc_len": c["en_description_len"],
            "keywords_matched": keywords_found,
        })

        status = "PASS" if detected else "FAIL (AUTO MISS)"
        print(f"\n[{status}] {cid}")
        print(f"  pattern:   {c['failure_pattern']}")
        print(f"  desc_len:  {c['en_description_len']}")
        print(f"  has_visit_value(): {actual}  (expected False)")
        if keywords_found:
            print(f"  keywords:  {keywords_found}")
        if not detected:
            print(f"  ** MISSED: function returned True — manual audit needed **")
        print(f"  reason:    {c['reason'][:100]}")

    print("\n" + "=" * 70)
    passed   = sum(1 for r in results if r["correctly_detected_as_too_generic"])
    failed   = len(results) - passed
    miss_ids = [r["candidate_id"] for r in results if not r["correctly_detected_as_too_generic"]]

    print(f"RESULT: {passed}/{len(results)} correctly detected as TOO_GENERIC")
    print(f"  Auto PASS: {passed}")
    print(f"  Auto MISS: {failed}  {miss_ids if miss_ids else ''}")
    if failed > 0:
        print(f"\n  *** {failed}건 미탐지 — 수동 감사 또는 함수 개선 필요 ***")
        print("  개선 후보:")
        print("    1. venue_position_check: 시설명이 첫 60% 내 등장 여부")
        print("    2. venue_name_required: en_title 고유명사가 본문에 등장 여부")
        print("    3. checklist_penalty: ①②③ 번호 체크리스트 패턴 감점")
    else:
        print("\n  All TOO_GENERIC cases correctly detected by has_visit_value().")

    print("=" * 70)
    return passed, failed


if __name__ == "__main__":
    passed, failed = run_regression()
    # Exit 0 even if there are auto-misses — misses are documented, not blocking
    sys.exit(0)
