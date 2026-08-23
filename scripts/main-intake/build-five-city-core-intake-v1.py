"""
build-five-city-core-intake-v1 — Main importer 가 소비할 정규화 intake package
(TASK-MAIN-FIVE-CITY-CORE-INTEGRATION-PREP-AND-DRY-RUN-V1)

입력  고정 ref 의 최종 artifact(five_city_core_lib.PINNED_INPUTS) + crosswalk jsonl
출력  data/main-intake/five-city-core-v1/
  five-city-core-active-v1.jsonl         ACTIVE canonical 4,826 — Main city_spots 컬럼에 맞춘 값만
  five-city-core-sources-v1.jsonl        city_spot_sources 계약 (source_type, source_key, …)
  five-city-core-images-v1.jsonl         city_spot_images 계약 (rights_status, display_eligible, …)
  five-city-core-deferred-fields-v1.jsonl 현재 schema 가 못 받는 값(phone · 자유 텍스트 영업시간 · eligibility …)
  five-city-core-input-manifest-v1.json  branch/SHA/path/row count/sha256 — 재현성

규칙
  · 실제 artifact 에 없는 값을 만들지 않는다. 없으면 NO_SOURCE_VALUE 로 남긴다.
  · 다국어 키: source zh-CN → Main zh. 조인 키(canonical_place_id / canonical_id / candidate_id)는 canonical_id 로 통일.
  · category 는 Main CHECK 5종(attraction|restaurant|nature|event|accommodation)으로만. 의미가 남는 값은 subcategory 에.
  · opening_hours 는 'HH:MM-HH:MM' 한 구간만 구조화, 그 외 raw 는 deferred.
  · 이미지: 권리 상태가 확인된 것만 display_eligible. pixabay fallback 금지. 기존 Unsplash 승계 없음.
DB 접근 0 · 쓰기 0.
"""
from __future__ import annotations

import io
import json
import os
import re
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(__file__))
from five_city_core_lib import (  # noqa: E402
    EXPECTED_TOTAL, PACKAGE_DIR, PINNED_INPUTS, REPO, VG_IMAGE_RIGHTS_STATUS, VISITGYEONGJU_SOURCE_TYPE, file_sha256, load_input, seoul_description, strip_html, to_float, verify_pins,
    write_json, write_jsonl,
)

OUT_DIR = os.path.join(REPO, "data", "main-intake", PACKAGE_DIR)
MAIN_CATEGORIES = {"attraction", "restaurant", "nature", "event", "accommodation"}
LOCALE_MAP = {"ko": "ko", "en": "en", "ja": "ja", "zh-CN": "zh", "zh": "zh"}

# ── category adapter (Main 5종 고정 · 의미는 subcategory 로) ───────────────────
#
# Gate C (TASK-FIVE-CITY-CORE-PREPROD-GATE-V1) — Semantic Category Contract
#   RUNTIME_COMPAT_CATEGORY : 앱이 지금 쓰는 Main CHECK 5종 (category 컬럼)
#   SOURCE_SEMANTIC_CATEGORY: 원본이 실제로 뜻하는 여행 의미 (attraction·restaurant·nature·event·accommodation
#                             + shopping·culture·heritage·activity)
#   보존 규칙: semantic ≠ runtime 이면 subcategory 에 semantic 토큰을 **기계가 읽는 값**으로 넣고, 원본의 세부
#             분류(raw)는 deferred(content_meta.subcategory_raw)로 보낸다. semantic == runtime 이면 subcategory = raw.
#   → (category, subcategory) 만으로 semantic 이 항상 복원된다 (LOSSY_MAPPING_COUNT = 0 을 검산한다).
SEMANTIC_RULES: dict[str, str] = {
    "attraction": "attraction", "restaurant": "restaurant", "nature": "nature", "event": "event", "accommodation": "accommodation",
    "food": "restaurant", "shopping": "shopping",
    "FOOD": "restaurant", "PLACE_NATURE": "nature", "ACCOMMODATION_HANOK_REVIEW": "accommodation",
    "PLACE_TOURISM": "attraction", "PLACE_TOURISM_REVIEW": "attraction", "PLACE_GENERAL": "attraction",
    "PLACE_CULTURAL": "culture", "PLACE_HERITAGE": "heritage", "ACTIVITY_EXPERIENCE": "activity", "SPECIALTY_INTEREST": "specialty",
}
# 전주 SPECIALTY_INTEREST 는 menu 가 '쇼핑' 이면 shopping 이다(3건). 다른 menu 는 specialty 로 남긴다.
SEMANTIC_SUB_OVERRIDE: dict[tuple[str, str], str] = {("SPECIALTY_INTEREST", "쇼핑"): "shopping"}
CATEGORY_RULES: dict[str, tuple[str, str]] = {
    # source value → (main category, mapping kind)
    "attraction": ("attraction", "DIRECT_MAP"), "restaurant": ("restaurant", "DIRECT_MAP"),
    "nature": ("nature", "DIRECT_MAP"), "event": ("event", "DIRECT_MAP"), "accommodation": ("accommodation", "DIRECT_MAP"),
    "food": ("restaurant", "NORMALIZE_MAP"), "shopping": ("attraction", "NORMALIZE_MAP"),
    # jeonju domain
    "FOOD": ("restaurant", "NORMALIZE_MAP"), "PLACE_NATURE": ("nature", "NORMALIZE_MAP"),
    "ACCOMMODATION_HANOK_REVIEW": ("accommodation", "NORMALIZE_MAP"), "PLACE_TOURISM": ("attraction", "NORMALIZE_MAP"),
    "PLACE_TOURISM_REVIEW": ("attraction", "NORMALIZE_MAP"), "PLACE_CULTURAL": ("attraction", "NORMALIZE_MAP"),
    "PLACE_HERITAGE": ("attraction", "NORMALIZE_MAP"), "PLACE_GENERAL": ("attraction", "NORMALIZE_MAP"),
    "ACTIVITY_EXPERIENCE": ("attraction", "NORMALIZE_MAP"), "SPECIALTY_INTEREST": ("attraction", "NORMALIZE_MAP"),
}


def map_category(src: str | None, sub: str | None) -> tuple[str, str | None, str, str, str | None]:
    """→ (runtime category, subcategory, mapping kind, semantic category, raw sub deferred|None)"""
    key = (src or "").strip()
    raw = (sub or "").strip() or None
    if key in CATEGORY_RULES:
        cat, kind = CATEGORY_RULES[key]
        semantic = SEMANTIC_SUB_OVERRIDE.get((key, raw or ""), SEMANTIC_RULES[key])
        if semantic != cat:
            return cat, semantic, kind, semantic, raw          # 의미 토큰이 subcategory, raw 는 deferred
        return cat, raw, kind, semantic, None
    return "attraction", raw or (key or None), "UNSUPPORTED_DEFER", key or "unknown", None


def category_recoverable(cat: str, sub: str | None, semantic: str) -> bool:
    return semantic == cat or sub == semantic


HHMM_RANGE = re.compile(r"^\s*(\d{1,2}):(\d{2})\s*[-~–—]\s*(\d{1,2}):(\d{2})\s*$")


def opening_hours(raw) -> tuple[dict | None, str, str | None]:
    """→ (structured {open,close} | None, policy, raw_for_defer)"""
    if raw is None or raw == "":
        return None, "NO_SOURCE_VALUE", None
    if isinstance(raw, dict) and raw.get("open") and raw.get("close"):
        return {"open": str(raw["open"]), "close": str(raw["close"])}, "SAFE_STRUCTURED_IMPORT", None
    s = str(raw)
    m = HHMM_RANGE.match(s)
    if m:
        return {"open": f"{int(m.group(1)):02d}:{m.group(2)}", "close": f"{int(m.group(3)):02d}:{m.group(4)}"}, "SAFE_STRUCTURED_IMPORT", None
    return None, "RAW_VALUE_DEFER", s


def l10n(ko=None, en=None, ja=None, zh=None) -> dict | None:
    d = {k: v.strip() for k, v in (("ko", ko), ("en", en), ("ja", ja), ("zh", zh)) if isinstance(v, str) and v.strip()}
    return d or None


def main() -> None:
    pins = verify_pins()
    xw = [json.loads(l) for l in open(os.path.join(OUT_DIR, "five-city-core-crosswalk-v1.jsonl"), encoding="utf-8") if l.strip()]
    decision = {d["canonical_id"]: d for d in xw}
    active_ids = {d["canonical_id"] for d in xw if d["service_status"] == "ACTIVE"}
    if len(active_ids) != EXPECTED_TOTAL:
        raise SystemExit(f"crosswalk ACTIVE {len(active_ids)} != {EXPECTED_TOTAL}")

    manifest_inputs: dict[str, dict] = {}
    data: dict[str, list[dict]] = {}
    for key in PINNED_INPUTS:
        rows, sha = load_input(key)
        data[key] = rows
        p = PINNED_INPUTS[key]
        manifest_inputs[key] = {"city": p["city"], "branch": p["branch"], "sha": p["sha"], "path": p["path"],
                                "kind": p["kind"], "rows": len(rows), "sha256": sha}

    active: list[dict] = []
    sources: list[dict] = []
    images: list[dict] = []
    deferred: list[dict] = []
    cat_kinds: Counter = Counter()
    cat_map_rows: dict[tuple[str, str, str], int] = {}
    lossy: list[dict] = []
    hours_policy: Counter = Counter()

    def defer(cid: str, field: str, value, source: str, reason: str, dest: str) -> None:
        if value in (None, "", [], {}):
            return
        deferred.append({"canonical_id": cid, "field": field, "value": value, "source": source,
                         "reason_deferred": reason, "intended_future_destination": dest})

    def add_source(cid: str, source_type: str, source_key, *, url=None, tier=None, primary=False, as_of=None, candidate_id=None) -> None:
        if not source_key:
            return
        sources.append({"canonical_id": cid, "source_type": source_type, "source_key": str(source_key),
                        "candidate_id": candidate_id or cid, "source_url": url or None, "source_tier": tier,
                        "is_primary": bool(primary), "as_of": as_of})

    def add_image(cid: str, url, rights_status: str, *, eligible: bool, attribution: bool, note=None, primary=True, as_of=None, source_ref=None) -> None:
        if not url or "pixabay" in str(url).lower():
            return
        # 소셜 CDN(인스타그램/페이스북) 이미지는 reviewer/customer 사진이거나 서명 파라미터가 만료된다 —
        # 출처가 공식 페이지라도 공개로 켜지 않는다(정책: reviewer 사진 제외 · takedown-ready).
        if re.search(r"cdninstagram\.com|fbcdn\.net|instagram\.com|facebook\.com", str(url), re.I):
            rights_status, eligible = "SOCIAL_CDN_REVIEW", False
            note = (note + " · " if note else "") + "social CDN URL — 공식 출처여도 비공개(만료·권리 검토)"
        if rights_status in ("RIGHTS_UNKNOWN", "KTO_TYPE_UNKNOWN", "SOCIAL_CDN_REVIEW"):
            eligible = False  # DB CHECK 와 같은 규칙
        images.append({"canonical_id": cid, "image_url": url, "rights_status": rights_status,
                       "attribution_required": bool(attribution), "rights_note": note, "display_eligible": bool(eligible),
                       "is_primary": bool(primary), "sort_order": 0, "as_of": as_of, "source_ref": source_ref})

    def ml_index(rows: list[dict], id_field: str) -> dict[str, dict[str, dict]]:
        out: dict[str, dict[str, dict]] = defaultdict(dict)
        for r in rows:
            loc = LOCALE_MAP.get(r.get("locale") or "")
            cid = r.get(id_field)
            if not loc or not cid or not (r.get("title") or r.get("short_description")):
                continue
            if r.get("collection_status") not in (None, "OK", "SUCCESS") or r.get("description_reuse_allowed") is False:
                continue
            out[str(cid)][loc] = r
        return out

    # Field ownership (TASK-FIVE-CITY-CORE-MIGRATION-058-AND-WRITER-CORRECTION-V1 §7~8):
    #   FINAL_OWNED  = 이 artifact 타입이 Final 필드로 매핑하는 컬럼(값이 없으면 "공식 값 없음" 확정 → clear)
    #   NOT_OWNED    = 매핑이 None 상수인 컬럼(artifact 에 그 필드가 없음 → no-op)
    #   DEFERRED     = 값은 있으나 schema 로 구조화되지 못해 sidecar 로 보존(no-op)
    #   RUNTIME_DERIVED = map_url · naver_map_url (계약 §4, 런타임 생성) → no-op
    #   why_it_matters/why_l10n 은 어떤 artifact 도 소유하지 않는다(NOT_OWNED).
    ALWAYS_OWNED = ("name", "name_l10n", "description", "desc_l10n", "category", "subcategory", "address", "lat", "lng", "image_url")

    def base_row(cid: str, city: str, cat_src, sub_src, *, name_en, name_ko, names: dict, descs: dict, address, district,
                 lat, lng, official_url, hours_raw, tags, why_ko=None, provenance=None, owned: tuple = ()) -> dict:
        cat, sub, kind, semantic, sub_raw_deferred = map_category(cat_src, sub_src)
        owned_fields = sorted(set(ALWAYS_OWNED) | set(owned))
        deferred_fields: list[str] = []
        cat_map_rows[(city, (cat_src or "").strip(), semantic)] = cat_map_rows.get((city, (cat_src or "").strip(), semantic), 0) + 1
        if sub_raw_deferred:
            defer(cid, "subcategory_raw", sub_raw_deferred, "artifact", "semantic 토큰이 subcategory 를 차지 — 원본 세부 분류는 content_meta 로", "content_meta.subcategory_raw")
        if not category_recoverable(cat, sub, semantic):
            lossy.append({"canonical_id": cid, "source_category": cat_src, "runtime": cat, "subcategory": sub, "semantic": semantic})
        cat_kinds[kind] += 1
        oh, pol, raw = opening_hours(hours_raw)
        hours_policy[pol] += 1
        if raw:
            defer(cid, "opening_hours", raw, "artifact", "RAW_VALUE_DEFER: 구조화 불가(복수 구간/요일)", "content_meta.hours_raw")
            deferred_fields.append("opening_hours")   # 값은 있으나 구조화 불가 → DB 컬럼은 no-op
        en_name = (name_en or names.get("en") or "").strip() or None
        d = decision[cid]
        return {
            "canonical_id": cid, "city": city, "service_status": "ACTIVE",
            "decision": d["decision"], "main_city_spot_id": d["main_city_spot_id"], "tier": d["tier"],
            "category": cat, "subcategory": sub, "category_mapping": kind,
            "source_category": (cat_src or "").strip() or None, "semantic_category": semantic,
            "owned_fields": owned_fields, "deferred_fields": deferred_fields,
            # Main `name` = 영문 대표명(계약 §4). 영문이 없으면 한글명을 name 에 두고 NO_SOURCE_VALUE 로 표시한다.
            "name": en_name or (name_ko or None), "name_en_status": "REPLACE_WITH_VALUE" if en_name else "NO_SOURCE_VALUE",
            "name_l10n": l10n(ko=name_ko, en=en_name, ja=names.get("ja"), zh=names.get("zh")),
            # Main `description` = short summary(현재 영문 표시). 영문 요약이 없으면 NO_SOURCE_VALUE.
            "description": descs.get("en") or None,
            "desc_l10n": l10n(ko=descs.get("ko"), en=descs.get("en"), ja=descs.get("ja"), zh=descs.get("zh")),
            "why_it_matters": None, "why_l10n": l10n(ko=why_ko),
            "address": (address or "").strip() or None, "district": (district or "").strip() or None,
            "lat": to_float(lat), "lng": to_float(lng),
            "official_url": (official_url or "").strip() or None,
            "map_url": None, "naver_map_url": None,          # 런타임 생성(계약 §4) — 검증된 exact URL 만 들어감
            "opening_hours": oh, "opening_hours_policy": pol,
            "tags": [t for t in (tags or []) if isinstance(t, str) and t.strip()][:20] or None,
            "provenance": provenance or {},
        }

    # ── 부산 Food 194 ───────────────────────────────────────────────────────
    fml = ml_index(data["busan_food_ml"], "canonical_id")
    for c in sorted(data["busan_food"], key=lambda x: x["canonical_id"]):
        cid = c["canonical_id"]
        if cid not in active_ids:
            continue
        m = fml.get(cid, {})
        names = {k: v.get("title") for k, v in m.items()}
        descs = {"ko": c.get("description_ko"), "en": c.get("description_en") or (m.get("en") or {}).get("short_description"),
                 "ja": (m.get("ja") or {}).get("short_description"), "zh": (m.get("zh") or {}).get("short_description")}
        api = c.get("api_recovery_v1") or {}
        r = base_row(cid, "busan", "restaurant", c.get("category_ko"), name_en=c.get("name_en"), name_ko=c.get("name_ko"),
                     names=names, descs=descs, address=c.get("address_ko"), district=c.get("district_ko"),
                     lat=c.get("latitude"), lng=c.get("longitude"), official_url=None, hours_raw=None, tags=c.get("tags"),
                     owned=("district", "tags"),
                     provenance={"artifact": "busan-food-194-canonical-v1", "discovery_ids": c.get("discovery_candidate_ids"),
                                 "guide": c.get("guide_source"), "coord_status": c.get("coord_status"), "as_of": (api.get("as_of") or "")[:10] or None})
        active.append(r)
        add_source(cid, "busan-food-canonical", cid, primary=True, tier=c.get("guide_source"), as_of=r["provenance"]["as_of"])
        # Final 의 모든 matched_uc_seqs 를 정식 source 행으로 보존(migration 058 이 provider 당 다중 key 허용).
        # 완전히 같은 (entity, source_type, source_key) 의 중복 직렬화만 접는다(Owner 승인: exact duplicate 41).
        seqs = []
        for seq in api.get("matched_uc_seqs") or []:
            if seq not in seqs:
                seqs.append(seq)
        for seq in seqs:
            add_source(cid, "busan6260000-foodservice", seq, tier="OFFICIAL_API", as_of=r["provenance"]["as_of"])
        st = c.get("image_status")
        if c.get("image_url") and st in ("OFFICIAL_IMAGE_RESOLVED", "BUSINESS_IMAGE_RESOLVED"):
            rights = "VISITBUSAN_OFFICIAL" if st == "OFFICIAL_IMAGE_RESOLVED" else "BUSINESS_PROVIDED"
            add_image(cid, c["image_url"], rights, eligible=True, attribution=(rights == "VISITBUSAN_OFFICIAL"),
                      note=f"image_rights={c.get('image_rights')} image_source={c.get('image_source')}", as_of=r["provenance"]["as_of"])
        defer(cid, "phone", c.get("phone"), "busan-food-194-canonical-v1", "city_spots 에 phone 컬럼 없음", "content_meta.phone")
        defer(cid, "guide_award", c.get("guide_award"), "busan-food-194-canonical-v1", "schema 없음", "content_meta.awards")

    # ── 부산 NonFood 764 ────────────────────────────────────────────────────
    nml = ml_index(data["busan_nonfood_ml"], "canonical_id")
    for c in sorted(data["busan_nonfood"], key=lambda x: x["canonical_id"]):
        cid = c["canonical_id"]
        if cid not in active_ids:
            continue
        m = nml.get(cid, {})
        names = {k: v.get("title") for k, v in m.items()}
        descs = {"ko": c.get("description_ko"), "en": c.get("description_en") or (m.get("en") or {}).get("short_description"),
                 "ja": (m.get("ja") or {}).get("short_description"), "zh": (m.get("zh") or {}).get("short_description")}
        prov = c.get("provenance") or {}
        r = base_row(cid, "busan", c.get("category"), None, name_en=c.get("name_en"), name_ko=c.get("name_ko"), names=names,
                     descs=descs, address=c.get("address_ko"), district=None, lat=c.get("lat"), lng=c.get("lng"),
                     official_url=c.get("source_url"), hours_raw=c.get("hours"), tags=None,
                     owned=("official_url", "opening_hours"),
                     provenance={"artifact": "busan-nonfood-canonical-v1", "primary_source": prov.get("primary_source"),
                                 "source_keys": prov.get("source_keys"), "as_of": (prov.get("enriched_at") or "")[:10] or None})
        active.append(r)
        add_source(cid, "busan-nonfood-canonical", cid, primary=True, tier=c.get("release_class"), as_of=r["provenance"]["as_of"])
        # source_keys 예: 'AttractionService:288:ko' · 'VisitBusanContent:attraction:288:en' → 번호(uc_seq)만 key 로 쓰고
        # locale/category 변형(같은 번호)은 하나로 접는다(exact duplicate). 같은 provider 의 다른 번호는 각각 행(migration 058).
        seen_prov: dict[str, list[str]] = {}
        for sk in prov.get("source_keys") or []:
            parts = str(sk).split(":")
            if len(parts) < 2:
                continue
            stype = f"busan6260000-{parts[0].lower()}"
            num = next((pp for pp in parts[1:] if pp.isdigit()), None)
            if num is None:
                continue
            seen_prov.setdefault(stype, [])
            if num not in seen_prov[stype]:
                seen_prov[stype].append(num)
        for stype, nums in seen_prov.items():
            for num in nums:   # 같은 provider 의 서로 다른 번호는 각각 정식 source 행(058). 동일 번호의 locale 변형만 접음.
                add_source(cid, stype, num, tier="OFFICIAL_API", as_of=r["provenance"]["as_of"])
        if c.get("image_url"):
            ir = c.get("image_rights")
            if ir == "usable":
                add_image(cid, c["image_url"], "VISITBUSAN_OFFICIAL", eligible=True, attribution=True, note=f"image_source={c.get('image_source')}", as_of=r["provenance"]["as_of"])
            elif ir == "operational_assumed":
                add_image(cid, c["image_url"], "OPERATOR_ASSUMED_REVIEW", eligible=False, attribution=True,
                          note="operator 제공 추정 — 권리 확인 전 비공개", as_of=r["provenance"]["as_of"])

    # ── 경주 299 ────────────────────────────────────────────────────────────
    gj_sources = defaultdict(list)
    for s in data["gyeongju_sources"]:
        gj_sources[s["candidate_id"]].append(s)
    gj_images = defaultdict(list)
    for im in data["gyeongju_images"]:
        gj_images[im["_candidate_id"]].append(im)
    for c in sorted(data["gyeongju"], key=lambda x: x["candidate_id"]):
        cid = c["candidate_id"]
        if cid not in active_ids:
            continue   # old GJ08 Food 102 (RETIRED) · EXCLUDED 3 은 active 가 아니다 — VG 105 가 Food slice
        if cid.startswith("gyeongju-GJ08-"):
            raise SystemExit(f"old GJ08 Food row still active in crosswalk: {cid}")
        en_title = c.get("official_en_title") if c.get("en_status") not in ("missing", "none") else None
        descs = {"ko": c.get("description_ko"), "en": c.get("official_en_description") or None}
        prov = c.get("provenance") or {}
        r = base_row(cid, "gyeongju", c.get("category"), c.get("subcategory"), name_en=en_title, name_ko=c.get("title_ko"), names={},
                     descs=descs, address=c.get("address"), district=c.get("district"), lat=c.get("lat"), lng=c.get("lng"),
                     official_url=c.get("official_url"), hours_raw=c.get("opening_hours"), tags=None,
                     owned=("district", "official_url", "opening_hours"),
                     provenance={"artifact": "gyeongju-canonical-places-v1", "primary_source": prov.get("primary_source"),
                                 "as_of": c.get("as_of"), "quality_tier": c.get("quality_tier"), "source_tier": c.get("source_tier")})
        active.append(r)
        for s in gj_sources.get(cid, []):
            add_source(cid, s["source_type"], s["source_key"], url=s.get("source_url"), tier=s.get("source_tier"), primary=s.get("is_primary"), as_of=s.get("as_of"))
        for im in sorted(gj_images.get(cid, []), key=lambda x: (not x.get("is_primary"), x.get("sort_order", 0))):
            add_image(cid, im["image_url"], im["rights_status"], eligible=bool(im.get("display_eligible")), attribution=bool(im.get("attribution_required")),
                      note=im.get("rights_note"), primary=bool(im.get("is_primary")), as_of=im.get("as_of"))
        defer(cid, "phone", c.get("phone"), "gyeongju-canonical-places-v1", "city_spots 에 phone 컬럼 없음", "content_meta.phone")
        defer(cid, "admission", c.get("admission"), "gyeongju-canonical-places-v1", "entry_fee 형식 미확인", "entry_fee(검토 후)")

    # ── 경주 VisitGyeongju Food 105 (REINTEGRATION-PREP-V1) ──────────────────
    # 공식 4개국어(ko/en/ja/zh) 100% 제공 — 그대로 저장(번역·fallback·cross-locale 복사 0). zh-CN → zh adapter(LOCALE_MAP).
    # Main name = title_en · description = desc_en · address = address_ko(공식 한국어 주소) · district = VisitGyeongju area ·
    # official_url = 영문 공식 페이지 · opening_hours raw(hours_en) 는 기존 정책대로 구조화 시도/deferred · phone/address l10n 은 deferred.
    vg_ml = defaultdict(dict)
    for r in data["gyeongju_food_vg_ml"]:
        loc = LOCALE_MAP.get(r.get("locale") or "")
        if loc:
            vg_ml[r["vg_id"]][loc] = r
    # sidecars (FINAL-PLAN-REGENERATION-V1): final coordinates f428ef9 · official images 323142e — join key vg_id only(이름/주소/좌표 join 0)
    vg_coord = {}
    for c2 in data["gyeongju_food_vg_coords"]:
        if c2["vg_id"] in vg_coord:
            raise SystemExit(f"duplicate coordinate sidecar vg_id {c2['vg_id']}")
        vg_coord[c2["vg_id"]] = c2
    vg_image = {}
    for im in data["gyeongju_food_vg_images"]:
        if im["vg_id"] in vg_image:
            raise SystemExit(f"duplicate image sidecar vg_id {im['vg_id']}")
        vg_image[im["vg_id"]] = im
    if len(vg_coord) != 105 or len(vg_image) != 105:
        raise SystemExit(f"sidecar counts coords={len(vg_coord)} images={len(vg_image)} != 105")
    for r in sorted(data["gyeongju_food_vg"], key=lambda x: x["replacement_candidate_id"]):
        cid = r["replacement_candidate_id"]
        if cid not in active_ids:
            continue
        m = vg_ml.get(r["vg_id"], {})
        if set(m) != {"ko", "en", "ja", "zh"}:
            raise SystemExit(f"{cid}: multilingual handoff locales {sorted(m)} != ko/en/ja/zh")
        co = vg_coord.get(r["vg_id"]); im = vg_image.get(r["vg_id"])
        if co is None or im is None:
            raise SystemExit(f"{cid}: sidecar join missing (coord={co is not None}, image={im is not None})")
        if co.get("replacement_candidate_id") != cid or im.get("replacement_candidate_id") != cid:
            raise SystemExit(f"{cid}: sidecar candidate id mismatch")
        if not co.get("nav_ready") or co.get("coordinate_quality") not in ("ENTITY_EXACT", "ADDRESS_NUMBER_LEVEL"):
            raise SystemExit(f"{cid}: coordinate not NAV_READY ({co.get('coordinate_quality')})")
        lat, lng = to_float(co.get("lat")), to_float(co.get("lng"))
        if lat is None or lng is None or not (35.5 < lat < 36.2 and 128.9 < lng < 129.7):
            raise SystemExit(f"{cid}: coordinate missing/outside Gyeongju")
        if im.get("representative_image_status") != "READY" or not im.get("primary_image_url") or im.get("provider") != "VisitGyeongju":
            raise SystemExit(f"{cid}: official image not READY")
        titles = {loc: (m[loc].get("title") or r.get(f"title_{loc}")) for loc in ("ko", "en", "ja", "zh")}
        descs = {loc: (m[loc].get("description") or r.get(f"desc_{loc}") or None) for loc in ("ko", "en", "ja", "zh")}
        row = base_row(cid, "gyeongju", "restaurant", None, name_en=titles["en"], name_ko=titles["ko"], names={"en": titles["en"], "ja": titles["ja"], "zh": titles["zh"]},
                       descs=descs, address=r.get("address_ko"), district=r.get("area"), lat=lat, lng=lng,
                       official_url=r.get("source_url_en") or r.get("source_url_ko"), hours_raw=r.get("hours_en"), tags=None,
                       owned=("district", "official_url", "opening_hours"),
                       provenance={"artifact": "gyeongju-vg-food-105-service-v2", "vg_id": r["vg_id"], "match_to_existing": r.get("match_to_existing"),
                                   "existing_canonical_id": r.get("existing_canonical_id"), "rights_status": m["ko"].get("rights_status"),
                                   "coordinate_artifact": "gyeongju-vg-food-105-coordinates-final-v2", "coordinate_source": co.get("coordinate_source"),
                                   "coordinate_quality": co.get("coordinate_quality"), "coordinate_provenance": co.get("provenance"), "nav_ready": bool(co.get("nav_ready")),
                                   "image_artifact": "gyeongju-vg-food-105-official-images-v1", "image_provenance": im.get("provenance")})
        active.append(row)
        add_source(cid, VISITGYEONGJU_SOURCE_TYPE, r["vg_id"], url=r.get("source_url_ko"), tier="OFFICIAL_TOURISM_BODY", primary=True, as_of="2026-08-22")
        add_image(cid, im["primary_image_url"], VG_IMAGE_RIGHTS_STATUS, eligible=True, attribution=True, primary=True, as_of=im.get("as_of"),
                  note=f"VisitGyeongju official page image · {im.get('provenance')} · source_page={im.get('source_page_url')}")
        defer(cid, "phone", r.get("phone"), "gyeongju-vg-food-105-service-v2", "city_spots 에 phone 컬럼 없음", "content_meta.phone")
        defer(cid, "address_l10n", {k: r.get(f"address_{k}") for k in ("en", "ja", "zh") if r.get(f"address_{k}")}, "gyeongju-vg-food-105-service-v2", "city_spots 에 address l10n 컬럼 없음", "content_meta.address_l10n")
        defer(cid, "source_url_l10n", {k: r.get(f"source_url_{k}") for k in ("ko", "ja", "zh") if r.get(f"source_url_{k}")}, "gyeongju-vg-food-105-service-v2", "locale 별 공식 페이지 URL", "content_meta.source_url_l10n")

    # ── 서울 1,837 · 제주 1,496 ────────────────────────────────────────────
    for key, city, ml_key, ml_id in [("seoul", "seoul", "seoul_ml", "canonical_place_id"), ("jeju", "jeju", "jeju_ml", "canonical_place_id")]:
        ml = ml_index(data[ml_key], ml_id)
        for c in sorted(data[key], key=lambda x: x["candidate_id"]):
            cid = c["candidate_id"]
            if cid not in active_ids:
                continue
            m = ml.get(c.get("source_cid") or "", {})
            names = {k: v.get("title") for k, v in m.items()}
            # 서울(TASK-SEOUL-DESCRIPTION-CORRECTION-V1, Owner 승인): <style>/<script> 블록 제거 + allowlist 3 장소/6 locale exact dedupe.
            # 제주는 동결(기존 strip_html 그대로). ko 는 Final description_ko 그대로(4,000 cap 은 Final 계약).
            if city == "seoul":
                descs = {"ko": c.get("description_ko"), "en": seoul_description(cid, "en", (m.get("en") or {}).get("short_description")),
                         "ja": seoul_description(cid, "ja", (m.get("ja") or {}).get("short_description")), "zh": seoul_description(cid, "zh", (m.get("zh") or {}).get("short_description"))}
            else:
                descs = {"ko": c.get("description_ko"), "en": strip_html((m.get("en") or {}).get("short_description")) or None,
                         "ja": strip_html((m.get("ja") or {}).get("short_description")) or None, "zh": strip_html((m.get("zh") or {}).get("short_description")) or None}
            r = base_row(cid, city, c.get("category"), c.get("sub_category_raw"), name_en=None, name_ko=c.get("title_ko"), names=names,
                         descs=descs, address=c.get("address"), district=None, lat=c.get("lat"), lng=c.get("lng"),
                         official_url=c.get("homepage"), hours_raw=c.get("opening_hours_raw"), tags=c.get("tags") if isinstance(c.get("tags"), list) else None,
                         owned=("official_url", "opening_hours", "tags"),
                         provenance={"artifact": f"{city}-canonical-places-v1", "source_tier": c.get("source_tier"), "final_class": c.get("final_class"),
                                     "coord_source": c.get("coord_source"), "as_of": None})
            active.append(r)
            stype = "kto" if (c.get("source_tier") or "").startswith("KTO") else ("visitseoul" if city == "seoul" else "visitjeju")
            add_source(cid, stype, c.get("source_cid"), tier=c.get("source_tier"), primary=True)
            if c.get("image_url"):
                rs = c.get("image_rights_status") or "RIGHTS_UNKNOWN"
                add_image(cid, c["image_url"], rs, eligible=bool(c.get("image_display_eligible")) and rs not in ("RIGHTS_UNKNOWN",),
                          attribution=True, note=f"image_status={c.get('image_status')}")
            defer(cid, "phone", c.get("phone"), f"{city}-canonical-places-v1", "city_spots 에 phone 컬럼 없음", "content_meta.phone")
            defer(cid, "eligibility", c.get("eligibility"), f"{city}-canonical-places-v1", "readiness/scheduler 컬럼(§5) 미적용", "catalog_ready/scheduler_ready/schedule_role")
            defer(cid, "subway_access", c.get("subway_access"), f"{city}-canonical-places-v1", "schema 없음", "content_meta.transit")

    # ── 전주 236 ────────────────────────────────────────────────────────────
    jml = ml_index(data["jeonju_ml"], "candidate_id")
    for c in sorted(data["jeonju"], key=lambda x: x["candidate_id"]):
        cid = c["candidate_id"]
        if cid not in active_ids:
            continue
        m = jml.get(cid, {})
        names = {k: v.get("title") for k, v in m.items()}
        descs = {"en": (m.get("en") or {}).get("short_description"), "ja": (m.get("ja") or {}).get("short_description"), "zh": (m.get("zh") or {}).get("short_description")}
        r = base_row(cid, "jeonju", c.get("domain"), c.get("menu"), name_en=None, name_ko=c.get("display_name"), names=names, descs=descs,
                     address=c.get("kto_addr"), district=None, lat=c.get("lat"), lng=c.get("lng"), official_url=c.get("source_url"), hours_raw=None, tags=None,
                     owned=("official_url",),
                     provenance={"artifact": "jeonju-final-service-catalog-v1", "source": c.get("source"), "match_type": c.get("match_type"), "as_of": "2026-08-18"})
        active.append(r)
        # ARTIFACT TRUST: OFF 레코드의 kto_cid 는 좌표 근접 crossmatch 후보이지 provenance 가 아니다(FINAL-ARTIFACT-ALIGNMENT).
        # artifact 가 identity 를 확정한 match_type 에서만 kto 출처를 붙이고, 그 외는 relation metadata(content_meta.relation)에만 남긴다.
        kto_confirmed = c.get("source") == "KTO" or c.get("match_type") in ("CONFIRMED_MERGE", "EXACT_MATCH", "STRONG_MATCH", "CONFIRMED_MERGE_PHASE9")
        if c.get("kto_cid") and kto_confirmed:
            add_source(cid, "kto", c["kto_cid"], tier="KTO_TOURAPI", primary=(c.get("source") == "KTO"), as_of="2026-08-18")
        if c.get("sid"):
            add_source(cid, "visitjeonju", c["sid"], url=c.get("source_url"), tier="OFFICIAL", primary=(c.get("source") != "KTO"), as_of="2026-08-18")
        if c.get("kto_image"):
            # 전주 카탈로그에는 KTO 저작권 유형(Type1/3)이 없다 → 권리 확인 전 비공개(DB CHECK 와 동일)
            add_image(cid, c["kto_image"], "KTO_TYPE_UNKNOWN", eligible=False, attribution=True, note="KTO cpyrhtDivCd 미확인 — 권리 확인 후 공개", as_of="2026-08-18")
        defer(cid, "phone", c.get("phone"), "jeonju-final-service-catalog-v1", "city_spots 에 phone 컬럼 없음", "content_meta.phone")

    # ── 전주 관계/identity metadata → deferred content_meta.relation (Core schema 에 관계 컬럼 없음 — 평면화하지 않는다) ──
    rel_path = os.path.join(OUT_DIR, "jeonju-relation-identity-metadata-v1.jsonl")
    if os.path.exists(rel_path):
        for line in io.open(rel_path, encoding="utf-8"):
            if not line.strip():
                continue
            m = json.loads(line)
            if m["canonical_id"] in active_ids:
                defer(m["canonical_id"], "relation", {k: m[k] for k in ("artifact_identity_review", "artifact_match_type", "proximity_kto_cid", "proximity_kto_title",
                                                                        "proximity_kto_is_identity_assertion", "artifact_resolution", "parent_child_markers_on_same_kto", "main_note") if k in m},
                      "jeonju sidecar(crossmatch/identity-resolution)", "Core schema 에 관계 컬럼 없음 — 관계 판정 metadata 보존(identity 자동 변경 없음)", "content_meta.relation")

    # ── 검산 · primary 1개 · 이미지 캐시 ────────────────────────────────────
    if len(active) != EXPECTED_TOTAL:
        raise SystemExit(f"active rows {len(active)} != {EXPECTED_TOTAL}")
    if len({r["canonical_id"] for r in active}) != EXPECTED_TOTAL:
        raise SystemExit("duplicate canonical_id in active")
    seen_primary: set[str] = set()
    for s in sources:
        if s["is_primary"]:
            if s["canonical_id"] in seen_primary:
                s["is_primary"] = False
            seen_primary.add(s["canonical_id"])
    for r in active:
        if r["canonical_id"] not in seen_primary:
            # 출처 행이 하나도 없으면 canonical 자체를 출처로 남긴다(식별자 없는 출처는 만들지 않는다)
            pass
    seen_img_primary: set[str] = set()
    for im in images:
        if im["is_primary"]:
            if im["canonical_id"] in seen_img_primary:
                im["is_primary"] = False
            seen_img_primary.add(im["canonical_id"])
    # city_spots.image_url 캐시 = display_eligible 대표 이미지 1장
    cache = {}
    for im in images:
        if im["display_eligible"] and im["is_primary"]:
            cache[im["canonical_id"]] = im["image_url"]
    for r in active:
        r["image_url"] = cache.get(r["canonical_id"])
        r["image_url_policy"] = "REPLACE_WITH_VALUE" if r["image_url"] else "NO_SOURCE_VALUE"

    n_active = write_jsonl(os.path.join(OUT_DIR, "five-city-core-active-v1.jsonl"), sorted(active, key=lambda r: (r["city"], r["canonical_id"])))
    n_src = write_jsonl(os.path.join(OUT_DIR, "five-city-core-sources-v1.jsonl"), sorted(sources, key=lambda s: (s["canonical_id"], s["source_type"], s["source_key"])))
    n_img = write_jsonl(os.path.join(OUT_DIR, "five-city-core-images-v1.jsonl"), sorted(images, key=lambda i: (i["canonical_id"], not i["is_primary"], i["image_url"])))
    n_def = write_jsonl(os.path.join(OUT_DIR, "five-city-core-deferred-fields-v1.jsonl"), sorted(deferred, key=lambda d: (d["canonical_id"], d["field"])))

    # Gate C artifact — (city, source_category, semantic) 별 계약 표
    mapping_rows = []
    for (city, src, semantic), n in sorted(cat_map_rows.items()):
        cat, kind = CATEGORY_RULES.get(src, ("attraction", "UNSUPPORTED_DEFER"))
        mapping_rows.append({
            "city": city, "source_category": src, "runtime_category": cat, "semantic_category": semantic,
            "subcategory": semantic if semantic != cat else "<source raw subcategory as-is>",
            "mapping_type": {"DIRECT_MAP": "DIRECT", "NORMALIZE_MAP": "NORMALIZED", "UNSUPPORTED_DEFER": "DEFERRED"}[kind],
            "lossy": False, "rows": n,
            "notes": ("semantic 토큰을 subcategory 에 보존, raw 세부 분류는 content_meta.subcategory_raw 로 deferred" if semantic != cat
                      else ("runtime == semantic — subcategory 는 원본 세부 분류 그대로" if kind == "DIRECT_MAP" else "runtime == semantic(정규화만) — 의미 손실 없음")),
        })
    category_mapping = {
        "task": "TASK-FIVE-CITY-CORE-PREPROD-GATE-V1",
        "contract": {"runtime_compat_vocabulary": sorted(MAIN_CATEGORIES),
                     "semantic_vocabulary": sorted(set(SEMANTIC_RULES.values()) | set(SEMANTIC_SUB_OVERRIDE.values())),
                     "preservation_rule": "semantic != runtime → subcategory = semantic token; raw subcategory → deferred content_meta.subcategory_raw. semantic == runtime → subcategory = raw.",
                     "recoverability": "semantic == category OR subcategory == semantic (row 단위 검산)"},
        "mappings": mapping_rows,
        "lossy_mapping_count": len(lossy), "lossy_rows": lossy[:50],
        "schema_change_required": 0, "ui_scope": "data contract only — Search/Explore 카테고리 UI 는 Product Surface 단계",
    }
    write_json(os.path.join(OUT_DIR, "five-city-category-mapping-v1.json"), category_mapping)

    per_city = Counter(r["city"] for r in active)
    manifest = {
        "task": "TASK-MAIN-FIVE-CITY-CORE-INTEGRATION-PREP-AND-DRY-RUN-V1 → PREPROD-GATE-V1 → ARTIFACT-TRUST-V1 → FINAL-ARTIFACT-ALIGNMENT-V1",
        "package": PACKAGE_DIR, "schema_version": "intake-v1.6(final: gyeongju food 105 + final coordinates f428ef9 + official images 323142e + seoul final-freeze)",
        "pins_verified": pins, "inputs": manifest_inputs,
        "main_snapshot": {"path": "main-city-spots-snapshot-2026-08-22-v1.jsonl", "rows": 714, "user_data": False,
                          "sha256": file_sha256(os.path.join(OUT_DIR, "main-city-spots-snapshot-2026-08-22-v1.jsonl"))},
        "outputs": {
            "active": {"path": "five-city-core-active-v1.jsonl", "rows": n_active, "sha256": file_sha256(os.path.join(OUT_DIR, "five-city-core-active-v1.jsonl"))},
            "sources": {"path": "five-city-core-sources-v1.jsonl", "rows": n_src, "sha256": file_sha256(os.path.join(OUT_DIR, "five-city-core-sources-v1.jsonl"))},
            "images": {"path": "five-city-core-images-v1.jsonl", "rows": n_img, "sha256": file_sha256(os.path.join(OUT_DIR, "five-city-core-images-v1.jsonl"))},
            "deferred": {"path": "five-city-core-deferred-fields-v1.jsonl", "rows": n_def, "sha256": file_sha256(os.path.join(OUT_DIR, "five-city-core-deferred-fields-v1.jsonl"))},
            "crosswalk": {"path": "five-city-core-crosswalk-v1.jsonl", "sha256": file_sha256(os.path.join(OUT_DIR, "five-city-core-crosswalk-v1.jsonl"))},
            "main_classification": {"path": "five-city-core-main-classification-v1.jsonl", "sha256": file_sha256(os.path.join(OUT_DIR, "five-city-core-main-classification-v1.jsonl"))},
            "twin_resolution": {"path": "five-city-core-twin-resolution-v1.jsonl", "sha256": file_sha256(os.path.join(OUT_DIR, "five-city-core-twin-resolution-v1.jsonl"))},
            "heuristic_twin_release": {"path": "five-city-core-heuristic-twin-release-v1.jsonl", "sha256": file_sha256(os.path.join(OUT_DIR, "five-city-core-heuristic-twin-release-v1.jsonl"))},
            "jeonju_relation_metadata": {"path": "jeonju-relation-identity-metadata-v1.jsonl", "sha256": file_sha256(os.path.join(OUT_DIR, "jeonju-relation-identity-metadata-v1.jsonl"))},
            "category_mapping": {"path": "five-city-category-mapping-v1.json", "sha256": file_sha256(os.path.join(OUT_DIR, "five-city-category-mapping-v1.json"))},
        },
        "category_semantic": {"lossy_mapping_count": len(lossy), "rows_by_semantic": dict(Counter(r["semantic_category"] for r in active))},
        "active_per_city": dict(per_city), "active_total": n_active,
        "category_mapping": dict(cat_kinds), "opening_hours_policy": dict(hours_policy),
        "locale_mapping": {"zh-CN": "zh", "join_keys_normalized": ["canonical_place_id", "canonical_id", "candidate_id"]},
        "intake_fields": ["name", "name_l10n", "description", "desc_l10n", "why_l10n", "category", "subcategory", "address", "district", "lat", "lng", "official_url", "opening_hours", "tags", "image_url", "sources", "images"],
        "deferred_fields": sorted({d["field"] for d in deferred}),
        "images": {"display_eligible": sum(1 for i in images if i["display_eligible"]), "not_eligible": sum(1 for i in images if not i["display_eligible"]),
                   "rights_status": dict(Counter(i["rights_status"] for i in images))},
        "sources_by_type": dict(Counter(s["source_type"] for s in sources)),
    }
    write_json(os.path.join(OUT_DIR, "five-city-core-input-manifest-v1.json"), manifest)
    print(json.dumps({k: manifest[k] for k in ["active_per_city", "active_total", "category_mapping", "category_semantic", "opening_hours_policy", "images", "sources_by_type", "deferred_fields"]}, ensure_ascii=False, indent=1))
    print("rows:", n_active, n_src, n_img, n_def)


if __name__ == "__main__":
    main()
