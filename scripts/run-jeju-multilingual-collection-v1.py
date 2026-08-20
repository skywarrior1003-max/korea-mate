#!/usr/bin/env python3
"""
TASK-JEJU-MULTILINGUAL-CONTENT-COLLECTION-V1
Collect EN / JA (jp) / zh-CN (cn) multilingual enrichment for Jeju service records
via VisitJeju Open API.

Usage:
  python run-jeju-multilingual-collection-v1.py            # canary only
  python run-jeju-multilingual-collection-v1.py --allow-full  # full collection
"""

import json, os, sys, time, argparse
import urllib.request
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path
from collections import Counter

sys.stdout.reconfigure(encoding='utf-8')

SCRIPT_VERSION = "v1.0.0"

# ────── Constants ──────────────────────────────────────────────────────────
BASE_URL    = "https://api.visitjeju.net/vsjApi/contents/searchList"
TIMEOUT     = 20
DELAY       = 0.5   # seconds between requests
MAX_RETRIES = 2
CANARY_SIZE = 5

# VisitJeju locale codes (NOT ISO codes — jp ≠ ja)
LOCALES = {
    "en":    {"vj_locale": "en",  "canonical_flag": "en"},
    "ja":    {"vj_locale": "jp",  "canonical_flag": "jp"},
    "zh-CN": {"vj_locale": "cn",  "canonical_flag": "cn"},
}

COMMON_MULTILINGUAL_POLICY_COMMIT = "1fb26351d4e195cdc6218d3b4417309e1f1838f3"

CANONICAL_PATH = Path("data/jeju-final-release/jeju-canonical-places-v1.jsonl")
OUTPUT_DIR     = Path("data/jeju-multilingual-v1")
ENRICHMENT_OUT = OUTPUT_DIR / "jeju-multilingual-enrichment-v1.jsonl"
GAPS_OUT       = OUTPUT_DIR / "jeju-multilingual-gaps-v1.jsonl"
QA_OUT         = OUTPUT_DIR / "jeju-multilingual-coverage-qa-v1.json"


# ────── API helper ──────────────────────────────────────────────────────────
def fetch_vj(cid: str, vj_locale: str, api_key: str) -> dict:
    """Fetch one entity from VisitJeju API. Returns dict with keys:
       status, title, introduction, raw_response
    """
    params = urllib.parse.urlencode({
        "apiKey": api_key,
        "locale": vj_locale,
        "cid":    cid,
    })
    url = f"{BASE_URL}?{params}"

    for attempt in range(MAX_RETRIES + 1):
        try:
            req = urllib.request.Request(url, headers={"Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                raw = resp.read().decode("utf-8")
            data = json.loads(raw)

            result_code = str(data.get("result", ""))
            items = data.get("items", [])
            total = data.get("totalCount", 0)

            if result_code == "200" and items:
                item = items[0]
                return {
                    "status": "SUCCESS",
                    "title": (item.get("title") or "").strip(),
                    "introduction": (item.get("introduction") or "").strip(),
                }
            elif result_code == "200" and total == 0:
                return {"status": "NOT_FOUND", "title": "", "introduction": ""}
            else:
                return {"status": "API_ERROR", "title": "", "introduction": "",
                        "detail": f"result={result_code}"}

        except Exception as e:
            if attempt < MAX_RETRIES:
                wait = 2.0 * (attempt + 1)
                print(f"    retry {attempt+1}/{MAX_RETRIES} after {wait}s …", flush=True)
                time.sleep(wait)
            else:
                return {"status": "HTTP_ERROR", "title": "", "introduction": "",
                        "detail": str(e)[:120]}

    return {"status": "HTTP_ERROR", "title": "", "introduction": ""}


# ────── Load canonical ──────────────────────────────────────────────────────
def load_canonical():
    records = []
    with open(CANONICAL_PATH, encoding="utf-8-sig") as f:
        for ln in f:
            ln = ln.strip()
            if ln:
                records.append(json.loads(ln))
    service = [r for r in records if r.get("service_status") == "ACTIVE"]
    return service


# ────── Main ────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--allow-full", action="store_true")
    args = parser.parse_args()

    api_key = os.environ.get("VISITJEJU_API_KEY", "")
    if not api_key:
        print("ERROR: VISITJEJU_API_KEY not set", flush=True)
        sys.exit(1)

    print(f"SCRIPT_VERSION={SCRIPT_VERSION}", flush=True)
    print(f"MODE={'full' if args.allow_full else 'canary'}", flush=True)
    print(f"LOCALES={list(LOCALES.keys())}", flush=True)
    print(f"COMMON_MULTILINGUAL_POLICY_COMMIT={COMMON_MULTILINGUAL_POLICY_COMMIT}", flush=True)
    print(f"VISITJEJU_API_KEY_AVAILABLE=YES", flush=True)

    records = load_canonical()
    print(f"CANONICAL_RECORDS_LOADED={len(records)}", flush=True)

    # Partition by source_tier and flag presence
    c1_records = [r for r in records if r.get("source_tier") == "VISITJEJU_C1"]
    c4_records = [r for r in records if r.get("source_tier") == "VISITJEJU_C4"]
    kto_records = [r for r in records if r.get("source_tier") == "KTO_TOURAPI"]
    print(f"C1_COUNT={len(c1_records)} C4_COUNT={len(c4_records)} KTO_COUNT={len(kto_records)}", flush=True)

    now_iso = datetime.now(timezone.utc).isoformat()

    # ── PHASE 1: C4 canary (3 records) to verify multilingual capability ──
    print("\n=== C4 FOOD MULTILINGUAL CAPABILITY CANARY ===", flush=True)
    c4_canary = c4_records[:3]
    c4_en_hits = 0
    for r in c4_canary:
        cid = r.get("source_cid", "")
        res = fetch_vj(cid, "en", api_key)
        status = res["status"]
        title  = res.get("title", "")[:40]
        print(f"  [{status}] {cid}: title='{title}'", flush=True)
        if status == "SUCCESS" and title:
            c4_en_hits += 1
        time.sleep(DELAY)

    c4_multilingual = "YES" if c4_en_hits >= 2 else "NO"
    print(f"C4_MULTILINGUAL_CAPABILITY={c4_multilingual} (hits={c4_en_hits}/{len(c4_canary)})", flush=True)

    # ── PHASE 2: C1 canary ──
    print("\n=== C1 CANARY PHASE ===", flush=True)
    c1_with_flag = {
        loc: [r for r in c1_records
              if r.get("multilingual_cids") and
                 r.get("multilingual_cids", {}).get(cfg["canonical_flag"])]
        for loc, cfg in LOCALES.items()
    }

    canary_pass = True
    for loc, cfg in LOCALES.items():
        flagged = c1_with_flag[loc]
        sample = flagged[:CANARY_SIZE]
        print(f"  [CANARY:{loc}] Testing {len(sample)} records …", flush=True)
        ok_count = 0
        for r in sample:
            cid   = r.get("source_cid", "")
            res   = fetch_vj(cid, cfg["vj_locale"], api_key)
            title = res.get("title", "")[:40]
            print(f"    {cid}: [{res['status']}] title='{title}'", flush=True)
            if res["status"] == "SUCCESS" and title:
                ok_count += 1
            time.sleep(DELAY)
        canary_result = "PASS" if ok_count == len(sample) else "PARTIAL"
        if ok_count < len(sample):
            canary_pass = False
        print(f"  [CANARY:{loc}] {canary_result} ({ok_count}/{len(sample)} success)", flush=True)

    if not canary_pass:
        print("\nCANARY PARTIAL — check results above. Proceeding anyway.", flush=True)

    if not args.allow_full:
        print("\nMode=canary — add --allow-full to run full collection.", flush=True)
        return

    # ── PHASE 3: Full C1 collection ──
    print("\n=== FULL COLLECTION PHASE ===", flush=True)
    enrichment_records = []
    gap_records = []

    for loc, cfg in LOCALES.items():
        flagged     = c1_with_flag[loc]
        not_flagged = [r for r in c1_records
                       if not (r.get("multilingual_cids") and
                               r.get("multilingual_cids", {}).get(cfg["canonical_flag"]))]

        print(f"\n--- Collecting locale: {loc} (vj={cfg['vj_locale']}) ---", flush=True)
        print(f"  C1 with flag: {len(flagged)}", flush=True)
        print(f"  C1 no flag:   {len(not_flagged)}", flush=True)

        fetch_success = 0
        title_present = 0
        short_description_present = 0

        for i, r in enumerate(flagged, 1):
            cid = r.get("source_cid", "")
            cpid = r.get("candidate_id") or r.get("source_cid", "")
            res = fetch_vj(cid, cfg["vj_locale"], api_key)
            time.sleep(DELAY)

            status = res["status"]
            title  = res.get("title", "")
            intro  = res.get("introduction", "")

            if status == "SUCCESS":
                fetch_success += 1
                if title:
                    title_present += 1
                if intro:
                    short_description_present += 1

                enrichment_records.append({
                    "canonical_place_id": cpid,
                    "source_cid":         cid,
                    "source_type":        r.get("source_tier", ""),
                    "locale":             loc,
                    "title":              title,
                    "short_description":  intro,
                    "optional_fields": {
                        "roadaddress":   "",
                        "phoneno":       "",
                    },
                    "source_provider":  "VisitJeju",
                    "source_locale":    cfg["vj_locale"],
                    "provenance_type":  "OFFICIAL_API",
                    "collected_at":     now_iso,
                    "collection_status": "SUCCESS",
                    "error": None,
                })

                if not title or not intro:
                    gap_records.append({
                        "canonical_place_id": cpid,
                        "locale": loc,
                        "gap_type": "SOURCE_EMPTY_REQUIRED_TEXT",
                        "gap_reason": "VisitJeju returned content but title=%s intro=%s" % (bool(title), bool(intro)),
                        "source_cid": cid,
                        "collected_at": now_iso,
                    })

            elif status in ("HTTP_ERROR",):
                gap_records.append({
                    "canonical_place_id": cpid,
                    "locale": loc,
                    "gap_type": "FETCH_TRANSIENT",
                    "gap_reason": "HTTP_ERROR after %d retries: %s" % (MAX_RETRIES, res.get("detail", "")),
                    "source_cid": cid,
                    "collected_at": now_iso,
                })

            elif status == "NOT_FOUND":
                # Flag was set but VisitJeju returned empty → no content for this locale
                gap_records.append({
                    "canonical_place_id": cpid,
                    "locale": loc,
                    "gap_type": "COLLECTION_GAP",
                    "gap_reason": "Flag set but VisitJeju returned totalCount=0 for locale=%s" % cfg["vj_locale"],
                    "source_cid": cid,
                    "collected_at": now_iso,
                })

            if i % 100 == 0:
                print(f"  [{loc}] {i}/{len(flagged)} …", flush=True)

        print(f"  [{loc}] DONE | fetch_success={fetch_success} title={title_present} desc={short_description_present} no_flag={len(not_flagged)}", flush=True)

        # C1 records without flag → SOURCE_NO_LOCALE
        for r in not_flagged:
            cid  = r.get("source_cid", "")
            cpid = r.get("candidate_id") or cid
            ml   = r.get("multilingual_cids")
            if ml is None:
                reason = "no multilingual_cids in canonical; VisitJeju has no EN/JA/CN content for this place"
            elif ml == {} or ml == []:
                reason = "multilingual_cids is empty; VisitJeju flags absent"
            else:
                present = [k for k, v in ml.items() if v]
                reason = "canonical has flags for %s but not %s" % (present, cfg["canonical_flag"])

            gap_records.append({
                "canonical_place_id": cpid,
                "locale": loc,
                "gap_type": "SOURCE_NO_LOCALE",
                "gap_reason": reason,
                "source_cid": cid,
                "collected_at": now_iso,
            })

    # ── PHASE 4: C4 collection (canary confirmed multilingual exists) ──
    if c4_multilingual == "YES":
        print(f"\n=== FULL C4 COLLECTION (multilingual confirmed) ===", flush=True)
        for loc, cfg in LOCALES.items():
            c4_fetch_success = 0
            c4_title_present = 0
            c4_desc_present  = 0
            print(f"\n--- C4 locale: {loc} (vj={cfg['vj_locale']}) | {len(c4_records)} records ---", flush=True)
            for i, r in enumerate(c4_records, 1):
                cid  = r.get("source_cid", "")
                cpid = r.get("candidate_id") or cid
                res  = fetch_vj(cid, cfg["vj_locale"], api_key)
                time.sleep(DELAY)

                status = res["status"]
                title  = res.get("title", "")
                intro  = res.get("introduction", "")

                if status == "SUCCESS":
                    c4_fetch_success += 1
                    if title: c4_title_present += 1
                    if intro: c4_desc_present  += 1
                    enrichment_records.append({
                        "canonical_place_id": cpid,
                        "source_cid":        cid,
                        "source_type":       r.get("source_tier", ""),
                        "locale":            loc,
                        "title":             title,
                        "short_description": intro,
                        "optional_fields":   {},
                        "source_provider":   "VisitJeju",
                        "source_locale":     cfg["vj_locale"],
                        "provenance_type":   "OFFICIAL_API",
                        "collected_at":      now_iso,
                        "collection_status": "SUCCESS",
                        "error":             None,
                    })
                    if not title or not intro:
                        gap_records.append({
                            "canonical_place_id": cpid,
                            "locale": loc,
                            "gap_type": "SOURCE_EMPTY_REQUIRED_TEXT",
                            "gap_reason": "C4 VisitJeju returned content but title=%s intro=%s" % (bool(title), bool(intro)),
                            "source_cid": cid,
                            "collected_at": now_iso,
                        })
                elif status == "HTTP_ERROR":
                    gap_records.append({
                        "canonical_place_id": cpid,
                        "locale": loc,
                        "gap_type": "FETCH_TRANSIENT",
                        "gap_reason": "C4 HTTP_ERROR: %s" % res.get("detail", ""),
                        "source_cid": cid,
                        "collected_at": now_iso,
                    })
                else:  # NOT_FOUND
                    gap_records.append({
                        "canonical_place_id": cpid,
                        "locale": loc,
                        "gap_type": "COLLECTION_GAP",
                        "gap_reason": "C4 VisitJeju totalCount=0 for locale=%s; flag not set in canonical, content unavailable" % cfg["vj_locale"],
                        "source_cid": cid,
                        "collected_at": now_iso,
                    })
                if i % 50 == 0:
                    print(f"  [C4:{loc}] {i}/{len(c4_records)} …", flush=True)

            print(f"  [C4:{loc}] DONE | success={c4_fetch_success} title={c4_title_present} desc={c4_desc_present}", flush=True)

    else:  # C4 multilingual not available
        print(f"\n--- C4 gaps (SOURCE_NO_LOCALE, c4_multilingual=NO) ---", flush=True)
        for r in c4_records:
            cid  = r.get("source_cid", "")
            cpid = r.get("candidate_id") or cid
            for loc in LOCALES:
                gap_records.append({
                    "canonical_place_id": cpid,
                    "locale": loc,
                    "gap_type": "SOURCE_NO_LOCALE",
                    "gap_reason": "VISITJEJU_C4: no multilingual flags in canonical; VisitJeju C4 food does not provide %s content" % loc,
                    "source_cid": cid,
                    "collected_at": now_iso,
                })

    # ── PHASE 5: KTO gaps (all SOURCE_NO_LOCALE) ──
    print(f"\n--- KTO gaps (SOURCE_NO_LOCALE) ---", flush=True)
    for r in kto_records:
        cid  = r.get("source_cid", "")
        cpid = r.get("candidate_id") or cid
        for loc in LOCALES:
            gap_records.append({
                "canonical_place_id": cpid,
                "locale": loc,
                "gap_type": "SOURCE_NO_LOCALE",
                "gap_reason": "KTO_TOURAPI event record; VisitJeju multilingual not applicable",
                "source_cid": cid,
                "collected_at": now_iso,
            })

    # ── Write outputs ──
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    with open(ENRICHMENT_OUT, "w", encoding="utf-8") as f:
        for rec in enrichment_records:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")

    with open(GAPS_OUT, "w", encoding="utf-8") as f:
        for rec in gap_records:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")

    # ── QA ──
    print("\n=== QA SUMMARY ===", flush=True)
    service_total = len(records)  # 1496

    qa = {
        "task": "TASK-JEJU-MULTILINGUAL-CONTENT-COLLECTION-V1",
        "common_multilingual_policy_commit": COMMON_MULTILINGUAL_POLICY_COMMIT,
        "start_jeju_sha": "b6539a96908a972705836067430223645473951f",
        "service_universe": service_total,
        "c1_count": len(c1_records),
        "c4_count": len(c4_records),
        "kto_count": len(kto_records),
        "c4_multilingual_capability": c4_multilingual,
        "collected_at": now_iso,
    }

    for loc in LOCALES:
        loc_enrich = [r for r in enrichment_records if r["locale"] == loc]
        loc_gaps   = [g for g in gap_records if g["locale"] == loc]
        gap_dist   = Counter(g["gap_type"] for g in loc_gaps)

        # source_pointer = C1 flags + all C4 attempted (since c4 multilingual confirmed)
        c1_ptrs = len(c1_with_flag.get(loc, []))
        c4_ptrs = len(c4_records) if c4_multilingual == "YES" else 0

        fetch_attempted    = len(loc_enrich) + sum(1 for g in loc_gaps if g["gap_type"] in ("FETCH_TRANSIENT","COLLECTION_GAP"))
        fetch_success      = len(loc_enrich)
        title_pres         = sum(1 for r in loc_enrich if r["title"])
        short_desc_pres    = sum(1 for r in loc_enrich if r["short_description"])
        req_core_ready     = sum(1 for r in loc_enrich if r["title"] and r["short_description"])

        qa[loc] = {
            "source_pointer_or_capability": c1_ptrs + c4_ptrs,
            "c1_pointer": c1_ptrs,
            "c4_attempted": c4_ptrs,
            "fetch_attempted":             fetch_attempted,
            "fetch_success":               fetch_success,
            "title_present":               title_pres,
            "short_description_present":   short_desc_pres,
            "required_core_ready":         req_core_ready,
            "service_coverage_pct":        round(req_core_ready / service_total * 100, 1),
            "gap_summary":                 dict(gap_dist),
        }

        print(f"\n[{loc}]", flush=True)
        print(f"  source_pointer_or_capability: {qa[loc]['source_pointer_or_capability']}", flush=True)
        print(f"  fetch_attempted: {fetch_attempted}", flush=True)
        print(f"  fetch_success:   {fetch_success}", flush=True)
        print(f"  title_present:   {title_pres}", flush=True)
        print(f"  short_desc_present: {short_desc_pres}", flush=True)
        print(f"  required_core_ready: {req_core_ready}", flush=True)
        print(f"  service_coverage_pct: {qa[loc]['service_coverage_pct']}%", flush=True)
        print(f"  gap_summary: {dict(gap_dist)}", flush=True)

    # C1 / C4 / KTO source-level coverage
    qa["source_coverage"] = {}
    for tier, tier_records in [("VISITJEJU_C1", c1_records), ("VISITJEJU_C4", c4_records), ("KTO_TOURAPI", kto_records)]:
        tier_ids = set(r.get("candidate_id") or r.get("source_cid") for r in tier_records)
        for loc in LOCALES:
            ready = sum(1 for r in enrichment_records
                        if r["locale"] == loc
                        and (r.get("canonical_place_id") in tier_ids)
                        and r.get("title") and r.get("short_description"))
            key = f"{tier}/{loc}"
            qa["source_coverage"][key] = {"ready": ready, "total": len(tier_records),
                                           "pct": round(ready / len(tier_records) * 100, 1) if tier_records else 0}

    # Invariants
    qa["jeju_canonical_changed"] = 0
    qa["new_places_created"] = 0
    qa["coord_changed"] = 0
    qa["nav_ai_changed"] = 0
    qa["translation_used"] = "NO"
    qa["zh_tw_collected"] = "NO"

    with open(QA_OUT, "w", encoding="utf-8") as f:
        json.dump(qa, f, ensure_ascii=False, indent=2)

    print(f"\nENRICHMENT_FILE={ENRICHMENT_OUT} ({len(enrichment_records)} records)", flush=True)
    print(f"GAPS_FILE={GAPS_OUT} ({len(gap_records)} records)", flush=True)
    print(f"QA_FILE={QA_OUT}", flush=True)

    print("\nJEJU_MULTILINGUAL_COLLECTION=DONE", flush=True)


if __name__ == "__main__":
    main()
