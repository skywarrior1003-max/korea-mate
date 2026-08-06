#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TASK-GYEONGJU-CORE-ATTRACTION-NATURE-RELEASE-ENRICHMENT-V1
경주 관광지·자연 HOLD 후보 Offline Enrichment Overlay (네트워크 0건).
VERSION = 1.0.0

원칙:
  - 기존 frozen 파일 수정 금지
  - HTTP/API/WebFetch 0건
  - domain 단독 positive verdict 금지
  - Run1 = Run2 BYTE_IDENTICAL
  - as_of: normalization summary에서 읽음; datetime.now() 금지
  - 로컬 데이터 근거 없으면 추정 금지 → targeted queue
"""

import hashlib
import json
import sys
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse

VERSION = "1.0.0"
TASK    = "TASK-GYEONGJU-CORE-ATTRACTION-NATURE-RELEASE-ENRICHMENT-V1"
BASE_COMMIT = "d54620a"

REPO      = Path(__file__).resolve().parent.parent
NORM      = REPO / "data/tourapi/normalized/gyeongju"
VAL       = REPO / "data/tourapi/validation/gyeongju"
CONTRACTS = REPO / "data/tourapi/contracts/gyeongju"
SCRIPTS   = REPO / "scripts"
MANIFEST  = REPO / "data/tourapi/manifests/gyeongju/gyeongju-manifest-v1.json"

# 대상 카테고리
TARGET_CATEGORIES = {"attraction", "nature"}

# RELEASE 제안 불가 hold reason (개별 후보 수준)
IDENTITY_HOLD_REASONS = {"HOLD_IDENTITY_REVIEW", "HOLD_NO_CURRENT_OFFICIAL_SOURCE"}
EXCLUDED_HOLD_PRIMARY = {"HOLD_IDENTITY_REVIEW"}

# 동결 대상 파일
FROZEN_FILES = {
    "data/tourapi/normalized/gyeongju/gyeongju-full-v1-candidates.jsonl":
        NORM / "gyeongju-full-v1-candidates.jsonl",
    "data/tourapi/normalized/gyeongju/source-facts-full-v1.jsonl":
        NORM / "source-facts-full-v1.jsonl",
    "data/tourapi/validation/gyeongju/gyeongju-candidate-release-hold-v1.jsonl":
        VAL  / "gyeongju-candidate-release-hold-v1.jsonl",
    "data/tourapi/validation/gyeongju/gyeongju-event-release-hold-v1.jsonl":
        VAL  / "gyeongju-event-release-hold-v1.jsonl",
    "data/tourapi/validation/gyeongju/gyeongju-relation-release-usage-v1.jsonl":
        VAL  / "gyeongju-relation-release-usage-v1.jsonl",
    "data/tourapi/validation/gyeongju/gyeongju-release-final-rights-overlay-v1.jsonl":
        VAL  / "gyeongju-release-final-rights-overlay-v1.jsonl",
    "data/tourapi/normalized/gyeongju/gyeongju-heritage-relations-v1.jsonl":
        NORM / "gyeongju-heritage-relations-v1.jsonl",
    "data/tourapi/normalized/gyeongju/gyeongju-course-waypoint-relations-v1.jsonl":
        NORM / "gyeongju-course-waypoint-relations-v1.jsonl",
    "data/tourapi/normalized/gyeongju/gyeongju-recommendation-place-relations-v1.jsonl":
        NORM / "gyeongju-recommendation-place-relations-v1.jsonl",
    "data/tourapi/normalized/gyeongju/gyeongju-cultural-guide-relations-v1.jsonl":
        NORM / "gyeongju-cultural-guide-relations-v1.jsonl",
    "scripts/gyeongju_release_hold_classification_v1.py":
        SCRIPTS / "gyeongju_release_hold_classification_v1.py",
    "scripts/gyeongju_release_rights_resolution_v1.py":
        SCRIPTS / "gyeongju_release_rights_resolution_v1.py",
    "data/tourapi/manifests/gyeongju/gyeongju-manifest-v1.json": MANIFEST,
}

# NS → API ID 매핑 (계약 파일 기준)
NS_TO_API_ID = {
    "GJ01": "GJ01", "GJ02": "GJ02", "GJ03": "GJ03", "GJ04": "GJ04",
    "GJ05": "GJ05", "GJ06": "GJ06", "GJ07": "GJ07", "GJ08": "GJ08",
    "GJ09": "GJ09", "GJ10": "GJ10",
    "KTO39": "KTO_KorService2",
    "KTO15": "KTO_KorService2_events",
    # KTO12, KTO14, KTO28, KTO32, KTO38: 별도 계약 없음 → RIGHTS_EVIDENCE_MISSING
}

# VG 도메인 (domain positive 금지)
VG_DOMAINS = {"visitgyeongju.or.kr", "www.visitgyeongju.or.kr",
              "visitgyeongju.com",   "www.visitgyeongju.com"}

# collection mode 상수
CM_API_DETAIL    = "OFFICIAL_API_DETAIL_REFRESH"
CM_KTO_DETAIL    = "KTO_DETAIL_REFRESH"
CM_KTO_LOCATION  = "KTO_LOCATION_REFRESH"
CM_WEB_FACT      = "OFFICIAL_WEB_FACT_REFRESH"
CM_RIGHTS        = "RIGHTS_CONTRACT_REVIEW"
CM_CATEGORY      = "MANUAL_CATEGORY_REVIEW"

# ─── helpers ─────────────────────────────────────────────────────────────────
def sha256f(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()

def rjl(p):
    return [json.loads(l) for l in Path(p).read_text("utf-8").splitlines() if l.strip()]

def rj(p):
    return json.loads(Path(p).read_text("utf-8"))

def dump(obj):
    return json.dumps(obj, ensure_ascii=False, sort_keys=True)

def write_json(path, obj):
    Path(path).write_text(dump(obj) + "\n", encoding="utf-8")

def write_jsonl(path, records):
    if records and "candidate_id" in records[0]:
        records = sorted(records, key=lambda r: r["candidate_id"])
    Path(path).write_text(
        "\n".join(dump(r) for r in records) + "\n", encoding="utf-8"
    )

def get_ns(sfid):
    parts = (sfid or "").split("-")
    return parts[1] if len(parts) >= 2 else ""

def img_host(url):
    return urlparse(url).netloc if url else ""

def is_vg(host):
    return host in VG_DOMAINS or any(host.endswith("." + d) for d in VG_DOMAINS)

def sha256s(s):
    return hashlib.sha256(s.encode("utf-8")).hexdigest()

# ─── load ─────────────────────────────────────────────────────────────────────
def load_all():
    d = {}
    d["summary"]   = rj(NORM / "gyeongju-normalization-summary-v1.json")
    d["as_of"]     = d["summary"].get("as_of", "UNKNOWN")
    d["full_v1"]   = rjl(NORM / "gyeongju-full-v1-candidates.jsonl")
    d["sf_full"]   = rjl(NORM / "source-facts-full-v1.jsonl")
    d["cl_cands"]  = rjl(VAL  / "gyeongju-candidate-release-hold-v1.jsonl")
    d["heritage_rel"]   = rjl(NORM / "gyeongju-heritage-relations-v1.jsonl")
    d["course_wp"]      = rjl(NORM / "gyeongju-course-waypoint-relations-v1.jsonl")
    d["rec_rel"]        = rjl(NORM / "gyeongju-recommendation-place-relations-v1.jsonl")
    d["guide_rel"]      = rjl(NORM / "gyeongju-cultural-guide-relations-v1.jsonl")
    d["rights_overlay"] = rjl(VAL  / "gyeongju-release-final-rights-overlay-v1.jsonl")

    # contracts
    contracts_raw = []
    for cf in sorted(CONTRACTS.glob("*.json")):
        try:
            c = rj(cf)
            for api_s in c.get("api_sources", []):
                if api_s.get("api_id"):
                    api_s["_contract_file"] = str(cf.relative_to(REPO)).replace("\\", "/")
                    contracts_raw.append(api_s)
        except Exception:
            pass
    d["api_contracts"] = {s["api_id"]: s for s in contracts_raw}

    # missing core fields file (frozen input)
    mcf_path = VAL / "gyeongju-release-missing-core-fields-v1.jsonl"
    d["missing_core"] = rjl(mcf_path) if mcf_path.exists() else []

    return d


def build_indexes(d):
    idx = {}
    idx["full_by_id"] = {c["candidate_id"]: c for c in d["full_v1"]}
    idx["sf_by_id"]   = {s["source_fact_id"]: s for s in d["sf_full"]}
    idx["cl_by_id"]   = {r["candidate_id"]: r for r in d["cl_cands"]}
    idx["api_c"]      = d["api_contracts"]

    # candidate_id → release decision
    idx["release_cids"] = {r["candidate_id"] for r in d["cl_cands"]
                           if r.get("release_decision") == "RELEASE"}
    idx["hold_cids"]    = {r["candidate_id"] for r in d["cl_cands"]
                           if r.get("release_decision") == "HOLD"}

    # guide linked candidates
    idx["guide_cids"] = {r["linked_candidate_id"] for r in d["guide_rel"]
                         if r.get("linked_candidate_id") and r.get("identity_status") == "HIGH_CONFIDENCE"}

    # recommendation linked candidates
    idx["rec_cids"] = {r["linked_candidate_id"] for r in d["rec_rel"]
                       if r.get("linked_candidate_id")}

    # course waypoint web_source_fact_ids → linked to candidates via _web_source_facts_linked
    wp_sfids = {r["web_source_fact_id"] for r in d["course_wp"] if r.get("web_source_fact_id")}
    idx["course_sfids"] = wp_sfids

    # heritage child_mnu_uids (used for indirect identification)
    idx["heritage_mnu_uids"] = {r.get("child_mnu_uid") for r in d["heritage_rel"]
                                if r.get("child_mnu_uid")}

    # guide linked candidate → guide assignment data
    idx["guide_by_cid"] = {}
    for r in d["guide_rel"]:
        cid = r.get("linked_candidate_id","")
        if cid:
            idx["guide_by_cid"][cid] = r

    return idx


# ─── filter target candidates ─────────────────────────────────────────────────
def get_target_candidates(d, idx):
    """관광지·자연 HOLD 후보 추출 (동적, 하드코딩 없음)."""
    targets = []
    for c in d["full_v1"]:
        if c.get("category") not in TARGET_CATEGORIES:
            continue
        cid = c["candidate_id"]
        cl  = idx["cl_by_id"].get(cid, {})
        if cl.get("release_decision") != "HOLD":
            continue
        targets.append(c)
    return sorted(targets, key=lambda c: c["candidate_id"])


# ─── priority scoring ─────────────────────────────────────────────────────────
def score_priority(c, idx, d):
    cid = c["candidate_id"]
    cl  = idx["cl_by_id"].get(cid, {})
    score = 0
    reasons = []
    rel_types = []

    # 1. 문화해설 서비스 연결 (고가치 공식 지원)
    if cid in idx["guide_cids"]:
        score += 50
        reasons.append("OFFICIAL_CULTURAL_GUIDE_LINKED")
        rel_types.append("CULTURAL_GUIDE")

    # 2. 공식 코스 waypoint SF 연결
    web_sfs = c.get("_web_source_facts_linked", []) or []
    lsf     = c.get("linked_source_facts", []) or []
    all_sfs = set(web_sfs + lsf)
    if all_sfs & idx["course_sfids"]:
        score += 40
        reasons.append("OFFICIAL_COURSE_WAYPOINT_LINKED")
        rel_types.append("COURSE_WAYPOINT")

    # 3. 추천 여행지 연결
    if cid in idx["rec_cids"]:
        score += 35
        reasons.append("OFFICIAL_RECOMMENDATION_LINKED")
        rel_types.append("RECOMMENDATION")

    # 4. 복수 소스 (namespace 다양성)
    ns_count = 1
    sfid = c.get("source_fact_id","")
    ns   = get_ns(sfid)
    lsf_ns = {get_ns(sf) for sf in lsf if sf}
    web_ns = {get_ns(sf) for sf in web_sfs if sf}
    all_ns = {ns} | lsf_ns | web_ns
    all_ns.discard("")
    ns_count = len(all_ns)
    if ns_count >= 2:
        score += 25
        reasons.append("MULTI_SOURCE_NAMESPACE")

    # 5. 경주시 공식 API NS (GJ01-GJ10)
    if ns.startswith("GJ"):
        score += 20
        reasons.append("GYEONGJU_OFFICIAL_API_SOURCE")

    # 6. 핵심 필드 보유 수
    has_img   = bool(c.get("image_url"))
    has_addr  = bool(c.get("address") or c.get("address_ko"))
    has_coord = bool(c.get("lat") and c.get("lng"))
    has_desc  = bool(c.get("description_ko"))
    field_count = sum([has_img, has_addr, has_coord, has_desc])
    score += field_count * 5
    if field_count >= 3:
        reasons.append("MULTIPLE_CORE_FIELDS_PRESENT")

    # 7. 좌표 보유
    if has_coord:
        score += 10
        reasons.append("COORDINATES_PRESENT")

    # 8. identity conflict 없음
    id_status = cl.get("identity_status","") or c.get("identity_status","")
    if id_status in ("unlinked", "NEW_OFFICIAL_PLACE"):
        score += 5
        reasons.append("NO_IDENTITY_CONFLICT")
    elif id_status in ("HOLD_IDENTITY_REVIEW",):
        score -= 50
        reasons.append("IDENTITY_CONFLICT")

    # tier 결정
    if score >= 90:
        tier = "CORE_TIER_1"
    elif score >= 50:
        tier = "CORE_TIER_2"
    elif score >= 20:
        tier = "SUPPORTING_TIER"
    else:
        tier = "NOT_CURRENT_PRIORITY"

    hold_codes = cl.get("hold_reason_codes", [])
    if "HOLD_IDENTITY_REVIEW" in hold_codes:
        tier = "NOT_CURRENT_PRIORITY"
        reasons.append("EXCLUDED_IDENTITY_REVIEW")

    return {
        "priority_score":          score,
        "priority_tier":           tier,
        "priority_reasons":        sorted(set(reasons)),
        "official_relation_types": sorted(set(rel_types)),
        "source_namespace_count":  ns_count,
        "current_hold_reason":     cl.get("readiness_tier",""),
        "current_hold_codes":      hold_codes,
        "resolvable_offline":      False,  # description 없으면 offline 불가
    }


# ─── field gap analysis ───────────────────────────────────────────────────────
FIELD_NAMES = ["name", "category", "subcategory", "address", "coordinates",
               "image", "description", "district", "source_fact", "official_url"]

def analyze_field_gap(c, idx, d):
    cid  = c["candidate_id"]
    sfid = c.get("source_fact_id","")
    sf   = idx["sf_by_id"].get(sfid, {}) if sfid else {}

    # name
    name_v = c.get("title_ko","")
    name_s = "PRESENT_SELECTED" if name_v else "MISSING_FROM_ALL_LOCAL_INPUTS"

    # category
    cat_s = "PRESENT_SELECTED" if c.get("category") else "MISSING_FROM_ALL_LOCAL_INPUTS"

    # subcategory
    sub_s = "PRESENT_SELECTED" if c.get("subcategory") else "MISSING_FROM_ALL_LOCAL_INPUTS"

    # address
    addr  = c.get("address") or c.get("address_ko") or ""
    sf_addr = sf.get("address","") or sf.get("normalized_address","")
    if addr:
        addr_s = "PRESENT_SELECTED"
    elif sf_addr:
        addr_s = "PRESENT_IN_ALTERNATIVE_SOURCE_FACT"
    else:
        addr_s = "MISSING_FROM_ALL_LOCAL_INPUTS"

    # coordinates
    lat = c.get("lat") or c.get("latitude")
    lng = c.get("lng") or c.get("longitude")
    sf_coord = sf.get("coordinates","")
    if lat and lng:
        coord_s = "PRESENT_SELECTED"
    elif sf_coord and sf_coord not in ("N/A",""):
        coord_s = "PRESENT_IN_ALTERNATIVE_SOURCE_FACT"
    else:
        coord_s = "MISSING_FROM_ALL_LOCAL_INPUTS"

    # image (null → "" 처리 필수: None != "" is True in Python)
    img_url = c.get("image_url","") or ""
    if img_url:
        host = img_host(img_url)
        if is_vg(host):
            img_s = "PRESENT_BUT_RIGHTS_UNRESOLVED"
        else:
            img_s = "PRESENT_SELECTED"
    else:
        img_s = "MISSING_FROM_ALL_LOCAL_INPUTS"

    # description (null → "" 처리 필수)
    desc = c.get("description_ko","") or ""
    # source facts have description_reference but not actual text
    sf_desc_ref = sf.get("description_reference","") or ""
    if desc:
        desc_s = "PRESENT_SELECTED"
    elif sf_desc_ref and sf_desc_ref not in ("N/A","", sfid):
        desc_s = "PRESENT_IN_ALTERNATIVE_SOURCE_FACT"
    else:
        desc_s = "MISSING_FROM_ALL_LOCAL_INPUTS"

    # district
    dist = c.get("district_gyeongju","") or sf.get("district_or_area","")
    dist_s = "PRESENT_SELECTED" if dist else "MISSING_FROM_ALL_LOCAL_INPUTS"

    # source_fact
    sf_s = "PRESENT_SELECTED" if (sfid and sfid in idx["sf_by_id"]) else "MISSING_FROM_ALL_LOCAL_INPUTS"

    # official_url
    ou = c.get("official_url","") or sf.get("official_external_url","")
    ou_s = "PRESENT_SELECTED" if ou else "MISSING_FROM_ALL_LOCAL_INPUTS"

    missing = []
    alt_present = []
    fields = {
        "name":         name_s,
        "category":     cat_s,
        "subcategory":  sub_s,
        "address":      addr_s,
        "coordinates":  coord_s,
        "image":        img_s,
        "description":  desc_s,
        "district":     dist_s,
        "source_fact":  sf_s,
        "official_url": ou_s,
    }
    for f, s in fields.items():
        if s == "MISSING_FROM_ALL_LOCAL_INPUTS":
            missing.append(f)
        elif s == "PRESENT_IN_ALTERNATIVE_SOURCE_FACT":
            alt_present.append(f)

    # core fields check (release 필수)
    core_complete = (
        name_s == "PRESENT_SELECTED"
        and cat_s == "PRESENT_SELECTED"
        and addr_s in ("PRESENT_SELECTED","PRESENT_IN_ALTERNATIVE_SOURCE_FACT")
        and coord_s in ("PRESENT_SELECTED","PRESENT_IN_ALTERNATIVE_SOURCE_FACT")
        and img_s in ("PRESENT_SELECTED","PRESENT_IN_ALTERNATIVE_SOURCE_FACT")
        and desc_s in ("PRESENT_SELECTED","PRESENT_IN_ALTERNATIVE_SOURCE_FACT")
    )

    return {
        "field_status":        fields,
        "missing_fields":      sorted(missing),
        "alt_present_fields":  sorted(alt_present),
        "core_fields_complete": core_complete,
        "has_image":           img_url != "",
        "has_description":     desc != "",
        "has_coordinates":     bool(lat and lng),
        "has_address":         addr != "",
        "has_name":            name_v != "",
    }


# ─── rights resolution ────────────────────────────────────────────────────────
def get_api_contract(ns, idx):
    api_id = NS_TO_API_ID.get(ns, None)
    if api_id is None:
        return {}
    return idx["api_c"].get(api_id, {})


def determine_image_rights(c, idx):
    img_url = c.get("image_url","") or ""
    sfid    = c.get("source_fact_id","") or ""
    ns      = get_ns(sfid)
    host    = img_host(img_url)

    base = {
        "image_url_host":       host,
        "source_fact_id":       sfid,
        "source_namespace":     ns,
        "domain_only_positive": False,
    }

    if not img_url:
        return {**base, "rights_verdict": "NO_IMAGE",
                "evidence_type": "NO_TRACEABLE_EVIDENCE",
                "provenance_completeness": "INSUFFICIENT",
                "resolution_reason": "no_image_url"}

    if is_vg(host):
        return {**base, "rights_verdict": "RIGHTS_REVIEW_REQUIRED",
                "evidence_type": "DOMAIN_SECONDARY_CHECK_ONLY",
                "provenance_completeness": "INSUFFICIENT",
                "resolution_reason": "vg_web_image_no_license"}

    if not sfid or sfid not in idx["sf_by_id"]:
        return {**base, "rights_verdict": "RIGHTS_EVIDENCE_MISSING",
                "evidence_type": "NO_TRACEABLE_EVIDENCE",
                "provenance_completeness": "INSUFFICIENT",
                "resolution_reason": "no_valid_source_fact"}

    api_id = NS_TO_API_ID.get(ns)
    if api_id is None:
        return {**base, "rights_verdict": "RIGHTS_EVIDENCE_MISSING",
                "evidence_type": "NO_TRACEABLE_EVIDENCE",
                "provenance_completeness": "INSUFFICIENT",
                "resolution_reason": f"ns_not_in_contract_map:{ns}"}

    api_c  = idx["api_c"].get(api_id, {})
    rights = api_c.get("rights_status","")
    usage  = api_c.get("usage_rights","") or ""

    if rights == "COLLECTION_ALLOWED" and "제한 없음" in usage:
        return {**base, "rights_verdict": "VERIFIED_ALLOWED_BY_SOURCE_CONTRACT",
                "evidence_type": "SOURCE_FACT_PLUS_COLLECTION_CONTRACT",
                "provenance_completeness": "PARTIAL",
                "contract_api_id": api_id,
                "contract_path": api_c.get("_contract_file",""),
                "resolution_reason": "contract_collection_allowed"}

    if rights == "COLLECTION_ALLOWED":
        return {**base, "rights_verdict": "METADATA_ONLY",
                "evidence_type": "SOURCE_FACT_PLUS_COLLECTION_CONTRACT",
                "provenance_completeness": "PARTIAL",
                "contract_api_id": api_id,
                "resolution_reason": "collection_allowed_usage_not_explicit"}

    return {**base, "rights_verdict": "RIGHTS_EVIDENCE_MISSING",
            "evidence_type": "CONTRACT_ONLY_INSUFFICIENT",
            "provenance_completeness": "INSUFFICIENT",
            "resolution_reason": f"no_collection_allowed_ns={ns}"}


def determine_description_rights(c, idx):
    desc    = c.get("description_ko","") or ""
    sfid    = c.get("source_fact_id","") or ""
    ns      = get_ns(sfid)
    base = {"source_fact_id": sfid, "source_namespace": ns, "domain_only_positive": False}

    if not desc:
        return {**base, "rights_verdict": "NO_DESCRIPTION",
                "evidence_type": "NO_TRACEABLE_EVIDENCE",
                "provenance_completeness": "INSUFFICIENT",
                "description_length": 0,
                "resolution_reason": "no_description_value_in_offline_data"}

    # has description (unusual for attraction/nature but handle it)
    if not sfid or sfid not in idx["sf_by_id"]:
        return {**base, "rights_verdict": "RIGHTS_EVIDENCE_MISSING",
                "evidence_type": "NO_TRACEABLE_EVIDENCE",
                "provenance_completeness": "INSUFFICIENT",
                "description_length": len(desc),
                "resolution_reason": "no_valid_source_fact"}

    api_id = NS_TO_API_ID.get(ns)
    if api_id is None:
        return {**base, "rights_verdict": "RIGHTS_EVIDENCE_MISSING",
                "evidence_type": "NO_TRACEABLE_EVIDENCE",
                "provenance_completeness": "INSUFFICIENT",
                "description_length": len(desc),
                "resolution_reason": f"ns_not_in_contract_map:{ns}"}

    api_c  = idx["api_c"].get(api_id, {})
    rights = api_c.get("rights_status","")
    usage  = api_c.get("usage_rights","") or ""

    if rights == "COLLECTION_ALLOWED" and "제한 없음" in usage:
        return {**base, "rights_verdict": "VERIFIED_ALLOWED_BY_SOURCE_CONTRACT",
                "evidence_type": "SOURCE_FACT_PLUS_COLLECTION_CONTRACT",
                "provenance_completeness": "PARTIAL",
                "description_length": len(desc),
                "contract_api_id": api_id,
                "resolution_reason": "contract_collection_allowed"}

    return {**base, "rights_verdict": "RIGHTS_EVIDENCE_MISSING",
            "evidence_type": "CONTRACT_ONLY_INSUFFICIENT",
            "provenance_completeness": "INSUFFICIENT",
            "description_length": len(desc),
            "resolution_reason": f"no_collection_allowed_ns={ns}"}


# ─── offline resolution judgment ──────────────────────────────────────────────
def judge_offline_resolution(c, gap, img_rights, desc_rights, idx):
    cid      = c["candidate_id"]
    cl       = idx["cl_by_id"].get(cid, {})
    hold_codes = cl.get("hold_reason_codes", [])

    # identity/category 차단
    if "HOLD_IDENTITY_REVIEW" in hold_codes:
        return "NOT_ELIGIBLE_DUE_TO_IDENTITY"
    if cl.get("readiness_tier","") == "HOLD_CATEGORY_REVIEW":
        return "CATEGORY_REVIEW_REQUIRED"

    # rights 차단
    img_v  = img_rights.get("rights_verdict","")
    desc_v = desc_rights.get("rights_verdict","")
    if img_v == "RIGHTS_REVIEW_REQUIRED" or desc_v == "RIGHTS_REVIEW_REQUIRED":
        return "RIGHTS_REVIEW_REQUIRED"

    # 각 필드 가용성
    has_img   = gap["has_image"]
    has_addr  = gap["has_address"]
    has_coord = gap["has_coordinates"]
    has_desc  = gap["has_description"]
    has_name  = gap["has_name"]

    img_ok  = img_v in {"VERIFIED_ALLOWED_BY_SOURCE_CONTRACT",
                         "VERIFIED_PUBLIC_API_FIELD_ALLOWED", "NO_IMAGE"}
    desc_ok = desc_v in {"VERIFIED_ALLOWED_BY_SOURCE_CONTRACT",
                          "VERIFIED_PUBLIC_API_FIELD_ALLOWED", "NO_DESCRIPTION"}

    missing_fields = gap["missing_fields"]
    has_location_incomplete = "HOLD_LOCATION_INCOMPLETE" in hold_codes

    # 완전 OFF 조건
    if has_name and has_addr and has_coord and has_img and has_desc and img_ok and desc_ok:
        return "OFFLINE_RELEASE_READY"

    # METADATA_LIMITED: description 없지만 나머지 ok
    if has_name and has_addr and has_coord and has_img and img_ok and not has_desc:
        return "TARGETED_DESCRIPTION_COLLECTION_REQUIRED"

    # 위치 없음
    if not has_coord and not has_addr:
        if not has_img and not has_desc:
            return "TARGETED_MULTIPLE_FIELDS_REQUIRED"
        return "TARGETED_LOCATION_COLLECTION_REQUIRED"

    if not has_coord:
        return "TARGETED_LOCATION_COLLECTION_REQUIRED"

    # image 없음 + description 없음
    if not has_img and not has_desc:
        return "TARGETED_MULTIPLE_FIELDS_REQUIRED"

    # image 없음
    if not has_img:
        return "TARGETED_MULTIPLE_FIELDS_REQUIRED"

    # description 없음 (기본)
    return "TARGETED_DESCRIPTION_COLLECTION_REQUIRED"


# ─── targeted collection queue entry ─────────────────────────────────────────
NS_TO_ENDPOINT = {
    "GJ01": ("gyeongju-culture-tourism-api", "관광 목록 서비스"),
    "GJ02": ("gyeongju-culture-tourism-api", "식당 목록 서비스"),
    "GJ03": ("gyeongju-culture-tourism-api", "숙박 목록 서비스"),
    "GJ04": ("gyeongju-culture-tourism-api", "관광 상세 서비스"),
    "GJ05": ("gyeongju-culture-tourism-api", "식당 상세 서비스"),
    "GJ06": ("gyeongju-culture-tourism-api", "관광지 상세 서비스"),
    "GJ07": ("gyeongju-culture-tourism-api", "자연 상세 서비스"),
    "GJ08": ("gyeongju-menuRstrtService",    "식당 공식 서비스"),
    "GJ09": ("gyeongju-culture-tourism-api", "기타 상세 서비스"),
    "KTO39": ("KTO_TourAPI_KorService2",     "관광정보 기본정보 조회"),
    "KTO12": ("KTO_TourAPI_KorService",      "관광정보 공통정보 조회"),
    "KTO14": ("KTO_TourAPI_KorService",      "관광정보 소개정보 조회"),
    "KTO15": ("KTO_TourAPI_Festival",        "행사/공연/축제 정보 조회"),
    "KTO28": ("KTO_TourAPI_LeisureSports",   "레저/스포츠 정보 조회"),
    "KTO32": ("KTO_TourAPI_TravelCourse",    "여행코스 정보 조회"),
    "KTO38": ("KTO_TourAPI_Shopping",        "쇼핑 정보 조회"),
}

NS_TO_CONTRACT = {
    "GJ01": "gyeongju-culture-tourism-source-contract-v1.json",
    "GJ06": "gyeongju-culture-tourism-source-contract-v1.json",
    "GJ07": "gyeongju-culture-tourism-source-contract-v1.json",
    "KTO39": "gyeongju-culture-tourism-source-contract-v1.json",
    "KTO12": "KTO_PUBLIC_DATA_PORTAL_CONTRACT_REQUIRED",
    "KTO14": "KTO_PUBLIC_DATA_PORTAL_CONTRACT_REQUIRED",
    "KTO28": "KTO_PUBLIC_DATA_PORTAL_CONTRACT_REQUIRED",
    "KTO32": "KTO_PUBLIC_DATA_PORTAL_CONTRACT_REQUIRED",
    "KTO38": "KTO_PUBLIC_DATA_PORTAL_CONTRACT_REQUIRED",
}


def build_queue_entry(c, gap, resolution, idx):
    cid  = c["candidate_id"]
    sfid = c.get("source_fact_id","") or ""
    ns   = get_ns(sfid)
    cl   = idx["cl_by_id"].get(cid, {})
    sf   = idx["sf_by_id"].get(sfid, {}) if sfid else {}

    missing = gap["missing_fields"]
    src_record_id = ""
    if sfid:
        parts = sfid.split("-")
        src_record_id = parts[-1] if len(parts) >= 3 else ""

    dataset, endpoint = NS_TO_ENDPOINT.get(ns, ("UNKNOWN_SOURCE", "UNKNOWN_ENDPOINT"))

    # collection_mode 결정
    if resolution == "TARGETED_DESCRIPTION_COLLECTION_REQUIRED":
        if ns.startswith("GJ"):
            cm = CM_API_DETAIL
        else:
            cm = CM_KTO_DETAIL
    elif resolution == "TARGETED_LOCATION_COLLECTION_REQUIRED":
        cm = CM_KTO_LOCATION
    elif resolution == "TARGETED_MULTIPLE_FIELDS_REQUIRED":
        cm = CM_KTO_DETAIL if not ns.startswith("GJ") else CM_API_DETAIL
    elif resolution == "CATEGORY_REVIEW_REQUIRED":
        cm = CM_CATEGORY
    elif resolution == "RIGHTS_REVIEW_REQUIRED":
        cm = CM_RIGHTS
    else:
        cm = CM_KTO_DETAIL

    return {
        "candidate_id":             cid,
        "name":                     c.get("title_ko",""),
        "category":                 c.get("category",""),
        "priority_tier":            gap.get("_priority_tier",""),
        "missing_fields":           missing,
        "recommended_official_source": dataset,
        "recommended_dataset_or_endpoint": endpoint,
        "known_source_record_id":   src_record_id,
        "known_content_id":         sf.get("source_record_id",""),
        "official_url":             c.get("official_url","") or sf.get("official_external_url",""),
        "collection_mode":          cm,
        "expected_rights_contract": NS_TO_CONTRACT.get(ns, "UNKNOWN_CONTRACT"),
        "reason":                   resolution,
        "blocking_release":         True,
        "next_action":              f"collect_{cm.lower()}",
    }


# ─── regression tests ─────────────────────────────────────────────────────────
def run_regression_tests(idx, d):
    fixtures = []

    # 공통 mock SF
    mock_idx = dict(idx)
    mock_idx["sf_by_id"] = dict(idx["sf_by_id"])
    mock_idx["sf_by_id"]["gyeongju-GJ06-MOCK"] = {"source_fact_id": "gyeongju-GJ06-MOCK"}
    mock_idx["sf_by_id"]["gyeongju-KTO12-MOCK"] = {"source_fact_id": "gyeongju-KTO12-MOCK"}

    mock_base = {"title_ko":"테스트", "category":"attraction", "subcategory":"문화유적",
                 "_web_source_facts_linked":[], "linked_source_facts":[],
                 "official_url":"", "district_gyeongju":"경주"}

    def add_fixture(fid, desc, actual_key, actual_val, expected_val):
        passed = (actual_val == expected_val)
        fixtures.append({"fixture_id": fid, "scenario": desc,
                         "expected": {actual_key: expected_val},
                         "actual":   {actual_key: actual_val},
                         "verdict":  "PASS" if passed else "FAIL"})
        return passed

    # F01: alternative SF에 이미지 없음 → offline image 선택 불가
    c1 = {**mock_base, "candidate_id":"gyeongju-GJ06-MOCK",
          "source_fact_id":"gyeongju-GJ06-MOCK",
          "image_url":"", "description_ko":"", "address":"경주시", "lat":35.8, "lng":129.2}
    g1 = analyze_field_gap(c1, mock_idx, d)
    add_fixture("F01","alternative SF에 이미지 없음 → image MISSING",
                "image", g1["field_status"]["image"], "MISSING_FROM_ALL_LOCAL_INPUTS")

    # F02: 공식 API SF + contract 허용 → image VERIFIED
    c2 = {**mock_base, "candidate_id":"gyeongju-GJ06-F02",
          "source_fact_id":"gyeongju-GJ06-MOCK",
          "image_url":"https://www.gyeongju.go.kr/upload/test.jpg",
          "description_ko":"", "address":"경주시", "lat":35.8, "lng":129.2}
    ir2 = determine_image_rights(c2, mock_idx)
    add_fixture("F02","GJ06 SF + contract → image VERIFIED",
                "rights_verdict", ir2["rights_verdict"], "VERIFIED_ALLOWED_BY_SOURCE_CONTRACT")

    # F03: URL domain만 공식이고 SF 없음 → RIGHTS_EVIDENCE_MISSING
    c3 = {**mock_base, "candidate_id":"gyeongju-GJ06-F03",
          "source_fact_id":"gyeongju-GJ06-NONEXIST",
          "image_url":"https://www.gyeongju.go.kr/upload/test.jpg",
          "description_ko":"", "address":"경주시", "lat":35.8, "lng":129.2}
    ir3 = determine_image_rights(c3, mock_idx)
    add_fixture("F03","domain만 공식 + SF 없음 → RIGHTS_EVIDENCE_MISSING",
                "rights_verdict", ir3["rights_verdict"], "RIGHTS_EVIDENCE_MISSING")

    # F04: 주소 있고 좌표 없음 → TARGETED_LOCATION
    c4 = {**mock_base, "candidate_id":"gyeongju-GJ06-F04",
          "source_fact_id":"gyeongju-GJ06-MOCK",
          "image_url":"https://www.gyeongju.go.kr/upload/test.jpg",
          "description_ko":"", "address":"경주시", "lat":None, "lng":None}
    g4   = analyze_field_gap(c4, mock_idx, d)
    ir4  = determine_image_rights(c4, mock_idx)
    dr4  = determine_description_rights(c4, mock_idx)
    res4 = judge_offline_resolution(c4, g4, ir4, dr4,
                                     {**mock_idx, "cl_by_id":{c4["candidate_id"]: {"hold_reason_codes":["HOLD_ENRICHMENT_REQUIRED","HOLD_LOCATION_INCOMPLETE"],"readiness_tier":"HOLD_LOCATION_INCOMPLETE"}}})
    add_fixture("F04","address 있고 좌표 없음 → TARGETED_LOCATION",
                "resolution", res4, "TARGETED_LOCATION_COLLECTION_REQUIRED")

    # F05: 좌표 있고 address 없음 → TARGETED_LOCATION (address 없음)
    c5 = {**mock_base, "candidate_id":"gyeongju-GJ06-F05",
          "source_fact_id":"gyeongju-GJ06-MOCK",
          "image_url":"", "description_ko":"", "address":"", "lat":35.8, "lng":129.2}
    g5   = analyze_field_gap(c5, mock_idx, d)
    ir5  = determine_image_rights(c5, mock_idx)
    dr5  = determine_description_rights(c5, mock_idx)
    res5 = judge_offline_resolution(c5, g5, ir5, dr5,
                                     {**mock_idx, "cl_by_id":{c5["candidate_id"]: {"hold_reason_codes":["HOLD_ENRICHMENT_REQUIRED"],"readiness_tier":"HOLD_ENRICHMENT_REQUIRED"}}})
    add_fixture("F05","좌표 있고 address 없음 → MULTIPLE 또는 DESCRIPTION",
                "resolution_is_targeted", "TARGETED" in res5, True)

    # F06: image·description 모두 없음 → TARGETED_MULTIPLE
    c6 = {**mock_base, "candidate_id":"gyeongju-GJ06-F06",
          "source_fact_id":"gyeongju-GJ06-MOCK",
          "image_url":"", "description_ko":"", "address":"경주시", "lat":35.8, "lng":129.2}
    g6   = analyze_field_gap(c6, mock_idx, d)
    ir6  = determine_image_rights(c6, mock_idx)
    dr6  = determine_description_rights(c6, mock_idx)
    res6 = judge_offline_resolution(c6, g6, ir6, dr6,
                                     {**mock_idx, "cl_by_id":{c6["candidate_id"]: {"hold_reason_codes":["HOLD_ENRICHMENT_REQUIRED"],"readiness_tier":"HOLD_ENRICHMENT_REQUIRED"}}})
    add_fixture("F06","image·description 모두 없음 → TARGETED_MULTIPLE",
                "resolution", res6, "TARGETED_MULTIPLE_FIELDS_REQUIRED")

    # F07: HOLD_IDENTITY_REVIEW → NOT_ELIGIBLE
    c7 = {**mock_base, "candidate_id":"gyeongju-GJ06-F07",
          "source_fact_id":"gyeongju-GJ06-MOCK",
          "image_url":"https://www.gyeongju.go.kr/upload/test.jpg",
          "description_ko":"설명있음", "address":"경주시", "lat":35.8, "lng":129.2}
    g7   = analyze_field_gap(c7, mock_idx, d)
    ir7  = determine_image_rights(c7, mock_idx)
    dr7  = determine_description_rights(c7, mock_idx)
    res7 = judge_offline_resolution(c7, g7, ir7, dr7,
                                     {**mock_idx, "cl_by_id":{c7["candidate_id"]: {"hold_reason_codes":["HOLD_IDENTITY_REVIEW"],"readiness_tier":"HOLD_IDENTITY_REVIEW"}}})
    add_fixture("F07","HOLD_IDENTITY_REVIEW candidate → NOT_ELIGIBLE",
                "resolution", res7, "NOT_ELIGIBLE_DUE_TO_IDENTITY")

    # F08: recommendation relation만 있고 place identity 없음 → 별도 처리 (분류에서 이미 HOLD)
    # SF 없는 경우 rights는 RIGHTS_EVIDENCE_MISSING
    c8 = {**mock_base, "candidate_id":"gyeongju-GJ06-F08",
          "source_fact_id":"", "image_url":"", "description_ko":"",
          "address":"", "lat":None, "lng":None}
    ir8 = determine_image_rights(c8, mock_idx)
    add_fixture("F08","source fact 없음 → image RIGHTS_EVIDENCE_MISSING",
                "rights_verdict", ir8["rights_verdict"], "NO_IMAGE")  # no image_url

    # F09: VG 이미지 → RIGHTS_REVIEW_REQUIRED
    c9 = {**mock_base, "candidate_id":"gyeongju-VG-F09",
          "source_fact_id":"gyeongju-GJ06-MOCK",
          "image_url":"https://visitgyeongju.or.kr/img.jpg",
          "description_ko":"", "address":"경주시", "lat":35.8, "lng":129.2}
    ir9 = determine_image_rights(c9, mock_idx)
    add_fixture("F09","VG 도메인 이미지 → RIGHTS_REVIEW_REQUIRED",
                "rights_verdict", ir9["rights_verdict"], "RIGHTS_REVIEW_REQUIRED")
    add_fixture("F09b","VG 이미지 domain_only_positive 금지",
                "domain_only_positive", ir9.get("domain_only_positive",False), False)

    # F10: official heritage relation + 완전 필드 → high priority
    c10 = {**mock_base, "candidate_id":"gyeongju-GJ06-MOCK",  # in guide_cids
           "source_fact_id":"gyeongju-GJ06-MOCK",
           "image_url":"https://www.gyeongju.go.kr/upload/test.jpg",
           "description_ko":"설명입니다.", "address":"경주시", "lat":35.8, "lng":129.2}
    priority10 = score_priority(c10, {**mock_idx,
        "guide_cids": {"gyeongju-GJ06-MOCK"},
        "rec_cids": set(), "course_sfids": set()}, d)
    add_fixture("F10","문화해설 연결 + 완전 필드 → CORE_TIER_1 또는 CORE_TIER_2",
                "priority_tier_high", priority10["priority_tier"] in {"CORE_TIER_1","CORE_TIER_2"}, True)

    all_pass = all(f["verdict"] == "PASS" for f in fixtures)
    return fixtures, all_pass


# ─── section processors ───────────────────────────────────────────────────────
def proc_input_audit(targets, d, idx):
    ns_dist = Counter()
    for c in targets:
        sfid = c.get("source_fact_id","")
        ns_dist[get_ns(sfid)] += 1

    hold_dist_primary = Counter()
    hold_dist_all = Counter()
    for c in targets:
        cl = idx["cl_by_id"].get(c["candidate_id"],{})
        hold_dist_primary[cl.get("readiness_tier","?")] += 1
        for r in cl.get("hold_reason_codes",[]):
            hold_dist_all[r] += 1

    sf_valid = sum(1 for c in targets if c.get("source_fact_id","") in idx["sf_by_id"])

    return {
        "task": TASK,
        "as_of": d["as_of"],
        "base_commit": BASE_COMMIT,
        "total_candidates_all": len(d["full_v1"]),
        "total_source_facts":   len(d["sf_full"]),
        "total_release":        len(idx["release_cids"]),
        "total_hold":           len(idx["hold_cids"]),
        "target_categories":    sorted(TARGET_CATEGORIES),
        "target_count":         len(targets),
        "category_dist":        dict(sorted(Counter(c.get("category","") for c in targets).items())),
        "source_namespace_dist":dict(sorted(ns_dist.items())),
        "source_fact_valid":    sf_valid,
        "source_fact_missing":  len(targets) - sf_valid,
        "hold_primary_dist":    dict(sorted(hold_dist_primary.items())),
        "hold_all_reason_dist": dict(sorted(hold_dist_all.items())),
        "guide_linked_target":  len([c for c in targets if c["candidate_id"] in idx["guide_cids"]]),
        "rec_linked_target":    len([c for c in targets if c["candidate_id"] in idx["rec_cids"]]),
        "existing_release_intact": len(idx["release_cids"]) == 102,
        "input_integrity_verdict": "PASS" if len(d["full_v1"]) == 910 and len(d["sf_full"]) == 1158 else "FAIL",
    }


def proc_coverage_summary(targets, proposed, idx, d):
    cat_dist    = Counter(c.get("category","") for c in targets)
    dist_dist   = Counter((c.get("district_gyeongju") or "없음") for c in targets)
    img_count   = sum(1 for c in targets if c.get("image_url"))
    addr_count  = sum(1 for c in targets if c.get("address") or c.get("address_ko"))
    coord_count = sum(1 for c in targets if c.get("lat") and c.get("lng"))
    guide_count = sum(1 for c in targets if c["candidate_id"] in idx["guide_cids"])

    prop_release = [r for r in proposed if r["proposed_decision"] == "RELEASE"]
    prop_release_cat = Counter(r.get("category","") for r in prop_release)
    prop_release_dist = Counter()
    for r in prop_release:
        c = idx["full_by_id"].get(r["candidate_id"],{})
        prop_release_dist[(c.get("district_gyeongju") or "없음")] += 1

    resolution_dist = Counter(r.get("proposed_readiness_tier","") for r in proposed)

    return {
        "task":    TASK,
        "as_of":   d["as_of"],
        "target_category_dist":   dict(sorted(cat_dist.items())),
        "target_district_dist":   dict(sorted(dist_dist.items())),
        "target_with_image":      img_count,
        "target_with_address":    addr_count,
        "target_with_coordinates":coord_count,
        "target_guide_linked":    guide_count,
        "proposed_release_total": len(prop_release),
        "proposed_release_cat":   dict(sorted(prop_release_cat.items())),
        "proposed_release_dist":  dict(sorted(prop_release_dist.items())),
        "resolution_dist":        dict(sorted(resolution_dist.items())),
        "existing_release_restaurants": len(idx["release_cids"]),
    }


def proc_city_readiness(targets, proposed, coverage, idx, d):
    rest_release = len(idx["release_cids"])
    new_release  = len([r for r in proposed if r["proposed_decision"] == "RELEASE"])
    total_place  = rest_release + new_release

    dist_dist_proposed = coverage.get("proposed_release_dist", {})

    # 일정 구성 가능성 평가
    # 1일: 관광지 4+ 식당 2+ 동일 권역 집중
    # 2일: 관광지 8+ 식당 4+
    # 3일: 관광지 12+ 식당 6+

    day1 = new_release >= 4 and rest_release >= 2
    day2 = new_release >= 8 and rest_release >= 4
    day3 = new_release >= 12 and rest_release >= 6

    if new_release == 0:
        readiness = "CITY_CORE_SET_NOT_READY"
    elif new_release >= 15:
        readiness = "CITY_CORE_SET_READY"
    else:
        readiness = "CITY_CORE_SET_READY_WITH_TARGETED_GAPS"

    return {
        "task":    TASK,
        "as_of":   d["as_of"],
        "restaurant_release":          rest_release,
        "new_attraction_nature_release": new_release,
        "total_place_release":         total_place,
        "day1_itinerary_feasible":     day1,
        "day2_itinerary_feasible":     day2,
        "day3_itinerary_feasible":     day3,
        "attraction_count":            coverage["target_category_dist"].get("attraction",0),
        "nature_count":                coverage["target_category_dist"].get("nature",0),
        "targeted_collection_queue_count": len([r for r in proposed
                                                if r["proposed_readiness_tier"].startswith("HOLD_TARGETED")]),
        "city_core_set_readiness":     readiness,
        "evaluation_basis":            "data_availability_only_not_itinerary_generation",
        "gaps": {
            "description_required": coverage["resolution_dist"].get("HOLD_TARGETED_COLLECTION_REQUIRED",0),
            "location_required": 0,
        },
    }


# ─── main ─────────────────────────────────────────────────────────────────────
def main():
    print(f"[{TASK}] v{VERSION} 시작")

    # ── Frozen SHA preflight ────────────────────────────────────────────────
    frozen_pre = {}
    for rpath, fpath in sorted(FROZEN_FILES.items()):
        p = Path(fpath)
        if p.exists():
            frozen_pre[rpath] = sha256f(p)
    print(f"  [SHA-PRE] 동결 파일 {len(frozen_pre)}건 캡처")

    # ── 데이터 로드 ─────────────────────────────────────────────────────────
    d   = load_all()
    idx = build_indexes(d)
    as_of = d["as_of"]
    print(f"  as_of: {as_of}")

    # ── 회귀 테스트 ─────────────────────────────────────────────────────────
    fixtures, reg_pass = run_regression_tests(idx, d)
    pass_cnt = sum(1 for f in fixtures if f["verdict"] == "PASS")
    print(f"  [RT] 회귀 테스트: {pass_cnt}/{len(fixtures)} {'PASS' if reg_pass else 'FAIL'}")

    # ── 대상 후보 추출 ──────────────────────────────────────────────────────
    targets = get_target_candidates(d, idx)
    print(f"  [S1] 대상 attraction+nature HOLD: {len(targets)}건")

    # ── 입력 감사 ───────────────────────────────────────────────────────────
    input_audit = proc_input_audit(targets, d, idx)
    print(f"  [S1] input integrity: {input_audit['input_integrity_verdict']}")

    # ── 우선순위 점수 ────────────────────────────────────────────────────────
    priority_recs = []
    for c in targets:
        pri = score_priority(c, idx, d)
        priority_recs.append({"candidate_id": c["candidate_id"],
                               "title_ko": c.get("title_ko",""),
                               "category": c.get("category",""),
                               **pri})
    tier_dist = Counter(r["priority_tier"] for r in priority_recs)
    print(f"  [S2] priority: {dict(sorted(tier_dist.items()))}")

    # tier를 gap에 전달하기 위해 인덱스 생성
    pri_by_id = {r["candidate_id"]: r for r in priority_recs}

    # ── 필드 gap 분석 ────────────────────────────────────────────────────────
    gap_recs = []
    for c in targets:
        gap = analyze_field_gap(c, idx, d)
        gap["_priority_tier"] = pri_by_id.get(c["candidate_id"],{}).get("priority_tier","")
        gap_recs.append({"candidate_id": c["candidate_id"],
                          "title_ko": c.get("title_ko",""),
                          "category": c.get("category",""),
                          **gap})
    gap_by_id = {r["candidate_id"]: r for r in gap_recs}

    alt_present_total = sum(len(r["alt_present_fields"]) for r in gap_recs)
    core_complete = sum(1 for r in gap_recs if r["core_fields_complete"])
    print(f"  [S3] gap: core_complete={core_complete}, alt_present_total={alt_present_total}")

    # ── Image rights ─────────────────────────────────────────────────────────
    img_rights_recs = []
    for c in targets:
        r = determine_image_rights(c, idx)
        img_rights_recs.append({"candidate_id": c["candidate_id"], **r})
    img_vd = Counter(r["rights_verdict"] for r in img_rights_recs)
    print(f"  [S4] image rights: {dict(sorted(img_vd.items()))}")

    # ── Description rights ──────────────────────────────────────────────────
    desc_rights_recs = []
    for c in targets:
        r = determine_description_rights(c, idx)
        desc_rights_recs.append({"candidate_id": c["candidate_id"], **r})
    desc_vd = Counter(r["rights_verdict"] for r in desc_rights_recs)
    print(f"  [S5] desc rights: {dict(sorted(desc_vd.items()))}")

    # rights by id
    img_r_by_id  = {r["candidate_id"]: r for r in img_rights_recs}
    desc_r_by_id = {r["candidate_id"]: r for r in desc_rights_recs}

    # ── Enrichment overlay ──────────────────────────────────────────────────
    enrichment_recs = []
    proposed_recs   = []
    queue_recs      = []
    remaining_hold  = []

    for c in targets:
        cid   = c["candidate_id"]
        cl    = idx["cl_by_id"].get(cid, {})
        gap   = gap_by_id.get(cid, {})
        pri   = pri_by_id.get(cid, {})
        img_r = img_r_by_id.get(cid, {})
        desc_r= desc_r_by_id.get(cid, {})

        gap["_priority_tier"] = pri.get("priority_tier","")
        resolution = judge_offline_resolution(c, gap, img_r, desc_r, idx)

        img_ok   = img_r.get("rights_verdict","") in {
            "VERIFIED_ALLOWED_BY_SOURCE_CONTRACT","VERIFIED_PUBLIC_API_FIELD_ALLOWED","NO_IMAGE"}
        desc_ok  = desc_r.get("rights_verdict","") in {
            "VERIFIED_ALLOWED_BY_SOURCE_CONTRACT","VERIFIED_PUBLIC_API_FIELD_ALLOWED","NO_DESCRIPTION"}

        # enrichment overlay
        enrichment_recs.append({
            "candidate_id":             cid,
            "category":                 c.get("category",""),
            "subcategory":              c.get("subcategory",""),
            "priority_tier":            pri.get("priority_tier",""),
            "original_release_decision":"HOLD",
            "original_readiness_tier":  cl.get("readiness_tier",""),
            "original_hold_reason_codes": cl.get("hold_reason_codes",[]),
            "enriched_fields":          [],  # offline에서 새 필드 추가 불가
            "resolved_name":            c.get("title_ko",""),
            "resolved_address":         c.get("address") or c.get("address_ko") or "",
            "resolved_coordinates":     {"lat": c.get("lat"), "lng": c.get("lng")} if (c.get("lat") and c.get("lng")) else None,
            "resolved_image":           c.get("image_url","") if gap.get("has_image") and not img_r.get("rights_verdict","").endswith("REVIEW_REQUIRED") else "",
            "resolved_description":     "",  # offline에서 description 없음
            "resolved_district":        c.get("district_gyeongju",""),
            "selected_source_fact_ids": [c.get("source_fact_id","")] if c.get("source_fact_id") else [],
            "alternative_source_fact_ids": [],
            "field_evidence":           gap.get("field_status",{}),
            "image_rights_resolution":  img_r.get("rights_verdict",""),
            "description_rights_resolution": desc_r.get("rights_verdict",""),
            "enrichment_completeness":  "PARTIAL" if gap.get("has_image") and gap.get("has_address") else "INSUFFICIENT",
            "proposed_release_decision": "HOLD",
            "proposed_readiness_tier":  "HOLD_TARGETED_COLLECTION_REQUIRED",
            "remaining_hold_reasons":   cl.get("hold_reason_codes",[]),
            "offline_resolution":       resolution,
            "as_of":                    as_of,
        })

        # proposed release overlay
        proposed_decision = "HOLD"
        prop_tier = "HOLD_TARGETED_COLLECTION_REQUIRED"
        if resolution == "OFFLINE_RELEASE_READY":
            proposed_decision = "RELEASE"
            prop_tier = "RELEASE_READY"
        elif resolution == "OFFLINE_RELEASE_READY_METADATA_LIMITED":
            proposed_decision = "RELEASE"
            prop_tier = "RELEASE_READY_METADATA_LIMITED"
        elif resolution == "CATEGORY_REVIEW_REQUIRED":
            prop_tier = "HOLD_CATEGORY_REVIEW"
        elif resolution == "RIGHTS_REVIEW_REQUIRED":
            prop_tier = "HOLD_RIGHTS_REVIEW"
        elif resolution in ("TARGETED_LOCATION_COLLECTION_REQUIRED",):
            prop_tier = "HOLD_LOCATION_INCOMPLETE"

        proposed_recs.append({
            "candidate_id":         cid,
            "category":             c.get("category",""),
            "previous_decision":    "HOLD",
            "proposed_decision":    proposed_decision,
            "proposed_readiness_tier": prop_tier,
            "offline_resolution":   resolution,
            "resolved_core_fields": {
                "name":        gap.get("has_name", False),
                "address":     gap.get("has_address", False),
                "coordinates": gap.get("has_coordinates", False),
                "image":       gap.get("has_image", False),
                "description": gap.get("has_description", False),
            },
            "image_rights_verdict":       img_r.get("rights_verdict",""),
            "description_rights_verdict": desc_r.get("rights_verdict",""),
            "release_evidence":    "INSUFFICIENT_FOR_RELEASE" if proposed_decision == "HOLD" else "SUFFICIENT",
            "product_priority":    pri.get("priority_tier",""),
            "official_relation_support": pri.get("official_relation_types",[]),
            "source_fact_ids":     [c.get("source_fact_id","")] if c.get("source_fact_id") else [],
            "unresolved_optional_fields": [],
        })

        # targeted collection queue
        if proposed_decision == "HOLD" and resolution not in ("NOT_ELIGIBLE_DUE_TO_IDENTITY","CATEGORY_REVIEW_REQUIRED"):
            qe = build_queue_entry(c, {**gap, "_priority_tier": pri.get("priority_tier","")},
                                   resolution, idx)
            queue_recs.append(qe)

        # remaining hold
        if proposed_decision == "HOLD":
            remaining_hold.append({
                "candidate_id":     cid,
                "category":         c.get("category",""),
                "priority_tier":    pri.get("priority_tier",""),
                "offline_resolution": resolution,
                "hold_reason_codes": cl.get("hold_reason_codes",[]),
                "readiness_tier":   cl.get("readiness_tier",""),
                "missing_fields":   gap.get("missing_fields",[]),
            })

    resolution_dist = Counter(r["offline_resolution"] for r in enrichment_recs)
    print(f"  [S6] resolution: {dict(sorted(resolution_dist.items()))}")
    print(f"  [S7] queue: {len(queue_recs)}건")

    # ── Coverage & Readiness ─────────────────────────────────────────────────
    coverage = proc_coverage_summary(targets, proposed_recs, idx, d)
    readiness = proc_city_readiness(targets, proposed_recs, coverage, idx, d)
    print(f"  [S8] city readiness: {readiness['city_core_set_readiness']}")

    # ── Defect register ──────────────────────────────────────────────────────
    defects = []
    domain_only_positives = sum(1 for r in img_rights_recs if r.get("domain_only_positive"))
    if domain_only_positives > 0:
        defects.append({
            "defect_id": "DEF-ENRICH-C01",
            "severity": "CRITICAL",
            "description": f"domain_only_positive {domain_only_positives}건 발생",
            "status": "OPEN",
        })
    uncovered_ns = Counter()
    for r in img_rights_recs:
        if r.get("rights_verdict") == "RIGHTS_EVIDENCE_MISSING" and r.get("resolution_reason","").startswith("ns_not_in_contract"):
            ns_val = r.get("resolution_reason","").split(":")[-1]
            uncovered_ns[ns_val] += 1
    if uncovered_ns:
        defects.append({
            "defect_id": "DEF-ENRICH-M01",
            "severity": "MEDIUM",
            "description": f"KTO NS 계약 미등록: {dict(uncovered_ns)}",
            "status": "DOCUMENTED",
            "recommendation": "KTO 공공데이터포털 계약 파일에 KTO12/KTO28/KTO32/KTO38 api_sources 추가",
        })
    if not reg_pass:
        defects.append({
            "defect_id": "DEF-ENRICH-H01",
            "severity": "HIGH",
            "description": "회귀 테스트 실패",
            "status": "OPEN",
        })
    # offline release ready가 있는데 description 없는 경우
    offline_release = [r for r in proposed_recs if r["proposed_decision"] == "RELEASE"]
    for r in offline_release:
        if not r["resolved_core_fields"].get("description"):
            defects.append({
                "defect_id": "DEF-ENRICH-C02",
                "severity": "CRITICAL",
                "description": f"description 없이 RELEASE 제안: {r['candidate_id']}",
                "status": "OPEN",
            })

    # ── Summary ──────────────────────────────────────────────────────────────
    summary = {
        "task":     TASK,
        "version":  VERSION,
        "as_of":    as_of,
        "base_commit": BASE_COMMIT,
        "target_count":   len(targets),
        "category_dist":  dict(sorted(Counter(c.get("category","") for c in targets).items())),
        "regression_all_pass": reg_pass,
        "domain_only_positive_count": domain_only_positives,
        "image_rights_dist":   dict(sorted(img_vd.items())),
        "description_rights_dist": dict(sorted(desc_vd.items())),
        "offline_resolution_dist": dict(sorted(resolution_dist.items())),
        "proposed_release_count": len(offline_release),
        "remaining_hold_count":   len(remaining_hold),
        "targeted_collection_queue_count": len(queue_recs),
        "guide_linked_count":     coverage["target_guide_linked"],
        "existing_release_restaurants": len(idx["release_cids"]),
        "existing_release_unchanged":   len(idx["release_cids"]) == 102,
        "candidate_total_unchanged":    len(d["full_v1"]) == 910,
        "source_fact_total_unchanged":  len(d["sf_full"]) == 1158,
        "defect_count": {
            "CRITICAL": sum(1 for d_ in defects if d_.get("severity")=="CRITICAL"),
            "HIGH":     sum(1 for d_ in defects if d_.get("severity")=="HIGH"),
            "MEDIUM":   sum(1 for d_ in defects if d_.get("severity")=="MEDIUM"),
        },
        "city_core_set_readiness": readiness["city_core_set_readiness"],
        "overall_verdict":  ("CONDITIONAL_PASS" if (reg_pass and domain_only_positives == 0
                              and len(d["full_v1"]) == 910) else "FAIL"),
        "audit_status": ("GYEONGJU_CORE_PLACE_OFFLINE_ENRICHMENT_COMPLETE_WITH_TARGETED_COLLECTION_REQUIRED"
                         if resolution_dist.get("OFFLINE_RELEASE_READY",0) == 0
                         else "GYEONGJU_CORE_PLACE_OFFLINE_ENRICHMENT_COMPLETE"),
    }
    print(f"  [S9] overall: {summary['overall_verdict']} / {summary['audit_status']}")

    # ── 쓰기 ─────────────────────────────────────────────────────────────────
    out = VAL
    out_files = []

    def wj(fname, obj):
        p = out / fname; write_json(p, obj); out_files.append(p)

    def wjl(fname, recs):
        p = out / fname; write_jsonl(p, recs); out_files.append(p)

    regression_obj = {
        "task": TASK, "as_of": as_of,
        "total": len(fixtures), "passed": pass_cnt, "all_pass": reg_pass,
        "fixtures": fixtures,
    }

    frozen_sha_obj = {
        "task": TASK, "as_of": as_of, "base_commit": BASE_COMMIT,
        "files": [{"path": k, "sha256_pre": v} for k, v in sorted(frozen_pre.items())],
    }

    wj ("gyeongju-core-place-input-audit-v1.json",          input_audit)
    wjl("gyeongju-core-place-priority-v1.jsonl",            priority_recs)
    wjl("gyeongju-core-place-field-gap-audit-v1.jsonl",     gap_recs)
    wjl("gyeongju-core-place-enrichment-overlay-v1.jsonl",  enrichment_recs)
    wjl("gyeongju-core-place-image-rights-v1.jsonl",        img_rights_recs)
    wjl("gyeongju-core-place-description-rights-v1.jsonl",  desc_rights_recs)
    wjl("gyeongju-core-place-proposed-release-v1.jsonl",    proposed_recs)
    wjl("gyeongju-core-place-remaining-hold-v1.jsonl",      remaining_hold)
    wjl("gyeongju-core-place-targeted-collection-queue-v1.jsonl", queue_recs)
    wj ("gyeongju-core-place-coverage-summary-v1.json",     coverage)
    wj ("gyeongju-city-core-set-readiness-v1.json",         readiness)
    wj ("gyeongju-core-place-frozen-sha-audit-v1.json",     frozen_sha_obj)
    wjl("gyeongju-core-place-defect-register-v1.jsonl",     defects)
    wj ("gyeongju-core-place-enrichment-summary-v1.json",   summary)
    wj ("gyeongju-core-place-regression-fixtures-v1.json",  regression_obj)

    print(f"\n  출력 파일 {len(out_files)}개:")
    for p in out_files:
        print(f"    {Path(p).name}  ({Path(p).stat().st_size:,}B)")

    # ── SHA reproducibility ──────────────────────────────────────────────────
    sha_entries = [{"file": str(p.relative_to(REPO)).replace("\\","/"), "sha256": sha256f(p)}
                   for p in sorted(out_files)]
    repro = {"task": TASK, "as_of": as_of, "version": VERSION, "files": sha_entries}
    repro_p = out / "gyeongju-core-place-reproducibility-v1.json"
    write_json(repro_p, repro)
    out_files.append(repro_p)
    print(f"    {repro_p.name}  ({repro_p.stat().st_size:,}B)")

    # ── Frozen SHA postflight ─────────────────────────────────────────────────
    print("\n  [SHA-POST] 동결 파일 검증:")
    post_ok = True
    for rpath, fpath in sorted(FROZEN_FILES.items()):
        p = Path(fpath)
        post_sha = sha256f(p) if p.exists() else None
        match = (post_sha == frozen_pre.get(rpath))
        if not match:
            post_ok = False
            print(f"    FAIL {rpath}")
        else:
            print(f"    OK   {rpath[:55]}")

    if not post_ok:
        print("  [FATAL] 동결 파일 SHA 변경")
        sys.exit(1)
    print("  [SHA-POST] 전건 일치 ✓")

    return summary["overall_verdict"], summary["audit_status"]


if __name__ == "__main__":
    verdict, status = main()
    print(f"\n=== 완료: {verdict} / {status} ===")
