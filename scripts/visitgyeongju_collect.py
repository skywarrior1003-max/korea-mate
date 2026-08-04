#!/usr/bin/env python3
"""
비지트경주 수집기 v1.0.0
원천: https://visitgyeongju.or.kr
수집 대상: restaurants | souvenirs
지원 언어: ko | en | ja | zh-CN | zh-TW

전략: sitemap.xml에서 hexID 목록 추출 → 언어별 상세 페이지 수집
(목록 페이지는 JavaScript 동적 로딩 → WebFetch 불가)
"""

import argparse
import hashlib
import json
import re
import sys
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

VERSION = "1.0.0"
BASE_URL = "https://visitgyeongju.or.kr"
SITEMAP_URL = f"{BASE_URL}/sitemap.xml"
UA = "Mozilla/5.0 (compatible; KoreaMate-Collector/1.0; +https://github.com/skywarrior1003-max/korea-mate)"

CONTENT_TYPES = ["restaurants", "souvenirs"]

LOCALE_PREFIXES = {
    "ko":    "/kr",
    "en":    "",       # English is root
    "ja":    "/jp",
    "zh-CN": "/zh",
    "zh-TW": "/tw",
}

CONTENT_TYPE_PATHS = {
    "restaurants": "cuisine",
    "souvenirs":   "souvenir",
}

# Known counts from sitemap discovery 2026-08-04
KNOWN_COUNTS = {
    "restaurants": 96,
    "souvenirs": 8,
}


# ──────────────────────────────────────────────────────────────
# HTTP helpers
# ──────────────────────────────────────────────────────────────

def http_get(url: str, timeout: int, retries: int, delay: float) -> tuple:
    """Returns (body, status_code, error_msg)."""
    for attempt in range(1, retries + 1):
        try:
            req = Request(url, headers={"User-Agent": UA, "Accept-Language": "ko,en;q=0.9"})
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
# Sitemap parsing
# ──────────────────────────────────────────────────────────────

def fetch_sitemap_hexids(content_type: str, locale: str,
                          timeout: int, retries: int, delay: float) -> tuple:
    """
    Fetch sitemap.xml and extract hexIDs for given content_type + locale.
    Returns (hex_ids, error_msg).
    """
    path_key = CONTENT_TYPE_PATHS[content_type]
    locale_prefix = LOCALE_PREFIXES[locale]

    body, status, err = http_get(SITEMAP_URL, timeout, retries, delay)
    if body is None:
        return [], f"sitemap fetch failed: {err}"

    # Pattern to match: {locale_prefix}/{path_key}/view/{hexID}
    # e.g. /kr/cuisine/view/535f4040...
    if locale_prefix:
        pattern = rf"{re.escape(locale_prefix)}/{re.escape(path_key)}/view/([0-9a-f]{{34,36}})"
    else:
        # English is root: /cuisine/view/hexID (no locale prefix)
        pattern = rf"(?<!/kr|/jp|/zh|/tw)/{re.escape(path_key)}/view/([0-9a-f]{{34,36}})"

    try:
        # Parse sitemap XML
        ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
        root = ET.fromstring(body)
        urls = [loc.text for loc in root.findall(".//sm:loc", ns) if loc.text]
        if not urls:
            # Fallback: extract from raw text
            urls = re.findall(r"<loc>([^<]+)</loc>", body.decode("utf-8", errors="replace"))
    except ET.ParseError:
        urls_text = body.decode("utf-8", errors="replace")
        urls = re.findall(r"<loc>([^<]+)</loc>", urls_text)

    hex_ids = []
    seen = set()
    for url in urls:
        m = re.search(rf"/{re.escape(path_key)}/view/([0-9a-f]{{34,36}})", url)
        if not m:
            continue
        hex_id = m.group(1)
        # Filter by locale prefix
        if locale_prefix:
            if f"{locale_prefix}/{path_key}/view/" not in url:
                continue
        else:
            # English: must NOT have /kr/, /jp/, /zh/, /tw/
            if any(f"/{lp}/{path_key}/view/" in url for lp in ["kr", "jp", "zh", "tw"]):
                continue
        if hex_id not in seen:
            seen.add(hex_id)
            hex_ids.append(hex_id)

    return hex_ids, ""


# ──────────────────────────────────────────────────────────────
# HTML parsing for detail pages
# ──────────────────────────────────────────────────────────────

class TextExtractor(HTMLParser):
    """Extract all visible text from HTML."""
    def __init__(self):
        super().__init__()
        self.texts: list[str] = []
        self._skip = False

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "head"):
            self._skip = True

    def handle_endtag(self, tag):
        if tag in ("script", "style", "head"):
            self._skip = False

    def handle_data(self, data):
        if not self._skip:
            s = data.strip()
            if s:
                self.texts.append(s)


def extract_text(html_bytes: bytes) -> str:
    try:
        html = html_bytes.decode("utf-8", errors="replace")
    except Exception:
        return ""
    p = TextExtractor()
    p.feed(html)
    return " ".join(p.texts)


def extract_page_title(html_bytes: bytes) -> str:
    """Extract <title> or first <h1>/<h2> content."""
    try:
        html = html_bytes.decode("utf-8", errors="replace")
    except Exception:
        return ""
    # Try OG title first (most reliable for VG pages)
    m = re.search(r'property="og:title"[^>]+content="([^"]+)"', html)
    if m:
        return m.group(1).strip()
    m2 = re.search(r"<title[^>]*>([^<]+)</title>", html, re.IGNORECASE)
    if m2:
        title = m2.group(1).strip()
        # Remove site name suffix
        title = re.sub(r"\s*[-|]\s*[Vv]isit.*$", "", title).strip()
        return title
    return ""


def parse_visitgyeongju_detail(html_bytes: bytes, hex_id: str,
                                 content_type: str, locale: str,
                                 source_url: str) -> dict:
    """
    Parse a visitgyeongju.or.kr detail page.
    Extracts: title, address, phone, hours, category tags.
    """
    rec: dict = {
        "vg_id": hex_id,
        "source_url": source_url,
        "content_type": content_type,
        "locale": locale,
        "page_title": extract_page_title(html_bytes),
        "body_sha256": sha256_bytes(html_bytes),
        "body_size_bytes": len(html_bytes),
        "collected_at": now_iso(),
        "collector_version": VERSION,
    }

    try:
        html = html_bytes.decode("utf-8", errors="replace")
    except Exception:
        rec["parse_error"] = "decode failed"
        return rec

    # Address pattern (Korean)
    addr_m = re.search(r"경주시[^<\n]{5,60}", html)
    if addr_m:
        rec["address"] = addr_m.group(0).strip()

    # Phone number
    phone_m = re.search(r"(0\d{1,2}-\d{3,4}-\d{4}|05\d{2}-\d{3,4}-\d{4}|\+82-?\d[-\d]{8,12})", html)
    if phone_m:
        rec["phone"] = phone_m.group(1).strip()

    # Operating hours (common patterns)
    hours_m = re.search(r"(\d{1,2}:\d{2}\s*[-~–]\s*\d{1,2}:\d{2})", html)
    if hours_m:
        rec["hours"] = hours_m.group(1).strip()

    # Extract tags via data-* or class patterns for VG
    # Look for filter/tag items with data-filter or similar
    service_tags = re.findall(r'class="[^"]*service[^"]*"[^>]*>([^<]+)<', html)
    atmosphere_tags = re.findall(r'class="[^"]*atmosphere[^"]*"[^>]*>([^<]+)<', html)
    purpose_tags = re.findall(r'class="[^"]*purpose[^"]*"[^>]*>([^<]+)<', html)
    trending_tags = re.findall(r'class="[^"]*trending[^"]*"[^>]*>([^<]+)<', html)

    # Fallback: look for <!--비즈니스--> or ul.tag-list items
    tag_items = re.findall(r'<li[^>]*class="[^"]*tag[^"]*"[^>]*>\s*<[^>]+>\s*([^<]+)\s*<', html)

    if service_tags:
        rec["service_tags_raw"] = [t.strip() for t in service_tags if t.strip()]
    if atmosphere_tags:
        rec["atmosphere_tags_raw"] = [t.strip() for t in atmosphere_tags if t.strip()]
    if purpose_tags:
        rec["purpose_tags_raw"] = [t.strip() for t in purpose_tags if t.strip()]
    if trending_tags:
        rec["trending_tags_raw"] = [t.strip() for t in trending_tags if t.strip()]
    if tag_items:
        rec["tag_items_raw"] = [t.strip() for t in tag_items if t.strip()]

    # Check if page is empty/missing (non-KO locales sometimes have empty translations)
    text_content = extract_text(html_bytes)
    word_count = len(text_content.split())
    rec["page_word_count"] = word_count
    rec["page_appears_empty"] = word_count < 50

    return rec


# ──────────────────────────────────────────────────────────────
# Language availability check
# ──────────────────────────────────────────────────────────────

def build_detail_url(hex_id: str, content_type: str, locale: str) -> str:
    path_key = CONTENT_TYPE_PATHS[content_type]
    prefix = LOCALE_PREFIXES[locale]
    return f"{BASE_URL}{prefix}/{path_key}/view/{hex_id}"


def check_language_availability(hex_id: str, content_type: str,
                                 timeout: int, retries: int, delay: float) -> dict:
    """Check HTTP status for all 5 locales."""
    results = {}
    for locale, _ in LOCALE_PREFIXES.items():
        url = build_detail_url(hex_id, content_type, locale)
        body, status, err = http_get(url, timeout, retries, delay)
        page_empty = None
        if body is not None:
            text = extract_text(body)
            page_empty = len(text.split()) < 50
        results[locale] = {
            "url": url,
            "http_status": status,
            "accessible": status == 200,
            "page_appears_empty": page_empty,
            "error": err if err else None,
        }
        time.sleep(delay)
    return results


# ──────────────────────────────────────────────────────────────
# Resume helpers
# ──────────────────────────────────────────────────────────────

def load_existing_hexids(out_file: Path) -> set:
    if not out_file.exists():
        return set()
    seen = set()
    for line in out_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            rec = json.loads(line)
            if rec.get("vg_id"):
                seen.add(rec["vg_id"])
        except json.JSONDecodeError:
            pass
    return seen


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


def build_summary(snap: dict, records: list, args, out_file: Path,
                  hex_ids_total: int) -> dict:
    out_sha = sha256_bytes(out_file.read_bytes()) if out_file.exists() else None
    return {
        "source": "visitgyeongju.or.kr",
        "collector": "visitgyeongju_collect.py",
        "collector_version": VERSION,
        "content_type": args.content_type,
        "locale": args.locale,
        "command": " ".join(sys.argv),
        "as_of": args.as_of or now_iso(),
        "collected_at": snap["started_at"],
        "finished_at": now_iso(),
        "sitemap_hex_ids_total": hex_ids_total,
        "requested_url_count": len(snap["requested_urls"]),
        "success_url_count": len(snap["success_urls"]),
        "failed_url_count": len(snap["failed_urls"]),
        "http_status_distribution": snap["http_status_dist"],
        "record_count": len(records),
        "output_file": str(out_file),
        "output_sha256": out_sha,
        "failed_urls": snap["failed_urls"],
        "dry_run": args.dry_run,
        "collection_strategy": (
            "sitemap.xml hexID 열거 → 언어별 상세 URL 직접 수집. "
            "목록 페이지는 JavaScript 동적 로딩으로 WebFetch 불가. "
            "웹 전용 이미지 다운로드 없음. 장문 설명 저장 없음."
        ),
        "reproducibility_note": (
            "같은 hexID 목록 + 같은 --as-of + 같은 정규화 규칙 → 정규화 단계 byte-identical. "
            "raw 수집은 사이트 변경에 따라 달라질 수 있음."
        ),
    }


# ──────────────────────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(
        prog="visitgyeongju_collect.py",
        description=(
            f"비지트경주 수집기 v{VERSION}\n"
            "원천: https://visitgyeongju.or.kr\n"
            "수집 전략: sitemap.xml hexID 열거 → 상세 페이지 수집\n"
            "웹 전용 이미지 다운로드 및 장문 설명 저장 없음"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument(
        "--content-type",
        required=True,
        choices=CONTENT_TYPES,
        help="수집할 콘텐츠 유형 (restaurants | souvenirs)",
    )
    p.add_argument(
        "--locale",
        required=True,
        choices=list(LOCALE_PREFIXES.keys()),
        help="언어 (ko | en | ja | zh-CN | zh-TW)",
    )
    p.add_argument("--out", required=True, help="출력 디렉터리 경로")
    p.add_argument(
        "--max-pages",
        type=int,
        default=None,
        help="최대 페이지 수 (기본: 무제한. visitgyeongju는 sitemap 기반이므로 미적용)",
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
        help="이전 수집 결과가 있으면 이어서 수집 (기존 vg_id 건너뜀)",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="실제 HTTP 요청 없이 URL 목록만 출력 (sitemap 조회 포함)",
    )
    p.add_argument(
        "--check-languages",
        action="store_true",
        help="표본 hexID에 대해 5개 언어 실제 HTTP 상태 확인 (표본 수집 시 사용)",
    )
    return p.parse_args()


def main():
    args = parse_args()
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    out_file = out_dir / f"{args.content_type}-{args.locale}-raw.jsonl"
    summary_file = out_dir / f"{args.content_type}-{args.locale}-snapshot-summary.json"

    snap: dict = {
        "started_at": now_iso(),
        "requested_urls": [],
        "success_urls": [],
        "failed_urls": [],
        "http_status_dist": {},
    }

    print(f"[visitgyeongju_collect] content-type={args.content_type}"
          f" locale={args.locale} dry-run={args.dry_run} max-items={args.max_items}")

    # Step 1: Get hexIDs from sitemap
    print(f"  fetching sitemap: {SITEMAP_URL}")
    if not args.dry_run:
        hex_ids, sitemap_err = fetch_sitemap_hexids(
            args.content_type, args.locale, args.timeout, args.retries, args.delay
        )
        if sitemap_err:
            print(f"  [warn] sitemap error: {sitemap_err}")
        print(f"  sitemap: {len(hex_ids)} hexIDs found for {args.content_type}/{args.locale}")
    else:
        hex_ids = [f"<dry-run-placeholder-{i}>" for i in range(
            KNOWN_COUNTS.get(args.content_type, 0)
        )]
        sitemap_err = ""
        print(f"  [dry-run] would enumerate {len(hex_ids)} hexIDs from sitemap")

    hex_ids_total = len(hex_ids)

    # Step 2: Resume — skip already collected hexIDs
    existing_hexids: set = set()
    if args.resume and out_file.exists():
        existing_hexids = load_existing_hexids(out_file)
        print(f"  [resume] {len(existing_hexids)} already collected")
        hex_ids = [h for h in hex_ids if h not in existing_hexids]
        print(f"  [resume] {len(hex_ids)} remaining")

    # Step 3: Limit
    if args.max_items:
        hex_ids = hex_ids[: args.max_items]

    # Step 4: Collect detail pages
    records: list[dict] = []
    lang_audit_records: list[dict] = []

    for i, hex_id in enumerate(hex_ids):
        url = build_detail_url(hex_id, args.content_type, args.locale)
        print(f"  [{i+1}/{len(hex_ids)}] {url}")

        if args.dry_run:
            print(f"    [DRY-RUN] skipping fetch")
            continue

        body, status, err = http_get(url, args.timeout, args.retries, args.delay)
        snap["requested_urls"].append(url)
        snap["http_status_dist"][str(status)] = snap["http_status_dist"].get(str(status), 0) + 1

        if body is None:
            print(f"    FAIL status={status} err={err}")
            snap["failed_urls"].append({"url": url, "hex_id": hex_id, "error": err})
            continue

        snap["success_urls"].append(url)
        rec = parse_visitgyeongju_detail(body, hex_id, args.content_type, args.locale, url)
        records.append(rec)
        print(f"    OK title={rec.get('page_title', '')[:50]} empty={rec.get('page_appears_empty')}")

        # Optional: language availability check for first few items
        if args.check_languages and i < 5:
            print(f"    [lang-check] checking all locales for {hex_id[:12]}...")
            lang_results = check_language_availability(
                hex_id, args.content_type, args.timeout, args.retries, args.delay
            )
            lang_audit_records.append({
                "vg_id": hex_id,
                "content_type": args.content_type,
                "language_availability": lang_results,
                "checked_at": now_iso(),
            })
            for loc, r in lang_results.items():
                status_str = r["http_status"] if r["http_status"] else r["error"]
                empty_str = "(empty)" if r["page_appears_empty"] else ""
                print(f"      {loc}: {status_str} {empty_str}")

        time.sleep(args.delay)

    # Step 5: Write output
    if not args.dry_run:
        # Load existing if resuming
        if args.resume and existing_hexids:
            existing_records = load_existing_records_full(out_file)
            all_records = existing_records + records
        else:
            all_records = records

        write_jsonl(out_file, all_records)
        print(f"[output] {len(all_records)} records → {out_file}")

        if lang_audit_records:
            lang_audit_file = out_dir / f"{args.content_type}-language-audit.jsonl"
            write_jsonl(lang_audit_file, lang_audit_records)
            print(f"[lang-audit] {len(lang_audit_records)} records → {lang_audit_file}")
    else:
        print(f"[dry-run] would fetch {len(hex_ids)} detail pages")

    summary = build_summary(snap, records, args, out_file, hex_ids_total)
    write_json(summary_file, summary)
    print(f"[summary] → {summary_file}")

    if snap["failed_urls"]:
        print(f"[warn] {len(snap['failed_urls'])} failed URLs")
        for fu in snap["failed_urls"]:
            print(f"  FAIL {fu['url']} → {fu['error']}")

    sys.exit(0)


def load_existing_records_full(out_file: Path) -> list:
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


if __name__ == "__main__":
    main()
