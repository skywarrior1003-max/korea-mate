# -*- coding: utf-8 -*-
"""run-pipeline-tests-v1.py — city-pipeline-v1.py 자동 테스트 (Synthetic / Mock)

실제 신규 도시 수집 없이 synthetic city package로 6개 시나리오를 검증한다.
기존 5도시 데이터에 영향 없음.

Test Cases:
  CASE-A: 정상 진행 (INIT → P1-P7 PASS → manifest → validate → freeze)
  CASE-B: 중간 HOLD (P3 HOLD → state 저장 → resume P3부터 재개)
  CASE-C: PASS Phase 보호 (P2 PASS → advance P2 again → no re-run)
  CASE-D: Validator FAIL (P9 FAIL → P11 차단)
  CASE-E: External Check (EXT_CHECK_REQUIRED → P10 → revalidate → freeze)
  CASE-F: Raw leakage / arithmetic 오류 → validator 차단

사용법:
    python scripts/tests/run-pipeline-tests-v1.py
"""
import json
import os
import shutil
import subprocess
import sys
import time
import uuid
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ROOT     = Path(__file__).parent.parent.parent
PIPELINE = ROOT / 'scripts' / 'city-pipeline-v1.py'
FIXTURES = ROOT / 'data' / 'test-fixtures' / 'new-city-package'
PACKAGES = ROOT / 'data' / 'city-packages'
PYTHON   = sys.executable

# Unique prefix per test run (prevents collisions with real city packages)
RUN_ID = uuid.uuid4().hex[:8]


def run_cmd(args):
    """Run pipeline command, return (returncode, stdout, stderr)."""
    cmd = [PYTHON, str(PIPELINE)] + [str(a) for a in args]
    result = subprocess.run(
        cmd, capture_output=True, text=True, encoding='utf-8',
        errors='replace', cwd=str(ROOT)
    )
    return result.returncode, result.stdout, result.stderr


def slug(base: str) -> str:
    return f'_t{RUN_ID}-{base}'


def state_of(slug_name: str) -> dict:
    return json.loads((PACKAGES / slug_name / 'city-package-state.json').read_text(encoding='utf-8'))


def check(condition, test_id, description, detail=''):
    if condition:
        print(f'  ✅ {test_id}: {description}')
    else:
        print(f'  ❌ {test_id}: {description}')
        if detail:
            print(f'       └ {detail}')
    return bool(condition)


# ── Checkpoint helpers ───────────────────────────────────────────────────────

def write_checkpoint(slug_name: str, phase: str, data: dict) -> str:
    """Write checkpoint, return repo-relative path string."""
    p = PACKAGES / slug_name / 'checkpoints' / f'{phase.lower()}-checkpoint.json'
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    return str(p.relative_to(ROOT))


def make_food_cp(slug_name: str, sa: int = 50, ex: int = 5) -> str:
    cn = sa + ex
    return write_checkpoint(slug_name, 'P2', {
        '_schema': 'phase-checkpoint-v1', '_phase': 'P2',
        'city_slug': slug_name, 'completed_at': '2026-08-22T00:00:00Z',
        'universe': {'discovered_count': cn + 10, 'canonical_count': cn,
                     'service_active_count': sa, 'excluded_count': ex,
                     'relation_context_count': 0, 'expired_count': 0, 'review_count': 0},
        'category_counts': {'restaurant': sa},
        'identity': {'canonical_id_count': cn, 'canonical_id_duplicate_count': 0,
                     'source_key_coverage': sa, 'source_key_duplicate_count': 0,
                     'canonical_id': {'type': 'source-derived', 'source_id_available': 'YES',
                                      'deterministic': 'YES', 'cross_run_stable': 'YES'}},
    })


def make_nonfood_cp(slug_name: str, sa: int = 80, ex: int = 8) -> str:
    cn = sa + ex
    return write_checkpoint(slug_name, 'P3', {
        '_schema': 'phase-checkpoint-v1', '_phase': 'P3',
        'city_slug': slug_name, 'completed_at': '2026-08-22T00:00:00Z',
        'universe': {'discovered_count': cn + 20, 'canonical_count': cn,
                     'service_active_count': sa, 'excluded_count': ex,
                     'relation_context_count': 0, 'expired_count': 0, 'review_count': 0},
        'category_counts': {'attraction': sa // 2, 'nature': sa // 4, 'shopping': sa - (sa // 2) - (sa // 4)},
        'identity': {'canonical_id_count': cn, 'canonical_id_duplicate_count': 0,
                     'source_key_coverage': sa, 'source_key_duplicate_count': 0,
                     'canonical_id': {'type': 'source-derived', 'source_id_available': 'YES',
                                      'deterministic': 'YES', 'cross_run_stable': 'YES'}},
    })


def make_multilingual_cp(slug_name: str, sa: int = 130) -> str:
    return write_checkpoint(slug_name, 'P5', {
        '_schema': 'phase-checkpoint-v1', '_phase': 'P5',
        'city_slug': slug_name, 'completed_at': '2026-08-22T00:00:00Z',
        'locale': {
            'ko':    {'title_count': sa, 'description_count': sa - 10, 'gap_count': 10, 'gap_by_reason': {'SOURCE_HAS_NO_VALUE': 10}},
            'en':    {'title_count': 90, 'description_count': 60, 'gap_count': 40, 'gap_by_reason': {'COLLECTION_GAP': 40}},
            'ja':    {'title_count': 80, 'description_count': 50, 'gap_count': 50, 'gap_by_reason': {'COLLECTION_GAP': 50}},
            'zh-CN': {'title_count': 80, 'description_count': 50, 'gap_count': 50, 'gap_by_reason': {'COLLECTION_GAP': 50}},
        },
    })


def make_media_cp(slug_name: str, sa: int = 130) -> str:
    return write_checkpoint(slug_name, 'P6', {
        '_schema': 'phase-checkpoint-v1', '_phase': 'P6',
        'city_slug': slug_name, 'completed_at': '2026-08-22T00:00:00Z',
        'data_readiness': {
            'coord_valid_count': sa - 5, 'coord_missing_count': 5,
            'nav_ready_count': sa - 10, 'nav_missing_count': 10,
            'image_display_eligible_count': sa - 10, 'image_missing_count': 10,
            'image_provenance_count': sa - 10,
            'description_ko_count': sa - 10, 'description_ko_missing_count': 10,
        },
    })


def make_regional_cp(slug_name: str) -> str:
    return write_checkpoint(slug_name, 'P7', {
        '_schema': 'phase-checkpoint-v1', '_phase': 'P7',
        'city_slug': slug_name, 'completed_at': '2026-08-22T00:00:00Z',
        'regional': {
            'has_content': True, 'courses_count': 3, 'course_stops_count': 12,
            'recommended_now_count': 5,
            'guides_count': {'ko': 3, 'en': 3, 'ja': 2, 'zh-CN': 2},
            'utility_categories': ['transport', 'payment'],
            'artifact_path': f'data/regional-recommendations/normalized/{slug_name}-regional-content-normalized-v1.json',
            'new_place_candidates': 0, 'schema': 'normalized-v1',
        },
    })


def get_head_sha() -> str:
    """Get current git HEAD SHA for test manifest patching."""
    try:
        result = subprocess.run(
            ['git', 'rev-parse', 'HEAD'], capture_output=True, text=True,
            encoding='utf-8', cwd=str(ROOT)
        )
        return result.stdout.strip()
    except Exception:
        return 'UNKNOWN_SHA'


def patch_manifest_for_test(mf_path: Path, approved_sha: str = None, with_ext_check: bool = False):
    """Patch auto-generated manifest to fix G-13 (approved_sha) and fill required fields."""
    mf = json.loads(mf_path.read_text(encoding='utf-8'))
    sha = approved_sha or get_head_sha()
    mf['approved_sha'] = sha

    # Fix identity fields (G-02/G-03) — unless with_ext_check leaves them missing
    if not with_ext_check:
        ident = mf.get('identity', {})
        ident['canonical_id_duplicate_count'] = 0
        ident['source_key_duplicate_count'] = 0
        ident['source_key_coverage'] = mf.get('universe', {}).get('service_active_count', 0)
        mf['identity'] = ident
    else:
        # Remove duplicate_count fields to trigger EXTERNAL_CHECK_REQUIRED for G-02/G-03
        ident = mf.get('identity', {})
        ident.pop('canonical_id_duplicate_count', None)
        ident.pop('source_key_duplicate_count', None)
        mf['identity'] = ident

    # G-15: fill reproducibility
    rel = mf.get('release', {})
    rel['reproducibility'] = 'fixed_as_of=2026-08-22; sort=source_key_asc; deterministic=YES'
    mf['release'] = rel

    # G-05: add minimal template-path artifact if none present
    # Template path ({city}) → G-05 becomes EXTERNAL_CHECK_REQUIRED, not FAIL
    if not mf.get('artifacts'):
        sa = mf.get('universe', {}).get('service_active_count', 0)
        mf['artifacts'] = [
            {
                'id': 'core_canonical',
                'path': 'data/{city}-final-release/{city}-canonical-places-v1.jsonl',
                'type': 'JSONL',
                'runtime_allowed': True,
                'layer': 'A',
                'row_count': sa,
                'filter_for_service': 'service_status=SERVICE_ACTIVE',
            }
        ]

    mf_path.write_text(json.dumps(mf, ensure_ascii=False, indent=2), encoding='utf-8')
    return mf_path


def advance_p1_to_p7(slug_name: str, sa_food: int = 50, sa_nonfood: int = 80) -> bool:
    """Advance P1-P7 to PASS/NOT_APPLICABLE using mock checkpoints."""
    sa_total = sa_food + sa_nonfood
    steps = [
        ('P1', 'PASS', None),
        ('P2', 'PASS', make_food_cp(slug_name, sa=sa_food)),
        ('P3', 'PASS', make_nonfood_cp(slug_name, sa=sa_nonfood)),
        ('P4', 'NOT_APPLICABLE', None),
        ('P5', 'PASS', make_multilingual_cp(slug_name, sa=sa_total)),
        ('P6', 'PASS', make_media_cp(slug_name, sa=sa_total)),
        ('P7', 'PASS', make_regional_cp(slug_name)),
    ]
    for phase, status, cp_path in steps:
        args = ['advance', slug_name, '--phase', phase, '--status', status]
        if cp_path:
            args += ['--checkpoint', cp_path]
        code, _, _ = run_cmd(args)
        if code != 0:
            return False
    return True


# ── Test Cases ───────────────────────────────────────────────────────────────

def case_a():
    """CASE-A: 정상 진행"""
    print('\n[CASE-A] 정상 진행')
    s = slug('city-a')
    results = []

    code, out, _ = run_cmd(['init', s, '--name-ko', '테스트A', '--name-en', 'TestA',
                             '--contract-sha', '11b6220e1306e30329d3ec61c96adee387529646'])
    results.append(check(code == 0, 'A-01', f'init 성공 (exit={code})'))

    state = state_of(s)
    results.append(check(state['phases']['P0']['status'] == 'PASS', 'A-02', 'P0 auto-PASS'))

    ok = advance_p1_to_p7(s)
    results.append(check(ok, 'A-03', 'P1-P7 advance 성공'))

    state = state_of(s)
    p8 = state['phases']['P8']['status']
    results.append(check(p8 == 'PASS', 'A-04', f'P8 auto-PASS (status={p8})'))

    mf = PACKAGES / s / 'final-manifest-v1.json'
    results.append(check(mf.exists(), 'A-05', 'final-manifest-v1.json 생성됨'))

    if mf.exists():
        u = json.loads(mf.read_text(encoding='utf-8')).get('universe', {})
        results.append(check(u.get('arithmetic_valid') is True, 'A-06', 'manifest arithmetic_valid=true'))

    # Patch auto-generated manifest: approved_sha=HEAD, fill identity/reproducibility
    mf_path = PACKAGES / s / 'final-manifest-v1.json'
    patch_manifest_for_test(mf_path)

    code, out, _ = run_cmd(['validate', s, '--manifest', str(mf_path)])
    results.append(check(code in (0, 1), 'A-07', f'validate exit 0|1 (exit={code})'))

    state = state_of(s)
    if state['phases']['P9']['status'] == 'PASS':
        # resolve any external checks first
        for ec in state.get('external_checks', []):
            if not ec.get('resolved'):
                run_cmd(['ext-resolve', s, '--gate', ec['gate'], '--evidence', 'confirmed OK'])
        code, out, _ = run_cmd(['freeze', s])
        results.append(check(code == 0, 'A-08', f'freeze 성공 (exit={code})'))
        state = state_of(s)
        results.append(check(state['phases']['P11']['status'] == 'PASS', 'A-09', 'P11 PASS'))
    else:
        results.extend([check(False, 'A-08', 'P9 not PASS'), False])

    return results


def case_b():
    """CASE-B: 중간 HOLD / Resume"""
    print('\n[CASE-B] 중간 HOLD / Resume')
    s = slug('city-b')
    results = []

    run_cmd(['init', s, '--name-ko', '테스트B', '--name-en', 'TestB'])
    run_cmd(['advance', s, '--phase', 'P1', '--status', 'PASS'])
    run_cmd(['advance', s, '--phase', 'P2', '--status', 'PASS',
             '--checkpoint', make_food_cp(s)])

    code, _, _ = run_cmd(['advance', s, '--phase', 'P3', '--status', 'HOLD',
                           '--notes', 'source 접근 차단됨'])
    results.append(check(code == 0, 'B-01', 'P3 HOLD advance OK'))

    state = state_of(s)
    results.append(check(state['phases']['P3']['status'] == 'HOLD', 'B-02', 'P3 state=HOLD'))
    results.append(check(state['phases']['P4']['status'] == 'NOT_STARTED', 'B-03', 'P4 NOT_STARTED (dep blocked)'))

    # Resume P3 to PASS
    code, _, _ = run_cmd(['advance', s, '--phase', 'P3', '--status', 'PASS',
                           '--checkpoint', make_nonfood_cp(s)])
    results.append(check(code == 0, 'B-04', 'P3 재개 PASS'))

    state = state_of(s)
    results.append(check(state['phases']['P3']['status'] == 'PASS', 'B-05', 'P3 PASS after resume'))
    return results


def case_c():
    """CASE-C: PASS Phase 보호"""
    print('\n[CASE-C] PASS Phase 보호')
    s = slug('city-c')
    results = []

    run_cmd(['init', s, '--name-ko', '테스트C', '--name-en', 'TestC'])
    run_cmd(['advance', s, '--phase', 'P1', '--status', 'PASS'])
    run_cmd(['advance', s, '--phase', 'P2', '--status', 'PASS', '--checkpoint', make_food_cp(s)])

    state_before = state_of(s)
    completed_before = state_before['phases']['P2']['completed_at']

    time.sleep(0.05)
    code, out, _ = run_cmd(['advance', s, '--phase', 'P2', '--status', 'PASS'])
    results.append(check(code == 0, 'C-01', 'P2 중복 advance exit=0'))

    state_after = state_of(s)
    results.append(check(state_after['phases']['P2']['completed_at'] == completed_before,
                         'C-02', 'P2 completed_at 변경 없음 (re-run 보호)'))
    results.append(check('already PASS' in out, 'C-03', '"already PASS" 메시지 출력'))
    return results


def case_d():
    """CASE-D: Validator FAIL → P11 차단"""
    print('\n[CASE-D] Validator FAIL → P11 차단')
    s = slug('city-d')
    results = []

    run_cmd(['init', s, '--name-ko', '테스트D', '--name-en', 'TestD'])
    ok = advance_p1_to_p7(s)
    results.append(check(ok, 'D-01', 'P1-P7 advance 성공'))

    code, _, _ = run_cmd(['validate', s, '--manifest', str(FIXTURES / 'fixture-invalid-arithmetic-v1.json')])
    results.append(check(code == 2, 'D-02', f'validate exit=2 (exit={code})'))

    state = state_of(s)
    results.append(check(state['phases']['P9']['status'] == 'FAIL', 'D-03',
                         f'P9 FAIL (실제={state["phases"]["P9"]["status"]})'))

    code, _, _ = run_cmd(['freeze', s])
    results.append(check(code != 0, 'D-04', f'freeze 차단 (exit={code})'))
    state = state_of(s)
    results.append(check(state['phases']['P11']['status'] != 'PASS', 'D-05',
                         f'P11 not PASS (실제={state["phases"]["P11"]["status"]})'))
    return results


def case_e():
    """CASE-E: External Check → P10 → revalidate → freeze"""
    print('\n[CASE-E] External Check flow')
    s = slug('city-e')
    results = []

    run_cmd(['init', s, '--name-ko', '테스트E', '--name-en', 'TestE'])
    ok = advance_p1_to_p7(s)
    results.append(check(ok, 'E-01', 'P1-P7 advance 성공'))

    # Use auto-generated manifest with identity fields REMOVED → G-02/G-03 EXTERNAL_CHECK_REQUIRED
    mf_path = PACKAGES / s / 'final-manifest-v1.json'
    patch_manifest_for_test(mf_path, with_ext_check=True)

    code, _, _ = run_cmd(['validate', s, '--manifest', str(mf_path)])
    results.append(check(code in (0, 1), 'E-02', f'ext-check validate exit 0|1 (exit={code})'))

    state = state_of(s)
    results.append(check(state['phases']['P9']['status'] == 'PASS', 'E-03',
                         f'P9 PASS (실제={state["phases"]["P9"]["status"]})'))
    results.append(check(state['phases']['P10']['status'] == 'IN_PROGRESS', 'E-04',
                         f'P10 IN_PROGRESS (실제={state["phases"]["P10"]["status"]})'))

    ext = state.get('external_checks', [])
    results.append(check(len(ext) > 0, 'E-05', f'external_checks 등록됨 ({len(ext)}건)'))

    for ec in ext:
        run_cmd(['ext-resolve', s, '--gate', ec['gate'], '--evidence', f'{ec["gate"]} confirmed OK'])

    state = state_of(s)
    results.append(check(state['phases']['P10']['status'] == 'PASS', 'E-06',
                         f'P10 PASS after resolve (실제={state["phases"]["P10"]["status"]})'))

    # Re-validate with manifest patched to have all fields (clean second run)
    patch_manifest_for_test(mf_path, with_ext_check=False)
    code, _, _ = run_cmd(['validate', s, '--manifest', str(mf_path)])
    results.append(check(code in (0, 1), 'E-07', f'revalidate exit 0|1 (exit={code})'))

    state = state_of(s)
    # After revalidation, if no FAIL, attempt freeze
    if state['phases']['P9']['status'] == 'PASS':
        # resolve any new external checks
        for ec in state.get('external_checks', []):
            if not ec.get('resolved'):
                run_cmd(['ext-resolve', s, '--gate', ec['gate'], '--evidence', 'confirmed OK'])
        code, _, _ = run_cmd(['freeze', s])
        results.append(check(code == 0, 'E-08', f'freeze 성공 (exit={code})'))
    else:
        results.append(check(False, 'E-08', f'P9 not PASS, freeze skip'))
    return results


def case_f():
    """CASE-F: Raw leakage + arithmetic 오류 → validator 차단"""
    print('\n[CASE-F] Raw Leakage / Arithmetic 오류 → 차단')
    s1 = slug('city-f1')
    s2 = slug('city-f2')
    results = []

    # F1: raw leakage fixture
    run_cmd(['init', s1, '--name-ko', '테스트F1', '--name-en', 'TestF1'])
    advance_p1_to_p7(s1)
    code, _, _ = run_cmd(['validate', s1, '--manifest', str(FIXTURES / 'fixture-raw-leakage-v1.json')])
    results.append(check(code == 2, 'F-01', f'raw leakage → exit=2 (exit={code})'))
    state = state_of(s1)
    results.append(check(state['phases']['P9']['status'] == 'FAIL', 'F-02', 'P9 FAIL (raw leakage)'))
    code, _, _ = run_cmd(['freeze', s1])
    results.append(check(code != 0, 'F-03', f'freeze 차단 (exit={code})'))

    # F2: arithmetic failure
    run_cmd(['init', s2, '--name-ko', '테스트F2', '--name-en', 'TestF2'])
    advance_p1_to_p7(s2)
    code, _, _ = run_cmd(['validate', s2, '--manifest', str(FIXTURES / 'fixture-invalid-arithmetic-v1.json')])
    results.append(check(code == 2, 'F-04', f'arithmetic error → exit=2 (exit={code})'))
    state = state_of(s2)
    results.append(check(state['phases']['P9']['status'] == 'FAIL', 'F-05', 'P9 FAIL (arithmetic)'))
    return results


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    print(f'\n{"="*60}')
    print(f'  City Pipeline Test Runner  — city-pipeline-v1.py')
    print(f'  Run ID: {RUN_ID}')
    print(f'{"="*60}')

    all_results = []
    cases = [case_a, case_b, case_c, case_d, case_e, case_f]

    # Collect all test slugs for cleanup
    test_slugs = []
    for case_fn in cases:
        base = case_fn.__name__.replace('case_', 'city-')
        if base == 'city-f':
            test_slugs.extend([slug('city-f1'), slug('city-f2')])
        else:
            test_slugs.append(slug(base))

    try:
        for case_fn in cases:
            try:
                results = case_fn()
                all_results.extend(r for r in results if isinstance(r, bool))
            except Exception as ex:
                print(f'  ⛔ {case_fn.__name__} 예외: {ex}')
                import traceback; traceback.print_exc()
                all_results.append(False)
    finally:
        # Clean up test packages
        for s in test_slugs:
            pkg = PACKAGES / s
            if pkg.exists():
                shutil.rmtree(pkg, ignore_errors=True)
        print(f'\n  🧹 테스트 패키지 정리 완료')

    total  = len(all_results)
    passed = sum(1 for r in all_results if r)
    failed = total - passed

    print(f'\n{"─"*60}')
    print(f'  결과: {passed}/{total} PASS  |  {failed} FAIL')
    print(f'{"="*60}\n')

    if failed > 0:
        print('  ⛔ 테스트 실패')
        sys.exit(1)
    else:
        print('  ✅ 모든 테스트 PASS')
        sys.exit(0)


if __name__ == '__main__':
    main()
