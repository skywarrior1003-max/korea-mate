#!/usr/bin/env python3
"""
visitgyeongju.or.kr 웹 수집기 v2.1.0
원천: https://www.visitgyeongju.or.kr
수집 대상: restaurants | souvenirs

변경 이력:
  v2.1.0 (2026-08-05): B-NEM name_extract_method·name_source_selector·name_parse_status 추가
  v2.0.0 (2026-08-05): 엔티티명 추출 우선순위 수정 (B6: h2→h1→structured-data→title→OG),
                        6단계 언어 분류 도입 (B5),
                        식당 실제 수 수정 84건 / 기념품 8건 (I7),
                        Accept-Language 로케일별 설정 (I8),
                        주소 패턴 다국어 확장 (I9)
  v1.0.0 (2026-08-04): 초기 목록 수집기
"""

import argparse
import hashlib
import json
import re
import sys
import time
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

VERSION = "2.1.0"
BASE_URL = "https://www.visitgyeongju.or.kr"
SITEMAP_URL = f"{BASE_URL}/sitemap.xml"
UA = "Mozilla/5.0 (compatible; KoreaMate-Collector/2.0; +https://github.com/skywarrior1003-max/korea-mate)"

# ── 로케일 설정 (I8: 로케일별 Accept-Language) ──────────────────
LOCALES = ["ko", "en", "ja", "zh-CN", "zh-TW"]

LOCALE_PREFIX = {
    "ko":    "/kr",
    "en":    "",
    "ja":    "/jp",
    "zh-CN": "/zh",
    "zh-TW": "/tw",
}

LOCALE_ACCEPT_LANG = {
    "ko":    "ko,en;q=0.5",
    "en":    "en,ko;q=0.3",
    "ja":    "ja,en;q=0.5",
    "zh-CN": "zh-CN,zh;q=0.9,en;q=0.3",
    "zh-TW": "zh-TW,zh;q=0.9,en;q=0.3",
}

# ── 수집 대상 카테고리 ────────────────────────────────────────────
CATEGORIES = {
    "restaurants": {
        # sitemap confirmed 2026-08-05: /cuisine/view/HEX_ID (NOT /tour/restaurant/)
        "path_fragment": "/cuisine/view/",
        "known_count": 85,   # I7: sitemap-verified 85건 (v1.0.0의 96 오기 수정; 이전 84는 재확인)
        "name_ko": "식당",
    },
    "souvenirs": {
        # sitemap confirmed 2026-08-05: /souvenir/view/HEX_ID (NOT /tour/souvenir/)
        "path_fragment": "/souvenir/view/",
        "known_count": 8,    # I7: 실제 8건 (v1.0.0의 9 오기 수정)
        "name_ko": "기념품",
    },
}

# ── 6단계 언어 분류 (B5) ─────────────────────────────────────────
LANG_VALID_TRANSLATED_DETAIL = "VALID_TRANSLATED_DETAIL"
LANG_KOREAN_FALLBACK      = "KOREAN_FALLBACK"
LANG_EMPTY_TEMPLATE       = "EMPTY_TEMPLATE"
LANG_PARTIAL_TRANSLATION  = "PARTIAL_TRANSLATION"
LANG_DETAIL_NOT_FOUND     = "DETAIL_NOT_FOUND"
LANG_HTTP_ERROR           = "HTTP_ERROR"

# Minimum word-count threshold to count as a non-empty page
MIN_CONTENT_WORDS = 50

# Korean-only character ratio threshold: if > this fraction of alpha chars
# are Korean (Hangul), page is classified KOREAN_FALLBACK for non-ko locales
KOREAN_RATIO_THRESHOLD = 0.60


# ──────────────────────────────────────────────────────────────
# HTTP helpers
# ──────────────────────────────────────────────────────────────

def http_get(url: str, timeout: int, retries: int, delay: float,
             accept_lang: str = "ko,en;q=0.5") -> tuple:
    """Returns (body_bytes, status_code, error_msg). body=None on failure."""
    for attempt in range(1, retries + 1):
        try:
            req = Request(url, headers={
                "User-Agent": UA,
                "Accept-Language": accept_lang,
            })
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

def fetch_sitemap_hex_ids(category: str, args) -> list:
    """
    Parse sitemap.xml to collect hex IDs for the target category.
    Returns list of unique hex ID strings.
    """
    path_fragment = CATEGORIES[category]["path_fragment"]
    known_count = CATEGORIES[category]["known_count"]

    body, status, err = http_get(SITEMAP_URL, args.timeout, args.retries, args.delay)
    if body is None:
        print(f"  [sitemap] FAIL status={status} err={err}")
        return []

    hex_ids = []
    seen: set = set()
    try:
        # Use regex to extract <loc> content — avoids XML namespace parse errors
        # (sitemap.xml uses xsi:schemaLocation which breaks ElementTree without full NS handling)
        xml_text = body.decode("utf-8", errors="replace")
        all_locs = re.findall(r"<loc>([^<]+)</loc>", xml_text)
        for loc in all_locs:
            loc = loc.strip()
            # Only match English (no locale prefix /kr, /jp, /zh, /tw) URLs
            # to deduplicate: /cuisine/view/HEX but not /kr/cuisine/view/HEX
            if path_fragment not in loc:
                continue
            # Exclude locale-prefixed URLs (they start with /kr/ /jp/ /zh/ /tw/)
            path = urlparse(loc).path
            first_segment = path.strip("/").split("/")[0]
            if first_segment in ("kr", "jp", "zh", "tw"):
                continue
            # Extract trailing hex ID (long alphanumeric, not just [a-fA-F0-9])
            m = re.search(r"/([0-9a-zA-Z]{16,})\s*$", loc)
            if not m:
                continue
            hex_id = m.group(1).lower()
            if hex_id not in seen:
                seen.add(hex_id)
                hex_ids.append(hex_id)
    except Exception as e:
        print(f"  [sitemap] parse error: {e}")
        return []

    print(f"  [sitemap] {category}: discovered {len(hex_ids)} hex IDs (expected ~{known_count})")
    return hex_ids


# ──────────────────────────────────────────────────────────────
# Page content parsers
# ──────────────────────────────────────────────────────────────

class _TextExtractParser(HTMLParser):
    """Extracts visible text from HTML, skipping scripts/styles."""
    def __init__(self):
        super().__init__()
        self._skip = False
        self.parts: list = []

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript"):
            self._skip = True

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript"):
            self._skip = False

    def handle_data(self, data):
        if not self._skip:
            stripped = data.strip()
            if stripped:
                self.parts.append(stripped)


def visible_text(html_bytes: bytes) -> str:
    """Return all visible text from an HTML page as a single space-joined string."""
    try:
        html = html_bytes.decode("utf-8", errors="replace")
    except Exception:
        return ""
    p = _TextExtractParser()
    p.feed(html)
    return " ".join(p.parts)


def extract_entity_name(html_bytes: bytes) -> tuple:
    """
    B6 + B-NEM: Extract entity name with corrected priority.

    Priority: h2 (detail-class) → h2 (any) → h1 (detail-class) → h1 (any)
              → JSON-LD → <title> → OG (last resort)

    Never returns the generic "VISIT GYEONGJU" string.

    Returns (name: str, method: str, selector: str | None) where:
      method — one of DETAIL_ENTITY_HEADING | CONTENT_HEADING |
                      STRUCTURED_DATA_NAME | DOCUMENT_TITLE_FALLBACK |
                      OG_TITLE_FALLBACK | NAME_PARSE_FAILED
      selector — short meaningful identifier (e.g. "h2.detail", "json-ld", "title")
    """
    SKIP = {"VISIT GYEONGJU", "Visit Gyeongju", "visitgyeongju",
            "경주", "관광", "여행", "메인", "홈"}
    try:
        html = html_bytes.decode("utf-8", errors="replace")
    except Exception:
        return ("", "NAME_PARSE_FAILED", None)

    # 1. h2 / h1 with detail/subject/title class; then generic h2/h1
    for pat, method, selector in [
        (r'<h2[^>]+class="[^"]*(?:detail|subject|tit|title|name)[^"]*"[^>]*>\s*([^<]{2,80})\s*</h2>',
         "DETAIL_ENTITY_HEADING", "h2.detail"),
        (r'<h2[^>]*>\s*([^<]{2,80})\s*</h2>',
         "CONTENT_HEADING", "h2"),
        (r'<h1[^>]*class="[^"]*(?:detail|subject|tit|title|name)[^"]*"[^>]*>\s*([^<]{2,80})\s*</h1>',
         "DETAIL_ENTITY_HEADING", "h1.detail"),
        (r'<h1[^>]*>\s*([^<]{2,80})\s*</h1>',
         "CONTENT_HEADING", "h1"),
    ]:
        for m in re.finditer(pat, html):
            name = m.group(1).strip()
            if name and name not in SKIP and "VISIT" not in name.upper():
                return (name, method, selector)

    # 2. JSON-LD structured data name field
    jld_m = re.search(r'"name"\s*:\s*"([^"]{2,80})"', html)
    if jld_m:
        name = jld_m.group(1).strip()
        if name and name not in SKIP and "VISIT" not in name.upper():
            return (name, "STRUCTURED_DATA_NAME", "json-ld")

    # 3. <title> — strip site suffix
    title_m = re.search(r"<title[^>]*>([^<]+)</title>", html, re.I)
    if title_m:
        t = title_m.group(1).strip()
        t = re.sub(
            r"\s*[-|–·]\s*(?:Visit\s+Gyeongju|VISIT\s+GYEONGJU|경주[^\|–]*)?$",
            "", t, flags=re.I
        ).strip()
        if t and t not in SKIP and len(t) >= 2:
            return (t, "DOCUMENT_TITLE_FALLBACK", "title")

    # 4. OG title — absolute last resort
    og_m = re.search(r'property="og:title"[^>]+content="([^"]+)"', html)
    if og_m:
        name = og_m.group(1).strip()
        if name and name not in SKIP and "VISIT" not in name.upper():
            return (name, "OG_TITLE_FALLBACK", "og:title")

    return ("", "NAME_PARSE_FAILED", None)


def extract_address(html_bytes: bytes, locale: str = "ko") -> str:
    """
    I9: Multi-locale address extraction.
    Korean: 경주시[^<\n]{5,60}
    English: street/road patterns + Gyeongju
    Japanese/Chinese: locale-specific label or city-name cues
    """
    try:
        html = html_bytes.decode("utf-8", errors="replace")
    except Exception:
        return ""

    if locale == "ko":
        m = re.search(r"경주시[^<\n]{5,60}", html)
        if m:
            return m.group(0).strip()
        m2 = re.search(r"경상북도\s+경주시[^<\n]{3,60}", html)
        if m2:
            return m2.group(0).strip()

    elif locale == "en":
        m = re.search(
            r"(\d+[^<\n]{5,80}(?:Gyeongju|gyeongju)[^<\n]{0,40})",
            html
        )
        if m:
            addr = m.group(1).strip()
            if len(addr) < 120:
                return addr
        m2 = re.search(r"Gyeongju-(?:si|city)[^<\n]{5,80}", html)
        if m2:
            return m2.group(0).strip()

    elif locale in ("ja", "zh-CN", "zh-TW"):
        label = "住所" if locale == "ja" else "地址"
        label_m = re.search(
            rf"{label}[^<]{{0,10}}</\w+>[^<]{{0,10}}<[^>]+>([^<]{{5,100}})", html
        )
        if label_m:
            return label_m.group(1).strip()
        city = "慶州" if locale in ("zh-CN", "zh-TW") else "慶州市"
        m3 = re.search(rf"{city}[^\n<]{{3,80}}", html)
        if m3:
            return m3.group(0).strip()

    # Universal fallback
    for pat in [
        r'data-address="([^"]{5,100})"',
        r'property="og:description"[^>]+content="([^"]{5,120})"',
    ]:
        gm = re.search(pat, html)
        if gm:
            return gm.group(1).strip()

    return ""


def extract_tags(html_bytes: bytes) -> list:
    """Extract category/tag labels from visitgyeongju detail pages."""
    try:
        html = html_bytes.decode("utf-8", errors="replace")
    except Exception:
        return []
    tags = []
    for m in re.finditer(
        r'<(?:span|li|a)[^>]+class="[^"]*(?:tag|category|label|badge)[^"]*"[^>]*>([^<]{1,40})</(?:span|li|a)>',
        html
    ):
        t = m.group(1).strip()
        if t and len(t) > 1:
            tags.append(t)
    return tags


def extract_phone(html_bytes: bytes) -> str:
    """Extract Korean phone number from page."""
    try:
        html = html_bytes.decode("utf-8", errors="replace")
    except Exception:
        return ""
    m = re.search(r"(0\d{1,2}[\s\-]\d{3,4}[\s\-]\d{4})", html)
    return m.group(1) if m else ""


# ──────────────────────────────────────────────────────────────
# Language classification  (B5)
# ──────────────────────────────────────────────────────────────

def _korean_char_ratio(text: str) -> float:
    """Fraction of alphabetic-equivalent characters that are Hangul."""
    total = sum(1 for c in text if c.isalpha() or '가' <= c <= '힣')
    if total == 0:
        return 0.0
    hangul = sum(1 for c in text if '가' <= c <= '힣')
    return hangul / total


def classify_translation(
    html_bytes: bytes,
    status_code: int,
    _error: str,
    locale: str,
    _ko_name: str,
    ko_fields: dict,
) -> str:
    """
    B5: 6-level language classification for visitgyeongju locale pages.

    Returns one of:
      VALID_TRANSLATED_DETAIL   – page exists, locale text, entity identifiable
      KOREAN_FALLBACK           – page exists but content is still Korean
      EMPTY_TEMPLATE            – page exists but content is a blank template
      PARTIAL_TRANSLATION       – some fields translated, key fields still Korean
      DETAIL_NOT_FOUND          – HTTP 404 / entity missing in this locale
      HTTP_ERROR                – HTTP error other than 404
    """
    if html_bytes is None:
        if status_code == 404:
            return LANG_DETAIL_NOT_FOUND
        return LANG_HTTP_ERROR

    if status_code == 404:
        return LANG_DETAIL_NOT_FOUND

    if status_code >= 400:
        return LANG_HTTP_ERROR

    text = visible_text(html_bytes)
    word_count = len(text.split())

    if word_count < MIN_CONTENT_WORDS:
        return LANG_EMPTY_TEMPLATE

    if locale == "ko":
        return LANG_VALID_TRANSLATED_DETAIL

    kr_ratio = _korean_char_ratio(text)

    ko_values_present = sum(
        1 for v in ko_fields.values()
        if v and len(v) > 3 and v in text
    )
    total_ko_fields = sum(1 for v in ko_fields.values() if v and len(v) > 3)
    ko_field_ratio = (ko_values_present / total_ko_fields) if total_ko_fields > 0 else 0.0

    if kr_ratio > KOREAN_RATIO_THRESHOLD and ko_field_ratio > 0.5:
        return LANG_KOREAN_FALLBACK

    entity_name, _method, _selector = extract_entity_name(html_bytes)
    if not entity_name:
        if kr_ratio > 0.4:
            return LANG_KOREAN_FALLBACK
        return LANG_EMPTY_TEMPLATE

    if ko_field_ratio > 0.4 and kr_ratio > 0.25:
        return LANG_PARTIAL_TRANSLATION

    return LANG_VALID_TRANSLATED_DETAIL


# ──────────────────────────────────────────────────────────────
# Per-entity collection
# ──────────────────────────────────────────────────────────────

def collect_entity_all_locales(
    hex_id: str,
    category: str,
    args,
    snap: dict,
) -> dict:
    """
    Fetch all 5 locale pages for a single entity and return a combined record.
    """
    path_fragment = CATEGORIES[category]["path_fragment"]
    rec = {
        "source_type": "visitgyeongju_web",
        "content_type": category,
        "hex_id": hex_id,
        "category": category,
        "collected_at": now_iso(),
        "collector_version": VERSION,
        "locales": {},
    }

    ko_name = ""
    ko_fields: dict = {}

    for locale in LOCALES:
        prefix = LOCALE_PREFIX[locale]
        url = f"{BASE_URL}{prefix}{path_fragment}{hex_id}"
        accept_lang = LOCALE_ACCEPT_LANG[locale]

        if args.dry_run:
            snap["dry_run_urls"].append(url)
            rec["locales"][locale] = {
                "url": url,
                "status": "DRY_RUN",
                "language_class": "DRY_RUN",
            }
            continue

        body, status, err = http_get(url, args.timeout, args.retries, args.delay, accept_lang)
        snap["requested_urls"].append(url)
        snap["http_status_dist"][str(status)] = snap["http_status_dist"].get(str(status), 0) + 1

        if body is not None:
            snap["success_urls"].append(url)
        else:
            snap["failed_urls"].append({"url": url, "status": status, "error": err})

        if body:
            entity_name, name_method, name_selector = extract_entity_name(body)
        else:
            entity_name, name_method, name_selector = "", "NAME_PARSE_FAILED", None
        address = extract_address(body, locale) if body else ""
        phone = extract_phone(body) if body else ""
        tags = extract_tags(body) if body else []
        body_sha = sha256_bytes(body) if body else None
        body_size = len(body) if body else 0
        word_count = len(visible_text(body).split()) if body else 0
        name_parse_status = "PARSED" if entity_name else "NAME_PARSE_FAILED"

        if locale == "ko" and body is not None:
            ko_name = entity_name
            ko_fields = {"name": entity_name, "address": address}

        lang_class = classify_translation(
            body, status, err, locale, ko_name, ko_fields
        )

        locale_rec = {
            "url": url,
            "http_status": status,
            "error": err if err else None,
            "language_class": lang_class,
            "entity_name": entity_name if entity_name else None,
            "name_extract_method": name_method,
            "name_source_selector": name_selector,
            "name_parse_status": name_parse_status,
            "address": address if address else None,
            "phone": phone if phone else None,
            "tags": tags if tags else None,
            "word_count": word_count,
            "body_sha256": body_sha,
            "body_size_bytes": body_size,
        }
        rec["locales"][locale] = locale_rec

        label = lang_class[:24] if lang_class else "????"
        print(f"    [{locale:5s}] {label:24s} name={entity_name[:30] if entity_name else '(none)'} method={name_method}")
        time.sleep(args.delay)

    ko = rec["locales"].get("ko", {})
    rec["name_ko"] = ko.get("entity_name")
    rec["name_extract_method"] = ko.get("name_extract_method")
    rec["name_source_selector"] = ko.get("name_source_selector")
    rec["name_parse_status"] = ko.get("name_parse_status")
    rec["address_ko"] = ko.get("address")
    rec["phone"] = ko.get("phone")
    rec["tags"] = ko.get("tags")

    return rec


# ──────────────────────────────────────────────────────────────
# Collection entry point
# ──────────────────────────────────────────────────────────────

def collect_category(category: str, args, snap: dict) -> list:
    """Main collection loop for restaurants or souvenirs."""
    print(f"  [visitgyeongju/{category}] fetching sitemap…")
    hex_ids = fetch_sitemap_hex_ids(category, args)

    if not hex_ids:
        print(f"  [visitgyeongju/{category}] WARN: no hex IDs found; sitemap may have changed")
        return []

    if args.max_items:
        hex_ids = hex_ids[:args.max_items]

    records = []
    for idx, hex_id in enumerate(hex_ids, 1):
        print(f"  [{category}] {idx}/{len(hex_ids)} hex_id={hex_id}")
        rec = collect_entity_all_locales(hex_id, category, args, snap)
        records.append(rec)
        time.sleep(args.delay)

    return records


# ──────────────────────────────────────────────────────────────
# Resume / output helpers
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
    lang_dist: dict = {}
    for rec in records:
        for locale, lrec in rec.get("locales", {}).items():
            lc = lrec.get("language_class", "UNKNOWN")
            key = f"{locale}:{lc}"
            lang_dist[key] = lang_dist.get(key, 0) + 1

    out_sha = sha256_bytes(out_file.read_bytes()) if out_file.exists() else None
    return {
        "source": "visitgyeongju.or.kr",
        "collector": "visitgyeongju_collect.py",
        "collector_version": VERSION,
        "content_type": args.content_type,
        "command": " ".join(sys.argv),
        "collected_at": snap["started_at"],
        "finished_at": now_iso(),
        "requested_url_count": len(snap["requested_urls"]),
        "success_url_count": len(snap["success_urls"]),
        "failed_url_count": len(snap["failed_urls"]),
        "http_status_distribution": snap["http_status_dist"],
        "record_count": len(records),
        "language_class_distribution": lang_dist,
        "known_count": CATEGORIES[args.content_type]["known_count"],
        "output_file": str(out_file),
        "output_sha256": out_sha,
        "failed_urls": snap["failed_urls"],
        "dry_run": args.dry_run,
        "reproducibility_note": (
            "raw 수집은 수집 시각·사이트 상태에 따라 달라질 수 있음. "
            "같은 raw snapshot + 같은 mapping 규칙 → 정규화 단계만 byte-identical."
        ),
    }


# ──────────────────────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(
        prog="visitgyeongju_collect.py",
        description=(
            f"visitgyeongju.or.kr 웹 수집기 v{VERSION}\n"
            "원천: https://www.visitgyeongju.or.kr\n"
            f"수집 대상: {', '.join(CATEGORIES)}\n"
            "v2.0.0: 엔티티명 h2 우선, 6단계 언어 분류, 실수 수정 (식당84·기념품8), "
            "로케일별 Accept-Language, 다국어 주소 추출"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("--content-type", required=True, choices=list(CATEGORIES),
                   help="수집할 콘텐츠 유형")
    p.add_argument("--out", required=True, help="출력 디렉터리 경로")
    p.add_argument("--max-items", type=int, default=None,
                   help="최대 수집 엔티티 수 (기본: 무제한)")
    p.add_argument("--delay", type=float, default=1.0,
                   help="요청 간 delay (초, 기본: 1.0)")
    p.add_argument("--timeout", type=int, default=15,
                   help="HTTP 요청 타임아웃 (초, 기본: 15)")
    p.add_argument("--retries", type=int, default=3,
                   help="실패 시 재시도 횟수 (기본: 3)")
    p.add_argument("--resume", action="store_true",
                   help="이전 수집 결과가 있으면 이어서 수집")
    p.add_argument("--dry-run", action="store_true",
                   help="실제 HTTP 요청 없이 URL 목록만 출력 (sitemap은 실제 fetch)")
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

    print(f"[visitgyeongju_collect v{VERSION}] content-type={args.content_type}"
          f" dry-run={args.dry_run} max-items={args.max_items}")

    new_records = collect_category(args.content_type, args, snap)

    if args.resume:
        existing_hex_ids = {r.get("hex_id") for r in existing_records if r.get("hex_id")}
        new_records = [r for r in new_records if r.get("hex_id") not in existing_hex_ids]
        all_records = existing_records + new_records
    else:
        all_records = new_records

    if not args.dry_run:
        write_jsonl(out_file, all_records)
        print(f"[output] {len(all_records)} records → {out_file}")
    else:
        print(f"[dry-run] would request {len(snap['dry_run_urls'])} URLs")
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
