# -*- coding: utf-8 -*-
"""경주 canonical release 빌더 — 보조컴 handoff 원본을 메인 기준으로 재구성한다.

왜 필요한가
  handoff 의 gyeongju-final-ready-302-v1.jsonl 은 has_coords / has_description /
  has_images 를 302/302 전부 True 로 선언한다. 그러나 같은 handoff 가 "Full place
  detail" 이라고 지정한 enriched-candidates 를 실제로 JOIN 하면 좌표 186, 설명 102,
  이미지 169 뿐이다. 즉 이 세 플래그는 게이트로 동작하지 않는다.

  원본 파일을 고쳐 쓰지 않는다. 보조컴 산출물은 provenance 이므로 그대로 두고,
  여기서 **실제 값으로 다시 계산한** canonical 을 따로 만든다. 이후 메인의 모든
  판단은 canonical 을 본다.

이 스크립트가 지키는 계약
  · 네트워크를 쓰지 않는다. 수집·번역·좌표 생성·추정을 하지 않는다.
  · 없는 값을 채우지 않는다. 없으면 없다고 기록하고 gap queue 로 넘긴다.
  · 결정론적이다. 실행 시각을 출력에 넣지 않고 날짜 기준은 _run_metadata 의
    collection_date 만 쓴다. 같은 입력이면 두 번 실행해도 byte-identical 이다.
  · publishability 같은 원본 상태값을 임의로 승격하지 않는다.

실행:  python scripts/build-gyeongju-canonical-release-v1.py
"""

import io
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

REL = os.path.join(ROOT, "data", "gyeongju-final-release")
OTC = os.path.join(ROOT, "data", "gyeongju-official-travel-content")

SRC_READY    = os.path.join(REL, "gyeongju-final-ready-302-v1.jsonl")
SRC_ENRICHED = os.path.join(ROOT, "data", "tourapi", "enriched", "gyeongju",
                            "gyeongju-enriched-candidates-v1.jsonl")
SRC_EN       = os.path.join(REL, "gyeongju-final-en-coverage-302-v1.jsonl")
SRC_RIGHTS   = os.path.join(REL, "gyeongju-final-image-rights-302-v1.jsonl")
SRC_TIER     = os.path.join(REL, "gyeongju-final-quality-tier-v1.jsonl")
SRC_MATRIX   = os.path.join(ROOT, "data", "tourapi", "contracts", "gyeongju",
                            "gyeongju-source-priority-matrix-v1.json")
SRC_META     = os.path.join(OTC, "_run_metadata.json")
SRC_FOOD     = os.path.join(OTC, "gyeongju-official-food-final-relations-v1.jsonl")
SRC_EVREL    = os.path.join(OTC, "gyeongju-official-event-place-relations-v1.jsonl")
SRC_COURSEL  = os.path.join(OTC, "gyeongju-official-course-place-links-final-v1.jsonl")
SRC_GRAPH    = os.path.join(OTC, "gyeongju-official-ai-scheduler-graph-final-v1.jsonl")

OUT_PLACES  = os.path.join(REL, "gyeongju-canonical-places-v1.jsonl")
OUT_SUMMARY = os.path.join(REL, "gyeongju-canonical-release-summary-v1.json")
OUT_GAPS    = os.path.join(REL, "gyeongju-aux-data-gap-queue-v1.jsonl")

CANDIDATE_SHA = "d49ad34"
CITY_CANONICAL = "gyeongju"          # DB city 값은 소문자 단일어다 (Production: 'busan')

# 경주는 한반도 동남부다. 이 범위를 벗어난 좌표는 파싱은 되어도 장소 좌표가 아니다.
KOREA_BBOX = (33.0, 39.0, 124.0, 132.0)   # lat_min, lat_max, lng_min, lng_max

# ── 이미지 권리 정책 ────────────────────────────────────────────────────────
# authority 는 image-rights-302 파일이다. enriched.image_rights_status 는 302/302
# 전부 RIGHTS_UNKNOWN 이라 그대로 믿으면 전량 차단된다.
#
# 이미지가 있다고 권리가 정리된 것이 아니다. 반대로 권리가 정리돼도 이미지가
# 없으면 띄울 것이 없다. 그래서 노출 판정은 두 조건을 모두 본다.
RIGHTS_ELIGIBLE = {
    "VG_OFFICIAL_PUBLIC":     {"eligible": True,  "attribution": False},
    "VG_RESTAURANT_OFFICIAL": {"eligible": True,  "attribution": False},
    "Type1":                  {"eligible": True,  "attribution": False},
    "Type3":                  {"eligible": True,  "attribution": True},   # 저작권자 명시 필요
    "IMAGE_RIGHTS_CLEARED":   {"eligible": True,  "attribution": False},
    # cpyrhtDivCd 를 못 받아온 항목이다. 모르면 안 띄운다.
    "KTO_TYPE_UNKNOWN":       {"eligible": False, "attribution": True},
    "RIGHTS_UNKNOWN":         {"eligible": False, "attribution": True},
}


def load_jsonl(path):
    rows = []
    with io.open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def load_json(path):
    with io.open(path, encoding="utf-8") as fh:
        return json.load(fh)


def nonempty(value):
    """실제 값이 있는가. 공백만 있는 문자열은 값이 아니다."""
    if value is None:
        return False
    if isinstance(value, str):
        return value.strip() != ""
    if isinstance(value, (list, dict)):
        return len(value) > 0
    return True


def parse_coord(lat, lng):
    """(lat, lng, ok). 둘 다 있고, 숫자로 읽히고, 한국 범위 안일 때만 ok."""
    if lat is None or lng is None:
        return None, None, False
    try:
        flat, flng = float(lat), float(lng)
    except (TypeError, ValueError):
        return None, None, False
    lo_a, hi_a, lo_o, hi_o = KOREA_BBOX
    if not (lo_a <= flat <= hi_a and lo_o <= flng <= hi_o):
        return flat, flng, False
    return flat, flng, True


def build_places(as_of):
    ready    = load_jsonl(SRC_READY)
    enriched = {r["candidate_id"]: r for r in load_jsonl(SRC_ENRICHED)}
    en_cov   = {r["candidate_id"]: r for r in load_jsonl(SRC_EN)}
    rights   = {r["candidate_id"]: r for r in load_jsonl(SRC_RIGHTS)}
    tier     = {r["candidate_id"]: r for r in load_jsonl(SRC_TIER)}

    missing = [r["candidate_id"] for r in ready if r["candidate_id"] not in enriched]
    if missing:
        raise SystemExit("JOIN 실패: enriched 에 없는 candidate_id %d 건 %s"
                         % (len(missing), missing[:5]))

    places = []
    for idx_row in ready:
        cid = idx_row["candidate_id"]
        det = enriched[cid]
        enr = en_cov.get(cid, {})
        rgt = rights.get(cid, {})
        tir = tier.get(cid, {})

        lat, lng, coords_ok = parse_coord(det.get("lat"), det.get("lng"))

        has_address     = nonempty(det.get("address"))
        has_description = nonempty(det.get("description_ko"))
        has_image       = nonempty(det.get("image_url"))

        # 권리 authority. 모르는 상태값이 오면 열지 않는 쪽으로 떨어뜨린다.
        rights_status = rgt.get("image_rights") or "RIGHTS_UNKNOWN"
        policy = RIGHTS_ELIGIBLE.get(rights_status,
                                     {"eligible": False, "attribution": True})

        # 공식 EN 본문. 승인된 21개 파일 안에 EN 텍스트는 존재하지 않는다 —
        # en-coverage 는 boolean 커버리지만 있고 enriched.title_en 은 전부 null 이다.
        # 그래서 여기서 채울 수 있는 것이 없다. 생성·번역은 하지 않는다.
        official_en_title = det.get("title_en") if nonempty(det.get("title_en")) else None
        official_en_desc  = None

        places.append({
            # ── identity ──
            "candidate_id":  cid,
            "city":          CITY_CANONICAL,
            "title_ko":      det.get("title_ko"),
            "category":      det.get("category"),
            "subcategory":   det.get("subcategory"),
            "district":      det.get("district_gyeongju"),

            # ── 원본 상세 (변형하지 않는다) ──
            "address":        det.get("address"),
            "lat":            lat if coords_ok else None,
            "lng":            lng if coords_ok else None,
            "phone":          det.get("phone"),
            "opening_hours":  det.get("opening_hours"),
            "admission":      det.get("admission"),
            "official_url":   det.get("official_url"),
            "image_url":      det.get("image_url"),
            "description_ko": det.get("description_ko"),

            # ── 공식 EN 만. generated/translated 와 절대 섞지 않는다 ──
            "official_en_title":       official_en_title,
            "official_en_description": official_en_desc,
            "en_status":               enr.get("en_coverage"),
            "en_provenance":           "official_source_only",
            "en_title_claimed":        bool(enr.get("has_en_title")),
            "en_overview_claimed":     bool(enr.get("has_en_overview")),

            # ── 이미지 권리 ──
            "image_rights_status":        rights_status,
            "image_rights_note":          rgt.get("rights_note"),
            "image_attribution_required": bool(policy["attribution"]),
            "image_display_eligible":     bool(policy["eligible"] and has_image),

            # ── completeness: 원본 has_* 가 아니라 실제 값에서 계산한다 ──
            "has_address_actual":     has_address,
            "has_coords_actual":      coords_ok,
            "has_description_actual": has_description,
            "has_image_actual":       has_image,

            # ── 활용 가능성 층. 공개 승인이 아니다. ──
            "route_data_ready":     coords_ok,
            "content_rich_ready":   bool(coords_ok and has_description
                                         and has_image and policy["eligible"]),
            "image_display_ready":  bool(has_image and policy["eligible"]),
            "official_en_available": bool(official_en_title or official_en_desc),

            # ── 원본 상태 보존 (승격하지 않는다) ──
            "quality_tier":     tir.get("quality_tier"),
            "source_tier":      idx_row.get("source_tier"),
            "source_set":       idx_row.get("source_set"),
            "identity_status":  det.get("identity_status"),
            "publishability":   det.get("publishability"),
            "coord_validated":  det.get("coord_validated"),
            "provenance":       det.get("provenance"),
            "source_candidate_sha": CANDIDATE_SHA,
            "as_of":            as_of,
        })

    places.sort(key=lambda p: p["candidate_id"])
    return places


# ── gap queue ───────────────────────────────────────────────────────────────
# preferred_source_type 은 source priority matrix 에 근거가 있을 때만 적는다.
# 새로 조사해서 출처를 찾지 않는다.
GAP_SPECS = [
    # (gap_type, priority, 조건, needed_for, matrix field)
    ("COORDINATES_MISSING",        "P0_AI_ROUTE",
     lambda p: not p["has_coords_actual"],
     "AI 일정 동선 계산 · spatial continuity", "좌표_lat_lng"),
    ("DESCRIPTION_MISSING",        "P1_PUBLIC_CONTENT",
     lambda p: not p["has_description_actual"],
     "장소 상세 화면 · 사용자 판단", "관광지_설명_description_ko"),
    ("IMAGE_MISSING",              "P1_PUBLIC_CONTENT",
     lambda p: not p["has_image_actual"],
     "장소 카드 · 목록 썸네일", "관광지_이미지_image_url"),
    ("IMAGE_RIGHTS_UNKNOWN",       "P1_PUBLIC_CONTENT",
     lambda p: p["has_image_actual"] and not p["image_display_eligible"],
     "이미지 UI 노출 가부 판정", "관광지_이미지_image_url"),
    ("OFFICIAL_EN_TITLE_MISSING",  "P1_PUBLIC_CONTENT",
     lambda p: not p["official_en_title"],
     "EN 우선 사용자 노출", None),
    ("OFFICIAL_EN_DESCRIPTION_MISSING", "P1_PUBLIC_CONTENT",
     lambda p: not p["official_en_description"],
     "EN 우선 사용자 노출", None),
    ("OPENING_HOURS_MISSING",      "P1_AI_QUALITY",
     lambda p: not nonempty(p["opening_hours"]),
     "시간대 배치 · 휴무일 회피", "운영시간_opening_hours"),
    ("ADMISSION_MISSING",          "P1_PUBLIC_CONTENT",
     lambda p: not nonempty(p["admission"]),
     "요금 안내 · 예산 판단", "입장료_admission"),
    ("OFFICIAL_URL_MISSING",       "P1_PUBLIC_CONTENT",
     lambda p: not nonempty(p["official_url"]),
     "공식 정보 링크", "관광지_목록_및_공식_존재여부"),
    ("PHONE_MISSING",              "P2_ENRICHMENT",
     lambda p: not nonempty(p["phone"]),
     "현장 문의", "전화번호_phone"),
    ("COORD_NOT_VALIDATED",        "P2_ENRICHMENT",
     lambda p: p["has_coords_actual"] and p.get("coord_validated") is not True,
     "좌표 신뢰도 확인", "좌표_lat_lng"),
    # 아래 둘은 자동 매칭으로 처리하면 안 된다.
    ("IDENTITY_UNLINKED",          "MANUAL_REVIEW",
     lambda p: p.get("identity_status") == "unlinked",
     "동일 장소 중복 판정", None),
    ("EN_IDENTITY_REVIEW",         "MANUAL_REVIEW",
     lambda p: p.get("en_status") == "EN_IDENTITY_REVIEW",
     "EN 명칭이 같은 장소를 가리키는지 확인", None),
]


def build_gaps(places, matrix, as_of):
    prim = {f["field"]: f.get("primary") for f in matrix.get("fields", [])}
    rows = []

    for p in places:
        for gap_type, priority, cond, needed_for, field in GAP_SPECS:
            if not cond(p):
                continue
            rows.append({
                "scope":            "PLACE",
                "candidate_id":     p["candidate_id"],
                "title_ko":         p["title_ko"],
                "category":         p["category"],
                "source_set":       p["source_set"],
                "gap_type":         gap_type,
                "priority":         priority,
                "current_value_status": "MISSING" if priority != "MANUAL_REVIEW" else "NEEDS_REVIEW",
                "needed_for":       needed_for,
                "preferred_source_type": prim.get(field) if field else None,
                "do_not_guess":     True,
                "notes":            None,
                "as_of":            as_of,
            })

    # ── 데이터셋 단위 gap. place 단위로 쪼갤 수 없는 것들이다. ──
    food  = load_jsonl(SRC_FOOD)
    evrel = load_jsonl(SRC_EVREL)
    clink = load_jsonl(SRC_COURSEL)

    proposals = [f for f in food if f.get("link_status") == "NEW_PLACE_PROPOSAL"]
    dataset_gaps = [
        ("FOOD_NEW_PLACE_PROPOSAL_ENRICHMENT", "P0_AI_ROUTE", len(proposals),
         "190건 전부 주소는 있으나 좌표 0. 좌표 없이는 일정에 배치할 수 없다.",
         "canonical 302 승격 전 좌표 확보", prim.get("식당_및_기념품")),
        ("EVENT_DATE_INCOMPLETE", "P1_AI_QUALITY",
         sum(1 for e in evrel if e.get("status") == "DATE_INCOMPLETE"),
         "시작/종료일이 불완전해 일정 배치 불가.",
         "행사 기간 확정", prim.get("행사_축제_현재_예정")),
        ("EVENT_VENUE_NOT_IN_PLACE_SET", "MANUAL_REVIEW",
         sum(1 for e in evrel if e.get("relation_type") == "EVENT_VENUE_NOT_IN_PLACE_SET"),
         "행사 장소가 현재 place set 밖이다. 신규 place 인지 비장소인지 사람이 판단해야 한다.",
         "행사-장소 연결", prim.get("행사_축제_현재_예정")),
        ("COURSE_STOP_MANUAL_REVIEW", "MANUAL_REVIEW",
         sum(1 for c in clink if c.get("match_status") == "MANUAL_REVIEW_FINAL"),
         "코스 경유지가 자동 매칭으로 확정되지 않았다.",
         "코스-장소 연결", prim.get("여행코스")),
    ]
    for gap_type, priority, count, note, needed_for, source in dataset_gaps:
        rows.append({
            "scope":            "DATASET",
            "candidate_id":     None,
            "title_ko":         None,
            "category":         None,
            "source_set":       None,
            "gap_type":         gap_type,
            "priority":         priority,
            "current_value_status": "AFFECTED_ROWS=%d" % count,
            "needed_for":       needed_for,
            "preferred_source_type": source,
            "do_not_guess":     True,
            "notes":            note,
            "as_of":            as_of,
        })

    # 결정론: (scope, gap_type, candidate_id) 로 안정 정렬한다.
    rows.sort(key=lambda r: (r["scope"], r["gap_type"], r["candidate_id"] or ""))
    return rows


def counter(rows, key):
    out = {}
    for r in rows:
        k = r.get(key)
        k = "null" if k is None else str(k)
        out[k] = out.get(k, 0) + 1
    return dict(sorted(out.items()))


def build_summary(places, gaps, as_of):
    n = len(places)
    yes = lambda f: sum(1 for p in places if p[f])
    return {
        "source_candidate_sha":     CANDIDATE_SHA,
        "as_of":                    as_of,
        "baseline_identity_count":  n,
        "canonical_rows":           n,
        "city":                     CITY_CANONICAL,
        "category_counts":          counter(places, "category"),
        "actual_address_count":     yes("has_address_actual"),
        "actual_coords_count":      yes("has_coords_actual"),
        "actual_description_count": yes("has_description_actual"),
        "actual_image_count":       yes("has_image_actual"),
        "image_display_eligible_count": yes("image_display_eligible"),
        "route_data_ready_count":     yes("route_data_ready"),
        "content_rich_ready_count":   yes("content_rich_ready"),
        "image_display_ready_count":  yes("image_display_ready"),
        "official_en_title_count":       sum(1 for p in places if p["official_en_title"]),
        "official_en_description_count": sum(1 for p in places if p["official_en_description"]),
        "official_en_available_count":   yes("official_en_available"),
        "en_title_claimed_count":       sum(1 for p in places if p["en_title_claimed"]),
        "en_overview_claimed_count":    sum(1 for p in places if p["en_overview_claimed"]),
        "en_status_counts":         counter(places, "en_status"),
        "image_rights_status_counts": counter(places, "image_rights_status"),
        "quality_tier_counts":      counter(places, "quality_tier"),
        "publishability_counts":    counter(places, "publishability"),
        "identity_status_counts":   counter(places, "identity_status"),
        "source_tier_counts":       counter(places, "source_tier"),
        "join_missing_count":       0,
        "gap_queue_total":          len(gaps),
        "gap_priority_counts":      counter(gaps, "priority"),
        "gap_type_counts":          counter(gaps, "gap_type"),
    }


def write_jsonl(path, rows):
    with io.open(path, "w", encoding="utf-8", newline="\n") as fh:
        for r in rows:
            fh.write(json.dumps(r, ensure_ascii=False, sort_keys=True) + "\n")


def write_json(path, obj):
    with io.open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(json.dumps(obj, ensure_ascii=False, sort_keys=True, indent=2) + "\n")


def main():
    meta = load_json(SRC_META)
    # 실행 시각이 아니라 수집 시점을 쓴다. 그래야 재실행해도 결과가 같다.
    as_of = meta["collection_date"]

    places = build_places(as_of)
    matrix = load_json(SRC_MATRIX)
    gaps   = build_gaps(places, matrix, as_of)
    summary = build_summary(places, gaps, as_of)

    write_jsonl(OUT_PLACES, places)
    write_jsonl(OUT_GAPS, gaps)
    write_json(OUT_SUMMARY, summary)

    sys.stdout.write("canonical places : %d -> %s\n" % (len(places), OUT_PLACES))
    sys.stdout.write("gap queue        : %d -> %s\n" % (len(gaps), OUT_GAPS))
    sys.stdout.write("summary          : %s\n" % OUT_SUMMARY)


if __name__ == "__main__":
    main()
