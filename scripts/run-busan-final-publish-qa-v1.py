"""
TASK-BUSAN-FINAL-PUBLISH-CANDIDATE-QA-V1
810건 (publishable 303 + publishable_with_caveat 507) 자동 QA
판정: AUTO_PASS / MANUAL_REVIEW_REQUIRED / EXCLUDE_FROM_RELEASE
읽기 전용: enriched candidates / source facts / gates 수정 없음
"""

import json, os, sys
from pathlib import Path
from datetime import datetime, timezone
from collections import defaultdict

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ROOT        = Path('c:/기본저장/나의 프로젝트/KoreaMate/korea-mate')
V8_DETAILS  = ROOT / 'data/tourapi/reports/busan/busan-publishability-en-v8-details.jsonl'
ENRICHED    = ROOT / 'data/tourapi/enriched/busan/busan-enriched-candidates-v1.jsonl'
ADJ_REPORT  = ROOT / 'data/tourapi/reports/busan/busan-restaurant-duplicate-adjudication-v1.json'

REPORT_DIR  = ROOT / 'data/tourapi/reports/busan'
MANIFEST_DIR= ROOT / 'data/tourapi/manifests/busan'

OUT_REPORT       = REPORT_DIR  / 'busan-final-publish-qa-report.json'
OUT_AUTO_PASS    = MANIFEST_DIR / 'busan-final-auto-pass-manifest.json'
OUT_MANUAL_REV   = MANIFEST_DIR / 'busan-final-manual-review-manifest.json'
OUT_EXCLUDE      = MANIFEST_DIR / 'busan-final-exclude-manifest.json'

# Busan 지리적 경계 (넓은 범위로 설정)
BUSAN_LAT_MIN, BUSAN_LAT_MAX = 34.80, 35.50
BUSAN_LNG_MIN, BUSAN_LNG_MAX = 128.65, 129.40

# image_gate PASS 허용 image_status 목록
IMAGE_GATE_PASS_STATUSES = {'image_sufficient', 'image_partial'}

# SHORT description 기준 (chars)
DESC_EN_EXCLUDE_LEN  = 15   # 미달 → EXCLUDE (gate_data_mismatch와 동일 취급)
DESC_EN_MANUAL_LEN   = 50   # 미달 → MANUAL_REVIEW (품질 우려)

# 좌표 근접 중복 탐지 (도 단위 약 11m = 0.0001도)
COORD_NEAR_THRESHOLD = 0.0001   # 위도·경도 각각

def now_iso():
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')

def atomic_save(path: Path, data):
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

# ── Phase 0: Load ─────────────────────────────────────────────────────────────
print('[PHASE 0] 데이터 로드...')

with open(V8_DETAILS, encoding='utf-8') as f:
    v8_all = [json.loads(l) for l in f if l.strip()]
print(f'  V8 details: {len(v8_all)}건')

# 810건 대상 추출
v8_map = {r['candidate_id']: r for r in v8_all}
pub810 = [r for r in v8_all
          if r.get('publishability_en_v8','') in ('publishable','publishable_with_caveat')]
print(f'  810 대상: {len(pub810)}건')
assert len(pub810) == 810, f'810건 기대, 실제 {len(pub810)}건'

with open(ENRICHED, encoding='utf-8') as f:
    cands_list = [json.loads(l) for l in f if l.strip()]
cands = {c['candidate_id']: c for c in cands_list}
print(f'  enriched candidates: {len(cands)}건 (전체)')
assert len(cands) == 1642, f'candidate 총수 오류: {len(cands)}'

adj_data = json.load(open(ADJ_REPORT, encoding='utf-8'))
sibling_ids = set()
for rec in adj_data.get('records', []):
    for sid in rec.get('sibling_ids', []):
        sibling_ids.add(sid)
print(f'  adjudication sibling IDs: {len(sibling_ids)}건')

# ── Phase 1: 810건 좌표 인덱스 (근접 중복 탐지용) ─────────────────────────────
# 탐지 기준:
#   - 동일 소스 prefix + 완전 동일 이름 + 좌표(4자리) → MANUAL_REVIEW 플래그
#   - 크로스 prefix 공동 위치(VB + A 등): 플랫폼 설계 의도 → informational 보고만
print()
print('[PHASE 1] 좌표 근접 중복 탐지 준비...')

def id_prefix(cid):
    """busan-F-00050 → busan-F,  busan-VB-255 → busan-VB"""
    parts = cid.rsplit('-', 1)
    return parts[0] if len(parts) == 2 else cid

# 동일 prefix + 좌표(4자리) 인덱스
prefix_coord_index = {}
all_coord_index = {}   # 크로스 prefix 공동 위치용
for r in pub810:
    cid = r['candidate_id']
    c   = cands.get(cid, {})
    pv  = c.get('proposed_values', {})
    try:
        lat = float(pv.get('lat') or 0)
        lng = float(pv.get('lng') or 0)
        if lat and lng:
            pfx = id_prefix(cid)
            same_key = (pfx, round(lat, 4), round(lng, 4))
            cross_key = (round(lat, 4), round(lng, 4))
            prefix_coord_index.setdefault(same_key, []).append(cid)
            all_coord_index.setdefault(cross_key, []).append(cid)
    except (TypeError, ValueError):
        pass

# 동일 prefix + 정규화 이름 완전 일치 → MANUAL_REVIEW (양측)
near_dup_pairs = []    # list of (id_a, id_b, name, prefix)
near_dup_manual = set()  # MANUAL_REVIEW 플래그 대상 (양측 포함)
for key, ids in prefix_coord_index.items():
    if len(ids) > 1:
        pfx = key[0]
        for i in range(len(ids)):
            for j in range(i+1, len(ids)):
                id_a, id_b = ids[i], ids[j]
                na = (cands.get(id_a,{}).get('proposed_values',{}).get('name_ko') or '').replace(' ','').lower()
                nb = (cands.get(id_b,{}).get('proposed_values',{}).get('name_ko') or '').replace(' ','').lower()
                if na and nb and na == nb:
                    near_dup_pairs.append((id_a, id_b, na, pfx))
                    near_dup_manual.add(id_a)
                    near_dup_manual.add(id_b)

# 크로스 prefix 공동 위치 (informational)
cross_prefix_coloc_count = sum(
    1 for ids in all_coord_index.values()
    if len(set(id_prefix(cid) for cid in ids)) > 1
)

print(f'  동일 prefix + 동일 이름 근접 중복 쌍: {len(near_dup_pairs)}쌍 (MANUAL_REVIEW 대상 {len(near_dup_manual)}건)')
print(f'  크로스 prefix 공동 위치 그룹: {cross_prefix_coloc_count}건 (설계 의도, informational)')

# ── Phase 2: QA 판정 ──────────────────────────────────────────────────────────
print()
print('[PHASE 2] QA 판정 시작...')

auto_pass_list        = []
manual_review_list    = []
exclude_list          = []

# 원인별 카운터
exclude_reason_ctr   = defaultdict(int)
manual_reason_ctr    = defaultdict(int)
caveat_flag_ctr      = defaultdict(int)   # publishable_with_caveat 세분화

for r in pub810:
    cid       = r['candidate_id']
    pub_v8    = r.get('publishability_en_v8', '')
    gates     = r.get('gates', {})
    eff_flags = set(r.get('effective_flags', []))
    category  = r.get('category', '')

    c   = cands.get(cid, {})
    pv  = c.get('proposed_values', {})
    ia  = c.get('image_assessment', {})
    val = c.get('validation', {})
    prv = c.get('provenance', {})

    name_en      = (pv.get('name_en') or '').strip()
    desc_en      = (pv.get('description_en') or '').strip()
    address      = (pv.get('address') or '').strip()
    lat_raw      = pv.get('lat')
    lng_raw      = pv.get('lng')
    prim_src_ref = (prv.get('primary_source_ref') or '').strip()
    curated_cnt  = ia.get('curated_count', 0)
    image_status = ia.get('image_status', '')
    curated_imgs = ia.get('curated_images', [])
    review_flags = set(val.get('review_flags', []))

    # ── 1. EXCLUDE 검사 ─────────────────────────────────────────────────────
    exclude_reasons = []

    # 1-a. adjudication sibling
    if cid in sibling_ids:
        exclude_reasons.append('adjudication_sibling')
        exclude_reason_ctr['adjudication_sibling'] += 1

    # 1-b. gate 데이터 불일치 - name_en
    if gates.get('name_en_gate') == 'PASS' and not name_en:
        exclude_reasons.append('gate_data_mismatch_name_en')
        exclude_reason_ctr['gate_data_mismatch_name_en'] += 1

    # 1-c. gate 데이터 불일치 - description_en (없음 또는 최소 기준 미달)
    if gates.get('description_en_gate') == 'PASS':
        if not desc_en:
            exclude_reasons.append('gate_data_mismatch_description_en_missing')
            exclude_reason_ctr['gate_data_mismatch_description_en_missing'] += 1
        elif len(desc_en) < DESC_EN_EXCLUDE_LEN:
            exclude_reasons.append('description_en_too_short_exclude')
            exclude_reason_ctr['description_en_too_short_exclude'] += 1

    # 1-d. gate 데이터 불일치 - address
    if gates.get('address_gate') == 'PASS' and not address:
        exclude_reasons.append('gate_data_mismatch_address')
        exclude_reason_ctr['gate_data_mismatch_address'] += 1

    # 1-e. gate 데이터 불일치 / 좌표 오류
    coord_exclude = False
    try:
        lat = float(lat_raw) if lat_raw is not None else 0.0
        lng = float(lng_raw) if lng_raw is not None else 0.0
    except (TypeError, ValueError):
        lat = lng = 0.0

    if gates.get('coordinate_gate') == 'PASS':
        if not lat or not lng:
            exclude_reasons.append('gate_data_mismatch_coordinate_missing')
            exclude_reason_ctr['gate_data_mismatch_coordinate_missing'] += 1
            coord_exclude = True
        elif not (BUSAN_LAT_MIN <= lat <= BUSAN_LAT_MAX and
                  BUSAN_LNG_MIN <= lng <= BUSAN_LNG_MAX):
            exclude_reasons.append('coordinate_out_of_busan_bounds')
            exclude_reason_ctr['coordinate_out_of_busan_bounds'] += 1
            coord_exclude = True

    # 1-f. gate 데이터 불일치 - provenance
    if gates.get('provenance_gate') == 'PASS' and not prim_src_ref:
        exclude_reasons.append('gate_data_mismatch_provenance')
        exclude_reason_ctr['gate_data_mismatch_provenance'] += 1

    # 1-g. gate 데이터 불일치 - image (curated_count=0 AND status 부적합)
    if gates.get('image_gate') == 'PASS':
        if curated_cnt == 0 and image_status not in IMAGE_GATE_PASS_STATUSES:
            exclude_reasons.append('gate_data_mismatch_image')
            exclude_reason_ctr['gate_data_mismatch_image'] += 1

    # 1-h. branch_gate FAIL (restaurant sibling 혼입 방어)
    if gates.get('branch_gate') == 'FAIL':
        exclude_reasons.append('branch_gate_fail_restaurant_sibling')
        exclude_reason_ctr['branch_gate_fail_restaurant_sibling'] += 1

    # 1-i. address_gate FAIL 혼입 방어
    if gates.get('address_gate') == 'FAIL':
        exclude_reasons.append('address_gate_fail')
        exclude_reason_ctr['address_gate_fail'] += 1

    # 1-j. coordinate_gate FAIL 혼입 방어
    if gates.get('coordinate_gate') == 'FAIL':
        exclude_reasons.append('coordinate_gate_fail')
        exclude_reason_ctr['coordinate_gate_fail'] += 1

    if exclude_reasons:
        exclude_list.append({
            'candidate_id': cid,
            'category': category,
            'publishability_v8': pub_v8,
            'exclude_reasons': exclude_reasons,
        })
        continue

    # ── 2. MANUAL_REVIEW 검사 ───────────────────────────────────────────────
    manual_reasons = []

    # 2-a. publishable_with_caveat → has_caveat_flags
    if pub_v8 == 'publishable_with_caveat':
        manual_reasons.append('has_caveat_flags')
        manual_reason_ctr['has_caveat_flags'] += 1
        for fl in sorted(eff_flags):
            caveat_flag_ctr[fl] += 1

    # 2-b. 동일 소스 근접 중복 (adjudication 전 인간 판정 필요)
    if cid in near_dup_manual:
        manual_reasons.append('near_duplicate_needs_adjudication')
        manual_reason_ctr['near_duplicate_needs_adjudication'] += 1

    # 2-c. description_en 단소 (EXCLUDE 기준 통과했으나 품질 우려)
    if desc_en and len(desc_en) < DESC_EN_MANUAL_LEN:
        manual_reasons.append('description_en_short_quality_check')
        manual_reason_ctr['description_en_short_quality_check'] += 1

    # 2-d. needs_content 플래그 (publishable에 있으면 이상)
    if 'needs_content' in eff_flags:
        manual_reasons.append('needs_content_flag')
        manual_reason_ctr['needs_content_flag'] += 1

    # 2-e. 모든 이미지가 UNVERIFIABLE (이미지 접근성 불확실)
    if curated_cnt > 0 and curated_imgs:
        all_unverifiable = all(
            img.get('url_status') == 'UNVERIFIABLE'
            for img in curated_imgs
        )
        if all_unverifiable:
            manual_reasons.append('all_curated_images_unverifiable')
            manual_reason_ctr['all_curated_images_unverifiable'] += 1

    if manual_reasons:
        manual_review_list.append({
            'candidate_id': cid,
            'category': category,
            'publishability_v8': pub_v8,
            'effective_flags': sorted(eff_flags),
            'review_reasons': manual_reasons,
        })
        continue

    # ── 3. AUTO_PASS ────────────────────────────────────────────────────────
    auto_pass_list.append({
        'candidate_id': cid,
        'category': category,
        'publishability_v8': pub_v8,
    })

print(f'  AUTO_PASS:          {len(auto_pass_list):>4}건')
print(f'  MANUAL_REVIEW:      {len(manual_review_list):>4}건')
print(f'  EXCLUDE:            {len(exclude_list):>4}건')
print(f'  합계:               {len(auto_pass_list)+len(manual_review_list)+len(exclude_list):>4}건 (기대: 810)')

# ── Phase 3: 안전 검증 ────────────────────────────────────────────────────────
print()
print('[PHASE 3] 안전 검증...')

checks = {}

checks['input_count_810']           = len(pub810) == 810
checks['output_total_810']          = (len(auto_pass_list)+len(manual_review_list)+len(exclude_list)) == 810
checks['candidate_total_1642']      = len(cands) == 1642

# 중복·누락 없음
all_judged_ids = (
    [r['candidate_id'] for r in auto_pass_list] +
    [r['candidate_id'] for r in manual_review_list] +
    [r['candidate_id'] for r in exclude_list]
)
checks['no_duplicate_ids']  = len(all_judged_ids) == len(set(all_judged_ids))
target_ids = set(r['candidate_id'] for r in pub810)
checks['no_missing_ids']    = set(all_judged_ids) == target_ids

# restaurant sibling이 AUTO_PASS 또는 MANUAL_REVIEW에 없음
sibling_in_public = [r['candidate_id']
                     for r in auto_pass_list + manual_review_list
                     if r['candidate_id'] in sibling_ids]
checks['restaurant_sibling_in_public_0'] = len(sibling_in_public) == 0

# address_gate FAIL 혼입 없음
addr_fail_in_public = [r['candidate_id']
                       for r in auto_pass_list + manual_review_list
                       if v8_map[r['candidate_id']].get('gates',{}).get('address_gate') == 'FAIL']
checks['address_gate_fail_in_public_0'] = len(addr_fail_in_public) == 0

# coordinate_gate FAIL 혼입 없음
coord_fail_in_public = [r['candidate_id']
                        for r in auto_pass_list + manual_review_list
                        if v8_map[r['candidate_id']].get('gates',{}).get('coordinate_gate') == 'FAIL']
checks['coordinate_gate_fail_in_public_0'] = len(coord_fail_in_public) == 0

# 원본 데이터 미수정 확인 (Python 내에서 enriched cands를 수정하지 않았음)
checks['enriched_candidates_modified'] = False   # SAFETY_NEGATIVE: False=수정 없음
checks['source_facts_modified']        = False   # SAFETY_NEGATIVE: False=수정 없음
checks['api_calls']                    = False
checks['push']                         = False
checks['new_flags_created']            = False

SAFETY_NEGATIVE = {'enriched_candidates_modified','source_facts_modified','api_calls','push','new_flags_created'}
bool_pass = all(v is True for k,v in checks.items()
                if isinstance(v,bool) and k not in SAFETY_NEGATIVE)
safety_pass = not any(checks.get(k,False) for k in SAFETY_NEGATIVE)
all_pass   = bool_pass and safety_pass

for k, v in checks.items():
    tag = 'PASS' if (v is True or (k in SAFETY_NEGATIVE and v is False)) else 'FAIL'
    print(f'  [{tag}] {k}: {v}')

print()
print(f'  bool_pass={bool_pass}  safety_pass={safety_pass}  VERDICT={"PASS" if all_pass else "FAIL"}')

if not all_pass:
    print('[ERROR] 안전 검증 실패')
    sys.exit(1)

# ── Phase 4: Publishability 세분화 ───────────────────────────────────────────
pub_breakdown = defaultdict(lambda: defaultdict(int))
for r in auto_pass_list:
    pub_breakdown[r['publishability_v8']]['AUTO_PASS'] += 1
for r in manual_review_list:
    pub_breakdown[r['publishability_v8']]['MANUAL_REVIEW'] += 1
for r in exclude_list:
    pub_breakdown[r['publishability_v8']]['EXCLUDE'] += 1

print()
print('[PHASE 4] publishability 세분화')
for pv8, cnts in sorted(pub_breakdown.items()):
    print(f'  {pv8}: {dict(cnts)}')

if caveat_flag_ctr:
    print('  caveat_flag 분포:', dict(sorted(caveat_flag_ctr.items())))

# category 세분화
cat_breakdown = defaultdict(lambda: defaultdict(int))
for r in auto_pass_list:    cat_breakdown[r['category']]['AUTO_PASS'] += 1
for r in manual_review_list: cat_breakdown[r['category']]['MANUAL_REVIEW'] += 1
for r in exclude_list:       cat_breakdown[r['category']]['EXCLUDE'] += 1

# ── Phase 5: 출력 파일 생성 ───────────────────────────────────────────────────
print()
print('[PHASE 5] 출력 파일 생성...')

git = git_info()
ts  = now_iso()

# QA 보고서
report = {
    'report_id': 'busan-final-publish-qa-v1',
    'task_id': 'TASK-BUSAN-FINAL-PUBLISH-CANDIDATE-QA-V1',
    'generated_at': ts,
    'git': git,
    'gate_version': 'BUSAN_PUBLISHABILITY_EN_V8',
    'verdict': 'PASS',
    'input_count': 810,
    'distribution': {
        'AUTO_PASS': len(auto_pass_list),
        'MANUAL_REVIEW_REQUIRED': len(manual_review_list),
        'EXCLUDE_FROM_RELEASE': len(exclude_list),
    },
    'publishability_breakdown': {
        k: dict(v) for k, v in sorted(pub_breakdown.items())
    },
    'category_breakdown': {
        k: dict(v) for k, v in sorted(cat_breakdown.items())
    },
    'exclude_reasons': dict(sorted(exclude_reason_ctr.items())),
    'manual_review_reasons': dict(sorted(manual_reason_ctr.items())),
    'caveat_flag_distribution': dict(sorted(caveat_flag_ctr.items())),
    'near_duplicate_same_source_pairs': [
        {'id_a': a, 'id_b': b, 'name_ko': n, 'prefix': pfx}
        for a, b, n, pfx in sorted(near_dup_pairs)
    ],
    'cross_prefix_colocation_groups_count': cross_prefix_coloc_count,
    'cross_prefix_colocation_note': (
        'busan-A-* (TourAPI 공식) 와 busan-VB-* (에디토리얼) 가 같은 장소에 공존하는 것은 플랫폼 설계 의도입니다.'
    ),
    'safety_checks': {
        'input_count': 810,
        'output_total': len(auto_pass_list) + len(manual_review_list) + len(exclude_list),
        'no_duplicate_ids': checks['no_duplicate_ids'],
        'no_missing_ids': checks['no_missing_ids'],
        'restaurant_sibling_in_public': 0,
        'address_gate_fail_in_public': 0,
        'coordinate_gate_fail_in_public': 0,
        'candidate_total': len(cands),
        'enriched_candidates_modified': False,
        'source_facts_modified': False,
        'new_flags_created': False,
        'api_calls': False,
        'push': False,
    },
    'qa_dimensions': [
        'identity_and_duplicate',
        'required_info',
        'image_gate_consistency',
        'gate_data_consistency',
        'regression_protection',
    ],
    'thresholds': {
        'desc_en_exclude_len': DESC_EN_EXCLUDE_LEN,
        'desc_en_manual_len': DESC_EN_MANUAL_LEN,
        'coord_near_threshold_deg': COORD_NEAR_THRESHOLD,
        'busan_lat_bounds': [BUSAN_LAT_MIN, BUSAN_LAT_MAX],
        'busan_lng_bounds': [BUSAN_LNG_MIN, BUSAN_LNG_MAX],
    },
}
atomic_save(OUT_REPORT, report)
print(f'  보고서 → {OUT_REPORT.relative_to(ROOT)}')

# AUTO_PASS 매니페스트
auto_pass_manifest = {
    'manifest_id': 'busan-final-auto-pass-v1',
    'task_id': 'TASK-BUSAN-FINAL-PUBLISH-CANDIDATE-QA-V1',
    'generated_at': ts,
    'git': git,
    'count': len(auto_pass_list),
    'records': [
        {'candidate_id': r['candidate_id'],
         'category': r['category'],
         'publishability_v8': r['publishability_v8']}
        for r in auto_pass_list
    ],
}
atomic_save(OUT_AUTO_PASS, auto_pass_manifest)
print(f'  AUTO_PASS 매니페스트 → {OUT_AUTO_PASS.relative_to(ROOT)}')

# MANUAL_REVIEW 매니페스트
manual_review_manifest = {
    'manifest_id': 'busan-final-manual-review-v1',
    'task_id': 'TASK-BUSAN-FINAL-PUBLISH-CANDIDATE-QA-V1',
    'generated_at': ts,
    'git': git,
    'count': len(manual_review_list),
    'records': [
        {'candidate_id': r['candidate_id'],
         'category': r['category'],
         'publishability_v8': r['publishability_v8'],
         'effective_flags': r['effective_flags'],
         'review_reasons': r['review_reasons']}
        for r in manual_review_list
    ],
}
atomic_save(OUT_MANUAL_REV, manual_review_manifest)
print(f'  MANUAL_REVIEW 매니페스트 → {OUT_MANUAL_REV.relative_to(ROOT)}')

# EXCLUDE 매니페스트
exclude_manifest = {
    'manifest_id': 'busan-final-exclude-v1',
    'task_id': 'TASK-BUSAN-FINAL-PUBLISH-CANDIDATE-QA-V1',
    'generated_at': ts,
    'git': git,
    'count': len(exclude_list),
    'records': exclude_list,
}
atomic_save(OUT_EXCLUDE, exclude_manifest)
print(f'  EXCLUDE 매니페스트 → {OUT_EXCLUDE.relative_to(ROOT)}')

# ── Phase 6: 최종 요약 ────────────────────────────────────────────────────────
print()
print('=' * 60)
print('TASK-BUSAN-FINAL-PUBLISH-CANDIDATE-QA-V1 완료')
print('=' * 60)
print(f'  입력:              810건 (publishable 303 + caveat 507)')
print(f'  AUTO_PASS:         {len(auto_pass_list):>4}건')
print(f'  MANUAL_REVIEW:     {len(manual_review_list):>4}건')
print(f'  EXCLUDE:           {len(exclude_list):>4}건')
print(f'  합계:              {len(auto_pass_list)+len(manual_review_list)+len(exclude_list):>4}건 ✓')
print()
if exclude_reason_ctr:
    print('  EXCLUDE 원인:')
    for k,v in sorted(exclude_reason_ctr.items(), key=lambda x:-x[1]):
        print(f'    {k}: {v}건')
if manual_reason_ctr:
    print('  MANUAL_REVIEW 원인:')
    for k,v in sorted(manual_reason_ctr.items(), key=lambda x:-x[1]):
        print(f'    {k}: {v}건')
if caveat_flag_ctr:
    print('  CAVEAT 플래그 분포:')
    for k,v in sorted(caveat_flag_ctr.items(), key=lambda x:-x[1]):
        print(f'    {k}: {v}건')
print()
print(f'  VERDICT: PASS')
print('=' * 60)
