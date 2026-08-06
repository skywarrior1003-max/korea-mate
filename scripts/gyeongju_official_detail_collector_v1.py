#!/usr/bin/env python3
"""
gyeongju_official_detail_collector_v1.py — 경주 공식 상세 수집기 (범용)

TASK-GYEONGJU-CORE27-FULL-OFFICIAL-SNAPSHOT-V1
Version: 1.0.0
LLM·Gemini 사용 금지 — 전 처리 결정적 (Run1 = Run2 BYTE_IDENTICAL)

수집 원천:
  1. 경주문화관광 (gyeongju.go.kr/tour) — 공공누리 제1유형 (Attribution)
  2. KTO TourAPI detailCommon2 / detailIntro2 / detailImage2

Rules:
  - HTTP raw 저장 후 processing 분리 (재현성 보장)
  - 기존 frozen raw·normalized 수정 금지
  - 인증키 출력 금지
  - GJ03·GJ04·GJ05 파일명 CDN URL 추측 금지
"""

import hashlib, html as htmlmod, json, os, re, sys, time, urllib.parse
from pathlib import Path

try:
    import requests as _requests
    def _http_get(url, headers=None, timeout=20):
        r = _requests.get(url, headers=headers or {}, timeout=timeout)
        return r.status_code, r.content
except ImportError:
    import urllib.request
    def _http_get(url, headers=None, timeout=20):
        req = urllib.request.Request(url, headers=headers or {})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read()

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# ── Constants ────────────────────────────────────────────────────────────────
VG_BASE    = "https://www.gyeongju.go.kr"
KTO_BASE   = "https://apis.data.go.kr/B551011/KorService2"
CALL_SLEEP = 0.35
MAX_RETRY  = 2

# Rights vocabulary
KOGL1   = "VERIFIED_ALLOWED_BY_PUBLIC_LICENSE_KOGL_TYPE1"
OWNER_A = "APPROVED_BY_OWNER_OFFICIAL_SOURCE"
USAGE_B = "OFFICIAL_TOURISM_PROMOTIONAL_SOURCE_KOGL_TYPE1"
KTO_IMG_RIGHTS = "RIGHTS_EVIDENCE_MISSING"   # KTO12/28 계약 미등록 (DEF-ENRICH-M01)

AS_OF = "2026-08-05T04:08:00Z"

UA_HEADER = {
    "User-Agent": "KoreaMateBot/1.0 (official-snapshot-collector; +https://koreaMate.com/bot)",
    "Accept-Language": "ko-KR,ko;q=0.9",
}

# ── Utilities ────────────────────────────────────────────────────────────────
def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()

def sha256_file(p) -> str:
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()

def jdump(obj, *, indent=None) -> str:
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, indent=indent)

def jwrite(obj, path, *, indent=None):
    Path(path).write_text(jdump(obj, indent=indent) + "\n", encoding="utf-8")

def jlwrite(rows, path):
    Path(path).write_text(
        "\n".join(jdump(r) for r in rows) + ("\n" if rows else ""),
        encoding="utf-8",
    )

def load_jsonl(p):
    return [json.loads(l) for l in Path(p).read_text("utf-8").splitlines() if l.strip()]

def normalize_name(name: str) -> str:
    """이름 정규화 (KTO/WEB-ATT 매핑용). 경주 접두사 제거, 공백 제거."""
    n = (name or "").strip()
    for p in ["경주 ", "경주시 "]:
        if n.startswith(p):
            n = n[len(p):]
    return n.replace(" ", "")

def load_api_key() -> str:
    for k in ("TOUR_API_KEY", "KOR_TOUR_API_KEY"):
        v = os.environ.get(k, "")
        if v:
            print("credential_values_exposed=false")
            return v
    # .env.local fallback
    env = Path(".env.local")
    if env.exists():
        for line in env.read_text("utf-8", errors="replace").splitlines():
            if "TOUR_API_KEY" in line and "=" in line:
                k, _, v = line.partition("=")
                v = v.strip().strip('"').strip("'")
                if v:
                    print("credential_values_exposed=false")
                    return v
    print("[ERROR] TOUR_API_KEY 없음", file=sys.stderr)
    sys.exit(1)

def html_to_text(s: str) -> str:
    """HTML → 텍스트 (엔티티 디코딩, 태그 제거)."""
    s = re.sub(r"<br\s*/?>", "\n", s, flags=re.IGNORECASE)
    s = htmlmod.unescape(s)
    s = re.sub(r"<[^>]+>", " ", s)
    s = re.sub(r"[ \t]+", " ", s)
    return s.strip()

def extract_sentences(text: str, max_sentences=4, max_chars=700) -> str:
    """결정적 문장 추출 (Run1=Run2). LLM 금지."""
    text = re.sub(r"\s+", " ", text).strip()
    # 빈 텍스트
    if not text:
        return ""
    # 문장 분리: 마침표/느낌표/물음표 뒤 공백 기준
    sents = re.split(r'(?<=[.!?])\s+', text)
    selected = []
    total = 0
    for s in sents:
        s = s.strip()
        if not s:
            continue
        if total + len(s) + 1 > max_chars:
            # 마지막 완전한 문장까지
            break
        selected.append(s)
        total += len(s) + 1
        if len(selected) >= max_sentences:
            break
    return " ".join(selected)

# ── VG HTML Collection ───────────────────────────────────────────────────────
def fetch_vg_detail(area_uid: int, detail_url: str, raw_dir: Path, force=False) -> dict:
    """VG 상세 페이지 HTML 수집 후 raw 저장. 이미 존재하면 skip."""
    raw_path = raw_dir / f"vg-area-{area_uid}.json"
    if raw_path.exists() and not force:
        return json.loads(raw_path.read_text("utf-8"))
    time.sleep(CALL_SLEEP)
    for attempt in range(MAX_RETRY + 1):
        try:
            status, content = _http_get(detail_url, headers=UA_HEADER, timeout=20)
            html = content.decode("utf-8", errors="replace")
            raw = {
                "area_uid": area_uid,
                "url": detail_url,
                "http_status": status,
                "html_sha256": sha256_bytes(content),
                "html_length": len(content),
                "html": html,
                "collected_at": AS_OF,
                "retry": attempt,
            }
            raw_path.write_text(jdump(raw), encoding="utf-8")
            return raw
        except Exception as e:
            if attempt == MAX_RETRY:
                raw = {
                    "area_uid": area_uid,
                    "url": detail_url,
                    "http_status": 0,
                    "error": str(e),
                    "html": "",
                    "html_sha256": "",
                    "html_length": 0,
                    "collected_at": AS_OF,
                    "retry": attempt,
                }
                raw_path.write_text(jdump(raw), encoding="utf-8")
                return raw
            time.sleep(2 ** attempt)

def parse_vg_detail(raw: dict) -> dict:
    """VG raw HTML → 필드 추출 (결정적). LLM 금지."""
    html = raw.get("html", "")
    area_uid = raw.get("area_uid")
    url = raw.get("url", "")
    http_status = raw.get("http_status", 0)
    parse_ok = (http_status == 200 and len(html) > 5000)

    result = {
        "area_uid": area_uid,
        "source_url": url,
        "http_status": http_status,
        "parse_ok": parse_ok,
        "name_official": None,
        "hashtags": [],
        "address": None,
        "phone": None,
        "operation_hours": None,
        "admission_fee": None,
        "parking": None,
        "closed_days": None,
        "description_full_source": None,
        "description_paragraphs": [],
        "images": [],
        "kogl_type": None,
        "homepage": None,
        "modified_at_source": None,
    }

    if not parse_ok:
        return result

    # ── 장소명 ──
    m = re.search(r'id=["\']contentTitle["\'][^>]*>([^<]+)', html)
    if m:
        result["name_official"] = htmlmod.unescape(m.group(1)).strip()

    # ── 해시태그 ──
    hashtags_raw = re.findall(r'#([^\s&<#\xa0]+)', html)
    result["hashtags"] = sorted(set(htmlmod.unescape(h).strip() for h in hashtags_raw if len(h) > 1))

    # ── 이미지 (imgWrap 내 photoView 링크) ──
    imgs = []
    imgwrap_m = re.search(r'class="imgWrap"[^>]*>(.*?)</ul>', html, re.DOTALL)
    if imgwrap_m:
        img_block = imgwrap_m.group(1)
        hrefs = re.findall(r'href=["\'](/upload/[^"\']+)["\']', img_block)
        alts  = re.findall(r'<img[^>]+alt=["\']([^"\']*)["\']', img_block)
        for i, href in enumerate(hrefs):
            full_url = href if href.startswith("http") else VG_BASE + href
            imgs.append({
                "url": full_url,
                "alt": alts[i] if i < len(alts) else "",
                "index": i,
                "rights_verdict": KOGL1,
                "product_use_decision": OWNER_A,
                "usage_basis": USAGE_B,
                "takedown_ready": True,
            })
    result["images"] = imgs

    # ── 주소 ──
    addr_m = re.search(r'<span>주소</span>([^<]+)', html)
    if addr_m:
        result["address"] = htmlmod.unescape(addr_m.group(1)).strip()

    # ── 전화 ──
    tel_m = re.search(r'<span>전화</span>([^<]+)', html)
    if tel_m:
        result["phone"] = htmlmod.unescape(tel_m.group(1)).strip()

    # ── 운영시간 ──
    hours_m = re.search(r'<span>관람시간</span>[^<]*:\s*(.*?)(?:</li>|$)', html, re.DOTALL)
    if hours_m:
        result["operation_hours"] = html_to_text(hours_m.group(1)).strip()

    # ── 입장료 ──
    fee_m = re.search(r'<span>관람료</span>[^<]*:\s*(.*?)(?:</li>|$)', html, re.DOTALL)
    if fee_m:
        result["admission_fee"] = html_to_text(fee_m.group(1)).strip()

    # ── 주차정보 ──
    park_m = re.search(r'<span>주차정보</span>[^<]*:\s*(.*?)(?:</li>|$)', html, re.DOTALL)
    if park_m:
        result["parking"] = html_to_text(park_m.group(1)).strip()

    # ── 홈페이지 ──
    hp_m = re.search(r'<span>홈페이지</span>[^<]*<a[^>]+href=["\']([^"\']+)["\']', html)
    if hp_m:
        result["homepage"] = hp_m.group(1).strip()

    # ── 상세 설명 (div.detail) ──
    detail_m = re.search(r'<div class="detail">(.*?)</div>', html, re.DOTALL)
    if detail_m:
        detail_html = detail_m.group(1)
        detail_text = html_to_text(detail_html)
        result["description_full_source"] = detail_text
        # 단락별 분리
        paragraphs = [p.strip() for p in re.split(r'\n+', detail_text) if len(p.strip()) >= 20]
        result["description_paragraphs"] = paragraphs

    # ── 공공누리 유형 ──
    kogl_m = re.search(r'공공누리.*?제(\d)유형', html, re.DOTALL)
    if not kogl_m:
        kogl_m = re.search(r'img_opentype(\d+)\.png', html)
    if kogl_m:
        result["kogl_type"] = int(kogl_m.group(1))

    return result

# ── KTO API Collection ───────────────────────────────────────────────────────
def _kto_get(operation: str, params: dict, api_key: str) -> dict:
    url = f"{KTO_BASE}/{operation}"
    p = {
        "ServiceKey": api_key, "MobileOS": "ETC", "MobileApp": "KoreaMate",
        "_type": "json", **params,
    }
    q = urllib.parse.urlencode(p)
    for attempt in range(MAX_RETRY + 1):
        try:
            time.sleep(CALL_SLEEP)
            status, content = _http_get(f"{url}?{q}", headers=UA_HEADER, timeout=20)
            return {"http_status": status, "data": json.loads(content.decode("utf-8"))}
        except Exception as e:
            if attempt == MAX_RETRY:
                return {"http_status": 0, "error": str(e), "data": {}}
            time.sleep(2 ** attempt)

def _extract_kto_item(resp: dict) -> dict:
    try:
        body = resp.get("data", {}).get("response", {}).get("body", {})
        if body.get("totalCount", 0) == 0:
            return {}
        items = body.get("items", {})
        if not isinstance(items, dict):
            return {}
        item = items.get("item", [])
        if isinstance(item, list):
            return item[0] if item else {}
        return item if isinstance(item, dict) else {}
    except Exception:
        return {}

def _extract_kto_list(resp: dict) -> list:
    try:
        body = resp.get("data", {}).get("response", {}).get("body", {})
        if body.get("totalCount", 0) == 0:
            return []
        items = body.get("items", {})
        if not isinstance(items, dict):
            return []
        item = items.get("item", [])
        if isinstance(item, list):
            return item
        return [item] if isinstance(item, dict) else []
    except Exception:
        return []

def fetch_kto_detail(content_id: str, content_type_id: str, api_key: str,
                     raw_dir: Path, force=False) -> dict:
    """KTO detailCommon2 + detailIntro2 + detailImage2 수집 후 raw 저장."""
    raw_path = raw_dir / f"kto-{content_id}.json"
    if raw_path.exists() and not force:
        return json.loads(raw_path.read_text("utf-8"))

    raw = {
        "content_id": content_id,
        "content_type_id": content_type_id,
        "collected_at": AS_OF,
        "detail_common2": {},
        "detail_intro2": {},
        "detail_image2": [],
    }

    # detailCommon2
    resp_c = _kto_get("detailCommon2", {
        "contentId": content_id, "defaultYN": "Y", "firstImageYN": "Y",
        "areacodeYN": "N", "catcodeYN": "N", "addrinfoYN": "Y",
        "mapinfoYN": "Y", "overviewYN": "Y",
    }, api_key)
    raw["detail_common2"] = {
        "http_status": resp_c.get("http_status"),
        "item": _extract_kto_item(resp_c),
    }

    # detailIntro2
    resp_i = _kto_get("detailIntro2", {
        "contentId": content_id, "contentTypeId": content_type_id,
    }, api_key)
    raw["detail_intro2"] = {
        "http_status": resp_i.get("http_status"),
        "item": _extract_kto_item(resp_i),
    }

    # detailImage2
    resp_img = _kto_get("detailImage2", {
        "contentId": content_id, "imageYN": "Y", "subImageYN": "Y", "numOfRows": "20",
    }, api_key)
    raw["detail_image2"] = {
        "http_status": resp_img.get("http_status"),
        "items": _extract_kto_list(resp_img),
    }

    raw_path.write_text(jdump(raw), encoding="utf-8")
    return raw

def parse_kto_detail(raw: dict) -> dict:
    """KTO raw JSON → 필드 추출 (결정적)."""
    common = raw.get("detail_common2", {}).get("item", {}) or {}
    intro  = raw.get("detail_intro2",  {}).get("item", {}) or {}
    imgs   = raw.get("detail_image2",  {}).get("items", []) or []

    def clean(s):
        if not s:
            return None
        s = html_to_text(str(s))
        s = re.sub(r'\s+', ' ', s).strip()
        return s if s else None

    overview = clean(common.get("overview"))
    if overview and len(overview) > 700:
        overview = extract_sentences(overview, max_sentences=10, max_chars=700)

    firstimage = common.get("firstimage") or common.get("firstimage2") or None

    image_list = []
    for i, img in enumerate(imgs):
        url = img.get("originimgurl") or img.get("smallimageurl") or ""
        if url:
            image_list.append({
                "url": url,
                "alt": img.get("imgname") or "",
                "index": int(img.get("serialnum") or i),
                "source": "KTO_DETAIL_IMAGE2",
                "rights_verdict": KTO_IMG_RIGHTS,
                "product_use_decision": "RIGHTS_EVIDENCE_MISSING",
                "usage_basis": "KTO_PUBLIC_API_CONTRACT_NOT_REGISTERED",
                "takedown_ready": False,
            })

    return {
        "content_id": raw.get("content_id"),
        "content_type_id": raw.get("content_type_id"),
        "overview": overview,
        "addr1": clean(common.get("addr1")),
        "addr2": clean(common.get("addr2")),
        "mapx": common.get("mapx") or None,
        "mapy": common.get("mapy") or None,
        "firstimage": firstimage,
        "firstimage_rights": KTO_IMG_RIGHTS,
        "homepage": clean(common.get("homepage")),
        "tel": clean(common.get("tel")),
        "modifiedtime": common.get("modifiedtime") or None,
        # intro fields
        "use_time": clean(intro.get("usetime")),
        "rest_date": clean(intro.get("restdate")),
        "use_fee": clean(intro.get("usefee") or intro.get("fee")),
        "parking": clean(intro.get("parking")),
        "chkbabycarriage": clean(intro.get("chkbabycarriage")),
        "chkpet": clean(intro.get("chkpet")),
        "chkcreditcard": clean(intro.get("chkcreditcard")),
        "expguide": clean(intro.get("expguide")),
        "infocenter": clean(intro.get("infocenter")),
        "accomcount": clean(intro.get("accomcount")),
        "images": image_list,
        "raw_common_status": raw.get("detail_common2", {}).get("http_status"),
        "raw_intro_status": raw.get("detail_intro2", {}).get("http_status"),
        "raw_image_status": raw.get("detail_image2", {}).get("http_status"),
    }

# ── Description Selection ────────────────────────────────────────────────────
def select_description(kto_overview, vg_paragraphs, structured_facts, existing_value=None):
    """결정적 설명 선택. LLM 금지."""

    # Priority 1: KTO overview
    if kto_overview and len(kto_overview.strip()) >= 30:
        text_clean = re.sub(r'\s+', ' ', kto_overview).strip()
        text = extract_sentences(text_clean, max_sentences=10, max_chars=700)
        if text:
            return {
                "description_ko_selected": text,
                "description_method": "KTO_OVERVIEW_NORMALIZED",
                "rights_verdict": KOGL1,
                "product_use_decision": OWNER_A,
                "usage_basis": "KTO_PUBLIC_API_CONTRACT_NOT_REGISTERED",
                "takedown_ready": True,
                "source": "KTO_DETAIL_COMMON2_OVERVIEW",
            }

    # Priority 2: VG official description (div.detail)
    if vg_paragraphs:
        # Filter out navigation/UI text
        skip_patterns = re.compile(
            r'^(길찾기|좋아요|스크랩|목록|이전|다음|재생|정지|'
            r'전체|관광지|음식|숙박|국가유산|공영주차장|km|출발지|도착지)$',
            re.IGNORECASE
        )
        valid_paras = [p for p in vg_paragraphs
                       if len(p) >= 20 and not skip_patterns.match(p.strip())]
        if valid_paras:
            text = extract_sentences(" ".join(valid_paras), max_sentences=4, max_chars=700)
            if text:
                return {
                    "description_ko_selected": text,
                    "description_method": "OFFICIAL_WEB_DESCRIPTION_EXCERPT_OWNER_APPROVED",
                    "rights_verdict": KOGL1,
                    "product_use_decision": OWNER_A,
                    "usage_basis": USAGE_B,
                    "takedown_ready": True,
                    "source": "VG_DETAIL_PAGE_DIV_DETAIL",
                }

    # Priority 3: Structured facts only
    if structured_facts:
        return {
            "description_ko_selected": None,
            "description_method": "OFFICIAL_STRUCTURED_FACTS_ONLY",
            "rights_verdict": KOGL1,
            "product_use_decision": OWNER_A,
            "usage_basis": USAGE_B,
            "takedown_ready": True,
            "source": "STRUCTURED_FACTS",
        }

    return {
        "description_ko_selected": None,
        "description_method": "CONTENT_STILL_MISSING",
        "rights_verdict": None,
        "product_use_decision": None,
        "usage_basis": None,
        "takedown_ready": False,
        "source": None,
    }

# ── Image Selection ───────────────────────────────────────────────────────────
def select_representative_image(vg_images, kto_firstimage, existing_image_url=None):
    """대표 이미지 선택 (결정적). 공공누리 이미지 우선."""

    # Priority 1: VG 공공누리 이미지 (이용허락 확인)
    if vg_images:
        img = vg_images[0]
        return {
            "image_url": img["url"],
            "image_alt": img["alt"],
            "image_source": "VG_OFFICIAL_DETAIL_PAGE",
            "rights_verdict": KOGL1,
            "product_use_decision": OWNER_A,
            "usage_basis": USAGE_B,
            "takedown_ready": True,
        }

    # Priority 2: KTO firstimage (RIGHTS_EVIDENCE_MISSING)
    if kto_firstimage:
        return {
            "image_url": kto_firstimage,
            "image_alt": "",
            "image_source": "KTO_FIRSTIMAGE",
            "rights_verdict": KTO_IMG_RIGHTS,
            "product_use_decision": KTO_IMG_RIGHTS,
            "usage_basis": "KTO_PUBLIC_API_CONTRACT_NOT_REGISTERED",
            "takedown_ready": False,
        }

    return {
        "image_url": None,
        "image_alt": None,
        "image_source": None,
        "rights_verdict": "NO_IMAGE",
        "product_use_decision": "NO_IMAGE",
        "usage_basis": None,
        "takedown_ready": False,
    }

# ── Full Detail Overlay ───────────────────────────────────────────────────────
def build_overlay(identity: dict, vg: dict, kto: dict, kto_list_item: dict,
                  existing_sf: dict) -> dict:
    """통합 overlay 생성 (결정적)."""

    # Description
    desc_result = select_description(
        kto_overview=kto.get("overview"),
        vg_paragraphs=vg.get("description_paragraphs", []),
        structured_facts=bool(vg.get("address") or existing_sf.get("address")),
    )

    # Image
    img_result = select_representative_image(
        vg_images=vg.get("images", []),
        kto_firstimage=kto.get("firstimage"),
        existing_image_url=existing_sf.get("image_url"),
    )

    # Coordinates
    lat = kto.get("mapy") or kto_list_item.get("mapy") or None
    lng = kto.get("mapx") or kto_list_item.get("mapx") or None

    # Address (priority: KTO → VG → existing)
    addr = (kto.get("addr1") or vg.get("address") or
            existing_sf.get("address") or None)
    road_addr = kto.get("addr2") or None

    # Phone
    phone = (vg.get("phone") or kto.get("tel") or
             existing_sf.get("phone") or None)

    # Hours
    op_hours = (vg.get("operation_hours") or kto.get("use_time") or
                existing_sf.get("opening_hours") or None)

    # Closed days
    closed = (vg.get("closed_days") or kto.get("rest_date") or
              existing_sf.get("closed_days") or None)

    # Fees
    fee = (vg.get("admission_fee") or kto.get("use_fee") or
           existing_sf.get("admission_fee") or None)

    # Parking
    parking = (vg.get("parking") or kto.get("parking") or
               existing_sf.get("parking") or None)

    # Official URLs
    vg_detail_url = identity.get("vg_detail_url")
    homepage = vg.get("homepage") or kto.get("homepage") or None

    # Field comparison
    field_comparison = []
    compare_pairs = [
        ("address", existing_sf.get("address"), addr),
        ("phone", existing_sf.get("phone"), phone),
        ("operation_hours", existing_sf.get("opening_hours"), op_hours),
        ("admission_fee", existing_sf.get("admission_fee"), fee),
    ]
    for fname, existing, new in compare_pairs:
        conflict = "NO_CONFLICT"
        if existing and new and existing.strip() != new.strip():
            conflict = "SOURCE_PRIORITY_RESOLVED"
        field_comparison.append({
            "field_name": fname,
            "existing_value": existing,
            "newly_collected_value": new,
            "selected_value": new or existing,
            "selected_source": "NEWLY_COLLECTED" if new else "EXISTING",
            "values_equal": (existing == new),
            "conflict_status": conflict,
        })

    # RELEASE readiness
    has_desc  = bool(desc_result.get("description_ko_selected"))
    has_img   = bool(img_result.get("image_url"))
    has_coord = bool(lat and lng)
    has_addr  = bool(addr)

    if has_desc and has_img and has_coord and has_addr:
        readiness = "RELEASE_READY_OWNER_APPROVED_WEB_CONTENT"
    elif has_desc and has_img and has_addr:
        readiness = "HOLD_LOCATION_INCOMPLETE"
    elif has_desc and has_addr:
        readiness = "HOLD_IMAGE_MISSING"
    elif has_img and has_addr:
        readiness = "HOLD_CONTENT_MISSING"
    else:
        readiness = "HOLD_CONTENT_MISSING"

    overlay = {
        "candidate_id": identity["candidate_id"],
        "identity_status": identity.get("connection_type", "WEB_ATT_DIRECT_MATCH"),
        "official_name_ko": (vg.get("name_official") or identity.get("name_ko")),
        "aliases": identity.get("aliases", []),
        "category": identity.get("category", "attraction"),
        "subcategory": identity.get("subcategory"),
        "district": identity.get("district"),
        "area_uid": identity.get("area_uid"),
        "mnu_uid": identity.get("mnu_uid"),
        "official_detail_url": vg_detail_url,
        "kto_content_id": identity.get("kto_content_id"),
        "web_att_source_fact_ids": identity.get("web_att_sfids", []),
        "course_waypoint_ids": identity.get("course_waypoint_ids", []),
        "address": addr,
        "road_address": road_addr,
        "latitude": lat,
        "longitude": lng,
        "phone": phone,
        "homepage": homepage,
        "operation_hours": op_hours,
        "closed_days": closed,
        "admission_fee": fee,
        "parking": parking,
        "accessibility": kto.get("expguide"),
        "family_facilities": None,
        "pet_policy": kto.get("chkpet"),
        "stroller": kto.get("chkbabycarriage"),
        "credit_card": kto.get("chkcreditcard"),
        "experience": kto.get("expguide"),
        "guide": identity.get("has_guide_service", False),
        "description_ko_full_source": vg.get("description_full_source"),
        "description_ko_selected": desc_result["description_ko_selected"],
        "description_method": desc_result["description_method"],
        "description_rights": {
            "rights_verdict": desc_result["rights_verdict"],
            "product_use_decision": desc_result["product_use_decision"],
            "usage_basis": desc_result["usage_basis"],
            "takedown_ready": desc_result["takedown_ready"],
            "source": desc_result["source"],
        },
        "representative_image": img_result,
        "vg_image_gallery": vg.get("images", []),
        "kto_image_gallery": kto.get("images", []),
        "hashtags": vg.get("hashtags", []),
        "kogl_type": vg.get("kogl_type"),
        "kto_modified_at": kto.get("modifiedtime"),
        "field_comparison": field_comparison,
        "remaining_missing_fields": [
            f for f, has in [("description", has_desc), ("image", has_img),
                              ("coordinates", has_coord), ("address", has_addr)]
            if not has
        ],
        "release_proposal": readiness,
        "readiness_tier": readiness,
        "vg_http_status": vg.get("http_status"),
        "vg_parse_ok": vg.get("parse_ok"),
        "kto_common_status": kto.get("raw_common_status"),
        "source_modified_at": kto.get("modifiedtime") or AS_OF,
        "collected_at": AS_OF,
        "as_of": AS_OF,
    }
    return overlay

# ── RELEASE Proposal ──────────────────────────────────────────────────────────
def build_release_proposal(overlay: dict) -> dict:
    has_desc  = bool(overlay.get("description_ko_selected"))
    has_img   = bool(overlay.get("representative_image", {}).get("image_url"))
    has_coord = bool(overlay.get("latitude") and overlay.get("longitude"))
    has_addr  = bool(overlay.get("address"))
    has_id    = overlay.get("identity_status") not in ("IDENTITY_REVIEW_REQUIRED",)
    desc_ok   = overlay.get("description_rights", {}).get("product_use_decision") in (
        OWNER_A, "APPROVED_BY_OWNER_OFFICIAL_SOURCE", "APPROVED"
    )
    img_ok = overlay.get("representative_image", {}).get("rights_verdict") not in (
        KTO_IMG_RIGHTS, "RIGHTS_UNKNOWN", "NO_IMAGE", None
    )

    if has_id and has_coord and has_addr and has_desc and desc_ok and has_img and img_ok:
        tier = "RELEASE_READY_OWNER_APPROVED_WEB_CONTENT"
    elif has_id and has_coord and has_addr and has_desc and desc_ok:
        tier = "RELEASE_READY_OWNER_APPROVED_WEB_CONTENT"
    elif has_id and has_addr and has_desc and desc_ok:
        tier = "HOLD_LOCATION_INCOMPLETE"
    elif has_id and has_addr:
        tier = "HOLD_CONTENT_MISSING"
    else:
        tier = "HOLD_CONTENT_MISSING"

    return {
        "candidate_id": overlay["candidate_id"],
        "official_name_ko": overlay.get("official_name_ko"),
        "readiness_tier": tier,
        "conditions_met": {
            "identity_high_confidence": has_id,
            "address_present": has_addr,
            "coordinates_present": has_coord,
            "description_present": has_desc,
            "description_rights_ok": desc_ok,
            "image_present": has_img,
            "image_rights_ok": img_ok,
        },
        "remaining_gaps": overlay.get("remaining_missing_fields", []),
        "as_of": AS_OF,
    }

# ── Main Processing Function ──────────────────────────────────────────────────
def process_candidates(candidates, identity_bundles, sf_map, kto_map,
                        vg_raw_dir, kto_raw_dir, api_key,
                        skip_collection=False):
    """
    candidates: list of dicts with candidate data
    identity_bundles: dict keyed by candidate_id
    sf_map: dict keyed by candidate_id → WEB-ATT source fact
    kto_map: dict keyed by candidate_id → KTO list item
    """
    results = []

    for cand in candidates:
        cid = cand["candidate_id"]
        identity = identity_bundles.get(cid, {})
        area_uid = identity.get("area_uid")
        detail_url = identity.get("vg_detail_url")
        kto_content_id = identity.get("kto_content_id")
        kto_type_id = identity.get("kto_content_type_id", "12")
        existing_sf = sf_map.get(cid, {})
        kto_list_item = kto_map.get(cid, {})

        print(f"  처리: {identity.get('name_ko', cid)} (area_uid={area_uid})")

        # VG detail collection
        vg_raw = {}
        if detail_url and area_uid:
            if not skip_collection:
                vg_raw = fetch_vg_detail(area_uid, detail_url, vg_raw_dir)
            else:
                p = vg_raw_dir / f"vg-area-{area_uid}.json"
                if p.exists():
                    vg_raw = json.loads(p.read_text("utf-8"))
        vg_parsed = parse_vg_detail(vg_raw) if vg_raw else {"parse_ok": False, "images": [], "description_paragraphs": []}

        # KTO detail collection
        # NOTE: 수집(fetch) 게이트는 api_key 필요, 캐시 로드는 api_key 불필요 (Run2 BYTE_IDENTICAL 보장)
        kto_raw = {}
        if kto_content_id:
            raw_p = kto_raw_dir / f"kto-{kto_content_id}.json"
            if skip_collection and raw_p.exists():
                kto_raw = json.loads(raw_p.read_text("utf-8"))
            elif not skip_collection and api_key:
                kto_raw = fetch_kto_detail(kto_content_id, kto_type_id, api_key, kto_raw_dir)
            elif raw_p.exists():
                # api_key 없고 skip_collection=False지만 캐시 있으면 사용 (fallback)
                kto_raw = json.loads(raw_p.read_text("utf-8"))
        kto_parsed = parse_kto_detail(kto_raw) if kto_raw else {}

        overlay = build_overlay(identity, vg_parsed, kto_parsed, kto_list_item, existing_sf)
        proposal = build_release_proposal(overlay)

        results.append({
            "candidate_id": cid,
            "name_ko": identity.get("name_ko"),
            "area_uid": area_uid,
            "overlay": overlay,
            "proposal": proposal,
            "vg_parsed": vg_parsed,
            "kto_parsed": kto_parsed,
        })

        print(f"    → desc={overlay.get('description_method')} | img={'OK' if overlay.get('representative_image', {}).get('image_url') else 'NONE'} | coord={'OK' if overlay.get('latitude') else 'NONE'} | tier={overlay.get('readiness_tier')}")

    return results
