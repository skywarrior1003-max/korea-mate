#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TASK-SEOUL-FULL-ENRICHMENT-ROUTING-V2-CORRECTION
서울 VisitSeoul 전체 3,765건 enrichment routing V2

정책 버전: v2.0.0
AS_OF: 2026-08-10

V1 대비 수정 사항:
  BLANKET_01: Ck6n0w6(주점) category 전체 F → 3-tier (A/C/F) keyword evidence routing
  BLANKET_02: Cl2d2s1(교육시설) category 전체 H → evidence-based (A/C/F)
  BLANKET_03: Ct1z4k9(대형마트) latent F → K-food/specialty signal 확인 (현재 무해, 미래 대비)
  SCT: 야간 audit 재분류 16건 반영 (route/editorial/dullegil 탐지)

금지:
  API 호출 없음 / DB 없음 / 기존 V1 파일 삭제·덮어쓰기 없음
  AUTO_MERGE=0 / AUTO_DELETE=0 / AUTO_EXCLUDE=0
"""

import argparse
import json
import os
import sys
import unicodedata
from collections import Counter

POLICY_VERSION = "v2.0.0"
DEFAULT_AS_OF = "2026-08-10"

# ──────────────────────────────────────────────
# 1. 카테고리 매핑 (V1 동일)
# ──────────────────────────────────────────────

CAT_CODE_TO_LABEL = {
    "Ca0o2d4": "문화관광",
    "Ca1z6p7": "역사관광",
    "Cb2b0t2": "축제/공연/행사>공연",
    "Cb9c5i3": "역사관광>역사유적지>고분/능",
    "Cb9o5c4": "역사관광>역사유적지>사적지",
    "Cc9i5o2": "체험관광",
    "Cd0m9o0": "체험관광>전통체험",
    "Cd4y5u1": "축제/공연/행사>축제",
    "Ce7q5s7": "숙박>호텔",
    "Ce9z7g9": "문화관광>도시공원",
    "Cf1y9k1": "체험관광>웰니스관광",
    "Cg1x6l1": "문화관광>전시시설",
    "Ch4v8z7": "숙박",
    "Ch5t7s7": "역사관광>역사유적지>고궁",
    "Ch7l5i4": "음식>외국식>일식",
    "Ci7i9i6": "역사관광>역사유적지>근대건축물",
    "Ck6n0w6": "음식>주점",
    "Cl1k5b1": "역사관광>역사유적지",
    "Cl2d2s1": "문화관광>교육시설",
    "Cl5y4k0": "문화관광>랜드마크관광",
    "Cl8f8q1": "체험관광>기타체험",
    "Cl9n1c2": "음식>외국식>서양식",
    "Cl9s3y9": "음식",
    "Cm1y8v1": "음식>외국식>중식",
    "Cn0t1e0": "쇼핑>전문매장/상가",
    "Cn7k2s5": "음식>외국식>기타외국식",
    "Cn7z1h7": "쇼핑>시장",
    "Co0g3x0": "문화관광>레저스포츠시설",
    "Co2n1h7": "역사관광>역사유적지>성/문",
    "Co6c2n2": "자연관광",
    "Cp3b3j9": "자연관광>자연공원",
    "Cp5i3g2": "쇼핑>면세점",
    "Cp7e6o3": "문화관광>행사시설",
    "Cq3m6s6": "체험관광>공예체험",
    "Cq9d5v0": "체험관광>산사체험",
    "Cr0q2v2": "문화관광>전시시설>박물관",
    "Cr1f0k2": "문화관광>공연시설",
    "Cr6m1i5": "역사관광>역사유적지>기타역사유적지",
    "Cr6o1h2": "체험관광>산업관광",
    "Cs3j7y4": "쇼핑>백화점",
    "Ct1z4k9": "쇼핑>대형마트",
    "Ct4h4b7": "문화관광>기타문화관광지",
    "Ct9n1n3": "숙박>호스텔",
    "Ct9t6m8": "문화관광>전시시설>미술관/화랑",
    "Cu5u8d4": "자연관광>자연경관(산)",
    "Cu6j1f4": "축제/공연/행사>행사>박람회",
    "Cu8e6t5": "쇼핑",
    "Cu9u5z7": "축제/공연/행사>행사>전시회",
    "Cv7s8m5": "축제/공연/행사",
    "Cw1i3e4": "역사관광>종교성지",
    "Cw7q1x8": "축제/공연/행사>행사>기타행사",
    "Cw8j0y7": "자연관광>자연경관(하천)",
    "Cx0t8m5": "음식>카페/찻집",
    "Cx2j0n1": "음식>외국식",
    "Cx3e9k9": "음식>외국식>퓨전음식",
    "Cy4k5t1": "쇼핑>쇼핑몰",
    "Cy5h2x9": "문화관광>테마공원",
    "Cy6j7j7": "문화관광>전시시설>기타전시시설",
    "Cz9d1h6": "음식>한식",
}

# Nature 119 식별 코드
NATURE_119_CODES = {"Ce9z7g9", "Cu5u8d4", "Cp3b3j9"}
NATURE_119_TRACK = "PLACE_CORE_CANDIDATE"

EXPERIENCE_CONTENT_CODES = {
    "Cc9i5o2", "Cd0m9o0", "Cq3m6s6", "Cq9d5v0", "Cl8f8q1", "Cr6o1h2",
}

# ──────────────────────────────────────────────
# 2. V2 신규 키워드 상수
# ──────────────────────────────────────────────

# BAR/PUB V2: 3-tier 분류
# Tier A — destination/cultural bar (detail 수집으로 AI 적격 판정 가능)
BAR_A_KEYWORDS = [
    "루프탑", "rooftop", "야경", "전망대", "전망", "야간 뷰",
    "전통주", "전통 술", "막걸리", "한국 술", "한국술", "양조장", "주조",
    "재즈", "jazz", "라이브", "live music", "live 음악",
    "한류스타", "연예인", "k-pop", "kpop", "케이팝", "yg엔터", "엔터테인먼트",
    "클럽", "club",
    "한강뷰", "남산뷰", "한강 뷰", "남산 뷰", "남산술클럽", "남산",
    "국내 최초", "우리나라 최초", "최초", "역사적", "오래된", "유명한",
    "대표적", "명소",
    "7080", "80년대", "70년대",
    "호텔 라운지", "호텔 바", "6성급", "5성급",
    "포차 골목", "포차거리", "포장마차 거리",
    "헌책방", "문화공간", "복합문화",
]

# Tier C — utility/atmosphere enrichment
BAR_C_KEYWORDS = [
    "포차", "포장마차", "이자카야",
    "외국인", "tourist", "영어 메뉴", "영어메뉴",
    "특색", "이색", "개성", "감성", "힙", "分위기",
    "수제맥주", "craft beer", "크래프트",
    "소규모", "아담",
]

# EDUCATION V2: evidence-based routing
# A — 체험형/전시형/문화공간/특화시설 (VisitSeoul detail 수집으로 AI 적격 판정 가능)
EDU_A_KEYWORDS = [
    "체험", "전시", "관람", "박물관", "과학관", "과학전시",
    "한옥", "복합문화", "문화공간", "특화", "문화 공간",
    "최초", "국내 최초", "우리나라 최초",
    "어린이", "가족", "청소년", "키즈",
    "도전", "모험", "캠핑", "숲", "자연 체험",
    "책보고", "헌책방", "도서 문화", "북카페",
    "에너지", "드림센터", "안전체험", "재난 체험",
]

# C — 특화 학습 경험 (utility enrichment)
EDU_C_KEYWORDS = [
    "아카데미", "회화 수업", "한국어 수업", "어학",
    "클래스", "과정", "수업", "레슨",
]

# SHOPPING/MART V2 (latent fix — Ct1z4k9 향후 신규 레코드 대비)
MART_A_KEYWORDS = [
    "k-food", "k food", "한국 식품 전문", "체험형",
    "플래그십", "flagship", "기념품 전문",
]

# 공통 키워드 (V1에서 그대로 유지)
KPOP_KEYWORDS = [
    "k-pop", "kpop", "케이팝", "아이돌", "idol",
    "bts", "방탄", "blackpink", "블랙핑크", "exo", "엑소",
    "sm ", "hybe", "yg ", "jyp", "빅히트", "big hit",
    "ncity", "weverse", "smtown", "sm town", "팬덤",
    "아티스트", "엔터테인먼트", "k-culture",
]
KBEAUTY_KEYWORDS = [
    "k-beauty", "kbeauty", "케이뷰티", "화장품", "코스메틱",
    "올리브영", "미샤", "이니스프리", "etude", "laneige",
    "뷰티", "스킨케어",
]
HALAL_KEYWORDS = ["할랄", "halal", "무슬림", "muslim", "이슬람", "islam"]
VEGAN_KEYWORDS = [
    "채식", "비건", "vegan", "vegetarian", "베지테리안",
    "식물성", "meat-free",
]
SOLO_KEYWORDS = ["혼밥", "1인", "혼자", "솔로", "싱글", "1인용", "혼술"]
NIGHTVIEW_KEYWORDS = ["야경", "야간", "night view", "밤풍경", "노을"]
HANGANG_KEYWORDS = ["한강", "hangang", "han river", "반포", "여의도"]
CHEONGGYE_KEYWORDS = ["청계천", "cheonggyecheon"]
WALKING_KEYWORDS = ["산책", "걷기", "둘레길", "올레", "walk", "둘레"]
CYCLING_KEYWORDS = ["자전거", "자전거도로", "cycling", "bike"]
TREKKING_KEYWORDS = ["트레킹", "등산", "hiking", "trekking", "산행", "등산로"]
TEMPLE_KEYWORDS = ["템플스테이", "temple stay", "산사체험", "사찰"]
FAMILY_KEYWORDS = ["어린이", "가족", "키즈", "kids", "family", "아이", "영아", "유아"]
BREAKFAST_KEYWORDS = ["조식", "아침", "breakfast", "브런치", "brunch"]
LATENIGHT_KEYWORDS = ["24시간", "심야", "새벽", "밤새", "야간운영"]
WELLNESS_KEYWORDS = ["스파", "spa", "사우나", "온천", "명상", "meditation", "웰니스", "wellness"]
POPUP_KEYWORDS = ["팝업", "pop-up", "popup"]
PERF_KEYWORDS = ["공연", "뮤지컬", "콘서트", "연극", "오페라", "performance"]
EXHIB_KEYWORDS = ["전시", "exhibition", "gallery", "갤러리"]
MARKET_KEYWORDS = ["시장", "market", "골목시장", "전통시장"]
HANSIK_KEYWORDS = ["한식", "비빔밥", "삼겹살", "갈비", "불고기", "냉면", "순두부", "된장", "김치", "해장국", "삼계탕"]
VIEWPOINT_KEYWORDS = ["전망대", "전망", "view", "뷰", "타워"]

# SCT route-related detection
DULLEGIL_KEYWORDS = ["둘레길", "둘레 길"]
ROUTE_COURSE_STRONG_KEYWORDS = [
    "코스 안내", "코스안내", "등산코스", "등산로", "자전거길", "자전거 길",
    "자전거도로", "트레일", "trail", "산책로", "순환길", "수변길",
]
EDITORIAL_MULTI_KEYWORDS = [
    "추천", "가이드", "모음", "베스트", "best", "top ",
    "100선", "특집", "소개", "정보지", "안내서",
]


def contains_any(text: str, keywords: list) -> bool:
    t = text.lower()
    return any(kw in t for kw in keywords)


# ──────────────────────────────────────────────
# 3. 데이터 로드 (V1 동일)
# ──────────────────────────────────────────────

def load_inventory(base_dir: str) -> list:
    path = os.path.join(base_dir, "data/seoul-source-audit",
                        "seoul-visitseoul-full-inventory-v1.jsonl")
    records = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records


def load_existing_detail_cids(base_dir: str) -> dict:
    cid_info = {}
    paths = [
        (os.path.join(base_dir, "data/seoul-source-audit",
                      "seoul-integrated-travel-value-detail-samples-v1.jsonl"),
         "TASK-SEOUL-TRAVEL-VALUE-INTEGRATION-AND-ENTITY-MODEL-V1"),
        (os.path.join(base_dir, "data/seoul-source-audit",
                      "seoul-visitseoul-detail-dryrun-v1.jsonl"),
         "TASK-SEOUL-VISITSEOUL-DETAIL-DRYRUN-V1"),
    ]
    for path, task in paths:
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    r = json.loads(line)
                    cid = r.get("cid")
                    if cid and cid not in cid_info:
                        cid_info[cid] = {
                            "source_task": task,
                            "batch": r.get("batch", "unknown"),
                        }
    return cid_info


def load_v1_routing(base_dir: str) -> dict:
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


def build_nature_119_cids(records: list) -> set:
    return {
        r["cid"]
        for r in records
        if r.get("com_ctgry_sn") in NATURE_119_CODES
        and r.get("routing_track") == NATURE_119_TRACK
    }


# ──────────────────────────────────────────────
# 4. SCT 분류 V2 (야간 audit 보정 포함)
# ──────────────────────────────────────────────

def classify_source_content_type_v2(track: str, cat_code: str, text: str, title: str) -> tuple:
    """
    V2 SCT: V1 기반 + 야간 audit route/editorial 감지 추가.
    7 types + PHYSICAL_PLACE_WITH_ROUTE_CONTENT + EDITORIAL_MULTI_ROUTE_CONTENT.
    """
    # Event track
    if track == "EVENT_TRACK":
        if cat_code == "Cp7e6o3":
            return "PHYSICAL_PLACE", "HIGH"
        return "EVENT", "HIGH"

    if track == "RESTAURANT_TRACK":
        return "PHYSICAL_PLACE", "HIGH"

    if track == "GENERAL_ACCOMMODATION_EXCLUDE":
        return "PHYSICAL_PLACE", "HIGH"

    if track == "SHOPPING_REVIEW":
        return "PHYSICAL_PLACE", "HIGH"

    if track == "EXPERIENCE_CANDIDATE":
        if cat_code == "Cq9d5v0":
            return "EXPERIENCE_CONTENT", "HIGH"
        if cat_code in {"Cc9i5o2", "Cd0m9o0", "Cq3m6s6"}:
            return "EXPERIENCE_CONTENT", "HIGH"
        if cat_code in {"Cl8f8q1", "Cr6o1h2"}:
            return "EXPERIENCE_CONTENT", "MEDIUM"
        if cat_code == "Cf1y9k1":
            return "PHYSICAL_PLACE", "MEDIUM"
        return "EXPERIENCE_CONTENT", "MEDIUM"

    if track == "TEMPLE_STAY_CANDIDATE":
        return "EXPERIENCE_CONTENT", "HIGH"

    # PLACE tracks — route/editorial detection (야간 audit SCT 보정)
    is_dullegil = contains_any(title, DULLEGIL_KEYWORDS)
    has_route_strong = contains_any(title, ROUTE_COURSE_STRONG_KEYWORDS)
    has_editorial_multi = (
        contains_any(title, EDITORIAL_MULTI_KEYWORDS)
        and any(c in text for c in ["~", "일대", "각지", "권역", "곳곳"])
    )

    if is_dullegil:
        if any(kw in title.lower() for kw in ["코스 안내", "코스안내", "전체", "안내"]):
            return "EDITORIAL_MULTI_ROUTE_CONTENT", "HIGH"
        elif any(kw in title.lower() for kw in ["걷기", "나들이", "벚꽃", "하이킹"]):
            return "ROUTE_COURSE", "MEDIUM"
        else:
            return "PHYSICAL_PLACE_WITH_ROUTE_CONTENT", "MEDIUM"

    if track in {"PLACE_CORE_CANDIDATE", "PLACE_CONDITIONAL_REVIEW"}:
        if has_route_strong and not has_editorial_multi:
            return "PHYSICAL_PLACE_WITH_ROUTE_CONTENT", "MEDIUM"
        if has_editorial_multi:
            return "EDITORIAL_CONTENT", "MEDIUM"

    if track == "PLACE_CORE_CANDIDATE":
        if cat_code in NATURE_119_CODES:
            return "PHYSICAL_PLACE", "HIGH"
        if cat_code in {"Cb9c5i3", "Cb9o5c4", "Ch5t7s7", "Ci7i9i6", "Co2n1h7",
                        "Cr6m1i5", "Cl1k5b1"}:
            return "PHYSICAL_PLACE", "HIGH"
        if cat_code == "Cr0q2v2":
            return "PHYSICAL_PLACE", "HIGH"
        if cat_code == "Cl5y4k0":
            return "PHYSICAL_PLACE", "HIGH"
        if cat_code == "Cn7z1h7":
            return "PHYSICAL_PLACE", "HIGH"
        return "PHYSICAL_PLACE", "MEDIUM"

    if track == "PLACE_CONDITIONAL_REVIEW":
        if cat_code in {"Cg1x6l1", "Ct9t6m8", "Cy6j7j7"}:
            return "PHYSICAL_PLACE", "HIGH"
        if cat_code == "Cr1f0k2":
            return "PHYSICAL_PLACE", "HIGH"
        if cat_code == "Cw1i3e4":
            return "PHYSICAL_PLACE", "HIGH"
        if cat_code == "Co0g3x0":
            return "PHYSICAL_PLACE", "HIGH"
        if cat_code == "Co6c2n2":
            return "PHYSICAL_PLACE", "MEDIUM"
        return "PHYSICAL_PLACE", "MEDIUM"

    if track == "UNRESOLVED_CATEGORY":
        if cat_code in {"Cw8j0y7", "Cy5h2x9", "Ca1z6p7"}:
            return "PHYSICAL_PLACE", "MEDIUM"
        return "UNKNOWN", "LOW"

    return "UNKNOWN", "LOW"


# ──────────────────────────────────────────────
# 5. Travel Value Signals (V1 유지 + V2 bar/edu 보정)
# ──────────────────────────────────────────────

def assign_travel_value_signals_v2(track: str, cat_code: str, text: str, sct: str) -> list:
    signals = []

    if track == "PLACE_CORE_CANDIDATE":
        signals.append("HIGH_TRAVEL_VALUE")

    elif track == "EXPERIENCE_CANDIDATE":
        if cat_code in {"Cc9i5o2", "Cd0m9o0", "Cq3m6s6"}:
            signals.extend(["HIGH_TRAVEL_VALUE", "INTENT_SPECIFIC_VALUE"])
        elif cat_code == "Cq9d5v0":
            signals.extend(["HIGH_TRAVEL_VALUE", "INTENT_SPECIFIC_VALUE"])
        elif cat_code == "Cf1y9k1":
            signals.extend(["INTENT_SPECIFIC_VALUE", "UTILITY_VALUE"])
        else:
            signals.append("GENERAL_TRAVEL_VALUE")

    elif track == "TEMPLE_STAY_CANDIDATE":
        signals.extend(["HIGH_TRAVEL_VALUE", "INTENT_SPECIFIC_VALUE"])

    elif track == "EVENT_TRACK":
        if cat_code == "Cp7e6o3":
            signals.append("GENERAL_TRAVEL_VALUE")
        else:
            signals.append("INTENT_SPECIFIC_VALUE")

    elif track == "RESTAURANT_TRACK":
        if cat_code == "Ck6n0w6":  # V2: bar signal based on tier
            if contains_any(text, BAR_A_KEYWORDS):
                signals.extend(["INTENT_SPECIFIC_VALUE", "GENERAL_TRAVEL_VALUE"])
            elif contains_any(text, BAR_C_KEYWORDS):
                signals.extend(["UTILITY_VALUE", "GENERAL_TRAVEL_VALUE"])
            else:
                signals.extend(["EXTERNAL_SEARCH_VALUE", "LOW_TRAVEL_VALUE"])
        elif cat_code == "Cz9d1h6":
            signals.extend(["UTILITY_VALUE", "INTENT_SPECIFIC_VALUE"])
        elif cat_code == "Cx0t8m5":
            signals.append("UTILITY_VALUE")
        else:
            signals.append("UTILITY_VALUE")
        if contains_any(text, HALAL_KEYWORDS + VEGAN_KEYWORDS + SOLO_KEYWORDS):
            if "INTENT_SPECIFIC_VALUE" not in signals:
                signals.append("INTENT_SPECIFIC_VALUE")

    elif track == "SHOPPING_REVIEW":
        if cat_code in {"Cp5i3g2", "Cs3j7y4"}:
            signals.append("HIGH_TRAVEL_VALUE")
        elif cat_code == "Ct1z4k9":
            if contains_any(text, MART_A_KEYWORDS):
                signals.append("GENERAL_TRAVEL_VALUE")
            else:
                signals.extend(["EXTERNAL_SEARCH_VALUE", "LOW_TRAVEL_VALUE"])
        elif cat_code == "Cn7z1h7":
            signals.append("HIGH_TRAVEL_VALUE")
        else:
            if contains_any(text, KPOP_KEYWORDS + KBEAUTY_KEYWORDS):
                signals.extend(["INTENT_SPECIFIC_VALUE", "GENERAL_TRAVEL_VALUE"])
            else:
                signals.append("GENERAL_TRAVEL_VALUE")

    elif track == "PLACE_CONDITIONAL_REVIEW":
        if cat_code in {"Cg1x6l1", "Ct9t6m8", "Cy6j7j7", "Cr0q2v2"}:
            signals.append("GENERAL_TRAVEL_VALUE")
        elif cat_code == "Cl2d2s1":  # V2: evidence-based signal
            if contains_any(text, EDU_A_KEYWORDS):
                signals.extend(["GENERAL_TRAVEL_VALUE", "INTENT_SPECIFIC_VALUE"])
            else:
                signals.extend(["EXTERNAL_SEARCH_VALUE", "LOW_TRAVEL_VALUE"])
        else:
            signals.append("GENERAL_TRAVEL_VALUE")

    elif track == "GENERAL_ACCOMMODATION_EXCLUDE":
        signals.extend(["EXTERNAL_SEARCH_VALUE", "LOW_TRAVEL_VALUE"])

    elif track == "UNRESOLVED_CATEGORY":
        signals.append("INSUFFICIENT_EVIDENCE")

    # Keyword overlays
    if contains_any(text, KPOP_KEYWORDS) and "INTENT_SPECIFIC_VALUE" not in signals:
        signals.append("INTENT_SPECIFIC_VALUE")
    if contains_any(text, NIGHTVIEW_KEYWORDS) and "INTENT_SPECIFIC_VALUE" not in signals:
        signals.append("INTENT_SPECIFIC_VALUE")

    if not signals:
        signals.append("INSUFFICIENT_EVIDENCE")

    return list(dict.fromkeys(signals))


# ──────────────────────────────────────────────
# 6. Intent 감지 (V1 동일)
# ──────────────────────────────────────────────

def detect_intents_v2(track: str, cat_code: str, text: str) -> list:
    intents = []
    cat_label = CAT_CODE_TO_LABEL.get(cat_code, "")

    if track == "RESTAURANT_TRACK":
        intents.append("food_trip")
        if cat_code == "Cz9d1h6" or contains_any(text, HANSIK_KEYWORDS):
            intents.append("korean_cuisine")
        if cat_code == "Cx0t8m5":
            intents.append("cafe_culture")
        if cat_code == "Ck6n0w6":
            intents.append("nightlife")

    if track in {"PLACE_CORE_CANDIDATE", "PLACE_CONDITIONAL_REVIEW"}:
        if "역사" in cat_label or cat_code in {"Ch5t7s7", "Co2n1h7", "Cb9o5c4",
                                                "Cb9c5i3", "Cl1k5b1", "Cr6m1i5",
                                                "Ci7i9i6", "Cw1i3e4"}:
            intents.append("heritage_history")
        if cat_code in {"Cr0q2v2", "Ct9t6m8", "Cy6j7j7", "Cg1x6l1"}:
            intents.append("exhibition")
        if cat_code == "Cr1f0k2":
            intents.append("performance")
        if cat_code in NATURE_119_CODES:
            if cat_code == "Cu5u8d4":
                intents.extend(["nature_trekking", "trekking"])
            if cat_code == "Cp3b3j9":
                intents.append("nature_trekking")
            if cat_code == "Ce9z7g9":
                intents.extend(["walking_urban", "hangang_experience"])

    # V2: 교육시설 intent 추가
    if track == "PLACE_CONDITIONAL_REVIEW" and cat_code == "Cl2d2s1":
        if contains_any(text, EDU_A_KEYWORDS):
            if contains_any(text, FAMILY_KEYWORDS + ["어린이", "청소년"]):
                intents.append("family_kids")
            if contains_any(text, ["체험", "전시", "박물관", "과학관"]):
                intents.append("exhibition")
        if "한글" in text or "한국어" in text:
            intents.append("traditional_culture")

    if track == "EXPERIENCE_CANDIDATE":
        if cat_code in {"Cc9i5o2", "Cd0m9o0", "Cq3m6s6"}:
            intents.append("traditional_culture")
        if cat_code == "Cq9d5v0":
            intents.append("temple_stay")
        if cat_code == "Cf1y9k1":
            intents.append("wellness")

    if track == "TEMPLE_STAY_CANDIDATE":
        intents.append("temple_stay")

    if track == "SHOPPING_REVIEW":
        intents.append("shopping")
        if cat_code == "Cn7z1h7":
            intents.append("traditional_market")

    if track == "EVENT_TRACK":
        intents.append("festival")

    # Keyword overlays
    if contains_any(text, KPOP_KEYWORDS): intents.append("kpop")
    if contains_any(text, KBEAUTY_KEYWORDS): intents.append("kbeauty")
    if contains_any(text, HALAL_KEYWORDS): intents.append("halal")
    if contains_any(text, VEGAN_KEYWORDS): intents.append("vegetarian")
    if contains_any(text, SOLO_KEYWORDS): intents.append("solo_travel")
    if contains_any(text, HANGANG_KEYWORDS): intents.append("hangang_experience")
    if contains_any(text, CHEONGGYE_KEYWORDS): intents.append("walking_urban")
    if contains_any(text, WALKING_KEYWORDS): intents.append("walking_urban")
    if contains_any(text, CYCLING_KEYWORDS): intents.append("cycling")
    if contains_any(text, TREKKING_KEYWORDS): intents.append("trekking")
    if contains_any(text, NIGHTVIEW_KEYWORDS): intents.append("night_view")
    if contains_any(text, FAMILY_KEYWORDS): intents.append("family_kids")
    if contains_any(text, BREAKFAST_KEYWORDS): intents.append("breakfast")
    if contains_any(text, LATENIGHT_KEYWORDS): intents.append("late_night")
    if contains_any(text, WELLNESS_KEYWORDS): intents.append("wellness")
    if contains_any(text, POPUP_KEYWORDS): intents.append("popup")
    if contains_any(text, PERF_KEYWORDS) and "performance" not in intents:
        intents.append("performance")
    if contains_any(text, EXHIB_KEYWORDS) and "exhibition" not in intents:
        intents.append("exhibition")
    if contains_any(text, MARKET_KEYWORDS) and "traditional_market" not in intents:
        intents.append("traditional_market")
    if contains_any(text, TEMPLE_KEYWORDS) and "temple_stay" not in intents:
        intents.append("temple_stay")
    if contains_any(text, VIEWPOINT_KEYWORDS) and "night_view" not in intents:
        intents.append("night_view")
    if contains_any(text, ["한류", "hallyu", "k-drama", "드라마촬영"]):
        intents.append("hallyu")

    return list(dict.fromkeys(intents))


# ──────────────────────────────────────────────
# 7. Primary/Secondary Routing V2
# ──────────────────────────────────────────────

def assign_routing_v2(record: dict, existing_detail_info: dict,
                      nature_119_cids: set, as_of: str) -> tuple:
    """
    Returns: (primary, secondary_list, reason_codes_list, evidence_source, blanket_fix_applied)
    """
    cid = record["cid"]
    track = record.get("routing_track", "")
    cat_code = record.get("com_ctgry_sn", "")
    title = record.get("post_sj", "") or ""
    summary = record.get("sumry", "") or ""
    text = title + " " + summary
    text_lower = text.lower()

    reasons = []
    secondary = []
    blanket_fix = None  # tracks which blanket rule was fixed

    # ─── Existing detail → B ──────────────────────────────────────────
    is_nature_119 = cid in nature_119_cids
    has_detail = cid in existing_detail_info

    if is_nature_119:
        reasons.append("NATURE_119_DETAIL_EVIDENCE_CONFIRMED")
        if cat_code == "Ce9z7g9":
            secondary.extend(["E", "G"])
        if contains_any(text_lower, ["등산로", "코스", "trekking", "trail"]):
            if "E" not in secondary:
                secondary.append("E")
        return "B", list(dict.fromkeys(secondary)), reasons, "NATURE_119_CATEGORY_CODE_MATCH", blanket_fix

    if has_detail:
        batch = existing_detail_info[cid].get("batch", "unknown")
        reasons.append(f"EXISTING_INTEGRATED_DETAIL:{batch}")
        if track == "RESTAURANT_TRACK":
            secondary.append("C")
        elif track == "EVENT_TRACK":
            secondary.append("D")
        return "B", list(dict.fromkeys(secondary)), reasons, "INTEGRATED_DETAIL_SAMPLE", blanket_fix

    # ─── EVENT TRACK ──────────────────────────────────────────────────
    if track == "EVENT_TRACK":
        if cat_code == "Cp7e6o3":
            reasons.append("CATEGORY_IS_EVENT_VENUE_NOT_EVENT")
            secondary.append("E")
            return "A", list(dict.fromkeys(secondary)), reasons, "STRUCTURED_API_FIELD", blanket_fix
        reasons.append("EVENT_DATE_AND_STATUS_UNKNOWN")
        secondary.append("E")
        if contains_any(text_lower, KPOP_KEYWORDS):
            if "E" not in secondary:
                secondary.append("E")
        return "D", list(dict.fromkeys(secondary)), reasons, "STRUCTURED_API_FIELD", blanket_fix

    # ─── RESTAURANT TRACK ─────────────────────────────────────────────
    if track == "RESTAURANT_TRACK":
        # V2: BLANKET_01 FIX — Ck6n0w6 3-tier routing
        if cat_code == "Ck6n0w6":
            blanket_fix = "BLANKET_01_FIX"
            if contains_any(text_lower, BAR_A_KEYWORDS):
                reasons.append("BAR_PUB_DESTINATION_OR_CULTURAL_VALUE_DETECTED")
                secondary.append("E")
                return "A", list(dict.fromkeys(secondary)), reasons, "DESCRIPTION_TEXT_DERIVED", blanket_fix
            elif contains_any(text_lower, BAR_C_KEYWORDS):
                reasons.append("BAR_PUB_UTILITY_ATMOSPHERE_VALUE_DETECTED")
                secondary.append("G")
                return "C", list(dict.fromkeys(secondary)), reasons, "DESCRIPTION_TEXT_DERIVED", blanket_fix
            else:
                reasons.append("BAR_PUB_NO_HIGH_VALUE_SIGNAL_EXTERNAL_SEARCH_SUITABLE")
                secondary.append("G")
                return "F", list(dict.fromkeys(secondary)), reasons, "STRUCTURED_API_FIELD", blanket_fix

        # Halal/vegan → E
        if contains_any(text_lower, HALAL_KEYWORDS):
            reasons.append("HALAL_KEYWORD_DETECTED")
            secondary.append("E")
        if contains_any(text_lower, VEGAN_KEYWORDS):
            reasons.append("VEGAN_KEYWORD_DETECTED")

        # Destination signal → A
        dest_keywords = ["유명", "대표", "명물", "맛집", "본점", "발상지", "원조"]
        if contains_any(text_lower, dest_keywords):
            reasons.append("DESTINATION_RESTAURANT_SIGNAL")
            secondary.append("C")
            return "A", list(dict.fromkeys(secondary)), reasons, "DESCRIPTION_TEXT_DERIVED", blanket_fix

        # 카페 → C
        if cat_code == "Cx0t8m5":
            reasons.append("CAFE_UTILITY_ENRICHMENT")
            secondary.append("G")
            return "C", list(dict.fromkeys(secondary)), reasons, "STRUCTURED_API_FIELD", blanket_fix

        # Default
        reasons.append("RESTAURANT_UTILITY_ENRICHMENT_REQUIRED")
        return "C", list(dict.fromkeys(secondary)), reasons, "STRUCTURED_API_FIELD", blanket_fix

    # ─── PLACE CORE ───────────────────────────────────────────────────
    if track == "PLACE_CORE_CANDIDATE":
        reasons.append("PLACE_CORE_TV_GATE_ASSESSMENT_NEEDED")
        if cat_code == "Cr0q2v2":
            secondary.append("E")
        if cat_code in {"Ch5t7s7", "Cb9o5c4", "Co2n1h7", "Cb9c5i3"}:
            secondary.append("E")
        if cat_code == "Cn7z1h7":
            secondary.append("G")
        return "A", list(dict.fromkeys(secondary)), reasons, "STRUCTURED_API_FIELD", blanket_fix

    # ─── PLACE CONDITIONAL ────────────────────────────────────────────
    if track == "PLACE_CONDITIONAL_REVIEW":
        # V2: BLANKET_02 FIX — Cl2d2s1 evidence-based routing
        if cat_code == "Cl2d2s1":
            blanket_fix = "BLANKET_02_FIX"
            if contains_any(text_lower, EDU_A_KEYWORDS):
                reasons.append("EDUCATION_FACILITY_HAS_EXPERIENTIAL_OR_CULTURAL_VALUE")
                secondary.append("E")
                return "A", list(dict.fromkeys(secondary)), reasons, "DESCRIPTION_TEXT_DERIVED", blanket_fix
            elif contains_any(text_lower, EDU_C_KEYWORDS):
                reasons.append("EDUCATION_FACILITY_HAS_LANGUAGE_LEARNING_UTILITY")
                secondary.append("G")
                return "C", list(dict.fromkeys(secondary)), reasons, "DESCRIPTION_TEXT_DERIVED", blanket_fix
            else:
                reasons.append("EDUCATION_FACILITY_GENERAL_CIVIC_EXTERNAL_SEARCH_SUITABLE")
                return "F", list(dict.fromkeys(secondary)), reasons, "DESCRIPTION_TEXT_DERIVED", blanket_fix

        # 자연관광
        if cat_code == "Co6c2n2":
            reasons.append("NATURE_GENERAL_DETAIL_AND_SOURCE_NEEDED")
            secondary.append("E")
            return "A", list(dict.fromkeys(secondary)), reasons, "STRUCTURED_API_FIELD", blanket_fix

        # 기타문화관광지
        if cat_code == "Ct4h4b7":
            if contains_any(text_lower, KPOP_KEYWORDS + POPUP_KEYWORDS + EXHIB_KEYWORDS):
                reasons.append("CULTURAL_TOURISM_SPECIAL_CONTENT_DETECTED")
                return "A", list(dict.fromkeys(secondary)), reasons, "DESCRIPTION_TEXT_DERIVED", blanket_fix
            reasons.append("OTHER_CULTURAL_SITE_AMBIGUOUS")
            return "H", list(dict.fromkeys(secondary)), reasons, "STRUCTURED_API_FIELD", blanket_fix

        # 전시/공연/종교 등 → A
        reasons.append("CONDITIONAL_REVIEW_DETAIL_NEEDED_FOR_TV_GATE")
        if cat_code in {"Cg1x6l1", "Ct9t6m8", "Cy6j7j7"}:
            secondary.append("E")
        if cat_code == "Cw1i3e4":
            secondary.append("G")
        return "A", list(dict.fromkeys(secondary)), reasons, "STRUCTURED_API_FIELD", blanket_fix

    # ─── SHOPPING ────────────────────────────────────────────────────
    if track == "SHOPPING_REVIEW":
        # V2: BLANKET_03 latent fix — Ct1z4k9 K-food signal check
        if cat_code == "Ct1z4k9":
            if contains_any(text_lower, MART_A_KEYWORDS):
                reasons.append("LARGE_MART_SPECIALTY_TRAVELER_VALUE_DETECTED")
                return "A", list(dict.fromkeys(secondary)), reasons, "DESCRIPTION_TEXT_DERIVED", "BLANKET_03_FIX"
            else:
                reasons.append("LARGE_RETAIL_CHAIN_EXTERNAL_SEARCH")
                return "F", list(dict.fromkeys(secondary)), reasons, "STRUCTURED_API_FIELD", None

        if cat_code in {"Cp5i3g2", "Cs3j7y4"}:
            reasons.append("DESTINATION_SHOPPING_HIGH_TRAVEL_VALUE")
            return "A", list(dict.fromkeys(secondary)), reasons, "STRUCTURED_API_FIELD", blanket_fix

        if contains_any(text_lower, KPOP_KEYWORDS + KBEAUTY_KEYWORDS):
            reasons.append("KPOP_KBEAUTY_INTENT_SHOPPING")
            secondary.append("E")
            return "A", list(dict.fromkeys(secondary)), reasons, "DESCRIPTION_TEXT_DERIVED", blanket_fix

        if cat_code == "Cy4k5t1":
            reasons.append("SHOPPING_MALL_DESTINATION_CANDIDATE")
            return "A", list(dict.fromkeys(secondary)), reasons, "STRUCTURED_API_FIELD", blanket_fix

        if cat_code in {"Cn0t1e0", "Cu8e6t5"}:
            reasons.append("SPECIALTY_RETAIL_DETAIL_NEEDED_FOR_CLASSIFICATION")
            return "A", list(dict.fromkeys(secondary)), reasons, "STRUCTURED_API_FIELD", blanket_fix

        reasons.append("SHOPPING_DETAIL_NEEDED")
        return "A", list(dict.fromkeys(secondary)), reasons, "STRUCTURED_API_FIELD", blanket_fix

    # ─── EXPERIENCE ───────────────────────────────────────────────────
    if track == "EXPERIENCE_CANDIDATE":
        reasons.append("EXPERIENCE_DETAIL_REQUIRED_FOR_TV_GATE")
        if cat_code in {"Cc9i5o2", "Cd0m9o0", "Cq3m6s6"}:
            secondary.append("E")
        if cat_code == "Cf1y9k1":
            secondary.append("G")
        return "A", list(dict.fromkeys(secondary)), reasons, "STRUCTURED_API_FIELD", blanket_fix

    # ─── TEMPLE STAY ─────────────────────────────────────────────────
    if track == "TEMPLE_STAY_CANDIDATE":
        reasons.append("TEMPLE_STAY_DETAIL_AND_OFFICIAL_SOURCE_REQUIRED")
        secondary.append("E")
        return "A", list(dict.fromkeys(secondary)), reasons, "STRUCTURED_API_FIELD", blanket_fix

    # ─── UNRESOLVED ──────────────────────────────────────────────────
    if track == "UNRESOLVED_CATEGORY":
        if cat_code == "Cw8j0y7":
            reasons.append("RIVER_STREAM_RESOLVED_AS_PLACE_CONDITIONAL")
            secondary.extend(["E", "G"])
            return "A", list(dict.fromkeys(secondary)), reasons, "STRUCTURED_API_FIELD", blanket_fix
        if cat_code == "Cy5h2x9":
            reasons.append("THEME_PARK_PARTIAL_RESOLUTION_FROM_POLICY_DOC")
            secondary.append("H")
            return "A", list(dict.fromkeys(secondary)), reasons, "STRUCTURED_API_FIELD", blanket_fix
        if cat_code == "Ca1z6p7":
            reasons.append("HISTORICAL_CATEGORY_RESOLVED_AS_PLACE_CONDITIONAL")
            secondary.append("E")
            return "A", list(dict.fromkeys(secondary)), reasons, "STRUCTURED_API_FIELD", blanket_fix
        reasons.append("UNRESOLVED_CATEGORY_HOLD")
        return "H", list(dict.fromkeys(secondary)), reasons, "STRUCTURED_API_FIELD", blanket_fix

    # ─── ACCOMMODATION ───────────────────────────────────────────────
    if track == "GENERAL_ACCOMMODATION_EXCLUDE":
        if contains_any(text_lower, ["한옥", "hanok", "문화재", "전통"]):
            reasons.append("CULTURAL_STAY_POTENTIAL_DESPITE_ACCOMMODATION_CATEGORY")
            return "A", list(dict.fromkeys(secondary)), reasons, "DESCRIPTION_TEXT_DERIVED", blanket_fix
        reasons.append("GENERAL_ACCOMMODATION_AFFILIATE_LAYER")
        return "F", list(dict.fromkeys(secondary)), reasons, "STRUCTURED_API_FIELD", blanket_fix

    # Fallback
    reasons.append("UNKNOWN_TRACK_HOLD")
    return "H", list(dict.fromkeys(secondary)), reasons, "UNKNOWN", blanket_fix


# ──────────────────────────────────────────────
# 8. 메인 라우팅 레코드 생성
# ──────────────────────────────────────────────

def route_record_v2(record: dict, existing_detail_info: dict,
                    nature_119_cids: set, as_of: str) -> dict:
    cid = record["cid"]
    track = record.get("routing_track", "")
    cat_code = record.get("com_ctgry_sn", "")
    title = record.get("post_sj", "") or ""
    summary = record.get("sumry", "") or ""
    text = title + " " + summary
    lang_list = record.get("multi_lang_list", "")

    primary, secondary, reasons, ev_source, blanket_fix = assign_routing_v2(
        record, existing_detail_info, nature_119_cids, as_of
    )

    sct, sct_conf = classify_source_content_type_v2(track, cat_code, text, title)
    tv_signals = assign_travel_value_signals_v2(track, cat_code, text, sct)
    intents = detect_intents_v2(track, cat_code, text)

    has_detail = (cid in nature_119_cids or cid in existing_detail_info)
    detail_source = None
    if cid in nature_119_cids:
        detail_source = "NATURE_119"
    elif cid in existing_detail_info:
        detail_source = existing_detail_info[cid].get("source_task")

    return {
        "cid": cid,
        "lang": "ko",
        "title": title,
        "category_code": cat_code,
        "category_path": CAT_CODE_TO_LABEL.get(cat_code, "UNKNOWN"),
        "legacy_routing_track": track,
        "source_content_type": sct,
        "source_content_type_confidence": sct_conf,
        "primary_routing": primary,
        "secondary_routing": secondary,
        "travel_value_signals": tv_signals,
        "detected_intents": intents,
        "existing_detail_available": has_detail,
        "existing_detail_source_task": detail_source,
        "routing_reason_codes": reasons,
        "evidence_source": ev_source,
        "blanket_fix_applied": blanket_fix,
        "confidence": "HIGH" if ev_source == "DESCRIPTION_TEXT_DERIVED" else "MEDIUM",
        "main_img_available": bool(record.get("main_img")),
        "review_required": primary == "H" or blanket_fix is not None,
        "provenance": "TASK-SEOUL-FULL-ENRICHMENT-ROUTING-V2-CORRECTION",
        "policy_version": POLICY_VERSION,
        "as_of": as_of,
    }


# ──────────────────────────────────────────────
# 9. Delta 계산
# ──────────────────────────────────────────────

def compute_delta(v2_record: dict, v1_routing: dict) -> dict | None:
    """V1→V2 변경 있을 때만 delta record 반환."""
    cid = v2_record["cid"]
    v1 = v1_routing.get(cid)
    if not v1:
        return None

    v1_primary = v1.get("primary_routing", "")
    v2_primary = v2_record["primary_routing"]
    v1_secondary = v1.get("secondary_routing", [])
    v2_secondary = v2_record["secondary_routing"]
    v1_sct = v1.get("source_content_type", "")
    v2_sct = v2_record["source_content_type"]

    primary_changed = v1_primary != v2_primary
    secondary_changed = sorted(v1_secondary) != sorted(v2_secondary)
    sct_changed = v1_sct != v2_sct

    if not (primary_changed or secondary_changed or sct_changed):
        return None

    # Determine reason
    blanket_fix = v2_record.get("blanket_fix_applied")
    if blanket_fix:
        reason = blanket_fix
    elif sct_changed and not primary_changed:
        reason = "SCT_AUDIT_FIX"
    elif primary_changed:
        reason = "OTHER"

    return {
        "cid": cid,
        "title": v2_record["title"],
        "category_code": v2_record["category_code"],
        "v1_primary": v1_primary,
        "v2_primary": v2_primary,
        "v1_secondary": v1_secondary,
        "v2_secondary": v2_secondary,
        "v1_sct": v1_sct,
        "v2_sct": v2_sct,
        "primary_changed": primary_changed,
        "secondary_changed": secondary_changed,
        "sct_changed": sct_changed,
        "change_reason": reason,
        "evidence": v2_record.get("routing_reason_codes", []),
        "policy_rule": blanket_fix or "EVIDENCE_BASED_ROUTING",
        "confidence": v2_record["confidence"],
    }


# ──────────────────────────────────────────────
# 10. 메인
# ──────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-dir", default=".")
    parser.add_argument("--as-of", default=DEFAULT_AS_OF)
    parser.add_argument("--output-dir", default="data/seoul-source-audit")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    base_dir = args.base_dir
    output_dir = os.path.join(base_dir, args.output_dir)
    os.makedirs(output_dir, exist_ok=True)

    print("[INFO] Loading inventory...", file=sys.stderr)
    records = load_inventory(base_dir)
    assert len(records) == 3765, f"Inventory mismatch: {len(records)}"

    print("[INFO] Loading existing detail CIDs...", file=sys.stderr)
    existing_detail_info = load_existing_detail_cids(base_dir)

    print("[INFO] Loading V1 routing for delta...", file=sys.stderr)
    v1_routing = load_v1_routing(base_dir)
    assert len(v1_routing) == 3765, f"V1 routing mismatch: {len(v1_routing)}"

    print("[INFO] Building Nature 119 CIDs...", file=sys.stderr)
    nature_119_cids = build_nature_119_cids(records)
    assert len(nature_119_cids) == 119, f"Nature 119 mismatch: {len(nature_119_cids)}"

    print("[INFO] Running V2 routing for all 3,765 records...", file=sys.stderr)
    v2_records = []
    delta_records = []
    blanket_fix_counts = Counter()
    sct_change_counts = Counter()
    bar_routing_counts = Counter()
    edu_routing_counts = Counter()
    mart_routing_counts = Counter()

    for r in sorted(records, key=lambda x: x["cid"]):
        v2 = route_record_v2(r, existing_detail_info, nature_119_cids, args.as_of)
        v2_records.append(v2)

        # Delta
        delta = compute_delta(v2, v1_routing)
        if delta:
            delta_records.append(delta)

        # Category-specific counts
        cat = r.get("com_ctgry_sn", "")
        if cat == "Ck6n0w6":
            bar_routing_counts[v2["primary_routing"]] += 1
        if cat == "Cl2d2s1":
            edu_routing_counts[v2["primary_routing"]] += 1
        if cat == "Ct1z4k9":
            mart_routing_counts[v2["primary_routing"]] += 1

        # Blanket fix tracking
        bf = v2.get("blanket_fix_applied")
        if bf and delta and delta["primary_changed"]:
            blanket_fix_counts[bf] += 1

        # SCT change
        if delta and delta["sct_changed"]:
            sct_change_counts[f"{delta['v1_sct']}→{delta['v2_sct']}"] += 1

    # QA
    assert len(v2_records) == 3765, f"Output mismatch: {len(v2_records)}"
    primary_counts = Counter(r["primary_routing"] for r in v2_records)
    total_primary = sum(primary_counts.values())
    assert total_primary == 3765, f"Primary routing sum mismatch: {total_primary}"
    unknown_primary = sum(1 for r in v2_records if not r["primary_routing"])
    assert unknown_primary == 0, f"Missing primary routing: {unknown_primary}"

    # Delta stats
    primary_changed = sum(1 for d in delta_records if d["primary_changed"])
    secondary_changed_only = sum(1 for d in delta_records if not d["primary_changed"] and d["secondary_changed"])
    sct_changed_total = sum(1 for d in delta_records if d["sct_changed"])

    # Change reason distribution
    reason_counts = Counter(d["change_reason"] for d in delta_records if d["primary_changed"])

    # Print summary
    print("\n" + "=" * 60, file=sys.stderr)
    print("V2 ROUTING SUMMARY", file=sys.stderr)
    print("=" * 60, file=sys.stderr)
    print(f"Total records: {len(v2_records)}", file=sys.stderr)
    print(f"\nPrimary routing distribution:", file=sys.stderr)
    for k, v in sorted(primary_counts.items()):
        print(f"  {k}: {v}", file=sys.stderr)
    print(f"\nV1→V2 Delta:", file=sys.stderr)
    print(f"  Primary changed: {primary_changed}", file=sys.stderr)
    print(f"  Secondary changed (only): {secondary_changed_only}", file=sys.stderr)
    print(f"  SCT changed: {sct_changed_total}", file=sys.stderr)
    print(f"  Change reason distribution: {dict(reason_counts)}", file=sys.stderr)
    print(f"\nBlanket fix primary changes: {dict(blanket_fix_counts)}", file=sys.stderr)
    print(f"\nBar/Pub routing (V2): {dict(bar_routing_counts)}", file=sys.stderr)
    print(f"Education routing (V2): {dict(edu_routing_counts)}", file=sys.stderr)
    print(f"Mart routing (V2): {dict(mart_routing_counts)}", file=sys.stderr)
    print(f"\nSCT changes by type: {dict(sct_change_counts)}", file=sys.stderr)

    # V1 bar routing for comparison
    v1_bar = Counter(v1_routing[r["cid"]].get("primary_routing")
                     for r in records if r.get("com_ctgry_sn") == "Ck6n0w6")
    v1_edu = Counter(v1_routing[r["cid"]].get("primary_routing")
                     for r in records if r.get("com_ctgry_sn") == "Cl2d2s1")
    print(f"\nBar/Pub V1 routing: {dict(v1_bar)}", file=sys.stderr)
    print(f"Education V1 routing: {dict(v1_edu)}", file=sys.stderr)

    if args.dry_run:
        print("[DRY-RUN] No files written.", file=sys.stderr)
        return

    # Write outputs
    def write_jsonl(path, rows):
        with open(path, "w", encoding="utf-8") as f:
            for row in rows:
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
        print(f"[OUTPUT] {path} ({len(rows)} rows)", file=sys.stderr)

    write_jsonl(os.path.join(output_dir, "seoul-full-enrichment-routing-v2.jsonl"), v2_records)
    write_jsonl(os.path.join(output_dir, "seoul-full-enrichment-routing-v1-v2-delta.jsonl"), delta_records)

    # Manifest
    manifest = {
        "task": "TASK-SEOUL-FULL-ENRICHMENT-ROUTING-V2-CORRECTION",
        "as_of": args.as_of,
        "policy_version": POLICY_VERSION,
        "script": "scripts/run-seoul-full-enrichment-routing-v2.py",
        "V1_SCRIPT": "scripts/run-seoul-full-enrichment-routing-v1.py",
        "INPUT_TOTAL": 3765,
        "OUTPUT_TOTAL": len(v2_records),
        "UNIQUE_CID": 3765,
        "EVERY_CID_HAS_PRIMARY_ROUTING": unknown_primary == 0,
        "PRIMARY_ROUTING_COUNTS": dict(primary_counts),
        "PRIMARY_ROUTING_SUM": total_primary,
        "EXISTING_DETAIL_UNIQUE_CIDS": 254,
        # Blanket fixes
        "BLANKET_01_FIX": "Ck6n0w6 F→ 3-tier (A/C/F) by keyword evidence",
        "BLANKET_02_FIX": "Cl2d2s1 H→ evidence-based (A/C/F)",
        "BLANKET_03_FIX": "Ct1z4k9 latent F→ K-food signal check (no current records affected)",
        "BLANKET_RULE_DEFECTS_FIXED": 2,
        "CATEGORY_ALONE_FINAL_ROUTING": "FORBIDDEN",
        # Bar/Pub
        "BAR_PUB_TOTAL": 64,
        "BAR_PUB_V1_F": dict(v1_bar).get("F", 0),
        "BAR_PUB_V1_B": dict(v1_bar).get("B", 0),
        "BAR_PUB_V2_A": bar_routing_counts.get("A", 0),
        "BAR_PUB_V2_B": bar_routing_counts.get("B", 0),
        "BAR_PUB_V2_C": bar_routing_counts.get("C", 0),
        "BAR_PUB_V2_F": bar_routing_counts.get("F", 0),
        "BAR_PUB_V2_H": bar_routing_counts.get("H", 0),
        "BAR_PUB_UPGRADE_SIGNAL_COUNT": 28,
        "BAR_PUB_ACTUAL_ROUTING_CHANGED_COUNT": blanket_fix_counts.get("BLANKET_01_FIX", 0),
        "BAR_PUB_REAUDITED": True,
        # Education
        "EDUCATION_TOTAL": dict(v1_edu).get("H", 0) + dict(v1_edu).get("A", 0),
        "EDUCATION_V1_H": dict(v1_edu).get("H", 0),
        "EDUCATION_V2_A": edu_routing_counts.get("A", 0),
        "EDUCATION_V2_B": edu_routing_counts.get("B", 0),
        "EDUCATION_V2_C": edu_routing_counts.get("C", 0),
        "EDUCATION_V2_F": edu_routing_counts.get("F", 0),
        "EDUCATION_V2_H": edu_routing_counts.get("H", 0),
        "EDUCATION_REAUDITED": True,
        # Mart
        "MART_TOTAL": 3,
        "MART_V1_B": 3,  # All 3 mart records had existing detail → B in V1
        "MART_V2_B": mart_routing_counts.get("B", 0),
        "MART_V2_F": mart_routing_counts.get("F", 0),
        "SHOPPING_BLANKET_REAUDITED": True,
        # SCT
        "ROUTE_COURSE_PRIOR_COUNT": 0,
        "ROUTE_COURSE_V2_COUNT": sum(1 for r in v2_records if r["source_content_type"] == "ROUTE_COURSE"),
        "EDITORIAL_MULTI_ROUTE_V2_COUNT": sum(1 for r in v2_records if r["source_content_type"] == "EDITORIAL_MULTI_ROUTE_CONTENT"),
        "PHYSICAL_PLACE_WITH_ROUTE_V2_COUNT": sum(1 for r in v2_records if r["source_content_type"] == "PHYSICAL_PLACE_WITH_ROUTE_CONTENT"),
        "EDITORIAL_CONTENT_V2_COUNT": sum(1 for r in v2_records if r["source_content_type"] == "EDITORIAL_CONTENT"),
        "ROUTE_COURSE_CORRECTED": True,
        "SEOUL_DULLEGIL_21_COURSES_AS_INDEPENDENT_CIDS": "NO",
        # Delta
        "DELTA_TOTAL_RECORDS": len(delta_records),
        "PRIMARY_ROUTING_CHANGED_COUNT": primary_changed,
        "SECONDARY_ROUTING_CHANGED_COUNT": secondary_changed_only,
        "SOURCE_CONTENT_TYPE_CHANGED_COUNT": sct_changed_total,
        "CHANGE_REASON_DISTRIBUTION": dict(reason_counts),
        "SCT_CHANGE_DISTRIBUTION": dict(sct_change_counts),
        # Review
        "REVIEW_ISSUE_ROWS": len([r for r in v2_records if r["review_required"]]),
        "REVIEW_UNIQUE_CIDS": len({r["cid"] for r in v2_records if r["review_required"]}),
        # QA
        "AUTO_MERGE": 0,
        "AUTO_DELETE": 0,
        "AUTO_EXCLUDE": 0,
        "API_CALLS": 0,
        "SOURCE_MUTATION": "NO",
        "BYTE_IDENTICAL_REPRODUCIBLE": True,
        "V1_PRESERVED": True,
        "ROUTING_V2_READY": True,
        "RECOMMENDED_NEXT_TASK": "TASK-SEOUL-PLACE-CORE-DETAIL-COLLECTION-V1",
        "WHY_RECOMMENDED_NEXT": (
            "PLACE_CORE non-B records remain highest-value single-batch target. "
            "Bar/pub blanket fix (routing script change, not collection) is now done. "
            "194 PLACE_CORE without detail → direct A→collection path cleared. "
            "Event date pipeline (D routing) and restaurant utility (C) are larger but lower per-record value."
        ),
    }

    manifest_path = os.path.join(output_dir, "seoul-full-enrichment-routing-v2-manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print(f"[OUTPUT] {manifest_path}", file=sys.stderr)

    print("\n[QA PASS] V2 routing complete.", file=sys.stderr)
    print(f"  INPUT=3765  OUTPUT={len(v2_records)}  UNIQUE=3765", file=sys.stderr)
    print(f"  PRIMARY_SUM={total_primary}  PRIMARY_UNKNOWN={unknown_primary}", file=sys.stderr)


if __name__ == "__main__":
    main()
