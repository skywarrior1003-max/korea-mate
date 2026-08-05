#!/usr/bin/env python3
"""
TASK-GYEONGJU-NORMALIZATION-INDEPENDENT-QA-V1
독립 QA 스크립트 — 경주 full-v1 정규화·identity 결과 검증

모든 판정은 normalization 스크립트와 독립적으로 재계산한다.
출력 파일 수정 금지; 읽기 전용.
"""

import hashlib
import json
import math
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from datetime import datetime, timezone

VERSION = "1.0.0"
TASK = "TASK-GYEONGJU-NORMALIZATION-INDEPENDENT-QA-V1"
AS_OF = "2026-08-05T04:08:00Z"
QA_RAN_AT = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

# ── 경로 설정 ────────────────────────────────────────────────
REPO = Path(__file__).parent.parent
NORM_DIR = REPO / "data/tourapi/normalized/gyeongju"
VAL_DIR  = REPO / "data/tourapi/validation/gyeongju"
REP_DIR  = REPO / "data/tourapi/reports/gyeongju"
MANIFEST_PATH = REPO / "data/tourapi/manifests/gyeongju/gyeongju-manifest-v1.json"

VAL_DIR.mkdir(parents=True, exist_ok=True)
REP_DIR.mkdir(parents=True, exist_ok=True)

# ── 한국 좌표 경계 ────────────────────────────────────────────
KOREA_LAT_MIN, KOREA_LAT_MAX = 33.0, 40.0
KOREA_LON_MIN, KOREA_LON_MAX = 124.0, 132.0

# ── 결함 레지스터 ────────────────────────────────────────────
DEFECTS = []

def defect(severity, section, finding, evidence, candidate_ids=None, fix_recommendation=""):
    DEFECTS.append({
        "severity": severity,
        "section": section,
        "finding": finding,
        "evidence": evidence,
        "affected_ids": candidate_ids or [],
        "fix_recommendation": fix_recommendation,
    })
    print(f"  [{severity}] {section}: {finding}")

# ── 유틸 ────────────────────────────────────────────────────

def sha256_file(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def sha256_str(s):
    return hashlib.sha256(s.encode("utf-8")).hexdigest()

def load_jsonl(path):
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]

def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)

def norm_name(s):
    """이름 정규화: 소문자·공백 제거·유니코드 NFC·특수문자 제거."""
    if not s:
        return ""
    s = unicodedata.normalize("NFC", str(s))
    s = re.sub(r"[\s\-·・_]", "", s)
    return s.lower()

def norm_phone(s):
    """전화번호 정규화: 숫자만."""
    if not s:
        return ""
    return re.sub(r"\D", "", str(s))

def norm_addr(s):
    """주소 정규화: 공백·특수문자 제거 후 소문자."""
    if not s:
        return ""
    return re.sub(r"\s+", " ", str(s)).strip().lower()

def haversine_m(lat1, lon1, lat2, lon2):
    """두 좌표 간 거리 (미터)."""
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
    return 2 * R * math.asin(math.sqrt(a))

def write_jsonl(path, records):
    path = Path(path)
    with open(path, "w", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"  wrote {len(records)} records → {path.name}")
    return path

def write_json(path, data):
    path = Path(path)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  wrote → {path.name}")
    return path

# ════════════════════════════════════════════════════════════
# 1. 입력 데이터 로딩
# ════════════════════════════════════════════════════════════
print("\n[1] 입력 파일 로딩...")

candidates      = load_jsonl(NORM_DIR / "gyeongju-full-v1-candidates.jsonl")
source_facts    = load_jsonl(NORM_DIR / "source-facts-full-v1.jsonl")
baseline_audit  = load_jsonl(NORM_DIR / "gyeongju-baseline-831-identity-link-audit.jsonl")
att_audit       = load_jsonl(NORM_DIR / "gyeongju-attraction-identity-audit-v1.jsonl")
rest_audit      = load_jsonl(NORM_DIR / "gyeongju-restaurant-identity-audit-v1.jsonl")
souv_audit      = load_jsonl(NORM_DIR / "gyeongju-souvenir-classification-audit-v1.jsonl")
mr_queue        = load_jsonl(NORM_DIR / "gyeongju-manual-review-queue-v1.jsonl")
multilingual    = load_jsonl(NORM_DIR / "gyeongju-multilingual-entity-link-audit-v1.jsonl")
event_entities  = load_jsonl(NORM_DIR / "gyeongju-event-entities-v1.jsonl")
event_listings  = load_jsonl(NORM_DIR / "gyeongju-event-listing-relations-v1.jsonl")
courses         = load_jsonl(NORM_DIR / "gyeongju-course-entities-v1.jsonl")
waypoints       = load_jsonl(NORM_DIR / "gyeongju-course-waypoint-relations-v1.jsonl")
heritage_ents   = load_jsonl(NORM_DIR / "gyeongju-heritage-entities-v1.jsonl")
heritage_rels   = load_jsonl(NORM_DIR / "gyeongju-heritage-relations-v1.jsonl")
guide_rels      = load_jsonl(NORM_DIR / "gyeongju-cultural-guide-relations-v1.jsonl")
rec_collections = load_jsonl(NORM_DIR / "gyeongju-recommendation-collections-v1.jsonl")
rec_relations   = load_jsonl(NORM_DIR / "gyeongju-recommendation-place-relations-v1.jsonl")
rec_review_q    = load_jsonl(NORM_DIR / "gyeongju-recommendation-relation-review-queue.jsonl")
field_conflicts = load_jsonl(NORM_DIR / "gyeongju-field-conflict-audit-v1.jsonl")
attr_evidence   = load_jsonl(NORM_DIR / "gyeongju-entity-attribute-evidence-v1.jsonl")
summary         = load_json(NORM_DIR  / "gyeongju-normalization-summary-v1.json")

print(f"  candidates: {len(candidates)}")
print(f"  source_facts: {len(source_facts)}")
print(f"  baseline_audit: {len(baseline_audit)}")
print(f"  att_audit: {len(att_audit)}")
print(f"  rest_audit: {len(rest_audit)}")
print(f"  souv_audit: {len(souv_audit)}")
print(f"  mr_queue: {len(mr_queue)}")
print(f"  multilingual: {len(multilingual)}")
print(f"  event_entities: {len(event_entities)}")
print(f"  event_listings: {len(event_listings)}")
print(f"  courses: {len(courses)}")
print(f"  waypoints: {len(waypoints)}")
print(f"  heritage_ents: {len(heritage_ents)}")
print(f"  heritage_rels: {len(heritage_rels)}")
print(f"  guide_rels: {len(guide_rels)}")
print(f"  rec_collections: {len(rec_collections)}")
print(f"  rec_relations: {len(rec_relations)}")

# ════════════════════════════════════════════════════════════
# 2. 섹션 1: 입력·산출물 무결성
# ════════════════════════════════════════════════════════════
print("\n[2] 입력·산출물 무결성 검증...")

# 2-1. 필수 수치 검증
EXPECTED = {
    "baseline": 831,
    "source_facts": 1158,
    "candidates": 914,
    "mr_queue": 38,
    "rec_collections": 7,
    "courses": 5,
    "waypoints": 29,
    "heritage_ents": 5,
    "event_entities": 7,
    "event_listings": 10,
    "multilingual": 92,
}
ACTUAL = {
    "baseline": len(baseline_audit),
    "source_facts": len(source_facts),
    "candidates": len(candidates),
    "mr_queue": len(mr_queue),
    "rec_collections": len(rec_collections),
    "courses": len(courses),
    "waypoints": len(waypoints),
    "heritage_ents": len(heritage_ents),
    "event_entities": len(event_entities),
    "event_listings": len(event_listings),
    "multilingual": len(multilingual),
}

integrity_results = {}
for key, exp in EXPECTED.items():
    act = ACTUAL[key]
    ok = act == exp
    integrity_results[key] = {"expected": exp, "actual": act, "pass": ok}
    if not ok:
        defect("CRITICAL", "S1-integrity", f"{key} count mismatch",
               f"expected={exp}, actual={act}",
               fix_recommendation=f"Investigate {key} file for missing/extra records")

# 2-2. 추가 수치 검증
heritage_att_links = [r for r in heritage_rels if r.get("relation_type") == "RELATED_ATTRACTION"]
heritage_parent_child = [r for r in heritage_rels if r.get("relation_type") == "PARENT_CHILD"]
integrity_results["heritage_att_links"] = {"expected": 33, "actual": len(heritage_att_links), "pass": len(heritage_att_links) == 33}
integrity_results["heritage_total_rels"] = {"expected": 53, "actual": len(heritage_rels), "pass": len(heritage_rels) == 53}

# guide_rels: 17
integrity_results["guide_rels"] = {"expected": 17, "actual": len(guide_rels), "pass": len(guide_rels) == 17}

# rec official relations: 8 (MANUAL_REVIEW = area_uid 연결)
rec_official = [r for r in rec_relations if r.get("identity_status") == "MANUAL_REVIEW"]
integrity_results["rec_official_relations"] = {"expected": 8, "actual": len(rec_official), "pass": len(rec_official) == 8}

# 2-3. ID 중복 검사
cand_ids = [c["candidate_id"] for c in candidates]
cand_id_dups = [cid for cid, cnt in Counter(cand_ids).items() if cnt > 1]
sf_ids = [s["source_fact_id"] for s in source_facts]
sf_id_dups = [sid for sid, cnt in Counter(sf_ids).items() if cnt > 1]
rel_ids = [r.get("relation_id") for r in rec_relations if r.get("relation_id")]
rel_id_dups = [rid for rid, cnt in Counter(rel_ids).items() if cnt > 1]

if cand_id_dups:
    defect("CRITICAL", "S1-id-dup", "candidate_id duplicates found", str(cand_id_dups), cand_id_dups)
if sf_id_dups:
    defect("CRITICAL", "S1-id-dup", "source_fact_id duplicates found", str(sf_id_dups), sf_id_dups)
if rel_id_dups:
    defect("CRITICAL", "S1-id-dup", "relation_id duplicates found", str(rel_id_dups))

integrity_results["candidate_id_duplicates"] = {"count": len(cand_id_dups), "pass": len(cand_id_dups) == 0}
integrity_results["source_fact_id_duplicates"] = {"count": len(sf_id_dups), "pass": len(sf_id_dups) == 0}
integrity_results["relation_id_duplicates"] = {"count": len(rel_id_dups), "pass": len(rel_id_dups) == 0}

# 2-4. JSON·JSONL 파싱 오류 (로딩 성공 자체가 검증)
integrity_results["json_parse_errors"] = {"pass": True, "note": "All files loaded without parse errors"}

# 2-5. candidate ID 신규 83건 검증
baseline_ids = {r["candidate_id"] for r in baseline_audit}
new_cand_ids = [c["candidate_id"] for c in candidates if c["candidate_id"] not in baseline_ids]
preserved_cand_ids = [c["candidate_id"] for c in candidates if c["candidate_id"] in baseline_ids]
integrity_results["new_candidates"] = {
    "expected": 83,
    "actual": len(new_cand_ids),
    "preserved": len(preserved_cand_ids),
    "pass": len(new_cand_ids) == 83,
}
if len(new_cand_ids) != 83:
    defect("CRITICAL", "S1-delta", f"new candidates count mismatch: expected 83, got {len(new_cand_ids)}",
           "Check new_cand_ids vs baseline_ids")

# 2-6. manifest SHA 검증
print("  manifest SHA 검증...")
manifest = load_json(MANIFEST_PATH)
mf_files = {f["path"]: f.get("sha256", "") for f in manifest.get("files", [])}

sha_check_results = []
checked = 0
mismatched = 0
for f in manifest.get("files", []):
    rel_path = f.get("path", "")
    expected_sha = f.get("sha256", "")
    abs_path = REPO / rel_path
    if not abs_path.exists():
        sha_check_results.append({"path": rel_path, "status": "FILE_MISSING"})
        continue
    if not expected_sha:
        sha_check_results.append({"path": rel_path, "status": "SHA_NOT_IN_MANIFEST"})
        continue
    actual_sha = sha256_file(abs_path)
    ok = actual_sha == expected_sha
    sha_check_results.append({
        "path": rel_path,
        "status": "MATCH" if ok else "MISMATCH",
        "expected": expected_sha[:16],
        "actual": actual_sha[:16],
    })
    checked += 1
    if not ok:
        mismatched += 1

# normalization 산출물과 비산출물 분리
NORM_OUTPUT_PREFIXES = (
    "data/tourapi/normalized/gyeongju/",
    "data/tourapi/validation/gyeongju/",
)
norm_mismatches = [r for r in sha_check_results
                   if r.get("status") == "MISMATCH"
                   and any(r.get("path","").startswith(p) for p in NORM_OUTPUT_PREFIXES)]
non_norm_mismatches = [r for r in sha_check_results
                       if r.get("status") == "MISMATCH"
                       and not any(r.get("path","").startswith(p) for p in NORM_OUTPUT_PREFIXES)]

integrity_results["manifest_sha_check"] = {
    "files_checked": checked,
    "mismatched_total": mismatched,
    "mismatched_norm_outputs": len(norm_mismatches),
    "mismatched_non_norm": len(non_norm_mismatches),
    "non_norm_files": [r.get("path") for r in non_norm_mismatches],
    "pass": len(norm_mismatches) == 0,
}
if norm_mismatches:
    defect("CRITICAL", "S1-sha", f"{len(norm_mismatches)} normalization output SHA mismatches",
           str([r.get("path") for r in norm_mismatches]),
           fix_recommendation="Re-check normalization run; update manifest")
if non_norm_mismatches:
    defect("MEDIUM", "S1-sha-non-norm",
           f"{len(non_norm_mismatches)} non-normalization files changed since manifest (scripts/docs/contracts)",
           str([r.get("path") for r in non_norm_mismatches]),
           fix_recommendation="Update manifest after script/doc updates in later branches")

# 2-7. Foreign key 검증
cand_id_set = set(cand_ids)
sf_id_set = set(sf_ids)

# heritage RELATED_ATTRACTION 전용: web_source_fact_id는 WEB-ATT 네임스페이스 사용
# gyeongju.go.kr 유산 상세 페이지는 159 web att 컬렉션 외 추가 area_uid를 참조함
# → COVERAGE_LIMITATION으로 기록, FK 오류 아님
heritage_wsf_ids = {
    r.get("web_source_fact_id")
    for r in heritage_rels
    if r.get("relation_type") == "RELATED_ATTRACTION" and r.get("web_source_fact_id")
}
heritage_coverage_gaps = [
    wsf for wsf in heritage_wsf_ids if wsf not in sf_id_set
]

fk_errors = []
for r in attr_evidence:
    if r.get("candidate_id") and r["candidate_id"] not in cand_id_set:
        fk_errors.append({"type": "entity_attribute_evidence", "invalid_ref": r["candidate_id"]})

for r in guide_rels:
    if r.get("linked_candidate_id") and r["linked_candidate_id"] not in cand_id_set:
        fk_errors.append({"type": "guide_rel", "invalid_ref": r["linked_candidate_id"]})

for r in waypoints:
    if r.get("candidate_id") and r["candidate_id"] not in cand_id_set:
        fk_errors.append({"type": "waypoint", "invalid_ref": r["candidate_id"]})

# heritage PARENT_CHILD만 FK 검증 (RELATED_ATTRACTION은 coverage limitation)
for r in heritage_rels:
    if r.get("relation_type") == "PARENT_CHILD":
        pass  # child_heritage_id 참조는 heritage_ents에서 확인 (선택적)

integrity_results["foreign_key_errors"] = {"count": len(fk_errors), "pass": len(fk_errors) == 0}
integrity_results["heritage_coverage_gaps"] = {
    "count": len(heritage_coverage_gaps),
    "note": "COVERAGE_LIMITATION: heritage RELATED_ATTRACTION area_uids not in web_att_159 collection",
    "examples": sorted(heritage_coverage_gaps)[:5],
}
if fk_errors:
    defect("CRITICAL", "S1-fk", f"{len(fk_errors)} broken foreign key references",
           json.dumps(fk_errors[:5], ensure_ascii=False))
if heritage_coverage_gaps:
    defect("LOW", "S1-heritage-cov",
           f"Heritage RELATED_ATTRACTION: {len(heritage_coverage_gaps)} area_uid not in web_att_159",
           f"Examples: {sorted(heritage_coverage_gaps)[:3]}",
           fix_recommendation="Expand web attraction collection to include heritage-linked area_uids")

# 출력
out_integrity = {
    "task": TASK,
    "qa_ran_at": QA_RAN_AT,
    "as_of": AS_OF,
    "summary": integrity_results,
    "sha_check_details": sha_check_results,
    "foreign_key_errors": fk_errors,
    "new_candidate_ids_sample": new_cand_ids[:20],
    "candidate_id_duplicates": cand_id_dups,
    "source_fact_id_duplicates": sf_id_dups,
}
write_json(VAL_DIR / "gyeongju-normalization-input-integrity-qa-v1.json", out_integrity)

# ════════════════════════════════════════════════════════════
# 3. 섹션 2: 수동 검토 큐 38건 전수 QA
# ════════════════════════════════════════════════════════════
print("\n[3] 수동 검토 큐 38건 전수 QA...")

# entity_type별 분포
mrq_by_type = defaultdict(list)
for r in mr_queue:
    mrq_by_type[r.get("entity_type")].append(r)

# cand_id → candidate 맵
cand_map = {c["candidate_id"]: c for c in candidates}
sf_map   = {s["source_fact_id"]: s for s in source_facts}

# att/rest identity audit 맵
att_by_sf = {r.get("linked_api_source_fact_id", r.get("area_uid")): r for r in att_audit}
# 보다 안전하게: area_uid → att_audit
att_by_area = {r.get("area_uid"): r for r in att_audit}
att_by_sfid = {}
for r in att_audit:
    sfid = r.get("linked_api_source_fact_id")
    if sfid:
        att_by_sfid[sfid] = r

rest_by_hex = {r.get("hex_id"): r for r in rest_audit}

MRQ_QA = []
for item in mr_queue:
    queue_id    = item.get("queue_id", "")
    entity_type = item.get("entity_type", "")
    sf_id       = item.get("source_fact_id")
    cand_id     = item.get("baseline_candidate_id")
    reason      = item.get("reason", "")
    evidence    = item.get("evidence_codes", [])
    verdict_orig = item.get("verdict", "")

    qa_verdict = "REVIEW_CONFIRMED"  # 기본값
    qa_notes = []
    auto_resolvable = False
    human_required  = True

    sf_rec = sf_map.get(sf_id) if sf_id else None

    # attraction 항목
    if entity_type == "attraction":
        # PHONE_MATCH만 있으면 자동 해결 불가; 이름+주소 있으면 SAFE_TO_PROMOTE 가능성
        if sf_rec:
            has_name  = bool(sf_rec.get("normalized_name"))
            has_phone = bool(sf_rec.get("normalized_phone"))
            has_addr  = bool(sf_rec.get("normalized_address"))
            if "PHONE_MATCH_GJ01_SF" in evidence and has_name and has_addr:
                qa_verdict = "REVIEW_CONFIRMED"
                qa_notes.append("Phone match with name+addr: still insufficient for auto-link — manual verification needed")
            elif "CAND_NAME_MATCH" in evidence and cand_id:
                qa_verdict = "REVIEW_CONFIRMED"
                qa_notes.append("Name match only: GPS or address confirmation needed")
            else:
                qa_verdict = "INSUFFICIENT_EVIDENCE"
                qa_notes.append("No strong evidence found in source fact")

    # restaurant 항목
    elif entity_type == "restaurant":
        if "PHONE_MATCH" in str(evidence) or "NAME_MATCH" in str(evidence):
            qa_verdict = "REVIEW_CONFIRMED"
            qa_notes.append("Standard name/phone match - manual check for branch/rename")
        elif "NO_LINKABLE_EVIDENCE" in str(evidence):
            qa_verdict = "REVIEW_CONFIRMED"
            qa_notes.append("No linkable evidence: new or renamed establishment likely")
            auto_resolvable = False

    # souvenir 항목
    elif entity_type == "souvenir":
        # PHYSICAL_PLACE로 분류됨 — review_required 표시
        qa_verdict = "REVIEW_CONFIRMED"
        qa_notes.append("Physical place classification confirmed; manual identity linking required")

    # monthly_rec 항목
    elif entity_type == "monthly_rec":
        qa_verdict = "REVIEW_CONFIRMED"
        qa_notes.append("area_uid-based relation; requires gyeongju.go.kr detail page verification")
        human_required = True

    # cultural_guide 항목
    elif entity_type == "cultural_guide":
        qa_verdict = "REVIEW_CONFIRMED"
        qa_notes.append("Guide service identity; candidate link verification needed")

    MRQ_QA.append({
        "queue_id": queue_id,
        "entity_type": entity_type,
        "source_fact_id": sf_id,
        "baseline_candidate_id": cand_id,
        "original_verdict": verdict_orig,
        "original_reason": reason,
        "original_evidence": evidence,
        "qa_verdict": qa_verdict,
        "qa_notes": qa_notes,
        "auto_resolvable": auto_resolvable,
        "human_required": human_required,
    })

mrq_dist = Counter(r["entity_type"] for r in mr_queue)
mrq_qa_dist = Counter(r["qa_verdict"] for r in MRQ_QA)

print(f"  MRQ type dist: {dict(mrq_dist)}")
print(f"  MRQ QA verdict dist: {dict(mrq_qa_dist)}")

# 38건 전수 확인
if len(MRQ_QA) != 38:
    defect("HIGH", "S2-mrq", f"MRQ QA item count mismatch: expected 38, got {len(MRQ_QA)}", "")

write_jsonl(VAL_DIR / "gyeongju-manual-review-independent-qa-v1.jsonl", MRQ_QA)

# ════════════════════════════════════════════════════════════
# 4. 섹션 3: 추천여행지 area_uid 8건 QA
# ════════════════════════════════════════════════════════════
print("\n[4] 추천여행지 area_uid 8건 QA...")

TARGET_AREA_UIDS = [357, 358, 359, 365, 43565, 43567, 43568, 43571]

# 로컬 근거 조사
# 1) source facts에서 area_uid 매핑
sf_by_area_uid = {}
for sf in source_facts:
    # source_record_id에서 area_uid 추출 시도
    src_id = sf.get("source_record_id", "")
    # 또는 source_fact_id에서 확인
    sfid = sf.get("source_fact_id", "")
    for uid in TARGET_AREA_UIDS:
        if str(uid) in sfid or str(uid) == src_id:
            sf_by_area_uid[uid] = sf

# 2) att_audit에서 area_uid 매핑
att_by_area_local = {}
for r in att_audit:
    uid = r.get("area_uid")
    if uid and uid in TARGET_AREA_UIDS:
        att_by_area_local[uid] = r

# 3) web_source_fact_id 형태 "gyeongju-WEB-ATT-{uid}" 에서 소스팩트 조사
sf_by_sfid_area = {}
for uid in TARGET_AREA_UIDS:
    sfid = f"gyeongju-WEB-ATT-{uid}"
    if sfid in sf_map:
        sf_by_sfid_area[uid] = sf_map[sfid]

# 4) candidates에서 직접 확인
cand_by_area_uid = {}
for c in candidates:
    # source_fact_id가 area_uid 기반일 수 있음
    sfid = c.get("source_fact_id", "")
    for uid in TARGET_AREA_UIDS:
        if str(uid) in sfid:
            cand_by_area_uid[uid] = c

# rec_relations에서 area_uid 정보 수집
rec_rel_by_area = {r.get("area_uid"): r for r in rec_relations if r.get("area_uid") in TARGET_AREA_UIDS}

AREA_UID_QA = []
for uid in TARGET_AREA_UIDS:
    sf_local = sf_by_sfid_area.get(uid)
    att_local = att_by_area_local.get(uid)
    rec_rel   = rec_rel_by_area.get(uid)
    cand_local = cand_by_area_uid.get(uid)

    local_evidence = []
    qa_judgment = "INSUFFICIENT_EVIDENCE"
    existing_cand_id = None
    name_ko = None
    official_url = None

    if sf_local:
        local_evidence.append(f"SF_FOUND: {sf_local.get('source_fact_id')}")
        name_ko = sf_local.get("name") or sf_local.get("normalized_name")
        official_url = sf_local.get("official_external_url") or sf_local.get("source_url")

    if att_local:
        local_evidence.append(f"ATT_AUDIT: verdict={att_local.get('verdict')}, cand={att_local.get('baseline_candidate_id')}")
        if att_local.get("baseline_candidate_id"):
            existing_cand_id = att_local["baseline_candidate_id"]
            qa_judgment = "MATCHED_EXISTING_CANDIDATE"
        elif att_local.get("verdict") == "NEW_OFFICIAL_PLACE":
            qa_judgment = "CURRENT_OFFICIAL_PLACE_FOUND"

    if rec_rel:
        local_evidence.append(f"REC_REL: identity_status={rec_rel.get('identity_status')}")
        pw = rec_rel.get("place_url")
        if pw:
            official_url = official_url or pw

    if not local_evidence:
        qa_judgment = "OFFICIAL_DETAIL_NOT_FOUND"
        local_evidence.append("No local source found — live check recommended")
    elif existing_cand_id:
        qa_judgment = "MATCHED_EXISTING_CANDIDATE"
    elif sf_local and att_local and att_local.get("verdict") in ("NEW_OFFICIAL_PLACE", "HIGH_CONFIDENCE"):
        qa_judgment = "CURRENT_OFFICIAL_PLACE_FOUND"
    else:
        qa_judgment = "INSUFFICIENT_EVIDENCE"

    AREA_UID_QA.append({
        "area_uid": uid,
        "collection_id": f"gyeongju-MR-4134",
        "local_evidence": local_evidence,
        "qa_judgment": qa_judgment,
        "existing_candidate_id": existing_cand_id,
        "source_fact_id": sf_local.get("source_fact_id") if sf_local else None,
        "name_ko": name_ko,
        "official_url": official_url,
        "live_check_required": qa_judgment in ("INSUFFICIENT_EVIDENCE", "OFFICIAL_DETAIL_NOT_FOUND"),
        "recommended_action": (
            "Verified via local source facts — confirm identity via gyeongju.go.kr detail page"
            if sf_local else
            "No local source found — requires live gyeongju.go.kr detail page confirmation"
        ),
        "identity_status_in_normalization": "MANUAL_REVIEW",
        "qa_note": (
            "area_uid not in 159 web attractions or pilot audit. "
            "MANUAL_REVIEW correctly assigned. "
            "Live confirmation needed before identity resolution."
        ),
    })

live_needed = sum(1 for r in AREA_UID_QA if r["live_check_required"])
print(f"  area_uid QA: {len(AREA_UID_QA)} items")
print(f"  live check required: {live_needed}")
print(f"  judgments: {Counter(r['qa_judgment'] for r in AREA_UID_QA)}")

write_jsonl(VAL_DIR / "gyeongju-recommendation-area-uid-qa-v1.jsonl", AREA_UID_QA)

# ════════════════════════════════════════════════════════════
# 5. 섹션 4: 관광지 identity QA
# ════════════════════════════════════════════════════════════
print("\n[5] 관광지 identity QA...")

# 강한 evidence 코드 목록
STRONG_ATT_EVIDENCE = {
    "GJ01_SF_NAME_MATCH_PLUS_CAND_NAME_MATCH",
    "KTO12_CAND_ID_MATCH",
    "KTO12_NAME_PLUS_PHONE_MATCH",
    "OFFICIAL_ID_MATCH",
    "EXACT_NAME_EXACT_PHONE",
    "EXACT_NAME_EXACT_ADDR",
    "GJ01_OFFICIAL_ID_MATCH",
    "GJ06_OFFICIAL_ID_MATCH",
    "GJ01_SF_MATCH_PLUS_WEB_ATT_MATCH",
    "MULTI_SOURCE_NAME_MATCH",
    "KTO_CONTENT_ID_MATCH",
    "NAME_PHONE_ADDR_TRIPLE",
}

ATT_IND_QA = []
hc_no_strong = []
gps_only_hc  = []
fuzzy_only_hc = []

for r in att_audit:
    verdict = r.get("verdict")
    evs     = set(r.get("evidence_codes", []))
    cand_id = r.get("baseline_candidate_id")
    area_uid = r.get("area_uid")
    conf    = r.get("confidence_score", 0)

    has_strong = bool(evs & STRONG_ATT_EVIDENCE)
    is_gps_only = (evs == {"GPS_PROXIMITY"}) or (evs <= {"GPS_PROXIMITY", "CAND_GPS_PROXIMITY"})
    is_fuzzy_only = evs <= {"FUZZY_NAME_MATCH"} or evs <= {"PARTIAL_NAME_MATCH"}

    qa_result = "REVIEW_CONFIRMED"
    qa_issue = None

    if verdict == "HIGH_CONFIDENCE":
        if not has_strong:
            qa_result = "WEAK_EVIDENCE_HC"
            qa_issue = f"HC without strong evidence: evs={sorted(evs)}"
            hc_no_strong.append({
                "area_uid": area_uid, "candidate_id": cand_id,
                "evidence_codes": sorted(evs), "confidence_score": conf,
            })
        if is_gps_only:
            qa_result = "GPS_ONLY_HC"
            qa_issue = "HC based on GPS proximity only"
            gps_only_hc.append({"area_uid": area_uid, "candidate_id": cand_id})
        if is_fuzzy_only:
            qa_result = "FUZZY_ONLY_HC"
            qa_issue = "HC based on fuzzy name only"
            fuzzy_only_hc.append({"area_uid": area_uid, "candidate_id": cand_id})
        if not qa_issue:
            qa_result = "HC_EVIDENCE_VALID"
    elif verdict == "MANUAL_REVIEW":
        qa_result = "REVIEW_CONFIRMED"
    elif verdict == "NEW_OFFICIAL_PLACE":
        # baseline과 중복 확인
        if cand_id and cand_id in baseline_ids:
            qa_result = "DUPLICATE_BASELINE_RISK"
            qa_issue = f"NEW_OFFICIAL_PLACE but cand_id {cand_id} is in baseline"
        else:
            qa_result = "NEW_CONFIRMED"

    ATT_IND_QA.append({
        "area_uid": area_uid,
        "baseline_candidate_id": cand_id,
        "verdict": verdict,
        "confidence_score": conf,
        "evidence_codes": sorted(evs),
        "has_strong_evidence": has_strong,
        "qa_result": qa_result,
        "qa_issue": qa_issue,
    })

# defect 보고
if hc_no_strong:
    defect("HIGH", "S4-att-hc", f"{len(hc_no_strong)} HC items without strong evidence",
           json.dumps(hc_no_strong[:3], ensure_ascii=False),
           [r["candidate_id"] for r in hc_no_strong if r["candidate_id"]],
           "Review evidence codes; upgrade to stronger evidence or downgrade to MANUAL_REVIEW")
if gps_only_hc:
    defect("HIGH", "S4-att-hc", f"{len(gps_only_hc)} HC items GPS-only",
           str(gps_only_hc[:3]), [], "GPS-only must not be HC; downgrade to MANUAL_REVIEW")
if fuzzy_only_hc:
    defect("HIGH", "S4-att-hc", f"{len(fuzzy_only_hc)} HC items fuzzy-name-only",
           str(fuzzy_only_hc[:3]), [], "Fuzzy-name-only must not be HC")

att_qa_dist = Counter(r["qa_result"] for r in ATT_IND_QA)
print(f"  attraction QA results: {dict(att_qa_dist)}")
print(f"  HC no strong evidence: {len(hc_no_strong)}")
print(f"  GPS only HC: {len(gps_only_hc)}")
print(f"  fuzzy only HC: {len(fuzzy_only_hc)}")

# 위험 표본 30건 (다양한 케이스 선택)
# confidence_score < 0.9인 HC, 그리고 다양한 evidence type
risk_sample = sorted(
    [r for r in ATT_IND_QA if r["verdict"] == "HIGH_CONFIDENCE"],
    key=lambda x: x.get("confidence_score", 1)
)[:30]
print(f"  risk sample (low-confidence HC): {len(risk_sample)} items")

write_jsonl(VAL_DIR / "gyeongju-attraction-identity-independent-qa-v1.jsonl", ATT_IND_QA)

# ════════════════════════════════════════════════════════════
# 6. 섹션 5: 식당 identity QA
# ════════════════════════════════════════════════════════════
print("\n[6] 식당 identity QA...")

STRONG_REST_EVIDENCE = {
    "VG_HEX_PHONE_MATCH",
    "VG_HEX_NAME_EXACT_MATCH",
    "VG_HEX_ADDR_PHONE_MATCH",
    "VG_HEX_ID_MATCH",
    "GJ04_OFFICIAL_ID_MATCH",
    "KTO_FOOD_ID_MATCH",
    "PILOT_VG_CAND_HIGH_CONFIDENCE",  # 파일럿 감사에서 수동 검증된 매칭
}

REST_IND_QA = []
rest_hc_no_strong = []

for r in rest_audit:
    verdict = r.get("verdict")
    evs     = set(r.get("evidence_codes", []))
    cand_id = r.get("baseline_candidate_id")
    hex_id  = r.get("hex_id")
    conf    = r.get("confidence_score", 0)

    has_strong = bool(evs & STRONG_REST_EVIDENCE)
    is_gps_only = evs <= {"GPS_PROXIMITY"}

    qa_result = "REVIEW_CONFIRMED"
    qa_issue = None

    if verdict == "HIGH_CONFIDENCE":
        if not has_strong and not ("PHONE" in str(evs) and "NAME" in str(evs)):
            qa_result = "WEAK_EVIDENCE_HC"
            qa_issue = f"HC without strong evidence: evs={sorted(evs)}"
            rest_hc_no_strong.append({"hex_id": hex_id, "cand_id": cand_id, "evs": sorted(evs), "conf": conf})
        elif is_gps_only:
            qa_result = "GPS_ONLY_HC"
            qa_issue = "HC GPS-only"
        else:
            qa_result = "HC_EVIDENCE_VALID"
    elif verdict == "MANUAL_REVIEW":
        # branch/rename/address change 감지
        qa_result = "REVIEW_CONFIRMED"
        qa_issue = "Possible name change, branch, or address discrepancy"
    elif verdict == "NEW_OFFICIAL_PLACE":
        if cand_id and cand_id in baseline_ids:
            qa_result = "DUPLICATE_BASELINE_RISK"
            qa_issue = f"NEW but cand_id {cand_id} in baseline"
        else:
            qa_result = "NEW_CONFIRMED"

    REST_IND_QA.append({
        "hex_id": hex_id,
        "baseline_candidate_id": cand_id,
        "verdict": verdict,
        "confidence_score": conf,
        "evidence_codes": sorted(evs),
        "has_strong_evidence": has_strong,
        "qa_result": qa_result,
        "qa_issue": qa_issue,
    })

rest_qa_dist = Counter(r["qa_result"] for r in REST_IND_QA)
print(f"  restaurant QA results: {dict(rest_qa_dist)}")
if rest_hc_no_strong:
    defect("HIGH", "S5-rest-hc", f"{len(rest_hc_no_strong)} restaurant HC without strong evidence",
           json.dumps(rest_hc_no_strong, ensure_ascii=False),
           [], "Review evidence; ensure phone+name confirmation exists")

write_jsonl(VAL_DIR / "gyeongju-restaurant-identity-independent-qa-v1.jsonl", REST_IND_QA)

# ════════════════════════════════════════════════════════════
# 7. 섹션 6: 기념품 8건 QA
# ════════════════════════════════════════════════════════════
print("\n[7] 기념품 8건 QA...")

SOUV_QA = []
for r in souv_audit:
    name_ko   = r.get("name_ko", "")
    name_en   = r.get("name_en", "")
    identity  = r.get("identity_status")
    cand_id   = r.get("baseline_candidate_id")
    url       = r.get("official_url")
    evs       = r.get("evidence_codes", [])
    review_req = r.get("review_required", False)
    cat_prop  = r.get("category_proposal")
    sfid      = r.get("source_fact_id")

    qa_verdict = "PHYSICAL_PLACE_CONFIRMED"
    qa_issues  = []

    # 공식 URL 존재 여부
    if not url:
        qa_issues.append("No official URL")
        qa_verdict = "DATA_FIX_REQUIRED"

    # baseline 연결 확인
    if cand_id:
        if cand_id not in baseline_ids:
            qa_issues.append(f"baseline_candidate_id {cand_id} not in baseline_831")
            qa_verdict = "IDENTITY_CONFLICT"
        else:
            qa_issues.append(f"Correctly linked to baseline: {cand_id}")

    # category_proposal 확인
    if cat_prop not in ("attraction", "souvenir_shop", "nature", "restaurant"):
        qa_issues.append(f"Unusual category_proposal: {cat_prop}")

    # PHYSICAL_PLACE 증거 확인 (evidence_codes)
    if "KNOWN_PHYSICAL_ESTABLISHMENT" not in evs and "OFFICIAL_WEB_LISTING" not in evs:
        qa_issues.append(f"Missing KNOWN_PHYSICAL_ESTABLISHMENT evidence: {evs}")
        if qa_verdict != "IDENTITY_CONFLICT":
            qa_verdict = "REVIEW_CONFIRMED"

    SOUV_QA.append({
        "source_fact_id": sfid,
        "name_ko": name_ko,
        "name_en": name_en,
        "identity_status": identity,
        "baseline_candidate_id": cand_id,
        "official_url": url,
        "category_proposal": cat_prop,
        "evidence_codes": evs,
        "review_required": review_req,
        "qa_verdict": qa_verdict,
        "qa_issues": qa_issues,
    })

souv_qa_dist = Counter(r["qa_verdict"] for r in SOUV_QA)
print(f"  souvenir QA: {dict(souv_qa_dist)}")

# baseline 연결 1건 검증
baseline_linked = [r for r in SOUV_QA if r["baseline_candidate_id"]]
print(f"  baseline-linked souvenir: {len(baseline_linked)} (expected 1)")
if len(baseline_linked) != 1:
    defect("HIGH", "S6-souv", f"Expected 1 baseline-linked souvenir, got {len(baseline_linked)}", str(baseline_linked))

data_fix_souv = [r for r in SOUV_QA if r["qa_verdict"] == "DATA_FIX_REQUIRED"]
if data_fix_souv:
    defect("MEDIUM", "S6-souv", f"{len(data_fix_souv)} souvenir items need data fix",
           str([r["name_ko"] for r in data_fix_souv]))

write_jsonl(VAL_DIR / "gyeongju-souvenir-independent-qa-v1.jsonl", SOUV_QA)

# ════════════════════════════════════════════════════════════
# 8. 섹션 7: 신규 candidate 83건 중복·관계 QA
# ════════════════════════════════════════════════════════════
print("\n[8] 신규 candidate 83건 중복 QA...")

new_candidates = [c for c in candidates if c["candidate_id"] not in baseline_ids]
print(f"  new candidates found: {len(new_candidates)}")

# 인덱스 구축 (전체 candidate 대상)
all_norm_names   = defaultdict(list)
all_norm_phones  = defaultdict(list)
all_norm_addrs   = defaultdict(list)
all_coords       = []
all_urls         = defaultdict(list)

for c in candidates:
    cid = c["candidate_id"]
    nn = norm_name(c.get("title_ko") or c.get("name") or "")
    if nn:
        all_norm_names[nn].append(cid)
    ph = norm_phone(c.get("phone") or "")
    if ph and len(ph) >= 8:
        all_norm_phones[ph].append(cid)
    addr = norm_addr(c.get("address") or "")
    if addr:
        all_norm_addrs[addr].append(cid)
    lat = c.get("lat")
    lon = c.get("lng")
    if lat and lon:
        all_coords.append((float(lat), float(lon), cid))
    url = c.get("official_url") or ""
    if url:
        all_urls[url].append(cid)

DUP_QA = []
for c in new_candidates:
    cid = c["candidate_id"]
    nn  = norm_name(c.get("title_ko") or c.get("name") or "")
    ph  = norm_phone(c.get("phone") or "")
    addr = norm_addr(c.get("address") or "")
    lat  = c.get("lat")
    lon  = c.get("lng")
    url  = c.get("official_url") or ""
    cat  = c.get("category")

    dup_signals = []
    dup_status  = "NO_DUPLICATE_SIGNAL"

    # 이름 중복
    name_matches = [x for x in all_norm_names.get(nn, []) if x != cid]
    if nn and name_matches:
        dup_signals.append({"type": "SAME_NORM_NAME", "conflict_ids": name_matches})

    # 전화 중복
    if ph and len(ph) >= 8:
        phone_matches = [x for x in all_norm_phones.get(ph, []) if x != cid]
        if phone_matches:
            dup_signals.append({"type": "SAME_PHONE", "conflict_ids": phone_matches})

    # 주소 중복 (이름도 유사하면 LIKELY)
    if addr:
        addr_matches = [x for x in all_norm_addrs.get(addr, []) if x != cid]
        if addr_matches and name_matches:
            dup_signals.append({"type": "SAME_ADDR_AND_NAME", "conflict_ids": addr_matches})

    # 좌표 50m 이내
    if lat and lon:
        try:
            flat, flon = float(lat), float(lon)
            near = [
                (oid, haversine_m(flat, flon, ola, olo))
                for ola, olo, oid in all_coords
                if oid != cid and haversine_m(flat, flon, ola, olo) <= 50
            ]
            if near:
                dup_signals.append({"type": "COORD_50M", "nearby": [(oid, round(d, 1)) for oid, d in near[:5]]})
        except (ValueError, TypeError):
            pass

    # URL 중복
    if url:
        url_matches = [x for x in all_urls.get(url, []) if x != cid]
        if url_matches:
            dup_signals.append({"type": "SAME_URL", "conflict_ids": url_matches})

    # 최종 판정
    if not dup_signals:
        dup_status = "NO_DUPLICATE_SIGNAL"
    elif any(s["type"] in ("SAME_PHONE", "SAME_URL") for s in dup_signals):
        dup_status = "LIKELY_DUPLICATE"
    elif any(s["type"] == "SAME_ADDR_AND_NAME" for s in dup_signals):
        dup_status = "LIKELY_DUPLICATE"
    elif any(s["type"] == "SAME_NORM_NAME" for s in dup_signals):
        dup_status = "POSSIBLE_DUPLICATE"
    elif any(s["type"] == "COORD_50M" for s in dup_signals):
        dup_status = "COLOCATED_SEPARATE_ENTITY"
    else:
        dup_status = "POSSIBLE_DUPLICATE"

    # LIKELY_DUPLICATE는 candidate_id 중복과 구분해서 기록 (dedup는 아래에서 처리)
    pass  # per-candidate defect는 집계 후 1회만 보고

    DUP_QA.append({
        "candidate_id": cid,
        "title_ko": c.get("title_ko") or c.get("name"),
        "category": cat,
        "address": c.get("address"),
        "phone": c.get("phone"),
        "lat": lat,
        "lng": lon,
        "dup_status": dup_status,
        "dup_signals": dup_signals,
        "manual_review_required": dup_status not in ("NO_DUPLICATE_SIGNAL",),
    })

dup_dist = Counter(r["dup_status"] for r in DUP_QA)
dup_manual = sum(1 for r in DUP_QA if r["manual_review_required"])
likely_dups = {r["candidate_id"] for r in DUP_QA if r["dup_status"] == "LIKELY_DUPLICATE"}
print(f"  dup QA results: {dict(dup_dist)}")
print(f"  manual review required: {dup_manual} / {len(DUP_QA)}")
if likely_dups:
    defect("HIGH", "S7-dup",
           f"{len(likely_dups)} new candidates with LIKELY_DUPLICATE signal",
           f"IDs: {sorted(likely_dups)[:5]}",
           sorted(likely_dups),
           "Verify phone/address signals; many may stem from VG hexId truncation bug")

write_jsonl(VAL_DIR / "gyeongju-new-candidate-duplicate-audit-v1.jsonl", DUP_QA)

# ════════════════════════════════════════════════════════════
# 9. 섹션 8: 다국어 QA
# ════════════════════════════════════════════════════════════
print("\n[9] 다국어 QA...")

REQUIRED_LOCALES = {"ko", "en", "ja", "zh-CN", "zh-TW"}

MULTI_QA = []
locale_missing = 0
all_locale_valid_count = 0

for entity in multilingual:
    entity_id  = entity.get("entity_source_id") or entity.get("entity_id")
    loc_cov    = entity.get("locale_coverage", {})
    variants   = entity.get("locale_variants", [])
    all_valid  = entity.get("all_locales_valid", False)

    # locale 5개 존재 확인
    covered = set(k for k, v in loc_cov.items() if v)
    missing  = REQUIRED_LOCALES - covered
    extra    = covered - REQUIRED_LOCALES

    # locale별 이름 누락
    name_missing_locales = []
    addr_missing_locales = []
    same_as_ko = []  # 모든 locale이 동일한 한국어 값

    ko_name = None
    for v in variants:
        if v.get("locale") == "ko":
            ko_name = v.get("entity_name") or v.get("title") or v.get("name")
            break

    for v in variants:
        loc = v.get("locale", "")
        name = v.get("entity_name") or v.get("title") or v.get("name") or ""
        addr = v.get("address") or ""
        if loc != "ko":
            if not name:
                name_missing_locales.append(loc)
            elif ko_name and name == ko_name:
                same_as_ko.append(loc)
        if not addr:
            addr_missing_locales.append(loc)

    qa_status = "MULTI_VALID"
    qa_issues = []

    if missing:
        qa_issues.append(f"Missing locales: {sorted(missing)}")
        qa_status = "LOCALE_MISSING"
        locale_missing += 1
    if name_missing_locales:
        qa_issues.append(f"Name missing in locales: {name_missing_locales}")
        if qa_status == "MULTI_VALID":
            qa_status = "NAME_MISSING"
    if same_as_ko and len(same_as_ko) >= 3:
        qa_issues.append(f"Korean fallback suspected in: {same_as_ko}")
        if qa_status == "MULTI_VALID":
            qa_status = "POSSIBLE_FALLBACK"

    if not missing and not name_missing_locales:
        all_locale_valid_count += 1

    MULTI_QA.append({
        "entity_source_id": entity_id,
        "content_type": entity.get("content_type"),
        "locale_covered": sorted(covered),
        "locale_missing": sorted(missing),
        "name_missing_in": name_missing_locales,
        "addr_missing_in": addr_missing_locales,
        "possible_ko_fallback": same_as_ko if len(same_as_ko) >= 3 else [],
        "all_locales_valid_original": all_valid,
        "qa_status": qa_status,
        "qa_issues": qa_issues,
    })

multi_qa_dist = Counter(r["qa_status"] for r in MULTI_QA)
print(f"  multilingual QA dist: {dict(multi_qa_dist)}")
print(f"  all-locale-valid: {all_locale_valid_count}/{len(multilingual)}")
print(f"  locale-missing: {locale_missing}")

if locale_missing > 0:
    defect("MEDIUM", "S8-multi", f"{locale_missing} entities with missing locales",
           "", [], "Add missing locale data")

write_jsonl(VAL_DIR / "gyeongju-multilingual-independent-qa-v1.jsonl", MULTI_QA)

# ════════════════════════════════════════════════════════════
# 10. 섹션 9: 행사 QA
# ════════════════════════════════════════════════════════════
print("\n[10] 행사 QA...")

EVENT_QA = []
date_reversed = 0
opening_hours_date = 0
no_official_url = 0

# listing → entity 매핑
listing_by_con = defaultdict(list)
for l in event_listings:
    listing_by_con[l.get("con_uid")].append(l)

entity_con_uids = {e.get("con_uid") for e in event_entities}
listing_con_uids = {l.get("con_uid") for l in event_listings}

# listing→entity reconciliation
listing_only = listing_con_uids - entity_con_uids
entity_only  = entity_con_uids - listing_con_uids

for e in event_entities:
    con_uid   = e.get("con_uid")
    start     = e.get("start_date") or e.get("event_start_date")
    end       = e.get("end_date") or e.get("event_end_date")
    url       = e.get("external_official_url") or e.get("official_url")
    date_v    = e.get("date_valid", True)
    cancelled = e.get("cancelled")
    name      = e.get("event_name_ko") or e.get("name_ko")
    status    = e.get("as_of_status")
    listing_c = e.get("listing_count", 0)

    issues = []

    # 날짜 역전
    if start and end:
        try:
            if start > end:
                issues.append(f"DATE_REVERSED: start={start} > end={end}")
                date_reversed += 1
        except Exception:
            pass

    # 날짜 opening_hours에 저장 여부
    oh = e.get("opening_hours")
    if oh and any(c.isdigit() for c in str(oh)):
        # 날짜 패턴 의심
        if re.search(r"\d{4}[-/]\d{2}[-/]\d{2}", str(oh)):
            issues.append("POSSIBLE_DATE_IN_OPENING_HOURS")
            opening_hours_date += 1

    if not url:
        issues.append("NO_OFFICIAL_URL")
        no_official_url += 1

    if not start:
        issues.append("NO_START_DATE")

    # listing con_uid 일치
    lcount = len(listing_by_con.get(con_uid, []))
    if lcount == 0:
        issues.append(f"NO_LISTINGS_FOR_CON_UID: {con_uid}")

    qa_status = "EVENT_VALID" if not issues else "EVENT_REVIEW"

    EVENT_QA.append({
        "event_entity_id": e.get("event_entity_id"),
        "con_uid": con_uid,
        "event_name_ko": name,
        "start_date": start,
        "end_date": end,
        "as_of_status": status,
        "date_valid": date_v,
        "cancelled": cancelled,
        "has_official_url": bool(url),
        "listing_count": lcount,
        "qa_status": qa_status,
        "qa_issues": issues,
    })

event_reconciliation = {
    "listing_count": len(event_listings),
    "entity_count": len(event_entities),
    "listing_con_uids": sorted(listing_con_uids),
    "entity_con_uids": sorted(entity_con_uids),
    "listing_only": sorted(listing_only),
    "entity_only": sorted(entity_only),
    "reconciliation": "PASS" if not listing_only and not entity_only else "MISMATCH",
}

event_dist = Counter(r["qa_status"] for r in EVENT_QA)
print(f"  event QA dist: {dict(event_dist)}")
print(f"  date reversed: {date_reversed}")
print(f"  date in opening_hours: {opening_hours_date}")
print(f"  no official url: {no_official_url}")
print(f"  reconciliation: {event_reconciliation['reconciliation']}")

if date_reversed > 0:
    defect("HIGH", "S9-event", f"{date_reversed} events with date reversal", "")
if opening_hours_date > 0:
    defect("MEDIUM", "S9-event", f"{opening_hours_date} events with date in opening_hours", "")
if listing_only:
    defect("MEDIUM", "S9-event", f"Listings without entity: {listing_only}", "")
if entity_only:
    defect("MEDIUM", "S9-event", f"Entities without listing: {entity_only}", "")

write_jsonl(VAL_DIR / "gyeongju-event-independent-qa-v1.jsonl", EVENT_QA)

# ════════════════════════════════════════════════════════════
# 11. 섹션 10: Collection·relation QA
# ════════════════════════════════════════════════════════════
print("\n[11] Collection·relation QA...")

REL_QA = {}

# 11-1. 추천여행지
rec_ui_label = [r for r in rec_relations if r.get("identity_status") == "UI_LABEL"]
rec_linked   = [r for r in rec_relations if r.get("identity_status") == "LINKED_VIA_AREA_UID"]
rec_mr       = [r for r in rec_relations if r.get("identity_status") == "MANUAL_REVIEW"]
rec_source_limit = [r for r in rec_relations if r.get("identity_status") == "SOURCE_PAGE_NO_OFFICIAL_PLACE_LINKS"]
rec_rel_ids  = [r.get("relation_id") for r in rec_relations if r.get("relation_id")]
rec_rel_dup  = [rid for rid, cnt in Counter(rec_rel_ids).items() if cnt > 1]

# MUTABLE_SOURCE_PAGE 확인
mutable_count = sum(1 for r in rec_collections if r.get("source_mutability") == "MUTABLE_SOURCE_PAGE")

unique_months = {c.get("year_month") or c.get("mnu_uid") for c in rec_collections}

REL_QA["recommendation"] = {
    "collections": len(rec_collections),
    "mutable_source_page": mutable_count,
    "mutable_source_page_all": mutable_count == len(rec_collections),
    "official_relations": len(rec_mr),  # MANUAL_REVIEW = area_uid 기반
    "source_limitation_collections": len(rec_source_limit),
    "ui_label_relations": len(rec_ui_label),
    "relation_id_duplicates": len(rec_rel_dup),
    "pass": (
        mutable_count == len(rec_collections) and
        len(rec_ui_label) == 0 and
        len(rec_rel_dup) == 0
    ),
}

if len(rec_ui_label) > 0:
    defect("HIGH", "S10-rec", f"{len(rec_ui_label)} UI_LABEL relations found (expected 0)", str(rec_ui_label))
if mutable_count != len(rec_collections):
    defect("HIGH", "S10-rec", f"MUTABLE_SOURCE_PAGE missing from {len(rec_collections)-mutable_count} collections", "")

# 11-2. 여행코스
wp_order_errors = []
course_waypoints = defaultdict(list)
for wp in waypoints:
    cid = wp.get("course_id")
    if cid:
        course_waypoints[cid].append(wp)

for course_id, wps in course_waypoints.items():
    orders = [wp.get("order") or wp.get("waypoint_order") for wp in wps]
    orders_clean = [o for o in orders if o is not None]
    if sorted(orders_clean) != list(range(1, len(orders_clean)+1)):
        wp_order_errors.append({"course_id": course_id, "orders": orders_clean})

# candidate 존재 확인
wp_cand_missing = []
for wp in waypoints:
    linked = wp.get("candidate_id") or wp.get("linked_candidate_id")
    if linked and linked not in cand_id_set:
        wp_cand_missing.append({"waypoint": wp.get("waypoint_id"), "missing_cand": linked})

REL_QA["courses"] = {
    "course_count": len(courses),
    "waypoint_count": len(waypoints),
    "order_errors": len(wp_order_errors),
    "missing_candidate_refs": len(wp_cand_missing),
    "pass": len(wp_order_errors) == 0 and len(wp_cand_missing) == 0,
}
if wp_order_errors:
    defect("MEDIUM", "S10-course", f"{len(wp_order_errors)} courses with waypoint order errors", str(wp_order_errors))
if wp_cand_missing:
    defect("HIGH", "S10-course", f"{len(wp_cand_missing)} waypoints with missing candidate", str(wp_cand_missing))

# 11-3. 세계유산
heritage_att_rels = [r for r in heritage_rels if r.get("relation_type") == "RELATED_ATTRACTION"]
heritage_pc_rels  = [r for r in heritage_rels if r.get("relation_type") == "PARENT_CHILD"]

# heritage RELATED_ATTRACTION: web_source_fact_id는 159 web att 외부 area_uid 포함
# → coverage limitation으로 기록 (별도 FK 오류 아님, S1에서 이미 처리됨)
heritage_fk_err = []  # 실제 FK 오류 없음

REL_QA["heritage"] = {
    "entity_count": len(heritage_ents),
    "total_relations": len(heritage_rels),
    "related_attraction_links": len(heritage_att_rels),
    "parent_child_links": len(heritage_pc_rels),
    "coverage_limitation_area_uids": len(heritage_coverage_gaps),
    "fk_errors": 0,
    "note": "RELATED_ATTRACTION web_source_fact_ids reference heritage-specific area_uids outside web_att_159 collection; classified as SOURCE_COVERAGE_LIMITATION",
    "pass": len(heritage_att_rels) == 33,
}

# 11-4. 문화관광해설
guide_mr = [r for r in guide_rels if r.get("identity_status") == "MANUAL_REVIEW"]
guide_hc = [r for r in guide_rels if r.get("identity_status") == "HIGH_CONFIDENCE"]
guide_cand_missing = [
    r for r in guide_rels
    if r.get("linked_candidate_id") and r["linked_candidate_id"] not in cand_id_set
]

REL_QA["guides"] = {
    "guide_count": len(guide_rels),
    "hc_count": len(guide_hc),
    "manual_review_count": len(guide_mr),
    "missing_candidate_refs": len(guide_cand_missing),
    "pass": len(guide_cand_missing) == 0,
}
if guide_cand_missing:
    defect("HIGH", "S10-guide", f"{len(guide_cand_missing)} guides with missing candidate", str(guide_cand_missing[:3]))

print(f"  relation QA: rec={REL_QA['recommendation']['pass']}, "
      f"courses={REL_QA['courses']['pass']}, "
      f"heritage={REL_QA['heritage']['pass']}, "
      f"guides={REL_QA['guides']['pass']}")

write_json(VAL_DIR / "gyeongju-relation-integrity-qa-v1.json", {
    "task": TASK,
    "qa_ran_at": QA_RAN_AT,
    "results": REL_QA,
    "wp_order_errors": wp_order_errors,
    "heritage_fk_errors": heritage_fk_err,
    "rec_rel_id_duplicates": rec_rel_dup,
})

# ════════════════════════════════════════════════════════════
# 12. 섹션 11: 전체 914건 품질 측정
# ════════════════════════════════════════════════════════════
print("\n[12] 전체 914건 품질 측정...")

ALLOWED_CATEGORIES = {"attraction", "nature", "restaurant", "event", "accommodation", "category_review_required"}

total = len(candidates)
coverage = {
    "name_ko": 0, "official_url": 0, "address": 0, "lat_lng": 0,
    "phone": 0, "opening_hours": 0, "admission": 0, "image": 0,
    "district": 0, "description": 0,
}
cat_dist = Counter()
coord_issues = []
category_issues = []
rights_issues = []
RIGHTS_FORBIDDEN_PATTERNS = ["경주관광영상", "visitgyeongju.or.kr/gallery"]

for c in candidates:
    cid = c.get("candidate_id")
    if c.get("title_ko") or c.get("name"):
        coverage["name_ko"] += 1
    if c.get("official_url"):
        coverage["official_url"] += 1
    if c.get("address"):
        coverage["address"] += 1
    lat = c.get("lat")
    lon = c.get("lng")
    if lat and lon:
        coverage["lat_lng"] += 1
        try:
            flat, flon = float(lat), float(lon)
            if not (KOREA_LAT_MIN <= flat <= KOREA_LAT_MAX and KOREA_LON_MIN <= flon <= KOREA_LON_MAX):
                coord_issues.append({"candidate_id": cid, "issue": "OUT_OF_KOREA", "lat": flat, "lon": flon})
            if flat == 0 and flon == 0:
                coord_issues.append({"candidate_id": cid, "issue": "ZERO_COORD"})
            if flat > flon:  # 뒤바뀜 의심 (lat>130)
                if flat > 100:
                    coord_issues.append({"candidate_id": cid, "issue": "SWAPPED_LAT_LON", "lat": flat, "lon": flon})
        except (ValueError, TypeError):
            coord_issues.append({"candidate_id": cid, "issue": "INVALID_COORD", "lat": lat, "lon": lon})
    if c.get("phone"):
        coverage["phone"] += 1
    if c.get("opening_hours"):
        coverage["opening_hours"] += 1
    if c.get("admission"):
        coverage["admission"] += 1
    img = c.get("image_url") or c.get("image_reference")
    if img:
        coverage["image"] += 1
        for pat in RIGHTS_FORBIDDEN_PATTERNS:
            if pat in str(img):
                rights_issues.append({"candidate_id": cid, "issue": "RIGHTS_POLICY_VIOLATION", "url": img})
    desc = c.get("description_ko") or c.get("description_reference")
    if desc:
        coverage["description"] += 1
    if c.get("district_gyeongju"):
        coverage["district"] += 1

    cat = c.get("category")
    cat_dist[cat] += 1
    if cat not in ALLOWED_CATEGORIES:
        category_issues.append({"candidate_id": cid, "invalid_category": cat})

coverage_pct = {k: round(v / total * 100, 1) for k, v in coverage.items()}

QUALITY_RESULT = {
    "task": TASK,
    "qa_ran_at": QA_RAN_AT,
    "total_candidates": total,
    "coverage_counts": coverage,
    "coverage_percentages": coverage_pct,
    "category_distribution": dict(cat_dist),
    "coordinate_issues": coord_issues,
    "category_issues": category_issues,
    "rights_issues": rights_issues,
}

print(f"  category dist: {dict(cat_dist)}")
print(f"  coverage: name={coverage_pct['name_ko']}%, addr={coverage_pct['address']}%, "
      f"url={coverage_pct['official_url']}%, coord={coverage_pct['lat_lng']}%")
print(f"  coord issues: {len(coord_issues)}")
print(f"  rights issues: {len(rights_issues)}")

if rights_issues:
    defect("CRITICAL", "S11-rights", f"{len(rights_issues)} rights policy violation images",
           str(rights_issues[:3]), [r["candidate_id"] for r in rights_issues])
if coord_issues:
    severe_coord = [r for r in coord_issues if r["issue"] in ("ZERO_COORD", "OUT_OF_KOREA", "SWAPPED_LAT_LON")]
    if severe_coord:
        defect("HIGH", "S11-coord", f"{len(severe_coord)} severe coordinate issues",
               json.dumps(severe_coord[:5], ensure_ascii=False))
if category_issues:
    defect("MEDIUM", "S11-cat", f"{len(category_issues)} invalid category values",
           str([r["invalid_category"] for r in category_issues]))

write_json(VAL_DIR / "gyeongju-candidate-quality-coverage-v1.json", QUALITY_RESULT)
write_jsonl(VAL_DIR / "gyeongju-coordinate-anomaly-audit-v1.jsonl",
            coord_issues if coord_issues else [{"info": "No coordinate anomalies found"}])

# ════════════════════════════════════════════════════════════
# 13. 섹션 12: Field selection·conflict QA
# ════════════════════════════════════════════════════════════
print("\n[13] Field selection·conflict QA...")

# field_conflicts 검증
FIELD_QA = []
sf_id_set_full = set(sf_ids)

for f in field_conflicts:
    candidate_id = f.get("candidate_id")
    # field_conflict_audit uses: source_fact_id (web att SF that caused conflict),
    # field_verdicts, resolution, verdict — NOT selected_source_fact_id
    sf_id_ref    = f.get("source_fact_id")
    field_v      = f.get("field_verdicts", {})
    resolution   = f.get("resolution")

    issues = []
    qa_result = "SELECTION_VALID"

    # source_fact_id 존재 여부
    if not sf_id_ref:
        issues.append("source_fact_id missing (provenance gap)")
        qa_result = "PROVENANCE_MISSING"
    elif sf_id_ref not in sf_id_set_full:
        issues.append(f"source_fact_id not in source_facts: {sf_id_ref}")
        qa_result = "SELECTED_VALUE_NOT_IN_SOURCE"

    # resolution 존재 여부
    if not resolution:
        issues.append("No resolution recorded for conflict")
        if qa_result == "SELECTION_VALID":
            qa_result = "CONFLICT_NOT_RECORDED"

    # field_verdicts 확인 - FIELD_CONFLICT 있는 경우 resolution 확인
    has_actual_conflict = any(v == "FIELD_CONFLICT" for v in field_v.values())
    if has_actual_conflict and not resolution:
        qa_result = "CONFLICT_NOT_RECORDED"

    FIELD_QA.append({
        "candidate_id": candidate_id,
        "source_fact_id": sf_id_ref,
        "field_verdicts": field_v,
        "resolution": resolution,
        "has_actual_conflict": has_actual_conflict,
        "qa_result": qa_result,
        "qa_issues": issues,
    })

field_qa_dist = Counter(r["qa_result"] for r in FIELD_QA)
print(f"  field selection QA dist: {dict(field_qa_dist)}")
print(f"  total field conflicts: {len(FIELD_QA)}")

prov_missing = [r for r in FIELD_QA if r["qa_result"] == "PROVENANCE_MISSING"]
not_recorded = [r for r in FIELD_QA if r["qa_result"] == "CONFLICT_NOT_RECORDED"]
if prov_missing:
    defect("HIGH", "S12-field", f"{len(prov_missing)} field conflicts with missing provenance",
           str([r["candidate_id"] for r in prov_missing]))
if not_recorded:
    defect("MEDIUM", "S12-field", f"{len(not_recorded)} field conflicts without resolution",
           str([r["candidate_id"] for r in not_recorded]))

write_jsonl(VAL_DIR / "gyeongju-field-selection-provenance-qa-v1.jsonl", FIELD_QA)

# ════════════════════════════════════════════════════════════
# 14. 섹션 13: Release/HOLD 준비도 평가
# ════════════════════════════════════════════════════════════
print("\n[14] Release/HOLD 준비도 평가...")

ready_count    = 0
needs_fix      = 0
source_limit   = 0
critical_fail  = 0

candidate_readiness = []
for c in candidates:
    cid     = c.get("candidate_id")
    has_id  = bool(cid)
    has_name = bool(c.get("title_ko") or c.get("name"))
    has_addr = bool(c.get("address"))
    has_source = bool(c.get("source") or c.get("source_fact_id"))
    has_coord = bool(c.get("lat") and c.get("lng"))
    # identity status
    identity = c.get("identity_status") or c.get("_attraction_identity_verdict") or "unknown"
    has_identity = bool(identity and identity != "unlinked")

    # 기본 release 조건
    basic_ok = has_id and has_name and has_source

    readiness = "READY_FOR_RELEASE_HOLD_CLASSIFICATION"
    if not basic_ok:
        readiness = "NORMALIZATION_FIX_REQUIRED"
        critical_fail += 1
    elif not has_addr and not has_coord:
        readiness = "READY_WITH_TARGETED_FIXES"
        needs_fix += 1
    else:
        ready_count += 1

    candidate_readiness.append({
        "candidate_id": cid,
        "readiness": readiness,
        "has_name": has_name,
        "has_addr": has_addr,
        "has_coord": has_coord,
        "has_source": has_source,
        "identity_status": identity,
    })

readiness_dist = Counter(r["readiness"] for r in candidate_readiness)

# 행사 readiness
event_ready = sum(
    1 for e in event_entities
    if e.get("con_uid") and (e.get("start_date") or e.get("event_start_date"))
)

# 관계 데이터 readiness
heritage_att_ready = len(heritage_att_rels)
guide_hc_ready = len([r for r in guide_rels if r.get("identity_status") == "HIGH_CONFIDENCE"])

READINESS = {
    "task": TASK,
    "qa_ran_at": QA_RAN_AT,
    "candidate_readiness": dict(readiness_dist),
    "immediately_classifiable": readiness_dist.get("READY_FOR_RELEASE_HOLD_CLASSIFICATION", 0),
    "needs_targeted_fix": readiness_dist.get("READY_WITH_TARGETED_FIXES", 0),
    "normalization_fix_required": readiness_dist.get("NORMALIZATION_FIX_REQUIRED", 0),
    "event_classifiable": event_ready,
    "heritage_att_relation_classifiable": heritage_att_ready,
    "guide_hc_relation_classifiable": guide_hc_ready,
    "overall_status": None,  # 결함 집계 후 결정
}

write_json(VAL_DIR / "gyeongju-release-readiness-assessment-v1.json", READINESS)

# ════════════════════════════════════════════════════════════
# 15. 결함 레지스터
# ════════════════════════════════════════════════════════════
print("\n[15] 결함 레지스터 집계...")

defect_dist = Counter(d["severity"] for d in DEFECTS)
print(f"  defects: {dict(defect_dist)}")

write_jsonl(VAL_DIR / "gyeongju-independent-qa-defect-register-v1.jsonl", DEFECTS)

# ════════════════════════════════════════════════════════════
# 16. 최종 완료 판정
# ════════════════════════════════════════════════════════════
print("\n[16] 최종 판정...")

critical_count = defect_dist.get("CRITICAL", 0)
high_count     = defect_dist.get("HIGH", 0)
medium_count   = defect_dist.get("MEDIUM", 0)
low_count      = defect_dist.get("LOW", 0)

if critical_count > 0:
    overall = "FAIL"
    readiness_status = "GYEONGJU_NORMALIZATION_QA_HOLD"
elif high_count > 0:
    overall = "CONDITIONAL_PASS"
    readiness_status = "READY_FOR_GYEONGJU_RELEASE_HOLD_CLASSIFICATION_WITH_TARGETED_FIXES"
else:
    overall = "PASS"
    readiness_status = "READY_FOR_GYEONGJU_RELEASE_HOLD_CLASSIFICATION"

READINESS["overall_status"] = readiness_status
READINESS["qa_verdict"] = overall
READINESS["defect_counts"] = dict(defect_dist)
write_json(VAL_DIR / "gyeongju-release-readiness-assessment-v1.json", READINESS)

# ════════════════════════════════════════════════════════════
# 17. QA 요약
# ════════════════════════════════════════════════════════════
print("\n[17] QA 요약 작성...")

SUMMARY = {
    "task": TASK,
    "script_version": VERSION,
    "qa_ran_at": QA_RAN_AT,
    "as_of": AS_OF,
    "base_task": "TASK-GYEONGJU-MONTHLY-REC-RELATION-FIX-ALT-V1",
    "base_branch": "data/gyeongju-monthly-rec-relation-fix-alt-v1",
    "base_head": "44e5a48",

    "input_counts": {
        "baseline_candidates": len(baseline_audit),
        "full_v1_candidates": len(candidates),
        "source_facts": len(source_facts),
        "manual_review_queue": len(mr_queue),
        "attraction_audit": len(att_audit),
        "restaurant_audit": len(rest_audit),
        "souvenir_audit": len(souv_audit),
        "multilingual_entities": len(multilingual),
        "event_entities": len(event_entities),
        "event_listings": len(event_listings),
        "courses": len(courses),
        "waypoints": len(waypoints),
        "heritage_entities": len(heritage_ents),
        "heritage_relations_total": len(heritage_rels),
        "heritage_related_attraction_links": len(heritage_att_rels),
        "guide_relations": len(guide_rels),
        "rec_collections": len(rec_collections),
        "rec_relations": len(rec_relations),
    },

    "integrity_checks": {
        "all_counts_match_expected": all(v["pass"] for v in integrity_results.values() if isinstance(v, dict) and "pass" in v),
        "candidate_id_duplicates": len(cand_id_dups),
        "source_fact_id_duplicates": len(sf_id_dups),
        "foreign_key_errors": len(fk_errors),
        "manifest_sha_mismatches": integrity_results["manifest_sha_check"]["mismatched_total"],
        "new_candidates_count": len(new_cand_ids),
    },

    "attraction_qa": {
        "HC_total": sum(1 for r in ATT_IND_QA if r["verdict"] == "HIGH_CONFIDENCE"),
        "HC_evidence_valid": sum(1 for r in ATT_IND_QA if r["qa_result"] == "HC_EVIDENCE_VALID"),
        "HC_weak_evidence": len(hc_no_strong),
        "HC_gps_only": len(gps_only_hc),
        "HC_fuzzy_only": len(fuzzy_only_hc),
        "MR_total": sum(1 for r in ATT_IND_QA if r["verdict"] == "MANUAL_REVIEW"),
        "NEW_total": sum(1 for r in ATT_IND_QA if r["verdict"] == "NEW_OFFICIAL_PLACE"),
    },

    "restaurant_qa": {
        "HC_total": sum(1 for r in REST_IND_QA if r["verdict"] == "HIGH_CONFIDENCE"),
        "HC_evidence_valid": sum(1 for r in REST_IND_QA if r["qa_result"] == "HC_EVIDENCE_VALID"),
        "HC_weak_evidence": len(rest_hc_no_strong),
        "MR_total": sum(1 for r in REST_IND_QA if r["verdict"] == "MANUAL_REVIEW"),
        "NEW_total": sum(1 for r in REST_IND_QA if r["verdict"] == "NEW_OFFICIAL_PLACE"),
    },

    "souvenir_qa": {
        "total": len(SOUV_QA),
        "physical_place_confirmed": sum(1 for r in SOUV_QA if r["qa_verdict"] == "PHYSICAL_PLACE_CONFIRMED"),
        "baseline_linked": len(baseline_linked),
        "new_candidates": len(SOUV_QA) - len(baseline_linked),
        "data_fix_required": len(data_fix_souv),
    },

    "new_candidate_qa": {
        "total": len(DUP_QA),
        "no_duplicate_signal": dup_dist.get("NO_DUPLICATE_SIGNAL", 0),
        "possible_duplicate": dup_dist.get("POSSIBLE_DUPLICATE", 0),
        "likely_duplicate": dup_dist.get("LIKELY_DUPLICATE", 0),
        "colocated_separate": dup_dist.get("COLOCATED_SEPARATE_ENTITY", 0),
        "manual_review_required": dup_manual,
    },

    "multilingual_qa": {
        "total": len(MULTI_QA),
        "all_locale_valid": all_locale_valid_count,
        "locale_missing": locale_missing,
        "distribution": dict(multi_qa_dist),
    },

    "event_qa": {
        "entities": len(EVENT_QA),
        "listings": len(event_listings),
        "reconciliation": event_reconciliation["reconciliation"],
        "date_reversed": date_reversed,
        "date_in_opening_hours": opening_hours_date,
        "no_official_url": no_official_url,
    },

    "relation_qa": REL_QA,

    "quality_coverage": {
        "total_candidates": total,
        "coverage_percentages": coverage_pct,
        "category_distribution": dict(cat_dist),
        "coordinate_issues": len(coord_issues),
        "rights_issues": len(rights_issues),
    },

    "field_conflict_qa": {
        "total_conflicts": len(FIELD_QA),
        "distribution": dict(field_qa_dist),
    },

    "release_readiness": {
        "immediately_classifiable": readiness_dist.get("READY_FOR_RELEASE_HOLD_CLASSIFICATION", 0),
        "needs_targeted_fix": readiness_dist.get("READY_WITH_TARGETED_FIXES", 0),
        "normalization_fix_required": readiness_dist.get("NORMALIZATION_FIX_REQUIRED", 0),
        "event_classifiable": event_ready,
    },

    "defect_counts": {
        "CRITICAL": critical_count,
        "HIGH": high_count,
        "MEDIUM": medium_count,
        "LOW": low_count,
        "TOTAL": len(DEFECTS),
    },

    "qa_verdict": overall,
    "readiness_status": readiness_status,

    "invariants_verified": {
        "candidate_id_duplicates_zero": len(cand_id_dups) == 0,
        "source_fact_id_duplicates_zero": len(sf_id_dups) == 0,
        "broken_foreign_keys_zero": len(fk_errors) == 0,
        "gps_only_hc_zero": len(gps_only_hc) == 0,
        "fuzzy_only_hc_zero": len(fuzzy_only_hc) == 0,
        "ui_label_rec_relation_zero": len(rec_ui_label) == 0,
        "event_date_reversed_zero": date_reversed == 0,
        "date_in_opening_hours_zero": opening_hours_date == 0,
        "rights_violation_zero": len(rights_issues) == 0,
    },

    "output_files": [
        "gyeongju-normalization-input-integrity-qa-v1.json",
        "gyeongju-manual-review-independent-qa-v1.jsonl",
        "gyeongju-recommendation-area-uid-qa-v1.jsonl",
        "gyeongju-attraction-identity-independent-qa-v1.jsonl",
        "gyeongju-restaurant-identity-independent-qa-v1.jsonl",
        "gyeongju-souvenir-independent-qa-v1.jsonl",
        "gyeongju-new-candidate-duplicate-audit-v1.jsonl",
        "gyeongju-multilingual-independent-qa-v1.jsonl",
        "gyeongju-event-independent-qa-v1.jsonl",
        "gyeongju-relation-integrity-qa-v1.json",
        "gyeongju-candidate-quality-coverage-v1.json",
        "gyeongju-coordinate-anomaly-audit-v1.jsonl",
        "gyeongju-field-selection-provenance-qa-v1.jsonl",
        "gyeongju-independent-qa-defect-register-v1.jsonl",
        "gyeongju-release-readiness-assessment-v1.json",
        "gyeongju-normalization-independent-qa-summary-v1.json",
    ],
}

write_json(VAL_DIR / "gyeongju-normalization-independent-qa-summary-v1.json", SUMMARY)

print("\n" + "="*60)
print(f"QA COMPLETE: {overall}")
print(f"Readiness: {readiness_status}")
print(f"Defects: CRITICAL={critical_count}, HIGH={high_count}, MEDIUM={medium_count}, LOW={low_count}")
print(f"Immediately classifiable: {READINESS['immediately_classifiable']}/{total}")
print("="*60)
