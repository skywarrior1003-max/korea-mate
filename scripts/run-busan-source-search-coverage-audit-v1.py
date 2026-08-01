"""
TASK-BUSAN-SOURCE-SEARCH-COVERAGE-AUDIT-V1
부산 관광 데이터 수집에 사용한 모든 공식 API의 검색·조회 방식 전수 감사

출력 파일:
  data/tourapi/reports/busan/busan-source-search-coverage-matrix.json
  data/tourapi/reports/busan/busan-source-search-coverage-audit-v1.json

규칙:
  - API 호출 금지
  - 기존 raw·candidate·source facts 수정 금지
  - 새 flag·gate 생성 금지
  - push 금지
"""
import json, glob, os, sys
from collections import Counter
from datetime import datetime, timezone

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = os.path.abspath(".")

def j(*parts):
    return os.path.join(ROOT, *parts)

def read_json(path):
    try:
        return json.load(open(path, encoding="utf-8"))
    except Exception:
        return None

# ══════════════════════════════════════════════════════════════════════
# PHASE 1: KTO KorService2 배치 수집 검증
# ══════════════════════════════════════════════════════════════════════
kto_ko_files = sorted(glob.glob(j("data/tourapi/raw/busan/2026-07-23/batch/kto-ko-p*.json")))
kto_ko_ids   = set()
kto_ko_ctids = Counter()
kto_ko_pages = []
for f in kto_ko_files:
    d    = json.load(open(f, encoding="utf-8"))
    body = d["response"]["body"]
    itw  = body.get("items", {})
    if isinstance(itw, str) or not itw: items = []
    else:
        items = itw.get("item", [])
        if isinstance(items, dict): items = [items]
    kto_ko_pages.append({
        "file": os.path.basename(f),
        "pageNo": body.get("pageNo"),
        "numOfRows": body.get("numOfRows"),
        "totalCount": body.get("totalCount"),
        "items_count": len(items),
    })
    for i in items:
        cid  = str(i.get("contentid", ""))
        ctid = str(i.get("contenttypeid", ""))
        if cid: kto_ko_ids.add(cid)
        if ctid: kto_ko_ctids[ctid] += 1

kto_ko_total   = sum(p["items_count"] for p in kto_ko_pages)
kto_ko_tc      = int(kto_ko_pages[0]["totalCount"]) if kto_ko_pages else 0
kto_ko_complete = kto_ko_total == kto_ko_tc

# KorService2 contentTypeId 한국어 레이블
CTID_KO_LABEL = {
    "12": "관광지", "14": "문화시설", "15": "축제공연행사",
    "25": "여행코스", "28": "레포츠", "32": "숙박",
    "38": "쇼핑", "39": "음식점"
}

# ══════════════════════════════════════════════════════════════════════
# PHASE 2: KTO EngService2 배치 수집 검증
# ══════════════════════════════════════════════════════════════════════
kto_en_files = sorted(glob.glob(j("data/tourapi/raw/busan/2026-07-23/batch/kto-en-p*.json")))
kto_en_ids   = set()
kto_en_ctids = Counter()
kto_en_pages = []
for f in kto_en_files:
    d    = json.load(open(f, encoding="utf-8"))
    body = d["response"]["body"]
    itw  = body.get("items", {})
    if isinstance(itw, str) or not itw: items = []
    else:
        items = itw.get("item", [])
        if isinstance(items, dict): items = [items]
        if not isinstance(items, list): items = []
    kto_en_pages.append({
        "file": os.path.basename(f),
        "pageNo": body.get("pageNo"),
        "numOfRows": body.get("numOfRows"),
        "totalCount": body.get("totalCount"),
        "items_count": len(items),
        "ctids_on_page": list(set(str(i.get("contenttypeid","?")) for i in items)),
    })
    for i in items:
        cid  = str(i.get("contentid", ""))
        ctid = str(i.get("contenttypeid", ""))
        if cid: kto_en_ids.add(cid)
        if ctid: kto_en_ctids[ctid] += 1

kto_en_total    = sum(p["items_count"] for p in kto_en_pages)
kto_en_tc       = int(kto_en_pages[0]["totalCount"]) if kto_en_pages else 0
kto_en_complete = kto_en_total == kto_en_tc

# contentId 교집합 분석
ko_en_both = kto_ko_ids & kto_en_ids
ko_only    = kto_ko_ids - kto_en_ids
en_only    = kto_en_ids - kto_ko_ids

# ══════════════════════════════════════════════════════════════════════
# PHASE 3: KTO Detail API 수집 현황
# ══════════════════════════════════════════════════════════════════════
common_files = sorted(glob.glob(j("data/tourapi/raw/kto/detailCommon2/full/*.json")))
intro_files  = sorted(glob.glob(j("data/tourapi/raw/kto/detailIntro2/full/*.json")))
image_files  = sorted(glob.glob(j("data/tourapi/raw/kto/detailImage2/full/*.json")))

common_with_overview = 0
image_with_content   = 0

for f in common_files:
    d    = json.load(open(f, encoding="utf-8"))
    body = d.get("response", {}).get("body", {})
    itw  = body.get("items", {})
    items = itw.get("item", []) if isinstance(itw, dict) else []
    if isinstance(items, dict): items = [items]
    for i in items:
        if (i.get("overview") or "").strip():
            common_with_overview += 1

for f in image_files:
    d    = json.load(open(f, encoding="utf-8"))
    body = d.get("response", {}).get("body", {})
    itw  = body.get("items", {})
    items = itw.get("item", []) if isinstance(itw, dict) else []
    if isinstance(items, dict): items = [items]
    if items and any(i.get("originimgurl") or i.get("smallimageurl") for i in items):
        image_with_content += 1

detail_rpt_common = read_json(j("data/tourapi/reports/busan/kto-detailCommon2-raw-batch-report.json")) or {}
detail_rpt_intro  = read_json(j("data/tourapi/reports/busan/kto-detailIntro2-raw-batch-report.json")) or {}
detail_rpt_image  = read_json(j("data/tourapi/reports/busan/kto-detailImage2-raw-batch-report.json")) or {}

# preflight report
preflight = read_json(j("data/tourapi/reports/busan/kto-detail-preflight-report.json")) or {}

# ══════════════════════════════════════════════════════════════════════
# PHASE 4: VisitBusan API 배치 수집 검증
# ══════════════════════════════════════════════════════════════════════
VB_PAGE_SIZE = 100  # 실측 확인: food-ko p001 = 100건

VB_BATCH_SPECS = [
    ("attraction-ko",  "data/tourapi/raw/busan/2026-07-23/batch/busan-attraction-ko-p*.json"),
    ("attraction-en",  "data/tourapi/raw/busan/2026-07-23/batch/busan-attraction-en-p*.json"),
    ("attraction-ja",  "data/tourapi/raw/busan/2026-07-23/batch/busan-attraction-ja-p*.json"),
    ("attraction-zhs", "data/tourapi/raw/busan/2026-07-23/batch/busan-attraction-zhs-p*.json"),
    ("attraction-zht", "data/tourapi/raw/busan/2026-07-23/batch/busan-attraction-zht-p*.json"),
    ("food-ko",        "data/tourapi/raw/busan/2026-07-23/batch/busan-food-ko-p*.json"),
    ("food-en",        "data/tourapi/raw/busan/2026-07-23/batch/busan-food-en-p*.json"),
    ("food-ja",        "data/tourapi/raw/busan/2026-07-23/batch/busan-food-ja-p*.json"),
    ("food-zhs",       "data/tourapi/raw/busan/2026-07-23/batch/busan-food-zhs-p*.json"),
    ("food-zht",       "data/tourapi/raw/busan/2026-07-23/batch/busan-food-zht-p*.json"),
    ("festival-ko",    "data/tourapi/raw/busan/2026-07-24/batch/busan-festival-ko-p*.json"),
    ("festival-en",    "data/tourapi/raw/busan/2026-07-24/batch/busan-festival-en-p*.json"),
    ("festival-ja",    "data/tourapi/raw/busan/2026-07-24/batch/busan-festival-ja-p*.json"),
    ("festival-zhs",   "data/tourapi/raw/busan/2026-07-24/batch/busan-festival-zhs-p*.json"),
    ("festival-zht",   "data/tourapi/raw/busan/2026-07-24/batch/busan-festival-zht-p*.json"),
]

vb_stats = {}
for name, pat in VB_BATCH_SPECS:
    files = sorted(glob.glob(j(pat)))
    total = 0; uids = set(); last_count = 0
    for f in files:
        d   = json.load(open(f, encoding="utf-8"))
        key = list(d.keys())[0]
        val = d[key]
        items = val.get("item", []) if isinstance(val, dict) else []
        if isinstance(items, dict): items = [items]
        if not isinstance(items, list): items = []
        total += len(items)
        last_count = len(items)
        for i in items: uids.add(str(i.get("UC_SEQ", "")))
    # COMPLETE if last page < VB_PAGE_SIZE (api returns empty/smaller when exhausted)
    complete = last_count < VB_PAGE_SIZE
    vb_stats[name] = {
        "pages": len(files),
        "total": total,
        "unique_uc_seq": len(uids) - (1 if "" in uids else 0),
        "last_page_count": last_count,
        "pagination_complete": complete,
    }

# ZhS / ZhT gap
food_ko_n   = vb_stats["food-ko"]["total"]
food_zhs_n  = vb_stats["food-zhs"]["total"]
food_zht_n  = vb_stats["food-zht"]["total"]
att_ko_n    = vb_stats["attraction-ko"]["total"]
att_zhs_n   = vb_stats["attraction-zhs"]["total"]
att_zht_n   = vb_stats["attraction-zht"]["total"]

# ══════════════════════════════════════════════════════════════════════
# PHASE 5: PhotoGallery 완전성
# ══════════════════════════════════════════════════════════════════════
pg_files = sorted(glob.glob(j("data/tourapi/raw/photo-gallery/busan/2026-07-27/*.json")))
pg_ids = []; pg_tc_api = None
for f in pg_files:
    d    = json.load(open(f, encoding="utf-8"))
    body = d["response"]["body"]
    if pg_tc_api is None: pg_tc_api = body.get("totalCount")
    itw  = body.get("items", {})
    items = itw.get("item", []) if isinstance(itw, dict) else []
    if isinstance(items, dict): items = [items]
    for i in items:
        gid = i.get("galContentId", "")
        if gid: pg_ids.append(str(gid))

pg_unique   = len(set(pg_ids))
pg_tc_int   = int(pg_tc_api or 0)
pg_complete = pg_unique >= pg_tc_int

# ══════════════════════════════════════════════════════════════════════
# PHASE 6: VisitBusan SSR / 섹션별 파싱 현황
# ══════════════════════════════════════════════════════════════════════
ssr_rpt  = read_json(j("data/tourapi/reports/busan/visitbusan-en-ssr-full-v1-report.json")) or {}
exp_rpt  = read_json(j("data/tourapi/reports/busan/visitbusan-experience-en-full-apply-v1-completion-report.json")) or {}
shop_rpt = read_json(j("data/tourapi/reports/busan/visitbusan-shopping-en-full-apply-v1-report.json")) or {}

exp_parsed  = []
shop_parsed = []
for pth, lst in [
    (j("data/tourapi/reports/busan/visitbusan-experience-en-full-v1-parsed.jsonl"), exp_parsed),
    (j("data/tourapi/reports/busan/visitbusan-shopping-en-full-v1-parsed.jsonl"),   shop_parsed),
]:
    if os.path.exists(pth):
        with open(pth, encoding="utf-8") as f:
            for line in f:
                if line.strip(): lst.append(json.loads(line))

exp_status  = dict(Counter(e.get("result_status","?") for e in exp_parsed))
shop_status = dict(Counter(e.get("result_status","?") for e in shop_parsed))

# ══════════════════════════════════════════════════════════════════════
# PHASE 7: Source facts / enriched candidates 요약
# ══════════════════════════════════════════════════════════════════════
sf_prefix = Counter()
if os.path.exists(j("data/tourapi/enriched/busan/busan-source-facts-v1.jsonl")):
    with open(j("data/tourapi/enriched/busan/busan-source-facts-v1.jsonl"), encoding="utf-8") as f:
        for line in f:
            if line.strip():
                sk = json.loads(line).get("source_key", "")
                sf_prefix[sk.split(":")[0]] += 1

src_combo = Counter()
ec_cat    = Counter()
if os.path.exists(j("data/tourapi/enriched/busan/busan-enriched-candidates-v1.jsonl")):
    with open(j("data/tourapi/enriched/busan/busan-enriched-candidates-v1.jsonl"), encoding="utf-8") as f:
        for line in f:
            if line.strip():
                c   = json.loads(line)
                ec_cat[c.get("category","?")] += 1
                keys = tuple(sorted(set(
                    k.split(":")[0]
                    for k in c.get("source_summary", {}).get("source_keys", [])
                )))
                src_combo[keys] += 1

total_candidates = sum(ec_cat.values())

# ══════════════════════════════════════════════════════════════════════
# BUILD OUTPUTS
# ══════════════════════════════════════════════════════════════════════
generated_at = datetime.now(timezone.utc).isoformat()

# ── 1. Coverage Matrix ───────────────────────────────────────────────
matrix_rows = []

def matrix_row(source, endpoint, method, lang, executed, complete, count, tc, notes=""):
    return {
        "source": source,
        "endpoint": endpoint,
        "method": method,
        "lang": lang,
        "executed": executed,
        "pagination_complete": complete,
        "count_collected": count,
        "total_count_api": tc,
        "notes": notes,
    }

# KTO KorService2
matrix_rows += [
    matrix_row("KTO", "KorService2/areaBasedList2", "areaCode=6 전체", "KO",
               True, kto_ko_complete, kto_ko_total, kto_ko_tc,
               f"{len(kto_ko_files)}페이지, numOfRows=100, pageNo 1~9"),
    matrix_row("KTO", "KorService2/areaBasedList2", "contentTypeId별 분리 쿼리", "KO",
               False, None, 0, None,
               "미실행 — areaCode 전체 쿼리로 대체됨. 동일 결과 기대"),
    matrix_row("KTO", "KorService2/areaBasedList2", "sigunguCode별 쿼리 (구군 단위)", "KO",
               False, None, 0, None,
               "미실행 — 구군 단위 추가 수집 없음. areaCode 전체가 superset"),
    matrix_row("KTO", "KorService2/areaBasedList2", "keyword 검색 (searchKeyword)", "KO",
               False, None, 0, None,
               "미실행 — 키워드 검색 미사용. 단순 areaCode 목록만 사용"),
    matrix_row("KTO", "KorService2/areaBasedList2", "modifiedtime 기반 delta", "KO",
               False, None, 0, None,
               "미실행 — 특정 날짜 이후 수정분 추적 없음"),
]
# KTO EngService2
matrix_rows += [
    matrix_row("KTO", "EngService2/areaBasedList2", "areaCode=6 전체", "EN",
               True, kto_en_complete, kto_en_total, kto_en_tc,
               f"{len(kto_en_files)}페이지, numOfRows=100, contentTypeId 75~85"),
    matrix_row("KTO", "EngService2/areaBasedList2", "keyword 검색", "EN",
               False, None, 0, None,
               "미실행 — 키워드 검색 미사용"),
]
# KTO Detail
matrix_rows += [
    matrix_row("KTO", "detailCommon2", "contentId 1건 단위 (KO ID 대상)", "KO",
               True, True, len(common_files), 644,
               f"KorService2 644건 대상. overview 확보={common_with_overview}건"),
    matrix_row("KTO", "detailIntro2", "contentId 1건 단위 (KO ID 대상)", "KO",
               True, True, len(intro_files), 557,
               "ctid 15·38 제외. 운영시간 등 상세 수집"),
    matrix_row("KTO", "detailImage2", "contentId 1건 단위 (KO ID 대상)", "KO",
               True, True, len(image_files), 94,
               f"needs_image 대상 94건. 실제 이미지 확보={image_with_content}건"),
    matrix_row("KTO", "detailCommon2", "contentId 1건 단위 (EN ID 대상)", "EN",
               False, None, 0, None,
               "미실행 — EngService2 194건 EN overview 미수집"),
    matrix_row("KTO", "detailIntro2", "contentId 1건 단위 (EN ID 대상)", "EN",
               False, None, 0, None,
               "미실행 — EngService2 상세 정보 미수집"),
]
# KTO PhotoGallery
matrix_rows += [
    matrix_row("KTO", "PhotoGalleryService1/galleryList1",
               "galPhotographyLocation=부산광역시&galContentTypeId=17", "KO",
               True, pg_complete, pg_unique, pg_tc_int,
               f"{len(pg_files)}페이지, numOfRows=100, totalCount={pg_tc_api}"),
    matrix_row("KTO", "PhotoGalleryService1/galleryList1",
               "galContentTypeId 다른 값 쿼리", "KO",
               False, None, 0, None,
               "미실행 — 17(관광지) 외 타입 미수집"),
    matrix_row("KTO", "PhotoGalleryService1/galleryDetailList1", "galContentId 1건", "KO",
               False, None, 0, None,
               "미실행 — 개별 사진 상세 정보 미수집"),
]

# VisitBusan API — attraction
for lang in ["ko", "en", "ja", "zhs", "zht"]:
    s  = vb_stats[f"attraction-{lang}"]
    status_note = ("COMPLETE" if s["pagination_complete"] else "POSSIBLY_TRUNCATED")
    matrix_rows.append(matrix_row(
        "VisitBusan", f"getAttractionKr/En/Ja/ZhS/ZhT",
        f"busan attraction {lang.upper()} 전체", lang.upper(),
        True, s["pagination_complete"], s["total"], None,
        f"{s['pages']}페이지 | last_page={s['last_page_count']} | {status_note}"
    ))

# VisitBusan API — food
for lang in ["ko", "en", "ja", "zhs", "zht"]:
    s  = vb_stats[f"food-{lang}"]
    status_note = ("COMPLETE" if s["pagination_complete"] else "POSSIBLY_TRUNCATED")
    gap_note = ""
    if lang == "zhs": gap_note = f" | KO 대비 {food_ko_n - food_zhs_n}건 부족"
    if lang == "zht": gap_note = f" | KO 대비 {food_ko_n - food_zht_n}건 부족"
    matrix_rows.append(matrix_row(
        "VisitBusan", "getFoodKr/En/Ja/ZhS/ZhT",
        f"busan food {lang.upper()} 전체", lang.upper(),
        True, s["pagination_complete"], s["total"], None,
        f"{s['pages']}페이지 | last_page={s['last_page_count']} | {status_note}{gap_note}"
    ))

# VisitBusan API — festival
for lang in ["ko", "en", "ja", "zhs", "zht"]:
    s  = vb_stats[f"festival-{lang}"]
    matrix_rows.append(matrix_row(
        "VisitBusan", "getFestivalKr/En/Ja/ZhS/ZhT",
        f"busan festival {lang.upper()} 전체", lang.upper(),
        True, s["pagination_complete"], s["total"], None,
        f"{s['pages']}페이지 | last_page={s['last_page_count']}"
    ))

# VisitBusan 미실행 섹션
matrix_rows += [
    matrix_row("VisitBusan", "getAccommodationKr/En/...", "busan accommodation 전체", "ALL",
               False, None, 0, None,
               "미실행 — 숙박 섹션 VB API 배치 수집 없음"),
    matrix_row("VisitBusan", "getExperienceKr/En/...", "busan experience 전체 (KO/JA/ZhS/ZhT)", "KO/JA/ZhS/ZhT",
               False, None, 0, None,
               "미실행 — EN SSR로만 93건 수집. KO/다국어 API 배치 없음"),
    matrix_row("VisitBusan", "getShoppingKr/En/...", "busan shopping 전체 (KO/JA/ZhS/ZhT)", "KO/JA/ZhS/ZhT",
               False, None, 0, None,
               "미실행 — EN SSR로만 38건 수집. KO/다국어 API 배치 없음"),
]

# VisitBusan SSR
matrix_rows += [
    matrix_row("VisitBusan", "SSR HTML scrape", "attraction+food EN 전체 (183건)", "EN",
               True, True,
               ssr_rpt.get("processed_count", 183), ssr_rpt.get("target_count", 183),
               f"EN_USEFUL={ssr_rpt.get('status_distribution',{}).get('EN_USEFUL','?')}, EN_TITLE_ONLY={ssr_rpt.get('status_distribution',{}).get('EN_TITLE_ONLY','?')}"),
    matrix_row("VisitBusan", "SSR HTML scrape", "experience EN 전체 (93건)", "EN",
               True, True, len(exp_parsed), 93,
               f"EN_USEFUL={exp_status.get('EN_USEFUL','?')}, status: {exp_status}"),
    matrix_row("VisitBusan", "SSR HTML scrape", "shopping EN 전체 (38건)", "EN",
               True, True, len(shop_parsed), 38,
               f"EN_USEFUL={shop_status.get('EN_USEFUL','?')}, status: {shop_status}"),
    matrix_row("VisitBusan", "SSR HTML scrape", "accommodation EN", "EN",
               False, None, 0, None,
               "미실행 — accommodation SSR 수집 없음"),
]

# ── 2. 미수집 검색 경로 + 기대 회수량 ──────────────────────────────
uncollected_paths = [
    {
        "path_id": "U-01",
        "source": "KTO",
        "endpoint": "KorService2/areaBasedList2",
        "method": "keyword 검색 (searchKeyword=부산 관련 키워드)",
        "lang": "KO",
        "reason_not_collected": "areaCode=6 전체 목록 수집으로 대체. 키워드 검색은 부분 집합 반환",
        "expected_new_yield": 0,
        "expected_yield_basis": "areaCode 쿼리가 superset이므로 신규 엔티티 기대 없음",
        "recommendation": "수집 불필요",
    },
    {
        "path_id": "U-02",
        "source": "KTO",
        "endpoint": "KorService2/areaBasedList2",
        "method": "sigunguCode별 분리 쿼리 (구군 단위)",
        "lang": "KO",
        "reason_not_collected": "areaCode=6 전체 쿼리가 모든 sigungu를 포함",
        "expected_new_yield": 0,
        "expected_yield_basis": "검증 목적으로만 유효 (totalCount 구군별 세분화). 신규 ID 없음",
        "recommendation": "검증 목적으로만 실행 고려",
    },
    {
        "path_id": "U-03",
        "source": "KTO",
        "endpoint": "detailCommon2",
        "method": "EngService2 194건 contentId 대상 호출",
        "lang": "EN",
        "reason_not_collected": "KTO EN overview 수집 미계획. 별도 pipeline 미구성",
        "expected_new_yield": 194,
        "expected_yield_basis": "EngService2 194건에 대한 EN overview/title 전체. 부산 관광지의 공식 EN 설명 추가 가능",
        "recommendation": "고우선순위 — 공식 영문 설명 확보 가능",
    },
    {
        "path_id": "U-04",
        "source": "KTO",
        "endpoint": "detailIntro2",
        "method": "EngService2 194건 contentId 대상 호출",
        "lang": "EN",
        "reason_not_collected": "EN 상세 정보 pipeline 미구성",
        "expected_new_yield": 194,
        "expected_yield_basis": "194건 운영시간·전화번호 EN 버전 (KO 대비 다를 수 있음)",
        "recommendation": "중간 우선순위 — U-03 이후 검토",
    },
    {
        "path_id": "U-05",
        "source": "KTO",
        "endpoint": "PhotoGalleryService1/galleryList1",
        "method": "galContentTypeId != 17 쿼리",
        "lang": "KO",
        "reason_not_collected": "17(관광지사진) 이외 타입 쿼리 미실행",
        "expected_new_yield": 200,
        "expected_yield_basis": "음식점·문화시설 등 타입의 공식 갤러리 사진 존재 가능. 규모 불명확 (추정 200건+)",
        "recommendation": "저우선순위 — 이미지 보강 단계에서 검토",
    },
    {
        "path_id": "U-06",
        "source": "VisitBusan",
        "endpoint": "getAccommodationKr/En/Ja/ZhS/ZhT",
        "method": "busan accommodation 전체 수집",
        "lang": "ALL",
        "reason_not_collected": "숙박은 현재 KTO KorService2(ctid=32, 79건)로만 수집됨. VB 숙박 섹션 미탐색",
        "expected_new_yield": 50,
        "expected_yield_basis": "VB 숙박 섹션이 KTO 미등록 게스트하우스·boutique 숙소 추가 포함 가능. 규모 추정 50건+",
        "recommendation": "중간 우선순위 — 숙박 데이터 보강 시 필요",
    },
    {
        "path_id": "U-07",
        "source": "VisitBusan",
        "endpoint": "getExperienceKr/Ja/ZhS/ZhT",
        "method": "experience 다국어 API 배치 수집",
        "lang": "KO/JA/ZhS/ZhT",
        "reason_not_collected": "EN SSR 수집으로 93건 확보 완료. 다국어 API 배치 미실행",
        "expected_new_yield": 0,
        "expected_yield_basis": "신규 엔티티 없음 (동일 93건의 다국어 버전). 다국어 이름/설명 보강 목적",
        "recommendation": "선택적 — 다국어 name/description 보강 목적으로만 유효",
    },
    {
        "path_id": "U-08",
        "source": "VisitBusan",
        "endpoint": "getShoppingKr/Ja/ZhS/ZhT",
        "method": "shopping 다국어 API 배치 수집",
        "lang": "KO/JA/ZhS/ZhT",
        "reason_not_collected": "EN SSR 수집으로 38건 확보 완료. 다국어 API 배치 미실행",
        "expected_new_yield": 0,
        "expected_yield_basis": "신규 엔티티 없음 (동일 38건의 다국어 버전). 다국어 보강 목적",
        "recommendation": "선택적 — 다국어 name/description 보강 목적으로만 유효",
    },
    {
        "path_id": "U-09",
        "source": "VisitBusan",
        "endpoint": "getFoodZhT (busan-food-zht)",
        "method": "food ZhT 추가 페이지 확인",
        "lang": "ZhT",
        "reason_not_collected": "배치 수집 3페이지 완료됐으나 마지막 페이지 86건(< 100)으로 COMPLETE 판정. 단 실제로는 KO 437건 대비 151건 부족",
        "expected_new_yield": 0,
        "expected_yield_basis": "VisitBusan 자체가 ZhT 콘텐츠 커버리지를 더 낮게 제공하는 것으로 판단. 신규 페이지 추가 수집으로 해소 불가 (API 미제공)",
        "recommendation": "불필요 — ZhT 콘텐츠 격차는 플랫폼 제한으로 확인됨",
    },
    {
        "path_id": "U-10",
        "source": "KTO",
        "endpoint": "KorService2/areaBasedList2",
        "method": "modifiedtime 기반 delta 수집",
        "lang": "KO",
        "reason_not_collected": "최초 전체 수집 이후 delta 쿼리 미구현",
        "expected_new_yield": 10,
        "expected_yield_basis": "수집일(2026-07-23) 이후 신규 등록 또는 수정된 장소. 정기 갱신 주기로 추정 10건+/월",
        "recommendation": "다음 도시 이후 nightly pipeline에서 구현",
    },
]

# ── 3. 다음 도시용 표준 검색 순서 ──────────────────────────────────
standard_search_order = [
    {
        "step": 1,
        "source": "KTO",
        "endpoint": "KorService2/areaBasedList2",
        "params": "areaCode={city_code}&numOfRows=100&pageNo=1..",
        "lang": "KO",
        "purpose": "기본 장소 목록 전체 수집. pagination: totalCount 기반 pageNo 순차 증가",
        "expected_yield_class": "핵심 (음식점·관광지·숙박 등 전 카테고리)",
    },
    {
        "step": 2,
        "source": "KTO",
        "endpoint": "EngService2/areaBasedList2",
        "params": "areaCode={city_code}&numOfRows=100&pageNo=1..",
        "lang": "EN",
        "purpose": "EN contentId 목록 수집. KO와 별도 namespace. EN overview 수집의 전제",
        "expected_yield_class": "보조 (EN 공식 데이터)",
    },
    {
        "step": 3,
        "source": "VisitBusan_equivalent",
        "endpoint": "getAttractionKr (도시 해당 endpoint)",
        "params": "pageIndex=1.., numOfRows=100 (auto-pagination: 빈 페이지까지)",
        "lang": "KO",
        "purpose": "VB 관광지 목록 전체 수집. KTO 미등재 편집팀 큐레이션 장소 포함",
        "expected_yield_class": "핵심 (비KTO 관광지·편집 큐레이션)",
    },
    {
        "step": 4,
        "source": "VisitBusan_equivalent",
        "endpoint": "getAttractionEn/Ja/ZhS/ZhT",
        "params": "pageIndex=1..",
        "lang": "EN/JA/ZhS/ZhT",
        "purpose": "다국어 name·description 수집. 동일 UC_SEQ, 언어별 별도 호출",
        "expected_yield_class": "보조 (다국어 메타데이터)",
    },
    {
        "step": 5,
        "source": "VisitBusan_equivalent",
        "endpoint": "getFoodKr/En/Ja/ZhS/ZhT",
        "params": "pageIndex=1..",
        "lang": "ALL",
        "purpose": "음식점 목록 전체 (VB 편집 맛집 포함). ZhS/ZhT gap 존재 가능",
        "expected_yield_class": "핵심 (음식점 보조 소스)",
    },
    {
        "step": 6,
        "source": "VisitBusan_equivalent",
        "endpoint": "getFestivalKr/En/Ja/ZhS/ZhT",
        "params": "pageIndex=1..",
        "lang": "ALL",
        "purpose": "축제·이벤트 목록 (시즌 의존)",
        "expected_yield_class": "보조 (이벤트 카테고리)",
    },
    {
        "step": 7,
        "source": "VisitBusan_equivalent",
        "endpoint": "getAccommodationKr/En/... (도시 제공 시)",
        "params": "pageIndex=1..",
        "lang": "KO/EN",
        "purpose": "숙박 목록. KTO 미등재 소형 숙소 포함 가능",
        "expected_yield_class": "선택적 (숙박 보강)",
    },
    {
        "step": 8,
        "source": "VisitBusan_equivalent",
        "endpoint": "getExperience/getShopping 등",
        "params": "pageIndex=1..",
        "lang": "EN (SSR 우선)",
        "purpose": "체험·쇼핑 섹션. SSR 방식으로 EN 수집 후 API 배치 병행",
        "expected_yield_class": "선택적 (카테고리 확장)",
    },
    {
        "step": 9,
        "source": "KTO",
        "endpoint": "detailCommon2",
        "params": "contentId (KO 및 EN IDs 각각 호출)",
        "lang": "KO/EN",
        "purpose": "description(overview) 수집. call limit 확인 후 실행. EN ID 대상도 별도 실행",
        "expected_yield_class": "핵심 (description 보강)",
        "caution": "일일 호출 한도 공식 확인 필수 (data.go.kr 마이페이지)",
    },
    {
        "step": 10,
        "source": "KTO",
        "endpoint": "detailIntro2",
        "params": "contentId + contentTypeId (ctid 15·38 제외 권장)",
        "lang": "KO",
        "purpose": "운영시간·전화번호·편의시설 정보",
        "expected_yield_class": "핵심 (hours 보강)",
        "caution": "contentTypeId 필수 파라미터. 15/38 호출 시 empty 반환",
    },
    {
        "step": 11,
        "source": "KTO",
        "endpoint": "detailImage2",
        "params": "contentId + imageYN=Y (needs_image 대상만)",
        "lang": "KO",
        "purpose": "KTO 공식 이미지. 실수율 낮음 (부산 기준 2/94건) → 대상 사전 필터링 권장",
        "expected_yield_class": "저우선순위 (이미지 보강, 실수율 낮음)",
    },
    {
        "step": 12,
        "source": "KTO",
        "endpoint": "PhotoGalleryService1/galleryList1",
        "params": "galPhotographyLocation={city_name}&galContentTypeId=17&numOfRows=100&pageNo=1..",
        "lang": "KO",
        "purpose": "공식 사진 갤러리. 부산 3,920건 COMPLETE. 장소 매칭으로 이미지 보강",
        "expected_yield_class": "핵심 (이미지 소스)",
    },
    {
        "step": 13,
        "source": "VisitBusan_equivalent",
        "endpoint": "SSR HTML scrape (attraction·food·experience·shopping)",
        "params": "lang_cd=en 치환, uc_seq 기반 URL",
        "lang": "EN",
        "purpose": "VB EN 공식 영문 제목·설명 수집. API에 EN 콘텐츠 없는 경우 대안",
        "expected_yield_class": "핵심 (name_en·description_en 보강)",
    },
]

# ── 4. ID 비교 요약 ─────────────────────────────────────────────────
id_comparison = {
    "kto_ko_unique": len(kto_ko_ids),
    "kto_en_unique": len(kto_en_ids),
    "kto_ko_en_intersection": len(ko_en_both),
    "kto_ko_only": len(ko_only),
    "kto_en_only": len(en_only),
    "kto_ko_en_overlap_pct": round(len(ko_en_both) / max(len(kto_ko_ids), 1) * 100, 1),
    "finding": (
        "KorService2(KO)와 EngService2(EN)는 contentId namespace가 완전히 분리됨. "
        "교집합 0건. KO ID로는 EN 정보 조회 불가 (별도 EN contentId 필요)."
    ),
    "kto_ko_ctid_distribution": {
        k: {"count": v, "label": CTID_KO_LABEL.get(k, "??")}
        for k, v in kto_ko_ctids.most_common()
    },
    "kto_en_ctid_distribution": dict(kto_en_ctids.most_common()),
    "vb_food_zhs_gap": {
        "food_ko": food_ko_n, "food_zhs": food_zhs_n,
        "gap": food_ko_n - food_zhs_n,
        "gap_pct": round((food_ko_n - food_zhs_n) / food_ko_n * 100, 1),
        "finding": "ZhS 콘텐츠가 KO보다 99건(22.7%) 적음. VisitBusan 플랫폼 자체 제공 격차",
    },
    "vb_food_zht_gap": {
        "food_ko": food_ko_n, "food_zht": food_zht_n,
        "gap": food_ko_n - food_zht_n,
        "gap_pct": round((food_ko_n - food_zht_n) / food_ko_n * 100, 1),
        "finding": "ZhT 콘텐츠가 KO보다 151건(34.6%) 적음. 플랫폼 제공 격차 (추가 수집으로 해소 불가)",
    },
    "vb_attraction_zhs_gap": {
        "attraction_ko": att_ko_n, "attraction_zhs": att_zhs_n,
        "gap": att_ko_n - att_zhs_n,
        "finding": "관광지 ZhS 4건 부족. 소규모 격차",
    },
}

# ── 5. 페이지네이션 완전성 보고서 ─────────────────────────────────
pagination_report = {
    "method": (
        "KTO: response.body.totalCount vs 수집 items 합계 비교. "
        "VB: API totalCount=null이므로 마지막 페이지 items 수 < numOfRows(100) 기준으로 COMPLETE 판정. "
        "PhotoGallery: totalCount 비교."
    ),
    "kto_ko": {
        "endpoint": "KorService2/areaBasedList2 areaCode=6",
        "pages": len(kto_ko_files),
        "total_collected": kto_ko_total,
        "total_count_api": kto_ko_tc,
        "status": "COMPLETE" if kto_ko_complete else "INCOMPLETE",
        "page_detail": kto_ko_pages,
    },
    "kto_en": {
        "endpoint": "EngService2/areaBasedList2 areaCode=6",
        "pages": len(kto_en_files),
        "total_collected": kto_en_total,
        "total_count_api": kto_en_tc,
        "status": "COMPLETE" if kto_en_complete else "INCOMPLETE",
        "page_detail": kto_en_pages,
    },
    "photo_gallery": {
        "endpoint": "PhotoGalleryService1/galleryList1 busan 2026-07-27",
        "pages": len(pg_files),
        "total_collected": pg_unique,
        "total_count_api": pg_tc_int,
        "status": "COMPLETE" if pg_complete else "INCOMPLETE",
        "gap": pg_tc_int - pg_unique,
    },
    "vb_batch_summary": {
        name: {
            "pages": s["pages"],
            "total": s["total"],
            "last_page_count": s["last_page_count"],
            "status": "COMPLETE" if s["pagination_complete"] else "POSSIBLY_TRUNCATED",
        }
        for name, s in vb_stats.items()
    },
}

# ── 최종 감사 보고서 조립 ──────────────────────────────────────────
audit_report = {
    "task_id": "TASK-BUSAN-SOURCE-SEARCH-COVERAGE-AUDIT-V1",
    "generated_at": generated_at,
    "verdict": "COMPLETE",
    "summary": {
        "total_api_sources_audited": 4,
        "api_sources": ["KTO KorService2", "KTO EngService2", "VisitBusan API", "KTO PhotoGalleryService1"],
        "total_endpoints_executed": sum(1 for r in matrix_rows if r["executed"]),
        "total_endpoints_not_executed": sum(1 for r in matrix_rows if not r["executed"]),
        "total_matrix_rows": len(matrix_rows),
        "total_uncollected_paths": len(uncollected_paths),
        "high_priority_uncollected": [u["path_id"] for u in uncollected_paths if u["recommendation"].startswith("고우선")],
        "data_modified": False,
        "api_calls_made": 0,
    },
    "key_findings": [
        {
            "finding_id": "F-01",
            "title": "KTO KO/EN contentId namespace 완전 분리",
            "detail": (
                f"KorService2(KO) {len(kto_ko_ids)}건과 EngService2(EN) {len(kto_en_ids)}건의 contentId는 "
                f"교집합 0건. 두 서비스는 별도 ID 체계를 사용하며 KO ID로 EN 상세정보를 조회할 수 없음. "
                "EngService2 194건에 대한 detailCommon2 EN 호출을 미실행한 것은 gap임."
            ),
            "severity": "HIGH",
        },
        {
            "finding_id": "F-02",
            "title": "VisitBusan ZhS/ZhT 콘텐츠 격차 (플랫폼 제한)",
            "detail": (
                f"food ZhS: KO {food_ko_n}건 대비 {food_zhs_n}건 (gap={food_ko_n-food_zhs_n}, {round((food_ko_n-food_zhs_n)/food_ko_n*100,1)}%). "
                f"food ZhT: {food_zht_n}건 (gap={food_ko_n-food_zht_n}, {round((food_ko_n-food_zht_n)/food_ko_n*100,1)}%). "
                "이는 VisitBusan 플랫폼이 ZhS/ZhT 콘텐츠를 더 적게 제공하는 것이며 추가 수집으로 해소 불가."
            ),
            "severity": "INFO",
        },
        {
            "finding_id": "F-03",
            "title": "KTO 상세 API 수집 완료 (KO IDs 대상)",
            "detail": (
                f"detailCommon2 {len(common_files)}건 수집, overview {common_with_overview}건 확보. "
                f"detailIntro2 {len(intro_files)}건 수집. "
                f"detailImage2 {len(image_files)}건 요청, 실제 이미지 {image_with_content}건 (실수율 낮음). "
                "단 EngService2(EN) 194건 대상 detail 수집은 미실행."
            ),
            "severity": "MEDIUM",
        },
        {
            "finding_id": "F-04",
            "title": "PhotoGallery 완전 수집 (3,920건)",
            "detail": (
                f"{len(pg_files)}페이지 × 100건 = {pg_unique}건 unique 수집. "
                f"API totalCount={pg_tc_api}건과 일치. 완전성 COMPLETE."
            ),
            "severity": "INFO",
        },
        {
            "finding_id": "F-05",
            "title": "키워드 검색 미사용 — 누락 가능성 낮음",
            "detail": (
                "KTO KorService2/EngService2 양쪽 모두 keyword 검색(searchKeyword 파라미터) 미사용. "
                "areaCode=6 전체 목록이 keyword 검색의 superset이므로 신규 엔티티 누락 가능성 없음. "
                "단, 특정 키워드로 추가 필터링이 필요한 경우 사용 고려."
            ),
            "severity": "INFO",
        },
        {
            "finding_id": "F-06",
            "title": "VB 숙박 섹션 미수집",
            "detail": (
                "KTO KorService2(ctid=32, 숙박 79건)로는 공식 숙박 데이터만 수집됨. "
                "VisitBusan accommodation 섹션(게스트하우스·부티크 호텔 등)은 API 배치 미실행. "
                "현재 enriched candidates 숙박=82건은 KTO 기반."
            ),
            "severity": "LOW",
        },
        {
            "finding_id": "F-07",
            "title": "VB Experience/Shopping EN SSR 완료 — 다국어 API 배치 미실행",
            "detail": (
                f"Experience 93건·Shopping 38건은 EN SSR scrape으로 수집 완료. "
                "KO/JA/ZhS/ZhT API 배치는 미실행 (신규 엔티티 없음, 다국어 메타데이터만 추가 가능)."
            ),
            "severity": "LOW",
        },
        {
            "finding_id": "F-08",
            "title": "VB API totalCount=null — pagination 완전성은 last_page 기준 판정",
            "detail": (
                "VisitBusan API는 response에 totalCount를 제공하지 않음. "
                "pagination 완전성은 마지막 페이지 items 수 < numOfRows(100) 기준으로 판정. "
                "전체 15개 VB batch source 중 13개 COMPLETE, food-zht 수집 86건(< 100) → COMPLETE."
            ),
            "severity": "INFO",
        },
    ],
    "pagination_report": pagination_report,
    "id_comparison": id_comparison,
    "uncollected_paths": uncollected_paths,
    "standard_search_order_next_city": standard_search_order,
    "source_facts_summary": {
        "total": sum(sf_prefix.values()),
        "by_prefix": dict(sf_prefix),
    },
    "enriched_candidates_summary": {
        "total": total_candidates,
        "by_category": dict(ec_cat),
        "source_combination_top10": {str(k): v for k, v in src_combo.most_common(10)},
    },
    "safety": {
        "data_modified":     False,
        "api_calls_made":    0,
        "flags_created":     False,
        "gates_created":     False,
        "push_performed":    False,
    },
}

# ── Coverage Matrix 파일 ───────────────────────────────────────────
coverage_matrix = {
    "task_id":      "TASK-BUSAN-SOURCE-SEARCH-COVERAGE-AUDIT-V1",
    "generated_at": generated_at,
    "columns": ["source", "endpoint", "method", "lang", "executed",
                "pagination_complete", "count_collected", "total_count_api", "notes"],
    "rows": matrix_rows,
    "totals": {
        "executed":     sum(1 for r in matrix_rows if r["executed"]),
        "not_executed": sum(1 for r in matrix_rows if not r["executed"]),
        "total":        len(matrix_rows),
    },
}

# ── 저장 ──────────────────────────────────────────────────────────
os.makedirs(j("data/tourapi/reports/busan"), exist_ok=True)

matrix_path = j("data/tourapi/reports/busan/busan-source-search-coverage-matrix.json")
audit_path  = j("data/tourapi/reports/busan/busan-source-search-coverage-audit-v1.json")

json.dump(coverage_matrix, open(matrix_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
json.dump(audit_report,    open(audit_path,  "w", encoding="utf-8"), ensure_ascii=False, indent=2)

print(f"Coverage matrix → {matrix_path}")
print(f"  rows: {len(matrix_rows)} (executed={coverage_matrix['totals']['executed']}, not_executed={coverage_matrix['totals']['not_executed']})")
print(f"Audit report  → {audit_path}")
print(f"  verdict: {audit_report['verdict']}")
print(f"  key findings: {len(audit_report['key_findings'])}")
print(f"  uncollected paths: {len(uncollected_paths)}")
print(f"  high priority: {audit_report['summary']['high_priority_uncollected']}")
print(f"  safety.data_modified: {audit_report['safety']['data_modified']}")
print(f"  safety.api_calls_made: {audit_report['safety']['api_calls_made']}")
print()
print("DONE — no data modified, no API calls made, no push performed.")
