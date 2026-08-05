#!/usr/bin/env python3
"""
경주문화관광 웹 수집기 v2.0.0
원천: https://www.gyeongju.go.kr/tour
수집 대상: attractions | monthly-recommendations | courses | heritage | cultural-guides | events

변경 이력:
  v2.0.0 (2026-08-05): 상세 페이지 파서 추가 (B1 attractions, B2 events),
                        문화관광해설 동적 추출 (B3), 추천여행지 콘텐츠 파싱 (B4)
  v1.0.0 (2026-08-04): 초기 목록 수집기
"""

import argparse
import hashlib
import json
import math
import re
import sys
import time
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

VERSION = "2.0.0"
BASE_URL = "https://www.gyeongju.go.kr"
TOUR_URL = f"{BASE_URL}/tour/page.do"
UA = "Mozilla/5.0 (compatible; KoreaMate-Collector/2.0; +https://github.com/skywarrior1003-max/korea-mate)"
ITEMS_PER_PAGE = 8

CONTENT_TYPES = [
    "attractions",
    "monthly-recommendations",
    "courses",
    "heritage",
    "cultural-guides",
    "events",
]

# 권역별 관광지 – discovery 2026-08-04 확인 수치
REGIONS = [
    {"key": "bomun",       "mnu_uid": 2291, "code_uid": 1011, "name_ko": "보문관광단지권", "known_total": 34},
    {"key": "sinae",       "mnu_uid": 2292, "code_uid": 1012, "name_ko": "경주시내권",    "known_total": 44},
    {"key": "bulguksa",    "mnu_uid": 2293, "code_uid": 1015, "name_ko": "불국사권",      "known_total": 12},
    {"key": "donghae",     "mnu_uid": 2294, "code_uid": 1016, "name_ko": "동해권",        "known_total": 23},
    {"key": "namsan",      "mnu_uid": 2295, "code_uid": 1014, "name_ko": "남산권",        "known_total": 19},
    {"key": "seoakbukbu",  "mnu_uid": 2296, "code_uid": 1010, "name_ko": "서악북부권",   "known_total": 27},
]

COURSES = [
    {"key": "core-bible",     "mnu_uid": 2297, "name_ko": "시내권 핵심 바이블"},
    {"key": "art-literature", "mnu_uid": 2298, "name_ko": "미술문학 코스"},
    {"key": "night-walk",     "mnu_uid": 2299, "name_ko": "야경산책 코스"},
    {"key": "bicycle",        "mnu_uid": 2300, "name_ko": "자전거 코스"},
    {"key": "bus",            "mnu_uid": 2301, "name_ko": "버스 코스"},
]

HERITAGE_PAGES = [
    {"key": "main",               "mnu_uid": 2275, "name_ko": "세계문화유산"},
    {"key": "bulguksa-seokguram", "mnu_uid": 2349, "name_ko": "불국사·석굴암"},
    {"key": "yangdong",           "mnu_uid": 2508, "name_ko": "양동마을"},
    {"key": "oksan-seowon",       "mnu_uid": 2509, "name_ko": "옥산서원"},
    {"key": "namsan-district",    "mnu_uid": 2510, "name_ko": "남산지구"},
]

EVENTS_MNU_UID      = 2393
MONTHLY_REC_MNU_UID = 4185
CULTURAL_GUIDE_MNU_UID = 2262


# ──────────────────────────────────────────────────────────────
# HTTP helpers
# ──────────────────────────────────────────────────────────────

def http_get(url: str, timeout: int, retries: int, delay: float) -> tuple:
    """Returns (body, status_code, error_msg). body=None on failure."""
    for attempt in range(1, retries + 1):
        try:
            req = Request(url, headers={"User-Agent": UA})
            with urlopen(req, timeout=timeout) as resp:
                return resp.read(), resp.status, ""
        except HTTPError as e:
            if attempt == retries:
                return None, e.code, f"HTTPError {e.code}"
            time.sleep(delay * attempt)
        except URLError as e:
            if attempt == retries:
                return None, 0, f"URLError {e.reason}"
            time.sleep(delay * attempt)
        except Exception as e:
            if attempt == retries:
                return None, 0, str(e)[:80]
            time.sleep(delay * attempt)
    return None, 0, "max_retries"


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ──────────────────────────────────────────────────────────────
# HTML parsing helpers
# ──────────────────────────────────────────────────────────────

class LinkParser(HTMLParser):
    """Extract (href, link_text) pairs from HTML."""
    def __init__(self):
        super().__init__()
        self.links: list = []
        self._href = None
        self._buf: list = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            attrs_d = dict(attrs)
            self._href = attrs_d.get("href", "")
            self._buf = []

    def handle_data(self, data):
        if self._href is not None:
            self._buf.append(data)

    def handle_endtag(self, tag):
        if tag == "a" and self._href is not None:
            text = " ".join(self._buf).split()
            text = " ".join(text)
            self.links.append((self._href, text))
            self._href = None
            self._buf = []


def extract_links(html_bytes: bytes) -> list:
    try:
        html = html_bytes.decode("utf-8", errors="replace")
    except Exception:
        return []
    p = LinkParser()
    p.feed(html)
    return p.links


def extract_total_count(html_bytes: bytes):
    """Find 총 N건 pattern."""
    try:
        html = html_bytes.decode("utf-8", errors="replace")
    except Exception:
        return None
    m = re.search(r"총\s*([0-9,]+)\s*건", html)
    if m:
        return int(m.group(1).replace(",", ""))
    m2 = re.search(r"전체\s*([0-9,]+)\s*건", html)
    if m2:
        return int(m2.group(1).replace(",", ""))
    return None


def extract_title(html_bytes: bytes) -> str:
    """Extract page <title> text."""
    try:
        html = html_bytes.decode("utf-8", errors="replace")
    except Exception:
        return ""
    m = re.search(r"<title[^>]*>([^<]+)</title>", html, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return ""


def make_absolute_url(href: str) -> str:
    if href.startswith("http"):
        return href
    if href.startswith("/"):
        return BASE_URL + href
    return TOUR_URL.rsplit("/", 1)[0] + "/" + href


def parse_attraction_links(html_bytes: bytes, mnu_uid: int) -> list:
    """Extract attraction items from a list page."""
    links = extract_links(html_bytes)
    results = []
    seen = set()
    for href, text in links:
        if "area_uid=" not in href or "cmd=2" not in href:
            continue
        m_area = re.search(r"area_uid=(\d+)", href)
        if not m_area:
            continue
        area_uid = int(m_area.group(1))
        if area_uid in seen:
            continue
        seen.add(area_uid)
        m_code = re.search(r"code_uid=(\d+)", href)
        code_uid = int(m_code.group(1)) if m_code else None
        abs_url = make_absolute_url(href)
        results.append({
            "area_uid": area_uid,
            "code_uid": code_uid,
            "mnu_uid": mnu_uid,
            "name_ko_list": text if text else None,
            "list_url": abs_url,
            "detail_url": f"{TOUR_URL}?mnu_uid={mnu_uid}&code_uid={code_uid}&area_uid={area_uid}&cmd=2",
        })
    return results


def parse_event_links(html_bytes: bytes) -> list:
    """Extract event items (con_uid) from event list page."""
    links = extract_links(html_bytes)
    results = []
    seen = set()
    for href, text in links:
        if "con_uid=" not in href or "cmd=2" not in href:
            continue
        m = re.search(r"con_uid=(\d+)", href)
        if not m:
            continue
        con_uid = int(m.group(1))
        if con_uid in seen:
            continue
        seen.add(con_uid)
        abs_url = make_absolute_url(href)
        results.append({
            "con_uid": con_uid,
            "detail_url": abs_url,
        })
    return results


# ──────────────────────────────────────────────────────────────
# Detail page parsers  (B1, B2, B3, B4)
# ──────────────────────────────────────────────────────────────

def extract_label_value(html: str, label: str):
    """
    Extract value associated with a Korean label in page HTML.
    Priority order (gyeongju.go.kr actual structure first):
      0. <li><span>LABEL</span>VALUE</li>  ← actual gyeongju.go.kr detail structure
      1. <dt>LABEL</dt><dd>VALUE</dd>
      2. <strong/th>LABEL → td/dd/span
      3. LABEL: VALUE  (plain text with colon)
    Returns cleaned text or None.
    """
    label_esc = re.escape(label)
    patterns = [
        # gyeongju.go.kr: <li><span>주소</span>경주시…</li>
        rf"<li[^>]*>\s*<span[^>]*>\s*{label_esc}\s*</span>(.*?)</li>",
        # dt[label] + dd[value]
        rf"<dt[^>]*>\s*{label_esc}\s*</dt>\s*<dd[^>]*>(.*?)</dd>",
        # th/strong label + td/dd value
        rf"<(?:strong|th)[^>]*>\s*{label_esc}\s*</(?:strong|th)>[^<]*<(?:td|dd|span)[^>]*>(.*?)</(?:td|dd|span)>",
        # label followed by colon/dash then value (plain text)
        rf"{label_esc}\s*[:：]\s*([^\n<]{{3,150}})",
    ]
    for pat in patterns:
        m = re.search(pat, html, re.DOTALL | re.IGNORECASE)
        if m:
            raw = m.group(1)
            clean = re.sub(r"<[^>]+>", " ", raw)
            clean = re.sub(r"&nbsp;", " ", clean)
            clean = re.sub(r"&[a-z]+;", "", clean)
            clean = re.sub(r"\s+", " ", clean).strip()
            if clean and len(clean) >= 2:
                return clean
    return None


# gyeongju.go.kr detail page — confirmed dt ordering (2026-08-05):
# 1. 문화관광 통합검색  (search box UI)
# 2. BEST 인기검색어    (trending keywords)
# 3. 오늘의 날씨        (weather widget)
# 4. <ATTRACTION NAME>  ← this is what we want
# 5. 기본정보           (address/phone block)
# 6. 요약정보           (hours/admission free-text)
# ... (navigation, map widgets, etc.)
_DT_SKIP_NORMALIZED = {
    "문화관광 통합검색", "best 인기검색어", "오늘의 날씨",
    "기본정보", "요약정보", "상세정보",
    "출발지", "도착지",
    "경주문화관광", "경주 여행",
}
_DT_SKIP_CONTAINS = ["item.con_title", "javascript", "document.title"]


def extract_name_from_detail(html: str):
    """
    Extract attraction name from gyeongju.go.kr detail page.

    Confirmed structure (2026-08-05): attraction name always appears as the
    4th <dt> tag on the page, right after 3 fixed UI dts.
    Strategy: iterate dt tags, skip known UI labels, return first match.
    Never skips names containing '경주' (most Gyeongju attraction names do).
    """
    for m in re.finditer(r"<dt[^>]*>(.*?)</dt>", html, re.DOTALL):
        raw = m.group(1)
        # Strip inner HTML tags (anchors, spans)
        name = re.sub(r"<[^>]+>", "", raw)
        # Collapse all whitespace to single space
        name = re.sub(r"\s+", " ", name).strip()
        if not name or len(name) > 60:
            continue
        # Skip known UI labels (normalize case for comparison)
        if name.lower() in _DT_SKIP_NORMALIZED:
            continue
        # Skip JavaScript template strings
        if any(skip in name for skip in _DT_SKIP_CONTAINS):
            continue
        return name
    return None


def parse_korean_date(text: str):
    """Parse Korean date like '2026. 6. 30.(화)' → '2026-06-30'. Returns None if not found."""
    m = re.search(r"(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})", text)
    if m:
        return f"{int(m.group(1)):04d}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
    return None


def parse_attraction_detail(html_bytes: bytes) -> dict:
    """
    Parse attraction detail page. Returns dict with fields or None values.
    Never converts missing info to False/empty — uses None for unknown.
    """
    result = {
        "name_ko": None,
        "address": None,
        "phone": None,
        "hours": None,
        "admission": None,
        "closed": None,
        "parking": None,
        "homepage": None,
        "detail_parse_status": "PARSED",
    }
    try:
        html = html_bytes.decode("utf-8", errors="replace")
    except Exception:
        result["detail_parse_status"] = "DECODE_FAILED"
        return result

    result["name_ko"] = extract_name_from_detail(html)

    result["address"] = extract_label_value(html, "주소")
    # Phone: label-based only — global regex fallback omitted to avoid picking up
    # the site-wide general contact number that appears in the page header.
    result["phone"] = (
        extract_label_value(html, "전화번호") or
        extract_label_value(html, "전화") or
        extract_label_value(html, "연락처")
    )

    # Hours: try labeled fields first; fall back to 요약정보 dd which contains
    # free-text hours like "이용시간 : 09:30-19:00" on gyeongju.go.kr
    result["hours"] = (
        extract_label_value(html, "이용시간") or
        extract_label_value(html, "운영시간") or
        extract_label_value(html, "관람시간") or
        extract_label_value(html, "요약정보")
    )
    result["admission"] = (
        extract_label_value(html, "입장료") or
        extract_label_value(html, "관람료")
    )
    result["closed"] = (
        extract_label_value(html, "휴무일") or
        extract_label_value(html, "휴관일") or
        extract_label_value(html, "정기휴일")
    )
    result["parking"] = (
        extract_label_value(html, "주차정보") or
        extract_label_value(html, "주차")
    )
    # External homepage (not gyeongju.go.kr itself)
    hp_m = re.search(
        r'href=["\']((https?://(?!(?:www\.)?gyeongju\.go\.kr)[^"\']+))["\']',
        html
    )
    result["homepage"] = hp_m.group(1) if hp_m else None

    # Sanity: if parse produced nothing meaningful, note it
    filled = sum(1 for v in result.values() if v and v not in ("PARSED",))
    if filled == 0:
        result["detail_parse_status"] = "PARSE_EMPTY"

    return result


def parse_event_detail(html_bytes: bytes) -> dict:
    """
    Parse event detail page. Returns dict with fields.
    Dates stored as ISO strings, never in opening_hours.
    con_uid is NOT generated here — caller supplies it.
    """
    result = {
        "name_ko": None,
        "event_type": None,
        "start_date": None,
        "end_date": None,
        "venue": None,
        "venue_address": None,
        "organizer": None,
        "sponsor": None,
        "contact": None,
        "external_url": None,
        "cancelled": None,
        "detail_parse_status": "PARSED",
    }
    try:
        html = html_bytes.decode("utf-8", errors="replace")
    except Exception:
        result["detail_parse_status"] = "DECODE_FAILED"
        return result

    result["name_ko"] = extract_name_from_detail(html)

    # Event type from tag markers (e.g., #전시, #축제)
    type_hits = re.findall(r"#\s*(축제|행사|공연|전시|교육|체험|기타)", html)
    if type_hits:
        result["event_type"] = type_hits[0]

    # Period: try label extraction first
    period_raw = (
        extract_label_value(html, "행사기간") or
        extract_label_value(html, "기간") or
        extract_label_value(html, "일정") or
        extract_label_value(html, "행사일정")
    )
    if period_raw:
        parts = re.split(r"~|–", period_raw, maxsplit=1)
        if len(parts) >= 2:
            result["start_date"] = parse_korean_date(parts[0])
            result["end_date"] = parse_korean_date(parts[1])
        else:
            result["start_date"] = parse_korean_date(parts[0])
    else:
        # Inline date pattern: "2026. 6. 30.(화) ~ 2026. 10. 18.(일)"
        dm = re.search(
            r"(\d{4}\.\s*\d{1,2}\.\s*\d{1,2}[^\n~]{0,20}?)\s*~\s*(\d{4}\.\s*\d{1,2}\.\s*\d{1,2})",
            html
        )
        if dm:
            result["start_date"] = parse_korean_date(dm.group(1))
            result["end_date"] = parse_korean_date(dm.group(2))

    result["venue"] = (
        extract_label_value(html, "장소") or
        extract_label_value(html, "행사장소") or
        extract_label_value(html, "개최장소")
    )
    result["venue_address"] = extract_label_value(html, "주소")
    result["organizer"] = (
        extract_label_value(html, "주최") or
        extract_label_value(html, "주최주관")
    )
    result["sponsor"] = extract_label_value(html, "주관")
    result["contact"] = (
        extract_label_value(html, "문의") or
        extract_label_value(html, "관람문의") or
        extract_label_value(html, "연락처") or
        extract_label_value(html, "문의처")
    )

    # External official URL (not gyeongju.go.kr)
    ext_m = re.search(
        r'href=["\']((https?://(?!(?:www\.)?gyeongju\.go\.kr)[^"\']+))["\']',
        html
    )
    result["external_url"] = ext_m.group(1) if ext_m else None

    # Cancellation flag
    if any(kw in html for kw in ["취소됨", "취소되었", "행사취소", "공연취소", "연기"]):
        result["cancelled"] = True

    return result


def parse_cultural_guide_sites(html_bytes: bytes) -> list:
    """
    Dynamically extract cultural guide sites from mnu_uid=2262 page.

    Confirmed HTML structure (2026-08-05):
      <table>
        <thead><tr><th>사적지명</th><th>해설사 배치</th>…</tr></thead>
        <tbody>
          <tr>
            <th scope="row">대릉원</th>        ← site name in th[scope=row]
            <td>한국어 2명/…</td>             ← guide assignment
            <td rowspan="5">10:00~17:00</td> ← hours (rowspan means absent in later rows)
            <td rowspan="17">매시간 1회…</td> ← schedule (rowspan)
          </tr>
          …
        </tbody>
      </table>

    Strategy: extract all <th scope="row"> elements → site names.
    Fallback: extract names from <caption> parenthetical list.
    """
    try:
        html = html_bytes.decode("utf-8", errors="replace")
    except Exception:
        return []

    sites = []
    seen: set = set()

    # Strategy 1: th[scope="row"] — confirmed structure for gyeongju.go.kr mnu_uid=2262
    for m in re.finditer(
        r'<th[^>]+scope=["\']row["\'][^>]*>(.*?)</th>',
        html, re.DOTALL | re.IGNORECASE
    ):
        name_raw = re.sub(r"<[^>]+>", "", m.group(1))
        name_raw = re.sub(r"\s+", " ", name_raw).strip()
        if not name_raw or len(name_raw) < 2 or len(name_raw) > 40:
            continue
        # Skip column headers that accidentally have scope="row"
        if name_raw in ("사적지명", "구분", "장소"):
            continue
        if name_raw in seen:
            continue
        seen.add(name_raw)
        # Attempt to find guide assignment from the same row's <td>
        row_m = re.search(
            rf'<th[^>]+scope=["\']row["\'][^>]*>{re.escape(m.group(1))}</th>(.*?)</tr>',
            html, re.DOTALL | re.IGNORECASE
        )
        guide_assignment = None
        if row_m:
            first_td = re.search(r"<td[^>]*>(.*?)</td>", row_m.group(1), re.DOTALL)
            if first_td:
                guide_raw = re.sub(r"<[^>]+>", " ", first_td.group(1))
                guide_raw = re.sub(r"\s+", " ", guide_raw).strip()
                if guide_raw and guide_raw not in ("해설사 배치", "-"):
                    guide_assignment = guide_raw

        sites.append({
            "name_ko": name_raw,
            "guide_assignment": guide_assignment,
            "source": "th_scope_row_dynamic",
        })

    # Strategy 2: fallback — extract names from <caption> parenthetical list
    if len(sites) < 5:
        cap_m = re.search(r"<caption[^>]*>(.*?)</caption>", html, re.DOTALL | re.IGNORECASE)
        if cap_m:
            cap_text = re.sub(r"<[^>]+>", "", cap_m.group(1))
            names_m = re.search(r"사적지명\(([^)]+)\)", cap_text)
            if names_m:
                for name in names_m.group(1).split(","):
                    name = re.sub(r"[-舊·\s]+", " ", name).strip()
                    # Strip parenthetical like "舊 괘릉"
                    name = re.split(r"[-]", name)[0].strip()
                    if name and name not in seen and len(name) >= 2:
                        seen.add(name)
                        sites.append({"name_ko": name, "source": "caption_dynamic"})

    return sites


def discover_monthly_rec_nav(html_bytes: bytes) -> list:
    """
    Discover navigation links to other months from monthly rec page.
    Returns list of {mnu_uid, label, url} dicts (excluding current page mnu_uid).
    Limits to 12 months to avoid unbounded collection.
    """
    nav_items = []
    seen_mnu = set()
    seen_mnu.add(MONTHLY_REC_MNU_UID)  # exclude self

    # Find links with mnu_uid in the 4000-5000 range (monthly rec pages)
    for href, text in extract_links(html_bytes):
        m = re.search(r"mnu_uid=(\d+)", href)
        if not m:
            continue
        mnu_uid = int(m.group(1))
        if mnu_uid in seen_mnu:
            continue
        # Monthly rec pages are typically in the 4000-5000 range
        if not (3800 < mnu_uid < 5500):
            continue
        # Prefer links that have year/month text nearby
        label_text = text.strip()
        if not label_text or len(label_text) > 50:
            continue
        seen_mnu.add(mnu_uid)
        url = f"{TOUR_URL}?mnu_uid={mnu_uid}" if not href.startswith("http") else href
        nav_items.append({"mnu_uid": mnu_uid, "label": label_text, "url": url})
        if len(nav_items) >= 12:
            break

    return nav_items


def parse_monthly_rec_content(html_bytes: bytes, source_url: str, mnu_uid: int) -> dict:
    """
    Parse monthly recommendation page.
    Extracts year, month, theme, place names with order, and place links.
    Does NOT mix page-level and place-level records.
    Year/month only from page content — never estimated.
    """
    rec = {
        "source_url": source_url,
        "mnu_uid": mnu_uid,
        "year": None,
        "month": None,
        "theme": None,
        "places": [],
        "place_links": [],
        "navigation_months": [],
        "parse_status": "PARSED",
    }
    try:
        html = html_bytes.decode("utf-8", errors="replace")
    except Exception:
        rec["parse_status"] = "DECODE_FAILED"
        return rec

    # Year/month from text: "2026년 8월" or "8월 경주"
    ym_m = re.search(r"(\d{4})년\s*(\d{1,2})월", html)
    if ym_m:
        rec["year"] = int(ym_m.group(1))
        rec["month"] = int(ym_m.group(2))
    else:
        month_m = re.search(r"(\d{1,2})월\s+경주", html)
        if month_m:
            rec["month"] = int(month_m.group(1))
        # year from <title> or meta
        year_m = re.search(r"20\d{2}", html)
        if year_m and not rec["year"]:
            rec["year"] = int(year_m.group(0))

    # Theme: first h2 or h3 in main content area
    for pat in [
        r'<h2[^>]*class="[^"]*(?:tit|title|subject)[^"]*"[^>]*>([^<]{5,100})</h2>',
        r'<h2[^>]*>([^<]{5,100})</h2>',
        r'<h3[^>]*>([^<]{5,100})</h3>',
    ]:
        th_m = re.search(pat, html)
        if th_m:
            rec["theme"] = th_m.group(1).strip()
            break

    # Place names: h3/h4 headings (article-style content)
    places = []
    seen_places = set()
    for m in re.finditer(r"<h[34][^>]*>([^<]{2,60})</h[34]>", html):
        name = m.group(1).strip()
        if name and name not in seen_places and len(name) >= 2:
            seen_places.add(name)
            places.append({"name": name, "order": len(places) + 1})
    # Fallback: strong tags if fewer than 3 places found
    if len(places) < 3:
        for m in re.finditer(r"<strong[^>]*>([^<]{3,50})</strong>", html):
            name = m.group(1).strip()
            if name and name not in seen_places and not re.match(r"^\d", name):
                seen_places.add(name)
                places.append({"name": name, "order": len(places) + 1})
    rec["places"] = places

    # Official links: area_uid links to actual attractions
    place_links = []
    seen_area = set()
    for href, _ in extract_links(html_bytes):
        if "area_uid=" in href:
            am = re.search(r"area_uid=(\d+)", href)
            if am and am.group(1) not in seen_area:
                seen_area.add(am.group(1))
                place_links.append({
                    "area_uid": int(am.group(1)),
                    "url": make_absolute_url(href),
                })
    rec["place_links"] = place_links

    # Navigation to other months
    rec["navigation_months"] = discover_monthly_rec_nav(html_bytes)

    return rec


# ──────────────────────────────────────────────────────────────
# Collection functions
# ──────────────────────────────────────────────────────────────

def collect_attractions(args, _out_dir: Path, snap: dict) -> list:
    """권역별 관광지 목록 + 상세 페이지 수집 (B1: detail_fetched=True)."""
    records = []

    for region in REGIONS:
        if args.max_items and len(records) >= args.max_items:
            break
        mnu_uid = region["mnu_uid"]
        code_uid = region["code_uid"]
        known_total = region["known_total"]
        max_pages = math.ceil(known_total / ITEMS_PER_PAGE) + 1  # +1 safety

        region_items = []
        for page_no in range(1, max_pages + 1):
            if args.max_pages and page_no > args.max_pages:
                break
            if args.max_items and len(records) + len(region_items) >= args.max_items:
                break

            url = (f"{TOUR_URL}?mnu_uid={mnu_uid}&code_uid={code_uid}"
                   f"&pageNo={page_no}&listType=&sortKwd=&srchKwd=")
            print(f"  [attractions/{region['key']}] list p{page_no}: {url}")

            if args.dry_run:
                snap["dry_run_urls"].append(url)
                break

            body, status, err = http_get(url, args.timeout, args.retries, args.delay)
            snap["requested_urls"].append(url)

            if body is None:
                print(f"    FAIL status={status} err={err}")
                snap["failed_urls"].append({"url": url, "status": status, "error": err})
                break

            snap["success_urls"].append(url)
            snap["http_status_dist"][str(status)] = snap["http_status_dist"].get(str(status), 0) + 1

            items = parse_attraction_links(body, mnu_uid)
            if not items:
                print(f"    no items found → end of region")
                break

            total_count = extract_total_count(body)
            if total_count and page_no == 1:
                region["actual_total"] = total_count

            new_items = [it for it in items if it["area_uid"] not in {r["area_uid"] for r in region_items}]
            region_items.extend(new_items)
            print(f"    found {len(new_items)} new items (page total: {len(region_items)})")
            time.sleep(args.delay)

        # Fetch detail pages for each item in region (B1)
        collected_at = now_iso()
        for item in region_items:
            if args.max_items and len(records) >= args.max_items:
                break

            rec = {
                "source_type": "gyeongju_web",
                "content_type": "attractions",
                "region_key": region["key"],
                "region_name_ko": region["name_ko"],
                "mnu_uid": item["mnu_uid"],
                "code_uid": item["code_uid"],
                "area_uid": item["area_uid"],
                "name_ko_list": item.get("name_ko_list"),  # may contain address mix
                "source_url": item["list_url"],
                "detail_url": item["detail_url"],
                "detail_fetched": False,
                "detail_parse_status": None,
                "name_ko": None,
                "address": None,
                "phone": None,
                "hours": None,
                "admission": None,
                "closed": None,
                "parking": None,
                "homepage": None,
                "collected_at": collected_at,
                "collector_version": VERSION,
            }

            if args.dry_run:
                snap["dry_run_urls"].append(item["detail_url"])
                records.append(rec)
                continue

            # Fetch and parse detail page
            print(f"  [attractions/{region['key']}] detail area_uid={item['area_uid']}: {item['detail_url']}")
            dbody, dstatus, derr = http_get(item["detail_url"], args.timeout, args.retries, args.delay)
            snap["requested_urls"].append(item["detail_url"])
            snap["http_status_dist"][str(dstatus)] = snap["http_status_dist"].get(str(dstatus), 0) + 1

            if dbody is not None:
                snap["success_urls"].append(item["detail_url"])
                detail = parse_attraction_detail(dbody)
                rec["detail_fetched"] = True
                rec["detail_http_status"] = dstatus
                rec["detail_parse_status"] = detail.get("detail_parse_status")
                rec["name_ko"] = detail.get("name_ko")
                rec["address"] = detail.get("address")
                rec["phone"] = detail.get("phone")
                rec["hours"] = detail.get("hours")
                rec["admission"] = detail.get("admission")
                rec["closed"] = detail.get("closed")
                rec["parking"] = detail.get("parking")
                rec["homepage"] = detail.get("homepage")
                print(f"    OK name={rec['name_ko']} addr={bool(rec['address'])} phone={bool(rec['phone'])} hours={bool(rec['hours'])}")
            else:
                snap["failed_urls"].append({"url": item["detail_url"], "status": dstatus, "error": derr})
                rec["detail_fetched"] = False
                rec["detail_http_status"] = dstatus
                rec["detail_parse_status"] = "FETCH_FAILED"
                print(f"    detail FAIL status={dstatus} err={derr}")

            records.append(rec)
            time.sleep(args.delay)

        if args.max_items and len(records) >= args.max_items:
            records = records[: args.max_items]
            break

    return records


def collect_monthly_recommendations(args, _out_dir: Path, snap: dict) -> list:
    """이달의 추천여행지 수집 (B4: 콘텐츠 파싱 + 다중월 내비게이션)."""
    records = []

    # Fetch first page to discover navigation
    first_url = f"{TOUR_URL}?mnu_uid={MONTHLY_REC_MNU_UID}"
    print(f"  [monthly-recommendations] primary {first_url}")

    if args.dry_run:
        snap["dry_run_urls"].append(first_url)
        return records

    body, status, err = http_get(first_url, args.timeout, args.retries, args.delay)
    snap["requested_urls"].append(first_url)

    if body is None:
        snap["failed_urls"].append({"url": first_url, "error": err})
        return records

    snap["success_urls"].append(first_url)
    snap["http_status_dist"][str(status)] = snap["http_status_dist"].get(str(status), 0) + 1

    # Parse content of first page
    rec = parse_monthly_rec_content(body, first_url, MONTHLY_REC_MNU_UID)
    rec["source_type"] = "gyeongju_web"
    rec["content_type"] = "monthly-recommendations"
    rec["collector_version"] = VERSION
    records.append(rec)
    print(f"    year={rec.get('year')} month={rec.get('month')} places={len(rec.get('places',[]))} links={len(rec.get('place_links',[]))}")

    # Discover additional months (up to 2 extra for sample; full collection uses --max-items)
    nav = rec.get("navigation_months", [])
    extra_limit = 1 if args.max_items and args.max_items <= 2 else min(2, len(nav))
    for nav_item in nav[:extra_limit]:
        if args.max_items and len(records) >= args.max_items:
            break
        nav_url = nav_item["url"]
        nav_mnu = nav_item["mnu_uid"]
        print(f"  [monthly-recommendations] nav {nav_url}")
        time.sleep(args.delay)
        nbody, nstatus, nerr = http_get(nav_url, args.timeout, args.retries, args.delay)
        snap["requested_urls"].append(nav_url)
        if nbody is None:
            snap["failed_urls"].append({"url": nav_url, "error": nerr})
            continue
        snap["success_urls"].append(nav_url)
        snap["http_status_dist"][str(nstatus)] = snap["http_status_dist"].get(str(nstatus), 0) + 1
        nrec = parse_monthly_rec_content(nbody, nav_url, nav_mnu)
        nrec["source_type"] = "gyeongju_web"
        nrec["content_type"] = "monthly-recommendations"
        nrec["collector_version"] = VERSION
        records.append(nrec)
        print(f"    year={nrec.get('year')} month={nrec.get('month')} places={len(nrec.get('places',[]))}")

    return records


def collect_courses(args, _out_dir: Path, snap: dict) -> list:
    """여행코스 수집 (5개 정적 페이지)."""
    records = []
    for course in COURSES:
        if args.max_items and len(records) >= args.max_items:
            break
        url = f"{TOUR_URL}?mnu_uid={course['mnu_uid']}"
        print(f"  [courses/{course['key']}] {url}")

        if args.dry_run:
            snap["dry_run_urls"].append(url)
            continue

        body, status, err = http_get(url, args.timeout, args.retries, args.delay)
        snap["requested_urls"].append(url)
        if body is None:
            snap["failed_urls"].append({"url": url, "error": err})
            continue

        snap["success_urls"].append(url)
        snap["http_status_dist"][str(status)] = snap["http_status_dist"].get(str(status), 0) + 1
        title = extract_title(body)

        attraction_links = [
            {"area_uid": int(m.group(1)), "detail_url": make_absolute_url(href)}
            for href, _ in extract_links(body)
            if "area_uid=" in href and (m := re.search(r"area_uid=(\d+)", href))
        ]
        seen = set()
        unique_links = []
        for lk in attraction_links:
            if lk["area_uid"] not in seen:
                seen.add(lk["area_uid"])
                unique_links.append(lk)

        rec = {
            "source_type": "gyeongju_web",
            "content_type": "courses",
            "course_key": course["key"],
            "course_name_ko": course["name_ko"],
            "mnu_uid": course["mnu_uid"],
            "page_title": title,
            "source_url": url,
            "waypoint_count": len(unique_links),
            "waypoints": unique_links,
            "body_sha256": sha256_bytes(body),
            "body_size_bytes": len(body),
            "collected_at": now_iso(),
            "collector_version": VERSION,
        }
        records.append(rec)
        time.sleep(args.delay)

    return records


def collect_heritage(args, _out_dir: Path, snap: dict) -> list:
    """세계문화유산 페이지 수집."""
    records = []
    for page in HERITAGE_PAGES:
        if args.max_items and len(records) >= args.max_items:
            break
        url = f"{TOUR_URL}?mnu_uid={page['mnu_uid']}"
        print(f"  [heritage/{page['key']}] {url}")

        if args.dry_run:
            snap["dry_run_urls"].append(url)
            continue

        body, status, err = http_get(url, args.timeout, args.retries, args.delay)
        snap["requested_urls"].append(url)
        if body is None:
            snap["failed_urls"].append({"url": url, "error": err})
            continue

        snap["success_urls"].append(url)
        snap["http_status_dist"][str(status)] = snap["http_status_dist"].get(str(status), 0) + 1
        title = extract_title(body)

        rec = {
            "source_type": "gyeongju_web",
            "content_type": "heritage",
            "heritage_key": page["key"],
            "heritage_name_ko": page["name_ko"],
            "mnu_uid": page["mnu_uid"],
            "page_title": title,
            "source_url": url,
            "body_sha256": sha256_bytes(body),
            "body_size_bytes": len(body),
            "collected_at": now_iso(),
            "collector_version": VERSION,
        }
        records.append(rec)
        time.sleep(args.delay)

    return records


def collect_cultural_guides(args, _out_dir: Path, snap: dict) -> list:
    """
    문화관광해설 수집 (B3: 동적 추출, KNOWN_GUIDE_SITES 하드코딩 제거).
    mnu_uid=2262 페이지에서 장소명·운영시간을 동적으로 파싱한다.
    """
    url = f"{TOUR_URL}?mnu_uid={CULTURAL_GUIDE_MNU_UID}"
    print(f"  [cultural-guides] {url}")
    records = []

    if args.dry_run:
        snap["dry_run_urls"].append(url)
        return records

    body, status, err = http_get(url, args.timeout, args.retries, args.delay)
    snap["requested_urls"].append(url)
    if body is None:
        snap["failed_urls"].append({"url": url, "error": err})
        return records

    snap["success_urls"].append(url)
    snap["http_status_dist"][str(status)] = snap["http_status_dist"].get(str(status), 0) + 1

    # Dynamic extraction from official page (B3)
    sites = parse_cultural_guide_sites(body)
    discovered_count = len(sites)
    print(f"    dynamically discovered {discovered_count} guide sites")

    rec = {
        "source_type": "gyeongju_web",
        "content_type": "cultural-guides",
        "mnu_uid": CULTURAL_GUIDE_MNU_UID,
        "source_url": url,
        "discovered_count": discovered_count,
        "reference_count": 17,
        "count_matches_reference": discovered_count == 17,
        "guide_sites": sites,
        "individual_site_pages": False,
        "service_type": "무료 문화관광 해설서비스",
        "supported_languages": "한국어·영어·일본어·중국어 (4개국어, 8개소 외국어 해설 배치)",
        "booking_mnu_uid": 2396,
        "booking_url": f"{TOUR_URL}?cmd=4&mnu_uid=2396",
        "note": (
            "mnu_uid=2262는 신청 안내 페이지. 장소명·운영시간이 표 형식으로 나열됨. "
            "각 개소별 상세 URL 없음. 예약은 mnu_uid=2396 경유. "
            f"발견 수={discovered_count}, 기준 수=17."
        ),
        "body_sha256": sha256_bytes(body),
        "body_size_bytes": len(body),
        "collected_at": now_iso(),
        "collector_version": VERSION,
    }
    records.append(rec)
    return records


def collect_events(args, _out_dir: Path, snap: dict) -> list:
    """
    행사·축제·공연·전시 수집 (B2: 상세 페이지 fetch + 날짜·장소·주최 파싱).
    날짜는 ISO 형식으로 저장. opening_hours 필드 사용 금지.
    공식 con_uid 없으면 임시 ID 생성 안 함 → 실패 목록에 기록.
    """
    as_of = args.as_of or now_iso()
    try:
        dt = datetime.fromisoformat(as_of.replace("Z", "+00:00"))
        year, month = dt.year, dt.month
    except Exception:
        dt = datetime.now(timezone.utc)
        year, month = dt.year, dt.month

    records = []
    no_id_items = []  # items without official con_uid

    # Collect up to 3 months: current + next 2
    for m_offset in range(3):
        if args.max_items and len(records) >= args.max_items:
            break
        cur_month = (month - 1 + m_offset) % 12 + 1
        cur_year = year + ((month - 1 + m_offset) // 12)
        url = (f"{TOUR_URL}?mnu_uid={EVENTS_MNU_UID}"
               f"&initYear={cur_year}&initMonth={cur_month:02d}&pageNo=1")
        print(f"  [events] {cur_year}-{cur_month:02d}: {url}")

        if args.dry_run:
            snap["dry_run_urls"].append(url)
            continue

        body, status, err = http_get(url, args.timeout, args.retries, args.delay)
        snap["requested_urls"].append(url)
        if body is None:
            snap["failed_urls"].append({"url": url, "error": err})
            continue

        snap["success_urls"].append(url)
        snap["http_status_dist"][str(status)] = snap["http_status_dist"].get(str(status), 0) + 1

        event_items = parse_event_links(body)
        print(f"    found {len(event_items)} events in list")

        collected_at = now_iso()
        for ev in event_items:
            if args.max_items and len(records) >= args.max_items:
                break

            con_uid = ev.get("con_uid")
            if not con_uid:
                # No official ID — record without con_uid in a separate list
                no_id_items.append({"list_url": url, "year": cur_year, "month": cur_month})
                continue

            rec = {
                "source_type": "gyeongju_web",
                "content_type": "events",
                "mnu_uid": EVENTS_MNU_UID,
                "con_uid": con_uid,
                "year_collected": cur_year,
                "month_collected": cur_month,
                "source_url": url,
                "detail_url": ev["detail_url"],
                "detail_fetched": False,
                "detail_parse_status": None,
                # Detail fields (populated after fetch)
                "name_ko": None,
                "event_type": None,
                "start_date": None,
                "end_date": None,
                "venue": None,
                "venue_address": None,
                "organizer": None,
                "sponsor": None,
                "contact": None,
                "external_url": None,
                "cancelled": None,
                "collected_at": collected_at,
                "collector_version": VERSION,
            }

            if args.dry_run:
                snap["dry_run_urls"].append(ev["detail_url"])
                records.append(rec)
                continue

            # Fetch and parse event detail page (B2)
            print(f"  [events] detail con_uid={con_uid}: {ev['detail_url']}")
            dbody, dstatus, derr = http_get(ev["detail_url"], args.timeout, args.retries, args.delay)
            snap["requested_urls"].append(ev["detail_url"])
            snap["http_status_dist"][str(dstatus)] = snap["http_status_dist"].get(str(dstatus), 0) + 1

            if dbody is not None:
                snap["success_urls"].append(ev["detail_url"])
                detail = parse_event_detail(dbody)
                rec["detail_fetched"] = True
                rec["detail_http_status"] = dstatus
                rec["detail_parse_status"] = detail.get("detail_parse_status")
                rec["name_ko"] = detail.get("name_ko")
                rec["event_type"] = detail.get("event_type")
                rec["start_date"] = detail.get("start_date")
                rec["end_date"] = detail.get("end_date")
                rec["venue"] = detail.get("venue")
                rec["venue_address"] = detail.get("venue_address")
                rec["organizer"] = detail.get("organizer")
                rec["sponsor"] = detail.get("sponsor")
                rec["contact"] = detail.get("contact")
                rec["external_url"] = detail.get("external_url")
                rec["cancelled"] = detail.get("cancelled")

                # Date inversion check
                if rec["start_date"] and rec["end_date"] and rec["start_date"] > rec["end_date"]:
                    rec["date_inversion_flag"] = True
                    print(f"    WARN date inversion: {rec['start_date']} > {rec['end_date']}")

                print(f"    OK name={rec['name_ko']} start={rec['start_date']} end={rec['end_date']} venue={bool(rec['venue'])}")
            else:
                snap["failed_urls"].append({"url": ev["detail_url"], "status": dstatus, "error": derr})
                rec["detail_fetched"] = False
                rec["detail_http_status"] = dstatus
                rec["detail_parse_status"] = "FETCH_FAILED"
                print(f"    detail FAIL status={dstatus} err={derr}")

            records.append(rec)
            time.sleep(args.delay)

        time.sleep(args.delay)

    # Save no-id items in snap for reporting
    if no_id_items:
        snap["events_no_id"] = no_id_items

    return records


# ──────────────────────────────────────────────────────────────
# Resume helpers
# ──────────────────────────────────────────────────────────────

def load_existing_records(out_file: Path) -> list:
    if not out_file.exists():
        return []
    records = []
    for line in out_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return records


# ──────────────────────────────────────────────────────────────
# Output helpers
# ──────────────────────────────────────────────────────────────

def write_jsonl(path: Path, records: list) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "\n".join(json.dumps(r, ensure_ascii=False) for r in records) + "\n",
        encoding="utf-8",
    )


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def build_summary(snap: dict, records: list, args, out_file: Path) -> dict:
    out_sha = sha256_bytes(out_file.read_bytes()) if out_file.exists() else None
    return {
        "source": "gyeongju.go.kr/tour",
        "collector": "gyeongju_culture_web_collect.py",
        "collector_version": VERSION,
        "content_type": args.content_type,
        "command": " ".join(sys.argv),
        "as_of": args.as_of or now_iso(),
        "collected_at": snap["started_at"],
        "finished_at": now_iso(),
        "requested_url_count": len(snap["requested_urls"]),
        "success_url_count": len(snap["success_urls"]),
        "failed_url_count": len(snap["failed_urls"]),
        "http_status_distribution": snap["http_status_dist"],
        "record_count": len(records),
        "output_file": str(out_file),
        "output_sha256": out_sha,
        "failed_urls": snap["failed_urls"],
        "dry_run": args.dry_run,
        "reproducibility_note": (
            "raw 수집은 수집 시각·사이트 상태에 따라 달라질 수 있음. "
            "같은 raw snapshot + 같은 --as-of + 같은 mapping 규칙 → 정규화 단계만 byte-identical."
        ),
    }


# ──────────────────────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(
        prog="gyeongju_culture_web_collect.py",
        description=(
            f"경주문화관광 웹 수집기 v{VERSION}\n"
            "원천: https://www.gyeongju.go.kr/tour\n"
            f"수집 대상: {', '.join(CONTENT_TYPES)}\n"
            "v2.0.0: 상세 페이지 파서 추가 (관광지·행사), 문화해설 동적 추출, 추천여행지 파싱"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("--content-type", required=True, choices=CONTENT_TYPES,
                   help="수집할 콘텐츠 유형")
    p.add_argument("--out", required=True, help="출력 디렉터리 경로")
    p.add_argument("--max-pages", type=int, default=None,
                   help="페이지당 최대 페이지 수 (기본: 무제한)")
    p.add_argument("--max-items", type=int, default=None,
                   help="최대 수집 레코드 수 (기본: 무제한)")
    p.add_argument("--delay", type=float, default=1.0,
                   help="요청 간 delay (초, 기본: 1.0)")
    p.add_argument("--timeout", type=int, default=15,
                   help="HTTP 요청 타임아웃 (초, 기본: 15)")
    p.add_argument("--retries", type=int, default=3,
                   help="실패 시 재시도 횟수 (기본: 3)")
    p.add_argument("--as-of", default=None,
                   help="수집 기준 시각 (ISO-8601. 예: 2026-08-05T00:53:00Z)")
    p.add_argument("--resume", action="store_true",
                   help="이전 수집 결과가 있으면 이어서 수집")
    p.add_argument("--dry-run", action="store_true",
                   help="실제 HTTP 요청 없이 URL 목록만 출력")
    return p.parse_args()


def main():
    args = parse_args()
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    out_file = out_dir / f"{args.content_type}-raw.jsonl"
    summary_file = out_dir / f"{args.content_type}-snapshot-summary.json"

    snap: dict = {
        "started_at": now_iso(),
        "requested_urls": [],
        "success_urls": [],
        "failed_urls": [],
        "http_status_dist": {},
        "dry_run_urls": [],
    }

    existing_records: list = []
    if args.resume and out_file.exists():
        existing_records = load_existing_records(out_file)
        print(f"[resume] {len(existing_records)} existing records found in {out_file}")

    print(f"[gyeongju_culture_web_collect v{VERSION}] content-type={args.content_type}"
          f" dry-run={args.dry_run} max-items={args.max_items}")

    dispatch = {
        "attractions":             collect_attractions,
        "monthly-recommendations": collect_monthly_recommendations,
        "courses":                 collect_courses,
        "heritage":                collect_heritage,
        "cultural-guides":         collect_cultural_guides,
        "events":                  collect_events,
    }

    new_records = dispatch[args.content_type](args, out_dir, snap)

    if args.resume:
        existing_area_uids = {r.get("area_uid") for r in existing_records if r.get("area_uid")}
        new_records = [r for r in new_records if r.get("area_uid") not in existing_area_uids]
        all_records = existing_records + new_records
    else:
        all_records = new_records

    if not args.dry_run:
        write_jsonl(out_file, all_records)
        print(f"[output] {len(all_records)} records → {out_file}")
    else:
        print(f"[dry-run] would write {len(snap['dry_run_urls'])} URL requests")
        for u in snap["dry_run_urls"]:
            print(f"  {u}")

    summary = build_summary(snap, all_records, args, out_file)
    write_json(summary_file, summary)
    print(f"[summary] → {summary_file}")

    if snap["failed_urls"]:
        print(f"[warn] {len(snap['failed_urls'])} failed URLs")
        for fu in snap["failed_urls"]:
            print(f"  FAIL {fu['url']} → {fu.get('error','')}")

    sys.exit(0)


if __name__ == "__main__":
    main()
