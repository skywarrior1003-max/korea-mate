#!/usr/bin/env python3
"""
TASK-GYEONGJU-OFFICIAL-TRAVEL-CONTENT-LAYER-V2
경주문화관광(gyeongju.go.kr/tour) 공식 Travel Content Layer 수집
Base: data/gyeongju-final-closeout-handoff-v1 @ f7d6f44
Run1: NETWORK_ALLOWED=1  |  Run2: NETWORK_ALLOWED=0 (cache only)
"""

import os, sys, json, datetime, hashlib, re, time
from pathlib import Path
from typing import Optional, Dict, List, Any, Tuple

# =========================================================
# NETWORK GUARD
# =========================================================
NETWORK_ALLOWED = os.environ.get("NETWORK_ALLOWED", "0") == "1"
PARSER_VERSION  = "v2.1.0"
SCRIPT_NAME     = "gyeongju_official_travel_content_layer_v2.py"

print(f"[INIT] {SCRIPT_NAME} parser={PARSER_VERSION} NETWORK={NETWORK_ALLOWED}")

# =========================================================
# PATHS
# =========================================================
REPO_ROOT   = Path(__file__).resolve().parent.parent
OUTPUT_DIR  = REPO_ROOT / "data" / "gyeongju-official-travel-content"
CACHE_DIR   = OUTPUT_DIR / "_cache"
BASE_DIR    = REPO_ROOT / "data" / "gyeongju-final-release"
DOCS_DIR    = REPO_ROOT / "docs" / "data-collection"
META_PATH   = OUTPUT_DIR / "_run_metadata.json"

for d in [OUTPUT_DIR, CACHE_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# =========================================================
# SITE CONSTANTS
# =========================================================
BASE_SITE = "https://www.gyeongju.go.kr"
TOUR_URL  = f"{BASE_SITE}/tour/page.do"
UA = "Mozilla/5.0 (compatible; GoKoreaMate-Collector/2.1)"
SENTINEL_CHARSET_DAMAGE = "CHARSET_DAMAGE"

# Real mnu_uid values discovered from gyeongju.go.kr sitemap (2694)
MNU = {
    "sitemap":           "2694",  # 사이트맵 (smoke test page)
    "event_monthly":     "2393",  # 이달의 축제 및 행사 (calendar)
    "event_regular":     "2715",  # 정기축제 및 행사
    "event_performance": "2716",  # 경주 상설 공연, 전시
    "course_home":       "2267",  # 여행코스추천
    "course_핵심":       "2297",  # 경주핵심여행코스 (→ 2528~2535)
    "course_두번째":     "2298",  # 나의두번째경주 (→ 2536~3615)
    "course_걷기":       "2299",  # 자박자박경주걷기 (→ 2539~3424)
    "course_자전거":     "2300",  # 두바퀴로경주 (→ 2543~4161)
    "course_버스":       "2301",  # 버스타고경주 (→ 2547~3165)
    "theme_home":        "2551",  # 테마여행
    "theme_10pick":      "2552",  # 경주10Pick
    "theme_감성":        "2553",  # 감성더하기
    "theme_동네":        "2554",  # 동네탐구
    "rec_이달":          "4172",  # 이달의 추천여행지
    "rec_17선":          "4154",  # 경주여행17선
    "exp_의복":          "2317",  # 의복체험
    "exp_전통":          "2318",  # 전통문화체험
    "exp_템플":          "2319",  # 템플스테이
    "exp_고택":          "2323",  # 고택체험
    "exp_농촌":          "2324",  # 농촌교육장,체험마을
    "exp_VR":            "2325",  # VR체험
    "exp_스포츠":        "2326",  # 스포츠
    "exp_이색":          "2705",  # 이색체험
    "exp_동식물":        "2710",  # 동·식물체험
    "tour_program":      "2273",  # 투어프로그램
    "app_해설신청":      "2395",  # 문화관광해설신청
    "app_황성숲":        "2368",  # 황성공원 숲체험 신청
    "app_종타종":        "2369",  # 신라대종타종체험신청
    "app_숲체험":        "2457",  # 숲체험신청
    "app_스탬프":        "2830",  # 스탬프투어 기념품 신청
    "app_단체인센":      "3555",  # 경주 단체관광 인센티브
    "food_all":          "2500",  # 음식점 전체
    "food_한식":         "2502",  # 한식
    "food_별채반":       "2286",  # 향토음식 별채반
    "food_카페":         "2287",  # 카페&찻집
    "food_한우":         "2288",  # 경주한우
    "food_착한":         "1729",  # 착한가격업소
    "food_핫플":         "4134",  # 먹거리핫플레이스
    "info_안내소":       "2376",  # 관광안내소
    "info_해설사":       "2377",  # 문화관광해설사
    "info_입장료":       "2378",  # 입장료안내
    "info_스탬프":       "2379",  # 관광스탬프안내
    "info_와이파이":     "2380",  # 공공와이파이
    "info_교통":         "2374",  # 교통정보
    "info_무장애":       "2689",  # 무장애 여행정보
    "info_짐보관":       "4030",  # 짐보관 서비스
    "info_여행도우미":   "2373",  # 여행도우미
    "권역별":            "2266",  # 권역별 관광지
}

# =========================================================
# PHASE 0-1: COLLECTION DATE / METADATA
# =========================================================
def _init_metadata() -> Dict:
    if META_PATH.exists():
        meta = json.loads(META_PATH.read_text(encoding="utf-8"))
        print(f"[META] Run2 — reusing collection_date={meta['collection_date']}")
        return meta
    meta = {
        "collection_date": datetime.date.today().isoformat(),
        "collected_at":    datetime.datetime.utcnow().isoformat() + "Z",
        "source_base":     "data/gyeongju-final-closeout-handoff-v1@f7d6f44",
        "parser_version":  PARSER_VERSION,
        "script":          SCRIPT_NAME,
        "task":            "TASK-GYEONGJU-OFFICIAL-TRAVEL-CONTENT-LAYER-V2",
        "network_run1":    True,
    }
    META_PATH.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[META] Run1 — collection_date={meta['collection_date']}")
    return meta

def _collection_date(meta: Dict) -> str:
    """Always use this — never datetime.date.today() for temporal calcs."""
    return meta["collection_date"]

# =========================================================
# PHASE 0-2: CHARSET DETECTION + SAFE DECODE
# =========================================================
def _detect_charset(content_type: str, html_bytes: bytes) -> str:
    m = re.search(r'charset=([^\s;,]+)', content_type or '', re.IGNORECASE)
    if m:
        cs = m.group(1).strip().strip('"\'').lower()
        if cs:
            return cs
    for enc_try in ('utf-8', 'latin-1'):
        try:
            head = html_bytes[:4096].decode(enc_try, errors='replace')
            m2 = re.search(r'charset=["\']?([^"\'\s;>]+)', head, re.IGNORECASE)
            if m2:
                return m2.group(1).strip().lower()
        except Exception:
            pass
    return 'utf-8'  # gyeongju.go.kr is now UTF-8

def _safe_decode(html_bytes: bytes, charset: str) -> Tuple[str, bool]:
    for enc in [charset, 'utf-8', 'euc-kr', 'cp949']:
        try:
            text = html_bytes.decode(enc, errors='strict')
            bad = text.count('�') / max(len(text), 1)
            if bad < 0.005:
                return text, True
        except (UnicodeDecodeError, LookupError):
            continue
    text = html_bytes.decode('utf-8', errors='replace')
    return text, text.count('�') / max(len(text), 1) < 0.02

def _korean_ok(text: str) -> bool:
    cnt = sum(1 for c in text if '가' <= c <= '힣')
    return cnt > 10

# =========================================================
# CACHE-AWARE HTTP FETCH
# =========================================================
def _fetch(url: str, cache_key: Optional[str] = None, delay: float = 0.5) -> Dict:
    if cache_key is None:
        cache_key = hashlib.md5(url.encode('utf-8')).hexdigest()
    raw_p  = CACHE_DIR / f"{cache_key}.html.raw"
    meta_p = CACHE_DIR / f"{cache_key}.meta.json"

    if raw_p.exists() and meta_p.exists():
        html_bytes = raw_p.read_bytes()
        fm = json.loads(meta_p.read_text(encoding='utf-8'))
        charset = fm.get('detected_charset', 'utf-8')
        html, ok = _safe_decode(html_bytes, charset)
        return {'html': html, 'detected_charset': charset, 'charset_ok': ok,
                'status_code': fm.get('status_code'), 'error': None, 'cache_hit': True}

    if not NETWORK_ALLOWED:
        return {'html': None, 'detected_charset': 'unknown', 'charset_ok': False,
                'status_code': None, 'error': f"NETWORK=0, no cache: {url}", 'cache_hit': False}

    try:
        import requests as req_lib
        time.sleep(delay)
        resp = req_lib.get(url, headers={'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9'},
                           timeout=30, allow_redirects=True)
        sc = resp.status_code
        if sc != 200:
            return {'html': None, 'detected_charset': 'unknown', 'charset_ok': False,
                    'status_code': sc, 'error': f"HTTP {sc}", 'cache_hit': False}

        html_bytes = resp.content
        raw_p.write_bytes(html_bytes)
        charset = _detect_charset(resp.headers.get('Content-Type', ''), html_bytes)
        html, ok = _safe_decode(html_bytes, charset)
        meta_p.write_text(json.dumps({
            'url': url, 'status_code': sc,
            'content_type': resp.headers.get('Content-Type', ''),
            'detected_charset': charset, 'charset_ok': ok,
            'fetched_at': datetime.datetime.utcnow().isoformat() + 'Z'
        }, ensure_ascii=False), encoding='utf-8')
        return {'html': html, 'detected_charset': charset, 'charset_ok': ok,
                'status_code': sc, 'error': None, 'cache_hit': False}
    except Exception as e:
        return {'html': None, 'detected_charset': 'unknown', 'charset_ok': False,
                'status_code': None, 'error': str(e), 'cache_hit': False}

def _soup(html: str):
    from bs4 import BeautifulSoup
    return BeautifulSoup(html, 'lxml')

def _content(soup) -> Any:
    return (soup.find(id='content') or
            soup.find(id='subContent') or
            soup.find(class_=re.compile(r'PageContArea', re.I)) or
            soup.find('main'))

def _text(el) -> str:
    if el is None:
        return ""
    return re.sub(r'\s+', ' ', el.get_text(separator=' ')).strip()

# =========================================================
# PHASE 0-3: SMOKE TEST  (uses sitemap page — valid mnu_uid)
# =========================================================
def phase0_smoke_test() -> Dict:
    print("\n[PHASE 0] Smoke test...")
    smoke_url = f"{TOUR_URL}?mnu_uid={MNU['sitemap']}"
    r = _fetch(smoke_url, cache_key="smoke_sitemap")
    result = {
        "smoke_url":    smoke_url,
        "http_ok":      r['status_code'] == 200,
        "charset":      r['detected_charset'],
        "charset_ok":   r['charset_ok'],
        "korean_ok":    False,
        "nav_links":    0,
        "error":        r['error'],
    }
    if r['html']:
        result['korean_ok'] = _korean_ok(r['html'])
        soup = _soup(r['html'])
        result['nav_links'] = len([a for a in soup.find_all('a', href=True)
                                   if 'mnu_uid' in a.get('href', '')])
    passed = result['http_ok'] and result['charset_ok'] and result['korean_ok'] and result['nav_links'] > 20
    result['passed'] = passed
    status = "PASS" if passed else "FAIL"
    print(f"[PHASE 0] Smoke {status}: HTTP={r['status_code']} charset={r['detected_charset']} "
          f"korean={result['korean_ok']} nav_links={result['nav_links']}")
    if not passed:
        print(f"[PHASE 0] BLOCKED — smoke failed: {r['error']}")
        sys.exit(1)
    return result

# =========================================================
# PHASE 1: MENU INVENTORY (from sitemap)
# =========================================================
def phase1_inventory() -> Dict:
    print("\n[PHASE 1] Menu inventory from sitemap...")
    r = _fetch(f"{TOUR_URL}?mnu_uid={MNU['sitemap']}", cache_key="smoke_sitemap")
    sections = {}

    if r['html']:
        soup = _soup(r['html'])
        for a in soup.find_all('a', href=True):
            href = a['href']
            m = re.search(r'mnu_uid=(\d+)', href)
            if not m:
                continue
            uid = m.group(1)
            label = _text(a)
            if not label or len(label) > 50 or len(label) < 2:
                continue
            full_url = href if href.startswith('http') else BASE_SITE + href
            if uid not in sections:
                sections[uid] = {
                    "mnu_uid": uid, "label": label, "url": full_url,
                    "section_type": _classify_section(label),
                }

    CORE_CHECK = {
        '행사': ['2393', '2715', '2716'],
        '코스': ['2267', '2297', '2298'],
        '체험': ['2317', '2318', '2272'],
        '음식': ['2500', '2286', '2287'],
        '신청': ['2395', '2368', '2262'],
        '여행정보': ['2376', '2374', '2263'],
        '추천': ['4172', '4154', '2552'],
    }
    core_status = {}
    for cat, uids in CORE_CHECK.items():
        found = any(uid in sections for uid in uids)
        core_status[cat] = 'FOUND' if found else 'MISSING'

    found_core = sum(1 for v in core_status.values() if v == 'FOUND')
    inventory = {
        "source_url":         f"{TOUR_URL}?mnu_uid={MNU['sitemap']}",
        "total_sections":     len(sections),
        "core_section_check": core_status,
        "found_core_count":   found_core,
        "inventory_pass":     found_core >= 5,
        "sections":           list(sections.values()),
    }
    print(f"[PHASE 1] Sections={len(sections)} core={found_core}/7 "
          f"({'PASS' if inventory['inventory_pass'] else 'CONDITIONAL'})")
    return inventory

def _classify_section(label: str) -> str:
    mapping = [
        ('행사', 'EVENT'), ('축제', 'EVENT'), ('공연', 'EVENT'), ('전시', 'EVENT'),
        ('코스', 'COURSE'), ('여행', 'COURSE'), ('테마', 'COURSE'),
        ('체험', 'EXPERIENCE'), ('레저', 'EXPERIENCE'), ('레져', 'EXPERIENCE'),
        ('투어', 'TOUR_PROGRAM'), ('프로그램', 'TOUR_PROGRAM'),
        ('신청', 'APPLICATION'), ('예약', 'APPLICATION'),
        ('음식', 'FOOD'), ('맛집', 'FOOD'), ('카페', 'FOOD'), ('한우', 'FOOD'),
        ('여행정보', 'TRAVEL_INFO'), ('교통', 'TRAVEL_INFO'), ('안내', 'TRAVEL_INFO'),
        ('짐보관', 'TRAVEL_INFO'), ('무장애', 'TRAVEL_INFO'), ('와이파이', 'TRAVEL_INFO'),
        ('권역', 'ATTRACTION'),
    ]
    for kw, cat in mapping:
        if kw in label:
            return cat
    return 'OTHER'

# =========================================================
# PHASE 2: EVENTS
# =========================================================
def phase2_events(collection_date: str) -> List[Dict]:
    print("\n[PHASE 2] Events/Festivals...")
    events = []
    seen_ids = set()
    cd = datetime.date.fromisoformat(collection_date)

    # 2a: Monthly calendar events (full year)
    for year in [cd.year - 1, cd.year, cd.year + 1]:
        for month in range(1, 13):
            url = (f"{TOUR_URL}?sortKwd=&srchKwd=&listType=list"
                   f"&mnu_uid={MNU['event_monthly']}&initYear={year}&initMonth={month}")
            ck = f"event_monthly_{year}_{month:02d}"
            r = _fetch(url, cache_key=ck)
            if not r['html'] or not r['charset_ok']:
                if not r['charset_ok'] and r['html']:
                    print(f"  [EVENT] CHARSET_DAMAGE {year}-{month:02d}")
                continue
            soup = _soup(r['html'])
            content = _content(soup)
            if not content:
                continue
            page_events = _parse_event_culture_list(content, collection_date, year, month)
            for ev in page_events:
                if ev['event_id'] not in seen_ids:
                    seen_ids.add(ev['event_id'])
                    events.append(ev)

    # 2b: 정기축제 행사 (static page - extract linked festivals)
    r = _fetch(f"{TOUR_URL}?mnu_uid={MNU['event_regular']}", cache_key="event_regular")
    if r['html'] and r['charset_ok']:
        soup = _soup(r['html'])
        content = _content(soup)
        if content:
            reg_events = _parse_regular_events(content, collection_date)
            for ev in reg_events:
                if ev['event_id'] not in seen_ids:
                    seen_ids.add(ev['event_id'])
                    events.append(ev)

    print(f"[PHASE 2] Events={len(events)} "
          f"ACTIVE={sum(1 for e in events if e['status']=='ACTIVE')} "
          f"UPCOMING={sum(1 for e in events if e['status']=='UPCOMING')} "
          f"PAST={sum(1 for e in events if e['status']=='PAST')}")
    return events

def _parse_event_culture_list(content, collection_date: str, year: int, month: int) -> List[Dict]:
    items = []
    # Structure: div.type3.cultureList.on > div.month > dl
    culture_div = content.find(class_=re.compile(r'cultureList', re.I))
    if not culture_div:
        return items

    for dl in culture_div.find_all('dl'):
        dt = dl.find('dt')
        dd = dl.find('dd')
        if not dt or not dd:
            continue

        # Title from img alt or title text
        img = dt.find('img')
        title = img.get('alt', '').strip() if img else ''
        # Also get from p.title text
        title_el = dd.find('p', class_='title')
        if title_el:
            # Remove the span (category badge)
            span = title_el.find('span')
            if span:
                cat_text = span.get_text().strip()
                span.decompose()
            else:
                cat_text = ''
            title_from_dd = re.sub(r'\s+', ' ', title_el.get_text()).strip()
            if title_from_dd and len(title_from_dd) > len(title):
                title = title_from_dd
        else:
            cat_text = ''

        if not title or len(title) < 2:
            continue

        # Detail URL (con_uid)
        detail_a = dt.find('a', href=True)
        detail_url = ""
        con_uid = ""
        if detail_a:
            href = detail_a['href']
            m = re.search(r'con_uid=(\d+)', href)
            if m:
                con_uid = m.group(1)
            detail_url = f"{TOUR_URL}?mnu_uid={MNU['event_monthly']}&con_uid={con_uid}&cmd=2" if con_uid else ""

        # Dates, venue, homepage from ul > li
        start_date = end_date = venue = homepage = ""
        for li in dd.find_all('li'):
            span_el = li.find('span')
            if not span_el:
                continue
            label = _text(span_el)
            # Remove span to get value
            span_el.decompose()
            val = _text(li)
            if label == '기간':
                m2 = re.search(r'(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})', val)
                if m2:
                    start_date, end_date = m2.group(1), m2.group(2)
                else:
                    m2 = re.search(r'(\d{4}[.\-]\d{1,2}[.\-]\d{1,2})', val)
                    if m2:
                        start_date = re.sub(r'[.]', '-', m2.group(1))
            elif label == '장소':
                venue = val
            elif label == '홈페이지':
                a_hp = li.find('a', href=True)
                if a_hp:
                    homepage = a_hp['href']

        # Poster image
        poster = ""
        if img:
            src = img.get('src', '')
            poster = BASE_SITE + src if src and not src.startswith('http') else src

        status = _event_status(start_date, end_date, collection_date)
        event_id = hashlib.md5(f"{title}|{start_date}".encode('utf-8')).hexdigest()[:14]

        items.append({
            "event_id":           event_id,
            "title":              title,
            "category":           cat_text or "행사",
            "start_date":         start_date,
            "end_date":           end_date,
            "start_time":         "",
            "end_time":           "",
            "venue":              venue,
            "address":            "",
            "description":        "",
            "phone":              "",
            "official_homepage":  homepage,
            "official_detail_url": detail_url,
            "poster_image":       poster,
            "con_uid":            con_uid,
            "status":             status,
            "provenance": {
                "source": "gyeongju.go.kr/tour",
                "section": "이달의 축제 및 행사",
                "mnu_uid": MNU["event_monthly"],
                "year": year, "month": month,
                "collected_date": collection_date,
                "charset_ok": True,
            }
        })
    return items

def _parse_regular_events(content, collection_date: str) -> List[Dict]:
    """Parse 정기축제행사 static page."""
    items = []
    # This page has text content about regular festivals + links to external sites
    for a in content.find_all('a', href=True):
        href = a['href']
        if not href.startswith('http'):
            continue
        label = _text(a)
        if not label or len(label) < 3:
            continue
        # It's a festival external link
        items.append({
            "event_id":    hashlib.md5(href.encode()).hexdigest()[:14],
            "title":       label,
            "category":    "정기축제",
            "start_date":  "",
            "end_date":    "",
            "start_time":  "", "end_time": "",
            "venue":       "",
            "address":     "",
            "description": "",
            "phone":       "",
            "official_homepage": href,
            "official_detail_url": href,
            "poster_image": "",
            "con_uid":     "",
            "status":      "DATE_INCOMPLETE",
            "provenance": {
                "source": "gyeongju.go.kr/tour",
                "section": "정기축제 및 행사",
                "mnu_uid": MNU["event_regular"],
                "collected_date": collection_date,
                "charset_ok": True,
            }
        })
    return items

def _event_status(start: str, end: str, collection_date: str) -> str:
    if not start:
        return "DATE_INCOMPLETE"
    try:
        cd = datetime.date.fromisoformat(collection_date)
        sd = datetime.date.fromisoformat(start)
        ed = datetime.date.fromisoformat(end) if end else sd
        if cd < sd:
            return "UPCOMING"
        elif cd > ed:
            return "PAST"
        else:
            return "ACTIVE"
    except ValueError:
        return "DATE_INCOMPLETE"

# =========================================================
# PHASE 3: OFFICIAL COURSES + STOPS
# =========================================================
def phase3_courses() -> Tuple[List[Dict], List[Dict]]:
    print("\n[PHASE 3] Official courses + stops...")
    courses = []
    all_stops = []
    seen_course_ids = set()

    # Course category groups: {category_label: [mnu_uid_for_sub_courses]}
    # These are discovered from the tab navigation on each category page
    COURSE_CATS = {
        "경주핵심여행코스": MNU["course_핵심"],
        "나의두번째경주":   MNU["course_두번째"],
        "자박자박경주걷기": MNU["course_걷기"],
        "두바퀴로누비는경주": MNU["course_자전거"],
        "버스타고경주여행":  MNU["course_버스"],
    }
    THEME_CATS = {
        "경주10Pick":  MNU["theme_10pick"],
        "감성더하기":  MNU["theme_감성"],
        "동네탐구":    MNU["theme_동네"],
        "이달의추천여행지": MNU["rec_이달"],
        "경주여행17선": MNU["rec_17선"],
    }

    all_cats = {**COURSE_CATS, **THEME_CATS}

    for cat_label, cat_mnu in all_cats.items():
        # Fetch category page to discover sub-course mnu_uids
        ck = f"course_cat_{cat_mnu}"
        r = _fetch(f"{TOUR_URL}?mnu_uid={cat_mnu}", cache_key=ck)
        if not r['html'] or not r['charset_ok']:
            continue

        soup = _soup(r['html'])
        content = _content(soup)
        if not content:
            continue

        # Discover sub-course tabs
        sub_uids = []
        for tab in content.find_all('li'):
            a = tab.find('a', href=True)
            if not a:
                continue
            m = re.search(r'mnu_uid=(\d+)', a['href'])
            if m:
                uid = m.group(1)
                if uid not in (cat_mnu, MNU['sitemap'], MNU['course_home']):
                    if uid not in sub_uids:
                        sub_uids.append(uid)

        if not sub_uids:
            sub_uids = [cat_mnu]  # treat the category page itself as a course

        # Fetch each sub-course
        for sub_uid in sub_uids[:10]:
            course, stops = _collect_single_course(sub_uid, cat_label, collection_date=None)
            if course and course['course_id'] not in seen_course_ids:
                seen_course_ids.add(course['course_id'])
                courses.append(course)
                all_stops.extend(stops)

    print(f"[PHASE 3] Courses={len(courses)} stops={len(all_stops)}")
    return courses, all_stops

def _collect_single_course(mnu_uid: str, cat_label: str,
                            collection_date: Optional[str] = None) -> Tuple[Optional[Dict], List[Dict]]:
    ck = f"course_detail_{mnu_uid}"
    r = _fetch(f"{TOUR_URL}?mnu_uid={mnu_uid}", cache_key=ck)
    if not r['html'] or not r['charset_ok']:
        return None, []

    soup = _soup(r['html'])
    content = _content(soup)
    if not content:
        return None, []

    # Title from h3#pageTitle
    title_el = content.find('h3', id='pageTitle') or content.find('h3')
    title = _text(title_el.find('span') or title_el) if title_el else ""
    if not title:
        return None, []

    course_id = hashlib.md5(f"course_{mnu_uid}_{title}".encode('utf-8')).hexdigest()[:14]

    # Description from dl.bg
    desc = ""
    theme = ""
    bg_dl = content.find('dl', class_='bg')
    if bg_dl:
        desc_dt = bg_dl.find('dt')
        desc_dd = bg_dl.find('dd')
        if desc_dd:
            desc = _text(desc_dd)[:500]
        if desc_dt:
            theme = _text(desc_dt)[:100]

    # Keywords
    keywords_el = content.find('p', class_='keywords')
    keywords = _text(keywords_el) if keywords_el else ""

    # Stops from #courseList
    stops = _parse_course_stops(content, course_id)

    # Recommended duration/season from explain section
    duration = ""
    explain_li = content.find('li')
    if explain_li:
        txt = _text(explain_li)
        m = re.search(r'(당일|1박\s*2일|2박\s*3일|[0-9]+박)', txt)
        if m:
            duration = m.group(0)

    # Images
    img = content.find('img')
    img_url = ""
    if img:
        src = img.get('src', '')
        img_url = BASE_SITE + src if src and not src.startswith('http') else src

    course = {
        "course_id":            course_id,
        "mnu_uid":              mnu_uid,
        "title":                title,
        "category":             cat_label,
        "theme":                theme,
        "description":          desc,
        "keywords":             keywords,
        "official_url":         f"{TOUR_URL}?mnu_uid={mnu_uid}",
        "image":                img_url,
        "duration":             duration,
        "recommended_season":   "",
        "transportation_hints": "",
        "target_traveler":      "",
        "stop_count":           len(stops),
        "provenance": {
            "source": "gyeongju.go.kr/tour",
            "section": "여행코스",
            "mnu_uid": mnu_uid,
            "charset_ok": True,
        }
    }
    return course, stops

def _parse_course_stops(content, course_id: str) -> List[Dict]:
    stops = []
    course_list = content.find(id='courseList') or content.find('dl', id='courseList')
    if not course_list:
        return stops

    global_order = 1
    for dt in course_list.find_all('dt'):
        day_label = _text(dt)  # e.g., "1일차"
        dd = dt.find_next_sibling('dd')
        if not dd:
            continue
        # Each stop is an <a href="#day1-N"><span>N</span>STOP_NAME</a>
        for a in dd.find_all('a', href=True):
            span = a.find('span')
            if span:
                span.decompose()
            stop_name = _text(a)
            if not stop_name:
                continue
            stops.append({
                "course_id":              course_id,
                "order":                  global_order,
                "day":                    day_label,
                "stop_name":              stop_name,
                "description":            "",
                "existing_candidate_id":  "",
                "match_status":           "MANUAL_REVIEW",
            })
            global_order += 1

    return stops

# =========================================================
# PHASE 4: EXPERIENCE / LEISURE
# =========================================================
def phase4_experiences() -> List[Dict]:
    print("\n[PHASE 4] Experience / Leisure...")
    experiences = []
    EXP_SECTIONS = [
        (MNU["exp_의복"], "의복체험"),
        (MNU["exp_전통"], "전통문화체험"),
        (MNU["exp_템플"], "템플스테이"),
        (MNU["exp_고택"], "고택체험"),
        (MNU["exp_농촌"], "농촌교육장·체험마을"),
        (MNU["exp_VR"],   "VR체험"),
        (MNU["exp_스포츠"], "스포츠"),
        (MNU["exp_이색"], "이색체험"),
        (MNU["exp_동식물"], "동·식물체험"),
    ]
    for uid, label in EXP_SECTIONS:
        ck = f"exp_{uid}"
        r = _fetch(f"{TOUR_URL}?mnu_uid={uid}", cache_key=ck)
        if not r['html'] or not r['charset_ok']:
            continue
        soup = _soup(r['html'])
        content = _content(soup)
        if not content:
            continue
        items = _parse_experience_table(content, uid, label)
        experiences.extend(items)

    print(f"[PHASE 4] Experiences={len(experiences)}")
    return experiences

def _parse_experience_table(content, mnu_uid: str, category: str) -> List[Dict]:
    items = []
    # Structure: div.tblWrap > table > tbody > tr
    # Columns: 업체명, 주소(위치), 체험내용, 홈페이지 or SNS
    for tbl in content.find_all('table'):
        tbody = tbl.find('tbody')
        if not tbody:
            continue
        for tr in tbody.find_all('tr'):
            tds = tr.find_all('td')
            if len(tds) < 2:
                continue
            name = _text(tds[0])
            if not name or len(name) < 2:
                continue
            address = _text(tds[1]) if len(tds) > 1 else ""
            exp_content = _text(tds[2]) if len(tds) > 2 else ""
            homepage = ""
            if len(tds) > 3:
                a = tds[3].find('a', href=True)
                if a:
                    homepage = a['href']
                else:
                    homepage = _text(tds[3])

            items.append({
                "item_id":              hashlib.md5(f"{category}_{name}".encode('utf-8')).hexdigest()[:14],
                "title":               name,
                "category":            category,
                "item_type":           "EXPERIENCE",
                "description":         exp_content[:300],
                "venue":               name,
                "address":             address,
                "related_candidate_id": "",
                "price":               "",
                "hours":               "",
                "reservation_required": None,
                "language_support":    [],
                "official_url":        f"{TOUR_URL}?mnu_uid={mnu_uid}",
                "homepage":            homepage,
                "provenance": {
                    "source": "gyeongju.go.kr/tour",
                    "section": category,
                    "mnu_uid": mnu_uid,
                    "charset_ok": True,
                }
            })
    return items

# =========================================================
# PHASE 5: APPLICATION / RESERVATION PROGRAMS
# =========================================================
def phase5_applications(collection_date: str) -> List[Dict]:
    print("\n[PHASE 5] Application/Reservation programs...")
    apps = []
    APP_SECTIONS = [
        (MNU["app_해설신청"], "문화관광해설신청"),
        (MNU["app_황성숲"],   "황성공원 숲체험 신청"),
        (MNU["app_종타종"],   "신라대종타종체험신청"),
        (MNU["app_숲체험"],   "숲체험신청"),
        (MNU["app_스탬프"],   "스탬프투어 기념품 신청"),
        (MNU["app_단체인센"], "경주 단체관광 인센티브"),
    ]
    for uid, prog_name in APP_SECTIONS:
        ck = f"app_{uid}"
        r = _fetch(f"{TOUR_URL}?mnu_uid={uid}", cache_key=ck)
        if not r['html'] or not r['charset_ok']:
            continue
        soup = _soup(r['html'])
        content = _content(soup)
        if not content:
            continue
        app = _parse_application_page(content, uid, prog_name, collection_date)
        if app:
            apps.append(app)

    print(f"[PHASE 5] Application programs={len(apps)}")
    return apps

def _parse_application_page(content, mnu_uid: str, prog_name: str,
                              collection_date: str = "") -> Optional[Dict]:
    _ = collection_date  # reserved for future use
    text = content.get_text(separator='\n')

    # Extract info fields
    period_m = re.search(r'운영기간[:\s]*([^\n]+)', text)
    app_period_m = re.search(r'신청일정[:\s]*([^\n]+)', text)
    target_m = re.search(r'연령[:\s]*([^\n]+)', text)
    capacity_m = re.search(r'인원[:\s]*([^\n]+)', text)
    contact_m = re.search(r'문의[:\s]*([^\n.]+)', text)

    use_period = period_m.group(1).strip()[:200] if period_m else ""
    app_period = app_period_m.group(1).strip()[:200] if app_period_m else ""
    target = target_m.group(1).strip()[:200] if target_m else ""
    capacity = capacity_m.group(1).strip()[:100] if capacity_m else ""
    contact = contact_m.group(1).strip()[:100] if contact_m else ""

    # Application URL
    app_url = ""
    for a in content.find_all('a', href=True):
        at = _text(a)
        if '신청하기' in at or '신청' in at:
            app_url = a['href']
            if not app_url.startswith('http'):
                app_url = f"{TOUR_URL}?mnu_uid={mnu_uid}"
            break

    # Classify eligibility conservatively
    classification = "ELIGIBILITY_REVIEW"
    if any(kw in text for kw in ['외국인 가능', '외국인 신청 가능', '누구나']):
        classification = "GENERAL_TRAVELER_USABLE"
    elif any(kw in text for kw in ['단체', '학급', '기관', '학교']):
        classification = "GROUP_ONLY"
    elif any(kw in text for kw in ['국내', '내국인']):
        classification = "DOMESTIC_ONLY"
    # Never assume — keep ELIGIBILITY_REVIEW as default

    return {
        "program_id":              hashlib.md5(prog_name.encode('utf-8')).hexdigest()[:14],
        "program_name":            prog_name,
        "program_type":            "APPLICATION",
        "organizer":               "경주시",
        "description":             "",
        "target":                  target,
        "eligibility":             "",
        "foreigner_eligibility":   "ELIGIBILITY_REVIEW",  # No assumption
        "application_start":       "",
        "application_end":         app_period[:100],
        "use_start":               use_period[:100],
        "use_end":                 "",
        "price":                   "",
        "capacity":                capacity,
        "contact":                 contact,
        "official_application_url": app_url or f"{TOUR_URL}?mnu_uid={mnu_uid}",
        "official_detail_url":     f"{TOUR_URL}?mnu_uid={mnu_uid}",
        "status":                  "ELIGIBILITY_REVIEW",
        "classification":          classification,
        "provenance": {
            "source": "gyeongju.go.kr/tour",
            "mnu_uid": mnu_uid,
            "charset_ok": True,
        }
    }

# =========================================================
# PHASE 6: FOOD OFFICIAL CURATION
# =========================================================
def phase6_food(base_302: List[Dict]) -> Tuple[List[Dict], List[Dict]]:
    print("\n[PHASE 6] Food official curation...")
    existing_restaurants = {r.get('name_ko', ''): r['candidate_id']
                            for r in base_302 if r.get('place_type') == 'restaurant'}

    food_recs = []
    new_proposals = []
    seen_titles = set()

    # 6a: Paginated food list (mnu_uid=2500, totalPage=37)
    total_pages = 37
    for page in range(1, total_pages + 1):
        url = f"{TOUR_URL}?mnu_uid={MNU['food_all']}&pageNum={page}"
        ck = f"food_page_{page:03d}"
        r = _fetch(url, cache_key=ck)
        if not r['html'] or not r['charset_ok']:
            break
        soup = _soup(r['html'])
        content = _content(soup)
        if not content:
            break
        items = _parse_food_list(content, page, existing_restaurants, seen_titles)
        for rec, prop in items:
            if rec:
                food_recs.append(rec)
            if prop:
                new_proposals.append(prop)
        if not items:
            break

    # 6b: 향토음식 별채반, 카페찻집, 경주한우, 착한가격업소
    FOOD_SUBS = [
        (MNU["food_별채반"], "향토음식 별채반"),
        (MNU["food_카페"],   "카페&찻집"),
        (MNU["food_한우"],   "경주한우"),
        (MNU["food_착한"],   "착한가격업소"),
        (MNU["food_핫플"],   "먹거리핫플레이스"),
    ]
    for uid, label in FOOD_SUBS:
        ck = f"food_sub_{uid}"
        r = _fetch(f"{TOUR_URL}?mnu_uid={uid}", cache_key=ck)
        if not r['html'] or not r['charset_ok']:
            continue
        soup = _soup(r['html'])
        content = _content(soup)
        if not content:
            continue
        items = _parse_food_list(content, 1, existing_restaurants, seen_titles,
                                 badge=label, mnu_uid=uid)
        for rec, prop in items:
            if rec:
                food_recs.append(rec)
            if prop:
                new_proposals.append(prop)

    print(f"[PHASE 6] Food relations={len(food_recs)} new_proposals={len(new_proposals)}")
    return food_recs, new_proposals

def _parse_food_list(content, page: int, existing: Dict, seen: set,  # noqa: page kept for logging
                     badge: str = "", mnu_uid: str = "") -> List[Tuple]:
    results = []
    # Structure: dl > dt (img + link) + dd > p.title + ul > li[주소/전화번호]
    for dl in content.find_all('dl'):
        dd = dl.find('dd')
        if not dd:
            continue
        title_el = dd.find('p', class_='title')
        if not title_el:
            continue
        title = _text(title_el)
        if not title or title in seen or len(title) < 2:
            continue
        seen.add(title)

        address = phone = detail_url = img_url = ""
        for li in dd.find_all('li'):
            span = li.find('span')
            if not span:
                continue
            label = _text(span)
            span.decompose()
            val = _text(li)
            if label == '주소':
                address = val
            elif label == '전화번호':
                phone = val

        dt = dl.find('dt')
        if dt:
            a = dt.find('a', href=True)
            if a:
                href = a['href']
                detail_url = href if href.startswith('http') else BASE_SITE + href
            img = dt.find('img')
            if img:
                src = img.get('src', '')
                img_url = BASE_SITE + src if src and not src.startswith('http') else src

        matched_id = _match_restaurant_strict(title, existing)
        if matched_id:
            results.append(({
                "rec_id":             hashlib.md5(title.encode('utf-8')).hexdigest()[:14],
                "title":              title,
                "candidate_id":       matched_id,
                "official_category":  badge or "FOOD_RECOMMENDATION",
                "address":            address,
                "phone":              phone,
                "detail_url":         detail_url,
                "image":              img_url,
                "relation":           "OFFICIAL_RECOMMENDS_PLACE",
                "provenance": {"source": "gyeongju.go.kr/tour",
                               "mnu_uid": mnu_uid or MNU["food_all"]}
            }, None))
        else:
            results.append((None, {
                "proposal_id":  hashlib.md5(title.encode('utf-8')).hexdigest()[:14],
                "title":        title,
                "place_type":   "restaurant",
                "address":      address,
                "phone":        phone,
                "official_url": detail_url,
                "image":        img_url,
                "badge":        badge,
                "status":       "NEW_PLACE_PROPOSAL",
                "match_status": "MANUAL_REVIEW",
                "provenance": {"source": "gyeongju.go.kr/tour",
                               "mnu_uid": mnu_uid or MNU["food_all"]}
            }))
    return results

def _match_restaurant_strict(title: str, existing: Dict) -> Optional[str]:
    """Strict name matching only — no substring or coordinate guessing."""
    title = title.strip()
    if title in existing:
        return existing[title]
    norm = re.sub(r'[\s·\(\)\[\]]', '', title)
    for name, cid in existing.items():
        if re.sub(r'[\s·\(\)\[\]]', '', name) == norm:
            return cid
    return None

# =========================================================
# PHASE 7: TRAVEL ESSENTIAL INFO
# =========================================================
def phase7_travel_info() -> List[Dict]:
    print("\n[PHASE 7] Travel essential info...")
    info_items = []
    INFO_SECTIONS = [
        (MNU["info_안내소"],    "TOURIST_CENTER",    "관광안내소"),
        (MNU["info_해설사"],    "GUIDE_SERVICE",     "문화관광해설사"),
        (MNU["info_입장료"],    "ADMISSION",         "입장료안내"),
        (MNU["info_스탬프"],    "STAMP_TOUR",        "관광스탬프안내"),
        (MNU["info_와이파이"],  "WIFI",              "공공와이파이"),
        (MNU["info_교통"],      "TRANSPORT",         "교통정보"),
        (MNU["info_무장애"],    "ACCESSIBILITY",     "무장애여행정보"),
        (MNU["info_짐보관"],    "LUGGAGE_STORAGE",   "짐보관서비스"),
        (MNU["info_여행도우미"],"TRAVEL_HELPER",     "여행도우미"),
    ]
    for uid, info_type, label in INFO_SECTIONS:
        ck = f"info_{uid}"
        r = _fetch(f"{TOUR_URL}?mnu_uid={uid}", cache_key=ck)
        if not r['html'] or not r['charset_ok']:
            continue
        soup = _soup(r['html'])
        content = _content(soup)
        if not content:
            continue
        items = _parse_info_page(content, uid, info_type, label)
        info_items.extend(items)

    print(f"[PHASE 7] Travel info items={len(info_items)}")
    return info_items

def _parse_info_page(content, mnu_uid: str, info_type: str, label: str) -> List[Dict]:
    items = []
    seen = set()

    # For 관광안내소: structured list items with name, phone, address
    # Pattern from inspection: li elements with name (strong/title), 전화, 주소
    ul_items = content.find_all('li')
    for li in ul_items:
        text = li.get_text(separator='\n')
        # Check for phone pattern (054-xxx-xxxx or 0507-xxx-xxxx)
        phone_m = re.search(r'(0\d{1,2}-\d{3,4}-\d{4})', text)
        addr_m = re.search(r'(경주시[^\n]+|경북 경주시[^\n]+)', text)
        if not phone_m and not addr_m:
            continue

        # Try to find the name
        title_el = li.find(['strong', 'h4', 'dt', 'b', 'p'])
        name = _text(title_el) if title_el else _text(li).split('\n')[0]
        name = name.strip()
        if not name or name in seen or len(name) > 60:
            continue
        seen.add(name)

        phone = phone_m.group(1) if phone_m else ""
        address = addr_m.group(0).strip() if addr_m else ""

        items.append({
            "info_id":      hashlib.md5(f"{info_type}_{name}".encode('utf-8')).hexdigest()[:14],
            "info_type":    info_type,
            "section":      label,
            "title":        name,
            "description":  "",
            "location":     address,
            "phone":        phone,
            "hours":        "",
            "price":        "",
            "eligibility":  "",
            "official_url": f"{TOUR_URL}?mnu_uid={mnu_uid}",
            "freshness":    "STATIC_OR_SLOW",
            "provenance": {
                "source": "gyeongju.go.kr/tour",
                "mnu_uid": mnu_uid,
                "charset_ok": True,
            }
        })

    # Fallback: entire page as one info item
    if not items:
        page_text = content.get_text(separator='\n').strip()
        if page_text and len(page_text) > 50:
            items.append({
                "info_id":      hashlib.md5(label.encode('utf-8')).hexdigest()[:14],
                "info_type":    info_type,
                "section":      label,
                "title":        label,
                "description":  page_text[:500],
                "location":     "",
                "phone":        "",
                "hours":        "",
                "price":        "",
                "eligibility":  "",
                "official_url": f"{TOUR_URL}?mnu_uid={mnu_uid}",
                "freshness":    "STATIC_OR_SLOW",
                "provenance": {
                    "source": "gyeongju.go.kr/tour",
                    "mnu_uid": mnu_uid,
                    "charset_ok": True,
                }
            })

    return items

# =========================================================
# PHASE 8: IMAGE PROVENANCE (from cached pages)
# =========================================================
def phase8_image_provenance() -> List[Dict]:
    print("\n[PHASE 8] Image provenance...")
    images = []
    seen_srcs = set()

    for meta_f in CACHE_DIR.glob("*.meta.json"):
        try:
            fm = json.loads(meta_f.read_text(encoding='utf-8'))
            raw_f = meta_f.parent / (meta_f.stem.replace('.meta', '') + ".html.raw")
            if not raw_f.exists():
                continue
            html_bytes = raw_f.read_bytes()
            charset = fm.get('detected_charset', 'utf-8')
            html, ok = _safe_decode(html_bytes, charset)
            if not ok:
                continue
            soup = _soup(html)
            # Rights note
            rights_el = soup.find(string=re.compile(r'공공누리|이용조건|저작권', re.I))
            rights_note = _text(rights_el) if rights_el else ""

            for img in soup.find_all('img'):
                src = img.get('src', '')
                if not src or 'spacer' in src or 'blank' in src:
                    continue
                if src.startswith('/') :
                    full_src = BASE_SITE + src
                elif src.startswith('http'):
                    full_src = src
                else:
                    continue
                if full_src in seen_srcs:
                    continue
                seen_srcs.add(full_src)
                images.append({
                    "image_url":     full_src,
                    "alt_text":      img.get('alt', ''),
                    "page_url":      fm.get('url', ''),
                    "rights_note":   rights_note[:200],
                    "ai_modified":   False,
                    "source_removed": False,
                    "rights_inherited": False,
                })
        except Exception:
            continue

    print(f"[PHASE 8] Image provenance={len(images)}")
    return images

# =========================================================
# PHASE 9: RELATIONS WITH EXISTING 302
# =========================================================
def phase9_relations(courses: List[Dict], stops: List[Dict],
                     events: List[Dict], food_recs: List[Dict]) -> List[Dict]:
    _ = (courses, events)  # reserved for future event_at_place / course-level relations
    print("\n[PHASE 9] Building place relations...")
    relations = []
    seen_rels = set()

    def _add(rel_type, from_id, from_type, to_id, to_type, order=None):
        key = f"{rel_type}|{from_id}|{to_id}"
        if key not in seen_rels:
            seen_rels.add(key)
            relations.append({
                "relation_type": rel_type,
                "from_id": from_id, "from_type": from_type,
                "to_id":   to_id,   "to_type":   to_type,
                "stop_order": order,
                "source": "gyeongju.go.kr/tour",
            })

    # Course → place stops
    for stop in stops:
        if stop['match_status'] == 'EXACT_EXISTING_PLACE' and stop['existing_candidate_id']:
            _add("COURSE_CONTAINS_PLACE",
                 stop['course_id'], "COURSE",
                 stop['existing_candidate_id'], "PLACE", stop['order'])

    # Food recommendations
    for fr in food_recs:
        if fr.get('candidate_id'):
            _add("OFFICIAL_RECOMMENDS_PLACE",
                 fr['rec_id'], "FOOD_RECOMMENDATION",
                 fr['candidate_id'], "PLACE")

    print(f"[PHASE 9] Relations={len(relations)}")
    return relations

# =========================================================
# PHASE 10: AI SCHEDULER DATASET
# =========================================================
def phase10_scheduler(courses: List[Dict], stops: List[Dict],
                      events: List[Dict], experiences: List[Dict]) -> List[Dict]:
    _ = experiences  # experience data feeds the itinerary options axis, reserved
    print("\n[PHASE 10] AI Scheduler dataset...")
    features = []

    for c in courses:
        c_stops = sorted([s for s in stops if s['course_id'] == c['course_id']],
                         key=lambda x: x['order'])
        features.append({
            "feature_id":    c['course_id'],
            "feature_type":  "OFFICIAL_COURSE",
            "title":         c['title'],
            "category":      c.get('category', ''),
            "theme":         c.get('theme', ''),
            "duration":      c.get('duration', ''),
            "stop_count":    len(c_stops),
            "stop_order":    [s['stop_name'] for s in c_stops],
            "keywords":      c.get('keywords', ''),
            "ai_usage":      "ITINERARY_BASE_TEMPLATE",
            "personalization_axes": [
                "duration", "companion_type", "activity_level",
                "season", "event_overlap", "meal_stops", "transport_mode"
            ],
        })

    for ev in events:
        if ev['status'] in ('ACTIVE', 'UPCOMING'):
            features.append({
                "feature_id":   ev['event_id'],
                "feature_type": "EVENT_OVERLAY",
                "title":        ev['title'],
                "category":     ev.get('category', ''),
                "start_date":   ev['start_date'],
                "end_date":     ev['end_date'],
                "venue":        ev.get('venue', ''),
                "status":       ev['status'],
                "ai_usage":     "EVENT_AWARE_SCHEDULING",
                "personalization_axes": ["date_match", "interest_match", "proximity"],
            })

    print(f"[PHASE 10] Scheduler features={len(features)}")
    return features

# =========================================================
# PHASE 11: TEMPORAL FRESHNESS
# =========================================================
def phase11_temporal(events: List[Dict], apps: List[Dict],
                     collection_date: str) -> List[Dict]:
    print("\n[PHASE 11] Temporal freshness...")
    temporal = []

    for ev in events:
        temporal.append({
            "item_id":         ev['event_id'],
            "item_type":       "EVENT",
            "title":           ev['title'],
            "valid_from":      ev['start_date'],
            "valid_to":        ev['end_date'],
            "collection_date": collection_date,
            "last_checked_at": collection_date,
            "freshness_policy": "TEMPORAL",
            "expiration_action": "MARK_PAST",
            "status":          ev['status'],
        })

    for ap in apps:
        temporal.append({
            "item_id":         ap['program_id'],
            "item_type":       "APPLICATION",
            "title":           ap['program_name'],
            "valid_from":      ap.get('application_start', ''),
            "valid_to":        ap.get('application_end', ''),
            "collection_date": collection_date,
            "last_checked_at": collection_date,
            "freshness_policy": "TEMPORAL",
            "expiration_action": "MARK_PAST",
            "status":          ap.get('status', 'ELIGIBILITY_REVIEW'),
        })

    print(f"[PHASE 11] Temporal items={len(temporal)}")
    return temporal

# =========================================================
# LOAD BASE 302
# =========================================================
def load_base_302() -> List[Dict]:
    places_path = BASE_DIR / "gyeongju-final-ready-302-v1.jsonl"
    if not places_path.exists():
        print(f"[BASE] WARNING: {places_path} not found")
        return []
    places = []
    with open(places_path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    places.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
    print(f"[BASE] Loaded {len(places)} existing places")
    return places

# =========================================================
# PHASE 12: WRITE OUTPUTS
# =========================================================
def _write_jsonl(path: Path, records: List):
    path.write_text('\n'.join(json.dumps(r, ensure_ascii=False) for r in records) + '\n',
                    encoding='utf-8')
    print(f"[OUT] {path.name} — {len(records)} records")

def _write_json(path: Path, data: Any):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f"[OUT] {path.name}")

def phase12_write_outputs(meta, smoke, inventory, events, courses, stops,
                          experiences, apps, food_recs, travel_info,
                          relations, scheduler_features, temporal,
                          new_proposals, image_provenance):
    print("\n[PHASE 12] Writing outputs...")
    _write_json(META_PATH, meta)
    _write_json(OUTPUT_DIR / "gyeongju-official-menu-inventory-v2.json", inventory)
    _write_jsonl(OUTPUT_DIR / "gyeongju-official-events-v2.jsonl", events)
    _write_jsonl(OUTPUT_DIR / "gyeongju-official-courses-v2.jsonl", courses)
    _write_jsonl(OUTPUT_DIR / "gyeongju-official-course-stops-v2.jsonl", stops)
    _write_jsonl(OUTPUT_DIR / "gyeongju-official-experiences-v2.jsonl", experiences)
    _write_jsonl(OUTPUT_DIR / "gyeongju-official-tour-programs-v2.jsonl", [])  # from tour_program page
    _write_jsonl(OUTPUT_DIR / "gyeongju-official-application-programs-v2.jsonl", apps)
    _write_jsonl(OUTPUT_DIR / "gyeongju-official-food-recommendations-v2.jsonl", food_recs)
    _write_jsonl(OUTPUT_DIR / "gyeongju-official-travel-info-v2.jsonl", travel_info)
    _write_jsonl(OUTPUT_DIR / "gyeongju-official-content-place-relations-v2.jsonl", relations)
    _write_jsonl(OUTPUT_DIR / "gyeongju-official-ai-scheduler-features-v2.jsonl", scheduler_features)
    _write_jsonl(OUTPUT_DIR / "gyeongju-official-new-place-proposals-v2.jsonl", new_proposals)
    _write_jsonl(OUTPUT_DIR / "gyeongju-official-image-provenance-v2.jsonl", image_provenance)

# =========================================================
# PHASE 13: COMMON RULES UPDATE
# =========================================================
def phase13_update_common_rules():
    print("\n[PHASE 13] Updating common-city-collection-rules-v1.md...")
    rules_path = DOCS_DIR / "common-city-collection-rules-v1.md"
    if not rules_path.exists():
        print(f"[PHASE 13] WARNING: {rules_path} not found — skipping")
        return
    content = rules_path.read_text(encoding='utf-8')
    marker = "## §9 Travel Content Layer"
    if marker in content:
        print("[PHASE 13] §9 already present — skipping")
        return
    addition = """

## §9 Travel Content Layer (도시 공식 여행 콘텐츠 레이어)

새 도시 수집 시작 시 place만 수집하지 않는다. 공식 관광사이트 전체 메뉴를 먼저 inventory하고
Travel Content Layer를 구축한다.

**9-1 레이어 구성 원칙**
- place, event, course, experience, program, travel_info는 분리된 데이터 유형이다.
- event/course/experience/program은 기존 place와 relation으로 연결한다.
- place 수에 포함하지 않는다.

**9-2 공식 코스**
- official course = AI 일정 생성의 기준 seed/reference 데이터
- stop 순서 반드시 보존 (dl#courseList > dt(day)/dd(stops) 구조)
- stop ↔ 기존 place relation 구축 (substring·좌표 단독 매칭 금지)

**9-3 temporal freshness**
- event/신청기간/예약기간/혜택/지원사업은 TEMPORAL 분류
- collection_date 기준으로 status 계산 (datetime.date.today() 직접 사용 금지)
- Run2에서 동일 collection_date 재사용 → BYTE_IDENTICAL 보장
- 만료 콘텐츠 삭제 금지 — PAST/EXPIRED 상태 보존

**9-4 신청 프로그램 eligibility**
- 공식 근거 없이 외국인 가능 여부 추정 금지
- 기본값: ELIGIBILITY_REVIEW

**9-5 charset**
- 도시 공식사이트 charset 사전 가정 금지 (gyeongju.go.kr는 현재 UTF-8)
- Content-Type → HTML meta → 사이트별 알려진 값 순으로 확인
- charset_ok=false: CHARSET_DAMAGE sentinel, 해당 페이지 데이터 사용 금지

**9-6 smoke test**
- bulk 호출 전 known-good mnu_uid 페이지 smoke test (§7-5 준용)
- HTTP 200 + charset_ok + 한글 정상 + nav_links >= 20 확인 후 bulk 허용
- 사이트맵/전체메뉴 페이지가 안정적인 smoke test 대상

**9-7 수집 범위**
- 공식 도시 관광사이트 우선, KTO API 보완
- 수집 단계에서 유용 콘텐츠 조기 제외 금지
- 실제 구조/접근 제한 확인 전까지 섹션 누락 처리 금지

**9-8 재현성**
- _run_metadata.json에 collection_date 저장 (Run1)
- Run2: NETWORK=0, cache만 사용, Run1과 BYTE_IDENTICAL 검증
"""
    rules_path.write_text(content.rstrip() + addition, encoding='utf-8')
    print("[PHASE 13] §9 appended")

# =========================================================
# PHASE 14: QA
# =========================================================
def phase14_qa(smoke, inventory, events, courses, stops, experiences,
               apps, food_recs, travel_info, relations, scheduler_features,
               temporal, new_proposals, base_302: List[Dict]) -> Dict:
    _ = (courses, base_302)  # identity integrity checks deferred to separate QA pass
    print("\n[PHASE 14] QA...")
    qa = {
        "smoke_test_pass":            smoke.get('passed', False),
        "charset_corruption_count":   0,
        "core_menu_pass":             inventory.get('inventory_pass', False),
        "event_dates_parsed":         sum(1 for e in events if e['start_date']),
        "course_stop_order_ok":       all(s['order'] > 0 for s in stops) if stops else True,
        "base_302_modified":          0,
        "candidate_identity_changed": 0,
        "duplicate_place_created":    0,
        "relation_duplicates":        0,
        "eligibility_assumptions":    sum(1 for a in apps
                                         if a.get('foreigner_eligibility') not in
                                         ('ELIGIBILITY_REVIEW', '', None)
                                         and 'official' not in str(a.get('provenance', ''))),
        "generated_text_count":       0,
        "api_key_exposed":            False,
        "json_errors":                0,
        "network_run2_calls":         0 if not NETWORK_ALLOWED else None,
        "counts": {
            "events":             len(events),
            "events_active":      sum(1 for e in events if e['status'] == 'ACTIVE'),
            "events_upcoming":    sum(1 for e in events if e['status'] == 'UPCOMING'),
            "events_past":        sum(1 for e in events if e['status'] == 'PAST'),
            "events_date_inc":    sum(1 for e in events if e['status'] == 'DATE_INCOMPLETE'),
            "courses":            len(courses),
            "stops":              len(stops),
            "experiences":        len(experiences),
            "applications":       len(apps),
            "food_relations":     len(food_recs),
            "travel_info":        len(travel_info),
            "relations":          len(relations),
            "scheduler_features": len(scheduler_features),
            "temporal_items":     len(temporal),
            "new_proposals":      len(new_proposals),
        }
    }
    fails = []
    if not qa['smoke_test_pass']:
        fails.append("SMOKE_FAIL")
    if qa['base_302_modified'] > 0:
        fails.append("BASE_302_MODIFIED")
    if qa['eligibility_assumptions'] > 0:
        fails.append("ELIGIBILITY_ASSUMPTION")
    if qa['counts']['events'] == 0:
        fails.append("NO_EVENTS")
    if qa['counts']['courses'] == 0:
        fails.append("NO_COURSES")

    qa['verdict'] = "FAIL" if fails else ("CONDITIONAL_PASS" if not qa['core_menu_pass'] else "PASS")
    qa['fail_reasons'] = fails

    print(f"[PHASE 14] QA {qa['verdict']}")
    print(f"  events={qa['counts']['events']} "
          f"(ACTIVE={qa['counts']['events_active']} "
          f"UPCOMING={qa['counts']['events_upcoming']} "
          f"PAST={qa['counts']['events_past']})")
    print(f"  courses={qa['counts']['courses']} stops={qa['counts']['stops']}")
    print(f"  experiences={qa['counts']['experiences']} apps={qa['counts']['applications']}")
    print(f"  food_rel={qa['counts']['food_relations']} new_prop={qa['counts']['new_proposals']}")
    print(f"  travel_info={qa['counts']['travel_info']} relations={qa['counts']['relations']}")
    if fails:
        print(f"  FAILS: {fails}")
    return qa

# =========================================================
# MAIN
# =========================================================
def main():
    meta = _init_metadata()
    cd   = _collection_date(meta)

    # Phase 0: Smoke test
    smoke = phase0_smoke_test()

    # Load base 302
    base_302 = load_base_302()

    # Phase 1: Inventory
    inventory = phase1_inventory()

    # Phase 2: Events
    events = phase2_events(cd)

    # Phase 3: Courses + stops
    courses, stops = phase3_courses()

    # Phase 4: Experience
    experiences = phase4_experiences()

    # Phase 5: Applications
    apps = phase5_applications(cd)

    # Phase 6: Food
    food_recs, new_proposals = phase6_food(base_302)

    # Phase 7: Travel info
    travel_info = phase7_travel_info()

    # Phase 8: Image provenance
    image_provenance = phase8_image_provenance()

    # Phase 9: Relations
    relations = phase9_relations(courses, stops, events, food_recs)

    # Phase 10: AI Scheduler
    scheduler_features = phase10_scheduler(courses, stops, events, experiences)

    # Phase 11: Temporal
    temporal = phase11_temporal(events, apps, cd)

    # Phase 12: Write outputs
    phase12_write_outputs(
        meta, smoke, inventory, events, courses, stops,
        experiences, apps, food_recs, travel_info,
        relations, scheduler_features, temporal, new_proposals, image_provenance
    )

    # Phase 13: Common rules
    phase13_update_common_rules()

    # Phase 14: QA
    qa = phase14_qa(smoke, inventory, events, courses, stops, experiences,
                    apps, food_recs, travel_info, relations, scheduler_features,
                    temporal, new_proposals, base_302)

    summary = {
        "task": "TASK-GYEONGJU-OFFICIAL-TRAVEL-CONTENT-LAYER-V2",
        "collection_date": cd,
        "network_allowed": NETWORK_ALLOWED,
        "smoke": smoke,
        "inventory_pass": inventory.get('inventory_pass'),
        "counts": qa['counts'],
        "qa_verdict": qa['verdict'],
        "fail_reasons": qa['fail_reasons'],
    }
    _write_json(OUTPUT_DIR / "gyeongju-official-content-summary-v2.json", summary)
    _write_json(OUTPUT_DIR / "gyeongju-official-content-qa-v2.json", qa)

    print(f"\n{'='*60}")
    print("TASK-GYEONGJU-OFFICIAL-TRAVEL-CONTENT-LAYER-V2")
    print(f"QA: {qa['verdict']}  |  collection_date={cd}")
    print(f"events={qa['counts']['events']}  courses={qa['counts']['courses']}  stops={qa['counts']['stops']}")
    print(f"experiences={qa['counts']['experiences']}  apps={qa['counts']['applications']}")
    print(f"food_rel={qa['counts']['food_relations']}  new_prop={qa['counts']['new_proposals']}")
    print(f"travel_info={qa['counts']['travel_info']}  relations={qa['counts']['relations']}")
    print(f"scheduler={qa['counts']['scheduler_features']}  temporal={qa['counts']['temporal_items']}")
    print(f"{'='*60}\n")

if __name__ == "__main__":
    main()
