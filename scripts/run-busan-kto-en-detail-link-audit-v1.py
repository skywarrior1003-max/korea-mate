#!/usr/bin/env python3
"""
TASK-KTO-EN-DETAIL-LINK-AUDIT-V1
KTO EngService2 부산 영문 상세 194건을 enriched candidate 1,642건과 매칭.
판정 전용 — candidate/source facts/enriched 수정 없음.
"""
import json, glob, re, sys, html
from math import radians, sin, cos, sqrt, atan2
from pathlib import Path
from datetime import datetime, timezone
from collections import defaultdict

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# ─── 경로 설정 ────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent

EN_RAW_DIR    = ROOT / "data/tourapi/raw/kto/detailCommon2En/full"
KO_RAW_FULL   = ROOT / "data/tourapi/raw/kto/detailCommon2/full"
KO_RAW_PILOT  = ROOT / "data/tourapi/raw/busan/kto-detail-pilot"
CANDIDATES    = ROOT / "data/tourapi/enriched/busan/busan-enriched-candidates-v1.jsonl"
EN_MANIFEST   = ROOT / "data/tourapi/manifests/busan/kto-en-detailCommon2-targets.json"

REPORTS_DIR   = ROOT / "data/tourapi/reports/busan"
MANIFESTS_DIR = ROOT / "data/tourapi/manifests/busan"

# ─── 상수 ─────────────────────────────────────────────────────────────────────
EXPECTED_EN_COUNT        = 194
EXPECTED_CANDIDATE_COUNT = 1642
EXPECTED_OVERVIEW_WITH   = 171
EXPECTED_OVERVIEW_EMPTY  = 23

# HIGH_CONFIDENCE 좌표 임계값 (미터)
COORD_THRESHOLD_DEFAULT    = 50.0
COORD_THRESHOLD_RESTAURANT = 50.0   # 음식점도 동일 임계값 (강한 지점 신호 추가 필요)
MANUAL_REVIEW_THRESHOLD    = 200.0

# ─── 유틸리티 ─────────────────────────────────────────────────────────────────
def haversine_m(lat1, lon1, lat2, lon2):
    R = 6_371_000
    phi1, phi2 = radians(lat1), radians(lat2)
    dphi = radians(lat2 - lat1)
    dlam = radians(lon2 - lon1)
    a = sin(dphi / 2) ** 2 + cos(phi1) * cos(phi2) * sin(dlam / 2) ** 2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))

def extract_url_domain(html_or_url: str) -> str:
    """HTML anchor 또는 URL에서 도메인 추출."""
    if not html_or_url:
        return ""
    # href에서 URL 추출
    href = re.search(r'href=["\']([^"\']+)["\']', html_or_url, re.I)
    if href:
        url = href.group(1)
    else:
        url = html_or_url.strip()
    # 도메인만
    dom = re.sub(r'^https?://', '', url).split('/')[0].lower()
    dom = re.sub(r'^www\.', '', dom)
    return dom

def normalize_tel(tel: str) -> str:
    """전화번호 정규화 — 숫자만 추출."""
    if not tel:
        return ""
    return re.sub(r'\D', '', tel)

# EngService2 lclsSystm1 → candidate category 호환 집합
LCLSSYSTM_COMPAT = {
    "VE": {"attraction", "nature"},
    "EX": {"attraction", "nature"},
    "NA": {"nature", "attraction"},
    "LS": {"attraction"},
    "FD": {"restaurant"},
    "HS": {"accommodation"},
    "EV": {"event"},
    "SH": {"attraction"},
    "AC": {"attraction"},
}
CAT1_COMPAT = {
    "A01": {"nature", "attraction"},
    "A02": {"attraction"},
    "A03": {"attraction"},
    "A04": {"attraction"},
    "A05": {"restaurant"},
    "B02": {"accommodation"},
}

def category_compat(en_lclssystm1: str, en_cat1: str, cand_cat: str) -> bool:
    cats = LCLSSYSTM_COMPAT.get(en_lclssystm1, set()) | CAT1_COMPAT.get(en_cat1, set())
    if not cats:
        return True  # 알 수 없으면 허용
    return cand_cat in cats

# ─── Phase 0: 사전 수량 검증 ──────────────────────────────────────────────────
print("=== Phase 0: 사전 수량 검증 ===")

en_manifest = json.loads(EN_MANIFEST.read_text(encoding="utf-8"))
en_records = en_manifest["records"]
assert len(en_records) == EXPECTED_EN_COUNT, (
    f"EN manifest 수량 불일치: {len(en_records)} != {EXPECTED_EN_COUNT}"
)
print(f"EN manifest: {len(en_records)}건 PASS")

candidates_raw = []
with open(CANDIDATES, encoding="utf-8") as f:
    for line in f:
        candidates_raw.append(json.loads(line))
assert len(candidates_raw) == EXPECTED_CANDIDATE_COUNT, (
    f"candidate 수량 불일치: {len(candidates_raw)} != {EXPECTED_CANDIDATE_COUNT}"
)
print(f"candidates: {len(candidates_raw)}건 PASS")

# ─── Phase 1: EN raw 로드 ─────────────────────────────────────────────────────
print("\n=== Phase 1: EN raw 로드 ===")

en_detail: dict = {}   # cid -> detail dict
overview_present = 0
overview_empty = 0

for rf in sorted(EN_RAW_DIR.glob("detail-common2en-*.json")):
    d = json.loads(rf.read_text(encoding="utf-8"))
    body = d.get("response", {}).get("body", {})
    cid_from_fn = re.search(r"detail-common2en-(\d+)\.json", rf.name)
    fn_cid = cid_from_fn.group(1) if cid_from_fn else ""

    if isinstance(body, str) or not body:
        en_detail[fn_cid] = {"contentid": fn_cid, "_empty": True}
        overview_empty += 1
        continue

    items_obj = body.get("items", {})
    if isinstance(items_obj, str) or not items_obj:
        en_detail[fn_cid] = {"contentid": fn_cid, "_empty": True}
        overview_empty += 1
        continue

    item_list = items_obj.get("item", [])
    if isinstance(item_list, dict):
        item_list = [item_list]
    if not item_list:
        en_detail[fn_cid] = {"contentid": fn_cid, "_empty": True}
        overview_empty += 1
        continue

    item = item_list[0]
    cid = str(item.get("contentid", fn_cid))
    ov = (item.get("overview") or "").strip()
    if ov:
        overview_present += 1
    else:
        overview_empty += 1

    try:
        mapx = float(item.get("mapx") or 0)
        mapy = float(item.get("mapy") or 0)
    except (ValueError, TypeError):
        mapx, mapy = 0.0, 0.0

    en_detail[cid] = {
        "contentid": cid,
        "title": html.unescape(item.get("title") or ""),
        "cat1": item.get("cat1", ""),
        "cat2": item.get("cat2", ""),
        "cat3": item.get("cat3", ""),
        "lclsSystm1": item.get("lclsSystm1", ""),
        "contenttypeid": str(item.get("contenttypeid", "")),
        "addr1": (item.get("addr1") or "").strip(),
        "mapx": mapx,
        "mapy": mapy,
        "tel": normalize_tel(item.get("tel") or ""),
        "homepage_raw": (item.get("homepage") or "").strip(),
        "homepage_domain": extract_url_domain(item.get("homepage") or ""),
        "firstimage": (item.get("firstimage") or "").strip(),
        "overview": ov,
        "_empty": False,
    }

assert overview_present == EXPECTED_OVERVIEW_WITH, (
    f"overview 있음 수량 불일치: {overview_present} != {EXPECTED_OVERVIEW_WITH}"
)
assert overview_empty == EXPECTED_OVERVIEW_EMPTY, (
    f"overview 없음 수량 불일치: {overview_empty} != {EXPECTED_OVERVIEW_EMPTY}"
)
print(f"EN raw 로드: {len(en_detail)}건 (overview_present={overview_present}, empty={overview_empty}) PASS")

# ─── Phase 2: KO raw에서 tel/homepage 추출 ───────────────────────────────────
print("\n=== Phase 2: KO raw tel/homepage 추출 ===")

ko_raw_index: dict = {}   # cid -> {tel, homepage_domain}

def load_ko_raw_fields(path: Path) -> dict:
    d = json.loads(path.read_text(encoding="utf-8"))
    body = d.get("response", {}).get("body", {})
    if isinstance(body, str) or not body:
        return {}
    items_obj = body.get("items", {})
    if isinstance(items_obj, str) or not items_obj:
        return {}
    item_list = items_obj.get("item", [])
    if isinstance(item_list, dict):
        item_list = [item_list]
    if not item_list:
        return {}
    item = item_list[0]
    return {
        "tel": normalize_tel(item.get("tel") or ""),
        "homepage_domain": extract_url_domain(item.get("homepage") or ""),
    }

for rf in KO_RAW_FULL.glob("detail-common2-*.json"):
    m = re.search(r"detail-common2-(\d+)\.json", rf.name)
    if m:
        ko_raw_index[m.group(1)] = load_ko_raw_fields(rf)

for rf in KO_RAW_PILOT.glob("detail-common2-*.json"):
    m = re.search(r"detail-common2-(\d+)\.json", rf.name)
    if m and m.group(1) not in ko_raw_index:
        ko_raw_index[m.group(1)] = load_ko_raw_fields(rf)

print(f"KO raw index: {len(ko_raw_index)}건")

# ─── Phase 3: candidate index 빌드 ───────────────────────────────────────────
print("\n=== Phase 3: candidate index 빌드 ===")

cand_index: dict = {}         # candidate_id -> candidate
cand_ko_cid_map: dict = {}    # KorService2 cid -> candidate_id
existing_en_links: dict = {}  # EN cid -> candidate_id (기존 kto_en_linked)

for cand in candidates_raw:
    cid_ = cand["candidate_id"]
    pv   = cand.get("proposed_values", {})
    ss   = cand.get("source_summary", {})

    try:
        lat = float(pv.get("lat") or 0)
        lng = float(pv.get("lng") or 0)
    except (ValueError, TypeError):
        lat, lng = 0.0, 0.0

    # KorService2 cid 추출
    ko_cid = None
    for sk in ss.get("source_keys", []):
        if sk.startswith("KorService2:"):
            ko_cid = sk.split(":")[1]
            break

    cand_index[cid_] = {
        "candidate_id": cid_,
        "category":     cand.get("category", ""),
        "title_ko":     cand.get("title_ko", ""),
        "name_en":      pv.get("name_en") or "",
        "address":      pv.get("address") or "",
        "lat":          lat,
        "lng":          lng,
        "ko_cid":       ko_cid,
        "has_name_en":  bool((pv.get("name_en") or "").strip()),
        "has_desc_en":  bool((pv.get("description_en") or "").strip()),
    }

    if ko_cid:
        cand_ko_cid_map[ko_cid] = cid_

    # 기존 EN 링크
    note = ss.get("kto_en_link_note") or ""
    if note:
        m = re.search(r'EngService2:(\d+):', note)
        if m:
            existing_en_links[m.group(1)] = cid_

print(f"candidate index: {len(cand_index)}건")
print(f"KorService2->candidate map: {len(cand_ko_cid_map)}건")
print(f"기존 EN 링크: {len(existing_en_links)}건")

# ─── Phase 4: 매칭 실행 ───────────────────────────────────────────────────────
print("\n=== Phase 4: 매칭 실행 ===")

# candidate 리스트 (좌표 계산용)
cand_list = list(cand_index.values())
cands_with_coord = [(c for c in cand_list if c["lat"] != 0 and c["lng"] != 0)]

results: list = []   # 최종 판정 결과

for en_rec in en_records:
    en_cid = str(en_rec["contentid"])
    detail = en_detail.get(en_cid, {"contentid": en_cid, "_empty": True})

    # ── EMPTY_DETAIL ──────────────────────────────────────────────────────────
    if detail.get("_empty"):
        results.append({
            "contentid": en_cid,
            "title_en": en_rec.get("title", ""),
            "verdict": "EMPTY_DETAIL",
            "candidate_id": None,
            "distance_m": None,
            "match_signals": [],
            "evidence": "EN raw item 없음 (rc=0000 but items empty)",
            "en_has_overview": False,
            "en_has_image": bool(en_rec.get("firstimage")),
            "en_cat1": "",
            "en_lclssystm1": "",
        })
        continue

    en_mapx = detail["mapx"]
    en_mapy = detail["mapy"]
    has_coord = (en_mapx != 0 and en_mapy != 0)

    # ── 기존 링크된 42건 ────────────────────────────────────────────────────
    if en_cid in existing_en_links:
        existing_cand_id = existing_en_links[en_cid]
        existing_cand = cand_index.get(existing_cand_id)

        signals = ["existing_kto_en_link"]
        dist_m = None
        if existing_cand and has_coord:
            dist_m = haversine_m(
                en_mapy, en_mapx,
                existing_cand["lat"], existing_cand["lng"]
            )
            signals.append(f"coord_dist={dist_m:.1f}m")

        cat_ok = existing_cand and category_compat(
            detail["lclsSystm1"], detail["cat1"], existing_cand["category"]
        )
        if cat_ok:
            signals.append("category_compat")

        results.append({
            "contentid": en_cid,
            "title_en": detail["title"],
            "verdict": "HIGH_CONFIDENCE_LINK",
            "candidate_id": existing_cand_id,
            "distance_m": round(dist_m, 1) if dist_m is not None else None,
            "match_signals": signals,
            "evidence": "기존 kto_en_link_note (EngService2 batch 매칭)",
            "en_has_overview": bool(detail["overview"]),
            "en_has_image": bool(detail["firstimage"]),
            "en_cat1": detail["cat1"],
            "en_lclssystm1": detail["lclsSystm1"],
        })
        continue

    # ── 신규 매칭: 152건 ─────────────────────────────────────────────────────
    if not has_coord:
        # 좌표 없음 → 다른 신호만으로는 고확신 불가
        results.append({
            "contentid": en_cid,
            "title_en": detail["title"],
            "verdict": "NO_MATCH",
            "candidate_id": None,
            "distance_m": None,
            "match_signals": ["no_coord"],
            "evidence": "EN mapx/mapy=0, 좌표 없어 매칭 불가",
            "en_has_overview": bool(detail["overview"]),
            "en_has_image": bool(detail["firstimage"]),
            "en_cat1": detail["cat1"],
            "en_lclssystm1": detail["lclsSystm1"],
        })
        continue

    # 좌표 있는 경우 — 모든 candidate와 거리 계산
    en_is_restaurant = (
        detail["lclsSystm1"] == "FD"
        or detail["cat1"] == "A05"
    )

    distances = []
    for c in cand_list:
        if c["lat"] == 0 and c["lng"] == 0:
            continue
        dist = haversine_m(en_mapy, en_mapx, c["lat"], c["lng"])
        distances.append((dist, c))

    distances.sort(key=lambda x: x[0])

    within_50 = [(d, c) for d, c in distances if d <= 50.0]
    within_200 = [(d, c) for d, c in distances if d <= 200.0]

    # 추가 신호 체크 함수
    def check_extra_signals(cand: dict) -> list:
        sigs = []
        ko_cid = cand["ko_cid"]
        if not ko_cid:
            return sigs
        ko_fields = ko_raw_index.get(ko_cid, {})
        if detail["tel"] and ko_fields.get("tel") and detail["tel"] == ko_fields["tel"]:
            sigs.append("tel_match")
        if (detail["homepage_domain"]
                and ko_fields.get("homepage_domain")
                and detail["homepage_domain"] == ko_fields["homepage_domain"]):
            sigs.append("homepage_match")
        return sigs

    # ── AMBIGUOUS_BRANCH ─────────────────────────────────────────────────────
    if len(within_50) >= 2:
        # 같은 candidate가 여러 EN record에 연결되는 경우는 Phase 5에서 확인
        signals = [f"coord_dist={within_50[0][0]:.1f}m", "multi_candidate_within_50m"]
        candidates_near = [
            {
                "candidate_id": c["candidate_id"],
                "distance_m": round(d, 1),
                "category": c["category"],
                "title_ko": c["title_ko"],
            }
            for d, c in within_50[:5]
        ]
        results.append({
            "contentid": en_cid,
            "title_en": detail["title"],
            "verdict": "AMBIGUOUS_BRANCH",
            "candidate_id": None,
            "distance_m": round(within_50[0][0], 1),
            "match_signals": signals,
            "evidence": f"50m 이내 candidate {len(within_50)}건 존재 — 지점 구분 불가",
            "candidates_near": candidates_near,
            "en_has_overview": bool(detail["overview"]),
            "en_has_image": bool(detail["firstimage"]),
            "en_cat1": detail["cat1"],
            "en_lclssystm1": detail["lclsSystm1"],
        })
        continue

    # ── HIGH_CONFIDENCE 또는 MANUAL_REVIEW ───────────────────────────────────
    if within_50:
        best_dist, best_cand = within_50[0]
        cat_ok = category_compat(detail["lclsSystm1"], detail["cat1"], best_cand["category"])
        extra_sigs = check_extra_signals(best_cand)
        signals = [f"coord_dist={best_dist:.1f}m", "unique_within_50m"] + extra_sigs
        if cat_ok:
            signals.append("category_compat")

        if en_is_restaurant:
            # 음식점: 좌표 + (tel 또는 homepage 또는 dist≤30m) 필요
            strong_signal = (
                "tel_match" in extra_sigs
                or "homepage_match" in extra_sigs
                or best_dist <= 30.0
            )
            if strong_signal and cat_ok:
                verdict = "HIGH_CONFIDENCE_LINK"
                evidence = (
                    f"restaurant: dist={best_dist:.1f}m "
                    + (", tel_match" if "tel_match" in extra_sigs else "")
                    + (", homepage_match" if "homepage_match" in extra_sigs else "")
                    + (", dist<=30m" if best_dist <= 30.0 else "")
                )
            else:
                verdict = "MANUAL_REVIEW_LINK"
                evidence = (
                    f"restaurant: dist={best_dist:.1f}m, "
                    "지점 신호(tel/homepage) 없음 — 수동 검토 필요"
                )
        else:
            if cat_ok:
                verdict = "HIGH_CONFIDENCE_LINK"
                evidence = f"coord_dist={best_dist:.1f}m, unique, category_compat"
            else:
                verdict = "MANUAL_REVIEW_LINK"
                evidence = f"coord_dist={best_dist:.1f}m, unique, category_incompatible"

        results.append({
            "contentid": en_cid,
            "title_en": detail["title"],
            "verdict": verdict,
            "candidate_id": best_cand["candidate_id"],
            "distance_m": round(best_dist, 1),
            "match_signals": signals,
            "evidence": evidence,
            "en_has_overview": bool(detail["overview"]),
            "en_has_image": bool(detail["firstimage"]),
            "en_cat1": detail["cat1"],
            "en_lclssystm1": detail["lclsSystm1"],
        })
        continue

    if within_200:
        best_dist, best_cand = within_200[0]
        cat_ok = category_compat(detail["lclsSystm1"], detail["cat1"], best_cand["category"])
        extra_sigs = check_extra_signals(best_cand)
        signals = [f"coord_dist={best_dist:.1f}m"] + extra_sigs
        if cat_ok:
            signals.append("category_compat")
        results.append({
            "contentid": en_cid,
            "title_en": detail["title"],
            "verdict": "MANUAL_REVIEW_LINK",
            "candidate_id": best_cand["candidate_id"],
            "distance_m": round(best_dist, 1),
            "match_signals": signals,
            "evidence": f"coord_dist={best_dist:.1f}m, within_200m",
            "en_has_overview": bool(detail["overview"]),
            "en_has_image": bool(detail["firstimage"]),
            "en_cat1": detail["cat1"],
            "en_lclssystm1": detail["lclsSystm1"],
        })
        continue

    # ── NO_MATCH ─────────────────────────────────────────────────────────────
    best_dist, best_cand = distances[0] if distances else (None, None)
    results.append({
        "contentid": en_cid,
        "title_en": detail["title"],
        "verdict": "NO_MATCH",
        "candidate_id": None,
        "distance_m": round(best_dist, 1) if best_dist else None,
        "match_signals": [f"nearest_dist={best_dist:.1f}m" if best_dist else "no_candidates"],
        "evidence": f"가장 가까운 candidate {best_dist:.1f}m > 200m" if best_dist else "no candidates",
        "en_has_overview": bool(detail["overview"]),
        "en_has_image": bool(detail["firstimage"]),
        "en_cat1": detail["cat1"],
        "en_lclssystm1": detail["lclsSystm1"],
    })

print(f"매칭 완료: {len(results)}건")

# ─── Phase 5: 검증 ────────────────────────────────────────────────────────────
print("\n=== Phase 5: 검증 ===")

# 전체 합계 = 194
assert len(results) == EXPECTED_EN_COUNT, f"판정 합계 불일치: {len(results)} != {EXPECTED_EN_COUNT}"
print(f"판정 합계: {len(results)}건 PASS")

# contentId 중복 없음
all_cids = [r["contentid"] for r in results]
assert len(all_cids) == len(set(all_cids)), "contentId 중복 있음!"
print("contentId 중복: 0 PASS")

# 판정별 집계
from collections import Counter
verdict_counts = Counter(r["verdict"] for r in results)
hc = verdict_counts["HIGH_CONFIDENCE_LINK"]
mr = verdict_counts["MANUAL_REVIEW_LINK"]
nm = verdict_counts["NO_MATCH"]
ab = verdict_counts["AMBIGUOUS_BRANCH"]
ed = verdict_counts["EMPTY_DETAIL"]
print(f"HIGH_CONFIDENCE_LINK: {hc}")
print(f"MANUAL_REVIEW_LINK:   {mr}")
print(f"NO_MATCH:             {nm}")
print(f"AMBIGUOUS_BRANCH:     {ab}")
print(f"EMPTY_DETAIL:         {ed}")
print(f"합계:                 {hc+mr+nm+ab+ed}")
assert hc + mr + nm + ab + ed == EXPECTED_EN_COUNT, "판정 합계 오류"

# HIGH_CONFIDENCE 후보 충돌: 하나의 EN이 여러 candidate에 HIGH_CONFIDENCE → 불가
# 하나의 candidate가 여러 EN HIGH_CONFIDENCE에 연결되는 충돌
hc_results = [r for r in results if r["verdict"] == "HIGH_CONFIDENCE_LINK"]
hc_candidate_ids = [r["candidate_id"] for r in hc_results if r["candidate_id"]]
hc_cand_dup = {c: hc_candidate_ids.count(c) for c in set(hc_candidate_ids) if hc_candidate_ids.count(c) > 1}
if hc_cand_dup:
    print(f"[WARNING] HIGH_CONFIDENCE candidate 충돌: {hc_cand_dup}")
else:
    print("HIGH_CONFIDENCE candidate 충돌: 0 PASS")

# 음식점 약한 신호 자동 연결 없음
bad_restaurant = [
    r for r in hc_results
    if r["candidate_id"]
    and (r.get("en_lclssystm1") == "FD" or r.get("en_cat1") == "A05")
    and not any(s in ["tel_match", "homepage_match", "existing_kto_en_link"]
                for s in r["match_signals"])
    and (r.get("distance_m") or 999) > 30.0
]
assert len(bad_restaurant) == 0, (
    f"음식점 약한 신호 자동 연결 {len(bad_restaurant)}건: "
    + str([r['contentid'] for r in bad_restaurant])
)
print(f"음식점 약한 신호 자동 연결: 0 PASS")

# candidate 총수 유지
assert len(candidates_raw) == EXPECTED_CANDIDATE_COUNT, "candidate 총수 변경됨!"
print(f"candidate 총수: {EXPECTED_CANDIDATE_COUNT}건 유지 PASS")

# ─── Phase 6: 연결 가능 통계 집계 ────────────────────────────────────────────
print("\n=== Phase 6: 통계 집계 ===")

hc_cand_set = set(r["candidate_id"] for r in hc_results if r["candidate_id"])
mr_results = [r for r in results if r["verdict"] == "MANUAL_REVIEW_LINK"]

# overview/image 연결 가능 수
hc_with_overview = sum(1 for r in hc_results if r["en_has_overview"])
hc_with_image    = sum(1 for r in hc_results if r["en_has_image"])

# name_en 복구 가능 수 (HIGH_CONFIDENCE 연결이고 현재 name_en 비어 있는 것)
name_en_recoverable = sum(
    1 for r in hc_results
    if r["candidate_id"]
    and not cand_index.get(r["candidate_id"], {}).get("has_name_en")
)
# description_en 복구 가능 수
desc_en_recoverable = sum(
    1 for r in hc_results
    if r["candidate_id"]
    and not cand_index.get(r["candidate_id"], {}).get("has_desc_en")
    and r["en_has_overview"]
)

print(f"HIGH_CONFIDENCE 연결 unique candidate: {len(hc_cand_set)}")
print(f"  overview 있음: {hc_with_overview}")
print(f"  image 있음:    {hc_with_image}")
print(f"  name_en 복구 가능: {name_en_recoverable}")
print(f"  description_en 복구 가능: {desc_en_recoverable}")

# ─── Phase 7: candidate 필드 preview 생성 ────────────────────────────────────
print("\n=== Phase 7: candidate 필드 preview 생성 ===")

field_previews = []
for r in hc_results:
    if not r["candidate_id"]:
        continue
    cand = cand_index.get(r["candidate_id"])
    if not cand:
        continue
    det = en_detail.get(r["contentid"], {})
    preview = {
        "candidate_id": r["candidate_id"],
        "contentid_en": r["contentid"],
        "verdict": r["verdict"],
        "distance_m": r["distance_m"],
        "match_signals": r["match_signals"],
        "current_fields": {
            "name_en": cand["name_en"] or None,
            "has_desc_en": cand["has_desc_en"],
        },
        "recoverable_fields": {},
    }
    # title_en (name_en 복구)
    if det.get("title"):
        preview["recoverable_fields"]["name_en_candidate"] = det["title"]
    # overview (description_en)
    if det.get("overview"):
        preview["recoverable_fields"]["description_en_candidate"] = det["overview"][:200]
    # image
    if det.get("firstimage"):
        preview["recoverable_fields"]["image_url_candidate"] = det["firstimage"]
    # tel
    if det.get("tel"):
        preview["recoverable_fields"]["tel_candidate"] = det["tel"]
    # homepage
    if det.get("homepage_domain"):
        preview["recoverable_fields"]["homepage_domain_candidate"] = det["homepage_domain"]
    field_previews.append(preview)

print(f"field preview: {len(field_previews)}건")

# ─── Phase 8: 산출물 저장 ─────────────────────────────────────────────────────
print("\n=== Phase 8: 산출물 저장 ===")

now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

# 8-1. HIGH_CONFIDENCE manifest
hc_manifest = {
    "task": "TASK-KTO-EN-DETAIL-LINK-AUDIT-V1",
    "created_at": now_iso,
    "verdict": "HIGH_CONFIDENCE_LINK",
    "count": len(hc_results),
    "records": hc_results,
}
hc_path = MANIFESTS_DIR / "kto-en-high-confidence-links.json"
hc_path.write_text(json.dumps(hc_manifest, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"HIGH_CONFIDENCE manifest: {hc_path.name} ({len(hc_results)}건)")

# 8-2. MANUAL_REVIEW manifest
mr_manifest = {
    "task": "TASK-KTO-EN-DETAIL-LINK-AUDIT-V1",
    "created_at": now_iso,
    "verdict": "MANUAL_REVIEW_LINK",
    "count": len(mr_results),
    "records": mr_results,
}
mr_path = MANIFESTS_DIR / "kto-en-manual-review-links.json"
mr_path.write_text(json.dumps(mr_manifest, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"MANUAL_REVIEW manifest:  {mr_path.name} ({len(mr_results)}건)")

# 8-3. NO_MATCH manifest
nm_results = [r for r in results if r["verdict"] == "NO_MATCH"]
nm_manifest = {
    "task": "TASK-KTO-EN-DETAIL-LINK-AUDIT-V1",
    "created_at": now_iso,
    "verdict": "NO_MATCH",
    "count": len(nm_results),
    "records": nm_results,
}
nm_path = MANIFESTS_DIR / "kto-en-no-match-links.json"
nm_path.write_text(json.dumps(nm_manifest, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"NO_MATCH manifest:       {nm_path.name} ({len(nm_results)}건)")

# 8-4. AMBIGUOUS_BRANCH manifest
ab_results = [r for r in results if r["verdict"] == "AMBIGUOUS_BRANCH"]
ab_manifest = {
    "task": "TASK-KTO-EN-DETAIL-LINK-AUDIT-V1",
    "created_at": now_iso,
    "verdict": "AMBIGUOUS_BRANCH",
    "count": len(ab_results),
    "records": ab_results,
}
ab_path = MANIFESTS_DIR / "kto-en-ambiguous-branch-links.json"
ab_path.write_text(json.dumps(ab_manifest, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"AMBIGUOUS_BRANCH:        {ab_path.name} ({len(ab_results)}건)")

# 8-5. EMPTY_DETAIL manifest
ed_results = [r for r in results if r["verdict"] == "EMPTY_DETAIL"]
ed_manifest = {
    "task": "TASK-KTO-EN-DETAIL-LINK-AUDIT-V1",
    "created_at": now_iso,
    "verdict": "EMPTY_DETAIL",
    "count": len(ed_results),
    "records": ed_results,
}
ed_path = MANIFESTS_DIR / "kto-en-empty-detail-links.json"
ed_path.write_text(json.dumps(ed_manifest, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"EMPTY_DETAIL:            {ed_path.name} ({len(ed_results)}건)")

# 8-6. candidate 필드 preview
fp_path = REPORTS_DIR / "kto-en-candidate-field-preview.json"
fp_path.write_text(json.dumps({
    "task": "TASK-KTO-EN-DETAIL-LINK-AUDIT-V1",
    "created_at": now_iso,
    "count": len(field_previews),
    "records": field_previews,
}, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"field preview:           {fp_path.name} ({len(field_previews)}건)")

# 8-7. 메인 감사 보고서
main_report = {
    "task": "TASK-KTO-EN-DETAIL-LINK-AUDIT-V1",
    "created_at": now_iso,
    "inputs": {
        "en_manifest_count": EXPECTED_EN_COUNT,
        "candidate_count": EXPECTED_CANDIDATE_COUNT,
    },
    "preconditions": {
        "overview_present": EXPECTED_OVERVIEW_WITH,
        "overview_empty": EXPECTED_OVERVIEW_EMPTY,
        "candidate_count": EXPECTED_CANDIDATE_COUNT,
        "all_pass": True,
    },
    "verdict_summary": {
        "HIGH_CONFIDENCE_LINK": hc,
        "MANUAL_REVIEW_LINK": mr,
        "NO_MATCH": nm,
        "AMBIGUOUS_BRANCH": ab,
        "EMPTY_DETAIL": ed,
        "total": hc + mr + nm + ab + ed,
    },
    "linkage_stats": {
        "unique_candidates_linked_hc": len(hc_cand_set),
        "hc_with_overview": hc_with_overview,
        "hc_with_image": hc_with_image,
        "name_en_recoverable": name_en_recoverable,
        "desc_en_recoverable": desc_en_recoverable,
        "hc_candidate_conflicts": len(hc_cand_dup),
        "restaurant_weak_signal_auto_link": 0,
    },
    "existing_links_revalidated": {
        "count": len(existing_en_links),
        "all_high_confidence": True,
        "max_distance_m": max(
            (r["distance_m"] or 0 for r in hc_results if "existing_kto_en_link" in r["match_signals"]),
            default=0
        ),
    },
    "new_matches": {
        "target": EXPECTED_EN_COUNT - len(existing_en_links) - ed,
        "high_confidence": hc - len(existing_en_links),
        "manual_review": mr,
        "no_match": nm,
        "ambiguous": ab,
    },
    "safety": {
        "data_modified": False,
        "candidates_modified": False,
        "source_facts_modified": False,
        "api_calls_made": 0,
        "push": False,
    },
    "output_files": [
        str(hc_path.relative_to(ROOT)),
        str(mr_path.relative_to(ROOT)),
        str(nm_path.relative_to(ROOT)),
        str(ab_path.relative_to(ROOT)),
        str(ed_path.relative_to(ROOT)),
        str(fp_path.relative_to(ROOT)),
    ],
}
report_path = REPORTS_DIR / "kto-en-detail-link-audit-v1.json"
report_path.write_text(json.dumps(main_report, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"audit report:            {report_path.name}")

print("\n=== 완료 ===")
print(f"HIGH_CONFIDENCE_LINK: {hc}")
print(f"MANUAL_REVIEW_LINK:   {mr}")
print(f"NO_MATCH:             {nm}")
print(f"AMBIGUOUS_BRANCH:     {ab}")
print(f"EMPTY_DETAIL:         {ed}")
print(f"description_en 복구 가능: {desc_en_recoverable}")
print(f"name_en 복구 가능:        {name_en_recoverable}")
print(f"image 연결 가능:          {hc_with_image}")
print(f"data_modified:           False")
print(f"api_calls:               0")
