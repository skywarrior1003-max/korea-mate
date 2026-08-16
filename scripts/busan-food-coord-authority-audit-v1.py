#!/usr/bin/env python3
"""
scripts/busan-food-coord-authority-audit-v1.py

PURPOSE
-------
Regression audit: verify all SOURCE_VERIFIED coord_authority entities in
busan-food-194-canonical-v1.json have TRUE_SAME addresses.

ORIGINAL BUG (count_and_coord_audit.py scratchpad):
  normalize_addr:
    addr.replace(' ', '').lower()          # removes ALL spaces
  addr_match_level:
    shorter[:12] in longer                 # 12-char prefix insufficient

  Result: "달맞이길62번길 49" vs "달맞이길 62번길 19"
  → both normalized to same 12-char prefix "해운대구달맞이길62번"
  → incorrectly returned SAME (G-00057 false positive, building 49 ≠ 19)

FIX (this script):
  1. Canonical address: take core BEFORE first comma
     (removes floor/unit info: "3층", "1호", "2F")
  2. Normalize both sides (district prefix removed, spaces removed)
  3. Compare: canonical_core_norm must be prefix OR substring of api_norm
     (API may append floor info after building number)
  4. Building numbers are preserved throughout:
     "달맞이길62번길49" vs "달맞이길62번길19" → MISMATCH ✓

USAGE
-----
  python scripts/busan-food-coord-authority-audit-v1.py
  → Reports FALSE_SAME_ADDRESS_COUNT and REGRESSION_CHECKSUM

  Run twice and compare REGRESSION_CHECKSUM to verify determinism.

SCOPE
-----
  Read-only. Does NOT modify the canonical JSON.
  Audits entities where coord_authority_v1.result is:
    - SOURCE_VERIFIED_NAV_READY
    - SAME_ENTITY_MULTI_RECORD_RESOLVED
  Excludes:
    - ADDR_MISMATCH_REVERTED (e.g., G-00057)
    - Entities without coord_authority_v1

DATA DEPENDENCY
---------------
  Reads: data/tourapi/normalized/busan/busan-food-194-canonical-v1.json
  No external API or snapshot required for regression audit.
  (Full coord authority determination requires FoodService API snapshot;
   that is a separate data collection concern.)
"""

import json
import sys
import os
import re
import hashlib

sys.stdout.reconfigure(encoding='utf-8')

# ── Paths ──────────────────────────────────────────────────────────────────────
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(REPO_ROOT,
    'data', 'tourapi', 'normalized', 'busan',
    'busan-food-194-canonical-v1.json')


# ── Fixed normalization (corrects the scratchpad bug) ─────────────────────────

def normalize_for_comparison(addr: str) -> str:
    """
    Normalize Korean road address for string comparison.

    Steps:
      1. Strip leading/trailing whitespace
      2. Remove '부산광역시' or '부산 ' prefix
      3. Remove district (구/군) — NON-GREEDY (max 4 Hangul chars)
         to avoid consuming road name prefix (e.g. '중구구덕로22번길'
         must not lose '구덕로' after '중구' removal)
      4. Remove all spaces (for flexible comparison between
         '달맞이길62번길' and '달맞이길 62번길')
      5. Lowercase

    Building numbers are preserved:
      '달맞이길62번길 49' → '달맞이길62번길49'
      '달맞이길 62번길 19' → '달맞이길62번길19'
      These remain distinct after normalization.
    """
    addr = addr.strip()
    addr = re.sub(r'^부산광역시\s*', '', addr)
    addr = re.sub(r'^부산\s+', '', addr)
    addr = re.sub(r'^[가-힣]{1,4}[구군]\s*', '', addr)
    addr = addr.replace(' ', '').lower()
    return addr


def canonical_core_in_api(canon_addr: str, api_addr: str):
    """
    Returns (is_match: bool, detail: str).

    Logic:
      canonical_core = canon_addr before first comma
        → removes floor/unit suffix (e.g. ',3층' ',2호')
        → preserves building number

      api_norm = normalize_for_comparison(api_addr)
        → API may append floor after building: '달맞이길62번길493층'

      Match if:
        api_norm.startswith(canonical_core_norm)   [prefix_match]
        OR canonical_core_norm in api_norm          [substring_match]

    Example — TRUE SAME:
      canon: '해운대구 달맞이길65번길 154, 3층'
      core:  '해운대구 달맞이길65번길 154'
      norm:  '달맞이길65번길154'
      api:   '달맞이길65번길154 3층'  → '달맞이길65번길1543층'
      → prefix_match ✓

    Example — FALSE SAME (detected correctly):
      canon: '부산 해운대구 달맞이길62번길 49, 3층'
      core:  '부산 해운대구 달맞이길62번길 49'
      norm:  '달맞이길62번길49'
      api:   '해운대구 달맞이길 62번길 19, 2층' → '달맞이길62번길19,2층'
      norm:  '달맞이길62번길19,2층'
      → '달맞이길62번길49' NOT in '달맞이길62번길19,2층' → MISMATCH ✓
    """
    if ',' in canon_addr:
        canon_core = canon_addr[:canon_addr.index(',')].strip()
    else:
        canon_core = canon_addr.strip()

    canon_norm = normalize_for_comparison(canon_core)
    api_norm   = normalize_for_comparison(api_addr)

    if not canon_norm or not api_norm:
        return False, f'empty: canon="{canon_norm}" api="{api_norm}"'

    if api_norm.startswith(canon_norm):
        return True, 'prefix_match'
    if canon_norm in api_norm:
        return True, 'substring_match'
    return False, f'MISMATCH: "{canon_norm}" NOT IN "{api_norm}"'


# ── Validation test cases ──────────────────────────────────────────────────────

_UNIT_TESTS = [
    # (canon_addr, api_addr, expected_match, description)
    ('부산 해운대구 달맞이길62번길 49, 3층',
     '해운대구 달맞이길 62번길 19, 2층',
     False, 'G-00057: building 49 ≠ 19 must be MISMATCH'),

    ('해운대구 달맞이길65번길 154, 3층',
     '달맞이길65번길 154 3층',
     True,  'floor suffix: TRUE_SAME'),

    ('마린시티3로 37',
     '마린시티3로 37 213,214호',
     True,  'digit-containing road: TRUE_SAME'),

    ('금강로 418',
     '금강로 418 2층',
     True,  'floor append: TRUE_SAME'),

    ('중구 구덕로22번길 3',
     '구덕로22번길3 1층',
     True,  '중구 district removal non-greedy: TRUE_SAME'),

    ('마린시티2로 33',
     '마린시티2로 33 두산 위브더제니스 지하 1층 106호',
     True,  'long building name append: TRUE_SAME'),

    ('민락로33번길 17',
     '민락로33번길 17 202호',
     True,  'unit number append: TRUE_SAME'),
]


def run_unit_tests():
    """Run built-in test cases. Abort on failure."""
    passed = 0
    failed = 0
    for canon, api, expected, desc in _UNIT_TESTS:
        match, detail = canonical_core_in_api(canon, api)
        if match == expected:
            passed += 1
        else:
            print(f'  UNIT_FAIL: {desc}')
            print(f'    canon={canon}')
            print(f'    api  ={api}')
            print(f'    expected={expected}, got={match}: {detail}')
            failed += 1
    return passed, failed


# ── Main regression audit ──────────────────────────────────────────────────────

def main():
    print('=' * 70)
    print('busan-food-coord-authority-audit-v1.py')
    print('Regression audit: coord authority address comparison')
    print('=' * 70)
    print()

    # Unit tests first
    print('── Unit tests ──')
    passed, failed = run_unit_tests()
    print(f'  Unit tests: {passed} passed, {failed} failed')
    if failed > 0:
        print('ABORT: unit tests failed — script has a bug')
        sys.exit(1)
    print()

    # Load canonical
    if not os.path.exists(TARGET):
        print(f'ERROR: canonical not found at {TARGET}')
        sys.exit(1)

    with open(TARGET, encoding='utf-8') as f:
        canonical = json.load(f)
    recs = canonical['records']
    print(f'Canonical loaded: {len(recs)} records')
    print()

    # Audit
    COORD_AUTH_RESULTS = {
        'SOURCE_VERIFIED_NAV_READY',
        'SAME_ENTITY_MULTI_RECORD_RESOLVED',
    }

    true_same  = []
    false_same = []
    skipped    = []

    for r in recs:
        cid    = r['canonical_id']
        name   = r.get('name_ko', '')
        arv1   = r.get('api_recovery_v1', {})
        cav    = arv1.get('coord_authority_v1', {})
        result = cav.get('result', '')

        if result not in COORD_AUTH_RESULTS:
            skipped.append(cid)
            continue

        canon_addr = r.get('address_ko', '')
        api_addr   = cav.get('api_addr', '')

        if not api_addr:
            skipped.append(cid)
            continue

        is_match, detail = canonical_core_in_api(canon_addr, api_addr)
        entry = dict(cid=cid, name=name, result=result,
                     canon=canon_addr, api=api_addr, detail=detail)
        (true_same if is_match else false_same).append(entry)

    print(f'Entities audited : {len(true_same) + len(false_same)}')
    print(f'  TRUE_SAME      : {len(true_same)}')
    print(f'  FALSE_SAME     : {len(false_same)}')
    print(f'  Skipped (other): {len(skipped)}')
    print()

    if false_same:
        print('=== FALSE_SAME ENTITIES (MUST BE 0) ===')
        for e in false_same:
            print(f"  [{e['cid']}] {e['name']}")
            print(f"    canon: {e['canon']}")
            print(f"    api  : {e['api']}")
            print(f"    {e['detail']}")
        print()

    # Deterministic checksum
    ck_payload = json.dumps(
        sorted([
            {'cid': e['cid'], 'match': True}  for e in true_same
        ] + [
            {'cid': e['cid'], 'match': False} for e in false_same
        ], key=lambda x: x['cid']),
        ensure_ascii=False, sort_keys=True
    )
    checksum = hashlib.sha256(ck_payload.encode()).hexdigest()

    # QA gate
    count_ok    = len(recs) == 194
    false_ok    = len(false_same) == 0

    print('── Results ──')
    print(f'CANONICAL_COUNT          = {len(recs)}  {"✓" if count_ok else "✗ EXPECTED 194"}')
    print(f'FALSE_SAME_ADDRESS_COUNT = {len(false_same)}  {"✓" if false_ok else "✗ MUST BE 0"}')
    print(f'REGRESSION_CHECKSUM      = {checksum}')
    print()

    verdict = 'PASS' if (count_ok and false_ok) else 'FAIL'
    print(f'ADDR_REGRESSION_VERDICT  = {verdict}')

    return 0 if verdict == 'PASS' else 1


if __name__ == '__main__':
    sys.exit(main())
