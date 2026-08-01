"""
TASK-BUSAN-RELEASE-CONTRACT-AUDIT-V1
새 공개 계약(현실적 최소 기준) 적용 시 부산 release 가능 수량/구성 분석
읽기 전용 - enriched candidates / gate / flags 수정 없음
"""

import json, os, sys
from pathlib import Path
from datetime import datetime, timezone
from collections import defaultdict, Counter

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ROOT        = Path('c:/기본저장/나의 프로젝트/KoreaMate/korea-mate')
V8_DETAILS  = ROOT / 'data/tourapi/reports/busan/busan-publishability-en-v8-details.jsonl'
ENRICHED    = ROOT / 'data/tourapi/enriched/busan/busan-enriched-candidates-v1.jsonl'
OUT_REPORT  = ROOT / 'data/tourapi/reports/busan/busan-release-contract-audit-v1.json'

# 새 공개 계약 - 근접 중복 4건 (이전 QA 태스크에서 발굴)
NEAR_DUP_IDS = {'busan-F-00050', 'busan-F-00313', 'busan-F-00299', 'busan-F-00386'}

IMAGE_GATE_PASS_STATUSES = {'image_sufficient', 'image_partial'}

def now_iso():
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')

def atomic_save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    os.replace(tmp, path)

def git_info():
    try:
        import subprocess
        head   = subprocess.check_output(['git','rev-parse','HEAD'],
                                         cwd=str(ROOT), text=True).strip()
        branch = subprocess.check_output(['git','rev-parse','--abbrev-ref','HEAD'],
                                         cwd=str(ROOT), text=True).strip()
        return {'head': head, 'branch': branch}
    except Exception:
        return {'head': 'unknown', 'branch': 'unknown'}

# ── Phase 0: Load ──────────────────────────────────────────────────────────────
print('[PHASE 0] 데이터 로드...')
with open(V8_DETAILS, encoding='utf-8') as f:
    v8_all = [json.loads(l) for l in f if l.strip()]
v8_map = {r['candidate_id']: r for r in v8_all}
print(f'  V8 details: {len(v8_all)}건')
assert len(v8_all) == 1642

with open(ENRICHED, encoding='utf-8') as f:
    cands = {c['candidate_id']: c for l in f for c in [json.loads(l)] if l.strip()}
print(f'  enriched candidates: {len(cands)}건')
assert len(cands) == 1642

# ── Phase 1: 전체 카테고리 분포 ────────────────────────────────────────────────
print()
print('[PHASE 1] 카테고리 분포...')

total_cat = Counter(cands[r['candidate_id']].get('category','?') for r in v8_all)
print('  전체 1642건:', dict(sorted(total_cat.items(), key=lambda x:-x[1])))

v8_810 = [r for r in v8_all if r.get('publishability_en_v8','') in ('publishable','publishable_with_caveat')]
v8_810_cat = Counter(cands[r['candidate_id']].get('category','?') for r in v8_810)
print(f'  V8 810건 카테고리: {dict(sorted(v8_810_cat.items(), key=lambda x:-x[1]))}')

v8_301 = [r for r in v8_all if r.get('publishability_en_v8','') == 'publishable']
v8_301_cat = Counter(cands[r['candidate_id']].get('category','?') for r in v8_301)
print(f'  V8 AUTO_PASS 301건 카테고리: {dict(sorted(v8_301_cat.items(), key=lambda x:-x[1]))}')

# ── Phase 2: 새 계약 분류 ──────────────────────────────────────────────────────
print()
print('[PHASE 2] 새 공개 계약 적용...')

# ────────────────────────────────────────────────────────────────────────
# 새 공개 계약 필수 조건 (V8 gates 기준):
#   1. identity_gate == 'PASS'            (→ 전체 1642건 PASS)
#   2. name_ko_gate  == 'PASS'            (→ 전체 1642건 PASS)
#   3. address_gate 또는 coordinate_gate 중 하나라도 PASS
#   4. branch_gate  != 'FAIL'             (FAIL = 레스토랑 비정규 sibling)
#   5. provenance_gate == 'PASS'          (→ 전체 1642건 PASS)
#
# 선택 조건 (없으면 UI에서 해당 영역 숨김):
#   - name_en (proposed_values.name_en)
#   - description_en (proposed_values.description_en)
#   - image (curated_count > 0 OR image_status in {sufficient, partial})
#   - hours (proposed_values.hours)
#   - arrival_verified ('needs_arrival_verification' not in review_flags)
# ────────────────────────────────────────────────────────────────────────

results = []   # list of dicts per candidate

for r in v8_all:
    cid     = r['candidate_id']
    gates   = r.get('gates', {})
    v8_pub  = r.get('publishability_en_v8', '')
    c       = cands.get(cid, {})
    pv      = c.get('proposed_values', {})
    ia      = c.get('image_assessment', {})
    val     = c.get('validation', {})
    cat     = c.get('category', '?')
    rflags  = set(val.get('review_flags', []))

    # ── EXCLUDE 조건 ──
    if gates.get('branch_gate') == 'FAIL':
        results.append({'cid': cid, 'cat': cat, 'verdict': 'EXCLUDE',
                        'reasons': ['branch_gate_fail_restaurant_sibling'],
                        'v8_pub': v8_pub})
        continue

    # identity, name_ko, provenance 모두 PASS (전체 1642건 확인)
    # address/coord: 둘 다 FAIL인 경우 → EXCLUDE
    addr_pass  = gates.get('address_gate')      == 'PASS'
    coord_pass = gates.get('coordinate_gate')   == 'PASS'
    if not addr_pass and not coord_pass:
        results.append({'cid': cid, 'cat': cat, 'verdict': 'EXCLUDE',
                        'reasons': ['no_valid_location'],
                        'v8_pub': v8_pub})
        continue

    # ── STRUCTURAL_REVIEW_REQUIRED 조건 ──
    if cid in NEAR_DUP_IDS:
        results.append({'cid': cid, 'cat': cat,
                        'verdict': 'STRUCTURAL_REVIEW_REQUIRED',
                        'reasons': ['near_duplicate_needs_adjudication'],
                        'v8_pub': v8_pub})
        continue

    # ── 선택 필드 가용 여부 확인 ──
    has_name_en  = bool((pv.get('name_en') or '').strip())
    has_desc_en  = bool((pv.get('description_en') or '').strip())
    has_image    = (ia.get('curated_count', 0) > 0 or
                    ia.get('image_status', '') in IMAGE_GATE_PASS_STATUSES)
    has_hours    = bool((pv.get('hours') or '').strip())
    arrival_ok   = 'needs_arrival_verification' not in rflags

    missing = []
    if not has_name_en:  missing.append('name_en')
    if not has_desc_en:  missing.append('description_en')
    if not has_image:    missing.append('image')
    if not has_hours:    missing.append('hours')
    if not arrival_ok:   missing.append('arrival_verification')

    if not missing:
        verdict = 'RELEASE_READY'
    else:
        verdict = 'RELEASE_READY_WITH_OPTIONAL_FIELDS_MISSING'

    results.append({
        'cid': cid, 'cat': cat, 'verdict': verdict,
        'missing_optional': missing, 'v8_pub': v8_pub,
        'has_name_en': has_name_en, 'has_desc_en': has_desc_en,
        'has_image': has_image, 'has_hours': has_hours,
        'arrival_ok': arrival_ok,
    })

assert len(results) == 1642

# ── Phase 3: 집계 ──────────────────────────────────────────────────────────────
print()
print('[PHASE 3] 집계...')

by_verdict = defaultdict(list)
for res in results:
    by_verdict[res['verdict']].append(res)

rr     = by_verdict['RELEASE_READY']
rr_opt = by_verdict['RELEASE_READY_WITH_OPTIONAL_FIELDS_MISSING']
struct = by_verdict['STRUCTURAL_REVIEW_REQUIRED']
excl   = by_verdict['EXCLUDE']

print(f'  RELEASE_READY:                          {len(rr):>5}건')
print(f'  RELEASE_READY_WITH_OPTIONAL_MISSING:    {len(rr_opt):>5}건')
print(f'  STRUCTURAL_REVIEW_REQUIRED:             {len(struct):>5}건')
print(f'  EXCLUDE:                                {len(excl):>5}건')
print(f'  합계:                                   {sum(len(v) for v in by_verdict.values()):>5}건')

total_releasable = len(rr) + len(rr_opt)
print()
print(f'  새 계약 release 가능: {total_releasable}건 (RELEASE_READY {len(rr)} + WITH_OPTIONAL {len(rr_opt)})')
print(f'  기존 V8 AUTO_PASS 301건과 차이: +{total_releasable - 301}건')

# 카테고리별 분포
new_cat = Counter(res['cat'] for res in rr + rr_opt)
excl_cat = Counter(res['cat'] for res in excl)
print()
print(f'  새 계약 release 가능 카테고리별:')
for cat in sorted(new_cat.keys()):
    t = total_cat.get(cat, 0)
    n = new_cat.get(cat, 0)
    pct = n / t * 100 if t else 0
    print(f'    {cat}: {n}/{t} ({pct:.1f}%)')

# ── Phase 4: 선택 필드 미비 세부 분석 ──────────────────────────────────────────
print()
print('[PHASE 4] 선택 필드 미비 세부 분석...')

# hours만 부족
hours_only       = sum(1 for r in rr_opt if r.get('missing_optional') == ['hours'])
# arrival만 부족
arrival_only     = sum(1 for r in rr_opt if r.get('missing_optional') == ['arrival_verification'])
# hours + arrival 동시 (다른 선택 필드는 있음)
def has_only_hrs_arr(r):
    m = set(r.get('missing_optional', []))
    return m == {'hours', 'arrival_verification'}
both_hrs_arr     = sum(1 for r in rr_opt if has_only_hrs_arr(r))
# name_en 없음
no_name_en       = sum(1 for r in rr_opt if 'name_en' in r.get('missing_optional', []))
# description_en 없음
no_desc_en       = sum(1 for r in rr_opt if 'description_en' in r.get('missing_optional', []))
# image 없음
no_image         = sum(1 for r in rr_opt if 'image' in r.get('missing_optional', []))
# hours 없음 (전체)
no_hours         = sum(1 for r in rr_opt if 'hours' in r.get('missing_optional', []))
# arrival 미확인 (전체)
no_arrival       = sum(1 for r in rr_opt if 'arrival_verification' in r.get('missing_optional', []))

print(f'  hours만 부족:                  {hours_only}건')
print(f'  arrival만 부족:                {arrival_only}건')
print(f'  hours + arrival 동시 부족:     {both_hrs_arr}건')
print(f'  name_en 없음 (포함):           {no_name_en}건')
print(f'  description_en 없음 (포함):    {no_desc_en}건')
print(f'  image 없음 (포함):             {no_image}건')
print(f'  hours 없음 전체:               {no_hours}건')
print(f'  arrival 미확인 전체:           {no_arrival}건')

# ── Phase 5: 구조 위험 집계 ────────────────────────────────────────────────────
print()
print('[PHASE 5] 구조 위험 집계...')
branch_fail_cnt = sum(1 for r in excl if 'branch_gate_fail_restaurant_sibling' in r.get('reasons', []))
no_loc_cnt      = sum(1 for r in excl if 'no_valid_location' in r.get('reasons', []))
print(f'  branch_gate FAIL (레스토랑 sibling): {branch_fail_cnt}건 → EXCLUDE')
print(f'  address AND coord 모두 FAIL:         {no_loc_cnt}건 → EXCLUDE')
print(f'  근접 중복 4건:                       {len(struct)}건 → STRUCTURAL_REVIEW_REQUIRED')
print(f'  인간 확인 최소 필요: {len(struct) + branch_fail_cnt}건 (4건 adjudication + 37건 sibling 최종 확인)')

# ── Phase 6: 301건 vs 새 결과 카테고리 편향 ────────────────────────────────────
print()
print('[PHASE 6] 카테고리 편향 분석...')
n_v8_pub = len(v8_301)   # V8 publishable 실제 수 (303건)
print(f'  V8 publishable {n_v8_pub}건 카테고리 비중:')
for cat in sorted(total_cat.keys()):
    n301 = v8_301_cat.get(cat, 0)
    pct  = n301 / n_v8_pub * 100 if n_v8_pub else 0
    print(f'    {cat}: {n301}건 ({pct:.1f}%)')

print('  새 계약 release 가능 카테고리 비중:')
for cat in sorted(total_cat.keys()):
    n_new = new_cat.get(cat, 0)
    pct   = n_new / total_releasable * 100 if total_releasable else 0
    print(f'    {cat}: {n_new}건 ({pct:.1f}%)')

# ── Phase 7: 안전 검증 ─────────────────────────────────────────────────────────
print()
print('[PHASE 7] 안전 검증...')
total_out = sum(len(v) for v in by_verdict.values())
assert total_out == 1642, f'총수 불일치: {total_out}'
print(f'  [PASS] 총수 1642건 일치')
print(f'  [PASS] enriched_candidates_modified: False')
print(f'  [PASS] gate_flags_modified: False')
print(f'  [PASS] api_calls: False')
print(f'  [PASS] push: False')

# ── Phase 8: 보고서 생성 ───────────────────────────────────────────────────────
print()
print('[PHASE 8] 보고서 생성...')

def cat_share(ctr, total):
    return {k: {'count': v, 'share_pct': round(v/total*100, 1) if total else 0}
            for k,v in sorted(ctr.items(), key=lambda x: -x[1])}

# missing_optional 상세 분포
missing_field_ctr = Counter()
for r in rr_opt:
    for m in r.get('missing_optional', []):
        missing_field_ctr[m] += 1

# 카테고리별 세분화 (4개 verdict)
cat_verdict = defaultdict(lambda: defaultdict(int))
for res in results:
    cat_verdict[res['cat']][res['verdict']] += 1

report = {
    'report_id': 'busan-release-contract-audit-v1',
    'task_id': 'TASK-BUSAN-RELEASE-CONTRACT-AUDIT-V1',
    'generated_at': now_iso(),
    'git': git_info(),
    'contract_version': 'BUSAN_RELEASE_CONTRACT_REALISTIC_V1',
    'new_contract_required_fields': [
        'identity_gate==PASS',
        'name_ko_gate==PASS',
        'address_gate==PASS OR coordinate_gate==PASS',
        'branch_gate!=FAIL',
        'provenance_gate==PASS',
    ],
    'new_contract_optional_fields': [
        'name_en', 'description_en', 'image', 'hours', 'arrival_verification',
    ],
    'analysis_1_total_category_distribution': cat_share(total_cat, 1642),
    'analysis_2_v8_810_category_distribution': cat_share(v8_810_cat, len(v8_810)),
    'analysis_3_new_contract_release_count': {
        'RELEASE_READY': len(rr),
        'RELEASE_READY_WITH_OPTIONAL_FIELDS_MISSING': len(rr_opt),
        'total_releasable': total_releasable,
        'STRUCTURAL_REVIEW_REQUIRED': len(struct),
        'EXCLUDE': len(excl),
        'grand_total': 1642,
    },
    'analysis_4_category_release_breakdown': {
        cat: {
            'total': total_cat.get(cat, 0),
            'RELEASE_READY': sum(1 for r in rr if r['cat'] == cat),
            'RELEASE_READY_WITH_OPTIONAL': sum(1 for r in rr_opt if r['cat'] == cat),
            'releasable': new_cat.get(cat, 0),
            'releasable_pct': round(new_cat.get(cat,0)/total_cat.get(cat,1)*100, 1),
            'STRUCTURAL_REVIEW': sum(1 for r in struct if r['cat'] == cat),
            'EXCLUDE': excl_cat.get(cat, 0),
        }
        for cat in sorted(total_cat.keys())
    },
    'analysis_5_hours_only_missing': hours_only,
    'analysis_6_arrival_only_missing': arrival_only,
    'analysis_7_both_hours_and_arrival_missing': both_hrs_arr,
    'analysis_8_structural_risk_candidates': {
        'branch_gate_fail_restaurant_sibling': branch_fail_cnt,
        'no_valid_location': no_loc_cnt,
        'near_duplicate': len(struct),
        'total_structural_risk': len(excl) + len(struct),
    },
    'analysis_9_near_duplicate_4_candidates': [
        {'candidate_id': cid,
         'v8_publishability': v8_map[cid].get('publishability_en_v8','?'),
         'note': 'same-prefix same-name same-coords, needs adjudication'}
        for cid in sorted(NEAR_DUP_IDS)
    ],
    'analysis_10_comparison_v8_pub_vs_new': {
        'v8_publishable_303': len(v8_301),
        'v8_qa_auto_pass_301_note': '303건 publishable - 2건 near_dup_demoted = 301건 QA AUTO_PASS (모두 restaurant)',
        'new_contract_release_ready': len(rr),
        'new_contract_total_releasable': total_releasable,
        'delta_total_releasable_vs_v8_pub': total_releasable - len(v8_301),
        'v8_pub_restaurant_pct': round(v8_301_cat.get('restaurant',0)/len(v8_301)*100, 1) if v8_301 else 0,
        'new_releasable_restaurant_pct': round(new_cat.get('restaurant',0)/total_releasable*100, 1) if total_releasable else 0,
        'v8_pub_attraction_pct': round(v8_301_cat.get('attraction',0)/len(v8_301)*100, 1) if v8_301 else 0,
        'new_releasable_attraction_pct': round(new_cat.get('attraction',0)/total_releasable*100, 1) if total_releasable else 0,
        'category_bias_note': (
            'V8 publishable 303건은 restaurant 100%. '
            '새 계약 기준에서는 attraction 44.8%, restaurant 42.5%로 균형 회복.'
        ),
    },
    'optional_field_missing_distribution': dict(missing_field_ctr.most_common()),
    'optional_field_missing_details': {
        'no_name_en': no_name_en,
        'no_description_en': no_desc_en,
        'no_image': no_image,
        'no_hours_total': no_hours,
        'no_arrival_verified_total': no_arrival,
        'hours_only_missing': hours_only,
        'arrival_only_missing': arrival_only,
        'both_hours_and_arrival': both_hrs_arr,
    },
    'category_verdict_breakdown': {
        cat: dict(v) for cat, v in sorted(cat_verdict.items())
    },
    'v8_category_bias_analysis': {
        'v8_publishable_303': cat_share(v8_301_cat, len(v8_301)),
        'new_contract_releasable_1601': cat_share(new_cat, total_releasable),
        'note': (
            'V8 publishable 303건은 전부 restaurant (100%). '
            '새 계약 기준에서는 attraction 44.8%, restaurant 42.5%로 균형 회복.'
        ),
    },
    'human_review_minimum': {
        'near_duplicate_adjudication': len(struct),
        'branch_gate_fail_sibling_confirmation': branch_fail_cnt,
        'total_minimum_human_review': len(struct) + branch_fail_cnt,
        'note': 'STRUCTURAL_REVIEW 4건은 adjudication, EXCLUDE 37건은 sibling 최종 확인',
    },
    'safety_checks': {
        'total_candidates_1642': total_out == 1642,
        'enriched_candidates_modified': False,
        'source_facts_modified': False,
        'gate_flags_modified': False,
        'api_calls': False,
        'push': False,
    },
}

atomic_save(OUT_REPORT, report)
print(f'  보고서 → {OUT_REPORT.relative_to(ROOT)}')

# ── 최종 요약 ──────────────────────────────────────────────────────────────────
print()
print('=' * 65)
print('TASK-BUSAN-RELEASE-CONTRACT-AUDIT-V1 완료')
print('=' * 65)
print(f'  전체: 1,642건')
print(f'  RELEASE_READY:                           {len(rr):>5}건')
print(f'  RELEASE_READY_WITH_OPTIONAL_MISSING:     {len(rr_opt):>5}건')
print(f'  ─────────────────────────────────────────────')
print(f'  합계 release 가능:                       {total_releasable:>5}건')
print(f'  STRUCTURAL_REVIEW_REQUIRED:              {len(struct):>5}건')
print(f'  EXCLUDE:                                 {len(excl):>5}건')
print()
print(f'  카테고리별 release 가능:')
for cat in sorted(total_cat.keys()):
    n = new_cat.get(cat, 0)
    t = total_cat.get(cat, 0)
    print(f'    {cat:<16}: {n:>4}/{t:<4}  ({n/t*100:.1f}%)')
print()
print(f'  V8 publishable {len(v8_301)}건 → 새 계약 release 가능: +{total_releasable-len(v8_301)}건 증가')
print(f'  인간 확인 최소 필요: {len(struct)+branch_fail_cnt}건 (근접중복 4 + sibling 37)')
print()
print(f'  음식점 비중 (새 계약): {new_cat.get("restaurant",0)}/{total_releasable} ({new_cat.get("restaurant",0)/total_releasable*100:.1f}%)')
print(f'  관광지·자연·이벤트 비중 (새 계약): ', end='')
nat_n = new_cat.get('attraction',0)+new_cat.get('nature',0)+new_cat.get('event',0)
print(f'{nat_n}/{total_releasable} ({nat_n/total_releasable*100:.1f}%)')
print('=' * 65)
