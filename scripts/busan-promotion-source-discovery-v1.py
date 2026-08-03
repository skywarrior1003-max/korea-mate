"""
busan-promotion-source-discovery-v1.py
TASK-BUSAN-PROMOTION-OFFICIAL-SOURCE-ACCESS-RECOVERY-V1

공식 원천에서 부산 프로모션·이벤트 소스 URL과 ID를 수집하는 재현 가능한 탐색 스크립트.
실제 WebFetch 없이 수집 경로를 문서화하고, 수동 실행 시 URL 목록을 생성한다.

사용 방법:
  python busan-promotion-source-discovery-v1.py --source vb-event   # VisitBusan Event & Survey
  python busan-promotion-source-discovery-v1.py --source bto-press  # BTO 보도자료
  python busan-promotion-source-discovery-v1.py --source all        # 전체

제약:
  - 뉴스 기사 근거 금지
  - B2B 항목 제외
  - candidates/source_facts 수정 없음
  - push 없음
"""

import argparse
import json
import os
import sys
from datetime import date, datetime
from urllib.parse import urlencode, urljoin

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPORT_DIR = os.path.join(REPO_ROOT, "data/tourapi/reports/busan")
TODAY = date.today()

# ── 소스 정의 ───────────────────────────────────────────────────────────────
SOURCES = {
    "vb-event": {
        "name": "VisitBusan Event & Survey (EN)",
        "list_url": "https://www.visitbusan.net/en/index.do?menuCd=DOM_000000304002000000",
        "detail_pattern": "https://www.visitbusan.net/en/index.do?menuCd=DOM_000000304002001000&ueb_seq={id}",
        "id_field": "ueb_seq",
        "id_extract": "a[href] 내 ueb_seq={N} 파싱",
        "total_pages": 13,
        "page_param": "page",
        "audience_type": "B2C",
        "access_method": "AUTOMATABLE",
        "b2c_filter": None,
        "content_types": ["discount", "campaign", "special_experience", "tourist_pass"],
    },
    "vb-shows": {
        "name": "VisitBusan Shows & Events (EN)",
        "list_url": "https://www.visitbusan.net/en/index.do?menuCd=DOM_000000304010000000",
        "detail_pattern": "https://www.visitbusan.net/en/schedule/view.do?boardId=BBS_0000010&menuCd=DOM_000000304010000000&dataSid={id}",
        "id_field": "dataSid",
        "id_extract": "a[href] 내 dataSid={N} 파싱",
        "pagination": "year={YYYY}&month={MM}",
        "months_to_collect": ["2026-08", "2026-09", "2026-10", "2026-11", "2026-12"],
        "audience_type": "B2C",
        "access_method": "AUTOMATABLE",
        "content_types": ["travel_notice", "tourism_news"],
    },
    "vb-notice": {
        "name": "VisitBusan Notice (EN)",
        "list_url": "https://www.visitbusan.net/en/index.do?menuCd=DOM_000000304001000000",
        "detail_pattern": "https://www.visitbusan.net/en/board/view.do?{params}",
        "total_pages": 2,
        "audience_type": "MIXED",
        "access_method": "AUTOMATABLE",
        "b2c_filter": "관광객 직접 혜택 포함 항목만",
        "content_types": ["travel_notice", "campaign"],
    },
    "vb-products": {
        "name": "VisitBusan Busan Travel Products (EN)",
        "list_url": "https://www.visitbusan.net/en/index.do?menuCd=DOM_000000304004000000",
        "total_items": 27,
        "total_pages": 2,
        "audience_type": "B2C",
        "access_method": "AUTOMATABLE",
        "content_types": ["activity_deal", "special_experience"],
    },
    "bto-press": {
        "name": "BTO 보도자료",
        "list_url": "https://bto.or.kr/kor/CMS/Board/Board.do?mCode=MN047",
        "detail_pattern": "https://bto.or.kr/kor/CMS/Board/Board.do?mCode=MN047&mode=view&mgr_seq=22&board_seq={id}",
        "id_field": "board_seq",
        "id_extract": "a[href] 내 board_seq={N} 파싱",
        "total_pages": 116,
        "page_param": "page",
        "pagination_prefix": "?robot=Y&mCode=MN047&",
        "collect_pages": 10,  # 최근 10페이지만 (100건)
        "audience_type": "B2C+B2B",
        "access_method": "AUTOMATABLE",
        "b2c_filter": "제목·본문 키워드: 프로모션|할인|쿠폰|혜택|패스|이벤트|외국인|관광객",
        "b2b_exclude": "모집|입찰|용역|채용|공모|사업자|협약|협력|업무협약",
        "content_types": ["campaign", "discount", "travel_notice"],
        "note": "핵심 필드는 본문 비정형 텍스트에서 추출 — 공식 원문 확인 필수",
    },
    "bto-notice": {
        "name": "BTO 공고·행사(우리공사)",
        "list_url": "https://bto.or.kr/kor/CMS/Board/Board.do?mCode=MN090",
        "detail_pattern": "https://bto.or.kr/kor/CMS/Board/Board.do?mCode=MN090&mode=view&mgr_seq=65&board_seq={id}",
        "id_field": "board_seq",
        "audience_type": "B2B 위주",
        "access_method": "AUTOMATABLE",
        "b2c_filter": "관광객 직접 사용 가능한 혜택만",
        "note": "최근 10건 중 B2C 1건 수준 — 수집 우선순위 낮음",
    },
    "vbp": {
        "name": "Visit Busan Pass",
        "official_url": "https://www.visitbusanpass.com",
        "access_method": "AUTOMATABLE",
        "audience_type": "B2C",
        "language_support": ["EN", "JA", "ZHS", "ZHT", "KO"],
        "content_types": ["tourist_pass"],
        "note": "가격 상세는 How to Buy 하위 페이지 탐색 필요",
    },
}


def print_source_urls(source_key: str):
    """선택한 소스의 수집 URL 목록을 출력"""
    if source_key not in SOURCES:
        print(f"ERROR: 소스 '{source_key}'가 없음. 가능한 소스: {list(SOURCES.keys())}")
        sys.exit(1)

    src = SOURCES[source_key]
    print(f"\n{'='*60}")
    print(f"소스: {src['name']}")
    print(f"접근 방법: {src.get('access_method', 'N/A')}")
    print(f"대상 관객: {src.get('audience_type', 'N/A')}")
    if src.get("b2c_filter"):
        print(f"B2C 필터: {src['b2c_filter']}")

    if "list_url" in src:
        print(f"\n목록 URL:")
        print(f"  {src['list_url']}")

    if "total_pages" in src:
        pages = min(src.get("collect_pages", src["total_pages"]), src["total_pages"])
        print(f"\n수집 페이지: 1 ~ {pages} (전체 {src['total_pages']}페이지)")
        prefix = src.get("pagination_prefix", "?")
        if "page_param" in src:
            for p in range(1, pages + 1):
                print(f"  {src['list_url'].split('?')[0]}{prefix}{src['page_param']}={p}")

    if "months_to_collect" in src:
        print(f"\n수집 월:")
        base = src["list_url"].split("?")[0]
        for ym in src["months_to_collect"]:
            y, m = ym.split("-")
            print(f"  {base}?menuCd=DOM_000000304010000000&year={y}&month={int(m)}")

    print(f"\n상세 URL 패턴:")
    if "detail_pattern" in src:
        print(f"  {src['detail_pattern']}")

    print(f"\n수집 대상 content_type:")
    for ct in src.get("content_types", []):
        print(f"  - {ct}")
    print()


def print_all_sources():
    for key in SOURCES:
        print_source_urls(key)


def generate_collection_plan():
    """수집 계획 JSON 파일 생성"""
    plan = {
        "generated_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "reference_date": str(TODAY),
        "sources": [],
        "constraints": {
            "news_article_primary_source": False,
            "b2b_items": "EXCLUDE",
            "candidates_modification": 0,
            "push": False,
        },
    }

    for key, src in SOURCES.items():
        plan["sources"].append(
            {
                "source_id": key,
                "name": src["name"],
                "access_method": src.get("access_method", "UNKNOWN"),
                "audience_type": src.get("audience_type", "UNKNOWN"),
                "list_url": src.get("list_url", src.get("official_url", "")),
                "content_types": src.get("content_types", []),
                "b2c_filter": src.get("b2c_filter"),
            }
        )

    out_path = os.path.join(REPORT_DIR, "busan-promotion-collection-plan-v1.json")
    tmp = out_path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(plan, f, ensure_ascii=False, indent=2)
    os.replace(tmp, out_path)
    print(f"Collection plan written: {os.path.basename(out_path)}")
    return out_path


def main():
    parser = argparse.ArgumentParser(
        description="Busan promotion source discovery — URL 목록 생성"
    )
    parser.add_argument(
        "--source",
        choices=list(SOURCES.keys()) + ["all"],
        default="all",
        help="수집할 소스 (기본값: all)",
    )
    parser.add_argument(
        "--plan",
        action="store_true",
        help="수집 계획 JSON 파일 생성",
    )

    args = parser.parse_args()

    if args.plan:
        path = generate_collection_plan()
        print(f"Collection plan generated: {path}")
        return

    if args.source == "all":
        print_all_sources()
    else:
        print_source_urls(args.source)


if __name__ == "__main__":
    main()
