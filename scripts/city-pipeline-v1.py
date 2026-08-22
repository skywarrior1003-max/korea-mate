# -*- coding: utf-8 -*-
"""city-pipeline-v1.py — GoKoreaMate New City End-to-End Pipeline Orchestrator

State machine for new city data package collection.
기존 5도시에 적용 금지. 신규 도시 opt-in 전용.

Commands:
  init          <slug> --name-ko <> --name-en <> [--as-of <>] [--contract-sha <>]
  status        <slug>
  next          <slug>
  advance       <slug> --phase <P0-P11> --status <PASS|HOLD|FAIL|NOT_APPLICABLE>
                        [--checkpoint <>] [--notes <>]
  validate      <slug> --manifest <>
  ext-resolve   <slug> --gate <G-XX> --evidence <>
  freeze        <slug>

Exit codes: 0=OK  1=HOLD/WARNING  2=ERROR/FAIL
"""
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ROOT = Path(__file__).parent.parent
VALIDATOR_SCRIPT = ROOT / 'scripts' / 'validate-new-city-package-v1.py'
PIPELINE_DOCS    = ROOT / 'docs' / 'data-collection' / 'new-city-package' / 'pipeline'
PACKAGES_DIR     = ROOT / 'data' / 'city-packages'
PYTHON           = sys.executable

CONTRACT_SHA_DEFAULT  = '11b6220e1306e30329d3ec61c96adee387529646'
VALIDATOR_SHA_DEFAULT = '2f43bd34125d9a8c603c3997e919952998fb20d6'

PHASE_ORDER = ['P0','P1','P2','P3','P4','P5','P6','P7','P8','P9','P10','P11']

PHASES = {
    'P0':  {'name': 'INIT',              'deps': [],                   'auto': True,  'doc': 'p0-init-v1.md'},
    'P1':  {'name': 'SOURCE_CAPABILITY', 'deps': ['P0'],              'auto': False, 'doc': 'p1-source-capability-v1.md'},
    'P2':  {'name': 'FOOD',              'deps': ['P1'],              'auto': False, 'doc': 'p2-food-v1.md'},
    'P3':  {'name': 'NONFOOD',           'deps': ['P1'],              'auto': False, 'doc': 'p3-nonfood-v1.md'},
    'P4':  {'name': 'EVENT',             'deps': ['P1'],              'auto': False, 'doc': 'p4-event-v1.md'},
    'P5':  {'name': 'MULTILINGUAL',      'deps': ['P2','P3','P4'],   'auto': False, 'doc': 'p5-multilingual-v1.md'},
    'P6':  {'name': 'MEDIA_NAV',         'deps': ['P2','P3','P4'],   'auto': False, 'doc': 'p6-media-nav-v1.md'},
    'P7':  {'name': 'REGIONAL',          'deps': ['P2','P3'],        'auto': False, 'doc': 'p7-regional-v1.md'},
    'P8':  {'name': 'FINAL_MANIFEST',    'deps': ['P5','P6','P7'],   'auto': True,  'doc': 'p8-final-manifest-v1.md'},
    'P9':  {'name': 'VALIDATOR',         'deps': ['P8'],             'auto': True,  'doc': 'p9-validator-v1.md'},
    'P10': {'name': 'EXTERNAL_CHECK',    'deps': ['P9'],             'auto': False, 'doc': 'p10-external-check-v1.md'},
    'P11': {'name': 'FINAL_FREEZE',      'deps': ['P9','P10'],       'auto': True,  'doc': 'p11-final-freeze-v1.md'},
}

VALID_STATUSES = {'NOT_STARTED', 'IN_PROGRESS', 'PASS', 'HOLD', 'FAIL', 'NOT_APPLICABLE'}
# Dependency-satisfying statuses (PASS or NOT_APPLICABLE satisfy dep requirements)
DEP_SATISFIED = {'PASS', 'NOT_APPLICABLE'}


# ── 유틸리티 ────────────────────────────────────────────────────────────────

def now_iso():
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


def atomic_save(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    os.replace(tmp, path)


def state_path(slug: str) -> Path:
    return PACKAGES_DIR / slug / 'city-package-state.json'


def checkpoint_path(slug: str, phase_id: str) -> Path:
    return PACKAGES_DIR / slug / 'checkpoints' / f'{phase_id.lower()}-checkpoint.json'


def load_state(slug: str) -> dict:
    p = state_path(slug)
    if not p.exists():
        raise FileNotFoundError(f'State not found for "{slug}". Run: init {slug}')
    return json.loads(p.read_text(encoding='utf-8-sig'))


def save_state(state: dict):
    state['updated_at'] = now_iso()
    atomic_save(state_path(state['city_slug']), state)


def make_phase_entry(phase_id: str, status: str = 'NOT_STARTED') -> dict:
    return {
        'id': phase_id,
        'name': PHASES[phase_id]['name'],
        'status': status,
        'started_at': None,
        'completed_at': None,
        'checkpoint_path': None,
        'artifacts': [],
        'notes': '',
        'last_error': None,
    }


def deps_satisfied(phase_id: str, phases: dict) -> bool:
    for dep in PHASES[phase_id]['deps']:
        if phases.get(dep, {}).get('status') not in DEP_SATISFIED:
            return False
    return True


def find_next_phase(phases: dict) -> str | None:
    """Return the next phase to work on, or None if pipeline is complete/blocked."""
    for pid in PHASE_ORDER:
        st = phases.get(pid, {}).get('status', 'NOT_STARTED')
        if st in ('NOT_STARTED', 'IN_PROGRESS', 'HOLD'):
            if deps_satisfied(pid, phases):
                return pid
            elif st == 'HOLD':
                return pid  # return blocked phase so user knows
    return None


def determine_current_phase(phases: dict) -> str:
    """Determine the overall current phase label for display."""
    for pid in PHASE_ORDER:
        st = phases.get(pid, {}).get('status', 'NOT_STARTED')
        if st in ('IN_PROGRESS', 'HOLD'):
            return pid
    # Return first NOT_STARTED with satisfied deps
    for pid in PHASE_ORDER:
        st = phases.get(pid, {}).get('status', 'NOT_STARTED')
        if st == 'NOT_STARTED' and deps_satisfied(pid, phases):
            return pid
    # All PASS/NA
    if all(phases.get(pid, {}).get('status') in DEP_SATISFIED for pid in PHASE_ORDER if pid != 'P10'):
        return 'DONE'
    return 'BLOCKED'


# ── Phase auto-runners ───────────────────────────────────────────────────────

def run_p0_init(state: dict) -> dict:
    """P0: INIT — creates package structure, marks PASS immediately."""
    slug = state['city_slug']
    pkg = PACKAGES_DIR / slug
    pkg.mkdir(parents=True, exist_ok=True)
    (pkg / 'checkpoints').mkdir(exist_ok=True)
    (pkg / 'artifacts').mkdir(exist_ok=True)

    cp = {
        '_schema': 'phase-checkpoint-v1',
        'phase': 'P0',
        'city_slug': slug,
        'completed_at': now_iso(),
        'package_root': str(pkg.relative_to(ROOT)),
        'directories_created': ['checkpoints/', 'artifacts/'],
    }
    cp_path = checkpoint_path(slug, 'P0')
    atomic_save(cp_path, cp)

    p = state['phases']['P0']
    p['status'] = 'PASS'
    p['started_at'] = now_iso()
    p['completed_at'] = now_iso()
    p['checkpoint_path'] = str(cp_path.relative_to(ROOT))
    return state


def run_p8_manifest(state: dict) -> dict:
    """P8: FINAL_MANIFEST — aggregate checkpoints from P2-P7 into manifest."""
    slug = state['city_slug']
    phases = state['phases']

    # Aggregate universe counts from P2 (food), P3 (nonfood), P4 (event)
    total_discovered  = 0
    total_canonical   = 0
    total_sa          = 0
    total_excluded    = 0
    total_relation    = 0
    total_expired     = 0
    total_review      = 0
    category_counts   = {}

    for pid in ('P2', 'P3', 'P4'):
        cp_path_str = phases.get(pid, {}).get('checkpoint_path')
        if not cp_path_str:
            continue
        cp_full = ROOT / cp_path_str
        if not cp_full.exists():
            continue
        cp = json.loads(cp_full.read_text(encoding='utf-8-sig'))
        u = cp.get('universe', {})
        total_discovered += u.get('discovered_count', 0)
        total_canonical  += u.get('canonical_count', 0)
        total_sa         += u.get('service_active_count', 0)
        total_excluded   += u.get('excluded_count', 0)
        total_relation   += u.get('relation_context_count', 0)
        total_expired    += u.get('expired_count', 0)
        total_review     += u.get('review_count', 0)
        for k, v in cp.get('category_counts', {}).items():
            if not k.startswith('_'):
                category_counts[k] = category_counts.get(k, 0) + v

    arithmetic_valid = (total_sa + total_excluded + total_relation + total_expired + total_review) == total_canonical

    # Data readiness from P6 checkpoint
    data_readiness = {}
    p6_cp_str = phases.get('P6', {}).get('checkpoint_path')
    if p6_cp_str:
        p6_full = ROOT / p6_cp_str
        if p6_full.exists():
            data_readiness = json.loads(p6_full.read_text(encoding='utf-8-sig')).get('data_readiness', {})

    # Locale from P5 checkpoint
    locale = {}
    p5_cp_str = phases.get('P5', {}).get('checkpoint_path')
    if p5_cp_str:
        p5_full = ROOT / p5_cp_str
        if p5_full.exists():
            locale = json.loads(p5_full.read_text(encoding='utf-8-sig')).get('locale', {})

    # Identity from P2/P3 aggregate
    identity = {}
    for pid in ('P2', 'P3'):
        cp_path_str = phases.get(pid, {}).get('checkpoint_path')
        if not cp_path_str:
            continue
        cp_full = ROOT / cp_path_str
        if cp_full.exists():
            cp = json.loads(cp_full.read_text(encoding='utf-8-sig'))
            ident = cp.get('identity', {})
            if ident:
                identity = ident
                break

    # Regional from P7
    regional_artifact = None
    p7_cp_str = phases.get('P7', {}).get('checkpoint_path')
    if p7_cp_str:
        p7_full = ROOT / p7_cp_str
        if p7_full.exists():
            p7_data = json.loads(p7_full.read_text(encoding='utf-8-sig'))
            regional_artifact = p7_data.get('regional', {})

    # Assemble manifest
    manifest = {
        '_schema': 'new-city-final-manifest-v1',
        '_contract': 'docs/data-collection/new-city-package/multicity-new-city-package-contract-v1.md',
        '_generated_by': 'city-pipeline-v1.py P8 auto-aggregation',
        'city': state['city_slug'],
        'package_version': 'v1',
        'approved_sha': state.get('contract_sha', ''),
        'common_policy_pin': state.get('common_policy_pin', ''),
        'schema_version': 'new-city-final-manifest-v1',
        'generated_as_of': now_iso(),
        'canonical_id': identity.get('canonical_id', {}),
        'universe': {
            'discovered_count': total_discovered,
            'canonical_count': total_canonical,
            'service_active_count': total_sa,
            'excluded_count': total_excluded,
            'relation_context_count': total_relation,
            'expired_count': total_expired,
            'review_count': total_review,
            'arithmetic_check': f'{total_sa}+{total_excluded}+{total_relation}+{total_expired}+{total_review}={total_canonical}',
            'arithmetic_valid': arithmetic_valid,
        },
        'category_counts': category_counts,
        'identity': identity,
        'data_readiness': data_readiness,
        'locale': locale,
        'artifacts': [],
        'release_gate': {'FINAL_FREEZE_READY': 'PENDING'},
        'release': {
            'reproducibility': '',
            'known_issues': [],
            'targeted_qa_required': False,
            'targeted_qa_items': [],
            'safe_for_main_intake': 'PENDING',
            'main_intake_recommendation': 'FINAL_ARTIFACT_INTAKE',
        },
    }

    # Save manifest
    manifest_path = PACKAGES_DIR / slug / 'final-manifest-v1.json'
    atomic_save(manifest_path, manifest)

    cp = {
        '_schema': 'phase-checkpoint-v1',
        'phase': 'P8',
        'city_slug': slug,
        'completed_at': now_iso(),
        'manifest_path': str(manifest_path.relative_to(ROOT)),
        'arithmetic_valid': arithmetic_valid,
        'aggregated_from': ['P2', 'P3', 'P4', 'P5', 'P6', 'P7'],
    }
    cp_path = checkpoint_path(slug, 'P8')
    atomic_save(cp_path, cp)

    p = state['phases']['P8']
    p['status'] = 'PASS' if arithmetic_valid else 'HOLD'
    p['started_at'] = now_iso()
    p['completed_at'] = now_iso()
    p['checkpoint_path'] = str(cp_path.relative_to(ROOT))
    p['artifacts'] = [str(manifest_path.relative_to(ROOT))]
    if not arithmetic_valid:
        p['last_error'] = f'Universe arithmetic invalid: {manifest["universe"]["arithmetic_check"]} check failed'

    return state


def run_p9_validator(state: dict, manifest_path_str: str = None) -> dict:
    """P9: VALIDATOR — call existing validator script, parse JSON output."""
    slug = state['city_slug']
    phases = state['phases']

    # Find manifest path
    if not manifest_path_str:
        p8_cp_str = phases.get('P8', {}).get('checkpoint_path')
        if p8_cp_str:
            p8_cp = json.loads((ROOT / p8_cp_str).read_text(encoding='utf-8-sig'))
            manifest_path_str = p8_cp.get('manifest_path')
    if not manifest_path_str:
        manifest_path_str = str(PACKAGES_DIR / slug / 'final-manifest-v1.json')

    manifest_full = ROOT / manifest_path_str if not Path(manifest_path_str).is_absolute() else Path(manifest_path_str)

    if not manifest_full.exists():
        p = state['phases']['P9']
        p['status'] = 'FAIL'
        p['last_error'] = f'Manifest not found: {manifest_full}'
        return state

    # Run validator
    result = subprocess.run(
        [PYTHON, str(VALIDATOR_SCRIPT), str(manifest_full), '--json'],
        capture_output=True, text=True, encoding='utf-8', errors='replace',
        cwd=str(ROOT)
    )

    try:
        validator_out = json.loads(result.stdout)
    except Exception:
        p = state['phases']['P9']
        p['status'] = 'FAIL'
        p['last_error'] = f'Validator output not valid JSON: {result.stdout[:200]}'
        return state

    # Store validator result
    state['validator_result'] = validator_out

    # Determine P9 status from gate results (not just exit code!)
    gates = validator_out.get('gates', [])
    fail_gates  = [g for g in gates if g.get('status') == 'FAIL']
    ext_gates   = [g for g in gates if g.get('status') == 'EXTERNAL_CHECK_REQUIRED']
    warn_gates  = [g for g in gates if g.get('status') == 'WARN']

    p = state['phases']['P9']
    p['started_at'] = now_iso()
    p['completed_at'] = now_iso()
    p['checkpoint_path'] = None

    if fail_gates:
        p['status'] = 'FAIL'
        p['last_error'] = f'{len(fail_gates)} gate(s) FAIL: {[g["id"] for g in fail_gates]}'
        state['safe_for_main_intake'] = 'NO'
        # P11 remains NOT_STARTED (blocked)
    elif ext_gates:
        p['status'] = 'PASS'  # Validator ran OK; external checks needed before P11
        # Initialize P10 — only add new checks; do not downgrade PASS→IN_PROGRESS
        existing_checks = state.get('external_checks', [])
        new_added = False
        for g in ext_gates:
            if not any(ec['gate'] == g['id'] for ec in existing_checks):
                existing_checks.append({
                    'gate': g['id'],
                    'reason': g.get('detail', ''),
                    'required_evidence': '',
                    'resolved': False,
                    'resolution_evidence': '',
                    'resolved_at': None,
                })
                new_added = True
        state['external_checks'] = existing_checks
        # If P10 is already PASS (all prior checks resolved) and no new checks added,
        # keep P10 as PASS — a re-validate that surfaces only already-resolved gates
        # must not reset P10 back to IN_PROGRESS.
        p10_current = state['phases']['P10'].get('status', 'NOT_STARTED')
        if p10_current != 'PASS' or new_added:
            state['phases']['P10']['status'] = 'IN_PROGRESS'
    else:
        p['status'] = 'PASS'
        # No external checks needed — mark P10 NOT_APPLICABLE
        state['phases']['P10']['status'] = 'NOT_APPLICABLE'

    return state


def run_p11_freeze(state: dict) -> dict:
    """P11: FINAL_FREEZE — create freeze record if all blocking gates pass."""
    slug = state['city_slug']
    phases = state['phases']
    validator_out = state.get('validator_result', {})

    # Check P9 PASS (not FAIL)
    if phases.get('P9', {}).get('status') != 'PASS':
        state['phases']['P11']['status'] = 'FAIL'
        state['phases']['P11']['last_error'] = 'P9 VALIDATOR not PASS — cannot freeze'
        return state

    # Check P10 resolved (PASS or NOT_APPLICABLE)
    p10_status = phases.get('P10', {}).get('status', 'NOT_STARTED')
    if p10_status not in DEP_SATISFIED:
        state['phases']['P11']['status'] = 'HOLD'
        state['phases']['P11']['last_error'] = f'P10 EXTERNAL_CHECK status={p10_status} — resolve all checks first'
        return state

    # Check no FAIL gates in validator result
    gates = validator_out.get('gates', [])
    fail_gates = [g for g in gates if g.get('status') == 'FAIL']
    if fail_gates:
        state['phases']['P11']['status'] = 'FAIL'
        state['phases']['P11']['last_error'] = f'Validator FAIL gates: {[g["id"] for g in fail_gates]}'
        return state

    # Check all external checks resolved
    unresolved = [ec for ec in state.get('external_checks', []) if not ec.get('resolved')]
    if unresolved:
        state['phases']['P11']['status'] = 'HOLD'
        state['phases']['P11']['last_error'] = f'{len(unresolved)} external check(s) unresolved: {[ec["gate"] for ec in unresolved]}'
        return state

    # Create freeze record
    freeze = {
        'FINAL_FREEZE_READY': 'YES',
        'SAFE_FOR_MAIN_INTAKE': 'YES',
        'APPROVED_SHA': state.get('contract_sha', ''),
        'FINAL_SERVICE_UNIVERSE': validator_out.get('city', slug),
        'MAIN_MUST_INTAKE': [
            a.get('path', '') for a in validator_out.get('gates', [])
            # (actual artifact list comes from manifest)
        ],
        'KNOWN_ISSUES': [],
        'TARGETED_QA_REQUIRED': False,
        'frozen_at': now_iso(),
        'validator_summary': validator_out.get('summary', {}),
    }

    freeze_path = PACKAGES_DIR / slug / 'final-freeze-record-v1.json'
    atomic_save(freeze_path, freeze)

    p = state['phases']['P11']
    p['status'] = 'PASS'
    p['started_at'] = now_iso()
    p['completed_at'] = now_iso()
    p['artifacts'] = [str(freeze_path.relative_to(ROOT))]
    state['safe_for_main_intake'] = 'YES'

    return state


# ── Command handlers ─────────────────────────────────────────────────────────

def cmd_init(args):
    slug = _get_arg(args, 0)
    name_ko = _get_flag(args, '--name-ko') or slug
    name_en = _get_flag(args, '--name-en') or slug
    as_of   = _get_flag(args, '--as-of') or now_iso()[:10]
    contract_sha  = _get_flag(args, '--contract-sha') or CONTRACT_SHA_DEFAULT
    validator_sha = _get_flag(args, '--validator-sha') or VALIDATOR_SHA_DEFAULT

    sp = state_path(slug)
    if sp.exists():
        print(f'⛔ City package "{slug}" already exists: {sp}')
        print(f'   Use: status {slug}')
        sys.exit(1)

    phases = {pid: make_phase_entry(pid) for pid in PHASE_ORDER}

    state = {
        '_schema': 'city-package-state-v1',
        '_contract': 'docs/data-collection/new-city-package/multicity-new-city-package-contract-v1.md',
        'city_slug': slug,
        'city_name_ko': name_ko,
        'city_name_en': name_en,
        'as_of': as_of,
        'contract_sha': contract_sha,
        'validator_sha': validator_sha,
        'common_policy_pin': '',
        'created_at': now_iso(),
        'updated_at': now_iso(),
        'current_phase': 'P0',
        'phases': phases,
        'validator_result': None,
        'external_checks': [],
        'safe_for_main_intake': None,
        'final_freeze': None,
        'targeted_action_required': [],
    }

    # Auto-run P0 (INIT)
    state = run_p0_init(state)
    state['current_phase'] = 'P1'
    save_state(state)

    print(f'\n✅ City package initialized: {slug}')
    print(f'   도시: {name_ko} / {name_en}')
    print(f'   P0 INIT: PASS')
    print(f'   다음: python scripts/city-pipeline-v1.py next {slug}')
    print(f'   State: {state_path(slug)}')


def cmd_status(args):
    slug = _get_arg(args, 0)
    state = load_state(slug)
    phases = state['phases']

    ICON = {
        'PASS': '✅', 'FAIL': '❌', 'HOLD': '🔶',
        'IN_PROGRESS': '🔄', 'NOT_STARTED': '⬜', 'NOT_APPLICABLE': '⏭️ '
    }

    print(f'\n{"="*56}')
    print(f'  City Pipeline Status  — {state["city_name_ko"]} ({state["city_slug"]})')
    print(f'  {state["city_name_en"]}  |  as_of: {state["as_of"]}')
    print(f'{"="*56}')

    for pid in PHASE_ORDER:
        p = phases.get(pid, {})
        st = p.get('status', 'NOT_STARTED')
        icon = ICON.get(st, '?')
        blocked = '' if deps_satisfied(pid, phases) else ' [DEP BLOCKED]'
        print(f'  {icon} {pid}  {PHASES[pid]["name"]:<20s}  {st}{blocked}')
        if p.get('last_error'):
            print(f'       ⚠ {p["last_error"][:70]}')

    print(f'{"─"*56}')
    if state.get('external_checks'):
        unres = [ec for ec in state['external_checks'] if not ec.get('resolved')]
        if unres:
            print(f'  🔍 Unresolved external checks: {[ec["gate"] for ec in unres]}')

    safe = state.get('safe_for_main_intake') or 'PENDING'
    safe_icon = {'YES': '✅', 'NO': '❌', 'HOLD': '🔶', 'PENDING': '⏳'}.get(safe, '?')
    print(f'  SAFE_FOR_MAIN_INTAKE: {safe_icon} {safe}')
    print(f'{"="*56}\n')


def cmd_next(args):
    slug = _get_arg(args, 0)
    state = load_state(slug)
    phases = state['phases']

    next_pid = find_next_phase(phases)
    if next_pid is None:
        all_done = all(phases.get(pid, {}).get('status') in DEP_SATISFIED for pid in PHASE_ORDER if pid != 'P10')
        if all_done:
            print(f'✅ Pipeline complete: {slug}')
        else:
            print(f'⛔ Pipeline BLOCKED — check status: python scripts/city-pipeline-v1.py status {slug}')
        return

    phase = PHASES[next_pid]
    st = phases.get(next_pid, {}).get('status', 'NOT_STARTED')
    print(f'\n{"="*56}')
    print(f'  다음 Phase: {next_pid} — {phase["name"]}')
    print(f'  Current status: {st}')
    print(f'{"="*56}')

    doc = PIPELINE_DOCS / phase['doc']
    if doc.exists():
        print(doc.read_text(encoding='utf-8'))
    else:
        print(f'  [Instruction template: {doc}]')
    print(f'\n  완료 후: python scripts/city-pipeline-v1.py advance {slug} --phase {next_pid} --status PASS [--checkpoint <path>]')


def cmd_advance(args):
    slug = _get_arg(args, 0)
    phase_id  = _get_flag(args, '--phase', required=True)
    status    = _get_flag(args, '--status', required=True)
    cp_path   = _get_flag(args, '--checkpoint')
    notes     = _get_flag(args, '--notes') or ''

    if phase_id not in PHASES:
        print(f'⛔ Unknown phase: {phase_id}. Valid: {list(PHASES.keys())}')
        sys.exit(2)
    if status not in VALID_STATUSES:
        print(f'⛔ Unknown status: {status}. Valid: {sorted(VALID_STATUSES)}')
        sys.exit(2)

    state = load_state(slug)
    phases = state['phases']

    # Guard: PASS phase re-run protection
    current_status = phases.get(phase_id, {}).get('status', 'NOT_STARTED')
    if current_status == 'PASS' and status != 'PASS':
        print(f'  ℹ️  {phase_id} is already PASS. Overriding to {status}.')
    elif current_status == 'PASS' and status == 'PASS':
        print(f'  ✅ {phase_id} already PASS — no change needed.')
        return

    # Check deps
    if not deps_satisfied(phase_id, phases) and status == 'PASS':
        failed_deps = [d for d in PHASES[phase_id]['deps'] if phases.get(d, {}).get('status') not in DEP_SATISFIED]
        print(f'  ⛔ Dependencies not satisfied: {failed_deps}')
        sys.exit(2)

    p = phases[phase_id]
    p['status'] = status
    p['notes'] = notes
    if not p['started_at']:
        p['started_at'] = now_iso()
    if status in ('PASS', 'FAIL', 'NOT_APPLICABLE'):
        p['completed_at'] = now_iso()
    if cp_path:
        p['checkpoint_path'] = cp_path
    if status == 'FAIL':
        p['last_error'] = notes or 'FAIL (see notes)'

    state['current_phase'] = determine_current_phase(phases)
    save_state(state)
    print(f'  ✅ {phase_id} → {status}')

    # Auto-run next phase if possible
    _maybe_auto_run(state, phase_id, status)


def cmd_validate(args):
    slug = _get_arg(args, 0)
    manifest = _get_flag(args, '--manifest')
    state = load_state(slug)

    # Check P8 PASS
    if state['phases'].get('P8', {}).get('status') != 'PASS':
        print('⛔ P8 FINAL_MANIFEST must be PASS before validation.')
        sys.exit(2)

    print(f'  🔍 Running validator...')
    state = run_p9_validator(state, manifest)
    state['current_phase'] = determine_current_phase(state['phases'])
    save_state(state)

    v = state.get('validator_result', {})
    print(f'  FINAL_FREEZE_READY: {v.get("FINAL_FREEZE_READY","?")}')
    print(f'  result: {v.get("result","?")}')
    s = v.get('summary', {})
    print(f'  gates: PASS={s.get("pass",0)} FAIL={s.get("fail",0)} WARN={s.get("warn",0)} EXT={s.get("external_check_required",0)}')

    if state['phases']['P9']['status'] == 'FAIL':
        print(f'\n  ⛔ Validator FAIL — check gate results, fix issues, re-run validate.')
        sys.exit(2)
    elif state['external_checks'] and any(not ec['resolved'] for ec in state['external_checks']):
        print(f'\n  🔍 External checks required — run: ext-resolve {slug} --gate <G-XX> --evidence <text>')
        sys.exit(1)
    else:
        print(f'\n  ✅ Validator PASS — ready to freeze: python scripts/city-pipeline-v1.py freeze {slug}')


def cmd_ext_resolve(args):
    slug = _get_arg(args, 0)
    gate = _get_flag(args, '--gate', required=True)
    evidence = _get_flag(args, '--evidence') or ''
    state = load_state(slug)

    checks = state.get('external_checks', [])
    found = False
    for ec in checks:
        if ec['gate'] == gate:
            ec['resolved'] = True
            ec['resolution_evidence'] = evidence
            ec['resolved_at'] = now_iso()
            found = True
            break
    if not found:
        print(f'⛔ Gate {gate} not in external_checks list.')
        sys.exit(2)

    # Check if all resolved
    all_resolved = all(ec.get('resolved') for ec in checks)
    if all_resolved:
        state['phases']['P10']['status'] = 'PASS'
        state['phases']['P10']['completed_at'] = now_iso()
        print(f'  ✅ All external checks resolved — P10 PASS')
        print(f'  다음: python scripts/city-pipeline-v1.py validate {slug} --manifest <path>  # re-validate')
    else:
        remaining = [ec['gate'] for ec in checks if not ec.get('resolved')]
        print(f'  ✅ {gate} resolved. Remaining: {remaining}')

    state['current_phase'] = determine_current_phase(state['phases'])
    save_state(state)


def cmd_freeze(args):
    slug = _get_arg(args, 0)
    state = load_state(slug)

    state = run_p11_freeze(state)
    state['current_phase'] = determine_current_phase(state['phases'])
    save_state(state)

    p11 = state['phases']['P11']
    if p11['status'] == 'PASS':
        print(f'\n✅ FINAL_FREEZE complete: {slug}')
        print(f'  SAFE_FOR_MAIN_INTAKE: YES')
        print(f'  Freeze record: {p11["artifacts"]}')
    else:
        print(f'\n⛔ Freeze HOLD/FAIL: {p11.get("last_error","?")}')
        sys.exit(2 if p11['status'] == 'FAIL' else 1)


# ── Internal helpers ─────────────────────────────────────────────────────────

def _maybe_auto_run(state: dict, advanced_phase: str, status: str):
    """After advancing a manual phase, auto-run any following auto phases."""
    if status not in ('PASS', 'NOT_APPLICABLE'):
        return
    phases = state['phases']
    for pid in PHASE_ORDER:
        if PHASES[pid]['auto'] and phases.get(pid, {}).get('status') == 'NOT_STARTED':
            if deps_satisfied(pid, phases):
                print(f'  ⚙️  Auto-running {pid} {PHASES[pid]["name"]}...')
                if pid == 'P8':
                    state = run_p8_manifest(state)
                elif pid == 'P9':
                    state = run_p9_validator(state)
                elif pid == 'P11':
                    state = run_p11_freeze(state)
                st = state['phases'][pid].get('status', '?')
                print(f'      → {pid} {st}')
                state['current_phase'] = determine_current_phase(state['phases'])
                save_state(state)
                if st not in ('PASS', 'NOT_APPLICABLE'):
                    break


def _get_arg(args, idx: int, required: bool = True) -> str:
    try:
        return args[idx]
    except IndexError:
        if required:
            print(f'⛔ Missing positional argument #{idx}')
            sys.exit(2)
        return ''


def _get_flag(args, flag: str, required: bool = False) -> str | None:
    try:
        i = args.index(flag)
        return args[i + 1]
    except (ValueError, IndexError):
        if required:
            print(f'⛔ Missing required flag: {flag}')
            sys.exit(2)
        return None


# ── main ─────────────────────────────────────────────────────────────────────

COMMANDS = {
    'init':        cmd_init,
    'status':      cmd_status,
    'next':        cmd_next,
    'advance':     cmd_advance,
    'validate':    cmd_validate,
    'ext-resolve': cmd_ext_resolve,
    'freeze':      cmd_freeze,
}

def main():
    argv = sys.argv[1:]
    if not argv or argv[0] in ('-h', '--help'):
        print(__doc__)
        sys.exit(0)

    cmd = argv[0]
    if cmd not in COMMANDS:
        print(f'⛔ Unknown command: {cmd}. Valid: {list(COMMANDS.keys())}')
        sys.exit(2)

    COMMANDS[cmd](argv[1:])


if __name__ == '__main__':
    main()
