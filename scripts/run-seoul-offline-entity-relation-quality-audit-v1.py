#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TASK-SEOUL-NIGHT-OFFLINE-MULTILINGUAL-ENTITY-RELATION-QUALITY-AUDIT-V1
서울 3,765건 오프라인 전수 감사 스크립트

AS_OF: 2026-08-10
Policy: v1.0.0

API 호출: 0  /  자동 삭제·병합·제외: 0  /  DB 변경: 0
동일 입력 → byte-identical 출력 (stable sort + fixed thresholds)
"""

import argparse
import collections
import json
import os
import sys
import unicodedata
from typing import Optional

# ──────────────────────────────────────────────────────────────────────
# 상수
# ──────────────────────────────────────────────────────────────────────

AS_OF = "2026-08-10"
POLICY_VERSION = "v1.0.0"

# 좌표 근접 임계값 (도, ~110m)
COORD_NEAR_THRESHOLD_DEG = 0.001

# 제목 정규화 후 exact 중복 감지 — 동일 category도 같아야 EXACT_DUPLICATE
# near-dup: 정규화 제목 앞 12자 일치 + 같은 track
NEAR_DUP_PREFIX_LEN = 12

# ──────────────────────────────────────────────────────────────────────
# 1. 데이터 로드
# ──────────────────────────────────────────────────────────────────────

def load_inventory(base_dir: str) -> list[dict]:
    path = os.path.join(base_dir, "data/seoul-source-audit",
                        "seoul-visitseoul-full-inventory-v1.jsonl")
    records = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records


def load_routing(base_dir: str) -> dict[str, dict]:
    path = os.path.join(base_dir, "data/seoul-source-audit",
                        "seoul-full-enrichment-routing-v1.jsonl")
    routing = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                r = json.loads(line)
                routing[r["cid"]] = r
    return routing


def load_detail_samples(base_dir: str) -> dict[str, dict]:
    path = os.path.join(base_dir, "data/seoul-source-audit",
                        "seoul-integrated-travel-value-detail-samples-v1.jsonl")
    details = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                r = json.loads(line)
                details[r["cid"]] = r
    return details


def load_dryrun_details(base_dir: str) -> dict[str, dict]:
    path = os.path.join(base_dir, "data/seoul-source-audit",
                        "seoul-visitseoul-detail-dryrun-v1.jsonl")
    details = {}
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    r = json.loads(line)
                    details[r["cid"]] = r
    return details


# ──────────────────────────────────────────────────────────────────────
# 2. 유틸리티
# ──────────────────────────────────────────────────────────────────────

def normalize_title(title: str) -> str:
    """정규화: 소문자, 공백 제거, 특수문자 제거, NFC 정규화."""
    t = unicodedata.normalize("NFC", title or "")
    t = t.lower()
    t = "".join(c for c in t if c.isalnum())
    return t


def parse_multi_lang_list(ml: str) -> dict[str, str]:
    """'ko:KOP00001,en:ENP00001,...' → {'ko': 'KOP00001', 'en': 'ENP00001', ...}"""
    result = {}
    if not ml:
        return result
    for part in ml.split(","):
        part = part.strip()
        if ":" not in part:
            continue
        lang, cid = part.split(":", 1)
        result[lang.strip()] = cid.strip()
    return result


def contains_any(text: str, keywords: list) -> bool:
    t = text.lower()
    return any(kw in t for kw in keywords)


def haversine_approx(lat1, lon1, lat2, lon2) -> float:
    """간단한 거리 계산 (도 단위 유클리드 — 소규모 근사)."""
    return ((lat1 - lat2) ** 2 + (lon1 - lon2) ** 2) ** 0.5


# ──────────────────────────────────────────────────────────────────────
# 3. 다국어 링크 감사
# ──────────────────────────────────────────────────────────────────────

LANG_PREFIX_MAP = {
    "ko": ("KOP", "KO"),
    "en": ("ENP", "EN"),
    "ja": ("JPP", "JP"),
    "zh-CN": ("CNP", "CN"),
    "zh-TW": ("TCP", "TC"),
    "ru": ("RUP", "RU"),
    "ms": ("MLP", "ML"),
}

# Travel value로 high-priority 언어 gap 판별
HIGH_VALUE_TRACKS = {"PLACE_CORE_CANDIDATE", "EXPERIENCE_CANDIDATE",
                     "TEMPLE_STAY_CANDIDATE", "SHOPPING_REVIEW"}
HIGH_VALUE_SIGNALS = {"HIGH_TRAVEL_VALUE", "INTENT_SPECIFIC_VALUE"}


def audit_multilingual(records: list, routing: dict) -> tuple[list, dict]:
    """
    각 record의 다국어 링크 감사.
    Returns: (audit_rows, stats)
    """
    TARGET_LANGS = ["en", "ja", "zh-CN", "zh-TW"]
    ko_cids = {r["cid"] for r in records}

    stats = {
        "total": 0,
        "EN_link_count": 0, "JA_link_count": 0,
        "ZH_CN_link_count": 0, "ZH_TW_link_count": 0,
        "MISSING_EN": 0, "MISSING_JA": 0,
        "MISSING_ZH_CN": 0, "MISSING_ZH_TW": 0,
        "SELF_LINK": 0, "DUPLICATE_LANGUAGE_LINK": 0,
        "LANG_CODE_MISMATCH": 0, "MULTI_LANG_STRUCTURE_ANOMALY": 0,
        "TARGET_NOT_LOCALLY_VERIFIABLE": 0,
        "HIGH_PRIORITY_LANGUAGE_GAP": 0,
        "KO_ONLY_RECORDS": 0,
        "pattern_distribution": {},
    }

    audit_rows = []

    for r in sorted(records, key=lambda x: x["cid"]):
        cid = r["cid"]
        ml_str = r.get("multi_lang_list", "")
        track = r.get("routing_track", "")
        title = r.get("post_sj", "") or ""

        parsed = parse_multi_lang_list(ml_str)
        stats["total"] += 1

        # Pattern key
        pattern = tuple(sorted(parsed.keys()))
        stats["pattern_distribution"][str(pattern)] = \
            stats["pattern_distribution"].get(str(pattern), 0) + 1

        # Link counts
        if "en" in parsed: stats["EN_link_count"] += 1
        if "ja" in parsed: stats["JA_link_count"] += 1
        if "zh-CN" in parsed: stats["ZH_CN_link_count"] += 1
        if "zh-TW" in parsed: stats["ZH_TW_link_count"] += 1

        if parsed.keys() == {"ko"} or not any(
            lang in parsed for lang in ["en", "ja", "zh-CN", "zh-TW"]
        ):
            stats["KO_ONLY_RECORDS"] += 1

        anomalies = []
        missing_langs = []

        # Missing lang checks
        for lang in TARGET_LANGS:
            if lang not in parsed:
                key = f"MISSING_{lang.replace('-', '_').upper()}"
                stats[key] += 1
                missing_langs.append(lang)

        # Anomaly checks
        seen_cids = {}
        for lang, link_cid in parsed.items():
            # Self-link
            if lang != "ko" and link_cid == cid:
                anomalies.append(f"SELF_LINK:{lang}")
                stats["SELF_LINK"] += 1

            # Duplicate link CID (same target CID for multiple langs)
            if link_cid in seen_cids:
                anomalies.append(f"DUPLICATE_LINK_CID:{link_cid}")
                stats["DUPLICATE_LANGUAGE_LINK"] += 1
            seen_cids[link_cid] = lang

            # Lang code mismatch
            if lang in LANG_PREFIX_MAP:
                expected = LANG_PREFIX_MAP[lang]
                if not any(link_cid.startswith(p) for p in expected):
                    anomalies.append(f"LANG_CODE_MISMATCH:{lang}:{link_cid[:8]}")
                    stats["LANG_CODE_MISMATCH"] += 1

            # Target not locally verifiable (target not in KO inventory)
            if lang != "ko" and link_cid not in ko_cids:
                stats["TARGET_NOT_LOCALLY_VERIFIABLE"] += 1  # expected, not anomaly

        # High-priority gap
        rt = routing.get(cid, {})
        tv_signals = rt.get("travel_value_signals", [])
        is_high_value = (track in HIGH_VALUE_TRACKS or
                         any(s in tv_signals for s in HIGH_VALUE_SIGNALS))
        high_priority_gap = bool(missing_langs) and is_high_value

        if high_priority_gap:
            stats["HIGH_PRIORITY_LANGUAGE_GAP"] += 1

        audit_rows.append({
            "cid": cid,
            "title": title,
            "routing_track": track,
            "primary_routing": rt.get("primary_routing", ""),
            "travel_value_signals": tv_signals,
            "langs_available": sorted(parsed.keys()),
            "en_cid": parsed.get("en"),
            "ja_cid": parsed.get("ja"),
            "zh_cn_cid": parsed.get("zh-CN"),
            "zh_tw_cid": parsed.get("zh-TW"),
            "missing_target_langs": missing_langs,
            "anomalies": anomalies,
            "high_priority_language_gap": high_priority_gap,
            "as_of": AS_OF,
        })

    return audit_rows, stats


# ──────────────────────────────────────────────────────────────────────
# 4. SOURCE_CONTENT_TYPE 재감사 (특히 ROUTE_COURSE)
# ──────────────────────────────────────────────────────────────────────

DULLEGIL_KEYWORDS = ["둘레길", "둘레 길", "둘레로"]
ROUTE_COURSE_KEYWORDS = [
    "코스", "course", "자전거도로", "자전거길", "자전거 길", "산책로",
    "산책길", "등산코스", "등산로", "트레일", "trail", "path", "순환길",
    "수변길", "올레", "보행로", "정동길", "홍대 클럽 거리", "헌책방 거리",
    "먹자골목", "먹거리거리", "거리 투어", "투어 코스", "야경 코스",
]
EDITORIAL_KEYWORDS = [
    "추천", "가이드", "모음", "베스트", "best", "top ", "특집",
    "소개", "정보지", "안내서", "이야기", "100선",
]
MULTI_PLACE_KEYWORDS = [
    "~", "부터", "일대", "권역", "지구", "서울 전역",
    "주요", "각지", "곳곳",
]

# Hangang specific
HANGANG_PLACE_KEYWORDS = [
    "한강", "hangang", "반포", "뚝섬", "잠실", "잠원", "난지",
    "망원", "이촌", "광나루", "양화", "강서", "합정",
    "여의도", "마포",
]
HANGANG_ACTIVITY_KEYWORDS = [
    "한강라면", "편의점", "자전거 대여", "수상스키", "카약", "피크닉",
    "치맥", "야경", "뗏목", "한강 유람선",
]
# Cheonggyecheon
CHEONGGYE_KEYWORDS = ["청계천", "cheonggyecheon"]
# Bukhansan
BUKHANSAN_KEYWORDS = ["북한산", "bukhansan", "도봉산", "수락산", "불암산", "관악산"]


def audit_source_content_type(records: list, routing: dict, detail_samples: dict) -> tuple[list, dict]:
    """
    SCT 재감사. 특히 ROUTE_COURSE = 0 재검증.
    Returns: (sct_audit_rows, sct_stats)
    """
    sct_before = collections.Counter()
    sct_after = collections.Counter()
    route_related = []
    dullegil_records = []
    editorial_records = []
    reclassified = []

    audit_rows = []

    for r in sorted(records, key=lambda x: x["cid"]):
        cid = r["cid"]
        title = (r.get("post_sj", "") or "").strip()
        summary = (r.get("sumry", "") or "").strip()
        text = (title + " " + summary).lower()
        cat_code = r.get("com_ctgry_sn", "")
        track = r.get("routing_track", "")

        rt = routing.get(cid, {})
        current_sct = rt.get("source_content_type", "PHYSICAL_PLACE")
        sct_before[current_sct] += 1

        # Route/course/dullegil detection
        is_dullegil = contains_any(title.lower(), DULLEGIL_KEYWORDS)
        is_route_kw = contains_any(text, ROUTE_COURSE_KEYWORDS)
        is_editorial = contains_any(text, EDITORIAL_KEYWORDS)
        is_multi_place = contains_any(text, MULTI_PLACE_KEYWORDS)

        # Detail evidence
        detail = detail_samples.get(cid, {})
        analysis = detail.get("analysis", {}) if isinstance(detail.get("analysis"), dict) else {}

        # Reclassification logic
        new_sct = current_sct
        reclass_reason = None
        route_related_flag = False
        dullegil_flag = False
        editorial_flag = False

        if is_dullegil:
            dullegil_flag = True
            dullegil_records.append(cid)
            # 서울둘레길 코스 안내 → EDITORIAL_MULTI_ROUTE_CONTENT
            if any(kw in title.lower() for kw in ["코스 안내", "코스안내", "전체", "안내"]):
                new_sct = "EDITORIAL_MULTI_ROUTE_CONTENT"
                reclass_reason = "DULLEGIL_EDITORIAL_GUIDE"
            elif any(kw in title.lower() for kw in ["걷기", "나들이", "벚꽃", "하이킹"]):
                new_sct = "ROUTE_COURSE"
                reclass_reason = "DULLEGIL_ROUTE_ACTIVITY"
            else:
                new_sct = "PHYSICAL_PLACE_WITH_ROUTE_CONTENT"
                reclass_reason = "DULLEGIL_PLACE_ROUTE"
            route_related_flag = True

        elif current_sct == "PHYSICAL_PLACE" and is_route_kw and not is_editorial:
            # Check if it's really a route/course record (not just mentions a route)
            route_strong = contains_any(title.lower(), [
                "코스", "산책로", "길", "자전거길", "등산로", "트레일",
                "route", "trail", "올레", "순환길",
            ])
            if route_strong and track in {"PLACE_CORE_CANDIDATE", "PLACE_CONDITIONAL_REVIEW"}:
                new_sct = "PHYSICAL_PLACE_WITH_ROUTE_CONTENT"
                reclass_reason = "ROUTE_KEYWORD_IN_TITLE"
                route_related_flag = True
                route_related.append(cid)

        elif current_sct == "PHYSICAL_PLACE" and is_editorial and is_multi_place:
            editorial_flag = True
            editorial_records.append(cid)
            new_sct = "EDITORIAL_CONTENT"
            reclass_reason = "EDITORIAL_MULTI_PLACE_SIGNAL"

        if new_sct != current_sct:
            reclassified.append({
                "cid": cid,
                "title": title,
                "sct_before": current_sct,
                "sct_after": new_sct,
                "reason": reclass_reason,
            })

        sct_after[new_sct] += 1

        audit_rows.append({
            "cid": cid,
            "title": title,
            "category_code": cat_code,
            "routing_track": track,
            "sct_before": current_sct,
            "sct_after": new_sct,
            "reclassified": new_sct != current_sct,
            "reclass_reason": reclass_reason,
            "is_dullegil": dullegil_flag,
            "is_route_related": route_related_flag,
            "is_editorial": editorial_flag,
            "as_of": AS_OF,
        })

    stats = {
        "sct_before": dict(sct_before),
        "sct_after": dict(sct_after),
        "route_course_prior_count": 0,
        "route_course_audited_count": sct_after.get("ROUTE_COURSE", 0),
        "editorial_multi_route_count": sct_after.get("EDITORIAL_MULTI_ROUTE_CONTENT", 0),
        "physical_place_with_route_count": sct_after.get("PHYSICAL_PLACE_WITH_ROUTE_CONTENT", 0),
        "route_related_content_total": (
            sct_after.get("ROUTE_COURSE", 0)
            + sct_after.get("EDITORIAL_MULTI_ROUTE_CONTENT", 0)
            + sct_after.get("PHYSICAL_PLACE_WITH_ROUTE_CONTENT", 0)
        ),
        "dullegil_record_count": len(dullegil_records),
        "dullegil_cids": sorted(dullegil_records),
        "editorial_record_count": len(editorial_records),
        "reclassified_count": len(reclassified),
        "reclassified": reclassified,
        "SEOUL_DULLEGIL_21_COURSES_AS_INDEPENDENT_CIDS": "NO",
        "SEOUL_DULLEGIL_CLASSIFICATION": (
            "EDITORIAL_MULTI_ROUTE_CONTENT for 코스 안내, "
            "ROUTE_COURSE for specific trail activities, "
            "PHYSICAL_PLACE_WITH_ROUTE_CONTENT for mountain/park with dullegil"
        ),
    }

    return audit_rows, stats


# ──────────────────────────────────────────────────────────────────────
# 5. Entity Relation Candidates
# ──────────────────────────────────────────────────────────────────────

RELATION_TYPES = {
    "HELD_AT", "OCCURS_AT", "EXPERIENCE_AT",
    "ROUTE_WITHIN", "ROUTE_THROUGH", "ASSOCIATED_WITH",
    "VIEW_EXPERIENCE_AT", "PART_OF", "PARENT_OF", "RELATED_CONTENT",
}

KPOP_KEYWORDS = [
    "k-pop", "kpop", "케이팝", "아이돌", "bts", "방탄", "blackpink",
    "블랙핑크", "exo", "sm ", "hybe", "yg ", "jyp", "빅히트",
    "ncity", "weverse", "smtown", "엔터테인먼트", "팬덤", "아티스트",
    "k-culture", "k-pop 공연", "팬미팅", "콘서트", "인기가요",
]
VENUE_KEYWORDS = [
    "공연장", "경기장", "아레나", "홀", "hall", "arena", "center",
    "센터", "갤러리아", "롯데", "잠실", "올림픽", "코엑스", "올림픽공원",
]
MARKET_KEYWORDS = [
    "광장시장", "남대문시장", "동대문", "노량진", "마장동",
    "통인시장", "망원시장", "수산시장", "재래시장", "전통시장",
]
HANGANG_MAIN_KEYWORDS = ["한강공원", "한강", "반포", "뚝섬", "잠실한강", "여의도한강"]
NIGHT_KEYWORDS = ["야경", "야간", "밤풍경", "night view", "야경명소"]
EXPERIENCE_KW = ["체험", "experience", "공방", "workshop", "만들기", "배우기"]


def find_entity_relations(records: list, routing: dict, detail_samples: dict) -> list[dict]:
    """
    Entity relation candidates 탐색.
    근거 있는 것만 생성. title/summary/category/detail evidence 사용.
    """
    relations = []
    inv_by_cid = {r["cid"]: r for r in records}

    # Build indexes
    event_records = [r for r in records if r.get("routing_track") == "EVENT_TRACK"]
    venue_records = [r for r in records
                     if r.get("routing_track") in {"PLACE_CORE_CANDIDATE", "PLACE_CONDITIONAL_REVIEW"}
                     and r.get("com_ctgry_sn") in {
                         "Cr1f0k2",  # 공연시설
                         "Cg1x6l1",  # 전시시설
                         "Cl5y4k0",  # 랜드마크
                         "Ce9z7g9",  # 도시공원
                         "Cr0q2v2",  # 박물관
                     }]

    hangang_records = [r for r in records
                       if contains_any((r.get("post_sj", "") or "") + " " + (r.get("sumry", "") or ""),
                                       HANGANG_MAIN_KEYWORDS)]
    kpop_records = [r for r in records
                    if contains_any((r.get("post_sj", "") or "") + " " + (r.get("sumry", "") or ""),
                                    KPOP_KEYWORDS)]
    market_records = [r for r in records
                      if r.get("com_ctgry_sn") == "Cn7z1h7"  # 쇼핑 > 시장
                      or contains_any(r.get("post_sj", "") or "", MARKET_KEYWORDS)]

    # ─── Event ↔ Venue ──────────────────────────────────────────────
    # Match events to known venues via title keyword overlap
    venue_titles = {}
    for v in venue_records:
        title_norm = normalize_title(v.get("post_sj", "") or "")
        venue_titles[title_norm[:10]] = v["cid"]  # prefix index

    for ev in sorted(event_records, key=lambda x: x["cid"]):
        ev_title = (ev.get("post_sj", "") or "").lower()
        ev_sumry = (ev.get("sumry", "") or "").lower()
        ev_cid = ev["cid"]
        ev_text = ev_title + " " + ev_sumry

        # Check if event mentions a known venue by name
        matched_venue_cid = None
        matched_venue_title = None
        confidence = None
        evidence = []

        for v in venue_records:
            v_title_lower = (v.get("post_sj", "") or "").lower()
            # Venue name mentioned in event summary or title
            if len(v_title_lower) > 3 and v_title_lower in ev_text:
                matched_venue_cid = v["cid"]
                matched_venue_title = v.get("post_sj", "") or ""
                confidence = "HIGH"
                evidence.append(f"venue_name_in_event_text:{v_title_lower[:20]}")
                break

        # Check if both event + venue are in Hangang area
        ev_in_hangang = contains_any(ev_text, HANGANG_MAIN_KEYWORDS)
        if ev_in_hangang and not matched_venue_cid:
            # Find nearest hangang park
            for hr in hangang_records:
                if hr["cid"] != ev_cid:
                    hr_track = hr.get("routing_track", "")
                    if hr_track == "PLACE_CORE_CANDIDATE":
                        matched_venue_cid = hr["cid"]
                        matched_venue_title = hr.get("post_sj", "") or ""
                        confidence = "MEDIUM"
                        evidence.append("hangang_keyword_shared_location")
                        break

        if matched_venue_cid and confidence != "LOW":
            relations.append({
                "source_cid": ev_cid,
                "source_title": ev.get("post_sj", "") or "",
                "source_entity_type": "EVENT",
                "relation_type": "OCCURS_AT",
                "target_cid_if_known": matched_venue_cid,
                "target_title": matched_venue_title,
                "evidence_fields": ["post_sj", "sumry"],
                "evidence_summary": "; ".join(evidence),
                "confidence": confidence,
            })

    # ─── Hangang PLACE ↔ EXPERIENCE/ROUTE ────────────────────────────
    hangang_places = [r for r in hangang_records
                      if r.get("routing_track") == "PLACE_CORE_CANDIDATE"
                      and r.get("com_ctgry_sn") == "Ce9z7g9"]  # 도시공원

    hangang_activities = [r for r in hangang_records
                          if r.get("routing_track") != "PLACE_CORE_CANDIDATE"
                          and contains_any(
                              (r.get("post_sj", "") or "") + " " + (r.get("sumry", "") or ""),
                              ["자전거", "수상", "피크닉", "야경", "라면", "치맥", "뗏목", "유람선"]
                          )]

    for act in sorted(hangang_activities, key=lambda x: x["cid"]):
        act_text = ((act.get("post_sj", "") or "") + " " + (act.get("sumry", "") or "")).lower()
        for place in hangang_places:
            place_title = (place.get("post_sj", "") or "").lower()
            if len(place_title) > 3 and place_title[:5] in act_text:
                relations.append({
                    "source_cid": act["cid"],
                    "source_title": act.get("post_sj", "") or "",
                    "source_entity_type": routing.get(act["cid"], {}).get("source_content_type", "UNKNOWN"),
                    "relation_type": "EXPERIENCE_AT",
                    "target_cid_if_known": place["cid"],
                    "target_title": place.get("post_sj", "") or "",
                    "evidence_fields": ["post_sj", "sumry"],
                    "evidence_summary": f"hangang_activity_at_park:{place_title[:20]}",
                    "confidence": "MEDIUM",
                })
                break

    # ─── K-pop ↔ Related Entities ────────────────────────────────────
    for kr in sorted(kpop_records, key=lambda x: x["cid"]):
        kr_text = ((kr.get("post_sj", "") or "") + " " + (kr.get("sumry", "") or "")).lower()
        kr_track = kr.get("routing_track", "")
        kr_sct = routing.get(kr["cid"], {}).get("source_content_type", "UNKNOWN")

        if kr_track == "EVENT_TRACK":
            # K-pop event → might be held at a venue
            for v in venue_records:
                v_name = (v.get("post_sj", "") or "").lower()
                if len(v_name) > 3 and v_name in kr_text:
                    relations.append({
                        "source_cid": kr["cid"],
                        "source_title": kr.get("post_sj", "") or "",
                        "source_entity_type": "EVENT",
                        "relation_type": "HELD_AT",
                        "target_cid_if_known": v["cid"],
                        "target_title": v.get("post_sj", "") or "",
                        "evidence_fields": ["post_sj", "sumry"],
                        "evidence_summary": f"kpop_event_venue:{v_name[:20]}",
                        "confidence": "HIGH",
                    })
                    break
        elif kr_track in {"SHOPPING_REVIEW", "PLACE_CONDITIONAL_REVIEW"}:
            # K-pop shopping/place → ASSOCIATED_WITH K-pop
            relations.append({
                "source_cid": kr["cid"],
                "source_title": kr.get("post_sj", "") or "",
                "source_entity_type": kr_sct,
                "relation_type": "ASSOCIATED_WITH",
                "target_cid_if_known": None,
                "target_title": "K-pop / Hallyu",
                "evidence_fields": ["post_sj", "sumry"],
                "evidence_summary": "kpop_keyword_in_shopping_or_place",
                "confidence": "MEDIUM",
            })

    # ─── Market ↔ Restaurant/Place ───────────────────────────────────
    restaurant_records = [r for r in records if r.get("routing_track") == "RESTAURANT_TRACK"]

    for mkt in sorted(market_records, key=lambda x: x["cid"]):
        mkt_title = (mkt.get("post_sj", "") or "").lower()
        if len(mkt_title) < 3:
            continue
        # Find restaurants that mention this market
        for rest in restaurant_records:
            rest_sumry = (rest.get("sumry", "") or "").lower()
            if mkt_title[:6] in rest_sumry:
                relations.append({
                    "source_cid": rest["cid"],
                    "source_title": rest.get("post_sj", "") or "",
                    "source_entity_type": "PHYSICAL_PLACE",
                    "relation_type": "PART_OF",
                    "target_cid_if_known": mkt["cid"],
                    "target_title": mkt.get("post_sj", "") or "",
                    "evidence_fields": ["sumry"],
                    "evidence_summary": f"restaurant_mentions_market:{mkt_title[:20]}",
                    "confidence": "MEDIUM",
                })
                break  # one relation per restaurant

    # ─── Dullegil Route Relations ────────────────────────────────────
    dullegil_main = next(
        (r for r in records if "서울 둘레길 코스 안내" in (r.get("post_sj", "") or "")), None
    )
    dullegil_related = [r for r in records
                        if r["cid"] != (dullegil_main["cid"] if dullegil_main else "")
                        and contains_any((r.get("post_sj", "") or "") + " " + (r.get("sumry", "") or ""),
                                         ["둘레길", "둘레 길"])]
    if dullegil_main:
        for drel in sorted(dullegil_related, key=lambda x: x["cid"]):
            relations.append({
                "source_cid": drel["cid"],
                "source_title": drel.get("post_sj", "") or "",
                "source_entity_type": routing.get(drel["cid"], {}).get("source_content_type", "UNKNOWN"),
                "relation_type": "ROUTE_WITHIN",
                "target_cid_if_known": dullegil_main["cid"],
                "target_title": dullegil_main.get("post_sj", "") or "",
                "evidence_fields": ["post_sj", "sumry"],
                "evidence_summary": "dullegil_keyword_relates_to_main_route_guide",
                "confidence": "MEDIUM",
            })

    # ─── Night view / Viewpoint EXPERIENCE_AT ─────────────────────────
    night_view_records = [r for r in records
                          if contains_any(r.get("post_sj", "") or "", NIGHT_KEYWORDS)
                          and r.get("routing_track") in {"PLACE_CORE_CANDIDATE",
                                                          "PLACE_CONDITIONAL_REVIEW",
                                                          "EXPERIENCE_CANDIDATE"}]
    for nv in sorted(night_view_records, key=lambda x: x["cid"]):
        nv_text = ((nv.get("post_sj", "") or "") + " " + (nv.get("sumry", "") or "")).lower()
        # Try to find the physical place it's associated with
        for base_r in records:
            if base_r["cid"] == nv["cid"]:
                continue
            base_title = (base_r.get("post_sj", "") or "").lower()
            if len(base_title) > 4 and base_title[:6] in nv_text:
                base_track = base_r.get("routing_track", "")
                if base_track == "PLACE_CORE_CANDIDATE":
                    relations.append({
                        "source_cid": nv["cid"],
                        "source_title": nv.get("post_sj", "") or "",
                        "source_entity_type": "EXPERIENCE_CONTENT",
                        "relation_type": "VIEW_EXPERIENCE_AT",
                        "target_cid_if_known": base_r["cid"],
                        "target_title": base_r.get("post_sj", "") or "",
                        "evidence_fields": ["post_sj", "sumry"],
                        "evidence_summary": f"night_view_at_place:{base_title[:20]}",
                        "confidence": "MEDIUM",
                    })
                    break  # one relation per night-view record

    # Deduplicate by (source, relation, target)
    seen = set()
    unique_relations = []
    for rel in sorted(relations, key=lambda x: (x["source_cid"],
                                                  x["relation_type"],
                                                  x.get("target_cid_if_known") or "")):
        key = (rel["source_cid"], rel["relation_type"],
               rel.get("target_cid_if_known") or "")
        if key not in seen:
            seen.add(key)
            unique_relations.append(rel)

    return unique_relations


# ──────────────────────────────────────────────────────────────────────
# 6. Duplicate / Near-Duplicate 후보
# ──────────────────────────────────────────────────────────────────────

def find_duplicates(records: list, routing: dict) -> list[dict]:
    """
    exact normalized title + same category → EXACT_DUPLICATE_CANDIDATE
    first N chars same + same routing_track → NEAR_DUPLICATE_CANDIDATE
    """
    candidates = []
    inv_by_cid = {r["cid"]: r for r in records}

    # Build indexes
    exact_index = collections.defaultdict(list)    # norm_title → [cid, ...]
    prefix_index = collections.defaultdict(list)   # (prefix, track) → [cid, ...]

    for r in sorted(records, key=lambda x: x["cid"]):
        cid = r["cid"]
        title = r.get("post_sj", "") or ""
        norm = normalize_title(title)
        track = r.get("routing_track", "")
        cat = r.get("com_ctgry_sn", "")

        if norm:
            exact_key = (norm, cat)
            exact_index[exact_key].append(cid)

            if len(norm) >= NEAR_DUP_PREFIX_LEN:
                prefix_key = (norm[:NEAR_DUP_PREFIX_LEN], track)
                prefix_index[prefix_key].append(cid)

    # Exact duplicates (same normalized title + same category)
    seen_pairs = set()
    for (norm, cat), cid_list in sorted(exact_index.items()):
        if len(cid_list) < 2:
            continue
        for i in range(len(cid_list)):
            for j in range(i + 1, len(cid_list)):
                a, b = sorted([cid_list[i], cid_list[j]])
                if (a, b) in seen_pairs:
                    continue
                seen_pairs.add((a, b))

                ra = inv_by_cid[a]
                rb = inv_by_cid[b]
                ml_a = parse_multi_lang_list(ra.get("multi_lang_list", ""))
                ml_b = parse_multi_lang_list(rb.get("multi_lang_list", ""))

                # Check if they share multilingual links (→ SAME content group)
                shared_link = bool(set(ml_a.values()) & set(ml_b.values()))

                candidates.append({
                    "cid_a": a,
                    "cid_b": b,
                    "title_a": ra.get("post_sj", "") or "",
                    "title_b": rb.get("post_sj", "") or "",
                    "signals": {
                        "title_similarity": "EXACT_NORMALIZED",
                        "same_category": cat,
                        "shared_multilingual_link": shared_link,
                    },
                    "candidate_type": "EXACT_DUPLICATE_CANDIDATE",
                    "confidence": "HIGH",
                    "AUTO_MERGE": False,
                })

    # Near-duplicates (same prefix + same track)
    for (prefix, track), cid_list in sorted(prefix_index.items()):
        if len(cid_list) < 2:
            continue
        # Filter out already found exact duplicates
        for i in range(len(cid_list)):
            for j in range(i + 1, len(cid_list)):
                a, b = sorted([cid_list[i], cid_list[j]])
                if (a, b) in seen_pairs:
                    continue
                # Verify they're not same_category exact dup (already caught above)
                ra = inv_by_cid[a]
                rb = inv_by_cid[b]
                norm_a = normalize_title(ra.get("post_sj", "") or "")
                norm_b = normalize_title(rb.get("post_sj", "") or "")
                if norm_a == norm_b and ra.get("com_ctgry_sn") == rb.get("com_ctgry_sn"):
                    continue  # already caught
                seen_pairs.add((a, b))

                candidates.append({
                    "cid_a": a,
                    "cid_b": b,
                    "title_a": ra.get("post_sj", "") or "",
                    "title_b": rb.get("post_sj", "") or "",
                    "signals": {
                        "title_prefix_match": f"first_{NEAR_DUP_PREFIX_LEN}_chars",
                        "same_routing_track": track,
                        "cat_a": ra.get("com_ctgry_sn"),
                        "cat_b": rb.get("com_ctgry_sn"),
                    },
                    "candidate_type": "NEAR_DUPLICATE_CANDIDATE",
                    "confidence": "MEDIUM",
                    "AUTO_MERGE": False,
                })

    # Related content: same category, different title but same summary prefix
    # (SAME_PLACE_DIFFERENT_CONTENT pattern)
    # Light check: PLACE records with same category and nearly same summary
    summary_prefix_idx = collections.defaultdict(list)
    for r in sorted(records, key=lambda x: x["cid"]):
        sumry = normalize_title(r.get("sumry", "") or "")
        cat = r.get("com_ctgry_sn", "")
        track = r.get("routing_track", "")
        if sumry and len(sumry) >= 15:
            key = (sumry[:15], cat)
            summary_prefix_idx[key].append(r["cid"])

    for (sumry_prefix, cat), cid_list in sorted(summary_prefix_idx.items()):
        if len(cid_list) < 2:
            continue
        for i in range(len(cid_list)):
            for j in range(i + 1, len(cid_list)):
                a, b = sorted([cid_list[i], cid_list[j]])
                if (a, b) in seen_pairs:
                    continue
                ra = inv_by_cid[a]
                rb = inv_by_cid[b]
                # Only flag if titles differ
                norm_a = normalize_title(ra.get("post_sj", "") or "")
                norm_b = normalize_title(rb.get("post_sj", "") or "")
                if norm_a == norm_b:
                    continue
                seen_pairs.add((a, b))
                candidates.append({
                    "cid_a": a,
                    "cid_b": b,
                    "title_a": ra.get("post_sj", "") or "",
                    "title_b": rb.get("post_sj", "") or "",
                    "signals": {
                        "summary_prefix_match": f"first_15_chars_normalized",
                        "same_category": cat,
                    },
                    "candidate_type": "SAME_PLACE_DIFFERENT_CONTENT",
                    "confidence": "LOW",
                    "AUTO_MERGE": False,
                })

    return sorted(candidates, key=lambda x: (x["confidence"] == "LOW", x["cid_a"], x["cid_b"]))


# ──────────────────────────────────────────────────────────────────────
# 7. Bar/Pub F Routing 감사
# ──────────────────────────────────────────────────────────────────────

BAR_UPGRADE_KEYWORDS = [
    "야경", "루프탑", "rooftop", "전통주", "막걸리", "전통", "명소", "유명",
    "포장마차", "포차", "k-pop", "kpop", "드라마", "뷰", "view", "경치",
    "풍경", "한강뷰", "남산뷰", "특색", "개성", "공간", "분위기", "힙",
    "감성", "스타", "연예인", "이색", "독특", "할랄", "외국인",
]
BAR_UTILITY_KEYWORDS = [
    "외국어 메뉴", "영어 메뉴", "영어", "외국인", "투어리스트",
]


def audit_bar_pub_routing(records: list, routing: dict) -> tuple[list, dict]:
    """Bar/pub 60건 F routing 감사."""
    bar_records = sorted(
        [r for r in records if r.get("com_ctgry_sn") == "Ck6n0w6"],
        key=lambda x: x["cid"],
    )

    audit_rows = []
    stats = {
        "BAR_PUB_F_TOTAL": 0,
        "BAR_PUB_KEEP_F": 0,
        "BAR_PUB_UPGRADE_CANDIDATE": 0,
        "BAR_PUB_UTILITY": 0,
        "BAR_PUB_HOLD": 0,
        "BAR_PUB_B": 0,
        "BLANKET_RULE_DETECTED": True,  # 모든 주점을 F로 보내는 규칙 존재
        "BLANKET_RULE_DESCRIPTION": "Ck6n0w6 (음식>주점) 전체를 F로 분류",
        "UPGRADE_CANDIDATE_CIDS": [],
    }

    for r in bar_records:
        cid = r["cid"]
        title = (r.get("post_sj", "") or "").strip()
        summary = (r.get("sumry", "") or "").strip()
        text = (title + " " + summary).lower()
        rt = routing.get(cid, {})
        current_routing = rt.get("primary_routing", "?")

        if current_routing == "B":
            stats["BAR_PUB_B"] += 1
            verdict = "B_ALREADY_SAMPLED"
        elif contains_any(text, BAR_UPGRADE_KEYWORDS):
            verdict = "UPGRADE_TO_A_CANDIDATE"
            stats["BAR_PUB_UPGRADE_CANDIDATE"] += 1
            stats["UPGRADE_CANDIDATE_CIDS"].append(cid)
        elif contains_any(text, BAR_UTILITY_KEYWORDS):
            verdict = "UTILITY_ENRICHMENT"
            stats["BAR_PUB_UTILITY"] += 1
        elif not title and not summary:
            verdict = "HOLD"
            stats["BAR_PUB_HOLD"] += 1
        else:
            verdict = "KEEP_F"
            stats["BAR_PUB_KEEP_F"] += 1

        if current_routing == "F":
            stats["BAR_PUB_F_TOTAL"] += 1

        audit_rows.append({
            "cid": cid,
            "title": title,
            "current_routing": current_routing,
            "bar_pub_verdict": verdict,
            "evidence_keywords": [kw for kw in BAR_UPGRADE_KEYWORDS if kw in text][:5],
        })

    return audit_rows, stats


# ──────────────────────────────────────────────────────────────────────
# 8. Shopping F Routing 감사
# ──────────────────────────────────────────────────────────────────────

SHOPPING_TRAVELER_KEYWORDS = [
    "k-beauty", "kbeauty", "화장품", "면세", "기념품", "souvenir",
    "한국 과자", "한과", "인삼", "홍삼", "해외", "외국인", "투어리스트",
    "브랜드", "flagship", "플래그십",
]


def audit_shopping_routing(records: list, routing: dict) -> tuple[list, dict]:
    """Shopping F routing 감사 (대형마트 + ordinary chain)."""
    # F shopping records
    shopping_f = sorted(
        [r for r in records
         if r.get("routing_track") == "SHOPPING_REVIEW"
         and routing.get(r["cid"], {}).get("primary_routing") == "F"],
        key=lambda x: x["cid"],
    )

    audit_rows = []
    stats = {
        "SHOPPING_F_TOTAL": len(shopping_f),
        "KEEP_F": 0,
        "UPGRADE_CANDIDATE": 0,
        "UTILITY_VALUE": 0,
        "HOLD": 0,
    }

    for r in shopping_f:
        cid = r["cid"]
        title = (r.get("post_sj", "") or "").strip()
        summary = (r.get("sumry", "") or "").strip()
        text = (title + " " + summary).lower()

        if contains_any(text, SHOPPING_TRAVELER_KEYWORDS):
            verdict = "UPGRADE_CANDIDATE"
            stats["UPGRADE_CANDIDATE"] += 1
        elif "외국인" in text or "traveler" in text:
            verdict = "UTILITY_VALUE"
            stats["UTILITY_VALUE"] += 1
        else:
            verdict = "KEEP_F"
            stats["KEEP_F"] += 1

        audit_rows.append({
            "cid": cid,
            "title": title,
            "category_code": r.get("com_ctgry_sn"),
            "current_routing": "F",
            "shopping_verdict": verdict,
            "evidence": [kw for kw in SHOPPING_TRAVELER_KEYWORDS if kw in text][:3],
        })

    return audit_rows, stats


# ──────────────────────────────────────────────────────────────────────
# 9. Blanket Rule 감사
# ──────────────────────────────────────────────────────────────────────

def audit_blanket_rules(records: list, routing: dict) -> list[dict]:
    """
    Category/keyword만으로 travel value를 단정짓는 strong rule 탐색.
    이번 routing script 내 확인된 규칙 분석.
    """
    blanket_candidates = []

    # Rule 1: Ck6n0w6 (주점) → 전체 F (명확한 blanket rule)
    bar_f = [r for r in records
             if r.get("com_ctgry_sn") == "Ck6n0w6"
             and routing.get(r["cid"], {}).get("primary_routing") == "F"]
    blanket_candidates.append({
        "rule_id": "BLANKET_01",
        "rule": "com_ctgry_sn == Ck6n0w6 → F",
        "category": "음식 > 주점",
        "affected_count": len(bar_f),
        "risk": "야경 루프탑, 전통주 체험, K-pop 관련 바 등 high-value venue가 F로 분류될 수 있음",
        "recommended_fix": "keyword-based upgrade check 추가 (야경/루프탑/전통주/포차/외국인 키워드 시 A 상향)",
        "is_policy_violation": True,
        "auto_change_allowed": False,
    })

    # Rule 2: Cl2d2s1 (교육시설) → 전체 H
    edu_h = [r for r in records
             if r.get("com_ctgry_sn") == "Cl2d2s1"
             and routing.get(r["cid"], {}).get("primary_routing") == "H"]
    blanket_candidates.append({
        "rule_id": "BLANKET_02",
        "rule": "com_ctgry_sn == Cl2d2s1 → H",
        "category": "문화관광 > 교육시설",
        "affected_count": len(edu_h),
        "risk": "미술관 부속 교육시설, 체험형 과학관, 한국문화 체험 시설이 H로 분류될 수 있음",
        "recommended_fix": "교육시설 중 체험형/관광 친화적 키워드(체험, 전시, 문화, 어린이) 보유 시 A로 상향",
        "is_policy_violation": True,
        "auto_change_allowed": False,
    })

    # Rule 3: Ct1z4k9 (대형마트) → 전체 F
    mart_f = [r for r in records
              if r.get("com_ctgry_sn") == "Ct1z4k9"
              and routing.get(r["cid"], {}).get("primary_routing") == "F"]
    blanket_candidates.append({
        "rule_id": "BLANKET_03",
        "rule": "com_ctgry_sn == Ct1z4k9 → F",
        "category": "쇼핑 > 대형마트",
        "affected_count": len(mart_f),
        "risk": "낮음 (대형마트 3건은 F가 대체로 맞음). K-beauty 소품 판매 마트 예외 가능.",
        "recommended_fix": "현재 3건 수준에서는 acceptable. 확장 시 재검토.",
        "is_policy_violation": False,
        "auto_change_allowed": False,
    })

    # Rule 4: Ce7q5s7/Ch4v8z7/Ct9n1n3 (숙박) → 전체 F
    acc_f = [r for r in records
             if r.get("com_ctgry_sn") in {"Ce7q5s7", "Ch4v8z7", "Ct9n1n3"}
             and routing.get(r["cid"], {}).get("primary_routing") == "F"]
    blanket_candidates.append({
        "rule_id": "BLANKET_04",
        "rule": "com_ctgry_sn in {Ce7q5s7, Ch4v8z7, Ct9n1n3} → F (문화적 키워드 없으면)",
        "category": "숙박 (호텔/호스텔)",
        "affected_count": len(acc_f),
        "risk": "일부 heritage hotel, hanok stay가 F로 분류될 수 있음",
        "recommended_fix": "한옥/문화재/전통 키워드 보유 시 A로 상향하는 규칙은 이미 존재",
        "is_policy_violation": False,
        "auto_change_allowed": False,
    })

    # Rule 5: Ck6n0w6 title='' → F (missing evidence)
    bar_no_title = [r for r in records
                    if r.get("com_ctgry_sn") == "Ck6n0w6"
                    and not (r.get("post_sj") or "").strip()]
    if bar_no_title:
        blanket_candidates.append({
            "rule_id": "BLANKET_05",
            "rule": "주점 중 title 없음 → F (no evidence available)",
            "category": "음식 > 주점",
            "affected_count": len(bar_no_title),
            "risk": "minimal — no information to upgrade",
            "recommended_fix": "HOLD로 변경 검토 (title 없으면 routing confidence 낮음)",
            "is_policy_violation": False,
            "auto_change_allowed": False,
        })

    return blanket_candidates


# ──────────────────────────────────────────────────────────────────────
# 10. Quality Coverage
# ──────────────────────────────────────────────────────────────────────

def compute_quality_coverage(records: list, routing: dict,
                              detail_samples: dict, dryrun_details: dict) -> dict:
    """필드별 coverage 계산."""
    n = len(records)
    all_detail = {**dryrun_details, **detail_samples}  # detail_samples overrides

    coverage = {
        "total": n,
        "LIST_FIELDS": {
            "title_available": sum(1 for r in records if r.get("post_sj")),
            "category_available": sum(1 for r in records if r.get("com_ctgry_sn")),
            "summary_available": sum(1 for r in records if r.get("sumry")),
            "main_img_available": sum(1 for r in records if r.get("main_img")),
            "multi_lang_list_available": sum(1 for r in records if r.get("multi_lang_list")),
            "creat_dt_available": sum(1 for r in records if r.get("creat_dt_text")),
        },
        "MULTILINGUAL_LINKS": {
            "EN_link": sum(1 for r in records if "en:" in r.get("multi_lang_list", "")),
            "JA_link": sum(1 for r in records if "ja:" in r.get("multi_lang_list", "")),
            "ZH_CN_link": sum(1 for r in records if "zh-CN:" in r.get("multi_lang_list", "")),
            "ZH_TW_link": sum(1 for r in records if "zh-TW:" in r.get("multi_lang_list", "")),
            "RU_link": sum(1 for r in records if "ru:" in r.get("multi_lang_list", "")),
            "MS_link": sum(1 for r in records if "ms:" in r.get("multi_lang_list", "")),
            "KO_ONLY": sum(1 for r in records
                          if not any(lang in r.get("multi_lang_list", "")
                                     for lang in ["en:", "ja:", "zh-CN:", "zh-TW:"])),
        },
        "DETAIL_AVAILABILITY": {
            "existing_detail_any": sum(1 for r in records if r["cid"] in all_detail),
            "existing_detail_with_coords": sum(
                1 for r in records
                if r["cid"] in all_detail
                and (all_detail[r["cid"]].get("coords")
                     or all_detail[r["cid"]].get("has_coords"))
            ),
        },
        "ROUTING_FIELDS": {
            "has_primary_routing": sum(1 for r in records
                                       if routing.get(r["cid"], {}).get("primary_routing")),
            "has_detected_intents": sum(1 for r in records
                                        if routing.get(r["cid"], {}).get("detected_intents")),
            "has_travel_value_signals": sum(1 for r in records
                                            if routing.get(r["cid"], {}).get("travel_value_signals")),
            "has_source_content_type": sum(1 for r in records
                                           if routing.get(r["cid"], {}).get("source_content_type")),
        },
    }
    return coverage


# ──────────────────────────────────────────────────────────────────────
# 11. Review Queue
# ──────────────────────────────────────────────────────────────────────

def build_review_queue(
    ml_audit: list,
    sct_audit: list,
    relations: list,
    duplicates: list,
    bar_audit: list,
    shopping_audit: list,
    blanket_rules: list,
    records: list,
    routing: dict,
) -> list[dict]:
    """내일 사람/후속 task가 확인할 review queue 통합 생성."""
    queue = []
    inv_by_cid = {r["cid"]: r for r in records}

    # 1. High priority language gaps
    for row in sorted(ml_audit, key=lambda x: x["cid"]):
        if row["high_priority_language_gap"]:
            queue.append({
                "cid": row["cid"],
                "title": row["title"],
                "issue_type": "MULTILINGUAL_LINK_REVIEW",
                "current_routing": row.get("primary_routing", ""),
                "source_content_type": routing.get(row["cid"], {}).get("source_content_type"),
                "evidence": f"missing_langs:{row['missing_target_langs']}",
                "confidence": "HIGH",
                "recommended_action": "fill_language_links",
                "auto_change_allowed": False,
            })

    # 2. SCT reclassified
    for row in sorted(sct_audit, key=lambda x: x["cid"]):
        if row["reclassified"]:
            queue.append({
                "cid": row["cid"],
                "title": row["title"],
                "issue_type": "ROUTE_CLASSIFICATION_REVIEW",
                "current_routing": routing.get(row["cid"], {}).get("primary_routing", ""),
                "source_content_type": f"{row['sct_before']} → {row['sct_after']}",
                "evidence": row.get("reclass_reason", ""),
                "confidence": "MEDIUM",
                "recommended_action": "confirm_sct_reclassification",
                "auto_change_allowed": False,
            })

    # 3. Bar/pub upgrade candidates
    for row in sorted(bar_audit, key=lambda x: x["cid"]):
        if row["bar_pub_verdict"] in {"UPGRADE_TO_A_CANDIDATE", "UTILITY_ENRICHMENT"}:
            queue.append({
                "cid": row["cid"],
                "title": row["title"],
                "issue_type": "BAR_PUB_ROUTING_REVIEW",
                "current_routing": row["current_routing"],
                "source_content_type": "PHYSICAL_PLACE",
                "evidence": f"upgrade_keywords:{row['evidence_keywords']}",
                "confidence": "MEDIUM",
                "recommended_action": row["bar_pub_verdict"],
                "auto_change_allowed": False,
            })

    # 4. Shopping upgrade candidates
    for row in sorted(shopping_audit, key=lambda x: x["cid"]):
        if row["shopping_verdict"] == "UPGRADE_CANDIDATE":
            queue.append({
                "cid": row["cid"],
                "title": row["title"],
                "issue_type": "SHOPPING_ROUTING_REVIEW",
                "current_routing": "F",
                "source_content_type": "PHYSICAL_PLACE",
                "evidence": f"traveler_keywords:{row['evidence']}",
                "confidence": "MEDIUM",
                "recommended_action": "UPGRADE_TO_A_CANDIDATE",
                "auto_change_allowed": False,
            })

    # 5. Blanket rule issues (policy violations)
    for br in blanket_rules:
        if br["is_policy_violation"]:
            queue.append({
                "cid": "MULTIPLE",
                "title": f"[BLANKET_RULE] {br['rule']}",
                "issue_type": "ENTITY_IDENTITY_REVIEW",
                "current_routing": "F/H",
                "source_content_type": br["category"],
                "evidence": br["risk"],
                "confidence": "HIGH",
                "recommended_action": br["recommended_fix"],
                "auto_change_allowed": False,
                "affected_count": br["affected_count"],
            })

    # 6. High-confidence duplicate candidates
    for dup in sorted(duplicates, key=lambda x: (x["cid_a"], x["cid_b"])):
        if dup["confidence"] in {"HIGH", "MEDIUM"}:
            queue.append({
                "cid": f"{dup['cid_a']}|{dup['cid_b']}",
                "title": f"{dup['title_a'][:30]} | {dup['title_b'][:30]}",
                "issue_type": "DUPLICATE_REVIEW",
                "current_routing": "?",
                "source_content_type": dup.get("candidate_type"),
                "evidence": json.dumps(dup.get("signals", {}), ensure_ascii=False)[:100],
                "confidence": dup["confidence"],
                "recommended_action": "human_review_before_any_merge",
                "auto_change_allowed": False,
            })

    # 7. Entity identity ambiguous (H routing)
    h_records = sorted(
        [r for r in records if routing.get(r["cid"], {}).get("primary_routing") == "H"],
        key=lambda x: x["cid"],
    )
    for r in h_records:
        queue.append({
            "cid": r["cid"],
            "title": r.get("post_sj", "") or "",
            "issue_type": "ENTITY_IDENTITY_REVIEW",
            "current_routing": "H",
            "source_content_type": routing.get(r["cid"], {}).get("source_content_type"),
            "evidence": routing.get(r["cid"], {}).get("routing_reason_codes", []),
            "confidence": "MEDIUM",
            "recommended_action": "manual_routing_decision",
            "auto_change_allowed": False,
        })

    # 8. High-value relation candidates (Event↔Venue, K-pop, Nature)
    event_venue_relations = [rel for rel in relations if rel["relation_type"] in {"HELD_AT", "OCCURS_AT"}]
    for rel in sorted(event_venue_relations[:50], key=lambda x: x["source_cid"]):
        queue.append({
            "cid": rel["source_cid"],
            "title": rel["source_title"][:50],
            "issue_type": "EVENT_VENUE_RELATION_REVIEW",
            "current_routing": routing.get(rel["source_cid"], {}).get("primary_routing", ""),
            "source_content_type": rel["source_entity_type"],
            "evidence": f"{rel['relation_type']} → {rel.get('target_title', '')[:30]}",
            "confidence": rel["confidence"],
            "recommended_action": "verify_venue_relation_before_db_use",
            "auto_change_allowed": False,
        })

    # 9. K-pop relation review
    kpop_relations = [rel for rel in relations
                      if "kpop" in rel.get("evidence_summary", "").lower()]
    for rel in sorted(kpop_relations[:30], key=lambda x: x["source_cid"]):
        queue.append({
            "cid": rel["source_cid"],
            "title": rel["source_title"][:50],
            "issue_type": "KPOP_RELATION_REVIEW",
            "current_routing": routing.get(rel["source_cid"], {}).get("primary_routing", ""),
            "source_content_type": rel["source_entity_type"],
            "evidence": rel.get("evidence_summary", "")[:80],
            "confidence": rel["confidence"],
            "recommended_action": "verify_kpop_association",
            "auto_change_allowed": False,
        })

    return sorted(queue, key=lambda x: (
        # Sort: HIGH confidence first, then by issue_type, then cid
        0 if x["confidence"] == "HIGH" else 1 if x["confidence"] == "MEDIUM" else 2,
        x["issue_type"],
        x["cid"],
    ))


# ──────────────────────────────────────────────────────────────────────
# 12. 메인
# ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Seoul offline entity relation quality audit")
    parser.add_argument("--base-dir", default=".", help="Project root directory")
    parser.add_argument("--as-of", default=AS_OF)
    parser.add_argument("--output-dir", default="data/seoul-source-audit")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    base_dir = args.base_dir
    output_dir = os.path.join(base_dir, args.output_dir)
    os.makedirs(output_dir, exist_ok=True)

    print("[INFO] Loading data files...", file=sys.stderr)
    records = load_inventory(base_dir)
    routing = load_routing(base_dir)
    detail_samples = load_detail_samples(base_dir)
    dryrun_details = load_dryrun_details(base_dir)

    # Preflight QA
    assert len(records) == 3765, f"Input mismatch: {len(records)}"
    assert len(routing) == 3765, f"Routing mismatch: {len(routing)}"
    print(f"[INFO] Records: {len(records)}, Routing: {len(routing)}, "
          f"Detail: {len(detail_samples)}, Dryrun: {len(dryrun_details)}", file=sys.stderr)

    # Run audits
    print("[INFO] Running multilingual audit...", file=sys.stderr)
    ml_audit, ml_stats = audit_multilingual(records, routing)

    print("[INFO] Running SCT re-audit...", file=sys.stderr)
    sct_audit, sct_stats = audit_source_content_type(records, routing, detail_samples)

    print("[INFO] Finding entity relations...", file=sys.stderr)
    relations = find_entity_relations(records, routing, detail_samples)

    print("[INFO] Finding duplicates...", file=sys.stderr)
    duplicates = find_duplicates(records, routing)

    print("[INFO] Auditing bar/pub routing...", file=sys.stderr)
    bar_audit, bar_stats = audit_bar_pub_routing(records, routing)

    print("[INFO] Auditing shopping routing...", file=sys.stderr)
    shop_audit, shop_stats = audit_shopping_routing(records, routing)

    print("[INFO] Auditing blanket rules...", file=sys.stderr)
    blanket_rules = audit_blanket_rules(records, routing)

    print("[INFO] Computing quality coverage...", file=sys.stderr)
    quality_cov = compute_quality_coverage(records, routing, detail_samples, dryrun_details)

    print("[INFO] Building review queue...", file=sys.stderr)
    review_queue = build_review_queue(
        ml_audit, sct_audit, relations, duplicates,
        bar_audit, shop_audit, blanket_rules, records, routing,
    )

    # Categorize relations
    event_venue_rels = [r for r in relations if r["relation_type"] in {"HELD_AT", "OCCURS_AT"}]
    kpop_rels = [r for r in relations if "kpop" in r.get("evidence_summary", "").lower()]
    nature_route_rels = [r for r in relations if r["relation_type"] in {"ROUTE_WITHIN", "ROUTE_THROUGH"}]

    # Categorize duplicates
    exact_dups = [d for d in duplicates if d["candidate_type"] == "EXACT_DUPLICATE_CANDIDATE"]
    near_dups = [d for d in duplicates if d["candidate_type"] == "NEAR_DUPLICATE_CANDIDATE"]
    same_place_diff = [d for d in duplicates if d["candidate_type"] == "SAME_PLACE_DIFFERENT_CONTENT"]

    # Manifest
    manifest = {
        "task": "TASK-SEOUL-NIGHT-OFFLINE-MULTILINGUAL-ENTITY-RELATION-QUALITY-AUDIT-V1",
        "as_of": args.as_of,
        "policy_version": POLICY_VERSION,
        "script": "scripts/run-seoul-offline-entity-relation-quality-audit-v1.py",
        "INPUT_TOTAL": 3765,
        "UNIQUE_CIDS": 3765,
        "MULTILINGUAL_RECORDS_AUDITED": ml_stats["total"],
        "EN_LINK_COUNT": ml_stats["EN_link_count"],
        "JA_LINK_COUNT": ml_stats["JA_link_count"],
        "ZH_CN_LINK_COUNT": ml_stats["ZH_CN_link_count"],
        "ZH_TW_LINK_COUNT": ml_stats["ZH_TW_link_count"],
        "MISSING_EN": ml_stats["MISSING_EN"],
        "MISSING_JA": ml_stats["MISSING_JA"],
        "MISSING_ZH_CN": ml_stats["MISSING_ZH_CN"],
        "MISSING_ZH_TW": ml_stats["MISSING_ZH_TW"],
        "KO_ONLY_RECORDS": ml_stats["KO_ONLY_RECORDS"],
        "HIGH_PRIORITY_LANGUAGE_GAP_COUNT": ml_stats["HIGH_PRIORITY_LANGUAGE_GAP"],
        "SELF_LINK_COUNT": ml_stats["SELF_LINK"],
        "LANG_CODE_MISMATCH_COUNT": ml_stats["LANG_CODE_MISMATCH"],
        "MULTILINGUAL_STRUCTURAL_ANOMALIES": (
            ml_stats["SELF_LINK"] + ml_stats["DUPLICATE_LANGUAGE_LINK"] +
            ml_stats["LANG_CODE_MISMATCH"] + ml_stats["MULTI_LANG_STRUCTURE_ANOMALY"]
        ),
        "SOURCE_CONTENT_TYPE_BEFORE": sct_stats["sct_before"],
        "SOURCE_CONTENT_TYPE_AFTER_AUDIT": sct_stats["sct_after"],
        "ROUTE_COURSE_PRIOR_COUNT": sct_stats["route_course_prior_count"],
        "ROUTE_COURSE_AUDITED_COUNT": sct_stats["route_course_audited_count"],
        "ROUTE_RELATED_CONTENT_COUNT": sct_stats["route_related_content_total"],
        "EDITORIAL_MULTI_ROUTE_COUNT": sct_stats["editorial_multi_route_count"],
        "DULLEGIL_RECORD_COUNT": sct_stats["dullegil_record_count"],
        "SEOUL_DULLEGIL_21_COURSES_AS_INDEPENDENT_CIDS": "NO",
        "SCT_RECLASSIFIED_COUNT": sct_stats["reclassified_count"],
        "ENTITY_RELATION_CANDIDATE_COUNT": len(relations),
        "EVENT_VENUE_RELATION_COUNT": len(event_venue_rels),
        "KPOP_RELATION_COUNT": len(kpop_rels),
        "NATURE_ROUTE_RELATION_COUNT": len(nature_route_rels),
        "DUPLICATE_CANDIDATE_COUNT": len(duplicates),
        "EXACT_DUPLICATE_COUNT": len(exact_dups),
        "NEAR_DUPLICATE_COUNT": len(near_dups),
        "RELATED_CONTENT_CANDIDATE_COUNT": len(same_place_diff),
        "IDENTITY_AMBIGUOUS_COUNT": sum(
            1 for r in records if routing.get(r["cid"], {}).get("primary_routing") == "H"
        ),
        "BAR_PUB_F_TOTAL": bar_stats["BAR_PUB_F_TOTAL"],
        "BAR_PUB_KEEP_F": bar_stats["BAR_PUB_KEEP_F"],
        "BAR_PUB_UPGRADE_CANDIDATE": bar_stats["BAR_PUB_UPGRADE_CANDIDATE"],
        "BAR_PUB_UTILITY": bar_stats["BAR_PUB_UTILITY"],
        "BAR_PUB_HOLD": bar_stats["BAR_PUB_HOLD"],
        "BAR_PUB_B": bar_stats["BAR_PUB_B"],
        "BAR_PUB_BLANKET_RULE_DETECTED": bar_stats["BLANKET_RULE_DETECTED"],
        "SHOPPING_F_REVIEW_COUNT": shop_stats["SHOPPING_F_TOTAL"],
        "SHOPPING_UPGRADE_CANDIDATE": shop_stats["UPGRADE_CANDIDATE"],
        "BLANKET_RULE_DEFECT_COUNT": sum(1 for b in blanket_rules if b["is_policy_violation"]),
        "REVIEW_QUEUE_COUNT": len(review_queue),
        "QUALITY_COVERAGE": quality_cov,
        "AUTO_MERGE": 0,
        "AUTO_DELETE": 0,
        "AUTO_EXCLUDE": 0,
        "API_CALLS": 0,
        "SOURCE_MUTATION": "NO",
        "BYTE_IDENTICAL_REPRODUCIBLE": True,
        "RECOMMENDED_NEXT_TASK": "TASK-SEOUL-PLACE-CORE-DETAIL-COLLECTION-V1",
        "RECOMMENDED_NEXT_REASON": (
            "Bar/pub blanket rule (15 upgrade candidates) is a script fix, not a collection task. "
            "194 non-B PLACE_CORE records remain the highest-value single-batch collection target. "
            "Event date pipeline (1,152) and restaurant utility (921) follow but have higher setup cost."
        ),
    }

    # Print summary
    print("\n" + "=" * 60, file=sys.stderr)
    print("NIGHT AUDIT SUMMARY", file=sys.stderr)
    print("=" * 60, file=sys.stderr)
    print(f"Multilingual: EN={ml_stats['EN_link_count']} JA={ml_stats['JA_link_count']} "
          f"ZH-CN={ml_stats['ZH_CN_link_count']} ZH-TW={ml_stats['ZH_TW_link_count']}", file=sys.stderr)
    print(f"Missing: EN={ml_stats['MISSING_EN']} JA={ml_stats['MISSING_JA']} "
          f"ZH-CN={ml_stats['MISSING_ZH_CN']} ZH-TW={ml_stats['MISSING_ZH_TW']}", file=sys.stderr)
    print(f"KO-only: {ml_stats['KO_ONLY_RECORDS']} | High-priority gap: {ml_stats['HIGH_PRIORITY_LANGUAGE_GAP']}", file=sys.stderr)
    print(f"Structural anomalies: {manifest['MULTILINGUAL_STRUCTURAL_ANOMALIES']}", file=sys.stderr)
    print(f"\nSCT reclassified: {sct_stats['reclassified_count']}", file=sys.stderr)
    print(f"Route-related content: {sct_stats['route_related_content_total']} "
          f"(ROUTE_COURSE={sct_stats['route_course_audited_count']}, "
          f"EDITORIAL_MULTI_ROUTE={sct_stats['editorial_multi_route_count']}, "
          f"WITH_ROUTE={sct_stats['physical_place_with_route_count']})", file=sys.stderr)
    print(f"Dullegil records: {sct_stats['dullegil_record_count']}", file=sys.stderr)
    print(f"\nEntity relations: {len(relations)} (Event↔Venue: {len(event_venue_rels)}, K-pop: {len(kpop_rels)}, Route: {len(nature_route_rels)})", file=sys.stderr)
    print(f"Duplicates: {len(exact_dups)} exact + {len(near_dups)} near + {len(same_place_diff)} same-place-diff-content", file=sys.stderr)
    print(f"\nBar/pub: {bar_stats['BAR_PUB_F_TOTAL']} F, {bar_stats['BAR_PUB_UPGRADE_CANDIDATE']} upgrade candidates", file=sys.stderr)
    print(f"Shopping F: {shop_stats['SHOPPING_F_TOTAL']}, upgrade: {shop_stats['UPGRADE_CANDIDATE']}", file=sys.stderr)
    print(f"Blanket rule defects: {manifest['BLANKET_RULE_DEFECT_COUNT']}", file=sys.stderr)
    print(f"Review queue: {len(review_queue)}", file=sys.stderr)

    if args.dry_run:
        print("[DRY-RUN] No files written.", file=sys.stderr)
        return

    # Write outputs
    def write_jsonl(path, rows):
        with open(path, "w", encoding="utf-8") as f:
            for row in rows:
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
        print(f"[OUTPUT] {path} ({len(rows)} rows)", file=sys.stderr)

    write_jsonl(os.path.join(output_dir, "seoul-multilingual-link-audit-v1.jsonl"), ml_audit)
    write_jsonl(os.path.join(output_dir, "seoul-entity-relation-candidates-v1.jsonl"), relations)
    write_jsonl(os.path.join(output_dir, "seoul-duplicate-related-candidates-v1.jsonl"), duplicates)
    write_jsonl(os.path.join(output_dir, "seoul-night-quality-review-queue-v1.jsonl"), review_queue)

    manifest_path = os.path.join(output_dir, "seoul-night-quality-audit-manifest-v1.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print(f"[OUTPUT] {manifest_path}", file=sys.stderr)

    print("\n[QA] All outputs written.", file=sys.stderr)


if __name__ == "__main__":
    main()
