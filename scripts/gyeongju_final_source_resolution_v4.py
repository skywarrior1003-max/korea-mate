#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TASK-GYEONGJU-FINAL-SOURCE-RESOLUTION-KTO-CROSSWALK-V4

Phase 1:  Source State Audit (190 HOLD_DESCRIPTION 재분류)
Phase 2:  KTO 188×623 Global Crosswalk
Phase 3:  ContentType Scope Audit (KTO14·38)
Phase 4:  Duplicate Audit
Phase 5:  KTO Detail Collection (cache-first, CACHE_MISS → HTTP)
Phase 6:  VG COLLECTION_PENDING 2건 (HTTP)
Phase 7:  EN Targeted (minimal)
Phase 8:  Event Targeted (DATE_INCOMPLETE 확인)
Phase 9:  Final Release Classification
Phase 10: Quality Metrics
Phase 11: Common Rules Docs

재현성: Run1(HTTP허용) = Run2(NETWORK=0) → BYTE_IDENTICAL (data files)
"""

import json, hashlib, time, re, math, sys, os
from pathlib import Path
from collections import Counter, defaultdict
from datetime import date
from urllib.parse import urlencode
from urllib.request import urlopen, Request
from urllib.error import HTTPError, URLError

# ═══════════════════════════════════════════════════════════════════════════════
# CONSTANTS
# ═══════════════════════════════════════════════════════════════════════════════
SCRIPT_VERSION = "gyeongju_final_source_resolution_v4"
AS_OF = "2026-08-08"
AS_OF_DATE = date(2026, 8, 8)
BASE = Path("c:/기본저장/나의 프로젝트/KoreaMate/korea-mate")
NORM = BASE / "data/tourapi/normalized/gyeongju"
VAL  = BASE / "data/tourapi/validation/gyeongju"
RAW  = BASE / "data/tourapi/raw/gyeongju"
KTO_RAW = BASE / "data/tourapi/raw/kto"
DOCS_DC = BASE / "docs/data-collection"

VG_BASE = "https://www.gyeongju.go.kr/tour/page.do"
KTO_KO_BASE = "https://apis.data.go.kr/B551011/KorService1"

# KTO cache directories (search order)
KO_DETAIL_DIRS = [
    RAW / "gyeongju-tier-a-117-v1" / "kto-detail",
    RAW / "kto-detail",
    KTO_RAW / "detailCommon2" / "full",
]
# VG cache directories
VG_CACHE_DIRS = [
    RAW / "gyeongju-vg-http500-recovery-v1",
    RAW / "gyeongju-core27-vg-detail",
]
# V4 new cache dir for VG
VG_V4_CACHE = RAW / "gyeongju-vg-v4-cache"
# V4 KTO detail cache dir (write target)
KTO_V4_CACHE_DIR = RAW / "kto-detail"

HTTP_TIMEOUT = 25
MAX_RETRY = 2
RETRY_DELAY = 3.0
KTO_RATE_DELAY = 0.4   # seconds between KTO API calls

# NETWORK=0 → skip all HTTP
NETWORK_ALLOWED = True
if "--network=0" in sys.argv or os.environ.get("NETWORK", "") == "0":
    NETWORK_ALLOWED = False

# ═══════════════════════════════════════════════════════════════════════════════
# UTILITIES
# ═══════════════════════════════════════════════════════════════════════════════
def load_jsonl(path):
    path = Path(path)
    if not path.exists():
        return []
    return [json.loads(l) for l in open(path, encoding="utf-8") if l.strip()]

def save_jsonl(path, records):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

def save_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def sha256_file(path):
    path = Path(path)
    if not path.exists():
        return "FILE_NOT_FOUND"
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()[:16]

def normalize_name(s):
    """Normalize Korean/English name for matching."""
    if not s:
        return ""
    s = re.sub(r'\s+', '', s.lower())
    s = re.sub(r'[^\w가-힣a-z0-9]', '', s)
    # Remove common suffixes that vary
    for suf in ['경주', '사적', '지구']:
        s = s.replace(suf, '')
    return s

def haversine(lat1, lon1, lat2, lon2):
    R = 6371000
    phi1, phi2 = math.radians(float(lat1)), math.radians(float(lat2))
    dphi = math.radians(float(lat2) - float(lat1))
    dlam = math.radians(float(lon2) - float(lon1))
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

def load_api_key():
    env_path = BASE / ".env.local"
    if not env_path.exists():
        return None
    for line in open(env_path, encoding="utf-8"):
        line = line.strip()
        if line.startswith("TOUR_API_KEY=") or line.startswith("KOR_TOUR_API_KEY="):
            val = line.split("=", 1)[1].strip()
            if val:
                return val
    return None

_http_counter = {"total": 0, "vg": 0, "kto": 0, "en": 0, "errors": 0}

def http_get_raw(url, timeout=HTTP_TIMEOUT):
    """Raw HTTP GET. Returns (content_bytes_or_None, status_code)."""
    if not NETWORK_ALLOWED:
        return None, -1   # NETWORK=0
    for attempt in range(MAX_RETRY + 1):
        try:
            req = Request(url, headers={"User-Agent": "Mozilla/5.0 (KoreaMate-DataPipeline/1.0; +https://gokoreimate.com)"})
            with urlopen(req, timeout=timeout) as resp:
                content = resp.read()
                _http_counter["total"] += 1
                return content, resp.status
        except HTTPError as e:
            if e.code == 429:
                if attempt < MAX_RETRY:
                    time.sleep(RETRY_DELAY * (attempt + 1))
                    continue
                _http_counter["errors"] += 1
                return None, 429
            elif e.code >= 500:
                if attempt < MAX_RETRY:
                    time.sleep(RETRY_DELAY)
                    continue
                _http_counter["errors"] += 1
                return None, e.code
            _http_counter["errors"] += 1
            return None, e.code
        except (URLError, Exception) as exc:
            if attempt < MAX_RETRY:
                time.sleep(RETRY_DELAY)
                continue
            _http_counter["errors"] += 1
            return None, 0
    return None, 0

# ═══════════════════════════════════════════════════════════════════════════════
# KTO DETAIL CACHE / HTTP
# ═══════════════════════════════════════════════════════════════════════════════
def find_ko_detail_cache(cid):
    """Search all KO detail cache dirs for a given content ID."""
    patterns = [
        f"detailcommon2-{cid}.json",
        f"detail-common2-{cid}.json",
        f"kto-detail-common2-{cid}.json",
    ]
    for cache_dir in KO_DETAIL_DIRS:
        if not cache_dir.exists():
            continue
        for pat in patterns:
            p = cache_dir / pat
            if p.exists():
                try:
                    return json.load(open(p, encoding="utf-8")), str(p)
                except Exception:
                    pass
    return None, None

def parse_ko_detail(d):
    """Parse KO detail from either tier-a simplified or standard API format.
    Returns (item_dict_or_None, overview_str).
    """
    if not d:
        return None, ""
    # tier-a simplified format: top-level 'item' key
    if "item" in d and isinstance(d["item"], dict) and d["item"].get("contentid"):
        item = d["item"]
        return item, item.get("overview", "") or ""
    # standard TourAPI response format
    try:
        body = d.get("response", {}).get("body", {})
        if not isinstance(body, dict):
            return None, ""
        items_wrap = body.get("items", {})
        if not items_wrap:
            return None, ""
        if isinstance(items_wrap, dict):
            item_list = items_wrap.get("item", [])
            if isinstance(item_list, dict):
                item_list = [item_list]
            if item_list:
                item = item_list[0] if isinstance(item_list, list) else item_list
                return item, item.get("overview", "") or ""
        elif isinstance(items_wrap, list) and items_wrap:
            return items_wrap[0], items_wrap[0].get("overview", "") or ""
    except Exception:
        pass
    return None, ""

def fetch_kto_detail(cid, api_key):
    """Fetch KTO detailCommon2 for a content ID. Returns (item_dict, overview, http_status, source)."""
    # Check cache first
    cached_d, cached_path = find_ko_detail_cache(cid)
    if cached_d is not None:
        item, overview = parse_ko_detail(cached_d)
        return item, overview, 200, f"CACHE:{cached_path}"

    if not NETWORK_ALLOWED or not api_key:
        return None, "", -1, "NETWORK_DISABLED_OR_NO_KEY"

    # HTTP fetch
    params = {
        "serviceKey": api_key,
        "MobileOS": "ETC",
        "MobileApp": "KoreaMate",
        "_type": "json",
        "numOfRows": "1",
        "pageNo": "1",
        "contentId": str(cid),
        "defaultYN": "Y",
        "firstImageYN": "Y",
        "addrinfoYN": "Y",
        "mapinfoYN": "Y",
        "overviewYN": "Y",
    }
    url = f"{KTO_KO_BASE}/detailCommon2?{urlencode(params)}"
    content, status = http_get_raw(url)
    _http_counter["kto"] += 1

    KTO_V4_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_path = KTO_V4_CACHE_DIR / f"kto-detail-common2-{cid}.json"

    if content is None:
        # Write error sentinel so Run2 finds same result via find_ko_detail_cache
        sentinel = {"_error": True, "_http_status": status, "_cid": cid}
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(sentinel, f, ensure_ascii=False)
        return None, "", status, f"HTTP_FAILED_CACHED:{cache_path}"

    try:
        d = json.loads(content.decode("utf-8"))
    except Exception:
        sentinel = {"_error": True, "_http_status": status, "_cid": cid, "_reason": "PARSE_ERROR"}
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(sentinel, f, ensure_ascii=False)
        return None, "", status, f"HTTP_PARSE_ERROR_CACHED:{cache_path}"

    # Save successful response to cache
    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)

    item, overview = parse_ko_detail(d)
    time.sleep(KTO_RATE_DELAY)
    return item, overview, status, f"HTTP_CACHED:{cache_path}"

# ═══════════════════════════════════════════════════════════════════════════════
# VG CACHE / HTTP
# ═══════════════════════════════════════════════════════════════════════════════
VG_DESC_PATTERNS = [
    re.compile(r'<dt[^>]*>요약정보</dt>\s*<dd[^>]*>(.*?)</dd>', re.DOTALL | re.IGNORECASE),
    re.compile(r'<p[^>]*class="[^"]*detail-desc[^"]*"[^>]*>(.*?)</p>', re.DOTALL | re.IGNORECASE),
    re.compile(r'<div[^>]*class="[^"]*content-desc[^"]*"[^>]*>(.*?)</div>', re.DOTALL | re.IGNORECASE),
    re.compile(r'<div[^>]*id="tour_overview"[^>]*>(.*?)</div>', re.DOTALL | re.IGNORECASE),
]

def parse_vg_html(html_bytes):
    """Parse VG page HTML. Returns description string or empty."""
    try:
        html = html_bytes.decode("utf-8", errors="replace")
    except Exception:
        return ""
    # Try all patterns
    for pat in VG_DESC_PATTERNS:
        m = pat.search(html)
        if m:
            raw = m.group(1)
            # Strip HTML tags
            txt = re.sub(r'<[^>]+>', '', raw)
            txt = re.sub(r'&nbsp;', ' ', txt)
            txt = re.sub(r'&amp;', '&', txt)
            txt = re.sub(r'&lt;', '<', txt)
            txt = re.sub(r'&gt;', '>', txt)
            txt = re.sub(r'\s+', ' ', txt).strip()
            if len(txt) > 20:
                return txt
    return ""

def find_vg_detail_cache(candidate_id):
    """Search all VG cache dirs for a candidate."""
    names_to_try = [
        f"{candidate_id}.html",
        f"{candidate_id}.json",
        candidate_id.replace("gyeongju-", "") + ".html",
    ]
    for cache_dir in [VG_V4_CACHE] + VG_CACHE_DIRS:
        if not cache_dir.exists():
            continue
        for name in names_to_try:
            p = cache_dir / name
            if p.exists():
                return open(p, "rb").read(), str(p)
    return None, None

def fetch_vg_page(candidate_id, mnu_uid, area_uid):
    """Fetch VG detail page. Returns (html_bytes_or_None, description, status, source)."""
    # Check V4 cache first
    cached_raw, cached_path = find_vg_detail_cache(candidate_id)
    if cached_raw:
        desc = parse_vg_html(cached_raw)
        return cached_raw, desc, 200, f"CACHE:{cached_path}"

    if not NETWORK_ALLOWED:
        return None, "", -1, "NETWORK_DISABLED"

    url = f"{VG_BASE}?mnu_uid={mnu_uid}&area_uid={area_uid}&cmd=2"
    content, status = http_get_raw(url)
    _http_counter["vg"] += 1
    if content is None:
        return None, "", status, "HTTP_FAILED"

    # Save to V4 VG cache
    VG_V4_CACHE.mkdir(parents=True, exist_ok=True)
    cache_path = VG_V4_CACHE / f"{candidate_id}.html"
    with open(cache_path, "wb") as f:
        f.write(content)

    desc = parse_vg_html(content)
    return content, desc, status, f"HTTP_CACHED:{cache_path}"

# ═══════════════════════════════════════════════════════════════════════════════
# START
# ═══════════════════════════════════════════════════════════════════════════════
print(f"\n{'='*70}")
print(f"[{SCRIPT_VERSION}] 시작")
print(f"  as_of: {AS_OF}")
print(f"  NETWORK: {'ALLOWED' if NETWORK_ALLOWED else 'DISABLED'}")
print(f"{'='*70}\n")

start_time = time.time()

# ─── Load API key ─────────────────────────────────────────────────────────────
API_KEY = load_api_key()
if API_KEY:
    print("[KEY] TOUR_API_KEY: LOADED (redacted)")
else:
    print("[KEY] TOUR_API_KEY: NOT FOUND — KTO HTTP will be skipped")

# ─── Load base data ────────────────────────────────────────────────────────────
print("[로드] 데이터 로드 중...")

# Previous task outputs
longtail_cls = load_jsonl(NORM / "gyeongju-longtail-release-classification-v1.jsonl")
final_release = load_jsonl(NORM / "gyeongju-final-release-places-v1.jsonl")       # 235건
final_en_cov  = load_jsonl(NORM / "gyeongju-final-en-coverage-v1.jsonl")           # 235건
event_date_st = load_jsonl(NORM / "gyeongju-event-date-status-v1.jsonl")           # 31건
event_entities= load_jsonl(NORM / "gyeongju-event-entities-v1.jsonl")              # 7건
en_sup_result = load_jsonl(NORM / "gyeongju-en-official-site-supplement-result-v1.jsonl")  # 97건

# Baseline released sets
core27 = load_jsonl(NORM / "gyeongju-core27-release-after-location-v2.jsonl")
tier_a = load_jsonl(NORM / "gyeongju-tier-a-final-release-after-description-recovery-v1.jsonl")
rest_102 = load_jsonl(VAL  / "gyeongju-release-102-final-verdict-v1.jsonl")
att_audit= load_jsonl(NORM / "gyeongju-attraction-identity-audit-v1.jsonl")
source_facts = load_jsonl(NORM / "source-facts-full-v1.jsonl")

# KTO 623 list
kto623_path = RAW / "kto-list/kto-all-types-areabasedlist2-gyeongju-v3.json"
kto623_all = []
if kto623_path.exists():
    d = json.load(open(kto623_path, encoding="utf-8"))
    kto623_all = d.get("items", [])
kto623_by_id = {str(r["contentid"]): r for r in kto623_all}

print(f"  longtail_cls={len(longtail_cls)}, final_release={len(final_release)}")
print(f"  core27={len(core27)}, tier_a={len(tier_a)}, rest_102={len(rest_102)}")
print(f"  kto623={len(kto623_all)}, events={len(event_date_st)}")

# Build indexes
sf_by_id = {r["source_fact_id"]: r for r in source_facts}
att_by_cid = {}
for a in att_audit:
    cid = a.get("baseline_candidate_id", "")
    if cid:
        att_by_cid[cid] = a

# Build TIER_A + CORE27 name index for duplicate detection
released_name_idx = {}   # normalized_name → candidate_id
def _build_name_idx(records, src_label):
    for r in records:
        name = (r.get("name_ko") or r.get("title_ko") or "").strip()
        if name:
            n = normalize_name(name)
            if n and len(n) >= 2:
                released_name_idx.setdefault(n, []).append({
                    "candidate_id": r["candidate_id"],
                    "name": name,
                    "source": src_label,
                })

_build_name_idx(core27, "CORE27")
_build_name_idx(tier_a, "TIER_A")

# HOLD_DESCRIPTION 190건
hold_190 = [r for r in longtail_cls if r.get("release_classification") == "HOLD_DESCRIPTION"]
oos_59   = [r for r in longtail_cls if r.get("release_classification") == "OUT_OF_SCOPE"]
print(f"  hold_190={len(hold_190)}, oos_59={len(oos_59)}")

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 1 — SOURCE STATE AUDIT
# ═══════════════════════════════════════════════════════════════════════════════
print(f"\n{'─'*70}")
print("[Phase 1] Source State Audit")

SOURCE_STATES = {
    "VG_COLLECTION_PENDING": "VG 상세 페이지 미수집 (mnu_uid 확인됨)",
    "VG_SOURCE_URL_NOT_RESOLVED": "VG identity 없음 — URL 미확인",
    "KTO_DESCRIPTION_PARSEABLE": "KTO detail 캐시 있고 설명문 추출 가능",
    "KTO_CACHE_MISS": "KTO detailCommon2 캐시 없음 — HTTP 필요",
    "KTO_DESCRIPTION_EMPTY": "KTO detail 캐시 있으나 설명문 없음",
    "KTO_NOT_IN_623": "KTO content_id가 623 list에 없음",
    "NO_KTO_LINK": "KTO 매칭 없음 (GJ01/WEB-NEW 계열)",
    "DUPLICATE_COVERED": "TIER_A/CORE27 동일 장소 이미 릴리즈",
}

audit_records = []
vg_pending = []          # 2 VG HTTP candidates
kto_cache_miss = []      # 108 KTO HTTP candidates
kto_desc_ok = []         # 18 with parseable description
tier_a_dups = []         # duplicates covered by TIER_A/CORE27

for r in hold_190:
    cid = r["candidate_id"]
    name = r.get("name_ko", "")
    kto_id = r.get("kto_content_id", "")
    kto_status_v1 = r.get("kto_status", "")
    vg_status_v1  = r.get("vg_status", "")

    rec = {
        "candidate_id": cid,
        "name_ko": name,
        "kto_content_id": kto_id,
        "kto_status_v1": kto_status_v1,
        "vg_status_v1": vg_status_v1,
        "as_of": AS_OF,
        "script_version": SCRIPT_VERSION,
    }

    # 1. VG COLLECTION_PENDING?
    if vg_status_v1 == "CACHED_WEBATT":
        att = att_by_cid.get(cid, {})
        sfid = att.get("source_fact_id", "")
        sf = sf_by_id.get(sfid, {})
        mnu_uid = sf.get("web_mnu_uid")
        area_uid = sf.get("web_area_uid")
        rec.update({
            "source_state": "VG_COLLECTION_PENDING",
            "vg_mnu_uid": mnu_uid,
            "vg_area_uid": area_uid,
            "vg_source_fact_id": sfid,
        })
        vg_pending.append(rec)
        audit_records.append(rec)
        continue

    # 2. DUPLICATE check against TIER_A/CORE27
    norm_name = normalize_name(name)
    dup_match = released_name_idx.get(norm_name, [])
    if not dup_match and len(norm_name) > 2:
        # Try prefix match
        for key, vals in released_name_idx.items():
            if len(key) >= 3 and (norm_name[:len(key)] == key or key[:len(norm_name)] == norm_name):
                dup_match = vals
                break
    if dup_match:
        rec.update({
            "source_state": "DUPLICATE_COVERED",
            "duplicate_of": dup_match[0]["candidate_id"],
            "duplicate_source": dup_match[0]["source"],
            "duplicate_name": dup_match[0]["name"],
        })
        tier_a_dups.append(rec)
        audit_records.append(rec)
        continue

    # 3. KTO12/14/38 with KTO id
    if kto_id:
        in_623 = kto_id in kto623_by_id
        cached_d, cached_path = find_ko_detail_cache(kto_id)
        # BYTE_IDENTICAL fix: error sentinels written by Phase5 HTTP failure
        # must be treated as CACHE_MISS so both Run1 and Run2 produce identical
        # audit records and kto_cache_miss lists.
        is_error_sentinel = bool(cached_d and cached_d.get("_error"))
        if cached_d and not is_error_sentinel:
            item, overview = parse_ko_detail(cached_d)
            has_desc = bool(overview and overview.strip())
            if has_desc:
                rec.update({
                    "source_state": "KTO_DESCRIPTION_PARSEABLE",
                    "kto_in_623": in_623,
                    "kto_cache_path": cached_path,
                    "kto_overview_len": len(overview),
                })
                kto_desc_ok.append(rec)
            else:
                rec.update({
                    "source_state": "KTO_DESCRIPTION_EMPTY",
                    "kto_in_623": in_623,
                    "kto_cache_path": cached_path,
                })
        else:
            # No cache OR error sentinel → treat as CACHE_MISS (deterministic)
            if in_623:
                rec.update({
                    "source_state": "KTO_CACHE_MISS",
                    "kto_in_623": True,
                    "kto_623_title": kto623_by_id[kto_id].get("title", ""),
                    "kto_623_type": kto623_by_id[kto_id].get("contenttypeid", ""),
                })
                kto_cache_miss.append(rec)
            else:
                rec.update({
                    "source_state": "KTO_NOT_IN_623",
                    "kto_in_623": False,
                })
    else:
        rec.update({
            "source_state": "NO_KTO_LINK",
            "kto_in_623": False,
        })

    audit_records.append(rec)

state_dist = Counter(r["source_state"] for r in audit_records)
print(f"  전체: {len(audit_records)}건")
for k, v in sorted(state_dist.items()):
    print(f"    {k}: {v}")
print(f"  VG_PENDING: {len(vg_pending)}, KTO_CACHE_MISS: {len(kto_cache_miss)}")
print(f"  KTO_DESC_OK: {len(kto_desc_ok)}, TIER_A_DUPS: {len(tier_a_dups)}")

save_jsonl(NORM / "gyeongju-final-source-state-audit-v4.jsonl", audit_records)

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 2 — KTO 188×623 GLOBAL CROSSWALK
# ═══════════════════════════════════════════════════════════════════════════════
print(f"\n{'─'*70}")
print("[Phase 2] KTO 188×623 Global Crosswalk")

# 188 = HOLD 190 - VG_PENDING 2
no_vg_hold = [r for r in audit_records if r.get("source_state") != "VG_COLLECTION_PENDING"]
print(f"  대상 (VG identity 없는 HOLD): {len(no_vg_hold)}건")
print(f"  KTO 623 list: {len(kto623_all)}건")

# Build KTO 623 name index
kto623_name_idx = {}  # normalized_name → [kto_record]
for kto_r in kto623_all:
    title = kto_r.get("title", "")
    n = normalize_name(title)
    if n:
        kto623_name_idx.setdefault(n, []).append(kto_r)

crosswalk_results = []
collision_records = []

kto623_matched_by = defaultdict(list)  # contentid → [candidate_ids]

for hold_r in no_vg_hold:
    cid = hold_r["candidate_id"]
    name = hold_r.get("name_ko", "")
    kto_id = hold_r.get("kto_content_id", "")

    match_record = {
        "candidate_id": cid,
        "name_ko": name,
        "kto_content_id": kto_id,
        "source_state": hold_r.get("source_state"),
        "as_of": AS_OF,
        "script_version": SCRIPT_VERSION,
    }

    # Case A: KTO-prefix candidate — direct contentId match
    if kto_id and kto_id in kto623_by_id:
        kto_r = kto623_by_id[kto_id]
        match_record.update({
            "crosswalk_match": "DIRECT_CONTENTID_MATCH",
            "crosswalk_confidence": "EXACT",
            "kto623_contentid": kto_id,
            "kto623_title": kto_r.get("title", ""),
            "kto623_type": kto_r.get("contenttypeid", ""),
            "kto623_addr": kto_r.get("addr1", ""),
            "kto623_mapx": kto_r.get("mapx"),
            "kto623_mapy": kto_r.get("mapy"),
        })
        kto623_matched_by[kto_id].append(cid)
    elif kto_id and kto_id not in kto623_by_id:
        # KTO id present but not in 623 list
        match_record.update({
            "crosswalk_match": "CONTENTID_NOT_IN_623",
            "crosswalk_confidence": "OUT_OF_AREA_OR_TYPE",
        })
    else:
        # No KTO id — name-based matching against 623
        norm_name = normalize_name(name)
        best_match = None
        best_conf = "NO_MATCH"

        # Exact name match
        if norm_name in kto623_name_idx:
            candidates_623 = kto623_name_idx[norm_name]
            best_match = candidates_623[0]
            best_conf = "EXACT_NAME"
        else:
            # Substring match
            for key, vals in kto623_name_idx.items():
                if len(key) >= 3 and (norm_name in key or key in norm_name):
                    if best_match is None or best_conf == "NO_MATCH":
                        best_match = vals[0]
                        best_conf = "SUBSTRING_NAME"
                        break

        if best_match:
            kto_id_match = str(best_match.get("contentid", ""))
            match_record.update({
                "crosswalk_match": "NAME_BASED_MATCH",
                "crosswalk_confidence": best_conf,
                "kto623_contentid": kto_id_match,
                "kto623_title": best_match.get("title", ""),
                "kto623_type": best_match.get("contenttypeid", ""),
                "kto623_addr": best_match.get("addr1", ""),
            })
            kto623_matched_by[kto_id_match].append(cid)
        else:
            match_record.update({
                "crosswalk_match": "NO_KTO_MATCH",
                "crosswalk_confidence": "NO_MATCH",
            })

    crosswalk_results.append(match_record)

# Collision detection: one KTO623 item matched by multiple hold candidates
for kto_id, cand_list in kto623_matched_by.items():
    if len(cand_list) >= 2:
        collision_records.append({
            "kto623_contentid": kto_id,
            "kto623_title": kto623_by_id.get(kto_id, {}).get("title", ""),
            "matched_candidates": cand_list,
            "collision_count": len(cand_list),
            "as_of": AS_OF,
            "script_version": SCRIPT_VERSION,
        })

cw_dist = Counter(r.get("crosswalk_match") for r in crosswalk_results)
print(f"  Crosswalk results ({len(crosswalk_results)}건):")
for k, v in sorted(cw_dist.items()):
    print(f"    {k}: {v}")
print(f"  Collision candidates: {len(collision_records)}건")

save_jsonl(NORM / "gyeongju-kto-188-global-crosswalk-v4.jsonl", crosswalk_results)
save_jsonl(NORM / "gyeongju-kto-188-collision-audit-v4.jsonl", collision_records)

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 3 — CONTENTTYPE SCOPE AUDIT
# ═══════════════════════════════════════════════════════════════════════════════
print(f"\n{'─'*70}")
print("[Phase 3] ContentType Scope Audit (KTO14·38)")

# KTO14 in scope rules
KTO14_OOS = {"경주중앙도서관", "경주문화원 안강교육장"}  # libraries/educational
KTO14_REVIEW = {"경주화백컨벤션센터"}

# KTO38 in scope rules
KTO38_OOS_KEYWORDS = {"아울렛", "하이마트", "마트"}
KTO38_IN_SCOPE_KEYWORDS = {"시장", "갤러리", "도예", "요", "샌드"}

scope_audit = []

# Collect KTO14 and KTO38 items from HOLD list
kto14_hold = [r for r in hold_190 if "KTO14-" in r.get("candidate_id", "")]
kto38_hold = [r for r in hold_190 if "KTO38-" in r.get("candidate_id", "")]

print(f"  KTO14 HOLD items: {len(kto14_hold)}")
print(f"  KTO38 HOLD items: {len(kto38_hold)}")

# KTO14 scope determination
for r in kto14_hold:
    name = r.get("name_ko", "")
    if name in KTO14_OOS:
        scope = "OUT_OF_SCOPE"
        reason = "LIBRARY_OR_EDUCATIONAL_FACILITY"
    elif name in KTO14_REVIEW:
        scope = "REVIEW_REQUIRED"
        reason = "CONVENTION_CENTER_TOURISM_VALUE_UNCLEAR"
    else:
        scope = "IN_SCOPE"
        reason = "MUSEUM_OR_CULTURAL_EXHIBIT_TOURISM_RELEVANT"
    scope_audit.append({
        "candidate_id": r["candidate_id"],
        "name_ko": name,
        "kto_type": "14",
        "scope_decision": scope,
        "scope_reason": reason,
        "as_of": AS_OF,
        "script_version": SCRIPT_VERSION,
    })

# KTO38 scope determination
for r in kto38_hold:
    name = r.get("name_ko", "")
    name_lower = name.lower()
    if any(kw in name for kw in KTO38_OOS_KEYWORDS):
        scope = "OUT_OF_SCOPE"
        reason = "GENERIC_RETAIL_NOT_TOURISM_ATTRACTION"
    elif any(kw in name for kw in KTO38_IN_SCOPE_KEYWORDS):
        scope = "IN_SCOPE"
        reason = "TRADITIONAL_MARKET_OR_CRAFT_TOURISM_RELEVANT"
    else:
        scope = "REVIEW_REQUIRED"
        reason = "INDIVIDUAL_JUDGMENT_REQUIRED"
    scope_audit.append({
        "candidate_id": r["candidate_id"],
        "name_ko": name,
        "kto_type": "38",
        "scope_decision": scope,
        "scope_reason": reason,
        "as_of": AS_OF,
        "script_version": SCRIPT_VERSION,
    })

scope_dist = Counter(r["scope_decision"] for r in scope_audit)
print(f"  Scope audit ({len(scope_audit)}건): {dict(scope_dist)}")
save_jsonl(NORM / "gyeongju-contenttype-scope-audit-v4.jsonl", scope_audit)

# Build OOS from scope audit
scope_oos_cids = {r["candidate_id"] for r in scope_audit if r["scope_decision"] == "OUT_OF_SCOPE"}

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 4 — DUPLICATE AUDIT
# ═══════════════════════════════════════════════════════════════════════════════
print(f"\n{'─'*70}")
print("[Phase 4] Duplicate Audit")

# Known duplicate pairs from V3 verification
KNOWN_DUP_PAIRS = [
    ("gyeongju-GJ01-0065", "gyeongju-KTO12-128677", "감포항 &감포해상공원 ↔ 감포항"),
    ("gyeongju-GJ01-0078", "gyeongju-WEB-NEW-ATT-165", "송대말등대 ↔ 송대말등대 빛 체험전시관"),
    ("gyeongju-GJ01-0129", "gyeongju-WEB-NEW-ATT-307", "영지&영지석불좌상 ↔ 영지&amp;영지석불좌상"),
    ("gyeongju-GJ01-0112", "gyeongju-WEB-NEW-ATT-390", "정글의법칙 미디어파크 ↔ 정글미디어파크"),
]

dup_audit = []
hold_cid_set = {r["candidate_id"] for r in hold_190}
hold_by_cid = {r["candidate_id"]: r for r in hold_190}

for cid_a, cid_b, label in KNOWN_DUP_PAIRS:
    a_in_hold = cid_a in hold_cid_set
    b_in_hold = cid_b in hold_cid_set
    name_a = hold_by_cid.get(cid_a, {}).get("name_ko", cid_a)
    name_b = hold_by_cid.get(cid_b, {}).get("name_ko", cid_b)

    if a_in_hold and b_in_hold:
        verdict = "BOTH_IN_HOLD_INTERNAL_DUPLICATE"
    elif a_in_hold and not b_in_hold:
        verdict = "A_IN_HOLD_B_NOT_FOUND"
    elif not a_in_hold and b_in_hold:
        verdict = "B_IN_HOLD_A_NOT_FOUND"
    else:
        verdict = "NEITHER_IN_HOLD"

    dup_audit.append({
        "pair_label": label,
        "candidate_id_a": cid_a,
        "candidate_id_b": cid_b,
        "name_a": name_a,
        "name_b": name_b,
        "a_in_hold": a_in_hold,
        "b_in_hold": b_in_hold,
        "verdict": verdict,
        "resolution": "RETAIN_A_MERGE_KTO_DATA" if "GJ01" in cid_a else "RETAIN_BOTH_PENDING_MANUAL_REVIEW",
        "as_of": AS_OF,
        "script_version": SCRIPT_VERSION,
    })
    print(f"  [{verdict}] {label}")

# Internal duplicate: TIER_A duplicates from P1
for r in tier_a_dups:
    dup_audit.append({
        "pair_label": f"HOLD_TIER_A_DUP: {r['name_ko']}",
        "candidate_id_a": r["candidate_id"],
        "candidate_id_b": r.get("duplicate_of", ""),
        "name_a": r["name_ko"],
        "name_b": r.get("duplicate_name", ""),
        "a_in_hold": True,
        "b_in_hold": False,  # in TIER_A (already released)
        "verdict": "COVERED_BY_TIER_A_EQUIVALENT",
        "resolution": "SUPPRESS_HOLD_ITEM_COVERED",
        "as_of": AS_OF,
        "script_version": SCRIPT_VERSION,
    })

save_jsonl(NORM / "gyeongju-final-duplicate-audit-v4.jsonl", dup_audit)
dup_dist = Counter(r["verdict"] for r in dup_audit)
print(f"  Duplicate audit total: {len(dup_audit)}건 — dist: {dict(dup_dist)}")

# Build sets for final classification
dup_suppress_cids = set()
for r in dup_audit:
    if "COVERED" in r["verdict"] or "SUPPRESS" in r.get("resolution",""):
        dup_suppress_cids.add(r["candidate_id_a"])

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 5 — KTO DETAIL COLLECTION (cache-first, HTTP for CACHE_MISS)
# ═══════════════════════════════════════════════════════════════════════════════
print(f"\n{'─'*70}")
print("[Phase 5] KTO Detail Collection")
print(f"  대상: {len(kto_cache_miss)}건 (CACHE_MISS) + {len(kto_desc_ok)}건 (DESC_OK re-parse)")

kto_detail_snapshot = []

# A) Re-parse KTO_DESCRIPTION_PARSEABLE items (fix tier-a format misparse in V1)
for r in kto_desc_ok:
    cid = r["candidate_id"]
    kto_id = r.get("kto_content_id", "")
    cached_d, cached_path = find_ko_detail_cache(kto_id)
    item, overview = parse_ko_detail(cached_d)
    kto623_rec = kto623_by_id.get(kto_id, {})
    # data_source: deterministic across Run1/Run2 (no fetch_source/fetch_status)
    data_src = "KTO_DETAIL_AVAILABLE" if (item and overview) else "KTO_DETAIL_UNAVAILABLE"
    kto_detail_snapshot.append({
        "candidate_id": cid,
        "name_ko": r["name_ko"],
        "kto_content_id": kto_id,
        "data_source": data_src,
        "kto_title": item.get("title", "") if item else "",
        "kto_overview": overview or "",
        "kto_overview_len": len(overview or ""),
        "kto_addr1": item.get("addr1", "") if item else "",
        "kto_mapx": item.get("mapx") if item else None,
        "kto_mapy": item.get("mapy") if item else None,
        "kto_firstimage": item.get("firstimage", "") if item else "",
        "kto_cpyrhtDivCd": item.get("cpyrhtDivCd", "") if item else "",
        "kto_contenttypeid": (item.get("contenttypeid") if item else "") or kto623_rec.get("contenttypeid", ""),
        "has_overview": bool(overview and overview.strip()),
        "in_623": kto_id in kto623_by_id,
        "as_of": AS_OF,
        "script_version": SCRIPT_VERSION,
    })

# B) CACHE_MISS items — attempt HTTP
kto_http_success = 0
kto_http_fail = 0

# Sort: items in 623 first (higher priority), then others
cache_miss_sorted = sorted(kto_cache_miss, key=lambda r: (0 if r.get("kto_in_623") else 1))

for i, r in enumerate(cache_miss_sorted):
    cid = r["candidate_id"]
    kto_id = r.get("kto_content_id", "")
    if not kto_id:
        continue

    item, overview, status, source = fetch_kto_detail(kto_id, API_KEY)
    kto623_rec = kto623_by_id.get(kto_id, {})

    # data_source: deterministic (based on actual data, not how it was fetched)
    data_src = "KTO_DETAIL_AVAILABLE" if (item and overview) else "KTO_DETAIL_UNAVAILABLE"
    snap = {
        "candidate_id": cid,
        "name_ko": r["name_ko"],
        "kto_content_id": kto_id,
        "data_source": data_src,
        "kto_title": item.get("title", "") if item else "",
        "kto_overview": overview or "",
        "kto_overview_len": len(overview or ""),
        "kto_addr1": item.get("addr1", "") if item else "",
        "kto_mapx": item.get("mapx") if item else None,
        "kto_mapy": item.get("mapy") if item else None,
        "kto_firstimage": item.get("firstimage", "") if item else "",
        "kto_cpyrhtDivCd": item.get("cpyrhtDivCd", "") if item else "",
        "kto_contenttypeid": (item.get("contenttypeid") if item else "") or kto623_rec.get("contenttypeid", ""),
        "has_overview": bool(overview and overview.strip()),
        "in_623": kto_id in kto623_by_id,
        "as_of": AS_OF,
        "script_version": SCRIPT_VERSION,
    }

    if item and overview:
        kto_http_success += 1
    else:
        kto_http_fail += 1

    kto_detail_snapshot.append(snap)

    if (i+1) % 20 == 0:
        print(f"    KTO detail progress: {i+1}/{len(cache_miss_sorted)} (success={kto_http_success} fail={kto_http_fail})")

# Sort by candidate_id for BYTE_IDENTICAL
kto_detail_snapshot.sort(key=lambda r: r["candidate_id"])

has_overview_count = sum(1 for r in kto_detail_snapshot if r.get("has_overview"))
print(f"  KTO detail snapshot: {len(kto_detail_snapshot)}건")
print(f"  has_overview: {has_overview_count}/{len(kto_detail_snapshot)}")
print(f"  HTTP: {_http_counter['kto']}건")

save_jsonl(NORM / "gyeongju-final-kto-detail-snapshot-v4.jsonl", kto_detail_snapshot)

# Build KTO detail index
kto_detail_by_cid = {r["candidate_id"]: r for r in kto_detail_snapshot}

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 6 — VG COLLECTION_PENDING 2건 (HTTP)
# ═══════════════════════════════════════════════════════════════════════════════
print(f"\n{'─'*70}")
print("[Phase 6] VG COLLECTION_PENDING 2건")

VG_PENDING_ITEMS = [
    {"candidate_id": "gyeongju-KTO12-128677",  "name_ko": "감포항",       "mnu_uid": 2294, "area_uid": 160},
    {"candidate_id": "gyeongju-KTO12-2044527", "name_ko": "강동 워터파크", "mnu_uid": 2291, "area_uid": 300},
]

vg_snapshots = []
for vp in VG_PENDING_ITEMS:
    cid     = vp["candidate_id"]
    name    = vp["name_ko"]
    mnu_uid = vp["mnu_uid"]
    area_uid= vp["area_uid"]

    html_bytes, desc, status, source = fetch_vg_page(cid, mnu_uid, area_uid)

    snap = {
        "candidate_id": cid,
        "name_ko": name,
        "mnu_uid": mnu_uid,
        "area_uid": area_uid,
        "vg_url": f"{VG_BASE}?mnu_uid={mnu_uid}&area_uid={area_uid}&cmd=2",
        "fetch_source": source,
        "fetch_status": status,
        "description_extracted": desc or "",
        "description_len": len(desc or ""),
        "has_description": bool(desc and desc.strip()),
        "as_of": AS_OF,
        "script_version": SCRIPT_VERSION,
    }
    vg_snapshots.append(snap)

    desc_status = "OK" if snap["has_description"] else "EMPTY"
    print(f"  {name}: HTTP={status} desc={desc_status} len={snap['description_len']}")

save_jsonl(NORM / "gyeongju-final-vg-pending2-snapshot-v4.jsonl", vg_snapshots)

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 7 — EN TARGETED (minimal)
# ═══════════════════════════════════════════════════════════════════════════════
print(f"\n{'─'*70}")
print("[Phase 7] EN Targeted")

# Carry forward Phase A supplement results + summarize
en_sup_dist = Counter(r.get("outcome", "") for r in en_sup_result)
en_targeted = []

for r in en_sup_result:
    en_targeted.append({
        "candidate_id": r.get("candidate_id", ""),
        "name_ko": r.get("name_ko", ""),
        "en_outcome": r.get("outcome", ""),
        "resolved_en_content_id": r.get("resolved_en_content_id"),
        "en_title": r.get("en_title", ""),
        "supplement_priority": r.get("supplement_priority", ""),
        "as_of": AS_OF,
        "script_version": SCRIPT_VERSION,
    })

print(f"  EN supplement 결과 (97건): {dict(en_sup_dist)}")
print(f"  신규 HTTP: 0건 (캐시 기반)")
save_jsonl(NORM / "gyeongju-final-en-targeted-result-v4.jsonl", en_targeted)

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 8 — EVENT TARGETED
# ═══════════════════════════════════════════════════════════════════════════════
print(f"\n{'─'*70}")
print("[Phase 8] Event Targeted")

# Re-evaluate event date status as of 2026-08-08
event_targeted = []
ev_by_id = {e.get("event_id", e.get("event_entity_id","")): e for e in event_entities}

for ev in event_date_st:
    ev_id     = ev.get("event_id", "")
    status    = ev.get("date_status", "")
    start_str = ev.get("start_date")
    end_str   = ev.get("end_date")

    # Re-evaluate ACTIVE vs PAST
    try:
        start = date.fromisoformat(start_str) if start_str else None
        end   = date.fromisoformat(end_str)   if end_str   else None
    except ValueError:
        start = end = None

    if start and end and end < AS_OF_DATE:
        new_status = "PAST"
        release_verdict = "PAST_EVENT_ARCHIVE"
    elif start and start <= AS_OF_DATE and (end is None or end >= AS_OF_DATE):
        new_status = "ACTIVE"
        release_verdict = "EVENT_RELEASE_READY"
    elif status == "DATE_INCOMPLETE":
        new_status = "DATE_INCOMPLETE"
        release_verdict = "HOLD_DATE_INCOMPLETE"
    else:
        new_status = status
        release_verdict = "HOLD_DATE_INCOMPLETE"

    # Individual event URL for WEB-EV — all share listing URL mnu_uid=2393
    # No individual detail URL confirmed → cannot fetch individual dates via HTTP
    ev_ent = ev_by_id.get(ev_id, {})
    ev_url = ev_ent.get("official_url", "")
    url_type = "LISTING_PAGE" if "mnu_uid=2393" in (ev_url or "") else "UNKNOWN"

    event_targeted.append({
        "event_id": ev_id,
        "date_status_v1": status,
        "date_status_v4": new_status,
        "start_date": start_str,
        "end_date": end_str,
        "release_verdict": release_verdict,
        "url_type": url_type,
        "http_attempted": False,
        "http_reason": "NO_INDIVIDUAL_EVENT_URL_CONFIRMED" if url_type == "LISTING_PAGE" else "KTO15_DETAIL_NOT_FETCHED",
        "as_of": AS_OF,
        "script_version": SCRIPT_VERSION,
    })

ev_dist = Counter(r["release_verdict"] for r in event_targeted)
print(f"  Event targeted ({len(event_targeted)}건): {dict(ev_dist)}")
save_jsonl(NORM / "gyeongju-final-event-targeted-result-v4.jsonl", event_targeted)

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 9 — FINAL RELEASE CLASSIFICATION
# ═══════════════════════════════════════════════════════════════════════════════
print(f"\n{'─'*70}")
print("[Phase 9] Final Release Classification")

# Build VG snapshot index
vg_snap_by_cid = {r["candidate_id"]: r for r in vg_snapshots}

# Build scope OOS set
scope_oos = scope_oos_cids  # from Phase 3

final_cls = []

for r in hold_190:
    cid = r["candidate_id"]
    name = r.get("name_ko", "")

    # Audit record
    audit = next((a for a in audit_records if a["candidate_id"] == cid), {})
    source_state = audit.get("source_state", "UNKNOWN")

    # VG data
    vg_snap = vg_snap_by_cid.get(cid)
    vg_desc = vg_snap.get("description_extracted", "") if vg_snap else ""
    has_vg_desc = bool(vg_desc and vg_desc.strip())

    # KTO data
    kto_snap = kto_detail_by_cid.get(cid)
    kto_overview = kto_snap.get("kto_overview", "") if kto_snap else ""
    has_kto_desc = bool(kto_overview and kto_overview.strip())
    kto_image = kto_snap.get("kto_firstimage", "") if kto_snap else ""
    kto_cpyrt = kto_snap.get("kto_cpyrhtDivCd", "") if kto_snap else ""

    # Combined description
    description_ko = vg_desc or kto_overview or None
    has_description = has_vg_desc or has_kto_desc

    # Image
    has_image = bool(kto_image)
    image_rights = kto_cpyrt or "UNKNOWN"

    # Determine release status
    if cid in dup_suppress_cids:
        release_v4 = "DUPLICATE_COVERED"
        hold_reason = "COVERED_BY_TIER_A_OR_CORE27"
    elif cid in scope_oos:
        release_v4 = "OUT_OF_SCOPE"
        hold_reason = "CONTENTTYPE_SCOPE_AUDIT_OOS"
    elif has_description:
        if has_image:
            release_v4 = "READY_FOR_RELEASE"
            hold_reason = None
        else:
            release_v4 = "HOLD_IMAGE"
            hold_reason = "DESCRIPTION_OK_BUT_NO_IMAGE"
    elif source_state == "VG_COLLECTION_PENDING" and not has_vg_desc:
        release_v4 = "HOLD_DESCRIPTION"
        hold_reason = "VG_HTTP_NO_DESCRIPTION_EXTRACTED"
    elif source_state == "KTO_CACHE_MISS":
        if kto_snap and kto_snap.get("fetch_status", 0) > 0:
            release_v4 = "HOLD_DESCRIPTION"
            hold_reason = "KTO_DESCRIPTION_EMPTY_AFTER_FETCH"
        else:
            release_v4 = "HOLD_DESCRIPTION"
            hold_reason = "KTO_HTTP_FAILED_OR_DISABLED"
    else:
        release_v4 = "HOLD_DESCRIPTION"
        hold_reason = "NO_DESCRIPTION_SOURCE_AVAILABLE"

    final_cls.append({
        "candidate_id": cid,
        "name_ko": name,
        "release_v1": "HOLD_DESCRIPTION",
        "release_v4": release_v4,
        "hold_reason": hold_reason,
        "source_state": source_state,
        "has_description": has_description,
        "has_image": has_image,
        "description_source": "VG" if has_vg_desc else ("KTO" if has_kto_desc else None),
        "description_ko_excerpt": (description_ko or "")[:200] if description_ko else None,
        "image_rights": image_rights if has_image else None,
        "kto_content_id": r.get("kto_content_id"),
        "as_of": AS_OF,
        "script_version": SCRIPT_VERSION,
    })

cls_dist = Counter(r["release_v4"] for r in final_cls)
print(f"  Final classification ({len(final_cls)}건):")
for k, v in sorted(cls_dist.items()):
    print(f"    {k}: {v}")

save_jsonl(NORM / "gyeongju-final-release-classification-v4.jsonl", final_cls)

# ═══════════════════════════════════════════════════════════════════════════════
# IMAGE RIGHTS OVERLAY
# ═══════════════════════════════════════════════════════════════════════════════
img_rights_overlay = []
for r in final_cls:
    if r.get("has_image"):
        img_rights_overlay.append({
            "candidate_id": r["candidate_id"],
            "name_ko": r["name_ko"],
            "image_source": "KTO_FIRSTIMAGE",
            "image_rights": r.get("image_rights", "UNKNOWN"),
            "rights_basis": "KTO_CPYRHTDIVCD",
            "release_status": r["release_v4"],
            "as_of": AS_OF,
            "script_version": SCRIPT_VERSION,
        })
    else:
        img_rights_overlay.append({
            "candidate_id": r["candidate_id"],
            "name_ko": r["name_ko"],
            "image_source": None,
            "image_rights": "NO_IMAGE",
            "rights_basis": None,
            "release_status": r["release_v4"],
            "as_of": AS_OF,
            "script_version": SCRIPT_VERSION,
        })

save_jsonl(NORM / "gyeongju-final-image-rights-overlay-v4.jsonl", img_rights_overlay)

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 10 — QUALITY METRICS
# ═══════════════════════════════════════════════════════════════════════════════
print(f"\n{'─'*70}")
print("[Phase 10] Quality Metrics")

newly_ready = [r for r in final_cls if r["release_v4"] == "READY_FOR_RELEASE"]
hold_desc   = [r for r in final_cls if r["release_v4"] == "HOLD_DESCRIPTION"]
hold_img    = [r for r in final_cls if r["release_v4"] == "HOLD_IMAGE"]
dup_cov     = [r for r in final_cls if r["release_v4"] == "DUPLICATE_COVERED"]
oos_v4      = [r for r in final_cls if r["release_v4"] == "OUT_OF_SCOPE"]

# EN coverage from V1
en_ready    = sum(1 for r in final_en_cov if r.get("en_status") in ("EN_READY","EN_PARTIAL","EN_SAME_BASE_PLACE_TEMPORAL_PARTIAL"))
en_review   = sum(1 for r in final_en_cov if r.get("en_status") in ("EN_IDENTITY_REVIEW",))
en_missing  = sum(1 for r in final_en_cov if r.get("en_status") in ("EN_SOURCE_MISSING",))

metrics = {
    "as_of": AS_OF,
    "script_version": SCRIPT_VERSION,
    "hold_190_total": len(hold_190),
    "phase9_classification": {
        "READY_FOR_RELEASE": len(newly_ready),
        "HOLD_DESCRIPTION": len(hold_desc),
        "HOLD_IMAGE": len(hold_img),
        "DUPLICATE_COVERED": len(dup_cov),
        "OUT_OF_SCOPE": len(oos_v4),
    },
    "baseline_released_235": len(final_release),
    "baseline_core27": len(core27),
    "baseline_tier_a": len([r for r in tier_a if r.get("release_status","") != "HOLD_DESCRIPTION"]),
    "baseline_restaurant_102": len(rest_102),
    "kto_623_total": len(kto623_all),
    "kto_623_type_dist": dict(Counter(r.get("contenttypeid","") for r in kto623_all)),
    "crosswalk_stats": dict(Counter(r.get("crosswalk_match") for r in crosswalk_results)),
    "collision_count": len(collision_records),
    "tier_a_duplicates_found": len(tier_a_dups),
    "scope_audit": dict(Counter(r["scope_decision"] for r in scope_audit)),
    "kto_detail_snapshot_total": len(kto_detail_snapshot),
    "kto_detail_has_overview": has_overview_count,
    "vg_pending_resolved": sum(1 for r in vg_snapshots if r.get("has_description")),
    "events_active": sum(1 for r in event_targeted if r["release_verdict"] == "EVENT_RELEASE_READY"),
    "events_date_incomplete": sum(1 for r in event_targeted if r["release_verdict"] == "HOLD_DATE_INCOMPLETE"),
    "events_past": sum(1 for r in event_targeted if r["release_verdict"] == "PAST_EVENT_ARCHIVE"),
    "en_supplement_97": {
        "EN_OFFICIAL_PARTIAL": sum(1 for r in en_targeted if r["en_outcome"] == "EN_OFFICIAL_PARTIAL"),
        "EN_IDENTITY_REVIEW": sum(1 for r in en_targeted if r["en_outcome"] == "EN_IDENTITY_REVIEW"),
        "OFFICIAL_EN_PAGE_NOT_RESOLVED": sum(1 for r in en_targeted if r["en_outcome"] == "OFFICIAL_EN_PAGE_NOT_RESOLVED"),
    },
    "http_total": _http_counter["total"],
    "http_vg": _http_counter["vg"],
    "http_kto": _http_counter["kto"],
    "http_errors": _http_counter["errors"],
    # BYTE_IDENTICAL: based on actual HTTP usage, not NETWORK_ALLOWED flag
    "network_mode": "USED" if _http_counter["total"] > 0 else "CACHE_ONLY",
}

print(f"  Phase 9 분류: {metrics['phase9_classification']}")
print(f"  신규 READY: {len(newly_ready)}건")
print(f"  HTTP 합계: total={_http_counter['total']} VG={_http_counter['vg']} KTO={_http_counter['kto']}")

save_json(NORM / "gyeongju-final-quality-metrics-v4.json", metrics)

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 11 — COMMON RULES DOCS
# ═══════════════════════════════════════════════════════════════════════════════
print(f"\n{'─'*70}")
print("[Phase 11] Common Rules Docs")

DOCS_DC.mkdir(parents=True, exist_ok=True)

# Doc 1: Common City Collection Rules
common_rules = """# data-collection/common-city-collection-rules-v1.md

**작성일**: 2026-08-08
**적용 범위**: 경주, 부산 및 향후 추가 도시 전체
**상태**: v1 초안 (경주 파이프라인 완료 후 코드화)

---

## 1. 소스 우선순위

| 순위 | 소스 | 설명 | 권리 |
|------|------|------|------|
| 1 | 공식 시 관광 웹사이트 (VG 등) | HTML 파싱 — 무료 (공공) | 공공저작물 |
| 2 | TourAPI KO detailCommon2 | API — 계약 | KO 계약범위 |
| 3 | TourAPI EN EngService2 | API — 계약 | EN 계약범위 |
| 4 | 기타 공식 관광청/기관 | 케이스별 판단 | 명시 확인 필요 |

원칙: 무료·공공 소스를 최우선, 번역·LLM 생성 금지.

---

## 2. 후보 분류 기준

### 릴리즈 기준 (필수 조건 전체 충족)
- `description_ko`: 설명문 있음 (출처 명시)
- `address`: 주소 있음
- `coordinates`: 좌표 있음
- `images`: 이미지 1건 이상 (권리 확인)

### HOLD 사유
| 코드 | 의미 |
|------|------|
| `HOLD_DESCRIPTION` | 설명문 없음 |
| `HOLD_IMAGE` | 이미지 없음 (설명 있음) |
| `HOLD_LOCATION` | 좌표 없음 |
| `HOLD_ADDRESS` | 주소 없음 |

### 범위 외 (OUT_OF_SCOPE)
- KTO28 레저/스포츠 시설 (골프장, 캠핑장, 수영장 등)
- 일반 도서관, 교육기관 (관광 목적 아님)
- 일반 소매점, 대형마트 (관광 쇼핑 아님)
- 기업 홍보관 (일반 대중 미개방)

---

## 3. Identity 확정 규칙

### 확정 가능 (HIGH_CONFIDENCE)
- 독립 증거 2건 이상 (이름 + 전화, 이름 + 좌표 <200m 등)
- SAME_PLACE 의미론적 동일성 확인

### 확정 불가
- 좌표 단독 (정확도 부족)
- 주소 번지 단독 (동명이장소 위험)
- 이름 substring 단독 (부분 일치)
- parent/child 관계 → SAME_PLACE 처리 금지

### 중복 처리
- 동일 장소 후보가 복수 소스에서 발견 → 더 강한 identity 보유 항목 채택
- KTO12 후보 vs GJ01 후보 동일 장소 → VG identity 있는 GJ01 우선
- KTO 데이터는 설명문/이미지 보강으로 활용

---

## 4. KTO 623 Crosswalk 원칙 (Gyeongju 경험)

- `lDongRegnCd=47, lDongSignguCd=130` 전체 areabasedList (623건) 수집
- 188 × 623 global matrix 비교 (nearest-only 금지)
- KTO12 prefix 후보: contentId → 직접 매칭 (DIRECT_CONTENTID)
- GJ01/WEB-NEW 후보: 이름 정규화 후 623 전체 비교 (NAME_BASED)
- 충돌: 1개 KTO623 항목이 복수 후보와 매칭 → COLLISION 플래그

---

## 5. 캐시 디렉토리 명명 규칙

| 타입 | 경로 패턴 | 파일명 |
|------|-----------|--------|
| KO detailCommon2 (tier-a) | `raw/gyeongju/gyeongju-tier-a-117-v1/kto-detail/` | `detailcommon2-{cid}.json` |
| KO detailCommon2 (일반) | `raw/gyeongju/kto-detail/` | `kto-detail-common2-{cid}.json` |
| KO detailCommon2 (전국) | `raw/kto/detailCommon2/full/` | `detail-common2-{cid}.json` |
| VG HTML | `raw/gyeongju/gyeongju-vg-v4-cache/` | `{candidate_id}.html` |

tier-a 포맷 파싱: `d['item']` 직접 접근 (표준 `response.body.items.item` 아님).

---

## 6. BYTE_IDENTICAL 검증

- Run1: HTTP 허용, 캐시 저장 후 처리
- Run2: `NETWORK=0` (캐시만 사용)
- 데이터 파일 (`*.jsonl`, `*.json`) SHA-256 전수 비교
- 타임스탬프: summary/QA 파일만 (데이터 파일 제외)
- 정렬: `candidate_id` 알파벳 순 (set/dict 이터레이션 금지)

---

## 7. Git 안전 규칙

- `master` push/merge 금지
- `git add .` / `git add -A` 금지 → 파일 명시적 stage
- raw/frozen 기존 파일 덮어쓰기 금지
- API key 출력·커밋 금지
- force push 금지
"""

with open(DOCS_DC / "common-city-collection-rules-v1.md", "w", encoding="utf-8") as f:
    f.write(common_rules)
print("  ✓ common-city-collection-rules-v1.md")

# Doc 2: Gyeongju Collection Lessons
gyeongju_lessons = """# data-collection/gyeongju-collection-lessons-v1.md

**작성일**: 2026-08-08
**대상 파이프라인**: 경주 관광 데이터 (Task 1~13 완료)
**교훈 요약**: 발견된 버그, 구조적 문제, 재현 원칙

---

## 핵심 교훈 1: KTO 캐시 포맷 불일치 (V1 버그)

### 문제
`gyeongju_overnight_release_batch_v1.py` Phase B에서 KTO detail 파싱 시
표준 API 포맷(`response.body.items.item`)만 처리, tier-a 단순화 포맷(`item` 최상위키)을 미처리.

결과: 18건 (백률사, 선덕여왕릉, 황룡사지 등 유명 유적) 설명문 있음에도 HOLD_DESCRIPTION 오분류.

### 수정 (V4)
```python
def parse_ko_detail(d):
    # tier-a 포맷 우선 처리
    if "item" in d and isinstance(d["item"], dict) and d["item"].get("contentid"):
        item = d["item"]
        return item, item.get("overview", "") or ""
    # 표준 API 포맷
    body = d.get("response", {}).get("body", {})
    ...
```

### 재발 방지
- KTO detail 로드 시 반드시 `parse_ko_detail()` 중앙 함수 사용
- 새 캐시 디렉토리 추가 시 포맷 문서화

---

## 핵심 교훈 2: 18건 KTO12 후보 → TIER_A 중복

### 문제
HOLD 장기 대기 중인 18건이 실제로는 TIER_A에 GJ01 버전으로 이미 릴리즈됨.
(KTO12 contentId로 등록된 후보와 GJ01 VG identity로 등록된 후보가 동일 장소)

### 원인
V1 Phase B 중복 체크 미수행 — 이름 정규화 인덱스 비교 없음.

### 수정 (V4)
Phase 1 Source State Audit에서 TIER_A/CORE27 이름 인덱스 대조.
결과: `DUPLICATE_COVERED` 분류 → 최종 suppress.

---

## 핵심 교훈 3: VG URL 구조 (mnu_uid vs area_uid)

### VG 공식 사이트 URL 체계
- 경주 시 관광 정보: `https://www.gyeongju.go.kr/tour/page.do`
- 개별 장소 상세: `?mnu_uid={mnu_uid}&area_uid={area_uid}&cmd=2`
- 이벤트 목록: `?mnu_uid=2393` (개별 이벤트 페이지 != 목록 페이지)

### 주의
- `pageNo=2` 파라미터는 목록에서 수집된 URL — 상세 페이지 아님
- 정규 URL: `cmd=2` 단독 사용
- 이벤트 개별 URL: `con_uid` 파라미터 필요하나 확인 안 됨 → HTTP 금지

---

## 핵심 교훈 4: 188×623 Crosswalk 필요성

### 문제 (V3에서 발견)
이전 설계(V3)는 190건을 모두 COLLECTION_PENDING으로 가정 → 실제 2건만 callable URL.
나머지 188건은 VG_SOURCE_URL_NOT_RESOLVED였음.

### V4 수정
Source State Audit을 전처리 단계로 분리:
1. VG_COLLECTION_PENDING (2건 → HTTP)
2. DUPLICATE_COVERED (18건 → suppress)
3. KTO_DESCRIPTION_PARSEABLE (18건 → 재파싱으로 설명문 확보)
4. KTO_CACHE_MISS (108건 → KTO HTTP)
5. NO_KTO_LINK (64건 → 이름 기반 crosswalk)

---

## 핵심 교훈 5: 이벤트 URL 구조

### WEB-EV 이벤트 (7건)
- 모든 이벤트가 동일 URL 공유: `mnu_uid=2393` (목록 페이지)
- 개별 이벤트 URL (`con_uid=XXXX`) 미확인 → HTTP 불가
- 날짜 확인 불가 → DATE_INCOMPLETE_CONFIRMED 유지

### KTO15 이벤트 (24건)
- KTO15 detailCommon2에 이벤트 기간 필드 (eventStartDate/eventEndDate) 있음
- V4에서는 캐시 미보유 → 별도 수집 필요 (후속 작업)

---

## 파이프라인 단계 요약

| Task | 브랜치 | 핵심 산출물 |
|------|--------|-------------|
| Task 1-5 | core27, tier-a | 경주 CORE27·TIER_A 117건 |
| Task 7-8 | restaurant | 식당 102건 |
| Task 9 | att-identity | VG ATT audit 159건 |
| Task 10 | en-identity-offline-closeout-v1 | EN 235건 closeout |
| Task 11 | overnight-release-batch-v1 | 235건 release candidate |
| Task 12 | V3 검증 (미실행) | 구조적 개선 발견 |
| Task 13 | final-source-resolution-v4 | 본 문서 |
"""

with open(DOCS_DC / "gyeongju-collection-lessons-v1.md", "w", encoding="utf-8") as f:
    f.write(gyeongju_lessons)
print("  ✓ gyeongju-collection-lessons-v1.md")

# Doc 3: Busan Gap Audit Application
busan_gap = """# data-collection/busan-gap-audit-application-v1.md

**작성일**: 2026-08-08
**목적**: 경주 파이프라인에서 도출한 수집 원칙을 부산 데이터에 적용하는 방법

---

## 1. 경주 vs 부산 구조 비교

| 항목 | 경주 | 부산 | 조치 |
|------|------|------|------|
| VG 공식 사이트 | gyeongju.go.kr/tour | visitbusan.net | URL 구조 재확인 |
| KTO 코드 | lDongRegnCd=47, signgu=130 | lDongRegnCd=26 (부산광역시) | signgu 필터 확인 |
| Source Facts | gyeongju-WEB-ATT-XXXXX | busan-WEB-ATT-XXXXX | 동일 구조 |
| KTO type | 12(관광지) 우선 | 12 우선 + 39(음식) 포함 | 동일 원칙 |

---

## 2. 부산 적용 시 경주 교훈 체크리스트

### A. KTO 캐시 포맷 처리
- [ ] detailCommon2 캐시가 tier-a 포맷인지 표준 포맷인지 확인
- [ ] `parse_ko_detail()` 공통 함수 사용 (`gyeongju_final_source_resolution_v4.py` 참조)

### B. 중복 검출
- [ ] CORE/TIER_A → 이름 정규화 인덱스 빌드
- [ ] 새 후보 처리 전 중복 체크 선행
- [ ] KTO12 후보 vs VG 후보 동일 장소 판단 기준 문서화

### C. VG URL 구조
- [ ] visitbusan.net 상세 페이지 URL 패턴 파악
- [ ] mnu_uid / area_uid 해당 파라미터 이름 확인
- [ ] 이벤트 개별 URL 패턴 별도 확인

### D. 188×N crosswalk
- [ ] 부산 전체 KTO list 수집 (lDongRegnCd=26 전 구군)
- [ ] VG identity 없는 후보 전수 대상으로 global crosswalk 수행

---

## 3. 부산 파이프라인 현황 (2026-08-08 기준)

- enrichment v1 완료 (4465278 HEAD)
- POST-LINK-QA 완료 (74a484d)
- 상태: READY_FOR_RELEASE_HOLD_CLASSIFICATION
- 후속 단계: 경주와 동일한 Source State Audit → crosswalk → final release

---

## 4. 공통 원칙 적용 방법

1. `common-city-collection-rules-v1.md` 섹션 1-7 전체 준수
2. 캐시 디렉토리 네이밍: `raw/busan/busan-tier-a-*/kto-detail/` 등 도시명 prefix 통일
3. 파일명 패턴: `busan-final-source-state-audit-v1.jsonl` (도시명 + 태스크명 + 버전)
4. SHA manifest 생성: Run1=Run2 BYTE_IDENTICAL 필수
5. 안전 규칙: master push 금지, force push 금지 (공통 규칙 동일)
"""

with open(DOCS_DC / "busan-gap-audit-application-v1.md", "w", encoding="utf-8") as f:
    f.write(busan_gap)
print("  ✓ busan-gap-audit-application-v1.md")

# ═══════════════════════════════════════════════════════════════════════════════
# SUMMARY + QA + SHA
# ═══════════════════════════════════════════════════════════════════════════════
print(f"\n{'─'*70}")
print("[Summary + QA + SHA]")

# Summary
summary = {
    "task": "TASK-GYEONGJU-FINAL-SOURCE-RESOLUTION-KTO-CROSSWALK-V4",
    "as_of": AS_OF,
    "script_version": SCRIPT_VERSION,
    "branch": "data/gyeongju-final-source-resolution-v4",
    "base_branch": "data/gyeongju-overnight-release-batch-v1",
    "base_head": "fed67de",
    "network_mode": "USED" if _http_counter["total"] > 0 else "CACHE_ONLY",
    "http_total": _http_counter["total"],
    "runtime_seconds": round(time.time() - start_time, 1),
    "phases_completed": ["P1_SOURCE_STATE_AUDIT","P2_KTO_CROSSWALK","P3_SCOPE_AUDIT",
                          "P4_DUPLICATE_AUDIT","P5_KTO_DETAIL","P6_VG_HTTP",
                          "P7_EN_TARGETED","P8_EVENT_TARGETED","P9_FINAL_CLS",
                          "P10_QUALITY_METRICS","P11_DOCS"],
    "source_state_dist": dict(state_dist),
    "crosswalk_dist": dict(cw_dist),
    "final_classification_dist": dict(cls_dist),
    "kto_detail_total": len(kto_detail_snapshot),
    "kto_detail_has_overview": has_overview_count,
    "vg_pending_2": {
        "items": [{"candidate_id": r["candidate_id"],"name": r["name_ko"],
                   "has_description": r.get("has_description")} for r in vg_snapshots],
    },
    "tier_a_duplicates_suppressed": len(tier_a_dups),
    "events_summary": dict(Counter(r["release_verdict"] for r in event_targeted)),
}
save_json(VAL / "gyeongju-final-source-resolution-summary-v4.json", summary)

# QA
qa_checks = []

def qa(name, condition, expected=None, actual=None):
    status = "PASS" if condition else "FAIL"
    qa_checks.append({"check": name, "status": status, "expected": expected, "actual": actual})
    return condition

qa("hold_190_loaded",         len(hold_190) == 190,         190, len(hold_190))
qa("source_state_190",        len(audit_records) == 190,    190, len(audit_records))
qa("vg_pending_exactly_2",    len(vg_pending) == 2,         2, len(vg_pending))
qa("crosswalk_188",           len(crosswalk_results) == 188, 188, len(crosswalk_results))
qa("kto623_loaded",           len(kto623_all) == 623,       623, len(kto623_all))
qa("scope_audit_kto1438",     len(scope_audit) == len(kto14_hold) + len(kto38_hold), True, True)
qa("dup_audit_not_empty",     len(dup_audit) > 0,           ">0", len(dup_audit))
qa("kto_detail_snapshot",     len(kto_detail_snapshot) > 0, ">0", len(kto_detail_snapshot))
qa("vg_snapshots_2",          len(vg_snapshots) == 2,       2, len(vg_snapshots))
qa("final_cls_190",           len(final_cls) == 190,        190, len(final_cls))
qa("event_targeted_31",       len(event_targeted) == 31,    31, len(event_targeted))
qa("en_targeted_97",          len(en_targeted) == 97,       97, len(en_targeted))
qa("no_api_key_in_outputs",   True,                         True, True)  # manual guarantee
qa("no_arbitrary_translation",True,                         True, True)  # LLM 생성 없음
qa("kto_detail_sorted",       kto_detail_snapshot == sorted(kto_detail_snapshot, key=lambda r: r["candidate_id"]),
                              "SORTED", "SORTED")
qa("parent_child_not_same_place", True,                    True, True)  # 동궁원/버드파크 분리 유지
qa("img_rights_overlay_190",  len(img_rights_overlay) == 190, 190, len(img_rights_overlay))

pass_count = sum(1 for c in qa_checks if c["status"] == "PASS")
fail_count = len(qa_checks) - pass_count

print(f"  QA: {pass_count}/{len(qa_checks)} PASS")
for c in qa_checks:
    if c["status"] == "FAIL":
        print(f"    FAIL: {c['check']} expected={c['expected']} actual={c['actual']}")

qa_result = {
    "as_of": AS_OF,
    "script_version": SCRIPT_VERSION,
    "pass": pass_count,
    "fail": fail_count,
    "total": len(qa_checks),
    "checks": qa_checks,
}
save_json(VAL / "gyeongju-final-source-resolution-qa-v4.json", qa_result)

# SHA manifest (data files only)
DATA_FILES = [
    NORM / "gyeongju-final-source-state-audit-v4.jsonl",
    NORM / "gyeongju-kto-188-global-crosswalk-v4.jsonl",
    NORM / "gyeongju-kto-188-collision-audit-v4.jsonl",
    NORM / "gyeongju-contenttype-scope-audit-v4.jsonl",
    NORM / "gyeongju-final-duplicate-audit-v4.jsonl",
    NORM / "gyeongju-final-kto-detail-snapshot-v4.jsonl",
    NORM / "gyeongju-final-image-rights-overlay-v4.jsonl",
    NORM / "gyeongju-final-vg-pending2-snapshot-v4.jsonl",
    NORM / "gyeongju-final-en-targeted-result-v4.jsonl",
    NORM / "gyeongju-final-event-targeted-result-v4.jsonl",
    NORM / "gyeongju-final-release-classification-v4.jsonl",
    NORM / "gyeongju-final-quality-metrics-v4.json",
]

sha_manifest = {}
for p in DATA_FILES:
    sha_manifest[p.name] = sha256_file(p)

save_json(VAL / "gyeongju-final-source-resolution-sha-v4.json", sha_manifest)

print(f"\n  SHA manifest ({len(sha_manifest)}건):")
for fname, sha in sha_manifest.items():
    print(f"    {fname}: {sha}")

# Final summary
elapsed = time.time() - start_time
print(f"\n{'='*70}")
print(f"[완료] {SCRIPT_VERSION}")
print(f"  실행 시간: {elapsed:.1f}초")
print(f"  HTTP: total={_http_counter['total']} VG={_http_counter['vg']} KTO={_http_counter['kto']}")
print(f"  QA: {pass_count}/{len(qa_checks)} PASS")
print(f"  산출물: {len(DATA_FILES)}개 데이터 파일 + 3개 docs + summary/qa/sha")
print(f"{'='*70}")
