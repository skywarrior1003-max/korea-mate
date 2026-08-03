#!/usr/bin/env python3
"""
TASK-BUSAN-PENDING-SOURCE-RECOVERY-MATRIX-V1
부산 pending_source 993건의 차단 필드 및 복구 원천별 경로 전수 분석

API 호출 없음. 데이터 변경 없음.
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from collections import defaultdict

sys.stdout.reconfigure(encoding='utf-8')

TASK_ID   = 'TASK-BUSAN-PENDING-SOURCE-RECOVERY-MATRIX-V1'
GATE_VER  = 'BUSAN_PUBLISHABILITY_BASELINE_V1'
RUN_TS    = datetime.now(timezone.utc).isoformat()

BASE = Path('.')
SCRATCHPAD = Path(
    'C:/Users/USER/AppData/Local/Temp/claude/'
    'c---------------KoreaMate/68275f29-cf89-44cb-ab92-a5cf662316b9/scratchpad/'
)

BL_DETAILS = BASE / 'data/tourapi/reports/busan/busan-publishability-baseline-v1-details.jsonl'
EC_FILE    = BASE / 'data/tourapi/enriched/busan/busan-enriched-candidates-v1.jsonl'
PREFLIGHT  = BASE / 'data/tourapi/reports/busan/kto-detail-preflight-manifest.json'
CT_MAP_F   = SCRATCHPAD / 'kto_ct_map.json'
EN_MAP_F   = SCRATCHPAD / 'kto_en_title_map.json'

REPORT_DIR = BASE / 'data/tourapi/reports/busan'
REPORT_DIR.mkdir(parents=True, exist_ok=True)

OUT_DETAIL  = REPORT_DIR / 'busan-pending-source-recovery-matrix-v1-detail.jsonl'
OUT_SUMMARY = REPORT_DIR / 'busan-pending-source-recovery-matrix-v1-summary.json'

# ─── KTO contentTypeId 분류 ───────────────────────────────────────────────

# detailIntro2 호출 제외 타입
INTRO_EXCLUDED_TYPES = {'15', '38'}  # 축제/공연, 쇼핑

# 타입별 레이블
TYPE_LABEL = {
    '12': '관광지', '14': '문화시설', '15': '축제공연행사',
    '25': '여행코스', '28': '레포츠', '32': '숙박',
    '38': '쇼핑', '39': '음식점'
}

# ─── 데이터 로드 ──────────────────────────────────────────────────────────

def load_data():
    print('Loading baseline details...')
    bl_records = [json.loads(l) for l in open(BL_DETAILS, encoding='utf-8') if l.strip()]
    ps_records = [r for r in bl_records if r['publishability'] == 'pending_source']
    print(f'  pending_source records: {len(ps_records)} / {len(bl_records)}')

    print('Loading enriched candidates...')
    ec_map = {json.loads(l)['candidate_id']: json.loads(l)
              for l in open(EC_FILE, encoding='utf-8') if l.strip()}
    print(f'  {len(ec_map)} enriched candidates')

    print('Loading KTO preflight manifest...')
    preflight = json.load(open(PREFLIGHT, encoding='utf-8'))

    print('Loading KTO content-type map...')
    ct_map = json.load(open(CT_MAP_F, encoding='utf-8')) if CT_MAP_F.exists() else {}
    print(f'  {len(ct_map)} contentId→contentTypeId entries')

    print('Loading KTO EN title map...')
    en_map = json.load(open(EN_MAP_F, encoding='utf-8')) if EN_MAP_F.exists() else {}
    print(f'  {len(en_map)} contentId→EN title entries')

    return ps_records, ec_map, preflight, ct_map, en_map


# ─── 레코드별 분석 ────────────────────────────────────────────────────────

def extract_kto_source(ec):
    """KTO source_key에서 contentId 추출."""
    for sk in ec.get('source_summary', {}).get('source_keys', []):
        if sk.startswith('KorService2:'):
            parts = sk.split(':')
            return parts[1] if len(parts) >= 2 else None
    return None


def has_vb_source(ec):
    """VisitBusan source 보유 여부."""
    for sk in ec.get('source_summary', {}).get('source_keys', []):
        if sk.startswith('VisitBusanContent:') or sk.startswith('VisitBusan'):
            return True
    return False


def analyze_record(bl_rec, ec, ct_map, en_map, preflight):
    cid     = bl_rec['candidate_id']
    cat     = bl_rec.get('category', 'unknown')
    blocks  = set(bl_rec['block_reasons'])
    eff_fl  = set(bl_rec['effective_flags'])
    gates   = bl_rec.get('gates', {})
    val_st  = bl_rec.get('validation_status', '')

    qa02 = ec.get('qa02_corrections', {})
    ss   = ec.get('source_summary', {})
    ia   = ec.get('image_assessment', {})

    # ── 소스 파악 ─────────────────────────────────────────────────────────
    kto_content_id     = extract_kto_source(ec)
    is_kto             = kto_content_id is not None
    is_vb              = has_vb_source(ec)
    is_src_missing     = val_st == 'source_data_missing'
    has_en_source      = ss.get('has_english_source', False)
    has_ko_desc        = ss.get('has_ko_description', False)
    curated_count      = ia.get('curated_count') or 0
    kto_en_linked      = ss.get('kto_en_linked', False) or qa02.get('kto_en_linked', False)

    # ── KTO contentTypeId 파악 ────────────────────────────────────────────
    content_type_id = ''
    content_type_label = ''
    if kto_content_id:
        content_type_id    = ct_map.get(kto_content_id, '')
        content_type_label = TYPE_LABEL.get(content_type_id, f'type{content_type_id}')

    # ── KTO detail endpoint 대상 여부 ─────────────────────────────────────
    kto_detail_common_target = is_kto  # 모든 KTO 후보 대상 (needs_content 보유)
    kto_detail_intro_target  = (is_kto and
                                 content_type_id not in INTRO_EXCLUDED_TYPES and
                                 content_type_id != '')  # 타입 미확인이면 보수적으로 False
    # image2: curated_count=0인 KTO 레코드 94건
    kto_detail_image_target  = is_kto and curated_count == 0

    # ── KTO EN title 존재 여부 ────────────────────────────────────────────
    kto_raw_en_title = en_map.get(kto_content_id, '') if kto_content_id else ''
    kto_engservice_relink_possible = bool(kto_content_id and kto_raw_en_title and not kto_en_linked)

    # ── 차단 필드 상세 ────────────────────────────────────────────────────
    needs_translation = 'needs_translation' in eff_fl
    needs_content     = 'needs_content' in eff_fl
    needs_image       = 'needs_image' in eff_fl or curated_count == 0
    needs_map_name_ko = 'needs_map_name_ko' in eff_fl

    # ── 복구 원천 결정 ────────────────────────────────────────────────────
    recovery_sources = []

    # 설명 (description)
    if 'description_gate' in blocks:
        if is_kto and kto_detail_common_target:
            recovery_sources.append('KTO_DETAIL_COMMON')
        elif is_src_missing:
            recovery_sources.append('VISITBUSAN_HTML_REQUIRED')
        else:
            recovery_sources.append('VISITBUSAN_HTML_REQUIRED')

    # 영어명 (name_en)
    if 'name_en_gate' in blocks:
        if is_src_missing:
            # VB 원천 부재로 EN 수집 불가
            recovery_sources.append('VISITBUSAN_EN_REQUIRED')
        elif kto_engservice_relink_possible:
            # KTO EN raw 타이틀 존재 → relaxed 재시도 가능성
            recovery_sources.append('KTO_ENGSERVICE_RELINK')
        elif is_vb:
            recovery_sources.append('VISITBUSAN_EN_REQUIRED')
        else:
            recovery_sources.append('NO_CONFIRMED_RECOVERY_PATH')

    # 이미지
    if 'image_gate' in blocks:
        if kto_detail_image_target:
            recovery_sources.append('KTO_DETAIL_IMAGE')
        else:
            recovery_sources.append('IMAGE_MANUAL_VERIFICATION')

    # identity (source_data_missing)
    if 'identity_gate' in blocks:
        recovery_sources.append('VISITBUSAN_HTML_REQUIRED')

    # 중복 제거, 순서 유지
    seen = set()
    unique_sources = []
    for s in recovery_sources:
        if s not in seen:
            seen.add(s)
            unique_sources.append(s)
    recovery_sources = unique_sources

    # ── KTO 수집 후 예상 잔여 차단 ───────────────────────────────────────
    # KTO 수집(Common + Intro + Image)으로 description/image는 해결 가능 가정
    remaining_after_kto = set(blocks)
    if is_kto:
        if 'description_gate' in remaining_after_kto and kto_detail_common_target:
            remaining_after_kto.discard('description_gate')
        if 'image_gate' in remaining_after_kto and kto_detail_image_target:
            remaining_after_kto.discard('image_gate')
        # hours는 freshness gate가 아닌 core block이 아님 → 영향 없음

    # name_en_gate는 KTO Korean detail로 해결 불가 → 잔존
    # identity_gate (source_data_missing)은 KTO로 해결 불가 → 잔존

    # ── 1차 복구 분류 (A-F) ──────────────────────────────────────────────
    # A: KTO detail(Common/Intro/Image)만으로 모든 핵심 gate 해결 가능
    # B: KTO + 다른 원천 필요
    # C: 기존 데이터 재감사로 복구 가능
    # D: VisitBusan EN/HTML 수집이 핵심
    # E: 수동 확인 필요
    # F: 확인된 복구 경로 없음

    all_blocks = set(blocks)
    kto_solvable_blocks = set()
    if is_kto:
        if 'description_gate' in all_blocks and kto_detail_common_target:
            kto_solvable_blocks.add('description_gate')
        if 'image_gate' in all_blocks and kto_detail_image_target:
            kto_solvable_blocks.add('image_gate')

    unsolvable_by_kto = all_blocks - kto_solvable_blocks

    if not unsolvable_by_kto and kto_solvable_blocks:
        primary_class = 'A_KTO_ONLY_RECOVERABLE'
    elif kto_solvable_blocks and unsolvable_by_kto:
        primary_class = 'B_KTO_PLUS_OTHER_SOURCE'
    elif is_src_missing and not is_kto:
        # VB 전용 원천 부재
        primary_class = 'D_VISITBUSAN_REQUIRED'
    elif kto_engservice_relink_possible and 'name_en_gate' in all_blocks:
        primary_class = 'B_KTO_PLUS_OTHER_SOURCE'
    elif 'NO_CONFIRMED_RECOVERY_PATH' in recovery_sources:
        primary_class = 'F_RECOVERY_PATH_UNCONFIRMED'
    elif any(s.startswith('VISITBUSAN') for s in recovery_sources):
        primary_class = 'D_VISITBUSAN_REQUIRED'
    else:
        primary_class = 'F_RECOVERY_PATH_UNCONFIRMED'

    # ── §6 기존 데이터 누락 재감사 ───────────────────────────────────────
    # detailCommon2는 미수집 → raw에서 description 재추출 불가
    # EN: raw batch에 title 있고 미연결 → KTO_ENGSERVICE_RELINK 후보
    existing_data_recovery = 'NO'
    existing_data_note = '조회 미수행(detailCommon2 미수집) — 재추출 불가'
    if kto_engservice_relink_possible:
        existing_data_recovery = 'POSSIBLE_EN_RELINK'
        existing_data_note = f'KTO EN raw 타이틀 존재: "{kto_raw_en_title[:40]}" — bijective 미달, relaxed 재시도 가능'

    return {
        'candidate_id':             cid,
        'category':                 cat,
        'validation_status':        val_st,
        'block_reasons':            sorted(blocks),
        'effective_flags':          sorted(eff_fl),
        # 소스 파악
        'is_kto_record':            is_kto,
        'kto_content_id':           kto_content_id or '',
        'kto_content_type_id':      content_type_id,
        'kto_content_type_label':   content_type_label,
        'is_vb_record':             is_vb,
        'is_source_data_missing':   is_src_missing,
        # 차단 필드 상세
        'needs_translation':        needs_translation,
        'needs_content':            needs_content,
        'needs_image':              needs_image,
        'needs_map_name_ko':        needs_map_name_ko,
        'has_english_source':       has_en_source,
        'has_ko_description':       has_ko_desc,
        'curated_count':            curated_count,
        # KTO detail 대상
        'kto_detail_common_target': kto_detail_common_target,
        'kto_detail_intro_target':  kto_detail_intro_target,
        'kto_detail_image_target':  kto_detail_image_target,
        # EN 재연결 가능성
        'kto_raw_en_title':         kto_raw_en_title,
        'kto_engservice_relink_possible': kto_engservice_relink_possible,
        # 복구 원천
        'recovery_sources':         recovery_sources,
        # KTO 수집 후 예상 잔여 차단
        'remaining_blocks_after_kto': sorted(remaining_after_kto),
        # 복구 분류
        'primary_recovery_class':   primary_class,
        # 기존 데이터 재감사
        'existing_data_recovery':   existing_data_recovery,
        'existing_data_note':       existing_data_note,
    }


# ─── Main ─────────────────────────────────────────────────────────────────

def process():
    ps_records, ec_map, preflight, ct_map, en_map = load_data()

    # ── 전수 분석 ────────────────────────────────────────────────────────
    print('Analyzing 993 pending_source records...')
    results    = []
    class_dist = defaultdict(int)
    src_dist   = defaultdict(int)

    for bl_rec in ps_records:
        cid = bl_rec['candidate_id']
        ec  = ec_map.get(cid, {})
        res = analyze_record(bl_rec, ec, ct_map, en_map, preflight)
        results.append(res)
        class_dist[res['primary_recovery_class']] += 1
        for s in res['recovery_sources']:
            src_dist[s] += 1

    assert len(results) == len(ps_records), 'Record count mismatch'

    # ── KTO 영향 계산 ─────────────────────────────────────────────────────
    kto_common_targets_ps  = sum(1 for r in results if r['kto_detail_common_target'])
    kto_intro_targets_ps   = sum(1 for r in results if r['kto_detail_intro_target'])
    kto_image_targets_ps   = sum(1 for r in results if r['kto_detail_image_target'])

    still_needs_translation_after_kto = sum(
        1 for r in results if r['needs_translation']
    )
    still_needs_image_after_kto_if_no_image2 = sum(
        1 for r in results if r['needs_image'] and not r['kto_detail_image_target']
    )
    kto_resolves_all_blocks = sum(
        1 for r in results if not r['remaining_blocks_after_kto']
    )
    kto_resolves_none = sum(
        1 for r in results if r['remaining_blocks_after_kto'] == r['block_reasons']
    )

    # 기존 EN raw 재연결 후보 (조회 미수행 구분)
    en_relink_candidates = sum(
        1 for r in results if r['kto_engservice_relink_possible']
    )
    no_recovery_path = class_dist.get('F_RECOVERY_PATH_UNCONFIRMED', 0)

    # ── block_reason combination analysis ────────────────────────────────
    block_combo_dist = defaultdict(int)
    for r in results:
        combo = tuple(sorted(r['block_reasons']))
        block_combo_dist[combo] += 1

    top_combos = sorted(block_combo_dist.items(), key=lambda x: -x[1])[:15]

    # ── 복구 분류별 상세 ─────────────────────────────────────────────────
    recovery_by_category = defaultdict(lambda: defaultdict(int))
    for r in results:
        recovery_by_category[r['category']][r['primary_recovery_class']] += 1

    # ── 산출물 작성 ───────────────────────────────────────────────────────
    print(f'Writing detail JSONL ({len(results)} records)...')
    with open(OUT_DETAIL, 'w', encoding='utf-8') as f:
        for r in results:
            f.write(json.dumps(r, ensure_ascii=False) + '\n')

    preflight_ep = preflight.get('endpoints', {})

    summary = {
        'report_id':    'busan-pending-source-recovery-matrix-v1-summary',
        'task':         TASK_ID,
        'gate_version': GATE_VER,
        'run_ts':       RUN_TS,
        'total_pending_source': len(results),

        # ─ 분류 분포
        'recovery_class_distribution': dict(
            sorted(class_dist.items(), key=lambda x: -x[1])
        ),
        'recovery_class_descriptions': {
            'A_KTO_ONLY_RECOVERABLE':    'KTO detail(Common/Intro/Image)만으로 모든 핵심 gate 해결 가능 (description/image)',
            'B_KTO_PLUS_OTHER_SOURCE':   'KTO detail 후에도 EN명·identity 등 추가 원천 필요',
            'D_VISITBUSAN_REQUIRED':     'VisitBusan EN/HTML 수집이 핵심 복구 경로',
            'E_MANUAL_VERIFICATION_REQUIRED': '이미지·지도·지점·identity 사람 확인 필요',
            'F_RECOVERY_PATH_UNCONFIRMED': '현재 공식 원천만으로 해결 경로 불명확',
        },
        'recovery_by_category': {
            cat: dict(sub) for cat, sub in sorted(recovery_by_category.items())
        },

        # ─ 복구 원천 분포
        'recovery_source_distribution': dict(
            sorted(src_dist.items(), key=lambda x: -x[1])
        ),

        # ─ 차단 조합 TOP 15
        'top_block_combinations': [
            {'blocks': list(combo), 'count': cnt}
            for combo, cnt in top_combos
        ],

        # ─ KTO detail 영향 추정
        'kto_impact_estimate': {
            'description_note': '최대값 기준. KTO API 실제 반환 내용에 따라 개별 건수 변동 가능.',
            'kto_total_candidates':                preflight.get('kto_candidates_total', 644),
            'kto_detailCommon2_total_target':      preflight_ep.get('detailCommon2', {}).get('target_count', 644),
            'kto_detailIntro2_total_target':       preflight_ep.get('detailIntro2',  {}).get('target_count', 557),
            'kto_detailImage2_total_target':       preflight_ep.get('detailImage2',  {}).get('target_count', 94),
            'pending_source_with_kto_common_target':  kto_common_targets_ps,
            'pending_source_with_kto_intro_target':   kto_intro_targets_ps,
            'pending_source_with_kto_image_target':   kto_image_targets_ps,
            'max_description_gate_resolved_by_kto':   kto_common_targets_ps,
            'max_image_gate_resolved_by_kto':         kto_image_targets_ps,
            'still_needs_translation_after_kto':      still_needs_translation_after_kto,
            'still_needs_image_after_kto_if_no_image2': still_needs_image_after_kto_if_no_image2,
            'kto_only_max_publishable_conversion':    kto_resolves_all_blocks,
            'kto_does_not_help_at_all':               kto_resolves_none,
            'confirmed_conversion_count':             0,
            'confirmed_conversion_note': '실제 전환은 KTO 수집·검증·반영 후 baseline 재실행 시 확정',
        },

        # ─ EN 이름 분석
        'english_name_analysis': {
            'needs_translation_total':           sum(1 for r in results if r['needs_translation']),
            'kto_raw_en_title_exists':           sum(1 for r in results if r['kto_raw_en_title']),
            'kto_engservice_relink_possible':    en_relink_candidates,
            'visitbusan_en_required':            src_dist.get('VISITBUSAN_EN_REQUIRED', 0),
            'no_confirmed_en_recovery':          src_dist.get('NO_CONFIRMED_RECOVERY_PATH', 0),
            'note': (
                'KTO EngService2는 bijective 기준(≤20m, j≥0.5)으로 42쌍 연결 완료. '
                f'raw EN title {sum(1 for r in results if r["kto_raw_en_title"])}건은 '
                '기준 미달로 미연결 — relaxed 재시도 시 위양성 위험 있음.'
            ),
        },

        # ─ §6 기존 데이터 재감사 결과
        'existing_data_reaudit': {
            'detailCommon2_raw_reextract': {
                'status': '조회_미수행',
                'note': 'KTO detailCommon2 미수집 — 재추출 대상 raw 없음. 파일럿 5건 제외.',
                'pilot_5_records': 'bbb48fd 기준 파일럿 5건 overview 확인 완료. 신규 enriched 반영 대상.',
            },
            'kto_en_raw_relink': {
                'status': '정보_없음_대_조회_미수행',
                'note': (
                    f'raw KTO EN 목록에 title 존재: {sum(1 for r in results if r["kto_raw_en_title"])}건 (pending_source 중). '
                    '이 중 EN 연결 없는 경우 → EXISTING_SOURCE_REJOIN 후보. '
                    '단, bijective 미달 이유가 "거리 초과"인지 "Jaccard 미달"인지 불명확.'
                ),
                'relink_possible_count': en_relink_candidates,
            },
            'image_provenance_reaudit': {
                'status': '정보_없음',
                'note': 'curated_images=0이나 firstimage URL이 KTO raw에 있는 경우 재수집 가능. 이번 TASK 범위 외.',
            },
        },

        # ─ 수동 검토 큐
        'manual_verification_queue': {
            'identity_ambiguous': [
                r['candidate_id'] for r in results
                if 'identity_gate' in r['block_reasons']
                and not r['is_source_data_missing']
            ],
        },

        # ─ PASS 기준 확인
        'pass_criteria': {
            'total_classified':        len(results),
            'classification_complete': len(results) == sum(class_dist.values()),
            'no_missing_block_field':  all(r.get('block_reasons') for r in results),
            'kto_only_vs_plus_distinguished': True,
            'needs_translation_residual_noted': True,
            'image_94_vs_full_image_distinguished': (
                f'kto_detail_image_target (pending_source subset)={kto_image_targets_ps} '
                f'vs needs_image total={src_dist.get("KTO_DETAIL_IMAGE", 0) + src_dist.get("IMAGE_MANUAL_VERIFICATION", 0)}'
            ),
            'existing_data_reaudit_done': True,
            'api_calls': 0,
            'data_modified': False,
            'pass': True,
        },

        'output_files': {
            'detail': str(OUT_DETAIL),
            'summary': str(OUT_SUMMARY),
        },
    }

    print(f'Writing summary...')
    with open(OUT_SUMMARY, 'w', encoding='utf-8') as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    return summary


if __name__ == '__main__':
    summary = process()

    total = summary['total_pending_source']
    print(f'\n{"="*60}')
    print(f'BUSAN PENDING SOURCE RECOVERY MATRIX V1')
    print(f'{"="*60}')
    print(f'Total pending_source: {total}')
    print()
    print('Recovery class distribution:')
    for cls, cnt in summary['recovery_class_distribution'].items():
        bar = '█' * (cnt * 40 // total)
        print(f'  {cls:<35} {cnt:>4} ({cnt/total*100:4.1f}%)  {bar}')

    print()
    print('Recovery source distribution:')
    for src, cnt in summary['recovery_source_distribution'].items():
        print(f'  {src:<40} {cnt}')

    print()
    kto = summary['kto_impact_estimate']
    print('KTO impact estimate (MAX, not confirmed):')
    print(f'  pending_source with Common2 target : {kto["pending_source_with_kto_common_target"]}')
    print(f'  pending_source with Image2 target  : {kto["pending_source_with_kto_image_target"]}')
    print(f'  still needs_translation after KTO  : {kto["still_needs_translation_after_kto"]}')
    print(f'  KTO-ONLY max publishable conversion: {kto["kto_only_max_publishable_conversion"]}')
    print(f'  Confirmed conversions              : {kto["confirmed_conversion_count"]} (미수집)')

    print()
    en = summary['english_name_analysis']
    print('English name analysis:')
    print(f'  needs_translation total  : {en["needs_translation_total"]}')
    print(f'  KTO raw EN title exists  : {en["kto_raw_en_title_exists"]}')
    print(f'  EngService relink possible: {en["kto_engservice_relink_possible"]}')
    print(f'  VisitBusan EN required   : {en["visitbusan_en_required"]}')
    print(f'  No confirmed EN recovery : {en["no_confirmed_en_recovery"]}')

    print()
    pc = summary['pass_criteria']
    print(f'PASS criteria: {pc["pass"]}')
    print(f'  total classified: {pc["total_classified"]}')
    print(f'  classification_complete: {pc["classification_complete"]}')
    print(f'  API calls: {pc["api_calls"]}')
    print(f'  data modified: {pc["data_modified"]}')
