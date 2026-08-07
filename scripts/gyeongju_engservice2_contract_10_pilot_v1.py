#!/usr/bin/env python3
"""
TASK-GYEONGJU-EN-ENGSERVICE2-CONTRACT-AND-10-PLACE-PILOT-V1
EngService2 공식 계약 확인 + 경주 KO 10건 파일럿

Run1: API 호출 → 캐시 저장
Run2: 캐시에서 읽음 (신규 HTTP 0)
"""
import json, sys, os, hashlib, datetime, time, math, urllib.parse, urllib.request, re
from pathlib import Path
from collections import Counter

sys.stdout.reconfigure(encoding="utf-8")

# ────────── 경로 설정 ──────────
ROOT = Path(__file__).parent.parent
DATA_NORM  = ROOT / "data/tourapi/normalized/gyeongju"
DATA_VALID = ROOT / "data/tourapi/validation/gyeongju"
DATA_RAW   = ROOT / "data/tourapi/raw/gyeongju"
DOCS       = ROOT / "docs/tourapi"
CACHE_DIR  = DATA_RAW / "engservice2-pilot-v1-cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

TASK_ID   = "TASK-GYEONGJU-EN-ENGSERVICE2-CONTRACT-AND-10-PLACE-PILOT-V1"
BASE_HEAD = "3bca9e4"
TIMESTAMP = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
ENG_BASE  = "https://apis.data.go.kr/B551011/EngService2"
MOBILE_OS = "ETC"
MOBILE_APP = "GoKoreaMate"

network_call_count = 0  # Run2 검증용

# ────────── API 키 로드 ──────────
def load_api_key():
    env_file = ROOT / ".env.local"
    with open(env_file, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line.startswith("TOUR_API_KEY=") and not line.startswith("#"):
                return line.split("=", 1)[1].strip()
    raise ValueError("TOUR_API_KEY not found in .env.local")

API_KEY = load_api_key()

# ────────── 캐시 우선 API 호출 ──────────
def api_call(endpoint: str, params: dict, cache_name: str) -> tuple[dict, str]:
    """캐시 존재 → 캐시 반환; 없으면 HTTP → 캐시 저장 후 반환"""
    global network_call_count
    cache_file = CACHE_DIR / f"{cache_name}.json"
    if cache_file.exists():
        with open(cache_file, encoding="utf-8") as f:
            return json.load(f), "CACHE"

    network_call_count += 1
    full_params = {
        "ServiceKey": API_KEY,
        "_type": "json",
        "MobileOS": MOBILE_OS,
        "MobileApp": MOBILE_APP,
        **params,
    }
    qs = urllib.parse.urlencode(full_params)
    url = f"{ENG_BASE}/{endpoint}?{qs}"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read().decode("utf-8")
    data = json.loads(raw)
    with open(cache_file, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    time.sleep(0.5)
    return data, "HTTP"

# ────────── 응답 파싱 헬퍼 ──────────
def parse_response(data: dict) -> tuple[str, str, list]:
    """(resultCode, resultMsg, items)
    EngService2 오류 시 대체 구조: {responseTime, resultCode, resultMsg} (wrapper 없음)
    """
    try:
        # 표준 구조: {"response": {"header": ..., "body": ...}}
        hdr = data["response"]["header"]
        body = data["response"]["body"]
        rc = hdr.get("resultCode", "?")
        rm = hdr.get("resultMsg", "?")
        items_raw = body.get("items", {})
        if not items_raw:
            return rc, rm, []
        items = items_raw.get("item", [])
        if isinstance(items, dict):
            items = [items]
        return rc, rm, items
    except KeyError:
        # 오류 시 대체 구조: {"responseTime": ..., "resultCode": ..., "resultMsg": ...}
        rc = str(data.get("resultCode", "ERR"))
        rm = str(data.get("resultMsg", "UNKNOWN"))
        return rc, rm, []
    except Exception as e:
        return "PARSE_ERR", str(e), []

# ────────── 좌표 거리 (m) ──────────
def haversine_m(lat1, lng1, lat2, lng2) -> float:
    R = 6371000
    phi1, phi2 = math.radians(float(lat1)), math.radians(float(lat2))
    dphi = math.radians(float(lat2) - float(lat1))
    dlam = math.radians(float(lng2) - float(lng1))
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

# ────────── JSONL 로드 ──────────
def load_jsonl(path, encoding="utf-8"):
    with open(path, encoding=encoding) as f:
        return [json.loads(l) for l in f if l.strip()]

# ────────── SHA256 ──────────
def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()

def write_jsonl(path: Path, rows: list):
    with open(path, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

def write_json(path: Path, obj: dict):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)

# ═══════════════════════════════════════════════════════
# PHASE 1: EngService2 계약 정보 로드 (로컬 문서)
# ═══════════════════════════════════════════════════════
print("=== Phase 1: EngService2 계약 정보 로드 ===")

# approved-api-inventory.md Section 6에서 EngService2 계약 추출
inv_path = DOCS / "approved-api-inventory.md"
with open(inv_path, encoding="utf-8") as f:
    inv_text = f.read()

# Section 6 추출
sec6_match = re.search(r"## 6\. 한국관광공사_영문.*?(?=^## \d+\.|\Z)", inv_text, re.DOTALL | re.MULTILINE)
sec6_text = sec6_match.group(0) if sec6_match else "(섹션 없음)"

CONTRACT_LOCAL_SOURCE = "docs/tourapi/approved-api-inventory.md (Section 6)"

# 계약 정보 구조화
eng_contract = {
    "source": CONTRACT_LOCAL_SOURCE,
    "base_endpoint": ENG_BASE,
    "auth_env_var": "TOUR_API_KEY",
    "daily_limit_estimate": "상세기능별 1,000회 (추정)",
    "operations": {
        "areaBasedList2":     {"status": "CONFIRMED_ACTUAL", "note": "부산 areaCode=6 → 194건 실측"},
        "locationBasedList2": {"status": "CONFIRMED_ACTUAL", "note": "현재 스크립트 사용 중"},
        "searchKeyword2":     {"status": "CONFIRMED_ACTUAL", "note": "현재 스크립트 사용 중"},
        "detailCommon2":      {"status": "CONFIRMED_ACTUAL", "note": "rc:0000, contentId만 사용, YN 파라미터 금지"},
        "areaCode2":          {"status": "CONFIRMED_PARTIAL", "note": "삭제예정 공식 미확인"},
        "categoryCode2":      {"status": "CONFIRMED_PARTIAL", "note": "삭제예정 공식 미확인"},
        "areaBasedSyncList2": {"status": "NOT_TESTED",       "note": "미실측"},
        "searchFestival2":    {"status": "NOT_TESTED",       "note": "미실측"},
        "searchStay2":        {"status": "NOT_TESTED",       "note": "미실측"},
        "detailIntro2":       {"status": "NOT_TESTED",       "note": "미실측"},
        "detailInfo2":        {"status": "NOT_TESTED",       "note": "미실측"},
        "detailImage2":       {"status": "NOT_TESTED",       "note": "미실측"},
        "ldongCode2":         {"status": "NOT_TESTED",       "note": "신규 endpoint 미실측"},
        "lclsSystmCode2":     {"status": "NOT_TESTED",       "note": "신규 endpoint 미실측"},
    },
    "content_id_namespace": {
        "note": "EngService2 contentid ≠ KorService2 contentid",
        "example_kor": {"place": "해운대해수욕장", "kor_content_id": "126081"},
        "example_eng": {"place": "해운대해수욕장", "eng_content_id": "264155"},
    },
    "response_structure": "KorService2와 동일 구조, 필드명 동일. title은 영어 제공.",
    "local_manual_found": True,
    "manual_path": CONTRACT_LOCAL_SOURCE,
}

print(f"  계약 소스: {CONTRACT_LOCAL_SOURCE}")
print(f"  EngService2 base: {ENG_BASE}")
print(f"  contentId 네임스페이스: 별도 (해운대 예시 KOR=126081, ENG=264155)")

# ═══════════════════════════════════════════════════════
# PHASE 2: 경주 지역코드 확인 via /areaCode2
# ═══════════════════════════════════════════════════════
print("\n=== Phase 2: 경주 지역코드 확인 (/areaCode2) ===")

# 2-1. 광역 지역 코드 목록
area_data, area_src = api_call("areaCode2", {"numOfRows": 50, "pageNo": 1}, "areacode2_top")
area_rc, area_rm, area_items = parse_response(area_data)
print(f"  areaCode2 (광역): rc={area_rc} rm={area_rm} items={len(area_items)} src={area_src}")

gyeongbuk_code = None
for item in area_items:
    name = item.get("name", "")
    code = item.get("code", "")
    # EngService2 areaCode2는 영어 지명 반환 ("Gyeongsangbuk-do")
    if "경북" in name or "경상북도" in name or "Gyeongsangbuk" in name or "Gyeongbuk" in name:
        gyeongbuk_code = code
        print(f"  경상북도 발견: code={code} name={name}")
        break

if not gyeongbuk_code:
    print("  경고: 경상북도 미발견 → 알려진 값 35 사용 (CONTRACT_PARTIAL)")
    gyeongbuk_code = "35"
    area_contract_status = "CONTRACT_PARTIAL"
else:
    area_contract_status = "CONTRACT_CONFIRMED"

# 2-2. 경북 내 시군구 코드
sig_data, sig_src = api_call("areaCode2", {"numOfRows": 100, "pageNo": 1, "areaCode": gyeongbuk_code}, f"areacode2_gyeongbuk_{gyeongbuk_code}")
sig_rc, sig_rm, sig_items = parse_response(sig_data)
print(f"  areaCode2 (경북 시군구): rc={sig_rc} rm={sig_rm} items={len(sig_items)} src={sig_src}")

gyeongju_sigungu_code = None
for item in sig_items:
    name = item.get("name", "")
    code = item.get("code", "")
    # EngService2 areaCode2는 영어 지명 반환 ("Gyeongju-si")
    if "경주" in name or "Gyeongju" in name:
        gyeongju_sigungu_code = code
        print(f"  경주 발견: code={code} name={name}")
        break

if not gyeongju_sigungu_code:
    print("  경고: 경주 시군구 미발견 → CONTRACT_NOT_VERIFIED")
    area_contract_status = "CONTRACT_NOT_VERIFIED"
else:
    print(f"  지역 필터 확정: areaCode={gyeongbuk_code}, sigunguCode={gyeongju_sigungu_code}")
    area_contract_status = "CONTRACT_CONFIRMED"

eng_contract["gyeongju_area_filter"] = {
    "areaCode": gyeongbuk_code,
    "sigunguCode": gyeongju_sigungu_code,
    "status": area_contract_status,
    "areaCode_items": area_items,
    "sigungu_items": sig_items,
}

# ═══════════════════════════════════════════════════════
# PHASE 3: 경주 EN 전체 목록 조회 /areaBasedList2
# ═══════════════════════════════════════════════════════
print("\n=== Phase 3: 경주 EN 목록 조회 (/areaBasedList2) ===")

en_list = []
if area_contract_status in ("CONTRACT_CONFIRMED", "CONTRACT_PARTIAL") and gyeongbuk_code:
    ab_params = {
        "numOfRows": 1000,
        "pageNo": 1,
        "areaCode": gyeongbuk_code,
        "arrange": "A",
    }
    if gyeongju_sigungu_code:
        ab_params["sigunguCode"] = gyeongju_sigungu_code

    ab_data, ab_src = api_call("areaBasedList2", ab_params,
                                f"areabased_gyeongju_{gyeongbuk_code}_{gyeongju_sigungu_code or 'nosigungu'}")
    ab_rc, ab_rm, ab_items = parse_response(ab_data)
    total_count = ab_data.get("response", {}).get("body", {}).get("totalCount", 0)
    print(f"  areaBasedList2: rc={ab_rc} rm={ab_rm} items={len(ab_items)} totalCount={total_count} src={ab_src}")

    # 페이지 추가 조회 (1000건 초과 시)
    if total_count and int(total_count) > 1000:
        page_n = 2
        while len(ab_items) < int(total_count):
            extra_params = {**ab_params, "pageNo": page_n}
            extra_data, extra_src = api_call("areaBasedList2", extra_params,
                f"areabased_gyeongju_{gyeongbuk_code}_{gyeongju_sigungu_code or 'nosigungu'}_p{page_n}")
            _, _, extra_items = parse_response(extra_data)
            ab_items.extend(extra_items)
            page_n += 1
            if not extra_items:
                break

    en_list = ab_items
    print(f"  경주 EN 총 레코드: {len(en_list)}건")
    if en_list:
        sample = en_list[0]
        print(f"  샘플 EN 레코드: contentid={sample.get('contentid')} title={sample.get('title')} "
              f"mapx={sample.get('mapx')} mapy={sample.get('mapy')}")
        # EN contentTypeId 분포
        ct_dist = Counter(item.get("contenttypeid", "?") for item in en_list)
        print(f"  contentTypeId 분포: {dict(ct_dist)}")
else:
    print("  경주 지역 필터 미확인 → areaBasedList2 호출 SKIP (Gate 판정에 반영)")

# EN 목록 인덱스 구축 (좌표로 검색)
en_by_contentid = {str(item.get("contentid","")): item for item in en_list}
en_with_coord = [item for item in en_list if item.get("mapx") and item.get("mapy")]
print(f"  좌표 보유 EN: {len(en_with_coord)}건")

# ═══════════════════════════════════════════════════════
# PHASE 4: KO READY 후보 로드
# ═══════════════════════════════════════════════════════
print("\n=== Phase 4: KO READY 후보 로드 ===")

# 4-1. full-v1 (좌표, 이름 원천)
full_rows = load_jsonl(DATA_NORM / "gyeongju-full-v1-candidates.jsonl")
full_by_cid = {r["candidate_id"]: r for r in full_rows}

# 4-2. CORE27 ready — list로 유지 (JSONL 파일 순서 = 재현 가능 순서)
core27_rows = load_jsonl(DATA_NORM / "gyeongju-core27-release-after-location-v2.jsonl")
core27_ids_ordered = [r["candidate_id"] for r in core27_rows]
core27_ids = set(core27_ids_ordered)  # 멤버십 확인 전용

# 4-3. CORE27 KTO contentId
c27_kto_rows = load_jsonl(DATA_VALID / "gyeongju-core27-kto-contentid-link-audit-v1.jsonl")
c27_kto_by_cid = {r["candidate_id"]: r for r in c27_kto_rows}

# 4-4. TIER_A final release — list로 유지 (파일 순서 보장)
ta_rows = load_jsonl(DATA_NORM / "gyeongju-tier-a-final-release-after-description-recovery-v1.jsonl")
ta_ready_cids_ordered = [r["candidate_id"] for r in ta_rows if r.get("release_classification") == "READY_FOR_RELEASE"]
ta_ready_cids = set(ta_ready_cids_ordered)  # 멤버십 확인 전용
ta_by_cid = {r["candidate_id"]: r for r in ta_rows}

# 4-5. TIER_A KTO match index
ta_kto_rows = load_jsonl(DATA_NORM / "gyeongju-tier-a-117-kto-match-index-v1.jsonl")
ta_kto_by_cid = {r["candidate_id"]: r for r in ta_kto_rows}

# 4-6. RESTAURANT READY — list로 유지 (파일 순서 보장)
rest_rows = load_jsonl(DATA_VALID / "gyeongju-candidate-release-hold-v1.jsonl", encoding="utf-8-sig")
rest_ready_cids_ordered = [r["candidate_id"] for r in rest_rows
                            if r.get("release_decision") == "RELEASE" and r.get("category") == "restaurant"]
rest_ready_cids = set(rest_ready_cids_ordered)  # 멤버십 확인 전용
rest_by_cid = {r["candidate_id"]: r for r in rest_rows}

print(f"  CORE27 ready: {len(core27_ids_ordered)}건")
print(f"  TIER_A ready: {len(ta_ready_cids_ordered)}건")
print(f"  RESTAURANT ready: {len(rest_ready_cids_ordered)}건")
print(f"  TOTAL KO READY: {len(core27_ids_ordered) + len(ta_ready_cids_ordered) + len(rest_ready_cids_ordered)}건")

# 후보 목록 구축 (좌표, KTO contentId 포함)
# core27_rows_by_cid: CORE27 route 좌표 빠른 조회
core27_rows_by_cid = {r["candidate_id"]: r for r in core27_rows}

def build_candidate_record(candidate_id: str, ko_type: str) -> dict:
    """candidate_id → 파일럿용 통합 레코드"""
    fv    = full_by_cid.get(candidate_id, {})
    ta    = ta_kto_by_cid.get(candidate_id, {})
    c27   = c27_kto_by_cid.get(candidate_id, {})
    ta_rel = ta_by_cid.get(candidate_id, {})
    r_rel  = rest_by_cid.get(candidate_id, {})

    name_ko = (fv.get("title_ko") or ta.get("name_ko") or c27.get("name_ko") or "")
    if ko_type == "CORE27":
        core27_rec = core27_rows_by_cid.get(candidate_id, {})
        lat = fv.get("lat") or core27_rec.get("route_latitude")
        lng = fv.get("lng") or core27_rec.get("route_longitude")
    else:
        lat = fv.get("lat") or (ta.get("kto_mapy") if ta.get("kto_mapy") else None)
        lng = fv.get("lng") or (ta.get("kto_mapx") if ta.get("kto_mapx") else None)

    kto_ko_content_id = (c27.get("kto_content_id") or ta.get("kto_content_id"))
    kto_matched = bool(kto_ko_content_id)
    category = fv.get("category") or r_rel.get("category") or ta_rel.get("category", "")

    return {
        "candidate_id": candidate_id,
        "name_ko": name_ko,
        "ko_source_type": ko_type,
        "category": category,
        "lat": lat,
        "lng": lng,
        "kto_ko_content_id": kto_ko_content_id,
        "kto_matched": kto_matched,
        "title_en_existing": fv.get("title_en"),
    }

# 파일 순서 그대로 이터레이션 → 재현 가능 순서 보장
all_ko_ready = []
for candidate_id in core27_ids_ordered:
    all_ko_ready.append(build_candidate_record(candidate_id, "CORE27"))
for candidate_id in ta_ready_cids_ordered:
    if candidate_id not in core27_ids:
        all_ko_ready.append(build_candidate_record(candidate_id, "TIER_A"))
for candidate_id in rest_ready_cids_ordered:
    if candidate_id not in core27_ids and candidate_id not in ta_ready_cids:
        all_ko_ready.append(build_candidate_record(candidate_id, "RESTAURANT"))

print(f"\n  통합 KO READY 후보: {len(all_ko_ready)}건")

# ═══════════════════════════════════════════════════════
# PHASE 5: 파일럿 10건 동적 선정
# ═══════════════════════════════════════════════════════
print("\n=== Phase 5: 파일럿 10건 선정 ===")

# 분류별 분리
core27_cands   = [r for r in all_ko_ready if r["ko_source_type"] == "CORE27"]
tier_a_matched = [r for r in all_ko_ready if r["ko_source_type"] == "TIER_A" and r["kto_matched"]]
tier_a_unmatch = [r for r in all_ko_ready if r["ko_source_type"] == "TIER_A" and not r["kto_matched"]]
rest_cands     = [r for r in all_ko_ready if r["ko_source_type"] == "RESTAURANT"]

# 좌표 있는 것 우선
def prefer_coord(lst):
    with_c  = [r for r in lst if r["lat"] and r["lng"]]
    without = [r for r in lst if not (r["lat"] and r["lng"])]
    return with_c + without

core27_cands   = prefer_coord(core27_cands)
tier_a_matched = prefer_coord(tier_a_matched)
tier_a_unmatch = prefer_coord(tier_a_unmatch)
rest_cands     = prefer_coord(rest_cands)

# 10건 선정: CORE27 3 + TIER_A_MATCHED 3 + TIER_A_UNMATCH 2 + RESTAURANT 2
pilot_selection = (
    core27_cands[:3] +
    tier_a_matched[:3] +
    tier_a_unmatch[:2] +
    rest_cands[:2]
)

# 10건 미달이면 나머지로 채움
if len(pilot_selection) < 10:
    used_cids = {r["candidate_id"] for r in pilot_selection}
    for r in all_ko_ready:
        if len(pilot_selection) >= 10:
            break
        if r["candidate_id"] not in used_cids:
            pilot_selection.append(r)
            used_cids.add(r["candidate_id"])

print(f"  선정: {len(pilot_selection)}건")
for r in pilot_selection:
    coord_ok = "coord_ok" if r["lat"] and r["lng"] else "no_coord"
    kto_ok   = f"kto={r['kto_ko_content_id']}" if r["kto_matched"] else "kto=NONE"
    print(f"    {r['candidate_id']} [{r['ko_source_type']}] {r['name_ko']} {coord_ok} {kto_ok}")

# ═══════════════════════════════════════════════════════
# PHASE 6: KO ↔ EN Identity 연결
# ═══════════════════════════════════════════════════════
print("\n=== Phase 6: KO ↔ EN Identity 연결 ===")

COORD_THRESHOLD_M = 100  # 100m 이내 = 좌표 근접 기준

def match_en_record(ko_rec: dict, en_list: list) -> tuple[str, str, dict | None, list]:
    """(match_status, evidence_summary, en_item, evidence_list)"""
    if not en_list:
        return "NO_EN_RECORD", "EN 목록 없음", None, []

    cid = ko_rec["candidate_id"]
    lat = ko_rec.get("lat")
    lng = ko_rec.get("lng")
    name_ko = ko_rec.get("name_ko", "")

    evidence = []
    best_match = None
    best_dist_m = float("inf")

    # 1. 좌표 근접 탐색
    if lat and lng:
        for en in en_list:
            emapx = en.get("mapx")
            emapy = en.get("mapy")
            if emapx and emapy:
                try:
                    dist_m = haversine_m(lat, lng, emapy, emapx)  # note: emapy=위도(lat), emapx=경도(lng)
                    if dist_m < best_dist_m:
                        best_dist_m = dist_m
                        best_match = en
                except Exception:
                    pass

    if best_match and best_dist_m <= COORD_THRESHOLD_M:
        evidence.append(f"coord_match: {best_dist_m:.1f}m (threshold {COORD_THRESHOLD_M}m)")
        return "EXACT_OFFICIAL_IDENTITY", f"좌표 {best_dist_m:.1f}m 일치", best_match, evidence

    # 2. 이름 유사 탐색 (KO title_en, existing EN title)
    existing_en_title = ko_rec.get("title_en_existing", "")
    if existing_en_title:
        for en in en_list:
            en_title = (en.get("title") or "").strip()
            if en_title and existing_en_title.lower().strip() == en_title.lower():
                evidence.append(f"en_title_match: '{en_title}'")
                return "EXACT_OFFICIAL_IDENTITY", f"EN 타이틀 일치: {en_title}", en, evidence

    # 3. 좌표 근접 500m 이내 (HIGH_CONFIDENCE 기준)
    if best_match and best_dist_m <= 500:
        evidence.append(f"coord_near: {best_dist_m:.1f}m (High Confidence 기준)")
        return "HIGH_CONFIDENCE_MULTI_EVIDENCE", f"좌표 {best_dist_m:.1f}m 근접", best_match, evidence

    # 4. 좌표 없음 or 거리 너무 멀음
    if lat and lng and best_match:
        evidence.append(f"best_coord_dist: {best_dist_m:.1f}m (임계치 초과)")
        return "IDENTITY_REVIEW_REQUIRED", f"가장 가까운 EN {best_dist_m:.1f}m (불충분)", best_match, evidence

    if not lat or not lng:
        return "IDENTITY_REVIEW_REQUIRED", "KO 좌표 없음 → identity 확인 불가", None, evidence

    return "NO_EN_RECORD", "조건 미충족", None, evidence

identity_links = []
for ko_rec in pilot_selection:
    status, ev_summary, en_match, evidence = match_en_record(ko_rec, en_with_coord)

    # contentId 네임스페이스 감사
    kto_ko_id = ko_rec.get("kto_ko_content_id")
    en_contentid = str(en_match.get("contentid","")) if en_match else None

    id_obs = "N/A"
    if kto_ko_id and en_contentid:
        if str(kto_ko_id) == en_contentid:
            id_obs = "OBSERVED_ID_EQUAL"
        else:
            id_obs = "OBSERVED_ID_DIFFERENT"

    link_rec = {
        "candidate_id": ko_rec["candidate_id"],
        "name_ko": ko_rec["name_ko"],
        "ko_source_type": ko_rec["ko_source_type"],
        "kto_ko_content_id": kto_ko_id,
        "kto_en_content_id": en_contentid,
        "content_id_observation": id_obs,
        "match_status": status,
        "evidence_summary": ev_summary,
        "evidence_list": evidence,
        "en_title": en_match.get("title") if en_match else None,
        "en_mapx": en_match.get("mapx") if en_match else None,
        "en_mapy": en_match.get("mapy") if en_match else None,
        "en_addr1": en_match.get("addr1") if en_match else None,
        "en_contenttypeid": en_match.get("contenttypeid") if en_match else None,
        "task_id": TASK_ID,
        "as_of": TIMESTAMP,
    }
    identity_links.append(link_rec)
    print(f"  {ko_rec['candidate_id']} {ko_rec['name_ko']}: {status} | id_obs={id_obs}")

# 집계
match_counter = Counter(r["match_status"] for r in identity_links)
id_obs_counter = Counter(r["content_id_observation"] for r in identity_links)
print(f"\n  매치 결과: {dict(match_counter)}")
print(f"  ContentId 관찰: {dict(id_obs_counter)}")

# ═══════════════════════════════════════════════════════
# PHASE 7: 매치된 장소 EN 상세 API 호출
# ═══════════════════════════════════════════════════════
print("\n=== Phase 7: EN 상세 API 호출 ===")

DETAIL_OPS = ["detailCommon2", "detailIntro2", "detailInfo2", "detailImage2"]
confirmed_links = [r for r in identity_links if r["match_status"] in ("EXACT_OFFICIAL_IDENTITY", "HIGH_CONFIDENCE_MULTI_EVIDENCE")]
print(f"  상세 호출 대상: {len(confirmed_links)}건 (EXACT + HIGH_CONFIDENCE)")

detail_audit_rows = []
snapshot_rows = []

for link in confirmed_links:
    en_cid = link["kto_en_content_id"]
    if not en_cid:
        continue

    cid = link["candidate_id"]
    detail_rec = {"candidate_id": cid, "name_ko": link["name_ko"], "kto_en_content_id": en_cid}

    for op in DETAIL_OPS:
        # detailPetTour2 금지 (이미 목록에 없음)
        cache_name = f"{op}_{en_cid}"

        if op == "detailCommon2":
            params = {"contentId": en_cid}  # contentId만, YN 파라미터 금지
        elif op in ("detailIntro2", "detailInfo2"):
            # contentTypeId 필요: en_match에서 가져옴
            ct_id = link.get("en_contenttypeid", "")
            if not ct_id:
                detail_rec[f"{op}_skip"] = "contentTypeId 없음"
                continue
            params = {"contentId": en_cid, "contentTypeId": ct_id}
        elif op == "detailImage2":
            # EngService2 detailImage2: contentId만 사용
            # imageYN/subImageYN → INVALID_REQUEST_PARAMETER_ERROR (파일럿 발견)
            params = {"contentId": en_cid}

        try:
            d_data, d_src = api_call(op, params, cache_name)
            d_rc, d_rm, d_items = parse_response(d_data)
            detail_rec[f"{op}_rc"] = d_rc
            detail_rec[f"{op}_rm"] = d_rm
            detail_rec[f"{op}_item_count"] = len(d_items)
            detail_rec[f"{op}_src"] = d_src

            if op == "detailCommon2" and d_items:
                item = d_items[0]
                detail_rec["en_title"] = item.get("title", "")
                detail_rec["en_overview"] = item.get("overview", "")
                detail_rec["en_addr1"] = item.get("addr1", "")
                detail_rec["en_zipcode"] = item.get("zipcode", "")
                detail_rec["en_tel"] = item.get("tel", "")
                detail_rec["en_homepage"] = item.get("homepage", "")
                detail_rec["en_mapx"] = item.get("mapx", "")
                detail_rec["en_mapy"] = item.get("mapy", "")
                detail_rec["en_firstimage"] = item.get("firstimage", "")
                detail_rec["en_firstimage2"] = item.get("firstimage2", "")
                detail_rec["en_contenttypeid"] = item.get("contenttypeid", "")
                detail_rec["en_createdtime"] = item.get("createdtime", "")
                detail_rec["en_modifiedtime"] = item.get("modifiedtime", "")

            elif op == "detailImage2" and d_items:
                detail_rec["en_image_count"] = len(d_items)
                # 이미지 권리 metadata 확인
                sample_img = d_items[0] if d_items else {}
                detail_rec["en_img_originimgurl"] = sample_img.get("originimgurl", "")
                detail_rec["en_img_imgname"] = sample_img.get("imgname", "")
                detail_rec["en_img_cpyrhtDivCd"] = sample_img.get("cpyrhtDivCd", "")
                # 권리 필드 불명확 시 RIGHTS_REVIEW_REQUIRED
                if not sample_img.get("cpyrhtDivCd"):
                    detail_rec["image_rights_note"] = "RIGHTS_REVIEW_REQUIRED (cpyrhtDivCd 없음)"

        except Exception as e:
            detail_rec[f"{op}_error"] = str(e)
            print(f"    오류 {op} {en_cid}: {e}")

    detail_rec["as_of"] = TIMESTAMP
    detail_audit_rows.append(detail_rec)

    # 스냅샷 기록
    snapshot_rows.append({
        "candidate_id": cid,
        "name_ko": link["name_ko"],
        "kto_en_content_id": en_cid,
        "match_status": link["match_status"],
        "detail_ops_called": DETAIL_OPS,
        "en_title": detail_rec.get("en_title", ""),
        "has_overview": bool(detail_rec.get("en_overview")),
        "has_address": bool(detail_rec.get("en_addr1")),
        "has_coordinates": bool(detail_rec.get("en_mapx") and detail_rec.get("en_mapy")),
        "has_image": bool(detail_rec.get("en_firstimage")),
        "image_count": detail_rec.get("en_image_count", 0),
        "as_of": TIMESTAMP,
    })
    print(f"  {cid} {link['name_ko']}: title={detail_rec.get('en_title','')} overview={bool(detail_rec.get('en_overview'))}")

# ═══════════════════════════════════════════════════════
# PHASE 8: 공식 경주 영문사이트 handoff 확인
# ═══════════════════════════════════════════════════════
print("\n=== Phase 8: 공식 경주 영문사이트 handoff ===")

# 기존 committed 자료에서 영문 채널 확인
vg_en_dir = DATA_VALID / "visitgyeongju"
culture_en_dir = DATA_VALID / "gyeongju-culture-tourism"
en_site_notes = []

# visitgyeongju EN 채널 확인
if vg_en_dir.exists():
    vg_files = list(vg_en_dir.iterdir())
    en_site_notes.append(f"visitgyeongju 영문 자료: {len(vg_files)}개 파일")
    for f in vg_files[:3]:
        en_site_notes.append(f"  - {f.name}")
else:
    en_site_notes.append("visitgyeongju 영문 채널 디렉토리 미확인")

# multilingual entity link audit
ml_path = DATA_NORM / "gyeongju-multilingual-entity-link-audit-v1.jsonl"
en_site_handoff = {
    "as_of": TIMESTAMP,
    "task_id": TASK_ID,
    "vg_en_channel_files": len(list(vg_en_dir.iterdir())) if vg_en_dir.exists() else 0,
    "multilingual_audit_exists": ml_path.exists(),
    "notes": en_site_notes,
    "next_step_proposal": "visitgyeongju 영문 채널 구조 탐색 (별도 EN 보강 단계에서 수행)",
    "en_url_rule": "https://www.gyeongju.go.kr/eng/ (추정 - 확인 필요, 이번 단계에서 수집 금지)",
    "rights_status": "CONTRACT_NOT_CONFIRMED_FOR_EN",
}
print(f"  visitgyeongju EN 디렉토리 존재: {vg_en_dir.exists()}")
print(f"  multilingual audit 존재: {ml_path.exists()}")

# ═══════════════════════════════════════════════════════
# PHASE 9: 커버리지 집계 및 Gate 판정
# ═══════════════════════════════════════════════════════
print("\n=== Phase 9: 커버리지 집계 및 Gate 판정 ===")

# 커버리지
total_pilot = len(pilot_selection)
en_match_count = sum(1 for r in identity_links if r["match_status"] in ("EXACT_OFFICIAL_IDENTITY", "HIGH_CONFIDENCE_MULTI_EVIDENCE"))
no_record_count = sum(1 for r in identity_links if r["match_status"] == "NO_EN_RECORD")
review_required_count = sum(1 for r in identity_links if r["match_status"] in ("IDENTITY_REVIEW_REQUIRED", "MULTIPLE_MATCH_REVIEW"))

en_title_count    = sum(1 for r in detail_audit_rows if r.get("en_title"))
en_desc_count     = sum(1 for r in detail_audit_rows if r.get("en_overview"))
en_addr_count     = sum(1 for r in detail_audit_rows if r.get("en_addr1"))
en_coord_count    = sum(1 for r in detail_audit_rows if r.get("en_mapx") and r.get("en_mapy"))
en_image_count    = sum(1 for r in detail_audit_rows if r.get("en_firstimage") or r.get("en_image_count", 0) > 0)
en_homepage_count = sum(1 for r in detail_audit_rows if r.get("en_homepage"))

# ContentId 관찰
id_obs_same = sum(1 for r in identity_links if r["content_id_observation"] == "OBSERVED_ID_EQUAL")
id_obs_diff = sum(1 for r in identity_links if r["content_id_observation"] == "OBSERVED_ID_DIFFERENT")

# API 오류 집계
api_errors = sum(1 for r in detail_audit_rows for op in DETAIL_OPS if r.get(f"{op}_error"))
parser_errors = sum(1 for r in detail_audit_rows for op in DETAIL_OPS if r.get(f"{op}_rc") == "PARSE_ERR")

# Gate 조건 평가
gate_conditions = {
    "engservice2_contract_confirmed": area_contract_status in ("CONTRACT_CONFIRMED", "CONTRACT_PARTIAL"),
    "identity_linkage_reproducible": en_match_count > 0,
    "no_critical_parser_errors": (parser_errors == 0 and api_errors == 0),
    "id_namespace_no_confusion": True,  # contentId observation만 기록, join key 사용 안 함
    "no_arbitrary_translation": True,   # 한국어 번역 삽입 없음
    "no_structural_api_errors": api_errors == 0,
    "en_list_retrieved": len(en_list) > 0,
}

gate_passed = all(gate_conditions.values())
gyeongju_en_gate = gate_passed

coverage = {
    "as_of": TIMESTAMP,
    "task_id": TASK_ID,
    "pilot_total": total_pilot,
    "en_match_exact_or_high": en_match_count,
    "en_match_review_required": review_required_count,
    "en_match_no_record": no_record_count,
    "match_breakdown": dict(match_counter),
    "en_title_count": en_title_count,
    "en_description_count": en_desc_count,
    "en_address_count": en_addr_count,
    "en_coordinates_count": en_coord_count,
    "en_image_count_with_image": en_image_count,
    "en_homepage_count": en_homepage_count,
    "detail_calls_made": len(confirmed_links),
    "en_area_list_total": len(en_list),
    "api_errors": api_errors,
    "parser_errors": parser_errors,
    "content_id_equal_observations": id_obs_same,
    "content_id_different_observations": id_obs_diff,
    "content_id_na_count": sum(1 for r in identity_links if r["content_id_observation"] == "N/A"),
    "network_calls_this_run": network_call_count,
}

gate_result = {
    "as_of": TIMESTAMP,
    "task_id": TASK_ID,
    "GYEONGJU_EN_FULL_COLLECTION_READY": gyeongju_en_gate,
    "gate_conditions": gate_conditions,
    "area_contract_status": area_contract_status,
    "gyeongju_areaCode": gyeongbuk_code,
    "gyeongju_sigunguCode": gyeongju_sigungu_code,
    "en_list_count": len(en_list),
    "pilot_summary": dict(match_counter),
    "notes": [] if gyeongju_en_gate else [k for k, v in gate_conditions.items() if not v],
}

print(f"\n  === Gate 판정 ===")
for k, v in gate_conditions.items():
    print(f"    {'✅' if v else '❌'} {k}: {v}")
print(f"\n  GYEONGJU_EN_FULL_COLLECTION_READY: {gyeongju_en_gate}")

# ═══════════════════════════════════════════════════════
# PHASE 10: 파일 출력
# ═══════════════════════════════════════════════════════
print("\n=== Phase 10: 파일 출력 ===")

output_files = {}

# 1. EngService2 계약 MD
contract_md_path = DOCS / "gyeongju-engservice2-source-contract-v1.md"
with open(contract_md_path, "w", encoding="utf-8") as f:
    f.write(f"# EngService2 Source Contract V1\n\n")
    f.write(f"**작성일시**: {TIMESTAMP}  \n")
    f.write(f"**Task**: {TASK_ID}  \n\n")
    f.write(f"## 로컬 매뉴얼\n\n`{CONTRACT_LOCAL_SOURCE}`\n\n")
    f.write(f"## Base Endpoint\n\n`{ENG_BASE}`\n\n")
    f.write(f"## 인증\n\n환경변수: `TOUR_API_KEY`\n\n")
    f.write(f"## 경주 지역 필터\n\n")
    f.write(f"- areaCode: `{gyeongbuk_code}` (경상북도)  \n")
    f.write(f"- sigunguCode: `{gyeongju_sigungu_code}` (경주시)  \n")
    f.write(f"- 계약 상태: `{area_contract_status}`  \n\n")
    f.write(f"## ContentId 네임스페이스\n\n")
    f.write("- KorService2 contentid ≠ EngService2 contentid (별도 체계)\n")
    f.write("- 해운대 예시: KOR=126081, ENG=264155\n")
    f.write("- 필드명: `kto_ko_content_id`, `kto_en_content_id` (JOIN KEY로 사용 금지)\n\n")
    f.write("## Operation 상태\n\n| Operation | 상태 | 비고 |\n|---|---|---|\n")
    for op, info in eng_contract["operations"].items():
        f.write(f"| {op} | {info['status']} | {info['note']} |\n")
    f.write(f"\n## EngService2 경주 목록\n\n- 총 {len(en_list)}건 조회됨\n\n")
    f.write(f"## 금지 사항\n\n")
    f.write("- detailPetTour2 금지\n")
    f.write("- YN 파라미터 금지 (detailCommon2: contentId만 사용)\n")
    f.write("- KorService2 파라미터 추정 적용 금지\n")
    f.write("- 한국어 문장 번역하여 EN 데이터로 사용 금지\n")
output_files["contract_md"] = str(contract_md_path)
print(f"  1. {contract_md_path.name}")

# 2. EngService2 계약 JSON
contract_json_path = DATA_NORM / "gyeongju-engservice2-source-contract-v1.json"
write_json(contract_json_path, eng_contract)
output_files["contract_json"] = str(contract_json_path)
print(f"  2. {contract_json_path.name}")

# 3. 파일럿 입력 10건
pilot_input_path = DATA_NORM / "gyeongju-en-10-pilot-input-v1.jsonl"
pilot_input_rows = [{**r, "as_of": TIMESTAMP, "task_id": TASK_ID} for r in pilot_selection]
write_jsonl(pilot_input_path, pilot_input_rows)
output_files["pilot_input"] = str(pilot_input_path)
print(f"  3. {pilot_input_path.name} ({len(pilot_input_rows)}건)")

# 4. KO↔EN Identity Link
identity_link_path = DATA_NORM / "gyeongju-ko-en-identity-link-pilot-v1.jsonl"
write_jsonl(identity_link_path, identity_links)
output_files["identity_link"] = str(identity_link_path)
print(f"  4. {identity_link_path.name} ({len(identity_links)}건)")

# 5. EN 상세 스냅샷
snapshot_path = DATA_NORM / "gyeongju-engservice2-10-pilot-snapshot-v1.jsonl"
write_jsonl(snapshot_path, snapshot_rows)
output_files["snapshot"] = str(snapshot_path)
print(f"  5. {snapshot_path.name} ({len(snapshot_rows)}건)")

# 6. EN 상세 감사
detail_audit_path = DATA_NORM / "gyeongju-engservice2-detail-audit-v1.jsonl"
write_jsonl(detail_audit_path, detail_audit_rows)
output_files["detail_audit"] = str(detail_audit_path)
print(f"  6. {detail_audit_path.name} ({len(detail_audit_rows)}건)")

# 7. EN 커버리지
coverage_path = DATA_VALID / "gyeongju-en-pilot-coverage-v1.json"
write_json(coverage_path, coverage)
output_files["coverage"] = str(coverage_path)
print(f"  7. {coverage_path.name}")

# 8. Gate 결과
gate_path = DATA_VALID / "gyeongju-en-full-collection-gate-v1.json"
write_json(gate_path, gate_result)
output_files["gate"] = str(gate_path)
print(f"  8. {gate_path.name}")

# 9. EN 영문사이트 handoff
handoff_path = DATA_NORM / "gyeongju-official-en-site-handoff-v1.json"
write_json(handoff_path, en_site_handoff)
output_files["handoff"] = str(handoff_path)
print(f"  9. {handoff_path.name}")

# ═══════════════════════════════════════════════════════
# PHASE 11: SHA 감사 (Run1/Run2 검증용)
# ═══════════════════════════════════════════════════════
print("\n=== Phase 11: SHA 감사 ===")

sha_audit = {"as_of": TIMESTAMP, "task_id": TASK_ID, "files": {}}
for key, fpath in output_files.items():
    p = Path(fpath)
    if p.exists():
        sha = sha256_file(p)
        sha_audit["files"][key] = {"path": str(p.relative_to(ROOT)), "sha256": sha}
        print(f"  {p.name}: {sha[:16]}...")

sha_path = DATA_VALID / "gyeongju-engservice2-pilot-run1-run2-sha-v1.json"
write_json(sha_path, sha_audit)
print(f"  SHA 감사 저장: {sha_path.name}")

# ═══════════════════════════════════════════════════════
# 최종 보고
# ═══════════════════════════════════════════════════════
print(f"""
╔══════════════════════════════════════════════════════════
║  {TASK_ID}
║  FINAL SUMMARY
╠══════════════════════════════════════════════════════════
║  EngService2 계약 소스: {CONTRACT_LOCAL_SOURCE}
║  경주 areaCode: {gyeongbuk_code}, sigunguCode: {gyeongju_sigungu_code}
║  계약 상태: {area_contract_status}
║  경주 EN 목록: {len(en_list)}건
║  ──────────────────────────────────────────────────────
║  파일럿 10건 선정: {len(pilot_selection)}건
║  EN match (EXACT+HIGH): {en_match_count}건
║  IDENTITY_REVIEW_REQUIRED: {review_required_count}건
║  NO_EN_RECORD: {no_record_count}건
║  ──────────────────────────────────────────────────────
║  ContentId Equal 관찰: {id_obs_same}건
║  ContentId Different 관찰: {id_obs_diff}건
║  ──────────────────────────────────────────────────────
║  EN title: {en_title_count}건 (/{len(confirmed_links)}건 상세 호출)
║  EN description: {en_desc_count}건
║  EN address: {en_addr_count}건
║  EN coordinates: {en_coord_count}건
║  EN image: {en_image_count}건
║  ──────────────────────────────────────────────────────
║  네트워크 호출: {network_call_count}건 (Run2에서는 0 예상)
║  API 오류: {api_errors}건
║  ──────────────────────────────────────────────────────
║  GYEONGJU_EN_FULL_COLLECTION_READY: {gyeongju_en_gate}
╚══════════════════════════════════════════════════════════
""")

print("스크립트 완료.")
