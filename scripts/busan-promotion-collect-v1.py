"""
busan-promotion-collect-v1.py
TASK-BUSAN-PROMOTION-DATASET-COLLECT-FINALIZE-V1

부산 프로모션 데이터 수집 스크립트.
공식 소스(VB-EVENT-SURVEY, BTO-PRESS, VB-SHOWS-EVENTS)에서
B2C 프로모션 항목을 수집하여 promotions JSON 파일을 생성한다.

사용 방법:
  python busan-promotion-collect-v1.py --source vb-event [--pages 1-3]
  python busan-promotion-collect-v1.py --source bto-press [--pages 1-5]
  python busan-promotion-collect-v1.py --source vb-shows --months 2026-08,2026-09
  python busan-promotion-collect-v1.py --dry-run   # 수집 계획만 출력

제약:
  - 뉴스 기사 단독 근거 금지
  - B2B 항목 제외
  - candidates/source_facts 수정 없음
  - push 없음
  - 원자적 파일 쓰기 (.tmp → os.replace)
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.request
import urllib.error
from datetime import date, datetime
from html.parser import HTMLParser

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPORT_DIR = os.path.join(REPO_ROOT, "data", "tourapi", "reports", "busan")
TODAY = date.today()
REFERENCE_DATE = str(TODAY)
REQUEST_DELAY_S = 1.5  # 과도한 요청 방지


# ── 소스 설정 ──────────────────────────────────────────────────────────────
VB_EVENT_LIST_URL = (
    "https://www.visitbusan.net/en/index.do?menuCd=DOM_000000304002000000&pageIndex={page}"
)
VB_EVENT_DETAIL_URL = (
    "https://www.visitbusan.net/en/index.do?menuCd=DOM_000000304002001000&ueb_seq={seq}"
)
BTO_LIST_URL = (
    "https://bto.or.kr/kor/CMS/Board/Board.do?robot=Y&mCode=MN047&page={page}"
)
BTO_DETAIL_URL = (
    "https://bto.or.kr/kor/CMS/Board/Board.do?mCode=MN047&mode=view&mgr_seq=22&board_seq={seq}"
)
VB_SHOWS_URL = (
    "https://www.visitbusan.net/en/index.do?menuCd=DOM_000000304010000000&year={year}&month={month}"
)

BTO_B2C_KEYWORDS = ["프로모션", "할인", "쿠폰", "혜택", "패스", "이벤트", "외국인", "관광객"]
BTO_B2B_KEYWORDS = ["모집", "입찰", "용역", "채용", "공모", "사업자", "협약", "협력", "업무협약"]

ENDING_SOON_DAYS = 7


# ── 유틸리티 ───────────────────────────────────────────────────────────────
class LinkParser(HTMLParser):
    """a[href] 태그에서 URL 추출"""

    def __init__(self):
        super().__init__()
        self.links = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            attrs_dict = dict(attrs)
            if href := attrs_dict.get("href"):
                self.links.append(href)


def fetch_html(url: str, delay: bool = True) -> str | None:
    """단순 GET 요청. 실패 시 None 반환."""
    if delay:
        time.sleep(REQUEST_DELAY_S)
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; KoreaMate-DataBot/1.0; +https://koremate.com)",
        "Accept-Language": "en-US,en;q=0.9,ko;q=0.8",
    }
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status == 200:
                charset = "utf-8"
                ct = resp.headers.get("Content-Type", "")
                if "charset=" in ct:
                    charset = ct.split("charset=")[-1].strip()
                return resp.read().decode(charset, errors="replace")
    except urllib.error.HTTPError as e:
        print(f"  HTTP {e.code}: {url}", file=sys.stderr)
    except Exception as e:
        print(f"  Error fetching {url}: {e}", file=sys.stderr)
    return None


def atomic_write(path: str, data: dict) -> None:
    """tmp 파일로 쓴 후 rename — 중간 오류 시 원본 보존"""
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)
    print(f"  Written: {os.path.basename(path)}")


def compute_status(start: str | None, end: str | None) -> str:
    if not start or not end:
        return "UNVERIFIED"
    try:
        s = date.fromisoformat(start)
        e = date.fromisoformat(end)
        if e < TODAY:
            return "EXPIRED"
        if s > TODAY:
            return "UPCOMING"
        if (e - TODAY).days <= ENDING_SOON_DAYS:
            return "ENDING_SOON"
        return "ACTIVE"
    except ValueError:
        return "UNVERIFIED"


# ── VB-EVENT-SURVEY 수집 ───────────────────────────────────────────────────
def parse_vb_event_list(html: str) -> list[dict]:
    """목록 HTML에서 ueb_seq와 제목·기간 파싱"""
    items = []
    seq_pattern = re.compile(r"ueb_seq=(\d+)")
    period_pattern = re.compile(r"(\d{4}\.\d{2}\.\d{2})\s*~\s*(\d{4}\.\d{2}\.\d{2})")

    for match in seq_pattern.finditer(html):
        seq = match.group(1)
        context = html[max(0, match.start() - 200) : match.end() + 500]
        period = period_pattern.search(context)
        start_str = period.group(1).replace(".", "-") if period else None
        end_str = period.group(2).replace(".", "-") if period else None
        # 제목: 가장 가까운 텍스트 블록 (간단 추출)
        title_match = re.search(r">([\w\s\[\]&!:,'\-–]{10,100})</", context)
        title = title_match.group(1).strip() if title_match else None
        items.append(
            {
                "seq": seq,
                "title_en": title,
                "period_start": start_str,
                "period_end": end_str,
            }
        )
    # 중복 제거
    seen = set()
    result = []
    for item in items:
        if item["seq"] not in seen:
            seen.add(item["seq"])
            result.append(item)
    return result


def collect_vb_event(pages: list[int], dry_run: bool = False) -> list[dict]:
    collected = []
    for page in pages:
        url = VB_EVENT_LIST_URL.format(page=page)
        print(f"  Fetching VB-EVENT-SURVEY page {page}: {url}")
        if dry_run:
            print("    [DRY RUN] 스킵")
            continue
        html = fetch_html(url)
        if not html:
            print(f"    SKIP — fetch 실패")
            continue
        items = parse_vb_event_list(html)
        print(f"    {len(items)}건 발견")
        for item in items:
            seq = item["seq"]
            status = compute_status(item["period_start"], item["period_end"])
            collected.append(
                {
                    "promo_id": f"VB_EVENT_{seq}",
                    "source_id": "VB-EVENT-SURVEY",
                    "source_url": VB_EVENT_DETAIL_URL.format(seq=seq),
                    "title_en": item["title_en"],
                    "title_ko": None,
                    "content_type": "campaign",
                    "audience_type": "B2C",
                    "status": status,
                    "period_start": item["period_start"],
                    "period_end": item["period_end"],
                    "price_krw": None,
                    "price_display": None,
                    "benefit": None,
                    "target": None,
                    "booking_url": None,
                    "location": None,
                    "reference_date": REFERENCE_DATE,
                    "verification_status": "UNVERIFIED_OFFICIAL_DETAIL",
                    "collected_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
                }
            )
    return collected


# ── BTO-PRESS 수집 ─────────────────────────────────────────────────────────
def is_b2c_candidate(title: str) -> bool:
    """B2C 키워드 매칭 AND B2B 키워드 없는 경우"""
    has_b2c = any(kw in title for kw in BTO_B2C_KEYWORDS)
    has_b2b = any(kw in title for kw in BTO_B2B_KEYWORDS)
    return has_b2c and not has_b2b


def parse_bto_list(html: str) -> list[dict]:
    """BTO 보도자료 목록 HTML에서 board_seq·제목 파싱"""
    items = []
    seq_pattern = re.compile(r"board_seq=(\d+)")
    title_pattern = re.compile(r"<td[^>]*class=\"[^\"]*tit[^\"]*\"[^>]*>\s*<a[^>]*>([^<]+)</a>")

    titles_found = list(title_pattern.finditer(html))
    seqs_found = list(seq_pattern.finditer(html))

    for i, seq_match in enumerate(seqs_found[:10]):
        seq = seq_match.group(1)
        context = html[max(0, seq_match.start() - 100) : seq_match.end() + 300]
        title_m = re.search(r">([^<]{5,100})</a>", context)
        title = title_m.group(1).strip() if title_m else ""
        items.append({"seq": seq, "title_ko": title})

    seen = set()
    result = []
    for item in items:
        if item["seq"] not in seen:
            seen.add(item["seq"])
            result.append(item)
    return result


def collect_bto_press(pages: list[int], dry_run: bool = False) -> list[dict]:
    collected = []
    for page in pages:
        url = BTO_LIST_URL.format(page=page)
        print(f"  Fetching BTO-PRESS page {page}: {url}")
        if dry_run:
            print("    [DRY RUN] 스킵")
            continue
        html = fetch_html(url)
        if not html:
            print(f"    SKIP — fetch 실패")
            continue
        items = parse_bto_list(html)
        candidates = [i for i in items if is_b2c_candidate(i["title_ko"])]
        print(f"    {len(items)}건 중 B2C 후보 {len(candidates)}건")
        for item in candidates:
            seq = item["seq"]
            collected.append(
                {
                    "promo_id": f"BTO_PRESS_{seq}",
                    "source_id": "BTO-PRESS",
                    "source_url": BTO_DETAIL_URL.format(seq=seq),
                    "title_en": None,
                    "title_ko": item["title_ko"],
                    "content_type": "campaign",
                    "audience_type": "B2C",
                    "status": "UNVERIFIED",
                    "period_start": None,
                    "period_end": None,
                    "price_krw": None,
                    "price_display": None,
                    "benefit": None,
                    "target": None,
                    "booking_url": None,
                    "location": None,
                    "reference_date": REFERENCE_DATE,
                    "verification_status": "UNVERIFIED_OFFICIAL_DETAIL",
                    "collected_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "note": "상세 페이지 개별 접근으로 기간·혜택 확정 필요",
                }
            )
    return collected


# ── 출력 ────────────────────────────────────────────────────────────────────
def split_by_status(items: list[dict]) -> dict:
    current, upcoming, expired, unverified = [], [], [], []
    for item in items:
        s = item.get("status", "UNVERIFIED")
        if s in ("ACTIVE", "ENDING_SOON"):
            current.append(item)
        elif s == "UPCOMING":
            upcoming.append(item)
        elif s == "EXPIRED":
            expired.append(item)
        else:
            unverified.append(item)
    return {
        "current": current,
        "upcoming": upcoming,
        "expired": expired,
        "unverified": unverified,
    }


def write_outputs(items: list[dict], dry_run: bool = False) -> None:
    groups = split_by_status(items)
    ts = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

    for status_key, group_items in groups.items():
        fname = f"busan-promotions-{status_key}-v1.json"
        path = os.path.join(REPORT_DIR, fname)
        data = {
            "report_id": f"busan-promotions-{status_key}-v1",
            "task_id": "TASK-BUSAN-PROMOTION-DATASET-COLLECT-FINALIZE-V1",
            "generated_at": ts,
            "reference_date": REFERENCE_DATE,
            "schema_version": "1.0",
            "count": len(group_items),
            "items": group_items,
        }
        if dry_run:
            print(f"  [DRY RUN] {fname}: {len(group_items)}건")
        else:
            atomic_write(path, data)


# ── CLI ─────────────────────────────────────────────────────────────────────
def parse_pages(pages_str: str) -> list[int]:
    if "-" in pages_str:
        start, end = pages_str.split("-", 1)
        return list(range(int(start), int(end) + 1))
    return [int(p) for p in pages_str.split(",")]


def main():
    parser = argparse.ArgumentParser(
        description="부산 프로모션 수집 스크립트 v1"
    )
    parser.add_argument(
        "--source",
        choices=["vb-event", "bto-press", "vb-shows", "all"],
        default="all",
        help="수집 소스 (기본: all)",
    )
    parser.add_argument(
        "--pages",
        default="1-3",
        help="수집 페이지 범위 (예: 1-5, 1,2,3). 기본: 1-3",
    )
    parser.add_argument(
        "--months",
        default="2026-08,2026-09,2026-10,2026-11,2026-12",
        help="Shows & Events 수집 월 (콤마 구분, 기본: 2026-08~12)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="실제 fetch 없이 수집 계획만 출력",
    )

    args = parser.parse_args()
    pages = parse_pages(args.pages)
    dry_run = args.dry_run

    print(f"\n=== 부산 프로모션 수집 v1 ===")
    print(f"기준일: {REFERENCE_DATE}")
    print(f"소스: {args.source}, 페이지: {pages}, dry_run: {dry_run}\n")

    all_items: list[dict] = []

    if args.source in ("vb-event", "all"):
        print("[VB-EVENT-SURVEY]")
        all_items.extend(collect_vb_event(pages, dry_run))

    if args.source in ("bto-press", "all"):
        print("\n[BTO-PRESS]")
        all_items.extend(collect_bto_press(pages, dry_run))

    print(f"\n총 수집: {len(all_items)}건")

    groups = split_by_status(all_items)
    for k, v in groups.items():
        print(f"  {k}: {len(v)}건")

    if all_items or not dry_run:
        write_outputs(all_items, dry_run)

    print("\n완료.")


if __name__ == "__main__":
    main()
