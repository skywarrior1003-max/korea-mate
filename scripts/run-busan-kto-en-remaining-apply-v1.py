#!/usr/bin/env python3
"""
TASK-KTO-EN-REMAINING-APPLY-V1

kto-en-resolution-high-confidence.json 47건의 KTO 공식 영문 정보를
enriched candidates와 source facts에 반영한다.

적용 대상:
  - description_en (공식 overview, 기존 값 없을 때만)
  - name_en (공식 title_en, 기존 값 없을 때만)
  - source_summary.source_keys, kto_en_linked
  - provenance.kto_en_enrichment_remaining (신규 필드, 리스트)
  - source_facts 47건 추가 (EngService2:cid:en)

금지: 이미지·flags·publishability·번역문·기존 값 overwrite
"""
import copy
import json
import os
import re
import html as html_mod
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# ─── 경로 ────────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent

HC_MANIFEST  = ROOT / "data/tourapi/manifests/busan/kto-en-resolution-high-confidence.json"
EN_RAW_DIR   = ROOT / "data/tourapi/raw/kto/detailCommon2En/full"
CANDIDATES   = ROOT / "data/tourapi/enriched/busan/busan-enriched-candidates-v1.jsonl"
SOURCE_FACTS = ROOT / "data/tourapi/enriched/busan/busan-source-facts-v1.jsonl"
REPORTS_DIR  = ROOT / "data/tourapi/reports/busan"

TASK_ID               = "TASK-KTO-EN-REMAINING-APPLY-V1"
EXPECTED_HC_COUNT     = 47
EXPECTED_CAND_COUNT   = 1642
EXPECTED_SF_BEFORE    = 2668
EXPECTED_SF_AFTER     = 2715   # 2668 + 47
PROV_KEY              = "kto_en_enrichment_remaining"


# ─── 유틸리티 ─────────────────────────────────────────────────────────────────
def clean_overview(text: str) -> str:
    if not text:
        return ""
    text = html_mod.unescape(text)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def clean_title(text: str) -> str:
    if not text:
        return ""
    text = html_mod.unescape(text)
    cleaned = re.sub(r"\s*\([^)]*[가-힣][^)]*\)\s*$", "", text).strip()
    return cleaned if cleaned else text.strip()


# ─── Phase 0: 입력 검증 ──────────────────────────────────────────────────────
print("=== Phase 0: 입력 검증 ===")

hc_data = json.loads(HC_MANIFEST.read_text(encoding="utf-8"))
hc_records = hc_data["records"]

assert len(hc_records) == EXPECTED_HC_COUNT, (
    f"HC 건수 불일치: {len(hc_records)} != {EXPECTED_HC_COUNT}"
)
bad_verdict = [r for r in hc_records if r.get("resolution_verdict") != "HIGH_CONFIDENCE_LINK"]
assert not bad_verdict, f"HC가 아닌 판정 포함: {[r['contentid'] for r in bad_verdict]}"
no_cand = [r for r in hc_records if not r.get("candidate_id")]
assert not no_cand, f"candidate_id 없는 HC: {[r['contentid'] for r in no_cand]}"

# 중복 candidate_id 파악
from collections import Counter
cand_id_counts = Counter(r["candidate_id"] for r in hc_records)
dup_cands = {k: v for k, v in cand_id_counts.items() if v > 1}
print(f"HC manifest: {len(hc_records)}건, 판정 검증 PASS")
print(f"unique candidate_id: {len(cand_id_counts)}건  중복 쌍: {dup_cands}")

# ─── Phase 1: EN raw 로드 ────────────────────────────────────────────────────
print("\n=== Phase 1: EN raw 로드 ===")

hc_en_cids = {r["contentid"] for r in hc_records}
en_detail: dict = {}

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
        "contentid":      cid,
        "title_raw":      (item.get("title") or "").strip(),
        "title_clean":    clean_title(html_mod.unescape((item.get("title") or "").strip())),
        "overview_clean": clean_overview(item.get("overview") or ""),
        "addr1":          (item.get("addr1") or "").strip(),
        "mapx":           mapx,
        "mapy":           mapy,
        "cat1":           item.get("cat1", ""),
        "lclsSystm1":     item.get("lclsSystm1", ""),
    }

missing_raw = [r["contentid"] for r in hc_records if r["contentid"] not in en_detail]
assert not missing_raw, f"HC에 EN raw 없는 cid: {missing_raw}"
print(f"EN raw 로드: {len(en_detail)}건 PASS")

# ─── Phase 2: candidate 전체 로드 ────────────────────────────────────────────
print("\n=== Phase 2: candidate 전체 로드 ===")

all_candidates = []
with open(CANDIDATES, encoding="utf-8") as f:
    for line in f:
        all_candidates.append(json.loads(line))

assert len(all_candidates) == EXPECTED_CAND_COUNT, (
    f"candidate 수량 불일치: {len(all_candidates)} != {EXPECTED_CAND_COUNT}"
)
cand_by_id = {c["candidate_id"]: c for c in all_candidates}
print(f"candidate 로드: {len(all_candidates)}건 PASS")

# HC43과의 candidate 중복 없음 확인 (kto_en_enrichment 이미 있으면 문제)
for r in hc_records:
    cand = cand_by_id[r["candidate_id"]]
    prov = cand.get("provenance", {})
    if "kto_en_enrichment" in prov:
        raise AssertionError(
            f"{r['candidate_id']} 에 kto_en_enrichment 이미 존재 — HC43 중복 가능성"
        )
print("HC43 candidate 중복 없음 PASS")

# ─── Phase 3: candidate별 적용 계획 수립 ────────────────────────────────────
print("\n=== Phase 3: 적용 사항 계획 ===")

now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

# candidate_id → [hc_record, ...] 그룹핑 (중복 candidate 처리)
cand_to_hc: dict = defaultdict(list)
for r in hc_records:
    cand_to_hc[r["candidate_id"]].append(r)

# 계획 항목: candidate 단위
plan = []   # {candidate_id, entries:[{contentid, source_key, det, r}], apply_desc, apply_name, ...}

desc_new_count = 0
desc_skip_count = 0
name_new_count = 0
name_skip_count = 0

for cand_id, recs in cand_to_hc.items():
    cand = cand_by_id[cand_id]
    pv   = cand.get("proposed_values", {})

    existing_desc = (pv.get("description_en") or "").strip()
    existing_name = (pv.get("name_en") or "").strip()

    # 해당 candidate에 연결된 모든 EN 항목 수집
    entries = []
    for r in recs:
        det = en_detail[r["contentid"]]
        entries.append({
            "contentid":  r["contentid"],
            "source_key": f"EngService2:{r['contentid']}:en",
            "det":        det,
            "distance_m": r.get("distance_m"),
            "match_signals": r.get("match_signals", []),
            "resolution_reason": r.get("resolution_reason", ""),
        })

    # description_en: 첫 번째 유효한 overview 사용 (기존 값 없을 때만)
    apply_desc = False
    new_desc = None
    for e in entries:
        ov = e["det"]["overview_clean"]
        if ov:
            if not existing_desc:
                apply_desc = True
                new_desc = ov
                desc_new_count += 1
            else:
                desc_skip_count += 1
            break
    # 나머지 entries도 desc skip 카운트에 추가
    for e in entries[1:]:
        if e["det"]["overview_clean"]:
            desc_skip_count += 1

    # name_en: 첫 번째 유효한 title 사용 (기존 값 없을 때만)
    apply_name = False
    new_name = None
    for e in entries:
        t = e["det"]["title_clean"]
        if t:
            if not existing_name:
                apply_name = True
                new_name = t
                name_new_count += 1
            else:
                name_skip_count += 1
            break
    for e in entries[1:]:
        if e["det"]["title_clean"]:
            name_skip_count += 1

    plan.append({
        "candidate_id": cand_id,
        "entries":      entries,
        "apply_desc":   apply_desc,
        "new_desc":     new_desc,
        "apply_name":   apply_name,
        "new_name":     new_name,
    })

total_entries = sum(len(p["entries"]) for p in plan)
assert total_entries == EXPECTED_HC_COUNT, f"entries 합계 불일치: {total_entries}"
print(f"description_en 신규 반영 예정: {desc_new_count}건")
print(f"description_en skip:           {desc_skip_count}건")
print(f"name_en 신규 반영 예정:        {name_new_count}건")
print(f"name_en skip:                  {name_skip_count}건")
print(f"대상 candidate: {len(plan)}건 (HC {total_entries}건 from {len(plan)} unique candidates)")

# ─── Phase 4: source_facts 중복 사전 확인 ────────────────────────────────────
print("\n=== Phase 4: source_facts 중복 확인 ===")

existing_sf_keys: set = set()
existing_sf_lines: list = []
with open(SOURCE_FACTS, encoding="utf-8") as f:
    for line in f:
        d = json.loads(line)
        existing_sf_keys.add(f"{d['candidate_id']}|{d['source_key']}")
        existing_sf_lines.append(line.rstrip("\n"))

assert len(existing_sf_lines) == EXPECTED_SF_BEFORE, (
    f"source_facts before 불일치: {len(existing_sf_lines)} != {EXPECTED_SF_BEFORE}"
)
print(f"기존 source_facts: {len(existing_sf_lines)}건 PASS")

new_sf_entries = []
sf_dup_skip = 0
for p in plan:
    cand = cand_by_id[p["candidate_id"]]
    district = (cand.get("proposed_values", {}).get("district") or "").strip()
    for e in p["entries"]:
        sf_key = f"{p['candidate_id']}|{e['source_key']}"
        if sf_key in existing_sf_keys:
            sf_dup_skip += 1
            continue
        det = e["det"]
        new_sf_entries.append({
            "candidate_id":    p["candidate_id"],
            "source_key":      e["source_key"],
            "source_provider": "kto",
            "source_language": "en",
            "title":           clean_title(html_mod.unescape(det["title_raw"])),
            "description":     det["overview_clean"],
            "address":         det["addr1"],
            "district":        district,
            "lat":             det["mapy"],
            "lng":             det["mapx"],
            "collected_at":    now_iso,
        })

assert len(new_sf_entries) + sf_dup_skip == EXPECTED_HC_COUNT, (
    f"source_facts 합계 불일치: {len(new_sf_entries)} + {sf_dup_skip} != {EXPECTED_HC_COUNT}"
)
print(f"source_facts 신규: {len(new_sf_entries)}건, 중복 skip: {sf_dup_skip}건 PASS")

# ─── Phase 5: candidate 수정 ─────────────────────────────────────────────────
print("\n=== Phase 5: candidate 수정 ===")

overwrite_violations: list = []
modified_ids: set = set()
new_candidates: list = []

plan_by_cand = {p["candidate_id"]: p for p in plan}

for cand in all_candidates:
    cid_ = cand["candidate_id"]
    if cid_ not in plan_by_cand:
        new_candidates.append(cand)
        continue

    p  = plan_by_cand[cid_]
    c  = copy.deepcopy(cand)
    pv = c["proposed_values"]
    ss = c.get("source_summary", {})
    prov = c.get("provenance", {})

    # ── description_en ───────────────────────────────────────────────────────
    if p["apply_desc"]:
        existing = (pv.get("description_en") or "").strip()
        if existing:
            overwrite_violations.append(f"{cid_} description_en already set")
        else:
            pv["description_en"] = p["new_desc"]
            ss["has_en_description"] = True

    # ── name_en ──────────────────────────────────────────────────────────────
    if p["apply_name"]:
        existing = (pv.get("name_en") or "").strip()
        if existing:
            overwrite_violations.append(f"{cid_} name_en already set")
        else:
            pv["name_en"] = p["new_name"]

    # ── source_summary ────────────────────────────────────────────────────────
    current_keys = list(ss.get("source_keys") or [])
    for e in p["entries"]:
        if e["source_key"] not in current_keys:
            current_keys.append(e["source_key"])
    ss["source_keys"] = current_keys
    ss["source_key_count"] = len(current_keys)
    ss["kto_en_linked"] = True
    ss["has_english_source"] = True

    # ── provenance (새 키로 리스트 저장) ─────────────────────────────────────
    prov_entries = []
    for e in p["entries"]:
        applied_fields = []
        if p["apply_desc"] and e == p["entries"][0]:
            applied_fields.append("description_en")
        if p["apply_name"] and e == p["entries"][0]:
            applied_fields.append("name_en")
        prov_entries.append({
            "task":          TASK_ID,
            "contentid":     e["contentid"],
            "source_key":    e["source_key"],
            "applied_fields": applied_fields,
            "applied_at":    now_iso,
        })

    prov[PROV_KEY] = prov_entries if len(prov_entries) > 1 else prov_entries[0]

    c["proposed_values"] = pv
    c["source_summary"]  = ss
    c["provenance"]      = prov

    new_candidates.append(c)
    modified_ids.add(cid_)

assert not overwrite_violations, "기존 값 overwrite 감지!\n" + "\n".join(overwrite_violations)
print(f"기존 값 overwrite: 0 PASS")
print(f"수정된 candidate: {len(modified_ids)}건 (unique)")

# ─── Phase 6: 검증 ───────────────────────────────────────────────────────────
print("\n=== Phase 6: 검증 ===")

assert len(new_candidates) == EXPECTED_CAND_COUNT, (
    f"candidate 총수 변경: {len(new_candidates)} != {EXPECTED_CAND_COUNT}"
)
print(f"candidate 총수: {EXPECTED_CAND_COUNT}건 유지 PASS")

# 대상 외 후보 변경 없음
for c in new_candidates:
    if c["candidate_id"] not in modified_ids:
        orig = cand_by_id[c["candidate_id"]]
        if json.dumps(c, ensure_ascii=False, sort_keys=True) != json.dumps(orig, ensure_ascii=False, sort_keys=True):
            raise AssertionError(f"대상 외 candidate 변경됨: {c['candidate_id']}")
print(f"대상 외 후보 변경: 0 PASS ({EXPECTED_CAND_COUNT - len(modified_ids)}건 미수정)")

# flags/publishability/image_assessment 변경 없음
for cid_ in modified_ids:
    orig_c = cand_by_id[cid_]
    new_c  = next(c for c in new_candidates if c["candidate_id"] == cid_)
    if orig_c.get("validation") != new_c.get("validation"):
        raise AssertionError(f"{cid_} validation 변경됨!")
    if orig_c.get("image_assessment") != new_c.get("image_assessment"):
        raise AssertionError(f"{cid_} image_assessment 변경됨!")
print("flags/publishability 변경: 0 PASS")

# description_en / name_en 실제 반영 수 재확인
actual_desc = sum(1 for p in plan if p["apply_desc"])
actual_name = sum(1 for p in plan if p["apply_name"])
assert actual_desc == desc_new_count
assert actual_name == name_new_count
print(f"description_en 실제 반영: {actual_desc}건  skip: {desc_skip_count}건")
print(f"name_en 실제 반영:        {actual_name}건  skip: {name_skip_count}건")

# ─── Phase 7: 원자적 파일 저장 ──────────────────────────────────────────────
print("\n=== Phase 7: 파일 저장 ===")

# candidates JSONL
candidates_tmp = CANDIDATES.with_suffix(".jsonl.tmp")
with open(candidates_tmp, "w", encoding="utf-8") as f:
    for c in new_candidates:
        f.write(json.dumps(c, ensure_ascii=False) + "\n")
tmp_lines = sum(1 for _ in open(candidates_tmp, encoding="utf-8"))
assert tmp_lines == EXPECTED_CAND_COUNT, f"tmp 줄 수 불일치: {tmp_lines}"
os.replace(candidates_tmp, CANDIDATES)
print(f"candidates 저장 완료: {tmp_lines}건")

# source_facts JSONL
sf_tmp = SOURCE_FACTS.with_suffix(".jsonl.tmp")
all_sf_lines = existing_sf_lines[:]
for entry in new_sf_entries:
    all_sf_lines.append(json.dumps(entry, ensure_ascii=False))
with open(sf_tmp, "w", encoding="utf-8") as f:
    for line in all_sf_lines:
        f.write(line + "\n")
sf_tmp_lines = sum(1 for _ in open(sf_tmp, encoding="utf-8"))
assert sf_tmp_lines == EXPECTED_SF_AFTER, f"source_facts 줄 수 불일치: {sf_tmp_lines} != {EXPECTED_SF_AFTER}"
os.replace(sf_tmp, SOURCE_FACTS)
print(f"source_facts 저장 완료: {sf_tmp_lines}건 (+{len(new_sf_entries)})")

# ─── Phase 8: 보고서 ─────────────────────────────────────────────────────────
print("\n=== Phase 8: 보고서 저장 ===")

apply_details = []
for p in plan:
    for e in p["entries"]:
        sf_added = any(
            sf["candidate_id"] == p["candidate_id"] and sf["source_key"] == e["source_key"]
            for sf in new_sf_entries
        )
        apply_details.append({
            "candidate_id":     p["candidate_id"],
            "contentid_en":     e["contentid"],
            "source_key":       e["source_key"],
            "distance_m":       e["distance_m"],
            "match_signals":    e["match_signals"],
            "resolution_reason": e["resolution_reason"],
            "desc_en_applied":  p["apply_desc"] and e == p["entries"][0],
            "name_en_applied":  p["apply_name"] and e == p["entries"][0],
            "source_fact_added": sf_added,
        })

report = {
    "task":       TASK_ID,
    "created_at": now_iso,
    "verdict":    "PASS",
    "inputs": {
        "hc_count":                  EXPECTED_HC_COUNT,
        "unique_candidates_targeted": len(modified_ids),
        "candidate_count_before":    EXPECTED_CAND_COUNT,
        "source_facts_count_before": len(existing_sf_lines),
    },
    "applied": {
        "description_en_new":    actual_desc,
        "description_en_skip":   desc_skip_count,
        "name_en_new":           actual_name,
        "name_en_skip":          name_skip_count,
        "source_facts_added":    len(new_sf_entries),
        "source_facts_dup_skip": sf_dup_skip,
        "provenance_updated":    len(modified_ids),
    },
    "safety": {
        "overwrite_violations":      0,
        "candidate_total_after":     EXPECTED_CAND_COUNT,
        "source_facts_total_after":  sf_tmp_lines,
        "other_candidates_modified": 0,
        "flags_modified":            0,
        "publishability_modified":   0,
        "image_applied":             0,
        "api_calls":                 0,
        "push":                      False,
    },
    "output_files": [
        str(CANDIDATES.relative_to(ROOT)),
        str(SOURCE_FACTS.relative_to(ROOT)),
    ],
    "apply_details": apply_details,
}

REPORTS_DIR.mkdir(parents=True, exist_ok=True)
report_path = REPORTS_DIR / "kto-en-remaining-apply-v1-report.json"
report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"보고서 저장: {report_path.name}")

print("\n=== 완료 ===")
print(f"PASS")
print(f"description_en 신규 반영: {actual_desc}건")
print(f"description_en skip:      {desc_skip_count}건")
print(f"name_en 신규 반영:        {actual_name}건")
print(f"name_en skip:             {name_skip_count}건")
print(f"source_facts 추가:        {len(new_sf_entries)}건")
print(f"candidate 총수:           {EXPECTED_CAND_COUNT}건")
print(f"기존 값 overwrite:        0건")
print(f"대상 외 후보 변경:        0건")
print(f"API 호출:                 0건")
print(f"push:                     False")
