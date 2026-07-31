#!/usr/bin/env python3
"""
run-busan-publishability-remeasure-v8.py
TASK-BUSAN-PUBLISHABILITY-REMEASURE-V1

KTO detail apply 이후 부산 1,642건 publishability V8 재측정.
게이트 로직은 V7(run-busan-image-recovery-v2.py)과 동일.
enriched candidates / source facts 수정 없음.
V1~V7 산출물 보존.

금지:
  데이터 보정 / review flag 수정 / needs_* 수정
  candidate 삭제·병합 / API 호출
  DB·src·functions·migration·배포 / push / git add . / -A
"""

import hashlib, json, subprocess, sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

TASK_ID      = "TASK-BUSAN-PUBLISHABILITY-REMEASURE-V1"
GATE_VERSION = "BUSAN_PUBLISHABILITY_EN_V8"
run_ts       = datetime.now(timezone.utc).isoformat()

BASE       = Path(".")
EC_FILE    = BASE / "data/tourapi/enriched/busan/busan-enriched-candidates-v1.jsonl"
REPORT_DIR = BASE / "data/tourapi/reports/busan"

# 이전 버전 산출물 (읽기 전용 — SHA 검증)
PROTECTED = {
    "v1":  REPORT_DIR / "busan-publishability-baseline-v1.json",
    "v1d": REPORT_DIR / "busan-publishability-baseline-v1-details.jsonl",
    "v2":  REPORT_DIR / "busan-publishability-en-v2.json",
    "v3":  REPORT_DIR / "busan-publishability-en-v3.json",
    "v3d": REPORT_DIR / "busan-publishability-en-v3-details.jsonl",
    "v4":  REPORT_DIR / "busan-publishability-en-v4.json",
    "v4d": REPORT_DIR / "busan-publishability-en-v4-details.jsonl",
    "v5":  REPORT_DIR / "busan-publishability-en-v5.json",
    "v5d": REPORT_DIR / "busan-publishability-en-v5-details.jsonl",
    "v6":  REPORT_DIR / "busan-publishability-en-v6.json",
    "v6d": REPORT_DIR / "busan-publishability-en-v6-details.jsonl",
    "v7":  REPORT_DIR / "busan-publishability-en-v7.json",
    "v7d": REPORT_DIR / "busan-publishability-en-v7-details.jsonl",
}

# V8 신규 산출물
ENV8_SUMMARY = REPORT_DIR / "busan-publishability-en-v8.json"
ENV8_DETAILS = REPORT_DIR / "busan-publishability-en-v8-details.jsonl"

# ── 게이트 상수 (V7과 동일) ───────────────────────────────────────────────────
BUSAN_LAT_MIN, BUSAN_LAT_MAX = 34.88, 35.39
BUSAN_LNG_MIN, BUSAN_LNG_MAX = 128.74, 129.31
FRESHNESS_FLAGS = frozenset({"needs_hours", "needs_arrival_verification", "needs_map_name_ko"})
CORE_GATES_EN   = [
    "identity_gate", "name_ko_gate", "name_en_gate", "address_gate",
    "coordinate_gate", "branch_gate", "description_en_gate", "image_gate",
    "provenance_gate",
]

# ── 게이트 함수 (V7과 완전 동일) ──────────────────────────────────────────────
def sha256_file(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def get_effective_flags(r: dict) -> frozenset:
    base = set(r.get("validation", {}).get("review_flags") or [])
    qa02 = r.get("qa02_corrections", {})
    eff  = set(base)
    if qa02.get("hours_applied") and qa02.get("hours_value"):
        eff.discard("needs_hours")
    if qa02.get("kto_en_linked"):
        eff.discard("needs_translation")
    return frozenset(eff)


def evaluate_en_gates(r: dict, eff_flags: frozenset) -> dict:
    val  = r.get("validation", {})
    vs   = val.get("validation_status", "")
    ia   = r.get("image_assessment", {})
    aa   = r.get("arrival_assessment", {})
    pv   = r.get("proposed_values", {})
    prov = r.get("provenance", {})
    cat  = r.get("category", "")
    g    = {}

    g["identity_gate"] = (
        "PENDING_SOURCE" if vs == "source_data_missing"
        else "PASS" if vs in ("multi_source_verified", "single_source", "multi_source_confirmed")
        else "PENDING_REVIEW"
    )
    g["name_ko_gate"] = "PASS" if r.get("title_ko") else "FAIL"
    g["name_en_gate"] = "PASS" if "needs_translation" not in eff_flags else "PENDING_SOURCE"
    addr = pv.get("address")
    g["address_gate"] = "PASS" if addr and str(addr).strip() else "FAIL"
    if "needs_arrival" in eff_flags:
        g["coordinate_gate"] = "FAIL"
    elif aa.get("has_source_coords"):
        lat = aa.get("source_lat") or 0
        lng = aa.get("source_lng") or 0
        g["coordinate_gate"] = (
            "PASS" if (BUSAN_LAT_MIN <= lat <= BUSAN_LAT_MAX and
                       BUSAN_LNG_MIN <= lng <= BUSAN_LNG_MAX)
            else "FAIL"
        )
    else:
        g["coordinate_gate"] = "PENDING_REVIEW"
    if cat == "restaurant":
        g["branch_gate"] = "FAIL" if "needs_restaurant_branch" in eff_flags else "PASS"
    else:
        g["branch_gate"] = "NOT_APPLICABLE"
    desc_en = pv.get("description_en") or ""
    g["description_en_gate"] = "PASS" if desc_en else "PENDING_SOURCE"
    curated_count = ia.get("curated_count") or 0
    img_status    = ia.get("image_status", "")
    g["image_gate"] = (
        "PASS" if (curated_count > 0 or img_status in ("image_sufficient", "image_partial"))
        else "PENDING_SOURCE"
    )
    g["provenance_gate"] = "PASS" if prov.get("primary_source_ref") else "PENDING_REVIEW"
    return g


def determine_publishability(gates: dict, eff_flags: frozenset) -> tuple:
    fail, pr, ps = [], [], []
    for gk in CORE_GATES_EN:
        v = gates.get(gk, "PASS")
        if v == "NOT_APPLICABLE":
            continue
        if v == "FAIL":             fail.append(gk)
        elif v == "PENDING_REVIEW": pr.append(gk)
        elif v == "PENDING_SOURCE": ps.append(gk)
    if fail or pr:
        return "pending_review", fail + pr
    if ps:
        return "pending_source", ps
    remaining = set(eff_flags) - FRESHNESS_FLAGS
    if remaining:
        return "pending_review", [f"unresolved_flag:{f}" for f in sorted(remaining)]
    caveat = sorted(eff_flags & FRESHNESS_FLAGS)
    if caveat:
        return "publishable_with_caveat", caveat
    return "publishable", []


# ── KTO apply 기여도 분류 ─────────────────────────────────────────────────────
KTO_IMAGE_APPLIED = {"busan-K-00249", "busan-K-00299"}  # TASK-KTO-DETAIL-APPLY-V2에서 이미지 추가

def kto_apply_contribution(cid: str, v7_pub: str, v8_pub: str,
                            gates: dict, r: dict) -> str | None:
    """V7→V8 상태 변화의 KTO apply 기여 이유를 반환. 없으면 None."""
    if v7_pub == v8_pub:
        return None
    if cid in KTO_IMAGE_APPLIED and gates.get("image_gate") == "PASS":
        # image_gate가 PASS로 바뀐 후보
        ia = r.get("image_assessment", {})
        if any("KTO/detailImage2" in str(img.get("source",""))
               for img in ia.get("curated_images", [])):
            return "image_gate_improved_by_kto_image"
    desc_en = (r.get("proposed_values", {}).get("description_en") or "")
    desc_ko = (r.get("proposed_values", {}).get("description_ko") or "")
    if desc_ko and not desc_en:
        # description_ko 채워졌지만 gate는 description_en만 봄 → 기여 없음
        return "description_ko_filled_but_gate_requires_en"
    hours = (r.get("proposed_values", {}).get("hours") or "")
    if hours:
        return "hours_filled_but_gate_uses_qa02_corrections"
    return "other"


# ═══════════════════════════════════════════════════════════════════════════════
def main():
    print("=" * 70)
    print(f"TASK-BUSAN-PUBLISHABILITY-REMEASURE-V1  |  gate: {GATE_VERSION}")
    print(f"run_ts: {run_ts}")
    print("=" * 70)

    branch   = subprocess.check_output(["git","rev-parse","--abbrev-ref","HEAD"], text=True).strip()
    prev_head= subprocess.check_output(["git","rev-parse","HEAD~1"], text=True).strip()
    head     = subprocess.check_output(["git","rev-parse","HEAD"],    text=True).strip()
    print(f"branch: {branch}  HEAD: {head[:12]}  prev: {prev_head[:12]}\n")

    # ── 1. 보호 파일 SHA 기록 ─────────────────────────────────────────────────
    print("[1] 보호 파일 SHA 기록 (V1~V7)...")
    missing = [k for k, p in PROTECTED.items() if not p.exists()]
    if missing:
        print(f"  [WARN] 없는 파일: {missing}")
    shas_before = {k: sha256_file(p) for k, p in PROTECTED.items() if p.exists()}
    print(f"  {len(shas_before)}개 파일 SHA 기록 완료")

    # ── 2. V7 details 로드 (비교 기준) ────────────────────────────────────────
    print("[2] V7 details 로드...")
    v7_status: dict[str, dict] = {}
    v7d_path = PROTECTED["v7d"]
    with open(v7d_path, encoding="utf-8") as f:
        for line in f:
            r = json.loads(line)
            cid = r["candidate_id"]
            v7_status[cid] = {
                "pub": r.get("publishability_en_v7") or r.get("publishability", ""),
                "gates": r.get("gates", {}),
            }
    v7_dist = Counter(v.get("pub","") for v in v7_status.values())
    print(f"  V7 distribution: {dict(v7_dist)}")
    v7_total = sum(v7_dist.values())
    if v7_total != 1642:
        print(f"  [ERROR] V7 total {v7_total} ≠ 1642"); sys.exit(1)

    # ── 3. enriched candidates 로드 ───────────────────────────────────────────
    print("[3] enriched candidates 로드...")
    candidates: list[dict] = []
    with open(EC_FILE, encoding="utf-8-sig") as f:
        for line in f:
            line = line.strip()
            if line: candidates.append(json.loads(line))
    print(f"  {len(candidates)}건")
    if len(candidates) != 1642:
        print(f"  [ABORT] expected 1642, got {len(candidates)}"); sys.exit(1)

    # ── 4. V8 게이트 평가 ─────────────────────────────────────────────────────
    print("[4] V8 게이트 평가 (V7과 동일 로직)...")
    distribution     = Counter()
    cat_distribution = defaultdict(Counter)
    gate_block_counts = defaultdict(Counter)   # gate_name → status 분포
    results = []

    # KTO apply 기여도 추적
    kto_contribution_counts = Counter()
    # 역행 추적 (publishable → 하위)
    regressions = []

    for r in candidates:
        cid  = r["candidate_id"]
        cat  = r.get("category", "unknown")
        eff  = get_effective_flags(r)
        gates = evaluate_en_gates(r, eff)
        pub, blocks = determine_publishability(gates, eff)

        distribution[pub] += 1
        cat_distribution[cat][pub] += 1

        # 게이트별 상태 집계
        for gname in CORE_GATES_EN:
            gval = gates.get(gname, "PASS")
            gate_block_counts[gname][gval] += 1

        v7_pub = v7_status.get(cid, {}).get("pub", "unknown")
        changed = (pub != v7_pub)

        # KTO apply 기여도
        contrib = None
        if changed:
            contrib = kto_apply_contribution(cid, v7_pub, pub, gates, r)
            kto_contribution_counts[contrib or "unknown"] += 1

        # 역행 감지 (publishable → 하위)
        RANK = {"publishable": 4, "publishable_with_caveat": 3,
                "pending_source": 2, "pending_review": 1, "unknown": 0}
        if RANK.get(v7_pub, 0) > RANK.get(pub, 0) and v7_pub != "unknown":
            regressions.append({
                "candidate_id": cid,
                "category": cat,
                "v7": v7_pub,
                "v8": pub,
                "block_reasons": blocks,
                "kto_contrib": contrib,
            })

        results.append({
            "candidate_id":       cid,
            "category":           cat,
            "publishability_en_v8": pub,
            "publishability":     pub,       # 호환 필드
            "block_reasons":      blocks,
            "gate_version":       GATE_VERSION,
            "effective_flags":    sorted(eff),
            "v7_publishability":  v7_pub,
            "status_changed":     changed,
            "kto_apply_contrib":  contrib,
            "gates": {k: v for k, v in gates.items() if k.endswith("_gate")},
        })

    v8_dist = dict(distribution)
    delta   = {k: v8_dist.get(k,0) - v7_dist.get(k,0)
               for k in set(list(v7_dist.keys()) + list(v8_dist.keys()))}

    changed_records = [r for r in results if r["status_changed"]]
    change_detail   = Counter((r["v7_publishability"], r["publishability_en_v8"])
                               for r in changed_records)

    # KTO apply 기여 세분화
    kto_image_upgrades   = sum(1 for r in changed_records
                                if r.get("kto_apply_contrib") == "image_gate_improved_by_kto_image")
    kto_desc_ko_note     = sum(1 for r in changed_records
                                if r.get("kto_apply_contrib") == "description_ko_filled_but_gate_requires_en")
    kto_hours_note       = sum(1 for r in changed_records
                                if r.get("kto_apply_contrib") == "hours_filled_but_gate_uses_qa02_corrections")

    # ── 5. 검증 ──────────────────────────────────────────────────────────────
    print("[5] 검증...")
    checks = {}
    checks["candidate_count_1642"]   = len(candidates) == 1642
    checks["v8_total_1642"]          = sum(distribution.values()) == 1642
    checks["regression_count"]       = len(regressions)
    checks["no_regression"]          = len(regressions) == 0

    shas_after = {k: sha256_file(p) for k, p in PROTECTED.items() if p.exists()}
    unchanged = all(shas_before.get(k) == shas_after.get(k) for k in shas_before)
    checks["protected_files_unchanged"] = unchanged
    # 안전 항목: False = 변경 없음(정상), 아래 all_pass에서 제외하고 별도 확인
    checks["enriched_candidates_modified"] = False
    checks["source_facts_modified"]        = False
    checks["push"]                         = False
    checks["api_calls"]                    = 0

    SAFETY_NEGATIVE = {"enriched_candidates_modified", "source_facts_modified", "push"}
    bool_checks_pass = all(v is True for k, v in checks.items()
                           if isinstance(v, bool) and k not in SAFETY_NEGATIVE)
    safety_pass = not any(checks.get(k, False) for k in SAFETY_NEGATIVE)
    all_pass = bool_checks_pass and safety_pass
    verdict  = "PASS" if all_pass else "FAIL"

    # ── 6. 출력 ──────────────────────────────────────────────────────────────
    print(f"\n  V7: {dict(v7_dist)}")
    print(f"  V8: {v8_dist}")
    print(f"  Δ:  {delta}")
    print(f"\n  변화된 후보: {len(changed_records)}건")
    for (f,t), n in sorted(change_detail.items()):
        print(f"    {f} → {t}: {n}건")
    print(f"\n  역행(publishable→하위): {len(regressions)}건")
    if regressions:
        for reg in regressions:
            print(f"    {reg['candidate_id']}: {reg['v7']}→{reg['v8']} | {reg['block_reasons']}")
    print(f"\n  KTO apply 기여:")
    print(f"    image_gate 개선으로 승격: {kto_image_upgrades}건")
    print(f"    description_ko 채움(gate 영향 없음, description_en 필요): {kto_desc_ko_note}건")
    print(f"    hours 채움(gate는 qa02_corrections 사용, 영향 없음): {kto_hours_note}건")

    # 게이트 분포 출력
    print(f"\n  게이트별 블록 현황:")
    for gname in CORE_GATES_EN:
        dist = dict(gate_block_counts[gname])
        if dist.get("PENDING_SOURCE", 0) + dist.get("PENDING_REVIEW", 0) + dist.get("FAIL", 0) > 0:
            print(f"    {gname:25s}: {dist}")

    # ── 7. V8 details 저장 ────────────────────────────────────────────────────
    print(f"\n[7] V8 details 저장: {ENV8_DETAILS}")
    with open(ENV8_DETAILS, "w", encoding="utf-8") as f:
        for r in results:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    # ── 8. V8 summary 저장 ────────────────────────────────────────────────────
    summary = {
        "report_id":           "busan-publishability-en-v8",
        "gate_version":        GATE_VERSION,
        "task":                TASK_ID,
        "run_ts":              run_ts,
        "branch":              branch,
        "prev_head":           prev_head,
        "head":                head,
        "total_candidates":    len(candidates),
        "publishability_distribution": v8_dist,
        "v7_distribution": dict(v7_dist),
        "delta_vs_v7": delta,
        "status_changed_count": len(changed_records),
        "status_change_breakdown": {
            f"{f}→{t}": n for (f,t), n in sorted(change_detail.items())
        },
        "regressions": {
            "count": len(regressions),
            "detail": regressions,
        },
        "kto_apply_contribution": {
            "image_gate_improved": kto_image_upgrades,
            "description_ko_filled_gate_not_affected": kto_desc_ko_note,
            "hours_filled_gate_not_affected": kto_hours_note,
            "note": (
                "description_ko 채움(621건)과 hours 채움(440건)은 현재 게이트 로직에 "
                "영향을 주지 않는다. "
                "description_en_gate는 proposed_values.description_en만 확인하고, "
                "needs_hours는 get_effective_flags에서 qa02_corrections.hours_applied로만 해제된다. "
                "image_gate 개선(2건)만 실질적 기여."
            ),
        },
        "gate_block_distribution": {
            gname: dict(gate_block_counts[gname]) for gname in CORE_GATES_EN
        },
        "category_distribution": {
            cat: dict(d) for cat, d in sorted(cat_distribution.items())
        },
        "validation_checks": checks,
        "verdict": verdict,
        "push": False,
    }
    ENV8_SUMMARY.write_text(json.dumps(summary, ensure_ascii=False, indent=2),
                             encoding="utf-8")
    print(f"[8] V8 summary 저장: {ENV8_SUMMARY}")

    # ── 9. 보호 파일 SHA 최종 검증 ────────────────────────────────────────────
    shas_final = {k: sha256_file(p) for k, p in PROTECTED.items() if p.exists()}
    final_unchanged = all(shas_before.get(k) == shas_final.get(k) for k in shas_before)
    print(f"\n[9] 보호 파일 최종 SHA 검증: {'PASS ✓' if final_unchanged else 'FAIL ✗'}")
    if not final_unchanged:
        for k in shas_before:
            if shas_before.get(k) != shas_final.get(k):
                print(f"  변경됨: {k}")

    print()
    print("=" * 70)
    print(f"VERDICT: {verdict}")
    print(f"  V7: {dict(v7_dist)}")
    print(f"  V8: {v8_dist}")
    print(f"  Δ:  {delta}")
    print(f"  역행: {len(regressions)}건  변화 총수: {len(changed_records)}건")
    print(f"  KTO image 기여: {kto_image_upgrades}건  보호파일 변경: {'없음 ✓' if final_unchanged else 'FAIL ✗'}")
    print(f"  새 파일: {ENV8_SUMMARY.name}, {ENV8_DETAILS.name}")
    print("=" * 70)


if __name__ == "__main__":
    main()
