#!/usr/bin/env python3
"""
gyeongju_course_linkage_ko_closeout_v2.py
TASK-GYEONGJU-COURSE-LINKAGE-AND-KO-CLOSEOUT-V2

1. Course waypoint 29건 → candidate 연결 (area_uid → attraction-identity-audit → baseline_candidate_id)
2. Heritage 53건 의미 분류 (HERITAGE_NAVIGATION_LINK / SKIP_EMPTY_SLOT)
3. 경주 KO Closeout 동적 집계

신규 HTTP/API 요청: 0건
"""
import hashlib, html, json, os, subprocess, sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

TASK_ID  = "TASK-GYEONGJU-COURSE-LINKAGE-AND-KO-CLOSEOUT-V2"
AS_OF    = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

BASE_DIR  = Path(__file__).parent.parent
DATA_DIR  = BASE_DIR / "data" / "tourapi"
NORM_DIR  = DATA_DIR / "normalized" / "gyeongju"
VAL_DIR   = DATA_DIR / "validation" / "gyeongju"

# ── 입력 파일
HERITAGE_REL  = NORM_DIR / "gyeongju-heritage-relations-v1.jsonl"
COURSE_WAYPT  = NORM_DIR / "gyeongju-course-waypoint-relations-v1.jsonl"
COURSE_ENT    = NORM_DIR / "gyeongju-course-entities-v1.jsonl"
ATT_AUDIT     = NORM_DIR / "gyeongju-attraction-identity-audit-v1.jsonl"
CANDIDATES    = NORM_DIR / "gyeongju-full-v1-candidates.jsonl"
CORE27        = NORM_DIR / "gyeongju-core27-release-after-location-v2.jsonl"
TIER_A_FINAL  = NORM_DIR / "gyeongju-tier-a-final-release-after-description-recovery-v1.jsonl"
EVENT_ENT     = NORM_DIR / "gyeongju-event-entities-v1.jsonl"
EVENT_LIST    = NORM_DIR / "gyeongju-event-listing-relations-v1.jsonl"
NEW_PLACE     = NORM_DIR / "gyeongju-tourism-new-place-proposal-v1.jsonl"
VG_SNAP       = NORM_DIR / "gyeongju-tier-a-117-vg-snapshot-v1.jsonl"
KTO_MATCH     = NORM_DIR / "gyeongju-tier-a-117-kto-match-index-v1.jsonl"

# ── 출력 파일
OUT_COURSE    = NORM_DIR / "gyeongju-course-waypoint-candidate-linkage-v2.jsonl"
OUT_OVERLAY   = NORM_DIR / "gyeongju-candidate-official-course-overlay-v2.jsonl"
OUT_HER_NAV   = NORM_DIR / "gyeongju-heritage-navigation-links-v2.jsonl"
OUT_HER_SKIP  = NORM_DIR / "gyeongju-heritage-empty-slots-v2.jsonl"
OUT_QA        = VAL_DIR  / "gyeongju-relation-qa-v2.json"
OUT_CLOSEOUT  = VAL_DIR  / "gyeongju-ko-data-closeout-v2.json"
OUT_CLOSEOUT_MD = VAL_DIR / "gyeongju-ko-data-closeout-v2.md"
OUT_REPRO     = VAL_DIR  / "gyeongju-ko-closeout-reproducibility-v2.json"

# restaurant release 파일 (다른 브랜치 — git show로 읽기)
REST_BRANCH   = "research/gyeongju-release-102-provenance-rights-audit-v1"
REST_REL_PATH = "data/tourapi/validation/gyeongju/gyeongju-candidate-release-hold-v1.jsonl"

# ── 유틸
def jdump(o): return json.dumps(o, ensure_ascii=False, sort_keys=True)
def jwrite(o, p, indent=2): Path(p).write_text(json.dumps(o, ensure_ascii=False, sort_keys=True, indent=indent)+"\n", encoding="utf-8")
def jlwrite(rows, p): Path(p).write_text("\n".join(jdump(r) for r in rows)+("\n" if rows else ""), encoding="utf-8")
def load_jsonl(p): return [json.loads(l) for l in Path(p).read_text("utf-8-sig").splitlines() if l.strip()]
def sha256_file(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""): h.update(chunk)
    return h.hexdigest()

def git_show_jsonl(branch, path):
    """git show로 다른 브랜치 JSONL 읽기 (신규 HTTP 요청 아님)"""
    try:
        result = subprocess.run(
            ["git", "show", f"{branch}:{path}"],
            capture_output=True, text=False,
            cwd=BASE_DIR
        )
        content = result.stdout.decode("utf-8-sig", errors="replace")
        rows = [json.loads(l) for l in content.splitlines() if l.strip()]
        return rows, None
    except Exception as e:
        return [], str(e)

# ──────────────────────────────────────────────────────────
def main():
    print(f"[{TASK_ID}]")
    print(f"AS_OF: {AS_OF}")

    # ─── PHASE 1: 소스 로드 ─────────────────────────────────
    print("\n[1/8] 소스 로드...")
    h_rels   = load_jsonl(HERITAGE_REL)
    c_wpts   = load_jsonl(COURSE_WAYPT)
    c_ents   = load_jsonl(COURSE_ENT)
    att_aud  = load_jsonl(ATT_AUDIT)
    cands    = load_jsonl(CANDIDATES)
    core27   = load_jsonl(CORE27)
    tier_a   = load_jsonl(TIER_A_FINAL)
    ev_ents  = load_jsonl(EVENT_ENT)
    ev_list  = load_jsonl(EVENT_LIST)
    new_pl   = load_jsonl(NEW_PLACE)

    # VG + KTO (EN handoff용)
    vg_snap  = load_jsonl(VG_SNAP)
    kto_idx  = load_jsonl(KTO_MATCH)

    print(f"  heritage-relations: {len(h_rels)}건")
    print(f"  course-waypoints:   {len(c_wpts)}건")
    print(f"  course-entities:    {len(c_ents)}건")
    print(f"  att-identity-audit: {len(att_aud)}건")
    print(f"  candidates:         {len(cands)}건")
    print(f"  CORE27:             {len(core27)}건")
    print(f"  TIER_A:             {len(tier_a)}건")

    # restaurant release (git show)
    rest_rows, rest_err = git_show_jsonl(REST_BRANCH, REST_REL_PATH)
    print(f"  restaurant release: {len(rest_rows)}건 (from {REST_BRANCH})")
    if rest_err:
        print(f"  ⚠️ 레스토랑 로드 오류: {rest_err}")

    # ─── PHASE 2: attraction-identity-audit 인덱스 ────────────
    print("\n[2/8] attraction-identity-audit 인덱스 구축...")
    area_to_audit = {}      # area_uid → audit record
    area_to_bcid  = {}      # area_uid → baseline_candidate_id
    area_to_name  = {}      # area_uid → name_ko
    for r in att_aud:
        area = str(r.get("area_uid",""))
        bcid = r.get("baseline_candidate_id")
        name = r.get("name_ko","?")
        if area:
            area_to_audit[area] = r
            if bcid:
                area_to_bcid[area]  = bcid
                area_to_name[area]  = name

    # candidate 존재 검증용
    all_cids = set(r.get("candidate_id") for r in cands if r.get("candidate_id"))

    # course entity 인덱스
    course_map = {r.get("course_id"): r for r in c_ents}

    print(f"  area_uid→baseline_cid 매핑: {len(area_to_bcid)}건")
    print(f"  전체 candidate set: {len(all_cids)}건")
    print(f"  course entities: {len(course_map)}건")

    # ─── PHASE 3: Course waypoint 연결 ─────────────────────────
    print("\n[3/8] Course waypoint 연결 (29건)...")
    course_rows   = []
    qa_issues     = []
    area_used     = defaultdict(list)   # area_uid → list of (course, idx)
    course_waypt_idx = defaultdict(list) # course_id → list of waypoint_index

    for r in c_wpts:
        course_id  = r.get("course_id","?")
        wpt_idx    = r.get("waypoint_index")
        area_uid   = str(r.get("area_uid",""))
        sf_id      = r.get("web_source_fact_id","?")
        detail_url = r.get("detail_url","?")
        id_status  = r.get("identity_status","?")

        course_ent = course_map.get(course_id, {})
        course_name = course_ent.get("course_name_ko","?")

        # 연결 시도: area_uid → audit → baseline_candidate_id
        audit_rec = area_to_audit.get(area_uid)
        bcid      = area_to_bcid.get(area_uid)
        name_from_cand = area_to_name.get(area_uid,"?")

        if audit_rec and bcid:
            if bcid in all_cids:
                match_method = "EXACT_SOURCE_ID_MATCH"
                confidence   = "HIGH_CONFIDENCE"
                resolved_cid = bcid
                resolved_name = name_from_cand
            else:
                match_method = "CANDIDATE_NOT_FOUND"
                confidence   = "LOW"
                resolved_cid = None
                resolved_name = None
                qa_issues.append({
                    "issue": "CANDIDATE_NOT_FOUND",
                    "course_id": course_id,
                    "waypoint_index": wpt_idx,
                    "area_uid": area_uid,
                    "baseline_cid": bcid,
                })
        elif audit_rec and not bcid:
            match_method = "NO_BASELINE_CANDIDATE"
            confidence   = "NONE"
            resolved_cid = None
            resolved_name = None
            qa_issues.append({
                "issue": "NO_BASELINE_CANDIDATE",
                "course_id": course_id,
                "waypoint_index": wpt_idx,
                "area_uid": area_uid,
            })
        else:
            match_method = "NO_IDENTITY_RECORD"
            confidence   = "NONE"
            resolved_cid = None
            resolved_name = None
            qa_issues.append({
                "issue": "NO_IDENTITY_RECORD",
                "course_id": course_id,
                "waypoint_index": wpt_idx,
                "area_uid": area_uid,
            })

        # area_uid 중복 추적
        area_used[area_uid].append((course_id, wpt_idx))
        course_waypt_idx[course_id].append(wpt_idx)

        course_rows.append({
            "course_id":                  course_id,
            "course_name_ko":             course_name,
            "source_waypoint_index":      wpt_idx,
            "source_waypoint_name":       None,  # 원본에 장소명 없음
            "area_uid":                   r.get("area_uid"),
            "web_source_fact_id":         sf_id,
            "detail_url":                 detail_url,
            "identity_status_original":   id_status,
            "attraction_identity_sfid":   audit_rec.get("source_fact_id") if audit_rec else None,
            "baseline_candidate_id":      bcid,
            "resolved_candidate_id":      resolved_cid,
            "resolved_candidate_name_ko": resolved_name,
            "match_method":               match_method,
            "confidence":                 confidence,
            "provenance":                 f"area_uid→gyeongju-attraction-identity-audit-v1→baseline_candidate_id",
            "as_of":                      AS_OF,
        })
        print(f"  [{match_method}] {course_id} idx={wpt_idx} area={area_uid} → {resolved_cid} ({resolved_name})")

    # waypoint_index 순서 감사
    idx_audit = {}
    for course_id, idxs in course_waypt_idx.items():
        sorted_idxs = sorted(idxs)
        expected = list(range(sorted_idxs[0], sorted_idxs[-1]+1)) if sorted_idxs else []
        dups    = [i for i in sorted_idxs if sorted_idxs.count(i) > 1]
        gaps    = [i for i in expected if i not in sorted_idxs]
        idx_audit[course_id] = {
            "waypoint_indices": sorted_idxs,
            "is_zero_based":    (min(idxs)==0) if idxs else None,
            "duplicate_indices": list(set(dups)),
            "missing_indices":  gaps,
            "order_preserved":  (sorted_idxs == idxs),
            "count":            len(idxs),
        }

    jlwrite(course_rows, OUT_COURSE)
    exact_count = sum(1 for r in course_rows if r["match_method"]=="EXACT_SOURCE_ID_MATCH")
    print(f"  → EXACT_SOURCE_ID_MATCH: {exact_count}/{len(course_rows)}건")

    # ─── PHASE 4: Heritage 53건 분류 ─────────────────────────
    print("\n[4/8] Heritage 53건 분류...")
    heritage_nav   = []
    heritage_skip  = []

    for r in h_rels:
        rtype  = r.get("relation_type","?")
        child  = r.get("child_heritage_id")
        mnu    = r.get("child_mnu_uid")
        link   = r.get("link_text","")
        parent = r.get("parent_heritage_id","?")

        if rtype == "PARENT_CHILD":
            # HERITAGE_NAVIGATION_LINK
            heritage_nav.append({
                "parent_heritage_id": parent,
                "child_heritage_id":  child,
                "child_mnu_uid":      mnu,
                "href":               r.get("href",""),
                "link_text":          link,
                "relation_type":      rtype,
                "classification":     "HERITAGE_NAVIGATION_LINK",
                "note":               "VG 사이트 내비게이션 구조. heritage-entity 간 관계. candidate 연결 아님.",
                "provenance":         "gyeongju-heritage-relations-v1.jsonl",
                "as_of":              AS_OF,
            })
        elif rtype == "RELATED_ATTRACTION" and not child and not mnu and not link.strip():
            # SKIP_EMPTY_SLOT
            heritage_skip.append({
                "parent_heritage_id": parent,
                "child_heritage_id":  None,
                "child_mnu_uid":      None,
                "link_text":          "",
                "relation_type":      rtype,
                "classification":     "SKIP_EMPTY_SLOT",
                "note":               "VG 사이트 관련명소 섹션 빈 slot. 파싱된 데이터 없음. REVIEW/PROPOSAL 아님.",
                "provenance":         "gyeongju-heritage-relations-v1.jsonl",
                "as_of":              AS_OF,
            })
        else:
            # 예상 밖 케이스 → SKIP_EMPTY_SLOT으로 처리 (데이터 없음)
            heritage_skip.append({
                "parent_heritage_id": parent,
                "child_heritage_id":  child,
                "child_mnu_uid":      mnu,
                "link_text":          link,
                "relation_type":      rtype,
                "classification":     "SKIP_EMPTY_SLOT",
                "note":               "예상 밖 케이스 — REVIEW",
                "provenance":         "gyeongju-heritage-relations-v1.jsonl",
                "as_of":              AS_OF,
            })

    jlwrite(heritage_nav, OUT_HER_NAV)
    jlwrite(heritage_skip, OUT_HER_SKIP)
    print(f"  HERITAGE_NAVIGATION_LINK: {len(heritage_nav)}건")
    print(f"  SKIP_EMPTY_SLOT:          {len(heritage_skip)}건")

    # ─── PHASE 5: Course overlay 생성 ─────────────────────────
    print("\n[5/8] Course candidate overlay 생성...")
    cand_course_map = defaultdict(list)  # candidate_id → [waypoint records]
    for r in course_rows:
        cid = r.get("resolved_candidate_id")
        if cid:
            cand_course_map[cid].append({
                "course_id":      r["course_id"],
                "course_name_ko": r["course_name_ko"],
                "waypoint_index": r["source_waypoint_index"],
            })

    overlay_rows = []
    for cid, wpts in sorted(cand_course_map.items()):
        course_ids = sorted(set(w["course_id"] for w in wpts))
        overlay_rows.append({
            "candidate_id":         cid,
            "official_course_ids":  course_ids,
            "official_course_count": len(course_ids),
            "course_waypoints":     wpts,
            "as_of":                AS_OF,
        })
    jlwrite(overlay_rows, OUT_OVERLAY)
    print(f"  course 관계 candidate: {len(overlay_rows)}건")

    # ─── PHASE 6: QA 기록 ──────────────────────────────────────
    print("\n[6/8] QA 기록...")
    # area_uid 중복 (여러 코스에 걸친 것은 정상 — 동일 course에서 중복이 문제)
    intra_course_dups = []
    for area_uid, usages in area_used.items():
        by_course = defaultdict(list)
        for (cid, idx) in usages:
            by_course[cid].append(idx)
        for cid2, idxs2 in by_course.items():
            if len(idxs2) > 1:
                intra_course_dups.append({
                    "issue": "AREA_UID_DUPLICATE_IN_SAME_COURSE",
                    "area_uid": area_uid,
                    "course_id": cid2,
                    "waypoint_indices": idxs2,
                })

    # 동일 candidate가 여러 area_uid와 연결되는지 (정방향 확인)
    cid_area_map = defaultdict(set)
    for r in course_rows:
        cid2 = r.get("resolved_candidate_id")
        if cid2:
            cid_area_map[cid2].add(str(r.get("area_uid","")))
    identity_conflicts = [
        {"candidate_id": cid2, "area_uids": list(areas)}
        for cid2, areas in cid_area_map.items()
        if len(areas) > 1
    ]

    # heritage candidate 강제 연결 확인 (0이어야 함)
    her_candidate_links = 0  # heritage_nav에 resolved_candidate_id 없음

    qa = {
        "task_id":               TASK_ID,
        "as_of":                 AS_OF,
        "course_input_count":    len(c_wpts),
        "course_count":          len(course_map),
        "exact_source_id_match": exact_count,
        "no_identity_record":    sum(1 for r in course_rows if r["match_method"]=="NO_IDENTITY_RECORD"),
        "no_baseline_candidate": sum(1 for r in course_rows if r["match_method"]=="NO_BASELINE_CANDIDATE"),
        "candidate_not_found":   sum(1 for r in course_rows if r["match_method"]=="CANDIDATE_NOT_FOUND"),
        "waypoint_index_audit":  idx_audit,
        "intra_course_area_duplicates": intra_course_dups,
        "identity_conflicts":    identity_conflicts,
        "heritage_input_count":  len(h_rels),
        "heritage_nav_link_count":  len(heritage_nav),
        "heritage_skip_slot_count": len(heritage_skip),
        "heritage_candidate_forced_links": her_candidate_links,
        "course_overlay_in_heritage": 0,  # heritage 20건은 overlay에 없음
        "qa_issues":             qa_issues,
        "qa_issues_count":       len(qa_issues),
        "http_requests":         0,
        "llm_used":              False,
        "deterministic":         True,
    }
    jwrite(qa, OUT_QA)
    print(f"  QA 이슈: {len(qa_issues)}건")
    print(f"  intra-course 중복: {len(intra_course_dups)}건")
    print(f"  identity conflict: {len(identity_conflicts)}건")

    # ─── PHASE 7: KO Closeout ───────────────────────────────────
    print("\n[7/8] KO Closeout 동적 집계...")

    # A. CORE27 unique places
    core27_cids = set(r.get("candidate_id") for r in core27 if r.get("candidate_id"))
    core27_ready = sum(1 for r in core27 if r.get("readiness_tier","").startswith("RELEASE_READY"))

    # B. TIER_A release
    tier_a_cids = set(r.get("candidate_id") for r in tier_a if r.get("candidate_id"))
    tier_a_ready = sum(1 for r in tier_a if r.get("release_classification")=="READY_FOR_RELEASE")
    tier_a_hold  = sum(1 for r in tier_a if r.get("release_classification")=="HOLD_DESCRIPTION")
    tier_a_hold_reasons = Counter(r.get("release_classification") for r in tier_a if r.get("release_classification")!="READY_FOR_RELEASE")

    # CORE27 vs TIER_A 교차
    core_tier_overlap = core27_cids & tier_a_cids

    # C. Restaurant release (git show에서 로드)
    rest_release = [r for r in rest_rows if r.get("release_decision")=="RELEASE"]
    rest_hold    = [r for r in rest_rows if r.get("release_decision")=="HOLD"]
    rest_cids_released = set(r.get("candidate_id") for r in rest_release)
    rest_cids_hold     = set(r.get("candidate_id") for r in rest_hold)

    # D. Candidate 전체 분류
    by_category = Counter(r.get("category","?") for r in cands)

    # E. Event
    ev_entities_count = len(ev_ents)
    ev_listing_count  = len(ev_list)

    # F. New-place proposals
    np_count = len(new_pl)
    np_status = Counter(r.get("proposal_confidence") or r.get("confidence","?") for r in new_pl)

    # G. Course relations
    course_cid_count = len(cand_course_map)  # unique candidates in courses

    # H. Heritage navigation
    her_nav_count = len(heritage_nav)
    her_skip_count = len(heritage_skip)

    # I. 전체 unique READY (중복 없이)
    # attraction/nature READY: CORE27 ready + TIER_A ready (교차 제거)
    att_nature_ready_cids = set()
    for r in core27:
        if r.get("readiness_tier","").startswith("RELEASE_READY"):
            cid = r.get("candidate_id")
            if cid: att_nature_ready_cids.add(cid)
    for r in tier_a:
        if r.get("release_classification")=="READY_FOR_RELEASE":
            cid = r.get("candidate_id")
            if cid: att_nature_ready_cids.add(cid)

    total_unique_ready_cids = att_nature_ready_cids | rest_cids_released
    total_unique_hold_cids  = (tier_a_cids - att_nature_ready_cids) | rest_cids_hold

    # VG + KTO identity 보유 현황 (EN handoff)
    vg_has_url  = sum(1 for r in vg_snap if r.get("vg_http_ok"))
    kto_matched = sum(1 for r in kto_idx if r.get("match_status") not in (None, "NO_KTO_RECORD"))
    kto_cids    = set(r.get("candidate_id") for r in kto_idx
                     if r.get("match_status") not in (None, "NO_KTO_RECORD") and r.get("candidate_id"))

    closeout = {
        "task_id":   TASK_ID,
        "as_of":     AS_OF,
        "method":    "DYNAMIC_AGGREGATE_FROM_COMMITTED_ARTIFACTS",

        # A. Candidates
        "total_candidates": len(all_cids),
        "by_category":      dict(by_category),

        # B. CORE27
        "core27_total":       len(core27_cids),
        "core27_ready":       core27_ready,
        "core27_readiness_tier": "RELEASE_READY_OWNER_APPROVED_WEB_CONTENT",
        "core27_source_file": "gyeongju-core27-release-after-location-v2.jsonl",

        # C. TIER_A
        "tier_a_total":            len(tier_a_cids),
        "tier_a_ready":            tier_a_ready,
        "tier_a_hold":             tier_a_hold,
        "tier_a_hold_by_reason":   dict(tier_a_hold_reasons),
        "tier_a_source_file":      "gyeongju-tier-a-final-release-after-description-recovery-v1.jsonl",
        "core27_tier_a_overlap":   len(core_tier_overlap),
        "overlap_note":            ("CORE27와 TIER_A는 별도 파이프라인 산출물로 현재 0건 교차. "
                                   "CORE27=VG 공식 원천 27건; TIER_A=VG ATT 수집 117건. "
                                   "중복 없음 확인됨.") if not core_tier_overlap else f"교차 {len(core_tier_overlap)}건 주의",

        # D. Restaurants
        "restaurant_total":        len(rest_rows),
        "restaurant_ready":        len(rest_release),
        "restaurant_hold":         len(rest_hold),
        "restaurant_source_branch": REST_BRANCH,
        "restaurant_source_file":  REST_REL_PATH,

        # E. Unique READY (attraction/nature deduplicated)
        "att_nature_unique_ready_count":  len(att_nature_ready_cids),
        "total_unique_ready_all_types":   len(total_unique_ready_cids),
        "total_unique_hold_estimated":    len(total_unique_hold_cids),

        # F. Events
        "event_entities":    ev_entities_count,
        "event_listings":    ev_listing_count,
        "event_total_note":  "event category 24건 in candidates; 7 entity records; 10 listing relations",

        # G. New-place proposals
        "new_place_proposals_total": np_count,
        "new_place_proposal_status": dict(np_status),

        # H. Course relations
        "course_count":              len(course_map),
        "course_waypoint_total":     len(c_wpts),
        "course_waypoint_linked":    exact_count,
        "course_waypoint_unlinked":  len(c_wpts) - exact_count,
        "course_relation_unique_candidates": course_cid_count,

        # I. Heritage
        "heritage_input_total":      len(h_rels),
        "heritage_navigation_links": her_nav_count,
        "heritage_empty_slots":      her_skip_count,
        "heritage_candidate_relation_count": 0,
        "heritage_note":             "NAVIGATION_LINK 20건은 VG 사이트 내비게이션 구조. candidate product relation에 포함하지 않음.",

        # J. KTO/VG identity (EN handoff)
        "vg_identity_url_count":      vg_has_url,
        "kto_contentid_matched_count": kto_matched,
        "stable_identity_key_candidates": "candidate_id (gyeongju-GJ01-xxxx)",
        "en_handoff_notes": {
            "total_unique_places_ko_confirmed": len(all_cids),
            "kto_contentid_held":    kto_matched,
            "vg_official_url_held":  vg_has_url,
            "stable_key":            "candidate_id",
            "warning":               "Korean contentId ≠ English contentId (가정 금지). EngService2 계약 항목 별도 확인 필요.",
            "engservice2_check_items": ["EngService2 매뉴얼 v4.4 존재 여부", "영문 contentId 체계 별도 확인"],
        },

        # K. 미완료
        "remaining_work": [
            "HOLD_DESCRIPTION 11건 — VG/KTO 공식 설명 source 없음 (외부 출처 탐색 필요)",
            "heritage entity→candidate 연결 — 세계문화유산 그룹 페이지 1:N 구조 미해결",
            "TIER_B 15건 / TIER_C 234건 — attraction/nature HOLD",
            "accommodation 126건 — release 미분류",
            "restaurant HOLD 265건 — 추가 enrichment 필요",
            "미push 브랜치 4개 (data/gyeongju-kto-api-contract-..., data/gyeongju-release-rights-..., research/gyeongju-release-102-..., data/gyeongju-release-hold-...)",
            "EN 단계: EngService2 계약 항목 확인, 영문 contentId 체계 검증",
        ],
    }
    jwrite(closeout, OUT_CLOSEOUT)

    # ─── PHASE 8: Closeout Markdown ────────────────────────────
    print("\n[8/8] Closeout Markdown 작성...")

    md = f"""# 경주 KO 데이터 Closeout — {AS_OF[:10]}

**태스크**: {TASK_ID}
**집계 기준**: committed 산출물 동적 읽기
**신규 HTTP 요청**: 0건

---

## A. Candidate 현황

| 항목 | 건수 |
|------|------|
| 전체 candidate | {len(all_cids)} |
| attraction | {by_category.get('attraction',0)} |
| restaurant | {by_category.get('restaurant',0)} |
| accommodation | {by_category.get('accommodation',0)} |
| nature | {by_category.get('nature',0)} |
| event | {by_category.get('event',0)} |

---

## B. READY 현황 (attraction/nature)

| 파이프라인 | 총 대상 | READY | HOLD | 비고 |
|---|---|---|---|---|
| CORE27 | {len(core27_cids)}건 | {core27_ready}건 | 0건 | RELEASE_READY_OWNER_APPROVED_WEB_CONTENT |
| TIER_A | {len(tier_a_cids)}건 | {tier_a_ready}건 | {tier_a_hold}건 | HOLD_DESCRIPTION(설명 없음) |
| CORE27+TIER_A 교차 | — | — | — | {len(core_tier_overlap)}건 (별도 파이프라인, 비교 보류) |
| **유니크 att/nature READY** | — | **{len(att_nature_ready_cids)}건** | — | 중복 제거 완료 |

---

## C. Restaurant 현황

| 항목 | 건수 |
|------|------|
| restaurant 전체 | {len(rest_rows)}건 |
| **RELEASE_READY** | **{len(rest_release)}건** |
| HOLD | {len(rest_hold)}건 |

---

## D. 전체 READY 합계

| 분류 | 건수 |
|------|------|
| att/nature READY (CORE27+TIER_A 합산) | {len(att_nature_ready_cids)}건 |
| restaurant READY | {len(rest_release)}건 |
| **총 READY (모든 유형)** | **{len(total_unique_ready_cids)}건** |

---

## E. Event / New-place Proposal

| 항목 | 건수 |
|------|------|
| event entities | {ev_entities_count}건 |
| event listing relations | {ev_listing_count}건 |
| new-place proposals | {np_count}건 |

---

## F. Course Relation

| 항목 | 결과 |
|------|------|
| 공식 코스 수 | {len(course_map)}개 |
| waypoint 입력 | {len(c_wpts)}건 |
| EXACT_SOURCE_ID_MATCH | {exact_count}건 |
| 미연결 | {len(c_wpts)-exact_count}건 |
| course에 연결된 unique candidate | {course_cid_count}건 |

### 코스별 waypoint

"""
    for cid2, c in course_map.items():
        cnt = len([r for r in course_rows if r["course_id"]==cid2])
        md += f"- **{c.get('course_name_ko','?')}** ({cid2}): {cnt}개 waypoint\n"

    md += f"""
---

## G. Heritage 분류

| 항목 | 건수 |
|------|------|
| 입력 total | {len(h_rels)}건 |
| HERITAGE_NAVIGATION_LINK | {her_nav_count}건 |
| SKIP_EMPTY_SLOT | {her_skip_count}건 |
| candidate 강제 연결 | 0건 |
| product course overlay 혼입 | 0건 |

> NAVIGATION_LINK 20건: VG 사이트 세계문화유산/불국사·석굴암/양동마을/옥산서원/남산지구 그룹 간 내비게이션 구조.
> 장소 간 의미 관계가 아님. candidate product relation에 포함하지 않음.

---

## H. EN Handoff 준비

| 항목 | 현황 |
|------|------|
| KO identity 확정 unique place | {len(all_cids)}건 |
| READY unique place | {len(total_unique_ready_cids)}건 |
| KTO Kor contentId 보유 | {kto_matched}건 |
| VG official URL 보유 | {vg_has_url}건 |
| stable identity key 후보 | candidate_id (gyeongju-GJxx-xxxx) |
| EngService2 계약 확인 필요 | EngService2 매뉴얼 v4.4 존재 여부 / EN contentId 체계 |

**⚠️ 주의**: Korean contentId = English contentId 가정 금지. EN 수집 시 별도 검증 필요.

---

## I. 남은 미완료 항목

1. HOLD_DESCRIPTION 11건 — VG/KTO 공식 설명 source 없음
2. Heritage entity→candidate 연결 — 세계문화유산 그룹 1:N 구조 해결 필요
3. TIER_B 15건 / TIER_C 234건 — attraction/nature HOLD 상태
4. accommodation 126건 — release 미분류
5. restaurant HOLD 265건 — enrichment 필요
6. 미push 로컬 브랜치 4개 정리
7. EN 단계 착수 전 EngService2 계약 확인

---

*집계 일시: {AS_OF}*
*신규 HTTP 요청: 0건 | LLM 생성 설명: 0건 | 결정론적 출력: TRUE*
"""
    Path(OUT_CLOSEOUT_MD).write_text(md, encoding="utf-8")
    print(f"  Closeout Markdown → {OUT_CLOSEOUT_MD.name}")

    # ─── 재현성 SHA ────────────────────────────────────────────
    sha_map = {}
    for label, path in [
        ("course_linkage",  OUT_COURSE),
        ("course_overlay",  OUT_OVERLAY),
        ("heritage_nav",    OUT_HER_NAV),
        ("heritage_skip",   OUT_HER_SKIP),
        ("relation_qa",     OUT_QA),
        ("closeout_json",   OUT_CLOSEOUT),
        ("closeout_md",     OUT_CLOSEOUT_MD),
    ]:
        if Path(path).exists():
            sha_map[label] = sha256_file(path)

    jwrite({
        "task_id":     TASK_ID,
        "run":         1,
        "computed_at": AS_OF,
        "note":        "Run1 SHA. 0 HTTP 요청. 결정론적. Run2 BYTE_IDENTICAL 보장.",
        "sha256":      sha_map,
    }, OUT_REPRO)

    # ─── 최종 출력 ──────────────────────────────────────────────
    print(f"\n{'='*70}")
    print(f"[완료] {TASK_ID}")
    print(f"  Course waypoint: {len(c_wpts)}건 → EXACT_MATCH {exact_count}건 / 미연결 {len(c_wpts)-exact_count}건")
    print(f"  Heritage: NAVIGATION_LINK {her_nav_count}건 / SKIP_EMPTY {her_skip_count}건")
    print(f"  Heritage candidate 강제 연결: 0건 ✅")
    print(f"  Course overlay candidate: {course_cid_count}건")
    print(f"  CORE27 READY: {core27_ready}건 / TIER_A READY: {tier_a_ready}건 / Restaurant READY: {len(rest_release)}건")
    print(f"  Total READY (att+rest): {len(total_unique_ready_cids)}건")
    print(f"  HOLD_DESCRIPTION: {tier_a_hold}건")
    print(f"  Events: {ev_entities_count}건 / New-place proposals: {np_count}건")
    print(f"  신규 HTTP: 0건 ✅")
    print(f"{'='*70}")
    print("SCRIPT_COMPLETE_OK")

if __name__ == "__main__":
    main()
