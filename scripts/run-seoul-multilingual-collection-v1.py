#!/usr/bin/env python3
"""
TASK-SEOUL-MULTILINGUAL-CONTENT-COLLECTION-V1

Collect official EN / JA / zh-CN multilingual text for Seoul 1,837 places
using existing VisitSeoul multilingual CIDs from the Seoul canonical.

Policy SSOT: data/multicity-common @ 1fb26351d4e195cdc6218d3b4417309e1f1838f3
Contract:    docs/data-collection/multicity-multilingual-canonical-contract-v2.md

Required fields per locale:
  - title        (post_sj from API)
  - short_description (post_desc from API)

Optional fields collected if API returns them:
  - hours / opening_hours
  - closed_day
  - usage_info
  - raw_description (full HTML description, separate field)

Rules:
  - VISITSEOUL_API_KEY read from env, never printed/logged/committed
  - KO data NOT re-collected (existing canonical used)
  - zh-TW NOT collected
  - No new places created
  - No canonical modification
  - No translation/AI generation
  - CID-missing records → NO_POINTER gap (not fuzzy-matched)
  - Canary (5 records per locale) before full run
  - DELAY=1.0s between requests
  - MAX_RETRIES=2 per CID

Usage:
  # Canary only (default):
  python scripts/run-seoul-multilingual-collection-v1.py --canary

  # Full collection (requires --allow-full):
  python scripts/run-seoul-multilingual-collection-v1.py --allow-full

  # Single locale:
  python scripts/run-seoul-multilingual-collection-v1.py --allow-full --locale en

Output:
  data/seoul-multilingual-v1/seoul-multilingual-enrichment-v1.jsonl
  data/seoul-multilingual-v1/seoul-multilingual-coverage-qa-v1.json
  data/seoul-multilingual-v1/seoul-multilingual-gaps-v1.jsonl
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

# ── Constants ─────────────────────────────────────────────────────────────────

SCRIPT_VERSION   = "v1.0.0"
BASE_URL         = "https://api-call.visitseoul.net/api/v1"
TIMEOUT          = 20       # seconds per request
DELAY            = 1.0      # seconds between requests
MAX_RETRIES      = 2        # retries per CID on transient error
CANARY_SIZE      = 5        # records per locale in canary
SOURCE_PROVIDER  = "VisitSeoul"
PROVENANCE_TYPE  = "OFFICIAL_SOURCE"

LOCALES = {
    "en":    {"cid_prefix": "ENP", "cid_key": "en"},
    "ja":    {"cid_prefix": "JPP", "cid_key": "ja"},
    "zh-CN": {"cid_prefix": "CNP", "cid_key": "zh-CN"},
}

CANONICAL_PATH   = Path("data/seoul-final-release/seoul-canonical-places-v1.jsonl")
OUTPUT_DIR       = Path("data/seoul-multilingual-v1")
ENRICHMENT_FILE  = OUTPUT_DIR / "seoul-multilingual-enrichment-v1.jsonl"
QA_FILE          = OUTPUT_DIR / "seoul-multilingual-coverage-qa-v1.json"
GAPS_FILE        = OUTPUT_DIR / "seoul-multilingual-gaps-v1.jsonl"

# Secret redaction
_SECRET_RE = re.compile(
    r'(?:VISITSEOUL[-_]?API[-_]?KEY|api[-_]?key|token|secret|bearer|credential)'
    r'\s*[=:]\s*\S+',
    re.IGNORECASE,
)
_LONG_TOKEN_RE = re.compile(r'[A-Za-z0-9]{48,}')


# ── API helpers ───────────────────────────────────────────────────────────────

def get_api_key() -> str:
    """Load VISITSEOUL_API_KEY from env. Never prints/logs/commits value."""
    key = os.environ.get("VISITSEOUL_API_KEY", "")
    if not key:
        print("VISITSEOUL_API_KEY_AVAILABLE=NO", flush=True)
        sys.exit("STOP: VISITSEOUL_API_KEY not found in environment.")
    print("VISITSEOUL_API_KEY_AVAILABLE=YES", flush=True)
    return key


def post_json(path: str, body: dict, api_key: str) -> dict:
    """POST JSON to VisitSeoul API. Never logs api_key."""
    url = f"{BASE_URL}/{path}"
    data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type":       "application/json; charset=utf-8",
            "VISITSEOUL-API-KEY": api_key,
            "Accept":             "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_content(cid: str, locale: str, api_key: str) -> dict:
    """Fetch one CID for given locale. Returns raw API response dict."""
    return post_json("contents/info", {"language": locale, "cid": cid}, api_key)


def redact(text: str) -> str:
    """Remove potential secrets from text before storing."""
    text = _SECRET_RE.sub("[REDACTED]", text)
    # Only redact very long tokens that look like random values
    # Conservative: check if it has mixed case + digits pattern
    def maybe_redact_token(m):
        t = m.group(0)
        if (any(c.isupper() for c in t) and any(c.islower() for c in t)
                and any(c.isdigit() for c in t)):
            return "[REDACTED_TOKEN]"
        return t
    return _LONG_TOKEN_RE.sub(maybe_redact_token, text)


# ── Canonical parsing ─────────────────────────────────────────────────────────

def load_canonical(path: Path) -> list[dict]:
    """Load Seoul canonical JSONL. Returns list of dicts."""
    records = []
    with open(path, "r", encoding="utf-8-sig") as f:
        for ln in f:
            ln = ln.strip()
            if not ln:
                continue
            try:
                records.append(json.loads(ln))
            except json.JSONDecodeError:
                pass
    return records


def extract_cids(record: dict) -> dict[str, str]:
    """
    Extract {locale: cid} mapping from a canonical record.
    Handles both string format "en:ENP000217,ja:JPP000217,..."
    and object format {"en": "ENP000217", "ja": "JPP000217", ...}.
    Returns only the required locales (en, ja, zh-CN).
    """
    raw = record.get("multilingual_cids")
    if not raw:
        return {}

    if isinstance(raw, str):
        parts = {}
        for segment in raw.split(","):
            segment = segment.strip()
            if ":" in segment:
                key, val = segment.split(":", 1)
                parts[key.strip()] = val.strip()
        return {loc: parts[loc] for loc in LOCALES if parts.get(loc)}

    elif isinstance(raw, dict):
        return {loc: raw[loc] for loc in LOCALES if raw.get(loc)}

    return {}


# ── Result record ─────────────────────────────────────────────────────────────

def make_result(
    canonical_id: str,
    source_cid: str,
    locale: str,
    api_resp: dict,
    collected_at: str,
    status: str,
    error: str = "",
) -> dict:
    """Build one enrichment record from API response."""
    content = api_resp.get("data") or {}
    if isinstance(content, list):
        content = content[0] if content else {}

    raw_title = str(content.get("post_sj") or "").strip()
    raw_desc  = str(content.get("post_desc") or content.get("description") or "").strip()

    # Redact before storing
    raw_title = redact(raw_title)
    raw_desc  = redact(raw_desc)

    # Optional operational fields
    optional = {}
    for field in ("opening_hours", "close_day", "usage_info", "homepage", "tel"):
        val = content.get(field)
        if val and str(val).strip():
            optional[field] = redact(str(val).strip())

    return {
        "canonical_place_id": canonical_id,
        "source_cid":         source_cid,
        "locale":             locale,
        "title":              raw_title,
        "short_description":  raw_desc,
        "optional_fields":    optional,
        "source_provider":    SOURCE_PROVIDER,
        "source_locale":      locale,
        "provenance_type":    PROVENANCE_TYPE,
        "collected_at":       collected_at,
        "collection_status":  status,
        "error":              error,
    }


# ── Fetch with retry ──────────────────────────────────────────────────────────

def fetch_with_retry(cid: str, locale: str, api_key: str) -> tuple[dict, str]:
    """
    Fetch CID with MAX_RETRIES retries on transient errors.
    Returns (api_response_dict, error_str).
    error_str="" on success.
    """
    last_error = ""
    for attempt in range(MAX_RETRIES + 1):
        if attempt > 0:
            wait = DELAY * (attempt + 1)
            print(f"    retry {attempt}/{MAX_RETRIES} after {wait:.1f}s …", flush=True)
            time.sleep(wait)
        try:
            resp = fetch_content(cid, locale, api_key)
            return resp, ""
        except urllib.error.HTTPError as e:
            last_error = f"HTTP_{e.code}"
            if e.code in (401, 403, 404):
                break  # No point retrying auth/not-found errors
        except Exception as e:
            last_error = f"ERROR:{type(e).__name__}"
    return {}, last_error


# ── Canary ────────────────────────────────────────────────────────────────────

def run_canary(records: list[dict], locale: str, api_key: str) -> bool:
    """
    Run canary: fetch CANARY_SIZE records for given locale.
    Returns True if canary passes (at least 1 success with non-empty title).
    """
    locale_cfg = LOCALES[locale]
    canary_records = [r for r in records if extract_cids(r).get(locale)][:CANARY_SIZE]
    if not canary_records:
        print(f"  [CANARY:{locale}] No CID records found. SKIP.", flush=True)
        return False

    print(f"  [CANARY:{locale}] Testing {len(canary_records)} records …", flush=True)
    successes = 0
    for r in canary_records:
        cids = extract_cids(r)
        cid = cids[locale]
        canonical_id = r.get("source_cid", "?")
        try:
            resp, err = fetch_with_retry(cid, locale, api_key)
            if err:
                print(f"    {canonical_id}/{cid}: ERROR {err}", flush=True)
                continue
            content = resp.get("data") or {}
            if isinstance(content, list):
                content = content[0] if content else {}
            title = str(content.get("post_sj") or "").strip()
            desc  = str(content.get("post_desc") or "").strip()
            ok = bool(title)
            status = "OK" if ok else "EMPTY_TITLE"
            print(f"    {canonical_id}/{cid}: {status} | title={title[:40]!r}", flush=True)
            if ok:
                successes += 1
        except Exception as e:
            print(f"    {canonical_id}/{cid}: EXCEPTION {e}", flush=True)
        time.sleep(DELAY)

    passed = successes >= 1
    print(f"  [CANARY:{locale}] {'PASS' if passed else 'FAIL'} ({successes}/{len(canary_records)} success)", flush=True)
    return passed


# ── Full collection ───────────────────────────────────────────────────────────

def collect_locale(
    records: list[dict],
    locale: str,
    api_key: str,
    collected_at: str,
    out_f,
    gaps_f,
) -> dict:
    """
    Collect all CIDs for given locale. Write results to open file handles.
    Returns QA counters dict.
    """
    qa = {
        "locale":                   locale,
        "pointer_count":            0,
        "no_pointer":               0,
        "fetch_attempted":          0,
        "fetch_success":            0,
        "title_present":            0,
        "short_description_present":0,
        "required_core_ready":      0,
        "api_not_found":            0,
        "parse_failed":             0,
        "empty_response":           0,
        "other_error":              0,
    }
    total = len(records)

    for i, rec in enumerate(records, 1):
        canonical_id = rec.get("source_cid", f"UNKNOWN_{i}")
        cids = extract_cids(rec)
        cid = cids.get(locale)

        if (i % 100) == 0:
            print(f"  [{locale}] {i}/{total} …", flush=True)

        if not cid:
            qa["no_pointer"] += 1
            gap = {"canonical_place_id": canonical_id, "locale": locale,
                   "gap_type": "NO_POINTER", "collected_at": collected_at}
            gaps_f.write(json.dumps(gap, ensure_ascii=False) + "\n")
            continue

        qa["pointer_count"] += 1
        qa["fetch_attempted"] += 1

        resp, err = fetch_with_retry(cid, locale, api_key)

        if err:
            if "HTTP_404" in err:
                qa["api_not_found"] += 1
                status = "API_NOT_FOUND"
            elif "HTTP_" in err:
                qa["parse_failed"] += 1
                status = "HTTP_ERROR"
            else:
                qa["other_error"] += 1
                status = "OTHER_ERROR"
            result = make_result(canonical_id, cid, locale, {}, collected_at, status, err)
            out_f.write(json.dumps(result, ensure_ascii=False) + "\n")
            gap = {"canonical_place_id": canonical_id, "locale": locale,
                   "gap_type": status, "error": err, "collected_at": collected_at}
            gaps_f.write(json.dumps(gap, ensure_ascii=False) + "\n")
            time.sleep(DELAY)
            continue

        content = resp.get("data") or {}
        if isinstance(content, list):
            content = content[0] if content else {}

        if not content:
            qa["empty_response"] += 1
            result = make_result(canonical_id, cid, locale, resp, collected_at, "EMPTY_RESPONSE")
            out_f.write(json.dumps(result, ensure_ascii=False) + "\n")
            gap = {"canonical_place_id": canonical_id, "locale": locale,
                   "gap_type": "EMPTY_RESPONSE", "collected_at": collected_at}
            gaps_f.write(json.dumps(gap, ensure_ascii=False) + "\n")
            time.sleep(DELAY)
            continue

        qa["fetch_success"] += 1
        result = make_result(canonical_id, cid, locale, resp, collected_at, "SUCCESS")

        if result["title"]:
            qa["title_present"] += 1
        if result["short_description"]:
            qa["short_description_present"] += 1
        if result["title"] and result["short_description"]:
            qa["required_core_ready"] += 1

        out_f.write(json.dumps(result, ensure_ascii=False) + "\n")

        if not result["title"]:
            gap = {"canonical_place_id": canonical_id, "locale": locale,
                   "gap_type": "EMPTY_TITLE", "collected_at": collected_at}
            gaps_f.write(json.dumps(gap, ensure_ascii=False) + "\n")

        time.sleep(DELAY)

    return qa


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Seoul multilingual enrichment collector")
    parser.add_argument("--canary",     action="store_true",
                        help="Run canary only (5 records per locale). DEFAULT.")
    parser.add_argument("--allow-full", action="store_true",
                        help="Run full collection after canary passes.")
    parser.add_argument("--locale",     choices=list(LOCALES.keys()),
                        help="Collect only this locale (default: all).")
    args = parser.parse_args()

    if not args.allow_full:
        args.canary = True

    locales_to_run = [args.locale] if args.locale else list(LOCALES.keys())

    print(f"SCRIPT_VERSION={SCRIPT_VERSION}", flush=True)
    print(f"MODE={'canary_only' if not args.allow_full else 'full'}", flush=True)
    print(f"LOCALES={locales_to_run}", flush=True)
    print(f"COMMON_MULTILINGUAL_POLICY_COMMIT=1fb26351d4e195cdc6218d3b4417309e1f1838f3", flush=True)

    api_key = get_api_key()
    records = load_canonical(CANONICAL_PATH)
    print(f"CANONICAL_RECORDS_LOADED={len(records)}", flush=True)

    # ── Canary phase ───────────────────────────────────────────────────────────
    print("\n=== CANARY PHASE ===", flush=True)
    canary_results = {}
    for locale in locales_to_run:
        canary_results[locale] = run_canary(records, locale, api_key)

    if not args.allow_full:
        print("\n=== CANARY COMPLETE (--allow-full not set, stopping) ===", flush=True)
        for loc, passed in canary_results.items():
            print(f"  CANARY_{loc.upper().replace('-','_')}_PASS={passed}", flush=True)
        return

    # Check all canaries passed
    failed = [loc for loc, ok in canary_results.items() if not ok]
    if failed:
        sys.exit(f"STOP: Canary FAILED for locale(s): {failed}. Investigate before full run.")

    print("\n=== FULL COLLECTION PHASE ===", flush=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    collected_at = datetime.now(timezone.utc).isoformat()
    all_qa = {}

    with (
        open(ENRICHMENT_FILE, "w", encoding="utf-8") as out_f,
        open(GAPS_FILE, "w", encoding="utf-8") as gaps_f,
    ):
        for locale in locales_to_run:
            print(f"\n--- Collecting locale: {locale} ---", flush=True)
            qa = collect_locale(records, locale, api_key, collected_at, out_f, gaps_f)
            all_qa[locale] = qa
            print(f"  [{locale}] DONE | fetch_success={qa['fetch_success']} "
                  f"required_core_ready={qa['required_core_ready']} "
                  f"no_pointer={qa['no_pointer']} "
                  f"api_not_found={qa['api_not_found']}", flush=True)

    # ── QA summary ────────────────────────────────────────────────────────────
    qa_report = {
        "schema":               "seoul-multilingual-coverage-qa-v1",
        "generated_at":         collected_at,
        "source_service_count": len(records),
        "new_places_created":   0,
        "seoul_canonical_changed": 0,
        "coord_changed":        0,
        "nav_ai_changed":       0,
        "translation_used":     False,
        "zh_tw_collected":      False,
        "policy_commit":        "1fb26351d4e195cdc6218d3b4417309e1f1838f3",
        "locales":              all_qa,
    }

    with open(QA_FILE, "w", encoding="utf-8") as f:
        json.dump(qa_report, f, ensure_ascii=False, indent=2)

    print("\n=== QA SUMMARY ===", flush=True)
    for locale, qa in all_qa.items():
        print(f"\n[{locale}]", flush=True)
        for k, v in qa.items():
            if k != "locale":
                print(f"  {k}: {v}", flush=True)

    print(f"\nENRICHMENT_FILE={ENRICHMENT_FILE}", flush=True)
    print(f"QA_FILE={QA_FILE}", flush=True)
    print(f"GAPS_FILE={GAPS_FILE}", flush=True)
    print("\nSEOUL_MULTILINGUAL_COLLECTION=COMPLETE", flush=True)


if __name__ == "__main__":
    main()
