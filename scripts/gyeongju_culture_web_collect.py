#!/usr/bin/env python3
"""
경주문화관광 웹 수집기 v1.0.0
원천: https://www.gyeongju.go.kr/tour
수집 대상: attractions | monthly-recommendations | courses | heritage | cultural-guides | events
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
from urllib.parse import urlencode, urljoin, urlparse, parse_qs
from urllib.request import Request, urlopen

VERSION = "1.0.0"
BASE_URL = "https://www.gyeongju.go.kr"
TOUR_URL = f"{BASE_URL}/tour/page.do"
UA = "Mozilla/5.0 (compatible; KoreaMate-Collector/1.0; +https://github.com/skywarrior1003-max/korea-mate)"
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

EVENTS_MNU_UID     = 2393
MONTHLY_REC_MNU_UID = 4185
CULTURAL_GUIDE_MNU_UID = 2262


# ──────────────────────────────────────────────────────────────
# HTTP helpers
# ──────────────────────────────────────────────────────────────

def http_get(url: str, timeout: int, retries: int, delay: float) -> tuple[bytes | None, int, str]:
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
        self.links: list[tuple[str, str]] = []
        self._href: str | None = None
        self._buf: list[str] = []

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


def extract_links(html_bytes: bytes) -> list[tuple[str, str]]:
    try:
        html = html_bytes.decode("utf-8", errors="replace")
    except Exception:
        return []
    p = LinkParser()
    p.feed(html)
    return p.links


def extract_total_count(html_bytes: bytes) -> int | None:
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


def parse_attraction_links(html_bytes: bytes, mnu_uid: int) -> list[dict]:
    """Extract attraction items from a list page."""
    links = extract_links(html_bytes)
    results = []
    seen = set()
    for href, text in links:
        # Must match detail pattern: area_uid=N&cmd=2 (or cmd=2 with area_uid)
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
            "name_ko": text if text else None,
            "list_url": abs_url,
            "detail_url": f"{TOUR_URL}?mnu_uid={mnu_uid}&code_uid={code_uid}&area_uid={area_uid}&cmd=2",
        })
    return results


def parse_event_links(html_bytes: bytes) -> list[dict]:
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
            "name_ko": text if text else None,
            "detail_url": abs_url,
        })
    return results


# ──────────────────────────────────────────────────────────────
# Collection functions
# ──────────────────────────────────────────────────────────────

def collect_attractions(args, out_dir: Path, snap: dict) -> list[dict]:
    """권역별 관광지 목록 수집."""
    records = []
    failed_urls = []
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
            print(f"  [attractions/{region['key']}] page {page_no}: {url}")

            if args.dry_run:
                print(f"    [DRY-RUN] skipping fetch")
                snap["dry_run_urls"].append(url)
                break

            body, status, err = http_get(url, args.timeout, args.retries, args.delay)
            snap["requested_urls"].append(url)

            if body is None:
                print(f"    FAIL status={status} err={err}")
                failed_urls.append({"url": url, "status": status, "error": err})
                snap["failed_urls"].append({"url": url, "error": err})
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

        collected_at = now_iso()
        for item in region_items:
            rec = {
                "source_type": "gyeongju_web",
                "content_type": "attractions",
                "region_key": region["key"],
                "region_name_ko": region["name_ko"],
                "mnu_uid": item["mnu_uid"],
                "code_uid": item["code_uid"],
                "area_uid": item["area_uid"],
                "name_ko": item.get("name_ko"),
                "source_url": item["list_url"],
                "detail_url": item["detail_url"],
                "detail_fetched": False,
                "collected_at": collected_at,
                "collector_version": VERSION,
            }
            records.append(rec)

        if args.max_items and len(records) >= args.max_items:
            records = records[: args.max_items]
            break

    return records


def collect_monthly_recommendations(args, out_dir: Path, snap: dict) -> list[dict]:
    """이달의 추천여행지 수집 (단일 페이지)."""
    url = f"{TOUR_URL}?mnu_uid={MONTHLY_REC_MNU_UID}"
    print(f"  [monthly-recommendations] {url}")
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
    title = extract_title(body)

    rec = {
        "source_type": "gyeongju_web",
        "content_type": "monthly-recommendations",
        "mnu_uid": MONTHLY_REC_MNU_UID,
        "page_title": title,
        "source_url": url,
        "body_sha256": sha256_bytes(body),
        "body_size_bytes": len(body),
        "collected_at": now_iso(),
        "collector_version": VERSION,
    }
    records.append(rec)
    return records


def collect_courses(args, out_dir: Path, snap: dict) -> list[dict]:
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

        # Extract attraction links mentioned in the course page
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


def collect_heritage(args, out_dir: Path, snap: dict) -> list[dict]:
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


def collect_cultural_guides(args, out_dir: Path, snap: dict) -> list[dict]:
    """문화관광해설 17개소 목록 수집."""
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

    # Known 17개소 (verified from mnu_uid=2262 page 2026-08-04)
    KNOWN_GUIDE_SITES = [
        "대릉원", "불국사", "석굴암", "양동마을", "분황사",
        "첨성대", "동궁과월지", "옥산서원", "김유신묘", "무열왕릉",
        "포석정지", "원성왕릉", "오릉", "감은사지",
        "동리목월문학관", "향교", "경주읍성",
    ]

    rec = {
        "source_type": "gyeongju_web",
        "content_type": "cultural-guides",
        "mnu_uid": CULTURAL_GUIDE_MNU_UID,
        "source_url": url,
        "guide_sites_count": 17,
        "guide_sites": KNOWN_GUIDE_SITES,
        "individual_site_pages": False,
        "note": ("mnu_uid=2262는 신청 안내 페이지. 17개소 목록이 페이지 내 나열됨. "
                 "각 개소별 상세 URL 없음. 예약은 mnu_uid=2396 경유."),
        "booking_mnu_uid": 2396,
        "body_sha256": sha256_bytes(body),
        "body_size_bytes": len(body),
        "collected_at": now_iso(),
        "collector_version": VERSION,
    }
    records.append(rec)
    return records


def collect_events(args, out_dir: Path, snap: dict) -> list[dict]:
    """행사·축제·공연·전시 수집."""
    as_of = args.as_of or now_iso()
    # Parse year/month from as_of
    try:
        dt = datetime.fromisoformat(as_of.replace("Z", "+00:00"))
        year, month = dt.year, dt.month
    except Exception:
        dt = datetime.now(timezone.utc)
        year, month = dt.year, dt.month

    records = []
    failed_urls = []

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

        events = parse_event_links(body)
        collected_at = now_iso()
        for ev in events:
            if args.max_items and len(records) >= args.max_items:
                break
            rec = {
                "source_type": "gyeongju_web",
                "content_type": "events",
                "mnu_uid": EVENTS_MNU_UID,
                "con_uid": ev["con_uid"],
                "name_ko": ev.get("name_ko"),
                "year": cur_year,
                "month": cur_month,
                "source_url": url,
                "detail_url": ev["detail_url"],
                "collected_at": collected_at,
                "collector_version": VERSION,
            }
            records.append(rec)

        time.sleep(args.delay)

    return records


# ──────────────────────────────────────────────────────────────
# Resume helpers
# ──────────────────────────────────────────────────────────────

def load_existing_records(out_file: Path) -> list[dict]:
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

def write_jsonl(path: Path, records: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "\n".join(json.dumps(r, ensure_ascii=False) for r in records) + "\n",
        encoding="utf-8",
    )


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def build_summary(snap: dict, records: list[dict], args, out_file: Path) -> dict:
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
            f"수집 대상: {', '.join(CONTENT_TYPES)}"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument(
        "--content-type",
        required=True,
        choices=CONTENT_TYPES,
        help="수집할 콘텐츠 유형",
    )
    p.add_argument("--out", required=True, help="출력 디렉터리 경로")
    p.add_argument(
        "--max-pages",
        type=int,
        default=None,
        help="페이지당 최대 페이지 수 (기본: 무제한)",
    )
    p.add_argument(
        "--max-items",
        type=int,
        default=None,
        help="최대 수집 레코드 수 (기본: 무제한)",
    )
    p.add_argument(
        "--delay",
        type=float,
        default=1.0,
        help="요청 간 delay (초, 기본: 1.0)",
    )
    p.add_argument(
        "--timeout",
        type=int,
        default=15,
        help="HTTP 요청 타임아웃 (초, 기본: 15)",
    )
    p.add_argument(
        "--retries",
        type=int,
        default=3,
        help="실패 시 재시도 횟수 (기본: 3)",
    )
    p.add_argument(
        "--as-of",
        default=None,
        help="수집 기준 시각 (ISO-8601, 정규화 재현성용. 예: 2026-08-04T12:00:00Z)",
    )
    p.add_argument(
        "--resume",
        action="store_true",
        help="이전 수집 결과가 있으면 이어서 수집",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="실제 HTTP 요청 없이 URL 목록만 출력",
    )
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

    existing_records: list[dict] = []
    if args.resume and out_file.exists():
        existing_records = load_existing_records(out_file)
        print(f"[resume] {len(existing_records)} existing records found in {out_file}")

    print(f"[gyeongju_culture_web_collect] content-type={args.content_type}"
          f" dry-run={args.dry_run} max-items={args.max_items}")

    dispatch = {
        "attractions":            collect_attractions,
        "monthly-recommendations": collect_monthly_recommendations,
        "courses":                collect_courses,
        "heritage":               collect_heritage,
        "cultural-guides":        collect_cultural_guides,
        "events":                 collect_events,
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
        print(f"[dry-run] URLs planned:")
        for u in snap["dry_run_urls"]:
            print(f"  {u}")

    summary = build_summary(snap, all_records, args, out_file)
    write_json(summary_file, summary)
    print(f"[summary] → {summary_file}")

    if snap["failed_urls"]:
        print(f"[warn] {len(snap['failed_urls'])} failed URLs")
        for fu in snap["failed_urls"]:
            print(f"  FAIL {fu['url']} → {fu['error']}")

    sys.exit(0)


if __name__ == "__main__":
    main()
