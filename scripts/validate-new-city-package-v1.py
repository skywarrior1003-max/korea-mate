# -*- coding: utf-8 -*-
"""validate-new-city-package-v1.py — GoKoreaMate New City Package Release Gate Validator

Contract: docs/data-collection/new-city-package/multicity-new-city-package-contract-v1.md §제14조
G-01~G-15 자동 검사. 기존 5도시 강제 실행 금지, 신규 도시 opt-in 전용.

사용법:
    python scripts/validate-new-city-package-v1.py <manifest-path> [--json] [--strict]

Exit codes:
    0  = PASS  (모든 HOLD gate 통과, WARN 없음 또는 무시)
    1  = HOLD  (WARN 또는 EXTERNAL_CHECK_REQUIRED 존재, HOLD gate 없음)
    2  = FAIL  (HOLD gate 1개 이상 실패)

--strict : WARN 항목도 blocking으로 처리 (exit code 2)
--json   : 결과를 JSON으로 출력 (사람용 텍스트 대신)
"""
import json
import os
import sys
from pathlib import Path
from datetime import datetime, timezone

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ROOT = Path(__file__).parent.parent
VALIDATOR_VERSION = "1.0.0"
CONTRACT_REF = "docs/data-collection/new-city-package/multicity-new-city-package-contract-v1.md §제14조"

# G-12: 이 패턴이 runtime_allowed=true, layer=A 아티팩트 경로에 있으면 FAIL
RAW_PATH_PATTERNS = [
    'raw/', '/raw', '-raw-', '_raw',
    'discovery/', '-discovery-',
    '/scratch/', '/tmp/',
    'nightly/', 'collection-log',
]

HOLD_GATES = {'G-01', 'G-02', 'G-03', 'G-04', 'G-05', 'G-06', 'G-08', 'G-09', 'G-10', 'G-12', 'G-13', 'G-14'}
WARN_GATES = {'G-07', 'G-11', 'G-15'}


# ── 유틸리티 ────────────────────────────────────────────────────────────────

def now_iso():
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


def git_info():
    """현재 git HEAD 및 branch 정보를 반환한다."""
    try:
        import subprocess
        cwd = str(ROOT)
        head = subprocess.check_output(
            ['git', 'rev-parse', 'HEAD'], cwd=cwd, text=True,
            stderr=subprocess.DEVNULL).strip()
        branch = subprocess.check_output(
            ['git', 'rev-parse', '--abbrev-ref', 'HEAD'], cwd=cwd, text=True,
            stderr=subprocess.DEVNULL).strip()
        return {'head': head, 'branch': branch, 'ok': True}
    except Exception as e:
        return {'head': None, 'branch': None, 'ok': False, 'error': str(e)}


def git_origin_head(branch):
    """origin의 branch HEAD SHA를 가져온다 (G-14 전용)."""
    try:
        import subprocess
        cwd = str(ROOT)
        subprocess.check_output(
            ['git', 'fetch', '--no-tags', 'origin', branch],
            cwd=cwd, text=True, stderr=subprocess.DEVNULL)
        sha = subprocess.check_output(
            ['git', 'rev-parse', f'origin/{branch}'],
            cwd=cwd, text=True, stderr=subprocess.DEVNULL).strip()
        return sha
    except Exception:
        return None


def read_manifest(path):
    text = Path(path).read_text(encoding='utf-8-sig')
    return json.loads(text)


def load_jsonl_records(path):
    """JSONL 파일을 읽어 레코드 리스트 반환. (record, None) or (None, errmsg)."""
    p = Path(path)
    if not p.exists():
        return None, f'파일 없음: {p}'
    try:
        lines = [l.strip() for l in p.read_text(encoding='utf-8-sig').splitlines()
                 if l.strip() and not l.strip().startswith('#')]
        return [json.loads(l) for l in lines], None
    except Exception as e:
        return None, str(e)


def make_gate(gate_id, status, detail, actual=None, expected=None):
    g = {'id': gate_id, 'status': status, 'detail': detail}
    if actual is not None:
        g['actual'] = actual
    if expected is not None:
        g['expected'] = expected
    return g


# ── Gate 구현 (G-01 ~ G-15) ────────────────────────────────────────────────

def g01_universe_arithmetic(mf):
    """G-01: service_active + excluded + relation + expired + review = canonical"""
    u = mf.get('universe', {})
    sa = u.get('service_active_count', 0)
    ex = u.get('excluded_count', 0)
    rc = u.get('relation_context_count', 0)
    ep = u.get('expired_count', 0)
    rv = u.get('review_count', 0)
    cn = u.get('canonical_count', 0)
    total = sa + ex + rc + ep + rv

    mf_valid = u.get('arithmetic_valid', None)

    if total == cn:
        if mf_valid is False:
            return make_gate('G-01', 'FAIL',
                f'계산은 맞으나 manifest.arithmetic_valid=false — 수정 필요',
                actual=f'{sa}+{ex}+{rc}+{ep}+{rv}={total}', expected=f'canonical={cn}')
        return make_gate('G-01', 'PASS',
            f'{sa}+{ex}+{rc}+{ep}+{rv}={total} = canonical({cn})',
            actual=total, expected=cn)
    return make_gate('G-01', 'FAIL',
        f'universe arithmetic 불일치: {sa}+{ex}+{rc}+{ep}+{rv}={total} ≠ canonical={cn}',
        actual=total, expected=cn)


def g02_canonical_id_unique(mf):
    """G-02: canonical_id 중복 없음"""
    ident = mf.get('identity', {})
    dup = ident.get('canonical_id_duplicate_count', None)
    if dup is None:
        return make_gate('G-02', 'EXTERNAL_CHECK_REQUIRED',
            'manifest에 canonical_id_duplicate_count 필드 없음 — 아티팩트 직접 검사 필요')
    if dup == 0:
        total = ident.get('canonical_id_count', '?')
        return make_gate('G-02', 'PASS',
            f'canonical_id 중복 없음 (총 {total}건)', actual=dup, expected=0)
    return make_gate('G-02', 'FAIL',
        f'canonical_id 중복 {dup}건 감지', actual=dup, expected=0)


def g03_source_key_unique(mf):
    """G-03: service universe 내 source_key 중복 없음"""
    ident = mf.get('identity', {})
    dup = ident.get('source_key_duplicate_count', None)
    coverage = ident.get('source_key_coverage', 0)
    sa = mf.get('universe', {}).get('service_active_count', 0)

    # source_key 미사용 도시(internal-sequential ID) → NA
    can_id = mf.get('canonical_id', {})
    if sa > 0 and coverage == 0 and can_id.get('source_id_available') in ('NO',):
        return make_gate('G-03', 'NOT_APPLICABLE',
            'source_key 없는 도시 (internal sequential ID 전용) — 건너뜀')

    if dup is None:
        return make_gate('G-03', 'EXTERNAL_CHECK_REQUIRED',
            'manifest에 source_key_duplicate_count 필드 없음 — 아티팩트 직접 검사 필요')
    if dup == 0:
        return make_gate('G-03', 'PASS',
            f'service universe source_key 중복 없음 (coverage={coverage}건)',
            actual=dup, expected=0)
    return make_gate('G-03', 'FAIL',
        f'source_key 중복 {dup}건 감지', actual=dup, expected=0)


def g04_service_excluded_separation(mf):
    """G-04: SERVICE_ACTIVE와 EXCLUDED 혼합 없음 (same canonical_id가 양쪽에 속하면 FAIL)
    manifest 레벨에서는 canonical_id_duplicate_count를 간접 지표로 사용.
    완전 검증은 아티팩트 직접 읽기 필요 → EXTERNAL_CHECK_REQUIRED.
    """
    ident = mf.get('identity', {})
    dup = ident.get('canonical_id_duplicate_count', None)

    if dup is not None and dup > 0:
        # canonical_id 중복이 있으면 혼합 가능성 → FAIL
        return make_gate('G-04', 'FAIL',
            f'canonical_id_duplicate_count={dup} — SERVICE_ACTIVE/EXCLUDED 혼합 가능성, 아티팩트 검사 필요',
            actual=dup, expected=0)

    # manifest 레벨에서 완전 검증 불가
    return make_gate('G-04', 'EXTERNAL_CHECK_REQUIRED',
        'service_status 혼합 여부는 canonical artifact 직접 검사 필요 (manifest 레벨 한계)')


def g05_required_artifacts_exist(mf, manifest_dir=None):
    """G-05: runtime_allowed=true, layer=A 아티팩트 전체 존재"""
    artifacts = mf.get('artifacts', [])
    required = [
        a for a in artifacts
        if a.get('runtime_allowed') is True and str(a.get('layer', '')).upper().startswith('A')
        and a.get('layer', '') != 'A_META'
    ]

    if not required:
        return make_gate('G-05', 'FAIL',
            'runtime_allowed=true, layer=A 아티팩트 0건 — 필수 아티팩트 미등록')

    missing = []
    not_checkable = []
    for a in required:
        path_str = a.get('path', '')
        if '{' in path_str:
            # 템플릿 변수 포함 → 직접 확인 불가
            not_checkable.append(f'{a.get("id","?")}:{path_str}')
            continue
        if manifest_dir:
            candidates = [manifest_dir / path_str, ROOT / path_str]
            if not any(c.exists() for c in candidates):
                missing.append(f'{a.get("id","?")}:{path_str}')

    if missing:
        return make_gate('G-05', 'FAIL',
            f'필수 아티팩트 파일 {len(missing)}개 없음: {missing}')

    if not_checkable:
        return make_gate('G-05', 'EXTERNAL_CHECK_REQUIRED',
            f'runtime_allowed A 아티팩트 {len(required)}건 중 {len(not_checkable)}건 템플릿 경로 — 수동 확인 필요')

    return make_gate('G-05', 'PASS',
        f'runtime_allowed A 아티팩트 {len(required)}건 확인 완료')


def g06_manifest_row_count_match(mf, manifest_dir=None):
    """G-06: manifest row count = artifact record count"""
    sa = mf.get('universe', {}).get('service_active_count', 0)
    core = next((a for a in mf.get('artifacts', []) if a.get('id') == 'core_canonical'), None)

    if not core:
        return make_gate('G-06', 'EXTERNAL_CHECK_REQUIRED',
            'core_canonical 아티팩트가 manifest에 없음')

    mf_count = core.get('row_count', None)
    if mf_count is None:
        return make_gate('G-06', 'EXTERNAL_CHECK_REQUIRED',
            'core_canonical.row_count 필드 없음 — 아티팩트 직접 검사 필요')

    if mf_count != sa:
        return make_gate('G-06', 'FAIL',
            f'core_canonical.row_count={mf_count} ≠ service_active_count={sa}',
            actual=mf_count, expected=sa)

    # 파일이 있으면 실제 레코드 수 검증
    path_str = core.get('path', '')
    if manifest_dir and '{' not in path_str:
        for base in [manifest_dir, ROOT]:
            full = base / path_str
            if full.exists():
                records, err = load_jsonl_records(full)
                if err:
                    return make_gate('G-06', 'WARN',
                        f'manifest count={mf_count} 일치하나 파일 읽기 실패: {err}')
                active = [r for r in records
                          if r.get('service_status') in ('SERVICE_ACTIVE', 'ACTIVE')]
                if len(active) != sa:
                    return make_gate('G-06', 'FAIL',
                        f'실제 SERVICE_ACTIVE {len(active)}건 ≠ manifest service_active_count={sa}',
                        actual=len(active), expected=sa)
                return make_gate('G-06', 'PASS',
                    f'manifest={mf_count} = 아티팩트 SERVICE_ACTIVE={len(active)} (파일 검증 완료)',
                    actual=len(active), expected=sa)

    return make_gate('G-06', 'PASS',
        f'core_canonical.row_count={mf_count} = service_active_count={sa}',
        actual=mf_count, expected=sa)


def g07_provenance_coverage(mf):
    """G-07: 주요 필드 provenance coverage > 0 (WARN)"""
    dr = mf.get('data_readiness', {})
    sa = mf.get('universe', {}).get('service_active_count', 0)
    if sa == 0:
        return make_gate('G-07', 'PASS', 'service_active=0, coverage 검사 불필요')

    zero_fields = []
    if dr.get('description_ko_count', 0) == 0:
        zero_fields.append('description_ko_count')
    if dr.get('coord_valid_count', 0) == 0:
        zero_fields.append('coord_valid_count')
    if dr.get('image_display_eligible_count', 0) == 0:
        zero_fields.append('image_display_eligible_count')

    if zero_fields:
        return make_gate('G-07', 'WARN',
            f'provenance coverage=0 필드 (service_active={sa}): {", ".join(zero_fields)}')
    return make_gate('G-07', 'PASS',
        f'주요 provenance fields coverage > 0 확인 (sa={sa})')


def g08_coord_arithmetic(mf):
    """G-08: coord_valid + coord_missing = service_active"""
    dr = mf.get('data_readiness', {})
    sa = mf.get('universe', {}).get('service_active_count', 0)
    valid = dr.get('coord_valid_count', 0)
    miss = dr.get('coord_missing_count', 0)
    total = valid + miss

    if total == sa:
        return make_gate('G-08', 'PASS',
            f'coord_valid({valid}) + coord_missing({miss}) = {total} = service_active({sa})',
            actual=total, expected=sa)
    return make_gate('G-08', 'FAIL',
        f'coord_valid({valid}) + coord_missing({miss}) = {total} ≠ service_active({sa})',
        actual=total, expected=sa)


def g09_ko_title_coverage(mf):
    """G-09: multilingual KO title 100% (service_active)"""
    sa = mf.get('universe', {}).get('service_active_count', 0)
    ko = mf.get('locale', {}).get('ko', {})
    title = ko.get('title_count', 0)

    if sa == 0:
        return make_gate('G-09', 'PASS', 'service_active=0, KO title 검사 불필요')
    if title >= sa:
        return make_gate('G-09', 'PASS',
            f'KO title={title} ≥ service_active={sa} (100% 충족)',
            actual=title, expected=sa)
    return make_gate('G-09', 'FAIL',
        f'KO title={title} < service_active={sa} — {sa - title}건 누락',
        actual=title, expected=sa)


def g10_image_count_match(mf):
    """G-10: image_display_eligible + image_missing = service_active"""
    dr = mf.get('data_readiness', {})
    sa = mf.get('universe', {}).get('service_active_count', 0)
    eligible = dr.get('image_display_eligible_count', 0)
    miss = dr.get('image_missing_count', 0)
    total = eligible + miss

    if total == sa:
        return make_gate('G-10', 'PASS',
            f'image_eligible({eligible}) + image_missing({miss}) = {total} = service_active({sa})',
            actual=total, expected=sa)
    return make_gate('G-10', 'FAIL',
        f'image_eligible({eligible}) + image_missing({miss}) = {total} ≠ service_active({sa})',
        actual=total, expected=sa)


def g11_regional_linkage(mf):
    """G-11: Regional linkage arithmetic (EXACT+REL+EVENT+NEW+UNC = total refs) (WARN)"""
    regional = next(
        (a for a in mf.get('artifacts', []) if a.get('id') == 'regional_normalized'),
        None
    )
    if not regional:
        return make_gate('G-11', 'NOT_APPLICABLE',
            'regional_normalized 아티팩트 없음 — G-11 건너뜀')

    # regional 아티팩트 내 linkage 통계는 manifest에 포함되지 않음
    # → 아티팩트 직접 읽기 필요 (WARN: blocking 아님)
    return make_gate('G-11', 'WARN',
        'Regional linkage arithmetic (EXACT+REL+EVENT+NEW+UNC) 검증은 regional artifact 직접 읽기 필요')


def g12_no_raw_path_in_core(mf):
    """G-12: MAIN_MUST_NOT_INTAKE 경로가 Core artifact에서 참조되지 않음
    manifest 레벨: runtime_allowed=true, layer=A 아티팩트 경로에 raw 패턴 확인.
    아티팩트 내부 content 검사는 EXTERNAL_CHECK_REQUIRED.
    """
    artifacts = mf.get('artifacts', [])
    bad_paths = []
    for a in artifacts:
        if a.get('runtime_allowed') is True and str(a.get('layer', '')).upper().startswith('A'):
            p = a.get('path', '').lower()
            for pat in RAW_PATH_PATTERNS:
                if pat in p:
                    bad_paths.append(f'{a.get("id","?")}:{a.get("path","")}')
                    break

    if bad_paths:
        return make_gate('G-12', 'FAIL',
            f'runtime_allowed A 아티팩트 경로에 raw/discovery 패턴 포함: {bad_paths}')

    # 아티팩트 내용 검사는 manifest 레벨에서 불가
    return make_gate('G-12', 'EXTERNAL_CHECK_REQUIRED',
        '아티팩트 내부 raw 경로 참조 검사는 파일 직접 읽기 필요 (manifest 경로 패턴 이상 없음)')


def g13_sha_match_approved(mf):
    """G-13: manifest.approved_sha ↔ local git HEAD 일치"""
    approved = mf.get('approved_sha', '') or ''
    if not approved or approved in ('CANONICAL_BRANCH_SHA', 'BRANCH_HEAD_SHA'):
        return make_gate('G-13', 'FAIL',
            f'manifest.approved_sha 미설정 또는 템플릿 값: "{approved}"',
            actual=approved or '(empty)', expected='실제 branch HEAD SHA')

    ginfo = git_info()
    if not ginfo['ok']:
        return make_gate('G-13', 'EXTERNAL_CHECK_REQUIRED',
            f'git 실행 실패 — 수동 검사 필요: {ginfo.get("error","")}')

    local_head = ginfo['head'] or ''
    # short SHA(최소 8자) 또는 full SHA 비교
    match = (local_head == approved) or \
            (len(approved) >= 8 and local_head.startswith(approved)) or \
            (len(local_head) >= 8 and approved.startswith(local_head))
    if match:
        return make_gate('G-13', 'PASS',
            f'approved_sha={approved[:12]}... = local HEAD {local_head[:12]}...',
            actual=local_head[:12], expected=approved[:12])

    return make_gate('G-13', 'FAIL',
        f'approved_sha={approved[:12]}... ≠ local HEAD={local_head[:12] if local_head else "?"}',
        actual=local_head[:12] if local_head else '?', expected=approved[:12])


def g14_local_origin_match(mf):
    """G-14: local HEAD = origin HEAD (force push 없음)"""
    ginfo = git_info()
    if not ginfo['ok']:
        return make_gate('G-14', 'EXTERNAL_CHECK_REQUIRED',
            f'git 실행 실패 — 수동 확인 필요: {ginfo.get("error","")}')

    branch = ginfo.get('branch', '')
    local_head = ginfo.get('head', '')

    if not branch or branch == 'HEAD':
        return make_gate('G-14', 'EXTERNAL_CHECK_REQUIRED',
            'detached HEAD 상태 — branch 확인 후 수동 검사 필요')

    origin_head = git_origin_head(branch)
    if origin_head is None:
        return make_gate('G-14', 'EXTERNAL_CHECK_REQUIRED',
            f'origin/{branch} fetch 실패 — 네트워크/권한 문제, 수동 확인 필요')

    if local_head == origin_head:
        return make_gate('G-14', 'PASS',
            f'local HEAD = origin/{branch} ({local_head[:12]}...)',
            actual=local_head[:12], expected=origin_head[:12])
    return make_gate('G-14', 'FAIL',
        f'local HEAD({local_head[:12]}) ≠ origin/{branch}({origin_head[:12]}) — force push 또는 미push 가능성',
        actual=local_head[:12], expected=origin_head[:12])


def g15_reproducibility_recorded(mf):
    """G-15: release.reproducibility 필드 기록 완료 (WARN)"""
    release = mf.get('release', {})
    repro = (release.get('reproducibility') or '').strip()

    if not repro:
        return make_gate('G-15', 'WARN', 'release.reproducibility 미기록 — 재현성 기록 필요')

    rl = repro.lower()
    has_sort = 'sort=' in rl or 'sort:' in rl
    has_date = 'fixed_as_of' in rl or any(c.isdigit() for c in repro)

    if not (has_sort or has_date):
        return make_gate('G-15', 'WARN',
            f'reproducibility 내용 부실 (sort/date 미포함): "{repro[:80]}"')
    return make_gate('G-15', 'PASS',
        f'reproducibility 기록 완료: "{repro[:80]}"')


# ── 실행 ────────────────────────────────────────────────────────────────────

def run_all_gates(mf, manifest_dir):
    return [
        g01_universe_arithmetic(mf),
        g02_canonical_id_unique(mf),
        g03_source_key_unique(mf),
        g04_service_excluded_separation(mf),
        g05_required_artifacts_exist(mf, manifest_dir),
        g06_manifest_row_count_match(mf, manifest_dir),
        g07_provenance_coverage(mf),
        g08_coord_arithmetic(mf),
        g09_ko_title_coverage(mf),
        g10_image_count_match(mf),
        g11_regional_linkage(mf),
        g12_no_raw_path_in_core(mf),
        g13_sha_match_approved(mf),
        g14_local_origin_match(mf),
        g15_reproducibility_recorded(mf),
    ]


def aggregate(gates, strict):
    statuses = [g['status'] for g in gates]
    has_fail  = any(s == 'FAIL' for s in statuses)
    has_ext   = any(s == 'EXTERNAL_CHECK_REQUIRED' for s in statuses)
    has_warn  = any(s == 'WARN' for s in statuses)

    if strict:
        has_fail = has_fail or has_warn

    if has_fail:
        final, safe, code = 'NO', 'NO', 2
    elif has_ext or has_warn:
        final, safe, code = 'HOLD', 'HOLD', 1
    else:
        final, safe, code = 'YES', 'YES', 0

    return {
        'FINAL_FREEZE_READY': final,
        'result': 'PASS' if code == 0 else ('HOLD' if code == 1 else 'FAIL'),
        'safe_for_main_intake': safe,
        'exit_code': code,
        'summary': {
            'total': len(gates),
            'pass': statuses.count('PASS'),
            'fail': statuses.count('FAIL'),
            'warn': statuses.count('WARN'),
            'not_applicable': statuses.count('NOT_APPLICABLE'),
            'external_check_required': statuses.count('EXTERNAL_CHECK_REQUIRED'),
        },
        'errors':   [g for g in gates if g['status'] == 'FAIL'],
        'warnings': [g for g in gates if g['status'] == 'WARN'],
        'external_checks': [g for g in gates if g['status'] == 'EXTERNAL_CHECK_REQUIRED'],
    }


def run_validation(manifest_path, strict=False, json_out=False):
    manifest_path = Path(manifest_path)
    manifest_dir  = manifest_path.parent

    try:
        mf = read_manifest(manifest_path)
    except Exception as e:
        print(f'FATAL: manifest 읽기 실패: {e}', file=sys.stderr)
        sys.exit(2)

    schema = mf.get('_schema', '')
    if schema and schema not in ('new-city-final-manifest-v1',):
        if not json_out:
            print(f'WARN: manifest._schema="{schema}" — new-city-final-manifest-v1 권장', flush=True)

    gates  = run_all_gates(mf, manifest_dir)
    agg    = aggregate(gates, strict)

    output = {
        'validator': f'validate-new-city-package-v1 {VALIDATOR_VERSION}',
        'contract': CONTRACT_REF,
        'run_at': now_iso(),
        'city': mf.get('city', '?'),
        'manifest': str(manifest_path),
        'strict_mode': strict,
        **agg,
        'gates': gates,
    }

    if json_out:
        print(json.dumps(output, ensure_ascii=False, indent=2))
    else:
        _print_human(output)

    return agg['exit_code']


def _print_human(result):
    ICON = {
        'PASS': '✅', 'FAIL': '❌', 'WARN': '⚠️ ',
        'NOT_APPLICABLE': '⏭️ ', 'EXTERNAL_CHECK_REQUIRED': '🔍',
    }
    STATUS_ICON = {'YES': '✅', 'NO': '❌', 'HOLD': '🔶'}

    city = result['city']
    final = result['FINAL_FREEZE_READY']
    safe  = result['safe_for_main_intake']
    s     = result['summary']

    print(f'\n{"="*64}')
    print(f'  GoKoreaMate New City Package Validator  v{VALIDATOR_VERSION}')
    print(f'  도시: {city}   |   실행: {result["run_at"]}')
    print(f'{"="*64}')

    for g in result['gates']:
        icon   = ICON.get(g['status'], '?')
        status = g['status']
        detail = g['detail']
        print(f'  {icon} {g["id"]:4s}  [{status:<25s}]  {detail}')
        if 'actual' in g or 'expected' in g:
            print(f'        └ actual={g.get("actual","?")}  expected={g.get("expected","?")}')

    print(f'\n{"─"*64}')
    print(f'  집계: PASS={s["pass"]} | FAIL={s["fail"]} | WARN={s["warn"]}'
          f' | NA={s["not_applicable"]} | EXT={s["external_check_required"]}')
    print(f'\n  FINAL_FREEZE_READY   = {STATUS_ICON.get(final,"?")} {final}')
    print(f'  SAFE_FOR_MAIN_INTAKE = {STATUS_ICON.get(safe,"?")}  {safe}')

    if result['errors']:
        print(f'\n  ⛔ HOLD 필요 ({len(result["errors"])}건):')
        for e in result['errors']:
            print(f'     - {e["id"]}: {e["detail"][:90]}')
    if result['warnings']:
        print(f'\n  ⚠️   Targeted QA 권고 ({len(result["warnings"])}건):')
        for w in result['warnings']:
            print(f'     - {w["id"]}: {w["detail"][:90]}')
    if result['external_checks']:
        print(f'\n  🔍 수동 검사 필요 ({len(result["external_checks"])}건):')
        for ec in result['external_checks']:
            print(f'     - {ec["id"]}: {ec["detail"][:90]}')

    if result['strict_mode']:
        print('\n  [STRICT MODE: WARN도 blocking 처리]')

    print(f'{"="*64}\n')


# ── main ────────────────────────────────────────────────────────────────────

def main():
    args = sys.argv[1:]
    if not args or args[0] in ('-h', '--help'):
        print(__doc__)
        sys.exit(0)

    manifest_path = args[0]
    json_out = '--json' in args
    strict   = '--strict' in args

    code = run_validation(manifest_path, strict=strict, json_out=json_out)
    sys.exit(code)


if __name__ == '__main__':
    main()
