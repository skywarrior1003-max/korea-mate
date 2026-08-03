#!/usr/bin/env python3
"""
audit-busan-festival-source-reconciliation-v1.py
TASK-BUSAN-FESTIVAL-SOURCE-RECONCILIATION-V1 재현 가능한 감사 스크립트

실행: python scripts/audit-busan-festival-source-reconciliation-v1.py
출력: data/tourapi/reports/busan/ 하위 8개 JSON 파일
"""
import json
import os
import re
import sys
from datetime import date
from collections import defaultdict

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_BATCH = os.path.join(ROOT, "data/tourapi/raw/busan/2026-07-24/batch")
BATCH_STATE = os.path.join(ROOT, "data/tourapi/raw/busan/batch-state.json")
BATCH_SCRIPT = os.path.join(ROOT, "scripts/tourapi-busan-batch.mjs")
CAND_FILE = os.path.join(ROOT, "data/tourapi/enriched/busan/busan-enriched-candidates-v1.jsonl")
SF_FILE = os.path.join(ROOT, "data/tourapi/enriched/busan/busan-source-facts-v1.jsonl")
RPT_DIR = os.path.join(ROOT, "data/tourapi/reports/busan")
ANALYSIS_DATE = "2026-08-03"

LANG_CONFIG = {
    "ko":  ("getFestivalKr",  "busan-festival-ko-p001.json"),
    "en":  ("getFestivalEn",  "busan-festival-en-p001.json"),
    "ja":  ("getFestivalJa",  "busan-festival-ja-p001.json"),
    "zhs": ("getFestivalZhs", "busan-festival-zhs-p001.json"),
    "zht": ("getFestivalZht", "busan-festival-zht-p001.json"),
}

FIELD_MAP = dict(
    id="UC_SEQ", title="MAIN_TITLE", date_str="USAGE_DAY_WEEK_AND_TIME",
    place="MAIN_PLACE", addr="ADDR1", desc="ITEMCNTNTS",
    img="MAIN_IMG_NORMAL", tel="CNTCT_TEL", homepage="HOMEPAGE_URL",
)


def atomic_write(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)
    print(f"  WROTE: {os.path.basename(path)}")


def classify_date(text):
    if not text or not text.strip():
        return "no_date"
    years = re.findall(r"20(\d\d)", text)
    if not years:
        return "no_date"
    end_yy = int(years[-1])
    start_yy = int(years[0])
    if end_yy < 26:
        return "pre_2026_expired"
    if start_yy > 26:
        return "far_future"
    # 2026 포함
    months = re.findall(r"2026[^\d]*(\d{1,2})", text)
    last_m = int(months[-1]) if months else 0
    if last_m > 8:
        return "2026_future"
    return "2026_past_or_current"


def load_raw(lang):
    rkey, fname = LANG_CONFIG[lang]
    path = os.path.join(RAW_BATCH, fname)
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    return data[rkey]["item"]


def run():
    os.makedirs(RPT_DIR, exist_ok=True)

    # ── Phase 1: API 승인 및 인증 확인 ────────────────────────────────────────
    with open(BATCH_STATE, encoding="utf-8") as f:
        state = json.load(f)
    with open(BATCH_SCRIPT, encoding="utf-8", errors="replace") as f:
        script_src = f.read()

    busan_base = "https://apis.data.go.kr/6260000"  # line 302
    busan_base_in_script = "https://apis.data.go.kr/6260000" in script_src

    env_key_name = "TOUR_API_KEY"
    env_key_present = bool(os.environ.get("TOUR_API_KEY"))

    festival_in_state = {
        k: v for k, v in state.get("sources", {}).items()
        if k.startswith("busan-festival")
    }
    festival_in_script_sources = "festival" in script_src.lower()

    approved_api = {
        "busan_metropolitan_city_base": busan_base,
        "service_group_id": "6260000",
        "service_group_name": "부산광역시 공공데이터 서비스 그룹",
        "festival_service": {
            "name": "부산광역시_부산축제정보 서비스",
            "service_id": "FestivalService",
            "endpoints": {
                "ko":  f"{busan_base}/FestivalService/getFestivalKr",
                "en":  f"{busan_base}/FestivalService/getFestivalEn",
                "ja":  f"{busan_base}/FestivalService/getFestivalJa",
                "zhs": f"{busan_base}/FestivalService/getFestivalZhs",
                "zht": f"{busan_base}/FestivalService/getFestivalZht",
            }
        },
        "companion_services": {
            "attraction": "부산광역시_부산명소정보 서비스 (AttractionService)",
            "food": "부산광역시_부산맛집정보 서비스 (FoodService)",
        },
        "auth_method": {
            "env_var": env_key_name,
            "key_present_in_env": env_key_present,
            "shared_with_kto": True,
            "note": "apis.data.go.kr 전체 서비스(KTO B551011 포함 6260000)에 동일 serviceKey 사용 가능"
        },
        "separate_key_required": False,
        "separate_key_evidence": "batch-state.json에 busan-festival 5개 언어 모두 status=completed — 추가 키 없이 기존 TOUR_API_KEY로 수집 성공",
        "manual_verification_required": "data.go.kr 로그인 후 '부산광역시_부산축제정보 서비스' 상세 페이지에서 라이선스·필드 명세 최종 확인 권고",
        "festival_in_current_batch_script_sources": festival_in_script_sources,
        "festival_collected_via_state": list(festival_in_state.keys()),
        "note_script_gap": "현재 scripts/tourapi-busan-batch.mjs SOURCES 배열에 festival 항목이 없음 — 이전 버전 스크립트로 2026-07-24 수집 후 제거된 것으로 추정. 재수집 시 스크립트에 festival 재추가 필요.",
    }

    atomic_write(os.path.join(RPT_DIR, "busan-festival-approved-api-reconciliation-v1.json"), approved_api)

    # ── Phase 2: raw 재고 ─────────────────────────────────────────────────────
    inventory = {
        "raw_directory": RAW_BATCH,
        "collection_date": "2026-07-24",
        "batch_state_run_date": state.get("run_date"),
        "batch_state_started_at": state.get("started_at"),
        "files": {}
    }
    for lang, (rkey, fname) in LANG_CONFIG.items():
        fpath = os.path.join(RAW_BATCH, fname)
        sz = os.path.getsize(fpath)
        st = festival_in_state.get(f"busan-festival-{lang}", {})
        items = load_raw(lang)
        inventory["files"][lang] = {
            "filename": fname,
            "path": fpath.replace(ROOT + os.sep, "").replace("\\", "/"),
            "size_bytes": sz,
            "items_in_file": len(items),
            "items_in_state": st.get("items_collected"),
            "status": st.get("status"),
            "pages_completed": len(st.get("completed_pages", [])),
            "request_count": st.get("request_count"),
            "state_updated_at": st.get("updated_at"),
            "response_root_key": rkey,
            "endpoint": f"{busan_base}/FestivalService/{rkey.replace('get', 'get').replace('Kr','Kr').replace('En','En')}",
        }

    atomic_write(os.path.join(RPT_DIR, "busan-festival-raw-inventory-v1.json"), inventory)

    # ── Phase 3: raw 내용 감사 ────────────────────────────────────────────────
    all_items_by_lang = {}
    content_audit = {
        "analysis_date": ANALYSIS_DATE,
        "raw_collection_date": "2026-07-24",
        "by_lang": {}
    }

    for lang in LANG_CONFIG:
        items = load_raw(lang)
        all_items_by_lang[lang] = items

        date_cls = defaultdict(int)
        no_date_list, future_list, past_list = [], [], []

        for it in items:
            dt = it.get(FIELD_MAP["date_str"], "")
            cls = classify_date(dt)
            date_cls[cls] += 1
            if cls == "no_date":
                no_date_list.append({"id": it[FIELD_MAP["id"]], "title": it.get(FIELD_MAP["title"], "")[:40]})
            elif cls == "2026_future":
                future_list.append({"id": it[FIELD_MAP["id"]], "title": it.get(FIELD_MAP["title"], "")[:40], "date": dt[:60]})
            elif cls == "pre_2026_expired":
                past_list.append({"id": it[FIELD_MAP["id"]], "title": it.get(FIELD_MAP["title"], "")[:40], "date": dt[:50]})

        ids = [it[FIELD_MAP["id"]] for it in items]
        dup_ids = [x for x in ids if ids.count(x) > 1]

        content_audit["by_lang"][lang] = {
            "total": len(items),
            "unique_ids": len(set(ids)),
            "duplicate_ids": list(set(dup_ids)),
            "has_title": sum(1 for i in items if i.get(FIELD_MAP["title"], "").strip()),
            "has_date": sum(1 for i in items if i.get(FIELD_MAP["date_str"], "").strip()),
            "has_place": sum(1 for i in items if i.get(FIELD_MAP["place"], "").strip() or i.get(FIELD_MAP["addr"], "").strip()),
            "has_desc": sum(1 for i in items if i.get(FIELD_MAP["desc"], "").strip()),
            "has_image": sum(1 for i in items if i.get(FIELD_MAP["img"], "").strip()),
            "has_tel": sum(1 for i in items if i.get(FIELD_MAP["tel"], "").strip()),
            "date_classification": dict(date_cls),
            "no_date_events": no_date_list,
            "2026_future_events": future_list,
            "pre_2026_expired_sample": past_list[:5],
            "pre_2026_expired_count": len(past_list),
        }

    content_audit["ko_en_id_comparison"] = {
        "ko_ids": len(set(it[FIELD_MAP["id"]] for it in all_items_by_lang["ko"])),
        "en_ids": len(set(it[FIELD_MAP["id"]] for it in all_items_by_lang["en"])),
        "common": len(
            set(it[FIELD_MAP["id"]] for it in all_items_by_lang["ko"]) &
            set(it[FIELD_MAP["id"]] for it in all_items_by_lang["en"])
        ),
        "ko_only": sorted(
            set(it[FIELD_MAP["id"]] for it in all_items_by_lang["ko"]) -
            set(it[FIELD_MAP["id"]] for it in all_items_by_lang["en"])
        ),
        "en_only": sorted(
            set(it[FIELD_MAP["id"]] for it in all_items_by_lang["en"]) -
            set(it[FIELD_MAP["id"]] for it in all_items_by_lang["ko"])
        ),
    }

    atomic_write(os.path.join(RPT_DIR, "busan-festival-raw-content-audit-v1.json"), content_audit)

    # ── Phase 3b: event candidates 72건 vs raw 연결 ───────────────────────────
    raw_ko = {it[FIELD_MAP["id"]]: it for it in all_items_by_lang["ko"]}
    raw_ids_set = set(raw_ko.keys())

    event_cands = []
    with open(CAND_FILE, encoding="utf-8") as f:
        for line in f:
            rec = json.loads(line)
            if rec.get("category") == "event":
                event_cands.append(rec)

    linked, kto_only, no_source = [], [], []
    for c in event_cands:
        ss = c.get("source_summary", {})
        sk = ss.get("source_keys", [])
        fest_ids = [int(s.split(":")[1]) for s in sk if s.startswith("FestivalService:") and s.split(":")[1].isdigit()]
        kto_sk = [s for s in sk if "KorService" in s or "EngService" in s or "AttractionService" in s]

        pv = c.get("proposed_values", {})
        if fest_ids:
            raw_it = raw_ko.get(fest_ids[0], {})
            raw_date = raw_it.get(FIELD_MAP["date_str"], "")
            raw_img = raw_it.get(FIELD_MAP["img"], "")
            raw_desc = raw_it.get(FIELD_MAP["desc"], "")
            cand_img = pv.get("image", {}).get("url", "") if isinstance(pv.get("image"), dict) else pv.get("image", "")
            linked.append({
                "candidate_id": c["candidate_id"],
                "title": c.get("title_ko", "")[:40],
                "fest_ids": fest_ids,
                "in_raw": [fid for fid in fest_ids if fid in raw_ids_set],
                "not_in_raw": [fid for fid in fest_ids if fid not in raw_ids_set],
                "raw_date": raw_date[:60],
                "raw_date_class": classify_date(raw_date),
                "raw_has_image": bool(raw_img),
                "raw_has_desc": bool(raw_desc.strip()),
                "cand_has_hours": bool(pv.get("hours")),
                "date_not_applied": bool(raw_date and not pv.get("hours")),
                "image_not_applied": bool(raw_img and not cand_img),
            })
        elif kto_sk:
            kto_only.append({"candidate_id": c["candidate_id"], "title": c.get("title_ko", "")[:40], "source_keys": kto_sk})
        else:
            no_source.append({"candidate_id": c["candidate_id"], "title": c.get("title_ko", "")[:40]})

    raw_ids_linked = set()
    for l in linked:
        raw_ids_linked.update(l["fest_ids"])
    unlinked_raw = [
        {"id": rid, "title": raw_ko[rid].get(FIELD_MAP["title"], "")[:40],
         "date": raw_ko[rid].get(FIELD_MAP["date_str"], "")[:50]}
        for rid in sorted(raw_ids_set - raw_ids_linked)
    ]

    event_gap = {
        "analysis_date": ANALYSIS_DATE,
        "total_event_candidates": len(event_cands),
        "festival_service_linked": len(linked),
        "kto_only": len(kto_only),
        "no_source": len(no_source),
        "date_not_applied_to_hours": sum(1 for l in linked if l["date_not_applied"]),
        "image_not_applied": sum(1 for l in linked if l["image_not_applied"]),
        "2026_future_raw_linked": sum(1 for l in linked if l["raw_date_class"] == "2026_future"),
        "pre_2026_expired_linked": sum(1 for l in linked if l["raw_date_class"] == "pre_2026_expired"),
        "no_date_raw_linked": sum(1 for l in linked if l["raw_date_class"] == "no_date"),
        "raw_not_linked_to_any_candidate": len(unlinked_raw),
        "unlinked_raw_events": unlinked_raw,
        "linked_detail": linked,
        "kto_only_detail": kto_only,
        "no_source_detail": no_source,
    }

    atomic_write(os.path.join(RPT_DIR, "busan-event-72-source-gap-audit-v1.json"), event_gap)

    # ── Phase 4: 최신성 표본 비교 ─────────────────────────────────────────────
    freshness = {
        "analysis_date": ANALYSIS_DATE,
        "raw_collection_date": "2026-07-24",
        "freshness_source_reference": "bfo.or.kr (부산축제조직위원회 공식 홈페이지) — 2026-08-03 WebFetch",
        "samples": [
            {
                "name": "부산바다축제",
                "uc_seq": 71,
                "raw_date": "2025. 8. 1. ~ 8. 3.",
                "official_2026_date": "2026년 8월 7일(금) ~ 8월 13일(목)",
                "official_place": "다대포 해수욕장 일원",
                "verdict": "DATE_STALE",
                "detail": "raw에 2025년 날짜가 기록됨. bfo.or.kr 기준 2026년은 8월 7~13일로 날짜와 기간이 다름.",
            },
            {
                "name": "부산항축제",
                "uc_seq": 406,
                "raw_date": "(없음)",
                "official_2026_date": "2026년 6월 19~20일 (bfo.or.kr)",
                "official_place": "북항 친수공원",
                "verdict": "MISSING_DATE",
                "detail": "raw에 날짜 없음. bfo.or.kr에 6월 19~20일로 기재 (이미 2026-08-03 기준 과거).",
            },
            {
                "name": "부산국제록페스티벌",
                "uc_seq": 470,
                "raw_date": "2025. 9. 26.(금) ~ 2025. 9. 28.(일)",
                "official_2026_date": "2026년 10월 2~4일 (bfo.or.kr)",
                "official_place": "삼락생태공원",
                "verdict": "DATE_STALE",
                "detail": "raw에 2025년 날짜 기록. bfo.or.kr 기준 2026년은 10월 2~4일(미래 행사).",
            },
            {
                "name": "부산불꽃축제",
                "uc_seq": 395,
                "raw_date": "2025.11.15.(토)",
                "official_2026_date": "2026년 11월 7일 (bfo.or.kr)",
                "official_place": "광안리해수욕장",
                "verdict": "DATE_STALE",
                "detail": "raw에 2025년 날짜. bfo.or.kr 기준 2026년은 11월 7일(미래 행사).",
            },
            {
                "name": "부산인디커넥트페스티벌",
                "uc_seq": None,
                "raw_date": "N/A",
                "official_2026_date": "확인 불가 (bfo.or.kr 목록 없음)",
                "official_place": "N/A",
                "verdict": "NOT_IN_RAW",
                "detail": "부산광역시_부산축제정보 API raw에 부산인디커넥트페스티벌 없음. KTO 또는 별도 출처 필요.",
            },
            {
                "name": "금정산성축제",
                "uc_seq": 330,
                "raw_date": "2026. 10. 16. ~ 10. 18.",
                "official_2026_date": "미확인 (bfo.or.kr 별도 목록 없음)",
                "official_place": "금정산성 일원",
                "verdict": "RAW_DATE_CURRENT",
                "detail": "raw에 2026년 날짜 기재. 유일하게 2026 미래 행사 날짜가 raw에 정확히 있는 사례(KO 기준).",
            },
        ],
        "freshness_summary": {
            "stale_date_count": 3,
            "missing_date_count": 1,
            "not_in_raw_count": 1,
            "current_date_count": 1,
            "total_sampled": 6,
        },
        "conclusion": {
            "api_date_reliability": "LOW",
            "detail": "부산광역시_부산축제정보 API의 USAGE_DAY_WEEK_AND_TIME 필드는 편집자가 수동 갱신하는 구조로 보이며, 현재(2026-08-03) 기준 대다수가 2025년 날짜 그대로 방치됨. 콘텐츠(설명·이미지·장소)는 신뢰할 수 있으나 날짜는 bfo.or.kr 또는 개별 주최기관 페이지에서 별도 검증 필요.",
            "content_reliability": "HIGH — 설명·이미지·장소 정보는 안정적",
            "date_source_recommendation": "bfo.or.kr (부산축제조직위원회) 또는 개별 주최기관 사이트를 날짜 우선 원천으로 사용",
        }
    }

    atomic_write(os.path.join(RPT_DIR, "busan-festival-freshness-sample-v1.json"), freshness)

    # ── Phase 5: 원천 정체 확정 ───────────────────────────────────────────────
    source_id = {
        "verdict": "RAW_ALREADY_EXISTS",
        "verdict_detail": "기존 raw 파일이 부산광역시_부산축제정보 서비스(apis.data.go.kr/6260000/FestivalService)의 수집 결과임. 별도 부산축제정보 API raw가 없다는 이전 감사 결론은 파일명 패턴 탐색 범위 오류로 인한 오판.",
        "source_classification": {
            "type": "BUSAN_OPENAPI_FESTIVAL",
            "base_url": "https://apis.data.go.kr/6260000",
            "service_name": "부산광역시_부산축제정보 서비스",
            "content_platform": "visitbusan.net (이미지 URL 기반, 부산관광공사 운영)",
            "auth_key": "TOUR_API_KEY (동일 data.go.kr serviceKey)",
        },
        "evidence": {
            "raw_response_key": "getFestivalKr / getFestivalEn / ... (FestivalService 패턴)",
            "busan_base_in_batch_script": "line 302: const BUSAN_BASE = 'https://apis.data.go.kr/6260000'",
            "batch_state_confirms_collection": "busan-festival-ko ~ zht: status=completed, 2026-07-24T00:26:*Z",
            "image_url_pattern": "https://www.visitbusan.net/uploadImgs/files/cntnts/...",
        },
        "previous_audit_error": {
            "task": "TASK-BUSAN-OFFICIAL-SOURCE-AND-EVENT-FRESHNESS-AUDIT-V1",
            "error": "raw 파일 탐색 시 'busan-city', 'busan_openapi', 'bsm-' 패턴만 검색 → busan-festival-*.json 파일 누락",
            "correction": "실제 raw는 2026-07-24/batch/ 하위에 정상 존재",
        },
        "script_gap_finding": {
            "issue": "현재 scripts/tourapi-busan-batch.mjs SOURCES 배열에 festival 항목 없음",
            "impact": "스크립트 재실행 시 festival 데이터 재수집 안 됨",
            "recommendation": "festival 5개 언어 endpoint를 SOURCES에 재추가 필요",
        }
    }

    atomic_write(os.path.join(RPT_DIR, "busan-festival-source-identity-v1.json"), source_id)

    # ── Phase 6: 원천 우선순위 정책 ──────────────────────────────────────────
    priority = {
        "generated_at": ANALYSIS_DATE,
        "policy_version": "busan-festival-source-priority-v1",
        "event_policy": {
            "primary": {
                "source": "부산광역시_부산축제정보 서비스 (apis.data.go.kr/6260000/FestivalService)",
                "role": "행사 기본 정보 — 제목(다국어), 설명(다국어), 이미지, 장소, 문의처",
                "reliability": "HIGH (콘텐츠), LOW (날짜 — 수동 갱신 지연)",
            },
            "secondary": {
                "source": "KTO KorService2 (apis.data.go.kr/B551011/KorService2, contentTypeId=15)",
                "role": "FestivalService에 없는 행사 보강 (31건 KTO only event candidates 존재)",
                "reliability": "MEDIUM (KTO 날짜도 갱신 지연 가능)",
            },
            "date_freshness_source": {
                "source": "bfo.or.kr (부산축제조직위원회) 또는 개별 주최기관 공식 사이트",
                "role": "FestivalService API 날짜의 최신성 검증용 외부 참조",
                "collection_method": "WebFetch 또는 사용자 수동 확인",
                "trigger": "FestivalService raw 날짜가 전년도이거나 없을 때",
            },
            "conflict_rule": "날짜 충돌 시 bfo.or.kr 날짜 우선. 콘텐츠(설명·이미지) 충돌 시 FestivalService 우선(다국어 완성도).",
            "stale_date_handling": "원본 raw 보존, candidate에 date_verified=false 플래그. 배포 시 '날짜 미확인' 상태로 표시하거나 미래 행사만 노출.",
            "past_event_handling": "삭제 금지, 보존. 현재 추천에서 제외 기준: raw 날짜가 분석일 기준 1년 이상 과거 AND 갱신 근거 없음.",
            "nightly_update_rule": "부산 완료 후 다음 도시 전에 festival raw 재수집 주기 설정 권고 (최소 월 1회).",
        },
        "attraction_policy": {
            "primary": "부산광역시_부산명소정보 서비스 (apis.data.go.kr/6260000/AttractionService) — 다국어 KO/EN/JA/ZhS/ZhT",
            "secondary": "KTO KorService2 (설명·이미지 보강)",
            "conflict_rule": "AttractionService 우선. KTO는 AttractionService에 없는 보강 필드만 사용.",
        },
        "food_policy": {
            "primary": "부산광역시_부산맛집정보 서비스 (apis.data.go.kr/6260000/FoodService) — 다국어",
            "secondary": "KTO KorService2 (contentTypeId=39) — 보강",
            "branch_rule": "주소·좌표·전화번호 모두 동일 → 동일 지점. 하나라도 다르면 별도 지점으로 취급.",
            "stale_data_rule": "폐업·이전 의심 시 전화번호 변경 여부 확인 후 candidate 상태 업데이트.",
        },
        "image_policy": {
            "primary": "visitbusan.net/uploadImgs (AttractionService/FoodService/FestivalService MAIN_IMG_NORMAL)",
            "secondary": "KTO PhotoGalleryService1",
            "rights_verification": "공공데이터 개방 원칙에 따라 상업적 이용 가능 여부 data.go.kr 라이선스 확인 권고",
            "missing_image_policy": "MAIN_IMG_NORMAL 없으면 KTO PhotoGallery 매칭 시도. 없으면 no_image 유지.",
        },
    }

    atomic_write(os.path.join(RPT_DIR, "busan-festival-source-priority-decision-v1.json"), priority)

    print("\nAll output files written successfully.")


if __name__ == "__main__":
    run()
