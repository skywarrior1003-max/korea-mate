#!/usr/bin/env python3
"""
gyeongju_tier_a_kto_pilot_v1.py — 경주 TIER_A KTO API 계약 + 5건 파일럿

TASK-GYEONGJU-KTO-API-CONTRACT-AND-5-PLACE-PILOT-V1
Version: 1.0.0

Phase A: areaBasedList2 수집 (KTO API — HTTP)
Phase B: Pilot 5건 KTO 이름 매칭 (offline)
Phase C: VG HTML 수집 (HTTP)
Phase D: KTO detail 수집 — detailCommon2 + detailIntro2 + detailImage2 (HTTP)
Phase E: 처리 → Snapshot 생성 (offline, 결정적)
Phase F: QA + 재현성 검증 (offline)

LLM·Gemini 사용 금지. Run1 = Run2 BYTE_IDENTICAL.
AS_OF 고정: 2026-08-07T09:00:00Z
"""

import json, os, re, sys, time
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# ── Import 기존 collector 유틸 ────────────────────────────────────────────────
REPO = Path(__file__).parent.parent
sys.path.insert(0, str(REPO / "scripts"))

from gyeongju_official_detail_collector_v1 import (
    load_jsonl, jdump, jwrite, jlwrite, sha256_file,
    load_api_key, normalize_name,
    fetch_vg_detail, parse_vg_detail,
    fetch_kto_detail, parse_kto_detail,
    _kto_get, _extract_kto_list,
    CALL_SLEEP, MAX_RETRY,
    KOGL1, KTO_IMG_RIGHTS,
)

# ── Paths ─────────────────────────────────────────────────────────────────────
NORM   = REPO / "data/tourapi/normalized/gyeongju"
VAL    = REPO / "data/tourapi/validation/gyeongju"
RAW_GJ = REPO / "data/tourapi/raw/gyeongju"
KTO_LIST_DIR = RAW_GJ / "kto-list"
PILOT_RAW    = RAW_GJ / "gyeongju-tier-a-pilot-v1"
MAN_DIR      = REPO / "data/tourapi/manifests/gyeongju"

for d in [KTO_LIST_DIR, PILOT_RAW]:
    d.mkdir(parents=True, exist_ok=True)

AS_OF = "2026-08-07T09:00:00Z"

# ── Frozen SHA 대상 (기존 파일 불변 확인) ────────────────────────────────────
FROZEN_FILES_REL = [
    "data/tourapi/normalized/gyeongju/gyeongju-full-v1-candidates.jsonl",
    "data/tourapi/normalized/gyeongju/source-facts-full-v1.jsonl",
    "data/tourapi/normalized/gyeongju/gyeongju-tourism-next-batch-priority-v1.jsonl",
    "data/tourapi/normalized/gyeongju/gyeongju-attraction-identity-audit-v1.jsonl",
]

# ── Pilot 5건 정의 (하드코딩 없음 — 파일에서 동적 로드) ─────────────────────
PILOT_CANDIDATE_IDS = frozenset([
    "gyeongju-GJ01-0010",  # 금장대 (야경+전망)
    "gyeongju-GJ01-0055",  # 서출지 (야경)
    "gyeongju-GJ01-0041",  # 황룡사지
    "gyeongju-GJ01-0008",  # 교촌마을
    "gyeongju-GJ01-0039",  # 황남리 고분군
])

# ── KTO API 파라미터 ──────────────────────────────────────────────────────────
KTO_AREA_CODE    = "35"   # 경상북도
KTO_SIGUNGU_CODE = "2"    # 경주시
KTO_BASE = "https://apis.data.go.kr/B551011/KorService2"

# ── VG URL 구성 매핑 (mnu_uid → code_uid) ────────────────────────────────────
# 출처: gyeongju_core27_snapshot_runner_v1.py build_identity_bundles()
MNU_TO_CODE = {2291: 1011, 2292: 1012, 2293: 1015, 2294: 1016, 2295: 1014, 2296: 1010}
VG_BASE = "https://www.gyeongju.go.kr"


def build_vg_url(area_uid: int, mnu_uid: int) -> str:
    """VG 상세 페이지 URL 구성. mnu_uid → code_uid 매핑 사용."""
    code_uid = MNU_TO_CODE.get(mnu_uid, 1012)
    return (
        f"{VG_BASE}/tour/page.do?"
        f"listType=&mnu_uid={mnu_uid}&sortKwd=name&"
        f"code_uid={code_uid}&srchKwd=&area_uid={area_uid}&cmd=2"
    )


def _print(msg: str):
    print(msg, flush=True)


# ═══════════════════════════════════════════════════════════════════════════════
# Phase A: areaBasedList2 수집
# ═══════════════════════════════════════════════════════════════════════════════

def fetch_area_based_list(content_type_id: str, api_key: str, force=False) -> dict:
    """KTO areaBasedList2 수집 — HTTP. 기존 파일 있으면 skip."""
    fname = f"kto-type{content_type_id}-areabasedlist2-gyeongju-v1.json"
    raw_path = KTO_LIST_DIR / fname
    if raw_path.exists() and not force:
        _print(f"[areaBasedList2] SKIP (cached): {fname}")
        return json.loads(raw_path.read_text("utf-8"))

    _print(f"[areaBasedList2] 수집 중: contentTypeId={content_type_id} ...")
    params = {
        "areaCode": KTO_AREA_CODE,
        "sigunguCode": KTO_SIGUNGU_CODE,
        "contentTypeId": content_type_id,
        "numOfRows": "1000",
        "pageNo": "1",
    }
    resp = _kto_get("areaBasedList2", params, api_key)
    raw = {
        "collected_at": AS_OF,
        "content_type_id": content_type_id,
        "area_code": KTO_AREA_CODE,
        "sigungu_code": KTO_SIGUNGU_CODE,
        "http_status": resp.get("http_status"),
        "data": resp.get("data", {}),
    }
    raw_path.write_text(jdump(raw, indent=2) + "\n", encoding="utf-8")
    items = _extract_kto_list(resp)
    _print(f"[areaBasedList2] type{content_type_id}: HTTP {resp.get('http_status')} | {len(items)}건")
    return raw


# ═══════════════════════════════════════════════════════════════════════════════
# Phase B: 이름 매칭
# ═══════════════════════════════════════════════════════════════════════════════

def build_kto_name_index(list_raws: list[dict]) -> dict:
    """areaBasedList2 응답들 → {normalized_name: [(content_id, content_type_id, title, item)]}
    item: areaBasedList2 항목 전체 (좌표·주소 포함)."""
    idx = {}
    for raw in list_raws:
        items = _extract_kto_list({"http_status": raw.get("http_status"), "data": raw.get("data", {})})
        ctype = raw.get("content_type_id", "12")
        for it in items:
            cid = str(it.get("contentid", ""))
            title = str(it.get("title", ""))
            norm = normalize_name(title)
            if norm:
                idx.setdefault(norm, []).append((cid, ctype, title, it))
    return idx


def match_candidate_to_kto(candidate: dict, kto_index: dict) -> dict:
    """candidate name_ko → KTO 이름 매칭."""
    name_ko = candidate.get("name_ko", "")
    cand_id = candidate.get("candidate_id", "")
    norm = normalize_name(name_ko)

    hit = kto_index.get(norm, [])
    if len(hit) == 0:
        status = "KTO_MATCH_NOT_FOUND"
        content_id = None
        content_type_id = None
        kto_title = None
        list_item = {}
    elif len(hit) == 1:
        status = "EXACT_MATCH"
        content_id, content_type_id, kto_title, list_item = hit[0]
    else:
        # 복수 후보 → 첫 번째 type12 우선
        status = "AMBIGUOUS_MATCH"
        type12_hits = [h for h in hit if h[1] == "12"]
        chosen = type12_hits[0] if type12_hits else hit[0]
        content_id, content_type_id, kto_title, list_item = chosen

    def _clean_coord(v):
        """좌표 문자열 → float, 0이면 None."""
        try:
            f = float(v or 0)
            return f if f != 0.0 else None
        except (ValueError, TypeError):
            return None

    return {
        "as_of": AS_OF,
        "candidate_id": cand_id,
        "name_ko": name_ko,
        "name_norm": norm,
        "kto_content_id": content_id,
        "kto_content_type_id": content_type_id,
        "kto_title": kto_title,
        "match_status": status,
        "all_hits": len(hit),
        # areaBasedList2 좌표·주소 (detailCommon2 빈 경우 fallback)
        "list_mapx": _clean_coord(list_item.get("mapx")),
        "list_mapy": _clean_coord(list_item.get("mapy")),
        "list_addr1": list_item.get("addr1") or None,
        "list_addr2": list_item.get("addr2") or None,
        "list_tel": list_item.get("tel") or None,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Phase E: Snapshot 생성
# ═══════════════════════════════════════════════════════════════════════════════

def build_snapshot(candidate: dict, audit_entry: dict, link: dict,
                   vg_raw: dict, kto_raw: dict | None,
                   attr_overlay: dict) -> dict:
    # link에는 areaBasedList2 좌표가 있음 (detailCommon2 빈 경우 fallback)
    """VG + KTO raw → 병합 snapshot (결정적)."""
    vg = parse_vg_detail(vg_raw) if vg_raw else {}
    kto = parse_kto_detail(kto_raw) if kto_raw else None

    cand_id = candidate.get("candidate_id", "")
    name_ko = candidate.get("name_ko", "")
    area_uid = audit_entry.get("area_uid")

    # ── VG 필드 ──
    vg_desc = vg.get("description_full_source")
    vg_desc_short = vg.get("description_short") or vg_desc
    # extract_sentences 없이 간단히 첫 700자 (collector에서 이미 처리)
    if vg_desc and len(vg_desc) > 700:
        # 문장 기준으로 잘라냄
        sents = re.split(r'(?<=[.!?])\s+', vg_desc.strip())
        selected = []
        total = 0
        for s in sents:
            if total + len(s) + 1 > 700:
                break
            selected.append(s)
            total += len(s) + 1
        vg_desc_short = " ".join(selected) if selected else vg_desc[:700]

    vg_images_kogl = [img for img in vg.get("images", []) if img.get("rights_verdict") == KOGL1]

    # ── KTO 필드 ──
    # parse_kto_detail 반환 키: mapx=경도(lng), mapy=위도(lat)
    # detailCommon2가 비어 있으면 areaBasedList2 좌표(link.list_mapx/mapy)를 사용
    kto_block = None
    if kto:
        # detailCommon2 좌표 → 없으면 areaBasedList2 fallback
        lat_kto = kto.get("mapy") or link.get("list_mapy")
        lng_kto = kto.get("mapx") or link.get("list_mapx")
        addr_kto = kto.get("addr1") or link.get("list_addr1")
        kto_block = {
            "content_id": kto.get("content_id"),
            "content_type_id": kto.get("content_type_id"),
            "overview": kto.get("overview"),
            "overview_rights": KTO_IMG_RIGHTS,
            "address": addr_kto,
            "lat": lat_kto,
            "lng": lng_kto,
            "lat_source": "detailCommon2" if kto.get("mapy") else "areaBasedList2_fallback",
            "tel": kto.get("tel") or link.get("list_tel"),
            "homepage": kto.get("homepage"),
            "images_kto": [],  # RIGHTS_EVIDENCE_MISSING — merged에 포함 안함
            "detail_intro2": kto.get("intro", {}),
        }
    # KTO 매칭 없어도 areaBasedList2 좌표·주소가 있으면 사용
    list_lat = link.get("list_mapy")
    list_lng = link.get("list_mapx")
    list_addr = link.get("list_addr1")

    # ── 병합 ──
    merged = {
        "description_ko": vg_desc_short or None,
        "description_rights": KOGL1 if vg_desc_short else None,
        "address": (vg.get("address") or
                    (kto_block.get("address") if kto_block else None) or
                    list_addr),
        "lat": ((kto_block.get("lat") if kto_block else None) or list_lat),
        "lng": ((kto_block.get("lng") if kto_block else None) or list_lng),
        "coord_source": ("KTO_detail" if kto_block and kto_block.get("lat") else
                         "areaBasedList2_list" if list_lat else None),
        "phone": vg.get("phone") or (kto.get("tel") if kto else None),
        "operation_hours": vg.get("operation_hours") or (
            (kto.get("intro") or {}).get("usetime") if kto else None
        ),
        "images": vg_images_kogl,   # VG KOGL1 이미지만 (KTO 이미지 제외)
    }

    return {
        "as_of": AS_OF,
        "candidate_id": cand_id,
        "name_ko": name_ko,
        "area_uid": area_uid,
        "kto_content_id": link.get("kto_content_id"),
        "kto_match_status": link.get("match_status"),
        "has_night_view": attr_overlay.get("has_night_view", False),
        "has_viewpoint": attr_overlay.get("has_viewpoint", False),
        "vg": {
            "area_uid": area_uid,
            "http_status": vg.get("http_status"),
            "parse_ok": vg.get("parse_ok"),
            "name_official": vg.get("name_official"),
            "description_ko": vg_desc_short,
            "description_rights": KOGL1,
            "address": vg.get("address"),
            "phone": vg.get("phone"),
            "operation_hours": vg.get("operation_hours"),
            "images": vg_images_kogl,
        },
        "kto": kto_block,
        "merged": merged,
        "vg_collected_at": vg_raw.get("collected_at") if vg_raw else None,
        "kto_collected_at": kto_raw.get("collected_at") if kto_raw else None,
        "pipeline_version": "tier-a-pilot-v1",
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    _print("=" * 70)
    _print("TASK-GYEONGJU-KTO-API-CONTRACT-AND-5-PLACE-PILOT-V1")
    _print("=" * 70)

    # ── Frozen SHA (실행 전 불변 확인) ────────────────────────────────────────
    _print("\n[0] Frozen SHA 감사")
    frozen_sha = {}
    for rel in FROZEN_FILES_REL:
        p = REPO / rel
        if not p.exists():
            _print(f"  MISSING: {rel}")
            sys.exit(1)
        sha = sha256_file(p)
        frozen_sha[rel] = sha
        _print(f"  OK: {p.name} → {sha[:12]}...")
    jwrite({"as_of": AS_OF, "sha_records": frozen_sha}, VAL / "gyeongju-tier-a-pilot-frozen-sha-v1.json", indent=2)

    # ── 입력 데이터 로드 ──────────────────────────────────────────────────────
    _print("\n[입력] 데이터 로드")
    all_queue = load_jsonl(NORM / "gyeongju-tourism-next-batch-priority-v1.jsonl")
    tier_a_map = {r["candidate_id"]: r for r in all_queue if r.get("next_batch_tier") == "TIER_A_NEXT_RELEASE"}
    _print(f"  TIER_A 전체: {len(tier_a_map)}건")

    id_audit = load_jsonl(NORM / "gyeongju-attraction-identity-audit-v1.jsonl")
    cid_to_audit = {a["baseline_candidate_id"]: a for a in id_audit if a.get("baseline_candidate_id")}

    attr_overlay_list = load_jsonl(NORM / "gyeongju-tourism-attributes-overlay-v1.jsonl")
    cid_to_attr = {}
    for a in attr_overlay_list:
        cid = a.get("candidate_id", "")
        if cid not in cid_to_attr:
            cid_to_attr[cid] = {}
        cid_to_attr[cid][a.get("attribute_key", "")] = a.get("value", False)

    # WEB-ATT source facts → mnu_uid 조회 (VG URL 구성용)
    sf_all = load_jsonl(NORM / "source-facts-full-v1.jsonl")
    web_att = [s for s in sf_all if "WEB-ATT" in s.get("source_fact_id", "")]
    name_to_mnu = {}
    for sf in web_att:
        nm = (sf.get("name") or "").strip()
        mnu = sf.get("web_mnu_uid")
        if nm and mnu:
            name_to_mnu[nm] = mnu
    _print(f"  WEB-ATT SF: {len(web_att)}건 (mnu_uid 보유: {len(name_to_mnu)}건)")

    # pilot 5건
    pilot_list = []
    for cid in sorted(PILOT_CANDIDATE_IDS):
        q = tier_a_map.get(cid)
        if not q:
            _print(f"  WARN: {cid} not in TIER_A queue")
            continue
        audit = cid_to_audit.get(cid, {})
        attr = cid_to_attr.get(cid, {})
        name_ko = q.get("name_ko", "")
        area_uid = audit.get("area_uid")
        mnu_uid = name_to_mnu.get(name_ko)
        pilot_list.append({
            "candidate_id": cid,
            "name_ko": name_ko,
            "area_uid": area_uid,
            "mnu_uid": mnu_uid,
            "has_night_view": attr.get("night_view", False),
            "has_viewpoint": attr.get("viewpoint", False),
            "queue": q,
            "audit": audit,
            "attr": attr,
        })
    _print(f"  Pilot 대상: {len(pilot_list)}건")
    for p in pilot_list:
        _print(f"    {p['candidate_id']} | {p['name_ko']} | area_uid={p['area_uid']} | mnu_uid={p['mnu_uid']}")

    # ── Phase A: areaBasedList2 ───────────────────────────────────────────────
    _print("\n[Phase A] areaBasedList2 수집")
    api_key = load_api_key()

    list_raw_12 = fetch_area_based_list("12", api_key)
    time.sleep(CALL_SLEEP)
    kto_index = build_kto_name_index([list_raw_12])

    # type14 수집 (문화시설 — 일부 유적지가 type14일 수 있음)
    list_raw_14 = fetch_area_based_list("14", api_key)
    time.sleep(CALL_SLEEP)
    kto_index_14 = build_kto_name_index([list_raw_14])
    # 인덱스 병합 (type12 우선)
    for norm, hits in kto_index_14.items():
        if norm not in kto_index:
            kto_index[norm] = hits
        else:
            # 중복이면 기존(type12) 유지
            pass

    items_12 = _extract_kto_list({
        "http_status": list_raw_12.get("http_status"),
        "data": list_raw_12.get("data", {}),
    })
    items_14 = _extract_kto_list({
        "http_status": list_raw_14.get("http_status"),
        "data": list_raw_14.get("data", {}),
    })
    _print(f"  type12: {len(items_12)}건 | type14: {len(items_14)}건 | 인덱스: {len(kto_index)}건")

    # ── Phase B: 이름 매칭 ────────────────────────────────────────────────────
    _print("\n[Phase B] KTO 이름 매칭")
    link_records = []
    for p in pilot_list:
        link = match_candidate_to_kto(p, kto_index)
        link_records.append(link)
        _print(f"  {p['candidate_id']} ({p['name_ko']}) → {link['match_status']} "
               f"| content_id={link['kto_content_id']}")

    jlwrite(link_records, VAL / "gyeongju-tier-a-pilot-kto-link-v1.jsonl")

    matched_count = sum(1 for l in link_records if l["match_status"] in ("EXACT_MATCH", "AMBIGUOUS_MATCH"))
    _print(f"  매칭 성공: {matched_count}/{len(link_records)}")

    # ── Phase C: VG HTML 수집 ─────────────────────────────────────────────────
    _print("\n[Phase C] VG HTML 수집")
    vg_raws = {}
    for p in pilot_list:
        area_uid = p["area_uid"]
        mnu_uid = p["mnu_uid"]
        cid = p["candidate_id"]
        if area_uid is None:
            _print(f"  SKIP VG (area_uid=None): {cid}")
            vg_raws[cid] = None
            continue
        if mnu_uid is None:
            _print(f"  WARN VG (mnu_uid=None → fallback mnu=2292): {cid}")
            mnu_uid = 2292
        vg_url = build_vg_url(area_uid, mnu_uid)
        vg_raw = fetch_vg_detail(area_uid, vg_url, PILOT_RAW, force=False)
        vg_raws[cid] = vg_raw
        status = vg_raw.get("http_status", 0)
        _print(f"  area_uid={area_uid} mnu={mnu_uid} | HTTP {status} | html_len={vg_raw.get('html_length', 0)}")
        time.sleep(CALL_SLEEP)

    # ── Phase D: KTO detail 수집 ──────────────────────────────────────────────
    _print("\n[Phase D] KTO detail 수집")
    kto_raws = {}
    for p, link in zip(pilot_list, link_records):
        cid = p["candidate_id"]
        content_id = link.get("kto_content_id")
        content_type_id = link.get("kto_content_type_id", "12")
        if not content_id:
            _print(f"  SKIP KTO (no content_id): {cid}")
            kto_raws[cid] = None
            continue
        kto_raw = fetch_kto_detail(content_id, content_type_id, api_key, PILOT_RAW, force=False)
        kto_raws[cid] = kto_raw
        c2_status = kto_raw.get("detail_common2", {}).get("http_status", 0)
        _print(f"  {cid} → kto-{content_id}: detailCommon2 HTTP {c2_status}")
        time.sleep(CALL_SLEEP)

    # ── Phase E: Snapshot 생성 ────────────────────────────────────────────────
    _print("\n[Phase E] Snapshot 생성")
    snapshots = []
    for p, link in zip(pilot_list, link_records):
        cid = p["candidate_id"]
        vg_raw = vg_raws.get(cid)
        kto_raw = kto_raws.get(cid)
        attr = p["attr"]
        attr_overlay_entry = {
            "has_night_view": attr.get("night_view", False),
            "has_viewpoint": attr.get("viewpoint", False),
        }
        snap = build_snapshot(
            candidate={"candidate_id": cid, "name_ko": p["name_ko"]},
            audit_entry=p["audit"],
            link=link,
            vg_raw=vg_raw,
            kto_raw=kto_raw,
            attr_overlay=attr_overlay_entry,
        )
        snapshots.append(snap)
        _print(f"  {cid}: VG_ok={snap['vg']['parse_ok']} | "
               f"kto_match={snap['kto_match_status']} | "
               f"desc_len={len(snap['merged']['description_ko'] or '')}")

    jlwrite(snapshots, NORM / "gyeongju-tier-a-pilot-snapshot-v1.jsonl")
    _print(f"  Snapshot: {len(snapshots)}건 저장")

    # ── Phase F: QA ───────────────────────────────────────────────────────────
    _print("\n[Phase F] QA")

    vg_ok_count = sum(1 for s in snapshots if s["vg"].get("parse_ok"))
    kto_match_count = sum(1 for s in snapshots if s["kto_match_status"] in ("EXACT_MATCH", "AMBIGUOUS_MATCH"))
    kto_detail_ok = sum(1 for s in snapshots if s["kto"] is not None)
    desc_count = sum(1 for s in snapshots if s["merged"].get("description_ko"))
    img_count = sum(len(s["merged"].get("images", [])) for s in snapshots)
    lat_count = sum(1 for s in snapshots if s["merged"].get("lat") is not None)

    # QA 판정
    all_pass = (
        vg_ok_count == len(snapshots) and
        kto_match_count >= 3 and
        desc_count == len(snapshots)
    )
    verdict = "PASS" if all_pass else "CONDITIONAL_PASS" if kto_match_count >= 2 else "FAIL"

    qa = {
        "as_of": AS_OF,
        "pipeline_version": "tier-a-pilot-v1",
        "pilot_count": len(snapshots),
        "vg_http_ok": vg_ok_count,
        "vg_parse_ok": vg_ok_count,
        "kto_match_count": kto_match_count,
        "kto_detail_ok": kto_detail_ok,
        "description_ko_count": desc_count,
        "image_count": img_count,
        "coordinate_count": lat_count,
        "verdict": verdict,
        "link_records": [
            {"candidate_id": l["candidate_id"],
             "match_status": l["match_status"],
             "kto_content_id": l["kto_content_id"]}
            for l in link_records
        ],
    }
    jwrite(qa, VAL / "gyeongju-tier-a-pilot-qa-v1.json", indent=2)
    _print(f"  vg_ok={vg_ok_count}/{len(snapshots)} | kto_match={kto_match_count}/{len(snapshots)}")
    _print(f"  desc_ko={desc_count} | images={img_count} | coords={lat_count}")
    _print(f"  QA 판정: {verdict}")

    # ── Frozen SHA 재검증 ─────────────────────────────────────────────────────
    _print("\n[재검증] Frozen SHA")
    for rel, expected_sha in frozen_sha.items():
        p = REPO / rel
        actual = sha256_file(p)
        ok = "OK" if actual == expected_sha else "CHANGED"
        _print(f"  {ok}: {p.name}")
        if actual != expected_sha:
            _print(f"  [ERROR] SHA 변경: {rel}")
            sys.exit(1)

    # ── Run1=Run2 가이드 ──────────────────────────────────────────────────────
    run_sha = {}
    for f in [
        NORM / "gyeongju-tier-a-pilot-snapshot-v1.jsonl",
        VAL  / "gyeongju-tier-a-pilot-kto-link-v1.jsonl",
        VAL  / "gyeongju-tier-a-pilot-qa-v1.json",
        KTO_LIST_DIR / "kto-type12-areabasedlist2-gyeongju-v1.json",
        KTO_LIST_DIR / "kto-type14-areabasedlist2-gyeongju-v1.json",
    ]:
        if f.exists():
            run_sha[str(f.relative_to(REPO))] = sha256_file(f)
    jwrite({"as_of": AS_OF, "run": "run1", "sha_records": run_sha},
           VAL / "gyeongju-tier-a-pilot-run1-run2-sha-v1.json", indent=2)
    _print(f"  SHA 감사: {len(run_sha)}개 파일")

    _print("\n" + "=" * 70)
    _print(f"완료: {verdict}")
    _print("=" * 70)

    if verdict == "FAIL":
        sys.exit(1)


if __name__ == "__main__":
    main()
