#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TASK-SEOUL-FULL-INVENTORY-ENRICHMENT-ROUTING-V1
서울 VisitSeoul 전체 3,765건 enrichment routing 스크립트

정책 버전: v1.0.0
AS_OF: 2026-08-10
재현성: --as-of 옵션으로 날짜 고정 가능. 동일 입력 → byte-identical 출력.

금지:
- VisitSeoul/KTO/외부 API 호출 없음
- DB/SQL/migration 없음
- src/ 수정 없음
- secret 출력 없음
"""

import argparse
import hashlib
import json
import os
import sys
from datetime import date
from typing import Optional

# ──────────────────────────────────────────────
# 1. 상수 / 정책
# ──────────────────────────────────────────────

POLICY_VERSION = "v1.0.0"
DEFAULT_AS_OF = "2026-08-10"

# 카테고리 코드 → 영문 레이블 매핑 (실측 기반)
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

# Nature 119 CID 식별에 사용할 카테고리 코드 (실측 119건)
NATURE_119_CODES = {"Ce9z7g9", "Cu5u8d4", "Cp3b3j9"}
NATURE_119_TRACK = "PLACE_CORE_CANDIDATE"

# Experience content type 카테고리 코드
EXPERIENCE_CONTENT_CODES = {
    "Cc9i5o2",  # 체험관광
    "Cd0m9o0",  # 체험관광>전통체험
    "Cq3m6s6",  # 체험관광>공예체험
    "Cq9d5v0",  # 체험관광>산사체험
    "Cl8f8q1",  # 체험관광>기타체험
    "Cr6o1h2",  # 체험관광>산업관광
}

# K-pop 감지 키워드
KPOP_KEYWORDS = [
    "k-pop", "kpop", "케이팝", "아이돌", "idol",
    "bts", "방탄", "blackpink", "블랙핑크", "exo", "엑소",
    "sm ", "hybe", "yg ", "jyp", "빅히트", "big hit",
    "ncity", "weverse", "sm town", "smtown", "팬덤", "fandom",
    "아티스트", "레이블", "엔터테인먼트", "k-culture",
]
# K-beauty 감지 키워드
KBEAUTY_KEYWORDS = [
    "k-beauty", "kbeauty", "케이뷰티", "화장품", "코스메틱",
    "올리브영", "미샤", "이니스프리", "etude", "laneige",
    "뷰티", "스킨케어", "스킨 케어",
]
# 할랄 감지 키워드
HALAL_KEYWORDS = ["할랄", "halal", "무슬림", "muslim", "이슬람", "islam"]
# 채식 감지 키워드
VEGAN_KEYWORDS = [
    "채식", "비건", "vegan", "vegetarian", "베지테리안", "베지터리언",
    "식물성", "meat-free",
]
# 혼밥 / 솔로 다이닝 키워드
SOLO_KEYWORDS = ["혼밥", "1인", "혼자", "솔로", "싱글", "1인용", "혼술"]
# 야경 키워드
NIGHTVIEW_KEYWORDS = ["야경", "야간", "night view", "야夜", "밤풍경", "노을"]
# 한강 키워드
HANGANG_KEYWORDS = ["한강", "hangang", "han river", "반포", "여의도"]
# 청계천 키워드
CHEONGGYE_KEYWORDS = ["청계천", "cheonggyecheon"]
# 산책 / 걷기 키워드
WALKING_KEYWORDS = ["산책", "걷기", "둘레길", "올레", "walk", "둘레"]
# 자전거 키워드
CYCLING_KEYWORDS = ["자전거", "자전거도로", "cycling", "bike"]
# 트레킹/등산 키워드
TREKKING_KEYWORDS = ["트레킹", "등산", "hiking", "trekking", "산행", "등산로"]
# 템플스테이 키워드
TEMPLE_KEYWORDS = ["템플스테이", "temple stay", "산사체험", "사찰"]
# 가족 / 어린이 키워드
FAMILY_KEYWORDS = ["어린이", "가족", "키즈", "kids", "family", "아이", "영아", "유아"]
# 조식 / 아침 키워드
BREAKFAST_KEYWORDS = ["조식", "아침", "breakfast", "브런치", "brunch"]
# 심야 키워드
LATENIGHT_KEYWORDS = ["24시간", "심야", "새벽", "밤새", "야간운영"]
# 웰니스 키워드
WELLNESS_KEYWORDS = ["스파", "spa", "사우나", "온천", "명상", "meditation", "웰니스", "wellness"]
# 팝업 키워드
POPUP_KEYWORDS = ["팝업", "pop-up", "popup"]
# 공연 키워드
PERF_KEYWORDS = ["공연", "뮤지컬", "콘서트", "연극", "오페라", "performance"]
# 전시 키워드
EXHIB_KEYWORDS = ["전시", "exhibition", "gallery", "갤러리"]
# 시장 키워드
MARKET_KEYWORDS = ["시장", "market", "골목시장", "전통시장"]
# 한식 키워드
HANSIK_KEYWORDS = ["한식", "비빔밥", "삼겹살", "갈비", "불고기", "냉면", "순두부", "된장", "김치", "해장국", "삼계탕", "곰탕"]
# 야경 전망대 키워드
VIEWPOINT_KEYWORDS = ["전망대", "전망", "view", "뷰", "타워"]


def contains_any(text: str, keywords: list[str]) -> bool:
    """Case-insensitive keyword check."""
    t = text.lower()
    return any(kw in t for kw in keywords)


# ──────────────────────────────────────────────
# 2. 기존 detail 로드
# ──────────────────────────────────────────────

def load_existing_detail_cids(base_dir: str) -> dict:
    """
    기존 detail 확보 CID 목록 반환.
    {cid: {source_task, batch}}
    """
    cid_info = {}

    # (A) Integrated 120 detail samples
    integrated_path = os.path.join(base_dir, "data/seoul-source-audit",
                                   "seoul-integrated-travel-value-detail-samples-v1.jsonl")
    if os.path.exists(integrated_path):
        with open(integrated_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                r = json.loads(line)
                cid = r.get("cid")
                if cid and cid not in cid_info:
                    cid_info[cid] = {
                        "source_task": "TASK-SEOUL-TRAVEL-VALUE-INTEGRATION-AND-ENTITY-MODEL-V1",
                        "batch": r.get("batch", "unknown"),
                    }

    # (B) Dryrun 16 (이미지 검증용)
    dryrun_path = os.path.join(base_dir, "data/seoul-source-audit",
                               "seoul-visitseoul-detail-dryrun-v1.jsonl")
    if os.path.exists(dryrun_path):
        with open(dryrun_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                r = json.loads(line)
                cid = r.get("cid")
                if cid and cid not in cid_info:
                    cid_info[cid] = {
                        "source_task": "TASK-SEOUL-VISITSEOUL-DETAIL-DRYRUN-V1",
                        "batch": "dryrun",
                    }

    return cid_info


def build_nature_119_cids(records: list) -> set:
    """
    Nature 119 CID는 카테고리 코드 {Ce9z7g9, Cu5u8d4, Cp3b3j9} 이면서
    routing_track=PLACE_CORE_CANDIDATE인 record.
    """
    return {
        r["cid"]
        for r in records
        if r.get("com_ctgry_sn") in NATURE_119_CODES
        and r.get("routing_track") == NATURE_119_TRACK
    }


# ──────────────────────────────────────────────
# 3. SOURCE_CONTENT_TYPE 분류
# ──────────────────────────────────────────────

def classify_source_content_type(track: str, cat_code: str, text: str) -> tuple[str, str]:
    """
    (source_content_type, confidence) 반환.
    7종: PHYSICAL_PLACE, EXPERIENCE_CONTENT, ROUTE_COURSE, EVENT,
          EDITORIAL_CONTENT, UTILITY_SERVICE, UNKNOWN
    """
    # Event track (단, 행사시설은 실제 장소)
    if track == "EVENT_TRACK":
        if cat_code == "Cp7e6o3":  # 행사시설
            return "PHYSICAL_PLACE", "HIGH"
        return "EVENT", "HIGH"

    # Restaurant / Cafe → 물리 장소
    if track == "RESTAURANT_TRACK":
        return "PHYSICAL_PLACE", "HIGH"

    # 숙박
    if track == "GENERAL_ACCOMMODATION_EXCLUDE":
        return "PHYSICAL_PLACE", "HIGH"

    # Shopping
    if track == "SHOPPING_REVIEW":
        return "PHYSICAL_PLACE", "HIGH"

    # Nature PLACE_CORE (자연경관, 공원)
    if track == "PLACE_CORE_CANDIDATE":
        if cat_code in NATURE_119_CODES:
            return "PHYSICAL_PLACE", "HIGH"
        # 역사유적지 → 물리 장소
        if cat_code in {"Cb9c5i3", "Cb9o5c4", "Ch5t7s7", "Ci7i9i6", "Co2n1h7",
                        "Cr6m1i5", "Cl1k5b1"}:
            return "PHYSICAL_PLACE", "HIGH"
        # 박물관 → 물리 장소
        if cat_code == "Cr0q2v2":
            return "PHYSICAL_PLACE", "HIGH"
        # 랜드마크
        if cat_code == "Cl5y4k0":
            return "PHYSICAL_PLACE", "HIGH"
        # 시장
        if cat_code == "Cn7z1h7":
            return "PHYSICAL_PLACE", "HIGH"
        return "PHYSICAL_PLACE", "MEDIUM"

    # PLACE CONDITIONAL
    if track == "PLACE_CONDITIONAL_REVIEW":
        if cat_code in {"Cg1x6l1", "Ct9t6m8", "Cy6j7j7"}:  # 전시시설 계열
            return "PHYSICAL_PLACE", "HIGH"
        if cat_code == "Cr1f0k2":  # 공연시설
            return "PHYSICAL_PLACE", "HIGH"
        if cat_code == "Cw1i3e4":  # 종교성지
            return "PHYSICAL_PLACE", "HIGH"
        if cat_code == "Co0g3x0":  # 레저스포츠시설
            return "PHYSICAL_PLACE", "HIGH"
        if cat_code == "Co6c2n2":  # 자연관광
            return "PHYSICAL_PLACE", "MEDIUM"
        return "PHYSICAL_PLACE", "MEDIUM"

    # Experience candidate
    if track == "EXPERIENCE_CANDIDATE":
        if cat_code == "Cq9d5v0":  # 산사체험
            return "EXPERIENCE_CONTENT", "HIGH"
        if cat_code in {"Cc9i5o2", "Cd0m9o0", "Cq3m6s6"}:  # 전통체험, 공예체험
            return "EXPERIENCE_CONTENT", "HIGH"
        if cat_code in {"Cl8f8q1", "Cr6o1h2"}:  # 기타체험, 산업관광
            return "EXPERIENCE_CONTENT", "MEDIUM"
        if cat_code == "Cf1y9k1":  # 웰니스관광 → 시설 위주
            return "PHYSICAL_PLACE", "MEDIUM"
        return "EXPERIENCE_CONTENT", "MEDIUM"

    # Temple stay
    if track == "TEMPLE_STAY_CANDIDATE":
        return "EXPERIENCE_CONTENT", "HIGH"

    # Unresolved
    if track == "UNRESOLVED_CATEGORY":
        if cat_code == "Cw8j0y7":  # 자연경관(하천)
            return "PHYSICAL_PLACE", "MEDIUM"
        if cat_code == "Cy5h2x9":  # 테마공원
            return "PHYSICAL_PLACE", "MEDIUM"
        if cat_code == "Ca1z6p7":  # 역사관광
            return "PHYSICAL_PLACE", "MEDIUM"
        return "UNKNOWN", "LOW"

    return "UNKNOWN", "LOW"


# ──────────────────────────────────────────────
# 4. Travel Value Signal 할당
# ──────────────────────────────────────────────

def assign_travel_value_signals(track: str, cat_code: str, text: str, sct: str) -> list[str]:
    """
    복수 signal 허용.
    [HIGH_TRAVEL_VALUE, UTILITY_VALUE, INTENT_SPECIFIC_VALUE,
     GENERAL_TRAVEL_VALUE, EXTERNAL_SEARCH_VALUE, LOW_TRAVEL_VALUE,
     INSUFFICIENT_EVIDENCE, USER_REVIEW_REQUIRED]
    """
    signals = []

    if track == "PLACE_CORE_CANDIDATE":
        if cat_code in NATURE_119_CODES:
            signals.append("HIGH_TRAVEL_VALUE")
        elif cat_code in {"Ch5t7s7", "Co2n1h7", "Cb9o5c4", "Cb9c5i3"}:  # 고궁, 성문, 사적지
            signals.append("HIGH_TRAVEL_VALUE")
        elif cat_code in {"Cl5y4k0", "Cr0q2v2", "Cn7z1h7"}:  # 랜드마크, 박물관, 시장
            signals.append("HIGH_TRAVEL_VALUE")
        else:
            signals.append("HIGH_TRAVEL_VALUE")

    elif track == "EXPERIENCE_CANDIDATE":
        if cat_code in {"Cc9i5o2", "Cd0m9o0", "Cq3m6s6"}:  # 전통/공예 체험
            signals.extend(["HIGH_TRAVEL_VALUE", "INTENT_SPECIFIC_VALUE"])
        elif cat_code == "Cq9d5v0":  # 산사체험
            signals.extend(["HIGH_TRAVEL_VALUE", "INTENT_SPECIFIC_VALUE"])
        elif cat_code == "Cf1y9k1":  # 웰니스
            signals.extend(["INTENT_SPECIFIC_VALUE", "UTILITY_VALUE"])
        else:
            signals.append("GENERAL_TRAVEL_VALUE")

    elif track == "TEMPLE_STAY_CANDIDATE":
        signals.extend(["HIGH_TRAVEL_VALUE", "INTENT_SPECIFIC_VALUE"])

    elif track == "EVENT_TRACK":
        if cat_code == "Cp7e6o3":  # 행사시설 (venue)
            signals.append("GENERAL_TRAVEL_VALUE")
        else:
            signals.append("INTENT_SPECIFIC_VALUE")  # 이벤트: date 확인 전까지 intent-specific

    elif track == "RESTAURANT_TRACK":
        if cat_code == "Ck6n0w6":  # 주점
            signals.extend(["EXTERNAL_SEARCH_VALUE", "LOW_TRAVEL_VALUE"])
        elif cat_code == "Cz9d1h6":  # 한식
            signals.extend(["UTILITY_VALUE", "INTENT_SPECIFIC_VALUE"])
        elif cat_code == "Cx0t8m5":  # 카페
            signals.append("UTILITY_VALUE")
        else:
            signals.append("UTILITY_VALUE")
        # 할랄/비건/솔로 추가 intent
        if contains_any(text, HALAL_KEYWORDS + VEGAN_KEYWORDS + SOLO_KEYWORDS):
            if "INTENT_SPECIFIC_VALUE" not in signals:
                signals.append("INTENT_SPECIFIC_VALUE")

    elif track == "SHOPPING_REVIEW":
        if cat_code in {"Cp5i3g2", "Cs3j7y4"}:  # 면세점, 백화점
            signals.append("HIGH_TRAVEL_VALUE")
        elif cat_code == "Ct1z4k9":  # 대형마트
            signals.extend(["EXTERNAL_SEARCH_VALUE", "LOW_TRAVEL_VALUE"])
        elif cat_code == "Cn7z1h7":  # (실제는 PLACE_CORE이지만 혹시)
            signals.append("HIGH_TRAVEL_VALUE")
        else:
            if contains_any(text, KPOP_KEYWORDS + KBEAUTY_KEYWORDS):
                signals.extend(["INTENT_SPECIFIC_VALUE", "GENERAL_TRAVEL_VALUE"])
            else:
                signals.append("GENERAL_TRAVEL_VALUE")

    elif track == "PLACE_CONDITIONAL_REVIEW":
        if cat_code in {"Cg1x6l1", "Ct9t6m8", "Cy6j7j7", "Cr0q2v2"}:
            signals.append("GENERAL_TRAVEL_VALUE")
        elif cat_code == "Cl2d2s1":  # 교육시설
            signals.append("LOW_TRAVEL_VALUE")
        else:
            signals.append("GENERAL_TRAVEL_VALUE")

    elif track == "GENERAL_ACCOMMODATION_EXCLUDE":
        signals.extend(["EXTERNAL_SEARCH_VALUE", "LOW_TRAVEL_VALUE"])

    elif track == "UNRESOLVED_CATEGORY":
        signals.append("INSUFFICIENT_EVIDENCE")

    # Keyword-based overlays
    if contains_any(text, KPOP_KEYWORDS) and "INTENT_SPECIFIC_VALUE" not in signals:
        signals.append("INTENT_SPECIFIC_VALUE")
    if contains_any(text, NIGHTVIEW_KEYWORDS) and "INTENT_SPECIFIC_VALUE" not in signals:
        signals.append("INTENT_SPECIFIC_VALUE")

    if not signals:
        signals.append("INSUFFICIENT_EVIDENCE")

    return list(dict.fromkeys(signals))  # dedupe, preserve order


# ──────────────────────────────────────────────
# 5. Intent 감지
# ──────────────────────────────────────────────

def detect_intents(track: str, cat_code: str, text: str) -> list[str]:
    """
    근거 있는 intent만 부여. 45개 taxonomy 기반.
    """
    intents = []

    # Category-based 기본 intents
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
        if cat_code in {"Cr0q2v2", "Ct9t6m8", "Cy6j7j7", "Cg1x6l1"}:  # 박물관/미술관/전시
            intents.append("exhibition")
        if cat_code == "Cr1f0k2":  # 공연시설
            intents.append("performance")
        if cat_code in NATURE_119_CODES:
            if cat_code == "Cu5u8d4":  # 산
                intents.extend(["nature_trekking", "trekking"])
            if cat_code == "Cp3b3j9":  # 자연공원
                intents.extend(["nature_trekking"])
            if cat_code == "Ce9z7g9":  # 도시공원
                intents.extend(["walking_urban", "hangang_experience"])

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

    # Keyword-based overlays (전체 track 공통)
    if contains_any(text, KPOP_KEYWORDS):
        intents.append("kpop")
    if contains_any(text, KBEAUTY_KEYWORDS):
        intents.append("kbeauty")
    if contains_any(text, HALAL_KEYWORDS):
        intents.append("halal")
    if contains_any(text, VEGAN_KEYWORDS):
        intents.append("vegetarian")
    if contains_any(text, SOLO_KEYWORDS):
        intents.append("solo_travel")
    if contains_any(text, HANGANG_KEYWORDS):
        intents.append("hangang_experience")
    if contains_any(text, CHEONGGYE_KEYWORDS):
        intents.append("walking_urban")
    if contains_any(text, WALKING_KEYWORDS):
        intents.append("walking_urban")
    if contains_any(text, CYCLING_KEYWORDS):
        intents.append("cycling")
    if contains_any(text, TREKKING_KEYWORDS):
        intents.append("trekking")
    if contains_any(text, NIGHTVIEW_KEYWORDS):
        intents.append("night_view")
    if contains_any(text, FAMILY_KEYWORDS):
        intents.append("family_kids")
    if contains_any(text, BREAKFAST_KEYWORDS):
        intents.append("breakfast")
    if contains_any(text, LATENIGHT_KEYWORDS):
        intents.append("late_night")
    if contains_any(text, WELLNESS_KEYWORDS):
        intents.append("wellness")
    if contains_any(text, POPUP_KEYWORDS):
        intents.append("popup")
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

    # hallyu keyword
    if contains_any(text, ["한류", "hallyu", "k-drama", "드라마촬영", "드라마 촬영"]):
        intents.append("hallyu")

    return list(dict.fromkeys(intents))  # dedupe


# ──────────────────────────────────────────────
# 6. Primary / Secondary Routing 할당
# ──────────────────────────────────────────────

def assign_routing(
    record: dict,
    existing_detail_info: dict,
    nature_119_cids: set,
    as_of: str,
) -> tuple[str, list[str], list[str], str]:
    """
    (primary_routing, secondary_routing, routing_reason_codes, evidence_source)
    """
    cid = record["cid"]
    track = record.get("routing_track", "")
    cat_code = record.get("com_ctgry_sn", "")
    title = record.get("post_sj", "") or ""
    summary = record.get("sumry", "") or ""
    text = (title + " " + summary)

    reasons = []
    secondary = []

    # ─── 우선: 기존 detail 보유 여부 확인 ─────────────────────────────
    # Nature 119는 category code 기반으로 B 판정
    is_nature_119 = cid in nature_119_cids
    has_integrated_detail = cid in existing_detail_info

    if is_nature_119:
        reasons.append("NATURE_119_DETAIL_EVIDENCE_CONFIRMED")
        # 자연공원/산은 B (충분한 detail 보유)
        # 도시공원 중 한강공원은 E 병행
        if cat_code == "Ce9z7g9":  # 도시공원
            secondary.append("E")
            secondary.append("G")
        if contains_any(text, ["등산로", "코스", "trekking", "trail"]):
            secondary.append("E")  # 전문 source 보강 필요
        return "B", list(dict.fromkeys(secondary)), reasons, "NATURE_119_CATEGORY_CODE_MATCH"

    if has_integrated_detail:
        batch = existing_detail_info[cid].get("batch", "unknown")
        reasons.append(f"EXISTING_INTEGRATED_DETAIL:{batch}")
        if track == "RESTAURANT_TRACK":
            secondary.append("C")  # utility enrichment still possible
        elif track == "EVENT_TRACK":
            secondary.append("D")  # date confirmation still needed
        return "B", list(dict.fromkeys(secondary)), reasons, "INTEGRATED_DETAIL_SAMPLE"

    # ─── EVENT TRACK (1,190건) ────────────────────────────────────────
    if track == "EVENT_TRACK":
        if cat_code == "Cp7e6o3":  # 행사시설 = 실제 장소
            reasons.append("CATEGORY_IS_EVENT_VENUE_NOT_EVENT")
            secondary.append("E")
            return "A", list(dict.fromkeys(secondary)), reasons, "STRUCTURED_API_FIELD"

        reasons.append("EVENT_DATE_AND_STATUS_UNKNOWN")
        secondary.append("E")  # 대형 이벤트는 official source도 필요
        if contains_any(text, KPOP_KEYWORDS):
            if "E" not in secondary:
                secondary.append("E")
        return "D", list(dict.fromkeys(secondary)), reasons, "STRUCTURED_API_FIELD"

    # ─── RESTAURANT TRACK (1,259건) ──────────────────────────────────
    if track == "RESTAURANT_TRACK":
        # 주점: F (외부 검색)
        if cat_code == "Ck6n0w6":
            reasons.append("BAR_PUB_LOW_CURATED_VALUE")
            secondary.append("G")
            return "F", list(dict.fromkeys(secondary)), reasons, "STRUCTURED_API_FIELD"

        # 할랄/비건 키워드 → E (공식 인증 source)
        if contains_any(text, HALAL_KEYWORDS):
            reasons.append("HALAL_KEYWORD_DETECTED")
            secondary.append("E")
        if contains_any(text, VEGAN_KEYWORDS):
            reasons.append("VEGAN_KEYWORD_DETECTED")

        # 유명 맛집/목적지형 키워드 → A로 격상
        dest_keywords = ["유명", "대표", "명물", "맛집", "본점", "발상지", "원조"]
        if contains_any(text, dest_keywords):
            reasons.append("DESTINATION_RESTAURANT_SIGNAL")
            secondary.append("C")
            return "A", list(dict.fromkeys(secondary)), reasons, "DESCRIPTION_TEXT_DERIVED"

        # 카페 → C (utility 정보 필요하나 낮은 curated 우선순위)
        if cat_code == "Cx0t8m5":
            reasons.append("CAFE_UTILITY_ENRICHMENT")
            secondary.append("G")  # small cafes: user-enrichment suitable
            return "C", list(dict.fromkeys(secondary)), reasons, "STRUCTURED_API_FIELD"

        # Default 음식: C
        reasons.append("RESTAURANT_UTILITY_ENRICHMENT_REQUIRED")
        return "C", list(dict.fromkeys(secondary)), reasons, "STRUCTURED_API_FIELD"

    # ─── PLACE CORE (316건) ──────────────────────────────────────────
    if track == "PLACE_CORE_CANDIDATE":
        reasons.append("PLACE_CORE_TV_GATE_ASSESSMENT_NEEDED")
        # 박물관/미술관: official source도 유용
        if cat_code == "Cr0q2v2":
            secondary.append("E")
        # 역사유적지 → KTO source
        if cat_code in {"Ch5t7s7", "Cb9o5c4", "Co2n1h7", "Cb9c5i3"}:
            secondary.append("E")
        # 시장
        if cat_code == "Cn7z1h7":
            secondary.append("G")
        return "A", list(dict.fromkeys(secondary)), reasons, "STRUCTURED_API_FIELD"

    # ─── PLACE CONDITIONAL (577건) ───────────────────────────────────
    if track == "PLACE_CONDITIONAL_REVIEW":
        # 교육시설: 학교/대학 ambiguity
        if cat_code == "Cl2d2s1":
            reasons.append("EDUCATIONAL_FACILITY_AMBIGUOUS_ENTITY")
            return "H", list(dict.fromkeys(secondary)), reasons, "STRUCTURED_API_FIELD"

        # 자연관광: official source 보강
        if cat_code == "Co6c2n2":
            reasons.append("NATURE_GENERAL_DETAIL_AND_SOURCE_NEEDED")
            secondary.append("E")
            return "A", list(dict.fromkeys(secondary)), reasons, "STRUCTURED_API_FIELD"

        # 기타문화관광지: 내용 불명확 → H 또는 A
        if cat_code == "Ct4h4b7":
            if contains_any(text, KPOP_KEYWORDS + POPUP_KEYWORDS + EXHIB_KEYWORDS):
                reasons.append("CULTURAL_TOURISM_SPECIAL_CONTENT_DETECTED")
                return "A", list(dict.fromkeys(secondary)), reasons, "DESCRIPTION_TEXT_DERIVED"
            reasons.append("OTHER_CULTURAL_SITE_AMBIGUOUS")
            return "H", list(dict.fromkeys(secondary)), reasons, "STRUCTURED_API_FIELD"

        # 전시시설, 미술관, 공연시설, 종교성지 등 → A
        reasons.append("CONDITIONAL_REVIEW_DETAIL_NEEDED_FOR_TV_GATE")
        if cat_code in {"Cg1x6l1", "Ct9t6m8", "Cy6j7j7"}:  # 전시
            secondary.append("E")
        if cat_code == "Cw1i3e4":  # 종교성지
            secondary.append("G")  # user enrichment suitable
        return "A", list(dict.fromkeys(secondary)), reasons, "STRUCTURED_API_FIELD"

    # ─── SHOPPING REVIEW (262건) ─────────────────────────────────────
    if track == "SHOPPING_REVIEW":
        # 대형마트: F
        if cat_code == "Ct1z4k9":
            reasons.append("LARGE_RETAIL_CHAIN_EXTERNAL_SEARCH")
            return "F", list(dict.fromkeys(secondary)), reasons, "STRUCTURED_API_FIELD"

        # 면세점 / 백화점: A (high tourism value)
        if cat_code in {"Cp5i3g2", "Cs3j7y4"}:
            reasons.append("DESTINATION_SHOPPING_HIGH_TRAVEL_VALUE")
            return "A", list(dict.fromkeys(secondary)), reasons, "STRUCTURED_API_FIELD"

        # K-pop / K-beauty 키워드 → A + E
        if contains_any(text, KPOP_KEYWORDS + KBEAUTY_KEYWORDS):
            reasons.append("KPOP_KBEAUTY_INTENT_SHOPPING")
            secondary.append("E")
            return "A", list(dict.fromkeys(secondary)), reasons, "DESCRIPTION_TEXT_DERIVED"

        # 쇼핑몰
        if cat_code == "Cy4k5t1":
            reasons.append("SHOPPING_MALL_DESTINATION_CANDIDATE")
            return "A", list(dict.fromkeys(secondary)), reasons, "STRUCTURED_API_FIELD"

        # 전문매장 / 상가: 판단 필요 → A (detail이 도움됨)
        if cat_code in {"Cn0t1e0", "Cu8e6t5"}:
            reasons.append("SPECIALTY_RETAIL_DETAIL_NEEDED_FOR_CLASSIFICATION")
            return "A", list(dict.fromkeys(secondary)), reasons, "STRUCTURED_API_FIELD"

        # default
        reasons.append("SHOPPING_DETAIL_NEEDED")
        return "A", list(dict.fromkeys(secondary)), reasons, "STRUCTURED_API_FIELD"

    # ─── EXPERIENCE CANDIDATE (120건) ────────────────────────────────
    if track == "EXPERIENCE_CANDIDATE":
        reasons.append("EXPERIENCE_DETAIL_REQUIRED_FOR_TV_GATE")
        if cat_code in {"Cc9i5o2", "Cd0m9o0", "Cq3m6s6"}:
            secondary.append("E")  # official source (Seoul Tourism, KTO)
        if cat_code == "Cf1y9k1":  # 웰니스
            secondary.append("G")
        return "A", list(dict.fromkeys(secondary)), reasons, "STRUCTURED_API_FIELD"

    # ─── TEMPLE STAY (2건) ──────────────────────────────────────────
    if track == "TEMPLE_STAY_CANDIDATE":
        reasons.append("TEMPLE_STAY_DETAIL_AND_OFFICIAL_SOURCE_REQUIRED")
        secondary.append("E")
        return "A", list(dict.fromkeys(secondary)), reasons, "STRUCTURED_API_FIELD"

    # ─── UNRESOLVED (22건) ──────────────────────────────────────────
    if track == "UNRESOLVED_CATEGORY":
        if cat_code == "Cw8j0y7":  # 자연경관(하천): rivers/streams
            reasons.append("RIVER_STREAM_RESOLVED_AS_PLACE_CONDITIONAL")
            secondary.append("E")  # route/official source for stream trails
            secondary.append("G")
            return "A", list(dict.fromkeys(secondary)), reasons, "STRUCTURED_API_FIELD"
        if cat_code == "Cy5h2x9":  # 테마공원
            reasons.append("THEME_PARK_PARTIAL_RESOLUTION_FROM_POLICY_DOC")
            secondary.append("H")  # 일부 hold still
            return "A", list(dict.fromkeys(secondary)), reasons, "STRUCTURED_API_FIELD"
        if cat_code == "Ca1z6p7":  # 역사관광
            reasons.append("HISTORICAL_CATEGORY_RESOLVED_AS_PLACE_CONDITIONAL")
            secondary.append("E")
            return "A", list(dict.fromkeys(secondary)), reasons, "STRUCTURED_API_FIELD"
        reasons.append("UNRESOLVED_CATEGORY_HOLD")
        return "H", list(dict.fromkeys(secondary)), reasons, "STRUCTURED_API_FIELD"

    # ─── ACCOMMODATION EXCLUDE (17건) ───────────────────────────────
    if track == "GENERAL_ACCOMMODATION_EXCLUDE":
        if contains_any(text, ["한옥", "hanok", "문화재", "전통"]):
            reasons.append("CULTURAL_STAY_POTENTIAL_DESPITE_ACCOMMODATION_CATEGORY")
            return "A", list(dict.fromkeys(secondary)), reasons, "DESCRIPTION_TEXT_DERIVED"
        reasons.append("GENERAL_ACCOMMODATION_AFFILIATE_LAYER")
        return "F", list(dict.fromkeys(secondary)), reasons, "STRUCTURED_API_FIELD"

    # ─── Default fallback ────────────────────────────────────────────
    reasons.append("UNHANDLED_TRACK_HOLD")
    return "H", list(dict.fromkeys(secondary)), reasons, "UNKNOWN"


# ──────────────────────────────────────────────
# 7. 추천 enrichment source types
# ──────────────────────────────────────────────

def recommended_enrichment_sources(
    primary: str,
    secondary: list[str],
    track: str,
    cat_code: str,
    text: str,
) -> list[str]:
    sources = []

    if primary == "A":
        sources.append("VISITSEOUL_DETAIL")

    if primary == "C" or "C" in secondary:
        sources.append("VISITSEOUL_DETAIL")
        sources.append("PUBLIC_DATA")

    if primary == "D" or "D" in secondary:
        sources.append("OFFICIAL_EVENT")
        sources.append("OFFICIAL_VENUE")

    if "E" in [primary] + secondary:
        # 카테고리별 official source
        if "역사" in CAT_CODE_TO_LABEL.get(cat_code, "") or cat_code in {
            "Ch5t7s7", "Cb9o5c4", "Co2n1h7", "Cb9c5i3", "Cl1k5b1",
        }:
            sources.append("KTO")
            sources.append("DISTRICT_OFFICIAL")
        if cat_code in NATURE_119_CODES or cat_code in {"Cu5u8d4", "Cw8j0y7"}:
            sources.append("NATIONAL_PARK")
            sources.append("SEOUL_CITY")
        if contains_any(text, KPOP_KEYWORDS):
            sources.append("OFFICIAL_BRAND")
        if contains_any(text, HALAL_KEYWORDS):
            sources.append("PUBLIC_DATA")  # 한국이슬람교 연합회
        sources.append("OTHER_OFFICIAL")

    if "G" in [primary] + secondary:
        sources.append("USER_CONTRIBUTION")

    if primary == "F":
        sources.append("EXTERNAL_SEARCH")

    return list(dict.fromkeys(sources))


# ──────────────────────────────────────────────
# 8. 단일 record 라우팅
# ──────────────────────────────────────────────

def route_record(
    record: dict,
    existing_detail_info: dict,
    nature_119_cids: set,
    as_of: str,
) -> dict:
    cid = record["cid"]
    track = record.get("routing_track", "")
    cat_code = record.get("com_ctgry_sn", "")
    title = record.get("post_sj", "") or ""
    summary = record.get("sumry", "") or ""
    text = title + " " + summary
    main_img = record.get("main_img", "") or ""

    # 라우팅 결정
    primary, secondary, reasons, evidence_src = assign_routing(
        record, existing_detail_info, nature_119_cids, as_of
    )

    # Source content type
    sct, sct_conf = classify_source_content_type(track, cat_code, text)

    # Travel value signals
    tv_signals = assign_travel_value_signals(track, cat_code, text, sct)

    # Detected intents
    intents = detect_intents(track, cat_code, text)

    # Existing detail info
    is_nature_119 = cid in nature_119_cids
    has_integrated = cid in existing_detail_info
    existing_detail_avail = is_nature_119 or has_integrated
    existing_detail_task = (
        "TASK-SEOUL-VISITSEOUL-NATURE-TREKKING-TRAVEL-VALUE" if is_nature_119
        else existing_detail_info.get(cid, {}).get("source_task", None) if has_integrated
        else None
    )

    # Enrichment sources
    enrich_sources = recommended_enrichment_sources(primary, secondary, track, cat_code, text)

    # user enrichment suitable
    user_suitable = "G" in ([primary] + secondary)

    # review required
    review_required = (primary == "H") or ("H" in secondary)

    # Evidence fields
    evidence_fields = ["routing_track", "com_ctgry_sn", "cate_depth"]
    if title:
        evidence_fields.append("post_sj")
    if summary:
        evidence_fields.append("sumry")

    return {
        "cid": cid,
        "lang": record.get("lang_code_id", "ko"),
        "title": title,
        "category_code": cat_code,
        "category_path": record.get("cate_depth", ""),
        "legacy_routing_track": track,
        "source_content_type": sct,
        "source_content_type_confidence": sct_conf,
        "primary_routing": primary,
        "secondary_routing": secondary,
        "travel_value_signals": tv_signals,
        "detected_intents": intents,
        "existing_detail_available": existing_detail_avail,
        "existing_detail_source_task": existing_detail_task,
        "routing_reason_codes": reasons,
        "evidence_fields": evidence_fields,
        "evidence_source": evidence_src,
        "confidence": "HIGH" if evidence_src == "STRUCTURED_API_FIELD" else "MEDIUM",
        "main_img_available": bool(main_img),
        "recommended_enrichment_source_types": enrich_sources,
        "user_enrichment_suitable": user_suitable,
        "review_required": review_required,
        "provenance": {
            "source": "visitseoul",
            "original_collector_version": record.get("provenance", {}).get(
                "collector_version", "unknown"
            ),
            "routing_script": "scripts/run-seoul-full-enrichment-routing-v1.py",
            "routing_policy_version": POLICY_VERSION,
            "routed_at": as_of,
        },
        "policy_version": POLICY_VERSION,
        "as_of": as_of,
    }


# ──────────────────────────────────────────────
# 9. 메인
# ──────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="서울 VisitSeoul 전체 3,765건 enrichment routing"
    )
    parser.add_argument(
        "--base-dir",
        default=".",
        help="프로젝트 루트 디렉토리 (기본값: 현재 디렉토리)",
    )
    parser.add_argument(
        "--as-of",
        default=DEFAULT_AS_OF,
        help=f"날짜 기준 (기본값: {DEFAULT_AS_OF}, YYYY-MM-DD)",
    )
    parser.add_argument(
        "--output-dir",
        default="data/seoul-source-audit",
        help="출력 디렉토리",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="출력 파일 생성 없이 통계만 출력",
    )
    args = parser.parse_args()

    base_dir = args.base_dir
    as_of = args.as_of
    output_dir = os.path.join(base_dir, args.output_dir)
    os.makedirs(output_dir, exist_ok=True)

    # ─── 입력 파일 로드 ──────────────────────────────────────────────
    inv_path = os.path.join(base_dir, "data/seoul-source-audit",
                            "seoul-visitseoul-full-inventory-v1.jsonl")
    records = []
    with open(inv_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))

    print(f"[INFO] Loaded {len(records)} inventory records", file=sys.stderr)

    # ─── 기존 detail CID 로드 ─────────────────────────────────────
    existing_detail_info = load_existing_detail_cids(base_dir)
    nature_119_cids = build_nature_119_cids(records)

    print(f"[INFO] Nature 119 CIDs: {len(nature_119_cids)}", file=sys.stderr)
    print(f"[INFO] Integrated/dryrun detail CIDs: {len(existing_detail_info)}", file=sys.stderr)

    # ─── 전수 라우팅 ─────────────────────────────────────────────
    # 재현성을 위해 CID 기준 stable sort
    records_sorted = sorted(records, key=lambda r: r["cid"])

    routed = []
    for r in records_sorted:
        routed.append(route_record(r, existing_detail_info, nature_119_cids, as_of))

    # ─── QA 검증 ─────────────────────────────────────────────────
    output_count = len(routed)
    unique_cids = len({r["cid"] for r in routed})
    missing_primary = sum(1 for r in routed if not r.get("primary_routing"))

    assert output_count == len(records), f"Output count mismatch: {output_count} != {len(records)}"
    assert unique_cids == len(records), f"CID uniqueness fail: {unique_cids}"
    assert missing_primary == 0, f"Records missing primary_routing: {missing_primary}"

    # ─── 통계 계산 ────────────────────────────────────────────────
    from collections import Counter
    primary_counts = Counter(r["primary_routing"] for r in routed)
    secondary_flat = [s for r in routed for s in r.get("secondary_routing", [])]
    secondary_counts = Counter(secondary_flat)
    sct_counts = Counter(r["source_content_type"] for r in routed)
    tv_signal_flat = [s for r in routed for s in r.get("travel_value_signals", [])]
    tv_counts = Counter(tv_signal_flat)

    existing_detail_records = sum(1 for r in routed if r["existing_detail_available"])
    existing_detail_unique = len(
        {r["cid"] for r in routed if r["existing_detail_available"]}
    )
    records_with_intents = sum(1 for r in routed if r["detected_intents"])
    records_without_intents = len(routed) - records_with_intents

    # Manifest 생성
    manifest = {
        "task": "TASK-SEOUL-FULL-INVENTORY-ENRICHMENT-ROUTING-V1",
        "as_of": as_of,
        "policy_version": POLICY_VERSION,
        "routing_script": "scripts/run-seoul-full-enrichment-routing-v1.py",
        "ROUTING_COUNTS_ARE_NOT_RETENTION_COUNTS": True,
        "input_records": len(records),
        "output_records": output_count,
        "unique_cids": unique_cids,
        "every_cid_has_primary_routing": missing_primary == 0,
        "primary_routing_unknown": primary_counts.get("?", 0),
        "primary_routing_counts": dict(primary_counts.most_common()),
        "secondary_routing_counts": dict(secondary_counts.most_common()),
        "source_content_type_counts": dict(sct_counts.most_common()),
        "travel_value_signal_counts": dict(tv_counts.most_common()),
        "records_with_detected_intents": records_with_intents,
        "records_without_detected_intents": records_without_intents,
        "existing_detail_call_records": existing_detail_records,
        "existing_detail_unique_cids": existing_detail_unique,
        "nature_119_cids_identified": len(nature_119_cids),
        "integrated_detail_cids": len([
            c for c in existing_detail_info
            if existing_detail_info[c].get("source_task") !=
               "TASK-SEOUL-VISITSEOUL-DETAIL-DRYRUN-V1"
        ]),
        "dryrun_cids": len([
            c for c in existing_detail_info
            if existing_detail_info[c].get("batch") == "dryrun"
        ]),
        "detail_required_now_count": primary_counts.get("A", 0),
        "detail_already_sufficient_count": primary_counts.get("B", 0),
        "utility_enrichment_count": primary_counts.get("C", 0),
        "event_date_enrichment_count": primary_counts.get("D", 0),
        "other_official_source_count": primary_counts.get("E", 0),
        "external_search_count": primary_counts.get("F", 0),
        "user_enrichment_count": primary_counts.get("G", 0),
        "hold_review_count": primary_counts.get("H", 0),
    }

    # ─── 출력 ─────────────────────────────────────────────────────
    if not args.dry_run:
        # Routing JSONL
        out_jsonl = os.path.join(output_dir, "seoul-full-enrichment-routing-v1.jsonl")
        with open(out_jsonl, "w", encoding="utf-8") as f:
            for r in routed:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
        print(f"[OUTPUT] {out_jsonl} ({len(routed)} records)", file=sys.stderr)

        # Manifest JSON
        out_manifest = os.path.join(
            output_dir, "seoul-full-enrichment-routing-manifest-v1.json"
        )
        with open(out_manifest, "w", encoding="utf-8") as f:
            json.dump(manifest, f, ensure_ascii=False, indent=2)
        print(f"[OUTPUT] {out_manifest}", file=sys.stderr)

    # ─── 콘솔 요약 출력 ──────────────────────────────────────────
    print("\n" + "=" * 60)
    print("TASK-SEOUL-FULL-INVENTORY-ENRICHMENT-ROUTING-V1 SUMMARY")
    print("=" * 60)
    print(f"INPUT_TOTAL      = {len(records)}")
    print(f"OUTPUT_TOTAL     = {output_count}")
    print(f"UNIQUE_CID       = {unique_cids}")
    print(f"MISSING_PRIMARY  = {missing_primary}")
    print()
    print("PRIMARY ROUTING:")
    routing_labels = {
        "A": "DETAIL_REQUIRED_NOW",
        "B": "DETAIL_ALREADY_SUFFICIENT",
        "C": "UTILITY_ENRICHMENT_REQUIRED",
        "D": "EVENT_DATE_ENRICHMENT_REQUIRED",
        "E": "OTHER_OFFICIAL_SOURCE_REQUIRED",
        "F": "EXTERNAL_SEARCH_LAYER_SUITABLE",
        "G": "USER_ENRICHMENT_SUITABLE",
        "H": "HOLD_USER_REVIEW_REQUIRED",
    }
    total = output_count
    for k in "ABCDEFGH":
        cnt = primary_counts.get(k, 0)
        label = routing_labels.get(k, k)
        pct = cnt / total * 100
        print(f"  {k}. {label:40s}: {cnt:5d} ({pct:.1f}%)")
    print(f"  TOTAL: {sum(primary_counts.values())}")
    print()
    print("SOURCE CONTENT TYPES:")
    for sct, cnt in sct_counts.most_common():
        print(f"  {sct:30s}: {cnt}")
    print()
    print("EXISTING DETAIL:")
    print(f"  Nature 119 CIDs          : {len(nature_119_cids)}")
    print(f"  Integrated detail CIDs   : {len(existing_detail_info) - manifest['dryrun_cids']}")
    print(f"  Dryrun CIDs              : {manifest['dryrun_cids']}")
    print(f"  All existing unique      : {existing_detail_unique}")
    print()
    print("QA PASS: EVERY_CID_HAS_PRIMARY_ROUTING =", "YES" if missing_primary == 0 else "NO")
    print("=" * 60)


if __name__ == "__main__":
    main()
