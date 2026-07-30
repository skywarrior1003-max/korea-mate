"""
build-busan-golden-dataset-v1.py
TASK-BUSAN-GOLDEN-DATASET-V1

부산 enriched candidates에서 60건을 선정하여 Golden Dataset v1을 생성한다.
- 외부 API 호출 없음
- enriched candidates / source facts 수정 없음
- 추정값과 확인값을 VERIFIED/DERIVED/PROPOSED/UNRESOLVED로 명확히 구분
"""
import json
import sys
import hashlib
from pathlib import Path
from datetime import datetime, timezone

sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path(__file__).parent.parent
ENRICHED_PATH = ROOT / 'data/tourapi/enriched/busan/busan-enriched-candidates-v1.jsonl'
SOURCE_PATH   = ROOT / 'data/tourapi/enriched/busan/busan-source-facts-v1.jsonl'
OUTPUT_JSONL  = ROOT / 'data/tourapi/validation/busan-golden-dataset-v1.jsonl'
OUTPUT_MANIFEST = ROOT / 'data/tourapi/validation/busan-golden-dataset-v1-manifest.json'
OUTPUT_REPORT = ROOT / 'data/tourapi/reports/busan/busan-golden-dataset-v1-validation.json'
FIXTURE_PATH  = ROOT / 'data/tourapi/validation/busan-regression-fixtures-v1.json'

RUN_TS = datetime.now(tz=timezone.utc).isoformat()

# ── 선정 목록 (60건) ──────────────────────────────────────────────────────────

REQUIRED_IDS = {
    'busan-K-00674', 'busan-K-00740',   # attraction required
    'busan-F-00341', 'busan-VB-2097',    # restaurant required
    'busan-VB-1721', 'busan-VB-2704', 'busan-VB-518',  # 쿠킹클래스 required
    'busan-E-00026', 'busan-E-00029',    # event required
}

SELECTION_ORDERED = [
    # ── ATTRACTION (15) ──────────────────────────────────────────────────────
    {'cid': 'busan-K-00003', 'group': 'normal',   'risk': 'kto_en_link',      'inclusion': '부산 대표 해수욕장 — KTO EN 정상 연결 (dist=0m, j=1.0) 대표 사례'},
    {'cid': 'busan-K-00017', 'group': 'normal',   'risk': 'landmark',          'inclusion': '랜드마크 교량 — 위치 논쟁 없는 명확한 대표 사례'},
    {'cid': 'busan-K-00058', 'group': 'normal',   'risk': 'complex_market',    'inclusion': '국제시장 — 시장·복합시설 동일성 판정 기준 사례; busan-K-00141과 좌표 인접'},
    {'cid': 'busan-K-00141', 'group': 'highrisk', 'risk': 'same_location_diff_entity', 'inclusion': '국제시장 먹자골목 — K-00058과 같은 위치의 서로 다른 entity; 병합 금지 검증'},
    {'cid': 'busan-K-00192', 'group': 'normal',   'risk': 'kto_en_link',       'inclusion': '이바구공작소 — KTO EN 연결 정상 사례'},
    {'cid': 'busan-K-00249', 'group': 'normal',   'risk': 'kto_en_link',       'inclusion': '영도 흰여울해안터널 — 터널형 장소 좌표·입구 판정 사례'},
    {'cid': 'busan-K-00684', 'group': 'normal',   'risk': 'kto_en_link',       'inclusion': '송도스카이파크 — 체험형 관광시설 대표 사례'},
    {'cid': 'busan-K-00678', 'group': 'normal',   'risk': 'kto_en_link',       'inclusion': 'UN조각공원 — 역사·외교 장소 special naming'},
    {'cid': 'busan-VB-2284', 'group': 'highrisk', 'risk': 'facility_naming',   'inclusion': 'BNK부산은행 아트시네마 모퉁이극장 — 독립영화관, BIFF/영화의전당 생태계 내 별도 시설'},
    {'cid': 'busan-K-00674', 'group': 'highrisk', 'risk': 'coord_out_of_bounds', 'inclusion': '[REQUIRED] 반송공원 — 좌표 부산 범위 이탈(lat=19.69) → needs_arrival; fixture case-08 연결'},
    {'cid': 'busan-K-00740', 'group': 'highrisk', 'risk': 'facility_within_facility', 'inclusion': '[REQUIRED] 영화의전당 라이브러리 자료실 — 문화시설 내부 장소; busan-E-00026(BIFF) 개최지 관련'},
    {'cid': 'busan-A-00001', 'group': 'normal',   'risk': 'no_en_source',      'inclusion': '흰여울문화마을 — AttractionService 원천, EN 연결 없음; 다국어 미확보 대표 사례'},
    {'cid': 'busan-K-00696', 'group': 'highrisk', 'risk': 'kto_en_low_j',      'inclusion': '동서대학교 소향씨어터 신한카드홀 — KTO EN 연결 j=0.67 경계 사례 (장소명에 기관명 포함)'},
    {'cid': 'busan-VB-2165', 'group': 'highrisk', 'risk': 'needs_district',    'inclusion': '아비베르컴퍼니 — VisitBusan 원천, 주소 구명 완전 누락 (needs_district)'},
    {'cid': 'busan-VB-2557', 'group': 'highrisk', 'risk': 'needs_district',    'inclusion': '사바이사바이 전포 — VisitBusan 원천, 주소 구명 누락 + needs_arrival_verification'},

    # ── NATURE (9) ───────────────────────────────────────────────────────────
    {'cid': 'busan-K-00216', 'group': 'normal',   'risk': 'trail',             'inclusion': '문탠로드 — 해안 산책로 대표 사례 (명확한 단일 트레일)'},
    {'cid': 'busan-K-00236', 'group': 'highrisk', 'risk': 'kto_en_low_j',      'inclusion': '송도 구름산책로 — KTO EN 연결 j=0.58 경계 (자연 장소 명칭 다양성)'},
    {'cid': 'busan-K-00177', 'group': 'highrisk', 'risk': 'trail_segment',     'inclusion': '[부산 갈맷길] 2코스 2구간 — 구간 분할 트레일: 상위 코스와의 동일성 판정 위험'},
    {'cid': 'busan-K-00278', 'group': 'normal',   'risk': 'trail',             'inclusion': '회동수원지 둘레길 — 자연 저수지 둘레길, 복수 진입로 고려'},
    {'cid': 'busan-K-00295', 'group': 'highrisk', 'risk': 'trail_named',       'inclusion': '[해파랑길] 2코스 — 광역 트레일 부산 구간; 상위 트레일 브랜드와 단위 구간 동일성'},
    {'cid': 'busan-K-00299', 'group': 'highrisk', 'risk': 'image_exhausted',   'inclusion': '광안리 SUP Zone — kto_en True, image_status=source_exhausted; 이미지 권리 불확실 사례'},
    {'cid': 'busan-K-00301', 'group': 'highrisk', 'risk': 'kto_en_distance',   'inclusion': '해안누리길 몰운대길 — KTO EN dist=16.4m (선형 장소 중심점 불일치 위험)'},
    {'cid': 'busan-K-00309', 'group': 'highrisk', 'risk': 'nature_facility',   'inclusion': '부산항힐링야영장 — 자연 장소 내 인공시설; 야영장과 자연경관 동일성 경계'},
    {'cid': 'busan-K-00422', 'group': 'highrisk', 'risk': 'tour_nature_boundary', 'inclusion': '부산요트투어 3355마린 — 체험 투어 서비스 vs 자연 장소 category 경계'},

    # ── RESTAURANT (21) ──────────────────────────────────────────────────────
    {'cid': 'busan-F-00341', 'group': 'highrisk', 'risk': 'coord_duplicate',   'inclusion': '[REQUIRED] 보느파티쓰리 — lat==lng (35.195267) → needs_arrival; fixture case-07 연결'},
    {'cid': 'busan-VB-2097', 'group': 'highrisk', 'risk': 'arrival_restore',   'inclusion': '[REQUIRED] 영도해녀촌 — VB 직접 수집, source_count=0, arrival RESTORE 결정 사례'},
    {'cid': 'busan-VB-1721', 'group': 'highrisk', 'risk': 'identity_cooking',  'inclusion': '[REQUIRED] 코리아쿠킹클래스 밥상 인 부산 — 쿠킹클래스 vs 식당 entity 구분 필요'},
    {'cid': 'busan-VB-2704', 'group': 'highrisk', 'risk': 'identity_cooking',  'inclusion': '[REQUIRED] 배로모디 — 쿠킹클래스 identity 판정 미결; manual_review 대상'},
    {'cid': 'busan-VB-518',  'group': 'highrisk', 'risk': 'identity_cooking',  'inclusion': '[REQUIRED] 부산 로컬푸드 쿠킹클래스 — 쿠킹클래스 identity; source_count=0 VB 직접'},
    {'cid': 'busan-K-00131', 'group': 'normal',   'risk': 'kto_en_restaurant', 'inclusion': '일품한우 — 식당 KTO EN 연결 정상 사례 (dist=0m, j=1.0)'},
    {'cid': 'busan-F-00002', 'group': 'normal',   'risk': 'clean_publishable', 'inclusion': '만호갈미샤브샤브 — multi_source_verified, hours_applied, flags=[] → 공개 가능 대표 사례'},
    {'cid': 'busan-F-00004', 'group': 'normal',   'risk': 'clean_publishable', 'inclusion': '부흥식당 — multi_source_verified, hours_applied, classic 국밥 대표'},
    {'cid': 'busan-F-00005', 'group': 'normal',   'risk': 'branch_cleared',    'inclusion': '사미헌 — 지점 자동 해소 후 정상 대표 (단독 상호·고유 위치)'},
    {'cid': 'busan-F-00003', 'group': 'highrisk', 'risk': 'hours_closure',     'inclusion': '민물가든 — hours에 휴업 기간 포함 ("24.03.12 ~ 24.12.31 휴업중") → hours 품질 edge case'},
    {'cid': 'busan-F-00046', 'group': 'highrisk', 'risk': 'hotel_internal',    'inclusion': '내당 — 주소 "호텔농심 별관" → 호텔 내부 식당; 호텔 entity와 식당 entity 구분'},
    {'cid': 'busan-F-00015', 'group': 'highrisk', 'risk': 'branch_name_main',  'inclusion': '이재모피자 본점 — 상호명에 "본점" 명시; 지점과의 동일성 경계 사례'},
    {'cid': 'busan-F-00020', 'group': 'highrisk', 'risk': 'branch_name_main',  'inclusion': '금수복국 해운대본점 — "본점" 명시 + 지역명; 복수 지점 존재 가능성'},
    {'cid': 'busan-F-00068', 'group': 'highrisk', 'risk': 'identity_naming',   'inclusion': '디저트시네마 — 상호명에 "시네마" 포함; 영화관 vs 디저트 카페 identity 혼동 위험, flags=[]'},
    {'cid': 'busan-F-00008', 'group': 'highrisk', 'risk': 'branch_name_main',  'inclusion': '국제밀면본점 — "본점" 명시, 국제시장 인근; 시장 내부/주변 복수 지점 가능'},
    {'cid': 'busan-F-00012', 'group': 'highrisk', 'risk': 'needs_branch',      'inclusion': '물꽁식당 — 동일 상호 2건 지점 미해소 (needs_restaurant_branch)'},
    {'cid': 'busan-F-00013', 'group': 'highrisk', 'risk': 'needs_branch',      'inclusion': '부산명물횟집 — 동일 상호 2건 지점 미해소'},
    {'cid': 'busan-F-00016', 'group': 'highrisk', 'risk': 'needs_branch',      'inclusion': '모모스커피 — 부산 유명 커피 브랜드, 동일 상호 2건; 체인 지점 판정 대표 사례'},
    {'cid': 'busan-F-00022', 'group': 'highrisk', 'risk': 'needs_branch',      'inclusion': '동백섬횟집 — 동일 상호 2건, 동백섬 관광지 인근; 위치 기반 지점 판정'},
    {'cid': 'busan-F-00036', 'group': 'highrisk', 'risk': 'needs_branch',      'inclusion': '옛날오막집 — 동일 상호 2건 지점 미해소'},
    {'cid': 'busan-VB-1248', 'group': 'highrisk', 'risk': 'needs_district',    'inclusion': 'GAB148 Steak & Pasta — VisitBusan 원천, 주소 구명 누락 (needs_district)'},

    # ── ACCOMMODATION (6) ────────────────────────────────────────────────────
    {'cid': 'busan-K-00077', 'group': 'normal',   'risk': 'major_hotel',       'inclusion': '코모도 호텔 부산 — KTO 원천, kto_en_linked 없음; 대형 호텔 영문명 미연결 사례'},
    {'cid': 'busan-K-00078', 'group': 'highrisk', 'risk': 'kto_en_low_j',      'inclusion': '파라다이스 호텔 부산 — KTO EN j=0.58 (호텔명 약어 vs 풀네임 jaccard 경계)'},
    {'cid': 'busan-K-00147', 'group': 'normal',   'risk': 'kto_en_link',       'inclusion': '부산 센트럴호텔 — KTO EN j=1.0 dist=2.4m (소규모 거리 차이 수용 확인)'},
    {'cid': 'busan-K-00210', 'group': 'normal',   'risk': 'kto_en_link',       'inclusion': '코오롱 씨클라우드 호텔 — KTO EN 연결, 해운대 랜드마크 숙박'},
    {'cid': 'busan-K-00302', 'group': 'highrisk', 'risk': 'kto_en_distance',   'inclusion': '호텔포레 프리미어 남포 — KTO EN dist=0.4m; 소규모 위치 오차 허용 확인'},
    {'cid': 'busan-K-00245', 'group': 'highrisk', 'risk': 'small_accommodation','inclusion': '비치모텔 — 소형 숙박시설 KTO EN 연결; 대형 호텔과 다른 속성 패턴 확인'},

    # ── EVENT (9) ────────────────────────────────────────────────────────────
    {'cid': 'busan-E-00026', 'group': 'highrisk', 'risk': 'facility_vs_event', 'inclusion': '[REQUIRED] 부산국제영화제(BIFF) — 영화의전당(K-00740) 개최지; 시설과 행사 entity 구분 핵심 사례'},
    {'cid': 'busan-E-00029', 'group': 'highrisk', 'risk': 'multi_venue_event', 'inclusion': '[REQUIRED] 부산연등회 — 복수 개최지(송상현광장+부산시민공원); 행사 좌표 단일화 불가 사례'},
    {'cid': 'busan-E-00014', 'group': 'highrisk', 'risk': 'duplicate_source',  'inclusion': '해운대 빛축제 (AttractionService 원천) — K-00211과 동일 행사, 다른 source; 중복 수집 감지'},
    {'cid': 'busan-K-00211', 'group': 'highrisk', 'risk': 'duplicate_source',  'inclusion': '해운대 빛축제 (KorService2 원천, kto_en=True) — E-00014와 동일 행사 중복; 병합 또는 제외 판정 필요'},
    {'cid': 'busan-K-00773', 'group': 'normal',   'risk': 'kto_en_event',      'inclusion': '옥토버페스타 인 광안리 — KTO EN 연결 행사, 연간 반복 행사 좌표 일관성'},
    {'cid': 'busan-K-00757', 'group': 'highrisk', 'risk': 'facility_vs_event', 'inclusion': '부산국제AI영화제 — 영화의전당 관련 행사; 영화의전당(K-00740)·BIFF(E-00026)와의 entity 경계'},
    {'cid': 'busan-E-00034', 'group': 'highrisk', 'risk': 'similar_event',     'inclusion': '부산국제어린이청소년영화제 — BIFF(E-00026)와 명칭 유사; 부산 영화제 군집 구분'},
    {'cid': 'busan-E-00006', 'group': 'normal',   'risk': 'major_event',       'inclusion': '부산불꽃축제 — 대규모 연간 행사, 다수 관람 지점; 도심 행사 좌표 대표 사례'},
    {'cid': 'busan-E-00037', 'group': 'highrisk', 'risk': 'new_event_2026',    'inclusion': '2026 원아시아페스티벌(BOF) — 2026년 신규 행사; 미래 일정 데이터 품질 검증'},
]

# ── 로드 ──────────────────────────────────────────────────────────────────────

print(f'Loading enriched candidates...')
candidates = {}
with open(ENRICHED_PATH, encoding='utf-8') as f:
    for line in f:
        c = json.loads(line)
        candidates[c['candidate_id']] = c

fixtures = json.loads(FIXTURE_PATH.read_text(encoding='utf-8'))
fixture_map = {fx['candidate_id']: fx['fixture_id'] for fx in fixtures['fixtures'] if 'candidate_id' in fx}

# ── 헬퍼 함수 ────────────────────────────────────────────────────────────────

def get_coord_status(aa, pv):
    status = aa.get('status', '')
    if status == 'invalid_source_coordinates':
        src_lat = aa.get('source_lat')
        src_lng = aa.get('source_lng')
        if src_lat == src_lng:
            return 'invalid_duplicate_value', None, None
        if src_lat is not None and (src_lat < 30 or src_lat > 40):
            return 'invalid_out_of_bounds', None, None
        return 'invalid', None, None
    lat = pv.get('lat')
    lng = pv.get('lng')
    src_lat = aa.get('source_lat')
    src_lng = aa.get('source_lng')
    if lat is not None and lng is not None:
        return 'valid', lat, lng
    if src_lat is not None and src_lng is not None:
        return 'source_only', src_lat, src_lng
    return 'absent', None, None

def get_publishability(flags, validation_status, arr_status, img_status, cat):
    blocking = {'needs_arrival', 'needs_district', 'needs_restaurant_branch'}
    if any(f in blocking for f in flags):
        return 'pending_review'
    if arr_status == 'invalid_source_coordinates':
        return 'pending_review'
    if validation_status == 'source_data_missing':
        return 'pending_source'
    # Only map_name_ko left → publishable
    remaining = set(flags) - {'needs_map_name_ko'}
    if not remaining:
        return 'publishable'
    # Has some content/translation/hours missing but not blocking
    heavy_missing = {'needs_content', 'needs_translation'}
    if heavy_missing.issubset(remaining) and img_status == 'source_exhausted':
        return 'pending_review'
    return 'publishable_with_caveat'

def get_name_en_status(c):
    qa = c.get('qa02_corrections', {})
    ss = c.get('source_summary', {})
    pv = c.get('proposed_values', {})
    if qa.get('kto_en_linked'):
        return 'VERIFIED', pv.get('name_en')
    if ss.get('has_english_source') and pv.get('name_en'):
        return 'DERIVED', pv.get('name_en')
    if pv.get('name_en'):
        return 'PROPOSED', pv.get('name_en')
    return 'UNRESOLVED', None

def get_district_status(c):
    de = c.get('district_enrichment', {})
    v = c.get('validation', {})
    if 'needs_district' in v.get('review_flags', []):
        return 'UNRESOLVED', None
    if de.get('quality') == 'name_present':
        return 'VERIFIED', de.get('decoded') or de.get('original')
    return 'DERIVED', de.get('decoded') or de.get('original')

def get_hours_status(c):
    qa = c.get('qa02_corrections', {})
    v = c.get('validation', {})
    if qa.get('hours_applied') and qa.get('hours_value'):
        return 'VERIFIED', qa.get('hours_value')
    if 'needs_hours' in v.get('review_flags', []):
        return 'UNRESOLVED', None
    return 'NOT_APPLICABLE', None

def get_arrival_status(c):
    aa = c.get('arrival_assessment', {})
    v = c.get('validation', {})
    flags = v.get('review_flags', [])
    if 'needs_arrival' in flags:
        return 'invalid_coordinates_require_manual_arrival'
    if 'needs_arrival_verification' in flags:
        status = aa.get('status', '')
        return f'pending_verification ({status})'
    return aa.get('status', 'accepted')

def get_branch_status(c):
    qa = c.get('qa02_corrections', {})
    v = c.get('validation', {})
    if c['category'] != 'restaurant':
        return 'N/A'
    if 'needs_restaurant_branch' in v.get('review_flags', []):
        return 'unresolved'
    if qa.get('restaurant_branch_cleared'):
        return 'cleared'
    return 'not_applicable'

def get_image_status(c):
    img = c.get('image_assessment', {})
    v = c.get('validation', {})
    status = img.get('image_status', '?')
    rights = img.get('rights_status', '?')
    if 'needs_image' in v.get('review_flags', []):
        return 'insufficient', 'UNRESOLVED'
    if status == 'image_sufficient':
        if rights in ('operational_assumed', 'rights_confirmed'):
            return status, 'DERIVED'
        return status, 'PROPOSED'
    if status == 'image_partial':
        return status, 'PROPOSED'
    return status, 'UNRESOLVED'

def get_description_status(c):
    ss = c.get('source_summary', {})
    v = c.get('validation', {})
    if 'needs_content' not in v.get('review_flags', []):
        if ss.get('has_ko_description'):
            return 'present', 'VERIFIED'
        return 'absent_not_flagged', 'UNRESOLVED'
    return 'absent', 'UNRESOLVED'

def get_identity_status(c):
    vs = c.get('validation', {}).get('validation_status', '?')
    if vs == 'multi_source_verified':
        return 'multi_source_confirmed'
    if vs == 'single_source':
        return 'single_source_plausible'
    return 'source_data_missing'

# ── 생성 ──────────────────────────────────────────────────────────────────────

records = []
golden_n = 1
errors = []

for sel in SELECTION_ORDERED:
    cid = sel['cid']
    c = candidates.get(cid)
    if c is None:
        errors.append(f'{cid}: NOT FOUND')
        continue

    pv   = c.get('proposed_values', {})
    v    = c.get('validation', {})
    aa   = c.get('arrival_assessment', {})
    img  = c.get('image_assessment', {})
    qa   = c.get('qa02_corrections', {})
    ss   = c.get('source_summary', {})
    de   = c.get('district_enrichment', {})
    prov = c.get('provenance', {})

    flags            = v.get('review_flags', [])
    validation_status = v.get('validation_status', '?')
    manual_review    = v.get('manual_review_required', False)

    # Fields
    coord_status, lat, lng = get_coord_status(aa, pv)
    if lat is None and lng is None:
        # fallback to source coords
        lat = aa.get('source_lat')
        lng = aa.get('source_lng')

    name_en_status, name_en_val = get_name_en_status(c)
    district_status, district_val = get_district_status(c)
    hours_status, hours_val = get_hours_status(c)
    img_status_str, img_status_label = get_image_status(c)
    desc_status, desc_label = get_description_status(c)
    identity_status = get_identity_status(c)
    branch_status = get_branch_status(c)
    arrival_status = get_arrival_status(c)
    publishability = get_publishability(
        flags, validation_status,
        aa.get('status', ''),
        img.get('image_status', ''),
        c['category']
    )

    # Address
    addr = pv.get('address')
    addr_status = 'DERIVED' if addr else 'UNRESOLVED'

    # Source refs
    source_keys = ss.get('source_keys', [])
    primary_ref = prov.get('primary_source_ref', '')

    # Forbidden decisions
    forbidden = []
    risk = sel['risk']
    if risk == 'coord_duplicate':
        forbidden = ['arrival_resolved=true 허용', 'lat==lng를 유효 좌표로 판정']
    elif risk == 'coord_out_of_bounds':
        forbidden = ['arrival_resolved=true 허용', 'lat=19.69를 부산 좌표로 판정']
    elif risk == 'identity_cooking':
        forbidden = ['쿠킹클래스를 식당으로 자동 분류', '좌표 인접만으로 동일 entity 판정']
    elif risk == 'same_location_diff_entity':
        forbidden = ['K-00058과 K-00141을 동일 entity로 병합', '좌표 일치만으로 중복 제거']
    elif risk == 'needs_branch':
        forbidden = ['needs_restaurant_branch 미해소 상태로 공개', '동일 상호 2건을 자동으로 동일 장소 판정']
    elif risk == 'hotel_internal':
        forbidden = ['호텔 entity와 식당 entity 병합', '호텔 주소를 식당 단독 주소로 확정']
    elif risk == 'duplicate_source':
        forbidden = ['E-00014와 K-00211을 서로 다른 장소로 공개', '중복 병합 없이 둘 다 공개']
    elif risk == 'multi_venue_event':
        forbidden = ['복수 개최지 중 1건으로 좌표 확정', 'arrival_resolved=true 강제 부여']
    elif risk == 'facility_vs_event':
        forbidden = ['BIFF 행사를 영화의전당 건물과 동일 entity로 판정']
    elif risk == 'needs_district':
        forbidden = ['구명 없이 publishable 판정', 'needs_district 미해소로 공개 허용']
    elif 'kto_en_low_j' in risk:
        forbidden = ['j<0.75를 무조건 bijective 실패로 판정', 'j<1.0을 무조건 false positive로 제거']
    elif risk == 'arrival_restore':
        forbidden = ['source_count=0을 join 오류로 판정', 'arrival RESTORE 결정을 무시하고 arrival_resolved=true 유지']

    # Review flags expected (same as current)
    review_flags_expected = flags[:]

    # Fixture link
    fixture_link = fixture_map.get(cid)

    # Conflicts
    conflicts = []
    if risk == 'duplicate_source' and cid == 'busan-E-00014':
        conflicts = [{'type': 'duplicate_event', 'counterpart': 'busan-K-00211', 'note': '동일 행사 중복 수집 — 병합 또는 제외 판정 필요'}]
    elif risk == 'duplicate_source' and cid == 'busan-K-00211':
        conflicts = [{'type': 'duplicate_event', 'counterpart': 'busan-E-00014', 'note': '동일 행사 중복 수집 — 병합 또는 제외 판정 필요'}]
    elif risk == 'same_location_diff_entity' and cid == 'busan-K-00141':
        conflicts = [{'type': 'coord_proximity', 'counterpart': 'busan-K-00058', 'note': '국제시장과 인접 좌표 — 병합 금지, 별도 entity 유지'}]

    # Coordinate representation
    if coord_status == 'invalid_duplicate_value':
        coord_repr = {'status': 'invalid', 'error_type': 'duplicate_coordinate_value',
                      'source_lat': aa.get('source_lat'), 'source_lng': aa.get('source_lng')}
    elif coord_status == 'invalid_out_of_bounds':
        coord_repr = {'status': 'invalid', 'error_type': 'out_of_busan_bounds',
                      'source_lat': aa.get('source_lat'), 'source_lng': aa.get('source_lng')}
    elif coord_status in ('valid', 'source_only'):
        coord_repr = {'status': 'valid', 'lat': lat, 'lng': lng,
                      'verification_status': 'VERIFIED' if coord_status == 'valid' else 'DERIVED'}
    else:
        coord_repr = {'status': 'absent'}

    record = {
        'golden_id':                 f'GD-BUSAN-{golden_n:03d}',
        'candidate_id':              cid,
        'category':                  c['category'],
        'subcategory':               risk,
        'group':                     sel['group'],
        'canonical_name_ko':         pv.get('name_ko'),
        'expected_name_en':          name_en_val,
        'name_en_verification':      name_en_status,
        'entity_type':               identity_status,
        'branch_name':               qa.get('restaurant_branch_note') if c['category'] == 'restaurant' else None,
        'expected_address':          addr,
        'address_verification':      addr_status,
        'expected_district':         district_val,
        'district_verification':     district_status,
        'expected_coordinates':      coord_repr,
        'expected_identity_status':  identity_status,
        'expected_branch_status':    branch_status,
        'expected_arrival_status':   arrival_status,
        'expected_hours_status':     {'value': hours_val, 'verification': hours_status},
        'expected_image_status':     {'status': img_status_str, 'rights': img.get('rights_status'), 'verification': img_status_label},
        'expected_description_status': {'status': desc_status, 'verification': desc_label},
        'expected_publishability':   publishability,
        'review_flags_expected':     review_flags_expected,
        'primary_source_refs':       source_keys,
        'primary_source_origin':     primary_ref,
        'supporting_source_refs':    [],
        'conflicts':                 conflicts,
        'forbidden_decisions':       forbidden,
        'fixture_link':              fixture_link,
        'inclusion_reason':          sel['inclusion'],
        'manual_review_required':    manual_review,
        'verification_status':       {
            'name_ko':          'VERIFIED',
            'name_en':          name_en_status,
            'address':          addr_status,
            'district':         district_status,
            'coordinates':      'VERIFIED' if coord_status == 'valid' else ('DERIVED' if coord_status == 'source_only' else 'UNRESOLVED'),
            'hours':            hours_status,
            'description':      desc_label,
            'image':            img_status_label,
            'publishability':   'DERIVED',
        },
        '_enriched_at':              prov.get('enriched_at'),
        '_ssot_version':             prov.get('ssot_version'),
    }
    records.append(record)
    golden_n += 1

# ── 검증 ──────────────────────────────────────────────────────────────────────

total = len(records)
assert total >= 60, f'선정 수 미달: {total}'
assert total <= 80, f'선정 수 초과: {total}'

cids_seen = [r['candidate_id'] for r in records]
dupes = [cid for cid in cids_seen if cids_seen.count(cid) > 1]
assert not dupes, f'candidate_id 중복: {dupes}'

for cid in cids_seen:
    assert cid in candidates, f'{cid}: enriched candidates에 없음'

for req in REQUIRED_IDS:
    assert req in cids_seen, f'필수 candidate 누락: {req}'

print(f'Validation: {total} records, 0 duplicates, all required IDs present')

# ── SHA256 계산 ───────────────────────────────────────────────────────────────

lines_bytes = b''.join((json.dumps(r, ensure_ascii=False) + '\n').encode('utf-8') for r in records)
output_sha256 = hashlib.sha256(lines_bytes).hexdigest()

enriched_sha = hashlib.sha256(ENRICHED_PATH.read_bytes()).hexdigest()

# ── 통계 ──────────────────────────────────────────────────────────────────────

from collections import Counter

cat_counts   = Counter(r['category'] for r in records)
group_counts = Counter(r['group'] for r in records)
pub_counts   = Counter(r['expected_publishability'] for r in records)

ver_counts = Counter()
for r in records:
    for field, status in r['verification_status'].items():
        ver_counts[status] += 1

fixture_links = [r['fixture_link'] for r in records if r['fixture_link']]
unresolved = [
    {'golden_id': r['golden_id'], 'candidate_id': r['candidate_id'],
     'fields': [f for f, s in r['verification_status'].items() if s == 'UNRESOLVED']}
    for r in records if 'UNRESOLVED' in r['verification_status'].values()
]

# ── 저장 ──────────────────────────────────────────────────────────────────────

OUTPUT_JSONL.parent.mkdir(parents=True, exist_ok=True)
OUTPUT_MANIFEST.parent.mkdir(parents=True, exist_ok=True)
OUTPUT_REPORT.parent.mkdir(parents=True, exist_ok=True)

# JSONL
with open(OUTPUT_JSONL, 'w', encoding='utf-8') as f:
    for r in records:
        f.write(json.dumps(r, ensure_ascii=False) + '\n')
print(f'JSONL 저장: {OUTPUT_JSONL.relative_to(ROOT)}')

# Manifest
manifest = {
    'manifest_id':               'busan-golden-dataset-v1-manifest',
    'task':                      'TASK-BUSAN-GOLDEN-DATASET-V1',
    'created':                   RUN_TS,
    'branch':                    'data/busan-enrichment-v1',
    'total_records':             total,
    'sha256':                    output_sha256,
    'enriched_candidates_sha256': enriched_sha,
    'fixture_set':               fixtures['fixture_set_id'],
    'category_distribution':     dict(cat_counts),
    'group_distribution':        dict(group_counts),
    'publishability_distribution': dict(pub_counts),
    'verification_status_totals': dict(ver_counts),
    'fixture_links':             fixture_links,
    'required_ids_present':      sorted(REQUIRED_IDS),
    'output_path':               str(OUTPUT_JSONL.relative_to(ROOT)),
    'api_calls':                 0,
    'data_modified':             False,
}
OUTPUT_MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'Manifest 저장: {OUTPUT_MANIFEST.relative_to(ROOT)}')

# Validation report
report = {
    'report_id':                 'busan-golden-dataset-v1-validation',
    'task':                      'TASK-BUSAN-GOLDEN-DATASET-V1',
    'verdict':                   'PASS' if not errors else 'FAIL',
    'run_ts':                    RUN_TS,
    'total_selected':            total,
    'category_distribution':     dict(cat_counts),
    'group_distribution':        dict(group_counts),
    'publishability_distribution': dict(pub_counts),
    'verification_status_totals': dict(ver_counts),
    'fixture_links':             fixture_links,
    'unresolved_fields':         unresolved,
    'errors':                    errors,
    'checks': {
        'count_60_80':           60 <= total <= 80,
        'no_duplicates':         len(dupes) == 0,
        'all_in_enriched':       all(cid in candidates for cid in cids_seen),
        'required_ids_present':  all(req in cids_seen for req in REQUIRED_IDS),
        'normal_and_highrisk':   group_counts.get('normal', 0) > 0 and group_counts.get('highrisk', 0) > 0,
        'api_calls':             0,
        'data_modified':         False,
    },
    'selection_criteria': {
        'method': 'structured_dual_group — 정상 대표 + 고위험 경계 사례',
        'reproducible': '후보 ID 명시적 지정, enriched candidates 기준 재현 가능',
        'risk_types_covered': list({sel['risk'] for sel in SELECTION_ORDERED}),
    },
}
OUTPUT_REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'Validation report 저장: {OUTPUT_REPORT.relative_to(ROOT)}')

# Summary
print(f'\n=== 검증 결과 ===')
verdict = report['verdict']
print(f'VERDICT: {verdict}')
print(f'총 선정: {total}건')
print(f'category: {dict(cat_counts)}')
print(f'group: {dict(group_counts)}')
print(f'publishability: {dict(pub_counts)}')
print(f'fixture 연결: {len(fixture_links)}건 — {fixture_links}')
print(f'unresolved 레코드: {len(unresolved)}건')
print(f'출력 SHA256: {output_sha256[:16]}...')
print(f'외부 API 호출: 0건 | 데이터 수정: 없음')
