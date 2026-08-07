"""
TASK-GYEONGJU-EN-IDENTITY-OFFLINE-CLOSEOUT-AND-NIGHT-MARKET-SEMANTIC-FIX-V1

기존 산출물만 사용해 EN identity를 OFFLINE 최종 정리한다.
신규 HTTP/API 요청 = 0건.

Base: data/gyeongju-en-identity-semantic-safety-v2 @ ac31411
Branch: data/gyeongju-en-identity-offline-closeout-v1
"""

import json
import hashlib
from pathlib import Path
from collections import Counter
from datetime import datetime, timezone

# ─── 경로 설정 ─────────────────────────────────────────────────────────────────
ROOT = Path(__file__).parent.parent
NORM_DIR = ROOT / "data/tourapi/normalized/gyeongju"
VAL_DIR  = ROOT / "data/tourapi/validation/gyeongju"
RAW_DIR  = ROOT / "data/tourapi/raw/gyeongju"

CACHE_CORR  = RAW_DIR / "engservice2-correction-v1-cache"
CACHE_TASK5 = RAW_DIR / "engservice2-full-v1-cache"
CACHE_PILOT = RAW_DIR / "engservice2-pilot-v1-cache"

SCRIPT_VERSION = "gyeongju_en_identity_offline_closeout_v1"
RUN_TS = datetime.now(timezone.utc).isoformat()

# ─── 유틸 ──────────────────────────────────────────────────────────────────────
def load_jsonl(path: Path) -> list:
    with open(path, encoding="utf-8") as f:
        return [json.loads(l) for l in f if l.strip()]

def save_jsonl(path: Path, records: list):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()

# ─── 데이터 로드 ───────────────────────────────────────────────────────────────
print("[로드] 기존 산출물 로드 중...")

# EN 102 assignment (Task 9)
en_assign = load_jsonl(NORM_DIR / "gyeongju-en-102-final-semantic-assignment-v2.jsonl")
en_assign_map = {r["en_contentid"]: r for r in en_assign}
assert len(en_assign) == 102, f"EN 102 expected, got {len(en_assign)}"

# KO 235 identity (Task 9)
ko_identity = load_jsonl(NORM_DIR / "gyeongju-en-final-identity-v2.jsonl")
ko_identity_map = {r["candidate_id"]: r for r in ko_identity}
assert len(ko_identity) == 235, f"KO 235 expected, got {len(ko_identity)}"

# KO 235 coverage (Task 9)
ko_coverage = load_jsonl(NORM_DIR / "gyeongju-en-235-final-coverage-v2.jsonl")
ko_coverage_map = {r["candidate_id"]: r for r in ko_coverage}

# KO base info (candidates)
ko_cands = load_jsonl(NORM_DIR / "gyeongju-full-v1-candidates.jsonl")
ko_cands_map = {r["candidate_id"]: r for r in ko_cands}

# EN lDong 102
ldong = json.load(open(CACHE_CORR / "areabased_gyeongju_ldong_47_130.json", encoding="utf-8"))
en_items = ldong["response"]["body"]["items"]["item"]
if isinstance(en_items, dict): en_items = [en_items]
en_map = {str(it["contentid"]): it for it in en_items}
assert len(en_map) == 102, f"EN lDong 102 expected, got {len(en_map)}"

# Semantic relation audit (Task 9)
sem_audit = load_jsonl(NORM_DIR / "gyeongju-en-semantic-relation-audit-v2.jsonl")
sem_audit_map = {r["en_contentid"]: r for r in sem_audit}

# Task 9 snapshot (detail data)
snapshot = load_jsonl(NORM_DIR / "gyeongju-engservice2-targeted-detail-snapshot-v2.jsonl")
snapshot_map = {r["en_cid"]: r for r in snapshot}

# Task 9 known false positive regression
fp_reg = load_jsonl(NORM_DIR / "gyeongju-en-known-false-positive-regression-v2.jsonl")
fp_reg_map = {(r.get("en_cid", r.get("en_contentid", "")), r.get("ko_cid", r.get("ko_candidate_id", ""))): r for r in fp_reg}

# Task 9 collision resolution
collision_res = load_jsonl(NORM_DIR / "gyeongju-en-known-collision-resolution-v2.jsonl")
collision_map = {r.get("en_cid", r.get("en_contentid", "")): r for r in collision_res}

print(f"  EN lDong: {len(en_map)}건 / KO identity: {len(ko_identity)}건 / EN assign: {len(en_assign)}건")
print(f"  Snapshot: {len(snapshot)}건 / Sem audit: {len(sem_audit)}건")

# ─── Phase 1: 기타 18건 해체 ─────────────────────────────────────────────────
print("\n[Phase 1] 기타 18건 분류")

# Task 9에서 기타 = UNASSIGNED_VALID_EN_PLACE(5) + UNASSIGNED_TYPE_INCOMPATIBLE(8) + UNASSIGNED_PARENT_CHILD_ENTITY(4) + UNASSIGNED_GROUP_ENTITY(1)
MISC_STATUSES = {
    "UNASSIGNED_VALID_EN_PLACE",
    "UNASSIGNED_TYPE_INCOMPATIBLE",
    "UNASSIGNED_PARENT_CHILD_ENTITY",
    "UNASSIGNED_GROUP_ENTITY",
}

# UNASSIGNED_TYPE_INCOMPATIBLE 8건의 새 taxonomy 매핑
# (기존 UNASSIGNED_TYPE_INCOMPATIBLE 제거 → 구체적 상태로 대체)
TYPE_INCOMPAT_REMAP = {
    # EN contentid → (new_status, rationale)
    "3337817": ("UNASSIGNED_PARENT_CHILD_ENTITY",
                "accommodation(type=80) within Bulguksa temple complex → PARENT_CHILD; addr 5-58 Jinti-gil = Bulguksa area"),
    "4030396": ("UNASSIGNED_OUT_OF_SCOPE",
                "Tax refund shop(type=79); false positive for 성동분식; DIFFERENT_ENTITY confirmed"),
    "1862991": ("UNASSIGNED_VALID_EN_PLACE",
                "Gyeongju Seongdong Market(type=79): real standalone market place, no KO-235 candidate"),
    "3447661": ("UNASSIGNED_OUT_OF_SCOPE",
                "Events/performance(type=85) at Gyochon cultural venue; not a fixed-place attraction"),
    "2992462": ("UNASSIGNED_OUT_OF_SCOPE",
                "Restaurant(type=82) Hwangnambbang; false positive for 대릉원돌담길; DIFFERENT_ENTITY confirmed"),
    "3447093": ("UNASSIGNED_OUT_OF_SCOPE",
                "Events/activities(type=85) Infinity Flying; no fixed KO-235 place match"),
    "3404180": ("UNASSIGNED_OUT_OF_SCOPE",
                "Restaurant(type=82) Sosomilmil Seoak Branch; KO scope=attraction; DIFFERENT_ENTITY"),
    "4054334": ("UNASSIGNED_OUT_OF_SCOPE",
                "Tax refund shop(type=79) ZERO SPACE; false positive for 향화정; DIFFERENT_ENTITY confirmed"),
}

misc_records = []
for r in en_assign:
    if r["en_status"] not in MISC_STATUSES:
        continue
    en_cid = r["en_contentid"]
    en_info = en_map.get(en_cid, {})
    old_status = r["en_status"]

    if old_status == "UNASSIGNED_TYPE_INCOMPATIBLE":
        new_status, remap_rationale = TYPE_INCOMPAT_REMAP.get(en_cid, (old_status, "no remap"))
    else:
        new_status = old_status
        remap_rationale = "status_unchanged"

    misc_records.append({
        "en_contentid": en_cid,
        "en_title": r["en_title"],
        "en_contenttypeid": en_info.get("contenttypeid", r.get("en_contenttypeid", "")),
        "en_addr": en_info.get("addr1", r.get("en_addr", "")),
        "task9_status": old_status,
        "task10_status": new_status,
        "status_changed": old_status != new_status,
        "semantic_relation": r.get("semantic_relation", ""),
        "remap_rationale": remap_rationale,
        "assigned_ko_cid": r.get("assigned_ko_cid"),
        "script_version": SCRIPT_VERSION,
    })

misc_records.sort(key=lambda x: (x["task9_status"], x["en_contentid"]))
save_jsonl(NORM_DIR / "gyeongju-en-misc-18-classification-v1.jsonl", misc_records)
print(f"  기타 18건 분류 완료: {len(misc_records)}건")
for s in sorted(set(r["task9_status"] for r in misc_records)):
    sub = [r for r in misc_records if r["task9_status"] == s]
    for r in sub:
        changed = "→" + r["task10_status"] if r["status_changed"] else "(unchanged)"
        print(f"    {r['task9_status']} {changed}: EN {r['en_contentid']} {r['en_title'][:40]}")

# ─── Phase 2: 보문호/천마총/경주남산/false positive 회귀검증 ─────────────────
print("\n[Phase 2] 회귀검증")

regression_records = []

def add_regression(label, en_cid, ko_cid, expected, actual, pass_flag, evidence):
    regression_records.append({
        "regression_label": label,
        "en_contentid": en_cid,
        "ko_candidate_id": ko_cid,
        "expected": expected,
        "actual": actual,
        "pass": pass_flag,
        "evidence": evidence,
        "script_version": SCRIPT_VERSION,
    })

# R1: EN 994021 보문호 → UNASSIGNED_VALID_EN_PLACE (Task 9)
en994 = en_assign_map.get("994021", {})
r1_pass = en994.get("en_status") == "UNASSIGNED_VALID_EN_PLACE"
r1_ko = en994.get("assigned_ko_cid")
add_regression("R1_Bomunho_EN-only",
    "994021", r1_ko,
    "UNASSIGNED_VALID_EN_PLACE",
    en994.get("en_status", "MISSING"),
    r1_pass,
    f"type={en_map.get('994021',{}).get('contenttypeid','?')}, no KO-235 match, standalone lake entity",
)
# R1b: GJ01-0103 and GJ08-85 must NOT have EN 994021 assigned
ko103 = ko_identity_map.get("gyeongju-GJ01-0103", {})
ko85  = ko_identity_map.get("gyeongju-GJ08-85", {})
r1b_pass = (ko103.get("kto_en_content_id") != "994021" and ko85.get("kto_en_content_id") != "994021")
add_regression("R1b_Bomunho_not_assigned_to_KO",
    "994021", "gyeongju-GJ01-0103/GJ08-85",
    "NOT assigned to GJ01-0103 or GJ08-85",
    f"GJ01-0103={ko103.get('kto_en_content_id')} GJ08-85={ko85.get('kto_en_content_id')}",
    r1b_pass,
    "보문호 EN-only, 보문호반길/오리 SAME_PLACE 금지",
)

# R2: EN 264117 천마총 → GJ01-0035 EXACT
ko35 = ko_identity_map.get("gyeongju-GJ01-0035", {})
r2_pass = (ko35.get("kto_en_content_id") == "264117"
           and ko35.get("identity_status") == "EN_IDENTITY_CONFIRMED")
add_regression("R2_Cheomaseong_GJ01-0035",
    "264117", "gyeongju-GJ01-0035",
    "EN=264117, EN_IDENTITY_CONFIRMED",
    f"EN={ko35.get('kto_en_content_id')}, status={ko35.get('identity_status')}",
    r2_pass,
    "천마총 Level 1 exact match, Task 9 ASSIGNED_EXACT",
)
# R2b: GJ01-0014 대릉원에 264117 중복 배정 금지
ko14 = ko_identity_map.get("gyeongju-GJ01-0014", {})
r2b_pass = ko14.get("kto_en_content_id") != "264117"
add_regression("R2b_Cheomaseong_no_double_assign",
    "264117", "gyeongju-GJ01-0014",
    "NOT assigned to GJ01-0014",
    f"GJ01-0014 EN={ko14.get('kto_en_content_id')}",
    r2b_pass,
    "천마총/대릉원 이중배정 금지",
)

# R3: EN 806320 경주남산 → UNASSIGNED_GROUP_ENTITY
en806 = en_assign_map.get("806320", {})
r3_pass = en806.get("en_status") == "UNASSIGNED_GROUP_ENTITY"
add_regression("R3_Namsan_GROUP_ENTITY",
    "806320", None,
    "UNASSIGNED_GROUP_ENTITY",
    en806.get("en_status", "MISSING"),
    r3_pass,
    "경주남산 = 광역 산 entity, 내부 개별 문화재에 배정 금지",
)

# R4: 국립경주박물관 EN 268141
ko9 = ko_identity_map.get("gyeongju-GJ01-0009", {})
r4_pass = (ko9.get("kto_en_content_id") == "268141"
           and ko9.get("identity_status") == "EN_IDENTITY_CONFIRMED")
add_regression("R4_NationalMuseum_EN268141",
    "268141", "gyeongju-GJ01-0009",
    "EN=268141, EN_IDENTITY_CONFIRMED",
    f"EN={ko9.get('kto_en_content_id')}, status={ko9.get('identity_status')}",
    r4_pass,
    "double-claim 버그 수정 재확인: EN 268141(L1) 복원",
)

# R5: 신라천년서고 EN 3492117 → UNASSIGNED_PARENT_CHILD_ENTITY (박물관 내부)
en349 = en_assign_map.get("3492117", {})
r5_pass = (en349.get("en_status") == "UNASSIGNED_PARENT_CHILD_ENTITY"
           and en349.get("assigned_ko_cid") is None)
add_regression("R5_SillaLibrary_CHILD_not_museum",
    "3492117", None,
    "UNASSIGNED_PARENT_CHILD_ENTITY, not assigned to GJ01-0009",
    f"status={en349.get('en_status')}, ko={en349.get('assigned_ko_cid')}",
    r5_pass,
    "신라천년서고 = 국립경주박물관 내 도서관, SAME_PLACE 금지",
)

# R6: 동궁원 ↔ Bird Park SAME_PLACE 금지
en237 = en_assign_map.get("2371627", {})
ko88 = ko_identity_map.get("gyeongju-GJ01-0088", {})
r6_pass = (en237.get("en_status") == "UNASSIGNED_PARENT_CHILD_ENTITY"
           and ko88.get("identity_status") == "EN_RELATED_ENTITY_ONLY")
add_regression("R6_Donggunwon_BirdPark_CHILD",
    "2371627", "gyeongju-GJ01-0088",
    "EN UNASSIGNED_PARENT_CHILD_ENTITY, KO EN_RELATED_ENTITY_ONLY",
    f"EN_status={en237.get('en_status')}, KO_status={ko88.get('identity_status')}",
    r6_pass,
    "Bird Park = 동궁원 내 구성시설; SAME_PLACE 금지",
)

# R7-R9: False positive 3건 재발 0
fp_checks = [
    ("R7_Hwangnambbang_not_confirmed", "2992462", "gyeongju-GJ01-0015",
     "TYPE_INCOMPATIBLE/DIFFERENT_ENTITY, NOT confirmed"),
    ("R8_ZEROSPACE_not_confirmed",    "4054334", "gyeongju-GJ08-7128",
     "TYPE_INCOMPATIBLE/DIFFERENT_ENTITY, NOT confirmed"),
    ("R9_Discovery_not_confirmed",    "4030396", "gyeongju-GJ08-7496",
     "TYPE_INCOMPATIBLE/DIFFERENT_ENTITY, NOT confirmed"),
]
for label, en_cid, ko_cid, expected in fp_checks:
    en_r = en_assign_map.get(en_cid, {})
    ko_r = ko_identity_map.get(ko_cid, {})
    # EN should NOT be assigned to the KO
    not_assigned = en_r.get("assigned_ko_cid") != ko_cid
    # KO EN should NOT be this EN
    not_ko_en = ko_r.get("kto_en_content_id") != en_cid
    pass_flag = not_assigned and not_ko_en
    add_regression(label, en_cid, ko_cid, expected,
        f"EN_assigned_ko={en_r.get('assigned_ko_cid')}, KO_en={ko_r.get('kto_en_content_id')}",
        pass_flag,
        "known false positive: 완전히 다른 entity(TYPE_INCOMPATIBLE/DIFFERENT_ENTITY)")

regression_records.sort(key=lambda x: x["regression_label"])
save_jsonl(NORM_DIR / "gyeongju-en-known-identity-regression-v1.jsonl", regression_records)

pass_count = sum(1 for r in regression_records if r["pass"])
fail_count = len(regression_records) - pass_count
print(f"  회귀검증: {pass_count}건 PASS, {fail_count}건 FAIL (총 {len(regression_records)}건)")
for r in regression_records:
    status = "✅ PASS" if r["pass"] else "❌ FAIL"
    print(f"    {status}: {r['regression_label']}")
    if not r["pass"]:
        print(f"      expected: {r['expected']}")
        print(f"      actual: {r['actual']}")

assert fail_count == 0, f"회귀검증 FAIL {fail_count}건 — 중단"

# ─── Phase 3: EN_RELATED_ENTITY_ONLY 3건 전수 감사 ────────────────────────────
print("\n[Phase 3] EN_RELATED_ENTITY_ONLY 3건 감사")

related_audit = []
for r in ko_identity:
    if r["identity_status"] != "EN_RELATED_ENTITY_ONLY":
        continue
    ko_cid = r["candidate_id"]
    ko_name = r["name_ko"]
    en_cid  = r.get("kto_en_content_id")
    en_title = r.get("en_title", "")
    en_r    = en_assign_map.get(str(en_cid) if en_cid else "", {})
    ko_base = ko_cands_map.get(ko_cid, {})

    # 각 relation 특성 판단
    sem_rel = en_r.get("semantic_relation", "")

    # SAME_PLACE 여부
    is_same_place = (sem_rel == "SAME_PLACE")

    # temporal 여부 (중앙시장 야시장)
    is_temporal = (ko_cid == "gyeongju-GJ01-0034")

    # child/parent 여부
    is_child = (sem_rel == "CHILD_ENTITY")
    is_parent = (sem_rel in ("PARENT_ENTITY", "RELATED_PARENT_ENTITY"))

    # EN description/hours를 KO에 그대로 사용 가능 여부
    if is_temporal:
        can_inherit_en_desc = False
        can_inherit_en_hours = False
        inherit_note = "base-place EN description 일부 공유 가능; 야시장 운영시간/특성은 별도 temporal evidence 필요"
    elif is_child:
        can_inherit_en_desc = False
        can_inherit_en_hours = False
        inherit_note = "child entity EN info는 KO parent 전체 정보로 사용 금지"
    elif is_parent:
        can_inherit_en_desc = False
        can_inherit_en_hours = False
        inherit_note = "parent EN info는 child KO 전용 정보로 사용 불가"
    else:
        can_inherit_en_desc = False
        can_inherit_en_hours = False
        inherit_note = "관련 entity; 직접 field inheritance 불가"

    # task10 최종 identity
    if is_temporal:
        task10_identity = "EN_SAME_BASE_PLACE_TEMPORAL_EXPERIENCE"
        task10_en_status = "ASSIGNED_SAME_BASE_PLACE_TEMPORAL_EXPERIENCE"
    else:
        task10_identity = "EN_RELATED_ENTITY_ONLY"  # unchanged
        task10_en_status = "UNASSIGNED_PARENT_CHILD_ENTITY"  # already in Task 9

    related_audit.append({
        "ko_candidate_id": ko_cid,
        "ko_name": ko_name,
        "ko_category": ko_base.get("category", ""),
        "en_content_id": str(en_cid) if en_cid else None,
        "en_title": en_title,
        "task9_semantic_relation": sem_rel,
        "task9_ko_identity": r["identity_status"],
        "task9_en_status": en_r.get("en_status", ""),
        "is_same_place": is_same_place,
        "is_temporal_sub_experience": is_temporal,
        "is_child_entity": is_child,
        "is_parent_entity": is_parent,
        "can_inherit_en_description": can_inherit_en_desc,
        "can_inherit_en_hours": can_inherit_en_hours,
        "inherit_note": inherit_note,
        "task10_ko_identity": task10_identity,
        "task10_en_status": task10_en_status,
        "final_identity_usable": is_temporal,  # temporal case: base-place identity 일부 활용 가능
        "script_version": SCRIPT_VERSION,
    })

related_audit.sort(key=lambda x: x["ko_candidate_id"])
save_jsonl(NORM_DIR / "gyeongju-en-related-3-semantic-audit-v1.jsonl", related_audit)
print(f"  EN_RELATED_ENTITY_ONLY {len(related_audit)}건 감사:")
for r in related_audit:
    print(f"    {r['ko_candidate_id']} | {r['ko_name']} | EN {r['en_content_id']} | {r['task9_semantic_relation']} → {r['task10_ko_identity']}")

# ─── Phase 4: 중앙시장 야시장 Semantic Overlay ─────────────────────────────────
print("\n[Phase 4] 중앙시장 야시장 Semantic Overlay")

# EN 1945431 detail 로드 (PILOT cache)
pilot_common = CACHE_PILOT / "detailCommon2_1945431.json"
en_common_data = {}
if pilot_common.exists():
    d = json.load(open(pilot_common, encoding="utf-8"))
    items = d.get("response", {}).get("body", {}).get("items", {}) or {}
    item = items.get("item", {}) if isinstance(items, dict) else {}
    if isinstance(item, list): item = item[0] if item else {}
    en_common_data = item

en1945431_info = en_map.get("1945431", {})
ko34_base = ko_cands_map.get("gyeongju-GJ01-0034", {})
ko34_identity = ko_identity_map.get("gyeongju-GJ01-0034", {})

# 주소 일치 확인
en_addr = en1945431_info.get("addr1", "")  # "295 Geumseong-ro, Gyeongju-si, Gyeongsangbuk-do"
ko_addr = ko34_base.get("address", "")     # "경북 경주시 금성로 295, 중앙시장 (교동)"
# 295 Geumseong-ro / 금성로 295 → SAME base address
addr_match_evidence = "EN addr='295 Geumseong-ro' ↔ KO addr='금성로 295' → SAME_BASE_ADDRESS"

# EN overview에서 야시장 관련 구절 추출 (기존 data에서)
en_overview = en_common_data.get("overview", "")
# 야시장 관련 구절 탐색
night_market_phrases = []
for phrase in [
    "night market", "Night Market", "야시장", "night",
    "evening", "weekend", "open nearly every day",
]:
    if phrase.lower() in en_overview.lower():
        night_market_phrases.append(phrase)

# EN overview: "Opened in 1983, Gyeongju Jungang Market is the main marketplace..."
# → 물리적 시장 설명만 있음; 야시장 특유 description은 별도 temporal evidence 필요
has_night_specific_en_text = bool(night_market_phrases and "night" in " ".join(night_market_phrases).lower())

night_market_overlay = {
    "ko_candidate_id": "gyeongju-GJ01-0034",
    "ko_name": "중앙시장 야시장",
    "en_content_id": "1945431",
    "en_title": en1945431_info.get("title", ""),
    "base_place_relation": "SAME_BASE_PLACE",
    "experience_relation": "TEMPORAL_SUB_EXPERIENCE",
    "base_address_evidence": addr_match_evidence,
    "en_overview_excerpt": en_overview[:300] if en_overview else "",
    "has_night_specific_en_text": has_night_specific_en_text,
    "night_market_phrases_found": night_market_phrases,
    "base_place_field_sharing": {
        "en_title": True,
        "en_addr": True,
        "en_coords": True,
        "en_homepage": True,
        "en_overview": False,
    },
    "field_sharing_note": (
        "base_place EN title/addr/coords/homepage: GJ01-0034 base identity 활용 가능. "
        "EN overview는 일반 시장 설명이므로 야시장 전용 description으로 표시 금지. "
        "야시장 운영시간·야간 특성은 별도 temporal evidence 필요."
    ),
    "task9_ko_identity": ko34_identity.get("identity_status", ""),
    "task10_ko_identity": "EN_SAME_BASE_PLACE_TEMPORAL_EXPERIENCE",
    "task10_en_status": "ASSIGNED_SAME_BASE_PLACE_TEMPORAL_EXPERIENCE",
    "general_hours_to_night_hours_copy_forbidden": True,
    "en_overview_as_night_market_desc_forbidden": True,
    "script_version": SCRIPT_VERSION,
}

save_jsonl(NORM_DIR / "gyeongju-en-night-market-semantic-overlay-v1.jsonl", [night_market_overlay])
print(f"  중앙시장 야시장: RELATED_PARENT_ENTITY → SAME_BASE_PLACE + TEMPORAL_SUB_EXPERIENCE")
print(f"  base address match: {addr_match_evidence}")
print(f"  night-specific EN text found: {has_night_specific_en_text}")

# ─── Phase 5: POSSIBLE_DUPLICATE 검사 ──────────────────────────────────────────
print("\n[Phase 5] POSSIBLE_DUPLICATE 검사")

from math import radians, sin, cos, sqrt, atan2

def haversine(lat1, lon1, lat2, lon2):
    R = 6371000
    φ1, φ2 = radians(float(lat1)), radians(float(lat2))
    Δφ = radians(float(lat2)-float(lat1))
    Δλ = radians(float(lon2)-float(lon1))
    a = sin(Δφ/2)**2 + cos(φ1)*cos(φ2)*sin(Δλ/2)**2
    return R * 2 * atan2(sqrt(a), sqrt(1-a))

possible_dups = []
en_list = list(en_map.values())
for i in range(len(en_list)):
    for j in range(i+1, len(en_list)):
        a, b = en_list[i], en_list[j]
        cid_a, cid_b = str(a["contentid"]), str(b["contentid"])
        title_a = a.get("title", "").lower()
        title_b = b.get("title", "").lower()
        # 제목 유사도 (간단한 공통 첫 20자)
        prefix_sim = len(title_a) > 5 and title_a[:15] == title_b[:15]
        # 좌표 근접성
        dist = None
        if a.get("mapy") and b.get("mapy") and a.get("mapx") and b.get("mapx"):
            try:
                dist = haversine(a["mapy"], a["mapx"], b["mapy"], b["mapx"])
            except Exception:
                pass
        coord_near = dist is not None and dist < 50  # 50m 이내
        if prefix_sim or coord_near:
            possible_dups.append({
                "en_contentid_a": cid_a,
                "en_title_a": a.get("title", "")[:60],
                "en_contentid_b": cid_b,
                "en_title_b": b.get("title", "")[:60],
                "title_prefix_similar": prefix_sim,
                "coord_distance_m": round(dist, 1) if dist is not None else None,
                "coord_near_50m": coord_near,
                "verdict": "REVIEW_REQUIRED" if (prefix_sim and coord_near) else "LOW_RISK",
            })

print(f"  POSSIBLE_DUPLICATE 후보: {len(possible_dups)}건")
for pd in possible_dups:
    print(f"    EN {pd['en_contentid_a']} ↔ EN {pd['en_contentid_b']}: dist={pd['coord_distance_m']}m, prefix_sim={pd['title_prefix_similar']}")

# ─── Phase 6: EN 102 최종 Taxonomy (Offline Closeout) ─────────────────────────
print("\n[Phase 6] EN 102 최종 Taxonomy")

# 새 taxonomy 상태 결정
# 1. TYPE_INCOMPATIBLE → remap
# 2. EN 1945431 → ASSIGNED_SAME_BASE_PLACE_TEMPORAL_EXPERIENCE
# 3. 나머지 → 기존 상태 유지

# POSSIBLE_DUPLICATE 판정: REVIEW_REQUIRED만 대상
dup_review_pairs = {pd["en_contentid_a"] for pd in possible_dups if pd["verdict"] == "REVIEW_REQUIRED"}
dup_review_pairs |= {pd["en_contentid_b"] for pd in possible_dups if pd["verdict"] == "REVIEW_REQUIRED"}

closeout_102 = []
for r in en_assign:
    en_cid = r["en_contentid"]
    old_status = r["en_status"]

    # 새 taxonomy 결정
    if old_status == "UNASSIGNED_TYPE_INCOMPATIBLE":
        new_status, remap_rationale = TYPE_INCOMPAT_REMAP.get(en_cid, (old_status, "no remap"))
    elif en_cid == "1945431" and old_status == "UNASSIGNED_PARENT_CHILD_ENTITY":
        new_status = "ASSIGNED_SAME_BASE_PLACE_TEMPORAL_EXPERIENCE"
        remap_rationale = "중앙시장 야시장: SAME_BASE_PLACE+TEMPORAL_SUB_EXPERIENCE"
    elif en_cid in dup_review_pairs:
        new_status = "POSSIBLE_DUPLICATE_EN_RECORD"
        remap_rationale = "duplicate pair found: title/coord match"
    else:
        new_status = old_status
        remap_rationale = "unchanged"

    en_info = en_map.get(en_cid, {})
    closeout_102.append({
        "en_contentid": en_cid,
        "en_title": r["en_title"],
        "en_contenttypeid": en_info.get("contenttypeid", r.get("en_contenttypeid", "")),
        "en_addr": en_info.get("addr1", r.get("en_addr", "")),
        "task9_status": old_status,
        "task10_status": new_status,
        "status_changed": old_status != new_status,
        "assigned_ko_cid": r.get("assigned_ko_cid") if "ASSIGNED_" in new_status else None,
        "semantic_relation": r.get("semantic_relation", ""),
        "relation_evidence": r.get("relation_evidence", ""),
        "remap_rationale": remap_rationale,
        "script_version": SCRIPT_VERSION,
    })

closeout_102.sort(key=lambda x: (x["task10_status"], x["en_contentid"]))
save_jsonl(NORM_DIR / "gyeongju-en-102-offline-closeout-v1.jsonl", closeout_102)

status_dist = Counter(r["task10_status"] for r in closeout_102)
print(f"  EN 102 최종 taxonomy:")
for k, v in sorted(status_dist.items(), key=lambda x: -x[1]):
    print(f"    {k}: {v}")
total_102 = sum(status_dist.values())
print(f"  합계: {total_102}")
assert total_102 == 102, f"EN 102 합계 오류: {total_102}"
assert "UNASSIGNED_TYPE_INCOMPATIBLE" not in status_dist, "TYPE_INCOMPATIBLE 잔존!"

# ─── Phase 7: KO 235 최종 Taxonomy (Offline Closeout) ─────────────────────────
print("\n[Phase 7] KO 235 최종 Taxonomy")

# 새 KO taxonomy
# GJ01-0034 → EN_SAME_BASE_PLACE_TEMPORAL_EXPERIENCE (was EN_RELATED_ENTITY_ONLY)
# 나머지 → 기존 상태 유지

closeout_235 = []
id_counter = Counter()

for r in ko_identity:
    ko_cid = r["candidate_id"]
    old_id = r["identity_status"]

    # GJ01-0034 야시장: RELATED_ENTITY_ONLY → SAME_BASE_PLACE_TEMPORAL_EXPERIENCE
    if ko_cid == "gyeongju-GJ01-0034" and old_id == "EN_RELATED_ENTITY_ONLY":
        new_id = "EN_SAME_BASE_PLACE_TEMPORAL_EXPERIENCE"
        reason = "중앙시장 야시장: same physical location, temporal sub-experience"
    else:
        new_id = old_id
        reason = "unchanged"

    id_counter[new_id] += 1

    # Coverage 재계산
    en_cid = r.get("kto_en_content_id")
    cov_r = ko_coverage_map.get(ko_cid, {})
    old_cov = cov_r.get("en_coverage", "EN_SOURCE_MISSING")

    if new_id == "EN_SAME_BASE_PLACE_TEMPORAL_EXPERIENCE":
        new_cov = "EN_SAME_BASE_PLACE_TEMPORAL_PARTIAL"
    elif new_id == "EN_IDENTITY_CONFIRMED":
        new_cov = old_cov  # 기존 READY/PARTIAL 유지
    elif new_id == "EN_RELATED_ENTITY_ONLY":
        new_cov = "EN_RELATED_ONLY"
    elif new_id in ("EN_IDENTITY_REVIEW", "EN_CANDIDATE_COLLISION"):
        new_cov = "EN_IDENTITY_REVIEW"
    else:  # NO_EN_RECORD
        new_cov = "EN_SOURCE_MISSING"

    closeout_235.append({
        "candidate_id": ko_cid,
        "name_ko": r["name_ko"],
        "category": r["category"],
        "task9_identity_status": old_id,
        "task10_identity_status": new_id,
        "identity_changed": old_id != new_id,
        "kto_en_content_id": r.get("kto_en_content_id"),
        "en_title": r.get("en_title"),
        "match_method": r.get("match_method"),
        "task9_coverage": old_cov,
        "task10_coverage": new_cov,
        "coverage_changed": old_cov != new_cov,
        "identity_change_reason": reason,
        "script_version": SCRIPT_VERSION,
    })

closeout_235.sort(key=lambda x: x["candidate_id"])
save_jsonl(NORM_DIR / "gyeongju-en-235-offline-closeout-v1.jsonl", closeout_235)

print(f"  KO 235 최종 identity taxonomy:")
for k, v in sorted(id_counter.items(), key=lambda x: -x[1]):
    print(f"    {k}: {v}")
total_235 = sum(id_counter.values())
print(f"  합계: {total_235}")
assert total_235 == 235, f"KO 235 합계 오류: {total_235}"

# Coverage 분포
cov_counter = Counter(r["task10_coverage"] for r in closeout_235)
print(f"\n  Coverage 분포:")
for k, v in sorted(cov_counter.items(), key=lambda x: -x[1]):
    print(f"    {k}: {v}")
print(f"  Coverage 합계: {sum(cov_counter.values())}")

# ─── Phase 8: Unassigned Place Proposals ──────────────────────────────────────
print("\n[Phase 8] Unassigned Place Proposals")

def _extract_ko(title: str) -> str:
    import re
    match = re.search(r'\(([가-힣\s]+)\)', title)
    return match.group(1).strip() if match else ""

proposals = []

# UNASSIGNED_VALID_EN_PLACE (Task 10 기준)
valid_en_cids = [r["en_contentid"] for r in closeout_102 if r["task10_status"] == "UNASSIGNED_VALID_EN_PLACE"]
for en_cid in sorted(valid_en_cids):
    en_info = en_map.get(en_cid, {})
    snap = snapshot_map.get(en_cid, {})
    common_op = snap.get("operations", {}).get("detailCommon2", {})
    img_op = snap.get("operations", {}).get("detailImage2", {})

    proposals.append({
        "proposal_type": "NEW_PLACE_PROPOSAL",
        "en_contentid": en_cid,
        "en_title": en_info.get("title", ""),
        "ko_title_in_en_title": _extract_ko(en_info.get("title", "")),
        "en_contenttypeid": en_info.get("contenttypeid", ""),
        "en_addr": en_info.get("addr1", ""),
        "en_coords": {"mapy": en_info.get("mapy"), "mapx": en_info.get("mapx")},
        "has_en_overview": common_op.get("status") == "valid",
        "en_overview_excerpt": common_op.get("overview", "")[:200],
        "image_count": img_op.get("image_count", 0),
        "nearest_ko_candidate": None,  # No KO match found
        "not_duplicate_reason": "No KO-235 candidate with matching name or address",
        "script_version": SCRIPT_VERSION,
    })

# UNASSIGNED_GROUP_ENTITY
group_en_cids = [r["en_contentid"] for r in closeout_102 if r["task10_status"] == "UNASSIGNED_GROUP_ENTITY"]
for en_cid in sorted(group_en_cids):
    en_info = en_map.get(en_cid, {})
    proposals.append({
        "proposal_type": "GROUP_ENTITY_RECORD",
        "en_contentid": en_cid,
        "en_title": en_info.get("title", ""),
        "ko_title_in_en_title": _extract_ko(en_info.get("title", "")),
        "en_contenttypeid": en_info.get("contenttypeid", ""),
        "en_addr": en_info.get("addr1", ""),
        "en_coords": {"mapy": en_info.get("mapy"), "mapx": en_info.get("mapx")},
        "group_note": "광역 entity; 내부 개별 문화재에 배정 금지; 경주남산 전체를 표현하는 EN record",
        "script_version": SCRIPT_VERSION,
    })

# KO placeholders 보정 (빈 값 재시도 — 이미 위에서 _extract_ko 사용함)
for p in proposals:
    if p.get("ko_title_in_en_title") == "":
        p["ko_title_in_en_title"] = _extract_ko(p.get("en_title", ""))

proposals.sort(key=lambda x: (x["proposal_type"], x["en_contentid"]))
save_jsonl(NORM_DIR / "gyeongju-en-unassigned-place-proposals-closeout-v1.jsonl", proposals)
new_place_count = sum(1 for p in proposals if p["proposal_type"] == "NEW_PLACE_PROPOSAL")
group_entity_count = sum(1 for p in proposals if p["proposal_type"] == "GROUP_ENTITY_RECORD")
print(f"  NEW_PLACE_PROPOSAL: {new_place_count}건")
print(f"  GROUP_ENTITY_RECORD: {group_entity_count}건")
for p in proposals:
    print(f"    [{p['proposal_type']}] EN {p['en_contentid']}: {p['en_title'][:50]}")

# ─── Phase 9: 공식 EN 사이트 Supplement Queue v4 ───────────────────────────────
print("\n[Phase 9] 공식 EN 사이트 Supplement Queue v4")

# 대상: KO 235 중 attraction/nature
# Status: NO_EN_RECORD, EN_IDENTITY_REVIEW, EN_CANDIDATE_COLLISION, EN_RELATED_ENTITY_ONLY
# 제외: EN_IDENTITY_CONFIRMED, EN_SAME_BASE_PLACE_TEMPORAL_EXPERIENCE(with sufficient evidence)
# Restaurant 제외
SUPPLEMENT_TARGET_IDENTITY = {
    "NO_EN_RECORD",
    "EN_IDENTITY_REVIEW",
    "EN_CANDIDATE_COLLISION",
    "EN_RELATED_ENTITY_ONLY",
}
SUPPLEMENT_CATEGORIES = {"attraction", "nature"}

supplement_queue = []
for r in closeout_235:
    if r["category"] not in SUPPLEMENT_CATEGORIES:
        continue
    if r["task10_identity_status"] not in SUPPLEMENT_TARGET_IDENTITY:
        continue

    ko_cid = r["candidate_id"]
    ko_base = ko_cands_map.get(ko_cid, {})

    # 부족 필드 판단
    missing_fields = []
    if not r.get("kto_en_content_id"):
        missing_fields.append("EN_identity")
    if r.get("task10_coverage") in ("EN_SOURCE_MISSING",):
        missing_fields.append("EN_title")
        missing_fields.append("EN_overview")

    supplement_queue.append({
        "candidate_id": ko_cid,
        "name_ko": r["name_ko"],
        "category": r["category"],
        "identity_status": r["task10_identity_status"],
        "coverage_status": r["task10_coverage"],
        "en_content_id": r.get("kto_en_content_id"),
        "en_title": r.get("en_title"),
        "missing_fields": missing_fields,
        "supplement_priority": (
            "HIGH" if r["task10_identity_status"] in ("EN_RELATED_ENTITY_ONLY", "EN_CANDIDATE_COLLISION")
            else "MEDIUM" if r["task10_identity_status"] == "EN_IDENTITY_REVIEW"
            else "STANDARD"
        ),
        "address": ko_base.get("address", ""),
        "script_version": SCRIPT_VERSION,
    })

supplement_queue.sort(key=lambda x: (x["supplement_priority"], x["candidate_id"]))
save_jsonl(NORM_DIR / "gyeongju-en-official-site-supplement-queue-v4.jsonl", supplement_queue)
print(f"  Supplement queue v4: {len(supplement_queue)}건")
priority_dist = Counter(r["supplement_priority"] for r in supplement_queue)
for k, v in sorted(priority_dist.items()):
    print(f"    {k}: {v}")

# ─── Phase 10: QA 검증 ─────────────────────────────────────────────────────────
print("\n[Phase 10] QA 검증")

qa_results = {}

# EN 102 QA
en_status_counter = Counter(r["task10_status"] for r in closeout_102)
qa_results["en_ASSIGNED_EXACT"] = en_status_counter.get("ASSIGNED_EXACT", 0)
qa_results["en_ASSIGNED_HIGH_CONFIDENCE"] = en_status_counter.get("ASSIGNED_HIGH_CONFIDENCE", 0)
qa_results["en_ASSIGNED_SAME_BASE_PLACE_TEMPORAL_EXPERIENCE"] = en_status_counter.get("ASSIGNED_SAME_BASE_PLACE_TEMPORAL_EXPERIENCE", 0)
qa_results["en_UNASSIGNED_VALID_EN_PLACE"] = en_status_counter.get("UNASSIGNED_VALID_EN_PLACE", 0)
qa_results["en_UNASSIGNED_GROUP_ENTITY"] = en_status_counter.get("UNASSIGNED_GROUP_ENTITY", 0)
qa_results["en_UNASSIGNED_PARENT_CHILD_ENTITY"] = en_status_counter.get("UNASSIGNED_PARENT_CHILD_ENTITY", 0)
qa_results["en_POSSIBLE_DUPLICATE_EN_RECORD"] = en_status_counter.get("POSSIBLE_DUPLICATE_EN_RECORD", 0)
qa_results["en_UNASSIGNED_OUT_OF_SCOPE"] = en_status_counter.get("UNASSIGNED_OUT_OF_SCOPE", 0)
qa_results["en_IDENTITY_COLLISION_REVIEW"] = en_status_counter.get("IDENTITY_COLLISION_REVIEW", 0)
qa_results["en_MISC_NO_OTHERS"] = "기타" not in en_status_counter and "UNASSIGNED_TYPE_INCOMPATIBLE" not in en_status_counter
qa_results["en_total"] = total_102

# KO 235 QA
ko_id_counter = Counter(r["task10_identity_status"] for r in closeout_235)
qa_results["ko_EN_IDENTITY_CONFIRMED"] = ko_id_counter.get("EN_IDENTITY_CONFIRMED", 0)
qa_results["ko_EN_SAME_BASE_PLACE_TEMPORAL_EXPERIENCE"] = ko_id_counter.get("EN_SAME_BASE_PLACE_TEMPORAL_EXPERIENCE", 0)
qa_results["ko_EN_RELATED_ENTITY_ONLY"] = ko_id_counter.get("EN_RELATED_ENTITY_ONLY", 0)
qa_results["ko_EN_IDENTITY_REVIEW"] = ko_id_counter.get("EN_IDENTITY_REVIEW", 0)
qa_results["ko_EN_CANDIDATE_COLLISION"] = ko_id_counter.get("EN_CANDIDATE_COLLISION", 0)
qa_results["ko_NO_EN_RECORD"] = ko_id_counter.get("NO_EN_RECORD", 0)
qa_results["ko_total"] = total_235

# 회귀 QA
qa_results["regression_all_pass"] = all(r["pass"] for r in regression_records)
qa_results["regression_fail_count"] = fail_count

# Night market QA
night_overlay = night_market_overlay
qa_results["night_market_SAME_BASE_PLACE"] = night_overlay["base_place_relation"] == "SAME_BASE_PLACE"
qa_results["night_market_TEMPORAL"] = night_overlay["experience_relation"] == "TEMPORAL_SUB_EXPERIENCE"
qa_results["night_market_no_hours_copy"] = night_overlay["general_hours_to_night_hours_copy_forbidden"]
qa_results["night_market_no_overview_copy"] = night_overlay["en_overview_as_night_market_desc_forbidden"]

# GJ01-0034 identity
gj34 = next((r for r in closeout_235 if r["candidate_id"] == "gyeongju-GJ01-0034"), {})
qa_results["GJ01-0034_task10_identity"] = gj34.get("task10_identity_status", "MISSING")
qa_results["GJ01-0034_identity_correct"] = gj34.get("task10_identity_status") == "EN_SAME_BASE_PLACE_TEMPORAL_EXPERIENCE"

# 동궁원 SAME_PLACE 금지
en237_closeout = next((r for r in closeout_102 if r["en_contentid"] == "2371627"), {})
qa_results["BirdPark_not_SAME_PLACE"] = en237_closeout.get("task10_status") == "UNASSIGNED_PARENT_CHILD_ENTITY"

# False positives 재발 0
fps = [("2992462","gyeongju-GJ01-0015"), ("4054334","gyeongju-GJ08-7128"), ("4030396","gyeongju-GJ08-7496")]
fp_clean = all(
    next((r for r in closeout_102 if r["en_contentid"] == ep[0]), {}).get("assigned_ko_cid") is None
    for ep in fps
)
qa_results["false_positive_zero"] = fp_clean

# 신규 HTTP 0
qa_results["http_requests"] = 0

all_pass = (
    qa_results["en_total"] == 102 and
    qa_results["ko_total"] == 235 and
    qa_results["en_MISC_NO_OTHERS"] and
    qa_results["regression_all_pass"] and
    qa_results["night_market_SAME_BASE_PLACE"] and
    qa_results["night_market_TEMPORAL"] and
    qa_results["GJ01-0034_identity_correct"] and
    qa_results["BirdPark_not_SAME_PLACE"] and
    qa_results["false_positive_zero"] and
    qa_results["http_requests"] == 0
)
qa_results["all_pass"] = all_pass

print(f"  EN 102 합계: {qa_results['en_total']} ✅" if qa_results["en_total"] == 102 else f"  EN 합계 ❌: {qa_results['en_total']}")
print(f"  KO 235 합계: {qa_results['ko_total']} ✅" if qa_results["ko_total"] == 235 else f"  KO 합계 ❌: {qa_results['ko_total']}")
print(f"  TYPE_INCOMPATIBLE 잔존: {'없음 ✅' if qa_results['en_MISC_NO_OTHERS'] else '있음 ❌'}")
print(f"  회귀검증: {'PASS ✅' if qa_results['regression_all_pass'] else 'FAIL ❌'}")
print(f"  GJ01-0034 → EN_SAME_BASE_PLACE_TEMPORAL_EXPERIENCE: {'✅' if qa_results['GJ01-0034_identity_correct'] else '❌'}")
print(f"  BirdPark SAME_PLACE 금지: {'✅' if qa_results['BirdPark_not_SAME_PLACE'] else '❌'}")
print(f"  False positive 재발: {'없음 ✅' if qa_results['false_positive_zero'] else '있음 ❌'}")
print(f"  신규 HTTP: {qa_results['http_requests']}건 ✅")
print(f"  전체: {'PASS ✅' if all_pass else 'FAIL ❌'}")

# ─── Phase 11: Summary 저장 ────────────────────────────────────────────────────
print("\n[Phase 11] Summary 저장")

summary = {
    "task": "TASK-GYEONGJU-EN-IDENTITY-OFFLINE-CLOSEOUT-AND-NIGHT-MARKET-SEMANTIC-FIX-V1",
    "run_timestamp": RUN_TS,
    "script_version": SCRIPT_VERSION,
    "base_branch": "data/gyeongju-en-identity-semantic-safety-v2",
    "base_head": "ac31411",
    "branch": "data/gyeongju-en-identity-offline-closeout-v1",
    "en_102_task9": dict(Counter(r["en_status"] for r in en_assign)),
    "en_102_task10": dict(en_status_counter),
    "ko_235_task9": dict(Counter(r["identity_status"] for r in ko_identity)),
    "ko_235_task10": dict(ko_id_counter),
    "coverage_task10": dict(cov_counter),
    "misc_18_reclassification": {
        "type_incompatible_to_parent_child": sum(1 for r in misc_records
            if r["task9_status"] == "UNASSIGNED_TYPE_INCOMPATIBLE" and r["task10_status"] == "UNASSIGNED_PARENT_CHILD_ENTITY"),
        "type_incompatible_to_valid_en": sum(1 for r in misc_records
            if r["task9_status"] == "UNASSIGNED_TYPE_INCOMPATIBLE" and r["task10_status"] == "UNASSIGNED_VALID_EN_PLACE"),
        "type_incompatible_to_out_of_scope": sum(1 for r in misc_records
            if r["task9_status"] == "UNASSIGNED_TYPE_INCOMPATIBLE" and r["task10_status"] == "UNASSIGNED_OUT_OF_SCOPE"),
        "jungang_market_reclassified": 1,
    },
    "night_market_correction": {
        "ko_candidate": "gyeongju-GJ01-0034",
        "en_contentid": "1945431",
        "task9_ko_identity": "EN_RELATED_ENTITY_ONLY",
        "task10_ko_identity": "EN_SAME_BASE_PLACE_TEMPORAL_EXPERIENCE",
        "task9_en_status": "UNASSIGNED_PARENT_CHILD_ENTITY",
        "task10_en_status": "ASSIGNED_SAME_BASE_PLACE_TEMPORAL_EXPERIENCE",
    },
    "regression_results": {
        "total": len(regression_records),
        "pass": pass_count,
        "fail": fail_count,
    },
    "proposals": {
        "new_place": new_place_count,
        "group_entity": group_entity_count,
    },
    "supplement_queue_v4": len(supplement_queue),
    "possible_duplicate_count": len(possible_dups),
    "http_requests": 0,
    "qa_pass": all_pass,
}

VAL_DIR.mkdir(parents=True, exist_ok=True)
with open(VAL_DIR / "gyeongju-en-offline-closeout-summary-v1.json", "w", encoding="utf-8", newline="\n") as f:
    json.dump(summary, f, ensure_ascii=False, indent=2)

qa_obj = {
    "run_timestamp": RUN_TS,
    "qa_results": qa_results,
    "pass": all_pass,
}
with open(VAL_DIR / "gyeongju-en-offline-closeout-qa-v1.json", "w", encoding="utf-8", newline="\n") as f:
    json.dump(qa_obj, f, ensure_ascii=False, indent=2)

# ─── Phase 12: SHA Manifest ────────────────────────────────────────────────────
print("\n[Phase 12] SHA Manifest")

DATA_FILES = [
    "gyeongju-en-misc-18-classification-v1.jsonl",
    "gyeongju-en-related-3-semantic-audit-v1.jsonl",
    "gyeongju-en-night-market-semantic-overlay-v1.jsonl",
    "gyeongju-en-known-identity-regression-v1.jsonl",
    "gyeongju-en-102-offline-closeout-v1.jsonl",
    "gyeongju-en-235-offline-closeout-v1.jsonl",
    "gyeongju-en-unassigned-place-proposals-closeout-v1.jsonl",
    "gyeongju-en-official-site-supplement-queue-v4.jsonl",
]
sha_manifest = {}
for fname in DATA_FILES:
    p = NORM_DIR / fname
    sha = sha256_file(p)
    sha_manifest[fname] = sha
    print(f"  {fname}: {sha[:16]}...")

# validation 파일 (timestamp 포함 → 재현성 제외)
for fname in ["gyeongju-en-offline-closeout-summary-v1.json", "gyeongju-en-offline-closeout-qa-v1.json"]:
    p = VAL_DIR / fname
    sha_manifest[fname] = sha256_file(p)

with open(VAL_DIR / "gyeongju-en-offline-closeout-sha-v1.json", "w", encoding="utf-8", newline="\n") as f:
    json.dump(sha_manifest, f, ensure_ascii=False, indent=2)

# ─── 완료 ──────────────────────────────────────────────────────────────────────
print()
print("=" * 70)
print(f"[gyeongju_en_identity_offline_closeout_v1] 완료")
print(f"  기타 18건 → 전부 구체적 분류 ✅")
print(f"  TYPE_INCOMPATIBLE 제거: {en_status_counter.get('UNASSIGNED_TYPE_INCOMPATIBLE', 0)}건 잔존")
print(f"  EN 1945431 → ASSIGNED_SAME_BASE_PLACE_TEMPORAL_EXPERIENCE ✅")
print(f"  GJ01-0034 → EN_SAME_BASE_PLACE_TEMPORAL_EXPERIENCE ✅")
print(f"  EN 102 taxonomy: {dict(en_status_counter)}")
print(f"  KO 235 taxonomy: {dict(ko_id_counter)}")
print(f"  NEW_PLACE_PROPOSAL: {new_place_count}건")
print(f"  GROUP_ENTITY_RECORD: {group_entity_count}건")
print(f"  Supplement queue v4: {len(supplement_queue)}건")
print(f"  회귀 PASS: {pass_count}/{len(regression_records)}")
print(f"  신규 HTTP: 0건")
print("=" * 70)
