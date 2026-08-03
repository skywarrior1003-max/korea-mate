#!/usr/bin/env python3
"""
TASK-KTO-EN-DETAIL-APPLY-V1
HIGH_CONFIDENCE_LINK 43건의 KTO 영문 정보를
enriched candidates와 source facts에 반영한다.

적용 대상만:
  - description_en (공식 overview, 기존 값 없을 때만)
  - name_en (공식 title_en, 기존 값 없을 때만)
  - source_summary.source_keys, kto_en_linked
  - provenance.kto_en_enrichment (신규 필드 추가)
  - source_facts 43건 추가 (EngService2:cid:en)

금지: 이미지·flags·publishability·번역문·기존 값 overwrite
"""
import json, re, sys, html as html_mod
from pathlib import Path
from datetime import datetime, timezone

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# ─── 경로 ────────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent

HC_MANIFEST  = ROOT / "data/tourapi/manifests/busan/kto-en-high-confidence-links.json"
FP_REPORT    = ROOT / "data/tourapi/reports/busan/kto-en-candidate-field-preview.json"
EN_RAW_DIR   = ROOT / "data/tourapi/raw/kto/detailCommon2En/full"
CANDIDATES   = ROOT / "data/tourapi/enriched/busan/busan-enriched-candidates-v1.jsonl"
SOURCE_FACTS = ROOT / "data/tourapi/enriched/busan/busan-source-facts-v1.jsonl"
REPORTS_DIR  = ROOT / "data/tourapi/reports/busan"

EXPECTED_HC_COUNT        = 43
EXPECTED_CANDIDATE_COUNT = 1642
EXPECTED_DESC_EN_NEW_MAX = 36
EXPECTED_NAME_EN_NEW_MAX = 5

# ─── 유틸리티 ─────────────────────────────────────────────────────────────────
def clean_overview(text: str) -> str:
    if not text:
        return ""
    text = html_mod.unescape(text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text

def clean_title(text: str) -> str:
    if not text:
        return ""
    text = html_mod.unescape(text)
    # 한국어 괄호 부분 제거: "Title (한국어원제)" 형식
    # 단, 전체가 괄호 안인 경우는 유지
    cleaned = re.sub(r"\s*\([^)]*[가-힣][^)]*\)\s*$", "", text).strip()
    if not cleaned:
        return text.strip()
    return cleaned

# ─── Phase 0: 입력 검증 ───────────────────────────────────────────────────────
print("=== Phase 0: 입력 검증 ===")

hc_data = json.loads(HC_MANIFEST.read_text(encoding="utf-8"))
hc_records = hc_data["records"]
assert len(hc_records) == EXPECTED_HC_COUNT, (
    f"HC 건수 불일치: {len(hc_records)} != {EXPECTED_HC_COUNT}"
)
# 모두 HIGH_CONFIDENCE_LINK 판정이어야 함
bad_verdict = [r for r in hc_records if r["verdict"] != "HIGH_CONFIDENCE_LINK"]
assert not bad_verdict, f"HC가 아닌 판정 포함: {[r['contentid'] for r in bad_verdict]}"
# candidate_id 없는 것 없어야 함
no_cand = [r for r in hc_records if not r["candidate_id"]]
assert not no_cand, f"candidate_id 없는 HC: {[r['contentid'] for r in no_cand]}"
print(f"HC manifest: {len(hc_records)}건, 모두 HIGH_CONFIDENCE_LINK PASS")

# ─── Phase 1: EN raw 로드 ─────────────────────────────────────────────────────
print("\n=== Phase 1: EN raw 로드 ===")

hc_en_cids = {r["contentid"] for r in hc_records}

en_detail: dict = {}   # cid -> item dict

for rf in EN_RAW_DIR.glob("detail-common2en-*.json"):
    m = re.search(r"detail-common2en-(\d+)\.json", rf.name)
    if not m or m.group(1) not in hc_en_cids:
        continue
    d = json.loads(rf.read_text(encoding="utf-8"))
    body = d.get("response", {}).get("body", {})
    if isinstance(body, str) or not body:
        continue
    items_obj = body.get("items", {})
    if isinstance(items_obj, str) or not items_obj:
        continue
    item_list = items_obj.get("item", [])
    if isinstance(item_list, dict):
        item_list = [item_list]
    if not item_list:
        continue
    item = item_list[0]
    cid = str(item.get("contentid", m.group(1)))

    try:
        mapx = float(item.get("mapx") or 0)
        mapy = float(item.get("mapy") or 0)
    except (ValueError, TypeError):
        mapx, mapy = 0.0, 0.0

    en_detail[cid] = {
        "contentid": cid,
        "title_raw":  (item.get("title") or "").strip(),
        "title_clean": clean_title(html_mod.unescape((item.get("title") or "").strip())),
        "overview_raw": (item.get("overview") or "").strip(),
        "overview_clean": clean_overview(item.get("overview") or ""),
        "addr1": (item.get("addr1") or "").strip(),
        "mapx": mapx,
        "mapy": mapy,
        "cat1": item.get("cat1", ""),
        "lclsSystm1": item.get("lclsSystm1", ""),
        "firstimage": (item.get("firstimage") or "").strip(),
    }

print(f"EN raw 로드: {len(en_detail)}건 (HC 43건 중 item 있는 것)")

# HC에서 EN raw 없는 것은 이미 EMPTY_DETAIL이어야 함 → HC manifest에는 있으므로 문제
missing_raw = [r["contentid"] for r in hc_records if r["contentid"] not in en_detail]
if missing_raw:
    raise AssertionError(f"HC에 EN raw 없는 cid: {missing_raw}")
print("모든 HC EN cid에 raw 존재 PASS")

# ─── Phase 2: candidate 전체 로드 ─────────────────────────────────────────────
print("\n=== Phase 2: candidate 전체 로드 ===")

all_candidates = []
with open(CANDIDATES, encoding="utf-8") as f:
    for line in f:
        all_candidates.append(json.loads(line))

assert len(all_candidates) == EXPECTED_CANDIDATE_COUNT, (
    f"candidate 수량 불일치: {len(all_candidates)} != {EXPECTED_CANDIDATE_COUNT}"
)
cand_by_id = {c["candidate_id"]: c for c in all_candidates}
print(f"candidate 로드: {len(all_candidates)}건 PASS")

# ─── Phase 3: 적용 사항 계획 ─────────────────────────────────────────────────
print("\n=== Phase 3: 적용 사항 계획 ===")

now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

plan: list = []   # {contentid, candidate_id, apply_desc, apply_name, new_desc, new_name, ...}

desc_en_new_count = 0
desc_en_skip_count = 0
name_en_new_count = 0
name_en_skip_count = 0

for r in hc_records:
    en_cid   = r["contentid"]
    cand_id  = r["candidate_id"]
    cand     = cand_by_id[cand_id]
    pv       = cand.get("proposed_values", {})
    det      = en_detail[en_cid]

    existing_desc = (pv.get("description_en") or "").strip()
    existing_name = (pv.get("name_en") or "").strip()

    new_desc  = det["overview_clean"]
    new_title = det["title_clean"]

    apply_desc = bool(new_desc) and not existing_desc
    apply_name = bool(new_title) and not existing_name

    if new_desc:
        if apply_desc:
            desc_en_new_count += 1
        else:
            desc_en_skip_count += 1

    if new_title:
        if apply_name:
            name_en_new_count += 1
        else:
            name_en_skip_count += 1

    plan.append({
        "contentid":  en_cid,
        "candidate_id": cand_id,
        "apply_desc": apply_desc,
        "apply_name": apply_name,
        "new_desc":   new_desc if apply_desc else None,
        "new_name":   new_title if apply_name else None,
        "source_key": f"EngService2:{en_cid}:en",
        "match_signals": r["match_signals"],
        "distance_m":  r["distance_m"],
        "has_existing_link": "existing_kto_en_link" in r["match_signals"],
        "en_addr1":   det["addr1"],
        "en_mapx":    det["mapx"],
        "en_mapy":    det["mapy"],
        "en_title_raw": det["title_raw"],
        "en_overview_raw": det["overview_raw"][:100] if det["overview_raw"] else "",
    })

print(f"description_en 신규 반영 예정: {desc_en_new_count}건")
print(f"description_en 기존 값 skip:  {desc_en_skip_count}건")
print(f"name_en 신규 반영 예정:       {name_en_new_count}건")
print(f"name_en 기존 값 skip:         {name_en_skip_count}건")

# 사전 검증
assert desc_en_new_count <= EXPECTED_DESC_EN_NEW_MAX, (
    f"description_en 신규 {desc_en_new_count} > {EXPECTED_DESC_EN_NEW_MAX}"
)
assert name_en_new_count <= EXPECTED_NAME_EN_NEW_MAX, (
    f"name_en 신규 {name_en_new_count} > {EXPECTED_NAME_EN_NEW_MAX}"
)
print("사전 검증 PASS")

# ─── Phase 4: candidate 수정 ──────────────────────────────────────────────────
print("\n=== Phase 4: candidate 수정 ===")

# candidate_id → plan entry 인덱스
plan_by_cand = {p["candidate_id"]: p for p in plan}

modified_count = 0
overwrite_guard_violations = []

new_candidates = []
for cand in all_candidates:
    cid_ = cand["candidate_id"]
    if cid_ not in plan_by_cand:
        new_candidates.append(cand)
        continue

    p = plan_by_cand[cid_]

    import copy
    c = copy.deepcopy(cand)
    pv = c["proposed_values"]
    ss = c.get("source_summary", {})
    prov = c.get("provenance", {})

    # ── description_en ───────────────────────────────────────────────────────
    if p["apply_desc"]:
        existing = (pv.get("description_en") or "").strip()
        if existing:
            overwrite_guard_violations.append(
                f"{cid_} description_en already set: {existing[:40]}"
            )
        else:
            pv["description_en"] = p["new_desc"]
            ss["has_en_description"] = True

    # ── name_en ──────────────────────────────────────────────────────────────
    if p["apply_name"]:
        existing = (pv.get("name_en") or "").strip()
        if existing:
            overwrite_guard_violations.append(
                f"{cid_} name_en already set: {existing[:40]}"
            )
        else:
            pv["name_en"] = p["new_name"]

    # ── source_summary ────────────────────────────────────────────────────────
    src_key = p["source_key"]
    current_keys = ss.get("source_keys") or []
    if src_key not in current_keys:
        current_keys = list(current_keys) + [src_key]
        ss["source_keys"] = current_keys
        ss["source_key_count"] = len(current_keys)
    ss["kto_en_linked"] = True
    ss["has_english_source"] = True

    # kto_en_link_note 없으면 추가
    if not ss.get("kto_en_link_note"):
        dist = p.get("distance_m")
        dist_str = f"{dist:.1f}m" if dist is not None else "?"
        ss["kto_en_link_note"] = (
            f"EngService2:{p['contentid']}:en dist={dist_str}"
        )

    # ── provenance ────────────────────────────────────────────────────────────
    applied_fields = []
    if p["apply_desc"]:
        applied_fields.append("description_en")
    if p["apply_name"]:
        applied_fields.append("name_en")

    # 기존 kto_en_enrichment가 없을 때만 추가
    if "kto_en_enrichment" not in prov:
        prov["kto_en_enrichment"] = {
            "task": "TASK-KTO-EN-DETAIL-APPLY-V1",
            "contentid": p["contentid"],
            "source_key": src_key,
            "applied_fields": applied_fields,
            "applied_at": now_iso,
        }

    c["proposed_values"] = pv
    c["source_summary"] = ss
    c["provenance"] = prov

    new_candidates.append(c)
    modified_count += 1

assert not overwrite_guard_violations, (
    f"기존 값 overwrite 감지!\n" + "\n".join(overwrite_guard_violations)
)
print(f"기존 값 overwrite: 0 PASS")
print(f"수정된 candidate: {modified_count}건")
assert modified_count == EXPECTED_HC_COUNT, (
    f"수정 건수 불일치: {modified_count} != {EXPECTED_HC_COUNT}"
)

# ─── Phase 5: 검증 ────────────────────────────────────────────────────────────
print("\n=== Phase 5: 검증 ===")

assert len(new_candidates) == EXPECTED_CANDIDATE_COUNT, (
    f"candidate 총수 변경: {len(new_candidates)} != {EXPECTED_CANDIDATE_COUNT}"
)
print(f"candidate 총수: {EXPECTED_CANDIDATE_COUNT}건 유지 PASS")

# 다른 후보 변경 없음 확인
modified_ids = {p["candidate_id"] for p in plan}
unchanged_count = 0
for c in new_candidates:
    if c["candidate_id"] not in modified_ids:
        orig = cand_by_id[c["candidate_id"]]
        if json.dumps(c, ensure_ascii=False, sort_keys=True) != json.dumps(orig, ensure_ascii=False, sort_keys=True):
            raise AssertionError(f"다른 candidate 변경됨: {c['candidate_id']}")
        unchanged_count += 1
print(f"다른 후보 변경: 0 PASS ({unchanged_count}건 미수정)")

# flags/publishability 변경 없음
for cid_ in modified_ids:
    orig_cand = cand_by_id[cid_]
    new_cand = next(c for c in new_candidates if c["candidate_id"] == cid_)
    # validation 필드 비교
    if orig_cand.get("validation") != new_cand.get("validation"):
        raise AssertionError(f"{cid_} validation 변경됨!")
    if orig_cand.get("image_assessment") != new_cand.get("image_assessment"):
        raise AssertionError(f"{cid_} image_assessment 변경됨!")
print("flags/publishability 변경: 0 PASS")

# description_en 실제 반영 수
actual_desc_new = sum(
    1 for p in plan if p["apply_desc"]
)
actual_name_new = sum(
    1 for p in plan if p["apply_name"]
)
assert actual_desc_new == desc_en_new_count
assert actual_name_new == name_en_new_count
print(f"description_en 실제 반영: {actual_desc_new}건")
print(f"name_en 실제 반영:        {actual_name_new}건")

# ─── Phase 6: source_facts 추가 ───────────────────────────────────────────────
print("\n=== Phase 6: source_facts 추가 ===")

# 기존 source_facts 로드 (중복 확인용)
existing_sf_keys = set()
existing_sf_lines = []
with open(SOURCE_FACTS, encoding="utf-8") as f:
    for line in f:
        d = json.loads(line)
        key = f"{d['candidate_id']}|{d['source_key']}"
        existing_sf_keys.add(key)
        existing_sf_lines.append(line.rstrip("\n"))

print(f"기존 source_facts: {len(existing_sf_lines)}건")

new_sf_entries = []
sf_dup_skip = 0

for p in plan:
    sf_key = f"{p['candidate_id']}|{p['source_key']}"
    if sf_key in existing_sf_keys:
        sf_dup_skip += 1
        continue

    det = en_detail[p["contentid"]]
    # candidate에서 district 추출 (source_fact 구조에 맞게)
    cand = cand_by_id[p["candidate_id"]]
    district = (cand.get("proposed_values", {}).get("district") or "").strip()

    sf_entry = {
        "candidate_id":    p["candidate_id"],
        "source_key":      p["source_key"],
        "source_provider": "kto",
        "source_language": "en",
        "title":           clean_title(html_mod.unescape(det["title_raw"])),
        "description":     det["overview_clean"],
        "address":         det["addr1"],
        "district":        district,
        "lat":             det["mapy"],
        "lng":             det["mapx"],
        "collected_at":    now_iso,
    }
    new_sf_entries.append(sf_entry)

print(f"source_facts 추가 예정: {len(new_sf_entries)}건")
print(f"source_facts 중복 skip: {sf_dup_skip}건")
assert len(new_sf_entries) + sf_dup_skip == EXPECTED_HC_COUNT, (
    f"source_facts 합계 불일치: {len(new_sf_entries)} + {sf_dup_skip} != {EXPECTED_HC_COUNT}"
)

# ─── Phase 7: 원자적 파일 저장 ────────────────────────────────────────────────
print("\n=== Phase 7: 원자적 파일 저장 ===")

# 7-1. candidates JSONL (.tmp → 검증 → replace)
candidates_tmp = CANDIDATES.with_suffix(".jsonl.tmp")
with open(candidates_tmp, "w", encoding="utf-8") as f:
    for c in new_candidates:
        f.write(json.dumps(c, ensure_ascii=False) + "\n")

# 검증: 줄 수
import os
tmp_lines = sum(1 for _ in open(candidates_tmp, encoding="utf-8"))
assert tmp_lines == EXPECTED_CANDIDATE_COUNT, (
    f"tmp 줄 수 불일치: {tmp_lines} != {EXPECTED_CANDIDATE_COUNT}"
)

os.replace(candidates_tmp, CANDIDATES)
print(f"candidates 저장 완료: {tmp_lines}건")

# 7-2. source_facts 추가 (append)
sf_tmp = SOURCE_FACTS.with_suffix(".jsonl.tmp")
all_sf_lines = existing_sf_lines[:]
for entry in new_sf_entries:
    all_sf_lines.append(json.dumps(entry, ensure_ascii=False))

with open(sf_tmp, "w", encoding="utf-8") as f:
    for line in all_sf_lines:
        f.write(line + "\n")

# 검증
sf_tmp_lines = sum(1 for _ in open(sf_tmp, encoding="utf-8"))
expected_sf = len(existing_sf_lines) + len(new_sf_entries)
assert sf_tmp_lines == expected_sf, (
    f"source_facts tmp 줄 수 불일치: {sf_tmp_lines} != {expected_sf}"
)

os.replace(sf_tmp, SOURCE_FACTS)
print(f"source_facts 저장 완료: {sf_tmp_lines}건 (+{len(new_sf_entries)})")

# ─── Phase 8: 결과 보고서 ─────────────────────────────────────────────────────
print("\n=== Phase 8: 결과 보고서 저장 ===")

# 적용 상세 목록
apply_details = []
for p in plan:
    det = en_detail[p["contentid"]]
    cand = cand_by_id[p["candidate_id"]]
    apply_details.append({
        "candidate_id":   p["candidate_id"],
        "contentid_en":   p["contentid"],
        "source_key":     p["source_key"],
        "distance_m":     p["distance_m"],
        "match_signals":  p["match_signals"],
        "desc_en_applied": p["apply_desc"],
        "name_en_applied": p["apply_name"],
        "new_desc_preview": (p["new_desc"] or "")[:100] if p["apply_desc"] else None,
        "new_name_applied": p["new_name"] if p["apply_name"] else None,
        "source_fact_added": p["source_key"] in {
            e["source_key"] for e in new_sf_entries if e["candidate_id"] == p["candidate_id"]
        },
    })

report = {
    "task": "TASK-KTO-EN-DETAIL-APPLY-V1",
    "created_at": now_iso,
    "verdict": "PASS",
    "inputs": {
        "hc_count": EXPECTED_HC_COUNT,
        "candidate_count_before": EXPECTED_CANDIDATE_COUNT,
        "source_facts_count_before": len(existing_sf_lines),
    },
    "applied": {
        "description_en_new":  actual_desc_new,
        "description_en_skip": desc_en_skip_count,
        "name_en_new":         actual_name_new,
        "name_en_skip":        name_en_skip_count,
        "source_facts_added":  len(new_sf_entries),
        "source_facts_skip":   sf_dup_skip,
        "provenance_updated":  EXPECTED_HC_COUNT,
        "source_summary_updated": EXPECTED_HC_COUNT,
    },
    "safety": {
        "overwrite_violations":     0,
        "candidate_total_after":    EXPECTED_CANDIDATE_COUNT,
        "source_facts_total_after": sf_tmp_lines,
        "other_candidates_modified": 0,
        "flags_modified":           0,
        "publishability_modified":  0,
        "image_applied":            0,
        "api_calls":                0,
        "data_modified":            True,
        "push":                     False,
    },
    "output_files": [
        str(CANDIDATES.relative_to(ROOT)),
        str(SOURCE_FACTS.relative_to(ROOT)),
    ],
    "apply_details": apply_details,
}

report_path = REPORTS_DIR / "kto-en-detail-apply-v1-report.json"
report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"보고서 저장: {report_path.name}")

print("\n=== 완료 ===")
print(f"description_en 신규 반영: {actual_desc_new}건")
print(f"description_en skip:      {desc_en_skip_count}건")
print(f"name_en 신규 반영:        {actual_name_new}건")
print(f"name_en skip:             {name_en_skip_count}건")
print(f"source_facts 추가:        {len(new_sf_entries)}건")
print(f"candidate 총수:           {EXPECTED_CANDIDATE_COUNT}건")
print(f"기존 값 overwrite:        0건")
print(f"API 호출:                 0건")
print(f"data_modified:            True")
print(f"push:                     False")
