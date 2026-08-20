#!/usr/bin/env python3
"""
TASK-JEONJU-MULTILINGUAL-VISITJEONJU-MAPPING-V1
VisitJeonju 공식 EN / JA / zh-CN 장소 콘텐츠 수집 + KO canonical phone matching

동작 원리
---------
1. tour.jeonju.go.kr 각 locale 목록 페이지(BBS_000001X)에서 dataSid + 제목 추출
2. 상세 페이지에서 전화번호 추출 (HTML regex)
3. 전화번호 정규화 후 jeonju-final-service-catalog-v1.json 의 phone 필드와 1:1 매칭
4. 충돌(2건 이상) → 건물번호 비교로 해소 시도
5. 확정 매칭만 enrichment, 나머지는 gap 분류

절대 금지
---------
- canonical 수정 / 번역·AI 번역 사용
- name fuzzy matching (이름 유사도만으로 연결)
- KTO JA/ZH 미승인 API 호출
- git add . / add -A / force push
- 비밀값 출력·커밋
- 새 place 생성

사용법
------
python scripts/run-jeonju-multilingual-collection-v1.py
"""
import json
import re
import sys
import time
from collections import defaultdict
from datetime import date
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# ── 경로 ──────────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent
CATALOG_PATH = ROOT / "data/jeonju-raw-collection-v1/jeonju-final-service-catalog-v1.json"
OUTPUT_DIR = ROOT / "data/jeonju-multilingual-v1"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

TODAY = date.today().isoformat()
COMMON_POLICY_COMMIT = "1fb26351d4e195cdc6218d3b4417309e1f1838f3"
JEONJU_FINAL_SHA = "b3645d711143234b79407529f1a9b15babe934c0"

# ── VisitJeonju 설정 ─────────────────────────────────────────────────────────
BASE_URL = "https://tour.jeonju.go.kr"

LOCALES: dict = {
    "en": {
        "path": "eng",
        "board_id": "BBS_0000016",
        "menu_cd": "DOM_000000201000000000",
        "expected_count": 92,
    },
    "ja": {
        "path": "jpn",
        "board_id": "BBS_0000017",
        "menu_cd": "DOM_000000301000000000",
        "expected_count": 92,
    },
    "zh-CN": {
        "path": "cnh",
        "board_id": "BBS_0000018",
        "menu_cd": "DOM_000000401000000000",
        "expected_count": 92,
    },
}

DELAY = 0.7      # 요청 간 대기(초)
TIMEOUT = 30     # HTTP 타임아웃(초)
MAX_RETRIES = 2

# 전주시청 대표번호(25개 record 공유) → unique matching 불가
GENERIC_PHONES: set = {"0632221000", "0632230000", "0632201000", "0632281000"}

# ── HTML 파서 ──────────────────────────────────────────────────────────────────
PHONE_RE = re.compile(
    r"(?:\+82[\s\-]?(\d{1,2})[\s\-]?(\d{3,4})[\s\-]?(\d{4})"
    r"|0(\d{2,3})[\s\-]?(\d{3,4})[\s\-]?(\d{4}))"
)

META_KEYWORDS = (
    "주소", "전화", "운영시간", "입장료", "이용요금", "교통", "홈페이지",
    "Address", "Phone", "Tel:", "Hours", "Admission",
    "住所", "電話", "営業時間", "入場料",
    "地址", "电话", "营业时间", "门票",
)

NAV_RE = re.compile(
    r"^(?:HOME|TOP|MENU|SEARCH|LOGIN|로그인|검색|뒤로|목록|닫기|이전|다음|NEXT|PREV|GO\s+TO|맨\s*위)",
    re.IGNORECASE,
)


class PageParser(HTMLParser):
    """VisitJeonju HTML 페이지에서 text segment + dataSid href 추출."""

    def __init__(self) -> None:
        super().__init__()
        self._skip = False
        self.texts: list = []
        self.hrefs: list = []   # (href, text) — dataSid 포함 링크
        self._cur_href: str | None = None
        self._cur_texts: list = []

    def handle_starttag(self, tag: str, attrs: list) -> None:
        attrs_d = dict(attrs)
        if tag in ("script", "style", "noscript"):
            self._skip = True
        if tag == "a":
            href = attrs_d.get("href", "")
            if "dataSid=" in href:
                self._cur_href = href
                self._cur_texts = []

    def handle_endtag(self, tag: str) -> None:
        if tag in ("script", "style", "noscript"):
            self._skip = False
        if tag == "a" and self._cur_href:
            text = re.sub(r"\s+", " ", " ".join(self._cur_texts)).strip()
            if text and len(text) > 1:
                self.hrefs.append((self._cur_href, text))
            self._cur_href = None
            self._cur_texts = []

    def handle_data(self, data: str) -> None:
        if self._skip:
            return
        t = data.strip()
        if not t:
            return
        self.texts.append(t)
        if self._cur_href is not None:
            self._cur_texts.append(t)


# ── 전화번호 정규화 ─────────────────────────────────────────────────────────
def normalize_phone(raw: str) -> str | None:
    """한국 전화번호를 digits-only (0으로 시작) 로 정규화."""
    if not raw:
        return None
    raw = str(raw).strip()
    if raw.startswith("+82"):
        raw = "0" + raw[3:]
    # 내선번호 / 범위 제거
    raw = raw.split("~")[0].split(",")[0].strip()
    digits = re.sub(r"[^\d]", "", raw)
    return digits if len(digits) >= 9 else None


def extract_phone_from_text(text: str) -> str | None:
    m = PHONE_RE.search(text)
    if not m:
        return None
    return normalize_phone(m.group())


# ── 설명 추출 ───────────────────────────────────────────────────────────────
def extract_description(texts: list, title: str | None = None) -> str | None:
    """metadata·nav 제외 후 첫 번째 유효 텍스트 단락 반환."""
    for t in texts:
        if len(t) < 40 or len(t) > 1500:
            continue
        if title and t[:30] in title:
            continue
        if any(kw in t for kw in META_KEYWORDS):
            continue
        if NAV_RE.match(t):
            continue
        if re.match(r"^[\d\s\-\+\(\)~]{8,}$", t):
            continue
        return t[:500]
    return None


# ── HTTP ────────────────────────────────────────────────────────────────────────
def fetch_html(url: str) -> str | None:
    """최대 MAX_RETRIES 재시도 후 HTML 반환. 실패 시 None."""
    for attempt in range(MAX_RETRIES + 1):
        try:
            req = Request(url, headers={
                "User-Agent": "Mozilla/5.0 (compatible; GoKoreaMate/1.0; tourism-data)",
                "Accept": "text/html;charset=UTF-8",
                "Accept-Language": "ko,en;q=0.9",
            })
            with urlopen(req, timeout=TIMEOUT) as resp:
                charset = "utf-8"
                ct = resp.headers.get("Content-Type", "")
                if "charset=" in ct:
                    charset = ct.split("charset=")[-1].strip().lower()
                return resp.read().decode(charset, errors="replace")
        except HTTPError as e:
            if attempt < MAX_RETRIES and e.code in (429, 500, 502, 503, 504):
                time.sleep(DELAY * 3)
                continue
            return None
        except (URLError, TimeoutError, Exception):
            if attempt < MAX_RETRIES:
                time.sleep(DELAY * 2)
                continue
            return None
    return None


def is_error_page(html: str) -> bool:
    if not html or len(html) < 100:
        return True
    markers = [
        "RFC 3.0 오류", "권한이 없습니다", "알 수 없는 오류",
        "게시물 에러 페이지", "존재하지 않는 게시물", "404 Not Found",
        "삭제된 게시물",
    ]
    return any(m in html for m in markers)


def make_list_url(lc: dict, page: int = 1, rows: int = 100) -> str:
    params = urlencode({
        "boardId": lc["board_id"],
        "menuCd": lc["menu_cd"],
        "numOfRows": rows,
        "pageNo": page,
    })
    return f"{BASE_URL}/{lc['path']}/board/list.jeonju?{params}"


def make_detail_url(lc: dict, data_sid: str) -> str:
    params = urlencode({
        "boardId": lc["board_id"],
        "menuCd": lc["menu_cd"],
        "dataSid": data_sid,
    })
    return f"{BASE_URL}/{lc['path']}/board/view.jeonju?{params}"


# ── 카탈로그 로드 ─────────────────────────────────────────────────────────────
def load_catalog() -> list:
    with open(CATALOG_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    return [r for r in data["all_candidates"] if r.get("final_status") == "ACTIVE_SERVICE"]


def build_phone_index(service: list) -> dict:
    idx: dict = defaultdict(list)
    for r in service:
        p = normalize_phone(r.get("phone") or "")
        if p:
            idx[p].append(r)
    return dict(idx)


# ── 충돌 해소: 건물번호 비교 ──────────────────────────────────────────────────
def _building_num_from_ko(ko_addr: str) -> str | None:
    if not ko_addr:
        return None
    m = re.search(r"(?:로|길|번지|번|가)\s+(\d+(?:-\d+)?)", ko_addr)
    if m:
        return m.group(1)
    m = re.search(r"(\d+(?:-\d+)?)\s*(?:\(|$)", ko_addr.strip())
    if m:
        return m.group(1)
    return None


def try_resolve_collision(candidates: list, en_addr: str | None) -> dict | None:
    """EN 주소 앞자리 건물번호로 2-way 충돌 해소. 1건 확정 시 반환."""
    if not en_addr:
        return None
    m_en = re.match(r"(\d+(?:-\d+)?)\s*[,\s]", en_addr.strip())
    if not m_en:
        return None
    en_num = m_en.group(1)
    matched = [c for c in candidates
               if _building_num_from_ko(c.get("kto_addr") or "") == en_num]
    return matched[0] if len(matched) == 1 else None


# ── 주소 추출 ────────────────────────────────────────────────────────────────
ADDR_RE = re.compile(
    r"\d+(?:-\d+)?\s*,\s*[A-Za-z가-힣\s\-]+"
    r"(?:-ro|-gil|-ro |-gil |-gu|-dong|-si)"
    r"[A-Za-z\s,\-]*(?:Jeonju|전주|Wansan|Deokjin)",
    re.IGNORECASE,
)


def extract_address(text: str) -> str | None:
    m = ADDR_RE.search(text)
    return m.group().strip()[:200] if m else None


# ── 메인 수집 로직 ─────────────────────────────────────────────────────────────
def collect_locale(locale: str, lc_cfg: dict, phone_index: dict, service: list) -> tuple:
    """한 locale 전체 수집·매칭. Returns (enrichments, gaps, stats)."""

    print(f"\n{'='*64}")
    print(f"LOCALE={locale}  board={lc_cfg['board_id']}")
    print("=" * 64)

    # Phase A: 목록에서 dataSid → title 맵 구성
    print("\n[A] list page fetch...")
    list_html = fetch_html(make_list_url(lc_cfg))
    time.sleep(DELAY)

    if not list_html or is_error_page(list_html):
        print(f"  ERROR: list page failed for {locale}")
        return [], [], {"status": "LIST_FETCH_FAILED"}

    parser = PageParser()
    parser.feed(list_html)
    sid_to_title: dict = {}
    for href, title in parser.hrefs:
        m = re.search(r"dataSid=(\d+)", href)
        if m:
            sid = m.group(1)
            if sid not in sid_to_title:
                sid_to_title[sid] = re.sub(r"\s+", " ", title).strip()[:200]

    print(f"  dataSids extracted: {len(sid_to_title)} (expected: {lc_cfg['expected_count']})")

    if len(sid_to_title) < lc_cfg["expected_count"] * 0.9:
        print("  checking page 2...")
        html2 = fetch_html(make_list_url(lc_cfg, page=2))
        time.sleep(DELAY)
        if html2 and not is_error_page(html2):
            p2 = PageParser()
            p2.feed(html2)
            for href, title in p2.hrefs:
                m = re.search(r"dataSid=(\d+)", href)
                if m:
                    sid = m.group(1)
                    if sid not in sid_to_title:
                        sid_to_title[sid] = re.sub(r"\s+", " ", title).strip()[:200]
            print(f"  after page 2: {len(sid_to_title)}")

    if not sid_to_title:
        print(f"  ABORT: no dataSids for {locale}")
        return [], [], {"status": "NO_DATASIDS"}

    # Phase B: 카나리아 3건 검증
    print(f"\n[B] canary (3 records)...")
    canary_ids = list(sid_to_title.keys())[:3]
    canary_ok = 0
    for sid in canary_ids:
        url = make_detail_url(lc_cfg, sid)
        html = fetch_html(url)
        time.sleep(DELAY)
        if not html or is_error_page(html):
            print(f"  [CANARY] dataSid={sid} → error page")
            continue
        pg = PageParser()
        pg.feed(html)
        phone = extract_phone_from_text(" ".join(pg.texts))
        desc = extract_description(pg.texts, sid_to_title.get(sid))
        title_str = sid_to_title.get(sid, "")[:40]
        print(f"  [CANARY] sid={sid} title={repr(title_str)}")
        print(f"          phone={phone}  desc_len={len(desc) if desc else 0}")
        if title_str:
            canary_ok += 1

    if canary_ok == 0:
        print(f"  CANARY FAIL: no titles for {locale}")
        return [], [], {"status": "CANARY_FAIL"}
    print(f"  CANARY PASS ({canary_ok}/{len(canary_ids)})")

    # Phase C: 전체 상세 페이지 수집
    print(f"\n[C] full collection ({len(sid_to_title)} records)...")
    vj_records = []
    fetch_fail = 0

    for i, (sid, title) in enumerate(sid_to_title.items()):
        url = make_detail_url(lc_cfg, sid)
        html = fetch_html(url)
        time.sleep(DELAY)

        if not html or is_error_page(html):
            fetch_fail += 1
            vj_records.append({
                "data_sid": sid, "locale": locale, "title": title,
                "phone": None, "short_description": None, "address": None,
                "source_url": url, "fetch_status": "FETCH_TRANSIENT",
            })
            continue

        pg = PageParser()
        pg.feed(html)
        full_text = " ".join(pg.texts)
        raw_phone = extract_phone_from_text(full_text)
        phone_norm = normalize_phone(raw_phone) if raw_phone else None
        desc = extract_description(pg.texts, title)
        addr = extract_address(full_text)

        vj_records.append({
            "data_sid": sid, "locale": locale, "title": title,
            "phone": phone_norm, "short_description": desc, "address": addr,
            "source_url": url, "fetch_status": "OK",
        })

        if (i + 1) % 20 == 0:
            print(f"  [{locale}] {i+1}/{len(sid_to_title)}")

    ok = sum(1 for r in vj_records if r["fetch_status"] == "OK")
    hp = sum(1 for r in vj_records if r.get("phone"))
    hd = sum(1 for r in vj_records if r.get("short_description"))
    print(f"  DONE: total={len(vj_records)} ok={ok} phone={hp} desc={hd} fail={fetch_fail}")

    # Phase D: Phone 기반 매칭
    print(f"\n[D] phone matching...")
    matched_cids: set = set()
    ambiguous_cids: set = set()
    enrichments = []
    stats = {
        "unique_match": 0, "collision_resolved": 0,
        "collision_unresolved": 0, "generic_phone": 0,
        "no_phone": 0, "no_catalog_match": 0, "fetch_fail": fetch_fail,
    }

    for vj_rec in vj_records:
        if vj_rec["fetch_status"] != "OK":
            continue
        phone = vj_rec["phone"]
        title = vj_rec["title"]
        desc = vj_rec.get("short_description")
        addr = vj_rec.get("address")
        sid = vj_rec["data_sid"]

        if not phone:
            stats["no_phone"] += 1
            continue
        if phone in GENERIC_PHONES:
            stats["generic_phone"] += 1
            continue

        candidates = phone_index.get(phone, [])
        if not candidates:
            stats["no_catalog_match"] += 1
            continue

        if len(candidates) == 1:
            record = candidates[0]
            stats["unique_match"] += 1
            matched_cids.add(record["candidate_id"])
        else:
            resolved = try_resolve_collision(candidates, addr)
            if resolved:
                record = resolved
                stats["collision_resolved"] += 1
                matched_cids.add(record["candidate_id"])
            else:
                stats["collision_unresolved"] += 1
                for c in candidates:
                    ambiguous_cids.add(c["candidate_id"])
                continue

        has_desc = bool(desc and len(desc.strip()) >= 10)
        enrichments.append({
            "candidate_id": record["candidate_id"],
            "locale": locale,
            "collection_status": "SUCCESS",
            "title": title,
            "short_description": desc if has_desc else None,
            "required_core_ready": bool(title and has_desc),
            "visitjeonju_data_sid": sid,
            "phone_matched": phone,
            "source": f"VISITJEONJU_{locale.upper().replace('-', '_')}",
            "source_url": vj_rec["source_url"],
            "collected_at": TODAY,
        })

    print(f"  STATS: {stats}")
    print(f"  MATCHED_CONFIRMED={len(matched_cids)}  AMBIGUOUS={len(ambiguous_cids)}")

    # Phase E: Gap 생성
    gaps = []
    source_empty = sum(1 for e in enrichments if not e.get("required_core_ready"))

    for r in service:
        cid = r["candidate_id"]
        if cid in matched_cids:
            continue
        if cid in ambiguous_cids:
            gap_type = "AMBIGUOUS_MAPPING"
        elif r.get("source") == "KTO":
            gap_type = "NO_VISITJEONJU_LOCALE_RECORD"
        elif r.get("source") == "OFFICIAL":
            gap_type = "MAPPING_GAP"
        else:
            gap_type = "UNKNOWN"
        gaps.append({
            "candidate_id": cid, "locale": locale, "gap_type": gap_type,
            "source": r.get("source"), "has_kto_cid": bool(r.get("kto_cid")),
        })

    for vj_rec in vj_records:
        if vj_rec["fetch_status"] == "FETCH_TRANSIENT":
            gaps.append({
                "candidate_id": None, "locale": locale, "gap_type": "FETCH_TRANSIENT",
                "visitjeonju_data_sid": vj_rec["data_sid"],
                "title_ko_hint": vj_rec["title"],
            })

    print(f"  GAPS={len(gaps)}  SOURCE_EMPTY={source_empty}")

    stats.update({
        "official_records": len(sid_to_title),
        "matched_confirmed": len(matched_cids),
        "ambiguous": len(ambiguous_cids),
        "gaps_total": len(gaps),
        "source_empty_required_text": source_empty,
    })
    return enrichments, gaps, stats


# ── QA 집계 ──────────────────────────────────────────────────────────────────
def compute_qa(service: list, all_enrichments: dict, all_gaps: dict, all_stats: dict) -> dict:
    su = len(service)
    per_locale = {}

    for locale in LOCALES:
        enrichments = all_enrichments.get(locale, [])
        gaps = all_gaps.get(locale, [])
        stats = all_stats.get(locale, {})
        matched = stats.get("matched_confirmed", 0)
        core_ready = sum(1 for e in enrichments if e.get("required_core_ready"))
        gap_summary: dict = {}
        for g in gaps:
            gt = g.get("gap_type", "UNKNOWN")
            gap_summary[gt] = gap_summary.get(gt, 0) + 1

        per_locale[locale] = {
            "official_records_in_visitjeonju": stats.get("official_records", 0),
            "matched_confirmed": matched,
            "required_core_ready": core_ready,
            "service_universe": su,
            "coverage_pct": f"{core_ready / su * 100:.1f}%" if su else "0%",
            "match_stats": {
                "unique_match": stats.get("unique_match", 0),
                "collision_resolved": stats.get("collision_resolved", 0),
                "collision_unresolved": stats.get("collision_unresolved", 0),
                "generic_phone": stats.get("generic_phone", 0),
                "no_phone_in_source": stats.get("no_phone", 0),
                "no_catalog_match": stats.get("no_catalog_match", 0),
                "fetch_transient": stats.get("fetch_fail", 0),
            },
            "source_empty_required_text": stats.get("source_empty_required_text", 0),
            "gap_summary": gap_summary,
        }

    return {
        "task": "TASK-JEONJU-MULTILINGUAL-VISITJEONJU-MAPPING-V1",
        "generated_at": TODAY,
        "service_universe": su,
        "common_policy_commit": COMMON_POLICY_COMMIT,
        "jeonju_final_sha": JEONJU_FINAL_SHA,
        "primary_match_method": "UNIQUE_NORMALIZED_PHONE",
        "secondary_match_method": "ADDRESS_BUILDING_NUMBER",
        "generic_phone_excluded": sorted(GENERIC_PHONES),
        "kto_only_records": sum(1 for r in service if r.get("source") == "KTO"),
        "official_records": sum(1 for r in service if r.get("source") == "OFFICIAL"),
        "per_locale": per_locale,
        "owner_request_for_main_handoff": "YES",
        "handoff_recommendation": (
            "EN/JA/zh-CN 모두 required_core_ready=True 확정 record만 handoff 대상. "
            "KTO-only 133건은 NO_VISITJEONJU_LOCALE_RECORD — KTO JA/ZH API 승인 후 재수집 필요."
        ),
    }


# ── 엔트리포인트 ───────────────────────────────────────────────────────────────
def main() -> None:
    print("TASK-JEONJU-MULTILINGUAL-VISITJEONJU-MAPPING-V1")
    print(f"date={TODAY}  policy={COMMON_POLICY_COMMIT[:8]}")

    service = load_catalog()
    print(f"\nCATALOG: {len(service)} ACTIVE_SERVICE records")
    phone_index = build_phone_index(service)
    print(f"PHONE_INDEX: {len(phone_index)} unique phones")

    all_enrichments: dict = {}
    all_gaps: dict = {}
    all_stats: dict = {}

    for locale, lc_cfg in LOCALES.items():
        result = collect_locale(locale, lc_cfg, phone_index, service)
        all_enrichments[locale] = result[0]
        all_gaps[locale] = result[1]
        all_stats[locale] = result[2]

    # 출력 파일
    print("\n" + "=" * 64)
    print("WRITING OUTPUT FILES")

    enrich_path = OUTPUT_DIR / "jeonju-multilingual-enrichment-v1.jsonl"
    enrich_count = 0
    with open(enrich_path, "w", encoding="utf-8") as f:
        for locale in LOCALES:
            for rec in all_enrichments.get(locale, []):
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")
                enrich_count += 1
    print(f"ENRICHMENT: {enrich_path.name} ({enrich_count} records)")

    gap_path = OUTPUT_DIR / "jeonju-multilingual-gaps-v1.jsonl"
    gap_count = 0
    with open(gap_path, "w", encoding="utf-8") as f:
        for locale in LOCALES:
            for rec in all_gaps.get(locale, []):
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")
                gap_count += 1
    print(f"GAPS: {gap_path.name} ({gap_count} records)")

    qa_path = OUTPUT_DIR / "jeonju-multilingual-coverage-qa-v1.json"
    qa = compute_qa(service, all_enrichments, all_gaps, all_stats)
    with open(qa_path, "w", encoding="utf-8") as f:
        json.dump(qa, f, ensure_ascii=False, indent=2)
    print(f"QA: {qa_path.name}")

    print("\n=== QA SUMMARY ===")
    for locale in LOCALES:
        pl = qa["per_locale"][locale]
        print(f"\n[{locale}]")
        print(f"  official_records_in_visitjeonju : {pl['official_records_in_visitjeonju']}")
        print(f"  matched_confirmed               : {pl['matched_confirmed']}")
        print(f"  required_core_ready             : {pl['required_core_ready']}/{qa['service_universe']} ({pl['coverage_pct']})")
        print(f"  gap_summary                     : {pl['gap_summary']}")

    print(f"\nENRICHMENT_FILE={enrich_path} ({enrich_count})")
    print(f"GAPS_FILE={gap_path} ({gap_count})")
    print(f"QA_FILE={qa_path}")
    print("\nJEONJU_MULTILINGUAL_MAPPING=DONE")


if __name__ == "__main__":
    main()
