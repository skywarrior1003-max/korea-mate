#!/usr/bin/env python3
"""
경주 정규화 + candidates 생성 (Phase 11)
- GJ-01/06/07/08/09 + KTO KorService2 → gyeongju-source-facts-v1.jsonl
- 동일성 연결 (GJ-08/09 중복, GJ-01 ↔ KTO)
- gyeongju-enriched-candidates-v1.jsonl 생성
- 이미지 API (GJ-03/04/05)는 supplementary 처리 (설계 결정 A)

결정적 정렬: source_fact_id 기준 정렬로 동일 raw → 동일 출력 보장

사용법:
  python gyeongju_normalize.py [옵션]
  python gyeongju_normalize.py --help
"""
import argparse, json, os, re, sys, hashlib, time
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8', errors='replace')


def parse_args():
    p = argparse.ArgumentParser(
        description='경주 raw → source facts → enriched candidates 정규화',
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    p.add_argument('--in-city-raw', default='data/tourapi/raw/gyeongju/gyeongju-city-api',
                   help='경주시 API raw 입력 디렉터리')
    p.add_argument('--in-kto-raw', default='data/tourapi/raw/gyeongju/kto-list',
                   help='KTO KorService2 raw 입력 디렉터리')
    p.add_argument('--out-candidates', default='data/tourapi/candidates/gyeongju',
                   help='source facts 출력 디렉터리')
    p.add_argument('--out-enriched', default='data/tourapi/enriched/gyeongju',
                   help='enriched candidates 출력 디렉터리')
    p.add_argument('--out-report', default='data/tourapi/reports/gyeongju',
                   help='정규화 통계 출력 디렉터리')
    return p.parse_args()


def sha256_file(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def strip_html(text) -> str:
    if not text:
        return None
    cleaned = re.sub(r'<[^>]+>', '', str(text))
    cleaned = re.sub(r'&nbsp;', ' ', cleaned)
    cleaned = re.sub(r'&lt;', '<', cleaned)
    cleaned = re.sub(r'&gt;', '>', cleaned)
    cleaned = re.sub(r'&amp;', '&', cleaned)
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    return cleaned if cleaned else None


def safe_float(val):
    try:
        if val is None or str(val).strip() in ('', 'None', 'null'):
            return None
        return float(val)
    except Exception:
        return None


def normalize_addr(addr) -> str:
    if not addr:
        return None
    s = str(addr).strip().strip('"').strip("'")
    return s if s else None


def write_jsonl(path: Path, records: list):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + '\n')


KTO_CAT_MAP = {
    '12': 'attraction', '14': 'attraction', '15': 'event',
    '28': 'nature', '32': 'accommodation', '38': 'attraction', '39': 'restaurant',
}

SOURCE_PRIORITY = {
    'gyeongju-city/touristDestinationService': 1,
    'gyeongju-city/theNightViewService': 1,
    'gyeongju-city/observationPointService': 1,
    'gyeongju-city/menuRstrtService': 1,
    'gyeongju-city/eatHtpService': 1,
    'kto/KorService2/type12': 2,
    'kto/KorService2/type14': 2,
    'kto/KorService2/type15': 2,
    'kto/KorService2/type28': 2,
    'kto/KorService2/type32': 2,
    'kto/KorService2/type38': 2,
    'kto/KorService2/type39': 2,
}


def main():
    args = parse_args()
    raw_city = Path(args.in_city_raw)
    raw_kto  = Path(args.in_kto_raw)
    cand_dir = Path(args.out_candidates)
    enrich   = Path(args.out_enriched)
    report   = Path(args.out_report)
    now_iso  = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())

    source_facts = []
    sf_id_set = set()

    def add_sf(sf: dict):
        sfid = sf['source_fact_id']
        if sfid in sf_id_set:
            print(f'  [WARN] duplicate source_fact_id: {sfid}')
            return
        sf_id_set.add(sfid)
        source_facts.append(sf)

    # GJ-01
    gj01 = json.loads((raw_city / 'GJ-01-tourist-destination-full.json').read_text(encoding='utf-8'))
    for idx, it in enumerate(gj01['items']):
        name = str(it.get('TRRSRT', '') or '').strip()
        if not name:
            continue
        add_sf({
            'source_fact_id': f'gyeongju-GJ01-{idx+1:04d}',
            'source': 'gyeongju-city/touristDestinationService',
            'source_api': 'touristDestinationService',
            'source_record_id': f'GJ01_{idx+1}',
            'city': '경주', 'title_ko': name, 'title_en': None,
            'category': 'attraction', 'subcategory': None,
            'district_gyeongju': str(it.get('TURSM_DSTRCT', '') or '').strip() or None,
            'address': normalize_addr(it.get('ADRES')),
            'lat': None, 'lng': None,
            'phone': str(it.get('TELNO', '') or '').strip() or None,
            'description_ko': None, 'image_url': None,
            'image_rights_status': 'RIGHTS_UNKNOWN', 'official_url': None,
            'event_start_date': None, 'event_end_date': None,
            'opening_hours': None, 'admission': None,
            'provenance': {'primary_source': 'gyeongju-city/touristDestinationService',
                           'operation': 'getTouristDestination',
                           'collected_at': now_iso, 'source_updated_at': None},
        })
    print(f'GJ-01: {sum(1 for f in source_facts if "GJ01" in f["source_fact_id"])}건')

    # GJ-06
    gj06 = json.loads((raw_city / 'GJ-06-night-view-full.json').read_text(encoding='utf-8'))
    for idx, it in enumerate(gj06['items']):
        name = str(it.get('NM', '') or '').strip()
        if not name:
            continue
        hrs = []
        begin = str(it.get('VIEWNG_BEGIN_TIME', '') or '').strip()
        end   = str(it.get('VIEWNG_END_TIME', '') or '').strip()
        if begin and end:
            hrs.append(f"관람 {begin}~{end}")
        night_h = None
        if it.get('NIGHT_SCENE_LGHT_BEGIN_TIME'):
            night_h = f"야경조명 {it.get('NIGHT_SCENE_LGHT_BEGIN_TIME','')}"
            if it.get('NIGHT_SCENE_LGHT_END_TIME'):
                night_h += f"~{it['NIGHT_SCENE_LGHT_END_TIME']}"
        add_sf({
            'source_fact_id': f'gyeongju-GJ06-{idx+1:04d}',
            'source': 'gyeongju-city/theNightViewService',
            'source_api': 'theNightViewService',
            'source_record_id': f'GJ06_{idx+1}',
            'city': '경주', 'title_ko': name, 'title_en': None,
            'category': 'attraction', 'subcategory': 'night_view',
            'district_gyeongju': None,
            'address': normalize_addr(it.get('LC')),
            'lat': None, 'lng': None, 'phone': None,
            'description_ko': None, 'image_url': None,
            'image_rights_status': 'RIGHTS_UNKNOWN', 'official_url': None,
            'event_start_date': None, 'event_end_date': None,
            'opening_hours': ' / '.join(hrs) if hrs else None,
            'night_lighting_hours': night_h,
            'admission': str(it.get('VIEWNG_CT', '') or '').strip() or None,
            'provenance': {'primary_source': 'gyeongju-city/theNightViewService',
                           'operation': 'getTheNightView',
                           'collected_at': now_iso, 'source_updated_at': None},
        })
    print(f'GJ-06: {sum(1 for f in source_facts if "GJ06" in f["source_fact_id"])}건')

    # GJ-07
    gj07 = json.loads((raw_city / 'GJ-07-observation-point-full.json').read_text(encoding='utf-8'))
    for idx, it in enumerate(gj07['items']):
        name = str(it.get('PRSPECT_DOMN', '') or '').strip()
        if not name:
            continue
        add_sf({
            'source_fact_id': f'gyeongju-GJ07-{idx+1:04d}',
            'source': 'gyeongju-city/observationPointService',
            'source_api': 'observationPointService',
            'source_record_id': f'GJ07_{idx+1}',
            'city': '경주', 'title_ko': name, 'title_en': None,
            'category': 'attraction', 'subcategory': 'observation_point',
            'district_gyeongju': None,
            'address': normalize_addr(it.get('LC')),
            'lat': None, 'lng': None, 'phone': None,
            'description_ko': None, 'image_url': None,
            'image_rights_status': 'RIGHTS_UNKNOWN', 'official_url': None,
            'event_start_date': None, 'event_end_date': None,
            'opening_hours': (f"{it.get('VIEWNG_BEGIN_TIME','')}~{it.get('VIEWNG_END_TIME','')}"
                              if it.get('VIEWNG_BEGIN_TIME') else None),
            'admission': str(it.get('ADMFEE', '') or '').strip() or None,
            'parking': str(it.get('PARKNG_INFO', '') or '').strip() or None,
            'provenance': {'primary_source': 'gyeongju-city/observationPointService',
                           'operation': 'getObservationPoint',
                           'collected_at': now_iso, 'source_updated_at': None},
        })
    print(f'GJ-07: {sum(1 for f in source_facts if "GJ07" in f["source_fact_id"])}건')

    # GJ-08
    gj08 = json.loads((raw_city / 'GJ-08-menu-restaurant-full.json').read_text(encoding='utf-8'))
    seen_uid = set()
    for it in gj08['items']:
        uid = str(it.get('CON_UID', '') or '').strip()
        if not uid or uid in seen_uid:
            continue
        seen_uid.add(uid)
        title = str(it.get('CON_TITLE', '') or '').strip()
        if not title:
            continue
        img = str(it.get('CON_IMGFILENAME', '') or '').strip()
        if img and not img.startswith('http'):
            img = f'https://www.gyeongju.go.kr/upload/{img}'
        add_sf({
            'source_fact_id': f'gyeongju-GJ08-{uid}',
            'source': 'gyeongju-city/menuRstrtService',
            'source_api': 'menuRstrtService',
            'source_record_id': uid,
            'city': '경주', 'title_ko': title, 'title_en': None,
            'category': 'restaurant',
            'subcategory': str(it.get('CODE_NAME', '') or '').strip() or None,
            'district_gyeongju': None,
            'address': normalize_addr(it.get('CON_ADDRESS')),
            'lat': safe_float(it.get('CON_LATITUDE')),
            'lng': safe_float(it.get('CON_LONGITUDE')),
            'phone': normalize_addr(it.get('CON_PHONE')),
            'description_ko': strip_html(it.get('CON_CONTENT')),
            'image_url': img or None,
            'image_rights_status': 'RIGHTS_UNKNOWN',
            'official_url': str(it.get('linkurl', '') or it.get('CON_HOMEPAGE', '') or '').strip() or None,
            'event_start_date': None, 'event_end_date': None,
            'opening_hours': strip_html(it.get('CON_SUMMARY')),
            'menu_category': str(it.get('CODE_NAME', '') or '').strip() or None,
            'provenance': {'primary_source': 'gyeongju-city/menuRstrtService',
                           'operation': 'getMenuRstrt',
                           'collected_at': now_iso,
                           'source_updated_at': str(it.get('CON_MDFYDATETIME', '') or '').strip() or None},
        })
    print(f'GJ-08: {sum(1 for f in source_facts if "GJ08" in f["source_fact_id"])}건')

    # GJ-09
    gj09 = json.loads((raw_city / 'GJ-09-eat-hotplace-full.json').read_text(encoding='utf-8'))
    for it in gj09['items']:
        uid = str(it.get('CON_UID', '') or '').strip()
        if not uid:
            continue
        sfid = f'gyeongju-GJ09-{uid}'
        if sfid in sf_id_set:
            continue
        is_dup_gj08 = f'gyeongju-GJ08-{uid}' in sf_id_set
        title = str(it.get('CON_TITLE', '') or it.get('SRC_TITLE', '') or '').strip().strip('"')
        if not title:
            continue
        img = str(it.get('CON_IMGFILENAME', '') or '').strip()
        if img and not img.startswith('http'):
            img = f'https://www.gyeongju.go.kr/{img}'
        lurl = str(it.get('LINKURL', '') or '').strip()
        if lurl and not lurl.startswith('http'):
            lurl = f'https://{lurl}'
        add_sf({
            'source_fact_id': sfid,
            'source': 'gyeongju-city/eatHtpService',
            'source_api': 'eatHtpService',
            'source_record_id': uid,
            'city': '경주', 'title_ko': title, 'title_en': None,
            'category': 'restaurant',
            'subcategory': str(it.get('AREA_NAME', '') or '').strip() or None,
            'district_gyeongju': None,
            'address': normalize_addr(it.get('CON_DESC1')),
            'lat': safe_float(it.get('CON_LATITUDE')),
            'lng': safe_float(it.get('CON_LONGITUDE')),
            'phone': normalize_addr(it.get('CON_DESC2')),
            'description_ko': strip_html(it.get('CON_CONTENT')),
            'image_url': img or None,
            'image_rights_status': 'RIGHTS_UNKNOWN',
            'official_url': lurl or None,
            'event_start_date': None, 'event_end_date': None,
            'opening_hours': None,
            '_identity_note': 'POSSIBLE_DUPLICATE_GJ08' if is_dup_gj08 else None,
            'provenance': {'primary_source': 'gyeongju-city/eatHtpService',
                           'operation': 'getEatHtp',
                           'collected_at': now_iso, 'source_updated_at': None},
        })
    print(f'GJ-09: {sum(1 for f in source_facts if "GJ09" in f["source_fact_id"])}건')

    # KTO
    KTO_FILES = {
        '12': 'kto-type12-tourist-spot-full.json',
        '14': 'kto-type14-cultural-facility-full.json',
        '15': 'kto-type15-festival-event-full.json',
        '28': 'kto-type28-leisure-sport-full.json',
        '32': 'kto-type32-accommodation-full.json',
        '38': 'kto-type38-shopping-full.json',
        '39': 'kto-type39-restaurant-full.json',
    }
    kto_counts = {}
    for ctype, fname in KTO_FILES.items():
        fpath = raw_kto / fname
        if not fpath.exists():
            print(f'  KTO {ctype}: file not found')
            continue
        kdata = json.loads(fpath.read_text(encoding='utf-8'))
        cat = KTO_CAT_MAP.get(ctype, 'attraction')
        cnt = 0
        for it in kdata['items']:
            cid = str(it.get('contentid', '') or '').strip()
            if not cid:
                continue
            sfid = f'gyeongju-KTO{ctype}-{cid}'
            if sfid in sf_id_set:
                continue
            title = str(it.get('title', '') or '').strip()
            if not title:
                continue
            lat = safe_float(it.get('mapy'))
            lng = safe_float(it.get('mapx'))
            coord_ok = (lat is not None and lng is not None
                        and 35.0 < lat < 37.0 and 128.0 < lng < 130.0)
            sf = {
                'source_fact_id': sfid,
                'source': f'kto/KorService2/type{ctype}',
                'source_api': 'KorService2',
                'source_record_id': cid,
                'content_type_id': ctype,
                'city': '경주', 'title_ko': title, 'title_en': None,
                'category': cat, 'subcategory': None, 'district_gyeongju': None,
                'address': normalize_addr(it.get('addr1')),
                'lat': lat if coord_ok else None,
                'lng': lng if coord_ok else None,
                'lat_raw': lat, 'lng_raw': lng, 'coord_validated': coord_ok,
                'phone': normalize_addr(it.get('tel')),
                'description_ko': None,
                'image_url': str(it.get('firstimage', '') or '').strip() or None,
                'image_rights_status': 'RIGHTS_UNKNOWN',
                'official_url': str(it.get('homepage', '') or '').strip() or None,
                'event_start_date': None, 'event_end_date': None, 'opening_hours': None,
                'provenance': {
                    'primary_source': 'kto/KorService2/areaBasedSyncList2',
                    'content_type_id': ctype, 'area_code': '35', 'sigungu_code': '2',
                    'collected_at': now_iso,
                    'source_updated_at': str(it.get('modifiedtime', '') or '').strip() or None,
                },
            }
            if ctype == '15':
                sf['event_start_date'] = str(it.get('eventstartdate', '') or '').strip() or None
                sf['event_end_date']   = str(it.get('eventenddate', '') or '').strip() or None
            add_sf(sf)
            cnt += 1
        kto_counts[ctype] = cnt
        print(f'  KTO type={ctype}: {cnt}건')

    # 결정적 정렬 (source_fact_id 기준)
    source_facts.sort(key=lambda x: x['source_fact_id'])

    sf_path = cand_dir / 'gyeongju-source-facts-v1.jsonl'
    write_jsonl(sf_path, source_facts)
    sf_sha = sha256_file(sf_path)
    print(f'\nSource facts: {len(source_facts)}건 → {sf_path.name} SHA={sf_sha[:16]}')

    # 동일성 연결
    print('\n=== 동일성 연결 ===')

    def norm_name(s: str) -> str:
        if not s:
            return ''
        return re.sub(r'[\s\-_()（）\[\]]+', '', s.lower())

    def norm_addr(s) -> str:
        if not s:
            return ''
        return re.sub(r'\s+', '', str(s))[:20]

    name_idx = {}
    for sf in source_facts:
        nk = norm_name(sf.get('title_ko', ''))
        if nk:
            name_idx.setdefault(nk, []).append(sf['source_fact_id'])

    dup_groups = []
    seen_in_group = set()
    for nk, sfids in sorted(name_idx.items()):  # 결정적 정렬
        if len(sfids) < 2:
            continue
        if any(sfid in seen_in_group for sfid in sfids):
            continue
        addrs = []
        sf_map = {sf['source_fact_id']: sf for sf in source_facts}
        for sfid in sfids:
            addrs.append(norm_addr(sf_map[sfid].get('address')))
        has_addr_match = len(set(a for a in addrs if a)) < len(addrs)
        dup_groups.append({
            'normalized_name': nk,
            'members': sfids,
            'sources': [sf_map[sid]['source'] for sid in sfids],
            'addresses': addrs,
            'identity_confidence': 'high' if has_addr_match or len(sfids) >= 2 else 'low',
            'link_type': 'duplicate_candidate',
        })
        seen_in_group.update(sfids)

    print(f'동일성 그룹: {len(dup_groups)}건')

    # candidates 생성
    sf_map = {sf['source_fact_id']: sf for sf in source_facts}
    dup_sfids = set()
    for g in dup_groups:
        members_p = sorted(
            [(SOURCE_PRIORITY.get(sf_map[sid]['source'], 99), sid) for sid in g['members']],
            key=lambda x: (x[0], x[1])  # 결정적: priority 후 ID
        )
        for _, sid in members_p[1:]:
            dup_sfids.add(sid)

    def candidate_from_sf(sf: dict, identity_status: str, linked_sfs=None) -> dict:
        sfid = sf['source_fact_id']
        return {
            'candidate_id': f'gyeongju-{sfid.replace("gyeongju-", "")}',
            'source_fact_id': sfid,
            'source': sf['source'],
            'city': '경주',
            'title_ko': sf.get('title_ko'),
            'title_en': sf.get('title_en'),
            'category': sf.get('category'),
            'subcategory': sf.get('subcategory'),
            'district_gyeongju': sf.get('district_gyeongju'),
            'address': sf.get('address'),
            'lat': sf.get('lat'),
            'lng': sf.get('lng'),
            'coord_validated': sf.get('coord_validated'),
            'phone': sf.get('phone'),
            'description_ko': sf.get('description_ko'),
            'image_url': sf.get('image_url'),
            'image_rights_status': sf.get('image_rights_status', 'RIGHTS_UNKNOWN'),
            'official_url': sf.get('official_url'),
            'opening_hours': sf.get('opening_hours'),
            'admission': sf.get('admission'),
            'event_start_date': sf.get('event_start_date'),
            'event_end_date': sf.get('event_end_date'),
            'identity_status': identity_status,
            'linked_source_facts': linked_sfs or [],
            'publishability': 'pending_review',
            'provenance': sf.get('provenance', {}),
            'enriched_at': now_iso,
            '_identity_note': sf.get('_identity_note'),
        }

    candidates = []
    cand_id_set = set()

    for g in dup_groups:
        members_p = sorted(
            [(SOURCE_PRIORITY.get(sf_map[sid]['source'], 99), sid) for sid in g['members']],
            key=lambda x: (x[0], x[1])
        )
        primary_sf = sf_map[members_p[0][1]]
        linked = [m[1] for m in members_p[1:]]
        for _, sid in members_p[1:]:
            sec = sf_map[sid]
            if primary_sf['lat'] is None and sec.get('lat') is not None:
                primary_sf['lat'] = sec['lat']
                primary_sf['lng'] = sec['lng']
            if not primary_sf['address'] and sec.get('address'):
                primary_sf['address'] = sec['address']
        cand = candidate_from_sf(primary_sf, 'high_confidence', linked)
        if cand['candidate_id'] not in cand_id_set:
            candidates.append(cand)
            cand_id_set.add(cand['candidate_id'])

    for sf in sorted(source_facts, key=lambda x: x['source_fact_id']):  # 결정적 정렬
        if sf['source_fact_id'] in dup_sfids:
            continue
        cand = candidate_from_sf(sf, 'unlinked', [])
        if cand['candidate_id'] not in cand_id_set:
            candidates.append(cand)
            cand_id_set.add(cand['candidate_id'])

    # 결정적 정렬 (candidate_id 기준)
    candidates.sort(key=lambda x: x['candidate_id'])

    enrich_path = enrich / 'gyeongju-enriched-candidates-v1.jsonl'
    write_jsonl(enrich_path, candidates)
    enrich_sha = sha256_file(enrich_path)
    print(f'\nEnriched candidates: {len(candidates)}건 → {enrich_path.name} SHA={enrich_sha[:16]}')

    cat_dist = {}
    for c in candidates:
        cat_dist[c.get('category', 'unknown')] = cat_dist.get(c.get('category', 'unknown'), 0) + 1
    print(f'Category 분포: {dict(sorted(cat_dist.items()))}')

    has_coord = sum(1 for c in candidates if c.get('lat') is not None)
    has_img   = sum(1 for c in candidates if c.get('image_url'))
    has_desc  = sum(1 for c in candidates if c.get('description_ko'))
    has_addr  = sum(1 for c in candidates if c.get('address'))
    print(f'좌표: {has_coord}/{len(candidates)}, 이미지: {has_img}, 설명: {has_desc}, 주소: {has_addr}')

    norm_stats = {
        'task': 'TASK-GYEONGJU-HOLD-RESOLUTION-AND-OFFICIAL-API-BOOTSTRAP-V3',
        'phase': 'Phase11_normalization',
        'executed_at': now_iso,
        'source_facts_total': len(source_facts),
        'source_facts_sha256': sf_sha,
        'candidates_total': len(candidates),
        'candidates_sha256': enrich_sha,
        'duplicate_groups': len(dup_groups),
        'secondary_removed': len(dup_sfids),
        'category_distribution': cat_dist,
        'coord_available': has_coord,
        'coord_missing': len(candidates) - has_coord,
        'image_url_available': has_img,
        'description_available': has_desc,
        'address_available': has_addr,
        'kto_counts_by_type': kto_counts,
    }
    out = report / 'gyeongju-normalization-stats.json'
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(norm_stats, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Normalization stats → {out.name}')
    print('Done.')


if __name__ == '__main__':
    main()
