#!/usr/bin/env python3
"""
경주 전체 초기 수집 (Phase 10)
- 경주시 API 5종 (GJ-01,06,07,08,09) 전체 페이지
- 이미지 API (GJ-03,04,05) 전체 페이지 (supplementary)
- KTO KorService2 전 타입
- GJ-02: totalCount=0, skip
- 여행코스(25): city_spots POI 계약 범위 외, 제외

필수 환경변수:
  TOUR_API_KEY   — 공공데이터포털 인증키

사용법:
  TOUR_API_KEY=<key> python gyeongju_full_collect.py [옵션]
  python gyeongju_full_collect.py --help
"""
import argparse, json, os, sys, time, hashlib
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.parse import urlencode
from urllib.error import URLError, HTTPError

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

CALL_INTERVAL = 0.4
TIMEOUT = 30
MAX_RETRIES = 2
ROWS_PER_PAGE = 100
KTO_BASE = 'https://apis.data.go.kr/B551011/KorService2'


def parse_args():
    p = argparse.ArgumentParser(
        description='경주 전체 초기 수집 — 경주시 API + KTO KorService2',
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    p.add_argument('--out-city-raw', default='data/tourapi/raw/gyeongju/gyeongju-city-api',
                   help='경주시 API raw 출력 디렉터리')
    p.add_argument('--out-kto-raw', default='data/tourapi/raw/gyeongju/kto-list',
                   help='KTO KorService2 raw 출력 디렉터리')
    p.add_argument('--out-report', default='data/tourapi/reports/gyeongju',
                   help='수집 요약 리포트 출력 디렉터리')
    return p.parse_args()


def get_api_key() -> str:
    key = os.environ.get('TOUR_API_KEY', '')
    if not key:
        print('[ERROR] TOUR_API_KEY 환경변수가 설정되지 않았습니다', file=sys.stderr)
        sys.exit(1)
    print('credential_values_exposed=false')
    return key


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def write_atomic(path: Path, data: bytes):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix('.tmp')
    tmp.write_bytes(data)
    os.replace(tmp, path)


def call_get(url: str) -> tuple:
    req = Request(url, headers={'User-Agent': 'KoreaMate/1.0'})
    for attempt in range(MAX_RETRIES + 1):
        try:
            with urlopen(req, timeout=TIMEOUT) as resp:
                return resp.read(), None
        except HTTPError as e:
            if attempt == MAX_RETRIES:
                return b'', f'HTTP_{e.code}'
        except URLError as e:
            if attempt == MAX_RETRIES:
                return b'', f'URLError:{str(e)[:50]}'
        except Exception as e:
            if attempt == MAX_RETRIES:
                return b'', f'Err:{str(e)[:50]}'
        time.sleep(0.8)
    return b'', 'max_retries'


def fetch_all_pages(base_url: str, operation: str, extra: dict, api_key: str,
                    label: str, rows: int = ROWS_PER_PAGE) -> tuple:
    items, errors = [], []
    pages_fetched = total_expected = 0
    page = 1
    while True:
        params = {
            'serviceKey': api_key, 'MobileOS': 'ETC', 'MobileApp': 'KoreaMate',
            '_type': 'json', 'numOfRows': str(rows), 'pageNo': str(page),
        }
        params.update(extra)
        url = f"{base_url}/{operation}?{urlencode(params)}"
        raw, err = call_get(url)
        time.sleep(CALL_INTERVAL)
        if err:
            errors.append({'page': page, 'error': err})
            print(f'  [{label}] page {page}: ERROR {err}')
            if page == 1:
                break
            page += 1
            if page > 50:
                break
            continue
        try:
            body = json.loads(raw.decode('utf-8'))['response']['body']
            tc = body.get('totalCount', 0)
            if page == 1:
                total_expected = tc
                print(f'  [{label}] totalCount={tc}')
            items_raw = body.get('items', '')
            if not items_raw or items_raw == '':
                break
            il = items_raw.get('item', [])
            if isinstance(il, dict):
                il = [il]
            items.extend(il)
            pages_fetched += 1
            if len(items) >= tc or not il:
                break
            page += 1
        except Exception as e:
            errors.append({'page': page, 'error': str(e)[:80]})
            print(f'  [{label}] page {page}: parse error {e}')
            break
    return items, total_expected, pages_fetched, errors


def main():
    args = parse_args()
    api_key = get_api_key()
    raw_city = Path(args.out_city_raw)
    raw_kto  = Path(args.out_kto_raw)
    report   = Path(args.out_report)
    import time as _t
    now_iso = _t.strftime('%Y-%m-%dT%H:%M:%SZ', _t.gmtime())

    stats = {}

    # GJ-01
    print('\n=== GJ-01 관광지 현황 ===')
    items, total, pages, errs = fetch_all_pages(
        'https://apis.data.go.kr/5050000/touristDestinationService',
        'getTouristDestination', {}, api_key, 'GJ-01')
    p = raw_city / 'GJ-01-tourist-destination-full.json'
    data = {'totalCount': total, 'collected': len(items), 'pages': pages, 'errors': errs, 'items': items}
    write_atomic(p, json.dumps(data, ensure_ascii=False, indent=2, sort_keys=False).encode('utf-8'))
    stats['GJ-01'] = {'total': total, 'collected': len(items), 'sha256': sha256_bytes(p.read_bytes()), 'errors': len(errs)}
    print(f'  Saved {len(items)}/{total}')

    # GJ-06
    print('\n=== GJ-06 야경 정보 ===')
    items, total, pages, errs = fetch_all_pages(
        'https://apis.data.go.kr/5050000/theNightViewService',
        'getTheNightView', {}, api_key, 'GJ-06')
    p = raw_city / 'GJ-06-night-view-full.json'
    write_atomic(p, json.dumps({'totalCount': total, 'collected': len(items), 'errors': errs, 'items': items},
                               ensure_ascii=False, indent=2).encode('utf-8'))
    stats['GJ-06'] = {'total': total, 'collected': len(items), 'sha256': sha256_bytes(p.read_bytes())}
    print(f'  Saved {len(items)}/{total}')

    # GJ-07
    print('\n=== GJ-07 전망포인트 ===')
    items, total, pages, errs = fetch_all_pages(
        'https://apis.data.go.kr/5050000/observationPointService',
        'getObservationPoint', {}, api_key, 'GJ-07')
    p = raw_city / 'GJ-07-observation-point-full.json'
    write_atomic(p, json.dumps({'totalCount': total, 'collected': len(items), 'errors': errs, 'items': items},
                               ensure_ascii=False, indent=2).encode('utf-8'))
    stats['GJ-07'] = {'total': total, 'collected': len(items), 'sha256': sha256_bytes(p.read_bytes())}
    print(f'  Saved {len(items)}/{total}')

    # GJ-08
    print('\n=== GJ-08 메뉴별 음식점 ===')
    items, total, pages, errs = fetch_all_pages(
        'https://apis.data.go.kr/5050000/menuRstrtService',
        'getMenuRstrt', {}, api_key, 'GJ-08')
    p = raw_city / 'GJ-08-menu-restaurant-full.json'
    write_atomic(p, json.dumps({'totalCount': total, 'collected': len(items), 'errors': errs, 'items': items},
                               ensure_ascii=False, indent=2).encode('utf-8'))
    stats['GJ-08'] = {'total': total, 'collected': len(items), 'sha256': sha256_bytes(p.read_bytes())}
    print(f'  Saved {len(items)}/{total}')

    # GJ-09
    print('\n=== GJ-09 먹거리 핫플레이스 ===')
    items, total, pages, errs = fetch_all_pages(
        'https://apis.data.go.kr/5050000/eatHtpService',
        'getEatHtp', {}, api_key, 'GJ-09')
    p = raw_city / 'GJ-09-eat-hotplace-full.json'
    write_atomic(p, json.dumps({'totalCount': total, 'collected': len(items), 'errors': errs, 'items': items},
                               ensure_ascii=False, indent=2).encode('utf-8'))
    stats['GJ-09'] = {'total': total, 'collected': len(items), 'sha256': sha256_bytes(p.read_bytes())}
    print(f'  Saved {len(items)}/{total}')

    # 이미지 API (supplementary)
    print('\n=== 이미지 API (supplementary) ===')
    img_apis = [
        ('GJ-03', 'https://apis.data.go.kr/5050000/dwtwTrrstrService', 'getDwtwTrrstr', '시내권'),
        ('GJ-04', 'https://apis.data.go.kr/5050000/bomunTrrsrtService', 'getBomunTrrsrt', '보문권'),
        ('GJ-05', 'https://apis.data.go.kr/5050000/namsanTrrsrtService', 'getNamsanTrrsrt', '남산권'),
    ]
    for api_id, base, op, zone in img_apis:
        items, total, pages, errs = fetch_all_pages(base, op, {}, api_key, f'{api_id}-{zone}')
        p = raw_city / f'{api_id}-image-{zone}-full.json'
        write_atomic(p, json.dumps({'totalCount': total, 'collected': len(items), 'errors': errs, 'items': items,
                                    'note': 'IMAGE_SUPPLEMENTARY — 독립 candidate 생성 안 함. 장소 연결용.'},
                                   ensure_ascii=False, indent=2).encode('utf-8'))
        stats[api_id] = {'total': total, 'collected': len(items), 'sha256': sha256_bytes(p.read_bytes()),
                          'type': 'IMAGE_SUPPLEMENTARY'}
        print(f'  {api_id} {zone}: {len(items)}/{total}')

    # KTO KorService2
    print('\n=== KTO KorService2 ===')
    KTO_TYPES = {
        '12': 'tourist-spot', '14': 'cultural-facility', '15': 'festival-event',
        '28': 'leisure-sport', '32': 'accommodation', '38': 'shopping', '39': 'restaurant',
    }
    kto_collection = {}
    for ctype, cname in KTO_TYPES.items():
        items, total, pages, errs = fetch_all_pages(
            KTO_BASE, 'areaBasedSyncList2',
            {'areaCode': '35', 'sigunguCode': '2', 'contentTypeId': ctype, 'arrange': 'A'},
            api_key, f'KTO-{ctype}')
        p = raw_kto / f'kto-type{ctype}-{cname}-full.json'
        write_atomic(p, json.dumps({'contentTypeId': ctype, 'contentTypeName': cname,
                                    'totalCount': total, 'collected': len(items), 'errors': errs, 'items': items},
                                   ensure_ascii=False, indent=2).encode('utf-8'))
        kto_collection[ctype] = {'name': cname, 'total': total, 'collected': len(items),
                                  'sha256': sha256_bytes(p.read_bytes()), 'errors': len(errs)}
        print(f'  type={ctype}: {len(items)}/{total}')

    # 수집 요약 저장
    gj_primary = sum(stats.get(k, {}).get('collected', 0) for k in ['GJ-01','GJ-06','GJ-07','GJ-08','GJ-09'])
    img_total = sum(stats.get(k, {}).get('collected', 0) for k in ['GJ-03','GJ-04','GJ-05'])
    kto_total = sum(v['collected'] for v in kto_collection.values())
    summary = {
        'task': 'TASK-GYEONGJU-HOLD-RESOLUTION-AND-OFFICIAL-API-BOOTSTRAP-V3',
        'phase': 'Phase10_full_collection',
        'collected_at': now_iso,
        'credential_values_exposed': False,
        'gyeongju_city_api_primary': {
            **{k: stats.get(k) for k in ['GJ-01','GJ-06','GJ-07','GJ-08','GJ-09']},
            'total_collected': gj_primary,
        },
        'gyeongju_city_api_image_supplementary': {
            **{k: stats.get(k) for k in ['GJ-03','GJ-04','GJ-05']},
            'total_image_records': img_total,
            'note': '설계 결정 A: 독립 candidate 생성 안 함',
        },
        'kto_korservice2': {
            'area_code': '35', 'sigungu_code': '2',
            'excluded_types': {
                '25': {
                    'content_type_id': 25, 'name': '여행코스',
                    'status': 'DOCUMENTED_EXCLUSION',
                    'reason': '단일 장소가 아닌 코스 단위로 city_spots POI 계약 범위 외',
                }
            },
            'types': kto_collection,
            'total_collected': kto_total,
        },
        'engservice2': {'status': 'MISSING_SOURCE', 'total_count': 0,
                        'note': 'areaCode=35, sigunguCode=2 기준 0건'},
        'gj02_status': 'SKIP — getDstrctsTrrsrt totalCount=0, 추가 파라미터 필요',
        'grand_total_primary': gj_primary + kto_total,
    }
    out = report / 'gyeongju-collection-summary.json'
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'\n수집 완료: 경주시 {gj_primary}건 + KTO {kto_total}건 = {gj_primary+kto_total}건')
    print(f'Summary: {out}')


if __name__ == '__main__':
    main()
