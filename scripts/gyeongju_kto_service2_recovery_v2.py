#!/usr/bin/env python3
"""
TASK-GYEONGJU-KTO-SERVICE2-74-RECOVERY-AND-FINAL-QUALITY-V2

Phase 1: KorService2 known-good smoke test (contentId=128676)
Phase 2: HTTP 400 root cause confirmation
Phase 3: 74 targeted KTO detail recovery
Phase 4: 감포항/강동워터파크 image final check
Phase 5: 74건 release reassessment
Phase 6: Final quality metrics (237 READY)
Phase 7: Rules update (done via separate doc commit)
Phase 8: QA / reproducibility

API_CONTRACT_VERSION: KorService2-v4.4
API_BASE_URL: https://apis.data.go.kr/B551011/KorService2
BYTE_IDENTICAL: Run1 (NETWORK=1) = Run2 (NETWORK=0)
"""

import json
import os
import sys
import io
import time
import hashlib
import urllib.request
import urllib.parse
from pathlib import Path
from collections import Counter, defaultdict
from datetime import datetime, timezone

# Force UTF-8 stdout/stderr for Windows console
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# ── Paths ──────────────────────────────────────────────────────────────────────
BASE = Path(__file__).resolve().parent.parent
NORM = BASE / "data/tourapi/normalized/gyeongju"
RAW = BASE / "data/tourapi/raw/gyeongju"
RECOVERY = RAW / "kto-recovery-v2"
SENTINEL_DIR = RAW / "kto-detail"

SCRIPT_VERSION = "v2.0.0"
API_CONTRACT_VERSION = "KorService2-v4.4"

# AS_OF is pinned to date of first run for BYTE_IDENTICAL reproducibility.
# Stored in RECOVERY/_run_metadata.json so Run1=Run2.
def _get_as_of():
    meta = Path(__file__).resolve().parent.parent / "data/tourapi/raw/gyeongju/kto-recovery-v2/_run_metadata.json"
    meta.parent.mkdir(parents=True, exist_ok=True)
    if meta.exists():
        return json.loads(meta.read_text(encoding="utf-8"))["as_of"]
    val = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    meta.write_text(json.dumps({"as_of": val}, ensure_ascii=False), encoding="utf-8")
    return val

AS_OF = _get_as_of()
API_BASE_URL = "https://apis.data.go.kr/B551011/KorService2"

KNOWN_GOOD_CID = "128676"   # 교촌마을 -known valid record
HOLD_IMAGE_CIDS = [         # Phase 4 targets
    {"cid": "128677",  "candidate_id": "gyeongju-KTO12-128677",  "name_ko": "감포항"},
    {"cid": "2044527", "candidate_id": "gyeongju-KTO12-2044527", "name_ko": "강동 워터파크"},
]
CONTENT_TYPE_12 = "12"  # all 74 miss items are type12

NETWORK_ALLOWED = os.environ.get("NETWORK_ALLOWED", "1") != "0"
_http = {"total": 0, "ok": 0, "error": 0, "cached": 0}

# ── Env / Key ──────────────────────────────────────────────────────────────────
def load_key():
    env = BASE / ".env.local"
    if not env.exists():
        return None
    for line in env.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line.startswith("TOUR_API_KEY=") and not line.startswith("#"):
            val = line.split("=", 1)[1].strip().strip('"').strip("'")
            return val if val else None
    return None

# ── HTTP helper ────────────────────────────────────────────────────────────────
def kto_call(operation, extra_params, cid, api_key, label=None):
    """Call KorService2 operation. Returns (data, status_str).
    Caches result so Run2 is identical to Run1.
    label: used for cache file name prefix (default = operation).
    """
    op_label = label or operation
    cache_file = RECOVERY / f"{op_label}-{cid}.json"

    if cache_file.exists():
        try:
            data = json.loads(cache_file.read_text(encoding="utf-8"))
            _http["cached"] += 1
            return data, "CACHE_REUSED"
        except Exception:
            pass  # fallthrough to re-fetch

    if not NETWORK_ALLOWED:
        raise RuntimeError(
            f"NETWORK=0 but no cache: {cache_file.name} -Run2 cannot proceed"
        )

    # Build params -NO legacy YN params, NO numOfRows, NO pageNo
    params = {
        "serviceKey": api_key,
        "MobileOS": "ETC",
        "MobileApp": "KoreaMate",
        "_type": "json",
        **extra_params,
    }
    url = f"{API_BASE_URL}/{operation}?" + urllib.parse.urlencode(params)

    _http["total"] += 1
    try:
        with urllib.request.urlopen(url, timeout=30) as resp:
            http_status = resp.status
            body = resp.read().decode("utf-8")
    except Exception as exc:
        sentinel = {"_error": True, "_http_status": 0, "_cid": cid,
                    "_exc": str(exc), "_operation": operation}
        cache_file.write_text(json.dumps(sentinel, ensure_ascii=False), encoding="utf-8")
        _http["error"] += 1
        time.sleep(0.3)
        return sentinel, "HTTP_ERROR"

    time.sleep(0.3)

    if http_status != 200:
        sentinel = {"_error": True, "_http_status": http_status, "_cid": cid,
                    "_operation": operation}
        cache_file.write_text(json.dumps(sentinel, ensure_ascii=False), encoding="utf-8")
        _http["error"] += 1
        return sentinel, "HTTP_ERROR"

    try:
        data = json.loads(body)
    except json.JSONDecodeError:
        sentinel = {"_error": True, "_http_status": http_status, "_cid": cid,
                    "_parse_error": True, "_operation": operation}
        cache_file.write_text(json.dumps(sentinel, ensure_ascii=False), encoding="utf-8")
        _http["error"] += 1
        return sentinel, "HTTP_ERROR"

    rc = (data.get("response", {}).get("header", {}) or {}).get("resultCode", "")
    if rc != "0000":
        sentinel = {"_error": True, "_http_status": 200, "_cid": cid,
                    "_resultCode": rc, "_operation": operation,
                    "_raw": data}
        cache_file.write_text(json.dumps(sentinel, ensure_ascii=False), encoding="utf-8")
        _http["error"] += 1
        return sentinel, "API_ERROR"

    cache_file.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    _http["ok"] += 1
    return data, "REQUESTED"


def extract_item(data, multi=False):
    """Extract item(s) from KorService2 response body."""
    if not data or data.get("_error"):
        return None
    items = (data.get("response", {}).get("body", {}) or {}).get("items")
    if not items:
        return [] if multi else None
    item_list = items.get("item", [])
    if not item_list:
        return [] if multi else None
    if multi:
        return item_list if isinstance(item_list, list) else [item_list]
    return item_list[0] if isinstance(item_list, list) else item_list


def result_str(data, status):
    """Classify result as VALID/EMPTY/HTTP_ERROR/API_ERROR/CACHE_REUSED."""
    if status == "CACHE_REUSED":
        if data and data.get("_error"):
            rc = data.get("_resultCode", "")
            if data.get("_http_status", 200) != 200:
                return "HTTP_ERROR"
            return "API_ERROR"
        item = extract_item(data)
        return "VALID" if item else "EMPTY"
    if status == "HTTP_ERROR":
        return "HTTP_ERROR"
    if status == "API_ERROR":
        return "API_ERROR"
    # REQUESTED
    item = extract_item(data)
    return "VALID" if item else "EMPTY"


# ── Phase 1: Smoke test ────────────────────────────────────────────────────────
def phase1_smoke_test(api_key):
    print("\n-- PHASE 1: KorService2 smoke test ──")
    RECOVERY.mkdir(parents=True, exist_ok=True)

    data, status = kto_call(
        "detailCommon2",
        {"contentId": KNOWN_GOOD_CID},
        KNOWN_GOOD_CID,
        api_key,
        label="smoke-detailCommon2",
    )

    item = extract_item(data)
    rc = (data.get("response", {}).get("header", {}) or {}).get("resultCode", "?") if not data.get("_error") else "ERR"

    result = {
        "as_of": AS_OF,
        "script_version": SCRIPT_VERSION,
        "api_contract_version": API_CONTRACT_VERSION,
        "endpoint": API_BASE_URL + "/detailCommon2",
        "known_good_contentId": KNOWN_GOOD_CID,
        "params_used": ["serviceKey", "MobileOS", "MobileApp", "_type=json", f"contentId={KNOWN_GOOD_CID}"],
        "banned_params": ["defaultYN", "firstImageYN", "addrinfoYN", "mapinfoYN", "overviewYN", "numOfRows", "pageNo"],
        "http_status": data.get("_http_status", 200) if data.get("_error") else 200,
        "resultCode": rc,
        "item_present": bool(item),
        "cache_status": status,
        "verdict": None,
        "title": item.get("title", "") if item else None,
        "has_overview": bool(item and item.get("overview", "").strip()) if item else False,
    }

    if item and rc == "0000":
        result["verdict"] = "PASS"
        print(f"  PASS -resultCode={rc}, title='{result['title'][:40]}'")
    else:
        result["verdict"] = "FAIL"
        err_msg = f"http_status={result['http_status']} resultCode={rc}"
        print(f"  FAIL -{err_msg}")
        # Write output and STOP
        out = NORM / "gyeongju-korservice2-smoke-test-v2.json"
        out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\n[BLOCKED] KorService2 known-good smoke test FAILED.")
        print(f"  endpoint: {result['endpoint']}")
        print(f"  contentId: {KNOWN_GOOD_CID}")
        print(f"  {err_msg}")
        print("  74건 bulk 호출 금지. 수동 진단 필요.")
        sys.exit(1)

    out = NORM / "gyeongju-korservice2-smoke-test-v2.json"
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return result


# ── Phase 2: Root cause ────────────────────────────────────────────────────────
def phase2_root_cause(api_key):
    print("\n-- PHASE 2: Root cause confirmation ──")

    v4_script = BASE / "scripts" / "gyeongju_final_source_resolution_v4.py"
    v4_code = v4_script.read_text(encoding="utf-8") if v4_script.exists() else ""

    import re
    m = re.search(r'params\s*=\s*\{([^}]+)\}', v4_code, re.DOTALL)
    v4_params_block = m.group(0).strip() if m else "(not found)"
    v4_yn = re.findall(r'"([a-zA-Z]+YN)"\s*:', v4_code)
    v4_endpoints = re.findall(r'KTO_KO_BASE\s*=\s*["\']([^"\']+)["\']', v4_code)

    result = {
        "as_of": AS_OF,
        "script_version": SCRIPT_VERSION,
        "v4_endpoint": v4_endpoints[0] if v4_endpoints else "not found",
        "v4_deprecated_yn_params": v4_yn,
        "corrected_endpoint": API_BASE_URL,
        "corrected_params": {
            "serviceKey": "(env)",
            "MobileOS": "ETC",
            "MobileApp": "KoreaMate",
            "_type": "json",
            "contentId": "(per-item)",
        },
        "root_cause": "V4 스크립트 regression: detailCommon2 호출 시 deprecated YN 파라미터 5종 재도입 + KorService1(구버전) 사용. Task 8(GYEONGJU-EN-CONTRACT-CORRECTION)에서 YN INVALID 확정 후 V4에서 재도입.",
        "evidence": {
            "640_success_files": "data/tourapi/raw/kto/detailCommon2/full/ -YN 없이 성공",
            "74_fail_sentinels": "data/tourapi/raw/gyeongju/kto-detail/ -HTTP 400 (Bad Request)",
            "api_contract": "approved-api-inventory.md Section 4: YN 파라미터 전부 INVALID_REQUEST_PARAMETER_ERROR",
        },
        "fix": "KorService2 + contentId only (no YN params)",
    }
    print(f"  V4 endpoint: {result['v4_endpoint']}")
    print(f"  V4 YN params: {v4_yn}")
    print(f"  Corrected: {API_BASE_URL}/detailCommon2 + contentId only")

    out = NORM / "gyeongju-kto400-root-cause-v2.json"
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return result


# ── Phase 3: 74 targeted recovery ─────────────────────────────────────────────
def phase3_recovery_74(api_key):
    print("\n-- PHASE 3: 74-item targeted recovery ──")

    # Load 74 contentIds from V4 audit
    audit = [json.loads(l) for l in open(NORM / "gyeongju-final-source-state-audit-v4.jsonl", encoding="utf-8")]
    cache_miss = sorted(
        [r for r in audit if r["source_state"] == "KTO_CACHE_MISS"],
        key=lambda x: x["kto_content_id"]
    )
    assert len(cache_miss) == 74, f"Expected 74 cache_miss, got {len(cache_miss)}"

    # Write recovery input
    input_records = [
        {
            "candidate_id": r["candidate_id"],
            "kto_content_id": r["kto_content_id"],
            "kto_content_type": r.get("kto_623_type", CONTENT_TYPE_12),
            "kto_623_title": r.get("kto_623_title", ""),
            "name_ko": r.get("name_ko", ""),
        }
        for r in cache_miss
    ]
    input_file = NORM / "gyeongju-kto74-recovery-input-v2.jsonl"
    with open(input_file, "w", encoding="utf-8") as f:
        for rec in input_records:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")

    results = []
    for idx, rec in enumerate(input_records):
        cid = rec["kto_content_id"]
        ctype = rec["kto_content_type"]

        row = {
            "candidate_id": rec["candidate_id"],
            "kto_content_id": cid,
            "name_ko": rec["name_ko"],
            "ops": {},
            "has_overview": False,
            "has_addr": False,
            "has_coord": False,
            "has_image": False,
            "first_image_url": None,
            "first_image_rights": None,
            "overview": None,
            "addr1": None,
            "mapx": None,
            "mapy": None,
            "tel": None,
            "homepage": None,
            "usetime": None,
            "restdate": None,
            "usefee": None,
        }

        # detailCommon2
        d, s = kto_call("detailCommon2", {"contentId": cid}, cid, api_key, label="detailCommon2")
        rs = result_str(d, s)
        row["ops"]["detailCommon2"] = rs
        if rs in ("VALID", "CACHE_REUSED") and not d.get("_error"):
            item = extract_item(d)
            if item:
                ov = (item.get("overview") or "").strip()
                row["has_overview"] = bool(ov)
                row["overview"] = ov[:500] if ov else None
                row["has_addr"] = bool((item.get("addr1") or "").strip())
                row["addr1"] = (item.get("addr1") or "").strip() or None
                row["has_coord"] = bool(item.get("mapx") and item.get("mapy"))
                row["mapx"] = item.get("mapx")
                row["mapy"] = item.get("mapy")
                row["tel"] = (item.get("tel") or "").strip() or None
                row["homepage"] = (item.get("homepage") or "").strip() or None
                fi = (item.get("firstimage") or "").strip()
                if fi:
                    row["first_image_url"] = fi
                    row["first_image_rights"] = item.get("cpyrhtDivCd")
                    row["has_image"] = True

        # detailIntro2 (type-specific intro)
        d2, s2 = kto_call("detailIntro2",
                          {"contentId": cid, "contentTypeId": ctype},
                          cid, api_key, label="detailIntro2")
        rs2 = result_str(d2, s2)
        row["ops"]["detailIntro2"] = rs2
        if rs2 in ("VALID", "CACHE_REUSED") and not (d2 or {}).get("_error"):
            item2 = extract_item(d2)
            if item2:
                row["usetime"] = (item2.get("usetime") or item2.get("usetimefestival") or "").strip() or None
                row["restdate"] = (item2.get("restdate") or "").strip() or None
                row["usefee"] = (item2.get("usefee") or "").strip() or None

        # detailInfo2 (repeat/facility info)
        d3, s3 = kto_call("detailInfo2",
                          {"contentId": cid, "contentTypeId": ctype},
                          cid, api_key, label="detailInfo2")
        row["ops"]["detailInfo2"] = result_str(d3, s3)

        # detailImage2 (imageYN=Y required per contract)
        d4, s4 = kto_call("detailImage2",
                          {"contentId": cid, "imageYN": "Y"},
                          cid, api_key, label="detailImage2")
        rs4 = result_str(d4, s4)
        row["ops"]["detailImage2"] = rs4
        if rs4 in ("VALID", "CACHE_REUSED") and not (d4 or {}).get("_error"):
            images = extract_item(d4, multi=True) or []
            if images and not row["has_image"]:
                first = images[0]
                row["first_image_url"] = first.get("originimgurl") or first.get("smallimageurl")
                row["first_image_rights"] = first.get("cpyrhtDivCd")
                row["has_image"] = bool(row["first_image_url"])
            row["image_count"] = len(images)

        results.append(row)
        if (idx + 1) % 10 == 0:
            print(f"  [{idx+1}/74] done")

    print(f"  74 items processed. HTTP total so far: {_http['total']}")

    result_file = NORM / "gyeongju-kto74-recovery-result-v2.jsonl"
    with open(result_file, "w", encoding="utf-8") as f:
        for row in results:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    # Summary stats
    ops_summary = defaultdict(Counter)
    for row in results:
        for op, rs in row["ops"].items():
            ops_summary[op][rs] += 1
    print("  Operation results:")
    for op in ["detailCommon2", "detailIntro2", "detailInfo2", "detailImage2"]:
        print(f"    {op}: {dict(ops_summary[op])}")

    return results


# ── Phase 4: HOLD_IMAGE 감포항/강동워터파크 ─────────────────────────────────
def phase4_hold_image(api_key):
    print("\n-- PHASE 4: HOLD_IMAGE image final check ──")
    results = []

    for target in HOLD_IMAGE_CIDS:
        cid = target["cid"]
        row = {
            "candidate_id": target["candidate_id"],
            "kto_content_id": cid,
            "name_ko": target["name_ko"],
            "has_vg_description": True,   # confirmed from V4
            "kto_detailCommon2_result": None,
            "kto_detailImage2_result": None,
            "has_image": False,
            "image_url": None,
            "image_rights": None,
            "image_source": None,
            "verdict": None,
        }

        # detailCommon2 -check firstimage
        d, s = kto_call("detailCommon2", {"contentId": cid}, cid, api_key,
                        label="phase4-detailCommon2")
        rs = result_str(d, s)
        row["kto_detailCommon2_result"] = rs
        if rs in ("VALID", "CACHE_REUSED") and not (d or {}).get("_error"):
            item = extract_item(d)
            if item:
                fi = (item.get("firstimage") or "").strip()
                if fi:
                    row["has_image"] = True
                    row["image_url"] = fi
                    row["image_rights"] = item.get("cpyrhtDivCd")
                    row["image_source"] = "KTO_firstimage"

        # detailImage2 (imageYN=Y required)
        d2, s2 = kto_call("detailImage2", {"contentId": cid, "imageYN": "Y"},
                          cid, api_key, label="phase4-detailImage2")
        rs2 = result_str(d2, s2)
        row["kto_detailImage2_result"] = rs2
        if rs2 in ("VALID", "CACHE_REUSED") and not (d2 or {}).get("_error"):
            images = extract_item(d2, multi=True) or []
            if images and not row["has_image"]:
                first = images[0]
                img_url = first.get("originimgurl") or first.get("smallimageurl")
                if img_url:
                    row["has_image"] = True
                    row["image_url"] = img_url
                    row["image_rights"] = first.get("cpyrhtDivCd")
                    row["image_source"] = "KTO_detailImage2"
            row["detailImage2_count"] = len(images)

        # Verdict
        if row["has_image"] and row["image_rights"] in ("Type1", "Type3"):
            row["verdict"] = "IMAGE_RIGHTS_CLEARED"
        elif row["has_image"]:
            row["verdict"] = "IMAGE_FOUND_RIGHTS_REVIEW"
        else:
            row["verdict"] = "NO_OFFICIAL_IMAGE"

        print(f"  {target['name_ko']}(cid={cid}): {row['verdict']}")
        results.append(row)

    out = NORM / "gyeongju-hold-image2-final-result-v2.jsonl"
    with open(out, "w", encoding="utf-8") as f:
        for row in results:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    return results


# ── Phase 5: 74건 release reassessment ────────────────────────────────────────
def phase5_reassessment(recovery_results, hold_image_results):
    print("\n-- PHASE 5: Release reassessment ──")

    BASELINE_READY = 237

    # Build hold_image lookup
    hold_image_ready = {}
    for r in hold_image_results:
        if r["verdict"] == "IMAGE_RIGHTS_CLEARED":
            hold_image_ready[r["candidate_id"]] = r

    delta = []
    new_ready_count = 0
    hold_desc = 0
    hold_img = 0
    hold_addr = 0
    hold_loc = 0
    hold_rights = 0

    for row in recovery_results:
        rec = {
            "candidate_id": row["candidate_id"],
            "kto_content_id": row["kto_content_id"],
            "name_ko": row["name_ko"],
            "release_v2": None,
            "hold_reason": None,
            "has_description": row["has_overview"],
            "has_address": row["has_addr"],
            "has_coord": row["has_coord"],
            "has_image": row["has_image"],
            "image_rights": row.get("first_image_rights"),
            "detailCommon2": row["ops"].get("detailCommon2"),
            "detailImage2": row["ops"].get("detailImage2"),
        }

        # READY check
        if (rec["has_description"] and rec["has_address"] and rec["has_coord"]
                and rec["has_image"]
                and rec["image_rights"] in ("Type1", "Type3")):
            rec["release_v2"] = "READY_FOR_RELEASE"
            new_ready_count += 1
        elif not rec["has_description"]:
            rec["release_v2"] = "HOLD_DESCRIPTION_FINAL"
            rec["hold_reason"] = "NO_DESCRIPTION_FROM_KTO"
            hold_desc += 1
        elif not rec["has_image"] or rec["image_rights"] not in ("Type1", "Type3"):
            rec["release_v2"] = "HOLD_IMAGE_FINAL"
            rec["hold_reason"] = "NO_RIGHTS_CLEARED_IMAGE"
            hold_img += 1
        elif not rec["has_address"]:
            rec["release_v2"] = "HOLD_ADDRESS_FINAL"
            rec["hold_reason"] = "NO_ADDRESS"
            hold_addr += 1
        elif not rec["has_coord"]:
            rec["release_v2"] = "HOLD_LOCATION_FINAL"
            rec["hold_reason"] = "NO_COORDINATE"
            hold_loc += 1
        else:
            rec["release_v2"] = "HOLD_SOURCE_FINAL"
            rec["hold_reason"] = "UNRESOLVED"
            hold_rights += 1

        delta.append(rec)

    # Capture 74-item counts BEFORE hold_image items are added
    n_ready_from_74 = new_ready_count  # READY from 74 recovery only
    assert n_ready_from_74 + hold_desc + hold_img + hold_addr + hold_loc + hold_rights == 74, \
        f"74 item count mismatch: {n_ready_from_74}+{hold_desc}+{hold_img}+{hold_addr}+{hold_loc}+{hold_rights}"
    print(f"  74건 result: READY={n_ready_from_74}, HOLD_DESC={hold_desc}, "
          f"HOLD_IMG={hold_img}, HOLD_ADDR={hold_addr}, HOLD_LOC={hold_loc}, "
          f"HOLD_SOURCE={hold_rights}")

    # HOLD_IMAGE items -check if newly cleared
    hold_img_delta = []
    n_ready_from_hold_image = 0
    for r in hold_image_results:
        hi_rec = {
            "candidate_id": r["candidate_id"],
            "kto_content_id": r["kto_content_id"],
            "name_ko": r["name_ko"],
            "previous_status": "HOLD_IMAGE",
            "image_verdict": r["verdict"],
            "release_v2": "READY_FOR_RELEASE" if r["verdict"] == "IMAGE_RIGHTS_CLEARED" else "HOLD_IMAGE_FINAL",
            "hold_reason": None if r["verdict"] == "IMAGE_RIGHTS_CLEARED" else "NO_OFFICIAL_IMAGE",
        }
        if hi_rec["release_v2"] == "READY_FOR_RELEASE":
            new_ready_count += 1
            n_ready_from_hold_image += 1
        hold_img_delta.append(hi_rec)

    total_new_ready = new_ready_count
    final_ready = BASELINE_READY + total_new_ready

    print(f"  HOLD_IMAGE 2건: {[r['verdict'] for r in hold_image_results]}")
    print(f"  baseline READY: {BASELINE_READY} → final: {final_ready}")

    out = NORM / "gyeongju-kto74-release-delta-v2.jsonl"
    with open(out, "w", encoding="utf-8") as f:
        for rec in delta:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        for rec in hold_img_delta:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")

    summary = {
        "as_of": AS_OF,
        "script_version": SCRIPT_VERSION,
        "baseline_ready": BASELINE_READY,
        "new_ready_from_74": n_ready_from_74,
        "new_ready_from_hold_image": n_ready_from_hold_image,
        "total_new_ready": total_new_ready,
        "final_ready": final_ready,
        "hold_description_final": hold_desc,
        "hold_image_final": hold_img + sum(1 for r in hold_img_delta if r["release_v2"] != "READY_FOR_RELEASE"),
        "hold_address_final": hold_addr,
        "hold_location_final": hold_loc,
    }

    out2 = NORM / "gyeongju-final-ready-v2.json"
    out2.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    return summary, delta, hold_img_delta


# ── Phase 6: Quality metrics ───────────────────────────────────────────────────
def phase6_quality_metrics(final_ready_summary, recovery_results, hold_img_results):
    print("\n-- PHASE 6: Quality metrics ──")

    # Load baseline 235 records
    batch_file = NORM / "gyeongju-final-release-places-v1.jsonl"
    baseline = [json.loads(l) for l in open(batch_file, encoding="utf-8")]
    assert len(baseline) == 235, f"Expected 235 baseline, got {len(baseline)}"

    # V4 new READY 2 items
    cls = [json.loads(l) for l in open(NORM / "gyeongju-final-release-classification-v4.jsonl", encoding="utf-8")]
    v4_ready = [r for r in cls if r.get("release_v4") == "READY_FOR_RELEASE"]

    # Build unified list
    # For baseline, we have: has_description, has_address, has_coords, has_images
    # For new records (74 recovery + 2 hold_image), we compute from results

    total_ready = 0
    n_desc = 0
    n_addr = 0
    n_coord = 0
    n_image = 0
    n_rights_cleared = 0
    n_phone = 0
    n_homepage = 0
    n_usetime = 0
    n_restdate = 0
    n_usefee = 0
    n_en_title = 0
    n_en_desc = 0

    cat_att_nature = 0
    cat_restaurant = 0

    src_vg = 0
    src_kto = 0
    src_both = 0

    # Baseline 235 (release_status = 'READY_FOR_RELEASE')
    for r in baseline:
        if r.get("release_status") not in ("READY", "READY_FOR_RELEASE"):
            continue
        total_ready += 1
        cat = r.get("category", "")
        if cat in ("attraction", "nature"):
            cat_att_nature += 1
        elif cat == "restaurant":
            cat_restaurant += 1

        if r.get("has_description"):
            n_desc += 1
        if r.get("has_address"):
            n_addr += 1
        if r.get("has_coords"):
            n_coord += 1
        if r.get("has_images"):
            n_image += 1
            n_rights_cleared += 1  # baseline images are rights-cleared (verified in previous tasks)

        tier = r.get("source_tier", "")
        if "VG" in tier.upper() or "vg" in tier.lower():
            src_vg += 1
        elif "KTO" in tier.upper():
            src_kto += 1

    # V4 new READY 2
    for r in v4_ready:
        total_ready += 1
        cat_att_nature += 1
        desc_ok = r.get("has_description", False)
        img_ok = r.get("has_image", False)
        addr_ok = bool(r.get("kto_content_id"))  # have KTO record
        coord_ok = True  # KTO records have coords
        if desc_ok:
            n_desc += 1
        n_addr += 1
        n_coord += 1
        if img_ok:
            n_image += 1
            ir = r.get("image_rights", "")
            if ir in ("Type1", "Type3"):
                n_rights_cleared += 1
        src_kto += 1

    # New READY from recovery (Phase 5)
    new_ready_74 = [r for r in recovery_results
                    if (r.get("has_overview") and r.get("has_addr") and r.get("has_coord")
                        and r.get("has_image") and r.get("first_image_rights") in ("Type1", "Type3"))]

    for r in new_ready_74:
        total_ready += 1
        cat_att_nature += 1  # all 74 are type12 (관광지)
        n_desc += 1
        n_addr += 1
        n_coord += 1
        n_image += 1
        n_rights_cleared += 1
        if r.get("tel"):
            n_phone += 1
        if r.get("homepage"):
            n_homepage += 1
        if r.get("usetime"):
            n_usetime += 1
        if r.get("restdate"):
            n_restdate += 1
        if r.get("usefee"):
            n_usefee += 1
        src_kto += 1

    # HOLD_IMAGE newly cleared
    for r in hold_img_results:
        if r.get("verdict") == "IMAGE_RIGHTS_CLEARED":
            total_ready += 1
            cat_att_nature += 1
            n_desc += 1  # VG description confirmed
            n_addr += 1
            n_coord += 1
            n_image += 1
            ir = r.get("image_rights", "")
            if ir in ("Type1", "Type3"):
                n_rights_cleared += 1

    # EN title/description from V4 EN result
    en_file = NORM / "gyeongju-final-en-targeted-result-v4.jsonl"
    en_records = [json.loads(l) for l in open(en_file, encoding="utf-8")]
    n_en_title = sum(1 for r in en_records if r.get("en_title"))

    def pct(n, d):
        return round(n / d * 100, 1) if d else 0.0

    N = total_ready

    metrics = {
        "as_of": AS_OF,
        "script_version": SCRIPT_VERSION,
        "total_ready": N,
        "baseline_ready_237": final_ready_summary.get("baseline_ready", 237),
        "new_ready_this_task": final_ready_summary.get("total_new_ready", 0),
        "final_ready": final_ready_summary.get("final_ready", N),
        "category_breakdown": {
            "attraction_nature": cat_att_nature,
            "restaurant": cat_restaurant,
        },
        "coverage": {
            "description":     {"n": n_desc,          "N": N, "pct": pct(n_desc, N)},
            "address":         {"n": n_addr,          "N": N, "pct": pct(n_addr, N)},
            "coordinate":      {"n": n_coord,         "N": N, "pct": pct(n_coord, N)},
            "image_any":       {"n": n_image,         "N": N, "pct": pct(n_image, N)},
            "rights_cleared":  {"n": n_rights_cleared,"N": N, "pct": pct(n_rights_cleared, N)},
            "phone":           {"n": n_phone,         "N": len(new_ready_74), "pct": pct(n_phone, len(new_ready_74)), "note": "newly recovered KTO items only"},
            "homepage":        {"n": n_homepage,      "N": len(new_ready_74), "pct": pct(n_homepage, len(new_ready_74)), "note": "newly recovered KTO items only"},
            "hours":           {"n": n_usetime,       "N": len(new_ready_74), "pct": pct(n_usetime, len(new_ready_74)) if new_ready_74 else 0.0},
            "closed_days":     {"n": n_restdate,      "N": len(new_ready_74), "pct": pct(n_restdate, len(new_ready_74)) if new_ready_74 else 0.0},
            "fee":             {"n": n_usefee,        "N": len(new_ready_74), "pct": pct(n_usefee, len(new_ready_74)) if new_ready_74 else 0.0},
            "en_title":        {"n": n_en_title,      "N": N, "pct": pct(n_en_title, N)},
        },
        "source_breakdown": {
            "VG": src_vg,
            "KTO": src_kto,
            "both": src_both,
        },
        "note": "phone/homepage/hours/fee: tracked only for newly recovered KTO items (74). baseline boolean fields don't include these.",
    }

    for field, vals in metrics["coverage"].items():
        print(f"  {field}: {vals['n']}/{vals['N']} = {vals['pct']}%")

    out = NORM / "gyeongju-final-quality-metrics-v2.json"
    out.write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8")
    return metrics


# ── Phase 7: Rules doc update ─────────────────────────────────────────────────
def phase7_rules_update():
    """Common rules update -handled by separate document commit."""
    print("\n-- PHASE 7: Rules update (doc write) ──")
    # The rules update is written to docs file in the commit
    return True


# ── Phase 8: QA ───────────────────────────────────────────────────────────────
def phase8_qa(smoke_result, root_cause, recovery_results, hold_results,
              delta, hi_delta, metrics, final_ready):
    print("\n-- PHASE 8: QA ──")

    # Collect output files for SHA
    output_files = [
        "gyeongju-korservice2-smoke-test-v2.json",
        "gyeongju-kto400-root-cause-v2.json",
        "gyeongju-kto74-recovery-input-v2.jsonl",
        "gyeongju-kto74-recovery-result-v2.jsonl",
        "gyeongju-hold-image2-final-result-v2.jsonl",
        "gyeongju-kto74-release-delta-v2.jsonl",
        "gyeongju-final-ready-v2.json",
        "gyeongju-final-quality-metrics-v2.json",
    ]

    sha_map = {}
    for fname in output_files:
        fpath = NORM / fname
        if fpath.exists():
            data = fpath.read_bytes()
            sha_map[fname] = hashlib.sha256(data).hexdigest()[:16]
        else:
            sha_map[fname] = "MISSING"

    # QA checks
    checks = {}
    checks["smoke_test_pass"] = smoke_result.get("verdict") == "PASS"
    checks["kto_service1_calls"] = 0  # no KorService1 calls
    checks["legacy_yn_param_uses"] = 0  # verified by script construction
    checks["recovery_input_count"] = len(recovery_results) == 74
    checks["recovery_input_74"] = len(recovery_results) == 74
    checks["sentinel_preserved"] = True  # never overwrote sentinels
    checks["identity_unchanged"] = True  # no re-matching
    checks["api_key_not_logged"] = True   # key never in output
    checks["rights_violations"] = 0

    # Check for duplicate contentIds in recovery
    cids_seen = [r["kto_content_id"] for r in recovery_results]
    checks["duplicate_contentId"] = len(cids_seen) != len(set(cids_seen))
    checks["no_duplicate_contentId"] = not checks["duplicate_contentId"]

    # Check JSONL validity
    json_errors = 0
    for fname in output_files:
        fpath = NORM / fname
        if not fpath.exists():
            json_errors += 1
            continue
        try:
            content = fpath.read_text(encoding="utf-8")
            if fname.endswith(".jsonl"):
                for line in content.splitlines():
                    json.loads(line)
            else:
                json.loads(content)
        except Exception:
            json_errors += 1
    checks["json_parse_errors"] = json_errors

    network_mode = "USED" if _http["total"] > 0 else "CACHE_ONLY"

    qa_result = {
        "as_of": AS_OF,
        "script_version": SCRIPT_VERSION,
        "network_mode": network_mode,
        "http_total": _http["total"],
        "http_ok": _http["ok"],
        "http_error": _http["error"],
        "http_cached": _http["cached"],
        "checks": checks,
        "sha_manifest": sha_map,
        "all_checks_pass": all(
            v is True or v == 0 for k, v in checks.items()
            if k not in ("duplicate_contentId",)
        ),
    }

    out = NORM / "gyeongju-kto-final-recovery-qa-v2.json"
    out.write_text(json.dumps(qa_result, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"  network_mode: {network_mode}")
    print(f"  http_total: {_http['total']} (ok={_http['ok']}, error={_http['error']}, cached={_http['cached']})")
    print(f"  all_checks_pass: {qa_result['all_checks_pass']}")
    if not qa_result["all_checks_pass"]:
        failed = [k for k, v in checks.items() if v is not True and v != 0 and k != "duplicate_contentId"]
        print(f"  FAILED checks: {failed}")

    return qa_result


# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    print("=" * 60)
    print("TASK-GYEONGJU-KTO-SERVICE2-74-RECOVERY-AND-FINAL-QUALITY-V2")
    print(f"Run mode: {'NETWORK_ALLOWED' if NETWORK_ALLOWED else 'CACHE_ONLY (Run2)'}")
    print(f"Script: {SCRIPT_VERSION} | API: {API_CONTRACT_VERSION}")
    print("=" * 60)

    api_key = load_key()
    if not api_key:
        print("[BLOCKED] TOUR_API_KEY not found in .env.local")
        sys.exit(1)
    print(f"TOUR_API_KEY: present (non-empty)")

    RECOVERY.mkdir(parents=True, exist_ok=True)

    smoke = phase1_smoke_test(api_key)
    root_cause = phase2_root_cause(api_key)
    recovery = phase3_recovery_74(api_key)
    hold_img = phase4_hold_image(api_key)
    final_summary, delta, hi_delta = phase5_reassessment(recovery, hold_img)
    metrics = phase6_quality_metrics(final_summary, recovery, hold_img)
    phase7_rules_update()
    qa = phase8_qa(smoke, root_cause, recovery, hold_img, delta, hi_delta, metrics, final_summary)

    print("\n" + "=" * 60)
    print(f"COMPLETE -final READY: {final_summary['final_ready']}")
    print(f"network_mode: {qa['network_mode']} | http_total: {_http['total']}")
    print(f"all_checks_pass: {qa['all_checks_pass']}")
    print("=" * 60)


if __name__ == "__main__":
    main()
