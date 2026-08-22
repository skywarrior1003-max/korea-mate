# -*- coding: utf-8 -*-
"""run-validator-tests-v1.py — validate-new-city-package-v1.py 자동 테스트

테스트 항목:
  T-01  fixture-valid-city-v1.json          → exit 0 또는 1 (FAIL 아님)
  T-02  fixture-invalid-arithmetic-v1.json  → exit 2, G-01/G-08/G-10 FAIL
  T-03  fixture-duplicate-identity-v1.json  → exit 2, G-02/G-03 FAIL
  T-04  fixture-raw-leakage-v1.json         → exit 2, G-12 FAIL
  T-05  fixture-external-check-v1.json      → exit 1 (HOLD), G-02/G-03 EXTERNAL_CHECK_REQUIRED
  T-06  --json 옵션: 출력이 valid JSON
  T-07  --strict 옵션: WARN이 exit 2 트리거
  T-08  없는 파일 경로: exit 2, FATAL 메시지

사용법:
    python scripts/tests/run-validator-tests-v1.py
"""
import json
import os
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ROOT = Path(__file__).parent.parent.parent
VALIDATOR = ROOT / 'scripts' / 'validate-new-city-package-v1.py'
FIXTURES  = ROOT / 'data' / 'test-fixtures' / 'new-city-package'

PYTHON = sys.executable


def run_validator(fixture_name, extra_args=None):
    """validator를 subprocess로 실행하고 (exit_code, stdout, stderr) 반환."""
    fixture = FIXTURES / fixture_name
    cmd = [PYTHON, str(VALIDATOR), str(fixture)] + (extra_args or [])
    result = subprocess.run(
        cmd, capture_output=True, text=True, encoding='utf-8',
        errors='replace', cwd=str(ROOT)
    )
    return result.returncode, result.stdout, result.stderr


def check(condition, test_id, description, detail=''):
    if condition:
        print(f'  ✅ {test_id}: {description}')
    else:
        print(f'  ❌ {test_id}: {description}')
        if detail:
            print(f'       └ {detail}')
    return condition


def main():
    print(f'\n{"="*60}')
    print(f'  Validator Test Runner  — validate-new-city-package-v1.py')
    print(f'  Fixtures: {FIXTURES}')
    print(f'{"="*60}')

    results = []

    # ── T-01: VALID fixture ────────────────────────────────────────────────
    print('\n[T-01] VALID fixture — exit 0 또는 1 (FAIL 아님)')
    code, out, err = run_validator('fixture-valid-city-v1.json', ['--json'])
    try:
        j = json.loads(out)
        is_json = True
    except Exception:
        j = {}
        is_json = False

    ok = check(code in (0, 1), 'T-01a', f'exit code ∈ {{0,1}} (실제={code})')
    results.append(ok)
    ok = check(is_json, 'T-01b', '--json 출력이 valid JSON')
    results.append(ok)
    ok = check(j.get('result') in ('PASS', 'HOLD'), 'T-01c',
               f'result=PASS 또는 HOLD (실제={j.get("result")})')
    results.append(ok)
    # G-01 PASS 확인
    g01 = next((g for g in j.get('gates', []) if g.get('id') == 'G-01'), {})
    ok = check(g01.get('status') == 'PASS', 'T-01d',
               f'G-01 PASS (실제={g01.get("status")})')
    results.append(ok)
    # G-08 PASS 확인 (coord arithmetic 195+5=200=sa)
    g08 = next((g for g in j.get('gates', []) if g.get('id') == 'G-08'), {})
    ok = check(g08.get('status') == 'PASS', 'T-01e',
               f'G-08 PASS (실제={g08.get("status")})')
    results.append(ok)
    # G-09 PASS 확인 (KO title 200 = sa 200)
    g09 = next((g for g in j.get('gates', []) if g.get('id') == 'G-09'), {})
    ok = check(g09.get('status') == 'PASS', 'T-01f',
               f'G-09 PASS (실제={g09.get("status")})')
    results.append(ok)

    # ── T-02: INVALID ARITHMETIC ───────────────────────────────────────────
    print('\n[T-02] INVALID ARITHMETIC — exit 2, G-01/G-08/G-10 FAIL')
    code, out, err = run_validator('fixture-invalid-arithmetic-v1.json', ['--json'])
    try:
        j = json.loads(out)
    except Exception:
        j = {}

    ok = check(code == 2, 'T-02a', f'exit code=2 (실제={code})')
    results.append(ok)

    def gate_status(gates, gid):
        g = next((g for g in gates if g.get('id') == gid), {})
        return g.get('status', 'MISSING')

    gates = j.get('gates', [])
    ok = check(gate_status(gates, 'G-01') == 'FAIL', 'T-02b',
               f'G-01 FAIL (실제={gate_status(gates, "G-01")})')
    results.append(ok)
    # G-08: coord 90+5=95 ≠ sa=100 → FAIL
    ok = check(gate_status(gates, 'G-08') == 'FAIL', 'T-02c',
               f'G-08 FAIL (실제={gate_status(gates, "G-08")})')
    results.append(ok)
    # G-10: image 80+10=90 ≠ sa=100 → FAIL
    ok = check(gate_status(gates, 'G-10') == 'FAIL', 'T-02d',
               f'G-10 FAIL (실제={gate_status(gates, "G-10")})')
    results.append(ok)
    ok = check(j.get('FINAL_FREEZE_READY') == 'NO', 'T-02e',
               f'FINAL_FREEZE_READY=NO (실제={j.get("FINAL_FREEZE_READY")})')
    results.append(ok)

    # ── T-03: DUPLICATE IDENTITY ───────────────────────────────────────────
    print('\n[T-03] DUPLICATE IDENTITY — exit 2, G-02/G-03/G-04 FAIL')
    code, out, err = run_validator('fixture-duplicate-identity-v1.json', ['--json'])
    try:
        j = json.loads(out)
    except Exception:
        j = {}

    ok = check(code == 2, 'T-03a', f'exit code=2 (실제={code})')
    results.append(ok)
    gates = j.get('gates', [])
    ok = check(gate_status(gates, 'G-02') == 'FAIL', 'T-03b',
               f'G-02 FAIL (실제={gate_status(gates, "G-02")})')
    results.append(ok)
    ok = check(gate_status(gates, 'G-03') == 'FAIL', 'T-03c',
               f'G-03 FAIL (실제={gate_status(gates, "G-03")})')
    results.append(ok)
    ok = check(gate_status(gates, 'G-04') == 'FAIL', 'T-03d',
               f'G-04 FAIL (duplicate>0 → 혼합 의심) (실제={gate_status(gates, "G-04")})')
    results.append(ok)

    # ── T-04: RAW LEAKAGE ─────────────────────────────────────────────────
    print('\n[T-04] RAW LEAKAGE — exit 2, G-09/G-12 FAIL')
    code, out, err = run_validator('fixture-raw-leakage-v1.json', ['--json'])
    try:
        j = json.loads(out)
    except Exception:
        j = {}

    ok = check(code == 2, 'T-04a', f'exit code=2 (실제={code})')
    results.append(ok)
    gates = j.get('gates', [])
    ok = check(gate_status(gates, 'G-12') == 'FAIL', 'T-04b',
               f'G-12 FAIL (raw/ 패턴 경로 감지) (실제={gate_status(gates, "G-12")})')
    results.append(ok)
    ok = check(gate_status(gates, 'G-09') == 'FAIL', 'T-04c',
               f'G-09 FAIL (KO title=190 < sa=200) (실제={gate_status(gates, "G-09")})')
    results.append(ok)

    # ── T-05: EXTERNAL CHECK REQUIRED ─────────────────────────────────────
    print('\n[T-05] EXTERNAL CHECK — exit 1, G-02/G-03 EXTERNAL_CHECK_REQUIRED')
    code, out, err = run_validator('fixture-external-check-v1.json', ['--json'])
    try:
        j = json.loads(out)
    except Exception:
        j = {}

    # exit 1(HOLD) 또는 0(PASS, git 체크가 다 통과한 경우)
    ok = check(code in (0, 1), 'T-05a', f'exit code ≠ 2 (실제={code})')
    results.append(ok)
    gates = j.get('gates', [])
    ok = check(gate_status(gates, 'G-02') == 'EXTERNAL_CHECK_REQUIRED', 'T-05b',
               f'G-02 EXTERNAL_CHECK_REQUIRED (실제={gate_status(gates, "G-02")})')
    results.append(ok)
    ok = check(gate_status(gates, 'G-03') == 'EXTERNAL_CHECK_REQUIRED', 'T-05c',
               f'G-03 EXTERNAL_CHECK_REQUIRED (실제={gate_status(gates, "G-03")})')
    results.append(ok)
    ok = check(gate_status(gates, 'G-11') == 'WARN', 'T-05d',
               f'G-11 WARN (regional artifact 있음, linkage 수동 검사) (실제={gate_status(gates, "G-11")})')
    results.append(ok)
    # G-05 EXTERNAL_CHECK_REQUIRED (템플릿 경로)
    ok = check(gate_status(gates, 'G-05') == 'EXTERNAL_CHECK_REQUIRED', 'T-05e',
               f'G-05 EXTERNAL_CHECK_REQUIRED (템플릿 경로) (실제={gate_status(gates, "G-05")})')
    results.append(ok)

    # ── T-06: --json 출력 형식 ─────────────────────────────────────────────
    print('\n[T-06] --json 출력 — valid JSON, 필수 필드 존재')
    code, out, err = run_validator('fixture-valid-city-v1.json', ['--json'])
    try:
        j = json.loads(out)
        is_json = True
    except Exception:
        j = {}
        is_json = False

    ok = check(is_json, 'T-06a', '--json 출력이 valid JSON')
    results.append(ok)
    required_fields = ['validator', 'run_at', 'city', 'FINAL_FREEZE_READY',
                       'result', 'safe_for_main_intake', 'gates', 'summary']
    missing_fields = [f for f in required_fields if f not in j]
    ok = check(not missing_fields, 'T-06b',
               f'필수 필드 모두 존재 (누락={missing_fields})')
    results.append(ok)
    ok = check(isinstance(j.get('gates'), list) and len(j.get('gates', [])) == 15,
               'T-06c', f'gates 배열 15개 (실제={len(j.get("gates",[]))})')
    results.append(ok)

    # ── T-07: --strict 옵션 ────────────────────────────────────────────────
    print('\n[T-07] --strict 옵션 — WARN이 있으면 exit 2')
    # VALID fixture: G-07은 description_ko_count=190 > 0 이라 WARN 없음
    # G-11은 regional 없어 NA. G-15는 reproducibility 있어 PASS.
    # → strict로도 exit 0 또는 1이 나올 수 있음
    # invalid-arithmetic: G-07 warn check (coord=90 > 0, desc=95 > 0, image=80 > 0 → PASS)
    # strict 테스트는 VALID fixture에서 WARN이 있는지 확인
    code_normal, out_n, _ = run_validator('fixture-valid-city-v1.json', ['--json'])
    code_strict, out_s, _ = run_validator('fixture-valid-city-v1.json', ['--json', '--strict'])
    try:
        j_n = json.loads(out_n)
        j_s = json.loads(out_s)
    except Exception:
        j_n = {}
        j_s = {}

    has_warn_normal = j_n.get('summary', {}).get('warn', 0) > 0
    # strict=true → strict_mode 필드 true
    ok = check(j_s.get('strict_mode') is True, 'T-07a',
               f'--strict 시 strict_mode=true 기록 (실제={j_s.get("strict_mode")})')
    results.append(ok)
    # WARN이 없는 VALID fixture에서는 strict/non-strict 동일 결과 기대
    if not has_warn_normal:
        ok = check(code_strict <= 1, 'T-07b',
                   f'WARN 없는 경우 strict exit ≤ 1 (실제={code_strict})')
    else:
        # WARN 있으면 strict에서 exit 2여야 함
        ok = check(code_strict == 2, 'T-07b',
                   f'WARN 있는 경우 strict exit=2 (실제={code_strict})')
    results.append(ok)

    # ── T-08: 없는 파일 ────────────────────────────────────────────────────
    print('\n[T-08] 없는 파일 경로 — exit 2, FATAL 메시지')
    code, out, err = run_validator('__nonexistent_fixture_xyz__.json')
    ok = check(code == 2, 'T-08a', f'exit code=2 (실제={code})')
    results.append(ok)
    ok = check('FATAL' in err or 'FATAL' in out or 'Error' in err, 'T-08b',
               'FATAL 또는 Error 메시지 출력')
    results.append(ok)

    # ── 집계 ───────────────────────────────────────────────────────────────
    total  = len(results)
    passed = sum(1 for r in results if r)
    failed = total - passed

    print(f'\n{"─"*60}')
    print(f'  결과: {passed}/{total} PASS  |  {failed} FAIL')
    print(f'{"="*60}\n')

    if failed > 0:
        print('  ⛔ 테스트 실패 — validator 또는 fixture 수정 필요')
        sys.exit(1)
    else:
        print('  ✅ 모든 테스트 PASS')
        sys.exit(0)


if __name__ == '__main__':
    main()
