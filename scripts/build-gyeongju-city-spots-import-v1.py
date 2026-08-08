# -*- coding: utf-8 -*-
"""경주 canonical → Production import payload 빌더.

무엇을 만드는가
  canonical 302 를 세 갈래로 나눈다. 표가 셋이므로 payload 도 셋이다.
    A. places   — city_spots 302 행
    B. sources  — city_spot_sources (candidate_id → 장소 를 잇는 다리)
    C. images   — city_spot_images (권리 상태를 잃지 않은 이미지)

무엇을 하지 않는가
  · 좌표를 만들지 않는다. 없으면 null 로 두고 116 건은 그대로 116 건이다.
  · 영문을 만들지 않는다. 공식 EN 실제 텍스트가 0 이므로 EN 필드는 비운다.
    has_en_title=138 은 텍스트 없는 주장이라 제목으로 쓰지 않는다.
  · 한국어를 영문 칸에 복사하지 않는다.
  · category 를 재분류하지 않는다. attraction 200 / restaurant 102 그대로다.
  · food 제안 190 건을 장소로 승격하지 않는다.

import 순서 (payload 가 분리된 이유)
  city_spot_sources·city_spot_images 는 city_spots.id 를 FK 로 받는다. 그런데
  그 id 는 insert 전에는 존재하지 않는다. 그래서 2 단계다.
    1) places 를 (city, name) 기준으로 upsert → id 확보
    2) 확보한 id 를 sources/images 의 city_spot_id 에 채워 upsert
  sources/images payload 는 city_spot_id 대신 조인 키(_join_city, _join_name)를
  들고 있고, 실제 id 는 적용 단계에서 붙인다. 여기서 id 를 추측하지 않는다.

멱등성
  places = uq_city_spots_city_name (city, name)
  sources = uq_city_spot_sources_source (source_type, source_key)
  images  = uq_city_spot_images_spot_url (city_spot_id, image_url)
  세 키 모두 데이터에서 결정되므로 같은 payload 를 두 번 적용해도 행이 늘지 않는다.

결정론
  실행 시각을 출력에 넣지 않는다. 날짜는 canonical 의 as_of 만 쓴다.

실행:  python scripts/build-gyeongju-city-spots-import-v1.py
"""

import io
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REL = os.path.join(ROOT, "data", "gyeongju-final-release")

SRC_CANONICAL = os.path.join(REL, "gyeongju-canonical-places-v1.jsonl")

OUT_PLACES  = os.path.join(REL, "gyeongju-city-spots-import-v1.jsonl")
OUT_SOURCES = os.path.join(REL, "gyeongju-city-spot-sources-import-v1.jsonl")
OUT_IMAGES  = os.path.join(REL, "gyeongju-city-spot-images-import-v1.jsonl")
OUT_SUMMARY = os.path.join(REL, "gyeongju-db-import-summary-v1.json")

CITY = "gyeongju"

# 권리가 불명확한 이미지는 어떤 경로로도 공개로 켜지지 않는다.
# migration 046 의 csi_unknown_rights_not_public CHECK 와 같은 목록이다.
RIGHTS_NEVER_PUBLIC = {"RIGHTS_UNKNOWN", "KTO_TYPE_UNKNOWN"}
# 출처 표기가 필요한 상태. KTO Type3 는 저작권자 명시가 요구된다.
RIGHTS_ATTRIBUTION = {"Type3", "RIGHTS_UNKNOWN", "KTO_TYPE_UNKNOWN"}

# canonical 의 provenance.primary_source 는 'gyeongju-city/touristDestinationService'
# 처럼 'provider/service' 형태다. provider 만 source_type 으로 쓴다.
def split_provider(primary_source):
    if not primary_source:
        return None, None
    parts = str(primary_source).split("/", 1)
    return parts[0], (parts[1] if len(parts) > 1 else None)


def load_jsonl(path):
    rows = []
    with io.open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def nonempty(v):
    if v is None:
        return False
    if isinstance(v, str):
        return v.strip() != ""
    return True


def clean(v):
    """빈 문자열은 값이 아니다. NULL 로 넣는다."""
    if isinstance(v, str):
        v = v.strip()
        return v if v else None
    return v


def build_places(canonical):
    """city_spots 행. 현재 34 컬럼 schema 에 실제로 있는 필드만 쓴다."""
    out = []
    for c in canonical:
        img = c.get("image_url")
        # image_url 은 legacy 캐시다. 권리상 띄울 수 없는 이미지는 캐시에도 넣지 않는다 —
        # 넣으면 city_spots 만 읽는 화면이 그대로 띄운다.
        cached_image = img if (nonempty(img) and c.get("image_display_eligible")) else None

        out.append({
            "city":        CITY,
            "name":        c["title_ko"],           # 공식 EN 이 0 이라 한국어 표기가 사실이다
            "category":    c["category"],           # attraction | restaurant — CHECK 5종 통과
            "subcategory": clean(c.get("subcategory")),
            "district":    clean(c.get("district")),
            "address":     clean(c.get("address")),
            "description": clean(c.get("description_ko")),
            "lat":         c.get("lat"),            # 없으면 null. 만들지 않는다.
            "lng":         c.get("lng"),
            "official_url": clean(c.get("official_url")),
            "image_url":   cached_image,
            "entry_fee":   clean(c.get("admission")),
            # opening_hours 는 city_spots 에서 JSONB({open,close})다. canonical 은
            # '9:00~18:00' 같은 자유 문자열이라 구조가 다르다. 파싱해 넣으면 없는
            # 정확도를 만들어내는 것이므로 넣지 않는다. gap queue 200 건으로 남는다.
            "opening_hours": None,
            # 아래 세 값은 city_spots NOT NULL DEFAULT 가 있는 컬럼이다. 경주 데이터에
            # 근거가 없으므로 DB 기본값을 그대로 쓰도록 payload 에서 생략한다.
            # (solo_friendly / foreign_card_accepted / cash_only)
            "_candidate_id": c["candidate_id"],     # 적용 후 sources 연결용. DB 컬럼 아님.
        })
    out.sort(key=lambda p: p["_candidate_id"])
    return out


def build_sources(canonical):
    out = []
    for c in canonical:
        prov = c.get("provenance") or {}
        provider, service = split_provider(prov.get("primary_source"))
        if not provider:
            provider = "gyeongju-canonical"
        # source_key 는 NOT NULL 이다. 공급자 고유 id 가 따로 없으면 candidate_id 를
        # 쓴다 — 파이프라인 안에서 유일하고 재수집해도 같은 값이다.
        out.append({
            "_join_city":   CITY,
            "_join_name":   c["title_ko"],
            "source_type":  provider,
            "source_key":   c["candidate_id"],
            "candidate_id": c["candidate_id"],
            "source_url":   clean(c.get("official_url")),
            "source_tier":  clean(c.get("source_tier")),
            "is_primary":   True,
            "as_of":        c["as_of"],
            "_service":     service,
        })
    out.sort(key=lambda s: s["candidate_id"])
    return out


def build_images(canonical):
    out = []
    for c in canonical:
        url = c.get("image_url")
        if not nonempty(url):
            continue                      # 이미지가 없으면 행을 만들지 않는다
        status = c.get("image_rights_status") or "RIGHTS_UNKNOWN"
        eligible = bool(c.get("image_display_eligible"))
        # DB CHECK 와 같은 규칙을 payload 단계에서도 강제한다. 두 곳에서 막아야
        # 어느 한쪽 실수로 열리지 않는다.
        if status in RIGHTS_NEVER_PUBLIC:
            eligible = False
        out.append({
            "_join_city":   CITY,
            "_join_name":   c["title_ko"],
            "_candidate_id": c["candidate_id"],
            "image_url":    url,
            "rights_status": status,
            "attribution_required": status in RIGHTS_ATTRIBUTION,
            "rights_note":  clean(c.get("image_rights_note")),
            "display_eligible": eligible,
            "is_primary":   True,          # 현재 장소당 이미지 1건이다
            "sort_order":   0,
            "as_of":        c["as_of"],
        })
    out.sort(key=lambda i: i["_candidate_id"])
    return out


def counter(rows, key):
    out = {}
    for r in rows:
        k = r.get(key)
        k = "null" if k is None else str(k)
        out[k] = out.get(k, 0) + 1
    return dict(sorted(out.items()))


def write_jsonl(path, rows):
    with io.open(path, "w", encoding="utf-8", newline="\n") as fh:
        for r in rows:
            fh.write(json.dumps(r, ensure_ascii=False, sort_keys=True) + "\n")


def write_json(path, obj):
    with io.open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(json.dumps(obj, ensure_ascii=False, sort_keys=True, indent=2) + "\n")


def main():
    canonical = load_jsonl(SRC_CANONICAL)
    canonical.sort(key=lambda c: c["candidate_id"])
    as_of = canonical[0]["as_of"] if canonical else None

    places  = build_places(canonical)
    sources = build_sources(canonical)
    images  = build_images(canonical)

    def has_coords(p):
        return isinstance(p.get("lat"), (int, float)) and isinstance(p.get("lng"), (int, float))

    summary = {
        "as_of":                    as_of,
        "source_candidate_sha":     canonical[0]["source_candidate_sha"] if canonical else None,
        "city":                     CITY,
        "base_place_count":         len(places),
        "category_counts":          counter(places, "category"),
        "map_eligible_count":       sum(1 for p in places if has_coords(p)),
        "route_ai_eligible_count":  sum(1 for p in places if has_coords(p)),
        "no_coordinate_count":      sum(1 for p in places if not has_coords(p)),
        "description_present_count": sum(1 for p in places if nonempty(p["description"])),
        "image_cache_set_count":    sum(1 for p in places if nonempty(p["image_url"])),
        "source_rows":              len(sources),
        "source_type_counts":       counter(sources, "source_type"),
        "image_rows":               len(images),
        "image_display_eligible_count": sum(1 for i in images if i["display_eligible"]),
        "image_rights_status_counts":   counter(images, "rights_status"),
        "image_attribution_required_count": sum(1 for i in images if i["attribution_required"]),
        "generated_en_count":       0,
        "fake_coordinate_count":    0,
        "food_proposal_promoted_count": 0,
        "idempotency_keys": {
            "places":  ["city", "name"],
            "sources": ["source_type", "source_key"],
            "images":  ["city_spot_id", "image_url"],
        },
    }

    write_jsonl(OUT_PLACES, places)
    write_jsonl(OUT_SOURCES, sources)
    write_jsonl(OUT_IMAGES, images)
    write_json(OUT_SUMMARY, summary)

    sys.stdout.write("places  : %d -> %s\n" % (len(places),  OUT_PLACES))
    sys.stdout.write("sources : %d -> %s\n" % (len(sources), OUT_SOURCES))
    sys.stdout.write("images  : %d -> %s\n" % (len(images),  OUT_IMAGES))
    sys.stdout.write("summary : %s\n" % OUT_SUMMARY)


if __name__ == "__main__":
    main()
