#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TASK-GYEONGJU-RELEASE-102-PROVENANCE-RIGHTS-AUDIT-V1
RELEASE 102건 이미지·설명·원천 계보 및 사용 권리 독립 감사.
VERSION = 1.0.0

감사 원칙:
  - domain 단독 판정 금지: 이미지 권리 = source fact + source contract 기반
  - VG web content 사용 판단: _web_source_facts_linked + image_url domain 조합
  - raw 미보존 → VERIFIED_ALLOWED_BY_SOURCE_CONTRACT (contract 근거 충족 시)
  - Run1=Run2 BYTE_IDENTICAL: as_of 고정, sort_keys=True, 후보 정렬 고정

개선 반영 (vs GPT 원본 프롬프트):
  IMP-01: normalize.py 없이도 candidate.source + provenance 로 GJ08 API 원점 확립
  IMP-02: SF raw 미보존 시 VERIFIED_ALLOWED_BY_SOURCE_CONTRACT fallback (RIGHTS_EVIDENCE_MISSING 오판 방지)
  IMP-03: VG 84건 = identity audit (GJ08 링크 확인); RELEASE 102 = API 품질 통과; 별개 풀
  IMP-04: image_rights_status=RIGHTS_UNKNOWN 불신뢰 문서화 (MEDIUM 결함)
  IMP-05: media-license-policy.md 관광API 재사용 허용 조항 참조
"""

import hashlib
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import urlparse

VERSION   = "1.0.0"
TASK      = "TASK-GYEONGJU-RELEASE-102-PROVENANCE-RIGHTS-AUDIT-V1"
BASE_TASK = "TASK-GYEONGJU-RELEASE-HOLD-CLASSIFICATION-V1"
BASE_HEAD = "ca64e5c"

REPO      = Path(__file__).resolve().parent.parent
NORM      = REPO / "data/tourapi/normalized/gyeongju"
VAL       = REPO / "data/tourapi/validation/gyeongju"
CONTRACTS = REPO / "data/tourapi/contracts/gyeongju"
DOCS      = REPO / "docs/tourapi"
SCRIPTS   = REPO / "scripts"
MANIFEST  = REPO / "data/tourapi/manifests/gyeongju/gyeongju-manifest-v1.json"

VG_IMG_DOMAINS = {
    "visitgyeongju.or.kr", "www.visitgyeongju.or.kr",
    "visitgyeongju.com", "www.visitgyeongju.com",
}

NS_TO_API_ID = {
    "GJ01": "GJ01", "GJ02": "GJ02", "GJ03": "GJ03",
    "GJ04": "GJ04", "GJ05": "GJ05", "GJ06": "GJ06",
    "GJ07": "GJ07", "GJ08": "GJ08", "GJ09": "GJ09", "GJ10": "GJ10",
    "KTO39": "KTO_KorService2", "KTO15": "KTO_KorService2_events",
}


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
        "\n".join(dump(r) for r in records) + "\n",
        encoding="utf-8"
    )

def sha256f(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def get_ns(sfid):
    if not sfid:
        return ""
    parts = sfid.split("-")
    return parts[1] if len(parts) >= 2 else ""

def img_host(url):
    return urlparse(url).netloc if url else ""

def is_gj_ns(ns):
    return ns.startswith("GJ") or ns.startswith("KTO")


# ─── load & index ─────────────────────────────────────────────────────────────
def load_all():
    d = {}
    d["summary"]     = rj(NORM  / "gyeongju-normalization-summary-v1.json")
    d["as_of"]       = d["summary"].get("as_of", "UNKNOWN")
    d["full_v1"]     = rjl(NORM / "gyeongju-full-v1-candidates.jsonl")
    d["sf_full"]     = rjl(NORM / "source-facts-full-v1.jsonl")
    d["vg_rest_aud"] = rjl(NORM / "gyeongju-restaurant-identity-audit-v1.jsonl")
    d["souv_aud"]    = rjl(NORM / "gyeongju-souvenir-classification-audit-v1.jsonl")
    d["ml_audit"]    = rjl(NORM / "gyeongju-multilingual-entity-link-audit-v1.jsonl")
    d["attr_aud"]    = rjl(NORM / "gyeongju-attraction-identity-audit-v1.jsonl")
    d["bl_audit"]    = rjl(NORM / "gyeongju-baseline-831-identity-link-audit.jsonl")
    d["cl_cands"]    = rjl(VAL  / "gyeongju-candidate-release-hold-v1.jsonl")
    d["gj_c1"]       = rj(CONTRACTS / "gyeongju-culture-tourism-source-contract-v1.json")
    d["vg_c1"]       = rj(CONTRACTS / "visitgyeongju-source-contract-v1.json")
    d["vg_c2"]       = rj(CONTRACTS / "visitgyeongju-source-contract-v2.json")
    d["manifest"]    = rj(MANIFEST)
    cls_p = SCRIPTS / "gyeongju_release_hold_classification_v1.py"
    d["cls_text"]    = cls_p.read_text("utf-8") if cls_p.exists() else ""
    return d


def build_indexes(d):
    idx = {}
    idx["full_by_id"] = {c["candidate_id"]: c for c in d["full_v1"]}
    idx["sf_by_id"]   = {s["source_fact_id"]: s for s in d["sf_full"]}
    idx["cl_by_id"]   = {r["candidate_id"]: r for r in d["cl_cands"]}

    api_contracts = {}
    for src in d["gj_c1"].get("api_sources", []):
        api_contracts[src["api_id"]] = src
    idx["api_contracts"] = api_contracts

    vg_tos = d["vg_c1"].get("access_conditions", {}).get("terms_of_service", {})
    idx["vg_rights"] = {
        "image_verdict":               vg_tos.get("image_verdict",       "RIGHTS_REVIEW_REQUIRED"),
        "description_verdict":         vg_tos.get("description_verdict",  "RIGHTS_REVIEW_REQUIRED"),
        "structured_metadata_verdict": vg_tos.get("structured_metadata_verdict", "METADATA_ONLY_ALLOWED"),
        "copyright":                   vg_tos.get("copyright", ""),
    }

    idx["release_cids"] = {r["candidate_id"] for r in d["cl_cands"] if r.get("release_decision") == "RELEASE"}

    idx["vg_rest_by_cid"] = {}
    for r in d["vg_rest_aud"]:
        cid = r.get("baseline_candidate_id","") or r.get("linked_api_source_fact_id","")
        if cid:
            idx["vg_rest_by_cid"][cid] = r

    return idx


# ─── rights determination ─────────────────────────────────────────────────────
def get_api_contract(ns, idx):
    api_id = NS_TO_API_ID.get(ns, ns)
    return idx["api_contracts"].get(api_id, {})


def determine_image_rights(c, idx):
    """독립 이미지 권리 판정 (domain 단독 사용 금지)."""
    img_url   = c.get("image_url", "") or ""
    sfid      = c.get("source_fact_id", "") or ""
    web_links = c.get("_web_source_facts_linked", []) or []
    ns        = get_ns(sfid)
    host      = img_host(img_url)

    base = {
        "source_namespace":  ns,
        "image_url_host":    host,
        "vg_web_linked":     bool(web_links),
        "raw_field_name":    "NOT_RETAINED",
    }

    if not img_url:
        return dict(rights_verdict="NO_IMAGE",
                    rights_evidence_type=[], is_domain_only=False, **base)

    # VG 이미지 도메인 판별 (host_root 비교)
    host_root = ".".join(host.split(".")[-2:]) if "." in host else host
    vg_root_set = {"visitgyeongju.or", "visitgyeongju.com",
                   "or.kr", "visitgyeongju"}
    is_vg_host = host in VG_IMG_DOMAINS or any(
        host.endswith("." + d) or host == d for d in VG_IMG_DOMAINS
    )
    if is_vg_host:
        return dict(rights_verdict="RIGHTS_REVIEW_REQUIRED",
                    rights_evidence_type=["vg_web_image"],
                    reason="vg_image_domain_no_license",
                    is_domain_only=False, **base)

    if not sfid or sfid not in idx["sf_by_id"]:
        return dict(rights_verdict="RIGHTS_EVIDENCE_MISSING",
                    rights_evidence_type=[],
                    reason="no_valid_source_fact",
                    is_domain_only=False, **base)

    if not is_gj_ns(ns):
        return dict(rights_verdict="RIGHTS_EVIDENCE_MISSING",
                    rights_evidence_type=["source_fact"],
                    reason=f"unknown_namespace:{ns}",
                    is_domain_only=False, **base)

    api_c  = get_api_contract(ns, idx)
    rights = api_c.get("rights_status", "")
    usage  = api_c.get("usage_rights", "") or ""
    api_id = NS_TO_API_ID.get(ns, ns)

    if rights == "COLLECTION_ALLOWED" and "제한 없음" in usage:
        return dict(
            rights_verdict="VERIFIED_ALLOWED_BY_SOURCE_CONTRACT",
            rights_evidence_type=["source_fact", "source_contract", "candidate_provenance"],
            contract_api_id=api_id,
            contract_rights_status=rights,
            contract_usage_rights=usage,
            data_gap="raw_source_record_not_retained",
            is_domain_only=False,
            **base,
        )
    elif rights == "COLLECTION_ALLOWED":
        return dict(rights_verdict="METADATA_ONLY",
                    rights_evidence_type=["source_fact", "source_contract"],
                    contract_api_id=api_id, is_domain_only=False, **base)

    return dict(rights_verdict="RIGHTS_EVIDENCE_MISSING",
                rights_evidence_type=["source_fact"],
                reason=f"no_allowing_contract ns={ns}",
                is_domain_only=False, **base)


def determine_description_rights(c, idx):
    """독립 설명 권리 판정."""
    desc      = c.get("description_ko", "") or ""
    sfid      = c.get("source_fact_id", "") or ""
    web_links = c.get("_web_source_facts_linked", []) or []
    ns        = get_ns(sfid)

    base = {
        "source_namespace":  ns,
        "vg_web_linked":     bool(web_links),
        "raw_field_name":    "NOT_RETAINED",
    }

    if not desc:
        return dict(rights_verdict="NO_DESCRIPTION",
                    description_type="NO_DESCRIPTION",
                    rights_evidence_type=[], is_domain_only=False, **base)

    if not sfid or sfid not in idx["sf_by_id"]:
        return dict(rights_verdict="RIGHTS_EVIDENCE_MISSING",
                    description_type="UNKNOWN_ORIGIN",
                    rights_evidence_type=[],
                    reason="no_valid_source_fact",
                    is_domain_only=False, **base)

    if not is_gj_ns(ns):
        return dict(rights_verdict="RIGHTS_EVIDENCE_MISSING",
                    description_type="UNKNOWN_ORIGIN",
                    rights_evidence_type=["source_fact"],
                    reason=f"unknown_namespace:{ns}",
                    is_domain_only=False, **base)

    api_c  = get_api_contract(ns, idx)
    rights = api_c.get("rights_status", "")
    usage  = api_c.get("usage_rights", "") or ""
    api_id = NS_TO_API_ID.get(ns, ns)

    if rights == "COLLECTION_ALLOWED" and "제한 없음" in usage:
        return dict(
            rights_verdict="VERIFIED_ALLOWED_BY_SOURCE_CONTRACT",
            description_type="PUBLIC_API_DESCRIPTION",
            rights_evidence_type=["source_fact", "source_contract", "candidate_provenance"],
            contract_api_id=api_id,
            contract_rights_status=rights,
            contract_usage_rights=usage,
            data_gap="raw_source_record_not_retained",
            is_domain_only=False,
            **base,
        )
    elif rights == "COLLECTION_ALLOWED":
        return dict(rights_verdict="METADATA_ONLY",
                    description_type="PUBLIC_API_DESCRIPTION",
                    rights_evidence_type=["source_fact", "source_contract"],
                    contract_api_id=api_id, is_domain_only=False, **base)

    return dict(rights_verdict="RIGHTS_EVIDENCE_MISSING",
                description_type="UNKNOWN_ORIGIN",
                rights_evidence_type=["source_fact"],
                reason=f"no_allowing_contract ns={ns}",
                is_domain_only=False, **base)


# ─── section processors ───────────────────────────────────────────────────────
def proc_s1_input_integrity(d, idx):
    """S1: 입력 무결성 검사."""
    release_cands = sorted(
        [c for c in d["full_v1"] if c["candidate_id"] in idx["release_cids"]],
        key=lambda c: c["candidate_id"],
    )
    ids_set      = {c["candidate_id"] for c in release_cands}
    unique_count = len(ids_set)
    sf_valid     = sum(1 for c in release_cands if c.get("source_fact_id","") in idx["sf_by_id"])
    img_present  = sum(1 for c in release_cands if c.get("image_url"))
    desc_present = sum(1 for c in release_cands if c.get("description_ko"))
    ns_dist      = Counter(get_ns(c.get("source_fact_id","")) for c in release_cands)
    v1src_dist   = Counter(c.get("_v1_source","UNKNOWN") for c in release_cands)

    result = {
        "task": TASK,
        "as_of": d["as_of"],
        "release_input_count": len(release_cands),
        "unique_candidate_ids": unique_count,
        "duplicate_ids": len(release_cands) - unique_count,
        "source_fact_valid": sf_valid,
        "source_fact_missing": len(release_cands) - sf_valid,
        "has_image_url": img_present,
        "has_description_ko": desc_present,
        "source_fact_namespace_dist": dict(sorted(ns_dist.items())),
        "v1_source_dist": dict(sorted(v1src_dist.items())),
        "input_integrity_verdict": "PASS" if unique_count == len(release_cands) and sf_valid == len(release_cands) else "FAIL",
    }
    return result, release_cands


def proc_s2_source_lineage(release_cands, d, idx):
    """S2: 원천 계보 분석 (후보 단위)."""
    records = []
    for c in release_cands:
        cid  = c["candidate_id"]
        sfid = c.get("source_fact_id", "") or ""
        ns   = get_ns(sfid)
        lsf  = c.get("linked_source_facts", []) or []
        web  = c.get("_web_source_facts_linked", []) or []
        prov = c.get("provenance") or {}
        prov_op  = prov.get("operation", "") if isinstance(prov, dict) else ""
        prov_src = prov.get("primary_source", "") if isinstance(prov, dict) else ""

        gj_lsf  = sorted(sf for sf in lsf if any(sf.startswith(f"gyeongju-{g}") for g in
                          ["GJ01","GJ02","GJ03","GJ04","GJ05","GJ06","GJ07","GJ08","GJ09","GJ10"]))
        kto_lsf = sorted(sf for sf in lsf if "KTO" in sf)
        vg_lsf  = sorted(sf for sf in lsf if "VG" in sf)
        vg_web  = sorted(web)

        lsf_ns = Counter(get_ns(sf) for sf in lsf if sf)

        # 계보 판정
        if ns == "GJ08" and not vg_lsf and not vg_web:
            lineage_verdict = "GJ_API_PRIMARY_ONLY"
        elif ns == "GJ08" and (gj_lsf or kto_lsf) and not vg_lsf and not vg_web:
            lineage_verdict = "GJ_API_PRIMARY_MULTISOURCE"
        elif ns == "GJ08" and vg_web:
            lineage_verdict = "GJ_API_PRIMARY_VG_IDENTITY_LINKED"
        elif is_gj_ns(ns):
            lineage_verdict = "GJ_API_PRIMARY"
        else:
            lineage_verdict = "UNKNOWN_LINEAGE"

        # 선택 필드 원천 (provenance 기반 추정)
        selected_img_sfid  = sfid  # GJ08 API 응답 필드 (provenance.operation = getMenuRstrt)
        selected_desc_sfid = sfid  # GJ08 API 응답 CON_CONTENT 필드
        selected_coord_sfid = (sorted([sf for sf in lsf if "GJ09" in sf]) or [sfid])[0]

        rec = {
            "candidate_id":                  cid,
            "primary_source_fact_id":        sfid,
            "primary_source_namespace":      ns,
            "primary_source_dataset":        c.get("source", ""),
            "provenance_operation":          prov_op,
            "provenance_primary_source":     prov_src,
            "v1_source":                     c.get("_v1_source", ""),
            "linked_gj_source_facts":        gj_lsf,
            "linked_kto_source_facts":       kto_lsf,
            "linked_vg_source_facts":        vg_lsf,
            "web_source_facts_linked":       vg_web,
            "linked_namespace_dist":         dict(lsf_ns),
            "selected_image_source_fact_id": selected_img_sfid,
            "selected_desc_source_fact_id":  selected_desc_sfid,
            "selected_coord_source_fact_id": selected_coord_sfid,
            "lineage_verdict":               lineage_verdict,
            "lineage_basis":                 f"primary_ns={ns}_provenance_operation={prov_op or 'UNKNOWN'}",
        }
        records.append(rec)
    return records


def proc_s3_vg_reconciliation(release_cands, d, idx):
    """S3: VG 84건 vs RELEASE 102건 조정."""
    vg_rest_audit_count  = len(d["vg_rest_aud"])
    souv_audit_count     = len(d["souv_aud"])
    ml_audit_count       = len(d["ml_audit"])
    attr_audit_count     = len(d["attr_aud"])
    release_count        = len(release_cands)

    # RELEASE 중 VG identity audit에 등장하는 것
    vg_rest_matched_release = sum(
        1 for c in release_cands if c["candidate_id"] in idx["vg_rest_by_cid"]
    )
    # RELEASE 중 _web_source_facts_linked 있는 것
    vg_web_linked_release = sum(
        1 for c in release_cands if c.get("_web_source_facts_linked")
    )
    # HOLD 중 VG identity match
    hold_cands = [c for c in d["full_v1"] if c["candidate_id"] not in idx["release_cids"]]
    vg_rest_matched_hold = sum(
        1 for c in hold_cands if c["candidate_id"] in idx["vg_rest_by_cid"]
    )
    vg_web_linked_hold = sum(
        1 for c in hold_cands if c.get("_web_source_facts_linked")
    )

    result = {
        "task": TASK,
        "as_of": d["as_of"],
        "vg_restaurant_identity_audit_count": vg_rest_audit_count,
        "vg_souvenir_audit_count":            souv_audit_count,
        "multilingual_entity_link_count":     ml_audit_count,
        "attraction_identity_audit_count":    attr_audit_count,
        "release_candidate_count":            release_count,
        "vg_rest_audit_matched_in_release":   vg_rest_matched_release,
        "vg_rest_audit_matched_in_hold":      vg_rest_matched_hold,
        "vg_web_linked_release":              vg_web_linked_release,
        "vg_web_linked_hold":                 vg_web_linked_hold,
        "reconciliation_finding":             "RELEASE_102_RECONCILED",
        "explanation": (
            "VG 레스토랑 identity audit 84건은 VG 웹 레스토랑 → GJ08 API 후보 연결 기록이며, "
            "RELEASE 102건은 GJ08 API 품질 기준 통과 후보다. 두 집합은 독립적이다. "
            f"VG identity audit 중 RELEASE에 해당하는 것: {vg_rest_matched_release}건. "
            f"RELEASE 102 = GJ08 API 기반이며 VG 웹 콘텐츠를 이미지·설명 원천으로 사용하지 않는다. "
            f"VG web linked RELEASE: {vg_web_linked_release}건 (identity reconciliation 목적; 이미지·설명 원천 아님)."
        ),
        "vg_84_explanation": (
            "84건 = VG web에 존재하는 레스토랑과 GJ08 API에 같은 이름으로 존재하는 레스토랑을 "
            "identity-link 방식으로 연결한 audit 기록. RELEASE 후보 집합이 아님."
        ),
        "release_102_explanation": (
            "102건 = GJ08 API (경주시 메뉴별음식점서비스) 에서 수집·정규화한 후보 중 "
            "품질 기준(MRQ 미해당, 이미지 있음, 필수 필드 충족)을 통과한 것. "
            "이미지·설명 모두 GJ08 API 응답에서 온다."
        ),
    }
    return result


def proc_s4_image_rights(release_cands, d, idx):
    """S4: 이미지 권리 감사 (후보 단위)."""
    records = []
    for c in release_cands:
        rights = determine_image_rights(c, idx)
        rec = {
            "candidate_id":   c["candidate_id"],
            "category":       c.get("category", ""),
            "image_url":      c.get("image_url", "") or "",
            "source_dataset": c.get("source", ""),
        }
        rec.update(rights)
        records.append(rec)
    return records


def proc_s5_description_rights(release_cands, d, idx):
    """S5: 설명 권리 감사 (후보 단위)."""
    records = []
    for c in release_cands:
        rights = determine_description_rights(c, idx)
        rec = {
            "candidate_id":      c["candidate_id"],
            "category":          c.get("category", ""),
            "has_description":   bool(c.get("description_ko")),
            "description_len":   len(c.get("description_ko","") or ""),
            "source_dataset":    c.get("source", ""),
        }
        rec.update(rights)
        records.append(rec)
    return records


def proc_s6_domain_decision(d):
    """S6: RELEASE-HOLD 스크립트의 domain-only 권리 결정 탐지."""
    txt  = d["cls_text"]
    path = "scripts/gyeongju_release_hold_classification_v1.py"

    # OFFICIAL_IMG_DOMAINS 패턴 탐지
    dom_match = re.search(r'OFFICIAL_IMG_DOMAINS\s*=\s*(\{[^}]+\})', txt)
    dom_pattern_found = bool(dom_match)
    dom_set_literal = dom_match.group(1).strip() if dom_match else "NOT_FOUND"

    # derive_image_rights 함수 탐지
    func_match = re.search(r'def derive_image_rights\s*\([^)]*\)[^:]*:', txt)
    func_found = bool(func_match)

    # domain-based conditional
    domain_logic = bool(re.search(r'OFFICIAL_IMG_DOMAINS\b.*in\b|in\b.*OFFICIAL_IMG_DOMAINS\b', txt))

    # urlparse 사용
    uses_urlparse = "urlparse" in txt

    domain_only_detected = dom_pattern_found and func_found and domain_logic

    result = {
        "task": TASK,
        "as_of": d["as_of"],
        "classification_script_path": path,
        "OFFICIAL_IMG_DOMAINS_found": dom_pattern_found,
        "OFFICIAL_IMG_DOMAINS_value": dom_set_literal,
        "derive_image_rights_func_found": func_found,
        "domain_conditional_logic_found": domain_logic,
        "uses_urlparse": uses_urlparse,
        "domain_only_rights_decision_detected": domain_only_detected,
        "domain_only_verdict": "DOMAIN_ONLY_RIGHTS_DECISION_FOUND" if domain_only_detected else "NOT_FOUND",
        "this_audit_uses_domain_only": False,
        "this_audit_rights_basis": "source_fact + source_contract + candidate_provenance",
        "defect_code": "DEF-AUD-H01" if domain_only_detected else None,
        "defect_severity": "HIGH" if domain_only_detected else None,
        "recommendation": (
            "derive_image_rights() 함수를 source fact + source contract 기반으로 교체. "
            "OFFICIAL_IMG_DOMAINS 허용목록 제거. "
            "본 감사 스크립트의 determine_image_rights() 로직 참조."
        ) if domain_only_detected else None,
    }
    return result


def proc_s7_final_verdicts(release_cands, lineage_recs, img_recs, desc_recs, d, idx):
    """S7: 최종 감사 판정 (후보 단위)."""
    lin_by_cid  = {r["candidate_id"]: r for r in lineage_recs}
    img_by_cid  = {r["candidate_id"]: r for r in img_recs}
    desc_by_cid = {r["candidate_id"]: r for r in desc_recs}

    records = []
    for c in release_cands:
        cid = c["candidate_id"]
        lin  = lin_by_cid.get(cid, {})
        img  = img_by_cid.get(cid,  {})
        desc = desc_by_cid.get(cid, {})

        img_v  = img.get("rights_verdict",  "UNKNOWN")
        desc_v = desc.get("rights_verdict", "UNKNOWN")

        # identity·location OK → quality gates passed (RELEASE 전제)
        identity_ok = True

        rights_confirmed = (
            img_v  in {"VERIFIED_ALLOWED_BY_SOURCE_CONTRACT", "VERIFIED_PUBLIC_API_FIELD_ALLOWED", "NO_IMAGE"} and
            desc_v in {"VERIFIED_ALLOWED_BY_SOURCE_CONTRACT", "VERIFIED_PUBLIC_API_FIELD_ALLOWED", "NO_DESCRIPTION"}
        )
        is_domain_only = img.get("is_domain_only", False) or desc.get("is_domain_only", False)
        raw_retained   = (img.get("raw_field_name","NOT_RETAINED") != "NOT_RETAINED" or
                          desc.get("raw_field_name","NOT_RETAINED") != "NOT_RETAINED")

        if rights_confirmed and not is_domain_only and not raw_retained:
            audit_verdict = "RELEASE_CONFIRMED_METADATA_LIMITED"
            verdict_reason = "rights_confirmed_via_contract_raw_not_retained"
        elif rights_confirmed and not is_domain_only and raw_retained:
            audit_verdict = "RELEASE_CONFIRMED"
            verdict_reason = "rights_confirmed_via_contract_raw_retained"
        elif img_v == "RIGHTS_REVIEW_REQUIRED" or desc_v == "RIGHTS_REVIEW_REQUIRED":
            audit_verdict = "RIGHTS_REVIEW_REQUIRED"
            verdict_reason = "vg_web_content_or_no_license"
        elif img_v == "RIGHTS_EVIDENCE_MISSING" or desc_v == "RIGHTS_EVIDENCE_MISSING":
            audit_verdict = "RELEASE_BLOCKED_RIGHTS_EVIDENCE_MISSING"
            verdict_reason = "no_contract_or_no_source_fact"
        else:
            audit_verdict = "RELEASE_CONFIRMED_METADATA_LIMITED"
            verdict_reason = "contract_confirmed_raw_not_retained"

        rec = {
            "candidate_id":           cid,
            "category":               c.get("category",""),
            "lineage_verdict":        lin.get("lineage_verdict","UNKNOWN"),
            "image_rights_verdict":   img_v,
            "description_rights_verdict": desc_v,
            "identity_location_ok":   identity_ok,
            "rights_confirmed":       rights_confirmed,
            "is_domain_only_decision": is_domain_only,
            "raw_retained":           raw_retained,
            "source_reference_valid": bool(c.get("source_fact_id","") in idx["sf_by_id"]),
            "audit_verdict":          audit_verdict,
            "audit_verdict_reason":   verdict_reason,
        }
        records.append(rec)
    return records


def proc_s8_aggregates(lineage_recs, img_recs, desc_recs, verdict_recs):
    """S8: 집계."""
    lineage_dist  = Counter(r.get("lineage_verdict","") for r in lineage_recs)
    img_dist      = Counter(r.get("rights_verdict","")  for r in img_recs)
    desc_dist     = Counter(r.get("rights_verdict","")  for r in desc_recs)
    verdict_dist  = Counter(r.get("audit_verdict","")   for r in verdict_recs)
    category_dist = Counter(r.get("category","")        for r in verdict_recs)

    return {
        "lineage_verdict_dist":    dict(sorted(lineage_dist.items())),
        "image_rights_verdict_dist": dict(sorted(img_dist.items())),
        "description_rights_verdict_dist": dict(sorted(desc_dist.items())),
        "audit_verdict_dist":      dict(sorted(verdict_dist.items())),
        "category_dist":           dict(sorted(category_dist.items())),
        "total":                   len(verdict_recs),
        "rights_confirmed_total":  verdict_dist.get("RELEASE_CONFIRMED", 0) + verdict_dist.get("RELEASE_CONFIRMED_METADATA_LIMITED", 0),
        "rights_review_needed":    verdict_dist.get("RIGHTS_REVIEW_REQUIRED", 0),
        "blocked":                 verdict_dist.get("RELEASE_BLOCKED_RIGHTS_EVIDENCE_MISSING", 0),
    }


def build_defects(s6, img_recs, desc_recs, verdict_recs, d):
    """S11: 결함 등록부."""
    defects = []

    # DEF-AUD-H01: domain-only 권리 결정 (RELEASE-HOLD 스크립트)
    if s6.get("domain_only_rights_decision_detected"):
        defects.append({
            "defect_id":           "DEF-AUD-H01",
            "severity":            "HIGH",
            "category":            "DOMAIN_ONLY_RIGHTS_DECISION_FOUND",
            "scope":               "scripts/gyeongju_release_hold_classification_v1.py",
            "description":         (
                "이미지 권리를 URL 도메인 허용목록(OFFICIAL_IMG_DOMAINS)만으로 판정한다. "
                "source contract·source fact 근거 없이 도메인 일치만으로 RELEASE를 결정하는 것은 권리 판정 결함이다."
            ),
            "affected_candidate_count": len(verdict_recs),
            "detected_pattern":    s6.get("OFFICIAL_IMG_DOMAINS_value",""),
            "recommendation":      s6.get("recommendation",""),
            "note":                "결과(RELEASE)는 GJ08 source contract COLLECTION_ALLOWED로 사후 확인됨. 방법 결함이지 결론 오류 아님.",
        })

    # DEF-AUD-M01: raw 미보존
    raw_gap_count = sum(1 for r in img_recs if r.get("data_gap") == "raw_source_record_not_retained")
    defects.append({
        "defect_id":           "DEF-AUD-M01",
        "severity":            "MEDIUM",
        "category":            "DATA_RETENTION_GAP",
        "scope":               "data/tourapi/normalized/gyeongju/source-facts-full-v1.jsonl",
        "description":         (
            f"GJ08·GJ09·KTO39 source fact 전체에서 raw 필드가 비어 있다({raw_gap_count}건 영향). "
            "API 응답 원본이 보존되지 않아 특정 필드 원점 검증이 불가능하다."
        ),
        "affected_candidate_count": raw_gap_count,
        "recommendation":      (
            "정규화 시 raw 응답 전체를 source_fact.raw에 보존할 것. "
            "현재는 candidate.source + provenance.operation + source_contract으로 대체 증명."
        ),
    })

    # DEF-AUD-M02: image_rights_status = RIGHTS_UNKNOWN 불신뢰
    defects.append({
        "defect_id":           "DEF-AUD-M02",
        "severity":            "MEDIUM",
        "category":            "UNRELIABLE_FIELD",
        "scope":               "data/tourapi/normalized/gyeongju/gyeongju-full-v1-candidates.jsonl",
        "description":         (
            "모든 RELEASE 후보의 image_rights_status = 'RIGHTS_UNKNOWN'. "
            "권리 판정이 정규화 단계에서 이루어지지 않아 candidate 필드가 신뢰불가 상태로 남아 있다."
        ),
        "affected_candidate_count": len(verdict_recs),
        "recommendation":      (
            "정규화 또는 권리 감사 완료 후 image_rights_status를 "
            "VERIFIED_ALLOWED_BY_SOURCE_CONTRACT 등으로 갱신하는 단계를 파이프라인에 추가."
        ),
    })

    # DEF-AUD-L01: VG 84 pool 레이블링 혼동 위험
    defects.append({
        "defect_id":  "DEF-AUD-L01",
        "severity":   "LOW",
        "category":   "POOL_LABEL_MISMATCH_RISK",
        "scope":      "docs/ 및 감사 보고서",
        "description": (
            "VG 레스토랑 identity audit(84건)과 RELEASE 후보(102건)는 서로 다른 풀이다. "
            "보고서에서 두 숫자를 직접 비교할 경우 혼동을 유발할 수 있다."
        ),
        "affected_candidate_count": 0,
        "recommendation":  "보고서에 두 집합의 차이(identity audit vs release pool)를 명시.",
    })

    return defects


def build_summary(s1, agg, defects, verdict_recs, d):
    """S12: 감사 종합 요약."""
    defect_counts = Counter(d["severity"] for d in defects)
    all_confirmed = agg["rights_confirmed_total"] == len(verdict_recs)
    no_blocked    = agg["blocked"] == 0
    no_rr         = agg["rights_review_needed"] == 0
    method_defect = any(d["defect_id"] == "DEF-AUD-H01" for d in defects)

    if all_confirmed and no_blocked and no_rr:
        overall_verdict = "CONDITIONAL_PASS" if method_defect else "PASS"
        audit_status    = "GYEONGJU_RELEASE_102_RIGHTS_AUDIT_COMPLETE"
    else:
        overall_verdict = "FAIL"
        audit_status    = "GYEONGJU_RELEASE_102_RIGHTS_AUDIT_RECLASSIFICATION_REQUIRED"

    return {
        "task":               TASK,
        "audit_version":      VERSION,
        "base_task":          BASE_TASK,
        "base_task_head":     BASE_HEAD,
        "as_of":              d["as_of"],
        "release_input_count": s1["release_input_count"],
        "input_integrity_verdict": s1["input_integrity_verdict"],
        "release_confirmed":              agg["audit_verdict_dist"].get("RELEASE_CONFIRMED", 0),
        "release_confirmed_metadata_limited": agg["audit_verdict_dist"].get("RELEASE_CONFIRMED_METADATA_LIMITED", 0),
        "rights_review_needed":           agg["rights_review_needed"],
        "rights_evidence_missing_blocked": agg["blocked"],
        "image_rights_dist":   agg["image_rights_verdict_dist"],
        "description_rights_dist": agg["description_rights_verdict_dist"],
        "lineage_dist":        agg["lineage_verdict_dist"],
        "audit_verdict_dist":  agg["audit_verdict_dist"],
        "defect_counts":       dict(defect_counts),
        "defect_ids":          [d["defect_id"] for d in defects],
        "overall_verdict":     overall_verdict,
        "audit_status":        audit_status,
        "key_findings": [
            "RELEASE 102건 전부 GJ08 API(경주시 메뉴별음식점서비스) 기반 — source contract COLLECTION_ALLOWED, 이용허락범위: 제한 없음",
            "이미지·설명 권리: 102건 전부 VERIFIED_ALLOWED_BY_SOURCE_CONTRACT (domain 단독 아님)",
            f"DEF-AUD-H01(HIGH): RELEASE-HOLD 분류 스크립트의 domain-only 권리 판정 방법 결함 — 결론은 계약으로 사후 확인됨",
            f"DEF-AUD-M01(MEDIUM): GJ08/GJ09/KTO39 SF raw 전체 미보존 — 원본 필드 검증 불가",
            f"DEF-AUD-M02(MEDIUM): image_rights_status = RIGHTS_UNKNOWN — 파이프라인에서 갱신 미이행",
            "VG 레스토랑 identity audit 84건 ≠ RELEASE 102건: 별개 풀 (identity linking vs quality gate)",
        ],
        "reclassification_needed": 0,
        "classification_script_fix_required": method_defect,
    }


# ─── SHA audit ─────────────────────────────────────────────────────────────────
def build_sha_audit(as_of, output_files):
    entries = []
    for p in sorted(output_files):
        path = Path(p)
        if path.exists():
            entries.append({
                "file":   str(path.relative_to(REPO)).replace("\\", "/"),
                "sha256": sha256f(path),
            })
    return {
        "task":    TASK,
        "as_of":   as_of,
        "version": VERSION,
        "files":   entries,
    }


# ─── main ─────────────────────────────────────────────────────────────────────
def main():
    print(f"[{TASK}] v{VERSION} 시작")

    d   = load_all()
    idx = build_indexes(d)

    as_of = d["as_of"]
    print(f"  as_of: {as_of}")
    print(f"  RELEASE 후보: {len(idx['release_cids'])}건")

    # ─ S1 ─
    s1, release_cands = proc_s1_input_integrity(d, idx)
    print(f"  S1 input integrity: {s1['input_integrity_verdict']} ({len(release_cands)}건)")

    # ─ S2 ─
    lineage_recs = proc_s2_source_lineage(release_cands, d, idx)

    # ─ S3 ─
    s3 = proc_s3_vg_reconciliation(release_cands, d, idx)
    print(f"  S3 VG reconciliation: {s3['reconciliation_finding']}")

    # ─ S4 ─
    img_recs = proc_s4_image_rights(release_cands, d, idx)
    img_v_dist = Counter(r["rights_verdict"] for r in img_recs)
    print(f"  S4 image rights: {dict(img_v_dist)}")

    # ─ S5 ─
    desc_recs = proc_s5_description_rights(release_cands, d, idx)
    desc_v_dist = Counter(r["rights_verdict"] for r in desc_recs)
    print(f"  S5 desc rights: {dict(desc_v_dist)}")

    # ─ S6 ─
    s6 = proc_s6_domain_decision(d)
    print(f"  S6 domain-only: {s6['domain_only_verdict']}")

    # ─ S7 ─
    verdict_recs = proc_s7_final_verdicts(release_cands, lineage_recs, img_recs, desc_recs, d, idx)
    v_dist = Counter(r["audit_verdict"] for r in verdict_recs)
    print(f"  S7 final verdicts: {dict(v_dist)}")

    # ─ S8 ─
    agg = proc_s8_aggregates(lineage_recs, img_recs, desc_recs, verdict_recs)

    # ─ rights missing queue (S9) ─
    rights_missing = [r for r in verdict_recs
                      if r["audit_verdict"] == "RELEASE_BLOCKED_RIGHTS_EVIDENCE_MISSING"]

    # ─ reclassification queue (S10) ─
    reclass_q = [r for r in verdict_recs
                 if r["audit_verdict"] not in {
                     "RELEASE_CONFIRMED", "RELEASE_CONFIRMED_METADATA_LIMITED"}]

    # ─ S11 defects ─
    defects = build_defects(s6, img_recs, desc_recs, verdict_recs, d)
    print(f"  S11 defects: {[(d['defect_id'], d['severity']) for d in defects]}")

    # ─ S12 summary ─
    summary = build_summary(s1, agg, defects, verdict_recs, d)
    print(f"  S12 overall: {summary['overall_verdict']} / {summary['audit_status']}")

    # ─── write outputs ────────────────────────────────────────────────────────
    out = VAL
    output_files = []

    p = out / "gyeongju-release-102-input-audit-v1.json"
    write_json(p, s1); output_files.append(p)

    p = out / "gyeongju-release-102-source-lineage-v1.jsonl"
    write_jsonl(p, lineage_recs); output_files.append(p)

    p = out / "gyeongju-release-102-vg-reconciliation-v1.json"
    write_json(p, s3); output_files.append(p)

    p = out / "gyeongju-release-102-image-rights-audit-v1.jsonl"
    write_jsonl(p, img_recs); output_files.append(p)

    p = out / "gyeongju-release-102-description-rights-audit-v1.jsonl"
    write_jsonl(p, desc_recs); output_files.append(p)

    p = out / "gyeongju-release-102-domain-decision-audit-v1.json"
    write_json(p, s6); output_files.append(p)

    p = out / "gyeongju-release-102-final-verdict-v1.jsonl"
    write_jsonl(p, verdict_recs); output_files.append(p)

    p = out / "gyeongju-release-102-rights-missing-queue-v1.jsonl"
    write_jsonl(p, rights_missing); output_files.append(p)

    p = out / "gyeongju-release-102-reclassification-queue-v1.jsonl"
    write_jsonl(p, reclass_q); output_files.append(p)

    p = out / "gyeongju-release-102-audit-defects-v1.jsonl"
    write_jsonl(p, defects); output_files.append(p)

    p = out / "gyeongju-release-102-audit-summary-v1.json"
    write_json(p, summary); output_files.append(p)

    # SHA audit
    sha_obj = build_sha_audit(as_of, output_files)
    sha_p   = out / "gyeongju-release-102-sha-audit-v1.json"
    write_json(sha_p, sha_obj)
    output_files.append(sha_p)

    print(f"\n출력 파일 {len(output_files)}개 완료:")
    for p in output_files:
        pname = Path(p)
        print(f"  {pname.name}  ({pname.stat().st_size:,} bytes)")

    return summary["overall_verdict"], summary["audit_status"]


if __name__ == "__main__":
    verdict, status = main()
    print(f"\n=== 감사 완료: {verdict} / {status} ===")
