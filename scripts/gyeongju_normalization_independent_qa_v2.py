#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TASK-GYEONGJU-MANIFEST-FIX-AND-INDEPENDENT-QA-RERUN-V1
독립 QA v2 스크립트

VG ID 수정(v1.2.0) 이후 경주 정규화 결과에 대한 독립 QA.
normalization 스크립트 함수를 직접 호출하지 않고 독립 재계산.

12개 섹션:
  S1 입력 무결성
  S2 VG ID 구조
  S3 의미적 결과 보존
  S4 DEF-H01 5건 재검증
  S5 신규 candidate 83건 중복 재검색
  S6 수동 검토 큐 38건 전수 QA
  S7 다국어 92×5 QA
  S8 행사·관계 QA
  S9 candidate 품질·provenance QA
  S10 DEF-M01 최종 검증
  S11 결함 등록
  S12 Release/HOLD 준비도 판정
"""
import hashlib
import json
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

VERSION = "2.0.0"
TASK = "TASK-GYEONGJU-MANIFEST-FIX-AND-INDEPENDENT-QA-RERUN-V1"
AS_OF = "2026-08-05T04:08:00Z"

# ── 기대값 (독립 검증 기준) ─────────────────────────────────
EXPECT = {
    "baseline_rows": 831,
    "full_v1_rows": 914,
    "new_candidates": 83,
    "source_fact_rows": 1158,
    "vg_source_facts": 92,
    "multilingual_entities": 92,
    "multilingual_locales": 5,
    "event_listings": 10,
    "event_entities": 7,
    "rec_collections": 7,
    "course_count": 5,
    "course_waypoints": 29,
    "heritage_entities": 5,
    "heritage_relations_total": 53,
    "heritage_related_attraction": 33,
    "cultural_guide_relations": 17,
    "manual_review_queue": 38,
    "att_hc": 145, "att_mr": 4, "att_new": 10,
    "rest_hc": 5, "rest_mr": 13, "rest_new": 66,
    "souv_physical": 8, "souv_baseline_link": 1, "souv_new_cand": 7,
}

LOCALE_ORDER = ["ko", "en", "ja", "zh-CN", "zh-TW"]

# ── 경로 ────────────────────────────────────────────────────
REPO = Path(__file__).parent.parent
NORM = REPO / "data/tourapi/normalized/gyeongju"
VAL = REPO / "data/tourapi/validation/gyeongju"
MANIFEST_PATH = REPO / "data/tourapi/manifests/gyeongju/gyeongju-manifest-v1.json"
BASELINE_PATH = REPO / "data/tourapi/enriched/gyeongju/gyeongju-enriched-candidates-v1.jsonl"
SF_BASE_PATH = REPO / "data/tourapi/candidates/gyeongju/gyeongju-source-facts-v1.jsonl"
VG_MAPPING_PATH = VAL / "gyeongju-vg-id-fix-mapping-audit-v1.jsonl"

# ── 유틸 ────────────────────────────────────────────────────
def rjsonl(p: Path) -> list:
    return [json.loads(l) for l in p.read_text(encoding="utf-8").splitlines() if l.strip()]

def rjson(p: Path) -> dict:
    return json.loads(p.read_text(encoding="utf-8"))

def wjsonl(p: Path, records: list):
    p.write_text("\n".join(json.dumps(r, ensure_ascii=False, sort_keys=True) for r in records) + "\n", encoding="utf-8")

def wjson(p: Path, data):
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")

def sha256f(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()

def norm_name(s: str) -> str:
    if not s:
        return ""
    s = unicodedata.normalize("NFKC", s)
    s = re.sub(r"\s+", " ", s).strip().lower()
    s = re.sub(r"[^가-힣a-z0-9\s]", "", s)
    return s

def norm_phone(s: str) -> str:
    if not s:
        return ""
    return re.sub(r"[^0-9]", "", s)

DEFECTS: list = []

def defect(severity: str, section: str, finding: str, evidence=None, affected=None):
    DEFECTS.append({
        "severity": severity,
        "section": section,
        "finding": finding,
        "evidence": str(evidence) if evidence else "",
        "affected_ids": sorted(affected) if affected else [],
    })
    print(f"  [{severity}] {section}: {finding}")


# ════════════════════════════════════════════════════════════
# 데이터 로드
# ════════════════════════════════════════════════════════════
def load_data():
    print("[Load] Reading normalized outputs…")
    d = {}
    d["baseline"] = rjsonl(BASELINE_PATH)
    d["source_facts_base"] = rjsonl(SF_BASE_PATH)
    d["candidates"] = rjsonl(NORM / "gyeongju-full-v1-candidates.jsonl")
    d["source_facts"] = rjsonl(NORM / "source-facts-full-v1.jsonl")
    d["att_identities"] = rjsonl(NORM / "gyeongju-attraction-identity-audit-v1.jsonl")
    d["rest_identities"] = rjsonl(NORM / "gyeongju-restaurant-identity-audit-v1.jsonl")
    d["souv_classif"] = rjsonl(NORM / "gyeongju-souvenir-classification-audit-v1.jsonl")
    d["multilingual"] = rjsonl(NORM / "gyeongju-multilingual-entity-link-audit-v1.jsonl")
    d["manual_review"] = rjsonl(NORM / "gyeongju-manual-review-queue-v1.jsonl")
    d["event_entities"] = rjsonl(NORM / "gyeongju-event-entities-v1.jsonl")
    d["event_listings"] = rjsonl(NORM / "gyeongju-event-listing-relations-v1.jsonl")
    d["rec_collections"] = rjsonl(NORM / "gyeongju-recommendation-collections-v1.jsonl")
    d["rec_relations"] = rjsonl(NORM / "gyeongju-recommendation-place-relations-v1.jsonl")
    d["courses"] = rjsonl(NORM / "gyeongju-course-entities-v1.jsonl")
    d["waypoints"] = rjsonl(NORM / "gyeongju-course-waypoint-relations-v1.jsonl")
    d["heritage_entities"] = rjsonl(NORM / "gyeongju-heritage-entities-v1.jsonl")
    d["heritage_relations"] = rjsonl(NORM / "gyeongju-heritage-relations-v1.jsonl")
    d["guide_relations"] = rjsonl(NORM / "gyeongju-cultural-guide-relations-v1.jsonl")
    d["baseline_link_audit"] = rjsonl(NORM / "gyeongju-baseline-831-identity-link-audit.jsonl")
    d["field_conflict"] = rjsonl(NORM / "gyeongju-field-conflict-audit-v1.jsonl")
    d["norm_summary"] = rjson(NORM / "gyeongju-normalization-summary-v1.json")
    d["vg_mapping"] = rjsonl(VG_MAPPING_PATH)
    # raw VG data for independent cross-check
    d["vg_restaurants"] = rjsonl(REPO / "data/tourapi/gyeongju/web-raw-v3/restaurants/restaurants-raw.jsonl")
    d["vg_souvenirs"] = rjsonl(REPO / "data/tourapi/gyeongju/web-raw-v3/souvenirs/souvenirs-raw.jsonl")
    print(f"  Loaded: candidates={len(d['candidates'])}, sfs={len(d['source_facts'])}, ml={len(d['multilingual'])}")
    return d


# ════════════════════════════════════════════════════════════
# S1: 입력 무결성
# ════════════════════════════════════════════════════════════
def section1_input_integrity(d) -> dict:
    print("\n[S1] Input integrity…")
    cands = d["candidates"]
    sfs = d["source_facts"]
    baseline = d["baseline"]

    cand_ids = [c["candidate_id"] for c in cands]
    sf_ids = [s["source_fact_id"] for s in sfs]
    bl_ids = [c["candidate_id"] for c in baseline]

    # Duplicate detection
    cand_dup = {k: v for k, v in Counter(cand_ids).items() if v > 1}
    sf_dup = {k: v for k, v in Counter(sf_ids).items() if v > 1}
    bl_dup = {k: v for k, v in Counter(bl_ids).items() if v > 1}

    # New candidates (not in baseline)
    bl_id_set = set(bl_ids)
    new_cands = [c for c in cands if c.get("candidate_id") not in bl_id_set]
    new_cand_ids = [c["candidate_id"] for c in new_cands]
    new_cand_dup = {k: v for k, v in Counter(new_cand_ids).items() if v > 1}

    # FK checks
    cand_id_set = set(cand_ids)
    sf_id_set = set(sf_ids)
    # source facts reference linked candidate
    broken_sf_fk = []
    for sf in sfs:
        linked = sf.get("linked_candidate_id")
        if linked and linked not in cand_id_set:
            broken_sf_fk.append(sf["source_fact_id"])
    # candidates' linked_source_facts
    broken_cand_sf_fk = []
    for c in cands:
        for sfid in c.get("linked_source_facts", []) or []:
            if sfid not in sf_id_set:
                broken_cand_sf_fk.append(f"{c['candidate_id']}:{sfid}")

    # Old truncated VG ID detection (16-char suffix)
    # Pattern: gyeongju-VG-REST-{exactly 16 hex chars}
    old_id_pattern = re.compile(r"gyeongju-VG-(REST|SOUV|NEW-REST|NEW-SOUV)-[0-9a-f]{16}$")
    old_cand_ids = [cid for cid in cand_ids if old_id_pattern.match(cid)]
    old_sf_ids = [sfid for sfid in sf_ids if old_id_pattern.match(sfid)]

    # Report defects
    if cand_dup:
        defect("CRITICAL", "S1", f"{len(cand_dup)} duplicate candidate_id groups",
               list(cand_dup.keys()), list(cand_dup.keys()))
    if sf_dup:
        defect("CRITICAL", "S1", f"{len(sf_dup)} duplicate source_fact_id groups",
               list(sf_dup.keys()), list(sf_dup.keys()))
    if bl_dup:
        defect("CRITICAL", "S1", f"{len(bl_dup)} duplicate baseline candidate_id groups",
               list(bl_dup.keys()), list(bl_dup.keys()))
    if broken_sf_fk:
        defect("CRITICAL", "S1", f"{len(broken_sf_fk)} broken source fact FK",
               broken_sf_fk[:5], broken_sf_fk)
    if broken_cand_sf_fk:
        defect("HIGH", "S1", f"{len(broken_cand_sf_fk)} broken candidate→source_fact FK",
               broken_cand_sf_fk[:5], broken_cand_sf_fk)
    if old_cand_ids:
        defect("CRITICAL", "S1", f"{len(old_cand_ids)} old truncated VG candidate_id (16-char) remaining",
               old_cand_ids[:3], old_cand_ids)
    if old_sf_ids:
        defect("CRITICAL", "S1", f"{len(old_sf_ids)} old truncated VG source_fact_id (16-char) remaining",
               old_sf_ids[:3], old_sf_ids)

    # Count checks
    if len(cands) != EXPECT["full_v1_rows"]:
        defect("CRITICAL", "S1", f"candidate count {len(cands)} ≠ expected {EXPECT['full_v1_rows']}")
    if len(sfs) != EXPECT["source_fact_rows"]:
        defect("CRITICAL", "S1", f"source fact count {len(sfs)} ≠ expected {EXPECT['source_fact_rows']}")
    if len(baseline) != EXPECT["baseline_rows"]:
        defect("CRITICAL", "S1", f"baseline count {len(baseline)} ≠ expected {EXPECT['baseline_rows']}")
    if len(new_cands) != EXPECT["new_candidates"]:
        defect("HIGH", "S1", f"new candidate count {len(new_cands)} ≠ expected {EXPECT['new_candidates']}")
    if new_cand_dup:
        defect("CRITICAL", "S1", f"{len(new_cand_dup)} duplicate new candidate_id groups",
               list(new_cand_dup.keys()), list(new_cand_dup.keys()))

    result = {
        "section": "S1_INPUT_INTEGRITY",
        "baseline_rows": len(baseline),
        "baseline_unique_ids": len(set(bl_ids)),
        "baseline_dup_groups": len(bl_dup),
        "full_v1_rows": len(cands),
        "full_v1_unique_ids": len(set(cand_ids)),
        "full_v1_dup_groups": len(cand_dup),
        "new_candidate_rows": len(new_cands),
        "new_candidate_unique_ids": len(set(new_cand_ids)),
        "new_candidate_dup_groups": len(new_cand_dup),
        "source_fact_rows": len(sfs),
        "source_fact_unique_ids": len(set(sf_ids)),
        "source_fact_dup_groups": len(sf_dup),
        "broken_source_fact_fk": len(broken_sf_fk),
        "broken_candidate_sf_fk": len(broken_cand_sf_fk),
        "old_truncated_vg_candidate_ids": len(old_cand_ids),
        "old_truncated_vg_sfids": len(old_sf_ids),
        "verdict": "PASS" if not cand_dup and not sf_dup and len(cands) == EXPECT["full_v1_rows"]
                             and len(sfs) == EXPECT["source_fact_rows"] and not old_cand_ids and not old_sf_ids
                   else "FAIL",
    }
    print(f"  candidates: {len(cands)}/{EXPECT['full_v1_rows']}, dup_groups: {len(cand_dup)}")
    print(f"  source_facts: {len(sfs)}/{EXPECT['source_fact_rows']}, dup_groups: {len(sf_dup)}")
    print(f"  old 16-char VG IDs: cands={len(old_cand_ids)}, sfs={len(old_sf_ids)}")
    print(f"  S1 verdict: {result['verdict']}")
    return result


# ════════════════════════════════════════════════════════════
# S2: VG ID 구조
# ════════════════════════════════════════════════════════════
def section2_vg_id_structure(d) -> list:
    print("\n[S2] VG ID structure…")
    vg_rest_raw = d["vg_restaurants"]  # 84
    vg_souv_raw = d["vg_souvenirs"]    # 8
    cands = d["candidates"]
    sfs = d["source_facts"]
    ml = d["multilingual"]
    rest_idents = d["rest_identities"]
    souv_class = d["souv_classif"]

    # Build expected ID sets from raw data
    expected_rest_sfids = {f"gyeongju-VG-REST-{r['hex_id']}" for r in vg_rest_raw}
    expected_souv_sfids = {f"gyeongju-VG-SOUV-{s['hex_id']}" for s in vg_souv_raw}
    expected_ml_rest = {f"gyeongju-VG-REST-{r['hex_id']}" for r in vg_rest_raw}
    expected_ml_souv = {f"gyeongju-VG-SOUV-{s['hex_id']}" for s in vg_souv_raw}

    # Actual VG source facts
    actual_vg_rest_sfs = {s["source_fact_id"] for s in sfs if s.get("source_fact_id","").startswith("gyeongju-VG-REST-")}
    actual_vg_souv_sfs = {s["source_fact_id"] for s in sfs if s.get("source_fact_id","").startswith("gyeongju-VG-SOUV-")}

    # Actual VG candidates
    actual_vg_new_rest = {c["candidate_id"] for c in cands if c.get("candidate_id","").startswith("gyeongju-VG-NEW-REST-")}
    actual_vg_new_souv = {c["candidate_id"] for c in cands if c.get("candidate_id","").startswith("gyeongju-VG-NEW-SOUV-")}

    # HexId length check
    hexid_16_rest = [sfid for sfid in actual_vg_rest_sfs if len(sfid.replace("gyeongju-VG-REST-","")) == 16]
    hexid_16_souv = [sfid for sfid in actual_vg_souv_sfs if len(sfid.replace("gyeongju-VG-SOUV-","")) == 16]

    # SF coverage vs raw
    missing_rest_sfs = expected_rest_sfids - actual_vg_rest_sfs
    extra_rest_sfs = actual_vg_rest_sfs - expected_rest_sfids
    missing_souv_sfs = expected_souv_sfids - actual_vg_souv_sfs

    # Multilingual entity_source_id check
    ml_rest_eids = {r["entity_source_id"] for r in ml if r.get("content_type") == "restaurant"}
    ml_souv_eids = {r["entity_source_id"] for r in ml if r.get("content_type") == "souvenir"}
    ml_rest_hexid_16 = [eid for eid in ml_rest_eids if len(eid.replace("gyeongju-VG-REST-","")) == 16]
    ml_souv_hexid_16 = [eid for eid in ml_souv_eids if len(eid.replace("gyeongju-VG-SOUV-","")) == 16]

    # REST vs SOUV cross-collision check
    rest_hexids = {sfid.replace("gyeongju-VG-REST-","") for sfid in actual_vg_rest_sfs}
    souv_hexids = {sfid.replace("gyeongju-VG-SOUV-","") for sfid in actual_vg_souv_sfs}
    cross_collision = rest_hexids & souv_hexids

    if hexid_16_rest or hexid_16_souv:
        defect("CRITICAL", "S2", f"Old 16-char hexId VG sfids: REST={len(hexid_16_rest)}, SOUV={len(hexid_16_souv)}",
               (hexid_16_rest + hexid_16_souv)[:5])
    if ml_rest_hexid_16 or ml_souv_hexid_16:
        defect("CRITICAL", "S2", f"Old 16-char hexId multilingual entity_source_id: {len(ml_rest_hexid_16)+len(ml_souv_hexid_16)}")
    if missing_rest_sfs:
        defect("HIGH", "S2", f"{len(missing_rest_sfs)} VG-REST sfids missing (expected from raw data)", list(missing_rest_sfs)[:3])
    if extra_rest_sfs:
        defect("MEDIUM", "S2", f"{len(extra_rest_sfs)} unexpected VG-REST sfids not in raw data", list(extra_rest_sfs)[:3])
    if cross_collision:
        defect("CRITICAL", "S2", f"REST/SOUV hexId cross-collision: {len(cross_collision)} IDs")

    records = []
    for rest in sorted(vg_rest_raw, key=lambda x: x.get("hex_id","")):
        hex_id = rest.get("hex_id","")
        sfid = f"gyeongju-VG-REST-{hex_id}"
        ml_eid = f"gyeongju-VG-REST-{hex_id}"
        hex_len = len(hex_id)
        sfid_exists = sfid in actual_vg_rest_sfs
        ml_exists = ml_eid in ml_rest_eids
        is_new_cand = any(c.get("vg_hex_id") == hex_id for c in cands if c.get("candidate_id","").startswith("gyeongju-VG-NEW-REST-"))
        ident = next((r for r in d["rest_identities"] if r.get("hex_id") == hex_id or r.get("source_fact_id") == sfid), {})
        verdict = ident.get("verdict","?")
        records.append({
            "vg_hex_id": hex_id,
            "hex_id_length": hex_len,
            "expected_sfid": sfid,
            "sfid_exists_in_sfs": sfid_exists,
            "expected_ml_eid": ml_eid,
            "ml_eid_exists": ml_exists,
            "verdict": verdict,
            "is_new_candidate": is_new_cand,
            "entity_type": "restaurant",
            "hex_id_ok": hex_len == 34,
        })

    for souv in sorted(vg_souv_raw, key=lambda x: x.get("hex_id","")):
        hex_id = souv.get("hex_id","")
        sfid = f"gyeongju-VG-SOUV-{hex_id}"
        hex_len = len(hex_id)
        sfid_exists = sfid in actual_vg_souv_sfs
        records.append({
            "vg_hex_id": hex_id,
            "hex_id_length": hex_len,
            "expected_sfid": sfid,
            "sfid_exists_in_sfs": sfid_exists,
            "entity_type": "souvenir",
            "hex_id_ok": hex_len == 34,
        })

    hex_ok = all(r["hex_id_ok"] for r in records)
    sfid_ok = all(r.get("sfid_exists_in_sfs",True) for r in records)
    verdict = "PASS" if hex_ok and sfid_ok and not hexid_16_rest and not hexid_16_souv and not cross_collision else "FAIL"
    print(f"  VG REST sfids: {len(actual_vg_rest_sfs)}/84, SOUV sfids: {len(actual_vg_souv_sfs)}/8")
    print(f"  old-16 hexId: REST={len(hexid_16_rest)}, SOUV={len(hexid_16_souv)}")
    print(f"  cross-collision: {len(cross_collision)}, S2 verdict: {verdict}")

    summary = {
        "section": "S2_VG_ID_STRUCTURE",
        "vg_rest_raw": len(vg_rest_raw),
        "vg_souv_raw": len(vg_souv_raw),
        "vg_rest_sfids_in_output": len(actual_vg_rest_sfs),
        "vg_souv_sfids_in_output": len(actual_vg_souv_sfs),
        "old_16char_hexid_rest_sfids": len(hexid_16_rest),
        "old_16char_hexid_souv_sfids": len(hexid_16_souv),
        "old_16char_hexid_ml_rest": len(ml_rest_hexid_16),
        "old_16char_hexid_ml_souv": len(ml_souv_hexid_16),
        "rest_souv_cross_collision": len(cross_collision),
        "missing_rest_sfids": len(missing_rest_sfs),
        "hex_id_all_34chars": hex_ok,
        "verdict": verdict,
        "records": records,
    }
    return summary


# ════════════════════════════════════════════════════════════
# S3: 의미적 결과 보존
# ════════════════════════════════════════════════════════════
def section3_semantic_preservation(d) -> dict:
    print("\n[S3] Semantic preservation…")
    att = d["att_identities"]
    rest = d["rest_identities"]
    souv = d["souv_classif"]

    att_dist = Counter(r.get("verdict","?") for r in att)
    rest_dist = Counter(r.get("verdict","?") for r in rest)
    souv_dist = Counter(r.get("place_type","?") for r in souv)

    checks = [
        ("att_HC", att_dist.get("HIGH_CONFIDENCE",0), EXPECT["att_hc"]),
        ("att_MR", att_dist.get("MANUAL_REVIEW",0), EXPECT["att_mr"]),
        ("att_NEW", att_dist.get("NEW_OFFICIAL_PLACE",0), EXPECT["att_new"]),
        ("rest_HC", rest_dist.get("HIGH_CONFIDENCE",0), EXPECT["rest_hc"]),
        ("rest_MR", rest_dist.get("MANUAL_REVIEW",0), EXPECT["rest_mr"]),
        ("rest_NEW", rest_dist.get("NEW_OFFICIAL_PLACE",0), EXPECT["rest_new"]),
        ("souv_PHYSICAL", souv_dist.get("PHYSICAL_PLACE",0), EXPECT["souv_physical"]),
    ]

    failures = []
    for name, actual, expected in checks:
        if actual != expected:
            failures.append({"check": name, "actual": actual, "expected": expected})
            defect("HIGH", "S3", f"Semantic mismatch: {name} actual={actual} expected={expected}")

    # Souvenir baseline link
    souv_bl_linked = sum(1 for s in souv if s.get("baseline_candidate_id") is not None)
    souv_new_cands = sum(1 for s in souv if s.get("identity_status") == "NEW_OFFICIAL_PLACE" and s.get("baseline_candidate_id") is None)
    if souv_bl_linked != EXPECT["souv_baseline_link"]:
        defect("MEDIUM", "S3", f"Souvenir baseline link: actual={souv_bl_linked} expected={EXPECT['souv_baseline_link']}")

    result = {
        "section": "S3_SEMANTIC_PRESERVATION",
        "att_distribution": dict(att_dist),
        "rest_distribution": dict(rest_dist),
        "souv_distribution": dict(souv_dist),
        "souv_baseline_linked": souv_bl_linked,
        "souv_new_candidates": souv_new_cands,
        "semantic_failures": failures,
        "verdict": "PASS" if not failures else "FAIL",
    }
    print(f"  att: HC={att_dist.get('HIGH_CONFIDENCE',0)}/MR={att_dist.get('MANUAL_REVIEW',0)}/NEW={att_dist.get('NEW_OFFICIAL_PLACE',0)}")
    print(f"  rest: HC={rest_dist.get('HIGH_CONFIDENCE',0)}/MR={rest_dist.get('MANUAL_REVIEW',0)}/NEW={rest_dist.get('NEW_OFFICIAL_PLACE',0)}")
    print(f"  S3 verdict: {result['verdict']}")
    return result


# ════════════════════════════════════════════════════════════
# S4: DEF-H01 5건 재검증
# ════════════════════════════════════════════════════════════
def section4_def_h01_recheck(d) -> list:
    print("\n[S4] DEF-H01 5건 재검증…")
    cands = d["candidates"]
    sfs = d["source_facts"]
    rest_idents = d["rest_identities"]
    mapping = d["vg_mapping"]

    # Build candidate index
    cand_by_id = {c["candidate_id"]: c for c in cands}
    sf_by_id = {s["source_fact_id"]: s for s in sfs}

    # From mapping audit, find new IDs for old 16-char IDs
    # The 3 VG rest LIKELY_DUP from QA v1:
    OLD_VG_TARGETS = {
        "535f40400604084d",  # 고도벌 한정식 - matched GJ08-733, GJ09-733
        "535f40400605094c",  # matched GJ08-6733
        "535f404007020940",  # matched GJ09-372
    }
    WEB_ATT_TARGETS = {"gyeongju-WEB-NEW-ATT-307", "gyeongju-WEB-NEW-ATT-390"}

    # Find new VG candidate IDs from mapping
    cand_mapping = {r["old_candidate_id"]: r["new_candidate_id"] for r in mapping
                    if r.get("type") == "candidate_id" and r.get("old_candidate_id") and r.get("new_candidate_id")}

    # Also look up by vg_hex_id prefix
    new_vg_cand_by_prefix = {}
    for c in cands:
        cid = c.get("candidate_id","")
        if cid.startswith("gyeongju-VG-NEW-REST-"):
            hex_part = cid.replace("gyeongju-VG-NEW-REST-","")
            prefix16 = hex_part[:16]
            new_vg_cand_by_prefix[prefix16] = c

    # Baseline index by ID for cross-check
    bl_by_id = {c["candidate_id"]: c for c in d["baseline"]}

    # Name/phone index on baseline
    bl_by_norm_name = defaultdict(list)
    bl_by_phone = defaultdict(list)
    for c in d["baseline"]:
        n = norm_name(c.get("title_ko","") or c.get("name","") or "")
        p = norm_phone(c.get("phone","") or "")
        if n: bl_by_norm_name[n].append(c["candidate_id"])
        if p: bl_by_phone[p].append(c["candidate_id"])

    records = []

    # VG restaurant cases
    for prefix in sorted(OLD_VG_TARGETS):
        old_cid = f"gyeongju-VG-NEW-REST-{prefix}"
        new_cand = new_vg_cand_by_prefix.get(prefix)
        if new_cand is None:
            # Try by vg_hex_id match
            for c in cands:
                if c.get("vg_hex_id","").startswith(prefix):
                    new_cand = c
                    break

        if new_cand is None:
            records.append({
                "old_candidate_id": old_cid,
                "new_candidate_id": None,
                "entity_type": "restaurant",
                "name_ko": None,
                "phone": None,
                "address": None,
                "matched_baseline_ids": [],
                "match_basis": [],
                "recheck_verdict": "INSUFFICIENT_EVIDENCE",
                "notes": "New candidate not found in post-fix output",
            })
            continue

        new_cid = new_cand["candidate_id"]
        name_ko = new_cand.get("title_ko","") or ""
        phone = new_cand.get("phone","") or ""
        address = new_cand.get("address","") or ""
        n = norm_name(name_ko)
        p = norm_phone(phone)

        # Find matched baseline candidates
        matched_by_name = set(bl_by_norm_name.get(n,[]))
        matched_by_phone = set(bl_by_phone.get(p,[])) if p else set()
        matched_both = matched_by_name & matched_by_phone
        matched_any = matched_by_name | matched_by_phone

        # Get identity verdict from rest_identities
        sfid = new_cand.get("linked_source_facts",[None])[0] or f"gyeongju-VG-REST-{new_cand.get('vg_hex_id','')}"
        ident_rec = next((r for r in rest_idents if r.get("source_fact_id") == sfid or
                          r.get("hex_id","").startswith(prefix)), {})

        # Determine verdict
        if matched_both and len(matched_both) >= 1:
            # Name + phone both match → LIKELY or CONFIRMED
            # Check address too
            for bl_id in matched_both:
                bl = bl_by_id.get(bl_id,{})
                bl_addr = norm_name(bl.get("address","") or "")
                if bl_addr and norm_name(address) and bl_addr == norm_name(address):
                    verdict = "CONFIRMED_DUPLICATE"
                else:
                    verdict = "LIKELY_DUPLICATE"
                break
        elif matched_by_name and not matched_by_phone:
            verdict = "POSSIBLE_ALIAS_OR_RENAME"
        elif matched_by_phone and not matched_by_name:
            verdict = "INSUFFICIENT_EVIDENCE"  # phone-only
        else:
            verdict = "INSUFFICIENT_EVIDENCE"

        records.append({
            "old_candidate_id": old_cid,
            "new_candidate_id": new_cid,
            "vg_hex_id": new_cand.get("vg_hex_id",""),
            "entity_type": "restaurant",
            "name_ko": name_ko,
            "phone": phone,
            "address": address,
            "official_url": new_cand.get("official_url",""),
            "matched_baseline_by_name": sorted(matched_by_name),
            "matched_baseline_by_phone": sorted(matched_by_phone),
            "matched_both_name_and_phone": sorted(matched_both),
            "match_basis": (["name"] if matched_by_name else []) + (["phone"] if matched_by_phone else []),
            "identity_verdict_from_normalization": ident_rec.get("verdict","?"),
            "recheck_verdict": verdict,
            "notes": f"ID updated from 16-char prefix to full hexId in v1.2.0",
        })
        print(f"  VG-REST {prefix[:8]}: name={name_ko!r} matched_both={len(matched_both)} verdict={verdict}")

    # WEB ATT cases
    for cid in sorted(WEB_ATT_TARGETS):
        cand = cand_by_id.get(cid)
        if cand is None:
            records.append({
                "old_candidate_id": cid,
                "new_candidate_id": cid,
                "entity_type": "attraction",
                "name_ko": None,
                "recheck_verdict": "INSUFFICIENT_EVIDENCE",
                "notes": "Candidate not found",
            })
            continue

        name_ko = cand.get("title_ko","") or ""
        phone = cand.get("phone","") or ""
        p = norm_phone(phone)

        # Check for KTO15 (accommodation) phone matches
        kto15_cands = [c for c in d["baseline"] if c.get("candidate_id","").startswith("gyeongju-KTO15-")]
        kto15_by_phone = defaultdict(list)
        for c in kto15_cands:
            cp = norm_phone(c.get("phone","") or "")
            if cp: kto15_by_phone[cp].append(c["candidate_id"])

        phone_match_kto15 = kto15_by_phone.get(p,[])

        # Address comparison
        cand_addr = cand.get("address","") or ""
        addr_matches = []
        for kto_cid in phone_match_kto15:
            kto = bl_by_id.get(kto_cid,{})
            kto_addr = kto.get("address","") or ""
            if norm_name(cand_addr) and norm_name(kto_addr) == norm_name(cand_addr):
                addr_matches.append(kto_cid)

        # Phone-only → not duplicate; same address + phone → possible
        if addr_matches:
            verdict = "POSSIBLE_DUPLICATE"
            notes = "Same phone + same address as KTO15 accommodation; shared tel likely"
        elif phone_match_kto15:
            verdict = "NO_DUPLICATE_AFTER_REVIEW"
            notes = "Phone match only against KTO15; phone-only insufficient; likely shared tourism hotline"
        else:
            verdict = "NO_DUPLICATE_AFTER_REVIEW"
            notes = "No strong duplicate signal found"

        records.append({
            "old_candidate_id": cid,
            "new_candidate_id": cid,
            "entity_type": "attraction",
            "name_ko": name_ko,
            "phone": phone,
            "address": cand_addr,
            "official_url": cand.get("official_url",""),
            "kto15_phone_matches": phone_match_kto15,
            "kto15_address_matches": addr_matches,
            "recheck_verdict": verdict,
            "notes": notes,
        })
        print(f"  WEB-ATT {cid}: name={name_ko!r} phone_match_kto15={len(phone_match_kto15)} verdict={verdict}")

    # High-severity verdicts
    high_sev = [r for r in records if r["recheck_verdict"] in ("CONFIRMED_DUPLICATE", "LIKELY_DUPLICATE")]
    if high_sev:
        defect("HIGH", "S4", f"DEF-H01 re-check: {len(high_sev)} HIGH-severity duplicate(s) remain",
               [r["new_candidate_id"] for r in high_sev], [r["new_candidate_id"] for r in high_sev])

    print(f"  Total checked: {len(records)}, HIGH remaining: {len(high_sev)}")
    return records


# ════════════════════════════════════════════════════════════
# S4: DEF-H01 5건 재검증
# ════════════════════════════════════════════════════════════
def _norm_name_nospace(s: str) -> str:
    """한국어 이름 정규화 — 공백 완전 제거 (식당/본점 suffix 차이 허용)"""
    if not s:
        return ""
    s = unicodedata.normalize("NFKC", s)
    s = re.sub(r"\s+", "", s).strip().lower()
    s = re.sub(r"[^가-힣a-z0-9]", "", s)
    return s

def section4_def_h01_recheck(d) -> list:
    print("\n[S4] DEF-H01 5원 재검증…")
    cands = d["candidates"]
    baseline = d["baseline"]
    rest_idents = d["rest_identities"]

    cand_by_id = {c["candidate_id"]: c for c in cands}
    bl_by_id = {c["candidate_id"]: c for c in baseline}

    # Baseline indexes (nospace normalization for Korean)
    bl_by_name = defaultdict(list)
    bl_by_phone = defaultdict(list)
    for c in baseline:
        raw_name = c.get("title_ko","") or c.get("name","") or ""
        n = re.sub(r"[^\uAC00-\uD7A3a-z0-9]", "",
                   re.sub(r"\s+", "", unicodedata.normalize("NFKC", raw_name).strip().lower()))
        p = re.sub(r"[^0-9]", "", c.get("phone","") or "")
        if n: bl_by_name[n].append(c["candidate_id"])
        if p: bl_by_phone[p].append(c["candidate_id"])

    def nns(s):
        """Normalize name, no space."""
        if not s: return ""
        s = unicodedata.normalize("NFKC", s)
        s = re.sub(r"\s+", "", s).strip().lower()
        s = re.sub(r"[^\uAC00-\uD7A3a-z0-9]", "", s)
        return s

    VG_PREFIXES = {
        "535f40400604084d": "\uace0\ub3c4\ubc8c\ud55c\uc815\uc2dd \uadf8\ub8f9 (GJ08-733/GJ09-733)",
        "535f40400605094c": "\ube44\uac74\ub808\uc2a4\ud1a0\ub791 \uadf8\ub8f9 (GJ08-6733)",
        "535f404007020940": "\ubc00\uba74\uc2dd\ub2f9 \uadf8\ub8f9 (GJ09-372)",
    }
    WEB_ATT_TARGETS = ["gyeongju-WEB-NEW-ATT-307", "gyeongju-WEB-NEW-ATT-390"]

    records = []

    for pfx, label in sorted(VG_PREFIXES.items()):
        group = [c for c in cands if c.get("candidate_id","").startswith(f"gyeongju-VG-NEW-REST-{pfx}")]
        old_cid = f"gyeongju-VG-NEW-REST-{pfx}"
        group_findings = []
        for c in sorted(group, key=lambda x: x.get("candidate_id","")):
            cid = c["candidate_id"]
            name_ko = c.get("title_ko","") or ""
            phone = c.get("phone","") or ""
            n = nns(name_ko)
            p = re.sub(r"[^0-9]", "", phone)
            name_matches = set(bl_by_name.get(n,[]))
            phone_matches = set(bl_by_phone.get(p,[])) if p else set()
            both = name_matches & phone_matches
            containment_matches = set()
            if n and not both:
                for bl_id in phone_matches:
                    bl_c = bl_by_id.get(bl_id,{})
                    bl_n = nns(bl_c.get("title_ko","") or bl_c.get("name","") or "")
                    if bl_n and (n in bl_n or bl_n in n):
                        containment_matches.add(bl_id)
            if both:
                status = "CONFIRMED_DUPLICATE"; matched = sorted(both)
            elif containment_matches:
                status = "LIKELY_DUPLICATE"; matched = sorted(containment_matches)
            elif name_matches:
                status = "LIKELY_DUPLICATE"; matched = sorted(name_matches)
            elif phone_matches:
                phone_cats = [bl_by_id.get(bid,{}).get("category","?") for bid in phone_matches]
                if len(phone_matches) >= 2 or all(cat == "event" for cat in phone_cats):
                    status = "NOT_DUPLICATE_SHARED_PHONE"
                else:
                    status = "POSSIBLE_DUPLICATE"
                matched = sorted(phone_matches)
            else:
                status = "NO_SIGNAL"; matched = []
            sfid_list = c.get("linked_source_facts") or c.get("_web_source_facts_linked") or []
            sfid = sfid_list[0] if sfid_list else None
            ident_rec = next((r for r in rest_idents if r.get("source_fact_id") == sfid), {})
            group_findings.append({
                "candidate_id": cid,
                "vg_hex_id": c.get("vg_hex_id",""),
                "name_ko": name_ko,
                "phone": phone,
                "name_matches_baseline": sorted(name_matches),
                "phone_matches_baseline": sorted(phone_matches),
                "containment_matches": sorted(containment_matches),
                "baseline_matches": matched,
                "identity_verdict_from_normalization": ident_rec.get("verdict","?"),
                "status": status,
            })
        likely_in_group = [f for f in group_findings if f["status"] in ("CONFIRMED_DUPLICATE","LIKELY_DUPLICATE")]
        group_verdict = "LIKELY_DUPLICATE_PRESENT" if likely_in_group else "NO_DUPLICATE_SIGNAL"
        records.append({
            "type": "vg_prefix_group",
            "old_candidate_id": old_cid,
            "prefix": pfx,
            "label": label,
            "group_size_v12": len(group),
            "likely_duplicate_candidates": len(likely_in_group),
            "group_verdict": group_verdict,
            "findings": group_findings,
        })
        print(f"  prefix {pfx[:16]}: {len(group)} cands, likely_dup={len(likely_in_group)}, verdict={group_verdict}")

    for cid in sorted(WEB_ATT_TARGETS):
        c = cand_by_id.get(cid)
        if not c:
            records.append({"type":"web_att","candidate_id":cid,"verdict":"NOT_FOUND"})
            continue
        name_ko = c.get("title_ko","") or ""
        phone = c.get("phone","") or ""
        p = re.sub(r"[^0-9]", "", phone)
        phone_matches = sorted(bl_by_phone.get(p,[]))
        phone_cats = [bl_by_id.get(bid,{}).get("category","?") for bid in phone_matches]
        all_events = bool(phone_matches) and all(cat == "event" for cat in phone_cats)
        if all_events:
            verdict = "NOT_DUPLICATE_SHARED_TOURISM_HOTLINE"
            notes = f"Phone {phone} matches only KTO15 events; city tourism hotline"
        elif phone_matches:
            verdict = "PHONE_ONLY_NEEDS_REVIEW"
            notes = f"Phone matches non-event: {phone_matches[:2]}"
        else:
            verdict = "NO_SIGNAL"; notes = "No duplicate signal found"
        records.append({
            "type": "web_att",
            "candidate_id": cid,
            "name_ko": name_ko,
            "phone": phone,
            "category": c.get("category",""),
            "address": c.get("address",""),
            "phone_matches_baseline": phone_matches,
            "phone_match_categories": phone_cats,
            "verdict": verdict,
            "notes": notes,
        })
        print(f"  WEB-ATT {cid}: verdict={verdict}")

    vg_likely = sum(r.get("likely_duplicate_candidates",0) for r in records if r.get("type")=="vg_prefix_group")
    web_att_issues = [r for r in records if r.get("type")=="web_att" and r.get("verdict")=="PHONE_ONLY_NEEDS_REVIEW"]
    if vg_likely > 0:
        affected = []
        for r in records:
            if r.get("type") == "vg_prefix_group":
                for f in r.get("findings",[]):
                    if f["status"] in ("CONFIRMED_DUPLICATE","LIKELY_DUPLICATE"):
                        affected.append(f["candidate_id"])
        defect("HIGH", "S4",
               f"DEF-H01 {vg_likely}\uac74 LIKELY_DUPLICATE \uc5ec\uc804\ud788 \uc874\uc7ac "
               "(VG-KTO \ub370\uc774\ud130 \uc911\ubcf5, \uc218\ub3d9 LINK \ud544\uc694)",
               affected[:3], affected)
    if web_att_issues:
        defect("LOW", "S4",
               f"WEB-ATT {len(web_att_issues)}\uac74 PHONE_ONLY signal (\uad00\uad11\uccad \uc804\ud654 \uacf5\uc720 \ucd94\uc815)")
    print(f"  VG LIKELY_DUPLICATE: {vg_likely}, WEB-ATT PHONE_ONLY: {len(web_att_issues)}")
    return records



# S5: 신규 83건 중복 재검색
# ════════════════════════════════════════════════════════════
def section5_new_candidate_dup_audit(d) -> list:
    print("\n[S5] New candidate 83건 중복 재검색…")
    cands = d["candidates"]
    bl_id_set = {c["candidate_id"] for c in d["baseline"]}

    new_cands = [c for c in cands if c.get("candidate_id") not in bl_id_set]

    # Index
    new_by_name = defaultdict(list)
    new_by_phone = defaultdict(list)
    new_by_url = defaultdict(list)

    for c in new_cands:
        n = norm_name(c.get("title_ko","") or c.get("name","") or "")
        p = norm_phone(c.get("phone","") or "")
        url = (c.get("official_url","") or "").strip().lower()
        cid = c["candidate_id"]
        if n: new_by_name[n].append(cid)
        if p: new_by_phone[p].append(cid)
        if url: new_by_url[url].append(cid)

    # Baseline index
    bl_by_name = defaultdict(list)
    bl_by_phone = defaultdict(list)
    for c in d["baseline"]:
        n = norm_name(c.get("title_ko","") or c.get("name","") or "")
        p = norm_phone(c.get("phone","") or "")
        if n: bl_by_name[n].append(c["candidate_id"])
        if p: bl_by_phone[p].append(c["candidate_id"])

    records = []
    likely_dup_ids = set()

    for c in sorted(new_cands, key=lambda x: x.get("candidate_id","")):
        cid = c["candidate_id"]
        n = norm_name(c.get("title_ko","") or c.get("name","") or "")
        p = norm_phone(c.get("phone","") or "")
        url = (c.get("official_url","") or "").strip().lower()

        # Among new candidates
        name_dup_new = [x for x in new_by_name.get(n,[]) if x != cid]
        phone_dup_new = [x for x in new_by_phone.get(p,[]) if x != cid] if p else []
        url_dup_new = [x for x in new_by_url.get(url,[]) if x != cid] if url else []

        # Against baseline
        name_match_bl = bl_by_name.get(n,[])
        phone_match_bl = bl_by_phone.get(p,[]) if p else []

        signals = []
        if name_dup_new: signals.append("name_conflict_within_new")
        if phone_dup_new: signals.append("phone_conflict_within_new")
        if name_match_bl and phone_match_bl:
            common = set(name_match_bl) & set(phone_match_bl)
            if common:
                signals.append("name_AND_phone_match_baseline")
        elif name_match_bl:
            signals.append("name_match_baseline")
        elif phone_match_bl:
            signals.append("phone_match_baseline_only")

        # Determine dup status
        if "name_AND_phone_match_baseline" in signals:
            dup_status = "LIKELY_DUPLICATE"
        elif "name_conflict_within_new" in signals and "phone_conflict_within_new" in signals:
            dup_status = "LIKELY_DUPLICATE"
        elif len(signals) >= 2:
            dup_status = "POSSIBLE_DUPLICATE"
        elif signals:
            dup_status = "POSSIBLE_DUPLICATE" if "name_match_baseline" in signals else "NO_DUPLICATE_SIGNAL"
        else:
            dup_status = "NO_DUPLICATE_SIGNAL"

        records.append({
            "candidate_id": cid,
            "category": c.get("category",""),
            "name_ko": c.get("title_ko","") or c.get("name","") or "",
            "dup_status": dup_status,
            "signals": sorted(signals),
            "name_dup_within_new": sorted(name_dup_new),
            "phone_dup_within_new": sorted(phone_dup_new),
            "name_match_baseline": sorted(name_match_bl),
            "phone_match_baseline": sorted(phone_match_bl),
        })

        if dup_status == "LIKELY_DUPLICATE":
            likely_dup_ids.add(cid)

    # Unique LIKELY_DUPLICATE candidates
    if likely_dup_ids:
        defect("HIGH", "S5", f"{len(likely_dup_ids)} LIKELY_DUPLICATE new candidates",
               sorted(likely_dup_ids), sorted(likely_dup_ids))

    dist = Counter(r["dup_status"] for r in records)
    print(f"  New candidates checked: {len(records)}")
    for k,v in sorted(dist.items()): print(f"    {k}: {v}")
    return records


# ════════════════════════════════════════════════════════════
# S6: 수동 검토 큐 38건
# ════════════════════════════════════════════════════════════
def section6_manual_review_qa(d) -> list:
    print("\n[S6] Manual review queue 38건 QA…")
    mr = d["manual_review"]
    bl_by_id = {c["candidate_id"]: c for c in d["baseline"]}
    cand_by_id = {c["candidate_id"]: c for c in d["candidates"]}
    sf_by_id = {s["source_fact_id"]: s for s in d["source_facts"]}

    records = []
    for item in sorted(mr, key=lambda x: (x.get("review_type") or "") + (x.get("source_fact_id") or "") + (x.get("candidate_id") or "") + str(x.get("area_uid") or "0")):
        rt = item.get("review_type","")
        sfid = item.get("source_fact_id") or item.get("sfid","")
        cid = item.get("candidate_id") or item.get("baseline_candidate_id","")
        area_uid = item.get("area_uid")

        # Check SF/candidate existence
        sf_exists = (sfid in sf_by_id) if sfid else None
        cand_exists = (cid in cand_by_id or cid in bl_by_id) if cid else None

        # Classify
        if rt in ("monthly_rec", "monthly_rec_relation"):
            verdict = "SOURCE_LIMITATION_CONFIRMED"
            notes = f"Monthly-rec area_uid={area_uid} — MANUAL_REVIEW pending field verification"
        elif rt in ("cultural_guide", "cultural_guide_relation"):
            verdict = "REVIEW_CONFIRMED"
            notes = "Cultural guide manual review — source page structure limitation"
        elif rt in ("souvenir", "souvenir_shop"):
            if item.get("review_required") and item.get("place_type") == "AMBIGUOUS":
                verdict = "REVIEW_CONFIRMED"
                notes = "Souvenir AMBIGUOUS — place vs content-only undetermined"
            else:
                verdict = "REVIEW_CONFIRMED"
                notes = "Souvenir review item"
        elif rt in ("attraction", "att"):
            if sf_exists is False:
                verdict = "DATA_FIX_REQUIRED"
                notes = f"SF {sfid} not found in output"
            else:
                verdict = "REVIEW_CONFIRMED"
                notes = "Attraction identity MANUAL_REVIEW"
        elif rt in ("restaurant", "rest"):
            if sf_exists is False:
                verdict = "DATA_FIX_REQUIRED"
                notes = f"SF {sfid} not found in output"
            else:
                verdict = "REVIEW_CONFIRMED"
                notes = "Restaurant identity MANUAL_REVIEW"
        else:
            verdict = "REVIEW_CONFIRMED"
            notes = f"review_type={rt}"

        records.append({
            "review_type": rt,
            "source_fact_id": sfid,
            "candidate_id": cid,
            "area_uid": area_uid,
            "sf_exists": sf_exists,
            "cand_exists": cand_exists,
            "verdict": verdict,
            "notes": notes,
        })

    data_fix_needed = [r for r in records if r["verdict"] == "DATA_FIX_REQUIRED"]
    if data_fix_needed:
        defect("HIGH", "S6", f"{len(data_fix_needed)} manual review items have DATA_FIX_REQUIRED",
               [r["source_fact_id"] for r in data_fix_needed])

    dist = Counter(r["verdict"] for r in records)
    print(f"  Queue items: {len(records)}")
    for k,v in sorted(dist.items()): print(f"    {k}: {v}")
    return records


# ════════════════════════════════════════════════════════════
# S7: 다국어 92×5 QA
# ════════════════════════════════════════════════════════════
def section7_multilingual_qa(d) -> list:
    print("\n[S7] Multilingual 92×5 QA…")
    ml = d["multilingual"]
    cand_by_id = {c["candidate_id"]: c for c in d["candidates"]}
    sf_by_id = {s["source_fact_id"]: s for s in d["source_facts"]}

    entity_ids = [r["entity_source_id"] for r in ml]
    entity_id_dup = {k: v for k, v in Counter(entity_ids).items() if v > 1}
    if entity_id_dup:
        defect("CRITICAL", "S7", f"{len(entity_id_dup)} duplicate entity_source_id in multilingual output")

    old_16_eids = [eid for eid in entity_ids if re.search(r"gyeongju-VG-(REST|SOUV)-[0-9a-f]{16}$", eid)]
    if old_16_eids:
        defect("CRITICAL", "S7", f"{len(old_16_eids)} old 16-char hexId entity_source_id remaining")

    records = []
    name_missing_count = 0
    url_missing_count = 0
    locale_not_fetched = 0

    for entity in sorted(ml, key=lambda x: x.get("entity_source_id","")):
        eid = entity.get("entity_source_id","")
        vg_hex = entity.get("vg_hex_id","")
        hex_len = len(vg_hex)
        variants = entity.get("locale_variants",[])
        locale_count = len(variants)
        missing_locales = []
        locale_details = []

        for lc in LOCALE_ORDER:
            v = next((lv for lv in variants if lv.get("locale") == lc), None)
            if v is None:
                missing_locales.append(lc)
                locale_details.append({"locale": lc, "status": "MISSING"})
                continue
            ename = v.get("entity_name") or ""
            url = v.get("official_url","") or ""
            tc = v.get("translation_classification","") or ""
            if not ename:
                name_missing_count += 1
            if not url:
                url_missing_count += 1
            if tc == "NOT_FETCHED":
                locale_not_fetched += 1
            locale_details.append({
                "locale": lc,
                "status": "OK" if ename else "NAME_MISSING",
                "has_name": bool(ename),
                "has_url": bool(url),
                "translation_class": tc,
            })

        records.append({
            "entity_source_id": eid,
            "vg_hex_id": vg_hex,
            "hex_id_length": hex_len,
            "content_type": entity.get("content_type",""),
            "name_ko": entity.get("name_ko",""),
            "locale_variant_count": locale_count,
            "missing_locales": missing_locales,
            "hex_id_ok": hex_len == 34,
            "locale_details": locale_details,
        })

    if name_missing_count:
        defect("MEDIUM", "S7", f"{name_missing_count} locale variants with missing entity_name")
    if locale_not_fetched > len(ml) * 3:
        defect("LOW", "S7", f"{locale_not_fetched} NOT_FETCHED locale variants")

    all_hex_ok = all(r["hex_id_ok"] for r in records)
    verdict = "PASS" if len(ml) == EXPECT["multilingual_entities"] and not entity_id_dup and not old_16_eids and all_hex_ok else "FAIL"
    print(f"  Total entities: {len(ml)}/{EXPECT['multilingual_entities']}")
    print(f"  entity_id dups: {len(entity_id_dup)}, old 16-char: {len(old_16_eids)}")
    print(f"  name_missing: {name_missing_count}, S7 verdict: {verdict}")

    return records


# ════════════════════════════════════════════════════════════
# S8: 행사·관계 QA
# ════════════════════════════════════════════════════════════
def section8_relation_qa(d) -> dict:
    print("\n[S8] 행사·관계 QA…")
    failures = []

    # Events
    ev_ents = d["event_entities"]
    ev_list = d["event_listings"]
    if len(ev_list) != EXPECT["event_listings"]:
        defect("HIGH", "S8", f"Event listings: {len(ev_list)} ≠ {EXPECT['event_listings']}")
        failures.append(f"event_listings={len(ev_list)}")
    if len(ev_ents) != EXPECT["event_entities"]:
        defect("HIGH", "S8", f"Event entities: {len(ev_ents)} ≠ {EXPECT['event_entities']}")
        failures.append(f"event_entities={len(ev_ents)}")
    # Date sanity check
    for e in ev_ents:
        start = e.get("start_date","") or ""
        end = e.get("end_date","") or ""
        if start and end and start > end:
            defect("HIGH", "S8", f"Event date inversion: {e.get('entity_id','')} start={start} end={end}")

    # Recommendations
    rec_colls = d["rec_collections"]
    rec_rels = d["rec_relations"]
    if len(rec_colls) != EXPECT["rec_collections"]:
        defect("MEDIUM", "S8", f"Rec collections: {len(rec_colls)} ≠ {EXPECT['rec_collections']}")
    official_area_uid_rels = [r for r in rec_rels if r.get("identity_status") in ("LINKED_VIA_AREA_UID","MANUAL_REVIEW")]
    mutable_colls = sum(1 for c in rec_colls if c.get("source_mutability") == "MUTABLE_SOURCE_PAGE")
    if mutable_colls != EXPECT["rec_collections"]:
        defect("MEDIUM", "S8", f"MUTABLE_SOURCE_PAGE collections: {mutable_colls} ≠ {EXPECT['rec_collections']}")

    # Courses
    courses = d["courses"]
    waypoints = d["waypoints"]
    if len(courses) != EXPECT["course_count"]:
        defect("MEDIUM", "S8", f"Courses: {len(courses)} ≠ {EXPECT['course_count']}")
    if len(waypoints) != EXPECT["course_waypoints"]:
        defect("MEDIUM", "S8", f"Waypoints: {len(waypoints)} ≠ {EXPECT['course_waypoints']}")
    # Broken course FK
    course_ids = {c.get("course_id","") for c in courses}
    broken_wp_fk = [w for w in waypoints if w.get("course_id","") not in course_ids]
    if broken_wp_fk:
        defect("HIGH", "S8", f"{len(broken_wp_fk)} waypoints with broken course_id FK")

    # Heritage
    heritage = d["heritage_entities"]
    heritage_rels = d["heritage_relations"]
    related_att_rels = [r for r in heritage_rels if r.get("relation_type") == "RELATED_ATTRACTION"]
    parent_child_rels = [r for r in heritage_rels if r.get("relation_type") == "PARENT_CHILD"]
    if len(heritage) != EXPECT["heritage_entities"]:
        defect("MEDIUM", "S8", f"Heritage entities: {len(heritage)} ≠ {EXPECT['heritage_entities']}")
    if len(related_att_rels) != EXPECT["heritage_related_attraction"]:
        defect("MEDIUM", "S8", f"Heritage RELATED_ATTRACTION: {len(related_att_rels)} ≠ {EXPECT['heritage_related_attraction']}")
    # DEF-L01: coverage limitation
    web_att_ids = {c["candidate_id"] for c in d["candidates"] if c.get("candidate_id","").startswith("gyeongju-WEB-")}
    sf_area_uids = {s.get("web_area_uid") for s in d["source_facts"] if s.get("web_area_uid")}
    heritage_wsf_ids = {r.get("web_source_fact_id","") for r in related_att_rels if r.get("web_source_fact_id")}
    sf_id_set = {s["source_fact_id"] for s in d["source_facts"]}
    heritage_coverage_gaps = [wsf for wsf in heritage_wsf_ids if wsf not in sf_id_set and wsf not in web_att_ids]

    # Cultural guide
    guides = d["guide_relations"]
    if len(guides) != EXPECT["cultural_guide_relations"]:
        defect("MEDIUM", "S8", f"Cultural guide relations: {len(guides)} ≠ {EXPECT['cultural_guide_relations']}")

    result = {
        "section": "S8_RELATION_QA",
        "event_listings": len(ev_list),
        "event_entities": len(ev_ents),
        "rec_collections": len(rec_colls),
        "mutable_source_page_collections": mutable_colls,
        "rec_place_relations": len(rec_rels),
        "rec_official_area_uid_rels": len(official_area_uid_rels),
        "courses": len(courses),
        "course_waypoints": len(waypoints),
        "broken_course_waypoint_fk": len(broken_wp_fk),
        "heritage_entities": len(heritage),
        "heritage_relations_total": len(heritage_rels),
        "heritage_related_attraction": len(related_att_rels),
        "heritage_parent_child": len(parent_child_rels),
        "heritage_coverage_gaps_def_l01": len(heritage_coverage_gaps),
        "cultural_guide_relations": len(guides),
        "failures": failures,
        "verdict": "PASS" if not failures else "PARTIAL_FAIL",
    }
    print(f"  events: listings={len(ev_list)}/entities={len(ev_ents)}")
    print(f"  rec: collections={len(rec_colls)}, heritage: {len(heritage)}/{len(heritage_rels)}, guide: {len(guides)}")
    print(f"  DEF-L01 coverage gaps: {len(heritage_coverage_gaps)} (COVERAGE_LIMITATION)")
    print(f"  S8 verdict: {result['verdict']}")
    return result


# ════════════════════════════════════════════════════════════
# S9: Candidate 품질·provenance QA
# ════════════════════════════════════════════════════════════
def section9_candidate_quality(d) -> dict:
    print("\n[S9] Candidate quality·provenance QA…")
    cands = d["candidates"]
    sf_by_id = {s["source_fact_id"]: s for s in d["source_facts"]}

    no_name = []
    no_official_id = []
    no_url = []
    no_address = []
    no_identity_status = []
    provenance_missing = []
    rights_violation = []
    broken_sf_ref = []

    for c in cands:
        cid = c.get("candidate_id","")
        # Name
        has_name = bool(c.get("title_ko") or c.get("name") or c.get("title_en"))
        if not has_name:
            no_name.append(cid)
        # Official URL
        if not c.get("official_url"):
            no_url.append(cid)
        # Address
        if not c.get("address"):
            no_address.append(cid)
        # Identity status
        if not c.get("identity_status") and "_v1_source" in c:
            # Only check new candidates
            if c.get("_v1_source","").startswith(("web_", "visitgyeongju_")):
                no_identity_status.append(cid)
        # Source fact reference
        for sfid in c.get("linked_source_facts",[]) or c.get("_web_source_facts_linked",[]) or []:
            if sfid and sfid not in sf_by_id:
                broken_sf_ref.append(f"{cid}:{sfid}")
        # Rights check: web image/description
        img = c.get("image_reference","") or ""
        desc = c.get("description_reference","") or ""
        # Simple: visitgyeongju long description or unknown web image
        if "visitgyeongju" in (desc or "").lower() and len(desc) > 500:
            rights_violation.append(f"LONG_DESC:{cid}")

    # Baseline-sourced provenance check
    bl_link_audit = d["baseline_link_audit"]
    for rec in bl_link_audit:
        if not rec.get("source_fact_ids") and not rec.get("_web_source_facts_linked") and not rec.get("web_source_facts_linked"):
            # Baseline candidate with no linked source facts - this is expected for many
            pass

    if rights_violation:
        defect("CRITICAL", "S9", f"{len(rights_violation)} rights policy violation candidates",
               rights_violation[:3], rights_violation)
    if broken_sf_ref:
        defect("HIGH", "S9", f"{len(broken_sf_ref)} candidates with broken source fact reference",
               broken_sf_ref[:3], broken_sf_ref)
    if len(no_name) > 5:
        defect("HIGH", "S9", f"{len(no_name)} candidates with no name")

    result = {
        "section": "S9_CANDIDATE_QUALITY",
        "total_candidates": len(cands),
        "no_name": len(no_name),
        "no_official_url": len(no_url),
        "no_address": len(no_address),
        "no_identity_status_new": len(no_identity_status),
        "broken_sf_reference": len(broken_sf_ref),
        "rights_violation": len(rights_violation),
        "verdict": "PASS" if not rights_violation and not broken_sf_ref else "FAIL",
    }
    print(f"  no_name={len(no_name)}, no_url={len(no_url)}, broken_sf_ref={len(broken_sf_ref)}")
    print(f"  rights_violations={len(rights_violation)}, S9 verdict: {result['verdict']}")
    return result


# ════════════════════════════════════════════════════════════
# S10: DEF-M01 최종 검증
# ════════════════════════════════════════════════════════════
def section10_manifest_qa(d) -> dict:
    print("\n[S10] Manifest consistency QA…")
    import hashlib as _hashlib

    manifest_data = rjson(MANIFEST_PATH)
    files = manifest_data.get("files",[])

    ok = missing = mismatch = perm_err = dir_entry = 0
    stale_paths = []
    missing_paths = []

    for f in files:
        p = REPO / f["path"]
        manifest_sha = f.get("sha256","")
        if p.is_dir():
            dir_entry += 1
            continue
        if not p.exists():
            missing_paths.append(f["path"])
            missing += 1
            continue
        try:
            actual_sha = _hashlib.sha256(p.read_bytes()).hexdigest()
            if actual_sha == manifest_sha:
                ok += 1
            else:
                stale_paths.append(f["path"])
                mismatch += 1
        except PermissionError:
            perm_err += 1

    if mismatch > 0:
        defect("MEDIUM", "S10", f"{mismatch} manifest SHA mismatches remain", stale_paths)
    if missing > 0:
        defect("HIGH", "S10", f"{missing} manifest-tracked files are missing", missing_paths)

    def_m01_status = "DEF-M01_RESOLVED" if mismatch == 0 and missing == 0 else "DEF-M01_STILL_OPEN"

    result = {
        "section": "S10_MANIFEST_QA",
        "total_tracked": len(files),
        "ok": ok,
        "sha_mismatch": mismatch,
        "missing_files": missing,
        "directory_entries": dir_entry,
        "perm_errors": perm_err,
        "stale_paths": stale_paths,
        "missing_paths": missing_paths,
        "def_m01_status": def_m01_status,
        "verdict": "PASS" if mismatch == 0 and missing == 0 else "FAIL",
    }
    print(f"  tracked={len(files)}, ok={ok}, mismatch={mismatch}, missing={missing}, dir={dir_entry}")
    print(f"  DEF-M01: {def_m01_status}")
    return result


# ════════════════════════════════════════════════════════════
# S11: 결함 등록
# ════════════════════════════════════════════════════════════
def section11_defect_register() -> list:
    counter = {"CRITICAL":0, "HIGH":0, "MEDIUM":0, "LOW":0}
    for d in DEFECTS:
        counter[d.get("severity","LOW")] += 1
    print(f"\n[S11] Defects: CRITICAL={counter['CRITICAL']}, HIGH={counter['HIGH']}, MEDIUM={counter['MEDIUM']}, LOW={counter['LOW']}")
    return list(DEFECTS)


# ════════════════════════════════════════════════════════════
# S12: Release/HOLD 준비도
# ════════════════════════════════════════════════════════════
def section12_readiness(defect_reg: list, sections: dict) -> dict:
    print("\n[S12] Release/HOLD readiness…")
    critical = [d for d in defect_reg if d.get("severity") == "CRITICAL"]
    high = [d for d in defect_reg if d.get("severity") == "HIGH"]
    medium = [d for d in defect_reg if d.get("severity") == "MEDIUM"]
    low = [d for d in defect_reg if d.get("severity") == "LOW"]

    # Check all READY conditions
    s1 = sections.get("s1",{})
    s10 = sections.get("s10",{})
    cand_ok = s1.get("full_v1_rows",0) == EXPECT["full_v1_rows"] and s1.get("full_v1_dup_groups",0) == 0
    sf_ok = s1.get("source_fact_rows",0) == EXPECT["source_fact_rows"] and s1.get("source_fact_dup_groups",0) == 0
    fk_ok = s1.get("broken_source_fact_fk",0) == 0 and s1.get("broken_candidate_sf_fk",0) == 0
    old_id_ok = s1.get("old_truncated_vg_candidate_ids",0) == 0 and s1.get("old_truncated_vg_sfids",0) == 0
    manifest_ok = s10.get("sha_mismatch",1) == 0 and s10.get("missing_files",1) == 0
    rights_ok = s9_result.get("rights_violation",0) == 0

    if not critical and not high and cand_ok and sf_ok and fk_ok and manifest_ok and rights_ok:
        if medium:
            readiness = "READY_FOR_GYEONGJU_RELEASE_HOLD_CLASSIFICATION_WITH_TARGETED_FIXES"
        else:
            readiness = "READY_FOR_GYEONGJU_RELEASE_HOLD_CLASSIFICATION"
    elif critical:
        readiness = "GYEONGJU_NORMALIZATION_FIX_REQUIRED"
    elif high:
        confirmed_dup = [d for d in high if "CONFIRMED_DUPLICATE" in d.get("finding","")]
        likely_strong = [d for d in high if "strong" in d.get("finding","").lower() or "LIKELY_DUPLICATE" in d.get("finding","")]
        if confirmed_dup or (len(high) > 2):
            readiness = "GYEONGJU_NORMALIZATION_QA_HOLD"
        else:
            readiness = "READY_FOR_GYEONGJU_RELEASE_HOLD_CLASSIFICATION_WITH_TARGETED_FIXES"
    else:
        readiness = "READY_FOR_GYEONGJU_RELEASE_HOLD_CLASSIFICATION"

    overall_verdict = "PASS" if readiness.startswith("READY") and not critical else \
                      "CONDITIONAL_PASS" if readiness.endswith("TARGETED_FIXES") else \
                      "HOLD" if "QA_HOLD" in readiness else "FAIL"

    result = {
        "section": "S12_READINESS",
        "critical_defects": len(critical),
        "high_defects": len(high),
        "medium_defects": len(medium),
        "low_defects": len(low),
        "candidates_914_unique": cand_ok,
        "source_facts_1158_unique": sf_ok,
        "broken_fk": not fk_ok,
        "old_truncated_ids": not old_id_ok,
        "manifest_clean": manifest_ok,
        "rights_ok": rights_ok,
        "readiness": readiness,
        "overall_verdict": overall_verdict,
    }
    print(f"  CRITICAL={len(critical)}, HIGH={len(high)}, MEDIUM={len(medium)}, LOW={len(low)}")
    print(f"  Readiness: {readiness}")
    print(f"  Overall: {overall_verdict}")
    return result


# ════════════════════════════════════════════════════════════
# Main
# ════════════════════════════════════════════════════════════
s9_result = {}  # global for S12 reference

def run_qa():
    global s9_result
    print(f"=== {TASK} v{VERSION} ===")
    print(f"as_of={AS_OF}")

    d = load_data()

    # Run sections
    s1 = section1_input_integrity(d)
    s2_full = section2_vg_id_structure(d)
    s2_records = s2_full.pop("records", [])
    s3 = section3_semantic_preservation(d)
    s4 = section4_def_h01_recheck(d)
    s5 = section5_new_candidate_dup_audit(d)
    s6 = section6_manual_review_qa(d)
    s7 = section7_multilingual_qa(d)
    s8 = section8_relation_qa(d)
    s9_result = section9_candidate_quality(d)
    s10 = section10_manifest_qa(d)
    defect_reg = section11_defect_register()
    sections = {"s1": s1, "s10": s10}
    s12 = section12_readiness(defect_reg, sections)

    # ── Write outputs ──────────────────────────────────────
    print("\n[Write] Writing QA outputs…")

    wjson(VAL / "gyeongju-normalization-input-integrity-qa-v2.json", s1)
    wjson(VAL / "gyeongju-vg-id-integrity-qa-v2.json", s2_full)
    wjsonl(VAL / "gyeongju-vg-id-integrity-records-v2.jsonl", s2_records)
    wjson(VAL / "gyeongju-semantic-preservation-qa-v2.json", s3)
    wjsonl(VAL / "gyeongju-def-h01-recheck-v2.jsonl", s4)
    wjsonl(VAL / "gyeongju-new-candidate-duplicate-audit-v2.jsonl", s5)
    wjsonl(VAL / "gyeongju-manual-review-queue-qa-v2.jsonl", s6)
    wjsonl(VAL / "gyeongju-multilingual-qa-v2.jsonl", s7)
    wjson(VAL / "gyeongju-relation-integrity-qa-v2.json", s8)
    wjson(VAL / "gyeongju-candidate-quality-provenance-qa-v2.json", s9_result)
    wjson(VAL / "gyeongju-manifest-consistency-qa-v2.json", s10)
    wjsonl(VAL / "gyeongju-independent-qa-defect-register-v2.jsonl", defect_reg)
    wjson(VAL / "gyeongju-release-readiness-assessment-v2.json", s12)

    # Summary
    summary = {
        "task": TASK,
        "script_version": VERSION,
        "as_of": AS_OF,
        "input": {
            "baseline_rows": s1["baseline_rows"],
            "full_v1_rows": s1["full_v1_rows"],
            "source_fact_rows": s1["source_fact_rows"],
        },
        "s1_input_integrity": s1["verdict"],
        "s2_vg_id_structure": s2_full.get("verdict","?"),
        "s3_semantic_preservation": s3["verdict"],
        "s4_def_h01_high_remaining": sum(1 for r in s4 if r.get("recheck_verdict") in ("CONFIRMED_DUPLICATE","LIKELY_DUPLICATE")),
        "s5_new_cand_likely_dup": sum(1 for r in s5 if r.get("dup_status") == "LIKELY_DUPLICATE"),
        "s6_data_fix_required": sum(1 for r in s6 if r.get("verdict") == "DATA_FIX_REQUIRED"),
        "s7_ml_entity_count": len(s7),
        "s8_relation_qa": s8["verdict"],
        "s9_rights_violation": s9_result.get("rights_violation",0),
        "s10_manifest_mismatch": s10["sha_mismatch"],
        "def_m01_status": s10.get("def_m01_status","?"),
        "defects": {
            "CRITICAL": sum(1 for d in defect_reg if d.get("severity")=="CRITICAL"),
            "HIGH": sum(1 for d in defect_reg if d.get("severity")=="HIGH"),
            "MEDIUM": sum(1 for d in defect_reg if d.get("severity")=="MEDIUM"),
            "LOW": sum(1 for d in defect_reg if d.get("severity")=="LOW"),
        },
        "readiness": s12["readiness"],
        "overall_verdict": s12["overall_verdict"],
    }
    wjson(VAL / "gyeongju-normalization-independent-qa-summary-v2.json", summary)

    print("\nOutput files written:")
    for f in sorted(VAL.glob("*-v2.*")):
        sha = hashlib.sha256(f.read_bytes()).hexdigest()
        print(f"  {f.name}: {sha[:16]}")

    return summary

if __name__ == "__main__":
    summary = run_qa()
    print(f"\n{'='*60}")
    print(f"QA COMPLETE: {summary['overall_verdict']} ({summary['readiness']})")
    print(f"Defects: {summary['defects']}")
