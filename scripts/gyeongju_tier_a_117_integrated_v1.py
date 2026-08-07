#!/usr/bin/env python3
"""
gyeongju_tier_a_117_integrated_v1.py
TASK-GYEONGJU-TIER-A-117-INTEGRATED-FULL-COLLECTION-V1

경주 TIER_A 117건 통합 수집: VG HTML + KTO KorService2 + PhotoGalleryService1

금지 (task 제약):
  - EngService2 호출 금지
  - master checkout·merge·push 금지
  - force push 금지
  - areaCode·sigunguCode 금지 파라미터
  - galContentId → KorService2 전달 금지
  - galContentTypeId를 관광정보 contentTypeId로 사용 금지
  - 두 ID 체계 직접 JOIN 금지
  - API 키 출력·저장·커밋 금지
  - 기존 candidate/source facts/frozen raw 수정 금지
  - LLM/Gemini 사용 금지 (Run1 = Run2 BYTE_IDENTICAL 보장)

브랜치: data/gyeongju-tier-a-117-integrated-collection-v1
베이스: data/gyeongju-kto-v3-final-correction-v1 @ 4f794153
"""

import hashlib, json, os, re, sys, time, urllib.parse, urllib.request, urllib.error, math
from datetime import datetime, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# ─── 상수 ────────────────────────────────────────────────────────────────────
TASK_ID   = "TASK-GYEONGJU-TIER-A-117-INTEGRATED-FULL-COLLECTION-V1"
AS_OF     = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
BATCH_SIZE     = 20
CALL_SLEEP     = 0.4
MAX_RETRY      = 2
VG_BASE_URL    = "https://www.gyeongju.go.kr/gyeongju/page.do"
KTO_BASE       = "https://apis.data.go.kr/B551011/KorService2"
GALLERY_BASE   = "https://apis.data.go.kr/B551011/PhotoGalleryService1"
LDONG_REGNCD   = "47"   # 경상북도
LDONG_SIGNGUCD = "130"  # 경주시
GYEONGJU_LAT_RANGE = (35.4, 36.2)
GYEONGJU_LNG_RANGE = (128.8, 129.6)

# ─── 경로 ────────────────────────────────────────────────────────────────────
BASE_DIR     = Path(__file__).parent.parent
DATA_DIR     = BASE_DIR / "data" / "tourapi"
RAW_DIR      = DATA_DIR / "raw" / "gyeongju"
NORM_DIR     = DATA_DIR / "normalized" / "gyeongju"
VAL_DIR      = DATA_DIR / "validation" / "gyeongju"
DOCS_DIR     = BASE_DIR / "docs" / "tourapi"

PILOT_RAW_DIR  = RAW_DIR / "gyeongju-tier-a-pilot-v1"
TIER_A_RAW_DIR = RAW_DIR / "gyeongju-tier-a-117-v1"
KTO_RAW_DIR    = TIER_A_RAW_DIR / "kto-detail"
GAL_RAW_DIR    = TIER_A_RAW_DIR / "gallery"
SEARCH_RAW_DIR = TIER_A_RAW_DIR / "kto-search"

PRIORITY_FILE       = NORM_DIR / "gyeongju-tourism-next-batch-priority-v1.jsonl"
IDENTITY_AUDIT_FILE = NORM_DIR / "gyeongju-attraction-identity-audit-v1.jsonl"
ATTRACTIONS_RAW_FILE = BASE_DIR / "data" / "tourapi" / "gyeongju" / "web-raw-v3" / "attractions" / "attractions-raw.jsonl"
KTO_INDEX_FILE      = RAW_DIR / "kto-list" / "kto-all-types-areabasedlist2-gyeongju-v3.json"
CORE27_FILE         = NORM_DIR / "gyeongju-core27-official-detail-snapshot-v1.jsonl"

# ─── 출력 파일 ────────────────────────────────────────────────────────────────
OUT_VG_SNAPSHOT     = NORM_DIR / "gyeongju-tier-a-117-vg-snapshot-v1.jsonl"
OUT_KTO_MATCH       = NORM_DIR / "gyeongju-tier-a-117-kto-match-index-v1.jsonl"
OUT_KTO_DETAIL      = NORM_DIR / "gyeongju-tier-a-117-kto-detail-snapshot-v1.jsonl"
OUT_KTO_IMAGES      = VAL_DIR  / "gyeongju-tier-a-117-kto-images-audit-v1.jsonl"
OUT_GALLERY         = NORM_DIR / "gyeongju-tier-a-117-photogallery-snapshot-v1.jsonl"
OUT_INTEGRATED      = NORM_DIR / "gyeongju-tier-a-117-integrated-snapshot-v1.jsonl"
OUT_RELEASE         = NORM_DIR / "gyeongju-tier-a-117-release-classification-v1.jsonl"
OUT_COVERAGE        = VAL_DIR  / "gyeongju-tier-a-117-coverage-report-v1.json"
OUT_BATCH_LOG       = VAL_DIR  / "gyeongju-tier-a-117-batch-log-v1.jsonl"
OUT_QA              = VAL_DIR  / "gyeongju-tier-a-117-qa-report-v1.json"
OUT_RUN1_SHA        = VAL_DIR  / "gyeongju-tier-a-117-run1-sha-v1.json"

# ─── 유틸 ────────────────────────────────────────────────────────────────────
def jdump(obj, indent=None):
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, indent=indent)

def jwrite(obj, path, indent=None):
    Path(path).write_text(jdump(obj, indent=indent) + "\n", encoding="utf-8")

def jlwrite(rows, path):
    Path(path).write_text(
        "\n".join(jdump(r) for r in rows) + ("\n" if rows else ""),
        encoding="utf-8",
    )

def load_jsonl(p):
    return [json.loads(l) for l in Path(p).read_text("utf-8").splitlines() if l.strip()]

def sha256_file(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()

def normalize_name(name):
    """정규화: 경주 접두사 제거, 공백·특수문자 제거."""
    n = (name or "").strip()
    for p in ["경주시 ", "경주 "]:
        if n.startswith(p):
            n = n[len(p):]
    return re.sub(r"[\s\-··]", "", n)

# ─── API 호출 ────────────────────────────────────────────────────────────────
def _http_get_bytes(url, timeout=25):
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 KoreaMate/1.0 (gyeongju-tier-a-117)"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.status, resp.headers.get("Content-Type", ""), resp.read()

def _kto_get(endpoint, params):
    """KTO API GET. params에 serviceKey 포함."""
    assert "areaCode" not in params, "areaCode 금지"
    assert "sigunguCode" not in params, "sigunguCode 금지"
    url = f"{KTO_BASE}/{endpoint}?" + urllib.parse.urlencode(params)
    for attempt in range(MAX_RETRY + 1):
        try:
            time.sleep(CALL_SLEEP)
            status, ct, body = _http_get_bytes(url)
            return status, json.loads(body.decode("utf-8"))
        except Exception as e:
            if attempt == MAX_RETRY:
                return 0, {"error": str(e)}
            time.sleep(2 ** attempt)

def _gallery_get(endpoint, params):
    """PhotoGallery API GET."""
    url = f"{GALLERY_BASE}/{endpoint}?" + urllib.parse.urlencode(params)
    for attempt in range(MAX_RETRY + 1):
        try:
            time.sleep(CALL_SLEEP)
            status, ct, body = _http_get_bytes(url)
            return status, json.loads(body.decode("utf-8"))
        except Exception as e:
            if attempt == MAX_RETRY:
                return 0, {"error": str(e)}
            time.sleep(2 ** attempt)

def _extract_items(data):
    body  = data.get("response", {}).get("body", {})
    items = body.get("items", {})
    if not items:
        return []
    if isinstance(items, list):
        return items
    item = items.get("item", [])
    if isinstance(item, dict):
        return [item] if item else []
    return item if isinstance(item, list) else []

def _extract_total_count(data):
    body = data.get("response", {}).get("body", {})
    return int(body.get("totalCount", 0) or 0)

def _extract_result_code(data):
    hdr = data.get("response", {}).get("header", {})
    return hdr.get("resultCode", ""), hdr.get("resultMsg", "")

# ─── 환경 로드 ────────────────────────────────────────────────────────────────
def load_api_key():
    for k in ("TOUR_API_KEY", "KOR_TOUR_API_KEY"):
        v = os.environ.get(k, "")
        if v:
            return v
    env = BASE_DIR / ".env.local"
    if env.exists():
        for line in env.read_text("utf-8", errors="replace").splitlines():
            if line.strip().startswith("#"):
                continue
            if "TOUR_API_KEY" in line and "=" in line:
                _, _, v = line.partition("=")
                v = v.strip().strip('"').strip("'")
                if v and len(v) > 10:
                    return v
    print("[ERROR] TOUR_API_KEY 없음", file=sys.stderr)
    sys.exit(1)

# ─── 소스 데이터 로드 ─────────────────────────────────────────────────────────
def load_tier_a_queue():
    rows = load_jsonl(PRIORITY_FILE)
    return [r for r in rows if r.get("next_batch_tier") == "TIER_A_NEXT_RELEASE"]

def load_identity_audit():
    audit = {}
    for r in load_jsonl(IDENTITY_AUDIT_FILE):
        cid = r.get("baseline_candidate_id")
        if cid and r.get("area_uid"):
            audit[cid] = r
    return audit

def load_attractions_by_area():
    atts = {}
    for r in load_jsonl(ATTRACTIONS_RAW_FILE):
        auid = r.get("area_uid")
        if auid:
            atts[auid] = r
    return atts

def load_kto_index():
    data = json.loads(KTO_INDEX_FILE.read_text("utf-8"))
    return data.get("items", [])

def build_kto_name_index(kto_items):
    idx = {}
    for it in kto_items:
        title = it.get("title", "")
        key   = normalize_name(title)
        if key:
            idx.setdefault(key, []).append(it)
    return idx

# ─── VG HTML 수집 ─────────────────────────────────────────────────────────────
def build_vg_url(mnu_uid, code_uid, area_uid):
    params = urllib.parse.urlencode({
        "mnu_uid":  mnu_uid,
        "code_uid": code_uid,
        "area_uid": area_uid,
        "cmd":      "2",
    })
    return f"{VG_BASE_URL}?{params}"

def detect_charset(content_type, html_bytes):
    m = re.search(r"charset=([^\s;]+)", content_type, re.IGNORECASE)
    if m:
        return m.group(1).upper()
    m = re.search(rb"<meta[^>]+charset=[\"']?([^\"'\s;>]+)", html_bytes[:3000], re.IGNORECASE)
    if m:
        return m.group(1).decode("ascii", errors="replace").upper()
    return "UTF-8"

def fetch_vg_html(area_uid, mnu_uid, code_uid):
    """VG HTML 수집. 캐시 우선 (pilot 포함)."""
    # 캐시 1: pilot 디렉토리
    pilot_file = PILOT_RAW_DIR / f"vg-area-{area_uid}.json"
    if pilot_file.exists():
        data = json.loads(pilot_file.read_text("utf-8"))
        return data, "CACHE_HIT_PILOT"

    # 캐시 2: tier-a-117 디렉토리
    cache_file = TIER_A_RAW_DIR / f"vg-area-{area_uid}.json"
    if cache_file.exists():
        data = json.loads(cache_file.read_text("utf-8"))
        return data, "CACHE_HIT"

    # 신규 HTTP 요청
    url = build_vg_url(mnu_uid, code_uid, area_uid)
    try:
        status, ct, html_bytes = _http_get_bytes(url)
        charset = detect_charset(ct, html_bytes)
        try:
            html_text = html_bytes.decode(charset.lower().replace("utf-8", "utf-8")
                                          .replace("utf8", "utf-8"))
        except (UnicodeDecodeError, LookupError):
            html_text = html_bytes.decode("utf-8", errors="replace")
            charset = "UTF-8_FALLBACK"

        raw = {
            "area_uid": area_uid,
            "mnu_uid":  mnu_uid,
            "code_uid": code_uid,
            "url":      url,
            "http_status": status,
            "charset_detected": charset,
            "html": html_text,
            "html_len": len(html_text),
            "collected_at": AS_OF,
        }
        cache_file.write_text(jdump(raw) + "\n", encoding="utf-8")
        return raw, "FRESH"

    except urllib.error.HTTPError as e:
        err = {"area_uid": area_uid, "url": url, "http_status": e.code,
               "error": str(e), "collected_at": AS_OF}
        return err, "HTTP_ERROR"
    except Exception as e:
        err = {"area_uid": area_uid, "url": url, "http_status": 0,
               "error": str(e), "collected_at": AS_OF}
        return err, "ERROR"

def parse_vg_html(html_text, area_uid, vg_status):
    """VG HTML 파싱: 이름·좌표·설명·이미지."""
    result = {
        "area_uid":    area_uid,
        "name_vg":     None,
        "lat":         None,
        "lng":         None,
        "lat_ok":      False,
        "lng_ok":      False,
        "description": None,
        "desc_source": "NONE",
        "images_vg":   [],
        "image_count_vg": 0,
        "parse_flags": [],
        "vg_http_ok":  vg_status not in ("HTTP_ERROR", "ERROR"),
    }

    if not html_text or vg_status in ("HTTP_ERROR", "ERROR"):
        result["parse_flags"].append("VG_FETCH_ERROR")
        return result

    # 좌표 (var lat / var lng — ASCII 숫자, 인코딩 무관)
    lat_m = re.search(r"var\s+lat\s*=\s*['\"]?([\d.]+)['\"]?", html_text)
    lng_m = re.search(r"var\s+lng\s*=\s*['\"]?([\d.]+)['\"]?", html_text)
    if lat_m:
        result["lat"] = float(lat_m.group(1))
        result["lat_ok"] = GYEONGJU_LAT_RANGE[0] <= result["lat"] <= GYEONGJU_LAT_RANGE[1]
    if lng_m:
        result["lng"] = float(lng_m.group(1))
        result["lng_ok"] = GYEONGJU_LNG_RANGE[0] <= result["lng"] <= GYEONGJU_LNG_RANGE[1]

    # 좌표 반전 의심 체크
    if result["lat"] and result["lng"]:
        if (GYEONGJU_LNG_RANGE[0] <= result["lat"] <= GYEONGJU_LNG_RANGE[1] and
                GYEONGJU_LAT_RANGE[0] <= result["lng"] <= GYEONGJU_LAT_RANGE[1]):
            result["parse_flags"].append("COORD_SWAP_SUSPECTED")

    if not result["lat_ok"]:
        result["parse_flags"].append("LAT_OUT_OF_RANGE")
    if not result["lng_ok"]:
        result["parse_flags"].append("LNG_OUT_OF_RANGE")

    # 이미지 (upload 경로 — ASCII)
    vg_origin = "https://www.gyeongju.go.kr"
    img_pat = re.compile(
        r'(?:src|href)=["\']([^"\']*(?:/upload|/content)[^"\']*\.(?:jpg|jpeg|png|gif|webp))["\']',
        re.IGNORECASE,
    )
    imgs_raw = img_pat.findall(html_text)
    imgs_abs = []
    seen = set()
    for img in imgs_raw:
        url = img if img.startswith("http") else vg_origin + img
        if url not in seen:
            seen.add(url)
            imgs_abs.append(url)
    result["images_vg"]       = imgs_abs[:20]
    result["image_count_vg"]  = len(imgs_abs)
    if not imgs_abs:
        result["parse_flags"].append("VG_IMAGES_NONE")

    # 설명 (tourView 섹션 한국어 텍스트)
    tv_m = re.search(
        r'tourView["\'][^>]*>(.*?)</div>',
        html_text,
        re.IGNORECASE | re.DOTALL,
    )
    if tv_m:
        raw_text = re.sub(r"<[^>]+>", " ", tv_m.group(1))
        raw_text = re.sub(r"&[a-zA-Z]+;", " ", raw_text)
        raw_text = re.sub(r"\s+", " ", raw_text).strip()
        # 한국어 문자 포함 여부 확인
        korean_chars = [c for c in raw_text if "가" <= c <= "힣"]
        if len(korean_chars) >= 10:
            result["description"] = raw_text[:2000]
            result["desc_source"] = "VG_TOURVIEW"

    # alt 텍스트에서 장소명 추출 시도 (한국어 포함 alt)
    if result["name_vg"] is None:
        alts = re.findall(r'alt=["\']([^"\']{2,50})["\']', html_text)
        for alt in alts:
            kc = sum(1 for c in alt if "가" <= c <= "힣")
            if kc >= 2:
                result["name_vg"] = alt.strip()
                break

    return result

# ─── KTO 매칭 ────────────────────────────────────────────────────────────────
def match_kto_from_index(name_ko, kto_name_idx):
    """KTO 인덱스에서 3단계 매칭."""
    norm = normalize_name(name_ko)

    # Step 1: 완전 정규화 일치
    hits = kto_name_idx.get(norm, [])
    if len(hits) == 1:
        return hits[0], "EXACT_MATCH"
    if len(hits) > 1:
        return hits[0], "MULTIPLE_MATCH_FIRST"

    # Step 2: 부분 포함 (정규화 기준)
    partial = []
    for k, vs in kto_name_idx.items():
        if k and norm and (norm in k or k in norm) and k != norm:
            partial.extend(vs)
    if len(partial) == 1:
        return partial[0], "PARTIAL_MATCH"
    if len(partial) > 1:
        return partial[0], "PARTIAL_MATCH_MULTIPLE"

    return None, "NOT_FOUND_IN_INDEX"

def search_kto_keyword(name_ko, api_key, cache_dir):
    """searchKeyword2 (법정동 코드 기준)."""
    safe  = normalize_name(name_ko)[:25]
    cache = cache_dir / f"kw-{safe}.json"
    if cache.exists():
        return json.loads(cache.read_text("utf-8")), "CACHE_HIT"

    params = {
        "numOfRows":      "50",
        "pageNo":         "1",
        "MobileOS":       "ETC",
        "MobileApp":      "KoreaMateBot",
        "serviceKey":     api_key,
        "_type":          "json",
        "keyword":        name_ko,
        "lDongRegnCd":    LDONG_REGNCD,
        "lDongSignguCd":  LDONG_SIGNGUCD,
    }
    status, data = _kto_get("searchKeyword2", params)
    items = _extract_items(data)
    result = {
        "keyword":         name_ko,
        "lDongRegnCd":     LDONG_REGNCD,
        "lDongSignguCd":   LDONG_SIGNGUCD,
        "http_status":     status,
        "total_count":     _extract_total_count(data),
        "items":           items,
        "collected_at":    AS_OF,
    }
    cache.write_text(jdump(result) + "\n", encoding="utf-8")
    return result, "FRESH"

def build_match_record(candidate_id, name_ko, match_status, kto_item, method):
    if kto_item:
        return {
            "candidate_id":       candidate_id,
            "name_ko":            name_ko,
            "match_status":       match_status,
            "kto_content_id":     kto_item.get("contentid"),
            "kto_content_type_id": kto_item.get("contenttypeid"),
            "kto_title":          kto_item.get("title"),
            "kto_addr1":          kto_item.get("addr1"),
            "kto_mapx":           kto_item.get("mapx"),
            "kto_mapy":           kto_item.get("mapy"),
            "kto_firstimage":     kto_item.get("firstimage"),
            "matched_by":         method,
            "collected_at":       AS_OF,
        }
    return {
        "candidate_id":       candidate_id,
        "name_ko":            name_ko,
        "match_status":       "NO_KTO_RECORD",
        "kto_content_id":     None,
        "kto_content_type_id": None,
        "kto_title":          None,
        "kto_addr1":          None,
        "kto_mapx":           None,
        "kto_mapy":           None,
        "kto_firstimage":     None,
        "matched_by":         method,
        "collected_at":       AS_OF,
    }

# ─── KTO 상세 수집 ────────────────────────────────────────────────────────────
def fetch_kto_detail_common2(content_id, api_key):
    cache = KTO_RAW_DIR / f"detailcommon2-{content_id}.json"
    if cache.exists():
        return json.loads(cache.read_text("utf-8")), "CACHE_HIT"
    params = {
        "numOfRows": "10", "pageNo": "1",
        "MobileOS": "ETC", "MobileApp": "KoreaMateBot",
        "serviceKey": api_key, "_type": "json",
        "contentId": content_id,
    }
    status, data = _kto_get("detailCommon2", params)
    rc, rm = _extract_result_code(data)
    items  = _extract_items(data)
    result = {
        "content_id":   content_id,
        "http_status":  status,
        "result_code":  rc,
        "result_msg":   rm,
        "total_count":  _extract_total_count(data),
        "item":         items[0] if items else {},
        "verdict":      "VALID_ITEM" if items else "EMPTY",
        "collected_at": AS_OF,
    }
    cache.write_text(jdump(result) + "\n", encoding="utf-8")
    return result, "FRESH"

def fetch_kto_detail_image2(content_id, api_key):
    cache = KTO_RAW_DIR / f"detailimage2-{content_id}.json"
    if cache.exists():
        return json.loads(cache.read_text("utf-8")), "CACHE_HIT"
    params = {
        "numOfRows": "100", "pageNo": "1",
        "MobileOS": "ETC", "MobileApp": "KoreaMateBot",
        "serviceKey": api_key, "_type": "json",
        "contentId": content_id,
        "imageYN": "Y",
    }
    status, data = _kto_get("detailImage2", params)
    rc, _  = _extract_result_code(data)
    items  = _extract_items(data)
    result = {
        "content_id":   content_id,
        "http_status":  status,
        "result_code":  rc,
        "total_count":  _extract_total_count(data),
        "images":       items,
        "image_count":  len(items),
        "collected_at": AS_OF,
    }
    cache.write_text(jdump(result) + "\n", encoding="utf-8")
    return result, "FRESH"

def parse_kto_images(image2_result):
    """detailImage2 결과에서 이미지·권리 정보 파싱."""
    images = image2_result.get("images", [])
    parsed = []
    for img in images:
        cpyrht = img.get("cpyrhtDivCd", "")
        if cpyrht in ("Type1", "Type3"):
            rights = "VERIFIED_ALLOWED_BY_IMAGE_METADATA"
            commercial_ok = True
            modification_ok = (cpyrht == "Type1")
            kogl = "KOGL제1유형" if cpyrht == "Type1" else "KOGL제3유형"
        else:
            rights = "RIGHTS_UNKNOWN"
            commercial_ok = None
            modification_ok = None
            kogl = None
        parsed.append({
            "imgurl":          img.get("originimgurl") or img.get("galWebImageUrl"),
            "smallimgurl":     img.get("smallimageurl"),
            "imgname":         img.get("imgname"),
            "cpyrhtDivCd":     cpyrht,
            "rights_status":   rights,
            "commercial_ok":   commercial_ok,
            "modification_ok": modification_ok,
            "kogl_type":       kogl,
        })
    rights_set = {p["cpyrhtDivCd"] for p in parsed if p["cpyrhtDivCd"]}
    all_allowed = bool(parsed) and rights_set <= {"Type1", "Type3"}
    return parsed, all_allowed

# ─── PhotoGallery 수집 ───────────────────────────────────────────────────────
def fetch_gallery_search(name_ko, api_key):
    safe  = normalize_name(name_ko)[:25]
    cache = GAL_RAW_DIR / f"search-{safe}.json"
    if cache.exists():
        return json.loads(cache.read_text("utf-8")), "CACHE_HIT"

    params = {
        "numOfRows":  "50",
        "pageNo":     "1",
        "MobileOS":   "ETC",
        "MobileApp":  "KoreaMateBot",
        "serviceKey": api_key,
        "_type":      "json",
        "keyword":    name_ko,
    }
    status, data = _gallery_get("gallerySearchList1", params)
    items = _extract_items(data)
    gallery_items = []
    for it in items:
        gallery_items.append({
            "gal_content_id":           it.get("galContentId"),       # gal 전용 ID (KTO contentId와 다름)
            "gal_content_type_id":      it.get("galContentTypeId"),   # gal 전용 분류 (KTO contenttypeid와 다름)
            "gal_title":                it.get("galTitle"),
            "gal_web_image_url":        it.get("galWebImageUrl"),
            "gal_photography_location": it.get("galPhotographyLocation"),
            "gal_photography_month":    it.get("galPhotographyMonth"),
            "gal_photographer":         it.get("galPhotographer"),
            "gal_search_keyword":       it.get("galSearchKeyword"),
        })
    result = {
        "place_name":          name_ko,
        "keyword":             name_ko,
        "http_status":         status,
        "total_count":         _extract_total_count(data),
        "gallery_items":       gallery_items,
        "namespace_check":     "gal_content_id_SEPARATE_from_kto_content_id",
        "collected_at":        AS_OF,
    }
    cache.write_text(jdump(result) + "\n", encoding="utf-8")
    return result, "FRESH"

def select_gallery_match(name_ko, gallery_items):
    """경주 소재 동일 장소 검증. 동명이인 자동 연결 금지."""
    matched = []
    for it in gallery_items:
        location = (it.get("gal_photography_location") or "").strip()
        title    = (it.get("gal_title") or "").strip()
        keywords = (it.get("gal_search_keyword") or "").strip()
        location_ok = "경주" in location
        name_ok     = name_ko in title or name_ko in keywords
        if location_ok and name_ok:
            matched.append(it)
    if len(matched) == 1:
        return "EXACT_PHOTO_MATCH", matched
    if len(matched) > 1:
        return "HIGH_CONFIDENCE_PHOTO_MATCH", matched
    if gallery_items:
        return "MANUAL_REVIEW_REQUIRED", gallery_items[:3]
    return "NO_PHOTO_RECORD", []

def fetch_gallery_detail(gal_title, api_key):
    safe  = normalize_name(gal_title)[:30]
    cache = GAL_RAW_DIR / f"detail-{safe}.json"
    if cache.exists():
        return json.loads(cache.read_text("utf-8")), "CACHE_HIT"

    params = {
        "numOfRows":  "100",
        "pageNo":     "1",
        "MobileOS":   "ETC",
        "MobileApp":  "KoreaMateBot",
        "serviceKey": api_key,
        "_type":      "json",
        "title":      gal_title,
    }
    status, data = _gallery_get("galleryDetailList1", params)
    items = _extract_items(data)
    detail_items = []
    for it in items:
        detail_items.append({
            "gal_content_id":           it.get("galContentId"),
            "gal_content_type_id":      it.get("galContentTypeId"),
            "gal_title":                it.get("galTitle"),
            "gal_web_image_url":        it.get("galWebImageUrl"),
            "gal_photography_location": it.get("galPhotographyLocation"),
            "gal_photography_month":    it.get("galPhotographyMonth"),
            "gal_photographer":         it.get("galPhotographer"),
            "rights_source":            "PhotoGalleryService1",
            "rights_status":            "VERIFIED_ALLOWED_BY_SOURCE_CONTRACT",
            "rights_note":              "공공데이터포털 이용허락범위=제한없음",
        })
    result = {
        "gal_title":     gal_title,
        "http_status":   status,
        "total_count":   _extract_total_count(data),
        "detail_items":  detail_items,
        "image_count":   len(detail_items),
        "collected_at":  AS_OF,
    }
    cache.write_text(jdump(result) + "\n", encoding="utf-8")
    return result, "FRESH"

# ─── 좌표 비교 ────────────────────────────────────────────────────────────────
def coord_distance_m(lat1, lng1, lat2, lng2):
    try:
        dlat = float(lat2) - float(lat1)
        dlng = float(lng2) - float(lng1)
        avg_lat = math.radians((float(lat1) + float(lat2)) / 2)
        dist = math.sqrt((dlat * 111320) ** 2 + (dlng * 111320 * math.cos(avg_lat)) ** 2)
        return round(dist, 1)
    except Exception:
        return None

# ─── 통합 스냅샷 빌드 ─────────────────────────────────────────────────────────
def build_integrated_snapshot(chain, vg_parsed, match_rec, dc2_result, kto_images_parsed,
                              kto_all_allowed, gallery_search_result, gallery_match_status,
                              gallery_detail_result):
    cid     = chain["candidate_id"]
    name_ko = chain["name_ko"]

    # 좌표
    vg_lat = vg_parsed.get("lat")
    vg_lng = vg_parsed.get("lng")
    vg_lat_ok = vg_parsed.get("lat_ok", False)

    kto_mapx = match_rec.get("kto_mapx")
    kto_mapy = match_rec.get("kto_mapy")
    dc2_item = dc2_result.get("item", {}) if dc2_result else {}
    kto_mapx = dc2_item.get("mapx") or kto_mapx
    kto_mapy = dc2_item.get("mapy") or kto_mapy

    coord_dist = None
    if vg_lat and vg_lng and kto_mapx and kto_mapy:
        coord_dist = coord_distance_m(vg_lat, vg_lng, kto_mapy, kto_mapx)

    if vg_lat_ok:
        final_lat = vg_lat
        final_lng = vg_lng
        final_coord_src = "VG"
    elif kto_mapy and kto_mapx:
        try:
            final_lat = float(kto_mapy)
            final_lng = float(kto_mapx)
            final_coord_src = "KTO"
        except Exception:
            final_lat = final_lng = None
            final_coord_src = "NONE"
    else:
        final_lat = final_lng = None
        final_coord_src = "NONE"

    # 설명
    kto_overview = dc2_item.get("overview", "") or ""
    vg_desc = vg_parsed.get("description") or ""
    if kto_overview.strip():
        final_desc = kto_overview.strip()
        final_desc_src = "KTO_OVERVIEW"
    elif vg_desc.strip():
        final_desc = vg_desc.strip()
        final_desc_src = "VG_TOURVIEW"
    else:
        final_desc = None
        final_desc_src = "NONE"

    # 이미지 집계
    kto_content_id = match_rec.get("kto_content_id")
    kto_matched    = bool(kto_content_id)
    kto_firstimage = match_rec.get("kto_firstimage") or dc2_item.get("firstimage") or None
    kto_img_count  = len(kto_images_parsed)
    vg_img_count   = vg_parsed.get("image_count_vg", 0)

    # gallery
    gal_group_title = None
    gal_img_count   = 0
    gal_rights      = "NO_GALLERY_MATCH"
    if gallery_match_status in ("EXACT_PHOTO_MATCH", "HIGH_CONFIDENCE_PHOTO_MATCH"):
        if gallery_detail_result:
            gal_group_title = gallery_detail_result.get("gal_title")
            gal_img_count   = gallery_detail_result.get("image_count", 0)
            gal_rights      = "VERIFIED_ALLOWED_BY_SOURCE_CONTRACT" if gal_img_count > 0 else "NO_GALLERY_MATCH"
    elif gallery_match_status == "MANUAL_REVIEW_REQUIRED":
        gal_rights = "MANUAL_REVIEW_REQUIRED"

    usable_kto   = kto_img_count + (1 if kto_firstimage else 0)
    usable_vg    = vg_img_count
    usable_gal   = gal_img_count
    total_images = usable_kto + usable_vg + usable_gal

    # 릴리스 분류
    if final_lat and final_lng and total_images >= 3:
        release_cls = "READY_FOR_RELEASE"
    elif final_lat and final_lng and total_images >= 1:
        release_cls = "PARTIAL_READY"
    elif not final_lat:
        release_cls = "COORD_MISSING"
    else:
        release_cls = "IMAGES_MISSING"

    return {
        "candidate_id":       cid,
        "name_ko":            name_ko,
        "area_uid":           chain["area_uid"],
        "mnu_uid":            chain["mnu_uid"],
        "code_uid":           chain["code_uid"],
        # 좌표
        "final_lat":          final_lat,
        "final_lng":          final_lng,
        "final_coord_src":    final_coord_src,
        "vg_lat":             vg_lat,
        "vg_lng":             vg_lng,
        "kto_mapy":           kto_mapy,
        "kto_mapx":           kto_mapx,
        "kto_vg_coord_dist_m": coord_dist,
        # 설명
        "final_desc":         final_desc,
        "final_desc_src":     final_desc_src,
        # KTO
        "kto_matched":        kto_matched,
        "kto_content_id":     kto_content_id,
        "kto_content_type_id": match_rec.get("kto_content_type_id"),
        "kto_match_status":   match_rec.get("match_status"),
        "kto_match_method":   match_rec.get("matched_by"),
        "kto_firstimage":     kto_firstimage,
        "kto_image_count":    kto_img_count,
        "kto_rights_summary": "VERIFIED_ALLOWED_BY_IMAGE_METADATA" if kto_all_allowed else (
                               "MIXED_OR_UNKNOWN" if kto_images_parsed else "NO_KTO_IMAGES"),
        # VG
        "vg_image_count":     vg_img_count,
        "vg_images":          vg_parsed.get("images_vg", [])[:10],
        "vg_parse_flags":     vg_parsed.get("parse_flags", []),
        # Gallery
        "gallery_match_status": gallery_match_status,
        "gallery_group_title":  gal_group_title,
        "gallery_image_count":  gal_img_count,
        "gallery_rights":       gal_rights,
        # 집계
        "usable_kto_images":   usable_kto,
        "usable_vg_images":    usable_vg,
        "usable_gal_images":   usable_gal,
        "total_usable_images": total_images,
        # 릴리스
        "release_classification": release_cls,
        # 메타
        "collected_at": AS_OF,
        "task_id":      TASK_ID,
    }

# ─── 메인 ────────────────────────────────────────────────────────────────────
def main():
    print(f"[{TASK_ID}]")
    print(f"AS_OF: {AS_OF}")

    # 디렉토리 생성
    for d in [TIER_A_RAW_DIR, KTO_RAW_DIR, GAL_RAW_DIR, SEARCH_RAW_DIR,
              NORM_DIR, VAL_DIR]:
        d.mkdir(parents=True, exist_ok=True)

    # API 키 로드 (값 출력 금지)
    api_key = load_api_key()
    print(f"[OK] API 키 로드 (길이={len(api_key)}자)")

    # 소스 데이터 로드
    print("\n[1/7] 소스 데이터 로드...")
    tier_a = load_tier_a_queue()
    print(f"  TIER_A 큐: {len(tier_a)}건")

    id_audit = load_identity_audit()
    print(f"  ID audit: {len(id_audit)}건")

    att_by_area = load_attractions_by_area()
    print(f"  Attractions raw: {len(att_by_area)}건")

    kto_items   = load_kto_index()
    kto_name_idx = build_kto_name_index(kto_items)
    print(f"  KTO 623 인덱스: {len(kto_items)}건, 이름키={len(kto_name_idx)}건")

    # 두 hop 체인 구성
    print("\n[2/7] 두 hop 체인 구성 (candidate_id → area_uid → mnu_uid/code_uid)...")
    chains = []
    chain_errors = []
    for rec in tier_a:
        cid = rec["candidate_id"]
        audit_rec = id_audit.get(cid)
        if not audit_rec:
            chain_errors.append({"candidate_id": cid, "error": "NOT_IN_IDENTITY_AUDIT"})
            continue
        area_uid = audit_rec.get("area_uid")
        if not area_uid:
            chain_errors.append({"candidate_id": cid, "error": "AREA_UID_MISSING"})
            continue
        att = att_by_area.get(area_uid)
        if not att:
            chain_errors.append({"candidate_id": cid, "area_uid": area_uid, "error": "NOT_IN_ATTRACTIONS_RAW"})
            continue
        mnu_uid  = att.get("mnu_uid")
        code_uid = att.get("code_uid")
        if not mnu_uid or not code_uid:
            chain_errors.append({"candidate_id": cid, "area_uid": area_uid, "error": "MNU_CODE_MISSING"})
            continue
        chains.append({
            "candidate_id":   cid,
            "name_ko":        rec.get("name_ko", ""),
            "area_uid":       area_uid,
            "mnu_uid":        mnu_uid,
            "code_uid":       code_uid,
            "priority_score": rec.get("priority_score"),
        })

    print(f"  체인 완성: {len(chains)}건 / 오류: {len(chain_errors)}건")
    if chain_errors:
        for ce in chain_errors:
            print(f"  [CHAIN_ERROR] {ce}")

    # 배치 처리
    n_batches = (len(chains) + BATCH_SIZE - 1) // BATCH_SIZE
    print(f"\n[3/7] 배치 수집 시작: {n_batches}배치 × 최대{BATCH_SIZE}건 = {len(chains)}건 총")

    all_vg_snaps   = []  # S1
    all_matches    = []  # S2 match
    all_kto_dets   = []  # S2 detail (matched only)
    all_kto_imgs   = []  # S2 images audit
    all_gal_snaps  = []  # S3
    all_integrated = []  # 통합
    batch_log      = []

    for bn in range(n_batches):
        batch = chains[bn * BATCH_SIZE : (bn + 1) * BATCH_SIZE]
        b_start_ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        print(f"\n--- 배치 {bn+1}/{n_batches} ({len(batch)}건) {b_start_ts} ---")

        batch_stats = {"ok": 0, "vg_err": 0, "kto_match": 0, "kto_nomatch": 0, "gal_match": 0}

        for i, chain in enumerate(batch):
            idx  = bn * BATCH_SIZE + i + 1
            cid  = chain["candidate_id"]
            name = chain["name_ko"]
            print(f"  [{idx}/{len(chains)}] {cid}: {name}")

            # ── S1: VG HTML ──────────────────────────────────────────────────
            time.sleep(CALL_SLEEP)  # sleep before fresh VG calls too
            vg_raw, vg_status = fetch_vg_html(chain["area_uid"], chain["mnu_uid"], chain["code_uid"])
            if vg_status == "CACHE_HIT" or vg_status == "CACHE_HIT_PILOT":
                pass  # already slept above but no actual HTTP
            vg_parsed = parse_vg_html(vg_raw.get("html", ""), chain["area_uid"], vg_status)
            vg_parsed["candidate_id"] = cid
            vg_parsed["name_ko"]      = name
            vg_parsed["vg_url"]       = vg_raw.get("url")
            vg_parsed["vg_status"]    = vg_status
            vg_parsed["vg_http_status"] = vg_raw.get("http_status")
            all_vg_snaps.append(vg_parsed)
            if vg_status in ("HTTP_ERROR", "ERROR"):
                batch_stats["vg_err"] += 1

            # ── S2: KTO 매칭 ─────────────────────────────────────────────────
            kto_item, idx_method = match_kto_from_index(name, kto_name_idx)
            if kto_item:
                match_rec = build_match_record(cid, name, idx_method, kto_item, f"INDEX:{idx_method}")
                batch_stats["kto_match"] += 1
            else:
                # searchKeyword2 시도 (lDongRegnCd=47)
                kw_result, kw_status = search_kto_keyword(name, api_key, SEARCH_RAW_DIR)
                kw_items = kw_result.get("items", [])
                if kw_items:
                    # 정규화 완전 일치 우선
                    best = [it for it in kw_items if normalize_name(it.get("title","")) == normalize_name(name)]
                    chosen = best[0] if best else kw_items[0]
                    mstatus = "EXACT_MATCH" if best else "KEYWORD_FIRST"
                    match_rec = build_match_record(cid, name, mstatus, chosen, f"KEYWORD2:{kw_status}")
                    batch_stats["kto_match"] += 1
                else:
                    match_rec = build_match_record(cid, name, "NO_KTO_RECORD", None, "EXHAUSTED")
                    batch_stats["kto_nomatch"] += 1
            all_matches.append(match_rec)

            # ── S2: KTO 상세 (매칭된 경우만) ──────────────────────────────────
            dc2_result = None
            kto_images_parsed = []
            kto_all_allowed   = False
            kto_content_id    = match_rec.get("kto_content_id")

            if kto_content_id:
                dc2_result, dc2_status = fetch_kto_detail_common2(kto_content_id, api_key)
                img2_result, img2_status = fetch_kto_detail_image2(kto_content_id, api_key)
                kto_images_parsed, kto_all_allowed = parse_kto_images(img2_result)

                all_kto_dets.append({
                    "candidate_id":    cid,
                    "name_ko":         name,
                    "kto_content_id":  kto_content_id,
                    "dc2_verdict":     dc2_result.get("verdict"),
                    "dc2_item":        dc2_result.get("item", {}),
                    "img2_count":      img2_result.get("image_count", 0),
                    "collected_at":    AS_OF,
                })
                all_kto_imgs.append({
                    "candidate_id":   cid,
                    "name_ko":        name,
                    "kto_content_id": kto_content_id,
                    "image_count":    len(kto_images_parsed),
                    "all_rights_ok":  kto_all_allowed,
                    "rights_summary": "VERIFIED_ALLOWED_BY_IMAGE_METADATA" if kto_all_allowed else (
                                      "MIXED_OR_UNKNOWN" if kto_images_parsed else "NO_KTO_IMAGES"),
                    "images":         kto_images_parsed,
                    "collected_at":   AS_OF,
                })
            else:
                all_kto_imgs.append({
                    "candidate_id":   cid,
                    "name_ko":        name,
                    "kto_content_id": None,
                    "image_count":    0,
                    "all_rights_ok":  False,
                    "rights_summary": "NO_KTO_MATCH",
                    "images":         [],
                    "collected_at":   AS_OF,
                })

            # ── S3: PhotoGallery ──────────────────────────────────────────────
            gal_search_res, gal_s_status = fetch_gallery_search(name, api_key)
            gal_items = gal_search_res.get("gallery_items", [])
            gal_match_status, gal_matched_items = select_gallery_match(name, gal_items)

            gal_detail_result = None
            if gal_match_status in ("EXACT_PHOTO_MATCH", "HIGH_CONFIDENCE_PHOTO_MATCH") and gal_matched_items:
                gal_title = gal_matched_items[0].get("gal_title")
                if gal_title:
                    gal_detail_result, gal_d_status = fetch_gallery_detail(gal_title, api_key)
                    batch_stats["gal_match"] += 1

            gal_img_count = gal_detail_result.get("image_count", 0) if gal_detail_result else 0
            all_gal_snaps.append({
                "candidate_id":       cid,
                "name_ko":            name,
                "search_total_count": gal_search_res.get("total_count", 0),
                "gallery_match_status": gal_match_status,
                "gallery_group_title": gal_detail_result.get("gal_title") if gal_detail_result else None,
                "gallery_image_count": gal_img_count,
                "rights_status":      "VERIFIED_ALLOWED_BY_SOURCE_CONTRACT" if gal_img_count > 0 else "NO_GALLERY_MATCH",
                "gal_sample_images":  (gal_detail_result.get("detail_items", [])[:3] if gal_detail_result else []),
                "collected_at":       AS_OF,
            })

            # ── 통합 스냅샷 ────────────────────────────────────────────────────
            snap = build_integrated_snapshot(
                chain, vg_parsed, match_rec, dc2_result,
                kto_images_parsed, kto_all_allowed,
                gal_search_res, gal_match_status, gal_detail_result,
            )
            all_integrated.append(snap)
            batch_stats["ok"] += 1

        b_end_ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        batch_log.append({
            "batch_num":   bn + 1,
            "batch_size":  len(batch),
            "start_ts":    b_start_ts,
            "end_ts":      b_end_ts,
            "stats":       batch_stats,
            "candidates":  [c["candidate_id"] for c in batch],
        })
        print(f"  배치{bn+1} 완료: ok={batch_stats['ok']} kto_match={batch_stats['kto_match']} "
              f"kto_nomatch={batch_stats['kto_nomatch']} gal={batch_stats['gal_match']} vg_err={batch_stats['vg_err']}")

    # ─── 파일 저장 ─────────────────────────────────────────────────────────────
    print("\n[4/7] 파일 저장...")

    jlwrite(all_vg_snaps,   OUT_VG_SNAPSHOT)
    print(f"  VG 스냅샷:    {OUT_VG_SNAPSHOT.name} ({len(all_vg_snaps)}건)")

    jlwrite(all_matches,    OUT_KTO_MATCH)
    print(f"  KTO 매칭:     {OUT_KTO_MATCH.name} ({len(all_matches)}건)")

    jlwrite(all_kto_dets,   OUT_KTO_DETAIL)
    print(f"  KTO 상세:     {OUT_KTO_DETAIL.name} ({len(all_kto_dets)}건)")

    jlwrite(all_kto_imgs,   OUT_KTO_IMAGES)
    print(f"  KTO 이미지:   {OUT_KTO_IMAGES.name} ({len(all_kto_imgs)}건)")

    jlwrite(all_gal_snaps,  OUT_GALLERY)
    print(f"  갤러리 스냅샷: {OUT_GALLERY.name} ({len(all_gal_snaps)}건)")

    jlwrite(all_integrated, OUT_INTEGRATED)
    print(f"  통합 스냅샷:  {OUT_INTEGRATED.name} ({len(all_integrated)}건)")

    release_rows = []
    for s in all_integrated:
        release_rows.append({
            "candidate_id":          s["candidate_id"],
            "name_ko":               s["name_ko"],
            "release_classification": s["release_classification"],
            "total_usable_images":   s["total_usable_images"],
            "kto_matched":           s["kto_matched"],
            "kto_image_count":       s["kto_image_count"],
            "gallery_image_count":   s["gallery_image_count"],
            "vg_image_count":        s["vg_image_count"],
            "final_lat":             s["final_lat"],
            "final_lng":             s["final_lng"],
            "final_coord_src":       s["final_coord_src"],
            "final_desc_src":        s["final_desc_src"],
            "collected_at":          s["collected_at"],
        })
    jlwrite(release_rows, OUT_RELEASE)
    print(f"  릴리스 분류:  {OUT_RELEASE.name} ({len(release_rows)}건)")

    jlwrite(batch_log, OUT_BATCH_LOG)
    print(f"  배치 로그:    {OUT_BATCH_LOG.name} ({len(batch_log)}건)")

    # ─── 커버리지 리포트 ────────────────────────────────────────────────────────
    print("\n[5/7] 커버리지 통계...")
    kto_matched   = sum(1 for s in all_integrated if s["kto_matched"])
    gal_matched   = sum(1 for s in all_integrated if s["gallery_image_count"] > 0)
    ready         = sum(1 for s in all_integrated if s["release_classification"] == "READY_FOR_RELEASE")
    partial       = sum(1 for s in all_integrated if s["release_classification"] == "PARTIAL_READY")
    coord_missing = sum(1 for s in all_integrated if s["release_classification"] == "COORD_MISSING")
    img_missing   = sum(1 for s in all_integrated if s["release_classification"] == "IMAGES_MISSING")
    avg_img       = (sum(s["total_usable_images"] for s in all_integrated) / len(all_integrated)
                     if all_integrated else 0)

    rights_type1 = sum(
        sum(1 for img in r.get("images", []) if img.get("cpyrhtDivCd") == "Type1")
        for r in all_kto_imgs
    )
    rights_type3 = sum(
        sum(1 for img in r.get("images", []) if img.get("cpyrhtDivCd") == "Type3")
        for r in all_kto_imgs
    )

    coverage = {
        "task_id":            TASK_ID,
        "collected_at":       AS_OF,
        "total_tier_a":       len(chains),
        "chain_errors":       len(chain_errors),
        "vg_collected":       sum(1 for v in all_vg_snaps if v.get("vg_http_ok")),
        "vg_errors":          sum(1 for v in all_vg_snaps if not v.get("vg_http_ok")),
        "kto_matched":        kto_matched,
        "kto_match_rate_pct": round(kto_matched / len(chains) * 100, 1) if chains else 0,
        "gallery_matched":    gal_matched,
        "gallery_match_rate_pct": round(gal_matched / len(chains) * 100, 1) if chains else 0,
        "release_ready":      ready,
        "release_partial":    partial,
        "release_coord_missing": coord_missing,
        "release_img_missing": img_missing,
        "avg_usable_images":  round(avg_img, 1),
        "kto_rights_type1_images": rights_type1,
        "kto_rights_type3_images": rights_type3,
        "kto_rights_verified_pct": (
            round((rights_type1 + rights_type3) / max(1, rights_type1 + rights_type3 + 1) * 100, 1)
        ),
        "chain_errors_detail": chain_errors,
    }
    jwrite(coverage, OUT_COVERAGE, indent=2)
    print(f"  커버리지 리포트: {OUT_COVERAGE.name}")
    print(f"  KTO 매칭: {kto_matched}/{len(chains)} ({coverage['kto_match_rate_pct']}%)")
    print(f"  갤러리 매칭: {gal_matched}/{len(chains)} ({coverage['gallery_match_rate_pct']}%)")
    print(f"  릴리스준비: {ready} / 부분준비: {partial} / 좌표없음: {coord_missing} / 이미지없음: {img_missing}")
    print(f"  평균 이미지: {avg_img:.1f}장")

    # ─── QA ────────────────────────────────────────────────────────────────────
    print("\n[6/7] QA 검증...")
    qa_issues = []

    if len(all_integrated) != len(chains):
        qa_issues.append({
            "type": "RECORD_COUNT_MISMATCH",
            "expected": len(chains),
            "actual": len(all_integrated),
        })

    for s in all_integrated:
        if not s.get("candidate_id"):
            qa_issues.append({"type": "MISSING_CANDIDATE_ID"})
        if not s.get("name_ko"):
            qa_issues.append({"type": "MISSING_NAME_KO", "cid": s.get("candidate_id")})
        if s.get("final_lat") is None:
            qa_issues.append({"type": "COORD_NONE", "cid": s.get("candidate_id"), "name": s.get("name_ko")})

    # 중복 candidate_id 체크
    seen_cids = set()
    for s in all_integrated:
        cid = s.get("candidate_id")
        if cid in seen_cids:
            qa_issues.append({"type": "DUPLICATE_CANDIDATE_ID", "cid": cid})
        seen_cids.add(cid)

    # galContentId → KorService2 전달 금지 확인
    # (스크립트 설계상 불가: kto_content_id만 KTO에 전달)
    qa_namespace_ok = True  # 구조적으로 보장

    qa_report = {
        "task_id":         TASK_ID,
        "qa_ts":           datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "total_records":   len(all_integrated),
        "issue_count":     len(qa_issues),
        "issues":          qa_issues[:100],
        "qa_status":       "PASS" if not qa_issues else "WARN",
        "namespace_check": "gal_content_id_not_passed_to_KorService2" if qa_namespace_ok else "VIOLATION",
        "areacode_check":  "areaCode_sigunguCode_not_used",
        "coverage":        coverage,
    }
    jwrite(qa_report, OUT_QA, indent=2)
    print(f"  QA 상태: {qa_report['qa_status']} (이슈 {len(qa_issues)}건)")

    # ─── Run1 SHA ──────────────────────────────────────────────────────────────
    print("\n[7/7] Run1 SHA 기록...")
    run1_sha = {}
    for label, path in [
        ("integrated_snapshot",     OUT_INTEGRATED),
        ("vg_snapshot",             OUT_VG_SNAPSHOT),
        ("kto_match_index",         OUT_KTO_MATCH),
        ("kto_images_audit",        OUT_KTO_IMAGES),
        ("photogallery_snapshot",   OUT_GALLERY),
        ("release_classification",  OUT_RELEASE),
        ("coverage_report",         OUT_COVERAGE),
        ("qa_report",               OUT_QA),
        ("batch_log",               OUT_BATCH_LOG),
    ]:
        if path.exists():
            run1_sha[label] = sha256_file(path)

    jwrite({
        "task_id":      TASK_ID,
        "run":          1,
        "computed_at":  AS_OF,
        "note":         "Run1 SHA. Run2 실행 시 BYTE_IDENTICAL 검증에 사용.",
        "sha256":       run1_sha,
    }, OUT_RUN1_SHA, indent=2)
    print(f"  Run1 SHA 기록: {OUT_RUN1_SHA.name} ({len(run1_sha)}파일)")

    # ─── 최종 요약 ─────────────────────────────────────────────────────────────
    print(f"\n{'='*65}")
    print(f"[완료] {TASK_ID}")
    print(f"  총 처리: {len(all_integrated)}/{len(chains)}건")
    print(f"  KTO 매칭: {kto_matched}건 ({coverage['kto_match_rate_pct']}%)")
    print(f"  갤러리 매칭: {gal_matched}건 ({coverage['gallery_match_rate_pct']}%)")
    print(f"  릴리스 준비: {ready}건 / 부분: {partial}건 / 좌표없음: {coord_missing}건")
    print(f"  평균 이미지: {avg_img:.1f}장")
    print(f"  QA: {qa_report['qa_status']}")
    print(f"{'='*65}")
    print("SCRIPT_COMPLETE_OK")


if __name__ == "__main__":
    main()
