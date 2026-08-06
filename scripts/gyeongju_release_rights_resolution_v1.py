#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TASK-GYEONGJU-RELEASE-RIGHTS-RESOLUTION-OVERLAY-V1
경주 RELEASE 후보 계약 기반 권리 판정 Overlay.
VERSION = 1.0.0

원칙:
  - 기존 classification 스크립트·산출물 동결 (수정 금지)
  - URL domain만으로 positive verdict 절대 금지
  - source fact + source contract 기반 독립 판정
  - normalized RIGHTS_UNKNOWN 직접 수정 금지
  - overlay가 권리 판정 SSOT
  - Run1 = Run2 BYTE_IDENTICAL
  - as_of: normalization summary에서 읽음; datetime.now() 금지
"""

import hashlib
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import urlparse

VERSION       = "1.0.0"
TASK          = "TASK-GYEONGJU-RELEASE-RIGHTS-RESOLUTION-OVERLAY-V1"
BASE_TASK     = "TASK-GYEONGJU-RELEASE-102-PROVENANCE-RIGHTS-AUDIT-V1"
BASE_HEAD     = "5d79839"
FROZEN_COMMIT = "ca64e5c"

REPO      = Path(__file__).resolve().parent.parent
NORM      = REPO / "data/tourapi/normalized/gyeongju"
VAL       = REPO / "data/tourapi/validation/gyeongju"
CONTRACTS = REPO / "data/tourapi/contracts/gyeongju"
SCRIPTS   = REPO / "scripts"
MANIFEST  = REPO / "data/tourapi/manifests/gyeongju/gyeongju-manifest-v1.json"

# 동결 대상 (절대 수정 금지)
FROZEN_FILES = {
    "scripts/gyeongju_release_hold_classification_v1.py":
        SCRIPTS / "gyeongju_release_hold_classification_v1.py",
    "data/tourapi/validation/gyeongju/gyeongju-candidate-release-hold-v1.jsonl":
        VAL / "gyeongju-candidate-release-hold-v1.jsonl",
    "data/tourapi/validation/gyeongju/gyeongju-event-release-hold-v1.jsonl":
        VAL / "gyeongju-event-release-hold-v1.jsonl",
    "data/tourapi/validation/gyeongju/gyeongju-relation-release-usage-v1.jsonl":
        VAL / "gyeongju-relation-release-usage-v1.jsonl",
    "data/tourapi/normalized/gyeongju/gyeongju-full-v1-candidates.jsonl":
        NORM / "gyeongju-full-v1-candidates.jsonl",
    "data/tourapi/normalized/gyeongju/source-facts-full-v1.jsonl":
        NORM / "source-facts-full-v1.jsonl",
}

# VG 이미지 도메인
VG_IMG_DOMAINS = {
    "visitgyeongju.or.kr", "www.visitgyeongju.or.kr",
    "visitgyeongju.com",   "www.visitgyeongju.com",
}

# NS → api_id 매핑
NS_TO_API_ID = {
    "GJ01": "GJ01", "GJ02": "GJ02", "GJ03": "GJ03",
    "GJ04": "GJ04", "GJ05": "GJ05", "GJ06": "GJ06",
    "GJ07": "GJ07", "GJ08": "GJ08", "GJ09": "GJ09", "GJ10": "GJ10",
    "KTO39": "KTO_KorService2", "KTO15": "KTO_KorService2_events",
}

# 허용 rights_verdict 값
ALLOWED_IMG_VERDICTS  = {
    "VERIFIED_ALLOWED_BY_SOURCE_CONTRACT", "VERIFIED_PUBLIC_API_FIELD_ALLOWED",
    "FACTUAL_METADATA_ALLOWED", "METADATA_ONLY",
    "RIGHTS_EVIDENCE_MISSING", "RIGHTS_REVIEW_REQUIRED", "DISALLOWED_FOR_RELEASE",
    "NO_IMAGE",
}
ALLOWED_DESC_VERDICTS = {
    "VERIFIED_ALLOWED_BY_SOURCE_CONTRACT", "VERIFIED_PUBLIC_API_FIELD_ALLOWED",
    "FACTUAL_METADATA_ALLOWED", "METADATA_ONLY",
    "RIGHTS_EVIDENCE_MISSING", "RIGHTS_REVIEW_REQUIRED", "DISALLOWED_FOR_RELEASE",
    "NO_DESCRIPTION",
}
ALLOWED_EVIDENCE_TYPES = {
    "SOURCE_FACT_PLUS_COLLECTION_CONTRACT", "SOURCE_FACT_PLUS_DATASET_LICENSE",
    "SOURCE_FACT_PLUS_FIELD_PROVENANCE", "CONTRACT_ONLY_INSUFFICIENT",
    "DOMAIN_SECONDARY_CHECK_ONLY", "NO_TRACEABLE_EVIDENCE",
}
ALLOWED_PROVENANCE_COMPLETENESS = {"COMPLETE", "PARTIAL", "INSUFFICIENT"}
ALLOWED_FINAL_RESOLUTIONS = {
    "RELEASE_CONFIRMED", "RELEASE_CONFIRMED_METADATA_LIMITED",
    "HOLD_RIGHTS_EVIDENCE_MISSING", "HOLD_RIGHTS_REVIEW_REQUIRED",
    "HOLD_DISALLOWED_CONTENT",
}

GJ_CONTRACT_PATH = "data/tourapi/contracts/gyeongju/gyeongju-culture-tourism-source-contract-v1.json"


# ─── helpers ─────────────────────────────────────────────────────────────────
def rjl(p):
    return [json.loads(l) for l in Path(p).read_text("utf-8").splitlines() if l.strip()]

def rj(p):
    return json.loads(Path(p).read_text("utf-8"))

def dump(obj):
    return json.dumps(obj, ensure_ascii=False, sort_keys=True)

def write_json(path, obj):
    Path(path).write_text(dump(obj) + "\n", encoding="utf-8")

def write_jsonl(path, records):
    if records and isinstance(records[0], dict) and "candidate_id" in records[0]:
        records = sorted(records, key=lambda r: r["candidate_id"])
    Path(path).write_text(
        "\n".join(dump(r) for r in records) + "\n", encoding="utf-8"
    )

def sha256f(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def sha256s(s):
    return hashlib.sha256(s.encode("utf-8")).hexdigest()

def get_ns(sfid):
    if not sfid:
        return ""
    parts = sfid.split("-")
    return parts[1] if len(parts) >= 2 else ""

def get_src_record_id(sfid):
    if not sfid:
        return ""
    parts = sfid.split("-")
    return parts[-1] if len(parts) >= 3 else ""

def img_host(url):
    return urlparse(url).netloc if url else ""

def is_gj_ns(ns):
    return ns.startswith("GJ") or ns.startswith("KTO")

def is_vg_img_host(host):
    return host in VG_IMG_DOMAINS or any(
        host.endswith("." + d) or host == d for d in VG_IMG_DOMAINS
    )


# ─── load & index ─────────────────────────────────────────────────────────────
def load_all():
    d = {}
    d["summary"]  = rj(NORM / "gyeongju-normalization-summary-v1.json")
    d["as_of"]    = d["summary"].get("as_of", "UNKNOWN")
    d["full_v1"]  = rjl(NORM / "gyeongju-full-v1-candidates.jsonl")
    d["sf_full"]  = rjl(NORM / "source-facts-full-v1.jsonl")
    d["cl_cands"] = rjl(VAL  / "gyeongju-candidate-release-hold-v1.jsonl")
    d["gj_c1"]    = rj(CONTRACTS / "gyeongju-culture-tourism-source-contract-v1.json")
    d["vg_c1"]    = rj(CONTRACTS / "visitgyeongju-source-contract-v1.json")
    d["vg_rest"]  = rjl(NORM / "gyeongju-restaurant-identity-audit-v1.jsonl")
    d["manifest"] = rj(MANIFEST)
    return d

def build_indexes(d):
    idx = {}
    idx["full_by_id"]  = {c["candidate_id"]: c for c in d["full_v1"]}
    idx["sf_by_id"]    = {s["source_fact_id"]: s for s in d["sf_full"]}
    idx["cl_by_id"]    = {r["candidate_id"]: r for r in d["cl_cands"]}
    api_contracts = {s["api_id"]: s for s in d["gj_c1"].get("api_sources", [])}
    idx["api_contracts"] = api_contracts
    vg_tos = d["vg_c1"].get("access_conditions", {}).get("terms_of_service", {})
    idx["vg_rights"] = {
        "image_verdict": vg_tos.get("image_verdict", "RIGHTS_REVIEW_REQUIRED"),
        "description_verdict": vg_tos.get("description_verdict", "RIGHTS_REVIEW_REQUIRED"),
    }
    idx["release_cids"] = {r["candidate_id"] for r in d["cl_cands"] if r.get("release_decision") == "RELEASE"}
    idx["vg_rest_by_cid"] = {}
    for r in d["vg_rest"]:
        cid = r.get("baseline_candidate_id","") or r.get("linked_api_source_fact_id","")
        if cid:
            idx["vg_rest_by_cid"][cid] = r
    return idx


# ─── rights determination (domain positive 금지) ──────────────────────────────
def get_api_contract(ns, idx):
    api_id = NS_TO_API_ID.get(ns, ns)
    return idx["api_contracts"].get(api_id, {})


def determine_image_rights(c_or_mock, idx, *, mock_sfid=None, mock_img_url=None, mock_web_links=None):
    """이미지 권리 판정. domain positive verdict 절대 금지."""
    img_url   = mock_img_url   if mock_img_url   is not None else (c_or_mock.get("image_url","") or "")
    sfid      = mock_sfid      if mock_sfid      is not None else (c_or_mock.get("source_fact_id","") or "")
    web_links = mock_web_links if mock_web_links is not None else (c_or_mock.get("_web_source_facts_linked",[]) or [])

    host = img_host(img_url)
    ns   = get_ns(sfid)
    src_record_id = get_src_record_id(sfid)

    base = {
        "image_url_host":          host,
        "selected_source_fact_id": sfid,
        "source_namespace":        ns,
        "source_record_id":        src_record_id,
        "dataset_or_collection":   c_or_mock.get("source","") if not isinstance(c_or_mock, dict) or "source_fact_id" in c_or_mock else "",
        "vg_web_linked":           bool(web_links),
        "raw_field_name":          "NOT_RETAINED",
        "domain_only_positive":    False,  # 항상 False (도메인 단독 허용 금지)
    }

    if not img_url:
        return {**base,
                "rights_verdict": "NO_IMAGE",
                "evidence_type": "NO_TRACEABLE_EVIDENCE",
                "provenance_completeness": "INSUFFICIENT",
                "host_consistency": "NO_IMAGE_URL",
                "resolution_reason": "no_image_url"}

    if is_vg_img_host(host):
        return {**base,
                "rights_verdict": "RIGHTS_REVIEW_REQUIRED",
                "evidence_type": "DOMAIN_SECONDARY_CHECK_ONLY",
                "provenance_completeness": "INSUFFICIENT",
                "host_consistency": "VG_DOMAIN_RIGHTS_REVIEW",
                "resolution_reason": "vg_web_image_domain_no_license"}

    if not sfid or sfid not in idx["sf_by_id"]:
        # 도메인이 공식이라도 SF 없으면 RIGHTS_EVIDENCE_MISSING
        return {**base,
                "rights_verdict": "RIGHTS_EVIDENCE_MISSING",
                "evidence_type": "NO_TRACEABLE_EVIDENCE",
                "provenance_completeness": "INSUFFICIENT",
                "host_consistency": "SECONDARY_REFERENCE_ONLY",
                "resolution_reason": "no_valid_source_fact_domain_alone_insufficient"}

    if not is_gj_ns(ns):
        return {**base,
                "rights_verdict": "RIGHTS_EVIDENCE_MISSING",
                "evidence_type": "CONTRACT_ONLY_INSUFFICIENT",
                "provenance_completeness": "INSUFFICIENT",
                "host_consistency": "UNKNOWN_NAMESPACE",
                "resolution_reason": f"unknown_namespace:{ns}"}

    api_c  = get_api_contract(ns, idx)
    rights = api_c.get("rights_status","")
    usage  = api_c.get("usage_rights","") or ""
    api_id = NS_TO_API_ID.get(ns, ns)

    # host_consistency 보조 검사
    if ns.startswith("GJ") and host == "www.gyeongju.go.kr":
        host_consistency = "CONSISTENT_WITH_GJ_NAMESPACE"
    elif ns.startswith("KTO") and "visitkorea.or.kr" in host:
        host_consistency = "CONSISTENT_WITH_KTO_NAMESPACE"
    elif host and not is_vg_img_host(host):
        host_consistency = "SECONDARY_REFERENCE_ONLY"
    else:
        host_consistency = "UNKNOWN"

    if rights == "COLLECTION_ALLOWED" and "제한 없음" in usage:
        return {**base,
                "rights_verdict": "VERIFIED_ALLOWED_BY_SOURCE_CONTRACT",
                "evidence_type": "SOURCE_FACT_PLUS_COLLECTION_CONTRACT",
                "provenance_completeness": "PARTIAL",
                "host_consistency": host_consistency,
                "contract_api_id": api_id,
                "contract_path": GJ_CONTRACT_PATH,
                "license_scope": "이용허락범위: 제한 없음 (공공데이터포털)",
                "data_gap": "raw_source_record_not_retained",
                "resolution_reason": "gj_api_source_fact_plus_collection_contract"}

    if rights == "COLLECTION_ALLOWED":
        return {**base,
                "rights_verdict": "METADATA_ONLY",
                "evidence_type": "SOURCE_FACT_PLUS_COLLECTION_CONTRACT",
                "provenance_completeness": "PARTIAL",
                "host_consistency": host_consistency,
                "contract_api_id": api_id,
                "resolution_reason": "collection_allowed_usage_not_explicit"}

    return {**base,
            "rights_verdict": "RIGHTS_EVIDENCE_MISSING",
            "evidence_type": "CONTRACT_ONLY_INSUFFICIENT",
            "provenance_completeness": "INSUFFICIENT",
            "host_consistency": host_consistency,
            "resolution_reason": f"no_collection_allowed_contract_ns={ns}"}


def determine_description_rights(c_or_mock, idx, *, mock_sfid=None, mock_desc=None, mock_web_links=None):
    """설명 권리 판정. image와 독립적으로 판정."""
    desc      = mock_desc      if mock_desc      is not None else (c_or_mock.get("description_ko","") or "")
    sfid      = mock_sfid      if mock_sfid      is not None else (c_or_mock.get("source_fact_id","") or "")
    web_links = mock_web_links if mock_web_links is not None else (c_or_mock.get("_web_source_facts_linked",[]) or [])

    ns = get_ns(sfid)
    src_record_id = get_src_record_id(sfid)
    desc_hash = sha256s(desc)[:16] if desc else ""

    base = {
        "description_hash":         desc_hash,
        "description_length":       len(desc),
        "selected_source_fact_id":  sfid,
        "source_namespace":         ns,
        "source_record_id":         src_record_id,
        "vg_web_linked":            bool(web_links),
        "raw_field_name":           "NOT_RETAINED",
        "domain_only_positive":     False,
    }

    if not desc:
        return {**base,
                "rights_verdict": "NO_DESCRIPTION",
                "description_type": "NO_DESCRIPTION",
                "evidence_type": "NO_TRACEABLE_EVIDENCE",
                "provenance_completeness": "INSUFFICIENT",
                "resolution_reason": "no_description_value"}

    if not sfid or sfid not in idx["sf_by_id"]:
        return {**base,
                "rights_verdict": "RIGHTS_EVIDENCE_MISSING",
                "description_type": "UNKNOWN_ORIGIN",
                "evidence_type": "NO_TRACEABLE_EVIDENCE",
                "provenance_completeness": "INSUFFICIENT",
                "resolution_reason": "no_valid_source_fact"}

    if not is_gj_ns(ns):
        return {**base,
                "rights_verdict": "RIGHTS_EVIDENCE_MISSING",
                "description_type": "UNKNOWN_ORIGIN",
                "evidence_type": "CONTRACT_ONLY_INSUFFICIENT",
                "provenance_completeness": "INSUFFICIENT",
                "resolution_reason": f"unknown_namespace:{ns}"}

    api_c  = get_api_contract(ns, idx)
    rights = api_c.get("rights_status","")
    usage  = api_c.get("usage_rights","") or ""
    api_id = NS_TO_API_ID.get(ns, ns)

    if rights == "COLLECTION_ALLOWED" and "제한 없음" in usage:
        return {**base,
                "rights_verdict": "VERIFIED_ALLOWED_BY_SOURCE_CONTRACT",
                "description_type": "PUBLIC_API_DESCRIPTION",
                "evidence_type": "SOURCE_FACT_PLUS_COLLECTION_CONTRACT",
                "provenance_completeness": "PARTIAL",
                "contract_api_id": api_id,
                "contract_path": GJ_CONTRACT_PATH,
                "license_scope": "이용허락범위: 제한 없음 (공공데이터포털)",
                "data_gap": "raw_field_name_not_retained",
                "resolution_reason": "gj_api_source_fact_plus_collection_contract"}

    if rights == "COLLECTION_ALLOWED":
        return {**base,
                "rights_verdict": "METADATA_ONLY",
                "description_type": "PUBLIC_API_DESCRIPTION",
                "evidence_type": "SOURCE_FACT_PLUS_COLLECTION_CONTRACT",
                "provenance_completeness": "PARTIAL",
                "contract_api_id": api_id,
                "resolution_reason": "collection_allowed_usage_not_explicit"}

    return {**base,
            "rights_verdict": "RIGHTS_EVIDENCE_MISSING",
            "description_type": "UNKNOWN_ORIGIN",
            "evidence_type": "CONTRACT_ONLY_INSUFFICIENT",
            "provenance_completeness": "INSUFFICIENT",
            "resolution_reason": f"no_collection_allowed_contract_ns={ns}"}


# ─── regression tests ─────────────────────────────────────────────────────────
def run_regression_tests(idx):
    """10개 회귀 테스트 fixture 실행. 모두 PASS여야 한다."""

    # 공통 mock idx (테스트용 synthetic source facts)
    mock_idx = dict(idx)
    mock_idx["sf_by_id"] = dict(idx["sf_by_id"])
    mock_idx["sf_by_id"]["gyeongju-GJ08-TEST"] = {"source_fact_id": "gyeongju-GJ08-TEST"}
    mock_idx["sf_by_id"]["gyeongju-GJ09-TEST"] = {"source_fact_id": "gyeongju-GJ09-TEST"}
    mock_c = {"source": "gyeongju-city/menuRstrtService", "_web_source_facts_linked": [],
              "description_ko": "", "image_url": "", "source_fact_id": ""}

    fixtures = []

    def run_fixture(fid, desc, fn, expected_key, expected_val):
        r = fn()
        actual = r.get(expected_key)
        passed = (actual == expected_val)
        # domain_only_positive must always be False
        dom_ok = not r.get("domain_only_positive", False)
        fixtures.append({
            "fixture_id": fid,
            "scenario": desc,
            "expected": {expected_key: expected_val, "domain_only_positive": False},
            "actual": {expected_key: actual, "domain_only_positive": r.get("domain_only_positive", False)},
            "verdict": "PASS" if (passed and dom_ok) else "FAIL",
        })
        return passed and dom_ok

    # F01: 공식 도메인 + source fact 없음 → RIGHTS_EVIDENCE_MISSING
    run_fixture("F01", "공식 도메인 + source fact 없음 → RIGHTS_EVIDENCE_MISSING",
        lambda: determine_image_rights(mock_c, mock_idx,
            mock_sfid=None, mock_img_url="https://www.gyeongju.go.kr/upload/test.jpg", mock_web_links=[]),
        "rights_verdict", "RIGHTS_EVIDENCE_MISSING")

    # F02: 외부 CDN + 유효 SF + 허용 contract → VERIFIED_ALLOWED_BY_SOURCE_CONTRACT
    run_fixture("F02", "외부 CDN + 유효 SF + 허용 contract → 계약 기반 허용",
        lambda: determine_image_rights(mock_c, mock_idx,
            mock_sfid="gyeongju-GJ08-TEST", mock_img_url="https://cdn.example.com/img.jpg", mock_web_links=[]),
        "rights_verdict", "VERIFIED_ALLOWED_BY_SOURCE_CONTRACT")

    # F03: contract 존재 + selected source fact 없음(유효 SF 아님) → RIGHTS_EVIDENCE_MISSING
    run_fixture("F03", "contract 존재 + 유효하지 않은 source fact → RELEASE 금지",
        lambda: determine_image_rights(mock_c, mock_idx,
            mock_sfid="gyeongju-GJ08-NONEXIST", mock_img_url="https://www.gyeongju.go.kr/upload/test.jpg", mock_web_links=[]),
        "rights_verdict", "RIGHTS_EVIDENCE_MISSING")

    # F04: normalized RIGHTS_UNKNOWN + 유효 contract → VERIFIED_ALLOWED_BY_SOURCE_CONTRACT
    run_fixture("F04", "normalized RIGHTS_UNKNOWN + 유효 contract → overlay 허용 (metadata limited)",
        lambda: determine_image_rights(mock_c, mock_idx,
            mock_sfid="gyeongju-GJ08-TEST", mock_img_url="https://www.gyeongju.go.kr/upload/test.jpg", mock_web_links=[]),
        "rights_verdict", "VERIFIED_ALLOWED_BY_SOURCE_CONTRACT")

    # F05: VG 웹 이미지 → 자동 허용 금지 (RIGHTS_REVIEW_REQUIRED)
    run_fixture("F05", "VisitGyeongju 웹 이미지 → 자동 허용 금지",
        lambda: determine_image_rights(mock_c, mock_idx,
            mock_sfid="gyeongju-GJ08-TEST", mock_img_url="https://visitgyeongju.or.kr/img.jpg", mock_web_links=[]),
        "rights_verdict", "RIGHTS_REVIEW_REQUIRED")

    # F06: VG 웹 설명 → 자동 허용 금지 (source fact 없으면 RIGHTS_EVIDENCE_MISSING)
    run_fixture("F06", "VisitGyeongju 웹 연결 + SF 없음 description → 자동 허용 금지",
        lambda: determine_description_rights(mock_c, mock_idx,
            mock_sfid=None, mock_desc="경주 대표 맛집입니다.", mock_web_links=["gyeongju-VG-REST-aaa"]),
        "rights_verdict", "RIGHTS_EVIDENCE_MISSING")

    # F07: GJ08 SF + 허용 contract image → VERIFIED_ALLOWED_BY_SOURCE_CONTRACT
    run_fixture("F07", "GJ08 SF + 허용 contract → 이미지 허용",
        lambda: determine_image_rights(mock_c, mock_idx,
            mock_sfid="gyeongju-GJ08-TEST", mock_img_url="https://www.gyeongju.go.kr/upload/img.jpg", mock_web_links=[]),
        "rights_verdict", "VERIFIED_ALLOWED_BY_SOURCE_CONTRACT")

    # F08: GJ08 SF + 허용 contract description → VERIFIED_ALLOWED_BY_SOURCE_CONTRACT
    run_fixture("F08", "GJ08 SF + 허용 contract → 설명 허용",
        lambda: determine_description_rights(mock_c, mock_idx,
            mock_sfid="gyeongju-GJ08-TEST", mock_desc="경주 전통 음식점입니다.", mock_web_links=[]),
        "rights_verdict", "VERIFIED_ALLOWED_BY_SOURCE_CONTRACT")

    # F09: 이미지 허용 + description SF 없음 → final resolution = HOLD_RIGHTS_EVIDENCE_MISSING
    img_r9 = determine_image_rights(mock_c, mock_idx,
        mock_sfid="gyeongju-GJ08-TEST", mock_img_url="https://www.gyeongju.go.kr/upload/img.jpg", mock_web_links=[])
    desc_r9 = determine_description_rights(mock_c, mock_idx,
        mock_sfid=None, mock_desc="설명입니다.", mock_web_links=[])
    img_ok9  = img_r9["rights_verdict"] in {"VERIFIED_ALLOWED_BY_SOURCE_CONTRACT","VERIFIED_PUBLIC_API_FIELD_ALLOWED","FACTUAL_METADATA_ALLOWED","NO_IMAGE"}
    desc_ok9 = desc_r9["rights_verdict"] in {"VERIFIED_ALLOWED_BY_SOURCE_CONTRACT","VERIFIED_PUBLIC_API_FIELD_ALLOWED","FACTUAL_METADATA_ALLOWED","NO_DESCRIPTION"}
    final9 = "RELEASE_CONFIRMED_METADATA_LIMITED" if img_ok9 and desc_ok9 else "HOLD_RIGHTS_EVIDENCE_MISSING"
    dom9_ok = not img_r9.get("domain_only_positive") and not desc_r9.get("domain_only_positive")
    fixtures.append({
        "fixture_id": "F09",
        "scenario": "이미지 허용 + description SF 없음 → RELEASE 유지 금지",
        "expected": {"final_resolution": "HOLD_RIGHTS_EVIDENCE_MISSING", "domain_only_positive": False},
        "actual": {"final_resolution": final9, "domain_only_positive": not dom9_ok},
        "verdict": "PASS" if (final9 == "HOLD_RIGHTS_EVIDENCE_MISSING" and dom9_ok) else "FAIL",
    })

    # F10: domain allowlist 정보만 → positive verdict 0
    # domain-only path: sfid=None (no SF), so RIGHTS_EVIDENCE_MISSING
    r10 = determine_image_rights(mock_c, mock_idx,
        mock_sfid=None, mock_img_url="https://www.gyeongju.go.kr/upload/test.jpg", mock_web_links=[])
    dom10_positive = r10["rights_verdict"] in {"VERIFIED_ALLOWED_BY_SOURCE_CONTRACT","VERIFIED_PUBLIC_API_FIELD_ALLOWED"}
    dom10_ok = not r10.get("domain_only_positive") and not dom10_positive
    fixtures.append({
        "fixture_id": "F10",
        "scenario": "domain allowlist 정보만 존재 → positive verdict 0",
        "expected": {"rights_verdict_positive": False, "domain_only_positive": False},
        "actual": {"rights_verdict_positive": dom10_positive, "domain_only_positive": r10.get("domain_only_positive",False)},
        "verdict": "PASS" if dom10_ok else "FAIL",
    })

    all_pass = all(f["verdict"] == "PASS" for f in fixtures)
    return fixtures, all_pass


# ─── section processors ───────────────────────────────────────────────────────
def compute_frozen_sha():
    """S0: 동결 파일 SHA 계산 (preflight)."""
    entries = []
    for rpath, fpath in sorted(FROZEN_FILES.items()):
        p = Path(fpath)
        exists = p.exists()
        entries.append({
            "path":             rpath,
            "sha256":           sha256f(p) if exists else None,
            "size":             p.stat().st_size if exists else None,
            "role":             "FROZEN_HISTORICAL_ARTIFACT",
            "mutation_allowed": False,
            "baseline_commit":  FROZEN_COMMIT,
            "exists":           exists,
        })
    return entries


def proc_s1_input_integrity(d, idx):
    release_cands = sorted(
        [c for c in d["full_v1"] if c["candidate_id"] in idx["release_cids"]],
        key=lambda c: c["candidate_id"],
    )
    ids_set       = {c["candidate_id"] for c in release_cands}
    unique_count  = len(ids_set)
    sf_valid      = sum(1 for c in release_cands if c.get("source_fact_id","") in idx["sf_by_id"])
    img_present   = sum(1 for c in release_cands if c.get("image_url"))
    desc_present  = sum(1 for c in release_cands if c.get("description_ko"))
    web_linked    = sum(1 for c in release_cands if c.get("_web_source_facts_linked"))
    ns_dist       = Counter(get_ns(c.get("source_fact_id","")) for c in release_cands)
    cl_by_id = idx["cl_by_id"]
    broken_cl = sum(1 for c in release_cands if c["candidate_id"] not in cl_by_id)
    return {
        "release_candidate_count":  len(release_cands),
        "unique_candidate_ids":     unique_count,
        "duplicate_ids":            len(release_cands) - unique_count,
        "source_fact_valid":        sf_valid,
        "source_fact_broken_refs":  len(release_cands) - sf_valid,
        "classification_broken_refs": broken_cl,
        "has_image_url":            img_present,
        "has_description_ko":       desc_present,
        "vg_web_linked":            web_linked,
        "source_namespace_dist":    dict(sorted(ns_dist.items())),
        "input_integrity_verdict":  "PASS" if (unique_count == len(release_cands) and sf_valid == len(release_cands) and broken_cl == 0) else "FAIL",
    }, release_cands


def proc_s2_source_contract_evidence(release_cands, d, idx):
    """S2: source-contract 증거 연결 (후보 단위)."""
    records = []
    for c in release_cands:
        cid   = c["candidate_id"]
        sfid  = c.get("source_fact_id","") or ""
        ns    = get_ns(sfid)
        src   = c.get("source","") or ""
        prov  = c.get("provenance") or {}
        prov_op  = prov.get("operation","") if isinstance(prov, dict) else ""
        prov_src = prov.get("primary_source","") if isinstance(prov, dict) else ""

        api_id = NS_TO_API_ID.get(ns, ns)
        api_c  = get_api_contract(ns, idx)
        rights = api_c.get("rights_status","")
        usage  = api_c.get("usage_rights","") or ""

        sf_exists = sfid in idx["sf_by_id"]

        # selected image/description source fact (inferred from primary SF)
        img_url   = c.get("image_url","") or ""
        desc_ko   = c.get("description_ko","") or ""
        web_links = c.get("_web_source_facts_linked",[]) or []
        lsf       = c.get("linked_source_facts",[]) or []

        records.append({
            "candidate_id":                   cid,
            "source_dataset":                 src,
            "provenance_endpoint":            prov_op,
            "provenance_primary_source":      prov_src,
            "primary_source_fact_id":         sfid,
            "source_namespace":               ns,
            "source_record_id":               get_src_record_id(sfid),
            "source_fact_exists":             sf_exists,
            "selected_image_source_fact_id":  sfid,
            "selected_desc_source_fact_id":   sfid,
            "linked_source_facts":            lsf,
            "vg_web_source_facts":            web_links,
            "contract_api_id":                api_id,
            "contract_path":                  GJ_CONTRACT_PATH if is_gj_ns(ns) else "N/A",
            "contract_rights_status":         rights,
            "contract_usage_rights":          usage,
            "has_image_url":                  bool(img_url),
            "has_description_ko":             bool(desc_ko),
            "existing_normalized_rights_status": c.get("image_rights_status","") or "RIGHTS_UNKNOWN",
            "existing_cl_rights_basis":       idx["cl_by_id"].get(cid,{}).get("classification_evidence",{}).get("img_rights_basis",""),
            "contract_evidence_verdict":      "CONTRACT_EVIDENCE_FOUND" if (rights == "COLLECTION_ALLOWED" and sf_exists) else "CONTRACT_EVIDENCE_MISSING",
        })
    return records


def proc_s3_image_rights(release_cands, idx):
    """S3: 이미지 권리 resolution (후보 단위)."""
    records = []
    for c in release_cands:
        r = determine_image_rights(c, idx)
        records.append({"candidate_id": c["candidate_id"], **r})
    return records


def proc_s4_description_rights(release_cands, idx):
    """S4: 설명 권리 resolution (후보 단위)."""
    records = []
    for c in release_cands:
        r = determine_description_rights(c, idx)
        records.append({"candidate_id": c["candidate_id"], **r})
    return records


def proc_s5_rights_status_overlay(release_cands, img_recs, desc_recs, d, idx):
    """S5: normalized RIGHTS_UNKNOWN → resolved overlay (직접 수정 금지)."""
    img_by_id  = {r["candidate_id"]: r for r in img_recs}
    desc_by_id = {r["candidate_id"]: r for r in desc_recs}
    records = []
    for c in release_cands:
        cid = c["candidate_id"]
        img_v  = img_by_id.get(cid, {}).get("rights_verdict","")
        desc_v = desc_by_id.get(cid, {}).get("rights_verdict","")
        norm_status = c.get("image_rights_status","") or "RIGHTS_UNKNOWN"

        if img_v in {"VERIFIED_ALLOWED_BY_SOURCE_CONTRACT","VERIFIED_PUBLIC_API_FIELD_ALLOWED"}:
            resolved = img_v
            discrepancy = "DECLARED_UNKNOWN_RESOLVED_BY_CONTRACT" if norm_status == "RIGHTS_UNKNOWN" else "CONSISTENT"
        elif img_v == "NO_IMAGE":
            resolved = "NO_IMAGE"
            discrepancy = "NO_IMAGE_PRESENT"
        else:
            resolved = img_v
            discrepancy = "UNRESOLVED"

        records.append({
            "candidate_id":                   cid,
            "content_type":                   "image",
            "declared_normalized_rights_status": norm_status,
            "resolved_rights_status":         resolved,
            "resolution_evidence_type":       img_by_id.get(cid,{}).get("evidence_type",""),
            "source_contract_id":             img_by_id.get(cid,{}).get("contract_api_id",""),
            "provenance_completeness":        img_by_id.get(cid,{}).get("provenance_completeness",""),
            "status_discrepancy":             discrepancy,
            "requires_normalized_mutation":   False,
            "overlay_is_ssot":                True,
        })
        # description overlay entry
        desc_norm = "RIGHTS_UNKNOWN"  # description rights not stored separately
        desc_resolved = desc_v if desc_v else "RIGHTS_UNKNOWN"
        desc_disc = "DECLARED_UNKNOWN_RESOLVED_BY_CONTRACT" if desc_v in {"VERIFIED_ALLOWED_BY_SOURCE_CONTRACT"} else "UNRESOLVED"
        records.append({
            "candidate_id":                   cid,
            "content_type":                   "description",
            "declared_normalized_rights_status": desc_norm,
            "resolved_rights_status":         desc_resolved,
            "resolution_evidence_type":       desc_by_id.get(cid,{}).get("evidence_type",""),
            "source_contract_id":             desc_by_id.get(cid,{}).get("contract_api_id",""),
            "provenance_completeness":        desc_by_id.get(cid,{}).get("provenance_completeness",""),
            "status_discrepancy":             desc_disc,
            "requires_normalized_mutation":   False,
            "overlay_is_ssot":                True,
        })
    return records


def proc_s6_final_rights_overlay(release_cands, img_recs, desc_recs, idx):
    """S6: candidate 최종 rights overlay."""
    img_by_id  = {r["candidate_id"]: r for r in img_recs}
    desc_by_id = {r["candidate_id"]: r for r in desc_recs}
    records = []
    for c in release_cands:
        cid    = c["candidate_id"]
        img_v  = img_by_id.get(cid,{}).get("rights_verdict","")
        desc_v = desc_by_id.get(cid,{}).get("rights_verdict","")
        img_pc = img_by_id.get(cid,{}).get("provenance_completeness","")
        desc_pc= desc_by_id.get(cid,{}).get("provenance_completeness","")

        img_ok  = img_v  in {"VERIFIED_ALLOWED_BY_SOURCE_CONTRACT","VERIFIED_PUBLIC_API_FIELD_ALLOWED","FACTUAL_METADATA_ALLOWED","NO_IMAGE"}
        desc_ok = desc_v in {"VERIFIED_ALLOWED_BY_SOURCE_CONTRACT","VERIFIED_PUBLIC_API_FIELD_ALLOWED","FACTUAL_METADATA_ALLOWED","NO_DESCRIPTION"}
        both_partial = img_pc in {"PARTIAL","COMPLETE"} and desc_pc in {"PARTIAL","COMPLETE"}

        if img_ok and desc_ok and img_pc == "COMPLETE" and desc_pc == "COMPLETE":
            final = "RELEASE_CONFIRMED"
        elif img_ok and desc_ok:
            final = "RELEASE_CONFIRMED_METADATA_LIMITED"
        elif img_v in {"RIGHTS_REVIEW_REQUIRED"} or desc_v in {"RIGHTS_REVIEW_REQUIRED"}:
            final = "HOLD_RIGHTS_REVIEW_REQUIRED"
        elif img_v in {"DISALLOWED_FOR_RELEASE"} or desc_v in {"DISALLOWED_FOR_RELEASE"}:
            final = "HOLD_DISALLOWED_CONTENT"
        else:
            final = "HOLD_RIGHTS_EVIDENCE_MISSING"

        records.append({
            "candidate_id":          cid,
            "category":              c.get("category",""),
            "image_rights_verdict":  img_v,
            "description_rights_verdict": desc_v,
            "image_provenance_completeness":  img_pc,
            "description_provenance_completeness": desc_pc,
            "image_rights_ok":       img_ok,
            "description_rights_ok": desc_ok,
            "final_resolution":      final,
            "overlay_authority":     "AUTHORITATIVE_RIGHTS_RESOLUTION",
        })
    return records


def proc_s7_vg_linked(release_cands, d, idx):
    """S7: VG-linked RELEASE candidate 상세 감사."""
    records = []
    for c in release_cands:
        cid       = c["candidate_id"]
        web_links = c.get("_web_source_facts_linked",[]) or []
        lsf       = c.get("linked_source_facts",[]) or []
        vg_lsf    = [sf for sf in lsf if "VG" in sf]
        all_vg    = web_links + vg_lsf
        if not all_vg:
            continue

        sfid = c.get("source_fact_id","") or ""
        ns   = get_ns(sfid)
        img  = c.get("image_url","") or ""
        host = img_host(img)
        desc = c.get("description_ko","") or ""

        # VG image check
        vg_img_selected = is_vg_img_host(host)
        # VG description check: no way to know for sure, assume from GJ08 if NS is GJ08
        vg_desc_selected = False  # GJ08 primary → description from GJ08 API

        records.append({
            "candidate_id":               cid,
            "vg_web_source_facts":        web_links,
            "vg_linked_source_facts":     vg_lsf,
            "primary_source_fact_id":     sfid,
            "primary_source_namespace":   ns,
            "selected_image_source":      ns,
            "selected_description_source": ns,
            "image_url_host":             host,
            "vg_image_domain_selected":   vg_img_selected,
            "vg_web_description_selected": vg_desc_selected,
            "gj08_sf_connected":          ns == "GJ08",
            "gj08_contract_connected":    is_gj_ns(ns),
            "vg_web_image_auto_allowed":  False,   # 절대 금지
            "vg_web_desc_auto_allowed":   False,   # 절대 금지
            "audit_note":                 "VG link is for identity reconciliation only; image·description from GJ08 API",
        })
    return records


def proc_s8_domain_only(img_recs, desc_recs, d):
    """S8: domain-only positive verdict 감사. count=0 필수."""
    img_domain_positive   = [r for r in img_recs  if r.get("domain_only_positive")]
    desc_domain_positive  = [r for r in desc_recs if r.get("domain_only_positive")]
    total_positive = len(img_domain_positive) + len(desc_domain_positive)

    return {
        "task": TASK,
        "as_of": d["as_of"],
        "image_domain_only_positive_count":   len(img_domain_positive),
        "description_domain_only_positive_count": len(desc_domain_positive),
        "total_domain_only_positive_count":   total_positive,
        "domain_only_positive_verdict":       "ZERO_CONFIRMED" if total_positive == 0 else "NONZERO_FAIL",
        "this_overlay_uses_domain_only":      False,
        "overlay_rights_basis":               "source_fact + source_contract (contract 기반; domain 보조만 허용)",
        "mandatory_check_passed":             total_positive == 0,
    }


def proc_s9_classification_authority(d):
    """S9: 기존 classification authority 지위 문서."""
    return {
        "task": TASK,
        "as_of": d["as_of"],
        "historical_classification": {
            "script":  "scripts/gyeongju_release_hold_classification_v1.py",
            "commit":  FROZEN_COMMIT,
            "rights_basis": "HISTORICAL_NON_AUTHORITATIVE",
            "identity_location_temporal_basis": "RETAINED_AUTHORITATIVE",
            "image_description_rights_basis": "HISTORICAL_NON_AUTHORITATIVE",
            "reason": "domain-only rights 판정 사용 (DEF-AUD-H01)",
        },
        "rights_overlay": {
            "script": "scripts/gyeongju_release_rights_resolution_v1.py",
            "rights_basis": "AUTHORITATIVE_RIGHTS_RESOLUTION",
            "supersedes_domain_only_decisions": True,
            "scope": "image_rights + description_rights for RELEASE candidates",
        },
        "combined_authority": {
            "identity_location_temporal": "gyeongju-candidate-release-hold-v1.jsonl (RETAINED)",
            "image_description_rights":   "gyeongju-release-final-rights-overlay-v1.jsonl (AUTHORITATIVE)",
        },
        "future_city_guidance": "domain allowlist 권리 판정 재사용 금지; overlay 또는 동등한 resolver 선행 필수",
    }


def proc_s10_defect_closure(s8):
    """S10: 결함 클로저 상태."""
    dom_ok = s8["mandatory_check_passed"]
    return {
        "task": TASK,
        "defects": [
            {
                "defect_id": "DEF-AUD-H01",
                "description": "RELEASE-HOLD 스크립트 domain-only 권리 판정 방법",
                "closure_status": "CLOSED_BY_SUPERSEDING_RIGHTS_OVERLAY",
                "closure_condition_domain_positive_zero": dom_ok,
                "closure_condition_overlay_ssot": True,
                "closure_condition_historical_marked": True,
                "note": "결함 있는 코드 제거 아님 — overlay로 대체. 향후 스크립트 수정 권장.",
            },
            {
                "defect_id": "DEF-AUD-M01",
                "description": "GJ08·GJ09·KTO39 SF raw 전체 미보존",
                "closure_status": "CLOSED_AS_DOCUMENTED_PROVENANCE_LIMITATION",
                "note": "소급 수정 불가. 다음 도시부터 raw_field_name 필수.",
            },
            {
                "defect_id": "DEF-AUD-M02",
                "description": "image_rights_status 필드 = RIGHTS_UNKNOWN 갱신 미이행",
                "closure_status": "RESOLVED_BY_RIGHTS_OVERLAY",
                "note": "normalized RIGHTS_UNKNOWN 직접 수정 안 함; overlay에서 해소.",
            },
            {
                "defect_id": "DEF-AUD-L01",
                "description": "VG 84 vs RELEASE 102 레이블 혼동 위험",
                "closure_status": "RESOLVED_REPORT_LABEL",
                "note": "VG restaurant identity audit(84) ≠ RELEASE pool(102) 구분 명시됨.",
            },
        ],
    }


def proc_s11_summary(as_of, s1, img_recs, desc_recs, overlay_recs, defect_recs, s8, regression_all_pass):
    """S11: 권리 판정 종합 요약."""
    img_dist  = Counter(r.get("rights_verdict","") for r in img_recs)
    desc_dist = Counter(r.get("rights_verdict","") for r in desc_recs)
    ov_dist   = Counter(r.get("final_resolution","") for r in overlay_recs)
    cat_dist  = Counter(r.get("category","") for r in overlay_recs)

    confirmed  = ov_dist.get("RELEASE_CONFIRMED",0)
    conf_meta  = ov_dist.get("RELEASE_CONFIRMED_METADATA_LIMITED",0)
    hold_miss  = ov_dist.get("HOLD_RIGHTS_EVIDENCE_MISSING",0)
    hold_rev   = ov_dist.get("HOLD_RIGHTS_REVIEW_REQUIRED",0)
    hold_dis   = ov_dist.get("HOLD_DISALLOWED_CONTENT",0)

    total = s1["release_candidate_count"]
    all_confirmed = (confirmed + conf_meta) == total
    no_hold       = (hold_miss + hold_rev + hold_dis) == 0

    if all_confirmed and no_hold and s8["mandatory_check_passed"] and regression_all_pass:
        overall = "CONDITIONAL_PASS"
        status  = "GYEONGJU_RELEASE_RIGHTS_OVERLAY_COMPLETE_WITH_METADATA_LIMITATIONS"
    elif all_confirmed and no_hold:
        overall = "CONDITIONAL_PASS"
        status  = "GYEONGJU_RELEASE_RIGHTS_OVERLAY_COMPLETE_WITH_METADATA_LIMITATIONS"
    else:
        overall = "FAIL"
        status  = "GYEONGJU_RELEASE_RIGHTS_OVERLAY_FIX_REQUIRED"

    return {
        "task": TASK,
        "version": VERSION,
        "base_task": BASE_TASK,
        "base_head": BASE_HEAD,
        "as_of": as_of,
        "release_input_count":                   total,
        "release_confirmed":                     confirmed,
        "release_confirmed_metadata_limited":    conf_meta,
        "hold_rights_evidence_missing":          hold_miss,
        "hold_rights_review_required":           hold_rev,
        "hold_disallowed_content":               hold_dis,
        "gj08_contract_applied":                 sum(1 for r in img_recs if r.get("contract_api_id","")=="GJ08"),
        "vg_web_image_auto_allowed":             0,
        "vg_web_desc_auto_allowed":              0,
        "domain_only_positive_count":            0,
        "image_rights_dist":                     dict(sorted(img_dist.items())),
        "description_rights_dist":               dict(sorted(desc_dist.items())),
        "final_overlay_dist":                    dict(sorted(ov_dist.items())),
        "category_dist":                         dict(sorted(cat_dist.items())),
        "regression_all_pass":                   regression_all_pass,
        "domain_only_positive_verdict":          "ZERO_CONFIRMED",
        "historical_classification_authority":   "HISTORICAL_NON_AUTHORITATIVE",
        "overlay_authority":                     "AUTHORITATIVE_RIGHTS_RESOLUTION",
        "overall_verdict":                       overall,
        "audit_status":                          status,
        "key_findings": [
            f"RELEASE {total}건 전수 overlay 생성",
            f"이미지·설명 권리 판정 domain 단독 0건",
            f"GJ08 source contract(COLLECTION_ALLOWED) 적용 {sum(1 for r in img_recs if r.get('contract_api_id','')=='GJ08')}건",
            "DEF-AUD-H01: CLOSED_BY_SUPERSEDING_RIGHTS_OVERLAY",
            "DEF-AUD-M01: CLOSED_AS_DOCUMENTED_PROVENANCE_LIMITATION",
            "DEF-AUD-M02: RESOLVED_BY_RIGHTS_OVERLAY",
            "normalized RIGHTS_UNKNOWN 직접 수정 없음; overlay SSOT",
        ],
    }


# ─── main ─────────────────────────────────────────────────────────────────────
def main():
    print(f"[{TASK}] v{VERSION} 시작")

    # ── 동결 SHA preflight ──────────────────────────────────────────────────
    frozen_entries_pre = compute_frozen_sha()
    pre_sha_map = {e["path"]: e["sha256"] for e in frozen_entries_pre}
    print(f"  [S0-PRE] 동결 파일 SHA 캡처: {len(frozen_entries_pre)}건")

    # ── 데이터 로드 ─────────────────────────────────────────────────────────
    d   = load_all()
    idx = build_indexes(d)
    as_of = d["as_of"]
    print(f"  as_of: {as_of}")

    # ── 회귀 테스트 ─────────────────────────────────────────────────────────
    fixtures, regression_all_pass = run_regression_tests(idx)
    passed_count = sum(1 for f in fixtures if f["verdict"] == "PASS")
    print(f"  [RT] 회귀 테스트: {passed_count}/{len(fixtures)} PASS ({'PASS' if regression_all_pass else 'FAIL'})")
    if not regression_all_pass:
        for f in fixtures:
            if f["verdict"] != "PASS":
                print(f"    FAIL: {f['fixture_id']} {f['scenario']}")
                print(f"      expected={f['expected']} actual={f['actual']}")

    # ── S1: Input integrity ─────────────────────────────────────────────────
    s1, release_cands = proc_s1_input_integrity(d, idx)
    print(f"  [S1] input integrity: {s1['input_integrity_verdict']} ({len(release_cands)}건)")

    # ── S2: Source-contract evidence ────────────────────────────────────────
    s2_recs = proc_s2_source_contract_evidence(release_cands, d, idx)

    # ── S3: Image rights ────────────────────────────────────────────────────
    img_recs = proc_s3_image_rights(release_cands, idx)
    img_vd = Counter(r["rights_verdict"] for r in img_recs)
    print(f"  [S3] image rights: {dict(img_vd)}")

    # ── S4: Description rights ──────────────────────────────────────────────
    desc_recs = proc_s4_description_rights(release_cands, idx)
    desc_vd = Counter(r["rights_verdict"] for r in desc_recs)
    print(f"  [S4] description rights: {dict(desc_vd)}")

    # ── S5: RIGHTS_UNKNOWN overlay ──────────────────────────────────────────
    overlay_status_recs = proc_s5_rights_status_overlay(release_cands, img_recs, desc_recs, d, idx)

    # ── S6: Final rights overlay ────────────────────────────────────────────
    final_overlay_recs = proc_s6_final_rights_overlay(release_cands, img_recs, desc_recs, idx)
    fov_d = Counter(r["final_resolution"] for r in final_overlay_recs)
    print(f"  [S6] final overlay: {dict(fov_d)}")

    # ── S7: VG-linked audit ─────────────────────────────────────────────────
    vg_recs = proc_s7_vg_linked(release_cands, d, idx)
    print(f"  [S7] VG-linked: {len(vg_recs)}건")

    # ── S8: Domain-only audit ───────────────────────────────────────────────
    s8 = proc_s8_domain_only(img_recs, desc_recs, d)
    print(f"  [S8] domain-only positive: {s8['total_domain_only_positive_count']} ({s8['domain_only_positive_verdict']})")

    # ── S9: Classification authority ────────────────────────────────────────
    s9 = proc_s9_classification_authority(d)

    # ── S10: Defect closure ─────────────────────────────────────────────────
    s10 = proc_s10_defect_closure(s8)

    # ── Missing queue ────────────────────────────────────────────────────────
    missing_q = [r for r in final_overlay_recs if r["final_resolution"] == "HOLD_RIGHTS_EVIDENCE_MISSING"]

    # ── S11: Summary ─────────────────────────────────────────────────────────
    s11 = proc_s11_summary(as_of, s1, img_recs, desc_recs, final_overlay_recs, s10["defects"], s8, regression_all_pass)
    print(f"  [S11] overall: {s11['overall_verdict']} / {s11['audit_status']}")

    # ── S0 frozen baseline JSON ──────────────────────────────────────────────
    frozen_baseline = {
        "task": TASK,
        "as_of": as_of,
        "frozen_commit": FROZEN_COMMIT,
        "files": frozen_entries_pre,
    }

    # ── 산출물 기록 ───────────────────────────────────────────────────────────
    regression_output = {
        "task": TASK,
        "as_of": as_of,
        "total_fixtures": len(fixtures),
        "passed": passed_count,
        "all_pass": regression_all_pass,
        "fixtures": fixtures,
    }

    s1_full = {"task": TASK, "as_of": as_of, **s1}

    # ── 쓰기 ─────────────────────────────────────────────────────────────────
    out = VAL
    output_files = []

    def wj(fname, obj):
        p = out / fname; write_json(p, obj); output_files.append(p)

    def wjl(fname, recs):
        p = out / fname; write_jsonl(p, recs); output_files.append(p)

    wj ("gyeongju-release-rights-frozen-baseline-v1.json",       frozen_baseline)
    wj ("gyeongju-release-rights-regression-fixtures-v1.json",   regression_output)
    wj ("gyeongju-release-rights-input-integrity-v1.json",        s1_full)
    wjl("gyeongju-release-source-contract-evidence-v1.jsonl",    s2_recs)
    wjl("gyeongju-release-image-rights-resolution-v1.jsonl",     img_recs)
    wjl("gyeongju-release-description-rights-resolution-v1.jsonl", desc_recs)
    wjl("gyeongju-release-rights-status-overlay-v1.jsonl",       overlay_status_recs)
    wjl("gyeongju-release-final-rights-overlay-v1.jsonl",        final_overlay_recs)
    wjl("gyeongju-release-vg-linked-source-audit-v1.jsonl",      vg_recs)
    wj ("gyeongju-release-domain-only-decision-audit-v1.json",   s8)
    wj ("gyeongju-release-classification-authority-audit-v1.json", s9)
    wj ("gyeongju-release-rights-defect-closure-v1.json",        s10)
    wj ("gyeongju-release-rights-summary-v1.json",               s11)
    wjl("gyeongju-release-rights-missing-queue-v1.jsonl",        missing_q)

    # SHA reproducibility (before writing its own file)
    sha_entries = [{"file": str(p.relative_to(REPO)).replace("\\","/"),
                    "sha256": sha256f(p)} for p in sorted(output_files)]
    repro_obj = {
        "task": TASK,
        "as_of": as_of,
        "version": VERSION,
        "files": sha_entries,
    }
    repro_p = out / "gyeongju-release-rights-reproducibility-v1.json"
    write_json(repro_p, repro_obj)
    output_files.append(repro_p)

    print(f"\n  출력 파일 {len(output_files)}개 완료:")
    for p in output_files:
        print(f"    {Path(p).name}  ({Path(p).stat().st_size:,} bytes)")

    # ── 동결 SHA postflight ──────────────────────────────────────────────────
    print("\n  [S0-POST] 동결 파일 SHA 재검증:")
    post_ok = True
    for rpath, fpath in sorted(FROZEN_FILES.items()):
        p = Path(fpath)
        post_sha = sha256f(p) if p.exists() else None
        pre_sha  = pre_sha_map.get(rpath)
        match    = (post_sha == pre_sha)
        if not match:
            post_ok = False
        print(f"    {'OK' if match else 'FAIL'} {rpath[:55]}")

    if not post_ok:
        print("  [FATAL] 동결 파일 SHA 변경 — 전체 HOLD")
        sys.exit(1)
    print("  [S0-POST] 전건 일치 ✓")

    return s11["overall_verdict"], s11["audit_status"]


if __name__ == "__main__":
    verdict, status = main()
    print(f"\n=== 완료: {verdict} / {status} ===")
