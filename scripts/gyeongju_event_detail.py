#!/usr/bin/env python3
"""
경주 행사 24건 KTO detailCommon2 + detailIntro2 수집 및 날짜·현재성 보강

필수 환경변수:
  TOUR_API_KEY   — 공공데이터포털 인증키

규칙:
  - 이벤트 날짜를 opening_hours에 저장하지 않음
  - 공식 값이 없으면 생성하지 않음
  - raw는 data/tourapi/raw/gyeongju/kto-detail/ 보존
  - raw는 .gitignore 대상 (커밋되지 않음)

사용법:
  TOUR_API_KEY=<key> python gyeongju_event_detail.py [옵션]
  python gyeongju_event_detail.py --help
"""
import argparse, json, os, sys, time, hashlib, urllib.request, urllib.parse
from pathlib import Path
from datetime import date
from collections import Counter

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

KTO_BASE = 'https://apis.data.go.kr/B551011/KorService2'
MAX_RETRIES = 3
CALL_INTERVAL = 0.3


def parse_args():
    p = argparse.ArgumentParser(
        description='경주 행사 24건 KTO detail 수집 및 날짜·현재성 보강',
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    p.add_argument('--in-reviewed',
                   default='data/tourapi/validation/gyeongju/gyeongju-candidates-reviewed-v1.jsonl',
                   help='입력: 검토 완료 candidates JSONL')
    p.add_argument('--out-detail-raw', default='data/tourapi/raw/gyeongju/kto-detail',
                   help='KTO detail raw 출력 디렉터리 (gitignore 대상)')
    p.add_argument('--out-reviewed',
                   default='data/tourapi/validation/gyeongju/gyeongju-candidates-reviewed-v1.jsonl',
                   help='출력: 업데이트된 candidates JSONL (덮어쓰기)')
    p.add_argument('--today', default=None,
                   help='기준 날짜 YYYY-MM-DD (기본: 오늘, 재현성 테스트용)')
    return p.parse_args()


def get_api_key() -> str:
    key = os.environ.get('TOUR_API_KEY', '')
    if not key:
        print('[ERROR] TOUR_API_KEY 환경변수가 설정되지 않았습니다', file=sys.stderr)
        sys.exit(1)
    print('credential_values_exposed=false')
    return key


def kto_get(operation: str, params: dict, api_key: str) -> dict:
    base = f"{KTO_BASE}/{operation}"
    p = {"ServiceKey": api_key, "MobileOS": "ETC", "MobileApp": "KoreaMate",
         "_type": "json", **params}
    url = base + "?" + urllib.parse.urlencode(p)
    for attempt in range(MAX_RETRIES):
        try:
            with urllib.request.urlopen(url, timeout=15) as r:
                return json.loads(r.read().decode('utf-8'))
        except Exception as e:
            if attempt == MAX_RETRIES - 1:
                raise
            time.sleep(2 ** attempt)


def extract_item(resp: dict) -> dict:
    body = resp.get("response", {}).get("body", {})
    if body.get("totalCount", 0) == 0:
        return {}
    items = body.get("items", {})
    if not isinstance(items, dict):
        return {}
    item = items.get("item", [])
    if isinstance(item, list):
        return item[0] if item else {}
    return item if isinstance(item, dict) else {}


def classify_event(start_str: str, end_str: str, has_data: bool, today: date) -> str:
    if not has_data:
        return "HOLD_NO_CURRENT_SOURCE_EVENT"
    s = (start_str or "").strip()
    e = (end_str or "").strip()
    if not s and not e:
        return "HOLD_DATE_MISSING_EVENT"
    try:
        sd = date(int(s[:4]), int(s[4:6]), int(s[6:8])) if s else None
        ed = date(int(e[:4]), int(e[4:6]), int(e[6:8])) if e else None
        if sd and ed and sd > ed:
            print(f"    [WARNING] 날짜 역전: start={s} > end={e}")
        if ed and ed < today:
            return "HOLD_PAST_EVENT"
        if sd and sd > today:
            return "UPCOMING_EVENT"
        if (sd and sd <= today) or (ed and ed >= today):
            return "CURRENT_EVENT"
        if sd and sd < today and ed is None:
            return "HOLD_STALE_EVENT"
        return "HOLD_DATE_MISSING_EVENT"
    except (ValueError, TypeError):
        return "HOLD_DATE_MISSING_EVENT"


def main():
    args = parse_args()
    api_key = get_api_key()
    today = date.fromisoformat(args.today) if args.today else date.today()
    now_iso = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())

    reviewed_in  = Path(args.in_reviewed)
    detail_dir   = Path(args.out_detail_raw)
    reviewed_out = Path(args.out_reviewed)

    detail_dir.mkdir(parents=True, exist_ok=True)

    with open(reviewed_in, encoding='utf-8') as f:
        all_records = [json.loads(l) for l in f if l.strip()]

    events    = [r for r in all_records if r.get('category') == 'event']
    non_events = [r for r in all_records if r.get('category') != 'event']
    print(f"이벤트: {len(events)}건, 비행사: {len(non_events)}건, 기준일: {today}")

    # 비행사 원본 (변경 여부 검증용)
    non_events_json = sorted(json.dumps(r, ensure_ascii=False, sort_keys=True) for r in non_events)

    results = {}
    api_calls = 0

    for ev in events:
        cid_raw    = ev["candidate_id"]
        content_id = cid_raw.split("-KTO15-")[-1]
        print(f"\n  {cid_raw} (contentId={content_id})")

        cp = detail_dir / f"kto-detail-common2-{content_id}.json"
        ip = detail_dir / f"kto-detail-intro2-{content_id}.json"

        # detailCommon2
        try:
            rc = kto_get("detailCommon2", {"contentId": content_id}, api_key)
            api_calls += 1
            cp.write_text(json.dumps(rc, ensure_ascii=False, indent=2), encoding='utf-8')
            item_c = extract_item(rc)
        except Exception as e:
            print(f"    ERROR detailCommon2: {e}")
            item_c = {}
        time.sleep(CALL_INTERVAL)

        # detailIntro2
        try:
            ri = kto_get("detailIntro2", {"contentId": content_id, "contentTypeId": "15"}, api_key)
            api_calls += 1
            ip.write_text(json.dumps(ri, ensure_ascii=False, indent=2), encoding='utf-8')
            item_i = extract_item(ri)
        except Exception as e:
            print(f"    ERROR detailIntro2: {e}")
            item_i = {}
        time.sleep(CALL_INTERVAL)

        has_data = bool(item_c) or bool(item_i)

        event_start = (item_i.get("eventstartdate") or "").strip() or None
        event_end   = (item_i.get("eventenddate") or "").strip() or None
        event_place = (item_i.get("eventplace") or "").strip() or None
        usetimefest = (item_i.get("usetimefestival") or "").strip() or None
        official_url = ((item_c.get("homepage") or item_i.get("eventhomepage") or "").strip() or None)
        description_ko = (item_c.get("overview") or "").strip() or None
        phone_c     = (item_c.get("tel") or "").strip() or None

        clf = classify_event(event_start, event_end, has_data, today)
        print(f"    start={event_start or '-'} end={event_end or '-'} → {clf}")

        results[cid_raw] = {
            "content_id": content_id,
            "event_start_date": event_start,
            "event_end_date": event_end,
            "event_place": event_place,
            "usetimefestival": usetimefest,
            "official_url": official_url,
            "description_ko": description_ko,
            "phone": phone_c,
            "classification": clf,
            "has_data": has_data,
            "collected_at": now_iso,
        }

    print(f"\n총 API 호출: {api_calls}")
    dist = Counter(v["classification"] for v in results.values())
    print("분류 분포:", dict(dist))

    # reviewed candidates 업데이트 (이벤트 24건만)
    updated_events = []
    for ev in events:
        cid = ev["candidate_id"]
        r = results.get(cid, {})
        ev = dict(ev)

        if r.get("event_start_date") is not None:
            ev["event_start_date"] = r["event_start_date"]
        if r.get("event_end_date") is not None:
            ev["event_end_date"] = r["event_end_date"]
        if r.get("event_place") is not None:
            ev["event_place"] = r["event_place"]
        if r.get("usetimefestival") is not None:
            ev["event_operating_hours"] = r["usetimefestival"]  # NOT opening_hours
        if r.get("official_url") and not ev.get("official_url"):
            ev["official_url"] = r["official_url"]
        if r.get("description_ko") and not ev.get("description_ko"):
            ev["description_ko"] = r["description_ko"]

        # 이벤트 날짜를 opening_hours에 저장하지 않음 (검증)
        assert "event_start_date" not in str(ev.get("opening_hours", "")), \
            "이벤트 날짜가 opening_hours에 저장됨 — 금지"

        clf = r.get("classification", "HOLD_NO_CURRENT_SOURCE_EVENT")
        ev["event_classification"] = clf
        ev["event_detail_collected_at"] = now_iso

        if clf in ("CURRENT_EVENT", "UPCOMING_EVENT"):
            ev["publishability"] = "review_required"
            ev["release_exclusion_reasons"] = []
        elif clf == "HOLD_PAST_EVENT":
            ev["publishability"] = "excluded"
            ev["release_exclusion_reasons"] = ["HOLD_PAST_EVENT"]
        elif clf == "HOLD_STALE_EVENT":
            ev["publishability"] = "excluded"
            ev["release_exclusion_reasons"] = ["HOLD_STALE_EVENT"]
        elif clf == "HOLD_NO_CURRENT_SOURCE_EVENT":
            ev["publishability"] = "excluded"
            ev["release_exclusion_reasons"] = ["HOLD_NO_CURRENT_SOURCE_EVENT"]
        else:
            ev["publishability"] = "excluded"
            ev["release_exclusion_reasons"] = ["HOLD_DATE_MISSING_EVENT"]

        updated_events.append(ev)

    # 비행사 변경 검증
    final_non_events_json = sorted(json.dumps(r, ensure_ascii=False, sort_keys=True) for r in non_events)
    if non_events_json != final_non_events_json:
        print("[HOLD] 비행사 candidate 예상치 않은 변경 감지", file=sys.stderr)
        sys.exit(1)
    print(f"비행사 {len(non_events)}건 변경 없음 ✓")

    # 원본 순서 유지
    event_map = {r["candidate_id"]: r for r in updated_events}
    non_event_map = {r["candidate_id"]: r for r in non_events}
    ordered = []
    for orig in all_records:
        c = orig["candidate_id"]
        ordered.append(event_map.get(c, non_event_map.get(c, orig)))

    reviewed_out.parent.mkdir(parents=True, exist_ok=True)
    with open(reviewed_out, 'w', encoding='utf-8') as f:
        for rec in ordered:
            f.write(json.dumps(rec, ensure_ascii=False, default=str) + '\n')

    sha = hashlib.sha256(reviewed_out.read_bytes()).hexdigest()
    print(f"\nreviewed candidates 저장: {len(ordered)}건 → SHA={sha[:16]}...")
    print(f"raw detail: {detail_dir} (gitignore 대상, 커밋 불필요)")
    print("\n분류 결과:")
    for clf, cnt in sorted(dist.items()):
        print(f"  {clf}: {cnt}건")
    release_possible = sum(1 for v in results.values() if v["classification"] in ("CURRENT_EVENT", "UPCOMING_EVENT"))
    hold_events = len(events) - release_possible
    print(f"\nrelease 가능: {release_possible}건 / HOLD: {hold_events}건")
    print("Done.")


if __name__ == '__main__':
    main()
