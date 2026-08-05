#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TASK-GYEONGJU-NORMALIZATION-AND-IDENTITY-V1
경주 공식 데이터 정규화 및 Identity 연결 스크립트 v1.0.0

입력:
  --baseline    기존 enriched candidate 831건 JSONL
  --source-facts 기존 source facts 907건 JSONL
  --web-raw-root web-raw-v3/ 루트 디렉터리
  --out          출력 디렉터리
  --as-of        정규화 기준 시각 (ISO-8601)
  --run-id       Run 식별자 (재현성 검증용, 결과 데이터에 영향 없음)

결정성 보장:
  - datetime.now() 사용 금지 (as_of 고정)
  - 모든 출력 정렬 기준: source_fact_id, candidate_id (고정 순서)
  - dict insertion order 미사용 (sorted() 명시)
  - 실행 시각은 run log에만 기록
"""

import argparse
import hashlib
import html as html_lib
import json
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

VERSION = "1.0.0"
TASK = "TASK-GYEONGJU-NORMALIZATION-AND-IDENTITY-V1"
AS_OF_DEFAULT = "2026-08-05T04:08:00Z"

# Identity verdict types (Section 4)
VERDICT = {
    "HIGH_CONFIDENCE": "HIGH_CONFIDENCE",
    "MANUAL_REVIEW": "MANUAL_REVIEW",
    "NO_MATCH": "NO_MATCH",
    "NEW_OFFICIAL_PLACE": "NEW_OFFICIAL_PLACE",
    "PARENT_CHILD": "PARENT_CHILD",
    "SEPARATE_BRANCH": "SEPARATE_BRANCH",
    "CONTENT_ONLY": "CONTENT_ONLY",
    "INSUFFICIENT_EVIDENCE": "INSUFFICIENT_EVIDENCE",
}

# Source priority mapping
SOURCE_META = {
    "gyeongju-city/touristDestinationService": {
        "source_name": "경주시 관광지 API",
        "source_type": "city_api",
        "locale": "ko",
    },
    "gyeongju-city/eatHtpService": {
        "source_name": "경주시 음식점 API (eatHtp)",
        "source_type": "city_api",
        "locale": "ko",
    },
    "gyeongju-city/menuRstrtService": {
        "source_name": "경주시 음식점 API (menuRstrt)",
        "source_type": "city_api",
        "locale": "ko",
    },
    "gyeongju-city/observationPointService": {
        "source_name": "경주시 전망대 API",
        "source_type": "city_api",
        "locale": "ko",
    },
    "gyeongju-city/theNightViewService": {
        "source_name": "경주시 야경 API",
        "source_type": "city_api",
        "locale": "ko",
    },
    "kto/KorService2/type12": {
        "source_name": "KTO 관광지",
        "source_type": "kto_api",
        "locale": "ko",
    },
    "kto/KorService2/type14": {
        "source_name": "KTO 문화시설",
        "source_type": "kto_api",
        "locale": "ko",
    },
    "kto/KorService2/type15": {
        "source_name": "KTO 행사/공연/축제",
        "source_type": "kto_api",
        "locale": "ko",
    },
    "kto/KorService2/type28": {
        "source_name": "KTO 자연관광지",
        "source_type": "kto_api",
        "locale": "ko",
    },
    "kto/KorService2/type32": {
        "source_name": "KTO 숙박",
        "source_type": "kto_api",
        "locale": "ko",
    },
    "kto/KorService2/type38": {
        "source_name": "KTO 쇼핑",
        "source_type": "kto_api",
        "locale": "ko",
    },
    "kto/KorService2/type39": {
        "source_name": "KTO 음식점",
        "source_type": "kto_api",
        "locale": "ko",
    },
    "gyeongju_web/attractions": {
        "source_name": "경주문화관광 관광지 웹",
        "source_type": "web_official",
        "locale": "ko",
    },
    "visitgyeongju/restaurants": {
        "source_name": "비지트경주 식당",
        "source_type": "web_official",
        "locale": "ko",
    },
    "visitgyeongju/souvenirs": {
        "source_name": "비지트경주 기념품",
        "source_type": "web_official",
        "locale": "ko",
    },
}

LOCALE_ORDER = ["ko", "en", "ja", "zh-CN", "zh-TW"]

# Souvenir PHYSICAL_PLACE assessment — based on business name + address presence
SOUVENIR_PHYSICAL_INDICATORS = {
    "대릉원 예술창고": "PHYSICAL_PLACE",
    "경주기념품상점": "PHYSICAL_PLACE",
    "너나들이": "PHYSICAL_PLACE",
    "청년감성상점": "PHYSICAL_PLACE",
    "포스트카드오피스": "PHYSICAL_PLACE",
    "디스모먼트": "PHYSICAL_PLACE",
    "제로스페이스 경주": "PHYSICAL_PLACE",
    "배리삼릉공원": "PHYSICAL_PLACE",
}


# ──────────────────────────────────────────────────────────────
# Normalization helpers
# ──────────────────────────────────────────────────────────────

def norm_name(s: str) -> str:
    """Unicode NFC + whitespace collapse + lowercase for comparison."""
    if not s:
        return ""
    s = unicodedata.normalize("NFC", s)
    return re.sub(r"\s+", " ", s).strip().lower()


def norm_name_display(s: str) -> str:
    """Unicode NFC + whitespace collapse (preserve case) for display."""
    if not s:
        return ""
    s = unicodedata.normalize("NFC", s)
    return re.sub(r"\s+", " ", s).strip()


def norm_phone(s: str) -> str:
    """Digits only for comparison."""
    if not s:
        return ""
    return re.sub(r"\D", "", s)


def norm_address(s: str) -> str:
    """Simple address normalization for comparison."""
    if not s:
        return ""
    s = unicodedata.normalize("NFC", s)
    # Remove leading/trailing, collapse spaces
    s = re.sub(r"\s+", " ", s).strip()
    # Remove common prefixes for comparison
    s = re.sub(r"^경상북도\s*", "", s)
    s = re.sub(r"^경북\s*", "", s)
    s = re.sub(r"^경주시\s*", "", s)
    return s.lower()


def clean_html(s: str) -> str:
    if not s:
        return s
    return html_lib.unescape(s)


def sha256_str(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ──────────────────────────────────────────────────────────────
# I/O helpers
# ──────────────────────────────────────────────────────────────

def read_jsonl(path: Path) -> list:
    recs = []
    if not path.exists():
        return recs
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            recs.append(json.loads(line))
    return recs


def read_json(path: Path) -> dict:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def write_jsonl(path: Path, records: list, sort_key=None) -> str:
    """Write JSONL, optionally sorted. Returns SHA256 of written content."""
    path.parent.mkdir(parents=True, exist_ok=True)
    if sort_key and records:
        records = sorted(records, key=sort_key)
    content = "\n".join(json.dumps(r, ensure_ascii=False, sort_keys=True) for r in records)
    if records:
        content += "\n"
    path.write_text(content, encoding="utf-8")
    return sha256_str(content)


def write_json(path: Path, data: dict) -> str:
    """Write JSON. Returns SHA256."""
    path.parent.mkdir(parents=True, exist_ok=True)
    content = json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    path.write_text(content, encoding="utf-8")
    return sha256_str(content)


# ──────────────────────────────────────────────────────────────
# Phase 1: Load inputs
# ──────────────────────────────────────────────────────────────

def load_inputs(args):
    """Load all input files. Returns dict of loaded data."""
    data = {}

    # 1a. Baseline 831 candidates
    baseline_path = Path(args.baseline)
    assert baseline_path.exists(), f"Baseline not found: {baseline_path}"
    data["candidates"] = read_jsonl(baseline_path)
    assert len(data["candidates"]) == 831, f"Expected 831 candidates, got {len(data['candidates'])}"
    print(f"  [OK] baseline: {len(data['candidates'])} candidates")

    # 1b. Source facts 907
    sf_path = Path(args.source_facts)
    assert sf_path.exists(), f"Source facts not found: {sf_path}"
    data["source_facts"] = read_jsonl(sf_path)
    assert len(data["source_facts"]) == 907, f"Expected 907 source facts, got {len(data['source_facts'])}"
    print(f"  [OK] source_facts: {len(data['source_facts'])} records")

    # 1c. Web raw (gyeongju.go.kr)
    raw_root = Path(args.web_raw_root)
    data["web_attractions"] = read_jsonl(raw_root / "attractions/attractions-raw.jsonl")
    data["web_monthly_recs"] = read_jsonl(raw_root / "monthly-recommendations/monthly-recommendations-raw.jsonl")
    data["web_monthly_recs_rej"] = read_jsonl(raw_root / "monthly-recommendations/monthly-recommendations-rejected.jsonl")
    data["web_courses"] = read_jsonl(raw_root / "courses/courses-raw.jsonl")
    data["web_heritage"] = read_jsonl(raw_root / "heritage/heritage-raw.jsonl")
    data["web_cultural_guides"] = read_jsonl(raw_root / "cultural-guides/cultural-guides-raw.jsonl")
    data["web_events"] = read_jsonl(raw_root / "events/events-raw.jsonl")
    data["web_restaurants"] = read_jsonl(raw_root / "restaurants/restaurants-raw.jsonl")
    data["web_souvenirs"] = read_jsonl(raw_root / "souvenirs/souvenirs-raw.jsonl")

    print(f"  [OK] web_attractions: {len(data['web_attractions'])}")
    print(f"  [OK] web_monthly_recs: {len(data['web_monthly_recs'])} valid / {len(data['web_monthly_recs_rej'])} rejected")
    print(f"  [OK] web_courses: {len(data['web_courses'])}, web_heritage: {len(data['web_heritage'])}")
    print(f"  [OK] web_cultural_guides: {len(data['web_cultural_guides'])}")
    print(f"  [OK] web_events: {len(data['web_events'])}")
    print(f"  [OK] web_restaurants: {len(data['web_restaurants'])}, web_souvenirs: {len(data['web_souvenirs'])}")

    # 1d. Existing pilot audits (read-only reference)
    repo_root = Path(__file__).parent.parent
    data["pilot_api_web"] = read_jsonl(
        repo_root / "data/tourapi/validation/gyeongju/gyeongju-culture-tourism/gyeongju-api-web-link-audit-v1.jsonl"
    )
    data["pilot_cand_link"] = read_jsonl(
        repo_root / "data/tourapi/validation/gyeongju/gyeongju-culture-tourism/gyeongju-candidate-link-audit-v1.jsonl"
    )
    data["pilot_vg_cand"] = read_jsonl(
        repo_root / "data/tourapi/validation/gyeongju/visitgyeongju/visitgyeongju-candidate-link-audit-v1.jsonl"
    )
    data["pilot_vg_lang"] = read_jsonl(
        repo_root / "data/tourapi/validation/gyeongju/visitgyeongju/visitgyeongju-language-link-audit-v1.jsonl"
    )
    data["filter_audit"] = read_json(
        repo_root / "data/tourapi/validation/gyeongju/visitgyeongju/visitgyeongju-filter-audit-v1.json"
    )
    print(f"  [OK] pilot audits loaded")

    return data


# ──────────────────────────────────────────────────────────────
# Phase 2: Build lookup indexes
# ──────────────────────────────────────────────────────────────

def build_indexes(data):
    idx = {}

    # Candidate indexes
    idx["cand_by_id"] = {c["candidate_id"]: c for c in data["candidates"]}
    idx["sfid_to_cand"] = {}
    idx["cand_by_norm_name"] = defaultdict(list)
    idx["cand_by_norm_phone"] = defaultdict(list)

    for c in data["candidates"]:
        for sf in (c.get("linked_source_facts") or []):
            idx["sfid_to_cand"][sf] = c["candidate_id"]
        n = norm_name(c.get("title_ko"))
        if n:
            idx["cand_by_norm_name"][n].append(c["candidate_id"])
        p = norm_phone(c.get("phone") or "")
        if p and len(p) >= 9:
            idx["cand_by_norm_phone"][p].append(c["candidate_id"])

    # Source fact indexes
    idx["sf_by_id"] = {sf["source_fact_id"]: sf for sf in data["source_facts"]}
    idx["gj01_sf_by_name"] = defaultdict(list)
    idx["gj01_sf_by_phone"] = defaultdict(list)
    idx["city_rest_sf_by_name"] = defaultdict(list)
    idx["kto_rest_sf_by_name"] = defaultdict(list)
    idx["kto_event_by_name"] = defaultdict(list)
    idx["kto_att_sf_by_name"] = defaultdict(list)

    for sf in data["source_facts"]:
        src = sf.get("source", "")
        n = norm_name(sf.get("title_ko"))
        p = norm_phone(sf.get("phone") or "")

        if src == "gyeongju-city/touristDestinationService":
            if n:
                idx["gj01_sf_by_name"][n].append(sf["source_fact_id"])
            if p and len(p) >= 9:
                idx["gj01_sf_by_phone"][p].append(sf["source_fact_id"])

        elif src in ("gyeongju-city/eatHtpService", "gyeongju-city/menuRstrtService"):
            if n:
                idx["city_rest_sf_by_name"][n].append(sf["source_fact_id"])

        elif src == "kto/KorService2/type39":
            if n:
                idx["kto_rest_sf_by_name"][n].append(sf["source_fact_id"])

        elif src == "kto/KorService2/type15":
            if n:
                idx["kto_event_by_name"][n].append(sf["source_fact_id"])

        elif src in ("kto/KorService2/type12", "kto/KorService2/type14"):
            if n:
                idx["kto_att_sf_by_name"][n].append(sf["source_fact_id"])

    # area_uid → gj01_source_fact_id (from pilot audit)
    idx["area_uid_to_sfid"] = {}
    for r in data["pilot_api_web"]:
        au = r.get("area_uid")
        sfid = r.get("gj01_source_fact_id")
        if au and sfid:
            idx["area_uid_to_sfid"][au] = sfid

    # visitgyeongju pilot: hex_id → candidate link
    idx["vg_hex_to_cand_link"] = {}
    for r in data["pilot_vg_cand"]:
        vg_id = r.get("vg_id")
        if vg_id:
            idx["vg_hex_to_cand_link"][vg_id] = {
                "candidate_id": r.get("candidate_id"),
                "confidence": r.get("confidence"),
                "link_basis": r.get("link_basis"),
            }

    return idx


# ──────────────────────────────────────────────────────────────
# Phase 3: Source Fact Enrichment
# ──────────────────────────────────────────────────────────────

def enrich_source_facts(data, as_of: str) -> list:
    """
    Enrich existing 907 source facts with normalized fields.
    Then add 159 web attraction + 84 restaurant + 8 souvenir facts.
    Returns deterministically sorted list.
    """
    enriched = []

    # 3a. Enrich existing 907
    for sf in sorted(data["source_facts"], key=lambda x: x["source_fact_id"]):
        meta = SOURCE_META.get(sf.get("source", ""), {})
        e = {
            "source_fact_id": sf["source_fact_id"],
            "source_name": meta.get("source_name", sf.get("source", "")),
            "source_type": meta.get("source_type", "api"),
            "source_record_id": sf.get("source_record_id"),
            "source_url": sf.get("official_url"),
            "entity_type": sf.get("category"),
            "locale": meta.get("locale", "ko"),
            "collected_at": sf.get("collected_at"),
            "as_of": as_of,
            "raw_snapshot_sha": None,  # API-based facts have no snapshot
            "name": sf.get("title_ko"),
            "normalized_name": norm_name_display(sf.get("title_ko")),
            "name_en": sf.get("title_en"),
            "address": sf.get("address"),
            "normalized_address": norm_address(sf.get("address")),
            "phone": sf.get("phone"),
            "normalized_phone": norm_phone(sf.get("phone") or ""),
            "coordinates": {
                "lat": sf.get("lat"),
                "lng": sf.get("lng"),
            } if sf.get("lat") else None,
            "district_or_area": sf.get("district_gyeongju"),
            "opening_hours": sf.get("opening_hours"),
            "admission_fee": sf.get("admission"),
            "closed_days": None,
            "parking": None,
            "official_external_url": sf.get("official_url"),
            "description_reference": sf.get("source_fact_id") if sf.get("description_ko") else None,
            "image_reference": sf.get("image_url") if sf.get("image_rights_status") == "VERIFIED_OFFICIAL" else None,
            "provenance": sf.get("provenance") or sf.get("source"),
            "parse_status": "PARSED",
            "origin_source": sf.get("source"),
        }
        enriched.append(e)

    # 3b. Add web attraction source facts (159)
    for att in sorted(data["web_attractions"], key=lambda x: str(x.get("area_uid", ""))):
        sfid = f"gyeongju-WEB-ATT-{att.get('area_uid', 0):05d}"
        e = {
            "source_fact_id": sfid,
            "source_name": "경주문화관광 관광지 웹",
            "source_type": "web_official",
            "source_record_id": str(att.get("area_uid")),
            "source_url": att.get("source_url"),
            "entity_type": "attraction",
            "locale": "ko",
            "collected_at": att.get("collected_at"),
            "as_of": as_of,
            "raw_snapshot_sha": att.get("body_sha256") if att.get("detail_fetched") else None,
            "name": att.get("name_ko"),
            "normalized_name": norm_name_display(att.get("name_ko")),
            "name_en": None,
            "address": att.get("address"),
            "normalized_address": norm_address(att.get("address")),
            "phone": att.get("phone"),
            "normalized_phone": norm_phone(att.get("phone") or ""),
            "coordinates": None,
            "district_or_area": att.get("region_name_ko"),
            "opening_hours": att.get("hours"),
            "admission_fee": att.get("admission"),
            "closed_days": att.get("closed"),
            "parking": att.get("parking"),
            "official_external_url": att.get("homepage"),
            "description_reference": None,
            "image_reference": None,
            "provenance": "gyeongju_web/attractions",
            "parse_status": att.get("detail_parse_status", "PARSED"),
            "origin_source": "gyeongju_web/attractions",
            "web_area_uid": att.get("area_uid"),
            "web_mnu_uid": att.get("mnu_uid"),
            "name_extract_method": att.get("name_extract_method"),
        }
        enriched.append(e)

    # 3c. Add visitgyeongju restaurant source facts (84)
    for rest in sorted(data["web_restaurants"], key=lambda x: x.get("hex_id", "")):
        sfid = f"gyeongju-VG-REST-{rest.get('hex_id', '')[:16]}"
        ko_loc = rest.get("locales", {}).get("ko", {})
        e = {
            "source_fact_id": sfid,
            "source_name": "비지트경주 식당",
            "source_type": "web_official",
            "source_record_id": rest.get("hex_id"),
            "source_url": ko_loc.get("url", f"https://www.visitgyeongju.or.kr/kr/cuisine/view/{rest.get('hex_id')}"),
            "entity_type": "restaurant",
            "locale": "ko",
            "collected_at": rest.get("collected_at"),
            "as_of": as_of,
            "raw_snapshot_sha": ko_loc.get("body_sha256"),
            "name": rest.get("name_ko"),
            "normalized_name": norm_name_display(rest.get("name_ko")),
            "name_en": rest.get("locales", {}).get("en", {}).get("entity_name"),
            "address": rest.get("address_ko"),
            "normalized_address": norm_address(rest.get("address_ko")),
            "phone": rest.get("phone"),
            "normalized_phone": norm_phone(rest.get("phone") or ""),
            "coordinates": None,
            "district_or_area": None,
            "opening_hours": None,
            "admission_fee": None,
            "closed_days": None,
            "parking": None,
            "official_external_url": ko_loc.get("url"),
            "description_reference": None,
            "image_reference": None,
            "provenance": "visitgyeongju/restaurants",
            "parse_status": ko_loc.get("language_class", "PARSED"),
            "origin_source": "visitgyeongju/restaurants",
            "vg_hex_id": rest.get("hex_id"),
            "locale_coverage": sorted([lc for lc in rest.get("locales", {}).keys()]),
        }
        enriched.append(e)

    # 3d. Add visitgyeongju souvenir source facts (8)
    for souv in sorted(data["web_souvenirs"], key=lambda x: x.get("hex_id", "")):
        sfid = f"gyeongju-VG-SOUV-{souv.get('hex_id', '')[:16]}"
        ko_loc = souv.get("locales", {}).get("ko", {})
        e = {
            "source_fact_id": sfid,
            "source_name": "비지트경주 기념품",
            "source_type": "web_official",
            "source_record_id": souv.get("hex_id"),
            "source_url": ko_loc.get("url"),
            "entity_type": "souvenir_shop",
            "locale": "ko",
            "collected_at": souv.get("collected_at"),
            "as_of": as_of,
            "raw_snapshot_sha": ko_loc.get("body_sha256"),
            "name": souv.get("name_ko"),
            "normalized_name": norm_name_display(souv.get("name_ko")),
            "name_en": souv.get("locales", {}).get("en", {}).get("entity_name"),
            "address": None,
            "normalized_address": None,
            "phone": None,
            "normalized_phone": None,
            "coordinates": None,
            "district_or_area": None,
            "opening_hours": None,
            "admission_fee": None,
            "closed_days": None,
            "parking": None,
            "official_external_url": ko_loc.get("url"),
            "description_reference": None,
            "image_reference": None,
            "provenance": "visitgyeongju/souvenirs",
            "parse_status": ko_loc.get("language_class", "PARSED"),
            "origin_source": "visitgyeongju/souvenirs",
            "vg_hex_id": souv.get("hex_id"),
            "locale_coverage": sorted([lc for lc in souv.get("locales", {}).keys()]),
        }
        enriched.append(e)

    print(f"  Enriched source facts: {len(enriched)} (907 existing + {len(enriched)-907} new)")
    return enriched


# ──────────────────────────────────────────────────────────────
# Phase 4: Attraction Identity Linking (159)
# ──────────────────────────────────────────────────────────────

def link_attraction_identity(att: dict, idx: dict) -> dict:
    """Determine identity verdict for one web attraction vs 831 candidates."""
    au = att.get("area_uid")
    n = norm_name(att.get("name_ko"))
    p = norm_phone(att.get("phone") or "")
    addr = norm_address(att.get("address") or "")

    web_sfid = f"gyeongju-WEB-ATT-{au:05d}" if au else None
    evidence_codes = []
    evidence_values = []
    candidate_id = None
    linked_sfid = None
    conflict_fields = []
    alternative_sfids = []

    # Evidence 1: area_uid in existing api-web pilot audit → gj01 sfid → candidate
    sfid_from_audit = idx["area_uid_to_sfid"].get(au)
    if sfid_from_audit:
        cid = idx["sfid_to_cand"].get(sfid_from_audit)
        if cid:
            candidate_id = cid
            linked_sfid = sfid_from_audit
            evidence_codes.append("PILOT_AUDIT_AREA_UID_MATCH")
            evidence_values.append({"area_uid": au, "gj01_sfid": sfid_from_audit})
            # Check field conflicts
            cand = idx["cand_by_id"].get(cid, {})
            if cand.get("phone") and p and norm_phone(cand.get("phone")) != p:
                conflict_fields.append("phone")
            if cand.get("title_ko") and n and norm_name(cand.get("title_ko")) != n:
                conflict_fields.append("name")

            verdict = VERDICT["HIGH_CONFIDENCE"]
            confidence_score = 0.95
            return _build_identity(web_sfid, candidate_id, verdict, evidence_codes, evidence_values,
                                   conflict_fields, confidence_score, linked_sfid, alternative_sfids, "auto")

    # Evidence 2: name match → GJ01 source fact → candidate
    gj01_sfids = sorted(idx["gj01_sf_by_name"].get(n, []))
    if gj01_sfids:
        linked_sfid = gj01_sfids[0]
        cid = idx["sfid_to_cand"].get(linked_sfid)
        alternative_sfids = gj01_sfids[1:]
        if cid:
            candidate_id = cid
            evidence_codes.append("GJ01_SF_NAME_MATCH_WITH_CANDIDATE")
            evidence_values.append({"normalized_name": n, "gj01_sfid": linked_sfid})
            verdict = VERDICT["HIGH_CONFIDENCE"]
            confidence_score = 0.90
            cand = idx["cand_by_id"].get(cid, {})
            if cand.get("phone") and p and norm_phone(cand.get("phone")) != p:
                conflict_fields.append("phone")
            return _build_identity(web_sfid, candidate_id, verdict, evidence_codes, evidence_values,
                                   conflict_fields, confidence_score, linked_sfid, alternative_sfids, "auto")
        else:
            # GJ01 SF exists but no candidate yet — candidate may be linked via different SF
            # Try name match directly to candidate
            cids_by_name = sorted(idx["cand_by_norm_name"].get(n, []))
            if cids_by_name:
                candidate_id = cids_by_name[0]
                evidence_codes.append("GJ01_SF_NAME_MATCH_PLUS_CAND_NAME_MATCH")
                evidence_values.append({"normalized_name": n, "gj01_sfid": linked_sfid, "candidate_id": candidate_id})
                verdict = VERDICT["HIGH_CONFIDENCE"]
                confidence_score = 0.88
                return _build_identity(web_sfid, candidate_id, verdict, evidence_codes, evidence_values,
                                       conflict_fields, confidence_score, linked_sfid, [], "auto")
            else:
                # GJ01 SF exists, no candidate — this means it's a candidate without link
                evidence_codes.append("GJ01_SF_NAME_MATCH_NO_CANDIDATE")
                evidence_values.append({"normalized_name": n, "gj01_sfid": linked_sfid})
                verdict = VERDICT["NEW_OFFICIAL_PLACE"]
                confidence_score = 0.85
                return _build_identity(web_sfid, None, verdict, evidence_codes, evidence_values,
                                       [], confidence_score, linked_sfid, [], "manual")

    # Evidence 3: name match directly to KTO type12 source fact → candidate
    kto_sfids = sorted(idx["kto_att_sf_by_name"].get(n, []))
    if kto_sfids:
        sfid = kto_sfids[0]
        cid = idx["sfid_to_cand"].get(sfid)
        if cid:
            candidate_id = cid
            evidence_codes.append("KTO12_SF_NAME_MATCH_WITH_CANDIDATE")
            evidence_values.append({"normalized_name": n, "kto_sfid": sfid})
            verdict = VERDICT["HIGH_CONFIDENCE"]
            confidence_score = 0.87
            return _build_identity(web_sfid, candidate_id, verdict, evidence_codes, evidence_values,
                                   [], confidence_score, sfid, [], "auto")

    # Evidence 4: name match directly to candidate
    cids_by_name = sorted(idx["cand_by_norm_name"].get(n, []))
    if cids_by_name:
        candidate_id = cids_by_name[0]
        evidence_codes.append("CAND_NAME_MATCH")
        evidence_values.append({"normalized_name": n, "candidate_id": candidate_id})
        verdict = VERDICT["MANUAL_REVIEW"]
        confidence_score = 0.60
        return _build_identity(web_sfid, candidate_id, verdict, evidence_codes, evidence_values,
                               [], confidence_score, None, [], "manual")

    # Evidence 5: phone match
    if p and len(p) >= 9:
        gj01_sfids_ph = sorted(idx["gj01_sf_by_phone"].get(p, []))
        if gj01_sfids_ph:
            sfid = gj01_sfids_ph[0]
            cid = idx["sfid_to_cand"].get(sfid)
            evidence_codes.append("PHONE_MATCH_GJ01_SF")
            evidence_values.append({"phone": p, "gj01_sfid": sfid})
            verdict = VERDICT["MANUAL_REVIEW"]
            confidence_score = 0.50
            return _build_identity(web_sfid, cid, verdict, evidence_codes, evidence_values,
                                   [], confidence_score, sfid, [], "manual")

    # No match found
    evidence_codes.append("NO_LINKABLE_EVIDENCE")
    evidence_values.append({"normalized_name": n, "area_uid": au})

    # If has official name + address → NEW_OFFICIAL_PLACE candidate
    if att.get("name_ko") and att.get("address"):
        return _build_identity(web_sfid, None, VERDICT["NEW_OFFICIAL_PLACE"], evidence_codes, evidence_values,
                               [], 0.0, None, [], "manual")
    return _build_identity(web_sfid, None, VERDICT["INSUFFICIENT_EVIDENCE"], evidence_codes, evidence_values,
                           [], 0.0, None, [], "manual")


def _build_identity(web_sfid, candidate_id, verdict, evidence_codes, evidence_values,
                    conflict_fields, confidence_score, linked_sfid, alternative_sfids, review_mode):
    return {
        "source_fact_id": web_sfid,
        "baseline_candidate_id": candidate_id,
        "verdict": verdict,
        "evidence_codes": evidence_codes,
        "evidence_values": evidence_values,
        "conflict_fields": conflict_fields,
        "confidence_score": round(confidence_score, 3),
        "linked_api_source_fact_id": linked_sfid,
        "alternative_source_fact_ids": alternative_sfids,
        "review_mode": review_mode,
    }


# ──────────────────────────────────────────────────────────────
# Phase 5: Restaurant Identity Linking (84)
# ──────────────────────────────────────────────────────────────

def link_restaurant_identity(rest: dict, idx: dict) -> dict:
    """Determine identity verdict for one visitgyeongju restaurant vs 831 candidates."""
    hex_id = rest.get("hex_id", "")
    n = norm_name(rest.get("name_ko"))
    p = norm_phone(rest.get("phone") or "")
    addr = norm_address(rest.get("address_ko") or "")

    web_sfid = f"gyeongju-VG-REST-{hex_id[:16]}"
    evidence_codes = []
    evidence_values = []
    candidate_id = None
    conflict_fields = []

    # Evidence 1: pilot audit link
    pilot = idx["vg_hex_to_cand_link"].get(hex_id)
    if pilot:
        conf = pilot.get("confidence")
        cid = pilot.get("candidate_id")
        if conf == "HIGH_CONFIDENCE" and cid:
            evidence_codes.append("PILOT_VG_CAND_HIGH_CONFIDENCE")
            evidence_values.append({"hex_id": hex_id[:16], "candidate_id": cid, "link_basis": pilot.get("link_basis")})
            return _build_identity(web_sfid, cid, VERDICT["HIGH_CONFIDENCE"], evidence_codes, evidence_values,
                                   [], 0.95, None, [], "auto")
        elif conf == "NO_MATCH":
            evidence_codes.append("PILOT_VG_CAND_NO_MATCH")
            evidence_values.append({"hex_id": hex_id[:16]})
            # Could still be NEW_OFFICIAL_PLACE if has address
            if rest.get("name_ko") and rest.get("address_ko"):
                return _build_identity(web_sfid, None, VERDICT["NEW_OFFICIAL_PLACE"], evidence_codes, evidence_values,
                                       [], 0.0, None, [], "manual")
            return _build_identity(web_sfid, None, VERDICT["NO_MATCH"], evidence_codes, evidence_values,
                                   [], 0.0, None, [], "manual")
        else:
            evidence_codes.append("PILOT_VG_CAND_MANUAL")
            evidence_values.append({"hex_id": hex_id[:16], "confidence": conf})

    # Evidence 2: city restaurant SF name match → candidate
    city_sfids = sorted(idx["city_rest_sf_by_name"].get(n, []))
    if city_sfids:
        sfid = city_sfids[0]
        cid = idx["sfid_to_cand"].get(sfid)
        if cid:
            evidence_codes.append("CITY_REST_SF_NAME_MATCH_WITH_CANDIDATE")
            evidence_values.append({"normalized_name": n, "city_sfid": sfid})
            # Check phone conflict
            cand = idx["cand_by_id"].get(cid, {})
            if cand.get("phone") and p and norm_phone(cand.get("phone")) != p:
                conflict_fields.append("phone")
            verdict = VERDICT["HIGH_CONFIDENCE"] if not conflict_fields else VERDICT["MANUAL_REVIEW"]
            score = 0.90 if not conflict_fields else 0.65
            return _build_identity(web_sfid, cid, verdict, evidence_codes, evidence_values,
                                   conflict_fields, score, sfid, [], "auto" if not conflict_fields else "manual")

    # Evidence 3: KTO restaurant SF name match → candidate
    kto_sfids = sorted(idx["kto_rest_sf_by_name"].get(n, []))
    if kto_sfids:
        sfid = kto_sfids[0]
        cid = idx["sfid_to_cand"].get(sfid)
        if cid:
            evidence_codes.append("KTO_REST_SF_NAME_MATCH_WITH_CANDIDATE")
            evidence_values.append({"normalized_name": n, "kto_sfid": sfid})
            return _build_identity(web_sfid, cid, VERDICT["MANUAL_REVIEW"], evidence_codes, evidence_values,
                                   [], 0.65, sfid, [], "manual")

    # Evidence 4: candidate restaurant name match
    cids = sorted(idx["cand_by_norm_name"].get(n, []))
    if cids:
        cid = cids[0]
        evidence_codes.append("CAND_NAME_MATCH")
        evidence_values.append({"normalized_name": n, "candidate_id": cid})
        cand = idx["cand_by_id"].get(cid, {})
        if cand.get("phone") and p and norm_phone(cand.get("phone")) != p:
            conflict_fields.append("phone")
        if cand.get("address") and addr and norm_address(cand.get("address")) != addr:
            conflict_fields.append("address")
        # Multiple candidates with same name → SEPARATE_BRANCH risk
        if len(cids) > 1:
            evidence_codes.append("MULTIPLE_CAND_SAME_NAME")
            return _build_identity(web_sfid, None, VERDICT["MANUAL_REVIEW"], evidence_codes, evidence_values,
                                   conflict_fields, 0.45, None, [], "manual")
        verdict = VERDICT["MANUAL_REVIEW"]
        score = 0.55 if not conflict_fields else 0.40
        return _build_identity(web_sfid, cid, verdict, evidence_codes, evidence_values,
                               conflict_fields, score, None, [], "manual")

    # No match
    evidence_codes.append("NO_LINKABLE_EVIDENCE")
    evidence_values.append({"normalized_name": n, "hex_id": hex_id[:16]})
    if rest.get("name_ko") and rest.get("address_ko"):
        return _build_identity(web_sfid, None, VERDICT["NEW_OFFICIAL_PLACE"], evidence_codes, evidence_values,
                               [], 0.0, None, [], "manual")
    return _build_identity(web_sfid, None, VERDICT["NO_MATCH"], evidence_codes, evidence_values,
                           [], 0.0, None, [], "manual")


# ──────────────────────────────────────────────────────────────
# Phase 6: Souvenir Classification (8)
# ──────────────────────────────────────────────────────────────

def classify_souvenir(souv: dict, idx: dict) -> dict:
    """Classify souvenir as PHYSICAL_PLACE, CONTENT_ONLY, or AMBIGUOUS."""
    hex_id = souv.get("hex_id", "")
    name = souv.get("name_ko", "")
    ko_loc = souv.get("locales", {}).get("ko", {})
    url = ko_loc.get("url", "")
    web_sfid = f"gyeongju-VG-SOUV-{hex_id[:16]}"

    physical_type = SOUVENIR_PHYSICAL_INDICATORS.get(name)

    # Additional check: has ko address
    has_address = bool(souv.get("address_ko") or ko_loc.get("address"))

    if physical_type == "PHYSICAL_PLACE" or has_address:
        place_type = "PHYSICAL_PLACE"
        evidence = ["KNOWN_PHYSICAL_ESTABLISHMENT" if physical_type else "ADDRESS_PRESENT"]
        category_proposal = "attraction"
        subcategory_proposal = "souvenir_shop"
    else:
        place_type = "AMBIGUOUS"
        evidence = ["NO_ADDRESS_AVAILABLE", "BUSINESS_NAME_PRESENT"]
        category_proposal = None
        subcategory_proposal = None

    # Try to link to existing candidate (for PHYSICAL_PLACE)
    candidate_id = None
    if place_type == "PHYSICAL_PLACE":
        n = norm_name(name)
        cids = sorted(idx["cand_by_norm_name"].get(n, []))
        if cids:
            candidate_id = cids[0]

    return {
        "source_fact_id": web_sfid,
        "vg_hex_id": hex_id,
        "name_ko": name,
        "name_en": souv.get("locales", {}).get("en", {}).get("entity_name"),
        "official_url": url,
        "place_type": place_type,
        "evidence_codes": evidence,
        "category_proposal": category_proposal,
        "subcategory_proposal": subcategory_proposal,
        "baseline_candidate_id": candidate_id,
        "identity_status": "HIGH_CONFIDENCE" if candidate_id else ("NEW_OFFICIAL_PLACE" if place_type == "PHYSICAL_PLACE" else "CONTENT_ONLY"),
        "review_required": place_type == "AMBIGUOUS" or candidate_id is None,
        "locale_coverage": sorted(souv.get("locales", {}).keys()),
    }


# ──────────────────────────────────────────────────────────────
# Phase 7: Multilingual Entity Linking
# ──────────────────────────────────────────────────────────────

def build_multilingual_entities(data) -> list:
    """Build one entity record per hexID with 5 locale variants."""
    entities = []
    for rest in sorted(data["web_restaurants"], key=lambda x: x.get("hex_id", "")):
        entities.append(_multilingual_entity(rest, "restaurant"))
    for souv in sorted(data["web_souvenirs"], key=lambda x: x.get("hex_id", "")):
        entities.append(_multilingual_entity(souv, "souvenir"))
    return entities


def _multilingual_entity(rec: dict, content_type: str) -> dict:
    hex_id = rec.get("hex_id", "")
    locales = rec.get("locales", {})

    locale_variants = []
    for lc in LOCALE_ORDER:
        loc = locales.get(lc, {})
        url = loc.get("url", "")
        locale_variants.append({
            "locale": lc,
            "official_url": url,
            "entity_name": loc.get("entity_name"),
            "address": loc.get("address"),
            "phone": loc.get("phone"),
            "translation_classification": loc.get("language_class", "NOT_FETCHED"),
            "name_extract_method": loc.get("name_extract_method"),
            "body_sha256": loc.get("body_sha256"),
            "body_size_bytes": loc.get("body_size_bytes"),
            "http_status": loc.get("http_status"),
            "collected_at": rec.get("collected_at"),
        })

    coverage = {
        lc: (locales.get(lc, {}).get("language_class") == "VALID_TRANSLATED_DETAIL")
        for lc in LOCALE_ORDER
    }

    return {
        "entity_source_id": f"gyeongju-VG-{content_type.upper()[:4]}-{hex_id[:16]}",
        "vg_hex_id": hex_id,
        "content_type": content_type,
        "name_ko": rec.get("name_ko"),
        "all_locales_valid": all(coverage.values()),
        "locale_coverage": coverage,
        "locale_variants": locale_variants,
        "collected_at": rec.get("collected_at"),
    }


# ──────────────────────────────────────────────────────────────
# Phase 8: Event Normalization (10 listings → 7 entities)
# ──────────────────────────────────────────────────────────────

def normalize_events(data, idx) -> tuple:
    """Returns (event_entities, listing_relations)."""
    events = data["web_events"]
    kto_events = [sf for sf in data["source_facts"] if sf.get("source") == "kto/KorService2/type15"]

    # Deduplicate by con_uid (deterministic: sort by con_uid first)
    seen = {}
    listing_relations = []
    for ev in sorted(events, key=lambda x: (x.get("con_uid", 0), x.get("year_collected", 0), x.get("month_collected", 0))):
        cid = ev.get("con_uid")
        ym = f"{ev.get('year_collected', 0)}-{int(ev.get('month_collected', 0)):02d}"
        listing_relations.append({
            "con_uid": cid,
            "listed_in_month": ym,
            "source_url": ev.get("source_url"),
            "detail_url": ev.get("detail_url"),
        })
        if cid not in seen:
            seen[cid] = ev

    # Build event entities
    event_entities = []
    for cid in sorted(seen.keys()):
        ev = seen[cid]
        name_clean = clean_html(ev.get("name_ko") or "")

        # Determine as_of status
        start = ev.get("start_date")
        end = ev.get("end_date")
        if start and end:
            status = "CURRENT_EVENT"
        elif start:
            status = "CURRENT_EVENT"
        else:
            status = "DATE_MISSING"

        # Check date consistency
        date_valid = True
        if start and end:
            date_valid = start <= end

        # Try to link to KTO type15 event
        kto_link = None
        n_norm = norm_name(name_clean)
        kto_sfids = sorted(idx["kto_event_by_name"].get(n_norm, []))
        if kto_sfids:
            kto_link = kto_sfids[0]

        event_entities.append({
            "event_entity_id": f"gyeongju-WEB-EV-{cid}",
            "con_uid": cid,
            "event_name_ko": name_clean,
            "event_type": ev.get("event_type"),
            "start_date": ev.get("start_date"),
            "end_date": ev.get("end_date"),
            "date_valid": date_valid,
            "venue": ev.get("venue"),
            "venue_address": ev.get("venue_address"),
            "organizer": ev.get("organizer"),
            "sponsor": ev.get("sponsor"),
            "contact": ev.get("contact"),
            "official_url": ev.get("source_url"),
            "external_official_url": ev.get("external_url"),
            "cancelled": ev.get("cancelled"),
            "name_extract_method": ev.get("name_extract_method"),
            "as_of_status": status,
            "kto_event_source_fact_id": kto_link,
            "listing_months": sorted(set(
                r["listed_in_month"] for r in listing_relations if r["con_uid"] == cid
            )),
            "listing_count": sum(1 for r in listing_relations if r["con_uid"] == cid),
        })

    event_entities.sort(key=lambda x: x["con_uid"])
    return event_entities, listing_relations


# ──────────────────────────────────────────────────────────────
# Phase 9: Collections (Monthly-Rec, Courses, Heritage, Guides)
# ──────────────────────────────────────────────────────────────

def build_monthly_rec_collections(data) -> tuple:
    """
    Returns (collections, place_relations).

    Note: monthly-rec 'places' field contains UI field-labels (BEST, 주차 정보, etc.)
    NOT actual attraction names — this is a known limitation of the V3 collector.
    Actual place identity is resolved via 'place_links' (area_uid-based) where available.
    """
    collections = []
    place_relations = []

    for mr in sorted(data["web_monthly_recs"], key=lambda x: x.get("mnu_uid", 0)):
        coll_id = f"gyeongju-MR-{mr.get('mnu_uid', 0)}"
        place_links = mr.get("place_links", []) or []
        places_labels = mr.get("places", []) or []

        collections.append({
            "collection_id": coll_id,
            "collection_type": "monthly_recommendation",
            "mnu_uid": mr.get("mnu_uid"),
            "year": mr.get("year"),
            "month": mr.get("month"),
            "theme": mr.get("theme"),
            "official_url": mr.get("source_url"),
            "place_links_count": len(place_links),
            "place_labels_count": len(places_labels),
            "parse_status": mr.get("parse_status"),
            "collected_at": mr.get("collected_at"),  # None in V3; no timestamp in raw
            "note": (
                "place_links를 통해 area_uid 기반 연결 가능"
                if place_links
                else "place_links 없음 — 상세페이지 HTML에서 area_uid 미추출 (V3 제한)"
            ),
        })

        # Use place_links (area_uid) as primary source — these are real attraction links
        if place_links:
            for i, pl in enumerate(sorted(place_links, key=lambda p: p.get("area_uid", 0))):
                area_uid = pl.get("area_uid")
                web_sfid = f"gyeongju-WEB-ATT-{area_uid:05d}" if area_uid else None
                place_relations.append({
                    "collection_id": coll_id,
                    "place_order": i,
                    "link_basis": "area_uid",
                    "area_uid": area_uid,
                    "web_source_fact_id": web_sfid,
                    "place_url": pl.get("url"),
                    "linked_candidate_id": None,   # resolved post-identity-audit
                    "identity_status": "LINKED_WEB_SF" if web_sfid else "UNKNOWN",
                })
        else:
            # No place_links: document the collection but no resolvable place relations
            place_relations.append({
                "collection_id": coll_id,
                "place_order": None,
                "link_basis": "UNRESOLVABLE",
                "area_uid": None,
                "web_source_fact_id": None,
                "place_url": None,
                "linked_candidate_id": None,
                "identity_status": "PLACE_LINKS_NOT_FOUND",
                "note": f"places field has {len(places_labels)} UI tab labels, not place names",
            })

    return collections, place_relations


def build_course_entities(data, idx) -> tuple:
    """Returns (course_entities, waypoint_relations)."""
    courses = []
    waypoints = []

    for co in sorted(data["web_courses"], key=lambda x: x.get("mnu_uid", 0)):
        course_id = f"gyeongju-COURSE-{co.get('mnu_uid', 0)}"
        courses.append({
            "course_id": course_id,
            "mnu_uid": co.get("mnu_uid"),
            "course_name_ko": co.get("course_name_ko"),
            "course_key": co.get("course_key"),
            "official_url": co.get("source_url"),
            "waypoint_count": co.get("waypoint_count", 0),
            "body_sha256": co.get("body_sha256"),
            "collected_at": co.get("collected_at"),
        })
        for i, wp in enumerate(sorted(co.get("waypoints", []), key=lambda w: w.get("area_uid", 0))):
            area_uid = wp.get("area_uid")
            web_sfid = f"gyeongju-WEB-ATT-{area_uid:05d}" if area_uid else None
            waypoints.append({
                "course_id": course_id,
                "waypoint_index": i,
                "area_uid": area_uid,
                "detail_url": wp.get("detail_url"),
                "web_source_fact_id": web_sfid,
                "identity_status": "LINKED" if area_uid else "UNKNOWN",
            })

    return courses, waypoints


def build_heritage_entities(data, idx) -> tuple:
    """Returns (heritage_entities, parent_child_relations)."""
    entities = []
    relations = []

    known_heritage_mnus = {p.get("mnu_uid") for p in data["web_heritage"]}

    for he in sorted(data["web_heritage"], key=lambda x: x.get("mnu_uid", 0)):
        heritage_id = f"gyeongju-HERITAGE-{he.get('mnu_uid', 0)}"
        entities.append({
            "heritage_id": heritage_id,
            "mnu_uid": he.get("mnu_uid"),
            "heritage_key": he.get("heritage_key"),
            "heritage_name_ko": he.get("heritage_name_ko"),
            "official_url": he.get("source_url"),
            "body_sha256": he.get("body_sha256"),
            "collected_at": he.get("collected_at"),
            "child_page_count_raw": len(he.get("child_pages", [])),
            "related_attraction_count_raw": he.get("related_attraction_count", 0),
        })

        # Filter child pages to known heritage mnu_uids
        for cp in he.get("child_pages", []):
            cp_mnu = cp.get("mnu_uid")
            if cp_mnu and cp_mnu in known_heritage_mnus and cp_mnu != he.get("mnu_uid"):
                child_he_id = f"gyeongju-HERITAGE-{cp_mnu}"
                relations.append({
                    "parent_heritage_id": heritage_id,
                    "child_heritage_id": child_he_id,
                    "child_mnu_uid": cp_mnu,
                    "relation_type": "PARENT_CHILD",
                    "link_text": cp.get("link_text"),
                    "href": cp.get("href"),
                })

        # Related attractions
        for ra in he.get("related_attractions", []):
            area_uid = ra.get("area_uid")
            if area_uid:
                web_sfid = f"gyeongju-WEB-ATT-{area_uid:05d}"
                cids = []  # Will be resolved via web attraction identity
                relations.append({
                    "parent_heritage_id": heritage_id,
                    "child_heritage_id": None,
                    "area_uid": area_uid,
                    "web_source_fact_id": web_sfid,
                    "relation_type": "RELATED_ATTRACTION",
                    "href": ra.get("detail_url"),
                })

    # Sort relations deterministically
    relations.sort(key=lambda r: (r["parent_heritage_id"], r["relation_type"], r.get("child_heritage_id") or "", r.get("area_uid") or 0))

    return entities, relations


def build_cultural_guide_relations(data, idx) -> list:
    """Build cultural guide service relations linked to candidate places."""
    relations = []
    cg_rec = data["web_cultural_guides"][0] if data["web_cultural_guides"] else {}
    guide_sites = cg_rec.get("guide_sites", [])

    for i, gs in enumerate(sorted(guide_sites, key=lambda x: x.get("name_ko", ""))):
        n = norm_name(gs.get("name_ko", ""))
        cids = sorted(idx["cand_by_norm_name"].get(n, []))
        relations.append({
            "guide_service_id": f"gyeongju-GUIDE-{i:02d}",
            "guide_name_ko": gs.get("name_ko"),
            "guide_assignment": gs.get("guide_assignment"),
            "linked_candidate_id": cids[0] if cids else None,
            "identity_status": "HIGH_CONFIDENCE" if cids else "MANUAL_REVIEW",
            "source_url": cg_rec.get("source_url"),
            "collected_at": cg_rec.get("collected_at"),
        })

    return relations


# ──────────────────────────────────────────────────────────────
# Phase 10: Filter/Attribute Taxonomy
# ──────────────────────────────────────────────────────────────

def build_filter_taxonomy(data) -> tuple:
    """Returns (taxonomy, entity_evidence, mapping_audit)."""
    fa = data["filter_audit"]

    taxonomy = {
        "source": "visitgyeongju-filter-audit-v1",
        "task": fa.get("task"),
        "verified_at": fa.get("verified_at"),
        "total_filter_groups": fa.get("total_filter_groups"),
        "total_options": fa.get("total_options"),
        "service_filter_count": fa.get("service_filter_count"),
        "ambiguous_filters": fa.get("ambiguous_filters", []),
        "unknown_handling": fa.get("unknown_handling"),
        "note": "Filter labels not extractable from detail page HTML. This taxonomy is from list page audit only.",
    }

    # Entity attribute evidence: all restaurants/souvenirs have UNKNOWN attributes
    entity_evidence = []
    for r in sorted(data["web_restaurants"], key=lambda x: x.get("hex_id", "")):
        entity_evidence.append({
            "entity_id": f"gyeongju-VG-REST-{r.get('hex_id','')[:16]}",
            "content_type": "restaurant",
            "filter_evidence_type": "DETAIL_PAGE_TAGS_NOT_FOUND",
            "attributes": {},
            "note": "visitgyeongju detail page does not expose filter labels in HTML",
        })

    mapping_audit = {
        "total_known_labels": fa.get("total_options", 0),
        "labels_with_entity_evidence": 0,
        "labels_without_evidence": fa.get("total_options", 0),
        "PROVISIONAL_mappings": 0,
        "MEANING_REVIEW_REQUIRED": [
            a.get("filter_ko") for a in fa.get("ambiguous_filters", [])
        ],
        "auto_applied_count": 0,
        "note": "No auto-application. Filter taxonomy preserved from pilot audit.",
    }

    return taxonomy, entity_evidence, mapping_audit


# ──────────────────────────────────────────────────────────────
# Phase 11: Full-v1 Candidate Result
# ──────────────────────────────────────────────────────────────

def build_full_v1_candidates(data, idx, att_identities, rest_identities, souv_classif) -> list:
    """
    Combine existing 831 with new official places.
    Returns sorted list.
    """
    # Start with existing 831 (immutable copy)
    full_v1 = []
    for c in sorted(data["candidates"], key=lambda x: x.get("candidate_id", "")):
        entry = dict(c)
        entry["_v1_source"] = "baseline_831"
        entry["_web_source_facts_linked"] = []
        full_v1.append(entry)

    cand_by_id = {c["candidate_id"]: c for c in full_v1}

    # Link web attraction identities to existing candidates
    for ident in att_identities:
        cid = ident.get("baseline_candidate_id")
        sfid = ident.get("source_fact_id")
        if cid and cid in cand_by_id:
            cand_by_id[cid].setdefault("_web_source_facts_linked", []).append(sfid)
            cand_by_id[cid]["_attraction_identity_verdict"] = ident["verdict"]

    # Link restaurant identities
    for ident in rest_identities:
        cid = ident.get("baseline_candidate_id")
        sfid = ident.get("source_fact_id")
        if cid and cid in cand_by_id:
            cand_by_id[cid].setdefault("_web_source_facts_linked", []).append(sfid)
            cand_by_id[cid]["_restaurant_identity_verdict"] = ident["verdict"]

    # Add NEW_OFFICIAL_PLACE candidates (attractions)
    new_att_count = 0
    for ident in sorted(att_identities, key=lambda x: x.get("source_fact_id", "")):
        if ident["verdict"] == VERDICT["NEW_OFFICIAL_PLACE"]:
            sfid = ident.get("source_fact_id", "")
            area_uid_str = sfid.replace("gyeongju-WEB-ATT-", "").lstrip("0") or "0"
            new_id = f"gyeongju-WEB-NEW-ATT-{area_uid_str}"
            # Find web attraction
            att = next(
                (a for a in data["web_attractions"]
                 if f"gyeongju-WEB-ATT-{a.get('area_uid', 0):05d}" == sfid),
                None
            )
            if att:
                full_v1.append({
                    "candidate_id": new_id,
                    "category": "attraction",
                    "title_ko": att.get("name_ko"),
                    "title_en": None,
                    "address": att.get("address"),
                    "phone": att.get("phone"),
                    "lat": None,
                    "lng": None,
                    "official_url": att.get("source_url"),
                    "opening_hours": att.get("hours"),
                    "admission": att.get("admission"),
                    "linked_source_facts": [sfid],
                    "identity_status": "NEW_OFFICIAL_PLACE",
                    "_v1_source": "web_attraction_new",
                    "_web_source_facts_linked": [sfid],
                })
                new_att_count += 1

    # Add NEW_OFFICIAL_PLACE candidates (restaurants)
    new_rest_count = 0
    for ident in sorted(rest_identities, key=lambda x: x.get("source_fact_id", "")):
        if ident["verdict"] == VERDICT["NEW_OFFICIAL_PLACE"]:
            sfid = ident.get("source_fact_id", "")
            rest = next(
                (r for r in data["web_restaurants"]
                 if f"gyeongju-VG-REST-{r.get('hex_id','')[:16]}" == sfid),
                None
            )
            if rest:
                new_id = f"gyeongju-VG-NEW-REST-{rest.get('hex_id','')[:16]}"
                full_v1.append({
                    "candidate_id": new_id,
                    "category": "restaurant",
                    "title_ko": rest.get("name_ko"),
                    "title_en": rest.get("locales", {}).get("en", {}).get("entity_name"),
                    "address": rest.get("address_ko"),
                    "phone": rest.get("phone"),
                    "lat": None,
                    "lng": None,
                    "official_url": rest.get("locales", {}).get("ko", {}).get("url"),
                    "linked_source_facts": [sfid],
                    "identity_status": "NEW_OFFICIAL_PLACE",
                    "_v1_source": "visitgyeongju_restaurant_new",
                    "_web_source_facts_linked": [sfid],
                    "vg_hex_id": rest.get("hex_id"),
                    "locale_coverage": sorted(rest.get("locales", {}).keys()),
                })
                new_rest_count += 1

    # Add PHYSICAL_PLACE souvenir candidates
    new_souv_count = 0
    for sc in sorted(souv_classif, key=lambda x: x.get("source_fact_id", "")):
        if sc["place_type"] == "PHYSICAL_PLACE" and sc["baseline_candidate_id"] is None:
            sfid = sc.get("source_fact_id", "")
            new_id = f"gyeongju-VG-NEW-SOUV-{sc.get('vg_hex_id','')[:16]}"
            full_v1.append({
                "candidate_id": new_id,
                "category": sc.get("category_proposal", "attraction"),
                "subcategory": sc.get("subcategory_proposal"),
                "title_ko": sc.get("name_ko"),
                "title_en": sc.get("name_en"),
                "address": None,
                "phone": None,
                "official_url": sc.get("official_url"),
                "linked_source_facts": [sfid],
                "identity_status": "NEW_OFFICIAL_PLACE",
                "_v1_source": "visitgyeongju_souvenir_new",
                "_web_source_facts_linked": [sfid],
                "vg_hex_id": sc.get("vg_hex_id"),
            })
            new_souv_count += 1

    print(f"  Full-v1 candidates: {len(full_v1)} (831 baseline + {new_att_count} new att + {new_rest_count} new rest + {new_souv_count} new souv)")

    # Sort by candidate_id
    full_v1.sort(key=lambda x: x.get("candidate_id", ""))
    return full_v1


# ──────────────────────────────────────────────────────────────
# Phase 12: Manual Review Queue
# ──────────────────────────────────────────────────────────────

def build_manual_review_queue(att_identities, rest_identities, souv_classif,
                               mr_place_rel, co_waypoints, guide_rel) -> list:
    queue = []

    for ident in att_identities:
        if ident["verdict"] in (VERDICT["MANUAL_REVIEW"], VERDICT["INSUFFICIENT_EVIDENCE"]):
            queue.append({
                "queue_id": f"MRQ-ATT-{ident.get('source_fact_id','')}",
                "source_fact_id": ident.get("source_fact_id"),
                "entity_type": "attraction",
                "verdict": ident["verdict"],
                "evidence_codes": ident["evidence_codes"],
                "reason": "Insufficient evidence for automatic identity determination",
                "baseline_candidate_id": ident.get("baseline_candidate_id"),
            })

    for ident in rest_identities:
        if ident["verdict"] in (VERDICT["MANUAL_REVIEW"], VERDICT["INSUFFICIENT_EVIDENCE"]):
            queue.append({
                "queue_id": f"MRQ-REST-{ident.get('source_fact_id','')}",
                "source_fact_id": ident.get("source_fact_id"),
                "entity_type": "restaurant",
                "verdict": ident["verdict"],
                "evidence_codes": ident["evidence_codes"],
                "reason": "Name-only or no match — address/phone verification needed",
                "baseline_candidate_id": ident.get("baseline_candidate_id"),
            })

    for sc in souv_classif:
        if sc.get("review_required"):
            queue.append({
                "queue_id": f"MRQ-SOUV-{sc.get('source_fact_id','')}",
                "source_fact_id": sc.get("source_fact_id"),
                "entity_type": "souvenir",
                "verdict": sc.get("identity_status"),
                "evidence_codes": sc.get("evidence_codes", []),
                "reason": "Physical/content classification needs verification or candidate linking",
                "baseline_candidate_id": sc.get("baseline_candidate_id"),
            })

    for rel in mr_place_rel:
        if rel.get("identity_status") == "MANUAL_REVIEW":
            queue.append({
                "queue_id": f"MRQ-MRPLACE-{rel.get('collection_id','')}-{rel.get('place_name_raw','')}",
                "source_fact_id": None,
                "entity_type": "monthly_rec_place",
                "verdict": "MANUAL_REVIEW",
                "evidence_codes": ["NO_EXACT_NAME_MATCH"],
                "reason": f"Recommendation place '{rel.get('place_name_raw')}' not found in candidates",
                "collection_id": rel.get("collection_id"),
                "baseline_candidate_id": None,
            })

    for rel in guide_rel:
        if rel.get("identity_status") == "MANUAL_REVIEW":
            queue.append({
                "queue_id": f"MRQ-GUIDE-{rel.get('guide_service_id','')}",
                "source_fact_id": None,
                "entity_type": "cultural_guide",
                "verdict": "MANUAL_REVIEW",
                "evidence_codes": ["NO_CANDIDATE_FOUND"],
                "reason": f"Guide site '{rel.get('guide_name_ko')}' not linked to candidate",
                "baseline_candidate_id": None,
            })

    queue.sort(key=lambda x: x["queue_id"])
    return queue


# ──────────────────────────────────────────────────────────────
# Phase 13: Baseline 831 Identity-Link Audit
# ──────────────────────────────────────────────────────────────

def build_baseline_identity_audit(data, att_identities, rest_identities) -> list:
    """For each of 831 candidates, record which web source facts now link to them."""
    cand_web_links = defaultdict(list)
    for ident in att_identities:
        cid = ident.get("baseline_candidate_id")
        if cid:
            cand_web_links[cid].append({
                "source_fact_id": ident.get("source_fact_id"),
                "entity_type": "attraction",
                "verdict": ident["verdict"],
                "confidence_score": ident["confidence_score"],
            })
    for ident in rest_identities:
        cid = ident.get("baseline_candidate_id")
        if cid:
            cand_web_links[cid].append({
                "source_fact_id": ident.get("source_fact_id"),
                "entity_type": "restaurant",
                "verdict": ident["verdict"],
                "confidence_score": ident["confidence_score"],
            })

    result = []
    for c in sorted(data["candidates"], key=lambda x: x.get("candidate_id", "")):
        cid = c["candidate_id"]
        links = cand_web_links.get(cid, [])
        result.append({
            "candidate_id": cid,
            "category": c.get("category"),
            "title_ko": c.get("title_ko"),
            "existing_source_facts": c.get("linked_source_facts") or [],
            "new_web_source_links": links,
            "new_web_links_count": len(links),
            "has_any_web_link": len(links) > 0,
        })

    return result


# ──────────────────────────────────────────────────────────────
# Phase 14: Field Conflict Audit
# ──────────────────────────────────────────────────────────────

def build_conflict_audit(data, idx, att_identities) -> list:
    """Build field-level conflict audit for HIGH_CONFIDENCE linked records."""
    conflicts = []
    for ident in sorted(att_identities, key=lambda x: x.get("source_fact_id", "")):
        if ident["verdict"] == VERDICT["HIGH_CONFIDENCE"] and ident.get("baseline_candidate_id"):
            cid = ident["baseline_candidate_id"]
            cand = idx["cand_by_id"].get(cid, {})
            sfid = ident.get("source_fact_id", "")
            au_str = sfid.replace("gyeongju-WEB-ATT-", "").lstrip("0") or "0"
            att = next(
                (a for a in data["web_attractions"] if str(a.get("area_uid", "")) == au_str),
                None
            )
            if not att:
                continue
            field_results = {}
            for field, web_val, api_val in [
                ("phone", att.get("phone"), cand.get("phone")),
                ("opening_hours", att.get("hours"), cand.get("opening_hours")),
                ("admission", att.get("admission"), cand.get("admission")),
            ]:
                if web_val and api_val:
                    match = (norm_phone(web_val) == norm_phone(api_val)
                             if field == "phone"
                             else norm_name(web_val) == norm_name(api_val))
                    field_results[field] = (
                        "WEB_AND_API_MATCH" if match else "FIELD_CONFLICT"
                    )
                elif web_val and not api_val:
                    field_results[field] = "WEB_ONLY"
                elif api_val and not web_val:
                    field_results[field] = "API_ONLY"

            has_conflict = any(v == "FIELD_CONFLICT" for v in field_results.values())
            if has_conflict or ident.get("conflict_fields"):
                conflicts.append({
                    "source_fact_id": sfid,
                    "candidate_id": cid,
                    "verdict": ident["verdict"],
                    "field_verdicts": field_results,
                    "conflict_fields": ident.get("conflict_fields", []),
                    "resolution": "WEB_PREFERRED_FOR_OPERATIONAL_INFO",
                })

    return conflicts


# ──────────────────────────────────────────────────────────────
# Main Pipeline
# ──────────────────────────────────────────────────────────────

def run_pipeline(args, run_id: str) -> dict:
    """Execute full normalization pipeline. Returns dict of {filename: sha256}."""
    as_of = args.as_of
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n[{run_id}] TASK-GYEONGJU-NORMALIZATION-AND-IDENTITY-V1 v{VERSION}")
    print(f"[{run_id}] as_of={as_of}, out={out_dir}")

    # Phase 1: Load
    print(f"\n[Phase 1] Loading inputs…")
    data = load_inputs(args)

    # Phase 2: Indexes
    print(f"\n[Phase 2] Building indexes…")
    idx = build_indexes(data)

    # Phase 3: Enrich source facts
    print(f"\n[Phase 3] Enriching source facts…")
    enriched_sfs = enrich_source_facts(data, as_of)

    # Phase 4: Attraction identity
    print(f"\n[Phase 4] Attraction identity linking ({len(data['web_attractions'])} attractions)…")
    att_identities = []
    for att in sorted(data["web_attractions"], key=lambda x: x.get("area_uid", 0)):
        ident = link_attraction_identity(att, idx)
        ident["area_uid"] = att.get("area_uid")
        ident["name_ko"] = att.get("name_ko")
        ident["region_key"] = att.get("region_key")
        att_identities.append(ident)
    att_identities.sort(key=lambda x: x.get("source_fact_id", ""))

    att_verdict_dist = Counter(i["verdict"] for i in att_identities)
    print(f"  Attraction verdicts: {dict(att_verdict_dist)}")

    # Phase 5: Restaurant identity
    print(f"\n[Phase 5] Restaurant identity linking ({len(data['web_restaurants'])} restaurants)…")
    rest_identities = []
    for rest in sorted(data["web_restaurants"], key=lambda x: x.get("hex_id", "")):
        ident = link_restaurant_identity(rest, idx)
        ident["name_ko"] = rest.get("name_ko")
        ident["hex_id"] = rest.get("hex_id")
        rest_identities.append(ident)
    rest_identities.sort(key=lambda x: x.get("source_fact_id", ""))

    rest_verdict_dist = Counter(i["verdict"] for i in rest_identities)
    print(f"  Restaurant verdicts: {dict(rest_verdict_dist)}")

    # Phase 6: Souvenir classification
    print(f"\n[Phase 6] Souvenir classification ({len(data['web_souvenirs'])} items)…")
    souv_classif = []
    for souv in sorted(data["web_souvenirs"], key=lambda x: x.get("hex_id", "")):
        souv_classif.append(classify_souvenir(souv, idx))
    souv_type_dist = Counter(s["place_type"] for s in souv_classif)
    print(f"  Souvenir types: {dict(souv_type_dist)}")

    # Phase 7: Multilingual entities
    print(f"\n[Phase 7] Multilingual entity linking…")
    multilingual_entities = build_multilingual_entities(data)

    # Phase 8: Event normalization
    print(f"\n[Phase 8] Event normalization…")
    event_entities, event_listing_rel = normalize_events(data, idx)
    print(f"  Events: {len(data['web_events'])} listings → {len(event_entities)} unique entities")

    # Phase 9: Collections
    print(f"\n[Phase 9] Collection normalization…")
    mr_collections, mr_place_rel = build_monthly_rec_collections(data)
    course_entities, course_waypoints = build_course_entities(data, idx)
    heritage_entities, heritage_relations = build_heritage_entities(data, idx)
    guide_relations = build_cultural_guide_relations(data, idx)
    print(f"  Monthly-rec: {len(mr_collections)} collections, {len(mr_place_rel)} place relations")
    print(f"  Courses: {len(course_entities)} courses, {len(course_waypoints)} waypoints")
    print(f"  Heritage: {len(heritage_entities)} entities, {len(heritage_relations)} relations")
    print(f"  Cultural guides: {len(guide_relations)} relations")

    # Phase 10: Filter taxonomy
    print(f"\n[Phase 10] Filter/attribute taxonomy…")
    filter_taxonomy, entity_attr_evidence, attr_mapping_audit = build_filter_taxonomy(data)

    # Phase 11: Full-v1 candidates
    print(f"\n[Phase 11] Building full-v1 candidates…")
    full_v1 = build_full_v1_candidates(data, idx, att_identities, rest_identities, souv_classif)

    # Phase 12: Manual review queue
    print(f"\n[Phase 12] Manual review queue…")
    manual_queue = build_manual_review_queue(
        att_identities, rest_identities, souv_classif, mr_place_rel, course_waypoints, guide_relations
    )
    print(f"  Manual review queue: {len(manual_queue)} items")

    # Phase 13: Baseline 831 identity audit
    print(f"\n[Phase 13] Baseline 831 identity-link audit…")
    baseline_audit = build_baseline_identity_audit(data, att_identities, rest_identities)

    # Phase 14: Field conflict audit
    print(f"\n[Phase 14] Field conflict audit…")
    conflict_audit = build_conflict_audit(data, idx, att_identities)
    print(f"  Field conflicts found: {len(conflict_audit)}")

    # ── Write all output files ──────────────────────────────
    print(f"\n[Phase 15] Writing output files…")
    sha_map = {}

    # 1. Full-v1 source facts
    sha_map["source-facts-full-v1.jsonl"] = write_jsonl(
        out_dir / "source-facts-full-v1.jsonl", enriched_sfs,
        sort_key=lambda x: x["source_fact_id"]
    )

    # 2. Baseline 831 identity-link audit
    sha_map["gyeongju-baseline-831-identity-link-audit.jsonl"] = write_jsonl(
        out_dir / "gyeongju-baseline-831-identity-link-audit.jsonl", baseline_audit,
        sort_key=lambda x: x["candidate_id"]
    )

    # 3. Attraction identity audit
    sha_map["gyeongju-attraction-identity-audit-v1.jsonl"] = write_jsonl(
        out_dir / "gyeongju-attraction-identity-audit-v1.jsonl", att_identities,
        sort_key=lambda x: x.get("source_fact_id", "")
    )

    # 4. Restaurant identity audit
    sha_map["gyeongju-restaurant-identity-audit-v1.jsonl"] = write_jsonl(
        out_dir / "gyeongju-restaurant-identity-audit-v1.jsonl", rest_identities,
        sort_key=lambda x: x.get("source_fact_id", "")
    )

    # 5. Souvenir classification audit
    sha_map["gyeongju-souvenir-classification-audit-v1.jsonl"] = write_jsonl(
        out_dir / "gyeongju-souvenir-classification-audit-v1.jsonl", souv_classif,
        sort_key=lambda x: x.get("source_fact_id", "")
    )

    # 6. Multilingual entity-link audit
    sha_map["gyeongju-multilingual-entity-link-audit-v1.jsonl"] = write_jsonl(
        out_dir / "gyeongju-multilingual-entity-link-audit-v1.jsonl", multilingual_entities,
        sort_key=lambda x: x.get("entity_source_id", "")
    )

    # 7. Field conflict audit
    sha_map["gyeongju-field-conflict-audit-v1.jsonl"] = write_jsonl(
        out_dir / "gyeongju-field-conflict-audit-v1.jsonl", conflict_audit,
        sort_key=lambda x: x.get("source_fact_id", "")
    )

    # 8. Recommendation collections
    sha_map["gyeongju-recommendation-collections-v1.jsonl"] = write_jsonl(
        out_dir / "gyeongju-recommendation-collections-v1.jsonl", mr_collections,
        sort_key=lambda x: x.get("collection_id", "")
    )

    # 9. Recommendation-place relations
    sha_map["gyeongju-recommendation-place-relations-v1.jsonl"] = write_jsonl(
        out_dir / "gyeongju-recommendation-place-relations-v1.jsonl", mr_place_rel,
        sort_key=lambda x: (x.get("collection_id", ""), x.get("place_order", 0))
    )

    # 10. Course entities
    sha_map["gyeongju-course-entities-v1.jsonl"] = write_jsonl(
        out_dir / "gyeongju-course-entities-v1.jsonl", course_entities,
        sort_key=lambda x: x.get("mnu_uid", 0)
    )

    # 11. Course-waypoint relations
    sha_map["gyeongju-course-waypoint-relations-v1.jsonl"] = write_jsonl(
        out_dir / "gyeongju-course-waypoint-relations-v1.jsonl", course_waypoints,
        sort_key=lambda x: (x.get("course_id", ""), x.get("area_uid") or 0)
    )

    # 12. Heritage entities
    sha_map["gyeongju-heritage-entities-v1.jsonl"] = write_jsonl(
        out_dir / "gyeongju-heritage-entities-v1.jsonl", heritage_entities,
        sort_key=lambda x: x.get("mnu_uid", 0)
    )

    # 13. Heritage parent/child-place relations
    sha_map["gyeongju-heritage-relations-v1.jsonl"] = write_jsonl(
        out_dir / "gyeongju-heritage-relations-v1.jsonl", heritage_relations,
        sort_key=lambda x: (x.get("parent_heritage_id", ""), x.get("relation_type", ""), x.get("area_uid") or 0)
    )

    # 14. Cultural-guide relations
    sha_map["gyeongju-cultural-guide-relations-v1.jsonl"] = write_jsonl(
        out_dir / "gyeongju-cultural-guide-relations-v1.jsonl", guide_relations,
        sort_key=lambda x: x.get("guide_service_id", "")
    )

    # 15. Event entities
    sha_map["gyeongju-event-entities-v1.jsonl"] = write_jsonl(
        out_dir / "gyeongju-event-entities-v1.jsonl", event_entities,
        sort_key=lambda x: x.get("con_uid", 0)
    )

    # 16. Event listing/KTO relations
    sha_map["gyeongju-event-listing-relations-v1.jsonl"] = write_jsonl(
        out_dir / "gyeongju-event-listing-relations-v1.jsonl", event_listing_rel,
        sort_key=lambda x: (x.get("con_uid", 0), x.get("listed_in_month", ""))
    )

    # 17. Source filter taxonomy
    sha_map["gyeongju-source-filter-taxonomy-v1.json"] = write_json(
        out_dir / "gyeongju-source-filter-taxonomy-v1.json", filter_taxonomy
    )

    # 18. Entity attribute evidence
    sha_map["gyeongju-entity-attribute-evidence-v1.jsonl"] = write_jsonl(
        out_dir / "gyeongju-entity-attribute-evidence-v1.jsonl", entity_attr_evidence,
        sort_key=lambda x: x.get("entity_id", "")
    )

    # 19. Normalized attribute mapping audit
    sha_map["gyeongju-attribute-mapping-audit-v1.json"] = write_json(
        out_dir / "gyeongju-attribute-mapping-audit-v1.json", attr_mapping_audit
    )

    # 20. Full-v1 candidate result
    sha_map["gyeongju-full-v1-candidates.jsonl"] = write_jsonl(
        out_dir / "gyeongju-full-v1-candidates.jsonl", full_v1,
        sort_key=lambda x: x.get("candidate_id", "")
    )

    # 21. Manual review queue
    sha_map["gyeongju-manual-review-queue-v1.jsonl"] = write_jsonl(
        out_dir / "gyeongju-manual-review-queue-v1.jsonl", manual_queue,
        sort_key=lambda x: x.get("queue_id", "")
    )

    # 22. Normalization summary
    new_cands = len(full_v1) - 831
    generated_at = now_iso()  # log-only; excluded from written file for reproducibility
    summary = {
        "task": TASK,
        "script_version": VERSION,
        "as_of": as_of,
        "generated_at_log_only": generated_at,
        "baseline_candidates": 831,
        "source_facts_input": 907,
        "source_facts_enriched_total": len(enriched_sfs),
        "attraction_identity": {
            "total": len(att_identities),
            **{k: v for k, v in att_verdict_dist.items()},
        },
        "restaurant_identity": {
            "total": len(rest_identities),
            **{k: v for k, v in rest_verdict_dist.items()},
        },
        "souvenir_classification": {
            "total": len(souv_classif),
            **{k: v for k, v in souv_type_dist.items()},
        },
        "events": {
            "listings_total": len(data["web_events"]),
            "unique_entities": len(event_entities),
        },
        "collections": {
            "monthly_rec": len(mr_collections),
            "monthly_rec_place_relations": len(mr_place_rel),
            "courses": len(course_entities),
            "course_waypoints": len(course_waypoints),
            "heritage_entities": len(heritage_entities),
            "heritage_relations": len(heritage_relations),
            "cultural_guides": len(guide_relations),
        },
        "multilingual_entities": len(multilingual_entities),
        "field_conflicts": len(conflict_audit),
        "manual_review_queue": len(manual_queue),
        "full_v1_candidates_total": len(full_v1),
        "new_candidates_added": new_cands,
        "output_files": len(sha_map),
    }
    sha_map["gyeongju-normalization-summary-v1.json"] = write_json(
        out_dir / "gyeongju-normalization-summary-v1.json",
        {k: v for k, v in summary.items() if k != "generated_at_log_only"}
    )

    print(f"\n[{run_id}] Done. Written {len(sha_map)} output files.")
    return sha_map, summary


# ──────────────────────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(
        description=f"경주 공식 데이터 정규화 v{VERSION}",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("--baseline", required=True,
                   help="기존 enriched candidate 831건 JSONL 경로")
    p.add_argument("--source-facts", required=True,
                   help="기존 source facts 907건 JSONL 경로")
    p.add_argument("--web-raw-root", required=True,
                   help="web-raw-v3/ 루트 디렉터리 경로")
    p.add_argument("--out", required=True,
                   help="출력 디렉터리 경로")
    p.add_argument("--as-of", default=AS_OF_DEFAULT,
                   help=f"정규화 기준 시각 (ISO-8601, default: {AS_OF_DEFAULT})")
    p.add_argument("--run-id", default="run1",
                   help="Run 식별자 (결과 데이터에 영향 없음, 로그용)")
    return p.parse_args()


def main():
    args = parse_args()
    sha_map, summary = run_pipeline(args, args.run_id)
    print(f"\n=== Normalization complete ===")
    for fname, sha in sorted(sha_map.items()):
        print(f"  {fname}: {sha[:16]}…")
    print(f"\nSummary: {json.dumps(summary, ensure_ascii=False, indent=2)}")


if __name__ == "__main__":
    main()
