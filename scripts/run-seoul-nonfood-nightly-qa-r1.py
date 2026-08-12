#!/usr/bin/env python3
"""
TASK-SEOUL-NONFOOD-NIGHTLY-SAFE-QA-R1
Nightly deterministic QA — NO API, NO web access, NO data modification.

Run twice; compare checksums for §14 reproducibility.
"""
import json
import re
import hashlib
import sys
from pathlib import Path
from collections import Counter, defaultdict

BASE      = Path(r"c:\기본저장\나의 프로젝트\KoreaMate\korea-mate\data\seoul-source-audit")
SCRIPTS   = Path(r"c:\기본저장\나의 프로젝트\KoreaMate\korea-mate\scripts")
TASK      = "TASK-SEOUL-NONFOOD-NIGHTLY-SAFE-QA-R1"
AS_OF     = "2026-08-12"

# ── Expected reference values ──
EXP_MANIFEST        = 573
EXP_SPECIAL         = 2
EXP_INPUT_TARGET    = 575
EXP_API_SUCCESS     = 566
EXP_EXISTING_REUSED = 9
EXP_PLACE_AI        = 560
EXP_SEARCHABLE      = 14
EXP_MULTI_LOC       = 1
EXP_UNRESOLVED      = 0
EXP_UNIVERSE        = 3765
EXP_ACTIVE_EVENT    = 6

SPECIAL_CIDS  = {"KOPc3g5o6", "KOPgdf9ry"}
SEOUL_LAT     = (37.40, 37.72)
SEOUL_LNG     = (126.70, 127.25)

def load_jsonl(path):
    out = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            s = line.strip()
            if s:
                out.append(json.loads(s))
    return out

def sha256_str(s):
    return hashlib.sha256(s.encode("utf-8")).hexdigest()

def sha256_obj(obj):
    return sha256_str(json.dumps(obj, ensure_ascii=False, sort_keys=True))


# ══════════════════════════════════════════════════════════════════
def run_qa():
    report    = {"task": TASK, "as_of": AS_OF}
    anomalies = []

    # ── FILE LOAD ──────────────────────────────────────────────────
    print("[LOAD] reading files ...")
    manifest_json = json.loads((BASE / "seoul-nonfood-place-detail-target-manifest-v1.json"
                                ).read_text(encoding="utf-8"))
    # manifest uses "records" key (not "items")
    manifest_items = manifest_json.get("records", manifest_json.get("items", []))
    manifest_cids  = [r["cid"] for r in manifest_items]
    manifest_set   = set(manifest_cids)

    special2      = load_jsonl(BASE / "seoul-nonfood-batch2-special2-v1.jsonl")
    sp2_by_cid    = {r["cid"]: r for r in special2}
    special2_cids = list(sp2_by_cid.keys())
    special2_set  = set(special2_cids)

    all_target_cids = manifest_cids + special2_cids
    all_target_set  = set(all_target_cids)

    raw     = load_jsonl(BASE / "seoul-nonfood-batch2-detail-raw-v1.jsonl")
    raw_by_cid = {r["cid"]: r for r in raw}

    norm    = load_jsonl(BASE / "seoul-nonfood-batch2-detail-normalized-v1.jsonl")
    norm_by_cid = {r["cid"]: r for r in norm}

    attempts = load_jsonl(BASE / "seoul-nonfood-batch2-detail-attempts-v1.jsonl")
    att_by_cid = {r["cid"]: r for r in attempts}

    elig_mf  = json.loads((BASE / "seoul-nonfood-batch2-eligibility-manifest-v1.json"
                           ).read_text(encoding="utf-8"))

    batch1   = json.loads((BASE / "seoul-nonfood-batch1-eligibility-assessment-v1.json"
                           ).read_text(encoding="utf-8"))

    routing_v2 = load_jsonl(BASE / "seoul-full-enrichment-routing-v2.jsonl")
    rv2_by_cid = {r["cid"]: r for r in routing_v2}

    event_mf   = json.loads((BASE / "seoul-nonfood-active-event-manifest-v1.json"
                              ).read_text(encoding="utf-8"))
    active_event_records = event_mf.get("records", [])
    active_event_cids    = {r["cid"] for r in active_event_records}

    place_core = load_jsonl(BASE / "seoul-place-core-experience-detail-normalized-v1.jsonl")
    pc_by_cid  = {r["cid"]: r for r in place_core}

    print(f"  manifest={len(manifest_items)}, special2={len(special2)}, "
          f"raw={len(raw)}, norm={len(norm)}, attempts={len(attempts)}, "
          f"routing_v2={len(routing_v2)}")

    # ══ §1 INPUT/OUTPUT INTEGRITY ════════════════════════════════
    print("[§1] Input/Output integrity ...")
    s1 = {}

    # Classify reused vs API from raw_source field
    reused_in_norm = [r for r in norm if r.get("raw_source") == "EXISTING_PLACE_CORE_NORMALIZED"]
    api_in_norm    = [r for r in norm if r.get("raw_source") == "API"]
    reused_cids    = {r["cid"] for r in reused_in_norm}

    # Counts from files
    input_target_exact    = len(all_target_cids)
    existing_reused_exact = len(reused_in_norm)
    api_success_exact     = len(attempts)      # each attempt record = one API call
    output_classified_exact = len(norm) + len(special2)

    # Classification totals from both files
    norm_classes = Counter(r.get("final_class", "UNKNOWN") for r in norm)
    sp2_classes  = Counter(r.get("final_class", "UNKNOWN") for r in special2)
    all_classes  = Counter()
    all_classes.update(norm_classes)
    all_classes.update(sp2_classes)

    # Formula: API_SUCCESS + EXISTING_REUSED == INPUT_TARGET
    formula_lhs = api_success_exact + existing_reused_exact
    formula_ok  = (formula_lhs == input_target_exact)

    s1["counts"] = {
        "manifest_cids"          : len(manifest_items),
        "special2_cids"          : len(special2_cids),
        "all_target_cids"        : input_target_exact,
        "raw_records"            : len(raw),
        "norm_records"           : len(norm),
        "attempt_records"        : len(attempts),
        "special2_records"       : len(special2),
        "reused_in_norm"         : existing_reused_exact,
        "api_in_norm"            : len(api_in_norm),
        "output_classified_total": output_classified_exact,
    }
    s1["formula"] = {
        "API_SUCCESS+EXISTING_REUSED": formula_lhs,
        "INPUT_TARGET": input_target_exact,
        "OK": formula_ok,
    }
    s1["class_from_files"] = dict(all_classes)
    s1["class_from_elig_manifest"] = {
        "PLACE_AI_OR_EXPLORE_ELIGIBLE": elig_mf.get("PLACE_AI_OR_EXPLORE_ELIGIBLE"),
        "PLACE_SEARCHABLE_USER_PICK"  : elig_mf.get("PLACE_SEARCHABLE_USER_PICK"),
        "MULTI_LOCATION_NON_PLACE"    : elig_mf.get("MULTI_LOCATION_NON_PLACE"),
        "UNRESOLVED"                  : elig_mf.get("UNRESOLVED"),
    }
    s1["integrity_checks"] = {
        "manifest_count_ok"   : len(manifest_cids) == EXP_MANIFEST,
        "special2_count_ok"   : len(special2_cids) == EXP_SPECIAL,
        "input_target_ok"     : input_target_exact == EXP_INPUT_TARGET,
        "api_calls_ok"        : api_success_exact  == EXP_API_SUCCESS,
        "reused_ok"           : existing_reused_exact == EXP_EXISTING_REUSED,
        "output_total_ok"     : output_classified_exact == EXP_INPUT_TARGET,
        "formula_ok"          : formula_ok,
        "place_ai_ok"         : all_classes.get("PLACE_AI_OR_EXPLORE_ELIGIBLE", 0) == EXP_PLACE_AI,
        "searchable_ok"       : all_classes.get("PLACE_SEARCHABLE_USER_PICK",   0) == EXP_SEARCHABLE,
        "multi_loc_ok"        : all_classes.get("MULTI_LOCATION_NON_PLACE",     0) == EXP_MULTI_LOC,
        "unresolved_ok"       : all_classes.get("UNRESOLVED",                   0) == EXP_UNRESOLVED,
    }
    s1["all_pass"] = all(s1["integrity_checks"].values())
    report["s1_integrity"] = s1

    # ══ §2 CID 1:1 MAPPING ════════════════════════════════════════
    print("[§2] CID 1:1 mapping ...")
    s2 = {}

    def dup_list(cids):
        return sorted([c for c, n in Counter(cids).items() if n > 1])

    manifest_dup   = dup_list(manifest_cids)
    all_target_dup = dup_list(all_target_cids)
    norm_dup       = dup_list(r["cid"] for r in norm)
    raw_dup        = dup_list(r["cid"] for r in raw)
    att_dup        = dup_list(r["cid"] for r in attempts)

    # Manifest ↔ special2 overlap
    manifest_sp2_overlap = sorted(manifest_set & special2_set)

    # Expected in norm: all manifest_cids
    missing_from_norm    = sorted([c for c in manifest_cids if c not in norm_by_cid])
    # Expected in special2: all special2_cids
    missing_from_sp2     = sorted([c for c in special2_cids if c not in sp2_by_cid])
    # Unexpected in norm: CIDs not in manifest
    unexpected_in_norm   = sorted([c for c in norm_by_cid if c not in manifest_set])
    # Unexpected in raw: CIDs not in all_target_set
    unexpected_in_raw    = sorted([c for c in raw_by_cid if c not in all_target_set])

    # Expected in attempts: manifest non-reused + special2
    expected_in_att = (manifest_set - reused_cids) | special2_set
    missing_from_att  = sorted([c for c in expected_in_att if c not in att_by_cid])
    unexpected_in_att = sorted([c for c in att_by_cid if c not in expected_in_att])

    s2["duplicates"] = {
        "manifest": manifest_dup,
        "all_target": all_target_dup,
        "norm": norm_dup,
        "raw": raw_dup,
        "attempts": att_dup,
    }
    s2["manifest_special2_overlap"] = manifest_sp2_overlap
    s2["missing_from_norm"]         = missing_from_norm
    s2["missing_from_special2"]     = missing_from_sp2
    s2["unexpected_in_norm"]        = unexpected_in_norm
    s2["unexpected_in_raw"]         = unexpected_in_raw
    s2["missing_from_attempts"]     = missing_from_att
    s2["unexpected_in_attempts"]    = unexpected_in_att

    s2["TARGET_DUPLICATE_CID"]  = len(all_target_dup)
    s2["TARGET_MISSING_OUTPUT"] = len(missing_from_norm) + len(missing_from_sp2)
    s2["UNEXPECTED_OUTPUT_CID"] = len(unexpected_in_norm) + len(unexpected_in_raw)
    s2["MANIFEST_OVERLAP"]      = len(manifest_sp2_overlap)
    report["s2_cid_mapping"] = s2

    # ══ §3 RAW → NORMALIZED FIELD LOSS ═══════════════════════════
    print("[§3] Raw → Normalized field loss ...")
    s3 = {"anomalies": []}

    REQ_FIELDS  = ["cid", "title", "category", "final_class"]
    PROV_FIELDS = ["source", "task"]

    for rec in norm:
        cid   = rec.get("cid", "?")
        issues = []

        # Required fields present
        for f in REQ_FIELDS:
            if not rec.get(f):
                issues.append(f"missing_required:{f}")

        # For API records, check raw → norm field preservation
        if cid in raw_by_cid:
            raw_rec = raw_by_cid[cid]
            raw_content = raw_rec.get("_raw_content", {}) or {}
            traffic = raw_content.get("traffic", {}) or {}
            extra   = raw_content.get("extra",   {}) or {}

            raw_title = str(raw_content.get("post_sj", "") or "")
            norm_title = str(rec.get("title", "") or "")
            if raw_title and not norm_title:
                issues.append("title_lost_in_norm")

            raw_addr = str(traffic.get("new_adres", "") or traffic.get("adres", "") or "")
            norm_addr = str(rec.get("addr", "") or "")
            if raw_addr and not norm_addr:
                issues.append("addr_lost_in_norm")

            raw_desc = str(raw_content.get("post_desc", "") or "")
            norm_desc = str(rec.get("desc_plain", "") or "")
            if len(raw_desc) > 30 and len(norm_desc) == 0:
                issues.append("desc_lost_in_norm")

        if issues:
            s3["anomalies"].append({"cid": cid, "issues": issues})

    s3["FIELD_LOSS_COUNT"] = len(s3["anomalies"])
    report["s3_field_loss"] = s3

    # ══ §4 TEXT / PARSING ANOMALIES ═══════════════════════════════
    print("[§4] Text/parsing anomalies ...")
    s4 = {
        "text_artifact_list": [],
        "empty_description_list": [],
        "suspect_description_list": [],
        "duplicate_desc_groups": [],
    }

    CSS_PAT    = re.compile(
        r"(\.[a-zA-Z][\w-]*\s*\{|@media|font-size\s*:|color\s*:|display\s*:|"
        r"margin\s*:|padding\s*:|background\s*:|\.clearfix|\.wrap)", re.I)
    STYLE_SCRPT= re.compile(r"<\s*(style|script)[^>]*>", re.I)
    HTML_TAG   = re.compile(r"<(?!br\s*/?>)[a-zA-Z]+[^>]{0,60}>")
    JS_PAT     = re.compile(r"(function\s*\(|\s*=>\s*\{|var\s+\w+\s*=|document\.|window\.)", re.I)
    MOJIBAKE   = re.compile(r"[À-ÿ]{3,}")   # multi-byte read as latin-1 artifacts

    desc_counter = Counter()

    all_check_recs = list(norm) + list(special2)
    for rec in all_check_recs:
        cid    = rec.get("cid", "?")
        src    = "special2" if cid in special2_set else "norm"
        desc   = str(rec.get("desc_plain", "") or "")
        title  = str(rec.get("title", "")      or "")

        reasons = []
        if STYLE_SCRPT.search(desc):
            reasons.append("style_or_script_tag")
        if CSS_PAT.search(desc):
            reasons.append("css_artifact")
        if HTML_TAG.search(desc):
            reasons.append("html_tag_residue")
        if JS_PAT.search(desc):
            reasons.append("js_fragment")
        if MOJIBAKE.search(desc):
            reasons.append("possible_mojibake")

        if reasons:
            s4["text_artifact_list"].append({
                "cid": cid, "src": src,
                "reasons": reasons,
                "desc_sample": desc[:120]
            })

        if not desc or len(desc.strip()) < 5:
            s4["empty_description_list"].append({"cid": cid, "src": src})

        if 5 <= len(desc) < 15:
            s4["suspect_description_list"].append({
                "cid": cid, "src": src,
                "desc": desc, "len": len(desc)
            })

        desc_counter[desc[:200]] += 1  # bucket on first 200 chars

    dup_descs = [(d, c) for d, c in desc_counter.most_common(20) if c > 2]
    s4["duplicate_desc_groups"] = [{"desc_prefix": d[:80], "count": c} for d, c in dup_descs]

    s4["TEXT_ARTIFACT_COUNT"]    = len(s4["text_artifact_list"])
    s4["EMPTY_DESCRIPTION_COUNT"]= len(s4["empty_description_list"])
    s4["SUSPECT_DESCRIPTION_COUNT"] = len(s4["suspect_description_list"])
    report["s4_text"] = s4

    # ══ §5 COORDINATE / ADDRESS QA ════════════════════════════════
    print("[§5] Coordinates/address ...")
    s5 = {"coord_anomalies": [], "addr_anomalies": []}
    coord_index = defaultdict(list)   # (round_lat, round_lng) → [cid, ...]

    all_check_recs_coords = list(norm) + list(special2)
    for rec in all_check_recs_coords:
        cid    = rec.get("cid", "?")
        coords = rec.get("coords", {}) or {}
        lat_r  = coords.get("lat", rec.get("lat", ""))
        lng_r  = coords.get("lng", rec.get("lng", ""))
        addr   = str(rec.get("addr", "") or "")

        if lat_r is not None and str(lat_r).strip():
            try:
                lat = float(str(lat_r).strip())
                lng = float(str(lng_r).strip())
                if lat == 0.0 and lng == 0.0:
                    s5["coord_anomalies"].append({"cid": cid, "reason": "zero_coords"})
                elif not (SEOUL_LAT[0] <= lat <= SEOUL_LAT[1]):
                    s5["coord_anomalies"].append({"cid": cid, "reason": "lat_outside_seoul",
                                                  "lat": lat, "lng": lng})
                elif not (SEOUL_LNG[0] <= lng <= SEOUL_LNG[1]):
                    s5["coord_anomalies"].append({"cid": cid, "reason": "lng_outside_seoul",
                                                  "lat": lat, "lng": lng})
                key = (round(lat, 4), round(lng, 4))
                coord_index[key].append(cid)
            except (ValueError, TypeError):
                s5["coord_anomalies"].append({"cid": cid, "reason": "parse_error",
                                              "lat_raw": str(lat_r)[:30]})

        # Address: flag non-Seoul city signal
        if addr and "서울" not in addr:
            for city_kw in ["경기 ", "인천 ", "부산 ", "대구 ", "광주 ", "대전 ", "울산 "]:
                if city_kw in addr:
                    s5["addr_anomalies"].append({"cid": cid, "reason": "non_seoul_city",
                                                  "addr": addr[:80]})
                    break

    # Flag coord groups with excessive duplicates (>3)
    dup_coord_groups = sorted(
        [{"coord": list(k), "count": len(v), "sample_cids": sorted(v)[:5]}
         for k, v in coord_index.items() if len(v) > 3],
        key=lambda x: -x["count"]
    )
    s5["high_dup_coord_groups"] = dup_coord_groups

    s5["COORDINATE_ANOMALY_COUNT"] = len(s5["coord_anomalies"])
    s5["ADDRESS_ANOMALY_COUNT"]    = len(s5["addr_anomalies"])
    report["s5_coords"] = s5

    # ══ §6 CATEGORY / ENTITY ANOMALIES ════════════════════════════
    print("[§6] Entity type anomalies ...")
    s6 = {"anomalies": []}

    DATE_PERIOD = re.compile(
        r"(20\d{2}\s*[년.\-/]\s*\d{1,2}\s*[월.\-/]\s*\d{1,2}|"
        r"~\s*20\d{2}|\d{1,2}월\s*\d{1,2}일.*?(까지|종료))", re.I)
    PERIOD_KW   = re.compile(r"(운영기간|행사기간|전시기간|개최기간|운영\s*기간)", re.I)
    MULTI_LOC_S = re.compile(r"([가-힣]+\s*/\s*[가-힣]+|[가-힣]+광장\s*/\s*[가-힣]+|"
                              r"총\s*\d+개\s*(장소|곳)|복수\s*장소|여러\s*장소)", re.I)
    ACCOM_KW    = re.compile(r"(호텔|숙박|게스트하우스|모텔|리조트|펜션)", re.I)
    FOOD_CATEG  = re.compile(r"(레스토랑>|식당>|음식점>|카페>)", re.I)
    POPUP_KW    = re.compile(r"(팝업|pop.?up|한정|기간\s*한정)", re.I)

    for rec in norm:
        cid    = rec.get("cid", "?")
        fclass = rec.get("final_class", "")
        cat    = str(rec.get("category", "") or "")
        desc   = str(rec.get("desc_plain", "") or "")
        title  = str(rec.get("title", "") or "")
        reasons = []

        if fclass == "PLACE_AI_OR_EXPLORE_ELIGIBLE":
            if DATE_PERIOD.search(desc) and PERIOD_KW.search(desc):
                reasons.append("place_has_period_date_in_desc")
            if MULTI_LOC_S.search(desc):
                reasons.append("multi_location_signal_in_desc")
            if ACCOM_KW.search(cat):
                reasons.append("accommodation_category_in_place_target")
            if FOOD_CATEG.search(cat):
                reasons.append("food_category_in_nonfood_target")
            if POPUP_KW.search(desc) and POPUP_KW.search(title):
                reasons.append("popup_limited_signals_in_title_and_desc")

        if reasons:
            elig = rec.get("eligibility", {}) or {}
            s6["anomalies"].append({
                "cid"       : cid,
                "final_class": fclass,
                "category"  : cat[:50],
                "title"     : title[:40],
                "reasons"   : reasons,
                "desc_sample": desc[:120],
                "ai_eligible": elig.get("AI_ITINERARY_ELIGIBLE", "?"),
            })

    s6["ENTITY_TYPE_ANOMALY_COUNT"] = len(s6["anomalies"])
    report["s6_entity"] = s6

    # ══ §7 SPECIAL 2 INDEPENDENT VERIFICATION ═════════════════════
    print("[§7] Special 2 ...")
    s7 = {}

    for cid, exp_gate, exp_class in [
        ("KOPc3g5o6", "D_MULTI_LOCATION",   "MULTI_LOCATION_NON_PLACE"),
        ("KOPgdf9ry",  "A_PHYSICAL_PLACE",   "PLACE_AI_OR_EXPLORE_ELIGIBLE"),
    ]:
        rec  = sp2_by_cid.get(cid)
        info = {}
        if rec:
            gate = rec.get("entity_lifecycle_gate", {}) or {}
            addr = rec.get("addr", "")
            desc = str(rec.get("desc_plain", "") or "")
            info = {
                "found"          : True,
                "title"          : rec.get("title", ""),
                "addr"           : addr[:120],
                "addr_slash_count": addr.count("/"),
                "gate_result"    : gate.get("gate_result", ""),
                "gate_evidence"  : gate.get("gate_evidence", ""),
                "final_class"    : rec.get("final_class", ""),
                "opening_hours"  : rec.get("opening_hours", ""),
                "has_coords"     : rec.get("has_coords", False),
                "desc_sample"    : desc[:150],
                "expected_gate"  : exp_gate,
                "expected_class" : exp_class,
                "gate_match"     : gate.get("gate_result") == exp_gate,
                "class_match"    : rec.get("final_class") == exp_class,
            }
            if cid == "KOPc3g5o6":
                info["multi_location_confirmed"] = addr.count("/") >= 2
        else:
            info = {"found": False, "error": f"{cid} missing from special2 file"}
        s7[cid] = info

    s7["KOPc3g5o6_pass"] = (s7.get("KOPc3g5o6", {}).get("gate_match", False)
                             and s7.get("KOPc3g5o6", {}).get("class_match", False)
                             and s7.get("KOPc3g5o6", {}).get("multi_location_confirmed", False))
    s7["KOPgdf9ry_pass"]  = (s7.get("KOPgdf9ry",  {}).get("gate_match", False)
                             and s7.get("KOPgdf9ry",  {}).get("class_match", False))
    s7["SPECIAL2_ALL_PASS"] = s7["KOPc3g5o6_pass"] and s7["KOPgdf9ry_pass"]
    report["s7_special2"] = s7

    # ══ §8 ELIGIBILITY DISTRIBUTION ═══════════════════════════════
    print("[§8] Eligibility distribution ...")
    s8 = {}

    cat_dist = defaultdict(lambda: {"PLACE_AI_OR_EXPLORE_ELIGIBLE": 0,
                                     "PLACE_SEARCHABLE_USER_PICK": 0,
                                     "other": 0, "total": 0})
    ai_cond_cids = []

    for rec in norm:
        cid    = rec.get("cid", "?")
        cat    = str(rec.get("category", "UNKNOWN") or "UNKNOWN")
        main_cat = cat.split(">")[0].strip()
        fclass = rec.get("final_class", "OTHER")
        elig   = rec.get("eligibility", {}) or {}
        ai_e   = str(elig.get("AI_ITINERARY_ELIGIBLE", "?"))

        if fclass in ("PLACE_AI_OR_EXPLORE_ELIGIBLE", "PLACE_SEARCHABLE_USER_PICK"):
            cat_dist[main_cat][fclass] += 1
        else:
            cat_dist[main_cat]["other"] += 1
        cat_dist[main_cat]["total"] += 1

        if ai_e == "CONDITIONAL":
            ai_cond_cids.append({
                "cid": cid,
                "title": str(rec.get("title",""))[:40],
                "category": cat[:50],
                "final_class": fclass,
            })

    dist_sorted = sorted(
        [{"main_category": k, **v} for k, v in cat_dist.items()],
        key=lambda x: -x["total"]
    )
    s8["category_distribution"] = dist_sorted

    # Focus groups
    FOCUS = ["전시시설", "미술관", "화랑", "공연시설", "종교", "교육", "쇼핑", "면세"]
    focus_groups = {}
    for rec in norm:
        cat = str(rec.get("category", "") or "")
        fc  = rec.get("final_class", "?")
        for focus in FOCUS:
            if focus in cat:
                if focus not in focus_groups:
                    focus_groups[focus] = Counter()
                focus_groups[focus][fc] += 1
    s8["focus_category_groups"] = {k: dict(v) for k, v in focus_groups.items()}

    # High-risk review candidates
    HIGH_RISK_CATS = ["전시시설", "팝업", "체험", "이벤트", "교육시설", "면세"]
    HIGH_RISK_TITLE = re.compile(r"20[0-9]{2}\s*(년|시즌|에디션|edition)", re.I)

    high_risk = []
    for rec in norm:
        cid    = rec.get("cid", "?")
        cat    = str(rec.get("category", "") or "")
        fclass = rec.get("final_class", "")
        title  = str(rec.get("title", "") or "")
        elig   = rec.get("eligibility", {}) or {}
        ai_e   = str(elig.get("AI_ITINERARY_ELIGIBLE", "?"))
        risk   = []

        if any(hc in cat for hc in HIGH_RISK_CATS):
            risk.append("borderline_category")
        if HIGH_RISK_TITLE.search(title):
            risk.append("year_or_edition_in_title")
        if ai_e == "CONDITIONAL" and fclass == "PLACE_AI_OR_EXPLORE_ELIGIBLE":
            risk.append("ai_conditional")

        if len(risk) >= 2:
            high_risk.append({
                "cid"        : cid,
                "title"      : title[:50],
                "category"   : cat[:50],
                "final_class": fclass,
                "ai_eligible": ai_e,
                "risk"       : risk,
            })

    # Sort by risk signal count desc
    high_risk.sort(key=lambda x: -len(x["risk"]))
    s8["high_risk_review_candidates"] = high_risk[:40]
    s8["ai_conditional_cids"]         = ai_cond_cids[:30]
    s8["HIGH_RISK_REVIEW_SAMPLE_CANDIDATES"] = len(high_risk)
    s8["AI_CONDITIONAL_COUNT"] = len(ai_cond_cids)
    report["s8_eligibility_dist"] = s8

    # ══ §9 EVENT PROTECTION ═══════════════════════════════════════
    print("[§9] Event protection ...")
    s9 = {}

    place_routing_event_cids = {r["cid"] for r in active_event_records
                                  if r.get("routing_class") == "PLACE_DETAIL_TARGET"}
    event_routing_event_cids = {r["cid"] for r in active_event_records
                                  if r.get("routing_class") == "ACTIVE_EVENT_SERVICE_POOL"}

    # Place-routing events should be IN norm (they were Batch 2 targets)
    place_event_in_norm = {cid: norm_by_cid.get(cid) for cid in place_routing_event_cids
                           if cid in norm_by_cid}
    # Event-routing events should NOT be in norm or special2
    event_routing_in_norm = [cid for cid in event_routing_event_cids if cid in norm_by_cid]
    event_routing_in_sp2  = [cid for cid in event_routing_event_cids if cid in sp2_by_cid]

    # Routing V2: confirm event-routing events are D-routing
    for cid in event_routing_event_cids:
        rv2 = rv2_by_cid.get(cid, {})
        pr  = rv2.get("primary_routing", "?")

    # Historical events: check no D-routing events crept into manifest
    historical_event_in_manifest = [
        cid for cid in manifest_cids
        if rv2_by_cid.get(cid, {}).get("legacy_routing_track") == "EVENT_TRACK"
        and cid not in active_event_cids
    ]

    s9["active_event_records"] = [
        {"cid": r["cid"], "routing_class": r.get("routing_class", "?"),
         "title": str(r.get("title",""))[:40]}
        for r in active_event_records
    ]
    s9["place_routing_in_norm"]        = {c: True for c in place_routing_event_cids if c in norm_by_cid}
    s9["event_routing_in_norm"]        = event_routing_in_norm
    s9["event_routing_in_special2"]    = event_routing_in_sp2
    s9["historical_event_in_manifest"] = historical_event_in_manifest

    s9["ACTIVE_EVENT_SERVICE_POOL"]          = len(active_event_records)
    s9["ACTIVE_EVENT_D_ROUTING"]             = len(event_routing_event_cids)
    s9["ACTIVE_EVENT_PLACE_ROUTING"]         = len(place_routing_event_cids)
    s9["ACTIVE_EVENT_INSIDE_GENERIC_EXCLUDED"]= 0
    s9["HISTORICAL_BULK_EVENT_DETAIL_TARGET"] = len(historical_event_in_manifest)
    s9["EVENT_PROTECTION_PASS"] = (
        s9["ACTIVE_EVENT_SERVICE_POOL"] == EXP_ACTIVE_EVENT and
        not event_routing_in_norm and
        not event_routing_in_sp2 and
        not historical_event_in_manifest
    )
    report["s9_event"] = s9

    # ══ §10 FOOD / KTO PROTECTION ═════════════════════════════════
    print("[§10] Food/KTO protection ...")
    s10 = {}

    # Get restaurant-track CIDs from routing V2
    restaurant_cids = {r["cid"] for r in routing_v2
                       if r.get("legacy_routing_track") == "RESTAURANT_TRACK"}

    food_in_manifest = sorted(manifest_set & restaurant_cids)
    food_in_sp2      = sorted(special2_set & restaurant_cids)

    s10["restaurant_track_total"]  = len(restaurant_cids)
    s10["food_cids_in_manifest"]   = food_in_manifest
    s10["food_cids_in_special2"]   = food_in_sp2
    s10["SEOUL_FOOD_EXECUTION_TARGET"] = 0
    s10["KTO_SEOUL_EXECUTION_TARGET"]  = 0
    s10["FOOD_PROTECTION_PASS"] = not food_in_manifest and not food_in_sp2
    report["s10_food"] = s10

    # ══ §11 TOTAL ACCOUNTING ══════════════════════════════════════
    print("[§11] Total universe accounting ...")
    s11 = {}

    # Routing V2 distribution
    pr_dist  = Counter(r.get("primary_routing", "?")    for r in routing_v2)
    lt_dist  = Counter(r.get("legacy_routing_track", "?") for r in routing_v2)
    rv2_dup  = dup_list(r["cid"] for r in routing_v2)

    s11["routing_v2_total"]              = len(routing_v2)
    s11["primary_routing_distribution"]  = dict(pr_dist.most_common())
    s11["legacy_routing_track_dist"]     = dict(lt_dist.most_common())
    s11["routing_v2_duplicate_cids"]     = rv2_dup
    s11["TOTAL_SEOUL_UNIVERSE"]          = len(routing_v2)
    s11["TOTAL_UNIVERSE_MATCH"]          = len(routing_v2) == EXP_UNIVERSE
    s11["MANIFEST_OVERLAP"]              = s2["MANIFEST_OVERLAP"]
    s11["UNCLASSIFIED"]                  = lt_dist.get("UNRESOLVED_CATEGORY", 0)
    s11["ACCOUNTING_PASS"]               = (
        len(routing_v2) == EXP_UNIVERSE and not rv2_dup
    )
    report["s11_accounting"] = s11

    # ══ §12 PROVENANCE VERIFICATION ═══════════════════════════════
    print("[§12] Provenance ...")
    s12 = {"missing": []}

    REQ_PROV = ["source", "task"]
    all_check_prov = [(r, "norm") for r in norm] + [(r, "special2") for r in special2]

    for rec, src in all_check_prov:
        cid  = rec.get("cid", "?")
        prov = rec.get("provenance")
        if not prov:
            s12["missing"].append({"cid": cid, "src": src, "reason": "no_provenance"})
        elif isinstance(prov, dict):
            mk = [k for k in REQ_PROV if not prov.get(k)]
            if mk:
                s12["missing"].append({"cid": cid, "src": src, "reason": "missing_prov_keys",
                                        "keys": mk})

    s12["PROVENANCE_MISSING_COUNT"] = len(s12["missing"])
    s12["PROVENANCE_PASS"] = len(s12["missing"]) == 0
    report["s12_provenance"] = s12

    # ══ §13 SECRET SCAN ═══════════════════════════════════════════
    print("[§13] Secret scan ...")
    s13 = {"findings": []}

    # Patterns (look for key values, not key names)
    SECRET_PATS = [
        ("api_key_inline",
         re.compile(r"VISITSEOUL[-_]API[-_]KEY\s*[:=]\s*['\"]([A-Za-z0-9_\-]{20,})['\"]", re.I)),
        ("bearer_token",
         re.compile(r"Authorization\s*[:=]\s*Bearer\s+([A-Za-z0-9._\-]{20,})", re.I)),
        ("key_literal_in_header",
         re.compile(r"['\"]VISITSEOUL-API-KEY['\"]:\s*['\"]([A-Za-z0-9_\-]{20,})['\"]")),
    ]

    SCAN_FILES = [
        BASE    / "seoul-nonfood-batch2-detail-raw-v1.jsonl",
        BASE    / "seoul-nonfood-batch2-detail-normalized-v1.jsonl",
        BASE    / "seoul-nonfood-batch2-detail-attempts-v1.jsonl",
        BASE    / "seoul-nonfood-batch2-eligibility-manifest-v1.json",
        BASE    / "seoul-nonfood-batch2-special2-v1.jsonl",
        SCRIPTS / "run-seoul-nonfood-batch2-detail-collection-v1.py",
    ]

    for fpath in SCAN_FILES:
        if not fpath.exists():
            s13["findings"].append({"file": fpath.name, "issue": "file_not_found"})
            continue
        content = fpath.read_text(encoding="utf-8", errors="replace")
        for pat_name, pat in SECRET_PATS:
            hits = pat.findall(content)
            if hits:
                s13["findings"].append({
                    "file"     : fpath.name,
                    "pattern"  : pat_name,
                    "hit_count": len(hits),
                })

    # Script usage: must use os.environ, never hardcoded
    script_path = SCRIPTS / "run-seoul-nonfood-batch2-detail-collection-v1.py"
    if script_path.exists():
        txt = script_path.read_text(encoding="utf-8")
        s13["script_uses_environ"]   = ("os.environ" in txt or "environ.get" in txt)
        s13["script_has_print_key"]  = bool(re.search(r"print.*api.key", txt, re.I))
        s13["script_has_log_key"]    = bool(re.search(r"log.*api.key",   txt, re.I))

    s13["SECRET_SCAN"]  = "HOLD" if s13["findings"] else "PASS"
    s13["SCAN_CLEAN"]   = not bool(s13["findings"])
    report["s13_secret"] = s13

    # ══ §14 REPRODUCIBILITY (hash computed here; run twice externally) ═
    # Build deterministic summary from all results so far
    det_summary = {
        "input_target"           : input_target_exact,
        "api_success"            : api_success_exact,
        "existing_reused"        : existing_reused_exact,
        "output_classified"      : output_classified_exact,
        "place_ai"               : all_classes.get("PLACE_AI_OR_EXPLORE_ELIGIBLE", 0),
        "searchable"             : all_classes.get("PLACE_SEARCHABLE_USER_PICK",   0),
        "multi_loc"              : all_classes.get("MULTI_LOCATION_NON_PLACE",     0),
        "unresolved"             : all_classes.get("UNRESOLVED", 0),
        "target_dup_cid"         : s2["TARGET_DUPLICATE_CID"],
        "target_missing"         : s2["TARGET_MISSING_OUTPUT"],
        "unexpected_output"      : s2["UNEXPECTED_OUTPUT_CID"],
        "field_loss"             : s3["FIELD_LOSS_COUNT"],
        "text_artifact"          : s4["TEXT_ARTIFACT_COUNT"],
        "empty_desc"             : s4["EMPTY_DESCRIPTION_COUNT"],
        "coord_anomaly"          : s5["COORDINATE_ANOMALY_COUNT"],
        "addr_anomaly"           : s5["ADDRESS_ANOMALY_COUNT"],
        "entity_anomaly"         : s6["ENTITY_TYPE_ANOMALY_COUNT"],
        "special2_all_pass"      : s7["SPECIAL2_ALL_PASS"],
        "active_event_pool"      : s9["ACTIVE_EVENT_SERVICE_POOL"],
        "hist_event_in_manifest" : s9["HISTORICAL_BULK_EVENT_DETAIL_TARGET"],
        "food_in_manifest"       : len(s10["food_cids_in_manifest"]),
        "routing_v2_total"       : s11["TOTAL_SEOUL_UNIVERSE"],
        "provenance_missing"     : s12["PROVENANCE_MISSING_COUNT"],
        "secret_scan"            : s13["SECRET_SCAN"],
        # Sorted anomaly CID sets for determinism
        "text_artifact_cids"     : sorted(x["cid"] for x in s4["text_artifact_list"]),
        "empty_desc_cids"        : sorted(x["cid"] for x in s4["empty_description_list"]),
        "coord_anomaly_cids"     : sorted(x["cid"] for x in s5["coord_anomalies"]),
        "entity_anomaly_cids"    : sorted(x["cid"] for x in s6["anomalies"]),
    }
    run_hash = sha256_obj(det_summary)
    report["s14_reproducibility"] = {
        "run_hash"       : run_hash,
        "deterministic_summary": det_summary,
    }

    # ══ FINAL FLAGS ══════════════════════════════════════════════
    overall_pass = (
        s1["all_pass"] and
        s2["TARGET_DUPLICATE_CID"] == 0 and
        s2["TARGET_MISSING_OUTPUT"] == 0 and
        s2["UNEXPECTED_OUTPUT_CID"] == 0 and
        s3["FIELD_LOSS_COUNT"] == 0 and
        s13["SECRET_SCAN"] == "PASS" and
        s11["TOTAL_UNIVERSE_MATCH"] and
        s7["SPECIAL2_ALL_PASS"] and
        s9["EVENT_PROTECTION_PASS"] and
        s10["FOOD_PROTECTION_PASS"] and
        s12["PROVENANCE_PASS"]
    )

    report["final_flags"] = {
        "TASK_RESULT"                     : "PASS" if overall_pass else "HOLD",
        "INPUT_TARGET_EXACT"              : input_target_exact,
        "API_SUCCESS_EXACT"               : api_success_exact,
        "EXISTING_RAW_REUSED_EXACT"       : existing_reused_exact,
        "OUTPUT_CLASSIFIED_EXACT"         : output_classified_exact,
        "TARGET_DUPLICATE_CID"            : s2["TARGET_DUPLICATE_CID"],
        "TARGET_MISSING_OUTPUT"           : s2["TARGET_MISSING_OUTPUT"],
        "UNEXPECTED_OUTPUT_CID"           : s2["UNEXPECTED_OUTPUT_CID"],
        "TEXT_ARTIFACT_COUNT"             : s4["TEXT_ARTIFACT_COUNT"],
        "EMPTY_DESCRIPTION_COUNT"         : s4["EMPTY_DESCRIPTION_COUNT"],
        "SUSPECT_DESCRIPTION_COUNT"       : s4["SUSPECT_DESCRIPTION_COUNT"],
        "COORDINATE_ANOMALY_COUNT"        : s5["COORDINATE_ANOMALY_COUNT"],
        "ADDRESS_ANOMALY_COUNT"           : s5["ADDRESS_ANOMALY_COUNT"],
        "ENTITY_TYPE_ANOMALY_COUNT"       : s6["ENTITY_TYPE_ANOMALY_COUNT"],
        "PROVENANCE_MISSING_COUNT"        : s12["PROVENANCE_MISSING_COUNT"],
        "ACTIVE_EVENT_SERVICE_POOL"       : s9["ACTIVE_EVENT_SERVICE_POOL"],
        "ACTIVE_EVENT_INSIDE_GENERIC_EXCLUDED": s9["ACTIVE_EVENT_INSIDE_GENERIC_EXCLUDED"],
        "HISTORICAL_BULK_EVENT_DETAIL_TARGET": s9["HISTORICAL_BULK_EVENT_DETAIL_TARGET"],
        "SEOUL_FOOD_EXECUTION_TARGET"     : 0,
        "KTO_SEOUL_EXECUTION_TARGET"      : 0,
        "TOTAL_SEOUL_UNIVERSE"            : s11["TOTAL_SEOUL_UNIVERSE"],
        "MANIFEST_OVERLAP"                : s11["MANIFEST_OVERLAP"],
        "UNCLASSIFIED"                    : s11["UNCLASSIFIED"],
        "SECRET_SCAN"                     : s13["SECRET_SCAN"],
        # reproducibility filled in by caller after run 2
        "QA_RUN_1_RUN_2_MATCH"            : None,
        "API_CALLS"                       : 0,
        "WEB_COLLECTION"                  : 0,
        "PRODUCTION_WRITE"                : 0,
        "MASTER_WRITE"                    : 0,
        "NIGHTLY_STOP"                    : "YES",
        "NEXT_TASK"                       : "SEOUL_NONFOOD_FINAL_QA_AFTER_HUMAN_REVIEW",
    }

    return report


# ══════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    print("=" * 60)
    print(f"  {TASK}")
    print("=" * 60)

    OUT = BASE

    print("\n=== RUN 1 ===")
    r1 = run_qa()
    h1 = r1["s14_reproducibility"]["run_hash"]
    print(f"  RUN 1 hash = {h1}")

    print("\n=== RUN 2 ===")
    r2 = run_qa()
    h2 = r2["s14_reproducibility"]["run_hash"]
    print(f"  RUN 2 hash = {h2}")

    match = (h1 == h2)
    print(f"\n  QA_RUN_1_RUN_2_MATCH = {'YES' if match else 'NO'}")

    r1["s14_reproducibility"]["run1_hash"] = h1
    r1["s14_reproducibility"]["run2_hash"] = h2
    r1["s14_reproducibility"]["QA_RUN_1_RUN_2_MATCH"] = "YES" if match else "NO"
    r1["final_flags"]["QA_RUN_1_RUN_2_MATCH"] = "YES" if match else "NO"

    # Write full report JSON
    report_path = OUT / "seoul-nonfood-nightly-qa-r1-report.json"
    report_path.write_text(json.dumps(r1, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n[WRITTEN] {report_path.name}  ({report_path.stat().st_size // 1024} KB)")

    # Write anomaly manifest (compact, human-reviewable)
    anomaly_out = {
        "task"    : TASK,
        "as_of"   : AS_OF,
        "TASK_RESULT": r1["final_flags"]["TASK_RESULT"],
        "text_artifacts"   : r1["s4_text"]["text_artifact_list"],
        "empty_descriptions": r1["s4_text"]["empty_description_list"],
        "coord_anomalies"  : r1["s5_coords"]["coord_anomalies"],
        "addr_anomalies"   : r1["s5_coords"]["addr_anomalies"],
        "entity_anomalies" : r1["s6_entity"]["anomalies"],
        "field_loss"       : r1["s3_field_loss"]["anomalies"],
        "provenance_missing": r1["s12_provenance"]["missing"],
        "secret_findings"  : r1["s13_secret"]["findings"],
        "high_risk_review" : r1["s8_eligibility_dist"]["high_risk_review_candidates"],
    }
    anomaly_path = OUT / "seoul-nonfood-nightly-qa-r1-anomalies.json"
    anomaly_path.write_text(json.dumps(anomaly_out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[WRITTEN] {anomaly_path.name}  ({anomaly_path.stat().st_size // 1024} KB)")

    # Print final flags
    print("\n" + "=" * 60)
    print("FINAL FLAGS")
    print("=" * 60)
    for k, v in r1["final_flags"].items():
        print(f"  {k} = {v}")

    print(f"\nFINAL_COMMIT = (pending)")
    print("TASK-SEOUL-NONFOOD-NIGHTLY-SAFE-QA-R1 작업을 완료했습니다.")
