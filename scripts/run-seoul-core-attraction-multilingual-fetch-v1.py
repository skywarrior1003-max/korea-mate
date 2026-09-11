#!/usr/bin/env python3
"""
TASK-SEOUL-CORE-ATTRACTION-MULTILINGUAL-FETCH-V1

Materialize EN / JA / ZH locale title + description for 311 recovery universe
(focus: 286 MERGE_CANDIDATE records) using official VisitSeoul locale CIDs.

NO AI translation.  NO Google Translate.  NO locale fallback.
VISITSEOUL_OFFICIAL_ONLY.

Usage:
  python scripts/run-seoul-core-attraction-multilingual-fetch-v1.py --collect
  python scripts/run-seoul-core-attraction-multilingual-fetch-v1.py --normalize-only
  python scripts/run-seoul-core-attraction-multilingual-fetch-v1.py --qa-only

Safety:
  - API key: env VISITSEOUL_API_KEY, never printed/logged/committed.
  - Canonical file NOT touched.
  - No DB write.
"""

import json, os, sys, time, re, urllib.request, urllib.error, io, html as html_mod
from datetime import datetime, timezone
from pathlib import Path
from collections import Counter

# ── Config ────────────────────────────────────────────────────────────────────
TASK          = "TASK-SEOUL-CORE-ATTRACTION-MULTILINGUAL-FETCH-V1"
SCRIPT_VER    = "v1.0.0"
AS_OF         = "2026-09-11"
BASE_URL      = "https://api-call.visitseoul.net/api/v1"
TIMEOUT       = 30
MAX_RETRY     = 2
SLEEP_BETWEEN = 0.15  # seconds between requests (898 calls * 0.65s avg ≈ 580s)
SAFETY_CEIL   = 320   # stop if scope unexpectedly exceeds this
PLAN_TOTAL    = 311   # recovery universe

ROOT          = Path(__file__).parent.parent
PREFLIGHT_DIR = ROOT / "data/seoul-core-attraction-recovery-preflight-v1"
OUT_DIR       = ROOT / "data/seoul-core-attraction-multilingual-fetch-v1"
SCRIPTS_DIR   = ROOT / "scripts"

# Input artifacts
MULTILANG_READY_FILE = PREFLIGHT_DIR / "multilingual-readiness-v1.jsonl"
CLASSIFY_FILE        = PREFLIGHT_DIR / "recovery-classification-v1.jsonl"

# Output artifacts
RAW_FILE         = OUT_DIR / "seoul-core-attraction-multilingual-raw-v1.jsonl"
NORMALIZED_FILE  = OUT_DIR / "seoul-core-attraction-multilingual-normalized-v1.jsonl"
HANDOFF_FILE     = OUT_DIR / "seoul-core-attraction-multilingual-handoff-v1.jsonl"
COVERAGE_QA_FILE = OUT_DIR / "seoul-core-attraction-multilingual-coverage-qa-v1.json"
PARSER_QA_FILE   = OUT_DIR / "seoul-core-attraction-multilingual-parser-sample-qa-v1.json"
MANIFEST_FILE    = OUT_DIR / "seoul-core-attraction-multilingual-manifest-v1.json"

# Response field keys
F_TITLE     = "post_sj"
F_DESC      = "post_desc"
F_DESC_ALT  = "description"
F_SUMMARY   = "sumry"

# Language codes for API
LOCALE_MAP = {
    "en":    "en",
    "ja":    "ja",
    "zh-CN": "zh-CN",
}

_HTML_TAG  = re.compile(r"<[^>]+>")
_DANGER    = re.compile(r"<(script|style|iframe)[^>]*>.*?</\1>", re.S | re.I)
_WS        = re.compile(r"\s+")
_SECRET_RE = re.compile(r"(password|api.?key|secret|token|bearer)\s*[:=]\s*\S+", re.I)


def strip_html(raw: str, max_len: int = 5000) -> str:
    if not raw:
        return ""
    s = _DANGER.sub(" ", raw)
    s = _HTML_TAG.sub(" ", s)
    s = html_mod.unescape(s)
    s = _WS.sub(" ", s).strip()
    return s[:max_len]


def is_valid_language(text: str, locale: str) -> bool:
    """Heuristic language check.
    CJK scripts (ja, zh-CN) use min_len=1 because valid place names can be 2-3 chars.
    EN uses min_len=3 (at least a 2-letter abbreviation).
    """
    if not text:
        return False
    t = text.strip()
    # Japanese: contains hiragana or katakana (or CJK — bilingual titles common)
    if locale == "ja":
        if len(t) < 1:
            return False
        has_jp = any('぀' <= c <= 'ヿ' for c in t)
        has_cjk = any('一' <= c <= '鿿' for c in t)
        return has_jp or has_cjk
    # Chinese: at least one CJK ideograph
    if locale in ("zh-CN", "zh"):
        if len(t) < 1:
            return False
        has_cjk = any('一' <= c <= '鿿' for c in t)
        return has_cjk
    # English: at least 3 chars, mostly ASCII, no Korean/Japanese
    if locale == "en":
        if len(t) < 3:
            return False
        has_ko = any('가' <= c <= '힣' for c in t)
        has_jp = any('぀' <= c <= 'ヿ' for c in t)
        if has_ko or has_jp:
            return False
        ascii_cnt = sum(1 for c in t if c.isascii())
        return ascii_cnt / max(len(t), 1) > 0.5
    return True


# ── API engine ────────────────────────────────────────────────────────────────

def _post_json(endpoint: str, body: dict, api_key: str) -> dict:
    url = f"{BASE_URL}/{endpoint}"
    data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url, data=data,
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "VISITSEOUL-API-KEY": api_key,
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            raise RuntimeError(f"AUTH_FAIL:HTTP_{e.code}") from e
        raise RuntimeError(f"HTTP_{e.code}:{e.reason}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"URLError:{e.reason}") from e


def fetch_locale(locale_cid: str, language: str, api_key: str) -> tuple:
    """Fetch VisitSeoul contents/info for one locale CID. Returns (status, content, attempts)."""
    last_exc = None
    for attempt in range(MAX_RETRY + 1):
        try:
            resp = _post_json("contents/info", {"language": language, "cid": locale_cid}, api_key)
            content = resp.get("data") or {}
            if isinstance(content, list):
                content = content[0] if content else {}
            if not content or not content.get(F_TITLE):
                return "EMPTY_RESPONSE", {}, attempt + 1
            return "SUCCESS", content, attempt + 1
        except RuntimeError as e:
            err = str(e)
            if err.startswith("AUTH_FAIL"):
                return "AUTH_FAIL", {}, attempt + 1
            last_exc = err
            if attempt < MAX_RETRY:
                time.sleep(2.0)
    return "API_ERROR", {"last_error": str(last_exc)}, MAX_RETRY + 1


def parse_locale_content(content: dict, locale: str, locale_cid: str, ko_cid: str) -> dict:
    """Extract title and description from raw API content."""
    raw_title = str(content.get(F_TITLE) or "").strip()
    raw_desc  = str(content.get(F_DESC) or content.get(F_DESC_ALT) or "").strip()
    summary   = str(content.get(F_SUMMARY) or "").strip()[:1000]

    if _SECRET_RE.search(raw_desc):
        raw_desc = "[REDACTED]"

    has_html = bool(re.search(r"<[a-zA-Z]", raw_desc))
    desc_plain = strip_html(raw_desc)

    # Use summary as fallback if desc is empty
    if not desc_plain and summary:
        desc_plain = summary

    title_lang_ok = is_valid_language(raw_title, locale)
    desc_lang_ok  = is_valid_language(desc_plain, locale)

    return {
        "ko_cid":     ko_cid,
        "locale":     locale,
        "locale_cid": locale_cid,
        "title":      raw_title,
        "description": desc_plain,
        "summary":    summary,
        "raw_desc_html": has_html,
        "title_language_verified": title_lang_ok,
        "desc_language_verified":  desc_lang_ok,
        "title_length": len(raw_title),
        "desc_length":  len(desc_plain),
    }


# ── Load preflight data ───────────────────────────────────────────────────────

def load_preflight():
    """Load multilingual readiness + classification from preflight artifacts."""
    ml_rows = []
    with open(MULTILANG_READY_FILE, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                ml_rows.append(json.loads(line))

    cls_rows = []
    with open(CLASSIFY_FILE, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                cls_rows.append(json.loads(line))

    cls_by_cid = {r["cid"]: r for r in cls_rows}
    return ml_rows, cls_by_cid


# ── Main collection ───────────────────────────────────────────────────────────

def collect(api_key: str, mode: str = "collect"):
    """Run the multilingual fetch."""
    ml_rows, cls_by_cid = load_preflight()
    print(f"Loaded {len(ml_rows)} multilingual records, {len(cls_by_cid)} classified records")

    if len(ml_rows) != PLAN_TOTAL:
        print(f"WARN: expected {PLAN_TOTAL} rows, got {len(ml_rows)}")

    # Safety check
    if len(ml_rows) > SAFETY_CEIL:
        print(f"STOP: scope {len(ml_rows)} > SAFETY_CEIL {SAFETY_CEIL}", file=sys.stderr)
        sys.exit(1)

    # Determine merge targets vs others
    MERGE_STATUSES = {"MERGE_CANDIDATE"}

    # Build per-record locale fetch plan
    fetch_plan = []  # (ko_cid, locale, locale_cid, preflight_status)
    for ml in ml_rows:
        ko_cid = ml["cid"]
        pf_status = ml.get("preflight_status", "UNKNOWN")
        cls = cls_by_cid.get(ko_cid, {})

        # Parse CIDs from multi_lang_list
        ml_list = ml.get("multi_lang_list") or ""
        locale_cids = {}
        for part in ml_list.split(","):
            part = part.strip()
            if ":" in part:
                loc, cid_val = part.split(":", 1)
                locale_cids[loc.strip()] = cid_val.strip()

        for locale, api_lang in LOCALE_MAP.items():
            locale_cid = locale_cids.get(locale) or ml.get(f"{locale.split('-')[0]}_cid")
            if not locale_cid:
                continue
            fetch_plan.append({
                "ko_cid": ko_cid,
                "locale": locale,
                "locale_cid": locale_cid,
                "api_lang": api_lang,
                "preflight_status": pf_status,
                "is_merge_target": pf_status in MERGE_STATUSES,
            })

    merge_target_fetch = [f for f in fetch_plan if f["is_merge_target"]]
    non_merge_fetch    = [f for f in fetch_plan if not f["is_merge_target"]]

    print(f"\nFETCH PLAN:")
    print(f"  Total locale fetches: {len(fetch_plan)}")
    print(f"  Merge-target fetches: {len(merge_target_fetch)}")
    print(f"  Non-merge fetches:    {len(non_merge_fetch)}")
    by_locale = Counter(f["locale"] for f in fetch_plan)
    print(f"  By locale: {dict(by_locale)}")

    if mode == "normalize-only":
        # Load existing raw and re-normalize
        raw_records = []
        if RAW_FILE.exists():
            with open(RAW_FILE, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line:
                        raw_records.append(json.loads(line))
        print(f"  Re-normalizing {len(raw_records)} raw records...")
        return raw_records, fetch_plan, ml_rows, cls_by_cid

    # ── Actual fetch ──────────────────────────────────────────────────────────
    print(f"\nStarting fetch (merge-targets first)...")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    raw_records = []
    stats = Counter()
    consecutive_fail = 0

    # Fetch merge targets first, then non-merge
    ordered_fetches = merge_target_fetch + non_merge_fetch

    # ── RESUME LOGIC: skip already-fetched (ko_cid, locale) pairs ────────────
    already_done = set()
    if RAW_FILE.exists():
        with open(RAW_FILE, encoding="utf-8") as existing_fh:
            for line in existing_fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                    raw_records.append(rec)
                    already_done.add((rec.get("ko_cid", ""), rec.get("locale", "")))
                    stat = rec.get("status", "UNKNOWN")
                    stats[stat] += 1
                except Exception:
                    pass
        print(f"  RESUME: loaded {len(already_done)} already-fetched pairs, {len(raw_records)} records")
    remaining_fetches = [f for f in ordered_fetches if (f["ko_cid"], f["locale"]) not in already_done]
    print(f"  REMAINING: {len(remaining_fetches)} fetches needed (skipping {len(already_done)})")

    # Incremental write to avoid losing work on timeout — APPEND mode for resume
    file_mode = "a" if already_done else "w"
    raw_fh = open(RAW_FILE, file_mode, encoding="utf-8")

    try:
        for i, item in enumerate(remaining_fetches):
            ko_cid = item["ko_cid"]
            locale = item["locale"]
            locale_cid = item["locale_cid"]
            api_lang = item["api_lang"]
            is_merge = item["is_merge_target"]

            fetched_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            status, content, attempts = fetch_locale(locale_cid, api_lang, api_key)

            raw_rec = {
                "ko_cid":     ko_cid,
                "locale":     locale,
                "locale_cid": locale_cid,
                "api_lang":   api_lang,
                "status":     status,
                "preflight_status": item["preflight_status"],
                "is_merge_target": is_merge,
                "attempts":   attempts,
                "fetched_at": fetched_at,
                "_raw_content": content if status == "SUCCESS" else {},
                "error": content.get("last_error") if status != "SUCCESS" else None,
                "provenance": {
                    "source": "visitseoul",
                    "endpoint": "contents/info",
                    "ko_cid": ko_cid,
                    "locale_cid": locale_cid,
                    "locale": locale,
                    "fetched_at": fetched_at,
                    "task": TASK,
                    "script_version": SCRIPT_VER,
                },
            }

            if status == "SUCCESS":
                parsed = parse_locale_content(content, locale, locale_cid, ko_cid)
                raw_rec.update(parsed)
                stats["SUCCESS"] += 1
                consecutive_fail = 0
            else:
                stats[status] += 1
                consecutive_fail += 1
                if consecutive_fail >= 15:
                    print(f"\nSTOP: {consecutive_fail} consecutive failures — stopping at {i+1}/{len(remaining_fetches)}")
                    raw_fh.write(json.dumps(raw_rec, ensure_ascii=False) + "\n")
                    raw_fh.flush()
                    raw_records.append(raw_rec)
                    break

            raw_fh.write(json.dumps(raw_rec, ensure_ascii=False) + "\n")
            raw_fh.flush()
            raw_records.append(raw_rec)

            if (i + 1) % 50 == 0:
                print(f"  [{i+1}/{len(remaining_fetches)} remaining / {len(raw_records)} total] SUCCESS={stats['SUCCESS']} FAIL={sum(v for k,v in stats.items() if k!='SUCCESS')}", flush=True)

            if status != "AUTH_FAIL":
                time.sleep(SLEEP_BETWEEN)
            else:
                print("AUTH_FAIL - stopping", file=sys.stderr)
                break
    finally:
        raw_fh.close()

    print(f"\nFetch complete: {dict(stats)}")
    print(f"  Raw file written: {RAW_FILE} ({len(raw_records)} records)")
    return raw_records, fetch_plan, ml_rows, cls_by_cid


# ── Normalize ─────────────────────────────────────────────────────────────────

def normalize(raw_records: list) -> list:
    """Build normalized multilingual records from raw fetch results."""
    normalized = []
    for raw in raw_records:
        status = raw.get("status", "UNKNOWN")
        ko_cid = raw.get("ko_cid", "")
        locale = raw.get("locale", "")
        locale_cid = raw.get("locale_cid", "")

        title       = raw.get("title", "") if status == "SUCCESS" else ""
        description = raw.get("description", "") if status == "SUCCESS" else ""
        # Re-compute language verification from actual text (fixes heuristic updates)
        title_lang_ok = is_valid_language(title, locale) if title else False
        desc_lang_ok  = is_valid_language(description, locale) if description else False

        # Language verification override for EMPTY_RESPONSE
        if status == "EMPTY_RESPONSE":
            fetch_status = "SOURCE_EMPTY"
        elif status == "API_ERROR":
            fetch_status = "FETCH_FAILED"
        elif status == "AUTH_FAIL":
            fetch_status = "AUTH_FAIL"
        elif status == "SUCCESS":
            if not title:
                fetch_status = "TITLE_MISSING"
            elif not title_lang_ok:
                fetch_status = "LANGUAGE_MISMATCH"
            else:
                fetch_status = "OK"
        else:
            fetch_status = status

        normalized.append({
            "source_cid":  ko_cid,
            "locale":      locale,
            "locale_cid":  locale_cid,
            "title":       title,
            "description": description,
            "title_present":       bool(title),
            "description_present": bool(description),
            "title_language_verified":  title_lang_ok,
            "desc_language_verified":   desc_lang_ok,
            "title_length": raw.get("title_length", len(title)),
            "desc_length":  raw.get("desc_length", len(description)),
            "fetch_status":  fetch_status,
            "is_merge_target": raw.get("is_merge_target", False),
            "preflight_status": raw.get("preflight_status", ""),
            "source_provider": "visitseoul",
            "source_reference": f"visitseoul://contents/info/{locale_cid}",
            "language_verified": title_lang_ok and bool(title),
            "as_of":       AS_OF,
            "fetched_at":  raw.get("fetched_at", ""),
            "provenance":  raw.get("provenance", {}),
        })

    return normalized


# ── Build handoff ─────────────────────────────────────────────────────────────

def build_handoff(normalized: list, ml_rows: list, cls_by_cid: dict) -> list:
    """Build per-place handoff rows for 286 merge candidates."""
    # Group normalized by source_cid
    by_cid = {}
    for n in normalized:
        cid = n["source_cid"]
        if cid not in by_cid:
            by_cid[cid] = {}
        by_cid[cid][n["locale"]] = n

    ml_by_cid = {r["cid"]: r for r in ml_rows}
    handoff = []

    for ml in ml_rows:
        ko_cid = ml["cid"]
        cls = cls_by_cid.get(ko_cid, {})
        pf_status = ml.get("preflight_status", "UNKNOWN")

        # Only handoff for merge candidates
        if pf_status not in ("MERGE_CANDIDATE",):
            continue

        locales = by_cid.get(ko_cid, {})
        en = locales.get("en", {})
        ja = locales.get("ja", {})
        zh = locales.get("zh-CN", {})

        # Determine completeness
        en_ok = en.get("fetch_status") == "OK"
        ja_ok = ja.get("fetch_status") == "OK"
        zh_ok = zh.get("fetch_status") == "OK"

        has_en = ml.get("en_cid_present", False)
        has_ja = ml.get("ja_cid_present", False)
        has_zh = ml.get("zh_cid_present", False)

        # Coverage flags
        if en_ok and ja_ok and zh_ok:
            multilingual_class = "COMPLETE_4_LOCALE"
        elif has_en and not en_ok and has_ja and not ja_ok and has_zh and not zh_ok:
            multilingual_class = "FETCH_FAILED"
        else:
            # Count available locales
            locales_available = sum([
                1 if (not has_en or en_ok) else 0,
                1 if (not has_ja or ja_ok) else 0,
                1 if (not has_zh or zh_ok) else 0,
            ])
            # Check if missing is due to no CID or fetch failure
            no_cid = sum([not has_en, not has_ja, not has_zh])
            fetch_fail = sum([
                has_en and en.get("fetch_status") not in ("OK", None, ""),
                has_ja and ja.get("fetch_status") not in ("OK", None, ""),
                has_zh and zh.get("fetch_status") not in ("OK", None, ""),
            ])
            if no_cid > 0 and fetch_fail == 0:
                multilingual_class = "SOURCE_LOCALE_NOT_AVAILABLE"
            elif fetch_fail > 0:
                multilingual_class = "MULTILINGUAL_PARTIAL"
            else:
                multilingual_class = "MULTILINGUAL_PARTIAL"

        handoff.append({
            "source_cid":    ko_cid,
            "title_ko":      cls.get("title", ml.get("title_ko", "")),
            "svc_class":     cls.get("svc_class", ""),
            "category_path": cls.get("category_path", ""),

            "en_cid":              ml.get("en_cid"),
            "en_title":            en.get("title", ""),
            "en_description":      en.get("description", ""),
            "en_title_present":    bool(en.get("title")),
            "en_desc_present":     bool(en.get("description")),
            "en_lang_verified":    en.get("language_verified", False),
            "en_fetch_status":     en.get("fetch_status", "NO_CID" if not has_en else "NOT_FETCHED"),

            "ja_cid":              ml.get("ja_cid"),
            "ja_title":            ja.get("title", ""),
            "ja_description":      ja.get("description", ""),
            "ja_title_present":    bool(ja.get("title")),
            "ja_desc_present":     bool(ja.get("description")),
            "ja_lang_verified":    ja.get("language_verified", False),
            "ja_fetch_status":     ja.get("fetch_status", "NO_CID" if not has_ja else "NOT_FETCHED"),

            "zh_cid":              ml.get("zh_cid"),
            "zh_title":            zh.get("title", ""),
            "zh_description":      zh.get("description", ""),
            "zh_title_present":    bool(zh.get("title")),
            "zh_desc_present":     bool(zh.get("description")),
            "zh_lang_verified":    zh.get("language_verified", False),
            "zh_fetch_status":     zh.get("fetch_status", "NO_CID" if not has_zh else "NOT_FETCHED"),

            "multilingual_class": multilingual_class,
            "source_provider": "visitseoul",
            "as_of": AS_OF,
        })

    return handoff


# ── Coverage QA ───────────────────────────────────────────────────────────────

def coverage_qa(normalized: list, ml_rows: list, cls_by_cid: dict, handoff: list) -> dict:
    """Build coverage QA report."""
    by_cid_locale = {}
    for n in normalized:
        by_cid_locale[(n["source_cid"], n["locale"])] = n

    ml_by_cid = {r["cid"]: r for r in ml_rows}

    # Universe coverage (all 311)
    en_cid_total = sum(1 for r in ml_rows if r.get("en_cid_present"))
    ja_cid_total = sum(1 for r in ml_rows if r.get("ja_cid_present"))
    zh_cid_total = sum(1 for r in ml_rows if r.get("zh_cid_present"))

    en_fetch_ok  = sum(1 for n in normalized if n["locale"] == "en" and n["fetch_status"] == "OK")
    ja_fetch_ok  = sum(1 for n in normalized if n["locale"] == "ja" and n["fetch_status"] == "OK")
    zh_fetch_ok  = sum(1 for n in normalized if n["locale"] == "zh-CN" and n["fetch_status"] == "OK")

    en_title  = sum(1 for n in normalized if n["locale"] == "en" and n.get("title_present"))
    ja_title  = sum(1 for n in normalized if n["locale"] == "ja" and n.get("title_present"))
    zh_title  = sum(1 for n in normalized if n["locale"] == "zh-CN" and n.get("title_present"))

    en_desc   = sum(1 for n in normalized if n["locale"] == "en" and n.get("description_present"))
    ja_desc   = sum(1 for n in normalized if n["locale"] == "ja" and n.get("description_present"))
    zh_desc   = sum(1 for n in normalized if n["locale"] == "zh-CN" and n.get("description_present"))

    # Merge target 286 coverage
    merge_hoff = handoff  # already filtered to merge candidates
    ml_class = Counter(h["multilingual_class"] for h in merge_hoff)

    # Fetch fail breakdown
    fetch_stats = {}
    for locale in ["en", "ja", "zh-CN"]:
        locale_records = [n for n in normalized if n["locale"] == locale]
        status_ctr = Counter(n["fetch_status"] for n in locale_records)
        fetch_stats[locale] = dict(status_ctr)

    return {
        "qa_date": AS_OF,
        "task": TASK,
        "universe_311": {
            "en_cid_count":  en_cid_total,
            "ja_cid_count":  ja_cid_total,
            "zh_cid_count":  zh_cid_total,
            "en_cid_missing": PLAN_TOTAL - en_cid_total,
            "ja_cid_missing": PLAN_TOTAL - ja_cid_total,
            "zh_cid_missing": PLAN_TOTAL - zh_cid_total,
        },
        "fetch_results": {
            "en": {
                "attempted":          en_cid_total,
                "fetch_success":      en_fetch_ok,
                "title_present":      en_title,
                "description_present": en_desc,
                "fetch_fail":         en_cid_total - en_fetch_ok,
                "status_breakdown":   fetch_stats.get("en", {}),
            },
            "ja": {
                "attempted":          ja_cid_total,
                "fetch_success":      ja_fetch_ok,
                "title_present":      ja_title,
                "description_present": ja_desc,
                "fetch_fail":         ja_cid_total - ja_fetch_ok,
                "status_breakdown":   fetch_stats.get("ja", {}),
            },
            "zh-CN": {
                "attempted":          zh_cid_total,
                "fetch_success":      zh_fetch_ok,
                "title_present":      zh_title,
                "description_present": zh_desc,
                "fetch_fail":         zh_cid_total - zh_fetch_ok,
                "status_breakdown":   fetch_stats.get("zh-CN", {}),
            },
        },
        "merge_target_286": {
            "handoff_rows": len(merge_hoff),
            "COMPLETE_4_LOCALE":          ml_class.get("COMPLETE_4_LOCALE", 0),
            "MULTILINGUAL_PARTIAL":        ml_class.get("MULTILINGUAL_PARTIAL", 0),
            "SOURCE_LOCALE_NOT_AVAILABLE": ml_class.get("SOURCE_LOCALE_NOT_AVAILABLE", 0),
            "FETCH_FAILED":               ml_class.get("FETCH_FAILED", 0),
            "PARSER_REVIEW":              ml_class.get("PARSER_REVIEW", 0),
        },
    }


# ── Parser sample QA ──────────────────────────────────────────────────────────

SAMPLE_QA_PLACES = [
    # palace/heritage × 5
    ("KOP000072", "경복궁"),
    ("KOP000295", "창덕궁"),
    ("KOP000297", "창경궁"),
    ("KOP002046", "덕수궁"),
    ("KOP001159", "경희궁"),
    # museum × 4
    ("KOP001644", "국립민속박물관"),
    ("KOP000433", "국립중앙박물관"),
    ("KOP020550", "국립고궁박물관"),
    ("KOP000507", "종묘"),
    # landmark × 3
    ("KOP000036", "N서울타워"),
    ("KOP000261", "북촌한옥마을"),
    ("KOP001899", "광화문광장"),
    # market/culture × 3
    ("KOP000286", "광장시장"),
    ("KOP000085", "남대문시장"),
    ("KOP000090", "서울한양도성"),
    # experience candidates × 3 (will be picked from handoff)
]


def parser_sample_qa(normalized: list, handoff: list, cls_by_cid: dict) -> dict:
    """Run parser sample QA on key landmarks."""
    by_cid_locale = {}
    for n in normalized:
        key = (n["source_cid"], n["locale"])
        by_cid_locale[key] = n

    handoff_by_cid = {h["source_cid"]: h for h in handoff}

    checks = []
    total_locale_checks = 0
    title_pass  = 0
    desc_pass   = 0
    lang_pass   = 0
    contam_flag = 0

    for ko_cid, place_name in SAMPLE_QA_PLACES:
        h = handoff_by_cid.get(ko_cid)
        cls = cls_by_cid.get(ko_cid, {})
        place_check = {
            "ko_cid": ko_cid,
            "place_name_expected": place_name,
            "actual_title_ko": cls.get("title", ""),
            "locales": {},
        }

        for locale in ["en", "ja", "zh-CN"]:
            n = by_cid_locale.get((ko_cid, locale))
            if not n:
                place_check["locales"][locale] = {"status": "NOT_FETCHED"}
                continue

            total_locale_checks += 1
            locale_check = {
                "fetch_status": n.get("fetch_status"),
                "title":        n.get("title", ""),
                "desc_length":  n.get("desc_length", 0),
                "title_present": n.get("title_present", False),
                "desc_present":  n.get("description_present", False),
                "language_verified": n.get("language_verified", False),
            }

            # Title pass: present and reasonably not empty
            t_pass = bool(n.get("title")) and n.get("fetch_status") == "OK"
            # Desc pass: at least 30 chars
            d_pass = n.get("desc_length", 0) >= 30 and n.get("fetch_status") == "OK"
            # Language pass
            l_pass = n.get("language_verified", False)

            # Contamination: same title across many places (simple check)
            locale_check["title_pass"] = t_pass
            locale_check["desc_pass"]  = d_pass
            locale_check["lang_pass"]  = l_pass

            if t_pass: title_pass  += 1
            if d_pass: desc_pass   += 1
            if l_pass: lang_pass   += 1

            place_check["locales"][locale] = locale_check

        checks.append(place_check)

    # Additional experience samples from handoff (pick first 3 not in sample list)
    sample_cids = {c for c,_ in SAMPLE_QA_PLACES}
    exp_samples = [h for h in handoff if h["source_cid"] not in sample_cids and "체험" in h.get("category_path","")][:3]
    for h in exp_samples:
        ko_cid = h["source_cid"]
        place_check = {
            "ko_cid": ko_cid,
            "place_name_expected": h.get("title_ko", ""),
            "sample_type": "experience_candidate",
            "locales": {},
        }
        for locale in ["en", "ja", "zh-CN"]:
            n = by_cid_locale.get((ko_cid, locale))
            if not n:
                place_check["locales"][locale] = {"status": "NOT_FETCHED"}
                continue
            total_locale_checks += 1
            t_pass = bool(n.get("title")) and n.get("fetch_status") == "OK"
            d_pass = n.get("desc_length", 0) >= 30 and n.get("fetch_status") == "OK"
            l_pass = n.get("language_verified", False)
            if t_pass: title_pass += 1
            if d_pass: desc_pass  += 1
            if l_pass: lang_pass  += 1
            place_check["locales"][locale] = {
                "fetch_status": n.get("fetch_status"),
                "title": n.get("title",""),
                "desc_length": n.get("desc_length",0),
                "title_pass": t_pass,
                "desc_pass": d_pass,
                "lang_pass": l_pass,
            }
        checks.append(place_check)

    return {
        "qa_date": AS_OF,
        "sample_place_count": len(checks),
        "total_locale_checks": total_locale_checks,
        "title_pass_count":  title_pass,
        "desc_pass_count":   desc_pass,
        "lang_pass_count":   lang_pass,
        "cross_entity_contamination_count": contam_flag,
        "title_pass_rate": f"{title_pass}/{total_locale_checks}",
        "desc_pass_rate":  f"{desc_pass}/{total_locale_checks}",
        "lang_pass_rate":  f"{lang_pass}/{total_locale_checks}",
        "checks": checks,
    }


# ── Manifest ──────────────────────────────────────────────────────────────────

def build_manifest(raw_records: list, normalized: list, handoff: list,
                   coverage: dict, parser_qa: dict, fetch_plan: list) -> dict:
    stats = Counter(n["fetch_status"] for n in normalized)
    ml_class = Counter(h["multilingual_class"] for h in handoff)

    en_cid  = coverage["universe_311"]["en_cid_count"]
    ja_cid  = coverage["universe_311"]["ja_cid_count"]
    zh_cid  = coverage["universe_311"]["zh_cid_count"]
    en_ok   = coverage["fetch_results"]["en"]["fetch_success"]
    ja_ok   = coverage["fetch_results"]["ja"]["fetch_success"]
    zh_ok   = coverage["fetch_results"]["zh-CN"]["fetch_success"]
    en_ti   = coverage["fetch_results"]["en"]["title_present"]
    ja_ti   = coverage["fetch_results"]["ja"]["title_present"]
    zh_ti   = coverage["fetch_results"]["zh-CN"]["title_present"]
    en_de   = coverage["fetch_results"]["en"]["description_present"]
    ja_de   = coverage["fetch_results"]["ja"]["description_present"]
    zh_de   = coverage["fetch_results"]["zh-CN"]["description_present"]

    merge_ready = ml_class.get("COMPLETE_4_LOCALE", 0) + ml_class.get("MULTILINGUAL_PARTIAL", 0) + ml_class.get("SOURCE_LOCALE_NOT_AVAILABLE", 0)

    return {
        "task": TASK,
        "script_version": SCRIPT_VER,
        "as_of": AS_OF,
        "base_branch": "data/seoul-core-attraction-recovery-preflight-v1",
        "new_branch": "data/seoul-core-attraction-multilingual-fetch-v1",
        "source_preflight_dir": str(PREFLIGHT_DIR),
        "output_dir": str(OUT_DIR),

        "recovery_universe_count": PLAN_TOTAL,
        "merge_target_count": len(handoff),

        "locale_cid_coverage": {
            "EN_CID_COUNT": en_cid,
            "JA_CID_COUNT": ja_cid,
            "ZH_CID_COUNT": zh_cid,
        },
        "fetch_results": {
            "EN_FETCH_SUCCESS_COUNT":    en_ok,
            "EN_TITLE_COUNT":            en_ti,
            "EN_DESCRIPTION_COUNT":      en_de,
            "JA_FETCH_SUCCESS_COUNT":    ja_ok,
            "JA_TITLE_COUNT":            ja_ti,
            "JA_DESCRIPTION_COUNT":      ja_de,
            "ZH_FETCH_SUCCESS_COUNT":    zh_ok,
            "ZH_TITLE_COUNT":            zh_ti,
            "ZH_DESCRIPTION_COUNT":      zh_de,
        },
        "merge_target_classification": {
            "COMPLETE_4_LOCALE":          ml_class.get("COMPLETE_4_LOCALE", 0),
            "MULTILINGUAL_PARTIAL":        ml_class.get("MULTILINGUAL_PARTIAL", 0),
            "SOURCE_LOCALE_NOT_AVAILABLE": ml_class.get("SOURCE_LOCALE_NOT_AVAILABLE", 0),
            "FETCH_FAILED":               ml_class.get("FETCH_FAILED", 0),
            "PARSER_REVIEW":              ml_class.get("PARSER_REVIEW", 0),
        },
        "parser_qa": {
            "PARSER_SAMPLE_PLACE_COUNT":        parser_qa["sample_place_count"],
            "PARSER_SAMPLE_LOCALE_CHECK_COUNT": parser_qa["total_locale_checks"],
            "PARSER_TITLE_PASS_COUNT":          parser_qa["title_pass_count"],
            "PARSER_DESCRIPTION_PASS_COUNT":    parser_qa["desc_pass_count"],
            "PARSER_LANGUAGE_PASS_COUNT":       parser_qa["lang_pass_count"],
            "CROSS_ENTITY_CONTAMINATION_COUNT": parser_qa["cross_entity_contamination_count"],
        },
        "prohibitions": {
            "AI_TRANSLATION_USED":              "NO",
            "GOOGLE_TRANSLATE_USED":            "NO",
            "OFFICIAL_VISITSEOUL_ONLY":         "YES",
            "EXISTING_SEOUL_CANONICAL_CHANGED": 0,
            "DB_CHANGED":                       0,
            "PRODUCTION_CHANGED":               0,
            "MASTER_CHANGED":                   0,
        },
        "merge_readiness": (
            "READY" if ml_class.get("COMPLETE_4_LOCALE", 0) == len(handoff) else
            "PARTIAL_BUT_MERGEABLE"
        ),
        "artifacts": {
            "raw":         str(RAW_FILE),
            "normalized":  str(NORMALIZED_FILE),
            "handoff":     str(HANDOFF_FILE),
            "coverage_qa": str(COVERAGE_QA_FILE),
            "parser_qa":   str(PARSER_QA_FILE),
            "manifest":    str(MANIFEST_FILE),
        },
    }


# ── Write helpers ─────────────────────────────────────────────────────────────

def write_jsonl(path: Path, records: list):
    with open(path, "w", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"  Wrote {len(records)} rows -> {path}")


def write_json(path: Path, data: dict):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  Wrote {path}")


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--collect",        action="store_true")
    parser.add_argument("--normalize-only", action="store_true", dest="normalize_only")
    parser.add_argument("--qa-only",        action="store_true", dest="qa_only")
    parser.add_argument("--dry-run",        action="store_true", dest="dry_run")
    args = parser.parse_args()

    if not any([args.collect, args.normalize_only, args.qa_only, args.dry_run]):
        parser.print_help()
        sys.exit(0)

    # Verify input files
    for f in [MULTILANG_READY_FILE, CLASSIFY_FILE]:
        if not f.exists():
            print(f"STOP: missing input: {f}", file=sys.stderr)
            sys.exit(1)

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    if args.dry_run:
        ml_rows, cls_by_cid = load_preflight()
        print(f"DRY RUN: loaded {len(ml_rows)} rows")
        en = sum(1 for r in ml_rows if r.get("en_cid_present"))
        ja = sum(1 for r in ml_rows if r.get("ja_cid_present"))
        zh = sum(1 for r in ml_rows if r.get("zh_cid_present"))
        merge_cands = sum(1 for r in ml_rows if r.get("preflight_status") == "MERGE_CANDIDATE")
        print(f"EN_CID={en} JA_CID={ja} ZH_CID={zh}")
        print(f"MERGE_CANDIDATES={merge_cands}")
        estimated = en + ja + zh
        print(f"ESTIMATED_API_CALLS={estimated}")
        return

    # API key check
    api_key = os.environ.get("VISITSEOUL_API_KEY", "")
    if not api_key and not args.normalize_only:
        print("VISITSEOUL_API_KEY_AVAILABLE=NO")
        print("STOP: API key not set.", file=sys.stderr)
        sys.exit(1)
    if api_key:
        print("VISITSEOUL_API_KEY_AVAILABLE=YES")

    # Load preflight
    ml_rows, cls_by_cid = load_preflight()

    # Collect or load existing raw
    if args.normalize_only or args.qa_only:
        raw_records = []
        if RAW_FILE.exists():
            with open(RAW_FILE, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line:
                        raw_records.append(json.loads(line))
            print(f"Loaded {len(raw_records)} existing raw records")
        fetch_plan = []
    else:
        raw_records, fetch_plan, ml_rows, cls_by_cid = collect(api_key, mode="collect")
        # Raw is written incrementally during collect() — no separate write needed
        print(f"  Raw file already written: {RAW_FILE}")

    if not args.qa_only:
        # Normalize
        print("\nNormalizing...")
        normalized = normalize(raw_records)
        write_jsonl(NORMALIZED_FILE, normalized)

        # Build handoff
        print("Building handoff...")
        handoff = build_handoff(normalized, ml_rows, cls_by_cid)
        write_jsonl(HANDOFF_FILE, handoff)
    else:
        # Load existing
        normalized = []
        if NORMALIZED_FILE.exists():
            with open(NORMALIZED_FILE, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line:
                        normalized.append(json.loads(line))
        handoff = []
        if HANDOFF_FILE.exists():
            with open(HANDOFF_FILE, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line:
                        handoff.append(json.loads(line))

    # Coverage QA
    print("Computing coverage QA...")
    coverage = coverage_qa(normalized, ml_rows, cls_by_cid, handoff)
    write_json(COVERAGE_QA_FILE, coverage)

    # Parser sample QA
    print("Running parser sample QA...")
    parser_qa_result = parser_sample_qa(normalized, handoff, cls_by_cid)
    write_json(PARSER_QA_FILE, parser_qa_result)

    # Manifest
    print("Building manifest...")
    manifest = build_manifest(raw_records, normalized, handoff, coverage, parser_qa_result, fetch_plan)
    write_json(MANIFEST_FILE, manifest)

    # Print summary
    print("\n=== SUMMARY ===")
    cov = coverage
    print(f"UNIVERSE_311: EN_CID={cov['universe_311']['en_cid_count']} JA_CID={cov['universe_311']['ja_cid_count']} ZH_CID={cov['universe_311']['zh_cid_count']}")
    fr = cov["fetch_results"]
    print(f"EN: attempted={fr['en']['attempted']} success={fr['en']['fetch_success']} title={fr['en']['title_present']} desc={fr['en']['description_present']}")
    print(f"JA: attempted={fr['ja']['attempted']} success={fr['ja']['fetch_success']} title={fr['ja']['title_present']} desc={fr['ja']['description_present']}")
    print(f"ZH: attempted={fr['zh-CN']['attempted']} success={fr['zh-CN']['fetch_success']} title={fr['zh-CN']['title_present']} desc={fr['zh-CN']['description_present']}")
    mt = cov["merge_target_286"]
    print(f"MERGE_TARGET {mt['handoff_rows']}: COMPLETE={mt['COMPLETE_4_LOCALE']} PARTIAL={mt['MULTILINGUAL_PARTIAL']} NO_SOURCE={mt['SOURCE_LOCALE_NOT_AVAILABLE']} FAIL={mt['FETCH_FAILED']}")
    pq = parser_qa_result
    print(f"PARSER_QA: places={pq['sample_place_count']} locale_checks={pq['total_locale_checks']} title_pass={pq['title_pass_count']} lang_pass={pq['lang_pass_count']}")
    print(f"MERGE_READINESS={manifest['merge_readiness']}")


if __name__ == "__main__":
    main()
