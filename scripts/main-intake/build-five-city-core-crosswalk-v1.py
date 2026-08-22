"""
build-five-city-core-crosswalk-v1 — 5도시 ACTIVE canonical ↔ Main city_spots 의 ID-보존 crosswalk
(TASK-MAIN-FIVE-CITY-CORE-INTEGRATION-PREP-AND-DRY-RUN-V1)

입력
  · 고정 ref 의 최종 artifact (five_city_core_lib.PINNED_INPUTS)
  · Main 비사용자 스냅샷 `main-city-spots-snapshot-2026-08-22-v1.jsonl` (714행, 사용자 데이터 0)
출력  data/main-intake/five-city-core-v1/
  · five-city-core-crosswalk-v1.jsonl      — ACTIVE canonical 4,826 각각의 decision
  · five-city-core-main-classification-v1.jsonl — 기존 Main 714행의 분류 (삭제 0)
  · five-city-core-crosswalk-summary-v1.json

결정 규칙(확정된 것은 다시 흔들지 않는다)
  경주   : Main sources[].source_key == canonical candidate_id (302/302). ACTIVE 299 → MATCH_REPLACE.
  부산 Food : discovery_candidate_ids ∩ Main legacy external_id(busan-F-*) = 97 → MATCH_REPLACE.
           나머지는 한글 상호 정확 일치 + ≤300m 일 때만 MATCH(슌사이쿠보 1건), 그 외 NEW.
           음식점은 이름만 같고 멀면(톤쇼우 9km) 다른 지점 → NEW.
  부산 NonFood : Main 85행을 한글명·좌표·주소·공식 URL·지역 정체성으로 Main 에서 직접 판정한
           표(BUSAN_NONFOOD_DECISIONS). 넓은 면적 entity 는 좌표 차이로 다른 장소로 보지 않는다.
  서울·제주·전주 : Main 0 → NEW.
  아티팩트 내부 쌍둥이(같은 이름 ≤150m) : Gate A(TASK-FIVE-CITY-CORE-PREPROD-GATE-V1) 에서 구성원마다 최종 판정 —
           SAME_ENTITY_TWIN → CONFIRMED_TWIN(대표만 write) · DISTINCT_ENTITY → NEW · TRUE_AMBIGUOUS → 판정 전 SKIP.
           대표는 lib.resolve_twins 의 근거 규칙(provenance 등급→깨끗한 고유명→이미지→설명→URL→id)으로 고른다.

DB 접근 0 · 쓰기 0.
"""
from __future__ import annotations

import json
import re
import os
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(__file__))
from five_city_core_lib import (  # noqa: E402
    EXPECTED_ACTIVE, EXPECTED_TOTAL, PINNED_INPUTS, REPO, km, ko_part, load_input, norm, resolve_twins,
    verify_pins, write_json, write_jsonl,
)

OUT_DIR = os.path.join(REPO, "data", "main-intake", "five-city-core-v1")
MAIN_SNAPSHOT = os.path.join(OUT_DIR, "main-city-spots-snapshot-2026-08-22-v1.jsonl")

# ── Gate A (TASK-FIVE-CITY-CORE-PREPROD-GATE-V1): 쌍둥이 최종 판정표 ─────────────────────
# 자동 규칙(이름 동일 + 주소 동일/≤30m → 같은 장소)으로 못 정하는 쌍만 Main 에서 직접 보고 적는다.
# 키는 (작은 id, 큰 id) 정렬 쌍. 근거는 artifact 값(이름·주소·좌표·설명)만 — 새 웹 조사 없음.
TWIN_SAME_ENTITY: dict[tuple[str, str], str] = {
    ("KTO-147684", "OFF-9751"): "전주향교 — 같은 향교 경내(향교길 119-6 / 139, 106m). KTO 좌표는 다른 출입구. 같은 entity",
}
TWIN_DISTINCT: dict[tuple[str, str], str] = {
    ("KTO-129786", "OFF-9756"): "OFF-9756 는 국립전주박물관 경내의 어린이박물관(en 'Jeonju Children's Museum', 설명 'A Hands-On Museum Where Children…'), "
                               "KTO-129786 는 국립전주박물관 본관 — 복합시설 내부의 별개 entity(125m)",
}
TWIN_TRUE_AMBIGUOUS: dict[str, str] = {
    "seoul-food-v1-0909": "사마르칸트시티 — 이름은 같으나 등록 주소가 다름(마른내로 159-4 vs 을지로42길 16 성산빌딩, 92m). "
                          "같은 식당의 주소 표기 차이인지 별도 지점인지 artifact 만으로 확정 불가 → 판정 전 SKIP",
}
BUSAN_PREFIX_PROV = {"A": 0, "K": 1, "E": 2, "VB": 3}   # entity API 레코드 < page 레코드


def busan_features(r: dict) -> dict:
    pre = r["canonical_id"].split("-")[1]
    return {"prov": BUSAN_PREFIX_PROV.get(pre, 9), "name_ko": r.get("name_ko"), "img": 1 if r.get("image_url") else 0,
            "desc": 1 if (r.get("description_ko") or r.get("description_en")) else 0,
            "url": 1 if (r.get("official_url") or r.get("source_url")) else 0, "source_type": f"busan-{pre}"}


def seoul_jeju_features(r: dict) -> dict:
    return {"prov": 0, "name_ko": r.get("title_ko"), "img": 1 if (r.get("image_url") and r.get("image_display_eligible")) else 0,
            "desc": 1 if (r.get("description_ko") and not str(r.get("description_ko")).startswith(".se-")) else 0,
            "url": 1 if r.get("homepage") else 0, "source_type": r.get("source_tier")}


def jeonju_features(r: dict) -> dict:
    return {"prov": 0 if r.get("source") == "OFFICIAL" else 1, "name_ko": r.get("display_name"), "img": 0,
            "desc": 1 if r.get("description_en") else 0, "url": 1 if r.get("source_url") else 0, "source_type": r.get("source")}

# ── 부산 NonFood: Main 85행 직접 판정표 (canonical 의 name_ko·좌표·주소로 확인) ──────
# decision: M = MATCH_REPLACE(canonical → 이 Main id 보존) · L = LEGACY_ONLY_VALID(대응 canonical 없음)
#           D = DUPLICATE_REVIEW(데이터계약 §16 준중복: 대표 id 에 canonical 을 주고 이 id 는 보존·검토)
BUSAN_NONFOOD_DECISIONS: dict[int, tuple[str, str | None, str]] = {
    1:  ("M", "busan-A-00070", "해운대 · 54m"),
    2:  ("M", "busan-A-00062", "감천문화마을 · 217m"),
    3:  ("D", "busan-K-00057", "§16: #21 유지/#3 준중복 — canonical 은 #21 로"),
    4:  ("D", "busan-A-00071", "§16: #16 유지/#4 준중복 — canonical 은 #16 으로"),
    5:  ("L", None, "황령산 야경 트레일 — 대응 canonical 없음(전망쉼터 A-00068 은 #33)"),
    6:  ("L", None, "장산 트레일 — 장산 정상(A-00084)은 #30"),
    7:  ("L", None, "이기대 해안산책로 — canonical 없음(§16 #29 와 둘 다 유지)"),
    16: ("M", "busan-A-00071", "광안리해수욕장 · 16m"),
    17: ("M", "busan-A-00024", "송정해수욕장 · 4m"),
    18: ("M", "busan-K-00003", "부산 송도해수욕장 · 332m(해변 면적)"),
    19: ("M", "busan-A-00134", "다대포해변공원 · 227m(해변 면적)"),
    21: ("M", "busan-K-00057", "부산 자갈치시장 · 19m"),
    22: ("M", "busan-K-00058", "국제시장 · 31m"),
    23: ("L", None, "BIFF광장(남포) — 영화의 거리 canonical 은 해운대(12km) 다른 장소"),
    24: ("M", "busan-A-00065", "용두산공원 · 4m"),
    25: ("M", "busan-A-00007", "해동용궁사 · 35m"),
    26: ("M", "busan-A-00074", "범어사 · 18m"),
    27: ("M", "busan-A-00004", "태종대 · 109m"),
    28: ("L", None, "오륙도 스카이워크 — canonical 은 오륙도(섬) A-00022 = 다른 entity"),
    29: ("L", None, "이기대 해안 트레일 — canonical 없음"),
    30: ("M", "busan-A-00084", "장산 정상 · 1.8km(산 면적)"),
    31: ("M", "busan-A-00072", "금정산 · 403m(산 면적)"),
    32: ("L", None, "금정산성(성곽 전체) — canonical 은 동문·먹거리촌·축제뿐"),
    33: ("M", "busan-A-00068", "황령산 전망쉼터 · 205m"),
    34: ("M", "busan-A-00082", "백양산 · 326m"),
    35: ("M", "busan-A-00058", "봉래산 · 1.2km(산 면적)"),
    36: ("M", "busan-A-00088", "승학산 억새평원 · 221m"),
    37: ("M", "busan-A-00197", "동백섬 · 255m"),
    38: ("M", "busan-A-00168", "누리마루 APEC하우스 · 90m"),
    39: ("L", None, "청사포 다릿돌전망대 — canonical 없음(청사포와 미포 A-00055 는 어촌 면적 페이지)"),
    40: ("M", "busan-K-00442", "해운대 블루라인(그린레일웨이) · 선형 entity"),
    41: ("M", "busan-K-00659", "달맞이동산 · 98m"),
    42: ("L", None, "더베이101 — canonical 없음"),
    43: ("M", "busan-VB-996", "부산엑스더스카이 전망대 · 82m"),
    44: ("M", "busan-A-00121", "송도해상케이블카 · 317m"),
    45: ("M", "busan-A-00003", "국립해양박물관 · 22m"),
    46: ("M", "busan-A-00046", "암남공원 · 명칭 일치"),
    47: ("M", "busan-A-00001", "흰여울문화마을 · 53m"),
    48: ("M", "busan-K-00086", "절영해안산책로 · 689m(선형)"),
    49: ("D", "busan-A-00004", "§16: #27 유지/#49 준중복(태종대 등대) — canonical 은 #27 로"),
    50: ("L", None, "부산항대교 전망 — canonical 없음"),
    51: ("M", "busan-A-00021", "유엔기념공원 · 78m"),
    52: ("M", "busan-A-00020", "부산박물관 · 명칭 일치"),
    53: ("M", "busan-A-00056", "부산시민공원 · 명칭 일치"),
    54: ("M", "busan-A-00120", "전포공구길(전포카페거리) · 129m"),
    55: ("L", None, "서면 쇼핑거리 — canonical 은 서면시장(다른 entity)"),
    56: ("M", "busan-A-00054", "삼광사 · 634m(사찰 면적)"),
    57: ("L", None, "온천천 시민공원 — canonical 없음"),
    58: ("M", "busan-A-00075", "동래읍성 · 719m(성곽 면적)"),
    59: ("M", "busan-A-00073", "금강공원&식물원 · 422m"),
    60: ("M", "busan-A-00085", "석불사 · 명칭 일치"),
    61: ("L", None, "만덕고개 전망데크 — canonical 없음"),
    62: ("M", "busan-A-00122", "화명생태공원 · 명칭 일치"),
    63: ("M", "busan-A-00091", "화명수목원 · 859m(수목원 면적)"),
    64: ("L", None, "낙동강하구 에코센터 — canonical 은 국가지질공원(다른 entity)"),
    65: ("M", "busan-A-00040", "을숙도 · 417m"),
    66: ("M", "busan-A-00127", "부산현대미술관 · 73m"),
    67: ("M", "busan-A-00006", "아홉산숲 · 명칭 일치(K-00218 은 쌍둥이)"),
    68: ("L", None, "아난티 코브 — canonical 은 이터널저니(서점) 다른 entity"),
    69: ("M", "busan-A-00118", "롯데월드 어드벤처 부산 · 428m"),
    70: ("M", "busan-A-00179", "오시리아 해안산책로 · 선형"),
    71: ("M", "busan-A-00050", "국립부산과학관 · 76m"),
    72: ("M", "busan-A-00010", "일광해수욕장 · 164m"),
    73: ("M", "busan-A-00005", "죽성성당(죽성드림성당) · 명칭 일치"),
    74: ("M", "busan-A-00080", "영화의 전당 · 7m"),
    75: ("M", "busan-K-00110", "신세계 센텀시티 · 131m"),
    76: ("M", "busan-A-00026", "민락수변공원 · 110m"),
    77: ("M", "busan-A-00069", "F1963 · 183m"),
    78: ("M", "busan-A-00124", "부산근현대역사관(별관) · 57m"),
    79: ("M", "busan-A-00016", "보수동책방골목 · 52m"),
    80: ("M", "busan-A-00061", "40계단 문화관광테마거리 · 154m"),
    81: ("L", None, "부산역 — 도착 anchor, canonical 없음(워케이션센터는 다른 entity)"),
    82: ("L", None, "168계단·모노레일 — canonical 없음(이바구공작소는 다른 entity)"),
    83: ("M", "busan-A-00209", "초량 이바구길 · 264m(선형)"),
    84: ("M", "busan-A-00017", "임시수도기념관 · 198m"),
    85: ("M", "busan-VB-833", "송도용궁구름다리 · 412m"),
    86: ("M", "busan-A-00045", "삼락생태공원 · 112m"),
    87: ("M", "busan-A-00129", "맥도생태공원 · 1.9km(공원 면적)"),
    88: ("M", "busan-A-00128", "대저생태공원 · 1.5km(공원 면적)"),
    89: ("M", "busan-A-00048", "가덕도 · 1.6km(섬 면적)"),
    90: ("M", "busan-A-00023", "신선대 · 336m"),
    91: ("M", "busan-K-00684", "송도스카이파크(부산에어크루즈) · 434m"),
    92: ("M", "busan-A-00158", "북항 친수공원 · 165m"),
    94: ("L", None, "아시아드주경기장 — canonical 없음(컨트리클럽은 다른 entity)"),
    95: ("M", "busan-A-00052", "어린이대공원 · 명칭 일치"),
}


def main() -> None:
    pins = verify_pins()
    main_rows = [json.loads(l) for l in open(MAIN_SNAPSHOT, encoding="utf-8") if l.strip()]
    if len(main_rows) != 714:
        raise SystemExit(f"main snapshot rows {len(main_rows)} != 714")
    by_main = {r["main_city_spot_id"]: r for r in main_rows}

    decisions: list[dict] = []
    main_cls: dict[int, dict] = {}
    inputs_meta: dict[str, dict] = {}

    def add(city: str, cid: str, decision: str, *, main_id: int | None = None, tier: str, confidence: str,
            method: str, evidence: str, notes: str = "", legacy: str | None = None, twin_of: str | None = None,
            service_status: str = "ACTIVE") -> None:
        decisions.append({
            "city": city, "canonical_id": cid, "service_status": service_status,
            "main_city_spot_id": main_id, "decision": decision, "tier": tier, "confidence": confidence,
            "match_method": method, "evidence": evidence, "legacy_status": legacy,
            "reference_sensitive": main_id is not None,
            "twin_of": twin_of, "notes": notes,
        })

    # ── 경주 ────────────────────────────────────────────────────────────────
    gj, sha = load_input("gyeongju")
    inputs_meta["gyeongju"] = {"rows": len(gj), "sha256": sha}
    key_to_main: dict[str, int] = {}
    for r in main_rows:
        if r["city"] == "gyeongju":
            for s in r["sources"]:
                key_to_main[s["source_key"]] = r["main_city_spot_id"]
    for c in gj:
        mid = key_to_main.get(c["candidate_id"])
        if mid is None:
            raise SystemExit(f"gyeongju bridge broken: {c['candidate_id']}")
        if c.get("service_status") == "ACTIVE":
            add("gyeongju", c["candidate_id"], "MATCH_REPLACE", main_id=mid, tier="TIER1", confidence="HIGH",
                method="source_key==candidate_id", evidence=f"city_spot_sources.source_key={c['candidate_id']}")
            main_cls[mid] = {"class": "ACTIVE_MATCHED", "canonical_id": c["candidate_id"]}
        else:
            add("gyeongju", c["candidate_id"], "EXCLUDED", main_id=mid, tier="TIER1", confidence="HIGH",
                method="source_key==candidate_id", evidence="service_status=EXCLUDED", service_status="EXCLUDED",
                legacy="EXCLUDED_FROM_SERVICE_REVIEW", notes="identity 확정이지만 service 밖 — write 제외·삭제 금지")
            main_cls[mid] = {"class": "EXCLUDED_FROM_SERVICE_REVIEW", "canonical_id": c["candidate_id"]}

    # ── 부산 Food ───────────────────────────────────────────────────────────
    food, sha = load_input("busan_food")
    inputs_meta["busan_food"] = {"rows": len(food), "sha256": sha}
    ext_to_main = {r["legacy_external_id"]: r["main_city_spot_id"] for r in main_rows
                   if r["city"] == "busan" and r["legacy_external_id"]}
    main_food_unmatched = {r["main_city_spot_id"]: r for r in main_rows if r["city"] == "busan" and r["category"] == "restaurant"}
    food_active = sorted((c for c in food if c.get("current_state") == "ACTIVE"), key=lambda x: x["canonical_id"])
    # 1차: discovery-id bridge(TIER1) 를 먼저 전부 확정한다 — 같은 Main 행이 2차 규칙에 다시 잡히지 않게.
    tier1_done: set[str] = set()
    for c in food_active:
        ids = c.get("discovery_candidate_ids") or ([c["canonical_discovery_id"]] if c.get("canonical_discovery_id") else [])
        hits = sorted({ext_to_main[i] for i in ids if i in ext_to_main and ext_to_main[i] in main_food_unmatched})
        if hits:
            mid = hits[0]
            add("busan", c["canonical_id"], "MATCH_REPLACE", main_id=mid, tier="TIER1", confidence="HIGH",
                method="discovery_id==legacy_external_id", evidence=f"{ids}",
                notes="legacy 좌표는 미검증(계약 §16) — canonical 좌표로 교체")
            main_cls[mid] = {"class": "ACTIVE_MATCHED", "canonical_id": c["canonical_id"]}
            main_food_unmatched.pop(mid, None)
            tier1_done.add(c["canonical_id"])
    # 2차: 같은 지점 확인 — (a) 한글 상호 정확 일치 + ≤300m, 또는 (b) Main 상호에 한글이 없으면
    # 도로명 주소 끝부분 동일 + 로마자 상호 유사 ≥0.8 + ≤50m. 이름만 같고 멀면 다른 지점(NEW).
    import difflib
    for c in food_active:
        if c["canonical_id"] in tier1_done:
            continue
        nk = norm(c.get("name_ko"))
        ne = norm(re.split(r"[(（]", c.get("name_en") or "")[0])
        best = None
        for mid, r in main_food_unmatched.items():
            d = km(c.get("latitude"), c.get("longitude"), r["lat"], r["lng"])
            if d is None:
                continue
            mk = ko_part(r["canonical_title"])
            if mk:
                same = nk and (nk == mk or nk.replace("본점", "") == mk.replace("본점", ""))
                if same and d <= 0.3:
                    best = (mid, round(d * 1000), "ko_name+coord<=300m")
                    break
            else:
                me = norm(re.split(r"[(（]", r["canonical_title"])[0])
                ca, ma = norm(c.get("address_ko")), norm(r.get("address"))
                # 도로명+번지 끝부분이 같으면 같은 주소 — 시·구 접두사 유무 차이는 무시한다
                addr_same = bool(ca) and bool(ma) and min(len(ca), len(ma)) >= 8 and (ca.endswith(ma) or ma.endswith(ca))
                sim = difflib.SequenceMatcher(None, ne, me).ratio() if ne and me else 0
                if addr_same and sim >= 0.8 and d <= 0.05:
                    best = (mid, round(d * 1000), f"address_tail+romanized_name(sim={sim:.2f})+coord<=50m")
                    break
        if best:
            add("busan", c["canonical_id"], "MATCH_REPLACE", main_id=best[0], tier="TIER2", confidence="HIGH",
                method=best[2], evidence=f"main#{best[0]} {best[1]}m")
            main_cls[best[0]] = {"class": "ACTIVE_MATCHED", "canonical_id": c["canonical_id"]}
            main_food_unmatched.pop(best[0], None)
        else:
            add("busan", c["canonical_id"], "NEW", tier="NEW", confidence="HIGH",
                method="no_main_counterpart", evidence="discovery id ∉ Main · 한글 상호/주소 불일치(동명이면 다른 지점)")
    for mid, r in main_food_unmatched.items():
        cls = "EXCLUDED_FROM_SERVICE_REVIEW" if r["legacy_external_id"] else "LEGACY_ONLY_VALID"
        main_cls[mid] = {"class": cls, "canonical_id": None,
                         "notes": "historical busan-F, final Food 미선발 — 삭제·부활 금지" if r["legacy_external_id"] else "수동 입력 legacy — 대응 canonical 없음"}

    twin_resolution: list[dict] = []

    def add_twin(city: str, cid: str, rel: dict) -> None:
        rep = rel["representative_canonical_id"]
        if rel["relation"] == "SAME_ENTITY_TWIN":
            add(city, cid, "CONFIRMED_TWIN", tier="SAME_ENTITY_TWIN", confidence=rel["confidence"],
                method=rel["deterministic_rule"], evidence=rel["reason"], twin_of=rep,
                notes="같은 장소의 두 번째 레코드 — 대표(twin_of)만 write, 이 행은 SKIP_TWIN")
        else:
            add(city, cid, "TRUE_AMBIGUOUS", tier="TWIN_UNRESOLVED", confidence=rel["confidence"],
                method=rel["deterministic_rule"], evidence=rel["reason"], twin_of=rep,
                notes="같은 장소인지 확정 불가 — 판정 전까지 write 제외(SKIP_TRUE_AMBIGUOUS). 삭제·병합 아님")

    # ── 부산 NonFood ────────────────────────────────────────────────────────
    nf_all, sha = load_input("busan_nonfood")
    inputs_meta["busan_nonfood"] = {"rows": len(nf_all), "sha256": sha}
    nf = [r for r in nf_all if r.get("service_status") == "ACTIVE"]
    nf_by = {r["canonical_id"]: r for r in nf}
    twins, res = resolve_twins(nf, name_keys=("name_ko", "name_en"), lat_key="lat", lng_key="lng", id_key="canonical_id",
                               features=busan_features, addr_key="address_ko", same_entity=TWIN_SAME_ENTITY, distinct=TWIN_DISTINCT,
                               true_ambiguous=TWIN_TRUE_AMBIGUOUS, city="busan")
    twin_resolution.extend(res)
    twin_rel = {r["member_canonical_id"]: r for r in res}
    matched_canon: dict[str, int] = {}
    for mid, (dec, cid, why) in sorted(BUSAN_NONFOOD_DECISIONS.items()):
        r = by_main[mid]
        if dec == "M":
            if cid not in nf_by:
                raise SystemExit(f"nonfood decision target missing: {cid}")
            if cid in twins:
                cid = twins[cid]  # 대표 레코드에 붙인다
            if cid in matched_canon:
                raise SystemExit(f"canonical {cid} matched twice ({matched_canon[cid]}, {mid})")
            matched_canon[cid] = mid
            main_cls[mid] = {"class": "ACTIVE_MATCHED", "canonical_id": cid, "evidence": why}
        elif dec == "D":
            main_cls[mid] = {"class": "DUPLICATE_REVIEW", "canonical_id": None, "duplicate_of_canonical": cid,
                             "notes": why}
        else:
            main_cls[mid] = {"class": "LEGACY_ONLY_VALID", "canonical_id": None, "notes": why}
    for c in sorted(nf, key=lambda x: x["canonical_id"]):
        cid = c["canonical_id"]
        if cid in matched_canon:
            mid = matched_canon[cid]
            add("busan", cid, "MATCH_REPLACE", main_id=mid, tier="TIER2", confidence="HIGH",
                method="main_direct_resolution(name_ko+coord+address)", evidence=BUSAN_NONFOOD_DECISIONS[mid][2])
        elif cid in twins:
            add_twin("busan", cid, twin_rel[cid])
        else:
            add("busan", cid, "NEW", tier="NEW", confidence="HIGH", method="no_main_counterpart",
                evidence="Main nonfood 85 판정표에 대응 없음")

    # ── 서울 · 제주 · 전주 (Main 0) ─────────────────────────────────────────
    for key, city, id_key, name_keys, lat_key, lng_key, active_pred in [
        ("seoul", "seoul", "candidate_id", ("title_ko",), "lat", "lng", lambda r: r.get("service_status") == "ACTIVE"),
        ("jeju", "jeju", "candidate_id", ("title_ko",), "lat", "lng", lambda r: r.get("service_status") == "ACTIVE"),
        ("jeonju", "jeonju", "candidate_id", ("display_name",), "lat", "lng", lambda r: r.get("final_status") == "ACTIVE_SERVICE"),
    ]:
        rows, sha = load_input(key)
        inputs_meta[key] = {"rows": len(rows), "sha256": sha}
        act = [r for r in rows if active_pred(r)]
        tw, res = resolve_twins(act, name_keys=name_keys, lat_key=lat_key, lng_key=lng_key, id_key=id_key,
                                features=jeonju_features if city == "jeonju" else seoul_jeju_features,
                                addr_key="kto_addr" if city == "jeonju" else "address", same_entity=TWIN_SAME_ENTITY,
                                distinct=TWIN_DISTINCT, true_ambiguous=TWIN_TRUE_AMBIGUOUS, city=city)
        twin_resolution.extend(res)
        rel = {r["member_canonical_id"]: r for r in res}
        for r in sorted(act, key=lambda x: x[id_key]):
            cid = r[id_key]
            if cid in tw:
                add_twin(city, cid, rel[cid])
            elif cid in rel and rel[cid]["relation"] == "DISTINCT_ENTITY":
                add(city, cid, "NEW", tier="NEW", confidence="HIGH", method="twin_candidate_resolved_distinct",
                    evidence=rel[cid]["reason"], notes="쌍둥이 후보였으나 다른 entity 로 확정 — 독립 레코드")
            else:
                add(city, cid, "NEW", tier="NEW", confidence="HIGH", method="main_has_no_rows", evidence="Main city_spots city=0")

    # ── 검산 ────────────────────────────────────────────────────────────────
    active = [d for d in decisions if d["service_status"] == "ACTIVE"]
    per_city: dict[str, Counter] = defaultdict(Counter)
    for d in active:
        per_city[d["city"]][d["decision"]] += 1
    for d in decisions:
        if d["service_status"] != "ACTIVE":
            per_city[d["city"]]["EXCLUDED_IDENTITY_ONLY"] += 1
    totals = Counter(d["decision"] for d in active)
    if len(active) != EXPECTED_TOTAL:
        raise SystemExit(f"ACTIVE decisions {len(active)} != {EXPECTED_TOTAL}")
    for k, exp in EXPECTED_ACTIVE.items():
        city = PINNED_INPUTS[k]["city"]
        cnt = sum(1 for d in active if d["city"] == city and (
            (k == "busan_food" and d["canonical_id"].startswith("busan-G-")) or
            (k == "busan_nonfood" and not d["canonical_id"].startswith("busan-G-")) or
            k not in ("busan_food", "busan_nonfood")))
        if cnt != exp:
            raise SystemExit(f"{k} active {cnt} != {exp}")
    # Main 714 분류 — 미분류 행은 PRESERVE_UNTOUCHED
    for r in main_rows:
        main_cls.setdefault(r["main_city_spot_id"], {"class": "PRESERVE_UNTOUCHED", "canonical_id": None})
    main_out = [{"main_city_spot_id": mid, "city": by_main[mid]["city"], "category": by_main[mid]["category"],
                 "canonical_title": by_main[mid]["canonical_title"], **main_cls[mid], "delete": False}
                for mid in sorted(main_cls)]
    main_counts = Counter(m["class"] for m in main_out)
    matched_ids = {d["main_city_spot_id"] for d in active if d["decision"] == "MATCH_REPLACE"}
    if len(matched_ids) != main_counts["ACTIVE_MATCHED"]:
        raise SystemExit("matched id count mismatch")

    write_jsonl(os.path.join(OUT_DIR, "five-city-core-crosswalk-v1.jsonl"), sorted(decisions, key=lambda d: (d["city"], d["canonical_id"])))
    write_jsonl(os.path.join(OUT_DIR, "five-city-core-main-classification-v1.jsonl"), main_out)
    write_jsonl(os.path.join(OUT_DIR, "five-city-core-twin-resolution-v1.jsonl"),
                sorted(twin_resolution, key=lambda r: (r["city"], r["member_canonical_id"])))
    summary = {
        "task": "TASK-MAIN-FIVE-CITY-CORE-INTEGRATION-PREP-AND-DRY-RUN-V1",
        "pins": pins, "inputs": inputs_meta,
        "active_total": len(active), "decisions_total": totals,
        "per_city": {c: dict(v) for c, v in sorted(per_city.items())},
        "twin_resolution": {
            "relations": dict(Counter(r["relation"] for r in twin_resolution)),
            "per_city": {c: dict(Counter(r["relation"] for r in twin_resolution if r["city"] == c)) for c in sorted({r["city"] for r in twin_resolution})},
            "source_active_record_count": len(active),
            "confirmed_twin_record_count": totals.get("CONFIRMED_TWIN", 0),
            "true_ambiguous_count": totals.get("TRUE_AMBIGUOUS", 0),
            "unique_service_place_count": len(active) - totals.get("CONFIRMED_TWIN", 0),
        },
        "existing_id_preserved": len(matched_ids),
        "id_change_required": 0, "delete_decisions": 0,
        "main_714_classification": dict(main_counts),
        "busan_food_tier1": sum(1 for d in active if d["city"] == "busan" and d["canonical_id"].startswith("busan-G-") and d["tier"] == "TIER1"),
    }
    write_json(os.path.join(OUT_DIR, "five-city-core-crosswalk-summary-v1.json"), summary)
    print(json.dumps(summary, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
