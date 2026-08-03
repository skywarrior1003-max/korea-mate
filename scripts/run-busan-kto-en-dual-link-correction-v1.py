#!/usr/bin/env python3
"""
TASK-KTO-EN-DUAL-LINK-CORRECTION-V1

busan-A-00022에 잘못 연결된 EngService2:2946924:en (해파랑길 1코스) 를 제거하고
EngService2:3468740:en (오륙도해맞이공원) 연결은 유지한다.

판정: ONE_CORRECT_ONE_MISLINKED
  - 2946924 (Haeparang Trail Course 1): MISLINKED → 미연결 manifest로 이동
  - 3468740 (Oryukdo Sunrise Park):     CORRECT  → 유지

변경:
  1. busan-enriched-candidates-v1.jsonl
     - busan-A-00022.source_summary.source_keys: 'EngService2:2946924:en' 제거
     - busan-A-00022.provenance.kto_en_enrichment_remaining: 2946924 항목 제거
  2. busan-source-facts-v1.jsonl
     - EngService2:2946924:en 행 제거 (2715 → 2714)
  3. kto-en-unlinked-no-candidate.json: 2946924 미연결 기록

금지: description_en/name_en 변경, 다른 candidate 변경, push
"""
import copy
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent

CANDIDATES   = ROOT / "data/tourapi/enriched/busan/busan-enriched-candidates-v1.jsonl"
SOURCE_FACTS = ROOT / "data/tourapi/enriched/busan/busan-source-facts-v1.jsonl"
MANIFEST_DIR = ROOT / "data/tourapi/manifests/busan"
REPORT_DIR   = ROOT / "data/tourapi/reports/busan"

TASK_ID              = "TASK-KTO-EN-DUAL-LINK-CORRECTION-V1"
TARGET_CAND_ID       = "busan-A-00022"
MISLINKED_CID        = "2946924"
CORRECT_CID          = "3468740"
MISLINKED_SOURCE_KEY = f"EngService2:{MISLINKED_CID}:en"
CORRECT_SOURCE_KEY   = f"EngService2:{CORRECT_CID}:en"

EXPECTED_CAND_TOTAL    = 1642
EXPECTED_SF_BEFORE     = 2715
EXPECTED_SF_AFTER      = 2714   # -1 (2946924 행 제거)

PROV_KEY = "kto_en_enrichment_remaining"


def main():
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # ── Phase 0: 입력 검증 ────────────────────────────────────────────────────
    print("=== Phase 0: 입력 검증 ===")

    all_candidates = []
    with open(CANDIDATES, encoding="utf-8") as f:
        for line in f:
            all_candidates.append(json.loads(line))
    assert len(all_candidates) == EXPECTED_CAND_TOTAL, \
        f"candidate 총수 불일치: {len(all_candidates)} != {EXPECTED_CAND_TOTAL}"
    cand_by_id = {c["candidate_id"]: c for c in all_candidates}

    target = cand_by_id.get(TARGET_CAND_ID)
    assert target, f"{TARGET_CAND_ID} 없음"

    ss   = target.get("source_summary", {})
    prov = target.get("provenance", {})
    pv   = target.get("proposed_values", {})

    # 오연결 source_key가 현재 등록되어 있어야 함
    current_keys = ss.get("source_keys", [])
    assert MISLINKED_SOURCE_KEY in current_keys, \
        f"{MISLINKED_SOURCE_KEY} 이미 없음 — 중복 실행?"
    assert CORRECT_SOURCE_KEY in current_keys, \
        f"{CORRECT_SOURCE_KEY} 없음 — 정상 연결 누락"

    # provenance에 두 항목이 모두 있어야 함
    prov_rem = prov.get(PROV_KEY)
    assert prov_rem, f"{PROV_KEY} 없음"
    if isinstance(prov_rem, dict):
        prov_entries = [prov_rem]
    else:
        prov_entries = prov_rem

    cids_in_prov = {e["contentid"] for e in prov_entries}
    assert MISLINKED_CID in cids_in_prov, f"provenance에 {MISLINKED_CID} 없음"
    assert CORRECT_CID in cids_in_prov, f"provenance에 {CORRECT_CID} 없음"

    # description_en / name_en 기록 (변경 없음 확인용)
    desc_en_before = (pv.get("description_en") or "").strip()
    name_en_before = (pv.get("name_en") or "").strip()
    print(f"  {TARGET_CAND_ID} 확인: source_keys={current_keys}")
    print(f"  provenance entries: {[e['contentid'] for e in prov_entries]}")
    print(f"  description_en[0:60]: {desc_en_before[:60]}")
    print(f"  name_en: {name_en_before}")

    # source_facts 로드
    sf_lines_before = []
    mislinked_sf = None
    with open(SOURCE_FACTS, encoding="utf-8") as f:
        for line in f:
            d = json.loads(line)
            if d.get("source_key") == MISLINKED_SOURCE_KEY and d.get("candidate_id") == TARGET_CAND_ID:
                mislinked_sf = d
            else:
                sf_lines_before.append(line.rstrip("\n"))

    assert len(sf_lines_before) == EXPECTED_SF_BEFORE - 1, \
        f"mislinked SF 발견 수 오류 — before 줄 수={len(sf_lines_before)+1}"
    assert mislinked_sf is not None, f"{MISLINKED_SOURCE_KEY} source_fact 없음"
    print(f"  mislinked source_fact 확인: {mislinked_sf['source_key']}")
    print(f"  source_facts before: {EXPECTED_SF_BEFORE}건 PASS")

    # ── Phase 1: candidate 수정 ────────────────────────────────────────────────
    print("\n=== Phase 1: candidate 수정 ===")

    new_candidates = []
    modified_count = 0

    for cand in all_candidates:
        if cand["candidate_id"] != TARGET_CAND_ID:
            new_candidates.append(cand)
            continue

        c  = copy.deepcopy(cand)
        ss_c   = c.get("source_summary", {})
        prov_c = c.get("provenance", {})
        pv_c   = c.get("proposed_values", {})

        # source_keys: MISLINKED 제거
        old_keys = list(ss_c.get("source_keys", []))
        new_keys = [k for k in old_keys if k != MISLINKED_SOURCE_KEY]
        assert CORRECT_SOURCE_KEY in new_keys, "CORRECT source_key 유실!"
        ss_c["source_keys"] = new_keys
        ss_c["source_key_count"] = len(new_keys)
        # kto_en_linked/has_english_source 유지 (3468740 여전히 연결)

        # provenance: MISLINKED 항목 제거
        prov_entries_orig = prov_c.get(PROV_KEY)
        if isinstance(prov_entries_orig, dict):
            prov_entries_list = [prov_entries_orig]
        else:
            prov_entries_list = list(prov_entries_orig)

        prov_entries_new = [e for e in prov_entries_list if e.get("contentid") != MISLINKED_CID]
        assert len(prov_entries_new) == 1, \
            f"prov_entries_new 수 오류: {len(prov_entries_new)}"
        assert prov_entries_new[0]["contentid"] == CORRECT_CID

        # 단일 항목이면 object로, 복수면 list로 (일관성 유지)
        prov_c[PROV_KEY] = prov_entries_new[0]

        # description_en / name_en 변경 없음 확인
        assert (pv_c.get("description_en") or "").strip() == desc_en_before
        assert (pv_c.get("name_en") or "").strip() == name_en_before

        c["source_summary"] = ss_c
        c["provenance"]     = prov_c

        new_candidates.append(c)
        modified_count += 1

    assert modified_count == 1, f"수정 candidate 수 오류: {modified_count}"
    print(f"  {TARGET_CAND_ID} 수정 완료")

    # ── Phase 2: 검증 ─────────────────────────────────────────────────────────
    print("\n=== Phase 2: 검증 ===")

    assert len(new_candidates) == EXPECTED_CAND_TOTAL, \
        f"candidate 총수 변경: {len(new_candidates)}"
    print(f"  candidate 총수: {EXPECTED_CAND_TOTAL}건 유지 PASS")

    # 다른 candidate 변경 없음
    cand_by_id_new = {c["candidate_id"]: c for c in new_candidates}
    for cid, orig in cand_by_id.items():
        if cid == TARGET_CAND_ID:
            continue
        new = cand_by_id_new[cid]
        if json.dumps(new, ensure_ascii=False, sort_keys=True) != json.dumps(orig, ensure_ascii=False, sort_keys=True):
            raise AssertionError(f"대상 외 candidate 변경됨: {cid}")
    print(f"  대상 외 candidate 변경: 0 PASS")

    # 수정된 candidate 확인
    fixed = cand_by_id_new[TARGET_CAND_ID]
    fixed_ss = fixed["source_summary"]
    fixed_prov = fixed["provenance"]
    fixed_pv   = fixed["proposed_values"]

    assert MISLINKED_SOURCE_KEY not in fixed_ss["source_keys"], "MISLINKED 여전히 있음!"
    assert CORRECT_SOURCE_KEY in fixed_ss["source_keys"], "CORRECT 유실!"
    assert fixed_prov[PROV_KEY]["contentid"] == CORRECT_CID, "provenance contentid 오류!"
    assert (fixed_pv.get("description_en") or "").strip() == desc_en_before
    assert (fixed_pv.get("name_en") or "").strip() == name_en_before

    print(f"  수정 후 source_keys: {fixed_ss['source_keys']}")
    print(f"  수정 후 provenance contentid: {fixed_prov[PROV_KEY]['contentid']}")
    print(f"  description_en 변경: 0 PASS")
    print(f"  name_en 변경: 0 PASS")

    # flags/publishability
    orig_t = cand_by_id[TARGET_CAND_ID]
    if orig_t.get("validation") != fixed.get("validation"):
        raise AssertionError("validation 변경됨!")
    if orig_t.get("image_assessment") != fixed.get("image_assessment"):
        raise AssertionError("image_assessment 변경됨!")
    print("  flags/publishability 변경: 0 PASS")

    # ── Phase 3: 원자적 파일 저장 ─────────────────────────────────────────────
    print("\n=== Phase 3: 파일 저장 ===")

    # candidates
    cand_tmp = CANDIDATES.with_suffix(".jsonl.tmp")
    with open(cand_tmp, "w", encoding="utf-8") as f:
        for c in new_candidates:
            f.write(json.dumps(c, ensure_ascii=False) + "\n")
    tmp_lines = sum(1 for _ in open(cand_tmp, encoding="utf-8"))
    assert tmp_lines == EXPECTED_CAND_TOTAL
    os.replace(cand_tmp, CANDIDATES)
    print(f"  candidates 저장: {tmp_lines}건")

    # source_facts (mislinked 행 제거)
    sf_tmp = SOURCE_FACTS.with_suffix(".jsonl.tmp")
    with open(sf_tmp, "w", encoding="utf-8") as f:
        for line in sf_lines_before:
            f.write(line + "\n")
    sf_tmp_lines = sum(1 for _ in open(sf_tmp, encoding="utf-8"))
    assert sf_tmp_lines == EXPECTED_SF_AFTER, \
        f"source_facts 줄 수 불일치: {sf_tmp_lines} != {EXPECTED_SF_AFTER}"
    os.replace(sf_tmp, SOURCE_FACTS)
    print(f"  source_facts 저장: {sf_tmp_lines}건 (-1)")

    # ── Phase 4: 미연결 manifest ──────────────────────────────────────────────
    print("\n=== Phase 4: 미연결 manifest 기록 ===")

    MANIFEST_DIR.mkdir(parents=True, exist_ok=True)
    unlinked_path = MANIFEST_DIR / "kto-en-unlinked-no-candidate.json"

    # 기존 파일 있으면 병합
    existing_unlinked = []
    if unlinked_path.exists():
        ex = json.loads(unlinked_path.read_text(encoding="utf-8"))
        existing_unlinked = ex.get("records", [])

    # 중복 방지
    existing_cids = {r["contentid"] for r in existing_unlinked}
    new_unlinked_entries = existing_unlinked[:]
    if MISLINKED_CID not in existing_cids:
        new_unlinked_entries.append({
            "contentid":           MISLINKED_CID,
            "title_en":            "Haeparang Trail Course 1 (해파랑길 1코스)",
            "original_verdict":    "MANUAL_REVIEW_LINK",
            "resolution_verdict":  "HIGH_CONFIDENCE_LINK",
            "corrected_verdict":   "NO_SUITABLE_CANDIDATE",
            "was_linked_to":       TARGET_CAND_ID,
            "correction_reason":   "trail_course_not_same_as_islets: 오륙도 islets와 별개 관광 객체. 좌표 근접만으로 연결, 해파랑길 1코스 전용 candidate 없음.",
            "removed_source_key":  MISLINKED_SOURCE_KEY,
            "removed_at":          now_iso,
            "task":                TASK_ID,
        })

    unlinked_obj = {
        "task":       TASK_ID,
        "updated_at": now_iso,
        "description": "EN KTO contents with no suitable candidate — awaiting dedicated candidate creation",
        "count":      len(new_unlinked_entries),
        "records":    new_unlinked_entries,
    }
    ul_tmp = str(unlinked_path) + ".tmp"
    with open(ul_tmp, "w", encoding="utf-8") as f:
        json.dump(unlinked_obj, f, ensure_ascii=False, indent=2)
    os.replace(ul_tmp, str(unlinked_path))
    print(f"  {unlinked_path.name}: {len(new_unlinked_entries)}건")

    # ── Phase 5: 보고서 ───────────────────────────────────────────────────────
    print("\n=== Phase 5: 보고서 ===")

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    report = {
        "task":       TASK_ID,
        "created_at": now_iso,
        "verdict":    "PASS",
        "final_judgment": "ONE_CORRECT_ONE_MISLINKED",
        "target_candidate": TARGET_CAND_ID,
        "decisions": {
            CORRECT_CID: {
                "title_en": "Oryukdo Sunrise Park (오륙도해맞이공원)",
                "action":   "RETAINED",
                "reason":   "VE-category park at Oryukdo promontory (63m). Same physical area as Oryukdo Islets.",
            },
            MISLINKED_CID: {
                "title_en": "Haeparang Trail Course 1 (해파랑길 1코스)",
                "action":   "REMOVED_FROM_CANDIDATE",
                "reason":   "LS-category trail starting at Oryukdo, extending 18km to Mipo (Haeundae). Different tourism object from islets/park. No suitable dedicated candidate.",
                "moved_to": str(unlinked_path.relative_to(ROOT)),
            },
        },
        "changes": {
            "source_keys_removed": [MISLINKED_SOURCE_KEY],
            "source_keys_retained": [CORRECT_SOURCE_KEY],
            "provenance_entries_removed": 1,
            "provenance_entries_retained": 1,
            "source_facts_removed": 1,
            "description_en_changed": 0,
            "name_en_changed": 0,
        },
        "safety": {
            "candidate_total_after":     EXPECTED_CAND_TOTAL,
            "source_facts_before":       EXPECTED_SF_BEFORE,
            "source_facts_after":        EXPECTED_SF_AFTER,
            "other_candidates_modified": 0,
            "flags_modified":            0,
            "publishability_modified":   0,
            "api_calls":                 0,
            "push":                      False,
        },
        "output_files": [
            str(CANDIDATES.relative_to(ROOT)),
            str(SOURCE_FACTS.relative_to(ROOT)),
            str(unlinked_path.relative_to(ROOT)),
        ],
    }

    report_path = REPORT_DIR / "kto-en-dual-link-correction-v1-report.json"
    rep_tmp = str(report_path) + ".tmp"
    with open(rep_tmp, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    os.replace(rep_tmp, str(report_path))
    print(f"  보고서: {report_path.name}")

    print("\n=== 완료 ===")
    print(f"PASS")
    print(f"최종 판정: ONE_CORRECT_ONE_MISLINKED")
    print(f"  3468740 (Oryukdo Sunrise Park) → {TARGET_CAND_ID}: RETAINED")
    print(f"  2946924 (Haeparang Trail Course 1) → REMOVED (미연결 manifest 이동)")
    print(f"source_facts: {EXPECTED_SF_BEFORE} → {EXPECTED_SF_AFTER} (-1)")
    print(f"candidate 총수: {EXPECTED_CAND_TOTAL}건 유지")
    print(f"description_en/name_en 변경: 0건")
    print(f"대상 외 candidate 변경: 0건")


if __name__ == "__main__":
    main()
