"""
TASK-KTO-EN-REMAINING-LINK-RESOLUTION-V1

KTO 영문 상세 연결 감사에서 남은 128건(MR 67 + AB 39 + NM 22)을
카테고리·장소 특성별 규칙으로 재판정한다.

이 스크립트는 연결 판정 전용이다.
enriched candidates / source facts 는 수정하지 않는다.
"""

import json
import glob
import re
import os
import sys
from datetime import datetime, timezone
from math import radians, sin, cos, sqrt, atan2

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# ─── 경로 상수 ────────────────────────────────────────────────────────────────
MANIFEST_DIR = "data/tourapi/manifests/busan"
REPORT_DIR   = "data/tourapi/reports/busan"
EN_RAW_DIR   = "data/tourapi/raw/kto/detailCommon2En/full"

INPUT_AB = f"{MANIFEST_DIR}/kto-en-ambiguous-branch-links.json"
INPUT_MR = f"{MANIFEST_DIR}/kto-en-manual-review-links.json"
INPUT_NM = f"{MANIFEST_DIR}/kto-en-no-match-links.json"

OUTPUT_HC       = f"{MANIFEST_DIR}/kto-en-resolution-high-confidence.json"
OUTPUT_DISTINCT = f"{MANIFEST_DIR}/kto-en-resolution-distinct-content.json"
OUTPUT_MR_OUT   = f"{MANIFEST_DIR}/kto-en-resolution-manual-review.json"
OUTPUT_NM_CONF  = f"{MANIFEST_DIR}/kto-en-resolution-no-match-confirmed.json"
OUTPUT_REPORT   = f"{REPORT_DIR}/kto-en-remaining-link-resolution-v1-report.json"

TASK_ID = "TASK-KTO-EN-REMAINING-LINK-RESOLUTION-V1"

# ─── 판정 결정 테이블 ─────────────────────────────────────────────────────────

# ── AMBIGUOUS_BRANCH → HIGH_CONFIDENCE (23건) ──
# 근거: 이름 매칭 + 중복쌍(AttractionService+VB) 중 primary 선택
AB_TO_HC = {
    "1054849": ("busan-A-00030", 38.2, "name_match + primary_AttractionService_selected"),
    "1079482": ("busan-A-00079", 15.8, "name_match + primary_AttractionService_selected"),
    "1475231": ("busan-A-00100",  5.4, "name_match + primary_AttractionService_selected"),
    "1751530": ("busan-K-00135",  0.0, "name_match + existing_kto_en_link"),
    "1752895": ("busan-A-00038", 35.5, "name_match + primary_AttractionService_selected"),
    "1849142": ("busan-A-00003", 24.5, "name_match + primary_AttractionService_selected"),
    "2382544": ("busan-K-00057",  0.0, "name_match + existing_kto_en_link"),
    "2401046": ("busan-A-00044", 36.0, "name_match + primary_AttractionService_selected"),
    "2405644": ("busan-A-00054", 27.0, "name_match + primary_AttractionService_selected"),
    "2503883": ("busan-K-00222", 21.6, "name_match + unique_type_candidate"),
    "2589751": ("busan-A-00050",  7.4, "name_match + primary_AttractionService_selected"),
    "264198":  ("busan-A-00024", 12.6, "name_match + primary_AttractionService_selected"),
    "264404":  ("busan-A-00007", 34.5, "name_match + primary_AttractionService_selected"),
    "264405":  ("busan-A-00021", 34.8, "name_match + primary_AttractionService_selected"),
    "264539":  ("busan-A-00065", 27.0, "name_match + primary_AttractionService_selected"),
    "2656728": ("busan-A-00168",  6.5, "name_match + primary_AttractionService_selected"),
    "2812440": ("busan-K-00442",  4.1, "name_match + unique_type_candidate"),
    "2947925": ("busan-A-00028",  8.6, "name_match + primary_AttractionService_selected"),
    "3486394": ("busan-A-00057", 16.8, "name_match + primary_AttractionService_selected"),
    "3516758": ("busan-A-00146", 22.2, "name_match + primary_AttractionService_selected"),
    "3562082": ("busan-K-00774",  0.0, "name_match + existing_kto_en_link"),
    "769156":  ("busan-K-00110",  0.0, "name_match + existing_kto_en_link"),
    "992306":  ("busan-K-00111",  3.1, "name_match + primary_AttractionService_selected"),
}

# ── AMBIGUOUS_BRANCH → DISTINCT_CONTENT_NO_LINK (11건) ──
# 근거: 카테고리 불일치(casino/medical/street/festival≠venue 등)
AB_TO_DISTINCT = {
    "1055405": "casino_not_tourism_venue",
    "264120":  "medical_facility_not_tourism_venue",
    "3035570": "street_food_area_not_attraction",
    "3074034": "medical_facility_not_tourism_venue",
    "3098938": "multiple_unresolvable_category_conflicts",
    "3450814": "festival_not_venue_candidate",
    "349631":  "medical_facility_not_tourism_venue",
    "3517739": "medical_facility_not_tourism_venue",
    "3562124": "medical_facility_not_tourism_venue",
    "495645":  "casino_not_tourism_venue",
    "740322":  "medical_facility_not_tourism_venue",
}

# ── AMBIGUOUS_BRANCH → MANUAL_REVIEW_REQUIRED (5건) ──
# 근거: 복수 후보 중 선택 기준 부족 또는 콘텐츠 경계 모호
AB_TO_MR = {
    "1918039": "restaurant_candidate_without_tel_homepage_disambiguation",
    "1970795": "mountain_vs_observatory_ambiguity",
    "2946941": "overlapping_content_boundary_unclear",
    "264239":  "restaurant_candidate_without_tel_homepage_disambiguation",
    "3433027": "multiple_candidates_without_clear_primary",
}

# ── MANUAL_REVIEW → DISTINCT_CONTENT_NO_LINK (27건, 의료기관) ──
MR_MEDICAL_DISTINCT = {
    "3364622","3364765","3364801","3365841","3366195","3366399","3366484",
    "3366551","3366568","3366754","3367727","3441540","3450964","3451721",
    "3466909","3466939","3477557","3539436","3539560","3539851","3539987",
    "3547521","3547900","3548871","3548942","3574754","3580187",
}

# ── MANUAL_REVIEW → HIGH_CONFIDENCE (20건) ──
# 원본 candidate_id를 사용하되, 이름 매칭으로 더 적합한 candidate로 보정한 경우 포함
MR_TO_HC = {
    # 기존 분석 10건 (일부 override)
    "1000428": ("busan-A-00061",  74.6, "name_match_40계단_large_area_override"),
    "1245275": ("busan-K-00029", 144.4, "name_match + homepage_match + category_compat"),
    "1392313": ("busan-A-00026",  82.6, "category_compat + large_waterfront_area"),
    "1941477": ("busan-A-00135",  80.6, "category_compat + large_park_area"),
    "2025822": ("busan-A-00195", 121.8, "category_compat + temple_complex"),
    "264155":  ("busan-VB-373",   82.5, "name_match_해운대해수욕장_override"),
    "264250":  ("busan-A-00071",  76.2, "name_match_광안리해수욕장_override"),
    "2947862": ("busan-A-00005",  72.2, "category_compat + name_match"),
    "3078807": ("busan-A-00107",  57.5, "category_compat + large_forest_area"),
    "3486334": ("busan-A-00125", 119.2, "category_compat + urban_forest_area"),
    # 추가 10건 (category_compat 확인, 거리 편차 허용)
    "264602":  ("busan-A-00148",  56.5, "category_compat + cultural_zone_deviation_acceptable"),
    "266887":  ("busan-VB-140",   69.5, "category_compat + large_sports_venue"),
    "2946924": ("busan-A-00022",  80.1, "category_compat + trail_start_at_park"),
    "3098936": ("busan-VB-2555",  82.4, "category_compat + hilltop_viewpoint_deviation"),
    "3104517": ("busan-K-00088",  93.8, "category_compat + temple_complex_grounds"),
    "3115401": ("busan-VB-2581",  80.5, "category_compat + street_district_area"),
    "3468740": ("busan-A-00022",  62.6, "category_compat + coastal_park"),
    "3468785": ("busan-A-00169",  72.8, "category_compat + coastal_observatory"),
    "3468797": ("busan-K-00082",  65.9, "category_compat + tourist_center"),
    "3486532": ("busan-A-00174", 105.4, "category_compat + traditional_house_complex"),
}

# ── NO_MATCH → HIGH_CONFIDENCE (4건) ──
# 근거: 이름 매칭 + 대형 공원/자연지역 좌표 편차 허용
NM_TO_HC = {
    "1348758": ("busan-A-00073", 200.3, "name_match_금강공원_large_park_200m_acceptable"),
    "1351815": ("busan-A-00045", 274.2, "name_match_삼락생태공원_large_ecopark"),
    "264385":  ("busan-A-00046", 320.4, "name_match_암남공원_large_coastal_park"),
    "3098929": ("busan-A-00088", 279.3, "name_match_승학산_mountain_NA_category"),
}

# ── NO_MATCH → MANUAL_REVIEW_REQUIRED (2건) ──
NM_TO_MR = {
    "2657503": "name_match_동래읍성_686m_exceeds_fortress_threshold",
    "2947923": "name_match_장림포구_529m_port_location_ambiguity",
}

# ── NO_MATCH → DISTINCT_CONTENT_NO_LINK (7건, 의료기관) ──
NM_MEDICAL_DISTINCT = {
    "3364075","3364700","3365275","3366062","3366511","3539891","3547906"
}

# ── NO_MATCH → NO_MATCH_CONFIRMED (9건) ──
NM_TO_NM_CONFIRMED = {
    "1392329": "yeongdo_lighthouse_distinct_from_taejongdae_park",
    "1981827": "igidae_geopark_no_matching_candidate",
    "264108":  "geumjeongsanseong_fortress_no_candidate_391m",
    "264167":  "taejongdae_geopark_distinct_from_park_674m",
    "2835497": "huinnyeoul_culture_village_no_candidate_265m",
    "3045680": "marine_adventure_park_no_candidate_950m",
    "3061988": "sarangbang_restaurant_no_matching_candidate",
    "3098884": "gamman_creative_space_no_candidate_987m",
    "3517267": "ppangcheon_dong_bakery_district_no_candidate",
}


def haversine_m(lat1, lon1, lat2, lon2):
    R = 6_371_000
    a = sin(radians(lat2 - lat1) / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(radians(lon2 - lon1) / 2) ** 2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))


def load_en_raw(en_raw_dir):
    index = {}
    for rf in sorted(glob.glob(f"{en_raw_dir}/detail-common2en-*.json")):
        m = re.search(r"detail-common2en-(\d+)\.json", rf)
        if not m:
            continue
        d = json.load(open(rf, encoding="utf-8"))
        body = d.get("response", {}).get("body", {})
        if isinstance(body, str) or not body:
            continue
        items_obj = body.get("items", {})
        if isinstance(items_obj, str) or not items_obj:
            continue
        item_list = items_obj.get("item", [])
        if isinstance(item_list, dict):
            item_list = [item_list]
        if not item_list:
            continue
        item = item_list[0]
        cid = str(item.get("contentid", m.group(1)))
        try:
            mapx = float(item.get("mapx") or 0)
            mapy = float(item.get("mapy") or 0)
        except (TypeError, ValueError):
            mapx, mapy = 0.0, 0.0
        index[cid] = {
            "lclsSystm1": item.get("lclsSystm1", ""),
            "cat1": item.get("cat1", ""),
            "has_overview": bool((item.get("overview") or "").strip()),
            "has_image": bool((item.get("firstimage") or "").strip()),
            "mapx": mapx,
            "mapy": mapy,
        }
    return index


def make_record(contentid, title_en, original_verdict, resolution_verdict,
                candidate_id, distance_m, resolution_reason, en_info):
    return {
        "contentid": str(contentid),
        "title_en": title_en,
        "original_verdict": original_verdict,
        "resolution_verdict": resolution_verdict,
        "candidate_id": candidate_id,
        "distance_m": round(distance_m, 1) if distance_m is not None else None,
        "resolution_reason": resolution_reason,
        "en_lclssystm1": en_info.get("lclsSystm1", ""),
        "en_cat1": en_info.get("cat1", ""),
        "en_has_overview": en_info.get("has_overview", False),
        "en_has_image": en_info.get("has_image", False),
    }


def write_manifest(path, task, verdict_label, records):
    obj = {
        "task": task,
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "verdict": verdict_label,
        "count": len(records),
        "records": records,
    }
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
    with open(tmp, encoding="utf-8") as f:
        loaded = json.load(f)
    assert len(loaded["records"]) == len(records), "Record count mismatch after write"
    os.replace(tmp, path)
    return len(records)


# ═══════════════════════════════════════════════════════════════════════════════
def main():
    now_iso = datetime.now(timezone.utc).isoformat(timespec="seconds")

    # ── Phase 0: 입력 검증 ────────────────────────────────────────────────────
    print("=== Phase 0: 입력 검증 ===")
    ab_data = json.load(open(INPUT_AB, encoding="utf-8"))
    mr_data = json.load(open(INPUT_MR, encoding="utf-8"))
    nm_data = json.load(open(INPUT_NM, encoding="utf-8"))

    ab_records = ab_data["records"]
    mr_records = mr_data["records"]
    nm_records = nm_data["records"]

    ab_cids = {str(r["contentid"]) for r in ab_records}
    mr_cids = {str(r["contentid"]) for r in mr_records}
    nm_cids = {str(r["contentid"]) for r in nm_records}

    assert len(ab_records) == 39, f"AB expected 39, got {len(ab_records)}"
    assert len(mr_records) == 67, f"MR expected 67, got {len(mr_records)}"
    assert len(nm_records) == 22, f"NM expected 22, got {len(nm_records)}"
    assert len(ab_cids | mr_cids | nm_cids) == 128, "중복 contentId 존재"
    print(f"  AB={len(ab_records)}, MR={len(mr_records)}, NM={len(nm_records)} → 합계 128건 ✓")

    # ── Phase 1: EN raw 로드 ──────────────────────────────────────────────────
    print("=== Phase 1: EN raw 로드 ===")
    en_index = load_en_raw(EN_RAW_DIR)
    all_cids_128 = ab_cids | mr_cids | nm_cids
    missing_en = [c for c in all_cids_128 if c not in en_index]
    print(f"  EN raw 로드: {len(en_index)}건, 128건 중 EN 없음: {len(missing_en)}건 {missing_en[:5]}")

    # ── Phase 2: 판정 적용 ────────────────────────────────────────────────────
    print("=== Phase 2: 판정 적용 ===")

    hc_records      = []
    distinct_records = []
    mr_out_records   = []
    nm_conf_records  = []

    # ── AB 39건 처리 ─────────────────────────────────────────────────────────
    ab_lookup = {str(r["contentid"]): r for r in ab_records}
    for cid, orig_r in ab_lookup.items():
        title = orig_r.get("title_en", "")
        orig_v = orig_r.get("verdict", "AMBIGUOUS_BRANCH")
        en_info = en_index.get(cid, {})
        orig_dist = orig_r.get("distance_m")

        if cid in AB_TO_HC:
            cand_id, dist_m, reason = AB_TO_HC[cid]
            # candidates_near에서 실제 거리 조회
            near = orig_r.get("candidates_near", [])
            near_dist = next((c["distance_m"] for c in near if c["candidate_id"] == cand_id), dist_m)
            hc_records.append(make_record(cid, title, orig_v, "HIGH_CONFIDENCE_LINK",
                                          cand_id, near_dist, reason, en_info))
        elif cid in AB_TO_DISTINCT:
            reason = AB_TO_DISTINCT[cid]
            distinct_records.append(make_record(cid, title, orig_v, "DISTINCT_CONTENT_NO_LINK",
                                                None, orig_dist, reason, en_info))
        elif cid in AB_TO_MR:
            reason = AB_TO_MR[cid]
            mr_out_records.append(make_record(cid, title, orig_v, "MANUAL_REVIEW_REQUIRED",
                                              None, orig_dist, reason, en_info))
        else:
            raise ValueError(f"AB contentid {cid} 판정 누락")

    print(f"  AB 처리: HC={sum(1 for r in hc_records if r['original_verdict']=='AMBIGUOUS_BRANCH')}"
          f" DISTINCT={sum(1 for r in distinct_records if r['original_verdict']=='AMBIGUOUS_BRANCH')}"
          f" MR={sum(1 for r in mr_out_records if r['original_verdict']=='AMBIGUOUS_BRANCH')}")

    # ── MR 67건 처리 ─────────────────────────────────────────────────────────
    mr_lookup = {str(r["contentid"]): r for r in mr_records}
    for cid, orig_r in mr_lookup.items():
        title = orig_r.get("title_en", "")
        orig_v = orig_r.get("verdict", "MANUAL_REVIEW_LINK")
        en_info = en_index.get(cid, {})
        orig_dist = orig_r.get("distance_m")

        if cid in MR_MEDICAL_DISTINCT:
            distinct_records.append(make_record(cid, title, orig_v, "DISTINCT_CONTENT_NO_LINK",
                                                None, orig_dist, "medical_facility_not_tourism_venue", en_info))
        elif cid in MR_TO_HC:
            cand_id, dist_m, reason = MR_TO_HC[cid]
            hc_records.append(make_record(cid, title, orig_v, "HIGH_CONFIDENCE_LINK",
                                          cand_id, dist_m, reason, en_info))
        else:
            # 남은 MR → MANUAL_REVIEW_REQUIRED 유지
            cand_id = orig_r.get("candidate_id")
            signals = orig_r.get("match_signals", [])
            evidence = orig_r.get("evidence", "")
            reason = f"requires_manual_check: {evidence[:80]}" if evidence else "requires_manual_check"
            mr_out_records.append(make_record(cid, title, orig_v, "MANUAL_REVIEW_REQUIRED",
                                              cand_id, orig_dist, reason, en_info))

    mr_hc_count = sum(1 for r in hc_records if r["original_verdict"] == "MANUAL_REVIEW_LINK")
    mr_dist_count = sum(1 for r in distinct_records if r["original_verdict"] == "MANUAL_REVIEW_LINK")
    mr_mr_count = sum(1 for r in mr_out_records if r["original_verdict"] == "MANUAL_REVIEW_LINK")
    print(f"  MR 처리: HC={mr_hc_count} DISTINCT={mr_dist_count} MR={mr_mr_count} 합={mr_hc_count+mr_dist_count+mr_mr_count}")

    # ── NM 22건 처리 ─────────────────────────────────────────────────────────
    nm_lookup = {str(r["contentid"]): r for r in nm_records}
    for cid, orig_r in nm_lookup.items():
        title = orig_r.get("title_en", "")
        orig_v = orig_r.get("verdict", "NO_MATCH")
        en_info = en_index.get(cid, {})
        orig_dist = orig_r.get("distance_m")

        if cid in NM_TO_HC:
            cand_id, dist_m, reason = NM_TO_HC[cid]
            hc_records.append(make_record(cid, title, orig_v, "HIGH_CONFIDENCE_LINK",
                                          cand_id, dist_m, reason, en_info))
        elif cid in NM_TO_MR:
            reason = NM_TO_MR[cid]
            nm_cand_id = orig_r.get("candidate_id")
            mr_out_records.append(make_record(cid, title, orig_v, "MANUAL_REVIEW_REQUIRED",
                                              nm_cand_id, orig_dist, reason, en_info))
        elif cid in NM_MEDICAL_DISTINCT:
            distinct_records.append(make_record(cid, title, orig_v, "DISTINCT_CONTENT_NO_LINK",
                                                None, orig_dist, "medical_facility_not_tourism_venue", en_info))
        elif cid in NM_TO_NM_CONFIRMED:
            reason = NM_TO_NM_CONFIRMED[cid]
            nm_conf_records.append(make_record(cid, title, orig_v, "NO_MATCH_CONFIRMED",
                                               None, orig_dist, reason, en_info))
        else:
            raise ValueError(f"NM contentid {cid} 판정 누락")

    nm_hc = sum(1 for r in hc_records if r["original_verdict"] == "NO_MATCH")
    nm_dist = sum(1 for r in distinct_records if r["original_verdict"] == "NO_MATCH")
    nm_mr = sum(1 for r in mr_out_records if r["original_verdict"] == "NO_MATCH")
    nm_nmc = len(nm_conf_records)
    print(f"  NM 처리: HC={nm_hc} DISTINCT={nm_dist} MR={nm_mr} NM_CONFIRMED={nm_nmc} 합={nm_hc+nm_dist+nm_mr+nm_nmc}")

    # ── Phase 3: 검증 ─────────────────────────────────────────────────────────
    print("=== Phase 3: 검증 ===")

    total_out = len(hc_records) + len(distinct_records) + len(mr_out_records) + len(nm_conf_records)
    assert total_out == 128, f"출력 합계 오류: {total_out} ≠ 128"
    print(f"  합계: {total_out} = 128 ✓")

    # HC candidate_id 모두 있음 확인
    hc_no_cand = [r["contentid"] for r in hc_records if not r["candidate_id"]]
    assert not hc_no_cand, f"HC 중 candidate_id 없음: {hc_no_cand}"
    print(f"  HC {len(hc_records)}건 모두 candidate_id 있음 ✓")

    # contentId 중복 없음 확인
    all_out_cids = (
        [r["contentid"] for r in hc_records] +
        [r["contentid"] for r in distinct_records] +
        [r["contentid"] for r in mr_out_records] +
        [r["contentid"] for r in nm_conf_records]
    )
    assert len(set(all_out_cids)) == 128, f"출력 contentId 중복 존재"
    print("  contentId 중복 없음 ✓")

    # 입력 128건 전부 처리 확인
    processed = set(all_out_cids)
    assert processed == all_cids_128, f"미처리 contentId: {all_cids_128 - processed}"
    print("  입력 128건 전부 처리 ✓")

    # HC 중 restaurant 단독 좌표 연결 없음 확인 (식당류 tel/homepage 없는 케이스)
    # FD lclsSystm1 케이스에서 tel/homepage 신호 없이 HC된 건이 있는지 점검
    fd_hc = [r for r in hc_records if r["en_lclssystm1"] == "FD"]
    print(f"  HC 중 FD(food) 유형: {len(fd_hc)}건 {[r['contentid'] for r in fd_hc]}")
    # MR_TO_HC에 FD가 없음을 이미 분석에서 확인했으나 재점검
    for r in fd_hc:
        reason = r.get("resolution_reason", "")
        if "tel" not in reason and "homepage" not in reason and "name_match" not in reason:
            print(f"  WARN: FD HC 케이스에 tel/homepage/name_match 신호 없음: {r['contentid']}")

    # NM_TO_HC 대형 공원/자연 거리 점검
    nm_hc_recs = [r for r in hc_records if r["original_verdict"] == "NO_MATCH"]
    for r in nm_hc_recs:
        d = r["distance_m"]
        if d is not None and d > 400:
            print(f"  INFO: NM→HC 거리 큼 ({d:.0f}m): {r['contentid']} {r['title_en'][:30]}")
    print(f"  NM→HC {len(nm_hc_recs)}건 거리 점검 완료")

    # 판정 분포
    print(f"\n  판정 결과:")
    print(f"    HIGH_CONFIDENCE_LINK:   {len(hc_records):3d}건")
    print(f"    DISTINCT_CONTENT_NO_LINK:{len(distinct_records):3d}건")
    print(f"    MANUAL_REVIEW_REQUIRED:  {len(mr_out_records):3d}건")
    print(f"    NO_MATCH_CONFIRMED:      {len(nm_conf_records):3d}건")
    print(f"    합계:                    {total_out:3d}건")

    # ── Phase 4: 출력 파일 작성 ───────────────────────────────────────────────
    print("\n=== Phase 4: 출력 파일 작성 ===")

    os.makedirs(MANIFEST_DIR, exist_ok=True)
    os.makedirs(REPORT_DIR, exist_ok=True)

    n_hc   = write_manifest(OUTPUT_HC,       TASK_ID, "HIGH_CONFIDENCE_LINK",    hc_records)
    n_dist = write_manifest(OUTPUT_DISTINCT,  TASK_ID, "DISTINCT_CONTENT_NO_LINK", distinct_records)
    n_mr   = write_manifest(OUTPUT_MR_OUT,    TASK_ID, "MANUAL_REVIEW_REQUIRED",   mr_out_records)
    n_nmc  = write_manifest(OUTPUT_NM_CONF,   TASK_ID, "NO_MATCH_CONFIRMED",       nm_conf_records)

    print(f"  {OUTPUT_HC}: {n_hc}건")
    print(f"  {OUTPUT_DISTINCT}: {n_dist}건")
    print(f"  {OUTPUT_MR_OUT}: {n_mr}건")
    print(f"  {OUTPUT_NM_CONF}: {n_nmc}건")

    # ── 보고서 ────────────────────────────────────────────────────────────────
    # 원본 verdict별 분포
    orig_ab_hc   = len([r for r in hc_records   if r["original_verdict"] == "AMBIGUOUS_BRANCH"])
    orig_ab_dist = len([r for r in distinct_records if r["original_verdict"] == "AMBIGUOUS_BRANCH"])
    orig_ab_mr   = len([r for r in mr_out_records   if r["original_verdict"] == "AMBIGUOUS_BRANCH"])
    orig_mr_hc   = len([r for r in hc_records   if r["original_verdict"] == "MANUAL_REVIEW_LINK"])
    orig_mr_dist = len([r for r in distinct_records if r["original_verdict"] == "MANUAL_REVIEW_LINK"])
    orig_mr_mr   = len([r for r in mr_out_records   if r["original_verdict"] == "MANUAL_REVIEW_LINK"])
    orig_nm_hc   = len([r for r in hc_records   if r["original_verdict"] == "NO_MATCH"])
    orig_nm_dist = len([r for r in distinct_records if r["original_verdict"] == "NO_MATCH"])
    orig_nm_mr   = len([r for r in mr_out_records   if r["original_verdict"] == "NO_MATCH"])
    orig_nm_nmc  = len(nm_conf_records)

    report = {
        "task": TASK_ID,
        "created_at": now_iso,
        "summary": {
            "total_input": 128,
            "input_breakdown": {"AMBIGUOUS_BRANCH": 39, "MANUAL_REVIEW_LINK": 67, "NO_MATCH": 22},
            "total_output": total_out,
            "output_breakdown": {
                "HIGH_CONFIDENCE_LINK": len(hc_records),
                "DISTINCT_CONTENT_NO_LINK": len(distinct_records),
                "MANUAL_REVIEW_REQUIRED": len(mr_out_records),
                "NO_MATCH_CONFIRMED": len(nm_conf_records),
            },
        },
        "resolution_matrix": {
            "AB_39": {
                "HIGH_CONFIDENCE_LINK": orig_ab_hc,
                "DISTINCT_CONTENT_NO_LINK": orig_ab_dist,
                "MANUAL_REVIEW_REQUIRED": orig_ab_mr,
            },
            "MR_67": {
                "HIGH_CONFIDENCE_LINK": orig_mr_hc,
                "DISTINCT_CONTENT_NO_LINK": orig_mr_dist,
                "MANUAL_REVIEW_REQUIRED": orig_mr_mr,
            },
            "NM_22": {
                "HIGH_CONFIDENCE_LINK": orig_nm_hc,
                "DISTINCT_CONTENT_NO_LINK": orig_nm_dist,
                "MANUAL_REVIEW_REQUIRED": orig_nm_mr,
                "NO_MATCH_CONFIRMED": orig_nm_nmc,
            },
        },
        "hc_candidate_ids": [r["candidate_id"] for r in hc_records],
        "key_decisions": [
            "AB: AttractionService+VB 중복쌍은 AttractionService(A-prefix)를 primary로 선택",
            "AB: casino/medical 등 관광 플랫폼 외 콘텐츠 → DISTINCT",
            "MR: EX 분류 의료기관 27건 → DISTINCT (한의원, 병원, 치과, 성형외과 등)",
            "MR: 이름 매칭 + 대형 지역(공원/사원/해수욕장) 20건 → HC (50-200m 편차 허용)",
            "NM: 이름 매칭 + 대형 공원/산/생태공원 4건 → HC (200-320m 편차 허용)",
            "NM: 의료기관 7건 → DISTINCT",
            "NM: 등대/지질공원/항구 등 좌표 미일치 또는 후보 없음 9건 → NM_CONFIRMED",
        ],
        "outputs": {
            "high_confidence": OUTPUT_HC,
            "distinct_content": OUTPUT_DISTINCT,
            "manual_review": OUTPUT_MR_OUT,
            "no_match_confirmed": OUTPUT_NM_CONF,
        },
        "safety": {
            "enriched_candidates_modified": False,
            "source_facts_modified": False,
            "api_calls_made": False,
            "gate_flag_changed": False,
        },
    }

    tmp_r = OUTPUT_REPORT + ".tmp"
    with open(tmp_r, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    os.replace(tmp_r, OUTPUT_REPORT)
    print(f"  {OUTPUT_REPORT}: 작성 완료")

    print("\n=== 완료 ===")
    print(f"HIGH_CONFIDENCE_LINK  : {len(hc_records)}건 (기존 HC 43건 + 신규 {len(hc_records)}건)")
    print(f"DISTINCT_CONTENT_NO_LINK: {len(distinct_records)}건")
    print(f"MANUAL_REVIEW_REQUIRED : {len(mr_out_records)}건")
    print(f"NO_MATCH_CONFIRMED     : {len(nm_conf_records)}건")
    print(f"합계                   : {total_out}건")


if __name__ == "__main__":
    main()
