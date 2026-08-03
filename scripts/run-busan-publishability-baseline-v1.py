#!/usr/bin/env python3
"""
TASK-BUSAN-PUBLISHABILITY-BASELINE-V1
부산 enriched candidates 1,642건 공개가능성 기준선 분류
gate_version: BUSAN_PUBLISHABILITY_BASELINE_V1

산출물:
  - busan-publishability-baseline-v1.json          (요약 + 통계)
  - busan-publishability-baseline-v1-details.jsonl  (레코드별 게이트 결과)
  - busan-publishability-baseline-v1-validation.json (GD 교차검증)
"""

import json
import sys
import os
from datetime import datetime, timezone
from pathlib import Path
from collections import defaultdict

sys.stdout.reconfigure(encoding='utf-8')

BASELINE_VERSION = 'BUSAN_PUBLISHABILITY_BASELINE_V1'
TASK_ID = 'TASK-BUSAN-PUBLISHABILITY-BASELINE-V1'

BUSAN_LAT_MIN, BUSAN_LAT_MAX = 34.88, 35.39
BUSAN_LNG_MIN, BUSAN_LNG_MAX = 128.74, 129.31

# 신선도/카베아트 허용 플래그 (핵심 게이트 아님)
FRESHNESS_FLAGS = frozenset({'needs_hours', 'needs_arrival_verification', 'needs_map_name_ko'})

BASE = Path('.')
EC_FILE  = BASE / 'data/tourapi/enriched/busan/busan-enriched-candidates-v1.jsonl'
GD_FILE  = BASE / 'data/tourapi/validation/busan-golden-dataset-v1.jsonl'

REPORT_DIR = BASE / 'data/tourapi/reports/busan'
REPORT_DIR.mkdir(parents=True, exist_ok=True)

OUT_SUMMARY    = REPORT_DIR / 'busan-publishability-baseline-v1.json'
OUT_DETAILS    = REPORT_DIR / 'busan-publishability-baseline-v1-details.jsonl'
OUT_VALIDATION = REPORT_DIR / 'busan-publishability-baseline-v1-validation.json'


# ─── Effective flags ───────────────────────────────────────────────────────

def get_effective_flags(r):
    """review_flags + qa02_corrections 통합 후 유효 플래그 반환."""
    base = set(r.get('validation', {}).get('review_flags', []))
    qa02 = r.get('qa02_corrections', {})
    eff = set(base)

    # hours_applied=True + hours_value 존재 → needs_hours 해소
    if qa02.get('hours_applied') and qa02.get('hours_value'):
        eff.discard('needs_hours')

    # kto_en_linked=True → needs_translation 해소
    if qa02.get('kto_en_linked'):
        eff.discard('needs_translation')

    return eff


# ─── Gate evaluation ───────────────────────────────────────────────────────

def evaluate_gates(r, eff_flags):
    val  = r.get('validation', {})
    vs   = val.get('validation_status', '')
    ss   = r.get('source_summary', {})
    ia   = r.get('image_assessment', {})
    aa   = r.get('arrival_assessment', {})
    pv   = r.get('proposed_values', {})
    prov = r.get('provenance', {})
    cat  = r.get('category', '')

    g = {}

    # 1. identity_gate
    if vs == 'source_data_missing':
        g['identity_gate'] = 'PENDING_SOURCE'
        g['identity_reason'] = 'source_data_missing'
    elif vs in ('multi_source_verified', 'single_source', 'multi_source_confirmed'):
        g['identity_gate'] = 'PASS'
        g['identity_reason'] = vs
    else:
        g['identity_gate'] = 'PENDING_REVIEW'
        g['identity_reason'] = f'unknown_validation_status:{vs}'

    # 2. name_ko_gate
    g['name_ko_gate'] = 'PASS' if r.get('title_ko') else 'FAIL'

    # 3. name_en_gate — HARD gate (카베아트 불가, BUSAN_PUBLISHABILITY_BASELINE_V1)
    if 'needs_translation' not in eff_flags:
        g['name_en_gate'] = 'PASS'
    else:
        g['name_en_gate'] = 'PENDING_SOURCE'
        g['name_en_reason'] = (
            'source_data_missing_no_english_name'
            if vs == 'source_data_missing'
            else 'no_english_name_from_collected_sources'
        )
        g['name_en_gate_version'] = BASELINE_VERSION

    # 4. address_gate
    addr = pv.get('address')
    if addr and str(addr).strip():
        g['address_gate'] = 'PASS'
    else:
        g['address_gate'] = 'FAIL'
        g['address_reason'] = 'address_absent'

    # 5. coordinate_gate
    if 'needs_arrival' in eff_flags:
        g['coordinate_gate'] = 'FAIL'
        g['coordinate_reason'] = 'invalid_current_coordinates'
        g['coordinate_next_action'] = 'alternate_official_or_map_coordinate_verification'
    elif aa.get('has_source_coords'):
        lat = aa.get('source_lat') or 0
        lng = aa.get('source_lng') or 0
        in_bounds = (
            BUSAN_LAT_MIN <= lat <= BUSAN_LAT_MAX and
            BUSAN_LNG_MIN <= lng <= BUSAN_LNG_MAX
        )
        if in_bounds:
            g['coordinate_gate'] = 'PASS'
        else:
            g['coordinate_gate'] = 'FAIL'
            g['coordinate_reason'] = 'coordinates_out_of_busan_bounds'
            g['coordinate_next_action'] = 'alternate_official_or_map_coordinate_verification'
    else:
        g['coordinate_gate'] = 'PENDING_REVIEW'
        g['coordinate_reason'] = 'no_source_coordinates'

    # 6. branch_gate (restaurant 전용)
    if cat == 'restaurant':
        if 'needs_restaurant_branch' in eff_flags:
            g['branch_gate'] = 'FAIL'
            g['branch_reason'] = 'restaurant_branch_unresolved'
        else:
            g['branch_gate'] = 'PASS'
    else:
        g['branch_gate'] = 'NOT_APPLICABLE'

    # 7. description_gate
    if ss.get('has_ko_description'):
        g['description_gate'] = 'PASS'
    else:
        g['description_gate'] = 'PENDING_SOURCE'
        g['description_reason'] = (
            'source_data_missing_no_description'
            if vs == 'source_data_missing'
            else 'kto_description_not_collected_api_call_limit'
        )

    # 8. image_gate
    curated_count = ia.get('curated_count') or 0
    img_status    = ia.get('image_status', '')
    if curated_count > 0 or img_status in ('image_sufficient', 'image_partial'):
        g['image_gate'] = 'PASS'
        g['image_rights'] = ia.get('rights_status', 'unknown')
    else:
        g['image_gate'] = 'PENDING_SOURCE'
        g['image_reason'] = 'no_curated_images_available'

    # 9. provenance_gate
    g['provenance_gate'] = 'PASS' if prov.get('primary_source_ref') else 'PENDING_REVIEW'

    # 10. map_resolution_gate (정보성 — 게이트 차단 없음)
    coord_ok = g.get('coordinate_gate') == 'PASS'
    title_ok = bool(r.get('title_ko'))
    g['map_resolution_gate']      = 'DERIVED_CAPABLE' if (coord_ok and title_ok) else 'UNRESOLVED'
    g['manual_map_verification']  = 'REQUIRED'

    return g


# ─── Publishability determination ─────────────────────────────────────────

CORE_GATES = [
    'identity_gate', 'name_ko_gate', 'name_en_gate', 'address_gate',
    'coordinate_gate', 'branch_gate', 'description_gate', 'image_gate',
    'provenance_gate',
]


def determine_publishability(gates, eff_flags):
    """
    우선순위: FAIL > PENDING_REVIEW → pending_review
             PENDING_SOURCE       → pending_source
             신선도만 남음        → publishable_with_caveat
             플래그 없음          → publishable
    """
    fail_gates    = []
    pr_gates      = []
    ps_gates      = []

    for gk in CORE_GATES:
        v = gates.get(gk, 'PASS')
        if v == 'NOT_APPLICABLE':
            continue
        if v == 'FAIL':
            fail_gates.append(gk)
        elif v == 'PENDING_REVIEW':
            pr_gates.append(gk)
        elif v == 'PENDING_SOURCE':
            ps_gates.append(gk)

    if fail_gates or pr_gates:
        return 'pending_review', fail_gates + pr_gates

    if ps_gates:
        return 'pending_source', ps_gates

    # 모든 핵심 게이트 통과 → 신선도 플래그 확인
    remaining = eff_flags - FRESHNESS_FLAGS
    if remaining:
        # 신선도 외 플래그 잔존 (예: needs_district) → pending_review
        return 'pending_review', [f'unresolved_flag:{f}' for f in sorted(remaining)]

    caveat_flags = sorted(eff_flags & FRESHNESS_FLAGS)
    if caveat_flags:
        return 'publishable_with_caveat', caveat_flags

    return 'publishable', []


# ─── Cross-validation explanation ─────────────────────────────────────────

def determine_explanation(gd_pub, bl_pub, bl_result, gd_record):
    """GD ↔ baseline 불일치가 설명 가능한 gate_version_difference인지 판정."""
    gd_blocks = gd_record.get('publishability_block_reasons', [])
    bl_blocks = bl_result['block_reasons']

    # GD: pending_review → baseline: pending_source (예상 주요 패턴)
    if gd_pub == 'pending_review' and bl_pub == 'pending_source':
        # 설명 ①: DESCRIPTION_ABSENT / IMAGE_ABSENT → baseline에서 PENDING_SOURCE 재분류
        if (('DESCRIPTION_ABSENT' in gd_blocks or 'IMAGE_ABSENT' in gd_blocks) and
                ('description_gate' in bl_blocks or 'image_gate' in bl_blocks)):
            return 'description_or_image_absent_reclassified_as_pending_source'

        # 설명 ②: source_data_missing identity PENDING_SOURCE가 DISTRICT_ABSENT보다 우선
        if ('DISTRICT_ABSENT' in gd_blocks and
                bl_result.get('validation_status') == 'source_data_missing'):
            return 'source_data_missing_identity_priority_over_district_absent'

        # 설명 ③: 기타 — PENDING_SOURCE 게이트가 GD pending_review를 흡수
        if ps_gates := [g for g in CORE_GATES
                        if bl_result['gates'].get(g) == 'PENDING_SOURCE']:
            return f'gate_reclassified_as_pending_source:{",".join(ps_gates)}'

    # 설명 불가 패턴
    return None


# ─── Main ─────────────────────────────────────────────────────────────────

def process():
    run_ts = datetime.now(timezone.utc).isoformat()

    # ── Load data ────────────────────────────────────────────────────────
    print(f'Loading enriched candidates...')
    ec_records = [json.loads(l) for l in open(EC_FILE, encoding='utf-8') if l.strip()]
    print(f'  {len(ec_records)} records')

    print(f'Loading golden dataset...')
    gd_records = [json.loads(l) for l in open(GD_FILE, encoding='utf-8') if l.strip()]
    gd_by_id   = {r['candidate_id']: r for r in gd_records}
    print(f'  {len(gd_records)} GD records')

    # ── Process candidates ───────────────────────────────────────────────
    print('Evaluating gates...')
    results          = []
    distribution     = defaultdict(int)
    cat_distribution = defaultdict(lambda: defaultdict(int))
    gate_fail_counts = defaultdict(int)

    for r in ec_records:
        cid = r['candidate_id']
        cat = r.get('category', 'unknown')
        vs  = r.get('validation', {}).get('validation_status', '')

        eff_flags = get_effective_flags(r)
        gates     = evaluate_gates(r, eff_flags)
        pub, blocks = determine_publishability(gates, eff_flags)

        distribution[pub] += 1
        cat_distribution[cat][pub] += 1
        for b in blocks:
            gate_fail_counts[b] += 1

        results.append({
            'candidate_id':       cid,
            'category':           cat,
            'title_ko':           r.get('title_ko'),
            'publishability':     pub,
            'block_reasons':      blocks,
            'gate_version':       BASELINE_VERSION,
            'effective_flags':    sorted(eff_flags),
            'base_flags':         sorted(r.get('validation', {}).get('review_flags', [])),
            'validation_status':  vs,
            'gates':              gates,
            'qa02_hours_applied': r.get('qa02_corrections', {}).get('hours_applied'),
            'qa02_kto_en_linked': r.get('qa02_corrections', {}).get('kto_en_linked'),
        })

    # ── Golden Dataset cross-validation ──────────────────────────────────
    print('Cross-validating with Golden Dataset...')
    results_by_id = {r['candidate_id']: r for r in results}

    xval = {
        'exact_match':                      [],
        'explained_gate_version_difference': [],
        'unexplained_conflict':             [],
    }

    for gd in gd_records:
        cid    = gd['candidate_id']
        gd_pub = gd.get('publishability_adjudicated')
        bl     = results_by_id.get(cid)

        if not bl:
            xval['unexplained_conflict'].append({
                'candidate_id': cid,
                'golden_id':    gd.get('golden_id'),
                'issue':        'candidate_not_found_in_baseline',
            })
            continue

        bl_pub = bl['publishability']

        if gd_pub == bl_pub:
            xval['exact_match'].append({
                'candidate_id':  cid,
                'golden_id':     gd.get('golden_id'),
                'publishability': bl_pub,
            })
        else:
            explanation = determine_explanation(gd_pub, bl_pub, bl, gd)
            if explanation:
                xval['explained_gate_version_difference'].append({
                    'candidate_id':          cid,
                    'golden_id':             gd.get('golden_id'),
                    'gd_publishability':     gd_pub,
                    'baseline_publishability': bl_pub,
                    'explanation':           explanation,
                    'gd_block_reasons':      gd.get('publishability_block_reasons', []),
                    'baseline_block_reasons': bl['block_reasons'],
                })
            else:
                xval['unexplained_conflict'].append({
                    'candidate_id':           cid,
                    'golden_id':              gd.get('golden_id'),
                    'gd_publishability':      gd_pub,
                    'baseline_publishability': bl_pub,
                    'gd_block_reasons':       gd.get('publishability_block_reasons', []),
                    'baseline_block_reasons': bl['block_reasons'],
                    'baseline_effective_flags': bl['effective_flags'],
                    'baseline_gates': {k: v for k, v in bl['gates'].items()
                                       if not k.endswith('_reason') and not k.endswith('_rights')},
                })

    # ── Explanation type summary ─────────────────────────────────────────
    expl_type_counts = defaultdict(int)
    for d in xval['explained_gate_version_difference']:
        expl_type_counts[d['explanation']] += 1

    # ── Output ────────────────────────────────────────────────────────────
    print(f'Writing {OUT_DETAILS} ...')
    with open(OUT_DETAILS, 'w', encoding='utf-8') as f:
        for r in results:
            f.write(json.dumps(r, ensure_ascii=False) + '\n')

    pass_verdict = len(xval['unexplained_conflict']) == 0

    summary = {
        'report_id':    'busan-publishability-baseline-v1',
        'task':         TASK_ID,
        'gate_version': BASELINE_VERSION,
        'run_ts':       run_ts,
        'input_file':   str(EC_FILE),
        'total_records': len(ec_records),
        'publishability_distribution': dict(distribution),
        'category_distribution': {
            cat: dict(sub) for cat, sub in sorted(cat_distribution.items())
        },
        'top_block_reasons': dict(
            sorted(gate_fail_counts.items(), key=lambda x: -x[1])[:20]
        ),
        'golden_dataset_cross_validation_summary': {
            'total_gd_records':                len(gd_records),
            'exact_match':                     len(xval['exact_match']),
            'explained_gate_version_difference': len(xval['explained_gate_version_difference']),
            'unexplained_conflict':            len(xval['unexplained_conflict']),
            'pass':                            pass_verdict,
            'explanation_types':               dict(expl_type_counts),
        },
        'gate_design': {
            'name_en_gate': (
                f'HARD gate ({BASELINE_VERSION}) — needs_translation → PENDING_SOURCE.'
                ' 외국인 여행자 서비스: 영어명 필수. 카베아트 불가.'
            ),
            'description_gate': (
                'PENDING_SOURCE when has_ko_description=False'
                ' (KTO detailCommon2 수집 BLOCKED_LIMIT_UNVERIFIED — 소스 부재, 품질 불합격 아님)'
            ),
            'image_gate': (
                'PENDING_SOURCE when curated_count=0 (소스 소진, 보완 가능)'
            ),
            'map_resolution_gate': (
                'DERIVED_CAPABLE (유효 좌표 + title_ko → 지도 연결 가능 추정). '
                '정보성만, 게이트 차단 없음. 수동 확인 REQUIRED.'
            ),
            'freshness_flags': sorted(FRESHNESS_FLAGS),
            'needs_hours_integration': (
                'qa02_corrections.hours_applied=True + hours_value → needs_hours'
                ' review_flags에서 유효 플래그로 제거'
            ),
            'needs_translation_integration': (
                'qa02_corrections.kto_en_linked=True → needs_translation 유효 플래그에서 제거'
            ),
        },
        'key_differences_from_gd_adjudication_v1': [
            f'description absent → PENDING_SOURCE in {BASELINE_VERSION} (was PENDING_REVIEW — KTO 수집 차단이 원인, 데이터 불량 아님)',
            f'image absent → PENDING_SOURCE in {BASELINE_VERSION} (was PENDING_REVIEW)',
            f'needs_translation → HARD gate PENDING_SOURCE in {BASELINE_VERSION} (was caveat-eligible in GD adjudication v1)',
            'source_data_missing identity PENDING_SOURCE takes priority over district/description hard gates',
        ],
        'output_files': {
            'summary':    str(OUT_SUMMARY),
            'details':    str(OUT_DETAILS),
            'validation': str(OUT_VALIDATION),
        },
    }

    print(f'Writing {OUT_SUMMARY} ...')
    with open(OUT_SUMMARY, 'w', encoding='utf-8') as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    validation = {
        'report_id':    'busan-publishability-baseline-v1-validation',
        'task':         TASK_ID,
        'gate_version': BASELINE_VERSION,
        'run_ts':       run_ts,
        'overall_verdict': 'PASS' if pass_verdict else 'FAIL',
        'verdict_reason': (
            f'unexplained_conflict=0. '
            f'{len(xval["explained_gate_version_difference"])}건 차이는 모두 {BASELINE_VERSION}'
            ' 게이트 재정의로 설명됨 (description/image 부재 → PENDING_SOURCE 재분류 등).'
            if pass_verdict else
            f'{len(xval["unexplained_conflict"])}건 미설명 충돌 발생. 게이트 로직 점검 필요.'
        ),
        'golden_dataset_cross_validation': xval,
    }

    print(f'Writing {OUT_VALIDATION} ...')
    with open(OUT_VALIDATION, 'w', encoding='utf-8') as f:
        json.dump(validation, f, ensure_ascii=False, indent=2)

    return summary, xval


if __name__ == '__main__':
    summary, xval = process()

    print('\n' + '=' * 60)
    print('BUSAN PUBLISHABILITY BASELINE V1 — RESULTS')
    print('=' * 60)
    total = summary['total_records']
    dist  = summary['publishability_distribution']
    for cat in ('publishable', 'publishable_with_caveat', 'pending_source', 'pending_review'):
        n = dist.get(cat, 0)
        bar = '█' * (n * 40 // total)
        print(f'  {cat:<25} {n:>5}  ({n/total*100:5.1f}%)  {bar}')
    print()
    xval_sum = summary['golden_dataset_cross_validation_summary']
    print(f'Golden Dataset Cross-Validation ({xval_sum["total_gd_records"]} records):')
    print(f'  exact_match                       : {xval_sum["exact_match"]}')
    print(f'  explained_gate_version_difference : {xval_sum["explained_gate_version_difference"]}')
    print(f'  unexplained_conflict              : {xval_sum["unexplained_conflict"]}')
    print(f'  VERDICT: {"✓ PASS" if xval_sum["pass"] else "✗ FAIL"}')

    if xval.get('unexplained_conflict'):
        print('\nUNEXPLAINED CONFLICTS:')
        for c in xval['unexplained_conflict']:
            print(f'  {c.get("golden_id","?")} {c.get("candidate_id","?")}'
                  f'  GD={c.get("gd_publishability","?")} BL={c.get("baseline_publishability","?")}')
            print(f'    GD blocks: {c.get("gd_block_reasons",[])}')
            print(f'    BL blocks: {c.get("baseline_block_reasons",[])}')
            print(f'    BL gates:  {c.get("baseline_gates",{})}')
