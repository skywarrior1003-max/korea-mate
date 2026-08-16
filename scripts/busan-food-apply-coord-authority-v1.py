#!/usr/bin/env python3
"""
scripts/busan-food-apply-coord-authority-v1.py

PURPOSE
-------
Apply coord authority audit results to busan-food-194-canonical-v1.json.
Fixed version of the apply_coord_authority_v1.py scratchpad script.

ORIGINAL BUG (apply_coord_authority_v1.py scratchpad, line 91):
  block = [b for b in block if b != 'NAVIGATION_NOT_READY']
  → Only removed 'NAVIGATION_NOT_READY', not the variant 'NAVIGATION_READY_NO'
  → 15 entities retained stale 'NAVIGATION_READY_NO' blocker after upgrade
  → Remained ai_auto=False even with navigation_ready=True

FIX (this script):
  block = [b for b in block
           if b not in ('NAVIGATION_NOT_READY', 'NAVIGATION_READY_NO')]
  → Both stale block variants are removed

USAGE
-----
  # Check mode (read-only, verifies no stale blockers in current canonical):
  python scripts/busan-food-apply-coord-authority-v1.py --check

  # Apply mode (requires audit_results JSON input):
  python scripts/busan-food-apply-coord-authority-v1.py --apply <audit_results.json>

DATA DEPENDENCY
---------------
  Reads (always): data/tourapi/normalized/busan/busan-food-194-canonical-v1.json
  Reads (--apply): audit results JSON produced by busan-food-coord-authority-audit-v1.py
                   (full pipeline version, not the regression-only script)
  Writes (--apply): canonical JSON (modified in place, after backup)
"""

import json
import sys
import os
import shutil

sys.stdout.reconfigure(encoding='utf-8')

# ── Paths ──────────────────────────────────────────────────────────────────────
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(REPO_ROOT,
    'data', 'tourapi', 'normalized', 'busan',
    'busan-food-194-canonical-v1.json')

# ── Stale block removal (fixed) ───────────────────────────────────────────────

# Both variants must be removed when entity gains navigation_ready=True
_STALE_BLOCKERS = frozenset({
    'NAVIGATION_NOT_READY',  # original variant
    'NAVIGATION_READY_NO',   # stale variant from older pipeline runs
})


def remove_stale_nav_blockers(block_reasons: list) -> list:
    """
    Remove navigation-related stale blockers from ai_auto_block_reasons.

    When an entity's navigation_ready is upgraded to True, its
    ai_auto_block_reasons must no longer contain navigation blockers.

    Returns the cleaned list. Returns empty list (not None) for downstream
    callers to decide whether to set None.

    FIX vs scratchpad bug:
      Old: [b for b in block if b != 'NAVIGATION_NOT_READY']
      New: [b for b in block if b not in _STALE_BLOCKERS]
    """
    if not block_reasons:
        return []
    return [b for b in block_reasons if b not in _STALE_BLOCKERS]


def check_stale_blockers(recs: list) -> dict:
    """
    Read-only check: verify no entity has stale nav blockers
    while navigation_ready=True.

    Returns:
      {
        'stale_found': int,
        'nav_ready_with_stale': list[dict],  # entities with problem
        'nav_ready_no_ai': int,              # nav=True but ai=False
      }
    """
    stale_found = []
    nav_ready_no_ai = []

    for r in recs:
        nav_ready = r.get('navigation_ready', False)
        ai_auto   = r.get('ai_auto', False)
        blocks    = r.get('ai_auto_block_reasons') or []

        stale_in_record = [b for b in blocks if b in _STALE_BLOCKERS]

        if nav_ready and stale_in_record:
            stale_found.append({
                'cid':   r['canonical_id'],
                'name':  r.get('name_ko', ''),
                'stale': stale_in_record,
                'all_blocks': blocks,
            })

        if nav_ready and not ai_auto:
            nav_ready_no_ai.append(r['canonical_id'])

    return {
        'stale_found':       len(stale_found),
        'stale_entities':    stale_found,
        'nav_ready_no_ai':   len(nav_ready_no_ai),
        'nav_ready_no_ai_ids': nav_ready_no_ai,
    }


# ── Check mode ────────────────────────────────────────────────────────────────

def run_check():
    """
    Read-only mode: verify current canonical has no stale blockers.
    Regression gate: stale_found must be 0.
    """
    print('=' * 70)
    print('busan-food-apply-coord-authority-v1.py --check')
    print('Stale blocker regression check (read-only)')
    print('=' * 70)
    print()

    with open(TARGET, encoding='utf-8') as f:
        canonical = json.load(f)
    recs = canonical['records']

    print(f'Canonical records: {len(recs)}')
    print()

    result = check_stale_blockers(recs)

    nav_ready_count = sum(1 for r in recs if r.get('navigation_ready', False))
    ai_auto_count   = sum(1 for r in recs if r.get('ai_auto', False))

    print(f'navigation_ready = True : {nav_ready_count}')
    print(f'ai_auto          = True : {ai_auto_count}')
    print(f'STALE_BLOCKERS_FOUND    : {result["stale_found"]}  '
          f'{"✓" if result["stale_found"] == 0 else "✗ MUST BE 0"}')
    print(f'NAV_READY_WITHOUT_AI    : {result["nav_ready_no_ai"]}')
    print()

    if result['stale_entities']:
        print('=== STALE ENTITIES ===')
        for e in result['stale_entities']:
            print(f"  [{e['cid']}] {e['name']}: stale={e['stale']}")
        print()

    if result['nav_ready_no_ai_ids']:
        print('nav_ready=True but ai_auto=False (should be 0):')
        for cid in result['nav_ready_no_ai_ids']:
            print(f'  {cid}')
        print()

    count_ok = len(recs) == 194
    stale_ok = result['stale_found'] == 0
    nav_ai_ok = result['nav_ready_no_ai'] == 0

    verdict = 'PASS' if (count_ok and stale_ok and nav_ai_ok) else 'FAIL'
    print(f'CANONICAL_COUNT         = {len(recs)}  {"✓" if count_ok else "✗"}')
    print(f'STALE_BLOCKER_REGRESSION= {verdict}')

    return 0 if verdict == 'PASS' else 1


# ── Apply mode (future use) ────────────────────────────────────────────────────

def apply_coord_authority(audit_results_path: str):
    """
    Apply coord authority results to canonical JSON.
    Requires the full pipeline audit_results JSON as input.

    This function contains the FIXED stale blocker removal logic.
    For actual use, run after busan-food-coord-authority-audit-v1.py
    (full pipeline version with FoodService API snapshot).
    """
    print('=' * 70)
    print('busan-food-apply-coord-authority-v1.py --apply')
    print('=' * 70)
    print()

    # Load audit results
    if not os.path.exists(audit_results_path):
        print(f'ERROR: audit results not found: {audit_results_path}')
        sys.exit(1)

    with open(audit_results_path, encoding='utf-8') as f:
        audit = json.load(f)

    full_audit = audit.get('full_audit', {})
    nav_new    = {e['canonical_id'] for e in audit.get('nav_ready_new', [])}

    # Load canonical
    with open(TARGET, encoding='utf-8') as f:
        canonical = json.load(f)
    recs = canonical['records']

    pre_nav = sum(1 for r in recs if r.get('navigation_ready', False))
    pre_ai  = sum(1 for r in recs if r.get('ai_auto', False))
    print(f'Pre:  nav_ready={pre_nav}, ai_auto={pre_ai}')

    nav_upgraded = 0
    ai_upgraded  = 0

    for r in recs:
        cid    = r['canonical_id']
        res    = full_audit.get(cid, {})
        result = res.get('result', '')

        if result == 'ALREADY_NAVIGATION_READY':
            continue

        if result == 'SOURCE_VERIFIED_NAV_READY':
            r['navigation_ready'] = True
            r['coord_status_r1']  = 'OFFICIAL_COORD_CONFIRMED'

            arv1 = r.get('api_recovery_v1', {})
            arv1['coord_authority_v1'] = {
                'result':           'SOURCE_VERIFIED_NAV_READY',
                'authority_source': 'FOODSERVICE_OFFICIAL',
                'uc_seq':           res['uc_seq'],
                'api_lat':          res['api_lat'],
                'api_lng':          res['api_lng'],
                'api_addr':         res['api_addr'],
                'addr_match_level': 'SAME',
                'guide_dist_m':     res.get('dist_m'),
                'phone_match':      res.get('phone_match', False),
                'navigation_ready': True,
            }
            r['api_recovery_v1'] = arv1

            # ── FIXED stale blocker removal ────────────────────────────────
            # BUG: original only removed 'NAVIGATION_NOT_READY'
            # FIX: remove BOTH 'NAVIGATION_NOT_READY' and 'NAVIGATION_READY_NO'
            block = r.get('ai_auto_block_reasons') or []
            block = remove_stale_nav_blockers(block)
            r['ai_auto_block_reasons'] = block if block else None

            # Upgrade ai_auto if image resolved, ACTIVE, no remaining blocks
            if (r.get('image_status') == 'OFFICIAL_IMAGE_RESOLVED'
                    and r.get('current_state') == 'ACTIVE'
                    and not r.get('ai_auto', False)):
                remaining = r.get('ai_auto_block_reasons') or []
                if not remaining:
                    r['ai_auto'] = True
                    r['ai_auto_block_reasons'] = None
                    ai_upgraded += 1

            nav_upgraded += 1

    post_nav = sum(1 for r in recs if r.get('navigation_ready', False))
    post_ai  = sum(1 for r in recs if r.get('ai_auto', False))
    print(f'Post: nav_ready={post_nav}, ai_auto={post_ai}')
    print(f'nav_upgraded={nav_upgraded}, ai_upgraded={ai_upgraded}')
    print()

    # Verify stale blockers
    check = check_stale_blockers(recs)
    if check['stale_found'] > 0:
        print(f'ERROR: {check["stale_found"]} stale blockers remain after apply')
        sys.exit(1)
    print('STALE_BLOCKER_CHECK = PASS ✓')

    # Backup + save
    backup = TARGET + '.pre-apply-coord-authority.bak'
    shutil.copy2(TARGET, backup)
    print(f'Backup: {backup}')

    with open(TARGET, 'w', encoding='utf-8') as f:
        json.dump(canonical, f, ensure_ascii=False, indent=2)
    print(f'Saved: {TARGET}')


# ── Entry point ────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    if len(sys.argv) < 2 or sys.argv[1] == '--check':
        sys.exit(run_check())
    elif sys.argv[1] == '--apply' and len(sys.argv) >= 3:
        apply_coord_authority(sys.argv[2])
    else:
        print('Usage:')
        print('  python scripts/busan-food-apply-coord-authority-v1.py --check')
        print('  python scripts/busan-food-apply-coord-authority-v1.py --apply <audit_results.json>')
        sys.exit(1)
