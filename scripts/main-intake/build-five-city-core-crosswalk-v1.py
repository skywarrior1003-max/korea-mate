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
  ARTIFACT TRUST RULE (TASK-FIVE-CITY-CORE-ARTIFACT-TRUST-AND-IDENTITY-CORRECTION-V1):
           FINAL VALIDATED ARTIFACT > MAIN HEURISTIC. Main 은 이름·주소·전화·좌표 유사성으로 identity 를 만들지 않는다.
           · 같은 장소의 두 번째 레코드(CONFIRMED_TWIN)는 artifact 가 스스로 증명하는 경우만 — 부산 provenance.source_keys 의
             같은 uc_seq(AttractionService:N ↔ VisitBusanContent:attraction:N). 서울·제주·전주는 관계 필드가 없으므로 병합 0.
           · 부산 Food ↔ Main 은 artifact 가 기록한 lineage(discovery_candidate_ids·canonical_discovery_id·image_recovery_v1.disc_id·
             identity_removed_cids) 와 legacy external_id 의 일치만 인정. 이름/주소/좌표 bridge(옛 TIER2) 폐기.
           · 전주 artifact 가 identity_review=True 로 남긴 레코드는 REVIEW_REQUIRED — 병합도 삭제도 하지 않고 write 에서 보류.
           · 모든 decision 에 decision_basis 를 남긴다(NAME/ADDRESS/COORDINATE_HEURISTIC 금지).

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
    EXPECTED_ACTIVE, EXPECTED_TOTAL, PINNED_INPUTS, REPO, git_show, km, ko_part, load_input, norm,
    verify_pins, write_json, write_jsonl,
)

OUT_DIR = os.path.join(REPO, "data", "main-intake", "five-city-core-v1")
MAIN_SNAPSHOT = os.path.join(OUT_DIR, "main-city-spots-snapshot-2026-08-22-v1.jsonl")

# ── ARTIFACT TRUST: 근거 유형(decision_basis) ─────────────────────────────────────────
BASIS_SOURCE_LINEAGE = "ARTIFACT_SOURCE_LINEAGE"          # artifact 가 기록한 source/uc_seq/discovery lineage
BASIS_IDENTITY_RESOLUTION = "ARTIFACT_IDENTITY_RESOLUTION"  # artifact 의 identity_review / resolution verdict
BASIS_SERVICE_STATUS = "ARTIFACT_SERVICE_STATUS"            # artifact 의 service_status/final_status 그대로
BASIS_MAIN_DECISION_TABLE = "MAIN_EXPLICIT_DECISION_TABLE"  # 사람이 행 단위로 적은 Main 판정표(BUSAN_NONFOOD_DECISIONS)
BASIS_LEGACY_PRESERVE = "LEGACY_REFERENCE_PRESERVE"
BASIS_OWNER_OVERRIDE = "OWNER_OVERRIDE"
BASIS_REVIEW_REQUIRED = "REVIEW_REQUIRED"
BASIS_UNRESOLVED = "UNRESOLVED_AFTER_ARTIFACT_INSPECTION"
FORBIDDEN_BASIS = {"NAME_HEURISTIC", "ADDRESS_HEURISTIC", "COORDINATE_HEURISTIC"}

# Main 이 artifact 를 끝까지 읽고도 관계를 확정할 수 없어 보류하는 레코드(병합·삭제 아님). 근거는 보고서 §1-1.
JEONJU_UNRESOLVED_AFTER_INSPECTION: dict[str, str] = {
    "OFF-16676": "전주드림랜드(official 16676): crossmatch 는 kto_cid=126626(전주동물원)로, 복구된 표시명은 드림랜드로 — artifact 내부 충돌",
    "KTO-2790515": "전주드림랜드(KTO 2790515): OFF-16676 과 같은 표시명이지만 artifact 가 연결하지 않음 — 판정 전 보류",
}
# Owner 가 유지하기로 확정한 부산 legacy(기존 id 보존 · is_published 유지 · 플래너 후보 포함). #7/#29 는 둘 다 '이기대' 행.
OWNER_OVERRIDE_KEEP_PUBLISHED: dict[int, str] = {
    7: "이기대 해안산책로(Igidae Coastal Walk) — Owner 확정 유지",
    28: "오륙도 스카이워크 — Owner 확정 유지",
    29: "이기대 해안산책로(Igidae Coastal Trail) — Owner 확정 유지(이기대 2행 중 하나)",
    42: "더베이101 — Owner 확정 유지",
}
def _load_previous_heuristic_twins() -> dict[str, dict]:
    """a14ba83 의 twin-resolution(휴리스틱 판정) — 해제 기록용. git 객체에서 읽으므로 재생성과 무관하게 고정."""
    out: dict[str, dict] = {}
    try:
        txt = git_show("a14ba83", "data/main-intake/five-city-core-v1/five-city-core-twin-resolution-v1.jsonl")
    except Exception:
        return out
    for line in txt.splitlines():
        if not line.strip():
            continue
        r = json.loads(line)
        if r.get("representative_canonical_id"):
            out[r["member_canonical_id"]] = {"relation": r["relation"], "rep": r["representative_canonical_id"], "rule": r.get("deterministic_rule")}
    return out


PREVIOUS_HEURISTIC_TWINS = _load_previous_heuristic_twins()
UC_SEQ_RE = re.compile(r":(\d+)(?::[a-z\-]+)?$", re.I)
PRIMARY_SOURCE_ROLE = {"busan_official_api": 0, "kto_tourapi": 1, "visitbusan_web": 2}   # entity API 레코드 < 웹 페이지 레코드


def by_kto_of(rows: list[dict], off_id: str) -> str | None:
    r = next((x for x in rows if x.get("candidate_id") == off_id), None)
    return str(r.get("kto_cid")) if r and r.get("kto_cid") else None


def uc_seqs(r: dict) -> set[str]:
    """artifact provenance.source_keys 의 부산 공식 콘텐츠 번호(uc_seq). 예: AttractionService:288:ko → 288"""
    out = set()
    for k in (r.get("provenance") or {}).get("source_keys") or []:
        m = re.search(r":(\d+)", k)
        if m:
            out.add(m.group(1))
    return out


def food_lineage(c: dict) -> dict[str, str]:
    """부산 Food canonical 이 artifact 에 기록한 discovery/recovery lineage id → 기록된 필드명"""
    out: dict[str, str] = {}
    for i in c.get("discovery_candidate_ids") or []:
        out.setdefault(i, "discovery_candidate_ids")
    if c.get("canonical_discovery_id"):
        out.setdefault(c["canonical_discovery_id"], "canonical_discovery_id")
    ir = c.get("image_recovery_v1") or {}
    if ir.get("disc_id"):
        out.setdefault(ir["disc_id"], "image_recovery_v1.disc_id")
    for i in c.get("identity_removed_cids") or []:
        out.setdefault(i, "identity_removed_cids")
    return out


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

    def add(city: str, cid: str, decision: str, *, basis: str, main_id: int | None = None, tier: str, confidence: str,
            method: str, evidence: str, notes: str = "", legacy: str | None = None, twin_of: str | None = None,
            service_status: str = "ACTIVE") -> None:
        if basis in FORBIDDEN_BASIS:
            raise SystemExit(f"forbidden decision basis {basis} for {cid}")
        decisions.append({
            "city": city, "canonical_id": cid, "service_status": service_status,
            "main_city_spot_id": main_id, "decision": decision, "decision_basis": basis, "tier": tier, "confidence": confidence,
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
            add("gyeongju", c["candidate_id"], "MATCH_REPLACE", basis=BASIS_SOURCE_LINEAGE, main_id=mid, tier="TIER1", confidence="HIGH",
                method="source_key==candidate_id", evidence=f"city_spot_sources.source_key={c['candidate_id']}")
            main_cls[mid] = {"class": "ACTIVE_MATCHED", "canonical_id": c["candidate_id"]}
        else:
            add("gyeongju", c["candidate_id"], "EXCLUDED", basis=BASIS_SERVICE_STATUS, main_id=mid, tier="TIER1", confidence="HIGH",
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
    # artifact-explicit identity bridge 만 쓴다: canonical 이 기록한 lineage id(discovery_candidate_ids ·
    # canonical_discovery_id · image_recovery_v1.disc_id · identity_removed_cids) 가 Main legacy external_id 와 같을 때.
    # 이름·주소·좌표로 Main 행을 찾는 규칙(옛 TIER2)은 금지 — 동명 타지점(톤쇼우 광안리/부산대)을 Main 이 판단하지 않는다.
    for c in food_active:
        lin = food_lineage(c)
        hits = {ext_to_main[i]: f for i, f in lin.items() if i in ext_to_main}
        mids = sorted(set(hits))
        if len(mids) > 1:
            raise SystemExit(f"{c['canonical_id']}: lineage points to several Main rows {mids} — 사람이 본다")
        if mids:
            mid = mids[0]
            if mid not in main_food_unmatched:
                raise SystemExit(f"main#{mid} targeted twice (second: {c['canonical_id']})")
            fields = sorted({hits[mid]} | {f for i, f in lin.items() if i in ext_to_main and ext_to_main[i] == mid})
            add("busan", c["canonical_id"], "MATCH_REPLACE", basis=BASIS_SOURCE_LINEAGE, main_id=mid, tier="TIER1", confidence="HIGH",
                method="artifact_lineage_id==legacy_external_id", evidence=f"{[i for i in lin if i in ext_to_main and ext_to_main[i] == mid]} via {fields}",
                notes="legacy 좌표는 미검증(계약 §16) — canonical 좌표로 교체")
            main_cls[mid] = {"class": "ACTIVE_MATCHED", "canonical_id": c["canonical_id"], "evidence": f"artifact lineage {fields}"}
            main_food_unmatched.pop(mid, None)
        else:
            add("busan", c["canonical_id"], "NEW", basis=BASIS_SERVICE_STATUS, tier="NEW", confidence="HIGH",
                method="no_artifact_lineage_to_main", evidence="artifact lineage ∉ Main legacy external_id (이름/주소/좌표 bridge 불사용)")
    for mid, r in main_food_unmatched.items():
        cls = "EXCLUDED_FROM_SERVICE_REVIEW" if r["legacy_external_id"] else "LEGACY_ONLY_VALID"
        main_cls[mid] = {"class": cls, "canonical_id": None,
                         "notes": "historical busan-F, final Food 미선발 — 삭제·부활 금지" if r["legacy_external_id"] else "수동 입력 legacy — 대응 canonical 없음"}

    twin_resolution: list[dict] = []

    # ── 부산 NonFood ────────────────────────────────────────────────────────
    nf_all, sha = load_input("busan_nonfood")
    inputs_meta["busan_nonfood"] = {"rows": len(nf_all), "sha256": sha}
    nf = [r for r in nf_all if r.get("service_status") == "ACTIVE"]
    nf_by = {r["canonical_id"]: r for r in nf}
    # artifact provenance.source_keys 의 같은 uc_seq 를 공유하는 레코드 = 같은 source entity (artifact 자체 근거).
    seq_idx: dict[str, list[str]] = defaultdict(list)
    for r in sorted(nf, key=lambda x: x["canonical_id"]):
        for sq in sorted(uc_seqs(r)):
            seq_idx[sq].append(r["canonical_id"])
    parent: dict[str, str] = {}

    def find(x: str) -> str:
        while parent.get(x, x) != x:
            x = parent[x]
        return x

    for sq, ids in sorted(seq_idx.items()):
        for other in ids[1:]:
            a, b = find(ids[0]), find(other)
            if a != b:
                parent[b] = a
    groups: dict[str, list[str]] = defaultdict(list)
    for r in nf:
        groups[find(r["canonical_id"])].append(r["canonical_id"])
    twins: dict[str, str] = {}
    for members in groups.values():
        if len(members) < 2:
            continue
        # 대표 = artifact primary_source 역할(entity API 레코드 < 웹 페이지) → canonical_id 오름차순. identity 판단이 아니라 표기 선택.
        rep_id = sorted(members, key=lambda c: (PRIMARY_SOURCE_ROLE.get((nf_by[c].get("provenance") or {}).get("primary_source"), 9), c))[0]
        for m in members:
            if m == rep_id:
                continue
            twins[m] = rep_id
            shared = sorted(uc_seqs(nf_by[m]) & uc_seqs(nf_by[rep_id]))
            if not shared:
                raise SystemExit(f"twin without shared uc_seq: {m} / {rep_id}")
            twin_resolution.append({
                "city": "busan", "member_canonical_id": m, "representative_canonical_id": rep_id,
                "relation": "SAME_SOURCE_ENTITY", "decision_basis": BASIS_SOURCE_LINEAGE,
                "reason": f"artifact provenance.source_keys share uc_seq {shared}",
                "evidence": {"shared_uc_seq": shared,
                             "member_source_keys": sorted((nf_by[m].get("provenance") or {}).get("source_keys") or []),
                             "representative_source_keys": sorted((nf_by[rep_id].get("provenance") or {}).get("source_keys") or []),
                             "member_primary_source": (nf_by[m].get("provenance") or {}).get("primary_source"),
                             "representative_primary_source": (nf_by[rep_id].get("provenance") or {}).get("primary_source"),
                             "category_same": nf_by[m].get("category") == nf_by[rep_id].get("category")},
                "source_type": f"busan-{m.split('-')[1]}", "category": nf_by[m].get("category"), "confidence": "HIGH",
                "deterministic_rule": "artifact:shared_uc_seq_in_provenance.source_keys", "runtime_write": False,
                "notes": "artifact 가 같은 공식 콘텐츠 번호로 기록한 두 레코드 — 대표만 write, 이 행은 SKIP_TWIN",
            })
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
            add("busan", cid, "MATCH_REPLACE", basis=BASIS_MAIN_DECISION_TABLE, main_id=mid, tier="TIER2", confidence="HIGH",
                method="BUSAN_NONFOOD_DECISIONS(row-level human table)", evidence=BUSAN_NONFOOD_DECISIONS[mid][2],
                notes="자동 규칙이 아니라 행 단위 판정표 — Owner 가 재검토할 수 있게 basis 를 남긴다")
        elif cid in twins:
            add("busan", cid, "CONFIRMED_TWIN", basis=BASIS_SOURCE_LINEAGE, tier="SAME_SOURCE_ENTITY", confidence="HIGH",
                method="artifact:shared_uc_seq", evidence=f"shared uc_seq {sorted(uc_seqs(nf_by[cid]) & uc_seqs(nf_by[twins[cid]]))}",
                twin_of=twins[cid], notes="같은 source entity 의 두 번째 레코드 — 대표(twin_of)만 write, 이 행은 SKIP_TWIN")
        else:
            add("busan", cid, "NEW", basis=BASIS_SERVICE_STATUS, tier="NEW", confidence="HIGH", method="no_main_counterpart",
                evidence="Main nonfood 85 판정표에 대응 없음")

    # ── 서울 · 제주 · 전주 (Main 0) ─────────────────────────────────────────
    # 쌍둥이 탐지 없음: 이 세 artifact 에는 관계/중복 필드가 없고, artifact 가 둘 다 ACTIVE 로 둔 레코드는 둘 다 service entity 다.
    # 전주만 artifact 의 identity_review=True(REVIEW_REQUIRED 잔여) 를 그대로 보류한다.
    jeonju_handoff: list[dict] = []
    res_by_sid: dict[str, list[dict]] = defaultdict(list)
    res_by_kto: dict[str, list[dict]] = defaultdict(list)
    ident = json.loads(git_show(PINNED_INPUTS["jeonju"]["sha"], "data/jeonju-raw-collection-v1/jeonju-identity-resolution-v1.json").lstrip("\ufeff"))
    for rr in ident.get("resolutions") or []:
        res_by_sid[str(rr.get("official_sid"))].append(rr)
        res_by_kto[str(rr.get("kto_contentid"))].append(rr)
    for key, city, id_key, active_pred in [
        ("seoul", "seoul", "candidate_id", lambda r: r.get("service_status") == "ACTIVE"),
        ("jeju", "jeju", "candidate_id", lambda r: r.get("service_status") == "ACTIVE"),
        ("jeonju", "jeonju", "candidate_id", lambda r: r.get("final_status") == "ACTIVE_SERVICE"),
    ]:
        rows, sha = load_input(key)
        inputs_meta[key] = {"rows": len(rows), "sha256": sha}
        act = [r for r in rows if active_pred(r)]
        act_ids = {r[id_key] for r in act}
        for r in sorted(act, key=lambda x: x[id_key]):
            cid = r[id_key]
            if city == "jeonju" and (r.get("identity_review") or cid in JEONJU_UNRESOLVED_AFTER_INSPECTION):
                own = bool(r.get("identity_review"))
                kto_cp = f"KTO-{r.get('kto_cid')}" if r.get("kto_cid") and cid.startswith("OFF-") else None
                off_cp = next((o for o in act_ids if o.startswith("OFF-") and by_kto_of(rows, o) == cid.replace("KTO-", "")), None) if cid.startswith("KTO-") else None
                verdicts = (res_by_sid.get(str(r.get("sid"))) if cid.startswith("OFF-") else res_by_kto.get(str(r.get("kto_cid")))) or []
                verdict_txt = "; ".join(f"{v.get('official_sid')}↔{v.get('kto_contentid')}:{v.get('classification')}({v.get('reason')})" for v in verdicts) or "(identity-resolution 에 없음)"
                reason = ("artifact identity_review=True · " + verdict_txt) if own else JEONJU_UNRESOLVED_AFTER_INSPECTION[cid]
                add(city, cid, "REVIEW_REQUIRED", basis=BASIS_IDENTITY_RESOLUTION if own else BASIS_UNRESOLVED,
                    tier="ARTIFACT_IDENTITY_REVIEW" if own else "UNRESOLVED_AFTER_ARTIFACT_INSPECTION", confidence="N/A",
                    method="artifact.identity_review" if own else "main_artifact_inspection", evidence=reason,
                    twin_of=kto_cp or off_cp,
                    notes="artifact 의 identity gate 잔여 — Main 은 병합·삭제·판정하지 않고 write 보류(SKIP_REVIEW_REQUIRED)")
                jeonju_handoff.append({
                    "canonical_id": cid, "source": r.get("source"), "source_id": r.get("sid") or r.get("kto_cid"),
                    "linked_counterpart_id": kto_cp or off_cp, "linked_kto_cid": r.get("kto_cid") or None,
                    "artifact_identity_review": bool(r.get("identity_review")), "artifact_match_type": r.get("match_type"),
                    "artifact_resolution": [{k: v.get(k) for k in ("official_sid", "kto_contentid", "classification", "reason", "dist_m")} for v in verdicts],
                    "current_service_status": r.get("final_status"), "name": r.get("display_name"),
                    "category": r.get("domain"), "subcategory": r.get("menu"), "phone": r.get("phone") or None,
                    "address": r.get("kto_addr"), "lat": r.get("lat"), "lng": r.get("lng"),
                    "source_url": r.get("source_url") or None, "provenance": {"artifact": "jeonju-final-service-catalog-v1", "sha": PINNED_INPUTS["jeonju"]["sha"], "coord_source": r.get("coord_source"), "name_source": r.get("name_source")},
                    "current_crosswalk": "REVIEW_REQUIRED (Main write 보류)",
                    "unresolved_reason": reason,
                    "main_added_unresolved": not own,
                    "required_final_verdict_enum": ["SAME_SOURCE_ENTITY", "DISTINCT_ENTITY", "DISTINCT_BRANCH", "CONTAINED_SUBENTITY", "KEEP_BOTH", "EXCLUDE_ONE", "OTHER_EXISTING_ARTIFACT_VERDICT"],
                    "note": "재수집 아님 — 이미 수집된 artifact 근거로 identity gate 마감만 요청",
                })
                continue
            add(city, cid, "NEW", basis=BASIS_SERVICE_STATUS, tier="NEW", confidence="HIGH",
                method="artifact_active_no_main_rows", evidence="artifact ACTIVE · Main city_spots city=0 · 쌍둥이 탐지 없음(관계 필드 없음)")

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
    # Owner override: 유지 확정 legacy 3곳(이기대 2행 포함) — id 보존 · published 유지 · 플래너 후보 포함
    for mid, why in OWNER_OVERRIDE_KEEP_PUBLISHED.items():
        prev = main_cls[mid]["class"]
        if prev != "LEGACY_ONLY_VALID":
            raise SystemExit(f"owner override #{mid} expected LEGACY_ONLY_VALID, got {prev}")
        main_cls[mid] = {**main_cls[mid], "class": "OWNER_OVERRIDE_KEEP_PUBLISHED", "previous_class": prev,
                         "decision_basis": BASIS_OWNER_OVERRIDE, "notes": why}
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
    write_jsonl(os.path.join(OUT_DIR, "jeonju-identity-review-handoff-v1.jsonl"), sorted(jeonju_handoff, key=lambda r: r["canonical_id"]))
    # 해제한 Main 휴리스틱 쌍둥이 — 이전 twin-resolution(a14ba83) 과의 차이를 기록한다
    prev_path = os.path.join(OUT_DIR, "five-city-core-heuristic-twin-release-v1.jsonl")
    released = []
    new_members = {r["member_canonical_id"] for r in twin_resolution}
    dec_by = {d["canonical_id"]: d for d in decisions}
    for cid, old in PREVIOUS_HEURISTIC_TWINS.items():
        if cid in new_members:
            continue
        d = dec_by[cid]
        released.append({"canonical_id": cid, "city": d["city"], "previous_relation": old["relation"], "previous_representative": old["rep"],
                         "previous_rule": old["rule"], "new_decision": d["decision"], "new_decision_basis": d["decision_basis"],
                         "release_reason": "artifact 에 명시적 identity/relation 근거 없음 — Main 휴리스틱(이름·주소·좌표) 판정 해제"})
    write_jsonl(prev_path, sorted(released, key=lambda r: (r["city"], r["canonical_id"])))
    summary = {
        "task": "TASK-FIVE-CITY-CORE-ARTIFACT-TRUST-AND-IDENTITY-CORRECTION-V1",
        "pins": pins, "inputs": inputs_meta,
        "active_total": len(active), "decisions_total": totals,
        "per_city": {c: dict(v) for c, v in sorted(per_city.items())},
        "artifact_trust": {
            "decision_basis": dict(Counter(d["decision_basis"] for d in decisions)),
            "heuristic_twin_auto_merge_count": 0,
            "artifact_evidenceless_skip_count": sum(1 for d in active if d["decision"] == "CONFIRMED_TWIN" and d["decision_basis"] != BASIS_SOURCE_LINEAGE),
            "twin_relations": dict(Counter(r["relation"] for r in twin_resolution)),
            "heuristic_twins_released": len(released),
            "SOURCE_ACTIVE_RECORD_COUNT": len(active),
            "ARTIFACT_CONFIRMED_SAME_ENTITY_SKIP_COUNT": totals.get("CONFIRMED_TWIN", 0),
            "REVIEW_REQUIRED_COUNT": totals.get("REVIEW_REQUIRED", 0),
            "jeonju_identity_review_count": sum(1 for d in active if d["decision"] == "REVIEW_REQUIRED" and d["decision_basis"] == BASIS_IDENTITY_RESOLUTION),
            "jeonju_main_added_unresolved": sum(1 for d in active if d["decision"] == "REVIEW_REQUIRED" and d["decision_basis"] == BASIS_UNRESOLVED),
            "ACTIVE_DISTINCT_COUNT": len(active) - totals.get("CONFIRMED_TWIN", 0),
            "WRITEABLE_ACTIVE_COUNT": totals.get("MATCH_REPLACE", 0) + totals.get("NEW", 0),
        },
        "owner_override_keep_published": sorted(OWNER_OVERRIDE_KEEP_PUBLISHED),
        "existing_id_preserved": len(matched_ids),
        "id_change_required": 0, "delete_decisions": 0,
        "main_714_classification": dict(main_counts),
        "busan_food_tier1": sum(1 for d in active if d["city"] == "busan" and d["canonical_id"].startswith("busan-G-") and d["tier"] == "TIER1"),
    }
    write_json(os.path.join(OUT_DIR, "five-city-core-crosswalk-summary-v1.json"), summary)
    print(json.dumps(summary, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
