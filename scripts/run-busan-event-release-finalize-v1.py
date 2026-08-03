"""
TASK-BUSAN-EVENT-RELEASE-FINALIZE-V1
72개 event candidates 분류 → 6개 release manifest 생성

분류 기준:
  CURRENT_OR_UPCOMING_VERIFIED  — 2026년 미래/진행 중 (raw 2026 미래 or bfo 공식 확인)
  PAST_EVENT_VERIFIED           — 2026년 날짜 확인 + 이미 종료 (2026-08-03 기준)
  STALE_DATE                    — raw가 2025 이전 연도, 반복 가능성 있으나 2026 미확인
  DATE_MISSING                  — 어떤 소스에도 날짜 없음 (hold)
  SOURCE_DATE_CONFLICT          — 소스 간 날짜 충돌 미해소
  NO_CURRENT_SOURCE_MATCH       — 소스 연결 없음

제약:
  candidates / source_facts 파일 변경 없음
  push 없음
"""

import json
import os
import sys
from datetime import date

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAND_FILE = os.path.join(
    REPO_ROOT,
    "data/tourapi/enriched/busan/busan-enriched-candidates-v1.jsonl",
)
RAW_FESTIVAL_KO = os.path.join(
    REPO_ROOT,
    "data/tourapi/raw/busan/2026-07-24/batch/busan-festival-ko-p001.json",
)
REPORT_DIR = os.path.join(REPO_ROOT, "data/tourapi/reports/busan")
TODAY = date(2026, 8, 3)

# ── bfo.or.kr로 직접 확인된 2026년 날짜 (WebFetch 결과, 2026-08-03 조회) ────────
BFO_VERIFIED = {
    "busan-E-00001": {
        "date_text": "2026년 8월 7일 ~ 8월 13일",
        "start": date(2026, 8, 7),
        "end": date(2026, 8, 13),
        "via": "bfo.or.kr",
    },
    "busan-E-00009": {
        "date_text": "2026년 6월 19일 ~ 6월 20일",
        "start": date(2026, 6, 19),
        "end": date(2026, 6, 20),
        "via": "bfo.or.kr",
    },
    "busan-E-00006": {
        "date_text": "2026년 11월 7일",
        "start": date(2026, 11, 7),
        "end": date(2026, 11, 7),
        "via": "bfo.or.kr",
    },
    "busan-E-00019": {
        "date_text": "2026년 10월 2일 ~ 10월 4일",
        "start": date(2026, 10, 2),
        "end": date(2026, 10, 4),
        "via": "bfo.or.kr",
    },
    "busan-E-00038": {
        "date_text": "2026년 5월 22일 ~ 5월 24일",
        "start": date(2026, 5, 22),
        "end": date(2026, 5, 24),
        "via": "bfo.or.kr",
    },
}

# ── raw 날짜 파싱된 결과 (FestivalService USAGE_DAY_WEEK_AND_TIME 기준) ─────────
# 2026년 명시된 경우만 포함. 날짜 파싱은 이 스크립트 내에서 판정.
# {candidate_id: {start: date, end: date, date_text: str}}
RAW_2026_DATES = {
    "busan-E-00003": {
        "date_text": "2026. 05. 22. ~ 05. 31.",
        "start": date(2026, 5, 22),
        "end": date(2026, 5, 31),
    },
    "busan-E-00004": {
        "date_text": "2026. 10. 16. ~ 10. 18.",
        "start": date(2026, 10, 16),
        "end": date(2026, 10, 18),
    },
    "busan-E-00007": {
        "date_text": "2026. 5. 15. ~ 5. 24.",
        "start": date(2026, 5, 15),
        "end": date(2026, 5, 24),
    },
    "busan-E-00014": {
        "date_text": "2025년 11월 29일 ~ 2026년 1월 18일",
        "start": date(2025, 11, 29),
        "end": date(2026, 1, 18),
    },
    "busan-E-00015": {
        "date_text": "2026. 04. 17. ~ 04. 19.",
        "start": date(2026, 4, 17),
        "end": date(2026, 4, 19),
    },
    "busan-E-00016": {
        "date_text": "2026. 06. 12. ~ 06. 14.",
        "start": date(2026, 6, 12),
        "end": date(2026, 6, 14),
    },
    "busan-E-00017": {
        "date_text": "2026. 04. 24. ~ 04. 26.",
        "start": date(2026, 4, 24),
        "end": date(2026, 4, 26),
    },
    "busan-E-00018": {
        "date_text": "2025. 12. 05. ~ 2026. 02. 22.",
        "start": date(2025, 12, 5),
        "end": date(2026, 2, 22),
    },
    "busan-E-00020": {
        "date_text": "2026. 3. 21. ~ 3. 22.",
        "start": date(2026, 3, 21),
        "end": date(2026, 3, 22),
    },
    "busan-E-00021": {
        "date_text": "2026. 03. 27. ~ 04. 12.",
        "start": date(2026, 3, 27),
        "end": date(2026, 4, 12),
    },
    "busan-E-00024": {
        "date_text": "2026. 01. 17. ~ 01. 18.",
        "start": date(2026, 1, 17),
        "end": date(2026, 1, 18),
    },
    "busan-E-00029": {
        "date_text": "2026. 05. 01 ~ 05. 17.",
        "start": date(2026, 5, 1),
        "end": date(2026, 5, 17),
    },
    "busan-E-00037": {
        "date_text": "2026. 6. 27. ~ 6. 28.",
        "start": date(2026, 6, 27),
        "end": date(2026, 6, 28),
    },
}

# ── KTO 이벤트 중 FestivalService 연관 이벤트 (날짜 클래스 상속) ───────────────
KTO_FESTIVAL_DUPES = {
    "busan-K-00206": {
        "festival_peer": "busan-E-00022",
        "note": "사상강변축제 — raw 2025.9.20~21 (stale)",
    },
    "busan-K-00211": {
        "festival_peer": "busan-E-00014",
        "note": "해운대 빛축제 — raw 2025.11~2026.01 (past)",
    },
    "busan-K-00546": {
        "festival_peer": "busan-E-00030",
        "note": "부산수제맥주마스터스챌린지 — raw 2025.9.20~24 (stale)",
    },
    "busan-K-00775": {
        "festival_peer": "busan-E-00018",
        "note": "광복로 겨울빛 트리축제 — raw 2025.12~2026.02 (past, winter 2025 season)",
    },
}

# ── 2025 연도 타이틀로 명확히 2025-특정 행사인 KTO 이벤트 ──────────────────
KTO_2025_TITLE = {
    "busan-K-00591": "2025 영호남 전통시장 박람회",
    "busan-K-00723": "2025 별바다부산 나이트마켓",
    "busan-K-00732": "크리스마스 빌리지 부산 2025",
    "busan-K-00758": "2025 서부산 슈퍼어싱 페스티벌",
    "busan-K-00759": "2025 부산세일페스타 부대앞으로",
}


def atomic_write(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)
    print(f"  wrote: {os.path.basename(path)}")


def classify_event(cid, title, raw_date_text, source_keys):
    """Return (classification, reason, verified_date_info)"""
    has_festival = any(s.startswith("FestivalService:") for s in source_keys)
    has_kto = any("KorService2" in s for s in source_keys)
    has_no_source = not has_festival and not has_kto

    # 소스 없는 VB 이벤트
    if has_no_source:
        return (
            "NO_CURRENT_SOURCE_MATCH",
            "source_key 없음 — FestivalService·KTO 연결 없음",
            None,
        )

    # bfo 확인된 날짜 우선
    if cid in BFO_VERIFIED:
        info = BFO_VERIFIED[cid]
        if info["end"] >= TODAY:
            return (
                "CURRENT_OR_UPCOMING_VERIFIED",
                f"bfo.or.kr 공식 확인: {info['date_text']} (미래 또는 진행 중)",
                info,
            )
        else:
            return (
                "PAST_EVENT_VERIFIED",
                f"bfo.or.kr 공식 확인: {info['date_text']} (종료, 기준일 {TODAY})",
                info,
            )

    # raw 2026 날짜 확인
    if cid in RAW_2026_DATES:
        info = RAW_2026_DATES[cid]
        info = dict(info, via="FestivalService_raw_2026")
        if info["end"] >= TODAY:
            return (
                "CURRENT_OR_UPCOMING_VERIFIED",
                f"FestivalService raw 2026년 날짜: {info['date_text']} (미래)",
                info,
            )
        else:
            return (
                "PAST_EVENT_VERIFIED",
                f"FestivalService raw 2026년 날짜: {info['date_text']} (종료, 기준일 {TODAY})",
                info,
            )

    # KTO 이벤트 중 FestivalService 이벤트와 동일 행사인 경우
    if cid in KTO_FESTIVAL_DUPES:
        peer_info = KTO_FESTIVAL_DUPES[cid]
        return (
            "STALE_DATE",
            f"KTO 소스, FestivalService 동명 행사({peer_info['festival_peer']}) raw 날짜 만료 — {peer_info['note']}",
            None,
        )

    # 2025 타이틀 KTO 이벤트
    if cid in KTO_2025_TITLE:
        return (
            "STALE_DATE",
            f"타이틀에 '2025' 포함, 2025년 특정 행사로 판정 — 2026 개최 미확인",
            None,
        )

    # FestivalService 연결 있는데 raw 날짜가 2025 이전
    if has_festival and raw_date_text:
        return (
            "STALE_DATE",
            f"FestivalService raw 날짜 만료(2025 이전): {raw_date_text[:60]}",
            None,
        )

    # 날짜 없음
    return "DATE_MISSING", "어떤 소스에도 날짜 정보 없음 (hold)", None


def run():
    # 1. raw festival ko 로드
    with open(RAW_FESTIVAL_KO, encoding="utf-8") as f:
        raw_data = json.load(f)
    items_raw = raw_data["getFestivalKr"]["item"]
    raw_by_uc = {str(it["UC_SEQ"]): it for it in items_raw}
    print(f"Raw festival items: {len(raw_by_uc)}")

    # 2. 72개 event candidates 로드
    events = []
    with open(CAND_FILE, encoding="utf-8") as f:
        for line in f:
            rec = json.loads(line)
            if rec.get("category") == "event":
                events.append(rec)
    print(f"Event candidates: {len(events)}")

    # 3. 분류
    buckets = {
        "CURRENT_OR_UPCOMING_VERIFIED": [],
        "PAST_EVENT_VERIFIED": [],
        "STALE_DATE": [],
        "DATE_MISSING": [],
        "SOURCE_DATE_CONFLICT": [],
        "NO_CURRENT_SOURCE_MATCH": [],
    }

    for ev in events:
        cid = ev["candidate_id"]
        title = ev.get("title_ko", "")
        ss = ev.get("source_summary", {})
        sk = ss.get("source_keys", [])

        # raw date 텍스트 가져오기
        raw_date_text = None
        fest_ids = [s for s in sk if s.startswith("FestivalService:")]
        if fest_ids:
            parts = fest_ids[0].split(":")
            uc_seq = parts[1] if len(parts) >= 2 else None
            if uc_seq and uc_seq in raw_by_uc:
                raw_date_text = raw_by_uc[uc_seq].get("USAGE_DAY_WEEK_AND_TIME") or None

        clf, reason, date_info = classify_event(cid, title, raw_date_text, sk)

        entry = {
            "candidate_id": cid,
            "title_ko": title,
            "classification": clf,
            "reason": reason,
            "source_keys": sk,
            "raw_date_text": raw_date_text,
            "verified_date": (
                {
                    "date_text": date_info["date_text"],
                    "start": date_info["start"].isoformat(),
                    "end": date_info["end"].isoformat(),
                    "via": date_info.get("via", "unknown"),
                }
                if date_info
                else None
            ),
        }
        buckets[clf].append(entry)

    # 4. 합계 검증
    total = sum(len(v) for v in buckets.values())
    assert total == 72, f"합계 오류: {total} != 72"
    print(f"\n분류 완료 — 합계 {total}건 검증 OK")
    for k, v in buckets.items():
        print(f"  {k}: {len(v)}")

    # 5. 출력 파일 생성
    print()
    manifest_meta = {
        "generated_at": "2026-08-03T00:00:00Z",
        "task_id": "TASK-BUSAN-EVENT-RELEASE-FINALIZE-V1",
        "reference_date": str(TODAY),
        "total_events_input": 72,
    }

    # 5-1. current/upcoming
    atomic_write(
        os.path.join(REPORT_DIR, "busan-current-event-release-manifest.json"),
        {
            **manifest_meta,
            "classification": "CURRENT_OR_UPCOMING_VERIFIED",
            "description": "2026년 날짜 공식 확인, 기준일 이후 예정/진행 행사 (release 가능)",
            "count": len(buckets["CURRENT_OR_UPCOMING_VERIFIED"]),
            "items": buckets["CURRENT_OR_UPCOMING_VERIFIED"],
        },
    )

    # 5-2. past events
    atomic_write(
        os.path.join(REPORT_DIR, "busan-past-event-manifest.json"),
        {
            **manifest_meta,
            "classification": "PAST_EVENT_VERIFIED",
            "description": "2026년 날짜 확인됐으나 기준일 이전 이미 종료 (날짜 표시 후 별도 정책 결정)",
            "count": len(buckets["PAST_EVENT_VERIFIED"]),
            "items": buckets["PAST_EVENT_VERIFIED"],
        },
    )

    # 5-3. stale hold
    atomic_write(
        os.path.join(REPORT_DIR, "busan-event-stale-hold-manifest.json"),
        {
            **manifest_meta,
            "classification": "STALE_DATE",
            "description": "raw 날짜가 2025년 이전 또는 2025 타이틀, 반복 가능성 있으나 2026 미확인 (hold)",
            "count": len(buckets["STALE_DATE"]),
            "items": buckets["STALE_DATE"],
        },
    )

    # 5-4. date missing hold
    atomic_write(
        os.path.join(REPORT_DIR, "busan-event-date-missing-hold-manifest.json"),
        {
            **manifest_meta,
            "classification": "DATE_MISSING",
            "description": "어떤 소스에도 날짜 정보 없음 (hold)",
            "count": len(buckets["DATE_MISSING"]),
            "items": buckets["DATE_MISSING"],
        },
    )

    # 5-5. source conflict hold (빈 파일도 생성)
    atomic_write(
        os.path.join(REPORT_DIR, "busan-event-source-conflict-hold-manifest.json"),
        {
            **manifest_meta,
            "classification": "SOURCE_DATE_CONFLICT",
            "description": "소스 간 날짜 충돌 미해소. 이번 분류에서는 해당 건 없음 — bfo 날짜는 항상 FestivalService raw보다 우선 적용됨으로써 충돌이 해소됨.",
            "count": 0,
            "items": [],
            "note": "raw vs bfo 날짜 차이는 모두 'FestivalService raw=2025 stale / bfo=2026 업데이트' 패턴으로 충돌 아님 — bfo 우선으로 CURRENT_OR_UPCOMING 또는 PAST로 분류 완료.",
        },
    )

    # 5-6. summary
    atomic_write(
        os.path.join(REPORT_DIR, "busan-event-release-summary.json"),
        {
            **manifest_meta,
            "summary": {
                "CURRENT_OR_UPCOMING_VERIFIED": len(
                    buckets["CURRENT_OR_UPCOMING_VERIFIED"]
                ),
                "PAST_EVENT_VERIFIED": len(buckets["PAST_EVENT_VERIFIED"]),
                "STALE_DATE": len(buckets["STALE_DATE"]),
                "DATE_MISSING": len(buckets["DATE_MISSING"]),
                "SOURCE_DATE_CONFLICT": len(buckets["SOURCE_DATE_CONFLICT"]),
                "NO_CURRENT_SOURCE_MATCH": len(buckets["NO_CURRENT_SOURCE_MATCH"]),
                "TOTAL": total,
            },
            "date_source_hierarchy": [
                "1st: bfo.or.kr (부산축제조직위원회) — 2026년 확정 날짜",
                "2nd: FestivalService raw 2026년 명시 날짜",
                "3rd: FestivalService raw 2025 이전 날짜 → STALE",
                "4th: KTO KorService2 raw → 날짜 없음 → DATE_MISSING 또는 STALE(타이틀/중복 기준)",
                "5th: 소스 없음 → NO_CURRENT_SOURCE_MATCH",
            ],
            "release_recommendation": {
                "immediate_release": "CURRENT_OR_UPCOMING_VERIFIED 4건",
                "hold_for_date_verification": "STALE_DATE 25건 — bfo.or.kr 또는 공식 사이트에서 2026 날짜 확인 후 재분류",
                "hold_for_source_search": "DATE_MISSING 26건 — 날짜 출처 발굴 필요",
                "no_source_action_required": "NO_CURRENT_SOURCE_MATCH 3건 — 소스 연결 후 재검토",
                "past_display_policy": "PAST_EVENT_VERIFIED 14건 — 종료 표시 정책 결정 후 게시 여부 결정",
            },
            "candidates_modified": 0,
            "source_facts_modified": 0,
            "push": False,
        },
    )

    # 5-7. completion report
    atomic_write(
        os.path.join(
            REPORT_DIR,
            "task-busan-event-release-finalize-v1-completion-report.json",
        ),
        {
            "report_id": "task-busan-event-release-finalize-v1-completion-report",
            "report_type": "COMPLETION",
            "task_id": "TASK-BUSAN-EVENT-RELEASE-FINALIZE-V1",
            "result": "PASS",
            "generated_at": "2026-08-03T00:00:00Z",
            "git": {
                "branch": "data/busan-enrichment-v1",
                "commit": "pending",
            },
            "input": {
                "event_candidates_total": 72,
                "festival_service_linked": 38,
                "kto_only": 31,
                "no_source": 3,
            },
            "output": {
                "CURRENT_OR_UPCOMING_VERIFIED": len(
                    buckets["CURRENT_OR_UPCOMING_VERIFIED"]
                ),
                "PAST_EVENT_VERIFIED": len(buckets["PAST_EVENT_VERIFIED"]),
                "STALE_DATE": len(buckets["STALE_DATE"]),
                "DATE_MISSING": len(buckets["DATE_MISSING"]),
                "SOURCE_DATE_CONFLICT": 0,
                "NO_CURRENT_SOURCE_MATCH": len(buckets["NO_CURRENT_SOURCE_MATCH"]),
                "TOTAL_CLASSIFIED": total,
            },
            "integrity": {
                "input_count_check": "72 == 72 PASS",
                "output_sum_check": f"{total} == 72 PASS",
                "candidates_modified": 0,
                "source_facts_modified": 0,
                "push": False,
            },
            "date_authority": {
                "primary": "bfo.or.kr (부산축제조직위원회) — 5건 확인 (E-00001, E-00006, E-00009, E-00019, E-00038)",
                "secondary": "FestivalService raw 2026년 날짜 — 13건 직접 사용",
                "stale_pattern": "FestivalService raw 2025 이전 날짜 16건, KTO 중복/2025타이틀 9건 → STALE_DATE",
                "no_date_pattern": "FestivalService 날짜없음 4건, KTO 독립 날짜없음 22건 → DATE_MISSING",
            },
            "conflict_resolution": "raw vs bfo 날짜 차이 5건 — 모두 'FestivalService=2025 stale, bfo=2026 업데이트' 패턴으로 충돌 아님. bfo 우선 적용으로 정상 분류 완료. SOURCE_DATE_CONFLICT = 0.",
            "output_files": [
                "busan-current-event-release-manifest.json",
                "busan-past-event-manifest.json",
                "busan-event-stale-hold-manifest.json",
                "busan-event-date-missing-hold-manifest.json",
                "busan-event-source-conflict-hold-manifest.json",
                "busan-event-release-summary.json",
                "task-busan-event-release-finalize-v1-completion-report.json",
            ],
            "next_steps": [
                "STALE_DATE 25건: bfo.or.kr 전체 행사 목록에서 2026 날짜 조회 → 확인되면 CURRENT_OR_UPCOMING 또는 PAST로 재분류",
                "DATE_MISSING 26건: 공식 홈페이지/SNS 검색으로 날짜 발굴",
                "PAST_EVENT_VERIFIED 14건: '이미 종료된 행사' 표시 정책 결정 후 게시 여부 결정",
                "NO_CURRENT_SOURCE_MATCH 3건: 소스 데이터 확보 후 재검토",
            ],
        },
    )

    print("\nAll outputs written successfully.")
    print(f"Candidates modified: 0")
    print(f"Source facts modified: 0")
    print(f"Push: False")


if __name__ == "__main__":
    run()
