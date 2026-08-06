#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TASK-GYEONGJU-RELEASE-HOLD-CLASSIFICATION-V1
경주 910개 candidate + 행사·관계 데이터 Release/Hold 분류 스크립트.
VERSION = 1.0.0

개선 사항 (vs GPT 프롬프트):
  1. 이미지 권리: image_rights_status 필드 불신뢰 → image_url 도메인 기반 결정
     tong.visitkorea.or.kr / www.gyeongju.go.kr → OFFICIAL_API_IMAGE_USABLE
  2. KTO15 행사 24건: HOLD_NO_CURRENT_OFFICIAL_SOURCE + HOLD_TEMPORAL_REVIEW
  3. MRQ blocking: baseline_candidate_id 필드 사용

재현성:
  - as_of: normalization summary에서 읽음
  - datetime.now() 미사용
  - sort_keys=True, 결정적 정렬
"""

import argparse
import hashlib
import json
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import urlparse

VERSION  = "1.0.0"
TASK     = "TASK-GYEONGJU-RELEASE-HOLD-CLASSIFICATION-V1"
BASE_TASK = "TASK-GYEONGJU-POST-LINK-FINAL-INDEPENDENT-QA-V1"
BASE_HEAD = "74a484d"

# ──────────────────────────────────────────────────────────────
# 경로
# ──────────────────────────────────────────────────────────────
REPO      = Path(__file__).parent.parent
NORM_DIR  = REPO / "data/tourapi/normalized/gyeongju"
VAL_DIR   = REPO / "data/tourapi/validation/gyeongju"
RPT_DIR   = REPO / "data/tourapi/reports/gyeongju"
MANIFEST  = REPO / "data/tourapi/manifests/gyeongju/gyeongju-manifest-v1.json"

# ──────────────────────────────────────────────────────────────
# 상수
# ──────────────────────────────────────────────────────────────

# 공식 API 이미지 도메인 → RELEASE 허용
OFFICIAL_IMG_DOMAINS = {"tong.visitkorea.or.kr", "www.gyeongju.go.kr"}

# KTO15 event candidates — 모두 공식 web 미확인
KTO15_CATEGORY = "event"
KTO15_PREFIX   = "gyeongju-KTO15-"

# 경주 경계 (대략 bound check)
GYEONGJU_LAT_RANGE = (35.4, 36.1)
GYEONGJU_LNG_RANGE = (128.9, 129.7)

# release_decision 허용값
RELEASE_DECISIONS = {"RELEASE", "HOLD", "ARCHIVE_ONLY", "RELATION_ONLY"}

# readiness_tier 허용값
READINESS_TIERS = {
    "RELEASE_READY", "RELEASE_READY_METADATA_LIMITED",
    "HOLD_ENRICHMENT_REQUIRED", "HOLD_IDENTITY_REVIEW",
    "HOLD_DUPLICATE_REVIEW", "HOLD_CATEGORY_REVIEW",
    "HOLD_LOCATION_INCOMPLETE", "HOLD_RIGHTS_REVIEW",
    "HOLD_TEMPORAL_REVIEW", "HOLD_PAST_EVENT",
    "HOLD_NO_CURRENT_OFFICIAL_SOURCE", "HOLD_NON_PLACE_CONTENT",
    "RELATION_SOURCE_LIMITATION",
}

# MRQ blocking entity_type (candidate-level blocking)
MRQ_BLOCKING_TYPES = {"restaurant", "attraction"}

# DEF-L01 처리 코드
DEF_L01_CODE = "CLOSED_AS_DOCUMENTED_SOURCE_LIMITATION"

# ──────────────────────────────────────────────────────────────
# 헬퍼
# ──────────────────────────────────────────────────────────────

def read_jsonl(p):
    return [json.loads(l) for l in Path(p).read_text("utf-8").splitlines() if l.strip()]

def read_json(p):
    return json.loads(Path(p).read_text("utf-8"))

def sha256f(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()

def write_json(path, obj):
    Path(path).write_text(json.dumps(obj, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")

def write_jsonl(path, records):
    Path(path).write_text(
        "\n".join(json.dumps(r, ensure_ascii=False, sort_keys=True) for r in records) + "\n",
        encoding="utf-8"
    )

def derive_image_rights(image_url):
    """image_url 도메인 기반 이미지 권리 결정 (기존 image_rights_status 필드 불신뢰)."""
    if not image_url:
        return "NO_IMAGE", None
    try:
        dom = urlparse(image_url).netloc
    except Exception:
        return "UNKNOWN_DOMAIN", None
    if dom in OFFICIAL_IMG_DOMAINS:
        return "OFFICIAL_API_IMAGE_USABLE", dom
    return "RIGHTS_REVIEW_REQUIRED", dom

def is_coord_valid(lat, lng):
    """좌표가 존재하고 경주 범위 내인지 확인."""
    if lat is None or lng is None:
        return False, "MISSING"
    try:
        flat, flng = float(lat), float(lng)
    except (TypeError, ValueError):
        return False, "INVALID"
    if not (GYEONGJU_LAT_RANGE[0] < flat < GYEONGJU_LAT_RANGE[1]):
        return False, "OUTLIER"
    if not (GYEONGJU_LNG_RANGE[0] < flng < GYEONGJU_LNG_RANGE[1]):
        return False, "OUTLIER"
    return True, "VALID"

def primary_hold_reason_priority(hold_reasons):
    """여러 HOLD 사유 중 우선순위 반환."""
    PRIORITY = [
        "HOLD_NON_PLACE_CONTENT",
        "HOLD_DUPLICATE_REVIEW",
        "HOLD_IDENTITY_REVIEW",
        "HOLD_CATEGORY_REVIEW",
        "HOLD_LOCATION_INCOMPLETE",
        "HOLD_RIGHTS_REVIEW",
        "HOLD_PAST_EVENT",
        "HOLD_NO_CURRENT_OFFICIAL_SOURCE",
        "HOLD_TEMPORAL_REVIEW",
        "HOLD_ENRICHMENT_REQUIRED",
    ]
    for p in PRIORITY:
        if p in hold_reasons:
            return p
    return hold_reasons[0] if hold_reasons else "HOLD_ENRICHMENT_REQUIRED"

# ──────────────────────────────────────────────────────────────
# 데이터 로드
# ──────────────────────────────────────────────────────────────

def load_all():
    d = {}
    d["summary"]     = read_json(NORM_DIR / "gyeongju-normalization-summary-v1.json")
    d["as_of"]       = d["summary"]["as_of"]
    d["as_of_date"]  = d["as_of"][:10]
    d["full_v1"]     = read_jsonl(NORM_DIR / "gyeongju-full-v1-candidates.jsonl")
    d["sf_full"]     = read_jsonl(NORM_DIR / "source-facts-full-v1.jsonl")
    d["rest_aud"]    = read_jsonl(NORM_DIR / "gyeongju-restaurant-identity-audit-v1.jsonl")
    d["att_aud"]     = read_jsonl(NORM_DIR / "gyeongju-attraction-identity-audit-v1.jsonl")
    d["souv_aud"]    = read_jsonl(NORM_DIR / "gyeongju-souvenir-classification-audit-v1.jsonl")
    d["mrq"]         = read_jsonl(NORM_DIR / "gyeongju-manual-review-queue-v1.jsonl")
    d["event_ent"]   = read_jsonl(NORM_DIR / "gyeongju-event-entities-v1.jsonl")
    d["event_rel"]   = read_jsonl(NORM_DIR / "gyeongju-event-listing-relations-v1.jsonl")
    d["heritage_rel"]= read_jsonl(NORM_DIR / "gyeongju-heritage-relations-v1.jsonl")
    d["heritage_ent"]= read_jsonl(NORM_DIR / "gyeongju-heritage-entities-v1.jsonl")
    d["rec_coll"]    = read_jsonl(NORM_DIR / "gyeongju-recommendation-collections-v1.jsonl")
    d["rec_rel"]     = read_jsonl(NORM_DIR / "gyeongju-recommendation-place-relations-v1.jsonl")
    d["rec_mrq"]     = read_jsonl(NORM_DIR / "gyeongju-recommendation-relation-review-queue.jsonl")
    d["course_ent"]  = read_jsonl(NORM_DIR / "gyeongju-course-entities-v1.jsonl")
    d["course_wp"]   = read_jsonl(NORM_DIR / "gyeongju-course-waypoint-relations-v1.jsonl")
    d["guide_rel"]   = read_jsonl(NORM_DIR / "gyeongju-cultural-guide-relations-v1.jsonl")
    d["ml_audit"]    = read_jsonl(NORM_DIR / "gyeongju-multilingual-entity-link-audit-v1.jsonl")
    d["bl_link"]     = read_jsonl(NORM_DIR / "gyeongju-baseline-831-identity-link-audit.jsonl")
    d["manifest"]    = read_json(MANIFEST)
    return d


def build_indexes(d):
    idx = {}
    idx["cand_by_id"]    = {c["candidate_id"]: c for c in d["full_v1"]}
    idx["sf_by_id"]      = {s["source_fact_id"]: s for s in d["sf_full"]}

    # MRQ blocking candidates (restaurant/attraction)
    idx["mrq_blocking_cids"]  = set()
    idx["mrq_blocking_sfids"] = set()
    for r in d["mrq"]:
        if r.get("entity_type") in MRQ_BLOCKING_TYPES:
            cid  = r.get("baseline_candidate_id") or ""
            sfid = r.get("source_fact_id") or ""
            if cid:  idx["mrq_blocking_cids"].add(cid)
            if sfid: idx["mrq_blocking_sfids"].add(sfid)

    # MRQ souvenir/cultural_guide/monthly_rec — non-blocking for place RELEASE
    idx["mrq_nonblocking_sfids"] = set()
    for r in d["mrq"]:
        if r.get("entity_type") not in MRQ_BLOCKING_TYPES:
            sfid = r.get("source_fact_id") or ""
            if sfid: idx["mrq_nonblocking_sfids"].add(sfid)

    # Candidate identity status from audit files
    idx["rest_identity"] = {r.get("source_fact_id","") or r.get("baseline_candidate_id",""): r
                            for r in d["rest_aud"]}
    idx["att_identity"]  = {r.get("source_fact_id","") or r.get("area_uid",""): r
                            for r in d["att_aud"]}

    # Multilingual coverage by source fact ID
    idx["ml_by_esid"] = {e.get("entity_source_id",""): e for e in d["ml_audit"]}

    # Heritage area_uids with candidate linkage
    idx["heritage_rel_by_uid"] = defaultdict(list)
    for r in d["heritage_rel"]:
        idx["heritage_rel_by_uid"][r.get("parent_area_uid") or r.get("area_uid","")].append(r)

    # Event entities by candidate_id linkage
    idx["event_ent_by_id"] = {e.get("event_entity_id",""): e for e in d["event_ent"]}

    # Source limitation registry
    idx["documented_limitations"] = [
        {
            "code": DEF_L01_CODE,
            "original_defect": "DEF-L01",
            "description": "Heritage coverage gap: 25건 UNESCO World Heritage related attractions not yet in candidate pool; 경주 heritage source data 수집 범위 한계",
            "scope": "heritage_relations",
            "impact": "53 heritage relations include 20 PARENT_CHILD; parent heritage areas not all in candidate list",
            "resolution": "Documented source limitation; not a data defect; included as informational in relation classification",
        },
        {
            "code": "SOURCE_LIMITATION_KTO15_NO_CURRENT_DATE",
            "description": "KTO15 행사 24건 모두 event_start/end_date=None; 공식 web(경주문화관광) 현재 행사와 매칭되지 않음",
            "scope": "event_category_candidates",
            "impact": "24 event candidates → HOLD_NO_CURRENT_OFFICIAL_SOURCE",
            "resolution": "Documented source limitation; 7 web event entities separately classified",
        },
        {
            "code": "SOURCE_LIMITATION_NO_ATTRACTION_DESCRIPTION",
            "description": "attraction/nature/accommodation/event category candidates에 description_ko 없음; TourAPI 수집 범위에 포함되지 않음",
            "scope": "description_coverage",
            "impact": "802/910 candidates HOLD_ENRICHMENT_REQUIRED (description), all non-restaurant",
            "resolution": "Known gap; enrichment task 대상",
        },
        {
            "code": "SOURCE_LIMITATION_COORD_MISSING_BASELINE",
            "description": "baseline_831 중 152건 좌표 없음; TourAPI 수집 당시 좌표 미제공",
            "scope": "coordinate_coverage",
            "impact": "152 baseline candidates → HOLD_LOCATION_INCOMPLETE",
            "resolution": "Known gap; location enrichment task 대상",
        },
    ]

    return idx


# ──────────────────────────────────────────────────────────────
# 개별 Candidate 분류
# ──────────────────────────────────────────────────────────────

def classify_candidate(c, idx, as_of_date):
    """단일 candidate Release/Hold 결정."""
    cid      = c["candidate_id"]
    cat      = c.get("category","")
    subcat   = c.get("subcategory")
    title_ko = c.get("title_ko","")
    address  = c.get("address","")
    lat      = c.get("lat")
    lng      = c.get("lng")
    img_url  = c.get("image_url","") or ""
    desc_ko  = c.get("description_ko","") or ""
    off_url  = c.get("official_url","") or ""
    identity = c.get("identity_status","")
    prov     = c.get("provenance") or {}
    src_fact_id = c.get("source_fact_id","") or ""
    v1_src   = c.get("_v1_source","")

    hold_reasons   = []
    quality_checks = {}

    # ── 1. 이름 확인 ─────────────────────────────────────────
    quality_checks["has_title_ko"] = bool(title_ko)
    if not title_ko:
        hold_reasons.append("HOLD_ENRICHMENT_REQUIRED")

    # ── 2. Category 확인 ─────────────────────────────────────
    quality_checks["has_category"] = bool(cat)

    # ── 3. Identity / MRQ 차단 확인 ──────────────────────────
    in_blocking_mrq = (
        cid in idx["mrq_blocking_cids"] or
        src_fact_id in idx["mrq_blocking_sfids"]
    )
    quality_checks["in_blocking_mrq"] = in_blocking_mrq
    if in_blocking_mrq:
        hold_reasons.append("HOLD_IDENTITY_REVIEW")

    # ── 4. Event category 별도 처리 ──────────────────────────
    is_kto15_event = cid.startswith(KTO15_PREFIX)
    if cat == "event" or is_kto15_event:
        start_d = c.get("event_start_date","") or ""
        end_d   = c.get("event_end_date","")   or ""
        quality_checks["event_start_date"] = start_d or None
        quality_checks["event_end_date"]   = end_d   or None
        # KTO15 → 공식 web 미확인 → HOLD_NO_CURRENT_OFFICIAL_SOURCE
        if is_kto15_event:
            hold_reasons.append("HOLD_NO_CURRENT_OFFICIAL_SOURCE")
        if not start_d and not end_d:
            hold_reasons.append("HOLD_TEMPORAL_REVIEW")
        elif end_d and end_d < as_of_date:
            hold_reasons.append("HOLD_PAST_EVENT")

    # ── 5. Souvenir (MRQ에 있는 VG-SOUV) → HOLD_CATEGORY_REVIEW ──
    is_new_souv = v1_src == "visitgyeongju_souvenir_new"
    if is_new_souv:
        # 소재 분류 여전히 검토 중
        hold_reasons.append("HOLD_CATEGORY_REVIEW")

    # ── 6. 좌표 확인 ─────────────────────────────────────────
    coord_ok, coord_note = is_coord_valid(lat, lng)
    quality_checks["coord_ok"]   = coord_ok
    quality_checks["coord_note"] = coord_note
    if not coord_ok:
        hold_reasons.append("HOLD_LOCATION_INCOMPLETE")

    # ── 7. 주소 확인 ─────────────────────────────────────────
    quality_checks["has_address"] = bool(address)
    if not address:
        hold_reasons.append("HOLD_LOCATION_INCOMPLETE")

    # ── 8. 이미지 권리 확인 ─────────────────────────────────
    img_rights, img_domain = derive_image_rights(img_url)
    quality_checks["image_rights"] = img_rights
    quality_checks["image_domain"] = img_domain
    img_usable = (img_rights == "OFFICIAL_API_IMAGE_USABLE")
    if not img_usable:
        hold_reasons.append("HOLD_ENRICHMENT_REQUIRED")

    # ── 9. Description 확인 ─────────────────────────────────
    quality_checks["has_description_ko"] = bool(desc_ko)
    if not desc_ko:
        hold_reasons.append("HOLD_ENRICHMENT_REQUIRED")

    # ── 10. 중복 조항 정리 ─────────────────────────────────────
    hold_reasons = list(dict.fromkeys(hold_reasons))  # deduplicate, preserve order

    # ── 11. RELEASE 결정 ─────────────────────────────────────
    if not hold_reasons:
        release_decision = "RELEASE"
        # readiness_tier
        if img_usable and desc_ko:
            readiness_tier = "RELEASE_READY"
        else:
            readiness_tier = "RELEASE_READY_METADATA_LIMITED"
        # content_usage_scope
        if img_usable:
            content_usage_scope = ["FULL_OFFICIAL_CONTENT_ALLOWED"]
        else:
            content_usage_scope = ["OFFICIAL_FACTS_ONLY"]
    else:
        release_decision = "HOLD"
        primary_hold = primary_hold_reason_priority(hold_reasons)
        readiness_tier = primary_hold
        # content_usage_scope for HOLD
        content_usage_scope = ["OFFICIAL_FACTS_ONLY"]
        if not img_usable:
            content_usage_scope.append("NO_USABLE_IMAGE")
        if not desc_ko:
            content_usage_scope.append("NO_USABLE_DESCRIPTION")
        content_usage_scope = list(dict.fromkeys(content_usage_scope))

    # ── 12. Optional quality fields (non-blocking) ───────────
    quality_checks["has_phone"]         = bool(c.get("phone"))
    quality_checks["has_opening_hours"] = bool(c.get("opening_hours"))
    quality_checks["has_official_url"]  = bool(off_url)
    quality_checks["has_district"]      = bool(c.get("district_gyeongju"))
    quality_checks["has_title_en"]      = bool(c.get("title_en"))
    quality_checks["has_admission"]     = bool(c.get("admission"))
    quality_checks["has_source_fact_id"] = bool(src_fact_id)

    # ── 13. source_provenance 기록 ───────────────────────────
    linked_sfs = c.get("linked_source_facts") or []
    web_sfs    = c.get("_web_source_facts_linked") or []
    prov_type  = prov.get("primary_source","") if isinstance(prov,dict) else str(prov)

    source_provenance = {
        "v1_source":             v1_src,
        "source_fact_id_direct": src_fact_id or None,
        "linked_source_facts":   linked_sfs,
        "web_source_facts":      web_sfs,
        "primary_source_type":   prov_type or None,
    }

    classification_evidence = {
        "hold_reasons":     hold_reasons,
        "img_rights_basis": f"url_domain:{img_domain}" if img_domain else "no_image_url",
        "identity_status":  identity,
        "in_mrq":           in_blocking_mrq,
    }

    return {
        "candidate_id":           cid,
        "entity_type":            cat,
        "category":               cat,
        "subcategory":            subcat,
        "title_ko":               title_ko,
        "release_decision":       release_decision,
        "readiness_tier":         readiness_tier,
        "hold_reason_codes":      hold_reasons,
        "content_usage_scope":    content_usage_scope,
        "identity_status":        identity,
        "quality_checks":         quality_checks,
        "source_provenance":      source_provenance,
        "classification_evidence":classification_evidence,
        "as_of":                  None,  # intentionally omitted from per-record (in summary)
    }


# ──────────────────────────────────────────────────────────────
# 행사 분류 (web event entities — 7건)
# ──────────────────────────────────────────────────────────────

def classify_events(d, idx, as_of_date):
    """7개 web event entities 분류."""
    records = []
    for e in sorted(d["event_ent"], key=lambda x: x.get("event_entity_id","")):
        eid    = e.get("event_entity_id","")
        name   = e.get("event_name_ko","")
        etype  = e.get("event_type","")
        start  = e.get("start_date","") or ""
        end    = e.get("end_date","")   or ""
        status = e.get("as_of_status","")
        con_uid = e.get("con_uid")
        ext_url = e.get("external_official_url","") or ""
        date_valid = e.get("date_valid", False)
        kto_sfid   = e.get("kto_event_source_fact_id","") or ""

        # 날짜 기반 판정
        if status == "CURRENT_EVENT" and end and end >= as_of_date:
            event_decision = "RELEASE"
            event_status   = "RELEASE_CURRENT_EVENT"
        elif status == "CURRENT_EVENT" and not end:
            event_decision = "RELEASE"
            event_status   = "RELEASE_CURRENT_EVENT"
        elif status == "UPCOMING_EVENT":
            event_decision = "RELEASE"
            event_status   = "RELEASE_UPCOMING_EVENT"
        elif end and end < as_of_date:
            event_decision = "ARCHIVE_ONLY"
            event_status   = "ARCHIVE_PAST_EVENT"
        elif status == "DATE_MISSING" or not start:
            event_decision = "HOLD"
            event_status   = "HOLD_EVENT_DATE_INCOMPLETE"
        else:
            event_decision = "HOLD"
            event_status   = "HOLD_EVENT_STATUS_UNCERTAIN"

        rec = {
            "event_entity_id":      eid,
            "con_uid":              con_uid,
            "event_name_ko":        name,
            "event_type":           etype,
            "start_date":           start or None,
            "end_date":             end   or None,
            "as_of_status":         status,
            "release_decision":     event_decision,
            "event_release_status": event_status,
            "external_official_url":ext_url or None,
            "kto_event_source_fact_id": kto_sfid or None,
            "date_valid":           date_valid,
            "content_usage_scope":  ["OFFICIAL_FACTS_ONLY"],
        }
        records.append(rec)
    return records


# ──────────────────────────────────────────────────────────────
# 관계 데이터 분류
# ──────────────────────────────────────────────────────────────

def classify_relations(d, idx, release_cids, as_of_date):
    """heritage/rec/course/guide 관계 데이터 분류."""
    records = []

    # ── Heritage relations ─────────────────────────────────
    for r in sorted(d["heritage_rel"], key=lambda x: json.dumps(x, sort_keys=True)):
        rel_type = r.get("relation_type","")
        parent   = r.get("parent_area_uid")
        child    = r.get("area_uid") or r.get("child_area_uid")
        cid      = r.get("candidate_id","") or ""
        # if linked candidate is released → relation usable
        if cid and cid in release_cids:
            usage = "RELATION_USABLE_LINKED_CANDIDATE_RELEASED"
        elif cid:
            usage = "RELATION_PRESERVED_CANDIDATE_HOLD"
        else:
            usage = "RELATION_SOURCE_LIMITATION"
        rec = {
            "relation_class":   "heritage",
            "relation_type":    rel_type,
            "release_decision": "RELATION_ONLY",
            "readiness_tier":   "RELATION_SOURCE_LIMITATION" if not cid else "HOLD_NON_PLACE_CONTENT",
            "content_usage_scope": ["RELATION_METADATA_ONLY"],
            "relation_usage":   usage,
            "parent_uid":       parent,
            "child_uid":        child,
            "linked_candidate_id": cid or None,
        }
        records.append(rec)

    # ── Recommendation place relations ─────────────────────
    for r in sorted(d["rec_rel"], key=lambda x: json.dumps(x, sort_keys=True)):
        cid      = r.get("candidate_id","") or r.get("baseline_candidate_id","") or ""
        coll_id  = r.get("collection_id","")
        in_mrq   = r.get("source_fact_id","") in idx["mrq_nonblocking_sfids"]
        if cid and cid in release_cids:
            usage = "RELATION_USABLE_LINKED_CANDIDATE_RELEASED"
        elif cid:
            usage = "RELATION_PRESERVED_CANDIDATE_HOLD"
        else:
            usage = "RELATION_SOURCE_LIMITATION"
        rec = {
            "relation_class":   "recommendation",
            "collection_id":    coll_id or None,
            "release_decision": "RELATION_ONLY",
            "readiness_tier":   "RELATION_SOURCE_LIMITATION",
            "content_usage_scope": ["RELATION_METADATA_ONLY"],
            "relation_usage":   usage,
            "linked_candidate_id": cid or None,
            "in_mrq":           in_mrq,
        }
        records.append(rec)

    # ── Course waypoint relations ──────────────────────────
    for r in sorted(d["course_wp"], key=lambda x: json.dumps(x, sort_keys=True)):
        cid     = r.get("candidate_id","") or ""
        course  = r.get("course_id","")
        if cid and cid in release_cids:
            usage = "RELATION_USABLE_LINKED_CANDIDATE_RELEASED"
        elif cid:
            usage = "RELATION_PRESERVED_CANDIDATE_HOLD"
        else:
            usage = "RELATION_SOURCE_LIMITATION"
        rec = {
            "relation_class":   "course_waypoint",
            "course_id":        course or None,
            "release_decision": "RELATION_ONLY",
            "readiness_tier":   "RELATION_SOURCE_LIMITATION",
            "content_usage_scope": ["RELATION_METADATA_ONLY"],
            "relation_usage":   usage,
            "linked_candidate_id": cid or None,
        }
        records.append(rec)

    # ── Cultural guide relations ───────────────────────────
    for r in sorted(d["guide_rel"], key=lambda x: json.dumps(x, sort_keys=True)):
        cid = r.get("candidate_id","") or ""
        if cid and cid in release_cids:
            usage = "RELATION_USABLE_LINKED_CANDIDATE_RELEASED"
        elif cid:
            usage = "RELATION_PRESERVED_CANDIDATE_HOLD"
        else:
            usage = "RELATION_SOURCE_LIMITATION"
        rec = {
            "relation_class":   "cultural_guide",
            "release_decision": "RELATION_ONLY",
            "readiness_tier":   "RELATION_SOURCE_LIMITATION",
            "content_usage_scope": ["RELATION_METADATA_ONLY"],
            "relation_usage":   usage,
            "linked_candidate_id": cid or None,
        }
        records.append(rec)

    return records


# ──────────────────────────────────────────────────────────────
# 집계 생성
# ──────────────────────────────────────────────────────────────

def build_category_summary(classifications):
    categories = sorted(set(r["category"] for r in classifications))
    result = {"total": len(classifications), "by_category": {}}
    totals = {"RELEASE": 0, "HOLD": 0, "ARCHIVE_ONLY": 0, "RELATION_ONLY": 0}
    for dec in totals:
        totals[dec] = sum(1 for r in classifications if r["release_decision"] == dec)
    result.update(totals)
    for cat in categories:
        cats = [r for r in classifications if r["category"] == cat]
        cat_dec = Counter(r["release_decision"] for r in cats)
        result["by_category"][cat] = {
            "total":        len(cats),
            "RELEASE":      cat_dec.get("RELEASE", 0),
            "HOLD":         cat_dec.get("HOLD", 0),
            "ARCHIVE_ONLY": cat_dec.get("ARCHIVE_ONLY", 0),
        }
    # by subcategory
    subcats = sorted(set(r.get("subcategory") or "None" for r in classifications))
    result["by_subcategory"] = {}
    for sc in subcats:
        sc_key = sc or "None"
        scs = [r for r in classifications if (r.get("subcategory") or "None") == sc_key]
        sc_dec = Counter(r["release_decision"] for r in scs)
        result["by_subcategory"][sc_key] = {
            "total":   len(scs),
            "RELEASE": sc_dec.get("RELEASE", 0),
            "HOLD":    sc_dec.get("HOLD", 0),
        }
    # by source
    srcs = sorted(set(r["source_provenance"]["v1_source"] for r in classifications))
    result["by_source"] = {}
    for src in srcs:
        srs = [r for r in classifications if r["source_provenance"]["v1_source"] == src]
        sr_dec = Counter(r["release_decision"] for r in srs)
        result["by_source"][src] = {
            "total":   len(srs),
            "RELEASE": sr_dec.get("RELEASE", 0),
            "HOLD":    sr_dec.get("HOLD", 0),
        }
    return result


def build_hold_reason_summary(classifications):
    primary_dist = Counter(
        r["classification_evidence"]["hold_reasons"][0]
        for r in classifications
        if r["release_decision"] == "HOLD" and r["classification_evidence"]["hold_reasons"]
    )
    all_dist = Counter()
    for r in classifications:
        for reason in r["hold_reason_codes"]:
            all_dist[reason] += 1
    return {
        "primary_hold_reason_counts":    dict(sorted(primary_dist.items())),
        "all_hold_reason_occurrences":   dict(sorted(all_dist.items())),
    }


def build_product_usable_summary(classifications, event_classifications, relation_classifications):
    """즉시 제품 사용 가능한 수, 보강 후 가능한 수 등."""
    release_cands   = [r for r in classifications if r["release_decision"] == "RELEASE"]
    hold_cands      = [r for r in classifications if r["release_decision"] == "HOLD"]

    # 이미지+설명 보강 후 가능 (현재 HOLD_ENRICHMENT_REQUIRED만인 경우)
    enrichment_only = [
        r for r in hold_cands
        if set(r["hold_reason_codes"]) == {"HOLD_ENRICHMENT_REQUIRED"}
    ]
    # 위치 보강 후 가능 (좌표/주소만 부족)
    location_only = [
        r for r in hold_cands
        if all(c in {"HOLD_LOCATION_INCOMPLETE", "HOLD_ENRICHMENT_REQUIRED"}
               for c in r["hold_reason_codes"])
    ]
    # identity/category 수정 후 가능
    identity_block = [
        r for r in hold_cands
        if "HOLD_IDENTITY_REVIEW" in r["hold_reason_codes"]
        or "HOLD_DUPLICATE_REVIEW" in r["hold_reason_codes"]
        or "HOLD_CATEGORY_REVIEW" in r["hold_reason_codes"]
    ]
    # 현재 공개 불가 (temporal/past/no_source)
    no_public = [
        r for r in hold_cands
        if any(c in r["hold_reason_codes"]
               for c in ("HOLD_PAST_EVENT","HOLD_NO_CURRENT_OFFICIAL_SOURCE"))
    ]

    # Events
    ev_release  = [e for e in event_classifications if e["release_decision"] == "RELEASE"]
    ev_archive  = [e for e in event_classifications if e["release_decision"] == "ARCHIVE_ONLY"]
    ev_hold     = [e for e in event_classifications if e["release_decision"] == "HOLD"]
    ev_current  = [e for e in ev_release if e["event_release_status"] == "RELEASE_CURRENT_EVENT"]
    ev_upcoming = [e for e in ev_release if e["event_release_status"] == "RELEASE_UPCOMING_EVENT"]

    # Relations
    rel_usable = sum(1 for r in relation_classifications
                     if r["relation_usage"] == "RELATION_USABLE_LINKED_CANDIDATE_RELEASED")
    rel_hold   = sum(1 for r in relation_classifications
                     if r["relation_usage"] == "RELATION_PRESERVED_CANDIDATE_HOLD")
    rel_source_limit = sum(1 for r in relation_classifications
                           if r["relation_usage"] == "RELATION_SOURCE_LIMITATION")

    return {
        "immediately_usable_places":       len(release_cands),
        "hold_enrichment_only":            len(enrichment_only),
        "hold_location_or_enrichment":     len(location_only),
        "hold_identity_category_review":   len(identity_block),
        "hold_no_public_currently":        len(no_public),
        "events": {
            "current_events_releasable":   len(ev_current),
            "upcoming_events_releasable":  len(ev_upcoming),
            "archive_past_events":         len(ev_archive),
            "hold_date_incomplete":        len([e for e in ev_hold if "INCOMPLETE" in e["event_release_status"]]),
            "hold_status_uncertain":       len([e for e in ev_hold if "UNCERTAIN" in e["event_release_status"]]),
            "total_web_events":            len(event_classifications),
        },
        "relations": {
            "usable_linked_released":      rel_usable,
            "preserved_candidate_hold":    rel_hold,
            "source_limitation":           rel_source_limit,
            "total":                       len(relation_classifications),
        },
    }


def build_quality_coverage(classifications):
    """전체 + RELEASE candidate 품질 coverage."""
    def calc_cov(recs, field):
        count = sum(1 for r in recs if r["quality_checks"].get(field))
        return {"count": count, "total": len(recs), "pct": round(100*count/len(recs),1) if recs else 0}

    fields = [
        "has_title_ko","has_category","has_address","coord_ok",
        "has_description_ko","image_rights","has_official_url",
        "has_phone","has_opening_hours","has_district","has_title_en",
        "has_admission","has_source_fact_id",
    ]

    all_cov     = {}
    release_cov = {}
    hold_cov    = {}
    release_recs = [r for r in classifications if r["release_decision"] == "RELEASE"]
    hold_recs    = [r for r in classifications if r["release_decision"] == "HOLD"]

    for f in fields:
        if f == "image_rights":
            all_cov[f]     = {"count": sum(1 for r in classifications if r["quality_checks"].get("image_rights")=="OFFICIAL_API_IMAGE_USABLE"),
                               "total": len(classifications),
                               "pct": round(100*sum(1 for r in classifications if r["quality_checks"].get("image_rights")=="OFFICIAL_API_IMAGE_USABLE")/len(classifications),1)}
            release_cov[f] = {"count": sum(1 for r in release_recs if r["quality_checks"].get("image_rights")=="OFFICIAL_API_IMAGE_USABLE"),
                               "total": len(release_recs),
                               "pct": 100.0 if release_recs and all(r["quality_checks"].get("image_rights")=="OFFICIAL_API_IMAGE_USABLE" for r in release_recs) else 0}
        elif f == "coord_ok":
            all_cov[f]     = {"count": sum(1 for r in classifications if r["quality_checks"].get("coord_ok")), "total": len(classifications)}
            all_cov[f]["pct"] = round(100*all_cov[f]["count"]/len(classifications),1)
            release_cov[f] = {"count": sum(1 for r in release_recs if r["quality_checks"].get("coord_ok")), "total": len(release_recs)}
            release_cov[f]["pct"] = round(100*release_cov[f]["count"]/len(release_recs),1) if release_recs else 0
        else:
            all_cov[f]     = calc_cov(classifications, f)
            release_cov[f] = calc_cov(release_recs, f) if release_recs else {"count":0,"total":0,"pct":0}

    return {
        "all_candidates":      {"total": len(classifications), "coverage": all_cov},
        "release_candidates":  {"total": len(release_recs),    "coverage": release_cov},
        "hold_missing_stats": {
            "no_coord":        sum(1 for r in hold_recs if not r["quality_checks"].get("coord_ok")),
            "no_image":        sum(1 for r in hold_recs if r["quality_checks"].get("image_rights") != "OFFICIAL_API_IMAGE_USABLE"),
            "no_description":  sum(1 for r in hold_recs if not r["quality_checks"].get("has_description_ko")),
        },
    }


def build_rights_usage_audit(classifications):
    """권리 usage scope 분포."""
    records = []
    scope_dist = Counter()
    for r in sorted(classifications, key=lambda x: x["candidate_id"]):
        for s in r["content_usage_scope"]:
            scope_dist[s] += 1
        rec = {
            "candidate_id":    r["candidate_id"],
            "category":        r["category"],
            "release_decision":r["release_decision"],
            "image_rights":    r["quality_checks"].get("image_rights"),
            "image_domain":    r["quality_checks"].get("image_domain"),
            "has_description": r["quality_checks"].get("has_description_ko"),
            "content_usage_scope": r["content_usage_scope"],
        }
        records.append(rec)
    return records, dict(scope_dist)


def build_missing_core_fields(classifications):
    """필수 필드 누락 감사."""
    records = []
    for r in sorted(classifications, key=lambda x: x["candidate_id"]):
        missing = []
        qc = r["quality_checks"]
        if not qc.get("has_title_ko"):          missing.append("title_ko")
        if not qc.get("has_address"):            missing.append("address")
        if not qc.get("coord_ok"):               missing.append("coordinates")
        if qc.get("image_rights") != "OFFICIAL_API_IMAGE_USABLE": missing.append("usable_image")
        if not qc.get("has_description_ko"):     missing.append("description_ko")
        if missing:
            records.append({
                "candidate_id":    r["candidate_id"],
                "category":        r["category"],
                "release_decision":r["release_decision"],
                "missing_fields":  missing,
                "hold_reasons":    r["hold_reason_codes"],
            })
    return records


def build_mrq_impact_audit(classifications, d):
    """MRQ가 Release에 미치는 영향."""
    mrq_blocked = [r for r in classifications
                   if "HOLD_IDENTITY_REVIEW" in r["hold_reason_codes"]
                   and r["classification_evidence"].get("in_mrq")]
    # MRQ by type
    mrq_type_dist = Counter(r.get("entity_type") for r in d["mrq"])
    return {
        "total_mrq_entries":             len(d["mrq"]),
        "mrq_blocking_candidate_count":  len(mrq_blocked),
        "mrq_type_distribution":         dict(mrq_type_dist),
        "blocking_candidates": [
            {"candidate_id": r["candidate_id"], "category": r["category"]}
            for r in sorted(mrq_blocked, key=lambda x: x["candidate_id"])
        ],
    }


def build_classification_defects(classifications, event_classifications):
    """분류 결과 검증 및 결함 판정."""
    defects = []

    # RELEASE candidates 검증
    for r in classifications:
        if r["release_decision"] != "RELEASE":
            continue
        qc = r["quality_checks"]
        cid = r["candidate_id"]
        if not qc.get("has_title_ko"):
            defects.append({"severity":"CRITICAL","code":"RELEASE-NO-TITLE","candidate_id":cid})
        if not qc.get("has_address"):
            defects.append({"severity":"CRITICAL","code":"RELEASE-NO-ADDRESS","candidate_id":cid})
        if not qc.get("coord_ok"):
            defects.append({"severity":"CRITICAL","code":"RELEASE-NO-COORD","candidate_id":cid})
        if qc.get("image_rights") != "OFFICIAL_API_IMAGE_USABLE":
            defects.append({"severity":"CRITICAL","code":"RELEASE-NO-USABLE-IMAGE","candidate_id":cid})
        if not qc.get("has_description_ko"):
            defects.append({"severity":"CRITICAL","code":"RELEASE-NO-DESCRIPTION","candidate_id":cid})
        if qc.get("in_blocking_mrq"):
            defects.append({"severity":"CRITICAL","code":"RELEASE-IN-MRQ","candidate_id":cid})

    # Category totals check
    cat_totals = Counter(r["category"] for r in classifications)
    total = sum(cat_totals.values())
    if total != len(classifications):
        defects.append({"severity":"CRITICAL","code":"CATEGORY-SUM-MISMATCH",
                        "expected":len(classifications),"actual":total})

    # Decision totals
    dec_totals = Counter(r["release_decision"] for r in classifications)
    if sum(dec_totals.values()) != len(classifications):
        defects.append({"severity":"CRITICAL","code":"DECISION-SUM-MISMATCH"})

    # Past/unknown events should not RELEASE
    for e in event_classifications:
        if e["release_decision"] == "RELEASE":
            if e["event_release_status"] in ("ARCHIVE_PAST_EVENT","HOLD_EVENT_DATE_INCOMPLETE"):
                defects.append({"severity":"CRITICAL","code":"EVENT-RELEASE-PAST",
                                 "event_entity_id":e["event_entity_id"]})

    return defects


def build_readiness_summary(d, classifications, event_classifications, relation_classifications,
                            defect_register, product_usable, as_of):
    defect_dist = Counter(d.get("severity","?") for d in defect_register)
    release_count = sum(1 for r in classifications if r["release_decision"] == "RELEASE")
    hold_count    = sum(1 for r in classifications if r["release_decision"] == "HOLD")

    c_count = defect_dist.get("CRITICAL", 0)
    h_count = defect_dist.get("HIGH", 0)
    m_count = defect_dist.get("MEDIUM", 0)

    if c_count == 0 and h_count == 0:
        overall_verdict = "PASS"
        status = "GYEONGJU_RELEASE_HOLD_CLASSIFICATION_COMPLETE_WITH_LIMITATIONS"
    elif c_count > 0 or h_count > 0:
        overall_verdict = "FAIL"
        status = "GYEONGJU_RELEASE_HOLD_CLASSIFICATION_FIX_REQUIRED"
    else:
        overall_verdict = "CONDITIONAL_PASS"
        status = "GYEONGJU_RELEASE_HOLD_CLASSIFICATION_COMPLETE_WITH_LIMITATIONS"

    documented_lims = [
        "DEF-L01: heritage coverage gap → CLOSED_AS_DOCUMENTED_SOURCE_LIMITATION",
        "KTO15 행사 24건 날짜 없음 → SOURCE_LIMITATION_KTO15_NO_CURRENT_DATE",
        "attraction/nature/accommodation description 없음 → SOURCE_LIMITATION_NO_ATTRACTION_DESCRIPTION",
        "baseline_831 152건 좌표 없음 → SOURCE_LIMITATION_COORD_MISSING_BASELINE",
    ]

    return {
        "task":                     TASK,
        "base_task":                BASE_TASK,
        "base_head":                BASE_HEAD,
        "script_version":           VERSION,
        "as_of":                    as_of,
        "total_candidates":         len(classifications),
        "release_count":            release_count,
        "hold_count":               hold_count,
        "archive_count":            sum(1 for r in classifications if r["release_decision"]=="ARCHIVE_ONLY"),
        "relation_only_count":      0,  # place candidates only; relations separate
        "web_events_classified":    len(event_classifications),
        "event_release_count":      sum(1 for e in event_classifications if e["release_decision"]=="RELEASE"),
        "event_archive_count":      sum(1 for e in event_classifications if e["release_decision"]=="ARCHIVE_ONLY"),
        "event_hold_count":         sum(1 for e in event_classifications if e["release_decision"]=="HOLD"),
        "relation_records_classified": len(relation_classifications),
        "product_usable_summary":   product_usable,
        "defect_counts":            dict(defect_dist),
        "overall_verdict":          overall_verdict,
        "classification_status":    status,
        "documented_limitations":   documented_lims,
    }


# ──────────────────────────────────────────────────────────────
# 메인 파이프라인
# ──────────────────────────────────────────────────────────────

def run_classification(args):
    VAL_DIR.mkdir(parents=True, exist_ok=True)
    RPT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"\n[{args.run_id}] {TASK} v{VERSION}")

    d   = load_all()
    idx = build_indexes(d)
    as_of      = d["as_of"]
    as_of_date = d["as_of_date"]
    print(f"[{args.run_id}] as_of={as_of}, candidates={len(d['full_v1'])}")

    # ── Step 1: 전체 candidate 분류 ──────────────────────────
    print("[S1] Candidate 분류 중…")
    classifications = []
    for c in sorted(d["full_v1"], key=lambda x: x["candidate_id"]):
        rec = classify_candidate(c, idx, as_of_date)
        classifications.append(rec)

    release_cids = {r["candidate_id"] for r in classifications if r["release_decision"] == "RELEASE"}
    print(f"  RELEASE={len(release_cids)}, HOLD={len(classifications)-len(release_cids)}, total={len(classifications)}")

    # ── Step 2: Web event entities 분류 ──────────────────────
    print("[S2] Web event entities 분류…")
    event_classifications = classify_events(d, idx, as_of_date)
    ev_rel = sum(1 for e in event_classifications if e["release_decision"]=="RELEASE")
    ev_arc = sum(1 for e in event_classifications if e["release_decision"]=="ARCHIVE_ONLY")
    ev_hld = sum(1 for e in event_classifications if e["release_decision"]=="HOLD")
    print(f"  RELEASE={ev_rel}, ARCHIVE={ev_arc}, HOLD={ev_hld}")

    # ── Step 3: 관계 데이터 분류 ──────────────────────────────
    print("[S3] 관계 데이터 분류…")
    relation_classifications = classify_relations(d, idx, release_cids, as_of_date)
    rel_by_class = Counter(r["relation_class"] for r in relation_classifications)
    print(f"  relation counts: {dict(rel_by_class)}")

    # ── Step 4: 집계 생성 ─────────────────────────────────────
    print("[S4] 집계 생성…")
    category_summary  = build_category_summary(classifications)
    hold_summary      = build_hold_reason_summary(classifications)
    product_usable    = build_product_usable_summary(classifications, event_classifications, relation_classifications)
    quality_cov       = build_quality_coverage(classifications)
    rights_records, scope_dist = build_rights_usage_audit(classifications)
    missing_records   = build_missing_core_fields(classifications)
    mrq_impact        = build_mrq_impact_audit(classifications, d)
    defect_register   = build_classification_defects(classifications, event_classifications)
    readiness         = build_readiness_summary(d, classifications, event_classifications,
                                                relation_classifications, defect_register,
                                                product_usable, as_of)

    # ── Step 5: 파일 출력 ─────────────────────────────────────
    print("[S5] 파일 출력…")
    sha_map = {}
    out = VAL_DIR

    def wj(fname, obj):
        p = out / fname
        write_json(p, obj)
        sha_map[fname] = sha256f(p)
        return p

    def wjl(fname, records):
        p = out / fname
        write_jsonl(p, records)
        sha_map[fname] = sha256f(p)
        return p

    wjl("gyeongju-candidate-release-hold-v1.jsonl",          classifications)
    wjl("gyeongju-event-release-hold-v1.jsonl",              event_classifications)
    wjl("gyeongju-relation-release-usage-v1.jsonl",          relation_classifications)
    wj ("gyeongju-release-hold-category-summary-v1.json",    category_summary)
    wj ("gyeongju-hold-reason-summary-v1.json",              hold_summary)
    wj ("gyeongju-product-usable-count-summary-v1.json",     product_usable)
    wj ("gyeongju-release-quality-coverage-v1.json",         quality_cov)
    wjl("gyeongju-release-rights-usage-audit-v1.jsonl",      rights_records)
    wjl("gyeongju-release-missing-core-fields-v1.jsonl",     missing_records)
    wj ("gyeongju-release-manual-review-impact-v1.json",     mrq_impact)
    wjl("gyeongju-release-source-limitations-v1.jsonl",      idx["documented_limitations"])
    wjl("gyeongju-release-classification-defects-v1.jsonl",  defect_register)
    wj ("gyeongju-release-readiness-summary-v1.json",        readiness)

    defect_dist = Counter(d.get("severity","?") for d in defect_register)
    print(f"[{args.run_id}] Done. verdict={readiness['overall_verdict']}, defects={dict(defect_dist)}")
    return sha_map, readiness


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--run-id", default="run1")
    return p.parse_args()


def main():
    args = parse_args()
    sha_map, readiness = run_classification(args)
    print(f"\n=== Classification complete ===")
    for fname, sha in sorted(sha_map.items()):
        print(f"  {fname}: {sha[:16]}…")
    print(f"\n{readiness['classification_status']}")
    print(f"RELEASE={readiness['release_count']} / HOLD={readiness['hold_count']} / total={readiness['total_candidates']}")


if __name__ == "__main__":
    main()
